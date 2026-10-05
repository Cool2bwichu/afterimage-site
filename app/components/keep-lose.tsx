'use client';

import { useState } from 'react';
import type { Quality, Turn } from '../lib/keep-lose';
import { StarGlyph } from './celestial';

type Mark = 'keep' | 'lose';

/**
 * Keep one, lose one. The reel's qualities, each with a light: lit for the one you keep,
 * eclipsed for the one you let go. The next reel holds on to the first and leaves the
 * second behind.
 */
export function KeepLose({ qualities, disabled, onTurn }: { qualities: Quality[]; disabled: boolean; onTurn: (turn: Turn) => void }) {
  const [keep, setKeep] = useState<string | null>(null);
  const [lose, setLose] = useState<string | null>(null);
  const kept = qualities.find(quality => quality.id === keep) ?? null;
  const lost = qualities.find(quality => quality.id === lose) ?? null;

  function mark(id: string, as: Mark) {
    if (as === 'keep') { setKeep(keep === id ? null : id); if (lose === id) setLose(null); }
    else { setLose(lose === id ? null : id); if (keep === id) setKeep(null); }
  }

  return <section className="keep-lose" aria-labelledby="keep-lose-title">
    <header className="keep-lose-head">
      <p className="keep-lose-kicker"><StarGlyph />Keep one, lose one</p>
      <h3 id="keep-lose-title">Turn this reel</h3>
      <p>Hold on to one thing it does, and let one habit go for an evening.</p>
    </header>
    <ul>{qualities.map(quality => {
      const state: Mark | undefined = keep === quality.id ? 'keep' : lose === quality.id ? 'lose' : undefined;
      return <li key={quality.id} data-mark={state}>
        <i className="keep-lose-light" aria-hidden="true" />
        <span className="keep-lose-quality">{quality.channel ? <small>{quality.channel}</small> : null}<strong>{quality.label}</strong></span>
        <span className="keep-lose-marks" role="group" aria-label={quality.label}>
          <button type="button" aria-pressed={state === 'keep'} onClick={() => mark(quality.id, 'keep')}>Keep</button>
          <button type="button" aria-pressed={state === 'lose'} onClick={() => mark(quality.id, 'lose')}>Lose</button>
        </span>
      </li>;
    })}</ul>
    <div className="keep-lose-actions">
      <p aria-live="polite">{kept && lost ? <>Keep <q>{kept.label}</q>, lose <q>{lost.label}</q>.</> : kept ? 'Now choose one to lose.' : lost ? 'Now choose one to keep.' : 'Choose one to keep and one to lose.'}</p>
      <button type="button" className="keep-lose-turn" disabled={disabled || !kept || !lost} onClick={() => { if (kept && lost) onTurn({ keep: kept, lose: lost }); }}>Turn the reel <span aria-hidden="true">↗</span></button>
    </div>
  </section>;
}
