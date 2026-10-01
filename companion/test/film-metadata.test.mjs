import assert from 'node:assert/strict';
import test from 'node:test';

import { createFilmMetadataProvider } from '../lib/film-metadata.mjs';

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('metadata provider uses bounded batches and returns only its strict public projection', async () => {
  const batchSizes = [];
  const provider = createFilmMetadataProvider({
    url: 'https://metadata.example/api/films/enrich',
    batchSize: 5,
    concurrency: 2,
    fetchImpl: async (_url, options) => {
      const { films } = JSON.parse(options.body);
      batchSizes.push(films.length);
      return response({ films: films.map((film, index) => ({
        key: `ignored-${index}`,
        title: film.title,
        year: film.year,
        status: 'matched',
        tmdbId: 2000 + index,
        imdbId: `tt${String(2000000 + index)}`,
        tmdbRating: 7.2,
        posterUrl: 'https://images.example/poster.jpg',
        overview: 'A concise verified overview.',
        runtime: 98,
        releaseDate: `${film.year}-01-01`,
        genres: ['Drama'],
        countries: ['Japan'],
        directors: ['A Director'],
        privateField: 'must not escape',
      })) });
    },
  });

  const result = await provider(Array.from({ length: 12 }, (_, index) => ({
    title: `Film ${index + 1}`,
    year: String(2000 + index),
  })));

  assert.deepEqual(batchSizes.sort((a, b) => a - b), [2, 5, 5]);
  assert.equal(result.length, 12);
  assert.equal('privateField' in result[0], false);
  assert.deepEqual(Object.keys(result[0]), [
    'requestedTitle', 'requestedYear', 'status', 'title', 'year', 'tmdbId',
    'imdbId', 'tmdbRating', 'posterUrl', 'overview', 'runtime', 'releaseDate',
    'genres', 'countries', 'directors',
  ]);
});

test('metadata provider rejects non-HTTPS configuration and mismatched identities', async () => {
  assert.throws(
    () => createFilmMetadataProvider({ url: 'http://metadata.example/api' }),
    /https/i,
  );
  // A development site on this machine may be reached over plain HTTP.
  assert.equal(typeof createFilmMetadataProvider({ url: 'http://localhost:3000/api/films/enrich' }), 'function');
  assert.equal(typeof createFilmMetadataProvider({ url: 'http://127.0.0.1:3000/api/films/enrich' }), 'function');

  const provider = createFilmMetadataProvider({
    url: 'https://metadata.example/api',
    fetchImpl: async () => response({ films: [{
      title: 'Wrong Film',
      year: '2001',
      status: 'matched',
      tmdbId: 1,
      imdbId: 'tt0000001',
      tmdbRating: 5,
      posterUrl: null,
      overview: 'Wrong identity.',
      runtime: 90,
      releaseDate: '2001-01-01',
      genres: [],
      countries: [],
      directors: [],
    }] }),
  });

  await assert.rejects(provider([{ title: 'Expected Film', year: '2001' }]), /identity mismatch/i);
});

test('metadata provider rejects malformed payloads and matched films without canonical IDs', async () => {
  const malformed = createFilmMetadataProvider({
    url: 'https://metadata.example/api',
    fetchImpl: async () => response({ films: 'private upstream payload' }),
  });
  await assert.rejects(malformed([{ title: 'Film', year: '2001' }]), /malformed metadata response/i);

  const missingId = createFilmMetadataProvider({
    url: 'https://metadata.example/api',
    fetchImpl: async () => response({ films: [{
      title: 'Film', year: '2001', status: 'matched', tmdbId: null, imdbId: null,
      tmdbRating: 7, posterUrl: null, overview: 'Overview', runtime: 90,
      releaseDate: '2001-01-01', genres: [], countries: [], directors: [],
    }] }),
  });
  await assert.rejects(missingId([{ title: 'Film', year: '2001' }]), /canonical identity/i);
});

test('unavailable metadata is retried and oversized responses are bounded',async()=>{
 let calls=0;
 const provider=createFilmMetadataProvider({url:'https://metadata.example/api',fetchImpl:async()=>{calls++;return response({films:[{title:'Film',year:'2001',status:'unavailable'}]});}});
 await provider([{title:'Film',year:'2001'}]);await provider([{title:'Film',year:'2001'}]);assert.equal(calls,2);
 const large=createFilmMetadataProvider({url:'https://metadata.example/api',maxResponseBytes:1024,fetchImpl:async()=>new Response('x'.repeat(2048))});
 await assert.rejects(large([{title:'Film',year:'2001'}]),/too large/);
});
test('selected catalog IDs use distinct cache entries and must match verified responses', async () => {
  const requested = [];
  const provider = createFilmMetadataProvider({ url: 'https://metadata.example/api', fetchImpl: async (_url, options) => {
    const { films } = JSON.parse(options.body);
    requested.push(...films);
    return response({ films: films.map(film => ({ title: film.title, year: film.year, status: 'matched', tmdbId: film.tmdbId ?? 101,
      imdbId: null, tmdbRating: null, posterUrl: null, overview: '', runtime: null, releaseDate: null,
      genres: [], countries: [], directors: [] })) });
  } });
  const legacy = await provider([{ title: 'After Yang', year: '2021' }]);
  const selected = await provider([{ title: 'After Yang', year: '2021', tmdbId: 202 }]);
  assert.equal(legacy[0].tmdbId, 101);
  assert.equal(selected[0].tmdbId, 202);
  assert.deepEqual(requested.map(item => item.tmdbId ?? null), [null, 202]);
  await provider([{ title: 'After Yang', year: '2021', tmdbId: 202 }]);
  assert.equal(requested.length, 2);
  await assert.rejects(provider([{ title: 'After Yang', year: '2021', tmdbId: 0 }]), /catalog ID/i);
  const falseMatch = createFilmMetadataProvider({ url: 'https://metadata.example/api', fetchImpl: async () => response({ films: [{
    title: 'After Yang', year: '2021', status: 'matched', tmdbId: 101, imdbId: null,
    tmdbRating: null, posterUrl: null, overview: '', runtime: null, releaseDate: null,
    genres: [], countries: [], directors: [],
  }] }) });
  await assert.rejects(falseMatch([{ title: 'After Yang', year: '2021', tmdbId: 202 }]), /catalog identity mismatch/i);
});
