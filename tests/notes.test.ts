import assert from 'node:assert/strict';
import test from 'node:test';

import type { AfterimageEntry } from '../app/lib/afterimages.ts';
import type { HalfLifeBook } from '../app/lib/half-life.ts';
import type { FacetKey } from '../app/lib/light-table.ts';
import { movieKey } from '../app/lib/movie-metadata.ts';
import { paletteWarmth, viewerNotes, type NotesReel } from '../app/lib/notes.ts';
import type { AfterimageResultV2 } from '../app/lib/reel-state.ts';

const WARM = ['#2a1408', '#8a3b12', '#d9773f', '#e9c46a', '#f4e9cd'];
const COLD = ['#06101f', '#12305a', '#2a6f97', '#61a5c2', '#cfe8f3'];

function reel(id: string, day: number, options: { persona?: string; sensibilities?: string[]; director?: string; palette?: string[]; years?: string[]; borrowed?: FacetKey[] } = {}): NotesReel {
  const years = options.years ?? ['1990', '1991', '1992', '1993', '1994'];
  const result: AfterimageResultV2 = {
    status: 'complete', sourceFilms: [], persona: options.persona ?? `Reel ${id}`, insight: 'An insight.', palette: options.palette ?? WARM,
    sensibilities: options.sensibilities ?? ['quiet rooms', 'patient framing', 'soft light'], spiritDirector: { name: options.director ?? 'Yasujirō Ozu', reason: 'A reason.' },
    recommendations: years.map((year, index) => ({ title: `${id} film ${index}`, year, timecode: '00:00:00:00', reason: 'r', watchFor: 'w' })),
  };
  return { id, savedAt: `2026-10-${String(day).padStart(2, '0')}T10:00:00.000Z`, result, borrowed: options.borrowed };
}

function entry(title: string, year: string, day: number, stayed: FacetKey[], note = ''): AfterimageEntry {
  return { title, year, watchedOn: `2026-10-${String(day).padStart(2, '0')}`, stayed, note, loggedAt: `2026-10-${String(day).padStart(2, '0')}T22:00:00.000Z` };
}

const empty: HalfLifeBook = { version: 1, films: {} };

test('with nothing in the browser the notes say so and ask for nothing', () => {
  const notes = viewerNotes({ reels: [], liked: [], afterimages: [], book: empty });
  assert.deepEqual(notes.counts, { reels: 0, films: 0, watched: 0, liked: 0 });
  assert.match(notes.headline, /Nothing has been written yet/);
  assert.equal(notes.request, null);
  assert.equal(notes.stays.enough, false);
  assert.equal(notes.lines.length, 0);
});

test('a word has to come back in a second reel before it counts as returning', () => {
  const one = viewerNotes({ reels: [reel('a', 1)], liked: [], afterimages: [], book: empty });
  assert.equal(one.words.recurring, false);
  assert.match(one.words.reading, /no word has come back yet/);
  const two = viewerNotes({ reels: [reel('a', 1), reel('b', 2, { sensibilities: ['quiet streets', 'neon rain', 'restless cameras'] })], liked: [], afterimages: [], book: empty });
  assert.equal(two.words.recurring, true);
  assert.deepEqual(two.words.items.map(item => item.word), ['quiet']);
  assert.equal(two.words.items[0].reels, 2);
});

test('a word said five times in one reel still counts once', () => {
  const notes = viewerNotes({ reels: [reel('a', 1, { sensibilities: ['quiet quiet quiet', 'quiet', 'quiet'] }), reel('b', 2, { sensibilities: ['loud', 'fast', 'bright'] })], liked: [], afterimages: [], book: empty });
  assert.equal(notes.words.recurring, false);
});

test('what stays is not claimed until three films have something marked', () => {
  const two = viewerNotes({ reels: [], liked: [], afterimages: [entry('A', '2001', 1, ['howItFeels']), entry('B', '2002', 2, ['howItFeels'])], book: empty });
  assert.equal(two.stays.enough, false);
  assert.match(two.stays.reading, /needs 1 more film/);
  const three = viewerNotes({ reels: [], liked: [], afterimages: [entry('A', '2001', 1, ['howItFeels']), entry('B', '2002', 2, ['howItFeels']), entry('C', '2003', 3, ['howItLooks'])], book: empty });
  assert.equal(three.stays.enough, true);
  assert.match(three.stays.reading, /is how films feel: two of the three films/);
});

test('asking for one thing while another stays is named as the finding', () => {
  const afterimages = [entry('A', '2001', 1, ['howItFeels']), entry('B', '2002', 2, ['howItFeels']), entry('C', '2003', 3, ['howItFeels', 'howItLooks'])];
  const differs = viewerNotes({ reels: [reel('a', 1, { borrowed: ['howItLooks'] }), reel('b', 2, { borrowed: ['howItLooks'] })], liked: [], afterimages, book: empty });
  assert.match(differs.stays.reading, /^You ask for how films look\. What stays with you is how films feel\./);
  const agrees = viewerNotes({ reels: [reel('a', 1, { borrowed: ['howItFeels'] }), reel('b', 2, { borrowed: ['howItFeels'] })], liked: [], afterimages, book: empty });
  assert.match(agrees.stays.reading, /and that is what stays/);
});

test('a tie between qualities names no leader', () => {
  const notes = viewerNotes({ reels: [], liked: [], afterimages: [entry('A', '2001', 1, ['howItFeels']), entry('B', '2002', 2, ['howItLooks']), entry('C', '2003', 3, ['howItFeels', 'howItLooks'])], book: empty });
  assert.match(notes.stays.reading, /Nothing leads/);
});

test('palettes are read as warm or cold, and a drift needs four reels', () => {
  assert.ok(paletteWarmth(WARM) > 0.5);
  assert.ok(paletteWarmth(COLD) < -0.5);
  assert.equal(paletteWarmth(['#111111', '#888888', 'nonsense']), 0);
  const drifting = viewerNotes({ reels: [reel('a', 1, { palette: COLD }), reel('b', 2, { palette: COLD }), reel('c', 3, { palette: WARM }), reel('d', 4, { palette: WARM })], liked: [], afterimages: [], book: empty });
  assert.match(drifting.colour.reading, /getting warmer/);
  assert.deepEqual(drifting.colour.frames.map(frame => frame.id), ['a', 'b', 'c', 'd']);
  const short = viewerNotes({ reels: [reel('a', 1, { palette: COLD }), reel('c', 3, { palette: WARM })], liked: [], afterimages: [], book: empty });
  assert.doesNotMatch(short.colour.reading, /getting|steady/);
});

test('reels are read in the order they were developed, whatever order they arrive in', () => {
  const notes = viewerNotes({ reels: [reel('late', 20), reel('early', 2)], liked: [], afterimages: [], book: empty });
  assert.deepEqual(notes.colour.frames.map(frame => frame.id), ['early', 'late']);
});

test('a director named twice is the one in the room', () => {
  const notes = viewerNotes({ reels: [reel('a', 1, { director: 'Wim Wenders' }), reel('b', 2, { director: 'Claire Denis' }), reel('c', 3, { director: 'wim wenders' })], liked: [], afterimages: [], book: empty });
  assert.equal(notes.directors.items[0].name, 'Wim Wenders');
  assert.equal(notes.directors.items[0].reels.length, 2);
  assert.match(notes.directors.reading, /two of your three reels/);
});

test('half-life counts each film once by its latest answer', () => {
  const afterimages = [entry('Grew', '2001', 1, []), entry('Held', '2002', 2, []), entry('Faded', '2003', 3, []), entry('Unasked', '2004', 4, [])];
  const book: HalfLifeBook = { version: 1, films: {
    [movieKey('Grew', '2001')]: { readings: { day: { value: 'there', on: '2026-10-02' }, week: { value: 'stronger', on: '2026-10-08' } } },
    [movieKey('Held', '2002')]: { readings: { day: { value: 'there', on: '2026-10-03' } } },
    [movieKey('Faded', '2003')]: { readings: { day: { value: 'stronger', on: '2026-10-04' }, week: { value: 'gone', on: '2026-10-10' } } },
  } };
  const notes = viewerNotes({ reels: [], liked: [], afterimages, book });
  assert.deepEqual([notes.halfLife.stronger, notes.halfLife.there, notes.halfLife.gone], [['Grew'], 1, 1]);
  assert.match(notes.halfLife.reading, /Of 3 films you have been asked about, one grew stronger, one held and one faded\. Grew is still growing\./);
  assert.deepEqual(notes.request?.films, ['Grew (2001)']);
});

test('decades need five kept films, and only a clear leader is named', () => {
  const few = viewerNotes({ reels: [], liked: [{ title: 'A', year: '1975' }], afterimages: [], book: empty });
  assert.equal(few.decades.enough, false);
  assert.match(few.decades.reading, /You have one; Like or log 4 more films/);
  const liked = [['A', '1953'], ['B', '1974'], ['C', '1975'], ['D', '1979'], ['E', '2019']].map(([title, year]) => ({ title, year }));
  const notes = viewerNotes({ reels: [reel('a', 1, { years: ['2018', '2019', '2020', '2021', '2022'] })], liked, afterimages: [entry('B', '1974', 1, [])], book: empty });
  assert.equal(notes.decades.centre, 1975);
  assert.match(notes.decades.reading, /centre on 1975, and the 1970s hold more of them than any other decade\./);
  assert.match(notes.decades.reading, /kept nothing from: the 1960s/);
  assert.match(notes.decades.reading, /offered sit \d+ years later/);
  assert.equal(notes.decades.items.find(item => item.decade === 1970)?.kept, 3, 'a film both loved and logged is kept once');
  const tied = viewerNotes({ reels: [], liked: [['A', '1961'], ['B', '1962'], ['C', '1971'], ['D', '1972'], ['E', '1985']].map(([title, year]) => ({ title, year })), afterimages: [], book: empty });
  assert.doesNotMatch(tied.decades.reading, /more of them than any other/);
});

test('the reel of what stayed plays the viewer’s own lines in the order watched', () => {
  const notes = viewerNotes({ reels: [], liked: [], afterimages: [entry('Later', '2002', 9, [], 'the last shot'), entry('No line', '2003', 5, ['howItFeels']), entry('First', '2001', 2, ['howItLooks'], '  the red coat  ')], book: empty });
  assert.deepEqual(notes.lines.map(line => [line.title, line.note]), [['First', 'the red coat'], ['Later', 'the last shot']]);
});

test('the reel asked for from the notes carries their findings and fits the brief', () => {
  const afterimages = [entry('A', '2001', 1, ['howItFeels']), entry('B', '2002', 2, ['howItFeels']), entry('C', '2003', 3, ['howItFeels'])];
  const long = 'extraordinarily-long-word-'.repeat(3);
  const reels = Array.from({ length: 12 }, (_, index) => reel(`r${index}`, index + 1, { sensibilities: [`${long}alpha quiet`, `${long}beta patient`, `${long}gamma soft`], director: 'Wim Wenders' }));
  const notes = viewerNotes({ reels, liked: [], afterimages, book: empty });
  assert.ok(notes.request);
  assert.ok(notes.request.creativeBrief.length <= 1200);
  assert.match(notes.request.creativeBrief, /how films feel/);
  assert.match(notes.request.creativeBrief, /Wim Wenders/);
  assert.match(notes.headline, /keeps coming back\. What stays is how films feel\.$/);
});
