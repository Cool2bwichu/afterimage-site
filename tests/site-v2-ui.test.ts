import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
const route = await readFile(new URL('../app/api/develop/route.ts', import.meta.url), 'utf8');
const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');

test('the private Site proxy targets the protected V2 bridge route', () => {
  assert.match(route, /forwardToBridge\('\/v2\/generate', request\)/);
  assert.doesNotMatch(route, /\/v1\/generate/);
});

test('the page wires the flexible V2 state contract into readiness, payload, and hydration', () => {
  for (const helper of ['buildDevelopPayload', 'canDevelop', 'getInputStatus', 'parseStoredState']) {
    assert.match(page, new RegExp(`\\b${helper}\\b`));
  }
  assert.match(page, /canDevelop\(films, creativeBrief\)/);
  assert.match(page, /JSON\.stringify\(buildDevelopPayload\(films, creativeBrief\)\)/);
  assert.match(page, /parseStoredState\(localStorage\.getItem\(STORAGE_KEY\)\)/);
  assert.match(page, /JSON\.stringify\(\{ version: 2, films, creativeBrief, result \}\)/);
});

test('the optional inputs use the approved copy and client boundaries', () => {
  assert.match(page, /Add films you love, describe what you are searching for,\s+or combine both\./);
  assert.match(page, /Reference Reel · Optional/);
  assert.match(page, /Primary or supporting · \{creativeBrief\.length\}\/1200/);
  assert.match(page, /maxLength=\{160\}/);
  assert.match(page, /films\.length >= 20/);
});

test('recommendation cards expose collective program notes and no one-film pairing', () => {
  assert.match(page, /className="watch-for"/);
  assert.match(page, /recommendation\.watchFor/);
  assert.doesNotMatch(page, /pairsWith|pairs-with/i);
  assert.match(css, /\.watch-for\s*\{/);
  assert.doesNotMatch(css, /\.pairs-with\s*\{/);
  assert.match(page, /TOTAL SYNTHESIS/);
});
