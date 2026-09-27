'use client';

import { useEffect, useRef, useState } from 'react';
import { parseFilmSearchResults, type FilmSearchResult } from '../lib/film-search';
import type { AtlasInput } from '../lib/atlas';

type Props = { busy: boolean; connected: boolean; onDevelop: (film: AtlasInput['anchor'], opener: HTMLElement) => void };
type Lookup = { query: string; status: 'loading' | 'ready' | 'error'; films: FilmSearchResult[]; error?: string };

export function AtlasFilmSearch({ busy, connected, onDevelop }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<FilmSearchResult | null>(null);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const results = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const term = query.trim();
  const current = lookup?.query === term ? lookup : null;
  const showResults = open && !selected && term.length >= 2;

  useEffect(() => {
    if (term.length < 2 || selected) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLookup({ query: term, status: 'loading', films: [] });
      try {
        const response = await fetch(`/api/films/search?q=${encodeURIComponent(term)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
        if (!response.ok) throw new Error('Film search could not connect. Try again.');
        const raw = await response.json();
        if (!raw || typeof raw !== 'object' || !('films' in raw) || !Array.isArray(raw.films)) throw new Error('Film search returned an incomplete response. Try again.');
        if (!controller.signal.aborted) setLookup({ query: term, status: 'ready', films: parseFilmSearchResults(raw.films) });
      } catch {
        if (!controller.signal.aborted) setLookup({ query: term, status: 'error', films: [], error: 'Film search could not connect. Try again.' });
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [term, selected, revision]);

  return <section className="atlas-search" aria-labelledby="atlas-search-heading">
    <div className="atlas-search-intro"><h2 id="atlas-search-heading">Start a new Atlas</h2><p>Another film. A new set of connections.</p></div>
    <form role="search" aria-label="Find a film for a new Atlas" className="atlas-search-form"
      onSubmit={event => { event.preventDefault(); setOpen(true); if (selected) setSelected(null); setRevision(value => value + 1); }}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
      onKeyDown={event => {
        if (event.key === 'Escape' && showResults) { event.preventDefault(); event.stopPropagation(); input.current?.focus(); setOpen(false); }
      }}>
      <div className="atlas-search-controls">
        <div className="atlas-search-field">
          <label className="sr-only" htmlFor="atlas-film-query">Search for a film</label>
          <input ref={input} id="atlas-film-query" type="search" autoComplete="off" maxLength={160} value={query} placeholder="Find a film, e.g. Paris, Texas" aria-describedby="atlas-search-help"
            onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setSelected(null); setOpen(true); }}
            onKeyDown={event => { if (event.key === 'ArrowDown' && showResults) { const first = results.current?.querySelector('button'); if (first) { event.preventDefault(); first.focus(); } } }} />
          <button type="submit" aria-label="Search films" disabled={term.length < 2}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg></button>
        </div>
        <button type="button" className="atlas-search-develop" disabled={!selected || busy || !connected} onClick={event => { if (selected) { setOpen(false); onDevelop({ title: selected.title, year: selected.year, tmdbId: selected.id }, event.currentTarget); } }}>Develop Atlas <span aria-hidden="true">↗</span></button>
      </div>
      <p id="atlas-search-help" className="atlas-search-help" role="status">{busy ? 'An Atlas is developing. You can keep browsing.' : !connected ? 'Reconnect the film service from your reel to develop an Atlas.' : selected ? <>Ready to explore <strong>{selected.title} <span>({selected.year})</span></strong></> : 'Search for a film and select the right release.'}</p>
      {showResults ? <div className="atlas-search-results" ref={results} aria-label="Matching films">
        {!current || current.status === 'loading' ? <p role="status">Finding films…</p> : current.status === 'error' ? <div role="alert"><p>{current.error}</p><button type="button" className="atlas-search-retry" onClick={() => setRevision(value => value + 1)}>Try again</button></div> : current.films.length ? <>
          <p className="atlas-search-result-label">Choose your film <span>Results from TMDB</span></p>
          <ul>{current.films.map(film => <li key={film.id}><button type="button" aria-label={`Choose ${film.title} (${film.year})`} onClick={() => { setSelected(film); setQuery(film.title); setOpen(false); input.current?.focus(); }}>
            <span className="atlas-search-poster">{film.posterUrl ? <img src={film.posterUrl} alt="" loading="lazy" onError={event => { event.currentTarget.style.visibility = 'hidden'; }} /> : <span aria-hidden="true">{film.title.slice(0, 1)}</span>}</span><span><strong>{film.title}</strong><small>{film.year}</small></span><span className="atlas-search-pick" aria-hidden="true">+</span>
          </button></li>)}</ul>
        </> : <p role="status">No films found. Try another title or spelling.</p>}
      </div> : null}
    </form>
  </section>;
}
