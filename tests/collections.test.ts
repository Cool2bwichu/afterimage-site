import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseStoredState, getRecommendationIdentity, type ReelStateV2 } from '../app/lib/reel-state.ts';
import { MAX_SAVED_REELS, parseReelHistory, rememberReel, serializeReelHistory } from '../app/lib/reel-history.ts';
import { parseCollectionRoute } from '../app/lib/navigation.ts';

const result = JSON.parse(readFileSync(new URL('./fixtures/light-table.json', import.meta.url), 'utf8'));
const input = { films: ['Columbus (2017)'], creativeBrief: 'Quiet spaces', experience: 'light-table-v1' };
function state(): ReelStateV2 {
  return parseStoredState(JSON.stringify({ version: 4, result, experience: 'light-table-v1', films: input.films, creativeBrief: input.creativeBrief,
    displayedInput: input, displayedReelIdentity: getRecommendationIdentity(result), selectedFilmKey: `${result.recommendations[2].title.toLowerCase()}|${result.recommendations[2].year}` }));
}
const date = '2026-09-27T08:00:00.000Z';

test('the current completed reel migrates, retains its original request, and reloads its selected film', () => {
  const current = state(); assert.ok(current.result);
  const history = rememberReel([], current, 'first-reel', date);
  const restored = parseReelHistory(serializeReelHistory(history));
  assert.equal(restored.length, 1);
  assert.deepEqual(restored[0].state.result, current.result);
  assert.deepEqual(restored[0].state.displayedInput, current.displayedInput);
  assert.equal(restored[0].state.screeningIndex, 2);
  assert.equal(restored[0].state.activeJobId, null);
});
test('reopening, selecting a film, or refining inputs does not create duplicate reels or change result provenance', () => {
  const current = state();
  const initial = rememberReel([], current, 'first-reel', date);
  const edited = { ...current, creativeBrief: 'A future request', screeningIndex: 4 };
  const history = rememberReel(initial, edited, 'unused-id', date);
  assert.equal(history.length, 1); assert.equal(history[0].id, 'first-reel');
  assert.equal(history[0].state.creativeBrief, 'A future request');
  assert.equal(history[0].state.displayedInput?.creativeBrief, 'Quiet spaces');
  assert.equal(parseReelHistory(serializeReelHistory(history))[0].state.screeningIndex, 4);
});
test('borrowed Light Table qualities survive a round trip even when the source has left the current reel', () => {
  const current = state();
  const edited = { ...current, selectedFacets: { howItLooks: { ...result.fingerprint.howItLooks, source: { title: 'A previous Atlas film', year: '1990' } } } };
  const history = rememberReel([], edited, 'blend-reel', date);
  assert.deepEqual(parseReelHistory(serializeReelHistory(history))[0].state.selectedFacets, edited.selectedFacets);
});
test('pending, incomplete, corrupt and duplicate records cannot become restorable reels', () => {
  const current = state();
  assert.deepEqual(rememberReel([], { ...current, activeJobId: '00000000-0000-4000-8000-000000000001' }, 'pending', date), []);
  assert.deepEqual(rememberReel([], { ...current, result: null }, 'empty', date), []);
  assert.deepEqual(parseReelHistory('{bad json'), []);
  const valid = rememberReel([], current, 'valid', date)[0];
  assert.equal(parseReelHistory(JSON.stringify({ version: 1, reels: [valid, valid, { ...valid, id: '../bad' }, { ...valid, id: 'bad-date', savedAt: 'never' }, { ...valid, id: 'pending', state: { ...current, activeJobId: '00000000-0000-4000-8000-000000000001' } }] })).length, 1);
});
test('a new result is retained separately and bounded history survives clearing the current reel', () => {
  let history = rememberReel([], state(), 'original', date);
  for (let i = 0; i < MAX_SAVED_REELS; i++) {
    const next = state(); next.result = { ...next.result!, insight: `A different accepted result ${i}` };
    history = rememberReel(history, next, `reel-${i}`, date);
  }
  assert.equal(history.length, MAX_SAVED_REELS); assert.equal(history[0].id, 'reel-0');
  assert.equal(rememberReel(history, { ...state(), result: null }, 'empty', date), history);
});
test('collection links distinguish exact Atlases and reels from the previous generic Atlas link', () => {
  assert.deepEqual(parseCollectionRoute('#atlas=legacy'), { kind: 'atlas', id: 'legacy' });
  assert.deepEqual(parseCollectionRoute('#atlas'), { kind: 'atlas', id: null });
  assert.deepEqual(parseCollectionRoute('#reel=first-reel'), { kind: 'reel', id: 'first-reel' });
  assert.deepEqual(parseCollectionRoute('#likes'), { kind: 'library', tab: 'likes' });
  assert.deepEqual(parseCollectionRoute('#atlases'), { kind: 'atlases' });
  for (const invalid of ['#atlas=', '#atlas=%zz', '#reel=../../other', '#atlas=' + 'a'.repeat(65), '#film=columbus']) assert.equal(parseCollectionRoute(invalid), null);
});
