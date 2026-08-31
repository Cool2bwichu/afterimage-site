export type RecommendationV2 = {
  title: string;
  year: string;
  timecode: string;
  reason: string;
  watchFor: string;
};

export type AfterimageResultV2 = {
  status: 'complete';
  sourceFilms: string[];
  persona: string;
  insight: string;
  palette: string[];
  sensibilities: string[];
  spiritDirector: { name: string; reason: string };
  recommendations: RecommendationV2[];
};

export type ReelStateV2 = {
  version: 2;
  films: string[];
  creativeBrief: string;
  result: AfterimageResultV2 | null;
};

const MAX_FILMS = 20;
const MAX_FILM_LENGTH = 160;
const MAX_BRIEF_LENGTH = 1200;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text : null;
}

function normalizeFilms(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const films: string[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (typeof candidate !== 'string') continue;
    const film = candidate.trim();
    const key = film.toLocaleLowerCase();
    if (!film || film.length > MAX_FILM_LENGTH || seen.has(key)) continue;
    seen.add(key);
    films.push(film);
    if (films.length === MAX_FILMS) break;
  }
  return films;
}

function normalizeBrief(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, MAX_BRIEF_LENGTH);
}

function parseTextArray(value: unknown, length: number): string[] | null {
  if (!Array.isArray(value) || value.length !== length) return null;
  const parsed = value.map(requiredText);
  return parsed.every((item): item is string => item !== null) ? parsed : null;
}

function parseRecommendation(value: unknown): RecommendationV2 | null {
  if (!isRecord(value)) return null;

  const title = requiredText(value.title);
  const year = requiredText(value.year);
  const timecode = requiredText(value.timecode);
  const reason = requiredText(value.reason);
  const watchFor = value.watchFor === undefined ? '' : typeof value.watchFor === 'string' ? value.watchFor.trim() : null;

  if (!title || !year || !/^\d{4}$/.test(year) || !timecode || !reason || watchFor === null) return null;
  return { title, year, timecode, reason, watchFor };
}

function parseResult(value: unknown): AfterimageResultV2 | null {
  if (!isRecord(value) || value.status !== 'complete') return null;

  const sourceFilms = normalizeFilms(value.sourceFilms);
  if (!Array.isArray(value.sourceFilms) || sourceFilms.length !== value.sourceFilms.length) return null;

  const persona = requiredText(value.persona);
  const insight = requiredText(value.insight);
  const palette = parseTextArray(value.palette, 5);
  const sensibilities = parseTextArray(value.sensibilities, 3);
  if (!persona || !insight || !palette || palette.some((color) => !HEX_COLOR.test(color)) || !sensibilities) return null;

  if (!isRecord(value.spiritDirector)) return null;
  const directorName = requiredText(value.spiritDirector.name);
  const directorReason = requiredText(value.spiritDirector.reason);
  if (!directorName || !directorReason) return null;

  if (!Array.isArray(value.recommendations) || value.recommendations.length !== 5) return null;
  const recommendations = value.recommendations.map(parseRecommendation);
  if (!recommendations.every((item): item is RecommendationV2 => item !== null)) return null;

  return {
    status: 'complete',
    sourceFilms,
    persona,
    insight,
    palette,
    sensibilities,
    spiritDirector: { name: directorName, reason: directorReason },
    recommendations,
  };
}

export function canDevelop(films: readonly string[], creativeBrief: string): boolean {
  return films.some((film) => film.trim().length > 0) || creativeBrief.trim().length > 0;
}

export function getInputStatus(films: readonly string[], creativeBrief: string): string {
  const filmCount = films.filter((film) => film.trim().length > 0).length;
  const hasBrief = creativeBrief.trim().length > 0;

  if (!filmCount && !hasBrief) return 'Add a film or describe the feeling, form, or story you want to find.';
  if (!filmCount) return 'Description loaded. Ready when you are.';

  const filmLabel = `${filmCount} ${filmCount === 1 ? 'film' : 'films'}`;
  if (hasBrief) return `${filmLabel} and a description loaded. Ready when you are.`;
  return `${filmLabel} loaded. Ready when you are.`;
}

export function buildDevelopPayload(films: readonly string[], creativeBrief: string) {
  return {
    films: normalizeFilms(films),
    creativeBrief: normalizeBrief(creativeBrief),
  };
}

export function parseStoredState(raw: string | null): ReelStateV2 {
  const fallback: ReelStateV2 = { version: 2, films: [], creativeBrief: '', result: null };
  if (!raw) return fallback;

  try {
    const stored: unknown = JSON.parse(raw);
    if (!isRecord(stored)) return fallback;
    return {
      version: 2,
      films: normalizeFilms(stored.films),
      creativeBrief: normalizeBrief(stored.creativeBrief),
      result: parseResult(stored.result),
    };
  } catch {
    return fallback;
  }
}
