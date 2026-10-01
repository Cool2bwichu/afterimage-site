import { SAFE_FAILURES } from './job-store.mjs';

export { SAFE_FAILURES };

function activeGenerationError(jobId) {
  const error = new Error('A reel is already developing.');
  error.code = 'ACTIVE_GENERATION';
  error.jobId = jobId;
  return error;
}

export class GenerationCoordinator {
  constructor({
    store,
    generate,
    schedule = (work) => queueMicrotask(() => void work()),
    logError = () => {},
  }) {
    this.store = store;
    this.generate = generate;
    this.schedule = schedule;
    this.logError = logError;
    this.activeJobId = null;
    this.starting = null;
    this.activeWork = Promise.resolve();
  }

  async start(validatedInput) {
    if (this.activeJobId) throw activeGenerationError(this.activeJobId);

    if (this.starting) {
      await this.starting;
      if (this.activeJobId) throw activeGenerationError(this.activeJobId);
    }

    const starting = this.#createAndSchedule(validatedInput);
    this.starting = starting;
    try {
      return await starting;
    } finally {
      if (this.starting === starting) this.starting = null;
    }
  }

  get(jobId) {
    return this.store.toPublic(this.store.get(jobId));
  }

  whenIdle() {
    const starting = this.starting;
    return starting ? starting.then(() => this.activeWork) : this.activeWork;
  }

  async #createAndSchedule(validatedInput) {
    const job = await this.store.create();
    this.activeJobId = job.id;
    this.#scheduleWork(job.id, validatedInput);
    return this.store.toPublic(job);
  }

  #scheduleWork(jobId, validatedInput) {
    let resolveIdle;
    this.activeWork = new Promise((resolve) => { resolveIdle = resolve; });
    this.schedule(() => this.#run(jobId, validatedInput)
      .catch(() => {})
      .finally(resolveIdle));
  }

  async #run(jobId, validatedInput) {
    try {
      await this.store.markRunning(jobId);
      const reel = await this.generate(validatedInput, { onDraft: (draft) => this.store.setDraft?.(jobId, draft) });
      await this.store.complete(jobId, reel);
    } catch (error) {
      // Only failures with a prepared, safe explanation reach the site; anything
      // else becomes the generic failure.
      const failure = error?.code !== 'INTERRUPTED' && Object.hasOwn(SAFE_FAILURES, error?.code)
        ? SAFE_FAILURES[error.code]
        : SAFE_FAILURES.GENERATION_FAILED;
      if (failure.code === 'GENERATION_FAILED') {
        try { this.logError({ jobId, code: failure.code }); } catch {}
      }
      try { await this.store.fail(jobId, failure); } catch {}
    } finally {
      if (this.activeJobId === jobId) this.activeJobId = null;
    }
  }
}
