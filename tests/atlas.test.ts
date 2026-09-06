import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAtlasInput, parseAtlas, atlasInputKey } from '../app/lib/atlas.ts';
import { FACET_KEYS } from '../app/lib/light-table.ts';

const reel = JSON.parse(readFileSync(new URL('./fixtures/light-table.json', import.meta.url), 'utf8'));
function fixture() {
  const facets = reel.fingerprint;
  const film = (title: string, year: string) => ({ title, year, facets, summary: 'A summary.', watchFor: 'An observable choice.' });
  return { kind: 'atlas-v1', thesis: 'A meaningful throughline.', anchor: film('In the Mood for Love', '2000'), neighbors: Array.from({ length: 6 }, (_, i) => ({ ...film(`Neighbor ${i}`, '2001'), label: 'Shared restraint', shared: 'A concrete link.', difference: 'A real difference.', whyHere: 'Respects the request.', lenses: Object.fromEntries(FACET_KEYS.map(key => [key, { affinity: 'echo', evidence: 'Comparative evidence.' }])) })) };
}
test('Atlas accepts complete profiles and rejects incomplete or duplicate graphs', () => {
  const atlas = fixture();
  assert.ok(parseAtlas(atlas));
  assert.equal(parseAtlas({ ...atlas, kind: 'complete' }), null);
  assert.equal(parseAtlas({ ...atlas, neighbors: atlas.neighbors.slice(0, 5) }), null);
  assert.equal(parseAtlas({ ...atlas, neighbors: atlas.neighbors.map(() => atlas.neighbors[0]) }), null);
  const broken = structuredClone(atlas); delete (broken.neighbors[0].lenses as Record<string, unknown>).howItFeels;
  assert.equal(parseAtlas(broken), null);
});
test('Atlas snapshots preserve the accepted prompt and carry fresh exclusions and Likes separately', () => {
  const request = { films: ['Paris, Texas'], creativeBrief: 'Patient longing', experience: 'light-table-v1' as const };
  const anchor = { title: 'After Yang', year: '2022' };
  const liked = [{ title: 'Columbus', year: '2017' }];
  const input = buildAtlasInput(anchor, request, [], liked);
  assert.deepEqual(input.request.films, request.films);
  assert.equal(input.request.creativeBrief, request.creativeBrief);
  assert.deepEqual(input.request.likedFilms, liked);
  assert.notEqual(atlasInputKey(input), atlasInputKey({ ...input, request: { ...request, creativeBrief: 'Something else' } }));
  assert.equal(request.creativeBrief, 'Patient longing');
});
