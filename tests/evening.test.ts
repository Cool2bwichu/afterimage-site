import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENINGS, eveningClause, eveningLabel, fitsDouble, parseEvening, runsPast, spokenEvening } from '../app/lib/evening.ts';
import { INTERMISSION_MINUTES } from '../app/lib/screening.ts';

test('an evening reads the same in a label, a sentence and a brief', () => {
  assert.equal(eveningLabel(null), 'Any length');
  assert.deepEqual(EVENINGS.map(eveningLabel), ['1½ hours', '2 hours', '3 hours', '4 hours']);
  assert.equal(spokenEvening(90), 'an hour and a half');
  for (const evening of EVENINGS) {
    assert.equal(parseEvening(eveningClause(evening)), evening);
    assert.equal(parseEvening(eveningClause(evening, true)), evening);
  }
  assert.equal(eveningClause(null), '', 'any length says nothing at all');
  assert.equal(parseEvening(undefined), null);
  assert.equal(parseEvening('A slow film for a long evening.'), null);
});

test('one film has to finish inside the evening; two have to fit with their intermission', () => {
  assert.equal(eveningClause(120), 'The evening is about two hours, so every film must finish inside that.');
  const double = eveningClause(180, true);
  assert.match(double, /^The whole evening is about three hours: the first two films together/);
  assert.match(double, new RegExp(`with a ${INTERMISSION_MINUTES}-minute intermission`));
  assert.match(double, /each of the others on its own/);
});

test('two films and an intermission rule out the short evenings', () => {
  assert.deepEqual(EVENINGS.filter(evening => fitsDouble(evening)), [180, 240]);
  assert.equal(fitsDouble(null), true);
});

test('a film runs past the evening only when it is known to, with a little room for "about"', () => {
  assert.equal(runsPast(124, 120), false);
  assert.equal(runsPast(126, 120), true);
  assert.equal(runsPast(200, null), false, 'any length is any length');
  assert.equal(runsPast(null, 90), false, 'a running time nobody knows never runs past');
  assert.equal(runsPast(undefined, 90), false);
});
