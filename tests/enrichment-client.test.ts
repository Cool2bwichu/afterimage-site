import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');

test('refreshes legacy matched metadata that lacks a TMDB rating', () => {
  assert.match(page, /metadata\?\.status === 'matched' && metadata\.tmdbRating === null/);
});
