// Posters are the faces of the stars. A charted film's poster is shown from
// Wikimedia Commons where the chart recorded one; until it loads, and wherever
// there is none, the film wears a plate made from its own two colours.
//
// A build that cannot reach outside images (the claude.ai edition) carries
// small thumbnails in sheets instead: `configurePosters` points at them.
import { h } from './dom.mjs';

const COMMONS = 'https://upload.wikimedia.org/wikipedia/';
let sheets = null; // { url(n), columns, rows, index: { slug: [sheet, cell] } }
let imageBase = COMMONS;

/**
 * @param {{ sheets?: { files: string[], columns: number, rows: number, index: Record<string, [number, number]> }, base?: string }} config
 */
export function configurePosters(config = {}) {
  if (config.sheets) sheets = config.sheets;
  if (config.base) imageBase = config.base;
}

export function hasPoster(film) {
  if (sheets) return Boolean(sheets.index[film.s]);
  return Boolean(film.p || film.pu);
}

/** The address of a film's poster, or '' when it has none (or only a thumbnail in a sheet). */
export function posterUrl(film) {
  if (sheets) return '';
  if (film.pu) return film.pu; // a poster found for a star charted later
  return film.p ? `${imageBase}${film.p}` : '';
}

/**
 * A poster element: the plate underneath, the image over it once it arrives.
 * @param {object} film
 * @param {{ words?: boolean, eager?: boolean }} [options] words: set the title on the plate
 */
export function poster(film, { words = true, eager = false } = {}) {
  const element = h('span.poster', { style: { '--hi': film.hi || '#dec6a0', '--lo': film.lo || '#101923' } });
  const plate = h('span.poster-plate', { 'aria-hidden': 'true' });
  if (words) plate.append(h('span.poster-plate-title', film.t), h('span.poster-plate-year', String(film.y || '')));
  element.append(plate);

  if (sheets) {
    const place = sheets.index[film.s];
    if (place) {
      const [sheet, cell] = place;
      const column = cell % sheets.columns;
      const row = Math.floor(cell / sheets.columns);
      const image = h('span.poster-image.poster-sheet', {
        role: 'img', 'aria-label': `Poster of ${film.t}`,
        style: {
          backgroundImage: `url("${sheets.files[sheet]}")`,
          backgroundSize: `${sheets.columns * 100}% ${sheets.rows * 100}%`,
          backgroundPosition: `${sheets.columns > 1 ? (column / (sheets.columns - 1)) * 100 : 0}% ${sheets.rows > 1 ? (row / (sheets.rows - 1)) * 100 : 0}%`,
        },
      });
      element.append(image);
      element.classList.add('has-image');
    }
    return element;
  }

  const url = posterUrl(film);
  if (url) {
    const image = h('img.poster-image', { alt: `Poster of ${film.t}`, loading: eager ? 'eager' : 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', draggable: 'false' });
    image.addEventListener('load', () => element.classList.add('has-image'), { once: true });
    image.addEventListener('error', () => image.remove(), { once: true });
    image.src = url;
    element.append(image);
  }
  return element;
}
