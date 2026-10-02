import { FACET_KEYS, type FacetKey } from './light-table.ts';
import { movieKey } from './movie-metadata.ts';

/**
 * An afterimage is what a film leaves behind once it has been watched: the date,
 * which of its four qualities stayed, and one private line. Entries stay in this
 * browser and never enter a recommendation request on their own.
 */
export const AFTERIMAGE_JOURNAL_KEY = 'afterimage:afterimages:v1';
export const MAX_AFTERIMAGES = 500;
export const MAX_AFTERIMAGE_NOTE = 280;

export type AfterimageEntry = {
  title: string;
  year: string;
  tmdbId?: number;
  watchedOn: string;
  stayed: FacetKey[];
  labels?: Partial<Record<FacetKey, string>>;
  note: string;
  loggedAt: string;
};

export type AfterimageDraft = Omit<AfterimageEntry, 'loggedAt' | 'stayed' | 'note'> & {
  stayed: readonly FacetKey[];
  note: string;
};

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** A local calendar date, so "tonight" is the viewer's tonight rather than UTC's. */
export function localDate(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function isWatchDate(value: unknown, today = localDate()): value is string {
  if (typeof value !== 'string') return false;
  const match = DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return false;
  // Film history starts well after 1880; a day of grace covers time zones ahead of the viewer.
  const tomorrow = new Date(`${today}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return year >= 1880 && date <= tomorrow;
}

function stayedChannels(value: unknown): FacetKey[] | null {
  if (!Array.isArray(value) || value.length > FACET_KEYS.length) return null;
  const chosen = new Set<FacetKey>();
  for (const item of value) {
    if (!FACET_KEYS.includes(item as FacetKey) || chosen.has(item as FacetKey)) return null;
    chosen.add(item as FacetKey);
  }
  return FACET_KEYS.filter(channel => chosen.has(channel));
}

function channelLabels(value: unknown): Partial<Record<FacetKey, string>> | undefined | null {
  if (value === undefined) return undefined;
  if (!record(value)) return null;
  const labels: Partial<Record<FacetKey, string>> = {};
  for (const [key, label] of Object.entries(value)) {
    if (!FACET_KEYS.includes(key as FacetKey) || typeof label !== 'string' || !label.trim() || label.length > 80) return null;
    labels[key as FacetKey] = label.trim();
  }
  return Object.keys(labels).length ? labels : undefined;
}

function parseEntry(value: unknown, today: string): AfterimageEntry | null {
  if (!record(value) || typeof value.title !== 'string' || typeof value.year !== 'string') return null;
  const title = value.title.trim();
  const year = value.year.trim();
  if (!title || title.length > 160 || !/^\d{4}$/.test(year)) return null;
  if (value.tmdbId !== undefined && !(Number.isSafeInteger(value.tmdbId) && Number(value.tmdbId) > 0)) return null;
  if (!isWatchDate(value.watchedOn, today)) return null;
  const stayed = stayedChannels(value.stayed);
  const labels = channelLabels(value.labels);
  if (!stayed || labels === null) return null;
  if (typeof value.note !== 'string' || value.note.trim().length > MAX_AFTERIMAGE_NOTE) return null;
  if (typeof value.loggedAt !== 'string' || !Number.isFinite(Date.parse(value.loggedAt))) return null;
  return {
    title, year,
    ...(value.tmdbId !== undefined ? { tmdbId: Number(value.tmdbId) } : {}),
    watchedOn: value.watchedOn,
    stayed,
    ...(labels ? { labels } : {}),
    note: value.note.trim(),
    loggedAt: value.loggedAt,
  };
}

/** Each entry is validated alone, so one damaged record cannot erase the rest of the journal. */
export function parseAfterimages(raw: string | null, today = localDate()): AfterimageEntry[] {
  try {
    const value: unknown = JSON.parse(raw ?? 'null');
    if (!record(value) || value.version !== 1 || !Array.isArray(value.entries)) return [];
    const entries: AfterimageEntry[] = [];
    const seen = new Set<string>();
    for (const item of value.entries.slice(-MAX_AFTERIMAGES)) {
      const entry = parseEntry(item, today);
      if (!entry) continue;
      const key = movieKey(entry.title, entry.year);
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(entry);
    }
    return entries;
  } catch {
    return [];
  }
}

export function serializeAfterimages(entries: readonly AfterimageEntry[]): string {
  return JSON.stringify({ version: 1, entries });
}

export function findAfterimage(entries: readonly AfterimageEntry[], film: { title: string; year: string }): AfterimageEntry | undefined {
  const key = movieKey(film.title, film.year);
  return entries.find(entry => movieKey(entry.title, entry.year) === key);
}

/** Record or revise one film's afterimage, keeping its place in the journal when revised. */
export function upsertAfterimage(entries: readonly AfterimageEntry[], draft: AfterimageDraft, loggedAt = new Date().toISOString()): AfterimageEntry[] {
  const entry = parseEntry({ ...draft, stayed: [...draft.stayed], loggedAt }, localDate(new Date(loggedAt)));
  if (!entry) throw new Error('This afterimage needs a film, a watch date that has already happened, and a note of 280 characters or fewer.');
  const key = movieKey(entry.title, entry.year);
  const index = entries.findIndex(item => movieKey(item.title, item.year) === key);
  if (index >= 0) return entries.map((item, position) => position === index ? entry : item);
  if (entries.length >= MAX_AFTERIMAGES) throw new Error('Your journal holds 500 afterimages. Remove one to make room.');
  return [...entries, entry];
}

export function removeAfterimage(entries: readonly AfterimageEntry[], film: { title: string; year: string }): AfterimageEntry[] {
  const key = movieKey(film.title, film.year);
  return entries.filter(entry => movieKey(entry.title, entry.year) !== key);
}

/** Newest viewing first; entries logged for the same night keep their writing order. */
export function journalOrder(entries: readonly AfterimageEntry[]): AfterimageEntry[] {
  return [...entries].sort((a, b) => b.watchedOn.localeCompare(a.watchedOn) || b.loggedAt.localeCompare(a.loggedAt));
}
