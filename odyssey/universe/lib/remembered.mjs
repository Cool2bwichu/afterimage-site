// Films the atlas does not hold, charted by Claude from memory when the chart is printed.
//
// ATLAS was built from a corpus that leaves out some of the most loved films there
// are (Casablanca, Pulp Fiction, Amélie). A chart a film lover cannot find them on
// is not one they will trust, so the films they will look for first are charted
// from memory: Claude (Opus 5.5) wrote a star reading of each, in the same words a
// Navigator uses to chart a film live (see brain/prompts.mjs), and each reading was
// checked before it was kept (scripts/remembered/). They are kept, cleaned, in
// universe/authored/remembered.json.
//
// Here each reading becomes a film of the chart: a record beside the atlas's own,
// and one row of traits per light, weighted the way the compiler weights the same
// traits for the films it reads from the atlas. They are marked as charted from
// memory everywhere a visitor meets them.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { slugify } from './load.mjs';
import { LIGHT_IDS } from '../../src/engine/lights.mjs';
import { fold } from '../../src/engine/search.mjs';

const here = import.meta.dirname;
export const REMEMBERED_FILE = join(here, '../authored/remembered.json');

const AXES = ['dread', 'cruelty', 'irony', 'ambiguity', 'fracture'];
// The poles a film carries when it sits clearly at one end of a scored axis (lib/features.mjs).
const POLES = {
  dread: { light: 'feeling', high: 'steeped in dread', low: 'at ease' },
  cruelty: { light: 'feeling', high: 'cruel to its people', low: 'tender to its people' },
  irony: { light: 'feeling', high: 'held at an ironic distance', low: 'wholly sincere' },
  ambiguity: { light: 'story', high: 'an ending left open', low: null },
  fracture: { light: 'story', high: 'a fractured telling', low: null },
};
// The strongest tag first, on the scale the atlas's remembered attributes use.
const RANK_WEIGHT = [1, 0.75, 0.75, 0.5, 0.5, 0.5];
const TAGGED = ['story', 'feeling', 'image', 'idea', 'world'];

/** The readings kept for the chart, or none. */
export function loadRemembered(file = REMEMBERED_FILE) {
  if (!existsSync(file)) return [];
  const kept = JSON.parse(readFileSync(file, 'utf8'));
  return Array.isArray(kept.films) ? kept.films : [];
}

/**
 * Adds each remembered film to the atlas's films, after the atlas's own, as a record
 * the rest of the compiler can read. Films the atlas already holds are left out.
 * @returns {number} how many were added
 */
export function addRemembered(atlas, readings = loadRemembered()) {
  const taken = new Set(atlas.films.map(film => film.slug));
  const held = new Set(atlas.films.map(film => `${fold(film.title)}|${film.year}`));
  let added = 0;
  for (const reading of readings) {
    const year = Number(reading.year);
    if (!reading.title || !year || held.has(`${fold(reading.title)}|${year}`)) continue;
    let slug = `${slugify(reading.title)}-${year}`;
    while (taken.has(slug)) slug += '-b';
    taken.add(slug);
    held.add(`${fold(reading.title)}|${year}`);
    atlas.films.push({
      i: atlas.films.length,
      key: `memory:${slug}`, filmId: '', slug, qid: '',
      title: reading.title, year, director: reading.director || '',
      description: '', wikipedia: '', poster: '', posterLicence: '',
      hi: reading.hi, lo: reading.lo, paletteSource: 'memory', palette: null,
      runtime: 0, crew: {}, cast: [], studio: [], genre: [], movement: [], setting: [],
      subject: [], country: [], language: [], colour: [], aspect: [], basedOn: [],
      sourceAuthors: [], influencedBy: [], keywords: [],
      consensus: null, axes: null, frames: null, plot: null, predicates: [], registers: [],
      imdb: '', votes: 0,
      renown: Math.max(0, Math.min(4, Math.round(Number(reading.fame) || 0))),
      remembered: reading,
    });
    added += 1;
  }
  return added;
}

/**
 * Gives each remembered film its traits: the tags of its reading, the poles of its
 * scored axes, its decade, colour and drawing, its country and era, its setting,
 * movement and director. Every trait is one the atlas's films already carry, found
 * by its label, except a country, era or director the atlas has never named.
 * @param {{ rows: Record<string, Map<string, number>[]>, meta: Map<string, object> }} extracted
 * @returns {{ films: number, missed: string[] }} tags no trait answered to
 */
export function rememberedRows(extracted, atlas) {
  const { rows, meta } = extracted;
  const byLabel = new Map();
  const byShort = new Map();
  for (const info of meta.values()) {
    byLabel.set(`${info.light}|${fold(info.label)}`, info.id);
    if (info.short) {
      const key = `${info.light}|${info.kind}|${fold(info.short)}`;
      if (!byShort.has(key)) byShort.set(key, info.id);
    }
  }
  const missed = [];
  let films = 0;
  for (const film of atlas.films) {
    const reading = film.remembered;
    if (!reading) continue;
    films += 1;
    const add = (light, id, weight) => {
      if (!id) return false;
      const row = rows[light][film.i];
      row.set(id, Math.min(1, Math.max(row.get(id) || 0, weight)));
      return true;
    };
    const labelled = (light, label, weight) => add(light, byLabel.get(`${light}|${fold(label)}`), weight);
    const ensure = (light, kind, key, label, short, weight) => {
      const found = byShort.get(`${light}|${kind}|${fold(short)}`);
      if (found) return add(light, found, weight);
      const id = `${light}|${key}`;
      if (!meta.has(id)) {
        meta.set(id, { id, light, kind, label, short });
        byShort.set(`${light}|${kind}|${fold(short)}`, id);
      }
      return add(light, id, weight);
    };

    const tags = reading.tags || {};
    for (const light of TAGGED) {
      (tags[light] || []).forEach((label, rank) => {
        if (!labelled(light, label, RANK_WEIGHT[Math.min(rank, RANK_WEIGHT.length - 1)])) missed.push(`${light}: ${label}`);
      });
    }
    const axes = reading.axes || {};
    for (const axis of AXES) {
      const score = Number(axes[axis]);
      const pole = POLES[axis];
      if (!(score >= 0)) continue;
      if (score >= 60) labelled(pole.light, pole.high, 0.5 + (score - 60) / 80);
      else if (pole.low && score <= 22) labelled(pole.light, pole.low, 0.5 + (22 - score) / 44);
    }
    const decade = `${Math.floor(film.year / 10) * 10}s`;
    labelled('image', `the look of the ${decade}`, 0.45);
    if (reading.bw) labelled('image', 'black and white', 0.9);
    if (reading.animated) labelled('image', 'animated', 0.9);
    if (reading.country) {
      const country = reading.country;
      const named = /^(United|Soviet|Netherlands|Czech Republic|Philippines)/.test(country) ? `the ${country}` : country;
      ensure('world', 'country', `country:name:${slugify(country)}`, `from ${named}`, country, 0.35);
      ensure('hands', 'era', `era:name:${slugify(country)}:${decade}`, `${named} in the ${decade}`, `${country}, ${decade}`, 0.5);
    }
    if (reading.setting) labelled('world', `set in ${reading.setting}`, 0.7);
    if (reading.movement) {
      const id = byShort.get(`hands|movement|${fold(reading.movement)}`);
      if (id) add('hands', id, 0.9);
    }
    for (const name of String(reading.director || '').split(/\s*(?:,|&|\band\b)\s*/).map(part => part.trim()).filter(Boolean).slice(0, 3)) {
      ensure('hands', 'director', `director:name:${slugify(name)}`, `directed by ${name}`, name, 1);
    }
  }
  // A light no other film shares a row with still needs a row per film.
  for (const light of LIGHT_IDS) while (rows[light].length < atlas.films.length) rows[light].push(new Map());
  return { films, missed };
}

/** What the chart's record of a remembered film adds to the usual fields. */
export function rememberedRecord(film) {
  const reading = film.remembered;
  const record = { mem: 1, kn: reading.known === 'partly' ? 1 : 2 };
  if (reading.country) record.c = [reading.country];
  if (reading.premise) record.x = reading.premise;
  if (reading.afterimage) record.rc = reading.afterimage;
  const axes = reading.axes || {};
  if (AXES.some(axis => Number(axes[axis]) >= 0)) record.ax = AXES.map(axis => (Number(axes[axis]) >= 0 ? Math.round(Number(axes[axis])) : -1));
  return record;
}
