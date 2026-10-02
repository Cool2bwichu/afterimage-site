import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const JOB_RETENTION_MS = 24 * 60 * 60 * 1000;
export const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const SAFE_FAILURES = Object.freeze({
  AUTH_REQUIRED: Object.freeze({
    code: 'AUTH_REQUIRED',
    message: 'Claude is not connected. Check the companion\'s Claude sign-in, then develop the reel again.',
  }),
  GENERATION_FAILED: Object.freeze({
    code: 'GENERATION_FAILED',
    message: 'AFTERIMAGE could not develop this reel cleanly.',
  }),
  CLAUDE_UNAVAILABLE: Object.freeze({
    code: 'CLAUDE_UNAVAILABLE',
    message: 'Claude is busy or unreachable right now. Your inputs are saved; try again in a minute.',
  }),
  CLAUDE_TIMEOUT: Object.freeze({
    code: 'CLAUDE_TIMEOUT',
    message: 'Claude took too long to finish. Your inputs are saved; start it again.',
  }),
  CLAUDE_DECLINED: Object.freeze({
    code: 'CLAUDE_DECLINED',
    message: 'Claude declined to develop this request. Try describing it differently.',
  }),
  CLAUDE_USAGE_LIMIT: Object.freeze({
    code: 'CLAUDE_USAGE_LIMIT',
    message: 'Your Claude plan has reached its usage limit for now. Your inputs are saved; develop the reel again after the limit resets.',
  }),
  CLAUDE_PLAN_UNAVAILABLE: Object.freeze({
    code: 'CLAUDE_PLAN_UNAVAILABLE',
    message: 'Your Claude plan could not be used for this reel. Check the subscription, then develop the reel again.',
  }),
  CLAUDE_MODEL_UNAVAILABLE: Object.freeze({
    code: 'CLAUDE_MODEL_UNAVAILABLE',
    message: 'The configured Claude model is not available to this account. Choose another with AFTERIMAGE_CLAUDE_MODEL.',
  }),
  CLAUDE_CODE_MISSING: Object.freeze({
    code: 'CLAUDE_CODE_MISSING',
    message: 'Claude Code is not installed where the companion runs, so it cannot use your Claude subscription.',
  }),
  METADATA_NOT_CONFIGURED: Object.freeze({
    code: 'METADATA_NOT_CONFIGURED',
    message: 'Atlases and single-film replacements need the film catalogue. Set AFTERIMAGE_FILM_METADATA_URL for the companion.',
  }),
  INTERRUPTED: Object.freeze({
    code: 'INTERRUPTED',
    message: 'The private reel service restarted before this reel finished. Your inputs are still saved; start it again.',
  }),
});

const isJobId = (id) => typeof id === 'string' && JOB_ID_PATTERN.test(id);
const isTimestamp = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const terminal = (status) => status === 'complete' || status === 'failed';
const safeFailure = (error) => Object.hasOwn(SAFE_FAILURES, error?.code)
  ? SAFE_FAILURES[error.code]
  : SAFE_FAILURES.GENERATION_FAILED;

export class JobStore {
  constructor({ directory, retentionMs = JOB_RETENTION_MS, now = Date.now, idFactory = randomUUID }) {
    if (!directory) throw new Error('A generation job directory is required.');
    this.directory = directory;
    this.retentionMs = retentionMs;
    this.now = now;
    this.idFactory = idFactory;
    this.jobs = new Map();
    // What a running job has developed so far. Kept in memory only: a restart
    // ends a running job anyway, and the finished answer is what persists.
    this.drafts = new Map();
  }

  async initialize() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await chmod(this.directory, 0o700);
    this.jobs.clear();
    let entries;
    try { entries = await readdir(this.directory, { withFileTypes: true }); } catch { return; }
    const current = this.now();
    for (const entry of entries) {
      const match = entry.name.match(/^([0-9a-f-]+)\.json$/i);
      if (!match || !isJobId(match[1]) || !entry.isFile()) continue;
      let job;
      try { job = JSON.parse(await readFile(join(this.directory, entry.name), 'utf8')); } catch { continue; }
      if (!this.#valid(job, match[1])) continue;
      if (terminal(job.status) && current - Date.parse(job.updatedAt) >= this.retentionMs) {
        await unlink(join(this.directory, entry.name)).catch(() => {});
        continue;
      }
      if (job.status === 'queued' || job.status === 'running') {
        job = { id: job.id, status: 'failed', createdAt: job.createdAt, updatedAt: new Date(current).toISOString(),
          error: SAFE_FAILURES.INTERRUPTED };
      }
      if (job.status === 'failed') {
        job = { ...job, error: safeFailure(job.error) };
        await this.#write(job);
      }
      this.jobs.set(job.id, job);
    }
  }

  #valid(job, id) {
    const expectedKeys = new Set(['id', 'status', 'createdAt', 'updatedAt']);
    if (job?.status === 'complete') expectedKeys.add('reel');
    if (job?.status === 'failed') expectedKeys.add('error');
    return job && typeof job === 'object' && Object.keys(job).every((key) => expectedKeys.has(key)) &&
      Object.keys(job).length === expectedKeys.size && job.id === id && isJobId(job.id) &&
      ['queued', 'running', 'complete', 'failed'].includes(job.status) &&
      isTimestamp(job.createdAt) && isTimestamp(job.updatedAt) &&
      (job.status !== 'complete' || Object.hasOwn(job, 'reel')) &&
      (job.status !== 'failed' || job.error && typeof job.error.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(job.error.code) && typeof job.error.message === 'string');
  }

  async #write(job) {
    const target = join(this.directory, job.id + '.json');
    const temporary = join(this.directory, job.id + '.' + randomUUID() + '.tmp');
    try {
      await writeFile(temporary, JSON.stringify(job), { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, target);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }

  async create() {
    const id = this.idFactory();
    if (!isJobId(id)) throw new Error('The generation job ID must be a UUID.');
    if (this.jobs.has(id)) throw new Error('A generation job with this ID already exists.');
    const timestamp = new Date(this.now()).toISOString();
    const job = { id, status: 'queued', createdAt: timestamp, updatedAt: timestamp };
    await this.#write(job);
    this.jobs.set(id, job);
    return job;
  }

  async markRunning(jobId) {
    const job = this.#transition(jobId, 'running');
    await this.#write(job);
    this.jobs.set(job.id, job);
    return job;
  }

  async complete(jobId, reel) {
    const job = this.#transition(jobId, 'complete');
    job.reel = reel;
    await this.#write(job);
    this.jobs.set(job.id, job);
    this.drafts.delete(job.id);
    return job;
  }

  async fail(jobId, error) {
    const job = this.#transition(jobId, 'failed');
    job.error = safeFailure(error);
    await this.#write(job);
    this.jobs.set(job.id, job);
    this.drafts.delete(job.id);
    return job;
  }

  // Records what a running job has developed so far; ignored once it has finished.
  setDraft(jobId, draft) {
    const job = this.get(jobId);
    if (!job || job.status !== 'running' || !draft || typeof draft !== 'object') return false;
    this.drafts.set(job.id, draft);
    return true;
  }

  #transition(jobId, status) {
    const current = this.get(jobId);
    if (!current) throw new Error('Generation job not found.');
    if (terminal(current.status)) throw new Error('Generation job is already terminal.');
    if (status === 'running' && current.status !== 'queued') throw new Error('Invalid generation job transition.');
    return { ...current, status, updatedAt: new Date(this.now()).toISOString() };
  }

  get(jobId) {
    if (!isJobId(jobId)) return null;
    const job = this.jobs.get(jobId) || null;
    if (job && terminal(job.status) && this.now() - Date.parse(job.updatedAt) >= this.retentionMs) return null;
    return job;
  }
  getActive() { return [...this.jobs.values()].find((job) => job.status === 'queued' || job.status === 'running') || null; }

  toPublic(job) {
    if (!job) return null;
    const payload = { jobId: job.id, status: job.status, createdAt: job.createdAt, updatedAt: job.updatedAt };
    if (job.status === 'running' && this.drafts.has(job.id)) payload.draft = this.drafts.get(job.id);
    if (job.status === 'complete') payload.reel = job.reel;
    if (job.status === 'failed') payload.error = job.error;
    return payload;
  }

  async cleanup() {
    const cutoff = this.now() - this.retentionMs;
    const expired = [...this.jobs.values()].filter((job) => terminal(job.status) && Date.parse(job.updatedAt) <= cutoff);
    const results = await Promise.allSettled(expired.map((job) => unlink(join(this.directory, job.id + '.json'))));
    let removed = 0;
    results.forEach((result, index) => { if (result.status === 'fulfilled' || result.reason?.code === 'ENOENT') { this.jobs.delete(expired[index].id); removed++; } });
    return removed;
  }
}
