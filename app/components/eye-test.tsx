'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createEyeTest, eyeTestRequest, type EyeFrame, type EyePick, type EyeRound } from '../lib/eye-test';
import { fetchFilmEnrichment } from '../lib/enrichment-client';
import { movieKey } from '../lib/movie-metadata';
import { StarGlyph } from './celestial';

type Stills = Record<string, string | null>;

/** A frame from the catalogue when there is one; otherwise the film's look, painted in its colours. */
function Frame({ frame, still, revealed }: { frame: EyeFrame; still: string | null | undefined; revealed: boolean }) {
  const [failed, setFailed] = useState(false);
  const painted = !still || failed;
  return <span className={`eye-frame${painted ? ' is-painted' : ''}`} style={{ '--a': frame.palette[0], '--b': frame.palette[1], '--c': frame.palette[2] } as CSSProperties}>
    {!painted ? <img src={still!} alt="" onError={() => setFailed(true)} /> : <span className="eye-frame-paint" aria-hidden="true"><i /><i /><i /></span>}
    {painted ? <em className="eye-frame-look">{frame.look}</em> : null}
    <span className={`eye-frame-title${revealed || painted ? ' is-shown' : ''}`}><strong>{frame.title}</strong> <small>{frame.year}</small></span>
  </span>;
}

/**
 * Five pairs of frames, one tap each. The choices become the reel's request; nothing is
 * asked of Claude until the viewer chooses to develop it.
 */
// Mounted for each sitting, so every visit deals a new deck.
export function EyeTest({ opener, canLookUp, onFinish, onClose }: {
  opener: HTMLElement | null; canLookUp: boolean;
  onFinish: (request: { films: string[]; creativeBrief: string }) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [rounds, setRounds] = useState<EyeRound[]>(() => createEyeTest());
  const [picks, setPicks] = useState<EyePick[]>([]);
  const [revealing, setRevealing] = useState<EyePick | null>(null);
  const [stills, setStills] = useState<Stills>({});
  const advance = useRef<number | null>(null);

  const restart = useCallback(() => {
    if (advance.current) window.clearTimeout(advance.current);
    setRounds(createEyeTest());
    setPicks([]);
    setRevealing(null);
  }, []);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    requestAnimationFrame(() => heading.current?.focus());
    return () => {
      if (advance.current) window.clearTimeout(advance.current);
      if (element?.open) element.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [opener]);

  // Stills come from the catalogue, five films to a request; without it, frames are painted.
  useEffect(() => {
    if (!canLookUp || !rounds.length) return;
    const films = rounds.flatMap(round => round.frames).filter(frame => stills[movieKey(frame.title, frame.year)] === undefined);
    if (!films.length) return;
    const controller = new AbortController();
    const batches = [films.slice(0, 5), films.slice(5, 10)].filter(batch => batch.length);
    for (const batch of batches) {
      void fetchFilmEnrichment({ recommendations: batch, signal: controller.signal })
        .then(records => {
          if (controller.signal.aborted) return;
          setStills(current => {
            const next = { ...current };
            for (const record of records) {
              const image = record.status === 'matched' ? record.backdropUrl ?? record.posterUrl : null;
              next[record.key] = image ? image.replace('/w1280/', '/w780/') : null;
            }
            return next;
          });
        })
        .catch(() => {
          if (!controller.signal.aborted) setStills(current => ({ ...current, ...Object.fromEntries(batch.map(frame => [movieKey(frame.title, frame.year), null])) }));
        });
    }
    return () => controller.abort();
    // Only a new deck asks for stills; answers are kept for the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canLookUp, rounds]);

  const finished = rounds.length > 0 && picks.length >= rounds.length;
  const round = rounds[picks.length];

  function choose(pick: EyePick) {
    if (revealing !== null || !round) return;
    setRevealing(pick);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    advance.current = window.setTimeout(() => {
      setPicks(current => [...current, pick]);
      setRevealing(null);
    }, reduced ? 700 : 1300);
  }

  return <dialog ref={dialog} className="eye-test" aria-labelledby="eye-test-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => {
      if (finished || revealing !== null) return;
      if (event.key === 'ArrowLeft' || event.key === '1') { event.preventDefault(); choose(0); }
      if (event.key === 'ArrowRight' || event.key === '2') { event.preventDefault(); choose(1); }
    }}>
    <header className="eye-test-head">
      <p className="eye-test-kicker"><StarGlyph />The Eye Test</p>
      <h2 id="eye-test-title" ref={heading} tabIndex={-1}>{finished ? 'Your eye' : round ? round.question : 'The Eye Test'}</h2>
      {!finished && rounds.length ? <ol className="eye-test-progress" aria-label={`Pair ${picks.length + 1} of ${rounds.length}`}>
        {rounds.map((item, index) => <li key={item.axis} className={index < picks.length ? 'is-done' : index === picks.length ? 'is-current' : undefined} />)}
      </ol> : null}
      <button type="button" className="eye-test-close" onClick={onClose} aria-label="Close the Eye Test">×</button>
    </header>
    {!finished && round ? <div className="eye-test-pair" key={round.axis}>
      <p className="eye-test-ask">Tap the one that pulls you in. <span>No wrong answers, and no typing.</span></p>
      <div className="eye-test-frames">
        {round.frames.map((frame, index) => <button key={frame.title} type="button" className={`eye-test-choice${revealing === index ? ' is-chosen' : revealing !== null ? ' is-passed' : ''}`}
          aria-label={`${index === 0 ? 'Left' : 'Right'} frame: ${frame.look}`} disabled={revealing !== null} onClick={() => choose(index as EyePick)}>
          <Frame frame={frame} still={stills[movieKey(frame.title, frame.year)]} revealed={revealing !== null} />
          <span className="eye-test-pole" aria-hidden={revealing === null}>{revealing !== null ? frame.pole : ''}</span>
        </button>)}
      </div>
      <p className="sr-only" aria-live="polite">{revealing !== null ? `You chose ${round.frames[revealing].title}, ${round.frames[revealing].pole}, over ${round.frames[1 - revealing].title}.` : ''}</p>
    </div> : null}
    {finished ? <div className="eye-test-result">
      <p>Five frames that pulled you in. AFTERIMAGE will develop a reel from how they look and feel.</p>
      <ol className="eye-test-strip">{rounds.map((item, index) => {
        const frame = item.frames[picks[index]];
        return <li key={item.axis} style={{ '--i': index } as CSSProperties}>
          <Frame frame={frame} still={stills[movieKey(frame.title, frame.year)]} revealed />
          <span>{frame.pole}</span>
        </li>;
      })}</ol>
      <div className="eye-test-actions">
        <button type="button" className="eye-test-develop" onClick={() => onFinish(eyeTestRequest(rounds, picks))}>Develop my reel <span aria-hidden="true">↗</span></button>
        <button type="button" className="eye-test-again" onClick={restart}>Take it again</button>
      </div>
    </div> : null}
    <p className="eye-test-note">{canLookUp ? 'Frames from TMDB. ' : 'Painted from each film’s colours. '}Only your final reel asks Claude.</p>
  </dialog>;
}
