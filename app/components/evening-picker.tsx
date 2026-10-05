'use client';

import { EVENINGS, eveningLabel, fitsDouble, type Evening } from '../lib/evening';

/** How long the evening is, as a short ruler of lengths. Any length comes first. */
export function EveningPicker({ name, value, onChange, double = false }: {
  name: string; value: Evening | null; onChange: (evening: Evening | null) => void;
  /** Two films and an intermission rule out the short evenings. */
  double?: boolean;
}) {
  return <fieldset className="evening-picker">
    <legend>How long is the evening?</legend>
    <div>{[null, ...EVENINGS].map(option => {
      const ruledOut = double && !fitsDouble(option);
      return <label key={option ?? 'any'} data-checked={value === option || undefined} data-ruled-out={ruledOut || undefined}>
        <input type="radio" name={name} checked={value === option} disabled={ruledOut} onChange={() => onChange(option)} />
        <span>{eveningLabel(option)}</span>
      </label>;
    })}</div>
    {double ? <small>Two films and an intermission need three hours or more.</small> : null}
  </fieldset>;
}
