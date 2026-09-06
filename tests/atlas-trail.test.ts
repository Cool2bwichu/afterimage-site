import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { atlasInputKey, type Atlas } from '../app/lib/atlas.ts';
import { activeAtlasStop, emptyAtlasTrail, finishAtlasMap, MAX_ATLAS_MAPS, MAX_ATLAS_STEPS, moveAtlasTrail, parseAtlasTrail, updateAtlasView, visitAtlasMap, type AtlasTrail } from '../app/lib/atlas-trail.ts';
import { FACET_KEYS } from '../app/lib/light-table.ts';

const facets = JSON.parse(readFileSync(new URL('./fixtures/light-table.json', import.meta.url), 'utf8')).fingerprint;
const request = { films: ['Reference'], creativeBrief: 'Patient observation', experience: 'light-table-v1' as const };
const jobId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function atlas(title: string): Atlas {
  const film = (title: string) => ({ title, year: '2000', facets, summary: 'A complete film profile.', watchFor: 'An observable formal choice.' });
  return { kind: 'atlas-v1', thesis: 'A shared formal idea.', anchor: film(title), neighbors: Array.from({ length: 6 }, (_, i) => ({ ...film(`${title} neighbor ${i}`), label: 'Shared restraint', shared: 'Evidence in both films.', difference: 'A meaningful departure.', whyHere: 'Matches the request.', lenses: Object.fromEntries(FACET_KEYS.map(key => [key, { affinity: 'echo', evidence: 'Specific comparative evidence.' }])) as Atlas['neighbors'][number]['lenses'] })) };
}
function start(state: AtlasTrail, n: number, title: string) {
  const result = atlas(title);
  return { state: { ...state, pending: { jobId: jobId(n), inputKey: atlasInputKey({ anchor: result.anchor, request }), anchor: result.anchor, followOnComplete: true } }, result };
}
function complete(state: AtlasTrail, n: number, title: string) {
  const pending = start(state, n, title);
  return finishAtlasMap(pending.state, jobId(n), pending.result);
}

test('legacy migration preserves the accepted map, exact input and resumable job', () => {
  const old = atlas('First'); const next = start(emptyAtlasTrail(), 2, 'Second');
  const key = atlasInputKey({ anchor: old.anchor, request });
  const state = parseAtlasTrail(null, { atlas: old, inputKey: key, pending: next.state.pending });
  assert.equal(activeAtlasStop(state)?.atlas.anchor.title, 'First');
  assert.equal(activeAtlasStop(state)?.inputKey, key);
  assert.equal(state.pending?.jobId, jobId(2));
  assert.deepEqual(activeAtlasStop(state)?.view, { selected: -1, lens: 'all' });
  assert.equal(parseAtlasTrail(emptyAtlasTrail(), { atlas: old, inputKey: key }).maps.length, 0, 'an intentionally empty trail must not resurrect legacy data');
});

test('back, forward and branching restore view state without discarding visited maps', () => {
  let state = complete(emptyAtlasTrail(), 1, 'A');
  state = updateAtlasView(state, { selected: 3, lens: 'howItLooks' });
  state = complete(state, 2, 'B');
  state = updateAtlasView(state, { selected: 1, lens: 'howItSpeaks' });
  state = moveAtlasTrail(state, 0);
  assert.deepEqual(activeAtlasStop(state)?.view, { selected: 3, lens: 'howItLooks' });
  state = moveAtlasTrail(state, 1);
  assert.deepEqual(activeAtlasStop(state)?.view, { selected: 1, lens: 'howItSpeaks' });
  state = complete(moveAtlasTrail(state, 0), 3, 'C');
  assert.deepEqual(state.route, [jobId(1), jobId(3)]);
  assert.equal(state.maps.length, 3, 'the abandoned forward branch is still cached');
  state = visitAtlasMap(state, jobId(2));
  assert.deepEqual(activeAtlasStop(state)?.view, { selected: 1, lens: 'howItSpeaks' });
  assert.equal(state.pending, null);
  assert.deepEqual(parseAtlasTrail(JSON.parse(JSON.stringify(state))), state, 'reload preserves the complete journey');
});

test('a map completing while an earlier map is being read waits for an explicit visit', () => {
  let state = complete(complete(emptyAtlasTrail(), 1, 'A'), 2, 'B');
  const pending = start(state, 3, 'C');
  state = moveAtlasTrail(pending.state, 0);
  assert.equal(state.pending?.followOnComplete, false);
  state = finishAtlasMap(state, jobId(3), pending.result);
  assert.equal(activeAtlasStop(state)?.atlas.anchor.title, 'A');
  assert.equal(state.readyId, jobId(3));
  assert.equal(state.pending, null);
  state = visitAtlasMap(state, state.readyId!);
  assert.equal(activeAtlasStop(state)?.atlas.anchor.title, 'C');
  assert.equal(state.readyId, null);
});

test('stale jobs and changed anchors cannot replace the current map', () => {
  const pending = start(complete(emptyAtlasTrail(), 1, 'A'), 2, 'B');
  assert.equal(finishAtlasMap(pending.state, jobId(3), pending.result), pending.state);
  assert.equal(finishAtlasMap(pending.state, jobId(2), atlas('Wrong')), pending.state);
});

test('bounded storage retains the active map and filters evicted trail steps', () => {
  let state = emptyAtlasTrail();
  for (let i = 1; i <= MAX_ATLAS_MAPS; i++) state = complete(state, i, `Map ${i}`);
  state = moveAtlasTrail(state, 0);
  const pending = start(state, 20, 'New');
  state = finishAtlasMap({ ...pending.state, pending: { ...pending.state.pending, followOnComplete: false } }, jobId(20), pending.result);
  assert.equal(state.maps.length, MAX_ATLAS_MAPS);
  assert.equal(activeAtlasStop(state)?.atlas.anchor.title, 'Map 1');
  assert.ok(state.route.every(id => state.maps.some(map => map.id === id)));
  for (let i = 0; i < 40; i++) state = visitAtlasMap(state, i % 2 ? jobId(1) : jobId(20));
  assert.equal(state.route.length, MAX_ATLAS_STEPS);
  assert.equal(state.cursor, MAX_ATLAS_STEPS - 1);
});

test('corrupt entries are isolated and invalid view values return to a readable overview', () => {
  const state = complete(complete(emptyAtlasTrail(), 1, 'A'), 2, 'B');
  const broken = structuredClone(state);
  broken.maps[0].atlas.neighbors = [];
  const cleaned = parseAtlasTrail(broken);
  assert.equal(cleaned.maps.length, 1);
  assert.equal(activeAtlasStop(cleaned)?.atlas.anchor.title, 'B');
  const invalid = { ...state, maps: state.maps.map(map => ({ ...map, view: { selected: 99, lens: 'unknown' } })) };
  assert.deepEqual(activeAtlasStop(parseAtlasTrail(invalid))?.view, { selected: -1, lens: 'all' });
  const wrongKey = { ...state, maps: state.maps.map(map => ({ ...map, inputKey: '["other|2000",{}]' })) };
  assert.equal(parseAtlasTrail(wrongKey).maps.length, 0);
});
