// Lookback: the same films, placed by when they were made. Starlight is old
// light, and so is cinema. The present burns at the centre, each decade is a
// ring further out, and the silent years lie at the far horizon.
//
// Each film keeps the direction of its kind: the galaxy it belongs to under
// white light becomes a wedge of the sky, and each of that galaxy's systems a
// narrower wedge inside it. So a line of sight from the centre runs back
// through one kind of film, decade by decade. What a film came from lies
// further out along it; what came after lies further in.
//
// Nothing here is compiled: the sky of time is laid out in the browser from
// the white sky and the years, the same way every time.
import { LIGHT_IDS } from './lights.mjs';
import { typicality } from './journey.mjs';
import { mulberry32, hashString, gaussian } from './rng.mjs';
import { topK } from './similarity.mjs';

export const TIME = 'time';
export const INNER = 80;      // the radius of the present
export const PER_YEAR = 7.6;  // how much further out each year back lies
export const SINK = 0.12;     // the past sinks a little below the present: the sky is a shallow bowl
const GAP = 0.07;             // radians of dark between two kinds: the lanes between the lines of sight
const MIN_RING = 12;          // a decade with fewer films than this joins the next
const FLOOR = 0.2;            // below this likeness a line of sight goes no further

const TAU = Math.PI * 2;
const angleOf = point => Math.atan2(point[2], point[0]);
const turnBetween = (from, to) => { let d = (to - from) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

/** How far out a year lies, given the present. */
export const radiusAt = (year, present) => INNER + Math.max(0, present - year) * PER_YEAR;
/** How far below the present a radius lies. */
export const heightAt = radius => -SINK * (radius - INNER);

const decadeName = (from, to, oldest) => {
  if (oldest && to - from > 9) return `Before ${to + 1}`;
  if (to - from > 9) return `The ${from}s and ${String(to - 9).slice(2)}s`;
  return `The ${from}s`;
};

/**
 * Lays out the sky of time. Fills `positions.time`, `galaxyOf.time`, `armOf.time`
 * and `galaxies.time` of an opened universe, and returns how to place a star
 * charted later.
 * @param {object} universe the universe being opened: films, base, positions, galaxyOf, armOf, galaxies
 * @param {number} UNLIT the mark for a film no galaxy holds
 */
export function layoutTime(universe, UNLIT) {
  const { films, base } = universe;
  const white = universe.galaxies.white;
  const W = { P: universe.positions.white, G: universe.galaxyOf.white, A: universe.armOf.white };
  let newest = 0;
  for (let i = 0; i < base; i += 1) newest = Math.max(newest, films[i].y || 0);
  const present = Math.max(newest, 2000) + 0.5;
  const radius = year => radiusAt(year, present);

  // ── The wedges: one for each galaxy of the white sky, as wide as it is large,
  // in the order they lie around the white sky.
  const counts = new Map();
  for (let i = 0; i < base; i += 1) {
    if (W.G[i] === UNLIT) continue;
    const key = `${W.G[i]}:${W.A[i]}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const sizeOf = galaxy => galaxy.arms.reduce((sum, arm) => sum + (counts.get(`${galaxy.g}:${arm.arm}`) || 0), 0) || galaxy.size;
  const order = [...white].sort((a, b) => angleOf(a.centre) - angleOf(b.centre));
  const total = order.reduce((sum, galaxy) => sum + sizeOf(galaxy), 0) || 1;
  const span = TAU - GAP * order.length;
  const sectors = new Map();
  let at = 0;
  for (const galaxy of order) {
    const width = (span * sizeOf(galaxy)) / total;
    sectors.set(galaxy.g, { start: at, width });
    at += width + GAP;
  }
  // The wheel is turned so that each kind lies as near as it can to where its galaxy lies in white light:
  // changing between the two, the stars mostly move outward and in, not around.
  let sx = 0;
  let sz = 0;
  for (const galaxy of order) {
    const sector = sectors.get(galaxy.g);
    const d = turnBetween(sector.start + sector.width / 2, angleOf(galaxy.centre));
    sx += Math.cos(d) * sizeOf(galaxy);
    sz += Math.sin(d) * sizeOf(galaxy);
  }
  const turn = Math.atan2(sz, sx);
  const wedges = new Map(); // "g:arm" → { start, width }
  for (const galaxy of order) {
    const sector = sectors.get(galaxy.g);
    sector.start += turn;
    // Inside its wedge, a galaxy's systems keep the order they lie in around it.
    const arms = [...galaxy.arms].sort((a, b) => turnBetween(angleOf(galaxy.centre), angleOf(a.at)) - turnBetween(angleOf(galaxy.centre), angleOf(b.at)));
    const inside = arms.reduce((sum, arm) => sum + (counts.get(`${galaxy.g}:${arm.arm}`) || 0), 0) || 1;
    let from = sector.start;
    for (const arm of arms) {
      const width = (sector.width * (counts.get(`${galaxy.g}:${arm.arm}`) || 0)) / inside;
      wedges.set(`${galaxy.g}:${arm.arm}`, { start: from, width });
      from += width;
    }
    wedges.set(`${galaxy.g}:${UNLIT}`, { start: sector.start, width: sector.width });
  }

  // ── The rings: a decade each, the thin early ones joined to the next.
  const byDecade = new Map();
  for (let i = 0; i < base; i += 1) {
    if (!films[i].y) continue;
    const decade = Math.floor(films[i].y / 10) * 10;
    byDecade.set(decade, (byDecade.get(decade) || 0) + 1);
  }
  const decades = [...byDecade.keys()].sort((a, b) => a - b);
  const groups = [];
  let open = null;
  for (const decade of decades) {
    if (!open) open = { from: decade, to: decade + 9, count: 0 };
    open.to = decade + 9;
    open.count += byDecade.get(decade);
    if (open.count >= MIN_RING) { groups.push(open); open = null; }
  }
  if (open) {
    if (groups.length) { const last = groups[groups.length - 1]; last.to = open.to; last.count += open.count; } else groups.push(open);
  }
  let oldest = Infinity;
  for (let i = 0; i < base; i += 1) if (films[i].y) oldest = Math.min(oldest, films[i].y);
  const ringOfYear = year => {
    for (let g = 0; g < groups.length; g += 1) if (year <= groups[g].to) return g;
    return groups.length - 1;
  };

  // ── Where each film lies.
  const P = new Float32Array(base * 3);
  const G = new Uint8Array(base).fill(UNLIT);
  const A = new Uint8Array(base).fill(UNLIT);
  universe.positions.time = P;
  universe.galaxyOf.time = G;
  universe.armOf.time = A;

  function place(i) {
    const film = films[i];
    const P = universe.positions.time;
    const random = mulberry32(hashString(`time:${film.s || i}`));
    const g = universe.galaxyOf.white[i];
    const wedge = g === UNLIT ? null : wedges.get(`${g}:${universe.armOf.white[i]}`) || wedges.get(`${g}:${UNLIT}`);
    const angle = wedge
      ? wedge.start + wedge.width * (0.06 + 0.88 * random())
      : angleOf([universe.positions.white[i * 3], 0, universe.positions.white[i * 3 + 2]]);
    if (!film.y) {
      // With no year it cannot be placed in time: it waits beyond the horizon.
      const r = radius(oldest) * (1.08 + random() * 0.2);
      P[i * 3] = Math.cos(angle) * r;
      P[i * 3 + 1] = heightAt(r) + gaussian(random) * 8;
      P[i * 3 + 2] = Math.sin(angle) * r;
      universe.galaxyOf.time[i] = UNLIT;
      universe.armOf.time[i] = UNLIT;
      return;
    }
    // Within its year, a film is set a little in or out, so a year is a band and not a line.
    const r = radius(film.y + (random() - 0.5) * 0.9);
    P[i * 3] = Math.cos(angle) * r;
    P[i * 3 + 1] = heightAt(r) + gaussian(random) * (3 + r * 0.012);
    P[i * 3 + 2] = Math.sin(angle) * r;
    universe.galaxyOf.time[i] = ringOfYear(film.y);
    universe.armOf.time[i] = g === UNLIT ? UNLIT : g;
  }
  for (let i = 0; i < base; i += 1) place(i);

  // ── The decades as galaxies, and the kinds of film in each as their systems.
  const renownFirst = (a, b) => (films[b].rn ?? 0) - (films[a].rn ?? 0) || (films[b].kn ?? 0) - (films[a].kn ?? 0) || a - b;
  const members = groups.map(() => []);
  for (let i = 0; i < base; i += 1) if (G[i] !== UNLIT) members[G[i]].push(i);
  // Where each kind is brightest: the decade that holds most of it.
  const peakOf = new Map();
  for (const galaxy of white) {
    let best = -1;
    let most = 0;
    members.forEach((list, ring) => {
      const n = list.filter(i => A[i] === galaxy.g).length;
      if (n > most) { most = n; best = ring; }
    });
    peakOf.set(galaxy.g, best);
  }
  const listed = names => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || '');

  const galaxies = groups.map((group, g) => {
    const stars = members[g];
    const from = g === 0 ? Math.max(group.from, oldest) : group.from;
    const outer = radius(from - 0.5);
    const inner = radius(group.to + 0.5);
    const mid = (inner + outer) / 2;
    // A decade's own name says nothing about it: every film in it carries it.
    const own0 = [];
    for (let decade = Math.floor(group.from / 10) * 10; decade <= group.to; decade += 10) own0.push(`The ${decade}s`, `${decade}s`);
    // A kind within a decade is set apart from the rest of the decade, not from the whole sky: what every film then carried says nothing of it.
    let background = null;
    const decadeWide = () => (background ||= { size: stars.length, counts: traitCounts(universe, stars) });
    const arms = white.map(kind => {
      const own = stars.filter(i => A[i] === kind.g);
      if (!own.length) return null;
      let x = 0; let y = 0; let z = 0;
      for (const i of own) { x += P[i * 3]; y += P[i * 3 + 1]; z += P[i * 3 + 2]; }
      const sector = sectors.get(kind.g);
      const arm = {
        arm: kind.g, name: kind.name, size: own.length, whole: true,
        at: [x / own.length, y / own.length, z / own.length],
        // The wedge the kind takes in this ring, for its glow: where it starts and how wide it is.
        from: sector.start, width: sector.width,
        lead: [...own].sort(renownFirst).slice(0, 4),
      };
      let top = null;
      Object.defineProperty(arm, 'top', { enumerable: true, get() { top ||= distinctive(universe, own, 10, { skip: own0, within: decadeWide() }).map(([trait]) => trait); return top; } });
      return arm;
    }).filter(Boolean).sort((a, b) => b.size - a.size);
    // Ways in: the best-known film of each of its largest kinds.
    const doors = [];
    for (let round = 0; round < 4 && doors.length < 5; round += 1) {
      for (const arm of arms) {
        if (doors.length >= 5) break;
        const star = arm.lead[round];
        if (star !== undefined && !doors.includes(star)) doors.push(star);
      }
    }
    const brightest = arms.filter(arm => peakOf.get(arm.arm) === g).map(arm => arm.name);
    const largest = arms.slice(0, 3).map(arm => arm.name);
    const span = `${from} to ${Math.min(group.to, Math.floor(present))}`;
    const thesis = brightest.length
      ? `${stars.length} films made from ${span}. ${listed(brightest.slice(0, 3))} ${brightest.length > 1 ? 'are' : 'is'} at ${brightest.length > 1 ? 'their' : 'its'} brightest here.`
      : `${stars.length} films made from ${span}, most of them ${listed(largest)}.`;
    const record = {
      g, name: decadeName(group.from, group.to, g === 0 && group.from < 1930), thesis, size: stars.length,
      from, to: group.to,
      ring: { inner, outer },
      centre: [0, heightAt(mid), 0],
      // Used to size its name and to frame its systems: the ring is a band, so its breadth, not its reach.
      radius: (outer - inner) * 3,
      normal: [0, 1, 0],
      medoid: doors[0] ?? -1,
      doors,
      arms,
    };
    let typical = null;
    let top = null;
    Object.defineProperty(record, 'typical', {
      enumerable: true,
      get() {
        if (!typical) typical = [...typicality(universe, stars, 'white').entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([star]) => star);
        return typical;
      },
    });
    Object.defineProperty(record, 'top', { enumerable: true, get() { top ||= distinctive(universe, stars, 12, { skip: own0 }); return top; } });
    return record;
  });
  universe.galaxies.time = galaxies;

  /** The decade rings' edges, newest first: the present, then each boundary out to the horizon. */
  const edges = [radius(present), ...groups.slice(1).reverse().map(group => radius(group.from - 0.5)), radius(Math.max(groups[0].from, oldest) - 0.5)];

  return { place, edges, present, sectors };
}

/** How many of a group of films carry each trait, under any light (and, if asked, which of them). */
function traitCounts(universe, stars, leave = () => false, carriers = null) {
  const counts = new Map();
  for (const star of stars) {
    for (const light of LIGHT_IDS) {
      for (const { trait } of universe.model.index[light].traits(star, 400)) {
        if (leave(trait)) continue;
        counts.set(trait, (counts.get(trait) || 0) + 1);
        if (carriers) {
          if (!carriers.has(trait)) carriers.set(trait, new Set());
          carriers.get(trait).add(star);
        }
      }
    }
  }
  return counts;
}
// Where a film comes from, in three ways of saying it: its country, its language, its country in its decade.
const PLACE = new Set(['country', 'language', 'era']);

/**
 * The traits that set a group of films apart: carried by many of them, and by
 * few films elsewhere. [[trait, percent of the group]], most telling first.
 */
export function distinctive(universe, stars, limit = 12, { skip = [], within = null } = {}) {
  const { traits, base } = universe;
  const nameOf = trait => (traits[trait].s || traits[trait].t).toLowerCase();
  const skipped = new Set(skip.map(label => label.toLowerCase()));
  const carriers = new Map();
  const counts = traitCounts(universe, stars, trait => traits[trait].v || skipped.has(nameOf(trait)), carriers);
  const least = Math.max(3, Math.round(stars.length * 0.05));
  // Set apart from the whole sky, or (within a group, such as a decade) from the rest of that group.
  const whole = within ? within.size : base;
  const scored = [];
  for (const [trait, n] of counts) {
    if (n < least) continue;
    const share = n / stars.length;
    const df = Math.max(n, (within ? within.counts.get(trait) : traits[trait].df) || n);
    scored.push([trait, Math.round(share * 100), share * Math.log((whole + 1) / df)]);
  }
  scored.sort((a, b) => b[2] - a[2]);
  // One thing said once: "Italy" adds nothing beside "Italy, 1960s" or "Italian" carried by the same films, nor a name said twice.
  const alike = (a, b) => {
    const A = carriers.get(a);
    const B = carriers.get(b);
    let both = 0;
    for (const star of A) if (B.has(star)) both += 1;
    return both / (A.size + B.size - both);
  };
  const picked = [];
  for (const entry of scored) {
    if (picked.length >= limit) break;
    const name = nameOf(entry[0]);
    if (picked.some(other => {
      const said = nameOf(other[0]);
      if (said === name || (other[1] === entry[1] && (said.includes(name) || name.includes(said)))) return true;
      return PLACE.has(traits[other[0]].k) && PLACE.has(traits[entry[0]].k) && alike(other[0], entry[0]) >= 0.65;
    })) continue;
    picked.push(entry);
  }
  return picked.map(([trait, percent]) => [trait, percent]);
}

/**
 * A line of sight from a film: the film most like it made at least `gap` years
 * earlier (direction -1) or later (+1), then the one most like that, and so on.
 * Each step leans on the film it set out from too, so the line keeps to its subject.
 * @returns {Array<{ star: number, from: number, sim: number }>}
 */
export function lineage(universe, star, { direction = -1, steps = 5, gap = 4, exclude = null } = {}) {
  const films = universe.films;
  const origin = universe.model.scores('white', star);
  const out = [];
  const seen = new Set([star]);
  let at = star;
  for (let n = 0; n < steps; n += 1) {
    const year = films[at].y;
    if (!year) break;
    const near = at === star ? origin : universe.model.scores('white', at);
    const blend = new Float32Array(near.length);
    for (let j = 0; j < near.length; j += 1) blend[j] = at === star ? near[j] : near[j] * 0.65 + origin[j] * 0.35;
    const allow = j => !seen.has(j) && !(exclude && exclude.has(j)) && films[j].y > 0
      && (direction < 0 ? films[j].y <= year - gap : films[j].y >= year + gap);
    const [best] = topK(blend, 1, allow);
    if (!best || best.sim < FLOOR) break;
    seen.add(best.i);
    out.push({ star: best.i, from: at, sim: best.sim });
    at = best.i;
  }
  return out;
}

export const TIME_RINGS = {
  before: { name: 'Before it', color: '#ef9a6e', says: 'made before it, and like it' },
  after: { name: 'After it', color: '#9cc4ff', says: 'made after it, and like it' },
  then: { name: 'Of its time', color: '#e6dccb', says: 'made within three years of it, and like it' },
};

/**
 * The star system of a film seen in time: the films most like it that were made
 * before it, after it, and in its own years. A line of sight, if given, leads its ring.
 * @returns {Array<{ light: string, name: string, color: string, says: string, sim: number, stars: number[] }>}
 */
export function timeRings(universe, star, { exclude = null, per = 3, back = [], forth = [] } = {}) {
  const films = universe.films;
  const year = films[star].y;
  if (!year) return [];
  const near = universe.model.neighbours('white', star, 90, j => j !== star && !(exclude && exclude.has(j)) && films[j].y > 0);
  const placed = new Set();
  const ring = (kind, test, lead) => {
    const stars = [];
    for (const candidate of [...lead, ...near.map(entry => entry.i)]) {
      if (stars.length >= per) break;
      if (placed.has(candidate) || !test(films[candidate].y)) continue;
      stars.push(candidate);
      placed.add(candidate);
    }
    return { light: kind, ...TIME_RINGS[kind], sim: 0, stars };
  };
  const first = steps => steps.slice(0, 1).map(step => step.star).filter(j => !(exclude && exclude.has(j)));
  return [
    ring('before', y => y < year - 3, first(back)),
    ring('after', y => y > year + 3, first(forth)),
    ring('then', y => Math.abs(y - year) <= 3, []),
  ].filter(entry => entry.stars.length);
}
