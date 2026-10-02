'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { apiFetch } from '../lib/api';
import { buildCollisionInput, parseCollision, type CollisionFilm, type CollisionResult } from '../lib/collision';
import { fetchFilmEnrichment, persistableEnrichment } from '../lib/enrichment-client';
import { DRAFT_POLL_MS } from '../lib/generation-poller';
import { isGenerationJobId, parseJobDraft, parseJobStart, type DraftFilm } from '../lib/generation-state';
import { movieKey, type FilmEnrichment } from '../lib/movie-metadata';
import type { ExcludedFilm } from '../lib/reel-state';
import { StarGlyph } from './celestial';

export type CollisionState = {
  films: [CollisionFilm, CollisionFilm];
  status: 'starting' | 'developing' | 'complete' | 'failed';
  jobId?: string;
  draft?: DraftFilm;
  result?: CollisionResult;
  error?: string;
};

type Extras = { excludedFilms: readonly ExcludedFilm[]; likedFilms: readonly ExcludedFilm[]; creativeBrief: string; reelFilms: readonly ExcludedFilm[] };

function failureMessage(payload: unknown, fallback: string) {
  return payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string' && payload.error.trim()
    ? payload.error.trim().slice(0, 300) : fallback;
}

/**
 * Runs one collision as a job on the companion (or in the page, in the Artifact edition).
 * The job keeps developing when the chamber is closed; reopening shows where it is.
 */
export function useCollision({ onLocked, onFound }: { onLocked: () => void; onFound: (result: CollisionResult) => void }) {
  const [state, setState] = useState<CollisionState | null>(null);
  const [open, setOpen] = useState(false);
  const found = useRef(onFound);
  useEffect(() => { found.current = onFound; }, [onFound]);

  const start = useCallback(async (first: CollisionFilm, second: CollisionFilm, extras: Extras) => {
    const films: [CollisionFilm, CollisionFilm] = [first, second];
    setState({ films, status: 'starting' });
    setOpen(true);
    try {
      const response = await apiFetch('/api/collisions/generations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildCollisionInput(first, second, extras)), signal: AbortSignal.timeout(15000),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (response.status === 401) { onLocked(); throw new Error('Unlock AFTERIMAGE first, then collide them again.'); }
      if (response.status === 409) throw new Error('A reel or an Atlas is developing. Collide these two again once it is ready.');
      if (response.status !== 202) throw new Error(failureMessage(payload, 'The collision could not start. Try again in a moment.'));
      const job = parseJobStart(payload);
      setState(current => current && current.films === films ? { ...current, status: 'developing', jobId: job.jobId } : current);
    } catch (reason) {
      setState(current => current && current.films === films ? { ...current, status: 'failed', error: reason instanceof Error ? reason.message : 'The collision could not start.' } : current);
    }
  }, [onLocked]);

  const jobId = state?.status === 'developing' ? state.jobId : undefined;
  useEffect(() => {
    if (!jobId || !isGenerationJobId(jobId)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const settle = (changes: Partial<CollisionState>) => setState(current => current?.jobId === jobId ? { ...current, ...changes } : current);
    const poll = async () => {
      let delay = 2000;
      try {
        const response = await apiFetch(`/api/generations/${encodeURIComponent(jobId)}`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) });
        if (response.status === 401) { onLocked(); settle({ status: 'failed', error: 'Unlock AFTERIMAGE again to see this collision.' }); return; }
        if (response.status === 404) { settle({ status: 'failed', error: 'This collision has expired. Collide the two films again.' }); return; }
        if (!response.ok) throw new Error('reconnecting');
        const job: unknown = await response.json();
        if (!job || typeof job !== 'object' || (job as { jobId?: unknown }).jobId !== jobId) throw new Error('unexpected');
        const record = job as Record<string, unknown>;
        if (record.status === 'complete') {
          const result = parseCollision(record.reel);
          if (!result) { settle({ status: 'failed', error: 'The collision came back incomplete. Try again.' }); return; }
          settle({ status: 'complete', result, draft: undefined });
          found.current(result);
          return;
        }
        if (record.status === 'failed') {
          const error = record.error && typeof record.error === 'object' && typeof (record.error as { message?: unknown }).message === 'string'
            ? String((record.error as { message: string }).message).slice(0, 300) : 'The collision could not be finished.';
          settle({ status: 'failed', error });
          return;
        }
        const draft = record.status === 'running' ? parseJobDraft(record.draft)?.film : undefined;
        settle({ draft });
        if (draft) delay = DRAFT_POLL_MS;
        failures = 0;
      } catch {
        if (controller.signal.aborted) return;
        if (++failures >= 5) { settle({ status: 'failed', error: 'The connection to the companion paused. Try the collision again.' }); return; }
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, delay);
    };
    timer = setTimeout(poll, 1500);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [jobId, onLocked]);

  return {
    state, open,
    start,
    close: () => setOpen(false),
    reopen: () => setOpen(Boolean(state)),
    clear: () => { setOpen(false); setState(null); },
  };
}

function Orb({ film, poster, side }: { film: { title: string; year: string }; poster: string | null; side: 'a' | 'b' }) {
  return <span className={`collision-orb collision-orb--${side}`}>
    <span className="collision-orb-body">{poster ? <img src={poster} alt="" /> : <span aria-hidden="true">{film.title.slice(0, 1)}</span>}</span>
    <span className="collision-orb-label">{film.title} <small>{film.year}</small></span>
  </span>;
}

/**
 * Two films circle each other and meet; what they leave is one new film, with what it
 * takes from each. The merge is this screen's one large motion.
 */
export function CollisionChamber({ state, open, opener, metadata, likedKeys, savedKeys, connected, onClose, onRetry, onLike, onSave, onExplore, onCollideAgain }: {
  state: CollisionState | null; open: boolean; opener: HTMLElement | null; metadata: Record<string, FilmEnrichment>;
  likedKeys: Set<string>; savedKeys: Set<string>; connected: boolean;
  onClose: () => void; onRetry: () => void; onLike: (film: CollisionFilm) => void; onSave: (film: CollisionFilm) => void;
  onExplore: (film: CollisionFilm, opener: HTMLElement) => void; onCollideAgain: (film: CollisionFilm, opener: HTMLElement) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [art, setArt] = useState<Record<string, FilmEnrichment>>({});

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    requestAnimationFrame(() => heading.current?.focus());
    return () => { if (element?.open) element.close(); if (opener?.isConnected) opener.focus(); };
  }, [open, opener]);

  const resultFilm = state?.result?.film;
  const lookups = [...(state?.films ?? []), ...(resultFilm ? [resultFilm] : [])];
  const missing = lookups.filter(film => !metadata[movieKey(film.title, film.year)] && !art[movieKey(film.title, film.year)]);
  const missingKey = missing.map(film => movieKey(film.title, film.year)).join('~');
  useEffect(() => {
    if (!open || !missing.length) return;
    const controller = new AbortController();
    void fetchFilmEnrichment({ recommendations: missing.slice(0, 5), signal: controller.signal })
      .then(records => { if (!controller.signal.aborted) setArt(current => ({ ...current, ...persistableEnrichment(records) })); })
      .catch(() => { /* Posters are optional here, as everywhere. */ });
    return () => controller.abort();
    // The joined keys are the trigger; the arrays themselves are rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, missingKey]);

  if (!open || !state) return null;
  const poster = (film: { title: string; year: string }, size = 'w342') => {
    const record = metadata[movieKey(film.title, film.year)] ?? art[movieKey(film.title, film.year)];
    return record?.status === 'matched' && record.posterUrl ? record.posterUrl.replace('/w500/', `/${size}/`) : null;
  };
  const [first, second] = state.films;
  const result = state.result;
  const merged = state.status === 'complete' && result;
  const key = result ? movieKey(result.film.title, result.film.year) : '';
  const still = result ? (() => { const record = metadata[key] ?? art[key]; return record?.status === 'matched' ? record.backdropUrl ?? null : null; })() : null;

  return <dialog ref={dialog} className={`collision-chamber${merged ? ' is-merged' : ''}`} aria-labelledby="collision-title" onCancel={event => { event.preventDefault(); onClose(); }}
    style={still ? { '--collision-still': `url("${still.replace('/w1280/', '/w780/')}")` } as CSSProperties : undefined}>
    <header className="collision-head">
      <p className="collision-kicker"><StarGlyph />Collision</p>
      <h2 id="collision-title" ref={heading} tabIndex={-1}>{first.title} <span aria-hidden="true">✕</span><span className="sr-only">and</span> {second.title}</h2>
      <button type="button" className="collision-close" onClick={onClose} aria-label={state.status === 'developing' || state.status === 'starting' ? 'Close; the collision keeps developing' : 'Close the collision'}>×</button>
    </header>
    <div className="collision-field" aria-hidden="true">
      <span className="collision-orbit"><Orb film={first} poster={poster(first)} side="a" /><Orb film={second} poster={poster(second)} side="b" /></span>
      <span className="collision-core">{merged ? <span className="collision-newborn">{poster(result.film, 'w500') ? <img src={poster(result.film, 'w500')!} alt="" /> : <StarGlyph />}</span> : <i />}</span>
      {state.draft && !merged ? <span className="collision-draft developing-in">{state.draft.title} <small>{state.draft.year}</small></span> : null}
    </div>
    <div className="collision-copy" role="status" aria-live="polite">
      {state.status === 'starting' || state.status === 'developing' ? <>
        <p className="collision-lede">{state.draft ? `${state.draft.title} is coming into focus.` : 'Finding the one film that lives between them.'}</p>
        <p className="collision-note">{state.draft ? 'Still developing; AFTERIMAGE checks it before it is final.' : 'You can close this; it keeps developing.'}</p>
      </> : null}
      {state.status === 'failed' ? <>
        <p className="collision-lede">{state.error}</p>
        <div className="collision-actions"><button type="button" className="collision-primary" disabled={!connected} onClick={onRetry}>Collide them again</button></div>
      </> : null}
      {merged ? <>
        <p className="collision-between">Between {first.title} and {second.title}</p>
        <h3 className="collision-film">{result.film.title} <small>{result.film.year}</small></h3>
        <p className="collision-reason">{result.film.reason}</p>
        <dl className="collision-inheritance">
          <div><dt>From {first.title}</dt><dd>{result.film.fromFirst}</dd></div>
          <div><dt>From {second.title}</dt><dd>{result.film.fromSecond}</dd></div>
          <div><dt>Watch for</dt><dd>{result.film.watchFor}</dd></div>
        </dl>
        <div className="collision-actions">
          <button type="button" aria-pressed={savedKeys.has(key)} onClick={() => onSave(result.film)}>{savedKeys.has(key) ? 'Saved ✓' : 'Save for later +'}</button>
          <button type="button" aria-pressed={likedKeys.has(key)} onClick={() => onLike(result.film)}>{likedKeys.has(key) ? '♥ Liked' : '♡ Like'}</button>
          <button type="button" disabled={!connected} onClick={event => onExplore(result.film, event.currentTarget)}>Explore its connections <span aria-hidden="true">↗</span></button>
          <button type="button" className="collision-primary" disabled={!connected} onClick={event => onCollideAgain(result.film, event.currentTarget)}>Collide it with another <span aria-hidden="true">✕</span></button>
        </div>
      </> : null}
    </div>
  </dialog>;
}
