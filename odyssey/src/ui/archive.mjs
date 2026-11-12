// A voyage kept outside the browser: a file a voyager can carry to another
// device and bring back. The format is shared with the other edition of the
// Odyssey ("afterimage-odyssey"): versions 1 to 3 are read, version 3 is written,
// and what one edition does not know it leaves alone.
//
// Nothing in a file is trusted: every list is checked, every text is cut to
// length, and a file that is not an archive changes nothing.

export const FORMAT = 'afterimage-odyssey';
export const VERSION = 3;
const LIGHTS = new Set(['white', 'story', 'feeling', 'image', 'idea', 'world', 'hands']);
const MARKS = ['loved', 'seen', 'watchlist', 'hidden', 'visited'];
const LIMITS = { slugs: 20000, found: 2400, routes: 60, stops: 40, arrivals: 400, wake: 240 };

const cut = (value, length = 700) => (typeof value === 'string' ? value.slice(0, length) : '');
const isSlug = value => typeof value === 'string' && value.length > 0 && value.length <= 180;

function slugList(value, what) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > LIMITS.slugs || !value.every(isSlug)) throw new Error(`The ${what} in this file are not readable.`);
  return [...new Set(value)];
}

/** A saved voyage, or null if it is not one. */
export function cleanRoute(route) {
  if (!route || typeof route !== 'object' || !Array.isArray(route.stops) || !route.stops.length || route.stops.length > LIMITS.stops) return null;
  const stops = [];
  for (const stop of route.stops) {
    if (!stop || !isSlug(stop.slug)) return null;
    stops.push({ slug: stop.slug, light: LIGHTS.has(stop.light) ? stop.light : null, note: cut(stop.note, 300) });
  }
  return {
    name: cut(route.name, 300) || 'A voyage',
    heading: cut(route.heading),
    kind: cut(route.kind, 40) || 'route',
    savedAt: cut(route.savedAt, 60),
    stops,
    ...(isSlug(route.landed) ? { landed: route.landed } : {}),
  };
}

const routeKey = route => `${route.kind}:${route.stops.map(stop => stop.slug).join('|')}`;

function cleanArrival(arrival) {
  if (!arrival || typeof arrival !== 'object' || Array.isArray(arrival)) return null;
  const rays = Array.isArray(arrival.rays) ? arrival.rays.slice(0, 6)
    .filter(ray => ray && LIGHTS.has(ray.light) && isSlug(ray.slug))
    .map(ray => ({ light: ray.light, slug: ray.slug, claim: cut(ray.claim, 460), watch: cut(ray.watch, 260) })) : [];
  const beyond = arrival.beyond && typeof arrival.beyond === 'object' && !Array.isArray(arrival.beyond)
    ? { title: cut(arrival.beyond.title, 140), year: Math.round(Number(arrival.beyond.year)) || 0, why: cut(arrival.beyond.why, 360) }
    : null;
  const clean = { essence: cut(arrival.essence, 1600), rays, ...(beyond && beyond.title ? { beyond } : {}) };
  return clean.essence || clean.rays.length ? clean : null;
}

function cleanFound(entry) {
  if (!entry || typeof entry !== 'object' || !entry.reading || typeof entry.reading !== 'object') return null;
  const { reading } = entry;
  const year = Math.round(Number(reading.year));
  if (!cut(reading.title, 200) || !(year >= 1888 && year <= 2100)) return null;
  // A reading is the Navigator's own words about a film: kept whole, but never more than a reading holds.
  let size = 0;
  try { size = JSON.stringify(entry).length; } catch { return null; }
  if (size > 24000) return null;
  const extra = entry.extra && typeof entry.extra === 'object' && !Array.isArray(entry.extra) ? entry.extra : undefined;
  return {
    ...(isSlug(entry.slug) ? { slug: entry.slug } : {}),
    reading,
    from: isSlug(entry.from) ? entry.from : '',
    source: cut(entry.source, 30) || 'deepfield',
    ...(extra ? { extra } : {}),
  };
}

/**
 * What a voyager has kept, as a file. `state` holds Sets of slugs for the marks.
 * @returns {object} a plain object, ready for JSON
 */
export function exportArchive(state, now = new Date()) {
  const list = key => [...(state[key] || [])];
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: now.toISOString(),
    loved: list('loved'),
    seen: list('seen'),
    watchlist: list('watchlist'),
    // The other edition calls the films a voyager set aside "rejected".
    rejected: list('hidden'),
    visited: list('visited'),
    wake: [...(state.wake || [])],
    found: [...(state.found || [])],
    arrivals: { ...(state.arrivals || {}) },
    routes: [...(state.routes || [])],
    sky: LIGHTS.has(state.sky) ? state.sky : 'white',
  };
}

/**
 * Reads a file into what this browser already keeps. Nothing kept is lost:
 * marks and voyages are joined, and what the file says of a film is added to
 * what is known. Throws, changing nothing, if the file is not an archive.
 * @param {object} state the present state (Sets for the marks)
 * @param {unknown} archive the parsed file
 * @returns {{ state: object, counts: Record<string, number> }} a new state, and how much each list grew
 */
export function mergeArchive(state, archive) {
  if (!archive || typeof archive !== 'object' || archive.format !== FORMAT || ![1, 2, 3].includes(archive.version)) {
    throw new Error('This is not an AFTERIMAGE voyage file.');
  }
  const next = { ...state };
  const counts = {};
  const incoming = {
    loved: slugList(archive.loved, 'loved films'),
    seen: slugList(archive.seen, 'watched films'),
    watchlist: slugList(archive.watchlist, 'saved films'),
    hidden: slugList(archive.rejected ?? archive.hidden, 'set-aside films'),
    visited: slugList(archive.visited, 'visited films'),
  };
  const wake = slugList(archive.wake, 'wake').slice(-LIMITS.wake);
  for (const key of MARKS) {
    const set = new Set(state[key] || []);
    const before = set.size;
    for (const slug of incoming[key]) set.add(slug);
    if (key === 'visited') for (const slug of wake) set.add(slug);
    next[key] = set;
    counts[key] = set.size - before;
  }
  next.wake = [...(state.wake || []), ...wake.filter(slug => !(state.wake || []).includes(slug))].slice(-LIMITS.wake);

  if (archive.found !== undefined && (!Array.isArray(archive.found) || archive.found.length > LIMITS.found)) throw new Error('The films found beyond the chart in this file are not readable.');
  const found = [...(state.found || [])];
  const known = new Set(found.map(entry => `${String(entry.reading.title).toLowerCase()}|${entry.reading.year}`));
  counts.found = 0;
  for (const raw of archive.found || []) {
    const entry = cleanFound(raw);
    if (!entry) continue;
    const key = `${String(entry.reading.title).toLowerCase()}|${Math.round(Number(entry.reading.year))}`;
    if (known.has(key)) continue;
    known.add(key);
    found.push(entry);
    counts.found += 1;
  }
  next.found = found.slice(-1500);

  if (archive.routes !== undefined && (!Array.isArray(archive.routes) || archive.routes.length > 100)) throw new Error('The voyages in this file are not readable.');
  const routes = new Map((state.routes || []).map(route => [routeKey(route), route]));
  const before = routes.size;
  for (const raw of archive.routes || []) {
    const route = cleanRoute(raw);
    if (route && !routes.has(routeKey(route))) routes.set(routeKey(route), route);
  }
  next.routes = [...routes.values()].slice(-LIMITS.routes);
  counts.routes = routes.size - before;

  next.arrivals = { ...(state.arrivals || {}) };
  if (archive.arrivals && typeof archive.arrivals === 'object' && !Array.isArray(archive.arrivals)) {
    for (const [slug, raw] of Object.entries(archive.arrivals).slice(-LIMITS.arrivals)) {
      if (!isSlug(slug) || ['__proto__', 'constructor', 'prototype'].includes(slug) || next.arrivals[slug]) continue;
      const arrival = cleanArrival(raw);
      if (arrival) next.arrivals[slug] = arrival;
    }
  }
  if (LIGHTS.has(archive.sky)) next.sky = archive.sky;
  next.entered = true;
  return { state: next, counts };
}
