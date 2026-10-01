'use client';

import { FormEvent, type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FilmDossier } from './components/film-dossier';
import { AtlasWorkspace } from './components/atlas';
import { parseFilmSearchResults, type FilmSearchResult } from './lib/film-search';
import { Landing, nextWelcomeFilm, type WelcomeFilm } from './components/landing';
import { EyeTest } from './components/eye-test';
import { CollisionChamber, useCollision } from './components/collision-chamber';
import { CollidePicker, type PartnerGroup } from './components/collide-picker';
import { FilmVerbs, useHold, type FilmVerb, type VerbFilm, type VerbMenu } from './components/film-verbs';
import type { CollisionFilm } from './lib/collision';
import { ROOM_DEFAULT, filmLight } from './lib/film-light';
import { ATLAS_STORAGE_KEY, buildAtlasInput, parseAtlasInputRequest, type AtlasInput } from './lib/atlas';
import { ATLAS_TRAIL_STORAGE_KEY, parseAtlasTrail, activeAtlasStop, emptyAtlasTrail, type AtlasTrail } from './lib/atlas-trail';
import { CollectionMenu } from './components/collection-menu';
import { SavedJourneys } from './components/saved-journeys';
import { libraryHash, parseCollectionRoute, type Collection, type LibraryTab } from './lib/navigation';
import { REEL_HISTORY_KEY, parseReelHistory, rememberReel, serializeReelHistory, type SavedReel } from './lib/reel-history';
import { ScreeningReel } from './components/screening-reel';
import { CelestialSky, MotionToggle, OrbitMark, StarGlyph } from './components/celestial';
import { YourSky } from './components/your-sky';
import { ReelConstellation } from './components/reel-constellation';
import { ChartingRoom, announceReady, useDevelopingTitle } from './components/charting';
import { AfterimageLog, type AfterimageTarget } from './components/afterimage-log';
import { AFTERIMAGE_JOURNAL_KEY, findAfterimage, parseAfterimages, removeAfterimage, serializeAfterimages, upsertAfterimage, type AfterimageDraft, type AfterimageEntry } from './lib/afterimages';
import { FilmLibrary } from './components/film-library';
import { ReelComparison } from './components/reel-comparison';
import { WATCHLIST_KEY, parseWatchlist, toggleWatchlist, type SavedFilm } from './lib/library';
import { SearchFingerprint } from './components/search-fingerprint';
import { LightTable } from './components/light-table';
import { LIGHT_TABLE_EXPERIENCE, buildBlendPayload, isSameSelectedFacet, removeFacet, selectFacet, selectionCount, type CinematicFacet, type FacetKey, type FacetMap, type FacetSource, type SelectedFacets } from './lib/light-table';
import { animateFacetToLane } from './lib/light-table-motion';
import { fetchFilmEnrichment, persistableEnrichment } from './lib/enrichment-client';
import type { FilmEnrichment } from './lib/movie-metadata';
import { movieKey } from './lib/movie-metadata';
import { MAX_LIKED_FILMS, TASTE_STORAGE_KEY, parseLikedFilms, toggleLikedFilm, type LikedFilm } from './lib/taste-profile';
import type { AfterimageResultV2, ExcludedFilm, DevelopInput, Experience } from './lib/reel-state';
import { GenerationPollError, pollGeneration } from './lib/generation-poller';
import type { JobDraft } from './lib/generation-state';
import { statusModelLabel } from './lib/claude';
import { answersInPage, apiFetch, savePassphrase, usesRemoteCompanion } from './lib/api';
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
type ConnectionState = 'checking' | 'connected' | 'disconnected' | 'unreachable' | 'locked';
type JobStatus = 'queued' | 'running' | 'reconnecting' | 'failed' | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// The GitHub Pages build reaches the companion directly; it answers 401 with this
// code until the owner's passphrase is entered in this browser.
function lockedOut(value: unknown): boolean {
  return isRecord(value) && (value.code === 'PASSPHRASE_REQUIRED' || value.code === 'PASSPHRASE_THROTTLED');
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
  const [atlasMapId, setAtlasMapId] = useState<string | null>(null);
  const [atlasTrail, setAtlasTrail] = useState(emptyAtlasTrail);
  const atlasTrailRef = useRef(atlasTrail);
  const [reels, setReels] = useState<SavedReel[]>([]);
  const reelsRef = useRef(reels);
  const restoredReelId = useRef<string | null>(null);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [collectionOpener, setCollectionOpener] = useState<HTMLElement | null>(null);
  const [libraryTab, setLibraryTab] = useState<LibraryTab>('watchlist');
  const closeAtlas = useCallback(() => {
    if (window.history.state?.afterimageOverlay) window.history.back();
    else { const url = new URL(location.href); url.hash = ''; history.replaceState(null, '', url); setAtlasTarget(null); }
  }, []);
  const [excludedFilms, setExcludedFilms] = useState<ExcludedFilm[]>([]);
  const [likedFilms, setLikedFilms] = useState<LikedFilm[]>([]);
  const [watchlist, setWatchlist] = useState<SavedFilm[]>([]);
  const [afterimages, setAfterimages] = useState<AfterimageEntry[]>([]);
  const [afterimageTarget, setAfterimageTarget] = useState<{ film: AfterimageTarget; opener: HTMLElement | null } | null>(null);
  const [skyOpen, setSkyOpen] = useState(false);
  const [skyOpener, setSkyOpener] = useState<HTMLElement | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryOpener, setLibraryOpener] = useState<HTMLElement | null>(null);
  const [screeningIndex, setScreeningIndex] = useState(0);
  const [comparison, setComparison] = useState<{ first: number; second: number; opener: HTMLElement | null } | null>(null);
  const [replacementJob, setReplacementJob] = useState<{ jobId: string; index: number }>();
  const [replacementUndo, setReplacementUndo] = useState<{ result: AfterimageResultV2; input: DevelopInput; index: number } | null>(null);
  const savedKeys = useMemo(() => new Set(watchlist.map(film => movieKey(film.title, film.year))), [watchlist]);
  const likedKeys = useMemo(() => new Set(likedFilms.map(film => movieKey(film.title, film.year))), [likedFilms]);
  const afterimageKeys = useMemo(() => new Set(afterimages.map(entry => movieKey(entry.title, entry.year))), [afterimages]);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState('');
  const [facetUndo, setFacetUndo] = useState<{ facets: SelectedFacets; identity: string } | null>(null);
  const [error, setError] = useState('');
  const [connection, setConnection] = useState<ConnectionState>('checking');
  const [claudeModel, setClaudeModel] = useState<string | null>(null);
  const [connectionNote, setConnectionNote] = useState('');
  const [passphraseDraft, setPassphraseDraft] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus>(null);
  // What the running job has developed so far; provisional and never saved.
  const [jobDraft, setJobDraft] = useState<JobDraft | null>(null);
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
  const navigationLocked = useRef(true);
  useEffect(() => { navigationLocked.current = reelLocked; }, [reelLocked]);
  const resetLocked = starting || Boolean(activeJobId && jobStatus !== 'failed') || atlasBusy || atlasLookupBusy;
  const hasSession = Boolean(result || films.length || draft || creativeBrief || activeJobId || excludedFilms.length || selectionCount(selectedFacets));
  const showLanding = hydrated && !activeJobId && (welcomeRequested || (landingOpen && !result));
  const acceptedRetryInput = activeJobId
    ? acceptedInputForResumedJob(activeJobId, acceptedInputJobId || undefined, acceptedInput)
    : undefined;

  const refreshConnection = useCallback(async (silent = false): Promise<ConnectionState> => {
    if (!silent) setConnection('checking');
    let next: ConnectionState;
    try {
      const response = await apiFetch('/api/status', { cache: 'no-store' });
      const payload = await response.json();
      if (response.ok) setClaudeModel(statusModelLabel(payload));
      if (response.ok && isRecord(payload) && payload.authenticated) {
        next = 'connected';
        setConnectionNote('');
      } else if (lockedOut(payload)) {
        next = 'locked';
        if (response.status === 429) setConnectionNote(responseMessage(payload, 'Too many wrong attempts. Try again in a few minutes.'));
      } else {
        next = response.status === 503 || response.status === 502 ? 'unreachable' : 'disconnected';
      }
    } catch {
      next = 'unreachable';
    }
    setConnection(next);
    return next;
  }, []);

  async function unlockCompanion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const passphrase = passphraseDraft.trim();
    if (!passphrase) return;
    setConnecting(true);
    setConnectionNote('');
    if (!savePassphrase(passphrase)) {
      setConnectionNote('This browser would not keep the passphrase. Allow site storage, then try again.');
      setConnecting(false);
      return;
    }
    const next = await refreshConnection();
    if (next === 'locked') {
      savePassphrase('');
      setConnectionNote((current) => current || 'That passphrase did not unlock the companion.');
    } else {
      setPassphraseDraft('');
    }
    setConnecting(false);
  }

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
        atlasTrailRef.current = atlasTrail; setAtlasTrail(atlasTrail);
        setAtlasBusy(Boolean(atlasTrail.pending));
        const history = parseReelHistory(localStorage.getItem(REEL_HISTORY_KEY));
        reelsRef.current = history; setReels(history);
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
        setAfterimages(parseAfterimages(localStorage.getItem(AFTERIMAGE_JOURNAL_KEY)));
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
    if (!hydrated) return;
    const pop = () => {
      const route = parseCollectionRoute(location.hash);
      setWelcomeRequested(route?.kind === 'home' || new URLSearchParams(location.search).get('welcome') === '1');
      setCollection(route?.kind === 'atlases' || route?.kind === 'reels' ? route.kind : null);
      setLibraryOpen(route?.kind === 'library');
      setSkyOpen(route?.kind === 'sky');
      if (route?.kind === 'library') setLibraryTab(route.tab);
      if (route?.kind === 'current' || route?.kind === 'reel') {
        setWelcomeRequested(false); setLandingOpen(false);
        const url = new URL(location.href); url.searchParams.delete('welcome'); history.replaceState(history.state, '', url);
      }
      if (route?.kind === 'reel' && route.id !== restoredReelId.current) {
        const saved = reelsRef.current.find(item => item.id === route.id);
        if (!saved || navigationLocked.current || startLockRef.current || atlasLookupLock.current) {
          setCollection('reels');
          const url = new URL(location.href); url.hash = 'reels'; history.replaceState(history.state, '', url);
          setNotice(saved ? 'Finish the current discovery before switching reels.' : 'That reel is no longer saved in this browser.');
        } else {
          restoredReelId.current = saved.id;
          const state = saved.state;
          setExperience(state.experience); setFilms(state.films); setCreativeBrief(state.creativeBrief); setDraft('');
          setResult(state.result); setMetadataByKey(state.metadataByKey); setDisplayedInput(state.displayedInput);
          setExcludedFilms(state.excludedFilms); setScreeningIndex(state.screeningIndex ?? 0);
          setAcceptedInput(undefined); setAcceptedInputJobId(''); setReplacementJob(undefined); setReplacementUndo(null);
          setSelectedFacets(state.selectedFacets ?? {}); setSelectedReelIdentity(state.selectedReelIdentity ?? ''); setFacetUndo(null);
          lastAttemptRef.current = undefined; setError(''); setNotice(''); setComposerOpen(false);
          requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        }
      }
      let key = '';
      try { key = location.hash.startsWith('#film=') ? decodeURIComponent(location.hash.slice(6)) : ''; } catch { /* Ignore damaged links. */ }
      const index = result?.recommendations.findIndex(film => movieKey(film.title, film.year) === key) ?? -1;
      setSelectedRecommendation(index < 0 ? null : index);
      if (index >= 0) setScreeningIndex(index);
      if (route?.kind !== 'atlas') setAtlasTarget(null);
      else {
        const saved = route.id ? atlasTrailRef.current.maps.find(map => map.id === route.id) : activeAtlasStop(atlasTrailRef.current);
        const request = saved ? parseAtlasInputRequest(saved.inputKey, saved.atlas.anchor) : null;
        if (saved && request) {
          const target = buildAtlasInput(saved.atlas.anchor, request, request.excludedFilms ?? [], []);
          lastAtlasTarget.current = target; setAtlasMapId(saved.id); setAtlasResume(true); setAtlasTarget(target);
        } else if (!route.id && lastAtlasTarget.current) { setAtlasMapId(null); setAtlasResume(true); setAtlasTarget(lastAtlasTarget.current); }
        else { setAtlasTarget(null); setCollection('atlases'); if (route.id) setNotice('That Atlas is no longer saved in this browser.'); }
      }
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
    window.addEventListener('hashchange', pop);
    return () => { clearTimeout(timer); window.removeEventListener('popstate', pop); window.removeEventListener('hashchange', pop); };
    // Navigation reads the latest collections through refs; browsing a lens must not reopen a dialog.
  }, [result, hydrated]);

  const rememberAtlasTrail = useCallback((trail: AtlasTrail) => { atlasTrailRef.current = trail; setAtlasTrail(trail); }, []);
  const updateAtlasAddress = useCallback((id: string) => {
    if (parseCollectionRoute(location.hash)?.kind !== 'atlas') return;
    setAtlasMapId(id);
    const url = new URL(location.href); url.hash = `atlas=${id}`;
    history.replaceState(history.state, '', url);
  }, []);
  function navigateCollection(hash: string, opener: HTMLElement) {
    setNotice('');
    setCollectionOpener(opener); setLibraryOpener(opener); setAtlasOpener(opener); setSkyOpener(opener);
    const url = new URL(location.href); url.hash = hash;
    if (location.hash !== hash) history.pushState({ afterimageOverlay: true }, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
  function closeCollection() {
    if (history.state?.afterimageOverlay) history.back();
    else { const url = new URL(location.href); url.hash = ''; history.replaceState(null, '', url); setCollection(null); }
  }
  function closeLibrary() {
    if (history.state?.afterimageOverlay) history.back();
    else { const url = new URL(location.href); url.hash = ''; history.replaceState(null, '', url); setLibraryOpen(false); }
  }
  function closeSky() {
    if (history.state?.afterimageOverlay) history.back();
    else { const url = new URL(location.href); url.hash = ''; history.replaceState(null, '', url); setSkyOpen(false); }
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

  function facetsFor(film: { title: string; year: string }): FacetMap | undefined {
    const key = movieKey(film.title, film.year);
    const fromReel = (reel: AfterimageResultV2 | null | undefined) => reel?.recommendations.find(item => movieKey(item.title, item.year) === key)?.facets;
    const fromAtlas = atlasTrail.maps.flatMap(map => [map.atlas.anchor, ...map.atlas.neighbors]).find(item => movieKey(item.title, item.year) === key)?.facets;
    return fromReel(result) ?? reels.map(reel => fromReel(reel.state.result)).find(Boolean) ?? fromAtlas;
  }
  function openAfterimage(film: { title: string; year: string; tmdbId?: number }, opener: HTMLElement | null) {
    const details = metadataByKey[movieKey(film.title, film.year)];
    const tmdbId = film.tmdbId ?? (details?.status === 'matched' ? details.tmdbId : undefined);
    setAfterimageTarget({ film: { title: film.title, year: film.year, ...(tmdbId ? { tmdbId } : {}), facets: facetsFor(film) }, opener });
  }
  function saveAfterimage(draft: AfterimageDraft, options: { like: boolean; unsave: boolean }): string | null {
    let next: AfterimageEntry[];
    try {
      next = upsertAfterimage(afterimages, draft);
      localStorage.setItem(AFTERIMAGE_JOURNAL_KEY, serializeAfterimages(next));
    } catch (reason) {
      return reason instanceof DOMException || !(reason instanceof Error) ? 'This browser could not keep the afterimage. Free some storage and try again.' : reason.message;
    }
    setAfterimages(next);
    const film = { title: draft.title, year: draft.year, ...(draft.tmdbId ? { tmdbId: draft.tmdbId } : {}) };
    if (options.like && !likedKeys.has(movieKey(film.title, film.year))) toggleLike(film);
    if (options.unsave && savedKeys.has(movieKey(film.title, film.year))) toggleSave(film);
    setNotice(`An afterimage of ${draft.title} now glows in your sky.`);
    return null;
  }
  function forgetAfterimage(film: { title: string; year: string }) {
    const next = removeAfterimage(afterimages, film);
    try { localStorage.setItem(AFTERIMAGE_JOURNAL_KEY, serializeAfterimages(next)); setAfterimages(next); setNotice(`The afterimage of ${film.title} has been removed.`); }
    catch { setNotice('This browser could not update your afterimages. Please try again.'); }
  }

  useEffect(() => {
    const syncLikes = (event: StorageEvent) => {
      if (event.storageArea === localStorage && (event.key === WATCHLIST_KEY || event.key === null)) setWatchlist(parseWatchlist(event.key === null ? null : event.newValue));
      if (event.storageArea === localStorage && (event.key === TASTE_STORAGE_KEY || event.key === null)) setLikedFilms(parseLikedFilms(event.newValue));
      if (event.storageArea === localStorage && (event.key === REEL_HISTORY_KEY || event.key === null)) { const next = parseReelHistory(event.newValue); reelsRef.current = next; setReels(next); }
      if (event.storageArea === localStorage && (event.key === AFTERIMAGE_JOURNAL_KEY || event.key === null)) setAfterimages(parseAfterimages(event.newValue));
    };
    window.addEventListener('storage', syncLikes);
    return () => window.removeEventListener('storage', syncLikes);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const stored = {
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
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      // Merge with storage so another tab's saved reels are not overwritten.
      const currentHistory = parseReelHistory(localStorage.getItem(REEL_HISTORY_KEY));
      const next = rememberReel(currentHistory, parseStoredState(JSON.stringify(stored)), crypto.randomUUID(), new Date().toISOString());
      const serialized = serializeReelHistory(next);
      if (serialized !== localStorage.getItem(REEL_HISTORY_KEY)) localStorage.setItem(REEL_HISTORY_KEY, serialized);
      if (serialized !== serializeReelHistory(reelsRef.current)) {
        reelsRef.current = next;
        const timer = window.setTimeout(() => setReels(next), 0);
        return () => window.clearTimeout(timer);
      }
    } catch {
      const timer = window.setTimeout(() => setNotice('This browser could not save the reel. Keep this page open to retain your selections.'), 0);
      return () => window.clearTimeout(timer);
    }
  }, [films, creativeBrief, result, activeJobId, metadataByKey, excludedFilms, hydrated, experience, lightTableEnabled, selectedFacets, selectedReelIdentity, acceptedInput, acceptedInputJobId, displayedInput, replacementJob, screeningIndex]);

  useEffect(() => {
    const connectionCheck = window.setTimeout(() => void refreshConnection(), 0);
    return () => window.clearTimeout(connectionCheck);
  }, [refreshConnection]);

  useEffect(() => {
    if (!hydrated || !activeJobId || connection !== 'connected') return;

    const controller = new AbortController();

    void (async () => {
      try {
        const terminal = await pollGeneration({
          signal: controller.signal,
          fetchStatus: async (signal) => {
            const response = await apiFetch(`/api/generations/${encodeURIComponent(activeJobId)}`, {
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
              setJobDraft(job.status === 'running' && job.draft ? job.draft : null);
            } else {
              setJobDraft(null);
            }
          },
          onTransientError: () => {
            if (!controller.signal.aborted) setJobStatus('reconnecting');
          },
        });

        if (controller.signal.aborted) return;
        if (terminal.status === 'complete') {
          if (parseCollectionRoute(location.hash)?.kind === 'reel') {
            const url = new URL(location.href); url.hash = 'current'; history.replaceState(history.state, '', url);
          }
          restoredReelId.current = null;
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
          announceReady(replaced ? 'One new film has joined your reel.' : `Five films are waiting: ${terminal.reel.persona}.`);
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

    return () => { controller.abort(); setJobDraft(null); };
  // Result and displayed input remain stable while this accepted job is running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJobId, connection, hydrated, pollRevision, experience, lightTableEnabled, selectedFacets, selectedReelIdentity, acceptedInput, acceptedInputJobId, replacementJob]);

  useEffect(() => {
    if (!developing || jobStartedAt === null) return;
    const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - jobStartedAt) / 1000)));
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [developing, jobStartedAt]);

  useEffect(() => {
    if (connection !== 'connected' || !pendingAnswer.current || developing || activeJobId) return;
    const input = pendingAnswer.current;
    pendingAnswer.current = null;
    setComposerOpen(false);
    void developReel(false, [], input);
    // Only a newly working connection releases an answer given while locked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection]);

  const recommendationIdentity = useMemo(
    () => getRecommendationIdentity(result),
    [result],
  );

  // Films that arrive in a developing reel get their posters early, so the finished reel
  // opens with them. Like every lookup, this is best effort.
  const draftLookups = useRef(new Set<string>());
  const draftFilms = useMemo(() => [...(jobDraft?.recommendations ?? []), ...(jobDraft?.recommendation ? [jobDraft.recommendation] : [])], [jobDraft]);
  useEffect(() => {
    const pending = draftFilms.filter(film => {
      const key = movieKey(film.title, film.year);
      return !metadataByKey[key] && !draftLookups.current.has(key);
    }).slice(0, 5);
    if (!pending.length) return;
    pending.forEach(film => draftLookups.current.add(movieKey(film.title, film.year)));
    void fetchFilmEnrichment({ recommendations: pending })
      .then(records => setMetadataByKey(current => ({ ...current, ...persistableEnrichment(records) })))
      .catch(() => { /* The finished reel looks its films up again. */ });
  }, [draftFilms, metadataByKey]);
  const draftPoster = useCallback((film: { title: string; year: string }) => {
    const record = metadataByKey[movieKey(film.title, film.year)];
    return record?.status === 'matched' ? record.posterUrl ?? null : null;
  }, [metadataByKey]);

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
      const response = await apiFetch(`/api/films/search?q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(10000) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setNotice(responseMessage(payload, 'Film search could not connect. Try again.'));
        return;
      }
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

  // Claude runs on the companion's Anthropic key, so there is no sign-in to start:
  // the companion re-checks the key and says plainly what is missing.
  async function startConnection() {
    setConnecting(true);
    setError('');
    try {
      const response = await apiFetch('/api/connect', { method: 'POST' });
      const payload = await response.json();
      if (response.ok && isRecord(payload) && payload.alreadyAuthenticated) {
        await refreshConnection();
        return;
      }
      setConnection(isRecord(payload) && payload.code === 'CLAUDE_NOT_CONNECTED' ? 'disconnected' : 'unreachable');
      setConnectionNote(responseMessage(payload, 'Claude could not be reached.'));
    } catch {
      setConnectionNote('Claude could not be reached.');
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
      const response = await apiFetch('/api/generations', {
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
        // A collision holds the slot for a moment; it is not a reel to resume.
        if (payload.jobId === collision.state?.jobId) {
          setNotice('A collision is developing. Your reel can start as soon as it lands.');
          return;
        }
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

      if (response.status === 401) setConnection(lockedOut(payload) ? 'locked' : 'disconnected');
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
      const response = await apiFetch('/api/replacements/generations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request, reel: result, replaceIndex: index }) });
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
    restoredReelId.current = null;
    lastAtlasTarget.current = null; setAtlasMapId(null);
    setCollection(null); setLibraryOpen(false);
    const url = new URL(location.href); url.hash = ''; history.replaceState(null, '', url);
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

  useDevelopingTitle(developing);
  const chartingInput = acceptedInput ?? (films.length || creativeBrief ? { films, creativeBrief } as DevelopInput : undefined);
  const chartingSources = chartingInput ? [
    ...chartingInput.films,
    ...Object.values(chartingInput.selectedFacets ?? {}).map(facet => facet.label),
    ...(!chartingInput.films.length && !selectionCount(chartingInput.selectedFacets ?? {}) && chartingInput.creativeBrief ? [`“${chartingInput.creativeBrief.length > 64 ? `${chartingInput.creativeBrief.slice(0, 63)}…` : chartingInput.creativeBrief}”`] : []),
  ] : [];
  const starCount = useMemo(() => {
    const keys = new Set<string>();
    const add = (film: { title: string; year: string }) => keys.add(movieKey(film.title, film.year));
    reels.forEach(reel => reel.state.result?.recommendations.forEach(add));
    atlasTrail.maps.forEach(map => [map.atlas.anchor, ...map.atlas.neighbors].forEach(add));
    [...likedFilms, ...watchlist, ...afterimages].forEach(add);
    return keys.size;
  }, [reels, atlasTrail, likedFilms, watchlist, afterimages]);

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
    setAtlasMapId(null);
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
  // Collisions: two films, and the one film between them.
  const [collidePick, setCollidePick] = useState<{ film: CollisionFilm; opener: HTMLElement | null } | null>(null);
  const [collisionOpener, setCollisionOpener] = useState<HTMLElement | null>(null);
  const recheckConnection = useCallback(() => { void refreshConnection(true); }, [refreshConnection]);
  const collisionFound = useCallback((found: { films: [CollisionFilm, CollisionFilm]; film: CollisionFilm }) => {
    setNotice(`Between ${found.films[0].title} and ${found.films[1].title}: ${found.film.title}.`);
  }, []);
  const collision = useCollision({ onLocked: recheckConnection, onFound: collisionFound });
  function startCollision(first: CollisionFilm, second: CollisionFilm, opener: HTMLElement | null) {
    setCollidePick(null);
    if (collision.state && (collision.state.status === 'starting' || collision.state.status === 'developing')) {
      collision.reopen();
      setNotice('One collision at a time. This one is still developing.');
      return;
    }
    const identity = (film: CollisionFilm): CollisionFilm => {
      const record = metadataByKey[movieKey(film.title, film.year)];
      const tmdbId = film.tmdbId ?? (record?.status === 'matched' ? record.tmdbId : undefined);
      return { title: film.title, year: film.year, ...(tmdbId ? { tmdbId } : {}) };
    };
    setCollisionOpener(opener);
    void collision.start(identity(first), identity(second), {
      excludedFilms, likedFilms, creativeBrief: displayedInput?.creativeBrief ?? '',
      reelFilms: result?.recommendations.map(({ title, year }) => ({ title, year })) ?? [],
    });
  }
  function partnerGroups(): PartnerGroup[] {
    return [
      { label: 'In this reel', films: result?.recommendations.map(({ title, year }) => ({ title, year })) ?? [] },
      { label: 'Films you liked', films: [...likedFilms].reverse() },
      { label: 'Saved for later', films: [...watchlist].reverse() },
      { label: 'Films you watched', films: [...afterimages].reverse().map(({ title, year, tmdbId }) => ({ title, year, ...(tmdbId ? { tmdbId } : {}) })) },
    ];
  }

  // A film's verbs, under a long press, a right-click or the menu key.
  const [verbMenu, setVerbMenu] = useState<VerbMenu | null>(null);
  const closeVerbs = useCallback(() => setVerbMenu(null), []);
  function openVerbs(film: VerbFilm, element: HTMLElement, point: { x: number; y: number }, index?: number) {
    const key = movieKey(film.title, film.year);
    const reelFilm = index !== undefined ? result?.recommendations[index] : undefined;
    const inReel = Boolean(reelFilm && movieKey(reelFilm.title, reelFilm.year) === key);
    const online = connection === 'connected';
    const verbs: FilmVerb[] = [
      { id: 'collide', label: 'Collide with…', detail: 'Find the film between two', disabled: !online, run: opener => setCollidePick({ film, opener }) },
      { id: 'atlas', label: 'Explore its connections', detail: 'Open its Atlas', disabled: !online || reelLocked,
        run: opener => { if (inReel && reelFilm) openAtlas(reelFilm, opener); else openAtlas(film, opener, false, true); } },
      ...(inReel && index !== undefined && lightTableEnabled && reelFilm?.facets ? [{
        id: 'borrow', label: 'Borrow its qualities', detail: 'Carry them into your next reel', disabled: reelLocked,
        run: () => {
          setScreeningIndex(index);
          window.setTimeout(() => {
            const qualities = document.querySelector<HTMLElement>('.screening-qualities');
            qualities?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
            qualities?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
          }, 60);
        },
      }] : []),
      { id: 'watched', label: afterimageKeys.has(key) ? 'Your ticket stub' : 'Watched it?', detail: afterimageKeys.has(key) ? 'Revisit what stayed' : 'Keep what stayed, and a ticket stub', run: opener => openAfterimage(film, opener) },
      { id: 'like', label: likedKeys.has(key) ? 'Unlike' : 'Like', run: () => toggleLike({ title: film.title, year: film.year }) },
      { id: 'save', label: savedKeys.has(key) ? 'Remove from watchlist' : 'Save for later', run: () => toggleSave(film) },
      ...(inReel && index !== undefined && displayedInput && online ? [{ id: 'replace', label: 'Replace this film', disabled: reelLocked, run: () => void replaceFilm(index) }] : []),
    ];
    setVerbMenu({ film, verbs, x: point.x, y: point.y, opener: element });
  }
  const holdFilm = useHold<{ film: VerbFilm; index?: number }>((payload, element, point) => openVerbs(payload.film, element, point, payload.index));

  // The entrance's one question: the answer becomes the request and develops at once,
  // or right after the companion is unlocked.
  const pendingAnswer = useRef<DevelopInput | null>(null);
  const [eyeTest, setEyeTest] = useState<{ opener: HTMLElement | null; sitting: number } | null>(null);
  function openEyeTest() {
    setEyeTest({ opener: document.activeElement instanceof HTMLElement ? document.activeElement : null, sitting: Date.now() });
  }
  function answerQuestion(request: { films: string[]; creativeBrief: string }) {
    leaveWelcomePreview();
    const lightTableDefault = new URLSearchParams(location.search).get('experience') !== 'standard';
    const useLightTable = hasSession ? lightTableEnabled : lightTableDefault;
    if (!hasSession && lightTableDefault) setExperience(LIGHT_TABLE_EXPERIENCE);
    setFilms(request.films);
    setCreativeBrief(request.creativeBrief);
    setDraft('');
    clearFacetSelections();
    setLandingOpen(false);
    const input: DevelopInput = {
      ...buildDevelopPayload(request.films, request.creativeBrief, normalizeExcludedFilms(excludedFilms)),
      ...(useLightTable ? { experience: LIGHT_TABLE_EXPERIENCE } : {}),
    };
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    if (connection === 'connected') {
      setComposerOpen(false);
      void developReel(false, [], input);
    } else {
      pendingAnswer.current = input;
      setComposerOpen(true);
    }
  }
  function goHome() {
    leaveWelcomePreview();
    if (result) setComposerOpen(false);
    else if (!activeJobId && !starting) setLandingOpen(true);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  }

  // The room takes the light of the film on screen, and warms for a film you love.
  const screenFilm = result?.recommendations[screeningIndex];
  const roomLight = result ? filmLight(result.palette, screeningIndex) : ROOM_DEFAULT;
  const roomLoved = Boolean(screenFilm && likedKeys.has(movieKey(screenFilm.title, screenFilm.year)));

  const collectionMenu = <CollectionMenu atlasCount={atlasTrail.maps.length} reelCount={reels.length} savedCount={watchlist.length} likedCount={likedFilms.length} starCount={starCount} afterimageCount={afterimages.length} recentAtlas={activeAtlasStop(atlasTrail) ?? undefined} onNavigate={navigateCollection} />;
  const skyLink = <a className={`sky-link${hydrated && !starCount ? ' is-empty' : ''}`} href="#sky" onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigateCollection('#sky', event.currentTarget); }}>
    <StarGlyph /><span>Your sky</span>{hydrated && starCount ? <small>{starCount}</small> : null}</a>;

  return (
    <main data-ready={hydrated} className={`site-shell projection-room${lightTableEnabled ? ' has-light-table' : ''}${result ? ' has-reel' : ''}${showLanding ? ' is-landing' : ''}${roomLoved ? ' is-loved' : ''}`}
      style={{ '--reel-color': roomLight } as CSSProperties}>
      {!showLanding ? <CelestialSky variant="page" /> : null}
      <div className="wrap">
        <header className="masthead">
          <h1 className="title"><button type="button" aria-label="Afterimage home" onClick={goHome}><OrbitMark />AFTERIMAGE</button></h1>
          {showLanding ? <nav className="welcome-home-nav" aria-label="Welcome navigation"><MotionToggle />{skyLink}{collectionMenu}</nav> : <div className="masthead-actions">
            <MotionToggle />
            <span className={`privacy-mark ${connection === 'connected' ? 'is-connected' : ''}`}>
              <i aria-hidden="true" />{connection === 'connected' ? 'Connected' : connection === 'checking' ? 'Connecting…' : 'Not connected'}
            </span>
            {hydrated && hasSession ? <button className="start-over" type="button" onClick={startOver} disabled={resetLocked}
              title={resetLocked ? 'Available when this reel finishes developing' : 'Clear this reel, its inputs, and selected qualities'}>
              Start over <span aria-hidden="true">↺</span>
            </button> : null}
            {skyLink}
            {collectionMenu}
          </div>}
        </header>
        {showLanding ? <Landing featuredFilm={featuredFilm} onStart={() => enterReel()} onAnswer={answerQuestion} onEyeTest={() => openEyeTest()}
          canSearch={connection === 'connected'} hasDraft={hasSession} hasReel={Boolean(result)} /> : null}
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

        {developing ? (
          <ChartingRoom variant={replacementJob ? 'replacement' : 'reel'} message={replacementJob ? 'Finding one new film' : leaderMessage}
            detail={result ? 'Your previous reel is still here. You can browse it while you wait.' : 'You can refresh this page; your accepted reel will resume.'}
            elapsed={jobStartedAt !== null ? `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, '0')}` : null}
            sources={chartingSources} draft={jobDraft} posterFor={draftPoster} />
        ) : null}

        {connection !== 'connected' && connection !== 'checking' ? (
          <section className="connection-panel" aria-live="polite">
            <div>
              <div className="connection-kicker">Private intelligence · Claude</div>
              <h2>{connection === 'locked' ? 'Unlock AFTERIMAGE' : connection === 'unreachable' ? 'Claude is out of reach' : 'Connect Claude'}</h2>
              <p>
                {connection === 'locked'
                  ? 'This copy of AFTERIMAGE talks to your private Claude companion. Enter its passphrase to continue; it stays in this browser.'
                  : connection === 'unreachable'
                    ? usesRemoteCompanion
                      ? 'The companion is unavailable. Your films and saved reel remain on this device.'
                      : 'The reel service is unavailable. Your films and saved reel remain on this device.'
                    : answersInPage
                      ? 'This copy of AFTERIMAGE asks Claude from inside claude.ai, on your own Claude account. Open it from your Artifacts in claude.ai, then check again. Your existing reel stays available.'
                      : 'AFTERIMAGE is programmed by Claude through its private companion. Connect the companion to your Claude subscription, then check again. Your existing reel stays available.'}
              </p>
              {connectionNote ? <p className="connection-note" role="status">{connectionNote}</p> : null}
            </div>
            {connection === 'locked' ? (
              <form className="connection-unlock" onSubmit={unlockCompanion}>
                <label htmlFor="companion-passphrase" className="sr-only">Passphrase</label>
                <input id="companion-passphrase" type="password" autoComplete="current-password" placeholder="Passphrase"
                  value={passphraseDraft} onChange={(event) => setPassphraseDraft(event.target.value)} />
                <button type="submit" disabled={connecting || !passphraseDraft.trim()}>{connecting ? 'Unlocking…' : 'Unlock'}</button>
              </form>
            ) : (
              <button type="button" onClick={startConnection} disabled={connecting}>
                {connecting ? 'Checking…' : 'Check connection'}
              </button>
            )}
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
        {notice ? <div className="notice" role="status">{notice}{replacementUndo && !reelLocked ? <button type="button" onClick={() => { setResult(replacementUndo.result); setDisplayedInput(replacementUndo.input); setScreeningIndex(replacementUndo.index); setReplacementUndo(null); setNotice('Your previous film is back in the reel.'); }}>Undo replacement</button> : null}{facetUndo && !reelLocked ? <button type="button" onClick={() => { setSelectedFacets(facetUndo.facets); setSelectedReelIdentity(facetUndo.identity); setFacetUndo(null); setNotice('Previous blend restored.'); }}>Undo</button> : null}{collision.state && !collision.open ? <button type="button" onClick={collision.reopen}>{collision.state.status === 'complete' ? 'See the collision' : 'Back to the collision'}</button> : null}</div> : null}
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



        {result ? (
          <section className="results" aria-live="polite" ref={resultsRef}>
            <div className={developing ? "reel-heading" : "sr-only"}><h2>{developing ? 'Your previous reel' : 'Your reel'}</h2><span>Five films, considered together.</span></div>

            <ReelConstellation key={`constellation-${recommendationIdentity}`} seed={recommendationIdentity} name={result.persona} insight={result.insight} palette={result.palette}
              films={result.recommendations} selected={screeningIndex} onSelect={setScreeningIndex} onNotice={setNotice}
              onOpenSky={opener => navigateCollection('#sky', opener)} hold={holdFilm}
              onCollide={connection === 'connected' ? (first, second, opener) => startCollision(result.recommendations[first], result.recommendations[second], opener) : undefined} />
            <ScreeningReel key={recommendationIdentity} films={result.recommendations} metadata={metadataByKey}
              selected={screeningIndex} onSelect={setScreeningIndex} onCompare={openComparison} onReplace={displayedInput && connection === 'connected' ? index => void replaceFilm(index) : undefined} pending={enrichmentPending} locked={reelLocked}
              likedKeys={likedKeys} savedKeys={savedKeys} afterimageKeys={afterimageKeys} onLike={toggleLike} onSave={toggleSave} onResolve={resolveFilm}
              onAfterimage={(film, opener) => openAfterimage(film, opener)}
              selectedFacets={selectedFacets} onBorrow={lightTableEnabled ? handleSelectFacet : undefined}
              lightTable={selectedRecommendation === null && !atlasTarget ? lightTable : null}
              onOpen={(index, event) => openDossier(index, event.currentTarget)}
              onExplore={(index, event) => openAtlas(result.recommendations[index], event.currentTarget)} hold={holdFilm} />
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
              afterimage={selectedRecommendation !== null && afterimageKeys.has(movieKey(result.recommendations[selectedRecommendation].title, result.recommendations[selectedRecommendation].year))}
              onAfterimage={opener => { if (selectedRecommendation !== null) openAfterimage(result.recommendations[selectedRecommendation], opener); }}
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
          <p>Like films you have seen and loved. Shared patterns gently guide future discoveries; your current request and Light Table qualities come first. Saved in this browser, even when you start over. <a href="#sky" onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigateCollection('#sky', event.currentTarget); }}>See them shine in your sky ✦</a></p>
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
        <footer className="site-footer"><span>AFTERIMAGE · reasoned live by {claudeModel ?? 'Claude'}</span>
          <span className="ai-mode-note">{lightTableEnabled ? <a href="?experience=standard">Use standard reel</a> : <a href="?experience=light-table-v1">Enable Light Table</a>}</span>
        </footer>
        {result ? <ReelComparison first={comparison ? { recommendation: result.recommendations[comparison.first], metadata: metadataByKey[movieKey(result.recommendations[comparison.first].title, result.recommendations[comparison.first].year)], index: comparison.first } : null} second={comparison ? { recommendation: result.recommendations[comparison.second], metadata: metadataByKey[movieKey(result.recommendations[comparison.second].title, result.recommendations[comparison.second].year)], index: comparison.second } : null} opener={comparison?.opener ?? null} onClose={closeComparison} onSelect={index => { setScreeningIndex(index); closeComparison(); }} onBorrow={lightTableEnabled ? handleSelectFacet : undefined} selectedFacets={selectedFacets} facetDisabled={reelLocked} /> : null}
        </div>
        <SavedJourneys key={collection ?? 'closed'} collection={collection} opener={collectionOpener} atlases={atlasTrail.maps} reels={reels} reelLocked={reelLocked} notice={notice} onClose={closeCollection} onNavigate={navigateCollection} />
        <FilmLibrary open={libraryOpen} opener={libraryOpener} onClose={closeLibrary} tab={libraryTab} onTabChange={tab => { setLibraryTab(tab); const url = new URL(location.href); url.hash = libraryHash(tab); history.replaceState(history.state, '', url); }}
          watchlist={watchlist} likes={likedFilms} afterimages={afterimages} onRemove={toggleSave} onUnlike={toggleLike}
          onEditAfterimage={(entry, opener) => openAfterimage(entry, opener)} onRemoveAfterimage={entry => forgetAfterimage(entry)}
          onImport={next => { if (!saveWatchlist(next)) throw new Error('The backup could not be saved in this browser.'); }}
          onExplore={(film, opener) => { setLibraryOpen(false); openAtlas(film, libraryOpener || opener, false, true); }} />
        <YourSky open={skyOpen} opener={skyOpener} onClose={closeSky} reels={reels} atlases={atlasTrail.maps} likes={likedFilms} watchlist={watchlist} afterimages={afterimages}
          metadataByKey={metadataByKey} likedKeys={likedKeys} savedKeys={savedKeys} canExplore={connection === 'connected' && !reelLocked}
          onLike={toggleLike} onSave={toggleSave} onLogAfterimage={(film, opener) => openAfterimage(film, opener)} onNavigate={navigateCollection}
          onCollide={connection === 'connected' ? (film, opener) => setCollidePick({ film, opener }) : undefined}
          onExplore={(film, opener) => { setSkyOpen(false); openAtlas(film, skyOpener || opener, false, true); }}
          onBegin={() => { setSkyOpen(false); enterReel(); }} />
        <AfterimageLog key={afterimageTarget ? `afterimage:${movieKey(afterimageTarget.film.title, afterimageTarget.film.year)}` : 'afterimage-closed'} target={afterimageTarget?.film ?? null} opener={afterimageTarget?.opener ?? null}
          existing={afterimageTarget ? findAfterimage(afterimages, afterimageTarget.film) : undefined}
          liked={afterimageTarget ? likedKeys.has(movieKey(afterimageTarget.film.title, afterimageTarget.film.year)) : false}
          saved={afterimageTarget ? savedKeys.has(movieKey(afterimageTarget.film.title, afterimageTarget.film.year)) : false} count={afterimages.length}
          onSave={saveAfterimage} onRemove={() => { if (afterimageTarget) forgetAfterimage(afterimageTarget.film); }} onClose={() => setAfterimageTarget(null)} />
        <FilmVerbs menu={verbMenu} onClose={closeVerbs} />
        {collidePick ? <CollidePicker film={collidePick.film} opener={collidePick.opener} groups={partnerGroups()} canSearch={connection === 'connected'}
          onClose={() => setCollidePick(null)} onChoose={partner => startCollision(collidePick.film, partner, collidePick.opener)} /> : null}
        <CollisionChamber state={collision.state} open={collision.open} opener={collisionOpener} metadata={metadataByKey}
          likedKeys={likedKeys} savedKeys={savedKeys} connected={connection === 'connected'}
          onClose={collision.close} onLike={film => toggleLike({ title: film.title, year: film.year })} onSave={film => toggleSave(film)}
          onRetry={() => { if (collision.state) { const [first, second] = collision.state.films; collision.clear(); startCollision(first, second, collisionOpener); } }}
          onExplore={(film, opener) => { collision.close(); openAtlas(film, opener, false, true); }}
          onCollideAgain={(film, opener) => { collision.clear(); setCollidePick({ film, opener }); }} />
        {eyeTest ? <EyeTest key={eyeTest.sitting} opener={eyeTest.opener} canLookUp={connection === 'connected'}
          onClose={() => setEyeTest(null)} onFinish={request => { setEyeTest(null); answerQuestion(request); }} /> : null}
        <AtlasWorkspace target={atlasTarget} opener={atlasOpener} onClose={closeAtlas} onBusy={setAtlasBusy} preferSaved={atlasResume}
          requestedMapId={atlasMapId} onTrailChange={rememberAtlasTrail} onMapChange={updateAtlasAddress} navigation={collectionMenu}
          connected={connection === 'connected'} metadataByKey={metadataByKey} likedKeys={likedKeys} onLike={toggleLike} savedKeys={savedKeys} onSave={toggleSave}
          onExplore={(film, opener, request) => openAtlas(film, opener, false, false, request)} onSearchExplore={(film, opener) => openAtlas(film, opener, false, true)} selectedFacets={selectedFacets} onBorrow={lightTableEnabled ? handleSelectFacet : undefined} lightTable={atlasTarget ? lightTable : null} />
      </div>
    </main>
  );
}
