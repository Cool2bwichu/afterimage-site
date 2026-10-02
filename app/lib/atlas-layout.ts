import type { AtlasNeighbor } from './atlas.ts';
import type { FacetKey } from './light-table.ts';

export type AtlasAffinity = AtlasNeighbor['lenses'][FacetKey]['affinity'];
export type AtlasLayoutNode = { x: number; y: number; affinity?: AtlasAffinity };
export type AtlasLayoutGroup = { affinity: AtlasAffinity; label: string; x: number; width: number; count: number };
export type AtlasLayout = {
  anchor: { x: number; y: number };
  nodes: AtlasLayoutNode[];
  groups: AtlasLayoutGroup[];
};

const WHOLE_POSITIONS = [
  { x: 18, y: 20 }, { x: 50, y: 12 }, { x: 82, y: 20 },
  { x: 18, y: 70 }, { x: 50, y: 85 }, { x: 82, y: 70 },
];
const ZONES: Array<{ affinity: AtlasAffinity; label: string }> = [
  { affinity: 'close', label: 'Close' },
  { affinity: 'echo', label: 'Echo' },
  { affinity: 'contrast', label: 'Contrast' },
];

function rowY(row: number, rows: number): number {
  if (rows === 1) return 44;
  if (rows === 2) return [27, 59][row];
  return [24, 45, 66][row];
}

/** Categorical positions only: neither distance nor order within a zone is a similarity score. */
export function atlasLayout(neighbors: AtlasNeighbor[], lens: FacetKey | 'all'): AtlasLayout {
  if (lens === 'all') {
    return {
      anchor: { x: 50, y: 49 },
      nodes: neighbors.map((_, index) => ({ ...WHOLE_POSITIONS[index] })),
      groups: [],
    };
  }

  const nodes: AtlasLayoutNode[] = neighbors.map(() => ({ x: 50, y: 45 }));
  const populated = ZONES.map(zone => ({
    ...zone,
    indices: neighbors.flatMap((neighbor, index) => neighbor.lenses[lens].affinity === zone.affinity ? [index] : []),
  })).filter(zone => zone.indices.length > 0);
  const width = 100 / (populated.length || 1);
  const groups = populated.map((zone, groupIndex) => {
    const x = width * (groupIndex + 0.5);
    const { indices } = zone;
    const columns = populated.length === 1 ? Math.min(indices.length, 3) : indices.length >= 4 ? 2 : 1;
    const rows = Math.ceil(indices.length / columns);
    indices.forEach((index, position) => {
      const row = Math.floor(position / columns);
      const itemsInRow = Math.min(columns, indices.length - row * columns);
      const column = position % columns;
      const spacing = populated.length === 1 ? 30 : width * 0.5;
      const nodeX = x + (column - (itemsInRow - 1) / 2) * spacing;
      nodes[index] = { x: nodeX, y: rowY(row, rows), affinity: zone.affinity };
    });
    return { affinity: zone.affinity, label: zone.label, x, width, count: indices.length };
  });

  return { anchor: { x: 50, y: 89 }, nodes, groups };
}

/** Move through the visual chart without treating its coordinates as similarity scores. */
export function atlasDirectionalNeighbor(
  nodes: Array<{ x: number; y: number }>,
  current: number,
  direction: 'ArrowRight' | 'ArrowLeft' | 'ArrowUp' | 'ArrowDown',
): number {
  const origin = nodes[current];
  if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return current;
  let best = current;
  let bestScore = Infinity;
  nodes.forEach((point, index) => {
    if (index === current || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const primary = direction === 'ArrowRight' ? dx : direction === 'ArrowLeft' ? -dx
      : direction === 'ArrowDown' ? dy : -dy;
    if (primary <= 0) return;
    const perpendicular = direction === 'ArrowRight' || direction === 'ArrowLeft' ? Math.abs(dy) : Math.abs(dx);
    const score = Math.hypot(primary, perpendicular) + 2 * perpendicular;
    if (score < bestScore) { best = index; bestScore = score; }
  });
  return best;
}
