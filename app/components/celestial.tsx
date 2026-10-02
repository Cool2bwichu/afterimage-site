'use client';

import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { NightSky, type NightSkyVariant } from './night-sky';

const TOGGLE_EVENT = 'afterimage:motion-toggle';
const requestToggle = () => document.dispatchEvent(new Event(TOGGLE_EVENT));
const MotionContext = createContext({ running: true, reduced: false, toggle: requestToggle });
function readReduced() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
// The provider's rendered state is the source of truth, so every consumer agrees on it even
// if a development server loads this module twice.
function readMotionAttribute() { return document.querySelector('.celestial-world')?.getAttribute('data-motion') ?? null; }
function subscribeMotionAttribute(listener: () => void) {
  const world = document.querySelector('.celestial-world');
  if (!world) return () => {};
  const observer = new MutationObserver(listener);
  observer.observe(world, { attributes: true, attributeFilter: ['data-motion'] });
  return () => observer.disconnect();
}
function subscribeReduced(listener: () => void) {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
function subscribeVisibility(listener: () => void) {
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
}

/** A small burst of light where a film is liked: in your sky, a star has just brightened. */
function starBurst(origin: Element) {
  const icon = origin.querySelector('span') ?? origin;
  const rect = icon.getBoundingClientRect();
  const layer = document.createElement('span');
  layer.className = 'star-burst';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.left = `${rect.left + rect.width / 2}px`;
  layer.style.top = `${rect.top + rect.height / 2}px`;
  const ring = document.createElement('b');
  layer.appendChild(ring);
  ring.animate([{ transform: 'translate(-50%, -50%) scale(.2)', opacity: .9 }, { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 }], { duration: 650, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' });
  for (let index = 0; index < 9; index++) {
    const spark = document.createElement('i');
    const angle = index / 9 * Math.PI * 2 + Math.random() * .5;
    const distance = 24 + Math.random() * 26;
    layer.appendChild(spark);
    spark.animate([
      { transform: 'translate(-50%, -50%) scale(.3) rotate(0deg)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(angle) * distance}px), calc(-50% + ${Math.sin(angle) * distance}px)) scale(1) rotate(90deg)`, opacity: 0 },
    ], { duration: 700 + Math.random() * 350, easing: 'cubic-bezier(.15,.75,.25,1)', fill: 'forwards' });
  }
  (origin.closest('dialog[open]') ?? document.body).appendChild(layer);
  window.setTimeout(() => layer.remove(), 1200);
}

export function CelestialProvider({ children }: { children: ReactNode }) {
  const [paused, setPaused] = useState(false);
  const reduced = useSyncExternalStore(subscribeReduced, readReduced, () => false);
  const hidden = useSyncExternalStore(subscribeVisibility, () => document.hidden, () => false);
  const running = !paused && !reduced && !hidden;
  const runningRef = useRef(running);
  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => {
    const toggle = () => setPaused(value => !value);
    document.addEventListener(TOGGLE_EVENT, toggle);
    return () => document.removeEventListener(TOGGLE_EVENT, toggle);
  }, []);
  useEffect(() => {
    // Read before React updates the button, so only a new Like is celebrated.
    const celebrate = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest?.('.like-film');
      if (button && button.getAttribute('aria-pressed') === 'false' && runningRef.current) starBurst(button);
    };
    document.addEventListener('click', celebrate, true);
    return () => document.removeEventListener('click', celebrate, true);
  }, []);
  return <MotionContext.Provider value={{ running, reduced, toggle: requestToggle }}>
    <div className="celestial-world" data-motion={running ? 'on' : 'off'}>{children}</div>
  </MotionContext.Provider>;
}

export function useCelestialMotion() {
  const context = useContext(MotionContext);
  const attribute = useSyncExternalStore(subscribeMotionAttribute, readMotionAttribute, () => null);
  const reduced = useSyncExternalStore(subscribeReduced, readReduced, () => false);
  return attribute === null ? context : { running: attribute === 'on', reduced, toggle: requestToggle };
}

export function MotionToggle() {
  const { running, reduced, toggle } = useCelestialMotion();
  return <button type="button" className="celestial-motion" aria-label={reduced ? 'Motion reduced by your device setting' : running ? 'Pause ambient motion' : 'Resume ambient motion'} aria-pressed={!running} disabled={reduced} onClick={toggle}>
    <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" />{running ? <path d="M8 6.5v7M12 6.5v7" /> : <path d="m8 6 6 4-6 4z" />}</svg><span>{reduced ? 'Still' : running ? 'Motion on' : 'Motion off'}</span>
  </button>;
}

export function OrbitMark() {
  return <svg className="orbit-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true"><circle cx="20" cy="20" r="10" /><ellipse cx="20" cy="20" rx="19" ry="6.5" transform="rotate(-36 20 20)" /><path d="M20 3v4m0 26v4M3 20h4m26 0h4" /><circle cx="31" cy="12" r="2" className="orbit-mark-light" /></svg>;
}

/** A four-point star, the mark of a film in your sky. */
export function StarGlyph({ className = '' }: { className?: string }) {
  return <svg className={`star-glyph ${className}`} viewBox="0 0 20 20" aria-hidden="true"><path d="M10 0c.7 6.1 3.9 9.3 10 10-6.1.7-9.3 3.9-10 10-.7-6.1-3.9-9.3-10-10 6.1-.7 9.3-3.9 10-10z" /></svg>;
}

export function CelestialSky({ variant = 'page', className = '' }: { variant?: 'page' | 'landing' | 'atlas' | 'reel'; className?: string }) {
  const id = useId().replaceAll(':', '');
  const { running } = useCelestialMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '80px' });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className={`celestial-sky celestial-sky--${variant} ${className}`} data-active={visible} aria-hidden="true">
    <div className="celestial-wash" />
    <NightSky variant={variant satisfies NightSkyVariant} running={running && visible} />
    <svg className="celestial-instrument" viewBox="0 0 1000 1000" fill="none">
      <defs><linearGradient id={`${id}-orbit`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#dec6a0" stopOpacity=".08" /><stop offset=".45" stopColor="#dec6a0" stopOpacity=".68" /><stop offset=".8" stopColor="#9cbbb9" stopOpacity=".12" /><stop offset="1" stopColor="#dec6a0" stopOpacity=".48" /></linearGradient></defs>
      <g stroke={`url(#${id}-orbit)`} className="celestial-orbits"><circle cx="500" cy="500" r="344" /><circle cx="500" cy="500" r="363" strokeDasharray="1 11" /><ellipse cx="500" cy="500" rx="466" ry="191" transform="rotate(-28 500 500)" /><ellipse cx="500" cy="500" rx="275" ry="451" transform="rotate(-28 500 500)" /></g>
      <g className="celestial-orbit-light"><path d="M500 137A363 363 0 0 1 814 318" stroke={`url(#${id}-orbit)`} strokeWidth="2" /><circle cx="814" cy="318" r="3" fill="#f4efe5" /><path d="M814 305v26m-13-13h26" stroke="#dec6a0" strokeOpacity=".5" /></g>
      <g className="celestial-cardinals" stroke="#a7b6c5" strokeOpacity=".38"><path d="M500 112v14m0 748v14M112 500h14m748 0h14" /></g>
    </svg>
  </div>;
}
