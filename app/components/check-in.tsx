'use client';

import { useState } from 'react';
import { READINGS, READING_LABEL, checkInCalendar, type CheckIn, type Reading } from '../lib/half-life';
import { saveFile } from '../lib/save-file';
import { StarGlyph } from './celestial';

const REPLIES: Record<Reading, string> = {
  gone: 'Gone. Most films go; the few that don’t are the ones worth knowing.',
  there: 'Still there. Its star keeps its light in your sky.',
  stronger: 'Stronger. It is growing in you, and its star burns brighter for it.',
};

function since(checkIn: CheckIn): string {
  return checkIn.days >= 120 ? `${Math.round(checkIn.days / 30)} months` : checkIn.checkpoint.since;
}

/**
 * Half-life: a day, a week, a month and a season after a film, Afterimage asks once
 * whether it is still with you. One tap. The answer stays in this browser and only
 * changes how the film shines in your sky; it shapes recommendations only if you Like it.
 */
export function CheckInCard({ checkIn, liked, canDevelop, growingCount, onAnswer, onLater, onLike, onDevelop, onClose }: {
  checkIn: CheckIn; liked: boolean; canDevelop: boolean;
  /** Films whose last answer was "stronger", this one included once answered. */
  growingCount: number;
  onAnswer: (reading: Reading) => void; onLater: () => void; onLike: () => void; onDevelop: () => void; onClose: () => void;
}) {
  const [answered, setAnswered] = useState<Reading | null>(null);
  const [likedNow, setLikedNow] = useState(false);
  const [note, setNote] = useState('');
  const film = checkIn.entry;

  async function remind() {
    try {
      const text = checkInCalendar(film, new URL(document.baseURI).href);
      const result = await saveFile(`afterimage-${film.title.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'film'}-check-ins.ics`, new Blob([text], { type: 'text/calendar' }));
      setNote(result === 'downloaded' ? 'Four reminders, one for each check-in. Open the file to add them to your calendar.' : '');
    } catch { setNote('The reminders could not be saved here.'); }
  }

  if (answered) {
    return <aside className="check-in is-answered" aria-label={`${film.title}, ${checkIn.checkpoint.label.toLocaleLowerCase()}`} data-reading={answered}>
      <p className="check-in-kicker"><StarGlyph />Half-life · {checkIn.checkpoint.label}</p>
      <button type="button" className="check-in-close" aria-label="Close" onClick={onClose}>×</button>
      <p className="check-in-reply" role="status">{REPLIES[answered]}</p>
      <div className="check-in-actions">
        {answered === 'stronger' && !liked && !likedNow ? <button type="button" onClick={() => { onLike(); setLikedNow(true); }}>Like it, so it guides future reels</button> : null}
        {answered === 'stronger' && canDevelop ? <button type="button" className="is-primary" onClick={onDevelop}>{growingCount > 1 ? `A reel from the ${growingCount} films that grew` : 'A reel with its staying power'} <span aria-hidden="true">↗</span></button> : null}
      </div>
    </aside>;
  }

  return <aside className="check-in" aria-label={`Is ${film.title} still with you?`}>
    <p className="check-in-kicker"><StarGlyph />Half-life · {checkIn.checkpoint.label}</p>
    <p className="check-in-question">It’s been {since(checkIn)} since <strong>{film.title}</strong>. Is it still with you?</p>
    <div className="check-in-readings" role="group" aria-label="Your answer">
      {READINGS.map(reading => <button type="button" key={reading} data-reading={reading} onClick={() => { onAnswer(reading); setAnswered(reading); }}>
        <i aria-hidden="true" />{READING_LABEL[reading]}</button>)}
    </div>
    <p className="check-in-small">
      <button type="button" onClick={onLater}>Ask me later</button>
      <button type="button" onClick={() => void remind()}>Put the check-ins in my calendar</button>
      <span>Your answer stays in this browser.</span>
    </p>
    {note ? <p className="check-in-note" role="status">{note}</p> : null}
  </aside>;
}
