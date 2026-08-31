import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isGenerationJobId,
  nextPollDelay,
  parseJobStart,
  parseJobStatus,
} from '../app/lib/generation-state.ts';

const JOB_ID = '6e70979a-b9d3-4f9a-a67c-3d42f46e356c';
const CREATED_AT = '2026-08-31T12:00:00.000Z';
const UPDATED_AT = '2026-08-31T12:00:01.000Z';

function completeReel() {
  return {
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
  };
}

test('generation state parses start and pending jobs without copying unknown properties', () => {
  assert.deepEqual(parseJobStart({ jobId: JOB_ID, status: 'queued', privateField: 'ignore me' }), {
    jobId: JOB_ID,
    status: 'queued',
  });

  for (const status of ['queued', 'running'] as const) {
    assert.deepEqual(parseJobStatus({
      jobId: JOB_ID,
      status,
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
      privateField: 'ignore me',
    }), {
      jobId: JOB_ID,
      status,
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    });
  }
});

test('generation state parses complete and failed terminal jobs', () => {
  const reel = completeReel();
  assert.deepEqual(parseJobStatus({
    jobId: JOB_ID,
    status: 'complete',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    reel,
    privateField: 'ignore me',
  }), {
    jobId: JOB_ID,
    status: 'complete',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    reel,
  });

  assert.deepEqual(parseJobStatus({
    jobId: JOB_ID,
    status: 'failed',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    error: {
      code: 'GENERATION_FAILED',
      message: 'Generation failed. Please try again.',
      privateField: 'ignore me',
    },
  }), {
    jobId: JOB_ID,
    status: 'failed',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    error: {
      code: 'GENERATION_FAILED',
      message: 'Generation failed. Please try again.',
    },
  });
});

test('generation state rejects malformed identifiers, timestamps, terminal payloads, and status', () => {
  const base = { jobId: JOB_ID, createdAt: CREATED_AT, updatedAt: UPDATED_AT };
  const malformedReel = { ...completeReel(), recommendations: [] };

  assert.throws(() => parseJobStart({ jobId: JOB_ID, status: 'running' }));
  assert.throws(() => parseJobStart({ jobId: 'not-a-job', status: 'queued' }));
  assert.throws(() => parseJobStatus({ ...base, status: 'waiting' }));
  assert.throws(() => parseJobStatus({ ...base, status: 'queued', updatedAt: 'not-a-time' }));
  assert.throws(() => parseJobStatus({ ...base, status: 'complete', reel: malformedReel }));
  assert.throws(() => parseJobStatus({
    ...base,
    status: 'failed',
    error: { code: 'lowercase', message: 'Generation failed.' },
  }));
  assert.throws(() => parseJobStatus({
    ...base,
    status: 'failed',
    error: { code: 'GENERATION_FAILED', message: 'x'.repeat(301) },
  }));
});

test('generation state validates UUID v4 job IDs without accepting traversal-shaped input', () => {
  assert.equal(isGenerationJobId(JOB_ID), true);
  assert.equal(isGenerationJobId('../../6e70979a-b9d3-4f9a-a67c-3d42f46e356c'), false);
  assert.equal(isGenerationJobId('abcdefghijklmnopqrstuvwxyz0123456789'), false);
  assert.equal(isGenerationJobId('6e70979a-b9d3-1f9a-a67c-3d42f46e356c'), false);
});

test('generation state polling delay starts at 1500ms, never decreases, and caps at 5000ms', () => {
  assert.equal(nextPollDelay(0), 1500);
  assert.equal(nextPollDelay(-3), 1500);
  assert.equal(nextPollDelay(1.9), 2025);

  const delays = Array.from({ length: 20 }, (_, attempt) => nextPollDelay(attempt));
  for (let index = 1; index < delays.length; index += 1) {
    assert.ok(delays[index] >= delays[index - 1]);
  }
  assert.equal(delays.at(-1), 5000);
});
