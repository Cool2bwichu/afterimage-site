'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { parseAtlasInputRequest, type AtlasFilm, type AtlasNeighbor } from '../lib/atlas';
import type { AtlasStop } from '../lib/atlas-trail';
import { fetchFilmEnrichment } from '../lib/enrichment-client';
import type { FilmEnrichment } from '../lib/movie-metadata';
import {
  TERRA_KEY, chartTerra, doorAtlasRequest, doorName, doorRequest, factsFromEnrichment, parseDoorBrief, parseTerraCache, serializeTerraCache, terraZones,
  type Door, type TerraFacts, type TerraFilm, type Zone,
} from '../lib/terra';
import { StarGlyph } from './celestial';

/** How many films one visit may look up, five to a request. */
const LOOKUP_LIMIT = 60;
const [SKY_W, SKY_H] = [900, 600];
// Your own sky sits a little left of centre, as on the page.
const HOME = { x: SKY_W * 0.44, y: SKY_H * 0.5 };

/** A film you love, through which a door is found. */
export type LovedFilm = { title: string; year: string; tmdbId?: number; liked: boolean };
type Opened = { id: string; anchor: AtlasFilm; door: AtlasNeighbor };

function readCache(): Record<string, TerraFacts> {
  try { return parseTerraCache(localStorage.getItem(TERRA_KEY)); } catch { return {}; }
}

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let next = Math.imul(value ^ (value >>> 15), value | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

/** The sky as the page drew it: your stars gathered in the middle, the dark places glowing at its edges. */
function paintSky(context: CanvasRenderingContext2D, zones: readonly Zone[], selected: number, stars: number) {
  const random = seeded(7);
  context.clearRect(0, 0, SKY_W, SKY_H);
  context.fillStyle = 'rgba(200,200,210,.18)';
  for (let index = 0; index < 300; index++) { const size = random() * 0.8 + 0.2; context.fillRect(random() * SKY_W, random() * SKY_H, size, size); }
  zones.forEach((zone, index) => {
    const [x, y] = [zone.x * SKY_W, zone.y * SKY_H];
    const nebula = context.createRadialGradient(x, y, 0, x, y, 130);
    nebula.addColorStop(0, `rgba(${zone.ink.join(',')},${index === selected ? 0.28 : 0.12})`);
    nebula.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = nebula;
    context.beginPath(); context.arc(x, y, 130, 0, Math.PI * 2); context.fill();
  });
  const glow = context.createRadialGradient(HOME.x, HOME.y, 0, HOME.x, HOME.y, 240);
  glow.addColorStop(0, 'rgba(222,198,160,.16)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, SKY_W, SKY_H);
  // A haze of dust, and one brighter point for each film you have met.
  const dust = 320;
  for (let index = 0; index < dust + Math.min(stars, 200); index++) {
    const angle = random() * Math.PI * 2;
    const reach = Math.pow(random(), 1.6) * 170;
    const film = index >= dust;
    const size = film ? random() * 0.9 + 1.3 : random() * 1.1 + 0.3;
    context.fillStyle = `rgba(236,214,178,${film ? 0.85 + random() * 0.15 : 0.25 + random() * 0.45})`;
    context.beginPath(); context.arc(HOME.x + Math.cos(angle) * reach * 1.3, HOME.y + Math.sin(angle) * reach, size, 0, Math.PI * 2); context.fill();
  }
  const zone = zones[selected];
  if (!zone) return;
  const [x, y] = [zone.x * SKY_W, zone.y * SKY_H];
  context.strokeStyle = 'rgba(222,198,160,.55)';
  context.setLineDash([4, 7]);
  context.lineWidth = 1.4;
  context.beginPath(); context.moveTo(HOME.x, HOME.y); context.quadraticCurveTo((HOME.x + x) / 2, (HOME.y + y) / 2 - 60, x, y); context.stroke();
  context.setLineDash([]);
  context.fillStyle = '#dec6a0';
  context.beginPath(); context.arc(x, y, 5, 0, Math.PI * 2); context.fill();
}

function TerraSky({ zones, selected, stars, onSelect }: { zones: readonly Zone[]; selected: number; stars: number; onSelect: (index: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    const scale = Math.min(2, window.devicePixelRatio || 1);
    element.width = SKY_W * scale;
    element.height = SKY_H * scale;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    paintSky(context, zones, selected, stars);
  }, [zones, selected, stars]);
  return <div className="terra-sky">
    <canvas ref={canvas} width={SKY_W} height={SKY_H} aria-hidden="true" />
    <span className="terra-you" aria-hidden="true">your sky</span>
    <div role="group" aria-label="The dark places at the edge of your sky">
      {zones.map((zone, index) => <button key={`${zone.kind}-${zone.id}`} type="button" className="terra-zone" aria-pressed={index === selected}
        style={{ left: `${zone.x * 100}%`, top: `${zone.y * 100}%` } as CSSProperties} onClick={() => onSelect(index)}><i aria-hidden="true" />{zone.title}</button>)}
    </div>
  </div>;
}

/**
 * Terra Incognita: your sky shows where you have been, and this charts where you have
 * not. Films are placed by the catalogue's own record of where and when they were made;
 * the dark places glow at the edges of your sky, and each has one door: a film found
 * through one you love, by way of the Atlas. A whole reel from there is an ordinary request.
 */
export function TerraIncognita({ films, knownArt, canLookUp, canDevelop, atlases, loved, onDevelop, onDoor, onOpenMap }: {
  films: TerraFilm[]; knownArt: Record<string, FilmEnrichment>; canLookUp: boolean; canDevelop: boolean;
  /** Saved Atlases: a door already found shows its film here. */
  atlases: readonly AtlasStop[];
  /** The film a door is found through: the latest you Liked, or else the latest in your journal. */
  loved: LovedFilm | null;
  onDevelop: (request: { films: string[]; creativeBrief: string }, opener: HTMLElement) => void;
  onDoor?: (film: LovedFilm, request: { films: string[]; creativeBrief: string }, opener: HTMLElement) => void;
  onOpenMap?: (id: string, opener: HTMLElement) => void;
}) {
  const [cache, setCache] = useState<Record<string, TerraFacts>>(readCache);
  const [looking, setLooking] = useState(0);
  const [selected, setSelected] = useState(0);
  const doorRef = useRef<HTMLDivElement>(null);
  const facts = useMemo(() => {
    const merged: Record<string, TerraFacts> = { ...cache };
    for (const film of films) {
      const known = factsFromEnrichment(knownArt[film.key]);
      if (known) merged[film.key] = known;
    }
    return merged;
  }, [cache, films, knownArt]);
  const chart = useMemo(() => chartTerra(films, facts), [films, facts]);
  const zones = useMemo(() => terraZones(chart), [chart]);
  // Each door already found: the latest Atlas drawn for that dark place.
  const opened = useMemo(() => {
    const found = new Map<string, Opened>();
    for (const stop of atlases) {
      const door = parseDoorBrief(parseAtlasInputRequest(stop.inputKey, stop.atlas.anchor)?.creativeBrief);
      if (door && stop.atlas.neighbors[0]) found.set(`${door.kind}:${door.id}`, { id: stop.id, anchor: stop.atlas.anchor, door: stop.atlas.neighbors[0] });
    }
    return found;
  }, [atlases]);

  // Films the page has never looked up are charted now, a few at a time, and remembered.
  useEffect(() => {
    if (!canLookUp) return;
    const missing = films.filter(film => !facts[film.key]).slice(0, LOOKUP_LIMIT);
    if (!missing.length) return;
    const controller = new AbortController();
    const kickoff = window.setTimeout(() => void (async () => {
      setLooking(missing.length);
      const found: Record<string, TerraFacts> = {};
      for (let start = 0; start < missing.length && !controller.signal.aborted; start += 5) {
        try {
          const records = await fetchFilmEnrichment({ recommendations: missing.slice(start, start + 5), signal: controller.signal });
          for (const record of records) { const known = factsFromEnrichment(record); if (known) found[record.key] = known; }
        } catch { break; }
        if (!controller.signal.aborted) setLooking(Math.max(0, missing.length - start - 5));
      }
      if (controller.signal.aborted) return;
      setLooking(0);
      if (!Object.keys(found).length) return;
      setCache(current => {
        const next = { ...current, ...found };
        try { localStorage.setItem(TERRA_KEY, serializeTerraCache(next)); } catch { /* The chart still draws for this visit. */ }
        return next;
      });
    })(), 0);
    return () => { window.clearTimeout(kickoff); controller.abort(); };
    // Only the films in the sky decide what to look up; new answers must not restart the walk.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canLookUp, films]);

  // A decade with one film shouldn't stand as tall as one you know well.
  const maxEra = Math.max(4, ...chart.eras.map(era => era.films.length));
  const develop = (door: Pick<Door, 'kind' | 'id'>, opener: HTMLElement) => onDevelop(doorRequest(door), opener);
  const current = Math.min(selected, zones.length - 1);
  const zone = zones[current];
  const found = zone ? opened.get(`${zone.kind}:${zone.id}`) : undefined;
  // Choosing a dark place brings its door into view.
  function choose(index: number) {
    setSelected(index);
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => doorRef.current?.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' }));
  }

  return <section className="terra" aria-labelledby="terra-title">
    <header className="terra-head">
      <p className="terra-kicker"><StarGlyph />Terra incognita</p>
      <h3 id="terra-title">Where your sky hasn’t reached</h3>
      <p>Your sky shows you its dark places, and one door into each.</p>
      <p className="terra-coverage" aria-live="polite">{chart.charted} of {chart.total} films charted{looking ? ` · charting ${looking} more…` : ''}{!canLookUp && chart.charted < chart.total ? ' · the rest can be charted once the film catalogue is reachable' : ''}</p>
    </header>

    {zone ? <>
      <TerraSky zones={zones} selected={current} stars={chart.total} onSelect={choose} />
      <div ref={doorRef} className="terra-door" aria-live="polite">
        <p className="terra-door-kicker">A door into {doorName(zone)}</p>
        {found ? <>
          <h4>{found.door.title}</h4>
          <p className="terra-door-meta">{found.door.year} · {found.door.label}</p>
          <p className="terra-door-why">From <em>{found.anchor.title}</em>: {found.door.shared}</p>
          <div className="terra-door-actions">
            {onOpenMap ? <button type="button" className="is-solid" onClick={event => onOpenMap(found.id, event.currentTarget)}>Open the map <span aria-hidden="true">↗</span></button> : null}
            <button type="button" disabled={!canDevelop} onClick={event => develop(zone, event.currentTarget)}>A whole reel from there <span aria-hidden="true">↗</span></button>
          </div>
        </> : <>
          <h4>{zone.line}</h4>
          <p className="terra-door-why">{loved && onDoor
            ? <>One film to start with, found through <em>{loved.title}</em>, {loved.liked ? 'a film you love' : 'which stayed with you'}, so the first step never feels like homework.</>
            : 'Like a film, or keep one in your journal, and Afterimage can find a door through it.'}</p>
          <div className="terra-door-actions">
            {loved && onDoor ? <button type="button" className="is-solid" disabled={!canDevelop} onClick={event => onDoor(loved, doorAtlasRequest(zone, loved.liked ? 'liked' : 'kept'), event.currentTarget)}>Find the door <span aria-hidden="true">↗</span></button> : null}
            <button type="button" disabled={!canDevelop} onClick={event => develop(zone, event.currentTarget)}>A whole reel from there <span aria-hidden="true">↗</span></button>
          </div>
        </>}
        {canDevelop ? null : <small className="terra-door-note">Connect the film service to open a door.</small>}
      </div>
    </> : <p className="terra-young">{chart.total < 5 ? 'Your sky is still young. Its edges appear after a few more films.' : 'Your sky has reached every part of this chart. Few skies do.'}</p>}

    <details className="terra-detail">
      <summary>The whole chart <span aria-hidden="true">+</span></summary>
      <div className="terra-world" role="list" aria-label="Parts of the world">
        {chart.regions.map(region => <div role="listitem" key={region.id} className={`terra-region${region.films.length ? ' is-reached' : ' is-blank'}`} style={{ gridArea: region.area } as CSSProperties}>
          <strong>{region.name}</strong>
          {region.films.length ? <>
            <span>{region.films.length} {region.films.length === 1 ? 'film' : 'films'}</span>
            <small>{region.films.slice(0, 3).map(film => film.title).join(' · ')}{region.films.length > 3 ? ' …' : ''}</small>
          </> : <>
            <span>Terra incognita</span>
            <button type="button" disabled={!canDevelop} onClick={event => develop({ kind: 'region', id: region.id }, event.currentTarget)} aria-label={`Develop a reel of films from ${region.name}`}>Go there <span aria-hidden="true">↗</span></button>
          </>}
        </div>)}
      </div>

      <div className="terra-time">
        <h4>When</h4>
        <ol className="terra-eras" aria-label="Films by decade">{chart.eras.map(era => <li key={era.id} className={era.films.length ? 'is-reached' : 'is-blank'} style={{ '--fill': era.films.length / maxEra } as CSSProperties}>
          {era.films.length ? <span className="terra-era-bar" aria-hidden="true" /> : <button type="button" disabled={!canDevelop} className="terra-era-bar" aria-label={`Develop a reel from ${era.label.replace(/^The/, 'the')}`} onClick={event => develop({ kind: 'era', id: era.id }, event.currentTarget)} />}
          <small>{era.short}</small><span className="sr-only">{era.label}: {era.films.length} {era.films.length === 1 ? 'film' : 'films'}</span>
        </li>)}</ol>
      </div>

      <div className="terra-forms-wrap">
        <h4>Forms</h4>
        <ul className="terra-forms">{chart.forms.map(form => <li key={form.genre}>{form.films.length
          ? <span className="is-reached">{form.name}<small>{form.films.length}</small></span>
          : <button type="button" disabled={!canDevelop} className="is-blank" onClick={event => develop({ kind: 'form', id: form.genre }, event.currentTarget)}>{form.name}<small>none yet</small></button>}</li>)}</ul>
      </div>
      <p className="terra-footnote">From TMDB’s records of production countries and genres. A co-production counts in each place it was made.</p>
    </details>
  </section>;
}
