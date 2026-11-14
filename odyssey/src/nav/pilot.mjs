// The pilot stands between the interface and the Navigator. It finds out how
// Claude can be reached (inside the page, through the companion, or not at
// all), gives every reading its place in the universe, remembers what was
// found, and turns failures into something a voyager can read.
//
// Nothing here pretends. With no Navigator connected the chart still works,
// and every call says plainly that Claude is not there.
import { createNavigator, settleReadings, restoreStars, NavigatorError } from '../../brain/navigator.mjs';
import { buildVocabulary } from '../../brain/vocabulary.mjs';
import { plainReading, readingSlug, reviveReading } from '../../brain/reading.mjs';
import { readPartial } from '../../brain/partial.mjs';
import { LIGHT_IDS } from '../engine/lights.mjs';

export const NAVIGATOR_MODEL = 'claude-opus-5-5';
const HOUR = 3600 * 1000;
const UNAVAILABLE = new Set(['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed']);
const SOURCES = ['deepfield', 'chart', 'course', 'collision', 'sky'];
const POSTER = /^https:\/\/image\.tmdb\.org\/t\/p\/w\d{3}\/[A-Za-z0-9._-]+\.(?:jpg|jpeg|png|webp)$/i;
// How often the browser looks in on an answer the companion is still writing, in milliseconds.
const PACE = { first: 500, step: 150, most: 1400 };

const COPY = {
  offline: 'The Navigator is not connected, so this part of the voyage is closed. The chart itself still works.',
  unavailable: 'Claude is not available in this view, so the Navigator is silent. The chart itself still works.',
  declined: 'You chose not to let this page ask Claude, so the Navigator is silent. Reload the page if you change your mind. The chart itself still works.',
  busy: 'Claude is busy, or a usage limit has been reached. Try again in a little while.',
  timeout: 'The Navigator took too long to answer. Try again.',
  session_expired: 'Your Claude session has ended. Reload the page to continue with the Navigator.',
  refused: 'Claude declined to answer that.',
  passphrase: 'The companion needs its passphrase before the Navigator can answer.',
  throttled: 'Too many wrong passphrases were tried. Wait a few minutes, then try again.',
  origin: 'The companion does not list this page\'s address among the sites it answers.',
  unreachable: 'The companion cannot be reached right now.',
  not_connected: 'The companion is running, but Claude is not connected to it.',
  no_odyssey: 'That companion does not carry the Odyssey\'s chart, so it has no Navigator to offer.',
  chart_mismatch: 'The companion holds a different edition of the chart than this page, so it does not know this star.',
  lost_star: 'This star was charted somewhere the companion has not been, and its Navigator could not chart it again. It cannot be read from here.',
  empty_reading: 'The Navigator had nothing sure to say there.',
  failed: 'The Navigator\'s answer did not come through. Try again.',
};

// How a failed job on the companion reads here.
const JOB_FAILURES = {
  CLAUDE_UNAVAILABLE: 'busy', CLAUDE_USAGE_LIMIT: 'busy', CLAUDE_TIMEOUT: 'timeout', CLAUDE_INCOMPLETE: 'timeout', CLAUDE_DECLINED: 'refused',
  AUTH_REQUIRED: 'not_connected', CLAUDE_CODE_MISSING: 'not_connected', CLAUDE_PLAN_UNAVAILABLE: 'not_connected', CLAUDE_MODEL_UNAVAILABLE: 'not_connected',
  bad_input: 'bad_input', unlit: 'unlit', empty_reading: 'empty_reading',
};
// For these the companion's own sentence is the most exact: it knows which of its settings is in the way.
const COMPANION_SAYS = new Set(['CLAUDE_USAGE_LIMIT', 'CLAUDE_CODE_MISSING', 'CLAUDE_PLAN_UNAVAILABLE', 'CLAUDE_MODEL_UNAVAILABLE', 'bad_input', 'unlit']);

/** What to tell the voyager about a failure. Empty for a call they stopped themselves. */
export function explain(error) {
  if (!error || error.code === 'cancelled' || error.name === 'AbortError') return '';
  if (error.code === 'bad_input' || error.code === 'unlit' || error.told) return error.message;
  return COPY[error.code] || COPY.failed;
}

const fail = (code, message) => new NavigatorError(code, message || COPY[code] || COPY.failed);
const text = (value, max) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/**
 * What a catalogue found for a star charted from memory, as fields of a film record:
 * pu (poster), im (IMDb identifier), rt (minutes). Takes the companion's names or these.
 */
function filmFacts(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const poster = typeof raw.poster === 'string' ? raw.poster : raw.pu;
  const imdb = typeof raw.imdb === 'string' ? raw.imdb : raw.im;
  const runtime = Number.isInteger(raw.runtime) ? raw.runtime : raw.rt;
  const fields = {};
  if (typeof poster === 'string' && POSTER.test(poster)) fields.pu = poster;
  if (typeof imdb === 'string' && /^tt\d{5,12}$/.test(imdb)) fields.im = imdb;
  if (Number.isInteger(runtime) && runtime > 0 && runtime < 1000) fields.rt = runtime;
  return Object.keys(fields).length ? fields : null;
}

// ── Claude inside the page (the claude.ai edition).
function inPageAsk(sample, onUnavailable) {
  return async function ask({ op, system, user, onText, signal, fresh = false }) {
    // What is true of a film does not change by the hour: an arrival, a charted film and a
    // collision are kept for the day, and asked again only when the voyager says so. A course
    // is plotted anew every time it is asked for. The rest is kept for a few minutes.
    const lasting = op === 'arrival' || op === 'chart' || op === 'collision';
    const cache = op === 'course' ? false : lasting ? { gcTime: 12 * HOUR, ...(fresh ? { refresh: true } : {}) } : true;
    try {
      // The model is the one the owner named; if this viewer cannot use it, the most capable tier answers.
      return await sample.json(`${system}\n\n${user}`, {
        model: NAVIGATOR_MODEL,
        modelTier: 'complex',
        signal,
        cache,
        ...(onText ? { onText: ({ text: written }) => onText(written) } : {}),
      });
    } catch (error) {
      const code = error && error.code;
      if (code === 'cancelled') throw fail('cancelled', 'Stopped.');
      if (code === 'invalid_json' && typeof error.text === 'string') {
        // A reply cut short still holds whatever was finished before the cut.
        const kept = readPartial(error.text);
        if (kept !== undefined) return kept;
      }
      if (UNAVAILABLE.has(code)) { onUnavailable(code); throw fail(code === 'not_granted' ? 'declined' : 'unavailable'); }
      if (code === 'rate_limited') throw fail('busy');
      if (code === 'session_expired') throw fail('session_expired');
      if (code === 'refused') throw fail('refused');
      throw fail('failed');
    }
  };
}

// ── Claude through the companion. The browser sends an operation and names
// films by slug; the companion builds the prompt itself.
function createRemote({ url, passphrase }, pace = PACE) {
  const base = String(url || '').replace(/\/+$/, '');
  const headers = body => ({ ...(body ? { 'Content-Type': 'application/json' } : {}), ...(passphrase ? { Authorization: `Bearer ${passphrase}` } : {}) });

  async function request(path, init = {}) {
    let response;
    try {
      response = await fetch(`${base}${path}`, { ...init, headers: headers(init.body), referrerPolicy: 'no-referrer' });
    } catch (error) {
      if (error && error.name === 'AbortError') throw fail('cancelled', 'Stopped.');
      throw fail('unreachable');
    }
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    if (response.ok) return body && typeof body === 'object' ? body : {};
    const code = body && body.code;
    if (code === 'PASSPHRASE_THROTTLED') throw fail('throttled');
    if (response.status === 401 || code === 'PASSPHRASE_REQUIRED') throw fail('passphrase');
    if (code === 'ORIGIN_NOT_ALLOWED') throw fail('origin');
    if (response.status === 429) throw fail('busy');
    if (code === 'CLAUDE_NOT_CONNECTED') throw fail('not_connected');
    if (code === 'CLAUDE_UNAVAILABLE') throw fail('busy');
    if (code === 'ODYSSEY_NOT_CONFIGURED' || code === 'SITE_API_DISABLED') throw fail('no_odyssey');
    if (code === 'UNKNOWN_STAR') throw Object.assign(fail('unknown_star', COPY.failed), { slug: text(body.slug, 200) });
    if (response.status === 400) throw fail('bad_input', text(body && body.error, 240) || 'The companion did not accept that request.');
    if (response.status === 404) throw fail('not_found', COPY.failed);
    throw fail('failed');
  }

  const wait = (ms, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(fail('cancelled', 'Stopped.')); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(fail('cancelled', 'Stopped.')); }, { once: true });
  });

  /** Starts one operation and follows it to its end, handing drafts on as they develop. */
  async function run(op, input, { onDraft, signal } = {}) {
    const started = await request('/api/odyssey/jobs', { method: 'POST', body: JSON.stringify({ op, input }), signal });
    if (started.result) return started.result; // answered from the companion's own memory
    if (typeof started.jobId !== 'string') throw fail('failed');
    let pause = pace.first;
    let seen = 0;
    let misses = 0;
    for (;;) {
      await wait(pause, signal);
      pause = Math.min(pace.most, pause + pace.step);
      let job;
      try {
        job = await request(`/api/odyssey/jobs/${encodeURIComponent(started.jobId)}`, { signal });
        misses = 0;
      } catch (error) {
        // One dropped look is not a lost answer: the companion is still writing it.
        if (error.code !== 'unreachable' || (misses += 1) > 3) throw error;
        continue;
      }
      if (job.draft && job.draftVersion !== seen) { seen = job.draftVersion; onDraft?.(job.draft); }
      if (job.status === 'done') return job.result && typeof job.result === 'object' ? job.result : {};
      if (job.status === 'failed') {
        const told = COMPANION_SAYS.has(job.code) ? text(job.error, 240) : '';
        throw Object.assign(fail(JOB_FAILURES[job.code] || 'failed', told), told ? { told: true } : {});
      }
    }
  }

  return {
    run,
    status: async () => {
      try { return await request('/api/odyssey/status'); } catch (error) { throw error.code === 'not_found' ? fail('no_odyssey') : error; }
    },
    commons: () => request('/api/odyssey/commons'),
  };
}

/**
 * @param {object} input
 * @param {object} input.universe
 * @param {object[]|null} input.depth
 * @param {object} input.search
 * @param {object} input.store        the voyager's store
 * @param {(status: object) => void} [input.onStatus]
 * @param {(films: object[]) => void} [input.onFacts]  stars already here have just been given a poster or other facts
 * @param {{ first: number, step: number, most: number }} [input.pace]  how often to look in on the companion
 * @param {{ get(slug: string): Promise<object|null>, about: object|null }} [input.readings]  readings written ahead of time
 */
export function createPilot({ universe, depth, search, store, edition = 'site', onStatus = () => {}, onFacts = () => {}, pace = PACE, readings = null }) {
  // Inside claude.ai a page asks Claude itself and can reach nothing else, so there is no companion to connect.
  const canConnect = edition !== 'claude';
  const vocabulary = buildVocabulary(universe.bundle.traits);
  let status = { mode: 'connecting', connected: false, label: 'Finding the Navigator', detail: '' };
  let local = null;   // a Navigator that asks Claude from this page
  let remote = null;  // the companion
  const running = new Map(); // kind → AbortController
  const facts = new Map();   // slug → { pu, im, rt }: what a catalogue found for a star charted from memory

  const setStatus = next => { status = next; onStatus(status); };
  const offline = detail => setStatus(canConnect
    ? { mode: 'offline', connected: false, label: 'Navigator not connected', detail: detail || COPY.offline }
    : { mode: 'offline', connected: false, label: 'Navigator not available', detail: detail || COPY.unavailable });

  function begin(kind) {
    running.get(kind)?.abort();
    const controller = new AbortController();
    running.set(kind, controller);
    return controller;
  }
  const finish = (kind, controller) => { if (running.get(kind) === controller) running.delete(kind); };
  const need = () => { if (!local && !remote) throw fail(canConnect ? 'offline' : 'unavailable'); };
  // Charted a second time, a film can come back under another year or spelling. Where the companion
  // names one of this browser's stars differently, the two names are kept side by side for the visit.
  const theirs = new Map(); // this browser's slug → the companion's
  const ours = new Map();   // the companion's slug → this browser's
  const slugOf = star => universe.films[star].s;
  const sent = star => theirs.get(slugOf(star)) || slugOf(star);
  const starOf = slug => universe.indexOfSlug(ours.get(slug) || slug);

  // ── Stars found beyond the chart.
  /** Gives readings their stars, and remembers the new ones for next time. */
  function settle(readings, { from, source }) {
    const settled = settleReadings({ universe, search, vocabulary, readings, from, source, extra: reading => facts.get(readingSlug(reading)) || {} });
    for (const entry of settled) {
      if (!entry.isNew) continue;
      const slug = slugOf(entry.star);
      store.remember({ slug, reading: plainReading(entry.reading), from: Number.isInteger(from) ? slugOf(from) : '', source, ...(facts.has(slug) ? { extra: facts.get(slug) } : {}) });
    }
    return settled;
  }

  /** What a catalogue found, by slug: kept, written onto stars this page already has, and remembered. */
  function learn(bySlug) {
    if (!bySlug || typeof bySlug !== 'object') return;
    const changed = [];
    for (const [name, raw] of Object.entries(bySlug)) {
      const fields = filmFacts(raw);
      if (!fields) continue;
      const slug = ours.get(name) || name;
      facts.set(slug, fields);
      if (write(slug, fields)) changed.push(universe.films[starOf(slug)]);
      store.noteFacts(slug, fields);
    }
    if (changed.length) onFacts(changed);
  }
  /** Writes what a catalogue found onto a star from beyond the chart that is already here. True when it changed anything. */
  function write(slug, fields) {
    const star = starOf(slug);
    if (star < universe.base) return false; // not here yet, or a film of the chart, which keeps its own
    const film = universe.films[star];
    if (Object.entries(fields).every(([key, value]) => film[key] === value)) return false;
    Object.assign(film, fields);
    return true;
  }

  /** A film as the companion names it: a slug, with its reading beside it. Its star here, or null. */
  function place(raw, origin) {
    if (!raw || typeof raw !== 'object') return null;
    const known = typeof raw.slug === 'string' ? starOf(raw.slug) : -1;
    if (known >= 0) return { star: known, isNew: false };
    const reading = reviveReading(raw, vocabulary);
    if (!reading) return null;
    const [entry] = settle([reading], origin);
    return { star: entry.star, isNew: entry.isNew };
  }

  /** Stars kept elsewhere (the companion's commons) take their places here in one step. */
  function takeCommons(entries) {
    const list = [];
    const changed = [];
    for (const entry of Array.isArray(entries) ? entries : []) {
      const reading = entry && typeof entry === 'object' ? reviveReading(entry.reading, vocabulary) : null;
      if (!reading) continue;
      const named = readingSlug(reading);
      const slug = ours.get(named) || named;
      const fields = filmFacts(entry.facts);
      if (fields) {
        facts.set(slug, fields);
        // A star this browser found on its own before the catalogue had answered for it.
        if (write(slug, fields)) { changed.push(universe.films[starOf(slug)]); store.noteFacts(slug, fields); }
      }
      if (slug !== named) continue; // already a star here, under the name this browser gave it
      list.push({ reading, from: typeof entry.from === 'string' ? entry.from : '', source: SOURCES.includes(entry.source) ? entry.source : 'deepfield', extra: fields || {} });
    }
    const added = restoreStars({ universe, search, vocabulary, entries: list }).length;
    if (changed.length) onFacts(changed);
    return added;
  }

  /** Puts back the stars found on earlier visits. */
  function restore() {
    const list = [];
    for (const entry of store.state.found) {
      const reading = reviveReading(entry.reading, vocabulary);
      if (!reading) continue;
      const fields = filmFacts(entry.extra);
      if (fields) facts.set(readingSlug(reading), fields);
      list.push({ reading, from: typeof entry.from === 'string' ? entry.from : '', source: SOURCES.includes(entry.source) ? entry.source : 'deepfield', extra: fields || {} });
    }
    return restoreStars({ universe, search, vocabulary, entries: list }).length;
  }

  /** Stars other voyagers found, kept by the companion. */
  async function loadCommons() {
    if (!remote) return 0;
    try {
      const { stars } = await remote.commons();
      return takeCommons(stars);
    } catch { return 0; }
  }

  // ── Finding the Navigator.
  async function findInPage() {
    const claude = typeof window !== 'undefined' ? window.claude : null;
    if (!claude || typeof claude.use !== 'function') return false;
    let sample = null;
    try { sample = await claude.use('sample'); } catch { sample = null; }
    if (!sample) return false;
    const ask = inPageAsk(sample, code => {
      local = null;
      setStatus({ mode: 'offline', connected: false, label: code === 'not_granted' ? 'Navigator not allowed' : 'Navigator not available', detail: code === 'not_granted' ? COPY.declined : COPY.unavailable });
    });
    local = createNavigator({ universe, depth, ask, vocabulary });
    setStatus({ mode: 'inpage', connected: true, label: 'Navigator · Opus 5.5', detail: 'Claude reads the chart from inside this page, on your own Claude account.' });
    return true;
  }

  async function findCompanion(config) {
    if (!config || !config.url) return false;
    const candidate = createRemote(config, pace);
    const answer = await candidate.status();
    if (!answer.connected) throw fail('not_connected');
    remote = candidate;
    theirs.clear(); ours.clear(); // another companion may know these stars by other names, or not at all
    const sameChart = !Number.isInteger(answer.films) || answer.films === universe.base;
    setStatus({
      mode: 'companion', connected: true, label: `Navigator · ${text(answer.modelName, 40) || 'Opus 5.5'}`,
      detail: `Claude reads the chart through the AFTERIMAGE companion.${sameChart ? '' : ' It holds a different edition of the chart than this page, so a few stars may be unknown to it.'}`,
    });
    return true;
  }

  async function find() {
    if (await findInPage()) return status;
    if (!canConnect) { offline(); return status; }
    const config = store.state.companion || (typeof window !== 'undefined' && window.ODYSSEY_COMPANION) || null;
    if (config && config.url) {
      try { await findCompanion(config); loadCommons(); return status; } catch (error) { offline(explain(error)); return status; }
    }
    offline();
    return status;
  }

  /** Points the pilot at a companion the voyager names. Throws with a reason if it does not answer. */
  async function connect(config) {
    await findCompanion(config);
    store.set('companion', { url: config.url, passphrase: config.passphrase || '' });
    loadCommons();
    return status;
  }

  function disconnect() {
    remote = null;
    theirs.clear(); ours.clear();
    store.set('companion', null);
    if (!local) offline();
  }

  // ── The operations. Each returns stars as indexes into this page's universe.
  const rayOut = arrival => ({
    essence: arrival.essence, beyond: arrival.beyond,
    rays: arrival.rays.map(ray => ({ light: ray.light, slug: slugOf(ray.star), claim: ray.claim, watch: ray.watch })),
  });
  /** An arrival kept by slug (in this browser, or by the companion) as stars of this page. Nothing kept is taken on trust. */
  function rayIn(kept) {
    const source = kept && typeof kept === 'object' ? kept : {};
    const rays = [];
    for (const ray of Array.isArray(source.rays) ? source.rays : []) {
      if (!ray || !LIGHT_IDS.includes(ray.light) || typeof ray.slug !== 'string' || rays.some(taken => taken.light === ray.light)) continue;
      const star = starOf(ray.slug);
      const claim = text(ray.claim, 460);
      if (star >= 0 && claim) rays.push({ light: ray.light, star, claim, watch: text(ray.watch, 260) });
    }
    let beyond = null;
    if (source.beyond && typeof source.beyond === 'object') {
      const title = text(source.beyond.title, 140);
      const year = Math.round(Number(source.beyond.year));
      const why = text(source.beyond.why, 360);
      if (title && why && year >= 1888 && year <= 2100) beyond = { title, year, why };
    }
    return { essence: text(source.essence, 360), beyond, rays };
  }

  /**
   * Asks the companion. It may not know a star this browser found (in another edition, or before the
   * companion lost what it kept): each such star is charted there once, by name, and the ask is made again.
   * @param {string} op
   * @param {() => object} build  the request, made anew each time so it names every star as the companion knows it
   * @param {{ signal?: AbortSignal, onDraft?: (draft: object) => void }} options
   * @param {number[]} stars      the stars the request must name
   */
  async function remoteRun(op, build, options, stars = []) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await remote.run(op, build(), options);
      } catch (error) {
        if (error.code !== 'unknown_star' || attempt >= 4) throw error;
        const lost = stars.find(star => universe.films[star] && sent(star) === error.slug);
        if (lost === undefined) throw fail('failed');
        const film = universe.films[lost];
        if (!film.deep) throw fail('chart_mismatch'); // a charted film it should know: the two charts differ
        if (theirs.has(film.s)) throw fail('lost_star'); // charted there once already, and still not known
        const charted = await remote.run('chart', { query: film.t, year: film.y, director: film.d || '' }, { signal: options.signal });
        const name = charted.star && typeof charted.star === 'object' && typeof charted.star.slug === 'string' ? charted.star.slug : '';
        if (!name) throw fail('lost_star');
        theirs.set(film.s, name);
        if (name !== film.s && universe.indexOfSlug(name) < 0) ours.set(name, film.s);
        learn(charted.facts);
      }
    }
  }

  function cachedArrival(star) {
    const kept = store.state.arrivals[slugOf(star)];
    if (!kept) return null;
    const arrival = rayIn(kept);
    return arrival.essence || arrival.rays.length ? arrival : null;
  }

  /** What the Navigator wrote of a charted star before anyone arrived, checked like any reading; null when nothing was. */
  async function aheadArrival(star) {
    if (!readings || !(star >= 0 && star < universe.base)) return null;
    let raw = null;
    try { raw = await readings.get(slugOf(star)); } catch { raw = null; }
    if (!raw) return null;
    const arrival = rayIn(raw);
    return arrival.essence || arrival.rays.length ? { ...arrival, ahead: true } : null;
  }

  async function arrival(star, { onDraft, fresh = false } = {}) {
    if (!fresh) { const kept = cachedArrival(star); if (kept) return kept; }
    need();
    const controller = begin('arrival');
    try {
      let result;
      if (local) {
        result = await local.arrival(star, { onDraft, signal: controller.signal, fresh });
      } else {
        // A ray may point at a star from beyond the chart that this page has not met: it comes along whole.
        const adopt = raw => {
          learn(raw.facts);
          takeCommons(raw.deep);
          return rayIn(raw);
        };
        result = adopt(await remoteRun('arrival', () => ({ star: sent(star), ...(fresh ? { fresh: true } : {}) }), { signal: controller.signal, onDraft: onDraft && (draft => onDraft(adopt(draft))) }, [star]));
      }
      if (result.essence || result.rays.length) store.keepArrival(slugOf(star), rayOut(result));
      return result;
    } finally { finish('arrival', controller); }
  }

  async function deepField(star, { count = 8, onStar } = {}) {
    need();
    const controller = begin('tool');
    const beyond = universe.films.slice(universe.base).filter(film => film.deep);
    const found = [];
    const tell = (entry, light, claim) => {
      const item = { ...entry, light, claim };
      found.push(item);
      onStar?.(item, found.length - 1);
    };
    try {
      if (local) {
        await local.deepField(star, {
          count, signal: controller.signal,
          already: beyond.slice(-60).map(film => `${film.t} (${film.y})`),
          onStar: reading => tell(settle([reading], { from: star, source: 'deepfield' })[0], reading.light, reading.claim),
        });
      } else {
        let taken = 0;
        const drain = payload => {
          learn(payload.facts);
          const stars = Array.isArray(payload.stars) ? payload.stars : [];
          for (; taken < stars.length; taken += 1) {
            const raw = stars[taken];
            const entry = place(raw, { from: star, source: 'deepfield' });
            if (entry) tell(entry, LIGHT_IDS.includes(raw.light) ? raw.light : 'feeling', text(raw.claim, 460));
          }
        };
        drain(await remoteRun('deepfield', () => ({ star: sent(star), count, already: beyond.slice(-80).map(film => theirs.get(film.s) || film.s) }), { signal: controller.signal, onDraft: drain }, [star]));
      }
      return found;
    } finally { finish('tool', controller); }
  }

  async function chart(query, { year = 0, director = '' } = {}) {
    need();
    const controller = begin('tool');
    const nothing = note => ({ star: -1, isNew: false, note: text(note, 240) || 'The Navigator could not place that film.' });
    try {
      if (local) {
        const result = await local.chart({ query, year, director }, { signal: controller.signal });
        if (!result.star) return nothing(result.note);
        return { ...settle([result.star], { source: 'chart' })[0], note: '' };
      }
      const result = await remote.run('chart', { query, year, director }, { signal: controller.signal });
      learn(result.facts);
      const entry = place(result.star, { source: 'chart' });
      return entry ? { ...entry, note: '' } : nothing(result.note);
    } finally { finish('tool', controller); }
  }

  async function course({ request = '', loved = [], seen = [], count = 5 }, { onDraft } = {}) {
    need();
    const controller = begin('tool');
    try {
      if (local) {
        const shape = raw => ({
          name: raw.name, heading: raw.heading,
          waypoints: settle(raw.waypoints || [], { source: 'course' }).map(entry => ({ ...entry, why: entry.reading.why || '', leg: entry.reading.leg || '' })),
        });
        return shape(await local.course({ request, loved, seen, count }, { onDraft: onDraft && (raw => onDraft(shape(raw))), signal: controller.signal }));
      }
      const shape = raw => {
        learn(raw.facts);
        const waypoints = [];
        for (const point of Array.isArray(raw.waypoints) ? raw.waypoints : []) {
          const entry = place(point, { source: 'course' });
          if (entry && !waypoints.some(taken => taken.star === entry.star)) waypoints.push({ ...entry, why: text(point.why, 460), leg: text(point.leg, 300) });
        }
        return { name: text(raw.name, 80) || 'An unnamed course', heading: text(raw.heading, 300), waypoints };
      };
      const steer = loved.slice(-40);
      return shape(await remoteRun('course', () => ({ request, loved: steer.map(sent), seen: seen.slice(-80).map(sent), count }), { onDraft: onDraft && (raw => onDraft(shape(raw))), signal: controller.signal }, steer));
    } finally { finish('tool', controller); }
  }

  async function collide(a, b) {
    need();
    const controller = begin('tool');
    try {
      if (local) {
        const raw = await local.collide(a, b, { signal: controller.signal });
        return { ...settle([raw.star], { from: a, source: 'collision' })[0], fromA: raw.fromA, fromB: raw.fromB, spark: raw.spark };
      }
      const raw = await remoteRun('collision', () => ({ a: sent(a), b: sent(b) }), { signal: controller.signal }, [a, b]);
      learn(raw.facts);
      const entry = place(raw.star, { from: a, source: 'collision' });
      if (!entry) throw fail('empty_reading');
      return { ...entry, fromA: text(raw.fromA, 360), fromB: text(raw.fromB, 360), spark: text(raw.spark, 360) };
    } finally { finish('tool', controller); }
  }

  async function sky(loved, { onDraft } = {}) {
    need();
    const controller = begin('tool');
    try {
      if (local) {
        const raw = await local.sky(loved, { onDraft: onDraft && (draft => onDraft({ name: draft.name, reading: draft.reading, blind: draft.blind, next: [] })), signal: controller.signal });
        return {
          name: raw.name, reading: raw.reading, blind: raw.blind,
          next: settle(raw.next || [], { source: 'sky' }).map(entry => ({ ...entry, why: entry.reading.why || '' })),
        };
      }
      const words = raw => ({ name: text(raw.name, 80), reading: text(raw.reading, 700), blind: text(raw.blind, 300) });
      const fixed = loved.slice(-40);
      const raw = await remoteRun('sky', () => ({ loved: fixed.map(sent) }), { onDraft: onDraft && (draft => onDraft({ ...words(draft), next: [] })), signal: controller.signal }, fixed);
      learn(raw.facts);
      const next = [];
      for (const point of Array.isArray(raw.next) ? raw.next.slice(0, 3) : []) {
        const entry = place(point, { source: 'sky' });
        if (entry) next.push({ ...entry, why: text(point.why, 460) });
      }
      return { ...words(raw), next };
    } finally { finish('tool', controller); }
  }

  return {
    vocabulary,
    get status() { return status; },
    get connected() { return Boolean(local || remote); },
    /** How many stars were read ahead of time, and by whom: { count, films, by, made }, or null. */
    get ahead() { return readings ? readings.about : null; },
    canConnect,
    find, connect, disconnect, restore, explain,
    arrival, cachedArrival, aheadArrival, deepField, chart, course, collide, sky,
    cancel(kind) { running.get(kind)?.abort(); running.delete(kind); },
    busy(kind) { return running.has(kind); },
  };
}
