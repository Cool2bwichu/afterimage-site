// A star reading is how the Navigator charts a film the chart does not hold:
// a short, structured description from memory. This module cleans a reading
// (models are not always tidy) and turns it into a star the engine can place:
// a film record and one trait row per light, weighted the way the compiler
// weights the same traits for charted films.
import { LIGHT_IDS } from '../src/engine/lights.mjs';
import { fold, slugOf } from '../src/engine/search.mjs';
import { TAGGED_LIGHTS } from './vocabulary.mjs';

export const AXES = ['dread', 'cruelty', 'irony', 'ambiguity', 'fracture'];

// The poles a film carries when it sits clearly at one end of a scored axis.
// Mirrors universe/authored/vocabulary.mjs (AXES) and lib/features.mjs.
const POLES = {
  dread: { light: 'feeling', high: 'steeped in dread', low: 'at ease' },
  cruelty: { light: 'feeling', high: 'cruel to its people', low: 'tender to its people' },
  irony: { light: 'feeling', high: 'held at an ironic distance', low: 'wholly sincere' },
  ambiguity: { light: 'story', high: 'an ending left open', low: null },
  fracture: { light: 'story', high: 'a fractured telling', low: null },
};

// The strongest tag first: the consensus scale the chart uses is 1, .75, .5, .25.
const RANK_WEIGHT = [1, 0.75, 0.75, 0.5, 0.5, 0.5];

const COUNTRY_ALIASES = {
  usa: 'United States', us: 'United States', 'u s': 'United States', 'u s a': 'United States', america: 'United States', 'united states of america': 'United States',
  uk: 'United Kingdom', 'u k': 'United Kingdom', britain: 'United Kingdom', 'great britain': 'United Kingdom', england: 'United Kingdom', scotland: 'United Kingdom', wales: 'United Kingdom',
  ussr: 'Soviet Union', 'u s s r': 'Soviet Union', korea: 'South Korea', 'republic of korea': 'South Korea',
  czechia: 'Czech Republic', 'peoples republic of china': 'China', prc: 'China', 'hong kong sar': 'Hong Kong',
};
const THE_COUNTRIES = /^(United|Soviet|Weimar|Netherlands|Czech Republic|Philippines|German Democratic|Ottoman|Russian Empire|Kingdom|Republic)/;

const text = (value, max) => {
  if (typeof value !== 'string') return '';
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const stop = cut.lastIndexOf(' ');
  return `${cut.slice(0, stop > max * 0.6 ? stop : max).replace(/[,;:\s]+$/, '')}…`;
};
const hex = value => (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim().toLowerCase() : '');

function fallbackPalette(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const hue = (h >>> 0) % 360;
  const toHex = (hDeg, s, l) => {
    const a = s * Math.min(l, 1 - l);
    const f = n => {
      const k = (n + hDeg / 30) % 12;
      const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(c * 255).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  };
  return { hi: toHex(hue, 0.5, 0.7), lo: toHex(hue, 0.4, 0.09) };
}

export function countryName(raw) {
  const clean = text(raw, 60).replace(/^the /i, '');
  if (!clean) return '';
  return COUNTRY_ALIASES[fold(clean)] || clean;
}

/**
 * Cleans one star reading as a model wrote it.
 * @returns {object|null} null when the reading names no usable film, or the
 *   model said it does not know the film
 */
export function normaliseReading(raw, vocabulary) {
  if (!raw || typeof raw !== 'object') return null;
  const title = text(raw.title, 140);
  const year = Math.round(Number(raw.year));
  if (!title || !(year >= 1888 && year <= 2100)) return null;
  const known = raw.known === 'partly' ? 'partly' : raw.known === 'no' ? 'no' : 'well';
  if (known === 'no') return null;

  const tags = {};
  for (const light of TAGGED_LIGHTS) {
    const list = Array.isArray(raw[light]) ? raw[light] : [];
    const kept = [];
    for (const tag of list) {
      if (typeof tag !== 'string' || vocabulary.find(light, tag) < 0) continue;
      const label = vocabulary.lights[light].find(entry => fold(entry.label) === fold(tag)).label;
      if (!kept.includes(label)) kept.push(label);
      if (kept.length >= 6) break;
    }
    tags[light] = kept;
  }

  const axes = {};
  const rawAxes = raw.axes && typeof raw.axes === 'object' ? raw.axes : {};
  for (const axis of AXES) {
    const value = Number(rawAxes[axis]);
    axes[axis] = Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : -1;
  }

  const fame = Number(raw.fame);
  const palette = fallbackPalette(`${title}${year}`);
  const movementId = vocabulary.movement(raw.movement);
  return {
    title,
    year,
    director: text(raw.director, 120),
    known,
    fame: Number.isFinite(fame) ? Math.max(0, Math.min(4, Math.round(fame))) : 1,
    country: countryName(raw.country),
    premise: text(raw.premise, 320),
    afterimage: text(raw.afterimage, 200),
    tags,
    axes,
    bw: raw.bw === true,
    animated: raw.animated === true,
    movement: movementId >= 0 ? vocabulary.movements.find(entry => entry.id === movementId).label : '',
    setting: text(raw.setting, 60),
    hi: hex(raw.hi) || palette.hi,
    lo: hex(raw.lo) || palette.lo,
  };
}

/**
 * Brings a reading that was cleaned earlier (kept in a browser, or by the
 * companion) back through the same checks, so nothing stored is trusted more
 * than something just written.
 */
export function reviveReading(stored, vocabulary) {
  if (!stored || typeof stored !== 'object') return null;
  const axes = {};
  for (const axis of AXES) if (stored.axes && stored.axes[axis] >= 0) axes[axis] = stored.axes[axis];
  return normaliseReading({ ...stored, ...(stored.tags && typeof stored.tags === 'object' ? stored.tags : {}), axes }, vocabulary);
}

const READING_KEYS = ['title', 'year', 'director', 'known', 'fame', 'country', 'premise', 'afterimage', 'tags', 'axes', 'bw', 'animated', 'movement', 'setting', 'hi', 'lo'];

/** A clean reading with only its own fields: what is worth keeping or sending. */
export const plainReading = reading => Object.fromEntries(READING_KEYS.filter(key => reading[key] !== undefined).map(key => [key, reading[key]]));

/** A reading's slug: the address of the star it becomes. */
export const readingSlug = reading => slugOf(reading.title, reading.year);

/**
 * Turns a clean reading into a star for `universe.addStars`.
 * @param {object} reading   from normaliseReading
 * @param {object} universe  the open universe (traits are looked up by label, a few may be added)
 * @param {object} vocabulary
 * @param {{ from?: number, fromSlug?: string, source?: string, extra?: object }} [options]
 *   from: the star it was sighted from; fromSlug: the same by slug, when that star may not exist yet
 */
export function starFromReading(reading, universe, vocabulary, { from, fromSlug, source = 'deepfield', extra = {} } = {}) {
  const rows = Object.fromEntries(LIGHT_IDS.map(light => [light, []]));
  const add = (light, trait, weight) => { if (trait >= 0) rows[light].push([trait, weight]); };

  for (const light of TAGGED_LIGHTS) {
    (reading.tags[light] || []).forEach((label, rank) => add(light, vocabulary.find(light, label), RANK_WEIGHT[Math.min(rank, RANK_WEIGHT.length - 1)]));
  }
  for (const axis of AXES) {
    const score = reading.axes[axis];
    const pole = POLES[axis];
    if (!(score >= 0)) continue;
    if (score >= 60) add(pole.light, universe.traitId(pole.light, pole.high), 0.5 + (score - 60) / 80);
    else if (pole.low && score <= 22) add(pole.light, universe.traitId(pole.light, pole.low), 0.5 + (22 - score) / 44);
  }

  const decade = `${Math.floor(reading.year / 10) * 10}s`;
  add('image', universe.traitId('image', `the look of the ${decade}`), 0.45);
  if (reading.bw) add('image', universe.traitId('image', 'black and white'), 0.9);
  if (reading.animated) add('image', universe.traitId('image', 'animated'), 0.9);

  if (reading.country) {
    const named = THE_COUNTRIES.test(reading.country) ? `the ${reading.country}` : reading.country;
    add('world', universe.ensureTrait({ light: 'world', kind: 'country', label: `from ${named}`, short: reading.country }), 0.35);
    add('hands', universe.ensureTrait({ light: 'hands', kind: 'era', label: `${named} in the ${decade}`, short: `${reading.country}, ${decade}` }), 0.5);
  }
  if (reading.setting) add('world', universe.traitId('world', `set in ${reading.setting}`), 0.7);
  if (reading.movement) add('hands', vocabulary.movement(reading.movement), 0.9);
  for (const name of reading.director.split(/\s*(?:,|&|\band\b)\s*/).map(part => part.trim()).filter(Boolean).slice(0, 3)) {
    add('hands', universe.ensureTrait({ light: 'hands', kind: 'director', label: `directed by ${name}`, short: name }), 1);
  }

  const film = {
    t: reading.title,
    y: reading.year,
    d: reading.director,
    s: readingSlug(reading),
    rn: reading.fame,
    hi: reading.hi,
    lo: reading.lo,
    kn: reading.known === 'well' ? 2 : 1,
    deep: 1,
    by: source,
    ...(reading.country ? { c: [reading.country] } : {}),
    ...(reading.premise ? { x: reading.premise } : {}),
    ...(reading.afterimage ? { rc: reading.afterimage } : {}),
    ...(AXES.some(axis => reading.axes[axis] >= 0) ? { ax: AXES.map(axis => reading.axes[axis]) } : {}),
    ...extra,
  };
  return { film, rows, ...(Number.isInteger(from) ? { from } : typeof fromSlug === 'string' && fromSlug ? { fromSlug } : {}) };
}
