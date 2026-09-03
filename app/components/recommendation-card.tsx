'use client';

import { useState } from 'react';
import type { MouseEvent } from 'react';
import type { FilmEnrichment } from '../lib/movie-metadata';
import type { RecommendationV2 } from '../lib/reel-state';
import { FACET_KEYS, type CinematicFacet, type FacetKey, type FacetSource, type SelectedFacets } from '../lib/light-table';
import { FacetTab } from './facet-tab';

export function RecommendationCard({
  recommendation,
  index,
  metadata,
  enrichmentPending,
  onOpen,
  selectedFacets,
  onSelectFacet,
  facetDisabled = false,
}: {
  recommendation: RecommendationV2;
  index: number;
  metadata?: FilmEnrichment;
  enrichmentPending: boolean;
  onOpen: (event: MouseEvent<HTMLButtonElement>) => void;
  selectedFacets?: SelectedFacets;
  facetDisabled?: boolean;
  onSelectFacet?: (channel: FacetKey, facet: CinematicFacet, source: FacetSource, trigger: HTMLButtonElement) => void;
}) {
  const posterUrl = metadata?.status === 'matched' ? metadata.posterUrl : null;
  const [loadedPosterUrl, setLoadedPosterUrl] = useState<string | null>(null);
  const [failedPosterUrl, setFailedPosterUrl] = useState<string | null>(null);

  const showPoster = Boolean(posterUrl && failedPosterUrl !== posterUrl);
  const showPlaceholder = !showPoster && enrichmentPending && !metadata;

  return (
    <article className={`recommendation-card ${index === 0 ? 'is-primary' : ''} ${showPoster ? 'has-poster' : ''}`}>
      <button className="recommendation-card__button" type="button" onClick={onOpen} aria-label={`Open details for ${recommendation.title}`}>
        {showPoster || showPlaceholder ? (
          <div className={`poster-frame ${showPlaceholder ? 'is-loading' : ''}`} aria-hidden={showPlaceholder || undefined}>
            {showPoster ? (
              <img
                src={posterUrl || ''}
                alt={`${recommendation.title} poster`}
                loading="lazy"
                className={loadedPosterUrl === posterUrl ? 'is-loaded' : ''}
                onLoad={() => setLoadedPosterUrl(posterUrl)}
                onError={() => setFailedPosterUrl(posterUrl)}
              />
            ) : null}
          </div>
        ) : null}
        <div className="recommendation-copy">
          <div className="timecode">{index === 0 ? 'TOTAL SYNTHESIS' : `REEL ${String(index + 1).padStart(2, '0')}`} — {recommendation.timecode}</div>
          <h3>{recommendation.title}</h3>
          <div className="year">{recommendation.year}</div>
          <p>{recommendation.reason}</p>
          <div className="watch-for">
            <span>What to watch for</span>
            <p>{recommendation.watchFor || 'Program note unavailable for this saved reel.'}</p>
          </div>
          <span className="open-dossier">Open film dossier <b aria-hidden="true">↗</b></span>
        </div>
      </button>
      {recommendation.facets && onSelectFacet ? <div className="ai-facet-rail" role="group" aria-label={`Borrow qualities from ${recommendation.title}`}>
        {FACET_KEYS.map(channel => <FacetTab key={channel} channel={channel} facet={recommendation.facets![channel]}
          source={{title:recommendation.title,year:recommendation.year}} selected={selectedFacets?.[channel]} disabled={facetDisabled} onSelect={onSelectFacet} />)}
      </div> : null}
    </article>
  );
}
