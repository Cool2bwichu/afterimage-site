// The tools of the voyage: plotting a course, reading your own sky, the
// hidden constellations, the nebulae, collisions, passages, and the
// Navigator's own controls.
import { LIGHT_IDS, lightById } from '../engine/lights.mjs';
import { gravity, taste } from '../engine/voyage.mjs';
import { h, icon, replace, plural } from './dom.mjs';
import { poster } from './posters.mjs';
import { source } from './dossier.mjs';

const MOODS = [
  'Something quiet for a rainy Sunday',
  'A heist where everything goes wrong',
  'Films that feel like three in the morning',
  'Science fiction with no explosions',
  'Funny, and under a hundred minutes',
  'A film to argue about afterwards',
];

export function createPanels(app) {
  const { universe, state, films, pilot, cosmos, store } = app;
  const heading = h('h2.sheet-heading');
  const body = h('div.sheet-scroll', { tabindex: '-1' });
  const sheet = h('aside.sheet.sheet-left.tools', { hidden: true },
    h('button.sheet-grip', { type: 'button', 'aria-label': 'Make this panel taller or shorter', onclick: () => { sheet.classList.toggle('tall'); app.frameCosmos(); } }),
    h('header.sheet-top', heading, h('button.sheet-close', { type: 'button', 'aria-label': 'Close', onclick: () => close() }, icon('close', 18))),
    body);
  app.root.querySelector('#app').append(sheet);

  const memo = { course: null, courseText: '', courseState: 'idle', courseNote: '', sky: null, skyState: 'idle', skyNote: '', collide: null, passage: null, deeper: false };

  const note = (...children) => h('p.panel-note', ...children);
  const needNavigator = what => h('p.nav-off', `${what} needs the Navigator, and it is not connected.`,
    h('button.quiet', { type: 'button', onclick: () => open('navigator') }, 'Connect'));
  const reading = (text, stop) => h('div.reading', h('span.reading-pulse'), h('span', text), stop ? h('button.quiet', { type: 'button', onclick: stop }, 'Stop') : null);

  function filmRow(star, { light = null, kicker = '', bodyNode = null, onGo = null, index = null }) {
    const film = films[star];
    return h('button.frow', {
      type: 'button', style: light ? { '--c': lightById(light).color } : null, class: light ? 'has-light' : '',
      onclick: onGo || (() => app.focusStar(star)),
      onpointerenter: () => cosmos.setHover(star), onpointerleave: () => cosmos.setHover(-1),
    },
    index !== null ? h('span.frow-index', String(index)) : null,
    h('span.frow-poster', poster(film, { words: false })),
    h('span.frow-text', kicker ? h('span.frow-kicker', kicker) : null, h('span.frow-title', film.t, h('span.frow-year', String(film.y))), bodyNode),
    h('span.frow-go', icon('arrow', 15)));
  }

  // ── Plot a course.
  function renderCourse() {
    heading.textContent = 'Plot a course';
    const loved = [...app.marks.loved];
    const text = h('textarea.panel-input', { rows: '3', maxlength: '500', placeholder: 'What are you in the mood for?', 'aria-label': 'What are you in the mood for?' });
    text.value = memo.courseText;
    text.addEventListener('input', () => { memo.courseText = text.value; });
    const steer = h('input', { type: 'checkbox', id: 'steer', checked: loved.length > 0 });
    const moods = h('div.mood-chips', MOODS.map(mood => h('button.chip', { type: 'button', onclick: () => { text.value = mood; memo.courseText = mood; text.focus(); } }, mood)));
    const asking = memo.courseState === 'asking';

    async function plot() {
      const request = text.value.trim();
      const steerBy = steer.checked ? loved : [];
      if (!request && !steerBy.length) { memo.courseNote = 'Say what you are in the mood for, or mark a film you love.'; renderCourse(); return; }
      memo.courseState = 'asking';
      memo.courseNote = '';
      memo.course = null;
      renderCourse();
      try {
        const seen = [...app.marks.seen, ...app.marks.visited];
        memo.course = await pilot.course({ request, loved: steerBy, seen: [...new Set(seen)] }, {
          onDraft: draft => { memo.course = { ...draft, draft: true }; if (state.tool?.name === 'course') renderCourse(); },
        });
        memo.courseState = 'done';
      } catch (error) {
        memo.courseState = 'idle';
        memo.courseNote = pilot.explain(error);
      }
      if (state.tool?.name === 'course') renderCourse();
    }

    function fromChart() {
      const pulled = gravity(universe, loved, { exclude: app.marks.seen, k: 5, deeper: 0.6 });
      memo.course = {
        name: 'By your own gravity', heading: 'The five films the chart places nearest to everything you love.', source: 'chart',
        waypoints: pulled.map(entry => ({ star: entry.star, why: `Pulled by ${entry.pulls.map(pull => films[pull.from].t).join(' and ')}.`, leg: '' })),
      };
      memo.courseState = 'done';
      renderCourse();
    }

    const nodes = [
      note('Tell the Navigator what you want from tonight. It plots a short voyage: five films in an order that makes sense, from the chart or from far beyond it.'),
      text, moods,
      loved.length ? h('label.check', { for: 'steer' }, steer, h('span', `Steer by the ${plural(loved.length, 'film')} I love`)) : null,
    ];
    if (asking) nodes.push(reading(memo.course ? 'Plotting the next leg' : 'The Navigator is plotting', () => { pilot.cancel('tool'); memo.courseState = memo.course ? 'done' : 'idle'; renderCourse(); }));
    else if (pilot.connected) nodes.push(h('button.act.act-primary', { type: 'button', onclick: plot }, icon('compass', 17), h('span', memo.course ? 'Plot another' : 'Plot the course')));
    else {
      nodes.push(needNavigator('A plotted course'));
      if (loved.length) nodes.push(h('button.act', { type: 'button', onclick: fromChart }, icon('compass', 17), h('span', 'Take a course from the chart instead')));
    }
    if (memo.courseNote) nodes.push(h('p.panel-error', memo.courseNote));

    const course = memo.course;
    if (course) {
      const stops = course.waypoints.map(point => ({ star: point.star, light: null, note: point.leg || point.why }));
      nodes.push(h('div.course',
        h('p.course-kicker', 'The course', source(course.source === 'chart' ? 'chart' : 'claude'), course.draft ? h('span.developing', 'developing') : null),
        h('h3.course-name', course.name || 'A course'),
        course.heading ? h('p.course-heading', course.heading) : null,
        course.waypoints.map((point, n) => filmRow(point.star, {
          index: n + 1,
          bodyNode: [point.why ? h('span.frow-claim', point.why) : null, point.leg ? h('span.frow-watch', h('em', 'From the last: '), point.leg) : null,
            universe.isDeep(point.star) ? h('span.frow-shared', 'beyond the chart') : null],
          onGo: () => { follow(course, stops, n); },
        })),
        !course.draft && stops.length > 1 ? h('button.act.act-primary', { type: 'button', onclick: () => follow(course, stops, 0) }, icon('arrow', 17), h('span', 'Begin the voyage')) : null));
    }
    replace(body, nodes);
  }

  function follow(course, stops, n) {
    if (!state.voyage || state.voyage.name !== course.name) app.beginVoyage({ kind: 'course', name: course.name || 'A course', heading: course.heading || '', stops, source: course.source || 'claude' });
    app.voyageTo(n);
    if (app.small) close();
  }

  // ── Your sky.
  function renderSky() {
    heading.textContent = 'Your sky';
    const loved = [...app.marks.loved];
    if (!loved.length) {
      replace(body,
        note('Your sky is made of the films you love. Mark one with the heart and it becomes a fixed star here; its gravity pulls other films toward you.'),
        h('button.act', { type: 'button', onclick: () => app.searchView.open({ title: 'A film you love', pick: star => { app.toggle('loved', star); open('sky'); } }) }, icon('heart', 17), h('span', 'Name a film you love')));
      return;
    }
    const measured = taste(universe, loved);
    const pulled = gravity(universe, loved, { exclude: app.marks.seen, k: 9, deeper: memo.deeper ? 1 : 0.2 });
    const nodes = [
      h('div.loved-grid', loved.slice(-18).reverse().map(star => h('button.loved', { type: 'button', title: `${films[star].t} (${films[star].y})`, onclick: () => app.focusStar(star) }, poster(films[star])))),
      h('div.panel-actions',
        h('button.act', { type: 'button', onclick: () => app.searchView.open({ title: 'A film you love', pick: star => { if (!app.marks.loved.has(star)) app.toggle('loved', star); open('sky'); } }) }, icon('plus', 16), h('span', 'Add a film')),
        h('button.act', { type: 'button', onclick: () => { app.setCurrent({ kind: 'sky', id: 0, label: 'Your sky', note: 'the films you love, and what they pull toward you', stars: new Set([...loved, ...pulled.map(entry => entry.star)]), colour: '#f0c987' }); app.widen(); } }, icon('eye', 16), h('span', 'Light it up'))),
    ];

    if (loved.length >= 2) {
      nodes.push(h('h3.panel-title', 'What your films share', source('chart')),
        h('div.taste-lights', measured.lights.slice(0, 6).map(entry => h('div.taste-light', { style: { '--c': lightById(entry.light).color, '--w': `${Math.round(entry.share * 100)}%` } },
          h('span.taste-name', lightById(entry.light).name), h('span.taste-bar')))),
        measured.threads.length ? h('div.trait-chips', measured.threads.slice(0, 10).map(thread => h('button.chip', { type: 'button', style: { '--c': lightById(thread.light).color }, class: 'tinted', onclick: () => app.showTrait(thread.trait) },
          universe.traits[thread.trait].s || universe.traits[thread.trait].t, h('span.chip-n', String(thread.films))))) : null);
    }

    // The Navigator's reading of this sky.
    const sky = memo.sky;
    if (sky && (sky.name || sky.reading)) {
      nodes.push(h('div.skyread',
        h('p.course-kicker', 'The Navigator reads your sky', source('claude'), memo.skyState === 'asking' ? h('span.developing', 'developing') : null),
        sky.name ? h('h3.course-name', sky.name) : null,
        sky.reading ? h('p.skyread-text', sky.reading) : null,
        sky.blind ? h('p.skyread-blind', h('em', 'Not yet in your sky: '), sky.blind) : null,
        (sky.next || []).map((entry, n) => filmRow(entry.star, { kicker: ['The safe bet', 'A step further', 'The long reach'][n] || '', bodyNode: entry.why ? h('span.frow-claim', entry.why) : null }))));
    }
    if (memo.skyState === 'asking') nodes.push(reading('The Navigator is reading your sky', () => { pilot.cancel('tool'); memo.skyState = 'idle'; renderSky(); }));
    else if (loved.length >= 2) {
      nodes.push(pilot.connected
        ? h('button.act.act-primary', { type: 'button', onclick: readSky }, icon('spark', 17), h('span', sky ? 'Read it again' : 'Have the Navigator read your sky'))
        : needNavigator('A reading of your sky'));
    } else nodes.push(note('Love one more film and the Navigator can read your sky.'));
    if (memo.skyNote) nodes.push(h('p.panel-error', memo.skyNote));

    nodes.push(h('h3.panel-title', 'Pulled toward you', source('chart')),
      note('The films nearest to everything you love at once. The more of your films pull on one, the nearer it comes.'),
      h('label.check', h('input', { type: 'checkbox', checked: memo.deeper, onchange: event => { memo.deeper = event.target.checked; renderSky(); } }), h('span', 'Lean toward the little-seen')),
      pulled.map(entry => filmRow(entry.star, { bodyNode: h('span.frow-shared', `Pulled by ${entry.pulls.map(pull => films[pull.from].t).join(' and ')}`) })));
    replace(body, nodes);
  }

  async function readSky() {
    memo.skyState = 'asking';
    memo.skyNote = '';
    renderSky();
    try {
      memo.sky = await pilot.sky([...app.marks.loved], { onDraft: draft => { memo.sky = draft; if (state.tool?.name === 'sky') renderSky(); } });
    } catch (error) {
      memo.skyNote = pilot.explain(error);
    }
    memo.skyState = 'idle';
    if (state.tool?.name === 'sky') renderSky();
  }

  // ── Constellations.
  function renderFigures() {
    heading.textContent = 'Constellations';
    const progress = app.progress();
    const figures = universe.bundle.constellations;
    const found = progress.filter(entry => entry.found);
    const forming = progress.filter(entry => !entry.found && entry.seen === 2);
    const traitName = trait => universe.traits[trait].t;
    replace(body,
      note(`${figures.length} figures are hidden in this chart. Each joins films that share two things which seldom travel together. A figure shows itself when three of its stars are in your wake.`),
      h('p.figure-count', h('strong', String(found.length)), ` found · ${figures.length - found.length} still hidden`),
      found.length ? h('h3.panel-title', 'Found') : null,
      found.map(entry => {
        const figure = figures[entry.id];
        return h('button.figure', { type: 'button', class: state.current?.kind === 'constellation' && state.current.id === entry.id ? 'on' : '', onclick: () => app.showConstellation(entry.id) },
          h('span.figure-name', figure.name),
          h('span.figure-what', figure.traits.map(traitName).join(' · ')),
          h('span.figure-seen', `${entry.seen} of ${entry.total} stars visited`));
      }),
      forming.length ? h('h3.panel-title', 'Forming') : null,
      forming.map(entry => {
        const figure = figures[entry.id];
        return h('div.figure.forming',
          h('span.figure-name', 'An unnamed figure'),
          h('span.figure-what', `Two of its ${entry.total} stars are in your wake. It has something to do with ${traitName(figure.traits[0])}.`));
      }),
      !found.length && !forming.length ? note('None yet. Keep travelling: follow the rays, change the light, and they will come.') : null);
  }

  // ── Nebulae.
  function renderNebulae() {
    heading.textContent = 'Nebulae';
    const registers = universe.bundle.registers;
    const sizes = new Array(registers.length).fill(0);
    for (const film of films) for (const index of film.rg || []) sizes[index] += 1;
    replace(body,
      note('Nebulae drift across the galaxies: kinds of film the ATLAS named, wherever they happen to live. Choose one to light its films.'),
      registers.map((register, index) => (sizes[index] ? h('button.nebula', {
        type: 'button', style: { '--c': register.hue }, class: state.current?.kind === 'register' && state.current.id === index ? 'on' : '',
        onclick: () => { app.showRegister(index); if (app.small) close(); },
      }, h('span.nebula-swatch'), h('span.nebula-text', h('span.nebula-name', register.label, h('span.chip-n', String(sizes[index]))), h('span.nebula-blurb', register.blurb))) : null)));
  }

  // ── Collide two films.
  function renderCollide(data) {
    heading.textContent = 'Collision';
    if (data && data.a !== undefined) memo.collide = { a: data.a, b: -1, between: [], result: null, state: 'idle', note: '' };
    const c = memo.collide;
    if (!c) { replace(body, note('Choose a star first, then collide it with another.')); return; }
    const choose = () => app.searchView.open({ title: `Collide ${films[c.a].t} with…`, pick: star => { if (star === c.a) return; c.b = star; c.result = null; c.note = ''; c.between = app.between(c.a, c.b); open('collide'); run(); } });

    async function run() {
      if (!pilot.connected || c.b < 0) return;
      c.state = 'asking';
      renderCollide();
      try { c.result = await pilot.collide(c.a, c.b); } catch (error) { c.note = pilot.explain(error); }
      c.state = 'idle';
      if (state.tool?.name === 'collide') renderCollide();
    }

    const pair = h('div.pair',
      h('button.pair-film', { type: 'button', onclick: () => app.focusStar(c.a) }, poster(films[c.a]), h('span', films[c.a].t)),
      h('span.pair-x', '×'),
      c.b >= 0
        ? h('button.pair-film', { type: 'button', onclick: choose }, poster(films[c.b]), h('span', films[c.b].t))
        : h('button.pair-film.empty', { type: 'button', onclick: choose }, h('span.pair-empty', icon('plus', 22)), h('span', 'Choose a film')));
    const nodes = [note('Set two films on a collision course and see what stands between them.'), pair];
    if (c.b >= 0) {
      if (c.state === 'asking') nodes.push(reading('The Navigator is looking for the film between them', () => { pilot.cancel('tool'); }));
      if (c.result) {
        const film = films[c.result.star];
        nodes.push(h('div.collision',
          h('p.course-kicker', 'The film between', source('claude')),
          filmRow(c.result.star, { bodyNode: universe.isDeep(c.result.star) ? h('span.frow-shared', 'beyond the chart') : null }),
          c.result.fromA ? h('p.collision-from', h('em', `From ${films[c.a].t}: `), c.result.fromA) : null,
          c.result.fromB ? h('p.collision-from', h('em', `From ${films[c.b].t}: `), c.result.fromB) : null,
          c.result.spark ? h('p.collision-spark', c.result.spark) : null,
          h('button.act.act-primary', { type: 'button', onclick: () => app.focusStar(c.result.star) }, icon('arrow', 17), h('span', `Go to ${film.t}`))));
      } else if (!pilot.connected) nodes.push(needNavigator('Naming the film between them'));
      if (c.note) nodes.push(h('p.panel-error', c.note));
      if (c.between.length) {
        nodes.push(h('h3.panel-title', 'What the chart finds between them', source('chart')),
          c.between.map(entry => filmRow(entry.star, { bodyNode: h('span.frow-shared', 'near both on the chart') })));
      }
    }
    replace(body, nodes);
  }

  // ── A passage between two films.
  function renderPassage(data) {
    heading.textContent = 'Passage';
    if (data && data.a !== undefined) memo.passage = { a: data.a, b: -1 };
    const p = memo.passage;
    if (!p) { replace(body, note('Choose a star first, then a passage from it to another.')); return; }
    const choose = () => app.searchView.open({ title: `A passage from ${films[p.a].t} to…`, pick: star => { if (star === p.a) return; p.b = star; app.plotPassage(p.a, p.b); open('passage'); } });
    const nodes = [note('A passage is the chain of films that leads from one to another: each step goes to a near neighbour, so nothing along the way is a leap.'),
      h('div.pair',
        h('button.pair-film', { type: 'button', onclick: () => app.focusStar(p.a) }, poster(films[p.a]), h('span', films[p.a].t)),
        h('span.pair-x', '→'),
        p.b >= 0
          ? h('button.pair-film', { type: 'button', onclick: choose }, poster(films[p.b]), h('span', films[p.b].t))
          : h('button.pair-film.empty', { type: 'button', onclick: choose }, h('span.pair-empty', icon('plus', 22)), h('span', 'Choose a film')))];
    const voyage = state.voyage && state.voyage.kind === 'passage' ? state.voyage : null;
    if (voyage) {
      nodes.push(h('p.course-kicker', 'The passage', source('chart')), h('p.course-heading', voyage.heading),
        voyage.stops.map((stop, n) => filmRow(stop.star, {
          index: n + 1, light: stop.light,
          bodyNode: stop.note ? h('span.frow-shared', `${lightById(stop.light).name}: ${stop.note}`) : null,
          onGo: () => { app.voyageTo(n); if (app.small) close(); },
        })),
        h('button.act.act-primary', { type: 'button', onclick: () => { app.voyageTo(0); if (app.small) close(); } }, icon('arrow', 17), h('span', 'Travel it')));
    }
    replace(body, nodes);
  }

  // ── The Navigator.
  function renderNavigator() {
    heading.textContent = 'The Navigator';
    const status = pilot.status;
    const nodes = [
      h('div.nav-status', { dataset: { mode: status.mode } }, h('span.nav-dot'), h('div', h('p.nav-status-label', status.label), h('p.nav-status-detail', status.detail))),
      note('The chart is computed: 2,204 films, placed by what they are recorded as sharing. The Navigator is Claude Opus 5.5, who has seen the films. It reads each star as you arrive, plots courses, names the film between two films, and charts films the chart does not hold.'),
    ];
    if (pilot.connected) {
      nodes.push(h('label.check', h('input', { type: 'checkbox', checked: state.readArrivals, onchange: event => { state.readArrivals = event.target.checked; } }), h('span', 'Read every star I arrive at')));
      if (status.mode === 'inpage') nodes.push(note('Claude answers from inside this page, on your own Claude account, so each reading uses a little of your usage. Drifting never asks it anything.'));
      if (status.mode === 'companion') nodes.push(h('button.act', { type: 'button', onclick: () => { pilot.disconnect(); renderNavigator(); } }, h('span', 'Disconnect the companion')));
    } else if (status.mode !== 'connecting') {
      const url = h('input.panel-input', { type: 'url', placeholder: 'https://your-companion.example', 'aria-label': 'Companion address', value: store.state.companion?.url || '' });
      const pass = h('input.panel-input', { type: 'password', placeholder: 'Passphrase', 'aria-label': 'Companion passphrase', autocomplete: 'off' });
      const error = h('p.panel-error');
      const button = h('button.act.act-primary', { type: 'button', onclick: async () => {
        error.textContent = '';
        button.disabled = true;
        try { await pilot.connect({ url: url.value.trim(), passphrase: pass.value }); renderNavigator(); } catch (problem) { error.textContent = pilot.explain(problem) || 'The companion did not answer.'; }
        button.disabled = false;
      } }, h('span', 'Connect'));
      nodes.push(h('h3.panel-title', 'Connect a companion'),
        note('The AFTERIMAGE companion is a small server that speaks to Claude with its owner\'s own credentials. Give its address and passphrase to bring the Navigator aboard. They are kept in this browser only.'),
        url, pass, button, error);
    }
    const beyond = universe.count - universe.base;
    nodes.push(h('h3.panel-title', 'Your log'),
      note(`${plural(app.marks.visited.size, 'star')} visited, ${plural(app.marks.loved.size, 'film')} loved, ${plural(state.found.size, 'constellation')} found, ${plural(beyond, 'film')} charted beyond the chart. All of it is kept in this browser.`),
      forget());
    replace(body, nodes);
  }

  function forget() {
    const button = h('button.quiet', { type: 'button', onclick: () => {
      if (button.dataset.sure) { store.clear(); window.location.hash = ''; window.location.reload(); return; }
      button.dataset.sure = '1';
      button.textContent = 'Forget everything? Choose again to confirm';
    } }, 'Forget my voyage');
    return h('p.panel-note', button);
  }

  const RENDER = { course: renderCourse, sky: renderSky, figures: renderFigures, nebulae: renderNebulae, collide: renderCollide, passage: renderPassage, navigator: renderNavigator };

  function open(name, data) {
    if (!RENDER[name]) return;
    state.tool = { name };
    sheet.hidden = false;
    sheet.dataset.tool = name;
    RENDER[name](data);
    if (data !== undefined || !sheet.classList.contains('on')) body.scrollTop = 0;
    requestAnimationFrame(() => sheet.classList.add('on'));
    app.frameCosmos();
    app.refresh('tool');
  }

  function close() {
    state.tool = null;
    sheet.classList.remove('on', 'tall');
    sheet.hidden = true;
    app.frameCosmos();
    app.refresh('tool');
  }

  app.on(what => {
    if (!state.tool) return;
    const name = state.tool.name;
    if (what === 'marks' && (name === 'sky' || name === 'figures' || name === 'course')) RENDER[name]();
    else if (what === 'navigator') RENDER[name]();
    else if (what === 'current' && (name === 'figures' || name === 'nebulae')) RENDER[name]();
    else if (what === 'voyage' && name === 'passage') RENDER[name]();
    else if (what === 'focus' && name === 'figures') RENDER[name]();
  });

  return {
    open, close,
    toggle(name) { if (state.tool?.name === name) close(); else open(name); },
    width: () => (sheet.hidden || app.small ? 0 : sheet.getBoundingClientRect().width),
    height: () => (sheet.hidden || !app.small ? 0 : sheet.getBoundingClientRect().height),
  };
}
