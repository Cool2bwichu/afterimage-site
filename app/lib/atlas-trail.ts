import { parseAtlas, type Atlas } from './atlas.ts';
import { isGenerationJobId } from './generation-state.ts';
import { FACET_KEYS, type FacetKey, type FacetSource } from './light-table.ts';
import { movieKey } from './movie-metadata.ts';

export const ATLAS_TRAIL_STORAGE_KEY = 'afterimage:atlas:trail:v1';
export const MAX_ATLAS_MAPS = 12;
export const MAX_ATLAS_STEPS = 24;
export type AtlasView = { selected: number; lens: FacetKey | 'all' };
export type AtlasStop = { id: string; atlas: Atlas; inputKey: string; view: AtlasView };
export type PendingAtlas = { jobId: string; inputKey: string; anchor: FacetSource; followOnComplete: boolean };
export type AtlasTrail = { version: 1; maps: AtlasStop[]; route: string[]; cursor: number; pending: PendingAtlas | null; readyId: string | null };
const INITIAL_VIEW: AtlasView = { selected: -1, lens: 'all' };
export function emptyAtlasTrail(): AtlasTrail {
  return { version: 1, maps: [], route: [], cursor: -1, pending: null, readyId: null };
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const validId = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9-]{1,64}$/.test(v);
function inputKey(raw: unknown, anchor: FacetSource): raw is string {
  if (typeof raw !== 'string' || raw.length > 200_000) return false;
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) && value.length === 2 && value[0] === movieKey(anchor.title, anchor.year)
      && record(value[1]) && typeof value[1].creativeBrief === 'string' && Array.isArray(value[1].films)
      && value[1].films.every((film: unknown) => typeof film === 'string');
  } catch { return false; }
}
function view(raw: unknown): AtlasView {
  return {
    selected: record(raw) && Number.isInteger(raw.selected) && Number(raw.selected) >= -1 && Number(raw.selected) < 6 ? Number(raw.selected) : -1,
    lens: record(raw) && FACET_KEYS.includes(raw.lens as FacetKey) ? raw.lens as FacetKey : 'all',
  };
}
function pending(raw: unknown): PendingAtlas | null {
  if (!record(raw) || !isGenerationJobId(raw.jobId) || !record(raw.anchor)
    || typeof raw.anchor.title !== 'string' || !raw.anchor.title.trim() || raw.anchor.title.length > 160
    || typeof raw.anchor.year !== 'string' || !/^\d{4}$/.test(raw.anchor.year)) return null;
  const anchor = { title: raw.anchor.title, year: raw.anchor.year };
  return inputKey(raw.inputKey, anchor) ? { jobId: raw.jobId, inputKey: raw.inputKey, anchor, followOnComplete: raw.followOnComplete !== false } : null;
}
export function activeAtlasStop(trail: AtlasTrail): AtlasStop | null {
  return trail.maps.find(map => map.id === trail.route[trail.cursor]) ?? null;
}

/** Each map is validated separately, so one damaged cache entry cannot erase its neighbors. */
export function parseAtlasTrail(raw: unknown, legacy?: unknown): AtlasTrail {
  if (!record(raw) || raw.version !== 1 || !Array.isArray(raw.maps) || !Array.isArray(raw.route)) {
    const state = emptyAtlasTrail();
    if (!record(legacy)) return state;
    const atlas = parseAtlas(legacy.atlas);
    if (atlas && inputKey(legacy.inputKey, atlas.anchor)) {
      state.maps = [{ id: 'legacy', atlas, inputKey: legacy.inputKey, view: { ...INITIAL_VIEW } }];
      state.route = ['legacy']; state.cursor = 0;
    }
    state.pending = pending(legacy.pending);
    return state;
  }
  const maps: AtlasStop[] = [];
  for (const item of raw.maps.slice(-MAX_ATLAS_MAPS)) {
    if (!record(item) || !validId(item.id) || maps.some(map => map.id === item.id)) continue;
    const atlas = parseAtlas(item.atlas);
    if (!atlas || !inputKey(item.inputKey, atlas.anchor)) continue;
    maps.push({ id: item.id, atlas, inputKey: item.inputKey, view: view(item.view) });
  }
  const steps = raw.route.map((id, index) => ({ id, index })).filter(step => maps.some(map => map.id === step.id)).slice(-MAX_ATLAS_STEPS);
  const route = steps.map(step => step.id as string);
  const cursor = steps.findIndex(step => step.index === raw.cursor);
  if (!route.length && maps.length) route.push(maps[maps.length - 1].id);
  return { version: 1, maps, route, cursor: cursor >= 0 ? cursor : route.length - 1, pending: pending(raw.pending), readyId: maps.some(map => map.id === raw.readyId) ? raw.readyId as string : null };
}

export function updateAtlasView(trail: AtlasTrail, patch: Partial<AtlasView>): AtlasTrail {
  const current = activeAtlasStop(trail);
  if (!current) return trail;
  return { ...trail, maps: trail.maps.map(map => map.id === current.id ? { ...map, view: view({ ...map.view, ...patch }) } : map) };
}
export function moveAtlasTrail(trail: AtlasTrail, cursor: number): AtlasTrail {
  if (!Number.isInteger(cursor) || cursor < 0 || cursor >= trail.route.length || cursor === trail.cursor) return trail;
  const map = trail.maps.find(item => item.id === trail.route[cursor]);
  if (!map) return trail;
  return { ...trail, cursor, maps: [...trail.maps.filter(item => item.id !== map.id), map], pending: trail.pending ? { ...trail.pending, followOnComplete: false } : null, readyId: trail.readyId === map.id ? null : trail.readyId };
}
/** A new branch replaces the forward path, but the previous maps remain in Visited maps. */
export function visitAtlasMap(trail: AtlasTrail, id: string): AtlasTrail {
  const map = trail.maps.find(item => item.id === id);
  if (!map || activeAtlasStop(trail)?.id === id) return trail;
  const route = [...trail.route.slice(0, trail.cursor + 1), id].slice(-MAX_ATLAS_STEPS);
  return { ...trail, route, cursor: route.length - 1, maps: [...trail.maps.filter(item => item.id !== id), map], pending: trail.pending ? { ...trail.pending, followOnComplete: false } : null, readyId: trail.readyId === id ? null : trail.readyId };
}
export function finishAtlasMap(trail: AtlasTrail, jobId: string, atlas: Atlas): AtlasTrail {
  const job = trail.pending;
  if (!job || job.jobId !== jobId || movieKey(atlas.anchor.title, atlas.anchor.year) !== movieKey(job.anchor.title, job.anchor.year)) return trail;
  const active = activeAtlasStop(trail);
  const maps = [...trail.maps, { id: jobId, atlas, inputKey: job.inputKey, view: { ...INITIAL_VIEW } }];
  while (maps.length > MAX_ATLAS_MAPS) maps.splice(maps.findIndex(map => map.id !== active?.id), 1);
  const steps = trail.route.map((id, index) => ({ id, index })).filter(step => maps.some(map => map.id === step.id));
  const state: AtlasTrail = { ...trail, maps, route: steps.map(step => step.id), cursor: steps.findIndex(step => step.index === trail.cursor), pending: null, readyId: jobId };
  return job.followOnComplete || !active ? visitAtlasMap(state, jobId) : state;
}
