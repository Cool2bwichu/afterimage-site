// Wormholes. Most of what a film is like sits near it in the sky. But now and then a film far
// across the sky, in another galaxy and far down the list of everything alike, is one of its
// very nearest in one deep thing: what happens in it, how it feels, or what it is about. A
// wormhole is that passage: the short way through to somewhere the map says is far.
import { sharedTraits } from './voyage.mjs';

export const WORMHOLE_LIGHTS = ['story', 'feeling', 'idea'];
const FAR = 150;    // at least this far down the list of films most like it in white light
const NEAR = 15;    // and among the nearest fifteen under the one light
const TELLING = 2;  // sharing at least two telling things under that light
const RARE = 4;     // that together are rare enough to mean something (in nats: two things each in a tenth of the films, say)

// True of many films, or said elsewhere already: where and when, a big studio, the five readings of temper,
// and the beats of a story's shape, which a rough instrument reads from the plot.
const PLACE = new Set(['country', 'language', 'era', 'decade', 'axis', 'beat']);
const telling = record => !record.v && !PLACE.has(record.k) && !(record.k === 'studio' && (record.df || 0) > 30) && (record.df || 0) <= 400;
// "the making of films" and "films about films" are one thing said twice.
const wordsOf = phrase => new Set(String(phrase).toLowerCase().split(/[^a-z]+/).filter(word => word.length >= 5));

/** The telling things two films share under a light, each said once, and how rare they are together. */
function bond(universe, light, a, b) {
  const { traits, base } = universe;
  const shared = [];
  const said = new Set();
  let rare = 0;
  for (const { trait } of sharedTraits(universe, light, a, b, 8)) {
    const record = traits[trait];
    if (!telling(record)) continue;
    const words = wordsOf(record.t);
    if ([...words].some(word => said.has(word))) continue;
    for (const word of words) said.add(word);
    shared.push(trait);
    rare += Math.log(base / Math.max(1, record.df || 1));
  }
  return { shared, rare };
}

/**
 * The wormholes at a star, best first.
 * @param {{ exclude?: Set<number>|null, k?: number }} [options] exclude: films never offered (watched, set aside, out of tonight's seeing)
 * @returns {Array<{ star: number, light: string, sim: number, rank: number, shared: number[] }>}
 *   rank: how far down the white list it sits (0 is the nearest); shared: the telling things both have under that light
 */
export function wormholes(universe, star, { exclude = null, k = 2 } = {}) {
  const { base, model } = universe;
  const G = universe.galaxyOf.white;
  if (star < 0 || star >= universe.count || G[star] === undefined) return [];
  const white = model.scores('white', star);
  const found = new Map();
  for (const light of WORMHOLE_LIGHTS) {
    const near = model.neighbours(light, star, NEAR, j => j < base && j !== star && !(exclude && exclude.has(j)));
    const top = near[0]?.sim || 1;
    for (const { i: j, sim } of near) {
      if (G[j] === G[star] || G[j] === 255) continue; // another galaxy, and a charted one
      let rank = 0;
      for (let other = 0; other < base; other += 1) if (other !== star && white[other] > white[j]) rank += 1;
      if (rank < FAR) continue;
      const { shared, rare } = bond(universe, light, star, j);
      if (shared.length < TELLING || rare < RARE) continue;
      const score = (sim / top) * Math.log10(rank) * Math.sqrt(rare / RARE);
      const kept = found.get(j);
      if (!kept || score > kept.score) found.set(j, { star: j, light, sim, rank, shared: shared.slice(0, 3), score });
    }
  }
  return [...found.values()].sort((a, b) => b.score - a.score).slice(0, k)
    .map(entry => ({ star: entry.star, light: entry.light, sim: entry.sim, rank: entry.rank, shared: entry.shared }));
}
