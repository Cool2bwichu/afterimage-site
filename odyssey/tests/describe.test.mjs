// A film described in words: a mood, what happens, where. The chart reads the words
// into parts it knows and finds the films that carry the most of them.
import test from 'node:test';
import assert from 'node:assert/strict';

import { open, star } from './chart.mjs';
import { stem } from '../src/engine/search.mjs';

const { universe, search } = open();
const label = id => universe.traits[id].t;
const title = entry => universe.films[entry.star].t;

test('words meet their roots', () => {
  assert.equal(stem('thieves'), 'thief');
  assert.equal(stem('robberies'), 'robbery');
  assert.equal(stem('astronauts'), 'astronaut');
  assert.equal(stem('kiss'), 'kiss');
  assert.equal(stem('wandering'), 'wander');
});

test('a heist that goes wrong, and a thief in love, reads as three parts', () => {
  const found = search.describe('a film where a heist goes terribly wrong and halfway through the thief falls in love with a woman');
  const named = found.parts.map(part => part.traits.map(label));
  assert.equal(found.parts.length, 3, JSON.stringify(found.parts.map(part => part.words)));
  assert.ok(named[0].includes('a robbery'), named[0].join());
  assert.match(found.parts[0].words, /heist.*thief/, 'the heist and the thief are one part');
  assert.ok(named[1].includes('noir fatalism'));
  assert.ok(named[2].includes('a love affair'));
  // The films that carry all of it come first, and shine brightest.
  assert.ok(found.films.length >= 10);
  assert.equal(found.films[0].degree, 1);
  assert.equal(found.films[0].matched.length, 3);
  for (let n = 1; n < found.films.length; n += 1) assert.ok(found.films[n].degree <= found.films[n - 1].degree);
  const killing = star(universe, 'the-killing-1956', -1);
  if (killing >= 0) assert.ok(found.films.slice(0, 10).some(entry => entry.star === killing), found.films.slice(0, 10).map(title).join(', '));
});

test('a mood, a feeling and a place: a slow sad film about grief in Japan finds Tokyo Story', () => {
  const found = search.describe('a slow sad movie about grief set in Japan');
  assert.deepEqual(found.parts.map(part => part.words), ['slow', 'sad', 'grief', 'japan']);
  const tokyo = star(universe, 'tokyo-story-1953', -1);
  if (tokyo >= 0) assert.ok(found.films.slice(0, 5).some(entry => entry.star === tokyo), found.films.slice(0, 5).map(title).join(', '));
  assert.ok(found.films.slice(0, 5).every(entry => entry.matched.length === 4));
});

test('a part the chart keeps veiled is matched, never named', () => {
  const found = search.describe('a heist goes wrong');
  const wrong = found.parts.find(part => part.words === 'goes wrong');
  assert.ok(wrong);
  assert.ok(!universe.traits[wrong.traits[0]].v, 'the name shown for a part is never a veiled turn');
  assert.ok(wrong.traits.some(id => universe.traits[id].v), 'the veiled turns still count');
});

test('a word no trait answers to is looked for in what is written about the films', () => {
  const found = search.describe('a submarine under the sea');
  assert.ok(found.parts.some(part => part.words === 'submarine'));
  const word = search.describe('astronauts lost in space');
  assert.ok(word.parts.some(part => part.word === 'lost'));
  assert.ok(word.films.length);
});

test('a single word inside a longer label does not count: "drives" is not a predicate', () => {
  const found = search.describe('a lonely man drives around a city at night');
  for (const part of found.parts) for (const id of part.traits) assert.notEqual(universe.traits[id].k, 'predicate', label(id));
  const taxi = star(universe, 'taxi-driver-1976', -1);
  if (taxi >= 0) assert.ok(found.films.slice(0, 5).some(entry => entry.star === taxi));
});

test('decades however written, and nothing from nothing', () => {
  const found = search.describe('a funny 70s road trip');
  assert.ok(found.parts.some(part => part.traits.some(id => /1970s/.test(label(id)))), found.parts.map(part => part.words).join());
  assert.deepEqual(search.describe('').films, []);
  assert.deepEqual(search.describe('the and of a').films, []);
  assert.deepEqual(search.describe('xqzvt wibble').parts, []);
});

test('a description is quick enough to read as it is typed', () => {
  search.describe('warm up the indexes');
  const start = performance.now();
  for (const query of ['a heist goes wrong', 'a slow sad movie about grief set in japan', 'revenge western', 'something scary in a small town']) search.describe(query);
  assert.ok(performance.now() - start < 250, `${Math.round(performance.now() - start)} ms`);
});
