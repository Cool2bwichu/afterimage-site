'use client';

import { useEffect, useRef } from 'react';
import { hashString, seededRandom } from '../lib/sky';

/**
 * The living sky behind AFTERIMAGE: a deep field and Milky Way rendered once per size,
 * twinkling stars and the occasional meteor drawn per frame. A meteor leaves a fading
 * trail, an afterimage, which is the whole idea in miniature. It is atmosphere only and
 * never represents film data.
 */
export type NightSkyVariant = 'landing' | 'page' | 'atlas' | 'reel' | 'observatory';

export type Preset = { density: number; band: number; twinkles: number; bright: number; meteors: boolean; parallax: number; alpha: number };
export const PRESETS: Record<NightSkyVariant, Preset> = {
  landing: { density: 1, band: 1, twinkles: 110, bright: 13, meteors: true, parallax: 1, alpha: 1 },
  page: { density: .62, band: .55, twinkles: 70, bright: 7, meteors: true, parallax: .6, alpha: .78 },
  atlas: { density: .55, band: .4, twinkles: 46, bright: 4, meteors: false, parallax: .35, alpha: .85 },
  reel: { density: .5, band: .45, twinkles: 30, bright: 3, meteors: false, parallax: .25, alpha: .9 },
  observatory: { density: 1.15, band: 1.1, twinkles: 140, bright: 12, meteors: true, parallax: .45, alpha: 1 },
};

const PALETTE = ['#f4efe5', '#f4efe5', '#dec6a0', '#a7b6c5', '#9cbbb9', '#f1d9ae'];
type Star = { x: number; y: number; r: number; alpha: number; speed: number; phase: number; color: number; depth: number };
type Meteor = { x: number; y: number; dx: number; dy: number; length: number; born: number; life: number };

function glowSprite(color: string): HTMLCanvasElement {
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 64;
  const context = sprite.getContext('2d')!;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, color);
  gradient.addColorStop(.18, `${color}aa`);
  gradient.addColorStop(.45, `${color}22`);
  gradient.addColorStop(1, `${color}00`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return sprite;
}

function gaussian(random: () => number) {
  return Math.sqrt(-2 * Math.log(random() || 1e-9)) * Math.cos(2 * Math.PI * random());
}

/** The expensive, static part of the sky: faint field stars and one tilted galactic band. */
export const MARGIN = 28;
export function paintBackdrop(width: number, height: number, scale: number, preset: Preset, seed: number): HTMLCanvasElement {
  // Painted a little larger than the view so parallax never reveals an edge.
  width += MARGIN * 2;
  height += MARGIN * 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const context = canvas.getContext('2d')!;
  context.scale(scale, scale);
  const random = seededRandom(seed);
  const area = width * height;

  // The band crosses from lower left to upper right, a little off-centre like a real sky.
  const angle = -0.42;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const cx = width * .52;
  const cy = height * .55;
  const spread = Math.max(80, Math.min(width, height) * .16);
  const reach = Math.hypot(width, height) * .62;
  const along = () => (random() * 2 - 1) * reach;

  if (preset.band > 0) {
    const clouds = Math.round(28 * preset.band);
    for (let index = 0; index < clouds; index++) {
      const t = along();
      const offset = gaussian(random) * spread * .45;
      const x = cx + t * cos - offset * sin;
      const y = cy + t * sin + offset * cos;
      const radius = spread * (.6 + random() * 1.5);
      const warm = random() < .4;
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, warm ? 'rgba(176,145,101,0.055)' : 'rgba(103,126,150,0.06)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      context.fillStyle = gradient;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    const dust = Math.round(area / 260 * preset.band);
    for (let index = 0; index < dust; index++) {
      const t = along();
      const offset = gaussian(random) * spread * .55;
      const x = cx + t * cos - offset * sin;
      const y = cy + t * sin + offset * cos;
      context.globalAlpha = .04 + random() * .2;
      context.fillStyle = PALETTE[Math.floor(random() * PALETTE.length)];
      const size = random() < .92 ? .5 : .9;
      context.fillRect(x, y, size, size);
    }
    // Dark lanes of dust break the band so it reads as depth rather than a gradient.
    context.globalCompositeOperation = 'destination-out';
    for (let index = 0; index < Math.round(10 * preset.band); index++) {
      const t = along();
      const offset = gaussian(random) * spread * .18;
      const x = cx + t * cos - offset * sin;
      const y = cy + t * sin + offset * cos;
      const radius = spread * (.25 + random() * .5);
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, 'rgba(0,0,0,0.35)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      context.globalAlpha = 1;
      context.fillStyle = gradient;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    context.globalCompositeOperation = 'source-over';
  }

  const field = Math.round(area / 1500 * preset.density);
  for (let index = 0; index < field; index++) {
    context.globalAlpha = .12 + random() * .5;
    context.fillStyle = PALETTE[Math.floor(random() * PALETTE.length)];
    const radius = random() < .9 ? .35 + random() * .35 : .7 + random() * .45;
    context.beginPath();
    context.arc(random() * width, random() * height, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
  return canvas;
}

export function NightSky({ variant, running, className = '' }: { variant: NightSkyVariant; running: boolean; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runningRef = useRef(running);
  const wake = useRef<() => void>(() => {});

  useEffect(() => {
    runningRef.current = running;
    wake.current();
  }, [running]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const preset = PRESETS[variant];
    const seed = hashString(`afterimage-sky-${variant}`);
    const sprites = PALETTE.map(glowSprite);
    let width = 0;
    let height = 0;
    let scale = 1;
    let backdrop: HTMLCanvasElement | null = null;
    let stars: Star[] = [];
    let bright: Star[] = [];
    let meteors: Meteor[] = [];
    let nextMeteor = performance.now() + 2600 + Math.random() * 4000;
    let frame = 0;
    let visible = true;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const finePointer = window.matchMedia('(pointer: fine)').matches;

    function build() {
      const rect = host!.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.round(rect.width));
      const nextHeight = Math.max(1, Math.round(rect.height));
      if (nextWidth === width && Math.abs(nextHeight - height) < 120 && backdrop) return;
      width = nextWidth;
      height = nextHeight;
      scale = Math.min(window.devicePixelRatio || 1, 1.75);
      canvas!.width = Math.ceil(width * scale);
      canvas!.height = Math.ceil(height * scale);
      backdrop = paintBackdrop(width, Math.round(height * (variant === 'page' ? 1.18 : 1)), Math.min(scale, 1.5), preset, seed);
      const random = seededRandom(seed ^ 0x9e3779b9);
      const count = Math.round(preset.twinkles * Math.min(1.4, Math.max(.45, (width * height) / (1440 * 900))));
      stars = Array.from({ length: count }, () => ({
        x: random() * width, y: random() * height, r: .55 + random() * .9, alpha: .35 + random() * .55,
        speed: .35 + random() * 1.3, phase: random() * Math.PI * 2, color: Math.floor(random() * PALETTE.length), depth: .4 + random() * .6,
      }));
      bright = Array.from({ length: preset.bright }, () => ({
        x: random() * width, y: random() * height, r: 1.1 + random() * 1.1, alpha: .7 + random() * .3,
        speed: .2 + random() * .5, phase: random() * Math.PI * 2, color: [0, 2, 3, 5][Math.floor(random() * 4)], depth: 1,
      }));
    }

    function drawStar(star: Star, time: number, twinkle: number, dx: number, dy: number) {
      const shimmer = twinkle ? .72 + .28 * Math.sin(time / 1000 * star.speed * Math.PI * 2 + star.phase) : .86;
      const x = star.x + dx * star.depth;
      const y = star.y + dy * star.depth;
      const glow = star.r * 7;
      context!.globalAlpha = star.alpha * shimmer * .75;
      context!.drawImage(sprites[star.color], x - glow, y - glow, glow * 2, glow * 2);
      context!.globalAlpha = Math.min(1, star.alpha * shimmer * 1.1);
      context!.fillStyle = PALETTE[star.color];
      context!.beginPath();
      context!.arc(x, y, star.r * .55, 0, Math.PI * 2);
      context!.fill();
    }

    function drawSpikes(star: Star, time: number, twinkle: number, dx: number, dy: number) {
      const shimmer = twinkle ? .8 + .2 * Math.sin(time / 1000 * star.speed * Math.PI * 2 + star.phase) : .9;
      const x = star.x + dx;
      const y = star.y + dy;
      const length = star.r * 9 * shimmer;
      context!.globalAlpha = star.alpha * .5 * shimmer;
      context!.strokeStyle = PALETTE[star.color];
      context!.lineWidth = .6;
      context!.beginPath();
      context!.moveTo(x - length, y); context!.lineTo(x + length, y);
      context!.moveTo(x, y - length); context!.lineTo(x, y + length);
      context!.stroke();
    }

    function drawMeteor(meteor: Meteor, time: number) {
      const age = (time - meteor.born) / meteor.life;
      if (age >= 1) return false;
      const travelled = Math.min(1, age * 1.35);
      const headX = meteor.x + meteor.dx * travelled;
      const headY = meteor.y + meteor.dy * travelled;
      const fade = age < .74 ? 1 : 1 - (age - .74) / .26;
      const tail = meteor.length * (.35 + .65 * Math.min(1, age * 3));
      const norm = Math.hypot(meteor.dx, meteor.dy) || 1;
      const tailX = headX - meteor.dx / norm * tail;
      const tailY = headY - meteor.dy / norm * tail;
      // The afterimage: the whole path lingers faintly after the head has passed.
      context!.globalAlpha = .12 * fade;
      context!.strokeStyle = '#dec6a0';
      context!.lineWidth = .7;
      context!.beginPath(); context!.moveTo(meteor.x, meteor.y); context!.lineTo(headX, headY); context!.stroke();
      const gradient = context!.createLinearGradient(tailX, tailY, headX, headY);
      gradient.addColorStop(0, 'rgba(244,239,229,0)');
      gradient.addColorStop(1, 'rgba(244,239,229,0.95)');
      context!.globalAlpha = fade * (travelled < 1 ? 1 : .4);
      context!.strokeStyle = gradient;
      context!.lineWidth = 1.3;
      context!.beginPath(); context!.moveTo(tailX, tailY); context!.lineTo(headX, headY); context!.stroke();
      if (travelled < 1) { context!.globalAlpha = fade; context!.drawImage(sprites[0], headX - 7, headY - 7, 14, 14); }
      return true;
    }

    function render(time: number) {
      const animate = runningRef.current && visible;
      pointer.x += (pointer.tx - pointer.x) * .05;
      pointer.y += (pointer.ty - pointer.y) * .05;
      const scroll = variant === 'page' ? window.scrollY : 0;
      const dx = pointer.x * 14 * preset.parallax;
      const dy = pointer.y * 10 * preset.parallax - (scroll * .03) % height;
      context!.setTransform(scale, 0, 0, scale, 0, 0);
      context!.clearRect(0, 0, width, height);
      context!.globalAlpha = preset.alpha;
      if (backdrop) {
        // The galaxy drifts a little as the page scrolls, never far enough to show its edge.
        const drift = variant === 'page' ? Math.min(scroll * .012, height * .16) : 0;
        const backdropHeight = backdrop.height / backdrop.width * (width + MARGIN * 2);
        context!.drawImage(backdrop, -MARGIN + dx * .3, -MARGIN + pointer.y * 3 * preset.parallax - drift, width + MARGIN * 2, backdropHeight);
      }
      const wrap = (star: Star) => ({ ...star, y: ((star.y + dy * star.depth) % height + height) % height - dy * star.depth });
      for (const star of stars) drawStar(variant === 'page' ? wrap(star) : star, time, animate ? 1 : 0, dx, dy);
      for (const star of bright) { const placed = variant === 'page' ? wrap(star) : star; drawStar(placed, time, animate ? 1 : 0, dx, dy); drawSpikes(placed, time, animate ? 1 : 0, dx, dy); }
      if (animate && preset.meteors && time > nextMeteor) {
        const fromLeft = Math.random() < .5;
        const angle = (fromLeft ? .32 : Math.PI - .32) + (Math.random() - .5) * .3;
        const distance = Math.min(width, height) * (.28 + Math.random() * .3);
        meteors.push({ x: width * (.15 + Math.random() * .7), y: height * (.05 + Math.random() * .4), dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance, length: 60 + Math.random() * 90, born: time, life: 1500 + Math.random() * 700 });
        nextMeteor = time + 5200 + Math.random() * 9000;
      }
      meteors = animate ? meteors.filter(meteor => drawMeteor(meteor, time)) : [];
      context!.globalAlpha = 1;
      frame = animate ? requestAnimationFrame(render) : 0;
    }

    function start() {
      if (frame) return;
      frame = requestAnimationFrame(render);
    }
    wake.current = start;

    build();
    start();
    const resize = new ResizeObserver(() => { build(); start(); });
    resize.observe(host);
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) start(); }, { rootMargin: '120px' });
    intersection.observe(host);
    const move = (event: PointerEvent) => {
      pointer.tx = event.clientX / window.innerWidth - .5;
      pointer.ty = event.clientY / window.innerHeight - .5;
      if (runningRef.current) start();
    };
    if (finePointer && preset.parallax) window.addEventListener('pointermove', move, { passive: true });
    const scroll = () => start();
    if (variant === 'page') window.addEventListener('scroll', scroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      frame = 0;
      wake.current = () => {};
      resize.disconnect();
      intersection.disconnect();
      window.removeEventListener('pointermove', move);
      window.removeEventListener('scroll', scroll);
    };
  }, [variant]);

  return <canvas ref={canvasRef} className={`night-sky night-sky--${variant} ${className}`} aria-hidden="true" />;
}
