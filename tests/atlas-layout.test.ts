import test from 'node:test';
import assert from 'node:assert/strict';
import { atlasDirectionalNeighbor, atlasLayout, type AtlasAffinity } from '../app/lib/atlas-layout.ts';
import type { AtlasNeighbor } from '../app/lib/atlas.ts';

function neighbors(affinities: AtlasAffinity[]): AtlasNeighbor[] {
  return affinities.map(affinity => ({
    lenses: {
      whereItLives: { affinity, evidence: 'World evidence.' },
      howItFeels: { affinity, evidence: 'Mood evidence.' },
      howItLooks: { affinity, evidence: 'Visual evidence.' },
      howItSpeaks: { affinity, evidence: 'Story evidence.' },
    },
  })) as AtlasNeighbor[];
}

test('whole-film layout stays balanced and makes no affinity or distance claim', () => {
  const layout = atlasLayout(neighbors(['close', 'echo', 'contrast', 'close', 'echo', 'contrast']), 'all');
  assert.deepEqual(layout.anchor, { x: 50, y: 49 });
  assert.deepEqual(layout.groups, []);
  assert.deepEqual(layout.nodes, [
    { x: 18, y: 20 }, { x: 50, y: 12 }, { x: 82, y: 20 },
    { x: 18, y: 70 }, { x: 50, y: 85 }, { x: 82, y: 70 },
  ]);
});

test('lens layout assigns categorical zones while preserving original film indices', () => {
  const films = neighbors(['contrast', 'close', 'echo', 'close', 'contrast', 'echo']);
  films[0].lenses.howItLooks.affinity = 'echo';
  const layout = atlasLayout(films, 'howItLooks');
  assert.deepEqual(layout.anchor, { x: 50, y: 89 });
  assert.deepEqual(layout.groups.map(({ affinity, label, x, width, count }) => [affinity, label, x, width, count]), [
    ['close', 'Close', 100 / 6, 100 / 3, 2],
    ['echo', 'Echo', 50, 100 / 3, 3],
    ['contrast', 'Contrast', (100 / 3) * 2.5, 100 / 3, 1],
  ]);
  assert.deepEqual(layout.nodes.map(node => node.affinity), ['echo', 'close', 'echo', 'close', 'contrast', 'echo']);
  assert.ok(layout.nodes[1].x < layout.nodes[0].x && layout.nodes[0].x < layout.nodes[4].x);
  assert.deepEqual(atlasLayout(films, 'howItLooks'), layout, 'layout is deterministic');
});

test('six films in one zone have distinct, bounded positions and no fabricated edges', () => {
  const layout = atlasLayout(neighbors(Array(6).fill('close')), 'howItFeels');
  assert.deepEqual(layout.groups, [{ affinity: 'close', label: 'Close', x: 50, width: 100, count: 6 }]);
  assert.deepEqual(layout.nodes.map(({ x, y }) => [x, y]), [
    [20, 27], [50, 27], [80, 27], [20, 59], [50, 59], [80, 59],
  ]);
  assert.equal(new Set(layout.nodes.map(node => `${node.x},${node.y}`)).size, 6);
  assert.ok(layout.nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y)
    && node.x >= 8 && node.x <= 92 && node.y >= 22 && node.y <= 68));
  assert.deepEqual(Object.keys(layout).sort(), ['anchor', 'groups', 'nodes']);
  assert.ok(layout.nodes.every(node => Object.keys(node).sort().join(',') === 'affinity,x,y'));
});

test('two populated affinities share the chart and keep empty affinities out of the groups', () => {
  const layout = atlasLayout(neighbors(['contrast', 'close', 'close', 'contrast', 'close', 'close']), 'howItLooks');
  assert.deepEqual(layout.groups, [
    { affinity: 'close', label: 'Close', x: 25, width: 50, count: 4 },
    { affinity: 'contrast', label: 'Contrast', x: 75, width: 50, count: 2 },
  ]);
  assert.deepEqual(layout.nodes.map(({ x, y }) => [x, y]), [
    [75, 27], [12.5, 27], [37.5, 27], [75, 59], [12.5, 59], [37.5, 59],
  ]);
});

test('directional navigation follows chart geometry in the whole-film view', () => {
  const nodes = atlasLayout(neighbors(Array(6).fill('echo')), 'all').nodes;
  assert.equal(atlasDirectionalNeighbor(nodes, 0, 'ArrowRight'), 1);
  assert.equal(atlasDirectionalNeighbor(nodes, 0, 'ArrowDown'), 3);
  assert.equal(atlasDirectionalNeighbor(nodes, 1, 'ArrowLeft'), 0);
  assert.equal(atlasDirectionalNeighbor(nodes, 1, 'ArrowDown'), 4);
  assert.equal(atlasDirectionalNeighbor(nodes, 2, 'ArrowRight'), 2, 'no candidate on that side');
});

test('directional navigation favors alignment over a nearly perpendicular candidate', () => {
  const nodes = [{ x: 50, y: 50 }, { x: 52, y: 80 }, { x: 70, y: 50 }, { x: 49, y: 50 }];
  assert.equal(atlasDirectionalNeighbor(nodes, 0, 'ArrowRight'), 2);
  assert.equal(atlasDirectionalNeighbor(nodes, 0, 'ArrowLeft'), 3);
  assert.equal(atlasDirectionalNeighbor(nodes, 0, 'ArrowUp'), 0);
});

test('directional navigation works within a crowded affinity zone', () => {
  const nodes = atlasLayout(neighbors(Array(6).fill('close')), 'howItFeels').nodes;
  assert.equal(atlasDirectionalNeighbor(nodes, 0, 'ArrowRight'), 1);
  assert.equal(atlasDirectionalNeighbor(nodes, 0, 'ArrowDown'), 3);
  assert.equal(atlasDirectionalNeighbor(nodes, 5, 'ArrowUp'), 2);
  assert.equal(atlasDirectionalNeighbor(nodes, 5, 'ArrowDown'), 5);
});
