import assert from 'node:assert/strict';
import test from 'node:test';

import { DRAFT_SHAPES, createDraftReporter } from '../lib/drafts.mjs';
import { parsePartialJson } from '../lib/partial-json.mjs';

const answer = {
  status: 'complete', sourceFilms: ['Paris, Texas'], persona: 'Patient Longing', insight: 'Distance gives tenderness its "shape".',
  palette: ['#101820', '#2b3a42', '#c8a97e', '#e8dcc8', '#7a3b2e'],
  sensibilities: ['patient framing', 'soft restraint', 'quiet voices'],
  spiritDirector: { name: 'Wim Wenders', reason: 'His frames let distance carry emotion.' },
  recommendations: [['The Green Ray', '1986'], ['Café Lumière', '2003'], ['Past Lives', '2023']].map(([title, year], index) => ({
    title, year, timecode: `00:0${index}:12:00`, reason: `${title} keeps its people at a tender distance.`, watchFor: 'Watch the frame.\n',
  })),
  score: -12.5e3, done: true, nothing: null,
};

test('every prefix of a JSON answer reads without throwing, and the whole answer reads exactly', () => {
  const text = JSON.stringify(answer, null, 1);
  for (let end = 0; end <= text.length; end += 1) parsePartialJson(text.slice(0, end));
  assert.deepEqual(parsePartialJson(text), answer);
  assert.deepEqual(parsePartialJson(JSON.stringify(answer)), answer);
});

test('only finished strings, numbers and literals appear; open containers keep finished members', () => {
  assert.equal(parsePartialJson(''), undefined);
  assert.equal(parsePartialJson('Here it is: '), undefined);
  assert.deepEqual(parsePartialJson('{"persona":"Patient Lo'), {});
  assert.deepEqual(parsePartialJson('{"persona":"Patient Longing","insight":"Dist'), { persona: 'Patient Longing' });
  assert.deepEqual(parsePartialJson('{"palette":["#101820","#2b3a'), { palette: ['#101820'] });
  assert.deepEqual(parsePartialJson('{"score":12'), {}, 'a number may still have digits coming');
  assert.deepEqual(parsePartialJson('{"score":12,'), { score: 12 });
  assert.deepEqual(parsePartialJson('{"done":tr'), {});
  assert.deepEqual(parsePartialJson('{"films":[{"title":"Yi Yi","year":"20'), { films: [{ title: 'Yi Yi' }] });
  assert.deepEqual(parsePartialJson('{"quote":"say \\"hi\\"","next":"caf\\u00e9","cut":"\\u00'), { quote: 'say "hi"', next: 'café' });
  // A code fence or a sentence before the object is skipped, as in a chat answer.
  assert.deepEqual(parsePartialJson('```json\n{"persona":"A"'), { persona: 'A' });
  // Malformed text reads as nothing rather than throwing.
  assert.equal(parsePartialJson('{"a" 1}'), undefined);
  assert.equal(parsePartialJson('{"a":"\\q"}'), undefined);
});

test('a property named __proto__ stays an ordinary property', () => {
  const parsed = parsePartialJson('{"__proto__":{"polluted":true},"a":1}');
  assert.equal(Object.getPrototypeOf(parsed), Object.prototype);
  assert.equal(({}).polluted, undefined);
  assert.deepEqual(Object.keys(parsed), ['__proto__', 'a']);
});

test('a reel draft keeps finished, bounded display fields and films with a title and year', () => {
  const text = JSON.stringify(answer);
  const cut = text.indexOf('"Past Lives"') + '"Past Lives","year":"2023"'.length;
  const draft = DRAFT_SHAPES.reel(parsePartialJson(text.slice(0, cut)));
  assert.equal(draft.persona, 'Patient Longing');
  assert.equal(draft.insight, 'Distance gives tenderness its "shape".');
  assert.deepEqual(draft.palette, answer.palette);
  assert.equal(draft.spiritDirector, 'Wim Wenders');
  assert.deepEqual(draft.recommendations, [
    { title: 'The Green Ray', year: '1986', reason: 'The Green Ray keeps its people at a tender distance.' },
    { title: 'Café Lumière', year: '2003', reason: 'Café Lumière keeps its people at a tender distance.' },
    { title: 'Past Lives', year: '2023' },
  ]);
  // Nothing the site would not show: no timecodes, watch notes or source films.
  assert.equal(JSON.stringify(draft).includes('timecode'), false);
  assert.equal('sourceFilms' in draft, false);

  const unsafe = DRAFT_SHAPES.reel({ persona: 'x'.repeat(500), palette: ['red', '#12345', '#abcdef'], recommendations: [{ title: 'No year' }, { title: 'Bad', year: '19' }, 'text'] });
  assert.equal(unsafe.persona.length, 80);
  assert.deepEqual(unsafe.palette, ['#abcdef']);
  assert.equal(unsafe.recommendations, undefined);
});

test('the atlas, replacement and collision drafts keep their own finished films', () => {
  assert.deepEqual(DRAFT_SHAPES.atlas({ thesis: 'Restraint carries feeling.', neighbors: [{ title: 'Late Spring', year: '1949', label: 'Quiet echo', summary: 'not shown' }, { title: 'Half' }] }),
    { thesis: 'Restraint carries feeling.', neighbors: [{ title: 'Late Spring', year: '1949', label: 'Quiet echo' }] });
  assert.deepEqual(DRAFT_SHAPES.replacement({ recommendation: { title: 'Yi Yi', year: '2000' } }), { recommendation: { title: 'Yi Yi', year: '2000' } });
  assert.deepEqual(DRAFT_SHAPES.collision({ film: { title: 'Yi Yi', year: '2000', reason: 'Both families.' } }), { film: { title: 'Yi Yi', year: '2000', reason: 'Both families.' } });
  assert.deepEqual(DRAFT_SHAPES.reel(undefined), {});
});

test('the reporter parses at most once per interval, publishes changes only, and starts over on a second take', () => {
  const drafts = [];
  let clock = 0;
  const reporter = createDraftReporter({ kind: 'reel', onDraft: (draft) => drafts.push(draft), now: () => clock, intervalMs: 400 });
  const text = JSON.stringify(answer);
  reporter.partial(text.slice(0, text.indexOf('"insight"')));
  assert.deepEqual(drafts, [{ take: 1, persona: 'Patient Longing' }]);
  clock += 100;
  reporter.partial(text);
  assert.equal(drafts.length, 1, 'too soon to parse again');
  clock += 400;
  reporter.partial(text.slice(0, text.indexOf('"insight"') + 3));
  assert.equal(drafts.length, 1, 'nothing visible changed');
  clock += 400;
  reporter.partial(text);
  assert.equal(drafts.length, 2);
  assert.equal(drafts[1].recommendations.length, 3);

  reporter.retake();
  assert.deepEqual(drafts[2], { take: 2 });
  reporter.partial('{"persona":"Second Look"');
  assert.deepEqual(drafts[3], { take: 2, persona: 'Second Look' });

  assert.equal(createDraftReporter({ kind: 'reel' }), null, 'no listener, no reporter');
  assert.equal(createDraftReporter({ kind: 'unknown', onDraft() {} }), null);
  // A listener that throws never interrupts the answer.
  const quiet = createDraftReporter({ kind: 'reel', onDraft() { throw new Error('listener'); } });
  assert.doesNotThrow(() => quiet.partial('{"persona":"A"'));
});
