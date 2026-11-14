// What a voyager keeps between visits: the films they love, have watched, are
// saving for a night to come, or have set aside; their wake and every star they
// have visited; the voyages they have landed; the stars they found beyond the
// chart; and what the Navigator has already told them. All of it lives in this
// browser only, and a file can carry it to another (see archive.mjs).
//
// Films are remembered by slug, never by index: the chart may be recompiled,
// and stars found beyond it only exist once their readings are restored.
import { cleanComet, cleanRoute, exportArchive, mergeArchive } from './archive.mjs';

const KEY = 'afterimage.odyssey.v1';
const MAX_WAKE = 240;
const MAX_VISITED = 6000;
const MAX_READINGS = 1500;
const MAX_ARRIVALS = 160;
const MAX_ROUTES = 60;
const MAX_COMETS = 60;
export const MARKS = ['loved', 'seen', 'watchlist', 'hidden'];

function load() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

const list = value => (Array.isArray(value) ? value.filter(item => typeof item === 'string') : []);

function read(saved) {
  const wake = list(saved.wake).slice(-MAX_WAKE);
  return {
    loved: new Set(list(saved.loved)),
    seen: new Set(list(saved.seen)),
    watchlist: new Set(list(saved.watchlist)),
    hidden: new Set(list(saved.hidden)),
    // Every star ever reached, not only the recent wake: constellations are found from it.
    visited: new Set([...list(saved.visited), ...wake]),
    wake,
    // Voyages a voyager landed, and trails and passages they kept: { name, heading, kind, savedAt, stops: [{ slug, light, note }], landed? }
    routes: Array.isArray(saved.routes) ? saved.routes.map(cleanRoute).filter(Boolean).slice(-MAX_ROUTES) : [],
    // Each night's comet, once chosen: { night, slug, from, light, why, caught }, oldest first.
    comets: Array.isArray(saved.comets) ? saved.comets.map(cleanComet).filter(Boolean).slice(-MAX_COMETS) : [],
    // Stars found beyond the chart: { slug, reading, from (slug), source, extra: { pu, im, rt } }
    found: Array.isArray(saved.found) ? saved.found.filter(entry => entry && entry.reading && entry.reading.title).slice(-MAX_READINGS) : [],
    // What the Navigator said on arrival, by slug: { essence, rays: [{ light, slug, claim, watch }], beyond }
    arrivals: saved.arrivals && typeof saved.arrivals === 'object' ? saved.arrivals : {},
    sky: typeof saved.sky === 'string' ? saved.sky : 'white',
    entered: Boolean(saved.entered),
    hands: Boolean(saved.hands), // told once how the hands move the sky
    companion: saved.companion && typeof saved.companion === 'object' ? saved.companion : null,
    readArrivals: saved.readArrivals !== false, // whether the Navigator reads each star on arrival
    // Tonight's seeing, kept for the night it was set: { night, length, language, tempers }.
    seeing: saved.seeing && typeof saved.seeing === 'object' && typeof saved.seeing.night === 'string' ? saved.seeing : null,
    // Tonight's bearing, as the choices made: { night, choices: [[chosen slug, passed-over slug]] }.
    bearing: cleanBearing(saved.bearing),
    // The other sky, for watching together: { name, slugs }, the films the other person loves.
    together: cleanTogether(saved.together),
  };
}

function cleanTogether(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const slugs = list(raw.slugs).slice(0, 60);
  const name = typeof raw.name === 'string' ? raw.name.slice(0, 24) : '';
  return slugs.length || name ? { name, slugs } : null;
}

function cleanBearing(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.night !== 'string' || !Array.isArray(raw.choices)) return null;
  const choices = raw.choices.filter(pair => Array.isArray(pair) && pair.length === 2 && pair.every(slug => typeof slug === 'string')).slice(0, 12);
  return choices.length ? { night: raw.night, choices } : null;
}

export function createStore() {
  const state = read(load());
  const listeners = new Set();
  let timer = 0;

  function snapshot() {
    const arrivals = Object.fromEntries(Object.entries(state.arrivals).slice(-MAX_ARRIVALS));
    return {
      loved: [...state.loved], seen: [...state.seen], watchlist: [...state.watchlist], hidden: [...state.hidden],
      visited: [...state.visited].slice(-MAX_VISITED), wake: state.wake.slice(-MAX_WAKE), routes: state.routes.slice(-MAX_ROUTES),
      found: state.found.slice(-MAX_READINGS), arrivals, sky: state.sky, entered: state.entered, hands: state.hands, comets: state.comets.slice(-MAX_COMETS),
      companion: state.companion, readArrivals: state.readArrivals, seeing: state.seeing, bearing: state.bearing, together: state.together,
    };
  }

  function write() {
    clearTimeout(timer);
    timer = 0;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(snapshot()));
    } catch { /* a full or forbidden store: the voyage simply is not remembered */ }
  }
  const save = () => { if (!timer) timer = setTimeout(write, 400); };
  // A tab being closed writes what it has not yet written.
  window.addEventListener?.('pagehide', () => { if (timer) write(); });

  // Another tab of the Odyssey changed what is kept: its marks and voyages are this tab's too.
  window.addEventListener?.('storage', event => {
    if (event.key !== KEY || !event.newValue) return;
    let other;
    try { other = read(JSON.parse(event.newValue)); } catch { return; }
    for (const key of [...MARKS, 'visited']) state[key] = other[key];
    state.routes = other.routes;
    state.comets = other.comets;
    for (const listener of listeners) listener('marks');
  });

  const store = {
    state,
    save,
    /** Called when another tab changes the marks. */
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    toggle(set, slug) {
      const on = !state[set].has(slug);
      store.mark(set, slug, on);
      return on;
    },
    /** Puts a film in or out of one of the marks. Watching a film takes it off the watchlist; setting it aside takes it out of all the rest. */
    mark(set, slug, on) {
      if (on) {
        state[set].add(slug);
        if (set === 'seen') state.watchlist.delete(slug);
        if (set === 'hidden') { state.watchlist.delete(slug); state.loved.delete(slug); }
        if (set === 'loved' || set === 'watchlist') state.hidden.delete(slug);
      } else state[set].delete(slug);
      save();
    },
    visit(slug) {
      state.visited.add(slug);
      if (state.wake[state.wake.length - 1] === slug) { save(); return; }
      state.wake.push(slug);
      if (state.wake.length > MAX_WAKE) state.wake.splice(0, state.wake.length - MAX_WAKE);
      save();
    },
    /** Keeps a voyage. The same stops kept again replace the older one. */
    keepRoute(route) {
      const clean = cleanRoute(route);
      if (!clean) return null;
      const key = clean.stops.map(stop => stop.slug).join('|');
      state.routes = state.routes.filter(other => other.stops.map(stop => stop.slug).join('|') !== key || other.kind !== clean.kind);
      state.routes.push(clean);
      if (state.routes.length > MAX_ROUTES) state.routes.splice(0, state.routes.length - MAX_ROUTES);
      save();
      return clean;
    },
    forgetRoute(route) {
      state.routes = state.routes.filter(other => other !== route);
      save();
    },
    remember(entry) {
      state.found.push(entry);
      save();
    },
    /** What a catalogue found for a star this browser remembers: its poster, identifier, running time. */
    noteFacts(slug, extra) {
      for (let i = state.found.length - 1; i >= 0; i -= 1) {
        if (state.found[i].slug !== slug) continue;
        state.found[i].extra = { ...state.found[i].extra, ...extra };
        save();
        return;
      }
    },
    keepArrival(slug, arrival) {
      delete state.arrivals[slug];
      state.arrivals[slug] = arrival;
      save();
    },
    /** Keeps the night's comet once it is chosen, so it stays the same all night. */
    keepComet(comet) {
      const clean = cleanComet(comet);
      if (!clean) return null;
      state.comets = state.comets.filter(other => other.night !== clean.night);
      state.comets.push(clean);
      if (state.comets.length > MAX_COMETS) state.comets.splice(0, state.comets.length - MAX_COMETS);
      save();
      return clean;
    },
    /** The night's comet is caught: what it carried is known, and it is kept among the comets caught. */
    catchComet(night) {
      const comet = state.comets.find(other => other.night === night);
      if (comet && !comet.caught) { comet.caught = true; save(); }
      return comet || null;
    },
    set(key, value) { state[key] = value; save(); },
    /** Everything kept, as a file's contents. */
    archive() { return exportArchive(state); },
    /** Joins a file's contents to what is kept, and writes it at once. Throws, changing nothing, if it is not an archive. */
    absorb(archive) {
      const { state: next, counts } = mergeArchive(state, archive);
      Object.assign(state, next);
      write();
      return counts;
    },
    clear() {
      for (const key of [...MARKS, 'visited']) state[key].clear();
      state.wake.length = 0; state.found.length = 0; state.routes = []; state.arrivals = {}; state.comets = []; state.seeing = null; state.bearing = null; state.together = null;
      write();
    },
  };
  return store;
}
