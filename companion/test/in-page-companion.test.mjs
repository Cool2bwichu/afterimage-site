import assert from 'node:assert/strict';
import test from 'node:test';

import { ATLAS_SYSTEM, REEL_SYSTEM, REPLACEMENT_SYSTEM } from '../lib/prompts.mjs';
import { createInPageCompanion } from '../lib/in-page-companion.mjs';
import { toStructuredSchema } from '../lib/structured-output.mjs';
import { AFTERIMAGE_SCHEMA_V2 } from '../lib/v2-contract.mjs';

import { parseJobStart, parseJobStatus } from '../../app/lib/generation-state.ts';

const request = { films: ['Paris, Texas', 'In the Mood for Love'], creativeBrief: 'Tender distance, no horror.', excludedFilms: [{ title: 'Cure', year: '1997' }] };
const reel = (titles = ['The Green Ray', 'After Yang', 'Past Lives', 'The Rider', 'Still Walking']) => ({
  status: 'complete', sourceFilms: [], persona: 'Patient Longing', insight: 'Distance gives tenderness its shape.',
  palette: ['#101820', '#2b3a42', '#c8a97e', '#e8dcc8', '#7a3b2e'],
  sensibilities: ['patient framing', 'soft restraint', 'quiet voices'],
  spiritDirector: { name: 'Wim Wenders', reason: 'His frames let distance carry emotion.' },
  recommendations: titles.map((title, index) => ({
    title, year: String(1986 + index * 7), timecode: `00:0${index}:12:00`,
    reason: `${title} keeps its people at a tender distance.`, watchFor: `Watch how ${title} holds its wide frames.`,
  })),
});
const channels = ['whereItLives', 'howItFeels', 'howItLooks', 'howItSpeaks'];
const atlasFilm = (title, year) => ({ title, year, summary: 'A film-specific summary.', watchFor: 'Watch the frame.', facets: Object.fromEntries(channels.map(key => [key, { label: key, explanation: 'A specific quality.', traits: [key.toLowerCase()] }])) });
const atlasAnswer = (anchor) => ({
  kind: 'atlas-v1', thesis: 'A connective idea.', anchor: atlasFilm(anchor.title, anchor.year),
  neighbors: ['Late Spring', 'Brief Encounter', 'The Lunchbox', 'Columbus', 'Her', 'Past Lives', 'Aftersun', 'Certified Copy'].map((title, i) => ({
    ...atlasFilm(title, String(1945 + i)), label: 'Shared restraint', shared: 'Evidence in both films.', difference: 'Different formal choices.', whyHere: 'The requested restraint.',
    lenses: Object.fromEntries(channels.map(key => [key, { affinity: 'echo', evidence: 'A concrete comparison.' }])),
  })),
});

// A stand-in for the Artifact's `sample` capability: answers are scripted, and
// a scripted object with a `code` rejects the way `sample` does.
function fakeSample(answers) {
  const calls = [];
  const sample = async () => { throw new Error('the companion asks for JSON'); };
  sample.json = async (input, options) => {
    calls.push({ input, options });
    const next = answers.shift();
    if (next === undefined) throw new Error('No scripted answer left.');
    if (next && typeof next === 'object' && 'code' in next && 'message' in next) throw next;
    return structuredClone(next);
  };
  return { sample, calls };
}

let counter = 0;
function companion(sample, options = {}) {
  return createInPageCompanion({
    getSample: async () => sample,
    idFactory: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
    ...options,
  });
}

const post = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('inside claude.ai the page reports Claude as connected, without a companion', async () => {
  const { sample } = fakeSample([]);
  const handle = companion(sample);
  const status = await (await handle('/api/status', { cache: 'no-store' })).json();
  assert.equal(status.authenticated, true);
  assert.equal(status.generation.engine, 'claude');
  assert.equal(status.generation.model, null);
  assert.deepEqual(await (await handle('/api/connect', { method: 'POST' })).json(), { alreadyAuthenticated: true, planType: null });
});

test('outside claude.ai the page says where to open it instead of pretending to connect', async () => {
  const handle = createInPageCompanion({ getSample: async () => null });
  const status = await (await handle('/api/status')).json();
  assert.equal(status.authenticated, false);
  const connect = await handle('/api/connect', { method: 'POST' });
  assert.equal(connect.status, 503);
  const payload = await connect.json();
  assert.equal(payload.code, 'CLAUDE_NOT_CONNECTED');
  assert.match(payload.error, /Open it from your Artifacts in claude\.ai/);
});

test('a reel is developed by Claude with the companion\'s brief and schema, in the job shape the site parses', async () => {
  const { sample, calls } = fakeSample([reel()]);
  const handle = companion(sample);
  const accepted = await handle('/api/generations', post(request));
  assert.equal(accepted.status, 202);
  const { jobId } = parseJobStart(await accepted.json());
  await handle.whenIdle();
  const job = parseJobStatus(await (await handle('/api/generations/' + jobId)).json());
  assert.equal(job.status, 'complete');
  assert.equal(job.reel.persona, 'Patient Longing');
  assert.equal(job.reel.recommendations.length, 5);

  assert.equal(calls.length, 1);
  const { onText, ...options } = calls[0].options;
  assert.deepEqual(options, { modelTier: 'complex', cache: false });
  assert.equal(typeof onText, 'function');
  assert.ok(calls[0].input.startsWith(REEL_SYSTEM));
  assert.ok(calls[0].input.includes('Paris, Texas'));
  assert.ok(calls[0].input.includes(JSON.stringify(toStructuredSchema(AFTERIMAGE_SCHEMA_V2))));
  assert.equal((await handle('/api/generations/00000000-0000-4000-8000-999999999999')).status, 404);
});

test('a reel develops on screen while Claude writes it, and the finished reel replaces the draft', async () => {
  let release;
  const { sample, calls } = fakeSample([]);
  const answer = JSON.stringify(reel());
  sample.json = (input, options) => {
    calls.push({ input, options });
    return new Promise((resolve) => {
      release = (upTo) => {
        options.onText({ text: answer.slice(0, upTo), delta: '' });
        if (upTo >= answer.length) resolve(JSON.parse(answer));
      };
    });
  };
  let clock = 0;
  const handle = companion(sample, { now: () => clock });
  const { jobId } = await (await handle('/api/generations', post(request))).json();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const status = async () => parseJobStatus(await (await handle('/api/generations/' + jobId)).json());
  assert.equal((await status()).draft, undefined);

  // Up to the third film's title and year: persona, palette and two finished films.
  release(answer.indexOf('"Past Lives"') + '"Past Lives","year":"2000"'.length);
  const developing = await status();
  assert.equal(developing.status, 'running');
  assert.equal(developing.draft.take, 1);
  assert.equal(developing.draft.persona, 'Patient Longing');
  assert.equal(developing.draft.palette.length, 5);
  assert.deepEqual(developing.draft.recommendations.map(film => film.title), ['The Green Ray', 'After Yang', 'Past Lives']);
  assert.equal(developing.draft.recommendations[2].reason, undefined, 'an unfinished reason is not shown');

  clock += 1000;
  release(answer.length);
  await handle.whenIdle();
  const finished = await (await handle('/api/generations/' + jobId)).json();
  assert.equal(finished.status, 'complete');
  assert.equal('draft' in finished, false);
});

test('an answer that breaks a rule gets one more attempt, with the reason', async () => {
  const excluded = reel(['Cure', 'After Yang', 'Past Lives', 'The Rider', 'Still Walking']);
  excluded.recommendations[0].year = '1997';
  const { sample, calls } = fakeSample([excluded, reel()]);
  const handle = companion(sample);
  const { jobId } = await (await handle('/api/generations', post(request))).json();
  await handle.whenIdle();
  assert.equal((await (await handle('/api/generations/' + jobId)).json()).status, 'complete');
  assert.equal(calls.length, 2);
  assert.match(calls[1].input, /previous_answer_rejected/);
});

test('Claude\'s refusals and limits become prepared explanations, never raw errors', async () => {
  for (const [code, expected] of [['not_granted', 'CLAUDE_NOT_ALLOWED'], ['rate_limited', 'CLAUDE_USAGE_LIMIT'], ['refused', 'CLAUDE_DECLINED'], ['upstream_error', 'CLAUDE_UNAVAILABLE'], ['session_expired', 'AUTH_REQUIRED'], ['prompt_too_large', 'GENERATION_FAILED']]) {
    const { sample, calls } = fakeSample([{ code, message: 'internal detail' }]);
    const handle = companion(sample);
    const { jobId } = await (await handle('/api/generations', post(request))).json();
    await handle.whenIdle();
    const job = parseJobStatus(await (await handle('/api/generations/' + jobId)).json());
    assert.equal(job.status, 'failed');
    assert.equal(job.error.code, expected);
    assert.doesNotMatch(job.error.message, /internal detail/);
    assert.equal(calls.length, 1, code + ' is not retried');
  }

  const { sample } = fakeSample([{ code: 'invalid_json', message: 'cut short' }, { code: 'invalid_json', message: 'cut short' }]);
  const handle = companion(sample);
  const { jobId } = await (await handle('/api/generations', post(request))).json();
  await handle.whenIdle();
  assert.equal((await (await handle('/api/generations/' + jobId)).json()).error.code, 'GENERATION_FAILED');
});

test('one reel develops at a time, and malformed requests are refused before Claude is asked', async () => {
  let release;
  const { sample, calls } = fakeSample([]);
  sample.json = (input) => { calls.push({ input }); return new Promise((resolve) => { release = () => resolve(reel()); }); };
  const handle = companion(sample);
  const first = await (await handle('/api/generations', post(request))).json();
  const second = await handle('/api/generations', post(request));
  assert.equal(second.status, 409);
  assert.deepEqual(await second.json(), { error: 'A reel is already developing.', code: 'ACTIVE_GENERATION', jobId: first.jobId, kind: 'reel' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  release();
  await handle.whenIdle();

  assert.equal((await handle('/api/generations', post({ films: 'not a list' }))).status, 400);
  assert.equal((await handle('/api/generations', { method: 'POST', body: '{' })).status, 400);
  assert.equal(calls.length, 1);
});

test('an Atlas keeps six neighbours that pass the content rules, without catalogue identities', async () => {
  const anchor = { title: 'In the Mood for Love', year: '2000' };
  const { sample, calls } = fakeSample([atlasAnswer(anchor)]);
  const handle = companion(sample);
  const { jobId } = await (await handle('/api/atlas/generations', post({ anchor, request }))).json();
  await handle.whenIdle();
  const job = await (await handle('/api/generations/' + jobId)).json();
  assert.equal(job.status, 'complete');
  assert.equal(job.reel.neighbors.length, 6);
  assert.equal(job.reel.anchor.tmdbId, undefined);
  assert.ok(job.reel.neighbors.every((film) => film.tmdbId === undefined));
  assert.ok(calls[0].input.startsWith(ATLAS_SYSTEM));
});

test('a replacement swaps one film and keeps the rest of the reel', async () => {
  const current = { ...reel(), sourceFilms: [...request.films] };
  const replacement = { recommendation: { title: 'The Lunchbox', year: '2013', timecode: '00:01:12:00', reason: 'Small acts of care carry longing across a city.', watchFor: 'Notice the pace of the exchanged notes.' } };
  const { sample, calls } = fakeSample([replacement]);
  const handle = companion(sample);
  const { jobId } = await (await handle('/api/replacements/generations', post({ request, reel: current, replaceIndex: 1 }))).json();
  await handle.whenIdle();
  const job = await (await handle('/api/generations/' + jobId)).json();
  assert.equal(job.status, 'complete');
  assert.equal(job.reel.recommendations[1].title, 'The Lunchbox');
  assert.equal(job.reel.recommendations[0].title, 'The Green Ray');
  assert.ok(calls[0].input.startsWith(REPLACEMENT_SYSTEM));
});

test('film search and film details say plainly that the catalogue is out of reach', async () => {
  const { sample, calls } = fakeSample([]);
  const handle = companion(sample);
  for (const [path, init] of [['/api/films/search?q=late%20spring', {}], ['/api/films/enrich', post({ films: [{ title: 'Cure', year: '1997' }] })]]) {
    const response = await handle(path, init);
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.equal(payload.code, 'METADATA_NOT_CONFIGURED');
    assert.match(payload.error, /TMDB catalogue/);
  }
  assert.equal(calls.length, 0);
});
