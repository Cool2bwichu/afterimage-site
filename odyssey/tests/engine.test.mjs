// The arithmetic every step of a voyage rests on: likeness under each light,
// the six rays, gravity, the film between, the passage, and finding by name.
import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeArray, encodeArray } from '../src/engine/codec.mjs';
import { ALL_LIGHTS, LIGHT_IDS, lightById } from '../src/engine/lights.mjs';
import { fold, slugOf } from '../src/engine/search.mjs';
import { topK } from '../src/engine/similarity.mjs';
import { UNLIT } from '../src/engine/universe.mjs';
import {
  between, carriers, closestLight, constellationProgress, driftNext, gravity, neighbourhood, passage, prism, sharedTraits, taste, traitsOf,
} from '../src/engine/voyage.mjs';
import { bundle, open, star } from './chart.mjs';

const { universe, search } = open();
const MOOD = star(universe, 'in-the-mood-for-love-2000', 40);
const VERTIGO = star(universe, 'vertigo-1958', 80);
const SPIRITED = star(universe, 'spirited-away-2001', 120);
const close = (a, b) => Math.abs(a - b) < 1e-5;

test('typed arrays survive the journey through the bundle', () => {
  const floats = new Float32Array([0, 1.5, -2.25, 1e-3]);
  assert.deepEqual(Array.from(decodeArray(encodeArray(floats), 'f32')), Array.from(floats));
  const small = new Uint16Array([0, 1, 65535, 300]);
  assert.deepEqual(Array.from(decodeArray(encodeArray(small), 'u16')), Array.from(small));
  assert.throws(() => decodeArray('AAAA', 'f64'));
});

test('there are six lights, white, and Lookback, each with a colour and a question', () => {
  assert.deepEqual(LIGHT_IDS, ['story', 'feeling', 'image', 'idea', 'world', 'hands']);
  assert.deepEqual(ALL_LIGHTS.map(light => light.id), ['white', ...LIGHT_IDS, 'time'], 'keys 0 to 7, in order');
  for (const light of ALL_LIGHTS) assert.ok(light.name && light.asks && /^#[0-9a-f]{6}$/.test(light.color));
  assert.equal(lightById('nothing').id, 'white');
});

test('likeness is mutual, and a film is never its own neighbour', () => {
  for (const light of ['white', ...LIGHT_IDS]) {
    assert.ok(close(universe.model.sim(light, MOOD, VERTIGO), universe.model.sim(light, VERTIGO, MOOD)), `${light} is the same both ways`);
    const near = universe.model.neighbours(light, MOOD, 8);
    assert.ok(near.length <= 8);
    assert.ok(near.every(entry => entry.i !== MOOD));
    for (let n = 1; n < near.length; n += 1) assert.ok(near[n - 1].sim >= near[n].sim, 'nearest first');
    // What the list says of a neighbour is what the two films are to each other.
    if (near.length) assert.ok(close(near[0].sim, universe.model.sim(light, MOOD, near[0].i)));
  }
  assert.deepEqual(topK(new Float32Array([0.1, 0.9, 0, 0.5]), 2).map(entry => entry.i), [1, 3]);
  assert.deepEqual(topK(new Float32Array([0.1, 0.9, 0, 0.5]), 2, i => i !== 1).map(entry => entry.i), [3, 0]);
});

test('a neighbour comes with what the two films share, and nothing veiled is told', () => {
  const near = neighbourhood(universe, 'idea', MOOD, 6);
  assert.ok(near.length > 0);
  for (const entry of near) {
    assert.ok(entry.shared.length <= 3);
    for (const shared of entry.shared) {
      assert.equal(LIGHT_IDS[universe.traits[shared.trait].l], 'idea');
      assert.ok(!universe.traits[shared.trait].v);
      assert.ok(universe.model.index.idea.has(MOOD, shared.trait) && universe.model.index.idea.has(entry.star, shared.trait));
    }
  }
  const veiled = sharedTraits(universe, 'story', MOOD, near[0].star, 8, { veiled: true });
  const plain = sharedTraits(universe, 'story', MOOD, near[0].star, 8);
  assert.ok(veiled.length >= plain.length);
  assert.ok(LIGHT_IDS.includes(closestLight(universe, MOOD, VERTIGO).light));
});

test('one person who is several traits of two films is named once in what they share', () => {
  const mulholland = universe.indexOfSlug('mulholland-drive-2001');
  const highway = universe.indexOfSlug('lost-highway-1997');
  assert.ok(mulholland >= 0 && highway >= 0);
  const both = universe.model.index.hands.shared(mulholland, highway, 8).map(entry => universe.traits[entry.trait]);
  assert.ok(both.filter(trait => trait.s === 'David Lynch').length > 1, 'the chart holds Lynch as more than one trait of both');
  for (const light of ['hands', 'white']) {
    const words = sharedTraits(universe, light, mulholland, highway, 8).map(entry => (universe.traits[entry.trait].s || universe.traits[entry.trait].t).toLowerCase());
    assert.equal(new Set(words).size, words.length, `${light}: ${words.join(' · ')}`);
    assert.ok(words.includes('david lynch'));
  }
});

test('the six rays of a star end at different films, one for each light that has something to say', () => {
  for (const film of [MOOD, VERTIGO, SPIRITED]) {
    const rays = prism(universe, film);
    assert.ok(rays.length >= 4 && rays.length <= 6);
    assert.equal(new Set(rays.map(ray => ray.star)).size, rays.length, 'no film ends two rays');
    assert.ok(rays.every(ray => ray.star !== film));
    assert.deepEqual(rays.map(ray => ray.light), LIGHT_IDS.filter(light => rays.some(ray => ray.light === light)), 'in the order of the lights');
    for (const ray of rays) assert.ok(ray.sim > 0 && ray.others.every(other => other.star !== ray.star));
  }
  const without = prism(universe, MOOD, { exclude: new Set(prism(universe, MOOD).map(ray => ray.star)) });
  const first = new Set(prism(universe, MOOD).map(ray => ray.star));
  assert.ok(without.every(ray => !first.has(ray.star)), 'what is excluded is not offered again');
});

test('gravity pulls toward what is loved, and never returns the loved or the seen', () => {
  const seen = new Set([SPIRITED]);
  const pulled = gravity(universe, [MOOD, VERTIGO], { exclude: seen, k: 12 });
  assert.equal(pulled.length, 12);
  for (const entry of pulled) {
    assert.ok(entry.star !== MOOD && entry.star !== VERTIGO && !seen.has(entry.star));
    assert.ok(entry.pulls.length >= 1 && entry.pulls.length <= 2);
    assert.ok(entry.pulls.every(pull => pull.from === MOOD || pull.from === VERTIGO), 'a pull names the loved film it comes from');
  }
  for (let n = 1; n < pulled.length; n += 1) assert.ok(pulled[n - 1].score >= pulled[n].score);
  assert.deepEqual(gravity(universe, []), []);
  assert.deepEqual(gravity(universe, [-1, universe.count + 5]), []);
  // Leaning toward the little-seen changes the order, not the rule.
  const deeper = gravity(universe, [MOOD, VERTIGO], { k: 12, deeper: 1 });
  assert.ok(deeper.every(entry => entry.star !== MOOD && entry.star !== VERTIGO));
});

test('a taste is measured under each light, with the threads its films keep returning to', () => {
  const measured = taste(universe, [MOOD, VERTIGO, SPIRITED]);
  assert.equal(measured.lights.length, 6);
  assert.equal(measured.lights[0].share, 1, 'the strongest light is the measure of the rest');
  for (let n = 1; n < measured.lights.length; n += 1) assert.ok(measured.lights[n - 1].strength >= measured.lights[n].strength);
  for (const thread of measured.threads) {
    assert.ok(thread.films >= 2, 'a thread runs through at least two of the films');
    assert.ok(!universe.traits[thread.trait].v);
  }
});

test('the film between two films is near both and is neither', () => {
  const found = between(universe, MOOD, VERTIGO, 4);
  assert.equal(found.length, 4);
  for (const entry of found) {
    assert.ok(entry.star !== MOOD && entry.star !== VERTIGO);
    assert.ok(entry.a > 0 && entry.b > 0, 'it has something of each');
  }
  const again = between(universe, MOOD, VERTIGO, 4, new Set([found[0].star]));
  assert.ok(again.every(entry => entry.star !== found[0].star));
});

test('a passage leads from one film to the other by steps that each have a reason', () => {
  const road = passage(universe, MOOD, SPIRITED);
  assert.equal(road.stars[0], MOOD);
  assert.equal(road.stars.at(-1), SPIRITED);
  assert.equal(new Set(road.stars).size, road.stars.length, 'no star is passed twice');
  assert.equal(road.legs.length, road.stars.length - 1);
  road.legs.forEach((leg, n) => {
    assert.equal(leg.from, road.stars[n]);
    assert.equal(leg.to, road.stars[n + 1]);
    assert.ok(LIGHT_IDS.includes(leg.light));
  });
  assert.deepEqual(passage(universe, MOOD, MOOD), { stars: [MOOD], legs: [] });
});

test('a drift goes somewhere new, or stops', () => {
  const visited = new Set([MOOD]);
  let at = MOOD;
  for (let step = 0; step < 12; step += 1) {
    const next = driftNext(universe, at, visited, 'feeling');
    assert.ok(next && !visited.has(next.star));
    visited.add(next.star);
    at = next.star;
  }
  const everything = new Set(Array.from({ length: universe.count }, (unused, i) => i));
  assert.equal(driftNext(universe, MOOD, everything), null);
});

test('a star can say what it is made of, and a trait which films carry it', () => {
  const made = traitsOf(universe, MOOD, 5);
  assert.deepEqual(made.map(group => group.light), LIGHT_IDS);
  const some = made.find(group => group.traits.length);
  assert.ok(some);
  const { trait } = some.traits[0];
  assert.ok(carriers(universe, trait).includes(MOOD));
});

test('a constellation shows itself when three of its stars have been visited', () => {
  const figure = bundle.constellations[0];
  const none = constellationProgress(universe, new Set());
  assert.equal(none.length, bundle.constellations.length);
  assert.ok(none.every(entry => !entry.found && entry.seen === 0));
  const two = constellationProgress(universe, new Set(figure.stars.slice(0, 2)));
  assert.equal(two[0].seen, 2);
  assert.equal(two[0].found, false);
  const three = constellationProgress(universe, new Set(figure.stars.slice(0, 3)));
  assert.equal(three[0].found, true);
  assert.equal(three[0].total, figure.stars.length);
});

test('a title is folded the same way however it is typed', () => {
  assert.equal(fold('  Amélie '), 'amelie');
  assert.equal(fold('L’Avventura'), 'lavventura');
  assert.equal(fold("Singin' in the Rain"), 'singin in the rain');
  assert.equal(fold('8½'), '8');
  assert.equal(slugOf('Paris, Texas', 1984), 'paris-texas-1984');
  assert.equal(slugOf('Sátántangó', 1994), 'satantango-1994');
  assert.equal(slugOf('Vertigo'), 'vertigo');
});

test('a title in another script still gets an address of its own', () => {
  const one = slugOf('東京物語', 1953);
  const other = slugOf('七人の侍', 1954);
  assert.match(one, /^film-[a-z0-9]+-1953$/);
  assert.match(other, /^film-[a-z0-9]+-1954$/);
  assert.notEqual(one.replace(/-\d+$/, ''), other.replace(/-\d+$/, ''));
  assert.equal(slugOf('東京物語', 1953), one, 'and always the same one');
  assert.equal(search.exact('東京物語', 1953), -1, 'with nothing to compare, it is only ever matched by its slug');
});

test('a film is found by its title, its maker or its year', () => {
  const film = universe.films[VERTIGO];
  assert.equal(search.films(film.t)[0].star, VERTIGO);
  assert.equal(search.films(film.t.toUpperCase())[0].star, VERTIGO);
  assert.equal(search.films(`${film.t} ${film.y}`)[0].star, VERTIGO);
  const byMaker = search.films(film.d, 30).map(entry => entry.star);
  assert.ok(byMaker.includes(VERTIGO), 'a director\'s name finds their films');
  assert.ok(search.films(String(film.y), 200).every(entry => universe.films[entry.star].y === film.y));
  assert.deepEqual(search.films(''), []);
  assert.deepEqual(search.films('zzqx no such film'), []);
  assert.ok(search.films('the', 5).length === 5);
});

test('an exact title finds its star, with or without its article, and a year a year out', () => {
  const film = universe.films[VERTIGO];
  assert.equal(search.exact(film.t, film.y), VERTIGO);
  assert.equal(search.exact(film.t.toLowerCase(), film.y + 1), VERTIGO, 'sources disagree by a year about release dates');
  assert.equal(search.exact(film.t, film.y + 30), -1, 'another film of the same name is another film');
  assert.equal(search.exact(film.t), VERTIGO);
  const withArticle = universe.films.findIndex(entry => /^The [A-Z]/.test(entry.t));
  const bare = universe.films[withArticle].t.replace(/^The /, '');
  assert.ok(search.exact(bare, universe.films[withArticle].y) >= 0, 'a dropped article does not hide a film');
  assert.equal(search.exact('', 1999), -1);
});

test('a current is found by a word of its name', () => {
  const found = search.traits('dread');
  assert.ok(found.length > 0);
  for (const entry of found) {
    assert.ok(!universe.traits[entry.trait].v, 'a veiled trait is never offered');
    assert.ok(universe.traits[entry.trait].df >= 4);
  }
  assert.deepEqual(search.traits('he'), [], 'two letters are not a word');
});

test('finding forgives the way people type', () => {
  const first = query => universe.films[search.films(query, 1)[0]?.star]?.t;
  const titled = title => universe.films.findIndex(film => film.t === title);
  // Each case only where the chart holds the film, so a recompile does not break it.
  if (titled('8½') >= 0) assert.equal(first('8 1/2'), '8½', 'a fraction typed with a slash');
  if (titled('The Godfather Part II') >= 0) {
    assert.equal(first('godfather 2'), 'The Godfather Part II', 'a sequel by its number, either way it is written');
    assert.ok(search.answers(titled('The Godfather Part II'), 'godfather 2'));
  }
  if (titled('2001: A Space Odyssey') >= 0) assert.equal(first('2001'), '2001: A Space Odyssey', 'a year alone may be a title');
  if (titled('Blade Runner 2049') >= 0) assert.equal(first('blade runner 2049'), 'Blade Runner 2049');
  const film = universe.films[VERTIGO];
  assert.equal(first(film.t.toLowerCase().replace(/i/, '')), film.t, 'a slip of the keyboard');
  assert.ok(search.answers(VERTIGO, film.d.split(' ').pop()), 'a director answers for their films');
  assert.ok(!search.answers(VERTIGO, `${film.t} 1901`), 'a year that is not the film\'s does not');
  if (titled('Aliens') >= 0) assert.ok(!search.answers(titled('Aliens'), 'alien'), 'alien is not Aliens');
});

test('everyday words for kinds of film find the chart\'s own currents', () => {
  for (const word of ['western', 'heist', 'sci-fi', 'slasher', 'film noir', 'western films']) {
    const found = search.traits(word);
    assert.ok(found.length > 0 && found[0].score === 4, `${word} finds a current`);
    assert.ok(universe.traits[found[0].trait].df >= 4);
  }
});

test('nothing on the chart sits outside its sky', () => {
  // The unlit ring is the furthest anything charted goes: a guard for the camera's reach.
  for (const sky of ['white', 'story']) {
    let reach = 0;
    for (let i = 0; i < universe.base; i += 1) {
      if (universe.galaxyOf[sky][i] === UNLIT) continue;
      reach = Math.max(reach, Math.hypot(universe.positions[sky][i * 3], universe.positions[sky][i * 3 + 2]));
    }
    assert.ok(reach > 100 && reach < 5000);
  }
});
