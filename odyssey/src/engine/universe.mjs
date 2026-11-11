// The universe model: six lights over the same films, and white light, which
// is all of them at once. Built once by the compiler (to lay the sky out) and
// once in the browser (from the bundle), with the same arithmetic.
//
// In the browser the universe is open-ended. The chart is fixed, but stars
// charted later (the deep field) are appended: they take their place among the
// charted films they are most like, and never move the films already there.
import { decodeArray } from './codec.mjs';
import { LIGHTS, LIGHT_IDS } from './lights.mjs';
import { buildLightIndex, standardise, topK } from './similarity.mjs';
import { mulberry32, hashString, gaussian } from './rng.mjs';

export const STORY_CURVE_WEIGHT = 0.05; // the fortune curve is a rough instrument: a tiebreak, not a verdict
export const LINK_BONUS = 0.22; // a drawn reading pulls two films together in white light
export const SKIES = ['white', ...LIGHT_IDS];
export const UNLIT = 255;
const NEIGHBOUR_FLOOR = 0.08; // below this a light has nothing to say about two films

/**
 * @param {object} input
 * @param {number} input.count
 * @param {Float32Array} input.idf
 * @param {Record<string, {ptr, idx, raw}>} input.lights
 * @param {(Float32Array|null)[]} input.curves   z-scored fortune curves, or null
 * @param {Array<[number, number, number]>} [input.links]  [a, b, strength 0..1]
 * @param {Record<string, {lambda, median}>} [input.scale] fixed shrinkage per light
 */
export function createModel({ count, idf, lights, curves, links = [], scale = null }) {
  const index = {};
  for (const light of LIGHT_IDS) {
    index[light] = buildLightIndex({
      count, idf, ...lights[light],
      ...(scale ? { scale: scale[light] } : {}),
      ...(light === 'story' ? { curves, curveWeight: STORY_CURVE_WEIGHT } : {}),
    });
  }
  const linked = Array.from({ length: count }, () => []);
  for (const [a, b, strength] of links) {
    if (a >= count || b >= count) continue;
    linked[a].push([b, strength]);
    linked[b].push([a, strength]);
  }
  const scratch = new Float32Array(count);
  const defaultWeights = Object.fromEntries(LIGHTS.map(light => [light.id, light.weight]));

  /** Likeness of film i to every film under a light ("white" blends all six). */
  function scores(lightId, i, out = new Float32Array(count), weights = defaultWeights) {
    if (lightId !== 'white') return index[lightId].scores(i, out);
    out.fill(0);
    let total = 0;
    for (const light of LIGHT_IDS) {
      const w = weights[light] ?? 0;
      if (w <= 0) continue;
      total += w;
      index[light].scores(i, scratch);
      for (let j = 0; j < count; j += 1) out[j] += w * scratch[j];
    }
    if (total > 0) for (let j = 0; j < count; j += 1) out[j] /= total;
    for (const [j, strength] of linked[i]) out[j] += LINK_BONUS * strength;
    out[i] = 0;
    return out;
  }

  function sim(lightId, a, b, weights = defaultWeights) {
    if (lightId !== 'white') return index[lightId].sim(a, b);
    let total = 0;
    let sum = 0;
    for (const light of LIGHT_IDS) {
      const w = weights[light] ?? 0;
      if (w <= 0) continue;
      total += w;
      sum += w * index[light].sim(a, b);
    }
    let value = total > 0 ? sum / total : 0;
    for (const [j, strength] of linked[a]) if (j === b) value += LINK_BONUS * strength;
    return value;
  }

  function neighbours(lightId, i, k = 8, allow = null, weights = defaultWeights) {
    return topK(scores(lightId, i, undefined, weights), k, allow);
  }

  /** Per-light likeness of two films: { story: 0.4, feeling: 0.1, ... }. */
  function spectrum(a, b) {
    return Object.fromEntries(LIGHT_IDS.map(light => [light, index[light].sim(a, b)]));
  }

  const usedScale = Object.fromEntries(LIGHT_IDS.map(light => [light, index[light].scale]));
  return { count, index, scores, sim, neighbours, spectrum, defaultWeights, scale: usedScale, linked };
}

function grown(array, length, fill = 0) {
  if (array.length >= length) return array;
  const next = new array.constructor(Math.max(length, Math.ceil(array.length * 1.5)));
  if (fill) next.fill(fill);
  next.set(array);
  return next;
}

/**
 * Opens a compiled universe bundle in the browser (or a test).
 *
 * The returned universe can grow: `addStars` appends films charted after the
 * fact. `count` is live; `base` is the number of charted films and never moves.
 */
export function openUniverse(bundle) {
  const base = bundle.films.length;
  const films = bundle.films.slice();
  const traits = bundle.traits.slice();
  let idf = decodeArray(bundle.traitIdf, 'f32');
  const rows = {};
  for (const light of LIGHT_IDS) {
    const packed = bundle.vectors[light];
    rows[light] = {
      ptr: decodeArray(packed.ptr, 'u32'),
      idx: decodeArray(packed.idx, 'u16'),
      raw: decodeArray(packed.raw, 'u8'),
    };
  }
  const curves = films.map(film => (film.st && film.st.c ? standardise(film.st.c) : null));
  const links = bundle.links.map(link => [link[0], link[1], link[4] / 100]);
  let model = createModel({ count: base, idf, lights: rows, curves, links });
  const scale = model.scale; // frozen: later stars never change how charted films compare

  const positions = Object.fromEntries(SKIES.map(sky => [sky, decodeArray(bundle.positions[sky], 'f32')]));
  const galaxyOf = Object.fromEntries(SKIES.map(sky => [sky, decodeArray(bundle.membership[sky], 'u8')]));
  const armOf = Object.fromEntries(SKIES.map(sky => [sky, decodeArray(bundle.arms[sky], 'u8')]));
  const near = bundle.near ? decodeArray(bundle.near.white, 'u16') : new Uint16Array(0);
  const nearK = bundle.near ? bundle.near.k : 0;

  // How far out the unlit ring sits in each sky (measured from the chart itself).
  const ringOf = {};
  for (const sky of SKIES) {
    let reach = 0;
    const P = positions[sky];
    for (let i = 0; i < base; i += 1) {
      if (galaxyOf[sky][i] === UNLIT) continue;
      reach = Math.max(reach, Math.hypot(P[i * 3], P[i * 3 + 2]));
    }
    ringOf[sky] = reach || 1000;
  }

  const traitIds = new Map(); // "light|label" → id, lower-cased
  traits.forEach((trait, id) => traitIds.set(`${trait.l}|${trait.t.toLowerCase()}`, id));
  const slugs = new Map(films.map((film, i) => [film.s, i]));
  const listeners = new Set();

  const universe = {
    bundle, base, films, traits, rows, positions, galaxyOf, armOf, near, nearK,
    galaxies: bundle.galaxies,
    get count() { return films.length; },
    get model() { return model; },
    get idf() { return idf; },
    isDeep: i => i >= base,
    indexOfSlug: slug => (slugs.has(slug) ? slugs.get(slug) : -1),
    onGrow(listener) { listeners.add(listener); return () => listeners.delete(listener); },

    /** The id of a trait by its light and label, or -1. */
    traitId(lightId, label) {
      const id = traitIds.get(`${LIGHT_IDS.indexOf(lightId)}|${String(label).toLowerCase()}`);
      return id === undefined ? -1 : id;
    },

    /**
     * Finds or makes a trait. New traits exist only in this session's universe:
     * they let two stars charted later share a maker the chart never met.
     */
    ensureTrait({ light, kind, label, short }) {
      const found = universe.traitId(light, label);
      if (found >= 0) return found;
      if (traits.length >= 65535) return -1;
      const id = traits.length;
      traits.push({ l: LIGHT_IDS.indexOf(light), k: kind, t: label, s: short || label, df: 1, rt: 1 });
      traitIds.set(`${LIGHT_IDS.indexOf(light)}|${label.toLowerCase()}`, id);
      const next = new Float32Array(traits.length);
      next.set(idf);
      // As rare as a trait two charted films share: the strongest kind of bond.
      next[id] = (Math.log(base / 2) / Math.log(base)) ** 0.6;
      idf = next;
      return id;
    },

    /**
     * Appends stars charted after the fact.
     * @param {Array<{ film: object, rows: Record<string, Array<[number, number]>>, from?: number, fromSlug?: string }>} stars
     *   film: a record with the bundle's short keys; rows: [traitId, weight 0..1] per light;
     *   from: the star it was sighted from, if any (they are drawn together in white light);
     *   fromSlug: the same by slug, for a star that may be earlier in this very list
     * @returns {number[]} the new stars' indexes (an existing slug returns its index)
     */
    addStars(stars) {
      const added = [];
      const fresh = [];
      for (const star of stars) {
        const existing = universe.indexOfSlug(star.film.s);
        if (existing >= 0) { added.push(existing); continue; }
        const i = films.length;
        films.push(star.film);
        slugs.set(star.film.s, i);
        curves.push(null);
        const from = Number.isInteger(star.from) ? star.from : (typeof star.fromSlug === 'string' ? universe.indexOfSlug(star.fromSlug) : -1);
        if (from >= 0 && from < i) links.push([from, i, 0.6]);
        fresh.push({ i, star });
        added.push(i);
      }
      if (!fresh.length) return added;

      const count = films.length;
      for (const light of LIGHT_IDS) {
        const current = rows[light];
        const extra = fresh.map(({ star }) => {
          const merged = new Map();
          for (const [trait, weight] of star.rows[light] || []) {
            if (!(trait >= 0) || trait >= traits.length || !(weight > 0)) continue;
            if (traits[trait].l !== LIGHT_IDS.indexOf(light)) continue;
            merged.set(trait, Math.max(merged.get(trait) || 0, Math.min(1, weight)));
          }
          return [...merged.entries()].sort((a, b) => a[0] - b[0]);
        });
        const nnz = current.ptr[count - fresh.length] + extra.reduce((sum, list) => sum + list.length, 0);
        const ptr = new Uint32Array(count + 1);
        ptr.set(current.ptr.subarray(0, count - fresh.length + 1));
        const idx = new Uint16Array(nnz);
        idx.set(current.idx.subarray(0, current.ptr[count - fresh.length]));
        const raw = new Uint8Array(nnz);
        raw.set(current.raw.subarray(0, current.ptr[count - fresh.length]));
        let at = current.ptr[count - fresh.length];
        extra.forEach((list, n) => {
          for (const [trait, weight] of list) {
            idx[at] = trait;
            raw[at] = Math.max(1, Math.min(255, Math.round(weight * 255)));
            at += 1;
          }
          ptr[count - fresh.length + n + 1] = at;
        });
        rows[light] = { ptr, idx, raw };
      }
      model = createModel({ count, idf, lights: rows, curves, links, scale });

      for (const sky of SKIES) {
        positions[sky] = grown(positions[sky], count * 3);
        galaxyOf[sky] = grown(galaxyOf[sky], count, UNLIT);
        armOf[sky] = grown(armOf[sky], count, UNLIT);
      }
      const scratch = new Float32Array(count);
      for (const { i } of fresh) placeStar(i, scratch);
      for (const listener of listeners) listener({ added: fresh.map(entry => entry.i), count });
      return added;
    },
  };

  // A new star takes its place among the films it is most like, in each sky.
  function placeStar(i, scratch) {
    for (const sky of SKIES) {
      const P = positions[sky];
      const G = galaxyOf[sky];
      const random = mulberry32(hashString(`deep:${films[i].s}:${sky}`));
      model.scores(sky, i, scratch);
      const nearest = topK(scratch, 6, j => j < i && G[j] !== UNLIT);
      if (!nearest.length || nearest[0].sim < NEIGHBOUR_FLOOR) {
        // Nothing to go on under this light: the star waits on the outer ring.
        const angle = random() * Math.PI * 2;
        const r = ringOf[sky] * (1.08 + random() * 0.3);
        P[i * 3] = Math.cos(angle) * r;
        P[i * 3 + 1] = gaussian(random) * ringOf[sky] * 0.04;
        P[i * 3 + 2] = Math.sin(angle) * r;
        G[i] = UNLIT;
        armOf[sky][i] = UNLIT;
        continue;
      }
      const votes = new Map();
      for (const { i: j, sim } of nearest) votes.set(G[j], (votes.get(G[j]) || 0) + sim);
      let home = nearest[0].i;
      let best = -1;
      for (const [g, weight] of votes) if (weight > best) { best = weight; home = g; }
      const kin = nearest.filter(n => G[n.i] === home);
      let x = 0; let y = 0; let z = 0; let total = 0;
      for (const { i: j, sim } of kin) {
        const w = sim * sim;
        x += P[j * 3] * w; y += P[j * 3 + 1] * w; z += P[j * 3 + 2] * w; total += w;
      }
      x /= total; y /= total; z /= total;
      let spread = 0;
      for (const { i: j } of kin) spread += Math.hypot(P[j * 3] - x, P[j * 3 + 1] - y, P[j * 3 + 2] - z);
      spread = Math.min(26, Math.max(7, (spread / kin.length) * 0.4));
      P[i * 3] = x + gaussian(random) * spread;
      P[i * 3 + 1] = y + gaussian(random) * spread * 0.5;
      P[i * 3 + 2] = z + gaussian(random) * spread;
      G[i] = home;
      armOf[sky][i] = armOf[sky][kin[0].i];
    }
  }

  return universe;
}
