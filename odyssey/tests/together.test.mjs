// Watching together: two skies, and the films each person would choose for reasons of their own.
import assert from 'node:assert/strict';
import test from 'node:test';

import { bondOf, decodeSky, encodeSky, pullField, skiesMeet, together } from '../src/engine/together.mjs';
import { gravity } from '../src/engine/voyage.mjs';
import { stemOf } from '../src/engine/bearing.mjs';
import { open } from './chart.mjs';

const { universe } = open();
const { films, traits } = universe;
const find = title => films.findIndex(film => film.t === title);
const sky = titles => titles.map(find).filter(star => star >= 0);
const mine = sky(['Heat', 'Alien', 'The Godfather', 'Seven']);
const theirs = sky(['Spirited Away', 'In the Mood for Love', 'My Neighbor Totoro', 'Lost in Translation']);

test('a sky pulls each film toward the film it loves that is nearest', () => {
  assert.equal(mine.length, 4);
  const field = pullField(universe, mine);
  for (let j = 0; j < universe.count; j += 1) {
    if (field.from[j] >= 0) assert.ok(mine.includes(field.from[j]));
    assert.ok(field.sim[j] <= 1.0001 && field.score[j] >= field.sim[j] - 1e-6);
  }
});

test('the films for both are near something each of them loves', () => {
  const watched = new Set([find('Ghost in the Shell')].filter(star => star >= 0));
  const both = together(universe, mine, theirs, { exclude: watched, k: 10 });
  assert.equal(both.length, 10);
  const stems = new Set([...mine, ...theirs].map(star => stemOf(films[star].t)));
  for (let n = 0; n < both.length; n += 1) {
    const entry = both[n];
    assert.ok(!mine.includes(entry.star) && !theirs.includes(entry.star) && !watched.has(entry.star));
    assert.ok(!stems.has(stemOf(films[entry.star].t)), `${films[entry.star].t} is a sequel or remake of a film loved`);
    assert.ok(mine.includes(entry.mine.from) && theirs.includes(entry.theirs.from));
    assert.ok(entry.mine.sim > 0.08 && entry.theirs.sim > 0.08, `${films[entry.star].t}: ${entry.mine.sim} and ${entry.theirs.sim}`);
    if (n) assert.ok(both[n - 1].score >= entry.score);
  }
  // Not simply what one sky pulls toward: most of them are outside either sky's own nearest.
  const alone = new Set([...gravity(universe, mine, { k: 10 }), ...gravity(universe, theirs, { k: 10 })].map(entry => entry.star));
  assert.ok(both.filter(entry => !alone.has(entry.star)).length >= 5);
  // The same two skies, whichever is whose.
  assert.deepEqual(together(universe, theirs, mine, { exclude: watched, k: 10 }).map(entry => entry.star), both.map(entry => entry.star));
  assert.deepEqual(together(universe, mine, [], {}), []);
});

test('what a film shares with a film loved is said by the telling things first', () => {
  const both = together(universe, mine, theirs, { k: 8 });
  for (const entry of both) {
    for (const side of [entry.mine, entry.theirs]) {
      const said = bondOf(universe, side.from, entry.star);
      assert.ok(said.length <= 2);
      for (const trait of said) assert.ok(!traits[trait].v, 'no hidden turn');
      if (said.length === 2 && traits[said[0]].k === 'decade') assert.equal(traits[said[1]].k, 'decade');
    }
  }
});

test('two skies meet closer under some lights than others, and a sky meets itself everywhere', () => {
  const lights = skiesMeet(universe, mine, theirs);
  assert.equal(lights.length, 6);
  assert.equal(lights[0].share, 1);
  for (let n = 1; n < lights.length; n += 1) assert.ok(lights[n - 1].closeness >= lights[n].closeness && lights[n].share >= 0 && lights[n].share <= 1);
  const self = skiesMeet(universe, mine, mine);
  for (const entry of self) {
    const apart = lights.find(other => other.light === entry.light);
    assert.ok(entry.closeness >= apart.closeness, `${entry.light}`);
  }
  assert.deepEqual(skiesMeet(universe, mine, []), []);
});

test('a sky can be sent as a line, and read back from a link', () => {
  const line = encodeSky(['heat-1995', 'alien-1979'], 'Sam ~ #friend--');
  assert.equal(line, 'sky-Sam friend~heat-1995~alien-1979');
  assert.deepEqual(decodeSky(line), { name: 'Sam friend', slugs: ['heat-1995', 'alien-1979'] });
  assert.deepEqual(decodeSky(`https://example.org/odyssey/#${encodeURIComponent(line)}`), { name: 'Sam friend', slugs: ['heat-1995', 'alien-1979'] });
  assert.deepEqual(decodeSky('sky~heat-1995'), { name: '', slugs: ['heat-1995'] });
  assert.equal(decodeSky('star-heat-1995'), null);
  assert.equal(decodeSky('sky~<script>'), null);
  assert.equal(decodeSky(''), null);
});
