// Readings written ahead of time. Before anyone arrives, the Navigator can read
// every star of the chart once (scripts/pre-read.mjs), and what it said is kept
// beside the chart as small files. A visitor then hears Claude at every star,
// whether or not a Navigator is connected, and each reading costs nothing to
// show. A voyager's own Navigator can still read the star afresh.
//
// The files: an index, and the readings split into shards by a hash of the
// film's slug, so a visit fetches only the shard its star is in.
//
//   readings/index.json   { kind, v, films, count, by, made, shards, files: ["00.json", …] }
//   readings/00.json      { "<slug>": { essence, beyond, rays: [{ light, slug, claim, watch }] }, … }
//
// A shard with no readings is named null in the index and has no file. The
// files are only ever data: the pilot checks every reading as it would one
// just written, and drops what does not hold.

export const READINGS_KIND = 'afterimage-odyssey-readings';
export const READINGS_VERSION = 1;

/** Which shard holds a slug's reading: FNV-1a over its characters, modulo the number of shards. */
export function shardOf(slug, shards) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < slug.length; i += 1) {
    hash ^= slug.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % shards;
}

/** The index as it may be trusted: null when it is missing, of another kind, or not in this form. */
export function readIndex(raw) {
  if (!raw || typeof raw !== 'object' || raw.kind !== READINGS_KIND || raw.v !== READINGS_VERSION) return null;
  const shards = raw.shards;
  if (!Number.isInteger(shards) || shards < 1 || shards > 4096 || !Array.isArray(raw.files) || raw.files.length !== shards) return null;
  const files = raw.files.map(file => (typeof file === 'string' && /^[A-Za-z0-9._-]{1,120}$/.test(file) ? file : null));
  return {
    shards, files,
    count: Number.isInteger(raw.count) && raw.count > 0 ? raw.count : 0,
    films: Number.isInteger(raw.films) && raw.films > 0 ? raw.films : 0,
    by: typeof raw.by === 'string' ? raw.by.replace(/\s+/g, ' ').trim().slice(0, 40) : '',
    made: typeof raw.made === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.made) ? raw.made : '',
  };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

/**
 * @param {object} options
 * @param {string} options.url  the index; shard files are found beside it
 * @param {(url: string) => Promise<unknown>} [options.load]
 */
export function createReadings({ url, load = fetchJson }) {
  const base = typeof window !== 'undefined' && window.location ? new URL(url, window.location.href) : new URL(url, 'http://localhost/');
  let index = null;   // the promise of the index, asked once
  let known = null;   // the index once it has come, for what can be said without waiting
  const shards = new Map(); // shard → promise of its readings

  const open = () => {
    index ??= Promise.resolve().then(() => load(base.href)).then(raw => { known = readIndex(raw); return known; }, () => null);
    return index;
  };

  function shard(at, n) {
    if (!shards.has(n)) {
      const file = at.files[n];
      const pending = file
        ? Promise.resolve().then(() => load(new URL(file, base).href)).then(raw => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}), () => {
          shards.delete(n); // a shard that did not come is asked for again on a later visit
          return {};
        })
        : Promise.resolve({});
      shards.set(n, pending);
    }
    return shards.get(n);
  }

  return {
    /** What was read for a slug, as written; null when nothing was. Never rejects. */
    async get(slug) {
      if (typeof slug !== 'string' || !slug) return null;
      const at = await open();
      if (!at) return null;
      const held = await shard(at, shardOf(slug, at.shards));
      return Object.hasOwn(held, slug) && held[slug] && typeof held[slug] === 'object' ? held[slug] : null;
    },
    /** The index, once it is here: { count, films, by, made }, or null. */
    get about() { return known && known.count ? { count: known.count, films: known.films, by: known.by, made: known.made } : null; },
    open,
  };
}
