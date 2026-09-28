'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { CelestialSky, OrbitMark, StarGlyph, useCelestialMotion } from './celestial';
import { useElementSize } from './use-element-size';

// Verified TMDB stills. These are editorial examples, never generated user results.
const FILMS = {
  yang: { title: 'After Yang', year: '2022', director: 'Kogonada', image: 'https://image.tmdb.org/t/p/w1280/y8ZholsWIn4jR3JoDWOSSFY87vf.jpg' },
  columbus: { title: 'Columbus', year: '2017', director: 'Kogonada', image: 'https://image.tmdb.org/t/p/w1280/xN88RKXxjPAcQsdBz6XavZ00PFh.jpg' },
  mood: { title: 'In the Mood for Love', year: '2000', director: 'Wong Kar-wai', image: 'https://image.tmdb.org/t/p/w1280/ffQFnAUm2Uu4RU0nijpjPRf9TBT.jpg' },
};
export type WelcomeFilm = keyof typeof FILMS;
const ORDER: WelcomeFilm[] = ['yang', 'columbus', 'mood'];
export function nextWelcomeFilm(previous: string | null): WelcomeFilm {
  const index = ORDER.findIndex(key => key === previous);
  return ORDER[index < 0 ? 1 : (index + 1) % ORDER.length];
}
const CHAPTERS = [
  { name: 'Your reel', title: 'Five films. A thread between them.', copy: 'Name a film you love, describe a feeling, or combine both. Get five recommendations with a reason for each one.' },
  { name: 'The Light Table', title: 'Keep the feeling. Change the film.', copy: 'Borrow the mood of one film, the visual language of another. Combine the qualities you want to carry into your next reel.' },
  { name: 'Atlas', title: 'Follow what connects them.', copy: 'Explore how films meet through their worlds, emotions, images and sound. Follow a connection, then find your way back.' },
  { name: 'Your sky', title: 'Every film leaves a light.', copy: 'Each reel becomes a constellation and every Atlas gathers around its film. Like what you loved, keep an afterimage of what stayed, and watch a sky of your own take shape.' },
];
const STARTERS = [
  { name: 'Quiet science fiction', prompt: 'Quiet, intimate science fiction about memory, care, and what makes us human.' },
  { name: 'Longing after dark', prompt: 'Films filled with nocturnal color, restrained longing, and things left unsaid.' },
  { name: 'A little wonder', prompt: 'Warm, observant films that find unexpected wonder in ordinary life.' },
];
// The illustrative sky in the fourth chapter. Positions are decorative.
const DEMO_STARS = [
  { x: 16, y: 62, title: 'After Yang' }, { x: 31, y: 38, title: 'Columbus' }, { x: 49, y: 50, title: 'Still Walking' },
  { x: 66, y: 30, title: 'Aftersun' }, { x: 82, y: 46, title: 'Past Lives' },
];

function Still({ film, eager = false }: { film: typeof FILMS.yang; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  return failed ? <div className="welcome-image-fallback">{film.title}</div> : <img src={film.image} alt={`${film.title} film still`} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'} decoding="async" onError={() => setFailed(true)} />;
}

/**
 * Three films orbit the aperture on the same inclined ring. They pass behind the lens and
 * in front of it, and stop whenever a pointer or keyboard focus is inside the instrument,
 * so nothing moves while you aim at it.
 */
function Orrery({ selected, onChoose }: { selected: WelcomeFilm; onChoose: (film: WelcomeFilm) => void }) {
  const { running } = useCelestialMotion();
  const root = useRef<HTMLDivElement>(null);
  const planets = useRef<Array<HTMLButtonElement | null>>([]);
  const held = useRef(false);
  const angle = useRef(0);
  useEffect(() => {
    // The whole instrument is the aiming zone: once a pointer or focus arrives, the orbit rests.
    const host = root.current?.parentElement;
    if (!host) return;
    const hold = () => { held.current = true; };
    const release = () => { held.current = false; };
    const blur = (event: FocusEvent) => { if (!host.contains(event.relatedTarget as Node | null)) release(); };
    host.addEventListener('pointerenter', hold);
    host.addEventListener('pointerleave', release);
    host.addEventListener('focusin', hold);
    host.addEventListener('focusout', blur);
    return () => {
      host.removeEventListener('pointerenter', hold);
      host.removeEventListener('pointerleave', release);
      host.removeEventListener('focusin', hold);
      host.removeEventListener('focusout', blur);
    };
  }, []);
  useEffect(() => {
    const tilt = -28 * Math.PI / 180;
    const place = (offset: number) => ORDER.forEach((_, index) => {
      const planet = planets.current[index];
      if (!planet) return;
      const t = running ? offset + index * Math.PI * 2 / 3 : [.2, .5, .8][index] * Math.PI;
      const ex = 326 * Math.cos(t);
      const ey = 130 * Math.sin(t);
      const x = 340 + ex * Math.cos(tilt) - ey * Math.sin(tilt);
      const y = 340 + ex * Math.sin(tilt) + ey * Math.cos(tilt);
      const depth = Math.sin(t);
      planet.style.setProperty('--x', `${(x / 680 * 100).toFixed(3)}%`);
      planet.style.setProperty('--y', `${(y / 680 * 100).toFixed(3)}%`);
      planet.style.setProperty('--depth', (0.72 + 0.28 * (depth + 1) / 2).toFixed(3));
      planet.dataset.side = depth < -0.12 ? 'far' : 'near';
    });
    if (!running) { place(0); return; }
    let frame = 0;
    let last = performance.now();
    const tick = (time: number) => {
      if (!held.current) angle.current += (time - last) / 1000 * (Math.PI * 2 / 96);
      last = time;
      place(angle.current);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running]);
  return <div className="welcome-orrery" ref={root} role="group" aria-label="Choose a film for the aperture">
    {ORDER.map((key, index) => <button key={key} type="button" ref={element => { planets.current[index] = element; }} className="welcome-planet"
      aria-label={`View ${FILMS[key].title} in the aperture`} aria-pressed={selected === key} onClick={() => onChoose(key)}>
      <span className="welcome-planet-body"><Still film={{ ...FILMS[key], image: FILMS[key].image.replace('/w1280/', '/w300/') }} /></span>
      <span className="welcome-planet-label">{FILMS[key].title}</span>
    </button>)}
  </div>;
}

function DemoSky() {
  const [liked, setLiked] = useState(true);
  const [remembered, setRemembered] = useState(true);
  const [sky, size] = useElementSize<HTMLDivElement>();
  const at = (star: { x: number; y: number }) => ({ x: star.x / 100 * size.width, y: star.y / 100 * size.height });
  return <>
    <div className="welcome-sky" ref={sky} data-liked={liked} data-remembered={remembered} aria-label="An illustrative sky with one reel drawn as a constellation">
      {size.width ? <svg viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true">
        {DEMO_STARS.slice(1).map((star, index) => <line key={index} x1={at(DEMO_STARS[index]).x} y1={at(DEMO_STARS[index]).y} x2={at(star).x} y2={at(star).y} pathLength={1} style={{ '--i': index } as CSSProperties} />)}
      </svg> : null}
      {DEMO_STARS.map((star, index) => <span key={star.title} className={`welcome-sky-star${index === 1 ? ' is-liked' : ''}${index === 3 ? ' is-remembered' : ''}`} style={{ left: `${star.x}%`, top: `${star.y}%`, '--i': index } as CSSProperties}><i /><small>{star.title}</small></span>)}
      <span className="welcome-sky-star is-saved" style={{ left: '88%', top: '76%' }}><i /><small>Saved for later</small></span>
      <p className="welcome-sky-name">The Melancholy Futurist</p>
    </div>
    <div className="welcome-sky-controls">
      <button type="button" aria-pressed={liked} onClick={() => setLiked(value => !value)}><span aria-hidden="true">♡</span>Like Columbus</button>
      <button type="button" aria-pressed={remembered} onClick={() => setRemembered(value => !value)}><span aria-hidden="true">✦</span>Keep an afterimage of Aftersun</button>
    </div>
    <p className="welcome-blend" aria-live="polite">{liked && remembered ? 'A loved film shines brighter; an afterimage wears the colors of what stayed.' : liked ? 'A loved film shines a little brighter in your sky.' : remembered ? 'An afterimage rings its star in the colors of what stayed.' : 'Five films, one thread: your reel as a constellation.'}</p>
    <small className="welcome-demo-note">An illustrative sky. Yours begins with your first reel and stays in this browser.</small>
  </>;
}

export function Landing({ onStart, hasDraft, hasReel = false, featuredFilm }: { featuredFilm: WelcomeFilm; onStart: (prompt?: string) => void; hasDraft: boolean; hasReel?: boolean }) {
  const [viewing, setViewing] = useState<WelcomeFilm | null>(null);
  const [previous, setPrevious] = useState<WelcomeFilm | null>(null);
  const selectedFilm = viewing ?? featuredFilm;
  const featured = FILMS[selectedFilm];
  const [chapter, setChapter] = useState(0);
  const [qualities, setQualities] = useState([true, true]);
  const [connection, setConnection] = useState<'columbus' | 'mood'>('columbus');
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  function moveTab(event: KeyboardEvent, index: number) {
    const last = CHAPTERS.length - 1;
    const next = event.key === 'ArrowRight' ? (index + 1) % CHAPTERS.length : event.key === 'ArrowLeft' ? (index + last) % CHAPTERS.length : event.key === 'Home' ? 0 : event.key === 'End' ? last : null;
    if (next === null) return;
    event.preventDefault(); setChapter(next); tabs.current[next]?.focus();
  }
  function choose(film: WelcomeFilm) {
    if (film === selectedFilm) return;
    setPrevious(selectedFilm);
    setViewing(film);
  }
  return <div className="welcome">
    <section className="welcome-hero" aria-labelledby="welcome-title">
      <CelestialSky variant="landing" />
      <div className="welcome-hero-copy">
        <p className="welcome-prelude"><span aria-hidden="true">✦</span> A universe of cinema, connected.</p>
        <h2 id="welcome-title" tabIndex={-1}>Some films<br /><em>stay with you.</em></h2>
        <p className="welcome-description">Follow that feeling. Begin with a film you love and discover the worlds waiting just beyond it.</p>
        <div className="welcome-actions"><button className="welcome-primary" onClick={() => onStart()}>{hasReel ? 'Return to your reel' : hasDraft ? 'Continue your request' : 'Find my next film'} <span aria-hidden="true">↗</span></button><a href="#discover-afterimage">Take a look inside <span aria-hidden="true">↓</span></a></div>
        <p className="welcome-footnote">Five considered films. A new direction to explore. A sky that grows with you.</p>
      </div>
      <div className="welcome-portal" aria-label="The aperture">
        <div className="welcome-portal-aura" aria-hidden="true" />
        <svg className="welcome-portal-rings" viewBox="0 0 680 680" fill="none" aria-hidden="true"><circle cx="340" cy="340" r="227" /><circle cx="340" cy="340" r="243" strokeDasharray="1 9" /><ellipse cx="340" cy="340" rx="326" ry="130" transform="rotate(-28 340 340)" className="welcome-orbit-path" /><path className="welcome-portal-trace" d="M42 457C-20 393 162 241 336 196s306-22 305 35" /><path d="M340 70v17m0 506v17M70 340h17m506 0h17" /><g className="welcome-portal-ticks">{Array.from({ length: 72 }, (_, index) => <path key={index} d={index % 6 ? 'M340 92v5' : 'M340 90v10'} transform={`rotate(${index * 5} 340 340)`} />)}</g></svg>
        <div className="welcome-hero-image">
          {previous && previous !== selectedFilm ? <div className="welcome-aperture-layer is-leaving" key={`from-${previous}`}><Still film={FILMS[previous]} /></div> : null}
          <div className={`welcome-aperture-layer${previous ? ' is-entering' : ''}`} key={selectedFilm}><Still film={featured} eager /></div>
        </div>
        <div className="welcome-aperture-sheen" aria-hidden="true" />
        <div className="welcome-aperture-edge" aria-hidden="true" />
        <div className="welcome-film-credit" aria-live="polite"><span>In the aperture</span><strong>{featured.title}</strong><span>{featured.year} · {featured.director}</span></div>
        <Orrery selected={selectedFilm} onChoose={choose} />
        <span className="welcome-portal-caption">A film is only the beginning.</span>
      </div>
    </section>
    {!hasDraft ? <section className="welcome-starting-points" aria-label="Ideas for your first reel"><p>Or begin with a feeling</p><div>{STARTERS.map(starter => <button key={starter.name} onClick={() => onStart(starter.prompt)}><StarGlyph />{starter.name}<span aria-hidden="true">↗</span></button>)}</div></section> : null}
    <section className="welcome-discovery" id="discover-afterimage" aria-labelledby="welcome-discovery-title">
      <header><p><OrbitMark /> Four ways to follow a feeling</p><h2 id="welcome-discovery-title">Let your curiosity lead.</h2></header>
      <div className="welcome-chapters" role="tablist" aria-label="Explore Afterimage">{CHAPTERS.map((item, index) => <button key={item.name} ref={el => { tabs.current[index] = el; }} id={`welcome-tab-${index}`} role="tab" aria-selected={chapter === index} aria-controls="welcome-chapter" tabIndex={chapter === index ? 0 : -1} onClick={() => setChapter(index)} onKeyDown={event => moveTab(event, index)}>{item.name}<span aria-hidden="true">{index === chapter ? '−' : '+'}</span></button>)}</div>
      <div className="welcome-chapter" role="tabpanel" id="welcome-chapter" aria-labelledby={`welcome-tab-${chapter}`} tabIndex={0}>
        <div className="welcome-chapter-copy"><h3>{CHAPTERS[chapter].title}</h3><p>{CHAPTERS[chapter].copy}</p><small>Explore an illustrative example</small></div>
        <div className={`welcome-example welcome-example-${chapter}`} key={chapter}>
          {chapter === 0 ? <><div className="welcome-example-still"><Still film={FILMS.yang} /><span>After Yang <small>2022 · Kogonada</small></span></div><div className="welcome-example-note"><span>For a request about quiet futures</span><p>A family story where memory and ordinary rituals make a bigger world feel intimate.</p></div></> : null}
          {chapter === 1 ? <><div className="welcome-quality-films">{([FILMS.mood, FILMS.columbus]).map((film, i) => <div key={film.title}><Still film={film} /><span>{film.title}</span><button aria-pressed={qualities[i]} onClick={() => setQualities(current => current.map((value, n) => n === i ? !value : value))}><i aria-hidden="true" />{i === 0 ? 'Restrained longing' : 'Composed spaces'}<b aria-hidden="true">{qualities[i] ? '✓' : '+'}</b></button></div>)}</div><p className="welcome-blend" aria-live="polite">{qualities.every(Boolean) ? 'Restrained longing, told through composed spaces.' : qualities[0] ? 'Restrained longing. The visual direction is open.' : qualities[1] ? 'Composed spaces. The emotional direction is open.' : 'Choose a quality to see how a blend begins.'}</p><small className="welcome-demo-note">Try selecting the qualities above. This example doesn’t change your reel.</small></> : null}
          {chapter === 2 ? <><div className="welcome-map" aria-label="Example connections from After Yang"><svg viewBox="0 0 600 280" preserveAspectRatio="none" aria-hidden="true"><path className={connection === 'columbus' ? 'is-active' : ''} d="M300 190 Q230 64 115 64" /><path className={connection === 'mood' ? 'is-active' : ''} d="M300 190 Q365 64 485 64" /></svg><div className="welcome-map-anchor"><Still film={FILMS.yang} /><span>After Yang</span></div>{(['columbus', 'mood'] as const).map(key => <button className={`welcome-map-${key}`} key={key} aria-label={FILMS[key].title} aria-pressed={connection === key} onClick={() => setConnection(key)}><Still film={FILMS[key]} /><span>{FILMS[key].title}</span></button>)}</div><p className="welcome-map-reading" aria-live="polite">{connection === 'columbus' ? 'Columbus & After Yang: composed spaces give quiet conversations room to unfold.' : 'In the Mood for Love & After Yang: ordinary rituals reveal feelings that words leave unfinished.'}</p><small className="welcome-demo-note">Select a film to read the connection. An editorial reading, not an influence claim.</small></> : null}
          {chapter === 3 ? <DemoSky /> : null}
        </div>
      </div>
    </section>
    <section className="welcome-taste"><span className="welcome-heart" aria-hidden="true"><StarGlyph /></span><div><h2>A sky that grows with you.</h2><p>Like the films you’ve seen and loved, keep an afterimage of what stayed, and watch your own constellations take shape. Each Like gently guides future discoveries, while your request and chosen qualities stay in charge.</p><small>Likes, afterimages and your sky stay in this browser.</small></div><button className="welcome-primary" onClick={() => onStart()}>{hasReel ? 'Return to your reel' : hasDraft ? 'Continue your request' : 'Begin your first reel'} <span aria-hidden="true">↗</span></button></section>
    <footer className="welcome-footer"><span>AFTERIMAGE</span><p>Better films find you.</p><small>Film imagery: <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer noopener">TMDB</a>. This product uses the TMDB API but is not endorsed or certified by TMDB.</small></footer>
  </div>;
}
