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

test('incomplete or malformed opted-in extensions fall back to the complete ordinary reel', () => {
  for (const corrupt of [
    (r: Fixture) => { Reflect.deleteProperty(r.fingerprint, 'howItLooks'); },
    (r: Fixture) => { Object.assign(r.fingerprint, {extra:r.fingerprint.howItLooks}); },
    (r: Fixture) => { r.recommendations[4].facets.howItSpeaks.traits = [' Quiet ', 'quiet']; },
    (r: Fixture) => { Reflect.deleteProperty(r.recommendations[0], 'facets'); },
  ]) {
    const raw = fixture(); corrupt(raw);
    const reel = parseAfterimageResultV2(raw, mode);
    assert.equal(reel?.persona, 'The Melancholy Futurist');
    assert.equal(reel?.recommendations.length, 5);
    assert.equal(Object.hasOwn(reel!, 'fingerprint'), false);
    assert.equal(reel?.recommendations.some(recommendation => Object.hasOwn(recommendation, 'facets')), false);
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
  assert.equal(saved.acceptedInputJobId, jobId);
  assert.equal(saved.activeJobId, jobId);
  assert.deepEqual(saved.films, ['Paris, Texas']);
});

test('a resumed job can reuse accepted provenance only when the job identity matches', () => {
  const raw = fixture();
  const selectedFacets = { howItLooks: { ...raw.recommendations[2].facets.howItLooks, source: {title:'Columbus',year:'2017'} } };
  const acceptedInput = { films: [], creativeBrief: '', experience: mode, selectedFacets };
  assert.equal(typeof reelState.acceptedInputForResumedJob, 'function');
  assert.deepEqual(reelState.acceptedInputForResumedJob(jobId, jobId, acceptedInput), acceptedInput);
  assert.equal(reelState.acceptedInputForResumedJob('6e70979a-b9d3-4f9a-a67c-3d42f46e356d', jobId, acceptedInput), undefined);
  assert.equal(reelState.acceptedInputForResumedJob(jobId, undefined, acceptedInput), undefined);

  const corrupted = parseStoredState(JSON.stringify({
    version:4, experience:mode, activeJobId:jobId, acceptedInput, acceptedInputJobId:'not-a-job-id',
  }));
  assert.equal(corrupted.acceptedInputJobId, undefined);
  assert.equal(reelState.acceptedInputForResumedJob(jobId, corrupted.acceptedInputJobId, corrupted.acceptedInput), undefined);
});

test('Light Table lifecycle preserves an unaccepted blend on conflict and clears it only on completion', () => {
  const raw = fixture();
  const selectedFacets = { howItLooks: { ...raw.recommendations[2].facets.howItLooks, source: {title:'Columbus',year:'2017'} } };
  const acceptedInput = { films: ['Paris, Texas'], creativeBrief: '', experience: mode };
  const state = {activeJobId:null,selectedFacets,selectedReelIdentity:reelState.getRecommendationIdentity(raw),acceptedInput,acceptedInputJobId:jobId};
  const foreignJobId = '6e70979a-b9d3-4f9a-a67c-3d42f46e356d';
  assert.equal(typeof reelState.transitionLightTableJob, 'function');

  const resumed = reelState.transitionLightTableJob(state, {type:'conflict',jobId:foreignJobId});
  const failed = reelState.transitionLightTableJob(resumed, {type:'failed'});
  assert.deepEqual(failed.selectedFacets, selectedFacets);
  assert.equal(failed.selectedReelIdentity, state.selectedReelIdentity);
  assert.deepEqual(failed.acceptedInput, acceptedInput);

  const completed = reelState.transitionLightTableJob(resumed, {type:'complete',jobId:foreignJobId});
  assert.deepEqual(completed.selectedFacets, {});
  assert.equal(completed.selectedReelIdentity, '');
  assert.equal(completed.acceptedInput, undefined);
  assert.equal(completed.acceptedInputJobId, undefined);
  assert.equal(completed.activeJobId, null);
});

test('hydration keeps facet selections only while they belong to the same recommendation reel', () => {
  const raw = fixture();
  const selectedFacets = { howItLooks: { ...raw.recommendations[2].facets.howItLooks, source: {title:'Columbus',year:'2017'} } };
  assert.equal(typeof reelState.getRecommendationIdentity, 'function');
  const selectedReelIdentity = reelState.getRecommendationIdentity(raw);
  const valid = parseStoredState(JSON.stringify({version:4,experience:mode,result:raw,selectedFacets,selectedReelIdentity}));
  assert.deepEqual(valid.selectedFacets, selectedFacets);
  assert.equal(valid.selectedReelIdentity, selectedReelIdentity);

  const changed = fixture();
  changed.recommendations[0].title = 'A Different Film';
  const stale = parseStoredState(JSON.stringify({version:4,experience:mode,result:changed,selectedFacets,selectedReelIdentity}));
  assert.deepEqual(stale.selectedFacets, {});
  assert.equal(stale.selectedReelIdentity, undefined);

  const missing = parseStoredState(JSON.stringify({version:4,experience:mode,result:null,selectedFacets,selectedReelIdentity}));
  assert.deepEqual(missing.selectedFacets, {});
  assert.equal(missing.selectedReelIdentity, undefined);
});

test('a completed resumable job preserves Light Table fields only in active mode', () => {
  const raw = {jobId,status:'complete',createdAt:'2026-09-03T00:00:00Z',updatedAt:'2026-09-03T00:00:01Z',reel:fixture()};
  const job = parseJobStatus(raw, mode);
  assert.ok(job.status === 'complete' && job.reel.fingerprint);
  const standard = parseJobStatus(raw);
  assert.ok(standard.status === 'complete' && !standard.reel.fingerprint);
});

test('a resumable Light Table job with a damaged optional extension still completes as an ordinary reel', () => {
  const damaged = fixture();
  Reflect.deleteProperty(damaged.recommendations[0], 'facets');
  const job = parseJobStatus({jobId,status:'complete',createdAt:'2026-09-03T00:00:00Z',updatedAt:'2026-09-03T00:00:01Z',reel:damaged}, mode);
  assert.equal(job.status, 'complete');
  assert.ok(job.status === 'complete' && !job.reel.fingerprint);
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

test('the mobile disclosure controls the lanes and composer actions as one region', () => {
  const component = readFileSync(new URL('../app/components/light-table.tsx', import.meta.url), 'utf8');
  const controlledRegion = component.indexOf('className="ai-light-table__content" id="ai-light-table-body"');
  const actions = component.indexOf('className="ai-light-table__actions"');
  assert.ok(controlledRegion >= 0, 'expected a single controlled Light Table region');
  assert.ok(actions > controlledRegion, 'expected composer actions inside the controlled region');
});


test('saved selections from validated Atlas maps survive reload without admitting unknown sources', () => {
  const result = fixture();
  const source = { title: 'An Atlas discovery', year: '1999' };
  const selectedFacets = { howItLooks: { ...result.recommendations[0].facets.howItLooks, source } };
  const state = { experience: mode, result, selectedFacets, selectedReelIdentity: reelState.getRecommendationIdentity(result) };
  assert.deepEqual(parseStoredState(JSON.stringify(state)).selectedFacets, {});
  assert.deepEqual(parseStoredState(JSON.stringify(state), [source]).selectedFacets, selectedFacets);
  const onlyAtlas = { ...state, result: null, selectedReelIdentity: 'atlas:an atlas discovery|1999' };
  assert.deepEqual(parseStoredState(JSON.stringify(onlyAtlas), [source]).selectedFacets, selectedFacets);
  assert.deepEqual(parseStoredState(JSON.stringify(onlyAtlas)).selectedFacets, {});
});


test('a versioned blend draft keeps a borrowed quality after its source leaves the current reel', () => {
  const result = fixture();
  const selectedFacets = { howItLooks: { ...result.recommendations[0].facets.howItLooks, source: { title: 'A previous discovery', year: '1999' } } };
  const state = { experience: mode, result, blendDraft: { version: 1, facets: selectedFacets } };
  assert.deepEqual(parseStoredState(JSON.stringify(state)).selectedFacets, selectedFacets);
  assert.deepEqual(parseStoredState(JSON.stringify({ ...state, blendDraft: { version: 999, facets: selectedFacets } })).selectedFacets, {});
});
