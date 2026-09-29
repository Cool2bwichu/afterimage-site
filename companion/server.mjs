import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateAtlasInput } from './lib/atlas-contract.mjs';
import { ClaudeCodeRunner } from './lib/claude-code-runner.mjs';
import { ClaudeEngine, resolveClaudeConfig } from './lib/claude-engine.mjs';
import { GenerationCoordinator } from './lib/generation-coordinator.mjs';
import { JOB_ID_PATTERN, JobStore } from './lib/job-store.mjs';
import { validateReplacementInput } from './lib/replacement-contract.mjs';
import { validateV2Input } from './lib/v2-contract.mjs';

// The same private HTTP contract as the subscription bridge, so the site's
// existing server routes can talk to Claude without changing shape.
const MAX_BODY_BYTES = 384 * 1024; // Bounded 500-film taste history, including Unicode titles.
const DEVELOPMENT_SECRET = 'afterimage-local-development';
const JOB_DIRECTORY_CONFIGURATION_ERROR = 'AFTERIMAGE_JOB_DIR must target persistent storage in production.';
const NOT_CONNECTED = {
  subscription: {
    missing: 'Claude is not connected. Run `claude setup-token` with your Claude subscription, set CLAUDE_CODE_OAUTH_TOKEN for the AFTERIMAGE companion and restart it.',
    rejected: 'Claude did not accept the subscription token. Run `claude setup-token` again, replace CLAUDE_CODE_OAUTH_TOKEN and restart the companion.',
    'cli-missing': 'Claude Code is not installed where the AFTERIMAGE companion runs. Install it (see companion/README.md) and restart the companion.',
  },
  api: {
    missing: 'Claude is not connected. Set ANTHROPIC_API_KEY for the AFTERIMAGE companion and restart it.',
    rejected: 'Claude did not accept the companion\'s Anthropic API key. Replace ANTHROPIC_API_KEY and restart the companion.',
  },
};
const AUTH_MODES = { subscription: 'claude-subscription', api: 'anthropic-api' };

export function createEngine(config, { env = process.env, log } = {}) {
  const runner = config.auth === 'subscription'
    ? new ClaudeCodeRunner({
      binary: env.CLAUDE_BIN || 'claude',
      token: env.CLAUDE_CODE_OAUTH_TOKEN || '',
      model: config.model,
      effort: config.effort,
      workdir: env.AFTERIMAGE_CLAUDE_WORKDIR || undefined,
      env,
      log,
    })
    : undefined;
  return new ClaudeEngine({ ...config, runner, log });
}

function secretsMatch(candidate, secret) {
  const left = Buffer.from(candidate || '');
  const right = Buffer.from(secret || '');
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

function readBearer(request) {
  const header = request.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Request body is too large.'), { code: 'BAD_REQUEST' });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  response.end(JSON.stringify(payload));
}

export function createCompanionServer({
  engine,
  generationCoordinator,
  secret = process.env.AFTERIMAGE_BRIDGE_SECRET || (process.env.NODE_ENV === 'production' ? '' : DEVELOPMENT_SECRET),
  log = console.error,
}) {
  if (!secret || (process.env.NODE_ENV === 'production' && secret.length < 24)) {
    throw new Error('AFTERIMAGE_BRIDGE_SECRET must contain at least 24 characters in production.');
  }

  return createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://localhost');

    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, { ok: true, service: 'afterimage-claude-companion' });
      return;
    }

    if (!secretsMatch(readBearer(request), secret)) {
      sendJson(response, 401, { error: 'Unauthorized.' });
      return;
    }

    try {
      if (request.method === 'GET' && url.pathname === '/v1/auth/status') {
        const status = await engine.status();
        const described = engine.describe();
        sendJson(response, 200, {
          authenticated: status.connected,
          planType: null,
          authMode: status.connected ? AUTH_MODES[described.auth] : null,
          ...(status.reason ? { reason: status.reason } : {}),
          generation: described,
        });
        return;
      }

      // Claude uses the companion's own credential (a subscription token or an API
      // key); there is no sign-in to start from the browser. This re-checks it so
      // the site's connect button reports the truth.
      if (request.method === 'POST' && url.pathname === '/v1/auth/start') {
        const status = await engine.status({ fresh: true });
        if (status.connected) {
          sendJson(response, 200, { alreadyAuthenticated: true, planType: null });
        } else {
          const messages = NOT_CONNECTED[engine.describe().auth] || NOT_CONNECTED.api;
          sendJson(response, 503, { error: messages[status.reason] || messages.missing, code: 'CLAUDE_NOT_CONNECTED' });
        }
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v2/generations') {
        const input = validateV2Input(await readJson(request));
        const job = await generationCoordinator.start(input);
        sendJson(response, 202, { jobId: job.jobId, status: job.status });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v2/atlas/generations') {
        const input = validateAtlasInput(await readJson(request));
        const job = await generationCoordinator.start({ atlasRequest: input });
        sendJson(response, 202, { jobId: job.jobId, status: job.status });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/v2/replacements/generations') {
        const input = validateReplacementInput(await readJson(request));
        const job = await generationCoordinator.start({ replacementRequest: input });
        sendJson(response, 202, { jobId: job.jobId, status: job.status });
        return;
      }

      if (request.method === 'GET' && url.pathname.startsWith('/v2/generations/')) {
        const jobId = url.pathname.match(/^\/v2\/generations\/([^/]+)$/)?.[1];
        const job = jobId && JOB_ID_PATTERN.test(jobId) ? generationCoordinator.get(jobId) : null;
        if (job) sendJson(response, 200, job);
        else sendJson(response, 404, { error: 'This reel job is no longer available.', code: 'JOB_NOT_FOUND' });
        return;
      }

      sendJson(response, 404, { error: 'Not found.' });
    } catch (error) {
      if (error.code === 'ACTIVE_GENERATION') {
        sendJson(response, 409, { error: 'A reel is already developing.', code: 'ACTIVE_GENERATION', jobId: error.jobId });
        return;
      }
      if (error.code === 'CLAUDE_UNAVAILABLE') {
        sendJson(response, 502, { error: 'Claude is busy or unreachable right now.', code: 'CLAUDE_UNAVAILABLE' });
        return;
      }
      const status = error.code === 'BAD_REQUEST' || error instanceof SyntaxError ? 400 : 500;
      sendJson(response, status, {
        error: status === 500
          ? 'AFTERIMAGE could not complete this request cleanly.'
          : error instanceof SyntaxError ? 'Request body must be valid JSON.' : error.message,
        code: error.code || null,
      });
      if (status === 500) log({ code: 'COMPANION_REQUEST_FAILED' });
    }
  });
}

export async function createGenerationProtocol({ engine, directory, log = () => {} }) {
  const store = new JobStore({ directory });
  await store.initialize();
  return new GenerationCoordinator({
    store,
    logError: log,
    generate: (input) => {
      if (input.atlasRequest) return engine.generateAtlas(input.atlasRequest);
      if (input.replacementRequest) return engine.generateReplacement(input.replacementRequest);
      return engine.generateReel(input);
    },
  });
}

export async function startCompanionServer(options = {}) {
  const port = Number(process.env.PORT || 8788);
  const log = options.log ?? console.log;
  // One JSON line per event: token counts and failure codes, never request content.
  const record = (entry) => console.error(JSON.stringify(entry));
  const engine = options.engine ?? createEngine(resolveClaudeConfig(), { log: record });
  const configuredDirectory = process.env.AFTERIMAGE_JOB_DIR;
  if (process.env.NODE_ENV === 'production' && !configuredDirectory) throw new Error(JOB_DIRECTORY_CONFIGURATION_ERROR);
  const directory = configuredDirectory || fileURLToPath(new URL('./data/generation-jobs', import.meta.url));
  const generationCoordinator = options.generationCoordinator ??
    await createGenerationProtocol({ engine, directory, log: record });
  const server = createCompanionServer({ ...options, engine, generationCoordinator });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', resolveListen);
  });
  let shutdown;
  server.gracefulShutdown = () => {
    shutdown ??= (async () => {
      if (server.listening) await new Promise((resolveClose) => server.close(() => resolveClose()));
      await generationCoordinator.whenIdle();
    })();
    return shutdown;
  };
  const described = engine.describe();
  log(`AFTERIMAGE Claude companion listening on port ${port} (${described.model}, ${described.reasoningEffort} effort, ${described.auth === 'subscription' ? 'Claude subscription through Claude Code' : 'Anthropic API key'})`);
  return server;
}

const isEntryPoint = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isEntryPoint) {
  startCompanionServer()
    .then((server) => {
      const stop = () => server.gracefulShutdown().catch(() => { process.exitCode = 1; });
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    })
    .catch((error) => {
      console.error(error?.message === JOB_DIRECTORY_CONFIGURATION_ERROR
        ? JOB_DIRECTORY_CONFIGURATION_ERROR
        : 'AFTERIMAGE Claude companion failed to start: ' + (error?.message || 'unknown error'));
      process.exitCode = 1;
    });
}
