'use client';

import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

const MotionContext = createContext({ running: true, reduced: false, toggle: () => {} });
function subscribeReduced(listener: () => void) {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
function subscribeVisibility(listener: () => void) {
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
}
export function CelestialProvider({ children }: { children: ReactNode }) {
  const [paused, setPaused] = useState(false);
  const reduced = useSyncExternalStore(subscribeReduced, () => window.matchMedia('(prefers-reduced-motion: reduce)').matches, () => false);
  const hidden = useSyncExternalStore(subscribeVisibility, () => document.hidden, () => false);
  const running = !paused && !reduced && !hidden;
  return <MotionContext.Provider value={{ running, reduced, toggle: () => setPaused(value => !value) }}>
    <div className="celestial-world" data-motion={running ? 'on' : 'off'}>{children}</div>
  </MotionContext.Provider>;
}

export function MotionToggle() {
  const { running, reduced, toggle } = useContext(MotionContext);
  return <button type="button" className="celestial-motion" aria-label={reduced ? 'Motion reduced by your device setting' : running ? 'Pause ambient motion' : 'Resume ambient motion'} aria-pressed={!running} disabled={reduced} onClick={toggle}>
    <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" />{running ? <path d="M8 6.5v7M12 6.5v7" /> : <path d="m8 6 6 4-6 4z" />}</svg><span>{reduced ? 'Still' : running ? 'Motion on' : 'Motion off'}</span>
  </button>;
}

export function OrbitMark() {
  return <svg className="orbit-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true"><circle cx="20" cy="20" r="10" /><ellipse cx="20" cy="20" rx="19" ry="6.5" transform="rotate(-36 20 20)" /><path d="M20 3v4m0 26v4M3 20h4m26 0h4" /><circle cx="31" cy="12" r="2" className="orbit-mark-light" /></svg>;
}

// A fixed, sparse star plate is atmosphere, never a set of film data points.
const STARS = Array.from({ length: 68 }, (_, index) => ({
  x: (index * 173 + 83) % 997, y: (index * index * 29 + index * 71 + 37) % 991,
  r: index % 11 === 0 ? 1.65 : index % 3 === 0 ? 1 : .6,
  opacity: .18 + (index % 5) * .11,
}));

export function CelestialSky({ variant = 'page', className = '' }: { variant?: 'page' | 'landing' | 'atlas' | 'reel'; className?: string }) {
  const id = useId().replaceAll(':', '');
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '80px' });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className={`celestial-sky celestial-sky--${variant} ${className}`} data-active={visible} aria-hidden="true">
    <div className="celestial-wash" />
    <svg className="celestial-star-plate" viewBox="0 0 1000 1000" preserveAspectRatio="none">{STARS.map((star, index) => <circle key={index} cx={star.x} cy={star.y} r={star.r} opacity={star.opacity} />)}</svg>
    <svg className="celestial-instrument" viewBox="0 0 1000 1000" fill="none">
      <defs><linearGradient id={`${id}-orbit`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#dec6a0" stopOpacity=".08" /><stop offset=".45" stopColor="#dec6a0" stopOpacity=".68" /><stop offset=".8" stopColor="#9cbbb9" stopOpacity=".12" /><stop offset="1" stopColor="#dec6a0" stopOpacity=".48" /></linearGradient></defs>
      <g stroke={`url(#${id}-orbit)`} className="celestial-orbits"><circle cx="500" cy="500" r="344" /><circle cx="500" cy="500" r="363" strokeDasharray="1 11" /><ellipse cx="500" cy="500" rx="466" ry="191" transform="rotate(-28 500 500)" /><ellipse cx="500" cy="500" rx="275" ry="451" transform="rotate(-28 500 500)" /></g>
      <g className="celestial-orbit-light"><path d="M500 137A363 363 0 0 1 814 318" stroke={`url(#${id}-orbit)`} strokeWidth="2" /><circle cx="814" cy="318" r="3" fill="#f4efe5" /><path d="M814 305v26m-13-13h26" stroke="#dec6a0" strokeOpacity=".5" /></g>
      <g className="celestial-cardinals" stroke="#a7b6c5" strokeOpacity=".38"><path d="M500 112v14m0 748v14M112 500h14m748 0h14" /></g>
    </svg>
  </div>;
}
