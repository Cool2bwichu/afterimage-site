// Tonight's comet: one film a night that the chart thinks you are missing,
// the same all night and another the next, never one you keep or have reached.
import assert from 'node:assert/strict';
import test from 'node:test';

import { cometFor, cometPath, nightOf } from '../src/engine/comet.mjs';
import { LIGHT_IDS } from '../src/engine/lights.mjs';
import { open, star } from './chart.mjs';

const { universe } = open();
const { films, base } = universe;

test('a night runs from five in the morning to five the next', () => {
  assert.equal(nightOf(new Date(2026, 10, 13, 21, 0)), '2026-11-13');
  assert.equal(nightOf(new Date(2026, 10, 14, 2, 30)), '2026-11-13', 'after midnight it is still tonight');
  assert.equal(nightOf(new Date(2026, 10, 14, 6, 0)), '2026-11-14');
  assert.equal(nightOf(new Date(2027, 0, 1, 3, 0)), '2026-12-31');
});

test('tonight\'s comet is the same all night, and most nights another', () => {
  assert.deepEqual(cometFor(universe, { night: '2026-11-13' }), cometFor(universe, { night: '2026-11-13' }));
  const nights = ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18'];
  assert.ok(new Set(nights.map(night => cometFor(universe, { night }).star)).size >= 5);
});

test('with nothing kept, it carries a film few have found, beside one everyone knows', () => {
  for (const night of ['2026-11-13', '2026-12-25', '2027-01-01']) {
    const comet = cometFor(universe, { night });
    assert.ok(comet && comet.star >= 0 && comet.star < base, 'a charted film');
    assert.equal(comet.why, 'known');
    assert.ok((films[comet.star].rn ?? 0) <= 1, `${films[comet.star].t} is seldom seen`);
    assert.ok((films[comet.from].rn ?? 0) >= 3, `${films[comet.from].t} is known to all`);
    assert.ok(LIGHT_IDS.includes(comet.light));
  }
});

test('with films you love, it carries one they pull toward you, never one you keep or have reached', () => {
  const loved = ['vertigo-1958', 'in-the-mood-for-love-2000', 'spirited-away-2001'].map(slug => star(universe, slug, 80));
  const visited = [...loved, star(universe, 'mulholland-drive-2001', 80)];
  const seen = new Set([star(universe, 'rebecca-1940', 80)]);
  const carried = new Set();
  for (const night of ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16']) {
    const comet = cometFor(universe, { night, loved, visited, exclude: seen });
    assert.equal(comet.why, 'loved');
    assert.ok(loved.includes(comet.from), 'it came from near a film you love');
    assert.ok(!visited.includes(comet.star) && !seen.has(comet.star), 'not one you have reached or watched');
    assert.ok((films[comet.star].rn ?? 0) <= 2, 'one few have found');
    assert.ok(comet.shared.length > 0, 'what it shares with the film it came from can be said');
    carried.add(comet.star);
  }
  assert.ok(carried.size >= 3);
  // Before loving anything, the films reached lead it.
  const wandering = cometFor(universe, { night: '2026-11-13', visited });
  assert.equal(wandering.why, 'visited');
  assert.ok(visited.includes(wandering.from) && !visited.includes(wandering.star));
});

test('a film carried before is not carried again', () => {
  const first = cometFor(universe, { night: '2026-11-13' });
  const again = cometFor(universe, { night: '2026-11-13', exclude: new Set([first.star]) });
  assert.notEqual(again.star, first.star);
});

test('its way across the sky is fixed by the night, and mostly level', () => {
  const path = cometPath('2026-11-13');
  assert.deepEqual(path, cometPath('2026-11-13'));
  assert.notDeepEqual(path, cometPath('2026-11-14'));
  assert.ok(Math.abs(Math.hypot(...path.from) - 1) < 1e-9 && Math.abs(Math.hypot(...path.bend) - 1) < 1e-9);
  assert.ok(path.from[1] > 0 && path.from[1] < 0.3);
  assert.ok(Math.abs(path.from[0] * path.bend[0] + path.from[2] * path.bend[2]) < 1e-9, 'it bends to one side of its way');
});
