'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AfterimageEntry } from '../lib/afterimages';
import type { HalfLifeBook } from '../lib/half-life';
import { FACET_KEYS, FACET_META, type FacetKey } from '../lib/light-table';
import { movieKey } from '../lib/movie-metadata';
import { viewerNotes, type NotesChannel, type NotesLine } from '../lib/notes';
import { facetWords, reelMotifs, type PlateMotif } from '../lib/plate';
import type { SavedReel } from '../lib/reel-history';
import type { LikedFilm } from '../lib/taste-profile';
import { useCelestialMotion } from './celestial';
import { FilmPlate, type PlateFilm } from './film-plate';

type KnownPlate = { film: PlateFilm; palette: readonly string[]; index: number; motif: PlateMotif };
const CHANNEL_WORD: Record<FacetKey, string> = { whereItLives: 'Worlds', howItFeels: 'Feelings', howItLooks: 'Images', howItSpeaks: 'Voices' };
const LINE_SECONDS = 5200;

function longDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Two rows of bars for the four qualities: what was asked for above, what stayed below. */
function Channels({ label, items, tone }: { label: string; items: NotesChannel[]; tone: 'asked' | 'stayed' }) {
  const most = Math.max(1, ...items.map(item => item.count));
  return <div className={`notes-channels is-${tone}`}>
    <h4>{label}</h4>
    <ul>{items.map(item => <li key={item.channel} className={FACET_META[item.channel].className}>
      <span>{CHANNEL_WORD[item.channel]}</span>
      <i aria-hidden="true"><b style={{ width: `${(item.count / most) * 100}%` }} /></i>
      <strong>{item.count}</strong>
    </li>)}</ul>
  </div>;
}

/** The viewer's own lines, played back one at a time like the intertitles of a silent film. */
function Montage({ lines, plates }: { lines: NotesLine[]; plates: Map<string, KnownPlate> }) {
  const { running } = useCelestialMotion();
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const index = Math.min(at, lines.length - 1);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => { if (index >= lines.length - 1) setPlaying(false); else setAt(index + 1); }, LINE_SECONDS);
    return () => window.clearTimeout(timer);
  }, [playing, index, lines.length]);
  const line = lines[index];
  const known = plates.get(movieKey(line.title, line.year));
  return <div className="notes-montage" data-playing={playing}>
    <div className="notes-montage-screen" key={index}>
      <FilmPlate film={known?.film ?? line} palette={known?.palette} index={known?.index ?? index} motif={known?.motif} shape="wide" grain={running} />
      <figure>
        <blockquote>“{line.note}”</blockquote>
        <figcaption><strong>{line.title}</strong> <span>{line.year}</span><small>watched {longDate(line.watchedOn)}{line.stayed.length ? ` · what stayed: ${line.stayed.map(channel => CHANNEL_WORD[channel].toLowerCase()).join(', ')}` : ''}</small></figcaption>
      </figure>
      {playing ? <i className="notes-montage-progress" aria-hidden="true" style={{ animationDuration: `${LINE_SECONDS}ms` }} /> : null}
    </div>
    <div className="notes-montage-controls">
      <button type="button" className="notes-montage-play" onClick={() => { if (!playing && index >= lines.length - 1) setAt(0); setPlaying(!playing); }}>{playing ? 'Pause' : index >= lines.length - 1 && lines.length > 1 ? 'Play again' : 'Play the reel'} <span aria-hidden="true">{playing ? '❙❙' : '▶'}</span></button>
      <button type="button" aria-label="Previous line" disabled={index === 0} onClick={() => { setPlaying(false); setAt(index - 1); }}>←</button>
      <span aria-live={playing ? 'off' : 'polite'}>{String(index + 1).padStart(2, '0')} / {String(lines.length).padStart(2, '0')}</span>
      <button type="button" aria-label="Next line" disabled={index >= lines.length - 1} onClick={() => { setPlaying(false); setAt(index + 1); }}>→</button>
    </div>
  </div>;
}

/**
 * Notes on a viewer: a film-magazine reading of your own history. Counted in this browser
 * from your reels, Likes and afterimages; nothing leaves it unless you ask for a reel.
 */
export function ViewerNotes({ open, opener, reels, liked, afterimages, book, canDevelop, onDevelop, onClose }: {
  open: boolean; opener: HTMLElement | null; reels: SavedReel[]; liked: LikedFilm[]; afterimages: AfterimageEntry[]; book: HalfLifeBook;
  canDevelop: boolean; onDevelop: (request: { films: string[]; creativeBrief: string }) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    heading.current?.focus();
    return () => { if (element?.open) element.close(); if (opener?.isConnected) opener.focus(); };
  }, [open, opener]);

  const notes = useMemo(() => open ? viewerNotes({
    reels: reels.flatMap(reel => reel.state.result ? [{ id: reel.id, savedAt: reel.savedAt, result: reel.state.result, borrowed: FACET_KEYS.filter(channel => reel.state.selectedFacets?.[channel]) }] : []),
    liked, afterimages, book,
  }) : null, [open, reels, liked, afterimages, book]);
  // A film keeps the plate it had in its reel, wherever else it is shown.
  const plates = useMemo(() => {
    const known = new Map<string, KnownPlate>();
    if (!open) return known;
    for (const reel of reels) {
      const result = reel.state.result;
      if (!result) continue;
      const motifs = reelMotifs(result.recommendations.map(film => ({ title: film.title, year: film.year, words: facetWords(film.facets) })));
      result.recommendations.forEach((film, index) => known.set(movieKey(film.title, film.year), { film, palette: result.palette, index, motif: motifs[index] }));
    }
    return known;
  }, [open, reels]);

  if (!open || !notes) return null;
  const issued = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const empty = !notes.counts.reels && !notes.counts.watched && !notes.counts.liked;
  const mostDecade = Math.max(1, ...notes.decades.items.map(item => Math.max(item.kept, item.offered)));
  return <dialog ref={dialog} className="viewer-notes" aria-labelledby="viewer-notes-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="notes-masthead">
      <button type="button" className="notes-back" onClick={onClose}><span aria-hidden="true">←</span> Back</button>
      <p>AFTERIMAGE <span>·</span> Notes on a viewer</p>
      <p className="notes-issue">No. {String(Math.max(1, notes.counts.reels)).padStart(2, '0')} <span>·</span> {issued}</p>
    </header>
    <article className="notes-page">
      <section className="notes-cover">
        <p className="notes-kicker">A reading of your own history</p>
        <h2 id="viewer-notes-title" ref={heading} tabIndex={-1}>{notes.headline}</h2>
        <dl className="notes-counts">
          <div><dt>Reels developed</dt><dd>{notes.counts.reels}</dd></div>
          <div><dt>Films offered</dt><dd>{notes.counts.films}</dd></div>
          <div><dt>Films watched</dt><dd>{notes.counts.watched}</dd></div>
          <div><dt>Films loved</dt><dd>{notes.counts.liked}</dd></div>
        </dl>
        <p className="notes-fine">Counted in this browser from your reels, Likes and afterimages. Nothing here was guessed, and nothing leaves this page unless you ask for a reel at the end.</p>
      </section>

      {empty ? null : <>
      <section className="notes-section notes-stays" aria-labelledby="notes-stays">
        <p className="notes-number">I</p>
        <div>
          <h3 id="notes-stays">What you ask for, and what stays</h3>
          <p className="notes-reading">{notes.stays.reading}</p>
          <div className="notes-channel-pair">
            {notes.stays.borrowed.some(item => item.count) ? <Channels label="Borrowed for a reel" items={notes.stays.borrowed} tone="asked" /> : null}
            <Channels label="Stayed after watching" items={notes.stays.stayed} tone="stayed" />
          </div>
        </div>
      </section>

      {notes.words.items.length ? <section className="notes-section notes-words" aria-labelledby="notes-words">
        <p className="notes-number">II</p>
        <div>
          <h3 id="notes-words">{notes.words.recurring ? 'The words that return' : 'The first words'}</h3>
          <p className="notes-reading">{notes.words.reading}</p>
          <ul className="notes-cloud">{notes.words.items.map((item, index) => <li key={item.word} style={{ fontSize: `${(notes.words.recurring ? 22 + item.weight * 50 : 30).toFixed(0)}px`, opacity: notes.words.recurring ? 0.55 + item.weight * 0.45 : 0.8 }} className={index % 3 === 1 ? 'is-roman' : undefined}>{item.word}{notes.words.recurring ? <sup>{item.reels}</sup> : null}</li>)}</ul>
        </div>
      </section> : null}

      {notes.colour.frames.length ? <section className="notes-section notes-colour" aria-labelledby="notes-colour">
        <p className="notes-number">III</p>
        <div>
          <h3 id="notes-colour">Your light</h3>
          <p className="notes-reading">{notes.colour.reading}</p>
          <ol className="notes-strip">{notes.colour.frames.map(frame => <li key={frame.id} title={`${frame.name}, ${frame.warmth > 0.2 ? 'warm' : frame.warmth < -0.2 ? 'cold' : 'between'}`}>
            <span className="notes-frame" aria-hidden="true">{frame.palette.map((color, index) => <i key={index} style={{ background: color }} />)}</span>
            <strong>{frame.name}</strong><small>{new Date(frame.savedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</small>
          </li>)}</ol>
        </div>
      </section> : null}

      {notes.directors.items.length ? <section className="notes-section notes-directors" aria-labelledby="notes-directors">
        <p className="notes-number">IV</p>
        <div>
          <h3 id="notes-directors">The directors in the room</h3>
          <p className="notes-reading">{notes.directors.reading}</p>
          <ul>{notes.directors.items.map(item => <li key={item.name}><strong>{item.name}</strong><span>{item.reels.length > 1 ? `× ${item.reels.length}` : ''}</span><small>{item.reels.join(' · ')}</small></li>)}</ul>
        </div>
      </section> : null}

      <section className="notes-section notes-half" aria-labelledby="notes-half">
        <p className="notes-number">V</p>
        <div>
          <h3 id="notes-half">What grew, what faded</h3>
          <p className="notes-reading">{notes.halfLife.reading}</p>
          {notes.halfLife.enough ? <dl className="notes-tally"><div className="is-stronger"><dt>Stronger</dt><dd>{notes.halfLife.stronger.length}</dd></div><div><dt>Still there</dt><dd>{notes.halfLife.there}</dd></div><div className="is-gone"><dt>Gone</dt><dd>{notes.halfLife.gone}</dd></div></dl> : null}
        </div>
      </section>

      {notes.decades.items.length ? <section className="notes-section notes-decades" aria-labelledby="notes-decades">
        <p className="notes-number">VI</p>
        <div>
          <h3 id="notes-decades">Your decades</h3>
          <p className="notes-reading">{notes.decades.reading}</p>
          <ol className="notes-years" aria-label="Films by decade: kept and offered">{notes.decades.items.map(item => <li key={item.decade}>
            <span className="notes-bars" aria-hidden="true"><i className="is-kept" style={{ height: `${(item.kept / mostDecade) * 100}%` }} /><i className="is-offered" style={{ height: `${(item.offered / mostDecade) * 100}%` }} /></span>
            <small>{`’${String(item.decade).slice(2)}s`}</small><span className="sr-only">{item.decade}s: {item.kept} kept, {item.offered} offered</span>
          </li>)}</ol>
          <p className="notes-key"><span className="is-kept" /> films you kept (loved or logged) <span className="is-offered" /> films you were offered</p>
        </div>
      </section> : null}

      <section className="notes-section notes-lines" aria-labelledby="notes-lines">
        <p className="notes-number">VII</p>
        <div>
          <h3 id="notes-lines">The reel of what stayed</h3>
          {notes.lines.length ? <><p className="notes-reading">Your own lines, in the order you watched, played back like the intertitles of a silent film.</p><Montage lines={notes.lines} plates={plates} /></>
            : <p className="notes-reading">When you log a film and write one line about what stayed, the lines gather here and play back as a reel of their own. There are none yet.</p>}
        </div>
      </section>

      <section className="notes-end">
        <i className="reel-end-runout" aria-hidden="true" />
        <h3>Now programme from it.</h3>
        <p>{notes.request ? 'Five films for the viewer these notes describe: four that deepen the pattern, and one that argues with it.' : 'Once a word has returned, or a film has stayed, these notes can ask for a reel of their own.'}</p>
        {notes.request ? <button type="button" disabled={!canDevelop} onClick={() => onDevelop(notes.request!)}>Develop a reel from these notes <span aria-hidden="true">↗</span></button> : null}
      </section>
      </>}
      {empty ? <section className="notes-end"><h3>The first page is blank.</h3><p>Develop a reel, watch one of its films, and say what stayed. The notes write themselves from there.</p><button type="button" onClick={onClose}>Back to the films</button></section> : null}
    </article>
  </dialog>;
}
