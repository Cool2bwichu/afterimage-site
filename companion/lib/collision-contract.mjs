// A collision: two films held together, and the one real film that lives
// between them. The request names the two films and carries the viewer's
// exclusions and Likes; the answer is one film with what it inherits from each.
import { validateLikedFilms } from './taste-profile.mjs';

const YEAR = /^\d{4}$/;

function badRequest(message) {
  return Object.assign(new Error(message), { code: 'BAD_REQUEST' });
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function titleKey(title) {
  return title.normalize('NFKD').replace(/\p{Mark}/gu, '')
    .toLocaleLowerCase('en-US').replace(/&/g, ' and ')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ').trim();
}

const filmKey = (film) => `${titleKey(film.title)}|${film.year}`;

function canonicalId(fact) {
  if (Number.isSafeInteger(fact?.tmdbId) && fact.tmdbId > 0) return `tmdb:${fact.tmdbId}`;
  if (typeof fact?.imdbId === 'string' && /^tt\d{5,12}$/.test(fact.imdbId)) return `imdb:${fact.imdbId}`;
  return null;
}

function requestFilm(value, label) {
  if (!isRecord(value) || Object.keys(value).some((key) => !['title', 'year', 'tmdbId'].includes(key))) {
    throw badRequest(`${label} needs a title and a year.`);
  }
  const title = typeof value.title === 'string' ? value.title.trim() : '';
  const year = typeof value.year === 'string' ? value.year.trim() : '';
  if (!title || title.length > 160) throw badRequest(`${label} needs a title.`);
  if (!YEAR.test(year)) throw badRequest(`${label} needs a four-digit year.`);
  if (value.tmdbId !== undefined && (!Number.isSafeInteger(value.tmdbId) || value.tmdbId <= 0)) {
    throw badRequest(`${label} has an invalid catalogue ID.`);
  }
  return { title, year, ...(value.tmdbId !== undefined ? { tmdbId: value.tmdbId } : {}) };
}

export function validateCollisionInput(value) {
  if (!isRecord(value) || Object.keys(value).some((key) => !['films', 'excludedFilms', 'likedFilms', 'creativeBrief', 'reelFilms'].includes(key))) {
    throw badRequest('A collision needs two films.');
  }
  if (!Array.isArray(value.films) || value.films.length !== 2) throw badRequest('A collision needs exactly two films.');
  const films = value.films.map((film, index) => requestFilm(film, index === 0 ? 'The first film' : 'The second film'));
  if (filmKey(films[0]) === filmKey(films[1])) throw badRequest('A film cannot collide with itself.');

  if (!Array.isArray(value.excludedFilms ?? [])) throw badRequest('excludedFilms must be an array.');
  const excludedFilms = (value.excludedFilms ?? []).map((film, index) => {
    const checked = requestFilm(film, `Excluded film ${index + 1}`);
    return { title: checked.title, year: checked.year };
  });
  if (excludedFilms.length > 100) throw badRequest('AFTERIMAGE accepts at most 100 excluded films.');

  // The films already on screen in the viewer's reel: the new film should be a new one.
  if (!Array.isArray(value.reelFilms ?? [])) throw badRequest('reelFilms must be an array.');
  const reelFilms = (value.reelFilms ?? []).map((film, index) => {
    const checked = requestFilm(film, `Reel film ${index + 1}`);
    return { title: checked.title, year: checked.year };
  });
  if (reelFilms.length > 10) throw badRequest('AFTERIMAGE accepts at most 10 reel films.');

  if (value.creativeBrief !== undefined && typeof value.creativeBrief !== 'string') throw badRequest('Creative brief must be a string.');
  const creativeBrief = (value.creativeBrief ?? '').trim();
  if (creativeBrief.length > 1200) throw badRequest('Creative brief is too long.');

  return {
    films,
    ...(excludedFilms.length ? { excludedFilms } : {}),
    ...(reelFilms.length ? { reelFilms } : {}),
    ...(value.likedFilms !== undefined ? { likedFilms: validateLikedFilms(value.likedFilms) } : {}),
    ...(creativeBrief ? { creativeBrief } : {}),
  };
}

export const COLLISION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['film'],
  properties: {
    film: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'year', 'reason', 'fromFirst', 'fromSecond', 'watchFor'],
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 160 },
        year: { type: 'string', pattern: '^\\d{4}$' },
        reason: { type: 'string', minLength: 1, maxLength: 400 },
        fromFirst: { type: 'string', minLength: 1, maxLength: 240 },
        fromSecond: { type: 'string', minLength: 1, maxLength: 240 },
        watchFor: { type: 'string', minLength: 1, maxLength: 300 },
      },
    },
  },
};

function generatedText(value, label, maxLength) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  const cleaned = value.trim();
  if (cleaned.length > maxLength) throw new Error(`${label} is too long.`);
  return cleaned;
}

/** Checks the answer against the content rules and returns the collision the site shows. */
export function normalizeCollision(raw, input) {
  if (!isRecord(raw) || Object.keys(raw).length !== 1 || !isRecord(raw.film)) {
    throw new Error('The collision must contain exactly one film.');
  }
  const film = raw.film;
  const title = generatedText(film.title, 'The film title', 160);
  const year = generatedText(film.year, 'The film year', 4);
  if (!YEAR.test(year)) throw new Error(`${title} has an invalid release year.`);
  const key = filmKey({ title, year });
  if (input.films.some((collided) => filmKey(collided) === key)) throw new Error(`${title} is one of the two collided films.`);
  if ((input.excludedFilms || []).some((blocked) => filmKey(blocked) === key)) throw new Error(`${title} was marked not interested.`);
  if ((input.likedFilms || []).some((liked) => filmKey(liked) === key)) throw new Error(`${title} is already seen and liked.`);
  if ((input.reelFilms || []).some((shown) => filmKey(shown) === key)) throw new Error(`${title} is already in the viewer's reel.`);
  return {
    kind: 'collision-v1',
    films: input.films.map(({ title: collidedTitle, year: collidedYear, tmdbId }) => ({ title: collidedTitle, year: collidedYear, ...(tmdbId ? { tmdbId } : {}) })),
    film: {
      title,
      year,
      reason: generatedText(film.reason, 'The reason', 400),
      fromFirst: generatedText(film.fromFirst, 'What it takes from the first film', 240),
      fromSecond: generatedText(film.fromSecond, 'What it takes from the second film', 240),
      watchFor: generatedText(film.watchFor, 'The watch note', 300),
    },
  };
}

/** The new film must exist in the catalogue and be neither of the two it came from. */
export async function verifyCollision(collision, metadataProvider) {
  const requests = [collision.film, ...collision.films].map(({ title, year, tmdbId }) => ({ title, year, ...(tmdbId ? { tmdbId } : {}) }));
  const facts = await metadataProvider(requests);
  if (!Array.isArray(facts) || facts.length !== requests.length ||
      facts.some((fact, index) => !fact || fact.requestedTitle !== requests[index].title || fact.requestedYear !== requests[index].year)) {
    throw new Error('The film between them could not be verified.');
  }
  const candidate = canonicalId(facts[0]);
  if (facts[0].status !== 'matched' || !candidate) throw new Error(`${collision.film.title} (${collision.film.year}) could not be found in the film catalogue.`);
  if (facts.slice(1).some((fact) => fact.status === 'matched' && canonicalId(fact) === candidate)) {
    throw new Error(`${collision.film.title} is one of the two collided films.`);
  }
  return { ...collision, film: { ...collision.film, ...(Number.isSafeInteger(facts[0].tmdbId) ? { tmdbId: facts[0].tmdbId } : {}) } };
}
