const YEAR = /^\d{4}$/;
const IMDB_ID = /^tt\d{5,12}$/;

function fail(message) {
  const error = new Error(message);
  error.code = 'V3_METADATA_FAILED';
  return error;
}

function cleanString(value, label, maximum, { optional = false } = {}) {
  if (value === null || value === undefined) {
    if (optional) return null;
    throw fail(`Malformed metadata response: ${label} is missing.`);
  }
  if (typeof value !== 'string' || (!optional && !value.trim())) {
    throw fail(`Malformed metadata response: ${label} is invalid.`);
  }
  const cleaned = value.trim();
  if (cleaned.length > maximum) throw fail(`Malformed metadata response: ${label} is too long.`);
  return cleaned || null;
}

function cleanStringArray(value, label, maximumItems = 20) {
  if (!Array.isArray(value) || value.length > maximumItems) {
    throw fail(`Malformed metadata response: ${label} is invalid.`);
  }
  return value.map((item, index) => cleanString(item, `${label}[${index}]`, 160));
}

function cleanRequest(item, index) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw fail(`Metadata request ${index + 1} is invalid.`);
  }
  const title = cleanString(item.title, `request ${index + 1} title`, 160);
  const year = cleanString(item.year, `request ${index + 1} year`, 4);
  if (!YEAR.test(year)) throw fail(`Metadata request ${index + 1} year is invalid.`);
  if (item.tmdbId !== undefined && (!Number.isSafeInteger(item.tmdbId) || item.tmdbId <= 0)) throw fail(`Metadata request ${index + 1} catalog ID is invalid.`);
  return { title, year, ...(item.tmdbId !== undefined ? { tmdbId: item.tmdbId } : {}) };
}

function identityKey(title, year) {
  return `${title.normalize('NFKC').toLocaleLowerCase('en-US')}|${year}`;
}
function requestKey(item) {
  return `${identityKey(item.title, item.year)}|${item.tmdbId ?? 'search'}`;
}

function projectResult(raw, requested, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw fail(`Malformed metadata response: film ${index + 1} is invalid.`);
  }
  if (!['matched', 'unmatched', 'unavailable'].includes(raw.status)) {
    throw fail(`Malformed metadata response: film ${index + 1} has an invalid status.`);
  }
  if (typeof raw.title !== 'string' || typeof raw.year !== 'string' || identityKey(raw.title,raw.year) !== identityKey(requested.title,requested.year)) throw fail('Metadata identity mismatch.');
  if (raw.status !== 'matched') {
    return {
      requestedTitle: requested.title,
      requestedYear: requested.year,
      status: raw.status,
    };
  }

  const title = cleanString(raw.title, `film ${index + 1} title`, 160);
  const year = cleanString(raw.year, `film ${index + 1} year`, 4);
  if (identityKey(title, year) !== identityKey(requested.title, requested.year)) {
    throw fail(`Metadata identity mismatch for ${requested.title} (${requested.year}).`);
  }
  if (raw.tmdbId != null && typeof raw.tmdbId !== 'number') throw fail('Malformed canonical identity.');
  if (raw.tmdbRating != null && typeof raw.tmdbRating !== 'number') throw fail('Malformed rating.');
  if (raw.runtime != null && typeof raw.runtime !== 'number') throw fail('Malformed runtime.');
  const tmdbId = raw.tmdbId === null || raw.tmdbId === undefined ? null : Number(raw.tmdbId);
  const imdbId = raw.imdbId === null || raw.imdbId === undefined
    ? null
    : cleanString(raw.imdbId, `film ${index + 1} IMDb ID`, 16);
  if ((tmdbId !== null && (!Number.isSafeInteger(tmdbId) || tmdbId <= 0)) ||
      (imdbId !== null && !IMDB_ID.test(imdbId))) {
    throw fail(`Malformed metadata response: film ${index + 1} has an invalid canonical identity.`);
  }
  if (requested.tmdbId !== undefined && tmdbId !== requested.tmdbId) throw fail('Metadata catalog identity mismatch.');
  if (tmdbId === null && imdbId === null) {
    throw fail(`Matched film ${title} has no canonical identity.`);
  }

  const tmdbRating = raw.tmdbRating === null || raw.tmdbRating === undefined
    ? null
    : Number(raw.tmdbRating);
  if (tmdbRating !== null && (!Number.isFinite(tmdbRating) || tmdbRating < 0 || tmdbRating > 10)) {
    throw fail(`Malformed metadata response: film ${index + 1} has an invalid rating.`);
  }
  const runtime = raw.runtime === null || raw.runtime === undefined ? null : Number(raw.runtime);
  if (runtime !== null && (!Number.isSafeInteger(runtime) || runtime <= 0 || runtime > 2000)) {
    throw fail(`Malformed metadata response: film ${index + 1} has an invalid runtime.`);
  }
  const releaseDate = cleanString(raw.releaseDate, `film ${index + 1} release date`, 10, { optional: true });
  if (releaseDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) {
    throw fail(`Malformed metadata response: film ${index + 1} has an invalid release date.`);
  }

  return {
    requestedTitle: requested.title,
    requestedYear: requested.year,
    status: 'matched',
    title,
    year,
    tmdbId,
    imdbId,
    tmdbRating,
    posterUrl: cleanString(raw.posterUrl, `film ${index + 1} poster URL`, 1000, { optional: true }),
    overview: cleanString(raw.overview, `film ${index + 1} overview`, 2000, { optional: true }),
    runtime,
    releaseDate,
    genres: cleanStringArray(raw.genres, `film ${index + 1} genres`),
    countries: cleanStringArray(raw.countries, `film ${index + 1} countries`),
    directors: cleanStringArray(raw.directors, `film ${index + 1} directors`),
  };
}

export function createFilmMetadataProvider({
  url,
  fetchImpl = globalThis.fetch,
  timeoutMs = 8000,
  batchSize = 5,
  concurrency = 2,
  maxResponseBytes = 256 * 1024,
  cache = new Map(),
  cacheTtlMs = 6 * 60 * 60 * 1000,
  maxCacheEntries = 512,
} = {}) {
  let endpoint;
  try { endpoint = new URL(url); } catch { throw fail('AFTERIMAGE_FILM_METADATA_URL must be a valid HTTPS URL.'); }
  // Plain HTTP is accepted only for a site running on this machine during development.
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && loopback)) {
    throw fail('AFTERIMAGE_FILM_METADATA_URL must use HTTPS (HTTP only for a local development site).');
  }
  if (endpoint.username || endpoint.password) throw fail('Metadata URL must not include credentials.');
  if (!Number.isInteger(maxResponseBytes) || maxResponseBytes < 1024 || maxResponseBytes > 1024 * 1024) throw fail('Invalid metadata response size limit.');
  if (!Number.isInteger(maxCacheEntries) || maxCacheEntries < 1 || maxCacheEntries > 5000) throw fail('Invalid metadata cache limit.');
  if (!Number.isFinite(cacheTtlMs) || cacheTtlMs < 1) throw fail('Invalid metadata cache duration.');
  if (typeof fetchImpl !== 'function') throw fail('A metadata fetch implementation is required.');
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 5) throw fail('Metadata batch size must be between 1 and 5.');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw fail('Metadata concurrency must be between 1 and 4.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) throw fail('Metadata timeout is out of bounds.');

  async function fetchBatch(batch, signal) {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
    let response;
    try {
      response = await fetchImpl(endpoint.href, {
        method: 'POST',
        redirect: 'error',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ films: batch }),
        signal: combinedSignal,
      });
    } catch {
      if (combinedSignal.aborted) throw combinedSignal.reason;
      throw fail('Film metadata service is unavailable.');
    }
    if (!response?.ok) throw fail('Film metadata service is unavailable.');
    if (Number(response.headers.get('content-length')) > maxResponseBytes) throw fail('Film metadata response is too large.');
    const reader = response.body?.getReader();
    if (!reader) throw fail('Film metadata response has no body.');
    const chunks=[]; let size=0;
    for (;;) {
      const {done,value}=await reader.read(); if(done) break;
      size+=value.byteLength;
      if(size>maxResponseBytes){await reader.cancel();throw fail('Film metadata response is too large.');}
      chunks.push(Buffer.from(value));
    }
    const text = Buffer.concat(chunks).toString('utf8');
    let payload;
    try { payload = JSON.parse(text); } catch { throw fail('Malformed metadata response.'); }
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.films) ||
        payload.films.length !== batch.length) {
      throw fail('Malformed metadata response.');
    }
    return payload.films.map((raw, index) => ({ request: batch[index], result: projectResult(raw, batch[index], index) }));
  }

  return async function provideFilmMetadata(items, { signal } = {}) {
    if (!Array.isArray(items) || items.length > 200) throw fail('Metadata request must contain at most 200 films.');
    signal?.throwIfAborted();
    const requests = items.map(cleanRequest);
    for(const [key,entry] of cache) if(!entry.expiresAt || entry.expiresAt <= Date.now()) cache.delete(key);
    const returned = new Map(requests.flatMap(item => {const key=requestKey(item);const value=cache.get(key)?.value;return value ? [[key,structuredClone(value)]] : [];}));
    const seen = new Set();
    for (const item of requests) {
      const key = requestKey(item);
      if (seen.has(key)) throw fail('Metadata request contains a duplicate film identity.');
      seen.add(key);
    }

    const missing = requests.filter((item) => !cache.has(requestKey(item)));
    const batches = [];
    for (let index = 0; index < missing.length; index += batchSize) {
      batches.push(missing.slice(index, index + batchSize));
    }
    let next = 0;
    const workers = Array.from({ length: Math.min(concurrency, batches.length) }, async () => {
      while (next < batches.length) {
        const batch = batches[next++];
        const results = await fetchBatch(batch, signal);
        for (const { request, result } of results) {
          const key=requestKey(request);
          returned.set(key,result);
          if(result.status === 'matched') {
            cache.set(key,{value:result,expiresAt:Date.now()+cacheTtlMs});
            while(cache.size>maxCacheEntries) cache.delete(cache.keys().next().value);
          }
        }
      }
    });
    await Promise.all(workers);
    signal?.throwIfAborted();
    return requests.map((item) => structuredClone(returned.get(requestKey(item)) || cache.get(requestKey(item))?.value));
  };
}
