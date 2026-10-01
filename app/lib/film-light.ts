// The room takes the light of the film on screen: each film in a reel lends the
// room one colour of the reel's palette. A colour too dark to show as light is
// lifted toward the palette's brightest colour, so every film visibly glows.

const HEX = /^#([0-9a-f]{6})$/i;

function channels(hex: string): [number, number, number] | null {
  const match = HEX.exec(hex);
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Relative luminance, 0 (black) to 1 (white), as WCAG defines it. */
export function luminance(hex: string): number {
  const rgb = channels(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map(value => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function mixHex(from: string, to: string, amount: number): string {
  const a = channels(from);
  const b = channels(to);
  if (!a || !b) return from;
  const t = Math.min(1, Math.max(0, amount));
  return `#${a.map((value, index) => Math.round(value + (b[index] - value) * t).toString(16).padStart(2, '0')).join('')}`;
}

export const ROOM_DEFAULT = '#254438';
const DIM = 0.06;

/** The colour the room takes for the film at `index` of a reel. */
export function filmLight(palette: readonly string[] | undefined, index: number): string {
  const colors = (palette ?? []).filter(color => HEX.test(color));
  if (!colors.length) return ROOM_DEFAULT;
  const own = colors[((index % colors.length) + colors.length) % colors.length].toLowerCase();
  if (luminance(own) >= DIM) return own;
  const brightest = [...colors].sort((a, b) => luminance(b) - luminance(a))[0].toLowerCase();
  // Lift the dark colour toward the brightest until it reads as light, keeping its hue.
  for (let step = 1; step <= 10; step += 1) {
    const lifted = mixHex(own, luminance(brightest) > DIM ? brightest : '#dec6a0', step / 10);
    if (luminance(lifted) >= DIM) return lifted;
  }
  return brightest;
}
