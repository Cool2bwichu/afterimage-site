import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HALF_LIFE_KEY, askLater, checkInCalendar, checkpointFor, daysBetween, dueCheckIn, emptyBook, forgetFilm, growingFilms, halfLifeGlow,
  CHECKPOINTS, halfLifeReading, halfLifeSeries, latestReading, nextCheckpoint, parseHalfLife, recordReading, serializeHalfLife, stayedRequest, suggestsLike, trend,
} from '../app/lib/half-life.ts';
import { AFTERIMAGE_JOURNAL_KEY, type AfterimageEntry } from '../app/lib/afterimages.ts';
import { TASTE_STORAGE_KEY } from '../app/lib/taste-profile.ts';
import { movieKey } from '../app/lib/movie-metadata.ts';
import { canDevelop } from '../app/lib/reel-state.ts';

const entry = (title: string, year: string, watchedOn: string): AfterimageEntry => ({ title, year, watchedOn, stayed: [], note: '', loggedAt: `${watchedOn}T22:00:00.000Z` });
const columbus = entry('Columbus', '2017', '2026-09-01');
const yang = entry('After Yang', '2022', '2026-09-28');

test('half-life is its own private record, apart from the journal and from Likes', () => {
  assert.notEqual(HALF_LIFE_KEY, AFTERIMAGE_JOURNAL_KEY);
  assert.notEqual(HALF_LIFE_KEY, TASTE_STORAGE_KEY);
});

test('the check-ins come a day, a week, a month, a season and a year after the night', () => {
  assert.equal(daysBetween('2026-09-01', '2026-10-01'), 30);
  assert.equal(checkpointFor('2026-09-01', '2026-09-01'), null, 'never on the night itself');
  assert.equal(checkpointFor('2026-09-01', '2026-09-02')?.id, 'day');
  assert.equal(checkpointFor('2026-09-01', '2026-09-08')?.id, 'week');
  assert.equal(checkpointFor('2026-09-01', '2026-10-01')?.id, 'month');
  assert.equal(checkpointFor('2026-09-01', '2026-12-01')?.id, 'season');
  assert.equal(checkpointFor('2025-09-01', '2026-08-31')?.id, 'season', 'the season waits until the year comes round');
  assert.equal(checkpointFor('2025-09-01', '2026-09-01')?.id, 'year');
  assert.equal(checkpointFor('2025-09-01', '2026-10-20')?.id, 'year', 'the year’s question waits a little for you');
  assert.equal(checkpointFor('2025-06-01', '2026-10-01'), null, 'after the year it has settled');
  assert.equal(nextCheckpoint(CHECKPOINTS[0])?.id, 'week');
  assert.equal(nextCheckpoint(CHECKPOINTS[3])?.id, 'year');
  assert.equal(nextCheckpoint(CHECKPOINTS[4]), null, 'the year is the last time it asks');
});

test('only the latest checkpoint is asked, one film at a time, freshest first', () => {
  const book = emptyBook();
  const due = dueCheckIn([columbus, yang], book, '2026-10-05');
  assert.equal(due?.entry.title, 'After Yang', 'a week after After Yang beats a month after Columbus');
  assert.equal(due?.checkpoint.id, 'week');
  const answered = recordReading(book, yang, 'week', 'stronger', '2026-10-05');
  const next = dueCheckIn([columbus, yang], answered, '2026-10-05');
  assert.equal(next?.entry.title, 'Columbus');
  assert.equal(next?.checkpoint.id, 'month', 'the missed day and week are never asked late');
  const both = recordReading(answered, columbus, 'month', 'there', '2026-10-05');
  assert.equal(dueCheckIn([columbus, yang], both, '2026-10-05'), null);
  assert.equal(dueCheckIn([columbus], recordReading(emptyBook(), columbus, 'season', 'there', '2026-10-05'), '2026-10-05'), null, 'a later answer covers earlier checkpoints');
});

test('"ask me later" waits until tomorrow', () => {
  const later = askLater(emptyBook(), yang, '2026-10-05');
  assert.equal(dueCheckIn([yang], later, '2026-10-05'), null);
  assert.equal(dueCheckIn([yang], later, '2026-10-06')?.entry.title, 'After Yang');
});

test('the trend follows the last answers, and growing films burn brighter', () => {
  let book = recordReading(emptyBook(), columbus, 'day', 'there', '2026-09-02');
  assert.equal(trend(book.films[movieKey('Columbus', '2017')]), 'holding');
  book = recordReading(book, columbus, 'week', 'stronger', '2026-09-08');
  const film = book.films[movieKey('Columbus', '2017')];
  assert.equal(trend(film), 'growing');
  assert.equal(latestReading(film), 'stronger');
  assert.ok(halfLifeGlow(film) > 0.2);
  const faded = recordReading(book, columbus, 'month', 'gone', '2026-10-01').films[movieKey('Columbus', '2017')];
  assert.equal(trend(faded), 'fading');
  assert.ok(halfLifeGlow(faded) < 0);
  assert.equal(halfLifeGlow(undefined), 0);
});

test('films that grew become a reel request, and a Like is only ever suggested', () => {
  let book = recordReading(emptyBook(), columbus, 'month', 'stronger', '2026-10-01');
  book = recordReading(book, yang, 'week', 'stronger', '2026-10-05');
  const grown = growingFilms([columbus, yang], book);
  assert.deepEqual(grown.map(film => film.title), ['After Yang', 'Columbus']);
  const request = stayedRequest(grown);
  assert.deepEqual(request?.films, ['After Yang (2022)', 'Columbus (2017)']);
  assert.match(request!.creativeBrief, /staying power/);
  assert.ok(request!.creativeBrief.length <= 1200);
  assert.ok(canDevelop(request!.films, request!.creativeBrief));
  assert.equal(stayedRequest([]), null);
  assert.equal(suggestsLike(book.films[movieKey('Columbus', '2017')], false), true);
  assert.equal(suggestsLike(book.films[movieKey('Columbus', '2017')], true), false);
});

test('the book survives storage and drops what it does not recognise', () => {
  const book = recordReading(emptyBook(), columbus, 'week', 'stronger', '2026-09-08');
  assert.deepEqual(parseHalfLife(serializeHalfLife(book)), book);
  assert.deepEqual(parseHalfLife('nope'), emptyBook());
  assert.deepEqual(parseHalfLife(JSON.stringify({ version: 1, films: { 'columbus|2017': { readings: { week: { value: 'ecstatic', on: '2026-09-08' } } } } })).films['columbus|2017'].readings, {});
  assert.deepEqual(forgetFilm(book, columbus), emptyBook());
});

test('the check-ins can go in a calendar, with no server', () => {
  const ics = checkInCalendar(columbus, 'https://example.com/afterimage/', new Date('2026-09-01T23:00:00Z'));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.equal(ics.match(/BEGIN:VEVENT/g)?.length, CHECKPOINTS.length);
  assert.match(ics, /DTSTART;VALUE=DATE:20260902/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261201/);
  assert.match(ics, /DTSTART;VALUE=DATE:20270901/, 'and a year on');
  assert.match(ics, /SUMMARY:Is Columbus still with you\?/);
  assert.match(ics, /URL:https:\/\/example.com\/afterimage\//);
  assert.ok(checkInCalendar(entry('Me, Myself; and Irene', '2000', '2026-09-01'), 'x').includes('SUMMARY:Is Me\\, Myself\\; and Irene still with you?'), 'commas and semicolons are escaped');
});

test('the chart puts the film in question first, then the freshest answers, each with all its readings', () => {
  const whiplash = entry('Whiplash', '2014', '2026-06-01');
  const aftersun = entry('Aftersun', '2022', '2026-05-01');
  let book = recordReading(emptyBook(), whiplash, 'day', 'stronger', '2026-06-02');
  book = recordReading(book, whiplash, 'month', 'gone', '2026-07-01');
  book = recordReading(book, aftersun, 'season', 'stronger', '2026-08-01');
  book = recordReading(book, columbus, 'month', 'there', '2026-10-01');
  const series = halfLifeSeries([whiplash, aftersun, columbus, yang], book, columbus);
  assert.deepEqual(series.map(film => film.title), ['Columbus', 'Aftersun', 'Whiplash'], 'After Yang has no answers yet, so no line');
  assert.equal(series[0].focus, true);
  assert.deepEqual(series[2].readings.map(reading => reading.checkpoint.id), ['day', 'month']);
  assert.equal(halfLifeSeries([whiplash, aftersun, columbus], book, columbus, 2).length, 2);
});

test('each answer is read against the rest of the journal', () => {
  const whiplash = entry('Whiplash', '2014', '2026-06-01');
  const book = recordReading(recordReading(emptyBook(), whiplash, 'month', 'gone', '2026-07-01'), columbus, 'month', 'stronger', '2026-10-01');
  assert.equal(halfLifeReading('stronger', columbus, [whiplash, columbus], book), 'Columbus grew. Its star burns brighter in your sky now, while Whiplash faded.');
  assert.equal(halfLifeReading('gone', yang, [whiplash, columbus, yang], book), 'After Yang faded, like Whiplash. Most films do; the few that don’t are the ones worth knowing.');
  assert.match(halfLifeReading('there', yang, [yang], emptyBook()), /^After Yang is holding steady\. Its star keeps its light/);
});
