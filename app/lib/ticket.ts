// The small print on a ticket stub: which film this is in your journal, and a
// stable number for the night it was seen.
import { hashString } from './sky.ts';

export function ordinal(value: number): string {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  return `${value}${['th', 'st', 'nd', 'rd'][value % 10] ?? 'th'}`;
}

/** A stable six-digit number for the stub, from the film and the night it was seen. */
export function ticketSerial(entry: { title: string; year: string; watchedOn: string }): string {
  return String(hashString(`${entry.title.toLocaleLowerCase()}|${entry.year}|${entry.watchedOn}`) % 1_000_000).padStart(6, '0');
}
