// How long the evening is. A request can say so, and then the films have to fit it: one
// film inside the time, or two and their intermission. The bridge can only be asked, so
// once the reel is back with real running times, any film that runs past says so.
import { INTERMISSION_MINUTES } from './screening.ts';

/** Minutes an evening can be, besides any length at all. */
export const EVENINGS = [90, 120, 180, 240] as const;
export type Evening = typeof EVENINGS[number];

/** "About two hours" is about: a film can run this far over before it's called long. */
const GRACE_MINUTES = 5;

const SPOKEN: Record<Evening, string> = { 90: 'an hour and a half', 120: 'two hours', 180: 'three hours', 240: 'four hours' };
const SHORT: Record<Evening, string> = { 90: '1½ hours', 120: '2 hours', 180: '3 hours', 240: '4 hours' };

/** "2 hours", or "Any length". */
export function eveningLabel(evening: Evening | null): string {
  return evening ? SHORT[evening] : 'Any length';
}

/** "two hours", the way a sentence says it. */
export function spokenEvening(evening: Evening): string {
  return SPOKEN[evening];
}

/** Two films and an intermission don't fit in two hours. */
export function fitsDouble(evening: Evening | null): boolean {
  return evening === null || evening >= 180;
}

/** The sentence a brief carries for the evening's length, or nothing. */
export function eveningClause(evening: Evening | null, double = false): string {
  if (!evening) return '';
  return double
    ? `The whole evening is about ${SPOKEN[evening]}: the first two films together, with a ${INTERMISSION_MINUTES}-minute intermission between them, must fit inside it, and so must each of the others on its own.`
    : `The evening is about ${SPOKEN[evening]}, so every film must finish inside that.`;
}

/** The evening's length back out of a brief that carries the clause. */
export function parseEvening(brief: string | undefined): Evening | null {
  const match = /The (?:whole )?evening is about (an hour and a half|two hours|three hours|four hours)[,:]/.exec(brief ?? '');
  return match ? EVENINGS.find(evening => SPOKEN[evening] === match[1]) ?? null : null;
}

/** Whether a running time, in minutes, runs past the evening. One nobody knows never does. */
export function runsPast(minutes: number | null | undefined, evening: Evening | null): boolean {
  return Boolean(evening && minutes && minutes > evening + GRACE_MINUTES);
}
