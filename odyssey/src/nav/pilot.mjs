// The pilot stands between the interface and the Navigator. It finds out how
// Claude can be reached (inside the page, through the companion, or not at
// all), gives every reading its place in the universe, remembers what was
// found, and turns failures into something a voyager can read.
//
// Nothing here pretends. With no Navigator connected the chart still works,
// and every call says plainly that Claude is not there.
import { createNavigator, settleReadings, NavigatorError } from '../../brain/navigator.mjs';
import { buildVocabulary } from '../../brain/vocabulary.mjs';
import { starFromReading, readingSlug, reviveReading } from '../../brain/reading.mjs';
import { readPartial } from '../../brain/partial.mjs';

export const NAVIGATOR_MODEL = 'claude-opus-5-5';
const HOUR = 3600 * 1000;
const UNAVAILABLE = new Set(['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed']);

const COPY = {
  offline: 'The Navigator is not connected, so this part of the voyage is closed. The chart itself still works.',
  unavailable: 'Claude is not available in this view, so the Navigator is silent. The chart itself still works.',
  declined: 'You chose not to let this page ask Claude, so the Navigator is silent. Reload the page if you change your mind. The chart itself still works.',
  busy: 'Claude is busy, or a usage limit has been reached. Try again in a little while.',
  session_expired: 'Your Claude session has ended. Reload the page to continue with the Navigator.',
  refused: 'Claude declined to answer that.',
  passphrase: 'The companion needs its passphrase before the Navigator can answer.',
  unreachable: 'The companion cannot be reached right now.',
  not_connected: 'The companion is running, but Claude is not connected to it.',
  empty_reading: 'The Navigator had nothing sure to say there.',
  failed: 'The Navigator\'s answer did not come through. Try again.',
};

/** What to tell the voyager about a failure. Empty for a call they stopped themselves. */
export function explain(error) {
  if (!error || error.code === 'cancelled' || error.name === 'AbortError') return '';
  if (error.code === 'bad_input' || error.code === 'unlit') return error.message;
  return COPY[error.code] || COPY.failed;
}

const fail = (code, message) => new NavigatorError(code, message || COPY[code] || COPY.failed);

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
        ...(onText ? { onText: ({ text }) => onText(text) } : {}),
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
function createRemote({ url, passphrase }) {
  const base = String(url || '').replace(/\/+$/, '');
  const headers = () => ({ 'Content-Type': 'application/json', ...(passphrase ? { Authorization: `Bearer ${passphrase}` } : {}) });

  async function request(path, init = {}) {
    let response;
    try {
      response = await fetch(`${base}${path}`, { ...init, headers: headers(), referrerPolicy: 'no-referrer' });
    } catch (error) {
      if (error && error.name === 'AbortError') throw fail('cancelled', 'Stopped.');
      throw fail('unreachable');
    }
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    if (response.ok) return body || {};
    const code = body && body.code;
    if (response.status === 401 || code === 'PASSPHRASE_REQUIRED') throw fail('passphrase');
    if (response.status === 429) throw fail('busy');
    if (code === 'CLAUDE_NOT_CONNECTED') throw fail('not_connected');
    if (code === 'CLAUDE_UNAVAILABLE') throw fail('busy');
    if (code === 'UNKNOWN_STAR') throw Object.assign(fail('unknown_star', 'The companion does not know that star.'), { slug: body.slug });
    if (response.status === 400) throw fail('bad_input', (body && body.error) || 'The companion did not accept that request.');
    throw fail('failed');
  }

  const wait = (ms, signal) => new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(fail('cancelled', 'Stopped.')); }, { once: true });
  });

  /** Starts one operation and follows it to its end, handing drafts on as they develop. */
  async function run(op, input, { onDraft, signal } = {}) {
    const started = await request('/api/odyssey/jobs', { method: 'POST', body: JSON.stringify({ op, input }), signal });
    if (started.result) return started.result; // answered from the companion's own memory
    let pause = 500;
    let seen = 0;
    for (;;) {
      await wait(pause, signal);
      pause = Math.min(1400, pause + 150);
      const job = await request(`/api/odyssey/jobs/${encodeURIComponent(started.jobId)}`, { signal });
      if (job.draft && job.draftVersion !== seen) { seen = job.draftVersion; onDraft?.(job.draft); }
      if (job.status === 'done') return job.result;
      if (job.status === 'failed') throw fail(job.code === 'CLAUDE_UNAVAILABLE' ? 'busy' : (job.code || 'failed').toLowerCase(), job.error);
    }
  }

  return { run, status: () => request('/api/odyssey/status'), commons: since => request(`/api/odyssey/commons${since ? `?since=${encodeURIComponent(since)}` : ''}`) };
}

/**
 * @param {object} input
 * @param {object} input.universe
 * @param {object[]|null} input.depth
 * @param {object} input.search
 * @param {object} input.store        the voyager's store
 * @param {(status: object) => void} [input.onStatus]
 */
export function createPilot({ universe, depth, search, store, edition = 'site', onStatus = () => {} }) {
  // Inside claude.ai a page asks Claude itself and can reach nothing else, so there is no companion to connect.
  const canConnect = edition !== 'claude';
  const vocabulary = buildVocabulary(universe.bundle.traits);
  let status = { mode: 'connecting', connected: false, label: 'Finding the Navigator', detail: '' };
  let local = null;   // a Navigator that asks Claude from this page
  let remote = null;  // the companion
  const running = new Map(); // kind → AbortController

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
  const slugOf = star => universe.films[star].s;
  const starOf = slug => universe.indexOfSlug(slug);

  // ── Stars found beyond the chart.
  /** Gives readings their stars, and remembers the new ones for next time. */
  function settle(readings, { from, source }) {
    const settled = settleReadings({ universe, search, vocabulary, readings, from, source });
    for (const entry of settled) {
      if (entry.isNew) store.remember({ reading: entry.reading, from: Number.isInteger(from) ? slugOf(from) : '', source });
    }
    return settled;
  }

  /** Puts back the stars found on earlier visits. */
  function restore() {
    const fresh = [];
    for (const entry of store.state.found) {
      const reading = reviveReading(entry.reading, vocabulary);
      if (!reading) continue;
      if (starOf(readingSlug(reading)) >= 0 || search.exact(reading.title, reading.year) >= 0) continue;
      const from = entry.from ? starOf(entry.from) : -1;
      fresh.push(starFromReading(reading, universe, vocabulary, { from: from >= 0 ? from : undefined, source: entry.source || 'deepfield' }));
    }
    if (fresh.length) universe.addStars(fresh);
    return fresh.length;
  }

  /** Stars other voyagers found, kept by the companion. */
  async function loadCommons() {
    if (!remote) return 0;
    try {
      const { stars = [] } = await remote.commons();
      const readings = stars.map(entry => reviveReading(entry.reading || entry, vocabulary)).filter(Boolean);
      const before = universe.count;
      settleReadings({ universe, search, vocabulary, readings, source: 'commons' });
      return universe.count - before;
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
    const candidate = createRemote(config);
    const answer = await candidate.status();
    if (!answer.connected) throw fail('not_connected');
    remote = candidate;
    setStatus({ mode: 'companion', connected: true, label: `Navigator · ${answer.modelName || 'Opus 5.5'}`, detail: 'Claude reads the chart through the AFTERIMAGE companion.' });
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
    store.set('companion', null);
    if (!local) offline();
  }

  // ── The operations. Each returns stars as indexes into this page's universe.
  const rayOut = arrival => ({
    essence: arrival.essence, beyond: arrival.beyond,
    rays: arrival.rays.map(ray => ({ light: ray.light, slug: slugOf(ray.star), claim: ray.claim, watch: ray.watch })),
  });
  const rayIn = kept => ({
    essence: kept.essence || '', beyond: kept.beyond || null,
    rays: (kept.rays || []).map(ray => ({ light: ray.light, star: starOf(ray.slug), claim: ray.claim, watch: ray.watch || '' })).filter(ray => ray.star >= 0 && ray.claim),
  });

  /** The companion may not know a star this browser found: have it charted there, once. */
  async function remoteRun(op, input, options, stars = []) {
    try {
      return await remote.run(op, input, options);
    } catch (error) {
      if (error.code !== 'unknown_star') throw error;
      const lost = stars.map(star => universe.films[star]).filter(film => film && film.deep && (!error.slug || film.s === error.slug));
      if (!lost.length) throw fail('failed');
      for (const film of lost) await remote.run('chart', { query: film.t, year: film.y, director: film.d || '' }, { signal: options.signal });
      return remote.run(op, input, options);
    }
  }

  function cachedArrival(star) {
    const kept = store.state.arrivals[slugOf(star)];
    if (!kept) return null;
    const arrival = rayIn(kept);
    return arrival.essence || arrival.rays.length ? arrival : null;
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
        const adopt = raw => {
          const deep = (raw.deep || []).map(reading => reviveReading(reading, vocabulary)).filter(Boolean);
          if (deep.length) settleReadings({ universe, search, vocabulary, readings: deep, source: 'commons' });
          return rayIn(raw);
        };
        result = adopt(await remoteRun('arrival', { star: slugOf(star), ...(fresh ? { fresh: true } : {}) }, { signal: controller.signal, onDraft: onDraft && (draft => onDraft(adopt(draft))) }, [star]));
      }
      if (result.essence || result.rays.length) store.keepArrival(slugOf(star), rayOut(result));
      return result;
    } finally { finish('arrival', controller); }
  }

  async function deepField(star, { count = 8, onStar } = {}) {
    need();
    const controller = begin('tool');
    const already = universe.films.slice(universe.base).filter(film => film.deep).slice(-60).map(film => `${film.t} (${film.y})`);
    const found = [];
    const take = reading => {
      const [entry] = settle([reading], { from: star, source: 'deepfield' });
      const item = { ...entry, light: reading.light, claim: reading.claim };
      found.push(item);
      onStar?.(item, found.length - 1);
    };
    try {
      if (local) {
        await local.deepField(star, { count, already, onStar: take, signal: controller.signal });
      } else {
        let taken = 0;
        const drain = stars => { for (; taken < stars.length; taken += 1) take(stars[taken]); };
        const result = await remoteRun('deepfield', { star: slugOf(star), count, already }, { signal: controller.signal, onDraft: draft => drain(draft.stars || []) }, [star]);
        drain(result.stars || []);
      }
      return found;
    } finally { finish('tool', controller); }
  }

  async function chart(query, { year = 0, director = '' } = {}) {
    need();
    const controller = begin('tool');
    try {
      const result = local
        ? await local.chart({ query, year, director }, { signal: controller.signal })
        : await remote.run('chart', { query, year, director }, { signal: controller.signal });
      if (!result.star) return { star: -1, isNew: false, note: result.note || 'The Navigator could not place that film.' };
      const [entry] = settle([result.star], { source: 'chart' });
      return { ...entry, note: '' };
    } finally { finish('tool', controller); }
  }

  async function course({ request = '', loved = [], seen = [], count = 5 }, { onDraft } = {}) {
    need();
    const controller = begin('tool');
    const shape = raw => ({
      name: raw.name, heading: raw.heading,
      waypoints: settle(raw.waypoints || [], { source: 'course' }).map(entry => ({ ...entry, why: entry.reading.why || '', leg: entry.reading.leg || '' })),
    });
    try {
      const draft = onDraft && (raw => onDraft(shape(raw)));
      const raw = local
        ? await local.course({ request, loved, seen, count }, { onDraft: draft, signal: controller.signal })
        : await remoteRun('course', { request, loved: loved.map(slugOf), seen: seen.slice(-60).map(slugOf), count }, { onDraft: draft, signal: controller.signal }, loved);
      return shape(raw);
    } finally { finish('tool', controller); }
  }

  async function collide(a, b) {
    need();
    const controller = begin('tool');
    try {
      const raw = local
        ? await local.collide(a, b, { signal: controller.signal })
        : await remoteRun('collision', { a: slugOf(a), b: slugOf(b) }, { signal: controller.signal }, [a, b]);
      const [entry] = settle([raw.star], { from: a, source: 'collision' });
      return { ...entry, fromA: raw.fromA, fromB: raw.fromB, spark: raw.spark };
    } finally { finish('tool', controller); }
  }

  async function sky(loved, { onDraft } = {}) {
    need();
    const controller = begin('tool');
    const shape = raw => ({
      name: raw.name, reading: raw.reading, blind: raw.blind,
      next: settle(raw.next || [], { source: 'sky' }).map(entry => ({ ...entry, why: entry.reading.why || '' })),
    });
    try {
      const draft = onDraft && (raw => onDraft({ name: raw.name, reading: raw.reading, blind: raw.blind, next: [] }));
      const raw = local
        ? await local.sky(loved, { onDraft: draft, signal: controller.signal })
        : await remoteRun('sky', { loved: loved.map(slugOf) }, { onDraft: draft, signal: controller.signal }, loved);
      return shape(raw);
    } finally { finish('tool', controller); }
  }

  return {
    vocabulary,
    get status() { return status; },
    get connected() { return Boolean(local || remote); },
    canConnect,
    find, connect, disconnect, restore, explain,
    arrival, cachedArrival, deepField, chart, course, collide, sky,
    cancel(kind) { running.get(kind)?.abort(); running.delete(kind); },
    busy(kind) { return running.has(kind); },
  };
}
