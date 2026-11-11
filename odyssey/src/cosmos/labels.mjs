// Words and faces over the cosmos. Far out, the galaxies carry their names.
// Nearer, the arms of a galaxy are named. Close in, the stars show their
// posters: each film backlit by its own star.
import { UNLIT } from '../engine/universe.mjs';
import { h } from '../ui/dom.mjs';
import { poster } from '../ui/posters.mjs';
import { clamp } from './math.mjs';

const CARD_W = 64;
const CARD_H = 95;
const SELECT_EVERY = 0.16; // seconds between choosing which stars are named

export function createLabels({ root, cosmos, universe, small = false, onStar, onGalaxy, onArm }) {
  const galaxyLayer = h('div.lbl-layer.lbl-galaxies');
  const armLayer = h('div.lbl-layer.lbl-arms');
  const starLayer = h('div.lbl-layer.lbl-stars');
  root.append(galaxyLayer, armLayer, starLayer);

  let sky = cosmos.sky;
  let galaxies = [];
  let arms = [];
  let hidden = false;
  let sinceSelect = 1;
  const context = { focus: -1, hover: -1, rays: new Map(), highlight: null, loved: new Set(), lit: null };
  const insets = { left: 0, right: 0, bottom: 0 }; // the parts of the sky that panels cover
  const fixed = [];  // boxes of the galaxy and arm names now showing: star names keep clear of them
  const shown = new Map(); // star → { element, kind, rank }
  const leaving = new Set();
  const scratch = {};

  function buildSky() {
    sky = cosmos.sky;
    galaxyLayer.replaceChildren();
    armLayer.replaceChildren();
    galaxies = (universe.galaxies[sky] || []).map(galaxy => {
      const element = h('button.lbl-galaxy', { type: 'button', tabindex: '-1', onclick: () => onGalaxy?.(galaxy.g) },
        h('span.lbl-galaxy-name', galaxy.name),
        h('span.lbl-galaxy-count', `${galaxy.size} films`));
      galaxyLayer.append(element);
      return { galaxy, element, visible: false };
    }).sort((a, b) => b.galaxy.size - a.galaxy.size); // where two names would cross, the larger galaxy keeps its
    arms = [];
    for (const galaxy of universe.galaxies[sky] || []) {
      for (const arm of galaxy.arms || []) {
        const element = h('button.lbl-arm', { type: 'button', tabindex: '-1', onclick: () => onArm?.(galaxy.g, arm.arm) }, arm.name);
        armLayer.append(element);
        arms.push({ galaxy, arm, element, visible: false, wide: arm.name.length * 8.4 + 18 });
      }
    }
    // Where two names would cross, the larger arm keeps its name.
    arms.sort((a, b) => b.arm.size - a.arm.size);
  }

  const crosses = (boxes, l, t, r, b) => { for (const box of boxes) if (l < box[2] && r > box[0] && t < box[3] && b > box[1]) return true; return false; };

  const place = (element, x, y, scale = 1) => { element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`; };
  // A card grows and shrinks with its distance; the words under it stay one size.
  const steady = (entry, scale) => {
    const inverse = Math.round(1000 / scale) / 1000;
    if (entry.inverse !== inverse) { entry.inverse = inverse; entry.element.style.setProperty('--steady', String(inverse)); }
  };

  function show(entry, on, opacity = 1) {
    if (on !== entry.visible) { entry.visible = on; entry.element.classList.toggle('on', on); }
    if (on) entry.element.style.opacity = opacity.toFixed(3);
    else entry.element.style.opacity = '';
  }

  function updateGalaxies(view) {
    const moving = cosmos.transitioning || sky !== cosmos.sky;
    const { width, height } = cosmos.size;
    const left = insets.left;
    const right = width - insets.right;
    const floor = height - insets.bottom;
    fixed.length = 0;
    for (const entry of galaxies) {
      const { galaxy, element } = entry;
      const p = moving || hidden ? null : cosmos.projectPoint(galaxy.centre[0], galaxy.centre[1], galaxy.centre[2], scratch);
      if (!p) { show(entry, false); continue; }
      const radiusPx = (galaxy.radius * view.focal) / p.depth;
      // A galaxy's name is for seeing it whole: it fades as you enter.
      const opacity = clamp((radiusPx - 26) / 30, 0, 1) * clamp((height * 0.62 - radiusPx) / (height * 0.2), 0, 1);
      const scale = clamp(radiusPx / 150, 0.62, 1.5);
      const y = p.y + radiusPx * 0.74 + 8;
      if (opacity <= 0.02 || p.x < left - 40 || p.x > right + 40 || y < -40 || y > floor + 30) { show(entry, false); continue; }
      const wide = (galaxy.name.length * 11.5 + 30) * scale;
      const box = [p.x - wide / 2, y - 27 * scale, p.x + wide / 2, y + 27 * scale];
      if (crosses(fixed, ...box)) { show(entry, false); continue; }
      fixed.push(box);
      place(element, p.x, y, scale);
      show(entry, true, opacity);
    }
    for (const entry of arms) {
      const { galaxy, arm, element } = entry;
      const p = moving || hidden ? null : cosmos.projectPoint(arm.at[0], arm.at[1], arm.at[2], scratch);
      if (!p) { show(entry, false); continue; }
      const radiusPx = (galaxy.radius * view.focal) / p.depth;
      const opacity = clamp((radiusPx - height * 0.26) / (height * 0.12), 0, 1) * clamp((height * 2.6 - radiusPx) / (height * 0.8), 0, 1);
      const y = p.y - 26;
      if (opacity <= 0.02 || p.x < left - 20 || p.x > right + 20 || y < 56 || y > floor - 10) { show(entry, false); continue; }
      const box = [p.x - entry.wide / 2, y - 10, p.x + entry.wide / 2, y + 10];
      if (crosses(fixed, ...box)) { show(entry, false); continue; }
      fixed.push(box);
      place(element, p.x, y);
      show(entry, true, opacity * 0.78);
    }
  }

  // ── Stars: which are named, and how.
  function makeLabel(star, kind) {
    const film = universe.films[star];
    const deep = universe.isDeep(star);
    let element;
    if (kind === 'card') {
      element = h('button.lbl-card', { type: 'button', tabindex: '-1', 'aria-label': `${film.t}, ${film.y}`, style: { '--hi': film.hi, '--lo': film.lo } },
        poster(film, { eager: true }),
        h('span.lbl-card-title', film.t));
    } else {
      element = h('button.lbl-star', { type: 'button', tabindex: '-1' }, h('span.lbl-star-title', film.t), h('span.lbl-star-year', String(film.y)));
    }
    if (deep) element.classList.add('deep');
    element.addEventListener('click', event => { event.stopPropagation(); onStar?.(star); });
    element.addEventListener('pointerenter', () => onHoverLabel(star));
    element.addEventListener('pointerleave', () => onHoverLabel(-1));
    starLayer.append(element);
    requestAnimationFrame(() => element.classList.add('on'));
    return element;
  }

  let hoverFromLabel = -1;
  function onHoverLabel(star) { hoverFromLabel = star; cosmos.setHover(star >= 0 ? star : context.hover); }

  function retire(star) {
    const entry = shown.get(star);
    if (!entry) return;
    shown.delete(star);
    const { element } = entry;
    element.classList.remove('on');
    leaving.add(element);
    setTimeout(() => { leaving.delete(element); element.remove(); }, 320);
  }

  function select(view) {
    const { width, height } = cosmos.size;
    const distance = view.distance;
    const count = cosmos.count;
    const cardMode = !hidden && distance < (small ? 330 : 440);
    const titleMode = !hidden && distance < 1500;
    const budgetCards = cardMode ? (small ? 9 : 24) : 0;
    // Close in, many stars are named; from further out, only the best known.
    const budgetTitles = Math.round((small ? 10 : 30) * (1 - 0.55 * clamp((distance - 300) / 900, 0, 1)));
    const target = cosmos.camera.state;
    const G = universe.galaxyOf[cosmos.sky];
    const m = view.viewProj;
    const candidates = [];
    const moving = cosmos.transitioning;

    for (let i = 0; i < count; i += 1) {
      const special = i === context.focus || i === context.hover || i === hoverFromLabel || context.rays.has(i);
      const lit = context.highlight ? context.highlight.has(i) : false;
      if (!special && !lit && (!titleMode || moving)) continue;
      const pos = cosmos.positionOf(i, scratchPos);
      const w = m[3] * pos[0] + m[7] * pos[1] + m[11] * pos[2] + m[15];
      if (w <= 0.5) continue;
      const x = ((m[0] * pos[0] + m[4] * pos[1] + m[8] * pos[2] + m[12]) / w * 0.5 + 0.5) * width;
      const y = (0.5 - (m[1] * pos[0] + m[5] * pos[1] + m[9] * pos[2] + m[13]) / w * 0.5) * height;
      if (x < insets.left - 24 || x > width - insets.right + 24 || y < -60 || y > height - insets.bottom + 30) continue;
      // The instruments sit along the top and the bottom: only the star you are at is named under them.
      if (i !== context.focus && (y < (cardMode ? 104 : 62) || y > height - insets.bottom - (small ? 70 : 96))) continue;
      const away = Math.hypot(pos[0] - target.x, pos[1] - target.y, pos[2] - target.z) / distance;
      if (!special && !lit && away > 2.4) continue;
      const film = universe.films[i];
      let priority = (film.rn ?? 1) * 0.9 - away * 5 + (context.loved.has(i) ? 1.5 : 0) + (G[i] === UNLIT ? -2 : 0);
      if (context.highlight && !lit && !special) priority -= 30;
      if (lit) priority += 6;
      if (context.rays.has(i)) priority += 100;
      if (i === context.hover || i === hoverFromLabel) priority += 150;
      if (i === context.focus) priority += 1000;
      candidates.push({ star: i, x, y, w, priority, away });
    }
    candidates.sort((a, b) => b.priority - a.priority);

    const placed = fixed.map(box => box);
    const collides = (l, t, r, b) => crosses(placed, l, t, r, b);
    const next = new Map();
    let cards = 0;
    let titles = 0;
    for (const candidate of candidates) {
      if (cards >= budgetCards && titles >= budgetTitles) break;
      const { star, x, y, w } = candidate;
      const special = star === context.focus || context.rays.has(star) || star === context.hover || star === hoverFromLabel;
      const near = candidate.away < 1.7;
      let kind = null;
      if (cards < budgetCards && (near || special)) {
        const scale = cardScale(star, w, distance);
        // A card is its poster with the title beneath, which runs a little wider.
        const half = (Math.max(CARD_W, 92) * scale) / 2;
        const tall = (CARD_H * scale) / 2;
        const box = [x - half - 2, y - tall - 3, x + half + 2, y + tall + 25 * scale];
        if (special || !collides(...box)) { placed.push(box); kind = 'card'; cards += 1; }
      }
      if (!kind && titles < budgetTitles && (titleMode || special || context.highlight)) {
        const film = universe.films[star];
        const tw = Math.min(190, film.t.length * 6.4 + 34);
        const box = [x - tw / 2, y + 6, x + tw / 2, y + 26];
        if (special || !collides(...box)) { placed.push(box); kind = 'title'; titles += 1; }
      }
      if (kind) next.set(star, { kind, rank: next.size });
    }

    for (const star of [...shown.keys()]) {
      const wanted = next.get(star);
      if (!wanted || wanted.kind !== shown.get(star).kind) retire(star);
    }
    for (const [star, wanted] of next) {
      let entry = shown.get(star);
      if (!entry) { entry = { element: makeLabel(star, wanted.kind), kind: wanted.kind }; shown.set(star, entry); }
      entry.element.style.zIndex = String(600 - wanted.rank);
      entry.element.classList.toggle('focus', star === context.focus);
      entry.element.classList.toggle('loved', context.loved.has(star));
      const ray = context.rays.get(star);
      entry.element.classList.toggle('ray', Boolean(ray));
      if (ray) entry.element.style.setProperty('--ray', ray); else entry.element.style.removeProperty('--ray');
    }
  }

  const scratchPos = [0, 0, 0];
  function cardScale(star, depth, distance) {
    const base = clamp(distance / depth, 0.5, 1.3) * clamp(210 / distance, 0.62, 1.12);
    return star === context.focus ? Math.max(base * 1.5, 1.2) : base;
  }

  function updateStars(view) {
    const distance = view.distance;
    for (const [star, entry] of shown) {
      const p = cosmos.project(star, scratch);
      if (!p) { entry.element.style.opacity = '0'; continue; }
      if (entry.kind === 'card') {
        const scale = cardScale(star, p.depth, distance);
        place(entry.element, p.x, p.y, scale);
        steady(entry, scale);
        entry.element.style.opacity = '';
      } else {
        const size = cosmos.sizeAt(star, p.depth);
        place(entry.element, p.x, p.y + clamp(size * 0.16, 7, 26) + 9);
        entry.element.style.opacity = '';
      }
    }
  }

  function update(view, clock, dt) {
    if (sky !== cosmos.sky && !cosmos.transitioning) buildSky();
    updateGalaxies(view);
    sinceSelect += dt;
    if (sinceSelect >= SELECT_EVERY) { sinceSelect = 0; select(view); }
    updateStars(view);
  }

  buildSky();
  const off = cosmos.onFrame(update);

  return {
    /** What the labels should favour: the focused star, the ends of its rays (star → colour), a lit set. */
    setContext(next) { Object.assign(context, next); sinceSelect = 1; },
    /** How much of the sky is covered by panels, in pixels from each edge: nothing is named under them. */
    setInsets(next) { Object.assign(insets, next); sinceSelect = 1; },
    setHidden(value) { hidden = value; root.classList.toggle('hidden', value); sinceSelect = 1; },
    rebuild() { buildSky(); },
    stop() { off(); },
  };
}
