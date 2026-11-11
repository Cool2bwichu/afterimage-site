// Builds the claude.ai edition of the Odyssey into dist-artifact/.
//
//   node scripts/build-artifact.mjs [--no-posters]
//
// That edition is one page with its files beside it. Claude answers from inside
// the page (the Navigator needs no companion there), and a page there cannot
// show images from other hosts, so the film posters travel with it as sheets of
// small thumbnails made from .cache/posters (see scripts/fetch-posters.mjs).
//
// What comes out:
//   index.html      the page, written the way an Artifact is: content only
//   app.<hash>.js   the whole programme
//   data/           the chart and the deeper notes
//   posters/        sheets of thumbnails in two sizes, and their index
//   files.json      what to publish, in batches that fit one publish each
//
// Every file but the page is named for its contents, so a page always meets the
// files it was built with, however long a browser has kept the old ones.
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'vite';
import sharp from 'sharp';
import { openUniverse } from '../src/engine/universe.mjs';
import { fileOf } from './fetch-posters.mjs';

const here = import.meta.dirname;
const root = join(here, '..');
const out = join(root, 'dist-artifact');
const TITLE = 'The AFTERIMAGE Odyssey';
// One publish carries at most this much; a larger build goes up in several.
const BATCH_FILES = 240;
const BATCH_BYTES = 56 * 1024 * 1024;
// Thumbnails keep the shape of the poster plate (64 × 95).
const TIERS = {
  small: { width: 128, height: 190, columns: 5, rows: 5, quality: 76 }, // a face in the sky, a row in a list
  large: { width: 248, height: 368, columns: 4, rows: 4, quality: 80 }, // the dossier
};
const BACKGROUND = { r: 11, g: 15, b: 22 };

const hashOf = data => createHash('sha256').update(data).digest('hex').slice(0, 10);
const exists = async file => { try { return (await stat(file)).size > 0; } catch { return false; } };

async function emit(folder, stem, extension, data) {
  const name = `${folder ? `${folder}/` : ''}${stem}.${hashOf(data)}.${extension}`;
  await mkdir(join(out, folder), { recursive: true });
  await writeFile(join(out, name), data);
  return name;
}

// ── The programme and its styles.
async function buildApp() {
  const work = join(out, '.vite');
  await build({
    configFile: false, root, base: './', publicDir: false, logLevel: 'warn',
    build: {
      outDir: work, emptyOutDir: true, target: 'es2022', cssCodeSplit: false, modulePreload: false,
      rollupOptions: { output: { entryFileNames: 'app.js', chunkFileNames: 'app-[name].js', assetFileNames: 'app[extname]' } },
    },
  });
  const made = await readdir(work);
  const scripts = made.filter(name => name.endsWith('.js'));
  if (scripts.length !== 1 || !made.includes('app.css')) throw new Error(`Expected one script and one stylesheet, found: ${made.join(', ')}`);
  const [js, css] = await Promise.all([readFile(join(work, 'app.js')), readFile(join(work, 'app.css'), 'utf8')]);
  await rm(work, { recursive: true, force: true });
  return { js, css };
}

// ── Posters. Films are numbered along a curve that keeps neighbours in the
// white sky together, so the faces around a star mostly share a sheet. A film
// keeps its number whether or not its poster has been fetched yet.
function order(bundle) {
  const universe = openUniverse(bundle);
  const P = universe.positions.white;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < universe.base; i += 1) {
    minX = Math.min(minX, P[i * 3]); maxX = Math.max(maxX, P[i * 3]);
    minZ = Math.min(minZ, P[i * 3 + 2]); maxZ = Math.max(maxZ, P[i * 3 + 2]);
  }
  const spread = value => { let v = value & 0x3ff; v = (v | (v << 8)) & 0x00ff00ff; v = (v | (v << 4)) & 0x0f0f0f0f; v = (v | (v << 2)) & 0x33333333; return (v | (v << 1)) & 0x55555555; };
  const key = i => {
    const x = Math.round(((P[i * 3] - minX) / (maxX - minX || 1)) * 1023);
    const z = Math.round(((P[i * 3 + 2] - minZ) / (maxZ - minZ || 1)) * 1023);
    return spread(x) | (spread(z) << 1);
  };
  return bundle.films
    .map((film, i) => ({ film, key: key(i) }))
    .filter(entry => entry.film.p)
    .sort((a, b) => a.key - b.key || (a.film.s < b.film.s ? -1 : 1))
    .map(entry => entry.film);
}

async function thumbnail(file, { width, height }) {
  try {
    return await sharp(file).rotate().resize(width, height, { fit: 'cover', position: 'centre' }).flatten({ background: BACKGROUND }).removeAlpha().raw().toBuffer();
  } catch {
    return null; // a file that did not arrive whole: the film keeps its plate
  }
}

async function buildPosters(bundle) {
  const films = order(bundle);
  const have = [];
  for (const film of films) have.push(await exists(fileOf(film)));
  const index = {};
  const tiers = {};
  const failed = new Set();
  for (const [name, tier] of Object.entries(TIERS)) {
    const cells = tier.columns * tier.rows;
    const files = [];
    for (let first = 0; first < films.length; first += cells) {
      const parts = [];
      for (let n = first; n < Math.min(films.length, first + cells); n += 1) {
        if (!have[n] || failed.has(n)) continue;
        const input = await thumbnail(fileOf(films[n]), tier);
        if (!input) { failed.add(n); continue; }
        const cell = n - first;
        parts.push({ input, raw: { width: tier.width, height: tier.height, channels: 3 }, left: (cell % tier.columns) * tier.width, top: Math.floor(cell / tier.columns) * tier.height });
      }
      if (!parts.length) { files.push(null); continue; }
      const sheet = await sharp({ create: { width: tier.columns * tier.width, height: tier.rows * tier.height, channels: 3, background: BACKGROUND } })
        .composite(parts).webp({ quality: tier.quality, effort: 5 }).toBuffer();
      files.push((await emit('posters', `${name}-${String(first / cells).padStart(3, '0')}`, 'webp', sheet)).replace(/^posters\//, ''));
    }
    tiers[name] = { files, columns: tier.columns, rows: tier.rows };
  }
  films.forEach((film, n) => { if (have[n] && !failed.has(n)) index[film.s] = n; });
  const manifest = await emit('posters', 'index', 'json', JSON.stringify({ tiers, index }));
  return { manifest, held: Object.keys(index).length, wanted: films.length };
}

// ── The page, as an Artifact is written: no document around it, the title and
// the styles first, and every address relative.
function compose({ shell, css, config, app }) {
  const fonts = shell.match(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/)?.[0];
  const body = shell.match(/<body>\s*([\s\S]*?)\s*<script type="module"/)?.[1];
  if (!fonts || !body) throw new Error('index.html no longer has the shape this build expects.');
  return [
    `<title>${TITLE}</title>`,
    '<meta name="claude:viewport-fit-sides" content="cover">',
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    fonts,
    `<style>\n${css.trim()}\n</style>`,
    body,
    `<script>window.ODYSSEY = ${JSON.stringify(config)};</script>`,
    `<script type="module" src="./${app}"></script>`,
    '',
  ].join('\n');
}

async function listFiles(folder, prefix = '') {
  const found = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory()) found.push(...await listFiles(join(folder, entry.name), `${path}/`));
    else found.push({ path, bytes: (await stat(join(folder, entry.name))).size });
  }
  return found;
}

async function main() {
  const withPosters = !process.argv.includes('--no-posters');
  // What the last build published is remembered, so the next publish can take the old files away.
  let before = [];
  try { before = JSON.parse(await readFile(join(out, 'published.json'), 'utf8')); } catch { before = []; }
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  if (before.length) await writeFile(join(out, 'published.json'), `${JSON.stringify(before)}\n`);

  const { js, css } = await buildApp();
  const app = await emit('', 'app', 'js', js);
  const universeText = await readFile(join(root, 'public', 'data', 'universe.json'));
  const config = {
    edition: 'claude',
    universe: `./${await emit('data', 'universe', 'json', universeText)}`,
    depth: `./${await emit('data', 'depth', 'json', await readFile(join(root, 'public', 'data', 'depth.json')))}`,
  };
  let posters = null;
  if (withPosters) {
    posters = await buildPosters(JSON.parse(universeText));
    if (posters.held) { config.posters = `./${posters.manifest}`; config.posterBase = './posters/'; }
  }
  const page = compose({ shell: await readFile(join(root, 'index.html'), 'utf8'), css, config, app });
  await writeFile(join(out, 'index.html'), page);

  // What to publish beside the page, in batches that each fit one publish. The
  // programme and the chart go first, so the first publish already runs.
  const rank = path => (path.startsWith('app.') ? 0 : path.startsWith('data/') ? 1 : path.startsWith('posters/index.') ? 2 : path.startsWith('posters/small-') ? 3 : 4);
  const files = (await listFiles(out)).filter(file => !['index.html', 'files.json', 'published.json'].includes(file.path))
    .sort((a, b) => rank(a.path) - rank(b.path) || (a.path < b.path ? -1 : 1));
  const batches = [[]];
  let bytes = Buffer.byteLength(page);
  for (const file of files) {
    const batch = batches[batches.length - 1];
    if (batch.length >= BATCH_FILES || (batch.length && bytes + file.bytes > BATCH_BYTES)) { batches.push([]); bytes = 0; }
    batches[batches.length - 1].push(file.path);
    bytes += file.bytes;
  }
  const now = new Set(files.map(file => file.path));
  const remove = before.filter(path => !now.has(path));
  await writeFile(join(out, 'files.json'), `${JSON.stringify({ batches, remove }, null, 1)}\n`);

  const total = files.reduce((sum, file) => sum + file.bytes, 0) + Buffer.byteLength(page);
  const mb = value => `${(value / 1024 / 1024).toFixed(1)} MB`;
  console.log(`page ${mb(Buffer.byteLength(page))} · programme ${mb(js.length)} · ${files.length} files beside it · ${mb(total)} in all · ${batches.length} publish${batches.length === 1 ? '' : 'es'}`);
  if (posters) console.log(`posters: ${posters.held} of ${posters.wanted} films have a thumbnail`);
  if (remove.length) console.log(`${remove.length} files from the last publish are no longer used`);
}

main().catch(error => { console.error(error); process.exit(1); });
