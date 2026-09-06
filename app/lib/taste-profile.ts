import { movieKey } from './movie-metadata.ts';

export type LikedFilm = { title: string; year: string };
export const TASTE_STORAGE_KEY = 'afterimage:liked-films:v1';
export const MAX_LIKED_FILMS = 500;

export function parseLikedFilms(raw: string | null): LikedFilm[] {
  try {
    const value: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(value)) return [];
    const films: LikedFilm[] = [];
    const seen = new Set<string>();
    for (const item of value) {
      if (!item || typeof item.title !== 'string' || typeof item.year !== 'string') continue;
      const title = item.title.trim();
      const year = item.year.trim();
      const key = movieKey(title, year);
      if (!title || title.length > 160 || !/^\d{4}$/.test(year) || seen.has(key)) continue;
      seen.add(key);
      films.push({ title, year });
      if (films.length === MAX_LIKED_FILMS) break;
    }
    return films;
  } catch { return []; }
}

export function toggleLikedFilm(films: LikedFilm[], film: LikedFilm): LikedFilm[] {
  const key = movieKey(film.title, film.year);
  if (films.some(item => movieKey(item.title, item.year) === key)) {
    return films.filter(item => movieKey(item.title, item.year) !== key);
  }
  if (films.length >= MAX_LIKED_FILMS) throw new Error('Your taste history holds 500 films. Remove a like to make room for another.');
  return [...films, {title: film.title, year: film.year}];
}
