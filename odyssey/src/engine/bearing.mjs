// Take a bearing. A navigator fixes a position by sighting two landmarks; here tonight is fixed
// by choosing, a few times over, between two films everyone knows: the one nearer to what you
// want tonight, whether or not you have seen it. Each pair is chosen to split what is left of
// the sky in two, so every choice says as much as one choice can. Each choice tilts the whole
// sky toward the film chosen and away from the one passed over, and what the sky leans toward
// at the end is tonight's film.
//
// Everything follows from the choices: the same choices always give the same sky, so a bearing
// can be kept as the list of choices made and worked out again.
import { mulberry32 } from './rng.mjs';
import { sharedTraits } from './voyage.mjs';

export const BEARING_ROUNDS = 6;
const TILT = 6;      // how far one choice tilts the sky
const POOL = 36;     // landmarks weighed for each pair
const APART = 0.2;   // the two films of a pair are at most this alike
const FRESH = 0.42;  // and neither is this like a film already shown (no run of sequels)
const PLACE = new Set(['country', 'language', 'era', 'decade']);

// What is said of a landmark: the kind of film it is, how it feels, what it is about or what happens.
const SAID = [
  { light: 'world', kinds: new Set(['genre', 'tradition']) },
  { light: 'feeling', kinds: new Set(['register', 'mood', 'attr', 'axis']) },
  { light: 'idea', kinds: new Set(['theme', 'register', 'attr']) },
  { light: 'story', kinds: new Set(['register', 'event', 'attr']) },
];
// A word few films carry says little to someone deciding ("Magician"): the rarest are leaned against.
const plainness = df => Math.min(1, Math.log(Math.max(df, 1)) / Math.log(30));

/** Films well enough known to steer by: renowned, with a poster, and not kept out of tonight. */
export function landmarksOf(universe, veil = null) {
  const out = [];
  for (let star = 0; star < universe.base; star += 1) {
    const film = universe.films[star];
    if ((film.rn ?? 0) >= 3 && (film.p || film.pu) && !(veil && veil.has(star))) out.push(star);
  }
  return out;
}

/**
 * How the sky leans after a list of choices: a weight for every film, 1 at most, 0 for the films never offered.
 * @param {Array<[number, number]>} choices [chosen, passed over]
 * @param {Set<number>|null} exclude films never offered (watched, loved, set aside, outside tonight's seeing, shown)
 */
export function leaning(universe, choices, exclude = null, scoresOf = null) {
  const count = universe.count;
  const scores = scoresOf || (star => universe.model.scores('white', star));
  const weight = new Float64Array(count).fill(1);
  if (exclude) for (const star of exclude) if (star >= 0 && star < count) weight[star] = 0;
  for (const [chosen, passed] of choices) {
    const near = scores(chosen);
    const far = scores(passed);
    for (let j = 0; j < count; j += 1) if (weight[j]) weight[j] *= Math.exp(TILT * ((near[j] || 0) - (far[j] || 0)));
    let top = 0;
    for (let j = 0; j < count; j += 1) if (weight[j] > top) top = weight[j];
    if (top > 0) for (let j = 0; j < count; j += 1) weight[j] /= top;
  }
  return weight;
}

/**
 * A few words for one film of a pair, said against the other: the things it is that the other is not.
 * @returns {number[]} trait ids, at most `limit`
 */
export function poleWords(universe, star, other, limit = 3) {
  const { model, traits } = universe;
  const out = [];
  const said = new Set();
  for (const { light, kinds } of SAID) {
    if (out.length >= limit) break;
    const theirs = new Set(model.index[light].traits(other, 40).map(entry => entry.trait));
    let found = null;
    for (const entry of model.index[light].traits(star, 14)) {
      const record = traits[entry.trait];
      const df = record.df || 0;
      // Not a hidden turn, not something nearly every film is (sincerity), not something both are.
      if (record.v || !kinds.has(record.k) || df < 3 || df > 520 || theirs.has(entry.trait) || said.has((record.s || record.t).toLowerCase())) continue;
      const value = entry.weight * plainness(df);
      if (!found || value > found.value) found = { trait: entry.trait, value };
    }
    if (found) { out.push(found.trait); said.add((traits[found.trait].s || traits[found.trait].t).toLowerCase()); }
  }
  return out;
}

/**
 * A bearing being taken.
 * @param {object} options
 * @param {Set<number>|null} [options.exclude] films never offered at the end (watched, loved, set aside, out of tonight's seeing)
 * @param {Set<number>|null} [options.veil] films never shown as a landmark (set aside, out of tonight's seeing)
 * @param {number} [options.seed] which pairs are shown; the choices alone decide the end
 */
export function createBearing(universe, { exclude = null, veil = null, seed = 1, rounds = BEARING_ROUNDS } = {}) {
  const random = mulberry32(seed);
  const cache = new Map();
  const scores = star => {
    if (!cache.has(star)) cache.set(star, universe.model.scores('white', star));
    return cache.get(star);
  };
  const landmarks = landmarksOf(universe, veil);
  const shown = new Set();
  const choices = [];
  let weight = leaning(universe, [], exclude, scores);
  let current = null;

  const offered = () => new Set([...(exclude || []), ...shown]);
  const fresh = star => {
    for (const other of shown) if (scores(other)[star] > FRESH) return false;
    return true;
  };

  /** The next two films: unlike each other, both near what is left, splitting it as evenly as can be. */
  function nextPair() {
    const count = universe.count;
    const pool = landmarks
      .filter(star => !shown.has(star) && fresh(star))
      .map(star => ({ star, v: Math.sqrt(weight[star] || 1e-6) * (0.6 + 0.4 * random()) }))
      .sort((a, b) => b.v - a.v)
      .slice(0, POOL)
      .map(entry => entry.star);
    let total = 0;
    for (let j = 0; j < count; j += 1) total += weight[j];
    if (!total) return null;
    let best = null;
    for (let x = 0; x < pool.length; x += 1) {
      const a = scores(pool[x]);
      for (let y = x + 1; y < pool.length; y += 1) {
        const alike = a[pool[y]];
        if (alike > APART) continue;
        const b = scores(pool[y]);
        let left = 0;
        let cover = 0;
        for (let j = 0; j < count; j += 1) {
          const w = weight[j];
          if (!w) continue;
          if (a[j] > b[j]) left += w;
          cover += w * Math.max(a[j], b[j]);
        }
        const balance = 1 - Math.abs(left / total - 0.5) * 2;
        const value = balance * (cover / total) * (1 - Math.max(0, alike));
        if (!best || value > best.value) best = { a: pool[x], b: pool[y], value, split: left / total };
      }
    }
    if (!best) return null;
    // Which stands on the left is chance, so the nearer film is not always on one side.
    const [a, b] = random() < 0.5 ? [best.a, best.b] : [best.b, best.a];
    return { a, b, words: [poleWords(universe, a, b), poleWords(universe, b, a)] };
  }

  const bearing = {
    rounds,
    get round() { return choices.length; },
    get done() { return choices.length >= rounds; },
    get choices() { return choices.map(pair => pair.slice()); },
    get weight() { return weight; },
    /** The pair to choose between now, or null when the bearing is taken (or no pair is left). */
    pair() {
      if (bearing.done) return null;
      if (!current) {
        current = nextPair();
        if (current) { shown.add(current.a); shown.add(current.b); }
      }
      return current;
    },
    /** One of the pair is nearer tonight: the sky tilts toward it and away from the other. */
    choose(star) {
      if (!current || (star !== current.a && star !== current.b)) return bearing;
      choices.push([star, star === current.a ? current.b : current.a]);
      weight = leaning(universe, choices, offered(), scores);
      current = null;
      return bearing;
    },
    /** Neither: two other films, and nothing learned. */
    skip() { current = null; return bearing; },
    /** Takes back the last choice. */
    undo() {
      if (!choices.length) return bearing;
      choices.pop();
      weight = leaning(universe, choices, offered(), scores);
      current = null;
      return bearing;
    },
    /** The films the sky leans toward now, most first. */
    lit(n) { return ranked(weight).slice(0, n); },
    shown: () => new Set(shown),
  };
  return bearing;
}

/**
 * How near each film is to where a bearing points, 0..1: a weight is the sum of a film's leanings
 * raised as a power, so its logarithm is said, not the weight itself (which falls away too steeply to show).
 */
export function bearingStrength(weight, stars, top = Math.max(...stars.map(star => weight[star]))) {
  return new Map(stars.map(star => [star, Math.max(0.04, Math.min(1, 1 + Math.log(Math.max(weight[star], 1e-300) / (top || 1)) / TILT))]));
}

/** A title cut to what a sequel or remake keeps of it: "The Godfather Part II" and "The Godfather" are both "godfather". */
export function stemOf(title) {
  return String(title || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .split(/\s*(?::|\u2013|\u2014| - | part )\s*/)[0]
    .replace(/^(the|a|an|le|la|les|il|el|der|die|das)\s+/, '')
    .replace(/\s+(?:\d+|ii|iii|iv|v|vi)$/, '')
    .replace(/[^a-z0-9]+/g, ' ').trim()
    .replace(/s$/, '');
}

function ranked(weight) {
  const out = [];
  for (let j = 0; j < weight.length; j += 1) if (weight[j] > 0) out.push(j);
  return out.sort((a, b) => weight[b] - weight[a] || a - b);
}

/**
 * What a bearing points to: three films to choose from, and the nearest few for the sky.
 * best: where it points; aside: the best of a different kind; little: the best that few have seen.
 * @param {Array<[number, number]>} choices
 * @param {{ exclude?: Set<number>|null, k?: number, galaxyOf?: ArrayLike<number>|null }} [options]
 * @returns {{ picks: Array<{ star: number, as: 'best'|'aside'|'little', near: number[], shared: number[] }>, stars: number[], strength: Map<number, number> } | null}
 */
export function bearingResult(universe, choices, { exclude = null, k = 24, galaxyOf = null } = {}) {
  if (!choices.length) return null;
  const away = new Set(exclude || []);
  for (const [chosen, passed] of choices) { away.add(chosen); away.add(passed); }
  const cache = new Map();
  const scoresOf = star => { if (!cache.has(star)) cache.set(star, universe.model.scores('white', star)); return cache.get(star); };
  const weight = leaning(universe, choices, away, scoresOf);
  const order = ranked(weight);
  if (!order.length) return null;
  const { films } = universe;
  // The three offered are new films, not a sequel or a remake of one shown ("Psycho" again after Psycho).
  const stems = new Set(choices.flat().map(star => stemOf(films[star].t)));
  const offer = order.filter(star => !stems.has(stemOf(films[star].t)));
  if (!offer.length) return null;
  const best = offer[0];
  const sims = scoresOf(best);
  const other = star => star !== best && (galaxyOf ? galaxyOf[star] !== galaxyOf[best] : true) && sims[star] < 0.3;
  const aside = offer.slice(1, 60).find(star => other(star) && (films[star].rn ?? 0) >= 2)
    ?? offer.slice(1, 60).find(other) ?? offer[1];
  const little = offer.slice(0, 160).find(star => star !== best && star !== aside && (films[star].rn ?? 0) <= 1)
    ?? offer.find(star => star !== best && star !== aside);
  const picks = [[best, 'best'], [aside, 'aside'], [little, 'little']]
    .filter(([star]) => star !== undefined && star >= 0)
    .map(([star, as]) => ({ star, as, ...reasonOf(universe, star, choices, scoresOf) }));
  const stars = order.slice(0, k);
  for (const pick of picks) if (!stars.includes(pick.star)) stars.push(pick.star);
  return { picks, stars, strength: bearingStrength(weight, stars, weight[best]) };
}

/** Why a film answers the choices: the chosen films it is nearest, and what it shares with the nearest. */
export function reasonOf(universe, star, choices, scoresOf = c => universe.model.scores('white', c)) {
  const chosen = [...new Set(choices.map(pair => pair[0]))];
  const near = chosen
    .map(c => ({ c, sim: scoresOf(c)[star] }))
    .filter(entry => entry.sim > 0)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 2)
    .map(entry => entry.c);
  // What it shares with the nearest, the telling things first: a shared decade or country alone says little.
  const all = near.length ? sharedTraits(universe, 'white', near[0], star, 5).map(entry => entry.trait) : [];
  const weak = trait => PLACE.has(universe.traits[trait].k) || (universe.traits[trait].k === 'studio' && (universe.traits[trait].df || 0) > 30);
  const shared = [...all.filter(trait => !weak(trait)), ...all.filter(weak)].slice(0, 2);
  return { near, shared };
}
