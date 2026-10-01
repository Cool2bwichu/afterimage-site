'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { movieKey } from '../lib/movie-metadata';
import { mergeLibraryBackup, type SavedFilm } from '../lib/library';
import type { LikedFilm } from '../lib/taste-profile';
import { journalOrder, type AfterimageEntry } from '../lib/afterimages';
import { FACET_META } from '../lib/light-table';
import type { LibraryTab } from '../lib/navigation';
import { CHANNEL_COLORS } from './afterimage-log';
import { StarGlyph } from './celestial';
import { saveFile } from '../lib/save-file';

const INTRO: Record<LibraryTab, string> = {
  watchlist: 'Films to return to. Saving one here does not change your taste profile.',
  likes: 'Films you have seen and loved. These gently inform future recommendations.',
  afterimages: 'What stayed with you after the lights came up. Your notes stay in this browser and are never sent anywhere.',
};

export function FilmLibrary({ open, opener, onClose, watchlist, likes, afterimages, onRemove, onUnlike, onImport, onExplore, onEditAfterimage, onRemoveAfterimage, tab, onTabChange }: {
  open: boolean; opener: HTMLElement | null; onClose: () => void; watchlist: SavedFilm[]; likes: LikedFilm[]; afterimages: AfterimageEntry[];
  tab: LibraryTab; onTabChange: (tab: LibraryTab) => void;
  onRemove: (film: SavedFilm) => void; onUnlike: (film: LikedFilm) => void;
  onImport: (films: SavedFilm[]) => void; onExplore: (film: SavedFilm, opener: HTMLElement) => void;
  onEditAfterimage: (entry: AfterimageEntry, opener: HTMLElement) => void; onRemoveAfterimage: (entry: AfterimageEntry) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
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
    void saveFile('afterimage-watchlist.json', blob).catch(() => {});
  }
  if (!open) return null;
  const search = query.toLocaleLowerCase();
  const films = (tab === 'watchlist' ? watchlist : likes).filter(film => `${film.title} ${film.year}`.toLocaleLowerCase().includes(search));
  const entries = journalOrder(afterimages).filter(entry => `${entry.title} ${entry.year} ${entry.note}`.toLocaleLowerCase().includes(search));
  const hasResults = tab === 'afterimages' ? entries.length > 0 : films.length > 0;
  return <dialog ref={dialog} className="film-library" aria-labelledby="library-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><div><p>Your collection</p><h2 id="library-title">The films you keep.</h2></div><button type="button" onClick={onClose} aria-label="Close library">Close ×</button></header>
    <div className="library-tabs" role="group" aria-label="Library collection">
      <button type="button" aria-pressed={tab === 'watchlist'} onClick={() => onTabChange('watchlist')}>Saved films <span>{watchlist.length}</span></button>
      <button type="button" aria-pressed={tab === 'likes'} onClick={() => onTabChange('likes')}>Liked films <span>{likes.length}</span></button>
      <button type="button" aria-pressed={tab === 'afterimages'} onClick={() => onTabChange('afterimages')}>Afterimages <span>{afterimages.length}</span></button>
    </div>
    <p>{INTRO[tab]}</p>
    <label className="library-search">{tab === 'afterimages' ? 'Find an afterimage' : 'Find a saved film'}<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={tab === 'afterimages' ? 'Title, year or a word you wrote' : 'Title or year'} /></label>
    {hasResults && tab !== 'afterimages' ? <ul className="library-films">{films.map(film => <li key={movieKey(film.title, film.year)}><div><h3>{film.title}</h3><span>{film.year}</span></div><div><button type="button" onClick={event => onExplore(film, event.currentTarget)}>Explore connections</button><button type="button" onClick={() => tab === 'watchlist' ? onRemove(film) : onUnlike(film)} aria-label={`Remove ${film.title} from ${tab === 'watchlist' ? 'watchlist' : 'Likes'}`}>Remove</button></div></li>)}</ul> : null}
    {hasResults && tab === 'afterimages' ? <ol className="library-films library-afterimages">{entries.map(entry => <li key={movieKey(entry.title, entry.year)}>
      <div><h3><StarGlyph />{entry.title}</h3><span>{entry.year} · Watched {new Date(`${entry.watchedOn}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        <p className="library-afterimage-qualities">{entry.stayed.length ? entry.stayed.map(channel => <em key={channel} style={{ '--channel': CHANNEL_COLORS[channel] } as CSSProperties}>{entry.labels?.[channel] ?? FACET_META[channel].label}</em>) : <em>The whole film</em>}</p>
        {entry.note ? <blockquote>{entry.note}</blockquote> : null}</div>
      <div><button type="button" onClick={event => onEditAfterimage(entry, event.currentTarget)}>Revisit</button><button type="button" onClick={event => onExplore(entry, event.currentTarget)}>Explore connections</button><button type="button" onClick={() => onRemoveAfterimage(entry)} aria-label={`Remove the afterimage of ${entry.title}`}>Remove</button></div>
    </li>)}</ol> : null}
    {!hasResults ? <div className="library-empty"><h3>{query ? 'Nothing matches that search.' : tab === 'watchlist' ? 'Leave a film here for another night.' : tab === 'likes' ? 'Your taste begins with a film you love.' : 'No afterimages yet.'}</h3><p>{query ? 'Try another title, year or word.' : tab === 'afterimages' ? 'After you watch a film, find it in your sky or its notes and log what stayed with you.' : 'Return to your reel to save or like a film.'}</p></div> : null}
    {tab === 'watchlist' ? <footer><p>Saved in this browser. Take a backup to keep a copy elsewhere.</p><div><button type="button" onClick={exportBackup} disabled={!watchlist.length}>Export watchlist</button><label className="library-import">Import backup<input type="file" accept="application/json,.json" onChange={async event => { const file = event.target.files?.[0]; if (!file) return; try { if (file.size > 256 * 1024) throw Error('This file is too large for a library backup.'); onImport(mergeLibraryBackup(JSON.parse(await file.text()), watchlist)); setError(''); } catch (reason) { setError(reason instanceof Error ? reason.message : 'The backup could not be read.'); } finally { event.target.value = ''; } }} /></label></div>{error ? <p role="alert">{error}</p> : null}</footer> : null}
  </dialog>;
}
