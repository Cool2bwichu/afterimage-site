// A voyage carried in a file: written in the format both editions share, read
// back without losing anything already kept, and refused whole when it is not
// a voyage at all.
import assert from 'node:assert/strict';
import test from 'node:test';

import { cleanRoute, exportArchive, FORMAT, mergeArchive } from '../src/ui/archive.mjs';

const kept = () => ({
  loved: new Set(['vertigo-1958']), seen: new Set(['alien-1979']), watchlist: new Set(['stalker-1979']), hidden: new Set(),
  visited: new Set(['vertigo-1958', 'alien-1979']), wake: ['vertigo-1958', 'alien-1979'],
  found: [{ slug: 'the-lamp-1961', reading: { title: 'The Lamp', year: 1961 }, from: 'vertigo-1958', source: 'deepfield' }],
  arrivals: { 'vertigo-1958': { essence: 'A man falls in love with a ghost he helps to make.', rays: [] } },
  routes: [{ name: 'Vertigo to Alien', kind: 'voyage', savedAt: '2026-11-12', stops: [{ slug: 'vertigo-1958', light: null, note: '' }, { slug: 'alien-1979', light: 'feeling', note: 'dread' }], landed: 'alien-1979' }],
  sky: 'feeling',
});

test('a voyage is written in the shared format, set-aside films as the other edition names them', () => {
  const file = exportArchive({ ...kept(), hidden: new Set(['cats-2019']) }, new Date('2026-11-12T10:00:00Z'));
  assert.equal(file.format, FORMAT);
  assert.equal(file.version, 3);
  assert.equal(file.exportedAt, '2026-11-12T10:00:00.000Z');
  assert.deepEqual(file.rejected, ['cats-2019']);
  assert.deepEqual(file.watchlist, ['stalker-1979']);
  assert.equal(file.routes[0].landed, 'alien-1979');
  // It survives the trip through text.
  assert.deepEqual(JSON.parse(JSON.stringify(file)), file);
});

test('reading a file back joins it to what is kept, and reports what grew', () => {
  const file = {
    format: FORMAT, version: 3,
    loved: ['vertigo-1958', 'solaris-1972'], seen: [], watchlist: ['stalker-1979', 'mirror-1975'], rejected: ['cats-2019'],
    visited: ['solaris-1972'], wake: ['solaris-1972'],
    found: [
      { reading: { title: 'The Lamp', year: 1961 }, from: '', source: 'deepfield' },
      { reading: { title: 'The Harbour', year: 1958 }, from: 'solaris-1972', source: 'chart' },
      { reading: { title: 'No Year' } },
    ],
    routes: [{ name: 'Solaris to Mirror', kind: 'trail', stops: [{ slug: 'solaris-1972', light: 'nowhere' }, { slug: 'mirror-1975', light: 'image', note: 'water' }] }],
    arrivals: { 'solaris-1972': { essence: 'Grief given a planet.', rays: [{ light: 'idea', slug: 'mirror-1975', claim: 'memory', watch: '' }, { light: 'nowhere', slug: 'x' }] }, __proto__: { essence: 'no' } },
    sky: 'image',
  };
  const { state, counts } = mergeArchive(kept(), file);
  assert.deepEqual([...state.loved].sort(), ['solaris-1972', 'vertigo-1958']);
  assert.deepEqual([...state.watchlist].sort(), ['mirror-1975', 'stalker-1979']);
  assert.deepEqual([...state.hidden], ['cats-2019']);
  assert.ok(state.visited.has('solaris-1972') && state.visited.has('vertigo-1958'));
  assert.deepEqual(state.wake, ['vertigo-1958', 'alien-1979', 'solaris-1972']);
  assert.equal(state.found.length, 2, 'a film already found is not found twice, and a reading without a year is refused');
  assert.equal(state.found[1].reading.title, 'The Harbour');
  assert.equal(state.routes.length, 2);
  assert.equal(state.routes[1].stops[0].light, null, 'an unknown light is dropped, not trusted');
  assert.equal(state.arrivals['solaris-1972'].rays.length, 1);
  assert.equal(state.arrivals['vertigo-1958'].essence, 'A man falls in love with a ghost he helps to make.', 'what was kept is not overwritten');
  assert.equal(Object.getPrototypeOf(state.arrivals), Object.prototype);
  assert.equal(state.sky, 'image');
  assert.deepEqual(counts, { loved: 1, seen: 0, watchlist: 1, hidden: 1, visited: 1, found: 1, routes: 1, comets: 0 });
});

test('the comets of each night travel in the file: a night kept here keeps its film, and one caught anywhere is caught', () => {
  const here = { ...kept(), sky: 'time', comets: [
    { night: '2026-11-12', slug: 'mirror-1975', from: 'solaris-1972', light: 'image', why: 'loved', caught: true },
    { night: '2026-11-13', slug: 'stalker-1979', from: null, light: 'idea', why: 'known', caught: false },
  ] };
  const file = exportArchive(here);
  assert.equal(file.sky, 'time', 'Lookback is a sky that travels too');
  assert.equal(file.comets.length, 2);
  const { state, counts } = mergeArchive(kept(), JSON.parse(JSON.stringify(file)));
  assert.equal(state.comets.length, 2);
  assert.equal(counts.comets, 2);
  assert.equal(state.sky, 'time');
  const incoming = { format: FORMAT, version: 3, comets: [
    { night: '2026-11-13', slug: 'stalker-1979', caught: true },
    { night: '2026-11-14', slug: 'mirror-1975', light: 'nowhere', why: 'because' },
    { night: 'yesterday', slug: 'alien-1979' },
    { night: '2026-11-15' },
  ] };
  const merged = mergeArchive(here, incoming);
  assert.deepEqual(merged.state.comets.map(comet => comet.night), ['2026-11-12', '2026-11-13', '2026-11-14']);
  assert.equal(merged.state.comets[1].caught, true, 'caught in the other browser');
  assert.equal(merged.state.comets[2].light, null, 'an unknown light is dropped');
  assert.equal(merged.state.comets[2].why, 'known');
  assert.equal(merged.counts.comets, 1);
  assert.equal(here.comets[1].caught, false, 'what was kept is not changed in place');
  assert.throws(() => mergeArchive(here, { format: FORMAT, version: 3, comets: 'many' }), /comets/);
});

test('a file that is not a voyage changes nothing', () => {
  const before = kept();
  for (const file of [null, 'text', {}, { format: 'something-else', version: 3 }, { format: FORMAT, version: 9 }]) {
    assert.throws(() => mergeArchive(before, file), /not an AFTERIMAGE voyage file/);
  }
  assert.throws(() => mergeArchive(before, { format: FORMAT, version: 2, loved: [42] }), /loved films/);
  assert.throws(() => mergeArchive(before, { format: FORMAT, version: 2, loved: new Array(20001).fill('a') }), /loved films/);
  assert.throws(() => mergeArchive(before, { format: FORMAT, version: 1, routes: 'many' }), /voyages/);
  assert.deepEqual([...before.loved], ['vertigo-1958']);
});

test('the other edition\'s files are read: version 1 and 2, with no watchlist at all', () => {
  const { state } = mergeArchive(kept(), { format: FORMAT, version: 1, loved: ['mirror-1975'], seen: ['vertigo-1958'] });
  assert.ok(state.loved.has('mirror-1975'));
  assert.ok(state.seen.has('vertigo-1958'));
  assert.deepEqual([...state.watchlist], ['stalker-1979']);
});

test('a route must name its stops', () => {
  assert.equal(cleanRoute({ name: 'x', stops: [] }), null);
  assert.equal(cleanRoute({ name: 'x', stops: [{ slug: '' }] }), null);
  assert.equal(cleanRoute({ stops: [{ slug: 'a' }] }).name, 'A voyage');
  assert.equal(cleanRoute({ stops: new Array(41).fill({ slug: 'a' }) }), null);
});
