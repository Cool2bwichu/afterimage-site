export type EnrichmentInput = {
  title: string;
  year: string;
  key: string;
  tmdbId?: number;
};

export type FilmEnrichment = ({ lookupVersion?: 2 } & (
  | {
      key: string;
      title: string;
      year: string;
      status: 'matched';
      tmdbId: number;
      imdbId: string | null;
      tmdbRating: number | null;
      posterUrl: string | null;
      backdropUrl?: string | null;
      overview: string;
      runtime: number | null;
      releaseDate: string | null;
      genres: string[];
      countries: string[];
      directors: string[];
    }
  | { key: string; title: string; year: string; status: 'unmatched' }
  | { key: string; title: string; year: string; status: 'unavailable' }));

type TmdbCandidate = {
  id?: unknown;
  title?: unknown;
  original_title?: unknown;
  release_date?: unknown;
  adult?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, max: number, allowEmpty = false): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if ((!text && !allowEmpty) || text.length > max) return null;
  return text;
}

function boundedStrings(value: unknown, maxItems: number, maxLength = 120): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const values = value.map((item) => boundedText(item, maxLength));
  return values.every((item): item is string => item !== null) ? values : null;
}

function safePosterUrl(value: unknown, backdrop = false): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > 500) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.origin !== 'https://image.tmdb.org') return null;
    if (!url.pathname.startsWith(backdrop ? '/t/p/w1280/' : '/t/p/w500/')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeMovieTitle(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Mark}/gu, '')
    .toLocaleLowerCase('en-US')
    .replace(/&/g, ' and ')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function movieKey(title: string, year: string): string {
  return `${normalizeMovieTitle(title)}|${year.trim()}`;
}

export function validateEnrichmentInput(value: unknown): EnrichmentInput[] {
  if (!isRecord(value) || Object.keys(value).some((key) => key !== 'films')) {
    throw new Error('Expected one to five films.');
  }
  if (!Array.isArray(value.films) || value.films.length < 1 || value.films.length > 5) {
    throw new Error('Expected one to five films.');
  }

  const seen = new Set<string>();
  return value.films.map((film) => {
    if (!isRecord(film) || Object.keys(film).some((key) => !['title', 'year', 'tmdbId'].includes(key))) {
      throw new Error('Each film needs only a title and year.');
    }
    const title = boundedText(film.title, 160);
    const year = boundedText(film.year, 4);
    if (!title || !year || !/^\d{4}$/.test(year)) throw new Error('Each film needs a valid title and year.');
    const key = movieKey(title, year);
    if (!normalizeMovieTitle(title) || seen.has(key)) throw new Error('Duplicate or invalid film.');
    seen.add(key);
    if (film.tmdbId !== undefined && (!Number.isSafeInteger(film.tmdbId) || Number(film.tmdbId) <= 0)) throw new Error('Invalid catalog identity.');
    return { title, year, key, ...(film.tmdbId !== undefined ? { tmdbId: Number(film.tmdbId) } : {}) };
  });
}

export function selectExactMovie(input: EnrichmentInput, candidates: unknown): TmdbCandidate | null {
  if (!Array.isArray(candidates)) return null;
  const requestedTitle = normalizeMovieTitle(input.title);
  const matches = new Map<number, TmdbCandidate>();

  for (const candidate of candidates) {
    if (!isRecord(candidate) || candidate.adult === true) continue;
    const id = candidate.id;
    const releaseDate = candidate.release_date;
    if (!Number.isInteger(id) || Number(id) <= 0 || typeof releaseDate !== 'string' || releaseDate.slice(0, 4) !== input.year) continue;
    const title = typeof candidate.title === 'string' ? normalizeMovieTitle(candidate.title) : '';
    const originalTitle = typeof candidate.original_title === 'string' ? normalizeMovieTitle(candidate.original_title) : '';
    if (title !== requestedTitle && originalTitle !== requestedTitle) continue;
    matches.set(Number(id), candidate);
  }

  return matches.size === 1 ? [...matches.values()][0] : null;
}

export function imdbUrl(imdbId: string | null | undefined): string | null {
  return typeof imdbId === 'string' && /^tt\d{7,10}$/.test(imdbId)
    ? `https://www.imdb.com/title/${imdbId}/`
    : null;
}

export function parseFilmEnrichment(value: unknown): FilmEnrichment | null {
  if (!isRecord(value)) return null;
  const title = boundedText(value.title, 160);
  const year = boundedText(value.year, 4);
  const key = boundedText(value.key, 220);
  if (!title || !year || !/^\d{4}$/.test(year) || !key || key !== movieKey(title, year)) return null;

  if (value.status === 'unmatched' || value.status === 'unavailable') {
    return { key, title, year, status: value.status, ...(value.lookupVersion === 2 ? { lookupVersion: 2 } : {}) };
  }
  if (value.status !== 'matched' || !Number.isInteger(value.tmdbId) || Number(value.tmdbId) <= 0) return null;

  const imdbId = value.imdbId === null ? null : typeof value.imdbId === 'string' && imdbUrl(value.imdbId) ? value.imdbId : null;
  const tmdbRating = value.tmdbRating === undefined || value.tmdbRating === null
    ? null
    : typeof value.tmdbRating === 'number' && Number.isFinite(value.tmdbRating) && value.tmdbRating >= 0 && value.tmdbRating <= 10
      ? Math.round(value.tmdbRating * 10) / 10
      : null;
  if (value.tmdbRating !== undefined && value.tmdbRating !== null && tmdbRating === null) return null;
  const posterUrl = safePosterUrl(value.posterUrl);
  if (value.posterUrl !== null && posterUrl === null) return null;
  const backdropUrl = value.backdropUrl === undefined ? undefined : safePosterUrl(value.backdropUrl, true);
  if (value.backdropUrl !== undefined && value.backdropUrl !== null && backdropUrl === null) return null;
  const overview = boundedText(value.overview, 2000, true);
  const runtime = value.runtime === null ? null : Number.isInteger(value.runtime) && Number(value.runtime) > 0 && Number(value.runtime) < 1000 ? Number(value.runtime) : null;
  const releaseDate = value.releaseDate === null ? null : boundedText(value.releaseDate, 10);
  const genres = boundedStrings(value.genres, 10);
  const countries = boundedStrings(value.countries, 10);
  const directors = boundedStrings(value.directors, 5);
  if (overview === null || genres === null || countries === null || directors === null) return null;
  if (releaseDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) return null;

  return {
    key,
    title,
    year,
    status: 'matched',
    ...(value.lookupVersion === 2 ? { lookupVersion: 2 as const } : {}),
    tmdbId: Number(value.tmdbId),
    imdbId,
    tmdbRating,
    posterUrl,
    ...(backdropUrl !== undefined ? { backdropUrl } : {}),
    overview,
    runtime,
    releaseDate,
    genres,
    countries,
    directors,
  };
}

export function parseEnrichmentResponse(value: unknown): FilmEnrichment[] {
  if (!isRecord(value) || !Array.isArray(value.films) || value.films.length < 1 || value.films.length > 5) {
    throw new Error('Invalid film metadata response.');
  }
  const films = value.films.map(parseFilmEnrichment);
  if (!films.every((film): film is FilmEnrichment => film !== null)) throw new Error('Invalid film metadata response.');
  if (new Set(films.map((film) => film.key)).size !== films.length) throw new Error('Invalid film metadata response.');
  return films;
}
