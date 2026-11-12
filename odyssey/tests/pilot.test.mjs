// The pilot stands between the interface and the Navigator. These tests give it
// a stand-in companion (the four Odyssey routes, answered from a script) or a
// stand-in for the page's own Claude, and check what a voyager would be shown.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createPilot, explain, NAVIGATOR_MODEL } from '../src/nav/pilot.mjs';
import { createStore } from '../src/ui/store.mjs';
import { normaliseReading, plainReading, readingSlug } from '../brain/reading.mjs';
import { open, star, written } from './chart.mjs';

const ADDRESS = 'https://companion.example';
const PASSPHRASE = 'a-long-private-passphrase';
const FAST = { first: 1, step: 0, most: 1 };
const POSTER = name => `https://image.tmdb.org/t/p/w500/${name}.jpg`;

/** A browser's storage that outlives a "visit", and a window to hold it. */
function browser(extra = {}) {
  const kept = new Map();
  globalThis.window = {
    localStorage: { getItem: key => (kept.has(key) ? kept.get(key) : null), setItem: (key, value) => { kept.set(key, String(value)); } },
    ...extra,
  };
  return kept;
}
const settle = ms => new Promise(resolve => setTimeout(resolve, ms));

/** A film as the companion sends one: its clean reading, named by slug, with whatever else the answer adds. */
function sent(vocabulary, title, year, extra = {}, reading = {}) {
  const clean = normaliseReading(written(title, year, reading), vocabulary);
  return { ...plainReading(clean), slug: readingSlug(clean), ...extra };
}

/**
 * A stand-in companion. `script[op](input, companion)` answers a job with
 * { result, drafts? }, { kept } (answered at once, from memory), { failed: { code, error } } or { http, body }.
 */
function companion(universe, { script = {}, status = null, commons = [] } = {}) {
  const known = new Set(universe.bundle.films.map(film => film.s));
  const calls = [];
  const jobs = new Map();
  const reply = (code, body) => ({ ok: code >= 200 && code < 300, status: code, json: async () => body });
  const names = { arrival: i => [i.star], deepfield: i => [i.star], collision: i => [i.a, i.b], course: i => i.loved, sky: i => i.loved, chart: () => [] };
  const self = { calls, known, commons, posts: () => calls.filter(call => call.method === 'POST').map(call => call.body) };
  globalThis.fetch = async (url, init = {}) => {
    const { origin, pathname } = new URL(url);
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    if (init.signal?.aborted) throw Object.assign(new Error('The request was stopped.'), { name: 'AbortError' });
    if (origin !== ADDRESS) throw new TypeError('fetch failed');
    calls.push({ method, path: pathname, body, referrer: init.referrerPolicy });
    if ((init.headers || {}).Authorization !== `Bearer ${PASSPHRASE}`) return reply(401, { code: 'PASSPHRASE_REQUIRED' });
    if (pathname === '/api/odyssey/status') return status ? status() : reply(200, { connected: true, model: 'claude-opus-5-5', modelName: 'Opus 5.5', films: universe.base, beyond: self.commons.length });
    if (pathname === '/api/odyssey/commons') return reply(200, { stars: self.commons, next: self.commons.length, total: self.commons.length });
    if (pathname === '/api/odyssey/jobs' && method === 'POST') {
      const lost = names[body.op](body.input).find(slug => !known.has(slug));
      if (lost) return reply(400, { code: 'UNKNOWN_STAR', error: 'The companion does not know that star.', slug: lost });
      const answer = await script[body.op](body.input, self);
      if (answer.http) return reply(answer.http, answer.body);
      if (answer.kept) return reply(200, { result: answer.kept });
      const steps = (answer.drafts || []).map((draft, n) => ({ status: 'working', draft, draftVersion: n + 1 }));
      steps.push(answer.failed ? { status: 'failed', ...answer.failed } : { status: 'done', result: answer.result });
      jobs.set(`job-${jobs.size + 1}`, steps);
      return reply(202, { jobId: `job-${jobs.size}` });
    }
    const job = /^\/api\/odyssey\/jobs\/(.+)$/.exec(pathname);
    if (job && jobs.has(job[1])) { const steps = jobs.get(job[1]); return reply(200, steps.length > 1 ? steps.shift() : steps[0]); }
    return reply(404, { code: 'JOB_NOT_FOUND' });
  };
  return self;
}

/** A pilot over a fresh universe, with this "browser"'s store. */
function pilotFor(options = {}) {
  const { universe, search, vocabulary } = open();
  const store = createStore();
  const statuses = [];
  const learned = [];
  const pilot = createPilot({ universe, depth: null, search, store, pace: FAST, onStatus: status => statuses.push(status.mode), onFacts: films => learned.push(...films.map(film => film.s)), ...options });
  return { universe, search, vocabulary, store, pilot, statuses, learned };
}
const failure = async run => { try { await run(); } catch (error) { return error; } throw new Error('Expected a failure.'); };

test('with no Navigator to be found, the pilot says so plainly and promises nothing', async () => {
  browser();
  const { pilot, universe } = pilotFor();
  assert.equal(pilot.status.mode, 'connecting');
  await pilot.find();
  assert.deepEqual({ mode: pilot.status.mode, connected: pilot.connected, label: pilot.status.label }, { mode: 'offline', connected: false, label: 'Navigator not connected' });
  assert.equal(pilot.canConnect, true);
  const error = await failure(() => pilot.arrival(star(universe, 'vertigo-1958', 80)));
  assert.equal(error.code, 'offline');
  assert.match(explain(error), /not connected.*chart itself still works/);
  for (const ask of [() => pilot.deepField(0), () => pilot.chart('Ran'), () => pilot.course({ request: 'slow' }), () => pilot.collide(0, 1), () => pilot.sky([0, 1])]) {
    assert.equal((await failure(ask)).code, 'offline');
  }

  // Inside claude.ai there is no companion to offer: the page asks Claude itself or not at all.
  const inside = pilotFor({ edition: 'claude' });
  await inside.pilot.find();
  assert.equal(inside.pilot.canConnect, false);
  assert.equal(inside.pilot.status.label, 'Navigator not available');
  assert.equal((await failure(() => inside.pilot.chart('Ran'))).code, 'unavailable');
  assert.equal(explain(null), '');
  assert.equal(explain(Object.assign(new Error('stopped'), { name: 'AbortError' })), '', 'a call the voyager stopped needs no explaining');
});

test('a companion is reached by its address and passphrase, and each way it can refuse is told apart', async () => {
  browser();
  const { pilot, universe, store, statuses } = pilotFor();
  const fake = companion(universe);

  assert.match(explain(await failure(() => pilot.connect({ url: ADDRESS, passphrase: 'wrong' }))), /passphrase/);
  assert.match(explain(await failure(() => pilot.connect({ url: 'https://nobody.example', passphrase: PASSPHRASE }))), /cannot be reached/);
  assert.equal(pilot.connected, false);
  assert.equal(store.state.companion, null, 'a companion that did not answer is not remembered');

  const refusals = [
    [() => ({ ok: false, status: 404, json: async () => ({}) }), /does not carry the Odyssey/],
    [() => ({ ok: false, status: 503, json: async () => ({ code: 'ODYSSEY_NOT_CONFIGURED' }) }), /does not carry the Odyssey/],
    [() => ({ ok: false, status: 403, json: async () => ({ code: 'ORIGIN_NOT_ALLOWED' }) }), /does not list this page/],
    [() => ({ ok: false, status: 429, json: async () => ({ code: 'PASSPHRASE_THROTTLED' }) }), /Too many wrong passphrases/],
    [() => ({ ok: true, status: 200, json: async () => ({ connected: false, reason: 'missing' }) }), /Claude is not connected to it/],
  ];
  for (const [status, says] of refusals) {
    companion(universe, { status });
    assert.match(explain(await failure(() => pilot.connect({ url: ADDRESS, passphrase: PASSPHRASE }))), says);
  }

  companion(universe);
  const status = await pilot.connect({ url: `${ADDRESS}/`, passphrase: PASSPHRASE });
  assert.deepEqual({ mode: status.mode, connected: status.connected, label: status.label }, { mode: 'companion', connected: true, label: 'Navigator · Opus 5.5' });
  assert.ok(!status.detail.includes('different edition'));
  assert.deepEqual(store.state.companion, { url: `${ADDRESS}/`, passphrase: PASSPHRASE });
  assert.equal(statuses.at(-1), 'companion');
  assert.ok(fake.calls.every(call => call.referrer === 'no-referrer'), 'the page\'s address is not sent along');

  // A companion that runs another model, or holds another edition of the chart, says so.
  companion(universe, { status: () => ({ ok: true, status: 200, json: async () => ({ connected: true, modelName: 'Sonnet 5.5', films: universe.base - 12 }) }) });
  const other = await pilot.connect({ url: ADDRESS, passphrase: PASSPHRASE });
  assert.equal(other.label, 'Navigator · Sonnet 5.5');
  assert.match(other.detail, /different edition of the chart/);

  pilot.disconnect();
  assert.equal(pilot.connected, false);
  assert.equal(store.state.companion, null);
});

test('an arrival comes back naming films by address, brings a star from beyond the chart with it, and is kept', async () => {
  browser();
  const { pilot, universe, vocabulary, store, learned } = pilotFor();
  const MOOD = star(universe, 'in-the-mood-for-love-2000', 40);
  const VERTIGO = star(universe, 'vertigo-1958', 80);
  const mood = universe.films[MOOD].s;
  const lamp = sent(vocabulary, 'The Lamp of Saint Orrin', 1974);
  const whole = {
    essence: 'Two people keep missing each other on purpose.',
    beyond: { title: 'Perfect Days', year: 2023, why: 'The same devotion to small repeated acts.' },
    rays: [
      { light: 'story', slug: universe.films[VERTIGO].s, claim: 'Both are built from a meeting that is put off.', watch: 'Watch the stairwell.' },
      { light: 'feeling', slug: lamp.slug, claim: 'The same patience with empty rooms.', watch: '' },
      { light: 'feeling', slug: universe.films[VERTIGO].s, claim: 'A second ray under one light is dropped.', watch: '' },
      { light: 'image', slug: 'a-star-nobody-sent-1999', claim: 'A ray to a star that was not handed over is dropped.', watch: '' },
      { light: 'sound', slug: universe.films[VERTIGO].s, claim: 'So is a light that does not exist.', watch: '' },
    ],
    deep: [{ reading: lamp, from: mood, source: 'deepfield', facts: { poster: POSTER('lamp'), imdb: 'tt0000001', runtime: 97 } }],
    facts: { [lamp.slug]: { poster: POSTER('lamp'), imdb: 'tt0000001', runtime: 97, overview: 'not a fact the site shows' } },
  };
  const fake = companion(universe, { script: { arrival: () => ({ drafts: [{ essence: whole.essence, beyond: null, rays: [whole.rays[0]], deep: [], facts: {} }], result: whole }) } });
  await pilot.connect({ url: ADDRESS, passphrase: PASSPHRASE });

  const drafts = [];
  const before = universe.count;
  const arrival = await pilot.arrival(MOOD, { onDraft: draft => drafts.push(draft.rays.length) });
  assert.deepEqual(drafts, [1]);
  assert.equal(arrival.essence, whole.essence);
  assert.deepEqual(arrival.beyond, whole.beyond);
  assert.equal(universe.count, before + 1, 'the star the ray points to is now a star here');
  const LAMP = universe.indexOfSlug(lamp.slug);
  assert.deepEqual(arrival.rays, [
    { light: 'story', star: VERTIGO, claim: 'Both are built from a meeting that is put off.', watch: 'Watch the stairwell.' },
    { light: 'feeling', star: LAMP, claim: 'The same patience with empty rooms.', watch: '' },
  ]);
  assert.deepEqual({ pu: universe.films[LAMP].pu, im: universe.films[LAMP].im, rt: universe.films[LAMP].rt, by: universe.films[LAMP].by }, { pu: POSTER('lamp'), im: 'tt0000001', rt: 97, by: 'deepfield' });
  assert.equal(universe.films[LAMP].overview, undefined);
  assert.deepEqual(learned, [], 'the facts came with the star, so nothing already drawn had to change');
  assert.deepEqual(fake.posts(), [{ op: 'arrival', input: { star: mood } }], 'the browser sends an operation and an address, never a prompt');

  // Kept by address in this browser: the next arrival asks nobody.
  assert.deepEqual(store.state.arrivals[mood].rays.map(ray => ray.slug), [universe.films[VERTIGO].s, lamp.slug]);
  const asked = fake.calls.length;
  assert.deepEqual(await pilot.arrival(MOOD), arrival);
  assert.deepEqual(pilot.cachedArrival(MOOD), arrival);
  assert.equal(fake.calls.length, asked);
  await pilot.arrival(MOOD, { fresh: true });
  assert.deepEqual(fake.posts().at(-1), { op: 'arrival', input: { star: mood, fresh: true } });
  assert.equal(pilot.busy('arrival'), false);
});

test('the deep field arrives a star at a time, with posters, and is remembered for the next visit', async () => {
  const kept = browser();
  const first = pilotFor();
  const { pilot, universe, vocabulary, store, learned } = first;
  const MOOD = star(universe, 'in-the-mood-for-love-2000', 40);
  const lamp = sent(vocabulary, 'The Lamp of Saint Orrin', 1974, { light: 'feeling', claim: 'The same patience with empty rooms.' });
  const tides = sent(vocabulary, 'Nine Tides at Carrow', 1981, { light: 'sound', claim: 'A wait that becomes the plot.' });
  const charted = { ...sent(vocabulary, universe.films[star(universe, 'vertigo-1958', 80)].t, 1958, { light: 'story', claim: 'A film the chart already holds.' }), slug: 'vertigo-1958' };
  const fake = companion(universe, {
    script: {
      deepfield: (input, self) => {
        self.known.add(lamp.slug); self.known.add(tides.slug);
        return {
          drafts: [{ stars: [lamp], facts: {} }, { stars: [lamp, tides], facts: {} }],
          result: { stars: [lamp, tides, charted, { title: 'Not a reading' }], facts: { [lamp.slug]: { poster: POSTER('lamp'), imdb: 'tt0000001', runtime: 97 }, [tides.slug]: { poster: 'https://elsewhere.example/tides.jpg' } } },
        };
      },
    },
  });
  await pilot.connect({ url: ADDRESS, passphrase: PASSPHRASE });

  const told = [];
  const found = await pilot.deepField(MOOD, { count: 6, onStar: (item, n) => told.push([universe.films[item.star].s, item.light, n]) });
  assert.deepEqual(told, [[lamp.slug, 'feeling', 0], [tides.slug, 'feeling', 1], ['vertigo-1958', 'story', 2]], 'each star is told once, as it arrives');
  assert.deepEqual(found.map(item => [universe.films[item.star].s, item.isNew]), [[lamp.slug, true], [tides.slug, true], ['vertigo-1958', false]]);
  const LAMP = universe.indexOfSlug(lamp.slug);
  const TIDES = universe.indexOfSlug(tides.slug);
  assert.equal(universe.films[LAMP].pu, POSTER('lamp'));
  assert.equal(universe.films[TIDES].pu, undefined, 'a poster from anywhere but the catalogue\'s image host is not shown');
  assert.deepEqual(learned, [lamp.slug], 'the poster came after the star was drawn, and the page is told which star to redraw');
  assert.deepEqual(fake.posts()[0], { op: 'deepfield', input: { star: universe.films[MOOD].s, count: 6, already: [] } });
  assert.ok(universe.model.linked[LAMP].some(([other]) => other === MOOD), 'a found star is drawn to the star it was sighted from');

  // Looking deeper again names what has been found, by address, so it is not found twice.
  await pilot.deepField(LAMP, { count: 4 });
  assert.deepEqual(fake.posts()[1], { op: 'deepfield', input: { star: lamp.slug, count: 4, already: [lamp.slug, tides.slug] } });

  // The next visit: the same browser, a fresh page.
  assert.deepEqual(store.state.found.map(entry => [entry.slug, entry.from, entry.source, entry.extra?.pu]), [[lamp.slug, universe.films[MOOD].s, 'deepfield', POSTER('lamp')], [tides.slug, universe.films[MOOD].s, 'deepfield', undefined]]);
  await settle(450);
  assert.ok(kept.size === 1, 'the voyage was written down');
  const second = pilotFor();
  assert.equal(second.universe.count, second.universe.base);
  assert.equal(second.pilot.restore(), 2);
  const again = second.universe.indexOfSlug(lamp.slug);
  assert.equal(second.universe.films[again].pu, POSTER('lamp'));
  assert.equal(second.universe.films[again].rt, 97);
  assert.equal(second.pilot.restore(), 0, 'restored twice, nothing is added twice');
});

test('a star only this browser knows is charted on the companion once, under whatever name it is given there', async () => {
  browser();
  const { pilot, universe, vocabulary, store, learned } = pilotFor();
  const VERTIGO = star(universe, 'vertigo-1958', 80);
  // Found on an earlier visit, somewhere this companion has never been.
  const mine = normaliseReading(written('A Harbour in Winter', 1963, { director: 'Mirei Oshiro' }), vocabulary);
  store.state.found.push({ slug: readingSlug(mine), reading: plainReading(mine), from: '', source: 'chart' });
  assert.equal(pilot.restore(), 1);
  const HARBOUR = universe.indexOfSlug('a-harbour-in-winter-1963');
  const theirs = sent(vocabulary, 'Harbour in Winter', 1965, {}, { director: 'Mirei Oshiro' }); // the same film, as the companion's Navigator names it
  const fake = companion(universe, {
    script: {
      chart: (input, self) => { self.known.add(theirs.slug); return { result: { star: theirs, note: '', facts: { [theirs.slug]: { poster: POSTER('harbour'), runtime: 104 } } } }; },
      arrival: input => ({ result: { essence: `Read as ${input.star}.`, beyond: null, rays: [{ light: 'feeling', slug: 'vertigo-1958', claim: 'Both wait.', watch: '' }], deep: [], facts: {} } }),
      collision: input => ({ result: { star: theirs, fromA: `From ${input.a}.`, fromB: `From ${input.b}.`, spark: 'They meet.', facts: {} } }),
    },
  });
  await pilot.connect({ url: ADDRESS, passphrase: PASSPHRASE });
  const before = universe.count;

  const arrival = await pilot.arrival(HARBOUR);
  assert.equal(arrival.essence, 'Read as harbour-in-winter-1965.');
  assert.deepEqual(fake.posts(), [
    { op: 'arrival', input: { star: 'a-harbour-in-winter-1963' } },
    { op: 'chart', input: { query: 'A Harbour in Winter', year: 1963, director: 'Mirei Oshiro' } },
    { op: 'arrival', input: { star: 'harbour-in-winter-1965' } },
  ]);
  assert.equal(universe.count, before, 'one film stays one star here');
  assert.deepEqual({ pu: universe.films[HARBOUR].pu, rt: universe.films[HARBOUR].rt }, { pu: POSTER('harbour'), rt: 104 }, 'what the catalogue found there is kept with the star here');
  assert.deepEqual(learned, ['a-harbour-in-winter-1963']);
  assert.equal(store.state.found[0].extra.pu, POSTER('harbour'));
  assert.ok(store.state.arrivals['a-harbour-in-winter-1963'], 'and its reading is kept under the name this browser knows it by');

  // From here on the companion's name is used without asking again, and its answers resolve to the star here.
  const collision = await pilot.collide(HARBOUR, VERTIGO);
  assert.deepEqual(fake.posts().at(-1), { op: 'collision', input: { a: 'harbour-in-winter-1965', b: 'vertigo-1958' } });
  assert.equal(collision.star, HARBOUR);
  assert.equal(collision.isNew, false);
  assert.equal(fake.posts().filter(post => post.op === 'chart').length, 1);
  assert.equal(universe.count, before);
});

test('a star that cannot be charted again, and a charted film the companion lacks, are explained and not retried', async () => {
  browser();
  const { pilot, universe, vocabulary, store } = pilotFor();
  const VERTIGO = star(universe, 'vertigo-1958', 80);
  const mine = normaliseReading(written('A Film Nobody Remembers', 1971), vocabulary);
  store.state.found.push({ slug: readingSlug(mine), reading: plainReading(mine), from: '', source: 'chart' });
  pilot.restore();
  const LOST = universe.indexOfSlug(readingSlug(mine));
  const fake = companion(universe, { script: { chart: () => ({ result: { star: null, note: 'I do not know a film by that name.', facts: {} } }) } });
  fake.known.delete('vertigo-1958'); // a companion carrying another edition of the chart
  await pilot.connect({ url: ADDRESS, passphrase: PASSPHRASE });

  const lost = await failure(() => pilot.arrival(LOST));
  assert.equal(lost.code, 'lost_star');
  assert.match(explain(lost), /could not chart it again/);
  assert.equal(fake.posts().filter(post => post.op === 'chart').length, 1, 'it is asked for once');

  const mismatch = await failure(() => pilot.arrival(VERTIGO));
  assert.equal(mismatch.code, 'chart_mismatch');
  assert.match(explain(mismatch), /different edition of the chart/);
  assert.equal(fake.posts().filter(post => post.op === 'chart').length, 1, 'a film of the chart is never charted from memory');
  assert.equal(pilot.busy('arrival'), false);
});

test('charting, a course, a collision and a sky place their films, and what fails is told in plain words', async () => {
  browser();
  const { pilot, universe, vocabulary, store } = pilotFor();
  const MOOD = star(universe, 'in-the-mood-for-love-2000', 40);
  const VERTIGO = star(universe, 'vertigo-1958', 80);
  const SPIRITED = star(universe, 'spirited-away-2001', 120);
  const slug = index => universe.films[index].s;
  const one = sent(vocabulary, 'Invented One', 1961, { why: 'It answers the same wish.', leg: 'From obsession toward patience.' });
  const two = sent(vocabulary, 'Invented Two', 1962, { why: 'The long reach.' });
  const vertigo = { ...sent(vocabulary, universe.films[VERTIGO].t, universe.films[VERTIGO].y, { why: 'The truest answer.', leg: '' }), slug: slug(VERTIGO) };
  let mode = 'answers';
  const fake = companion(universe, {
    script: {
      chart: input => (input.query.startsWith('zz')
        ? { result: { star: null, note: 'I do not know a film by that name.', facts: {} } }
        : { result: { star: sent(vocabulary, 'The Orchard Keepers', 1987), note: '', facts: { 'the-orchard-keepers-1987': { poster: POSTER('orchard'), imdb: 'tt0000004', runtime: 112 } } } }),
      course: () => {
        if (mode === 'limit') return { failed: { code: 'CLAUDE_USAGE_LIMIT', error: 'The Claude subscription has reached its usage limit for now.' } };
        if (mode === 'slow') return { failed: { code: 'CLAUDE_TIMEOUT', error: 'Claude took too long.' } };
        if (mode === 'busy') return { http: 503, body: { code: 'CLAUDE_UNAVAILABLE' } };
        if (mode === 'odd') return { failed: { code: 'SOMETHING_NEW', error: 'internal detail the voyager should not be shown' } };
        return { drafts: [{ name: 'Slow water', heading: '', waypoints: [vertigo], facts: {} }], result: { name: 'Slow water', heading: 'Five films that wait.', waypoints: [vertigo, one, one, { title: 'no reading' }], facts: {} } };
      },
      collision: () => ({ result: { star: one, fromA: 'Its held breath.', fromB: 'Its dizzy fall.', spark: 'Both look at someone who is not quite there.', facts: {} } }),
      sky: () => ({ drafts: [{ name: 'The patient eye', reading: '', blind: '', next: [], facts: {} }], result: { name: 'The patient eye', reading: 'You love films that wait.', blind: 'Nothing loud.', next: [one, two, vertigo, two], facts: {} } }),
    },
  });
  await pilot.connect({ url: ADDRESS, passphrase: PASSPHRASE });

  const charted = await pilot.chart('the orchard keepers', { year: 1987 });
  assert.equal(charted.isNew, true);
  assert.deepEqual({ t: universe.films[charted.star].t, pu: universe.films[charted.star].pu, im: universe.films[charted.star].im, rt: universe.films[charted.star].rt, by: universe.films[charted.star].by },
    { t: 'The Orchard Keepers', pu: POSTER('orchard'), im: 'tt0000004', rt: 112, by: 'chart' });
  assert.deepEqual(await pilot.chart('zzqx unknown film'), { star: -1, isNew: false, note: 'I do not know a film by that name.' });
  assert.deepEqual(fake.posts()[0], { op: 'chart', input: { query: 'the orchard keepers', year: 1987, director: '' } });

  const drafts = [];
  const course = await pilot.course({ request: 'something slow and strange', loved: [MOOD], seen: [SPIRITED] }, { onDraft: draft => drafts.push(draft.waypoints.length) });
  assert.deepEqual(drafts, [1]);
  assert.deepEqual(course.waypoints.map(point => [slug(point.star), point.isNew, point.why]), [[slug(VERTIGO), false, 'The truest answer.'], ['invented-one-1961', true, 'It answers the same wish.']], 'a film named twice is one stop');
  assert.deepEqual(fake.posts().at(-1), { op: 'course', input: { request: 'something slow and strange', loved: [slug(MOOD)], seen: [slug(SPIRITED)], count: 5 } });

  const collision = await pilot.collide(MOOD, VERTIGO);
  assert.deepEqual([slug(collision.star), collision.isNew, collision.spark], ['invented-one-1961', false, 'Both look at someone who is not quite there.']);

  const words = [];
  const sky = await pilot.sky([MOOD, VERTIGO, SPIRITED], { onDraft: draft => words.push(draft.name) });
  assert.deepEqual(words, ['The patient eye']);
  assert.deepEqual(sky.next.map(point => slug(point.star)), ['invented-one-1961', 'invented-two-1962', slug(VERTIGO)]);
  assert.deepEqual(store.state.found.map(entry => [entry.slug, entry.source]), [['the-orchard-keepers-1987', 'chart'], ['invented-one-1961', 'course'], ['invented-two-1962', 'sky']]);

  // Failures: the companion's own sentence where it knows best, a plain one otherwise, never an internal detail.
  const ask = () => pilot.course({ request: 'something slow' });
  mode = 'limit';
  assert.equal(explain(await failure(ask)), 'The Claude subscription has reached its usage limit for now.');
  mode = 'slow';
  assert.match(explain(await failure(ask)), /took too long/);
  mode = 'busy';
  assert.match(explain(await failure(ask)), /busy, or a usage limit/);
  mode = 'odd';
  assert.equal(explain(await failure(ask)), 'The Navigator\'s answer did not come through. Try again.');
  assert.equal(pilot.busy('tool'), false);
});

test('stars other voyagers found are waiting at the companion, and a poster found since reaches a star already here', async () => {
  browser();
  const { pilot, universe, vocabulary, store, learned } = pilotFor();
  const MOOD = star(universe, 'in-the-mood-for-love-2000', 40);
  const lamp = sent(vocabulary, 'The Lamp of Saint Orrin', 1974);
  const tides = sent(vocabulary, 'Nine Tides at Carrow', 1981);
  // This browser found one of them itself, before any catalogue had answered for it.
  store.state.found.push({ slug: lamp.slug, reading: plainReading(normaliseReading(written('The Lamp of Saint Orrin', 1974), vocabulary)), from: universe.films[MOOD].s, source: 'deepfield' });
  assert.equal(pilot.restore(), 1);
  const LAMP = universe.indexOfSlug(lamp.slug);
  assert.equal(universe.films[LAMP].pu, undefined);

  store.state.companion = { url: ADDRESS, passphrase: PASSPHRASE };
  companion(universe, {
    commons: [
      { reading: lamp, from: universe.films[MOOD].s, source: 'deepfield', facts: { poster: POSTER('lamp'), imdb: 'tt0000001', runtime: 97 } },
      { reading: tides, from: lamp.slug, source: 'deepfield', facts: { poster: POSTER('tides') } },
      { reading: { title: 'x', year: 'soon' }, from: '', source: 'deepfield' },
      'not an entry',
    ],
  });
  await pilot.find(); // the companion this browser used last time
  assert.equal(pilot.status.mode, 'companion');
  await settle(20); // the commons arrive just after the status
  assert.equal(universe.count, universe.base + 2);
  const TIDES = universe.indexOfSlug(tides.slug);
  assert.equal(universe.films[TIDES].pu, POSTER('tides'));
  assert.ok(universe.model.linked[TIDES].some(([other]) => other === LAMP));
  assert.equal(universe.films[LAMP].pu, POSTER('lamp'));
  assert.deepEqual(learned, [lamp.slug]);
  assert.equal(store.state.found[0].extra.pu, POSTER('lamp'), 'and the poster is remembered with the star this browser found');
  assert.equal(store.state.found.length, 1, 'the commons are the companion\'s to keep, not this browser\'s');
});

test('inside claude.ai the page asks Claude itself, as the model the owner named', async () => {
  const asked = [];
  let refuse = '';
  const sample = { json: async (prompt, options) => {
    asked.push({ prompt, options });
    if (refuse) throw Object.assign(new Error(refuse), { code: refuse });
    if (prompt.includes('THE VIEWER TYPED:')) return { star: written('The Orchard Keepers', 1987), note: '' };
    const whole = JSON.stringify({ stars: [written('The Lamp of Saint Orrin', 1974, { light: 'idea', claim: 'One.' }), written('Nine Tides at Carrow', 1981, { light: 'story', claim: 'Two.' })] });
    options.onText({ text: whole.slice(0, whole.indexOf('Nine Tides')), delta: '' });
    return JSON.parse(whole);
  } };
  browser({ claude: { use: async name => (name === 'sample' ? sample : null) } });
  const { pilot, universe, store } = pilotFor({ edition: 'claude' });
  const MOOD = star(universe, 'in-the-mood-for-love-2000', 40);
  await pilot.find();
  assert.deepEqual({ mode: pilot.status.mode, label: pilot.status.label }, { mode: 'inpage', label: 'Navigator · Opus 5.5' });

  const told = [];
  const found = await pilot.deepField(MOOD, { count: 2, onStar: item => told.push(universe.films[item.star].t) });
  assert.deepEqual(told, ['The Lamp of Saint Orrin', 'Nine Tides at Carrow']);
  assert.deepEqual(found.map(item => item.light), ['idea', 'story']);
  const charted = await pilot.chart('the orchard keepers');
  assert.equal(universe.films[charted.star].by, 'chart');
  assert.equal(store.state.found.length, 3);
  for (const { options } of asked) {
    assert.equal(options.model, NAVIGATOR_MODEL);
    assert.equal(NAVIGATOR_MODEL, 'claude-opus-5-5');
    assert.equal(options.modelTier, 'complex', 'and the most capable tier if this viewer cannot use it');
  }
  assert.equal(asked[0].options.cache, true);
  assert.deepEqual(asked[1].options.cache, { gcTime: 12 * 3600 * 1000 }, 'what is true of a film is kept for the day');
  assert.ok(asked[1].prompt.includes('=== DATA ==='));

  refuse = 'rate_limited';
  assert.match(explain(await failure(() => pilot.chart('ran'))), /busy, or a usage limit/);
  assert.equal(pilot.connected, true, 'a busy moment is not the end of the Navigator');
  refuse = 'not_granted';
  assert.match(explain(await failure(() => pilot.chart('ran'))), /chose not to let this page ask Claude/);
  assert.equal(pilot.connected, false);
  assert.equal(pilot.status.label, 'Navigator not allowed');
});
