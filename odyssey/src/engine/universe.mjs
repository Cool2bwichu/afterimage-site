// The universe model: six lights over the same films, and white light, which
// is all of them at once. Built once by the compiler (to lay the sky out) and
// once in the browser (from the bundle), with the same arithmetic.
import { decodeArray } from './codec.mjs';
import { LIGHTS, LIGHT_IDS } from './lights.mjs';
import { buildLightIndex, standardise, topK } from './similarity.mjs';

export const STORY_CURVE_WEIGHT = 0.05; // the fortune curve is a rough instrument: a tiebreak, not a verdict
export const LINK_BONUS = 0.22; // a drawn reading pulls two films together in white light

/**
 * @param {object} input
 * @param {number} input.count
 * @param {Float32Array} input.idf
 * @param {Record<string, {ptr, idx, raw}>} input.lights
 * @param {(Float32Array|null)[]} input.curves   z-scored fortune curves, or null
 * @param {Array<[number, number, number]>} [input.links]  [a, b, strength 0..1]
 */
export function createModel({ count, idf, lights, curves, links = [] }) {
  const index = {};
  for (const light of LIGHT_IDS) {
    index[light] = buildLightIndex({
      count, idf, ...lights[light],
      ...(light === 'story' ? { curves, curveWeight: STORY_CURVE_WEIGHT } : {}),
    });
  }
  const linked = Array.from({ length: count }, () => []);
  for (const [a, b, strength] of links) {
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

  return { count, index, scores, sim, neighbours, spectrum, defaultWeights };
}

/** Opens a compiled universe bundle in the browser (or a test). */
export function openUniverse(bundle) {
  const count = bundle.films.length;
  const idf = decodeArray(bundle.traitIdf, 'f32');
  const lights = {};
  for (const light of LIGHT_IDS) {
    const packed = bundle.vectors[light];
    lights[light] = {
      ptr: decodeArray(packed.ptr, 'u32'),
      idx: decodeArray(packed.idx, 'u16'),
      raw: decodeArray(packed.raw, 'u8'),
    };
  }
  const curves = bundle.films.map(film => (film.st && film.st.c ? standardise(film.st.c) : null));
  const links = bundle.links.map(link => [link[0], link[1], link[4] / 100]);
  const model = createModel({ count, idf, lights, curves, links });
  const positions = Object.fromEntries(Object.entries(bundle.positions).map(([light, text]) => [light, decodeArray(text, 'f32')]));
  const galaxyOf = Object.fromEntries(Object.entries(bundle.membership).map(([light, text]) => [light, decodeArray(text, 'u8')]));
  const armOf = Object.fromEntries(Object.entries(bundle.arms).map(([light, text]) => [light, decodeArray(text, 'u8')]));
  return { bundle, count, films: bundle.films, traits: bundle.traits, model, positions, galaxyOf, armOf };
}
