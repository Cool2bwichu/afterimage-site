// How a film treats you. The atlas read five things in most of its films, each from 0 to 100,
// and wrote down why: dread, cruelty, irony, ambiguity, and fracture (how broken its telling is).
// They are the questions people ask before they press play ("is it brutal?", "does it explain
// itself?"), so every star shows them, and any one of them can be bent: the films most like
// this one, with that one reading clearly changed and the rest of its temper kept.
import { TIME } from './time.mjs';

export const TEMPERS = [
  {
    id: 'dread', name: 'Dread', low: 'at ease', high: 'steeped in dread',
    words: ['at ease', 'a little uneasy', 'tense', 'full of dread', 'steeped in dread'],
    less: 'with less dread', more: 'with more dread',
  },
  {
    id: 'cruelty', name: 'Cruelty', low: 'tender to its people', high: 'cruel to them',
    words: ['tender', 'mostly kind', 'hard on its people', 'cruel', 'merciless'],
    less: 'gentler', more: 'crueller',
  },
  {
    id: 'irony', name: 'Irony', low: 'wholly sincere', high: 'held at an ironic distance',
    words: ['wholly sincere', 'mostly sincere', 'wry', 'ironic', 'held at arm’s length'],
    less: 'more sincere', more: 'more ironic',
  },
  {
    id: 'ambiguity', name: 'Ambiguity', low: 'everything settled', high: 'left open',
    words: ['all settled', 'mostly settled', 'some left open', 'open', 'wide open'],
    less: 'more settled', more: 'more open',
  },
  {
    id: 'fracture', name: 'Fracture', low: 'told straight through', high: 'a broken, shuffled telling',
    words: ['told straight', 'mostly straight', 'loops and gaps', 'broken up', 'shattered'],
    less: 'told straighter', more: 'more broken up',
  },
];
export const TEMPER_IDS = TEMPERS.map(temper => temper.id);
export const TEMPER_COLOUR = '#e6b38a'; // a film's temper, and the films it bends into, are drawn in this
export const temperById = id => TEMPERS.find(temper => temper.id === id) || null;

const BANDS = [15, 35, 60, 80]; // where one word gives way to the next
const CLEAR = 15;               // the least change that counts as bending
const AIM = 30;                 // the change a bend looks for first: clear, not the opposite pole

/** A film's five readings, [dread, cruelty, irony, ambiguity, fracture] with -1 where unread, or null if it has none. */
export function temperOf(film) {
  const ax = film && film.ax;
  return Array.isArray(ax) && ax.length === TEMPERS.length && ax.some(value => value >= 0) ? ax : null;
}

/** One reading in a word: "tense", "merciless", "told straight". */
export function temperWord(id, value) {
  const temper = temperById(id);
  if (!temper || !(value >= 0)) return '';
  let band = 0;
  while (band < BANDS.length && value >= BANDS[band]) band += 1;
  return temper.words[band];
}

/**
 * The films most like a star, with one reading clearly changed and the others kept.
 * @param {number} direction -1 for less, 1 for more
 * @param {object} [options]
 * @param {number} [options.k] how many to return
 * @param {Set<number>|null} [options.exclude] films never offered (set aside, watched, out of tonight's seeing)
 * @param {string} [options.light] the light likeness is measured in (Lookback measures as white light does)
 * @param {Float32Array} [options.scores] the star's likeness to every film under that light, if already known
 * @returns {Array<{ star: number, score: number, value: number, change: number, sim: number }>} best first;
 *   value: the film's reading; change: how far it moved, in the asked direction
 */
export function bend(universe, star, id, direction, { k = 18, exclude = null, light = 'white', scores = null } = {}) {
  const at = TEMPER_IDS.indexOf(id);
  const own = temperOf(universe.films[star]);
  if (at < 0 || !own || !(own[at] >= 0) || (direction !== 1 && direction !== -1)) return [];
  scores ||= universe.model.scores(light === TIME ? 'white' : light, star);
  const found = [];
  for (let j = 0; j < universe.count; j += 1) {
    if (j === star || (exclude && exclude.has(j))) continue;
    const theirs = temperOf(universe.films[j]);
    if (!theirs || !(theirs[at] >= 0)) continue;
    const change = (theirs[at] - own[at]) * direction;
    if (change < CLEAR) continue;
    const sim = scores[j];
    if (!(sim > 0)) continue;
    // The rest of the temper should stay where it was: the mean distance over the readings both have.
    let apart = 0;
    let read = 0;
    for (let n = 0; n < TEMPERS.length; n += 1) {
      if (n === at || !(own[n] >= 0) || !(theirs[n] >= 0)) continue;
      apart += Math.abs(theirs[n] - own[n]);
      read += 1;
    }
    apart = read ? apart / read : 30;
    const aimed = Math.exp(-0.5 * ((change - AIM) / AIM) ** 2);
    const kept = Math.exp(-((apart / 40) ** 2));
    found.push({ star: j, score: sim * (0.55 + 0.45 * aimed) * (0.6 + 0.4 * kept), value: theirs[at], change, sim });
  }
  found.sort((a, b) => b.score - a.score);
  return found.slice(0, k);
}

/**
 * The bends worth offering at a star: for each reading, "less" unless it is already low and
 * "more" unless it is already high, each only if enough films answer it.
 * @returns {Array<{ id: string, direction: number, label: string, films: Array }>}
 */
export function bendsOf(universe, star, { exclude = null, light = 'white', least = 3 } = {}) {
  const own = temperOf(universe.films[star]);
  if (!own) return [];
  const scores = universe.model.scores(light === TIME ? 'white' : light, star);
  const out = [];
  TEMPERS.forEach((temper, n) => {
    const value = own[n];
    if (!(value >= 0)) return;
    for (const direction of [-1, 1]) {
      if (direction < 0 && value < 30) continue;
      if (direction > 0 && value > 70) continue;
      const films = bend(universe, star, temper.id, direction, { exclude, light, scores });
      if (films.length >= least) out.push({ id: temper.id, direction, label: direction < 0 ? temper.less : temper.more, films });
    }
  });
  return out;
}
