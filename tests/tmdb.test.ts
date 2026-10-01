import test from 'node:test';
import assert from 'node:assert/strict';

import { createTmdbClient } from '../app/lib/tmdb.server.ts';

test('TMDB enrichment keeps the token in headers and safely projects one exact match', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const token = 'private-test-token';
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    if (String(input).includes('/search/movie')) {
      return Response.json({ results: [{ id: 843, title: 'In the Mood for Love', original_title: '花樣年華', release_date: '2000-09-29', adult: false }] });
    }
    return Response.json({
      id: 843, title: 'In the Mood for Love', original_title: '花樣年華', adult: false,
      poster_path: '/poster.jpg', overview: 'Two neighbors discover an intimate absence.', runtime: 98,
      release_date: '2000-09-29', genres: [{ name: 'Drama' }], production_countries: [{ name: 'Hong Kong' }],
      credits: { crew: [{ job: 'Director', name: 'Wong Kar-wai' }, { job: 'Writer', name: 'Someone Else' }] },
      external_ids: { imdb_id: 'tt0118694' }, popularity: 999, vote_average: 8.1,
    });
  }) as typeof fetch;

  const result = await createTmdbClient({ token, fetchImpl }).enrichOne({ title: 'In the Mood for Love', year: '2000', key: 'in the mood for love|2000' });
  assert.equal(result.status, 'matched');
  assert.equal(calls.length, 2);
  assert.doesNotMatch(calls[0].url, new RegExp(token));
  assert.equal(new Headers(calls[0].init?.headers).get('authorization'), `Bearer ${token}`);
  assert.deepEqual(result.status === 'matched' ? result.directors : [], ['Wong Kar-wai']);
  assert.equal(result.status === 'matched' ? result.tmdbRating : null, 8.1);
  assert.equal(JSON.stringify(result).includes(token), false);
});

test('a TMDB v3 API key is sent as api_key, never as a bearer token, and never returned', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const key = '0123456789abcdef0123456789abcdef';
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    if (String(input).includes('/search/movie')) {
      return Response.json({ results: [{ id: 843, title: 'In the Mood for Love', original_title: '花樣年華', release_date: '2000-09-29', adult: false }] });
    }
    return Response.json({ id: 843, title: 'In the Mood for Love', original_title: '花樣年華', adult: false, release_date: '2000-09-29',
      poster_path: '/poster.jpg', overview: '', runtime: 98, genres: [], production_countries: [], credits: { crew: [] }, external_ids: {} });
  }) as typeof fetch;

  const result = await createTmdbClient({ token: key, fetchImpl }).enrichOne({ title: 'In the Mood for Love', year: '2000', key: 'in the mood for love|2000' });
  assert.equal(result.status, 'matched');
  for (const call of calls) {
    assert.equal(new URL(call.url).searchParams.get('api_key'), key);
    assert.equal(new Headers(call.init?.headers).get('authorization'), null);
  }
  assert.equal(new URL(calls[0].url).searchParams.get('query'), 'In the Mood for Love');
  assert.equal(JSON.stringify(result).includes(key), false);
});

test('nearby catalog release year needs corroborating release-date evidence', async () => {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input); calls.push(url);
    if (url.includes('/search/movie')) return Response.json({ results: url.includes('primary_release_year') ? [] : [
      { id: 402, title: 'After Yang', original_title: 'After Yang', release_date: '2022-03-04', adult: false },
    ] });
    return Response.json({ id: 402, title: 'After Yang', original_title: 'After Yang', adult: false,
      release_date: '2022-03-04', release_dates: { results: [{ iso_3166_1: 'US', release_dates: [{ release_date: '2021-07-08T00:00:00.000Z' }] }] },
      poster_path: '/film.jpg', overview: '', runtime: 96, genres: [], production_countries: [], credits: { crew: [] }, external_ids: {} });
  }) as typeof fetch;
  const result = await createTmdbClient({ token: 'test', fetchImpl }).enrichOne({ title: 'After Yang', year: '2021', key: 'after yang|2021' });
  assert.equal(result.status, 'matched');
  assert.equal(result.status === 'matched' ? result.tmdbId : null, 402);
  assert.equal(calls.length, 3);
});

test('a nearby year without release corroboration and ambiguous broad results do not attach imagery', async () => {
  for (const candidates of [[{ id: 402, title: 'After Yang', release_date: '2022-03-04', adult: false }],
    [{ id: 402, title: 'After Yang', release_date: '2022-03-04', adult: false }, { id: 403, title: 'After Yang', release_date: '2022-01-01', adult: false }]]) {
    const fetchImpl = (async (input: string | URL | Request) => String(input).includes('/search/movie')
      ? Response.json({ results: String(input).includes('primary_release_year') ? [] : candidates })
      : Response.json({ id: 402, title: 'After Yang', original_title: 'After Yang', adult: false,
        release_date: '2022-03-04', release_dates: { results: [] }, poster_path: '/wrong.jpg' })) as typeof fetch;
    const result = await createTmdbClient({ token: 'test', fetchImpl }).enrichOne({ title: 'After Yang', year: '2021', key: 'after yang|2021' });
    assert.equal(result.status, 'unmatched');
  }
});

test('TMDB ambiguity is a text-only unmatched result', async () => {
  const fetchImpl = (async () => Response.json({ results: [
    { id: 1, title: 'Same', original_title: 'Same', release_date: '2001-01-01', adult: false },
    { id: 2, title: 'Same', original_title: 'Same', release_date: '2001-09-01', adult: false },
  ] })) as typeof fetch;
  const result = await createTmdbClient({ token: 'test', fetchImpl }).enrichOne({ title: 'Same', year: '2001', key: 'same|2001' });
  assert.equal(result.status, 'unmatched');
});
