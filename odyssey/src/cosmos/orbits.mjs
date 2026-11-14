// A star system. Arrive at a film and the films nearest it circle it on six
// rings, one under each light, the strongest innermost: what is near this, and
// in which way, at a glance. Close in, the system is what you see; draw back and
// it folds away into the sky, where the same films sit at the ends of the rays.
//
// Each light's name is written along its own ring, in the gap between two of its
// films, and the ring breaks around it the way a contour line breaks around its
// height on a map. Under one light, that light's ring is drawn bright and the
// others step back. Leave a star and its system folds away rather than vanishing.
//
// Beyond the last ring, if the star has one, drifts a wormhole: a round window
// onto a film far across the sky that is yet one of its nearest in one deep thing.
import { lightById } from '../engine/lights.mjs';
import { h } from '../ui/dom.mjs';
import { poster } from '../ui/posters.mjs';
import { clamp } from './math.mjs';

const NS = 'http://www.w3.org/2000/svg';
const TILT = 0.78; // the rings are seen a little from above
const TAU = Math.PI * 2;
const TOP = -Math.PI / 2; // screen y runs down, so the top of a ring is at -90°
const easeOut = t => 1 - (1 - t) ** 3;
const wrap = angle => ((angle % TAU) + TAU) % TAU;
/** How far an angle is from the top of its ring, either way round. */
const fromTop = angle => { const d = wrap(angle - TOP); return d > Math.PI ? TAU - d : d; };

let made = 0; // gives every ring path an id of its own for its name to follow

function svg(tag, attrs = {}) {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  return element;
}

/** Ramanujan's perimeter of an ellipse. */
const perimeter = (a, b) => Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));

/** Distance along a ring, from its leftmost point and clockwise on screen, to the point at `angle`. */
function along(rx, ry, angle) {
  const span = wrap(angle - Math.PI);
  const steps = 16;
  const width = span / steps;
  let sum = 0;
  for (let n = 0; n <= steps; n++) {
    const phi = Math.PI + n * width;
    sum += Math.hypot(rx * Math.sin(phi), ry * Math.cos(phi)) * (n === 0 || n === steps ? 1 : n % 2 ? 4 : 2);
  }
  return (sum * width) / 3;
}

export function createOrbits({ root, cosmos, universe, small = false, reducedMotion = false, insets = { left: 0, right: 0, top: 0, bottom: 0 }, onStar, onHole, onHover, onMode }) {
  const lines = svg('svg', { class: 'orbit-rings', 'aria-hidden': 'true' });
  const moons = h('div.orbit-moons', { role: 'group', 'aria-label': 'The films nearest this one, in rings around it' });
  const words = svg('svg', { class: 'orbit-names', 'aria-hidden': 'true' });
  const layer = h('div.orbits', lines, moons, words);
  root.append(layer);

  // Close in the system shows; past `out` it has folded away.
  const IN = small ? 150 : 205;
  const OUT = small ? 250 : 330;
  const scratch = {};
  let system = null; // the system around the star you are at
  let leaving = []; // systems folding away behind you
  let active = false;
  let lit = null; // the one light the sky is seen by, or null under white light
  let doors = new Set();
  let hovered = -1; // a film pointed at anywhere (its row in a list, its star) shows on its ring too
  let holes = { star: -1, list: [] }; // the wormholes at a star: [{ star, colour, says }]
  const HOLE_ANGLES = [2.25, -0.8]; // where each starts: low on the left, high on the right

  function build(star, rings) {
    const id = ++made;
    const group = svg('g');
    const named = svg('g');
    const box = h('div.orbit-system');
    lines.append(group);
    words.append(named);
    moons.append(box);
    const built = rings.map((ring, k) => {
      // A ring of Lookback (before, after, of its time) carries its own name and colour.
      const light = ring.name ? { name: ring.name, color: ring.color } : lightById(ring.light);
      const says = ring.says || `nearest by ${light.name.toLowerCase()}`;
      const path = svg('path', { class: 'orbit-ring', id: `orbit-ring-${id}-${k}` });
      path.style.setProperty('--c', light.color);
      group.append(path);
      const route = svg('textPath', { href: `#orbit-ring-${id}-${k}` });
      route.textContent = light.name.toUpperCase();
      const name = svg('text', { class: 'orbit-name', 'text-anchor': 'middle' });
      name.style.setProperty('--c', light.color);
      name.append(route);
      named.append(name);
      const per = ring.stars.length;
      // Each ring is turned a little from the last so no two line up.
      const turn = k * 0.83 + 0.4;
      const sats = ring.stars.map((other, n) => {
        const film = universe.films[other];
        const element = h('button.orbit-moon', {
          type: 'button', tabindex: '-1', style: { '--c': light.color, '--hi': film.hi, '--lo': film.lo },
          title: `${film.t} (${film.y}) · ${says}`,
          'aria-label': `${film.t}, ${film.y}: ${says}`,
          onclick: event => { event.stopPropagation(); onStar?.(other, ring.light); },
          onpointerenter: () => onHover?.(other), onpointerleave: () => onHover?.(-1),
        }, poster(film, { words: false }), h('span.orbit-moon-title', film.t));
        box.append(element);
        return { star: other, element, angle: (n / per) * TAU + turn };
      });
      // The name rides halfway between two of the ring's films, so they never cover it.
      const gaps = ring.stars.map((_, n) => turn + ((n + 0.5) / per) * TAU);
      return { ...ring, path, name, route, sats, gaps, gap: -1, fade: 1, width: 0, speed: reducedMotion ? 0 : 0.05 / (1 + 0.38 * k) };
    });
    const sys = { star, rings: built, holes: [], group, named, box, alpha: 0, arrivedAt: -1, shown: true, x: null, y: null };
    markLit(sys);
    markDoors(sys);
    markHover(sys);
    buildHoles(sys);
    show(sys, false);
    return sys;
  }

  /** The wormholes beyond a system's last ring, as the app last said they are. */
  function buildHoles(sys) {
    for (const hole of sys.holes) hole.element.remove();
    const list = holes.star === sys.star ? holes.list : [];
    sys.holes = list.map((hole, n) => {
      const film = universe.films[hole.star];
      const element = h('button.orbit-hole', {
        type: 'button', tabindex: '-1', style: { '--c': hole.colour, '--hi': film.hi, '--lo': film.lo },
        title: `A wormhole to ${film.t} (${film.y}) · ${hole.says}`,
        'aria-label': `A wormhole to ${film.t}, ${film.y}: ${hole.says}`,
        onclick: event => { event.stopPropagation(); onHole?.(n); },
        onpointerenter: () => onHover?.(hole.star), onpointerleave: () => onHover?.(-1),
      }, h('span.orbit-hole-lens', poster(film, { words: false })), h('span.orbit-moon-title', film.t));
      sys.box.append(element);
      return { star: hole.star, element, angle: HOLE_ANGLES[n % HOLE_ANGLES.length] };
    });
    markHover(sys);
  }

  function show(sys, on) {
    if (sys.shown === on) return;
    sys.shown = on;
    const visibility = on ? '' : 'hidden';
    sys.group.style.visibility = visibility;
    sys.named.style.visibility = visibility;
    sys.box.style.visibility = visibility;
  }

  function retire(sys) {
    sys.box.inert = true;
    leaving.push(sys);
  }

  function dispose(sys) {
    sys.group.remove();
    sys.named.remove();
    sys.box.remove();
  }

  function setSystem(star, rings = []) {
    if (star < 0 || !rings.length) {
      if (system) retire(system);
      system = null;
      return;
    }
    if (system && system.star === star && sameRings(system.rings, rings)) return;
    // Back to a system that is still folding away: it opens again where it is.
    const back = leaving.find(sys => sys.star === star && sameRings(sys.rings, rings));
    if (back) {
      leaving = leaving.filter(sys => sys !== back);
      back.box.inert = false;
      if (system) retire(system);
      system = back;
      buildHoles(back);
      return;
    }
    const before = system;
    const next = build(star, rings);
    if (before) {
      // The same star with its rings re-formed (a reading came, a film was set
      // aside, the light changed): the new rings fade in over the old, already grown.
      if (before.star === star) next.arrivedAt = before.arrivedAt;
      retire(before);
    }
    system = next;
  }

  const sameRings = (a, b) => a.length === b.length && a.every((ring, k) => ring.light === b[k].light && ring.stars.join() === b[k].stars.join());

  function markDoors(sys) {
    for (const ring of sys.rings) for (const sat of ring.sats) sat.element.classList.toggle('door', doors.has(sat.star));
  }

  function markHover(sys) {
    for (const ring of sys.rings) for (const sat of ring.sats) sat.element.classList.toggle('hover', sat.star === hovered);
    for (const hole of sys.holes) hole.element.classList.toggle('hover', hole.star === hovered);
  }

  function markLit(sys) {
    for (const ring of sys.rings) {
      const on = lit === ring.light;
      ring.path.classList.toggle('lit', on);
      ring.name.classList.toggle('lit', on);
      ring.width = 0; // a lit name is set larger: measure it again
      for (const sat of ring.sats) sat.element.classList.toggle('lit', on);
    }
  }

  function draw(sys, goal, view, clock, dt) {
    sys.alpha += (goal - sys.alpha) * (1 - Math.exp(-dt * (goal > sys.alpha ? 5 : 9)));
    if (goal === 0 && sys.alpha < 0.01) sys.alpha = 0;
    // Keep the last place the star was seen, should it pass behind the eye.
    const p = view ? cosmos.project(sys.star, scratch) : null;
    if (p) { sys.x = p.x; sys.y = p.y; }
    if (sys.alpha === 0 || sys.x === null || sys.arrivedAt < 0) { show(sys, false); return; }
    show(sys, true);

    // Grown with nearness, and drawn smaller where the sky that panels and
    // instruments leave uncovered (`insets`, kept up to date by the app) is too small for it.
    const near = clamp(150 / view.distance, 0.72, 1.4);
    const { width, height } = cosmos.size;
    const moon = (small ? 22 : 30) * near; // half a film's height, about
    const beyond = sys.holes.length ? 1.4 : 0; // the wormholes drift a ring beyond the last
    const outer = ((small ? 74 : 128) + (sys.rings.length - 1 + beyond) * (small ? 19 : 38)) * near;
    const roomY = Math.min(sys.y - insets.top, height - insets.bottom - sys.y) - moon;
    const roomX = Math.min(sys.x - insets.left, width - insets.right - sys.x) - moon * 0.7;
    const fit = clamp(Math.min(roomY / (outer * TILT), roomX / outer), 0.62, 1);
    const scale = near * fit;
    const r0 = (small ? 74 : 128) * scale;
    const step = (small ? 19 : 38) * scale;
    const since = clock - sys.arrivedAt;
    sys.rings.forEach((ring, k) => {
      const grown = reducedMotion ? 1 : easeOut(clamp((since - k * 0.09) / 0.95, 0, 1));
      const rx = (r0 + k * step) * (0.6 + 0.4 * grown);
      const ry = rx * TILT;
      const shown = sys.alpha * grown;
      const on = lit === ring.light;
      const back = lit !== null && !on; // another light's ring, under one light
      const turned = clock * ring.speed;

      const x0 = (sys.x - rx).toFixed(1);
      const x1 = (sys.x + rx).toFixed(1);
      const y = sys.y.toFixed(1);
      const radii = `${rx.toFixed(1)} ${ry.toFixed(1)}`;
      ring.path.setAttribute('d', `M${x0} ${y}A${radii} 0 1 1 ${x1} ${y}A${radii} 0 1 1 ${x0} ${y}`);
      ring.path.style.opacity = (shown * (back ? 0.4 : 1)).toFixed(3);

      // The name sits in whichever gap is nearest the top of the ring. As the ring
      // turns and another gap comes nearer, the name fades out and back in there.
      let best = ring.gap < 0 ? 0 : ring.gap;
      let nearest = fromTop(ring.gaps[best] + turned);
      ring.gaps.forEach((angle, n) => {
        const d = fromTop(angle + turned);
        if (d < nearest - (ring.gap < 0 ? 0 : 0.12)) { best = n; nearest = d; }
      });
      if (ring.gap < 0) ring.gap = best;
      const settled = best === ring.gap;
      ring.fade += ((settled ? 1 : 0) - ring.fade) * (1 - Math.exp(-dt * 7));
      if (!settled && ring.fade < 0.04) ring.gap = best;
      const angle = ring.gaps[ring.gap] + turned;
      // Written along the top half only, so it always reads upright.
      const upright = clamp((-Math.sin(angle) - 0.3) / 0.35, 0, 1);
      const voiced = (small && !on ? 0 : 1) * ring.fade * upright;
      if (!ring.width && voiced > 0) ring.width = ring.name.getComputedTextLength() || 0;
      const at = along(rx, ry, angle);
      ring.route.setAttribute('startOffset', at.toFixed(1));
      ring.name.style.opacity = (shown * voiced * (on ? 1 : back ? 0.45 : 0.82)).toFixed(3);
      const room = ring.width ? (ring.width + (small ? 8 : 12)) * voiced : 0;
      if (room > 1) {
        const length = perimeter(rx, ry);
        ring.path.style.strokeDasharray = `${(length - room).toFixed(1)} ${room.toFixed(1)}`;
        ring.path.style.strokeDashoffset = ((((length - at - room / 2) % length) + length) % length).toFixed(1);
      } else {
        ring.path.style.strokeDasharray = '';
        ring.path.style.strokeDashoffset = '';
      }

      for (const sat of ring.sats) {
        const a = sat.angle + turned;
        const x = sys.x + Math.cos(a) * rx;
        const yy = sys.y + Math.sin(a) * ry;
        const front = (Math.sin(a) + 1) / 2; // 0 behind the star, 1 in front of it
        const size = (0.8 + 0.2 * front) * scale * (on ? 1.08 : 1);
        sat.element.style.transform = `translate3d(${x.toFixed(1)}px, ${yy.toFixed(1)}px, 0) translate(-50%, -50%) scale(${size.toFixed(3)})`;
        sat.element.style.opacity = (shown * (0.62 + 0.38 * front) * (back ? 0.55 : 1)).toFixed(3);
        sat.element.style.zIndex = String(sat.star === hovered ? 260 : 100 + Math.round(front * 100));
      }
    });

    // The wormholes come last, out of the dark beyond the rings, and drift slowly round.
    const far = r0 + (sys.rings.length - 1 + 1.4) * step;
    sys.holes.forEach((hole, n) => {
      const grown = reducedMotion ? 1 : easeOut(clamp((since - 0.7 - n * 0.25) / 1.3, 0, 1));
      const a = hole.angle + (reducedMotion ? 0 : clock * 0.014);
      const reach = far * (0.75 + 0.25 * grown);
      const x = sys.x + Math.cos(a) * reach;
      const yy = sys.y + Math.sin(a) * reach * TILT;
      const front = (Math.sin(a) + 1) / 2;
      const size = (0.86 + 0.14 * front) * scale * (0.6 + 0.4 * grown);
      hole.element.style.transform = `translate3d(${x.toFixed(1)}px, ${yy.toFixed(1)}px, 0) translate(-50%, -50%) scale(${size.toFixed(3)})`;
      hole.element.style.opacity = (sys.alpha * grown * (0.72 + 0.28 * front)).toFixed(3);
      hole.element.style.zIndex = String(hole.star === hovered ? 260 : 100 + Math.round(front * 100));
    });
  }

  function frame(view, clock, dt) {
    if ((cosmos.hover ?? -1) !== hovered) {
      hovered = cosmos.hover ?? -1;
      if (system) markHover(system);
    }
    let goal = 0;
    if (system && view) {
      // A system unfolds once you have arrived, not while flying in.
      if (system.arrivedAt < 0 && !cosmos.camera.flying) system.arrivedAt = clock;
      if (system.arrivedAt >= 0 && cosmos.project(system.star, scratch)) goal = clamp((OUT - view.distance) / (OUT - IN), 0, 1);
    }
    const nowActive = Boolean(system) && goal > 0.5;
    if (nowActive !== active) { active = nowActive; onMode?.(active); }
    if (system) draw(system, goal, view, clock, dt);
    for (const sys of leaving) draw(sys, 0, view, clock, dt);
    leaving = leaving.filter(sys => {
      if (sys.alpha > 0) return true;
      dispose(sys);
      return false;
    });
    layer.classList.toggle('on', Boolean(system?.shown) || leaving.length > 0);
  }

  // Fonts may arrive after a system was built: measure the names again then.
  document.fonts?.ready?.then(() => {
    for (const sys of [system, ...leaving]) if (sys) for (const ring of sys.rings) ring.width = 0;
  });

  const off = cosmos.onFrame(frame);
  return {
    setSystem,
    /** The wormholes at a star: [{ star, colour, says }], drifting beyond its last ring. */
    setHoles(star, list) {
      const same = holes.star === star && holes.list.length === list.length && holes.list.every((hole, n) => hole.star === list[n].star);
      holes = { star, list };
      if (!same && system && system.star === star) buildHoles(system);
    },
    /** The films behind the doors of a voyage wear a ring of their own. */
    setDoors(list) {
      doors = new Set(list);
      if (system) markDoors(system);
    },
    /** Under one light its ring leads; under white light every ring is equal. */
    setLight(light) {
      const next = light && light !== 'white' ? light : null;
      if (next === lit) return;
      lit = next;
      for (const sys of [system, ...leaving]) if (sys) markLit(sys);
    },
    get active() { return active; },
    stop() { off(); layer.remove(); },
  };
}
