// The threshold. One question, and a few ways to set out; and for a voyager
// who has been here before, the way back to the last star they reached.
import { seek } from '../engine/search.mjs';
import { LIGHT_IDS, lightById } from '../engine/lights.mjs';
import { h, icon, replace, plural } from './dom.mjs';
import { poster } from './posters.mjs';


export function createEntrance(app) {
  const { universe, state, films, search, store } = app;
  const input = h('input.enter-input', {
    type: 'search', autocomplete: 'off', spellcheck: 'false', placeholder: 'Name a film that stayed with you', 'aria-label': 'Name a film that stayed with you',
    role: 'combobox', 'aria-autocomplete': 'list', 'aria-controls': 'enter-suggestions', 'aria-expanded': 'false',
  });
  const suggestions = h('div.enter-suggestions', { role: 'listbox', id: 'enter-suggestions', 'aria-label': 'Suggestions' });
  let items = [];
  let active = 0;

  /** Marks the suggestion Enter would take, for the eye and for a screen reader. */
  function setActive(n) {
    const rows = [...suggestions.children];
    active = Math.max(0, Math.min(rows.length - 1, n));
    rows.forEach((row, index) => { row.classList.toggle('on', index === active); row.setAttribute('aria-selected', String(index === active)); });
    if (rows[active]) input.setAttribute('aria-activedescendant', rows[active].id);
    else input.removeAttribute('aria-activedescendant');
  }

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
    // A kind of film ("heist", "western") lights up every film of that kind.
    const currents = query.length >= 2 ? search.traits(query, 2).filter(entry => entry.score >= 3 || (!items.length && entry.score >= 2)) : [];
    let n = 0;
    const option = (cls, onclick, ...children) => {
      const at = n;
      n += 1;
      return h(`button.enter-suggestion${cls}`, { type: 'button', role: 'option', id: `enter-option-${at}`, onclick, onpointerenter: () => setActive(at) }, ...children);
    };
    const nodes = items.map(star => option('', () => begin(() => app.focusStar(star)),
      h('span.search-poster', poster(films[star], { words: false })),
      h('span.search-text', h('span.search-name', films[star].t, h('span.frow-year', String(films[star].y))), h('span.search-sub', films[star].d || ''))));
    for (const { trait } of currents) {
      const record = universe.traits[trait];
      const light = lightById(LIGHT_IDS[record.l]);
      nodes.push(option('.current', () => begin(() => app.showTrait(trait)),
        h('span.search-dot', { style: { '--c': light.color } }),
        h('span.search-text', h('span.search-name', record.s || record.t), h('span.search-sub', `Light up the ${plural(record.df || 0, 'film')} that share it · ${light.name}`))));
    }
    // Offered only when nothing found already answers to what was typed.
    const kind = currents.some(entry => entry.score >= 3);
    if (query.length >= 2 && seek(query) && !kind && !items.some(star => search.answers(star, query))) {
      nodes.push(option('.beyond', () => begin(() => { if (app.pilot.connected) app.chartFilm(query); else app.searchView.open({ query }); }),
        h('span.search-dot.spark', icon('spark', 18)),
        h('span.search-text', h('span.search-name', `Chart “${query}”`), h('span.search-sub', app.pilot.connected
          ? 'Not on the chart yet. Claude will chart it from memory now, and it stays.'
          : 'Not on the chart yet. Claude can chart it from memory once it is connected.'))));
    }
    replace(suggestions, nodes);
    setActive(0);
    suggestions.classList.toggle('open', nodes.length > 0);
    layer.classList.toggle('suggesting', nodes.length > 0);
    input.setAttribute('aria-expanded', String(nodes.length > 0));
  }

  input.addEventListener('input', suggest);
  input.addEventListener('keydown', event => {
    const rows = [...suggestions.children];
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(active + (event.key === 'ArrowDown' ? 1 : -1));
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
      h('p.enter-foot', `${universe.base.toLocaleString('en')} films, each a star, placed by how alike they are${beyond ? `, and ${beyond.toLocaleString('en')} more found beyond the chart` : ''}. Six lights to see them by. Claude as your guide.`)));
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

  // Two doors for everyone, the way back for someone returning, and the rest behind one more.
  let moreOpen = false;
  const more = h('div.enter-more', { id: 'enter-more', hidden: true });
  const moreToggle = h('button.enter-more-toggle', {
    type: 'button', 'aria-expanded': 'false', 'aria-controls': 'enter-more',
    onclick: () => { moreOpen = !moreOpen; showMore(); },
  }, h('span', 'More ways to explore'), icon('chevron', 15));
  function showMore() {
    more.hidden = !moreOpen;
    moreToggle.setAttribute('aria-expanded', String(moreOpen));
    moreToggle.classList.toggle('open', moreOpen);
  }

  const door = (cls, glyph, name, line, action, title = '') => h(`button.enter-door${cls}`, { type: 'button', title: title || null, onclick: () => begin(action) },
    h('span.enter-door-icon', icon(glyph, 22)),
    h('span.enter-door-text', h('span.enter-door-name', name), h('span.enter-door-line', line)));
  const way = (glyph, name, line, action) => h('button.enter-also', { type: 'button', onclick: () => begin(action) },
    icon(glyph, 17), h('span.enter-also-text', h('span.enter-also-name', name), h('span.enter-also-line', line)));

  function drawWays() {
    const last = lastStar();
    const comet = app.tonight();
    const loved = app.marks.loved.size;
    const returning = last >= 0 || loved > 0 || app.marks.watchlist.size > 0;
    replace(ways,
      h('div.enter-doors',
        door('.enter-door-tonight', 'bearing', 'Help me choose tonight\u2019s film', 'Six quick choices between two films, then a film for tonight.', () => app.takeBearing()),
        door('.enter-door-wander', 'home', 'Wander the universe', 'Every film a star, alike films close together. Go anywhere.', () => app.overview())),
      returning || (comet && !comet.caught) ? h('div.enter-return',
        last >= 0 ? h('button.enter-way.enter-back', { type: 'button', title: `Back to ${films[last].t}, where you were last`, onclick: () => begin(() => app.focusStar(last)) },
          h('span.enter-back-poster', poster(films[last], { words: false, eager: true })),
          h('span.enter-back-name', `Back to ${films[last].t}`)) : null,
        comet && !comet.caught ? h('button.enter-way.enter-comet', { type: 'button', title: 'A film the chart thinks you are missing crosses the sky tonight', onclick: () => begin(() => app.showComet()) }, icon('comet', 18), h('span', 'Tonight\u2019s comet')) : null,
        loved || app.marks.watchlist.size ? h('button.enter-way', { type: 'button', title: 'A few films for tonight: what the films you love pull toward you, and what you saved', onclick: () => begin(() => app.panels.open('tonight')) }, icon('moon', 17), h('span', 'Tonight, for you')) : null) : null,
      moreToggle,
      more);
    replace(more,
      way('door', 'Set out on a voyage', 'From a film you love, through doors to films you don\u2019t know yet.', () => app.panels.open('voyage')),
      way('drift', 'Drift', 'Let the sky carry you from star to star.', () => app.startDrift()),
      way('compass', 'Plot a course', 'Say what you\u2019re after, and get a route of films.', () => app.panels.open('course')),
      way('clock', 'Lookback', 'The same films arranged by year, the present at the centre.', () => { app.overview(); app.setSky('time'); }),
      way('constellation', 'Constellations', 'Figures hidden among the stars, waiting to be found.', () => app.panels.open('figures')),
      way('nebula', 'Nebulae', 'Kinds of film the atlas named, wherever they live.', () => app.panels.open('nebulae')),
      loved ? way('heart', 'Your sky', 'What you love, what you\u2019ve watched, and what it says about you.', () => app.panels.open('sky')) : null);
    showMore();
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
