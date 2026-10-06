'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { apiFetch } from '../lib/api';
import {
  MAX_GUEST_FILMS, betweenCollision, betweenRequest, canMeet, cleanName, inviteUrl, sameSkies, skiesKey, skyNames, typedFilm,
  type BetweenFilm, type BetweenSide, type Skies,
} from '../lib/between';
import type { CollisionFilm, CollisionResult } from '../lib/collision';
import { fetchFilmEnrichment, persistableEnrichment } from '../lib/enrichment-client';
import { parseFilmSearchResults, type FilmSearchResult } from '../lib/film-search';
import { movieKey, type FilmEnrichment } from '../lib/movie-metadata';
import { formatRuntime } from '../lib/screening';
import { StarGlyph } from './celestial';
import type { CollisionState, CollisionWords } from './collision-chamber';

type Slot = { text: string; film: BetweenFilm | null };
const EMPTY: Slot[] = Array.from({ length: MAX_GUEST_FILMS }, () => ({ text: '', film: null }));
const GOLD = '#dec6a0';
const SILVER = '#9cbbb9';
/** Past this far along the slider, the two skies have met. */
const JOINED = 92;

/** What the room says when the film between you cannot be found. */
export const BETWEEN_WORDS: Partial<CollisionWords> = {
  locked: 'Unlock AFTERIMAGE first, then bring your skies together again.',
  busy: 'A reel, an Atlas or a collision is developing. Bring your skies together again once it is ready.',
  unstarted: 'AFTERIMAGE could not start looking just now. Try again in a moment.',
  relocked: 'Unlock AFTERIMAGE again to see the film between you.',
  expired: 'That search has expired. Bring your skies together again.',
  incomplete: 'The film between you came back incomplete. Try again.',
  unfinished: 'The film between you could not be found this time.',
  paused: 'The connection paused. Try again.',
};

function filmsOf(slots: Slot[]): BetweenFilm[] {
  return slots.flatMap(slot => { const film = slot.film ?? typedFilm(slot.text); return film ? [film] : []; });
}

function slotsOf(side: BetweenSide | undefined): Slot[] {
  return EMPTY.map((empty, index) => {
    const film = side?.films[index];
    return film ? { text: film.title, film: film.year ? film : null } : empty;
  });
}

/** One film: typed freely, or chosen from the catalogue so the year comes with it. */
function FilmField({ slot, index, canSearch, onChange, label, placeholder }: {
  slot: Slot; index: number; canSearch: boolean; onChange: (slot: Slot) => void; label: string; placeholder: string;
}) {
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
    <input id={id} type="text" autoComplete="off" maxLength={160} value={slot.text} placeholder={placeholder}
      role="combobox" aria-autocomplete="list" aria-expanded={shown.length > 0} aria-controls={`${id}-list`}
      onChange={event => { onChange({ text: event.target.value, film: null }); setOpen(true); }}
      onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 140)} />
    <ul id={`${id}-list`} role="listbox" className="between-suggestions" hidden={!shown.length}>
      {shown.map(result => <li key={result.id} role="option" aria-selected={false} onMouseDown={event => { event.preventDefault(); onChange({ text: result.title, film: { title: result.title, year: result.year } }); setOpen(false); }}>
        <strong>{result.title}</strong> <small>{result.year}</small></li>)}
    </ul>
  </div>;
}

function Side({ title, name, onName, slots, onSlots, canSearch, whose, fixed }: {
  title: string; name: string; onName: (name: string) => void; slots: Slot[]; onSlots: (slots: Slot[]) => void; canSearch: boolean;
  whose: 'you' | 'them';
  /** An invitation's films, shown as they were chosen. */
  fixed?: BetweenSide;
}) {
  const nameId = useId();
  if (fixed) return <fieldset className={`between-side is-${whose} is-fixed`}>
    <legend>{fixed.name || 'Your friend'}</legend>
    <ol>{fixed.films.map(film => <li key={`${film.title}|${film.year ?? ''}`}><strong>{film.title}</strong>{film.year ? <small>{film.year}</small> : null}</li>)}</ol>
    <p>Chosen before the link reached you.</p>
  </fieldset>;
  // Without the catalogue to search, the year has to be typed; it is what lets the skies meet.
  const first = canSearch ? `A film that stayed with ${whose}` : 'A film and its year';
  return <fieldset className={`between-side is-${whose}`}>
    <legend>{title}</legend>
    <label className="between-name" htmlFor={nameId}><span>Name <small>optional</small></span>
      <input id={nameId} type="text" autoComplete={whose === 'you' ? 'given-name' : 'off'} maxLength={24} value={name} placeholder="A first name" onChange={event => onName(event.target.value)} /></label>
    {slots.map((slot, index) => <FilmField key={index} slot={slot} index={index} canSearch={canSearch} label={`${title}: film ${index + 1}`}
      placeholder={index === 0 ? first : 'Another'}
      onChange={next => onSlots(slots.map((item, position) => position === index ? next : item))} />)}
  </fieldset>;
}

// Where each sky's three stars sit around its centre, as the page drew them.
const OURS: Array<[number, number]> = [[-60, -50], [-20, 30], [-90, 40]];
const THEIRS: Array<[number, number]> = [[60, -45], [25, 35], [90, 30]];
const HEIGHT = 250;
const MIDDLE = 116;
// A little dust for the sky they share, in the same places every time.
const DUST = Array.from({ length: 34 }, (_, index) => ({
  x: (index * 0.618034 + 0.07) % 1, y: (index * 0.754878 + 0.31) % 1, r: index % 5 === 0 ? 1.3 : 0.8, opacity: 0.16 + (index % 4) * 0.07,
}));
const ease = (value: number) => value < .5 ? 2 * value * value : 1 - (-2 * value + 2) ** 2 / 2;
const capital = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);
const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

type Phase = 'apart' | 'undated' | 'same' | 'offline' | 'developing' | 'failed' | 'found';

/** Two constellations, gold for you and silver for them, drifting together as the slider moves. */
function TwoSkies({ ours, theirs, names, pull, phase }: {
  ours: Array<BetweenFilm | null>; theirs: Array<BetweenFilm | null>; names: [string, string]; pull: number; phase: Phase;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const glow = useId();
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const element = frame.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([item]) => { if (item) setWidth(Math.max(280, Math.round(item.contentRect.width))); });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const together = ease(pull / 100);
  // Narrower than the page drew it, each sky draws in, so the names stay readable.
  const spread = Math.min(1, width / 600);
  const longest = width < 480 ? 16 : 22;
  const skies = [
    { key: 'ours', films: ours, offsets: OURS, x: width * (130 + together * 95) / 600, colour: GOLD, name: capital(names[0]) },
    { key: 'theirs', films: theirs, offsets: THEIRS, x: width * (470 - together * 95) / 600, colour: SILVER, name: capital(names[1]) },
  ];
  return <div className="between-skies" ref={frame} data-phase={phase}>
    <svg viewBox={`0 0 ${width} ${HEIGHT}`} width={width} height={HEIGHT} aria-hidden="true">
      <defs><radialGradient id={glow}><stop offset="0" stopColor={GOLD} stopOpacity=".55" /><stop offset=".45" stopColor={GOLD} stopOpacity=".18" /><stop offset="1" stopColor={GOLD} stopOpacity="0" /></radialGradient></defs>
      {DUST.map((star, index) => <circle key={index} className="between-dust" cx={star.x * width} cy={star.y * HEIGHT} r={star.r} opacity={star.opacity} />)}
      {skies.map(sky => {
        const points = sky.offsets.map(([x, y]) => ({ x: x * spread, y }));
        const lit = points.filter((_, index) => sky.films[index]);
        // Each title sits above or below its star; one that would touch another steps further out.
        const placed: Array<{ x: number; y: number; half: number }> = [];
        const labels = points.map((point, index) => {
          const film = sky.films[index];
          if (!film) return null;
          const text = film.title.length > longest ? `${film.title.slice(0, longest - 1).trimEnd()}…` : film.title;
          const half = text.length * 2.9;
          const x = clamp(sky.x + point.x, 4 + half, width - 4 - half) - sky.x;
          const below = point.y >= 0;
          let y = point.y + (below ? 19 : -11);
          while (placed.some(other => Math.abs(other.y - y) < 13 && Math.abs(other.x - x) < other.half + half + 6)) y += below ? 13 : -13;
          placed.push({ x, y, half });
          return { text, x, y };
        });
        const nameHalf = sky.name.length * 3.2;
        // Names never cross the middle, where the two skies meet.
        const nameX = sky.key === 'ours'
          ? clamp(sky.x, 4 + nameHalf, width / 2 - 6 - nameHalf) - sky.x
          : clamp(sky.x, width / 2 + 6 + nameHalf, width - 4 - nameHalf) - sky.x;
        const nameY = Math.max(92, ...placed.map(label => label.y + 18));
        return <g key={sky.key} className="between-sky" style={{ transform: `translate(${sky.x}px, ${MIDDLE}px)`, opacity: 1 - together * .45 }}>
          {lit.length > 1 ? <path d={`M${lit.map(point => `${point.x} ${point.y}`).join(' L')}${lit.length > 2 ? ' Z' : ''}`} fill={sky.colour} fillOpacity={0.06} stroke={sky.colour} strokeOpacity={0.5} /> : null}
          {points.map((point, index) => {
            const label = labels[index];
            if (!label) return <circle key={index} className="between-empty" cx={point.x} cy={point.y} r={4.5} stroke={sky.colour} />;
            return <g key={index}>
              <circle cx={point.x} cy={point.y} r={4.5} fill={sky.colour} />
              <text className="between-star-label" x={label.x} y={label.y} textAnchor="middle">{label.text}</text>
            </g>;
          })}
          <text className="between-sky-name" x={nameX} y={nameY} textAnchor="middle" fill={sky.colour}>{sky.name}</text>
        </g>;
      })}
      {pull > JOINED ? <g className="between-core" style={{ transform: `translate(${width / 2}px, ${MIDDLE}px)` }}>
        <circle className="between-halo" r={34} fill={`url(#${glow})`} />
        <circle r={7} fill="#f4efe5" />
      </g> : null}
    </svg>
  </div>;
}

/**
 * The Film Between Us: three films each, two skies that drift together, and the one
 * film in the overlap, with what it takes from each of you. Fill in both sides on one
 * screen, or send a link with your three and let them finish.
 */
export function BetweenUs({ opener, invite, brought, collision, canSearch, canAsk, metadata, savedKeys, onClose, onCollide, onWatch, onSave, onDevelop }: {
  opener: HTMLElement | null; invite: BetweenSide | null;
  /** The skies last brought together, and where finding the film between them got to. */
  brought: Skies | null; collision: CollisionState | null;
  canSearch: boolean;
  /** Whether AFTERIMAGE can be asked now. */
  canAsk: boolean;
  metadata: Record<string, FilmEnrichment>; savedKeys: Set<string>;
  onClose: () => void;
  onCollide: (skies: Skies) => void;
  /** Into the Lobby, with what the catalogue said about the film, so its running time is known there too. */
  onWatch: (film: CollisionResult['film'], opener: HTMLElement, record?: FilmEnrichment) => void;
  onSave: (film: CollisionFilm) => void;
  onDevelop: (request: { films: string[]; creativeBrief: string }) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // Reopened, the room shows the skies it last brought together.
  const seed = invite ? null : brought;
  const [ourName, setOurName] = useState(seed?.us.name ?? '');
  const [ours, setOurs] = useState<Slot[]>(() => slotsOf(seed?.us));
  const [theirName, setTheirName] = useState(seed?.them.name ?? '');
  const [theirs, setTheirs] = useState<Slot[]>(() => slotsOf(seed?.them));
  const [pull, setPull] = useState(() => ({ key: seed ? skiesKey(seed) : '', value: seed && collision ? 100 : 0 }));
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState('');
  const [art, setArt] = useState<Record<string, FilmEnrichment>>({});
  const asked = useRef('');
  const pullId = useId();
  const hintId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    requestAnimationFrame(() => heading.current?.focus());
    return () => { if (element?.open) element.close(); if (opener?.isConnected) opener.focus(); };
  }, [opener]);

  const us: BetweenSide = { name: ourName, films: filmsOf(ours) };
  const them: BetweenSide = invite ?? { name: theirName, films: filmsOf(theirs) };
  const skies: Skies = { us, them };
  const key = skiesKey(skies);
  // An invitation's films come first in a reel: the person who sent it began the evening.
  const request = invite ? betweenRequest(invite, us) : betweenRequest(us, them);
  const ready = canMeet(us, them);
  const ask = betweenCollision(skies);
  // Change a film and the skies part again; the last answer belongs to the skies that found it.
  const value = pull.key === key ? pull.value : 0;
  const joined = value > JOINED;
  const asking = sameSkies(brought, skies) ? collision : null;
  const result = asking?.status === 'complete' ? asking.result : undefined;
  const dated = (side: BetweenSide) => side.films.some(film => film.year);
  const phase: Phase = !joined ? 'apart'
    : asking?.status === 'failed' ? 'failed'
      : result ? 'found'
        : asking ? 'developing'
          : !ask ? (dated(us) && dated(them) ? 'same' : 'undated')
            : canAsk ? 'developing' : 'offline';

  function bring(next: number) {
    setPull({ key, value: next });
    if (next > JOINED && ask && canAsk && !asking && asked.current !== key) {
      asked.current = key;
      onCollide(skies);
    }
  }

  const found = result?.film;
  const foundKey = found ? movieKey(found.title, found.year) : '';
  useEffect(() => {
    if (!found || !canSearch || metadata[foundKey] || art[foundKey]) return;
    const controller = new AbortController();
    void fetchFilmEnrichment({ recommendations: [{ title: found.title, year: found.year }], signal: controller.signal })
      .then(records => { if (!controller.signal.aborted) setArt(current => ({ ...current, ...persistableEnrichment(records) })); })
      .catch(() => { /* The film's details are optional here, as everywhere. */ });
    return () => controller.abort();
    // The film's key is the trigger; the records only fill in its details.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foundKey, canSearch]);
  const record = foundKey ? metadata[foundKey] ?? art[foundKey] : undefined;
  const details = record?.status === 'matched' ? record : null;

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

  const [mine, yours] = skyNames(skies);
  const drawn = (slots: Slot[]) => slots.map(slot => slot.film ?? typedFilm(slot.text));
  const hint: Record<Phase, string> = {
    apart: ready ? 'Bring them all the way together to find the one film between you.' : 'Choose a film on each side, then bring your skies together.',
    undated: canSearch
      ? 'To find the one film, each side needs a film with its year: choose one from the suggestions, or type it like Aftersun 2022.'
      : 'To find the one film, each side needs a film with its year. Type it like Aftersun 2022.',
    same: 'You both chose the same film. Add another on either side, so there is somewhere between you to look.',
    offline: 'AFTERIMAGE isn’t connected, so it can’t look between your skies yet.',
    developing: asking?.draft ? `${asking.draft.title} is coming into focus. AFTERIMAGE checks it before it is final.` : 'Looking for the film that lives between your skies. You can close this; it keeps developing.',
    failed: asking?.error ?? BETWEEN_WORDS.unfinished!,
    found: found ? `The film between you: ${found.title}.` : '',
  };

  return <dialog ref={dialog} className="between-us" aria-labelledby="between-us-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="between-head">
      <p className="between-kicker"><StarGlyph />The film between us</p>
      <h2 id="between-us-title" ref={heading} tabIndex={-1}>{invite ? `${invite.name || 'Someone'} chose three films. Now choose yours.` : 'Choosing for two?'}</h2>
      <p>{invite ? 'Three films that stayed with you.' : 'Three films that stayed with each of you.'} Bring your skies together, and the film that lives in the overlap appears, with what it takes from each of you.</p>
      <button type="button" className="between-close" onClick={onClose} aria-label={phase === 'developing' ? 'Close; the film between you keeps developing' : 'Close'}>×</button>
    </header>
    <div className="between-body">
      <div className="between-sides">
        <Side title="You" whose="you" name={ourName} onName={setOurName} slots={ours} onSlots={setOurs} canSearch={canSearch} />
        <Side title="Them" whose="them" name={theirName} onName={setTheirName} slots={theirs} onSlots={setTheirs} canSearch={canSearch} fixed={invite ?? undefined} />
      </div>
      <section className="between-stage" aria-label="Your two skies">
        <TwoSkies ours={drawn(ours)} theirs={invite ? EMPTY.map((_, index) => invite.films[index] ?? null) : drawn(theirs)} names={[mine, yours]} pull={value} phase={phase} />
        <div className="between-pull">
          <label htmlFor={pullId}>Bring your skies together</label>
          <input id={pullId} type="range" min={0} max={100} value={value} disabled={!ready} aria-describedby={hintId}
            aria-valuetext={value === 0 ? 'Apart' : joined ? 'Together' : 'Drifting closer'} onChange={event => bring(Number(event.target.value))} />
        </div>
        <p id={hintId} className={`between-hint${phase === 'found' ? ' sr-only' : ''}`} role="status" data-phase={phase}>{hint[phase]}
          {phase === 'failed' ? <button type="button" disabled={!canAsk || !ask} onClick={() => { asked.current = key; onCollide(skies); }}>Try again</button> : null}</p>
        <div className={`between-result is-${phase}`} inert={phase !== 'found'}>
          <span className="between-eyebrow">The film between you</span>
          <p className="between-film">{found?.title ?? asking?.draft?.title ?? 'Somewhere in between'}</p>
          <p className="between-meta">{found
            ? [details?.directors.join(' & '), found.year, details?.runtime ? formatRuntime(details.runtime) : null].filter(Boolean).join(' · ')
            : asking?.draft?.year ?? 'One film for both of you'}</p>
          <div className="between-takes">
            <div className="is-ours"><b>From {mine}</b>{found?.fromFirst ?? 'What it takes from the films you chose.'}</div>
            <div className="is-theirs"><b>From {yours}</b>{found?.fromSecond ?? 'And what it takes from theirs.'}</div>
          </div>
          {found ? <>
            <p className="between-watch"><b>Watch for</b> {found.watchFor}</p>
            <div className="between-found-actions">
              <button type="button" className="is-primary" onClick={event => onWatch(found, event.currentTarget, record)}>Watch it together <span aria-hidden="true">↗</span></button>
              <button type="button" aria-pressed={savedKeys.has(foundKey)} onClick={() => onSave(found)}>{savedKeys.has(foundKey) ? 'Saved ✓' : 'Save for later +'}</button>
            </div>
          </> : null}
        </div>
      </section>
    </div>
    <footer className="between-actions">
      <button type="button" className="between-reel" disabled={!ready || !request} onClick={() => { if (request) onDevelop(request); }}>Or a whole reel between you <span aria-hidden="true">↗</span></button>
      {!invite ? <button type="button" className="between-share" disabled={!us.films.length} onClick={() => void share()}>Send them a link with your three</button> : null}
      {copied ? <p className="between-copied" role="status">{copied}</p> : null}
      {link ? <input className="between-link" readOnly value={link} aria-label="Invitation link" onFocus={event => event.currentTarget.select()} /> : null}
      <small>The link holds only {invite ? 'their' : 'your'} name and three films. Nothing is stored anywhere.</small>
    </footer>
  </dialog>;
}
