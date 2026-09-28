'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { FilmEnrichment } from '../lib/movie-metadata';
import { imdbUrl, movieKey } from '../lib/movie-metadata';
import { FacetTab } from './facet-tab';
import { FACET_KEYS, type FacetKey, type CinematicFacet, type FacetSource, type SelectedFacets } from '../lib/light-table';
import type { RecommendationV2 } from '../lib/reel-state';
import { LikeButton } from './like-button';

export type DossierSelection = { recommendation: RecommendationV2; index: number };

function runtimeLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}h ${remainder}m` : `${remainder}m`;
}

export function FilmDossier({
  selection,
  metadata,
  opener,
  selectedFacets = {},
  onSelectFacet,
  facetDisabled,
  notInterested,
  onNotInterested,
  onClose,
  recommendations = [],
  metadataByKey = {},
  onSelectFilm,
  lightTable,
  liked = false,
  onToggleLike,
  onOpenAtlas,
  saved = false, onSave,
  afterimage = false, onAfterimage,
}: {
  saved?: boolean; onSave?: () => void;
  afterimage?: boolean; onAfterimage?: (opener: HTMLElement) => void;
  selection: DossierSelection | null;
  metadata?: FilmEnrichment;
  opener: HTMLElement | null;
  selectedFacets?: SelectedFacets;
  onSelectFacet?: (channel: FacetKey, facet: CinematicFacet, source: FacetSource, trigger: HTMLButtonElement) => void;
  facetDisabled?: boolean;
  notInterested: boolean;
  onNotInterested: () => void;
  onClose: () => void;
  recommendations?: RecommendationV2[];
  metadataByKey?: Record<string, FilmEnrichment>;
  onSelectFilm?: (index: number) => void;
  lightTable?: ReactNode;
  liked?: boolean;
  onToggleLike?: () => void;
  onOpenAtlas?: (film: FacetSource, opener: HTMLElement) => void;
}) {
  const [failedArtwork, setFailedArtwork] = useState<Set<string>>(() => new Set());
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const selectionKey = selection ? `${selection.recommendation.title}|${selection.recommendation.year}` : null;
  const isOpen = Boolean(selection);

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    if (!dialog.open) dialog.showModal();
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [opener, isOpen]);

  useEffect(() => {
    if (!selectionKey) return;
    dialogRef.current?.querySelector('.dossier-scroll')?.scrollTo({ top: 0 });
    closeRef.current?.focus();
  }, [selectionKey]);

  if (!selection) return null;
  const { recommendation, index } = selection;
  const matched = metadata?.status === 'matched' ? metadata : null;
  const backdrop = matched?.backdropUrl && !failedArtwork.has(matched.backdropUrl) ? matched.backdropUrl : null;
  const artwork = backdrop || (matched?.posterUrl && !failedArtwork.has(matched.posterUrl) ? matched.posterUrl : null);
  const verifiedImdb = matched ? imdbUrl(matched.imdbId) : null;
  const facts = matched ? [
    matched.directors.length ? `Directed by ${matched.directors.join(', ')}` : '',
    matched.runtime ? runtimeLabel(matched.runtime) : '',
    matched.countries.join(', '),
    matched.genres.join(' · '),
  ].filter(Boolean) : [];

  return (
    <dialog
      className="film-dossier projection-dossier"
      ref={dialogRef}
      aria-labelledby="dossier-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="dossier-scroll">
        <header className="dossier-header">
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close film dossier">← Back to your reel</button>
          <span>{String(index + 1).padStart(2, '0')} / 05 · Film dossier</span>
        </header>

        <div className={`dossier-layout${backdrop ? ' has-backdrop' : ''}`}>
        {artwork ? (
          <div className={`dossier-poster${backdrop ? ' has-backdrop' : ''}`}><img src={artwork} alt={`${recommendation.title} ${backdrop ? 'backdrop' : 'poster'}`} onError={() => setFailedArtwork(previous => new Set([...previous, artwork]))} /></div>
        ) : null}
        <div className="dossier-copy"><div className="dossier-introduction"><div className="dossier-title-row">
          <h2 id="dossier-title">{recommendation.title}</h2>
          <span>{recommendation.year}</span>
          {onToggleLike ? <LikeButton film={recommendation} liked={liked} onToggle={onToggleLike} /> : null}
        </div>
        {matched?.tmdbRating !== null && matched?.tmdbRating !== undefined ? (
          <p className="dossier-rating">TMDB RATING · {matched.tmdbRating.toFixed(1)} / 10</p>
        ) : null}
        {facts.length ? <p className="dossier-facts">{facts.join('  ·  ')}</p> : null}
        </div>
        <div className="dossier-columns"><div className="dossier-reading">
        {matched?.overview ? <details className="dossier-story"><summary>Story outline +</summary><p className="dossier-overview">{matched.overview}</p></details> : null}

        <section className="dossier-note">
          <span>Why it belongs</span>
          <p>{recommendation.reason}</p>
        </section>
        {recommendation.programNotes ? <div className="program-notes">
          <section className="dossier-note"><span>What carries through</span><p>{recommendation.programNotes.carriesThrough}</p></section>
          <section className="dossier-note"><span>Where it takes you</span><p>{recommendation.programNotes.takesYouFurther}</p></section>
        </div> : null}
        <section className="dossier-note">
          <span>What to watch for</span>
          <p>{recommendation.watchFor || 'Program note unavailable for this saved reel.'}</p>
        </section>
        </div><div className="dossier-qualities">
        {recommendation.facets && onSelectFacet ? <section className="dossier-borrow" aria-label="Borrow a quality"><h3>Borrow a quality</h3><div className="ai-facet-rail">{FACET_KEYS.map(channel => <FacetTab key={channel} channel={channel} facet={recommendation.facets![channel]} source={{title:recommendation.title,year:recommendation.year}} selected={selectedFacets[channel]} disabled={facetDisabled} onSelect={onSelectFacet} />)}</div></section> : null}
        {recommendation.facets && onSelectFacet ? <details className="quality-notes"><summary>About these qualities +</summary>{FACET_KEYS.map(channel => <p key={channel}><strong>{recommendation.facets![channel].label}</strong>{recommendation.facets![channel].explanation}</p>)}</details> : null}
        <div className="dossier-actions">
          {onSave ? <button type="button" className="save-film-button" aria-pressed={saved} onClick={onSave}>{saved ? 'Saved to watchlist ✓' : 'Save for later +'}</button> : null}
          {onAfterimage ? <button type="button" className="afterimage-film-button" aria-pressed={afterimage} onClick={event => onAfterimage(event.currentTarget)}><span aria-hidden="true">✦</span> {afterimage ? 'Revisit your afterimage' : 'Watched it? Keep an afterimage'}</button> : null}
          {onOpenAtlas ? <button className="atlas-open-button" type="button" disabled={facetDisabled} onClick={event => onOpenAtlas(recommendation, event.currentTarget)}>Explore in Atlas ↗</button> : null}
          {verifiedImdb ? (
            <a className="imdb-link" href={verifiedImdb} target="_blank" rel="noreferrer noopener">View verified IMDb page ↗</a>
          ) : null}
          <button className="not-interested-button" type="button" onClick={onNotInterested} disabled={notInterested}>
            {notInterested ? 'Not interested · saved' : 'Not interested'}
          </button>
        </div>
        </div></div></div></div>
        {onSelectFilm && recommendations.length > 1 ? <nav className="dossier-reel" aria-label="The rest of your reel">
          <h3>The rest of your reel</h3>
          <div className="dossier-reel__films">{recommendations.map((film, filmIndex) => {
            if (filmIndex === index) return null;
            const record = metadataByKey[movieKey(film.title, film.year)];
            const thumbnail = record?.status === 'matched' ? [record.backdropUrl, record.posterUrl].find(url => url && !failedArtwork.has(url)) : null;
            return <button type="button" key={`${film.title}|${film.year}`} onClick={() => onSelectFilm(filmIndex)} aria-label={`View ${film.title} in dossier`}>
              {thumbnail ? <img src={thumbnail} alt="" onError={() => setFailedArtwork(previous => new Set([...previous, thumbnail]))} /> : null}
              <span>{film.title}<small>{film.year}</small></span>
            </button>;
          })}</div>
        </nav> : null}
        <div className="dossier-table">{lightTable}</div>
      </div>
    </dialog>
  );
}
