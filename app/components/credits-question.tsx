'use client';

import { Fragment, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { JOURNEYS, MOODS, moodPoint, nameMood, routeRequest, type MoodPoint, type Route } from '../lib/credits-question';
import { movieKey, type FilmEnrichment } from '../lib/movie-metadata';
import type { RecommendationV2 } from '../lib/reel-state';
import { formatRuntime } from '../lib/screening';
import { StarGlyph } from './celestial';

type Light = 'now' | 'credits';
const LIGHTS: Light[] = ['now', 'credits'];
const STEP = 0.04;
// The lights move inside a margin, as on the page: x from 8% to 92% of the map, y from 90% up to 10%.
const left = (point: MoodPoint) => 8 + point.x * 84;
const top = (point: MoodPoint) => 90 - point.y * 80;
const clamp = (value: number) => Math.min(1, Math.max(0, value));
const apart = (a: MoodPoint, b: MoodPoint) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const capital = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

/** What the programme says about each film's place in the evening. */
function programmeNotes(double: boolean, staying: boolean): string[] {
  if (staying) return double
    ? ['Keeps you company where you are, so the night starts honestly.', 'And stays there with you. Nothing has to change tonight.']
    : ['Keeps you company where you are: no rescue, no lesson.'];
  return double
    ? ['Meets you where you are, so the night starts honestly.', 'Then carries you the rest of the way. In the other order, the first would undo the second.']
    : ['Lands you where you asked to be.'];
}

/**
 * The Credits Question. Not "what do you like?" but "where do you want to be when the
 * credits roll?" Two lights on a map of moods: where you are, and where you want to end
 * up. The nearest word to each light, and the shape of the evening, become the request.
 */
export function CreditsQuestion({ opener, onClose, onDevelop }: {
  opener: HTMLElement | null; onClose: () => void;
  onDevelop: (request: { films: string[]; creativeBrief: string }) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const pad = useRef<HTMLDivElement>(null);
  const dragging = useRef<Light | null>(null);
  const [lights, setLights] = useState<Record<Light, MoodPoint>>(() => ({ now: moodPoint(JOURNEYS[0].from), credits: moodPoint(JOURNEYS[0].to) }));
  const [preset, setPreset] = useState<number | null>(0);
  const [double, setDouble] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    requestAnimationFrame(() => heading.current?.focus());
    return () => { if (element?.open) element.close(); if (opener?.isConnected) opener.focus(); };
  }, [opener]);

  const words = { now: nameMood(lights.now), credits: nameMood(lights.credits) };
  const staying = words.now === words.credits;
  const route: Route = { now: words.now, credits: words.credits, double };
  const notes = programmeNotes(double, staying);
  // When the two lights nearly meet, the second one's name drops below it.
  const crowded = Math.abs(left(lights.now) - left(lights.credits)) < 18 && Math.abs(top(lights.now) - top(lights.credits)) < 9;

  function move(light: Light, point: MoodPoint) {
    setLights(current => ({ ...current, [light]: { x: clamp(point.x), y: clamp(point.y) } }));
    setPreset(null);
  }

  function pointAt(event: PointerEvent<HTMLElement>): MoodPoint {
    const box = pad.current!.getBoundingClientRect();
    return { x: ((event.clientX - box.left) / box.width * 100 - 8) / 84, y: (90 - (event.clientY - box.top) / box.height * 100) / 80 };
  }

  // Grab the light you touched; touch the open map and the nearer light comes to you.
  function grab(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-light]');
    const point = pointAt(event);
    const light = (handle?.dataset.light as Light | undefined) ?? (apart(point, lights.now) <= apart(point, lights.credits) ? 'now' : 'credits');
    dragging.current = light;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    if (!handle) move(light, point);
    pad.current?.querySelector<HTMLElement>(`[data-light=${light}]`)?.focus({ preventScroll: true });
  }

  function drag(event: PointerEvent<HTMLDivElement>) {
    if (dragging.current) move(dragging.current, pointAt(event));
  }

  function drop(event: PointerEvent<HTMLDivElement>) {
    dragging.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function nudge(light: Light, event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? STEP * 3 : STEP;
    const delta = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] } as Record<string, [number, number]>)[event.key];
    if (!delta) return;
    event.preventDefault();
    move(light, { x: lights[light].x + delta[0], y: lights[light].y + delta[1] });
  }

  const from = lights.now;
  const to = lights.credits;
  const middle = { left: (left(from) + left(to)) / 2, top: (top(from) + top(to)) / 2 };

  return <dialog ref={dialog} className="credits-question" aria-labelledby="credits-question-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="credits-question-head">
      <p className="credits-question-kicker"><StarGlyph />The credits question</p>
      <h2 id="credits-question-title" ref={heading} tabIndex={-1}>Where do you want to be when the credits roll?</h2>
      <button type="button" className="credits-question-close" onClick={onClose} aria-label="Close the credits question">×</button>
    </header>
    <div className="credits-question-body">
      <div className="credits-presets" role="group" aria-label="Common journeys">
        {JOURNEYS.map((journey, index) => <button key={`${journey.from}-${journey.to}`} type="button" aria-pressed={preset === index}
          onClick={() => { setLights({ now: moodPoint(journey.from), credits: moodPoint(journey.to) }); setPreset(index); }}>
          {capital(journey.from)} <span aria-hidden="true">→</span><span className="sr-only">to</span> {journey.to}</button>)}
      </div>
      <div className="credits-stage">
        <div ref={pad} className="credits-pad" onPointerDown={grab} onPointerMove={drag} onPointerUp={drop} onPointerCancel={drop}>
          <svg className="credits-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path className="credits-grid" d="M8 50H92M50 10V90" />
            {staying ? null : <path className="credits-path" d={`M${left(from)} ${top(from)}L${left(to)} ${top(to)}`} />}
          </svg>
          <span className="credits-axis is-charged" aria-hidden="true">Charged</span>
          <span className="credits-axis is-still" aria-hidden="true">Still</span>
          <span className="credits-axis is-heavy" aria-hidden="true">Heavy</span>
          <span className="credits-axis is-light" aria-hidden="true">Light</span>
          <ul className="credits-marks" aria-hidden="true">{MOODS.map(mood => {
            const lit = LIGHTS.filter(light => words[light] === mood.word).join(' ');
            return <li key={mood.word} data-lit={lit || undefined} style={{ left: `${left(mood)}%`, top: `${top(mood)}%` }}><i />{mood.word}</li>;
          })}</ul>
          {double && !staying ? <span className="credits-interval" style={{ left: `${middle.left}%`, top: `${middle.top}%` }} aria-hidden="true">Intermission</span> : null}
          {LIGHTS.map(light => <div key={light} className={`credits-light is-${light}`} data-light={light} data-below={light === 'credits' && crowded ? '' : undefined}
            role="slider" tabIndex={0} aria-label={light === 'now' ? 'Where you are right now' : 'Where you want to be at the credits'}
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(lights[light].x * 100)} aria-valuetext={words[light]} aria-describedby="credits-keys"
            style={{ left: `${left(lights[light])}%`, top: `${top(lights[light])}%` } as CSSProperties} onKeyDown={event => nudge(light, event)}>
            <span>{light === 'now' ? 'Now' : 'At the credits'}</span>
          </div>)}
        </div>
        <p id="credits-keys" className="credits-hint">Drag the two lights, or move them with the arrow keys. The nearest word is the one Afterimage hears.</p>
      </div>
      <div className="credits-question-panel">
        <p className="credits-reading" aria-live="polite">{staying
          ? <>Stay where you are: <b className="is-now">{words.now}</b></>
          : <>From <b className="is-now">{words.now}</b> to <b className="is-credits">{words.credits}</b></>}</p>
        <div className="credits-seg" role="group" aria-label="Length of evening">
          <button type="button" aria-pressed={!double} onClick={() => setDouble(false)}>One film</button>
          <button type="button" aria-pressed={double} onClick={() => setDouble(true)}>A double feature</button>
        </div>
        <div className="credits-programme" role="group" aria-label="Tonight’s programme">
          {(double ? ['First', 'Second'] : ['Tonight']).map((label, index) => <Fragment key={label}>
            {index === 1 ? <p className="credits-intermission">Intermission · make tea</p> : null}
            <div className="credits-slot"><span>{label}</span><p>{notes[index]}</p></div>
          </Fragment>)}
        </div>
        <button type="button" className="credits-develop" onClick={() => onDevelop(routeRequest(route))}>Develop the route <span aria-hidden="true">↗</span></button>
        <small className="credits-note">The two words and the shape of the evening become your reel’s request. Nothing else is sent.</small>
      </div>
    </div>
  </dialog>;
}

/** Above a reel the credits question developed: the route, and on a long night the programme. */
export function RouteStrip({ route, films, metadata, onWatchDouble }: {
  route: Route; films: RecommendationV2[]; metadata: Record<string, FilmEnrichment>; onWatchDouble?: (opener: HTMLElement) => void;
}) {
  const staying = route.now.toLocaleLowerCase() === route.credits.toLocaleLowerCase();
  const pair = route.double && films.length > 1 ? films.slice(0, 2) : null;
  const notes = programmeNotes(true, staying);
  return <section className="route-strip" aria-label="The route this reel takes">
    <div className="route-strip-head">
      <p className="route-strip-kicker">The credits question</p>
      <p className="route-strip-route"><span><small>Right now</small>{route.now}</span><i aria-hidden="true" /><span><small>At the credits</small>{route.credits}</span></p>
      {pair ? null : <p className="route-strip-note">{staying ? 'A reel to keep you company where you are.' : 'Each film is a route between the two.'}</p>}
    </div>
    {pair ? <div className="route-programme" role="group" aria-label="Tonight’s double feature">
      {pair.map((film, index) => {
        const record = metadata[movieKey(film.title, film.year)];
        const details = record?.status === 'matched' ? record : null;
        return <Fragment key={movieKey(film.title, film.year)}>
          {index === 1 ? <p className="route-intermission">Intermission · make tea</p> : null}
          <div className="route-slot"><span>{index === 0 ? 'First' : 'Second'}</span>
            <div><strong>{film.title}</strong> <small>{[details?.directors.join(' & '), film.year, details?.runtime ? formatRuntime(details.runtime) : null].filter(Boolean).join(' · ')}</small>
              <p>{notes[index]}</p></div>
          </div>
        </Fragment>;
      })}
      {onWatchDouble ? <button type="button" onClick={event => onWatchDouble(event.currentTarget)}>Watch the double feature tonight <span aria-hidden="true">↗</span></button> : null}
    </div> : null}
  </section>;
}
