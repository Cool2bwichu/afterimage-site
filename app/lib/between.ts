// The Film Between Us. Two people, three films each, one evening. Their two skies drift
// together and the one film in the overlap appears, with what it takes from each: that
// is an ordinary collision, which the bridge already answers. The six films and the two
// names can also become an ordinary reel request. An invitation link carries only the
// inviter's name and three films, in the address itself; nothing is stored anywhere.
import type { CollisionFilm } from './collision.ts';

export const MAX_GUEST_FILMS = 3;
const MAX_NAME = 24;
/** Titles are written into the brief this short at most, so its instructions always fit. */
const BRIEF_TITLE = 80;

export type BetweenFilm = { title: string; year?: string };
export type BetweenSide = { name: string; films: BetweenFilm[] };
/** The two of you: whoever has the page open, and the other person. */
export type Skies = { us: BetweenSide; them: BetweenSide };

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** A name as it will be written into the request: a first name or nothing. */
export function cleanName(value: unknown): string {
  return clean(value, MAX_NAME).replace(/[^\p{L}\p{M}\p{N} '’.-]/gu, '').trim();
}

/** A film typed by hand. "Aftersun 2022" and "Aftersun (2022)" bring their year; anything else is a title. */
export function typedFilm(text: string, now = new Date()): BetweenFilm | null {
  const title = clean(text, 160);
  if (!title) return null;
  const match = /^(.*\S)\s*\((\d{4})\)$/.exec(title) ?? /^(.*\S)[\s,]+(\d{4})$/.exec(title);
  const year = match ? Number(match[2]) : 0;
  // Blade Runner 2049 and THX 1138 keep their numbers.
  if (!match || year < 1888 || year > now.getFullYear() + 2) return { title };
  return { title: match[1].replace(/[\s,]+$/, ''), year: match[2] };
}

/** The names the request uses: first names, or "One of us" and "the other" when there are none or they match. */
function names(first: BetweenSide, second: BetweenSide): [string, string] {
  const a = cleanName(first.name) || 'One of us';
  const b = cleanName(second.name) || 'the other';
  return a.toLocaleLowerCase() === b.toLocaleLowerCase() ? ['One of us', 'the other'] : [a, b];
}

/** Each sky as the page names it: "Mick’s sky", or your sky and their sky. */
export function skyNames(skies: Skies): [string, string] {
  const a = cleanName(skies.us.name);
  const b = cleanName(skies.them.name);
  const same = Boolean(a && b && a.toLocaleLowerCase() === b.toLocaleLowerCase());
  return [a && !same ? `${a}’s sky` : 'your sky', b && !same ? `${b}’s sky` : 'their sky'];
}

function filmText(film: BetweenFilm): string {
  return film.year ? `${film.title} (${film.year})` : film.title;
}

function briefText(film: BetweenFilm): string {
  const title = film.title.length > BRIEF_TITLE ? `${film.title.slice(0, BRIEF_TITLE - 1).trimEnd()}…` : film.title;
  return filmText({ ...film, title });
}

function sideFilms(side: BetweenSide): BetweenFilm[] {
  const seen = new Set<string>();
  return side.films.flatMap(film => {
    const title = clean(film.title, 160);
    const year = typeof film.year === 'string' && /^\d{4}$/.test(film.year) ? film.year : undefined;
    const key = `${title.toLocaleLowerCase()}|${year ?? ''}`;
    if (!title || seen.has(key)) return [];
    seen.add(key);
    return [{ title, ...(year ? { year } : {}) }];
  }).slice(0, MAX_GUEST_FILMS);
}

export function canMeet(first: BetweenSide, second: BetweenSide): boolean {
  return sideFilms(first).length > 0 && sideFilms(second).length > 0;
}

const list = (films: BetweenFilm[]) => films.length === 1 ? briefText(films[0]) : `${films.slice(0, -1).map(briefText).join(', ')} and ${briefText(films.at(-1)!)}`;

/** The two of you, as a reel request: six reference films and a brief that says whose is whose. */
export function betweenRequest(first: BetweenSide, second: BetweenSide): { films: string[]; creativeBrief: string } | null {
  const ours = sideFilms(first);
  const theirs = sideFilms(second);
  if (!ours.length || !theirs.length) return null;
  const [one, two] = names(first, second);
  const creativeBrief = `Two of us are choosing a film to watch together. ${one} loves ${list(ours)}; ${two} loves ${list(theirs)}. Find films between our tastes: each one should give both of us something real, not a compromise neither of us wanted. In each reason, say what ${one === 'One of us' ? 'each of us' : `${one} and ${two}`} will find in it.`;
  return { films: [...ours, ...theirs].map(filmText), creativeBrief };
}

const filmKey = (film: BetweenFilm) => `${film.title.toLocaleLowerCase()}|${film.year ?? ''}`;

/**
 * The two skies as a collision. A collision holds exactly two dated films, so one film
 * from each side stands for its sky, the brief names all six and says whose is whose,
 * and the other dated films are ruled out as answers. Null until each side has a film
 * with its year, and the two stand-ins are different films.
 */
export function betweenCollision(skies: Skies): { films: [CollisionFilm, CollisionFilm]; reelFilms: CollisionFilm[]; creativeBrief: string } | null {
  const ours = sideFilms(skies.us);
  const theirs = sideFilms(skies.them);
  const dated = (films: BetweenFilm[]) => films.filter((film): film is CollisionFilm => Boolean(film.year));
  let pair: [CollisionFilm, CollisionFilm] | null = null;
  for (const first of dated(ours)) {
    const second = dated(theirs).find(film => filmKey(film) !== filmKey(first));
    if (second) { pair = [first, second]; break; }
  }
  if (!pair) return null;
  const ruledOut = new Map<string, CollisionFilm>();
  for (const film of [...dated(ours), ...dated(theirs)]) if (!pair.some(anchor => filmKey(anchor) === filmKey(film))) ruledOut.set(filmKey(film), film);
  const [one, two] = names(skies.us, skies.them);
  const lower = one === 'One of us' ? 'one of us' : one;
  const creativeBrief = `Two of us are choosing one film to watch together. ${one} loves ${list(ours)}; ${two} loves ${list(theirs)}. The first film stands for the films ${lower} loves, the second for the films ${two} loves: what the answer carries from each should come from that person's films, and name them. Find the one film that lives between all of them and gives each of us something real, not a compromise neither of us wanted.`;
  return { films: pair, reelFilms: [...ruledOut.values()], creativeBrief };
}

/** The two skies as one key: the same names and the same films give the same key. */
export function skiesKey(skies: Skies): string {
  return JSON.stringify([skies.us, skies.them].map(side => [cleanName(side.name), sideFilms(side).map(filmKey)]));
}

/** Whether these are still the skies that were brought together, film for film. */
export function sameSkies(a: Skies | null, b: Skies | null): boolean {
  return Boolean(a && b) && skiesKey(a!) === skiesKey(b!);
}

/** The two names back out of a brief this room wrote, for the heading above the reel. */
export function parseBetween(brief: string | undefined): { first: string; second: string } | null {
  if (!brief) return null;
  const match = /^Two of us are choosing a film to watch together\. (.{1,30}?) loves .+?; (.{1,30}?) loves /.exec(brief);
  return match ? { first: match[1], second: match[2] } : null;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string | null {
  if (!/^[A-Za-z0-9_-]{1,2400}$/.test(value)) return null;
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, character => character.charCodeAt(0)));
  } catch { return null; }
}

/** The invitation: your name and three films, folded into the link itself. */
export function encodeInvite(side: BetweenSide): string {
  return toBase64Url(JSON.stringify({ v: 1, n: cleanName(side.name), f: sideFilms(side).map(film => [film.title, film.year ?? '']) }));
}

export function decodeInvite(value: string | null): BetweenSide | null {
  if (!value) return null;
  const text = fromBase64Url(value);
  if (!text) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return null; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const invite = parsed as Record<string, unknown>;
  if (invite.v !== 1 || !Array.isArray(invite.f)) return null;
  const films = sideFilms({ name: '', films: invite.f.flatMap(item => Array.isArray(item) && typeof item[0] === 'string' ? [{ title: item[0], year: typeof item[1] === 'string' ? item[1] : undefined }] : []) });
  return films.length ? { name: cleanName(invite.n), films } : null;
}

export function inviteUrl(base: string, side: BetweenSide): string {
  const url = new URL(base);
  url.hash = '';
  url.search = '';
  url.searchParams.set('between', encodeInvite(side));
  return url.toString();
}
