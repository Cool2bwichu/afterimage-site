'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AfterimageResultV2 } from './lib/reel-state';
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
  const [developing, setDeveloping] = useState(false);
  const [leaderNumber, setLeaderNumber] = useState(8);
  const [leaderStep, setLeaderStep] = useState(0);
  const resultsRef = useRef<HTMLElement>(null);

  const refreshConnection = useCallback(async (silent = false) => {
    if (!silent) setConnection('checking');
    try {
      const response = await fetch('/api/status', { cache: 'no-store' });
      const payload = await response.json();
      if (response.ok && payload.authenticated) {
        setConnection('connected');
        setPlanType(payload.planType || '');
        setAuthFlow(null);
        setError('');
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, films, creativeBrief, result }));
  }, [films, creativeBrief, result, hydrated]);

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

  async function developReel() {
    if (!ready || connection !== 'connected' || developing) return;
    setLeaderNumber(8);
    setLeaderStep(0);
    setDeveloping(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/develop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildDevelopPayload(films, creativeBrief)),
      });
      const payload = await response.json() as { reel?: AfterimageResultV2; error?: string };
      if (!response.ok) {
        if (response.status === 401) setConnection('disconnected');
        throw new Error(payload.error || 'The reel did not come back cleanly.');
      }
      if (!payload.reel) throw new Error('The reel did not come back cleanly.');
      setResult(payload.reel);
      window.setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } catch (developError) {
      setError(developError instanceof Error ? developError.message : 'The reel did not come back cleanly.');
    } finally {
      setDeveloping(false);
    }
  }

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
              disabled={developing}
            />
            <button
              className="add-button"
              type="submit"
              aria-label="Add film"
              disabled={developing || films.length >= 20}
            >
              + Add
            </button>
          </form>

          <div className="chips" aria-live="polite">
            {films.map((film, index) => (
              <span className="chip" key={`${film}-${index}`}>
                {film}
                <button type="button" onClick={() => removeFilm(index)} aria-label={`Remove ${film}`}>×</button>
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
              disabled={developing}
            />
          </div>

          <button
            className="develop-button"
            disabled={!ready || developing || connection !== 'connected'}
            type="button"
            onClick={developReel}
          >
            {developing ? 'Developing…' : 'Develop My Reel'}
          </button>
        </section>

        {notice ? <div className="notice" role="status">{notice}</div> : null}
        {error ? (
          <div className="error-banner" role="alert">
            <p>{error}</p>
            <button type="button" onClick={connection === 'connected' ? developReel : startConnection}>
              {connection === 'connected' ? 'Reload the reel' : 'Reconnect'}
            </button>
          </div>
        ) : null}

        {developing ? (
          <section className="leader" role="status" aria-live="polite">
            <div className="leader-circle"><span>{leaderNumber}</span></div>
            <p>{LEADER_MESSAGES[leaderStep]} —</p>
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
