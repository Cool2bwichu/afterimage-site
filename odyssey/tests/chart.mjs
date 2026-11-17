// The chart as it is shipped, opened once for every test file. The tests name
// films by reading the chart, so a recompiled chart does not break them.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { openUniverse } from '../src/engine/universe.mjs';
import { createSearch } from '../src/engine/search.mjs';
import { buildVocabulary } from '../brain/vocabulary.mjs';

const read = name => JSON.parse(readFileSync(fileURLToPath(new URL(`../public/data/${name}.json`, import.meta.url)), 'utf8'));

export const bundle = read('universe');
export const depth = read('depth');

/** A fresh universe: tests that add stars must not share one. */
export function open() {
  const universe = openUniverse(bundle);
  return { universe, search: createSearch(universe), vocabulary: buildVocabulary(universe.bundle.traits) };
}

/** A well-known film of the chart by slug, or the film at `fallback` if a recompile dropped it. */
export function star(universe, slug, fallback) {
  const index = universe.indexOfSlug(slug);
  return index >= 0 ? index : fallback;
}

/**
 * A film as the Navigator writes one. The titles used with this are invented,
 * so that none can already be on the chart.
 */
export const written = (title, year, extra = {}) => ({
  title, year, director: 'Odile Verran', known: 'well', fame: 1, country: 'France',
  premise: 'A lighthouse keeper catalogues the ships that never arrive.', afterimage: 'the lamp turning over an empty sea',
  story: [], feeling: [], image: [], idea: [], world: [],
  axes: { dread: 55, cruelty: 10, irony: 20, ambiguity: 80, fracture: 30 },
  bw: false, animated: false, movement: '', setting: '', hi: '#aabbcc', lo: '#112233',
  ...extra,
});
