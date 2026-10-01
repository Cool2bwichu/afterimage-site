import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createEnrichmentPost } from '../app/lib/enrichment-route.ts';
import { createFilmSearchGet } from '../app/lib/film-search-route.ts';
import { createTmdbClient } from '../app/lib/tmdb.server.ts';
import { validateAtlasInput } from './lib/atlas-contract.mjs';
import { ClaudeCodeRunner } from './lib/claude-code-runner.mjs';
import { ClaudeEngine, resolveClaudeConfig } from './lib/claude-engine.mjs';
import { createFilmMetadataProvider } from './lib/film-metadata.mjs';
import { GenerationCoordinator } from './lib/generation-coordinator.mjs';
import { JOB_ID_PATTERN, JobStore } from './lib/job-store.mjs';
import { validateReplacementInput } from './lib/replacement-contract.mjs';
import { validateV2Input } from './lib/v2-contract.mjs';

// Two ways in, one set of operations:
// - `/v1/*` and `/v2/*` are the subscription bridge's private contract, for a
//   site that runs its own server routes (bearer AFTERIMAGE_BRIDGE_SECRET).
// - `/api/*` mirrors those server routes for a static site, such as the GitHub
//   Pages build, calling from the browser (bearer AFTERIMAGE_SITE_PASSPHRASE,
//   allowed origins only). It also serves film search and film details.
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
const OPERATIONS = {
  'GET /v1/auth/status': 'status', 'POST /v1/auth/start': 'connect',
  'POST /v2/generations': 'reel', 'POST /v2/atlas/generations': 'atlas', 'POST /v2/replacements/generations': 'replacement',
  'GET /api/status': 'status', 'POST /api/connect': 'connect',
  'POST /api/generations': 'reel', 'POST /api/atlas/generations': 'atlas', 'POST /api/replacements/generations': 'replacement',
  'GET /api/films/search': 'filmSearch', 'POST /api/films/enrich': 'filmDetails',
};
const JOB_PATH = /^\/(?:v2|api)\/generations\/([^/]+)$/;
const LOCAL_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;
// A metadata address for the in-process catalogue; it is never requested over the network.
const IN_PROCESS_METADATA_URL = 'https://companion.invalid/api/films/enrich';

// Film search and film details, served from the site's own TMDB code.
export function createFilmRoutes({ token = '', baseUrl } = {}) {
  const options = { getToken: () => token, createClient: ({ token: credential }) => createTmdbClient({ token: credential, ...(baseUrl ? { baseUrl } : {}) }) };
  return { search: createFilmSearchGet(options), enrich: createEnrichmentPost(options) };
}

export function createEngine(config, { env = process.env, log, films } = {}) {
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
  // Atlas and replacement films are verified against the catalogue: the site's
  // endpoint when one is configured, otherwise the companion's own.
  const metadataProvider = !env.AFTERIMAGE_FILM_METADATA_URL && env.TMDB_READ_TOKEN && films
    ? createFilmMetadataProvider({ url: IN_PROCESS_METADATA_URL, timeoutMs: 20000, fetchImpl: (url, init) => films.enrich(new Request(url, init)) })
    : undefined;
  return new ClaudeEngine({ ...config, runner, log, ...(metadataProvider ? { metadataProvider } : {}) });
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

async function readBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Request body is too large.'), { code: 'BAD_REQUEST' });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(request) {
  const body = await readBody(request);
  return body.length ? JSON.parse(body.toString('utf8')) : {};
}

// Wrong passphrases or secrets from one address are slowed down: after `limit`
// failures within the window, that address is refused until the window passes.
export class FailureThrottle {
  constructor({ limit = 10, windowMs = 10 * 60 * 1000, now = Date.now } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
    this.failures = new Map();
  }

  #recent(key) {
    const cutoff = this.now() - this.windowMs;
    const times = (this.failures.get(key) || []).filter((time) => time > cutoff);
    if (times.length) this.failures.set(key, times);
    else this.failures.delete(key);
    return times;
  }

  blocked(key) {
    return this.#recent(key).length >= this.limit;
  }

  fail(key) {
    const times = this.#recent(key);
    times.push(this.now());
    this.failures.set(key, times);
    if (this.failures.size > 5000) this.failures.delete(this.failures.keys().next().value);
  }
}

// The address the host's edge proxy saw. It appends that address last, so the
// earlier entries, which the client can write itself, are ignored.
export function clientKey(request) {
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',').map((entry) => entry.trim()).filter(Boolean).at(-1);
  return forwarded || request.socket?.remoteAddress || 'unknown';
}

// What a configured subscription token looks like, without any of its secret
// part: enough to tell a partial or mangled paste from a token Claude rejects.
// `claude setup-token` prints the token on one line, starting sk-ant-oat01-.
export function tokenShape(value = '') {
  const token = String(value).trim();
  return {
    present: token.length > 0,
    length: token.length,
    expectedPrefix: token.startsWith('sk-ant-oat01-'),
    onlyTokenCharacters: /^[A-Za-z0-9_-]*$/.test(token),
    surroundingWhitespace: String(value).length !== token.length,
  };
}

export function parseAllowedOrigins(value = '') {
  return value.split(',').map((origin) => origin.trim().replace(/\/$/, '')).filter(Boolean);
}

export function createCompanionServer({
  engine,
  generationCoordinator,
  films = createFilmRoutes(),
  secret = process.env.AFTERIMAGE_BRIDGE_SECRET || (process.env.NODE_ENV === 'production' ? '' : DEVELOPMENT_SECRET),
  passphrase = process.env.AFTERIMAGE_SITE_PASSPHRASE || '',
  allowedOrigins = parseAllowedOrigins(process.env.AFTERIMAGE_ALLOWED_ORIGINS),
  throttle = new FailureThrottle(),
  production = process.env.NODE_ENV === 'production',
  log = console.error,
}) {
  if (production) {
    if (!secret && !passphrase) {
      throw new Error('Set AFTERIMAGE_BRIDGE_SECRET (for a site with server routes) or AFTERIMAGE_SITE_PASSPHRASE (for the GitHub Pages site).');
    }
    if (secret && secret.length < 24) throw new Error('AFTERIMAGE_BRIDGE_SECRET must contain at least 24 characters in production.');
    if (passphrase && passphrase.length < 16) throw new Error('AFTERIMAGE_SITE_PASSPHRASE must contain at least 16 characters in production.');
    if (passphrase && !allowedOrigins.length) {
      throw new Error('AFTERIMAGE_ALLOWED_ORIGINS must name the site\'s origin, such as https://cool2bwichu.github.io.');
    }
  }
  const originAllowed = (origin) => allowedOrigins.includes(origin) || (!production && !allowedOrigins.length && LOCAL_ORIGIN.test(origin));

  return createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://localhost');
    const site = url.pathname.startsWith('/api/');
    const origin = request.headers.origin;
    const cors = site && origin && originAllowed(origin)
      ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
      : {};
    const send = (status, payload) => {
      response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        ...cors,
      });
      response.end(JSON.stringify(payload));
    };

    if (request.method === 'GET' && url.pathname === '/health') {
      send(200, { ok: true, service: 'afterimage-claude-companion' });
      return;
    }

    if (site) {
      if (origin && !cors['Access-Control-Allow-Origin']) {
        send(403, { error: 'This site is not allowed to reach the companion.', code: 'ORIGIN_NOT_ALLOWED' });
        return;
      }
      if (request.method === 'OPTIONS') {
        response.writeHead(204, {
          ...cors,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Max-Age': '600',
        });
        response.end();
        return;
      }
      if (!passphrase) {
        send(503, { error: 'This companion does not accept browser connections. Set AFTERIMAGE_SITE_PASSPHRASE to allow them.', code: 'SITE_API_DISABLED' });
        return;
      }
    }

    const key = clientKey(request);
    if (throttle.blocked(key)) {
      send(429, { error: 'Too many wrong attempts. Try again in a few minutes.', code: 'PASSPHRASE_THROTTLED' });
      return;
    }
    if (!secretsMatch(readBearer(request), site ? passphrase : secret)) {
      throttle.fail(key);
      send(401, site
        ? { error: 'Enter this AFTERIMAGE\'s passphrase to reach its companion.', code: 'PASSPHRASE_REQUIRED' }
        : { error: 'Unauthorized.' });
      return;
    }

    try {
      const jobId = request.method === 'GET' ? url.pathname.match(JOB_PATH)?.[1] : undefined;
      if (jobId !== undefined) {
        const job = JOB_ID_PATTERN.test(jobId) ? generationCoordinator.get(jobId) : null;
        if (job) send(200, job);
        else send(404, { error: 'This reel job is no longer available.', code: 'JOB_NOT_FOUND' });
        return;
      }

      const operation = OPERATIONS[`${request.method} ${url.pathname}`];

      if (operation === 'status') {
        const status = await engine.status();
        const described = engine.describe();
        send(200, {
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
      if (operation === 'connect') {
        const status = await engine.status({ fresh: true });
        if (status.connected) {
          send(200, { alreadyAuthenticated: true, planType: null });
        } else {
          const messages = NOT_CONNECTED[engine.describe().auth] || NOT_CONNECTED.api;
          send(503, { error: messages[status.reason] || messages.missing, code: 'CLAUDE_NOT_CONNECTED' });
        }
        return;
      }

      if (operation === 'reel' || operation === 'atlas' || operation === 'replacement') {
        const body = await readJson(request);
        const input = operation === 'atlas' ? { atlasRequest: validateAtlasInput(body) }
          : operation === 'replacement' ? { replacementRequest: validateReplacementInput(body) }
            : validateV2Input(body);
        const job = await generationCoordinator.start(input);
        send(202, { jobId: job.jobId, status: job.status });
        return;
      }

      if (operation === 'filmSearch' || operation === 'filmDetails') {
        const body = request.method === 'POST' ? await readBody(request) : undefined;
        const handler = operation === 'filmSearch' ? films.search : films.enrich;
        const answer = await handler(new Request(new URL(url.pathname + url.search, 'https://companion.invalid'), {
          method: request.method,
          headers: { 'Content-Type': request.headers['content-type'] || 'application/json' },
          body,
        }));
        response.writeHead(answer.status, {
          'Content-Type': answer.headers.get('content-type') || 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
          ...cors,
        });
        response.end(Buffer.from(await answer.arrayBuffer()));
        return;
      }

      send(404, { error: 'Not found.' });
    } catch (error) {
      if (error.code === 'ACTIVE_GENERATION') {
        send(409, { error: 'A reel is already developing.', code: 'ACTIVE_GENERATION', jobId: error.jobId });
        return;
      }
      if (error.code === 'CLAUDE_UNAVAILABLE') {
        send(502, { error: 'Claude is busy or unreachable right now.', code: 'CLAUDE_UNAVAILABLE' });
        return;
      }
      const status = error.code === 'BAD_REQUEST' || error instanceof SyntaxError ? 400 : 500;
      send(status, {
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
    generate: (input, options) => {
      if (input.atlasRequest) return engine.generateAtlas(input.atlasRequest, options);
      if (input.replacementRequest) return engine.generateReplacement(input.replacementRequest, options);
      return engine.generateReel(input, options);
    },
  });
}

export async function startCompanionServer(options = {}) {
  const port = Number(process.env.PORT || 8788);
  const log = options.log ?? console.log;
  // One JSON line per event: token counts and failure codes, never request content.
  const record = (entry) => console.error(JSON.stringify(entry));
  const films = options.films ?? createFilmRoutes({ token: process.env.TMDB_READ_TOKEN || '', baseUrl: process.env.TMDB_API_BASE || undefined });
  const engine = options.engine ?? createEngine(resolveClaudeConfig(), { log: record, films });
  const configuredDirectory = process.env.AFTERIMAGE_JOB_DIR;
  if (process.env.NODE_ENV === 'production' && !configuredDirectory) throw new Error(JOB_DIRECTORY_CONFIGURATION_ERROR);
  const directory = configuredDirectory || fileURLToPath(new URL('./data/generation-jobs', import.meta.url));
  const generationCoordinator = options.generationCoordinator ??
    await createGenerationProtocol({ engine, directory, log: record });
  const server = createCompanionServer({ ...options, engine, generationCoordinator, films });
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
  if (described.auth === 'subscription') record({ code: 'CLAUDE_TOKEN_SHAPE', ...tokenShape(process.env.CLAUDE_CODE_OAUTH_TOKEN) });
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
