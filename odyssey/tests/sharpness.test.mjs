// How finely the moving sky is drawn: a step coarser when frames come slowly, finer again when they come
// easily, and left sharp on a device that holds its frames back whatever is drawn.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSharpness, STEPS, WINDOW } from '../src/cosmos/sharpness.mjs';

/** Feeds `windows` windows of frames, each frame `gap` ms (or gap(step) ms) after the one before. */
function feed(sharp, gap, windows = 1) {
  for (let n = 0; n < windows * WINDOW; n += 1) sharp.frame(typeof gap === 'function' ? gap(sharp.step) : gap);
}

test('easy frames leave the sky at its finest', () => {
  const sharp = createSharpness();
  feed(sharp, 16.7, 10);
  assert.equal(sharp.step, 0);
  assert.equal(sharp.scale, 1);
});

test('slow frames step the moving sky coarser, one window at a time, as far as the coarsest', () => {
  const changes = [];
  const sharp = createSharpness({ onChange: step => changes.push(step) });
  // Each step is quicker than the last, but never quick enough: a phone deep in a star system.
  const gap = step => 40 - step * 6;
  feed(sharp, gap, 1);
  assert.equal(sharp.step, 1);
  feed(sharp, gap, 2);
  assert.equal(sharp.step, STEPS.length - 1);
  feed(sharp, gap, 4);
  assert.equal(sharp.step, STEPS.length - 1, 'coarser and quicker than at the finest: it stays coarse');
  assert.deepEqual(changes, [1, 2, 3]);
});

test('a window that is mostly easy is not slow because of a few long frames', () => {
  const sharp = createSharpness();
  for (let n = 0; n < WINDOW; n += 1) sharp.frame(n % 5 === 0 ? 60 : 16.7);
  assert.equal(sharp.step, 0);
});

test('easy frames bring it back finer, step by step', () => {
  const sharp = createSharpness();
  feed(sharp, 30, 1);
  feed(sharp, 25, 1);
  assert.equal(sharp.step, 2);
  feed(sharp, 16.7, 4);
  assert.equal(sharp.step, 2, 'not after a few easy windows');
  feed(sharp, 16.7, 1);
  assert.equal(sharp.step, 1, 'after five');
  feed(sharp, 16.7, 5);
  assert.equal(sharp.step, 0);
});

test('a finer step that could not be kept is tried again only much later', () => {
  const sharp = createSharpness();
  feed(sharp, 30, 1); // to step 1
  feed(sharp, 16.7, 5); // tries step 0
  assert.equal(sharp.step, 0);
  feed(sharp, 30, 1); // step 0 is slow again: refused
  assert.equal(sharp.step, 1);
  feed(sharp, 16.7, 13);
  assert.equal(sharp.step, 1, 'thirteen easy windows are not enough to try it again');
  feed(sharp, 16.7, 1);
  assert.equal(sharp.step, 0);
});

test('a device that holds its frames back is left sharp, and frames as slow as before stay acceptable', () => {
  const changes = [];
  const sharp = createSharpness({ onChange: step => changes.push(step) });
  // Thirty frames a second whatever is drawn: a phone saving its battery.
  feed(sharp, 33.3, 3);
  assert.equal(sharp.step, STEPS.length - 1);
  feed(sharp, 33.3, 1);
  assert.equal(sharp.step, STEPS.length - 1, 'one window at the coarsest is not enough to judge');
  feed(sharp, 33.3, 1);
  assert.equal(sharp.step, 0, 'twice as coarse as it goes and no quicker: sharp again');
  feed(sharp, 33.3, 10);
  assert.equal(sharp.step, 0, 'the held-back pace no longer counts as slow');
  feed(sharp, 55, 1);
  assert.equal(sharp.step, 1, 'much slower than the held-back pace is still slow');
  assert.deepEqual(changes, [1, 2, 3, 0, 1]);
});

test('once frames come easily again, the ordinary measure of slow returns', () => {
  const sharp = createSharpness();
  feed(sharp, 33.3, 5); // held back, and left sharp
  assert.equal(sharp.step, 0);
  feed(sharp, 16.7, 1); // the battery saving ends
  feed(sharp, 30, 1);
  assert.equal(sharp.step, 1, 'thirty ms apart is slow again');
});

test('forgetting drops the frames weighed so far', () => {
  const sharp = createSharpness();
  for (let n = 0; n < WINDOW - 1; n += 1) sharp.frame(40);
  sharp.forget();
  sharp.frame(40);
  assert.equal(sharp.step, 0, 'one frame after forgetting decides nothing');
  for (let n = 0; n < WINDOW - 1; n += 1) sharp.frame(40);
  assert.equal(sharp.step, 1);
});
