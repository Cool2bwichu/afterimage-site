// The shape of a voyage, and the order of a list. Arithmetic over the likeness
// index again, so every answer is instant and says what it is made of:
//
// - which films in a set carry it most truly, which your loved films pull
//   hardest, and which are least familiar;
// - a trail through a set, each step to the nearest film not yet taken;
// - the doors out of a star on a voyage, each opening under its own light;
// - how much of the film you set out from is still in the film you are at;
// - the rings of a star system: under each light, the films nearest it.
import { LIGHTS, LIGHT_IDS } from './lights.mjs';
import { closestLight, sharedTraits } from './voyage.mjs';

const WEIGHT = Object.fromEntries(LIGHTS.map(light => [light.id, light.weight]));
const ROW = 400; // more traits than any film carries under one light

/**
 * How typical each member of a set is of the set: its mean likeness to the
 * other members under a light (white blends the six by their weights).
 * Computed from the members' own rows, so a set of hundreds costs one pass.
 * @returns {Map<number, number>} star → mean likeness to the rest
 */
export function typicality(universe, stars, light = 'white') {
  const members = [...new Set(stars)].filter(i => i >= 0 && i < universe.count);
  const result = new Map(members.map(i => [i, 0]));
  if (members.length < 2) { for (const i of members) result.set(i, 1); return result; }
  const lights = light === 'white' ? LIGHT_IDS : [light];
  let total = 0;
  for (const id of lights) {
    const w = light === 'white' ? WEIGHT[id] : 1;
    if (w <= 0) continue;
    total += w;
    const index = universe.model.index[id];
    const rows = members.map(i => index.traits(i, ROW));
    const centroid = new Map();
    for (const row of rows) for (const { trait, weight } of row) centroid.set(trait, (centroid.get(trait) || 0) + weight);
    rows.forEach((row, n) => {
      let dot = 0;
      let self = 0;
      for (const { trait, weight } of row) { dot += weight * centroid.get(trait); self += weight * weight; }
      result.set(members[n], result.get(members[n]) + (w * (dot - self)) / (members.length - 1));
    });
  }
  if (total > 0) for (const [i, value] of result) result.set(i, value / total);
  return result;
}

/**
 * How hard a set of loved films pulls each of some films: its likeness to the
 * nearest loved film, and a little more for a second.
 * @returns {Map<number, { pull: number, from: number }>}
 */
export function pullOf(universe, stars, loved) {
  const list = [...new Set(loved)].filter(i => i >= 0 && i < universe.count);
  const result = new Map();
  for (const i of stars) {
    let first = 0; let second = 0; let from = -1;
    for (const l of list) {
      if (l === i) continue;
      const s = universe.model.sim('white', i, l);
      if (s > first) { second = first; first = s; from = l; } else if (s > second) second = s;
    }
    result.set(i, { pull: first + 0.4 * second, from });
  }
  return result;
}

/**
 * A set of films in the order it is best browsed.
 * - truest: the films that carry the set most fully first;
 * - yours: the films your loved films pull hardest first, still leaning on how fully they carry it;
 * - unfamiliar: the truest, leaning hard toward the less known.
 * @param {object} options
 * @param {string} [options.light] the light the set belongs to (a trait's own light; white for the rest)
 * @param {Iterable<number>} [options.loved]
 * @param {Set<number>|null} [options.exclude] films to leave out (hidden, or watched)
 * @param {'truest'|'yours'|'unfamiliar'} [options.order]
 * @param {Map<number, number>|null} [options.strength] a known strength per film, used in place of typicality
 * @returns {Array<{ star: number, strength: number, pull: number, from: number, score: number }>}
 *   strength and pull are 0..1 within this set
 */
export function rankSet(universe, stars, { light = 'white', loved = [], exclude = null, order = 'truest', strength = null } = {}) {
  const members = [...new Set(stars)].filter(i => i >= 0 && i < universe.count && !(exclude && exclude.has(i)));
  if (!members.length) return [];
  const raw = strength || typicality(universe, members, light);
  const lovedList = [...loved].filter(i => i >= 0 && i < universe.count);
  const pulls = lovedList.length ? pullOf(universe, members, lovedList) : null;
  let topStrength = 1e-9;
  let topPull = 1e-9;
  for (const i of members) {
    topStrength = Math.max(topStrength, raw.get(i) || 0);
    if (pulls) topPull = Math.max(topPull, pulls.get(i).pull);
  }
  const ranked = members.map(i => {
    const s = Math.max(0, raw.get(i) || 0) / topStrength;
    const p = pulls ? pulls.get(i).pull / topPull : 0;
    const renown = universe.films[i].rn ?? 1;
    let score = s;
    if (order === 'yours' && pulls) score = 0.3 * s + 0.7 * p;
    else if (order === 'unfamiliar') score = s * (1.7 - 0.32 * renown);
    return { star: i, strength: s, pull: p, from: pulls ? pulls.get(i).from : -1, score };
  });
  ranked.sort((a, b) => b.score - a.score || universe.films[a.star].t.localeCompare(universe.films[b.star].t));
  return ranked;
}

/**
 * A trail through a set: from its first film, each step to the nearest film of
 * the set not yet taken, among the strongest few, so a trail stays true to the set.
 * @param {number[]} ranked the set in order, strongest first
 * @returns {Array<{ star: number, light: string|null, shared: Array }>} the first stop has no light
 */
export function trail(universe, ranked, { length = 5, pool = 30, start = null } = {}) {
  const candidates = ranked.slice(0, Math.max(pool, length));
  if (!candidates.length) return [];
  const first = start !== null && candidates.includes(start) ? start : candidates[0];
  const stops = [{ star: first, light: null, shared: [] }];
  const taken = new Set([first]);
  while (stops.length < Math.min(length, candidates.length)) {
    const at = stops[stops.length - 1].star;
    let best = -1;
    let bestSim = -1;
    candidates.forEach((star, rank) => {
      if (taken.has(star)) return;
      // Nearer is better; among near ties, the truer member of the set.
      const value = universe.model.sim('white', at, star) * (1 - (0.25 * rank) / candidates.length);
      if (value > bestSim) { bestSim = value; best = star; }
    });
    if (best < 0) break;
    taken.add(best);
    const { light } = closestLight(universe, at, best);
    stops.push({ star: best, light, shared: sharedTraits(universe, light, at, best, 2) });
  }
  return stops;
}

/**
 * How much of the film you set out from is still in a film: its likeness to the
 * origin, against the origin's own nearest film. 1 at home; near 0 far out.
 */
export function homeLikeness(universe, origin, star) {
  if (origin === star) return 1;
  const nearest = universe.model.neighbours('white', origin, 1)[0];
  const reference = nearest ? nearest.sim : 1;
  return Math.max(0, Math.min(1, universe.model.sim('white', origin, star) / Math.max(reference, 1e-6)));
}

/**
 * The doors out of a star on a voyage. Under each light, the film that leads
 * on: near the star you are at, and, other things equal, a little further from
 * where you set out, so a voyage goes somewhere. The strongest few lights each
 * open one door, and no film is behind two.
 * @param {object} options
 * @param {number} [options.origin] where the voyage set out
 * @param {number[]} [options.path] the stars already travelled (never offered again)
 * @param {Set<number>|null} [options.exclude] films never offered (hidden, watched)
 * @param {number[]} [options.loved] films whose pull is felt a little
 * @param {string|null} [options.last] the light of the leg just travelled: other lights are favoured
 * @param {number} [options.k] how many doors
 * @returns {Array<{ light: string, star: number, sim: number, shared: Array, home: number }>}
 */
export function doors(universe, at, { origin = at, path = [], exclude = null, loved = [], last = null, k = 3, depth = 8 } = {}) {
  const { model } = universe;
  const taken = new Set([at, origin, ...path]);
  const allow = j => !taken.has(j) && !(exclude && exclude.has(j));
  const homeAt = homeLikeness(universe, origin, at);
  const lovedList = [...loved].filter(i => i >= 0 && i < universe.count);
  const pulls = new Map(); // filled as films are weighed
  const pullFor = star => {
    if (!lovedList.length) return 0;
    if (!pulls.has(star)) pulls.set(star, pullOf(universe, [star], lovedList).get(star));
    return pulls.get(star).pull;
  };
  const options = [];
  for (const light of LIGHT_IDS) {
    const near = model.neighbours(light, at, depth, allow);
    if (!near.length) continue;
    const top = near[0].sim;
    let best = null;
    for (const { i: star, sim } of near) {
      const home = homeLikeness(universe, origin, star);
      const outward = Math.max(-1, Math.min(1, homeAt - home));
      // A voyage is for finding something to watch: a film people know is a slightly surer door.
      const known = 0.9 + 0.05 * (universe.films[star].rn ?? 1);
      const score = (sim / top) * (1 + 0.4 * outward) * (1 + 0.6 * pullFor(star)) * known;
      if (!best || score > best.score) best = { light, star, sim, home, score };
    }
    // A light is as strong as its nearest film is near; the light just travelled steps back a little.
    best.weight = top * (WEIGHT[light] ** 0.5) * (light === last ? 0.8 : 1);
    options.push(best);
  }
  options.sort((a, b) => b.weight - a.weight);
  const chosen = [];
  const used = new Set();
  for (const option of options) {
    if (chosen.length >= k) break;
    if (used.has(option.star)) continue;
    used.add(option.star);
    chosen.push({ light: option.light, star: option.star, sim: option.sim, home: option.home, shared: sharedTraits(universe, option.light, at, option.star, 2) });
  }
  return chosen;
}

/**
 * The rings of a star system: under each light, the films nearest the star,
 * strongest light innermost. No film sits on two rings: it keeps the innermost.
 * The first film on a ring may be given (the ray already travelled under that
 * light, or the one the Navigator chose), and is never moved.
 * @param {object} options
 * @param {Map<string, number>} [options.first] light → the film that leads its ring
 * @param {Set<number>|null} [options.exclude]
 * @param {number} [options.per] films on each ring
 * @param {string|null} [options.lead] the light the sky is seen by: its ring goes innermost
 * @returns {Array<{ light: string, sim: number, stars: number[] }>}
 */
export function rings(universe, star, { first = new Map(), exclude = null, per = 3, lead = null } = {}) {
  const { model } = universe;
  const allow = j => !(exclude && exclude.has(j));
  const lists = LIGHT_IDS.map(light => {
    const near = model.neighbours(light, star, per + 8, allow);
    return { light, near, sim: near.length ? near[0].sim * (WEIGHT[light] ** 0.5) : 0 };
  }).filter(entry => entry.near.length || first.has(entry.light));
  // Under one light, its ring is the innermost; otherwise the strongest is.
  lists.sort((a, b) => (b.light === lead) - (a.light === lead) || b.sim - a.sim);
  const leads = new Set([...first.values()]);
  const placed = new Set();
  const out = [];
  for (const { light, near, sim } of lists) {
    const stars = [];
    const lead = first.get(light);
    if (lead !== undefined && lead >= 0 && lead !== star) { stars.push(lead); placed.add(lead); }
    for (const { i } of near) {
      if (stars.length >= per) break;
      if (placed.has(i) || leads.has(i)) continue;
      stars.push(i);
      placed.add(i);
    }
    if (stars.length) out.push({ light, sim, stars });
  }
  return out;
}

const namingOf = new WeakMap();

/**
 * Whether a film carries a trait its star system is named for. A film can sit in
 * a system by its other traits alone, and then the system's name is not true of
 * it: Rashomon sits among "Aching romance · Forbidden Love" without being either.
 */
export function holdsArm(universe, star, arm) {
  if (!arm || star < 0) return false;
  if (arm.name.startsWith('Around ')) return true;
  let naming = namingOf.get(arm);
  if (!naming) {
    const words = new Set(arm.name.split(' · '));
    naming = (arm.top || []).filter(trait => {
      const { s, t } = universe.traits[trait];
      return words.has(s || t);
    });
    namingOf.set(arm, naming);
  }
  return naming.some(trait => universe.model.index[LIGHT_IDS[universe.traits[trait].l]].has(star, trait));
}

/** A voyage read back from a link: its stars by slug, joined by the light each pair is closest in. */
export function routeOf(universe, slugs) {
  const stars = slugs.map(slug => universe.indexOfSlug(slug)).filter(i => i >= 0);
  const unique = stars.filter((star, n) => stars.indexOf(star) === n);
  return unique.map((star, n) => {
    if (!n) return { star, light: null, shared: [] };
    const { light } = closestLight(universe, unique[n - 1], star);
    return { star, light, shared: sharedTraits(universe, light, unique[n - 1], star, 2) };
  });
}
