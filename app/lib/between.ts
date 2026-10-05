// The Film Between Us. Two people, three films each, one evening. Afterimage looks for
// films that give both of them something, and says what each will find. The six films
// and the two names become an ordinary reel request. An invitation link carries only
// the inviter's name and three films, in the address itself; nothing is stored anywhere.

export const MAX_GUEST_FILMS = 3;
const MAX_NAME = 24;
/** Titles are written into the brief this short at most, so its instructions always fit. */
const BRIEF_TITLE = 80;

export type BetweenFilm = { title: string; year?: string };
export type BetweenSide = { name: string; films: BetweenFilm[] };

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** A name as it will be written into the request: a first name or nothing. */
export function cleanName(value: unknown): string {
  return clean(value, MAX_NAME).replace(/[^\p{L}\p{M}\p{N} '’.-]/gu, '').trim();
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
  const a = cleanName(first.name) || 'One of us';
  const b = cleanName(second.name) || 'the other';
  const same = a.toLocaleLowerCase() === b.toLocaleLowerCase();
  const [one, two] = same ? ['One of us', 'the other'] : [a, b];
  const creativeBrief = `Two of us are choosing a film to watch together. ${one} loves ${list(ours)}; ${two} loves ${list(theirs)}. Find films between our tastes: each one should give both of us something real, not a compromise neither of us wanted. In each reason, say what ${one === 'One of us' ? 'each of us' : `${one} and ${two}`} will find in it.`;
  return { films: [...ours, ...theirs].map(filmText), creativeBrief };
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
