// Lookback: the sky of time is laid out from the white sky and the years, so
// these tests hold it to its promises: older is further out, a decade is a
// ring, a kind of film keeps one direction, and a line of sight runs one way.
import assert from 'node:assert/strict';
import test from 'node:test';

import { LIGHT_IDS } from '../src/engine/lights.mjs';
import { SKIES, UNLIT } from '../src/engine/universe.mjs';
import { INNER, TIME, heightAt, lineage, timeRings } from '../src/engine/time.mjs';
import { open, star } from './chart.mjs';

const { universe } = open();
const { films, base } = universe;
const P = universe.positions.time;
const radius = i => Math.hypot(P[i * 3], P[i * 3 + 2]);
const angle = i => Math.atan2(P[i * 3 + 2], P[i * 3]);
const TAU = Math.PI * 2;
const wrap = a => ((a % TAU) + TAU) % TAU;

test('Lookback is a sky like the others, as wide as they are', () => {
  assert.ok(SKIES.includes(TIME));
  let reach = 0;
  for (let i = 0; i < base; i += 1) {
    for (let axis = 0; axis < 3; axis += 1) assert.ok(Number.isFinite(P[i * 3 + axis]));
    if (universe.galaxyOf.time[i] !== UNLIT) reach = Math.max(reach, radius(i));
  }
  const white = universe.galaxyOf.white;
  let whiteReach = 0;
  for (let i = 0; i < base; i += 1) if (white[i] !== UNLIT) whiteReach = Math.max(whiteReach, Math.hypot(universe.positions.white[i * 3], universe.positions.white[i * 3 + 2]));
  assert.ok(reach > whiteReach * 0.8 && reach < whiteReach * 1.15, `framed like the other skies: ${Math.round(reach)} beside ${Math.round(whiteReach)}`);
});

test('the older the film, the further out it lies', () => {
  const byYear = [...Array(base).keys()].filter(i => films[i].y).sort((a, b) => films[a].y - films[b].y);
  for (let n = 1; n < byYear.length; n += 1) {
    const older = byYear[n - 1];
    const newer = byYear[n];
    if (films[newer].y - films[older].y >= 1) assert.ok(radius(older) > radius(newer), `${films[older].t} lies beyond ${films[newer].t}`);
  }
  for (let i = 0; i < base; i += 1) assert.ok(radius(i) >= INNER - 1, 'nothing lies inside the present');
  // The past sinks a little: the sky is a shallow bowl.
  assert.ok(heightAt(900) < heightAt(INNER));
});

test('the decades are rings, each holding its own years and nothing else', () => {
  const rings = universe.galaxies.time;
  assert.ok(rings.length >= 8 && rings.length <= 14);
  const sizes = new Array(rings.length).fill(0);
  const kinded = new Array(rings.length).fill(0); // the few films white light leaves unlit have no kind
  for (let i = 0; i < base; i += 1) {
    const g = universe.galaxyOf.time[i];
    assert.ok(g !== UNLIT, `${films[i].t} has a year, so a ring`);
    sizes[g] += 1;
    if (universe.armOf.time[i] !== UNLIT) kinded[g] += 1;
    const ring = rings[g];
    assert.ok(films[i].y >= ring.from && films[i].y <= ring.to, `${films[i].t} (${films[i].y}) in ${ring.name}`);
    assert.ok(radius(i) >= ring.ring.inner - 0.5 && radius(i) <= ring.ring.outer + 0.5, `${films[i].t} within its ring`);
  }
  rings.forEach((ring, g) => {
    assert.equal(ring.g, g);
    assert.equal(ring.size, sizes[g]);
    assert.ok(ring.name && ring.thesis.includes(String(ring.size)));
    assert.ok(g === 0 || ring.from > rings[g - 1].to, 'oldest first, none overlapping');
    assert.ok(ring.doors.length >= 3 && ring.doors.every(door => universe.galaxyOf.time[door] === g), 'its ways in are its own films');
    assert.equal(ring.arms.reduce((sum, arm) => sum + arm.size, 0), kinded[g], `the kinds of ${ring.name} hold every film that has a kind`);
    assert.ok(ring.size - kinded[g] <= Math.max(2, ring.size * 0.02));
    for (const arm of ring.arms) assert.ok(arm.whole && arm.lead.every(lead => universe.armOf.time[lead] === arm.arm));
    assert.ok(ring.typical.length > 0 && ring.typical.every(star => universe.galaxyOf.time[star] === g));
    for (const [trait, percent] of ring.top) {
      assert.ok(!universe.traits[trait].v && percent > 0 && percent <= 100);
      assert.notEqual((universe.traits[trait].s || universe.traits[trait].t).toLowerCase(), ring.name.toLowerCase(), 'a decade is not set apart by its own name');
    }
  });
  assert.equal(new Set(rings.map(ring => ring.name)).size, rings.length);
});

test('a kind within a decade is told apart from the rest of its decade, and a place is named once', () => {
  const carried = (stars, trait) => stars.filter(star => LIGHT_IDS.some(light => universe.model.index[light].traits(star, 400).some(entry => entry.trait === trait))).length;
  for (const g of [3, 5, 7]) {
    const ring = universe.galaxies.time[g];
    const stars = [...Array(base).keys()].filter(i => universe.galaxyOf.time[i] === g);
    for (const arm of ring.arms.slice(0, 3)) {
      assert.ok(arm.top.length >= 5, `${arm.name} ${ring.name} has things that hold it together`);
      for (const trait of arm.top) assert.ok(carried(stars, trait) < stars.length * 0.9, `${universe.traits[trait].s} is said of ${arm.name}, not of all ${ring.name}`);
      const places = arm.top.filter(trait => ['country', 'language'].includes(universe.traits[trait].k)).map(trait => universe.traits[trait].s);
      for (const [country, language] of [['Sweden', 'Swedish'], ['Japan', 'Japanese']]) assert.ok(!(places.includes(country) && places.includes(language) && arm.size > 20), `${country} and ${language} are not both said of ${arm.name}`);
    }
  }
});

test('a kind of film keeps one direction: its wedge, the same in every decade', () => {
  const span = new Map(); // white galaxy → angles of its films
  for (let i = 0; i < base; i += 1) {
    const g = universe.galaxyOf.white[i];
    if (g === UNLIT) continue;
    assert.equal(universe.armOf.time[i], g, 'its kind in Lookback is its galaxy in white light');
    if (!span.has(g)) span.set(g, []);
    span.get(g).push(angle(i));
  }
  const { sectors } = universe.time;
  for (const [g, angles] of span) {
    const { start, width } = sectors.get(g);
    for (const a of angles) assert.ok(wrap(a - start) <= width + 1e-6, `${universe.galaxies.white[g].name} keeps to its wedge`);
  }
  // No two wedges overlap.
  const list = [...sectors.values()].map(({ start, width }) => [wrap(start), width]).sort((a, b) => a[0] - b[0]);
  for (let n = 0; n < list.length; n += 1) {
    const [start, width] = list[n];
    const next = n + 1 < list.length ? list[n + 1][0] : list[0][0] + TAU;
    assert.ok(start + width <= next + 1e-6);
  }
});

test('a film charted later takes its decade and its kind', () => {
  const fresh = open().universe;
  const vertigo = star(fresh, 'vertigo-1958', 80);
  const rows = Object.fromEntries(['story', 'feeling', 'image', 'idea', 'world', 'hands'].map(light => [light, fresh.model.index[light].traits(vertigo, 40).map(({ trait, weight }) => [trait, weight])]));
  const [index] = fresh.addStars([{ film: { t: 'A Lighthouse at Dusk', y: 1961, s: 'a-lighthouse-at-dusk-1961', hi: '#aabbcc', lo: '#112233', deep: 1 }, rows }]);
  const ring = fresh.galaxies.time[fresh.galaxyOf.time[index]];
  assert.ok(ring.from <= 1961 && ring.to >= 1961, 'its decade');
  assert.equal(fresh.armOf.time[index], fresh.galaxyOf.white[index], 'its kind is where white light placed it');
  for (let axis = 0; axis < 3; axis += 1) assert.ok(Number.isFinite(fresh.positions.time[index * 3 + axis]));
});

test('a line of sight runs one way through time, and keeps to its subject', () => {
  for (const slug of ['vertigo-1958', 'in-the-mood-for-love-2000', 'spirited-away-2001']) {
    const at = star(universe, slug, 80);
    const back = lineage(universe, at, { direction: -1 });
    const forth = lineage(universe, at, { direction: 1 });
    let year = films[at].y;
    for (const step of back) {
      assert.ok(films[step.star].y <= year - 4, 'each step at least four years further back');
      assert.ok(step.sim >= 0.2);
      year = films[step.star].y;
    }
    year = films[at].y;
    for (const step of forth) {
      assert.ok(films[step.star].y >= year + 4, 'each step at least four years further on');
      year = films[step.star].y;
    }
    const all = [at, ...back.map(step => step.star), ...forth.map(step => step.star)];
    assert.equal(new Set(all).size, all.length, 'no film twice');
    if (back.length) assert.equal(back[0].from, at);
  }
});

test('a film\'s system in time: before it, after it, and of its time', () => {
  const at = star(universe, 'vertigo-1958', 80);
  const year = films[at].y;
  const back = lineage(universe, at, { direction: -1 });
  const exclude = new Set([back[0]?.star]);
  const rings = timeRings(universe, at, { per: 3, back, forth: [], exclude });
  const named = Object.fromEntries(rings.map(ring => [ring.light, ring]));
  assert.ok(named.before && named.after && named.then);
  assert.ok(named.before.stars.every(i => films[i].y < year - 3));
  assert.ok(named.after.stars.every(i => films[i].y > year + 3));
  assert.ok(named.then.stars.every(i => Math.abs(films[i].y - year) <= 3));
  const all = rings.flatMap(ring => ring.stars);
  assert.equal(new Set(all).size, all.length, 'no film on two rings');
  assert.ok(!all.includes(at) && !all.some(i => exclude.has(i)), 'a film set aside is not offered, even as the line of sight');
  for (const ring of rings) assert.ok(ring.stars.length <= 3 && ring.name && /^#[0-9a-f]{6}$/.test(ring.color));
});
