// Lays one light's sky out in three dimensions. Galaxies that share many
// neighbours sit near each other; inside a galaxy each arm is a family of its
// own, the most typical films sit at the core, and neighbours stay close.
// Everything is seeded, so the same corpus always yields the same sky.
import { mulberry32, hashString, gaussian } from '../../src/engine/rng.mjs';

const UNLIT = 255;
const TAU = Math.PI * 2;

export const UNIVERSE_RADIUS = 1000; // every sky is scaled so its galaxies fit inside this

const galaxyRadius = size => 30 + 7.5 * Math.sqrt(size);

/** Where each galaxy sits: related galaxies nearer, none overlapping, a shallow slab. */
function placeGalaxies({ galaxies, galaxyOf, edges, random }) {
  const n = galaxies.length;
  const radius = galaxies.map(g => galaxyRadius(g.size));
  const slot = new Map(galaxies.map((g, at) => [g.g, at]));

  const affinity = Array.from({ length: n }, () => new Float64Array(n));
  for (const [a, b, w] of edges) {
    const ga = slot.get(galaxyOf[a]);
    const gb = slot.get(galaxyOf[b]);
    if (ga === undefined || gb === undefined || ga === gb) continue;
    affinity[ga][gb] += w;
    affinity[gb][ga] += w;
  }
  let strongest = 0;
  for (let a = 0; a < n; a += 1) {
    for (let b = 0; b < n; b += 1) {
      affinity[a][b] /= Math.sqrt(galaxies[a].size * galaxies[b].size);
      if (affinity[a][b] > strongest) strongest = affinity[a][b];
    }
  }

  // Wanted distance: rims apart by a gap that shrinks as two families share more.
  const wanted = (a, b) => (radius[a] + radius[b]) * (1.12 + 1.5 * (1 - (strongest ? affinity[a][b] / strongest : 0)) ** 2);

  const x = new Float64Array(n);
  const z = new Float64Array(n);
  for (let a = 0; a < n; a += 1) {
    const angle = (a / n) * TAU + random() * 0.4;
    const reach = 260 + 420 * Math.sqrt((a + 0.5) / n);
    x[a] = Math.cos(angle) * reach;
    z[a] = Math.sin(angle) * reach;
  }
  for (let step = 0; step < 900; step += 1) {
    const rate = 0.12 * (1 - step / 1100);
    for (let a = 0; a < n; a += 1) {
      for (let b = a + 1; b < n; b += 1) {
        let dx = x[b] - x[a];
        let dz = z[b] - z[a];
        let d = Math.hypot(dx, dz);
        if (d < 1e-6) { dx = random() - 0.5; dz = random() - 0.5; d = Math.hypot(dx, dz); }
        const target = wanted(a, b);
        const floor = (radius[a] + radius[b]) * 1.1;
        // Close pairs are held to their distance; far pairs are only nudged.
        const pull = d < floor ? 1 : 0.18 + 0.82 * (strongest ? affinity[a][b] / strongest : 0);
        const move = ((d - target) / d) * rate * pull * 0.5;
        x[a] += dx * move; z[a] += dz * move;
        x[b] -= dx * move; z[b] -= dz * move;
      }
    }
    // A slight draw to the middle keeps unrelated families from drifting off.
    for (let a = 0; a < n; a += 1) { x[a] *= 0.9985; z[a] *= 0.9985; }
  }
  // Final pass: no overlaps at all.
  for (let step = 0; step < 200; step += 1) {
    let moved = false;
    for (let a = 0; a < n; a += 1) {
      for (let b = a + 1; b < n; b += 1) {
        const dx = x[b] - x[a];
        const dz = z[b] - z[a];
        const d = Math.hypot(dx, dz) || 1e-6;
        const floor = (radius[a] + radius[b]) * 1.1;
        if (d >= floor) continue;
        const push = ((floor - d) / d) * 0.5;
        x[a] -= dx * push; z[a] -= dz * push;
        x[b] += dx * push; z[b] += dz * push;
        moved = true;
      }
    }
    if (!moved) break;
  }

  let cx = 0;
  let cz = 0;
  let total = 0;
  galaxies.forEach((g, a) => { cx += x[a] * g.size; cz += z[a] * g.size; total += g.size; });
  cx /= total; cz /= total;
  // Turn the whole sky so its long axis runs left to right: screens are wide.
  let sxx = 0;
  let szz = 0;
  let sxz = 0;
  galaxies.forEach((g, a) => {
    const dx = x[a] - cx;
    const dz = z[a] - cz;
    sxx += g.size * dx * dx; szz += g.size * dz * dz; sxz += g.size * dx * dz;
  });
  const turn = -0.5 * Math.atan2(2 * sxz, sxx - szz);
  const cosT = Math.cos(turn);
  const sinT = Math.sin(turn);
  let reach = 0;
  for (let a = 0; a < n; a += 1) reach = Math.max(reach, Math.hypot(x[a] - cx, z[a] - cz) + radius[a]);
  return galaxies.map((g, a) => {
    const dx = x[a] - cx;
    const dz = z[a] - cz;
    return {
      g: g.g,
      radius: radius[a],
      x: dx * cosT - dz * sinT,
      // Depth: the families do not sit on a table; they hang at different heights.
      y: gaussian(random) * reach * 0.11,
      z: dx * sinT + dz * cosT,
      tiltX: (random() - 0.5) * 1.3,
      tiltZ: (random() - 0.5) * 1.3,
      twist: (1.7 + random() * 1.1) * (random() < 0.5 ? -1 : 1),
    };
  });
}

/** Orders a galaxy's arms round the disc so that related arms are neighbours. */
function orderArms({ arms, members, armOf, edges, inGalaxy }) {
  const ids = arms.map(arm => arm.arm);
  if (ids.length <= 2) return ids;
  const at = new Map(ids.map((id, i) => [id, i]));
  const tie = ids.map(() => new Float64Array(ids.length));
  for (const [a, b, w] of edges) {
    if (!inGalaxy(a) || !inGalaxy(b)) continue;
    const ia = at.get(armOf[a]);
    const ib = at.get(armOf[b]);
    if (ia === undefined || ib === undefined || ia === ib) continue;
    tie[ia][ib] += w;
    tie[ib][ia] += w;
  }
  const order = [0];
  const used = new Set(order);
  while (order.length < ids.length) {
    const last = order[order.length - 1];
    let best = -1;
    let bestTie = -1;
    for (let i = 0; i < ids.length; i += 1) {
      if (used.has(i)) continue;
      if (tie[last][i] > bestTie) { best = i; bestTie = tie[last][i]; }
    }
    order.push(best);
    used.add(best);
  }
  void members;
  return order.map(i => ids[i]);
}

/** Positions inside one galaxy, on the unit disc, before twist and tilt. */
function shapeGalaxy({ galaxy, members, armOf, centrality, edges, random }) {
  const local = new Map(members.map((film, at) => [film, at]));
  const inGalaxy = film => local.has(film);
  const order = orderArms({ arms: galaxy.arms, members, armOf, edges, inGalaxy });

  // Each arm gets a wedge, wider for bigger arms, with dark lanes between.
  const sizes = new Map(galaxy.arms.map(arm => [arm.arm, arm.size]));
  const share = order.map(id => sizes.get(id) ** 0.7);
  const totalShare = share.reduce((a, b) => a + b, 0);
  const wedge = new Map();
  let cursor = random() * TAU;
  order.forEach((id, i) => {
    const width = (share[i] / totalShare) * TAU;
    wedge.set(id, { centre: cursor + width / 2, half: (width / 2) * (order.length > 1 ? 0.64 : 1) });
    cursor += width;
  });

  const px = new Float64Array(members.length);
  const pz = new Float64Array(members.length);
  const homeX = new Float64Array(members.length);
  const homeZ = new Float64Array(members.length);

  // The films the whole family turns on make the core: a bright, crowded bulge.
  const ranking = [...members].sort((a, b) => centrality[b] - centrality[a]);
  const coreCount = Math.max(3, Math.round(members.length * 0.13));
  const inCore = new Set(ranking.slice(0, coreCount));
  ranking.slice(0, coreCount).forEach((film, rank) => {
    const reach = 0.02 + 0.15 * Math.sqrt((rank + 0.5) / coreCount);
    const angle = random() * TAU;
    const at = local.get(film);
    homeX[at] = px[at] = Math.cos(angle) * reach;
    homeZ[at] = pz[at] = Math.sin(angle) * reach;
  });

  const byArm = new Map();
  for (const film of members) {
    if (inCore.has(film)) continue;
    const id = armOf[film];
    if (!byArm.has(id)) byArm.set(id, []);
    byArm.get(id).push(film);
  }
  for (const [id, films] of byArm) {
    const ranked = [...films].sort((a, b) => centrality[b] - centrality[a]);
    const span = wedge.get(id) || { centre: 0, half: Math.PI };
    ranked.forEach((film, rank) => {
      // The most typical films of an arm sit nearest the core.
      const reach = 0.16 + 0.84 * ((rank + 0.5) / ranked.length) ** 0.8;
      // An arm keeps roughly the same width along its length, so it narrows
      // in angle as it runs out; its edges are soft, not cut.
      const spread = span.half * Math.min(1, 0.55 / (0.25 + reach)) * 0.9;
      const angle = span.centre + Math.max(-1.6, Math.min(1.6, gaussian(random))) * spread;
      const at = local.get(film);
      homeX[at] = px[at] = Math.cos(angle) * reach;
      homeZ[at] = pz[at] = Math.sin(angle) * reach;
    });
  }

  // Let neighbours draw together, keep stars from stacking, and hold the shape.
  const inner = [];
  let heaviest = 0;
  for (const [a, b, w] of edges) {
    if (!inGalaxy(a) || !inGalaxy(b)) continue;
    inner.push([local.get(a), local.get(b), w]);
    if (w > heaviest) heaviest = w;
  }
  const spacing = 0.9 / Math.sqrt(members.length);
  for (let step = 0; step < 70; step += 1) {
    for (const [a, b, w] of inner) {
      const pull = 0.014 * (w / heaviest);
      const dx = px[b] - px[a];
      const dz = pz[b] - pz[a];
      px[a] += dx * pull; pz[a] += dz * pull;
      px[b] -= dx * pull; pz[b] -= dz * pull;
    }
    for (let a = 0; a < members.length; a += 1) {
      for (let b = a + 1; b < members.length; b += 1) {
        const dx = px[b] - px[a];
        const dz = pz[b] - pz[a];
        const d2 = dx * dx + dz * dz;
        if (d2 >= spacing * spacing) continue;
        const d = Math.sqrt(d2) || 1e-6;
        const push = ((spacing - d) / d) * 0.3;
        px[a] -= dx * push; pz[a] -= dz * push;
        px[b] += dx * push; pz[b] += dz * push;
      }
    }
    for (let a = 0; a < members.length; a += 1) {
      px[a] += (homeX[a] - px[a]) * 0.1;
      pz[a] += (homeZ[a] - pz[a]) * 0.1;
      const r = Math.hypot(px[a], pz[a]);
      if (r > 1) { px[a] /= r; pz[a] /= r; }
    }
  }
  return { px, pz };
}

/**
 * @returns {{ positions: Float32Array, shapes: object[] }}
 * positions is count × 3; shapes holds each galaxy's centre, radius and plane.
 */
export function layoutSky({ lightId, count, galaxies, galaxyOf, armOf, centrality, edges, seed = 1 }) {
  const random = mulberry32(hashString(`sky:${lightId}:${seed}`));
  const positions = new Float32Array(count * 3);
  const placed = placeGalaxies({ galaxies, galaxyOf, edges, random });

  let reach = 0;
  for (const p of placed) reach = Math.max(reach, Math.hypot(p.x, p.z) + p.radius);
  const scale = UNIVERSE_RADIUS / (reach || 1);

  const membersOf = new Map(galaxies.map(g => [g.g, []]));
  for (let film = 0; film < count; film += 1) {
    if (galaxyOf[film] !== UNLIT) membersOf.get(galaxyOf[film]).push(film);
  }

  const shapes = [];
  galaxies.forEach((galaxy, at) => {
    const place = placed[at];
    const members = membersOf.get(galaxy.g);
    const { px, pz } = shapeGalaxy({ galaxy, members, armOf, centrality, edges, random });
    const R = place.radius * scale;
    const cosX = Math.cos(place.tiltX);
    const sinX = Math.sin(place.tiltX);
    const cosZ = Math.cos(place.tiltZ);
    const sinZ = Math.sin(place.tiltZ);
    const centre = [place.x * scale, place.y * scale, place.z * scale];
    members.forEach((film, i) => {
      const r = Math.hypot(px[i], pz[i]);
      const angle = Math.atan2(pz[i], px[i]) + place.twist * r ** 0.85;
      let x = Math.cos(angle) * r * R;
      let z = Math.sin(angle) * r * R;
      // A thin disc with a bulge at the core.
      let y = gaussian(random) * R * (0.03 + 0.1 * Math.exp(-((r / 0.28) ** 2)));
      // Tilt the disc: about the x axis, then about the z axis.
      const y1 = y * cosX - z * sinX;
      const z1 = y * sinX + z * cosX;
      const x2 = x * cosZ - y1 * sinZ;
      const y2 = x * sinZ + y1 * cosZ;
      x = x2; y = y2; z = z1;
      positions[film * 3] = centre[0] + x;
      positions[film * 3 + 1] = centre[1] + y;
      positions[film * 3 + 2] = centre[2] + z;
    });
    // The disc's normal, for labels and for flying in face-on.
    const normal = [-sinZ * cosX, cosZ * cosX, sinX];
    shapes.push({ g: galaxy.g, centre: centre.map(v => Math.round(v * 10) / 10), radius: Math.round(R * 10) / 10, normal: normal.map(v => Math.round(v * 1000) / 1000) });
  });

  // The unlit: films this light has nothing to go on. A faint ring beyond the galaxies.
  for (let film = 0; film < count; film += 1) {
    if (galaxyOf[film] !== UNLIT) continue;
    const angle = random() * TAU;
    const r = UNIVERSE_RADIUS * (1.2 + random() * 0.32);
    positions[film * 3] = Math.cos(angle) * r;
    positions[film * 3 + 1] = gaussian(random) * UNIVERSE_RADIUS * 0.05;
    positions[film * 3 + 2] = Math.sin(angle) * r;
  }

  return { positions, shapes };
}
