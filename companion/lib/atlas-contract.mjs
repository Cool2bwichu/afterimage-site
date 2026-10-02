import { AFTERIMAGE_LIGHT_TABLE_SCHEMA_V1, FACET_KEYS, validateV2Input } from './v2-contract.mjs';

const str = (maxLength) => ({ type: 'string', minLength: 1, maxLength });
const obj = (properties) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const film = {
  title: str(160), year: { ...str(4), pattern: '^\\d{4}$' },
  summary: str(300), watchFor: str(260),
  facets: AFTERIMAGE_LIGHT_TABLE_SCHEMA_V1.properties.fingerprint,
};
const lens = obj({ affinity: { type: 'string', enum: ['close', 'echo', 'contrast'] }, evidence: str(200) });
export const ATLAS_SCHEMA = obj({
  kind: { type: 'string', enum: ['atlas-v1'] },
  thesis: str(240),
  anchor: obj(film),
  neighbors: { type: 'array', minItems: 6, maxItems: 6, items: obj({
    ...film, label: str(48), shared: str(320), difference: str(280), whyHere: str(300),
    lenses: obj(Object.fromEntries(FACET_KEYS.map(key => [key, lens]))),
  }) },
});
export const ATLAS_CANDIDATE_SCHEMA = { ...ATLAS_SCHEMA, properties: { ...ATLAS_SCHEMA.properties, neighbors: { ...ATLAS_SCHEMA.properties.neighbors, minItems: 8, maxItems: 8 } } };

export function atlasKey(film) {
  return film.title.normalize('NFKD').replace(/\p{Mark}/gu, '').toLowerCase().replace(/&/g, ' and ').replace(/[^\p{Letter}\p{Number}]+/gu, ' ').trim() + '|' + film.year;
}

export function validateAtlasInput(raw) {
  const fail = () => { throw Object.assign(new Error('An Atlas needs a film title, release year, and current request.'), { code: 'BAD_REQUEST' }); };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !['anchor', 'request'].includes(key))) fail();
  if (!raw.anchor || Object.keys(raw.anchor).some(key => !['title', 'year', 'tmdbId'].includes(key)) || typeof raw.anchor.title !== 'string' || !raw.anchor.title.trim() || raw.anchor.title.length > 160 || typeof raw.anchor.year !== 'string' || !/^\d{4}$/.test(raw.anchor.year) || (raw.anchor.tmdbId !== undefined && (!Number.isSafeInteger(raw.anchor.tmdbId) || raw.anchor.tmdbId <= 0))) fail();
  if (!raw.request || typeof raw.request !== 'object' || Array.isArray(raw.request)) fail();
  return { anchor: { title: raw.anchor.title.trim(), year: raw.anchor.year, ...(raw.anchor.tmdbId !== undefined ? { tmdbId: raw.anchor.tmdbId } : {}) }, request: validateV2Input(raw.request) };
}

function check(value, schema, path = 'Atlas') {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !schema.properties[key])) throw new Error(`${path} is invalid.`);
    for (const key of schema.required) check(value[key], schema.properties[key], `${path}.${key}`);
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length < schema.minItems || value.length > schema.maxItems) throw new Error(`${path} is incomplete.`);
    value.forEach((item, index) => check(item, schema.items, `${path}[${index}]`));
  } else if (typeof value !== 'string' || !value.trim() || (schema.maxLength && value.length > schema.maxLength) || (schema.enum && !schema.enum.includes(value)) || (schema.pattern && !new RegExp(schema.pattern).test(value))) throw new Error(`${path} is invalid.`);
}

export function normalizeAtlasResult(value, input, candidatePool = false) {
  check(value, candidatePool ? ATLAS_CANDIDATE_SCHEMA : ATLAS_SCHEMA);
  if (atlasKey(value.anchor) !== atlasKey(input.anchor)) throw new Error('Atlas anchor changed.');
  const prohibited = [input.anchor, ...(input.request.excludedFilms || []), ...(input.request.likedFilms || []), ...Object.values(input.request.selectedFacets || {}).map(facet => facet.source)];
  const seen = new Set(prohibited.map(atlasKey));
  const sources = new Set(input.request.films.map(title => title.toLowerCase().replace(/\s*\(\d{4}\)$/, '').trim()));
  for (const neighbor of value.neighbors) {
    const key = atlasKey(neighbor);
    if (seen.has(key) || sources.has(neighbor.title.toLowerCase())) throw new Error('Atlas contains a duplicate, source, seen, or excluded film.');
    seen.add(key);
  }
  return value;
}

export async function verifyAtlas(value, metadataProvider, input) {
  const films = [value.anchor, ...value.neighbors];
  const identities = films.map(({ title, year }, index) => ({ title, year, ...(index === 0 && input?.anchor?.tmdbId ? { tmdbId: input.anchor.tmdbId } : {}) }));
  let metadata;
  // Retry metadata once without paying for another generated map. The provider
  // caches matched records, so a retry only repeats unresolved catalogue work.
  try { metadata = await metadataProvider(identities); }
  catch { metadata = await metadataProvider(identities); }
  if (metadata.some(record => record?.status === 'unavailable')) metadata = await metadataProvider(identities);
  const ids = new Set();
  const verified = [];
  let verifiedAnchor;
  for (let index = 0; index < films.length; index++) {
    const record = metadata[index];
    if (!record || record.status !== 'matched') {
      if (index === 0) throw new Error('Atlas anchor identity could not be verified.');
      continue;
    }
    if (atlasKey({ title: record.requestedTitle, year: record.requestedYear }) !== atlasKey(films[index])) throw new Error('Atlas metadata identity mismatch.');
    if (index === 0 && input?.anchor?.tmdbId && record.tmdbId !== input.anchor.tmdbId) throw new Error('Atlas anchor catalog identity mismatch.');
    const id = record.tmdbId ? `tmdb:${record.tmdbId}` : record.imdbId ? `imdb:${record.imdbId}` : null;
    if (!id) throw new Error('Atlas has an ambiguous film identity.');
    if (ids.has(id)) continue;
    ids.add(id);
    const film = { ...films[index], ...(Number.isSafeInteger(record.tmdbId) && record.tmdbId > 0 ? { tmdbId: record.tmdbId } : {}) };
    if (index === 0) verifiedAnchor = film;
    else verified.push(film);
  }
  if (verified.length < 6) throw new Error('Not enough Atlas film identities could be verified.');
  return { ...value, anchor: verifiedAnchor, neighbors: verified.slice(0, 6) };
}
