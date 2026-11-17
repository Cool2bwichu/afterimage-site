// The camera: it orbits a point in the universe, and it flies. A flight pulls
// back as it goes and closes in as it arrives, so a long passage is felt as
// distance covered and a short one as a step.
//
// Hands move it the way a map is moved: whatever a finger takes hold of stays
// under that finger, two fingers bring it nearer or turn it about the point
// between them, and a flick glides on and slows to a stop. The universe is
// deep, not flat: what a hand takes hold of is the stars it actually touches,
// at their own depth, and the view slides across the screen with them, so
// that up is up and nothing grows or shrinks while it moves. Seen whole, from
// far out, the sky is a thing in the hand instead: one finger turns it and
// tilts it, and a flick sets it spinning. Its edges give, like the end of a
// page pulled too far, and settle back when let go.
import { perspective, lookAt, multiply, clamp, lerp, easeInOut, angleDelta } from './math.mjs';

export const FOV = (46 * Math.PI) / 180;
const MIN_DISTANCE = 26;
const MAX_DISTANCE = 7600;
const MIN_PITCH = 0.06;
const MAX_PITCH = 1.5;
const MIN_DIP = 0.2;   // a ray toward the horizon is taken as falling at least this steeply, so it still meets the sky
const GLIDE = 3.4;     // how quickly a glide slows: it carries on for 1/GLIDE of a second's worth of its speed
const GLIDE_MOST = 2600; // pixels a second: the fastest a flick can send the sky
const SPIN = 2.6;      // how quickly a flick that turns the sky slows
const SPIN_MOST = 1500; // pixels a second: the fastest a flick can turn it
const TAN = Math.tan(FOV / 2);
// Where the sky ends for the hands: a little past its furthest galaxy, and further the further out you
// are (by a share of the height in view), so that from far out it can be moved well aside and never lost.
const EDGE_REACH = 1.12;
const EDGE_VIEW = 0.62;
const EDGE_GIVE = 0.36; // how far past the edge a hand can pull, as a share of the half-height in view, before it gives no more
// Above the highest stars and below the lowest, the target may go this share of the half-height in view.
const EDGE_HIGH = 1;

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
  let glide = null;  // { vx, vy, depth, turn }: a flick carrying on, in pixels a second, holding what lay that deep
  let bounds = Infinity; // how far out the sky's furthest galaxy lies: its edges are worked out from it
  let low = -Infinity; // and how low and how high its stars lie
  let high = Infinity;
  let raw = null;    // while a hand holds the sky: where it has taken the target, before the edges resist
  let rawFloor = 0;  // and how far out the target already was when it took hold (the edge is never nearer than that)
  let rawLow = 0;    // and how low and how high it already was
  let rawHigh = 0;
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
  function groundAt(x, y, out = [0, 0, 0], s = goal, centre = state) {
    eyeOf(s, groundEye, groundAim);
    lookAt(groundView, groundEye, groundAim, UP);
    const v = groundView;
    const t = Math.tan(FOV / 2);
    // The target is drawn at (cx, cy), in clip units: a pixel is read from there.
    const sx = ((x / width) * 2 - 1 - centre.cx) * t * (width / height);
    const sy = (1 - (y / height) * 2 - centre.cy) * t;
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

  // ── Points at a depth. The universe is deep: what a hand takes hold of lies as deep as the stars it touches.
  const axes = { right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, -1] };
  /** The view's own directions: across the screen, up it, and into it. */
  function axesOf(s) {
    const cp = Math.cos(s.pitch);
    const sp = Math.sin(s.pitch);
    const cy = Math.cos(s.yaw);
    const sy = Math.sin(s.yaw);
    axes.right[0] = cy; axes.right[1] = 0; axes.right[2] = -sy;
    axes.up[0] = -sp * sy; axes.up[1] = cp; axes.up[2] = -sp * cy;
    axes.forward[0] = -cp * sy; axes.forward[1] = -sp; axes.forward[2] = -cp * cy;
    return axes;
  }
  const pointEye = [0, 0, 0];
  const pointAim = [0, 0, 0];
  /**
   * The point of the universe under a pixel (x, y) that lies `depth` deep (measured straight into the view),
   * seen as the camera will be once it has caught up with every move asked of it.
   */
  function pointAt(x, y, depth, out = [0, 0, 0], s = goal, centre = state) {
    eyeOf(s, pointEye, pointAim);
    const { right, up, forward } = axesOf(s);
    const a = ((x / width) * 2 - 1 - centre.cx) * TAN * (width / height);
    const b = (1 - (y / height) * 2 - centre.cy) * TAN;
    for (let k = 0; k < 3; k += 1) out[k] = pointEye[k] + depth * (forward[k] + a * right[k] + b * up[k]);
    return out;
  }
  /** Where a point of the universe is drawn, in pixels, and how deep it lies: { x, y, depth }, or null behind the eye. */
  function screenOf(p, out = {}, s = goal, centre = state) {
    eyeOf(s, pointEye, pointAim);
    const { right, up, forward } = axesOf(s);
    const dx = p[0] - pointEye[0];
    const dy = p[1] - pointEye[1];
    const dz = p[2] - pointEye[2];
    const depth = dx * forward[0] + dy * forward[1] + dz * forward[2];
    if (depth <= 1e-6) return null;
    const ndcX = (dx * right[0] + dz * right[2]) / (depth * TAN * (width / height)) + centre.cx;
    const ndcY = (dx * up[0] + dy * up[1] + dz * up[2]) / (depth * TAN) + centre.cy;
    out.x = ((ndcX + 1) / 2) * width;
    out.y = ((1 - ndcY) / 2) * height;
    out.depth = depth;
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
    for (const listener of listeners) listener('flight');
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
        // A flick carries on from where it was let go, slowing as it goes: across the sky, or turning it.
        const flick = glide;
        const rate = flick.turn ? SPIN : GLIDE;
        const fade = Math.exp(-dt * rate);
        const share = (1 - fade) / rate;
        if (flick.turn) spin(flick.vx * share, flick.vy * share);
        else slide(flick.vx * share, flick.vy * share, flick.depth); // stops it at the edge
        flick.vx *= fade;
        flick.vy *= fade;
        if (glide === flick && Math.hypot(flick.vx, flick.vy) < 14) glide = null;
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
  function spin(dx, dy) {
    goal.yaw -= dx * 0.0052;
    goal.pitch += dy * 0.0042;
    settle();
  }
  /** Turns the sky about its target, and tilts it, by a drag of (dx, dy) pixels. */
  function orbit(dx, dy) {
    cancelFlight();
    spin(dx, dy);
    for (const listener of listeners) listener('turned');
  }

  /** How far from the middle of the universe the target may be taken, seen from a distance. */
  const edgeAt = distance => (bounds === Infinity ? Infinity : bounds * EDGE_REACH + distance * TAN * EDGE_VIEW);
  /** How low and how high the target may be taken, seen from a distance: a little past the lowest and highest stars. */
  const heightsAt = distance => (low === -Infinity ? [-Infinity, Infinity] : [low - distance * TAN * EDGE_HIGH, high + distance * TAN * EDGE_HIGH]);
  /** Past an edge, a hand pulls on against a resistance that grows until it gives no more. */
  const yielding = (over, give) => give * (1 - Math.exp(-over / give));

  /**
   * Moves the target. A hand may pull it past the edges (out from the middle, or above the highest stars or
   * below the lowest), against a resistance that grows until it gives no more, and it settles back when let go;
   * anything else stops at the edge.
   */
  function shift(dx, dy, dz) {
    if (held) {
      if (!raw) { raw = [goal.x, goal.y, goal.z]; rawFloor = Math.hypot(goal.x, goal.z); rawLow = goal.y; rawHigh = goal.y; }
      raw[0] += dx;
      raw[1] += dy;
      raw[2] += dz;
      const give = Math.max(1, goal.distance * TAN * EDGE_GIVE);
      const limit = Math.max(edgeAt(goal.distance), rawFloor);
      const r = Math.hypot(raw[0], raw[2]);
      const shown = r <= limit ? r : limit + yielding(r - limit, give);
      goal.x = r > 0 ? (raw[0] * shown) / r : raw[0];
      goal.z = r > 0 ? (raw[2] * shown) / r : raw[2];
      const [lowest, highest] = heightsAt(goal.distance);
      const bottom = Math.min(lowest, rawLow);
      const top = Math.max(highest, rawHigh);
      goal.y = raw[1] > top ? top + yielding(raw[1] - top, give) : raw[1] < bottom ? bottom - yielding(bottom - raw[1], give) : raw[1];
      return;
    }
    // Anything else stops at an edge; a target already beyond one may come back in, not go further out.
    let stopped = false;
    const was = Math.hypot(goal.x, goal.z);
    goal.x += dx;
    goal.z += dz;
    const now = Math.hypot(goal.x, goal.z);
    const limit = Math.max(edgeAt(goal.distance), was);
    if (now > limit) { goal.x *= limit / now; goal.z *= limit / now; stopped = true; }
    const [lowest, highest] = heightsAt(goal.distance);
    const bottom = Math.min(lowest, goal.y);
    const top = Math.max(highest, goal.y);
    goal.y += dy;
    if (goal.y > top) { goal.y = top; stopped = true; } else if (goal.y < bottom) { goal.y = bottom; stopped = true; }
    if (stopped && glide && !glide.turn) glide = null; // a glide comes to rest against the edge
  }

  /**
   * Slides the view across the screen by (dx, dy) pixels, carrying with it, exactly, whatever lies `depth`
   * deep: up the screen is up, across is across, and nothing comes nearer or goes further while it moves.
   */
  function slide(dx, dy, depth = null) {
    const { right, up } = axesOf(goal);
    const step = (2 * (depth > 0 ? depth : goal.distance) * TAN) / height; // what a pixel spans, that deep
    shift((dy * up[0] - dx * right[0]) * step, dy * up[1] * step, (dy * up[2] - dx * right[2]) * step);
  }

  /** The hand has moved from one pixel to another, holding the sky `depth` deep (the target's depth if not told). */
  function drag(x0, y0, x1, y1, depth = null) {
    cancelFlight();
    follow = null;
    slide(x1 - x0, y1 - y0, depth);
    for (const listener of listeners) listener('panned');
  }

  /** Moves across the sky by a step, in pixels, carrying what lies `depth` deep (the target, if not told). */
  function pan(dx, dy, depth = null) {
    drag(0, 0, dx, dy, depth);
  }

  const heldPoint = [0, 0, 0];
  /**
   * Nearer (a factor below 1) or further, about a point of the universe, which stays where it is drawn: the
   * whole view grows or shrinks about it. About the target if there is none, and always at a star the camera
   * keeps to, so that it stays the centre of it all.
   */
  function zoomAbout(factor, point = null) {
    cancelFlight();
    const was = goal.distance;
    const next = clamp(was * factor, MIN_DISTANCE, MAX_DISTANCE);
    if (point && !follow) {
      // The camera looks at its aim (a little behind the target when far out): the aim is moved toward the
      // point, or away, by as much as the distance changes, so the point is seen along the same line as before.
      eyeOf(goal, pointEye, pointAim);
      const k = next / was;
      const ax = point[0] + k * (pointAim[0] - point[0]);
      const ay = point[1] + k * (pointAim[1] - point[1]);
      const az = point[2] + k * (pointAim[2] - point[2]);
      goal.distance = next;
      eyeOf(goal, pointEye, pointAim);
      shift(ax - pointAim[0], ay - pointAim[1], az - pointAim[2]);
    } else goal.distance = next;
    for (const listener of listeners) listener('zoomed');
  }
  /** Nearer or further about the point under a pixel that lies `depth` deep (the target's depth if not told), or about the target. */
  function zoom(factor, atX = null, atY = null, depth = null) {
    const anchored = atX !== null && atY !== null;
    zoomAbout(factor, anchored ? pointAt(atX, atY, depth > 0 ? depth : goal.distance, heldPoint) : null);
  }

  /** Turns the sky by an angle (clockwise on screen) about the upright line through a point of it, which stays where it is drawn; or about the target. */
  function turnAbout(angle, point = null) {
    cancelFlight();
    if (point && !follow) {
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const x = goal.x - point[0];
      const z = goal.z - point[2];
      goal.yaw += angle;
      shift(point[0] + x * c + z * s - goal.x, 0, point[2] - x * s + z * c - goal.z);
    } else goal.yaw += angle;
    for (const listener of listeners) listener('turned');
  }
  /** Turns the sky about the point under a pixel that lies `depth` deep, or about the target. */
  function turn(angle, atX = null, atY = null, depth = null) {
    const anchored = atX !== null && atY !== null;
    turnAbout(angle, anchored ? pointAt(atX, atY, depth > 0 ? depth : goal.distance, heldPoint) : null);
  }

  /** A hand has begun to move the sky: whatever was easing stops where it is, and from now on the view keeps exactly to the hand. */
  function hold() {
    glide = null;
    raw = null;
    if (flight) cancelFlight();
    else Object.assign(goal, { x: state.x, y: state.y, z: state.z, distance: state.distance, yaw: state.yaw, pitch: state.pitch });
    held = true;
    idle = 0;
  }

  /**
   * The hands are lifted, moving at (vx, vy) pixels a second: the sky glides on, still holding what lay `depth`
   * deep, or, if the hand was turning it, spins on. Pulled past an edge, it settles back inside instead.
   */
  function letGo(vx = 0, vy = 0, { turning = false, depth = null } = {}) {
    held = false;
    if (raw) {
      raw = null;
      let back = false;
      const limit = Math.max(edgeAt(goal.distance), rawFloor);
      const r = Math.hypot(goal.x, goal.z);
      if (r > limit + 1e-6) { goal.x *= limit / r; goal.z *= limit / r; back = true; }
      const [lowest, highest] = heightsAt(goal.distance);
      const bottom = Math.min(lowest, rawLow);
      const top = Math.max(highest, rawHigh);
      if (goal.y > top + 1e-6) { goal.y = top; back = true; } else if (goal.y < bottom - 1e-6) { goal.y = bottom; back = true; }
      if (back) return;
    }
    const speed = Math.hypot(vx, vy);
    if (reducedMotion || speed < 90 || (follow && !turning)) return;
    const most = Math.min(1, (turning ? SPIN_MOST : GLIDE_MOST) / speed);
    glide = { vx: vx * most, vy: vy * most, depth: depth > 0 ? depth : goal.distance, turn: turning };
  }

  // ── Framing a set of points.
  const fitView = new Float32Array(16);
  const fitProj = new Float32Array(16);
  const fitMatrix = new Float32Array(16);
  const fitEye = [0, 0, 0];
  const fitAim = [0, 0, 0];
  const fitA = [0, 0, 0];
  const fitB = [0, 0, 0];
  /** Where each point of a list falls on screen seen from a pose: their bounds in pixels, or null if one is behind the eye. */
  function boundsFrom(pose, points) {
    eyeOf(pose, fitEye, fitAim);
    perspective(fitProj, FOV, width / height, Math.max(0.5, pose.distance * 0.02), Math.max(pose.distance * 6, 24000), pose.cx, pose.cy);
    lookAt(fitView, fitEye, fitAim, UP);
    multiply(fitMatrix, fitProj, fitView);
    const m = fitMatrix;
    let left = Infinity; let right = -Infinity; let top = Infinity; let bottom = -Infinity;
    for (const [x, y, z] of points) {
      const w = m[3] * x + m[7] * y + m[11] * z + m[15];
      if (w <= pose.distance * 0.05) return null;
      const px = ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w * 0.5 + 0.5) * width;
      const py = (0.5 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / w * 0.5) * height;
      left = Math.min(left, px); right = Math.max(right, px);
      top = Math.min(top, py); bottom = Math.max(bottom, py);
    }
    return { left, right, top, bottom };
  }

  /**
   * Where to stand to see a set of points whole inside a part of the screen ({ left, top, right, bottom } in
   * pixels), from a yaw and a pitch: the target and the distance. Worked out for the view as it will be once
   * everything asked of it has eased in: the target drawn where it is asked to be, the camera stood back as
   * far as it is asked to stand.
   */
  function fit(points, region, { yaw = goal.yaw, pitch = goal.pitch, margin = 0.08, least = MIN_DISTANCE } = {}) {
    if (!points.length) return null;
    const pose = { x: 0, y: 0, z: 0, distance: 1, yaw, pitch: clamp(pitch, MIN_PITCH, MAX_PITCH), bias: goal.bias, cx: goal.cx, cy: goal.cy };
    let spread = 0;
    for (const p of points) { pose.x += p[0]; pose.y += p[1]; pose.z += p[2]; }
    pose.x /= points.length; pose.y /= points.length; pose.z /= points.length;
    for (const p of points) spread = Math.max(spread, Math.hypot(p[0] - pose.x, p[1] - pose.y, p[2] - pose.z));
    pose.distance = clamp(spread * 3 + 60, least, MAX_DISTANCE);
    const roomW = Math.max(40, (region.right - region.left) * (1 - 2 * margin));
    const roomH = Math.max(40, (region.bottom - region.top) * (1 - 2 * margin));
    const wantX = (region.left + region.right) / 2;
    const wantY = (region.top + region.bottom) / 2;
    for (let pass = 0; pass < 8; pass += 1) {
      const box = boundsFrom(pose, points);
      if (!box) { pose.distance = Math.min(MAX_DISTANCE, pose.distance * 1.6); continue; }
      // Nearer or further until the points fill the room (their size on screen goes as one over the distance)…
      const scale = Math.max((box.right - box.left) / roomW, (box.bottom - box.top) / roomH, 1e-3);
      pose.distance = clamp(pose.distance * (pass < 6 ? scale : Math.sqrt(scale)), least, MAX_DISTANCE);
      // …and across, until they sit in the middle of it.
      const again = boundsFrom(pose, points);
      if (!again) continue;
      groundAt((again.left + again.right) / 2, (again.top + again.bottom) / 2, fitA, pose, pose);
      groundAt(wantX, wantY, fitB, pose, pose);
      pose.x += fitA[0] - fitB[0];
      pose.z += fitA[2] - fitB[2];
    }
    return { target: [pose.x, pose.y, pose.z], distance: pose.distance };
  }

  function cancelFlight() {
    idle = 0;
    if (!flight) return;
    flight = null;
    Object.assign(goal, { x: state.x, y: state.y, z: state.z, distance: state.distance, yaw: state.yaw, pitch: state.pitch });
  }

  return {
    state, goal, flyTo, jumpTo, setCentre, setBias, setFollow, update, resize, frame,
    orbit, pan, drag, zoom, zoomAbout, turn, turnAbout, hold, letGo, groundAt, pointAt, screenOf, cancelFlight, fit,
    get flying() { return Boolean(flight); },
    get following() { return Boolean(follow); },
    get gliding() { return Boolean(glide); },
    get held() { return held; },
    /** A finger laid on a gliding or spinning sky: it stops there, under the finger. */
    stopGlide() {
      if (!glide) return;
      const { turn: turning } = glide;
      glide = null;
      if (turning) { goal.yaw = state.yaw; goal.pitch = state.pitch; return; }
      goal.x = state.x;
      goal.y = state.y;
      goal.z = state.z;
    },
    /**
     * How far out the sky's furthest galaxy lies, and how low and how high its stars ([low, high]): the hands may
     * take the target a little past them, and further when far out.
     */
    setBounds(reach, heights = null) {
      bounds = reach > 0 ? reach : Infinity;
      [low, high] = heights && heights[0] <= heights[1] ? heights : [-Infinity, Infinity];
    },
    /** How far from the middle of the universe the target may be taken, seen from a distance (the present one if left out). */
    edgeAt(distance = goal.distance) { return edgeAt(distance); },
    /** How low and how high the target may be taken, seen from a distance (the present one if left out). */
    heightsAt(distance = goal.distance) { return heightsAt(distance); },
    /**
     * How far a point on screen (in pixels) lies from where the target is drawn, as a share of the
     * uncovered sky's half-width or half-height, whichever it is further along: 1 is at its edge.
     */
    offCentre(x, y, insets = { left: 0, right: 0, top: 0, bottom: 0 }) {
      const [tx, ty] = targetOnScreen();
      const halfW = Math.max(40, (width - insets.left - insets.right) / 2);
      const halfH = Math.max(40, (height - insets.top - insets.bottom) / 2);
      return Math.max(Math.abs(x - tx) / halfW, Math.abs(y - ty) / halfH);
    },
    touch() { idle = 0; },
    setDrift(value) { drift = value; },
    on(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

const SLOP = { mouse: 4, pen: 7, touch: 9 }; // pixels a press may wander and still be a tap
const TWIST = 0.17;   // radians two fingers may turn before the sky turns with them
const DOUBLE_MS = 300; // a second tap begun this soon after the first was lifted, and this near it, is a double tap
const DOUBLE_PX = 34;
const WHEEL_RUN_MS = 300; // wheel steps this close together, with the pointer still, come nearer to one same point
const WHEEL_SETTLE = 4;   // pixels a run of wheel steps travels before it is settled whether it comes nearer or moves across
const REACH = 4; // a hand takes hold of nothing more than this many times as deep as what you look at, nor less than its share:
                 // a far star caught by chance would fling the view away, a near one make it crawl

/** How deep a hand may take hold of the sky, told how deep it lies there: as deep as that, within REACH of the target's distance. */
export const holdable = (depth, distance) => (Number.isFinite(depth) && depth > 0 ? clamp(depth, distance / REACH, distance * REACH) : distance);

const wrapAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const measure = (a, b) => ({
  distance: Math.hypot(b.x - a.x, b.y - a.y),
  angle: Math.atan2(b.y - a.y, b.x - a.x),
  midX: (a.x + b.x) / 2,
  midY: (a.y + b.y) / 2,
});
// Which of Shift, Alt and Ctrl are down.
const keysOf = event => (event.shiftKey ? 1 : 0) | (event.altKey ? 2 : 0) | (event.ctrlKey ? 4 : 0);

/**
 * Wires pointer, wheel and touch to a camera, the way a map is moved. Returns a function that removes the wiring.
 *
 * One finger, or the mouse, takes hold of the sky and moves it across; let go mid-flick and it glides on.
 * What it takes hold of is what lies under it, as deep as `depthAt(x, y, target)` says (the target's depth
 * where it cannot say, and never more than a few times nearer or further than the target), and it stays under
 * the hand whichever way the hand goes.
 * While `whole()` says the sky is seen whole, from far out, one finger turns it and tilts it instead (Shift
 * with a mouse still moves across, pressed before the drag or during it), and a flick sets it spinning. Two
 * fingers spread or pinch to come nearer or go further, twist to turn the sky, and, moved up or down together,
 * tilt it: all about what lies between them. The right button (or Alt, or Ctrl) turns and tilts with one hand;
 * the wheel, and a pinch on a trackpad, come nearer about what lies under the pointer, while two fingers swiped
 * sideways on a trackpad (or the wheel with Shift) move the sky across with them; two quick taps are a double tap.
 *
 * `surfaces` are layers drawn over the element (names, poster cards): a drag or a wheel that begins on one
 * moves the sky exactly as it would from open space, and a press that does not move is still theirs to answer.
 */
export function attachControls(element, camera, { onTap, onDoubleTap, onHover, onGesture, whole = null, depthAt = null, surfaces = [], now = () => performance.now() } = {}) {
  const pointers = new Map(); // id -> { id, x, y, x0, y0, button, type, downAt, samples, target }
  const outside = new Set();  // pointers that went down on a surface, not on the element
  let one = null;   // a single hand: { pointer, mode: 'across' | 'turn', began, depth, keys }
  let pair = null;  // two hands: { a, b, distance, angle, midX, midY, start, mode: null | 'tilt' | 'free', twist, turning, travel, point }
  let spoiled = false; // the press became more than one hand: whatever happens, it is no tap
  let dragged = false; // the last press on a surface became a drag: its click is not a choice
  let lastTap = null;
  let wheeled = null;  // a run of wheel steps: { x, y, at, target, way: null | 'near' | 'across', dx, dy, point, depth }
  let pinched = null;  // a trackpad pinch the browser reports as a gesture of its own (Safari): { scale, rotation, twist, turning, point }
  const seen = {};

  const local = event => {
    const rect = element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const setCursor = value => { if (element.style) element.style.cursor = value; };
  /** How deep the sky lies under a pixel: as the page sees it (the stars drawn there), or the target's depth. */
  const deepAt = (x, y, target = null) => holdable(depthAt?.(x, y, target), camera.goal.distance);
  /** The point of the sky a hand takes hold of at a pixel. */
  const holdAt = (x, y, target = null) => camera.pointAt(x, y, deepAt(x, y, target));
  /** What one hand does: turn and tilt with the right or middle button, Alt or Ctrl, or from far out unless Shift is down; else move across. */
  const modeOf = (pointer, event) => (
    pointer.button === 1 || pointer.button === 2 || event.altKey || event.ctrlKey || (!event.shiftKey && Boolean(whole?.())) ? 'turn' : 'across'
  );

  function begin(event) {
    if (event.button > 2 || pointers.has(event.pointerId)) return false;
    camera.stopGlide(); // a finger laid on a gliding sky stops it there
    const at = local(event);
    const t = now();
    const pointer = {
      id: event.pointerId, x: at.x, y: at.y, x0: at.x, y0: at.y, button: event.button || 0,
      type: event.pointerType || 'mouse', downAt: t, samples: [[t, at.x, at.y]], target: event.target || null,
    };
    pointers.set(event.pointerId, pointer);
    if (pointers.size === 1) {
      one = { pointer, mode: modeOf(pointer, event), began: false, depth: 0, keys: keysOf(event) };
      pair = null;
      spoiled = false;
    } else if (pointers.size === 2) {
      // A second finger: the two together now, and no tap whatever follows.
      const [a, b] = [...pointers.values()];
      const start = measure(a, b);
      pair = { a, b, ...start, start, startA: [a.x, a.y], startB: [b.x, b.y], mode: null, twist: 0, turning: false, travel: 0, point: null };
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
    // Shift (or Alt, or Ctrl) pressed or let go during a drag changes what it does, from where the pointer is.
    const keys = keysOf(event);
    if (keys !== one.keys) {
      one.keys = keys;
      const mode = modeOf(pointer, event);
      if (mode !== one.mode) {
        one.mode = mode;
        if (one.began) {
          if (mode === 'across') one.depth = deepAt(px, py);
          if (pointer.type === 'mouse') setCursor(mode === 'across' ? 'grabbing' : '');
        }
      }
    }
    if (!one.began) {
      if (Math.hypot(at.x - pointer.x0, at.y - pointer.y0) < (SLOP[pointer.type] ?? SLOP.mouse)) return;
      one.began = true;
      // What the hand took hold of: the sky under where it went down, as deep as it lies there.
      if (one.mode === 'across') one.depth = deepAt(pointer.x0, pointer.y0, pointer.target);
      camera.hold();
      if (one.mode === 'across' && pointer.type === 'mouse') setCursor('grabbing');
      // From where it went down, so that what the finger took hold of is under it from the first.
      step(one, pointer.x0, pointer.y0, at.x, at.y);
      return;
    }
    step(one, px, py, at.x, at.y);
  }

  function step(hand, x0, y0, x1, y1) {
    if (hand.mode === 'across') camera.drag(x0, y0, x1, y1, hand.depth);
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
      // What lies between the fingers is taken hold of, at its own depth: it comes nearer or goes further, turns,
      // and moves across with them, staying between them throughout. At a star a pinch keeps to the star until the
      // fingers have plainly moved together across the sky (each finger's move nudges the point between them: only
      // how far it has gone in all counts).
      pair.travel = Math.max(pair.travel, Math.hypot(at.midX - pair.start.midX, at.midY - pair.start.midY));
      if (!pair.point && (!camera.following || pair.travel > 16)) pair.point = holdAt(from.midX, from.midY, a.target);
      const point = pair.point;
      if (from.distance > 0 && at.distance > 0) camera.zoomAbout(from.distance / at.distance, point);
      // Turned with the fingers, once the twist is plainly meant.
      const d = wrapAngle(at.angle - from.angle);
      if (pair.turning) camera.turnAbout(d, point);
      else {
        pair.twist += d;
        if (Math.abs(pair.twist) > TWIST) {
          pair.turning = true;
          camera.turnAbout(pair.twist - Math.sign(pair.twist) * TWIST, point);
        }
      }
      // Across: whatever the rest did, what was taken hold of is brought back between the fingers.
      const p = point ? camera.screenOf(point, seen) : null;
      if (p) camera.drag(p.x, p.y, at.midX, at.midY, p.depth);
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
        one = { pointer: rest, mode: 'across', began: true, depth: deepAt(rest.x, rest.y), keys: 0 };
      } else camera.letGo();
      return;
    }
    if (!one || one.pointer !== pointer) { if (!pointers.size) camera.letGo(); return; }
    const { began, mode, depth } = one;
    one = null;
    if (began) {
      const [vx, vy] = cancelled ? [0, 0] : velocity(pointer);
      camera.letGo(vx, vy, { turning: mode === 'turn', depth });
      if (pointer.type === 'mouse') { setCursor(''); onHover?.(pointer.x, pointer.y); }
      return;
    }
    // Nothing moved: a tap, unless it began on a surface (that answers its own click) or was something else.
    if (cancelled || fromOutside || spoiled || pointer.button !== 0 || now() - pointer.downAt > 600) return;
    const t = now();
    if (lastTap && pointer.downAt - lastTap.at < DOUBLE_MS && Math.hypot(pointer.x - lastTap.x, pointer.y - lastTap.y) < DOUBLE_PX) {
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
    if (pinched && event.ctrlKey) return; // the same pinch, reported twice
    camera.stopGlide();
    const at = local(event);
    const t = now();
    const unit = event.deltaMode === 1 ? 28 : event.deltaMode === 2 ? 400 : 1;
    const dx = (event.deltaX || 0) * unit;
    const dy = (event.deltaY || 0) * unit;
    // A run of steps (a trackpad sends dozens a second) keeps to what it began on, and to what it began doing.
    if (!wheeled || t - wheeled.at > WHEEL_RUN_MS || Math.hypot(at.x - wheeled.x, at.y - wheeled.y) > 6) {
      wheeled = { x: at.x, y: at.y, at: t, target: event.target, way: null, dx: 0, dy: 0, point: null, depth: null };
    }
    wheeled.at = t;
    let [stepX, stepY] = [dx, dy];
    if (!wheeled.way) {
      // How it begins says what it is: a pinch (Ctrl) comes nearer; Shift, or two fingers swiped more sideways than
      // up or down on a trackpad, move the sky across with them; up or down alone comes nearer, as a mouse wheel does.
      wheeled.dx += dx;
      wheeled.dy += dy;
      if (event.ctrlKey) wheeled.way = 'near';
      else if (event.shiftKey) wheeled.way = 'across';
      else if (Math.max(Math.abs(wheeled.dx), Math.abs(wheeled.dy)) >= WHEEL_SETTLE) wheeled.way = Math.abs(wheeled.dx) > Math.abs(wheeled.dy) ? 'across' : 'near';
      else return; // a few pixels yet: too soon to tell
      [stepX, stepY] = [wheeled.dx, wheeled.dy];
      if (wheeled.way === 'near') wheeled.point = holdAt(wheeled.x, wheeled.y, wheeled.target);
      else wheeled.depth = deepAt(wheeled.x, wheeled.y, wheeled.target);
    }
    if (wheeled.way === 'across') {
      // The sky goes the way the fingers go, as a page scrolled on a trackpad does.
      camera.pan(-stepX, -stepY, wheeled.depth);
    } else {
      const factor = Math.exp(clamp(stepY, -240, 240) * (event.ctrlKey ? 0.01 : 0.0016));
      camera.zoomAbout(factor, wheeled.point);
    }
    onGesture?.();
  }

  // ── A pinch on a trackpad, as Safari reports it: nearer or further, and turned, about what lies under the pointer.
  // (Other browsers report it as a wheel with Ctrl; on a touch screen the fingers' own events do the work.)
  function pinchStart(event) {
    event.preventDefault();
    if (pointers.size) return;
    const at = local(event);
    camera.stopGlide();
    pinched = { scale: 1, rotation: 0, twist: 0, turning: false, point: holdAt(at.x, at.y, event.target) };
    onGesture?.();
  }
  function pinchChange(event) {
    event.preventDefault();
    if (!pinched || pointers.size) return;
    const scale = event.scale > 0 ? event.scale : 1;
    camera.zoomAbout(pinched.scale / scale, pinched.point);
    pinched.scale = scale;
    const d = (((event.rotation || 0) - pinched.rotation) * Math.PI) / 180;
    pinched.rotation = event.rotation || 0;
    if (pinched.turning) camera.turnAbout(d, pinched.point);
    else {
      pinched.twist += d;
      if (Math.abs(pinched.twist) > TWIST) {
        pinched.turning = true;
        camera.turnAbout(pinched.twist - Math.sign(pinched.twist) * TWIST, pinched.point);
      }
    }
  }
  function pinchEnd(event) {
    event.preventDefault();
    pinched = null;
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
  const wiring = [
    ...surfaces.flatMap(surface => [
      [surface, 'pointerdown', surfaceDown],
      [surface, 'click', surfaceClick, true],
      [surface, 'mousedown', still],
      [surface, 'dragstart', still],
      [surface, 'wheel', wheel, { passive: false }],
      [surface, 'contextmenu', menu],
      [surface, 'gesturestart', pinchStart],
      [surface, 'gesturechange', pinchChange],
      [surface, 'gestureend', pinchEnd],
    ]),
    ...(surfaces.length && typeof window !== 'undefined' ? [
      [window, 'pointermove', outsideMove],
      [window, 'pointerup', outsideUp],
      [window, 'pointercancel', outsideUp],
    ] : []),
    [element, 'pointerdown', down],
    [element, 'pointermove', onElementMove],
    [element, 'pointerup', onElementUp],
    [element, 'pointercancel', onElementCancel],
    [element, 'pointerleave', leave],
    [element, 'wheel', wheel, { passive: false }],
    [element, 'contextmenu', menu],
    [element, 'gesturestart', pinchStart],
    [element, 'gesturechange', pinchChange],
    [element, 'gestureend', pinchEnd],
  ];
  for (const [target, type, listener, options] of wiring) target.addEventListener(type, listener, options);
  return () => {
    for (const [target, type, listener, options] of wiring) target.removeEventListener(type, listener, options === true);
  };
}
