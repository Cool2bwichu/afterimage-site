// What the Navigator must return, and how its answers are cleaned. Models are
// mostly tidy, but nothing here trusts that: every field is checked, trimmed
// or dropped, and an answer with nothing usable in it is an error, never an
// empty success.
import { LIGHT_IDS } from '../src/engine/lights.mjs';
import { normaliseReading, AXES } from './reading.mjs';
import { TAGGED_LIGHTS } from './vocabulary.mjs';
import { codeOf } from './prompts.mjs';

export class NavigatorError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'NavigatorError';
    this.code = code;
  }
}

const sentence = (value, max) => {
  if (typeof value !== 'string') return '';
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  return stop > max * 0.5 ? cut.slice(0, stop + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
};

// ── JSON Schemas, for transports that can enforce one (the companion).
const S = { type: 'string' };
const I = { type: 'integer' };
const B = { type: 'boolean' };
const object = (properties, optional = []) => ({
  type: 'object',
  properties,
  required: Object.keys(properties).filter(key => !optional.includes(key)),
  additionalProperties: false,
});
const READING_PROPERTIES = {
  title: S, year: I, director: S, known: { type: 'string', enum: ['well', 'partly'] }, fame: I, country: S,
  premise: S, afterimage: S,
  ...Object.fromEntries(TAGGED_LIGHTS.map(light => [light, { type: 'array', items: S }])),
  axes: object(Object.fromEntries(AXES.map(axis => [axis, I]))),
  bw: B, animated: B, movement: S, setting: S, hi: S, lo: S,
};
const reading = (extra = {}) => object({ ...READING_PROPERTIES, ...extra });

export const SCHEMAS = {
  arrival: object({
    essence: S,
    rays: { type: 'array', items: object({ light: { type: 'string', enum: LIGHT_IDS }, pick: S, claim: S, watch: S }) },
    beyond: { anyOf: [{ type: 'null' }, object({ title: S, year: I, why: S })] },
  }),
  deepfield: object({ stars: { type: 'array', items: reading({ light: { type: 'string', enum: LIGHT_IDS }, claim: S }) } }),
  chart: object({ star: { anyOf: [{ type: 'null' }, reading()] }, note: S }),
  course: object({ name: S, heading: S, waypoints: { type: 'array', items: reading({ why: S, leg: S }) } }),
  collision: object({ star: reading(), fromA: S, fromB: S, spark: S }),
  sky: object({ name: S, reading: S, blind: S, next: { type: 'array', items: reading({ why: S }) } }),
};

// How hard the model should think for each kind of answer.
export const EFFORT = { arrival: 'low', deepfield: 'low', chart: 'low', course: 'medium', collision: 'medium', sky: 'medium' };

// ── Normalisers.

/**
 * @param {object} raw
 * @param {Record<string, Array<{star:number}>>} candidates the neighbours the prompt listed, per light
 * @param {boolean} [partial] a draft: keep what is there, demand nothing
 */
export function normaliseArrival(raw, candidates, partial = false) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const rays = [];
  const seenLights = new Set();
  for (const ray of Array.isArray(source.rays) ? source.rays : []) {
    if (!ray || !LIGHT_IDS.includes(ray.light) || seenLights.has(ray.light)) continue;
    const list = candidates[ray.light] || [];
    const pick = list.findIndex((entry, n) => codeOf(ray.light, n) === String(ray.pick || '').trim().toUpperCase());
    const claim = sentence(ray.claim, 460);
    if (pick < 0 || !claim) continue;
    seenLights.add(ray.light);
    rays.push({ light: ray.light, star: list[pick].star, claim, watch: sentence(ray.watch, 260) });
  }
  const essence = sentence(source.essence, 360);
  let beyond = null;
  if (source.beyond && typeof source.beyond === 'object') {
    const title = sentence(source.beyond.title, 140);
    const year = Math.round(Number(source.beyond.year));
    const why = sentence(source.beyond.why, 360);
    if (title && year >= 1888 && year <= 2100 && why) beyond = { title, year, why };
  }
  if (!partial && !essence && !rays.length) throw new NavigatorError('empty_reading', 'The Navigator returned no reading for this star.');
  return { essence, rays, beyond };
}

function readings(list, vocabulary, extras) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(list) ? list : []) {
    const clean = normaliseReading(item, vocabulary);
    if (!clean) continue;
    const key = `${clean.title.toLowerCase()}|${clean.year}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...clean, ...extras(item) });
  }
  return out;
}

export function normaliseDeepField(raw, vocabulary, partial = false) {
  const stars = readings(raw && raw.stars, vocabulary, item => ({
    light: LIGHT_IDS.includes(item.light) ? item.light : 'feeling',
    claim: sentence(item.claim, 460),
  }));
  if (!partial && !stars.length) throw new NavigatorError('empty_reading', 'The Navigator found nothing it could chart beyond this star.');
  return { stars };
}

export function normaliseChart(raw, vocabulary) {
  const star = raw && raw.star ? normaliseReading(raw.star, vocabulary) : null;
  return { star, note: star ? '' : sentence(raw && raw.note, 240) || 'The Navigator could not place that film.' };
}

export function normaliseCourse(raw, vocabulary, partial = false) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const waypoints = readings(source.waypoints, vocabulary, item => ({ why: sentence(item.why, 460), leg: sentence(item.leg, 300) }));
  if (!partial && waypoints.length < 2) throw new NavigatorError('empty_reading', 'The Navigator could not plot that course.');
  return { name: sentence(source.name, 80) || 'An unnamed course', heading: sentence(source.heading, 300), waypoints };
}

export function normaliseCollision(raw, vocabulary) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const star = normaliseReading(source.star, vocabulary);
  if (!star) throw new NavigatorError('empty_reading', 'The Navigator could not name a film between those two.');
  return { star, fromA: sentence(source.fromA, 360), fromB: sentence(source.fromB, 360), spark: sentence(source.spark, 360) };
}

export function normaliseSky(raw, vocabulary, partial = false) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const name = sentence(source.name, 80);
  const text = sentence(source.reading, 700);
  if (!partial && !name && !text) throw new NavigatorError('empty_reading', 'The Navigator returned no reading of this sky.');
  return {
    name,
    reading: text,
    blind: sentence(source.blind, 300),
    next: readings(source.next, vocabulary, item => ({ why: sentence(item.why, 460) })).slice(0, 3),
  };
}
