'use client';

import { useEffect, useRef } from 'react';
import type { FilmEnrichment } from '../lib/movie-metadata';
import { imdbUrl } from '../lib/movie-metadata';
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
  notInterested,
  onNotInterested,
  onClose,
}: {
  selection: DossierSelection | null;
  metadata?: FilmEnrichment;
  opener: HTMLElement | null;
  notInterested: boolean;
  onNotInterested: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!selection) return;
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
  }, [opener, selection]);

  if (!selection) return null;
  const { recommendation, index } = selection;
  const matched = metadata?.status === 'matched' ? metadata : null;
  const verifiedImdb = matched ? imdbUrl(matched.imdbId) : null;
  const facts = matched ? [
    matched.directors.length ? `Directed by ${matched.directors.join(', ')}` : '',
    matched.runtime ? runtimeLabel(matched.runtime) : '',
    matched.tmdbRating !== null ? `TMDB ${matched.tmdbRating.toFixed(1)} / 10` : '',
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
          <span>{index === 0 ? 'TOTAL SYNTHESIS' : `REEL ${String(index + 1).padStart(2, '0')}`}</span>
          <button ref={closeRef} type="button" onClick={() => dialogRef.current?.close()} aria-label="Close film dossier">×</button>
        </header>

        {matched?.posterUrl ? (
          <div className="dossier-poster"><img src={matched.posterUrl} alt={`${recommendation.title} poster`} /></div>
        ) : null}
        <div className="dossier-title-row">
          <h2 id="dossier-title">{recommendation.title}</h2>
          <span>{recommendation.year}</span>
        </div>
        {facts.length ? <p className="dossier-facts">{facts.join('  ·  ')}</p> : null}
        {matched?.overview ? <p className="dossier-overview">{matched.overview}</p> : null}

        <section className="dossier-note">
          <span>Why it belongs</span>
          <p>{recommendation.reason}</p>
        </section>
        <section className="dossier-note">
          <span>What to watch for</span>
          <p>{recommendation.watchFor || 'Program note unavailable for this saved reel.'}</p>
        </section>
        <div className="dossier-actions">
          {verifiedImdb ? (
            <a className="imdb-link" href={verifiedImdb} target="_blank" rel="noreferrer noopener">View verified IMDb page ↗</a>
          ) : null}
          <button className="not-interested-button" type="button" onClick={onNotInterested} disabled={notInterested}>
            {notInterested ? 'Not interested · saved' : 'Not interested'}
          </button>
        </div>
      </div>
    </dialog>
  );
}
