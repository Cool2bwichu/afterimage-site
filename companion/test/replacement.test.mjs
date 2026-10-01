import assert from 'node:assert/strict';
import test from 'node:test';

import { createReplacementSchema, completeReplacement, validateReplacementInput, verifyReplacementIdentity } from '../lib/replacement-contract.mjs';
import { LIGHT_TABLE_EXPERIENCE } from '../lib/v2-contract.mjs';
import { ClaudeEngine } from '../lib/claude-engine.mjs';
import { REPLACEMENT_SYSTEM } from '../lib/prompts.mjs';
import { createCompanionServer } from '../server.mjs';
import { answer, fakeClaude, matchedMetadata } from './fake-anthropic.mjs';
import { withServer } from './http-helpers.mjs';

const identity = (title, year) => ({ title, year });
const facet = (label) => ({ label, explanation: `${label} has a specific cinematic effect.`, traits: [label.toLowerCase()] });
const facets = (prefix) => ({
  whereItLives: facet(`${prefix} world`), howItFeels: facet(`${prefix} feeling`),
  howItLooks: facet(`${prefix} image`), howItSpeaks: facet(`${prefix} voice`),
});
function fixture(lightTable = false) {
  const request = {
    films: ['Paris, Texas', 'In the Mood for Love'], creativeBrief: 'Tender distance without horror.',
    likedFilms: [identity('Drive', '2011')], excludedFilms: [identity('Cure', '1997')],
    ...(lightTable ? { experience: LIGHT_TABLE_EXPERIENCE, selectedFacets: {
      howItLooks: { ...facet('Geometric stillness'), source: identity('Columbus', '2017') },
    } } : {}),
  };
  const reel = {
    status: 'complete', sourceFilms: [...request.films], persona: 'Patient Longing',
    insight: 'Distance gives tenderness its shape.', palette: ['#111111', '#222222', '#333333', '#444444', '#555555'],
    sensibilities: ['patient framing', 'soft restraint', 'quiet voices'],
    spiritDirector: { name: 'Wim Wenders', reason: 'His frames let distance carry emotion.' },
    ...(lightTable ? { fingerprint: facets('Current') } : {}),
    recommendations: [identity('The Green Ray', '1986'), identity('After Yang', '2021'),
      identity('Past Lives', '2023'), identity('The Rider', '2017'), identity('Still Walking', '2008')]
      .map((film, index) => ({ ...film, timecode: `00:0${index}:00:00`,
        reason: `${film.title} fits the complete request.`, watchFor: `Observe ${film.title}'s compositions.`,
        ...(lightTable ? { facets: facets(film.title) } : {}),
      })),
  };
  return { request, reel, replaceIndex: 1 };
}
function candidate(lightTable = false, title = 'The Lunchbox', year = '2013') {
  return { recommendation: { title, year, timecode: '00:01:12:00',
    reason: 'Small acts of care carry longing across a city.', watchFor: 'Notice the pace of the exchanged notes.',
    ...(lightTable ? { facets: facets(title) } : {}),
  } };
}

test('single-item contract replaces one position while preserving the rest of the reel', () => {
  const input = validateReplacementInput(fixture());
  const result = completeReplacement(candidate(), input);
  assert.equal(result.recommendations.length, 5);
  assert.equal(result.recommendations[1].title, 'The Lunchbox');
  for (const index of [0, 2, 3, 4]) assert.deepEqual(result.recommendations[index], input.reel.recommendations[index]);
  assert.deepEqual(result.palette, input.reel.palette);
  assert.equal(createReplacementSchema().properties.recommendation.required.includes('watchFor'), true);
  assert.equal(createReplacementSchema().properties.recommendation.properties.facets, undefined);
});

test('replacement rejects previous, liked, excluded and selected-source identities', () => {
  const standard = validateReplacementInput(fixture());
  for (const [title, year] of [['After Yang', '2021'], ['Drive', '2011'], ['Cure', '1997'], ['Paris, Texas', '1984']]) {
    assert.throws(() => completeReplacement(candidate(false, title, year), standard));
  }
  assert.throws(() => completeReplacement(candidate(false, '  After   Yang  ', '2022'), standard), /repeats/i);
  const lightTable = validateReplacementInput(fixture(true));
  assert.ok(createReplacementSchema(LIGHT_TABLE_EXPERIENCE).properties.recommendation.required.includes('facets'));
  assert.throws(() => completeReplacement(candidate(true, 'Columbus', '2017'), lightTable));
  assert.throws(() => completeReplacement(candidate(false), lightTable));
  assert.equal(completeReplacement(candidate(true), lightTable).recommendations[1].facets.howItLooks.label, 'The Lunchbox image');
});

test('catalog identity rejects an alias of a previous film and fails closed when unavailable', async () => {
  const input = validateReplacementInput(fixture());
  const reel = completeReplacement(candidate(), input);
  const facts = [identity('The Lunchbox', '2013'), ...input.reel.recommendations]
    .map((film, index) => ({ requestedTitle: film.title, requestedYear: film.year,
      status: 'matched', tmdbId: index + 100 }));
  assert.equal(await verifyReplacementIdentity(input, reel, async () => facts), reel);
  await assert.rejects(() => verifyReplacementIdentity(input, reel, async () =>
    [{ ...facts[0], tmdbId: facts[2].tmdbId }, ...facts.slice(1)]), /repeats/i);
  await assert.rejects(() => verifyReplacementIdentity(input, reel, async () =>
    [{ ...facts[0], status: 'unavailable' }, ...facts.slice(1)]), /could not be verified/i);
  await assert.rejects(() => verifyReplacementIdentity(input, reel, async () => {
    throw new Error('Metadata service unavailable');
  }), /unavailable/i);
});

test('malformed request or a reel from another request cannot start replacement', () => {
  for (const mutate of [
    value => { value.replaceIndex = 5; },
    value => { value.reel.sourceFilms[0] = 'Another film'; },
    value => { value.reel.recommendations.pop(); },
    value => { value.reel.status = 'failed'; },
  ]) {
    const value = fixture(); mutate(value);
    assert.throws(() => validateReplacementInput(value), error => error.code === 'BAD_REQUEST');
  }
});

test('Claude returns one film and the companion splices it into the reel', async () => {
  const claude = fakeClaude([answer(candidate())]);
  const engine = new ClaudeEngine({ client: claude, model: 'claude-opus-5-5', effort: 'medium', metadataProvider: matchedMetadata });
  const result = await engine.generateReplacement(fixture());
  const { params } = claude.calls[0];
  assert.equal(params.model, 'claude-opus-5-5');
  assert.equal(params.output_config.effort, 'medium');
  assert.deepEqual(params.output_config.format.schema.required, ['recommendation']);
  assert.equal(params.system[0].text, REPLACEMENT_SYSTEM);
  assert.match(params.messages[0].content, /<films_already_in_this_reel>/);
  assert.match(params.messages[0].content, /<film_being_replaced>\n\{"title":"After Yang","year":"2021"\}/);
  assert.equal(result.recommendations[1].title, 'The Lunchbox');
  assert.deepEqual(result.recommendations.filter((_, index) => index !== 1), fixture().reel.recommendations.filter((_, index) => index !== 1));
});

test('replacement route queues a resumable job and rejects malformed input', async () => {
  const starts = [];
  const coordinator = {
    async start(value) { starts.push(value); return { jobId: '6e70979a-b9d3-4f9a-a67c-3d42f46e356c', status: 'queued' }; },
    get() { return null; },
  };
  const server = createCompanionServer({ engine: {}, generationCoordinator: coordinator, secret: 'test-secret' });
  await withServer(server, async origin => {
    const post = body => fetch(origin + '/v2/replacements/generations', {
      method: 'POST', headers: { authorization: 'Bearer test-secret', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const accepted = await post(fixture());
    assert.equal(accepted.status, 202);
    assert.deepEqual(await accepted.json(), { jobId: '6e70979a-b9d3-4f9a-a67c-3d42f46e356c', status: 'queued' });
    assert.equal(starts[0].replacementRequest.replaceIndex, 1);
    const rejected = await post({ ...fixture(), replaceIndex: 10 });
    assert.equal(rejected.status, 400);
    assert.equal(starts.length, 1);
  });
});
