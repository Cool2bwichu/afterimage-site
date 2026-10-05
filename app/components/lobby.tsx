'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { movieKey } from '../lib/movie-metadata';
import {
  INTERMISSION_MINUTES, addToProgramme, creditsRollAt, formatClock, formatCountdown, formatRuntime, hasKnownRuntimes, lightsDown,
  programmeMinutes, removeFromProgramme, ritual, screeningPhase, skipAhead, type ProgrammeFilm, type Screening, type ScreeningPhase,
} from '../lib/screening';
import { notifyAway } from './charting';
import { StarGlyph } from './celestial';

type PhaseKind = ScreeningPhase['kind'];

/** The film's own frame, faint behind the lit rooms of the evening. */
function Still({ film }: { film: ProgrammeFilm }) {
  const [failed, setFailed] = useState(false);
  const source = !failed ? film.backdropUrl ?? null : null;
  return <div className="lobby-still" aria-hidden="true">{source ? <img key={source} src={source} alt="" decoding="async" onError={() => setFailed(true)} /> : null}</div>;
}

function Poster({ film }: { film: ProgrammeFilm }) {
  const [failed, setFailed] = useState(false);
  const source = film.posterUrl && !failed ? film.posterUrl : null;
  return <span className="lobby-poster" aria-hidden="true">{source ? <img src={source} alt="" decoding="async" onError={() => setFailed(true)} /> : <span>{film.title.slice(0, 1)}</span>}</span>;
}

/**
 * The Lobby: once a film is chosen, Afterimage walks you into the cinema. A short
 * ritual sets the room, then the lights go down and the site goes quiet for the film's
 * running time. You can step out and come back to your seat. When the credits roll the
 * usher is waiting, even if you only return tomorrow, with one question.
 */
export function Lobby({ screening, open, opener, candidates, kept, onOpen, onStepOut, onChange, onUsher }: {
  screening: Screening; open: boolean; opener: HTMLElement | null;
  /** Films that could join as the second half of a double feature. */
  candidates: ProgrammeFilm[];
  /** Films already kept in the journal, by movie key. */
  kept: Set<string>;
  onOpen: () => void; onStepOut: () => void;
  /** The next state of the evening; null ends it. */
  onChange: (next: Screening | null) => void;
  onUsher: (film: ProgrammeFilm, opener: HTMLElement) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const [clock, setClock] = useState(false);
  const phase = screeningPhase(screening, now);
  const films = screening.films;
  const playing = phase.kind === 'showing' || phase.kind === 'intermission' ? phase.index : -1;

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
      notifyAway('The credits are rolling', `${films.at(-1)?.title ?? 'The film'} is over. What stayed with you?`, 'afterimage-screening');
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
  useEffect(() => { if (open) heading.current?.focus({ preventScroll: true }); }, [open, phase.kind]);

  // The tab says what is on, so a glance at it is enough.
  const tabTitle = phase.kind === 'showing' ? `● Now showing: ${films[phase.index].title}` : phase.kind === 'intermission' ? '● Intermission · AFTERIMAGE' : null;
  useEffect(() => {
    if (!tabTitle) return;
    const original = document.title;
    document.title = tabTitle;
    return () => { if (document.title === tabTitle) document.title = original; };
  }, [tabTitle]);

  const seat = !open && (phase.kind === 'showing' || phase.kind === 'intermission');
  const dark = phase.kind === 'showing' || phase.kind === 'intermission';
  const unknownRuntime = !hasKnownRuntimes(films);
  const hour = new Date(now).getHours();
  // The room takes the light of the film it is about: the one coming, showing, or just ended.
  const featured = films[playing >= 0 ? (phase.kind === 'intermission' ? phase.index + 1 : playing) : phase.kind === 'credits' ? films.length - 1 : 0] ?? films[0];

  return <>
    {seat ? <button type="button" className="lobby-seat" onClick={onOpen}>
      <i aria-hidden="true" /><span>{phase.kind === 'showing' ? 'Now showing' : 'Intermission'}</span><strong>{films[playing]?.title}</strong><em>Back to your seat</em>
    </button> : null}
    <dialog ref={dialog} className="lobby" data-phase={phase.kind} aria-labelledby="lobby-title" style={featured.light ? { '--film-light': featured.light } as CSSProperties : undefined}
      onCancel={event => { event.preventDefault(); if (phase.kind === 'lobby') onChange(null); else onStepOut(); }}>
      <Still key={movieKey(featured.title, featured.year)} film={featured} />
      <div className="lobby-house" aria-hidden="true" />

      {phase.kind === 'lobby' ? <div className="lobby-room">
        <header className="lobby-header">
          <p className="lobby-kicker"><StarGlyph />The lobby · Tonight</p>
          <h2 id="lobby-title" ref={heading} tabIndex={-1}>{films.length > 1 ? 'A double feature' : films[0].title}</h2>
        </header>
        <ol className={`lobby-bill${films.length > 1 ? ' is-double' : ''}`} aria-label="The programme">
          {films.map((film, index) => <li key={movieKey(film.title, film.year)}>
            <Poster film={film} />
            <span className="lobby-billing">
              {films.length > 1 ? <><small>{index === 0 ? 'First' : 'Then'}</small><strong>{film.title}</strong></>
                : film.directors?.length ? <em>Directed by {film.directors.join(' and ')}</em> : null}
              <span>{[film.year, films.length > 1 ? film.directors?.join(', ') : null, film.runtime ? formatRuntime(film.runtime) : null].filter(Boolean).join(' · ')}</span>
              {films.length > 1 ? <button type="button" onClick={() => onChange(removeFromProgramme(screening, index))} aria-label={`Take ${film.title} off the programme`}>Take it off</button> : null}
            </span>
          </li>)}
        </ol>
        <p className="lobby-time">If the lights go down now, the credits roll at <strong>{formatClock(creditsRollAt(films, now))}</strong>
          <span> · {formatRuntime(programmeMinutes(films))}{films.length > 1 ? `, with a ${INTERMISSION_MINUTES}-minute intermission` : ''}</span>
          {unknownRuntime ? <small>The catalogue has no running time for {films.filter(film => film.runtime === null).map(film => film.title).join(' or ')}, so that is a guess.</small> : null}</p>
        <ol className="lobby-ritual">{ritual(films, hour).map(step => <li key={step.label}><span>{step.label}</span><p>{step.text}</p></li>)}</ol>
        {films.length < 2 && candidates.length ? <details className="lobby-double">
          <summary>Make it a double feature <span aria-hidden="true">+</span></summary>
          <p>Choose the second film. The first meets you where you are; the second takes you the rest of the way.</p>
          <ul>{candidates.slice(0, 6).map(film => <li key={movieKey(film.title, film.year)}><button type="button" onClick={() => onChange(addToProgramme(screening, film))}>
            <strong>{film.title}</strong><small>{film.year} · {film.runtime ? formatRuntime(film.runtime) : 'running time unknown'}</small></button></li>)}</ul>
        </details> : null}
        <footer className="lobby-actions">
          <button type="button" className="lobby-lights" onClick={() => onChange(lightsDown(screening, Date.now()))}>Lights down</button>
          <button type="button" className="lobby-quiet" onClick={() => onChange(null)}>Not tonight</button>
          <small>Afterimage keeps the clock in this browser and goes quiet until the credits.</small>
        </footer>
      </div> : null}

      {dark ? <div className="lobby-dark">
        <span className="lobby-beam" aria-hidden="true" />
        <p className="lobby-kicker">{phase.kind === 'showing' ? (films.length > 1 ? `Now showing · ${phase.index === 0 ? 'The first film' : 'The second film'}` : 'Now showing') : `The first film’s over · ${INTERMISSION_MINUTES} minutes`}</p>
        <h2 id="lobby-title" ref={heading} tabIndex={-1}>{phase.kind === 'showing' ? films[phase.index].title : 'Intermission'}</h2>
        <p className="lobby-dark-time">{phase.kind === 'showing'
          ? <>Credits around <strong>{formatClock(phase.endsAt)}</strong></>
          : <><strong>{films[phase.index + 1]?.title}</strong> starts at {formatClock(phase.endsAt)}</>}</p>
        {clock ? <p className="lobby-countdown"><span className="sr-only">Time left: </span>{formatCountdown(phase.endsAt - now)}</p> : null}
        <div className="lobby-dark-actions">
          <button type="button" aria-pressed={clock} onClick={() => setClock(!clock)}>{clock ? 'Hide the clock' : 'Show time left'}</button>
          <button type="button" onClick={() => onChange(skipAhead(screening, Date.now()))}>{phase.kind === 'showing' ? (phase.index < films.length - 1 ? 'The first film’s over' : 'The film’s over') : 'Start the second film'}</button>
          <button type="button" onClick={onStepOut}>Step out</button>
          <button type="button" className="lobby-end" onClick={() => onChange(null)}>End the screening</button>
        </div>
      </div> : null}

      {phase.kind === 'credits' ? <div className="lobby-usher">
        <p className="lobby-kicker"><StarGlyph />The lights are up</p>
        <h2 id="lobby-title" ref={heading} tabIndex={-1}>What stayed with you?</h2>
        <p>The usher keeps a ticket for every film you watch here: the night, what lingered and one line. It stays in this browser.</p>
        <ul>{films.map(film => {
          const done = kept.has(movieKey(film.title, film.year));
          return <li key={movieKey(film.title, film.year)}><button type="button" className={done ? 'is-kept' : undefined} onClick={event => onUsher(film, event.currentTarget)}>
            <Poster film={film} /><span><small>{done ? 'Ticket kept' : 'Keep what stayed'}</small><strong>{film.title}</strong></span><span aria-hidden="true">{done ? '✓' : '✦'}</span></button></li>;
        })}</ul>
        <button type="button" className="lobby-quiet" onClick={() => onChange(null)}>{films.every(film => kept.has(movieKey(film.title, film.year))) ? 'Goodnight' : 'Not tonight'}</button>
      </div> : null}
    </dialog>
  </>;
}

