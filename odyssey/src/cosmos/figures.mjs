// Constellations waiting in the sky. Seen from far out, a few figures are drawn
// faintly across the galaxies: the ones you have found, in gold and named; the
// ones forming in your wake, pale and unnamed; and, for a voyager who has found
// nothing yet, a few of the tightest, to say that something is there.
import { h } from '../ui/dom.mjs';
import { clamp } from './math.mjs';

const GOLD = [0.94, 0.79, 0.53];
const PALE = [0.74, 0.82, 0.95];
const MAX_SHOWN = 7;

export function createFigures({ root, cosmos, universe, small = false, onFigure, hintOf = null }) {
  const layer = h('div.lbl-layer.figure-marks');
  root.append(layer);
  const shapes = new Map(); // sky → per constellation: { id, edges: [[a, b]], span }
  let found = new Set();
  let visited = new Set();
  let lit = -1;
  let enabled = true;
  let shown = []; // [{ id, element, born }]
  let since = 1;
  let wanted = '';
  const scratch = {};

  /** The shortest set of lines joining a figure's stars, as they lie under one light. */
  function shapesOf(sky) {
    if (shapes.has(sky)) return shapes.get(sky);
    const P = universe.positions[sky];
    const distance = (a, b) => Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
    const list = universe.bundle.constellations.map((figure, id) => {
      const stars = figure.stars.filter(star => star < universe.count);
      const joined = new Set(stars.slice(0, 1));
      const edges = [];
      let span = 0;
      while (joined.size < stars.length) {
        let best = null;
        for (const a of joined) for (const b of stars) {
          if (joined.has(b)) continue;
          const d = distance(a, b);
          if (!best || d < best.d) best = { a, b, d };
        }
        joined.add(best.b);
        edges.push([best.a, best.b]);
        span = Math.max(span, best.d);
      }
      return { id, stars, edges, span };
    });
    shapes.set(sky, list);
    return list;
  }

  function choose(view) {
    const far = view.distance > (small ? 900 : 750);
    const list = enabled && far ? shapesOf(cosmos.sky) : [];
    const progress = new Map(list.map(shape => [shape.id, shape.stars.filter(star => visited.has(star)).length]));
    const pick = [];
    for (const shape of list) if (found.has(shape.id) && shape.id !== lit) pick.push(shape);
    const forming = list.filter(shape => !found.has(shape.id) && shape.id !== lit && progress.get(shape.id) > 0)
      .sort((a, b) => progress.get(b.id) - progress.get(a.id) || a.span - b.span);
    pick.push(...forming);
    if (!found.size && !forming.length) pick.push(...list.filter(shape => shape.id !== lit).sort((a, b) => a.span - b.span).slice(0, 3));
    const chosen = pick.slice(0, MAX_SHOWN);
    const key = `${cosmos.sky}:${chosen.map(shape => `${shape.id}${found.has(shape.id) ? '*' : ''}`).join(',')}`;
    if (key === wanted) return;
    wanted = key;

    const clock = cosmos.clock;
    const before = new Map(shown.map(entry => [entry.id, entry]));
    for (const entry of shown) if (!chosen.some(shape => shape.id === entry.id)) entry.element.remove();
    shown = chosen.map(shape => {
      const known = found.has(shape.id);
      const old = before.get(shape.id);
      if (old && old.known === known) return { ...old, shape };
      old?.element.remove();
      const figure = universe.bundle.constellations[shape.id];
      const seen = progress.get(shape.id);
      const hint = !known && hintOf ? hintOf(shape.id) : null;
      const element = h('button.figure-mark', {
        type: 'button', tabindex: '-1', class: known ? 'known' : '',
        title: known ? `${figure.name}: a constellation you found`
          : `An unnamed figure${hint ? `, something to do with ${hint.name}` : ''}: ${seen} of its ${shape.stars.length} stars visited`,
        onclick: event => { event.stopPropagation(); onFigure?.(shape.id); },
      }, h('span.figure-mark-glyph', '✦'), known ? h('span.figure-mark-name', figure.name) : h('span.figure-mark-hint', seen ? `${seen} of ${shape.stars.length}` : 'unnamed'));
      layer.append(element);
      return { id: shape.id, shape, known, element, born: old ? old.born : clock };
    });
    cosmos.setLines('figures', shown.flatMap(entry => entry.shape.edges.map(([a, b]) => ({
      a, b, colour: [...(entry.known ? GOLD : PALE), entry.known ? 0.32 : 0.22], width: entry.known ? 1.3 : 1.15, style: 2, grow: 2.2, born: entry.born,
    }))));
  }

  function frame(view, clock, dt) {
    since += dt;
    if (since > 0.4) { since = 0; choose(view); }
    const fade = clamp((view.distance - (small ? 900 : 750)) / 300, 0, 1);
    const { width, height } = cosmos.size;
    for (const entry of shown) {
      // The mark sits at the middle of the figure's stars as they are now (they move when the light changes).
      let x = 0; let y = 0; let z = 0;
      for (const star of entry.shape.stars) { const at = cosmos.positionOf(star, [0, 0, 0]); x += at[0]; y += at[1]; z += at[2]; }
      const n = entry.shape.stars.length || 1;
      const p = cosmos.projectPoint(x / n, y / n, z / n, scratch);
      const inside = p && p.x > 20 && p.x < width - 20 && p.y > 90 && p.y < height - 110;
      entry.element.classList.toggle('on', Boolean(inside) && fade > 0);
      if (!inside) continue;
      entry.element.style.opacity = (fade * clamp((clock - entry.born) / 1.5, 0, 1)).toFixed(3);
      entry.element.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    }
  }

  const off = cosmos.onFrame(frame);
  return {
    /** What the voyager has found and where they have been. */
    setProgress(nextFound, nextVisited) { found = new Set(nextFound); visited = nextVisited; wanted = ''; },
    /** The figure lit in full just now is not drawn faintly as well. */
    setLit(id) { lit = id; wanted = ''; },
    setEnabled(on) { if (enabled !== on) { enabled = on; wanted = ''; } },
    stop() { off(); layer.remove(); cosmos.setLines('figures', []); },
  };
}
