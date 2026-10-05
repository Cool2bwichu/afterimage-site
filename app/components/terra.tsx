'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { fetchFilmEnrichment } from '../lib/enrichment-client';
import type { FilmEnrichment } from '../lib/movie-metadata';
import { TERRA_KEY, chartTerra, doorRequest, factsFromEnrichment, parseTerraCache, serializeTerraCache, type Door, type TerraFacts, type TerraFilm } from '../lib/terra';
import { StarGlyph } from './celestial';

/** How many films one visit may look up, five to a request. */
const LOOKUP_LIMIT = 60;
const DOOR_KIND: Record<Door['kind'], string> = { region: 'A part of the world', era: 'A time', form: 'A form' };

function readCache(): Record<string, TerraFacts> {
  try { return parseTerraCache(localStorage.getItem(TERRA_KEY)); } catch { return {}; }
}

/**
 * Terra Incognita: your sky shows where you have been, and this charts where you have
 * not. Films are placed by the catalogue's own record of where and when they were made;
 * each blank place is a door, and a door is an ordinary reel request.
 */
export function TerraIncognita({ films, knownArt, canLookUp, canDevelop, onDevelop }: {
  films: TerraFilm[]; knownArt: Record<string, FilmEnrichment>; canLookUp: boolean; canDevelop: boolean;
  onDevelop: (request: { films: string[]; creativeBrief: string }, opener: HTMLElement) => void;
}) {
  const [cache, setCache] = useState<Record<string, TerraFacts>>(readCache);
  const [looking, setLooking] = useState(0);
  const facts = useMemo(() => {
    const merged: Record<string, TerraFacts> = { ...cache };
    for (const film of films) {
      const known = factsFromEnrichment(knownArt[film.key]);
      if (known) merged[film.key] = known;
    }
    return merged;
  }, [cache, films, knownArt]);
  const chart = useMemo(() => chartTerra(films, facts), [films, facts]);

  // Films the page has never looked up are charted now, a few at a time, and remembered.
  useEffect(() => {
    if (!canLookUp) return;
    const missing = films.filter(film => !facts[film.key]).slice(0, LOOKUP_LIMIT);
    if (!missing.length) return;
    const controller = new AbortController();
    const kickoff = window.setTimeout(() => void (async () => {
      setLooking(missing.length);
      const found: Record<string, TerraFacts> = {};
      for (let start = 0; start < missing.length && !controller.signal.aborted; start += 5) {
        try {
          const records = await fetchFilmEnrichment({ recommendations: missing.slice(start, start + 5), signal: controller.signal });
          for (const record of records) { const known = factsFromEnrichment(record); if (known) found[record.key] = known; }
        } catch { break; }
        if (!controller.signal.aborted) setLooking(Math.max(0, missing.length - start - 5));
      }
      if (controller.signal.aborted) return;
      setLooking(0);
      if (!Object.keys(found).length) return;
      setCache(current => {
        const next = { ...current, ...found };
        try { localStorage.setItem(TERRA_KEY, serializeTerraCache(next)); } catch { /* The chart still draws for this visit. */ }
        return next;
      });
    })(), 0);
    return () => { window.clearTimeout(kickoff); controller.abort(); };
    // Only the films in the sky decide what to look up; new answers must not restart the walk.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canLookUp, films]);

  // A decade with one film shouldn't stand as tall as one you know well.
  const maxEra = Math.max(4, ...chart.eras.map(era => era.films.length));
  const develop = (door: Pick<Door, 'kind' | 'id'>, opener: HTMLElement) => onDevelop(doorRequest(door), opener);

  return <section className="terra" aria-labelledby="terra-title">
    <header className="terra-head">
      <p className="terra-kicker"><StarGlyph />Terra incognita</p>
      <h3 id="terra-title">Where your sky hasn’t reached</h3>
      <p>Every film you have met here, placed by where and when it was made. The blank places are doors.</p>
      <p className="terra-coverage" aria-live="polite">{chart.charted} of {chart.total} films charted{looking ? ` · charting ${looking} more…` : ''}{!canLookUp && chart.charted < chart.total ? ' · the rest can be charted once the film catalogue is reachable' : ''}</p>
    </header>

    {chart.doors.length ? <ul className="terra-doors" aria-label="Doors into the blank places">{chart.doors.map(door => <li key={`${door.kind}-${door.id}`}>
      <button type="button" disabled={!canDevelop} onClick={event => develop(door, event.currentTarget)}>
        <small>{DOOR_KIND[door.kind]}</small><strong>{door.title}</strong><span>{door.line}</span><em>Develop a reel there <span aria-hidden="true">↗</span></em>
      </button></li>)}</ul>
      : <p className="terra-young">{chart.total < 5 ? 'Your sky is still young. Its edges appear after a few more films.' : 'Your sky has reached every part of this chart. Few skies do.'}</p>}

    <div className="terra-world" role="list" aria-label="Parts of the world">
      {chart.regions.map(region => <div role="listitem" key={region.id} className={`terra-region${region.films.length ? ' is-reached' : ' is-blank'}`} style={{ gridArea: region.area } as CSSProperties}>
        <strong>{region.name}</strong>
        {region.films.length ? <>
          <span>{region.films.length} {region.films.length === 1 ? 'film' : 'films'}</span>
          <small>{region.films.slice(0, 3).map(film => film.title).join(' · ')}{region.films.length > 3 ? ' …' : ''}</small>
        </> : <>
          <span>Terra incognita</span>
          <button type="button" disabled={!canDevelop} onClick={event => develop({ kind: 'region', id: region.id }, event.currentTarget)} aria-label={`Develop a reel of films from ${region.name}`}>Go there <span aria-hidden="true">↗</span></button>
        </>}
      </div>)}
    </div>

    <div className="terra-time">
      <h4>When</h4>
      <ol className="terra-eras" aria-label="Films by decade">{chart.eras.map(era => <li key={era.id} className={era.films.length ? 'is-reached' : 'is-blank'} style={{ '--fill': era.films.length / maxEra } as CSSProperties}>
        {era.films.length ? <span className="terra-era-bar" aria-hidden="true" /> : <button type="button" disabled={!canDevelop} className="terra-era-bar" aria-label={`Develop a reel from ${era.label.replace(/^The/, 'the')}`} onClick={event => develop({ kind: 'era', id: era.id }, event.currentTarget)} />}
        <small>{era.short}</small><span className="sr-only">{era.label}: {era.films.length} {era.films.length === 1 ? 'film' : 'films'}</span>
      </li>)}</ol>
    </div>

    <div className="terra-forms-wrap">
      <h4>Forms</h4>
      <ul className="terra-forms">{chart.forms.map(form => <li key={form.genre}>{form.films.length
        ? <span className="is-reached">{form.name}<small>{form.films.length}</small></span>
        : <button type="button" disabled={!canDevelop} className="is-blank" onClick={event => develop({ kind: 'form', id: form.genre }, event.currentTarget)}>{form.name}<small>none yet</small></button>}</li>)}</ul>
    </div>
    <p className="terra-footnote">From TMDB’s records of production countries and genres. A co-production counts in each place it was made.</p>
  </section>;
}
