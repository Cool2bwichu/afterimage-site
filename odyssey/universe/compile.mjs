#!/usr/bin/env node
// Compiles the universe: reads the ATLAS corpus, works out how every film is
// like every other under six lights, finds the galaxies and constellations,
// lays each sky out, and writes the chart the site flies through.
//
//   node universe/compile.mjs [--atlas /path/to/film-atlas] [--out public/data]
//
// The output is deterministic: the same corpus gives the same bytes.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAtlas } from './lib/load.mjs';
import { buildModel, LINK_TYPES, LINK_SOURCES } from './lib/model.mjs';
import { formGalaxies } from './lib/galaxies.mjs';
import { layoutSky } from './lib/layout.mjs';
import { nameGalaxies, nameArm } from './lib/naming.mjs';
import { findConstellations } from './lib/constellations.mjs';
import { BEATS, ARCS } from './authored/beats.mjs';
import { encodeArray } from '../src/engine/codec.mjs';
import { LIGHT_IDS } from '../src/engine/lights.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const atlasRoot = resolve(option('atlas', process.env.ATLAS_ROOT || join(here, '../../../film-atlas')));
const outDir = resolve(option('out', join(here, '../public/data')));
const quiet = args.includes('--quiet');
const log = (...parts) => { if (!quiet) console.log(...parts); };

export const SKIES = ['white', ...LIGHT_IDS];
// How many families to look for under each light, and the smallest one worth a name.
const SKY_SETTINGS = {
  white: { target: 12, minSize: 24 },
  story: { target: 12, minSize: 24 },
  feeling: { target: 12, minSize: 24 },
  image: { target: 12, minSize: 24 },
  idea: { target: 12, minSize: 24 },
  world: { target: 12, minSize: 24 },
  hands: { target: 14, minSize: 40 },
};

const WIKIMEDIA = 'https://upload.wikimedia.org/wikipedia/';
const NEAR = 10; // neighbours kept per film for passages

/** The Wikipedia lead, trimmed to a sentence or two and cleared of bracketed asides. */
function synopsis(text) {
  if (!text) return '';
  let clean = text.replace(/\s+/g, ' ').trim();
  // Drop bracketed asides, innermost first (translations, pronunciations, alternate titles).
  for (let pass = 0; pass < 4; pass += 1) clean = clean.replace(/\s*\([^()]*\)/g, '');
  clean = clean.replace(/\s+([,.;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  if (clean.length <= 300) return clean;
  const cut = clean.slice(0, 300);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.” '));
  return stop > 120 ? cut.slice(0, stop + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

const round = (value, places = 2) => Math.round(value * 10 ** places) / 10 ** places;

export function compileUniverse(root) {
  const started = Date.now();
  const atlas = loadAtlas(root);
  const { count, extracted, packed, links, model } = buildModel(atlas);
  const { films } = atlas;
  const traits = packed.traits;
  log(`films ${count} · traits ${traits.length} · drawn lines ${links.length} · ${Date.now() - started} ms`);

  // ── Each light's sky: galaxies, arms, positions.
  const positions = {};
  const membership = {};
  const arms = {};
  const galaxies = {};
  let near = null;
  for (const sky of SKIES) {
    const t0 = Date.now();
    const indexes = sky === 'white' ? LIGHT_IDS.map(id => model.index[id]) : [model.index[sky]];
    const formed = formGalaxies({
      lightId: sky, count, traits, films, indexes,
      scores: (i, out) => model.scores(sky, i, out),
      ...SKY_SETTINGS[sky],
    });
    const laid = layoutSky({
      lightId: sky, count,
      galaxies: formed.galaxies, galaxyOf: formed.galaxyOf, armOf: formed.armOf,
      centrality: formed.centrality, edges: formed.graph.edges,
    });
    const named = nameGalaxies({ lightId: sky, galaxies: formed.galaxies, traits });
    positions[sky] = laid.positions;
    membership[sky] = formed.galaxyOf;
    arms[sky] = formed.armOf;
    if (sky === 'white') {
      // Each film's nearest neighbours in white light: the roads a passage travels.
      near = new Uint16Array(count * NEAR).fill(0xffff);
      formed.graph.lists.forEach((list, film) => {
        list.slice(0, NEAR).forEach((entry, at) => { near[film * NEAR + at] = entry.i; });
      });
    }
    galaxies[sky] = named.map((galaxy, at) => {
      const shape = laid.shapes[at];
      const takenArms = new Set();
      return {
        g: galaxy.g,
        name: galaxy.name,
        thesis: galaxy.thesis,
        size: galaxy.size,
        centre: shape.centre,
        radius: shape.radius,
        normal: shape.normal,
        medoid: galaxy.medoid,
        doors: galaxy.doors,
        typical: galaxy.typical,
        top: galaxy.top.map(entry => [entry.trait, Math.round(entry.share * 100)]),
        arms: galaxy.arms.map(arm => {
          const name = nameArm({ arm, galaxy, traits, taken: takenArms, films });
          takenArms.add(name);
          // Where the arm's label goes: the middle of its films.
          const at3 = [0, 0, 0];
          let n = 0;
          for (let film = 0; film < count; film += 1) {
            if (formed.galaxyOf[film] !== galaxy.g || formed.armOf[film] !== arm.arm) continue;
            at3[0] += laid.positions[film * 3]; at3[1] += laid.positions[film * 3 + 1]; at3[2] += laid.positions[film * 3 + 2];
            n += 1;
          }
          return {
            arm: arm.arm,
            name,
            size: arm.size,
            at: at3.map(v => round(v / Math.max(1, n), 1)),
            top: arm.top.map(entry => entry.trait),
            lead: arm.lead,
          };
        }),
      };
    });
    const unlit = Array.from(formed.galaxyOf).filter(g => g === 255).length;
    log(`${sky.padEnd(8)} ${String(named.length).padStart(2)} galaxies · ${String(unlit).padStart(3)} unlit · ${Date.now() - t0} ms · ${named.map(g => g.name + (g.authored ? '' : '*')).join(', ')}`);
  }

  const constellations = findConstellations({ count, films, traits, lights: packed.lights });
  log(`constellations ${constellations.length}`);

  // ── The films themselves, with short keys: this is most of the file.
  const beatIndex = new Map(BEATS.map((beat, i) => [beat.id, i]));
  const arcIndex = new Map(ARCS.map((arc, i) => [arc.id, i]));
  const registerIds = Object.keys(atlas.registers);
  const filmRecords = films.map((film, i) => {
    const story = extracted.stories[i];
    const record = {
      t: film.title,
      y: Number(film.year) || 0,
      d: film.director,
      s: film.slug,
      rn: film.renown,
      hi: film.hi,
      lo: film.lo,
    };
    if (film.runtime) record.rt = Math.round(film.runtime);
    const countries = film.country.map(q => atlas.label(q)).filter(Boolean).slice(0, 3);
    if (countries.length) record.c = countries;
    const lead = synopsis(film.description);
    if (lead) record.x = lead;
    if (film.wikipedia) record.w = film.wikipedia;
    if (film.poster && film.poster.startsWith(WIKIMEDIA)) record.p = film.poster.slice(WIKIMEDIA.length).split('?')[0];
    if (film.imdb) record.im = film.imdb;
    if (film.consensus) {
      record.kn = film.consensus.known === 'well' ? 2 : 1;
      if (film.consensus.recall) record.rc = film.consensus.recall;
    }
    if (film.axes) record.ax = ['dread', 'cruelty', 'irony', 'ambiguity', 'fracture'].map(axis => Math.round(film.axes[axis]?.score ?? -1));
    if (film.registers.length) record.rg = film.registers.map(id => registerIds.indexOf(id)).filter(n => n >= 0);
    if (story) {
      record.st = {
        a: story.arc && story.arcFit >= 0.7 ? arcIndex.get(story.arc) : -1,
        f: Math.round(story.arcFit * 100),
        c: story.curve.map(v => Math.round(v * 100)),
        b: story.beats.map(({ id, acts }) => [beatIndex.get(id), ...acts]),
      };
    }
    return record;
  });

  const universe = {
    v: 1,
    source: atlas.versions,
    films: filmRecords,
    traits: traits.map(trait => {
      const out = { l: LIGHT_IDS.indexOf(trait.light), k: trait.kind, t: trait.label, s: trait.short, df: trait.df };
      if (trait.adj) out.a = trait.adj;
      if (trait.noun) out.n = trait.noun;
      if (trait.veiled) out.v = 1;
      return out;
    }),
    traitIdf: encodeArray(packed.idf),
    vectors: Object.fromEntries(LIGHT_IDS.map(light => [light, {
      ptr: encodeArray(packed.lights[light].ptr),
      idx: encodeArray(Uint16Array.from(packed.lights[light].idx)),
      raw: encodeArray(packed.lights[light].raw),
    }])),
    links: links.map(link => [link.a, link.b, link.type, link.source, Math.round(link.strength * 100), link.from, link.claim]),
    linkTypes: LINK_TYPES,
    linkSources: LINK_SOURCES,
    positions: Object.fromEntries(SKIES.map(sky => [sky, encodeArray(Float32Array.from(positions[sky], v => Math.round(v * 10) / 10))])),
    membership: Object.fromEntries(SKIES.map(sky => [sky, encodeArray(membership[sky])])),
    arms: Object.fromEntries(SKIES.map(sky => [sky, encodeArray(arms[sky])])),
    near: { k: NEAR, white: encodeArray(near) },
    galaxies,
    constellations: constellations.map(c => ({ name: c.name, traits: c.traits, stars: c.stars })),
    registers: registerIds.map(id => ({
      id,
      label: atlas.registers[id].label,
      blurb: atlas.registers[id].blurb,
      hue: atlas.registers[id].treatment?.hue || '#f4efe5',
    })),
    beats: BEATS.map(beat => ({ id: beat.id, phrase: beat.phrase, verb: beat.verb, ...(beat.ending ? { ending: 1 } : {}) })),
    arcs: ARCS.map(arc => ({ id: arc.id, name: arc.name, line: arc.line })),
  };

  // ── Depth: what a dossier shows once a film is open. Loaded after the sky.
  const names = qids => (qids || []).map(q => atlas.label(q)).filter(name => name && !/^Q\d+$/.test(name));
  const depth = {
    v: 1,
    source: atlas.versions,
    films: films.map(film => {
      const record = {};
      if (film.axes) record.ax = ['dread', 'cruelty', 'irony', 'ambiguity', 'fracture'].map(axis => film.axes[axis]?.basis || '');
      const cast = names(film.cast).slice(0, 6);
      if (cast.length) record.cast = cast;
      const crew = {};
      for (const [role, key] of [['writer', 'screenwriter'], ['dp', 'cinematographer'], ['editor', 'editor'], ['music', 'composer']]) {
        const people = names(film.crew[key]).slice(0, 3);
        if (people.length) crew[role] = people;
      }
      if (Object.keys(crew).length) record.crew = crew;
      return record;
    }),
  };

  return { universe, depth, stats: { count, traits: traits.length, links: links.length, constellations: constellations.length, ms: Date.now() - started } };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const { universe, depth, stats } = compileUniverse(atlasRoot);
  mkdirSync(outDir, { recursive: true });
  const universeText = JSON.stringify(universe);
  const depthText = JSON.stringify(depth);
  writeFileSync(join(outDir, 'universe.json'), universeText);
  writeFileSync(join(outDir, 'depth.json'), depthText);
  log(`wrote ${join(outDir, 'universe.json')} (${(universeText.length / 1e6).toFixed(2)} MB) and depth.json (${(depthText.length / 1e6).toFixed(2)} MB) in ${stats.ms} ms`);
}
