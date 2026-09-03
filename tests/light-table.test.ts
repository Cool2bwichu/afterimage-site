import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FACET_KEYS,
  LIGHT_TABLE_EXPERIENCE,
  buildBlendPayload,
  buildInitialLightTablePayload,
  searchBreadth,
  selectFacet,
  selectionCount,
  type CinematicFacet,
  type SelectedFacets,
} from '../app/lib/light-table.ts';
import {
  activeFacetKeys,
  hasCompleteLightTableExtension,
  parseFacetMap,
  parseSelectedFacets,
} from '../app/lib/light-table-parse.ts';

const source = { title: 'Columbus', year: '2017' };
const look: CinematicFacet = {
  label: 'Geometric stillness',
  explanation: 'Balanced frames place people inside architecture.',
  traits: ['static composition', 'negative space'],
};
const otherLook: CinematicFacet = {
  label: 'Neon drift',
  explanation: 'Colored light loosens the present into memory.',
  traits: ['neon', 'shallow focus'],
};

function map(seed = '') {
  return Object.fromEntries(FACET_KEYS.map((key) => [key, {
    label: `${seed}${key}`,
    explanation: `A concrete explanation for ${key}.`,
    traits: [key.toLocaleLowerCase()],
  }])) as Record<(typeof FACET_KEYS)[number], CinematicFacet>;
}

test('selects one facet per channel, replaces it, and toggles the active one off', () => {
  let selected: SelectedFacets = {};
  selected = selectFacet(selected, 'howItLooks', look, source);
  assert.equal(selected.howItLooks?.label, 'Geometric stillness');

  selected = selectFacet(selected, 'howItLooks', otherLook, { title: 'Millennium Mambo', year: '2001' });
  assert.equal(selected.howItLooks?.label, 'Neon drift');
  assert.equal(selectionCount(selected), 1);

  selected = selectFacet(selected, 'howItLooks', otherLook, { title: 'Millennium Mambo', year: '2001' });
  assert.deepEqual(selected, {});
});

test('describes search breadth without presenting false confidence', () => {
  let selected: SelectedFacets = {};
  assert.equal(searchBreadth(selected), 'Open table');
  selected = selectFacet(selected, 'howItLooks', look, source);
  assert.equal(searchBreadth(selected), 'Wide search');
  selected = selectFacet(selected, 'howItFeels', { ...look, label: 'Patient ache' }, source);
  assert.equal(searchBreadth(selected), 'Guided search');
  selected = selectFacet(selected, 'howItSpeaks', { ...look, label: 'Hushed exchanges' }, source);
  assert.equal(searchBreadth(selected), 'Guided search');
  selected = selectFacet(selected, 'whereItLives', { ...look, label: 'Architectural chamber drama' }, source);
  assert.equal(searchBreadth(selected), 'Precise blend');
});

test('builds the initial request in Light Table mode', () => {
  assert.deepEqual(buildInitialLightTablePayload({
    films: ['Paris, Texas'],
    creativeBrief: 'Longing and distance.',
  }), {
    films: ['Paris, Texas'],
    creativeBrief: 'Longing and distance.',
    experience: LIGHT_TABLE_EXPERIENCE,
  });
});

test('builds a blend from selected qualities only', () => {
  const selected = selectFacet({}, 'howItLooks', look, source);
  assert.deepEqual(buildBlendPayload({ selectedFacets: selected }), {
    films: [],
    creativeBrief: '',
    experience: LIGHT_TABLE_EXPERIENCE,
    selectedFacets: selected,
  });
  assert.throws(() => buildBlendPayload({ selectedFacets: {} }), /select at least one quality/i);
});


test('copies facet data defensively and strips UI-only fields from blend requests', () => {
  const mutableFacet = {
    ...look,
    traits: [...look.traits],
    uiOnly: 'must not cross the bridge',
  } as CinematicFacet & { uiOnly: string };

  const selected = selectFacet({}, 'howItLooks', mutableFacet, source);
  mutableFacet.traits[0] = 'mutated after selection';

  assert.equal(selected.howItLooks?.traits[0], 'static composition');

  const payload = buildBlendPayload({ selectedFacets: selected });
  assert.deepEqual(payload.selectedFacets?.howItLooks, {
    label: look.label,
    explanation: look.explanation,
    traits: look.traits,
    source,
  });
  assert.equal(Object.hasOwn(payload.selectedFacets?.howItLooks ?? {}, 'uiOnly'), false);
  assert.notEqual(payload.selectedFacets?.howItLooks, selected.howItLooks);
});

test('parses complete facets and safely drops malformed persisted selections', () => {
  assert.deepEqual(parseFacetMap(map('x-')), map('x-'));
  assert.equal(parseFacetMap({ ...map(), howItLooks: null }), null);

  const parsed = parseSelectedFacets({
    howItLooks: { ...look, source },
    howItFeels: { ...look, source: { title: 'Bad year', year: '20x0' } },
  });
  assert.deepEqual(activeFacetKeys(parsed), ['howItLooks']);
});

test('recognizes a complete Light Table result without rejecting legacy reels', () => {
  const recommendations = Array.from({ length: 5 }, () => ({ facets: map() }));
  assert.equal(hasCompleteLightTableExtension({ fingerprint: map(), recommendations }), true);
  assert.equal(hasCompleteLightTableExtension({ recommendations }), false);
});
