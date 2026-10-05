// Keep one, lose one. At the end of a reel, hold on to one thing it does and let one habit
// go for an evening: the next reel keeps the first and leaves the second behind. The turn
// becomes an ordinary reel request with the five films just seen left out, so the bridge
// needs nothing new.
import { FACET_KEYS, FACET_META, type FacetMap } from './light-table.ts';

/** Something a reel does: one of its four channels, or one of its sensibilities. */
export type Quality = { id: string; label: string; channel?: string; explanation?: string };
export type Turn = { keep: Quality; lose: Quality };

const MAX_LABEL = 50;
const MAX_EXPLANATION = 160;
const MAX_TITLE = 60;

function clean(value: unknown, max: number): string {
  const text = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/["“”]/g, '').replace(/\s+/g, ' ').trim() : '';
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

const sentence = (text: string) => /[.!?…]$/.test(text) ? text : `${text}.`;
const list = (items: string[]) => items.length === 1 ? items[0] : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

/** The qualities a reel can be turned on: its four channels, or failing those, its sensibilities. */
export function reelQualities(result: { fingerprint?: FacetMap; sensibilities?: readonly string[] }): Quality[] {
  const fingerprint = result.fingerprint;
  if (fingerprint) return FACET_KEYS.flatMap(key => {
    const label = clean(fingerprint[key]?.label, MAX_LABEL);
    const explanation = clean(fingerprint[key]?.explanation, MAX_EXPLANATION);
    return label ? [{ id: key, label, channel: FACET_META[key].label.toLocaleLowerCase(), ...(explanation ? { explanation } : {}) }] : [];
  });
  const seen = new Set<string>();
  return (result.sensibilities ?? []).flatMap(item => {
    const label = clean(item, MAX_LABEL);
    const id = label.toLocaleLowerCase();
    if (!label || seen.has(id)) return [];
    seen.add(id);
    return [{ id, label }];
  }).slice(0, 5);
}

export function canTurn(turn: Turn | null): turn is Turn {
  return Boolean(turn && turn.keep.label && turn.lose.label && turn.keep.id !== turn.lose.id);
}

/** The brief: what to keep, what to lose, and the reel being turned from. */
export function turnBrief(turn: Turn, reel: readonly { title: string; year: string }[]): string {
  const named = (quality: Quality) => `“${clean(quality.label, MAX_LABEL)}”${quality.channel ? ` (${quality.channel})` : ''}`;
  const films = reel.slice(0, 5).map(film => `${clean(film.title, MAX_TITLE)} (${film.year})`);
  const keep = clean(turn.keep.explanation, MAX_EXPLANATION);
  const lose = clean(turn.lose.explanation, MAX_EXPLANATION);
  return [
    `Turn my last reel: keep ${named(turn.keep)} and lose ${named(turn.lose)}.`,
    films.length ? `The last reel was ${list(films)}.` : '',
    keep ? `What to keep: ${sentence(keep)}` : '',
    lose ? `What to lose: ${sentence(lose)}` : '',
    'Find five new films that hold on to what I keep and leave what I lose behind for an evening, without simply swapping in its opposite. In each reason, say what the film keeps and what it lets go.',
  ].filter(Boolean).join(' ');
}

export function turnRequest(turn: Turn, reel: readonly { title: string; year: string }[]): { films: string[]; creativeBrief: string } {
  return { films: [], creativeBrief: turnBrief(turn, reel) };
}

/** What was kept and lost, back out of a brief this turn wrote. */
export function parseTurn(brief: string | undefined): { keep: string; lose: string } | null {
  const match = /^Turn my last reel: keep “([^”]{1,60})”(?: \([^)]{1,30}\))? and lose “([^”]{1,60})”/.exec(brief ?? '');
  return match ? { keep: match[1], lose: match[2] } : null;
}
