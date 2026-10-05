'use client';

import { useState, type CSSProperties } from 'react';
import { FACET_KEYS, FACET_META } from '../lib/light-table';
import { movieKey, type FilmEnrichment } from '../lib/movie-metadata';
import type { RecommendationV2 } from '../lib/reel-state';
import { redact, secretsFor, spokenRedaction, veiledName, type Segment } from '../lib/blind';
import { formatRuntime } from '../lib/screening';
import { StarGlyph } from './celestial';

function Withheld({ segments, className }: { segments: Segment[]; className?: string }) {
  return <span className={className}>
    <span className="sr-only">{spokenRedaction(segments)}</span>
    <span aria-hidden="true">{segments.map((segment, index) => segment.hidden
      ? <span key={index} className="blind-bar" style={{ '--chars': Math.min(28, segment.text.length) } as CSSProperties} />
      : <span key={index}>{segment.text}</span>)}</span>
  </span>;
}

function Unveiled({ film, details, onWatch, onSave, saved, onLift, remaining }: {
  film: RecommendationV2; details: Extract<FilmEnrichment, { status: 'matched' }> | null;
  onWatch: (opener: HTMLElement) => void; onSave: () => void; saved: boolean; onLift: () => void; remaining: number;
}) {
  const [failed, setFailed] = useState(false);
  const image = details && !failed ? details.backdropUrl ?? details.posterUrl : null;
  return <div className="blind-unveiled">
    <span className="blind-iris" aria-hidden="true">{image ? <img src={image.replace('/w1280/', '/w780/')} alt="" onError={() => setFailed(true)} /> : <StarGlyph />}</span>
    <p className="blind-unveiled-kicker">You chose</p>
    <h3>{film.title}</h3>
    <p className="blind-unveiled-credits">{[film.year, details?.directors.join(', '), details?.runtime ? formatRuntime(details.runtime) : null].filter(Boolean).join(' · ')}</p>
    <div className="blind-unveiled-actions">
      <button type="button" className="is-primary" onClick={event => onWatch(event.currentTarget)}>Watch it tonight <span aria-hidden="true">↗</span></button>
      <button type="button" aria-pressed={saved} onClick={onSave}>{saved ? 'Saved ✓' : 'Save for later +'}</button>
      {remaining ? <button type="button" onClick={onLift}>Lift the veil on the other {remaining === 1 ? 'one' : remaining === 2 ? 'two' : remaining === 3 ? 'three' : 'four'}</button> : null}
    </div>
  </div>;
}

/**
 * Blind Screening: the reel, veiled. Each film is only what it is like, in the reel's
 * own words with every title, year and name drawn out. Choose on that alone.
 */
export function BlindTable({ films, metadata, revealed, savedKeys, onReveal, onLift, onWatch, onSave }: {
  films: RecommendationV2[]; metadata: Record<string, FilmEnrichment>; revealed: Set<string>; savedKeys: Set<string>;
  onReveal: (film: RecommendationV2, index: number) => void; onLift: () => void;
  onWatch: (film: RecommendationV2, opener: HTMLElement) => void; onSave: (film: RecommendationV2) => void;
}) {
  const reel = films.map(({ title, year }) => ({ title, year }));
  const remaining = films.filter(film => !revealed.has(movieKey(film.title, film.year))).length;
  return <section className="blind-table" aria-labelledby="blind-title">
    <header className="blind-head">
      <p className="blind-kicker"><StarGlyph />Blind screening</p>
      <h2 id="blind-title">Five films, unnamed</h2>
      <p>No titles, no posters, no years, no names: only what each film is like. Choose one on that alone, and the veil lifts on it.</p>
      <button type="button" className="blind-lift" onClick={onLift}>Lift the veil on all five</button>
    </header>
    <ol className="blind-cards">
      {films.map((film, index) => {
        const key = movieKey(film.title, film.year);
        const record = metadata[key];
        const details = record?.status === 'matched' ? record : null;
        if (revealed.has(key)) return <li key={key} className="blind-card is-unveiled">
          <span className="blind-numeral">{veiledName(index)}</span>
          <Unveiled film={film} details={details} saved={savedKeys.has(key)} remaining={remaining}
            onWatch={opener => onWatch(film, opener)} onSave={() => onSave(film)} onLift={onLift} />
        </li>;
        const secrets = secretsFor({ title: film.title, year: film.year, directors: details?.directors }, reel);
        return <li key={key} className="blind-card" style={{ '--i': index } as CSSProperties}>
          <span className="blind-numeral">{veiledName(index)}</span>
          {details?.runtime ? <span className="blind-runtime">{formatRuntime(details.runtime)}</span> : null}
          {film.facets ? <dl className="blind-qualities">{FACET_KEYS.map(channel => <div key={channel} className={FACET_META[channel].className}>
            <dt>{FACET_META[channel].label}</dt><dd><Withheld segments={redact(film.facets![channel].label, secrets)} /></dd>
          </div>)}</dl> : null}
          {film.watchFor ? <p className="blind-watch"><small>Watch for</small><Withheld segments={redact(film.watchFor, secrets)} /></p> : null}
          <p className="blind-reason"><Withheld segments={redact(film.reason, secrets)} /></p>
          <button type="button" className="blind-choose" onClick={() => onReveal(film, index)} aria-label={`Choose ${veiledName(index)}`}>Choose this one</button>
        </li>;
      })}
    </ol>
  </section>;
}
