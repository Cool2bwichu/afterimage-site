// Likeness under one light. Each film is a sparse vector of weighted traits;
// two films are alike when they share rare traits. The same code runs in the
// compiler (to lay the universe out) and in the browser (to answer "what is
// near this, and why" for any film, instantly).

const SHRINK = 0.35; // films with little evidence in a light never look certain
const EPSILON = 1e-9;

/**
 * @param {object} input
 * @param {number} input.count        films
 * @param {Uint32Array} input.ptr     row pointers, count + 1
 * @param {Uint32Array|Uint16Array} input.idx  trait ids, sorted within a row
 * @param {Uint8Array} input.raw      trait weights, 1..255
 * @param {Float32Array|number[]} input.idf     per-trait rarity, 0..1
 * @param {(Float32Array|null)[]} [input.curves] optional dense curve per film (z-scored)
 * @param {number} [input.curveWeight]
 * @param {{lambda: number, median: number}} [input.scale] fixed shrinkage, so
 *   that adding films later never changes how the charted ones compare
 */
export function buildLightIndex({ count, ptr, idx, raw, idf, curves = null, curveWeight = 0, scale = null }) {
  const nnz = ptr[count];
  const weight = new Float32Array(nnz);
  const norm2 = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    let sum = 0;
    for (let p = ptr[i]; p < ptr[i + 1]; p += 1) {
      const w = (raw[p] / 255) * idf[idx[p]];
      weight[p] = w;
      sum += w * w;
    }
    norm2[i] = sum;
  }
  let median;
  let lambda;
  if (scale) {
    ({ median, lambda } = scale);
  } else {
    const positive = Array.from(norm2).filter(v => v > EPSILON).sort((a, b) => a - b);
    median = positive.length ? positive[positive.length >> 1] : 1;
    lambda = SHRINK * median;
  }
  const evidence = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const scale = 1 / Math.sqrt(norm2[i] + lambda);
    for (let p = ptr[i]; p < ptr[i + 1]; p += 1) weight[p] *= scale;
    evidence[i] = Math.min(1, norm2[i] / median);
  }

  // Inverted index: for each trait, the films that carry it.
  let maxTrait = -1;
  for (let p = 0; p < nnz; p += 1) if (idx[p] > maxTrait) maxTrait = idx[p];
  const traitCount = maxTrait + 1;
  const postPtr = new Uint32Array(traitCount + 1);
  for (let p = 0; p < nnz; p += 1) postPtr[idx[p] + 1] += 1;
  for (let t = 0; t < traitCount; t += 1) postPtr[t + 1] += postPtr[t];
  const cursor = postPtr.slice(0, traitCount);
  const postFilm = new Uint32Array(nnz);
  const postWeight = new Float32Array(nnz);
  for (let i = 0; i < count; i += 1) {
    for (let p = ptr[i]; p < ptr[i + 1]; p += 1) {
      const slot = cursor[idx[p]];
      cursor[idx[p]] += 1;
      postFilm[slot] = i;
      postWeight[slot] = weight[p];
    }
  }

  const curveLength = curves ? (curves.find(Boolean) || []).length : 0;

  function curveTerm(a, b) {
    if (!curveWeight || !curves) return 0;
    const ca = curves[a];
    const cb = curves[b];
    if (!ca || !cb) return 0;
    let dot = 0;
    for (let k = 0; k < curveLength; k += 1) dot += ca[k] * cb[k];
    return dot > 0 ? (curveWeight * dot) / curveLength : 0;
  }

  /** Likeness of film `i` to every film, written into `out` (length count). */
  function scores(i, out = new Float32Array(count)) {
    out.fill(0);
    for (let p = ptr[i]; p < ptr[i + 1]; p += 1) {
      const t = idx[p];
      const w = weight[p];
      for (let q = postPtr[t]; q < postPtr[t + 1]; q += 1) out[postFilm[q]] += w * postWeight[q];
    }
    if (curveWeight && curves && curves[i]) {
      for (let j = 0; j < count; j += 1) if (curves[j]) out[j] += curveTerm(i, j);
    }
    out[i] = 0;
    return out;
  }

  /** Likeness of two films. */
  function sim(a, b) {
    if (a === b) return 1;
    let p = ptr[a];
    let q = ptr[b];
    const pe = ptr[a + 1];
    const qe = ptr[b + 1];
    let dot = 0;
    while (p < pe && q < qe) {
      if (idx[p] === idx[q]) { dot += weight[p] * weight[q]; p += 1; q += 1; }
      else if (idx[p] < idx[q]) p += 1;
      else q += 1;
    }
    return dot + curveTerm(a, b);
  }

  /** The traits two films share, strongest first: [{ trait, share }]. */
  function shared(a, b, limit = 6) {
    let p = ptr[a];
    let q = ptr[b];
    const pe = ptr[a + 1];
    const qe = ptr[b + 1];
    const found = [];
    while (p < pe && q < qe) {
      if (idx[p] === idx[q]) { found.push({ trait: idx[p], share: weight[p] * weight[q] }); p += 1; q += 1; }
      else if (idx[p] < idx[q]) p += 1;
      else q += 1;
    }
    found.sort((x, y) => y.share - x.share);
    return found.slice(0, limit);
  }

  /** A film's own traits, strongest first: [{ trait, weight }]. */
  function traits(i, limit = 12) {
    const found = [];
    for (let p = ptr[i]; p < ptr[i + 1]; p += 1) found.push({ trait: idx[p], weight: weight[p], raw: raw[p] });
    found.sort((x, y) => y.weight - x.weight);
    return found.slice(0, limit);
  }

  /** Films carrying a trait. */
  function carriers(trait) {
    if (trait < 0 || trait >= traitCount) return [];
    const films = [];
    for (let q = postPtr[trait]; q < postPtr[trait + 1]; q += 1) films.push(postFilm[q]);
    return films;
  }

  const has = (i, trait) => {
    for (let p = ptr[i]; p < ptr[i + 1]; p += 1) if (idx[p] === trait) return true;
    return false;
  };

  return { count, evidence, scores, sim, shared, traits, carriers, has, scale: { median, lambda }, hasCurve: i => Boolean(curves && curves[i]) };
}

/** The k highest entries of a score array: [{ i, sim }], strongest first. */
export function topK(scoreArray, k, allow = null) {
  const best = [];
  let floor = 0;
  for (let i = 0; i < scoreArray.length; i += 1) {
    const s = scoreArray[i];
    if (s <= floor || s <= EPSILON) continue;
    if (allow && !allow(i)) continue;
    let at = best.length;
    while (at > 0 && best[at - 1].sim < s) at -= 1;
    best.splice(at, 0, { i, sim: s });
    if (best.length > k) best.pop();
    if (best.length === k) floor = best[k - 1].sim;
  }
  return best;
}

/** Zero-mean, unit-variance copy of a curve (so a dot product is a correlation). */
export function standardise(values) {
  const n = values.length;
  let mean = 0;
  for (const v of values) mean += v;
  mean /= n;
  let variance = 0;
  for (const v of values) variance += (v - mean) ** 2;
  const sd = Math.sqrt(variance / n);
  const out = new Float32Array(n);
  if (sd < 1e-6) return out;
  for (let k = 0; k < n; k += 1) out[k] = (values[k] - mean) / sd;
  return out;
}
