import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ATLAS_CANDIDATE_SCHEMA, validateAtlasInput, normalizeAtlasResult, verifyAtlas } from '../lib/atlas-contract.mjs';
import { ClaudeEngine } from '../lib/claude-engine.mjs';
import { ATLAS_SYSTEM, buildAtlasPrompt } from '../lib/prompts.mjs';
import { extractJson, toStructuredSchema } from '../lib/structured-output.mjs';
import { createCompanionServer, createGenerationProtocol } from '../server.mjs';
import { answer, fakeClaude } from './fake-anthropic.mjs';
import { withServer } from './http-helpers.mjs';

const channels = ['whereItLives', 'howItFeels', 'howItLooks', 'howItSpeaks'];
const input = { anchor: { title: 'In the Mood for Love', year: '2000' }, request: { films: ['In the Mood for Love'], creativeBrief: 'Unspoken longing' } };
function fixture() {
  const film = (title, year) => ({ title, year, summary: 'A film-specific summary.', watchFor: 'Watch the frame.', facets: Object.fromEntries(channels.map(key => [key, { label: key, explanation: 'A specific quality.', traits: [key.toLowerCase()] }])) });
  return { kind: 'atlas-v1', thesis: 'A connective idea.', anchor: film(input.anchor.title, input.anchor.year), neighbors: ['Late Spring', 'Brief Encounter', 'The Lunchbox', 'Columbus', 'Her', 'Past Lives'].map((title, i) => ({ ...film(title, String(1945 + i)), label: 'Shared restraint', shared: 'Evidence in both films.', difference: 'Different formal choices.', whyHere: 'The requested restraint.', lenses: Object.fromEntries(channels.map(key => [key, { affinity: 'echo', evidence: 'A concrete comparison.' }])) })) };
}
test('Atlas retains the full request and rejects malformed anchors', () => {
  const raw = { ...input, request: { ...input.request, likedFilms: [{ title: 'Drive', year: '2011' }] } };
  assert.deepEqual(validateAtlasInput(raw), raw);
  for (const anchor of [null, [], { title: '', year: '2000' }, { title: 'Film', year: 'abcd' }]) assert.throws(() => validateAtlasInput({ ...input, anchor }));
  assert.throws(() => validateAtlasInput({ ...input, operation: 'override' }));
  assert.equal(validateAtlasInput({ ...input, anchor: { ...input.anchor, tmdbId: 843 } }).anchor.tmdbId, 843);
  assert.throws(() => validateAtlasInput({ ...input, anchor: { ...input.anchor, tmdbId: -1 } }));
});
test('Atlas rejects duplicates, wrong anchors, exclusions, seen films and incomplete comparisons', () => {
  assert.deepEqual(normalizeAtlasResult(fixture(), input), fixture());
  for (const mutate of [value => { value.anchor.year = '2001'; }, value => { value.neighbors[1] = value.neighbors[0]; }, value => { delete value.neighbors[0].lenses.howItLooks; }, value => { value.neighbors[0].lenses.howItFeels.affinity = '95%'; }]) {
    const value = fixture(); mutate(value); assert.throws(() => normalizeAtlasResult(value, input));
  }
  const excluded = { title: fixture().neighbors[0].title, year: fixture().neighbors[0].year };
  for (const key of ['excludedFilms', 'likedFilms']) assert.throws(() => normalizeAtlasResult(fixture(), { ...input, request: { ...input.request, [key]: [excluded] } }));
});
test('every Atlas identity must match a unique verified movie', async () => {
  const atlas = fixture();
  const records = [atlas.anchor, ...atlas.neighbors].map((film, i) => ({ requestedTitle: film.title, requestedYear: film.year, status: 'matched', tmdbId: i + 1 }));
  const resolved = await verifyAtlas(atlas, async () => records);
  assert.equal(resolved.anchor.tmdbId, 1);
  assert.deepEqual(resolved.neighbors.map(film => film.tmdbId), [2, 3, 4, 5, 6, 7]);
  for (const mutate of [items => { items[3].status = 'unmatched'; }, items => { items[2].tmdbId = items[1].tmdbId; }, items => { items[1].requestedYear = '2026'; }]) {
    const items = structuredClone(records); mutate(items); await assert.rejects(() => verifyAtlas(atlas, async () => items));
  }
});
test('Atlas prompt keeps the request authoritative and Likes subordinate', () => {
  const prompt = buildAtlasPrompt({ ...input, request: { ...input.request, likedFilms: [{ title: 'Drive', year: '2011' }] } });
  assert.match(ATLAS_SYSTEM, /remain authoritative/);
  assert.match(ATLAS_SYSTEM, /never calibrated ratings/);
  assert.match(prompt, /<background_taste>[\s\S]*subordinate/);
  assert.match(prompt, /<anchor>\n\{"title":"In the Mood for Love","year":"2000"\}/);
  // Likes travel once, in the background taste block.
  assert.equal(prompt.match(/"Drive"/g).length, 1);
});
test('a bounded candidate pool replaces ambiguous catalogue matches without changing order', async () => {
  const atlas = fixture();
  atlas.neighbors.push({ ...atlas.neighbors[0], title: 'Additional film one' }, { ...atlas.neighbors[0], title: 'Additional film two' });
  const inputPool = normalizeAtlasResult(atlas, input, true);
  const records = [atlas.anchor, ...atlas.neighbors].map((film, i) => ({ requestedTitle: film.title, requestedYear: film.year, status: i === 3 || i === 4 ? 'unmatched' : 'matched', tmdbId: i + 1 }));
  const verified = await verifyAtlas(inputPool, async () => records);
  assert.equal(verified.neighbors.length, 6);
  assert.deepEqual(verified.neighbors.map(film => film.title), atlas.neighbors.filter((_, i) => i !== 2 && i !== 3).map(film => film.title));
});
test('temporary catalogue failure retries verification without a new model generation', async () => {
  const atlas = fixture(); let calls = 0;
  const provider = async films => {
    calls++;
    return films.map((film, i) => ({ requestedTitle: film.title, requestedYear: film.year, status: calls === 1 ? 'unavailable' : 'matched', tmdbId: i + 1 }));
  };
  assert.equal((await verifyAtlas(atlas, provider)).anchor.tmdbId, 1);
  assert.equal(calls, 2);
});
test('Atlas selected anchor ID is sent to verification and a mismatched catalog record is rejected', async () => {
  const atlas = fixture();
  const selected = { ...input, anchor: { ...input.anchor, tmdbId: 843 } };
  let requested;
  const provider = async films => {
    requested = films;
    return films.map((film, index) => ({ requestedTitle: film.title, requestedYear: film.year, status: 'matched', tmdbId: index === 0 ? 999 : index + 1 }));
  };
  await assert.rejects(() => verifyAtlas(atlas, provider, selected), /catalog identity mismatch/i);
  assert.equal(requested[0].tmdbId, 843);
});
test('full Atlas responses can exceed the ordinary reel bound while remaining schema bounded', async () => {
  const atlas = fixture();
  atlas.neighbors.push({ ...structuredClone(atlas.neighbors[0]), title: 'Additional film one' }, { ...structuredClone(atlas.neighbors[0]), title: 'Additional film two' });
  for (const film of [atlas.anchor, ...atlas.neighbors]) for (const facet of Object.values(film.facets)) {
    facet.explanation = 'An observable detail. '.repeat(13).trim();
    facet.traits = Array.from({ length: 6 }, (_, i) => `Specific trait ${i} ` + 'a'.repeat(40));
  }
  const output = JSON.stringify(atlas, null, 2);
  assert.ok(output.length > 20000);
  assert.throws(() => extractJson(output));
  assert.throws(() => extractJson('x'.repeat(90001), 90000));
  const claude = fakeClaude([answer(output)]);
  const engine = new ClaudeEngine({ client: claude, model: 'claude-opus-5-5', effort: 'high',
    metadataProvider: async films => films.map((film, i) => ({ requestedTitle: film.title, requestedYear: film.year, status: 'matched', tmdbId: i + 1 })) });
  const result = await engine.generateAtlas(input);
  assert.equal(result.neighbors.length, 6);
  assert.equal(result.anchor.title, input.anchor.title);
  assert.equal(claude.calls.length, 1);
  const { params } = claude.calls[0];
  assert.equal(params.model, 'claude-opus-5-5');
  assert.equal(params.output_config.effort, 'high');
  assert.deepEqual(params.output_config.format.schema, toStructuredSchema(ATLAS_CANDIDATE_SCHEMA));
  assert.equal(params.system[0].text, ATLAS_SYSTEM);
});
test('Atlas HTTP route authenticates and dispatches separately through the job coordinator', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'afterimage-atlas-'));
  const calls = [];
  const engine = { generateAtlas: async request => { calls.push(['atlas', request]); return fixture(); }, generateReel: async request => { calls.push(['reel', request]); return { kind: 'reel-test' }; } };
  try {
    const coordinator = await createGenerationProtocol({ engine, directory });
    await withServer(createCompanionServer({ engine, secret: 'test-secret', generationCoordinator: coordinator }), async origin => {
      const post = headers => fetch(origin + '/v2/atlas/generations', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(input) });
      assert.equal((await post({})).status, 401);
      const response = await post({ authorization: 'Bearer test-secret' });
      assert.equal(response.status, 202);
      const job = await response.json();
      await coordinator.whenIdle();
      assert.equal(coordinator.get(job.jobId).reel.kind, 'atlas-v1');
      assert.deepEqual(calls, [['atlas', validateAtlasInput(input)]]);
      await coordinator.start(validateAtlasInput(input).request);
      await coordinator.whenIdle();
      assert.equal(calls[1][0], 'reel');
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
