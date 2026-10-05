// The Lobby. Once a film is chosen, Afterimage walks you into the cinema: a short ritual
// to set the room, then the lights go down and the site goes quiet for the film's
// running time. When the credits roll the usher is waiting with one question.
// A screening is kept only in this browser; nothing here is sent anywhere.
import { FACET_KEYS, type FacetMap } from './light-table.ts';

export const SCREENING_KEY = 'afterimage:screening:v1';
/** Minutes assumed for a film the catalogue has no running time for. */
export const DEFAULT_RUNTIME = 110;
export const INTERMISSION_MINUTES = 10;
/** One film, or a double feature. */
export const MAX_PROGRAMME = 2;
/** A screening left in the dark for longer than this is no longer tonight's. */
const STALE_AFTER_MS = 18 * 60 * 60 * 1000;

export type ProgrammeFilm = {
  title: string;
  year: string;
  tmdbId?: number;
  /** Minutes, from the catalogue; null when unknown. */
  runtime: number | null;
  /** The reel's own "what to watch for", which never spoils. */
  watchFor?: string;
  facets?: FacetMap;
  directors?: string[];
  posterUrl?: string | null;
  backdropUrl?: string | null;
};

export type Screening = {
  version: 1;
  films: ProgrammeFilm[];
  /** When the lights went down. Absent while you are still in the lobby. */
  lightsDownAt?: string;
};

export type ScreeningPhase =
  | { kind: 'lobby' }
  | { kind: 'showing'; index: number; endsAt: number }
  | { kind: 'intermission'; index: number; endsAt: number }
  | { kind: 'credits'; at: number };

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : undefined;
}

function tmdbImage(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === 'https://image.tmdb.org' ? url.toString() : undefined;
  } catch { return undefined; }
}

function facets(value: unknown): FacetMap | undefined {
  if (!record(value)) return undefined;
  const map: Partial<FacetMap> = {};
  for (const channel of FACET_KEYS) {
    const facet = value[channel];
    if (!record(facet)) return undefined;
    const label = text(facet.label, 120);
    const explanation = text(facet.explanation, 600) ?? '';
    const traits = Array.isArray(facet.traits) ? facet.traits.filter((trait): trait is string => typeof trait === 'string' && trait.length <= 80).slice(0, 6) : [];
    if (!label) return undefined;
    map[channel] = { label, explanation, traits };
  }
  return map as FacetMap;
}

export function parseProgrammeFilm(value: unknown): ProgrammeFilm | null {
  if (!record(value)) return null;
  const title = text(value.title, 160);
  const year = typeof value.year === 'string' && /^\d{4}$/.test(value.year) ? value.year : undefined;
  if (!title || !year) return null;
  const runtime = typeof value.runtime === 'number' && Number.isInteger(value.runtime) && value.runtime > 0 && value.runtime <= 1200 ? value.runtime : null;
  const tmdbId = typeof value.tmdbId === 'number' && Number.isSafeInteger(value.tmdbId) && value.tmdbId > 0 ? value.tmdbId : undefined;
  const watchFor = text(value.watchFor, 600);
  const directors = Array.isArray(value.directors) ? value.directors.filter((name): name is string => typeof name === 'string' && name.length <= 120).slice(0, 4) : [];
  const posterUrl = tmdbImage(value.posterUrl);
  const backdropUrl = tmdbImage(value.backdropUrl);
  const qualities = facets(value.facets);
  return {
    title, year, runtime,
    ...(tmdbId ? { tmdbId } : {}),
    ...(watchFor ? { watchFor } : {}),
    ...(qualities ? { facets: qualities } : {}),
    ...(directors.length ? { directors } : {}),
    ...(posterUrl !== undefined ? { posterUrl } : {}),
    ...(backdropUrl !== undefined ? { backdropUrl } : {}),
  };
}

/** A tonight's screening from storage, or null when there is none worth resuming. */
export function parseScreening(raw: string | null, now = Date.now()): Screening | null {
  if (!raw) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!record(value) || value.version !== 1 || !Array.isArray(value.films)) return null;
  const films = value.films.map(parseProgrammeFilm);
  if (!films.length || films.length > MAX_PROGRAMME || films.some(film => !film)) return null;
  const screening: Screening = { version: 1, films: films as ProgrammeFilm[] };
  if (value.lightsDownAt !== undefined) {
    const at = typeof value.lightsDownAt === 'string' ? Date.parse(value.lightsDownAt) : NaN;
    if (!Number.isFinite(at) || at > now + 60_000) return null;
    if (now - at > programmeMinutes(screening.films) * 60_000 + STALE_AFTER_MS) return null;
    screening.lightsDownAt = new Date(at).toISOString();
  }
  return screening;
}

export function serializeScreening(screening: Screening): string {
  return JSON.stringify(screening);
}

export function minutesFor(film: Pick<ProgrammeFilm, 'runtime'>): number {
  return film.runtime ?? DEFAULT_RUNTIME;
}

/** Running time of the whole programme, an intermission between two films included. */
export function programmeMinutes(films: readonly Pick<ProgrammeFilm, 'runtime'>[]): number {
  return films.reduce((total, film) => total + minutesFor(film), 0) + Math.max(0, films.length - 1) * INTERMISSION_MINUTES;
}

/** When the last credits roll if the lights go down at `start`. */
export function creditsRollAt(films: readonly Pick<ProgrammeFilm, 'runtime'>[], start: number): number {
  return start + programmeMinutes(films) * 60_000;
}

export function hasKnownRuntimes(films: readonly Pick<ProgrammeFilm, 'runtime'>[]): boolean {
  return films.every(film => film.runtime !== null);
}

/** Where the evening is: in the lobby, during a film, at the intermission, or at the credits. */
export function screeningPhase(screening: Screening, now: number): ScreeningPhase {
  if (!screening.lightsDownAt) return { kind: 'lobby' };
  let cursor = Date.parse(screening.lightsDownAt);
  for (const [index, film] of screening.films.entries()) {
    const endsAt = cursor + minutesFor(film) * 60_000;
    if (now < endsAt) return { kind: 'showing', index, endsAt };
    cursor = endsAt;
    if (index < screening.films.length - 1) {
      const resumes = cursor + INTERMISSION_MINUTES * 60_000;
      if (now < resumes) return { kind: 'intermission', index, endsAt: resumes };
      cursor = resumes;
    }
  }
  return { kind: 'credits', at: cursor };
}

export function startScreening(films: readonly ProgrammeFilm[]): Screening {
  return { version: 1, films: films.slice(0, MAX_PROGRAMME).map(film => ({ ...film })) };
}

export function lightsDown(screening: Screening, now: number): Screening {
  return { ...screening, lightsDownAt: new Date(now).toISOString() };
}

/**
 * "The film's over": brings the next boundary to now. During a film that ends it (into
 * the intermission of a double feature, or the credits); during an intermission the
 * second film starts.
 */
export function skipAhead(screening: Screening, now: number): Screening {
  const phase = screeningPhase(screening, now);
  if (!screening.lightsDownAt || (phase.kind !== 'showing' && phase.kind !== 'intermission')) return screening;
  const shift = phase.endsAt - now;
  return { ...screening, lightsDownAt: new Date(Date.parse(screening.lightsDownAt) - shift).toISOString() };
}

export function addToProgramme(screening: Screening, film: ProgrammeFilm): Screening {
  if (screening.lightsDownAt || screening.films.length >= MAX_PROGRAMME) return screening;
  if (screening.films.some(item => item.title.toLocaleLowerCase() === film.title.toLocaleLowerCase() && item.year === film.year)) return screening;
  return { ...screening, films: [...screening.films, { ...film }] };
}

export function removeFromProgramme(screening: Screening, index: number): Screening {
  if (screening.lightsDownAt || screening.films.length < 2) return screening;
  return { ...screening, films: screening.films.filter((_, position) => position !== index) };
}

/** "2 h 4 min", "96 min". */
export function formatRuntime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** "10:41 pm" in the viewer's locale and time zone. */
export function formatClock(at: number, locale?: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', ...(timeZone ? { timeZone } : {}) }).format(new Date(at)).replace(/\s?(AM|PM)$/i, (_, half: string) => ` ${half.toLowerCase()}`);
}

/** "1:23:05" or "12:09" left on the clock. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const two = (value: number) => String(value).padStart(2, '0');
  return hours ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}

export type RitualStep = { label: string; text: string };

/**
 * The few minutes before the lights go down. The room and the sound are the same
 * advice for every film; what to watch for is the reel's own line, which never spoils.
 */
export function ritual(films: readonly ProgrammeFilm[], hour: number): RitualStep[] {
  const daylight = hour >= 7 && hour < 18;
  const steps: RitualStep[] = [
    { label: 'The room', text: daylight ? 'Draw the curtains. It was made for a dark room, even at this hour.' : 'Lamps off. If you need a light, keep it behind you, never beside the screen.' },
    { label: 'The sound', text: 'Turn it up a little more than feels polite. Half of any film is what you hear.' },
    { label: 'Your phone', text: films.length > 1 ? 'Put it in another room until the intermission. Afterimage will go quiet too.' : 'Put it in another room. Afterimage will go quiet too, and be here when the credits roll.' },
  ];
  films.forEach((film, index) => {
    steps.push({
      label: films.length > 1 ? (index === 0 ? 'First, watch for' : 'Then, watch for') : 'Watch for',
      text: film.watchFor ?? 'Nothing in particular. Let it arrive, and stay until the last frame.',
    });
    if (index === 0 && films.length > 1) steps.push({ label: 'Intermission', text: `${INTERMISSION_MINUTES} minutes between the two. Stand up, refill, and don’t talk about the first one yet.` });
  });
  return steps;
}
