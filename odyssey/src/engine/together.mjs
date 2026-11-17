// Watching together. Two skies: the films one person loves and the films another loves. Where
// they meet is not the middle of two tastes (that can be a film neither wants) but the films
// each of them would choose for reasons of their own: near something one loves, and near
// something the other loves. And under which lights the two skies sit close, and where far apart.
import { LIGHT_IDS } from './lights.mjs';
import { mulberry32 } from './rng.mjs';
import { sharedTraits } from './voyage.mjs';
import { topK } from './similarity.mjs';
import { stemOf } from './bearing.mjs';

const PLACE = new Set(['country', 'language', 'era', 'decade']);
// Where and when (a country, a decade, a big studio), or something nearly every film is: true, but seldom why two films belong together.
const weak = record => PLACE.has(record.k) || (record.k === 'studio' && (record.df || 0) > 30) || (record.df || 0) > 500;
const MAX_SKY = 60;

/**
 * How hard one sky pulls every film: its likeness to the nearest film loved, and a little more for a second and third.
 * @returns {{ score: Float32Array, from: Int32Array, sim: Float32Array }} from and sim: the nearest film loved, and how near
 */
export function pullField(universe, loved, light = 'white') {
  const { model, count } = universe;
  const list = [...new Set(loved)].filter(i => i >= 0 && i < count).slice(0, MAX_SKY);
  const first = new Float32Array(count);
  const second = new Float32Array(count);
  const third = new Float32Array(count);
  const from = new Int32Array(count).fill(-1);
  const scratch = new Float32Array(count);
  for (const i of list) {
    model.scores(light, i, scratch);
    for (let j = 0; j < count; j += 1) {
      const s = scratch[j];
      if (s <= 0) continue;
      if (s > first[j]) { third[j] = second[j]; second[j] = first[j]; first[j] = s; from[j] = i; }
      else if (s > second[j]) { third[j] = second[j]; second[j] = s; }
      else if (s > third[j]) third[j] = s;
    }
  }
  const score = new Float32Array(count);
  for (let j = 0; j < count; j += 1) score[j] = first[j] + 0.6 * second[j] + 0.3 * third[j];
  return { score, from, sim: first };
}

/** A high mark of a field over the films that may be offered: what counts as a strong pull from this sky. */
function highMark(score, skip) {
  const values = [];
  for (let j = 0; j < score.length; j += 1) if (!skip.has(j) && score[j] > 0) values.push(score[j]);
  if (!values.length) return 1;
  values.sort((a, b) => b - a);
  return values[Math.min(values.length - 1, Math.floor(values.length * 0.005))] || 1;
}

/**
 * The films for both: each pulled toward one sky and toward the other, the weaker pull deciding.
 * @param {number[]} mine the films one person loves
 * @param {number[]} theirs the films the other loves
 * @param {{ exclude?: Set<number>|null, k?: number }} [options] exclude: films never offered (watched, set aside, out of tonight's seeing)
 * @returns {Array<{ star: number, score: number, mine: { from: number, sim: number }, theirs: { from: number, sim: number } }>}
 */
export function together(universe, mine, theirs, { exclude = null, k = 12 } = {}) {
  if (!mine.length || !theirs.length) return [];
  const a = pullField(universe, mine);
  const b = pullField(universe, theirs);
  const skip = new Set([...mine, ...theirs, ...(exclude || [])]);
  // Not a sequel or a remake of a film either of them loves: they know it is there.
  const stems = new Set([...mine, ...theirs].map(star => stemOf(universe.films[star].t)));
  for (let j = 0; j < universe.count; j += 1) if (stems.has(stemOf(universe.films[j].t))) skip.add(j);
  // Each sky measured against its own strongest pulls, so a sky of thirty films does not drown a sky of three.
  const ha = highMark(a.score, skip);
  const hb = highMark(b.score, skip);
  const joint = new Float32Array(universe.count);
  for (let j = 0; j < universe.count; j += 1) {
    if (skip.has(j)) continue;
    const na = Math.min(1.2, a.score[j] / ha);
    const nb = Math.min(1.2, b.score[j] / hb);
    if (na <= 0 || nb <= 0) continue;
    joint[j] = Math.min(na, nb) + 0.25 * Math.sqrt(na * nb);
  }
  return topK(joint, k).filter(entry => entry.sim > 0).map(({ i: star, sim: score }) => ({
    star, score,
    mine: { from: a.from[star], sim: a.sim[star] },
    theirs: { from: b.from[star], sim: b.sim[star] },
  }));
}

/** What a film shares with one loved film, the telling things first: [trait ids], at most two. */
export function bondOf(universe, from, star) {
  if (from < 0) return [];
  const all = sharedTraits(universe, 'white', from, star, 5).map(entry => entry.trait);
  return [...all.filter(trait => !weak(universe.traits[trait])), ...all.filter(trait => weak(universe.traits[trait]))].slice(0, 2);
}

/** How alike two films under each light usually are: the mean over a fixed sample of pairs, worked out once. */
function baselineOf(universe) {
  const cache = universe.__baseline;
  if (cache && cache.count === universe.count) return cache.values;
  const random = mulberry32(20261114);
  const values = {};
  for (const light of LIGHT_IDS) {
    let sum = 0;
    for (let n = 0; n < 600; n += 1) {
      const a = Math.floor(random() * universe.base);
      const b = Math.floor(random() * universe.base);
      sum += a === b ? 0 : universe.model.index[light].sim(a, b);
    }
    values[light] = Math.max(1e-4, sum / 600);
  }
  Object.defineProperty(universe, '__baseline', { value: { count: universe.count, values }, configurable: true, writable: true, enumerable: false });
  return values;
}

/**
 * Under which lights two skies sit close: for each, how near each film of one sky comes to the other sky
 * (its nearest film there), both ways, against how alike two films under that light usually are.
 * @returns {Array<{ light: string, closeness: number, share: number }>} closest first; share: 0..1 against the closest
 */
export function skiesMeet(universe, mine, theirs) {
  const A = [...new Set(mine)].slice(0, MAX_SKY);
  const B = [...new Set(theirs)].slice(0, MAX_SKY);
  if (!A.length || !B.length) return [];
  const base = baselineOf(universe);
  const out = LIGHT_IDS.map(light => {
    const index = universe.model.index[light];
    const reach = (from, to) => from.reduce((sum, a) => sum + Math.max(0, ...to.map(b => (a === b ? 1 : index.sim(a, b)))), 0) / from.length;
    const closeness = ((reach(A, B) + reach(B, A)) / 2) / base[light];
    return { light, closeness };
  }).sort((x, y) => y.closeness - x.closeness);
  // Said on a gentle scale: one light that two skies share a maker under can stand far above the rest.
  const top = Math.log1p(out[0].closeness) || 1;
  for (const entry of out) entry.share = Math.log1p(entry.closeness) / top;
  return out;
}

/** A sky as a line that can be sent: "sky-Sam~heat-1995~alien-1979". The name is optional and kept short. */
export function encodeSky(slugs, name = '') {
  const clean = String(name || '').replace(/[~#]|--/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24);
  return `sky${clean ? `-${clean}` : ''}~${[...slugs].slice(0, MAX_SKY).join('~')}`;
}

/** Reads a sky sent as a line or inside a link; null if there is none in it. */
export function decodeSky(text) {
  let raw = String(text || '').trim();
  const hash = raw.indexOf('#');
  if (hash >= 0) raw = raw.slice(hash + 1);
  try { raw = decodeURIComponent(raw); } catch { /* keep it as written */ }
  raw = raw.split('--')[0];
  const match = /^sky(?:-([^~]*))?~(.+)$/.exec(raw.trim());
  if (!match) return null;
  const slugs = match[2].split('~').map(slug => slug.trim()).filter(slug => /^[a-z0-9][a-z0-9-]*$/i.test(slug)).slice(0, MAX_SKY);
  return slugs.length ? { name: (match[1] || '').trim().slice(0, 24), slugs } : null;
}
