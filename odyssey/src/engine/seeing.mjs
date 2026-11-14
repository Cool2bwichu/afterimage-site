// Tonight's seeing. Astronomers call the steadiness of the air on a given night its seeing:
// it decides what can be made out at all. Here it is what tonight can hold: how long you
// have, which language, and how much dread or cruelty, irony, openness or a broken telling
// you want. A film that does not fit fades into haze, and nothing in the haze is offered as
// somewhere to go next. A film the chart cannot judge (no running time, no reading) is kept.
import { TEMPER_IDS, temperOf } from './temper.mjs';
import { LIGHT_IDS } from './lights.mjs';

export const LENGTHS = [
  { id: 'any', label: 'Any length', short: '', max: Infinity },
  { id: '150', label: 'Under 2½ hours', short: 'under 2½ hours', max: 150 },
  { id: '120', label: 'Under 2 hours', short: 'under 2 hours', max: 120 },
  { id: '100', label: 'Under 100 minutes', short: 'under 100 minutes', max: 100 },
];

export const LANGUAGES = [
  { id: 'any', label: 'Any language', short: '' },
  { id: 'english', label: 'In English', short: 'in English' },
  { id: 'other', label: 'In another language', short: 'not in English' },
];

/** For each temper, what tonight's "little" and "plenty" of it mean. */
export const LIMITS = {
  dread: { low: { label: 'Little', short: 'little dread', max: 35 }, high: { label: 'Plenty', short: 'plenty of dread', min: 55 } },
  cruelty: { low: { label: 'Gentle', short: 'gentle', max: 35 }, high: { label: 'Cruel', short: 'cruel', min: 55 } },
  irony: { low: { label: 'Sincere', short: 'sincere', max: 25 }, high: { label: 'Ironic', short: 'ironic', min: 45 } },
  ambiguity: { low: { label: 'Settled', short: 'settled', max: 30 }, high: { label: 'Open', short: 'left open', min: 50 } },
  fracture: { low: { label: 'Told straight', short: 'told straight', max: 20 }, high: { label: 'Broken up', short: 'broken up', min: 45 } },
};

export const CLEAR_SKY = Object.freeze({ length: 'any', language: 'any', tempers: Object.freeze({}) });

/** A seeing as it may have been kept: anything unknown is dropped, so a stale or odd value clears rather than breaks. */
export function cleanSeeing(raw) {
  const out = { length: 'any', language: 'any', tempers: {} };
  if (!raw || typeof raw !== 'object') return out;
  if (LENGTHS.some(entry => entry.id === raw.length)) out.length = raw.length;
  if (LANGUAGES.some(entry => entry.id === raw.language)) out.language = raw.language;
  for (const id of TEMPER_IDS) {
    const value = raw.tempers && raw.tempers[id];
    if (value === 'low' || value === 'high') out.tempers[id] = value;
  }
  return out;
}

export const isClear = seeing => !seeing || (seeing.length === 'any' && seeing.language === 'any' && !Object.keys(seeing.tempers || {}).length);

/** Tonight's seeing in a few words: "under 2 hours · in English · gentle". Empty for a clear sky. */
export function describeSeeing(seeing) {
  if (isClear(seeing)) return '';
  const words = [];
  const length = LENGTHS.find(entry => entry.id === seeing.length);
  if (length && length.short) words.push(length.short);
  const language = LANGUAGES.find(entry => entry.id === seeing.language);
  if (language && language.short) words.push(language.short);
  for (const id of TEMPER_IDS) {
    const way = seeing.tempers[id];
    if (way) words.push(LIMITS[id][way].short);
  }
  return words.join(' · ');
}

/** The films each language trait is spoken in, worked out once (and again as stars are added). */
function languagesOf(universe) {
  const cache = universe.__languages;
  if (cache && cache.count === universe.count) return cache;
  const english = new Set();
  const spoken = new Set();
  universe.traits.forEach((trait, id) => {
    if (trait.k !== 'language') return;
    const light = LIGHT_IDS[trait.l];
    if (!light) return;
    for (const star of universe.model.index[light].carriers(id)) {
      spoken.add(star);
      if (/\bEnglish\b/.test(trait.t)) english.add(star);
    }
  });
  const next = { count: universe.count, english, spoken };
  Object.defineProperty(universe, '__languages', { value: next, configurable: true, writable: true, enumerable: false });
  return next;
}

/**
 * Why a film is outside tonight's seeing, in short phrases; empty if it is in view.
 * @returns {string[]} e.g. ['it runs 2 h 50 min', 'it is cruel to its people (62)']
 */
export function outside(universe, star, seeing) {
  if (isClear(seeing)) return [];
  const film = universe.films[star];
  if (!film) return [];
  const why = [];
  const length = LENGTHS.find(entry => entry.id === seeing.length);
  if (length && film.rt > length.max) why.push(`it runs ${Math.floor(film.rt / 60)}\u00a0h ${String(film.rt % 60).padStart(2, '0')}\u00a0min`);
  if (seeing.language !== 'any') {
    const { english, spoken } = languagesOf(universe);
    if (spoken.has(star)) {
      if (seeing.language === 'english' && !english.has(star)) why.push('it is not in English');
      if (seeing.language === 'other' && english.has(star)) why.push('it is in English');
    }
  }
  const own = temperOf(film);
  if (own) {
    TEMPER_IDS.forEach((id, n) => {
      const way = seeing.tempers[id];
      const value = own[n];
      if (!way || !(value >= 0)) return;
      const limit = LIMITS[id][way];
      if (way === 'low' && value > limit.max) why.push(`its ${id} reads ${value}`);
      if (way === 'high' && value < limit.min) why.push(`its ${id} reads only ${value}`);
    });
  }
  return why;
}

/** Every film outside tonight's seeing: the haze. */
export function hazeOf(universe, seeing) {
  const haze = new Set();
  if (isClear(seeing)) return haze;
  for (let star = 0; star < universe.count; star += 1) if (outside(universe, star, seeing).length) haze.add(star);
  return haze;
}
