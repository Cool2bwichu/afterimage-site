import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ATLAS_RADIUS, REEL_RADIUS, buildSky, constellationCenter, nearestStarInDirection, orbitFigure, parseSkyRegistry,
  serializeSkyRegistry, skyReadingOrder, threadFigure, updateSkyRegistry, type SkyInput,
} from '../app/lib/sky.ts';
import { parseCollectionRoute, libraryHash } from '../app/lib/navigation.ts';

const reel = (id: string, chartedAt: string, titles: string[], name = 'The Melancholy Futurist') => ({
  id, name, caption: 'Quiet futures', palette: ['#111111', '#222222', '#333333', '#444444', '#555555'], chartedAt,
  films: titles.map((title, index) => ({ title, year: String(2000 + index) })),
});
const atlas = (id: string, chartedAt: string, anchor: string, neighbors: string[]) => ({
  id, chartedAt, caption: 'A thesis', anchor: { title: anchor, year: '2000' },
  neighbors: neighbors.map((title, index) => ({ title, year: String(2000 + index) })),
});
const empty: SkyInput = { reels: [], atlases: [], likes: [], saved: [], afterimages: [] };

test('an empty history draws a dark sky with honest zero counts', () => {
  const sky = buildSky(empty);
  assert.equal(sky.stars.length, 0);
  assert.equal(sky.constellations.length, 0);
  assert.equal(sky.counts.stars, 0);
  assert.ok(sky.bounds.maxX > sky.bounds.minX);
});

test('a reel becomes one five-star thread in ranking order, and the drawing is deterministic', () => {
  const input = { ...empty, reels: [reel('first', '2026-09-01T00:00:00Z', ['A', 'B', 'C', 'D', 'E'])] };
  const sky = buildSky(input);
  assert.deepEqual(sky, buildSky(input));
  const [constellation] = sky.constellations;
  assert.equal(constellation.kind, 'reel');
  assert.equal(constellation.name, 'The Melancholy Futurist');
  assert.equal(constellation.stars.length, 5);
  assert.deepEqual(constellation.edges, [['a|2000', 'b|2001'], ['b|2001', 'c|2002'], ['c|2002', 'd|2003'], ['d|2003', 'e|2004']]);
  for (const star of sky.stars) assert.ok(Math.hypot(star.x, star.y) <= REEL_RADIUS + 0.5);
});

test('an Atlas draws only anchor links, and repeated persona names are numbered', () => {
  const sky = buildSky({ ...empty,
    reels: [reel('one', '2026-09-01T00:00:00Z', ['A', 'B', 'C', 'D', 'E']), reel('two', '2026-09-02T00:00:00Z', ['F', 'G', 'H', 'I', 'J'])],
    atlases: [atlas('map', '2026-09-03T00:00:00Z', 'Anchor', ['N1', 'N2', 'N3', 'N4', 'N5', 'N6'])],
  });
  assert.deepEqual(sky.constellations.map(item => item.name), ['The Melancholy Futurist', 'The Melancholy Futurist II', 'In the orbit of Anchor']);
  const map = sky.constellations[2];
  assert.equal(map.edges.length, 6);
  assert.ok(map.edges.every(([from]) => from === 'anchor|2000'));
  assert.equal(sky.stars.find(star => star.key === 'anchor|2000')?.role, 'anchor');
});

test('a film met twice is one brighter star that bridges both constellations', () => {
  const map = atlas('map', '2026-09-03T00:00:00Z', 'After Yang', ['N2', 'N3', 'N4', 'N5', 'N6']);
  map.neighbors.unshift({ title: 'columbus', year: '2000' });
  const sky = buildSky({ ...empty, reels: [reel('one', '2026-09-01T00:00:00Z', ['Columbus', 'B', 'C', 'D', 'E'])], atlases: [map] });
  const columbus = sky.stars.filter(star => star.key === 'columbus|2000');
  assert.equal(columbus.length, 1);
  assert.deepEqual(columbus[0].constellations, ['reel:one', 'atlas:map']);
  assert.equal(sky.counts.bridges, 1);
  const plain = sky.stars.find(star => star.key === 'b|2001')!;
  assert.ok(columbus[0].magnitude > plain.magnitude);
});

test('an Atlas grown from a reel film blooms around that star, clear of the reel', () => {
  const sky = buildSky({ ...empty,
    reels: [reel('one', '2026-09-01T00:00:00Z', ['After Yang', 'B', 'C', 'D', 'E'])],
    atlases: [atlas('map', '2026-09-03T00:00:00Z', 'After Yang', ['N1', 'N2', 'N3', 'N4', 'N5', 'N6'])],
  });
  const byKey = new Map(sky.stars.map(star => [star.key, star]));
  const anchor = byKey.get('after yang|2000')!;
  assert.deepEqual(anchor.constellations, ['reel:one', 'atlas:map']);
  assert.equal(anchor.role, 'anchor');
  const orbit = sky.constellations.find(item => item.kind === 'atlas')!;
  assert.deepEqual(orbit.center, { x: anchor.x, y: anchor.y });
  const reelStars = sky.stars.filter(star => star.constellations.includes('reel:one') && star.key !== anchor.key);
  for (const key of orbit.stars.slice(1)) {
    const star = byKey.get(key)!;
    assert.ok(Math.hypot(star.x - anchor.x, star.y - anchor.y) <= 232, `${key} drifted too far from its anchor`);
    for (const other of reelStars) assert.ok(Math.hypot(star.x - other.x, star.y - other.y) >= 30, `${key} crowds ${other.key}`);
  }
  assert.ok(Math.hypot(orbit.label.x - anchor.x, orbit.label.y - anchor.y) > 100, 'the label sits outside the bloom');
});

test('taste signals light the stars: likes and afterimages brighten, saved films wait dimmer', () => {
  const sky = buildSky({ ...empty,
    reels: [reel('one', '2026-09-01T00:00:00Z', ['A', 'B', 'C', 'D', 'E'])],
    likes: [{ title: 'A', year: '2000' }, { title: 'Loved elsewhere', year: '1999' }],
    saved: [{ title: 'B', year: '2001' }, { title: 'Someday', year: '1988' }],
    afterimages: [{ title: 'A', year: '2000', stayed: ['howItLooks'] }, { title: 'Remembered', year: '1975', stayed: [] }],
  });
  const byKey = new Map(sky.stars.map(star => [star.key, star]));
  assert.ok(byKey.get('a|2000')!.magnitude > byKey.get('c|2002')!.magnitude);
  assert.ok(byKey.get('b|2001')!.magnitude < byKey.get('c|2002')!.magnitude);
  assert.deepEqual(byKey.get('a|2000')!.afterimage, ['howItLooks']);
  for (const key of ['loved elsewhere|1999', 'someday|1988', 'remembered|1975']) assert.equal(byKey.get(key)?.role, 'field');
  assert.equal(sky.counts.liked, 2);
  assert.equal(sky.counts.saved, 2);
  assert.equal(sky.counts.afterimages, 2);
  const order = skyReadingOrder(sky);
  assert.equal(order.at(-1)?.constellation, null);
  assert.deepEqual(order.at(-1)?.stars.map(star => star.title), ['Loved elsewhere', 'Remembered', 'Someday']);
});

test('a full history keeps constellations apart and field stars from colliding', () => {
  const reels = Array.from({ length: 20 }, (_, index) => reel(`reel-${index}`, `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00Z`, Array.from({ length: 5 }, (_, n) => `R${index}-${n}`)));
  const atlases = Array.from({ length: 12 }, (_, index) => atlas(`map-${index}`, `2026-09-${String(index + 1).padStart(2, '0')}T00:00:00Z`, `Anchor ${index}`, Array.from({ length: 6 }, (_, n) => `M${index}-${n}`)));
  const likes = Array.from({ length: 400 }, (_, index) => ({ title: `Loved ${index}`, year: '2001' }));
  const saved = Array.from({ length: 300 }, (_, index) => ({ title: `Saved ${index}`, year: '2002' }));
  const started = performance.now();
  const sky = buildSky({ reels, atlases, likes, saved, afterimages: [] });
  assert.ok(performance.now() - started < 1500, 'a full sky is quick to draw');
  assert.equal(sky.constellations.length, 32);
  for (let a = 0; a < sky.constellations.length; a++) for (let b = a + 1; b < sky.constellations.length; b++) {
    const first = sky.constellations[a].center; const second = sky.constellations[b].center;
    assert.ok(Math.hypot(first.x - second.x, first.y - second.y) > ATLAS_RADIUS * 2, `${a} and ${b} overlap`);
  }
  const field = sky.stars.filter(star => star.role === 'field');
  assert.equal(field.length, 700);
  let crowded = 0;
  for (let a = 0; a < field.length; a++) for (let b = a + 1; b < field.length; b++) if (Math.hypot(field[a].x - field[b].x, field[a].y - field[b].y) < 20) crowded++;
  assert.ok(crowded < 8, `${crowded} field stars nearly overlap`);
  assert.ok(sky.stars.every(star => star.x >= sky.bounds.minX && star.x <= sky.bounds.maxX && star.y >= sky.bounds.minY && star.y <= sky.bounds.maxY));
});

test('a reel keeps one shape wherever it is drawn', () => {
  const films = ['A', 'B', 'C', 'D', 'E'];
  const seeded = buildSky({ ...empty, reels: [{ ...reel('history-id', '2026-09-01T00:00:00Z', films), seed: 'recommendation identity' }] });
  const figure = threadFigure('recommendation identity');
  const stars = seeded.constellations[0].stars.map(key => seeded.stars.find(star => star.key === key)!);
  // Same figure, translated and scaled: the ratio of distances between stars is preserved.
  const ratio = (points: Array<{ x: number; y: number }>) => Math.hypot(points[0].x - points[1].x, (points[0].y - points[1].y)) / Math.hypot(points[3].x - points[4].x, (points[3].y - points[4].y));
  const flattened = figure.map(point => ({ x: point.x, y: point.y * 0.86 }));
  assert.ok(Math.abs(ratio(stars) - ratio(flattened)) < 0.02);
});

test('figures are balanced, seeded and legible', () => {
  const thread = threadFigure('a reel');
  assert.deepEqual(thread, threadFigure('a reel'));
  assert.notDeepEqual(thread, threadFigure('another reel'));
  assert.equal(thread.length, 5);
  assert.ok(thread.every(point => Math.hypot(point.x, point.y) <= 1.0001));
  for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) assert.ok(Math.hypot(thread[a].x - thread[b].x, thread[a].y - thread[b].y) > 0.3);
  const orbit = orbitFigure('a map');
  assert.deepEqual(orbit[0], { x: 0, y: 0 });
  assert.equal(orbit.length, 7);
  assert.deepEqual(constellationCenter(0), { x: 0, y: 0 });
});

test('the chart registry keeps first-seen dates stable and forgets maps that are gone', () => {
  const first = updateSkyRegistry({}, ['atlas:one'], '2026-09-01T00:00:00Z');
  assert.equal(first.changed, true);
  const again = updateSkyRegistry(first.registry, ['atlas:one', 'atlas:two'], '2026-09-05T00:00:00Z');
  assert.deepEqual(again.registry, { 'atlas:one': '2026-09-01T00:00:00Z', 'atlas:two': '2026-09-05T00:00:00Z' });
  assert.equal(updateSkyRegistry(again.registry, ['atlas:one', 'atlas:two'], '2026-09-09T00:00:00Z').changed, false);
  assert.deepEqual(updateSkyRegistry(again.registry, ['atlas:two'], '2026-09-09T00:00:00Z').registry, { 'atlas:two': '2026-09-05T00:00:00Z' });
  assert.deepEqual(parseSkyRegistry(serializeSkyRegistry(again.registry)), again.registry);
  assert.deepEqual(parseSkyRegistry('{"version":1,"seen":{"../bad":"2026-01-01","atlas:x":"never"}}'), {});
  assert.deepEqual(parseSkyRegistry('broken'), {});
});

test('arrow keys travel to the nearest star in that direction', () => {
  const stars = [
    { key: 'center', x: 0, y: 0 }, { key: 'right', x: 100, y: 10 }, { key: 'far-right', x: 300, y: 0 },
    { key: 'up', x: 5, y: -80 }, { key: 'diagonal', x: 60, y: -70 },
  ].map(star => ({ ...star, title: star.key, year: '2000', role: 'member' as const, liked: false, saved: false, afterimage: null, constellations: [], magnitude: 0.4 }));
  assert.equal(nearestStarInDirection(stars, stars[0], 'ArrowRight')?.key, 'right');
  assert.equal(nearestStarInDirection(stars, stars[0], 'ArrowUp')?.key, 'up');
  assert.equal(nearestStarInDirection(stars, stars[0], 'ArrowLeft'), null);
});

test('the sky and the journal have their own addresses', () => {
  assert.deepEqual(parseCollectionRoute('#sky'), { kind: 'sky' });
  assert.deepEqual(parseCollectionRoute('#afterimages'), { kind: 'library', tab: 'afterimages' });
  assert.deepEqual(parseCollectionRoute('#library'), { kind: 'library', tab: 'watchlist' });
  assert.equal(libraryHash('afterimages'), 'afterimages');
  assert.equal(libraryHash('watchlist'), 'library');
  assert.equal(parseCollectionRoute('#skies'), null);
});
