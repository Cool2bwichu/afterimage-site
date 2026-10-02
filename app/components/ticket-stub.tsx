'use client';

import type { CSSProperties } from 'react';
import { FACET_META, type FacetKey } from '../lib/light-table';
import { ordinal, ticketSerial } from '../lib/ticket';

export const CHANNEL_COLORS: Record<FacetKey, string> = { whereItLives: '#e8b34a', howItFeels: '#e5a29b', howItLooks: '#99c6b7', howItSpeaks: '#c3b0d1' };

export type StubEntry = { title: string; year: string; watchedOn: string; stayed: readonly FacetKey[]; labels?: Partial<Record<FacetKey, string>>; note: string };

function stubDate(watchedOn: string): string {
  const date = new Date(`${watchedOn}T12:00:00`);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase() : watchedOn;
}

/**
 * What a watched film leaves behind: a ticket stub with the night, the qualities that
 * stayed and the line you kept. Stubs collect in your sky beside each film's star.
 */
export function TicketStub({ entry, number, compact = false }: { entry: StubEntry; number: number; compact?: boolean }) {
  const colors = entry.stayed.length ? entry.stayed.map(channel => CHANNEL_COLORS[channel]) : ['#dec6a0'];
  return <figure className={`ticket-stub${compact ? ' is-compact' : ''}`} style={{ '--stub-a': colors[0], '--stub-b': colors[colors.length - 1] } as CSSProperties}
    aria-label={`Ticket stub: ${entry.title} (${entry.year}), watched ${stubDate(entry.watchedOn)}, your ${ordinal(number)} film`}>
    <div className="ticket-main">
      <p className="ticket-admit">AFTERIMAGE · Admit one</p>
      <p className="ticket-title">{entry.title} <span>{entry.year}</span></p>
      <p className="ticket-stayed">{entry.stayed.length ? entry.stayed.map(channel => <em key={channel} style={{ '--channel': CHANNEL_COLORS[channel] } as CSSProperties}>{entry.labels?.[channel] ?? FACET_META[channel].label}</em>) : <em>The whole film</em>}</p>
      {entry.note && !compact ? <blockquote>{entry.note}</blockquote> : null}
    </div>
    <div className="ticket-end">
      <span className="ticket-serial">No. {ticketSerial(entry)}</span>
      <span className="ticket-date">{stubDate(entry.watchedOn)}</span>
      <span className="ticket-count">Your {ordinal(number)} film</span>
    </div>
  </figure>;
}
