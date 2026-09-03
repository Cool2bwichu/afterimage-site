export const LIGHT_TABLE_EXPERIENCE = 'light-table-v1' as const;

export const FACET_KEYS = [
  'whereItLives',
  'howItFeels',
  'howItLooks',
  'howItSpeaks',
] as const;

export type FacetKey = (typeof FACET_KEYS)[number];

export const FACET_META: Record<FacetKey, {
  label: string;
  compactLabel: string;
  icon: string;
  className: string;
}> = {
  whereItLives: {
    label: 'Where it lives',
    compactLabel: 'Lives',
    icon: '⌗',
    className: 'is-world',
  },
  howItFeels: {
    label: 'How it feels',
    compactLabel: 'Feels',
    icon: '≈',
    className: 'is-feeling',
  },
  howItLooks: {
    label: 'How it looks',
    compactLabel: 'Looks',
    icon: '◉',
    className: 'is-image',
  },
  howItSpeaks: {
    label: 'How it speaks',
    compactLabel: 'Speaks',
    icon: '〰',
    className: 'is-voice',
  },
};

export type CinematicFacet = {
  label: string;
  explanation: string;
  traits: string[];
};

export type FacetSource = {
  title: string;
  year: string;
};

export type SelectedFacet = CinematicFacet & {
  source: FacetSource;
};

export type SelectedFacets = Partial<Record<FacetKey, SelectedFacet>>;
export type FacetMap = Record<FacetKey, CinematicFacet>;

export type LightTableRecommendation = {
  title: string;
  year: string;
  timecode: string;
  reason: string;
  watchFor: string;
  facets: FacetMap;
};

export type LightTableReel = {
  status: 'complete';
  sourceFilms: string[];
  persona: string;
  insight: string;
  palette: [string, string, string, string, string];
  sensibilities: [string, string, string];
  spiritDirector: { name: string; reason: string };
  fingerprint: FacetMap;
  recommendations: [
    LightTableRecommendation,
    LightTableRecommendation,
    LightTableRecommendation,
    LightTableRecommendation,
    LightTableRecommendation,
  ];
};

export function selectedFacetIdentity(channel: FacetKey, facet: SelectedFacet) {
  return [
    channel,
    facet.source.title.trim().toLocaleLowerCase(),
    facet.source.year.trim(),
    facet.label.trim().toLocaleLowerCase(),
  ].join('|');
}

export function isSameSelectedFacet(
  channel: FacetKey,
  current: SelectedFacet | undefined,
  candidate: SelectedFacet,
) {
  return Boolean(
    current && selectedFacetIdentity(channel, current) === selectedFacetIdentity(channel, candidate),
  );
}

/**
 * V1 deliberately permits one selected quality per cinematic channel.
 * Selecting the active quality again clears the lane; selecting a different
 * quality in the same channel replaces it.
 */
export function selectFacet(
  selected: SelectedFacets,
  channel: FacetKey,
  facet: CinematicFacet,
  source: FacetSource,
): SelectedFacets {
  const candidate: SelectedFacet = {
    label: facet.label,
    explanation: facet.explanation,
    traits: [...facet.traits],
    source: { ...source },
  };
  const next = { ...selected };
  if (isSameSelectedFacet(channel, selected[channel], candidate)) {
    delete next[channel];
  } else {
    next[channel] = candidate;
  }
  return next;
}

export function removeFacet(selected: SelectedFacets, channel: FacetKey): SelectedFacets {
  if (!selected[channel]) return selected;
  const next = { ...selected };
  delete next[channel];
  return next;
}

export function selectionCount(selected: SelectedFacets) {
  return FACET_KEYS.reduce((count, key) => count + (selected[key] ? 1 : 0), 0);
}

export function searchBreadth(selected: SelectedFacets) {
  const count = selectionCount(selected);
  if (count === 0) return 'Open table';
  if (count === 1) return 'Wide search';
  if (count === 2) return 'Guided search';
  if (count === 3) return 'Guided search';
  return 'Precise blend';
}

export function buildInitialLightTablePayload({
  films,
  creativeBrief,
  excludedFilms = [],
}: {
  films: string[];
  creativeBrief: string;
  excludedFilms?: Array<{ title: string; year: string }>;
}) {
  return {
    films,
    creativeBrief,
    experience: LIGHT_TABLE_EXPERIENCE,
    ...(excludedFilms.length ? { excludedFilms } : {}),
  };
}

/**
 * A blend carries only the qualities the user placed on the Light Table.
 * Source titles are retained as provenance and exact exclusions by the bridge,
 * never as hidden whole-film prompts.
 */
export function buildBlendPayload({
  selectedFacets,
  excludedFilms = [],
}: {
  selectedFacets: SelectedFacets;
  excludedFilms?: Array<{ title: string; year: string }>;
}) {
  if (selectionCount(selectedFacets) === 0) {
    throw new Error('Select at least one quality before developing a blend.');
  }
  const sanitized: SelectedFacets = {};
  for (const channel of FACET_KEYS) {
    const selected = selectedFacets[channel];
    if (!selected) continue;
    sanitized[channel] = {
      label: selected.label,
      explanation: selected.explanation,
      traits: [...selected.traits],
      source: { ...selected.source },
    };
  }

  return {
    films: [],
    creativeBrief: '',
    experience: LIGHT_TABLE_EXPERIENCE,
    selectedFacets: sanitized,
    ...(excludedFilms.length
      ? { excludedFilms: excludedFilms.map((film) => ({ ...film })) }
      : {}),
  };
}
