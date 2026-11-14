// Tonight's seeing: what tonight can hold, and the haze over every film that does not fit.
import assert from 'node:assert/strict';
import test from 'node:test';

import { CLEAR_SKY, cleanSeeing, describeSeeing, hazeOf, isClear, outside } from '../src/engine/seeing.mjs';
import { temperOf } from '../src/engine/temper.mjs';
import { open } from './chart.mjs';

const { universe } = open();
const { films } = universe;

test('a clear sky hides nothing, and an odd kept value clears rather than breaks', () => {
  assert.ok(isClear(CLEAR_SKY));
  assert.equal(hazeOf(universe, CLEAR_SKY).size, 0);
  assert.equal(describeSeeing(CLEAR_SKY), '');
  assert.deepEqual(cleanSeeing({ length: '45', language: 'klingon', tempers: { dread: 'lots', cruelty: 'low', nonsense: 'high' } }),
    { length: 'any', language: 'any', tempers: { cruelty: 'low' } });
  assert.deepEqual(cleanSeeing(null), { length: 'any', language: 'any', tempers: {} });
});

test('a night under two hours hazes every film that runs longer, and keeps the ones with no running time', () => {
  const seeing = cleanSeeing({ length: '120' });
  const haze = hazeOf(universe, seeing);
  films.forEach((film, star) => {
    if (film.rt > 120) assert.ok(haze.has(star), `${film.t} runs ${film.rt}`);
    else assert.ok(!haze.has(star), `${film.t} runs ${film.rt ?? 'an unknown time'}`);
  });
  const long = films.findIndex(film => film.rt > 170);
  assert.match(outside(universe, long, seeing)[0], /^it runs \d\u00a0h \d\d\u00a0min$/);
  assert.equal(describeSeeing(seeing), 'under 2 hours');
});

test('a gentle night hazes the cruel films and keeps those the atlas has no reading for', () => {
  const seeing = cleanSeeing({ tempers: { cruelty: 'low' } });
  const haze = hazeOf(universe, seeing);
  let unread = 0;
  films.forEach((film, star) => {
    const own = temperOf(film);
    if (!own || !(own[1] >= 0)) { unread += 1; assert.ok(!haze.has(star)); return; }
    assert.equal(haze.has(star), own[1] > 35, `${film.t} reads ${own[1]} for cruelty`);
  });
  assert.ok(unread > 0 && haze.size > 100 && haze.size < films.length - 100);
});

test('a night in English, and a night in another language, divide the films that say what they are spoken in', () => {
  const english = hazeOf(universe, cleanSeeing({ language: 'english' }));
  const other = hazeOf(universe, cleanSeeing({ language: 'other' }));
  for (const star of english) assert.ok(!other.has(star), `${films[star].t} cannot be outside both`);
  assert.ok(english.size > 300 && other.size > 300, `${english.size} and ${other.size}`);
  const tokyo = films.findIndex(film => film.t === 'Tokyo Story');
  if (tokyo >= 0) {
    assert.ok(english.has(tokyo));
    assert.deepEqual(outside(universe, tokyo, cleanSeeing({ language: 'english' })), ['it is not in English']);
  }
});

test('conditions add up, and say themselves in a few words', () => {
  const seeing = cleanSeeing({ length: '120', language: 'english', tempers: { cruelty: 'low', fracture: 'high' } });
  assert.equal(describeSeeing(seeing), 'under 2 hours · in English · gentle · broken up');
  const both = hazeOf(universe, seeing);
  for (const part of [{ length: '120' }, { language: 'english' }, { tempers: { cruelty: 'low' } }, { tempers: { fracture: 'high' } }]) {
    for (const star of hazeOf(universe, cleanSeeing(part))) assert.ok(both.has(star));
  }
});
