import { parseFilmEnrichment, type FilmEnrichment } from './movie-metadata.ts';

export const ATLAS_ARTWORK_KEY = 'afterimage:atlas:artwork:v1';
const VERSION = 1;
const MAX_RECORDS = 84; // Twelve saved Atlases, seven films each.
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Cache only metadata accepted by the provider URL and film-identity parser. */
export function readAtlasArtwork(raw: string | null, now = Date.now()): Record<string, FilmEnrichment> {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!record(value) || value.version !== VERSION || !Number.isSafeInteger(value.savedAt)
      || Number(value.savedAt) > now || now - Number(value.savedAt) > TTL_MS
      || !Array.isArray(value.records) || value.records.length > MAX_RECORDS) return {};
    const entries: Array<[string, FilmEnrichment]> = [];
    const seen = new Set<string>();
    for (const item of value.records) {
      const parsed = parseFilmEnrichment(item);
      if (!parsed || parsed.status !== 'matched' || seen.has(parsed.key)) return {};
      seen.add(parsed.key);
      entries.push([parsed.key, parsed]);
    }
    return Object.fromEntries(entries);
  } catch { return {}; }
}

/** The timestamp expires the entire snapshot; the newest 84 valid records are kept. */
export function serializeAtlasArtwork(records: Record<string, FilmEnrichment>, now = Date.now()): string {
  const matched = Object.entries(records).flatMap(([key, value]) => {
    const parsed = parseFilmEnrichment(value);
    return parsed?.status === 'matched' && parsed.key === key ? [parsed] : [];
  }).slice(-MAX_RECORDS);
  return JSON.stringify({ version: VERSION, savedAt: now, records: matched });
}
