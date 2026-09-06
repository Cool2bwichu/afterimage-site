'use client';

import { memo, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ATLAS_STORAGE_KEY, atlasInputKey, parseAtlas, type Atlas, type AtlasInput, type AtlasNeighbor } from '../lib/atlas';
import { FACET_KEYS, FACET_META, type CinematicFacet, type FacetKey, type FacetSource, type SelectedFacets } from '../lib/light-table';
import { parseEnrichmentResponse, movieKey, imdbUrl, type FilmEnrichment } from '../lib/movie-metadata';
import { isGenerationJobId, parseJobStart } from '../lib/generation-state';
import { LikeButton } from './like-button';
import { FacetTab } from './facet-tab';

type Pending = { jobId: string; inputKey: string; anchor: FacetSource };
type Saved = { atlas: Atlas | null; inputKey: string; pending: Pending | null };
type Props = {
  target: AtlasInput | null; opener: HTMLElement | null; connected: boolean; preferSaved: boolean;
  onClose: () => void; onBusy: (busy: boolean) => void;
  metadataByKey: Record<string, FilmEnrichment>; likedKeys: Set<string>;
  onLike: (film: FacetSource) => void; onExplore: (film: FacetSource, opener: HTMLElement) => void;
  selectedFacets: SelectedFacets; onBorrow?: (channel: FacetKey, facet: CinematicFacet, source: FacetSource, trigger: HTMLButtonElement) => void;
  lightTable: ReactNode;
};
const POSITIONS = [[29, 20], [75, 20], [14, 47], [88, 47], [30, 76], [74, 76]];
const LABELS = [[39, 36], [63, 36], [29, 43], [73, 43], [32, 64], [70, 64]];
const AFFINITY = { close: 'Close', echo: 'Echo', contrast: 'Contrast' };

function Artwork({ film, metadata, portrait = false }: { film: FacetSource; metadata?: FilmEnrichment; portrait?: boolean }) {
  const [failed, setFailed] = useState<string[]>([]);
  const urls = metadata?.status === 'matched' ? [metadata.backdropUrl, metadata.posterUrl] : [];
  const src = urls.find(url => url && !failed.includes(url));
  return src ? <img src={src} alt="" loading={portrait ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(current => [...current, src])} />
    : <span className="atlas-art-fallback" aria-hidden="true">{film.title.slice(0, 1)}</span>;
}

function createStarPoints() {
  // Deterministic decorative light, not additional films or inferred relationships.
  let seed = 71425;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  return Array.from({ length: 1100 }, (_, i) => {
    const angle = random() * Math.PI * 2; const radius = Math.sqrt(random()) * 47;
    return { x: Number((50 + Math.cos(angle) * radius).toFixed(3)), y: Number((49 + Math.sin(angle) * radius).toFixed(3)), r: i % 49 === 0 ? .18 : Number((.025 + random() * .085).toFixed(3)) };
  });
}
const STAR_POINTS = createStarPoints();
const StarField = memo(function StarField() {
  const points = STAR_POINTS;
  return <svg className="atlas-starfield" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <defs><radialGradient id="atlas-nebula"><stop stopColor="#bc853f" stopOpacity=".22" /><stop offset=".5" stopColor="#658b86" stopOpacity=".08" /><stop offset="1" stopColor="#080d0b" stopOpacity="0" /></radialGradient></defs>
    <circle cx="50" cy="49" r="49" fill="url(#atlas-nebula)" />
    {[21, 33, 44, 48].map(r => <circle className="atlas-orbit" key={r} cx="50" cy="49" r={r} />)}
    {points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={point.r} className={index % 31 === 0 ? 'atlas-star-bright' : ''} fill={index % 4 ? '#dbb776' : '#82a5a4'} opacity={.15 + index % 7 / 10} />)}
    {points.filter((_, i) => i % 49 === 0).map((point, index) => <path key={index} d={`M${point.x - .6} ${point.y}h1.2 M${point.x} ${point.y - .9}v1.8`} stroke="#edcc8b" strokeWidth=".055" opacity=".65" className="atlas-star-bright" />)}
  </svg>;
});

export function AtlasWorkspace(props: Props) {
  const { target, opener, onClose, onBusy, connected, preferSaved, metadataByKey, likedKeys, onLike, onExplore, selectedFacets, onBorrow, lightTable } = props;
  const [saved, setSaved] = useState<Saved>({ atlas: null, inputKey: '', pending: null });
  const [ready, setReady] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(-1);
  const [lens, setLens] = useState<FacetKey | 'all'>('all');
  const [metadata, setMetadata] = useState<Record<string, FilmEnrichment>>({});
  const [expanded, setExpanded] = useState(false);
  const [pollRevision, setPollRevision] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const lock = useRef(false);
  const processedTarget = useRef<AtlasInput | null>(null);
  const inputRef = useRef(target);
  useEffect(() => { inputRef.current = target; }, [target]);
  const busy = starting || Boolean(saved.pending);
  const atlas = saved.atlas;
  const active = atlas ? selected < 0 ? atlas.anchor : atlas.neighbors[selected] : null;
  const neighbor = atlas ? atlas.neighbors[selected < 0 ? 0 : selected] : null;
  const allMetadata = { ...metadataByKey, ...metadata };
  const getMetadata = (film: FacetSource) => allMetadata[movieKey(film.title, film.year)];
  let requestLabel = 'the selected qualities';
  try {
    const request = JSON.parse(saved.inputKey)[1];
    requestLabel = request.creativeBrief || request.films.join(' + ') || requestLabel;
  } catch { /* No complete map yet. */ }

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const raw = JSON.parse(localStorage.getItem(ATLAS_STORAGE_KEY) || 'null');
        if (raw) {
          const pending = raw.pending;
          setSaved({ atlas: parseAtlas(raw.atlas), inputKey: typeof raw.inputKey === 'string' ? raw.inputKey : '', pending: pending && isGenerationJobId(pending.jobId) && typeof pending.inputKey === 'string' && typeof pending.anchor?.title === 'string' && /^\d{4}$/.test(pending.anchor?.year) ? pending : null });
        }
      } catch { /* A damaged cache cannot change the reel. */ }
      setReady(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(ATLAS_STORAGE_KEY, JSON.stringify(saved)); }
    catch { /* Browsing still works when storage is unavailable. */ }
  }, [ready, saved]);
  useEffect(() => { onBusy(busy); }, [busy, onBusy]);

  async function develop(input: AtlasInput) {
    if (lock.current || saved.pending) return;
    lock.current = true; setStarting(true); setError('');
    try {
      const response = await fetch('/api/atlas/generations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(15000) });
      const raw = await response.json();
      if (!response.ok) throw new Error(response.status === 409 ? 'Another reel or Atlas is developing. Return to it, then try again.' : 'The Atlas could not start. Your reel is still here.');
      const job = parseJobStart(raw);
      if (!job) throw new Error('The Atlas service returned an incomplete response.');
      setSaved(current => ({ ...current, pending: { jobId: job.jobId, inputKey: atlasInputKey(input), anchor: input.anchor } }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The Atlas could not start.'); }
    finally { lock.current = false; setStarting(false); }
  }

  useEffect(() => {
    if (!target || !ready || processedTarget.current === target) return;
    const timer = setTimeout(() => {
      processedTarget.current = target;
      setSelected(-1); setLens('all'); setError('');
      if (saved.pending || (preferSaved && saved.atlas) || saved.inputKey === atlasInputKey(target)) return;
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
          if (!controller.signal.aborted) { setSaved({ atlas: result, inputKey: pending.inputKey, pending: null }); setSelected(-1); setError(''); }
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
    const films = [atlas.anchor, ...atlas.neighbors];
    void Promise.all([films.slice(0, 5), films.slice(5)].map(async batch => {
      const response = await fetch('/api/films/enrich', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ films: batch.map(({ title, year }) => ({ title, year })) }), signal: controller.signal });
      if (!response.ok) return;
      const records = parseEnrichmentResponse(await response.json());
      if (!controller.signal.aborted) setMetadata(current => ({ ...current, ...Object.fromEntries(records.map(item => [item.key, item])) }));
    })).catch(() => {});
    return () => controller.abort();
  }, [atlas]);

  const isOpen = Boolean(target);
  useEffect(() => {
    if (!isOpen) return;
    const element = dialog.current;
    if (!element) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!element.open) element.showModal();
    back.current?.focus();
    const closeOnBack = () => onClose();
    const url = new URL(location.href); url.hash = 'atlas';
    if (location.hash !== '#atlas') history.pushState({ afterimageAtlas: true }, '', url);
    window.addEventListener('popstate', closeOnBack);
    return () => {
      window.removeEventListener('popstate', closeOnBack);
      document.body.style.overflow = previous;
      element.close();
      if (location.hash === '#atlas') { const clean = new URL(location.href); clean.hash = ''; history.replaceState(null, '', clean); }
      if (opener?.isConnected) opener.focus();
    };
  }, [isOpen, opener, onClose]);

  function select(index: number) { setSelected(index); }
  const activeMetadata = active ? getMetadata(active) : undefined;
  const verified = activeMetadata?.status === 'matched' ? activeMetadata : null;
  const link = imdbUrl(verified?.imdbId);
  const compareFilms = atlas ? [atlas.anchor, ...(selected < 0 ? atlas.neighbors.slice(0, 3) : [atlas.neighbors[selected], ...atlas.neighbors.filter((_, i) => i !== selected).slice(0, 2)])] : [];

  if (!isOpen) return null;

  return <dialog ref={dialog} className={`atlas-dialog${expanded ? ' atlas-map-expanded' : ''}`} aria-labelledby="atlas-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="atlas-shell">
      <aside className="atlas-filmrail" aria-label="Films in this Atlas"><span className="atlas-rail-motto">A more<br />human<br />algorithm</span>
        {atlas ? [atlas.anchor, ...atlas.neighbors].map((film, i) => <button key={movieKey(film.title, film.year)} aria-label={`Select ${film.title}`} aria-pressed={selected === i - 1} onClick={() => select(i - 1)}><Artwork film={film} metadata={getMetadata(film)} /></button>) : null}
        <p>Films connect.<br />Something<br />stays with you.</p>
      </aside>
      <header className="atlas-masthead"><div className="atlas-brand">AFTERIMAGE<small>Better films find you</small></div>
        <nav aria-label="Atlas navigation"><button className="is-active" aria-current="page" onClick={() => { setExpanded(false); dialog.current?.scrollTo({ top: 0, behavior: 'instant' }); }}>Atlas</button><button ref={back} onClick={onClose}>Your reel <span aria-hidden="true">↗</span></button></nav><em>Different stories.<br />The same human longing.</em>
      </header>
      <div className="atlas-body">
        <section className="atlas-film-panel">
          <button className="atlas-back" onClick={onClose}>← <span>Back to your reel</span></button>
          <span className="atlas-eyebrow">A film in connection</span><h1 id="atlas-title">Atlas</h1><i className="atlas-rule" />
          <p className="atlas-introduction">Films are never alone.{' '}<br />They echo, respond,{' '}<br />and illuminate each other.</p>
          {active ? <div className="atlas-film-detail" key={movieKey(active.title, active.year)}>
            <div className="atlas-portrait"><Artwork film={active} metadata={activeMetadata} portrait /><div><h2>{active.title}</h2><span>{active.year}</span>{verified?.directors.length ? <small>A film by<br />{verified.directors.join(' · ')}</small> : null}</div></div>
            <div className="atlas-film-actions"><LikeButton film={active} liked={likedKeys.has(movieKey(active.title, active.year))} onToggle={() => onLike(active)} />{link ? <a href={link} target="_blank" rel="noreferrer noopener">Film details ↗</a> : null}</div>
            <p className="atlas-film-summary">{active.summary}</p>
            {verified ? <div className="atlas-facts">{[...verified.countries.slice(0, 1), active.year, verified.runtime ? `${Math.floor(verified.runtime / 60)}h ${verified.runtime % 60}m` : null].filter(Boolean).join('  /  ')}<br />{verified.genres.slice(0, 3).join(' · ')}</div> : null}
            <details className="atlas-watch"><summary>What to watch for <span>+</span></summary><p>{active.watchFor}</p></details>
          </div> : null}
        </section>

        <section className="atlas-center" aria-label="Film connection map">
          <div className="atlas-map-heading"><span className="atlas-eyebrow">Its place in your Atlas</span><p>{atlas ? `Six connections to ${atlas.anchor.title}` : 'Finding the films that speak to each other'}</p></div>
          {busy || error ? <div className="atlas-progress" role={error ? 'alert' : 'status'}><span>{error || `Developing an Atlas around ${saved.pending?.anchor.title || target?.anchor.title}…`}</span>{!error ? <small>{atlas ? 'Your previous map stays here while this one develops.' : 'Considering connections and verifying film identities. This can take a few minutes.'}</small> : <button disabled={starting} onClick={() => { setError(''); if (saved.pending) setPollRevision(current => current + 1); else if (inputRef.current) void develop(inputRef.current); }}>{saved.pending ? 'Resume Atlas' : 'Try again'} ↗</button>}</div> : null}
          <div className={`atlas-map${atlas ? ' is-developed' : ' is-developing'}`}>
            <StarField />
            <svg className="atlas-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs><filter id="atlas-glow"><feGaussianBlur stdDeviation=".3" /></filter></defs>
              {atlas?.neighbors.map((film, i) => {
                const [x, y] = POSITIONS[i]; const path = `M 50 47 Q ${50 + (x - 50) * .22} ${y} ${x} ${y}`;
                return <g key={i} className={`atlas-connection ${selected === i ? 'is-selected' : ''} ${lens === 'all' ? '' : film.lenses[lens].affinity}`}>
                  <path className="atlas-link-halo" d={path} /><path d={path} /><path className="atlas-link-pulse" d={path} pathLength="100" />
                </g>;
              })}
            </svg>
            {atlas ? <>
              <button className={`atlas-node is-anchor${selected === -1 ? ' is-selected' : ''}`} style={{ '--x': '50%', '--y': '47%' } as CSSProperties} aria-label={`Select anchor film ${atlas.anchor.title}`} aria-pressed={selected === -1} onClick={() => select(-1)}><span className="atlas-node-image"><Artwork film={atlas.anchor} metadata={getMetadata(atlas.anchor)} /></span><span className="atlas-node-title">{atlas.anchor.title}<small>{atlas.anchor.year}</small></span></button>
              {atlas.neighbors.map((film, i) => <button key={movieKey(film.title, film.year)} className={`atlas-node${selected === i ? ' is-selected' : ''}${lens === 'all' ? '' : ` affinity-${film.lenses[lens].affinity}`}`} style={{ '--x': `${POSITIONS[i][0]}%`, '--y': `${POSITIONS[i][1]}%`, '--arrival': `${i * 65 + 100}ms` } as CSSProperties} aria-label={`Explore ${film.title}: ${film.label}`} aria-pressed={selected === i} onClick={() => select(i)} onKeyDown={event => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); const index = (i + (event.key === 'ArrowRight' ? 1 : 5)) % 6; select(index); dialog.current?.querySelectorAll<HTMLButtonElement>('.atlas-node:not(.is-anchor)')[index]?.focus(); } }}><span className="atlas-node-image"><Artwork film={film} metadata={getMetadata(film)} /></span><span className="atlas-node-title">{film.title}<small>{film.year}</small></span></button>)}
              {atlas.neighbors.map((film, i) => <span key={i} className={`atlas-edge-label${selected === i ? ' is-selected' : ''}`} style={{ left: `${LABELS[i][0]}%`, top: `${LABELS[i][1]}%` }}>{lens === 'all' ? film.label : AFFINITY[film.lenses[lens].affinity]}</span>)}
            </> : <div className="atlas-empty-orbit"><span />{saved.pending?.anchor.title || target?.anchor.title}<small>{saved.pending?.anchor.year || target?.anchor.year}</small></div>}
          </div>
          <p className="atlas-mobile-caption" aria-live="polite">{selected >= 0 && neighbor ? <button onClick={() => dialog.current?.querySelector('.atlas-relationship')?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })}>{neighbor.label} · Read connection ↓</button> : "Choose a film to explore its connection."}</p>
          <div className="atlas-lens-controls" aria-label="Connection lens"><span>Look through</span>{(['all', ...FACET_KEYS] as const).map(channel => <button key={channel} aria-pressed={lens === channel} onClick={() => setLens(channel)}>{channel === 'all' ? 'Whole film' : FACET_META[channel].compactLabel}</button>)}</div>
          {atlas ? <><p className="atlas-thesis">{atlas.anchor.facets.howItFeels.label} · {atlas.anchor.facets.howItLooks.label}</p><div className="atlas-map-footer"><span>Shared qualities · Unexpected echoes</span><button onClick={() => setExpanded(!expanded)} aria-pressed={expanded}>{expanded ? 'Return to full Atlas' : 'Expand map'} <span aria-hidden="true">{expanded ? '−' : '↗'}</span></button></div></> : null}
        </section>

        {atlas && neighbor ? <aside className="atlas-insights" aria-label="Connection insights">
          <section className="atlas-why" aria-live="polite"><span className="atlas-section-title">{selected < 0 ? 'The thread through this Atlas' : `Why ${active?.title} belongs`} <i>↗</i></span><p>{selected < 0 ? atlas.thesis : neighbor.whyHere}</p><small>Drawn from this request: {requestLabel}</small></section>
          <section className="atlas-comparison"><span className="atlas-section-title">Aesthetic DNA <span title="An editorial comparison, not a measured similarity score">ⓘ</span></span>
            <div className="atlas-comparison-scroll"><table><caption className="sr-only">How these films connect to {atlas.anchor.title}. Select a comparison to inspect its explanation.</caption><thead><tr><th scope="col"><span className="sr-only">Quality</span></th>{compareFilms.map(film => <th scope="col" key={film.title}><button onClick={() => select(atlas.neighbors.indexOf(film as AtlasNeighbor))}><Artwork film={film} metadata={getMetadata(film)} /><span>{film.title}</span></button></th>)}</tr></thead><tbody>{FACET_KEYS.map(channel => <tr key={channel}><th scope="row">{FACET_META[channel].compactLabel}</th>{compareFilms.map((film, i) => <td key={film.title}>{i === 0 ? <span className="atlas-dna-anchor">Anchor</span> : <button className={`atlas-affinity ${(film as AtlasNeighbor).lenses[channel].affinity}`} onClick={() => { select(atlas.neighbors.indexOf(film as AtlasNeighbor)); setLens(channel); }} aria-label={`${film.title}, ${FACET_META[channel].label}: ${AFFINITY[(film as AtlasNeighbor).lenses[channel].affinity]}`}><i aria-hidden="true" /><span>{AFFINITY[(film as AtlasNeighbor).lenses[channel].affinity]}</span></button>}</td>)}</tr>)}</tbody></table></div>
            <p className="atlas-comparison-note">Close / Echo / Contrast · Interpretive, not a score</p>
          </section>
          {selected >= 0 || lens !== 'all' ? <section className="atlas-relationship" aria-live="polite"><span className="atlas-section-title">{neighbor.title} <i>↔</i> {atlas.anchor.title}</span><h3>{lens === 'all' ? neighbor.label : FACET_META[lens].label}</h3><p>{lens === 'all' ? neighbor.shared : neighbor.lenses[lens].evidence}</p><details><summary>Where they diverge <span>+</span></summary><p>{neighbor.difference}</p></details></section> : null}
          <section className="atlas-neighbors"><span className="atlas-section-title">Closest connections <span>01 — 03</span></span>{atlas.neighbors.slice(0, 3).map((film, i) => <button key={film.title} aria-pressed={selected === i} onClick={() => select(i)}><Artwork film={film} metadata={getMetadata(film)} /><span><strong>{film.title} <small>{film.year}</small></strong><em>{film.label}</em></span><i>↗</i></button>)}</section>
          <div className="atlas-small-panels"><section><span className="atlas-section-title">Further echoes</span>{atlas.neighbors.slice(3).map((film, i) => <button key={film.title} onClick={() => select(i + 3)}><Artwork film={film} metadata={getMetadata(film)} /><span>{film.title}<small>{film.label}</small></span></button>)}</section><section><span className="atlas-section-title">Follow this film</span><p>{selected < 0 ? "Choose a neighboring film to follow its connections." : "A new constellation, with your request still in view."}</p>{selected >= 0 ? <button className="atlas-new-map" disabled={busy || !connected} onClick={event => { if (active) onExplore(active, event.currentTarget); }}>Explore from<br /><strong>{active?.title}</strong> ↗</button> : null}</section></div>
        </aside> : null}
      </div>

      {atlas ? <section className="atlas-programme" aria-label="Your next watch from this connection"><span className="atlas-eyebrow">Your next watch from this connection</span><div>{atlas.neighbors.map((film, i) => <button key={film.title} aria-pressed={selected === i} onClick={() => select(i)}><div className="atlas-programme-image"><Artwork film={film} metadata={getMetadata(film)} /><span aria-hidden="true">↗</span></div><strong>{film.title}</strong><small>{film.year}</small><p>{film.label}</p></button>)}<p className="atlas-programme-motto">New films.<br />Familiar feelings.<br />A wider you.</p></div></section> : null}
      {active && onBorrow ? <section className="atlas-borrow"><div><span className="atlas-eyebrow">Carry something with you</span><h2>Borrow a quality from <em>{active.title}</em></h2></div><div className="atlas-borrow-grid">{FACET_KEYS.map(channel => <FacetTab key={channel} channel={channel} facet={active.facets[channel]} source={active} selected={selectedFacets[channel]} disabled={busy} onSelect={onBorrow} />)}</div></section> : null}
      <footer className="atlas-footer"><span>AFTERIMAGE</span><span>Films connect us to a larger you</span><small>Film identities & imagery: TMDB · Connections: AFTERIMAGE editorial interpretation</small></footer>
      {lightTable}
    </div>
  </dialog>;
}
