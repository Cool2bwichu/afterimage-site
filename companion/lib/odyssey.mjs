// The Odyssey's Navigator, served from the companion.
//
// The chart (odyssey/public/data) is opened here exactly as a browser opens it,
// and the same Navigator code (odyssey/brain) writes every prompt. A browser
// therefore never sends a prompt. It names an operation and names films by
// their slugs; the few things a viewer types go into the prompt as data.
//
// Films the Navigator charts from memory are kept in a commons, so a star one
// voyager found is there for the next, and so a later request can name it.
import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { EFFORT, STRICT_NOTE, strictSchema } from '../../odyssey/brain/contracts.mjs';
import { NavigatorError, createNavigator, restoreStars, settleReadings } from '../../odyssey/brain/navigator.mjs';
import { plainReading as plain, readingSlug, reviveReading } from '../../odyssey/brain/reading.mjs';
import { buildVocabulary } from '../../odyssey/brain/vocabulary.mjs';
import { LIGHT_IDS } from '../../odyssey/src/engine/lights.mjs';
import { createSearch } from '../../odyssey/src/engine/search.mjs';
import { openUniverse } from '../../odyssey/src/engine/universe.mjs';
import { engineError } from './engine-error.mjs';
import { extractJson, toStructuredSchema } from './structured-output.mjs';

export const ODYSSEY_OPERATIONS = Object.freeze(['arrival', 'deepfield', 'chart', 'course', 'collision', 'sky']);
export const ODYSSEY_DATA_DIRECTORY = fileURLToPath(new URL('../../odyssey/public/data', import.meta.url));
export const ODYSSEY_JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Wall-clock time for one answer. A browser polls a job, so these never hold a request open.
const DEADLINES = Object.freeze({ arrival: 150000, deepfield: 240000, chart: 120000, course: 240000, collision: 180000, sky: 180000 });
const MAX_ANSWER_CHARACTERS = 60000;
const JOB_TTL_MS = 15 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 12000; // one film asked of the catalogue
const LOOKUP_WAIT_MS = 6000;     // how long a finished answer waits for its posters
const LOOKUPS_AT_ONCE = 6;
const LOOKUP_TRIES = 3;
const COMMONS_PAGE = 600;
const COMMONS_PAGE_MAX = 2000;
const SLUG = /^[a-z0-9-]{1,180}$/;
const EFFORT_ORDER = ['low', 'medium', 'high', 'xhigh', 'max'];
const SOURCES = ['deepfield', 'chart', 'course', 'collision', 'sky'];
const TIMED_OUT = Symbol('timed out');

// What a browser may be told about a failure. Anything else is "it did not come through".
const FAILURES = Object.freeze({
  CLAUDE_TIMEOUT: 'The Navigator took too long to answer. Try again.',
  CLAUDE_UNAVAILABLE: 'Claude is busy or unreachable right now. Try again in a minute.',
  CLAUDE_USAGE_LIMIT: 'The Claude plan behind this companion has reached its usage limit for now.',
  CLAUDE_PLAN_UNAVAILABLE: 'The Claude plan behind this companion could not be used.',
  CLAUDE_MODEL_UNAVAILABLE: 'The Claude model this companion is set to is not available to its account.',
  CLAUDE_CODE_MISSING: 'Claude Code is not installed where the companion runs.',
  CLAUDE_DECLINED: 'Claude declined to answer that.',
  CLAUDE_INCOMPLETE: 'Claude ran out of room before finishing. Try again.',
  AUTH_REQUIRED: 'Claude is not connected to this companion.',
});

const bad = message => Object.assign(new Error(message), { code: 'BAD_REQUEST' });
const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const line = (value, max) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

function only(value, keys, label) {
  if (!isRecord(value) || Object.keys(value).some(key => !keys.includes(key))) throw bad(`${label} is not in the expected form.`);
  return value;
}
function slug(value, label) {
  if (typeof value !== 'string' || !SLUG.test(value)) throw bad(`${label} must name a star.`);
  return value;
}
function slugs(value, label, max) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) throw bad(`${label} must be a list of at most ${max} stars.`);
  return [...new Set(value.map(item => slug(item, label)))];
}
function words(value, label, max) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.length > max) throw bad(`${label} must be text of at most ${max} characters.`);
  return value.replace(/\s+/g, ' ').trim();
}
function whole(value, label, min, max, otherwise) {
  if (value === undefined) return otherwise;
  if (!Number.isInteger(value) || value < min || value > max) throw bad(`${label} must be a whole number from ${min} to ${max}.`);
  return value;
}

/** Checks what a browser sent, before anything is spent. Throws BAD_REQUEST. */
export function validateOdysseyRequest(body) {
  only(body, ['op', 'input'], 'An Odyssey request');
  if (!ODYSSEY_OPERATIONS.includes(body.op)) throw bad('That is not something the Navigator does.');
  const input = body.input === undefined ? {} : body.input;
  const op = body.op;
  if (op === 'arrival') {
    only(input, ['star', 'fresh'], 'An arrival');
    return { op, input: { star: slug(input.star, 'star'), fresh: input.fresh === true } };
  }
  if (op === 'deepfield') {
    only(input, ['star', 'count', 'already'], 'A deep field');
    return { op, input: { star: slug(input.star, 'star'), count: whole(input.count, 'count', 1, 12, 8), already: slugs(input.already, 'already', 80) } };
  }
  if (op === 'chart') {
    only(input, ['query', 'year', 'director'], 'A film to chart');
    const query = words(input.query, 'query', 200);
    if (!query) throw bad('Name a film to chart.');
    const year = input.year === undefined || input.year === 0 ? 0 : whole(input.year, 'year', 1888, 2100, 0);
    return { op, input: { query, year, director: words(input.director, 'director', 120) } };
  }
  if (op === 'course') {
    only(input, ['request', 'loved', 'seen', 'count'], 'A course');
    const request = words(input.request, 'request', 600);
    const loved = slugs(input.loved, 'loved', 40);
    if (!request && !loved.length) throw bad('Say what you are in the mood for, or mark a film you love.');
    return { op, input: { request, loved, seen: slugs(input.seen, 'seen', 80), count: whole(input.count, 'count', 3, 8, 5) } };
  }
  if (op === 'collision') {
    only(input, ['a', 'b'], 'A collision');
    const a = slug(input.a, 'a');
    const b = slug(input.b, 'b');
    if (a === b) throw bad('A collision needs two different films.');
    return { op, input: { a, b } };
  }
  only(input, ['loved'], 'A sky');
  const loved = slugs(input.loved, 'loved', 40);
  if (loved.length < 2) throw bad('Mark at least two films you love first.');
  return { op, input: { loved } };
}

/** "claude-opus-5-5" as people say it: "Opus 5.5". */
export function modelName(id) {
  const match = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(String(id));
  if (!match) return String(id);
  const minor = match[3] && match[3].length < 3 ? `.${match[3]}` : '';
  return `${match[1][0].toUpperCase()}${match[1].slice(1)} ${match[2]}${minor}`;
}

// Each kind of answer thinks no harder than it needs to, or at the configured effort when that is lower.
function cappedEffort(configured, cap) {
  return EFFORT_ORDER.indexOf(configured) >= 0 && EFFORT_ORDER.indexOf(configured) <= EFFORT_ORDER.indexOf(cap) ? configured : cap;
}

// An answer that arrived but cannot be used (not JSON, or not in the required structure) is
// worth asking for once more. A failure of the service or the credential is not.
function isContentProblem(error) {
  return error instanceof SyntaxError || (error instanceof Error && error.constructor === Error && error.code === undefined);
}

// What the catalogue may add to a star charted from memory: a poster, an identifier, a running time.
function cleanFacts(raw) {
  if (!isRecord(raw)) return null;
  const facts = {};
  if (typeof raw.poster === 'string' && /^https:\/\/image\.tmdb\.org\/t\/p\/w\d{3}\/[A-Za-z0-9._-]+\.(?:jpg|jpeg|png|webp)$/i.test(raw.poster)) facts.poster = raw.poster;
  if (typeof raw.imdb === 'string' && /^tt\d{5,12}$/.test(raw.imdb)) facts.imdb = raw.imdb;
  if (Number.isInteger(raw.runtime) && raw.runtime > 0 && raw.runtime < 1000) facts.runtime = raw.runtime;
  return Object.keys(facts).length ? facts : null;
}

// What the Navigator said on arrival, as it is kept and sent: nothing kept is trusted more than something just written.
function cleanArrival(raw) {
  if (!isRecord(raw)) return null;
  const rays = [];
  for (const ray of Array.isArray(raw.rays) ? raw.rays.slice(0, 12) : []) {
    if (!isRecord(ray) || !LIGHT_IDS.includes(ray.light) || typeof ray.slug !== 'string' || !SLUG.test(ray.slug)) continue;
    const claim = line(ray.claim, 500);
    if (claim && !rays.some(kept => kept.light === ray.light)) rays.push({ light: ray.light, slug: ray.slug, claim, watch: line(ray.watch, 300) });
  }
  let beyond = null;
  if (isRecord(raw.beyond)) {
    const title = line(raw.beyond.title, 160);
    const why = line(raw.beyond.why, 400);
    if (title && why && Number.isInteger(raw.beyond.year) && raw.beyond.year >= 1888 && raw.beyond.year <= 2100) beyond = { title, year: raw.beyond.year, why };
  }
  const essence = line(raw.essence, 400);
  return essence || rays.length ? { essence, beyond, rays } : null;
}

// ── Keeping things. A ledger is a file of lines, one record a line. While the companion runs
// it is only ever added to; it is read back, folded and rewritten once, at start.
async function readLedger(file) {
  let text;
  try { text = await readFile(file, 'utf8'); } catch { return { records: [], lines: 0 }; }
  const records = [];
  let lines = 0;
  for (const entry of text.split('\n')) {
    if (!entry.trim()) continue;
    lines += 1;
    try {
      const record = JSON.parse(entry);
      if (isRecord(record)) records.push(record);
    } catch { /* a line cut short by a stop: what came before it stands */ }
  }
  return { records, lines };
}

async function rewriteLedger(file, records) {
  const part = `${file}.${randomUUID()}.part`;
  await writeFile(part, records.map(record => `${JSON.stringify(record)}\n`).join(''), { mode: 0o600 });
  await rename(part, file);
}

function openLedger(file, log) {
  let chain = Promise.resolve();
  return {
    add(record) {
      if (!file) return;
      chain = chain.then(() => appendFile(file, `${JSON.stringify(record)}\n`, { mode: 0o600 })).catch(() => { log({ code: 'ODYSSEY_STORE_FAILED' }); });
    },
    settled: () => chain,
  };
}

// Lets a few tasks run at once and makes the rest wait their turn.
function gate(limit) {
  let running = 0;
  const waiting = [];
  const next = () => {
    while (running < limit && waiting.length) {
      const { task, resolve, reject } = waiting.shift();
      running += 1;
      Promise.resolve().then(task).then(resolve, reject).finally(() => { running -= 1; next(); });
    }
  };
  return task => new Promise((resolve, reject) => { waiting.push({ task, resolve, reject }); next(); });
}

function within(promise, ms) {
  let timer;
  const limit = new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('Too slow.')), ms); timer.unref?.(); });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

/**
 * @param {object} options
 * @param {{ complete(request): Promise<string>, effort?: string }} options.runner  how Claude is reached
 * @param {string} [options.dataDirectory]   where universe.json and depth.json are
 * @param {string} [options.storeDirectory]  where the commons and the arrivals are kept; without it they last until a restart
 * @param {(film: { title: string, year: number }) => Promise<object|null>} [options.verify]
 *   asks a catalogue about one film: resolves { poster, imdb, runtime } when it holds the film,
 *   null when it does not, and rejects when it could not be asked (it is asked again another time)
 * @param {number} [options.maxActive]   answers being written at once
 * @param {number} [options.maxWaiting]  requests that may wait for a turn
 * @param {number} [options.maxCommons]  stars the commons holds; the oldest leave first
 */
export async function createOdyssey({
  runner,
  dataDirectory = ODYSSEY_DATA_DIRECTORY,
  storeDirectory = '',
  verify = null,
  maxActive = 2,
  maxWaiting = 12,
  maxCommons = 8000,
  maxArrivals = 6000,
  deadlines = DEADLINES,
  lookupWaitMs = LOOKUP_WAIT_MS,
  now = Date.now,
  log = () => {},
} = {}) {
  if (!runner || typeof runner.complete !== 'function') throw new Error('The Odyssey needs a way to reach Claude.');
  const bundle = JSON.parse(await readFile(join(dataDirectory, 'universe.json'), 'utf8'));
  let depth = null;
  try {
    const parsed = JSON.parse(await readFile(join(dataDirectory, 'depth.json'), 'utf8'));
    if (parsed && Array.isArray(parsed.films)) depth = parsed.films;
  } catch { /* the cards are plainer without it, and still true */ }
  const universe = openUniverse(bundle);
  const search = createSearch(universe);
  const vocabulary = buildVocabulary(universe.bundle.traits);
  const films = universe.films;
  const formats = Object.fromEntries(ODYSSEY_OPERATIONS.map(op => [op, toStructuredSchema(strictSchema(op))]));

  const navigator = createNavigator({
    universe, depth, vocabulary,
    ask: async ({ op, system, user, effort, onText, signal }) => {
      for (let attempt = 1; ; attempt += 1) {
        try {
          const text = await runner.complete({
            kind: `odyssey-${op}`,
            system: `${system}\n\n${STRICT_NOTE}`,
            content: user,
            format: formats[op],
            signal,
            ...(onText ? { onPartial: onText } : {}),
            effort: cappedEffort(runner.effort, effort || EFFORT[op] || 'low'),
          });
          return extractJson(text, MAX_ANSWER_CHARACTERS);
        } catch (error) {
          if (attempt >= 2 || signal?.aborted || !isContentProblem(error)) throw error;
          log({ code: 'ODYSSEY_ANSWER_REJECTED', op });
        }
      }
    },
  });

  const starOf = name => universe.indexOfSlug(name);
  const slugAt = star => films[star].s;

  // ── The commons: stars charted from memory, by anyone.
  const commons = [];      // in the order found: { n, slug, reading, from, source, facts, checked, tries, looking }
  const held = new Map();  // slug → its star in the commons
  let sequence = 0;
  const arrivals = new Map(); // slug → { essence, beyond, rays: [{ light, slug, claim, watch }] }
  const files = storeDirectory
    ? { commons: join(storeDirectory, 'odyssey-commons.jsonl'), arrivals: join(storeDirectory, 'odyssey-arrivals.jsonl') }
    : { commons: '', arrivals: '' };

  function hold(reading, from, source) {
    const item = { n: (sequence += 1), slug: readingSlug(reading), reading, from, source, facts: null, checked: false, tries: 0, looking: null };
    commons.push(item);
    held.set(item.slug, item);
    return item;
  }
  const starRecord = item => ({ star: { reading: item.reading, from: item.from, source: item.source, ...(item.facts ? { facts: item.facts } : {}), ...(item.checked ? { checked: true } : {}) } });

  // Stored stars and arrivals come back through the same checks as ones just written.
  if (storeDirectory) {
    await mkdir(storeDirectory, { recursive: true, mode: 0o700 });
    const kept = await readLedger(files.commons);
    const stars = new Map(); // slug → what the ledger says of it, in the order first written
    for (const record of kept.records) {
      if (isRecord(record.star)) {
        const reading = reviveReading(record.star.reading, vocabulary);
        if (!reading || stars.has(readingSlug(reading))) continue;
        stars.set(readingSlug(reading), {
          reading: plain(reading),
          from: typeof record.star.from === 'string' && SLUG.test(record.star.from) ? record.star.from : '',
          source: SOURCES.includes(record.star.source) ? record.star.source : 'deepfield',
          facts: cleanFacts(record.star.facts),
          checked: record.star.checked === true,
        });
      } else if (isRecord(record.facts) && typeof record.facts.slug === 'string') {
        const star = stars.get(record.facts.slug);
        if (star) { star.facts = cleanFacts(record.facts.facts); star.checked = true; }
      }
    }
    const newest = [...stars.values()].slice(-maxCommons);
    for (const { entry } of restoreStars({ universe, search, vocabulary, entries: newest })) {
      const item = hold(entry.reading, entry.from, entry.source);
      item.facts = entry.facts;
      item.checked = entry.checked;
    }
    if (kept.lines !== commons.length) await rewriteLedger(files.commons, commons.map(starRecord));

    const told = await readLedger(files.arrivals);
    for (const record of told.records) {
      const arrival = typeof record.slug === 'string' && SLUG.test(record.slug) ? cleanArrival(record) : null;
      if (!arrival) continue;
      arrivals.delete(record.slug);
      arrivals.set(record.slug, arrival);
    }
    while (arrivals.size > maxArrivals) arrivals.delete(arrivals.keys().next().value);
    if (told.lines !== arrivals.size) await rewriteLedger(files.arrivals, [...arrivals].map(([name, arrival]) => ({ slug: name, ...arrival })));
  }
  const ledgers = { commons: openLedger(files.commons, log), arrivals: openLedger(files.arrivals, log) };

  /**
   * Gives readings their stars in this sky and keeps the new ones.
   * @returns {Array<{ star: number, reading: object, item: object|null }>} in the readings' order;
   *   item is the star's place in the commons when it is a star from beyond the chart
   */
  function adopt(readings, { from, source }) {
    const settled = settleReadings({ universe, search, vocabulary, readings, from, source });
    let grew = false;
    for (const entry of settled) {
      if (!entry.isNew) continue;
      const item = hold(plain(entry.reading), Number.isInteger(from) ? slugAt(from) : '', source);
      ledgers.commons.add(starRecord(item));
      grew = true;
    }
    // The oldest stars leave the commons first. They stay in this sky until a restart.
    if (grew) while (commons.length > maxCommons) held.delete(commons.shift().slug);
    return settled.map(entry => ({ star: entry.star, reading: entry.reading, item: held.get(slugAt(entry.star)) || null }));
  }

  // ── The catalogue: a poster and a few facts for a star charted from memory.
  const turn = gate(LOOKUPS_AT_ONCE);
  const looking = new Set();
  /** Asks the catalogue about one star of the commons. Never rejects. */
  function lookUp(item) {
    if (!verify || !item || item.checked || item.tries >= LOOKUP_TRIES) return Promise.resolve();
    if (item.looking) return item.looking;
    item.tries += 1;
    const lookup = turn(() => within(Promise.resolve().then(() => verify({ title: item.reading.title, year: item.reading.year })), LOOKUP_TIMEOUT_MS))
      .then(answer => {
        item.checked = true;
        item.facts = cleanFacts(answer);
        if (item.facts) item.n = (sequence += 1); // so a browser that already has the star hears of its poster
        ledgers.commons.add({ facts: { slug: item.slug, facts: item.facts } });
      }, () => { log({ code: 'ODYSSEY_CATALOGUE_UNAVAILABLE' }); })
      .finally(() => { item.looking = null; looking.delete(lookup); });
    item.looking = lookup;
    looking.add(lookup);
    return lookup;
  }
  /** Waits a little for lookups, so an answer can carry its posters. A star's poster that comes later is kept all the same. */
  async function posters(lookups) {
    const pending = lookups.filter(Boolean);
    if (!verify || !pending.length) return;
    let timer;
    await Promise.race([Promise.all(pending), new Promise(resolve => { timer = setTimeout(resolve, lookupWaitMs); timer.unref?.(); })]);
    clearTimeout(timer);
  }

  // ── What a browser is sent. A film is always named by its slug here, with its reading beside it.
  const handed = item => ({ reading: { ...item.reading, slug: item.slug }, from: item.from, source: item.source, ...(item.facts ? { facts: item.facts } : {}) });
  const outward = (entry, extras = {}) => ({ ...(entry.item ? entry.item.reading : plain(entry.reading)), slug: slugAt(entry.star), ...extras });
  const factsOf = entries => Object.fromEntries(entries.filter(entry => entry.item && entry.item.facts).map(entry => [entry.item.slug, entry.item.facts]));

  /** An arrival with the films it points to named by slug, and any of them that are beyond the chart handed over whole. */
  function shapeArrival(value) {
    const rays = [];
    const deep = [];
    for (const ray of value.rays || []) {
      const name = typeof ray.slug === 'string' ? ray.slug : (Number.isInteger(ray.star) && ray.star >= 0 && ray.star < universe.count ? slugAt(ray.star) : '');
      const star = name ? starOf(name) : -1;
      if (star < 0) continue;
      if (universe.isDeep(star)) {
        const item = held.get(name);
        if (!item) continue; // a star that left the commons cannot be handed to a browser
        if (!deep.includes(item)) deep.push(item);
      }
      rays.push({ light: ray.light, slug: name, claim: ray.claim, watch: ray.watch || '' });
    }
    return {
      shaped: {
        essence: value.essence || '', beyond: value.beyond || null, rays,
        deep: deep.map(handed),
        facts: Object.fromEntries(deep.filter(item => item.facts).map(item => [item.slug, item.facts])),
      },
      deep,
    };
  }

  // Readings arrive a few at a time while an answer is written: each is given its star once.
  function gather({ from, source }) {
    const taken = new Map(); // "title|year" → its entry
    const lookups = [];
    return {
      lookups,
      take(readings) {
        return readings.map(reading => {
          const key = `${reading.title.toLowerCase()}|${reading.year}`;
          if (!taken.has(key)) {
            const [entry] = adopt([reading], { from, source });
            taken.set(key, entry);
            lookups.push(lookUp(entry.item));
          }
          return taken.get(key);
        });
      },
    };
  }

  const OPERATIONS = {
    async arrival({ star, fresh }, { signal, draft }) {
      const raw = await navigator.arrival(star, { signal, fresh, onDraft: value => draft(shapeArrival(value).shaped) });
      const first = shapeArrival(raw);
      const name = slugAt(star);
      const kept = { essence: first.shaped.essence, beyond: first.shaped.beyond, rays: first.shaped.rays };
      arrivals.delete(name);
      arrivals.set(name, kept);
      while (arrivals.size > maxArrivals) arrivals.delete(arrivals.keys().next().value);
      ledgers.arrivals.add({ slug: name, ...kept });
      await posters(first.deep.map(lookUp));
      return shapeArrival(raw).shaped;
    },

    async deepfield({ star, count, already }, { signal, draft }) {
      const found = gather({ from: star, source: 'deepfield' });
      const seen = [];
      const shape = () => ({
        stars: seen.map(({ entry, light, claim }) => outward(entry, { light, claim })),
        facts: factsOf(seen.map(({ entry }) => entry)),
      });
      await navigator.deepField(star, {
        count, signal,
        already: already.map(index => `${films[index].t} (${films[index].y})`),
        onStar: reading => {
          const [entry] = found.take([reading]);
          seen.push({ entry, light: reading.light, claim: reading.claim });
          draft(shape());
        },
      });
      await posters(found.lookups);
      return shape();
    },

    async chart({ query, year, director }, { signal }) {
      const result = await navigator.chart({ query, year, director }, { signal });
      if (!result.star) return { star: null, note: result.note, facts: {} };
      const [entry] = adopt([result.star], { source: 'chart' });
      await posters([lookUp(entry.item)]);
      return { star: outward(entry), note: '', facts: factsOf([entry]) };
    },

    async course({ request, loved, seen, count }, { signal, draft }) {
      const found = gather({ source: 'course' });
      const shape = raw => {
        const entries = found.take(raw.waypoints);
        return {
          name: raw.name, heading: raw.heading,
          waypoints: raw.waypoints.map((reading, index) => outward(entries[index], { why: reading.why || '', leg: reading.leg || '' })),
          facts: factsOf(entries),
        };
      };
      const raw = await navigator.course({ request, loved, seen, count }, { signal, onDraft: value => draft(shape(value)) });
      shape(raw);
      await posters(found.lookups);
      return shape(raw);
    },

    async collision({ a, b }, { signal }) {
      const raw = await navigator.collide(a, b, { signal });
      const [entry] = adopt([raw.star], { from: a, source: 'collision' });
      await posters([lookUp(entry.item)]);
      return { star: outward(entry), fromA: raw.fromA, fromB: raw.fromB, spark: raw.spark, facts: factsOf([entry]) };
    },

    async sky({ loved }, { signal, draft }) {
      const raw = await navigator.sky(loved, { signal, onDraft: value => draft({ name: value.name, reading: value.reading, blind: value.blind, next: [], facts: {} }) });
      const entries = adopt(raw.next, { source: 'sky' });
      await posters(entries.map(entry => lookUp(entry.item)));
      return {
        name: raw.name, reading: raw.reading, blind: raw.blind,
        next: raw.next.map((reading, index) => outward(entries[index], { why: reading.why || '' })),
        facts: factsOf(entries),
      };
    },
  };

  /** Turns slugs into stars of this sky. A slug this companion has never seen is the browser's to explain. */
  function resolve({ op, input }) {
    const find = name => {
      const star = starOf(name);
      if (star < 0) throw Object.assign(new Error('The companion does not know that star.'), { code: 'UNKNOWN_STAR', slug: name });
      return star;
    };
    const known = names => names.map(starOf).filter(star => star >= 0);
    if (op === 'arrival') return { star: find(input.star), fresh: input.fresh };
    if (op === 'deepfield') return { star: find(input.star), count: input.count, already: known(input.already) };
    if (op === 'collision') return { a: find(input.a), b: find(input.b) };
    if (op === 'course') return { request: input.request, count: input.count, loved: input.loved.map(find), seen: known(input.seen) };
    if (op === 'sky') return { loved: input.loved.map(find) };
    return input;
  }

  // ── Jobs. An answer takes from a few seconds to a minute or two; a browser asks, then looks in.
  const jobs = new Map();
  const flights = new Map(); // "arrival:slug" → the job already reading that star
  const waiting = [];
  let active = 0;
  const idle = [];

  function explain(error, timedOut) {
    if (timedOut) return { code: 'CLAUDE_TIMEOUT', error: FAILURES.CLAUDE_TIMEOUT };
    if (error instanceof NavigatorError) return { code: error.code, error: error.message };
    if (error && Object.hasOwn(FAILURES, error.code)) return { code: error.code, error: FAILURES[error.code] };
    return { code: 'FAILED', error: 'The Navigator\'s answer did not come through. Try again.' };
  }

  async function run(job, plan) {
    const controller = new AbortController();
    let timer;
    // The deadline ends the job even if the call behind it is slow to let go.
    const deadline = new Promise((resolveNever, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(TIMED_OUT); }, deadlines[job.op] ?? DEADLINES[job.op]);
    });
    try {
      job.result = await Promise.race([
        OPERATIONS[job.op](plan, {
          signal: controller.signal,
          draft: value => { if (job.status === 'working') { job.draft = value; job.draftVersion += 1; } },
        }),
        deadline,
      ]);
      job.status = 'done';
    } catch (error) {
      const failure = explain(error, error === TIMED_OUT || controller.signal.aborted);
      job.status = 'failed';
      job.code = failure.code;
      job.error = failure.error;
      log({ code: 'ODYSSEY_FAILED', op: job.op, failure: failure.code });
    } finally {
      clearTimeout(timer);
      job.draft = null;
      job.at = now();
      if (job.flight && flights.get(job.flight) === job) flights.delete(job.flight);
    }
  }

  function pump() {
    while (active < maxActive && waiting.length) {
      const { job, plan } = waiting.shift();
      active += 1;
      run(job, plan).finally(() => {
        active -= 1;
        pump();
        if (!active && !waiting.length) idle.splice(0).forEach(resolveIdle => resolveIdle());
      });
    }
  }

  function sweep() {
    const cutoff = now() - JOB_TTL_MS;
    for (const [id, job] of jobs) if (job.status !== 'working' && job.at < cutoff) jobs.delete(id);
  }

  return {
    /** What this Odyssey holds. */
    status: () => ({ films: universe.base, beyond: commons.length }),

    /**
     * Starts one operation. Answers { result } at once when the answer is already known,
     * otherwise { jobId }. Throws BAD_REQUEST, UNKNOWN_STAR or CLAUDE_UNAVAILABLE.
     */
    start(body) {
      const request = validateOdysseyRequest(body);
      const plan = resolve(request);
      let flight = '';
      if (request.op === 'arrival' && !plan.fresh) {
        const kept = arrivals.get(request.input.star);
        if (kept) {
          const { shaped, deep } = shapeArrival(kept);
          if (shaped.essence || shaped.rays.length) {
            deep.forEach(lookUp); // a poster the catalogue could not be asked for the first time
            return { result: shaped };
          }
        }
        flight = `arrival:${request.input.star}`;
        const flying = flights.get(flight);
        if (flying) return { jobId: flying.id }; // two asks for one star are one reading
      }
      sweep();
      if (active >= maxActive && waiting.length >= maxWaiting) throw engineError('CLAUDE_UNAVAILABLE', 'The Navigator is busy.');
      const job = { id: randomUUID(), op: request.op, status: 'working', draft: null, draftVersion: 0, result: null, code: null, error: null, at: now(), flight };
      jobs.set(job.id, job);
      if (flight) flights.set(flight, job);
      waiting.push({ job, plan });
      pump();
      return { jobId: job.id };
    },

    /** A job as a browser sees it, or null. */
    job(id) {
      const job = typeof id === 'string' && ODYSSEY_JOB_ID.test(id) ? jobs.get(id) : null;
      if (!job) return null;
      return {
        status: job.status,
        ...(job.status === 'working' && job.draft ? { draft: job.draft, draftVersion: job.draftVersion } : {}),
        ...(job.status === 'done' ? { result: job.result } : {}),
        ...(job.status === 'failed' ? { code: job.code, error: job.error } : {}),
      };
    },

    /**
     * Stars charted from memory, each with its reading: the newest ones, or with `since`
     * (the `next` of an earlier answer) only what was found or learned after it.
     */
    commons({ since = 0, limit = COMMONS_PAGE } = {}) {
      const mark = Number.isFinite(since) && since > 0 ? since : 0;
      const size = Number.isInteger(limit) && limit > 0 ? Math.min(limit, COMMONS_PAGE_MAX) : COMMONS_PAGE;
      const stars = commons.filter(item => item.n > mark).sort((a, b) => a.n - b.n).slice(-size).map(handed);
      return { stars, next: sequence, total: commons.length };
    },

    /** Resolves when nothing is being asked and everything is written down. */
    async whenIdle() {
      if (active || waiting.length) await new Promise(resolveIdle => idle.push(resolveIdle));
      while (looking.size) await Promise.all([...looking]);
      await Promise.all([ledgers.commons.settled(), ledgers.arrivals.settled()]);
    },
  };
}
