import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isGenerationJobId,
  canResumeReelConflict,
  nextPollDelay,
  parseJobDraft,
  parseJobStart,
  parseJobStatus,
} from '../app/lib/generation-state.ts';

const JOB_ID = '6e70979a-b9d3-4f9a-a67c-3d42f46e356c';
const CREATED_AT = '2026-08-31T12:00:00.000Z';
const UPDATED_AT = '2026-08-31T12:00:01.000Z';

test('conflicts after a refresh resume reels without adopting another kind of job', () => {
  const conflict = { code: 'ACTIVE_GENERATION', jobId: JOB_ID };
  assert.equal(canResumeReelConflict({ ...conflict, kind: 'reel' }), true);
  for (const kind of ['collision', 'atlas', 'replacement', 'unknown']) {
    assert.equal(canResumeReelConflict({ ...conflict, kind }), false);
  }
  // A legacy companion may omit kind; only an already-known local job is safe.
  assert.equal(canResumeReelConflict(conflict), false);
  assert.equal(canResumeReelConflict(conflict, JOB_ID), true);
  assert.equal(canResumeReelConflict({ ...conflict, kind: 'replacement' }, undefined, JOB_ID), true);
  assert.equal(canResumeReelConflict({ ...conflict, kind: 'collision' }, JOB_ID), false);
  assert.equal(canResumeReelConflict({ ...conflict, jobId: 'invalid', kind: 'reel' }), false);
});

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

test('a running job keeps only a well-formed draft of what has developed so far', () => {
  const base = { jobId: JOB_ID, status: 'running', createdAt: CREATED_AT, updatedAt: UPDATED_AT };
  const draft = {
    take: 1, persona: 'Desert Ghost', insight: 'Distance as tenderness.', palette: ['#111111', 'red', '#333333'],
    sensibilities: ['Distance', '', 'x'.repeat(81)], spiritDirector: 'Wim Wenders',
    recommendations: [{ title: 'Alice in the Cities', year: '1974', reason: 'Wenders on the road.', timecode: 'ignored' }, { title: 'No year' }],
    privateField: 'ignore me',
  };
  assert.deepEqual(parseJobStatus({ ...base, draft }), {
    ...base,
    draft: {
      take: 1, persona: 'Desert Ghost', insight: 'Distance as tenderness.', palette: ['#111111', '#333333'],
      sensibilities: ['Distance'], spiritDirector: 'Wim Wenders',
      recommendations: [{ title: 'Alice in the Cities', year: '1974', reason: 'Wenders on the road.' }],
    },
  });
  // A malformed draft is dropped; the job itself still parses.
  for (const bad of [null, 'text', { take: 0 }, { take: 1.5 }, { persona: 'No take' }]) {
    assert.deepEqual(parseJobStatus({ ...base, draft: bad }), base);
  }
  // Only running jobs carry a draft.
  assert.deepEqual(parseJobStatus({ ...base, status: 'queued', draft }), { ...base, status: 'queued' });
  assert.deepEqual(parseJobDraft({ take: 2 }), { take: 2 });
  assert.deepEqual(parseJobDraft({ take: 1, film: { title: 'Yi Yi', year: '2000' }, neighbors: [{ title: 'Late Spring', year: '1949', label: 'Quiet echo' }], thesis: 'Families.' }),
    { take: 1, film: { title: 'Yi Yi', year: '2000' }, neighbors: [{ title: 'Late Spring', year: '1949', label: 'Quiet echo' }], thesis: 'Families.' });
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
