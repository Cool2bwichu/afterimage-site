'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { movieKey, type FilmEnrichment } from '../lib/movie-metadata';
import type { RecommendationV2 } from '../lib/reel-state';
import { FACET_KEYS, type CinematicFacet, type FacetKey, type FacetSource, type SelectedFacets } from '../lib/light-table';
import { FacetTab } from './facet-tab';
import { FilmIdentity } from './film-identity';
import { LikeButton } from './like-button';
import { CelestialSky, OrbitMark } from './celestial';
import type { HoldProps } from './film-verbs';

export function ScreeningReel({ films, metadata, selected, onSelect, onOpen, onExplore, likedKeys, savedKeys, afterimageKeys, onLike, onSave, onAfterimage,
  onResolve, selectedFacets, onBorrow, locked, pending, lightTable, onReplace, onCompare, hold }: {
  films: RecommendationV2[]; metadata: Record<string, FilmEnrichment>; selected: number;
  onSelect: (index: number) => void; onOpen: (index: number, event: MouseEvent<HTMLButtonElement>) => void;
  onExplore: (index: number, event: MouseEvent<HTMLButtonElement>) => void;
  likedKeys: Set<string>; savedKeys: Set<string>; afterimageKeys: Set<string>; onLike: (film: RecommendationV2) => void; onSave: (film: RecommendationV2) => void;
  onAfterimage: (film: RecommendationV2, opener: HTMLElement) => void;
  onResolve: (record: FilmEnrichment) => void; selectedFacets: SelectedFacets;
  onBorrow?: (channel: FacetKey, facet: CinematicFacet, source: FacetSource, trigger: HTMLButtonElement) => void;
  onCompare: (first: number, second: number, opener: HTMLElement) => void;
  locked: boolean; pending: boolean; lightTable: ReactNode; onReplace?: (index: number) => void;
  /** Press and hold (or right-click) a film for its verbs. */
  hold?: (payload: { film: RecommendationV2; index: number }) => HoldProps;
}) {
  const [comparing, setComparing] = useState(false);
  const [compareWith, setCompareWith] = useState(1);
  const [failed, setFailed] = useState<string[]>([]);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const index = Math.min(selected, films.length - 1);
  useEffect(() => {
    const button = buttons.current[selected];
    if (window.matchMedia('(max-width: 760px)').matches && button) {
      const rail = button.closest('ol');
      if (rail) rail.scrollTo({ left: button.offsetLeft - rail.offsetLeft, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
  }, [selected]);
  const film = films[index];
  const key = movieKey(film.title, film.year);
  const record = metadata[key];
  const details = record?.status === 'matched' ? record : null;
  const still = details?.backdropUrl && !failed.includes(details.backdropUrl) ? details.backdropUrl : null;
  const artwork = still || (details?.posterUrl && !failed.includes(details.posterUrl) ? details.posterUrl : null);
  function move(event: KeyboardEvent, position: number) {
    const next = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? (position + 1) % films.length
      : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? (position + films.length - 1) % films.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? films.length - 1 : null;
    if (next === null) return;
    event.preventDefault(); onSelect(next); buttons.current[next]?.focus();
  }
  return <div className="screening-reel">
    <div className="screening-layout">
      <article className={`screening-stage${still ? ' has-still' : artwork ? ' has-poster' : ' no-artwork'}`} aria-labelledby="screening-title" {...hold?.({ film, index })}>
        {artwork ? <img key={artwork} className="screening-artwork" src={artwork}
          srcSet={still ? `${still.replace('/w1280/', '/w780/')} 780w, ${still} 1280w` : undefined}
          sizes={still ? '(max-width: 760px) 100vw, 75vw' : undefined}
          alt={`${film.title} ${still ? 'film still' : 'poster'}`} fetchPriority="high" decoding="async"
          onError={() => setFailed(current => [...current, artwork])} /> : <div className="screening-artwork-fallback" aria-hidden="true"><CelestialSky variant="reel" /><div className="screening-empty-aperture"><OrbitMark /></div><p>{pending ? 'Finding the film image' : 'An image yet to come into focus'}</p></div>}
        <div className="screening-frame" aria-hidden="true"><span>{String(index + 1).padStart(2, '0')} / {String(films.length).padStart(2, '0')}</span><i /><span>AFTERIMAGE · YOUR REEL</span></div>
        <div className="screening-caption" key={key}>
          <p className="screening-position">{index === 0 ? 'Closest to your request' : 'Another way into your reel'}</p>
          <h2 id="screening-title">{film.title}</h2>
          <p className="screening-credits"><span>{film.year}</span>{details?.directors.length ? <span>{details.directors.join(', ')}</span> : null}{details?.runtime ? <span>{details.runtime} min</span> : null}</p>
          <p className="screening-reason">{film.reason}</p>
          <div className="screening-actions"><button type="button" className="screening-read" onClick={event => onOpen(index, event)}>Read the film notes <span aria-hidden="true">↗</span></button><button type="button" aria-pressed={savedKeys.has(key)} onClick={() => onSave(film)}>{savedKeys.has(key) ? 'Saved to watchlist ✓' : 'Save for later +'}</button><LikeButton film={film} liked={likedKeys.has(key)} onToggle={() => onLike(film)} /><button type="button" className="screening-afterimage" aria-pressed={afterimageKeys.has(key)} aria-label={afterimageKeys.has(key) ? `Revisit your afterimage of ${film.title}` : `Watched ${film.title}? Keep what stayed with you`} onClick={event => onAfterimage(film, event.currentTarget)}><span aria-hidden="true">✦</span>{afterimageKeys.has(key) ? 'Afterimage kept' : 'Watched it?'}</button></div>
        </div>
      </article>
      <nav className="reel-index" aria-label="Your five films">
        <header><h3>Your reel</h3><span>Five films, considered together</span></header>
        <ol>{films.map((item, position) => {
          const meta = metadata[movieKey(item.title, item.year)];
          const held = hold?.({ film: item, index: position });
          return <li key={movieKey(item.title, item.year)}><button ref={element => { buttons.current[position] = element; }} type="button"
            aria-current={index === position ? 'true' : undefined} aria-label={`Select ${item.title}, film ${position + 1} of ${films.length}`}
            {...held} onClick={() => onSelect(position)} onKeyDown={event => { held?.onKeyDown(event); if (!event.defaultPrevented) move(event, position); }}>
            <span className="reel-index-number">{String(position + 1).padStart(2, '0')}</span><span><strong>{item.title}</strong><small>{item.year}{meta?.status === 'matched' && meta.runtime ? ` / ${meta.runtime} min` : ''}</small></span><span className="reel-index-mark" aria-hidden="true">{index === position ? '−' : '+'}</span>
          </button></li>;
        })}</ol>

      </nav>
    </div>
    <p className="sr-only" role="status">Selected {film.title}, film {index + 1} of five.</p>
    {lightTable}
    <section className="screening-notes" aria-label={`A closer look at ${film.title}`}>
      <div className="screening-why"><h3>Why this film</h3><p>{film.reason}</p>
        {!artwork && !pending ? <FilmIdentity key={key} title={film.title} year={film.year} onResolve={onResolve} /> : null}
        <div className="screening-next-actions"><button type="button" aria-expanded={comparing} onClick={() => { setCompareWith((index + 1) % films.length); setComparing(!comparing); }}>Compare two films</button><button type="button" disabled={locked} onClick={event => onExplore(index, event)}>Explore its connections <span aria-hidden="true">↗</span></button>{onReplace ? <button type="button" disabled={locked} onClick={() => onReplace(index)}>Replace this film</button> : null}</div>
        {comparing ? <div className="screening-compare-picker"><label htmlFor="compare-film">Compare {film.title} with</label><select id="compare-film" value={compareWith === index ? (index + 1) % films.length : compareWith} onChange={event => setCompareWith(Number(event.target.value))}>{films.map((candidate, position) => position !== index ? <option key={position} value={position}>{candidate.title}</option> : null)}</select><button type="button" onClick={event => onCompare(index, compareWith === index ? (index + 1) % films.length : compareWith, event.currentTarget)}>See them together ↗</button></div> : null}
      </div>
      <div className="screening-observation"><h3>What to watch for</h3><p>{film.watchFor || 'Open the film notes to explore this recommendation.'}</p></div>
      {film.facets && onBorrow ? <div className="screening-qualities"><div><h3>Carry something forward.</h3><p>Borrow only the qualities you want from {film.title}.</p></div><div className="ai-facet-rail">{FACET_KEYS.map(channel => <FacetTab key={channel} channel={channel} facet={film.facets![channel]} source={{ title: film.title, year: film.year }} selected={selectedFacets[channel]} disabled={locked} onSelect={onBorrow} />)}</div></div> : null}
    </section>
  </div>;
}
