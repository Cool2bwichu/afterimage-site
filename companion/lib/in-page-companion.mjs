// AFTERIMAGE's private routes answered inside the page, for the claude.ai
// Artifact edition. There is no companion server there: the page asks Claude
// through the Artifact's `sample` capability, on the viewer's own Claude
// account, with the companion's brief, schemas and validators.
//
// An Artifact cannot reach other sites, so TMDB is out of reach. Film search and
// film details answer METADATA_NOT_CONFIGURED, as a companion without a TMDB
// token does, and Atlas and replacement films are held to the content rules
// only, not checked against the catalogue.
import { ATLAS_CANDIDATE_SCHEMA, normalizeAtlasResult, validateAtlasInput } from './atlas-contract.mjs';
import {
  ATLAS_SYSTEM,
  LIGHT_TABLE_SYSTEM,
  REEL_SYSTEM,
  REPLACEMENT_SYSTEM,
  buildAtlasPrompt,
  buildReelPrompt,
  buildReplacementPrompt,
  isLightTable,
} from './prompts.mjs';
import { completeReplacement, createReplacementSchema, validateReplacementInput } from './replacement-contract.mjs';
import { toStructuredSchema } from './structured-output.mjs';
import { AFTERIMAGE_LIGHT_TABLE_SCHEMA_V1, AFTERIMAGE_SCHEMA_V2, normalizeV2Result, validateV2Input } from './v2-contract.mjs';

const OPEN_IN_CLAUDE = 'This copy of AFTERIMAGE asks Claude from inside claude.ai, on your own Claude account. Open it from your Artifacts in claude.ai, then check again.';
const NO_CATALOGUE = 'Film search and film details need the TMDB catalogue, which this copy of AFTERIMAGE cannot reach from claude.ai.';

export const IN_PAGE_FAILURES = Object.freeze({
  AUTH_REQUIRED: { code: 'AUTH_REQUIRED', message: 'Your claude.ai session has ended. Sign in again, then develop the reel again.' },
  CLAUDE_NOT_ALLOWED: { code: 'CLAUDE_NOT_ALLOWED', message: 'AFTERIMAGE was not allowed to ask Claude in this view. Reload it, allow it to use Claude, then develop again.' },
  CLAUDE_USAGE_LIMIT: { code: 'CLAUDE_USAGE_LIMIT', message: 'Claude is at its limit for now: your plan\'s usage limit, or too many requests at once. Your inputs are saved; try again in a little while.' },
  CLAUDE_DECLINED: { code: 'CLAUDE_DECLINED', message: 'Claude declined to develop this request. Try describing it differently.' },
  CLAUDE_UNAVAILABLE: { code: 'CLAUDE_UNAVAILABLE', message: 'Claude is busy or unreachable right now. Your inputs are saved; try again in a minute.' },
  GENERATION_FAILED: { code: 'GENERATION_FAILED', message: 'AFTERIMAGE could not develop this reel cleanly.' },
});

const SAMPLE_FAILURES = {
  not_granted: 'CLAUDE_NOT_ALLOWED',
  sampling_disabled: 'CLAUDE_NOT_ALLOWED',
  not_declared: 'CLAUDE_NOT_ALLOWED',
  capability_disabled: 'CLAUDE_NOT_ALLOWED',
  capability_removed: 'CLAUDE_NOT_ALLOWED',
  session_expired: 'AUTH_REQUIRED',
  rate_limited: 'CLAUDE_USAGE_LIMIT',
  refused: 'CLAUDE_DECLINED',
  upstream_error: 'CLAUDE_UNAVAILABLE',
  empty_completion: 'CLAUDE_UNAVAILABLE',
};

// `sample` rejects with a plain {code, message} object; the validators throw
// Errors without a code. Malformed JSON and a broken rule earn one more attempt.
function isContentProblem(error) {
  return error?.code === 'invalid_json' || (error instanceof Error && error.code === undefined);
}

function failureFor(error) {
  return IN_PAGE_FAILURES[SAMPLE_FAILURES[error?.code]] ?? IN_PAGE_FAILURES.GENERATION_FAILED;
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

function readBody(init) {
  if (typeof init?.body !== 'string') throw Object.assign(new Error('Request body must be JSON.'), { code: 'BAD_REQUEST' });
  try { return JSON.parse(init.body); } catch { throw Object.assign(new Error('Request body must be valid JSON.'), { code: 'BAD_REQUEST' }); }
}

export function createInPageCompanion({
  getSample,
  modelTier = 'complex',
  idFactory = () => crypto.randomUUID(),
  now = () => Date.now(),
  log = () => {},
} = {}) {
  let samplePromise;
  const sample = () => (samplePromise ??= Promise.resolve().then(getSample).catch(() => null));
  const jobs = new Map();
  let activeJobId = null;

  async function ask(system, prompt, schema) {
    const claude = await sample();
    if (!claude) throw { code: 'not_granted' };
    const format = JSON.stringify(toStructuredSchema(schema));
    return claude.json(
      `${system}\n\n${prompt}\n\n<response_format>\nRespond with only a JSON object that satisfies this JSON schema, with no other text:\n${format}\n</response_format>`,
      { modelTier, cache: false },
    );
  }

  async function generate({ system, prompt, schema, finish }) {
    let rejection = '';
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await finish(await ask(system, prompt(rejection), schema));
      } catch (error) {
        if (attempt >= 2 || !isContentProblem(error)) throw error;
        rejection = String(error.message || 'The answer was invalid.').slice(0, 300);
        log({ code: 'CLAUDE_ANSWER_REJECTED', attempt });
      }
    }
  }

  const operations = {
    reel(input) {
      const lightTable = isLightTable(input);
      return generate({
        system: lightTable ? LIGHT_TABLE_SYSTEM : REEL_SYSTEM,
        prompt: (rejection) => buildReelPrompt(input, rejection),
        schema: lightTable ? AFTERIMAGE_LIGHT_TABLE_SCHEMA_V1 : AFTERIMAGE_SCHEMA_V2,
        finish: (raw) => normalizeV2Result(raw, input.films, input.excludedFilms, {
          experience: input.experience,
          selectedFacets: input.selectedFacets,
          likedFilms: input.likedFilms,
        }),
      });
    },
    replacement(input) {
      return generate({
        system: REPLACEMENT_SYSTEM,
        prompt: (rejection) => buildReplacementPrompt(input, rejection),
        schema: createReplacementSchema(input.request.experience),
        finish: (raw) => completeReplacement(raw, input),
      });
    },
    atlas(input) {
      return generate({
        system: ATLAS_SYSTEM,
        prompt: (rejection) => buildAtlasPrompt(input, rejection),
        schema: ATLAS_CANDIDATE_SCHEMA,
        // The companion keeps the first six neighbours the catalogue verifies; here
        // the content rules have already removed sources, repeats and exclusions.
        finish: (raw) => {
          const atlas = normalizeAtlasResult(raw, input, true);
          return { ...atlas, anchor: { ...atlas.anchor, ...(input.anchor.tmdbId ? { tmdbId: input.anchor.tmdbId } : {}) }, neighbors: atlas.neighbors.slice(0, 6) };
        },
      });
    },
  };

  const validators = { reel: validateV2Input, replacement: validateReplacementInput, atlas: validateAtlasInput };

  function publicJob(job) {
    const payload = { jobId: job.id, status: job.status, createdAt: job.createdAt, updatedAt: job.updatedAt };
    if (job.status === 'complete') payload.reel = job.reel;
    if (job.status === 'failed') payload.error = job.error;
    return payload;
  }

  function update(job, changes) {
    Object.assign(job, changes, { updatedAt: new Date(now()).toISOString() });
  }

  function start(kind, body) {
    const input = validators[kind](body);
    if (activeJobId) throw Object.assign(new Error('A reel is already developing.'), { code: 'ACTIVE_GENERATION', jobId: activeJobId });
    const timestamp = new Date(now()).toISOString();
    const job = { id: idFactory(), status: 'queued', createdAt: timestamp, updatedAt: timestamp };
    jobs.set(job.id, job);
    activeJobId = job.id;
    job.done = (async () => {
      await Promise.resolve();
      update(job, { status: 'running' });
      try {
        update(job, { status: 'complete', reel: await operations[kind](input) });
      } catch (error) {
        const failure = failureFor(error);
        if (failure.code === 'GENERATION_FAILED') log({ code: failure.code, jobId: job.id });
        update(job, { status: 'failed', error: { ...failure } });
      } finally {
        if (activeJobId === job.id) activeJobId = null;
      }
    })();
    return publicJob(job);
  }

  async function status() {
    const connected = Boolean(await sample());
    return {
      authenticated: connected,
      planType: null,
      authMode: connected ? 'claude-in-page' : null,
      ...(connected ? {} : { reason: 'unavailable' }),
      generation: { provider: 'claude.ai', auth: 'in-page', model: null, reasoningEffort: null, engine: 'claude' },
    };
  }

  const STARTS = {
    'POST /api/generations': 'reel',
    'POST /api/atlas/generations': 'atlas',
    'POST /api/replacements/generations': 'replacement',
  };

  async function handle(path, init = {}) {
    const url = new URL(path, 'https://afterimage.invalid');
    const method = (init.method || 'GET').toUpperCase();
    const route = `${method} ${url.pathname}`;
    try {
      if (route === 'GET /api/status') return json(200, await status());
      if (route === 'POST /api/connect') {
        return (await sample())
          ? json(200, { alreadyAuthenticated: true, planType: null })
          : json(503, { error: OPEN_IN_CLAUDE, code: 'CLAUDE_NOT_CONNECTED' });
      }
      if (STARTS[route]) return json(202, start(STARTS[route], readBody(init)));
      const jobMatch = method === 'GET' && url.pathname.match(/^\/api\/generations\/([^/]+)$/);
      if (jobMatch) {
        const job = jobs.get(decodeURIComponent(jobMatch[1]));
        return job ? json(200, publicJob(job)) : json(404, { error: 'This reel job is no longer available.', code: 'JOB_NOT_FOUND' });
      }
      if (route === 'GET /api/films/search' || route === 'POST /api/films/enrich') {
        return json(503, { error: NO_CATALOGUE, code: 'METADATA_NOT_CONFIGURED' });
      }
      return json(404, { error: 'Not found.' });
    } catch (error) {
      if (error?.code === 'ACTIVE_GENERATION') return json(409, { error: 'A reel is already developing.', code: 'ACTIVE_GENERATION', jobId: error.jobId });
      if (error?.code === 'BAD_REQUEST') return json(400, { error: error.message, code: 'BAD_REQUEST' });
      return json(500, { error: 'AFTERIMAGE could not complete this request cleanly.', code: null });
    }
  }

  // Lets tests wait for background work.
  handle.whenIdle = () => Promise.all([...jobs.values()].map((job) => job.done));
  return handle;
}
