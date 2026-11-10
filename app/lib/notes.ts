// Notes on a viewer: what a history of reels, Likes and afterimages says about the person
// who made it. Everything here is counted from what this browser already holds. Nothing is
// asked of anyone, and nothing is claimed that the counts do not support: a section with too
// little behind it says how much more it needs instead of guessing.

import type { AfterimageEntry } from './afterimages.ts';
import { latestReading, type HalfLifeBook } from './half-life.ts';
import { FACET_KEYS, type FacetKey } from './light-table.ts';
import { movieKey } from './movie-metadata.ts';
import type { AfterimageResultV2 } from './reel-state.ts';

export type NotesReel = { id: string; savedAt: string; result: AfterimageResultV2; borrowed?: readonly FacetKey[] };
export type NotesInput = {
  reels: readonly NotesReel[];
  liked: ReadonlyArray<{ title: string; year: string }>;
  afterimages: readonly AfterimageEntry[];
  book: HalfLifeBook;
};

export type NotesWord = { word: string; reels: number; weight: number };
export type NotesFrame = { id: string; name: string; savedAt: string; palette: string[]; warmth: number };
export type NotesDirector = { name: string; reels: string[] };
export type NotesChannel = { channel: FacetKey; count: number; share: number };
export type NotesDecade = { decade: number; kept: number; offered: number };
export type NotesLine = { title: string; year: string; note: string; watchedOn: string; stayed: FacetKey[] };

export type ViewerNotes = {
  counts: { reels: number; films: number; watched: number; liked: number };
  /** The one finding worth leading with, or a line saying the notes have only begun. */
  headline: string;
  words: { recurring: boolean; items: NotesWord[]; reading: string };
  colour: { frames: NotesFrame[]; reading: string };
  directors: { items: NotesDirector[]; reading: string };
  stays: { stayed: NotesChannel[]; borrowed: NotesChannel[]; reading: string; enough: boolean };
  halfLife: { stronger: string[]; there: number; gone: number; reading: string; enough: boolean };
  decades: { items: NotesDecade[]; centre: number | null; reading: string; enough: boolean };
  lines: NotesLine[];
  /** A reel asked for from these notes, when they hold enough to ask with. */
  request: { films: string[]; creativeBrief: string } | null;
};

/** How each of the four qualities reads in a sentence about films in general. */
export const CHANNEL_PHRASE: Record<FacetKey, string> = {
  whereItLives: 'the worlds films live in',
  howItFeels: 'how films feel',
  howItLooks: 'how films look',
  howItSpeaks: 'how films speak',
};

export const MIN_STAYED = 3;
export const MIN_READINGS = 2;
export const MIN_KEPT_YEARS = 5;
export const MAX_LINES = 12;

const HEX = /^#[0-9a-f]{6}$/i;
// Words too general to say anything about one viewer rather than about films.
const STOP = new Set(['film', 'films', 'with', 'that', 'this', 'from', 'into', 'over', 'under', 'through', 'their', 'your', 'about', 'between', 'and', 'the', 'for', 'more', 'than', 'like', 'cinema', 'movie', 'movies', 'story', 'stories', 'drama', 'driven', 'based', 'style', 'tone', 'feel', 'feeling', 'very', 'quality', 'qualities', 'sense', 'kind']);

function words(phrase: string): string[] {
  return phrase.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z-]+/).map(word => word.replace(/^-+|-+$/g, '')).filter(word => word.length >= 4 && !STOP.has(word));
}

function reelPhrases(result: AfterimageResultV2): string[] {
  const fingerprint = result.fingerprint ? FACET_KEYS.flatMap(channel => result.fingerprint![channel]?.traits ?? []) : [];
  return [...result.sensibilities, ...fingerprint];
}

/** -1 for a palette of cold light, 1 for warm, weighted by how much colour each swatch holds. */
export function paletteWarmth(palette: readonly string[]): number {
  let total = 0, weight = 0;
  for (const hex of palette) {
    if (!HEX.test(hex)) continue;
    const value = parseInt(hex.slice(1), 16);
    const r = ((value >> 16) & 255) / 255, g = ((value >> 8) & 255) / 255, b = (value & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), chroma = max - min;
    if (chroma < 0.04) continue;
    const hue = (max === r ? ((g - b) / chroma + 6) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4) * 60;
    total += Math.cos(((hue - 30) * Math.PI) / 180) * chroma;
    weight += chroma;
  }
  return weight ? Math.round((total / weight) * 100) / 100 : 0;
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const NUMBER = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const spell = (count: number) => NUMBER[count] ?? String(count);
const mean = (values: readonly number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const list = (items: readonly string[]) => items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

function tally(channels: readonly FacetKey[]): NotesChannel[] {
  const total = channels.length;
  return FACET_KEYS.map(channel => { const count = channels.filter(item => item === channel).length; return { channel, count, share: total ? count / total : 0 }; });
}

function leader(items: readonly NotesChannel[]): FacetKey | null {
  const sorted = [...items].sort((a, b) => b.count - a.count);
  return sorted[0]?.count && sorted[0].count > (sorted[1]?.count ?? 0) ? sorted[0].channel : null;
}

function wordsSection(reels: readonly NotesReel[]): ViewerNotes['words'] {
  const seen = new Map<string, { reels: number; first: number }>();
  let order = 0;
  for (const reel of reels) {
    for (const word of new Set(reelPhrases(reel.result).flatMap(words))) {
      const entry = seen.get(word);
      if (entry) entry.reels += 1; else seen.set(word, { reels: 1, first: order++ });
    }
  }
  const all = [...seen].map(([word, entry]) => ({ word, ...entry })).sort((a, b) => b.reels - a.reels || a.first - b.first);
  const returning = all.filter(item => item.reels >= 2);
  const recurring = returning.length > 0;
  const chosen = (recurring ? returning : all).slice(0, 16);
  const most = chosen[0]?.reels ?? 1;
  const items = chosen.map(({ word, reels: count }) => ({ word, reels: count, weight: recurring ? count / most : 1 }));
  const reading = !reels.length ? 'The words begin with your first reel.'
    : !recurring ? `${reels.length === 1 ? 'One reel' : `${spell(reels.length)} reels`.replace(/^./, letter => letter.toUpperCase())} so far, and no word has come back yet. These are the first ones; the ones that return are the ones that mean something.`
    : `Across ${plural(reels.length, 'reel')}, ${returning.length === 1 ? 'one word keeps' : `${spell(Math.min(returning.length, 16))} words keep`} coming back without being asked for. “${returning[0].word}” has turned up in ${spell(returning[0].reels)} of them.`;
  return { recurring, items, reading };
}

function colourSection(reels: readonly NotesReel[]): ViewerNotes['colour'] {
  const frames = reels.map(reel => ({ id: reel.id, name: reel.result.persona, savedAt: reel.savedAt, palette: reel.result.palette.filter(color => HEX.test(color)), warmth: paletteWarmth(reel.result.palette) }));
  let reading: string;
  if (frames.length < 2) reading = frames.length ? 'One reel is one frame. Colour needs a few more before it becomes a pattern.' : 'Every reel arrives in five colours. They collect here, in order.';
  else {
    const overall = mean(frames.map(frame => frame.warmth));
    const half = Math.floor(frames.length / 2);
    const drift = frames.length >= 4 ? mean(frames.slice(-half).map(frame => frame.warmth)) - mean(frames.slice(0, half).map(frame => frame.warmth)) : 0;
    const where = overall > 0.2 ? 'Your reels live in warm light: amber, rust and skin.' : overall < -0.2 ? 'Your reels live in cold light: blue hours, steel and sea.' : 'Your reels sit between warm and cold, and belong to neither.';
    const moving = drift > 0.25 ? ' Lately they have been getting warmer.' : drift < -0.25 ? ' Lately they have been getting colder.' : frames.length >= 4 ? ' That has held steady from the first reel to the latest.' : '';
    reading = where + moving;
  }
  return { frames, reading };
}

function directorSection(reels: readonly NotesReel[]): ViewerNotes['directors'] {
  const byName = new Map<string, NotesDirector>();
  for (const reel of reels) {
    const name = reel.result.spiritDirector.name.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const entry = byName.get(key) ?? { name, reels: [] };
    entry.reels.push(reel.result.persona);
    byName.set(key, entry);
  }
  const items = [...byName.values()].sort((a, b) => b.reels.length - a.reels.length).slice(0, 6);
  const top = items[0];
  const reading = !top ? 'Each reel names the director whose spirit it is in. They gather here.'
    : top.reels.length >= 2 ? `${top.name} has been named the spirit of ${spell(top.reels.length)} of your ${spell(reels.length)} reels. Nobody chose that; it is where the reels keep landing.`
    : items.length === 1 ? `${top.name} is the first director in the room.`
    : `${spell(items.length).replace(/^./, letter => letter.toUpperCase())} directors, and none of them twice. You have not settled, which is its own kind of taste.`;
  return { items, reading };
}

function staysSection(reels: readonly NotesReel[], afterimages: readonly AfterimageEntry[]): ViewerNotes['stays'] {
  const stayed = tally(afterimages.flatMap(entry => entry.stayed));
  const borrowed = tally(reels.flatMap(reel => reel.borrowed ?? []));
  const marked = afterimages.filter(entry => entry.stayed.length).length;
  const enough = marked >= MIN_STAYED;
  if (!enough) {
    const need = MIN_STAYED - marked;
    return { stayed, borrowed, enough, reading: `This is the heart of the notes, and it needs ${plural(need, 'more film')} with something marked as having stayed. Tell the site what stayed after you watch one.` };
  }
  const stays = leader(stayed);
  const asks = borrowed.reduce((sum, item) => sum + item.count, 0) >= 2 ? leader(borrowed) : null;
  const reading = !stays ? 'Nothing leads. Worlds, feelings, images and voices stay with you about equally, which is rarer than it sounds.'
    : asks && asks !== stays ? `You ask for ${CHANNEL_PHRASE[asks]}. What stays with you is ${CHANNEL_PHRASE[stays]}. Those are not the same thing, and the second one is the truth.`
    : asks ? `You ask for ${CHANNEL_PHRASE[asks]}, and that is what stays. You know what you are looking for.`
    : `What stays with you, more than anything, is ${CHANNEL_PHRASE[stays]}: ${spell(stayed.find(item => item.channel === stays)!.count)} of the ${spell(marked)} films you marked.`;
  return { stayed, borrowed, enough, reading };
}

function halfLifeSection(afterimages: readonly AfterimageEntry[], book: HalfLifeBook): ViewerNotes['halfLife'] {
  const seen = new Set<string>();
  const stronger: string[] = [];
  let there = 0, gone = 0;
  for (const entry of afterimages) {
    const key = movieKey(entry.title, entry.year);
    if (seen.has(key)) continue;
    seen.add(key);
    const reading = latestReading(book.films[key]);
    if (reading === 'stronger') stronger.push(entry.title); else if (reading === 'there') there += 1; else if (reading === 'gone') gone += 1;
  }
  const asked = stronger.length + there + gone;
  const enough = asked >= MIN_READINGS;
  const reading = !enough ? 'A day, a week and a month after a film, the site asks whether it is still with you. The answers collect here.'
    : `Of ${plural(asked, 'film')} you have been asked about, ${spell(stronger.length)} grew stronger, ${spell(there)} held and ${spell(gone)} faded.${stronger.length ? ` ${list(stronger.slice(0, 3))} ${stronger.length === 1 ? 'is' : 'are'} still growing.` : gone > stronger.length + there ? ' Most films fade. That is what makes the others worth finding.' : ''}`;
  return { stronger, there, gone, reading, enough };
}

function decadeSection(reels: readonly NotesReel[], liked: NotesInput['liked'], afterimages: readonly AfterimageEntry[]): ViewerNotes['decades'] {
  const kept = new Map<string, number>();
  for (const film of [...liked, ...afterimages]) { const year = Number(film.year); if (year >= 1880 && year <= 2100) kept.set(movieKey(film.title, film.year), year); }
  const offered = new Map<string, number>();
  for (const reel of reels) for (const film of reel.result.recommendations) { const year = Number(film.year); if (year >= 1880 && year <= 2100) offered.set(movieKey(film.title, film.year), year); }
  const keptYears = [...kept.values()].sort((a, b) => a - b);
  const offeredYears = [...offered.values()].sort((a, b) => a - b);
  const every = [...keptYears, ...offeredYears];
  const items: NotesDecade[] = [];
  if (every.length) {
    const first = Math.floor(Math.min(...every) / 10) * 10, last = Math.floor(Math.max(...every) / 10) * 10;
    for (let decade = first; decade <= last; decade += 10) items.push({ decade, kept: keptYears.filter(year => year >= decade && year < decade + 10).length, offered: offeredYears.filter(year => year >= decade && year < decade + 10).length });
  }
  const enough = keptYears.length >= MIN_KEPT_YEARS;
  const median = (years: readonly number[]) => years.length ? years[Math.floor((years.length - 1) / 2)] : null;
  const centre = enough ? median(keptYears) : null;
  if (!enough || centre === null) return { items, centre, enough, reading: `The films you keep need to number ${spell(MIN_KEPT_YEARS)} before they have a centre. You have ${spell(keptYears.length)}; Like or log ${plural(MIN_KEPT_YEARS - keptYears.length, 'more film')}.` };
  const busiest = [...items].sort((a, b) => b.kept - a.kept)[0];
  const keptDecades = items.filter(item => item.kept > 0);
  const gap = items.find(item => item.kept === 0 && item.decade > keptDecades[0].decade && item.decade < keptDecades[keptDecades.length - 1].decade);
  const offeredCentre = median(offeredYears);
  const pull = offeredCentre !== null && Math.abs(offeredCentre - centre) >= 8
    ? ` The films you are offered sit ${spell(Math.abs(offeredCentre - centre))} years ${offeredCentre > centre ? 'later' : 'earlier'} than the ones you keep.` : '';
  return { items, centre, enough, reading: `The films you keep centre on ${centre}, and the ${busiest.decade}s hold more of them than any other decade.${gap ? ` Between them lies a decade you have kept nothing from: the ${gap.decade}s.` : ''}${pull}` };
}

/** Everything the notes say, from one browser's history. */
export function viewerNotes(input: NotesInput): ViewerNotes {
  const reels = [...input.reels].sort((a, b) => a.savedAt.localeCompare(b.savedAt));
  const films = new Set(reels.flatMap(reel => reel.result.recommendations.map(film => movieKey(film.title, film.year))));
  const watched = new Set(input.afterimages.map(entry => movieKey(entry.title, entry.year)));
  const wordNotes = wordsSection(reels);
  const colour = colourSection(reels);
  const directors = directorSection(reels);
  const stays = staysSection(reels, input.afterimages);
  const halfLife = halfLifeSection(input.afterimages, input.book);
  const decades = decadeSection(reels, input.liked, input.afterimages);
  const lines = [...input.afterimages].filter(entry => entry.note.trim()).sort((a, b) => a.watchedOn.localeCompare(b.watchedOn) || a.loggedAt.localeCompare(b.loggedAt))
    .slice(-MAX_LINES).map(entry => ({ title: entry.title, year: entry.year, note: entry.note.trim(), watchedOn: entry.watchedOn, stayed: [...entry.stayed] }));

  const headline = stays.enough ? stays.reading
    : wordNotes.recurring ? wordNotes.reading
    : directors.items[0]?.reels.length >= 2 ? directors.reading
    : reels.length ? `${plural(reels.length, 'reel')} and ${plural(watched.size, 'film')} watched. The notes have begun; they sharpen with every film you tell the site about.`
    : 'Nothing has been written yet. Develop a reel, watch a film, and say what stayed.';

  const top = wordNotes.recurring ? wordNotes.items.slice(0, 5).map(item => item.word) : [];
  const staying = stays.enough ? leader(stays.stayed) : null;
  const grew = input.afterimages.filter(entry => halfLife.stronger.includes(entry.title));
  const references = [...new Map(grew.map(entry => [movieKey(entry.title, entry.year), `${entry.title} (${entry.year})`])).values()].slice(0, 3);
  const request = top.length || staying || references.length ? {
    films: references,
    creativeBrief: [
      'These are notes on me as a viewer, counted from my own history here rather than from what I say I like.',
      top.length ? `Words that keep returning in my reels: ${top.join(', ')}.` : '',
      staying ? `What actually stays with me after a film is ${CHANNEL_PHRASE[staying]}.` : '',
      references.length ? 'The reference films are the ones that grew stronger in my memory after I watched them.' : '',
      directors.items[0]?.reels.length >= 2 ? `${directors.items[0].name} keeps being named as the spirit of my reels.` : '',
      'Programme five films for the viewer these notes describe. Let four deepen the pattern, and let one argue with it.',
    ].filter(Boolean).join(' ').slice(0, 1200),
  } : null;

  return { counts: { reels: reels.length, films: films.size, watched: watched.size, liked: input.liked.length }, headline, words: wordNotes, colour, directors, stays, halfLife, decades, lines, request };
}
