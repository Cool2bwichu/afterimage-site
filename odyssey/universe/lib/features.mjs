// Turns every film's data into six sparse trait vectors, one per light.
// A trait is anything two films can share: a mood, a beat of the story, a
// cinematographer, a decade, a subject. Each carries the words the site uses
// for it, so a connection can always say what it is made of.
import { ATTRIBUTES, AXES, REGISTER_LIGHT, FRAME_TRAITS, ASPECTS, decadeOf } from '../authored/vocabulary.mjs';
import { classifyKeyword, conceptFor } from '../authored/keywords.mjs';
import { BEATS, ARCS } from '../authored/beats.mjs';
import { analysePlot } from './story.mjs';
import { LIGHT_IDS } from '../../src/engine/lights.mjs';

const SMALL_WORDS = new Set(['a', 'an', 'and', 'at', 'by', 'de', 'del', 'for', 'in', 'la', 'of', 'on', 'or', 'the', 'to', 'vs', 'with']);
const UPPER = { ii: 'II', iii: 'III', usa: 'USA', uk: 'UK', fbi: 'FBI', cia: 'CIA', lgbt: 'LGBT', dc: 'DC', ptsd: 'PTSD', 'a.i.': 'A.I.', tv: 'TV', 'u.s.': 'U.S.', bl: 'BL' };

export function titleCase(text) {
  return text.split(' ').map((word, i) => {
    const bare = word.replace(/[(),]/g, '');
    if (UPPER[bare]) return word.replace(bare, UPPER[bare]);
    if (i > 0 && SMALL_WORDS.has(bare)) return word;
    // Capitalise each hyphenated part, but leave small words inside a compound alone ("Coming-of-Age").
    return word.split('-').map((part, j) => {
      if (j > 0 && SMALL_WORDS.has(part)) return part;
      return part.replace(/^([(“"]?)([a-zà-ÿ])/, (_, lead, ch) => lead + ch.toUpperCase());
    }).join('-');
  }).join(' ');
}

const THE_COUNTRIES = /^(United|Soviet|People's|Weimar|Netherlands|Czech Republic|Philippines|German Democratic|Ottoman|Russian Empire|Kingdom|Republic)/;
function countryName(label) {
  if (label === "People's Republic of China") return 'China';
  return THE_COUNTRIES.test(label) ? `the ${label}` : label;
}

function cleanGenre(label) {
  return label.replace(/\s+(film|movie)$/i, '').replace(/\s+film\b/i, '').trim();
}

const GENRE_REROUTE = {
  'silent film': { light: 'image', key: 'kw:silent film', label: 'silent', short: 'Silent Film', kind: 'form', weight: 0.9 },
  'LGBTQ-related film': { light: 'idea', key: 'kw:lgbt', label: 'queer lives', short: 'Queer Lives', kind: 'theme', weight: 0.7 },
  'flashback film': { light: 'story', key: 'kw:flashback', label: 'told in flashback', short: 'Flashbacks', kind: 'event', weight: 0.6 },
  'experimental film': { light: 'image', key: 'kw:experimental', label: 'experimental form', short: 'Experiments', kind: 'form', weight: 0.7 },
  'anthology film': null, 'independent film': null, 'art film': null, 'drama film': null, 'film': null,
  'speculative fiction film': null, 'film based on literature': null, 'film based on a novel': null,
};

function periodLabel(k) {
  if (/^\d{4}s$/.test(k)) return `the ${k}`;
  if (/century$/.test(k)) return `the ${k}`;
  if (/(period|era)( \(.*\))?$/.test(k)) return `the ${titleCase(k.replace(/ \(.*\)$/, ''))}`;
  return titleCase(k);
}

function keywordLabel(k, kind) {
  switch (kind) {
    case 'period': return { label: periodLabel(k), short: titleCase(k.replace(/ \(.*\)$/, '')) };
    case 'place': {
      const bare = titleCase(k.split(',')[0]);
      return { label: `set in ${bare}`, short: bare };
    }
    case 'placetype': return { label: titleCase(k).toLowerCase(), short: titleCase(k) };
    default: return { label: k, short: titleCase(k) };
  }
}

/**
 * @returns {{ rows: Record<string, Map<string, number>[]>, meta: Map<string, object>, stories: (object|null)[] }}
 * rows[light][filmIndex] maps "light|key" trait ids to weights in 0..1.
 */
export function extractFeatures(atlas) {
  const { films, label } = atlas;
  const rows = Object.fromEntries(LIGHT_IDS.map(light => [light, films.map(() => new Map())]));
  const meta = new Map();
  const stories = [];

  const add = (film, light, key, weight, info) => {
    if (!(weight > 0)) return;
    const id = `${light}|${key}`;
    const row = rows[light][film.i];
    row.set(id, Math.min(1, Math.max(row.get(id) || 0, weight)));
    if (!meta.has(id)) meta.set(id, { id, light, ...info });
  };

  const addKeyword = (film, raw, boost = 1) => {
    const k = String(raw).toLowerCase().trim();
    const cls = classifyKeyword(k);
    if (!cls) return;
    if (cls.concept) {
      const { key, label: phrase, short } = cls.concept;
      add(film, cls.light, `concept:${key}`, Math.min(1, cls.weight * boost), { kind: cls.kind, label: phrase, short, concept: key });
      return;
    }
    if (cls.kind === 'place') {
      const bare = k.split(',')[0].trim();
      add(film, 'world', `place:${bare}`, Math.max(cls.weight, 0.5) * boost, { kind: 'place', label: `set in ${titleCase(bare)}`, short: titleCase(bare) });
      return;
    }
    add(film, cls.light, `kw:${k}`, cls.weight * boost, { kind: cls.kind, ...keywordLabel(k, cls.kind) });
  };

  // Frame measurement cuts, from the films that have frames.
  const framed = films.filter(f => f.frames);
  const quantile = (values, p) => {
    const sorted = values.filter(v => typeof v === 'number').sort((a, b) => a - b);
    return sorted[Math.floor(p * (sorted.length - 1))];
  };
  const cuts = {};
  for (const key of ['glare', 'hardness']) {
    cuts[key] = [quantile(framed.map(f => f.frames[key]), 0.25), quantile(framed.map(f => f.frames[key]), 0.75)];
  }
  const coloured = framed.filter(f => f.frames.chroma > 0.004);
  for (const key of ['chroma', 'warmth']) {
    cuts[key] = [quantile(coloured.map(f => f.frames[key]), 0.25), quantile(coloured.map(f => f.frames[key]), 0.75)];
  }

  for (const film of films) {
    const names = qids => (qids || []).map(q => [q, label(q)]).filter(([, name]) => name && !/^Q\d+$/.test(name));

    // ── Consensus attributes: the model-remembered character of the film.
    if (film.consensus) {
      for (const [attr, value] of Object.entries(film.consensus.attrs)) {
        const def = ATTRIBUTES[attr];
        if (!def) continue;
        add(film, def.light, `attr:${attr}`, value, { kind: 'attr', label: def.label, short: def.noun, adj: def.adj, noun: def.noun, attr });
      }
    }

    // ── The five scored axes, only when a film sits clearly at a pole.
    if (film.axes) {
      for (const [axis, def] of Object.entries(AXES)) {
        const score = film.axes[axis]?.score;
        if (typeof score !== 'number') continue;
        if (def.high && score >= 60) {
          add(film, def.light, `axis:${def.high.id}`, 0.5 + (score - 60) / 80, { kind: 'axis', label: def.high.label, short: def.high.noun, adj: def.high.adj, noun: def.high.noun });
        } else if (def.low && score <= 22) {
          add(film, def.light, `axis:${def.low.id}`, 0.5 + (22 - score) / 44, { kind: 'axis', label: def.low.label, short: def.low.noun, adj: def.low.adj, noun: def.low.noun });
        }
      }
    }

    // ── Story: shape and beats read from the plot summary.
    const story = analysePlot(film.plot);
    stories.push(story);
    if (story) {
      if (story.arc) {
        const arc = ARCS.find(a => a.id === story.arc);
        // A rough instrument, so it only counts when the fit is strong, and never for much.
        if (story.arcFit >= 0.7) add(film, 'story', `arc:${arc.id}`, 0.18 + 0.22 * Math.min(1, (story.arcFit - 0.7) / 0.25), { kind: 'arc', label: arc.line, short: arc.name, veiled: true });
      }
      for (const { id, acts } of story.beats) {
        const beat = BEATS.find(b => b.id === id);
        const total = acts[0] + acts[1] + acts[2];
        add(film, 'story', `beat:${id}`, total >= 2 ? 0.7 : 0.5, { kind: 'beat', label: beat.phrase, short: titleCase(beat.phrase.replace(/^(a|an) /, '')), veiled: Boolean(beat.ending) });
        if (acts[0] > 0 && !beat.ending) add(film, 'story', `open:${id}`, 0.3, { kind: 'opening', label: `opens with ${beat.phrase}`, short: `Opening: ${titleCase(beat.phrase.replace(/^(a|an) /, ''))}` });
        if (acts[2] > 0 && beat.ending) add(film, 'story', `end:${id}`, 0.45, { kind: 'ending', label: `a last act with ${beat.phrase}`, short: `Ending: ${titleCase(beat.phrase.replace(/^(a|an) /, ''))}`, veiled: true });
      }
    }
    for (const tag of film.predicates) {
      const phrase = String(tag.predicate).replace(/-/g, ' ');
      add(film, 'story', `pred:${tag.predicate}`, 0.9 * Math.max(0.4, Math.min(1, tag.centrality || 0.5)), { kind: 'predicate', label: phrase, short: titleCase(phrase) });
    }

    // ── Image: the record of how it was photographed.
    const colour = names(film.colour).map(([, name]) => name);
    const bw = colour.includes('black-and-white') && !colour.includes('color');
    if (bw) add(film, 'image', 'look:bw', 0.9, { kind: 'look', label: 'black and white', short: 'Black and White', adj: 'Monochrome', noun: 'Silver' });
    const genreNames = names(film.genre).map(([, name]) => name);
    if (genreNames.some(name => /anim/i.test(name)) || film.keywords.includes('anime')) {
      add(film, 'image', 'look:animation', 0.9, { kind: 'look', label: 'animated', short: 'Animation', adj: 'Animated', noun: 'Animation' });
    }
    const decade = decadeOf(film.year);
    if (decade) add(film, 'image', `decade:${decade}`, 0.45, { kind: 'decade', label: `the look of the ${decade}`, short: `The ${decade}` });
    for (const [, ratio] of names(film.aspect)) {
      for (const [id, def] of Object.entries(ASPECTS)) {
        if (def.match.includes(ratio)) add(film, 'image', `aspect:${id}`, 0.35, { kind: 'aspect', label: def.label, short: titleCase(def.label.replace(/^a /, '')) });
      }
    }
    if (film.frames) {
      const fm = film.frames;
      const frame = (id, on) => { if (on) add(film, 'image', `frame:${id}`, 0.6, { kind: 'frame', ...FRAME_TRAITS[id], short: FRAME_TRAITS[id].noun }); };
      frame('bright', fm.glare >= cuts.glare[1]);
      frame('dim', fm.glare <= cuts.glare[0]);
      frame('hard', fm.hardness >= cuts.hardness[1]);
      frame('soft', fm.hardness <= cuts.hardness[0]);
      if (fm.chroma > 0.004) {
        frame('saturated', fm.chroma >= cuts.chroma[1]);
        frame('muted', fm.chroma <= cuts.chroma[0]);
        frame('warm', fm.warmth >= cuts.warmth[1]);
        frame('cool', fm.warmth <= cuts.warmth[0]);
      }
    }
    for (const [qid, name] of names(film.crew.cinematographer)) {
      add(film, 'image', `eye:${qid}`, 0.35, { kind: 'eye', label: `shot by ${name}`, short: name });
      add(film, 'hands', `dp:${qid}`, 0.5, { kind: 'crew', label: `shot by ${name}`, short: name });
    }
    for (const [qid, name] of names(film.crew.composer)) {
      add(film, 'image', `ear:${qid}`, 0.3, { kind: 'ear', label: `scored by ${name}`, short: name });
      add(film, 'hands', `composer:${qid}`, 0.4, { kind: 'crew', label: `scored by ${name}`, short: name });
    }

    // ── World: genre, place, period, country.
    for (const [, name] of names(film.genre)) {
      if (name in GENRE_REROUTE) {
        const route = GENRE_REROUTE[name];
        if (route) add(film, route.light, route.key, route.weight, { kind: route.kind, label: route.label, short: route.short });
        continue;
      }
      const clean = cleanGenre(name);
      if (!clean || clean.toLowerCase() === 'drama') continue;
      const concept = conceptFor(clean) || conceptFor(name);
      if (concept) {
        add(film, concept.light, `concept:${concept.key}`, Math.max(concept.weight, 0.75), { kind: concept.kind, label: concept.label, short: concept.short, concept: concept.key });
        continue;
      }
      add(film, 'world', `genre:${clean.toLowerCase()}`, 0.8, { kind: 'genre', label: clean, short: titleCase(clean) });
    }
    for (const [, name] of names(film.setting)) {
      add(film, 'world', `place:${name.toLowerCase()}`, 0.7, { kind: 'place', label: `set in ${name}`, short: name });
    }
    for (const [qid, name] of names(film.country)) {
      add(film, 'world', `country:${qid}`, 0.35, { kind: 'country', label: `from ${countryName(name)}`, short: name === "People's Republic of China" ? 'China' : name });
      if (decade) {
        const short = name === "People's Republic of China" ? 'China' : name;
        add(film, 'hands', `era:${qid}:${decade}`, 0.5, { kind: 'era', label: `${countryName(name)} in the ${decade}`, short: `${short}, ${decade}` });
      }
    }
    for (const [qid, name] of names(film.language)) {
      add(film, 'world', `language:${qid}`, 0.25, { kind: 'language', label: `spoken in ${name}`, short: name });
    }

    // ── Hands: who made it and where it comes from.
    for (const [qid, name] of names(film.crew.director)) add(film, 'hands', `director:${qid}`, 1, { kind: 'director', label: `directed by ${name}`, short: name });
    for (const [qid, name] of names(film.crew.screenwriter)) add(film, 'hands', `writer:${qid}`, 0.6, { kind: 'crew', label: `written by ${name}`, short: name });
    for (const [qid, name] of names(film.crew.editor)) add(film, 'hands', `editor:${qid}`, 0.4, { kind: 'crew', label: `cut by ${name}`, short: name });
    for (const [qid, name] of names(film.cast)) add(film, 'hands', `cast:${qid}`, 0.35, { kind: 'cast', label: `with ${name}`, short: name });
    for (const [qid, name] of names(film.studio)) add(film, 'hands', `studio:${qid}`, 0.3, { kind: 'studio', label: `made at ${name}`, short: name });
    for (const [qid, name] of names(film.movement)) {
      const proper = /^[a-z]/.test(name) ? name : `the ${name}`;
      add(film, 'hands', `movement:${qid}`, 0.9, { kind: 'movement', label: `part of ${proper}`, short: titleCase(name) });
    }
    for (const [qid, name] of names(film.sourceAuthors)) add(film, 'hands', `author:${qid}`, 0.7, { kind: 'author', label: `from the writing of ${name}`, short: name });
    for (const [qid, name] of names(film.basedOn)) add(film, 'hands', `source:${qid}`, 0.6, { kind: 'source', label: `drawn from ${name}`, short: name });

    // ── Subjects and keywords, each sorted into the light it belongs to.
    for (const [, name] of names(film.subject)) addKeyword(film, name, 1.25);
    for (const keyword of film.keywords) addKeyword(film, keyword);

    // ── The 28 ATLAS worlds.
    for (const id of film.registers) {
      const light = REGISTER_LIGHT[id];
      const def = atlas.registers[id];
      if (!light || !def || id === 'silver-print') continue;
      add(film, light, `world:${id}`, 0.75, { kind: 'register', label: def.label.toLowerCase(), short: def.label, register: id });
    }
  }

  mergeTwins(rows, meta);
  return { rows, meta, stories };
}

// The same thing is sometimes found twice, by different instruments: a plot
// summary mentions an investigation, and the film is remembered as one. Those
// are one trait, and two sightings of it count for a little more than one.
const twinRank = info => (info.kind === 'attr' ? 0 : info.kind === 'axis' ? 1 : info.concept ? 2 : info.kind === 'beat' ? 3 : 4);

function mergeTwins(rows, meta) {
  for (const light of LIGHT_IDS) {
    const byLabel = new Map();
    for (const info of meta.values()) {
      if (info.light !== light) continue;
      const key = info.label.toLowerCase();
      if (!byLabel.has(key)) byLabel.set(key, []);
      byLabel.get(key).push(info);
    }
    const alias = new Map();
    for (const group of byLabel.values()) {
      if (group.length < 2) continue;
      group.sort((a, b) => twinRank(a) - twinRank(b) || a.id.localeCompare(b.id));
      const keep = group[0];
      for (const other of group.slice(1)) {
        alias.set(other.id, keep.id);
        if (other.veiled) keep.veiled = true;
        for (const field of ['adj', 'noun', 'attr', 'concept', 'register']) {
          if (keep[field] === undefined && other[field] !== undefined) keep[field] = other[field];
        }
        meta.delete(other.id);
      }
    }
    if (!alias.size) continue;
    for (const row of rows[light]) {
      for (const [id, weight] of [...row.entries()]) {
        const target = alias.get(id);
        if (!target) continue;
        row.delete(id);
        const existing = row.get(target) || 0;
        row.set(target, Math.min(1, Math.max(existing, weight) + 0.25 * Math.min(existing, weight)));
      }
    }
  }
}

/**
 * Drops traits too rare or too common to say anything, numbers the rest, and
 * packs each light into the arrays the likeness engine reads.
 */
const IDF_POWER = 0.6;
// Incidental traits need three films before they count as a connection.
const LOOSE_KINDS = new Set(['motif', 'icon', 'role', 'cast', 'studio', 'ear', 'placetype', 'mood']);

export function packFeatures({ rows, meta }, count) {
  const maxShare = 0.5;
  const traits = [];
  const indexOf = new Map();
  for (const light of LIGHT_IDS) {
    const df = new Map();
    for (const row of rows[light]) for (const id of row.keys()) df.set(id, (df.get(id) || 0) + 1);
    const kept = [...df.entries()]
      .filter(([id, n]) => n >= (LOOSE_KINDS.has(meta.get(id).kind) ? 3 : 2) && n <= count * maxShare)
      .map(([id]) => id).sort();
    for (const id of kept) {
      indexOf.set(id, traits.length);
      // Rarity, flattened: a trait two films share by accident should not outweigh a mood forty films share.
      const idf = (Math.log(count / df.get(id)) / Math.log(count)) ** IDF_POWER;
      traits.push({ ...meta.get(id), df: df.get(id), idf });
    }
  }
  const idf = Float32Array.from(traits, t => t.idf);
  const lights = {};
  for (const light of LIGHT_IDS) {
    const ptr = new Uint32Array(count + 1);
    const idx = [];
    const raw = [];
    rows[light].forEach((row, i) => {
      const entries = [...row.entries()].filter(([id]) => indexOf.has(id)).map(([id, w]) => [indexOf.get(id), w]).sort((a, b) => a[0] - b[0]);
      for (const [trait, w] of entries) {
        idx.push(trait);
        raw.push(Math.max(1, Math.min(255, Math.round(w * 255))));
      }
      ptr[i + 1] = idx.length;
    });
    lights[light] = { ptr, idx: Uint32Array.from(idx), raw: Uint8Array.from(raw) };
  }
  return { traits, idf, lights };
}
