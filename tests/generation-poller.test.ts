import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DRAFT_POLL_MS,
  GenerationPollError,
  pollGeneration,
} from '../app/lib/generation-poller.ts';
import type { GenerationJob } from '../app/lib/generation-state.ts';

const JOB_ID = '6e70979a-b9d3-4f9a-a67c-3d42f46e356c';
const CREATED_AT = '2026-08-31T12:00:00.000Z';
const UPDATED_AT = '2026-08-31T12:00:01.000Z';

function completeJob(): GenerationJob {
  return {
    jobId: JOB_ID,
    status: 'complete',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    reel: {
      status: 'complete',
      sourceFilms: ['Paris, Texas'],
      persona: 'Desert Ghost',
      insight: 'A complete saved insight.',
      palette: ['#111111', '#222222', '#333333', '#444444', '#555555'],
      sensibilities: ['Distance', 'Longing', 'Silence'],
      spiritDirector: { name: 'Wim Wenders', reason: 'Patient attention to distance.' },
      recommendations: Array.from({ length: 5 }, (_, index) => ({
        title: `Recommendation ${index + 1}`,
        year: String(1975 + index),
        timecode: `00:00:0${index + 1}:00`,
        reason: `A complete synthesis reason ${index + 1}.`,
        watchFor: `A precise visual detail ${index + 1}.`,
      })),
    },
  };
}

function failedJob(): GenerationJob {
  return {
    jobId: JOB_ID,
    status: 'failed',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    error: { code: 'GENERATION_FAILED', message: 'Generation failed. Please try again.' },
  };
}

function httpError(status: number): Error & { status: number } {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

test('generation poller waits 1500ms before its first status request', async () => {
  const events: string[] = [];
  const terminal = failedJob();

  const result = await pollGeneration({
    fetchStatus: async () => {
      events.push('fetch');
      return terminal;
    },
    wait: async (milliseconds) => {
      events.push(`wait:${milliseconds}`);
    },
    signal: new AbortController().signal,
  });

  assert.deepEqual(events, ['wait:1500', 'fetch']);
  assert.deepEqual(result, terminal);
});

test('generation poller reports every queued, running, and complete status and returns the terminal job', async () => {
  const jobs: GenerationJob[] = [
    { jobId: JOB_ID, status: 'queued', createdAt: CREATED_AT, updatedAt: UPDATED_AT },
    { jobId: JOB_ID, status: 'running', createdAt: CREATED_AT, updatedAt: UPDATED_AT },
    completeJob(),
  ];
  const reported: GenerationJob[] = [];
  const delays: number[] = [];

  const result = await pollGeneration({
    fetchStatus: async () => jobs.shift()!,
    wait: async (milliseconds) => { delays.push(milliseconds); },
    onStatus: (job) => { reported.push(job); },
    signal: new AbortController().signal,
  });

  assert.deepEqual(delays, [1500, 2025, 2734]);
  assert.deepEqual(reported.map((job) => job.status), ['queued', 'running', 'complete']);
  assert.equal(result.status, 'complete');
});

test('generation poller checks about once a second while an answer develops, then backs off again', async () => {
  const draft = { take: 1, persona: 'Desert Ghost' };
  const jobs: GenerationJob[] = [
    { jobId: JOB_ID, status: 'running', createdAt: CREATED_AT, updatedAt: UPDATED_AT },
    { jobId: JOB_ID, status: 'running', createdAt: CREATED_AT, updatedAt: UPDATED_AT, draft },
    { jobId: JOB_ID, status: 'running', createdAt: CREATED_AT, updatedAt: UPDATED_AT, draft },
    { jobId: JOB_ID, status: 'running', createdAt: CREATED_AT, updatedAt: UPDATED_AT },
    completeJob(),
  ];
  const delays: number[] = [];
  const result = await pollGeneration({
    fetchStatus: async () => jobs.shift()!,
    wait: async (milliseconds) => { delays.push(milliseconds); },
    signal: new AbortController().signal,
  });
  assert.deepEqual(delays, [1500, 2025, DRAFT_POLL_MS, DRAFT_POLL_MS, 2734]);
  assert.equal(result.status, 'complete');
});

test('generation poller retries gateway and network failures with capped backoff', async () => {
  const failures = [httpError(502), httpError(503), httpError(504), new Error('offline'), new Error('offline again')];
  const outcomes: Array<GenerationJob | Error> = [...failures, completeJob()];
  const delays: number[] = [];
  const transientErrors: unknown[] = [];

  const result = await pollGeneration({
    fetchStatus: async () => {
      const outcome = outcomes.shift()!;
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
    wait: async (milliseconds) => { delays.push(milliseconds); },
    onTransientError: (error) => { transientErrors.push(error); },
    signal: new AbortController().signal,
  });

  assert.deepEqual(delays, [1500, 2025, 2734, 3691, 4982, 5000]);
  assert.deepEqual(transientErrors, failures);
  assert.equal(result.status, 'complete');
});

test('generation poller maps authentication and missing-job responses to typed terminal errors', async () => {
  for (const [status, code] of [[401, 'AUTH_REQUIRED'], [404, 'JOB_NOT_FOUND']] as const) {
    let transientCalls = 0;
    await assert.rejects(
      pollGeneration({
        fetchStatus: async () => { throw httpError(status); },
        wait: async () => {},
        onTransientError: () => { transientCalls += 1; },
        signal: new AbortController().signal,
      }),
      (error: unknown) => error instanceof GenerationPollError && error.code === code,
    );
    assert.equal(transientCalls, 0);
  }
});

test('generation poller returns a failed job without restarting it', async () => {
  const terminal = failedJob();
  let fetchCalls = 0;

  const result = await pollGeneration({
    fetchStatus: async () => {
      fetchCalls += 1;
      return terminal;
    },
    wait: async () => {},
    signal: new AbortController().signal,
  });

  assert.deepEqual(result, terminal);
  assert.equal(fetchCalls, 1);
});

test('generation poller aborts after a reported status without another wait or fetch', async () => {
  const controller = new AbortController();
  let fetchCalls = 0;
  let waitCalls = 0;

  await assert.rejects(
    pollGeneration({
      fetchStatus: async () => {
        fetchCalls += 1;
        return { jobId: JOB_ID, status: 'queued', createdAt: CREATED_AT, updatedAt: UPDATED_AT };
      },
      wait: async () => { waitCalls += 1; },
      onStatus: () => { controller.abort(); },
      signal: controller.signal,
    }),
    (error: unknown) => error instanceof Error && error.name === 'AbortError',
  );

  assert.equal(waitCalls, 1);
  assert.equal(fetchCalls, 1);
});
