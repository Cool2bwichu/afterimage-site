export type FilmSearchResult = { id: number; title: string; year: string; posterUrl: string | null; overview?: string };

/** Keep lookup identities complete and distinguish remakes before generation. */
export function parseFilmSearchResults(raw: unknown): FilmSearchResult[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  return raw.flatMap(item => {
    if (!item || typeof item !== 'object' || !Number.isSafeInteger(item.id) || item.id <= 0 || seen.has(item.id)
      || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 160
      || typeof item.year !== 'string' || !/^\d{4}$/.test(item.year)) return [];
    seen.add(item.id);
    const posterUrl = typeof item.posterUrl === 'string' && /^https:\/\/image\.tmdb\.org\/t\/p\/w500\/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$/i.test(item.posterUrl) ? item.posterUrl : null;
    return [{ id: item.id, title: item.title.trim(), year: item.year, posterUrl, ...(typeof item.overview === 'string' && item.overview.trim() ? { overview: item.overview.trim().slice(0, 320) } : {}) }];
  }).slice(0, 6);
}
