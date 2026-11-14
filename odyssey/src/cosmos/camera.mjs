// The camera: it orbits a point in the universe, and it flies. A flight pulls
// back as it goes and closes in as it arrives, so a long passage is felt as
// distance covered and a short one as a step.
//
// Hands move it the way a map is moved: whatever a finger takes hold of stays
// under that finger, two fingers bring it nearer or turn it about the point
// between them, and a flick glides on and slows to a stop.
import { perspective, lookAt, multiply, clamp, lerp, easeInOut, angleDelta } from './math.mjs';

export const FOV = (46 * Math.PI) / 180;
const MIN_DISTANCE = 26;
const MAX_DISTANCE = 7600;
const MIN_PITCH = 0.06;
const MAX_PITCH = 1.5;
const MIN_DIP = 0.2;   // a ray toward the horizon is taken as falling at least this steeply, so it still meets the sky
const GLIDE = 3.4;     // how quickly a glide slows: it carries on for 1/GLIDE of a second's worth of its speed
const GLIDE_MOST = 2600; // pixels a second: the fastest a flick can send the sky

/**
 * How far along its path a flight has moved its target, for each step of its
 * zoom. The ground covered at any moment is in proportion to how much is in
 * view, so a descent crosses the sky while it is still high and an ascent
 * rises before it travels: where you are going stays in sight all the way.
 */
function panTable(from, to, lift) {
  const steps = 48;
  const table = new Float32Array(steps + 1);
  const a = Math.log(from);
  const b = Math.log(to);
  let sum = 0;
  let before = from;
  for (let n = 1; n <= steps; n += 1) {
    const e = n / steps;
    const now = Math.exp(lerp(a, b, e)) * (1 + lift * Math.sin(Math.PI * e));
    sum += (before + now) / 2;
    table[n] = sum;
    before = now;
  }
  for (let n = 1; n <= steps; n += 1) table[n] /= sum;
  return table;
}

function panAt(table, e) {
  const f = clamp(e, 0, 1) * (table.length - 1);
  const n = Math.min(table.length - 2, Math.floor(f));
  return lerp(table[n], table[n + 1], f - n);
}

export function createCamera({ reducedMotion = false } = {}) {
  const state = { x: 0, y: 0, z: 0, distance: 4300, yaw: 0.5, pitch: 0.98, cx: 0, cy: 0, bias: 0 };
  const goal = { ...state };
  let flight = null;
  let follow = null; // () => [x, y, z] | null: a point the target stays locked to
  let drift = 0.012; // radians per second of slow turning while nothing else moves
  let idle = 0;
  let held = false;  // a hand is on the sky: the view goes exactly where it is moved, with nothing easing behind
  let glide = null;  // { vx, vy, x, y }: a flick carrying on, in pixels a second, from the point it was let go
  let bounds = Infinity; // how far from the middle of the universe the hands may take the target
  const listeners = new Set();

  const view = new Float32Array(16);
  const proj = new Float32Array(16);
  const viewProj = new Float32Array(16);
  const eye = [0, 0, 0];
  const basis = { right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, -1] };
  let focal = 1;
  let width = 1;
  let height = 1;

  const aim = [0, 0, 0];
  // Seen from above at a slant, the near half of the sky looms and the far half shrinks. A bias
  // draws the whole camera back toward the viewer, so a wide view sits evenly in the frame.
  function eyeOf(s, out = eye, at = aim) {
    const cp = Math.cos(s.pitch);
    const back = s.bias * s.distance * clamp((s.distance - 500) / 1500, 0, 1); // only when far out
    at[0] = s.x + back * Math.sin(s.yaw);
    at[1] = s.y;
    at[2] = s.z + back * Math.cos(s.yaw);
    out[0] = at[0] + s.distance * cp * Math.sin(s.yaw);
    out[1] = at[1] + s.distance * Math.sin(s.pitch);
    out[2] = at[2] + s.distance * cp * Math.cos(s.yaw);
    return out;
  }

  // ── Where a point on screen lies on the sky: the plane of the galaxies, at the target's height.
  const groundView = new Float32Array(16);
  const groundEye = [0, 0, 0];
  const groundAim = [0, 0, 0];
  const UP = [0, 1, 0];
  /**
   * The point of the sky under a pixel (x, y), seen as the camera will be once it has
   * caught up with every move asked of it. Toward the horizon the ray is taken as still
   * falling a little, so a point there is far off but never nowhere.
   */
  function groundAt(x, y, out = [0, 0, 0], s = goal) {
    eyeOf(s, groundEye, groundAim);
    lookAt(groundView, groundEye, groundAim, UP);
    const v = groundView;
    const t = Math.tan(FOV / 2);
    // The target is drawn at (cx, cy), in clip units: a pixel is read from there.
    const sx = ((x / width) * 2 - 1 - state.cx) * t * (width / height);
    const sy = (1 - (y / height) * 2 - state.cy) * t;
    let dx = v[0] * sx + v[1] * sy - v[2];
    let dy = v[4] * sx + v[5] * sy - v[6];
    let dz = v[8] * sx + v[9] * sy - v[10];
    const length = Math.hypot(dx, dy, dz) || 1;
    dx /= length; dy /= length; dz /= length;
    if (dy > -MIN_DIP) {
      const level = Math.hypot(dx, dz) || 1;
      const k = Math.sqrt(1 - MIN_DIP * MIN_DIP) / level;
      dx *= k; dz *= k; dy = -MIN_DIP;
    }
    const along = (s.y - groundEye[1]) / dy;
    out[0] = groundEye[0] + dx * along;
    out[1] = s.y;
    out[2] = groundEye[2] + dz * along;
    return out;
  }
  /** Where the target is drawn, in pixels. */
  const targetOnScreen = () => [((state.cx + 1) / 2) * width, ((1 - state.cy) / 2) * height];

  function settle() {
    goal.distance = clamp(goal.distance, MIN_DISTANCE, MAX_DISTANCE);
    goal.pitch = clamp(goal.pitch, MIN_PITCH, MAX_PITCH);
  }

  /**
   * Flies to a new view. Any field left out keeps its present goal.
   * @param {{ target?: number[], distance?: number, yaw?: number, pitch?: number, duration?: number, swoop?: number, lift?: number, follow?: Function }} to
   *   swoop: a turn added on the way; lift: how far to pull back mid-flight (worked out from the journey when left out);
   *   follow: a moving point to arrive at and stay with; hold: stay on that point throughout
   */
  function flyTo(to = {}) {
    const from = { ...state };
    const end = {
      x: to.target ? to.target[0] : goal.x,
      y: to.target ? to.target[1] : goal.y,
      z: to.target ? to.target[2] : goal.z,
      distance: clamp(to.distance ?? goal.distance, MIN_DISTANCE, MAX_DISTANCE),
      yaw: to.yaw ?? goal.yaw + (to.swoop ?? 0),
      pitch: clamp(to.pitch ?? goal.pitch, MIN_PITCH, MAX_PITCH),
    };
    const travel = Math.hypot(end.x - from.x, end.y - from.y, end.z - from.z);
    const span = from.distance + end.distance;
    const duration = reducedMotion ? 0.001 : (to.duration ?? clamp(1.05 + travel / 1100 + Math.abs(Math.log(end.distance / from.distance)) * 0.28, 1.1, 3.4));
    Object.assign(goal, end, { cx: goal.cx, cy: goal.cy, bias: goal.bias });
    // How far the camera pulls back mid-flight: nothing for a step, a wide arc for a crossing.
    const lift = to.lift ?? clamp((travel / Math.max(span, 1)) * 0.55 - 0.08, 0, 1.6);
    flight = {
      from, end, duration, elapsed: 0, lift,
      pan: panTable(from.distance, end.distance, lift),
      yawDelta: angleDelta(from.yaw, end.yaw),
      hold: Boolean(to.hold && to.follow), // stay on the followed point all the way, wherever it goes
    };
    follow = to.follow || null;
    glide = null;
    idle = 0;
    return duration;
  }

  /** Moves at once, with no flight. */
  function jumpTo(to = {}) {
    if (to.target) { goal.x = to.target[0]; goal.y = to.target[1]; goal.z = to.target[2]; }
    if (to.distance !== undefined) goal.distance = to.distance;
    if (to.yaw !== undefined) goal.yaw = to.yaw;
    if (to.pitch !== undefined) goal.pitch = to.pitch;
    if (to.bias !== undefined) goal.bias = to.bias;
    settle();
    Object.assign(state, goal);
    flight = null;
    glide = null;
  }

  /** Where the target sits on screen, in clip units (-1..1). Eased. */
  function setCentre(cx, cy) { goal.cx = cx; goal.cy = cy; }

  /** How far the camera stands back toward the viewer, as a share of its distance. Eased. */
  function setBias(value) { goal.bias = value; }

  function setFollow(source) {
    follow = source;
    if (source) glide = null;
  }

  function update(dt) {
    idle += dt;
    const locked = follow ? follow() : null;
    if (flight) {
      flight.elapsed += dt;
      const t = clamp(flight.elapsed / flight.duration, 0, 1);
      const e = easeInOut(t);
      const { from, end } = flight;
      const tx = locked ? locked[0] : end.x;
      const ty = locked ? locked[1] : end.y;
      const tz = locked ? locked[2] : end.z;
      const along = flight.hold ? 1 : panAt(flight.pan, e);
      state.x = lerp(from.x, tx, along);
      state.y = lerp(from.y, ty, along);
      state.z = lerp(from.z, tz, along);
      state.distance = Math.exp(lerp(Math.log(from.distance), Math.log(end.distance), e)) * (1 + flight.lift * Math.sin(Math.PI * e));
      state.yaw = from.yaw + flight.yawDelta * e;
      state.pitch = lerp(from.pitch, end.pitch, e);
      if (t >= 1) {
        flight = null;
        goal.x = tx; goal.y = ty; goal.z = tz;
        goal.yaw = state.yaw;
        for (const listener of listeners) listener('arrived');
      }
    } else {
      if (locked) { goal.x = locked[0]; goal.y = locked[1]; goal.z = locked[2]; }
      if (glide && !held && dt > 0) {
        // A flick carries on from where it was let go, slowing as it goes.
        const fade = Math.exp(-dt * GLIDE);
        const share = (1 - fade) / GLIDE;
        across(glide.x, glide.y, glide.x + glide.vx * share, glide.y + glide.vy * share);
        glide.vx *= fade;
        glide.vy *= fade;
        if (Math.hypot(glide.vx, glide.vy) < 14) glide = null;
        idle = 0;
      }
      if (!reducedMotion && drift && idle > 2.5) goal.yaw += drift * dt * clamp((idle - 2.5) / 3, 0, 1);
      // A hand on the sky is followed exactly; anything else is eased toward.
      const k = held ? 1 : 1 - Math.exp(-dt * 9);
      state.x = lerp(state.x, goal.x, locked ? 1 : k);
      state.y = lerp(state.y, goal.y, locked ? 1 : k);
      state.z = lerp(state.z, goal.z, locked ? 1 : k);
      state.distance = k === 1 || state.distance === goal.distance ? goal.distance : Math.exp(lerp(Math.log(state.distance), Math.log(goal.distance), k));
      state.yaw = lerp(state.yaw, goal.yaw, k);
      state.pitch = lerp(state.pitch, goal.pitch, k);
    }
    const kc = 1 - Math.exp(-dt * 5);
    state.cx = lerp(state.cx, goal.cx, kc);
    state.cy = lerp(state.cy, goal.cy, kc);
    state.bias = lerp(state.bias, goal.bias, 1 - Math.exp(-dt * 2.2));
  }

  function resize(w, h) { width = Math.max(1, w); height = Math.max(1, h); }

  /** Rebuilds the matrices from the present state. Call once a frame. */
  function frame() {
    eyeOf(state, eye);
    const far = Math.max(state.distance * 6, 24000);
    perspective(proj, FOV, width / height, Math.max(0.5, state.distance * 0.02), far, state.cx, state.cy);
    lookAt(view, eye, aim, [0, 1, 0]);
    multiply(viewProj, proj, view);
    basis.right[0] = view[0]; basis.right[1] = view[4]; basis.right[2] = view[8];
    basis.up[0] = view[1]; basis.up[1] = view[5]; basis.up[2] = view[9];
    basis.forward[0] = -view[2]; basis.forward[1] = -view[6]; basis.forward[2] = -view[10];
    focal = height / (2 * Math.tan(FOV / 2));
    return { view, proj, viewProj, eye, basis, focal, width, height, distance: state.distance, cx: state.cx, cy: state.cy };
  }

  // ── What a hand does to it.
  /** Turns the sky about its target, and tilts it. */
  function orbit(dx, dy) {
    cancelFlight();
    goal.yaw -= dx * 0.0052;
    goal.pitch += dy * 0.0042;
    settle();
  }

  const before = [0, 0, 0];
  const after = [0, 0, 0];
  /** Moves the target across the sky, but no further from the middle than the edges allow. */
  function shift(dx, dz) {
    const was = Math.hypot(goal.x, goal.z);
    goal.x += dx;
    goal.z += dz;
    const now = Math.hypot(goal.x, goal.z);
    const limit = Math.max(bounds, was); // already beyond the edge: it may come back in, not go further out
    if (now > limit) { goal.x *= limit / now; goal.z *= limit / now; }
  }
  function across(x0, y0, x1, y1) {
    groundAt(x0, y0, before);
    groundAt(x1, y1, after);
    shift(before[0] - after[0], before[2] - after[2]);
  }

  /** Moves across the sky so that the point under one pixel comes to lie under another. */
  function drag(x0, y0, x1, y1) {
    cancelFlight();
    follow = null;
    across(x0, y0, x1, y1);
    for (const listener of listeners) listener('panned');
  }

  /** Moves across the sky by a step, in pixels, about where the target is drawn. */
  function pan(dx, dy) {
    const [x, y] = targetOnScreen();
    drag(x, y, x + dx, y + dy);
  }

  /**
   * Does something to the view while keeping the point of the sky under a pixel where it is
   * drawn. At a star the camera keeps to the star instead, so it stays the centre of it all.
   */
  function about(atX, atY, change) {
    const anchored = atX !== null && atY !== null && !follow;
    if (anchored) groundAt(atX, atY, before);
    change();
    if (anchored) {
      const x = before[0];
      const z = before[2];
      groundAt(atX, atY, after);
      shift(x - after[0], z - after[2]);
    }
  }

  /** Nearer (a factor below 1) or further, about a point on screen in pixels, or about the target. */
  function zoom(factor, atX = null, atY = null) {
    cancelFlight();
    about(atX, atY, () => { goal.distance = clamp(goal.distance * factor, MIN_DISTANCE, MAX_DISTANCE); });
    for (const listener of listeners) listener('zoomed');
  }

  /** Turns the sky by an angle (clockwise on screen), about a point on screen in pixels, or about the target. */
  function turn(angle, atX = null, atY = null) {
    cancelFlight();
    about(atX, atY, () => { goal.yaw += angle; });
  }

  /** A hand has begun to move the sky: whatever was easing stops where it is, and from now on the view keeps exactly to the hand. */
  function hold() {
    glide = null;
    if (flight) cancelFlight();
    else Object.assign(goal, { x: state.x, y: state.y, z: state.z, distance: state.distance, yaw: state.yaw, pitch: state.pitch });
    held = true;
    idle = 0;
  }

  /** The hands are lifted: moving at (vx, vy) pixels a second from (x, y), the sky glides on. */
  function letGo(vx = 0, vy = 0, x = null, y = null) {
    held = false;
    const speed = Math.hypot(vx, vy);
    if (reducedMotion || follow || speed < 90) return;
    const most = Math.min(1, GLIDE_MOST / speed);
    const [tx, ty] = targetOnScreen();
    glide = { vx: vx * most, vy: vy * most, x: x ?? tx, y: y ?? ty };
  }

  function cancelFlight() {
    idle = 0;
    if (!flight) return;
    flight = null;
    Object.assign(goal, { x: state.x, y: state.y, z: state.z, distance: state.distance, yaw: state.yaw, pitch: state.pitch });
  }

  return {
    state, goal, flyTo, jumpTo, setCentre, setBias, setFollow, update, resize, frame,
    orbit, pan, drag, zoom, turn, hold, letGo, groundAt, cancelFlight,
    get flying() { return Boolean(flight); },
    get following() { return Boolean(follow); },
    get gliding() { return Boolean(glide); },
    get held() { return held; },
    /** A finger laid on a gliding sky: it stops there, under the finger. */
    stopGlide() {
      if (!glide) return;
      glide = null;
      goal.x = state.x;
      goal.y = state.y;
      goal.z = state.z;
    },
    /** How far from the middle of the universe the hands may take the target. */
    setBounds(radius) { bounds = radius > 0 ? radius : Infinity; },
    touch() { idle = 0; },
    setDrift(value) { drift = value; },
    on(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

const SLOP = { mouse: 4, pen: 7, touch: 9 }; // pixels a press may wander and still be a tap
const TWIST = 0.17;   // radians two fingers may turn before the sky turns with them
const DOUBLE_MS = 320; // a second tap this soon after the first, and this near it, is a double tap
const DOUBLE_PX = 34;

const wrapAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const measure = (a, b) => ({
  distance: Math.hypot(b.x - a.x, b.y - a.y),
  angle: Math.atan2(b.y - a.y, b.x - a.x),
  midX: (a.x + b.x) / 2,
  midY: (a.y + b.y) / 2,
});

/**
 * Wires pointer, wheel and touch to a camera, the way a map is moved. Returns a function that removes the wiring.
 *
 * One finger, or the mouse, takes hold of the sky and moves it across; let go mid-flick and it glides on.
 * Two fingers spread or pinch to come nearer or go further, twist to turn the sky, and, moved up or down
 * together, tilt it. The right button (or Alt, or Ctrl) turns and tilts with one hand; the wheel comes
 * nearer about the pointer; two quick taps are a double tap.
 *
 * `surfaces` are layers drawn over the element (names, poster cards): a drag or a wheel that begins on one
 * moves the sky exactly as it would from open space, and a press that does not move is still theirs to answer.
 */
export function attachControls(element, camera, { onTap, onDoubleTap, onHover, onGesture, surfaces = [], now = () => performance.now() } = {}) {
  const pointers = new Map(); // id -> { id, x, y, x0, y0, button, type, downAt, samples }
  const outside = new Set();  // pointers that went down on a surface, not on the element
  let one = null;   // a single hand: { pointer, mode: 'across' | 'turn', began }
  let pair = null;  // two hands: { a, b, distance, angle, midX, midY, start, mode: null | 'tilt' | 'free', twist, turning, travel }
  let spoiled = false; // the press became more than one hand: whatever happens, it is no tap
  let dragged = false; // the last press on a surface became a drag: its click is not a choice
  let lastTap = null;

  const local = event => {
    const rect = element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const setCursor = value => { if (element.style) element.style.cursor = value; };

  function begin(event) {
    if (event.button > 2 || pointers.has(event.pointerId)) return false;
    camera.stopGlide(); // a finger laid on a gliding sky stops it there
    const at = local(event);
    const t = now();
    const pointer = {
      id: event.pointerId, x: at.x, y: at.y, x0: at.x, y0: at.y, button: event.button || 0,
      type: event.pointerType || 'mouse', downAt: t, samples: [[t, at.x, at.y]],
    };
    pointers.set(event.pointerId, pointer);
    if (pointers.size === 1) {
      const turn = pointer.button === 1 || pointer.button === 2 || event.altKey || event.ctrlKey;
      one = { pointer, mode: turn ? 'turn' : 'across', began: false };
      pair = null;
      spoiled = false;
    } else if (pointers.size === 2) {
      // A second finger: the two together now, and no tap whatever follows.
      const [a, b] = [...pointers.values()];
      const start = measure(a, b);
      pair = { a, b, ...start, start, startA: [a.x, a.y], startB: [b.x, b.y], mode: null, twist: 0, turning: false, travel: 0 };
      one = null;
      spoiled = true;
    }
    onGesture?.();
    return true;
  }

  function move(event) {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) {
      if (event.pointerType === 'mouse' && !outside.size) { const at = local(event); onHover?.(at.x, at.y); }
      return;
    }
    const at = local(event);
    const px = pointer.x;
    const py = pointer.y;
    pointer.x = at.x;
    pointer.y = at.y;
    const t = now();
    pointer.samples.push([t, at.x, at.y]);
    while (pointer.samples.length > 2 && t - pointer.samples[0][0] > 150) pointer.samples.shift();

    if (pair && (pair.a === pointer || pair.b === pointer)) { movePair(); return; }
    if (!one || one.pointer !== pointer) return;
    if (!one.began) {
      if (Math.hypot(at.x - pointer.x0, at.y - pointer.y0) < (SLOP[pointer.type] ?? SLOP.mouse)) return;
      one.began = true;
      camera.hold();
      if (one.mode === 'across' && pointer.type === 'mouse') setCursor('grabbing');
      // From where it went down, so that what the finger took hold of is under it from the first.
      step(one.mode, pointer.x0, pointer.y0, at.x, at.y);
      return;
    }
    step(one.mode, px, py, at.x, at.y);
  }

  function step(mode, x0, y0, x1, y1) {
    if (mode === 'across') camera.drag(x0, y0, x1, y1);
    else camera.orbit(x1 - x0, y1 - y0);
  }

  function movePair() {
    const { a, b } = pair;
    const at = measure(a, b);
    let from = pair;
    if (!pair.mode) {
      const da = [a.x - pair.startA[0], a.y - pair.startA[1]];
      const db = [b.x - pair.startB[0], b.y - pair.startB[1]];
      if (Math.max(Math.hypot(da[0], da[1]), Math.hypot(db[0], db[1])) < 12) return;
      // Side by side, both moving up or both moving down, and neither spreading nor pinching: a tilt.
      const sideBySide = Math.abs(Math.sin(pair.start.angle)) < 0.6;
      const upright = d => Math.abs(d[1]) > 2 * Math.abs(d[0]);
      const together = da[1] * db[1] > 0;
      const steady = Math.abs(at.distance - pair.start.distance) < 0.5 * Math.min(Math.abs(da[1]), Math.abs(db[1]));
      pair.mode = sideBySide && together && upright(da) && upright(db) && steady ? 'tilt' : 'free';
      camera.hold();
      from = pair.start; // what the fingers have done so far counts
    }
    if (pair.mode === 'tilt') {
      camera.orbit(0, at.midY - from.midY);
    } else {
      // Across, with the point between the fingers. At a star a pinch keeps to the star until the fingers
      // have plainly moved together across the sky (each finger's move nudges the point between them: only
      // how far it has gone in all counts).
      pair.travel = Math.max(pair.travel, Math.hypot(at.midX - pair.start.midX, at.midY - pair.start.midY));
      if (!camera.following || pair.travel > 16) camera.drag(from.midX, from.midY, at.midX, at.midY);
      // Nearer or further, about that point.
      if (from.distance > 0 && at.distance > 0) camera.zoom(from.distance / at.distance, at.midX, at.midY);
      // Turned with the fingers, once the twist is plainly meant.
      const d = wrapAngle(at.angle - from.angle);
      if (pair.turning) camera.turn(d, at.midX, at.midY);
      else {
        pair.twist += d;
        if (Math.abs(pair.twist) > TWIST) {
          pair.turning = true;
          camera.turn(pair.twist - Math.sign(pair.twist) * TWIST, at.midX, at.midY);
        }
      }
    }
    Object.assign(pair, at);
  }

  /** How fast a pointer was moving as it was lifted, in pixels a second: nothing if it had come to rest. */
  function velocity(pointer) {
    const samples = pointer.samples;
    const last = samples[samples.length - 1];
    if (samples.length < 2 || now() - last[0] > 60) return [0, 0];
    let first = last;
    for (const sample of samples) if (last[0] - sample[0] <= 100) { first = sample; break; }
    const dt = (last[0] - first[0]) / 1000;
    if (dt < 0.008) return [0, 0];
    return [(last[1] - first[1]) / dt, (last[2] - first[2]) / dt];
  }

  function end(event, cancelled = false) {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    pointers.delete(event.pointerId);
    const fromOutside = outside.delete(event.pointerId);
    if (pair && (pair.a === pointer || pair.b === pointer)) {
      pair = null;
      // One hand stays: it goes on moving the sky across from where it is now, with nothing to make up.
      const rest = [...pointers.values()][0];
      if (rest) {
        rest.x0 = rest.x;
        rest.y0 = rest.y;
        rest.samples = [[now(), rest.x, rest.y]];
        one = { pointer: rest, mode: 'across', began: true };
      } else camera.letGo();
      return;
    }
    if (!one || one.pointer !== pointer) { if (!pointers.size) camera.letGo(); return; }
    const { began, mode } = one;
    one = null;
    if (began) {
      const [vx, vy] = mode === 'across' && !cancelled ? velocity(pointer) : [0, 0];
      camera.letGo(vx, vy, pointer.x, pointer.y);
      if (pointer.type === 'mouse') { setCursor(''); onHover?.(pointer.x, pointer.y); }
      return;
    }
    // Nothing moved: a tap, unless it began on a surface (that answers its own click) or was something else.
    if (cancelled || fromOutside || spoiled || pointer.button !== 0 || now() - pointer.downAt > 600) return;
    const t = now();
    if (lastTap && t - lastTap.at < DOUBLE_MS && Math.hypot(pointer.x - lastTap.x, pointer.y - lastTap.y) < DOUBLE_PX) {
      lastTap = null;
      (onDoubleTap || onTap)?.(pointer.x, pointer.y, event);
      return;
    }
    lastTap = { at: t, x: pointer.x, y: pointer.y };
    onTap?.(pointer.x, pointer.y, event);
  }

  function down(event) {
    if (begin(event)) element.setPointerCapture?.(event.pointerId);
  }
  function onElementMove(event) { if (!outside.has(event.pointerId)) move(event); }
  function onElementUp(event) { if (!outside.has(event.pointerId)) end(event); }
  function onElementCancel(event) { if (!outside.has(event.pointerId)) end(event, true); }

  function wheel(event) {
    event.preventDefault();
    camera.stopGlide();
    const at = local(event);
    const step = event.deltaMode === 1 ? event.deltaY * 28 : event.deltaMode === 2 ? event.deltaY * 400 : event.deltaY;
    const factor = Math.exp(clamp(step, -240, 240) * (event.ctrlKey ? 0.01 : 0.0016));
    camera.zoom(factor, at.x, at.y);
    onGesture?.();
  }

  // ── The same hands, begun on something drawn over the sky.
  function surfaceDown(event) {
    if (event.button > 2) return;
    dragged = false;
    if (begin(event)) outside.add(event.pointerId);
  }
  function outsideMove(event) {
    if (!outside.has(event.pointerId)) return;
    move(event);
    if (pair || one?.began) dragged = true;
  }
  function outsideUp(event) { if (outside.has(event.pointerId)) end(event, event.type === 'pointercancel'); }
  // A drag that ends where it began still raises a click: it moved the sky, it did not choose a film.
  const surfaceClick = event => {
    if (!dragged) return;
    dragged = false;
    event.stopPropagation();
    event.preventDefault();
  };
  // Shift and a press would otherwise select text, and a pressed poster would be dragged away as an image.
  const still = event => event.preventDefault();

  const leave = () => { if (!pointers.size) onHover?.(-1, -1); };
  const menu = event => event.preventDefault();
  for (const surface of surfaces) {
    surface.addEventListener('pointerdown', surfaceDown);
    surface.addEventListener('click', surfaceClick, true);
    surface.addEventListener('mousedown', still);
    surface.addEventListener('dragstart', still);
    surface.addEventListener('wheel', wheel, { passive: false });
    surface.addEventListener('contextmenu', menu);
  }
  if (surfaces.length) {
    window.addEventListener('pointermove', outsideMove);
    window.addEventListener('pointerup', outsideUp);
    window.addEventListener('pointercancel', outsideUp);
  }
  element.addEventListener('pointerdown', down);
  element.addEventListener('pointermove', onElementMove);
  element.addEventListener('pointerup', onElementUp);
  element.addEventListener('pointercancel', onElementCancel);
  element.addEventListener('pointerleave', leave);
  element.addEventListener('wheel', wheel, { passive: false });
  element.addEventListener('contextmenu', menu);
  return () => {
    for (const surface of surfaces) {
      surface.removeEventListener('pointerdown', surfaceDown);
      surface.removeEventListener('click', surfaceClick, true);
      surface.removeEventListener('mousedown', still);
      surface.removeEventListener('dragstart', still);
      surface.removeEventListener('wheel', wheel);
      surface.removeEventListener('contextmenu', menu);
    }
    if (surfaces.length) {
      window.removeEventListener('pointermove', outsideMove);
      window.removeEventListener('pointerup', outsideUp);
      window.removeEventListener('pointercancel', outsideUp);
    }
    element.removeEventListener('pointerdown', down);
    element.removeEventListener('pointermove', onElementMove);
    element.removeEventListener('pointerup', onElementUp);
    element.removeEventListener('pointercancel', onElementCancel);
    element.removeEventListener('pointerleave', leave);
    element.removeEventListener('wheel', wheel);
    element.removeEventListener('contextmenu', menu);
  };
}
