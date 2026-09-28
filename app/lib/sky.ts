import type { FacetKey } from './light-table.ts';
import { movieKey } from './movie-metadata.ts';

/**
 * Your sky: every film you have met in AFTERIMAGE, arranged as a private star map.
 * Reels become five-star threads, Atlases become an anchor with six companions, and
 * films you loved, saved or watched glow on their own. Position records only which
 * reel or Atlas introduced a film and when; distance never claims similarity.
 */

export type SkyFilm = { title: string; year: string };
export type SkyPoint = { x: number; y: number };
/** `seed` draws the reel's figure; pass the reel's recommendation identity so every view draws the same shape. */
export type SkyReelSource = { id: string; name: string; caption: string; palette: string[]; films: SkyFilm[]; chartedAt: string; seed?: string };
export type SkyAtlasSource = { id: string; anchor: SkyFilm; neighbors: SkyFilm[]; caption: string; chartedAt: string };
export type SkyJournalMark = SkyFilm & { stayed: readonly FacetKey[] };
export type SkyInput = {
  reels: readonly SkyReelSource[];
  atlases: readonly SkyAtlasSource[];
  likes: readonly SkyFilm[];
  saved: readonly SkyFilm[];
  afterimages: readonly SkyJournalMark[];
};

export type SkyStar = SkyFilm & SkyPoint & {
  key: string;
  role: 'anchor' | 'member' | 'field';
  liked: boolean;
  saved: boolean;
  afterimage: FacetKey[] | null;
  constellations: string[];
  /** 0–1 apparent brightness: taste signals and repeated appearances make a film shine. */
  magnitude: number;
};

export type SkyConstellation = {
  id: string;
  kind: 'reel' | 'atlas';
  sourceId: string;
  name: string;
  caption: string;
  palette: string[];
  chartedAt: string;
  stars: string[];
  edges: Array<[string, string]>;
  center: SkyPoint;
  label: SkyPoint;
};

export type SkyMap = {
  stars: SkyStar[];
  constellations: SkyConstellation[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** The constellations alone, for a first view that is not dwarfed by the halo of field stars. */
  coreBounds: { minX: number; minY: number; maxX: number; maxY: number };
  counts: { stars: number; constellations: number; reels: number; atlases: number; liked: number; saved: number; afterimages: number; bridges: number };
};

export const SKY_REGISTRY_KEY = 'afterimage:sky:v1';
export const CONSTELLATION_SPACING = 236;
export const REEL_RADIUS = 104;
export const ATLAS_RADIUS = 112;
const VERTICAL_SQUASH = 0.8;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const FIELD_SPACING = 34;
const ROMAN = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];

/** FNV-1a: small, stable and good enough to seed decorative geometry. */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Mulberry32, so the same history always draws the same sky. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function normalize(points: SkyPoint[]): SkyPoint[] {
  const cx = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const cy = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const centered = points.map(point => ({ x: point.x - cx, y: point.y - cy }));
  const radius = Math.max(...centered.map(point => Math.hypot(point.x, point.y))) || 1;
  return centered.map(point => ({ x: point.x / radius, y: point.y / radius }));
}

function minimumSeparation(points: SkyPoint[]): number {
  let minimum = Infinity;
  for (let a = 0; a < points.length; a++) for (let b = a + 1; b < points.length; b++) {
    minimum = Math.min(minimum, Math.hypot(points[a].x - points[b].x, points[a].y - points[b].y));
  }
  return minimum;
}

/**
 * A reel's ranked films as one meandering thread. The figure is decorative and
 * seeded by the reel; it follows ranking order and nothing else.
 */
export function threadFigure(seed: string, count = 5): SkyPoint[] {
  if (count <= 1) return [{ x: 0, y: 0 }];
  let best: SkyPoint[] = [];
  let bestSeparation = -1;
  for (let attempt = 0; attempt < 12; attempt++) {
    const random = seededRandom(hashString(`${seed}#${attempt}`));
    let angle = random() * Math.PI * 2;
    let turn = random() < 0.5 ? -1 : 1;
    const points: SkyPoint[] = [{ x: 0, y: 0 }];
    for (let index = 1; index < count; index++) {
      if (random() < 0.4) turn = -turn;
      angle += turn * (0.3 + random() * 0.8);
      const step = 0.8 + random() * 0.6;
      const last = points[index - 1];
      points.push({ x: last.x + Math.cos(angle) * step, y: last.y + Math.sin(angle) * step });
    }
    const figure = normalize(points);
    const separation = minimumSeparation(figure);
    if (separation > bestSeparation) { best = figure; bestSeparation = separation; }
    if (separation >= 0.5) break;
  }
  return best;
}

/** An anchor with its companions evenly around it. Only anchor links are drawn. */
export function orbitFigure(seed: string, count = 6): SkyPoint[] {
  const random = seededRandom(hashString(seed));
  const start = random() * Math.PI * 2;
  return [{ x: 0, y: 0 }, ...Array.from({ length: count }, (_, index) => {
    const angle = start + index * (Math.PI * 2 / count) + (random() - 0.5) * 0.36;
    const radius = 0.8 + random() * 0.2;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  })];
}

/** Constellations are charted outward in time: your first reel sits at the heart of the sky. */
export function constellationCenter(order: number): SkyPoint {
  if (order <= 0) return { x: 0, y: 0 };
  const radius = CONSTELLATION_SPACING * Math.sqrt(order + 0.6);
  const angle = order * GOLDEN_ANGLE + 0.6;
  return { x: Math.round(radius * Math.cos(angle) * 10) / 10, y: Math.round(radius * Math.sin(angle) * VERTICAL_SQUASH * 10) / 10 };
}

/** Remembers when each Atlas first appeared, so the sky keeps its shape between visits. */
export function parseSkyRegistry(raw: string | null): Record<string, string> {
  try {
    const value: unknown = JSON.parse(raw ?? 'null');
    if (!value || typeof value !== 'object' || Array.isArray(value) || (value as Record<string, unknown>).version !== 1) return {};
    const seen = (value as Record<string, unknown>).seen;
    if (!seen || typeof seen !== 'object' || Array.isArray(seen)) return {};
    return Object.fromEntries(Object.entries(seen).filter(([id, date]) => /^[a-z0-9:-]{1,80}$/.test(id) && typeof date === 'string' && Number.isFinite(Date.parse(date))).slice(-200));
  } catch {
    return {};
  }
}

export function updateSkyRegistry(registry: Record<string, string>, ids: readonly string[], now: string): { registry: Record<string, string>; changed: boolean } {
  const next: Record<string, string> = {};
  let changed = Object.keys(registry).some(id => !ids.includes(id));
  for (const id of ids) {
    next[id] = registry[id] ?? now;
    if (!registry[id]) changed = true;
  }
  return { registry: next, changed };
}

export function serializeSkyRegistry(registry: Record<string, string>): string {
  return JSON.stringify({ version: 1, seen: registry });
}

type Grid = Map<string, SkyPoint[]>;
function gridKey(x: number, y: number) { return `${Math.floor(x / FIELD_SPACING)}:${Math.floor(y / FIELD_SPACING)}`; }
function gridAdd(grid: Grid, point: SkyPoint) {
  const key = gridKey(point.x, point.y);
  const cell = grid.get(key);
  if (cell) cell.push(point); else grid.set(key, [point]);
}
function gridClear(grid: Grid, point: SkyPoint, distance: number): boolean {
  const column = Math.floor(point.x / FIELD_SPACING);
  const row = Math.floor(point.y / FIELD_SPACING);
  for (let x = column - 1; x <= column + 1; x++) for (let y = row - 1; y <= row + 1; y++) {
    for (const other of grid.get(`${x}:${y}`) ?? []) if (Math.hypot(other.x - point.x, other.y - point.y) < distance) return false;
  }
  return true;
}

function round(value: number) { return Math.round(value * 10) / 10; }

export function buildSky(input: SkyInput): SkyMap {
  const liked = new Set(input.likes.map(film => movieKey(film.title, film.year)));
  const saved = new Set(input.saved.map(film => movieKey(film.title, film.year)));
  const journal = new Map(input.afterimages.map(entry => [movieKey(entry.title, entry.year), [...entry.stayed]]));
  const stars = new Map<string, SkyStar>();
  const grid: Grid = new Map();
  const nameCount = new Map<string, number>();

  const sources = [
    ...input.reels.map(reel => ({ kind: 'reel' as const, id: `reel:${reel.id}`, source: reel, chartedAt: reel.chartedAt })),
    ...input.atlases.map(atlas => ({ kind: 'atlas' as const, id: `atlas:${atlas.id}`, source: atlas, chartedAt: atlas.chartedAt })),
  ].sort((a, b) => a.chartedAt.localeCompare(b.chartedAt) || a.id.localeCompare(b.id));

  function place(film: SkyFilm, point: SkyPoint, role: SkyStar['role'], constellation: string | null): string {
    const key = movieKey(film.title, film.year);
    const existing = stars.get(key);
    if (existing) {
      if (constellation && !existing.constellations.includes(constellation)) existing.constellations.push(constellation);
      if (role === 'anchor') existing.role = 'anchor';
      return key;
    }
    const star: SkyStar = {
      key, title: film.title, year: film.year, x: round(point.x), y: round(point.y), role,
      liked: liked.has(key), saved: saved.has(key), afterimage: journal.get(key) ?? null,
      constellations: constellation ? [constellation] : [], magnitude: 0,
    };
    stars.set(key, star);
    gridAdd(grid, star);
    return key;
  }

  const placed = () => [...stars.values()];
  function nearest(point: SkyPoint, among: readonly SkyPoint[]) {
    let distance = Infinity;
    for (const other of among) distance = Math.min(distance, Math.hypot(other.x - point.x, other.y - point.y));
    return distance;
  }
  const namedSoFar: SkyPoint[] = [];
  function labelObstacles(near: SkyPoint, within: number): SkyPoint[] {
    return namedSoFar.filter(point => Math.hypot(point.x - near.x, point.y - near.y) < within + 100)
      .flatMap(point => [-80, -40, 0, 40, 80].flatMap(dx => [{ x: point.x + dx, y: point.y - 8 }, { x: point.x + dx, y: point.y + 8 }]));
  }
  // Fresh constellations take the next spiral slot that is clear of every star so far.
  let nextSlot = 0;
  function freeCenter(): SkyPoint {
    const existing = placed();
    for (;;) {
      const center = constellationCenter(nextSlot++);
      if (!existing.length || nearest(center, existing) >= 210) return center;
    }
  }

  const constellations: SkyConstellation[] = sources.map(item => {
    const constellation = chart(item);
    namedSoFar.push(constellation.label);
    return constellation;
  });

  function chart(item: (typeof sources)[number]): SkyConstellation {
    if (item.kind === 'reel') {
      const reel = item.source as SkyReelSource;
      const center = freeCenter();
      const figure = threadFigure(reel.seed ?? reel.id, reel.films.length);
      const keys = reel.films.map((film, index) => place(film, { x: center.x + figure[index].x * REEL_RADIUS, y: center.y + figure[index].y * REEL_RADIUS * 0.86 }, 'member', item.id));
      const edges = keys.slice(1).map((key, index) => [keys[index], key] as [string, string]).filter(([a, b]) => a !== b);
      const lowest = Math.max(...figure.map(point => point.y * REEL_RADIUS * 0.86));
      const base = reel.name.trim() || 'An untitled reel';
      const count = (nameCount.get(base) ?? 0) + 1;
      nameCount.set(base, count);
      return { id: item.id, kind: 'reel', sourceId: reel.id, name: `${base}${ROMAN[count - 1] ?? ` ${count}`}`, caption: reel.caption, palette: reel.palette.slice(0, 5), chartedAt: reel.chartedAt, stars: [...new Set(keys)], edges, center, label: { x: center.x, y: round(center.y + lowest + 40) } };
    }

    const atlas = item.source as SkyAtlasSource;
    const anchorKey = movieKey(atlas.anchor.title, atlas.anchor.year);
    const known = stars.get(anchorKey);
    const figure = orbitFigure(atlas.id, atlas.neighbors.length);
    let center: SkyPoint;
    let ring: SkyPoint[];
    let label: SkyPoint;
    if (!known) {
      center = freeCenter();
      ring = figure.slice(1).map(point => ({ x: center.x + point.x * ATLAS_RADIUS, y: center.y + point.y * ATLAS_RADIUS * 0.86 }));
      label = { x: center.x, y: round(center.y + Math.max(0, ...figure.map(point => point.y * ATLAS_RADIUS * 0.86)) + 40) };
    } else {
      // An Atlas grown from a film already in your sky blooms around that star. The ring
      // turns and widens until its companions sit clear of the stars already there.
      center = { x: known.x, y: known.y };
      const existing = placed().filter(star => star.key !== anchorKey);
      const neighborhood = existing.filter(star => Math.hypot(star.x - center.x, star.y - center.y) < 260);
      // Constellation names are obstacles too, sampled along their width.
      const lettering = labelObstacles(center, 320);
      let best: SkyPoint[] = [];
      let bestPenalty = Infinity;
      search: for (const radius of [ATLAS_RADIUS, 138, 166, 196, 230]) {
        for (let step = 0; step < 24; step++) {
          const turn = step * Math.PI / 12;
          const candidate = figure.slice(1).map(point => {
            const angle = Math.atan2(point.y, point.x) + turn;
            const length = Math.hypot(point.x, point.y) * radius;
            return { x: center.x + Math.cos(angle) * length, y: center.y + Math.sin(angle) * length * 0.86 };
          });
          const penalty = candidate.reduce((sum, point) => sum + Math.max(0, 50 - nearest(point, neighborhood)) ** 2 + Math.max(0, 44 - nearest(point, lettering)) ** 2, 0);
          if (penalty < bestPenalty) { best = candidate; bestPenalty = penalty; }
          if (penalty === 0) break search;
        }
      }
      ring = best;
      const away = neighborhood.length
        ? Math.atan2(center.y - neighborhood.reduce((sum, star) => sum + star.y, 0) / neighborhood.length, center.x - neighborhood.reduce((sum, star) => sum + star.x, 0) / neighborhood.length)
        : Math.PI / 2;
      const reach = Math.max(...ring.map(point => Math.hypot(point.x - center.x, point.y - center.y)));
      // The name goes where it collides least, preferring the side facing away from its neighbors.
      const obstacles = [...neighborhood, ...ring, ...lettering];
      let bestLabel: SkyPoint = center;
      let bestScore = Infinity;
      for (const offset of [0, .5, -.5, 1, -1, 1.6, -1.6, Math.PI]) {
        const angle = away + offset;
        const point = { x: round(center.x + Math.cos(angle) * (reach + 24)), y: round(center.y + Math.sin(angle) * (reach + 24) + 10) };
        const sample = [-70, -35, 0, 35, 70].map(dx => ({ x: point.x + dx, y: point.y - 6 }));
        const score = sample.reduce((sum, spot) => sum + Math.max(0, 40 - nearest(spot, obstacles)) ** 2, 0) + Math.abs(offset) * 40;
        if (score < bestScore) { bestScore = score; bestLabel = point; }
      }
      label = bestLabel;
    }
    const anchor = place(atlas.anchor, center, 'anchor', item.id);
    const keys = atlas.neighbors.map((film, index) => place(film, ring[index], 'member', item.id));
    return { id: item.id, kind: 'atlas', sourceId: atlas.id, name: `In the orbit of ${atlas.anchor.title}`, caption: atlas.caption, palette: [], chartedAt: atlas.chartedAt, stars: [...new Set([anchor, ...keys])], edges: keys.filter(key => key !== anchor).map(key => [anchor, key] as [string, string]), center, label };
  }

  // Loved, saved and remembered films outside any reel or Atlas form a halo of field stars.
  const fieldFilms = new Map<string, SkyFilm>();
  for (const film of [...input.likes, ...input.afterimages, ...input.saved]) {
    const key = movieKey(film.title, film.year);
    if (!stars.has(key) && !fieldFilms.has(key)) fieldFilms.set(key, { title: film.title, year: film.year });
  }
  const outermost = [...stars.values()].reduce((max, star) => Math.max(max, Math.hypot(star.x, star.y / VERTICAL_SQUASH)), 0);
  const inner = stars.size ? outermost + 120 : 60;
  const band = Math.max(170, Math.sqrt(fieldFilms.size) * 44);
  for (const [key, film] of [...fieldFilms.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const random = seededRandom(hashString(key));
    let point: SkyPoint = { x: 0, y: 0 };
    for (let attempt = 0; attempt < 24; attempt++) {
      const angle = random() * Math.PI * 2;
      const radius = Math.sqrt(inner * inner + random() * ((inner + band) ** 2 - inner * inner)) + attempt * 6;
      point = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * VERTICAL_SQUASH };
      if (gridClear(grid, point, FIELD_SPACING)) break;
    }
    place(film, point, 'field', null);
  }

  for (const star of stars.values()) {
    const base = star.role === 'field' ? 0.3 : star.role === 'anchor' ? 0.5 : 0.4;
    // A film saved for later has not been seen yet, so it waits a little dimmer.
    const unseen = star.saved && !star.liked && !star.afterimage ? -0.08 : 0;
    const bright = base + (star.liked ? 0.22 : 0) + (star.afterimage ? 0.3 : 0) + Math.max(0, star.constellations.length - 1) * 0.1 + unseen;
    star.magnitude = Math.min(1, Math.round(bright * 100) / 100);
  }

  const list = [...stars.values()];
  const xs = list.map(star => star.x);
  const ys = list.map(star => star.y);
  const labelYs = constellations.map(constellation => constellation.label.y);
  const padding = 150;
  const bounds = list.length
    ? { minX: round(Math.min(...xs) - padding), minY: round(Math.min(...ys) - padding), maxX: round(Math.max(...xs) + padding), maxY: round(Math.max(...ys, ...labelYs) + padding * 0.7) }
    : { minX: -400, minY: -260, maxX: 400, maxY: 260 };

  const core = list.filter(star => star.role !== 'field');
  const coreBounds = core.length ? {
    minX: round(Math.min(...core.map(star => star.x), ...constellations.map(item => item.label.x - 90)) - 60),
    minY: round(Math.min(...core.map(star => star.y), ...labelYs) - 70),
    maxX: round(Math.max(...core.map(star => star.x), ...constellations.map(item => item.label.x + 90)) + 60),
    maxY: round(Math.max(...core.map(star => star.y), ...labelYs) + 50),
  } : bounds;

  return {
    stars: list,
    constellations,
    bounds,
    coreBounds,
    counts: {
      stars: list.length,
      constellations: constellations.length,
      reels: constellations.filter(constellation => constellation.kind === 'reel').length,
      atlases: constellations.filter(constellation => constellation.kind === 'atlas').length,
      liked: list.filter(star => star.liked).length,
      saved: list.filter(star => star.saved).length,
      afterimages: list.filter(star => star.afterimage).length,
      bridges: list.filter(star => star.constellations.length > 1).length,
    },
  };
}

/** Screen-reader and list-view order: constellations as charted, then the field stars. */
export function skyReadingOrder(sky: SkyMap): Array<{ constellation: SkyConstellation | null; stars: SkyStar[] }> {
  const byKey = new Map(sky.stars.map(star => [star.key, star]));
  const groups = sky.constellations.map(constellation => ({ constellation, stars: constellation.stars.map(key => byKey.get(key)!).filter(Boolean) }));
  const field = sky.stars.filter(star => star.role === 'field').sort((a, b) => a.title.localeCompare(b.title));
  return field.length ? [...groups, { constellation: null, stars: field }] : groups;
}

/** The nearest star in a direction, for arrow-key travel across the map. */
export function nearestStarInDirection(stars: readonly SkyStar[], from: SkyStar, direction: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'): SkyStar | null {
  const vector = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[direction];
  let best: SkyStar | null = null;
  let bestScore = Infinity;
  for (const star of stars) {
    if (star.key === from.key) continue;
    const dx = star.x - from.x;
    const dy = star.y - from.y;
    const along = dx * vector[0] + dy * vector[1];
    if (along <= 0) continue;
    const across = Math.abs(dx * vector[1] - dy * vector[0]);
    const score = along + across * 2.2;
    if (score < bestScore) { bestScore = score; best = star; }
  }
  return best;
}
