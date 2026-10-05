// Blind Screening. The reel arrives veiled: no titles, no posters, no years, no names.
// Each film is only what it is like, in the reel's own words with the names taken out.
// Choose on that alone, and the veil lifts on the film you chose. The veil is drawn in
// this browser only; the request is an ordinary reel request and nothing about it is sent.
import { movieKey } from './movie-metadata.ts';

export const BLIND_KEY = 'afterimage:blind:v1';

export type BlindState = {
  version: 1;
  /** The next reel to arrive will be veiled. */
  pending: boolean;
  /** The reel that is veiled, by its recommendation identity. */
  identity?: string;
  /** Films chosen from behind the veil, by movie key. */
  revealed: string[];
  /** The whole veil has been lifted. */
  lifted: boolean;
};

export type Segment = { text: string; hidden: boolean };
type Film = { title: string; year: string };

export function emptyBlind(): BlindState {
  return { version: 1, pending: false, revealed: [], lifted: false };
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseBlind(raw: string | null): BlindState {
  if (!raw) return emptyBlind();
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return emptyBlind(); }
  if (!record(value) || value.version !== 1) return emptyBlind();
  const identity = typeof value.identity === 'string' && value.identity.length <= 2000 ? value.identity : undefined;
  const revealed = Array.isArray(value.revealed) ? [...new Set(value.revealed.filter((key): key is string => typeof key === 'string' && key.length <= 220))].slice(0, 5) : [];
  return { version: 1, pending: value.pending === true, ...(identity ? { identity } : {}), revealed, lifted: value.lifted === true };
}

export function serializeBlind(state: BlindState): string {
  return JSON.stringify(state);
}

/** Ask for the next reel to arrive veiled, or change your mind. */
export function wantBlind(state: BlindState, on: boolean): BlindState {
  return { ...state, pending: on };
}

/** A reel has arrived: if a blind reel was asked for, this is the one the veil covers. */
export function reelArrived(state: BlindState, identity: string): BlindState {
  if (!state.pending || !identity) return state;
  return { version: 1, pending: false, identity, revealed: [], lifted: false };
}

export function isVeiled(state: BlindState, identity: string): boolean {
  return Boolean(identity) && state.identity === identity && !state.lifted;
}

export function isRevealed(state: BlindState, film: Film): boolean {
  return state.lifted || state.revealed.includes(movieKey(film.title, film.year));
}

export function reveal(state: BlindState, film: Film): BlindState {
  const key = movieKey(film.title, film.year);
  return state.revealed.includes(key) ? state : { ...state, revealed: [...state.revealed, key].slice(-5) };
}

export function liftVeil(state: BlindState): BlindState {
  return { ...state, lifted: true };
}

const ARTICLES = /^(?:the|a|an|le|la|les|l['’]|il|lo|el|los|las|der|die|das|det|den)\s*/i;

function titleVariants(title: string): string[] {
  const variants = [title.trim()];
  const bare = title.trim().replace(ARTICLES, '');
  if (bare && bare !== title.trim()) variants.push(bare);
  for (const part of title.split(/\s*[:–—]\s*|\s+-\s+/)) if (part.trim().length >= 4) variants.push(part.trim());
  return variants;
}

function nameVariants(name: string): string[] {
  const parts = name.trim().split(/\s+/).filter(part => part.length >= 4 && /^\p{Lu}/u.test(part));
  return [name.trim(), ...parts];
}

/**
 * Everything that would give a film away: its title (with and without its article, and
 * either side of a subtitle), its year, its directors, and the other films in the reel,
 * which reasons often mention by name.
 */
export function secretsFor(film: Film & { directors?: readonly string[] }, reel: readonly Film[] = []): string[] {
  const secrets = [
    ...titleVariants(film.title),
    film.year,
    ...(film.directors ?? []).flatMap(nameVariants),
    ...reel.filter(other => movieKey(other.title, other.year) !== movieKey(film.title, film.year)).flatMap(other => [...titleVariants(other.title), other.year]),
  ];
  return [...new Set(secrets.filter(secret => secret.trim().length > 0))].sort((a, b) => b.length - a.length);
}

function pattern(secret: string): string {
  return secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’]/g, '[\'’]').replace(/\s+/g, '\\s+');
}

/**
 * The text with every secret drawn out of it. Long secrets match whatever their case;
 * a short one-word title ("Her", "Up") matches only as written, so ordinary words survive.
 */
export function redact(text: string, secrets: readonly string[]): Segment[] {
  if (!text) return [];
  const loose = secrets.filter(secret => /\s/.test(secret.trim()) || secret.trim().length >= 6);
  const strict = secrets.filter(secret => !loose.includes(secret));
  const spans: Array<[number, number]> = [];
  const collect = (list: readonly string[], flags: string) => {
    if (!list.length) return;
    const expression = new RegExp(`(?<![\\p{L}\\p{N}])(?:${list.map(pattern).join('|')})(?![\\p{L}\\p{N}])`, flags);
    for (const match of text.matchAll(expression)) spans.push([match.index, match.index + match[0].length]);
  };
  collect(loose, 'giu');
  collect(strict, 'gu');
  spans.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged: Array<[number, number]> = [];
  for (const span of spans) {
    const last = merged.at(-1);
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push([...span]);
  }
  const segments: Segment[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) segments.push({ text: text.slice(cursor, start), hidden: false });
    segments.push({ text: text.slice(start, end), hidden: true });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), hidden: false });
  return segments;
}

/** The plain text a screen reader hears for a redacted line. */
export function spokenRedaction(segments: readonly Segment[]): string {
  return segments.map(segment => segment.hidden ? '(withheld)' : segment.text).join('');
}

const NUMERALS = ['I', 'II', 'III', 'IV', 'V'];
/** "Film III": how a veiled film is billed. */
export function veiledName(index: number): string {
  return `Film ${NUMERALS[index] ?? String(index + 1)}`;
}
