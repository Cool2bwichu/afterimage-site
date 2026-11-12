// A star system. Arrive at a film and the films nearest it circle it on six
// rings, one under each light, the strongest innermost: what is near this, and
// in which way, at a glance. Close in, the system is what you see; draw back and
// it folds away into the sky, where the same films sit at the ends of the rays.
import { lightById } from '../engine/lights.mjs';
import { h } from '../ui/dom.mjs';
import { poster } from '../ui/posters.mjs';
import { clamp } from './math.mjs';

const NS = 'http://www.w3.org/2000/svg';
const TILT = 0.78; // the rings are seen a little from above
const easeOut = t => 1 - (1 - t) ** 3;

export function createOrbits({ root, cosmos, universe, small = false, reducedMotion = false, onStar, onHover, onMode }) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'orbit-rings');
  svg.setAttribute('aria-hidden', 'true');
  const names = h('div.orbit-names', { 'aria-hidden': 'true' });
  const moons = h('div.orbit-moons', { role: 'group', 'aria-label': 'Films nearest this one, one ring for each light' });
  const layer = h('div.orbits', svg, names, moons);
  root.append(layer);

  // Close in the system shows; past `out` it has folded away.
  const IN = small ? 150 : 205;
  const OUT = small ? 250 : 330;
  const scratch = {};
  let system = null; // { star, rings: [...], arrivedAt }
  let alpha = 0;
  let active = false;
  let doors = new Set();

  function build(star, rings) {
    svg.replaceChildren();
    names.replaceChildren();
    moons.replaceChildren();
    return rings.map((ring, k) => {
      const light = lightById(ring.light);
      const ellipse = document.createElementNS(NS, 'ellipse');
      ellipse.setAttribute('class', 'orbit-ring');
      ellipse.style.setProperty('--c', light.color);
      svg.append(ellipse);
      const name = h('span.orbit-name', { style: { '--c': light.color } }, light.name);
      names.append(name);
      const per = ring.stars.length;
      const sats = ring.stars.map((other, n) => {
        const film = universe.films[other];
        const element = h('button.orbit-moon', {
          type: 'button', tabindex: '-1', style: { '--c': light.color, '--hi': film.hi, '--lo': film.lo },
          title: `${film.t} (${film.y}) · nearest by ${light.name.toLowerCase()}`,
          'aria-label': `${film.t}, ${film.y}: near by ${light.name.toLowerCase()}`,
          onclick: event => { event.stopPropagation(); onStar?.(other, ring.light); },
          onpointerenter: () => onHover?.(other), onpointerleave: () => onHover?.(-1),
        }, poster(film, { words: false }), h('span.orbit-moon-title', film.t));
        moons.append(element);
        // Spread around the ring, each ring turned a little from the last so no two line up.
        return { star: other, element, angle: (n / per) * Math.PI * 2 + k * 0.83 + 0.4 };
      });
      return { ...ring, ellipse, name, sats, speed: reducedMotion ? 0 : 0.05 / (1 + 0.38 * k) };
    });
  }

  function setSystem(star, rings = []) {
    if (star < 0 || !rings.length) {
      system = null;
      return;
    }
    if (system && system.star === star && sameRings(system.rings, rings)) return;
    const again = system && system.star === star;
    system = { star, rings: build(star, rings), arrivedAt: again ? system.arrivedAt : -1, unfold: again ? 1 : 0 };
    markDoors();
  }

  const sameRings = (a, b) => a.length === b.length && a.every((ring, k) => ring.light === b[k].light && ring.stars.join() === b[k].stars.join());

  function markDoors() {
    if (!system) return;
    for (const ring of system.rings) for (const sat of ring.sats) sat.element.classList.toggle('door', doors.has(sat.star));
  }

  function frame(view, clock, dt) {
    const camera = cosmos.camera;
    let goal = 0;
    let p = null;
    if (system && view) {
      p = cosmos.project(system.star, scratch);
      if (p) goal = clamp((OUT - view.distance) / (OUT - IN), 0, 1);
      // A system unfolds once you have arrived, not while flying in.
      if (system.arrivedAt < 0 && !camera.flying) system.arrivedAt = clock;
      if (system.arrivedAt < 0) goal = 0;
    }
    alpha += (goal - alpha) * (1 - Math.exp(-dt * (goal > alpha ? 5 : 9)));
    if (alpha < 0.01) alpha = 0;
    const nowActive = Boolean(system) && goal > 0.5;
    if (nowActive !== active) { active = nowActive; onMode?.(active); }
    layer.classList.toggle('on', alpha > 0);
    if (!system || !p || alpha === 0) return;

    const scale = clamp(150 / view.distance, 0.72, 1.4);
    const r0 = (small ? 74 : 128) * scale;
    const step = (small ? 19 : 38) * scale;
    const since = clock - system.arrivedAt;
    system.rings.forEach((ring, k) => {
      const grown = reducedMotion ? 1 : easeOut(clamp((since - k * 0.09) / 0.95, 0, 1));
      const rx = (r0 + k * step) * (0.6 + 0.4 * grown);
      const ry = rx * TILT;
      const shown = alpha * grown;
      ring.ellipse.setAttribute('cx', p.x.toFixed(1));
      ring.ellipse.setAttribute('cy', p.y.toFixed(1));
      ring.ellipse.setAttribute('rx', rx.toFixed(1));
      ring.ellipse.setAttribute('ry', ry.toFixed(1));
      ring.ellipse.style.opacity = shown.toFixed(3);
      // The light's name rides the top of its ring, a little to the right.
      const nameAngle = -Math.PI / 2 + 0.75;
      ring.name.style.transform = `translate3d(${(p.x + Math.cos(nameAngle) * rx).toFixed(1)}px, ${(p.y + Math.sin(nameAngle) * ry).toFixed(1)}px, 0) translate(-50%, -50%)`;
      ring.name.style.opacity = (shown * (small ? 0 : 0.9)).toFixed(3);
      for (const sat of ring.sats) {
        const angle = sat.angle + clock * ring.speed;
        const x = p.x + Math.cos(angle) * rx;
        const y = p.y + Math.sin(angle) * ry;
        const front = (Math.sin(angle) + 1) / 2; // 0 behind the star, 1 in front of it
        const size = (0.8 + 0.2 * front) * scale;
        sat.element.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${size.toFixed(3)})`;
        sat.element.style.opacity = (shown * (0.62 + 0.38 * front)).toFixed(3);
        sat.element.style.zIndex = String(100 + Math.round(front * 100));
      }
    });
  }

  const off = cosmos.onFrame(frame);
  return {
    setSystem,
    /** The films behind the doors of a voyage wear a ring of their own. */
    setDoors(list) { doors = new Set(list); markDoors(); },
    get active() { return active; },
    stop() { off(); layer.remove(); },
  };
}
