import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EFFORTS, engineError } from './engine-error.mjs';

// Runs one AFTERIMAGE request through Claude Code in non-interactive mode,
// signed in with the owner's Claude subscription (a `claude setup-token` token),
// the way the subscription bridge runs Codex with a ChatGPT sign-in. Claude Code
// runs with no tools, no settings, MCP servers or memory, in an empty working
// directory, so it acts only as the model behind the companion's own prompts.
const STATUS_TTL_MS = 10 * 60 * 1000;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const MAX_STDERR_CHARS = 2000;
const KILL_GRACE_MS = 5000;

// Only what Claude Code needs reaches it: no Anthropic API key (which would take
// precedence over the subscription), no bridge secret, no other configuration.
const PASSTHROUGH_ENV = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TZ', 'TMPDIR', 'ANTHROPIC_BASE_URL',
  'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy', 'SSL_CERT_FILE', 'NODE_EXTRA_CA_CERTS'];

// Claude Code's typed error categories for a failed turn.
const FAILURES = {
  authentication_failed: ['AUTH_REQUIRED', 'Claude did not accept the subscription token.'],
  oauth_org_not_allowed: ['AUTH_REQUIRED', 'Claude did not accept the subscription token.'],
  rate_limit: ['CLAUDE_USAGE_LIMIT', 'The Claude plan has reached its usage limit.'],
  billing_error: ['CLAUDE_PLAN_UNAVAILABLE', 'The Claude plan could not be used.'],
  account_on_hold: ['CLAUDE_PLAN_UNAVAILABLE', 'The Claude plan could not be used.'],
  model_not_found: ['CLAUDE_MODEL_UNAVAILABLE', 'The configured model is not available to this plan.'],
  overloaded: ['CLAUDE_UNAVAILABLE', 'Claude is busy or unreachable right now.'],
  server_error: ['CLAUDE_UNAVAILABLE', 'Claude is busy or unreachable right now.'],
  max_output_tokens: ['CLAUDE_INCOMPLETE', 'Claude ran out of room before finishing.'],
};

function failureFromStatus(status) {
  if (status === 401 || status === 403) return FAILURES.authentication_failed;
  if (status === 429) return FAILURES.rate_limit;
  if (typeof status === 'number' && status >= 500) return FAILURES.server_error;
  return null;
}

export class ClaudeCodeRunner {
  constructor({
    binary = 'claude',
    token = '',
    model,
    effort,
    workdir = join(tmpdir(), 'afterimage-claude-code'),
    env = process.env,
    spawnImpl = spawn,
    now = Date.now,
    log = () => {},
  }) {
    if (!EFFORTS.has(effort)) throw new Error('Unsupported Claude effort level.');
    this.binary = binary;
    this.token = token;
    this.model = model;
    this.effort = effort;
    this.workdir = workdir;
    this.env = env;
    this.spawnImpl = spawnImpl;
    this.now = now;
    this.log = log;
    this.rejected = false;
    this.cliCheck = null;
  }

  describe() {
    return {
      provider: 'claude-code',
      auth: 'subscription',
      model: this.model,
      reasoningEffort: this.effort,
      engine: 'claude',
    };
  }

  // Reports whether a subscription token is configured, whether Claude Code is
  // installed, and whether Claude has rejected the token since the companion
  // started. It does not spend the plan's allowance to test the token: a token
  // Claude refuses is reported here from the first reel that tries it.
  async status({ fresh = false } = {}) {
    if (!this.token) return { connected: false, reason: 'missing' };
    if (this.rejected) return { connected: false, reason: 'rejected' };
    if (fresh || !this.cliCheck || this.cliCheck.expiresAt <= this.now()) {
      this.cliCheck = { installed: await this.#installed(), expiresAt: this.now() + STATUS_TTL_MS };
    }
    return this.cliCheck.installed ? { connected: true, reason: null } : { connected: false, reason: 'cli-missing' };
  }

  #childEnv() {
    const env = Object.fromEntries(PASSTHROUGH_ENV.filter((key) => this.env[key]).map((key) => [key, this.env[key]]));
    return {
      ...env,
      CLAUDE_CODE_OAUTH_TOKEN: this.token,
      CLAUDE_CONFIG_DIR: join(this.workdir, 'config'),
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    };
  }

  #installed() {
    return new Promise((resolve) => {
      let child;
      try {
        child = this.spawnImpl(this.binary, ['--version'], { env: this.#childEnv(), stdio: ['ignore', 'ignore', 'ignore'] });
      } catch {
        resolve(false);
        return;
      }
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(false); }, 15000);
      child.once('error', () => { clearTimeout(timer); resolve(false); });
      child.once('close', (code) => { clearTimeout(timer); resolve(code === 0); });
    });
  }

  args({ system, format }) {
    return [
      '-p',
      '--output-format', 'stream-json', '--verbose',
      '--model', this.model,
      '--effort', this.effort,
      '--system-prompt', system,
      '--json-schema', JSON.stringify(format),
      '--tools', '',
      '--setting-sources', '',
      '--strict-mcp-config',
      '--no-session-persistence',
      '--permission-mode', 'dontAsk',
    ];
  }

  // Returns the answer's JSON text. The request's data goes in on stdin.
  async complete({ kind, system, content, format, signal }) {
    if (!this.token) throw engineError('AUTH_REQUIRED', 'No Claude subscription token is configured for the companion.');
    await mkdir(join(this.workdir, 'run'), { recursive: true, mode: 0o700 });
    await mkdir(join(this.workdir, 'config'), { recursive: true, mode: 0o700 });
    const run = await this.#run({ args: this.args({ system, format }), input: content, signal });
    const { result, lastError } = run;

    if (!result) {
      if (run.spawnError?.code === 'ENOENT') throw engineError('CLAUDE_CODE_MISSING', 'Claude Code is not installed for the companion.');
      this.log({ code: 'CLAUDE_CODE_FAILED', kind, exitCode: run.exitCode, stderr: run.stderr.slice(0, 300) });
      throw engineError('CLAUDE_CODE_FAILED', 'Claude Code stopped without an answer.');
    }

    // Token counts and Claude Code's own cost estimate only, never content.
    const usage = result.usage || {};
    this.log({
      code: 'CLAUDE_USAGE', kind, auth: 'subscription', model: Object.keys(result.modelUsage || {})[0] || this.model,
      inputTokens: usage.input_tokens ?? null, outputTokens: usage.output_tokens ?? null,
      cacheReadTokens: usage.cache_read_input_tokens ?? null, estimatedCostUsd: result.total_cost_usd ?? null,
      subtype: result.subtype ?? null, stopReason: result.stop_reason ?? null,
    });

    if (result.is_error || result.subtype !== 'success') {
      if (result.subtype === 'error_max_structured_output_retries') {
        // No coded error: the engine treats this as a content problem worth one more attempt.
        throw new Error('Claude could not produce an answer in the required structure.');
      }
      const failure = FAILURES[lastError] || failureFromStatus(result.api_error_status);
      if (failure) {
        if (failure[0] === 'AUTH_REQUIRED') this.rejected = true;
        throw engineError(failure[0], failure[1]);
      }
      this.log({ code: 'CLAUDE_CODE_FAILED', kind, subtype: result.subtype ?? null, error: lastError ?? null });
      throw engineError('CLAUDE_CODE_FAILED', 'Claude Code could not complete the request.');
    }
    this.rejected = false;
    if (result.stop_reason === 'refusal') throw engineError('CLAUDE_DECLINED', 'Claude declined this request.');
    if (result.structured_output !== undefined && result.structured_output !== null) {
      return JSON.stringify(result.structured_output);
    }
    return typeof result.result === 'string' ? result.result : '';
  }

  #run({ args, input, signal }) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason ?? new Error('Aborted.'));
        return;
      }
      let child;
      try {
        child = this.spawnImpl(this.binary, args, {
          cwd: join(this.workdir, 'run'),
          env: this.#childEnv(),
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (error) {
        resolve({ spawnError: error, stderr: '' });
        return;
      }

      let buffered = '';
      let received = 0;
      let stderr = '';
      let result = null;
      let lastError;
      let spawnError;
      let settled = false;
      let killTimer;

      const read = (line) => {
        if (!line.trim()) return;
        let message;
        try { message = JSON.parse(line); } catch { return; }
        if (message.type === 'assistant' && typeof message.error === 'string') lastError = message.error;
        if (message.type === 'result') result = message;
      };
      const abort = () => {
        child.kill('SIGTERM');
        killTimer = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS);
      };
      signal.addEventListener('abort', abort, { once: true });

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        received += chunk.length;
        if (received > MAX_OUTPUT_BYTES) { abort(); return; }
        buffered += chunk;
        let newline;
        while ((newline = buffered.indexOf('\n')) >= 0) {
          read(buffered.slice(0, newline));
          buffered = buffered.slice(newline + 1);
        }
      });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => { if (stderr.length < MAX_STDERR_CHARS) stderr += chunk; });
      const finish = (exitCode) => {
        if (settled) return;
        settled = true;
        clearTimeout(killTimer);
        signal.removeEventListener('abort', abort);
        read(buffered);
        if (signal.aborted) reject(signal.reason ?? new Error('Aborted.'));
        else resolve({ result, lastError, exitCode, stderr, spawnError });
      };
      child.once('error', (error) => {
        spawnError = error;
        // A binary that never started emits no close event to wait for.
        if (child.pid === undefined) finish(null);
      });
      child.once('close', finish);
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    });
  }
}
