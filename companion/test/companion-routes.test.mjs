import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import Anthropic from '@anthropic-ai/sdk';

import { ClaudeEngine } from '../lib/claude-engine.mjs';
import { createCompanionServer, createGenerationProtocol } from '../server.mjs';
import { answer, fakeClaude } from './fake-anthropic.mjs';
import { withServer } from './http-helpers.mjs';

// Imported from the site itself: the companion's job payloads must satisfy the
// same parsers the browser uses for the GPT bridge's payloads.
import { parseJobStart, parseJobStatus } from '../../app/lib/generation-state.ts';

const SECRET = 'test-secret';
const reel = {
  status: 'complete', sourceFilms: [], persona: 'Patient Longing', insight: 'Distance gives tenderness its shape.',
  palette: ['#101820', '#2b3a42', '#c8a97e', '#e8dcc8', '#7a3b2e'],
  sensibilities: ['patient framing', 'soft restraint', 'quiet voices'],
  spiritDirector: { name: 'Wim Wenders', reason: 'His frames let distance carry emotion.' },
  recommendations: ['The Green Ray', 'After Yang', 'Past Lives', 'The Rider', 'Still Walking'].map((title, index) => ({
    title, year: String(1986 + index * 7), timecode: `00:0${index}:12:00`,
    reason: `${title} keeps its people at a tender distance.`, watchFor: `Watch how ${title} holds its wide frames.`,
  })),
};

async function withCompanion(claude, run, engineOptions = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'afterimage-claude-'));
  try {
    const engine = new ClaudeEngine({ client: claude, ...engineOptions });
    const generationCoordinator = await createGenerationProtocol({ engine, directory });
    const server = createCompanionServer({ engine, generationCoordinator, secret: SECRET, log: () => {} });
    await withServer(server, (origin) => run({
      origin,
      coordinator: generationCoordinator,
      call: (path, { body, method = body === undefined ? 'GET' : 'POST', secret = SECRET } = {}) => fetch(origin + path, {
        method,
        headers: { authorization: 'Bearer ' + secret, 'content-type': 'application/json' },
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      }),
    }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('health is public; everything else needs the shared secret', async () => {
  await withCompanion(fakeClaude(), async ({ origin, call }) => {
    const health = await fetch(origin + '/health');
    assert.deepEqual(await health.json(), { ok: true, service: 'afterimage-claude-companion' });
    assert.equal((await call('/v1/auth/status', { secret: 'wrong' })).status, 401);
    assert.equal((await call('/v1/auth/status', { secret: '' })).status, 401);
    assert.equal((await call('/nowhere')).status, 404);
  });
});

test('status and connect describe Claude and report missing credentials without pretending', async () => {
  await withCompanion(fakeClaude(), async ({ call }) => {
    const status = await (await call('/v1/auth/status')).json();
    assert.deepEqual(status, {
      authenticated: true, planType: null, authMode: 'anthropic-api',
      generation: { provider: 'anthropic', model: 'claude-opus-5-5', reasoningEffort: 'high', engine: 'claude', fallbacks: 'default' },
    });
    assert.deepEqual(await (await call('/v1/auth/start', { method: 'POST' })).json(), { alreadyAuthenticated: true, planType: null });
  });

  const missing = fakeClaude([], { retrieve: async () => { throw new Error('Could not resolve authentication method.'); } });
  await withCompanion(missing, async ({ call }) => {
    const status = await (await call('/v1/auth/status')).json();
    assert.equal(status.authenticated, false);
    assert.equal(status.reason, 'missing');
    const connect = await call('/v1/auth/start', { method: 'POST' });
    assert.equal(connect.status, 503);
    assert.deepEqual(await connect.json(), {
      error: 'Claude is not connected. Set ANTHROPIC_API_KEY for the AFTERIMAGE companion and restart it.',
      code: 'CLAUDE_NOT_CONNECTED',
    });
  });

  const offline = fakeClaude([], { retrieve: async () => { throw new Anthropic.APIConnectionError({ message: 'offline' }); } });
  await withCompanion(offline, async ({ call }) => {
    const response = await call('/v1/auth/status');
    assert.equal(response.status, 502);
    assert.equal((await response.json()).code, 'CLAUDE_UNAVAILABLE');
  });
});

test('a reel job is accepted, developed by Claude and read back in the shape the site parses', async () => {
  const claude = fakeClaude([answer(reel)]);
  await withCompanion(claude, async ({ call, coordinator }) => {
    const accepted = await call('/v2/generations', { body: { films: [], creativeBrief: 'Tender distance.' } });
    assert.equal(accepted.status, 202);
    const start = parseJobStart(await accepted.json());
    await coordinator.whenIdle();
    const job = parseJobStatus(await (await call('/v2/generations/' + start.jobId)).json());
    assert.equal(job.status, 'complete');
    assert.equal(job.reel.persona, 'Patient Longing');
    assert.equal(job.reel.recommendations.length, 5);
    assert.match(claude.calls[0].params.messages[0].content, /"Tender distance\."/);
  });
});

test('a second start while Claude is still charting returns the resumable job', async () => {
  let release;
  let reached;
  const charting = new Promise((resolve) => { reached = resolve; });
  const claude = fakeClaude([() => new Promise((resolve) => { release = () => resolve(answer(reel)); reached(); })]);
  await withCompanion(claude, async ({ call, coordinator }) => {
    const first = await (await call('/v2/generations', { body: { films: [], creativeBrief: 'One.' } })).json();
    await charting;
    const conflict = await call('/v2/generations', { body: { films: [], creativeBrief: 'Two.' } });
    assert.equal(conflict.status, 409);
    assert.deepEqual(await conflict.json(), { error: 'A reel is already developing.', code: 'ACTIVE_GENERATION', jobId: first.jobId });
    const running = parseJobStatus(await (await call('/v2/generations/' + first.jobId)).json());
    assert.equal(running.status, 'running');
    release();
    await coordinator.whenIdle();
  });
});

test('failed jobs carry only prepared explanations, including rejected credentials', async () => {
  const headers = new Headers();
  const cases = [
    [new Anthropic.AuthenticationError(401, {}, 'invalid x-api-key', headers), 'AUTH_REQUIRED', /Claude is not connected/],
    [new Anthropic.RateLimitError(429, {}, 'slow down', headers), 'CLAUDE_UNAVAILABLE', /busy or unreachable/],
    [answer('', { stopReason: 'refusal' }), 'CLAUDE_DECLINED', /declined/],
    [answer('{"secret internal detail": ', { stopReason: 'max_tokens' }), 'GENERATION_FAILED', /could not develop this reel cleanly/],
  ];
  for (const [scripted, code, message] of cases) {
    await withCompanion(fakeClaude([scripted]), async ({ call, coordinator }) => {
      const { jobId } = await (await call('/v2/generations', { body: { films: [], creativeBrief: 'Anything.' } })).json();
      await coordinator.whenIdle();
      const job = parseJobStatus(await (await call('/v2/generations/' + jobId)).json());
      assert.equal(job.status, 'failed');
      assert.equal(job.error.code, code);
      assert.match(job.error.message, message);
      assert.doesNotMatch(job.error.message, /x-api-key|secret internal/);
    });
  }
});

test('malformed requests are refused before a job exists', async () => {
  const claude = fakeClaude([]);
  await withCompanion(claude, async ({ call }) => {
    const invalidJson = await call('/v2/generations', { body: '{"films":' });
    assert.equal(invalidJson.status, 400);
    assert.equal((await invalidJson.json()).error, 'Request body must be valid JSON.');
    const empty = await call('/v2/generations', { body: { films: [] } });
    assert.equal(empty.status, 400);
    assert.equal((await empty.json()).code, 'BAD_REQUEST');
    assert.equal((await call('/v2/generations/not-a-job')).status, 404);
    assert.equal((await call('/v2/atlas/generations', { body: { anchor: { title: '', year: '2000' }, request: {} } })).status, 400);
  });
  assert.equal(claude.calls.length, 0);
});
