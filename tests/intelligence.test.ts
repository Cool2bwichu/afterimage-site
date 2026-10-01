import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeviceSignIn, statusIntelligence } from '../app/lib/intelligence.ts';

test('status names the configured Terra companion and accepts retained Claude editions', () => {
  assert.deepEqual(statusIntelligence({ generation: { model: 'gpt-5.6-terra' } }), { provider: 'chatgpt', model: 'GPT-5.6 Terra' });
  assert.deepEqual(statusIntelligence({ generation: { model: 'gpt-6-astra' } }), { provider: 'chatgpt', model: 'GPT-6 Astra' });
  assert.deepEqual(statusIntelligence({ generation: { model: 'claude-opus-5-5' } }), { provider: 'claude', model: 'Claude Opus 5.5' });
  for (const payload of [null, {}, { generation: null }, { generation: { model: null } }, { generation: { model: 'unknown' } }]) assert.equal(statusIntelligence(payload), null);
});

test('device sign-in accepts the bridge response and rejects malformed or unsafe links', () => {
  const flow = { verificationUrl: 'https://auth.openai.com/codex/device', userCode: 'ABCD-EFGH' };
  assert.deepEqual(parseDeviceSignIn(flow), flow);
  for (const payload of [null, {}, { alreadyAuthenticated: true }, { ...flow, userCode: '' }, { ...flow, verificationUrl: 'javascript:alert(1)' }, { ...flow, verificationUrl: 'https://user:password@example.com' }]) assert.equal(parseDeviceSignIn(payload), null);
});
