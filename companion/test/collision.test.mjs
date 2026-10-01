import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ClaudeEngine, cappedEffort } from '../lib/claude-engine.mjs';
import { COLLISION_SCHEMA, normalizeCollision, validateCollisionInput, verifyCollision } from '../lib/collision-contract.mjs';
import { createInPageCompanion } from '../lib/in-page-companion.mjs';
import { COLLISION_SYSTEM } from '../lib/prompts.mjs';
import { toStructuredSchema } from '../lib/structured-output.mjs';
import { createCompanionServer, createGenerationProtocol } from '../server.mjs';
import { answer, fakeClaude } from './fake-anthropic.mjs';
import { withServer } from './http-helpers.mjs';

import { parseJobStart, parseJobStatus } from '../../app/lib/generation-state.ts';

const request = {
  films: [{ title: 'Paris, Texas', year: '1984', tmdbId: 655 }, { title: 'In the Mood for Love', year: '2000' }],
  excludedFilms: [{ title: 'Cure', year: '1997' }],
  likedFilms: [{ title: 'Drive', year: '2011' }],
};
const between = (title = 'Happy Together', year = '1997') => ({
  film: {
    title, year,
    reason: 'A love story told in exile, all longing and distance.',
    fromFirst: 'From Paris, Texas: a man adrift far from home, and a reunion that cannot hold.',
    fromSecond: 'From In the Mood for Love: Wong Kar-wai’s colour and the ache of not quite touching.',
    watchFor: 'Watch how the Iguazu Falls return as a promise neither man keeps.',
  },
});
const matched = async (films) => films.map((film, index) => ({ requestedTitle: film.title, requestedYear: film.year, status: 'matched', tmdbId: 900 + index }));

test('a collision takes exactly two different films, with optional exclusions, Likes and mood', () => {
  assert.deepEqual(validateCollisionInput(request), request);
  assert.deepEqual(validateCollisionInput({ films: request.films, creativeBrief: '  Something tender.  ' }).creativeBrief, 'Something tender.');
  for (const bad of [
    null, {}, { films: [] }, { films: [request.films[0]] }, { films: [...request.films, request.films[0]] },
    { films: [request.films[0], { ...request.films[0], tmdbId: 1 }] },
    { films: [request.films[0], { title: 'Yi Yi', year: '00' }] },
    { films: [request.films[0], { title: 'Yi Yi', year: '2000', director: 'Edward Yang' }] },
    { films: request.films, extra: true },
    { films: request.films, creativeBrief: 'x'.repeat(1201) },
  ]) {
    assert.throws(() => validateCollisionInput(bad), (error) => error.code === 'BAD_REQUEST');
  }
});

test('the film between them may not be either film, an excluded film or a liked one', () => {
  const input = validateCollisionInput(request);
  const result = normalizeCollision(between(), input);
  assert.equal(result.kind, 'collision-v1');
  assert.deepEqual(result.films, [{ title: 'Paris, Texas', year: '1984', tmdbId: 655 }, { title: 'In the Mood for Love', year: '2000' }]);
  assert.equal(result.film.title, 'Happy Together');
  for (const [title, year, reason] of [['Paris, Texas', '1984', /collided/], ['in the mood for love', '2000', /collided/], ['Cure', '1997', /not interested/], ['Drive', '2011', /liked/]]) {
    assert.throws(() => normalizeCollision(between(title, year), input), reason);
  }
  assert.throws(() => normalizeCollision({ film: between().film, extra: 1 }, input), /exactly one film/);
  const withReel = validateCollisionInput({ ...request, reelFilms: [{ title: 'Happy Together', year: '1997' }] });
  assert.throws(() => normalizeCollision(between(), withReel), /already in the viewer's reel/);
  assert.throws(() => validateCollisionInput({ ...request, reelFilms: Array.from({ length: 11 }, (_, index) => ({ title: `Film ${index}`, year: '2000' })) }), (error) => error.code === 'BAD_REQUEST');
  assert.throws(() => normalizeCollision({ film: { ...between().film, year: '97' } }, input), /release year/);
  assert.throws(() => normalizeCollision({ film: { ...between().film, reason: 'x'.repeat(401) } }, input), /too long/);
});

test('the catalogue must find the new film, and it must not be one of the two', async () => {
  const input = validateCollisionInput(request);
  const collision = normalizeCollision(between(), input);
  const verified = await verifyCollision(collision, matched);
  assert.equal(verified.film.tmdbId, 900);
  await assert.rejects(verifyCollision(collision, async (films) => films.map((film) => ({ requestedTitle: film.title, requestedYear: film.year, status: 'unmatched' }))), /could not be found/);
  await assert.rejects(verifyCollision(collision, async (films) => films.map((film) => ({ requestedTitle: film.title, requestedYear: film.year, status: 'matched', tmdbId: 655 }))), /one of the two/);
  await assert.rejects(verifyCollision(collision, async () => []), /could not be verified/);
});

test('a collision asks Claude with its own brief and schema, at medium effort at most', async () => {
  assert.equal(cappedEffort('high', 'medium'), 'medium');
  assert.equal(cappedEffort('low', 'medium'), 'low');
  const claude = fakeClaude([answer(between('Paris, Texas', '1984')), answer(between())]);
  const logged = [];
  const engine = new ClaudeEngine({ client: claude, metadataProvider: matched, log: (entry) => logged.push(entry) });
  const drafts = [];
  const result = await engine.generateCollision(request, { onDraft: (draft) => drafts.push(draft) });
  assert.equal(result.film.title, 'Happy Together');
  assert.equal(claude.calls.length, 2, 'an answer repeating a collided film gets one more attempt');
  const params = claude.calls[0].params;
  assert.equal(params.system[0].text, COLLISION_SYSTEM);
  assert.deepEqual(params.output_config.format.schema, toStructuredSchema(COLLISION_SCHEMA));
  assert.equal(params.output_config.effort, 'medium');
  const prompt = params.messages[0].content;
  assert.match(prompt, /<first_film>\n\{"title":"Paris, Texas","year":"1984"\}/);
  assert.match(prompt, /<second_film>\n\{"title":"In the Mood for Love","year":"2000"\}/);
  assert.match(prompt, /<not_interested>\n\[\{"title":"Cure","year":"1997"\}\]/);
  assert.doesNotMatch(prompt, /already_in_the_viewers_reel/, 'no reel, no reel block');
  assert.match(prompt, /<background_taste>/);
  assert.match(claude.calls[1].params.messages[0].content, /Paris, Texas is one of the two collided films/);
  assert.deepEqual(drafts, [{ take: 2 }]);
});

test('collisions need the film catalogue on the companion, as replacements do', async () => {
  const engine = new ClaudeEngine({ client: fakeClaude([]), filmMetadataUrl: '' });
  await assert.rejects(engine.generateCollision(request), (error) => error.code === 'METADATA_NOT_CONFIGURED');
});

test('the companion runs a collision as a job in the shape the site polls', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'afterimage-collision-'));
  try {
    const engine = new ClaudeEngine({ client: fakeClaude([answer(between())]), metadataProvider: matched });
    const generationCoordinator = await createGenerationProtocol({ engine, directory });
    const server = createCompanionServer({ engine, generationCoordinator, secret: 'test-secret', passphrase: 'a-long-test-passphrase', log: () => {} });
    await withServer(server, async (origin) => {
      const call = (path, body, secret = 'test-secret') => fetch(origin + path, { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer ' + secret, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      assert.equal((await call('/v2/collisions/generations', { films: [request.films[0]] })).status, 400);
      const started = parseJobStart(await (await call('/v2/collisions/generations', request)).json());
      await generationCoordinator.whenIdle();
      const job = await (await call('/v2/generations/' + started.jobId)).json();
      assert.equal(job.status, 'complete');
      assert.equal(job.reel.kind, 'collision-v1');
      assert.equal(job.reel.film.title, 'Happy Together');
      // The site's own job parser accepts the running and failed shapes; a finished
      // collision is read by the collision parser instead.
      assert.equal(parseJobStatus({ ...job, status: 'running', reel: undefined }).status, 'running');
      const browser = await call('/api/collisions/generations', request, 'a-long-test-passphrase');
      assert.equal(browser.status, 202);
      await generationCoordinator.whenIdle();
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('inside claude.ai a collision follows the content rules without the catalogue', async () => {
  const calls = [];
  const sample = async () => { throw new Error('unused'); };
  sample.json = async (input, options) => { calls.push({ input, options }); return between(); };
  const handle = createInPageCompanion({ getSample: async () => sample, idFactory: () => '00000000-0000-4000-8000-0000000000c1' });
  const accepted = await handle('/api/collisions/generations', { method: 'POST', body: JSON.stringify(request) });
  assert.equal(accepted.status, 202);
  await handle.whenIdle();
  const job = await (await handle('/api/generations/00000000-0000-4000-8000-0000000000c1')).json();
  assert.equal(job.status, 'complete');
  assert.equal(job.reel.film.title, 'Happy Together');
  assert.ok(calls[0].input.startsWith(COLLISION_SYSTEM));
  assert.equal((await handle('/api/collisions/generations', { method: 'POST', body: JSON.stringify({ films: [] }) })).status, 400);
});
