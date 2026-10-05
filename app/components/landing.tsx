'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { CelestialSky, useCelestialMotion } from './celestial';
import { apiFetch } from '../lib/api';
import { parseFilmSearchResults, type FilmSearchResult } from '../lib/film-search';
import { BLANK_SENTENCE, SENTENCE_WORDS, cycleWord, hasAnswer, questionRequest, wordText, type ChosenFilm, type SentenceChoice, type SentenceKey } from '../lib/one-question';

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
function Still({ film, eager = false }: { film: typeof FILMS.yang; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  return failed ? <div className="welcome-image-fallback">{film.title}</div> : <img src={film.image} alt={`${film.title} film still`} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'} decoding="async" onError={() => setFailed(true)} />;
}

/**
 * Three films orbit the aperture on the same inclined ring, passing behind the lens and in
 * front of it. When a pointer or keyboard focus reaches the instrument they gather on the
 * near side and rest there, each fully in reach, until you leave.
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
    // Where the films rest when someone reaches for them: on the near side, clear of the lens and its credit.
    const front = [.25, .75, .95].map(turn => turn * Math.PI);
    const place = (index: number, t: number) => {
      const planet = planets.current[index];
      if (!planet) return;
      const ex = 326 * Math.cos(t);
      const ey = 130 * Math.sin(t);
      const x = 340 + ex * Math.cos(tilt) - ey * Math.sin(tilt);
      const y = 340 + ex * Math.sin(tilt) + ey * Math.cos(tilt);
      const depth = Math.sin(t);
      planet.style.setProperty('--x', `${(x / 680 * 100).toFixed(3)}%`);
      planet.style.setProperty('--y', `${(y / 680 * 100).toFixed(3)}%`);
      planet.style.setProperty('--depth', (0.72 + 0.28 * (depth + 1) / 2).toFixed(3));
      planet.dataset.side = depth < -0.12 ? 'far' : 'near';
    };
    if (!running) { front.forEach((t, index) => place(index, t)); return; }
    const current = ORDER.map((_, index) => angle.current + index * Math.PI * 2 / 3);
    let frame = 0;
    let last = performance.now();
    const tick = (time: number) => {
      const seconds = Math.min(.1, (time - last) / 1000);
      last = time;
      if (!held.current) angle.current += seconds * (Math.PI * 2 / 96);
      current.forEach((t, index) => {
        const target = held.current ? front[index] : angle.current + index * Math.PI * 2 / 3;
        const delta = ((target - t + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        current[index] = t + delta * Math.min(1, seconds * 7);
        place(index, current[index]);
      });
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

type QuestionRequest = { films: string[]; creativeBrief: string };

/** One tappable word of the sentence: each tap tries the next option, then back to blank. */
function SentenceWord({ choice, wordKey, onChange }: { choice: SentenceChoice; wordKey: SentenceKey; onChange: (next: SentenceChoice) => void }) {
  const word = SENTENCE_WORDS.find(item => item.key === wordKey)!;
  const value = wordText(choice, wordKey);
  const step = (event: MouseEvent<HTMLButtonElement>) => onChange(cycleWord(choice, wordKey, event.shiftKey ? -1 : 1));
  return <button type="button" className={`welcome-word${value ? ' is-set' : ''}`} onClick={step}
    onKeyDown={event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') { event.preventDefault(); onChange(cycleWord(choice, wordKey, 1)); }
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') { event.preventDefault(); onChange(cycleWord(choice, wordKey, -1)); }
      if ((event.key === 'Backspace' || event.key === 'Delete') && value) { event.preventDefault(); onChange({ ...choice, [wordKey]: -1 }); }
    }}
    aria-label={`${word.label}: ${value ?? 'open'}. Tap for another.`}>
    <span key={value ?? 'blank'}>{value ?? word.blank}</span>
  </button>;
}

/**
 * The entrance asks one thing. Answer with a film from the catalogue, or in your own words,
 * and fill in as much of the sentence as you like; nothing else is required.
 */
function Question({ canSearch, onAnswer, film, setFilm, blind, onBlind }: {
  canSearch: boolean; onAnswer: (request: QuestionRequest) => void; film: ChosenFilm | null; setFilm: (film: ChosenFilm | null) => void;
  blind: boolean; onBlind: (on: boolean) => void;
}) {
  const [text, setText] = useState('');
  const [choice, setChoice] = useState<SentenceChoice>(BLANK_SENTENCE);
  const [suggestions, setSuggestions] = useState<FilmSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const term = text.trim();

  useEffect(() => {
    if (!canSearch || film || term.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await apiFetch(`/api/films/search?q=${encodeURIComponent(term)}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
        if (!response.ok) return;
        const payload: unknown = await response.json();
        const films = payload && typeof payload === 'object' && 'films' in payload ? parseFilmSearchResults(payload.films).slice(0, 5) : [];
        if (!controller.signal.aborted) { setSuggestions(films); setActive(-1); }
      } catch { /* Suggestions are optional: what was typed still works as an answer. */ }
    }, 280);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [term, canSearch, film]);

  const shown = open && !film && term.length >= 2 ? suggestions : [];
  function choose(result: FilmSearchResult) {
    setFilm({ title: result.title, year: result.year, tmdbId: result.id, posterUrl: result.posterUrl });
    setText(''); setOpen(false); setSuggestions([]);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    const request = questionRequest(text, film, choice);
    if (request) onAnswer(request);
    else input.current?.focus();
  }
  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (!shown.length) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => (index + 1) % shown.length); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => (index <= 0 ? shown.length : index) - 1); }
    else if (event.key === 'Enter' && active >= 0) { event.preventDefault(); choose(shown[active]); }
    else if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
  }

  return <form className="welcome-question" onSubmit={submit} aria-label="What stayed with you?">
    <div className={`welcome-answer${film ? ' has-film' : ''}`}>
      {film ? <span className="welcome-chosen">
        <span className="welcome-chosen-poster" aria-hidden="true">{film.posterUrl ? <img src={film.posterUrl.replace('/w500/', '/w92/')} alt="" /> : film.title.slice(0, 1)}</span>
        <span><strong>{film.title}</strong> <small>{film.year}</small></span>
        <button type="button" aria-label={`Remove ${film.title}`} onClick={() => { setFilm(null); requestAnimationFrame(() => input.current?.focus()); }}>×</button>
      </span> : <>
        <label className="sr-only" htmlFor="welcome-answer">A film, a scene or a feeling</label>
        <input ref={input} id="welcome-answer" type="text" autoComplete="off" maxLength={600} value={text} placeholder="A film, a scene, a feeling…"
          role="combobox" aria-autocomplete="list" aria-expanded={shown.length > 0} aria-controls={listId}
          aria-activedescendant={active >= 0 && shown[active] ? `${listId}-${active}` : undefined}
          onChange={event => { setText(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)} onKeyDown={onKey} />
      </>}
      <ul id={listId} role="listbox" className="welcome-suggestions" aria-label="Films in the catalogue" hidden={!shown.length}>
        {shown.map((result, index) => <li key={result.id} id={`${listId}-${index}`} role="option" aria-selected={index === active}
          onMouseDown={event => { event.preventDefault(); choose(result); }}>
          <span className="welcome-suggestion-poster" aria-hidden="true">{result.posterUrl ? <img src={result.posterUrl.replace('/w500/', '/w92/')} alt="" loading="lazy" /> : result.title.slice(0, 1)}</span>
          <span><strong>{result.title}</strong> <small>{result.year}</small></span>
        </li>)}
      </ul>
    </div>
    <p className="welcome-sentence">Something <SentenceWord choice={choice} wordKey="mood" onChange={setChoice} /> to watch <SentenceWord choice={choice} wordKey="company" onChange={setChoice} />, <SentenceWord choice={choice} wordKey="time" onChange={setChoice} />.</p>
    <div className="welcome-actions">
      <button type="submit" className="welcome-primary" disabled={!hasAnswer(text, film, choice)}>{blind ? 'Develop it blind' : 'Develop my reel'} <span aria-hidden="true">↗</span></button>
      <button type="button" className="welcome-blind" aria-pressed={blind} onClick={() => onBlind(!blind)}
        title="The reel arrives veiled: no titles, posters or names, only what each film is like.">
        <i aria-hidden="true" /><span>Blind screening</span><small>{blind ? 'On: the reel arrives veiled' : 'Choose without names'}</small></button>
    </div>
  </form>;
}

export function Landing({ onStart, onAnswer, onEyeTest, onCredits, onBetween, blind, onBlind, checkIn, canSearch, hasDraft, hasReel = false, featuredFilm }: {
  featuredFilm: WelcomeFilm; onStart: () => void; onAnswer: (request: QuestionRequest) => void; onEyeTest: () => void;
  /** The other ways in: where you want to be at the credits, and a film for two. */
  onCredits: () => void; onBetween: () => void;
  /** Blind screening: the next reel arrives veiled. */
  blind: boolean; onBlind: (on: boolean) => void;
  /** A film from the journal, asking whether it is still with you. */
  checkIn?: ReactNode;
  canSearch: boolean; hasDraft: boolean; hasReel?: boolean;
}) {
  const [viewing, setViewing] = useState<WelcomeFilm | null>(null);
  const [previous, setPrevious] = useState<WelcomeFilm | null>(null);
  const [picked, setPicked] = useState<ChosenFilm | null>(null);
  const selectedFilm = viewing ?? featuredFilm;
  const featured = FILMS[selectedFilm];
  function choose(film: WelcomeFilm) {
    if (film === selectedFilm) return;
    setPrevious(selectedFilm);
    setViewing(film);
  }
  return <div className="welcome">
    <section className="welcome-hero" aria-labelledby="welcome-title">
      <CelestialSky variant="landing" />
      <div className="welcome-hero-copy">
        {checkIn}
        <p className="welcome-prelude"><span aria-hidden="true">✦</span> Some films stay with you.</p>
        <h2 id="welcome-title" tabIndex={-1}>What stayed<br /><em>with you?</em></h2>
        <Question canSearch={canSearch} onAnswer={onAnswer} film={picked} setFilm={setPicked} blind={blind} onBlind={onBlind} />
        <nav className="welcome-doors" aria-label="Other ways in">
          <p>Other ways in</p>
          <ul>
            <li><button type="button" onClick={onCredits}><strong>Ask the credits question</strong><span>Where do you want to be when they roll?</span></button></li>
            <li><button type="button" onClick={onBetween}><strong>Choose for two</strong><span>Three films each, and the films between you.</span></button></li>
            <li><button type="button" onClick={onEyeTest}><strong>Take the Eye Test</strong><span>Can’t put it into words? Pick frames instead.</span></button></li>
          </ul>
          <button type="button" className="welcome-composer" onClick={() => onStart()}>{hasReel ? 'Return to your reel' : hasDraft ? 'Continue your request' : 'Use the full composer'} <span aria-hidden="true">→</span></button>
        </nav>
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
        <div className="welcome-film-credit" aria-live="polite"><span>In the aperture</span><strong>{featured.title}</strong><span>{featured.year} · {featured.director}</span>
          <button type="button" className="welcome-credit-pick" onClick={() => setPicked({ title: featured.title, year: featured.year })}>This one stayed with me</button></div>
        <Orrery selected={selectedFilm} onChoose={choose} />
        <span className="welcome-portal-caption">A film is only the beginning.</span>
      </div>
    </section>
    <footer className="welcome-footer"><span>AFTERIMAGE</span><p>Better films find you.</p>
      <details className="welcome-how"><summary>How it works</summary><p>Tell AFTERIMAGE one film or feeling and it develops a reel of five films, each with a reason. From any film you can borrow its qualities on the Light Table, open its Atlas of connections, or collide it with another film. Your likes, afterimages and sky stay in this browser.</p></details>
      <small>Film imagery: <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer noopener">TMDB</a>. This product uses the TMDB API but is not endorsed or certified by TMDB.</small></footer>
  </div>;
}
