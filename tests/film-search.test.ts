import test from 'node:test';
import assert from 'node:assert/strict';
import { createTmdbClient } from '../app/lib/tmdb.server.ts';
import { createFilmSearchGet } from '../app/lib/film-search-route.ts';
import { parseFilmSearchResults } from '../app/lib/film-search.ts';

test('lookup distinguishes remakes, rejects incomplete identities and keeps credentials private', async () => {
  const client = createTmdbClient({ token: 'private-token', fetchImpl: (async (url, init) => {
    const requestUrl = new URL(String(url));
    assert.equal(requestUrl.searchParams.get('query'), 'Suspiria');
    assert.equal(requestUrl.searchParams.get('include_adult'), 'false');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer private-token');
    assert.ok(!String(url).includes('private-token'));
    return Response.json({ results: [
      { id: 1, title: 'Suspiria', release_date: '1977-02-01', poster_path: '/one.jpg' },
      { id: 2, title: 'Suspiria', release_date: '2018-10-26', poster_path: '/two.jpg' },
      { id: 3, title: 'Undated', release_date: '' },
      { id: 4, title: 'Excluded', release_date: '2000-01-01', adult: true },
      { id: 1, title: 'Duplicate', release_date: '1977-02-01' },
    ] });
  }) as typeof fetch });
  const films = await client.searchFilms('Suspiria');
  assert.deepEqual(films.map(({ title, year }) => ({ title, year })), [{ title: 'Suspiria', year: '1977' }, { title: 'Suspiria', year: '2018' }]);
  assert.equal(films[0].posterUrl, 'https://image.tmdb.org/t/p/w500/one.jpg');
  assert.equal(JSON.stringify(films).includes('private-token'), false);
  assert.equal(parseFilmSearchResults([{ ...films[0], posterUrl: 'https://untrusted.example/x.jpg' }])[0].posterUrl, null);
});

test('search route bounds requests, reports empty results, and hides provider errors', async () => {
  let calls = 0;
  const handler = createFilmSearchGet({ getToken: () => 'private', createClient: () => ({ searchFilms: async query => {
    calls++; if (query === 'Fail') throw new Error('secret upstream error private'); return [];
  } }) });
  for (const q of ['', 'a', 'x'.repeat(161)]) assert.equal((await handler(new Request('https://site/api/films/search?q='+q))).status, 400);
  assert.equal(calls, 0);
  const empty = await handler(new Request('https://site/api/films/search?q=Unknown'));
  assert.deepEqual(await empty.json(), { films: [] });
  assert.equal(empty.headers.get('cache-control'), 'no-store');
  const failed = await handler(new Request('https://site/api/films/search?q=Fail'));
  assert.equal(failed.status, 502);
  assert.doesNotMatch(await failed.text(), /private|secret/);
  const unconfigured = createFilmSearchGet({ getToken: () => '', createClient: () => { throw Error('Should not call'); } });
  assert.equal((await unconfigured(new Request('https://site/api/films/search?q=Cure'))).status, 503);
});
