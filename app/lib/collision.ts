// A collision holds two films together and asks for the one real film between
// them. The companion verifies the answer (see companion/lib/collision-contract.mjs);
// this side builds the request and reads the finished result defensively.
import type { ExcludedFilm } from './reel-state.ts';

export type CollisionFilm = { title: string; year: string; tmdbId?: number };
export type CollisionResult = {
  kind: 'collision-v1';
  films: [CollisionFilm, CollisionFilm];
  film: CollisionFilm & { reason: string; fromFirst: string; fromSecond: string; watchFor: string };
};
export type CollisionInput = {
  films: [CollisionFilm, CollisionFilm];
  excludedFilms?: ExcludedFilm[];
  reelFilms?: ExcludedFilm[];
  likedFilms?: ExcludedFilm[];
  creativeBrief?: string;
};

const YEAR = /^\d{4}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : null;
}

function film(value: unknown): CollisionFilm | null {
  if (!isRecord(value)) return null;
  const title = text(value.title, 160);
  const year = typeof value.year === 'string' && YEAR.test(value.year) ? value.year : null;
  if (!title || !year) return null;
  const tmdbId = Number.isSafeInteger(value.tmdbId) && Number(value.tmdbId) > 0 ? Number(value.tmdbId) : undefined;
  return { title, year, ...(tmdbId ? { tmdbId } : {}) };
}

const identity = (item: { title: string; year: string }) => `${item.title.toLocaleLowerCase()}|${item.year}`;

export function sameFilm(a: { title: string; year: string }, b: { title: string; year: string }): boolean {
  return identity(a) === identity(b);
}

/** The two films, the viewer's exclusions and Likes, and the current mood if there is one. */
export function buildCollisionInput(first: CollisionFilm, second: CollisionFilm, { excludedFilms = [], likedFilms = [], creativeBrief = '', reelFilms = [] }: {
  excludedFilms?: readonly ExcludedFilm[]; likedFilms?: readonly ExcludedFilm[]; creativeBrief?: string; reelFilms?: readonly ExcludedFilm[];
} = {}): CollisionInput {
  const clean = (item: CollisionFilm): CollisionFilm => ({ title: item.title.trim(), year: item.year.trim(), ...(item.tmdbId ? { tmdbId: item.tmdbId } : {}) });
  const brief = creativeBrief.trim().slice(0, 1200);
  return {
    films: [clean(first), clean(second)],
    ...(excludedFilms.length ? { excludedFilms: excludedFilms.slice(0, 100).map(({ title, year }) => ({ title, year })) } : {}),
    ...(reelFilms.length ? { reelFilms: reelFilms.slice(0, 10).map(({ title, year }) => ({ title, year })) } : {}),
    ...(likedFilms.length ? { likedFilms: likedFilms.slice(0, 500).map(({ title, year }) => ({ title, year })) } : {}),
    ...(brief ? { creativeBrief: brief } : {}),
  };
}

export function parseCollision(value: unknown, expected?: readonly [CollisionFilm, CollisionFilm]): CollisionResult | null {
  if (!isRecord(value) || value.kind !== 'collision-v1' || !Array.isArray(value.films) || value.films.length !== 2 || !isRecord(value.film)) return null;
  const films = value.films.map(film);
  const between = film(value.film);
  if (!films[0] || !films[1] || !between) return null;
  if (expected && (!sameFilm(films[0], expected[0]) || !sameFilm(films[1], expected[1]))) return null;
  if (films.some(item => sameFilm(item!, between))) return null;
  const reason = text(value.film.reason, 400);
  const fromFirst = text(value.film.fromFirst, 240);
  const fromSecond = text(value.film.fromSecond, 240);
  const watchFor = text(value.film.watchFor, 300);
  if (!reason || !fromFirst || !fromSecond || !watchFor) return null;
  return { kind: 'collision-v1', films: [films[0], films[1]], film: { ...between, reason, fromFirst, fromSecond, watchFor } };
}
