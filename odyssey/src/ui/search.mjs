// Finding things: a film on the chart, a current that runs through many
// films, a galaxy, or a film the chart does not hold, which the Navigator can
// chart on the spot.
import { LIGHT_IDS, lightById } from '../engine/lights.mjs';
import { UNLIT } from '../engine/universe.mjs';
import { fold, seek } from '../engine/search.mjs';
import { h, icon, replace, plural } from './dom.mjs';
import { poster } from './posters.mjs';

export function createSearchView(app) {
  const { universe, state, films, pilot, search } = app;
  const input = h('input.search-input', {
    type: 'search', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Find a film', placeholder: 'A film, a maker, a mood…',
    role: 'combobox', 'aria-autocomplete': 'list', 'aria-controls': 'find-results', 'aria-expanded': 'false',
  });
  const title = h('p.search-title');
  const results = h('div.search-results', { role: 'listbox', id: 'find-results', 'aria-label': 'Results' });
  // Where the keys are told, for anyone with a keyboard to hand.
  const keys = h('p.search-keys', 'Press ', h('kbd', '?'), ' at any time for every key');
  const box = h('div.search-box', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Find' },
    title,
    h('div.search-field', icon('search', 20), input, h('button.search-close', { type: 'button', 'aria-label': 'Close', onclick: () => close() }, icon('close', 18))),
    results, keys);
  const scrim = h('div.search-scrim', { hidden: true, onpointerdown: event => { if (event.target === scrim) close(); } }, box);
  app.root.querySelector('#app').append(scrim);

  let pick = null;
  let items = [];
  let active = 0;

  function row(item, n) {
    const element = h('button.search-row', { type: 'button', role: 'option', id: `find-option-${n}`, class: item.kind, onclick: () => choose(n), onpointerenter: () => setActive(n) }, item.render());
    return element;
  }

  function setActive(n) {
    active = n;
    const rows = [...results.querySelectorAll('.search-row')];
    rows.forEach((element, index) => { element.classList.toggle('on', index === n); element.setAttribute('aria-selected', String(index === n)); });
    if (rows[n]) input.setAttribute('aria-activedescendant', rows[n].id);
    else input.removeAttribute('aria-activedescendant');
  }

  function choose(n) {
    const item = items[n];
    if (!item) return;
    // What the box was opened to pick for is held before closing it, which forgets it.
    const picking = pick;
    close();
    item.go(picking);
  }

  function render() {
    const query = input.value.trim();
    items = [];
    const groups = [];
    if (!query) {
      // Nothing typed: offer the wake, and the heart of the present galaxy.
      const recent = [...new Set(app.store.state.wake.slice().reverse().map(app.starOf).filter(i => i >= 0))].slice(0, 6);
      if (recent.length) groups.push(['Where you have been', recent.map(star => filmItem(star))]);
      else {
        const doors = [];
        for (const galaxy of universe.galaxies[state.sky] || []) doors.push(galaxy.doors[0]);
        groups.push(['Somewhere to begin', doors.slice(0, 7).map(star => filmItem(star))]);
      }
    } else {
      const found = search.films(query, 8);
      const beyond = found.filter(({ star }) => universe.isDeep(star)).length;
      const heading = pick ? 'Films' : !beyond ? 'On the chart' : beyond === found.length ? 'Found beyond the chart' : 'On the chart, and found beyond it';
      if (found.length) groups.push([heading, found.map(({ star }) => filmItem(star))]);
      let kind = false;
      if (!pick) {
        const traits = search.traits(query, 4);
        kind = traits.some(entry => entry.score >= 3);
        if (traits.length) groups.push(['Currents: light up every film that shares it', traits.map(({ trait }) => traitItem(trait))]);
        const folded = fold(query);
        const galaxies = (universe.galaxies[state.sky] || []).filter(galaxy => fold(galaxy.name).includes(folded)).slice(0, 3);
        if (galaxies.length) groups.push(['Galaxies', galaxies.map(galaxyItem)]);
      }
      const exact = found.length && seek(films[found[0].star].t) === seek(query);
      // A kind of film the chart already knows is not a film to chart from memory.
      if (query.length >= 2 && !exact && !(kind && !found.length)) groups.push(['Beyond the chart', [beyondItem(query)]]);
    }
    const nodes = [];
    for (const [name, list] of groups) {
      if (!list.length) continue;
      nodes.push(h('p.search-group', name));
      for (const item of list) { nodes.push(row(item, items.length)); items.push(item); }
    }
    if (!nodes.length) nodes.push(h('p.search-empty', 'Nothing on the chart answers to that.'));
    replace(results, nodes);
    keys.hidden = Boolean(query) || Boolean(pick);
    setActive(Math.min(active, Math.max(0, items.length - 1)));
    input.setAttribute('aria-expanded', String(items.length > 0));
  }

  function filmItem(star) {
    const film = films[star];
    return {
      kind: 'film',
      go: picking => (picking ? picking(star) : app.focusStar(star)),
      render: () => {
        const g = universe.galaxyOf[state.sky][star];
        const galaxy = g !== UNLIT ? universe.galaxies[state.sky][g] : null;
        return [
          h('span.search-poster', poster(film, { words: false })),
          h('span.search-text', h('span.search-name', film.t, h('span.frow-year', String(film.y))),
            h('span.search-sub', [film.d, universe.isDeep(star) ? 'charted from memory' : galaxy ? galaxy.name : ''].filter(Boolean).join(' · '))),
        ];
      },
    };
  }

  function traitItem(trait) {
    const record = universe.traits[trait];
    const light = lightById(LIGHT_IDS[record.l]);
    return {
      kind: 'trait',
      go: () => app.showTrait(trait),
      render: () => [
        h('span.search-dot', { style: { '--c': light.color } }),
        h('span.search-text', h('span.search-name', record.t), h('span.search-sub', `${light.name} · ${plural(record.df || 0, 'film')}`)),
      ],
    };
  }

  function galaxyItem(galaxy) {
    return {
      kind: 'galaxy',
      go: () => app.openGalaxy(galaxy.g),
      render: () => [
        h('span.search-dot.ring', { style: { '--c': lightById(state.sky).color } }),
        h('span.search-text', h('span.search-name', galaxy.name), h('span.search-sub', `A galaxy of ${plural(galaxy.size, 'film')} · ${galaxy.thesis}`)),
      ],
    };
  }

  function beyondItem(query) {
    const connected = pilot.connected;
    return {
      kind: 'beyond',
      go: async picking => {
        if (!connected) { app.panels.open('navigator'); return; }
        const star = await app.chartFilm(query);
        if (star >= 0 && picking) picking(star);
      },
      render: () => [
        h('span.search-dot.spark', icon('spark', 18)),
        h('span.search-text', h('span.search-name', `Chart “${query}”`),
          h('span.search-sub', connected ? 'Not on the chart? The Navigator will chart it from memory and give it a place among the stars.' : 'Films beyond the chart need the Navigator. Choose this to connect it.')),
      ],
    };
  }

  function open(options = {}) {
    pick = options.pick || null;
    title.textContent = options.title || '';
    title.hidden = !options.title;
    input.placeholder = options.placeholder || 'A film, a maker, a mood…';
    input.value = options.query || '';
    active = 0;
    scrim.hidden = false;
    requestAnimationFrame(() => { scrim.classList.add('on'); input.focus(); });
    render();
  }

  function close() {
    scrim.classList.remove('on');
    scrim.hidden = true;
    pick = null;
  }

  input.addEventListener('input', () => { active = 0; render(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(Math.min(items.length - 1, active + 1)); results.querySelector('.search-row.on')?.scrollIntoView({ block: 'nearest' }); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(Math.max(0, active - 1)); results.querySelector('.search-row.on')?.scrollIntoView({ block: 'nearest' }); }
    else if (event.key === 'Enter') { event.preventDefault(); choose(active); }
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
  });

  return { open, close, isOpen: () => !scrim.hidden };
}
