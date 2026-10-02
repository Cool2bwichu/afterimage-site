import assert from 'node:assert/strict';
import test from 'node:test';

import { GenerationCoordinator, SAFE_FAILURES } from '../lib/generation-coordinator.mjs';

const JOB_ID = '6e70979a-b9d3-4f9a-a67c-3d42f46e356c';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createStore({ create: createJob } = {}) {
  const jobs = new Map();
  const transitions = [];
  const store = {
    transitions,
    async create() {
      const job = createJob ? await createJob() : {
        id: JOB_ID,
        status: 'queued',
        createdAt: '2026-08-31T12:00:00.000Z',
        updatedAt: '2026-08-31T12:00:00.000Z',
      };
      jobs.set(job.id, job);
      transitions.push(job.status);
      return job;
    },
    async markRunning(jobId) {
      const job = { ...jobs.get(jobId), status: 'running', updatedAt: '2026-08-31T12:00:01.000Z' };
      jobs.set(jobId, job);
      transitions.push(job.status);
      return job;
    },
    async complete(jobId, reel) {
      const job = { ...jobs.get(jobId), status: 'complete', reel, updatedAt: '2026-08-31T12:00:02.000Z' };
      jobs.set(jobId, job);
      transitions.push(job.status);
      return job;
    },
    async fail(jobId, error) {
      const job = { ...jobs.get(jobId), status: 'failed', error, updatedAt: '2026-08-31T12:00:02.000Z' };
      jobs.set(jobId, job);
      transitions.push(job.status);
      return job;
    },
    get(jobId) { return jobs.get(jobId) || null; },
    toPublic(job) {
      if (!job) return null;
      const publicJob = { jobId: job.id, status: job.status, createdAt: job.createdAt, updatedAt: job.updatedAt };
      if (job.status === 'complete') publicJob.reel = job.reel;
      if (job.status === 'failed') publicJob.error = job.error;
      return publicJob;
    },
  };
  return store;
}

test('shared gate conflicts identify the active job kind across callers', async () => {
  for (const [kind, input] of Object.entries({
    reel: { films: [] }, atlas: { atlasRequest: {} },
    replacement: { replacementRequest: {} }, collision: { collisionRequest: {} },
  })) {
    const coordinator = new GenerationCoordinator({
      store: createStore(), generate: async () => ({}), schedule: () => {},
    });
    const job = await coordinator.start(input);
    await assert.rejects(coordinator.start({ films: [] }), error => {
      assert.equal(error.code, 'ACTIVE_GENERATION');
      assert.equal(error.jobId, job.jobId);
      assert.equal(error.kind, kind);
      return true;
    });
  }
});

test('starts a queued job, then runs it in the background and exposes its completed reel', async () => {
  const store = createStore();
  const scheduled = [];
  const result = deferred();
  let generatedInput;
  const coordinator = new GenerationCoordinator({
    store,
    generate: async (input) => {
      generatedInput = input;
      return result.promise;
    },
    schedule: (work) => scheduled.push(work),
    logError: () => {},
  });
  const input = { films: ['Persona'], creativeBrief: 'Time as weather.' };

  const started = await coordinator.start(input);

  assert.equal(started.status, 'queued');
  assert.equal(scheduled.length, 1);
  assert.equal(coordinator.activeJobId, started.jobId);
  const work = scheduled.shift();
  const running = work();
  await Promise.resolve();
  assert.equal(coordinator.get(started.jobId).status, 'running');
  assert.deepEqual(generatedInput, input);

  const reel = { status: 'complete', recommendations: [] };
  result.resolve(reel);
  await running;
  await coordinator.whenIdle();

  assert.deepEqual(store.transitions, ['queued', 'running', 'complete']);
  assert.equal(coordinator.activeJobId, null);
  assert.deepEqual(coordinator.get(started.jobId).reel, reel);
});

test('a running job\'s drafts go to the store as the answer develops', async () => {
  const store = createStore();
  const drafts = [];
  store.setDraft = (jobId, draft) => drafts.push([jobId, draft]);
  const coordinator = new GenerationCoordinator({
    store,
    generate: async (input, { onDraft }) => {
      onDraft({ take: 1, persona: 'Patient Longing' });
      return { status: 'complete', recommendations: [] };
    },
    schedule: (work) => work(),
  });
  const started = await coordinator.start({ films: ['Persona'] });
  await coordinator.whenIdle();
  assert.deepEqual(drafts, [[started.jobId, { take: 1, persona: 'Patient Longing' }]]);
});

test('publishes the queued job before rejecting a concurrent create with its resumable ID', async () => {
  const creation = deferred();
  const store = createStore({ create: () => creation.promise });
  const scheduled = [];
  const coordinator = new GenerationCoordinator({
    store,
    generate: async () => ({ status: 'complete' }),
    schedule: (work) => scheduled.push(work),
    logError: () => {},
  });

  const first = coordinator.start({ films: [], creativeBrief: 'A little rain.' });
  const second = coordinator.start({ films: [], creativeBrief: 'A different input.' });
  creation.resolve({
    id: JOB_ID,
    status: 'queued',
    createdAt: '2026-08-31T12:00:00.000Z',
    updatedAt: '2026-08-31T12:00:00.000Z',
  });

  const started = await first;
  await assert.rejects(second, (error) => error.code === 'ACTIVE_GENERATION' && error.jobId === started.jobId);
  assert.equal(scheduled.length, 1);
});

test('whenIdle waits through deferred creation and the worker it schedules', async () => {
  const creation = deferred();
  const result = deferred();
  const scheduled = [];
  const coordinator = new GenerationCoordinator({
    store: createStore({ create: () => creation.promise }),
    generate: async () => result.promise,
    schedule: (work) => scheduled.push(work),
    logError: () => {},
  });
  const started = coordinator.start({ films: [], creativeBrief: 'A little rain.' });
  const idle = coordinator.whenIdle();
  let idleResolved = false;
  idle.then(() => { idleResolved = true; });

  creation.resolve({
    id: JOB_ID,
    status: 'queued',
    createdAt: '2026-08-31T12:00:00.000Z',
    updatedAt: '2026-08-31T12:00:00.000Z',
  });
  await started;
  await Promise.resolve();
  assert.equal(idleResolved, false);

  const running = scheduled.shift()();
  await Promise.resolve();
  assert.equal(idleResolved, false);
  result.resolve({ status: 'complete' });
  await running;
  await idle;
  assert.equal(idleResolved, true);
});

test('rejects another start while a job is queued', async () => {
  const scheduled = [];
  const coordinator = new GenerationCoordinator({
    store: createStore(),
    generate: async () => ({ status: 'complete' }),
    schedule: (work) => scheduled.push(work),
    logError: () => {},
  });
  const first = await coordinator.start({ films: [], creativeBrief: 'A little rain.' });

  await assert.rejects(coordinator.start({ films: [], creativeBrief: 'A little fog.' }), (error) =>
    error.code === 'ACTIVE_GENERATION' && error.jobId === first.jobId);
});

test('rejects another start while a job is running', async () => {
  const scheduled = [];
  const result = deferred();
  const coordinator = new GenerationCoordinator({
    store: createStore(),
    generate: async () => result.promise,
    schedule: (work) => scheduled.push(work),
    logError: () => {},
  });
  const first = await coordinator.start({ films: [], creativeBrief: 'A little rain.' });
  const running = scheduled.shift()();
  await Promise.resolve();

  await assert.rejects(coordinator.start({ films: [], creativeBrief: 'A little fog.' }), (error) =>
    error.code === 'ACTIVE_GENERATION' && error.jobId === first.jobId);
  result.resolve({ status: 'complete' });
  await running;
});

test('maps AUTH_REQUIRED errors to the safe persisted failure', async () => {
  const store = createStore();
  const scheduled = [];
  const error = new Error('token details must never be stored');
  error.code = 'AUTH_REQUIRED';
  const coordinator = new GenerationCoordinator({
    store,
    generate: async () => { throw error; },
    schedule: (work) => scheduled.push(work),
    logError: () => {},
  });
  const started = await coordinator.start({ films: [], creativeBrief: 'A little rain.' });

  await scheduled.shift()();

  assert.deepEqual(coordinator.get(started.jobId).error, SAFE_FAILURES.AUTH_REQUIRED);
  assert.equal(coordinator.activeJobId, null);
});

test('redacts arbitrary generation errors and logs only a safe failure record', async () => {
  const store = createStore();
  const scheduled = [];
  const logs = [];
  const secret = 'Bearer super-secret-token; private prompt';
  const coordinator = new GenerationCoordinator({
    store,
    generate: async () => { throw new Error(secret); },
    schedule: (work) => scheduled.push(work),
    logError: (entry) => logs.push(entry),
  });
  const started = await coordinator.start({ films: [], creativeBrief: 'A little rain.' });

  await scheduled.shift()();
  const failed = coordinator.get(started.jobId);

  assert.deepEqual(failed.error, SAFE_FAILURES.GENERATION_FAILED);
  assert.equal(JSON.stringify(failed).includes(secret), false);
  assert.deepEqual(logs, [{ jobId: started.jobId, code: 'GENERATION_FAILED' }]);
  assert.equal(coordinator.activeJobId, null);
});

test('swallows failure-persistence errors so background work cannot become unhandled', async () => {
  const scheduled = [];
  const store = createStore();
  store.fail = async () => { throw new Error('disk unavailable'); };
  const coordinator = new GenerationCoordinator({
    store,
    generate: async () => { throw new Error('Bearer secret'); },
    schedule: (work) => scheduled.push(work),
    logError: () => {},
  });
  const started = await coordinator.start({ films: [], creativeBrief: 'A little rain.' });

  await assert.doesNotReject(scheduled.shift()());
  await assert.doesNotReject(coordinator.whenIdle());
  assert.equal(coordinator.activeJobId, null);
  assert.equal(coordinator.get(started.jobId).status, 'running');
});
