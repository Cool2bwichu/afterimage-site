import Anthropic from '@anthropic-ai/sdk';

import { normalizeAtlasResult, validateAtlasInput, verifyAtlas, ATLAS_CANDIDATE_SCHEMA } from './atlas-contract.mjs';
import { createDraftReporter } from './drafts.mjs';
import { createFilmMetadataProvider } from './film-metadata.mjs';
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
import { EFFORTS, engineError } from './engine-error.mjs';
import { MessagesRunner } from './messages-runner.mjs';
import { completeReplacement, createReplacementSchema, validateReplacementInput, verifyReplacementIdentity } from './replacement-contract.mjs';
import { extractJson, toStructuredSchema } from './structured-output.mjs';
import { AFTERIMAGE_LIGHT_TABLE_SCHEMA_V1, AFTERIMAGE_SCHEMA_V2, normalizeV2Result, validateV2Input } from './v2-contract.mjs';

export const DEFAULT_MODEL = 'claude-opus-5-5';
export const DEFAULT_EFFORT = 'high';

// Bounded wall-clock time for one operation, including a validation retry. The
// resumable job keeps the site's polling independent of these deadlines.
export const DEADLINES = Object.freeze({ reel: 300000, replacement: 240000, atlas: 420000 });

// How the companion reaches Claude: `subscription` runs Claude Code signed in
// with the owner's Claude plan (CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`);
// `api` calls the Messages API with an Anthropic API key. When unset, the
// credential that is present decides, and the subscription is the default.
function resolveAuth(env) {
  const explicit = (env.AFTERIMAGE_CLAUDE_AUTH || '').trim();
  if (explicit) {
    if (!['subscription', 'api'].includes(explicit)) throw new Error('AFTERIMAGE_CLAUDE_AUTH must be subscription or api.');
    return explicit;
  }
  if (env.CLAUDE_CODE_OAUTH_TOKEN) return 'subscription';
  if (env.ANTHROPIC_API_KEY) return 'api';
  return 'subscription';
}

export function resolveClaudeConfig(env = process.env) {
  const model = (env.AFTERIMAGE_CLAUDE_MODEL || DEFAULT_MODEL).trim();
  if (!/^claude-[a-z0-9.-]+$/.test(model)) throw new Error('AFTERIMAGE_CLAUDE_MODEL must be a Claude model ID.');
  const effort = (env.AFTERIMAGE_CLAUDE_EFFORT || DEFAULT_EFFORT).trim();
  if (!EFFORTS.has(effort)) throw new Error('AFTERIMAGE_CLAUDE_EFFORT must be low, medium, high, xhigh or max.');
  const fallbacks = (env.AFTERIMAGE_CLAUDE_FALLBACKS || 'default').trim();
  if (!['default', 'off'].includes(fallbacks)) throw new Error('AFTERIMAGE_CLAUDE_FALLBACKS must be default or off.');
  return { auth: resolveAuth(env), model, effort, fallbacks: fallbacks === 'default' };
}

// A problem with the content Claude returned (malformed JSON, a rule the
// validators enforce, or films the catalogue cannot verify) is worth one more
// attempt. Service, credential and catalogue-outage errors carry a code and are not.
function isContentProblem(error) {
  return error instanceof SyntaxError ||
    (error instanceof Error && !(error instanceof Anthropic.AnthropicError) && error.code === undefined);
}

export class ClaudeEngine {
  constructor({
    runner,
    client,
    model = DEFAULT_MODEL,
    effort = DEFAULT_EFFORT,
    fallbacks = true,
    filmMetadataUrl = process.env.AFTERIMAGE_FILM_METADATA_URL,
    metadataProvider,
    deadlines = DEADLINES,
    now = Date.now,
    log = () => {},
  } = {}) {
    // The runner decides how Claude is reached; everything else is shared.
    this.runner = runner ?? new MessagesRunner({ client, model, effort, fallbacks, now, log });
    this.filmMetadataUrl = filmMetadataUrl;
    this.metadataProvider = metadataProvider;
    this.deadlines = deadlines;
    this.now = now;
    this.log = log;
  }

  describe() {
    return this.runner.describe();
  }

  status(options) {
    return this.runner.status(options);
  }

  // Each operation takes an optional `onDraft`, which receives the answer as it
  // develops (see drafts.mjs). The returned result is always fully validated.
  async generateReel(requestInput, { onDraft } = {}) {
    const input = validateV2Input(requestInput);
    const lightTable = isLightTable(input);
    return this.#generate({
      kind: 'reel',
      onDraft,
      system: lightTable ? LIGHT_TABLE_SYSTEM : REEL_SYSTEM,
      prompt: (rejection) => buildReelPrompt(input, rejection),
      schema: lightTable ? AFTERIMAGE_LIGHT_TABLE_SCHEMA_V1 : AFTERIMAGE_SCHEMA_V2,
      maxCharacters: lightTable ? 60000 : 20000,
      deadlineMs: this.deadlines.reel,
      finish: (raw) => normalizeV2Result(raw, input.films, input.excludedFilms, {
        experience: input.experience,
        selectedFacets: input.selectedFacets,
        likedFilms: input.likedFilms,
      }),
    });
  }

  async generateReplacement(requestInput, { onDraft } = {}) {
    const input = validateReplacementInput(requestInput);
    const metadata = this.#metadata();
    return this.#generate({
      kind: 'replacement',
      onDraft,
      system: REPLACEMENT_SYSTEM,
      prompt: (rejection) => buildReplacementPrompt(input, rejection),
      schema: createReplacementSchema(input.request.experience),
      maxCharacters: 20000,
      deadlineMs: this.deadlines.replacement,
      finish: async (raw) => verifyReplacementIdentity(input, completeReplacement(raw, input), metadata),
    });
  }

  async generateAtlas(requestInput, { onDraft } = {}) {
    const input = validateAtlasInput(requestInput);
    const metadata = this.#metadata();
    return this.#generate({
      kind: 'atlas',
      onDraft,
      system: ATLAS_SYSTEM,
      prompt: (rejection) => buildAtlasPrompt(input, rejection),
      schema: ATLAS_CANDIDATE_SCHEMA,
      // Nine full profiles and eight comparative readings exceed a reel's size.
      maxCharacters: 90000,
      deadlineMs: this.deadlines.atlas,
      finish: async (raw) => verifyAtlas(normalizeAtlasResult(raw, input, true), metadata, input),
    });
  }

  // Resolved before generating, so a missing catalogue never costs a model call.
  #metadata() {
    if (this.metadataProvider) return this.metadataProvider;
    if (!this.filmMetadataUrl) {
      throw engineError('METADATA_NOT_CONFIGURED', 'AFTERIMAGE_FILM_METADATA_URL is required to verify films.');
    }
    this.metadataProvider = createFilmMetadataProvider({ url: this.filmMetadataUrl, timeoutMs: 20000 });
    return this.metadataProvider;
  }

  async #generate({ kind, system, prompt, schema, maxCharacters, deadlineMs, finish, onDraft }) {
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), deadlineMs);
    const format = toStructuredSchema(schema);
    const drafts = createDraftReporter({ kind, onDraft, now: this.now });
    const onPartial = drafts ? (text) => drafts.partial(text) : undefined;
    let rejection = '';
    try {
      for (let attempt = 1; ; attempt += 1) {
        try {
          const text = await this.runner.complete({ kind, system, content: prompt(rejection), format, signal: controller.signal, onPartial });
          return await finish(extractJson(text, maxCharacters));
        } catch (error) {
          if (attempt >= 2 || !isContentProblem(error)) throw error;
          rejection = String(error.message || 'The answer was invalid.').slice(0, 300);
          this.log({ code: 'CLAUDE_ANSWER_REJECTED', attempt });
          drafts?.retake();
        }
      }
    } catch (error) {
      if (controller.signal.aborted) throw engineError('CLAUDE_TIMEOUT', 'Claude took too long to finish.');
      throw error;
    } finally {
      clearTimeout(deadline);
    }
  }
}
