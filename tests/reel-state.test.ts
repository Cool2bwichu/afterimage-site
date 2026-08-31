import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDevelopPayload,
  canDevelop,
  getInputStatus,
  parseStoredState,
} from '../app/lib/reel-state.ts';

function legacyRecommendations() {
  return Array.from({ length: 5 }, (_, index) => ({
    title: 'Legacy Recommendation ' + (index + 1),
    year: String(1975 + index),
    timecode: '00:00:0' + (index + 1) + ':00',
    reason: 'A complete legacy reason ' + (index + 1) + '.',
    pairsWith: 'Paris, Texas',
  }));
}

function completeLegacyResult() {
  return {
    status: 'complete',
    sourceFilms: ['Paris, Texas'],
    persona: 'Desert Ghost',
    insight: 'A complete saved insight.',
    palette: ['#111111', '#222222', '#333333', '#444444', '#555555'],
    sensibilities: ['Distance', 'Longing', 'Silence'],
    spiritDirector: { name: 'A Director', reason: 'A complete saved reason.' },
    recommendations: legacyRecommendations(),
  };
}

test('develops from films, text, or both', () => {
  assert.equal(canDevelop([], ''), false);
  assert.equal(canDevelop([], '   '), false);
  assert.equal(canDevelop([], 'A film about time passing.'), true);
  assert.equal(canDevelop(['After Yang'], ''), true);
  assert.equal(canDevelop(['After Yang'], 'Quiet speculative grief.'), true);
});

test('describes empty, film-only, brief-only, and combined readiness', () => {
  assert.equal(
    getInputStatus([], ''),
    'Add a film or describe the feeling, form, or story you want to find.',
  );
  assert.equal(getInputStatus(['After Yang'], ''), '1 film loaded. Ready when you are.');
  assert.equal(getInputStatus([], 'Quiet speculative grief.'), 'Description loaded. Ready when you are.');
  assert.equal(
    getInputStatus(['After Yang', 'Columbus'], 'Quiet speculative grief.'),
    '2 films and a description loaded. Ready when you are.',
  );
});

test('trims the outgoing brief without requiring three films', () => {
  assert.deepEqual(buildDevelopPayload([], '  Melancholy over decades.  '), {
    films: [],
    creativeBrief: 'Melancholy over decades.',
  });
});

test('adds bounded not-interested films to future generation payloads', () => {
  assert.deepEqual(buildDevelopPayload([], '  Melancholy over decades.  ', [
    { title: '  After Yang  ', year: '2021' },
  ]), {
    films: [],
    creativeBrief: 'Melancholy over decades.',
    excludedFilms: [{ title: 'After Yang', year: '2021' }],
  });
});

test('hydrates an unversioned legacy reel without exposing pairsWith', () => {
  const state = parseStoredState(JSON.stringify({
    films: ['Paris, Texas'],
    creativeBrief: '',
    result: completeLegacyResult(),
  }));

  assert.equal(state.version, 4);
  assert.equal(state.activeJobId, null);
  assert.deepEqual(state.metadataByKey, {});
  assert.deepEqual(state.excludedFilms, []);
  assert.ok(state.result);
  assert.equal(state.result.recommendations.length, 5);
  assert.equal(Object.hasOwn(state.result.recommendations[0], 'pairsWith'), false);
  assert.equal(state.result.recommendations[0].watchFor, '');
});

test('discards a malformed saved reel while preserving valid draft input', () => {
  const malformed = completeLegacyResult();
  malformed.palette = ['#111111'];

  const state = parseStoredState(JSON.stringify({
    films: ['Paris, Texas'],
    creativeBrief: '  Desert longing.  ',
    result: malformed,
  }));

  assert.deepEqual(state, {
    version: 4,
    films: ['Paris, Texas'],
    creativeBrief: 'Desert longing.',
    result: null,
    activeJobId: null,
    metadataByKey: {},
    excludedFilms: [],
  });
});

test('hydrates only a valid UUID v4 as the active generation job', () => {
  const jobId = '6e70979a-b9d3-4f9a-a67c-3d42f46e356c';
  assert.equal(parseStoredState(JSON.stringify({ activeJobId: jobId })).activeJobId, jobId);

  for (const activeJobId of [
    undefined,
    null,
    '',
    '../../6e70979a-b9d3-4f9a-a67c-3d42f46e356c',
    'abcdefghijklmnopqrstuvwxyz0123456789',
    '6e70979a-b9d3-1f9a-a67c-3d42f46e356c',
    42,
  ]) {
    assert.equal(parseStoredState(JSON.stringify({ activeJobId })).activeJobId, null);
  }
});

test('falls back to an empty V4 draft when storage is unreadable', () => {
  assert.deepEqual(parseStoredState('{not-json'), {
    version: 4,
    films: [],
    creativeBrief: '',
    result: null,
    activeJobId: null,
    metadataByKey: {},
    excludedFilms: [],
  });
});

test('hydrates only definitive metadata belonging to the saved five-film reel', () => {
  const result = completeLegacyResult();
  const key = 'legacy recommendation 1|1975';
  const state = parseStoredState(JSON.stringify({
    result,
    metadataByKey: {
      [key]: { key, title: 'Legacy Recommendation 1', year: '1975', status: 'unmatched' },
      'unrelated|2000': { key: 'unrelated|2000', title: 'Unrelated', year: '2000', status: 'unmatched' },
      'legacy recommendation 2|1976': { key: 'legacy recommendation 2|1976', title: 'Legacy Recommendation 2', year: '1976', status: 'unavailable' },
    },
  }));
  assert.deepEqual(state.metadataByKey, {
    [key]: { key, title: 'Legacy Recommendation 1', year: '1975', status: 'unmatched' },
  });
});

test('persists a deduplicated not-interested list independently of the current reel', () => {
  const state = parseStoredState(JSON.stringify({
    excludedFilms: [
      { title: 'After Yang', year: '2021' },
      { title: ' after yang ', year: '2021' },
      { title: 'Invalid Year', year: 'twenty' },
    ],
  }));
  assert.deepEqual(state.excludedFilms, [{ title: 'After Yang', year: '2021' }]);
});
