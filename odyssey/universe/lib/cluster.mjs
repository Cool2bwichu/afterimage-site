// Galaxies are found, not assigned: films are joined to their nearest
// neighbours under a light, and the Louvain method finds the families that
// hold together more tightly than chance.
import { shuffle } from '../../src/engine/rng.mjs';
import { topK } from '../../src/engine/similarity.mjs';

/** Nearest-neighbour graph under one scoring function: undirected [a, b, weight]. */
export function neighbourGraph({ count, scores, k = 12, floor = 0.1 }) {
  const lists = [];
  const buffer = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    scores(i, buffer);
    lists.push(topK(buffer, k).filter(n => n.sim >= floor));
  }
  const edges = new Map();
  lists.forEach((list, a) => {
    for (const { i: b, sim } of list) {
      const key = a < b ? a * count + b : b * count + a;
      const existing = edges.get(key);
      // Listed from both sides: a mutual bond, weighted up.
      edges.set(key, existing ? Math.max(existing, sim) * 1.5 : sim);
    }
  });
  return { lists, edges: [...edges.entries()].map(([key, w]) => [Math.floor(key / count), key % count, w]) };
}

function aggregate(n, edges, community) {
  const ids = new Map();
  const relabel = new Int32Array(n);
  for (let i = 0; i < n; i += 1) {
    if (!ids.has(community[i])) ids.set(community[i], ids.size);
    relabel[i] = ids.get(community[i]);
  }
  const merged = new Map();
  for (const [a, b, w] of edges) {
    const ca = relabel[a];
    const cb = relabel[b];
    const key = ca <= cb ? ca * ids.size + cb : cb * ids.size + ca;
    merged.set(key, (merged.get(key) || 0) + w);
  }
  return {
    n: ids.size,
    relabel,
    edges: [...merged.entries()].map(([key, w]) => [Math.floor(key / ids.size), key % ids.size, w]),
  };
}

function localMoving(n, edges, resolution, random) {
  const adjacency = Array.from({ length: n }, () => []);
  const degree = new Float64Array(n);
  let total = 0;
  for (const [a, b, w] of edges) {
    if (a === b) {
      adjacency[a].push([a, 2 * w]);
      degree[a] += 2 * w;
    } else {
      adjacency[a].push([b, w]);
      adjacency[b].push([a, w]);
      degree[a] += w;
      degree[b] += w;
    }
    total += 2 * w;
  }
  const community = Int32Array.from({ length: n }, (_, i) => i);
  const communityDegree = Float64Array.from(degree);
  if (total === 0) return { community, moved: false };
  const order = shuffle(Array.from({ length: n }, (_, i) => i), random);
  let movedAny = false;
  for (let pass = 0; pass < 40; pass += 1) {
    let moves = 0;
    for (const node of order) {
      const current = community[node];
      const links = new Map();
      for (const [other, w] of adjacency[node]) {
        if (other === node) continue;
        const c = community[other];
        links.set(c, (links.get(c) || 0) + w);
      }
      communityDegree[current] -= degree[node];
      let best = current;
      let bestGain = (links.get(current) || 0) - (resolution * communityDegree[current] * degree[node]) / total;
      for (const [c, w] of links) {
        const gain = w - (resolution * communityDegree[c] * degree[node]) / total;
        if (gain > bestGain + 1e-12) { best = c; bestGain = gain; }
      }
      communityDegree[best] += degree[node];
      if (best !== current) { community[node] = best; moves += 1; }
    }
    if (!moves) break;
    movedAny = true;
  }
  return { community, moved: movedAny };
}

/** Louvain communities of a weighted graph. Returns an Int32Array of labels 0..c-1. */
export function louvain({ n, edges, resolution = 1, random }) {
  let membership = Int32Array.from({ length: n }, (_, i) => i);
  let level = { n, edges };
  for (let depth = 0; depth < 12; depth += 1) {
    const { community, moved } = localMoving(level.n, level.edges, resolution, random);
    const next = aggregate(level.n, level.edges, community);
    for (let i = 0; i < n; i += 1) membership[i] = next.relabel[membership[i]];
    if (!moved || next.n === level.n) break;
    level = { n: next.n, edges: next.edges };
  }
  return membership;
}

/**
 * Folds communities smaller than `minSize` into the community they are most
 * tied to. Nodes with no ties at all get -1. Returns labels 0..c-1, largest first.
 */
export function consolidate({ n, edges, membership, minSize }) {
  const labels = Int32Array.from(membership);
  for (let round = 0; round < 6; round += 1) {
    const sizes = new Map();
    for (const c of labels) if (c >= 0) sizes.set(c, (sizes.get(c) || 0) + 1);
    const small = new Set([...sizes.entries()].filter(([, size]) => size < minSize).map(([c]) => c));
    if (!small.size) break;
    const ties = new Map(); // small community -> Map(other community -> weight)
    for (const [a, b, w] of edges) {
      const ca = labels[a];
      const cb = labels[b];
      if (ca === cb || ca < 0 || cb < 0) continue;
      if (small.has(ca)) { if (!ties.has(ca)) ties.set(ca, new Map()); ties.get(ca).set(cb, (ties.get(ca).get(cb) || 0) + w); }
      if (small.has(cb)) { if (!ties.has(cb)) ties.set(cb, new Map()); ties.get(cb).set(ca, (ties.get(cb).get(ca) || 0) + w); }
    }
    const target = new Map();
    // Smallest first, so fragments join something larger than themselves.
    for (const c of [...small].sort((x, y) => sizes.get(x) - sizes.get(y))) {
      const options = ties.get(c);
      if (!options) { target.set(c, -1); continue; }
      let best = -1;
      let bestScore = 0;
      for (const [other, w] of options) {
        const score = w * (small.has(other) ? 0.6 : 1);
        if (score > bestScore) { best = other; bestScore = score; }
      }
      target.set(c, best);
    }
    let changed = false;
    for (let i = 0; i < n; i += 1) {
      if (target.has(labels[i])) { labels[i] = target.get(labels[i]); changed = true; }
    }
    if (!changed) break;
  }
  const sizes = new Map();
  for (const c of labels) if (c >= 0) sizes.set(c, (sizes.get(c) || 0) + 1);
  // A fragment that never found a home larger than itself is left unlit.
  const order = [...sizes.entries()].filter(([, size]) => size >= minSize).sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([c]) => c);
  const rank = new Map(order.map((c, i) => [c, i]));
  return Int32Array.from(labels, c => (rank.has(c) ? rank.get(c) : -1));
}

/**
 * Tries a range of resolutions and keeps the one that gives about `target`
 * families without letting one family swallow the sky.
 */
export function findGalaxies({ n, edges, target = 12, minSize = 20, random, resolutions = [0.3, 0.4, 0.5, 0.6, 0.7, 0.85, 1, 1.2, 1.45, 1.75, 2.1] }) {
  let best = null;
  const tried = [];
  for (const resolution of resolutions) {
    const membership = consolidate({ n, edges, membership: louvain({ n, edges, resolution, random }), minSize });
    const sizes = new Map();
    for (const c of membership) if (c >= 0) sizes.set(c, (sizes.get(c) || 0) + 1);
    const lit = [...sizes.values()].reduce((a, b) => a + b, 0);
    const largest = lit ? Math.max(...sizes.values()) / lit : 1;
    const miss = Math.abs(sizes.size - target) / target + 2.5 * Math.max(0, largest - 0.2);
    tried.push({ resolution, count: sizes.size, largest: Math.round(largest * 100) / 100, lit });
    if (!best || miss < best.miss) best = { membership, miss, resolution, count: sizes.size };
  }
  return { ...best, tried };
}
