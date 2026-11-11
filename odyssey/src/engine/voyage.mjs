// Everything a voyage asks of the chart: what two films share, the six rays
// of a star, what a set of loved films pulls towards it, the film between two
// films, the passage from one to another. All of it is arithmetic over the
// likeness index, so every answer is instant and can say what it is made of.
import { LIGHTS, LIGHT_IDS } from './lights.mjs';
import { topK } from './similarity.mjs';

const WEIGHT = Object.fromEntries(LIGHTS.map(light => [light.id, light.weight]));

/**
 * What two films share: [{ trait, share, light }], strongest first.
 * Veiled traits (endings, deaths) are left out unless asked for.
 */
export function sharedTraits(universe, lightId, a, b, limit = 3, { veiled = false } = {}) {
  const { model, traits } = universe;
  const found = [];
  const lights = lightId === 'white' ? LIGHT_IDS : [lightId];
  for (const light of lights) {
    for (const entry of model.index[light].shared(a, b, 8)) {
      if (!veiled && traits[entry.trait].v) continue;
      found.push({ trait: entry.trait, share: entry.share * (lightId === 'white' ? WEIGHT[light] : 1), light });
    }
  }
  found.sort((x, y) => y.share - x.share);
  return found.slice(0, limit);
}

/** A bond in a few words: "a robbery · told out of order". */
export function bondPhrase(universe, lightId, a, b, limit = 2) {
  return sharedTraits(universe, lightId, a, b, limit).map(entry => universe.traits[entry.trait].t).join(' · ');
}

/** The light two films are closest in: { light, sim }. */
export function closestLight(universe, a, b) {
  const spectrum = universe.model.spectrum(a, b);
  let best = { light: 'story', sim: -1 };
  for (const light of LIGHT_IDS) {
    const value = spectrum[light] * WEIGHT[light];
    if (value > best.sim) best = { light, sim: value };
  }
  return best;
}

/**
 * The six rays of a star: under each light, the film it is most like.
 * No film ends two rays, so a star's system always shows six different films
 * (when the lights have that much to say).
 * @returns {Array<{ light, star, sim, shared, others }>} one entry per lit ray
 */
export function prism(universe, i, { depth = 7, exclude = null } = {}) {
  const { model } = universe;
  const lists = LIGHT_IDS.map(light => ({
    light,
    near: model.neighbours(light, i, depth, exclude ? j => !exclude.has(j) : null),
  })).filter(entry => entry.near.length);
  lists.sort((x, y) => y.near[0].sim - x.near[0].sim);
  const taken = new Set();
  const rays = [];
  for (const { light, near } of lists) {
    const pick = near.find(n => !taken.has(n.i)) || near[0];
    taken.add(pick.i);
    rays.push({
      light,
      star: pick.i,
      sim: pick.sim,
      shared: sharedTraits(universe, light, i, pick.i, 3),
      others: near.filter(n => n.i !== pick.i).map(n => ({ star: n.i, sim: n.sim })),
    });
  }
  rays.sort((x, y) => LIGHT_IDS.indexOf(x.light) - LIGHT_IDS.indexOf(y.light));
  return rays;
}

/** A star's nearest films under one light, each with what it shares. */
export function neighbourhood(universe, lightId, i, k = 12, exclude = null) {
  return universe.model.neighbours(lightId, i, k, exclude ? j => !exclude.has(j) : null).map(n => ({
    star: n.i,
    sim: n.sim,
    shared: sharedTraits(universe, lightId, i, n.i, 3),
  }));
}

/**
 * Gravity: what a set of loved films pulls towards it.
 * A film counts for how near it sits to its closest loved film, a little more
 * if a second and third also pull. `deeper` (0..1) leans away from the famous.
 * @returns {Array<{ star, score, pulls: Array<{ from, sim }> }>}
 */
export function gravity(universe, loved, { exclude = null, k = 24, deeper = 0, light = 'white' } = {}) {
  const { model, films, count } = universe;
  const list = [...loved].filter(i => i >= 0 && i < count);
  if (!list.length) return [];
  const first = new Float32Array(count);
  const second = new Float32Array(count);
  const third = new Float32Array(count);
  const firstFrom = new Int32Array(count).fill(-1);
  const secondFrom = new Int32Array(count).fill(-1);
  const scratch = new Float32Array(count);
  for (const i of list) {
    model.scores(light, i, scratch);
    for (let j = 0; j < count; j += 1) {
      const s = scratch[j];
      if (s <= 0) continue;
      if (s > first[j]) {
        third[j] = second[j];
        second[j] = first[j]; secondFrom[j] = firstFrom[j];
        first[j] = s; firstFrom[j] = i;
      } else if (s > second[j]) {
        third[j] = second[j];
        second[j] = s; secondFrom[j] = i;
      } else if (s > third[j]) {
        third[j] = s;
      }
    }
  }
  const lovedSet = new Set(list);
  const total = new Float32Array(count);
  for (let j = 0; j < count; j += 1) {
    if (lovedSet.has(j) || (exclude && exclude.has(j))) continue;
    let score = first[j] + 0.6 * second[j] + 0.3 * third[j];
    if (deeper > 0) score *= 1 + deeper * 0.14 * (2 - (films[j].rn ?? 1));
    total[j] = score;
  }
  return topK(total, k).map(({ i: star, sim: score }) => ({
    star,
    score,
    pulls: [
      { from: firstFrom[star], sim: first[star] },
      ...(secondFrom[star] >= 0 && second[star] > first[star] * 0.45 ? [{ from: secondFrom[star], sim: second[star] }] : []),
    ],
  }));
}

/**
 * The taste a set of loved films shows: which lights they sit together under,
 * and the traits they keep returning to.
 */
export function taste(universe, loved) {
  const { model, traits, count } = universe;
  const list = [...loved].filter(i => i >= 0 && i < count).slice(0, 60);
  const lights = LIGHT_IDS.map(light => {
    let sum = 0;
    let pairs = 0;
    for (let a = 0; a < list.length; a += 1) {
      for (let b = a + 1; b < list.length; b += 1) { sum += model.index[light].sim(list[a], list[b]); pairs += 1; }
    }
    return { light, strength: pairs ? sum / pairs : 0 };
  });
  const peak = Math.max(...lights.map(l => l.strength), 1e-6);
  for (const light of lights) light.share = light.strength / peak;

  const tally = new Map();
  for (const film of list) {
    for (const light of LIGHT_IDS) {
      for (const { trait, weight } of model.index[light].traits(film, 10)) {
        if (traits[trait].v) continue;
        const entry = tally.get(trait) || { trait, light, films: 0, weight: 0 };
        entry.films += 1;
        entry.weight += weight;
        tally.set(trait, entry);
      }
    }
  }
  const threads = [...tally.values()]
    .filter(entry => entry.films >= Math.min(2, list.length))
    .sort((x, y) => y.weight * Math.sqrt(y.films) - x.weight * Math.sqrt(x.films))
    .slice(0, 12);
  return { lights: lights.sort((x, y) => y.strength - x.strength), threads };
}

/** The films that sit between two films: near both, [{ star, score, a, b }]. */
export function between(universe, a, b, k = 3, exclude = null) {
  const { model, count } = universe;
  const sa = model.scores('white', a);
  const sb = model.scores('white', b);
  const mid = new Float32Array(count);
  for (let j = 0; j < count; j += 1) {
    if (j === a || j === b || (exclude && exclude.has(j))) continue;
    mid[j] = Math.min(sa[j], sb[j]) + 0.2 * Math.sqrt(sa[j] * sb[j]);
  }
  return topK(mid, k).map(({ i: star, sim: score }) => ({ star, score, a: sa[star], b: sb[star] }));
}

let roads = null; // lazily built, per universe

function roadsOf(universe) {
  if (roads && roads.universe === universe && roads.count === universe.count) return roads.near;
  const { near, nearK, base, model, count } = universe;
  const lists = Array.from({ length: count }, () => new Set());
  for (let i = 0; i < base; i += 1) {
    for (let k = 0; k < nearK; k += 1) {
      const j = near[i * nearK + k];
      if (j === 0xffff || j >= count) continue;
      lists[i].add(j);
      lists[j].add(i);
    }
  }
  // Stars charted later have no stored roads: join each to its nearest films.
  for (let i = base; i < count; i += 1) {
    for (const { i: j } of model.neighbours('white', i, 6)) { lists[i].add(j); lists[j].add(i); }
  }
  roads = { universe, count, near: lists.map(set => [...set]) };
  return roads.near;
}

/**
 * A passage: the chain of near neighbours that leads from one film to another,
 * preferring strong bonds over short cuts.
 * @returns {{ stars: number[], legs: Array<{ from, to, light, shared }> }}
 */
export function passage(universe, a, b, { maxHops = 10 } = {}) {
  const { model, count } = universe;
  if (a === b) return { stars: [a], legs: [] };
  const lists = roadsOf(universe);
  const cost = new Float64Array(count).fill(Infinity);
  const hops = new Int32Array(count);
  const previous = new Int32Array(count).fill(-1);
  const done = new Uint8Array(count);
  cost[a] = 0;
  // A small frontier: a simple array heap is plenty for a few thousand stars.
  const frontier = [a];
  while (frontier.length) {
    let at = 0;
    for (let n = 1; n < frontier.length; n += 1) if (cost[frontier[n]] < cost[frontier[at]]) at = n;
    const u = frontier.splice(at, 1)[0];
    if (done[u]) continue;
    done[u] = 1;
    if (u === b) break;
    if (hops[u] >= maxHops) continue;
    for (const v of lists[u]) {
      if (done[v]) continue;
      const strength = Math.min(1, model.sim('white', u, v) / 0.5);
      const step = cost[u] + 0.25 + (1 - strength) ** 2;
      if (step < cost[v]) {
        cost[v] = step;
        previous[v] = u;
        hops[v] = hops[u] + 1;
        frontier.push(v);
      }
    }
  }
  let stars = [];
  if (previous[b] >= 0) {
    for (let at = b; at >= 0; at = previous[at]) stars.unshift(at);
  } else {
    // No road joins them: go by way of the film most between them.
    const bridge = between(universe, a, b, 1)[0];
    stars = bridge ? [a, bridge.star, b] : [a, b];
  }
  const legs = [];
  for (let n = 0; n + 1 < stars.length; n += 1) {
    const from = stars[n];
    const to = stars[n + 1];
    const { light } = closestLight(universe, from, to);
    legs.push({ from, to, light, shared: sharedTraits(universe, light, from, to, 2) });
  }
  return { stars, legs };
}

/**
 * Where a drift goes next: the nearest star not yet visited under the given
 * light, or under white light when that light has nothing left to offer.
 */
export function driftNext(universe, i, visited, lightId = 'white') {
  const allow = j => !visited.has(j);
  const near = universe.model.neighbours(lightId, i, 5, allow);
  if (near.length) {
    // Not always the very nearest: a drift should wander.
    const pick = near[Math.min(near.length - 1, visited.size % 3)];
    return { star: pick.i, light: lightId };
  }
  const fallback = universe.model.neighbours('white', i, 3, allow);
  return fallback.length ? { star: fallback[0].i, light: 'white' } : null;
}

/** A star's own traits under each light, strongest first, veiled ones marked. */
export function traitsOf(universe, i, perLight = 6) {
  const { model, traits } = universe;
  return LIGHT_IDS.map(light => ({
    light,
    traits: model.index[light].traits(i, perLight + 6)
      .map(entry => ({ trait: entry.trait, weight: entry.weight, veiled: Boolean(traits[entry.trait].v) }))
      .slice(0, perLight + 6),
  }));
}

/** Films that carry a trait, most typical first. */
export function carriers(universe, trait) {
  const light = LIGHT_IDS[universe.traits[trait].l];
  return universe.model.index[light].carriers(trait);
}

/** For each constellation, how many of its stars have been visited. */
export function constellationProgress(universe, visited) {
  return universe.bundle.constellations.map((figure, id) => {
    const seen = figure.stars.filter(star => visited.has(star));
    return { id, seen: seen.length, total: figure.stars.length, found: seen.length >= 3 };
  });
}
