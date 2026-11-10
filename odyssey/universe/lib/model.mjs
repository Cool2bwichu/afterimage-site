// Everything the compiler knows before it draws the sky: the films, their
// traits under each light, their fortune curves, the lines ATLAS already drew
// between them, and the likeness model built from all of it.
import { extractFeatures, packFeatures } from './features.mjs';
import { createModel } from '../../src/engine/universe.mjs';
import { standardise } from '../../src/engine/similarity.mjs';

export const LINK_TYPES = ['rhyme', 'convergence', 'descent', 'rebuttal'];
export const LINK_SOURCES = ['reading', 'attested', 'record'];
const DIRECTIONS = { none: 0, a: 1, b: 2 };

/**
 * The drawn lines: every reading and attested claim in ATLAS, and the recorded
 * descents (remakes, adaptations). Crew and keyword edges are left out: the
 * six lights already see those, and say so more precisely.
 */
export function drawnLinks(atlas) {
  const links = [];
  const seen = new Set();
  for (const edge of atlas.edges) {
    const authored = edge.source === 'reading' || edge.source === 'attested';
    const recordedDescent = edge.source === 'record' && edge.type === 'descent';
    if (!authored && !recordedDescent) continue;
    if (!LINK_TYPES.includes(edge.type) || !edge.claim) continue;
    const key = `${Math.min(edge.ai, edge.bi)}:${Math.max(edge.ai, edge.bi)}:${edge.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({
      a: edge.ai,
      b: edge.bi,
      type: LINK_TYPES.indexOf(edge.type),
      source: LINK_SOURCES.indexOf(edge.source),
      strength: Math.max(0, Math.min(1, edge.strength ?? 0.5)),
      from: DIRECTIONS[edge.from] ?? 0,
      claim: String(edge.claim).trim(),
    });
  }
  return links;
}

export function buildModel(atlas) {
  const count = atlas.films.length;
  const extracted = extractFeatures(atlas);
  const packed = packFeatures(extracted, count);
  const curves = extracted.stories.map(story => (story ? standardise(story.curve) : null));
  const links = drawnLinks(atlas);
  const model = createModel({
    count,
    idf: packed.idf,
    lights: packed.lights,
    curves,
    links: links.map(link => [link.a, link.b, link.strength]),
  });
  return { count, extracted, packed, curves, links, model };
}
