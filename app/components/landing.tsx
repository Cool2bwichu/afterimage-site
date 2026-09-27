'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { CelestialSky, OrbitMark } from './celestial';

// Verified TMDB stills. These are editorial examples, never generated user results.
const FILMS = {
  yang: { title: 'After Yang', year: '2022', director: 'Kogonada', image: 'https://image.tmdb.org/t/p/w1280/y8ZholsWIn4jR3JoDWOSSFY87vf.jpg' },
  columbus: { title: 'Columbus', year: '2017', director: 'Kogonada', image: 'https://image.tmdb.org/t/p/w1280/xN88RKXxjPAcQsdBz6XavZ00PFh.jpg' },
  mood: { title: 'In the Mood for Love', year: '2000', director: 'Wong Kar-wai', image: 'https://image.tmdb.org/t/p/w1280/ffQFnAUm2Uu4RU0nijpjPRf9TBT.jpg' },
};
export type WelcomeFilm = keyof typeof FILMS;
export function nextWelcomeFilm(previous: string | null): WelcomeFilm {
  const sequence: WelcomeFilm[] = ['yang', 'columbus', 'mood'];
  const index = sequence.findIndex(key => key === previous);
  return sequence[index < 0 ? 1 : (index + 1) % sequence.length];
}
const CHAPTERS = [
  { name: 'Your reel', title: 'Five films. A thread between them.', copy: 'Name a film you love, describe a feeling, or combine both. Get five recommendations with a reason for each one.' },
  { name: 'The Light Table', title: 'Keep the feeling. Change the film.', copy: 'Borrow the mood of one film, the visual language of another. Combine the qualities you want to carry into your next reel.' },
  { name: 'Atlas', title: 'Follow what connects them.', copy: 'Explore how films meet through their worlds, emotions, images and sound. Follow a connection, then find your way back.' },
];
const STARTERS = [
  { name: 'Quiet science fiction', prompt: 'Quiet, intimate science fiction about memory, care, and what makes us human.' },
  { name: 'Longing after dark', prompt: 'Films filled with nocturnal color, restrained longing, and things left unsaid.' },
  { name: 'A little wonder', prompt: 'Warm, observant films that find unexpected wonder in ordinary life.' },
];
function Still({ film, eager = false }: { film: typeof FILMS.yang; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  return failed ? <div className="welcome-image-fallback">{film.title}</div> : <img src={film.image} alt={`${film.title} film still`} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'} decoding="async" onError={() => setFailed(true)} />;
}
export function Landing({ onStart, hasDraft, hasReel = false, featuredFilm }: { featuredFilm: WelcomeFilm; onStart: (prompt?: string) => void; hasDraft: boolean; hasReel?: boolean }) {
  const [viewing, setViewing] = useState<WelcomeFilm | null>(null);
  const selectedFilm = viewing ?? featuredFilm;
  const featured = FILMS[selectedFilm];
  const [chapter, setChapter] = useState(0);
  const [qualities, setQualities] = useState([true, true]);
  const [connection, setConnection] = useState<'columbus' | 'mood'>('columbus');
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  function moveTab(event: KeyboardEvent, index: number) {
    const next = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3 : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : null;
    if (next === null) return;
    event.preventDefault(); setChapter(next); tabs.current[next]?.focus();
  }
  return <div className="welcome">
    <section className="welcome-hero" aria-labelledby="welcome-title">
      <CelestialSky variant="landing" />
      <div className="welcome-hero-copy">
        <p className="welcome-prelude"><span aria-hidden="true">✦</span> A universe of cinema, connected.</p>
        <h2 id="welcome-title" tabIndex={-1}>Some films<br /><em>stay with you.</em></h2>
        <p className="welcome-description">Follow that feeling. Begin with a film you love and discover the worlds waiting just beyond it.</p>
        <div className="welcome-actions"><button className="welcome-primary" onClick={() => onStart()}>{hasReel ? 'Return to your reel' : hasDraft ? 'Continue your request' : 'Find my next film'} <span aria-hidden="true">↗</span></button><a href="#discover-afterimage">Take a look inside <span aria-hidden="true">↓</span></a></div>
        <p className="welcome-footnote">Five considered films. A new direction to explore.</p>
      </div>
      <div className="welcome-portal" aria-label="Look through three films">
        <div className="welcome-portal-aura" aria-hidden="true" />
        <svg className="welcome-portal-rings" viewBox="0 0 680 680" fill="none" aria-hidden="true"><circle cx="340" cy="340" r="227" /><circle cx="340" cy="340" r="243" strokeDasharray="1 9" /><ellipse cx="340" cy="340" rx="326" ry="130" transform="rotate(-28 340 340)" /><path className="welcome-portal-trace" d="M42 457C-20 393 162 241 336 196s306-22 305 35" /><path d="M340 70v17m0 506v17M70 340h17m506 0h17" /></svg>
        <div className="welcome-hero-image"><Still key={selectedFilm} film={featured} eager /></div>
        <div className="welcome-aperture-edge" aria-hidden="true" />
        <div className="welcome-film-credit" aria-live="polite"><span>In the aperture</span><strong>{featured.title}</strong><span>{featured.year} · {featured.director}</span></div>
        <div className="welcome-film-choices" aria-label="Choose a featured film">{(Object.keys(FILMS) as WelcomeFilm[]).map((key, index) => <button key={key} type="button" aria-label={`View ${FILMS[key].title}`} aria-pressed={selectedFilm === key} onClick={() => setViewing(key)}><span className="welcome-film-dot" aria-hidden="true" /><span>{String(index + 1).padStart(2, '0')}</span></button>)}</div>
        <span className="welcome-portal-caption">A film is only the beginning.</span>
      </div>
    </section>
    {!hasDraft ? <section className="welcome-starting-points" aria-label="Ideas for your first reel"><p>Or begin with a feeling</p><div>{STARTERS.map(starter => <button key={starter.name} onClick={() => onStart(starter.prompt)}>{starter.name}<span aria-hidden="true">↗</span></button>)}</div></section> : null}
    <section className="welcome-discovery" id="discover-afterimage" aria-labelledby="welcome-discovery-title">
      <header><p><OrbitMark /> Three ways to follow a feeling</p><h2 id="welcome-discovery-title">Let your curiosity lead.</h2></header>
      <div className="welcome-chapters" role="tablist" aria-label="Explore Afterimage">{CHAPTERS.map((item, index) => <button key={item.name} ref={el => { tabs.current[index] = el; }} id={`welcome-tab-${index}`} role="tab" aria-selected={chapter === index} aria-controls="welcome-chapter" tabIndex={chapter === index ? 0 : -1} onClick={() => setChapter(index)} onKeyDown={event => moveTab(event, index)}>{item.name}<span aria-hidden="true">{index === chapter ? '−' : '+'}</span></button>)}</div>
      <div className="welcome-chapter" role="tabpanel" id="welcome-chapter" aria-labelledby={`welcome-tab-${chapter}`} tabIndex={0}>
        <div className="welcome-chapter-copy"><h3>{CHAPTERS[chapter].title}</h3><p>{CHAPTERS[chapter].copy}</p><small>Explore an illustrative example</small></div>
        <div className={`welcome-example welcome-example-${chapter}`} key={chapter}>
          {chapter === 0 ? <><div className="welcome-example-still"><Still film={FILMS.yang} /><span>After Yang <small>2022 · Kogonada</small></span></div><div className="welcome-example-note"><span>For a request about quiet futures</span><p>A family story where memory and ordinary rituals make a bigger world feel intimate.</p></div></> : null}
          {chapter === 1 ? <><div className="welcome-quality-films">{([FILMS.mood, FILMS.columbus]).map((film, i) => <div key={film.title}><Still film={film} /><span>{film.title}</span><button aria-pressed={qualities[i]} onClick={() => setQualities(current => current.map((value, n) => n === i ? !value : value))}><i aria-hidden="true" />{i === 0 ? 'Restrained longing' : 'Composed spaces'}<b aria-hidden="true">{qualities[i] ? '✓' : '+'}</b></button></div>)}</div><p className="welcome-blend" aria-live="polite">{qualities.every(Boolean) ? 'Restrained longing, told through composed spaces.' : qualities[0] ? 'Restrained longing. The visual direction is open.' : qualities[1] ? 'Composed spaces. The emotional direction is open.' : 'Choose a quality to see how a blend begins.'}</p><small className="welcome-demo-note">Try selecting the qualities above. This example doesn’t change your reel.</small></> : null}
          {chapter === 2 ? <><div className="welcome-map" aria-label="Example connections from After Yang"><svg viewBox="0 0 600 280" preserveAspectRatio="none" aria-hidden="true"><path className={connection === 'columbus' ? 'is-active' : ''} d="M300 190 Q230 64 115 64" /><path className={connection === 'mood' ? 'is-active' : ''} d="M300 190 Q365 64 485 64" /></svg><div className="welcome-map-anchor"><Still film={FILMS.yang} /><span>After Yang</span></div>{(['columbus', 'mood'] as const).map(key => <button className={`welcome-map-${key}`} key={key} aria-label={FILMS[key].title} aria-pressed={connection === key} onClick={() => setConnection(key)}><Still film={FILMS[key]} /><span>{FILMS[key].title}</span></button>)}</div><p className="welcome-map-reading" aria-live="polite">{connection === 'columbus' ? 'Columbus & After Yang: composed spaces give quiet conversations room to unfold.' : 'In the Mood for Love & After Yang: ordinary rituals reveal feelings that words leave unfinished.'}</p><small className="welcome-demo-note">Select a film to read the connection. An editorial reading, not an influence claim.</small></> : null}
        </div>
      </div>
    </section>
    <section className="welcome-taste"><span className="welcome-heart" aria-hidden="true">♡</span><div><h2>A little more you, every time.</h2><p>Like films you’ve seen and loved. Each Like gently guides future discoveries, while your request and chosen qualities stay in charge.</p><small>Likes and your exploration trail stay in this browser.</small></div><button className="welcome-primary" onClick={() => onStart()}>{hasReel ? 'Return to your reel' : hasDraft ? 'Continue your request' : 'Begin your first reel'} <span aria-hidden="true">↗</span></button></section>
    <footer className="welcome-footer"><span>AFTERIMAGE</span><p>Better films find you.</p><small>Film imagery: <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer noopener">TMDB</a>. This product uses the TMDB API but is not endorsed or certified by TMDB.</small></footer>
  </div>;
}
