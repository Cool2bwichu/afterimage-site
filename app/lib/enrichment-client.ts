import type { RecommendationV2 } from './reel-state.ts';
import type { FilmEnrichment } from './movie-metadata.ts';
import { parseEnrichmentResponse } from './movie-metadata.ts';
import { apiFetch } from './api.ts';

export class FilmEnrichmentError extends Error {
  constructor(public code: 'NOT_CONFIGURED' | 'UNAVAILABLE' | 'INVALID_RESPONSE') {
    super('Film details are temporarily unavailable.');
    this.name = 'FilmEnrichmentError';
  }
}

export async function fetchFilmEnrichment({
  recommendations,
  fetchImpl = apiFetch,
  signal,
}: {
  recommendations: readonly RecommendationV2[];
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
  signal?: AbortSignal;
}): Promise<FilmEnrichment[]> {
  if (recommendations.length < 1 || recommendations.length > 5) throw new FilmEnrichmentError('INVALID_RESPONSE');
  const films = recommendations.map(({ title, year }) => ({ title, year }));
  const response = await fetchImpl('/api/films/enrich', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ films }),
    cache: 'no-store',
    signal,
  });
  if (!response.ok) {
    throw new FilmEnrichmentError(response.status === 503 ? 'NOT_CONFIGURED' : 'UNAVAILABLE');
  }
  try {
    return parseEnrichmentResponse(await response.json());
  } catch {
    throw new FilmEnrichmentError('INVALID_RESPONSE');
  }
}

export function persistableEnrichment(records: readonly FilmEnrichment[]): Record<string, FilmEnrichment> {
  return Object.fromEntries(records.filter((record) => record.status !== 'unavailable').map((record) => [record.key, record]));
}
