'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { buildSky, hashString, nearestStarInDirection, parseSkyRegistry, serializeSkyRegistry, skyReadingOrder, updateSkyRegistry, SKY_REGISTRY_KEY, type SkyConstellation, type SkyMap, type SkyStar } from '../lib/sky';
import { reelCaption, type SavedReel } from '../lib/reel-history';
import { apiFetch } from '../lib/api';
import { getRecommendationIdentity } from '../lib/reel-state';
import type { AtlasStop } from '../lib/atlas-trail';
import type { AfterimageEntry } from '../lib/afterimages';
import type { SavedFilm } from '../lib/library';
import type { LikedFilm } from '../lib/taste-profile';
import { FACET_META, type FacetKey } from '../lib/light-table';
import { parseEnrichmentResponse, type FilmEnrichment } from '../lib/movie-metadata';
import { ATLAS_ARTWORK_KEY, readAtlasArtwork } from '../lib/atlas-artwork';
import { MotionToggle, OrbitMark, StarGlyph, useCelestialMotion } from './celestial';
import { NightSky } from './night-sky';
import { LikeButton } from './like-button';
import { CHANNEL_COLORS } from './afterimage-log';

type Filter = 'all' | 'liked' | 'saved' | 'afterimages';
type View = { x: number; y: number; k: number };
type Selection = { kind: 'star'; key: string } | { kind: 'constellation'; id: string } | null;
type Glide = { from: View; to: View; start: number; duration: number };

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All stars' }, { id: 'liked', label: 'Loved' }, { id: 'saved', label: 'To watch' }, { id: 'afterimages', label: 'Afterimages' },
];
const STARLIGHT = '#dec6a0';
const STEEL = '#a7b6c5';
const WIDE = '(min-width: 900px)';

function matches(star: SkyStar, filter: Filter) {
  return filter === 'all' || (filter === 'liked' && star.liked) || (filter === 'saved' && star.saved) || (filter === 'afterimages' && Boolean(star.afterimage));
}

function mix(hex: string, amount: number) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return STARLIGHT;
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.round(((value >> shift) & 255) + (255 - ((value >> shift) & 255)) * amount);
  return `#${[16, 8, 0].map(shift => channel(shift).toString(16).padStart(2, '0')).join('')}`;
}

function spriteFor(cache: Map<string, HTMLCanvasElement>, color: string) {
  const cached = cache.get(color);
  if (cached) return cached;
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 64;
  const context = sprite.getContext('2d')!;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, color);
  gradient.addColorStop(.2, `${color}99`);
  gradient.addColorStop(.5, `${color}1c`);
  gradient.addColorStop(1, `${color}00`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  cache.set(color, sprite);
  return sprite;
}

function ease(t: number) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function shortDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

export function YourSky({ open, opener, onClose, reels, atlases, likes, watchlist, afterimages, metadataByKey, likedKeys, savedKeys, canExplore,
  onLike, onSave, onLogAfterimage, onNavigate, onExplore, onBegin, onCollide }: {
  open: boolean; opener: HTMLElement | null; onClose: () => void;
  reels: SavedReel[]; atlases: AtlasStop[]; likes: LikedFilm[]; watchlist: SavedFilm[]; afterimages: AfterimageEntry[];
  metadataByKey: Record<string, FilmEnrichment>; likedKeys: Set<string>; savedKeys: Set<string>; canExplore: boolean;
  onLike: (film: LikedFilm) => void; onSave: (film: SavedFilm) => void;
  onLogAfterimage: (film: { title: string; year: string; tmdbId?: number }, opener: HTMLElement) => void;
  onNavigate: (hash: string, opener: HTMLElement) => void; onExplore: (film: { title: string; year: string; tmdbId?: number }, opener: HTMLElement) => void;
  onBegin: () => void;
  /** Collide this star with another film to find the one between them. */
  onCollide?: (film: { title: string; year: string; tmdbId?: number }, opener: HTMLElement) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { running } = useCelestialMotion();
  const [registry, setRegistry] = useState<Record<string, string> | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [mode, setMode] = useState<'map' | 'list'>('map');
  const [selection, setSelection] = useState<Selection>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [artwork, setArtwork] = useState<Record<string, FilmEnrichment>>({});
  const [failedArt, setFailedArt] = useState<string[]>([]);
  const [announcement, setAnnouncement] = useState('');

  // Mutable drawing state lives in refs so a pan never re-renders the panel.
  const view = useRef<View>({ x: 0, y: 0, k: 1 });
  const glide = useRef<Glide | null>(null);
  const openedAt = useRef(0);
  const frame = useRef(0);
  const draw = useRef<(time: number) => void>(() => {});
  const request = useRef<() => void>(() => {});
  const size = useRef({ width: 0, height: 0, scale: 1 });
  const drag = useRef<{ id: number; x: number; y: number; view: View; moved: boolean } | null>(null);
  const pinch = useRef<{ distance: number; k: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const sprites = useRef(new Map<string, HTMLCanvasElement>());

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (element && !element.open) element.showModal();
    headingRef.current?.focus({ preventScroll: true });
    const timer = window.setTimeout(() => {
      // Remember when each Atlas first appeared so the sky keeps its shape between visits.
      let known: Record<string, string> = {};
      try { known = parseSkyRegistry(localStorage.getItem(SKY_REGISTRY_KEY)); } catch { /* A new registry is fine. */ }
      const { registry: next, changed } = updateSkyRegistry(known, atlases.map(map => `atlas:${map.id}`), new Date().toISOString());
      if (changed) { try { localStorage.setItem(SKY_REGISTRY_KEY, serializeSkyRegistry(next)); } catch { /* The sky still draws for this visit. */ } }
      setRegistry(next);
      let cached: Record<string, FilmEnrichment> = {};
      try { cached = readAtlasArtwork(localStorage.getItem(ATLAS_ARTWORK_KEY)); } catch { /* Artwork is optional. */ }
      setArtwork(current => ({ ...cached, ...current }));
      openedAt.current = performance.now();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = overflow;
      if (element?.open) element.close();
      if (opener?.isConnected) opener.focus();
    };
    // The registry is refreshed each time the sky opens; Atlases cannot change while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, opener]);

  const sky: SkyMap | null = useMemo(() => registry ? buildSky({
    reels: reels.flatMap(reel => reel.state.result ? [{ id: reel.id, name: reel.state.result.persona, caption: reelCaption(reel), palette: reel.state.result.palette, films: reel.state.result.recommendations.map(({ title, year }) => ({ title, year })), chartedAt: reel.savedAt, seed: getRecommendationIdentity(reel.state.result) }] : []),
    atlases: atlases.map(map => ({ id: map.id, anchor: map.atlas.anchor, neighbors: map.atlas.neighbors, caption: map.atlas.thesis, chartedAt: registry[`atlas:${map.id}`] ?? '9999' })),
    likes, saved: watchlist, afterimages,
  }) : null, [registry, reels, atlases, likes, watchlist, afterimages]);

  const starsByKey = useMemo(() => new Map(sky?.stars.map(star => [star.key, star]) ?? []), [sky]);
  const constellationsById = useMemo(() => new Map(sky?.constellations.map(item => [item.id, item]) ?? []), [sky]);
  const reelIds = useMemo(() => new Map(reels.map(reel => [`reel:${reel.id}`, reel])), [reels]);
  const knownArt = useMemo(() => {
    const merged: Record<string, FilmEnrichment> = { ...artwork };
    for (const reel of reels) Object.assign(merged, reel.state.metadataByKey);
    return { ...merged, ...metadataByKey };
  }, [artwork, reels, metadataByKey]);

  const selectedStar = selection?.kind === 'star' ? starsByKey.get(selection.key) ?? null : null;
  const selectedConstellation = selection?.kind === 'constellation' ? constellationsById.get(selection.id) ?? null : null;
  const litConstellations = useMemo(() => new Set(selectedStar ? selectedStar.constellations : selectedConstellation ? [selectedConstellation.id] : []), [selectedStar, selectedConstellation]);

  // Everything the painter reads that can change without rebuilding the sky.
  const live = useRef({ running, filter, selectedKey: '' as string | undefined, hovered: null as string | null, lit: new Set<string>() });
  useEffect(() => {
    live.current = { running, filter, selectedKey: selectedStar?.key, hovered, lit: litConstellations };
    request.current();
  }, [running, filter, selectedStar, hovered, litConstellations]);

  const starColor = useCallback((star: SkyStar) => {
    if (star.afterimage) return '#fff1d6';
    if (star.role === 'field') return star.liked ? '#f1d9ae' : star.saved ? STEEL : STARLIGHT;
    const first = constellationsById.get(star.constellations[0]);
    if (first?.kind === 'reel') return mix(first.palette[first.stars.indexOf(star.key)] ?? STARLIGHT, .5);
    return star.role === 'anchor' ? '#f1d9ae' : '#c3d0dc';
  }, [constellationsById]);

  const fitView = useCallback((map: SkyMap, whole = false): View => {
    const { width, height } = size.current;
    const wide = window.matchMedia(WIDE).matches;
    const bounds = whole ? map.bounds : map.coreBounds;
    const usable = { width: Math.max(200, width - (wide ? 460 : 40)), height: Math.max(200, height - (wide ? 150 : 330)) };
    const spanX = bounds.maxX - bounds.minX;
    const spanY = bounds.maxY - bounds.minY;
    const k = Math.min(1.6, Math.max(.16, Math.min(usable.width / spanX, usable.height / spanY)));
    const cx = (bounds.minX + bounds.maxX) / 2 + (wide ? 215 / k : 0);
    const cy = (bounds.minY + bounds.maxY) / 2 + (wide ? -10 / k : 110 / k);
    return { x: cx, y: cy, k };
  }, []);

  const flyTo = useCallback((target: View) => {
    if (!running) { view.current = target; glide.current = null; request.current(); return; }
    glide.current = { from: { ...view.current }, to: target, start: performance.now(), duration: 820 };
    request.current();
  }, [running]);

  const focusOn = useCallback((point: { x: number; y: number }, minimumZoom = 1) => {
    const wide = window.matchMedia(WIDE).matches;
    const k = Math.max(view.current.k, minimumZoom);
    flyTo({ x: point.x + (wide ? 210 / k : 0), y: point.y + (wide ? 0 : size.current.height * .18 / k), k });
  }, [flyTo]);

  // Draw loop: the map is painted on canvas; only panels live in the DOM.
  useEffect(() => {
    if (!open || !sky) return;
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const display = getComputedStyle(document.body).getPropertyValue('--font-display').trim() || 'Georgia, serif';
    const sans = getComputedStyle(document.body).getPropertyValue('--font-sans').trim() || 'system-ui, sans-serif';
    const phases = new Map(sky.stars.map(star => { const hash = hashString(star.key); return [star.key, { phase: (hash % 1000) / 1000 * Math.PI * 2, speed: .25 + (hash % 97) / 97 * .9 }]; }));
    const order = new Map(sky.constellations.map((item, index) => [item.id, index]));

    function resize() {
      const rect = stage!.getBoundingClientRect();
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      const first = !size.current.width;
      size.current = { width: rect.width, height: rect.height, scale };
      canvas!.width = Math.round(rect.width * scale);
      canvas!.height = Math.round(rect.height * scale);
      if (first) {
        const fitted = fitView(sky!);
        const moving = live.current.running;
        view.current = moving ? { ...fitted, k: fitted.k * .78 } : fitted;
        if (moving) glide.current = { from: { ...view.current }, to: fitted, start: performance.now(), duration: 1800 };
      }
      request.current();
    }

    const toScreen = (x: number, y: number) => {
      const { width, height } = size.current;
      return { x: (x - view.current.x) * view.current.k + width / 2, y: (y - view.current.y) * view.current.k + height / 2 };
    };

    draw.current = (time: number) => {
      frame.current = 0;
      const { running, filter, selectedKey, hovered, lit: litConstellations } = live.current;
      const selectedStar = selectedKey ? starsByKey.get(selectedKey) : undefined;
      const { width, height, scale } = size.current;
      if (!width) return;
      let animating = false;
      if (glide.current) {
        const progress = Math.min(1, (time - glide.current.start) / glide.current.duration);
        const eased = ease(progress);
        const { from, to } = glide.current;
        view.current = { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased, k: from.k * Math.pow(to.k / from.k, eased) };
        if (progress >= 1) glide.current = null; else animating = true;
      }
      const reveal = running ? (time - openedAt.current) : Infinity;
      const k = view.current.k;
      const zoomScale = Math.min(1.8, Math.max(.6, Math.sqrt(k)));
      context!.setTransform(scale, 0, 0, scale, 0, 0);
      context!.clearRect(0, 0, width, height);

      // Threads and orbits.
      for (const constellation of sky!.constellations) {
        const index = order.get(constellation.id) ?? 0;
        const progress = Math.max(0, Math.min(1, (reveal - index * 140 - 200) / 900));
        if (progress < 1) animating = true;
        if (progress <= 0) continue;
        const lit = litConstellations.has(constellation.id);
        const filtered = filter !== 'all' && !constellation.stars.some(key => { const star = starsByKey.get(key); return star && matches(star, filter); });
        context!.globalAlpha = filtered ? .07 : lit ? .85 : .34;
        context!.strokeStyle = constellation.kind === 'reel' ? STARLIGHT : STEEL;
        context!.lineWidth = (lit ? 1.5 : 1) * zoomScale;
        context!.setLineDash(constellation.kind === 'atlas' ? [2 * zoomScale, 5 * zoomScale] : []);
        constellation.edges.forEach(([fromKey, toKey], edge) => {
          const local = Math.max(0, Math.min(1, progress * constellation.edges.length - edge));
          if (!local) return;
          const from = starsByKey.get(fromKey)!;
          const to = starsByKey.get(toKey)!;
          const a = toScreen(from.x, from.y);
          const b = toScreen(to.x, to.y);
          context!.beginPath();
          context!.moveTo(a.x, a.y);
          context!.lineTo(a.x + (b.x - a.x) * local, a.y + (b.y - a.y) * local);
          context!.stroke();
        });
      }
      context!.setLineDash([]);

      // Stars.
      const fieldReveal = Math.max(0, Math.min(1, (reveal - sky!.constellations.length * 140 - 500) / 900));
      if (fieldReveal < 1) animating = true;
      for (const star of sky!.stars) {
        const point = toScreen(star.x, star.y);
        if (point.x < -40 || point.y < -40 || point.x > width + 40 || point.y > height + 40) continue;
        let appear = fieldReveal;
        if (star.role !== 'field') {
          const firstIndex = Math.min(...star.constellations.map(id => order.get(id) ?? 0));
          const constellation = constellationsById.get(star.constellations[0]);
          const position = constellation ? constellation.stars.indexOf(star.key) / Math.max(1, constellation.stars.length) : 0;
          appear = Math.max(0, Math.min(1, (reveal - firstIndex * 140 - 200 - position * 700) / 350));
        }
        if (appear <= 0) continue;
        const { phase, speed } = phases.get(star.key)!;
        const twinkle = running ? .78 + .22 * Math.sin(time / 1000 * speed * Math.PI * 2 + phase) : .9;
        const dim = filter !== 'all' && !matches(star, filter) ? .14 : 1;
        const focus = selectedStar?.key === star.key || hovered === star.key;
        const radius = (1.05 + star.magnitude * 3.3) * zoomScale * (focus ? 1.25 : 1);
        const color = starColor(star);
        const alpha = appear * dim;
        const unseen = star.saved && !star.liked && !star.afterimage;
        context!.globalAlpha = alpha * twinkle * (unseen ? .45 : .9);
        const glow = radius * (unseen ? 4 : 6.5);
        context!.drawImage(spriteFor(sprites.current, color), point.x - glow, point.y - glow, glow * 2, glow * 2);
        if (unseen) {
          context!.globalAlpha = alpha * .9;
          context!.strokeStyle = STEEL;
          context!.lineWidth = 1;
          context!.beginPath(); context!.arc(point.x, point.y, radius + 1.2, 0, Math.PI * 2); context!.stroke();
          context!.globalAlpha = alpha * .5;
          context!.fillStyle = STEEL;
          context!.beginPath(); context!.arc(point.x, point.y, Math.max(.8, radius * .28), 0, Math.PI * 2); context!.fill();
        } else {
          context!.globalAlpha = alpha * Math.min(1, twinkle + .1);
          context!.fillStyle = '#fffaf0';
          context!.beginPath(); context!.arc(point.x, point.y, Math.max(.9, radius * .5), 0, Math.PI * 2); context!.fill();
        }
        if (star.magnitude >= .72 && !unseen) {
          const spike = radius * 4.2 * twinkle;
          context!.globalAlpha = alpha * .45;
          context!.strokeStyle = color;
          context!.lineWidth = .8;
          context!.beginPath();
          context!.moveTo(point.x - spike, point.y); context!.lineTo(point.x + spike, point.y);
          context!.moveTo(point.x, point.y - spike); context!.lineTo(point.x, point.y + spike);
          context!.stroke();
        }
        if (star.afterimage) {
          // The afterglow: a ring in the colors of the qualities that stayed.
          const pulse = running ? .62 + .3 * Math.sin(time / 1000 * .5 * Math.PI * 2 + phase) : .8;
          const ringRadius = radius + 5 * zoomScale;
          const channels: FacetKey[] = star.afterimage.length ? star.afterimage : [];
          context!.lineWidth = 1.6 * zoomScale;
          if (!channels.length) {
            context!.globalAlpha = alpha * pulse * .6;
            context!.strokeStyle = '#fff1d6';
            context!.beginPath(); context!.arc(point.x, point.y, ringRadius, 0, Math.PI * 2); context!.stroke();
          }
          channels.forEach((channel, index) => {
            const span = Math.PI * 2 / channels.length;
            const start = -Math.PI / 2 + index * span + .18;
            context!.globalAlpha = alpha * pulse;
            context!.strokeStyle = CHANNEL_COLORS[channel];
            context!.beginPath(); context!.arc(point.x, point.y, ringRadius, start, start + span - .36); context!.stroke();
          });
        }
      }

      // Selection reticle.
      if (selectedStar) {
        const point = toScreen(selectedStar.x, selectedStar.y);
        const radius = 16 * zoomScale;
        const turn = running ? time / 4000 : 0;
        context!.globalAlpha = .9;
        context!.strokeStyle = STARLIGHT;
        context!.lineWidth = 1;
        context!.beginPath(); context!.arc(point.x, point.y, radius, 0, Math.PI * 2); context!.stroke();
        for (let tick = 0; tick < 4; tick++) {
          const angle = turn + tick * Math.PI / 2;
          context!.beginPath();
          context!.moveTo(point.x + Math.cos(angle) * (radius + 3), point.y + Math.sin(angle) * (radius + 3));
          context!.lineTo(point.x + Math.cos(angle) * (radius + 10), point.y + Math.sin(angle) * (radius + 10));
          context!.stroke();
        }
        if (running) animating = true;
      }

      // Labels.
      context!.textBaseline = 'alphabetic';
      for (const constellation of sky!.constellations) {
        const lit = litConstellations.has(constellation.id);
        if (k < .42 && !lit) continue;
        const index = order.get(constellation.id) ?? 0;
        const appear = Math.max(0, Math.min(1, (reveal - index * 140 - 800) / 600));
        if (!appear) continue;
        const point = toScreen(constellation.label.x, constellation.label.y);
        if (point.x < -200 || point.x > width + 200 || point.y < -40 || point.y > height + 60) continue;
        const fontSize = Math.round(Math.min(26, Math.max(13, 17 * zoomScale)));
        context!.textAlign = 'center';
        context!.globalAlpha = appear * (lit ? 1 : .78);
        context!.fillStyle = constellation.kind === 'reel' ? '#eadcc0' : '#c9d4df';
        context!.font = `italic 400 ${fontSize}px ${display}`;
        context!.fillText(constellation.name, point.x, point.y);
        context!.globalAlpha = appear * (lit ? .85 : .5);
        context!.fillStyle = STEEL;
        context!.font = `500 ${Math.max(9, Math.round(fontSize * .5))}px ${sans}`;
        context!.fillText(`${constellation.kind === 'reel' ? 'REEL' : 'ATLAS'} · ${shortDate(constellation.chartedAt).toUpperCase()}`, point.x, point.y + fontSize * .95);
      }
      for (const star of sky!.stars) {
        const focus = selectedStar?.key === star.key || hovered === star.key;
        const show = focus || (star.role !== 'field' && k >= 1.15 && (filter === 'all' || matches(star, filter))) || (star.role === 'field' && k >= 1.9 && matches(star, filter));
        if (!show) continue;
        const point = toScreen(star.x, star.y);
        if (point.x < -20 || point.y < -20 || point.x > width + 20 || point.y > height + 20) continue;
        context!.textAlign = 'left';
        context!.globalAlpha = focus ? 1 : .72;
        context!.fillStyle = focus ? '#fffaf0' : '#d8d6cc';
        context!.font = `${focus ? 500 : 400} ${focus ? 13 : 11}px ${sans}`;
        const offset = (1.05 + star.magnitude * 3.3) * zoomScale + (focus ? 22 : 8);
        context!.fillText(star.title, point.x + offset, point.y + 4);
        if (focus) {
          context!.globalAlpha = .7;
          context!.fillStyle = STEEL;
          context!.font = `400 11px ${sans}`;
          context!.fillText(star.year, point.x + offset, point.y + 19);
        }
      }
      context!.globalAlpha = 1;
      if (animating || running) frame.current = requestAnimationFrame(time => draw.current(time));
    };

    request.current = () => { if (!frame.current) frame.current = requestAnimationFrame(time => draw.current(time)); };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    return () => { observer.disconnect(); cancelAnimationFrame(frame.current); frame.current = 0; request.current = () => {}; };
  }, [open, sky, starColor, fitView, starsByKey, constellationsById]);

  // Reset the camera for each visit.
  useEffect(() => { if (!open) size.current = { width: 0, height: 0, scale: 1 }; }, [open]);

  const selectStar = useCallback((star: SkyStar | null, glideTo = true) => {
    setSelection(star ? { kind: 'star', key: star.key } : null);
    if (!star) return;
    const parts = [star.liked ? 'Loved' : '', star.afterimage ? 'Afterimage kept' : '', star.saved ? 'Saved to watch' : ''].filter(Boolean);
    setAnnouncement(`${star.title}, ${star.year}.${parts.length ? ` ${parts.join('. ')}.` : ''}${star.constellations.length ? ` In ${star.constellations.map(id => constellationsById.get(id)?.name).filter(Boolean).join(' and ')}.` : ''}`);
    if (glideTo) focusOn(star, 1.2);
  }, [constellationsById, focusOn]);

  const selectConstellation = useCallback((constellation: SkyConstellation) => {
    setSelection({ kind: 'constellation', id: constellation.id });
    setAnnouncement(`${constellation.name}. ${constellation.stars.length} films.`);
    focusOn(constellation.center, 1.1);
  }, [focusOn]);

  function hitTest(clientX: number, clientY: number): SkyStar | null {
    if (!sky || !stageRef.current) return null;
    const rect = stageRef.current.getBoundingClientRect();
    const x = (clientX - rect.left - size.current.width / 2) / view.current.k + view.current.x;
    const y = (clientY - rect.top - size.current.height / 2) / view.current.k + view.current.y;
    let best: SkyStar | null = null;
    let bestDistance = 22 / view.current.k;
    for (const star of sky.stars) {
      const distance = Math.hypot(star.x - x, star.y - y);
      if (distance < bestDistance) { best = star; bestDistance = distance; }
    }
    return best;
  }
  function constellationAt(clientX: number, clientY: number): SkyConstellation | null {
    if (!sky || !stageRef.current) return null;
    const rect = stageRef.current.getBoundingClientRect();
    const x = (clientX - rect.left - size.current.width / 2) / view.current.k + view.current.x;
    const y = (clientY - rect.top - size.current.height / 2) / view.current.k + view.current.y;
    return sky.constellations.find(item => Math.abs(item.label.x - x) < 120 / Math.max(.6, view.current.k) && Math.abs(item.label.y - 6 - y) < 18 / Math.max(.6, view.current.k)) ?? null;
  }

  const zoomAt = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    const k = Math.min(4, Math.max(.12, view.current.k * factor));
    if (rect && clientX !== undefined && clientY !== undefined) {
      const px = clientX - rect.left - size.current.width / 2;
      const py = clientY - rect.top - size.current.height / 2;
      const wx = px / view.current.k + view.current.x;
      const wy = py / view.current.k + view.current.y;
      view.current = { x: wx - px / k, y: wy - py / k, k };
    } else view.current = { ...view.current, k };
    glide.current = null;
    request.current();
  }, []);

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), k: view.current.k };
      drag.current = null;
    } else drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, view: { ...view.current }, moved: false };
    glide.current = null;
  }
  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (pointers.current.has(event.pointerId)) pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const factor = Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.distance;
      zoomAt((pinch.current.k * factor) / view.current.k, (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    const current = drag.current;
    if (current && current.id === event.pointerId) {
      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;
      if (Math.hypot(dx, dy) > 4) current.moved = true;
      if (current.moved) { view.current = { ...current.view, x: current.view.x - dx / current.view.k, y: current.view.y - dy / current.view.k }; request.current(); }
      return;
    }
    if (event.pointerType === 'mouse') {
      const star = hitTest(event.clientX, event.clientY);
      const next = star?.key ?? null;
      if (next !== hovered) setHovered(next);
      event.currentTarget.style.cursor = star || constellationAt(event.clientX, event.clientY) ? 'pointer' : 'grab';
    }
  }
  function onPointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const current = drag.current;
    drag.current = null;
    if (!current || current.moved || current.id !== event.pointerId) return;
    const star = hitTest(event.clientX, event.clientY);
    if (star) { selectStar(star); return; }
    const constellation = constellationAt(event.clientX, event.clientY);
    if (constellation) selectConstellation(constellation);
    else setSelection(null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLCanvasElement>) {
    if (!sky?.stars.length) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      const visible = sky.stars.filter(star => matches(star, filter));
      const from = selectedStar ?? [...visible].sort((a, b) => Math.hypot(a.x - view.current.x, a.y - view.current.y) - Math.hypot(b.x - view.current.x, b.y - view.current.y))[0];
      if (!from) return;
      const next = selectedStar ? nearestStarInDirection(visible, from, event.key as 'ArrowUp') : from;
      if (next) selectStar(next);
    } else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomAt(1.3); }
    else if (event.key === '-' || event.key === '_') { event.preventDefault(); zoomAt(1 / 1.3); }
    else if (event.key === '0') { event.preventDefault(); flyTo(fitView(sky, true)); }
  }

  // Wheel zoom must be non-passive to keep the page still.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!open || !canvas || !sky) return;
    const wheel = (event: WheelEvent) => { event.preventDefault(); zoomAt(Math.exp(-event.deltaY * (event.ctrlKey ? .01 : .0016)), event.clientX, event.clientY); };
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => canvas.removeEventListener('wheel', wheel);
  }, [open, sky, zoomAt]);

  // Fetch one poster on demand for a selected star the page has never enriched.
  const selectedKey = selectedStar?.key;
  useEffect(() => {
    if (!selectedStar || !selectedKey || knownArt[selectedKey]) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await apiFetch('/api/films/enrich', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ films: [{ title: selectedStar.title, year: selectedStar.year }] }), signal: controller.signal });
        if (!response.ok) return;
        const records = parseEnrichmentResponse(await response.json());
        if (!controller.signal.aborted) setArtwork(current => ({ ...current, ...Object.fromEntries(records.map(record => [record.key, record])) }));
      } catch { /* The star stays a star without its poster. */ }
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [selectedStar, selectedKey, knownArt]);

  if (!open) return null;
  const counts = sky?.counts;
  const empty = sky && !sky.stars.length;
  const details = selectedStar ? knownArt[selectedStar.key] : undefined;
  const matched = details?.status === 'matched' ? details : null;
  const image = matched ? [matched.backdropUrl, matched.posterUrl].find(url => url && !failedArt.includes(url)) : undefined;
  const journal = selectedStar ? afterimages.find(entry => entry.title.toLocaleLowerCase() === selectedStar.title.toLocaleLowerCase() && entry.year === selectedStar.year) : undefined;
  const film = selectedStar ? { title: selectedStar.title, year: selectedStar.year, ...(matched ? { tmdbId: matched.tmdbId } : {}) } : null;

  return <dialog ref={dialog} className="your-sky" aria-labelledby="your-sky-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="your-sky-stage" ref={stageRef} data-mode={mode}>
      <NightSky variant="observatory" running={running} />
      <canvas ref={canvasRef} className="your-sky-map" tabIndex={0} role="application" aria-roledescription="star map"
        aria-label="Your sky. Use the arrow keys to travel between stars, plus and minus to zoom, and 0 to see everything."
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onPointerLeave={() => { if (hovered) setHovered(null); }} onDoubleClick={event => zoomAt(1.8, event.clientX, event.clientY)} onKeyDown={onKeyDown} hidden={mode !== 'map'} />
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      {empty ? <div className="your-sky-empty"><StarGlyph /><h3>Your sky is still dark.</h3><p>Every film you love, save, remember or explore will appear here as a star. Reels become constellations; Atlases gather around the film you started from.</p><button type="button" onClick={onBegin}>Find your first film <span aria-hidden="true">↗</span></button></div> : null}
      {mode === 'list' && sky ? <div className="your-sky-list">{skyReadingOrder(sky).map(group => <section key={group.constellation?.id ?? 'field'}>
        <h3>{group.constellation ? group.constellation.name : 'Loved, saved and remembered'}<small>{group.constellation ? `${group.constellation.kind === 'reel' ? 'Reel' : 'Atlas'} · ${shortDate(group.constellation.chartedAt)}` : 'Films outside a reel or Atlas'}</small></h3>
        <ul>{group.stars.filter(star => matches(star, filter)).map(star => <li key={star.key}><button type="button" aria-pressed={selectedStar?.key === star.key} onClick={() => selectStar(star, false)}>
          <span className="your-sky-list-mark" data-state={star.afterimage ? 'afterimage' : star.liked ? 'liked' : star.saved ? 'saved' : 'seen'} aria-hidden="true" />
          <strong>{star.title}</strong><small>{star.year}{star.liked ? ' · Loved' : ''}{star.afterimage ? ' · Afterimage' : ''}{star.saved ? ' · To watch' : ''}</small>
        </button></li>)}</ul>
      </section>)}</div> : null}
    </div>

    <header className="your-sky-masthead">
      <button type="button" className="your-sky-back" onClick={onClose}><span aria-hidden="true">←</span> Back</button>
      <h2 id="your-sky-title" ref={headingRef} tabIndex={-1}><OrbitMark /><span><small>AFTERIMAGE</small>Your sky</span></h2>
      <div className="your-sky-tools"><MotionToggle /><div className="your-sky-view" role="group" aria-label="Sky presentation"><button type="button" aria-pressed={mode === 'map'} onClick={() => setMode('map')}>Map</button><button type="button" aria-pressed={mode === 'list'} onClick={() => setMode('list')}>List</button></div></div>
    </header>

    <aside className="your-sky-panel" aria-label="About your sky" data-selected={Boolean(selectedStar || selectedConstellation)}>
      {!selectedStar && !selectedConstellation ? <div className="your-sky-overview">
        <p className="your-sky-kicker"><StarGlyph />Every film you have met here</p>
        <p className="your-sky-lede">Charted in the order you found them. The brightest are the ones you loved and remembered.</p>
        {counts ? <dl className="your-sky-counts"><div><dt>Stars</dt><dd>{counts.stars}</dd></div><div><dt>Constellations</dt><dd>{counts.constellations}</dd></div><div><dt>Afterimages</dt><dd>{counts.afterimages}</dd></div></dl> : null}
        <div className="your-sky-filters" role="group" aria-label="Show stars">{FILTERS.map(item => <button type="button" key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}{counts && item.id !== 'all' ? <span>{item.id === 'liked' ? counts.liked : item.id === 'saved' ? counts.saved : counts.afterimages}</span> : null}</button>)}</div>
        {sky?.constellations.length ? <nav className="your-sky-constellations" aria-label="Constellations"><h3>Constellations</h3><ol>{[...sky.constellations].reverse().map(item => <li key={item.id}><button type="button" onClick={() => selectConstellation(item)}><span className="your-sky-constellation-mark" data-kind={item.kind} aria-hidden="true">{item.palette.length ? item.palette.slice(0, 5).map((color, index) => <i key={index} style={{ backgroundColor: mix(color, .35) }} />) : <i />}</span><span><strong>{item.name}</strong><small>{item.kind === 'reel' ? 'Reel' : 'Atlas'} · {shortDate(item.chartedAt)}</small></span></button></li>)}</ol></nav> : null}
        <details className="your-sky-legend"><summary>How to read your sky <span aria-hidden="true">+</span></summary><ul>
          <li><i className="legend-star is-bright" aria-hidden="true" />Brighter stars are films you loved, remembered or met more than once.</li>
          <li><i className="legend-star is-ring" aria-hidden="true" />A colored ring is an afterimage: the qualities that stayed with you.</li>
          <li><i className="legend-star is-hollow" aria-hidden="true" />A hollow star is saved for later, not yet seen.</li>
          <li><i className="legend-line is-thread" aria-hidden="true" />Gold threads join a reel’s five films in ranked order.</li>
          <li><i className="legend-line is-orbit" aria-hidden="true" />Silver orbits join an Atlas to the film it began with.</li>
        </ul><p>Where a star sits records when and where you met it. Distance never measures how alike two films are.</p></details>
      </div> : null}

      {selectedStar && film ? <article className="your-sky-star" key={selectedStar.key}>
        <button type="button" className="your-sky-deselect" onClick={() => setSelection(null)}>← All of your sky</button>
        <div className="your-sky-star-image">{image ? <img src={image} alt="" onError={() => setFailedArt(current => [...current, image])} /> : <span aria-hidden="true"><StarGlyph /></span>}</div>
        <p className="your-sky-kicker">{selectedStar.afterimage ? 'An afterimage' : selectedStar.liked ? 'A film you loved' : selectedStar.saved ? 'Saved for another night' : 'A film you have met'}</p>
        <h3>{selectedStar.title} <span>{selectedStar.year}</span></h3>
        {matched?.directors.length ? <p className="your-sky-credit">{matched.directors.join(', ')}{matched.runtime ? ` · ${matched.runtime} min` : ''}</p> : null}
        {journal ? <div className="your-sky-journal">
          <p><span>Watched {shortDate(`${journal.watchedOn}T12:00:00`)}</span>{journal.stayed.length ? journal.stayed.map(channel => <em key={channel} style={{ '--channel': CHANNEL_COLORS[channel] } as CSSProperties}>{journal.labels?.[channel] ?? FACET_META[channel].label}</em>) : <em>The whole film</em>}</p>
          {journal.note ? <blockquote>{journal.note}</blockquote> : null}
        </div> : null}
        <div className="your-sky-actions">
          <LikeButton film={film} liked={likedKeys.has(selectedStar.key)} onToggle={() => onLike(film)} />
          <button type="button" aria-pressed={savedKeys.has(selectedStar.key)} onClick={() => onSave(film)}>{savedKeys.has(selectedStar.key) ? 'Saved ✓' : 'Save for later +'}</button>
          <button type="button" className="is-primary" onClick={event => onLogAfterimage(film, event.currentTarget)}>{journal ? 'Revisit your afterimage' : 'Log an afterimage'} <span aria-hidden="true">✦</span></button>
        </div>
        {selectedStar.constellations.length ? <div className="your-sky-memberships"><h4>Where you met it</h4><ul>{selectedStar.constellations.map(id => {
          const constellation = constellationsById.get(id);
          if (!constellation) return null;
          const hash = constellation.kind === 'reel' ? `#reel=${constellation.sourceId}` : `#atlas=${constellation.sourceId}`;
          const reel = reelIds.get(id);
          return <li key={id}><a href={hash} onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onNavigate(hash, event.currentTarget); }}>
            <span><strong>{constellation.name}</strong><small>{constellation.kind === 'reel' ? `Reel · ${reel ? reelCaption(reel) : constellation.caption}` : 'Atlas · the films around it'}</small></span><span aria-hidden="true">↗</span></a></li>;
        })}</ul></div> : <p className="your-sky-field-note">This film shines on its own: you {selectedStar.liked ? 'loved' : selectedStar.afterimage ? 'remembered' : 'saved'} it outside a reel or Atlas.</p>}
        <button type="button" className="your-sky-explore" disabled={!canExplore} onClick={event => onExplore(film, event.currentTarget)}>Explore its Atlas <span aria-hidden="true">↗</span></button>
        {onCollide ? <button type="button" className="your-sky-explore your-sky-collide" onClick={event => onCollide(film, event.currentTarget)}>Collide it with another film <span aria-hidden="true">✕</span></button> : null}
        {!canExplore ? <p className="your-sky-field-note">Connect the film service, or let the current discovery finish, to explore a new Atlas.</p> : null}
      </article> : null}

      {selectedConstellation ? <article className="your-sky-constellation" key={selectedConstellation.id}>
        <button type="button" className="your-sky-deselect" onClick={() => setSelection(null)}>← All of your sky</button>
        <p className="your-sky-kicker">{selectedConstellation.kind === 'reel' ? 'A reel, as a constellation' : 'An Atlas, as a constellation'} · {shortDate(selectedConstellation.chartedAt)}</p>
        <h3>{selectedConstellation.name}</h3>
        <p className="your-sky-lede">{selectedConstellation.caption}</p>
        {selectedConstellation.palette.length ? <p className="your-sky-palette" aria-hidden="true">{selectedConstellation.palette.map((color, index) => <i key={index} style={{ backgroundColor: color }} />)}</p> : null}
        <ol className="your-sky-members">{selectedConstellation.stars.map((key, index) => { const star = starsByKey.get(key); return star ? <li key={key}><button type="button" onClick={() => selectStar(star)}><span>{selectedConstellation.kind === 'reel' ? String(index + 1).padStart(2, '0') : index === 0 ? '◎' : '·'}</span><strong>{star.title}</strong><small>{star.year}</small></button></li> : null; })}</ol>
        <a className="your-sky-open" href={selectedConstellation.kind === 'reel' ? `#reel=${selectedConstellation.sourceId}` : `#atlas=${selectedConstellation.sourceId}`} onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onNavigate(selectedConstellation.kind === 'reel' ? `#reel=${selectedConstellation.sourceId}` : `#atlas=${selectedConstellation.sourceId}`, event.currentTarget); }}>{selectedConstellation.kind === 'reel' ? 'Open this reel' : 'Open this Atlas'} <span aria-hidden="true">↗</span></a>
      </article> : null}
    </aside>

    {mode === 'map' && sky && !empty ? <div className="your-sky-zoom" role="group" aria-label="Zoom">
      <button type="button" aria-label="Zoom in" onClick={() => zoomAt(1.35)}>+</button>
      <button type="button" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.35)}>−</button>
      <button type="button" aria-label="See your whole sky" onClick={() => flyTo(fitView(sky, true))}>⤢</button>
    </div> : null}
    <p className="your-sky-footnote">Kept in this browser. Positions record when and where you met a film, never how alike films are.</p>
  </dialog>;
}
