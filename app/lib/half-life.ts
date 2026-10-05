// Half-life. Ratings measure the night; this measures the months after. Once a film is in
// the journal, Afterimage asks again, gently: a day later, a week, a month, a season.
// One tap: gone, still there, or stronger. The answers stay in this browser and only
// brighten your sky; a film shapes recommendations only if you also Like it.
import type { AfterimageEntry } from './afterimages.ts';
import { movieKey } from './movie-metadata.ts';

export const HALF_LIFE_KEY = 'afterimage:half-life:v1';

export const CHECKPOINTS = [
  { id: 'day', days: 1, label: 'A day later', since: 'a day' },
  { id: 'week', days: 7, label: 'A week later', since: 'a week' },
  { id: 'month', days: 30, label: 'A month later', since: 'a month' },
  { id: 'season', days: 91, label: 'A season later', since: 'three months' },
] as const;
/** After a year the journal stops asking; by then the film has settled. */
export const LAST_ASK_DAY = 365;

export type CheckpointId = typeof CHECKPOINTS[number]['id'];
export type Checkpoint = typeof CHECKPOINTS[number];
export type Reading = 'gone' | 'there' | 'stronger';
export const READINGS: readonly Reading[] = ['gone', 'there', 'stronger'];
export const READING_LABEL: Record<Reading, string> = { gone: 'It’s gone', there: 'Still there', stronger: 'Stronger' };
/** How strongly a film is still with you, 0 to 1, for drawing. */
export const READING_STRENGTH: Record<Reading, number> = { gone: 0.12, there: 0.55, stronger: 0.92 };

export type HalfLifeRecord = {
  readings: Partial<Record<CheckpointId, { value: Reading; on: string }>>;
  /** A day on which "ask me later" was chosen. */
  later?: string;
};
export type HalfLifeBook = { version: 1; films: Record<string, HalfLifeRecord> };
export type CheckIn = { entry: AfterimageEntry; checkpoint: Checkpoint; days: number };
export type Trend = 'growing' | 'holding' | 'fading';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_FILMS = 500;

export function emptyBook(): HalfLifeBook {
  return { version: 1, films: {} };
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

/** Whole days from one calendar date to another. */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

export function parseHalfLife(raw: string | null): HalfLifeBook {
  if (!raw) return emptyBook();
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return emptyBook(); }
  if (!record(value) || value.version !== 1 || !record(value.films)) return emptyBook();
  const films: Record<string, HalfLifeRecord> = {};
  for (const [key, item] of Object.entries(value.films).slice(0, MAX_FILMS)) {
    if (!/^.{1,200}\|\d{4}$/.test(key) || !record(item) || !record(item.readings)) continue;
    const readings: HalfLifeRecord['readings'] = {};
    for (const checkpoint of CHECKPOINTS) {
      const reading = item.readings[checkpoint.id];
      if (record(reading) && READINGS.includes(reading.value as Reading) && typeof reading.on === 'string' && DATE.test(reading.on)) {
        readings[checkpoint.id] = { value: reading.value as Reading, on: reading.on };
      }
    }
    films[key] = { readings, ...(typeof item.later === 'string' && DATE.test(item.later) ? { later: item.later } : {}) };
  }
  return { version: 1, films };
}

export function serializeHalfLife(book: HalfLifeBook): string {
  return JSON.stringify(book);
}

/** The checkpoint a film has reached on `today`, if any is still worth asking. */
export function checkpointFor(watchedOn: string, today: string): Checkpoint | null {
  const days = daysBetween(watchedOn, today);
  if (days < CHECKPOINTS[0].days || days > LAST_ASK_DAY) return null;
  return [...CHECKPOINTS].reverse().find(checkpoint => days >= checkpoint.days) ?? null;
}

/**
 * The one check-in to ask now, or null. Only the latest checkpoint a film has reached is
 * asked; a missed day or week is never asked late. Of several films, the one whose
 * moment arrived most recently comes first.
 */
export function dueCheckIn(entries: readonly AfterimageEntry[], book: HalfLifeBook, today: string): CheckIn | null {
  let best: CheckIn | null = null;
  let bestAge = Infinity;
  for (const entry of entries) {
    const checkpoint = checkpointFor(entry.watchedOn, today);
    if (!checkpoint) continue;
    const film = book.films[movieKey(entry.title, entry.year)];
    if (film?.readings[checkpoint.id] || film?.later === today) continue;
    const later = CHECKPOINTS.slice(CHECKPOINTS.indexOf(checkpoint) + 1);
    if (later.some(next => film?.readings[next.id])) continue;
    const days = daysBetween(entry.watchedOn, today);
    const age = days - checkpoint.days;
    if (age < bestAge || (age === bestAge && best && entry.watchedOn > best.entry.watchedOn)) {
      best = { entry, checkpoint, days };
      bestAge = age;
    }
  }
  return best;
}

export function recordReading(book: HalfLifeBook, film: { title: string; year: string }, checkpoint: CheckpointId, value: Reading, today: string): HalfLifeBook {
  const key = movieKey(film.title, film.year);
  const current = book.films[key] ?? { readings: {} };
  return { version: 1, films: { ...book.films, [key]: { readings: { ...current.readings, [checkpoint]: { value, on: today } } } } };
}

export function askLater(book: HalfLifeBook, film: { title: string; year: string }, today: string): HalfLifeBook {
  const key = movieKey(film.title, film.year);
  const current = book.films[key] ?? { readings: {} };
  return { version: 1, films: { ...book.films, [key]: { ...current, later: today } } };
}

export function forgetFilm(book: HalfLifeBook, film: { title: string; year: string }): HalfLifeBook {
  const key = movieKey(film.title, film.year);
  if (!book.films[key]) return book;
  const films = { ...book.films };
  delete films[key];
  return { version: 1, films };
}

/** Readings in the order they were asked. */
export function readingsOf(film: HalfLifeRecord | undefined): Array<{ checkpoint: Checkpoint; value: Reading; on: string }> {
  if (!film) return [];
  return CHECKPOINTS.flatMap(checkpoint => {
    const reading = film.readings[checkpoint.id];
    return reading ? [{ checkpoint, ...reading }] : [];
  });
}

export function latestReading(film: HalfLifeRecord | undefined): Reading | null {
  return readingsOf(film).at(-1)?.value ?? null;
}

/** Whether a film is growing in you, holding, or fading, from its last two answers. */
export function trend(film: HalfLifeRecord | undefined): Trend | null {
  const readings = readingsOf(film);
  const last = readings.at(-1);
  if (!last) return null;
  const previous = readings.at(-2);
  if (!previous) return last.value === 'stronger' ? 'growing' : last.value === 'gone' ? 'fading' : 'holding';
  const delta = READING_STRENGTH[last.value] - READING_STRENGTH[previous.value];
  if (last.value === 'stronger' || delta > 0) return 'growing';
  if (last.value === 'gone' || delta < 0) return 'fading';
  return 'holding';
}

/** How much brighter (or dimmer) a film's star burns for what it became in you. */
export function halfLifeGlow(film: HalfLifeRecord | undefined): number {
  const last = latestReading(film);
  if (!last) return 0;
  const sustained = readingsOf(film).filter(reading => reading.value === 'stronger').length;
  return last === 'stronger' ? 0.22 + Math.min(0.12, (sustained - 1) * 0.06) : last === 'there' ? 0.08 : -0.18;
}

/** Films that grew in you, most recently confirmed first. */
export function growingFilms(entries: readonly AfterimageEntry[], book: HalfLifeBook): AfterimageEntry[] {
  return entries
    .map(entry => ({ entry, film: book.films[movieKey(entry.title, entry.year)] }))
    .filter(({ film }) => latestReading(film) === 'stronger')
    .sort((a, b) => (readingsOf(b.film).at(-1)?.on ?? '').localeCompare(readingsOf(a.film).at(-1)?.on ?? ''))
    .map(({ entry }) => entry);
}

/** A reel request built from the films that grew: the strongest taste signal there is. */
export function stayedRequest(films: readonly { title: string; year: string }[]): { films: string[]; creativeBrief: string } | null {
  const chosen = films.slice(0, 5);
  if (!chosen.length) return null;
  return {
    films: chosen.map(film => `${film.title} (${film.year})`),
    creativeBrief: `${chosen.length === 1 ? 'This film' : 'These films'} grew stronger in my memory in the weeks after I watched ${chosen.length === 1 ? 'it' : 'them'}. Find films with that same staying power: the kind that keep developing after the credits, not the kind that dazzle for a night.`,
  };
}

/** A gentle question when a film keeps growing but has never been Liked. */
export function suggestsLike(film: HalfLifeRecord | undefined, liked: boolean): boolean {
  return !liked && latestReading(film) === 'stronger';
}

function icsDate(date: string): string {
  return date.replaceAll('-', '');
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function icsText(value: string): string {
  return value.replace(/[\\;,]/g, match => `\\${match}`).replace(/\r?\n/g, '\\n');
}

/**
 * The check-ins as calendar reminders, for anyone who wants the nudge without a server:
 * four all-day events, each asking whether the film is still with you.
 */
export function checkInCalendar(entry: Pick<AfterimageEntry, 'title' | 'year' | 'watchedOn'>, url: string, stamp = new Date()): string {
  const now = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const id = movieKey(entry.title, entry.year).replace(/[^a-z0-9]+/g, '-');
  const events = CHECKPOINTS.map(checkpoint => {
    const day = addDays(entry.watchedOn, checkpoint.days);
    return [
      'BEGIN:VEVENT',
      `UID:afterimage-${id}-${checkpoint.id}@afterimage`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${icsDate(day)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(day, 1))}`,
      `SUMMARY:${icsText(`Is ${entry.title} still with you?`)}`,
      `DESCRIPTION:${icsText(`${checkpoint.label}. Open AFTERIMAGE and answer in one tap: gone, still there, or stronger.`)}`,
      `URL:${icsText(url)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    ].join('\r\n');
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AFTERIMAGE//Half-life//EN', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR', ''].join('\r\n');
}
