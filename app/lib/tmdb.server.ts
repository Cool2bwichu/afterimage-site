import type { EnrichmentInput, FilmEnrichment } from './movie-metadata.ts';
import { imdbUrl, selectExactMovie } from './movie-metadata.ts';
import { parseFilmSearchResults } from './film-search.ts';

type FetchLike = typeof fetch;

type TmdbOptions = {
  token: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  baseUrl?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, max = 2000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function namedValues(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => isRecord(item) ? stringValue(item.name, 120) : '')
    .filter(Boolean)
    .slice(0, maxItems);
}

function posterUrl(path: unknown, size = 'w500'): string | null {
  if (typeof path !== 'string' || !/^\/[A-Za-z0-9._-]+\.(?:jpg|jpeg|png|webp)$/i.test(path)) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

function identity(input: EnrichmentInput, status: 'unmatched' | 'unavailable'): FilmEnrichment {
  return { key: input.key, title: input.title, year: input.year, status };
}

export function createTmdbClient({
  token,
  fetchImpl = fetch,
  timeoutMs = 8_000,
  baseUrl = 'https://api.themoviedb.org/3',
}: TmdbOptions) {
  const credential = token.trim();
  if (!credential) throw new Error('TMDB is not configured.');

  async function requestJson(url: URL): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${credential}`, Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('TMDB request failed.');
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function enrichOne(input: EnrichmentInput): Promise<FilmEnrichment> {
    try {
      const searchUrl = new URL(`${baseUrl}/search/movie`);
      searchUrl.search = new URLSearchParams({
        query: input.title,
        primary_release_year: input.year,
        include_adult: 'false',
        language: 'en-US',
        page: '1',
      }).toString();
      const search = await requestJson(searchUrl);
      const candidate = isRecord(search) ? selectExactMovie(input, search.results) : null;
      if (!candidate || !Number.isInteger(candidate.id)) return identity(input, 'unmatched');

      const detailsUrl = new URL(`${baseUrl}/movie/${Number(candidate.id)}`);
      detailsUrl.search = new URLSearchParams({
        append_to_response: 'credits,external_ids',
        language: 'en-US',
      }).toString();
      const details = await requestJson(detailsUrl);
      if (!isRecord(details)) return identity(input, 'unavailable');

      const crew = isRecord(details.credits) && Array.isArray(details.credits.crew) ? details.credits.crew : [];
      const directors = crew
        .filter((person) => isRecord(person) && person.job === 'Director')
        .map((person) => isRecord(person) ? stringValue(person.name, 120) : '')
        .filter(Boolean)
        .slice(0, 5);
      const externalIds = isRecord(details.external_ids) ? details.external_ids : {};
      const imdbId = typeof externalIds.imdb_id === 'string' && imdbUrl(externalIds.imdb_id) ? externalIds.imdb_id : null;
      const runtime = Number.isInteger(details.runtime) && Number(details.runtime) > 0 && Number(details.runtime) < 1000
        ? Number(details.runtime)
        : null;
      const tmdbRating = typeof details.vote_average === 'number' && Number.isFinite(details.vote_average) &&
        details.vote_average >= 0 && details.vote_average <= 10
        ? Math.round(details.vote_average * 10) / 10
        : null;
      const releaseDate = typeof details.release_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(details.release_date)
        ? details.release_date
        : null;

      return {
        key: input.key,
        title: input.title,
        year: input.year,
        status: 'matched',
        tmdbId: Number(candidate.id),
        imdbId,
        tmdbRating,
        posterUrl: posterUrl(details.poster_path),
        backdropUrl: posterUrl(details.backdrop_path, 'w1280'),
        overview: stringValue(details.overview, 2000),
        runtime,
        releaseDate,
        genres: namedValues(details.genres, 10),
        countries: namedValues(details.production_countries, 10),
        directors,
      };
    } catch {
      return identity(input, 'unavailable');
    }
  }

  async function enrichMany(inputs: EnrichmentInput[]): Promise<FilmEnrichment[]> {
    if (inputs.length < 1 || inputs.length > 5) throw new Error('Expected one to five films.');
    return Promise.all(inputs.map(enrichOne));
  }

  async function searchFilms(query: string) {
    const url = new URL(`${baseUrl}/search/movie`);
    url.search = new URLSearchParams({ query, include_adult: 'false', language: 'en-US', page: '1' }).toString();
    const raw = await requestJson(url);
    if (!isRecord(raw) || !Array.isArray(raw.results)) throw new Error('Incomplete film search.');
    return parseFilmSearchResults(raw.results.filter(item => isRecord(item) && item.adult !== true).map(item => ({
      id: item.id, title: item.title, year: typeof item.release_date === 'string' ? item.release_date.slice(0, 4) : '', posterUrl: posterUrl(item.poster_path),
    })));
  }

  return { enrichOne, enrichMany, searchFilms };
}
