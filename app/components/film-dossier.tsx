'use client';

import { useEffect, useRef, useState } from 'react';
import type { FilmEnrichment } from '../lib/movie-metadata';
import { imdbUrl } from '../lib/movie-metadata';
import { FacetTab } from './facet-tab';
import { FACET_KEYS, type FacetKey, type CinematicFacet, type FacetSource, type SelectedFacets } from '../lib/light-table';
import type { RecommendationV2 } from '../lib/reel-state';

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
}: {
  selection: DossierSelection | null;
  metadata?: FilmEnrichment;
  opener: HTMLElement | null;
  selectedFacets?: SelectedFacets;
  onSelectFacet?: (channel: FacetKey, facet: CinematicFacet, source: FacetSource, trigger: HTMLButtonElement) => void;
  facetDisabled?: boolean;
  notInterested: boolean;
  onNotInterested: () => void;
  onClose: () => void;
}) {
  const [failedArtwork, setFailedArtwork] = useState<Set<string>>(() => new Set());
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const selectionKey = selection ? `${selection.recommendation.title}|${selection.recommendation.year}` : null;

  useEffect(() => {
    if (!selectionKey) return;
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
  }, [opener, selectionKey]);

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
      className="film-dossier"
      ref={dialogRef}
      aria-labelledby="dossier-title"
      onCancel={(event) => {
        event.preventDefault();
        event.currentTarget.close();
      }}
      onClose={onClose}
    >
      <div className="dossier-scroll">
        <header className="dossier-header">
          <span>{String(index + 1).padStart(2, '0')} / 05 · Film dossier</span>
          <button ref={closeRef} type="button" onClick={() => dialogRef.current?.close()} aria-label="Close film dossier">Back to reel ×</button>
        </header>

        <div className={`dossier-layout${backdrop ? ' has-backdrop' : ''}`}>
        {artwork ? (
          <div className={`dossier-poster${backdrop ? ' has-backdrop' : ''}`}><img src={artwork} alt={`${recommendation.title} ${backdrop ? 'backdrop' : 'poster'}`} onError={() => setFailedArtwork(previous => new Set([...previous, artwork]))} /></div>
        ) : null}
        <div className="dossier-copy"><div className="dossier-title-row">
          <h2 id="dossier-title">{recommendation.title}</h2>
          <span>{recommendation.year}</span>
        </div>
        {matched?.tmdbRating !== null && matched?.tmdbRating !== undefined ? (
          <p className="dossier-rating">TMDB RATING · {matched.tmdbRating.toFixed(1)} / 10</p>
        ) : null}
        {facts.length ? <p className="dossier-facts">{facts.join('  ·  ')}</p> : null}
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
        {recommendation.facets && onSelectFacet ? <section className="dossier-borrow" aria-label="Borrow a quality"><h3>Borrow a quality</h3><div className="ai-facet-rail">{FACET_KEYS.map(channel => <FacetTab key={channel} channel={channel} facet={recommendation.facets![channel]} source={{title:recommendation.title,year:recommendation.year}} selected={selectedFacets[channel]} disabled={facetDisabled} onSelect={onSelectFacet} />)}</div></section> : null}
        <div className="dossier-actions">
          {verifiedImdb ? (
            <a className="imdb-link" href={verifiedImdb} target="_blank" rel="noreferrer noopener">View verified IMDb page ↗</a>
          ) : null}
          <button className="not-interested-button" type="button" onClick={onNotInterested} disabled={notInterested}>
            {notInterested ? 'Not interested · saved' : 'Not interested'}
          </button>
        </div>
        </div></div>
      </div>
    </dialog>
  );
}
