// Finds the galaxies of one light, the arms inside each, and what makes each
// family what it is: the traits it carries far more often than the rest of
// the universe does, its most typical film, and a few doors into it.
import { mulberry32, hashString } from '../../src/engine/rng.mjs';
import { neighbourGraph, findGalaxies, louvain, consolidate } from './cluster.mjs';

const UNLIT = 255;

/**
 * Traits that set a group of films apart: [{ trait, share, lift, score }].
 * `indexes` is one light's index, or all six for a family found in white light.
 */
export function distinguishingTraits({ members, indexes, traits, count, limit = 8, minShare = 0.12 }) {
  const tally = new Map();
  for (const lightIndex of indexes) {
    for (const film of members) {
      for (const { trait, raw } of lightIndex.traits(film, 64)) {
        tally.set(trait, (tally.get(trait) || 0) + raw / 255);
      }
    }
  }
  const scored = [];
  for (const [trait, mass] of tally) {
    const inside = mass / members.length;
    const outside = traits[trait].df / count;
    if (inside < minShare) continue;
    const lift = inside / Math.max(outside, 1e-6);
    scored.push({ trait, share: inside, lift, score: inside * Math.log(1 + lift) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export function formGalaxies({ lightId, count, scores, indexes, traits, films, target = 12, minSize = 20, k = 12, seed = 1 }) {
  const random = mulberry32(hashString(`${lightId}:${seed}`));
  const graph = neighbourGraph({ count, scores, k, floor: 0.08 });
  const found = findGalaxies({ n: count, edges: graph.edges, target, minSize, random });
  const membership = found.membership;

  const groups = new Map();
  membership.forEach((g, i) => { if (g >= 0) { if (!groups.has(g)) groups.set(g, []); groups.get(g).push(i); } });

  // Within each galaxy: how central each film is, and the arms it divides into.
  const centrality = new Float32Array(count);
  const galaxyOf = new Uint8Array(count).fill(UNLIT);
  const armOf = new Uint8Array(count).fill(UNLIT);
  const galaxies = [];
  const buffer = new Float32Array(count);
  const local = new Int32Array(count).fill(-1);

  for (const [g, members] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    members.forEach((film, at) => { local[film] = at; galaxyOf[film] = g; });
    for (const film of members) {
      scores(film, buffer);
      let sum = 0;
      for (const other of members) sum += buffer[other];
      centrality[film] = sum / Math.max(1, members.length - 1);
    }
    const inner = graph.edges
      .filter(([a, b]) => membership[a] === g && membership[b] === g)
      .map(([a, b, w]) => [local[a], local[b], w]);
    const wanted = Math.max(2, Math.min(6, Math.round(members.length / 45) + 2));
    let arms = null;
    for (const resolution of [0.8, 1.1, 1.5, 2, 2.6]) {
      const labels = consolidate({
        n: members.length, edges: inner,
        membership: louvain({ n: members.length, edges: inner, resolution, random }),
        minSize: Math.max(4, Math.floor(members.length / 14)),
      });
      const distinct = new Set(labels);
      distinct.delete(-1);
      if (!arms || Math.abs(distinct.size - wanted) < Math.abs(arms.count - wanted)) arms = { labels, count: distinct.size };
    }
    members.forEach((film, at) => { armOf[film] = arms.labels[at] >= 0 ? arms.labels[at] : 0; });
    for (const film of members) local[film] = -1;

    const byCentrality = [...members].sort((a, b) => centrality[b] - centrality[a]);
    const doors = [];
    // A door is a film people may already know that also sits well inside the family.
    const wellInside = byCentrality.slice(0, Math.max(5, Math.ceil(byCentrality.length * 0.6)));
    const pick = test => { const film = wellInside.find(f => test(films[f]) && !doors.includes(f)); if (film !== undefined) doors.push(film); };
    pick(f => f.renown >= 4);
    pick(f => f.renown === 3);
    pick(f => f.renown === 2);
    pick(f => f.renown <= 1);
    pick(() => true);
    const armList = [];
    for (let arm = 0; arm < Math.max(1, arms.count); arm += 1) {
      const armMembers = members.filter(film => armOf[film] === arm);
      if (!armMembers.length) continue;
      armList.push({
        arm,
        size: armMembers.length,
        top: distinguishingTraits({ members: armMembers, indexes, traits, count, limit: 6 }),
        lead: [...armMembers].sort((a, b) => centrality[b] - centrality[a]).slice(0, 4),
      });
    }
    galaxies.push({
      g,
      size: members.length,
      medoid: byCentrality[0],
      typical: byCentrality.slice(0, 8),
      doors,
      top: distinguishingTraits({ members, indexes, traits, count, limit: 12 }),
      arms: armList,
    });
  }
  return { galaxies, galaxyOf, armOf, centrality, graph, resolution: found.resolution, tried: found.tried };
}

export { UNLIT };
