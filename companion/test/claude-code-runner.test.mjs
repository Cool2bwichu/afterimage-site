import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ClaudeCodeRunner } from '../lib/claude-code-runner.mjs';
import { ClaudeEngine } from '../lib/claude-engine.mjs';
import { REEL_SYSTEM } from '../lib/prompts.mjs';
import { toStructuredSchema } from '../lib/structured-output.mjs';
import { AFTERIMAGE_SCHEMA_V2 } from '../lib/v2-contract.mjs';
import { createCompanionServer, createEngine, createGenerationProtocol } from '../server.mjs';
import { withServer } from './http-helpers.mjs';

// A stand-in `claude` executable: it records its arguments, environment, working
// directory and stdin, then prints scripted stream-json lines. Nothing reaches
// the network or a real Claude account.
async function fakeClaude(runs) {
  const directory = await mkdtemp(join(tmpdir(), 'afterimage-fake-claude-'));
  const binary = join(directory, 'claude');
  const records = join(directory, 'records');
  await writeFile(binary, `#!/usr/bin/env node
const { appendFileSync, readFileSync, writeFileSync, existsSync } = require('node:fs');
if (process.argv.includes('--version')) { console.log('2.1.284 (Claude Code)'); process.exit(0); }
const runs = ${JSON.stringify(runs)};
const counter = ${JSON.stringify(join(directory, 'count'))};
const index = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) : 0;
writeFileSync(counter, String(index + 1));
const run = runs[Math.min(index, runs.length - 1)];
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  appendFileSync(${JSON.stringify(records)}, JSON.stringify({ argv: process.argv.slice(2), env: process.env, cwd: process.cwd(), input }) + '\\n');
  setTimeout(() => {
    for (const line of run.lines || []) process.stdout.write(JSON.stringify(line) + '\\n');
    process.exit(run.exitCode ?? 0);
  }, run.delayMs || 0);
});
`);
  await chmod(binary, 0o755);
  return {
    binary,
    directory,
    async records() {
      try { return (await readFile(records, 'utf8')).trim().split('\n').map((line) => JSON.parse(line)); } catch { return []; }
    },
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

const request = {
  films: ['Paris, Texas', 'In the Mood for Love'],
  creativeBrief: 'Tender distance.',
  excludedFilms: [{ title: 'Cure', year: '1997' }],
};

function reel(titles = ['The Green Ray', 'After Yang', 'Past Lives', 'The Rider', 'Still Walking']) {
  return {
    status: 'complete', sourceFilms: [], persona: 'Patient Longing', insight: 'Distance gives tenderness its shape.',
    palette: ['#101820', '#2b3a42', '#c8a97e', '#e8dcc8', '#7a3b2e'],
    sensibilities: ['patient framing', 'soft restraint', 'quiet voices'],
    spiritDirector: { name: 'Wim Wenders', reason: 'His frames let distance carry emotion.' },
    recommendations: titles.map((title, index) => ({
      title, year: String(1986 + index * 7), timecode: `00:0${index}:12:00`,
      reason: `${title} keeps its people at a tender distance.`, watchFor: `Watch how ${title} holds its wide frames.`,
    })),
  };
}

const init = { type: 'system', subtype: 'init', model: 'claude-opus-5-5', session_id: 's' };
const success = (value, extra = {}) => ({
  type: 'result', subtype: 'success', is_error: false, result: '', structured_output: value, stop_reason: 'end_turn',
  usage: { input_tokens: 2100, output_tokens: 1400, cache_read_input_tokens: 0 }, total_cost_usd: 0.12,
  modelUsage: { 'claude-opus-5-5': {} }, session_id: 's', ...extra,
});
const failure = (error, extra = {}) => [
  init,
  { type: 'assistant', error, message: { content: [{ type: 'text', text: 'API Error' }] }, session_id: 's' },
  { type: 'result', subtype: 'success', is_error: true, result: 'API Error', usage: {}, total_cost_usd: 0, modelUsage: {}, session_id: 's', ...extra },
];

async function withRunner(runs, run, options = {}) {
  const fake = await fakeClaude(runs);
  const logged = [];
  const runner = new ClaudeCodeRunner({
    binary: fake.binary, token: 'sk-ant-oat01-test', model: 'claude-opus-5-5', effort: 'high',
    workdir: join(fake.directory, 'work'),
    env: { PATH: process.env.PATH, HOME: fake.directory, ANTHROPIC_API_KEY: 'sk-ant-must-not-leak', AFTERIMAGE_BRIDGE_SECRET: 'must-not-leak', UNRELATED: 'x' },
    log: (entry) => logged.push(entry),
    ...options,
  });
  try {
    return await run({ runner, fake, logged, engine: new ClaudeEngine({ runner, log: (entry) => logged.push(entry), ...options.engine }) });
  } finally {
    await fake.cleanup();
  }
}

test('a reel runs Claude Code headless on the subscription token with no tools and no outside configuration', async () => {
  await withRunner([{ lines: [init, success(reel())] }], async ({ engine, fake, logged }) => {
    const result = await engine.generateReel(request);
    assert.equal(result.persona, 'Patient Longing');
    assert.deepEqual(result.sourceFilms, request.films);

    const [record] = await fake.records();
    const argv = record.argv;
    const value = (flag) => argv[argv.indexOf(flag) + 1];
    assert.ok(argv.includes('-p'));
    assert.equal(value('--output-format'), 'stream-json');
    assert.ok(argv.includes('--verbose'));
    assert.equal(value('--model'), 'claude-opus-5-5');
    assert.equal(value('--effort'), 'high');
    assert.equal(value('--system-prompt'), REEL_SYSTEM);
    assert.deepEqual(JSON.parse(value('--json-schema')), toStructuredSchema(AFTERIMAGE_SCHEMA_V2));
    assert.equal(value('--tools'), '');
    assert.equal(value('--setting-sources'), '');
    assert.equal(value('--permission-mode'), 'dontAsk');
    assert.ok(argv.includes('--strict-mcp-config'));
    assert.ok(argv.includes('--no-session-persistence'));

    // The request's data goes in on stdin, never on the command line.
    assert.match(record.input, /<reference_films>\n\["Paris, Texas","In the Mood for Love"\]/);
    assert.ok(!argv.some((arg) => arg.includes('Tender distance')));

    // The subscription token is used, and nothing else from the companion's environment.
    assert.equal(record.env.CLAUDE_CODE_OAUTH_TOKEN, 'sk-ant-oat01-test');
    assert.equal(record.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, '1');
    assert.equal(record.env.CLAUDE_CONFIG_DIR, join(fake.directory, 'work', 'config'));
    // macOS resolves /var to /private/var in the child process's cwd.
    assert.equal(record.cwd, await realpath(join(fake.directory, 'work', 'run')));
    for (const key of ['ANTHROPIC_API_KEY', 'AFTERIMAGE_BRIDGE_SECRET', 'UNRELATED']) assert.equal(key in record.env, false, key);

    const usage = logged.find((entry) => entry.code === 'CLAUDE_USAGE');
    assert.deepEqual(usage, {
      code: 'CLAUDE_USAGE', kind: 'reel', auth: 'subscription', model: 'claude-opus-5-5', inputTokens: 2100, outputTokens: 1400,
      cacheReadTokens: 0, estimatedCostUsd: 0.12, subtype: 'success', stopReason: 'end_turn',
    });
  });
});

test('an answer given as text instead of structured output is still read and validated', async () => {
  await withRunner([{ lines: [init, success(null, { result: '```json\n' + JSON.stringify(reel()) + '\n```' })] }], async ({ engine }) => {
    assert.equal((await engine.generateReel(request)).recommendations.length, 5);
  });
});

test('structured-output exhaustion and rule breaks get one more run with the reason', async () => {
  const broken = reel(['Cure', 'After Yang', 'Past Lives', 'The Rider', 'Still Walking']);
  broken.recommendations[0].year = '1997';
  await withRunner([
    { lines: [init, { type: 'result', subtype: 'error_max_structured_output_retries', is_error: true, usage: {}, modelUsage: {}, session_id: 's' }] },
    { lines: [init, success(reel())] },
  ], async ({ engine, fake }) => {
    assert.equal((await engine.generateReel(request)).persona, 'Patient Longing');
    const records = await fake.records();
    assert.equal(records.length, 2);
    assert.match(records[1].input, /<previous_answer_rejected>\nA previous answer to this request failed AFTERIMAGE's validation: Claude could not produce an answer in the required structure\./);
  });
  await withRunner([{ lines: [init, success(broken)] }, { lines: [init, success(reel())] }], async ({ engine, fake }) => {
    assert.equal((await engine.generateReel(request)).recommendations[0].title, 'The Green Ray');
    assert.match((await fake.records())[1].input, /Cure was marked not interested/);
  });
});

test('a failed turn logs Claude Code\'s reason without credentials', async () => {
  const lines = failure('authentication_failed', { api_error_status: 401, result: 'Invalid bearer token sk-ant-oat01-not-a-real-token\nPlease run /login' });
  await withRunner([{ lines }], async ({ engine, logged }) => {
    await assert.rejects(engine.generateReel(request), { code: 'AUTH_REQUIRED' });
    const entry = logged.find((item) => item.code === 'CLAUDE_CODE_FAILED');
    assert.deepEqual(entry, { code: 'CLAUDE_CODE_FAILED', kind: 'reel', failure: 'AUTH_REQUIRED', subtype: 'success', error: 'authentication_failed', apiStatus: 401, reason: 'Invalid bearer token [credential]' });
  });
});

test('Claude Code failures become the prepared explanations, and a rejected token shows as disconnected', async () => {
  const cases = [
    [failure('authentication_failed', { api_error_status: 401 }), 'AUTH_REQUIRED'],
    [failure('rate_limit', { api_error_status: 429 }), 'CLAUDE_USAGE_LIMIT'],
    [failure('billing_error'), 'CLAUDE_PLAN_UNAVAILABLE'],
    [failure('model_not_found', { api_error_status: 404 }), 'CLAUDE_MODEL_UNAVAILABLE'],
    [failure('overloaded', { api_error_status: 529 }), 'CLAUDE_UNAVAILABLE'],
    [failure(undefined, { api_error_status: 429 }), 'CLAUDE_USAGE_LIMIT'],
    [[init, success(reel(), { stop_reason: 'refusal' })], 'CLAUDE_DECLINED'],
    [[init, { type: 'result', subtype: 'error_during_execution', is_error: true, usage: {}, modelUsage: {}, session_id: 's' }], 'CLAUDE_CODE_FAILED'],
  ];
  for (const [lines, code] of cases) {
    await withRunner([{ lines }], async ({ engine, runner, fake, logged }) => {
      await assert.rejects(engine.generateReel(request), { code });
      if (code !== 'CLAUDE_DECLINED') assert.ok(logged.some((entry) => entry.code === 'CLAUDE_CODE_FAILED' && entry.failure === code), code + ' is logged');
      assert.equal((await fake.records()).length, 1, code + ' is not retried by the companion');
      const status = await runner.status();
      assert.deepEqual(status, code === 'AUTH_REQUIRED' ? { connected: false, reason: 'rejected' } : { connected: true, reason: null }, code);
    });
  }
  await withRunner([{ lines: [init], exitCode: 1 }], async ({ engine, logged }) => {
    await assert.rejects(engine.generateReel(request), { code: 'CLAUDE_CODE_FAILED' });
    assert.ok(logged.some((entry) => entry.code === 'CLAUDE_CODE_FAILED' && entry.exitCode === 1));
  });
});

test('status reports a missing token or a missing Claude Code without spending the allowance', async () => {
  await withRunner([{ lines: [init, success(reel())] }], async ({ runner, engine, fake }) => {
    assert.deepEqual(await runner.status(), { connected: false, reason: 'missing' });
    await assert.rejects(engine.generateReel(request), { code: 'AUTH_REQUIRED' });
    assert.equal((await fake.records()).length, 0);
  }, { token: '' });

  await withRunner([], async ({ runner, engine }) => {
    assert.deepEqual(await runner.status(), { connected: false, reason: 'cli-missing' });
    await assert.rejects(engine.generateReel(request), { code: 'CLAUDE_CODE_MISSING' });
  }, { binary: join(tmpdir(), 'no-such-claude-binary') });

  await withRunner([{ lines: [init, success(reel())] }], async ({ runner, fake }) => {
    assert.deepEqual(await runner.status(), { connected: true, reason: null });
    assert.equal((await fake.records()).length, 0, 'the status check only runs `claude --version`');
  });
});

test('a run that outlives its deadline is stopped and reported', async () => {
  await withRunner([{ lines: [init, success(reel())], delayMs: 20000 }], async ({ engine }) => {
    const started = Date.now();
    await assert.rejects(engine.generateReel(request), { code: 'CLAUDE_TIMEOUT' });
    assert.ok(Date.now() - started < 8000);
  }, { engine: { deadlines: { reel: 300, replacement: 300, atlas: 300 } } });
});

test('the companion reports the subscription mode and explains a missing token', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'afterimage-subscription-'));
  try {
    const engine = createEngine({ auth: 'subscription', model: 'claude-opus-5-5', effort: 'high', fallbacks: true },
      { env: { PATH: process.env.PATH, AFTERIMAGE_CLAUDE_WORKDIR: join(directory, 'work') } });
    const generationCoordinator = await createGenerationProtocol({ engine, directory: join(directory, 'jobs') });
    await withServer(createCompanionServer({ engine, generationCoordinator, secret: 'test-secret', log: () => {} }), async (origin) => {
      const headers = { authorization: 'Bearer test-secret' };
      const status = await (await fetch(origin + '/v1/auth/status', { headers })).json();
      assert.deepEqual(status, {
        authenticated: false, planType: null, authMode: null, reason: 'missing',
        generation: { provider: 'claude-code', auth: 'subscription', model: 'claude-opus-5-5', reasoningEffort: 'high', engine: 'claude' },
      });
      const connect = await fetch(origin + '/v1/auth/start', { method: 'POST', headers });
      assert.equal(connect.status, 503);
      assert.deepEqual(await connect.json(), {
        error: 'Claude is not connected. Run `claude setup-token` with your Claude subscription, set CLAUDE_CODE_OAUTH_TOKEN for the AFTERIMAGE companion and restart it.',
        code: 'CLAUDE_NOT_CONNECTED',
      });
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
