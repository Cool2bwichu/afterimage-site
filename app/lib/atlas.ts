import { FACET_KEYS, type FacetKey, type FacetMap } from './light-table.ts';
import { parseFacetMap } from './light-table-parse.ts';
import { movieKey } from './movie-metadata.ts';
import type { DevelopInput, ExcludedFilm } from './reel-state.ts';

export const ATLAS_STORAGE_KEY = 'afterimage:atlas:v1';
export type AtlasIdentity = ExcludedFilm & { tmdbId?: number };
export type AtlasFilm = AtlasIdentity & { summary: string; watchFor: string; facets: FacetMap };
export type AtlasNeighbor = AtlasFilm & {
  label: string; shared: string; difference: string; whyHere: string;
  lenses: Record<FacetKey, { affinity: 'close' | 'echo' | 'contrast'; evidence: string }>;
};
export type Atlas = { kind: 'atlas-v1'; thesis: string; anchor: AtlasFilm; neighbors: AtlasNeighbor[] };
export type AtlasInput = { anchor: AtlasIdentity; request: DevelopInput };

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && Boolean(value.trim()) && value.length <= max;
}
function catalogId(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}
function film(raw: unknown): AtlasFilm | null {
  if (!record(raw) || !text(raw.title, 160) || !text(raw.year, 4) || !/^\d{4}$/.test(raw.year) || !text(raw.summary, 300) || !text(raw.watchFor, 260)) return null;
  if (raw.tmdbId !== undefined && !catalogId(raw.tmdbId)) return null;
  const facets = parseFacetMap(raw.facets);
  return facets ? { title: raw.title, year: raw.year, ...(catalogId(raw.tmdbId) ? { tmdbId: raw.tmdbId } : {}), summary: raw.summary, watchFor: raw.watchFor, facets } : null;
}
export function parseAtlas(raw: unknown): Atlas | null {
  if (!record(raw) || raw.kind !== 'atlas-v1' || !text(raw.thesis, 240) || !Array.isArray(raw.neighbors) || raw.neighbors.length !== 6) return null;
  const anchor = film(raw.anchor);
  if (!anchor) return null;
  const neighbors: AtlasNeighbor[] = [];
  const seen = new Set([movieKey(anchor.title, anchor.year)]);
  const seenIds = new Set(anchor.tmdbId ? [anchor.tmdbId] : []);
  for (const item of raw.neighbors) {
    const identity = film(item);
    if (!identity || !record(item) || !text(item.label, 48) || !text(item.shared, 320) || !text(item.difference, 280) || !text(item.whyHere, 300) || !record(item.lenses)) return null;
    const key = movieKey(identity.title, identity.year);
    if (seen.has(key) || (identity.tmdbId && seenIds.has(identity.tmdbId))) return null;
    seen.add(key);
    if (identity.tmdbId) seenIds.add(identity.tmdbId);
    const lenses = {} as AtlasNeighbor['lenses'];
    for (const channel of FACET_KEYS) {
      const lens = item.lenses[channel];
      if (!record(lens) || !['close', 'echo', 'contrast'].includes(String(lens.affinity)) || !text(lens.evidence, 200)) return null;
      lenses[channel] = { affinity: lens.affinity as 'close' | 'echo' | 'contrast', evidence: lens.evidence };
    }
    neighbors.push({ ...identity, label: item.label, shared: item.shared, difference: item.difference, whyHere: item.whyHere, lenses });
  }
  return { kind: 'atlas-v1', thesis: raw.thesis, anchor, neighbors };
}

export function atlasInputKey(input: AtlasInput): string {
  const key = movieKey(input.anchor.title, input.anchor.year);
  return input.anchor.tmdbId
    ? JSON.stringify([key, input.anchor.tmdbId, input.request])
    : JSON.stringify([key, input.request]);
}

/** Read the accepted request from either stored key shape, verifying its film identity. */
export function parseAtlasInputRequest(inputKey: string, anchor: AtlasIdentity): DevelopInput | null {
  if (inputKey.length > 200_000) return null;
  try {
    const value: unknown = JSON.parse(inputKey);
    if (!Array.isArray(value) || ![2, 3].includes(value.length) || value[0] !== movieKey(anchor.title, anchor.year)) return null;
    if (value.length === 3 && (!catalogId(value[1]) || (anchor.tmdbId && value[1] !== anchor.tmdbId))) return null;
    const request: unknown = value[value.length - 1];
    if (!record(request) || typeof request.creativeBrief !== 'string' || !Array.isArray(request.films)
      || !request.films.every((film: unknown) => typeof film === 'string')) return null;
    return request as DevelopInput;
  } catch { return null; }
}

/** Only the accepted request travels into the Atlas; draft text cannot silently change its meaning. */
export function buildAtlasInput(anchor: AtlasIdentity, request: DevelopInput, excludedFilms: ExcludedFilm[], likedFilms: ExcludedFilm[]): AtlasInput {
  return { anchor: { title: anchor.title, year: anchor.year, ...(catalogId(anchor.tmdbId) ? { tmdbId: anchor.tmdbId } : {}) }, request: { ...request, excludedFilms, likedFilms } };
}
