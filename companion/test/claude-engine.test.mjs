import assert from 'node:assert/strict';
import test from 'node:test';

import Anthropic from '@anthropic-ai/sdk';

import { ClaudeEngine, DEFAULT_MODEL, resolveClaudeConfig } from '../lib/claude-engine.mjs';
import { LIGHT_TABLE_SYSTEM, REEL_SYSTEM } from '../lib/prompts.mjs';
import { toStructuredSchema } from '../lib/structured-output.mjs';
import { AFTERIMAGE_LIGHT_TABLE_SCHEMA_V1, AFTERIMAGE_SCHEMA_V2, FACET_KEYS, LIGHT_TABLE_EXPERIENCE } from '../lib/v2-contract.mjs';
import { answer, fakeClaude } from './fake-anthropic.mjs';

const request = {
  films: ['Paris, Texas', 'In the Mood for Love', 'Columbus'],
  creativeBrief: 'Tender distance, no horror.',
  excludedFilms: [{ title: 'Cure', year: '1997' }],
  likedFilms: [{ title: 'Drive', year: '2011' }],
};
const facet = (label) => ({ label, explanation: `${label} carries the feeling.`, traits: [label.toLowerCase()] });
const facets = (prefix) => Object.fromEntries(FACET_KEYS.map((key) => [key, facet(`${prefix} ${key}`)]));

function reel({ titles = ['The Green Ray', 'After Yang', 'Past Lives', 'The Rider', 'Still Walking'], lightTable = false } = {}) {
  return {
    status: 'complete',
    sourceFilms: ['ignored by the companion'],
    persona: 'Patient Longing',
    insight: 'Distance gives tenderness its shape.',
    palette: ['#101820', '#2b3a42', '#c8a97e', '#e8dcc8', '#7a3b2e'],
    sensibilities: ['patient framing', 'soft restraint', 'quiet voices'],
    spiritDirector: { name: 'Wim Wenders', reason: 'His frames let distance carry emotion.' },
    ...(lightTable ? { fingerprint: facets('Print') } : {}),
    recommendations: titles.map((title, index) => ({
      title,
      year: String(1986 + index * 7),
      timecode: `00:0${index}:12:00`,
      reason: `${title} keeps its people at a tender distance.`,
      watchFor: `Watch how ${title} holds its wide frames.`,
      ...(lightTable ? { facets: facets(title) } : {}),
    })),
  };
}

function engine(claude, options = {}) {
  return new ClaudeEngine({ client: claude, model: DEFAULT_MODEL, effort: 'high', ...options });
}

test('a reel streams from Claude Opus 5.5 with structured output, adaptive thinking and default fallbacks', async () => {
  const claude = fakeClaude([answer(reel())]);
  const result = await engine(claude).generateReel(request);

  assert.equal(claude.calls.length, 1);
  const { params, options } = claude.calls[0];
  assert.equal(params.model, 'claude-opus-5-5');
  assert.equal(params.max_tokens, 64000);
  assert.deepEqual(params.thinking, { type: 'adaptive' });
  assert.equal(params.output_config.effort, 'high');
  assert.deepEqual(params.output_config.format, { type: 'json_schema', schema: toStructuredSchema(AFTERIMAGE_SCHEMA_V2) });
  assert.deepEqual(params.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(params.fallbacks, 'default');
  assert.deepEqual(params.system, [{ type: 'text', text: REEL_SYSTEM, cache_control: { type: 'ephemeral' } }]);
  assert.ok(options.signal instanceof AbortSignal);

  const content = params.messages[0].content;
  assert.match(content, /<reference_films>\n\["Paris, Texas","In the Mood for Love","Columbus"\]\n<\/reference_films>/);
  assert.match(content, /<written_guidance>\n"Tender distance, no horror\."\n<\/written_guidance>/);
  assert.match(content, /<not_interested>\n\[\{"title":"Cure","year":"1997"\}\]/);
  assert.match(content, /<background_taste>[\s\S]*"Drive"/);
  assert.doesNotMatch(content, /selected_qualities/);

  // The companion, not the model, is the authority on the submitted references.
  assert.deepEqual(result.sourceFilms, request.films);
  assert.equal(result.recommendations.length, 5);
  assert.equal(result.recommendations[0].title, 'The Green Ray');
});

test('a Light Table reel uses its own brief, schema and the selected qualities as data', async () => {
  const selected = { howItLooks: { ...facet('Geometric stillness'), source: { title: 'Columbus', year: '2017' } } };
  const claude = fakeClaude([answer(reel({ lightTable: true }))]);
  const result = await engine(claude).generateReel({
    films: [], creativeBrief: '', experience: LIGHT_TABLE_EXPERIENCE, selectedFacets: selected,
  });
  const { params } = claude.calls[0];
  assert.equal(params.system[0].text, LIGHT_TABLE_SYSTEM);
  assert.deepEqual(params.output_config.format.schema, toStructuredSchema(AFTERIMAGE_LIGHT_TABLE_SCHEMA_V1));
  assert.match(params.messages[0].content, /<selected_qualities>[\s\S]*Geometric stillness/);
  assert.match(params.messages[0].content, /<selected_quality_sources>\n\[\{"title":"Columbus","year":"2017"\}\]/);
  assert.ok(result.fingerprint.howItLooks);
  assert.ok(result.recommendations.every((item) => item.facets));
});

test('an answer that breaks a rule is rejected once with the reason, then replaced', async () => {
  // Cure (1997) was already marked "not interested"; the second answer avoids it.
  const broken = reel({ titles: ['Cure', 'After Yang', 'Past Lives', 'The Rider', 'Still Walking'] });
  broken.recommendations[0].year = '1997';
  const scripted = fakeClaude([answer(broken), answer(reel())]);
  const logged = [];
  const result = await engine(scripted, { log: (entry) => logged.push(entry) }).generateReel(request);
  assert.equal(scripted.calls.length, 2);
  assert.doesNotMatch(scripted.calls[0].params.messages[0].content, /previous_answer_rejected/);
  assert.match(scripted.calls[1].params.messages[0].content,
    /<previous_answer_rejected>\nA previous answer to this request failed AFTERIMAGE's validation: Cure was marked not interested\./);
  assert.equal(result.recommendations[0].title, 'The Green Ray');
  assert.deepEqual(logged.filter((entry) => entry.code === 'CLAUDE_ANSWER_REJECTED'), [{ code: 'CLAUDE_ANSWER_REJECTED', attempt: 1 }]);
  const usage = logged.filter((entry) => entry.code === 'CLAUDE_USAGE');
  assert.equal(usage.length, 2);
  assert.deepEqual(Object.keys(usage[0]).sort(), ['cacheReadTokens', 'code', 'inputTokens', 'kind', 'model', 'outputTokens', 'stopReason']);
  assert.equal(usage[0].kind, 'reel');
});

test('malformed JSON gets one more attempt, and a second failure is not retried again', async () => {
  const recovered = fakeClaude([answer('{"persona": '), answer(reel())]);
  assert.equal((await engine(recovered).generateReel(request)).persona, 'Patient Longing');
  assert.equal(recovered.calls.length, 2);

  const twice = reel();
  twice.recommendations.pop();
  const failing = fakeClaude([answer(twice), answer(twice), answer(reel())]);
  await assert.rejects(engine(failing).generateReel(request), /exactly five recommendations/);
  assert.equal(failing.calls.length, 2);
});

test('a refusal or a truncated answer fails at once with a coded error', async () => {
  const refused = fakeClaude([answer('', { stopReason: 'refusal' })]);
  await assert.rejects(engine(refused).generateReel(request), { code: 'CLAUDE_DECLINED' });
  assert.equal(refused.calls.length, 1);

  const truncated = fakeClaude([answer('{"status":"complete"', { stopReason: 'max_tokens' })]);
  await assert.rejects(engine(truncated).generateReel(request), { code: 'CLAUDE_INCOMPLETE' });
  assert.equal(truncated.calls.length, 1);
});

test('after a server-side fallback only the completing model\'s text is read', async () => {
  const claude = fakeClaude([answer(reel(), {
    before: [
      { type: 'text', text: '{"persona": "partial' },
      { type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-opus-4-8' } },
    ],
  })]);
  assert.equal((await engine(claude).generateReel(request)).persona, 'Patient Longing');
});

test('Anthropic service errors become safe coded failures', async () => {
  const headers = new Headers();
  const cases = [
    [new Anthropic.AuthenticationError(401, { message: 'invalid x-api-key' }, 'invalid x-api-key', headers), 'AUTH_REQUIRED'],
    [new Anthropic.PermissionDeniedError(403, { message: 'forbidden' }, 'forbidden', headers), 'AUTH_REQUIRED'],
    [new Anthropic.RateLimitError(429, { message: 'slow down' }, 'slow down', headers), 'CLAUDE_UNAVAILABLE'],
    [new Anthropic.InternalServerError(529, { message: 'overloaded' }, 'overloaded', headers), 'CLAUDE_UNAVAILABLE'],
    [new Anthropic.APIConnectionError({ message: 'offline' }), 'CLAUDE_UNAVAILABLE'],
    [new Error('Could not resolve authentication method.'), 'AUTH_REQUIRED'],
  ];
  for (const [error, code] of cases) {
    const claude = fakeClaude([error]);
    await assert.rejects(engine(claude).generateReel(request), { code });
    assert.equal(claude.calls.length, 1, code + ' is not retried by the companion');
  }
});

test('if the API rejects the request shape, one plain retry states the schema in the prompt', async () => {
  const rejected = new Anthropic.BadRequestError(400, { message: 'output_config.format: schema is too complex' }, 'schema is too complex', new Headers());
  const logged = [];
  const claude = fakeClaude([rejected, answer(reel())]);
  const result = await engine(claude, { log: (entry) => logged.push(entry) }).generateReel(request);
  assert.equal(result.persona, 'Patient Longing');
  assert.equal(claude.calls.length, 2);
  const [first, second] = claude.calls.map((call) => call.params);
  assert.ok(first.output_config.format);
  assert.equal('format' in second.output_config, false);
  assert.equal('fallbacks' in second, false);
  assert.equal('betas' in second, false);
  assert.equal(second.output_config.effort, 'high');
  assert.doesNotMatch(first.messages[0].content, /<response_format>/);
  assert.match(second.messages[0].content, /<response_format>\nRespond with only a JSON object that satisfies this JSON schema/);
  assert.ok(second.messages[0].content.includes(JSON.stringify(toStructuredSchema(AFTERIMAGE_SCHEMA_V2))));
  assert.deepEqual(logged.find((entry) => entry.code === 'CLAUDE_REQUEST_REJECTED'),
    { code: 'CLAUDE_REQUEST_REJECTED', kind: 'reel', message: rejected.message });

  const twice = fakeClaude([rejected, rejected]);
  await assert.rejects(engine(twice).generateReel(request), Anthropic.BadRequestError);
  assert.equal(twice.calls.length, 2);
});

test('a request that outlives its deadline is aborted and reported', async () => {
  const claude = fakeClaude([(_params, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Anthropic.APIUserAbortError()), { once: true });
  })]);
  const bounded = engine(claude, { deadlines: { reel: 20, replacement: 20, atlas: 20 } });
  await assert.rejects(bounded.generateReel(request), { code: 'CLAUDE_TIMEOUT' });
});

test('Atlases and replacements refuse to spend a generation without the film catalogue', async () => {
  const claude = fakeClaude([]);
  const atlasInput = { anchor: { title: 'In the Mood for Love', year: '2000' }, request };
  await assert.rejects(engine(claude, { filmMetadataUrl: '' }).generateAtlas(atlasInput), { code: 'METADATA_NOT_CONFIGURED' });
  assert.equal(claude.calls.length, 0);
});

test('invalid requests are rejected before Claude is called', async () => {
  const claude = fakeClaude([]);
  await assert.rejects(engine(claude).generateReel({ films: [] }), { code: 'BAD_REQUEST' });
  await assert.rejects(engine(claude).generateReel({ films: ['A', 'a'] }), { code: 'BAD_REQUEST' });
  assert.equal(claude.calls.length, 0);
});

test('fallbacks can be turned off, and Haiku omits controls it does not accept', async () => {
  const plain = fakeClaude([answer(reel())]);
  await engine(plain, { fallbacks: false }).generateReel(request);
  assert.equal('betas' in plain.calls[0].params, false);
  assert.equal('fallbacks' in plain.calls[0].params, false);

  const haiku = fakeClaude([answer(reel())]);
  await engine(haiku, { model: 'claude-haiku-4-5' }).generateReel(request);
  const { params } = haiku.calls[0];
  assert.equal(params.model, 'claude-haiku-4-5');
  assert.equal('thinking' in params, false);
  assert.equal('effort' in params.output_config, false);
  assert.equal('fallbacks' in params, false);
});

test('status reports connected, missing and rejected credentials honestly and caches the answer', async () => {
  let now = 0;
  let retrievals = 0;
  const connected = engine(fakeClaude([], { retrieve: async () => { retrievals += 1; return { id: DEFAULT_MODEL }; } }), { now: () => now });
  assert.deepEqual(await connected.status(), { connected: true, reason: null });
  assert.deepEqual(await connected.status(), { connected: true, reason: null });
  assert.equal(retrievals, 1);
  now += 11 * 60 * 1000;
  await connected.status();
  assert.equal(retrievals, 2);
  await connected.status({ fresh: true });
  assert.equal(retrievals, 3);

  const missing = engine(fakeClaude([], { retrieve: async () => { throw new Error('Could not resolve authentication method.'); } }));
  assert.deepEqual(await missing.status(), { connected: false, reason: 'missing' });

  const rejected = engine(fakeClaude([], {
    retrieve: async () => { throw new Anthropic.AuthenticationError(401, {}, 'invalid x-api-key', new Headers()); },
  }));
  assert.deepEqual(await rejected.status(), { connected: false, reason: 'rejected' });

  const offline = engine(fakeClaude([], { retrieve: async () => { throw new Anthropic.APIConnectionError({ message: 'offline' }); } }));
  await assert.rejects(offline.status(), { code: 'CLAUDE_UNAVAILABLE' });
});

test('configuration defaults to Claude Opus 5.5 at high effort and rejects unknown values', () => {
  assert.deepEqual(resolveClaudeConfig({}), { model: 'claude-opus-5-5', effort: 'high', fallbacks: true });
  assert.deepEqual(
    resolveClaudeConfig({ AFTERIMAGE_CLAUDE_MODEL: 'claude-sonnet-5-5', AFTERIMAGE_CLAUDE_EFFORT: 'medium', AFTERIMAGE_CLAUDE_FALLBACKS: 'off' }),
    { model: 'claude-sonnet-5-5', effort: 'medium', fallbacks: false },
  );
  assert.throws(() => resolveClaudeConfig({ AFTERIMAGE_CLAUDE_MODEL: 'gpt-6-astra' }), /Claude model/);
  assert.throws(() => resolveClaudeConfig({ AFTERIMAGE_CLAUDE_EFFORT: 'ultra' }), /EFFORT/);
  assert.throws(() => resolveClaudeConfig({ AFTERIMAGE_CLAUDE_FALLBACKS: 'maybe' }), /FALLBACKS/);
});
