// What a voyager keeps between visits: the films they love and have seen,
// their wake, the stars they found beyond the chart, and what the Navigator
// has already told them. All of it lives in this browser only.
//
// Films are remembered by slug, never by index: the chart may be recompiled,
// and stars found beyond it only exist once their readings are restored.
const KEY = 'afterimage.odyssey.v1';
const MAX_WAKE = 240;
const MAX_READINGS = 2400;
const MAX_ARRIVALS = 160;

function load() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function createStore() {
  const saved = load();
  const list = value => (Array.isArray(value) ? value.filter(item => typeof item === 'string') : []);
  const state = {
    loved: new Set(list(saved.loved)),
    seen: new Set(list(saved.seen)),
    wake: list(saved.wake).slice(-MAX_WAKE),
    // Stars found beyond the chart: { reading, from (slug), source, extra }
    found: Array.isArray(saved.found) ? saved.found.filter(entry => entry && entry.reading && entry.reading.title).slice(-MAX_READINGS) : [],
    // What the Navigator said on arrival, by slug: { essence, rays: [{ light, slug, claim, watch }], beyond }
    arrivals: saved.arrivals && typeof saved.arrivals === 'object' ? saved.arrivals : {},
    sky: typeof saved.sky === 'string' ? saved.sky : 'white',
    entered: Boolean(saved.entered),
    companion: saved.companion && typeof saved.companion === 'object' ? saved.companion : null,
  };
  let timer = 0;

  function write() {
    timer = 0;
    try {
      const arrivals = Object.fromEntries(Object.entries(state.arrivals).slice(-MAX_ARRIVALS));
      window.localStorage.setItem(KEY, JSON.stringify({
        loved: [...state.loved], seen: [...state.seen], wake: state.wake.slice(-MAX_WAKE),
        found: state.found.slice(-MAX_READINGS), arrivals, sky: state.sky, entered: state.entered,
        companion: state.companion,
      }));
    } catch { /* a full or forbidden store: the voyage simply is not remembered */ }
  }
  const save = () => { if (!timer) timer = setTimeout(write, 400); };

  return {
    state,
    save,
    toggle(set, slug) {
      const on = !state[set].has(slug);
      if (on) state[set].add(slug); else state[set].delete(slug);
      save();
      return on;
    },
    visit(slug) {
      if (state.wake[state.wake.length - 1] === slug) return;
      state.wake.push(slug);
      if (state.wake.length > MAX_WAKE) state.wake.splice(0, state.wake.length - MAX_WAKE);
      save();
    },
    remember(entry) {
      state.found.push(entry);
      save();
    },
    keepArrival(slug, arrival) {
      delete state.arrivals[slug];
      state.arrivals[slug] = arrival;
      save();
    },
    set(key, value) { state[key] = value; save(); },
    clear() {
      state.loved.clear(); state.seen.clear(); state.wake.length = 0; state.found.length = 0; state.arrivals = {};
      write();
    },
  };
}
