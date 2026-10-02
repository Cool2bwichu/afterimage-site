import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ClaudeEngine } from '../lib/claude-engine.mjs';
import { FailureThrottle, clientKey, createCompanionServer, createEngine, createFilmRoutes, createGenerationProtocol, parseAllowedOrigins, tokenShape } from '../server.mjs';
import { answer, fakeClaude } from './fake-anthropic.mjs';
import { withServer } from './http-helpers.mjs';

import { parseJobStart, parseJobStatus } from '../../app/lib/generation-state.ts';

const PASSPHRASE = 'a-long-private-passphrase';
const SITE = 'https://cool2bwichu.github.io';
const reel = {
  status: 'complete', sourceFilms: [], persona: 'Patient Longing', insight: 'Distance gives tenderness its shape.',
  palette: ['#101820', '#2b3a42', '#c8a97e', '#e8dcc8', '#7a3b2e'],
  sensibilities: ['patient framing', 'soft restraint', 'quiet voices'],
  spiritDirector: { name: 'Wim Wenders', reason: 'His frames let distance carry emotion.' },
  recommendations: ['The Green Ray', 'After Yang', 'Past Lives', 'The Rider', 'Still Walking'].map((title, index) => ({
    title, year: String(1986 + index * 7), timecode: `00:0${index}:12:00`,
    reason: `${title} keeps its people at a tender distance.`, watchFor: `Watch how ${title} holds its wide frames.`,
  })),
};

async function withSiteApi(run, { claude = fakeClaude([answer(reel)]), films, ...options } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'afterimage-site-api-'));
  try {
    const engine = new ClaudeEngine({ client: claude });
    const generationCoordinator = await createGenerationProtocol({ engine, directory });
    const server = createCompanionServer({
      engine, generationCoordinator, secret: 'bridge-secret', passphrase: PASSPHRASE, allowedOrigins: [SITE],
      films: films ?? createFilmRoutes(), production: false, log: () => {}, ...options,
    });
    await withServer(server, (origin) => run({
      coordinator: generationCoordinator,
      call: (path, { body, method = body === undefined ? 'GET' : 'POST', passphrase = PASSPHRASE, from = SITE, headers = {} } = {}) => fetch(origin + path, {
        method,
        headers: {
          ...(passphrase ? { authorization: 'Bearer ' + passphrase } : {}),
          ...(from ? { origin: from } : {}),
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('the browser API answers only with the passphrase, and only to the allowed site', async () => {
  await withSiteApi(async ({ call }) => {
    const locked = await call('/api/status', { passphrase: '' });
    assert.equal(locked.status, 401);
    assert.equal(locked.headers.get('access-control-allow-origin'), SITE);
    assert.deepEqual(await locked.json(), { error: 'Enter this AFTERIMAGE\'s passphrase to reach its companion.', code: 'PASSPHRASE_REQUIRED' });
    assert.equal((await call('/api/status', { passphrase: 'wrong-passphrase' })).status, 401);
    // The bridge secret opens the bridge routes, not the browser ones.
    assert.equal((await call('/api/status', { passphrase: 'bridge-secret' })).status, 401);

    const open = await call('/api/status');
    assert.equal(open.status, 200);
    assert.equal(open.headers.get('access-control-allow-origin'), SITE);
    assert.equal(open.headers.get('vary'), 'Origin');
    const status = await open.json();
    assert.equal(status.authenticated, true);
    assert.equal(status.generation.model, 'claude-opus-5-5');

    const foreign = await call('/api/status', { from: 'https://someone-else.example' });
    assert.equal(foreign.status, 403);
    assert.equal(foreign.headers.get('access-control-allow-origin'), null);

    // Without an Origin header (a script, not a browser page) the passphrase still decides.
    assert.equal((await call('/api/status', { from: null })).status, 200);
  });
});

test('preflight requests are answered for the allowed site only', async () => {
  await withSiteApi(async ({ call }) => {
    const preflight = await call('/api/generations', { method: 'OPTIONS', passphrase: '', headers: { 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), SITE);
    assert.equal(preflight.headers.get('access-control-allow-methods'), 'GET, POST, OPTIONS');
    assert.equal(preflight.headers.get('access-control-allow-headers'), 'Authorization, Content-Type');
    const foreign = await call('/api/generations', { method: 'OPTIONS', passphrase: '', from: 'https://evil.example' });
    assert.equal(foreign.status, 403);
  });
});

test('a reel is developed through the browser API in the shape the site parses', async () => {
  await withSiteApi(async ({ call, coordinator }) => {
    const accepted = await call('/api/generations', { body: { films: [], creativeBrief: 'Tender distance.' } });
    assert.equal(accepted.status, 202);
    const { jobId } = parseJobStart(await accepted.json());
    await coordinator.whenIdle();
    const job = parseJobStatus(await (await call('/api/generations/' + jobId)).json());
    assert.equal(job.status, 'complete');
    assert.equal(job.reel.persona, 'Patient Longing');
    assert.equal((await call('/api/generations/' + jobId, { passphrase: '' })).status, 401);
    assert.equal((await call('/api/generations/not-a-job')).status, 404);
  });
});

test('repeated wrong passphrases from one address are refused for a while', async () => {
  let now = 0;
  const throttle = new FailureThrottle({ limit: 3, windowMs: 60000, now: () => now });
  await withSiteApi(async ({ call }) => {
    for (let attempt = 0; attempt < 3; attempt += 1) assert.equal((await call('/api/status', { passphrase: 'guess-' + attempt })).status, 401);
    const blocked = await call('/api/status');
    assert.equal(blocked.status, 429);
    assert.equal((await blocked.json()).code, 'PASSPHRASE_THROTTLED');
    now += 61000;
    assert.equal((await call('/api/status')).status, 200);
  }, { throttle });
});

test('the throttle counts the address the edge proxy saw, not one the client wrote', async () => {
  const throttle = new FailureThrottle({ limit: 2, windowMs: 60000 });
  await withSiteApi(async ({ call }) => {
    for (const spoofed of ['10.0.0.1', '10.0.0.2']) {
      assert.equal((await call('/api/status', { passphrase: 'guess', headers: { 'x-forwarded-for': spoofed + ', 203.0.113.9' } })).status, 401);
    }
    assert.equal((await call('/api/status', { headers: { 'x-forwarded-for': '10.0.0.3, 203.0.113.9' } })).status, 429);
    assert.equal((await call('/api/status', { headers: { 'x-forwarded-for': '198.51.100.4' } })).status, 200);
  }, { throttle });
  assert.equal(clientKey({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }), '127.0.0.1');
});

test('a companion without a passphrase keeps the browser API closed; the bridge routes still work', async () => {
  await withSiteApi(async ({ call }) => {
    const closed = await call('/api/status');
    assert.equal(closed.status, 503);
    assert.equal((await closed.json()).code, 'SITE_API_DISABLED');
    const bridge = await call('/v1/auth/status', { passphrase: 'bridge-secret', from: null });
    assert.equal(bridge.status, 200);
  }, { passphrase: '' });
});

test('production refuses unsafe browser settings at startup', () => {
  const base = { engine: {}, generationCoordinator: {}, production: true, log: () => {} };
  assert.throws(() => createCompanionServer({ ...base, secret: '', passphrase: '' }), /AFTERIMAGE_BRIDGE_SECRET .* or AFTERIMAGE_SITE_PASSPHRASE/);
  assert.throws(() => createCompanionServer({ ...base, secret: '', passphrase: 'short', allowedOrigins: [SITE] }), /at least 16 characters/);
  assert.throws(() => createCompanionServer({ ...base, secret: '', passphrase: PASSPHRASE, allowedOrigins: [] }), /AFTERIMAGE_ALLOWED_ORIGINS/);
  assert.ok(createCompanionServer({ ...base, secret: '', passphrase: PASSPHRASE, allowedOrigins: [SITE] }));
  assert.deepEqual(parseAllowedOrigins(' https://cool2bwichu.github.io/ , http://localhost:4173'), ['https://cool2bwichu.github.io', 'http://localhost:4173']);
});

test('outside production, local development origins are allowed when none are listed', async () => {
  await withSiteApi(async ({ call }) => {
    assert.equal((await call('/api/status', { from: 'http://localhost:4173' })).status, 200);
    assert.equal((await call('/api/status', { from: 'http://127.0.0.1:5173' })).status, 200);
    assert.equal((await call('/api/status', { from: SITE })).status, 403);
  }, { allowedOrigins: [] });
});

// A stand-in for TMDB's search endpoint.
async function withFakeTmdb(run) {
  const seen = [];
  const server = createServer((request, response) => {
    seen.push({ url: request.url, authorization: request.headers.authorization });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ results: [{ id: 843, title: 'In the Mood for Love', release_date: '2000-09-29', poster_path: '/poster.jpg', overview: 'Two neighbours.' }] }));
  });
  return withServer(server, (origin) => run(origin, seen));
}

test('film search runs through the site\'s TMDB code with the companion\'s token', async () => {
  await withFakeTmdb(async (tmdb, seen) => {
    await withSiteApi(async ({ call }) => {
      const response = await call('/api/films/search?q=mood%20for%20love');
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('access-control-allow-origin'), SITE);
      const { films } = await response.json();
      assert.equal(films[0].title, 'In the Mood for Love');
      assert.equal(films[0].year, '2000');
      assert.match(seen[0].url, /^\/search\/movie\?/);
      assert.equal(seen[0].authorization, 'Bearer tmdb-token');
      assert.equal((await call('/api/films/search?q=x')).status, 400);
    }, { films: createFilmRoutes({ token: 'tmdb-token', baseUrl: tmdb }) });
  });

  await withSiteApi(async ({ call }) => {
    const missing = await call('/api/films/enrich', { body: { films: [{ title: 'Cure', year: '1997' }] } });
    assert.equal(missing.status, 503);
    assert.equal((await missing.json()).code, 'METADATA_NOT_CONFIGURED');
  }, { films: createFilmRoutes({ token: '' }) });
});

test('without a metadata URL, Atlas and replacement films are verified in-process', async () => {
  const calls = [];
  const films = {
    search: async () => Response.json({ films: [] }),
    enrich: async (request) => {
      const { films: requested } = await request.json();
      calls.push(requested);
      return Response.json({ films: requested.map((film, index) => ({
        key: film.title.toLowerCase() + '|' + film.year, title: film.title, year: film.year, status: 'matched', lookupVersion: 2,
        tmdbId: 900 + index, imdbId: null, tmdbRating: null, posterUrl: null, overview: null, runtime: null, releaseDate: null,
        genres: [], countries: [], directors: [],
      })) });
    },
  };
  const engine = createEngine({ auth: 'api', model: 'claude-opus-5-5', effort: 'high', fallbacks: true },
    { env: { TMDB_READ_TOKEN: 'tmdb-token' }, films, log: () => {} });
  const records = await engine.metadataProvider([{ title: 'Cure', year: '1997' }]);
  assert.equal(records[0].status, 'matched');
  assert.equal(records[0].tmdbId, 900);
  assert.deepEqual(calls, [[{ title: 'Cure', year: '1997' }]]);

  const external = createEngine({ auth: 'api', model: 'claude-opus-5-5', effort: 'high', fallbacks: true },
    { env: { TMDB_READ_TOKEN: 'tmdb-token', AFTERIMAGE_FILM_METADATA_URL: 'https://site.example/api/films/enrich' }, films, log: () => {} });
  assert.equal(external.metadataProvider, undefined);
});

test('the token shape shows a mangled paste without revealing the token', () => {
  const token = 'sk-ant-oat01-' + 'a'.repeat(117);
  assert.deepEqual(tokenShape(token + '\n'), { present: true, length: 130, expectedPrefix: true, onlyTokenCharacters: true, surroundingWhitespace: true });
  assert.deepEqual(tokenShape('"' + token.slice(0, 60)), { present: true, length: 61, expectedPrefix: false, onlyTokenCharacters: false, surroundingWhitespace: false });
  assert.equal(JSON.stringify(tokenShape(token)).includes('aaaa'), false);
  assert.deepEqual(tokenShape(undefined), { present: false, length: 0, expectedPrefix: false, onlyTokenCharacters: true, surroundingWhitespace: false });
});
