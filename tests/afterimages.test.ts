import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AFTERIMAGE_JOURNAL_KEY, MAX_AFTERIMAGES, findAfterimage, isWatchDate, journalOrder, localDate,
  parseAfterimages, removeAfterimage, serializeAfterimages, upsertAfterimage,
} from '../app/lib/afterimages.ts';
import { TASTE_STORAGE_KEY } from '../app/lib/taste-profile.ts';
import { WATCHLIST_KEY } from '../app/lib/library.ts';

const loggedAt = '2026-09-28T21:30:00.000Z';
const draft = { title: 'After Yang', year: '2021', watchedOn: '2026-09-27', stayed: ['howItLooks', 'howItFeels'] as const, labels: { howItLooks: 'Domestic futurism' }, note: '  The tea shop.  ' };

test('an afterimage keeps the night, the qualities that stayed and one private line', () => {
  const entries = upsertAfterimage([], draft, loggedAt);
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].stayed, ['howItFeels', 'howItLooks'], 'channels are stored in Light Table order');
  assert.equal(entries[0].note, 'The tea shop.');
  assert.equal(entries[0].loggedAt, loggedAt);
  assert.deepEqual(parseAfterimages(serializeAfterimages(entries), '2026-09-28'), entries);
  assert.ok(findAfterimage(entries, { title: 'after yang', year: '2021' }), 'identity ignores title case');
});

test('the journal is separate from Likes and the watchlist', () => {
  assert.notEqual(AFTERIMAGE_JOURNAL_KEY, TASTE_STORAGE_KEY);
  assert.notEqual(AFTERIMAGE_JOURNAL_KEY, WATCHLIST_KEY);
});

test('revising an afterimage replaces it in place and removal is exact', () => {
  let entries = upsertAfterimage([], draft, loggedAt);
  entries = upsertAfterimage(entries, { title: 'Columbus', year: '2017', watchedOn: '2026-09-20', stayed: [], note: '' }, loggedAt);
  entries = upsertAfterimage(entries, { ...draft, stayed: ['howItSpeaks'], note: 'The dance.' }, loggedAt);
  assert.deepEqual(entries.map(entry => entry.title), ['After Yang', 'Columbus']);
  assert.deepEqual(entries[0].stayed, ['howItSpeaks']);
  assert.deepEqual(removeAfterimage(entries, { title: 'AFTER YANG', year: '2021' }).map(entry => entry.title), ['Columbus']);
  assert.deepEqual(journalOrder(entries).map(entry => entry.title), ['After Yang', 'Columbus']);
});

test('future nights, impossible dates, long notes and unknown qualities are refused', () => {
  assert.throws(() => upsertAfterimage([], { ...draft, watchedOn: '2026-10-05' }, loggedAt), /already happened/);
  assert.throws(() => upsertAfterimage([], { ...draft, watchedOn: '2026-02-30' }, loggedAt));
  assert.throws(() => upsertAfterimage([], { ...draft, note: 'x'.repeat(281) }, loggedAt));
  assert.throws(() => upsertAfterimage([], { ...draft, stayed: ['howItTastes' as never] }, loggedAt));
  assert.equal(isWatchDate('2026-09-29', '2026-09-28'), true, 'a day of grace covers time zones ahead of the viewer');
  assert.equal(isWatchDate('1879-12-31', '2026-09-28'), false);
  assert.match(localDate(new Date(2026, 0, 5)), /^2026-01-05$/);
});

test('damaged, duplicate or oversized journals keep only their valid entries', () => {
  const valid = upsertAfterimage([], draft, loggedAt)[0];
  const raw = JSON.stringify({ version: 1, entries: [valid, { ...valid, title: 'after yang' }, { ...valid, title: '' }, { ...valid, title: 'Cure', year: '1997', stayed: ['howItFeels', 'howItFeels'] }, { ...valid, title: 'Cure', year: '1997', loggedAt: 'never' }, 'nonsense'] });
  assert.deepEqual(parseAfterimages(raw, '2026-09-28'), [valid]);
  assert.deepEqual(parseAfterimages('{broken'), []);
  assert.deepEqual(parseAfterimages(JSON.stringify([valid])), [], 'an unversioned array is not a journal');
  const full = Array.from({ length: MAX_AFTERIMAGES }, (_, index) => ({ ...valid, title: `Film ${index}` }));
  assert.throws(() => upsertAfterimage(full, { ...draft, title: 'One more' }, loggedAt), /500/);
});
