'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { JOURNEYS, MOODS, moodPoint, routeRequest, type MoodWord, type Route } from '../lib/credits-question';
import { StarGlyph } from './celestial';

type Light = 'now' | 'credits';
const place = (word: MoodWord) => { const point = moodPoint(word); return { left: 7 + point.x * 86, top: 9 + (1 - point.y) * 80 }; };

/**
 * The Credits Question. Not "what do you like?" but "where do you want to be when the
 * credits roll?" Two lights on a map of moods: where you are, and where you want to end
 * up. The route between them becomes the reel's request.
 */
export function CreditsQuestion({ opener, onClose, onDevelop }: {
  opener: HTMLElement | null; onClose: () => void;
  onDevelop: (request: { films: string[]; creativeBrief: string }) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [now, setNow] = useState<MoodWord | null>(null);
  const [credits, setCredits] = useState<MoodWord | null>(null);
  const [placing, setPlacing] = useState<Light>('now');
  const [double, setDouble] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    requestAnimationFrame(() => heading.current?.focus());
    return () => { if (element?.open) element.close(); if (opener?.isConnected) opener.focus(); };
  }, [opener]);

  function choose(word: MoodWord) {
    if (placing === 'now') { setNow(word); if (!credits) setPlacing('credits'); }
    else setCredits(word);
  }

  const from = now ? place(now) : null;
  const to = credits ? place(credits) : null;
  const staying = Boolean(now && credits && now === credits);
  // The route bows upward, like the arc of a projector's beam.
  const bend = from && to && !staying ? { x: (from.left + to.left) / 2, y: Math.min(from.top, to.top) - 14 - Math.abs(from.left - to.left) * .12 } : null;
  const route: Route | null = now && credits ? { now, credits, double } : null;

  return <dialog ref={dialog} className="credits-question" aria-labelledby="credits-question-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="credits-question-head">
      <p className="credits-question-kicker"><StarGlyph />The credits question</p>
      <h2 id="credits-question-title" ref={heading} tabIndex={-1}>Where do you want to be when the credits roll?</h2>
      <button type="button" className="credits-question-close" onClick={onClose} aria-label="Close the credits question">×</button>
    </header>
    <div className="credits-question-body">
      <div className="credits-map" data-placing={placing}>
        <span className="credits-axis is-charged" aria-hidden="true">Charged</span>
        <span className="credits-axis is-still" aria-hidden="true">Still</span>
        <span className="credits-axis is-light" aria-hidden="true">Light</span>
        <span className="credits-axis is-heavy" aria-hidden="true">Heavy</span>
        <svg className="credits-route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path className="credits-grid" d="M7 49H93M50 9V89" />
          {from && to && bend ? <path key={`${now}-${credits}`} className="credits-path" d={`M${from.left} ${from.top}Q${bend.x} ${bend.y} ${to.left} ${to.top}`} /> : null}
        </svg>
        {from && to && bend && double ? <span className="credits-intermission" style={{ left: `${(from.left + 2 * bend.x + to.left) / 4}%`, top: `${(from.top + 2 * bend.y + to.top) / 4}%` } as CSSProperties} aria-hidden="true"><i />Intermission</span> : null}
        <div className="credits-words" role="group" aria-label={placing === 'now' ? 'How you feel right now' : 'How you want to feel at the credits'}>
          {MOODS.map(mood => {
            const at = place(mood.word);
            const role = [now === mood.word ? 'now' : '', credits === mood.word ? 'credits' : ''].filter(Boolean).join(' ');
            return <button key={mood.word} type="button" className="credits-word" data-light={role || undefined} style={{ left: `${at.left}%`, top: `${at.top}%` } as CSSProperties}
              aria-pressed={placing === 'now' ? now === mood.word : credits === mood.word} onClick={() => choose(mood.word)}>
              <i aria-hidden="true" /><span>{mood.word}</span>
            </button>;
          })}
        </div>
      </div>
      <div className="credits-question-panel">
        <div className="credits-lights" role="group" aria-label="Which light to place">
          <button type="button" className="is-now" aria-pressed={placing === 'now'} onClick={() => setPlacing('now')}>
            <i aria-hidden="true" /><span><small>Right now</small><strong>{now ?? 'Tap a mood'}</strong></span></button>
          <button type="button" className="is-credits" aria-pressed={placing === 'credits'} onClick={() => setPlacing('credits')}>
            <i aria-hidden="true" /><span><small>When the credits roll</small><strong>{credits ?? 'Tap a mood'}</strong></span></button>
        </div>
        <p className="credits-reading" aria-live="polite">{route ? staying ? `Stay with you where you are: no rescue, just company.` : `From ${now} to ${credits}${double ? ', over two films' : ''}.` : placing === 'now' ? 'Place the first light where you are tonight.' : 'Now place the second light where you want to end up.'}</p>
        <fieldset className="credits-shape">
          <legend>Tonight</legend>
          <label><input type="radio" name="credits-shape" checked={!double} onChange={() => setDouble(false)} />One film</label>
          <label><input type="radio" name="credits-shape" checked={double} onChange={() => setDouble(true)} />A double feature</label>
        </fieldset>
        <div className="credits-journeys"><p>Or take a well-worn road</p>
          <ul>{JOURNEYS.map(journey => <li key={`${journey.from}-${journey.to}`}><button type="button" aria-pressed={now === journey.from && credits === journey.to} onClick={() => { setNow(journey.from); setCredits(journey.to); setPlacing('credits'); }}>{journey.from} <span aria-hidden="true">→</span><span className="sr-only">to</span> {journey.to}</button></li>)}</ul>
        </div>
        <button type="button" className="credits-develop" disabled={!route} onClick={() => { if (route) onDevelop(routeRequest(route)); }}>Develop the route <span aria-hidden="true">↗</span></button>
        <small className="credits-note">The two words and the shape of the evening become your reel’s request. Nothing else is sent.</small>
      </div>
    </div>
  </dialog>;
}

/** Above a reel the credits question developed: the route it was asked to take. */
export function RouteStrip({ route, onWatchDouble }: { route: Route; onWatchDouble?: (opener: HTMLElement) => void }) {
  const staying = route.now.toLocaleLowerCase() === route.credits.toLocaleLowerCase();
  return <section className="route-strip" aria-label="The route this reel takes">
    <p className="route-strip-kicker">The credits question</p>
    <p className="route-strip-route"><span><small>Right now</small>{route.now}</span><i aria-hidden="true" /><span><small>At the credits</small>{route.credits}</span></p>
    <p className="route-strip-note">{staying ? 'A reel to keep you company where you are.' : route.double ? 'Films I and II are a double feature: watch them in that order.' : 'Each film is a route between the two.'}</p>
    {route.double && onWatchDouble ? <button type="button" onClick={event => onWatchDouble(event.currentTarget)}>Watch the double feature tonight <span aria-hidden="true">↗</span></button> : null}
  </section>;
}
