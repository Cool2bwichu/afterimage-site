// The Navigator: Claude behind every step of the voyage.
//
// This module is transport-blind. It builds each prompt from the chart's
// evidence, hands it to `ask` (the page's own Claude, or the companion's
// Opus 5.5), and cleans what comes back. The same code runs in the browser
// and on the companion server.
import { LIGHT_IDS } from '../src/engine/lights.mjs';
import { neighbourhood, between, taste } from '../src/engine/voyage.mjs';
import { buildVocabulary } from './vocabulary.mjs';
import { readPartial } from './partial.mjs';
import { starFromReading, readingSlug } from './reading.mjs';
import { arrivalPrompt, deepFieldPrompt, chartPrompt, coursePrompt, collisionPrompt, skyPrompt, filmName } from './prompts.mjs';
import {
  SCHEMAS, EFFORT, NavigatorError,
  normaliseArrival, normaliseDeepField, normaliseChart, normaliseCourse, normaliseCollision, normaliseSky,
} from './contracts.mjs';

export { NavigatorError };

/**
 * @param {object} input
 * @param {object} input.universe  an open universe
 * @param {object[]|null} [input.depth]  depth.json's films, for richer cards
 * @param {(request: { op, system, user, schema, effort, onText, signal }) => Promise<any>} input.ask
 *   sends one prompt and resolves with the parsed JSON answer; `onText`, when
 *   given, should be called with the whole answer text so far as it streams
 */
export function createNavigator({ universe, depth = null, ask, vocabulary = buildVocabulary(universe.bundle.traits) }) {
  const draftReader = (handler, normalise) => (handler ? text => {
    const draft = readPartial(text);
    if (draft === undefined) return;
    try { handler(normalise(draft)); } catch { /* a draft is never an error */ }
  } : undefined);

  const inRange = star => Number.isInteger(star) && star >= 0 && star < universe.count;
  const need = (star, what) => { if (!inRange(star)) throw new NavigatorError('bad_input', `${what} is not a star on this chart.`); };

  /** The neighbours a star's arrival is read against: a few per light. */
  function candidatesFor(star, perLight = 5) {
    const candidates = {};
    for (const light of LIGHT_IDS) {
      const near = neighbourhood(universe, light, star, perLight);
      if (near.length) candidates[light] = near;
    }
    return candidates;
  }

  /**
   * Arrival at a star: the six rays read, an essence, and a film from beyond the chart.
   * @returns {Promise<{ essence, rays: Array<{ light, star, claim, watch }>, beyond }>}
   */
  async function arrival(star, { onDraft, signal } = {}) {
    need(star, 'That');
    const candidates = candidatesFor(star);
    if (!Object.keys(candidates).length) throw new NavigatorError('unlit', 'The chart has nothing near this star to read it against.');
    const raw = await ask({
      op: 'arrival', ...arrivalPrompt({ universe, depth, star, candidates }),
      schema: SCHEMAS.arrival, effort: EFFORT.arrival, signal,
      onText: draftReader(onDraft, draft => normaliseArrival(draft, candidates, true)),
    });
    return normaliseArrival(raw, candidates);
  }

  /**
   * The deep field: films the chart does not hold, near a star.
   * `onStar` receives each reading as soon as it is complete.
   * @returns {Promise<{ stars: object[] }>} readings, each with { light, claim }
   */
  async function deepField(star, { count = 8, already = [], onStar, signal } = {}) {
    need(star, 'That');
    const charted = universe.model.neighbours('white', star, 40).map(n => n.i);
    let emitted = 0;
    const raw = await ask({
      op: 'deepfield', ...deepFieldPrompt({ universe, depth, vocabulary, star, charted, count, already }),
      schema: SCHEMAS.deepfield, effort: EFFORT.deepfield, signal,
      onText: draftReader(onStar && (draft => {
        for (; emitted < draft.stars.length; emitted += 1) onStar(draft.stars[emitted], emitted);
      }), draft => normaliseDeepField(draft, vocabulary, true)),
    });
    const result = normaliseDeepField(raw, vocabulary);
    if (onStar) for (; emitted < result.stars.length; emitted += 1) onStar(result.stars[emitted], emitted);
    return result;
  }

  /** Charts one named film. @returns {Promise<{ star: object|null, note: string }>} */
  async function chart({ query, year = 0, director = '' }, { signal } = {}) {
    if (!String(query || '').trim()) throw new NavigatorError('bad_input', 'Name a film to chart.');
    const raw = await ask({
      op: 'chart', ...chartPrompt({ vocabulary, query, year, director }),
      schema: SCHEMAS.chart, effort: EFFORT.chart, signal,
    });
    return normaliseChart(raw, vocabulary);
  }

  /** A course: a short named voyage. @returns {Promise<{ name, heading, waypoints }>} */
  async function course({ request = '', loved = [], seen = [], count = 5 }, { onDraft, signal } = {}) {
    const lovedStars = loved.filter(inRange);
    if (!String(request).trim() && !lovedStars.length) throw new NavigatorError('bad_input', 'Say what you are in the mood for, or mark a film you love.');
    const raw = await ask({
      op: 'course', ...coursePrompt({ universe, vocabulary, request, loved: lovedStars, seen: seen.filter(inRange), count }),
      schema: SCHEMAS.course, effort: EFFORT.course, signal,
      onText: draftReader(onDraft, draft => normaliseCourse(draft, vocabulary, true)),
    });
    return normaliseCourse(raw, vocabulary);
  }

  /** The film between two films. @returns {Promise<{ star, fromA, fromB, spark }>} */
  async function collide(a, b, { signal } = {}) {
    need(a, 'The first film');
    need(b, 'The second film');
    if (a === b) throw new NavigatorError('bad_input', 'A collision needs two different films.');
    const raw = await ask({
      op: 'collision', ...collisionPrompt({ universe, depth, vocabulary, a, b, between: between(universe, a, b, 4).map(entry => entry.star) }),
      schema: SCHEMAS.collision, effort: EFFORT.collision, signal,
    });
    return normaliseCollision(raw, vocabulary);
  }

  /** A reading of the taste a set of loved films shows. */
  async function sky(loved, { onDraft, signal } = {}) {
    const stars = loved.filter(inRange);
    if (stars.length < 2) throw new NavigatorError('bad_input', 'Mark at least two films you love first.');
    const measured = taste(universe, stars);
    const raw = await ask({
      op: 'sky', ...skyPrompt({ universe, vocabulary, loved: stars, threads: measured.threads, lights: measured.lights.slice(0, 3) }),
      schema: SCHEMAS.sky, effort: EFFORT.sky, signal,
      onText: draftReader(onDraft, draft => normaliseSky(draft, vocabulary, true)),
    });
    return normaliseSky(raw, vocabulary);
  }

  return { vocabulary, candidatesFor, arrival, deepField, chart, course, collide, sky };
}

/**
 * Gives readings their place in the universe. A reading of a film the
 * universe already holds resolves to that star; the rest become new stars.
 * @param {object} input
 * @param {object} input.universe
 * @param {{ exact(title, year): number }} input.search
 * @param {object} input.vocabulary
 * @param {object[]} input.readings  clean readings
 * @param {number} [input.from]      the star they were sighted from
 * @param {string} [input.source]    how they were found: deepfield, chart, course, collision, sky
 * @returns {Array<{ star: number, isNew: boolean, reading: object }>} in the readings' order
 */
export function settleReadings({ universe, search, vocabulary, readings, from, source = 'deepfield', extra = () => ({}) }) {
  const settled = readings.map(reading => {
    const bySlug = universe.indexOfSlug(readingSlug(reading));
    const existing = bySlug >= 0 ? bySlug : search.exact(reading.title, reading.year);
    return { reading, star: existing, isNew: existing < 0 };
  });
  const fresh = settled.filter(entry => entry.isNew);
  if (fresh.length) {
    const added = universe.addStars(fresh.map(entry => starFromReading(entry.reading, universe, vocabulary, {
      from: Number.isInteger(from) ? from : undefined, source, extra: extra(entry.reading),
    })));
    fresh.forEach((entry, n) => { entry.star = added[n]; });
  }
  return settled;
}

export { filmName, readingSlug };
