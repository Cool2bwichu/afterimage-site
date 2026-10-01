import { claudeModelLabel } from './claude.ts';

export type IntelligenceProvider = 'chatgpt' | 'claude';

// Name only a model reported by the companion. The UI never chooses the model.
export function statusIntelligence(payload: unknown): { provider: IntelligenceProvider; model: string | null } | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const generation = (payload as { generation?: unknown }).generation;
  if (typeof generation !== 'object' || generation === null) return null;
  const model = (generation as { model?: unknown }).model;
  const claude = claudeModelLabel(model);
  if (claude) return { provider: 'claude', model: claude };
  if (typeof model !== 'string') return null;
  const match = /^gpt-(\d+(?:\.\d+)?)(?:-([a-z]+))?$/.exec(model.trim());
  if (!match) return null;
  return { provider: 'chatgpt', model: `GPT-${match[1]}${match[2] ? ` ${match[2][0].toUpperCase()}${match[2].slice(1)}` : ''}` };
}

export type DeviceSignIn = { verificationUrl: string; userCode: string };

export function parseDeviceSignIn(payload: unknown): DeviceSignIn | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const { verificationUrl, userCode } = payload as Record<string, unknown>;
  if (typeof verificationUrl !== 'string' || typeof userCode !== 'string' || !userCode.trim()) return null;
  try {
    const url = new URL(verificationUrl);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
  } catch { return null; }
  return { verificationUrl, userCode };
}
