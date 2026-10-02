import test from 'node:test';
import assert from 'node:assert/strict';

import { ROOM_DEFAULT, filmLight, luminance, mixHex } from '../app/lib/film-light.ts';
import { ordinal, ticketSerial } from '../app/lib/ticket.ts';

const palette = ['#101820', '#2b3a42', '#c8a97e', '#e8dcc8', '#7a3b2e'];

test('each film lends the room its own colour from the reel palette', () => {
  assert.equal(filmLight(palette, 2), '#c8a97e');
  assert.equal(filmLight(palette, 4), '#7a3b2e');
  assert.equal(filmLight(palette, 7), '#c8a97e', 'positions wrap around the palette');
  assert.equal(filmLight([], 0), ROOM_DEFAULT);
  assert.equal(filmLight(undefined, 0), ROOM_DEFAULT);
  assert.equal(filmLight(['not a colour'], 0), ROOM_DEFAULT);
});

test('a colour too dark to read as light is lifted toward the brightest, keeping its place', () => {
  const lifted = filmLight(palette, 0);
  assert.notEqual(lifted, '#101820');
  assert.ok(luminance(lifted) >= 0.06, lifted);
  assert.ok(luminance(lifted) < luminance('#e8dcc8'));
  const allDark = filmLight(['#050505', '#0a0a0a'], 0);
  assert.ok(luminance(allDark) >= 0.06, allDark);
  assert.equal(mixHex('#000000', '#ffffff', .5), '#808080');
});

test('ticket stubs count films in order and carry a stable number', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th']);
  const entry = { title: 'Columbus', year: '2017', watchedOn: '2026-10-01' };
  assert.match(ticketSerial(entry), /^\d{6}$/);
  assert.equal(ticketSerial(entry), ticketSerial({ ...entry, title: 'COLUMBUS' }));
  assert.notEqual(ticketSerial(entry), ticketSerial({ ...entry, watchedOn: '2026-10-02' }));
});
