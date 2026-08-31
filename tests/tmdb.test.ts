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
      poster_path: '/poster.jpg', overview: 'Two neighbors discover an intimate absence.', runtime: 98,
      release_date: '2000-09-29', genres: [{ name: 'Drama' }], production_countries: [{ name: 'Hong Kong' }],
      credits: { crew: [{ job: 'Director', name: 'Wong Kar-wai' }, { job: 'Writer', name: 'Someone Else' }] },
      external_ids: { imdb_id: 'tt0118694' }, popularity: 999,
    });
  }) as typeof fetch;

  const result = await createTmdbClient({ token, fetchImpl }).enrichOne({ title: 'In the Mood for Love', year: '2000', key: 'in the mood for love|2000' });
  assert.equal(result.status, 'matched');
  assert.equal(calls.length, 2);
  assert.doesNotMatch(calls[0].url, new RegExp(token));
  assert.equal(new Headers(calls[0].init?.headers).get('authorization'), `Bearer ${token}`);
  assert.deepEqual(result.status === 'matched' ? result.directors : [], ['Wong Kar-wai']);
  assert.equal(JSON.stringify(result).includes(token), false);
});

test('TMDB ambiguity is a text-only unmatched result', async () => {
  const fetchImpl = (async () => Response.json({ results: [
    { id: 1, title: 'Same', original_title: 'Same', release_date: '2001-01-01', adult: false },
    { id: 2, title: 'Same', original_title: 'Same', release_date: '2001-09-01', adult: false },
  ] })) as typeof fetch;
  const result = await createTmdbClient({ token: 'test', fetchImpl }).enrichOne({ title: 'Same', year: '2001', key: 'same|2001' });
  assert.equal(result.status, 'unmatched');
});
