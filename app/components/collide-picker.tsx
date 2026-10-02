'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { sameFilm, type CollisionFilm } from '../lib/collision';
import { parseFilmSearchResults, type FilmSearchResult } from '../lib/film-search';
import { StarGlyph } from './celestial';

export type PartnerGroup = { label: string; films: CollisionFilm[] };

/**
 * "Collide with…": the second film comes from what is already close at hand (this
 * reel, your Likes, your watchlist) or from the catalogue. Choosing one starts the collision.
 */
export function CollidePicker({ film, opener, groups, canSearch, onChoose, onClose }: {
  film: CollisionFilm; opener: HTMLElement | null; groups: PartnerGroup[]; canSearch: boolean;
  onChoose: (partner: CollisionFilm) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FilmSearchResult[] | null>(null);
  const term = query.trim();

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => { if (element?.open) element.close(); if (opener?.isConnected) opener.focus(); };
  }, [opener]);

  useEffect(() => {
    if (!canSearch || term.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await apiFetch(`/api/films/search?q=${encodeURIComponent(term)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
        const payload: unknown = response.ok ? await response.json() : null;
        if (!controller.signal.aborted) setResults(payload && typeof payload === 'object' && 'films' in payload ? parseFilmSearchResults(payload.films).slice(0, 6) : []);
      } catch { if (!controller.signal.aborted) setResults([]); }
    }, 280);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [term, canSearch]);

  const seen = new Set<string>();
  const shown = groups.map(group => ({
    ...group,
    films: group.films.filter(candidate => {
      const key = `${candidate.title.toLocaleLowerCase()}|${candidate.year}`;
      if (sameFilm(candidate, film) || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 8),
  })).filter(group => group.films.length);
  const searched = term.length >= 2 ? (results ?? []).filter(candidate => !sameFilm(candidate, film)) : [];

  return <dialog ref={dialog} className="collide-picker" aria-labelledby="collide-picker-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header>
      <p className="collision-kicker"><StarGlyph />Collision</p>
      <h2 id="collide-picker-title">Collide <em>{film.title}</em> with…</h2>
      <button type="button" className="collision-close" onClick={onClose} aria-label="Close">×</button>
    </header>
    <p className="collide-picker-lede">Choose a second film. Claude finds the one film that lives between them.</p>
    {canSearch ? <label className="collide-picker-search">
      <span className="sr-only">Search the catalogue</span>
      <input type="search" value={query} autoComplete="off" maxLength={160} placeholder="Any film, e.g. Stalker" onChange={event => { setQuery(event.target.value); setResults(null); }} />
    </label> : null}
    {term.length >= 2 ? <section aria-label="From the catalogue">
      <h3>From the catalogue</h3>
      {results === null ? <p className="collide-picker-empty" role="status">Finding films…</p> : searched.length ? <ul>{searched.map(result => <li key={result.id}>
        <button type="button" onClick={() => onChoose({ title: result.title, year: result.year, tmdbId: result.id })}><strong>{result.title}</strong> <small>{result.year}</small><span aria-hidden="true">✕</span></button>
      </li>)}</ul> : <p className="collide-picker-empty" role="status">No films found. Try another title.</p>}
    </section> : null}
    {shown.map(group => <section key={group.label} aria-label={group.label}>
      <h3>{group.label}</h3>
      <ul>{group.films.map(candidate => <li key={`${candidate.title}|${candidate.year}`}>
        <button type="button" onClick={() => onChoose(candidate)}><strong>{candidate.title}</strong> <small>{candidate.year}</small><span aria-hidden="true">✕</span></button>
      </li>)}</ul>
    </section>)}
    {!shown.length && term.length < 2 ? <p className="collide-picker-empty">{canSearch ? 'Search for any film to collide with.' : 'Like or save a few films, and they will wait here as partners.'}</p> : null}
  </dialog>;
}
