import { validateLikedFilms } from './taste-profile.mjs';
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const YEAR = /^\d{4}$/;
const TIMECODE = /^\d{2}:\d{2}:\d{2}:\d{2}$/;

export const LIGHT_TABLE_EXPERIENCE = 'light-table-v1';
export const FACET_KEYS = Object.freeze([
  'whereItLives',
  'howItFeels',
  'howItLooks',
  'howItSpeaks',
]);

const FACET_KEY_SET = new Set(FACET_KEYS);
// Compatibility adapter carried over from the subscription bridge: remember opt-in
// context on the exact validated film array so prompt selection and result
// normalization stay backward compatible with legacy scalar arguments.
const LIGHT_TABLE_CONTEXTS = new WeakMap();

function badRequest(message) {
  const error = new Error(message);
  error.code = 'BAD_REQUEST';
  return error;
}

function cleanText(value, label, maxLength = 600) {
  if (typeof value !== 'string' || !value.trim()) {
    throw badRequest(label + ' must be a non-empty string.');
  }
  const cleaned = value.trim();
  if (cleaned.length > maxLength) throw badRequest(label + ' is too long.');
  return cleaned;
}

function cleanGeneratedText(value, label, maxLength = 600) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(label + ' must be a non-empty string.');
  }
  const cleaned = value.trim();
  if (cleaned.length > maxLength) throw new Error(label + ' is too long.');
  return cleaned;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function rejectUnknownKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw badRequest(label + ' contains an unknown field/channel: ' + key + '.');
  }
}

function normalizeTrait(value, label, generated = false) {
  const cleaned = generated
    ? cleanGeneratedText(value, label, 60)
    : cleanText(value, label, 60);
  return cleaned.replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function normalizeTraits(value, label, generated = false) {
  const createError = generated ? (message) => new Error(message) : badRequest;
  if (!Array.isArray(value) || value.length < 1 || value.length > 6) {
    throw createError(label + ' must contain between 1 and 6 traits (one to six traits).');
  }
  const traits = value.map((trait, index) =>
    normalizeTrait(trait, label + ' trait ' + (index + 1), generated));
  if (new Set(traits).size !== traits.length) {
    throw createError(label + ' traits must be unique.');
  }
  return traits;
}

function normalizeSource(value, label) {
  if (!isRecord(value)) throw badRequest(label + ' source must include a title and year.');
  rejectUnknownKeys(value, new Set(['title', 'year']), label + ' source');
  const title = cleanText(value.title, label + ' source title', 160);
  const year = cleanText(value.year, label + ' source year', 4);
  if (!YEAR.test(year)) throw badRequest(label + ' source year is invalid.');
  return { title, year };
}

function normalizeSelectedFacet(value, label) {
  if (!isRecord(value)) throw badRequest(label + ' must be an object.');
  rejectUnknownKeys(value, new Set(['label', 'explanation', 'traits', 'source']), label);
  return {
    label: cleanText(value.label, label + ' label', 80),
    explanation: cleanText(value.explanation, label + ' explanation', 300),
    traits: normalizeTraits(value.traits, label),
    source: normalizeSource(value.source, label),
  };
}

function normalizeSelectedFacets(value) {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) throw badRequest('selectedFacets must be an object.');
  rejectUnknownKeys(value, FACET_KEY_SET, 'selectedFacets');

  const selectedFacets = {};
  for (const key of FACET_KEYS) {
    if (value[key] === undefined || value[key] === null) continue;
    selectedFacets[key] = normalizeSelectedFacet(value[key], 'Selected ' + key + ' facet');
  }
  return Object.keys(selectedFacets).length ? selectedFacets : undefined;
}

export function getV2InputContext(films) {
  return Array.isArray(films) ? LIGHT_TABLE_CONTEXTS.get(films) || null : null;
}

export function validateV2Input(input = {}) {
  if (!isRecord(input)) throw badRequest('Request body must be an object.');
  if (!Array.isArray(input.films ?? [])) throw badRequest('films must be an array.');
  const films = (input.films ?? []).map((film, index) =>
    cleanText(film, 'Film ' + (index + 1), 160));
  if (films.length > 20) throw badRequest('AFTERIMAGE accepts at most 20 films.');
  const unique = new Set(films.map((film) => film.toLocaleLowerCase()));
  if (unique.size !== films.length) throw badRequest('Each source film must be unique.');

  if (input.creativeBrief !== undefined && input.creativeBrief !== null &&
      typeof input.creativeBrief !== 'string') {
    throw badRequest('Creative brief must be a string.');
  }
  const creativeBrief = (input.creativeBrief ?? '').trim();
  if (creativeBrief.length > 1200) throw badRequest('Creative brief is too long.');

  let experience;
  if (input.experience !== undefined && input.experience !== null) {
    if (input.experience !== LIGHT_TABLE_EXPERIENCE) {
      throw badRequest('experience must be light-table-v1 when provided.');
    }
    experience = LIGHT_TABLE_EXPERIENCE;
  }
  if (input.selectedFacets !== undefined && experience !== LIGHT_TABLE_EXPERIENCE) {
    throw badRequest('selectedFacets requires experience light-table-v1.');
  }
  const selectedFacets = experience === LIGHT_TABLE_EXPERIENCE
    ? normalizeSelectedFacets(input.selectedFacets)
    : undefined;

  if (!films.length && !creativeBrief && !selectedFacets) {
    throw badRequest(experience === LIGHT_TABLE_EXPERIENCE
      ? 'Add at least one film, describe what you are looking for, or select a Light Table facet.'
      : 'Add at least one film or describe what you are looking for.');
  }

  if (!Array.isArray(input.excludedFilms ?? [])) throw badRequest('excludedFilms must be an array.');
  const excludedFilms = (input.excludedFilms ?? []).map((film, index) => {
    if (!film || typeof film !== 'object' || Array.isArray(film)) {
      throw badRequest('Excluded film ' + (index + 1) + ' must include a title and year.');
    }
    const title = cleanText(film.title, 'Excluded film ' + (index + 1) + ' title', 160);
    const year = cleanText(film.year, 'Excluded film ' + (index + 1) + ' year', 4);
    if (!YEAR.test(year)) throw badRequest('Excluded film ' + (index + 1) + ' year is invalid.');
    return { title, year };
  });
  if (excludedFilms.length > 100) throw badRequest('AFTERIMAGE accepts at most 100 excluded films.');
  const excludedKeys = new Set(excludedFilms.map((film) => `${film.title.toLocaleLowerCase()}|${film.year}`));
  if (excludedKeys.size !== excludedFilms.length) throw badRequest('Each excluded film must be unique.');

  const validated = {
    films,
    creativeBrief,
    ...(input.likedFilms !== undefined ? { likedFilms: validateLikedFilms(input.likedFilms) } : {}),
    ...(experience ? { experience } : {}),
    ...(selectedFacets ? { selectedFacets } : {}),
    ...(excludedFilms.length ? { excludedFilms } : {}),
  };

  if (experience === LIGHT_TABLE_EXPERIENCE) {
    LIGHT_TABLE_CONTEXTS.set(films, { experience, selectedFacets });
  }
  return validated;
}

const FACET_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['label', 'explanation', 'traits'],
  properties: {
    label: { type: 'string', minLength: 1, maxLength: 80 },
    explanation: { type: 'string', minLength: 1, maxLength: 300 },
    traits: {
      type: 'array',
      minItems: 1,
      maxItems: 6,
      items: { type: 'string', minLength: 1, maxLength: 60 },
    },
  },
};

const FACET_SET_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...FACET_KEYS],
  properties: Object.fromEntries(FACET_KEYS.map((key) => [key, FACET_SCHEMA])),
};

export const AFTERIMAGE_SCHEMA_V2 = {
  type: 'object',
  additionalProperties: false,
  required: [
    'status',
    'sourceFilms',
    'persona',
    'insight',
    'palette',
    'sensibilities',
    'spiritDirector',
    'recommendations',
  ],
  properties: {
    status: { type: 'string', enum: ['complete'] },
    sourceFilms: {
      type: 'array',
      minItems: 0,
      maxItems: 20,
      items: { type: 'string', minLength: 1, maxLength: 160 },
    },
    persona: { type: 'string', minLength: 2, maxLength: 80 },
    insight: { type: 'string', minLength: 1, maxLength: 600 },
    palette: {
      type: 'array',
      minItems: 5,
      maxItems: 5,
      items: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
    },
    sensibilities: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: { type: 'string', minLength: 1, maxLength: 80 },
    },
    spiritDirector: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'reason'],
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 120 },
        reason: { type: 'string', minLength: 1, maxLength: 240 },
      },
    },
    recommendations: {
      type: 'array',
      minItems: 5,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'year', 'timecode', 'reason', 'watchFor'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 160 },
          year: { type: 'string', pattern: '^\\d{4}$' },
          timecode: { type: 'string', pattern: '^\\d{2}:\\d{2}:\\d{2}:\\d{2}$' },
          reason: { type: 'string', minLength: 1, maxLength: 600 },
          watchFor: { type: 'string', minLength: 1, maxLength: 360 },
        },
      },
    },
  },
};

export const AFTERIMAGE_LIGHT_TABLE_SCHEMA_V1 = {
  ...AFTERIMAGE_SCHEMA_V2,
  required: [...AFTERIMAGE_SCHEMA_V2.required, 'fingerprint'],
  properties: {
    ...AFTERIMAGE_SCHEMA_V2.properties,
    fingerprint: FACET_SET_SCHEMA,
    recommendations: {
      ...AFTERIMAGE_SCHEMA_V2.properties.recommendations,
      items: {
        ...AFTERIMAGE_SCHEMA_V2.properties.recommendations.items,
        required: [
          ...AFTERIMAGE_SCHEMA_V2.properties.recommendations.items.required,
          'facets',
        ],
        properties: {
          ...AFTERIMAGE_SCHEMA_V2.properties.recommendations.items.properties,
          facets: FACET_SET_SCHEMA,
        },
      },
    },
  },
};

function normalizeOutputFacet(value, label) {
  if (!isRecord(value)) throw new Error(label + ' must be an object.');
  const keys = Object.keys(value);
  if (keys.some((key) => !['label', 'explanation', 'traits'].includes(key))) {
    throw new Error(label + ' contains an unknown field.');
  }
  return {
    label: cleanGeneratedText(value.label, label + ' label', 80),
    explanation: cleanGeneratedText(value.explanation, label + ' explanation', 300),
    traits: normalizeTraits(value.traits, label, true),
  };
}

function normalizeFacetSet(value, label) {
  if (!isRecord(value)) throw new Error(label + ' must be an object.');
  const keys = Object.keys(value);
  if (keys.length !== FACET_KEYS.length || keys.some((key) => !FACET_KEY_SET.has(key))) {
    throw new Error(label + ' must contain exactly the four Light Table channels.');
  }
  return Object.fromEntries(FACET_KEYS.map((key) => [
    key,
    normalizeOutputFacet(value[key], label + ' ' + key),
  ]));
}

export function normalizeV2Result(input, sourceFilms, excludedFilms = [], options = {}) {
  if (!input || typeof input !== 'object') throw new Error('The developed reel must be an object.');
  const films = sourceFilms;
  const sourceSet = new Map(films.map((film) => [film.toLocaleLowerCase(), film]));
  const excludedSet = new Set(excludedFilms.map((film) => `${film.title.toLocaleLowerCase()}|${film.year}`));
  const likedSet = new Set((options.likedFilms ?? []).map(film => `${film.title.toLocaleLowerCase()}|${film.year}`));
  const remembered = getV2InputContext(films) || {};
  const experience = options.experience || remembered.experience;
  const selectedFacets = options.selectedFacets || remembered.selectedFacets || {};
  const lightTable = experience === LIGHT_TABLE_EXPERIENCE;
  const selectedSourceSet = new Set(Object.values(selectedFacets).map((facet) =>
    `${facet.source.title.toLocaleLowerCase()}|${facet.source.year}`));

  if (!Array.isArray(input.palette) || input.palette.length !== 5) {
    throw new Error('The reel must contain exactly five palette colors.');
  }
  const palette = input.palette.map((color, index) => cleanGeneratedText(color, 'Palette color ' + (index + 1), 7));
  if (palette.some((color) => !HEX_COLOR.test(color))) throw new Error('The palette contains an invalid hex color.');

  if (!Array.isArray(input.sensibilities) || input.sensibilities.length !== 3) {
    throw new Error('The reel must contain exactly three sensibilities.');
  }
  if (!Array.isArray(input.recommendations) || input.recommendations.length !== 5) {
    throw new Error('The reel must contain exactly five recommendations.');
  }
  if (!input.spiritDirector || typeof input.spiritDirector !== 'object') {
    throw new Error('The reel needs a spirit director.');
  }

  const recommendationTitles = new Set();
  const recommendations = input.recommendations.map((recommendation, index) => {
    if (!recommendation || typeof recommendation !== 'object') {
      throw new Error(`Recommendation ${index + 1} must be an object.`);
    }
    const title = cleanGeneratedText(recommendation.title, `Recommendation ${index + 1} title`, 160);
    const titleKey = title.toLocaleLowerCase();
    if (sourceSet.has(titleKey)) throw new Error(`${title} is already in the source reel.`);
    if (recommendationTitles.has(titleKey)) throw new Error(`${title} was recommended more than once.`);
    recommendationTitles.add(titleKey);

    const year = cleanGeneratedText(recommendation.year, `Recommendation ${index + 1} year`, 4);
    const timecode = cleanGeneratedText(recommendation.timecode, `Recommendation ${index + 1} timecode`, 11);
    if (!YEAR.test(year) || !TIMECODE.test(timecode)) {
      throw new Error(`${title} has invalid release-year or timecode formatting.`);
    }
    const exactKey = `${titleKey}|${year}`;
    if (likedSet.has(exactKey)) throw new Error(`${title} is already seen and liked.`);
    if (excludedSet.has(exactKey)) throw new Error(`${title} was marked not interested.`);
    if (lightTable && selectedSourceSet.has(exactKey)) {
      throw new Error(`${title} supplied one of the selected Light Table facets and cannot be recommended unchanged.`);
    }

    return {
      title,
      year,
      timecode,
      reason: cleanGeneratedText(recommendation.reason, 'Recommendation ' + (index + 1) + ' reason', 600),
      watchFor: cleanGeneratedText(recommendation.watchFor, 'Recommendation ' + (index + 1) + ' watch note', 360),
      ...(lightTable
        ? { facets: normalizeFacetSet(recommendation.facets, 'Recommendation ' + (index + 1) + ' facets') }
        : {}),
    };
  });

  return {
    status: 'complete',
    sourceFilms: films,
    persona: cleanGeneratedText(input.persona, 'Persona', 80),
    insight: cleanGeneratedText(input.insight, 'Insight', 600),
    palette,
    sensibilities: input.sensibilities.map((value, index) => cleanGeneratedText(value, `Sensibility ${index + 1}`, 80)),
    spiritDirector: {
      name: cleanGeneratedText(input.spiritDirector.name, 'Spirit director name', 120),
      reason: cleanGeneratedText(input.spiritDirector.reason, 'Spirit director reason', 240),
    },
    ...(lightTable ? { fingerprint: normalizeFacetSet(input.fingerprint, 'Fingerprint') } : {}),
    recommendations,
  };
}
