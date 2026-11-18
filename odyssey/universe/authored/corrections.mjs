// Slips in the record, put right by hand or by Claude's readings.
//
// The atlas reaches the chart through many instruments (Wikidata, plot summaries,
// keyword lists, a classifier for the 28 ATLAS worlds), and each of them is
// sometimes wrong about a film everybody knows: In the Mood for Love filed under
// martial arts, The Shawshank Redemption under paranoid thrillers. A wrong trait
// is worse than a missing one, because it sends a ray somewhere absurd and puts
// a false reason beside it.
//
// Two sources are read here:
// - CORRECTIONS below, written by hand;
// - corrections-read.json beside this file, written from Claude's readings of the
//   best-known films (each reading names the traits on its film's card that are
//   not true of the film). See scripts/readings/.
//
// A correction names a film by its slug and may:
// - drop: traits that are not true of the film, by their label or short name under
//   any light (case does not matter);
// - country: the producing countries in the order they should be named.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Re-edits of a film the chart already holds: charted, but never offered as somewhere to go. */
export const RECUTS = new Set([
  'the-godfather-saga-1977',
  'apocalypse-now-redux-2001',
]);

export const CORRECTIONS = {
  'in-the-mood-for-love-2000': {
    country: ['Hong Kong', 'France', 'Thailand'],
    drop: ['martial arts', 'a war', 'a test of faith'],
  },
  'the-hudsucker-proxy-1994': { drop: ['paranoid thriller'] },
  'heat-1995': { drop: ['cerebral horror', 'prison'] },
  'the-shawshank-redemption-1994': { drop: ['paranoid thriller'] },
  'seven-samurai-1954': { drop: ['aching romance', 'a kidnapping', 'a false identity'] },
  'tokyo-story-1953': { drop: ['dream logic', 'coma', 'a false identity', 'swing', 'sport and the ring', 'office', 'fish', 'ambition', 'dreams'] },
  'arrival-2016': { drop: ['revenge', 'melancholy drift'] },
  'raging-bull-1980': { drop: ['paranoid thriller'] },
  'casino-1995': { drop: ['aching romance', 'paranoid thriller', 'melancholy drift', 'wilderness obsession'] },
  'rear-window-1954': { drop: ['melancholy drift', 'a war'] },
  'north-by-northwest-1959': { drop: ['melancholy drift', 'after the end'] },
  'close-encounters-of-the-third-kind-1977': { drop: ['cerebral horror', 'a war'] },
  'children-of-men-2006': { drop: ['cerebral horror', 'dystopian satire'] },
};

const here = import.meta.dirname;

/** Every correction, by slug: the hand-written ones over the ones read. */
export function loadCorrections(file = join(here, 'corrections-read.json')) {
  const merged = new Map();
  const take = (slug, entry) => {
    if (!entry || typeof entry !== 'object') return;
    const kept = merged.get(slug) || { drop: new Set(), country: null };
    for (const label of Array.isArray(entry.drop) ? entry.drop : []) {
      if (typeof label === 'string' && label.trim()) kept.drop.add(label.trim().toLowerCase());
    }
    if (Array.isArray(entry.country) && entry.country.length) kept.country = entry.country.map(String);
    merged.set(slug, kept);
  };
  if (existsSync(file)) {
    const read = JSON.parse(readFileSync(file, 'utf8'));
    for (const [slug, entry] of Object.entries(read.films || {})) take(slug, entry);
  }
  for (const [slug, entry] of Object.entries(CORRECTIONS)) take(slug, entry);
  return merged;
}

/**
 * Puts the record right before the traits are drawn from it: the countries in their
 * order, and any of the 28 worlds that do not belong. Returns the corrections by film index.
 * @param {{ films: object[], registers: Record<string, { label: string }>, label: (qid: string) => string|null }} atlas
 */
export function correctAtlas(atlas, corrections = loadCorrections()) {
  const byFilm = new Map();
  for (const film of atlas.films) {
    const fix = corrections.get(film.slug);
    if (RECUTS.has(film.slug)) film.cut = true;
    if (!fix) continue;
    byFilm.set(film.i, fix);
    if (fix.country) {
      const at = name => {
        const n = fix.country.findIndex(wanted => wanted.toLowerCase() === String(name || '').toLowerCase());
        return n < 0 ? fix.country.length : n;
      };
      film.country = [...film.country].sort((a, b) => at(atlas.label(a)) - at(atlas.label(b)));
    }
    if (fix.drop.size) {
      film.registers = film.registers.filter(id => !fix.drop.has(String(atlas.registers[id]?.label || '').toLowerCase()));
    }
  }
  return byFilm;
}

/**
 * Takes out of each corrected film's rows the traits it was wrongly given.
 * Runs on the extracted features, before they are packed.
 * @param {{ rows: Record<string, Map<string, number>[]>, meta: Map<string, object> }} extracted
 * @param {Map<number, { drop: Set<string> }>} byFilm
 */
export function correctFeatures(extracted, byFilm) {
  let dropped = 0;
  for (const [i, fix] of byFilm) {
    if (!fix.drop.size) continue;
    for (const rows of Object.values(extracted.rows)) {
      const row = rows[i];
      for (const id of [...row.keys()]) {
        const info = extracted.meta.get(id);
        if (!info) continue;
        const names = [info.label, info.short].filter(Boolean).map(name => String(name).toLowerCase());
        if (names.some(name => fix.drop.has(name))) { row.delete(id); dropped += 1; }
      }
    }
  }
  return dropped;
}
