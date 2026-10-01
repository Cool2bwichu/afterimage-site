'use client';

import { hashString, threadFigure } from '../lib/sky';
import { MARGIN, PRESETS, paintBackdrop } from './night-sky';
import { saveFile } from '../lib/save-file';

export type StarChartData = {
  seed: string;
  persona: string;
  insight: string;
  palette: string[];
  films: Array<{ title: string; year: string }>;
  chartedAt?: Date;
};

const WIDTH = 1080;
const HEIGHT = 1350;
const INK = '#080d14';
const IVORY = '#f4efe5';
const STARLIGHT = '#dec6a0';
const MUTED = '#a7b6c5';

function fontFamily(variable: string, fallback: string) {
  const value = getComputedStyle(document.body).getPropertyValue(variable).trim();
  return value ? `${value}, ${fallback}` : fallback;
}

function spaced(context: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number, align: 'center' | 'left' = 'center') {
  const widths = [...text].map(char => context.measureText(char).width);
  const total = widths.reduce((sum, width) => sum + width, 0) + spacing * (text.length - 1);
  let cursor = align === 'center' ? x - total / 2 : x;
  const previous = context.textAlign;
  context.textAlign = 'left';
  [...text].forEach((char, index) => { context.fillText(char, cursor, y); cursor += widths[index] + spacing; });
  context.textAlign = previous;
}

function wrap(context: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) { lines.push(line); line = word; }
    else line = candidate;
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[,.;:]?$/, '')}…`;
  return lines;
}

function glow(context: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, strength: number) {
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(.25, `${color}88`);
  gradient.addColorStop(1, `${color}00`);
  context.globalAlpha = strength;
  context.fillStyle = gradient;
  context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
  context.globalAlpha = 1;
}

/** A portrait star chart of one reel, drawn entirely from its own words and palette. */
export async function renderStarChart(data: StarChartData): Promise<Blob> {
  const display = fontFamily('--font-display', 'Georgia, serif');
  const sans = fontFamily('--font-sans', 'system-ui, sans-serif');
  await Promise.all([
    document.fonts.load(`italic 400 72px ${display}`),
    document.fonts.load(`400 40px ${display}`),
    document.fonts.load(`500 20px ${sans}`),
  ]).catch(() => undefined);

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d')!;
  const seed = hashString(data.seed);

  context.fillStyle = INK;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  const wash = context.createRadialGradient(WIDTH / 2, 640, 40, WIDTH / 2, 640, 720);
  wash.addColorStop(0, '#1b2835');
  wash.addColorStop(1, '#080d1400');
  context.fillStyle = wash;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.drawImage(paintBackdrop(WIDTH, HEIGHT, 1, { ...PRESETS.landing, density: 1.25, band: 1.15 }, seed), -MARGIN, -MARGIN);

  // A quiet instrument frame.
  context.strokeStyle = STARLIGHT;
  context.globalAlpha = .28;
  context.lineWidth = 1;
  context.strokeRect(44, 44, WIDTH - 88, HEIGHT - 88);
  context.globalAlpha = .5;
  for (const [x, y] of [[44, 44], [WIDTH - 44, 44], [44, HEIGHT - 44], [WIDTH - 44, HEIGHT - 44]]) {
    context.beginPath(); context.moveTo(x - 10, y); context.lineTo(x + 10, y); context.moveTo(x, y - 10); context.lineTo(x, y + 10); context.stroke();
  }
  context.globalAlpha = .16;
  context.beginPath(); context.ellipse(WIDTH / 2, 640, 420, 300, 0, 0, Math.PI * 2); context.stroke();
  context.setLineDash([2, 10]);
  context.beginPath(); context.ellipse(WIDTH / 2, 640, 455, 330, 0, 0, Math.PI * 2); context.stroke();
  context.setLineDash([]);
  context.globalAlpha = 1;

  context.textAlign = 'center';
  context.fillStyle = IVORY;
  context.font = `500 24px ${sans}`;
  spaced(context, 'AFTERIMAGE', WIDTH / 2, 118, 10);
  context.fillStyle = STARLIGHT;
  context.font = `500 16px ${sans}`;
  spaced(context, 'A STAR CHART OF YOUR REEL', WIDTH / 2, 176, 5);

  context.fillStyle = IVORY;
  context.font = `italic 400 70px ${display}`;
  const titleLines = wrap(context, data.persona, 880, 2);
  titleLines.forEach((line, index) => context.fillText(line, WIDTH / 2, 262 + index * 72));

  const figure = threadFigure(data.seed, data.films.length);
  const center = { x: WIDTH / 2, y: 640 + (titleLines.length - 1) * 20 };
  const points = figure.map(point => ({ x: center.x + point.x * 320, y: center.y + point.y * 210 }));
  const centroid = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });

  context.save();
  context.shadowColor = STARLIGHT;
  context.shadowBlur = 14;
  context.strokeStyle = STARLIGHT;
  context.globalAlpha = .72;
  context.lineWidth = 2;
  context.beginPath();
  points.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
  context.stroke();
  context.restore();

  points.forEach((point, index) => {
    const color = /^#[0-9a-f]{6}$/i.test(data.palette[index] ?? '') ? data.palette[index] : STARLIGHT;
    glow(context, point.x, point.y, index === 0 ? 70 : 52, color, .85);
    glow(context, point.x, point.y, 22, '#fff6e6', .9);
    context.fillStyle = '#fffaf0';
    context.beginPath(); context.arc(point.x, point.y, index === 0 ? 7 : 5.5, 0, Math.PI * 2); context.fill();
    if (index === 0) {
      context.strokeStyle = '#fffaf0'; context.globalAlpha = .75; context.lineWidth = 1.2;
      context.beginPath(); context.moveTo(point.x - 34, point.y); context.lineTo(point.x + 34, point.y); context.moveTo(point.x, point.y - 34); context.lineTo(point.x, point.y + 34); context.stroke();
      context.globalAlpha = 1;
    }
    const direction = { x: point.x - centroid.x, y: point.y - centroid.y };
    const length = Math.hypot(direction.x, direction.y) || 1;
    const offset = { x: direction.x / length * 30, y: direction.y / length * 30 };
    const alignRight = offset.x < -4;
    context.textAlign = alignRight ? 'right' : offset.x > 4 ? 'left' : 'center';
    const labelX = point.x + offset.x + (alignRight ? -6 : offset.x > 4 ? 6 : 0);
    const labelY = point.y + offset.y + (offset.y > 0 ? 26 : -8);
    context.fillStyle = STARLIGHT;
    context.font = `500 15px ${sans}`;
    context.fillText(String(index + 1).padStart(2, '0'), labelX, labelY - 30);
    context.fillStyle = IVORY;
    context.font = `400 31px ${display}`;
    const title = data.films[index].title.length > 30 ? `${data.films[index].title.slice(0, 29)}…` : data.films[index].title;
    context.fillText(title, labelX, labelY);
    context.fillStyle = MUTED;
    context.font = `400 16px ${sans}`;
    context.fillText(data.films[index].year, labelX, labelY + 24);
  });

  context.textAlign = 'center';
  const swatches = data.palette.filter(color => /^#[0-9a-f]{6}$/i.test(color)).slice(0, 5);
  swatches.forEach((color, index) => {
    const x = WIDTH / 2 + (index - (swatches.length - 1) / 2) * 34;
    context.fillStyle = color;
    context.beginPath(); context.arc(x, 1000, 10, 0, Math.PI * 2); context.fill();
    context.strokeStyle = '#f4efe533'; context.lineWidth = 1; context.stroke();
  });

  context.fillStyle = '#e6dfd0';
  context.font = `italic 400 31px ${display}`;
  wrap(context, data.insight, 820, 4).forEach((line, index) => context.fillText(line, WIDTH / 2, 1070 + index * 40));

  const charted = (data.chartedAt ?? new Date()).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  context.fillStyle = MUTED;
  context.font = `500 14px ${sans}`;
  spaced(context, `FIVE FILMS, A THREAD BETWEEN THEM · CHARTED BY CLAUDE · ${charted.toUpperCase()}`, WIDTH / 2, HEIGHT - 76, 2.6);

  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The star chart could not be drawn.')), 'image/png'));
}

export async function saveStarChart(data: StarChartData): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = await renderStarChart(data);
  const slug = data.persona.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'reel';
  const name = `afterimage-${slug}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  if (window.matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: `${data.persona} · AFTERIMAGE` }); return 'shared'; }
    catch (reason) { if (reason instanceof DOMException && reason.name === 'AbortError') return 'cancelled'; }
  }
  return saveFile(name, blob);
}
