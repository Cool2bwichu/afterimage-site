'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ATLAS_STORAGE_KEY, atlasInputKey, parseAtlas, parseAtlasInputRequest, type AtlasInput, type AtlasIdentity } from '../lib/atlas';
import { atlasLayout, atlasDirectionalNeighbor } from '../lib/atlas-layout';
import { ATLAS_ARTWORK_KEY, readAtlasArtwork, serializeAtlasArtwork } from '../lib/atlas-artwork';
import { ATLAS_TRAIL_STORAGE_KEY, MAX_ATLAS_MAPS, activeAtlasStop, emptyAtlasTrail, finishAtlasMap, moveAtlasTrail, parseAtlasTrail, updateAtlasView, visitAtlasMap, type AtlasTrail } from '../lib/atlas-trail';
import { FACET_KEYS, FACET_META, type CinematicFacet, type FacetKey, type FacetSource, type SelectedFacets } from '../lib/light-table';
import { parseEnrichmentResponse, movieKey, imdbUrl, type FilmEnrichment } from '../lib/movie-metadata';
import { parseJobStart } from '../lib/generation-state';
import { LikeButton } from './like-button';
import { FacetTab } from './facet-tab';
import { AtlasFilmSearch } from './atlas-film-search';
import { CelestialSky, MotionToggle, OrbitMark } from './celestial';

type Props = {
  target: AtlasInput | null; opener: HTMLElement | null; connected: boolean; preferSaved: boolean;
  onClose: () => void; onBusy: (busy: boolean) => void;
  requestedMapId: string | null; onTrailChange: (trail: AtlasTrail) => void; onMapChange: (id: string) => void; navigation: ReactNode;
  metadataByKey: Record<string, FilmEnrichment>; likedKeys: Set<string>;
  savedKeys: Set<string>; onSave: (film: AtlasIdentity) => void;
  onLike: (film: FacetSource) => void; onExplore: (film: FacetSource, opener: HTMLElement, request: AtlasInput['request']) => void;
  onSearchExplore: (film: FacetSource, opener: HTMLElement) => void;
  selectedFacets: SelectedFacets; onBorrow?: (channel: FacetKey, facet: CinematicFacet, source: FacetSource, trigger: HTMLButtonElement) => void;
  lightTable: ReactNode;
};
const AFFINITY = { close: 'Close', echo: 'Echo', contrast: 'Contrast' };
const AFFINITY_DESCRIPTIONS = { close: 'Strongly shared', echo: 'A related quality', contrast: 'A different approach' };
function requestCaption(inputKey: string, anchor: AtlasIdentity) {
  const request = parseAtlasInputRequest(inputKey, anchor);
  return request?.creativeBrief || request?.films.join(' + ') || 'Selected qualities';
}

function Artwork({ film, metadata, portrait = false }: { film: FacetSource; metadata?: FilmEnrichment; portrait?: boolean }) {
  const [failed, setFailed] = useState<string[]>([]);
  const urls = metadata?.status === 'matched' ? [metadata.backdropUrl, metadata.posterUrl] : [];
  const src = urls.find(url => url && !failed.includes(url));
  return src ? <img src={src} alt="" loading={portrait ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(current => [...current, src])} />
    : <span className="atlas-art-fallback" aria-hidden="true"><span>{film.title.slice(0, 1)}</span></span>;
}

export function AtlasWorkspace(props: Props) {
  const { target, opener, onClose, onBusy, connected, preferSaved, metadataByKey, likedKeys, onLike, onExplore, selectedFacets, onBorrow, lightTable, requestedMapId, onTrailChange, onMapChange } = props;
  const [saved, setSaved] = useState(emptyAtlasTrail);
  const [ready, setReady] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [metadata, setMetadata] = useState<Record<string, FilmEnrichment>>({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [reading, setReading] = useState<'connection' | 'difference' | 'notes'>('connection');
  const [mapView, setMapView] = useState<'map' | 'list'>('map');
  const [pollRevision, setPollRevision] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const readingPanel = useRef<HTMLElement>(null);
  const trailNavigation = useRef<HTMLElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const lock = useRef(false);
  const navigationRevision = useRef(0);
  const processedTarget = useRef<AtlasInput | null>(null);
  const inputRef = useRef(target);
  useEffect(() => { inputRef.current = target; }, [target]);
  const busy = starting || Boolean(saved.pending);
  const stop = activeAtlasStop(saved);
  const atlas = stop?.atlas ?? null;
  const selected = stop?.view.selected ?? -1;
  const lens = stop?.view.lens ?? 'all';
  const active = atlas ? selected < 0 ? atlas.anchor : atlas.neighbors[selected] : null;
  const neighbor = atlas ? atlas.neighbors[selected < 0 ? 0 : selected] : null;
  const allMetadata = { ...metadataByKey, ...metadata };
  const getMetadata = (film: AtlasIdentity) => {
    const record = allMetadata[movieKey(film.title, film.year)];
    return film.tmdbId && record?.status === 'matched' && record.tmdbId !== film.tmdbId ? undefined : record;
  };
  const historyFilms = JSON.stringify(saved.maps.map(map => ({ title: map.atlas.anchor.title, year: map.atlas.anchor.year, ...(map.atlas.anchor.tmdbId ? { tmdbId: map.atlas.anchor.tmdbId } : {}) })).sort((a, b) => movieKey(a.title, a.year).localeCompare(movieKey(b.title, b.year))));

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const read = (key: string) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
        setSaved(parseAtlasTrail(read(ATLAS_TRAIL_STORAGE_KEY), read(ATLAS_STORAGE_KEY)));
        setMetadata(readAtlasArtwork(localStorage.getItem(ATLAS_ARTWORK_KEY)));
      } catch { /* A damaged cache cannot change the reel. */ }
      setReady(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(ATLAS_TRAIL_STORAGE_KEY, JSON.stringify(saved)); }
    catch { const timer = setTimeout(() => setStorageError(true), 0); return () => clearTimeout(timer); }
  }, [ready, saved]);
  useEffect(() => { if (ready) onTrailChange(saved); }, [ready, saved, onTrailChange]);
  useEffect(() => {
    if (!ready || !target || !requestedMapId) return;
    const id = requestedMapId;
    const timer = setTimeout(() => setSaved(current => visitAtlasMap(current, id)), 0);
    return () => clearTimeout(timer);
  }, [ready, target, requestedMapId]);
  useEffect(() => {
    if (!ready || !target || !stop || (requestedMapId && requestedMapId !== stop.id)) return;
    if (preferSaved || stop.inputKey === atlasInputKey(target)) onMapChange(stop.id);
  }, [ready, target, stop, preferSaved, requestedMapId, onMapChange]);
  useEffect(() => { onBusy(busy); }, [busy, onBusy]);

  function rememberArtwork(records: FilmEnrichment[]) {
    setMetadata(current => {
      const next = { ...current, ...Object.fromEntries(records.map(item => [item.key, item])) };
      try { localStorage.setItem(ATLAS_ARTWORK_KEY, serializeAtlasArtwork(next)); }
      catch { /* Artwork still works when storage is full or unavailable. */ }
      return next;
    });
  }

  async function develop(input: AtlasInput) {
    if (lock.current || saved.pending) return;
    lock.current = true; setStarting(true); setError('');
    const startedAtNavigation = navigationRevision.current;
    try {
      const response = await fetch('/api/atlas/generations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(15000) });
      const raw = await response.json();
      if (!response.ok) throw new Error(response.status === 409 ? 'Another reel or Atlas is developing. Return to it, then try again.' : 'The Atlas could not start. Your reel is still here.');
      const job = parseJobStart(raw);
      if (!job) throw new Error('The Atlas service returned an incomplete response.');
      setSaved(current => ({ ...current, pending: { jobId: job.jobId, inputKey: atlasInputKey(input), anchor: input.anchor, followOnComplete: startedAtNavigation === navigationRevision.current } }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The Atlas could not start.'); }
    finally { lock.current = false; setStarting(false); }
  }

  useEffect(() => {
    if (!target || !ready || processedTarget.current === target) return;
    const timer = setTimeout(() => {
      processedTarget.current = target;
      setError('');
      if (preferSaved) return;
      const cached = saved.maps.find(map => map.inputKey === atlasInputKey(target));
      if (cached) { setSaved(current => visitAtlasMap(current, cached.id)); return; }
      if (saved.pending) return;
      if (!connected) { setError('Connect the film service from your reel to develop an Atlas.'); return; }
      void develop(target);
    }, 0);
    return () => clearTimeout(timer);
    // target is an immutable snapshot created by an explicit Explore action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, ready]);

  useEffect(() => {
    const pending = saved.pending;
    if (!pending) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const poll = async () => {
      try {
        const response = await fetch(`/api/generations/${pending.jobId}`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) });
        if ([404, 401].includes(response.status)) throw Object.assign(new Error(response.status === 404 ? 'This Atlas job has expired. Develop a new map.' : 'Reconnect the film service, then resume the Atlas.'), { terminal: true, expired: response.status === 404 });
        if (!response.ok) throw new Error('The Atlas service is reconnecting.');
        const raw: unknown = await response.json();
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('The Atlas status is unavailable.');
        const job = raw as Record<string, unknown>;
        if (job.jobId !== pending.jobId) throw new Error('The Atlas job identity changed.');
        if (job.status === 'complete') {
          const result = parseAtlas(job.reel);
          if (!result || movieKey(result.anchor.title, result.anchor.year) !== movieKey(pending.anchor.title, pending.anchor.year)) throw Object.assign(new Error('The Atlas returned incomplete connections. Please try again.'), { terminal: true, expired: true });
          if (!controller.signal.aborted) { setSaved(current => finishAtlasMap(current, pending.jobId, result)); setError(''); }
          return;
        }
        if (job.status === 'failed') throw Object.assign(new Error('We could not finish and verify this map. Your previous Atlas and reel are preserved.'), { terminal: true, expired: true });
        if (!['queued', 'running'].includes(String(job.status))) throw new Error('The Atlas status is unavailable.');
        failures = 0;
      } catch (reason) {
        if (controller.signal.aborted) return;
        const failure = reason as Error & { terminal?: boolean; expired?: boolean };
        if (failure.terminal || ++failures >= 4) {
          setError(failure.message || 'The connection paused. Resume to keep following this Atlas.');
          if (failure.expired) setSaved(current => ({ ...current, pending: null }));
          return;
        }
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 2500);
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [saved.pending, pollRevision]);

  useEffect(() => {
    if (!atlas) return;
    const controller = new AbortController();
    const films = [atlas.anchor, ...atlas.neighbors].filter(film => getMetadata(film)?.status !== 'matched');
    void Promise.all([films.slice(0, 5), films.slice(5)].filter(batch => batch.length).map(async batch => {
      const response = await fetch('/api/films/enrich', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ films: batch.map(film => ({ title: film.title, year: film.year, ...(film.tmdbId ? { tmdbId: film.tmdbId } : {}) })) }), signal: controller.signal });
      if (!response.ok) return;
      const records = parseEnrichmentResponse(await response.json());
      if (!controller.signal.aborted) rememberArtwork(records);
    })).catch(() => {});
    return () => controller.abort();
    // Fetch once when the accepted map changes; cached artwork has its own expiry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atlas]);

  useEffect(() => {
    const anchors: FacetSource[] = (JSON.parse(historyFilms) as FacetSource[]).filter(film => getMetadata(film)?.status !== 'matched');
    if (!anchors.length) return;
    const controller = new AbortController();
    void Promise.all(Array.from({ length: Math.ceil(anchors.length / 5) }, async (_, index) => {
      const response = await fetch('/api/films/enrich', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ films: anchors.slice(index * 5, index * 5 + 5) }), signal: controller.signal });
      if (!response.ok) return;
      const records = parseEnrichmentResponse(await response.json());
      if (!controller.signal.aborted) rememberArtwork(records);
    })).catch(() => {});
    return () => controller.abort();
    // History changes are the fetch trigger; artwork state must not trigger retries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyFilms]);

  const isOpen = Boolean(target);
  useEffect(() => {
    if (!isOpen) return;
    const element = dialog.current;
    if (!element) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!element.open) element.showModal();
    back.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      element.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [isOpen, opener, onClose]);

  function select(index: number, reveal = false) {
    setSaved(current => updateAtlasView(current, { selected: index })); setReading('connection');
    if (reveal && window.matchMedia('(max-width: 850px)').matches) requestAnimationFrame(() => {
      readingPanel.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      readingPanel.current?.focus({ preventScroll: true });
    });
  }
  function setLens(value: FacetKey | 'all') { setSaved(current => updateAtlasView(current, { lens: value })); setReading('connection'); }
  function travel(cursor: number) {
    navigationRevision.current += 1;
    setReading('connection');
    setSaved(current => moveAtlasTrail(current, cursor));
    if (saved.route[cursor]) onMapChange(saved.route[cursor]);
    if (!saved.pending) setError('');
    dialog.current?.scrollTo({ top: 0, behavior: 'instant' });
  }
  function revisit(id: string) {
    navigationRevision.current += 1;
    setReading('connection');
    setSaved(current => visitAtlasMap(current, id));
    onMapChange(id);
    if (!saved.pending) setError('');
    dialog.current?.scrollTo({ top: 0, behavior: 'instant' });
  }
  useEffect(() => {
    const navigation = trailNavigation.current;
    if (!navigation) return;
    const revealCurrent = () => navigation.querySelector('[aria-current=step]')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    revealCurrent();
    const observer = new ResizeObserver(revealCurrent);
    observer.observe(navigation);
    return () => observer.disconnect();
  }, [saved.cursor, saved.route, isOpen]);
  const activeMetadata = active ? getMetadata(active) : undefined;
  const verified = activeMetadata?.status === 'matched' ? activeMetadata : null;
  const link = imdbUrl(verified?.imdbId);
  const layout = atlasLayout(atlas?.neighbors ?? [], lens);
  const anchor = atlas?.anchor ?? target?.anchor;
  const anchorMetadata = anchor ? getMetadata(anchor) : undefined;
  const acceptedRequest = stop ? parseAtlasInputRequest(stop.inputKey, stop.atlas.anchor) : null;
  const activeAffinity = selected >= 0 && neighbor && lens !== 'all' ? neighbor.lenses[lens].affinity : undefined;

  if (!isOpen) return null;

  return <dialog ref={dialog} className="atlas-dialog atlas-observatory" aria-labelledby="atlas-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="observatory-shell">
      <header className="observatory-masthead">
        <button ref={back} type="button" className="observatory-back" onClick={onClose}><span aria-hidden="true">←</span> Back</button>
        <h1 id="atlas-title"><OrbitMark /><span className="observatory-brand"><small>AFTERIMAGE</small><span>Atlas</span></span></h1>
        <div className="observatory-tools">
          <MotionToggle />
          <button type="button" aria-expanded={searchOpen} aria-controls="observatory-search" onClick={() => setSearchOpen(value => !value)}>{searchOpen ? 'Close search' : 'Find a film'}<span aria-hidden="true">⌕</span></button>
          <details className="observatory-visited"><summary>Visited <span>{saved.maps.length}</span></summary><div>
            <h2>Your explored films</h2>
            {saved.maps.length ? [...saved.maps].reverse().map(map => <button type="button" key={map.id} aria-current={map.id === stop?.id ? 'page' : undefined} onClick={event => { revisit(map.id); const menu = event.currentTarget.closest('details'); if (menu) { menu.open = false; menu.querySelector('summary')?.focus(); } }}>
              <span className="observatory-history-image"><Artwork film={map.atlas.anchor} metadata={getMetadata(map.atlas.anchor)} /></span><span><strong>{map.atlas.anchor.title}</strong><small>{map.atlas.anchor.year} · {requestCaption(map.inputKey, map.atlas.anchor)}</small></span>{map.id === stop?.id ? <span className="observatory-here">Here</span> : null}
            </button>) : <p>The films you explore will appear here.</p>}
            <p className="observatory-storage-note">Your {MAX_ATLAS_MAPS} most recent maps stay in this browser.</p>
          </div></details>
        </div>
        {props.navigation}
      </header>

      {storageError ? <p className="observatory-notice" role="alert">This browser could not save your Atlas. Keep this page open and free some browser storage before leaving.</p> : null}

      <div id="observatory-search" hidden={!searchOpen}><AtlasFilmSearch busy={busy} connected={connected} onDevelop={(film, trigger) => { setSearchOpen(false); props.onSearchExplore(film, trigger); }} /></div>

      {saved.route.length > 1 ? <nav className="observatory-trail" aria-label="Atlas exploration trail" ref={trailNavigation}>
        <button type="button" disabled={saved.cursor <= 0} onClick={() => travel(saved.cursor - 1)} aria-label="Previous map in your trail">←</button>
        <ol>{saved.route.map((id, index) => { const map = saved.maps.find(item => item.id === id)!; return <li key={`${id}-${index}`}><button type="button" onClick={() => travel(index)} aria-current={index === saved.cursor ? 'step' : undefined}>{map.atlas.anchor.title}</button></li>; })}</ol>
        <button type="button" disabled={saved.cursor >= saved.route.length - 1} onClick={() => travel(saved.cursor + 1)} aria-label="Next map in your trail">→</button>
      </nav> : null}

      {saved.readyId ? <div className="observatory-notice" role="status">A new constellation is ready.<button type="button" onClick={() => revisit(saved.readyId!)}>Open {saved.maps.find(map => map.id === saved.readyId)?.atlas.anchor.title}</button></div> : null}
      {busy || error ? <div className="observatory-progress" role={error ? 'alert' : 'status'}><span className={error ? '' : 'observatory-progress-mark'} aria-hidden="true" /><div><strong>{error || `Finding the connections around ${saved.pending?.anchor.title || target?.anchor.title}…`}</strong>{!error ? <p>{atlas ? 'Keep exploring this map while the next one develops.' : 'Considering six films and checking their identities. This can take a few minutes.'}</p> : null}</div>{error ? <button type="button" disabled={starting} onClick={() => { setError(''); if (saved.pending) setPollRevision(current => current + 1); else if (inputRef.current) void develop(inputRef.current); }}>{saved.pending ? 'Resume' : 'Try again'}</button> : null}</div> : null}

      {atlas ? <>
        <section className="observatory-heading" aria-label="Current Atlas">
          <div><p>In the orbit of</p><h2>{atlas.anchor.title} <span>{atlas.anchor.year}</span></h2></div>
          <p className="observatory-thesis">{atlas.thesis}</p>
        </section>

        <div className="observatory-workspace">
          <section className="observatory-navigation" aria-label="Film connections">
            <div className="observatory-chart-controls">
              <div className="observatory-lenses" aria-label="Connection lens">{(['all', ...FACET_KEYS] as const).map(channel => <button type="button" key={channel} aria-pressed={lens === channel} onClick={() => setLens(channel)}>{channel === 'all' ? 'Whole film' : FACET_META[channel].compactLabel}</button>)}</div>
              <div className="observatory-view" aria-label="Connection presentation"><button type="button" aria-pressed={mapView === 'map'} onClick={() => setMapView('map')}>Map</button><button type="button" aria-pressed={mapView === 'list'} onClick={() => setMapView('list')}>List</button></div>
            </div>

            <div className={`observatory-chart${lens !== 'all' ? ' is-grouped' : ''}`} hidden={mapView !== 'map'} data-group-count={layout.groups.length} aria-label={lens === 'all' ? 'Six connections around your film' : `Films grouped by ${FACET_META[lens].compactLabel.toLowerCase()}`}>
              <CelestialSky variant="atlas" />
              <div className="observatory-chart-glow" aria-hidden="true" />
              {layout.groups.map(group => <div className="observatory-territory" data-affinity={group.affinity} key={group.affinity} style={{ '--x': `${group.x}%`, '--width': `${group.width}%` } as CSSProperties}><strong>{group.label}</strong><span>{AFFINITY_DESCRIPTIONS[group.affinity]}</span>{group.count === 0 ? <small>No films in this group</small> : null}</div>)}
              <svg className="observatory-paths" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{layout.nodes.map((point, index) => <path key={movieKey(atlas.neighbors[index].title, atlas.neighbors[index].year)} d={`M ${layout.anchor.x} ${layout.anchor.y} L ${point.x} ${point.y}`} style={{ d: `path("M ${layout.anchor.x} ${layout.anchor.y} L ${point.x} ${point.y}")` } as CSSProperties} className={selected === index ? 'is-selected' : ''} data-affinity={point.affinity} />)}{selected >= 0 ? <path key={`${stop?.id}-${lens}-${selected}`} className="observatory-trace" pathLength={1} d={`M ${layout.anchor.x} ${layout.anchor.y} L ${layout.nodes[selected].x} ${layout.nodes[selected].y}`} /> : null}</svg>
              <button type="button" className="observatory-origin" aria-label={`Select anchor film ${atlas.anchor.title}`} aria-pressed={selected === -1} style={{ '--x': `${layout.anchor.x}%`, '--y': `${layout.anchor.y}%` } as CSSProperties} onClick={() => select(-1)}><span className="observatory-origin-reticle" aria-hidden="true" /><span className="observatory-origin-image"><Artwork film={atlas.anchor} metadata={anchorMetadata} /></span><strong>{atlas.anchor.title}</strong><small>Your starting film</small></button>
              {atlas.neighbors.map((film, index) => <button type="button" key={movieKey(film.title, film.year)} className="observatory-star" data-film-index={index} data-dense={layout.groups.length === 3 && (layout.groups.find(group => group.affinity === layout.nodes[index]?.affinity)?.count ?? 0) > 3} data-affinity={layout.nodes[index]?.affinity} style={{ '--x': `${layout.nodes[index]?.x}%`, '--y': `${layout.nodes[index]?.y}%` } as CSSProperties} aria-label={`Explore ${film.title}: ${film.label}${lens === 'all' ? '' : `. ${FACET_META[lens].label}: ${AFFINITY[film.lenses[lens].affinity]}`}`} aria-pressed={selected === index} onClick={() => select(index, true)} onKeyDown={event => { if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? 5 : atlasDirectionalNeighbor(layout.nodes, index, event.key as 'ArrowRight' | 'ArrowLeft' | 'ArrowUp' | 'ArrowDown'); select(next); dialog.current?.querySelectorAll<HTMLButtonElement>('.observatory-star')[next]?.focus(); } }}><span className="observatory-star-image"><Artwork film={film} metadata={getMetadata(film)} /><i aria-hidden="true" /></span><strong>{film.title}</strong><small>{film.year}</small></button>)}
            </div>

            <div className="observatory-film-list" hidden={mapView !== 'list'}>{(lens === 'all' ? [{ affinity: 'all' as const, label: 'Six connections' }] : layout.groups).map(group => <section key={group.affinity} data-affinity={group.affinity === 'all' ? undefined : group.affinity}><h3>{group.label}</h3>{atlas.neighbors.map((film, index) => lens !== 'all' && film.lenses[lens].affinity !== group.affinity ? null : <button type="button" key={movieKey(film.title, film.year)} data-film-index={index} aria-pressed={selected === index} onClick={() => select(index, true)}><span className="observatory-list-image"><Artwork film={film} metadata={getMetadata(film)} /></span><span><strong>{film.title}</strong><small>{film.year} · {film.label}</small></span><i aria-hidden="true">{selected === index ? '−' : '+'}</i></button>)}{group.affinity !== 'all' && !atlas.neighbors.some(film => lens !== 'all' && film.lenses[lens].affinity === group.affinity) ? <p>No films in this group.</p> : null}</section>)}</div>

            <div className="observatory-chart-caption"><span>{lens === 'all' ? 'Six films. Different ways of seeing.' : (['close', 'echo', 'contrast'] as const).map(affinity => `${atlas.neighbors.filter(film => film.lenses[lens].affinity === affinity).length} ${AFFINITY[affinity]}`).join(' · ')}</span><span>{selected >= 0 ? 'Selected' : 'Start anywhere'} <i aria-hidden="true">✦</i> {selected >= 0 ? neighbor?.title : 'Follow your curiosity'}</span></div>
            <p className="sr-only" role="status">{selected >= 0 ? `${neighbor?.title} selected. ${lens === 'all' ? neighbor?.label : `${AFFINITY[neighbor!.lenses[lens].affinity]}: ${neighbor!.lenses[lens].evidence}`}` : `${atlas.anchor.title} is your starting film. Choose one of six connections.`}</p>
          </section>

          {active ? <section ref={readingPanel} tabIndex={-1} className="observatory-reading" aria-label={`Reading ${active.title}`}><button type="button" className="observatory-return-map" onClick={() => { const node = dialog.current?.querySelector<HTMLButtonElement>(`${mapView === 'map' ? '.observatory-star' : '.observatory-film-list button'}[data-film-index="${Math.max(0, selected)}"]`); node?.focus({ preventScroll: true }); node?.closest('.observatory-navigation')?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }}>↑ Back to the {mapView}</button>
            <div className="observatory-reading-image" key={movieKey(active.title, active.year)}><Artwork film={active} metadata={activeMetadata} portrait />{selected >= 0 ? <div className="observatory-from"><span><Artwork film={atlas.anchor} metadata={anchorMetadata} /></span><small>From {atlas.anchor.title}</small><i aria-hidden="true">↗</i></div> : <span className="observatory-start-label">Your starting film</span>}</div>
            <div className="observatory-reading-body">
              <div className="observatory-film-heading"><h2>{active.title}</h2><span>{active.year}{verified?.runtime ? ` · ${verified.runtime} min` : ''}</span>{verified?.directors.length ? <p>{verified.directors.join(', ')}</p> : null}</div>
              <div className="observatory-film-actions"><button type="button" aria-pressed={props.savedKeys.has(movieKey(active.title, active.year))} onClick={() => props.onSave({ title: active.title, year: active.year, ...((active.tmdbId || verified?.tmdbId) ? { tmdbId: active.tmdbId || verified?.tmdbId } : {}) })}>{props.savedKeys.has(movieKey(active.title, active.year)) ? 'Saved ✓' : 'Save for later +'}</button><LikeButton film={active} liked={likedKeys.has(movieKey(active.title, active.year))} onToggle={() => onLike(active)} />{link ? <a href={link} target="_blank" rel="noreferrer noopener" aria-label={`Verified details for ${active.title}`}>Details ↗</a> : null}</div>
              {selected >= 0 && neighbor ? <>
                <div className="observatory-reading-tabs" aria-label="Connection reading">{(['connection', 'difference', 'notes'] as const).map(tab => <button type="button" key={tab} aria-pressed={reading === tab} onClick={() => setReading(tab)}>{tab === 'connection' ? 'The connection' : tab === 'difference' ? 'The difference' : 'Film notes'}</button>)}</div>
                <div className="observatory-passage" data-affinity={activeAffinity}>
                  {reading === 'connection' ? <><span className="observatory-reading-label">{lens === 'all' ? 'What carries through' : `${FACET_META[lens].compactLabel} · ${AFFINITY[neighbor.lenses[lens].affinity]}`}</span><h3>{lens === 'all' ? neighbor.label : active.facets[lens].label}</h3><p>{lens === 'all' ? neighbor.shared : neighbor.lenses[lens].evidence}</p><details><summary>Why this path</summary><p>{neighbor.whyHere}</p></details></> : reading === 'difference' ? <><span className="observatory-reading-label">A different direction</span><h3>What changes</h3><p>{neighbor.difference}</p></> : <><span className="observatory-reading-label">The film itself</span><p>{active.summary}</p><h3>What to watch for</h3><p>{active.watchFor}</p></>}
                </div>
                <button type="button" className="observatory-follow" disabled={busy || !connected || !acceptedRequest} onClick={event => { if (acceptedRequest) onExplore(active, event.currentTarget, acceptedRequest); }}><span>Explore from here<small>Make {active.title} your starting film</small></span><i aria-hidden="true">↗</i></button>
              </> : <div className="observatory-passage"><span className="observatory-reading-label">The film at the center</span><p>{active.summary}</p><details><summary>What to watch for</summary><p>{active.watchFor}</p></details><p className="observatory-invitation">Choose a connected film to discover what carries through—and what changes.</p></div>}
              <details className="observatory-borrow" key={`borrow-${movieKey(active.title, active.year)}`}><summary>{onBorrow ? 'Carry a quality into your next reel' : 'Read this film’s qualities'}<span aria-hidden="true">+</span></summary><div>{FACET_KEYS.map(channel => onBorrow ? <FacetTab key={channel} channel={channel} facet={active.facets[channel]} source={active} selected={selectedFacets[channel]} disabled={busy} onSelect={onBorrow} /> : <div key={channel}><small>{FACET_META[channel].label}</small><h3>{active.facets[channel].label}</h3><p>{active.facets[channel].explanation}</p></div>)}</div></details>
            </div>
          </section> : null}
        </div>
        <section className="observatory-light-table" aria-label="Your borrowed qualities">{lightTable}</section>
      </> : <section className="observatory-welcome" aria-label="Begin an Atlas">
        <div className="observatory-welcome-chart"><CelestialSky variant="atlas" /><div className="observatory-welcome-orbit" aria-hidden="true" /><div className="observatory-welcome-film"><span className="observatory-welcome-image">{anchor ? <Artwork film={anchor} metadata={anchorMetadata} portrait /> : <span className="observatory-unknown-film" aria-hidden="true" />}</span><strong>{anchor?.title || 'A film to begin with'}</strong><small>{anchor?.year || 'YOUR STARTING POINT'}</small></div></div>
        <div className="observatory-welcome-copy"><p>A film is a starting point.</p><h2>See what<br />connects.</h2><p>Follow {anchor?.title || 'a film you love'} into six new directions. Explore a shared feeling, a way of seeing, or an unexpected contrast.</p><button type="button" className="observatory-follow" disabled={!connected || busy} onClick={() => { if (target) void develop(target); }}><span>{busy ? 'Finding your connections…' : 'Explore this film'}</span><i aria-hidden="true">↗</i></button><button type="button" className="observatory-text-button" onClick={() => setSearchOpen(true)}>Or start with another film</button></div>
      </section>}
      <footer className="observatory-footer"><span>Afterimage · Atlas</span><small>Film identities & imagery: TMDB. Connections are editorial interpretations.</small></footer>
    </div>
  </dialog>;
}
