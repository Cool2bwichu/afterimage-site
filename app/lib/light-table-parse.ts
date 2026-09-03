import {
  FACET_KEYS,
  type CinematicFacet,
  type FacetKey,
  type FacetMap,
  type SelectedFacet,
  type SelectedFacets,
} from './light-table.ts';

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown, max: number) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned && cleaned.length <= max ? cleaned : null;
}

function traits(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 6) return null;
  const cleaned = value.map((item) => text(item, 60));
  if (cleaned.some((item) => item === null)) return null;
  const values = (cleaned as string[]).map(item => item.replace(/\s+/g, ' ').toLocaleLowerCase('en-US'));
  return new Set(values).size === values.length
    ? values
    : null;
}

export function parseCinematicFacet(value: unknown): CinematicFacet | null {
  if (!isObject(value)) return null;
  const label = text(value.label, 80);
  const explanation = text(value.explanation, 300);
  const normalizedTraits = traits(value.traits);
  return label && explanation && normalizedTraits
    ? { label, explanation, traits: normalizedTraits }
    : null;
}

export function parseFacetMap(value: unknown): FacetMap | null {
  if (!isObject(value)) return null;
  if (Object.keys(value).length !== 4 || Object.keys(value).some(key => !FACET_KEYS.includes(key as FacetKey))) return null;
  const parsed = {} as FacetMap;
  for (const key of FACET_KEYS) {
    const facet = parseCinematicFacet(value[key]);
    if (!facet) return null;
    parsed[key] = facet;
  }
  return parsed;
}

export function parseSelectedFacets(value: unknown): SelectedFacets {
  if (!isObject(value)) return {};
  const selected: SelectedFacets = {};
  for (const key of FACET_KEYS) {
    const raw = value[key];
    if (raw === undefined) continue;
    if (!isObject(raw) || !isObject(raw.source)) continue;
    const facet = parseCinematicFacet(raw);
    const title = text(raw.source.title, 160);
    const year = text(raw.source.year, 4);
    if (!facet || !title || !year || !/^\d{4}$/.test(year)) continue;
    selected[key] = { ...facet, source: { title, year } } as SelectedFacet;
  }
  return selected;
}

export function hasCompleteLightTableExtension(value: unknown) {
  if (!isObject(value) || !parseFacetMap(value.fingerprint) || !Array.isArray(value.recommendations)) {
    return false;
  }
  return value.recommendations.length === 5 && value.recommendations.every((item) =>
    isObject(item) && Boolean(parseFacetMap(item.facets)));
}

export function activeFacetKeys(selected: SelectedFacets): FacetKey[] {
  return FACET_KEYS.filter((key) => Boolean(selected[key]));
}
