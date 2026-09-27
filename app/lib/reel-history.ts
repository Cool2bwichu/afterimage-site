import { parseStoredState, getRecommendationIdentity, type ReelStateV2 } from './reel-state.ts';
import { movieKey } from './movie-metadata.ts';

export const REEL_HISTORY_KEY = 'afterimage:reels:v1';
export const MAX_SAVED_REELS = 20;
export type SavedReel = { id: string; savedAt: string; state: ReelStateV2 };

/** Keep result provenance separate from editable inputs; never restore a pending job. */
function snapshot(state: ReelStateV2): ReelStateV2 | null {
  if (!state.result) return null;
  const request = state.displayedInput;
  return parseStoredState(JSON.stringify({
    version: 4, result: state.result, experience: state.experience,
    films: state.films, creativeBrief: state.creativeBrief,
    displayedInput: request ?? null, displayedReelIdentity: getRecommendationIdentity(state.result),
    metadataByKey: state.metadataByKey, excludedFilms: state.excludedFilms,
    selectedFacets: state.selectedFacets, selectedReelIdentity: state.selectedReelIdentity,
    blendDraft: { version: 1, facets: state.selectedFacets ?? {} },
    selectedFilmKey: movieKey(state.result.recommendations[state.screeningIndex ?? 0]?.title ?? '', state.result.recommendations[state.screeningIndex ?? 0]?.year ?? ''),
  }));
}

function signature(state: ReelStateV2) {
  return JSON.stringify([state.result, state.displayedInput ?? null, state.experience ?? null]);
}

export function parseReelHistory(raw: string | null): SavedReel[] {
  try {
    const value = JSON.parse(raw || 'null');
    if (value?.version !== 1 || !Array.isArray(value.reels)) return [];
    const seen = new Set<string>();
    return value.reels.slice(-MAX_SAVED_REELS).flatMap((item: unknown) => {
      if (!item || typeof item !== 'object') return [];
      const { id, savedAt, state: rawState } = item as Record<string, unknown>;
      if (typeof id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(id) || seen.has(id) || typeof savedAt !== 'string' || !Number.isFinite(Date.parse(savedAt))) return [];
      const parsed = parseStoredState(JSON.stringify(rawState));
      if (!parsed.result || parsed.activeJobId) return [];
      const state = snapshot(parsed);
      if (!state?.result) return [];
      seen.add(id);
      return [{ id, savedAt, state }];
    });
  } catch { return []; }
}

export function rememberReel(history: SavedReel[], current: ReelStateV2, id: string, savedAt: string): SavedReel[] {
  if (current.activeJobId) return history;
  const state = snapshot(current);
  if (!state?.result) return history;
  const existing = history.find(item => signature(item.state) === signature(state));
  if (existing) {
    if (JSON.stringify(existing.state) === JSON.stringify(state)) return history;
    return history.map(item => item.id === existing.id ? { ...item, state } : item);
  }
  return [...history, { id, savedAt, state }].slice(-MAX_SAVED_REELS);
}

export function serializeReelHistory(reels: SavedReel[]): string {
  return JSON.stringify({ version: 1, reels: reels.map(reel => {
    const film = reel.state.result?.recommendations[reel.state.screeningIndex ?? 0];
    return { ...reel, state: { ...reel.state, selectedFilmKey: film ? movieKey(film.title, film.year) : undefined, blendDraft: { version: 1, facets: reel.state.selectedFacets ?? {} } } };
  }) });
}

export function reelCaption(reel: SavedReel): string {
  return reel.state.displayedInput?.creativeBrief || reel.state.result?.sourceFilms.join(' + ') || Object.values(reel.state.displayedInput?.selectedFacets ?? {}).map(facet => facet.label).join(' · ') || 'A blend of selected qualities';
}
