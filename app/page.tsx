'use client';

import { FormEvent, type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FilmDossier } from './components/film-dossier';
import { AtlasWorkspace } from './components/atlas';
import { parseFilmSearchResults, type FilmSearchResult } from './lib/film-search';
import { Landing, nextWelcomeFilm, type WelcomeFilm } from './components/landing';
import { ATLAS_STORAGE_KEY, buildAtlasInput, parseAtlasInputRequest, type AtlasInput } from './lib/atlas';
import { ATLAS_TRAIL_STORAGE_KEY, parseAtlasTrail, activeAtlasStop } from './lib/atlas-trail';
import { ScreeningReel } from './components/screening-reel';
import { FilmLibrary } from './components/film-library';
import { ReelComparison } from './components/reel-comparison';
import { WATCHLIST_KEY, parseWatchlist, toggleWatchlist, type SavedFilm } from './lib/library';
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
  const [atlasLookupBusy, setAtlasLookupBusy] = useState(false);
  const [atlasChoices, setAtlasChoices] = useState<FilmSearchResult[]>([]);
  const atlasLookupLock = useRef(false);
  const createAtlasButton = useRef<HTMLButtonElement>(null);
  const [creativeBrief, setCreativeBrief] = useState('');
  const [result, setResult] = useState<AfterimageResultV2 | null>(null);
  const [metadataByKey, setMetadataByKey] = useState<Record<string, FilmEnrichment>>({});
  const [enrichmentPending, setEnrichmentPending] = useState(false);
  const [selectedRecommendation, setSelectedRecommendation] = useState<number | null>(null);
  const [dossierOpener, setDossierOpener] = useState<HTMLElement | null>(null);
  const lastAtlasTarget = useRef<AtlasInput | null>(null);
  const [atlasTarget, setAtlasTarget] = useState<AtlasInput | null>(null);
  const [atlasOpener, setAtlasOpener] = useState<HTMLElement | null>(null);
  const [atlasBusy, setAtlasBusy] = useState(false);
  const [atlasResume, setAtlasResume] = useState(false);
  const [atlasResetRevision, setAtlasResetRevision] = useState(0);
  const closeAtlas = useCallback(() => {
    if (window.history.state?.afterimageOverlay) window.history.back();
    else { const url = new URL(location.href); url.hash = ''; history.replaceState(null, '', url); setAtlasTarget(null); }
  }, []);
  const [excludedFilms, setExcludedFilms] = useState<ExcludedFilm[]>([]);
  const [likedFilms, setLikedFilms] = useState<LikedFilm[]>([]);
  const [watchlist, setWatchlist] = useState<SavedFilm[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryOpener, setLibraryOpener] = useState<HTMLElement | null>(null);
  const [screeningIndex, setScreeningIndex] = useState(0);
  const [comparison, setComparison] = useState<{ first: number; second: number; opener: HTMLElement | null } | null>(null);
  const [replacementJob, setReplacementJob] = useState<{ jobId: string; index: number }>();
  const [replacementUndo, setReplacementUndo] = useState<{ result: AfterimageResultV2; input: DevelopInput; index: number } | null>(null);
  const savedKeys = useMemo(() => new Set(watchlist.map(film => movieKey(film.title, film.year))), [watchlist]);
  const likedKeys = useMemo(() => new Set(likedFilms.map(film => movieKey(film.title, film.year))), [likedFilms]);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState('');
  const [facetUndo, setFacetUndo] = useState<{ facets: SelectedFacets; identity: string } | null>(null);
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
  const reelLocked = developing || Boolean(activeJobId) || atlasBusy || atlasLookupBusy;
  const resetLocked = starting || Boolean(activeJobId && jobStatus !== 'failed') || atlasBusy || atlasLookupBusy;
  const hasSession = Boolean(result || films.length || draft || creativeBrief || activeJobId || excludedFilms.length || selectionCount(selectedFacets));
  const showLanding = hydrated && !activeJobId && (welcomeRequested || (landingOpen && !result));
  const acceptedRetryInput = activeJobId
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
        const readAtlas = (key: string) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
        const atlasTrail = parseAtlasTrail(readAtlas(ATLAS_TRAIL_STORAGE_KEY), readAtlas(ATLAS_STORAGE_KEY));
        const saved = parseStoredState(localStorage.getItem(STORAGE_KEY), atlasTrail.maps.flatMap(map => [map.atlas.anchor, ...map.atlas.neighbors]));
        const savedAtlas = activeAtlasStop(atlasTrail);
        if (location.hash === '#atlas' && savedAtlas) {
          const request = parseAtlasInputRequest(savedAtlas.inputKey, savedAtlas.atlas.anchor);
          if (request) {
            const target = buildAtlasInput(savedAtlas.atlas.anchor, request, saved.excludedFilms, []);
            lastAtlasTarget.current = target; setAtlasTarget(target); setAtlasResume(true);
          }
        }
        setLikedFilms(parseLikedFilms(localStorage.getItem(TASTE_STORAGE_KEY)));
        setWatchlist(parseWatchlist(localStorage.getItem(WATCHLIST_KEY)));
        setWelcomeRequested(new URLSearchParams(window.location.search).get('welcome') === '1');
        const requested = new URLSearchParams(window.location.search).get('experience');
        const mode = requested === null ? saved.experience : requested === LIGHT_TABLE_EXPERIENCE ? LIGHT_TABLE_EXPERIENCE : undefined;
        setExperience(mode);
        setSelectedFacets(mode ? saved.selectedFacets ?? {} : {});
        setSelectedReelIdentity(mode ? saved.selectedReelIdentity ?? '' : '');
        setAcceptedInput(saved.acceptedInput);
        setDisplayedInput(saved.displayedInput);
        setAcceptedInputJobId(saved.acceptedInputJobId ?? '');
        setLandingOpen(!saved.result && !saved.films.length && !saved.creativeBrief && !saved.activeJobId);
        setFilms(saved.films);
        setCreativeBrief(saved.creativeBrief);
        setResult(parseAfterimageResultV2(saved.result, mode));
        setMetadataByKey(saved.metadataByKey);
        setExcludedFilms(saved.excludedFilms);
        setActiveJobId(saved.activeJobId);
        setReplacementJob(saved.replacementJob);
        setScreeningIndex(saved.screeningIndex ?? 0);
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

  function saveWatchlist(next: SavedFilm[]) {
    try { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next)); setWatchlist(next); return true; }
    catch { setNotice('This browser could not save your watchlist. Keep this page open and try again.'); return false; }
  }
  function toggleSave(film: SavedFilm) {
    const record = metadataByKey[movieKey(film.title, film.year)];
    const tmdbId = film.tmdbId || (record?.status === 'matched' ? record.tmdbId : undefined);
    const identity = { title: film.title, year: film.year, ...(tmdbId ? { tmdbId } : {}) };
    try {
      const removing = savedKeys.has(movieKey(film.title, film.year));
      if (saveWatchlist(toggleWatchlist(watchlist, identity))) setNotice(removing ? `${film.title} removed from your watchlist.` : `${film.title} saved for another night.`);
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : 'The film could not be saved.'); }
  }
  function resolveFilm(record: FilmEnrichment) {
    setMetadataByKey(current => ({ ...current, [record.key]: record }));
  }
  function filmUrl(index: number) {
    const url = new URL(location.href);
    const film = result?.recommendations[index];
    url.hash = film ? `film=${encodeURIComponent(movieKey(film.title, film.year))}` : '';
    return url;
  }
  function openDossier(index: number, opener: HTMLElement) {
    history.pushState({ afterimageOverlay: true }, '', filmUrl(index));
    setDossierOpener(opener); setSelectedRecommendation(index); setScreeningIndex(index);
  }
  function closeDossier() {
    if (history.state?.afterimageOverlay) history.back();
    else { const url = new URL(location.href); url.hash = ''; history.replaceState(null, '', url); setSelectedRecommendation(null); }
  }
  useEffect(() => {
    const pop = () => {
      let key = '';
      try { key = location.hash.startsWith('#film=') ? decodeURIComponent(location.hash.slice(6)) : ''; } catch { /* Ignore damaged links. */ }
      const index = result?.recommendations.findIndex(film => movieKey(film.title, film.year) === key) ?? -1;
      setSelectedRecommendation(index < 0 ? null : index);
      if (index >= 0) setScreeningIndex(index);
      setLibraryOpen(location.hash === '#library');
      if (location.hash !== '#atlas') setAtlasTarget(null);
      else if (lastAtlasTarget.current) { setAtlasResume(true); setAtlasTarget(lastAtlasTarget.current); }
      if (location.hash.startsWith('#compare=')) {
        try {
          const keys: unknown = JSON.parse(decodeURIComponent(location.hash.slice(9)));
          const positions = Array.isArray(keys) && keys.length === 2 ? keys.map(key => result?.recommendations.findIndex(film => movieKey(film.title, film.year) === key) ?? -1) : [];
          if (positions.length === 2 && positions.every(position => position >= 0) && positions[0] !== positions[1]) setComparison(current => ({ first: positions[0], second: positions[1], opener: current?.opener ?? null }));
          else setComparison(null);
        } catch { setComparison(null); }
      } else setComparison(null);
    };
    const timer = setTimeout(pop, 0);
    window.addEventListener('popstate', pop);
    return () => { clearTimeout(timer); window.removeEventListener('popstate', pop); };
  }, [result]);
  function closeLibrary() {
    if (history.state?.afterimageOverlay) history.back();
    else { const url = new URL(location.href); url.hash = ''; history.replaceState(null, '', url); setLibraryOpen(false); }
  }
  function openComparison(first: number, second: number, opener: HTMLElement) {
    const url = new URL(location.href); url.hash = `compare=${encodeURIComponent(JSON.stringify([first, second].map(index => movieKey(result!.recommendations[index].title, result!.recommendations[index].year))))}`;
    history.pushState({ afterimageOverlay: true }, '', url);
    setComparison({ first, second, opener });
  }
  function closeComparison() {
    if (history.state?.afterimageOverlay) history.back();
    else { const url = new URL(location.href); url.hash = ''; history.replaceState(null, '', url); setComparison(null); }
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
      if (event.storageArea === localStorage && (event.key === WATCHLIST_KEY || event.key === null)) setWatchlist(parseWatchlist(event.key === null ? null : event.newValue));
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
      selectedFilmKey: result ? movieKey(result.recommendations[screeningIndex]?.title ?? '', result.recommendations[screeningIndex]?.year ?? '') : undefined,
      replacementJob, acceptedInput, acceptedInputJobId, displayedInput: displayedInput ?? null, displayedReelIdentity: getRecommendationIdentity(result),
      ...(lightTableEnabled ? { experience, selectedFacets, selectedReelIdentity, blendDraft: { version: 1, facets: selectedFacets } } : {}),
    })); } catch {
      const timer = window.setTimeout(() => setNotice('This browser could not save the reel. Keep this page open to retain your selections.'), 0);
      return () => window.clearTimeout(timer);
    }
  }, [films, creativeBrief, result, activeJobId, metadataByKey, excludedFilms, hydrated, experience, lightTableEnabled, selectedFacets, selectedReelIdentity, acceptedInput, acceptedInputJobId, displayedInput, replacementJob, screeningIndex]);

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
          const replaced = replacementJob?.jobId === terminal.jobId ? replacementJob : null;
          if (replaced) {
            if (result && displayedInput) setReplacementUndo({ result, input: displayedInput, index: replaced.index });
            setSelectedReelIdentity(selectionCount(selectedFacets) ? getRecommendationIdentity(terminal.reel) : '');
          } else if (lightTableEnabled) {
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
          setDisplayedInput(acceptedInputForResumedJob(activeJobId, acceptedInputJobId || undefined, acceptedInput));
          setResult(terminal.reel);
          setScreeningIndex(replaced?.index ?? 0);
          setReplacementJob(undefined);
          setComposerOpen(false);
          setActiveJobId(null);
          setJobStatus(null);
          setError('');
          setNotice(replaced ? 'One new film. The rest of your reel stays with you.' : '');
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
  // Result and displayed input remain stable while this accepted job is running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJobId, connection, hydrated, pollRevision, experience, lightTableEnabled, selectedFacets, selectedReelIdentity, acceptedInput, acceptedInputJobId, replacementJob]);

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
      if (metadata?.lookupVersion !== 2) return false;
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
    setAtlasChoices([]);
    setNotice('');
  }

  async function createAtlasFromDraft(opener: HTMLElement) {
    const query = draft.trim();
    if (query.length < 2 || reelLocked || atlasLookupLock.current || connection !== 'connected') return;
    atlasLookupLock.current = true;
    setAtlasLookupBusy(true);
    setAtlasChoices([]);
    setNotice('');
    try {
      const response = await fetch(`/api/films/search?q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Film search could not connect. Try again.');
      const payload = await response.json();
      if (!isRecord(payload) || !Array.isArray(payload.films)) throw new Error('Film search could not connect. Try again.');
      const matches = parseFilmSearchResults(payload.films);
      const exact = matches.filter(film => [film.title, `${film.title} (${film.year})`, `${film.title} ${film.year}`]
        .some(title => title.toLocaleLowerCase() === query.toLocaleLowerCase()));
      const film = exact.length === 1 ? exact[0] : matches.length === 1 ? matches[0] : null;
      if (film) openAtlas(film, opener, false, true);
      else if (matches.length) setAtlasChoices(matches);
      else setNotice('No films found. Try another title or spelling.');
    } catch {
      setNotice('Film search could not connect. Try again.');
    } finally {
      atlasLookupLock.current = false;
      setAtlasLookupBusy(false);
    }
  }

  function removeFilm(index: number) {
    setFilms((current) => current.filter((_, itemIndex) => itemIndex !== index));
    clearFacetSelections();
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
      setAcceptedInput(input);
      setReplacementJob(undefined); setReplacementUndo(null);
      setFacetUndo(null);
      setAcceptedInputJobId(started.jobId);
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
    if (replacementJob) { const index = replacementJob.index; setActiveJobId(null); setJobStatus(null); await replaceFilm(index, true); return; }
    const nextInput = lightTableEnabled && !acceptedRetryInput && selectionCount(selectedFacets)
      ? buildBlendPayload({selectedFacets,excludedFilms})
      : acceptedRetryInput ?? lastAttemptRef.current;
    setActiveJobId(null);
    setJobStatus(null);
    setError('');
    await developReel(true, [], nextInput);
  }

  function dismissFailedJob() {
    setReplacementJob(undefined);
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
    closeDossier();
  }

  function handleSelectFacet(channel: FacetKey, facet: CinematicFacet, source: FacetSource, trigger: HTMLButtonElement) {
    if (reelLocked) return;
    const provenance = recommendationIdentity || `atlas:${movieKey(source.title, source.year)}`;
    const wasSelected = isSameSelectedFacet(channel, selectedFacets[channel], {...facet,source});
    setFacetUndo({ facets: selectedFacets, identity: selectedReelIdentity });
    const next = selectFacet(selectedFacets, channel, facet, source);
    setNotice(wasSelected ? `${facet.label} removed from your blend.` : `${facet.label} borrowed from ${source.title}.`);
    setSelectedFacets(next);
    setSelectedReelIdentity(selectionCount(next) ? provenance : '');
    if (!wasSelected) requestAnimationFrame(() => animateFacetToLane(trigger, channel));
  }

  function developBlend() {
    setAtlasTarget(null); setSelectedRecommendation(null);
    const url = new URL(location.href); url.hash = ''; history.replaceState(null, '', url);
    if (!selectionCount(selectedFacets)) return;
    void developReel(false, [], buildBlendPayload({selectedFacets,excludedFilms}));
  }

  async function replaceFilm(index: number, retry = false) {
    if (!result || !displayedInput || (!retry && reelLocked) || startLockRef.current || connection !== 'connected') return;
    startLockRef.current = true; setStarting(true); setError(''); setNotice(''); setFacetUndo(null);
    setElapsedSeconds(0); setJobStartedAt(null);
    try {
      const request = withCurrentExclusions({ ...displayedInput, likedFilms }, excludedFilms);
      const response = await fetch('/api/replacements/generations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request, reel: result, replaceIndex: index }) });
      const payload: unknown = await response.json();
      if (response.status !== 202) throw new Error(responseMessage(payload, response.status === 409 ? 'Another discovery is still developing. Your reel is unchanged.' : 'This film could not be replaced. Your reel is unchanged.'));
      const job = parseJobStart(payload);
      setReplacementJob({ jobId: job.jobId, index });
      setAcceptedInput(request); setAcceptedInputJobId(job.jobId);
      setActiveJobId(job.jobId); setJobStatus('queued'); setReplacementUndo(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'This film could not be replaced.'); }
    finally { startLockRef.current = false; setStarting(false); }
  }

  function recommendDifferentFilms() {
    if (!result) return;
    const temporary = result.recommendations.map(({title,year}) => ({title,year}));
    if (displayedInput) {
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
    setAcceptedInputJobId(''); setReplacementJob(undefined); setReplacementUndo(null); setFacetUndo(null);
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
    embedded workspace={Boolean(atlasTarget)}
    selectedFacets={selectedFacets} locked={reelLocked} canSubmit={connection === 'connected'}
    onRemove={channel => {
      const next = removeFacet(selectedFacets,channel);
      setSelectedFacets(next);
      if (!selectionCount(next)) setSelectedReelIdentity('');
    }}
    onClear={clearFacetSelections} onDevelop={developBlend} /> : null;

  function openAtlas(film: FacetSource, opener: HTMLElement, resume = false, fromSearch = false, mapRequest?: DevelopInput) {
    const request: DevelopInput = fromSearch ? {
      films: [`${film.title} (${film.year})`], creativeBrief: '',
      ...(lightTableEnabled ? { experience: LIGHT_TABLE_EXPERIENCE } : {}),
    } : mapRequest ? { ...mapRequest } : {
      ...(displayedInput || { films: result?.sourceFilms || films, creativeBrief }),
      ...(lightTableEnabled ? { experience: LIGHT_TABLE_EXPERIENCE } : {}),
      ...(selectionCount(selectedFacets) ? { experience: LIGHT_TABLE_EXPERIENCE, selectedFacets } : {}),
    };
    setAtlasOpener(atlasTarget ? atlasOpener : selectedRecommendation !== null ? dossierOpener || opener : opener);
    setAtlasResume(resume);
    const details = metadataByKey[movieKey(film.title, film.year)];
    const catalogFilm = film as FacetSource & { tmdbId?: number; id?: number };
    const identity = { ...film, tmdbId: catalogFilm.tmdbId ?? catalogFilm.id ?? (details?.status === 'matched' ? details.tmdbId : undefined) };
    const input = buildAtlasInput(identity, request, excludedFilms, likedFilms);
    lastAtlasTarget.current = input;
    if (location.hash !== '#atlas') { const url = new URL(location.href); url.hash = 'atlas'; history.pushState({ afterimageOverlay: true }, '', url); }
    setAtlasTarget(input);
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
            <button type="button" className="library-open-button" onClick={event => { setLibraryOpener(event.currentTarget); const url = new URL(location.href); url.hash = 'library'; history.pushState({ afterimageOverlay: true }, '', url); setLibraryOpen(true); }}>Library{watchlist.length ? ` (${watchlist.length})` : ''}</button>
            {result ? <button type="button" className="atlas-open-button" disabled={developing} onClick={event => openAtlas(result.recommendations[screeningIndex] || result.recommendations[0], event.currentTarget, true)}>Atlas</button> : null}
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
          <div className="request-copy"><span className="panel-label">Your reel</span><p>{displayedInput?.creativeBrief || (result.sourceFilms.length ? result.sourceFilms.join(' + ') : Object.values(displayedInput?.selectedFacets ?? {}).map(facet => facet.label).join(' · ') || 'A blend of selected qualities')}</p>
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
              onChange={(event) => { setDraft(event.target.value); setAtlasChoices([]); }}
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
            <button ref={createAtlasButton} className="add-button create-atlas-button" type="button"
              disabled={reelLocked || draft.trim().length < 2 || connection !== 'connected'}
              onClick={event => void createAtlasFromDraft(event.currentTarget)}>
              {atlasLookupBusy ? 'Finding film…' : 'Create atlas'} <span aria-hidden="true">↗</span>
            </button>
            {atlasChoices.length ? <div className="composer-atlas-choices" aria-label="Choose a film for your atlas">
              <p role="status">Which film? Choose a release to create its atlas.</p>
              {atlasChoices.map(film => <button key={film.id} type="button" disabled={reelLocked || connection !== 'connected'}
                onClick={event => { openAtlas(film, createAtlasButton.current || event.currentTarget, false, true); setAtlasChoices([]); }}>
                <span>{film.title} <small>({film.year})</small></span><span aria-hidden="true">↗</span>
              </button>)}
            </div> : null}
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
        {notice ? <div className="notice" role="status">{notice}{replacementUndo && !reelLocked ? <button type="button" onClick={() => { setResult(replacementUndo.result); setDisplayedInput(replacementUndo.input); setScreeningIndex(replacementUndo.index); setReplacementUndo(null); setNotice('Your previous film is back in the reel.'); }}>Undo replacement</button> : null}{facetUndo && !reelLocked ? <button type="button" onClick={() => { setSelectedFacets(facetUndo.facets); setSelectedReelIdentity(facetUndo.identity); setFacetUndo(null); setNotice('Previous blend restored.'); }}>Undo</button> : null}</div> : null}
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
            <div><p>{replacementJob ? 'Finding one new film' : leaderMessage}</p><span>{result ? 'Your previous reel is still here. You can browse it while you wait.' : 'You can refresh this page; your accepted reel will resume.'}</span></div>
            {jobStartedAt !== null ? <time aria-live="off" className="elapsed">{Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, '0')} elapsed</time> : null}
          </section>
        ) : null}

        {result ? (
          <section className="results" aria-live="polite" ref={resultsRef}>
            <div className={developing ? "reel-heading" : "sr-only"}><h2>{developing ? 'Your previous reel' : 'Your reel'}</h2><span>Five films, considered together.</span></div>

            <ScreeningReel key={recommendationIdentity} films={result.recommendations} metadata={metadataByKey}
              selected={screeningIndex} onSelect={setScreeningIndex} onCompare={openComparison} onReplace={displayedInput && connection === 'connected' ? index => void replaceFilm(index) : undefined} pending={enrichmentPending} locked={reelLocked}
              likedKeys={likedKeys} savedKeys={savedKeys} onLike={toggleLike} onSave={toggleSave} onResolve={resolveFilm}
              selectedFacets={selectedFacets} onBorrow={lightTableEnabled ? handleSelectFacet : undefined}
              lightTable={selectedRecommendation === null && !atlasTarget ? lightTable : null}
              onOpen={(index, event) => openDossier(index, event.currentTarget)}
              onExplore={(index, event) => openAtlas(result.recommendations[index], event.currentTarget)} />
            {lightTableEnabled && result.fingerprint ? <details className="reel-fingerprint"><summary>The qualities behind this reel <span>+</span></summary><SearchFingerprint fingerprint={result.fingerprint} insight={result.insight} /></details> : null}

            <section className="atlas-entry"><div><h3>Atlas</h3><p>Films are never alone. Explore the connections around a film, and find what carries through.</p></div><button type="button" disabled={developing} onClick={event => openAtlas(result.recommendations[screeningIndex] || result.recommendations[0], event.currentTarget)}>Explore connections ↗</button></section>

            <details className="persona-panel"><summary><span>About this reel</span><strong>{result.persona}</strong><span aria-hidden="true">+</span></summary><div className="persona-details">
              <div className="palette" aria-label="Your cinematic palette">
                {result.palette.map((color) => <span key={color} style={{ background: color }} />)}
              </div>
              {result.sourceFilms.length ? <p className="reel-sources">Inspired by {result.sourceFilms.join(' · ')}</p> : null}<p className="insight">{result.insight}</p>
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
              onSelectFilm={index => { history.replaceState(history.state, '', filmUrl(index)); setSelectedRecommendation(index); setScreeningIndex(index); }}
              saved={selectedRecommendation !== null && savedKeys.has(movieKey(result.recommendations[selectedRecommendation].title, result.recommendations[selectedRecommendation].year))}
              onSave={() => { if (selectedRecommendation !== null) toggleSave(result.recommendations[selectedRecommendation]); }}
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
              onClose={closeDossier}
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
        {result ? <ReelComparison first={comparison ? { recommendation: result.recommendations[comparison.first], metadata: metadataByKey[movieKey(result.recommendations[comparison.first].title, result.recommendations[comparison.first].year)], index: comparison.first } : null} second={comparison ? { recommendation: result.recommendations[comparison.second], metadata: metadataByKey[movieKey(result.recommendations[comparison.second].title, result.recommendations[comparison.second].year)], index: comparison.second } : null} opener={comparison?.opener ?? null} onClose={closeComparison} onSelect={index => { setScreeningIndex(index); closeComparison(); }} onBorrow={lightTableEnabled ? handleSelectFacet : undefined} selectedFacets={selectedFacets} facetDisabled={reelLocked} /> : null}
        <FilmLibrary open={libraryOpen} opener={libraryOpener} onClose={closeLibrary}
          watchlist={watchlist} likes={likedFilms} onRemove={toggleSave} onUnlike={toggleLike}
          onImport={next => { if (!saveWatchlist(next)) throw new Error('The backup could not be saved in this browser.'); }}
          onExplore={(film, opener) => { setLibraryOpen(false); openAtlas(film, libraryOpener || opener, false, true); }} />
        <AtlasWorkspace key={atlasResetRevision} target={atlasTarget} opener={atlasOpener} onClose={closeAtlas} onBusy={setAtlasBusy} preferSaved={atlasResume}
          connected={connection === 'connected'} metadataByKey={metadataByKey} likedKeys={likedKeys} onLike={toggleLike} savedKeys={savedKeys} onSave={toggleSave}
          onExplore={(film, opener, request) => openAtlas(film, opener, false, false, request)} onSearchExplore={(film, opener) => openAtlas(film, opener, false, true)} selectedFacets={selectedFacets} onBorrow={lightTableEnabled ? handleSelectFacet : undefined} lightTable={atlasTarget ? lightTable : null} />
        </div>
      </div>
    </main>
  );
}
