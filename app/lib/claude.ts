// This version of AFTERIMAGE is programmed by Claude. The companion reports its
// configured model ID with the connection status; the site names that model.
const MODEL_ID = /^claude-([a-z]+)-(\d+)(?:-(\d+))?$/;

export function claudeModelLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = MODEL_ID.exec(value.trim());
  if (!match) return null;
  const [, family, major, minor] = match;
  return `Claude ${family[0].toUpperCase()}${family.slice(1)} ${minor ? `${major}.${minor}` : major}`;
}

export function statusModelLabel(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const generation = (payload as { generation?: unknown }).generation;
  if (typeof generation !== 'object' || generation === null) return null;
  return claudeModelLabel((generation as { model?: unknown }).model);
}
