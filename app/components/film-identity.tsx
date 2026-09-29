'use client';

import { useEffect, useRef, useState } from 'react';
import { parseFilmSearchResults, type FilmSearchResult } from '../lib/film-search';
import { parseEnrichmentResponse, type FilmEnrichment } from '../lib/movie-metadata';
import { apiFetch } from '../lib/api';

/** Ambiguity stays visible until a viewer chooses a catalog record. */
export function FilmIdentity({ title, year, onResolve }: { title: string; year: string; onResolve: (film: FilmEnrichment) => void }) {
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<FilmSearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  async function search() {
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    setOpen(true); setBusy(true); setError('');
    try {
      const response = await apiFetch(`/api/films/search?q=${encodeURIComponent(title)}`, { signal: controller.signal });
      if (!response.ok) throw Error();
      const raw = await response.json();
      setChoices(parseFilmSearchResults(raw && typeof raw === 'object' && 'films' in raw ? raw.films : null));
    } catch { if (!controller.signal.aborted) setError('Film search is unavailable. Try again.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  async function choose(choice: FilmSearchResult) {
    setBusy(true); setError('');
    try {
      const response = await apiFetch('/api/films/enrich', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ films: [{ title, year, tmdbId: choice.id }] }), signal: abort.current?.signal });
      if (!response.ok) throw Error();
      const [film] = parseEnrichmentResponse(await response.json());
      if (film.status !== 'matched') { setError('This record does not verify the recommended title and release year. Choose another release.'); return; }
      onResolve(film); setOpen(false);
    } catch { if (!abort.current?.signal.aborted) setError('Details could not be verified. Try again.'); }
    finally { setBusy(false); }
  }
  return <div className="film-identity">
    <button type="button" onClick={() => open ? setOpen(false) : void search()} aria-expanded={open}>{open ? 'Close film lookup' : 'Find the correct film artwork'}</button>
    {open ? <div className="film-identity-choices">
      <p>Choose the matching release. Its identity will be verified before attaching imagery.</p>
      {busy ? <p role="status">Checking film records…</p> : null}
      {error ? <p role="alert">{error} <button type="button" onClick={() => void search()}>Retry search</button></p> : null}
      {!busy && !error && !choices.length ? <p>No matching records were found.</p> : null}
      {choices.map(film => <button type="button" key={film.id} disabled={busy} onClick={() => void choose(film)}>
        {film.posterUrl ? <img src={film.posterUrl} alt="" loading="lazy" /> : null}
        <span><strong>{film.title} ({film.year})</strong>{film.overview ? <small>{film.overview}</small> : null}</span>
      </button>)}
    </div> : null}
  </div>;
}
