import test from 'node:test';
import assert from 'node:assert/strict';

import { getRecommendationIdentity, parseStoredState } from '../app/lib/reel-state.ts';
import { mergeLibraryBackup, parseWatchlist, toggleWatchlist, type SavedFilm } from '../app/lib/library.ts';

const jobId = '6e70979a-b9d3-4f9a-a67c-3d42f46e356c';
const otherJobId = '730a00f0-a48f-4e8a-9323-48309111d41a';

function completeReel() {
  return {
    status: 'complete',
    sourceFilms: ['Columbus'],
    persona: 'Quiet Frames',
    insight: 'Still spaces hold unresolved feelings.',
    palette: ['#111111', '#222222', '#333333', '#444444', '#555555'],
    sensibilities: ['Stillness', 'Distance', 'Warmth'],
    spiritDirector: { name: 'A Director', reason: 'A deliberate visual sensibility.' },
    recommendations: Array.from({ length: 5 }, (_, index) => ({
      title: `Recommendation ${index + 1}`,
      year: String(2001 + index),
      timecode: `00:00:0${index + 1}:00`,
      reason: `A specific reason for film ${index + 1}.`,
      watchFor: `Notice the framing in film ${index + 1}.`,
    })),
  };
}

test('reload keeps the displayed standard request distinct from edited draft and a newer accepted job', () => {
  const result = completeReel();
  const displayedReelIdentity = getRecommendationIdentity(result);
  const displayedInput = {
    films: ['Columbus'], creativeBrief: 'Static compositions and a warmer story.',
    likedFilms: [{ title: 'In the Mood for Love', year: '2000' }],
  };
  const acceptedInput = {
    films: ['Tokyo Story'], creativeBrief: 'Family tension, little dialogue.',
    likedFilms: [{ title: 'Cure', year: '1997' }],
  };
  const state = parseStoredState(JSON.stringify({
    result, displayedReelIdentity, displayedInput,
    films: ['A draft changed after submission'], creativeBrief: 'An unfinished edit.',
    activeJobId: jobId, acceptedInputJobId: jobId, acceptedInput,
  }));

  assert.deepEqual(state.displayedInput, displayedInput);
  assert.equal(state.displayedReelIdentity, displayedReelIdentity);
  assert.deepEqual(state.acceptedInput, acceptedInput);
  assert.equal(state.acceptedInputJobId, jobId);
  assert.deepEqual(state.films, ['A draft changed after submission']);
  assert.equal(state.creativeBrief, 'An unfinished edit.');
  assert.equal(state.experience, undefined);
});

test('a displayed standard request survives reload without an active job and keeps exact valid Likes', () => {
  const result = completeReel();
  const displayedInput = {
    films: [], creativeBrief: 'A quiet, humane film tonight.',
    likedFilms: [{ title: 'Cure', year: '1997' }, { title: 'Columbus', year: '2017' }],
  };
  const state = parseStoredState(JSON.stringify({
    result, displayedReelIdentity: getRecommendationIdentity(result), displayedInput,
    films: [], creativeBrief: 'An unrelated new draft.',
  }));
  assert.deepEqual(state.displayedInput, displayedInput);
  assert.deepEqual(state.displayedInput?.likedFilms, displayedInput.likedFilms);
  assert.equal(state.acceptedInput, undefined);
});

test('a replacement job resumes only with one valid active job, valid index and a saved reel', () => {
  const result = completeReel();
  const valid = parseStoredState(JSON.stringify({ result, activeJobId: jobId, replacementJob: { jobId, index: 3 } }));
  assert.deepEqual(valid.replacementJob, { jobId, index: 3 });

  for (const stored of [
    { result, activeJobId: jobId, replacementJob: { jobId: otherJobId, index: 3 } },
    { result, replacementJob: { jobId, index: 3 } },
    { result, activeJobId: 'invalid', replacementJob: { jobId: 'invalid', index: 3 } },
    { result, activeJobId: jobId, replacementJob: { jobId, index: -1 } },
    { result, activeJobId: jobId, replacementJob: { jobId, index: 5 } },
    { result, activeJobId: jobId, replacementJob: { jobId, index: 1.5 } },
    { activeJobId: jobId, replacementJob: { jobId, index: 3 } },
  ]) {
    assert.equal(parseStoredState(JSON.stringify(stored)).replacementJob, undefined);
  }
});

test('watchlist reload deduplicates the same film and retains a verified catalog identity', () => {
  const watchlist = parseWatchlist(JSON.stringify([
    { title: 'Café Lumière', year: '2003', tmdbId: 21 },
    { title: 'Cafe Lumiere', year: '2003', tmdbId: 21 },
    { title: 'Columbus', year: '2017', tmdbId: -5 },
  ]));
  assert.deepEqual(watchlist, [
    { title: 'Café Lumière', year: '2003', tmdbId: 21 },
    { title: 'Columbus', year: '2017' },
  ]);
  assert.deepEqual(toggleWatchlist(watchlist, { title: 'Cafe Lumiere', year: '2003', tmdbId: 21 }), [{ title: 'Columbus', year: '2017' }]);
});

test('invalid or duplicate library imports leave the current watchlist intact', () => {
  const current: SavedFilm[] = [{ title: 'Columbus', year: '2017', tmdbId: 2108 }];
  for (const backup of [
    { version: 2, watchlist: [{ title: 'Cure', year: '1997' }] },
    { version: 1, watchlist: [{ title: 'Cure', year: 'unknown' }] },
    { version: 1, watchlist: [{ title: 'Cure', year: '1997' }, { title: 'cure', year: '1997' }] },
  ]) {
    assert.throws(() => mergeLibraryBackup(backup, current));
    assert.deepEqual(current, [{ title: 'Columbus', year: '2017', tmdbId: 2108 }]);
  }
  assert.deepEqual(mergeLibraryBackup({ version: 1, watchlist: [
    { title: 'Columbus', year: '2017', tmdbId: 2108 },
    { title: 'Cure', year: '1997', tmdbId: 2109 },
  ] }, current), [current[0], { title: 'Cure', year: '1997', tmdbId: 2109 }]);
});


test('film selection is restored by identity only when it belongs to the saved reel', () => {
  const result = completeReel();
  assert.equal(parseStoredState(JSON.stringify({ result, selectedFilmKey: 'recommendation 3|2003' })).screeningIndex, 2);
  assert.equal(parseStoredState(JSON.stringify({ result, selectedFilmKey: 'a different film|2003' })).screeningIndex, undefined);
});
