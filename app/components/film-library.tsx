'use client';

import { useEffect, useRef, useState } from 'react';
import { movieKey } from '../lib/movie-metadata';
import { mergeLibraryBackup, type SavedFilm } from '../lib/library';
import type { LikedFilm } from '../lib/taste-profile';

export function FilmLibrary({ open, opener, onClose, watchlist, likes, onRemove, onUnlike, onImport, onExplore }: {
  open: boolean; opener: HTMLElement | null; onClose: () => void; watchlist: SavedFilm[]; likes: LikedFilm[];
  onRemove: (film: SavedFilm) => void; onUnlike: (film: LikedFilm) => void;
  onImport: (films: SavedFilm[]) => void; onExplore: (film: SavedFilm, opener: HTMLElement) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<'watchlist' | 'likes'>('watchlist');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    element?.showModal(); const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { element?.close(); document.body.style.overflow = overflow; if (opener?.isConnected) opener.focus(); };
  }, [open, opener]);
  function exportBackup() {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), watchlist }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'afterimage-watchlist.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (!open) return null;
  const films = (tab === 'watchlist' ? watchlist : likes).filter(film => `${film.title} ${film.year}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <dialog ref={dialog} className="film-library" aria-labelledby="library-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><div><p>Your collection</p><h2 id="library-title">The films you keep.</h2></div><button type="button" onClick={onClose} aria-label="Close library">Close ×</button></header>
    <div className="library-tabs" role="group" aria-label="Library collection"><button type="button" aria-pressed={tab === 'watchlist'} onClick={() => setTab('watchlist')}>Watchlist <span>{watchlist.length}</span></button><button type="button" aria-pressed={tab === 'likes'} onClick={() => setTab('likes')}>Liked films <span>{likes.length}</span></button></div>
    <p>{tab === 'watchlist' ? 'Films to return to. Saving one here does not change your taste profile.' : 'Films you have seen and loved. These gently inform future recommendations.'}</p>
    <label className="library-search">Find a saved film<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Title or year" /></label>
    {films.length ? <ul className="library-films">{films.map(film => <li key={movieKey(film.title, film.year)}><div><h3>{film.title}</h3><span>{film.year}</span></div><div><button type="button" onClick={event => onExplore(film, event.currentTarget)}>Explore connections</button><button type="button" onClick={() => tab === 'watchlist' ? onRemove(film) : onUnlike(film)} aria-label={`Remove ${film.title} from ${tab === 'watchlist' ? 'watchlist' : 'Likes'}`}>Remove</button></div></li>)}</ul> : <div className="library-empty"><h3>{query ? 'No films match that search.' : tab === 'watchlist' ? 'Leave a film here for another night.' : 'Your taste begins with a film you love.'}</h3><p>{query ? 'Try another title or year.' : 'Return to your reel to save or like a film.'}</p></div>}
    {tab === 'watchlist' ? <footer><p>Saved in this browser. Take a backup to keep a copy elsewhere.</p><div><button type="button" onClick={exportBackup} disabled={!watchlist.length}>Export watchlist</button><label className="library-import">Import backup<input type="file" accept="application/json,.json" onChange={async event => { const file = event.target.files?.[0]; if (!file) return; try { if (file.size > 256 * 1024) throw Error('This file is too large for a library backup.'); onImport(mergeLibraryBackup(JSON.parse(await file.text()), watchlist)); setError(''); } catch (reason) { setError(reason instanceof Error ? reason.message : 'The backup could not be read.'); } finally { event.target.value = ''; } }} /></label></div>{error ? <p role="alert">{error}</p> : null}</footer> : null}
  </dialog>;
}
