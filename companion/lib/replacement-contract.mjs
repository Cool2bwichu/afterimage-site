import {
  AFTERIMAGE_LIGHT_TABLE_SCHEMA_V1,
  AFTERIMAGE_SCHEMA_V2,
  LIGHT_TABLE_EXPERIENCE,
  normalizeV2Result,
  validateV2Input,
} from './v2-contract.mjs';

function badRequest(message) {
  return Object.assign(new Error(message), { code: 'BAD_REQUEST' });
}

function titleKey(title) {
  return title.normalize('NFKD').replace(/\p{Mark}/gu, '')
    .toLocaleLowerCase('en-US').replace(/&/g, ' and ')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ').trim();
}

function canonicalId(fact) {
  if (Number.isSafeInteger(fact.tmdbId) && fact.tmdbId > 0) return `tmdb:${fact.tmdbId}`;
  if (typeof fact.imdbId === 'string' && /^tt\d{5,12}$/.test(fact.imdbId)) return `imdb:${fact.imdbId}`;
  return null;
}

export function validateReplacementInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some((key) => !['request', 'reel', 'replaceIndex'].includes(key))) {
    throw badRequest('A replacement needs the original request, current reel, and film position.');
  }
  const request = validateV2Input(value.request);
  const { reel, replaceIndex } = value;
  if (!Number.isInteger(replaceIndex) || replaceIndex < 0 || replaceIndex > 4) {
    throw badRequest('replaceIndex must be a film position from 0 to 4.');
  }
  if (!reel || typeof reel !== 'object' || Array.isArray(reel) ||
      !Array.isArray(reel.sourceFilms) ||
      reel.sourceFilms.length !== request.films.length ||
      reel.sourceFilms.some((film, index) => film !== request.films[index]) ||
      reel.status !== 'complete') {
    throw badRequest('The current reel does not match the original request.');
  }
  if (Boolean(reel.fingerprint) !== (request.experience === LIGHT_TABLE_EXPERIENCE)) {
    throw badRequest('The current reel does not match the requested experience.');
  }
  try {
    // Validate all five cards and Light Table facets. The current reel may contain
    // a newly liked or dismissed film, so historical cards are checked without
    // applying the current feedback lists to them.
    normalizeV2Result(reel, request.films, [], {
      experience: request.experience,
      selectedFacets: request.selectedFacets,
    });
  } catch {
    throw badRequest('The current reel is incomplete or invalid.');
  }
  return { request, reel, replaceIndex };
}

export function createReplacementSchema(experience) {
  const base = experience === LIGHT_TABLE_EXPERIENCE
    ? AFTERIMAGE_LIGHT_TABLE_SCHEMA_V1
    : AFTERIMAGE_SCHEMA_V2;
  return {
    type: 'object', additionalProperties: false, required: ['recommendation'],
    properties: { recommendation: base.properties.recommendations.items },
  };
}

export function completeReplacement(raw, input) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
      Object.keys(raw).length !== 1 || !raw.recommendation ||
      typeof raw.recommendation !== 'object' || Array.isArray(raw.recommendation)) {
    throw new Error('The replacement must contain exactly one recommendation.');
  }
  const { request, reel, replaceIndex } = input;
  const previous = new Set(reel.recommendations.map(({ title }) => titleKey(title)));
  const candidateKey = typeof raw.recommendation.title === 'string' &&
    typeof raw.recommendation.year === 'string'
    ? `${titleKey(raw.recommendation.title)}|${raw.recommendation.year.trim()}`
    : '';
  if (typeof raw.recommendation.title === 'string' &&
      previous.has(titleKey(raw.recommendation.title))) {
    throw new Error('The replacement repeats a film from this reel.');
  }
  for (const blocked of [...(request.excludedFilms || []), ...(request.likedFilms || [])]) {
    const key = `${titleKey(blocked.title)}|${blocked.year}`;
    if (candidateKey === key) throw new Error('The replacement is already seen or excluded.');
  }
  const recommendations = reel.recommendations.map((item, index) =>
    index === replaceIndex ? raw.recommendation : item);
  const checked = normalizeV2Result(
    { ...reel, recommendations }, request.films, [],
    { experience: request.experience, selectedFacets: request.selectedFacets },
  );
  // Keep the other four cards and the established reel framing intact, including
  // optional V3 editorial notes if the current reel contains them.
  return {
    ...reel,
    recommendations: reel.recommendations.map((item, index) =>
      index === replaceIndex ? checked.recommendations[index] : item),
  };
}

export async function verifyReplacementIdentity(input, reel, metadataProvider) {
  const candidate = reel.recommendations[input.replaceIndex];
  const requests = [candidate, ...input.reel.recommendations]
    .map(({ title, year }) => ({ title, year }));
  const facts = await metadataProvider(requests);
  if (!Array.isArray(facts) || facts.length !== requests.length) {
    throw new Error('Replacement film identity could not be verified.');
  }
  for (let index = 0; index < facts.length; index += 1) {
    if (!facts[index] || facts[index].requestedTitle !== requests[index].title ||
        facts[index].requestedYear !== requests[index].year) {
      throw new Error('Replacement metadata did not match the requested films.');
    }
  }
  if (facts[0].status !== 'matched' || !canonicalId(facts[0])) {
    throw new Error('Replacement film identity could not be verified.');
  }
  const candidateId = canonicalId(facts[0]);
  if (facts.slice(1).some((fact) => fact.status === 'matched' && canonicalId(fact) === candidateId)) {
    throw new Error('The replacement repeats a film from this reel.');
  }
  return reel;
}
