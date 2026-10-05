'use client';

import { useEffect, useId, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { MAX_AFTERIMAGE_NOTE, localDate, type AfterimageDraft } from '../lib/afterimages';
import { CHECKPOINTS } from '../lib/half-life';
import { FACET_KEYS, type FacetKey } from '../lib/light-table';
import { movieKey } from '../lib/movie-metadata';
import {
  INTERMISSION_MINUTES, RITUAL_LEAD_MS, RITUAL_STEP_MS, addToProgramme, creditsRollAt, formatClock, formatCountdown, formatRuntime, hasKnownRuntimes,
  inRitual, lightsDown, programmeMinutes, removeFromProgramme, ritual, screeningPhase, skipAhead, type ProgrammeFilm, type Screening, type ScreeningPhase,
} from '../lib/screening';
import { ordinal } from '../lib/ticket';
import { notifyAway } from './charting';
import { StarGlyph } from './celestial';
import { TicketStub, type StubEntry } from './ticket-stub';

type PhaseKind = ScreeningPhase['kind'];
const PLAIN: Record<FacetKey, string> = { whereItLives: 'its world', howItFeels: 'its feeling', howItLooks: 'its images', howItSpeaks: 'its voice' };
// "tomorrow, in a week, in a month and in three months"
const ASKS = CHECKPOINTS.map(checkpoint => checkpoint.days === 1 ? 'tomorrow' : `in ${checkpoint.since}`);
const ASKING = `${ASKS.slice(0, -1).join(', ')} and ${ASKS.at(-1)}`;

function Poster({ film }: { film: ProgrammeFilm }) {
  const [failed, setFailed] = useState(false);
  const source = film.posterUrl && !failed ? film.posterUrl : null;
  return <span className="lobby-poster" aria-hidden="true">{source ? <img src={source} alt="" decoding="async" onError={() => setFailed(true)} /> : <span>{film.title.slice(0, 1)}</span>}</span>;
}

const billing = (film: ProgrammeFilm) => [film.directors?.join(' & '), film.year, film.runtime ? formatRuntime(film.runtime) : null].filter(Boolean).join(' · ');

/**
 * The Lobby: once a film is chosen, Afterimage walks you into the cinema. The lights go
 * down, a short ritual sets the room, then the site goes quiet for the film's running
 * time. When the lights come up the usher is waiting with one question, and the answer
 * prints the ticket stub that starts the film's half-life.
 */
export function Lobby({ screening, open, opener, candidates, kept, count, onOpen, onStepOut, onChange, onKeep }: {
  screening: Screening; open: boolean; opener: HTMLElement | null;
  /** Films that could join as the second half of a double feature. */
  candidates: ProgrammeFilm[];
  /** Films already kept in the journal, by movie key. */
  kept: Set<string>;
  /** How many films the journal holds: the next stub is one more. */
  count: number;
  onOpen: () => void; onStepOut: () => void;
  /** The next state of the evening; null ends it. */
  onChange: (next: Screening | null) => void;
  /** Keeps what stayed in the journal; a message when it could not. */
  onKeep: (draft: AfterimageDraft) => string | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const [clock, setClock] = useState(true);
  const [printed, setPrinted] = useState<{ entry: StubEntry; number: number } | null>(null);
  const phase = screeningPhase(screening, now);
  const films = screening.films;
  const playing = phase.kind === 'showing' || phase.kind === 'intermission' ? phase.index : -1;
  const steps = ritual(films, new Date(screening.lightsDownAt ? Date.parse(screening.lightsDownAt) : now).getHours());
  const settling = phase.kind === 'showing' && phase.index === 0 && inRitual(screening, steps.length, now);
  const room: PhaseKind | 'ritual' = settling ? 'ritual' : phase.kind;
  const dark = !settling && (phase.kind === 'showing' || phase.kind === 'intermission') ? phase : null;

  // The clock only ticks by the second while something is showing.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), phase.kind === 'showing' || phase.kind === 'intermission' ? 1000 : 15_000);
    return () => window.clearInterval(timer);
  }, [phase.kind]);
  // A change made here (lights down, the film's over) is read at once, not on the next tick.
  useEffect(() => { const timer = window.setTimeout(() => setNow(Date.now()), 0); return () => window.clearTimeout(timer); }, [screening]);

  // The usher comes to find you: at the intermission and when the credits roll.
  const previous = useRef<PhaseKind>(phase.kind);
  useEffect(() => {
    const before = previous.current;
    previous.current = phase.kind;
    if (before === phase.kind) return;
    if (before === 'showing' && phase.kind === 'intermission') notifyAway('Intermission', `${INTERMISSION_MINUTES} minutes, then ${films[1]?.title ?? 'the second film'}.`, 'afterimage-screening');
    if ((before === 'showing' || before === 'intermission') && phase.kind === 'credits') {
      notifyAway('The lights are up', `${films.at(-1)?.title ?? 'The film'} is over. What's left?`, 'afterimage-screening');
      onOpen();
    }
  }, [phase.kind, films, onOpen]);

  useEffect(() => {
    const element = dialog.current;
    if (!open || !element) return;
    if (!element.open) element.showModal();
    heading.current?.focus({ preventScroll: true });
    return () => { if (element.open) element.close(); if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, [open, opener]);
  // Each new room of the evening takes the focus, so a screen reader hears where it is.
  useEffect(() => { if (open) heading.current?.focus({ preventScroll: true }); }, [open, room, printed]);

  // The tab says what is on, so a glance at it is enough.
  const tabTitle = phase.kind === 'showing' ? `● Now showing: ${films[phase.index].title}` : phase.kind === 'intermission' ? '● Intermission · AFTERIMAGE' : null;
  useEffect(() => {
    if (!tabTitle) return;
    const original = document.title;
    document.title = tabTitle;
    return () => { if (document.title === tabTitle) document.title = original; };
  }, [tabTitle]);

  const seat = !open && (phase.kind === 'showing' || phase.kind === 'intermission');
  const unknownRuntime = !hasKnownRuntimes(films);
  // The usher asks about each film of the evening in turn, skipping any already kept.
  const asking = films.find(film => !kept.has(movieKey(film.title, film.year)));
  const watchedOn = localDate(screening.lightsDownAt ? new Date(screening.lightsDownAt) : new Date(now));

  return <>
    {seat ? <button type="button" className="lobby-seat" onClick={onOpen}>
      <i aria-hidden="true" /><span>{phase.kind === 'showing' ? 'Now showing' : 'Intermission'}</span><strong>{films[playing]?.title}</strong><em>Back to your seat</em>
    </button> : null}
    <dialog ref={dialog} className="lobby" data-phase={phase.kind} data-room={room} aria-labelledby="lobby-title"
      onCancel={event => { event.preventDefault(); if (phase.kind === 'lobby') onChange(null); else if (phase.kind === 'credits') onChange(null); else onStepOut(); }}>
      <div className="lobby-house" aria-hidden="true" />

      {room === 'lobby' ? <div className="lobby-room">
        {films.length === 1 ? <div className="lobby-tonight">
          <Poster film={films[0]} />
          <div className="lobby-billing">
            <p className="lobby-kicker">Tonight</p>
            <h2 id="lobby-title" ref={heading} tabIndex={-1}>{films[0].title}</h2>
            <p className="lobby-meta">{billing(films[0])}</p>
            <div className="lobby-actions">
              <button type="button" className="lobby-lights" onClick={() => onChange(lightsDown(screening, Date.now()))}>Lights down</button>
              <button type="button" className="lobby-quiet" onClick={() => onChange(null)}>Not tonight</button>
            </div>
          </div>
        </div> : <>
          <header className="lobby-header">
            <p className="lobby-kicker">Tonight · A double feature</p>
            <h2 id="lobby-title" ref={heading} tabIndex={-1}>{films[0].title} <em>then</em> {films[1].title}</h2>
          </header>
          <ol className="lobby-bill" aria-label="The programme">
            {films.map((film, index) => <li key={movieKey(film.title, film.year)}>
              <Poster film={film} />
              <span className="lobby-billing">
                <small>{index === 0 ? 'First' : 'Then'}</small><strong>{film.title}</strong>
                <span>{billing(film)}</span>
                <button type="button" onClick={() => onChange(removeFromProgramme(screening, index))} aria-label={`Take ${film.title} off the programme`}>Take it off</button>
              </span>
            </li>)}
          </ol>
          <div className="lobby-actions">
            <button type="button" className="lobby-lights" onClick={() => onChange(lightsDown(screening, Date.now()))}>Lights down</button>
            <button type="button" className="lobby-quiet" onClick={() => onChange(null)}>Not tonight</button>
          </div>
        </>}
        <p className="lobby-time">If the lights go down now, the credits roll at <strong>{formatClock(creditsRollAt(films, now))}</strong>
          <span> · {formatRuntime(programmeMinutes(films))}{films.length > 1 ? `, with a ${INTERMISSION_MINUTES}-minute intermission` : ''}</span>
          {unknownRuntime ? <small>The catalogue has no running time for {films.filter(film => film.runtime === null).map(film => film.title).join(' or ')}, so that is a guess.</small> : null}</p>
        {films.length < 2 && candidates.length ? <details className="lobby-double">
          <summary>Make it a double feature <span aria-hidden="true">+</span></summary>
          <p>Choose the second film. The first meets you where you are; the second takes you the rest of the way.</p>
          <ul>{candidates.slice(0, 6).map(film => <li key={movieKey(film.title, film.year)}><button type="button" onClick={() => onChange(addToProgramme(screening, film))}>
            <strong>{film.title}</strong><small>{film.year} · {film.runtime ? formatRuntime(film.runtime) : 'running time unknown'}</small></button></li>)}</ul>
        </details> : null}
        <small className="lobby-note">Afterimage keeps the clock in this browser and goes quiet until the credits.</small>
      </div> : null}

      {room === 'ritual' ? <div className="lobby-settle">
        <h2 id="lobby-title" ref={heading} tabIndex={-1} className="sr-only">The lights are going down</h2>
        <ol className="lobby-ritual">{steps.map((step, index) => <li key={step.label} style={{ '--delay': `${RITUAL_LEAD_MS + index * RITUAL_STEP_MS}ms` } as CSSProperties}><span>{step.label}</span><p>{step.text}</p></li>)}</ol>
      </div> : null}

      {dark ? <div className="lobby-dark">
        <p className="lobby-kicker">{dark.kind === 'showing' ? (films.length > 1 ? `Now showing · ${dark.index === 0 ? 'The first film' : 'The second film'}` : 'Now showing') : `The first film’s over · ${INTERMISSION_MINUTES} minutes`}</p>
        <h2 id="lobby-title" ref={heading} tabIndex={-1}>{dark.kind === 'showing' ? films[dark.index].title : 'Intermission'}</h2>
        {clock ? <p className="lobby-clock"><span className="sr-only">Time left: </span>{formatCountdown(dark.endsAt - now)}</p> : null}
        <p className="lobby-dark-note">{dark.kind === 'intermission' ? `${films[dark.index + 1]?.title ?? 'The second film'} starts at ${formatClock(dark.endsAt)}`
          : dark.index < films.length - 1 ? `The usher will be back at the intermission, around ${formatClock(dark.endsAt)}` : 'The usher will be back when the credits roll'}</p>
        <div className="lobby-dark-actions">
          <button type="button" onClick={() => onChange(skipAhead(screening, Date.now()))}>{dark.kind === 'showing' ? (dark.index < films.length - 1 ? 'The first film’s over' : 'Skip to the credits') : 'Start the second film'}</button>
          <button type="button" aria-pressed={!clock} onClick={() => setClock(!clock)}>{clock ? 'Hide the clock' : 'Show the clock'}</button>
          <button type="button" onClick={onStepOut}>Step out</button>
          <button type="button" className="lobby-end" onClick={() => onChange(null)}>End the screening</button>
        </div>
      </div> : null}

      {room === 'credits' ? <div className="lobby-usher">
        {printed ? <>
          <p className="lobby-kicker"><StarGlyph />Your {ordinal(printed.number)} film</p>
          <h2 id="lobby-title" ref={heading} tabIndex={-1} className="sr-only">Your ticket stub</h2>
          <div className="ticket-printer lobby-stub"><TicketStub entry={printed.entry} number={printed.number} /></div>
          <p className="lobby-half-life">Its half-life starts now. Come back {ASKING}, and Afterimage will ask whether it is still with you.</p>
          <div className="lobby-actions">
            {asking ? <button type="button" className="lobby-lights" onClick={() => setPrinted(null)}>Now, {asking.title}</button>
              : <button type="button" className="lobby-lights" onClick={() => onChange(null)}>Goodnight</button>}
          </div>
        </> : asking ? <UsherForm key={movieKey(asking.title, asking.year)} film={asking} double={films.length > 1} watchedOn={watchedOn} count={count} heading={heading}
          onKeep={onKeep} onPrinted={setPrinted} onLeave={() => onChange(null)} /> : <>
          <p className="lobby-kicker"><StarGlyph />The lights are up</p>
          <h2 id="lobby-title" ref={heading} tabIndex={-1}>{films.length > 1 ? 'Both films are in your journal' : `${films[0].title} is in your journal`}</h2>
          <p className="lobby-half-life">Its ticket stub is in your sky, beside its star.</p>
          <div className="lobby-actions"><button type="button" className="lobby-lights" onClick={() => onChange(null)}>Goodnight</button></div>
        </>}
      </div> : null}
    </dialog>
  </>;
}

/** The usher's one question, while the feeling is still warm: what's left? */
function UsherForm({ film, double, watchedOn, count, heading, onKeep, onPrinted, onLeave }: {
  film: ProgrammeFilm; double: boolean; watchedOn: string; count: number; heading: RefObject<HTMLHeadingElement | null>;
  onKeep: (draft: AfterimageDraft) => string | null; onPrinted: (printed: { entry: StubEntry; number: number }) => void; onLeave: () => void;
}) {
  const [stayed, setStayed] = useState<FacetKey[]>([]);
  const [line, setLine] = useState('');
  const [error, setError] = useState('');
  const lineId = useId();
  function print() {
    const labels = Object.fromEntries(stayed.flatMap(channel => { const label = film.facets?.[channel].label; return label ? [[channel, label]] : []; })) as Partial<Record<FacetKey, string>>;
    const named = Object.keys(labels).length ? { labels } : {};
    const failure = onKeep({ title: film.title, year: film.year, ...(film.tmdbId ? { tmdbId: film.tmdbId } : {}), watchedOn, stayed, ...named, note: line });
    if (failure) { setError(failure); return; }
    // Numbered before the journal grows, so the stub reads "your Nth film".
    onPrinted({ entry: { title: film.title, year: film.year, watchedOn, stayed, ...named, note: line.trim() }, number: count + 1 });
  }
  return <form onSubmit={event => { event.preventDefault(); print(); }}>
    <p className="lobby-kicker"><StarGlyph />The lights are up</p>
    <h2 id="lobby-title" ref={heading} tabIndex={-1}>What’s left?</h2>
    {double ? <p className="lobby-usher-film">Of <strong>{film.title}</strong></p> : null}
    <div className="lobby-qualities" role="group" aria-label={`What stayed with you from ${film.title}`}>
      {FACET_KEYS.map(channel => <button type="button" key={channel} aria-pressed={stayed.includes(channel)}
        onClick={() => setStayed(current => current.includes(channel) ? current.filter(item => item !== channel) : FACET_KEYS.filter(item => item === channel || current.includes(item)))}>
        {film.facets?.[channel].label ?? PLAIN[channel]}</button>)}
    </div>
    <label className="lobby-line-label" htmlFor={lineId}>One line, just for you</label>
    <input id={lineId} className="lobby-line" type="text" maxLength={MAX_AFTERIMAGE_NOTE} value={line} autoComplete="off"
      placeholder="A moment you keep seeing…" onChange={event => setLine(event.target.value)} />
    {error ? <p className="lobby-error" role="alert">{error}</p> : null}
    <div className="lobby-actions">
      <button type="submit" className="lobby-lights">Print my stub</button>
      <button type="button" className="lobby-quiet" onClick={onLeave}>Not tonight</button>
    </div>
    <small className="lobby-note">Kept in this browser. Nothing you write here is sent anywhere.</small>
  </form>;
}
