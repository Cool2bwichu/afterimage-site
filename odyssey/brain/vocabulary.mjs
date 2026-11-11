// The words the Navigator may use to chart a film the chart does not hold.
//
// A star charted from memory must land in the same space as the charted
// films, or it could not be compared with them. So Claude describes it with
// tags taken from the chart's own trait table: the traits common and plain
// enough to recognise from memory. The list is derived from the compiled
// bundle, so a recompiled chart always offers the vocabulary it actually has.
import { LIGHT_IDS } from '../src/engine/lights.mjs';
import { fold } from '../src/engine/search.mjs';

// Per light: trait kinds a reader can assert from memory, with the fewest
// films a trait must hold (and, for common beats, the most).
const CLOSED = {
  story: [['attr', 1], ['register', 1], ['event', 20], ['beat', 50, 700]],
  feeling: [['attr', 1], ['register', 1]],
  image: [['attr', 1], ['form', 9], ['look', 1], ['frame', 1], ['register', 1]],
  idea: [['attr', 1], ['register', 1], ['theme', 20], ['relation', 60]],
  world: [['attr', 1], ['register', 1], ['genre', 16], ['tradition', 20], ['placetype', 18], ['period', 12], ['being', 30]],
};
const MOVEMENT_MIN = 9;

// Left out of what Claude is offered: either a spoiler by nature or better
// not asserted from memory about a film nobody has checked.
const WITHHELD = new Set(['rape', 'incest', 'child abuse', 'sexual abuse', 'pregnancy', 'confession', 'the 20th century']);

/**
 * @param {Array<{l:number,k:string,t:string,s:string,df:number,v?:number,rt?:number}>} traits the chart's trait table
 */
export function buildVocabulary(traits) {
  const lights = {};
  const lookup = new Map();
  for (const light of Object.keys(CLOSED)) {
    const l = LIGHT_IDS.indexOf(light);
    const chosen = [];
    CLOSED[light].forEach(([kind, min, max = Infinity], order) => {
      traits.forEach((trait, id) => {
        if (trait.l !== l || trait.k !== kind || trait.v || trait.rt) return;
        if (trait.df < min || trait.df > max) return;
        if (WITHHELD.has(trait.t.toLowerCase())) return;
        chosen.push({ id, label: trait.t, order, df: trait.df });
      });
    });
    chosen.sort((a, b) => a.order - b.order || b.df - a.df || a.id - b.id);
    const seen = new Set();
    lights[light] = [];
    for (const entry of chosen) {
      const key = fold(entry.label);
      if (seen.has(key)) continue;
      seen.add(key);
      lights[light].push({ id: entry.id, label: entry.label });
      lookup.set(`${light}|${key}`, entry.id);
    }
  }

  // Movements are offered by their short names ("French New Wave").
  const movements = [];
  const byMovement = new Map();
  traits.forEach((trait, id) => {
    if (LIGHT_IDS[trait.l] !== 'hands' || trait.k !== 'movement' || trait.df < MOVEMENT_MIN || trait.rt) return;
    const key = fold(trait.s);
    const existing = byMovement.get(key);
    if (!existing || existing.df < trait.df) byMovement.set(key, { id, label: trait.s, df: trait.df });
  });
  for (const entry of [...byMovement.values()].sort((a, b) => b.df - a.df)) movements.push({ id: entry.id, label: entry.label });

  /** The trait id for a tag Claude returned under a light, or -1. */
  function find(light, tag) {
    const id = lookup.get(`${light}|${fold(tag)}`);
    return id === undefined ? -1 : id;
  }

  function movement(name) {
    const entry = byMovement.get(fold(String(name || '').replace(/^(part of )?(the )?/i, '')));
    return entry ? entry.id : -1;
  }

  /** The vocabulary as it is written into a prompt. */
  function block() {
    const lines = Object.keys(CLOSED).map(light => `${light}: ${lights[light].map(entry => entry.label).join(' | ')}`);
    lines.push(`movements: ${movements.map(entry => entry.label).join(' | ')}`);
    return lines.join('\n');
  }

  return { lights, movements, find, movement, block, size: Object.values(lights).reduce((n, list) => n + list.length, 0) };
}

export const TAGGED_LIGHTS = Object.keys(CLOSED);
