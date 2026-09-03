import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAfterimageResultV2, parseStoredState, type AfterimageResultV2, type RecommendationV2 } from '../app/lib/reel-state.ts';
import type { FacetMap } from '../app/lib/light-table.ts';
import * as reelState from '../app/lib/reel-state.ts';
import { parseJobStatus } from '../app/lib/generation-state.ts';

type Fixture = AfterimageResultV2 & {fingerprint:FacetMap;recommendations:(RecommendationV2 & {facets:FacetMap})[]};
const fixture = (): Fixture => JSON.parse(readFileSync(new URL('./fixtures/light-table.json', import.meta.url), 'utf8'));
const mode = 'light-table-v1' as const;
const jobId = '6e70979a-b9d3-4f9a-a67c-3d42f46e356c';

test('opted-in result parsing preserves all four channels and twenty facets', () => {
  const reel = parseAfterimageResultV2(fixture(), mode);
  assert.equal(reel?.fingerprint?.howItFeels.label, 'Patient longing under glass');
  assert.equal(reel?.recommendations[2].facets?.howItLooks.label, 'Geometric stillness');
  assert.equal(reel?.recommendations.flatMap(r => Object.keys(r.facets ?? {})).length, 20);
});

test('standard result parsing does not acquire the extension from unsolicited fields', () => {
  const reel = parseAfterimageResultV2(fixture());
  assert.equal(Object.hasOwn(reel!, 'fingerprint'), false);
  assert.equal(Object.hasOwn(reel!.recommendations[0], 'facets'), false);
});

test('incomplete or malformed opted-in extensions cannot become dead facet controls', () => {
  for (const corrupt of [
    (r: Fixture) => { Reflect.deleteProperty(r.fingerprint, 'howItLooks'); },
    (r: Fixture) => { Object.assign(r.fingerprint, {extra:r.fingerprint.howItLooks}); },
    (r: Fixture) => { r.recommendations[4].facets.howItSpeaks.traits = [' Quiet ', 'quiet']; },
    (r: Fixture) => { Reflect.deleteProperty(r.recommendations[0], 'facets'); },
  ]) {
    const raw = fixture(); corrupt(raw);
    assert.equal(parseAfterimageResultV2(raw, mode), null);
  }
});

test('legacy reels remain readable when the Light Table mode is activated', () => {
  const raw = fixture(); Reflect.deleteProperty(raw, 'fingerprint');
  raw.recommendations.forEach(r => { Reflect.deleteProperty(r, 'facets'); });
  assert.equal(parseAfterimageResultV2(raw, mode)?.persona, 'The Melancholy Futurist');
});

test('hydration retains a selection and the accepted blend for refresh, retries and rerolls', () => {
  const raw = fixture();
  const selectedFacets = { howItLooks: { ...raw.recommendations[2].facets.howItLooks, source: {title:'Columbus',year:'2017'} } };
  const acceptedInput = { films: [], creativeBrief: '', experience: mode, selectedFacets };
  const saved = parseStoredState(JSON.stringify({
    version:4, experience:mode, films:['Paris, Texas'], creativeBrief:'Original prompt',
    result:raw, activeJobId:jobId, selectedFacets, acceptedInput,
    excludedFilms:[{title:'Cure',year:'1997'}],
  }));
  assert.equal(saved.result?.fingerprint?.howItLooks.label, 'Monumental space, intimate bodies');
  assert.deepEqual(saved.selectedFacets, selectedFacets);
  assert.deepEqual(saved.acceptedInput, acceptedInput);
  assert.equal(saved.activeJobId, jobId);
  assert.deepEqual(saved.films, ['Paris, Texas']);
});

test('a completed resumable job preserves Light Table fields only in active mode', () => {
  const raw = {jobId,status:'complete',createdAt:'2026-09-03T00:00:00Z',updatedAt:'2026-09-03T00:00:01Z',reel:fixture()};
  const job = parseJobStatus(raw, mode);
  assert.ok(job.status === 'complete' && job.reel.fingerprint);
  const standard = parseJobStatus(raw);
  assert.ok(standard.status === 'complete' && !standard.reel.fingerprint);
});

test('retry adds newly excluded films without changing the accepted blend', () => {
  const input = {films:[],creativeBrief:'',experience:mode,selectedFacets:{howItLooks:{...fixture().recommendations[2].facets.howItLooks,source:{title:'Columbus',year:'2017'}}},excludedFilms:[{title:'Cure',year:'1997'}]};
  assert.equal(typeof reelState.withCurrentExclusions, 'function');
  const updated = reelState.withCurrentExclusions(input,[{title:'The Green Ray',year:'1986'}]);
  assert.deepEqual(updated.selectedFacets,input.selectedFacets);
  assert.deepEqual(updated.films,[]);
  assert.equal(updated.creativeBrief,'');
  assert.deepEqual(updated.excludedFilms,[{title:'The Green Ray',year:'1986'},{title:'Cure',year:'1997'}]);
  assert.deepEqual(input.excludedFilms,[{title:'Cure',year:'1997'}]);
});

test('a blend exceeding the bridge exclusion cap is rejected without silently dropping exclusions', () => {
  assert.equal(typeof reelState.withCurrentExclusions, 'function');
  const current=Array.from({length:100},(_,i)=>({title:`Excluded ${i}`,year:'2001'}));
  assert.throws(()=>reelState.withCurrentExclusions({films:['Paris, Texas'],creativeBrief:'',experience:mode,excludedFilms:[{title:'Cure',year:'1997'}]},current),/100-film/);
});
