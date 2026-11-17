// Wormholes: a film far across the sky that is yet one of the nearest in what happens, how it feels, or what it is about.
import assert from 'node:assert/strict';
import test from 'node:test';

import { WORMHOLE_LIGHTS, wormholes } from '../src/engine/wormhole.mjs';
import { open } from './chart.mjs';

const { universe } = open();
const { films, model, traits, base } = universe;
const G = universe.galaxyOf.white;
const find = title => films.findIndex(film => film.t === title);

test('a wormhole leads to another galaxy, far down the white list, yet near under one light', () => {
  for (const title of ['The Godfather', 'Mulholland Drive', 'Memento', 'Spirited Away', 'Vertigo']) {
    const star = find(title);
    const found = wormholes(universe, star);
    assert.ok(found.length >= 1 && found.length <= 2, `${title}: ${found.length}`);
    const white = model.scores('white', star);
    for (const hole of found) {
      assert.ok(WORMHOLE_LIGHTS.includes(hole.light));
      assert.notEqual(G[hole.star], G[star], 'another galaxy');
      let rank = 0;
      for (let j = 0; j < base; j += 1) if (j !== star && white[j] > white[hole.star]) rank += 1;
      assert.equal(rank, hole.rank);
      assert.ok(rank >= 150, `${films[hole.star].t} is only #${rank + 1} in white`);
      const near = model.neighbours(hole.light, star, 15, j => j < base && j !== star).map(entry => entry.i);
      assert.ok(near.includes(hole.star), `${films[hole.star].t} is among the nearest under ${hole.light}`);
      assert.ok(hole.shared.length >= 2);
      let rare = 0;
      const words = [];
      for (const trait of hole.shared) {
        assert.ok(!traits[trait].v, 'no hidden turn');
        assert.ok(!['country', 'language', 'era', 'decade', 'axis', 'beat'].includes(traits[trait].k), `${traits[trait].t} says little`);
        rare += Math.log(base / traits[trait].df);
        words.push(...traits[trait].t.toLowerCase().split(/[^a-z]+/).filter(word => word.length >= 5));
      }
      assert.equal(new Set(words).size, words.length, `nothing said twice: ${hole.shared.map(trait => traits[trait].t).join(' · ')}`);
      assert.ok(rare >= 4, `rare enough to mean something: ${rare.toFixed(2)}`);
    }
  }
});

test('a wormhole never leads to a film set aside, and most well-known films have one', () => {
  const star = find('The Godfather');
  const first = wormholes(universe, star)[0].star;
  assert.ok(!wormholes(universe, star, { exclude: new Set([first]) }).some(hole => hole.star === first));
  let known = 0;
  let open2 = 0;
  for (let i = 0; i < base; i += 3) {
    if ((films[i].rn ?? 0) < 3) continue;
    known += 1;
    if (wormholes(universe, i, { k: 1 }).length) open2 += 1;
  }
  assert.ok(open2 >= known * 0.8, `${open2} of ${known}`);
  assert.deepEqual(wormholes(universe, -1), []);
});
