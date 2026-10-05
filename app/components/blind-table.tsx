'use client';

import { useState, type CSSProperties } from 'react';
import { FACET_KEYS, FACET_META } from '../lib/light-table';
import { movieKey, type FilmEnrichment } from '../lib/movie-metadata';
import type { RecommendationV2 } from '../lib/reel-state';
import { redact, secretsFor, spokenRedaction, type Segment } from '../lib/blind';
import { formatRuntime } from '../lib/screening';
import { StarGlyph } from './celestial';

function Withheld({ segments }: { segments: Segment[] }) {
  return <>
    <span className="sr-only">{spokenRedaction(segments)}</span>
    <span aria-hidden="true">{segments.map((segment, index) => segment.hidden
      ? <span key={index} className="blind-bar" style={{ '--chars': Math.min(28, segment.text.length) } as CSSProperties} />
      : <span key={index}>{segment.text}</span>)}</span>
  </>;
}

const WORDS = ['none', 'one', 'two', 'three', 'four', 'five'];
const count = (value: number) => WORDS[value] ?? String(value);

/**
 * Blind Screening: the reel arrives as moments, one at a time, with every title, year
 * and name drawn out of them. Say yes to a moment and the iris opens on what it was.
 */
export function BlindTable({ films, palette, metadata, revealed, savedKeys, onReveal, onLift, onWatch, onSave }: {
  films: RecommendationV2[]; palette: readonly string[]; metadata: Record<string, FilmEnrichment>; revealed: Set<string>; savedKeys: Set<string>;
  onReveal: (film: RecommendationV2, index: number) => void; onLift: () => void;
  onWatch: (film: RecommendationV2, opener: HTMLElement) => void; onSave: (film: RecommendationV2) => void;
}) {
  const isOpen = (film: RecommendationV2) => revealed.has(movieKey(film.title, film.year));
  const [current, setCurrent] = useState(() => Math.max(0, films.findIndex(film => !isOpen(film))));
  const index = Math.min(current, films.length - 1);
  const film = films[index];
  const key = movieKey(film.title, film.year);
  const record = metadata[key];
  const details = record?.status === 'matched' ? record : null;
  const open = isOpen(film);
  // The next moment you haven't said yes to yet, going round the reel.
  const after = films.map((_, step) => (index + 1 + step) % films.length).filter(position => position !== index).find(position => !isOpen(films[position]));
  const veiledCount = films.filter(item => !isOpen(item)).length;

  const secrets = secretsFor({ title: film.title, year: film.year, directors: details?.directors }, films.map(({ title, year }) => ({ title, year })));
  const scene = redact(film.watchFor || film.reason, secrets);
  const colours = palette.length ? palette : ['#2a3a4a', '#1a2430'];
  const light = { '--m1': colours[index % colours.length], '--m2': colours[(index + 2) % colours.length] } as CSSProperties;
  const still = details?.backdropUrl ? details.backdropUrl.replace('/w1280/', '/w780/') : null;

  return <section className="blind-reel" aria-labelledby="blind-title">
    <div className="blind-row">
      <h2 id="blind-title" className="blind-kicker"><StarGlyph />Tonight’s blind reel</h2>
      <span className="blind-count">{index + 1} of {films.length}</span>
    </div>
    <div aria-live="polite">
      <div key={key} className="blind-moment" data-open={open || undefined} style={light}>
        <div className="blind-front" aria-hidden={open || undefined}>
          <p className="blind-scene">“<Withheld segments={scene} />”</p>
          <dl className="blind-senses">
            {film.facets ? FACET_KEYS.map(channel => <div key={channel}>
              <dt>{FACET_META[channel].label}</dt><dd><Withheld segments={redact(film.facets![channel].label, secrets)} /></dd>
            </div>) : null}
            {details?.runtime ? <div><dt>Running time</dt><dd>{formatRuntime(details.runtime)}</dd></div> : null}
          </dl>
        </div>
        <div className="blind-reveal" style={still ? { '--still': `url("${still}")` } as CSSProperties : undefined} data-still={still ? '' : undefined}>
          {open ? <>
            <p className="blind-kicker">It was</p>
            <h3>{film.title}</h3>
            <p className="blind-meta">{[details?.directors.join(' & '), film.year, details?.runtime ? formatRuntime(details.runtime) : null].filter(Boolean).join(' · ')}</p>
            <p className="blind-why">{film.reason}</p>
          </> : null}
        </div>
      </div>
    </div>
    <div className="blind-actions">
      {open ? <>
        {after === undefined
          ? <button type="button" className="is-solid" onClick={onLift}>See the whole reel</button>
          : <button type="button" className="is-solid" onClick={() => setCurrent(after)}>Next moment</button>}
        <button type="button" className="is-quiet" aria-pressed={savedKeys.has(key)} onClick={() => onSave(film)}>{savedKeys.has(key) ? 'Saved for tonight' : 'Save for tonight'}</button>
        <button type="button" onClick={event => onWatch(film, event.currentTarget)}>Watch it tonight <span aria-hidden="true">↗</span></button>
      </> : <>
        <button type="button" className="is-solid" onClick={() => onReveal(film, index)}>I’d go in</button>
        <button type="button" className="is-quiet" onClick={() => setCurrent(after ?? (index + 1) % films.length)}>Show me another moment</button>
      </>}
    </div>
    {veiledCount ? <button type="button" className="blind-lift" onClick={onLift}>Lift the veil on {veiledCount === films.length ? `all ${count(veiledCount)}` : `the other ${count(veiledCount)}`}</button> : null}
  </section>;
}
