// The tools of the voyage: setting out, plotting a course, a list of any set
// of films, your own sky and journal, the constellations, the nebulae,
// collisions, passages, and the Navigator's own controls.
import { lightById } from '../engine/lights.mjs';
import { gravity, taste } from '../engine/voyage.mjs';
import { rankSet, trail } from '../engine/journey.mjs';
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
const PAGE = 30;
const ORDERS = [
  ['truest', 'Truest', 'The films that carry it most fully first'],
  ['yours', 'For you', 'The films the ones you love pull hardest first'],
  ['unfamiliar', 'Less known', 'The truest, leaning toward films fewer people know'],
];
const SKY_TABS = [['loved', 'Loved'], ['watchlist', 'Watchlist'], ['seen', 'Watched'], ['voyages', 'Voyages'], ['aside', 'Set aside'], ['journal', 'Journal']];
const BACK_TO = { figures: 'Constellations', nebulae: 'Nebulae', sky: 'Your sky', voyage: 'Set out' };

export function createPanels(app) {
  const { universe, state, films, pilot, cosmos, store } = app;
  const heading = h('h2.sheet-heading');
  const body = h('div.sheet-scroll', { tabindex: '-1' });
  const sheet = h('aside.sheet.sheet-left.tools', { hidden: true },
    h('button.sheet-grip', { type: 'button', 'aria-label': 'Make this panel taller or shorter', onclick: () => { sheet.classList.toggle('tall'); app.frameCosmos(); } }),
    h('header.sheet-top', heading, h('button.sheet-close', { type: 'button', 'aria-label': 'Close', onclick: () => close() }, icon('close', 18))),
    body);
  app.root.querySelector('#app').append(sheet);
  sheet.addEventListener('transitionend', event => { if (event.target === sheet && event.propertyName === 'height') app.frameCosmos(); });

  const memo = {
    course: null, courseText: '', courseState: 'idle', courseNote: '', sky: null, skyState: 'idle', skyNote: '', collide: null, passage: null, deeper: false,
    list: { key: '', order: 'truest', hideWatched: false, shown: PAGE, ranked: null, rankKey: '', scroll: 0 },
    back: null, skyTab: 'loved', journalNote: '', journalError: '', journalText: '',
  };

  const note = (...children) => h('p.panel-note', ...children);
  const title = (...children) => h('h3.panel-title', ...children);
  const traitName = trait => universe.traits[trait].s || universe.traits[trait].t;
  const needNavigator = what => (pilot.canConnect
    ? h('p.nav-off', `${what} needs the Navigator, and it is not connected.`, h('button.quiet', { type: 'button', onclick: () => open('navigator') }, 'Connect'))
    : h('p.nav-off', `${what} needs the Navigator, and Claude is not answering in this view.`));
  const reading = (text, stop) => h('div.reading', h('span.reading-pulse'), h('span', text), stop ? h('button.quiet', { type: 'button', onclick: stop }, 'Stop') : null);
  /** Goes to a film from a list; on a phone the list steps aside so the film can be seen. */
  const go = (star, how = {}) => { if (app.small) { memo.list.scroll = body.scrollTop; close(); } app.focusStar(star, how); };

  function filmRow(star, { light = null, kicker = '', bodyNode = null, onGo = null, index = null, extra = null }) {
    const film = films[star];
    return h('button.frow', {
      type: 'button', style: light ? { '--c': lightById(light).color } : null, class: light ? 'has-light' : '',
      onclick: onGo || (() => app.focusStar(star)),
      onpointerenter: () => cosmos.setHover(star), onpointerleave: () => cosmos.setHover(-1),
    },
    index !== null ? h('span.frow-index', String(index)) : null,
    h('span.frow-poster', poster(film, { words: false })),
    h('span.frow-text', kicker ? h('span.frow-kicker', kicker) : null, h('span.frow-title', film.t, h('span.frow-year', String(film.y))), bodyNode),
    extra,
    h('span.frow-go', icon('arrow', 15)));
  }
  const posterButton = (star, onclick, extra = '') => h('button.loved', {
    type: 'button', title: `${films[star].t} (${films[star].y})${extra}`, onclick,
    onpointerenter: () => cosmos.setHover(star), onpointerleave: () => cosmos.setHover(-1),
  }, poster(films[star]));
  /** Small marks on a row: loved, saved, watched. */
  const badges = star => {
    const marks = [];
    if (app.marks.loved.has(star)) marks.push(h('span.badge.badge-loved', { title: 'You love it' }, icon('heart', 12)));
    if (app.marks.watchlist.has(star)) marks.push(h('span.badge.badge-saved', { title: 'On your watchlist' }, icon('bookmark', 12)));
    if (app.marks.seen.has(star)) marks.push(h('span.badge.badge-seen', { title: 'You have watched it' }, icon('check', 12)));
    return marks.length ? h('span.badges', marks) : null;
  };

  // ── Set out: a voyage, one door at a time.
  function renderVoyage() {
    const j = state.journey;
    if (!j) renderSetOut();
    else if (j.landed) renderLanded(j);
    else renderUnderWay(j);
  }

  function renderSetOut() {
    heading.textContent = 'Set out';
    const loved = [...store.state.loved].reverse().map(app.starOf).filter(i => i >= 0 && !app.marks.hidden.has(i)).slice(0, 12);
    const wake = [];
    for (const slug of [...store.state.wake].reverse()) {
      const star = app.starOf(slug);
      if (star >= 0 && !wake.includes(star) && !loved.includes(star)) wake.push(star);
      if (wake.length >= 6) break;
    }
    const nodes = [note('A voyage begins at a film and goes somewhere. At every star three doors open, each under its own light, each a film near this one and a little further from where you began. Take doors until one feels like tonight\'s film, then land.')];
    if (state.focus >= 0) {
      const film = films[state.focus];
      nodes.push(h('button.setout-here', { type: 'button', onclick: () => app.setOut(state.focus) },
        h('span.setout-poster', poster(film, { words: false })),
        h('span.setout-text', h('span.setout-kicker', 'From the film you are at'), h('span.setout-title', film.t, h('span.frow-year', String(film.y)))),
        h('span.setout-go', icon('door', 18))));
    }
    nodes.push(h('div.panel-actions', h('button.act', { type: 'button', onclick: () => app.searchView.open({ title: 'Set out from…', pick: star => app.setOut(star) }) }, icon('search', 16), h('span', 'Name a film to set out from'))));
    if (loved.length) nodes.push(title('From a film you love'), h('div.loved-grid', loved.map(star => posterButton(star, () => app.setOut(star)))));
    if (wake.length) nodes.push(title('From where you have been'), h('div.loved-grid', wake.map(star => posterButton(star, () => app.setOut(star)))));
    if (!loved.length && !wake.length) {
      // Someone who has found nothing yet sets out from a film many people know, one from each of the largest galaxies.
      const galaxies = [...(universe.galaxies[state.sky] || [])].sort((a, b) => b.size - a.size).slice(0, 6);
      const known = galaxies.map(galaxy => galaxy.doors.find(star => !app.notFor.has(star))).filter(star => star !== undefined);
      if (known.length) nodes.push(title('From a film many people know'), h('div.loved-grid', known.map(star => posterButton(star, () => app.setOut(star)))));
    }
    nodes.push(title('Or have a course plotted'),
      note('Tell the Navigator what tonight is for, and it plots five films in an order that makes sense.'),
      h('div.panel-actions', h('button.act', { type: 'button', onclick: () => open('course') }, icon('compass', 16), h('span', 'Plot a course'))));
    const kept = store.state.routes.filter(route => route.kind === 'voyage').slice(-5).reverse();
    if (kept.length) nodes.push(title('Voyages you have landed'), kept.map(routeRow));
    replace(body, nodes);
  }

  function legNote(stop) {
    if (!stop.light) return '';
    const shared = (stop.shared || []).map(entry => traitName(entry.trait));
    return `${lightById(stop.light).name}${shared.length ? ` · both: ${shared.join(' · ')}` : ''}`;
  }

  function track(j) {
    const at = j.path.length - 1;
    return h('div.vtrack', { 'aria-label': 'The voyage so far' }, j.path.map((stop, n) => [
      n ? h('span.vtrack-leg', { style: { '--c': j.landed ? '#f0c987' : lightById(stop.light || 'white').color }, title: legNote(stop) }) : null,
      h('button.vtrack-stop', {
        type: 'button', class: n === at ? 'on' : '', title: `${films[stop.star].t} (${films[stop.star].y})`,
        onclick: () => app.focusStar(stop.star),
        onpointerenter: () => cosmos.setHover(stop.star), onpointerleave: () => cosmos.setHover(-1),
      }, poster(films[stop.star], { words: false })),
    ]));
  }

  function homeGauge(j, value) {
    const origin = films[j.origin];
    const percent = Math.round(value * 100);
    return h('div.vhome', { style: { '--w': `${percent}%` } },
      h('span.vhome-label', `How much of ${origin.t} is still here`),
      h('span.vhome-bar'),
      h('span.vhome-value', `${percent}%`));
  }

  function renderUnderWay(j) {
    heading.textContent = j.path.length > 1 ? 'Under way' : 'Setting out';
    const last = j.path[j.path.length - 1];
    const film = films[last.star];
    const nodes = [track(j)];
    if (j.path.length > 1) nodes.push(homeGauge(j, app.homeOf()));
    nodes.push(h('div.vnow',
      h('span.vnow-kicker', j.path.length > 1 ? 'You are at' : 'Setting out from'),
      h('span.vnow-title', film.t, h('span.frow-year', String(film.y))),
      j.path.length > 1 ? h('span.vnow-leg', { style: { '--c': lightById(last.light || 'white').color } }, legNote(last)) : null));
    if (state.focus !== last.star) {
      nodes.push(h('p.panel-note', 'You have stepped off the voyage to look around.',
        h('button.quiet', { type: 'button', onclick: () => app.focusStar(last.star) }, `Return to ${film.t}`)));
    }
    nodes.push(title('Three doors'));
    if (j.doors.length) {
      nodes.push(note('Each opens under its own light onto a film near this one. The one that keeps less of home leads further out.'),
        h('div.vdoors', j.doors.map((door, n) => {
          const light = lightById(door.light);
          const other = films[door.star];
          const shared = door.shared.map(entry => traitName(entry.trait));
          return h('button.vdoor', {
            type: 'button', style: { '--c': light.color }, onclick: () => app.takeDoor(n),
            onpointerenter: () => cosmos.setHover(door.star), onpointerleave: () => cosmos.setHover(-1),
          },
          h('span.vdoor-light', `${light.name} · ${light.asks.toLowerCase()}`),
          h('span.vdoor-poster', poster(other, { words: false })),
          h('span.vdoor-text',
            h('span.vdoor-title', other.t, h('span.frow-year', String(other.y))),
            h('span.vdoor-why', shared.length ? `Both: ${shared.join(' · ')}` : 'The nearest under this light'),
            h('span.vdoor-home', `${Math.round(door.home * 100)}% like home`)),
          badges(door.star));
        })));
    } else {
      nodes.push(note('No door opens from here: everything near has been watched, set aside or passed already. Land here, or step back.'));
    }
    // A voyage lands once it has gone somewhere.
    nodes.push(h('div.panel-actions',
      j.path.length > 1 ? h('button.act.act-primary', { type: 'button', onclick: () => app.land() }, icon('flag', 16), h('span', `Land on ${film.t}`)) : null,
      j.path.length > 1 ? h('button.act', { type: 'button', onclick: () => app.stepBack() }, icon('back', 16), h('span', 'Step back')) : null),
    h('p.panel-note', h('button.quiet.quiet-first', { type: 'button', onclick: () => app.endJourney() }, 'End the voyage')));
    replace(body, nodes);
  }

  function renderLanded(j) {
    const last = j.path[j.path.length - 1].star;
    const film = films[last];
    const origin = films[j.origin];
    const jumps = j.path.length - 1;
    heading.textContent = j.shared ? 'A voyage' : 'Tonight';
    const saved = app.marks.watchlist.has(last);
    const seen = app.marks.seen.has(last);
    const nodes = [
      h('div.vland', { style: { '--hi': film.hi, '--lo': film.lo } },
        h('button.vland-poster', { type: 'button', onclick: () => app.focusStar(last) }, poster(film, { eager: true, size: 'large' })),
        h('div.vland-text',
          h('p.vland-kicker', icon('flag', 13), h('span', j.shared ? 'Where this voyage landed' : 'Tonight\'s film')),
          h('h3.vland-title', film.t),
          h('p.vland-meta', [String(film.y), film.d].filter(Boolean).join(' · ')),
          h('p.vland-line', jumps
            ? `${j.shared ? 'Found' : 'You found it'} on a voyage of ${plural(jumps, 'jump')} from ${origin.t}. It keeps ${Math.round(app.homeOf() * 100)}% of where it began.`
            : 'The voyage ended where it began.'),
          seen ? h('p.vland-note', 'You have watched it already.')
            : saved ? h('p.vland-note', icon('bookmark', 13), h('span', 'On your watchlist'))
              : h('button.act', { type: 'button', onclick: () => app.toggle('watchlist', last, true) }, icon('bookmark', 16), h('span', 'Add to watchlist')))),
    ];
    if (jumps) {
      nodes.push(title('The way here'), j.path.map((stop, n) => filmRow(stop.star, {
        index: n + 1, light: stop.light,
        bodyNode: n ? h('span.frow-shared', legNote(stop)) : h('span.frow-shared', 'Where it began'),
        onGo: () => app.focusStar(stop.star),
      })));
    }
    nodes.push(h('div.panel-actions',
      h('button.act.act-primary', { type: 'button', onclick: () => app.share() }, icon('share', 16), h('span', 'Share this voyage')),
      h('button.act', { type: 'button', onclick: () => app.setOut(last) }, icon('door', 16), h('span', 'Set out again from here')),
      j.shared && jumps ? h('button.act', { type: 'button', onclick: () => app.setOut(j.origin) }, icon('door', 16), h('span', `Set out from ${origin.t} yourself`)) : null),
    h('p.panel-note', h('button.quiet.quiet-first', { type: 'button', onclick: () => { app.endJourney(); renderVoyage(); } }, 'Put this voyage away')));
    replace(body, nodes);
  }

  function routeRow(route) {
    const stars = route.stops.map(stop => app.starOf(stop.slug)).filter(i => i >= 0);
    const when = route.savedAt ? new Date(route.savedAt) : null;
    const date = when && !Number.isNaN(when.getTime()) ? when.toLocaleDateString('en', { day: 'numeric', month: 'short' }) : '';
    return h('div.mrow',
      h('button.route', { type: 'button', onclick: () => { if (app.small) close(); app.showKeptRoute(route); } },
        h('span.route-posters', stars.slice(-6).map(star => h('span.route-poster', poster(films[star], { words: false })))),
        h('span.route-name', route.name),
        h('span.route-sub', [route.heading, date].filter(Boolean).join(' · '))),
      h('div.mrow-acts', h('button.mini', { type: 'button', title: 'Forget this voyage', 'aria-label': 'Forget this voyage', onclick: () => { store.forgetRoute(route); app.refresh('marks'); } }, icon('close', 14))));
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
        const seen = [...app.marks.seen, ...app.marks.visited, ...app.marks.hidden];
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
      const pulled = gravity(universe, loved, { exclude: app.notFor, k: 5, deeper: 0.6 });
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
    nodes.push(h('p.panel-note', 'Or ', h('button.quiet.quiet-first', { type: 'button', onclick: () => open('voyage') }, 'set out yourself, one door at a time')));
    replace(body, nodes);
  }

  function follow(course, stops, n) {
    if (!state.voyage || state.voyage.name !== course.name) app.beginVoyage({ kind: 'course', name: course.name || 'A course', heading: course.heading || '', stops, source: course.source || 'claude' });
    app.voyageTo(n);
    if (app.small) close();
  }

  // ── A set of films, as a list: the films of a current, a nebula, a constellation, a galaxy or one of its systems.
  const kindOf = set => ({
    trait: () => `A current · ${lightById(set.light).name}`,
    register: () => 'A nebula',
    constellation: () => (set.known ? 'A constellation' : 'A constellation not yet found'),
    galaxy: () => `A galaxy under ${lightById(set.light).name.toLowerCase()}`,
    arm: () => 'A star system',
    sky: () => 'Your sky',
  }[set.kind] || (() => 'A set of films'))();
  const setKey = set => `${set.kind}:${set.id}:${set.arm ?? ''}:${set.stars.size}:${set.light || ''}`;

  function ranking(set) {
    const list = memo.list;
    const exclude = new Set(app.marks.hidden);
    if (list.hideWatched) for (const star of app.marks.seen) exclude.add(star);
    const loved = [...app.marks.loved];
    const order = list.order === 'yours' && !loved.length ? 'truest' : list.order;
    const key = `${list.key}|${order}|${list.hideWatched}|${loved.join()}|${app.marks.hidden.size}|${app.marks.seen.size}`;
    if (list.rankKey !== key) {
      list.ranked = rankSet(universe, [...set.stars], { light: set.light || 'white', loved, exclude, order, strength: set.strength || null });
      list.rankKey = key;
    }
    return list.ranked;
  }

  function renderSet() {
    const set = state.current;
    if (!set) { heading.textContent = 'A set of films'; replace(body, note('Choose a current, a nebula, a constellation or a galaxy, and its films are listed here, the truest first.')); return; }
    const key = setKey(set);
    const list = memo.list;
    if (list.key !== key) Object.assign(list, { key, shown: PAGE, ranked: null, rankKey: '', scroll: 0, order: list.order === 'unfamiliar' ? 'truest' : list.order });
    heading.textContent = set.label.charAt(0).toUpperCase() + set.label.slice(1);
    const ranked = ranking(set);
    const hidden = [...set.stars].filter(star => app.marks.hidden.has(star)).length;
    const watched = list.hideWatched ? [...set.stars].filter(star => app.marks.seen.has(star) && !app.marks.hidden.has(star)).length : 0;
    const loved = app.marks.loved.size;
    const order = list.order === 'yours' && !loved ? 'truest' : list.order;

    const nodes = [];
    if (memo.back && BACK_TO[memo.back]) nodes.push(h('button.panel-back', { type: 'button', onclick: () => open(memo.back) }, icon('back', 14), h('span', BACK_TO[memo.back])));
    nodes.push(h('p.set-kicker', { style: { '--c': set.colour || '#dec6a0' } }, h('span.kick-dot'), kindOf(set)));
    if (set.note) nodes.push(h('p.set-note', set.note));
    if (set.kind === 'constellation' && !set.known) {
      const seen = [...set.stars].filter(star => app.marks.visited.has(star)).length;
      nodes.push(h('p.set-progress', h('span.pips', [...set.stars].map((star, n) => h('span.pip', { class: n < seen ? 'on' : '' }))), `${seen} of ${set.stars.size} stars visited`));
    }
    const left = [hidden ? `${hidden} set aside` : '', watched ? `${watched} watched` : ''].filter(Boolean);
    nodes.push(h('p.set-count', h('strong', ranked.length.toLocaleString('en')), ` ${ranked.length === 1 ? 'film' : 'films'}${left.length ? ` · ${left.join(', ')} not shown` : ''}`));
    nodes.push(h('div.segmented', { role: 'radiogroup', 'aria-label': 'Order' }, ORDERS.map(([id, label, hint]) => {
      const disabled = id === 'yours' && !loved;
      return h('button.seg', {
        type: 'button', role: 'radio', 'aria-checked': String(order === id), class: order === id ? 'on' : '', disabled,
        title: disabled ? 'Love a film first, and the list can lean toward your taste' : hint,
        onclick: () => { list.order = id; list.shown = PAGE; renderSet(); body.scrollTop = 0; },
      }, label);
    })));
    nodes.push(h('label.check', h('input', { type: 'checkbox', checked: list.hideWatched, onchange: event => { list.hideWatched = event.target.checked; list.shown = PAGE; renderSet(); } }), h('span', 'Hide films I have watched')));

    const trailFrom = state.voyage && state.voyage.kind === 'trail' && state.voyage.set === key ? state.voyage : null;
    if (trailFrom) {
      nodes.push(h('div.course',
        h('p.course-kicker', 'A trail through it', source('chart')),
        h('p.course-heading', trailFrom.heading),
        trailFrom.stops.map((stop, n) => filmRow(stop.star, {
          index: n + 1, light: stop.light,
          bodyNode: stop.note ? h('span.frow-shared', `${lightById(stop.light).name}: ${stop.note}`) : null,
          onGo: () => { app.voyageTo(n); if (app.small) close(); },
        }))));
    } else if (ranked.length >= 3) {
      nodes.push(h('div.panel-actions', h('button.act', { type: 'button', onclick: () => followTrail(set, ranked) }, icon('passage', 16), h('span', 'Follow a trail through it'))));
    }

    const why = entry => {
      const film = films[entry.star];
      if (order === 'yours' && entry.from >= 0 && entry.pull > 0.05) return `Near ${films[entry.from].t}, which you love`;
      if (order === 'unfamiliar' && (film.rn ?? 1) <= 1) return [film.d, 'seldom seen'].filter(Boolean).join(' · ');
      return film.d || '';
    };
    nodes.push(h('div.set-rows', ranked.slice(0, list.shown).map(entry => filmRow(entry.star, {
      bodyNode: [why(entry) ? h('span.frow-shared', why(entry)) : null,
        h('span.srow-meter', { title: `Carries it ${Math.round(entry.strength * 100)}% as fully as the truest film here`, style: { '--w': `${Math.max(4, Math.round(entry.strength * 100))}%` } },
          order === 'yours' ? h('span.srow-pull', { style: { '--w': `${Math.max(2, Math.round(entry.pull * 100))}%` } }) : null)],
      extra: badges(entry.star),
      onGo: () => go(entry.star),
    }))));
    if (ranked.length > list.shown) {
      nodes.push(h('button.act.act-more', { type: 'button', onclick: () => { const top = body.scrollTop; list.shown += PAGE; renderSet(); body.scrollTop = top; } },
        h('span', `Show ${Math.min(PAGE, ranked.length - list.shown)} more of ${ranked.length.toLocaleString('en')}`)));
    }
    if (!ranked.length) nodes.push(note('Every film here is set aside or watched.'));
    nodes.push(h('p.panel-note', h('button.quiet.quiet-first', { type: 'button', onclick: () => { app.setCurrent(null); close(); } }, 'Put the lights back')));
    replace(body, nodes);
  }

  function followTrail(set, ranked) {
    const start = set.stars.has(state.focus) && !app.notFor.has(state.focus) ? state.focus : null;
    const stops = trail(universe, ranked.map(entry => entry.star), { length: 5, pool: 30, start });
    if (stops.length < 2) return;
    const name = set.kind === 'constellation' && !set.known ? 'an unnamed figure' : set.label;
    app.beginVoyage({
      kind: 'trail', set: setKey(set), name: `A trail through ${name}`, source: 'chart',
      heading: `${stops.length} films, each the nearest to the last, all of them true to ${name}.`,
      stops: stops.map((stop, n) => ({ star: stop.star, light: n ? stop.light : null, note: stop.shared.map(entry => traitName(entry.trait)).join(' · ') })),
    });
    app.voyageTo(0);
    if (app.small) close(); else renderSet();
  }

  // ── Your sky: the films you love and what they pull toward you, and everything else you keep.
  function renderSky(data) {
    if (data && data.tab) memo.skyTab = data.tab;
    heading.textContent = 'Your sky';
    const count = {
      loved: app.marks.loved.size, watchlist: app.marks.watchlist.size, seen: app.marks.seen.size,
      voyages: store.state.routes.length, aside: app.marks.hidden.size, journal: 0,
    };
    const tabs = h('div.tabs', { role: 'tablist', 'aria-label': 'What you keep' }, SKY_TABS.map(([id, label]) => h('button.tab', {
      type: 'button', role: 'tab', 'aria-selected': String(memo.skyTab === id), class: memo.skyTab === id ? 'on' : '',
      onclick: () => { memo.skyTab = id; renderSky(); body.scrollTop = 0; },
    }, label, count[id] ? h('span.tab-n', String(count[id])) : null)));
    const content = { loved: lovedTab, watchlist: watchTab, seen: seenTab, voyages: voyagesTab, aside: asideTab, journal: journalTab }[memo.skyTab]();
    replace(body, tabs, content);
  }

  function lovedTab() {
    const loved = [...app.marks.loved];
    if (!loved.length) {
      return [note('Your sky is made of the films you love. Mark one with the heart and it becomes a fixed star here; its gravity pulls other films toward you.'),
        h('div.panel-actions', h('button.act', { type: 'button', onclick: () => app.searchView.open({ title: 'A film you love', pick: star => { app.toggle('loved', star, true); open('sky'); } }) }, icon('heart', 17), h('span', 'Name a film you love')))];
    }
    const measured = taste(universe, loved);
    const pulled = gravity(universe, loved, { exclude: app.notFor, k: 9, deeper: memo.deeper ? 1 : 0.2 });
    const nodes = [
      h('div.loved-grid', [...store.state.loved].reverse().map(app.starOf).filter(i => i >= 0).slice(0, 18).map(star => posterButton(star, () => go(star)))),
      h('div.panel-actions',
        h('button.act', { type: 'button', onclick: () => app.searchView.open({ title: 'A film you love', pick: star => { if (!app.marks.loved.has(star)) app.toggle('loved', star, true); open('sky'); } }) }, icon('plus', 16), h('span', 'Add a film')),
        h('button.act', { type: 'button', onclick: () => { app.setCurrent({ kind: 'sky', id: 0, label: 'Your sky', note: 'the films you love, and what they pull toward you', stars: new Set([...loved, ...pulled.map(entry => entry.star)]), colour: '#f0c987', light: 'white' }); app.widen(); } }, icon('eye', 16), h('span', 'Light it up'))),
    ];

    if (loved.length >= 2) {
      nodes.push(title('What your films share', source('chart')),
        h('div.taste-lights', measured.lights.slice(0, 6).map(entry => h('div.taste-light', { style: { '--c': lightById(entry.light).color, '--w': `${Math.round(entry.share * 100)}%` } },
          h('span.taste-name', lightById(entry.light).name), h('span.taste-bar')))),
        measured.threads.length ? h('div.trait-chips', measured.threads.slice(0, 10).map(thread => h('button.chip', { type: 'button', style: { '--c': lightById(thread.light).color }, class: 'tinted', onclick: () => app.browse('trait', thread.trait) },
          traitName(thread.trait), h('span.chip-n', String(thread.films))))) : null);
    }

    // The Navigator's reading of this sky.
    const sky = memo.sky;
    if (sky && (sky.name || sky.reading)) {
      nodes.push(h('div.skyread',
        h('p.course-kicker', 'The Navigator reads your sky', source('claude'), memo.skyState === 'asking' ? h('span.developing', 'developing') : null),
        sky.name ? h('h3.course-name', sky.name) : null,
        sky.reading ? h('p.skyread-text', sky.reading) : null,
        sky.blind ? h('p.skyread-blind', h('em', 'Not yet in your sky: '), sky.blind) : null,
        (sky.next || []).map((entry, n) => filmRow(entry.star, { kicker: ['The safe bet', 'A step further', 'The long reach'][n] || '', bodyNode: entry.why ? h('span.frow-claim', entry.why) : null, onGo: () => go(entry.star) }))));
    }
    if (memo.skyState === 'asking') nodes.push(reading('The Navigator is reading your sky', () => { pilot.cancel('tool'); memo.skyState = 'idle'; renderSky(); }));
    else if (loved.length >= 2) {
      nodes.push(pilot.connected
        ? h('button.act.act-primary', { type: 'button', onclick: readSky }, icon('spark', 17), h('span', sky ? 'Read it again' : 'Have the Navigator read your sky'))
        : needNavigator('A reading of your sky'));
    } else nodes.push(note('Love one more film and the Navigator can read your sky.'));
    if (memo.skyNote) nodes.push(h('p.panel-error', memo.skyNote));

    nodes.push(title('Pulled toward you', source('chart')),
      note('The films nearest to everything you love at once. The more of your films pull on one, the nearer it comes. Films you have watched or set aside are left out.'),
      h('label.check', h('input', { type: 'checkbox', checked: memo.deeper, onchange: event => { memo.deeper = event.target.checked; renderSky(); } }), h('span', 'Lean toward the little-seen')),
      pulled.map(entry => filmRow(entry.star, { bodyNode: h('span.frow-shared', `Pulled by ${entry.pulls.map(pull => films[pull.from].t).join(' and ')}`), extra: badges(entry.star), onGo: () => go(entry.star) })));
    return nodes;
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

  /** A film kept in one of the marks, with the small acts that move it on. */
  const keptRow = (star, sub, acts) => h('div.mrow',
    filmRow(star, { bodyNode: sub ? h('span.frow-shared', sub) : null, onGo: () => go(star) }),
    h('div.mrow-acts', acts));
  const mini = (glyph, label, onclick) => h('button.mini', { type: 'button', title: label, 'aria-label': label, onclick }, icon(glyph, 14));
  const keptStars = key => [...store.state[key]].reverse().map(app.starOf).filter(i => i >= 0);

  function watchTab() {
    const list = keptStars('watchlist');
    if (!list.length) return note('Films you save for later gather here. Mark one with the bookmark, or land a voyage on it.');
    return [note(`${plural(list.length, 'film')} saved for a night to come, the latest first.`),
      list.map(star => keptRow(star, films[star].d, [
        mini('check', 'I have watched it', () => app.toggle('seen', star, true)),
        mini('close', 'Take it off the watchlist', () => app.toggle('watchlist', star, false)),
      ]))];
  }

  function seenTab() {
    const list = keptStars('seen');
    if (!list.length) return note('Mark a film as watched and it is never offered as somewhere to go next, so every ray and every door leads somewhere new.');
    return [note(`${plural(list.length, 'film')} watched. None of them is offered as somewhere to go next.`),
      list.map(star => keptRow(star, films[star].d, [mini('close', 'I have not watched it', () => app.toggle('seen', star, false))]))];
  }

  function asideTab() {
    const list = keptStars('hidden');
    if (!list.length) return note('Films you set aside with "Not for me" wait here, never offered again until you bring them back.');
    return [note(`${plural(list.length, 'film')} set aside.`),
      list.map(star => keptRow(star, films[star].d, [mini('undo', 'Bring it back', () => app.toggle('hidden', star, false))]))];
  }

  function voyagesTab() {
    const routes = [...store.state.routes].reverse();
    if (!routes.length) return note('Every voyage you land is kept here with the road that led to it. Set out from any film to begin one.');
    return [note(`${plural(routes.length, 'voyage')} kept, the latest first.`), routes.map(routeRow)];
  }

  // ── The journal: everything kept, as a file to carry between browsers.
  function journalTab() {
    const input = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: () => { const file = input.files[0]; if (file) file.text().then(readJournal, () => failJournal('That file could not be opened.')); } });
    const paste = h('textarea.panel-input.journal-paste', { rows: '3', placeholder: 'Or paste a journal here', 'aria-label': 'Paste a journal' });
    const counts = [
      plural(app.marks.loved.size, 'film') + ' loved', `${app.marks.watchlist.size} on your watchlist`, `${app.marks.seen.size} watched`,
      plural(store.state.routes.length, 'voyage'), plural(app.marks.visited.size, 'star') + ' visited', plural(state.found.size, 'constellation') + ' found',
    ];
    const nodes = [
      note('Everything you keep lives in this browser only. Save it as a journal to carry it to another browser or device, and read it in there. The other edition of the Odyssey keeps the same kind of journal, so each can read the other\'s.'),
      h('p.journal-counts', counts.join(' · ')),
      h('div.panel-actions',
        h('button.act.act-primary', { type: 'button', onclick: saveJournal }, icon('download', 16), h('span', 'Save my journal')),
        h('button.act', { type: 'button', onclick: () => input.click() }, icon('upload', 16), h('span', 'Read a journal'))),
      input,
      h('details.journal-more', h('summary', 'Paste one instead'), paste,
        h('button.act', { type: 'button', onclick: () => readJournal(paste.value) }, h('span', 'Read it'))),
    ];
    if (memo.journalNote) nodes.push(h('p.panel-done', memo.journalNote));
    if (memo.journalError) nodes.push(h('p.panel-error', memo.journalError));
    if (memo.journalText) {
      const box = h('textarea.panel-input.journal-out', { rows: '6', readonly: true }, memo.journalText);
      nodes.push(note('This view cannot save files. Copy your journal from here and keep it somewhere safe.'), box,
        h('div.panel-actions', h('button.act', { type: 'button', onclick: () => { box.select(); navigator.clipboard?.writeText(memo.journalText).then(() => { memo.journalNote = 'Copied.'; renderSky(); }, () => {}); } }, h('span', 'Copy it'))));
    }
    nodes.push(title('Start again'), forget());
    return nodes;
  }

  async function saveJournal() {
    const text = JSON.stringify(store.archive(), null, 1);
    const name = `afterimage-odyssey-journal-${new Date().toISOString().slice(0, 10)}.json`;
    memo.journalNote = ''; memo.journalError = ''; memo.journalText = '';
    if (app.edition === 'claude') {
      // Inside claude.ai a page offers a file through the viewer, who says yes or no.
      let downloads = null;
      try { downloads = await window.claude?.use?.('downloads'); } catch { downloads = null; }
      if (downloads) {
        try {
          await downloads.save({ filename: name, data: text });
          memo.journalNote = `Saved as ${name}.`;
        } catch (error) {
          if (error && error.code === 'declined') memo.journalNote = 'Not saved.';
          else memo.journalText = text;
        }
      } else memo.journalText = text;
      renderSky();
      return;
    }
    try {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const link = h('a', { href: url, download: name, hidden: true });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      memo.journalNote = `Saved as ${name}.`;
    } catch {
      memo.journalText = text;
    }
    renderSky();
  }

  function failJournal(message) { memo.journalNote = ''; memo.journalError = message; memo.journalText = ''; renderSky(); }

  function readJournal(text) {
    let parsed;
    try { parsed = JSON.parse(String(text || '')); } catch { failJournal('That is not a journal: it could not be read.'); return; }
    let counts;
    try { counts = store.absorb(parsed); } catch (error) { failJournal(error.message || 'That journal could not be read.'); return; }
    const parts = [
      counts.loved ? plural(counts.loved, 'loved film') : '', counts.watchlist ? `${counts.watchlist} on the watchlist` : '',
      counts.seen ? `${counts.seen} watched` : '', counts.hidden ? `${counts.hidden} set aside` : '',
      counts.routes ? plural(counts.routes, 'voyage') : '', counts.visited ? plural(counts.visited, 'star') + ' visited' : '',
      counts.found ? plural(counts.found, 'film') + ' from beyond the chart' : '',
    ].filter(Boolean);
    memo.journalError = '';
    memo.journalText = '';
    memo.journalNote = parts.length ? `Read. Added ${parts.join(', ')}.` : 'Read. Everything in it was already here.';
    app.reloadKept();
    renderSky();
  }

  // ── Constellations.
  function renderFigures() {
    heading.textContent = 'Constellations';
    const figures = universe.bundle.constellations;
    const progress = app.progress();
    const known = progress.filter(entry => state.found.has(entry.id));
    const forming = progress.filter(entry => !state.found.has(entry.id) && entry.seen > 0).sort((a, b) => b.seen / b.total - a.seen / a.total);
    const waiting = progress.filter(entry => !state.found.has(entry.id) && !entry.seen)
      .sort((a, b) => app.hintOf(a.id).name.localeCompare(app.hintOf(b.id).name) || a.id - b.id);
    const hint = entry => app.hintOf(entry.id);
    // A figure forming in your wake is named by the stars of it you have been to, and one you have not: the
    // best-known of them, choosing one that a figure of the same kind forming beside it does not share.
    const charted = entry => figures[entry.id].stars.filter(star => star < universe.count);
    const been = entry => charted(entry).filter(star => app.marks.visited.has(star));
    const lead = entry => {
      const beside = new Set(forming.filter(other => other.id !== entry.id && hint(other).trait === hint(entry).trait).flatMap(charted));
      const ahead = charted(entry).filter(star => !app.marks.visited.has(star)).sort((a, b) => (films[b].rn ?? 0) - (films[a].rn ?? 0));
      return ahead.find(star => !beside.has(star)) ?? ahead[0];
    };
    const formingLine = entry => {
      const titles = been(entry).map(star => films[star].t);
      const went = titles.length > 1 ? `${titles.slice(0, -1).join(', ')} and ${titles.at(-1)}` : titles[0];
      const next = lead(entry);
      return `Something to do with ${hint(entry).name}. You have been to ${went}${next === undefined ? '' : `, and ${films[next].t} is another of its stars`}.`;
    };
    const on = id => state.current?.kind === 'constellation' && state.current.id === id;
    const pips = entry => h('span.pips', figures[entry.id].stars.map((_, n) => h('span.pip', { class: n < entry.seen ? 'on' : '' })));
    replace(body,
      note(`${figures.length} figures wait in this chart. Each joins films that share two things which seldom travel together. Visit three of a figure's stars and it tells you its name. Seen from far out, the ones you have found are drawn in gold, and the ones forming in your wake in pale lines.`),
      h('p.figure-count', h('strong', String(known.length)), ` found · ${figures.length - known.length} still unnamed`),
      known.length ? title('Found') : null,
      known.map(entry => h('button.figure', { type: 'button', class: on(entry.id) ? 'on' : '', onclick: () => app.browse('constellation', entry.id) },
        h('span.figure-name', figures[entry.id].name),
        h('span.figure-what', figures[entry.id].traits.map(traitName).join(' · ')),
        h('span.figure-seen', pips(entry), `${entry.seen} of ${entry.total} stars visited`))),
      forming.length ? title('Forming in your wake') : null,
      forming.map(entry => h('button.figure.forming', { type: 'button', class: on(entry.id) ? 'on' : '', onclick: () => app.browse('constellation', entry.id) },
        h('span.figure-name', 'An unnamed figure'),
        h('span.figure-what', formingLine(entry)),
        h('span.figure-seen', pips(entry), `${entry.seen} of ${entry.total} stars visited`))),
      waiting.length ? title(known.length || forming.length ? 'Still waiting' : 'Waiting to be found') : null,
      waiting.length ? h('div.figure-grid', waiting.map(entry => h('button.figure-cell', {
        type: 'button', class: on(entry.id) ? 'on' : '', title: `An unnamed figure: something to do with ${hint(entry).name}, with ${films[hint(entry).star].t} among its stars`,
        onclick: () => app.browse('constellation', entry.id),
      }, h('span.figure-cell-hint', hint(entry).name), h('span.figure-cell-n', `${films[hint(entry).star].t} and ${entry.total - 1} more`)))) : null);
  }

  // ── Nebulae.
  function renderNebulae() {
    heading.textContent = 'Nebulae';
    const registers = universe.bundle.registers;
    const sizes = new Array(registers.length).fill(0);
    for (const film of films) for (const index of film.rg || []) sizes[index] += 1;
    replace(body,
      note('Nebulae drift across the galaxies: kinds of film the ATLAS named, wherever they happen to live. Choose one to light its films and list them, the truest first.'),
      registers.map((register, index) => (sizes[index] ? h('button.nebula', {
        type: 'button', style: { '--c': register.hue }, class: state.current?.kind === 'register' && state.current.id === index ? 'on' : '',
        onclick: () => app.browse('register', index),
      }, h('span.nebula-swatch'), h('span.nebula-text', h('span.nebula-name', register.label, h('span.chip-n', String(sizes[index]))), h('span.nebula-blurb', register.blurb))) : null)));
  }

  // ── Collide two films.
  function renderCollide(data) {
    heading.textContent = 'Collision';
    if (data && data.a !== undefined) {
      const b = data.b ?? -1;
      memo.collide = { a: data.a, b, between: b >= 0 ? app.between(data.a, b) : [], result: null, state: 'idle', note: '' };
    }
    const c = memo.collide;
    if (!c) { replace(body, note('Choose a star first, then collide it with another.')); return; }
    const choose = () => app.searchView.open({ title: `Collide ${films[c.a].t} with…`, pick: star => { if (star === c.a) return; c.b = star; c.result = null; c.note = ''; c.between = app.between(c.a, c.b); open('collide'); run(); } });

    async function run() {
      if (!pilot.connected || c.b < 0 || c.state === 'asking') return;
      c.state = 'asking';
      c.note = '';
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
      // Stopped, failed, or never asked: the Navigator can still be asked.
      if (!c.result && c.state !== 'asking' && pilot.connected) {
        nodes.push(h('button.act.act-primary', { type: 'button', onclick: run }, icon('spark', 17), h('span', c.note ? 'Ask again' : 'Ask the Navigator for the film between them')));
      }
      if (c.between.length) {
        nodes.push(title('What the chart finds between them', source('chart')),
          c.between.map(entry => filmRow(entry.star, { bodyNode: h('span.frow-shared', 'near both on the chart') })));
      }
    }
    replace(body, nodes);
  }

  // ── A passage between two films.
  function renderPassage(data) {
    heading.textContent = 'Passage';
    if (data && data.a !== undefined) memo.passage = { a: data.a, b: data.b ?? -1 };
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
      note(`The chart is computed: ${universe.base.toLocaleString('en')} films, placed by what they are recorded as sharing. The Navigator is Claude Opus 5.5, who has seen the films. It reads each star as you arrive, plots courses, names the film between two films, and charts films the chart does not hold.`),
    ];
    const ahead = pilot.ahead;
    if (ahead) {
      const which = ahead.count >= ahead.films ? 'every star of the chart' : `${ahead.count.toLocaleString('en')} of its stars, the best known first`;
      nodes.push(note(`Before anyone arrived, Claude${ahead.by ? ` (${ahead.by})` : ''} read ${which}. Those readings are there whether or not a Navigator is connected, marked as read ahead of time; a connected Navigator can read any of them afresh.`));
    }
    if (pilot.connected) {
      nodes.push(h('label.check', h('input', { type: 'checkbox', checked: state.readArrivals, onchange: event => { state.readArrivals = event.target.checked; store.set('readArrivals', state.readArrivals); } }), h('span', 'Read every star I arrive at')));
      if (status.mode === 'inpage') nodes.push(note('Claude answers from inside this page, on your own Claude account, so each reading uses a little of your usage. Drifting never asks it anything.'));
      if (status.mode === 'companion') nodes.push(h('button.act', { type: 'button', onclick: () => { pilot.disconnect(); renderNavigator(); } }, h('span', 'Disconnect the companion')));
    } else if (status.mode !== 'connecting' && !pilot.canConnect) {
      nodes.push(note('Here the Navigator is Claude itself, asked from inside this page on the account of whoever is looking. It answers when the page is open in Claude, you are signed in, and you allow it the first time it asks.'));
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
      nodes.push(title('Connect a companion'),
        note('The AFTERIMAGE companion is a small server that speaks to Claude with its owner\'s own credentials. Give its address and passphrase to bring the Navigator aboard. They are kept in this browser only.'),
        url, pass, button, error);
    }
    const beyond = universe.count - universe.base;
    nodes.push(title('Your log'),
      note(`${plural(app.marks.visited.size, 'star')} visited, ${plural(app.marks.loved.size, 'film')} loved, ${plural(state.found.size, 'constellation')} found, ${plural(beyond, 'film')} charted beyond the chart. All of it is kept in this browser.`),
      h('div.panel-actions', h('button.act', { type: 'button', onclick: () => open('sky', { tab: 'journal' }) }, icon('download', 16), h('span', 'Save or read a journal'))));
    replace(body, nodes);
  }

  function forget() {
    const button = h('button.quiet.quiet-first', { type: 'button', onclick: () => {
      if (button.dataset.sure) { store.clear(); window.location.hash = ''; window.location.reload(); return; }
      button.dataset.sure = '1';
      button.textContent = 'Forget everything? Choose again to confirm';
    } }, 'Forget my voyage');
    return h('p.panel-note', button);
  }

  const RENDER = { voyage: renderVoyage, course: renderCourse, set: renderSet, sky: renderSky, figures: renderFigures, nebulae: renderNebulae, collide: renderCollide, passage: renderPassage, navigator: renderNavigator };

  function open(name, data) {
    if (!RENDER[name]) return;
    const before = state.tool?.name || null;
    if (name === 'set' && before !== 'set') memo.back = BACK_TO[before] ? before : null;
    const same = before === name;
    state.tool = { name };
    sheet.hidden = false;
    sheet.dataset.tool = name;
    RENDER[name](data);
    if (name === 'set' && !same && memo.list.scroll) { body.scrollTop = memo.list.scroll; memo.list.scroll = 0; }
    else if (!same || data !== undefined) body.scrollTop = 0;
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

  /** Draws the open panel again, where it was scrolled to. */
  function again(name) {
    const top = body.scrollTop;
    RENDER[name]();
    body.scrollTop = top;
  }

  app.on(what => {
    if (!state.tool) return;
    const name = state.tool.name;
    if (what === 'marks' && ['sky', 'figures', 'course', 'set', 'voyage'].includes(name)) again(name);
    else if (what === 'navigator') again(name);
    else if (what === 'current' && name === 'set') { if (state.current) again(name); else close(); }
    else if (what === 'current' && (name === 'figures' || name === 'nebulae')) again(name);
    else if (what === 'voyage' && (name === 'passage' || name === 'set')) again(name);
    else if ((what === 'journey' || what === 'focus') && name === 'voyage') again(name);
    else if (what === 'focus' && name === 'figures') again(name);
    else if (what === 'sky' && name === 'voyage' && !state.journey) again(name);
  });

  return {
    open, close,
    toggle(name) { if (state.tool?.name === name) close(); else open(name); },
    width: () => (sheet.hidden || app.small ? 0 : sheet.getBoundingClientRect().width),
    height: () => (sheet.hidden || !app.small ? 0 : sheet.getBoundingClientRect().height),
  };
}
