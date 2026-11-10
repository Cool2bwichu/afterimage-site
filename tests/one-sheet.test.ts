import assert from 'node:assert/strict';
import test from 'node:test';

import { billingBlock, sheetDescription, sheetFilename, sheetNumber } from '../app/lib/one-sheet.ts';

const films = ['The Green Ray', 'After Yang', 'Still Walking', 'The Rider', 'Columbus'].map((title, index) => ({ title, year: String(1986 + index) }));
const data = { seed: 'reel-1', persona: 'Patient Longing', insight: 'Distance gives tenderness its shape.', palette: [], sensibilities: ['patient framing', 'soft restraint', 'quiet voices'], director: 'Wim Wenders', films };

test('the billing block bills the reel the way a poster would', () => {
  const runs = billingBlock(data);
  assert.equal(runs.map(run => run.text).join(' '), 'AFTERIMAGE presents a reel in five films PATIENT LONGING in the spirit of WIM WENDERS starring THE GREEN RAY with AFTER YANG with STILL WALKING with THE RIDER and COLUMBUS programmed for YOU');
  assert.ok(runs.filter(run => !run.small).every(run => run.text === run.text.toLocaleUpperCase()));
  assert.equal(runs.at(-1)?.small, false);
});

test('a reel with no named director leaves the line out', () => {
  assert.doesNotMatch(billingBlock({ ...data, director: ' ' }).map(run => run.text).join(' '), /spirit/);
});

test('a one-sheet has a stable number and a safe filename', () => {
  assert.match(sheetNumber('reel-1'), /^\d{4}$/);
  assert.equal(sheetNumber('reel-1'), sheetNumber('reel-1'));
  assert.equal(sheetFilename('Néon / Solitude!'), 'afterimage-one-sheet-n-on-solitude.png');
  assert.equal(sheetFilename('···'), 'afterimage-one-sheet-reel.png');
});

test('the poster is described in words for anyone who cannot see it', () => {
  const text = sheetDescription(data);
  for (const part of ['Patient Longing', 'quiet voices', 'Wim Wenders', 'Columbus (1990)']) assert.ok(text.includes(part));
});
