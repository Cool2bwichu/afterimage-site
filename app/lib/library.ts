import { movieKey } from './movie-metadata.ts';
import { parseLikedFilms, type LikedFilm } from './taste-profile.ts';

export const WATCHLIST_KEY = 'afterimage:watchlist:v1';
export const MAX_WATCHLIST = 500;
export type SavedFilm = LikedFilm & { tmdbId?: number };

export function parseWatchlist(raw: string | null): SavedFilm[] {
  try {
    const value = JSON.parse(raw || '[]');
    if (!Array.isArray(value)) return [];
    return parseLikedFilms(raw).map(film => {
      const source = value.find(item => item && movieKey(String(item.title || ''), String(item.year || '')) === movieKey(film.title, film.year));
      return { ...film, ...(Number.isSafeInteger(source?.tmdbId) && source.tmdbId > 0 ? { tmdbId: source.tmdbId } : {}) };
    });
  } catch { return []; }
}

export function toggleWatchlist(films: SavedFilm[], film: SavedFilm): SavedFilm[] {
  const key = movieKey(film.title, film.year);
  const existing = films.some(item => movieKey(item.title, item.year) === key || Boolean(film.tmdbId && item.tmdbId === film.tmdbId));
  if (existing) return films.filter(item => movieKey(item.title, item.year) !== key && !(film.tmdbId && item.tmdbId === film.tmdbId));
  if (films.length >= MAX_WATCHLIST) throw Error('Your watchlist holds 500 films. Remove a film to make room.');
  return [...films, film];
}

export function mergeLibraryBackup(raw: unknown, current: SavedFilm[]): SavedFilm[] {
  if (!raw || typeof raw !== 'object' || !('version' in raw) || raw.version !== 1 || !('watchlist' in raw) || !Array.isArray(raw.watchlist) || raw.watchlist.length > MAX_WATCHLIST) throw Error('Choose an AFTERIMAGE library backup.');
  const imported = parseWatchlist(JSON.stringify(raw.watchlist));
  if (imported.length !== raw.watchlist.length) throw Error('The backup contains incomplete or duplicate films.');
  const next = [...current];
  for (const film of imported) {
    if (!next.some(item => movieKey(item.title, item.year) === movieKey(film.title, film.year) || Boolean(film.tmdbId && item.tmdbId === film.tmdbId))) next.push(film);
  }
  if (next.length > MAX_WATCHLIST) throw Error('This backup would exceed the 500-film watchlist limit.');
  return next;
}
