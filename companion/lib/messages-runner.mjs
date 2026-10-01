import Anthropic from '@anthropic-ai/sdk';

import { EFFORTS, engineError } from './engine-error.mjs';

// Runs one AFTERIMAGE request through the Anthropic Messages API, billed to an
// Anthropic API key.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const MAX_OUTPUT_TOKENS = 64000;
const STATUS_TTL_MS = 10 * 60 * 1000;
const STATUS_RETRY_MS = 30 * 1000;

// Haiku takes neither adaptive thinking nor effort; every newer model supports both.
function supportsReasoningControls(model) {
  return !model.startsWith('claude-haiku');
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

export class MessagesRunner {
  constructor({ client = new Anthropic({ maxRetries: 3 }), model, effort, fallbacks = true, now = Date.now, log = () => {} }) {
    if (!EFFORTS.has(effort)) throw new Error('Unsupported Claude effort level.');
    this.client = client;
    this.model = model;
    this.effort = effort;
    this.fallbacks = fallbacks && supportsReasoningControls(model);
    this.now = now;
    this.log = log;
    this.statusCache = null;
  }

  describe() {
    return {
      provider: 'anthropic',
      auth: 'api',
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

  // Returns the answer's JSON text. `onPartial`, when given, receives the
  // answer's text so far as it streams.
  async complete({ kind, system, content, format, signal, onPartial }) {
    const send = (optional) => {
      const stream = this.client.beta.messages.stream(this.#params({ system, content, format, optional }), { signal });
      if (typeof onPartial === 'function' && typeof stream.on === 'function') {
        let answerText = '';
        stream.on('streamEvent', (event) => {
          // After a server-side fallback, the answer starts again with the next model.
          if (event.type === 'content_block_start' && event.content_block?.type === 'fallback') answerText = '';
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            answerText += event.delta.text;
            try { onPartial(answerText); } catch {}
          }
        });
      }
      return stream.finalMessage();
    };
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
