'use client';

import { useRef, useState, type KeyboardEvent } from 'react';

// Verified TMDB stills. These are editorial examples, never generated user results.
const FILMS = {
  yang: { title: 'After Yang', year: '2022', director: 'Kogonada', image: 'https://image.tmdb.org/t/p/w1280/y8ZholsWIn4jR3JoDWOSSFY87vf.jpg' },
  columbus: { title: 'Columbus', year: '2017', director: 'Kogonada', image: 'https://image.tmdb.org/t/p/w1280/xN88RKXxjPAcQsdBz6XavZ00PFh.jpg' },
  mood: { title: 'In the Mood for Love', year: '2000', director: 'Wong Kar-wai', image: 'https://image.tmdb.org/t/p/w1280/ffQFnAUm2Uu4RU0nijpjPRf9TBT.jpg' },
};
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
export function Landing({ onStart, hasDraft, hasReel = false }: { onStart: (prompt?: string) => void; hasDraft: boolean; hasReel?: boolean }) {
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
      <div className="welcome-hero-image"><Still film={FILMS.yang} eager /></div>
      <div className="welcome-hero-copy">
        <p className="welcome-prelude">For the love of film.</p>
        <h2 id="welcome-title" tabIndex={-1}>Some films stay.<br />Find the next one.</h2>
        <p className="welcome-description">Start with a film you love or a feeling you can’t quite name. Discover what to watch next—and why it might stay with you.</p>
        <div className="welcome-actions"><button className="welcome-primary" onClick={() => onStart()}>{hasReel ? 'Return to your reel' : hasDraft ? 'Continue your request' : 'Find my next film'} <span aria-hidden="true">↗</span></button><a href="#discover-afterimage">Take a look inside <span aria-hidden="true">↓</span></a></div>
        <p className="welcome-footnote">Your taste is the starting point.</p>
      </div>
      <div className="welcome-film-credit"><span>On the screen</span><strong>After Yang</strong><span>2022 · Kogonada</span></div>
    </section>
    {!hasDraft ? <section className="welcome-starting-points" aria-label="Ideas for your first reel"><p>Or begin with a feeling</p><div>{STARTERS.map(starter => <button key={starter.name} onClick={() => onStart(starter.prompt)}>{starter.name}<span aria-hidden="true">↗</span></button>)}</div></section> : null}
    <section className="welcome-discovery" id="discover-afterimage" aria-labelledby="welcome-discovery-title">
      <header><p>A different way to find a film</p><h2 id="welcome-discovery-title">Let your curiosity lead.</h2></header>
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
