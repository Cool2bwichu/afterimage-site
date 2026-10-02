import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { claudeModelLabel, statusModelLabel } from '../app/lib/claude.ts';

const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
const manifest = await readFile(new URL('../app/manifest.ts', import.meta.url), 'utf8');
const charting = await readFile(new URL('../app/components/charting.tsx', import.meta.url), 'utf8');
const starChart = await readFile(new URL('../app/components/star-chart.ts', import.meta.url), 'utf8');

test('Claude model IDs become readable names, and anything else is not named', () => {
  assert.equal(claudeModelLabel('claude-opus-5-5'), 'Claude Opus 5.5');
  assert.equal(claudeModelLabel('claude-sonnet-5-5'), 'Claude Sonnet 5.5');
  assert.equal(claudeModelLabel('claude-fable-5-1'), 'Claude Fable 5.1');
  assert.equal(claudeModelLabel('claude-opus-5'), 'Claude Opus 5');
  for (const value of ['gpt-6-astra', 'claude-haiku-4-5-20251001', '', null, 55, 'Claude Opus 5.5']) {
    assert.equal(claudeModelLabel(value), null);
  }
});

test('the connection status names the companion\'s model only when it reports one', () => {
  assert.equal(statusModelLabel({ authenticated: true, generation: { model: 'claude-opus-5-5' } }), 'Claude Opus 5.5');
  assert.equal(statusModelLabel({ authenticated: false, generation: { model: null } }), null);
  assert.equal(statusModelLabel({ error: 'The private intelligence service has not been connected yet.' }), null);
  assert.equal(statusModelLabel(null), null);
});

test('the shared Observatory keeps model-neutral charts and ChatGPT sign-in', () => {
  assert.match(page, /parseDeviceSignIn\(payload\)/);
  assert.match(page, /setAuthFlow\(signIn\)/);
  assert.match(page, /authFlow\.verificationUrl/);
  assert.match(page, /authFlow\.userCode/);
  assert.match(page, /Connect ChatGPT/);
  assert.match(page, /modelLabel/);
  assert.doesNotMatch(manifest, /programmed by Claude/);
  assert.doesNotMatch(charting, /Claude is charting/);
  assert.match(starChart, /CHARTED BY AFTERIMAGE/);
});
