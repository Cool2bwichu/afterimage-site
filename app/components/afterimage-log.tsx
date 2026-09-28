'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { MAX_AFTERIMAGE_NOTE, localDate, type AfterimageDraft, type AfterimageEntry } from '../lib/afterimages';
import { FACET_KEYS, FACET_META, type FacetKey, type FacetMap } from '../lib/light-table';
import { StarGlyph } from './celestial';

export type AfterimageTarget = { title: string; year: string; tmdbId?: number; facets?: FacetMap };
export const CHANNEL_COLORS: Record<FacetKey, string> = { whereItLives: '#e8b34a', howItFeels: '#e5a29b', howItLooks: '#99c6b7', howItSpeaks: '#c3b0d1' };
const CHANNEL_PROMPTS: Record<FacetKey, string> = { whereItLives: 'Its world', howItFeels: 'Its feeling', howItLooks: 'Its images', howItSpeaks: 'Its voice' };

/**
 * After watching: what stayed with you? Four qualities, one night and one line.
 * The journal stays in this browser; only an explicit Like guides future reels.
 */
export function AfterimageLog({ target, opener, existing, liked, saved, onSave, onRemove, onClose }: {
  target: AfterimageTarget | null; opener: HTMLElement | null; existing?: AfterimageEntry; liked: boolean; saved: boolean;
  onSave: (draft: AfterimageDraft, options: { like: boolean; unsave: boolean }) => string | null;
  onRemove: () => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const noteId = useId();
  const today = localDate();
  const [watchedOn, setWatchedOn] = useState(existing?.watchedOn ?? today);
  const [stayed, setStayed] = useState<FacetKey[]>(existing?.stayed ?? []);
  const [note, setNote] = useState(existing?.note ?? '');
  const [like, setLike] = useState(!liked);
  const [unsave, setUnsave] = useState(saved);
  const [error, setError] = useState('');
  const open = Boolean(target);

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    heading.current?.focus();
    return () => { if (element?.open) element.close(); if (opener?.isConnected) opener.focus(); };
  }, [open, opener]);

  if (!target) return null;
  const label = (channel: FacetKey) => target.facets?.[channel].label ?? existing?.labels?.[channel];

  function submit() {
    if (!target) return;
    const labels = Object.fromEntries(stayed.flatMap(channel => { const text = label(channel); return text ? [[channel, text]] : []; })) as Partial<Record<FacetKey, string>>;
    const failure = onSave({ title: target.title, year: target.year, ...(target.tmdbId ? { tmdbId: target.tmdbId } : {}), watchedOn, stayed, ...(Object.keys(labels).length ? { labels } : {}), note }, { like: like && !liked, unsave: unsave && saved });
    if (failure) setError(failure); else onClose();
  }

  return <dialog ref={dialog} className="afterimage-log" aria-labelledby="afterimage-log-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <form method="dialog" onSubmit={event => { event.preventDefault(); submit(); }}>
      <header>
        <p className="afterimage-log-kicker"><StarGlyph />{existing ? 'Your afterimage' : 'After the film'}</p>
        <h2 id="afterimage-log-title" ref={heading} tabIndex={-1}>What stayed with you?</h2>
        <p className="afterimage-log-film">{target.title} <span>{target.year}</span></p>
        <button type="button" className="afterimage-log-close" onClick={onClose} aria-label="Close without saving">×</button>
      </header>
      <fieldset className="afterimage-log-qualities">
        <legend>Choose what lingered. Leave them all open if it was simply the whole film.</legend>
        <div>{FACET_KEYS.map(channel => <button type="button" key={channel} aria-pressed={stayed.includes(channel)} className={FACET_META[channel].className}
          style={{ '--channel': CHANNEL_COLORS[channel] } as CSSProperties}
          onClick={() => setStayed(current => current.includes(channel) ? current.filter(item => item !== channel) : FACET_KEYS.filter(item => item === channel || current.includes(item)))}>
          <i aria-hidden="true" /><span>{CHANNEL_PROMPTS[channel]}</span><strong>{label(channel) ?? FACET_META[channel].label}</strong>
        </button>)}</div>
      </fieldset>
      <div className="afterimage-log-fields">
        <label className="afterimage-log-date">Watched on<input type="date" required value={watchedOn} max={today} min="1880-01-01" onChange={event => setWatchedOn(event.target.value)} /></label>
        <label className="afterimage-log-note" htmlFor={noteId}>One line, for you <span>{note.length}/{MAX_AFTERIMAGE_NOTE}</span></label>
        <textarea id={noteId} value={note} maxLength={MAX_AFTERIMAGE_NOTE} rows={3} placeholder="A moment, an image, a sentence you keep hearing…" onChange={event => setNote(event.target.value)} />
      </div>
      <div className="afterimage-log-options">
        {!liked ? <label><input type="checkbox" checked={like} onChange={event => setLike(event.target.checked)} />Also Like it, so it gently guides future reels</label> : <p>Already in your Liked films.</p>}
        {saved ? <label><input type="checkbox" checked={unsave} onChange={event => setUnsave(event.target.checked)} />Move it out of your watchlist</label> : null}
      </div>
      {error ? <p className="afterimage-log-error" role="alert">{error}</p> : null}
      <footer>
        <button type="submit" className="afterimage-log-save">{existing ? 'Keep these changes' : 'Keep this afterimage'} <span aria-hidden="true">✦</span></button>
        {existing ? <button type="button" className="afterimage-log-remove" onClick={() => { onRemove(); onClose(); }}>Remove afterimage</button> : null}
        <small>Kept in this browser. Your notes are never sent anywhere; only a Like shapes recommendations.</small>
      </footer>
    </form>
  </dialog>;
}
