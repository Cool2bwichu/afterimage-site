import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ERAS, REGIONS, TERRA_KEY, TERRA_MINIMUM, chartTerra, doorRequest, eraOf, factsFromEnrichment, parseTerraCache, regionOf, serializeTerraCache,
  type TerraFacts, type TerraFilm,
} from '../app/lib/terra.ts';
import { movieKey, type FilmEnrichment } from '../app/lib/movie-metadata.ts';
import { canDevelop } from '../app/lib/reel-state.ts';

const film = (title: string, year: string): TerraFilm => ({ key: movieKey(title, year), title, year });
const sky = [
  film('Columbus', '2017'), film('After Yang', '2022'), film('In the Mood for Love', '2000'), film('Taste of Cherry', '1997'),
  film('Paris, Texas', '1984'), film('Tokyo Story', '1953'), film('Close-Up', '1990'),
];
const facts: Record<string, TerraFacts> = {
  [sky[0].key]: { countries: ['United States of America'], genres: ['Drama'] },
  [sky[1].key]: { countries: ['United States of America'], genres: ['Science Fiction', 'Drama'] },
  [sky[2].key]: { countries: ['Hong Kong', 'France'], genres: ['Drama', 'Romance'] },
  [sky[3].key]: { countries: ['Iran'], genres: ['Drama'] },
  [sky[4].key]: { countries: ['West Germany', 'France'], genres: ['Drama'] },
  [sky[5].key]: { countries: ['Japan'], genres: ['Drama'] },
};

test('the catalogue’s country names find their part of the world', () => {
  assert.equal(regionOf('United States of America'), 'north-america');
  assert.equal(regionOf('South Korea'), 'east-asia');
  assert.equal(regionOf("Cote D'Ivoire"), 'africa');
  assert.equal(regionOf('Côte d’Ivoire'), 'africa');
  assert.equal(regionOf('Soviet Union'), 'eastern-europe');
  assert.equal(regionOf('Atlantis'), null);
  const names = REGIONS.flatMap(region => region.countries.map(country => country.toLocaleLowerCase()));
  assert.equal(new Set(names).size, names.length, 'no country belongs to two places');
});

test('years fall into eras, and the silent era is one era', () => {
  assert.equal(eraOf('1927'), 'silent');
  assert.equal(eraOf('1930'), '1930s');
  assert.equal(eraOf('2026'), '2020s');
  assert.equal(eraOf('19xx'), null);
  assert.equal(ERAS.length, 11);
});

test('the chart places every film it can and is honest about the rest', () => {
  const chart = chartTerra(sky, facts);
  assert.equal(chart.total, 7);
  assert.equal(chart.charted, 6, 'Close-Up has no catalogue record yet');
  const region = (id: string) => chart.regions.find(item => item.id === id)!;
  assert.equal(region('north-america').films.length, 2);
  assert.equal(region('western-europe').films.length, 2, 'a co-production counts once in each place it was made');
  assert.equal(region('east-asia').films.length, 2);
  assert.equal(region('africa').films.length, 0);
  assert.equal(chart.eras.find(era => era.id === '1990s')!.films.length, 2, 'eras need only the year, so every film is placed');
  assert.equal(chart.forms.find(form => form.genre === 'Romance')!.films.length, 1);
});

test('the blank places become three doors, one of each kind', () => {
  const chart = chartTerra(sky, facts);
  assert.deepEqual(chart.doors.map(door => door.kind), ['region', 'era', 'form']);
  assert.deepEqual(chart.doors.map(door => door.id), ['latin-america', '1970s', 'Documentary']);
  assert.match(chart.doors[0].line, /never reached Latin America/);
  assert.match(chart.doors[1].line, /made in the 1970s/);
  const young = chartTerra(sky.slice(0, TERRA_MINIMUM - 1), facts);
  assert.deepEqual(young.doors, [], 'a young sky has no edges worth naming yet');
});

test('each door is an ordinary reel request', () => {
  for (const door of [{ kind: 'region', id: 'africa' }, { kind: 'region', id: 'middle-east' }, { kind: 'era', id: 'silent' }, { kind: 'era', id: '1960s' }, { kind: 'form', id: 'Animation' }] as const) {
    const request = doorRequest(door);
    assert.deepEqual(request.films, []);
    assert.ok(canDevelop(request.films, request.creativeBrief));
    assert.ok(request.creativeBrief.length <= 1200);
  }
  assert.match(doorRequest({ kind: 'region', id: 'africa' }).creativeBrief, /Five films made in Sub-Saharan Africa \(Senegal, Mali/);
  assert.match(doorRequest({ kind: 'region', id: 'middle-east' }).creativeBrief, /never reached the Middle East and North Africa/);
  assert.match(doorRequest({ kind: 'era', id: 'silent' }).creativeBrief, /before 1930, in the silent era/);
  assert.match(doorRequest({ kind: 'form', id: 'Animation' }).creativeBrief, /^My film sky has no animation in it yet\. Five animated films/);
});

test('what the catalogue said is cached in its own record, compactly', () => {
  assert.equal(TERRA_KEY, 'afterimage:terra:v1');
  const matched = { key: 'columbus|2017', title: 'Columbus', year: '2017', status: 'matched', tmdbId: 1, imdbId: null, tmdbRating: null, posterUrl: null, overview: '', runtime: 104, releaseDate: null, genres: ['Drama'], countries: ['United States of America'], directors: ['Kogonada'] } as FilmEnrichment;
  assert.deepEqual(factsFromEnrichment(matched), { countries: ['United States of America'], genres: ['Drama'] });
  assert.deepEqual(factsFromEnrichment({ key: 'x|2000', title: 'X', year: '2000', status: 'unmatched' }), { countries: [], genres: [] }, 'not in the catalogue is an answer too');
  assert.equal(factsFromEnrichment({ key: 'x|2000', title: 'X', year: '2000', status: 'unavailable' }), null, 'a failed lookup is asked again later');
  assert.deepEqual(parseTerraCache(serializeTerraCache(facts)), facts);
  assert.deepEqual(parseTerraCache('nope'), {});
  assert.deepEqual(parseTerraCache(JSON.stringify({ version: 1, films: { 'bad key': { c: ['France'] }, 'ok|1999': { c: ['France', 7], g: 'Drama' } } })), { 'ok|1999': { countries: ['France'], genres: [] } });
});
