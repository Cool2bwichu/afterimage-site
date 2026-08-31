import {
  parseAfterimageResultV2,
  type AfterimageResultV2,
} from './reel-state.ts';

const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
const MAX_ERROR_MESSAGE_LENGTH = 300;

export type JobStart = {
  jobId: string;
  status: 'queued';
};

export type PendingGenerationJob = {
  jobId: string;
  status: 'queued' | 'running';
  createdAt: string;
  updatedAt: string;
};

export type CompleteGenerationJob = {
  jobId: string;
  status: 'complete';
  createdAt: string;
  updatedAt: string;
  reel: AfterimageResultV2;
};

export type FailedGenerationJob = {
  jobId: string;
  status: 'failed';
  createdAt: string;
  updatedAt: string;
  error: { code: string; message: string };
};

export type GenerationJob = PendingGenerationJob | CompleteGenerationJob | FailedGenerationJob;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidJobPayload(): never {
  throw new TypeError('The generation job response is invalid.');
}

function parseTimestamp(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Date.parse(value))) {
    return invalidJobPayload();
  }
  return value;
}

export function isGenerationJobId(value: unknown): value is string {
  return typeof value === 'string' && JOB_ID_PATTERN.test(value);
}

export function nextPollDelay(attempt: number) {
  const safeAttempt = Math.max(0, Math.floor(attempt));
  return Math.min(5000, Math.round(1500 * (1.35 ** safeAttempt)));
}

export function parseJobStart(value: unknown): JobStart {
  if (!isRecord(value) || !isGenerationJobId(value.jobId) || value.status !== 'queued') {
    return invalidJobPayload();
  }
  return { jobId: value.jobId, status: 'queued' };
}

export function parseJobStatus(value: unknown): GenerationJob {
  if (!isRecord(value) || !isGenerationJobId(value.jobId)) return invalidJobPayload();

  const jobId = value.jobId;
  const createdAt = parseTimestamp(value.createdAt);
  const updatedAt = parseTimestamp(value.updatedAt);

  if (value.status === 'queued' || value.status === 'running') {
    return { jobId, status: value.status, createdAt, updatedAt };
  }

  if (value.status === 'complete') {
    const reel = parseAfterimageResultV2(value.reel);
    if (!reel) return invalidJobPayload();
    return { jobId, status: 'complete', createdAt, updatedAt, reel };
  }

  if (value.status === 'failed') {
    if (!isRecord(value.error)) return invalidJobPayload();
    const code = value.error.code;
    const message = typeof value.error.message === 'string' ? value.error.message.trim() : '';
    if (typeof code !== 'string' || !ERROR_CODE_PATTERN.test(code) || !message || message.length > MAX_ERROR_MESSAGE_LENGTH) {
      return invalidJobPayload();
    }
    return { jobId, status: 'failed', createdAt, updatedAt, error: { code, message } };
  }

  return invalidJobPayload();
}
