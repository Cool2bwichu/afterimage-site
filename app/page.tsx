'use client';

import { FormEvent, type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FilmDossier } from './components/film-dossier';
import { AtlasWorkspace } from './components/atlas';
import { Landing, nextWelcomeFilm, type WelcomeFilm } from './components/landing';
import { ATLAS_STORAGE_KEY, buildAtlasInput, type AtlasInput } from './lib/atlas';
import { ATLAS_TRAIL_STORAGE_KEY } from './lib/atlas-trail';
import { RecommendationCard } from './components/recommendation-card';
import { SearchFingerprint } from './components/search-fingerprint';
import { LightTable } from './components/light-table';
import { LIGHT_TABLE_EXPERIENCE, buildBlendPayload, isSameSelectedFacet, removeFacet, selectFacet, selectionCount, type CinematicFacet, type FacetKey, type FacetSource, type SelectedFacets } from './lib/light-table';
import { animateFacetToLane } from './lib/light-table-motion';
import { fetchFilmEnrichment, persistableEnrichment } from './lib/enrichment-client';
import type { FilmEnrichment } from './lib/movie-metadata';
import { movieKey } from './lib/movie-metadata';
import { MAX_LIKED_FILMS, TASTE_STORAGE_KEY, parseLikedFilms, toggleLikedFilm, type LikedFilm } from './lib/taste-profile';
import type { AfterimageResultV2, ExcludedFilm, DevelopInput, Experience } from './lib/reel-state';
import { GenerationPollError, pollGeneration } from './lib/generation-poller';
import {
  isGenerationJobId,
  parseJobStart,
  parseJobStatus,
} from './lib/generation-state';
import {
  buildDevelopPayload,
  canDevelop,
  acceptedInputForResumedJob,
  getInputStatus,
  getRecommendationIdentity,
  normalizeExcludedFilms,
  parseStoredState,
  parseAfterimageResultV2,
  transitionLightTableJob,
  withCurrentExclusions,
} from './lib/reel-state';

const STORAGE_KEY = 'afterimage:mobile-state';
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
  const [experience, setExperience] = useState<Experience>();
  const [selectedFacets, setSelectedFacets] = useState<SelectedFacets>({});
  const [selectedReelIdentity, setSelectedReelIdentity] = useState('');
  const [displayedInput, setDisplayedInput] = useState<DevelopInput>();
  const [acceptedInput, setAcceptedInput] = useState<DevelopInput>();
  const [acceptedInputJobId, setAcceptedInputJobId] = useState('');
  const lastAttemptRef = useRef<DevelopInput | undefined>(undefined);
  const lightTableEnabled = experience === LIGHT_TABLE_EXPERIENCE;
  const [draft, setDraft] = useState('');
  const [creativeBrief, setCreativeBrief] = useState('');
  const [result, setResult] = useState<AfterimageResultV2 | null>(null);
  const [metadataByKey, setMetadataByKey] = useState<Record<string, FilmEnrichment>>({});
  const [enrichmentPending, setEnrichmentPending] = useState(false);
  const [selectedRecommendation, setSelectedRecommendation] = useState<number | null>(null);
  const [dossierOpener, setDossierOpener] = useState<HTMLElement | null>(null);
  const [atlasTarget, setAtlasTarget] = useState<AtlasInput | null>(null);
  const [atlasOpener, setAtlasOpener] = useState<HTMLElement | null>(null);
  const [atlasBusy, setAtlasBusy] = useState(false);
  const [atlasResume, setAtlasResume] = useState(false);
  const [atlasResetRevision, setAtlasResetRevision] = useState(0);
  const closeAtlas = useCallback(() => {
    if (window.history.state?.afterimageAtlas) window.history.back();
    else setAtlasTarget(null);
  }, []);
  const [excludedFilms, setExcludedFilms] = useState<ExcludedFilm[]>([]);
  const [likedFilms, setLikedFilms] = useState<LikedFilm[]>([]);
  const likedKeys = useMemo(() => new Set(likedFilms.map(film => movieKey(film.title, film.year))), [likedFilms]);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [connection, setConnection] = useState<ConnectionState>('checking');
  const [authFlow, setAuthFlow] = useState<AuthFlow>(null);
  const [connecting, setConnecting] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus>(null);
  const [starting, setStarting] = useState(false);
  const [pollRevision, setPollRevision] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const [landingOpen, setLandingOpen] = useState(true);
  const [featuredFilm, setFeaturedFilm] = useState<WelcomeFilm>('columbus');
  const [welcomeRequested, setWelcomeRequested] = useState(false);
  const [jobStartedAt, setJobStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const resultsRef = useRef<HTMLElement>(null);
  const filmInputRef = useRef<HTMLInputElement>(null);
  const startLockRef = useRef(false);
  const developing = starting || jobStatus === 'queued' || jobStatus === 'running' || jobStatus === 'reconnecting';
  const reelLocked = developing || Boolean(activeJobId) || atlasBusy;
  const resetLocked = starting || Boolean(activeJobId && jobStatus !== 'failed') || atlasBusy;
  const hasSession = Boolean(result || films.length || draft || creativeBrief || activeJobId || excludedFilms.length || selectionCount(selectedFacets));
  const showLanding = hydrated && !activeJobId && (welcomeRequested || (landingOpen && !result));
  const acceptedRetryInput = lightTableEnabled && activeJobId
    ? acceptedInputForResumedJob(activeJobId, acceptedInputJobId || undefined, acceptedInput)
    : undefined;

  const refreshConnection = useCallback(async (silent = false) => {
    if (!silent) setConnection('checking');
    try {
      const response = await fetch('/api/status', { cache: 'no-store' });
      const payload = await response.json();
      if (response.ok && isRecord(payload) && payload.authenticated) {
        setConnection('connected');
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
        setFeaturedFilm(nextWelcomeFilm(localStorage.getItem('afterimage:welcome-film:v1')));
      } catch {
        // The welcome image remains available when browser storage is blocked.
      }
      try {
        const saved = parseStoredState(localStorage.getItem(STORAGE_KEY));
        setLikedFilms(parseLikedFilms(localStorage.getItem(TASTE_STORAGE_KEY)));
        setWelcomeRequested(new URLSearchParams(window.location.search).get('welcome') === '1');
        const requested = new URLSearchParams(window.location.search).get('experience');
        const mode = requested === null ? saved.experience : requested === LIGHT_TABLE_EXPERIENCE ? LIGHT_TABLE_EXPERIENCE : undefined;
        setExperience(mode);
        setSelectedFacets(mode ? saved.selectedFacets ?? {} : {});
        setSelectedReelIdentity(mode ? saved.selectedReelIdentity ?? '' : '');
        setAcceptedInput(mode ? saved.acceptedInput : undefined);
        setDisplayedInput(mode ? saved.displayedInput : undefined);
        setAcceptedInputJobId(mode ? saved.acceptedInputJobId ?? '' : '');
        setLandingOpen(!saved.result && !saved.films.length && !saved.creativeBrief && !saved.activeJobId);
        setFilms(saved.films);
        setCreativeBrief(saved.creativeBrief);
        setResult(parseAfterimageResultV2(saved.result, mode));
        setMetadataByKey(saved.metadataByKey);
        setExcludedFilms(saved.excludedFilms);
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
    if (!showLanding) return;
    try {
      // Remember only a displayed feature, separately from the user's reel and taste.
      localStorage.setItem('afterimage:welcome-film:v1', featuredFilm);
    } catch {
      // Remembering the previous image is optional.
    }
  }, [showLanding, featuredFilm]);

  function saveLikes(next: LikedFilm[]) {
    try {
      localStorage.setItem(TASTE_STORAGE_KEY, JSON.stringify(next));
      setLikedFilms(next);
      return true;
    } catch {
      setNotice('This browser could not save your Likes. Please free some browser storage and try again.');
      return false;
    }
  }

  function toggleLike(film: LikedFilm) {
    const wasLiked = likedKeys.has(movieKey(film.title, film.year));
    try {
      if (saveLikes(toggleLikedFilm(likedFilms, film))) {
        if (!wasLiked) setExcludedFilms(current => current.filter(item => movieKey(item.title, item.year) !== movieKey(film.title, film.year)));
        setNotice(wasLiked ? `${film.title} removed from your taste history.` : `${film.title} liked. Future reels will gently reflect your taste.${reelLocked ? ' The reel already developing will keep its original request.' : ''}`);
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : 'The Like could not be saved.'); }
  }

  useEffect(() => {
    const syncLikes = (event: StorageEvent) => {
      if (event.storageArea === localStorage && (event.key === TASTE_STORAGE_KEY || event.key === null)) setLikedFilms(parseLikedFilms(event.newValue));
    };
    window.addEventListener('storage', syncLikes);
    return () => window.removeEventListener('storage', syncLikes);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 4,
      films,
      creativeBrief,
      result,
      activeJobId,
      metadataByKey,
      excludedFilms,
      ...(lightTableEnabled ? { experience, selectedFacets, selectedReelIdentity, acceptedInput, acceptedInputJobId, displayedInput: displayedInput ?? null, displayedReelIdentity: getRecommendationIdentity(result) } : {}),
    })); } catch {
      const timer = window.setTimeout(() => setNotice('This browser could not save the reel. Keep this page open to retain your selections.'), 0);
      return () => window.clearTimeout(timer);
    }
  }, [films, creativeBrief, result, activeJobId, metadataByKey, excludedFilms, hydrated, experience, lightTableEnabled, selectedFacets, selectedReelIdentity, acceptedInput, acceptedInputJobId, displayedInput]);

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
              return parseJobStatus(payload, experience);
            } catch {
              throw statusError(500);
            }
          },
          onStatus: (job) => {
            if (controller.signal.aborted) return;
            if (job.status === 'queued' || job.status === 'running') {
              setJobStatus(job.status);
              setJobStartedAt(Date.parse(job.createdAt));
            }
          },
          onTransientError: () => {
            if (!controller.signal.aborted) setJobStatus('reconnecting');
          },
        });

        if (controller.signal.aborted) return;
        if (terminal.status === 'complete') {
          if (lightTableEnabled) {
            const completed = transitionLightTableJob({
              activeJobId,
              selectedFacets,
              selectedReelIdentity,
              acceptedInput,
              acceptedInputJobId: acceptedInputJobId || undefined,
            }, { type: 'complete', jobId: terminal.jobId });
            setSelectedFacets(completed.selectedFacets);
            setSelectedReelIdentity(completed.selectedReelIdentity);
            setAcceptedInput(completed.acceptedInput);
            setAcceptedInputJobId(completed.acceptedInputJobId ?? '');
          } else {
            setSelectedFacets({});
            setSelectedReelIdentity('');
          }
          setDisplayedInput(lightTableEnabled ? acceptedInputForResumedJob(activeJobId, acceptedInputJobId || undefined, acceptedInput) : undefined);
          setResult(terminal.reel);
          setComposerOpen(false);
          setActiveJobId(null);
          setJobStatus(null);
          setError('');
          setNotice('');
          window.setTimeout(() => {
            resultsRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
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
  }, [activeJobId, connection, hydrated, pollRevision, experience, lightTableEnabled, selectedFacets, selectedReelIdentity, acceptedInput, acceptedInputJobId]);

  useEffect(() => {
    if (!developing || jobStartedAt === null) return;
    const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - jobStartedAt) / 1000)));
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [developing, jobStartedAt]);

  const recommendationIdentity = useMemo(
    () => getRecommendationIdentity(result),
    [result],
  );

  useEffect(() => {
    if (!result || !recommendationIdentity) return;
    const recommendations = result.recommendations;
    const complete = recommendations.every((recommendation) => {
      const metadata = metadataByKey[movieKey(recommendation.title, recommendation.year)];
      if (metadata?.status === 'matched' && metadata.tmdbRating === null) return false;
      if (metadata?.status === 'matched' && metadata.backdropUrl === undefined) return false;
      return metadata?.status === 'matched' || metadata?.status === 'unmatched';
    });
    if (complete) return;

    const controller = new AbortController();
    const kickoff = window.setTimeout(() => {
      setEnrichmentPending(true);
      void fetchFilmEnrichment({ recommendations, signal: controller.signal })
        .then((films) => {
          if (controller.signal.aborted) return;
          setMetadataByKey((current) => ({ ...current, ...persistableEnrichment(films) }));
        })
        .catch(() => {
          // Metadata is deliberately secondary; every recommendation remains complete without it.
        })
        .finally(() => {
          if (!controller.signal.aborted) setEnrichmentPending(false);
        });
    }, 0);
    return () => {
      window.clearTimeout(kickoff);
      controller.abort();
    };
    // The reel identity is the only fetch trigger; transient metadata failures retry after reopening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommendationIdentity]);

  const ready = canDevelop(films, creativeBrief);
  const loadedCopy = useMemo(
    () => getInputStatus(films, creativeBrief),
    [films, creativeBrief],
  );

  function clearFacetSelections() {
    setSelectedFacets({});
    setSelectedReelIdentity('');
  }

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
    clearFacetSelections();
    setResult(null);
    setMetadataByKey({});
    setSelectedRecommendation(null);
  }

  async function startConnection() {
    setConnecting(true);
    setError('');
    try {
      const response = await fetch('/api/connect', { method: 'POST' });
      const payload = await response.json();
      if (!response.ok || !isRecord(payload)) throw new Error(responseMessage(payload, 'ChatGPT sign-in could not start.'));
      if (payload.alreadyAuthenticated) {
        await refreshConnection();
      } else if (typeof payload.verificationUrl === 'string' && typeof payload.userCode === 'string') {
        setAuthFlow({ verificationUrl: payload.verificationUrl, userCode: payload.userCode });
        setConnection('disconnected');
      } else throw new Error('ChatGPT sign-in could not start.');
    } catch (connectionError) {
      setError(connectionError instanceof Error ? connectionError.message : 'ChatGPT sign-in could not start.');
      setConnection('unreachable');
    } finally {
      setConnecting(false);
    }
  }

  async function developReel(replaceFailedJob = false, temporaryExclusions: ExcludedFilm[] = [], requestOverride?: DevelopInput) {
    let input: DevelopInput = requestOverride ?? {
      ...buildDevelopPayload(
        films,
        creativeBrief,
        normalizeExcludedFilms([...excludedFilms, ...temporaryExclusions]),
      ),
      ...(lightTableEnabled ? { experience: LIGHT_TABLE_EXPERIENCE } : {}),
    };
    try { input = withCurrentExclusions(input, excludedFilms); }
    catch (inputError) { setError(inputError instanceof Error ? inputError.message : 'The blend could not be submitted.'); return; }
    // Taste is a separate background signal; never fold it into the explicit brief or selected qualities.
    input = { ...input, likedFilms: likedFilms.map(({title, year}) => ({title, year})) };
    if (
      (!canDevelop(input.films, input.creativeBrief) && !selectionCount(input.selectedFacets ?? {})) ||
      connection !== 'connected' ||
      developing ||
      startLockRef.current ||
      (activeJobId && !replaceFailedJob)
    ) return;

    startLockRef.current = true;
    lastAttemptRef.current = input;
    setJobStartedAt(null);
    setElapsedSeconds(0);
    setStarting(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
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
        const resumed = transitionLightTableJob({
          activeJobId,
          selectedFacets,
          selectedReelIdentity,
          acceptedInput,
          acceptedInputJobId: acceptedInputJobId || undefined,
        }, { type: 'conflict', jobId: payload.jobId });
        setActiveJobId(resumed.activeJobId);
        setSelectedFacets(resumed.selectedFacets);
        setSelectedReelIdentity(resumed.selectedReelIdentity);
        setAcceptedInput(resumed.acceptedInput);
        setAcceptedInputJobId(resumed.acceptedInputJobId ?? '');
        setJobStatus('queued');
        setNotice('Resuming the reel already in the gate.');
        return;
      }

      if (response.status === 401) setConnection('disconnected');
      if (response.status !== 202) {
        throw new Error(responseMessage(payload, 'The reel could not enter the gate.'));
      }

      const started = parseJobStart(payload);
      clearFacetSelections();
      setAcceptedInput(input.experience === LIGHT_TABLE_EXPERIENCE ? input : undefined);
      setAcceptedInputJobId(input.experience === LIGHT_TABLE_EXPERIENCE ? started.jobId : '');
      // Retain the last complete reel while its replacement develops.
      setSelectedRecommendation(null);
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
    const nextInput = lightTableEnabled && !acceptedRetryInput && selectionCount(selectedFacets)
      ? buildBlendPayload({selectedFacets,excludedFilms})
      : lightTableEnabled ? acceptedRetryInput : lastAttemptRef.current;
    setActiveJobId(null);
    setJobStatus(null);
    setError('');
    await developReel(true, [], nextInput);
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

  function markNotInterested(recommendation: ExcludedFilm) {
    if (likedKeys.has(movieKey(recommendation.title, recommendation.year)) && !saveLikes(toggleLikedFilm(likedFilms, recommendation))) return;
    setExcludedFilms((current) => normalizeExcludedFilms([...current, recommendation]));
    setNotice(`${recommendation.title} will stay out of future reels.`);
    setSelectedRecommendation(null);
  }

  function handleSelectFacet(channel: FacetKey, facet: CinematicFacet, source: FacetSource, trigger: HTMLButtonElement) {
    if (reelLocked || !recommendationIdentity) return;
    const wasSelected = isSameSelectedFacet(channel, selectedFacets[channel], {...facet,source});
    const next = selectFacet(selectedFacets, channel, facet, source);
    setSelectedFacets(next);
    setSelectedReelIdentity(selectionCount(next) ? recommendationIdentity : '');
    if (!wasSelected) requestAnimationFrame(() => animateFacetToLane(trigger, channel));
  }

  function developBlend() {
    setAtlasTarget(null);
    if (!selectionCount(selectedFacets)) return;
    void developReel(false, [], buildBlendPayload({selectedFacets,excludedFilms}));
  }

  function recommendDifferentFilms() {
    if (!result) return;
    const temporary = result.recommendations.map(({title,year}) => ({title,year}));
    if (lightTableEnabled && displayedInput) {
      const all = [...excludedFilms, ...temporary];
      if (new Set(all.map(film => `${film.title.trim().toLocaleLowerCase()}|${film.year.trim()}`)).size > 100) {
        setError('This reroll exceeds the 100-film exclusion limit. Your saved exclusions have been preserved.');
        return;
      }
      void developReel(false, [], {...displayedInput, excludedFilms:normalizeExcludedFilms(all)});
    } else void developReel(false, temporary);
  }

  function startOver() {
    if (resetLocked || startLockRef.current) return;
    setAtlasTarget(null);
    setLandingOpen(true);
    try { localStorage.removeItem(ATLAS_STORAGE_KEY); localStorage.removeItem(ATLAS_TRAIL_STORAGE_KEY); } catch { /* The current view still resets. */ }
    setAtlasResetRevision(current => current + 1);
    setFilms([]);
    setDraft('');
    setCreativeBrief('');
    setResult(null);
    setMetadataByKey({});
    setEnrichmentPending(false);
    setSelectedRecommendation(null);
    setDossierOpener(null);
    setExcludedFilms([]);
    clearFacetSelections();
    setDisplayedInput(undefined);
    setAcceptedInput(undefined);
    setAcceptedInputJobId('');
    lastAttemptRef.current = undefined;
    setActiveJobId(null);
    setJobStatus(null);
    setJobStartedAt(null);
    setElapsedSeconds(0);
    setError('');
    setNotice('Fresh start. Add films you love or describe what you are looking for.');
    setComposerOpen(true);
    requestAnimationFrame(() => {
      document.getElementById('welcome-title')?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
  }

  const leaderMessage = starting
    ? 'Starting your reel'
    : jobStatus === 'reconnecting'
      ? 'Reconnecting to your reel'
      : jobStatus === 'queued' ? 'Your reel is queued' : 'Your reel is developing';

  const lightTable = lightTableEnabled && (result?.fingerprint || selectionCount(selectedFacets) > 0) ? <LightTable
    embedded={selectedRecommendation !== null || Boolean(atlasTarget)} workspace={Boolean(atlasTarget)}
    selectedFacets={selectedFacets} locked={reelLocked} canSubmit={connection === 'connected'}
    onRemove={channel => {
      const next = removeFacet(selectedFacets,channel);
      setSelectedFacets(next);
      if (!selectionCount(next)) setSelectedReelIdentity('');
    }}
    onClear={clearFacetSelections} onDevelop={developBlend} /> : null;

  function openAtlas(film: FacetSource, opener: HTMLElement, resume = false, fromSearch = false, mapRequest?: DevelopInput) {
    if (!result) return;
    const request: DevelopInput = fromSearch ? {
      films: [`${film.title} (${film.year})`], creativeBrief: '',
      ...(lightTableEnabled ? { experience: LIGHT_TABLE_EXPERIENCE } : {}),
    } : mapRequest ? { ...mapRequest } : {
      ...(displayedInput || { films: result.sourceFilms, creativeBrief }),
      ...(lightTableEnabled ? { experience: LIGHT_TABLE_EXPERIENCE } : {}),
      ...(selectionCount(selectedFacets) ? { experience: LIGHT_TABLE_EXPERIENCE, selectedFacets } : {}),
    };
    setAtlasOpener(atlasTarget ? atlasOpener : selectedRecommendation !== null ? dossierOpener || opener : opener);
    setAtlasResume(resume);
    setAtlasTarget(buildAtlasInput(film, request, excludedFilms, likedFilms));
    setSelectedRecommendation(null);
  }

  function leaveWelcomePreview() {
    setWelcomeRequested(false);
    const url = new URL(location.href); url.searchParams.delete('welcome'); url.hash = '';
    history.replaceState(history.state, '', url);
  }
  function enterReel(prompt?: string) {
    leaveWelcomePreview();
    if (result) { goHome(); return; }
    if (prompt !== undefined && !hasSession) setCreativeBrief(prompt);
    if (!hasSession && new URLSearchParams(location.search).get('experience') !== 'standard') setExperience(LIGHT_TABLE_EXPERIENCE);
    setLandingOpen(false);
    setComposerOpen(true);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'instant' });
      if (prompt) document.getElementById('creative-brief')?.focus({ preventScroll: true });
      else filmInputRef.current?.focus({ preventScroll: true });
    });
  }
  function goHome() {
    leaveWelcomePreview();
    if (result) setComposerOpen(false);
    else if (!activeJobId && !starting) setLandingOpen(true);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  }

  return (
    <main data-ready={hydrated} className={`site-shell projection-room${lightTableEnabled ? ' has-light-table' : ''}${result ? ' has-reel' : ''}${showLanding ? ' is-landing' : ''}`}
      style={{ '--reel-color': result?.palette[2] || '#254438' } as CSSProperties}>
      <div className="wrap">
        <header className="masthead">
          <h1 className="title"><button type="button" aria-label="Afterimage home" onClick={goHome}>AFTERIMAGE<span className="brand-print" aria-hidden="true"><i /><i /><i /><i /></span></button></h1>
          {showLanding ? <nav className="welcome-home-nav" aria-label="Welcome navigation"><a href="#discover-afterimage">How it works</a><button onClick={() => enterReel()}>{hasSession ? 'Continue' : 'Begin'} <span aria-hidden="true">↗</span></button></nav> : <div className="masthead-actions">
            {result ? <button type="button" className="atlas-open-button" disabled={developing} onClick={event => openAtlas(result.recommendations[0], event.currentTarget, true)}>Atlas ↗</button> : null}
            <span className={`privacy-mark ${connection === 'connected' ? 'is-connected' : ''}`}>
              <i aria-hidden="true" />{connection === 'connected' ? 'Connected' : connection === 'checking' ? 'Connecting…' : 'Not connected'}
            </span>
            <div className="ai-mode-note">
              {lightTableEnabled ? <a href="?experience=standard">Use standard reel</a> : <a href="?experience=light-table-v1">Enable Light Table</a>}
            </div>
            {hydrated && hasSession ? <button className="start-over" type="button" onClick={startOver} disabled={resetLocked}
              title={resetLocked ? 'Available when this reel finishes developing' : 'Clear this reel, its inputs, and selected qualities'}>
              Start over <span aria-hidden="true">↺</span>
            </button> : null}
          </div>}
        </header>
        {showLanding ? <Landing featuredFilm={featuredFilm} onStart={enterReel} hasDraft={hasSession} hasReel={Boolean(result)} /> : null}
        <div className="reel-workspace" hidden={showLanding}>
        {!hydrated ? <p className="opening" role="status">Opening your reel…</p> : null}
        {!result ? <div className="arrival">
          <h2>Find what stays with you.</h2>
          <p className="subtitle">Add films you love, describe what you are searching for,
            or combine both.</p>
        </div> : <section className="request-summary" aria-label="Current reel references">
          <div className="request-copy"><span className="panel-label">Your request</span><p>{displayedInput?.creativeBrief || (result.sourceFilms.length ? 'A reel from the films you love.' : 'A blend of selected qualities')}</p>
          <button type="button" onClick={() => setComposerOpen(!composerOpen)} disabled={reelLocked}>{composerOpen ? 'Close inputs' : 'Refine request'} <span aria-hidden="true">{composerOpen ? '−' : '+'}</span></button>
          </div>
          {result.sourceFilms.length ? <div className="request-references"><span className="panel-label">Reference films</span><p>{result.sourceFilms.join(' · ')}</p></div> : null}
        </section>}

        {connection !== 'connected' && connection !== 'checking' ? (
          <section className="connection-panel" aria-live="polite">
            <div>
              <div className="connection-kicker">Private Intelligence</div>
              <h2>Connect your ChatGPT account</h2>
              <p>
                {connection === 'unreachable'
                  ? 'The reel service is unavailable. Your films and saved reel remain on this device.'
                  : 'Connect to develop recommendations. Your existing reel stays available while you reconnect.'}
              </p>
            </div>
            {!authFlow ? (
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

        <section className="panel reel-panel" aria-labelledby="reel-label" hidden={Boolean(result) && !composerOpen}>
          <div className="panel-label" id="reel-label">Reference Reel · Optional</div>
          <form className="chip-input-row" onSubmit={addFilm}>
            <label className="sr-only" htmlFor="film-input">Film title</label>
            <input
              id="film-input"
              ref={filmInputRef}
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
                clearFacetSelections();
                setResult(null);
                setMetadataByKey({});
                setSelectedRecommendation(null);
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

        {lightTableEnabled && result && !result.fingerprint ? <div className="notice mode-upgrade" role="status">
          <span>Light Table is on. Develop a new reel to reveal qualities you can borrow.</span>
          <button type="button" onClick={() => setComposerOpen(true)} disabled={reelLocked}>Open inputs</button>
        </div> : null}
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
                  {lightTableEnabled && !acceptedRetryInput
                    ? selectionCount(selectedFacets) ? 'Develop selected blend' : 'Start a new reel'
                    : 'Develop again'}
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
                    : () => void developReel(false, [], lastAttemptRef.current)}
              >
                {connection !== 'connected' ? 'Reconnect' : activeJobId ? 'Resume reel' : 'Reload the reel'}
              </button>
            )}
          </div>
        ) : null}

        {developing ? (
          <section className="leader" role="status" aria-live="polite">
            <span className="status-orbit" aria-hidden="true" />
            <div><p>{leaderMessage}</p><span>{result ? 'Your previous reel is still here. You can browse it while you wait.' : 'You can refresh this page; your accepted reel will resume.'}</span></div>
            {jobStartedAt !== null ? <time aria-live="off" className="elapsed">{Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, '0')} elapsed</time> : null}
          </section>
        ) : null}

        {result ? (
          <section className="results" aria-live="polite" ref={resultsRef}>
            <div className={developing ? "reel-heading" : "sr-only"}><h2>{developing ? 'Your previous reel' : 'Your reel'}</h2><span>Five films, considered together.</span></div>

            {lightTableEnabled && result.fingerprint ? <SearchFingerprint fingerprint={result.fingerprint} insight={result.insight} /> : null}

            <div className="recommendation-grid">
              {result.recommendations.map((recommendation, index) => (
                <RecommendationCard
                  key={`${recommendation.title}-${recommendation.year}`}
                  recommendation={recommendation}
                  index={index}
                  metadata={metadataByKey[movieKey(recommendation.title, recommendation.year)]}
                  enrichmentPending={enrichmentPending}
                  liked={likedKeys.has(movieKey(recommendation.title, recommendation.year))}
                  onToggleLike={() => toggleLike(recommendation)}
                  selectedFacets={selectedFacets}
                  onSelectFacet={lightTableEnabled ? handleSelectFacet : undefined}
                  facetDisabled={reelLocked}
                  onOpen={(event) => {
                    setDossierOpener(event.currentTarget);
                    setSelectedRecommendation(index);
                  }}
                />
              ))}
            </div>

            <section className="atlas-entry"><div><h3>Atlas</h3><p>Films are never alone. Explore the connections around a film, and find what carries through.</p></div><button type="button" disabled={developing} onClick={event => openAtlas(result.recommendations[0], event.currentTarget)}>Explore connections ↗</button></section>

            <details className="persona-panel"><summary><span>About this reel</span><strong>{result.persona}</strong><span aria-hidden="true">+</span></summary><div className="persona-details">
              <div className="palette" aria-label="Your cinematic palette">
                {result.palette.map((color) => <span key={color} style={{ background: color }} />)}
              </div>
              <p className="insight">{result.insight}</p>
              <div className="sensibilities">
                {result.sensibilities.map((item) => <span key={item}>{item}</span>)}
              </div>
              <div className="director">
                <span className="director-label">Spirit Director</span>
                <p><strong>{result.spiritDirector.name}</strong> — {result.spiritDirector.reason}</p>
              </div>
            </div></details>

            <div className="reroll-panel">
              <button
                type="button"
                onClick={recommendDifferentFilms}
                disabled={reelLocked || connection !== 'connected' || (lightTableEnabled && Boolean(result.fingerprint) && !displayedInput)}
              >
                Recommend Different Films
              </button>
              <p>{lightTableEnabled && result.fingerprint && !displayedInput
                ? 'This reel resumed from another session. Borrow qualities or start a new search to continue.'
                : lightTableEnabled && displayedInput?.selectedFacets ? 'Keep this blend and replace all five recommendations.' : 'Keep this prompt and replace all five recommendations.'}</p>
            </div>

            <FilmDossier
              onOpenAtlas={(film, opener) => openAtlas(film, opener)}
              liked={selectedRecommendation !== null && likedKeys.has(movieKey(result.recommendations[selectedRecommendation].title, result.recommendations[selectedRecommendation].year))}
              onToggleLike={() => { if (selectedRecommendation !== null) toggleLike(result.recommendations[selectedRecommendation]); }}
              recommendations={result.recommendations}
              metadataByKey={metadataByKey}
              onSelectFilm={setSelectedRecommendation}
              lightTable={lightTable}
              selection={selectedRecommendation === null ? null : {
                recommendation: result.recommendations[selectedRecommendation],
                index: selectedRecommendation,
              }}
              metadata={selectedRecommendation === null ? undefined : metadataByKey[
                movieKey(result.recommendations[selectedRecommendation].title, result.recommendations[selectedRecommendation].year)
              ]}
              selectedFacets={selectedFacets}
              onSelectFacet={lightTableEnabled ? handleSelectFacet : undefined}
              facetDisabled={reelLocked}
              opener={dossierOpener}
              notInterested={selectedRecommendation === null ? false : excludedFilms.some((film) =>
                film.title.toLocaleLowerCase() === result.recommendations[selectedRecommendation].title.toLocaleLowerCase() &&
                film.year === result.recommendations[selectedRecommendation].year)}
              onNotInterested={() => {
                if (selectedRecommendation === null) return;
                const recommendation = result.recommendations[selectedRecommendation];
                markNotInterested({ title: recommendation.title, year: recommendation.year });
              }}
              onClose={() => setSelectedRecommendation(null)}
            />
          </section>
        ) : null}

        {hydrated ? <details className="taste-history"><summary>Your taste <span>{likedFilms.length ? `${likedFilms.length} liked ${likedFilms.length === 1 ? 'film' : 'films'}` : 'No Likes yet'}</span></summary>
          <p>Like films you have seen and loved. Shared patterns gently guide future discoveries; your current request and Light Table qualities come first. Saved in this browser, even when you start over.</p>
          {likedFilms.length ? <><ul>{likedFilms.map(film => <li key={movieKey(film.title, film.year)}><span>{film.title} <small>{film.year}</small></span><button type="button" onClick={() => toggleLike(film)} aria-label={`Remove like for ${film.title}`}>Remove</button></li>)}</ul>
          <button type="button" className="clear-taste" onClick={() => { if (window.confirm('Clear all liked films from your taste history? Your current reel will stay.')) { if (saveLikes([])) setNotice('Your taste history has been cleared.'); } }}>Clear taste history</button>
          {likedFilms.length === MAX_LIKED_FILMS ? <p>Your history is full. Remove a Like to make room.</p> : null}</> : <p>Look for ♡ Like beside a recommendation or inside its dossier.</p>}
        </details> : null}

        <section className="film-data-credits" aria-label="Film data credits">
          <details>
            <summary>Film Data Credits</summary>
            <div>
              <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer noopener">
                <img
                  src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_long_2-9665a76b1ae401a510ec1e0ca40ddcb3b0cfe45f1d51b77a308fea0845885648.svg"
                  alt="The Movie Database (TMDB)"
                />
              </a>
              <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
            </div>
          </details>
        </section>
        <footer>AFTERIMAGE · reasoned live, frame by frame</footer>
        {selectedRecommendation === null && !atlasTarget ? lightTable : null}
        <AtlasWorkspace key={atlasResetRevision} target={atlasTarget} opener={atlasOpener} onClose={closeAtlas} onBusy={setAtlasBusy} preferSaved={atlasResume}
          connected={connection === 'connected'} metadataByKey={metadataByKey} likedKeys={likedKeys} onLike={toggleLike}
          onExplore={(film, opener, request) => openAtlas(film, opener, false, false, request)} onSearchExplore={(film, opener) => openAtlas(film, opener, false, true)} selectedFacets={selectedFacets} onBorrow={lightTableEnabled ? handleSelectFacet : undefined} lightTable={atlasTarget ? lightTable : null} />
        </div>
      </div>
    </main>
  );
}
