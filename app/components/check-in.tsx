'use client';

import { useEffect, useRef, useState } from 'react';
import type { AfterimageEntry } from '../lib/afterimages';
import {
  CHECKPOINTS, READINGS, READING_LABEL, READING_STRENGTH, checkInCalendar, halfLifeReading, halfLifeSeries, nextCheckpoint,
  type CheckIn, type HalfLifeBook, type Reading,
} from '../lib/half-life';
import { saveFile } from '../lib/save-file';
import { StarGlyph } from './celestial';

// The film in question burns gold; the others take the page's other inks.
const GOLD = '#dec6a0';
const INKS = ['#c98c9a', '#9cbbb9', '#d98b5f', '#a7b6c5'];
const LEVELS: Reading[] = ['stronger', 'there', 'gone'];
const LONGEST_LABEL = 22;

function since(checkIn: CheckIn): string {
  return checkIn.days >= 120 && checkIn.checkpoint.id !== 'year' ? `${Math.round(checkIn.days / 30)} months` : checkIn.checkpoint.since;
}

/** Still with you: how strongly each film in the journal has stayed, answer by answer. */
export function StillWithYou({ entries, book, focus }: { entries: readonly AfterimageEntry[]; book: HalfLifeBook; focus: { title: string; year: string } }) {
  const frame = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(560);
  useEffect(() => {
    const element = frame.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([item]) => { if (item) setWidth(Math.max(240, Math.round(item.contentRect.width))); });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const films = halfLifeSeries(entries, book, focus);
  if (!films.length) return null;
  // Wide enough, each line is named where it ends, as on the page; narrower, a key sits underneath.
  const wide = width >= 460;
  const height = wide ? 220 : 180;
  const [left, right, top, bottom] = [62, wide ? 150 : 16, 14, 30];
  const x = (index: number) => left + index * (width - left - right) / (CHECKPOINTS.length - 1);
  const y = (value: number) => top + (1 - value) * (height - top - bottom);
  const taken: number[] = [];
  let ink = 0;
  const lines = films.map(film => {
    const colour = film.focus ? GOLD : INKS[ink++ % INKS.length];
    const points = film.readings.map(reading => ({ x: x(CHECKPOINTS.indexOf(reading.checkpoint)), y: y(READING_STRENGTH[reading.value]) }));
    const last = points.at(-1)!;
    let labelY = last.y + 5;
    while (taken.some(other => Math.abs(other - labelY) < 16)) labelY += 16;
    taken.push(labelY);
    const label = film.title.length > LONGEST_LABEL ? `${film.title.slice(0, LONGEST_LABEL - 1).trimEnd()}…` : film.title;
    return { film, colour, points, last, labelY, label };
  });
  const summary = films.map(film => `${film.title}: ${film.readings.map(reading => `${reading.checkpoint.label.toLocaleLowerCase()}, ${READING_LABEL[reading.value].toLocaleLowerCase()}`).join('; ')}`).join('. ');

  return <figure className="still-with-you" ref={frame}>
    <figcaption>Still with you</figcaption>
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={summary}>
      {LEVELS.map(level => <g key={level}>
        <line className="still-grid" x1={left} x2={width - right + 8} y1={y(READING_STRENGTH[level])} y2={y(READING_STRENGTH[level])} />
        <text className="still-tick" x={left - 10} y={y(READING_STRENGTH[level]) + 4} textAnchor="end">{level}</text>
      </g>)}
      {CHECKPOINTS.map((checkpoint, index) => <text key={checkpoint.id} className="still-tick" x={x(index)} y={height - 8} textAnchor="middle">{checkpoint.short}</text>)}
      {/* The film in question is drawn last, so it sits on top. */}
      {[...lines].reverse().map(({ film, colour, points, last, labelY, label }) => <g key={`${film.title}|${film.year}`} data-focus={film.focus || undefined}>
        {points.length > 1 ? <path className="still-line" style={{ stroke: colour }} d={points.map((point, index) => `${index ? 'L' : 'M'}${point.x} ${point.y}`).join('')} /> : null}
        {points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={index === points.length - 1 ? 4 : 2.5} style={{ fill: colour }} />)}
        {wide ? <text className="still-label" x={last.x + 10} y={labelY} style={{ fill: colour }}>{label}</text> : null}
      </g>)}
    </svg>
    {wide ? null : <ul className="still-key" aria-hidden="true">{lines.map(({ film, colour }) => <li key={`${film.title}|${film.year}`}><i style={{ background: colour }} />{film.title}</li>)}</ul>}
  </figure>;
}

/**
 * Half-life: a day, a week, a month, a season and a year after a film, Afterimage asks
 * once whether it is still with you. One tap. The answer stays in this browser and only
 * changes how the film shines in your sky; it shapes recommendations only if you Like it.
 */
export function CheckInCard({ checkIn, entries, book, liked, canDevelop, growingCount, onAnswer, onLater, onLike, onDevelop, onClose }: {
  checkIn: CheckIn; entries: readonly AfterimageEntry[]; book: HalfLifeBook; liked: boolean; canDevelop: boolean;
  /** Films whose last answer was "stronger", this one included once answered. */
  growingCount: number;
  onAnswer: (reading: Reading) => void; onLater: () => void; onLike: () => void; onDevelop: () => void; onClose: () => void;
}) {
  const [answered, setAnswered] = useState<Reading | null>(null);
  const [likedNow, setLikedNow] = useState(false);
  const [note, setNote] = useState('');
  const film = checkIn.entry;

  async function remind() {
    try {
      const text = checkInCalendar(film, new URL(document.baseURI).href);
      const result = await saveFile(`afterimage-${film.title.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'film'}-check-ins.ics`, new Blob([text], { type: 'text/calendar' }));
      setNote(result === 'downloaded' ? 'A reminder for each check-in. Open the file to add them to your calendar.' : '');
    } catch { setNote('The reminders could not be saved here.'); }
  }

  if (answered) {
    const next = nextCheckpoint(checkIn.checkpoint);
    return <aside className="check-in is-answered" aria-label={`${film.title}, ${checkIn.checkpoint.label.toLocaleLowerCase()}`} data-reading={answered}>
      <p className="check-in-kicker"><StarGlyph />Half-life · {checkIn.checkpoint.label}</p>
      <button type="button" className="check-in-close" aria-label="Close" onClick={onClose}>×</button>
      <p className="check-in-reply" role="status"><small>Thank you</small>{next
        ? <>We’ll ask about <em>{film.title}</em> {nextCheckpoint(next) ? 'again' : 'once more'}, {next.since} after you saw it.</>
        : <>That was the last time we’ll ask about <em>{film.title}</em>. A year on, it has settled.</>}</p>
      <StillWithYou entries={entries} book={book} focus={film} />
      <p className="check-in-reading">{halfLifeReading(answered, film, entries, book)}</p>
      <div className="check-in-actions">
        {answered === 'stronger' && !liked && !likedNow ? <button type="button" onClick={() => { onLike(); setLikedNow(true); }}>Like it, so it guides future reels</button> : null}
        {answered === 'stronger' && canDevelop ? <button type="button" className="is-primary" onClick={onDevelop}>{growingCount > 1 ? `A reel from the ${growingCount} films that grew` : 'A reel with its staying power'} <span aria-hidden="true">↗</span></button> : null}
      </div>
    </aside>;
  }

  return <aside className="check-in" aria-label={`Is ${film.title} still with you?`}>
    <p className="check-in-kicker"><StarGlyph />Half-life · A check-in, {since(checkIn)} after</p>
    <p className="check-in-question">It’s been {since(checkIn)} since <strong>{film.title}</strong>. Is it still with you?</p>
    <div className="check-in-readings" role="group" aria-label="Your answer">
      {READINGS.map(reading => <button type="button" key={reading} data-reading={reading} onClick={() => { onAnswer(reading); setAnswered(reading); }}>
        <i aria-hidden="true" />{READING_LABEL[reading]}</button>)}
    </div>
    <p className="check-in-small">
      <button type="button" onClick={onLater}>Ask me later</button>
      <button type="button" onClick={() => void remind()}>Put the check-ins in my calendar</button>
      <span>Your answer stays in this browser.</span>
    </p>
    {note ? <p className="check-in-note" role="status">{note}</p> : null}
  </aside>;
}
