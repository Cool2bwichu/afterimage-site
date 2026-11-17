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

function rig({ reducedMotion = false, distance = 300, pitch = 0.9, yaw = 0.5, whole = null, depthAt = null } = {}) {
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
    whole,
    depthAt,
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

/** How deep a point lies, straight into the view. */
const depthOf = (camera, point) => camera.screenOf(point).depth;

test('the point found under a pixel at a depth is drawn at that pixel, that deep, wherever the target sits', () => {
  const { camera } = rig({ pitch: 0.5 });
  for (const centre of [[0, 0], [0, 0.32], [-0.2, 0.1]]) {
    camera.setCentre(...centre);
    for (let n = 0; n < 200; n += 1) camera.update(0.05);
    for (const pixel of [[195, 422], [30, 800], [360, 300], [100, 120], [380, 60]]) {
      for (const depth of [40, 300, 2400]) {
        const point = camera.pointAt(...pixel, depth);
        near(project(camera, point), pixel, 0.01, `pixel ${pixel}, ${depth} deep, with the target at ${centre}`);
        const seen = camera.screenOf(point);
        near([seen.x, seen.y], pixel, 0.01, 'and found there again');
        assert.ok(Math.abs(seen.depth - depth) < 1e-6, `that deep: ${seen.depth}`);
      }
    }
  }
});

test('one finger moves across the sky, and what it took hold of stays under it', () => {
  const { camera, drag, fire } = rig();
  const held = camera.pointAt(200, 600, camera.goal.distance);
  const before = { yaw: camera.goal.yaw, pitch: camera.goal.pitch, distance: camera.goal.distance };
  drag([200, 600], [120, 420], { lift: false });
  camera.update(0.016);
  near(project(camera, held), [120, 420], 0.5, 'the point taken hold of');
  assert.equal(camera.goal.yaw, before.yaw, 'not turned');
  assert.equal(camera.goal.pitch, before.pitch, 'not tilted');
  assert.equal(camera.goal.distance, before.distance, 'not nearer or further');
  // Up toward the top of the screen it still keeps to the finger, and comes no nearer.
  fire('pointermove', 1, 150, 170);
  camera.update(0.016);
  near(project(camera, held), [150, 170], 0.5, 'dragged up the screen');
  assert.ok(Math.abs(depthOf(camera, held) - before.distance) < 1e-6, 'as deep as it was');
  fire('pointerup', 1, 150, 170);
});

test('what a hand takes hold of lies as deep as the stars it touches, and they stay under it whichever way it goes', () => {
  for (const pitch of [0.9, 0.5, 0.12]) {
    for (const share of [0.35, 1, 2.6]) {
      let asked = null;
      const { camera, drag, fire } = rig({ pitch, depthAt: (x, y) => { asked = [x, y]; return 300 * share; } });
      const held = camera.pointAt(200, 600, 300 * share);
      // Far behind it, and near in front: they move less and more than the hand, as deep things do, but move the same way.
      const behind = camera.pointAt(200, 600, 300 * share * 3);
      drag([200, 600], [120, 420], { lift: false });
      camera.update(0.016);
      assert.deepEqual(asked, [200, 600], 'asked how deep the sky is where the hand went down');
      near(project(camera, held), [120, 420], 0.5, `pitch ${pitch}, ${share} times the target's depth`);
      const [bx, by] = project(camera, behind);
      assert.ok(bx < 200 && by < 600 && bx > 120 && by > 420, `what lies further back went the same way, less far: ${bx.toFixed(1)}, ${by.toFixed(1)}`);
      for (const to of [[150, 140], [360, 160], [20, 700], [195, 800]]) {
        fire('pointermove', 1, ...to);
        camera.update(0.016);
        near(project(camera, held), to, 0.5, `pitch ${pitch}, ${share}: held all the way to ${to}`);
        assert.ok(Math.abs(depthOf(camera, held) - 300 * share) < 1e-6, 'and it came no nearer and went no further');
      }
      fire('pointerup', 1, 195, 800);
    }
  }
});

test('a hand takes hold of nothing far beyond or close before what you look at: a far star caught by chance flings nothing', () => {
  for (const [said, held] of [[300 * 40, 300 * 4], [300 / 40, 300 / 4]]) {
    const { camera, drag } = rig({ pitch: 0.5, depthAt: () => said });
    const point = camera.pointAt(200, 600, held);
    drag([200, 600], [120, 420], { lift: false });
    camera.update(0.016);
    near(project(camera, point), [120, 420], 0.5, `told it lay ${said} deep, the hand held what lies ${held} deep`);
  }
});

test('a drag up or down slides the view: up is up, and nothing grows or shrinks', () => {
  const { camera, drag } = rig({ pitch: 0.5, depthAt: () => 600 });
  const a = camera.pointAt(150, 500, 600);
  const b = camera.pointAt(250, 500, 600);
  const wide = Math.hypot(...[0, 1].map(k => project(camera, a)[k] - project(camera, b)[k]));
  drag([200, 300], [200, 640], { lift: false });
  camera.update(0.016);
  const [ax, ay] = project(camera, a);
  const [bx, by] = project(camera, b);
  near([ax, ay], [150, 840], 0.5, 'the stars there went straight down with the hand');
  assert.ok(Math.abs(Math.hypot(ax - bx, ay - by) - wide) < 0.5, `and are as far apart as they were: ${Math.hypot(ax - bx, ay - by).toFixed(2)} against ${wide.toFixed(2)}`);
  assert.ok(camera.goal.y > 0, 'the view went up to see what was above');
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

test('two fingers hold what lies between them at its own depth: it stays between them as they spread, twist and move', () => {
  for (const pitch of [0.9, 0.3]) {
    const { camera, two } = rig({ pitch, depthAt: () => 700 });
    const between = camera.pointAt(195, 300, 700);
    const turn = 0.6;
    const a = e => [195 + (-40 - 50 * e) * Math.cos(turn * e) - 0 + 40 * e, 300 + (-40 - 50 * e) * Math.sin(turn * e) + 120 * e];
    const b = e => [195 + (40 + 50 * e) * Math.cos(turn * e) + 40 * e, 300 + (40 + 50 * e) * Math.sin(turn * e) + 120 * e];
    two(a, b, { steps: 16, lift: false });
    camera.update(0.016);
    near(project(camera, between), [235, 420], 1, `pitch ${pitch}: still between the fingers`);
    assert.ok(camera.goal.distance < 300 * 0.55, `nearer: ${camera.goal.distance.toFixed(1)}`);
    assert.ok(camera.goal.yaw > 0.5 + 0.3, `turned: ${camera.goal.yaw.toFixed(3)}`);
  }
});

test('a pinch toward the far side of a low, slanting view comes nearer what is there, and nothing is thrown off or springs back', () => {
  let deep = 0;
  const { camera, two, fire, wait } = rig({ distance: 900, pitch: 0.25, depthAt: () => deep });
  camera.setBounds(900, [-280, 110]);
  // Stars lie far off toward the horizon, under the fingers: the hands are told how deep.
  deep = camera.screenOf(camera.groundAt(195, 300)).depth;
  const between = camera.pointAt(195, 300, deep);
  assert.ok(Math.hypot(between[0], between[2]) < 900, 'among the galaxies');
  two(line([165, 300], [105, 300]), line([225, 300], [285, 300]), { lift: false });
  camera.update(0.016);
  near(project(camera, between), [195, 300], 1, 'what was between the fingers is still there');
  assert.ok(Math.abs(camera.goal.distance - 300) < 2, `three times nearer: ${camera.goal.distance.toFixed(1)}`);
  const held = { x: camera.goal.x, y: camera.goal.y, z: camera.goal.z };
  assert.ok(Math.hypot(held.x, held.z) <= camera.edgeAt() && held.y <= camera.heightsAt()[1], 'within the edges');
  fire('pointerup', 1, 105, 300);
  fire('pointerup', 2, 285, 300);
  wait(1500);
  assert.ok(Math.hypot(camera.goal.x - held.x, camera.goal.y - held.y, camera.goal.z - held.z) < 1e-6, 'and when let go it stays where it was brought');
  near(project(camera, between), [195, 300], 1, 'with what was pinched toward still there');
});

test('the wheel comes nearer what lies under the pointer, as deep as it lies, and a run of steps keeps to it', () => {
  let asked = 0;
  const { camera, element, wait } = rig({ pitch: 0.5, depthAt: () => { asked += 1; return 900; } });
  const wheel = (x, y, deltaY, extra = {}) => {
    const event = new Event('wheel', { cancelable: true });
    Object.assign(event, { clientX: x, clientY: y, deltaY, deltaMode: 0, ctrlKey: false, ...extra });
    element.dispatchEvent(event);
  };
  const under = camera.pointAt(300, 250, 900);
  for (let n = 0; n < 20; n += 1) { wheel(300, 250, -12); wait(16); }
  assert.equal(asked, 1, 'a run of steps takes hold once, and keeps to that');
  wait(1500);
  assert.ok(camera.state.distance < 220, `nearer: ${camera.state.distance.toFixed(1)}`);
  near(project(camera, under), [300, 250], 1, 'what lay under the pointer stays there');
  wheel(300, 250, 400);
  wait(1500);
  near(project(camera, under), [300, 250], 1, 'and going further');
  // A trackpad pinch arrives as a wheel with Ctrl: the same, faster.
  const before = camera.state.distance;
  wheel(300, 250, -20, { ctrlKey: true });
  wait(1500);
  assert.ok(camera.state.distance < before * 0.9, 'a pinch on a trackpad comes nearer');
  near(project(camera, under), [300, 250], 1, 'about the same point');
});

test('a trackpad pinch reported as a gesture of its own (Safari) comes nearer and turns about what lies under the pointer', () => {
  const { camera, element, fire } = rig({ pitch: 0.6, depthAt: () => 500 });
  const gesture = (type, extra = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { clientX: 120, clientY: 300, scale: 1, rotation: 0, ...extra });
    element.dispatchEvent(event);
    assert.ok(event.defaultPrevented, 'the page itself is not magnified');
  };
  const under = camera.pointAt(120, 300, 500);
  const yaw = camera.goal.yaw;
  gesture('gesturestart');
  for (let n = 1; n <= 10; n += 1) gesture('gesturechange', { scale: 1 + n * 0.1, rotation: n * 3 });
  gesture('gestureend', { scale: 2, rotation: 30 });
  camera.update(0.016);
  for (let n = 0; n < 100; n += 1) camera.update(0.05);
  assert.ok(Math.abs(camera.goal.distance - 150) < 1, `twice as near: ${camera.goal.distance.toFixed(1)}`);
  assert.ok(camera.goal.yaw > yaw + 0.3, `turned with the twist: ${(camera.goal.yaw - yaw).toFixed(3)}`);
  near(project(camera, under), [120, 300], 1, 'about the point under the pointer');
  // Fingers on a touch screen report the same gesture too: their own events do the work, once.
  const touch = rig({ depthAt: () => 300 });
  touch.fire('pointerdown', 1, 150, 300);
  touch.fire('pointerdown', 2, 250, 300);
  const event = new Event('gesturechange', { cancelable: true });
  Object.assign(event, { clientX: 200, clientY: 300, scale: 3, rotation: 0 });
  touch.element.dispatchEvent(event);
  assert.equal(touch.camera.goal.distance, 300, 'not as well');
  fire('pointerup', 1, 0, 0);
});

test('Shift pressed during a drag moves across from there on, and let go turns again', () => {
  const { camera, element, target } = rig({ distance: 3200, whole: () => true, depthAt: () => 3000 });
  const send = (type, x, y, shiftKey) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { pointerId: 1, clientX: x, clientY: y, button: 0, shiftKey, altKey: false, ctrlKey: false, pointerType: 'mouse' });
    element.dispatchEvent(event);
  };
  const yaw = camera.goal.yaw;
  send('pointerdown', 100, 400, false);
  for (let x = 110; x <= 200; x += 10) send('pointermove', x, 400, false);
  const turned = camera.goal.yaw;
  assert.ok(turned < yaw - 0.3, 'a plain drag from far out turns');
  assert.deepEqual(target(), [0, 0]);
  send('pointermove', 205, 400, true);
  const held = camera.pointAt(205, 400, 3000);
  for (let x = 215; x <= 305; x += 10) send('pointermove', x, 400, true);
  camera.update(0.016);
  assert.equal(camera.goal.yaw, turned, 'with Shift down it no longer turns');
  near(project(camera, held), [305, 400], 0.5, 'it moves across, holding what was under the pointer');
  send('pointermove', 310, 400, false);
  send('pointermove', 360, 400, false);
  assert.ok(camera.goal.yaw < turned - 0.2, 'and with Shift let go it turns again');
  send('pointerup', 360, 400, false);
});

test('a flick glides on holding what lay as deep as the stars it touched', () => {
  const { camera, drag, wait } = rig({ pitch: 0.5, depthAt: () => 1200 });
  const held = camera.pointAt(200, 640, 1200);
  drag([200, 640], [200, 340], { steps: 6, ms: 10 });
  near(project(camera, held), [200, 340], 0.5, 'held to the end of the flick');
  wait(200);
  const [x, y] = project(camera, held);
  assert.ok(Math.abs(x - 200) < 0.5 && y < 340 - 40, `and carried on straight up: ${x.toFixed(1)}, ${y.toFixed(1)}`);
  assert.ok(Math.abs(depthOf(camera, held) - 1200) < 1e-6, 'no nearer and no further');
});

test('the sky is deep as well as wide: a hand may take you a little above its highest stars or below its lowest, and it settles back', () => {
  const { camera, drag, fire, wait } = rig({ distance: 300, pitch: 0.5 });
  camera.setBounds(900, [-280, 110]);
  const [lowest, highest] = camera.heightsAt();
  assert.ok(lowest < -280 && highest > 110 && highest < 110 + 300, `a little past them: ${lowest.toFixed(0)} to ${highest.toFixed(0)}`);
  drag([195, 100], [195, 100 + 9000], { steps: 90, ms: 20, lift: false });
  const give = 300 * Math.tan((46 * Math.PI) / 360) * 0.36;
  assert.ok(camera.goal.y > highest && camera.goal.y < highest + give + 1e-6, `pulled up past the highest, but only so far: ${camera.goal.y.toFixed(1)}`);
  fire('pointerup', 1, 195, 9100);
  wait(1500);
  assert.ok(Math.abs(camera.goal.y - highest) < 1e-6, `settled back: ${camera.goal.y.toFixed(2)}`);
  for (let n = 0; n < 60; n += 1) camera.pan(0, -80);
  assert.ok(camera.goal.y >= camera.heightsAt()[0] - 1e-6, 'the arrows stop below the lowest');
});

test('one finger lifted from two goes on moving across, without a jump and without a tap', () => {
  const { camera, fire, taps } = rig();
  fire('pointerdown', 1, 150, 500);
  fire('pointerdown', 2, 250, 500);
  fire('pointermove', 1, 140, 500);
  fire('pointermove', 2, 262, 500);
  fire('pointerup', 2, 262, 500);
  camera.update(0.016);
  const held = camera.pointAt(140, 500, camera.goal.distance);
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
    const held = camera.pointAt(200, 400, camera.goal.distance);
    drag([200, 400], [300, 400], { pointerType: 'mouse', lift: false, ...extra });
    camera.update(0.016);
    assert.equal(camera.goal.yaw, before.yaw, `${JSON.stringify(extra)} does not turn`);
    near(project(camera, held), [300, 400], 1, `${JSON.stringify(extra)} moves across`);
  }
});

test('two fingers swiped sideways on a trackpad, or the wheel with Shift, move the sky across with them; up or down alone comes nearer', () => {
  let asked = 0;
  const { camera, element, wait } = rig({ pitch: 0.5, depthAt: () => { asked += 1; return 600; } });
  const wheel = (deltaX, deltaY, extra = {}) => {
    const event = new Event('wheel', { cancelable: true });
    Object.assign(event, { clientX: 200, clientY: 400, deltaX, deltaY, deltaMode: 0, ctrlKey: false, shiftKey: false, ...extra });
    element.dispatchEvent(event);
    assert.ok(event.defaultPrevented, 'the page is not scrolled');
  };
  const distance = camera.goal.distance;
  // A swipe that begins mostly sideways, then wanders up: the sky goes with the fingers, both ways, and comes no nearer.
  const held = camera.pointAt(200, 400, 600);
  for (let n = 0; n < 10; n += 1) { wheel(6, 1); wait(16); }
  for (let n = 0; n < 10; n += 1) { wheel(1, 5); wait(16); }
  wait(1500);
  assert.equal(asked, 1, 'one run, taken hold of once');
  assert.equal(camera.goal.distance, distance, 'no nearer, no further');
  near(project(camera, held), [200 - 70, 400 - 60], 0.5, 'what lay under the pointer went the way the fingers went');
  // Up or down alone, after a pause, comes nearer, as a mouse wheel does: a few pixels pass before it is settled.
  wheel(0, -2);
  assert.equal(camera.goal.distance, distance, 'too soon to tell');
  wheel(0, -40);
  wait(1500);
  assert.ok(camera.goal.distance < distance, `nearer: ${camera.goal.distance.toFixed(1)}`);
  // With Shift the wheel moves across whichever way it turns (a computer may report it as sideways).
  const now = camera.goal.distance;
  const again = camera.pointAt(200, 400, 600);
  wheel(0, 30, { shiftKey: true });
  wheel(25, 0, { shiftKey: true });
  wait(1500);
  assert.equal(camera.goal.distance, now, 'no nearer');
  near(project(camera, again), [175, 370], 0.5, 'moved across instead');
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

test('the sky has soft edges: a hand pulls a little past them against a resistance, and it settles back when let go', () => {
  const { camera, drag, fire, wait } = rig({ distance: 900 });
  camera.setBounds(500);
  const edge = camera.edgeAt();
  assert.ok(edge > 560 && edge < 900, `a little past the furthest galaxy, more when far out: ${edge.toFixed(1)}`);
  const out = () => Math.hypot(camera.goal.x, camera.goal.z);
  // One long pull, far past the edge, still held.
  drag([200, 800], [200, -6000], { steps: 60, ms: 30, lift: false });
  const give = 900 * Math.tan((46 * Math.PI) / 360) * 0.36;
  assert.ok(out() > edge + give * 0.5, `pulled past the edge: ${out().toFixed(1)} against ${edge.toFixed(1)}`);
  assert.ok(out() < edge + give + 1e-6, `but only so far: ${out().toFixed(1)}, at most ${(edge + give).toFixed(1)}`);
  fire('pointerup', 1, 200, -6000);
  assert.ok(!camera.gliding, 'nothing glides on past the edge');
  wait(1500);
  assert.ok(Math.abs(out() - edge) < 1e-6, `settled back to the edge: ${out().toFixed(2)}`);
  assert.ok(Math.abs(Math.hypot(camera.state.x, camera.state.z) - edge) < 1, 'and the view eased back with it');
});

test('a glide comes to rest against the edge, and the arrows stop there too', () => {
  const { camera, drag, wait } = rig({ distance: 900 });
  camera.setBounds(500);
  const edge = camera.edgeAt();
  for (let n = 0; n < 8; n += 1) { drag([200, 700], [200, 200], { steps: 4, ms: 10 }); wait(3000); }
  assert.ok(Math.hypot(camera.goal.x, camera.goal.z) <= edge + 1e-6, `inside: ${Math.hypot(camera.goal.x, camera.goal.z).toFixed(1)}`);
  assert.ok(Math.hypot(camera.goal.x, camera.goal.z) > edge - 60, 'right up to the edge');
  assert.ok(!camera.gliding);
  for (let n = 0; n < 40; n += 1) camera.pan(0, 80);
  assert.ok(Math.hypot(camera.goal.x, camera.goal.z) <= edge + 1e-6, 'the arrows stop at the edge');
});

test('the further out, the further the edge: the whole sky can be moved well aside', () => {
  const { camera } = rig();
  camera.setBounds(960);
  assert.ok(camera.edgeAt(3300) > camera.edgeAt(300) + 700, `${camera.edgeAt(3300).toFixed(0)} far out, ${camera.edgeAt(300).toFixed(0)} near`);
  assert.ok(camera.edgeAt(300) < 960 * 1.25, 'near, a little past the furthest galaxy');
});

test('seen whole from far out, one finger turns the sky and tilts it, and a flick sets it spinning', () => {
  const { camera, drag, wait, fire, target, taps } = rig({ distance: 3200, pitch: 0.9, whole: () => true });
  const yaw = camera.goal.yaw;
  // Each drag comes to rest before it is lifted, so nothing spins on.
  const rested = (from, to) => { drag(from, to, { steps: 10, ms: 40, lift: false }); wait(120); fire('pointerup', 1, to[0], to[1]); };
  rested([100, 400], [300, 400]);
  assert.deepEqual(target(), [0, 0], 'the target stays where it was');
  assert.ok(Math.abs(camera.goal.yaw - (yaw - 200 * 0.0052)) < 1e-6, `dragged right, it turns: ${camera.goal.yaw.toFixed(3)}`);
  assert.ok(!camera.gliding, 'a drag that came to rest does not spin');
  const pitch = camera.goal.pitch;
  rested([200, 300], [200, 400]);
  assert.ok(Math.abs(camera.goal.pitch - (pitch + 100 * 0.0042)) < 1e-6, 'dragged down, it tilts to face you');
  rested([200, 400], [200, 300]);
  assert.ok(Math.abs(camera.goal.pitch - pitch) < 1e-6, 'and back up');
  // A flick carries on turning, slowing, and a finger laid on it stops it where it is.
  drag([100, 600], [300, 600], { steps: 4, ms: 10 });
  assert.ok(camera.gliding, 'spinning on');
  const lifted = camera.goal.yaw;
  wait(160);
  const spun = camera.goal.yaw;
  assert.ok(spun < lifted - 0.05, `it carries on turning: ${lifted.toFixed(3)} then ${spun.toFixed(3)}`);
  fire('pointerdown', 4, 200, 200);
  assert.ok(!camera.gliding, 'a finger stops it');
  assert.equal(camera.goal.yaw, camera.state.yaw, 'right where it is');
  fire('pointerup', 4, 200, 200);
  assert.deepEqual(target(), [0, 0], 'none of it moved the target');
  assert.equal(taps.length, 1, 'the finger that stopped it was a tap');
});

test('seen whole, Shift with a mouse still moves across, and two fingers still pinch and move', () => {
  const { camera, drag, two, target } = rig({ distance: 3200, whole: () => true });
  const yaw = camera.goal.yaw;
  drag([195, 300], [195, 500], { pointerType: 'mouse', shiftKey: true, steps: 10, ms: 40 });
  assert.equal(camera.goal.yaw, yaw, 'not turned');
  assert.ok(Math.hypot(...target()) > 100, 'moved across');
  const before = camera.goal.distance;
  two(line([150, 400], [100, 400]), line([240, 400], [290, 400]));
  assert.ok(camera.goal.distance < before * 0.7, 'a spread comes nearer');
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
