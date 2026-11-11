// The camera: it orbits a point in the universe, and it flies. A flight pulls
// back as it goes and closes in as it arrives, so a long passage is felt as
// distance covered and a short one as a step.
import { perspective, lookAt, multiply, clamp, lerp, easeInOut, angleDelta } from './math.mjs';

export const FOV = (46 * Math.PI) / 180;
const MIN_DISTANCE = 26;
const MAX_DISTANCE = 7600;
const MIN_PITCH = 0.06;
const MAX_PITCH = 1.5;

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
  const state = { x: 0, y: 0, z: 0, distance: 4300, yaw: 0.5, pitch: 0.98, cx: 0, cy: 0 };
  const goal = { ...state };
  let flight = null;
  let follow = null; // () => [x, y, z] | null: a point the target stays locked to
  let drift = 0.012; // radians per second of slow turning while nothing else moves
  let idle = 0;
  const listeners = new Set();

  const view = new Float32Array(16);
  const proj = new Float32Array(16);
  const viewProj = new Float32Array(16);
  const eye = [0, 0, 0];
  const basis = { right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, -1] };
  let focal = 1;
  let width = 1;
  let height = 1;

  function eyeOf(s, out = eye) {
    const cp = Math.cos(s.pitch);
    out[0] = s.x + s.distance * cp * Math.sin(s.yaw);
    out[1] = s.y + s.distance * Math.sin(s.pitch);
    out[2] = s.z + s.distance * cp * Math.cos(s.yaw);
    return out;
  }

  function settle() {
    goal.distance = clamp(goal.distance, MIN_DISTANCE, MAX_DISTANCE);
    goal.pitch = clamp(goal.pitch, MIN_PITCH, MAX_PITCH);
  }

  /**
   * Flies to a new view. Any field left out keeps its present goal.
   * @param {{ target?: number[], distance?: number, yaw?: number, pitch?: number, duration?: number, swoop?: number, lift?: number, follow?: Function }} to
   *   swoop: a turn added on the way; lift: how far to pull back mid-flight (worked out from the journey when left out);
   *   follow: a moving point to arrive at and stay with
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
    Object.assign(goal, end, { cx: goal.cx, cy: goal.cy });
    // How far the camera pulls back mid-flight: nothing for a step, a wide arc for a crossing.
    const lift = to.lift ?? clamp((travel / Math.max(span, 1)) * 0.55 - 0.08, 0, 1.6);
    flight = {
      from, end, duration, elapsed: 0, lift,
      pan: panTable(from.distance, end.distance, lift),
      yawDelta: angleDelta(from.yaw, end.yaw),
    };
    follow = to.follow || null;
    idle = 0;
    return duration;
  }

  /** Moves at once, with no flight. */
  function jumpTo(to = {}) {
    if (to.target) { goal.x = to.target[0]; goal.y = to.target[1]; goal.z = to.target[2]; }
    if (to.distance !== undefined) goal.distance = to.distance;
    if (to.yaw !== undefined) goal.yaw = to.yaw;
    if (to.pitch !== undefined) goal.pitch = to.pitch;
    settle();
    Object.assign(state, goal);
    flight = null;
  }

  /** Where the target sits on screen, in clip units (-1..1). Eased. */
  function setCentre(cx, cy) { goal.cx = cx; goal.cy = cy; }

  function setFollow(source) { follow = source; }

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
      const along = panAt(flight.pan, e);
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
      if (!reducedMotion && drift && idle > 2.5) goal.yaw += drift * dt * clamp((idle - 2.5) / 3, 0, 1);
      const k = 1 - Math.exp(-dt * 9);
      state.x = lerp(state.x, goal.x, locked ? 1 : k);
      state.y = lerp(state.y, goal.y, locked ? 1 : k);
      state.z = lerp(state.z, goal.z, locked ? 1 : k);
      state.distance = Math.exp(lerp(Math.log(state.distance), Math.log(goal.distance), k));
      state.yaw = lerp(state.yaw, goal.yaw, k);
      state.pitch = lerp(state.pitch, goal.pitch, k);
    }
    const kc = 1 - Math.exp(-dt * 5);
    state.cx = lerp(state.cx, goal.cx, kc);
    state.cy = lerp(state.cy, goal.cy, kc);
  }

  function resize(w, h) { width = Math.max(1, w); height = Math.max(1, h); }

  /** Rebuilds the matrices from the present state. Call once a frame. */
  function frame() {
    eyeOf(state, eye);
    const far = Math.max(state.distance * 6, 24000);
    perspective(proj, FOV, width / height, Math.max(0.5, state.distance * 0.02), far, state.cx, state.cy);
    lookAt(view, eye, [state.x, state.y, state.z], [0, 1, 0]);
    multiply(viewProj, proj, view);
    basis.right[0] = view[0]; basis.right[1] = view[4]; basis.right[2] = view[8];
    basis.up[0] = view[1]; basis.up[1] = view[5]; basis.up[2] = view[9];
    basis.forward[0] = -view[2]; basis.forward[1] = -view[6]; basis.forward[2] = -view[10];
    focal = height / (2 * Math.tan(FOV / 2));
    return { view, proj, viewProj, eye, basis, focal, width, height, distance: state.distance, cx: state.cx, cy: state.cy };
  }

  // ── What a hand does to it.
  function orbit(dx, dy) {
    cancelFlight();
    goal.yaw -= dx * 0.0052;
    goal.pitch += dy * 0.0042;
    settle();
  }

  function pan(dx, dy) {
    cancelFlight();
    follow = null;
    const scale = (state.distance * Math.tan(FOV / 2) * 2) / height;
    const fx = Math.sin(state.yaw);
    const fz = Math.cos(state.yaw);
    // Screen right is (cos yaw, 0, -sin yaw); screen up, flattened to the plane of the galaxies.
    goal.x += (-dx * fz - dy * fx) * scale;
    goal.z += (dx * fx - dy * fz) * scale;
    for (const listener of listeners) listener('panned');
  }

  /** Zooms by a factor, drawing the target toward a point on screen (in clip units). */
  function zoom(factor, atX = null, atY = null) {
    cancelFlight();
    const before = goal.distance;
    goal.distance = clamp(goal.distance * factor, MIN_DISTANCE, MAX_DISTANCE);
    if (atX !== null && !follow && goal.distance < before) {
      const pull = 1 - goal.distance / before;
      const halfH = before * Math.tan(FOV / 2);
      const halfW = halfH * (width / height);
      const sx = (atX - state.cx) * halfW * pull;
      const sy = ((atY - state.cy) * halfH * pull) / Math.max(0.35, Math.sin(state.pitch));
      const fx = Math.sin(state.yaw);
      const fz = Math.cos(state.yaw);
      goal.x += sx * fz - sy * fx;
      goal.z += -sx * fx - sy * fz;
    }
    for (const listener of listeners) listener('zoomed');
  }

  function cancelFlight() {
    idle = 0;
    if (!flight) return;
    flight = null;
    Object.assign(goal, { x: state.x, y: state.y, z: state.z, distance: state.distance, yaw: state.yaw, pitch: state.pitch });
  }

  return {
    state, goal, flyTo, jumpTo, setCentre, setFollow, update, resize, frame, orbit, pan, zoom, cancelFlight,
    get flying() { return Boolean(flight); },
    get following() { return Boolean(follow); },
    touch() { idle = 0; },
    setDrift(value) { drift = value; },
    on(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

/** Wires pointer, wheel and touch to a camera. Returns a function that removes the wiring. */
export function attachControls(element, camera, { onTap, onHover, onGesture } = {}) {
  const pointers = new Map();
  let moved = 0;
  let pinch = null;
  let downAt = 0;

  const local = event => {
    const rect = element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, w: rect.width, h: rect.height };
  };

  function down(event) {
    if (event.button > 2) return;
    element.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, button: event.button, shift: event.shiftKey });
    moved = 0;
    downAt = performance.now();
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 };
    }
    onGesture?.();
  }

  function move(event) {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) {
      if (event.pointerType === 'mouse') { const at = local(event); onHover?.(at.x, at.y); }
      return;
    }
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      if (pinch.distance > 0 && distance > 0) camera.zoom(pinch.distance / distance);
      camera.pan(midX - pinch.midX, midY - pinch.midY);
      pinch = { distance, midX, midY };
      return;
    }
    if (pointers.size !== 1 || moved < 4) return;
    if (pointer.button === 2 || pointer.shift) camera.pan(dx, dy);
    else camera.orbit(dx, dy);
  }

  function up(event) {
    const pointer = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointer && moved < 6 && performance.now() - downAt < 600 && pointer.button === 0) {
      const at = local(event);
      onTap?.(at.x, at.y, event);
    }
  }

  function wheel(event) {
    event.preventDefault();
    const at = local(event);
    const step = event.deltaMode === 1 ? event.deltaY * 28 : event.deltaY;
    const factor = Math.exp(clamp(step, -240, 240) * (event.ctrlKey ? 0.01 : 0.0016));
    camera.zoom(factor, (at.x / at.w) * 2 - 1, 1 - (at.y / at.h) * 2);
    onGesture?.();
  }

  const leave = () => onHover?.(-1, -1);
  const menu = event => event.preventDefault();
  element.addEventListener('pointerdown', down);
  element.addEventListener('pointermove', move);
  element.addEventListener('pointerup', up);
  element.addEventListener('pointercancel', up);
  element.addEventListener('pointerleave', leave);
  element.addEventListener('wheel', wheel, { passive: false });
  element.addEventListener('contextmenu', menu);
  return () => {
    element.removeEventListener('pointerdown', down);
    element.removeEventListener('pointermove', move);
    element.removeEventListener('pointerup', up);
    element.removeEventListener('pointercancel', up);
    element.removeEventListener('pointerleave', leave);
    element.removeEventListener('wheel', wheel);
    element.removeEventListener('contextmenu', menu);
  };
}
