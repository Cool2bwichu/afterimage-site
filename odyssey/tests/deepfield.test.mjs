// The open universe: stars charted after the fact take their places among the
// films they are most like, and never move or change what was already there.
import assert from 'node:assert/strict';
import test from 'node:test';

import { LIGHT_IDS } from '../src/engine/lights.mjs';
import { SKIES, UNLIT } from '../src/engine/universe.mjs';
import { passage } from '../src/engine/voyage.mjs';
import { normaliseReading, plainReading, readingSlug, reviveReading, starFromReading } from '../brain/reading.mjs';
import { restoreStars, settleReadings } from '../brain/navigator.mjs';
import { open, star, written } from './chart.mjs';

/** A reading that borrows a charted film's own tags, so it has somewhere to belong. */
function readingLike(universe, vocabulary, film, title, year, extra = {}) {
  const tags = {};
  for (const light of Object.keys(vocabulary.lights)) {
    const offered = new Map(vocabulary.lights[light].map(entry => [entry.id, entry.label]));
    tags[light] = universe.model.index[light].traits(film, 12).map(entry => offered.get(entry.trait)).filter(Boolean).slice(0, 4);
  }
  return normaliseReading(written(title, year, { ...tags, ...extra }), vocabulary);
}

test('a star charted later lands among the films it is like, and the chart does not move', () => {
  const { universe, search, vocabulary } = open();
  const MOOD = star(universe, 'in-the-mood-for-love-2000', 40);
  const VERTIGO = star(universe, 'vertigo-1958', 80);
  const before = {
    count: universe.count,
    positions: Array.from(universe.positions.white.subarray(0, 300)),
    likeness: LIGHT_IDS.map(light => universe.model.sim(light, MOOD, VERTIGO)),
    white: universe.model.sim('white', MOOD, VERTIGO),
    near: universe.model.neighbours('white', MOOD, 5).map(entry => entry.i),
  };
  const grown = [];
  universe.onGrow(event => grown.push(event));

  const reading = readingLike(universe, vocabulary, MOOD, 'The Lamp of Saint Orrin', 1974);
  assert.ok(Object.values(reading.tags).some(list => list.length), 'the borrowed tags are words the Navigator is offered');
  const [entry] = settleReadings({ universe, search, vocabulary, readings: [reading], from: MOOD, source: 'deepfield' });

  assert.equal(entry.isNew, true);
  assert.equal(entry.star, before.count);
  assert.equal(universe.count, before.count + 1);
  assert.equal(universe.base, before.count, 'the chart itself is as large as it was');
  assert.equal(universe.isDeep(entry.star), true);
  assert.equal(universe.isDeep(MOOD), false);
  assert.deepEqual(grown, [{ added: [entry.star], count: before.count + 1 }]);

  // Nothing charted has moved, and charted films compare exactly as they did.
  assert.deepEqual(Array.from(universe.positions.white.subarray(0, 300)), before.positions);
  LIGHT_IDS.forEach((light, n) => assert.equal(universe.model.sim(light, MOOD, VERTIGO), before.likeness[n]));
  assert.equal(universe.model.sim('white', MOOD, VERTIGO), before.white);

  // It sits in a galaxy of white light, near the film it was sighted from and drawn to it.
  const home = universe.galaxyOf.white[entry.star];
  assert.notEqual(home, UNLIT);
  assert.ok(home < universe.galaxies.white.length);
  for (const sky of SKIES) for (let axis = 0; axis < 3; axis += 1) assert.ok(Number.isFinite(universe.positions[sky][entry.star * 3 + axis]));
  const near = universe.model.neighbours('white', entry.star, 5).map(found => found.i);
  assert.ok(near.includes(MOOD), 'the film it borrowed everything from is among its nearest');
  assert.ok(universe.model.neighbours('white', MOOD, 5).some(found => found.i === entry.star), 'and it is now among that film\'s nearest');

  // A found star is a star like any other: it can be searched for and travelled to.
  assert.equal(search.exact('the lamp of saint orrin', 1974), entry.star);
  assert.equal(universe.indexOfSlug('the-lamp-of-saint-orrin-1974'), entry.star);
  const road = passage(universe, entry.star, VERTIGO);
  assert.equal(road.stars[0], entry.star);
  assert.equal(road.stars.at(-1), VERTIGO);
});

test('a film the universe already holds resolves to its star, by address or by name', () => {
  const { universe, search, vocabulary } = open();
  const VERTIGO = star(universe, 'vertigo-1958', 80);
  const film = universe.films[VERTIGO];
  const size = universe.count;
  const settled = settleReadings({
    universe, search, vocabulary,
    readings: [
      normaliseReading(written(film.t, film.y), vocabulary),
      normaliseReading(written(film.t.toUpperCase(), film.y + 1), vocabulary), // a release date a year out
      normaliseReading(written('Nine Tides at Carrow', 1981), vocabulary),
      normaliseReading(written('Nine Tides at Carrow', 1981), vocabulary),
    ],
  });
  assert.deepEqual(settled.map(entry => entry.isNew), [false, false, true, true]);
  assert.equal(settled[0].star, VERTIGO);
  assert.equal(settled[1].star, VERTIGO);
  assert.equal(settled[2].star, settled[3].star, 'the same film named twice is one star');
  assert.equal(universe.count, size + 1);
});

test('a star with nothing to place it by waits on the outer ring', () => {
  const { universe, vocabulary } = open();
  const bare = normaliseReading({ title: 'Only A Name', year: 1971 }, vocabulary);
  const [index] = universe.addStars([{ film: { t: bare.title, y: bare.year, s: readingSlug(bare), hi: bare.hi, lo: bare.lo, deep: 1 }, rows: {} }]);
  for (const sky of SKIES) {
    assert.equal(universe.galaxyOf[sky][index], UNLIT);
    let reach = 0;
    for (let i = 0; i < universe.base; i += 1) {
      if (universe.galaxyOf[sky][i] !== UNLIT) reach = Math.max(reach, Math.hypot(universe.positions[sky][i * 3], universe.positions[sky][i * 3 + 2]));
    }
    assert.ok(Math.hypot(universe.positions[sky][index * 3], universe.positions[sky][index * 3 + 2]) > reach, `${sky}: beyond everything lit`);
  }
  // Asked for again, it is the same star.
  assert.deepEqual(universe.addStars([{ film: { t: bare.title, y: bare.year, s: readingSlug(bare) }, rows: {} }]), [index]);
});

test('two stars charted later can share a maker the chart never met', () => {
  const { universe, search, vocabulary } = open();
  const readings = [
    normaliseReading(written('The Lamp of Saint Orrin', 1974, { director: 'Odile Verran' }), vocabulary),
    normaliseReading(written('Nine Tides at Carrow', 1981, { director: 'Odile Verran' }), vocabulary),
    normaliseReading(written('A Glass Meridian', 1968, { director: 'Tomas Ardelean', country: 'Romania' }), vocabulary),
  ];
  const [lamp, tides, meridian] = settleReadings({ universe, search, vocabulary, readings }).map(entry => entry.star);
  const trait = universe.traitId('hands', 'directed by Odile Verran');
  assert.ok(trait >= universe.bundle.traits.length, 'a trait made for this visit');
  assert.ok(universe.model.index.hands.has(lamp, trait) && universe.model.index.hands.has(tides, trait));
  assert.equal(universe.model.neighbours('hands', lamp, 1)[0].i, tides, 'the same hands are the strongest bond there is');
  assert.ok(universe.model.sim('hands', lamp, tides) > universe.model.sim('hands', lamp, meridian));
  assert.equal(universe.ensureTrait({ light: 'hands', kind: 'director', label: 'directed by Odile Verran', short: 'Odile Verran' }), trait, 'asked for twice, a trait is made once');
});

test('a reading becomes a star record the sky and the dossier can use', () => {
  const { universe, vocabulary } = open();
  const MOOD = star(universe, 'in-the-mood-for-love-2000', 40);
  const reading = readingLike(universe, vocabulary, MOOD, 'Salt Hours', 1990, { country: 'USA', bw: true, known: 'partly', fame: 9 });
  const made = starFromReading(reading, universe, vocabulary, {
    from: MOOD, source: 'collision', extra: { pu: 'https://image.tmdb.org/t/p/w500/salt.jpg', im: 'tt0000003', rt: 91 },
  });
  assert.deepEqual(
    { t: made.film.t, y: made.film.y, s: made.film.s, d: made.film.d, c: made.film.c, kn: made.film.kn, rn: made.film.rn, deep: made.film.deep, by: made.film.by },
    { t: 'Salt Hours', y: 1990, s: 'salt-hours-1990', d: 'Odile Verran', c: ['United States'], kn: 1, rn: 4, deep: 1, by: 'collision' },
  );
  assert.equal(made.film.pu, 'https://image.tmdb.org/t/p/w500/salt.jpg');
  assert.equal(made.film.rt, 91);
  assert.equal(made.from, MOOD);
  assert.deepEqual(Object.keys(made.rows), LIGHT_IDS);
  for (const light of LIGHT_IDS) {
    for (const [trait, weight] of made.rows[light]) {
      assert.equal(LIGHT_IDS[universe.traits[trait].l], light, 'every trait sits under its own light');
      assert.ok(weight > 0 && weight <= 1.5);
    }
  }
  assert.ok(made.rows.image.some(([trait]) => universe.traits[trait].t === 'black and white'));
  assert.ok(made.rows.hands.some(([trait]) => universe.traits[trait].t === 'directed by Odile Verran'));
});

test('what was found on an earlier visit is put back in one step, in order, and checked again', () => {
  const first = open();
  const MOOD = star(first.universe, 'in-the-mood-for-love-2000', 40);
  const lamp = readingLike(first.universe, first.vocabulary, MOOD, 'The Lamp of Saint Orrin', 1974);
  const tides = normaliseReading(written('Nine Tides at Carrow', 1981), first.vocabulary);
  // What a browser or the companion keeps: plain readings, the origin by slug, the catalogue's facts.
  const kept = [
    { reading: plainReading(lamp), from: first.universe.films[MOOD].s, source: 'deepfield', extra: { rt: 97 } },
    { reading: plainReading(tides), from: 'the-lamp-of-saint-orrin-1974', source: 'deepfield' },
    { reading: plainReading(tides), from: '', source: 'chart' },
    { reading: plainReading(normaliseReading(written(first.universe.films[MOOD].t, first.universe.films[MOOD].y), first.vocabulary)), from: '', source: 'chart' },
  ];

  const { universe, search, vocabulary } = open();
  const entries = kept.map(entry => ({ ...entry, reading: reviveReading(JSON.parse(JSON.stringify(entry.reading)), vocabulary) }));
  assert.deepEqual(entries[0].reading, lamp, 'a reading survives being kept and brought back');
  const restored = restoreStars({ universe, search, vocabulary, entries });
  assert.deepEqual(restored.map(item => universe.films[item.star].s), ['the-lamp-of-saint-orrin-1974', 'nine-tides-at-carrow-1981'], 'a repeat and a charted film add nothing');
  const [lampStar, tidesStar] = restored.map(item => item.star);
  assert.equal(universe.films[lampStar].rt, 97);
  assert.equal(universe.films[tidesStar].by, 'deepfield');
  // The second was sighted from the first, which arrived in the same list: the two are drawn together.
  assert.ok(universe.model.linked[tidesStar].some(([other]) => other === lampStar));
  assert.ok(universe.model.linked[lampStar].some(([other]) => other === MOOD));
  assert.deepEqual(restoreStars({ universe, search, vocabulary, entries }), [], 'put back twice, nothing is added twice');
});

test('hundreds of stars from beyond the chart are placed in one step, quickly', () => {
  const { universe, search, vocabulary } = open();
  const readings = Array.from({ length: 400 }, (unused, n) => normaliseReading(written(`Invented Film Number ${n}`, 1950 + (n % 60), { director: `Maker ${n % 37}` }), vocabulary));
  const started = performance.now();
  const settled = settleReadings({ universe, search, vocabulary, readings });
  const took = performance.now() - started;
  assert.equal(settled.filter(entry => entry.isNew).length, 400);
  assert.equal(universe.count, universe.base + 400);
  assert.ok(took < 5000, `400 stars took ${Math.round(took)} ms`);
});
