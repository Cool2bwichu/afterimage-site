import type { FilmEnrichment } from './movie-metadata.ts';
import { movieKey, parseFilmEnrichment } from './movie-metadata.ts';
import { LIGHT_TABLE_EXPERIENCE, type FacetMap, type SelectedFacets } from './light-table.ts';
import { parseFacetMap, parseSelectedFacets } from './light-table-parse.ts';

export type Experience = typeof LIGHT_TABLE_EXPERIENCE | undefined;
export type DevelopInput = {
  films: string[];
  creativeBrief: string;
  excludedFilms?: ExcludedFilm[];
  experience?: typeof LIGHT_TABLE_EXPERIENCE;
  selectedFacets?: SelectedFacets;
};

export type RecommendationV2 = {
  title: string;
  year: string;
  timecode: string;
  reason: string;
  watchFor: string;
  facets?: FacetMap;
  programNotes?: { carriesThrough: string; takesYouFurther: string };
};

export type ExcludedFilm = { title: string; year: string };

export type AfterimageResultV2 = {
  status: 'complete';
  sourceFilms: string[];
  persona: string;
  insight: string;
  palette: string[];
  sensibilities: string[];
  spiritDirector: { name: string; reason: string };
  recommendations: RecommendationV2[];
  fingerprint?: FacetMap;
};

export type ReelStateV2 = {
  version: 4;
  films: string[];
  creativeBrief: string;
  result: AfterimageResultV2 | null;
  activeJobId: string | null;
  metadataByKey: Record<string, FilmEnrichment>;
  excludedFilms: ExcludedFilm[];
  experience?: typeof LIGHT_TABLE_EXPERIENCE;
  selectedFacets?: SelectedFacets;
  selectedReelIdentity?: string;
  acceptedInput?: DevelopInput;
  acceptedInputJobId?: string;
  displayedInput?: DevelopInput;
  displayedReelIdentity?: string;
};

const MAX_FILMS = 20;
const MAX_FILM_LENGTH = 160;
const MAX_BRIEF_LENGTH = 1200;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const GENERATION_JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export function normalizeExcludedFilms(value: unknown): ExcludedFilm[] {
  if (!Array.isArray(value)) return [];
  const films: ExcludedFilm[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (!isRecord(candidate) || typeof candidate.title !== 'string' || typeof candidate.year !== 'string') continue;
    const title = candidate.title.trim();
    const year = candidate.year.trim();
    const key = `${title.toLocaleLowerCase()}|${year}`;
    if (!title || title.length > MAX_FILM_LENGTH || !/^\d{4}$/.test(year) || seen.has(key)) continue;
    seen.add(key);
    films.push({ title, year });
    if (films.length === 100) break;
  }
  return films;
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
  const rawNotes = isRecord(value.programNotes) ? value.programNotes : null;
  const carriesThrough = rawNotes ? requiredText(rawNotes.carriesThrough) : null;
  const takesYouFurther = rawNotes ? requiredText(rawNotes.takesYouFurther) : null;
  const programNotes = carriesThrough && takesYouFurther && carriesThrough.length <= 240 && takesYouFurther.length <= 240
    ? { carriesThrough, takesYouFurther } : undefined;
  return { title, year, timecode, reason, watchFor, ...(programNotes ? { programNotes } : {}) };
}

export function parseAfterimageResultV2(value: unknown, experience?: Experience): AfterimageResultV2 | null {
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
  const recommendations = value.recommendations.map(item => parseRecommendation(item));
  if (!recommendations.every((item): item is RecommendationV2 => item !== null)) return null;

  const fingerprint = experience === LIGHT_TABLE_EXPERIENCE ? parseFacetMap(value.fingerprint) : null;
  const recommendationFacets = experience === LIGHT_TABLE_EXPERIENCE
    ? value.recommendations.map(item => parseFacetMap(isRecord(item) ? item.facets : undefined))
    : [];
  const hasCompleteExtension = Boolean(
    fingerprint && recommendationFacets.every((facets): facets is FacetMap => facets !== null),
  );

  return {
    status: 'complete',
    sourceFilms,
    persona,
    insight,
    palette,
    sensibilities,
    spiritDirector: { name: directorName, reason: directorReason },
    recommendations: hasCompleteExtension
      ? recommendations.map((recommendation, index) => ({ ...recommendation, facets: recommendationFacets[index]! }))
      : recommendations,
    ...(hasCompleteExtension ? { fingerprint: fingerprint! } : {}),
  };
}

export function getRecommendationIdentity(result: Pick<AfterimageResultV2, 'recommendations'> | null | undefined): string {
  return result?.recommendations
    .map((recommendation) => movieKey(recommendation.title, recommendation.year))
    .join('::') ?? '';
}

export function acceptedInputForResumedJob(
  resumedJobId: string,
  acceptedInputJobId: string | undefined,
  acceptedInput: DevelopInput | undefined,
): DevelopInput | undefined {
  return acceptedInput && acceptedInputJobId === resumedJobId ? acceptedInput : undefined;
}

export type LightTableJobLifecycleState = {
  activeJobId: string | null;
  selectedFacets: SelectedFacets;
  selectedReelIdentity: string;
  acceptedInput?: DevelopInput;
  acceptedInputJobId?: string;
};

export type LightTableJobLifecycleEvent =
  | { type: 'conflict'; jobId: string }
  | { type: 'failed' }
  | { type: 'complete'; jobId: string };

export function transitionLightTableJob(
  state: LightTableJobLifecycleState,
  event: LightTableJobLifecycleEvent,
): LightTableJobLifecycleState {
  if (event.type === 'failed') return state;
  if (event.type === 'conflict') return { ...state, activeJobId: event.jobId };

  const acceptedInput = acceptedInputForResumedJob(event.jobId, state.acceptedInputJobId, state.acceptedInput);
  return {
    activeJobId: null,
    selectedFacets: {},
    selectedReelIdentity: '',
    ...(acceptedInput ? { acceptedInput, acceptedInputJobId: event.jobId } : {}),
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

export function buildDevelopPayload(
  films: readonly string[],
  creativeBrief: string,
  excludedFilms: readonly ExcludedFilm[] = [],
) {
  const exclusions = normalizeExcludedFilms(excludedFilms);
  return {
    films: normalizeFilms(films),
    creativeBrief: normalizeBrief(creativeBrief),
    ...(exclusions.length ? { excludedFilms: exclusions } : {}),
  };
}

export function parseStoredState(raw: string | null): ReelStateV2 {
  const fallback: ReelStateV2 = {
    version: 4,
    films: [],
    creativeBrief: '',
    result: null,
    activeJobId: null,
    metadataByKey: {},
    excludedFilms: [],
  };
  if (!raw) return fallback;

  try {
    const stored: unknown = JSON.parse(raw);
    if (!isRecord(stored)) return fallback;
    const experience = stored.experience === LIGHT_TABLE_EXPERIENCE ? LIGHT_TABLE_EXPERIENCE : undefined;
    const result = parseAfterimageResultV2(stored.result, experience);
    const resultIdentity = getRecommendationIdentity(result);
    const allowedKeys = new Set(result?.recommendations.map((recommendation) => movieKey(recommendation.title, recommendation.year)) || []);
    const metadataByKey: Record<string, FilmEnrichment> = {};
    if (isRecord(stored.metadataByKey)) {
      for (const [key, rawMetadata] of Object.entries(stored.metadataByKey)) {
        if (!allowedKeys.has(key) || Object.keys(metadataByKey).length >= 5) continue;
        const metadata = parseFilmEnrichment(rawMetadata);
        if (!metadata || metadata.key !== key || metadata.status === 'unavailable') continue;
        metadataByKey[key] = metadata;
      }
    }
    const parsedSelections = parseSelectedFacets(stored.selectedFacets);
    const storedSelectionIdentity = typeof stored.selectedReelIdentity === 'string' ? stored.selectedReelIdentity : '';
    const selectionsBelongToResult = Boolean(
      resultIdentity &&
      (!storedSelectionIdentity || storedSelectionIdentity === resultIdentity) &&
      Object.values(parsedSelections).every((facet) => allowedKeys.has(movieKey(facet.source.title, facet.source.year))),
    );
    const selectedFacets = selectionsBelongToResult ? parsedSelections : {};
    const selectedReelIdentity = Object.keys(selectedFacets).length ? resultIdentity : '';
    const activeJobId = typeof stored.activeJobId === 'string' && GENERATION_JOB_ID.test(stored.activeJobId)
      ? stored.activeJobId
      : null;
    const acceptedInput = parseAcceptedInput(stored.acceptedInput) ?? undefined;
    const displayedInput = resultIdentity && stored.displayedReelIdentity === resultIdentity
      ? parseAcceptedInput(stored.displayedInput) ?? undefined
      : resultIdentity && !activeJobId && !Object.hasOwn(stored, 'displayedReelIdentity') ? acceptedInput : undefined;
    const storedAcceptedInputJobId = typeof stored.acceptedInputJobId === 'string' && GENERATION_JOB_ID.test(stored.acceptedInputJobId)
      ? stored.acceptedInputJobId
      : undefined;
    const acceptedInputJobId = acceptedInput
      ? storedAcceptedInputJobId ?? (!Object.hasOwn(stored, 'acceptedInputJobId') ? activeJobId ?? undefined : undefined)
      : undefined;

    return {
      version: 4,
      films: normalizeFilms(stored.films),
      creativeBrief: normalizeBrief(stored.creativeBrief),
      result,
      activeJobId,
      metadataByKey,
      excludedFilms: normalizeExcludedFilms(stored.excludedFilms),
      ...(experience ? {
        experience,
        selectedFacets,
        ...(selectedReelIdentity ? { selectedReelIdentity } : {}),
        ...(acceptedInput ? { acceptedInput } : {}),
        ...(displayedInput ? { displayedInput, displayedReelIdentity: resultIdentity } : {}),
        ...(acceptedInputJobId ? { acceptedInputJobId } : {}),
      } : {}),
    };
  } catch {
    return fallback;
  }
}

/** Recover the exact accepted intent so a blend retry never inherits old form inputs. */
export function parseAcceptedInput(value: unknown): DevelopInput | null {
  if (!isRecord(value) || value.experience !== LIGHT_TABLE_EXPERIENCE || !Array.isArray(value.films) || typeof value.creativeBrief !== 'string') return null;
  const base = buildDevelopPayload(value.films, value.creativeBrief, normalizeExcludedFilms(value.excludedFilms));
  if (base.films.length !== value.films.length || value.creativeBrief.length > 1200) return null;
  const selectedFacets = parseSelectedFacets(value.selectedFacets);
  if (value.selectedFacets !== undefined && (!isRecord(value.selectedFacets) || Object.keys(selectedFacets).length !== Object.keys(value.selectedFacets).length)) return null;
  if (!canDevelop(base.films, base.creativeBrief) && !Object.keys(selectedFacets).length) return null;
  return { ...base, experience: LIGHT_TABLE_EXPERIENCE, ...(Object.keys(selectedFacets).length ? {selectedFacets} : {}) };
}

export function withCurrentExclusions(input: DevelopInput, current: readonly ExcludedFilm[]): DevelopInput {
  const all = [...current, ...(input.excludedFilms ?? [])];
  const identities = new Set(all.map(film => `${film.title.trim().toLocaleLowerCase()}|${film.year.trim()}`));
  if (input.experience === LIGHT_TABLE_EXPERIENCE && identities.size > 100) {
    throw new Error('This request exceeds the 100-film exclusion limit. Your saved exclusions have been preserved.');
  }
  const excludedFilms = normalizeExcludedFilms(all);
  const {excludedFilms: previous, ...rest} = input;
  void previous;
  return {...rest, ...(excludedFilms.length ? {excludedFilms} : {})};
}
