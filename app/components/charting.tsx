'use client';

import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react';
import type { DraftFilm, JobDraft } from '../lib/generation-state';

const NOTIFY_KEY = 'afterimage:notify:v1';
const DEVELOPING_TITLE = '✦ Developing your reel · AFTERIMAGE';
const READY_TITLE = '✦ Your reel is ready · AFTERIMAGE';

type Permission = 'unsupported' | NotificationPermission;
function readPermission(): Permission {
  return typeof window === 'undefined' || !('Notification' in window) ? 'unsupported' : Notification.permission;
}
function subscribeNothing() { return () => {}; }

function wantsNotice() {
  try { return localStorage.getItem(NOTIFY_KEY) === 'on'; } catch { return false; }
}

/** Keeps the tab honest while a reel develops, without claiming any progress we cannot measure. */
export function useDevelopingTitle(developing: boolean) {
  useEffect(() => {
    if (!developing) return;
    const original = document.title;
    document.title = DEVELOPING_TITLE;
    return () => { if (document.title === DEVELOPING_TITLE) document.title = original; };
  }, [developing]);
}

/** Called once when a reel arrives. Only speaks up when the viewer is looking elsewhere. */
export function announceReady(body: string) {
  if (typeof document === 'undefined' || !document.hidden) return;
  const original = document.title === DEVELOPING_TITLE || document.title === READY_TITLE ? 'AFTERIMAGE — Your cinematic sensibility' : document.title;
  // Let the developing title restore itself first, then mark the tab.
  window.setTimeout(() => {
    document.title = READY_TITLE;
    const restore = () => {
      if (document.hidden) return;
      if (document.title === READY_TITLE) document.title = original;
      document.removeEventListener('visibilitychange', restore);
    };
    document.addEventListener('visibilitychange', restore);
  }, 0);
  if (readPermission() === 'granted' && wantsNotice()) {
    try { new Notification('Your reel is ready', { body, icon: new URL('icon-192.png', document.baseURI).href, tag: 'afterimage-reel' }); } catch { /* Some browsers only allow notifications from a service worker. */ }
  }
}

function NotifyControl() {
  const permission = useSyncExternalStore(subscribeNothing, readPermission, () => 'unsupported' as Permission);
  const [asked, setAsked] = useState<Permission | null>(null);
  const [enabled, setEnabled] = useState(wantsNotice);
  const state = asked ?? permission;
  if (state === 'unsupported') return <p className="charting-notify-note">When your reel arrives, this tab’s title will tell you.</p>;
  if (state === 'denied') return <p className="charting-notify-note">Notifications are blocked here, so this tab’s title will tell you instead.</p>;
  const on = state === 'granted' && enabled;
  return <button type="button" className="charting-notify" aria-pressed={on} onClick={async () => {
    if (on) { try { localStorage.setItem(NOTIFY_KEY, 'off'); } catch { /* Optional preference. */ } setEnabled(false); return; }
    const result = state === 'granted' ? 'granted' : await Notification.requestPermission();
    setAsked(result);
    if (result === 'granted') { try { localStorage.setItem(NOTIFY_KEY, 'on'); } catch { /* Optional preference. */ } setEnabled(true); }
  }}><span aria-hidden="true">{on ? '✦' : '◌'}</span>{on ? 'We’ll let you know when it’s ready' : 'Tell me when it’s ready'}</button>;
}

/**
 * The developing state as an observatory: rings turn, the references you gave orbit the
 * lens, and five dark stars wait at the centre. Motion is ambient only; the only real
 * measures shown are the job's status and the time elapsed.
 *
 * Once the companion starts writing, the reel develops in place: the sensibility's name, its
 * palette, then each film as the companion finishes it. That draft is provisional, and says
 * so; the finished reel, checked by AFTERIMAGE, replaces it.
 */
export function ChartingRoom({ message, detail, elapsed, sources, variant = 'reel', draft = null, posterFor }: {
  message: string; detail: string; elapsed: string | null; sources: string[]; variant?: 'reel' | 'replacement';
  draft?: JobDraft | null; posterFor?: (film: DraftFilm) => string | null;
}) {
  const bodies = sources.slice(0, 5);
  const films = variant === 'replacement' ? (draft?.recommendation ? [draft.recommendation] : []) : draft?.recommendations ?? [];
  const palette = variant === 'reel' ? draft?.palette ?? [] : [];
  const persona = variant === 'reel' ? draft?.persona : undefined;
  const developing = Boolean(persona || films.length || palette.length);
  const secondTake = (draft?.take ?? 1) > 1;
  const slots = variant === 'replacement' ? 1 : 5;
  const style = palette.length ? { '--developing-color': palette[0], '--developing-accent': palette[2] ?? palette.at(-1) } as CSSProperties : undefined;
  return <section className={`charting-room charting-room--${variant}${developing ? ' is-developing' : ''}`} role="status" aria-live="polite" style={style}>
    <div className="charting-orrery" aria-hidden="true">
      <div className="charting-sweep" />
      <svg viewBox="0 0 320 320" className="charting-rings">
        <circle cx="160" cy="160" r="150" className="charting-ring-outer" />
        <circle cx="160" cy="160" r="138" strokeDasharray="1 7" />
        <circle cx="160" cy="160" r="104" />
        <circle cx="160" cy="160" r="70" strokeDasharray="2 5" />
        <path d="M160 4v14m0 284v14M4 160h14m284 0h14" />
        <g className="charting-ticks">{Array.from({ length: 36 }, (_, index) => <path key={index} d="M160 12v6" transform={`rotate(${index * 10} 160 160)`} />)}</g>
      </svg>
      {bodies.map((source, index) => <span key={`${source}-${index}`} className="charting-orbit" style={{ '--radius': `${38 + index * 9}%`, '--duration': `${26 + index * 9}s`, '--start': `${index * 67}deg` } as CSSProperties}><i /></span>)}
      <div className="charting-slots">{Array.from({ length: 5 }, (_, index) => <i key={index} className={films[index] ? 'is-lit' : palette[index] ? 'is-tinted' : undefined}
        style={{ '--i': index, ...(palette[index] ? { '--slot-color': palette[index] } : {}) } as CSSProperties} />)}</div>
    </div>
    <div className="charting-copy">
      <p className="charting-kicker">{secondTake ? 'A second take' : developing ? 'Developing · Your reel is taking shape' : 'Charting your next constellation'}</p>
      {persona ? <h2 key={persona} className="developing-in">{persona}</h2> : <h2>{message}</h2>}
      <p>{secondTake && !developing ? 'The first answer didn’t pass AFTERIMAGE’s checks, so the companion is writing it again.' : variant === 'reel' && draft?.insight ? draft.insight : detail}</p>
      {palette.length ? <p className="developing-palette" aria-hidden="true">{palette.map((color, index) => <i key={`${color}-${index}`} style={{ background: color, '--i': index } as CSSProperties} />)}</p> : null}
      {developing && films.length ? <>
        <ol className={`developing-reel developing-reel--${variant}`} aria-live="off">
          {Array.from({ length: slots }, (_, index) => {
            const film = films[index];
            if (!film) return <li key={`waiting-${index}`} className="is-waiting" aria-hidden="true"><span className="developing-frame" /><span className="developing-lines"><i /><i /></span></li>;
            const poster = posterFor?.(film) ?? null;
            return <li key={`${film.title}|${film.year}`} className="is-arrived" style={{ '--i': index } as CSSProperties}>
              <span className="developing-frame">{poster ? <img src={poster} alt="" loading="lazy" onError={event => { event.currentTarget.style.visibility = 'hidden'; }} /> : <span aria-hidden="true">{film.title.slice(0, 1)}</span>}</span>
              <span className="developing-film"><strong>{film.title}</strong> <small>{film.year}</small>{film.reason ? <em>{film.reason}</em> : null}</span>
            </li>;
          })}
        </ol>
        <p className="sr-only">{variant === 'replacement' ? `${films[0].title} is arriving.` : `${films.length} of 5 films have arrived.`}</p>
        <p className="developing-note">Still developing. The reel is final once the companion finishes and AFTERIMAGE checks it.</p>
      </> : bodies.length ? <p className="charting-sources"><span>Following</span>{bodies.map((source, index) => <strong key={`${source}-${index}`}>{source}</strong>)}</p> : null}
      <div className="charting-meta">
        {elapsed ? <time aria-live="off" className="elapsed">{elapsed} elapsed</time> : null}
        <span>{developing ? 'Films appear as they arrive.' : 'This can take a few minutes.'}</span>
      </div>
      <NotifyControl />
    </div>
  </section>;
}
