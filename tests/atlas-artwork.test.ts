import test from 'node:test';
import assert from 'node:assert/strict';
import { ATLAS_ARTWORK_KEY, readAtlasArtwork, serializeAtlasArtwork } from '../app/lib/atlas-artwork.ts';
import { movieKey, type FilmEnrichment } from '../app/lib/movie-metadata.ts';

const DAY = 24 * 60 * 60 * 1000;
function matched(title: string, id: number): FilmEnrichment {
  return {
    key: movieKey(title, '2020'), title, year: '2020', status: 'matched', tmdbId: id,
    imdbId: null, tmdbRating: 7.4, posterUrl: `https://image.tmdb.org/t/p/w500/${id}.jpg`,
    backdropUrl: `https://image.tmdb.org/t/p/w1280/${id}.jpg`, overview: '', runtime: 95,
    releaseDate: '2020-01-01', genres: ['Drama'], countries: ['US'], directors: ['A Director'],
  };
}

test('verified artwork survives serialization and reload within seven days', () => {
  assert.equal(ATLAS_ARTWORK_KEY, 'afterimage:atlas:artwork:v1');
  const film = matched('After Yang', 1201);
  const raw = serializeAtlasArtwork({ [film.key]: film }, 100 * DAY);
  assert.deepEqual(readAtlasArtwork(raw, 106 * DAY)[film.key], film);
  assert.deepEqual(readAtlasArtwork(raw, 108 * DAY), {});
});

test('malformed, future, and unsafe cached snapshots are discarded', () => {
  const film = matched('After Yang', 1201);
  const raw = serializeAtlasArtwork({ [film.key]: film }, 100 * DAY);
  assert.deepEqual(readAtlasArtwork('{', 100 * DAY), {});
  assert.deepEqual(readAtlasArtwork(raw, 99 * DAY), {});
  const unsafe = JSON.parse(raw);
  unsafe.records[0].posterUrl = 'https://untrusted.example/poster.jpg';
  assert.deepEqual(readAtlasArtwork(JSON.stringify(unsafe), 100 * DAY), {});
});

test('serialization excludes unmatched films, unsafe URLs, and mismatched map keys', () => {
  const good = matched('After Yang', 1201);
  const unsafe = { ...matched('Columbus', 1202), backdropUrl: 'https://untrusted.example/backdrop.jpg' } as FilmEnrichment;
  const unmatched: FilmEnrichment = { key: movieKey('Other', '2020'), title: 'Other', year: '2020', status: 'unmatched' };
  const raw = serializeAtlasArtwork({ [good.key]: good, [unsafe.key]: unsafe, [unmatched.key]: unmatched, wrong: matched('Wrong', 1203) }, 100 * DAY);
  assert.deepEqual(Object.keys(readAtlasArtwork(raw, 100 * DAY)), [good.key]);
});

test('the cache keeps at most 84 verified film records', () => {
  const films = Array.from({ length: 90 }, (_, index) => matched(`Film ${index}`, index + 1));
  const raw = serializeAtlasArtwork(Object.fromEntries(films.map(film => [film.key, film])), 100 * DAY);
  const restored = readAtlasArtwork(raw, 100 * DAY);
  assert.equal(Object.keys(restored).length, 84);
  assert.equal(restored[films[0].key], undefined);
  assert.deepEqual(restored[films[89].key], films[89]);
});
