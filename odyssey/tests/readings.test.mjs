// Readings written ahead of time: how they are packed beside the chart, found
// again a shard at a time, checked like any reading, and handed to a voyager
// whether or not a Navigator is connected.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createReadings, readIndex, shardOf, READINGS_KIND } from '../src/nav/readings.mjs';
import { cleanReading, packReadings } from '../scripts/pre-read.mjs';
import { createPilot } from '../src/nav/pilot.mjs';
import { createStore } from '../src/ui/store.mjs';
import { bundle, open, star } from './chart.mjs';

const films = bundle.films;
const slugs = new Set(films.map(film => film.s));
const [a, b, c, d] = [0, 1, 2, 3].map(n => films[n].s);

/** The files `pack` would write, served from memory as a host would serve them. */
function host(files, base = 'https://site.example/data/readings/') {
  const asked = [];
  const load = async url => {
    asked.push(url);
    const name = url.startsWith(base) ? url.slice(base.length) : '';
    if (!Object.hasOwn(files, name)) throw new Error(`${url}: 404`);
    return JSON.parse(files[name]);
  };
  return { load, asked, url: `${base}index.json` };
}

const reading = (extra = {}) => ({
  essence: 'A man falls for a woman who is not there, twice.',
  beyond: { title: 'Obsession', year: 1976, why: 'De Palma takes the same spiral to New Orleans.' },
  rays: [
    { light: 'story', slug: b, claim: 'Another rescue that is really a capture.', watch: 'the second staircase' },
    { light: 'feeling', slug: c, claim: 'The same ache of looking.', watch: '' },
  ],
  ...extra,
});

test('a slug always falls in the same shard, and the shards share the chart out evenly', () => {
  for (const shards of [1, 7, 64]) {
    for (const film of films.slice(0, 50)) {
      const n = shardOf(film.s, shards);
      assert.ok(Number.isInteger(n) && n >= 0 && n < shards);
      assert.equal(shardOf(film.s, shards), n);
    }
  }
  const counts = new Array(64).fill(0);
  for (const film of films) counts[shardOf(film.s, 64)] += 1;
  const mean = films.length / 64;
  assert.ok(Math.min(...counts) > mean * 0.5 && Math.max(...counts) < mean * 1.6, `shards from ${Math.min(...counts)} to ${Math.max(...counts)}`);
});

test('a reading is kept only as far as it holds: six lights, one ray each, films of this chart, bounded words', () => {
  const kept = cleanReading(reading({
    essence: `  ${'An essence that runs on. '.repeat(40)}`,
    rays: [
      { light: 'story', slug: b, claim: 'kept', watch: 'w' },
      { light: 'story', slug: c, claim: 'a second ray under the same light', watch: '' },
      { light: 'ultraviolet', slug: c, claim: 'no such light', watch: '' },
      { light: 'image', slug: 'a-film-the-chart-never-held-1999', claim: 'not on this chart', watch: '' },
      { light: 'idea', slug: d, claim: '', watch: 'a ray with nothing to say' },
      { light: 'world', slug: d, claim: 'kept too', watch: 7 },
    ],
    beyond: { title: 'A film', year: 1700, why: 'too early to be a film' },
  }), slugs);
  assert.deepEqual(kept.rays.map(ray => [ray.light, ray.claim, ray.watch]), [['story', 'kept', 'w'], ['world', 'kept too', '']]);
  assert.ok(kept.essence.length <= 360 && !kept.essence.startsWith(' '));
  assert.equal(kept.beyond, null);
  assert.equal(cleanReading({ essence: '', rays: [] }, slugs), null);
  assert.equal(cleanReading('not a reading', slugs), null);
});

test('packed, the readings come back a shard at a time, and nothing else is fetched', async () => {
  const ledger = new Map([
    [a, { slug: a, ...reading(), by: 'Opus 5.5' }],
    [d, { slug: d, ...reading({ rays: [] }), by: 'Opus 5.5' }],
    ['a-film-the-chart-never-held-1999', { slug: 'a-film-the-chart-never-held-1999', ...reading(), by: 'Opus 5.5' }],
    [c, { slug: c, essence: '', rays: [], by: 'Opus 5.5' }],
  ]);
  const { files, count } = packReadings(ledger, { films, shards: 8, made: '2026-11-12' });
  assert.equal(count, 2, 'only readings of this chart that hold are packed');
  const index = JSON.parse(files['index.json']);
  assert.deepEqual({ kind: index.kind, v: index.v, films: index.films, count: index.count, by: index.by, made: index.made, shards: index.shards }, { kind: READINGS_KIND, v: 1, films: films.length, count: 2, by: 'Opus 5.5', made: '2026-11-12', shards: 8 });
  assert.equal(index.files.filter(Boolean).length, new Set([shardOf(a, 8), shardOf(d, 8)]).size, 'an empty shard has no file');
  assert.equal(packReadings(ledger, { films, shards: 8, made: '2026-11-12' }).files[index.files[shardOf(a, 8)]], files[index.files[shardOf(a, 8)]], 'the same readings make the same files');

  const served = host(files);
  const readings = createReadings({ url: served.url, load: served.load });
  assert.equal(readings.about, null, 'nothing is known before the index has come');
  const found = await readings.get(a);
  assert.equal(found.essence, reading().essence);
  assert.equal(found.rays.length, 2);
  assert.deepEqual(readings.about, { count: 2, films: films.length, by: 'Opus 5.5', made: '2026-11-12' });
  assert.equal((await readings.get(d)).rays.length, 0);
  assert.equal(await readings.get(b), null, 'a star that was not read has no reading');
  assert.equal(await readings.get(''), null);
  await readings.get(a);
  const shardsAsked = served.asked.filter(url => !url.endsWith('index.json'));
  assert.equal(served.asked.filter(url => url.endsWith('index.json')).length, 1, 'the index is asked for once');
  assert.equal(new Set(shardsAsked).size, shardsAsked.length, 'each shard is asked for once');
});

test('a missing, foreign or malformed index means there are no readings, and nothing fails', async () => {
  const missing = createReadings({ url: 'https://site.example/data/readings/index.json', load: async () => { throw new Error('404'); } });
  assert.equal(await missing.get(a), null);
  assert.equal(missing.about, null);
  // The dev server answers a missing file with the page itself.
  const page = createReadings({ url: 'https://site.example/data/readings/index.json', load: async () => { throw new SyntaxError('Unexpected token <'); } });
  assert.equal(await page.get(a), null);
  assert.equal(readIndex({ kind: 'something-else', v: 1, shards: 1, files: [null] }), null);
  assert.equal(readIndex({ kind: READINGS_KIND, v: 2, shards: 1, files: [null] }), null);
  assert.equal(readIndex({ kind: READINGS_KIND, v: 1, shards: 2, files: [null] }), null, 'a shard for every place');
  assert.deepEqual(readIndex({ kind: READINGS_KIND, v: 1, shards: 2, files: ['../../secret.json', '01.json'] }).files, [null, '01.json'], 'a file is named, never a path');
  // The empty index shipped with the chart until the pre-read has run.
  const empty = packReadings(new Map(), { films, shards: 64 });
  const served = host(empty.files);
  const none = createReadings({ url: served.url, load: served.load });
  assert.equal(await none.get(a), null);
  assert.equal(none.about, null, 'no readings, nothing to tell');
  assert.deepEqual(served.asked, [served.url]);
});

test('the pilot hands a reading written ahead of time to a voyager with no Navigator, checked and marked as such', async () => {
  const kept = new Map();
  globalThis.window = { localStorage: { getItem: key => (kept.has(key) ? kept.get(key) : null), setItem: (key, value) => { kept.set(key, String(value)); } } };
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  const { universe, search } = open();
  const vertigo = star(universe, 'vertigo-1958', 80);
  const slug = universe.films[vertigo].s;
  const [near, far] = [vertigo === 0 ? 1 : 0, vertigo === 2 ? 3 : 2].map(n => universe.films[n].s);
  const ledger = new Map([[slug, { slug, essence: 'Read before you came.', beyond: null, by: 'Opus 5.5', rays: [
    { light: 'image', slug: near, claim: 'The same green.', watch: 'the hotel sign' },
    { light: 'idea', slug: far, claim: 'The same idea.', watch: '' },
  ] }]]);
  const served = host(packReadings(ledger, { films: universe.bundle.films, shards: 16 }).files);
  const pilot = createPilot({ universe, depth: null, search, store: createStore(), readings: createReadings({ url: served.url, load: served.load }) });
  await pilot.find();
  assert.equal(pilot.connected, false);

  const ahead = await pilot.aheadArrival(vertigo);
  assert.equal(ahead.ahead, true);
  assert.equal(ahead.essence, 'Read before you came.');
  assert.deepEqual(ahead.rays.map(ray => [ray.light, ray.star, ray.claim]), [['image', universe.indexOfSlug(near), 'The same green.'], ['idea', universe.indexOfSlug(far), 'The same idea.']]);
  assert.equal(pilot.cachedArrival(vertigo), null, 'a reading written ahead is not the voyager\'s own');
  assert.deepEqual(pilot.ahead, { count: 1, films: universe.base, by: 'Opus 5.5', made: new Date().toISOString().slice(0, 10) });
  assert.equal(await pilot.aheadArrival(vertigo === 5 ? 6 : 5), null, 'a star not read ahead has nothing');
  assert.equal(await pilot.aheadArrival(universe.count + 3), null);

  // Without readings at all, the pilot has nothing ahead and says nothing of it.
  const bare = createPilot({ universe, depth: null, search, store: createStore() });
  assert.equal(await bare.aheadArrival(vertigo), null);
  assert.equal(bare.ahead, null);
});
