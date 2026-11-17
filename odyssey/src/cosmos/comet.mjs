// Tonight's comet, crossing the sky: a bright head and a tail streaming behind it,
// gliding in from the dark toward the star it carries, then fading as it reaches it
// and coming round again. Catching it (a click, a tap) reveals the film.
import { h } from '../ui/dom.mjs';

const CROSSING = 64;   // seconds for one pass
const REACH = 620;     // how far out it comes in from, in the sky's units
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/**
 * @param {{ root: HTMLElement, cosmos: object, reducedMotion?: boolean, room?: () => boolean, onCatch?: () => void }} options
 *   room: asked every frame, whether the sky has room for it now (nothing else holds the eye)
 */
export function createComet({ root, cosmos, reducedMotion = false, room = () => true, onCatch }) {
  const tail = h('span.comet-tail');
  const head = h('span.comet-head');
  const element = h('button.comet', {
    type: 'button', tabindex: '-1',
    'aria-label': 'Tonight\'s comet. Catch it to see the film it carries.',
    title: 'Tonight\'s comet: catch it to see the film it carries',
    onclick: () => onCatch?.(),
  }, tail, head);
  const layer = h('div.comet-layer', { 'aria-hidden': 'false' }, element);
  root.append(layer);

  let comet = null;   // { star, path: { from, bend } }
  let shown = false;
  let age = Math.random() * CROSSING * 0.4; // a visitor arrives somewhere along its pass
  const a = {};
  const b = {};

  /** Where it is at t (0 coming in, 1 at the star): a curve from far out to just past the star. */
  function at(t, centre, out) {
    const { from, bend } = comet.path;
    const u = 1 - t;
    for (let k = 0; k < 3; k += 1) {
      const start = centre[k] + from[k] * REACH;
      const control = centre[k] + from[k] * REACH * 0.45 + bend[k] * REACH * 0.38;
      const end = centre[k] - from[k] * REACH * 0.04;
      out[k] = u * u * start + 2 * u * t * control + t * t * end;
    }
    return out;
  }

  function show(on) {
    if (on === shown) return;
    shown = on;
    element.classList.toggle('on', on);
    element.tabIndex = on ? 0 : -1;
  }

  const middle = [0, 0, 0];
  const p0 = [0, 0, 0];
  const p1 = [0, 0, 0];
  function update(view, clock, dt) {
    if (!comet || !view || cosmos.transitioning || !room()) { show(false); return; }
    if (!reducedMotion) age = (age + dt) % CROSSING;
    const t = reducedMotion ? 0.62 : age / CROSSING;
    const centre = cosmos.positionOf(comet.star, middle);
    const here = cosmos.projectPoint(...at(t, centre, p0), a);
    const behind = cosmos.projectPoint(...at(Math.max(0, t - 0.07), centre, p1), b);
    if (!here || !behind) { show(false); return; }
    const { width, height } = cosmos.size;
    if (here.x < -60 || here.x > width + 60 || here.y < -60 || here.y > height + 60) { show(false); return; }
    // The tail streams back along the way it came, longer the nearer it is.
    const dx = behind.x - here.x;
    const dy = behind.y - here.y;
    const length = clamp(Math.hypot(dx, dy) * 2.2, 64, 230);
    const angle = Math.atan2(dy, dx);
    const scale = clamp(900 / here.depth, 0.7, 1.35);
    // It fades in far out, and out as it reaches its star.
    const fade = reducedMotion ? 1 : clamp(t / 0.08, 0, 1) * clamp((1 - t) / 0.1, 0, 1);
    element.style.transform = `translate3d(${here.x.toFixed(1)}px, ${here.y.toFixed(1)}px, 0) rotate(${angle.toFixed(3)}rad) scale(${scale.toFixed(3)})`;
    element.style.setProperty('--tail', `${length.toFixed(0)}px`);
    element.style.opacity = fade.toFixed(3);
    show(fade > 0.04);
  }
  const off = cosmos.onFrame(update);

  return {
    /** The comet to fly, { star, path }, or null for none. */
    set(next) {
      comet = next && next.star >= 0 ? next : null;
      if (!comet) show(false);
    },
    /** A flash as it is caught. */
    flare() {
      element.classList.remove('caught');
      void element.offsetWidth;
      element.classList.add('caught');
    },
    get shown() { return shown; },
    /** Where it is now in the sky, and where its star is: { at, star }, or null with no comet. */
    where() {
      if (!comet) return null;
      const star = cosmos.positionOf(comet.star, [0, 0, 0]);
      return { at: at(reducedMotion ? 0.62 : age / CROSSING, star, [0, 0, 0]), star };
    },
    stop() { off(); layer.remove(); },
  };
}
