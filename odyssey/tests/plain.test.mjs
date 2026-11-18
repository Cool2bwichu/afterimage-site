// The chart's own readings (what a star says before, or without, Claude), sequels kept
// behind films you would not find alone, and moods typed in everyday words.
import test from 'node:test';
import assert from 'node:assert/strict';

import { open, star } from './chart.mjs';
import { prism, gravity, sameSeries, seriesKey } from '../src/engine/voyage.mjs';
import { plainArrival, plainClaim, plainHook, plainWatch, kindOfFilm, safeToTell, traitWords } from '../src/engine/plain.mjs';

const { universe, search } = open();

test('every charted film reads as a sentence in the chart\'s words', () => {
  let short = 0;
  for (let i = 0; i < universe.base; i += 1) {
    const hook = plainHook(universe, i);
    assert.match(hook, /^[A-Z].*\.$/, `${universe.films[i].t}: "${hook}"`);
    assert.doesNotMatch(hook, /undefined|null|NaN|\s,|,,|\s\./, `${universe.films[i].t}: "${hook}"`);
    if (hook.length < 30) short += 1;
  }
  assert.ok(short < universe.base * 0.08, `${short} films say too little`);
});

test('a film\'s kind is taken from its encyclopedia entry, without its nationality', () => {
  assert.equal(kindOfFilm({ x: 'Heat is a 1995 American epic crime film written and directed by Michael Mann.' }), 'epic crime film');
  assert.equal(kindOfFilm({ x: 'The Good, the Bad and the Ugly is a 1966 Italian epic spaghetti Western film.' }), 'epic spaghetti Western');
  assert.equal(kindOfFilm({ x: 'Tokyo Story is a 1953 Japanese drama film directed by Yasujirō Ozu.' }), 'drama');
  assert.equal(kindOfFilm({ x: 'In the Mood for Love is a 2000 Hong Kong romantic drama film.' }), 'romantic drama');
  assert.equal(kindOfFilm({ x: 'Something is a 1950 Hong Kong film.' }), '');
  assert.equal(kindOfFilm({ x: '' }), '');
});

test('a famous star reads true: Heat is an epic crime film set in Los Angeles', () => {
  const heat = star(universe, 'heat-1995', 0);
  const hook = plainHook(universe, heat);
  assert.match(hook, /crime/);
  assert.match(hook, /Los Angeles/);
  assert.equal(plainHook(universe, heat), hook, 'the same star always reads the same way');
});

test('every ray says why it leads where it does, and where the two films part', () => {
  const heat = star(universe, 'heat-1995', 0);
  const rays = prism(universe, heat, {});
  const reading = plainArrival(universe, heat, rays);
  assert.equal(reading.plain, true);
  assert.equal(reading.rays.length, rays.length);
  for (const ray of reading.rays) {
    assert.match(ray.claim, /^[A-Z0-9].*\.$/, ray.claim);
    assert.doesNotMatch(ray.claim, /undefined|null|NaN/);
  }
  const hands = reading.rays.find(ray => ray.light === 'hands');
  if (hands) assert.match(hands.claim, /Michael Mann directed both/);
  // Across the chart, a ray with nothing to say is rare.
  let silent = 0;
  let total = 0;
  for (let i = 0; i < universe.base; i += 7) {
    for (const ray of prism(universe, i, {})) { total += 1; if (!plainClaim(universe, ray.light, i, ray.star)) silent += 1; }
  }
  assert.ok(silent / total < 0.01, `${silent} of ${total} rays say nothing`);
});

test('what to watch for never sounds as if it gives the story away', () => {
  assert.equal(safeToTell('the coffee-shop table between De Niro and Pacino'), true);
  assert.equal(safeToTell('the boy drowns under the ice'), false);
  assert.equal(safeToTell('Mary shot on the opera-house steps'), false);
  assert.equal(safeToTell('the last shot: he asks the priest to leave the door open'), false);
  assert.equal(safeToTell(''), false);
  for (let i = 0; i < universe.base; i += 1) {
    const watch = plainWatch(universe, i);
    if (watch) assert.ok(safeToTell(watch), watch);
  }
});

test('trait labels sit in a sentence', () => {
  assert.equal(traitWords({ k: 'opening', t: 'opens with an arrival', l: 0 }), 'an arrival at the start');
  assert.equal(traitWords({ k: 'role', t: 'anti hero', l: 0 }), 'an anti hero');
  assert.equal(traitWords({ k: 'role', t: 'lovers', l: 0 }), 'lovers');
  assert.equal(traitWords({ k: 'mood', t: 'sadness', l: 1 }), 'sad');
  assert.equal(traitWords({ k: 'movement', t: 'french new wave', s: 'French New Wave', l: 5 }), 'the French New Wave');
});

test('sequels are known by their titles', () => {
  assert.equal(seriesKey('The Godfather Part II'), 'godfather');
  assert.ok(sameSeries('The Godfather', 'The Godfather Part III'));
  assert.ok(sameSeries('Alien', 'Aliens'));
  assert.ok(sameSeries('Mad Max', 'Mad Max 2'));
  assert.ok(sameSeries('Toy Story', 'Toy Story 3'));
  assert.ok(sameSeries('Three Colours: Blue', 'Three Colours: Red'));
  assert.ok(!sameSeries('Heat', 'Heathers'));
  assert.ok(!sameSeries('It', 'It Follows'));
  assert.ok(!sameSeries('Paris, Texas', 'Paris Is Burning'));
});

test('love The Godfather and the chart offers more than its sequels first', () => {
  const godfather = star(universe, 'the-godfather-1972', -1);
  if (godfather < 0) return;
  const pulled = gravity(universe, [godfather], { k: 5 });
  assert.ok(pulled.length);
  assert.ok(!sameSeries(universe.films[godfather].t, universe.films[pulled[0].star].t), `first pulled: ${universe.films[pulled[0].star].t}`);
});

test('a mood typed in everyday words lights the chart\'s own word for it', () => {
  const said = query => search.traits(query).map(entry => universe.traits[entry.trait].t.toLowerCase());
  assert.ok(said('something funny').some(label => /comic|comedy/.test(label)), said('something funny').join(', '));
  assert.ok(said('a sad movie').some(label => /melanchol/.test(label)), said('a sad movie').join(', '));
  assert.ok(said("I'm in the mood for something romantic").some(label => /love/.test(label)), said("I'm in the mood for something romantic").join(', '));
});
