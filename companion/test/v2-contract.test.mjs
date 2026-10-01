import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AFTERIMAGE_SCHEMA_V2,
  normalizeV2Result,
  validateV2Input,
} from '../lib/v2-contract.mjs';

test('accepts description-only input', () => {
  assert.deepEqual(
    validateV2Input({ films: [], creativeBrief: 'Time passing through one life.' }),
    { films: [], creativeBrief: 'Time passing through one life.' },
  );
});

test('accepts one or two films without padding', () => {
  assert.deepEqual(validateV2Input({ films: ['After Yang'] }), {
    films: ['After Yang'],
    creativeBrief: '',
  });
  assert.deepEqual(validateV2Input({
    films: ['Paris, Texas', 'In the Mood for Love'],
    creativeBrief: 'Longing held in architecture.',
  }), {
    films: ['Paris, Texas', 'In the Mood for Love'],
    creativeBrief: 'Longing held in architecture.',
  });
});

test('accepts exactly twenty films', () => {
  const films = Array.from({ length: 20 }, (_, index) => 'Film ' + (index + 1));
  assert.deepEqual(validateV2Input({ films }), { films, creativeBrief: '' });
});

test('rejects an empty signal set', () => {
  assert.throws(
    () => validateV2Input({ films: [], creativeBrief: '   ' }),
    /add at least one film or describe what you are looking for/i,
  );
});

test('rejects duplicates and more than twenty films', () => {
  assert.throws(
    () => validateV2Input({ films: ['A.I.', 'a.i.'] }),
    /unique/i,
  );
  assert.throws(
    () => validateV2Input({ films: Array.from({ length: 21 }, (_, index) => 'Film ' + index) }),
    /at most 20/i,
  );
});

test('rejects oversized titles and briefs', () => {
  assert.throws(
    () => validateV2Input({ films: ['x'.repeat(161)] }),
    /too long/i,
  );
  assert.throws(
    () => validateV2Input({ films: [], creativeBrief: 'x'.repeat(1201) }),
    /too long/i,
  );
});

test('validates a bounded persistent not-interested list', () => {
  assert.deepEqual(validateV2Input({
    creativeBrief: 'Quiet longing.',
    excludedFilms: [{ title: '  After Yang  ', year: '2021' }],
  }), {
    films: [],
    creativeBrief: 'Quiet longing.',
    excludedFilms: [{ title: 'After Yang', year: '2021' }],
  });
  assert.throws(() => validateV2Input({
    creativeBrief: 'Quiet longing.',
    excludedFilms: [{ title: 'After Yang', year: '2021' }, { title: 'after yang', year: '2021' }],
  }), /excluded film.*unique/i);
});

test('V2 schema allows zero source films and requires watchFor', () => {
  assert.equal(AFTERIMAGE_SCHEMA_V2.properties.sourceFilms.minItems, 0);
  const item = AFTERIMAGE_SCHEMA_V2.properties.recommendations.items;
  assert.deepEqual(item.required, ['title', 'year', 'timecode', 'reason', 'watchFor']);
  assert.equal(Object.hasOwn(item.properties, 'pairsWith'), false);
});

function validV2Result() {
  return {
    status: 'complete',
    sourceFilms: [],
    persona: 'Tender Futurism',
    insight: 'A quiet life gathers meaning through attention to ordinary time.',
    palette: ['#0B0D14', '#E8B34A', '#4FD8E0', '#7A2738', '#D8D0C4'],
    sensibilities: ['patient wonder', 'domestic strangeness', 'chromatic memory'],
    spiritDirector: {
      name: 'Kogonada',
      reason: 'He finds emotional architecture in precise compositions and pauses.',
    },
    recommendations: [
      {
        title: 'After Yang',
        year: '2021',
        timecode: '00:00:21:08',
        reason: 'A family discovers the emotional density inside repeated daily gestures.',
        watchFor: '  Notice how small reframings turn memory into a physical space.  ',
      },
      {
        title: 'Columbus',
        year: '2017',
        timecode: '00:00:44:12',
        reason: 'Architecture becomes a quiet container for unrealized lives.',
        watchFor: 'Watch the pauses between movement and speech.',
      },
      {
        title: 'Perfect Days',
        year: '2023',
        timecode: '00:01:06:03',
        reason: 'Routine opens into a generous and tactile attention to passing time.',
        watchFor: 'Listen for the world arriving through small sounds.',
      },
      {
        title: 'Millennium Mambo',
        year: '2001',
        timecode: '00:01:37:18',
        reason: 'Neon drift makes recollection feel suspended between bodies and places.',
        watchFor: 'Track how voiceover detaches memory from the image.',
      },
      {
        title: 'The Green Ray',
        year: '1986',
        timecode: '00:02:11:22',
        reason: 'A solitary search turns hesitation into an unexpectedly vivid form of hope.',
        watchFor: 'Notice how weather externalizes indecision.',
      },
    ],
  };
}

test('normalizes a description-only V2 reel and trims watch notes', () => {
  const normalized = normalizeV2Result(validV2Result(), []);
  assert.deepEqual(normalized.sourceFilms, []);
  assert.equal(normalized.recommendations[0].watchFor, 'Notice how small reframings turn memory into a physical space.');
  assert.equal(Object.hasOwn(normalized.recommendations[0], 'pairsWith'), false);
});

test('rejects a V2 recommendation that is one of the source films', () => {
  const result = validV2Result();
  result.recommendations[0].title = 'Source Film';
  assert.throws(
    () => normalizeV2Result(result, ['Source Film']),
    /already in the source reel/i,
  );
});

test('rejects a recommendation saved as not interested', () => {
  const result = validV2Result();
  assert.throws(
    () => normalizeV2Result(result, [], [{ title: 'after yang', year: '2021' }]),
    /not interested/i,
  );
});

test('rejects duplicate V2 recommendations', () => {
  const result = validV2Result();
  result.recommendations[1].title = result.recommendations[0].title;
  assert.throws(
    () => normalizeV2Result(result, []),
    /recommended more than once/i,
  );
});

test('rejects a V2 recommendation list that is not exactly five items', () => {
  const result = validV2Result();
  result.recommendations = result.recommendations.slice(0, 4);
  assert.throws(
    () => normalizeV2Result(result, []),
    /exactly five recommendations/i,
  );
});

test('liked films survive validation separately from current intent and are hard seen-film exclusions', () => {
  const likedFilms = [{title:'After Yang',year:'2021'}];
  const input = validateV2Input({films:[],creativeBrief:'An energetic comedy.',likedFilms});
  assert.deepEqual(input.likedFilms, likedFilms);
  assert.deepEqual(input.films, []);
  assert.equal(input.creativeBrief, 'An energetic comedy.');
  assert.throws(() => normalizeV2Result(validV2Result(), [], [], {likedFilms}), /already seen/i);
  assert.throws(() => validateV2Input({films:[],likedFilms}), /at least one/i);
  assert.throws(() => validateV2Input({films:['Her'],likedFilms:[...likedFilms,...likedFilms]}), {code:'BAD_REQUEST'});
  assert.throws(() => validateV2Input({films:['Her'],likedFilms:[{title:'X',year:'bad'}]}), {code:'BAD_REQUEST'});
});
