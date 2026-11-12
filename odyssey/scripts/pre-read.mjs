// Reads every star of the chart ahead of time, through a running companion, and
// keeps what the Navigator said beside the chart. A visitor then hears Claude at
// every star, with or without a Navigator of their own (src/nav/readings.mjs).
//
//   node scripts/pre-read.mjs [--companion <url>] [--limit <n>] [--at-once <n>]
//       reads the stars not read yet, best-known first
//   node scripts/pre-read.mjs pack [--shards <n>]
//       writes what has been read into public/data/readings/, for the site and the claude.ai edition
//
// The companion is the server that carries the Navigator (companion/, `npm run companion`
// at the root, port 8788). Give its address with --companion or ODYSSEY_COMPANION_URL, and
// its passphrase (AFTERIMAGE_SITE_PASSPHRASE) in ODYSSEY_COMPANION_PASSPHRASE. The companion
// writes every prompt itself, exactly as it does for a browser, and each reading uses the
// Claude plan behind it. A star the companion has already read for someone is answered from
// its own memory and costs nothing.
//
// What comes back is kept in .cache/readings/arrivals.jsonl as it arrives, one star a line,
// so a run that stops (a usage limit, a closed laptop, Ctrl-C) carries on where it left off.
// Nothing in .cache is committed; `pack` writes the files that are.
import { appendFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LIGHT_IDS } from '../src/engine/lights.mjs';
import { READINGS_KIND, READINGS_VERSION, shardOf } from '../src/nav/readings.mjs';

const here = import.meta.dirname;
const root = join(here, '..');
const LEDGER = join(root, '.cache', 'readings', 'arrivals.jsonl');
const OUT = join(root, 'public', 'data', 'readings');
const SHARDS = 64;
const DEADLINE = 6 * 60 * 1000;   // one reading, start to finish
const BUSY_PAUSE = 45 * 1000;     // when the companion has no room for another request
const TRIES = 3;                  // for a reading that did not come through

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const line = (value, max) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * A reading as it may be kept: rays under the six lights only, one each, to films of this chart,
 * and every text within bounds. Null when nothing of it holds.
 * @param {unknown} raw
 * @param {Set<string>} slugs  the chart's films
 */
export function cleanReading(raw, slugs) {
  if (!isRecord(raw)) return null;
  const rays = [];
  for (const ray of Array.isArray(raw.rays) ? raw.rays.slice(0, 12) : []) {
    if (!isRecord(ray) || !LIGHT_IDS.includes(ray.light) || typeof ray.slug !== 'string' || !slugs.has(ray.slug)) continue;
    if (rays.some(kept => kept.light === ray.light)) continue;
    const claim = line(ray.claim, 460);
    if (claim) rays.push({ light: ray.light, slug: ray.slug, claim, watch: line(ray.watch, 260) });
  }
  let beyond = null;
  if (isRecord(raw.beyond)) {
    const title = line(raw.beyond.title, 140);
    const why = line(raw.beyond.why, 360);
    const year = Math.round(Number(raw.beyond.year));
    if (title && why && year >= 1888 && year <= 2100) beyond = { title, year, why };
  }
  const essence = line(raw.essence, 360);
  return essence || rays.length ? { essence, beyond, rays } : null;
}

/** The ledger, folded: the last reading of each star stands. */
export async function readLedger(file = LEDGER) {
  let text = '';
  try { text = await readFile(file, 'utf8'); } catch { return new Map(); }
  const kept = new Map();
  for (const entry of text.split('\n')) {
    if (!entry.trim()) continue;
    try {
      const record = JSON.parse(entry);
      if (isRecord(record) && typeof record.slug === 'string') { kept.delete(record.slug); kept.set(record.slug, record); }
    } catch { /* a line cut short by a stop: what came before it stands */ }
  }
  return kept;
}

/**
 * The files `pack` writes, by name: the shards and their index.
 * @param {Map<string, object>} kept   slug → a ledger record
 * @param {{ films: object[], shards?: number, made?: string }} options
 */
export function packReadings(kept, { films, shards = SHARDS, made = new Date().toISOString().slice(0, 10) }) {
  const slugs = new Set(films.map(film => film.s));
  const buckets = Array.from({ length: shards }, () => []);
  const voices = new Map();
  for (const film of films) { // in the chart's order, so the files come out the same from the same readings
    const record = kept.get(film.s);
    const reading = record ? cleanReading(record, slugs) : null;
    if (!reading) continue;
    buckets[shardOf(film.s, shards)].push([film.s, reading]);
    const by = line(record.by, 40);
    if (by) voices.set(by, (voices.get(by) || 0) + 1);
  }
  const width = String(shards - 1).length;
  const files = {};
  const names = buckets.map((bucket, n) => {
    if (!bucket.length) return null;
    const name = `${String(n).padStart(Math.max(2, width), '0')}.json`;
    files[name] = `${JSON.stringify(Object.fromEntries(bucket))}\n`;
    return name;
  });
  const count = buckets.reduce((sum, bucket) => sum + bucket.length, 0);
  const by = [...voices].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  files['index.json'] = `${JSON.stringify({ kind: READINGS_KIND, v: READINGS_VERSION, films: films.length, count, by, made: count ? made : '', shards, files: names })}\n`;
  return { files, count };
}

// ── Talking to the companion, the way a browser does.
function companion(url, passphrase) {
  const base = String(url).replace(/\/+$/, '');
  const stop = (message, code) => Object.assign(new Error(message), { code });
  async function request(path, init = {}) {
    let response;
    try {
      response = await fetch(`${base}${path}`, {
        ...init,
        headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(passphrase ? { Authorization: `Bearer ${passphrase}` } : {}) },
        signal: AbortSignal.timeout(60000),
      });
    } catch {
      throw stop(`The companion at ${base} cannot be reached.`, 'unreachable');
    }
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    if (response.ok) return isRecord(body) ? body : {};
    const code = body && body.code;
    if (response.status === 401 || code === 'PASSPHRASE_REQUIRED') throw stop('The companion did not accept the passphrase. Set ODYSSEY_COMPANION_PASSPHRASE.', 'fatal');
    if (code === 'PASSPHRASE_THROTTLED') throw stop('Too many wrong passphrases were tried. Wait a few minutes.', 'fatal');
    if (code === 'ODYSSEY_NOT_CONFIGURED' || code === 'SITE_API_DISABLED') throw stop('That companion does not carry the Odyssey, or does not accept connections with a passphrase.', 'fatal');
    if (code === 'CLAUDE_NOT_CONNECTED') throw stop('The companion is running, but Claude is not connected to it.', 'fatal');
    if (code === 'UNKNOWN_STAR') throw stop('The companion does not know this star.', 'skip');
    if (response.status === 429 || code === 'CLAUDE_UNAVAILABLE') throw stop('The companion is busy.', 'busy');
    throw stop(line(body && body.error, 240) || `The companion answered ${response.status}.`, 'retry');
  }

  /** One star read, start to finish. Resolves the companion's arrival. */
  async function arrival(slug) {
    const started = await request('/api/odyssey/jobs', { method: 'POST', body: JSON.stringify({ op: 'arrival', input: { star: slug } }) });
    if (started.result) return { result: started.result, remembered: true };
    if (typeof started.jobId !== 'string') throw stop('The companion did not start the reading.', 'retry');
    const until = Date.now() + DEADLINE;
    let pause = 1500;
    while (Date.now() < until) {
      await wait(pause);
      pause = Math.min(4000, pause + 500);
      let job;
      try { job = await request(`/api/odyssey/jobs/${encodeURIComponent(started.jobId)}`); } catch (error) {
        if (error.code === 'unreachable') continue; // one dropped look is not a lost answer
        throw error;
      }
      if (job.status === 'done') return { result: isRecord(job.result) ? job.result : {}, remembered: false };
      if (job.status === 'failed') {
        if (job.code === 'CLAUDE_USAGE_LIMIT') throw stop('The Claude plan behind the companion has reached its usage limit. Run this again later: it carries on where it stopped.', 'fatal');
        if (['AUTH_REQUIRED', 'CLAUDE_CODE_MISSING', 'CLAUDE_PLAN_UNAVAILABLE', 'CLAUDE_MODEL_UNAVAILABLE'].includes(job.code)) throw stop(line(job.error, 240) || 'Claude is not connected to the companion.', 'fatal');
        if (job.code === 'CLAUDE_UNAVAILABLE') throw stop('Claude is busy.', 'busy');
        throw stop(line(job.error, 240) || 'The reading did not come through.', 'retry');
      }
    }
    throw stop('The reading took too long.', 'retry');
  }

  return { status: () => request('/api/odyssey/status'), arrival };
}

const arg = name => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : undefined; };
const clock = ms => {
  const minutes = Math.round(ms / 60000);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
};

async function read(films) {
  const url = arg('--companion') || process.env.ODYSSEY_COMPANION_URL || 'http://localhost:8788';
  const passphrase = process.env.ODYSSEY_COMPANION_PASSPHRASE || process.env.AFTERIMAGE_SITE_PASSPHRASE || '';
  const limit = Number(arg('--limit')) || Infinity;
  const atOnce = Math.min(4, Math.max(1, Number(arg('--at-once')) || 2));
  const slugs = new Set(films.map(film => film.s));
  const link = companion(url, passphrase);

  const status = await link.status();
  if (!status.connected) throw new Error('The companion is running, but Claude is not connected to it.');
  if (Number.isInteger(status.films) && status.films !== films.length) {
    throw new Error(`The companion holds a different edition of the chart (${status.films} films; this one has ${films.length}). Run the companion from this checkout.`);
  }
  const by = line(status.modelName, 40);

  const kept = await readLedger();
  // Best-known first, so a partial run covers the stars visitors reach most.
  const queue = films.filter(film => !kept.has(film.s)).sort((a, b) => (b.rn ?? 0) - (a.rn ?? 0)).slice(0, limit);
  console.log(`${kept.size} of ${films.length} stars already read. Reading ${queue.length} through ${url}${by ? ` (${by})` : ''}, ${atOnce} at once.`);
  if (!queue.length) return;
  await mkdir(join(root, '.cache', 'readings'), { recursive: true });

  let stopping = false;
  let fatal = null;
  process.once('SIGINT', () => { stopping = true; console.log('\nStopping after the readings under way. Run again to carry on.'); process.once('SIGINT', () => process.exit(130)); });
  const startedAt = Date.now();
  let done = 0;
  let fresh = 0;
  let skipped = 0;

  async function worker() {
    while (!stopping && !fatal && queue.length) {
      const film = queue.shift();
      let busy = 0;
      for (let attempt = 1; ; attempt += 1) {
        try {
          const { result, remembered } = await link.arrival(film.s);
          const reading = cleanReading(result, slugs);
          if (!reading) throw Object.assign(new Error('The reading came back empty.'), { code: 'retry' });
          await appendFile(LEDGER, `${JSON.stringify({ slug: film.s, ...reading, by, at: new Date().toISOString() })}\n`);
          done += 1;
          if (!remembered) fresh += 1;
          const each = fresh ? (Date.now() - startedAt) / fresh : 0;
          const left = each ? ` · about ${clock((queue.length * each) / atOnce)} left` : '';
          console.log(`[${kept.size + done}/${films.length}] ${film.t} (${film.y})${remembered ? ' · already read by the companion' : ''}${left}`);
          break;
        } catch (error) {
          if (error.code === 'fatal') { fatal = error; return; }
          if (error.code === 'busy') {
            // Busy for a quarter of an hour is not busy: something is wrong, and it is better said.
            if ((busy += 1) > 20) { fatal = Object.assign(new Error('The companion has stayed busy for a long while. Try again later.'), { code: 'fatal' }); return; }
            attempt -= 1;
            await wait(BUSY_PAUSE);
            continue;
          }
          if (error.code === 'unreachable' && attempt >= TRIES) { fatal = error; return; }
          if (error.code === 'skip' || attempt >= TRIES) {
            skipped += 1;
            console.log(`  ${film.t} (${film.y}) skipped: ${error.message}`);
            break;
          }
          await wait(5000 * attempt);
        }
      }
    }
  }
  await Promise.all(Array.from({ length: atOnce }, worker));
  console.log(`Read ${done} (${fresh} newly written)${skipped ? `, skipped ${skipped}` : ''}. ${kept.size + done} of ${films.length} stars are read. Run \`node scripts/pre-read.mjs pack\` to write them beside the chart.`);
  if (fatal) throw fatal;
}

async function pack(films) {
  const shards = Math.min(4096, Math.max(1, Number(arg('--shards')) || SHARDS));
  const { files, count } = packReadings(await readLedger(), { films, shards });
  await mkdir(OUT, { recursive: true });
  // Only files this script writes are taken away.
  for (const name of await readdir(OUT)) if (/^(?:\d{2,4}|index)\.json$/.test(name)) await rm(join(OUT, name));
  for (const [name, text] of Object.entries(files)) await writeFile(join(OUT, name), text);
  console.log(`Packed ${count} of ${films.length} readings into ${Object.keys(files).length - 1} shards in public/data/readings/.`);
}

async function main() {
  const bundle = JSON.parse(await readFile(join(root, 'public', 'data', 'universe.json'), 'utf8'));
  const films = bundle.films;
  if (process.argv[2] === 'pack') await pack(films);
  else await read(films);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => { console.error(error.message || error); process.exit(1); });
}
