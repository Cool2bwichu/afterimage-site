'use client';

import { useEffect, useRef, useState } from 'react';
import type { FilmEnrichment } from '../lib/movie-metadata';
import type { RecommendationV2 } from '../lib/reel-state';
import { type CinematicFacet, type FacetKey, type FacetSource, type SelectedFacets } from '../lib/light-table';
import '../reel-comparison.css';

export type ReelComparisonFilm = {
  recommendation: RecommendationV2;
  metadata?: FilmEnrichment;
  index: number;
};

export type ReelComparisonProps = {
  first: ReelComparisonFilm | null;
  second: ReelComparisonFilm | null;
  opener: HTMLElement | null;
  onClose: () => void;
  onSelect?: (index: number) => void;
  onBorrow?: (channel: FacetKey, facet: CinematicFacet, source: FacetSource, trigger: HTMLButtonElement) => void;
  selectedFacets?: SelectedFacets;
  facetDisabled?: boolean;
};

const channelNames: Record<FacetKey, string> = {
  whereItLives: 'Where it lives',
  howItFeels: 'How it feels',
  howItLooks: 'How it looks',
  howItSpeaks: 'How it speaks',
};
type ComparisonLens = 'why' | FacetKey;
const lenses: { key: ComparisonLens; label: string }[] = [
  { key: 'why', label: 'Why it fits' },
  { key: 'whereItLives', label: 'World' },
  { key: 'howItFeels', label: 'Feeling' },
  { key: 'howItLooks', label: 'Image' },
  { key: 'howItSpeaks', label: 'Voice' },
];

function runtimeLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

function FilmColumn({ film, position, lens, failed, onImageError, onSelect, onBorrow, selectedFacets, facetDisabled }: {
  film: ReelComparisonFilm;
  position: 1 | 2;
  lens: ComparisonLens;
  failed: Set<string>;
  onImageError: (url: string) => void;
  onSelect?: (index: number) => void;
  onBorrow?: ReelComparisonProps['onBorrow'];
  selectedFacets?: SelectedFacets;
  facetDisabled?: boolean;
}) {
  const { recommendation, metadata } = film;
  const matched = metadata?.status === 'matched' ? metadata : null;
  const backdrop = matched?.backdropUrl && !failed.has(matched.backdropUrl) ? matched.backdropUrl : null;
  const artwork = backdrop || (matched?.posterUrl && !failed.has(matched.posterUrl) ? matched.posterUrl : null);
  const facts = [recommendation.year, matched?.runtime ? runtimeLabel(matched.runtime) : null, matched?.directors.join(', ') || null].filter(Boolean);
  const facet = lens === 'why' ? null : recommendation.facets?.[lens];
  const chosen = lens === 'why' ? null : selectedFacets?.[lens];
  const isSelected = Boolean(facet && chosen?.source?.title === recommendation.title && chosen?.source?.year === recommendation.year && chosen.label === facet.label);

  return <article className="reel-compare-film" aria-labelledby={`reel-compare-film-${position}`}>
    <div className={`reel-compare-image${backdrop ? ' has-backdrop' : ''}${artwork ? '' : ' is-empty'}`}>
      {artwork ? <img src={artwork} alt="" onError={() => onImageError(artwork)} />
        : <span aria-hidden="true">{String(film.index + 1).padStart(2, '0')}</span>}
      <span className="reel-compare-image-label">Film {String(film.index + 1).padStart(2, '0')}</span>
    </div>
    <div className="reel-compare-identity">
      <h2 id={`reel-compare-film-${position}`}>{recommendation.title}</h2>
      <p className="reel-compare-facts">{facts.join(' · ')}</p>
    </div>
    <section className="reel-compare-lens-content" aria-label={`${lens === 'why' ? 'Why it fits' : channelNames[lens]}: ${recommendation.title}`}>
      {lens === 'why' ? <><h3>Why it belongs</h3><p>{recommendation.reason}</p></>
        : facet ? <><h3>{channelNames[lens]}</h3><strong>{facet.label}</strong><p>{facet.explanation}</p>
          {onBorrow ? <button className="reel-compare-borrow" type="button" disabled={facetDisabled} aria-pressed={isSelected}
            aria-label={`${isSelected ? 'Remove' : 'Borrow'} ${facet.label} from ${recommendation.title}`}
            onClick={event => onBorrow(lens, facet, { title: recommendation.title, year: recommendation.year }, event.currentTarget)}>{isSelected ? 'Kept ✓' : 'Borrow this quality +'}</button> : null}</>
          : <><h3>{channelNames[lens]}</h3><p>This saved reel has no quality note for this film.</p></>}
    </section>
    <div className="reel-compare-footer">{onSelect ? <button type="button" className="reel-compare-select" onClick={() => onSelect(film.index)}>Choose this film <span aria-hidden="true">↗</span></button> : null}</div>
  </article>;
}

export function ReelComparison({ first, second, opener, onClose, onSelect, onBorrow, selectedFacets, facetDisabled }: ReelComparisonProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [lens, setLens] = useState<ComparisonLens>('why');
  const isOpen = Boolean(first && second);

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [isOpen, opener]);

  if (!first || !second) return null;
  return <dialog ref={dialogRef} className="reel-compare" aria-labelledby="reel-compare-title"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="reel-compare-scroll">
      <header className="reel-compare-header">
        <div><span className="reel-compare-eyebrow">AFTERIMAGE / YOUR REEL</span><h1 id="reel-compare-title">Which way tonight?</h1><p>Two films from the same request. Choose the one that calls to you.</p></div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close film comparison">Back to your reel <span aria-hidden="true">×</span></button>
      </header>
      <nav className="reel-compare-lenses" aria-label="Compare the same aspect of both films">
        {lenses.map(item => <button key={item.key} type="button" aria-pressed={lens === item.key} onClick={() => setLens(item.key)}>{item.label}</button>)}
      </nav>
      <div className="reel-compare-grid">
        <FilmColumn film={first} position={1} lens={lens} failed={failed} onImageError={url => setFailed(current => new Set(current).add(url))} onSelect={onSelect} onBorrow={onBorrow} selectedFacets={selectedFacets} facetDisabled={facetDisabled} />
        <FilmColumn film={second} position={2} lens={lens} failed={failed} onImageError={url => setFailed(current => new Set(current).add(url))} onSelect={onSelect} onBorrow={onBorrow} selectedFacets={selectedFacets} facetDisabled={facetDisabled} />
      </div>
    </div>
  </dialog>;
}
