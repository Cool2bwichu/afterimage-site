// What the compiled chart promises the site. A recompile that breaks one of
// these would break the sky, the dossier or the Navigator's prompts.
import assert from 'node:assert/strict';
import test from 'node:test';

import { LIGHT_IDS } from '../src/engine/lights.mjs';
import { SKIES, UNLIT } from '../src/engine/universe.mjs';
import { slugOf } from '../src/engine/search.mjs';
import { bundle, depth, open } from './chart.mjs';

const { universe } = open();
const count = bundle.films.length;

test('every film has a name, a year, two colours and an address of its own', () => {
  assert.ok(count > 2000, 'the chart holds a few thousand films');
  const slugs = new Set();
  for (const film of bundle.films) {
    assert.ok(film.t && typeof film.t === 'string');
    assert.ok(film.y >= 1888 && film.y <= 2100, `${film.t} has a year`);
    assert.match(film.hi, /^#[0-9a-f]{6}$/i);
    assert.match(film.lo, /^#[0-9a-f]{6}$/i);
    assert.match(film.s, /^[a-z0-9-]{1,180}$/, `${film.t} has a slug the companion accepts`);
    assert.ok(!slugs.has(film.s), `${film.s} is not shared`);
    slugs.add(film.s);
  }
  // Most slugs are simply the title and the year; the few that are not were made distinct on purpose.
  const plain = bundle.films.filter(film => film.s === slugOf(film.t, film.y)).length;
  assert.ok(plain > count * 0.97);
});

test('a poster is a path on Wikimedia, never an address somewhere else', () => {
  const withPoster = bundle.films.filter(film => film.p);
  assert.ok(withPoster.length > count * 0.9, 'nearly every charted film has a poster');
  for (const film of withPoster) {
    assert.match(film.p, /^(commons|en)\/[^?#]+\.(jpe?g|png|webp|gif|svg|tiff?)(\/[^?#]+)?$/i, film.p);
    assert.ok(!film.p.includes('//'));
  }
});

test('every sky places every film, in a galaxy or on the unlit ring', () => {
  for (const sky of SKIES) {
    const galaxies = bundle.galaxies[sky];
    assert.ok(galaxies.length >= 8 && galaxies.length <= 20, `${sky} has a sky's worth of galaxies`);
    const sizes = new Array(galaxies.length).fill(0);
    for (let i = 0; i < count; i += 1) {
      const g = universe.galaxyOf[sky][i];
      assert.ok(g === UNLIT || g < galaxies.length);
      if (g !== UNLIT) sizes[g] += 1;
      for (let axis = 0; axis < 3; axis += 1) assert.ok(Number.isFinite(universe.positions[sky][i * 3 + axis]));
    }
    galaxies.forEach((galaxy, g) => {
      assert.equal(galaxy.g, g);
      assert.equal(galaxy.size, sizes[g], `${sky}: ${galaxy.name} counts its own films`);
      assert.ok(galaxy.name && galaxy.thesis, 'a galaxy has a name and says what it is');
      assert.ok(galaxy.doors.length >= 3 && galaxy.doors.every(door => universe.galaxyOf[sky][door] === g), 'its ways in are its own films');
      assert.ok(galaxy.arms.length >= 1);
      assert.equal(galaxy.arms.reduce((sum, arm) => sum + arm.size, 0), galaxy.size, `${sky}: the arms of ${galaxy.name} hold all of it`);
      for (const arm of galaxy.arms) assert.ok(arm.name && arm.lead.every(lead => universe.armOf[sky][lead] === arm.arm));
    });
  }
  // White light leaves almost nothing unlit.
  const unlit = Array.from(universe.galaxyOf.white.subarray(0, count)).filter(g => g === UNLIT).length;
  assert.ok(unlit < count * 0.01);
});

test('galaxy names are not repeated within a sky', () => {
  for (const sky of SKIES) {
    const names = bundle.galaxies[sky].map(galaxy => galaxy.name);
    assert.equal(new Set(names).size, names.length, `${sky}: ${names.join(', ')}`);
  }
});

test('traits belong to a light, and the veiled ones are marked', () => {
  assert.ok(bundle.traits.length < 65535, 'a trait id fits in sixteen bits');
  for (const trait of bundle.traits) {
    assert.ok(trait.l >= 0 && trait.l < LIGHT_IDS.length);
    assert.ok(trait.t && trait.k);
  }
  assert.ok(bundle.traits.some(trait => trait.v), 'endings and fortunes are veiled');
});

test('a line drawn in the atlas joins two films of the chart and says why', () => {
  assert.ok(bundle.links.length > 500);
  for (const link of bundle.links) {
    assert.ok(link[0] < count && link[1] < count && link[0] !== link[1]);
    assert.ok(bundle.linkTypes[link[2]]);
    assert.ok(link[4] > 0 && link[4] <= 100);
  }
  assert.ok(bundle.links.filter(link => typeof link[6] === 'string' && link[6]).length > bundle.links.length * 0.9);
});

test('a constellation is a named figure of films that share two things', () => {
  assert.ok(bundle.constellations.length >= 40);
  const names = new Set();
  for (const figure of bundle.constellations) {
    assert.ok(figure.name);
    names.add(figure.name);
    assert.equal(figure.traits.length, 2);
    assert.ok(figure.stars.length >= 4 && figure.stars.length <= 12, `${figure.name} is small enough to find`);
    assert.equal(new Set(figure.stars).size, figure.stars.length);
    for (const film of figure.stars) {
      assert.ok(film < count);
      for (const trait of figure.traits) {
        const light = LIGHT_IDS[bundle.traits[trait].l];
        assert.ok(universe.model.index[light].has(film, trait), `${bundle.films[film].t} carries what ${figure.name} is made of`);
      }
    }
  }
  assert.equal(names.size, bundle.constellations.length, 'no two figures share a name');
});

test('the roads between stars lead to stars', () => {
  const { near, nearK } = universe;
  assert.equal(near.length, count * nearK);
  for (let i = 0; i < count; i += 1) {
    for (let k = 0; k < nearK; k += 1) {
      const j = near[i * nearK + k];
      assert.ok(j === 0xffff || (j < count && j !== i));
    }
  }
});

test('the deeper notes line up with the chart, film for film', () => {
  assert.equal(depth.films.length, count);
});
