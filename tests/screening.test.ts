import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RUNTIME, INTERMISSION_MINUTES, SCREENING_KEY, addToProgramme, creditsRollAt, formatClock, formatCountdown, formatRuntime,
  hasKnownRuntimes, lightsDown, parseScreening, programmeMinutes, removeFromProgramme, ritual, screeningPhase, serializeScreening,
  skipAhead, startScreening, type ProgrammeFilm,
} from '../app/lib/screening.ts';
import { AFTERIMAGE_JOURNAL_KEY } from '../app/lib/afterimages.ts';

const columbus: ProgrammeFilm = { title: 'Columbus', year: '2017', runtime: 104, watchFor: 'How the buildings hold the people in them.', directors: ['Kogonada'], posterUrl: 'https://image.tmdb.org/t/p/w500/columbus.jpg' };
const yang: ProgrammeFilm = { title: 'After Yang', year: '2022', runtime: 96 };
const start = Date.parse('2026-10-05T20:00:00.000Z');
const minute = 60_000;

test('a screening is its own record, separate from the journal', () => {
  assert.notEqual(SCREENING_KEY, AFTERIMAGE_JOURNAL_KEY);
});

test('the credits roll after the running time, with an intermission in a double feature', () => {
  assert.equal(programmeMinutes([columbus]), 104);
  assert.equal(programmeMinutes([columbus, yang]), 104 + INTERMISSION_MINUTES + 96);
  assert.equal(creditsRollAt([columbus], start), start + 104 * minute);
  assert.equal(programmeMinutes([{ runtime: null }]), DEFAULT_RUNTIME, 'an unknown running time is assumed, and said to be');
  assert.equal(hasKnownRuntimes([columbus, { runtime: null }]), false);
});

test('the evening moves from the lobby to the film, the intermission and the credits', () => {
  const lobby = startScreening([columbus, yang]);
  assert.deepEqual(screeningPhase(lobby, start), { kind: 'lobby' });
  const dark = lightsDown(lobby, start);
  assert.deepEqual(screeningPhase(dark, start + 30 * minute), { kind: 'showing', index: 0, endsAt: start + 104 * minute });
  assert.deepEqual(screeningPhase(dark, start + 106 * minute), { kind: 'intermission', index: 0, endsAt: start + 114 * minute });
  assert.deepEqual(screeningPhase(dark, start + 150 * minute), { kind: 'showing', index: 1, endsAt: start + 210 * minute });
  assert.deepEqual(screeningPhase(dark, start + 211 * minute), { kind: 'credits', at: start + 210 * minute });
});

test('"the film\'s over" brings the next boundary to now', () => {
  const single = lightsDown(startScreening([columbus]), start);
  const ended = skipAhead(single, start + 50 * minute);
  assert.equal(screeningPhase(ended, start + 50 * minute).kind, 'credits');
  const double = lightsDown(startScreening([columbus, yang]), start);
  const firstOver = skipAhead(double, start + 50 * minute);
  assert.equal(screeningPhase(firstOver, start + 50 * minute).kind, 'intermission');
  const secondStarts = skipAhead(firstOver, start + 52 * minute);
  assert.deepEqual(screeningPhase(secondStarts, start + 52 * minute), { kind: 'showing', index: 1, endsAt: start + 148 * minute });
  assert.equal(skipAhead(startScreening([columbus]), start).lightsDownAt, undefined, 'nothing to skip in the lobby');
});

test('a double feature takes one more film, never the same one, and only before the lights go down', () => {
  const lobby = startScreening([columbus]);
  const double = addToProgramme(lobby, yang);
  assert.equal(double.films.length, 2);
  assert.equal(addToProgramme(double, { ...columbus }).films.length, 2);
  assert.equal(addToProgramme(lobby, { ...columbus, title: 'columbus' }).films.length, 1);
  assert.equal(addToProgramme(lightsDown(lobby, start), yang).films.length, 1);
  assert.equal(removeFromProgramme(double, 0).films[0].title, 'After Yang');
  assert.equal(removeFromProgramme(lobby, 0).films.length, 1, 'the last film stays');
});

test('a stored screening resumes tonight and is forgotten when stale or damaged', () => {
  const dark = lightsDown(startScreening([columbus]), start);
  assert.deepEqual(parseScreening(serializeScreening(dark), start + 60 * minute), dark);
  assert.equal(parseScreening(serializeScreening(dark), start + 30 * 60 * minute), null, 'a day later it is no longer tonight');
  assert.equal(parseScreening('{"version":1,"films":[]}', start), null);
  assert.equal(parseScreening('{"version":2,"films":[{"title":"Columbus","year":"2017"}]}', start), null);
  assert.equal(parseScreening('not json', start), null);
  assert.equal(parseScreening(JSON.stringify({ version: 1, films: [{ ...columbus, posterUrl: 'https://example.com/x.jpg' }] }), start)?.films[0].posterUrl, undefined, 'only catalogue images are kept');
  assert.equal(parseScreening(JSON.stringify({ version: 1, films: [columbus, yang, columbus] }), start), null, 'two films at most');
  assert.equal(parseScreening(JSON.stringify({ ...dark, lightsDownAt: '2027-01-01T00:00:00.000Z' }), start), null, 'not from the future');
});

test('the ritual sets the room for the hour and quotes only the reel\'s own watch-for line', () => {
  const night = ritual([columbus], 22);
  assert.deepEqual(night.map(step => step.label), ['The room', 'The sound', 'Your phone', 'Watch for']);
  assert.match(night[0].text, /Lamps off/);
  assert.equal(night[3].text, columbus.watchFor);
  assert.match(ritual([columbus], 14)[0].text, /curtains/);
  const double = ritual([columbus, yang], 20);
  assert.deepEqual(double.map(step => step.label), ['The room', 'The sound', 'Your phone', 'First, watch for', 'Intermission', 'Then, watch for']);
  assert.match(double[5].text, /Let it arrive/, 'no invented detail when the reel gave none');
});

test('times read like a cinema listing', () => {
  assert.equal(formatRuntime(45), '45 min');
  assert.equal(formatRuntime(96), '1 h 36 min');
  assert.equal(formatRuntime(124), '2 h 4 min');
  assert.equal(formatRuntime(120), '2 h');
  assert.equal(formatClock(Date.parse('2026-10-05T22:41:00.000Z'), 'en-US', 'UTC'), '10:41 pm');
  assert.equal(formatCountdown(65 * minute + 5000), '1:05:05');
  assert.equal(formatCountdown(9 * minute + 1), '9:01');
});
