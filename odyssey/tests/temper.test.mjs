// Temper: how a film treats you, in five readings, and a film bent along any one of them.
import assert from 'node:assert/strict';
import test from 'node:test';

import { TEMPERS, TEMPER_IDS, bend, bendsOf, temperOf, temperWord } from '../src/engine/temper.mjs';
import { open, star } from './chart.mjs';

const { universe } = open();
const { films } = universe;
const heat = star(universe, 'heat-1995', films.findIndex(film => film.ax && film.ax[1] >= 55 && (film.rn ?? 0) >= 3));

test('most films carry five readings, and the well known nearly all do', () => {
  const read = films.filter(film => temperOf(film));
  assert.ok(read.length > films.length * 0.6, `${read.length} of ${films.length}`);
  const known = films.filter(film => (film.rn ?? 0) >= 3);
  assert.ok(known.filter(film => temperOf(film)).length >= known.length * 0.95);
  assert.equal(temperOf({ t: 'Unread' }), null);
  assert.equal(temperOf({ ax: [-1, -1, -1, -1, -1] }), null, 'a film with no reading at all has no temper');
  assert.equal(TEMPER_IDS.join(), 'dread,cruelty,irony,ambiguity,fracture');
});

test('each reading is said in a word, from one pole to the other', () => {
  assert.equal(temperWord('dread', 0), 'at ease');
  assert.equal(temperWord('dread', 100), 'steeped in dread');
  assert.equal(temperWord('fracture', 5), 'told straight');
  assert.equal(temperWord('cruelty', 62), 'cruel');
  assert.equal(temperWord('irony', -1), '', 'an unread reading has no word');
  for (const temper of TEMPERS) assert.equal(temper.words.length, 5);
});

test('a film bent gentler keeps to the films most like it, each clearly less cruel', () => {
  const own = temperOf(films[heat]);
  const gentler = bend(universe, heat, 'cruelty', -1);
  assert.ok(gentler.length >= 6);
  const near = new Set(universe.model.neighbours('white', heat, 150).map(entry => entry.i));
  assert.ok(gentler.slice(0, 5).every(entry => near.has(entry.star)), 'the first few are among its nearest films');
  for (const entry of gentler) {
    assert.notEqual(entry.star, heat);
    assert.ok(films[entry.star].ax[1] <= own[1] - 15, `${films[entry.star].t} is clearly gentler`);
    assert.equal(entry.change, own[1] - entry.value);
  }
  for (let n = 1; n < gentler.length; n += 1) assert.ok(gentler[n - 1].score >= gentler[n].score, 'best first');
  const crueller = bend(universe, heat, 'cruelty', 1);
  for (const entry of crueller) assert.ok(entry.value >= own[1] + 15);
});

test('a bend never offers a film set aside, and cannot go past a pole', () => {
  const first = bend(universe, heat, 'cruelty', -1)[0].star;
  assert.ok(!bend(universe, heat, 'cruelty', -1, { exclude: new Set([first]) }).some(entry => entry.star === first));
  const extreme = films.findIndex(film => film.ax && film.ax[0] >= 95);
  if (extreme >= 0) assert.equal(bend(universe, extreme, 'dread', 1).length, 0, 'nothing has more dread than the most');
  assert.deepEqual(bend(universe, heat, 'nonsense', 1), []);
  assert.deepEqual(bend(universe, films.findIndex(film => !film.ax), 'dread', -1), []);
});

test('a star offers less of what it has much of, and more of what it has little of', () => {
  const own = temperOf(films[heat]);
  const offered = bendsOf(universe, heat);
  assert.ok(offered.length >= 3);
  for (const entry of offered) {
    const value = own[TEMPER_IDS.indexOf(entry.id)];
    if (entry.direction < 0) assert.ok(value >= 30, `less ${entry.id} offered at ${value}`);
    else assert.ok(value <= 70, `more ${entry.id} offered at ${value}`);
    assert.ok(entry.films.length >= 3);
    assert.ok(entry.label.length > 3);
  }
});
