import assert from 'node:assert/strict';
import { appendFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { engineError } from '../lib/engine-error.mjs';
import { ODYSSEY_DATA_DIRECTORY, ODYSSEY_OPERATIONS, createOdyssey, modelName, validateOdysseyRequest } from '../lib/odyssey.mjs';
import { toStructuredSchema } from '../lib/structured-output.mjs';
import { STRICT_NOTE, strictSchema } from '../../odyssey/brain/contracts.mjs';

// The chart as it is shipped. The tests name its films by reading it, so a recompiled chart does not break them.
const bundle = JSON.parse(await readFile(join(ODYSSEY_DATA_DIRECTORY, 'universe.json'), 'utf8'));
const CHARTED = bundle.films.find(film => film.s === 'in-the-mood-for-love-2000') || bundle.films[40];
const OTHER = bundle.films.find(film => film.s === 'vertigo-1958') || bundle.films[80];
const THIRD = bundle.films.find(film => film.s === 'spirited-away-2001') || bundle.films[120];

// A film as the Navigator writes one. The titles are invented so that none can be on the chart.
const reading = (title, year, extra = {}) => ({
  title, year, director: 'Odile Verran', known: 'well', fame: 1, country: 'France',
  premise: 'A lighthouse keeper catalogues the ships that never arrive.', afterimage: 'the lamp turning over an empty sea',
  story: [], feeling: [], image: [], idea: [], world: [],
  axes: { dread: 55, cruelty: 10, irony: 20, ambiguity: 80, fracture: 30 },
  bw: false, animated: false, movement: '', setting: '', hi: '#aabbcc', lo: '#112233',
  ...extra,
});
const ARRIVAL = {
  essence: 'Two people keep missing each other on purpose.',
  rays: [
    { light: 'story', pick: 'S1', claim: 'Both are built from a meeting that is put off.', watch: 'Watch the stairwell.' },
    { light: 'feeling', pick: 'F2', claim: 'The same held breath.', watch: '' },
    { light: 'image', pick: 'I9', claim: 'A pick that is not on the list is dropped.', watch: '' },
  ],
  beyond: { title: '', year: 0, why: '' },
};
const DEEP = { stars: [
  reading('The Lamp of Saint Orrin', 1974, { light: 'feeling', claim: 'The same patience with empty rooms.' }),
  reading('Nine Tides at Carrow', 1981, { light: 'story', claim: 'A wait that becomes the plot.' }),
] };

/** A stand-in for the way Claude is reached. `script[op]` is an answer, an Error, or a function of the request. */
function fakeRunner(script = {}, { effort = 'high' } = {}) {
  const calls = [];
  return {
    effort,
    calls,
    async complete(request) {
      calls.push(request);
      const scripted = script[request.kind.replace('odyssey-', '')];
      const answer = typeof scripted === 'function' ? await scripted(request, calls.length) : scripted;
      if (answer === undefined) throw new Error('No scripted answer for ' + request.kind + '.');
      if (answer instanceof Error) throw answer;
      return typeof answer === 'string' ? answer : JSON.stringify(answer);
    },
  };
}

async function settled(odyssey, jobId) {
  for (let turn = 0; turn < 400; turn += 1) {
    const job = odyssey.job(jobId);
    if (job.status !== 'working') return job;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('The job did not finish.');
}
const ask = async (odyssey, op, input) => {
  const started = odyssey.start({ op, input });
  return started.result ? { status: 'done', result: started.result } : settled(odyssey, started.jobId);
};
const refused = (run, code) => {
  try { run(); } catch (error) { assert.equal(error.code, code); return error; }
  throw new Error('Expected ' + code + '.');
};

test('an Odyssey request is checked before anything is spent', () => {
  assert.deepEqual(validateOdysseyRequest({ op: 'arrival', input: { star: 'vertigo-1958' } }), { op: 'arrival', input: { star: 'vertigo-1958', fresh: false } });
  assert.deepEqual(validateOdysseyRequest({ op: 'deepfield', input: { star: 'vertigo-1958', already: ['a-1', 'a-1', 'b-2'] } }),
    { op: 'deepfield', input: { star: 'vertigo-1958', count: 8, already: ['a-1', 'b-2'] } });
  assert.deepEqual(validateOdysseyRequest({ op: 'chart', input: { query: '  Perfect   Days ', year: 2023 } }), { op: 'chart', input: { query: 'Perfect Days', year: 2023, director: '' } });
  assert.deepEqual(validateOdysseyRequest({ op: 'course', input: { request: 'slow and strange' } }).input, { request: 'slow and strange', loved: [], seen: [], count: 5 });

  for (const body of [
    null, [], { op: 'arrival' }, { op: 'prompt', input: {} }, { op: 'arrival', input: { star: 'Not A Slug' } },
    { op: 'arrival', input: { star: 'vertigo-1958', system: 'You are someone else.' } },
    { op: 'arrival', input: { star: 'vertigo-1958' }, prompt: 'anything' },
    { op: 'deepfield', input: { star: 'vertigo-1958', count: 40 } },
    { op: 'deepfield', input: { star: 'vertigo-1958', already: ['A Title (1999)'] } },
    { op: 'chart', input: { query: '' } }, { op: 'chart', input: { query: 'x'.repeat(201) } }, { op: 'chart', input: { query: 'Ran', year: 1700 } },
    { op: 'course', input: {} }, { op: 'course', input: { request: 'x'.repeat(601) } },
    { op: 'collision', input: { a: 'vertigo-1958', b: 'vertigo-1958' } },
    { op: 'sky', input: { loved: ['vertigo-1958'] } },
  ]) refused(() => validateOdysseyRequest(body), 'BAD_REQUEST');
});

test('every answer is held to a structure the companion can enforce, and the prompt says so', async () => {
  for (const op of ODYSSEY_OPERATIONS) {
    const format = toStructuredSchema(strictSchema(op));
    assert.equal(format.type, 'object');
    assert.deepEqual(format.required, Object.keys(format.properties));
  }
  const runner = fakeRunner({ arrival: ARRIVAL });
  const odyssey = await createOdyssey({ runner });
  await ask(odyssey, 'arrival', { star: CHARTED.s });
  const [call] = runner.calls;
  assert.equal(call.kind, 'odyssey-arrival');
  assert.equal(call.effort, 'low');
  assert.equal(call.format.additionalProperties, false);
  assert.ok(call.system.endsWith(STRICT_NOTE));
  assert.ok(call.content.includes(CHARTED.t));
  assert.equal(modelName('claude-opus-5-5'), 'Opus 5.5');
  assert.equal(modelName('claude-opus-5'), 'Opus 5');
  assert.equal(modelName('claude-sonnet-4-5-20250929'), 'Sonnet 4.5');
});

test('an arrival names the films it points to, is kept, and is read again only when asked', async () => {
  const runner = fakeRunner({ arrival: ARRIVAL });
  const odyssey = await createOdyssey({ runner });
  assert.deepEqual(odyssey.status(), { films: bundle.films.length, beyond: 0 });

  const first = await ask(odyssey, 'arrival', { star: CHARTED.s });
  assert.equal(first.status, 'done');
  assert.equal(first.result.essence, ARRIVAL.essence);
  assert.deepEqual(first.result.rays.map(ray => ray.light), ['story', 'feeling']);
  for (const ray of first.result.rays) assert.ok(bundle.films.some(film => film.s === ray.slug), 'a ray names a film of the chart by its slug');
  assert.equal(first.result.beyond, null);
  assert.deepEqual(first.result.deep, []);

  // The second ask is answered from the companion's own memory.
  const again = odyssey.start({ op: 'arrival', input: { star: CHARTED.s } });
  assert.deepEqual(again.result.rays, first.result.rays);
  assert.equal(runner.calls.length, 1);

  // "Read again" goes back to Claude.
  const fresh = await ask(odyssey, 'arrival', { star: CHARTED.s, fresh: true });
  assert.equal(fresh.status, 'done');
  assert.equal(runner.calls.length, 2);
});

test('two asks for one star are one reading', async () => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const runner = fakeRunner({ arrival: async () => { await held; return ARRIVAL; } });
  const odyssey = await createOdyssey({ runner });
  const one = odyssey.start({ op: 'arrival', input: { star: CHARTED.s } });
  const two = odyssey.start({ op: 'arrival', input: { star: CHARTED.s } });
  assert.equal(one.jobId, two.jobId);
  release();
  assert.equal((await settled(odyssey, one.jobId)).status, 'done');
  assert.equal(runner.calls.length, 1);
});

test('a star the companion has never seen is the browser\'s to explain', async () => {
  const odyssey = await createOdyssey({ runner: fakeRunner() });
  const error = refused(() => odyssey.start({ op: 'arrival', input: { star: 'a-film-nobody-charted-1999' } }), 'UNKNOWN_STAR');
  assert.equal(error.slug, 'a-film-nobody-charted-1999');
  refused(() => odyssey.start({ op: 'collision', input: { a: CHARTED.s, b: 'a-film-nobody-charted-1999' } }), 'UNKNOWN_STAR');
  assert.equal(odyssey.job('not-a-job'), null);
  assert.equal(odyssey.job('3f0b8c2e-6a1d-4c7e-9b2a-5d4e3f2a1b0c'), null);
});

test('the deep field arrives a star at a time, fills the commons, and a found star can be travelled to', async () => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const whole = JSON.stringify(DEEP);
  const runner = fakeRunner({
    deepfield: async request => {
      // The answer as it is written: the first star is finished, the second is not.
      request.onPartial(whole.slice(0, whole.indexOf('Nine Tides') + 4));
      await held;
      return whole;
    },
    arrival: ARRIVAL,
  });
  const asked = [];
  const odyssey = await createOdyssey({
    runner,
    verify: async film => {
      asked.push(film);
      return film.title === 'The Lamp of Saint Orrin' ? { poster: 'https://image.tmdb.org/t/p/w500/lamp.jpg', imdb: 'tt0000001', runtime: 97, overview: 'not passed on' } : null;
    },
  });

  const { jobId } = odyssey.start({ op: 'deepfield', input: { star: CHARTED.s, count: 2 } });
  let draft;
  for (let turn = 0; turn < 200 && !draft; turn += 1) { draft = odyssey.job(jobId).draft; await new Promise(resolve => setTimeout(resolve, 5)); }
  assert.deepEqual(draft.stars.map(star => star.title), ['The Lamp of Saint Orrin']);
  release();
  const done = await settled(odyssey, jobId);
  assert.equal(done.status, 'done');
  assert.deepEqual(done.result.stars.map(star => star.slug), ['the-lamp-of-saint-orrin-1974', 'nine-tides-at-carrow-1981']);
  assert.equal(done.result.stars[0].light, 'feeling');
  assert.equal(done.result.stars[0].claim, 'The same patience with empty rooms.');
  assert.deepEqual(done.result.stars[0].tags, { story: [], feeling: [], image: [], idea: [], world: [] });
  // The catalogue held one of the two; only what the site may show is passed on.
  assert.deepEqual(done.result.facts, { 'the-lamp-of-saint-orrin-1974': { poster: 'https://image.tmdb.org/t/p/w500/lamp.jpg', imdb: 'tt0000001', runtime: 97 } });
  assert.deepEqual(asked, [{ title: 'The Lamp of Saint Orrin', year: 1974 }, { title: 'Nine Tides at Carrow', year: 1981 }]);

  assert.equal(odyssey.status().beyond, 2);
  const commons = odyssey.commons();
  assert.equal(commons.total, 2);
  assert.deepEqual(commons.stars.map(star => [star.reading.slug, star.from, star.source, Boolean(star.facts)]).sort(), [
    ['nine-tides-at-carrow-1981', CHARTED.s, 'deepfield', false],
    ['the-lamp-of-saint-orrin-1974', CHARTED.s, 'deepfield', true],
  ]);
  assert.deepEqual(odyssey.commons({ since: commons.next }).stars, []);

  // A star from beyond the chart is a star like any other from now on.
  const arrival = await ask(odyssey, 'arrival', { star: 'the-lamp-of-saint-orrin-1974' });
  assert.equal(arrival.status, 'done');
  assert.ok(runner.calls.at(-1).content.includes('The Lamp of Saint Orrin'));
});

test('an arrival that points beyond the chart hands that star over whole', async () => {
  const lights = { S: 'story', F: 'feeling', I: 'image', D: 'idea', W: 'world', H: 'hands' };
  const runner = fakeRunner({
    deepfield: DEEP,
    // The two found films share a maker, so each is offered as a companion of the other.
    arrival: request => {
      const code = /^([SFIDWH]\d+)\. Nine Tides at Carrow \(1981\)/m.exec(request.content)?.[1];
      return {
        essence: 'A keeper and the lamp he will not put out.',
        rays: code ? [{ light: lights[code[0]], pick: code, claim: 'The same hand made both.', watch: '' }] : [],
        beyond: { title: '', year: 0, why: '' },
      };
    },
  });
  const odyssey = await createOdyssey({
    runner,
    verify: async film => (film.title === 'Nine Tides at Carrow' ? { poster: 'https://image.tmdb.org/t/p/w500/tides.jpg', imdb: 'tt0000002', runtime: 88 } : null),
  });
  await ask(odyssey, 'deepfield', { star: CHARTED.s, count: 2 });

  const arrival = await ask(odyssey, 'arrival', { star: 'the-lamp-of-saint-orrin-1974' });
  assert.equal(arrival.status, 'done');
  assert.deepEqual(arrival.result.rays.map(ray => ray.slug), ['nine-tides-at-carrow-1981']);
  // A browser that has never met the companion's star is given everything it needs to place it.
  assert.deepEqual(arrival.result.deep.map(item => [item.reading.slug, item.reading.title, item.reading.year, item.from, item.source]),
    [['nine-tides-at-carrow-1981', 'Nine Tides at Carrow', 1981, CHARTED.s, 'deepfield']]);
  assert.deepEqual(arrival.result.facts, { 'nine-tides-at-carrow-1981': { poster: 'https://image.tmdb.org/t/p/w500/tides.jpg', imdb: 'tt0000002', runtime: 88 } });

  // The same holds when the arrival is answered from the companion's own memory.
  const again = odyssey.start({ op: 'arrival', input: { star: 'the-lamp-of-saint-orrin-1974' } });
  assert.deepEqual(again.result.deep.map(item => item.reading.slug), ['nine-tides-at-carrow-1981']);
  assert.deepEqual(Object.keys(again.result.facts), ['nine-tides-at-carrow-1981']);
});

test('the same film found twice is one star, and a film the chart holds stays the chart\'s', async () => {
  const runner = fakeRunner({
    deepfield: { stars: [reading('The Lamp of Saint Orrin', 1974, { light: 'idea', claim: 'Found again.' }), reading(CHARTED.t, CHARTED.y, { light: 'story', claim: 'Already charted.' })] },
    chart: (request, call) => ({ star: reading(call === 2 ? OTHER.t : 'The Lamp of Saint Orrin', call === 2 ? OTHER.y : 1974), note: '' }),
  });
  const odyssey = await createOdyssey({ runner });
  const charted = await ask(odyssey, 'chart', { query: 'the lamp of saint orrin' });
  assert.equal(charted.result.star.slug, 'the-lamp-of-saint-orrin-1974');
  assert.equal(charted.result.note, '');
  const onChart = await ask(odyssey, 'chart', { query: OTHER.t });
  assert.equal(onChart.result.star.slug, OTHER.s);
  const deep = await ask(odyssey, 'deepfield', { star: OTHER.s });
  assert.deepEqual(deep.result.stars.map(star => star.slug), ['the-lamp-of-saint-orrin-1974', CHARTED.s]);
  assert.equal(odyssey.status().beyond, 1);
});

test('a film the Navigator does not know is not charted', async () => {
  const runner = fakeRunner({ chart: { star: reading('', 0), note: 'I do not know a film by that name.' } });
  const odyssey = await createOdyssey({ runner });
  const answer = await ask(odyssey, 'chart', { query: 'Qwrtz Plmn' });
  assert.deepEqual(answer.result, { star: null, note: 'I do not know a film by that name.', facts: {} });
  assert.equal(odyssey.status().beyond, 0);
  assert.ok(runner.calls[0].content.includes('Qwrtz Plmn'));
});

test('a course, a collision and a sky name their films by slug with their readings beside them', async () => {
  const runner = fakeRunner({
    course: {
      name: 'Slow water', heading: 'Three films that wait.',
      waypoints: [
        reading(OTHER.t, OTHER.y, { why: 'It answers the request most truly.', leg: '' }),
        reading('Nine Tides at Carrow', 1981, { why: 'The same wait, colder.', leg: 'From obsession to patience.' }),
        reading('The Lamp of Saint Orrin', 1974, { why: 'The quietest of the three.', leg: 'Further out to sea.' }),
      ],
    },
    collision: { star: reading('A Glass Meridian', 1968), fromA: 'Its longing.', fromB: 'Its vertigo.', spark: 'Both spiral.' },
    sky: { name: 'The patient eye', reading: 'You love films that wait.', blind: 'Nothing loud.', next: [reading('Salt Hours', 1990, { why: 'It waits longest.' })] },
  });
  const odyssey = await createOdyssey({ runner, verify: async () => ({ poster: 'https://image.tmdb.org/t/p/w500/any.jpg' }) });

  const course = await ask(odyssey, 'course', { request: 'something slow for a rainy Sunday', loved: [CHARTED.s], seen: [THIRD.s, 'a-star-only-this-browser-has-2001'] });
  assert.equal(course.status, 'done');
  assert.equal(course.result.name, 'Slow water');
  assert.deepEqual(course.result.waypoints.map(point => point.slug), [OTHER.s, 'nine-tides-at-carrow-1981', 'the-lamp-of-saint-orrin-1974']);
  assert.equal(course.result.waypoints[1].leg, 'From obsession to patience.');
  assert.deepEqual(Object.keys(course.result.facts).sort(), ['nine-tides-at-carrow-1981', 'the-lamp-of-saint-orrin-1974']);
  assert.ok(runner.calls[0].content.includes('something slow for a rainy Sunday'));
  assert.equal(runner.calls[0].effort, 'medium');

  const collision = await ask(odyssey, 'collision', { a: CHARTED.s, b: OTHER.s });
  assert.equal(collision.result.star.slug, 'a-glass-meridian-1968');
  assert.equal(collision.result.spark, 'Both spiral.');
  assert.equal(odyssey.commons().stars.find(star => star.reading.slug === 'a-glass-meridian-1968').from, CHARTED.s);

  const sky = await ask(odyssey, 'sky', { loved: [CHARTED.s, OTHER.s, THIRD.s] });
  assert.equal(sky.result.name, 'The patient eye');
  assert.deepEqual(sky.result.next.map(next => [next.slug, next.why]), [['salt-hours-1990', 'It waits longest.']]);
  assert.equal(odyssey.status().beyond, 4);
});

test('an answer that cannot be used is asked for once more, and a failure is told plainly', async () => {
  const flaky = fakeRunner({ arrival: (request, call) => (call === 1 ? 'I am sorry, here is some prose instead.' : ARRIVAL) });
  const recovered = await ask(await createOdyssey({ runner: flaky }), 'arrival', { star: CHARTED.s });
  assert.equal(recovered.status, 'done');
  assert.equal(flaky.calls.length, 2);

  const broken = fakeRunner({ arrival: 'not json at all' });
  assert.deepEqual(await ask(await createOdyssey({ runner: broken }), 'arrival', { star: CHARTED.s }),
    { status: 'failed', code: 'FAILED', error: 'The Navigator\'s answer did not come through. Try again.' });
  assert.equal(broken.calls.length, 2);

  const limited = fakeRunner({ arrival: engineError('CLAUDE_USAGE_LIMIT', 'internal words that are not passed on') });
  assert.deepEqual(await ask(await createOdyssey({ runner: limited }), 'arrival', { star: CHARTED.s }),
    { status: 'failed', code: 'CLAUDE_USAGE_LIMIT', error: 'The Claude plan behind this companion has reached its usage limit for now.' });
  assert.equal(limited.calls.length, 1);

  const empty = fakeRunner({ arrival: { essence: '', rays: [], beyond: { title: '', year: 0, why: '' } } });
  assert.equal((await ask(await createOdyssey({ runner: empty }), 'arrival', { star: CHARTED.s })).code, 'empty_reading');

  const secret = fakeRunner({ arrival: Object.assign(new Error('stack trace with a path /srv/secret'), { code: 'SOMETHING_INTERNAL' }) });
  assert.deepEqual(await ask(await createOdyssey({ runner: secret }), 'arrival', { star: CHARTED.s }),
    { status: 'failed', code: 'FAILED', error: 'The Navigator\'s answer did not come through. Try again.' });
});

test('a reading that takes too long is ended, and too many at once are turned away', async () => {
  const aborted = [];
  const slow = fakeRunner({
    arrival: request => new Promise((resolve, reject) => {
      request.signal.addEventListener('abort', () => { aborted.push(true); reject(new Error('aborted')); }, { once: true });
    }),
  });
  const hurried = await createOdyssey({ runner: slow, deadlines: { arrival: 30 } });
  assert.deepEqual(await ask(hurried, 'arrival', { star: CHARTED.s }),
    { status: 'failed', code: 'CLAUDE_TIMEOUT', error: 'The Navigator took too long to answer. Try again.' });
  assert.deepEqual(aborted, [true]);

  let release;
  const held = new Promise(resolve => { release = resolve; });
  const runner = fakeRunner({ arrival: async () => { await held; return ARRIVAL; } });
  const crowded = await createOdyssey({ runner, maxActive: 1, maxWaiting: 1 });
  const first = crowded.start({ op: 'arrival', input: { star: CHARTED.s } });
  const second = crowded.start({ op: 'arrival', input: { star: OTHER.s } });
  refused(() => crowded.start({ op: 'arrival', input: { star: THIRD.s } }), 'CLAUDE_UNAVAILABLE');
  assert.equal(runner.calls.length, 1); // the second waits its turn
  release();
  assert.equal((await settled(crowded, first.jobId)).status, 'done');
  assert.equal((await settled(crowded, second.jobId)).status, 'done');
  await crowded.whenIdle();
  assert.equal(runner.calls.length, 2);
});

test('the commons and the arrivals outlive a restart, and what is kept is checked again on the way back', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'afterimage-odyssey-'));
  try {
    const runner = fakeRunner({ deepfield: DEEP, arrival: ARRIVAL });
    const verify = async film => (film.title === 'The Lamp of Saint Orrin' ? { poster: 'https://image.tmdb.org/t/p/w500/lamp.jpg' } : null);
    const before = await createOdyssey({ runner, storeDirectory: directory, verify });
    await ask(before, 'deepfield', { star: CHARTED.s });
    const told = await ask(before, 'arrival', { star: 'nine-tides-at-carrow-1981' });
    await before.whenIdle();

    // A stop can cut the last line short, and anything can be written into a file.
    await appendFile(join(directory, 'odyssey-commons.jsonl'), '{"star":{"reading":{"title":"<script>alert(1)</script>","year":"soon"}}}\n{"star":{"reading":{"title":"Cut Sho');
    await appendFile(join(directory, 'odyssey-arrivals.jsonl'), '{"slug":"vertigo-1958","essence":"kept","rays":[{"light":"not-a-light","slug":"x","claim":"dropped"}]}\n{"slug":"../../etc","essence":"dropped"}\n');

    const silent = fakeRunner();
    const after = await createOdyssey({ runner: silent, storeDirectory: directory });
    assert.equal(after.status().beyond, 2);
    const commons = after.commons();
    assert.deepEqual(commons.stars.map(star => star.reading.slug), ['the-lamp-of-saint-orrin-1974', 'nine-tides-at-carrow-1981']);
    assert.deepEqual(commons.stars[0].facts, { poster: 'https://image.tmdb.org/t/p/w500/lamp.jpg' });
    assert.equal(commons.stars[0].from, CHARTED.s);

    // The arrival is answered from memory: no one is asked.
    const again = after.start({ op: 'arrival', input: { star: 'nine-tides-at-carrow-1981' } });
    assert.deepEqual(again.result.rays, told.result.rays);
    assert.deepEqual(after.start({ op: 'arrival', input: { star: 'vertigo-1958' } }).result, { essence: 'kept', beyond: null, rays: [], deep: [], facts: {} });
    assert.equal(silent.calls.length, 0);

    // The ledger was folded at start: one line a star, nothing torn.
    const lines = (await readFile(join(directory, 'odyssey-commons.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.deepEqual(lines.map(entry => entry.star.reading.title), ['The Lamp of Saint Orrin', 'Nine Tides at Carrow']);
    assert.equal(lines[0].star.checked, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a catalogue that cannot be reached is asked again another time, and never holds an answer back for long', async () => {
  let reachable = false;
  const asked = [];
  const runner = fakeRunner({ chart: { star: reading('Salt Hours', 1990), note: '' }, arrival: ARRIVAL });
  const odyssey = await createOdyssey({
    runner, lookupWaitMs: 20,
    verify: async film => {
      asked.push(film.title);
      if (!reachable) throw new Error('The catalogue is down.');
      return { poster: 'https://image.tmdb.org/t/p/w342/salt.jpg', imdb: 'javascript:alert(1)' };
    },
  });
  const first = await ask(odyssey, 'chart', { query: 'Salt Hours' });
  assert.deepEqual(first.result.facts, {});
  reachable = true;
  const second = await ask(odyssey, 'chart', { query: 'Salt Hours' });
  assert.deepEqual(second.result.facts, { 'salt-hours-1990': { poster: 'https://image.tmdb.org/t/p/w342/salt.jpg' } });
  await ask(odyssey, 'chart', { query: 'Salt Hours' });
  assert.deepEqual(asked, ['Salt Hours', 'Salt Hours']); // once the catalogue has answered, it is not asked again

  // A catalogue that never answers does not keep the voyager waiting.
  const stalled = await createOdyssey({ runner: fakeRunner({ chart: { star: reading('Salt Hours', 1990), note: '' } }), lookupWaitMs: 20, verify: () => new Promise(() => {}) });
  const began = Date.now();
  const answer = await ask(stalled, 'chart', { query: 'Salt Hours' });
  assert.equal(answer.result.star.slug, 'salt-hours-1990');
  assert.ok(Date.now() - began < 2000);
});
