// Tonight's comet. Once a night a comet crosses the sky carrying a film the chart
// thinks you are missing: one that the films you love pull toward you and that few
// have found or, before you love any, one seldom seen beside a film everyone knows.
// It is chosen from what you keep and from the night itself, so it is the same all
// night (the site keeps it once chosen), and the next night brings another.
import { hashString, mulberry32, shuffle } from './rng.mjs';
import { closestLight, sharedTraits } from './voyage.mjs';

// Where and when a film was made (its country, language, decade, a big studio): true of it, but seldom the reason two films belong together.
const PLACE = new Set(['country', 'language', 'era', 'decade']);
const weak = record => PLACE.has(record.k) || (record.k === 'studio' && (record.df || 0) > 30);

/**
 * What a comet's film shares with the film it came from near, under the light they are most
 * alike in (or the one given), the telling things first: a shared country or decade alone says little.
 * @returns {{ light: string, telling: number[], said: number[] }} said: at most two traits, to name
 */
export function cometBond(universe, from, star, light = closestLight(universe, from, star).light) {
  const { traits } = universe;
  const all = sharedTraits(universe, light, from, star, 5).map(entry => entry.trait);
  const telling = all.filter(trait => !weak(traits[trait]));
  return { light, telling, said: [...telling, ...all.filter(trait => weak(traits[trait]))].slice(0, 2) };
}

/** Why a comet carries its film: near one you love, near one you have reached, or near one everyone knows. */
export const COMET_WHY = ['loved', 'visited', 'known'];

/** The night a moment belongs to, as YYYY-MM-DD in local time: a night runs from five in the morning to five the next. */
export function nightOf(date = new Date()) {
  const at = new Date(date.getTime() - 5 * 3600 * 1000);
  const two = n => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`;
}

/**
 * Tonight's comet.
 * @param {object} universe
 * @param {{ night: string, loved?: number[], visited?: number[], exclude?: Set<number> }} options
 *   loved and visited: oldest first; exclude: films no comet carries (watched, saved, set aside, carried before)
 * @returns {{ star: number, from: number, light: string, why: string, shared: number[] } | null}
 *   from: the film it came from near; light: the light it is alike by; shared: the traits they share under it
 */
export function cometFor(universe, { night, loved = [], visited = [], exclude = new Set() } = {}) {
  const { films, base, count, model } = universe;
  const random = mulberry32(hashString(`comet|${night}`));
  const known = i => i >= 0 && i < count;
  const been = new Set([...loved, ...visited].filter(known));
  // Only a charted film, never one already reached, watched, saved or set aside.
  const free = i => i >= 0 && i < base && !exclude.has(i) && !been.has(i);
  const shared = (from, star) => cometBond(universe, from, star);
  /** Among the films most like one in everything, a free one that shares something telling with it. */
  const nearOne = (from, renown, among) => {
    const near = model.neighbours('white', from, 30, j => free(j) && (films[j].rn ?? 0) <= renown)
      .filter(entry => shared(from, entry.i).telling.length);
    return near.length ? near[Math.floor(random() * Math.min(among, near.length))].i : -1;
  };
  const carry = (star, from, why) => {
    const { light, said } = shared(from, star);
    return { star, from, light, why, shared: said };
  };

  // Near one of the films you love, a different one most nights (before you love any, one of the last you reached).
  const anchors = shuffle((loved.length ? loved.slice(-24) : visited.slice(-12)).filter(known), random);
  for (const from of anchors.slice(0, 8)) {
    const star = nearOne(from, 2, 5);
    if (star >= 0) return carry(star, from, loved.length ? 'loved' : 'visited');
  }
  // Nothing kept yet (or nothing left near it): a film few have found, beside one everyone knows.
  const famous = [];
  for (let i = 0; i < base; i += 1) if ((films[i].rn ?? 0) >= 3) famous.push(i);
  for (let tries = 0; tries < 24 && famous.length; tries += 1) {
    const from = famous[Math.floor(random() * famous.length)];
    const star = nearOne(from, 1, 3);
    if (star >= 0) return carry(star, from, 'known');
  }
  return null;
}

/**
 * Where tonight's comet flies: the way it comes in from, and the way it bends, as unit vectors
 * (mostly level, so it glides across the sky rather than toward the eye). Fixed by the night.
 */
export function cometPath(night) {
  const random = mulberry32(hashString(`path|${night}`));
  const angle = random() * Math.PI * 2;
  const side = random() < 0.5 ? -1 : 1;
  const rise = 0.08 + random() * 0.14;
  const from = [Math.cos(angle), rise, Math.sin(angle)];
  const length = Math.hypot(...from);
  return {
    from: from.map(value => value / length),
    bend: [-Math.sin(angle) * side, 0, Math.cos(angle) * side],
  };
}
