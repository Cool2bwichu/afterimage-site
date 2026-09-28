import Anthropic from '@anthropic-ai/sdk';

import { normalizeAtlasResult, validateAtlasInput, verifyAtlas, ATLAS_CANDIDATE_SCHEMA } from './atlas-contract.mjs';
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
import { completeReplacement, createReplacementSchema, validateReplacementInput, verifyReplacementIdentity } from './replacement-contract.mjs';
import { extractJson, toStructuredSchema } from './structured-output.mjs';
import { AFTERIMAGE_LIGHT_TABLE_SCHEMA_V1, AFTERIMAGE_SCHEMA_V2, normalizeV2Result, validateV2Input } from './v2-contract.mjs';

export const DEFAULT_MODEL = 'claude-opus-5-5';
export const DEFAULT_EFFORT = 'high';
const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const MAX_OUTPUT_TOKENS = 64000;
const STATUS_TTL_MS = 10 * 60 * 1000;
const STATUS_RETRY_MS = 30 * 1000;

// Bounded wall-clock time for one operation, including a validation retry. The
// resumable job keeps the site's polling independent of these deadlines.
export const DEADLINES = Object.freeze({ reel: 300000, replacement: 240000, atlas: 420000 });

function engineError(code, message) {
  return Object.assign(new Error(message), { code });
}

export function resolveClaudeConfig(env = process.env) {
  const model = (env.AFTERIMAGE_CLAUDE_MODEL || DEFAULT_MODEL).trim();
  if (!/^claude-[a-z0-9.-]+$/.test(model)) throw new Error('AFTERIMAGE_CLAUDE_MODEL must be a Claude model ID.');
  const effort = (env.AFTERIMAGE_CLAUDE_EFFORT || DEFAULT_EFFORT).trim();
  if (!EFFORTS.has(effort)) throw new Error('AFTERIMAGE_CLAUDE_EFFORT must be low, medium, high, xhigh or max.');
  const fallbacks = (env.AFTERIMAGE_CLAUDE_FALLBACKS || 'default').trim();
  if (!['default', 'off'].includes(fallbacks)) throw new Error('AFTERIMAGE_CLAUDE_FALLBACKS must be default or off.');
  return { model, effort, fallbacks: fallbacks === 'default' };
}

// Haiku takes neither adaptive thinking nor effort; every newer model supports both.
function supportsReasoningControls(model) {
  return !model.startsWith('claude-haiku');
}

// A problem with the content Claude returned (malformed JSON, a rule the
// validators enforce, or films the catalogue cannot verify) is worth one more
// attempt. Service, credential and catalogue-outage errors carry a code and are not.
function isContentProblem(error) {
  return error instanceof SyntaxError ||
    (error instanceof Error && !(error instanceof Anthropic.AnthropicError) && error.code === undefined);
}

// The SDK throws a plain Error, before any request is sent, when it cannot
// resolve an API key, auth token or profile. Only used on errors from SDK calls.
function isMissingCredentials(error) {
  return error instanceof Error && error.constructor === Error && !(error instanceof Anthropic.AnthropicError);
}

// Maps an error raised by an SDK call to a coded failure the job store can explain.
function classifyServiceError(error) {
  if (isMissingCredentials(error)) {
    return engineError('AUTH_REQUIRED', 'No Anthropic credentials are configured for the companion.');
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return engineError('AUTH_REQUIRED', 'Claude did not accept the configured Anthropic credentials.');
  }
  if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.APIConnectionError ||
      (error instanceof Anthropic.APIError && typeof error.status === 'number' && error.status >= 500)) {
    return engineError('CLAUDE_UNAVAILABLE', 'Claude is busy or unreachable right now.');
  }
  return error;
}

export class ClaudeEngine {
  constructor({
    client = new Anthropic({ maxRetries: 3 }),
    model = DEFAULT_MODEL,
    effort = DEFAULT_EFFORT,
    fallbacks = true,
    filmMetadataUrl = process.env.AFTERIMAGE_FILM_METADATA_URL,
    metadataProvider,
    deadlines = DEADLINES,
    now = Date.now,
    log = () => {},
  } = {}) {
    if (!EFFORTS.has(effort)) throw new Error('Unsupported Claude effort level.');
    this.client = client;
    this.model = model;
    this.effort = effort;
    this.fallbacks = fallbacks && supportsReasoningControls(model);
    this.filmMetadataUrl = filmMetadataUrl;
    this.metadataProvider = metadataProvider;
    this.deadlines = deadlines;
    this.now = now;
    this.log = log;
    this.statusCache = null;
  }

  describe() {
    return {
      provider: 'anthropic',
      model: this.model,
      reasoningEffort: this.effort,
      engine: 'claude',
      fallbacks: this.fallbacks ? 'default' : 'off',
    };
  }

  // Confirms the configured credentials can reach the model without generating
  // anything. A missing or rejected key is reported, never papered over.
  async status({ fresh = false } = {}) {
    const cached = this.statusCache;
    if (!fresh && cached && cached.expiresAt > this.now()) return cached.value;
    let value;
    try {
      await this.client.models.retrieve(this.model);
      value = { connected: true, reason: null };
    } catch (error) {
      const classified = classifyServiceError(error);
      if (classified.code !== 'AUTH_REQUIRED') throw classified;
      value = { connected: false, reason: isMissingCredentials(error) ? 'missing' : 'rejected' };
    }
    this.statusCache = { value, expiresAt: this.now() + (value.connected ? STATUS_TTL_MS : STATUS_RETRY_MS) };
    return value;
  }

  async generateReel(requestInput) {
    const input = validateV2Input(requestInput);
    const lightTable = isLightTable(input);
    return this.#generate({
      kind: 'reel',
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

  async generateReplacement(requestInput) {
    const input = validateReplacementInput(requestInput);
    const metadata = this.#metadata();
    return this.#generate({
      kind: 'replacement',
      system: REPLACEMENT_SYSTEM,
      prompt: (rejection) => buildReplacementPrompt(input, rejection),
      schema: createReplacementSchema(input.request.experience),
      maxCharacters: 20000,
      deadlineMs: this.deadlines.replacement,
      finish: async (raw) => verifyReplacementIdentity(input, completeReplacement(raw, input), metadata),
    });
  }

  async generateAtlas(requestInput) {
    const input = validateAtlasInput(requestInput);
    const metadata = this.#metadata();
    return this.#generate({
      kind: 'atlas',
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

  async #generate({ kind, system, prompt, schema, maxCharacters, deadlineMs, finish }) {
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), deadlineMs);
    const format = toStructuredSchema(schema);
    let rejection = '';
    try {
      for (let attempt = 1; ; attempt += 1) {
        const text = await this.#complete({ kind, system, content: prompt(rejection), format, signal: controller.signal });
        try {
          return await finish(extractJson(text, maxCharacters));
        } catch (error) {
          if (attempt >= 2 || !isContentProblem(error)) throw error;
          rejection = String(error.message || 'The answer was invalid.').slice(0, 300);
          this.log({ code: 'CLAUDE_ANSWER_REJECTED', attempt });
        }
      }
    } catch (error) {
      if (controller.signal.aborted) throw engineError('CLAUDE_TIMEOUT', 'Claude took too long to finish.');
      throw error;
    } finally {
      clearTimeout(deadline);
    }
  }

  #params({ system, content, format, optional }) {
    const reasoning = supportsReasoningControls(this.model);
    return {
      model: this.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{
        role: 'user',
        content: optional ? content : content + '\n\n<response_format>\nRespond with only a JSON object that satisfies this JSON schema, with no other text:\n' +
          JSON.stringify(format) + '\n</response_format>',
      }],
      output_config: { ...(optional ? { format: { type: 'json_schema', schema: format } } : {}), ...(reasoning ? { effort: this.effort } : {}) },
      ...(reasoning ? { thinking: { type: 'adaptive' } } : {}),
      ...(optional && this.fallbacks ? { betas: [FALLBACK_BETA], fallbacks: 'default' } : {}),
    };
  }

  async #complete({ kind, system, content, format, signal }) {
    const send = (optional) => this.client.beta.messages.stream(this.#params({ system, content, format, optional }), { signal }).finalMessage();
    let message;
    try {
      message = await send(true);
    } catch (error) {
      if (signal.aborted) throw error;
      if (!(error instanceof Anthropic.BadRequestError)) throw classifyServiceError(error);
      // The API refused the request's shape. Structured output and refusal
      // fallbacks are the optional parts: retry this call once without them, with
      // the schema stated in the prompt. The validators apply either way.
      this.log({ code: 'CLAUDE_REQUEST_REJECTED', kind, message: String(error.message || '').slice(0, 300) });
      try {
        message = await send(false);
      } catch (retryError) {
        throw signal.aborted ? retryError : classifyServiceError(retryError);
      }
    }
    // Token counts only, never content: enough to see what each reel costs.
    const usage = message.usage || {};
    this.log({
      code: 'CLAUDE_USAGE', kind, model: message.model || this.model,
      inputTokens: usage.input_tokens ?? null, outputTokens: usage.output_tokens ?? null,
      cacheReadTokens: usage.cache_read_input_tokens ?? null, stopReason: message.stop_reason ?? null,
    });
    if (message.stop_reason === 'refusal') {
      throw engineError('CLAUDE_DECLINED', 'Claude declined this request.');
    }
    if (message.stop_reason === 'max_tokens') {
      throw engineError('CLAUDE_INCOMPLETE', 'Claude ran out of room before finishing.');
    }
    // After a server-side fallback, only the text after the last switch point
    // belongs to the model that completed the turn.
    const blocks = message.content;
    let start = 0;
    blocks.forEach((block, index) => { if (block.type === 'fallback') start = index + 1; });
    return blocks.slice(start).filter((block) => block.type === 'text').map((block) => block.text).join('');
  }
}
