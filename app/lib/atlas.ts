import { FACET_KEYS, type FacetKey, type FacetMap } from './light-table.ts';
import { parseFacetMap } from './light-table-parse.ts';
import { movieKey } from './movie-metadata.ts';
import type { DevelopInput, ExcludedFilm } from './reel-state.ts';

export const ATLAS_STORAGE_KEY = 'afterimage:atlas:v1';
export type AtlasFilm = ExcludedFilm & { summary: string; watchFor: string; facets: FacetMap };
export type AtlasNeighbor = AtlasFilm & {
  label: string; shared: string; difference: string; whyHere: string;
  lenses: Record<FacetKey, { affinity: 'close' | 'echo' | 'contrast'; evidence: string }>;
};
export type Atlas = { kind: 'atlas-v1'; thesis: string; anchor: AtlasFilm; neighbors: AtlasNeighbor[] };
export type AtlasInput = { anchor: ExcludedFilm; request: DevelopInput };

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && Boolean(value.trim()) && value.length <= max;
}
function film(raw: unknown): AtlasFilm | null {
  if (!record(raw) || !text(raw.title, 160) || !text(raw.year, 4) || !/^\d{4}$/.test(raw.year) || !text(raw.summary, 300) || !text(raw.watchFor, 260)) return null;
  const facets = parseFacetMap(raw.facets);
  return facets ? { title: raw.title, year: raw.year, summary: raw.summary, watchFor: raw.watchFor, facets } : null;
}
export function parseAtlas(raw: unknown): Atlas | null {
  if (!record(raw) || raw.kind !== 'atlas-v1' || !text(raw.thesis, 240) || !Array.isArray(raw.neighbors) || raw.neighbors.length !== 6) return null;
  const anchor = film(raw.anchor);
  if (!anchor) return null;
  const neighbors: AtlasNeighbor[] = [];
  const seen = new Set([movieKey(anchor.title, anchor.year)]);
  for (const item of raw.neighbors) {
    const identity = film(item);
    if (!identity || !record(item) || !text(item.label, 48) || !text(item.shared, 320) || !text(item.difference, 280) || !text(item.whyHere, 300) || !record(item.lenses)) return null;
    const key = movieKey(identity.title, identity.year);
    if (seen.has(key)) return null;
    seen.add(key);
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
  return JSON.stringify([movieKey(input.anchor.title, input.anchor.year), input.request]);
}

/** Only the accepted request travels into the Atlas; draft text cannot silently change its meaning. */
export function buildAtlasInput(anchor: ExcludedFilm, request: DevelopInput, excludedFilms: ExcludedFilm[], likedFilms: ExcludedFilm[]): AtlasInput {
  return { anchor: { title: anchor.title, year: anchor.year }, request: { ...request, excludedFilms, likedFilms } };
}
