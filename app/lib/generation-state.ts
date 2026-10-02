import {
  parseAfterimageResultV2,
  type AfterimageResultV2,
  type Experience,
} from './reel-state.ts';

const JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
const MAX_ERROR_MESSAGE_LENGTH = 300;

export type JobStart = {
  jobId: string;
  status: 'queued';
};

// What a running job has developed so far (see companion/lib/drafts.mjs). A
// draft is provisional: the finished, validated answer replaces it.
export type DraftFilm = { title: string; year: string; reason?: string; label?: string };
export type JobDraft = {
  take: number;
  persona?: string;
  insight?: string;
  palette?: string[];
  sensibilities?: string[];
  spiritDirector?: string;
  recommendations?: DraftFilm[];
  recommendation?: DraftFilm;
  thesis?: string;
  neighbors?: DraftFilm[];
  film?: DraftFilm;
};

export type PendingGenerationJob = {
  jobId: string;
  status: 'queued' | 'running';
  createdAt: string;
  updatedAt: string;
  draft?: JobDraft;
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

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const YEAR = /^\d{4}$/;

function draftText(value: unknown, max: number): string {
  return typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : '';
}

function draftFilm(value: unknown): DraftFilm | null {
  if (!isRecord(value)) return null;
  const title = draftText(value.title, 160);
  const year = typeof value.year === 'string' && YEAR.test(value.year) ? value.year : '';
  if (!title || !year) return null;
  const reason = draftText(value.reason, 600);
  const label = draftText(value.label, 80);
  return { title, year, ...(reason ? { reason } : {}), ...(label ? { label } : {}) };
}

function draftFilms(value: unknown, count: number): DraftFilm[] {
  return Array.isArray(value) ? value.slice(0, count).map(draftFilm).filter((film): film is DraftFilm => film !== null) : [];
}

// Keeps only well-formed, bounded fields; anything else is left out.
export function parseJobDraft(value: unknown): JobDraft | undefined {
  if (!isRecord(value) || !Number.isInteger(value.take) || Number(value.take) < 1 || Number(value.take) > 9) return undefined;
  const draft: JobDraft = { take: Number(value.take) };
  const persona = draftText(value.persona, 80);
  const insight = draftText(value.insight, 600);
  const director = draftText(value.spiritDirector, 120);
  const thesis = draftText(value.thesis, 400);
  if (persona) draft.persona = persona;
  if (insight) draft.insight = insight;
  if (director) draft.spiritDirector = director;
  if (thesis) draft.thesis = thesis;
  if (Array.isArray(value.palette)) {
    const palette = value.palette.slice(0, 5).filter((color): color is string => typeof color === 'string' && HEX_COLOR.test(color));
    if (palette.length) draft.palette = palette;
  }
  if (Array.isArray(value.sensibilities)) {
    const sensibilities = value.sensibilities.slice(0, 3).map(item => draftText(item, 80)).filter(Boolean);
    if (sensibilities.length) draft.sensibilities = sensibilities;
  }
  const recommendations = draftFilms(value.recommendations, 5);
  const neighbors = draftFilms(value.neighbors, 8);
  const recommendation = draftFilm(value.recommendation);
  const film = draftFilm(value.film);
  if (recommendations.length) draft.recommendations = recommendations;
  if (neighbors.length) draft.neighbors = neighbors;
  if (recommendation) draft.recommendation = recommendation;
  if (film) draft.film = film;
  return draft;
}

export function isGenerationJobId(value: unknown): value is string {
  return typeof value === 'string' && JOB_ID_PATTERN.test(value);
}

// A shared generation gate can be occupied by an Atlas or collision from
// another tab. Those results cannot be parsed or saved as this page's reel.
export function canResumeReelConflict(value: unknown, knownJobId?: string, replacementJobId?: string): boolean {
  if (!isRecord(value) || value.code !== 'ACTIVE_GENERATION' || !isGenerationJobId(value.jobId)) return false;
  if (value.kind === 'reel') return true;
  if (value.kind === 'replacement') return value.jobId === replacementJobId;
  if (value.kind !== undefined) return false;
  return value.jobId === knownJobId || value.jobId === replacementJobId;
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

export function parseJobStatus(value: unknown, experience?: Experience): GenerationJob {
  if (!isRecord(value) || !isGenerationJobId(value.jobId)) return invalidJobPayload();

  const jobId = value.jobId;
  const createdAt = parseTimestamp(value.createdAt);
  const updatedAt = parseTimestamp(value.updatedAt);

  if (value.status === 'queued' || value.status === 'running') {
    const draft = value.status === 'running' ? parseJobDraft(value.draft) : undefined;
    return { jobId, status: value.status, createdAt, updatedAt, ...(draft ? { draft } : {}) };
  }

  if (value.status === 'complete') {
    const reel = parseAfterimageResultV2(value.reel, experience);
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
