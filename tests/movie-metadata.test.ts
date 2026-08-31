import test from 'node:test';
import assert from 'node:assert/strict';

import {
  imdbUrl,
  movieKey,
  parseEnrichmentResponse,
  selectExactMovie,
  validateEnrichmentInput,
} from '../app/lib/movie-metadata.ts';

test('validates and normalizes one to five exact title/year pairs', () => {
  assert.deepEqual(validateEnrichmentInput({ films: [{ title: '  Paris, Texas  ', year: '1984' }] }), [
    { title: 'Paris, Texas', year: '1984', key: 'paris texas|1984' },
  ]);
  assert.equal(movieKey('Amélie', '2001'), 'amelie|2001');
  assert.throws(() => validateEnrichmentInput({ films: [] }), /one to five/i);
  assert.throws(() => validateEnrichmentInput({ films: Array.from({ length: 6 }, () => ({ title: 'Film', year: '2000' })) }), /one to five/i);
});

test('selects one exact non-adult title and year and refuses ambiguity', () => {
  const input = { title: 'Paris, Texas', year: '1984', key: 'paris texas|1984' };
  const exact = { id: 655, title: 'Paris, Texas', original_title: 'Paris, Texas', release_date: '1984-05-19', adult: false };
  assert.deepEqual(selectExactMovie(input, [exact]), exact);
  assert.equal(selectExactMovie(input, [exact, { ...exact, id: 656 }]), null);
  assert.equal(selectExactMovie(input, [{ ...exact, release_date: '1985-01-01' }]), null);
  assert.equal(selectExactMovie(input, [{ ...exact, adult: true }]), null);
});

test('constructs only verified IMDb title URLs and parses bounded responses', () => {
  assert.equal(imdbUrl('tt0118694'), 'https://www.imdb.com/title/tt0118694/');
  assert.equal(imdbUrl('0118694'), null);
  assert.deepEqual(parseEnrichmentResponse({ films: [{ key: 'paris texas|1984', title: 'Paris, Texas', year: '1984', status: 'unmatched' }] }), [
    { key: 'paris texas|1984', title: 'Paris, Texas', year: '1984', status: 'unmatched' },
  ]);
});
