'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import { MAX_GUEST_FILMS, betweenRequest, canMeet, cleanName, inviteUrl, type BetweenFilm, type BetweenSide } from '../lib/between';
import type { Evening } from '../lib/evening';
import { parseFilmSearchResults, type FilmSearchResult } from '../lib/film-search';
import { StarGlyph } from './celestial';
import { EveningPicker } from './evening-picker';

type Slot = { text: string; film: BetweenFilm | null };
const EMPTY: Slot[] = Array.from({ length: MAX_GUEST_FILMS }, () => ({ text: '', film: null }));

function filmsOf(slots: Slot[]): BetweenFilm[] {
  return slots.flatMap(slot => slot.film ? [slot.film] : slot.text.trim() ? [{ title: slot.text.trim() }] : []);
}

/** One film: typed freely, or chosen from the catalogue so the year comes with it. */
function FilmField({ slot, index, canSearch, onChange, label }: { slot: Slot; index: number; canSearch: boolean; onChange: (slot: Slot) => void; label: string }) {
  const [results, setResults] = useState<FilmSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const id = useId();
  const term = slot.film ? '' : slot.text.trim();
  useEffect(() => {
    if (!canSearch || term.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await apiFetch(`/api/films/search?q=${encodeURIComponent(term)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
        if (!response.ok) return;
        const payload: unknown = await response.json();
        if (!controller.signal.aborted) setResults(payload && typeof payload === 'object' && 'films' in payload ? parseFilmSearchResults(payload.films).slice(0, 4) : []);
      } catch { /* What was typed still counts. */ }
    }, 280);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [term, canSearch]);
  const shown = open && term.length >= 2 ? results : [];
  if (slot.film?.year) return <div className="between-chosen">
    <span className="between-number" aria-hidden="true">{index + 1}</span>
    <span><strong>{slot.film.title}</strong> <small>{slot.film.year}</small></span>
    <button type="button" aria-label={`Remove ${slot.film.title}`} onClick={() => onChange({ text: '', film: null })}>×</button>
  </div>;
  return <div className="between-field">
    <span className="between-number" aria-hidden="true">{index + 1}</span>
    <label className="sr-only" htmlFor={id}>{label}</label>
    <input id={id} type="text" autoComplete="off" maxLength={160} value={slot.text} placeholder={index === 0 ? 'A film you love' : 'Another'}
      role="combobox" aria-autocomplete="list" aria-expanded={shown.length > 0} aria-controls={`${id}-list`}
      onChange={event => { onChange({ text: event.target.value, film: null }); setOpen(true); }}
      onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 140)} />
    <ul id={`${id}-list`} role="listbox" className="between-suggestions" hidden={!shown.length}>
      {shown.map(result => <li key={result.id} role="option" aria-selected={false} onMouseDown={event => { event.preventDefault(); onChange({ text: result.title, film: { title: result.title, year: result.year } }); setOpen(false); }}>
        <strong>{result.title}</strong> <small>{result.year}</small></li>)}
    </ul>
  </div>;
}

function Side({ title, name, onName, slots, onSlots, canSearch, fixed }: {
  title: string; name: string; onName: (name: string) => void; slots: Slot[]; onSlots: (slots: Slot[]) => void; canSearch: boolean;
  /** An invitation's films, shown as they were chosen. */
  fixed?: BetweenSide;
}) {
  const nameId = useId();
  if (fixed) return <fieldset className="between-side is-fixed">
    <legend>{fixed.name || 'Your friend'}</legend>
    <ol>{fixed.films.map(film => <li key={`${film.title}|${film.year ?? ''}`}><strong>{film.title}</strong>{film.year ? <small>{film.year}</small> : null}</li>)}</ol>
    <p>Chosen before the link reached you.</p>
  </fieldset>;
  return <fieldset className="between-side">
    <legend>{title}</legend>
    <label className="between-name" htmlFor={nameId}><span>Name <small>optional</small></span>
      <input id={nameId} type="text" autoComplete="given-name" maxLength={24} value={name} placeholder="A first name" onChange={event => onName(event.target.value)} /></label>
    {slots.map((slot, index) => <FilmField key={index} slot={slot} index={index} canSearch={canSearch} label={`${title}: film ${index + 1}`}
      onChange={next => onSlots(slots.map((item, position) => position === index ? next : item))} />)}
  </fieldset>;
}

/**
 * The Film Between Us: three films each, and the films that give both of you something.
 * Fill in both sides on one screen, or send a link with your three and let them finish.
 */
export function BetweenUs({ opener, invite, canSearch, onClose, onDevelop }: {
  opener: HTMLElement | null; invite: BetweenSide | null; canSearch: boolean; onClose: () => void;
  onDevelop: (request: { films: string[]; creativeBrief: string }) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [ourName, setOurName] = useState('');
  const [ours, setOurs] = useState<Slot[]>(EMPTY);
  const [theirName, setTheirName] = useState('');
  const [theirs, setTheirs] = useState<Slot[]>(EMPTY);
  const [evening, setEvening] = useState<Evening | null>(null);
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    requestAnimationFrame(() => heading.current?.focus());
    return () => { if (element?.open) element.close(); if (opener?.isConnected) opener.focus(); };
  }, [opener]);

  const us: BetweenSide = { name: ourName, films: filmsOf(ours) };
  const them: BetweenSide = invite ?? { name: theirName, films: filmsOf(theirs) };
  // An invitation's films come first: the person who sent it began the evening.
  const request = invite ? betweenRequest(invite, us, evening) : betweenRequest(us, them, evening);
  const ready = invite ? canMeet(invite, us) : canMeet(us, them);

  async function share() {
    const url = inviteUrl(location.href, us);
    setLink(url);
    setCopied('');
    const text = `${cleanName(ourName) || 'I'} chose three films. Choose yours, and AFTERIMAGE will find the film between us.`;
    try {
      if (navigator.share && window.matchMedia('(pointer: coarse)').matches) { await navigator.share({ title: 'The film between us', text, url }); return; }
      await navigator.clipboard.writeText(url);
      setCopied('Link copied. Send it however you like.');
    } catch { setCopied('Copy the link below and send it however you like.'); }
  }

  return <dialog ref={dialog} className="between-us" aria-labelledby="between-us-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="between-head">
      <p className="between-kicker"><StarGlyph />The film between us</p>
      <h2 id="between-us-title" ref={heading} tabIndex={-1}>{invite ? `${invite.name || 'Someone'} chose three films. Now choose yours.` : 'Choosing for two?'}</h2>
      <p>{invite ? 'Three films you love, and AFTERIMAGE finds the ones that give you both something.' : 'Three films each. AFTERIMAGE finds the ones that give you both something, and says what each of you will find in them.'}</p>
      <button type="button" className="between-close" onClick={onClose} aria-label="Close">×</button>
    </header>
    <div className="between-sides">
      <Side title="You" name={ourName} onName={setOurName} slots={ours} onSlots={setOurs} canSearch={canSearch} />
      <span className="between-meet" aria-hidden="true"><i /></span>
      <Side title="Them" name={theirName} onName={setTheirName} slots={theirs} onSlots={setTheirs} canSearch={canSearch} fixed={invite ?? undefined} />
    </div>
    <footer className="between-actions">
      <EveningPicker name="between-evening" value={evening} onChange={setEvening} />
      <button type="button" className="between-develop" disabled={!ready || !request} onClick={() => { if (request) onDevelop(request); }}>Find the films between us <span aria-hidden="true">↗</span></button>
      {!invite ? <button type="button" className="between-share" disabled={!us.films.length} onClick={() => void share()}>Or send them a link with your three</button> : null}
      {copied ? <p className="between-copied" role="status">{copied}</p> : null}
      {link ? <input className="between-link" readOnly value={link} aria-label="Invitation link" onFocus={event => event.currentTarget.select()} /> : null}
      <small>The link holds only {invite ? 'their' : 'your'} name and three films. Nothing is stored anywhere.</small>
    </footer>
  </dialog>;
}
