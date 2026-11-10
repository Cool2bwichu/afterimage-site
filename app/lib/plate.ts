// A plate is the afterimage of one film, drawn: a small piece of poster art composed from
// what the site already knows about it. Its title and year seed the drawing, the reel's
// palette colours it, and the words of its four qualities choose what it depicts. The same
// film always develops the same plate, and nothing is fetched or asked of anyone.

import { hashString, seededRandom } from './sky.ts';

export const PLATE_MOTIFS = ['sun', 'eclipse', 'city', 'rings', 'duet', 'shards', 'window', 'iris'] as const;
export type PlateMotif = typeof PLATE_MOTIFS[number];
export type PlateShape = 'poster' | 'wide' | 'square';

export type PlateInput = {
  title: string;
  year: string;
  /** The reel's five colours; fewer, or none, still makes a plate. */
  palette?: readonly string[];
  /** Words describing the film: its facet labels and traits, or anything else known. */
  words?: readonly string[];
  /** The film's place in its reel, so siblings lead with different colours. */
  index?: number;
  /** The picture to draw, when the reel has already shared its motifs out. */
  motif?: PlateMotif;
};

export type PlateDesign = {
  motif: PlateMotif;
  seed: number;
  ground: string;
  deep: string;
  lead: string;
  second: string;
  light: string;
  /** The lead colour's complement: the colour its afterimage would have on the eye. */
  ghost: string;
};

const HEX = /^#[0-9a-f]{6}$/i;
const INK = '#080d14';
const FALLBACK = ['#101923', '#2f4a5a', '#dec6a0', '#f4efe5', '#b5533c'];
export const PLATE_SIZE: Record<PlateShape, { width: number; height: number }> = {
  poster: { width: 400, height: 600 },
  wide: { width: 800, height: 450 },
  square: { width: 400, height: 400 },
};

// Which words pull a film toward which picture. The first motif with the most hits wins;
// a film with no telling words takes the motif its title lands on.
const LEXICON: Record<PlateMotif, readonly string[]> = {
  sun: ['road', 'desert', 'landscape', 'pastoral', 'summer', 'heat', 'horizon', 'rural', 'western', 'nature', 'sea', 'coast', 'journey', 'golden', 'dusk', 'dawn', 'open', 'wide', 'drift'],
  eclipse: ['grief', 'loss', 'cosmic', 'space', 'science', 'future', 'dread', 'mystery', 'myth', 'faith', 'death', 'mourning', 'void', 'apocalyp', 'spirit', 'haunt', 'ghost', 'sublime'],
  city: ['city', 'urban', 'neon', 'night', 'nocturnal', 'street', 'crime', 'metropol', 'apartment', 'tokyo', 'hong kong', 'paris', 'new york', 'crowd', 'modern', 'architecture'],
  rings: ['memory', 'dream', 'time', 'loop', 'obsess', 'hypno', 'trance', 'surreal', 'psychedel', 'echo', 'repetition', 'ritual', 'music', 'reverie', 'vertig', 'spiral'],
  duet: ['romance', 'romantic', 'longing', 'love', 'intimate', 'tender', 'two', 'couple', 'friendship', 'yearning', 'desire', 'melodrama', 'chamber', 'marriage', 'touch'],
  shards: ['noir', 'thriller', 'violence', 'restless', 'kinetic', 'paranoi', 'tension', 'jagged', 'fractur', 'chaos', 'anxious', 'heist', 'war', 'handheld', 'frantic', 'suspense'],
  window: ['family', 'domestic', 'interior', 'room', 'home', 'house', 'quiet', 'observ', 'everyday', 'still', 'patient', 'restraint', 'silence', 'minimal', 'solitude', 'isolat'],
  iris: ['gaze', 'voyeur', 'watch', 'cinema', 'identity', 'portrait', 'face', 'close', 'psycholog', 'mirror', 'double', 'surveil', 'performance', 'eye', 'look'],
};

type Hsl = [number, number, number];

function toHsl(hex: string): Hsl {
  const value = parseInt(hex.slice(1), 16);
  const r = ((value >> 16) & 255) / 255, g = ((value >> 8) & 255) / 255, b = (value & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const l = (max + min) / 2;
  if (!delta) return [0, 0, l];
  const s = delta / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / delta + 6) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return [h * 60, s, l];
}

function fromHsl([h, s, l]: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s, hp = (((h % 360) + 360) % 360) / 60, x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return `#${[r, g, b].map(channel => Math.round(Math.min(1, Math.max(0, channel + m)) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/** How far a colour is from grey, 0 to 1. */
function chroma(hex: string): number {
  const [, sat, light] = toHsl(hex);
  return sat * (1 - Math.abs(2 * light - 1));
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

function mix(from: string, to: string, amount: number): string {
  const a = parseInt(from.slice(1), 16), b = parseInt(to.slice(1), 16);
  return `#${[16, 8, 0].map(shift => Math.round(((a >> shift) & 255) + ((((b >> shift) & 255) - ((a >> shift) & 255)) * amount)).toString(16).padStart(2, '0')).join('')}`;
}

/** The colour an afterimage of `hex` would take: its opposite on the wheel, kept luminous. */
export function complement(hex: string): string {
  if (!HEX.test(hex)) return '#9cbbb9';
  const [h, s, l] = toHsl(hex);
  return fromHsl([h + 180, clamp(s, 0.35, 0.8), clamp(l, 0.55, 0.72)]);
}

/** Every motif, best first, for one film: by how many of its words point there, then by its title. */
function rankedMotifs(input: Pick<PlateInput, 'title' | 'year' | 'words'>): PlateMotif[] {
  const text = (input.words ?? []).join(' ').toLowerCase();
  const start = hashString(`${input.title.trim().toLowerCase()}|${input.year}|motif`) % PLATE_MOTIFS.length;
  const order = PLATE_MOTIFS.map((_, index) => PLATE_MOTIFS[(start + index) % PLATE_MOTIFS.length]);
  const hits = (motif: PlateMotif) => text ? LEXICON[motif].reduce((count, word) => count + (text.includes(word) ? 1 : 0), 0) : 0;
  return order.map((motif, index) => ({ motif, hits: hits(motif), index })).sort((a, b) => b.hits - a.hits || a.index - b.index).map(item => item.motif);
}

export function plateMotif(input: Pick<PlateInput, 'title' | 'year' | 'words'>): PlateMotif {
  return rankedMotifs(input)[0];
}

/**
 * Motifs for the films of one reel. Films chosen together share their words, so left alone
 * they would all draw the same picture; each takes its best motif that no earlier film has.
 */
export function reelMotifs(films: readonly Pick<PlateInput, 'title' | 'year' | 'words'>[]): PlateMotif[] {
  const taken = new Set<PlateMotif>();
  return films.map(film => {
    const ranked = rankedMotifs(film);
    const motif = ranked.find(candidate => !taken.has(candidate)) ?? ranked[0];
    taken.add(motif);
    return motif;
  });
}

/** The decisions behind a plate: what it shows and in which colours. */
export function plateDesign(input: PlateInput): PlateDesign {
  const seed = hashString(`${input.title.trim().toLowerCase()}|${input.year}`);
  const given = (input.palette ?? []).filter(color => HEX.test(color)).map(color => color.toLowerCase());
  const colors = given.length >= 2 ? given : FALLBACK;
  const byLight = [...colors].sort((a, b) => toHsl(a)[2] - toHsl(b)[2]);
  const darkest = byLight[0];
  // A grey has no hue of its own, so its ground takes the room's blue-black.
  const [dh, ds] = chroma(darkest) < 0.03 ? [215, 0.3] : toHsl(darkest);
  // The ground keeps the hue of the reel's darkest colour but sits close to the room's ink.
  const ground = mix(fromHsl([dh, clamp(ds, 0.2, 0.55), 0.13]), INK, 0.25);
  const deep = fromHsl([dh, clamp(ds, 0.2, 0.5), 0.22]);
  // Colours with some life in them can lead; each film of a reel takes the next one round.
  const vivid = colors.filter(color => chroma(color) > 0.14 && toHsl(color)[2] > 0.16 && color !== darkest);
  const leads = vivid.length ? vivid : colors.filter(color => color !== darkest);
  const turn = (input.index ?? seed) % leads.length;
  // A reel in black and white keeps plates in black and white.
  const mono = !vivid.length;
  const lift = (color: string): string => { const [h, s, l] = toHsl(color); return mono ? fromHsl([h, Math.min(s, 0.1), clamp(l, 0.62, 0.8)]) : fromHsl([h, clamp(s * 1.25, 0.5, 0.86), clamp(l, 0.5, 0.64)]); };
  const lead = lift(leads[turn]);
  const next = leads[(turn + 1) % leads.length];
  const [lh] = toHsl(lead);
  const [nh, ns, nl] = toHsl(next);
  // Two colours too close to tell apart make a flat picture: push the second round the wheel.
  const apart = Math.min(Math.abs(nh - lh), 360 - Math.abs(nh - lh));
  const second = mono ? fromHsl([lh, 0.06, 0.42]) : leads.length > 1 && apart > 24 ? fromHsl([nh, clamp(ns * 1.15, 0.4, 0.8), clamp(nl, 0.42, 0.6)]) : fromHsl([lh + 150, 0.5, 0.52]);
  const brightest = byLight[byLight.length - 1];
  const [bh, bs] = toHsl(brightest);
  const light = fromHsl([bh, clamp(bs, 0.15, 0.5), 0.9]);
  return { motif: input.motif ?? plateMotif(input), seed, ground, deep, lead, second, light, ghost: mono ? light : complement(lead) };
}

const n = (value: number) => (Math.round(value * 10) / 10).toString();

type Draw = (context: { w: number; h: number; random: () => number; d: PlateDesign; id: string }) => string;

// Each motif draws only its figure; the ground, the ghost, the grain and the vignette are
// shared, so every plate reads as part of one set.
const MOTIFS: Record<PlateMotif, Draw> = {
  sun({ w, h, random, d, id }) {
    const horizon = h * (0.56 + random() * 0.12), r = Math.min(w, h) * (0.24 + random() * 0.1), cx = w * (0.3 + random() * 0.4), cy = horizon - r * (0.1 + random() * 0.5);
    const bands = Array.from({ length: 5 }, (_, i) => {
      const y = cy + r * (0.12 + i * 0.19), thick = r * (0.035 + i * 0.022);
      return `<rect x="${n(cx - r)}" y="${n(y)}" width="${n(r * 2)}" height="${n(thick)}" fill="${d.ground}"/>`;
    }).join('');
    const hills = Array.from({ length: 3 }, (_, i) => {
      const y = horizon + (h - horizon) * (i / 3), lift = (h - horizon) * (0.1 + random() * 0.14), peak = w * random();
      return `<path d="M0 ${n(y + lift)} Q${n(peak)} ${n(y - lift)} ${n(w)} ${n(y + lift * 0.6)} V${n(h)} H0Z" fill="${i === 1 ? d.second : d.deep}" opacity="${n(0.55 + i * 0.2)}"/>`;
    }).join('');
    return `<clipPath id="${id}-sky"><rect width="${n(w)}" height="${n(horizon)}"/></clipPath>
<g clip-path="url(#${id}-sky)"><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${d.lead}"/>${bands}</g>
<rect y="${n(horizon)}" width="${n(w)}" height="${n(h - horizon)}" fill="${d.ground}"/>${hills}
<rect y="${n(horizon - 1)}" width="${n(w)}" height="2" fill="${d.light}" opacity=".7"/>`;
  },
  eclipse({ w, h, random, d }) {
    const r = Math.min(w, h) * (0.27 + random() * 0.07), cx = w * (0.42 + random() * 0.16), cy = h * (0.4 + random() * 0.12);
    const angle = random() * Math.PI * 2, offset = r * (0.16 + random() * 0.16);
    const rays = Array.from({ length: 36 }, (_, i) => {
      const a = (i / 36) * Math.PI * 2, inner = r * 1.16, outer = r * (1.26 + ((i * 7 + d.seed) % 5) * 0.07);
      return `<line x1="${n(cx + Math.cos(a) * inner)}" y1="${n(cy + Math.sin(a) * inner)}" x2="${n(cx + Math.cos(a) * outer)}" y2="${n(cy + Math.sin(a) * outer)}"/>`;
    }).join('');
    return `<g stroke="${d.light}" stroke-width="1.4" opacity=".55" stroke-linecap="round">${rays}</g>
<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${d.lead}"/>
<circle cx="${n(cx + Math.cos(angle) * offset)}" cy="${n(cy + Math.sin(angle) * offset)}" r="${n(r * 0.95)}" fill="${d.ground}"/>
<circle cx="${n(cx - Math.cos(angle) * r * 1.9)}" cy="${n(cy - Math.sin(angle) * r * 1.9)}" r="${n(r * 0.07)}" fill="${d.second}"/>`;
  },
  city({ w, h, random, d }) {
    const base = h * 0.94, count = Math.round(7 + random() * 4), gap = w * 0.012, width = (w * 0.9 - gap * (count - 1)) / count;
    let towers = '';
    for (let i = 0; i < count; i += 1) {
      const height = h * (0.18 + random() * 0.5), x = w * 0.05 + i * (width + gap), fill = i % 3 === 0 ? d.lead : i % 3 === 1 ? d.deep : d.second;
      towers += `<rect x="${n(x)}" y="${n(base - height)}" width="${n(width)}" height="${n(height)}" fill="${fill}"/>`;
      const rows = Math.floor(height / (width * 0.6));
      for (let row = 1; row < rows; row += 1) {
        if (random() > 0.42) continue;
        const side = random() > 0.5 ? 0.18 : 0.58;
        towers += `<rect x="${n(x + width * side)}" y="${n(base - height + row * width * 0.6)}" width="${n(width * 0.24)}" height="${n(width * 0.2)}" fill="${fill === d.deep ? d.light : d.ground}" opacity="${fill === d.deep ? '.9' : '.75'}"/>`;
      }
    }
    const moon = Math.min(w, h) * 0.075;
    return `<circle cx="${n(w * (0.18 + random() * 0.64))}" cy="${n(h * (0.14 + random() * 0.1))}" r="${n(moon)}" fill="${d.light}"/>${towers}
<rect y="${n(base)}" width="${n(w)}" height="${n(h - base)}" fill="${d.ground}"/>`;
  },
  rings({ w, h, random, d }) {
    const cx = w * (0.34 + random() * 0.32), cy = h * (0.36 + random() * 0.24), reach = Math.hypot(w, h) * 0.62, count = 11;
    const drift = (random() - 0.5) * 0.09;
    const circles = Array.from({ length: count }, (_, i) => {
      const t = (count - i) / count, r = reach * t * t + 6;
      const fill = i % 2 === 0 ? (i % 4 === 0 ? d.lead : d.second) : d.ground;
      return `<circle cx="${n(cx + drift * w * i)}" cy="${n(cy + drift * h * i * 0.6)}" r="${n(r)}" fill="${fill}"/>`;
    }).join('');
    return `${circles}<circle cx="${n(cx + drift * w * count)}" cy="${n(cy + drift * h * count * 0.6)}" r="${n(Math.min(w, h) * 0.018)}" fill="${d.light}"/>`;
  },
  duet({ w, h, random, d }) {
    const base = h * 0.9, width = Math.min(w * 0.3, h * 0.34), tall = h * (0.5 + random() * 0.12), lean = width * (0.1 + random() * 0.14);
    const gap = width * (0.42 + random() * 0.2), mid = w * (0.44 + random() * 0.12);
    const arch = (cx: number, top: number, tilt: number, fill: string) => {
      const r = width / 2;
      return `<path d="M${n(cx - r)} ${n(base)} L${n(cx - r + tilt)} ${n(top + r)} A${n(r)} ${n(r)} 0 0 1 ${n(cx + r + tilt)} ${n(top + r)} L${n(cx + r)} ${n(base)}Z" fill="${fill}"/>`;
    };
    return `${arch(mid - gap, base - tall, lean, d.lead)}<g style="mix-blend-mode:screen">${arch(mid + gap, base - tall * (0.82 + random() * 0.14), -lean, d.second)}</g>
<circle cx="${n(mid + (random() - 0.5) * w * 0.5)}" cy="${n(h * (0.13 + random() * 0.08))}" r="${n(Math.min(w, h) * 0.035)}" fill="${d.light}"/>
<rect y="${n(base)}" width="${n(w)}" height="${n(h - base)}" fill="${d.ground}"/>`;
  },
  shards({ w, h, random, d }) {
    const count = 7, slant = w * (0.22 + random() * 0.2) * (random() > 0.5 ? 1 : -1);
    let x = -Math.abs(slant) - w * 0.05, out = '';
    for (let i = 0; i < count + 4 && x < w + Math.abs(slant); i += 1) {
      const width = w * (0.05 + random() * 0.13), fill = i % 3 === 0 ? d.lead : i % 3 === 1 ? d.deep : d.second, cut = h * random() * 0.45;
      out += `<path d="M${n(x + slant)} ${n(cut)} L${n(x + slant + width)} 0 L${n(x + width)} ${n(h)} L${n(x)} ${n(h - cut * 0.4)}Z" fill="${fill}" opacity="${i % 3 === 1 ? '.9' : '1'}"/>`;
      x += width + w * (0.03 + random() * 0.07);
    }
    return `${out}<circle cx="${n(w * (0.2 + random() * 0.6))}" cy="${n(h * (0.2 + random() * 0.5))}" r="${n(Math.min(w, h) * 0.05)}" fill="${d.light}"/>`;
  },
  window({ w, h, random, d }) {
    const fw = Math.min(w * 0.36, h * 0.4), fh = fw * (1.25 + random() * 0.35), x = w * (0.2 + random() * 0.44), y = h * (0.14 + random() * 0.1);
    const floor = Math.min(h * 0.96, y + fh + h * 0.3), spread = fw * (0.5 + random() * 0.6), shift = (random() - 0.5) * fw * 0.8;
    const bar = fw * 0.045;
    return `<rect x="${n(x - fw * 0.16)}" y="${n(y - fw * 0.16)}" width="${n(fw * 1.32)}" height="${n(fh + fw * 0.32)}" fill="${d.deep}"/>
<rect x="${n(x)}" y="${n(y)}" width="${n(fw)}" height="${n(fh)}" fill="${d.lead}"/>
<circle cx="${n(x + fw * (0.3 + random() * 0.4))}" cy="${n(y + fh * (0.28 + random() * 0.2))}" r="${n(fw * 0.17)}" fill="${d.light}"/>
<rect x="${n(x + fw / 2 - bar / 2)}" y="${n(y)}" width="${n(bar)}" height="${n(fh)}" fill="${d.ground}"/><rect x="${n(x)}" y="${n(y + fh * 0.5 - bar / 2)}" width="${n(fw)}" height="${n(bar)}" fill="${d.ground}"/>
<path d="M${n(x)} ${n(y + fh + fw * 0.16)} H${n(x + fw)} L${n(x + fw + spread + shift)} ${n(floor)} H${n(x - spread + shift)}Z" fill="${d.second}" opacity=".7"/>`;
  },
  iris({ w, h, random, d }) {
    const cx = w * (0.4 + random() * 0.2), cy = h * (0.4 + random() * 0.14), r = Math.min(w, h) * (0.36 + random() * 0.06), open = 0.3 + random() * 0.22, blades = 7, twist = random() * Math.PI;
    let out = `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${d.lead}"/><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * open * 0.62)}" fill="${d.light}"/>`;
    for (let i = 0; i < blades; i += 1) {
      const a = twist + (i / blades) * Math.PI * 2, b = a + (Math.PI * 2) / blades * 1.9;
      const point = (angle: number, radius: number) => `${n(cx + Math.cos(angle) * radius)} ${n(cy + Math.sin(angle) * radius)}`;
      out += `<path d="M${point(a, r * open)} L${point(a - 0.5, r * 1.02)} A${n(r * 1.02)} ${n(r * 1.02)} 0 0 1 ${point(b - 0.9, r * 1.02)}Z" fill="${i % 2 ? d.deep : d.second}" opacity="${i % 2 ? '.96' : '.9'}" stroke="${d.ground}" stroke-width="1.5"/>`;
    }
    return `${out}<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r * 1.02)}" fill="none" stroke="${d.light}" stroke-width="1.5" opacity=".6"/>`;
  },
};

export type PlateOptions = {
  shape?: PlateShape;
  /** Unique within the page, so two plates never share a gradient or a clip. */
  id?: string;
  /** Film grain; leave it off for thumbnails, where it costs more than it shows. */
  grain?: boolean;
  /** The complementary ghost beside the figure; off for the smallest sizes. */
  ghost?: boolean;
  /** A wide plate draws its figure right of centre, to leave room for a title; false centres it. */
  offset?: boolean;
};

/** The plate as the inside of an SVG element. It contains only numbers and validated colours. */
export function plateMarkup(input: PlateInput, { shape = 'poster', id, grain = true, ghost = true, offset = true }: PlateOptions = {}): string {
  const d = plateDesign(input);
  const { width: w, height: h } = PLATE_SIZE[shape];
  const uid = id ?? `plate-${d.seed.toString(36)}-${shape}`;
  // A wide plate sits behind a film's title, so its picture keeps to the right: a single
  // figure is drawn in the right-hand two thirds, and a field that fills the frame is
  // stretched so its centre lands there.
  const aside = shape === 'wide' && offset;
  const single = d.motif === 'window' || d.motif === 'duet' || d.motif === 'eclipse' || d.motif === 'iris';
  const reach = !aside ? w : single ? w * 0.64 : w * 1.3;
  const shift = aside && single ? w * 0.36 : 0;
  const draw = (salt: string) => `<g transform="translate(${n(shift)} 0)">${MOTIFS[d.motif]({ w: reach, h, d, id: `${uid}${salt}`, random: seededRandom(d.seed) })}</g>`;
  const figure = draw('');
  // The ghost is the figure again in its complementary colours, slipped a little to one side
  // and blurred: the picture your eye would keep if you looked away.
  const slip = Math.min(w, h) * 0.035;
  const ghostFigure = ghost ? `<g transform="translate(${n(slip)} ${n(-slip * 0.6)})" filter="url(#${uid}-blur)" opacity=".34" style="mix-blend-mode:screen"><g filter="url(#${uid}-turn)">${draw('g')}</g></g>` : '';
  return `<defs>
<radialGradient id="${uid}-glow" cx="50%" cy="42%" r="75%"><stop offset="0" stop-color="${d.deep}"/><stop offset="1" stop-color="${d.ground}"/></radialGradient>
<radialGradient id="${uid}-edge" cx="50%" cy="50%" r="72%"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></radialGradient>
${ghost ? `<filter id="${uid}-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${n(Math.min(w, h) * 0.012)}"/></filter><filter id="${uid}-turn"><feColorMatrix type="hueRotate" values="180"/></filter>` : ''}
${grain ? `<filter id="${uid}-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="${d.seed % 97}"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .5 -.14"/></filter>` : ''}
</defs>
<rect width="${w}" height="${h}" fill="url(#${uid}-glow)"/>
${ghostFigure}<g>${figure}</g>
${grain ? `<rect width="${w}" height="${h}" filter="url(#${uid}-grain)" opacity=".5" style="mix-blend-mode:overlay"/>` : ''}
<rect width="${w}" height="${h}" fill="url(#${uid}-edge)"/>`;
}

/** A whole SVG document, for drawing a plate onto a canvas. */
export function plateSvg(input: PlateInput, options: PlateOptions = {}): string {
  const { width, height } = PLATE_SIZE[options.shape ?? 'poster'];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${plateMarkup(input, options)}</svg>`;
}

/** The words a plate reads from a film's four qualities. */
export function facetWords(facets: Partial<Record<string, { label: string; traits: readonly string[] }>> | undefined): string[] {
  if (!facets) return [];
  return Object.values(facets).flatMap(facet => facet ? [facet.label, ...facet.traits] : []);
}
