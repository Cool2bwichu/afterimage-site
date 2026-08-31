import {
  nextPollDelay,
  type GenerationJob,
} from './generation-state.ts';

export type GenerationPollErrorCode = 'AUTH_REQUIRED' | 'JOB_NOT_FOUND' | 'POLL_FAILED';

export class GenerationPollError extends Error {
  readonly code: GenerationPollErrorCode;

  constructor(code: GenerationPollErrorCode, message: string) {
    super(message);
    this.name = 'GenerationPollError';
    this.code = code;
  }
}

type PollGenerationOptions = {
  fetchStatus: (signal: AbortSignal) => Promise<GenerationJob>;
  signal: AbortSignal;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  onStatus?: (job: GenerationJob) => void;
  onTransientError?: (error: unknown) => void;
};

function abortError(): Error {
  const error = new Error('Generation polling was aborted.');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

function errorStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('status' in error)) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' && Number.isInteger(status) ? status : null;
}

function defaultWait(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError());

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout);
      reject(abortError());
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function pollGeneration({
  fetchStatus,
  signal,
  wait = defaultWait,
  onStatus = () => {},
  onTransientError = () => {},
}: PollGenerationOptions): Promise<GenerationJob> {
  let attempt = 0;

  for (;;) {
    throwIfAborted(signal);
    await wait(nextPollDelay(attempt), signal);
    throwIfAborted(signal);

    let job: GenerationJob;
    try {
      job = await fetchStatus(signal);
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) throw abortError();

      const status = errorStatus(error);
      if (status === 401) {
        throw new GenerationPollError('AUTH_REQUIRED', 'Private access expired. Refresh and try again.');
      }
      if (status === 404) {
        throw new GenerationPollError('JOB_NOT_FOUND', 'This reel job is no longer available.');
      }
      if (status !== null && ![502, 503, 504].includes(status)) {
        throw new GenerationPollError('POLL_FAILED', 'The reel status could not be checked.');
      }

      onTransientError(error);
      attempt += 1;
      continue;
    }

    throwIfAborted(signal);
    onStatus(job);
    if (job.status === 'complete' || job.status === 'failed') return job;
    attempt += 1;
  }
}
