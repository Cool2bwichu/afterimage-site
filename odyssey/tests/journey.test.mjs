// The shape of a voyage and the order of a list: which films carry a set most
// truly, which your loved films pull, the trail through a set, the doors out of
// a star, how far a voyage has come from home, and a star's six rings.
import assert from 'node:assert/strict';
import test from 'node:test';

import { LIGHT_IDS } from '../src/engine/lights.mjs';
import { doors, holdsArm, homeLikeness, pullOf, rankSet, rings, routeOf, trail, typicality } from '../src/engine/journey.mjs';
import { carriers } from '../src/engine/voyage.mjs';
import { open, star } from './chart.mjs';

const { universe } = open();
const MOOD = star(universe, 'in-the-mood-for-love-2000', 40);
const VERTIGO = star(universe, 'vertigo-1958', 80);
const SPIRITED = star(universe, 'spirited-away-2001', 120);
const sky = universe.galaxyOf.white;
const galaxyOf = i => sky[i];
const membersOf = g => universe.films.map((_, i) => i).filter(i => galaxyOf(i) === g);

test('the truest member of a galaxy is more like the rest of it than its least typical member', () => {
  const g = galaxyOf(MOOD);
  const members = membersOf(g);
  const typical = typicality(universe, members);
  assert.equal(typical.size, members.length);
  const ranked = rankSet(universe, members);
  assert.equal(ranked.length, members.length);
  assert.equal(ranked[0].strength, 1, 'strength is measured against the strongest');
  for (let n = 1; n < ranked.length; n += 1) assert.ok(ranked[n - 1].score >= ranked[n].score, 'strongest first');
  // Typicality is the mean likeness to the others: check one member by hand.
  const one = ranked[ranked.length - 1].star;
  const byHand = members.filter(i => i !== one).reduce((sum, i) => sum + universe.model.sim('white', one, i) - linkBonus(one, i), 0) / (members.length - 1);
  assert.ok(Math.abs(typical.get(one) - byHand) < 1e-4, `${typical.get(one)} is ${byHand}`);
});

// White-light likeness adds a bonus for a line drawn in the atlas; typicality reads the films' own traits only.
function linkBonus(a, b) {
  const plain = ['story', 'feeling', 'image', 'idea', 'world', 'hands'];
  const weights = universe.model.defaultWeights;
  let total = 0;
  let sum = 0;
  for (const light of plain) { total += weights[light]; sum += weights[light] * universe.model.index[light].sim(a, b); }
  return universe.model.sim('white', a, b) - sum / total;
}

test('a set can be ordered for you: the films your loved films pull hardest rise', () => {
  const g = galaxyOf(VERTIGO);
  const members = membersOf(g).filter(i => i !== VERTIGO);
  const plain = rankSet(universe, members);
  const yours = rankSet(universe, members, { loved: [VERTIGO], order: 'yours' });
  assert.equal(yours.length, plain.length);
  const pulls = pullOf(universe, members, [VERTIGO]);
  // The film Vertigo pulls hardest is near the top of "yours", whatever its place in "truest".
  const hardest = members.reduce((best, i) => (pulls.get(i).pull > pulls.get(best).pull ? i : best), members[0]);
  assert.ok(yours.findIndex(entry => entry.star === hardest) < 5);
  assert.ok(yours.every(entry => (entry.pull > 0 ? entry.from === VERTIGO : entry.from === -1)), 'each film pulled says which loved film pulls it');
  assert.ok(yours[0].pull > 0);
  // Without loved films, "yours" is simply the truest order.
  assert.deepEqual(rankSet(universe, members, { order: 'yours' }).map(entry => entry.star), plain.map(entry => entry.star));
});

test('the less familiar order leans away from the famous, and exclusions are left out', () => {
  const trait = universe.model.index.feeling.traits(MOOD, 3)[0].trait;
  const set = carriers(universe, trait);
  const truest = rankSet(universe, set, { light: 'feeling' });
  const unfamiliar = rankSet(universe, set, { light: 'feeling', order: 'unfamiliar' });
  const renownOf = list => list.slice(0, 10).reduce((sum, entry) => sum + (universe.films[entry.star].rn ?? 1), 0);
  assert.ok(renownOf(unfamiliar) <= renownOf(truest));
  const without = rankSet(universe, set, { light: 'feeling', exclude: new Set([truest[0].star]) });
  assert.ok(!without.some(entry => entry.star === truest[0].star));
  assert.deepEqual(rankSet(universe, []), []);
});

test('a trail walks a set from its truest film, never repeating one, each leg saying why', () => {
  const members = rankSet(universe, membersOf(galaxyOf(SPIRITED))).map(entry => entry.star);
  const stops = trail(universe, members, { length: 5 });
  assert.equal(stops.length, 5);
  assert.equal(stops[0].star, members[0]);
  assert.equal(stops[0].light, null);
  assert.equal(new Set(stops.map(stop => stop.star)).size, 5);
  for (const stop of stops.slice(1)) {
    assert.ok(LIGHT_IDS.includes(stop.light));
    assert.ok(members.slice(0, 30).includes(stop.star), 'a trail stays among the truest of the set');
  }
  assert.deepEqual(trail(universe, []), []);
  assert.equal(trail(universe, members, { start: members[3] })[0].star, members[3]);
});

test('home is the film a voyage set out from: wholly itself, and fading with distance', () => {
  assert.equal(homeLikeness(universe, MOOD, MOOD), 1);
  const nearest = universe.model.neighbours('white', MOOD, 1)[0].i;
  assert.equal(homeLikeness(universe, MOOD, nearest), 1);
  const far = homeLikeness(universe, MOOD, SPIRITED);
  assert.ok(far >= 0 && far < 0.6, `Spirited Away keeps ${far} of In the Mood for Love`);
});

test('the doors out of a star open under different lights, onto films not yet travelled', () => {
  const first = doors(universe, MOOD, { origin: MOOD });
  assert.equal(first.length, 3);
  assert.equal(new Set(first.map(door => door.light)).size, 3, 'each door opens under its own light');
  assert.equal(new Set(first.map(door => door.star)).size, 3, 'no film is behind two doors');
  for (const door of first) {
    assert.ok(door.star !== MOOD);
    assert.ok(door.sim > 0);
    assert.ok(door.home >= 0 && door.home <= 1);
    assert.ok(door.shared.length <= 2);
  }
  // A step on: the films already travelled are never offered again, and set-aside films never at all.
  const next = first[0].star;
  const hidden = new Set([universe.model.neighbours(first[1].light, next, 1)[0].i]);
  const second = doors(universe, next, { origin: MOOD, path: [MOOD, next], exclude: hidden, last: first[0].light });
  assert.ok(second.length >= 2);
  for (const door of second) {
    assert.ok(![MOOD, next].includes(door.star));
    assert.ok(!hidden.has(door.star));
  }
  assert.equal(doors(universe, MOOD, { origin: MOOD, k: 5 }).length, 5);
});

test('a star system has a ring under each light, strongest innermost unless one light leads, led by the film given', () => {
  const system = rings(universe, MOOD, { per: 3 });
  assert.equal(system.length, 6);
  assert.deepEqual([...system.map(ring => ring.light)].sort(), [...LIGHT_IDS].sort());
  for (let n = 1; n < system.length; n += 1) assert.ok(system[n - 1].sim >= system[n].sim);
  for (const ring of system) {
    assert.ok(ring.stars.length >= 1 && ring.stars.length <= 3);
    assert.ok(!ring.stars.includes(MOOD));
    assert.equal(new Set(ring.stars).size, ring.stars.length);
  }
  const led = rings(universe, MOOD, { first: new Map([['story', VERTIGO]]) });
  assert.equal(led.find(ring => ring.light === 'story').stars[0], VERTIGO);
  // Under one light, that light's ring is innermost and the rest keep their order.
  const weakest = system.at(-1).light;
  const lit = rings(universe, MOOD, { per: 3, lead: weakest });
  assert.deepEqual(lit.map(ring => ring.light), [weakest, ...system.slice(0, -1).map(ring => ring.light)]);
  assert.deepEqual(rings(universe, MOOD, { per: 3, lead: null }).map(ring => ring.light), system.map(ring => ring.light));
});

test('a film is said to be of its star system only when it carries a trait the system is named for', () => {
  const armOf = (sky, star) => universe.galaxies[sky][universe.galaxyOf[sky][star]]?.arms.find(arm => arm.arm === universe.armOf[sky][star]);
  const moods = armOf('white', MOOD);
  assert.ok(holdsArm(universe, MOOD, moods), moods.name);
  let held = 0;
  let not = 0;
  for (let i = 0; i < universe.base; i += 1) {
    const arm = armOf('white', i);
    if (!arm) continue;
    if (holdsArm(universe, i, arm)) held += 1; else not += 1;
  }
  assert.ok(held > 2 * not && not > 0, `${held} carry their system's name, ${not} do not`);
  assert.equal(holdsArm(universe, MOOD, null), false);
  assert.equal(holdsArm(universe, -1, moods), false);
});

test('a voyage read back from a link keeps its stars in order, joined by the light they are closest in', () => {
  const slugs = [MOOD, VERTIGO, SPIRITED].map(i => universe.films[i].s);
  const route = routeOf(universe, [...slugs, 'no-such-film-1900', slugs[1]]);
  assert.deepEqual(route.map(stop => stop.star), [MOOD, VERTIGO, SPIRITED]);
  assert.equal(route[0].light, null);
  assert.ok(route.slice(1).every(stop => LIGHT_IDS.includes(stop.light)));
});
