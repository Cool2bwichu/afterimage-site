// Take a bearing: a few choices between two films everyone knows, and the sky turns toward tonight's film.
import assert from 'node:assert/strict';
import test from 'node:test';

import { BEARING_ROUNDS, bearingResult, createBearing, landmarksOf, leaning, poleWords, stemOf } from '../src/engine/bearing.mjs';
import { open } from './chart.mjs';

const { universe } = open();
const { films, model, traits } = universe;
const find = title => films.findIndex(film => film.t === title);

/** Plays a bearing as someone would who wants something like `target` tonight: always the nearer of the two. */
function play(target, seed, exclude = new Set([target])) {
  const sims = model.scores('white', target);
  const bearing = createBearing(universe, { seed, exclude });
  const pairs = [];
  while (!bearing.done) {
    const pair = bearing.pair();
    if (!pair) break;
    pairs.push(pair);
    bearing.choose(sims[pair.a] >= sims[pair.b] ? pair.a : pair.b);
  }
  return { bearing, pairs, sims };
}

test('landmarks are films everyone knows, with a face, and never one kept out of tonight', () => {
  const all = landmarksOf(universe);
  assert.ok(all.length > 300, `${all.length} landmarks`);
  for (const star of all) assert.ok(films[star].rn >= 3 && (films[star].p || films[star].pu));
  const veil = new Set(all.slice(0, 50));
  assert.ok(landmarksOf(universe, veil).every(star => !veil.has(star)));
});

test('each pair is two unlike films, each said in a few words the other does not share', () => {
  const { pairs } = play(find('Spirited Away'), 3);
  assert.equal(pairs.length, BEARING_ROUNDS);
  const shown = new Set();
  for (const pair of pairs) {
    assert.notEqual(pair.a, pair.b);
    assert.ok(model.scores('white', pair.a)[pair.b] <= 0.2, `${films[pair.a].t} and ${films[pair.b].t} are too alike`);
    assert.ok(!shown.has(pair.a) && !shown.has(pair.b), 'no film is shown twice');
    shown.add(pair.a); shown.add(pair.b);
    pair.words.forEach((words, side) => {
      assert.ok(words.length >= 1 && words.length <= 3, `${films[side ? pair.b : pair.a].t}: ${words.length} words`);
      for (const trait of words) assert.ok(!traits[trait].v, 'no hidden turn is said');
    });
    assert.deepEqual(poleWords(universe, pair.a, pair.b), pair.words[0]);
  }
});

test('a choice tilts the sky toward the film chosen and away from the one passed over', () => {
  const bearing = createBearing(universe, { seed: 9 });
  const { a, b } = bearing.pair();
  bearing.choose(a);
  const weight = bearing.weight;
  const near = model.scores('white', a);
  const far = model.scores('white', b);
  let toward = 0; let nToward = 0; let away = 0; let nAway = 0;
  for (let j = 0; j < universe.count; j += 1) {
    if (j === a || j === b) { assert.equal(weight[j], 0, 'the pair itself is not offered'); continue; }
    if (near[j] - far[j] > 0.15) { toward += weight[j]; nToward += 1; }
    if (far[j] - near[j] > 0.15) { away += weight[j]; nAway += 1; }
  }
  assert.ok(nToward && nAway);
  assert.ok(toward / nToward > 2 * (away / nAway), 'films like the chosen one weigh far more');
  assert.deepEqual(bearing.choices, [[a, b]]);
  bearing.undo();
  assert.equal(bearing.round, 0);
  assert.ok([...bearing.weight].every((w, j) => w === 1 || j === a || j === b));
});

test('six choices toward a film turn the sky toward films like it', () => {
  for (const [title, seed] of [['Spirited Away', 5], ['Heat', 6], ['Mulholland Drive', 7]]) {
    const target = find(title);
    const { bearing, sims } = play(target, seed);
    const top = bearing.lit(24);
    const mean = top.reduce((sum, star) => sum + sims[star], 0) / top.length;
    let all = 0;
    for (let j = 0; j < universe.count; j += 1) all += sims[j];
    assert.ok(mean > 2.5 * (all / universe.count), `${title}: ${mean.toFixed(3)} against ${(all / universe.count).toFixed(3)}`);
  }
});

test('a bearing offers three new films, each with the choices it answers', () => {
  const target = find('Spirited Away');
  const watched = new Set([find('My Neighbor Totoro'), find('Kiki’s Delivery Service'), find("Kiki's Delivery Service")].filter(star => star >= 0));
  const exclude = new Set([target, ...watched]);
  const { bearing } = play(target, 11, exclude);
  const result = bearingResult(universe, bearing.choices, { exclude, galaxyOf: universe.galaxyOf.white });
  assert.equal(result.picks.length, 3);
  assert.deepEqual(result.picks.map(pick => pick.as), ['best', 'aside', 'little']);
  assert.equal(new Set(result.picks.map(pick => pick.star)).size, 3);
  const chosen = new Set(bearing.choices.map(pair => pair[0]));
  const shown = new Set(bearing.choices.flat());
  const stems = new Set([...shown].map(star => stemOf(films[star].t)));
  for (const pick of result.picks) {
    assert.ok(!exclude.has(pick.star) && !shown.has(pick.star), `${films[pick.star].t} was shown or kept out`);
    assert.ok(!stems.has(stemOf(films[pick.star].t)), `${films[pick.star].t} is a sequel or remake of a film shown`);
    assert.ok(pick.near.length >= 1 && pick.near.every(star => chosen.has(star)), 'its reasons are films chosen');
    assert.ok(result.stars.includes(pick.star));
  }
  assert.ok((films[result.picks[2].star].rn ?? 0) <= 1, 'the third is one few have seen');
  assert.ok(result.stars.length >= 24);
  for (const star of result.stars) assert.ok(result.strength.get(star) > 0 && result.strength.get(star) <= 1);
  // The same choices always point the same way.
  assert.deepEqual(bearingResult(universe, bearing.choices, { exclude, galaxyOf: universe.galaxyOf.white }).picks, result.picks);
  assert.equal(bearingResult(universe, [], {}), null);
});

test('neither brings two other films, and nothing is learned from it', () => {
  const bearing = createBearing(universe, { seed: 4 });
  const first = bearing.pair();
  bearing.skip();
  const second = bearing.pair();
  assert.ok(![first.a, first.b].includes(second.a) && ![first.a, first.b].includes(second.b));
  assert.equal(bearing.round, 0);
  assert.ok(bearing.lit(5).length === 5);
  const before = leaning(universe, [], null);
  assert.ok(before.every(w => w === 1));
});

test('a sequel or a remake is known by its title', () => {
  assert.equal(stemOf('The Godfather Part II'), stemOf('The Godfather'));
  assert.equal(stemOf('Aliens'), stemOf('Alien'));
  assert.equal(stemOf('Blade Runner 2049'), stemOf('Blade Runner'));
  assert.equal(stemOf('Star Wars: Episode V – The Empire Strikes Back'), stemOf('Star Wars: Episode IV – A New Hope'));
  assert.notEqual(stemOf('The Thing'), stemOf('The Things We Lost'));
  assert.equal(stemOf('Les Misérables'), 'miserable');
});
