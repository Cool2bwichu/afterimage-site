import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JOB_RETENTION_MS, JobStore } from '../lib/job-store.mjs';

const JOB_ID = '6e70979a-b9d3-4f9a-a67c-3d42f46e356c';
const ACTIVE_JOB_ID = 'a4b8c21d-1b0f-47cb-8dbc-f35f118b09a6';
async function fixture({ idFactory = () => JOB_ID } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'afterimage-jobs-'));
  let currentTime = Date.parse('2026-08-31T12:00:00.000Z');
  const now = () => currentTime;
  const store = new JobStore({ directory, now, idFactory });
  await store.initialize();
  return { directory, store, now, advance: (ms) => { currentTime += ms; } };
}

test('persists queued, running, and complete transitions atomically', async () => {
  const { directory, store } = await fixture();
  const queued = await store.create();
  assert.equal(queued.status, 'queued');
  await store.markRunning(JOB_ID);
  await store.complete(JOB_ID, { status: 'complete', recommendations: [] });
  const saved = JSON.parse(await readFile(join(directory, JOB_ID + '.json'), 'utf8'));
  assert.equal(saved.status, 'complete');
  assert.equal(saved.id, JOB_ID);
  assert.equal(Object.hasOwn(saved, 'input'), false);
  assert.equal(Object.hasOwn(saved, 'prompt'), false);
});

test('public projection exposes only protocol fields', async () => {
  const { store } = await fixture();
  const job = await store.create();
  assert.deepEqual(Object.keys(store.toPublic(job)).sort(), ['createdAt', 'jobId', 'status', 'updatedAt']);
});

test('a running job shows its draft in memory only, and finishing removes it', async () => {
  const { directory, store } = await fixture();
  const job = await store.create();
  assert.equal(store.setDraft(JOB_ID, { take: 1, persona: 'Early' }), false, 'a queued job has no draft yet');
  await store.markRunning(JOB_ID);
  assert.equal(store.setDraft(JOB_ID, { take: 1, persona: 'Patient Longing' }), true);
  assert.deepEqual(store.toPublic(store.get(JOB_ID)).draft, { take: 1, persona: 'Patient Longing' });
  const saved = JSON.parse(await readFile(join(directory, JOB_ID + '.json'), 'utf8'));
  assert.equal('draft' in saved, false, 'a draft is never written to disk');
  await store.complete(JOB_ID, { status: 'complete', recommendations: [] });
  assert.equal('draft' in store.toPublic(store.get(JOB_ID)), false);
  assert.equal(store.setDraft(JOB_ID, { take: 1 }), false);
  assert.equal(store.setDraft(job.id.replace('6e', '7e'), { take: 1 }), false);
});

test('restores terminal jobs across restart', async () => {
  const { directory, store, now } = await fixture();
  await store.create(); await store.complete(JOB_ID, { status: 'complete', recommendations: [] });
  const second = new JobStore({ directory, now }); await second.initialize();
  assert.equal(second.get(JOB_ID).status, 'complete');
  assert.deepEqual(second.get(JOB_ID).reel, { status: 'complete', recommendations: [] });
});

test('marks interrupted jobs failed across restart', async () => {
  const { directory, store, now } = await fixture();
  await store.create();
  const second = new JobStore({ directory, now }); await second.initialize();
  assert.equal(second.get(JOB_ID).status, 'failed');
  assert.deepEqual(second.get(JOB_ID).error, {
    code: 'INTERRUPTED',
    message: 'The private reel service restarted before this reel finished. Your inputs are still saved; start it again.',
  });
});

test('lookup hides expired terminal jobs while leaving active jobs available', async () => {
  const ids = [JOB_ID, ACTIVE_JOB_ID];
  const { store, advance } = await fixture({ idFactory: () => ids.shift() });
  await store.create();
  await store.complete(JOB_ID, { status: 'complete', recommendations: [] });
  await store.create();

  advance(JOB_RETENTION_MS + 1);

  assert.equal(store.get(JOB_ID), null);
  assert.equal(store.get(ACTIVE_JOB_ID).status, 'queued');
  assert.equal(store.getActive().id, ACTIVE_JOB_ID);
});

test('cleanup removes expired terminal jobs', async () => {
  const { directory, store, advance } = await fixture();
  await store.create(); await store.complete(JOB_ID, { status: 'complete', recommendations: [] });
  advance(24 * 60 * 60 * 1000);
  assert.equal(await store.cleanup(), 1);
  await assert.rejects(stat(join(directory, JOB_ID + '.json')));
  assert.equal(store.get(JOB_ID), null);
});

test('ignores malformed and unsafe files', async () => {
  const { directory, store } = await fixture();
  await import('node:fs/promises').then(({ writeFile }) => Promise.all([
    writeFile(join(directory, 'not-a-uuid.json'), '{secret: no}'),
    writeFile(join(directory, '6e70979a-b9d3-4f9a-a67c-3d42f46e356c.json'), '{bad'),
  ]));
  await store.initialize();
  assert.equal(store.get('../../secret'), null);
});

test('rejects terminal transitions', async () => {
  const { store } = await fixture();
  await store.create(); await store.complete(JOB_ID, { ok: true });
  await assert.rejects(store.complete(JOB_ID, {}));
  await assert.rejects(store.fail(JOB_ID, new Error('x')));
});

test('fail replaces unexpected codes and raw messages with the fixed generic failure', async () => {
  const { directory, store } = await fixture();
  await store.create();
  const sensitive = 'Bearer secret-token; prompt: private input; ' + 'x'.repeat(2000);
  await store.fail(JOB_ID, { code: 'UPSTREAM_FAILURE', message: sensitive });
  const saved = JSON.parse(await readFile(join(directory, JOB_ID + '.json'), 'utf8'));
  assert.deepEqual(saved.error, {
    code: 'GENERATION_FAILED',
    message: 'AFTERIMAGE could not develop this reel cleanly.',
  });
  assert.deepEqual(store.toPublic(store.get(JOB_ID)).error, saved.error);
  assert.equal(JSON.stringify(saved).includes(sensitive), false);
});

test('fail preserves the approved AUTH_REQUIRED semantics across restart', async () => {
  const { directory, store, now } = await fixture();
  await store.create();
  await store.fail(JOB_ID, { code: 'AUTH_REQUIRED', message: 'Bearer raw-secret-token' });

  const second = new JobStore({ directory, now });
  await second.initialize();

  assert.deepEqual(second.get(JOB_ID).error, {
    code: 'AUTH_REQUIRED',
    message: 'Claude is not connected. Check the companion\'s Claude sign-in, then develop the reel again.',
  });
});

test('drops records containing fields outside the safe allowlist', async () => {
  const { directory, store, now } = await fixture();
  await store.create();
  const filename = join(directory, JOB_ID + '.json');
  const safe = JSON.parse(await readFile(filename, 'utf8'));
  await import('node:fs/promises').then(({ writeFile }) => writeFile(filename, JSON.stringify({
    ...safe, credentials: 'secret', transcript: 'private', rawInput: { prompt: 'secret' },
  })));
  const second = new JobStore({ directory, now });
  await second.initialize();
  assert.equal(second.get(JOB_ID), null);
});

test('sanitizes raw failed messages already persisted on restart', async () => {
  const { directory, store, now } = await fixture();
  await store.create();
  const filename = join(directory, JOB_ID + '.json');
  const saved = JSON.parse(await readFile(filename, 'utf8'));
  const rawMessage = 'credentials=super-secret prompt=private ' + 'x'.repeat(300);
  await writeFile(filename, JSON.stringify({ ...saved, status: 'failed', error: { code: 'UPSTREAM_FAILURE', message: rawMessage } }));
  const second = new JobStore({ directory, now });
  await second.initialize();
  const rewritten = await readFile(filename, 'utf8');
  assert.equal(rewritten.includes(rawMessage), false);
  assert.deepEqual(JSON.parse(rewritten).error, {
    code: 'GENERATION_FAILED',
    message: 'AFTERIMAGE could not develop this reel cleanly.',
  });
});