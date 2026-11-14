// Posters are the faces of the stars. A charted film's poster is shown from
// Wikimedia where the chart recorded one; until it loads, and wherever there is
// none, the film wears a plate made from its own two colours.
//
// Posters are fetched a few at a time, the ones in view first, and a refusal
// is tried again a little later: an image host is a shared thing, and a sky
// full of faces should not arrive as one burst.
//
// A build that cannot reach outside images (the claude.ai edition) carries
// thumbnails in sheets instead: `configurePosters` points at them, and a sheet
// is fetched only when one of its faces comes into view.
import { h } from './dom.mjs';

const COMMONS = 'https://upload.wikimedia.org/wikipedia/';
const AT_ONCE = 6;
const TRIES = 3;
// Sheets of thumbnails, in two sizes: { tiers: { small: { files, columns, rows }, large: {…} }, index: { slug: n } }.
// A film's number n is its place in both tiers: sheet floor(n / cells), cell n % cells.
let sheets = null;
let imageBase = COMMONS;
let outside = true; // whether images may be asked of other hosts at all

/**
 * @param {{ sheets?: { tiers: Record<string, { files: string[], columns: number, rows: number }>, index: Record<string, number> }, base?: string, outside?: boolean }} config
 */
export function configurePosters(config = {}) {
  if (config.sheets) sheets = config.sheets;
  if (config.base) imageBase = config.base;
  if (config.outside === false) outside = false;
}

export function hasPoster(film) {
  if (sheets) return sheets.index[film.s] !== undefined;
  return outside && Boolean(film.p || film.pu);
}

/**
 * The address of a film's poster, or '' when it has none (or only a thumbnail in a sheet).
 * @param {object} film
 * @param {'small' | 'large'} [size] small: a face in the sky or a row; large: the dossier
 */
export function posterUrl(film, size = 'small') {
  if (sheets || !outside) return '';
  // A poster the catalogue found for a star charted later, at a width nearer the size it is shown at.
  if (film.pu) return size === 'large' ? film.pu : film.pu.replace(/\/t\/p\/w\d+\//, '/t/p/w342/');
  if (!film.p) return '';
  // A free image is recorded at a generous width; ask for one nearer the size it is shown at.
  const path = film.p.replace(/\/(\d+)px-([^/]+)$/, (whole, width, name) => (Number(width) > 500 ? `/${size === 'large' ? 500 : 250}px-${name}` : whole));
  return `${imageBase}${path}`;
}

/** Where a film's thumbnail sits in the sheets, or null. */
function sheetPlace(film, size) {
  const n = sheets.index[film.s];
  if (n === undefined) return null;
  const tier = sheets.tiers[size] || sheets.tiers.small;
  const cells = tier.columns * tier.rows;
  return { url: tier.files[Math.floor(n / cells)], cell: n % cells, columns: tier.columns, rows: tier.rows };
}

// ── Fetching, a few at a time.
const known = new Map(); // address → 'here' | 'gone' | [holders waiting on the first fetch]
const waiting = [];      // jobs not yet started, first in view first served
let active = 0;

const watcher = typeof IntersectionObserver === 'function'
  ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      watcher.unobserve(entry.target);
      const job = jobs.get(entry.target);
      if (job) { jobs.delete(entry.target); want(job); }
    }
  }, { rootMargin: '160px' })
  : null;
const jobs = new WeakMap(); // holder → job, until it comes into view

function reveal(job) {
  if (job.shown) return;
  job.shown = true;
  if (job.place) {
    // One thumbnail of a sheet that has already arrived.
    const { url, cell, columns, rows } = job.place;
    const column = cell % columns;
    const row = Math.floor(cell / columns);
    job.holder.append(h('span.poster-image.poster-sheet', {
      role: 'img', 'aria-label': `Poster of ${job.title}`,
      style: {
        backgroundImage: `url("${url}")`,
        backgroundSize: `${columns * 100}% ${rows * 100}%`,
        backgroundPosition: `${columns > 1 ? (column / (columns - 1)) * 100 : 0}% ${rows > 1 ? (row / (rows - 1)) * 100 : 0}%`,
      },
    }));
    requestAnimationFrame(() => job.holder.classList.add('has-image'));
    return;
  }
  const image = h('img.poster-image', { alt: `Poster of ${job.title}`, decoding: 'async', referrerpolicy: 'no-referrer', draggable: 'false' });
  image.addEventListener('load', () => job.holder.classList.add('has-image'), { once: true });
  image.addEventListener('error', () => image.remove(), { once: true });
  image.src = job.url; // already fetched once: this comes from the browser's cache
  job.holder.append(image);
}

function want(job) {
  const state = known.get(job.url);
  if (state === 'here') { reveal(job); return; }
  if (state === 'gone') return;
  if (Array.isArray(state)) { state.push(job); return; }
  known.set(job.url, [job]);
  if (job.eager) waiting.unshift(job); else waiting.push(job);
  pump();
}

function pump() {
  while (active < AT_ONCE && waiting.length) {
    const job = waiting.shift();
    const holders = known.get(job.url);
    // A face that left the sky before its turn is not worth the request.
    if (Array.isArray(holders) && !holders.some(entry => entry.holder.isConnected)) {
      known.delete(job.url);
      for (const entry of holders) if (watcher) { jobs.set(entry.holder, entry); watcher.observe(entry.holder); }
      continue;
    }
    fetchImage(job);
  }
}

function fetchImage(job) {
  active += 1;
  const probe = new Image();
  probe.decoding = 'async';
  probe.referrerPolicy = 'no-referrer';
  const done = ok => {
    active -= 1;
    const holders = known.get(job.url);
    if (ok) {
      known.set(job.url, 'here');
      if (Array.isArray(holders)) for (const entry of holders) reveal(entry);
    } else if ((job.tries += 1) < TRIES) {
      // Refused, most likely for asking too fast: wait, then take a place at the back.
      setTimeout(() => { waiting.push(job); pump(); }, 1800 * 2 ** job.tries + Math.random() * 900);
    } else {
      known.set(job.url, 'gone');
    }
    pump();
  };
  probe.onload = () => done(true);
  probe.onerror = () => done(false);
  probe.src = job.url;
}

/** Sets a film's image over its plate, as soon as it is in view. False when the film has no image to show. */
function attach(element, film, { eager, size }) {
  const place = sheets ? sheetPlace(film, size) : null;
  const url = place ? place.url : posterUrl(film, size);
  if (!url) return false;
  const job = { holder: element, url, place, title: film.t, eager, tries: 0, shown: false };
  if (known.get(url) === 'here') reveal(job);
  else if (watcher) { jobs.set(element, job); watcher.observe(element); }
  else want(job);
  return true;
}

// A star charted from memory has no poster until a catalogue answers for it, which can be a little
// after the star is first shown. The plates drawn of it meanwhile are noted here, held weakly, so
// that the poster reaches every one of them still on the page when it comes.
const plates = new Map(); // slug → [{ ref: WeakRef<element>, eager, size }]
const PLATES_KEPT = 24;

function awaitPoster(element, film, options) {
  if (typeof WeakRef !== 'function') return;
  let list = plates.get(film.s);
  if (!list) { list = []; plates.set(film.s, list); }
  list.push({ ref: new WeakRef(element), ...options });
  if (list.length > PLATES_KEPT) {
    const live = list.filter(entry => entry.ref.deref()?.isConnected);
    plates.set(film.s, live.slice(-PLATES_KEPT));
  }
}

/**
 * Posters have been found for films already drawn: every plate of theirs still on the page takes its image.
 * @param {object[]} films film records that now carry a poster
 */
export function postersFound(films) {
  for (const film of films || []) {
    const list = plates.get(film.s);
    if (!list) continue;
    plates.delete(film.s);
    for (const { ref, eager, size } of list) {
      const element = ref.deref();
      if (element && element.isConnected) attach(element, film, { eager, size });
    }
  }
}

const ARTICLES = new Set(['the', 'a', 'an', 'le', 'la', 'les', 'il', 'lo', 'el', 'los', 'las', 'der', 'die', 'das', 'de', 'het']);

/** The first letter of a title's first word that is not an article: "The Thing" is T, "La Strada" is S. */
export function initial(title) {
  const words = String(title || '').split(/\s+/).filter(Boolean);
  const word = words.find(entry => !ARTICLES.has(entry.toLowerCase())) || words[0] || '';
  const letter = word.replace(/^(?:l'|d')/i, '').match(/[\p{L}\p{N}]/u);
  return letter ? letter[0].toLocaleUpperCase() : '';
}

/**
 * A poster element: the plate underneath, the image over it once it arrives.
 * @param {object} film
 * @param {{ words?: boolean, eager?: boolean, size?: 'small' | 'large' }} [options]
 *   words: set the title on the plate; eager: fetch ahead of the others; size: how large it will be shown
 */
export function poster(film, { words = true, eager = false, size = 'small' } = {}) {
  const element = h('span.poster', { style: { '--hi': film.hi || '#dec6a0', '--lo': film.lo || '#101923' } });
  const plate = h('span.poster-plate', { 'aria-hidden': 'true' });
  // A plate too small for its title wears the title's initial instead.
  if (words) plate.append(h('span.poster-plate-title', film.t), h('span.poster-plate-year', String(film.y || '')));
  else plate.append(h('span.poster-plate-initial', initial(film.t)));
  element.append(plate);
  if (!attach(element, film, { eager, size }) && film.deep && outside && !sheets) awaitPoster(element, film, { eager, size });
  return element;
}
