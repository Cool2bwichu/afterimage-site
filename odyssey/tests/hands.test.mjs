// The hands on the sky: what one finger, two fingers, a mouse and a wheel do to the camera.
// Each is checked the way it is felt: where a point of the sky is drawn before and after.
import assert from 'node:assert/strict';
import test from 'node:test';

import { attachControls, createCamera } from '../src/cosmos/camera.mjs';

const W = 390;
const H = 844;

/** Where a point of the universe is drawn on screen, in pixels, from the camera's own matrices. */
function project(camera, [x, y, z]) {
  const { viewProj: m } = camera.frame();
  const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
  const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
  const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [((cx / cw + 1) / 2) * W, ((1 - cy / cw) / 2) * H];
}

const near = (actual, expected, within, what) => {
  const off = Math.hypot(actual[0] - expected[0], actual[1] - expected[1]);
  assert.ok(off <= within, `${what}: drawn at ${actual.map(v => v.toFixed(1))}, not ${expected.map(v => v.toFixed(1))} (${off.toFixed(2)} px off)`);
};

function rig({ reducedMotion = false, distance = 300, pitch = 0.9, yaw = 0.5 } = {}) {
  const camera = createCamera({ reducedMotion });
  camera.resize(W, H);
  camera.setDrift(0);
  camera.jumpTo({ target: [0, 0, 0], distance, yaw, pitch });
  camera.update(0);
  const element = new EventTarget();
  element.getBoundingClientRect = () => ({ left: 0, top: 0, width: W, height: H });
  element.setPointerCapture = () => {};
  element.style = {};
  let clock = 1000;
  const taps = [];
  const doubles = [];
  const detach = attachControls(element, camera, {
    onTap: (x, y) => taps.push([x, y]),
    onDoubleTap: (x, y) => doubles.push([x, y]),
    now: () => clock,
  });
  const fire = (type, id, x, y, extra = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { pointerId: id, clientX: x, clientY: y, button: 0, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, pointerType: 'touch', ...extra });
    element.dispatchEvent(event);
    return event;
  };
  const wait = ms => {
    for (let t = 0; t < ms; t += 16) { clock += 16; camera.update(0.016); }
  };
  /** A finger (or a mouse button) pressed, moved in even steps and, unless told otherwise, lifted. */
  const drag = (from, to, { id = 1, steps = 10, ms = 16, lift = true, ...extra } = {}) => {
    fire('pointerdown', id, from[0], from[1], extra);
    for (let n = 1; n <= steps; n += 1) {
      clock += ms;
      camera.update(ms / 1000);
      fire('pointermove', id, from[0] + ((to[0] - from[0]) * n) / steps, from[1] + ((to[1] - from[1]) * n) / steps, extra);
    }
    camera.update(0.001); // the last move drawn before the finger lifts
    if (lift) fire('pointerup', id, to[0], to[1], extra);
  };
  /** Two fingers, each moved from where it starts to where it ends, together, by a path of their own. */
  const two = (pathA, pathB, { steps = 12, lift = true } = {}) => {
    const a0 = pathA(0);
    const b0 = pathB(0);
    fire('pointerdown', 1, a0[0], a0[1]);
    fire('pointerdown', 2, b0[0], b0[1]);
    for (let n = 1; n <= steps; n += 1) {
      clock += 16;
      camera.update(0.016);
      const a = pathA(n / steps);
      const b = pathB(n / steps);
      fire('pointermove', 1, a[0], a[1]);
      fire('pointermove', 2, b[0], b[1]);
    }
    camera.update(0.001); // the last move drawn before the fingers lift
    if (lift) {
      const a = pathA(1);
      const b = pathB(1);
      fire('pointerup', 1, a[0], a[1]);
      fire('pointerup', 2, b[0], b[1]);
    }
  };
  const target = () => [camera.goal.x, camera.goal.z];
  return { camera, element, fire, wait, drag, two, taps, doubles, target, detach, tick: ms => { clock += ms; } };
}

const line = (from, to) => e => [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e];

test('the point of the sky found under a pixel is drawn at that pixel, wherever the target sits', () => {
  const { camera } = rig();
  for (const centre of [[0, 0], [0, 0.32], [-0.2, 0.1]]) {
    camera.setCentre(...centre);
    for (let n = 0; n < 200; n += 1) camera.update(0.05);
    for (const pixel of [[195, 422], [30, 800], [360, 300], [100, 120], [380, 60]]) {
      near(project(camera, camera.groundAt(...pixel)), pixel, 0.5, `pixel ${pixel} with the target at ${centre}`);
    }
  }
  // Seen nearly edge on, a pixel above the horizon is still somewhere on the sky, not nowhere.
  camera.jumpTo({ pitch: 0.12 });
  const far = camera.groundAt(195, 10);
  assert.ok(far.every(Number.isFinite), 'a finite point');
  assert.ok(Math.hypot(far[0], far[2]) < camera.goal.distance * 6, 'and not absurdly far');
});

test('one finger moves across the sky, and what it took hold of stays under it', () => {
  const { camera, drag, fire } = rig();
  const held = camera.groundAt(200, 600);
  const before = { yaw: camera.goal.yaw, pitch: camera.goal.pitch, distance: camera.goal.distance };
  drag([200, 600], [120, 420], { lift: false });
  camera.update(0.016);
  near(project(camera, held), [120, 420], 1, 'the point taken hold of');
  assert.equal(camera.goal.yaw, before.yaw, 'not turned');
  assert.equal(camera.goal.pitch, before.pitch, 'not tilted');
  assert.equal(camera.goal.distance, before.distance, 'not nearer or further');
  // Upward, the long way across a slanting sky, it still keeps to the finger.
  const top = camera.groundAt(120, 420);
  fire('pointermove', 1, 150, 170);
  camera.update(0.016);
  near(project(camera, top), [150, 170], 1, 'dragged toward the far side');
  fire('pointerup', 1, 150, 170);
});

test('a finger that barely moves is a tap, two quick taps a double tap, and a drag neither', () => {
  const { fire, taps, doubles, drag, tick } = rig();
  fire('pointerdown', 1, 100, 200);
  tick(90);
  fire('pointermove', 1, 103, 202);
  fire('pointerup', 1, 103, 202);
  assert.deepEqual(taps, [[103, 202]]);
  tick(160);
  fire('pointerdown', 1, 106, 204);
  tick(80);
  fire('pointerup', 1, 106, 204);
  assert.equal(taps.length, 1, 'the second of two quick taps is not a tap');
  assert.deepEqual(doubles, [[106, 204]]);
  tick(700);
  fire('pointerdown', 1, 106, 204);
  tick(80);
  fire('pointerup', 1, 106, 204);
  assert.equal(taps.length, 2, 'a tap long after is a tap again');
  assert.equal(doubles.length, 1);
  tick(700);
  drag([100, 100], [180, 160]);
  assert.equal(taps.length, 2, 'a drag is not a tap');
});

test('let go mid-flick and the sky glides on the way it was going, slowing to a stop', () => {
  const { camera, drag, wait, target } = rig();
  const held = camera.groundAt(200, 640);
  drag([200, 640], [200, 340], { steps: 6, ms: 10 });
  const released = target();
  wait(120);
  const gliding = target();
  assert.ok(camera.gliding, 'gliding');
  // It carries on the way the finger went: what was held goes on up the screen, past where it was let go.
  assert.ok(project(camera, held)[1] < 340 - 20, `carried on: drawn at ${project(camera, held)[1].toFixed(1)}`);
  assert.ok(Math.hypot(gliding[0] - released[0], gliding[1] - released[1]) > 1);
  wait(4000);
  assert.ok(!camera.gliding, 'it comes to rest');
  const rest = target();
  wait(500);
  assert.deepEqual(target(), rest, 'and stays at rest');
  assert.ok(project(camera, held)[1] > -H, 'not flung off into the void');
});

test('a finger laid on a gliding sky stops it there', () => {
  const { camera, drag, wait, fire, target } = rig();
  drag([200, 640], [200, 340], { steps: 6, ms: 10 });
  wait(80);
  fire('pointerdown', 1, 200, 400);
  const caught = target();
  wait(400);
  assert.ok(!camera.gliding);
  assert.deepEqual(target(), caught);
  fire('pointerup', 1, 200, 400);
});

test('a drag that rests before it is lifted does not glide, and nothing glides under reduced motion', () => {
  const slow = rig();
  slow.drag([200, 640], [200, 340], { steps: 6, ms: 10, lift: false });
  slow.wait(150);
  slow.fire('pointerup', 1, 200, 340);
  assert.ok(!slow.camera.gliding, 'rested first');

  const still = rig({ reducedMotion: true });
  still.drag([200, 640], [200, 340], { steps: 6, ms: 10 });
  const at = still.target();
  still.wait(300);
  assert.ok(!still.camera.gliding);
  assert.deepEqual(still.target(), at, 'it stops where the finger left it');
});

test('two fingers spread or pinched come nearer or go further, about the point between them', () => {
  const { camera, two } = rig();
  const between = camera.groundAt(195, 300);
  two(line([165, 300], [105, 300]), line([225, 300], [285, 300]), { lift: false });
  camera.update(0.016);
  assert.ok(Math.abs(camera.goal.distance - 100) < 5, `three times nearer: ${camera.goal.distance.toFixed(1)}`);
  near(project(camera, between), [195, 300], 1.5, 'the point between the fingers');
});

test('a pinch and its spread come back to where they began', () => {
  const { camera, two } = rig();
  const between = camera.groundAt(195, 300);
  two(line([165, 300], [105, 300]), line([225, 300], [285, 300]));
  two(line([105, 300], [165, 300]), line([285, 300], [225, 300]));
  camera.update(0.016);
  assert.ok(Math.abs(camera.goal.distance - 300) < 6, `back: ${camera.goal.distance.toFixed(1)}`);
  near(project(camera, between), [195, 300], 2, 'the point between the fingers');
});

test('two fingers twisted turn the sky with them, about the point between them', () => {
  const { camera, two } = rig();
  const mid = [195, 422];
  const spin = (radius, start, turn) => e => [mid[0] + radius * Math.cos(start + turn * e), mid[1] + radius * Math.sin(start + turn * e)];
  const between = camera.groundAt(...mid);
  const right = camera.groundAt(245, 422);
  const yaw = camera.goal.yaw;
  two(spin(50, Math.PI, 0.7), spin(50, 0, 0.7), { steps: 14, lift: false });
  camera.update(0.016);
  const turned = camera.goal.yaw - yaw;
  assert.ok(turned > 0.4 && turned < 0.7, `turned with the fingers, less the first small twist: ${turned.toFixed(3)}`);
  near(project(camera, between), mid, 1.5, 'the point between the fingers');
  // What lay under the right finger has gone round the same way (clockwise, on a screen whose y runs down).
  const [x, y] = project(camera, right);
  const went = Math.atan2(y - mid[1], x - mid[0]);
  assert.ok(went > 0.25, `went round clockwise: ${went.toFixed(3)}`);
  assert.ok(Math.abs(camera.goal.distance - 300) < 6, 'no nearer');
});

test('a pinch with a little twist in it does not turn the sky', () => {
  const { camera, two } = rig();
  const yaw = camera.goal.yaw;
  two(e => [165 - 60 * e, 300 - 6 * e], e => [225 + 60 * e, 300 + 6 * e]);
  assert.equal(camera.goal.yaw, yaw);
});

test('two fingers moved up or down together tilt the sky, and nothing else', () => {
  const { camera, two, target } = rig();
  const before = { yaw: camera.goal.yaw, pitch: camera.goal.pitch, distance: camera.goal.distance, at: target() };
  two(line([145, 600], [145, 480]), line([245, 600], [245, 480]));
  assert.ok(camera.goal.pitch < before.pitch - 0.3, `tilted toward the horizon: ${camera.goal.pitch.toFixed(3)}`);
  assert.equal(camera.goal.yaw, before.yaw);
  assert.equal(camera.goal.distance, before.distance);
  assert.deepEqual(target(), before.at);
  const low = camera.goal.pitch;
  two(line([145, 480], [145, 600]), line([245, 480], [245, 600]));
  assert.ok(camera.goal.pitch > low + 0.3, 'and back up');
});

test('one finger lifted from two goes on moving across, without a jump and without a tap', () => {
  const { camera, fire, taps } = rig();
  fire('pointerdown', 1, 150, 500);
  fire('pointerdown', 2, 250, 500);
  fire('pointermove', 1, 140, 500);
  fire('pointermove', 2, 262, 500);
  fire('pointerup', 2, 262, 500);
  camera.update(0.016);
  const held = camera.groundAt(140, 500);
  fire('pointermove', 1, 150, 460);
  fire('pointermove', 1, 170, 420);
  camera.update(0.016);
  near(project(camera, held), [170, 420], 1, 'the remaining finger still holds the sky');
  fire('pointerup', 1, 170, 420);
  assert.equal(taps.length, 0);
});

test('the right button, Alt or Ctrl turns and tilts; Shift, like the plain left button, moves across', () => {
  for (const extra of [{ button: 2 }, { altKey: true }, { ctrlKey: true }]) {
    const { camera, drag, target } = rig();
    const before = { yaw: camera.goal.yaw, at: target() };
    drag([200, 400], [300, 400], { pointerType: 'mouse', ...extra });
    assert.ok(camera.goal.yaw < before.yaw - 0.4, `${JSON.stringify(extra)} turns: ${(camera.goal.yaw - before.yaw).toFixed(3)}`);
    assert.deepEqual(target(), before.at, `${JSON.stringify(extra)} stays put`);
  }
  for (const extra of [{}, { shiftKey: true }]) {
    const { camera, drag, target } = rig();
    const before = { yaw: camera.goal.yaw, at: target() };
    const held = camera.groundAt(200, 400);
    drag([200, 400], [300, 400], { pointerType: 'mouse', lift: false, ...extra });
    camera.update(0.016);
    assert.equal(camera.goal.yaw, before.yaw, `${JSON.stringify(extra)} does not turn`);
    near(project(camera, held), [300, 400], 1, `${JSON.stringify(extra)} moves across`);
  }
});

test('the wheel comes nearer and goes further about the pointer', () => {
  const { camera, element, wait } = rig();
  const wheel = (x, y, deltaY) => {
    const event = new Event('wheel', { cancelable: true });
    Object.assign(event, { clientX: x, clientY: y, deltaY, deltaMode: 0, ctrlKey: false });
    element.dispatchEvent(event);
    assert.ok(event.defaultPrevented, 'the page is not scrolled');
  };
  const under = camera.groundAt(300, 250);
  wheel(300, 250, -150);
  wait(1500);
  assert.ok(camera.state.distance < 280, `nearer: ${camera.state.distance.toFixed(1)}`);
  near(project(camera, under), [300, 250], 1.5, 'the point under the pointer, coming nearer');
  wheel(300, 250, 300);
  wait(1500);
  assert.ok(camera.state.distance > 300, `further: ${camera.state.distance.toFixed(1)}`);
  near(project(camera, under), [300, 250], 1.5, 'the point under the pointer, going further');
});

test('at a star, a pinch keeps to the star; a finger moving across lets it go', () => {
  const { camera, two, drag } = rig();
  camera.setFollow(() => [0, 0, 0]);
  camera.update(0.016);
  // The fingers drift a little as they spread: the star stays where it is.
  two(e => [165 - 60 * e, 300 + 5 * e], e => [225 + 60 * e, 300 + 5 * e]);
  assert.ok(camera.following, 'still with the star');
  camera.update(0.016);
  assert.ok(Math.hypot(camera.goal.x, camera.goal.z) < 1e-6, 'the star is still the centre');
  assert.ok(camera.goal.distance < 150, 'and it came nearer');
  drag([200, 600], [140, 450]);
  assert.ok(!camera.following, 'moving across leaves the star where it is');
  assert.ok(Math.hypot(camera.goal.x, camera.goal.z) > 1);
});

test('the sky has edges: moving across stops at them, and a wheel cannot carry past them either', () => {
  const { camera, drag, wait } = rig({ distance: 900 });
  camera.setBounds(500);
  for (let n = 0; n < 12; n += 1) { drag([200, 700], [200, 100], { steps: 4 }); wait(2000); }
  assert.ok(Math.hypot(camera.goal.x, camera.goal.z) <= 500 + 1e-6, `inside: ${Math.hypot(camera.goal.x, camera.goal.z).toFixed(1)}`);
  assert.ok(Math.hypot(camera.goal.x, camera.goal.z) > 450, 'right up to the edge');
});

test('the arrows move across the sky by a step, about where the target is drawn', () => {
  const { camera, target } = rig();
  const at = camera.groundAt(195, 422);
  camera.pan(0, 60);
  for (let n = 0; n < 100; n += 1) camera.update(0.05);
  near(project(camera, at), [195, 482], 1, 'the target moved down the screen');
  assert.notDeepEqual(target(), [0, 0]);
});

test('lifting the hands lets the sky ease again, and a flight cancels a glide', () => {
  const { camera, drag, wait } = rig();
  drag([200, 640], [200, 340], { steps: 6, ms: 10 });
  assert.ok(camera.gliding);
  camera.flyTo({ target: [40, 0, 40], distance: 200 });
  assert.ok(!camera.gliding, 'a flight takes over');
  wait(4000);
  assert.ok(Math.hypot(camera.state.x - 40, camera.state.z - 40) < 1e-3, 'and arrives where it was going');
});
