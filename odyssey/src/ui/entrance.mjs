// The threshold. One question, and a few ways to set out; and for a voyager
// who has been here before, the way back to the last star they reached.
import { fold } from '../engine/search.mjs';
import { h, icon, replace } from './dom.mjs';
import { poster } from './posters.mjs';

/** Whether a title holds what was typed as whole words: "mulholland" is in Mulholland Drive, "alien" is not in Aliens. */
const holds = (title, query) => ` ${fold(title)} `.includes(` ${fold(query)} `);

export function createEntrance(app) {
  const { universe, state, films, search, store } = app;
  const input = h('input.enter-input', { type: 'search', autocomplete: 'off', spellcheck: 'false', placeholder: 'Name a film that stayed with you', 'aria-label': 'Name a film that stayed with you' });
  const suggestions = h('div.enter-suggestions', { role: 'listbox' });
  let items = [];
  let active = 0;

  function begin(action) {
    state.entered = true;
    store.set('entered', true);
    layer.classList.add('leaving');
    app.hud.setEntered(true);
    app.labels.setHidden(false);
    cosmosDrift(false);
    setTimeout(() => { layer.hidden = true; }, 900);
    action();
  }

  function cosmosDrift(on) { app.cosmos.camera.setDrift(on ? 0.03 : 0.012); }

  function suggest() {
    const query = input.value.trim();
    items = query ? search.films(query, 5).map(entry => entry.star) : [];
    active = 0;
    const nodes = items.map((star, n) => h('button.enter-suggestion', { type: 'button', role: 'option', class: n === 0 ? 'on' : '', onclick: () => begin(() => app.focusStar(star)) },
      h('span.search-poster', poster(films[star], { words: false })),
      h('span.search-text', h('span.search-name', films[star].t, h('span.frow-year', String(films[star].y))), h('span.search-sub', films[star].d || ''))));
    // Offered only when nothing found already answers to what was typed.
    if (query.length >= 2 && fold(query) && !items.some(star => holds(films[star].t, query))) {
      nodes.push(h('button.enter-suggestion.beyond', { type: 'button', onclick: () => begin(() => { if (app.pilot.connected) app.chartFilm(query); else app.searchView.open({ query }); }) },
        h('span.search-dot.spark', icon('spark', 18)),
        h('span.search-text', h('span.search-name', `Chart “${query}”`), h('span.search-sub', 'Not on the chart? The Navigator can chart it from memory.'))));
    }
    replace(suggestions, nodes);
    suggestions.classList.toggle('open', nodes.length > 0);
    layer.classList.toggle('suggesting', nodes.length > 0);
  }

  input.addEventListener('input', suggest);
  input.addEventListener('keydown', event => {
    const rows = [...suggestions.children];
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      active = Math.max(0, Math.min(rows.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1)));
      rows.forEach((row, n) => row.classList.toggle('on', n === active));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      rows[active]?.click();
    }
  });

  const beyond = universe.count - universe.base;
  const ways = h('div.enter-ways');
  const layer = h('div.entrance', { hidden: true },
    h('div.enter-inner',
      h('p.enter-mark', 'AFTERIMAGE'),
      h('h1.enter-title', 'The Odyssey'),
      h('p.enter-line', 'Starlight is old light. So is cinema.'),
      h('div.enter-field', icon('search', 20), input, suggestions),
      ways,
      h('p.enter-foot', `${universe.base.toLocaleString('en')} films charted as stars${beyond ? `, ${beyond.toLocaleString('en')} more found beyond the chart` : ''}. Six lights to see them by. Claude as your Navigator.`)));
  app.root.querySelector('#app').append(layer);

  /** The last star a voyager reached, if they have been here before and it is still in the sky. */
  function lastStar() {
    const wake = store.state.wake || [];
    for (let n = wake.length - 1; n >= 0; n -= 1) {
      const star = app.starOf(wake[n]);
      if (star >= 0 && star < universe.count) return star;
    }
    return -1;
  }

  function drawWays() {
    const last = lastStar();
    replace(ways,
      last >= 0 ? h('button.enter-way.enter-back', { type: 'button', title: `Back to ${films[last].t}, where you were last`, onclick: () => begin(() => app.focusStar(last)) },
        h('span.enter-back-poster', poster(films[last], { words: false, eager: true })),
        h('span.enter-back-name', `Back to ${films[last].t}`)) : null,
      h('button.enter-way', { type: 'button', onclick: () => begin(() => app.panels.open('voyage')) }, icon('door', 18), h('span', 'Set out')),
      h('button.enter-way', { type: 'button', onclick: () => begin(() => app.startDrift()) }, icon('drift', 18), h('span', 'Drift')),
      h('button.enter-way', { type: 'button', onclick: () => begin(() => app.panels.open('course')) }, icon('compass', 18), h('span', 'Plot a course')),
      h('button.enter-way', { type: 'button', onclick: () => begin(() => app.overview()) }, icon('home', 18), h('span', 'See the whole universe')));
  }

  return {
    show() {
      drawWays();
      layer.hidden = false;
      layer.classList.remove('leaving');
      app.hud.setEntered(false);
      app.labels.setHidden(true);
      cosmosDrift(true);
      requestAnimationFrame(() => layer.classList.add('on'));
      if (!app.small) setTimeout(() => input.focus({ preventScroll: true }), 600);
    },
    /** Leaves the threshold for somewhere already chosen (an address followed while it was still up). */
    leave() { if (!state.entered) begin(() => {}); },
    /** Passes the threshold without the ceremony (a returning voyager, or an address that names a star). */
    skip() {
      state.entered = true;
      layer.hidden = true;
      app.hud.setEntered(true);
      app.labels.setHidden(false);
    },
  };
}
