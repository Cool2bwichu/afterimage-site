// Fetches each charted film's poster once, slowly, into .cache/posters, for the
// thumbnail sheets of the claude.ai edition (scripts/build-artifact.mjs). That
// edition cannot show images from other hosts, so it carries small thumbnails
// of its own; the site proper shows each poster from where the chart found it.
//
// The posters are not this project's to keep: .cache is never committed.
//
//   node scripts/fetch-posters.mjs [--limit N]
//
// It asks for one image at a time, waits between them, and waits as long as it
// is told to when the host says it is being asked too fast. It can be stopped
// and started again: what is already there is not fetched twice.
import { execFile } from 'node:child_process';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const here = import.meta.dirname;
const cache = join(here, '..', '.cache', 'posters');
const AGENT = 'film-chart-thumbnail-build/1.0 (one image at a time; a one-off build of small thumbnails)';
const PAUSE = 260;      // milliseconds between images
const TRIES = 3;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const arg = name => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : null; };

/** The address a thumbnail is built from: a modest width where the host offers one. */
export function sourceOf(film) {
  if (!film.p) return '';
  const path = film.p.replace(/\/(\d+)px-([^/]+)$/, (whole, width, name) => (Number(width) > 250 ? `/250px-${name}` : whole));
  return `https://upload.wikimedia.org/wikipedia/${path}`;
}

export const fileOf = film => join(cache, `${film.s}.img`);

async function exists(file) { try { return (await stat(file)).size > 0; } catch { return false; } }

async function fetchOne(url, file) {
  const part = `${file}.part`;
  for (let attempt = 0; attempt < TRIES; attempt += 1) {
    let out = '';
    try {
      ({ stdout: out } = await run('curl', ['-sS', '-L', '--max-time', '40', '-A', AGENT, '-o', part, '-w', '%{http_code} %{content_type} %header{retry-after}', url]));
    } catch (error) {
      out = `000 ${String(error.message).slice(0, 80)}`;
    }
    const [status, type = '', retry = ''] = out.trim().split(' ');
    if (status === '200' && type.startsWith('image/')) { await rename(part, file); return 'ok'; }
    await unlink(part).catch(() => {});
    if (status === '404' || status === '400') return 'gone';
    // Asked too fast, or the line dropped: wait as long as the host asks, and a little more each time.
    await wait((Number(retry) || 6) * 1000 * (1 + attempt * 0.5) + Math.random() * 800);
  }
  return 'refused';
}

async function main() {
  const bundle = JSON.parse(await readFile(join(here, '..', 'public', 'data', 'universe.json'), 'utf8'));
  const limit = Number(arg('--limit')) || Infinity;
  await mkdir(cache, { recursive: true });
  // The best-known films first: if the fetch is cut short, the faces most often met are already there.
  const wanted = bundle.films.filter(film => film.p).sort((a, b) => (b.rn ?? 0) - (a.rn ?? 0));
  const tally = { ok: 0, had: 0, gone: 0, refused: 0 };
  const missing = [];
  let asked = 0;
  for (const film of wanted) {
    const file = fileOf(film);
    if (await exists(file)) { tally.had += 1; continue; }
    if (asked >= limit) break;
    asked += 1;
    const result = await fetchOne(sourceOf(film), file);
    tally[result] += 1;
    if (result !== 'ok') missing.push(film.s);
    if (asked % 50 === 0) console.log(`${asked} asked: ${JSON.stringify(tally)}`);
    await wait(PAUSE);
  }
  await writeFile(join(cache, '..', 'posters-missing.json'), `${JSON.stringify(missing, null, 1)}\n`);
  console.log(`done: ${JSON.stringify(tally)} of ${wanted.length} with a poster on the chart`);
}

if (process.argv[1] === import.meta.filename) main().catch(error => { console.error(error); process.exit(1); });
