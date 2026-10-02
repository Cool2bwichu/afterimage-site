import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { buildCollisionInput, parseCollision, sameFilm } from '../app/lib/collision.ts';

const result = {
  kind: 'collision-v1',
  films: [{ title: 'Paris, Texas', year: '1984', tmdbId: 655 }, { title: 'In the Mood for Love', year: '2000' }],
  film: { title: 'Happy Together', year: '1997', tmdbId: 18329, reason: 'Love in exile.', fromFirst: 'From Paris, Texas: distance.', fromSecond: 'From In the Mood for Love: colour.', watchFor: 'The falls.' },
};

test('a collision request carries two films, the viewer’s exclusions, Likes, reel and mood, within bounds', () => {
  const input = buildCollisionInput({ title: ' Paris, Texas ', year: '1984', tmdbId: 655 }, { title: 'In the Mood for Love', year: '2000' }, {
    excludedFilms: [{ title: 'Cure', year: '1997' }], likedFilms: [{ title: 'Drive', year: '2011' }],
    reelFilms: Array.from({ length: 12 }, (_, index) => ({ title: `Film ${index}`, year: '2001' })), creativeBrief: ' tender ',
  });
  assert.deepEqual(input.films, [{ title: 'Paris, Texas', year: '1984', tmdbId: 655 }, { title: 'In the Mood for Love', year: '2000' }]);
  assert.equal(input.reelFilms?.length, 10);
  assert.equal(input.creativeBrief, 'tender');
  assert.deepEqual(buildCollisionInput({ title: 'A', year: '2000' }, { title: 'B', year: '2001' }), { films: [{ title: 'A', year: '2000' }, { title: 'B', year: '2001' }] });
});

test('a finished collision is read defensively and must match the two films asked about', () => {
  assert.deepEqual(parseCollision(result), result);
  assert.deepEqual(parseCollision(result, [{ title: 'paris, texas', year: '1984' }, { title: 'In the Mood for Love', year: '2000' }]), result);
  assert.equal(parseCollision(result, [{ title: 'Yi Yi', year: '2000' }, { title: 'In the Mood for Love', year: '2000' }]), null);
  for (const broken of [
    { ...result, kind: 'atlas-v1' },
    { ...result, films: [result.films[0]] },
    { ...result, film: { ...result.film, year: '97' } },
    { ...result, film: { ...result.film, reason: 'x'.repeat(401) } },
    { ...result, film: { ...result.film, title: 'Paris, Texas', year: '1984' } },
    null,
  ]) assert.equal(parseCollision(broken), null);
  assert.ok(sameFilm({ title: 'Amélie', year: '2001' }, { title: 'amélie', year: '2001' }));
});

test('films can be collided by dragging stars, and every film opens its verbs', async () => {
  const constellation = await readFile(new URL('../app/components/reel-constellation.tsx', import.meta.url), 'utf8');
  const reel = await readFile(new URL('../app/components/screening-reel.tsx', import.meta.url), 'utf8');
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(constellation, /onCollide\?\.\(start\.index, over, event\.currentTarget\)/);
  assert.match(constellation, /Drag one star onto another to collide them\./);
  assert.match(reel, /\{\.\.\.hold\?\.\(\{ film, index \}\)\}/);
  for (const verb of ['collide', 'atlas', 'watched', 'like', 'save', 'replace']) assert.match(page, new RegExp(`id: '${verb}'`));
});
