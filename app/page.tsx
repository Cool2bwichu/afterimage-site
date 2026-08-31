'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AfterimageResultV2 } from './lib/reel-state';
import { GenerationPollError, pollGeneration } from './lib/generation-poller';
import {
  isGenerationJobId,
  parseJobStart,
  parseJobStatus,
} from './lib/generation-state';
import {
  buildDevelopPayload,
  canDevelop,
  getInputStatus,
  parseStoredState,
} from './lib/reel-state';

const STORAGE_KEY = 'afterimage:mobile-state';
const LEADER_MESSAGES = [
  'Reading the visual grammar',
  'Listening for rhythm',
  'Tracing the emotional register',
  'Spooling the double features',
];

type ConnectionState = 'checking' | 'connected' | 'disconnected' | 'unreachable';
type AuthFlow = { verificationUrl: string; userCode: string } | null;
type JobStatus = 'queued' | 'running' | 'reconnecting' | 'failed' | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function responseMessage(value: unknown, fallback: string): string {
  if (!isRecord(value) || typeof value.error !== 'string') return fallback;
  const message = value.error.trim();
  return message ? message.slice(0, 300) : fallback;
}

function statusError(status: number): Error & { status: number } {
  return Object.assign(new Error('The reel status request failed.'), { status });
}

export default function Home() {
  const [films, setFilms] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [creativeBrief, setCreativeBrief] = useState('');
  const [result, setResult] = useState<AfterimageResultV2 | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [connection, setConnection] = useState<ConnectionState>('checking');
  const [planType, setPlanType] = useState('');
  const [authFlow, setAuthFlow] = useState<AuthFlow>(null);
  const [connecting, setConnecting] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus>(null);
  const [starting, setStarting] = useState(false);
  const [pollRevision, setPollRevision] = useState(0);
  const [leaderNumber, setLeaderNumber] = useState(8);
  const [leaderStep, setLeaderStep] = useState(0);
  const resultsRef = useRef<HTMLElement>(null);
  const startLockRef = useRef(false);
  const developing = starting || jobStatus === 'queued' || jobStatus === 'running' || jobStatus === 'reconnecting';
  const reelLocked = developing || Boolean(activeJobId);

  const refreshConnection = useCallback(async (silent = false) => {
    if (!silent) setConnection('checking');
    try {
      const response = await fetch('/api/status', { cache: 'no-store' });
      const payload = await response.json();
      if (response.ok && payload.authenticated) {
        setConnection('connected');
        setPlanType(payload.planType || '');
        setAuthFlow(null);
      } else {
        setConnection(response.status === 503 || response.status === 502 ? 'unreachable' : 'disconnected');
      }
    } catch {
      setConnection('unreachable');
    }
  }, []);

  useEffect(() => {
    const hydration = window.setTimeout(() => {
      try {
        const saved = parseStoredState(localStorage.getItem(STORAGE_KEY));
        setFilms(saved.films);
        setCreativeBrief(saved.creativeBrief);
        setResult(saved.result);
        setActiveJobId(saved.activeJobId);
        if (saved.activeJobId) setJobStatus('queued');
      } catch {
        // A damaged local draft should never keep the instrument from opening.
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(hydration);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, films, creativeBrief, result, activeJobId }));
  }, [films, creativeBrief, result, activeJobId, hydrated]);

  useEffect(() => {
    const connectionCheck = window.setTimeout(() => void refreshConnection(), 0);
    return () => window.clearTimeout(connectionCheck);
  }, [refreshConnection]);

  useEffect(() => {
    if (!authFlow || connection === 'connected') return;
    const timer = window.setInterval(() => void refreshConnection(true), 2200);
    return () => window.clearInterval(timer);
  }, [authFlow, connection, refreshConnection]);

  useEffect(() => {
    if (!hydrated || !activeJobId || connection !== 'connected') return;

    const controller = new AbortController();

    void (async () => {
      try {
        const terminal = await pollGeneration({
          signal: controller.signal,
          fetchStatus: async (signal) => {
            const response = await fetch(`/api/generations/${encodeURIComponent(activeJobId)}`, {
              cache: 'no-store',
              signal,
            });
            if (!response.ok) throw statusError(response.status);

            let payload: unknown;
            try {
              payload = await response.json();
            } catch {
              throw statusError(500);
            }
            try {
              return parseJobStatus(payload);
            } catch {
              throw statusError(500);
            }
          },
          onStatus: (job) => {
            if (controller.signal.aborted) return;
            if (job.status === 'queued' || job.status === 'running') setJobStatus(job.status);
          },
          onTransientError: () => {
            if (!controller.signal.aborted) setJobStatus('reconnecting');
          },
        });

        if (controller.signal.aborted) return;
        if (terminal.status === 'complete') {
          setResult(terminal.reel);
          setActiveJobId(null);
          setJobStatus(null);
          setError('');
          setNotice('');
          window.setTimeout(() => {
            resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 80);
          return;
        }

        if (terminal.error.code === 'AUTH_REQUIRED') setConnection('disconnected');
        setJobStatus('failed');
        setError(terminal.error.message);
      } catch (pollError) {
        if (controller.signal.aborted) return;
        if (pollError instanceof GenerationPollError && pollError.code === 'AUTH_REQUIRED') {
          setJobStatus('queued');
          setConnection('disconnected');
          return;
        }
        if (pollError instanceof GenerationPollError && pollError.code === 'JOB_NOT_FOUND') {
          setActiveJobId(null);
          setJobStatus(null);
          setError('');
          setNotice('That reel job has expired. Your inputs are still here—develop it again.');
          return;
        }

        setJobStatus(null);
        setError(pollError instanceof Error ? pollError.message : 'The reel status could not be checked.');
      }
    })();

    return () => controller.abort();
  }, [activeJobId, connection, hydrated, pollRevision]);

  useEffect(() => {
    if (!developing) return;
    const countTimer = window.setInterval(() => {
      setLeaderNumber((current) => current <= 1 ? 8 : current - 1);
    }, 420);
    const copyTimer = window.setInterval(() => {
      setLeaderStep((current) => (current + 1) % LEADER_MESSAGES.length);
    }, 2200);
    return () => {
      window.clearInterval(countTimer);
      window.clearInterval(copyTimer);
    };
  }, [developing]);

  const ready = canDevelop(films, creativeBrief);
  const loadedCopy = useMemo(
    () => getInputStatus(films, creativeBrief),
    [films, creativeBrief],
  );

  function addFilm(event?: FormEvent) {
    event?.preventDefault();
    const film = draft.trim();
    if (!film) return;
    if (films.length >= 20) {
      setNotice('This reference reel is full at 20 films.');
      return;
    }
    if (films.some((item) => item.toLocaleLowerCase() === film.toLocaleLowerCase())) {
      setNotice('That film is already threaded into this reel.');
      return;
    }
    setFilms((current) => [...current, film]);
    setDraft('');
    setNotice('');
  }

  function removeFilm(index: number) {
    setFilms((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setResult(null);
  }

  async function startConnection() {
    setConnecting(true);
    setError('');
    try {
      const response = await fetch('/api/connect', { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'ChatGPT sign-in could not start.');
      if (payload.alreadyAuthenticated) {
        await refreshConnection();
      } else {
        setAuthFlow({ verificationUrl: payload.verificationUrl, userCode: payload.userCode });
        setConnection('disconnected');
      }
    } catch (connectionError) {
      setError(connectionError instanceof Error ? connectionError.message : 'ChatGPT sign-in could not start.');
      setConnection('unreachable');
    } finally {
      setConnecting(false);
    }
  }

  async function developReel(replaceFailedJob = false) {
    if (
      !ready ||
      connection !== 'connected' ||
      developing ||
      startLockRef.current ||
      (activeJobId && !replaceFailedJob)
    ) return;

    startLockRef.current = true;
    setLeaderNumber(8);
    setLeaderStep(0);
    setStarting(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildDevelopPayload(films, creativeBrief)),
      });

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }

      if (
        response.status === 409 &&
        isRecord(payload) &&
        payload.code === 'ACTIVE_GENERATION' &&
        isGenerationJobId(payload.jobId)
      ) {
        setActiveJobId(payload.jobId);
        setJobStatus('queued');
        setNotice('Resuming the reel already in the gate.');
        return;
      }

      if (response.status === 401) setConnection('disconnected');
      if (response.status !== 202) {
        throw new Error(responseMessage(payload, 'The reel could not enter the gate.'));
      }

      const started = parseJobStart(payload);
      setResult(null);
      setActiveJobId(started.jobId);
      setJobStatus('queued');
    } catch (developError) {
      setError(developError instanceof Error ? developError.message : 'The reel could not enter the gate.');
    } finally {
      startLockRef.current = false;
      setStarting(false);
    }
  }

  async function developAgain() {
    if (jobStatus !== 'failed') return;
    setActiveJobId(null);
    setJobStatus(null);
    setError('');
    await developReel(true);
  }

  function dismissFailedJob() {
    setActiveJobId(null);
    setJobStatus(null);
    setError('');
  }

  function resumePolling() {
    if (!activeJobId || connection !== 'connected') return;
    setError('');
    setJobStatus('queued');
    setPollRevision((current) => current + 1);
  }

  const leaderMessage = starting
    ? 'Threading the reel —'
    : jobStatus === 'reconnecting'
      ? 'Finding the reel in the darkroom —'
      : `${LEADER_MESSAGES[leaderStep]} —`;

  return (
    <main className="site-shell">
      <div className="film-grain" aria-hidden="true" />
      <div className="wrap">
        <header className="masthead">
          <div className="eyebrow"><span aria-hidden="true" />Now Screening</div>
          <div className={`privacy-mark ${connection === 'connected' ? 'is-connected' : ''}`}>
            <i aria-hidden="true" />
            {connection === 'connected' ? `ChatGPT ${planType || 'connected'}` : 'Private print'}
          </div>
        </header>

        <h1 className="title">AFTERIMAGE</h1>
        <p className="subtitle">
          What lingers after the credits roll. Add films you love, describe what you are searching for,
          or combine both. AFTERIMAGE reads the full signal and develops a reel around your actual
          sensibility, not just a genre.
        </p>

        {connection !== 'connected' ? (
          <section className="connection-panel" aria-live="polite">
            <div>
              <div className="connection-kicker">Private Intelligence</div>
              <h2>{connection === 'checking' ? 'Checking your print…' : 'Connect your ChatGPT account'}</h2>
              <p>
                {connection === 'unreachable'
                  ? 'The private reel service is not online yet. Your films and saved reel remain on this device.'
                  : 'One private sign-in lets AFTERIMAGE use your plan’s Codex intelligence without an API key.'}
              </p>
            </div>
            {connection !== 'checking' && !authFlow ? (
              <button type="button" onClick={startConnection} disabled={connecting}>
                {connecting ? 'Starting…' : 'Connect ChatGPT'}
              </button>
            ) : null}
            {authFlow ? (
              <div className="device-flow">
                <span>ONE-TIME CODE</span>
                <strong>{authFlow.userCode}</strong>
                <a href={authFlow.verificationUrl} target="_blank" rel="noreferrer">Open secure sign-in ↗</a>
                <small>Return here after approving it. This page will reconnect automatically.</small>
              </div>
            ) : null}
          </section>
        ) : null}

        <section className="panel reel-panel" aria-labelledby="reel-label">
          <div className="panel-label" id="reel-label">Reference Reel · Optional</div>
          <form className="chip-input-row" onSubmit={addFilm}>
            <label className="sr-only" htmlFor="film-input">Film title</label>
            <input
              id="film-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="e.g. In the Mood for Love"
              maxLength={160}
              autoComplete="off"
              disabled={reelLocked}
            />
            <button
              className="add-button"
              type="submit"
              aria-label="Add film"
              disabled={reelLocked || films.length >= 20}
            >
              + Add
            </button>
          </form>

          <div className="chips" aria-live="polite">
            {films.map((film, index) => (
              <span className="chip" key={`${film}-${index}`}>
                {film}
                <button
                  type="button"
                  onClick={() => removeFilm(index)}
                  aria-label={`Remove ${film}`}
                  disabled={reelLocked}
                >
                  ×
                </button>
              </span>
            ))}
          </div>

          <div className="reel-status-row">
            <p className="hint">{loadedCopy}</p>
            <span className="reel-count" aria-label={`${films.length} films loaded`}>{String(films.length).padStart(2, '0')} FRAMES</span>
          </div>

          <div className="brief-field">
            <div className="brief-heading">
              <label htmlFor="creative-brief">What should this reel be searching for?</label>
              <span>Primary or supporting · {creativeBrief.length}/1200</span>
            </div>
            <textarea
              id="creative-brief"
              value={creativeBrief}
              onChange={(event) => {
                setCreativeBrief(event.target.value);
                setResult(null);
              }}
              placeholder="Moody, brooding, filled with tones of longing…"
              maxLength={1200}
              rows={4}
              disabled={reelLocked}
            />
          </div>

          <button
            className="develop-button"
            disabled={!ready || reelLocked || connection !== 'connected'}
            type="button"
            onClick={() => void developReel()}
          >
            {developing ? 'Developing…' : 'Develop My Reel'}
          </button>
        </section>

        {notice ? <div className="notice" role="status">{notice}</div> : null}
        {error ? (
          <div className="error-banner" role="alert">
            <p>{error}</p>
            {jobStatus === 'failed' ? (
              <div className="error-actions">
                <button
                  type="button"
                  onClick={() => void developAgain()}
                  disabled={connection !== 'connected'}
                >
                  Develop again
                </button>
                <button className="is-secondary" type="button" onClick={dismissFailedJob}>Dismiss</button>
              </div>
            ) : (
              <button
                type="button"
                onClick={connection !== 'connected'
                  ? startConnection
                  : activeJobId
                    ? resumePolling
                    : () => void developReel()}
              >
                {connection !== 'connected' ? 'Reconnect' : activeJobId ? 'Resume reel' : 'Reload the reel'}
              </button>
            )}
          </div>
        ) : null}

        {developing ? (
          <section className="leader" role="status" aria-live="polite">
            <div className="leader-circle"><span>{leaderNumber}</span></div>
            <p>{leaderMessage}</p>
          </section>
        ) : null}

        {!developing && result ? (
          <section className="results" aria-live="polite" ref={resultsRef}>
            <article className="panel persona-panel">
              <div className="palette" aria-label="Your cinematic palette">
                {result.palette.map((color) => <span key={color} style={{ background: color }} />)}
              </div>
              <h2 className="persona">{result.persona}</h2>
              <p className="insight">{result.insight}</p>
              <div className="sensibilities">
                {result.sensibilities.map((item) => <span key={item}>{item}</span>)}
              </div>
              <div className="director">
                <span className="director-label">Spirit Director</span>
                <p><strong>{result.spiritDirector.name}</strong> — {result.spiritDirector.reason}</p>
              </div>
            </article>

            <div className="panel-label rec-label">Double Feature Recommendations</div>
            <div className="recommendation-grid">
              {result.recommendations.map((recommendation, index) => (
                <article className={`recommendation-card ${index === 0 ? 'is-primary' : ''}`} key={`${recommendation.title}-${recommendation.year}`}>
                  <div className="timecode">{index === 0 ? 'TOTAL SYNTHESIS' : `REEL ${String(index + 1).padStart(2, '0')}`} — {recommendation.timecode}</div>
                  <h3>{recommendation.title}</h3>
                  <div className="year">{recommendation.year}</div>
                  <p>{recommendation.reason}</p>
                  <div className="watch-for">
                    <span>Watch for</span>
                    <p>{recommendation.watchFor || 'Program note unavailable for this saved reel.'}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <footer>AFTERIMAGE · reasoned live, frame by frame</footer>
      </div>
    </main>
  );
}
