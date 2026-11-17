// Finds the constellations: small figures of films that carry two traits which
// seldom go together. A galaxy is a family; a constellation is a pattern you
// can only see by standing in the right place.
import { CONCEPT_NOUNS, DENIED_PAIRS, RENAMED } from '../authored/constellations.mjs';
import { LIGHT_IDS } from '../../src/engine/lights.mjs';

const ADJECTIVE_LIGHTS = new Set(['feeling', 'image']);
const NOUN_LIGHTS = new Set(['story', 'idea', 'world']);
const STRONG = 0.55; // a film must carry both traits clearly
const MIN_STARS = 5;
const MAX_STARS = 9;

// Words too broad to make a figure worth finding.
const PLAIN_ADJECTIVES = new Set(['Sincere']);
const PLAIN_NOUNS = new Set(['Class', 'Work']);

const nounOf = trait => {
  const noun = trait.noun || (trait.concept && CONCEPT_NOUNS[trait.concept]) || null;
  return noun && !PLAIN_NOUNS.has(noun) ? noun : null;
};
// Frame measurements describe a print, not a temperament: they make poor names.
const adjectiveOf = trait => (trait.adj && trait.kind !== 'frame' && !PLAIN_ADJECTIVES.has(trait.adj) ? trait.adj : null);

export function findConstellations({ count, films, traits, lights, limit = 64 }) {
  // Films that carry each trait strongly.
  const carriers = new Map();
  for (const light of LIGHT_IDS) {
    const { ptr, idx, raw } = lights[light];
    for (let film = 0; film < count; film += 1) {
      for (let p = ptr[film]; p < ptr[film + 1]; p += 1) {
        const weight = raw[p] / 255;
        if (weight < STRONG) continue;
        if (!carriers.has(idx[p])) carriers.set(idx[p], new Map());
        carriers.get(idx[p]).set(film, weight);
      }
    }
  }

  const adjectives = [];
  const nouns = [];
  traits.forEach((trait, id) => {
    const held = carriers.get(id);
    if (!held || held.size < 12) return;
    if (ADJECTIVE_LIGHTS.has(trait.light) && adjectiveOf(trait)) adjectives.push(id);
    if (NOUN_LIGHTS.has(trait.light) && nounOf(trait)) nouns.push(id);
  });

  const candidates = [];
  for (const a of adjectives) {
    const heldA = carriers.get(a);
    for (const b of nouns) {
      const heldB = carriers.get(b);
      const key = `${traits[a].id}+${traits[b].id}`;
      if (DENIED_PAIRS.has(key)) continue;
      const both = [];
      for (const [film, wa] of heldA) {
        const wb = heldB.get(film);
        if (wb !== undefined) both.push({ film, joint: Math.min(wa, wb) });
      }
      if (both.length < MIN_STARS || both.length > 16) continue;
      const expected = (heldA.size * heldB.size) / count;
      const lift = both.length / expected;
      if (lift > 2.4) continue; // the two traits simply go together: no surprise in that
      const known = both.filter(star => films[star.film].renown >= 2).length;
      if (known < 2) continue;
      both.sort((x, y) => y.joint - x.joint || films[y.film].renown - films[x.film].renown || x.film - y.film);
      const strength = both.slice(0, MAX_STARS).reduce((sum, star) => sum + star.joint, 0) / Math.min(MAX_STARS, both.length);
      const surprise = 1 / (1 + Math.abs(Math.log(lift / 0.7)));
      const fullness = Math.min(1, both.length / 7);
      const familiar = Math.min(1, known / 4);
      candidates.push({ a, b, key, stars: both, lift, score: surprise * fullness * strength * (0.6 + 0.4 * familiar) });
    }
  }
  candidates.sort((x, y) => y.score - x.score || (x.key < y.key ? -1 : 1));

  const usedTrait = new Map();
  const usedFilm = new Map();
  const chosen = [];
  for (const candidate of candidates) {
    if (chosen.length >= limit) break;
    if ((usedTrait.get(candidate.a) || 0) >= 4 || (usedTrait.get(candidate.b) || 0) >= 3) continue;
    const stars = candidate.stars.slice(0, MAX_STARS).map(star => star.film);
    if (stars.filter(film => (usedFilm.get(film) || 0) >= 4).length > stars.length / 2) continue;
    const overlaps = chosen.some(other => {
      const shared = stars.filter(film => other.stars.includes(film)).length;
      return shared / Math.min(stars.length, other.stars.length) > 0.5;
    });
    if (overlaps) continue;
    usedTrait.set(candidate.a, (usedTrait.get(candidate.a) || 0) + 1);
    usedTrait.set(candidate.b, (usedTrait.get(candidate.b) || 0) + 1);
    for (const film of stars) usedFilm.set(film, (usedFilm.get(film) || 0) + 1);
    const automatic = `${traits[candidate.a].adj} ${nounOf(traits[candidate.b])}`;
    chosen.push({
      name: RENAMED[candidate.key] || automatic,
      key: candidate.key,
      traits: [candidate.a, candidate.b],
      stars,
      lift: Math.round(candidate.lift * 100) / 100,
    });
  }
  return chosen;
}
