// The dossier: what is known of the star you have reached, and the six rays
// that lead away from it. Everything here says where it came from: the chart
// (computed), the encyclopedia, or Claude reading as the Navigator.
import { lightById } from '../engine/lights.mjs';
import { UNLIT } from '../engine/universe.mjs';
import { traitsOf } from '../engine/voyage.mjs';
import { h, icon, replace, plural } from './dom.mjs';
import { poster } from './posters.mjs';

const SOURCES = {
  chart: ['charted', 'Computed from the chart: what the two films are recorded as sharing.'],
  claude: ['read by Claude', 'Written by Claude as the Navigator, from its own knowledge of the films.'],
  memory: ['charted by Claude from memory', 'This film is not on the printed chart. Claude described it from memory, so its place is a reading, not a record.'],
  book: ['from the encyclopedia', 'The opening of the film\'s Wikipedia article.'],
  atlas: ['from the atlas', 'A reading recorded in the ATLAS this chart was compiled from.'],
};
export const source = kind => h(`span.src.src-${kind}`, { title: SOURCES[kind][1] }, SOURCES[kind][0]);

const firstSentences = (text, max = 250) => {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const stop = cut.lastIndexOf('. ');
  return stop > 80 ? cut.slice(0, stop + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
};

export function createDossier(app) {
  const { universe, state, films, cosmos, pilot } = app;
  const scroll = h('div.sheet-scroll', { tabindex: '-1' });
  const grip = h('button.sheet-grip', { type: 'button', 'aria-label': 'Make this panel taller or shorter', onclick: () => { sheet.classList.toggle('tall'); app.frameCosmos(); } });
  const sheet = h('aside.sheet.sheet-right.dossier', { 'aria-label': 'The star you have reached', hidden: true },
    grip,
    h('button.sheet-close', { type: 'button', 'aria-label': 'Leave this star', onclick: () => app.blur() }, icon('close', 18)),
    scroll);
  app.root.querySelector('#app').append(sheet);

  let shownStar = -1;
  let parts = null; // the live sections of a star's dossier

  // Lines drawn in the atlas, by film.
  const linesOf = new Map();
  universe.bundle.links.forEach(link => {
    for (const [mine, other] of [[link[0], link[1]], [link[1], link[0]]]) {
      if (!linesOf.has(mine)) linesOf.set(mine, []);
      linesOf.get(mine).push({ other, type: universe.bundle.linkTypes[link[2]], strength: link[4], claim: link[6] });
    }
  });

  const section = (name, title, ...children) => h(`section.dsec.dsec-${name}`, title ? h('h3.dsec-title', title) : null, ...children);

  function filmRow(star, { light = null, kicker = '', body = null, onGo, tag = null }) {
    const film = films[star];
    return h('button.frow', {
      type: 'button', style: light ? { '--c': lightById(light).color } : null, class: light ? 'has-light' : '',
      onclick: onGo || (() => app.focusStar(star, light ? { light } : {})),
      onpointerenter: () => cosmos.setHover(star), onpointerleave: () => cosmos.setHover(-1),
    },
    h('span.frow-poster', poster(film, { words: false })),
    h('span.frow-text',
      kicker ? h('span.frow-kicker', kicker, tag) : null,
      h('span.frow-title', film.t, h('span.frow-year', String(film.y))),
      body),
    h('span.frow-go', icon('arrow', 15)));
  }

  // ── A star.
  function showStar(star) {
    shownStar = star;
    const film = films[star];
    const deep = universe.isDeep(star);
    const sky = state.sky;

    const love = h('button.act.act-love', { type: 'button', onclick: () => app.toggle('loved', star) }, icon('heart', 17), h('span', 'Love'));
    const seen = h('button.act.act-seen', { type: 'button', onclick: () => app.toggle('seen', star) }, icon('check', 17), h('span', 'Seen'));
    const facts = [String(film.y), film.d, (film.c || []).slice(0, 2).join(', '), film.rt ? `${film.rt} min` : ''].filter(Boolean);
    const kicker = h('p.dossier-kicker');
    const head = h('header.dossier-head', { style: { '--hi': film.hi, '--lo': film.lo } },
      h('div.dossier-poster', poster(film, { eager: true, size: 'large' })),
      h('div.dossier-id',
        kicker,
        h('h2.dossier-title', film.t),
        h('p.dossier-meta', facts.join(' · ')),
        deep ? h('p.dossier-deep', source('memory')) : null,
        h('div.dossier-acts', love, seen)));

    const essence = section('essence', null);
    const rays = section('rays', null);
    const deeper = section('deeper', null);

    const drawn = (linesOf.get(star) || []).filter(line => line.other < universe.count).sort((a, b) => b.strength - a.strength).slice(0, 8);
    const lines = drawn.length ? section('lines', h('span', 'Lines drawn in the atlas', source('atlas')),
      drawn.map(line => filmRow(line.other, { kicker: line.type, body: line.claim ? h('span.frow-claim', line.claim) : null }))) : null;

    const groups = traitsOf(universe, star, 5).map(({ light, traits }) => ({ light, traits: traits.filter(t => !t.veiled).slice(0, 5) })).filter(group => group.traits.length);
    const traitsSection = groups.length ? section('traits', h('span', 'What this star is made of', source(deep ? 'memory' : 'chart')),
      h('p.dsec-note', 'Choose any one to light up every film that shares it.'),
      groups.map(group => h('div.trait-group', { style: { '--c': lightById(group.light).color } },
        h('span.trait-light', lightById(group.light).name),
        h('div.trait-chips', group.traits.map(({ trait }) => h('button.chip', { type: 'button', onclick: () => app.showTrait(trait) }, universe.traits[trait].s || universe.traits[trait].t)))))) : null;

    const shape = storyShape(film);
    const recall = film.rc ? veiled('What stays with people', film.rc, deep ? 'memory' : 'atlas', 'This may give something away.') : null;

    const links = [
      film.w ? h('a.ext', { href: `https://en.wikipedia.org/wiki/${encodeURIComponent(film.w.replace(/ /g, '_'))}`, target: '_blank', rel: 'noopener noreferrer' }, 'Wikipedia') : null,
      film.im ? h('a.ext', { href: `https://www.imdb.com/title/${film.im}/`, target: '_blank', rel: 'noopener noreferrer' }, 'IMDb') : null,
      h('a.ext', { href: `https://letterboxd.com/search/films/${encodeURIComponent(`${film.t} ${film.y}`)}/`, target: '_blank', rel: 'noopener noreferrer' }, 'Letterboxd'),
    ];
    const tools = section('tools', 'From here',
      h('div.tool-row',
        h('button.act', { type: 'button', onclick: () => app.panels.open('collide', { a: star }) }, icon('collide', 17), h('span', 'Collide with…')),
        h('button.act', { type: 'button', onclick: () => app.panels.open('passage', { a: star }) }, icon('passage', 17), h('span', 'Passage to…'))),
      h('p.ext-row', links));

    parts = { star, kicker, love, seen, essence, rays, deeper };
    replace(scroll, head, essence, recall, rays, deeper, lines, traitsSection, shape, tools);
    sheet.hidden = false;
    sheet.dataset.kind = 'star';
    sheet.setAttribute('aria-label', `${film.t}, ${film.y}`);
    scroll.scrollTop = 0;
    requestAnimationFrame(() => sheet.classList.add('on'));
    place(); marks(); arrival(); deepField();
  }

  function veiled(title, text, kind, warning) {
    const body = h('p.veil-text', text);
    const wrap = h('div.veil', body, h('button.veil-lift', { type: 'button', onclick: () => wrap.classList.add('lifted') }, icon('eye', 15), h('span', 'Develop')));
    return section('veil', h('span', title, source(kind)), wrap, h('p.dsec-note', warning));
  }

  function storyShape(film) {
    const st = film.st;
    if (!st || !Array.isArray(st.c)) return null;
    const arc = universe.bundle.arcs[st.a];
    const values = st.c;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(1, max - min);
    const points = values.map((v, n) => `${(n / (values.length - 1)) * 200},${46 - ((v - min) / span) * 40}`).join(' ');
    const curve = h('div.shape-curve', { html: `<svg viewBox="0 0 200 52" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>` });
    const acts = ['early', 'midway', 'late'];
    const turns = (st.b || []).slice(0, 9).map(([beat, ...count]) => {
      const record = universe.bundle.beats[beat];
      const when = count.indexOf(Math.max(...count));
      return record ? h('span.turn', h('span.turn-when', acts[when] || ''), record.phrase) : null;
    });
    const body = h('div.veil-text', h('p.shape-arc', arc ? `${arc.name}: ${arc.line}.` : ''), curve, h('div.turns', turns));
    const wrap = h('div.veil', body, h('button.veil-lift', { type: 'button', onclick: () => wrap.classList.add('lifted') }, icon('eye', 15), h('span', 'Develop')));
    return section('shape', h('span', 'The shape of the story', source('chart')), wrap,
      h('p.dsec-note', 'Read by a rough instrument from the plot summary. It gives the story away.'));
  }

  function place() {
    if (!parts || parts.star !== state.focus) return;
    const sky = state.sky;
    const g = universe.galaxyOf[sky][parts.star];
    const light = lightById(sky);
    if (g === UNLIT || !universe.galaxies[sky][g]) {
      replace(parts.kicker, h('span.kick-dot', { style: { '--c': light.color } }), `Unlit under ${light.name.toLowerCase()}: the chart has nothing to place it by here`);
      return;
    }
    const galaxy = universe.galaxies[sky][g];
    const arm = galaxy.arms.find(entry => entry.arm === universe.armOf[sky][parts.star]);
    replace(parts.kicker,
      h('span.kick-dot', { style: { '--c': light.color } }),
      h('button.kick-link', { type: 'button', onclick: () => app.openGalaxy(galaxy.g) }, galaxy.name),
      arm ? h('span.kick-arm', ` · ${arm.name}`) : null);
  }

  function marks() {
    if (!parts) return;
    const loved = app.marks.loved.has(parts.star);
    const seen = app.marks.seen.has(parts.star);
    parts.love.classList.toggle('on', loved);
    parts.love.setAttribute('aria-pressed', String(loved));
    parts.love.lastChild.textContent = loved ? 'Loved' : 'Love';
    parts.seen.classList.toggle('on', seen);
    parts.seen.setAttribute('aria-pressed', String(seen));
  }

  // ── What the Navigator says of it, and the six rays.
  function arrival() {
    if (!parts || parts.star !== state.focus) return;
    const star = parts.star;
    const film = films[star];
    const deep = universe.isDeep(star);
    const a = state.arrival;
    const status = state.arrivalState;
    const nodes = [];

    if (a && a.essence) {
      nodes.push(h('p.essence-text', a.essence), h('p.essence-by', source('claude'),
        status === 'read' ? h('button.quiet', { type: 'button', onclick: () => app.readArrival(true) }, 'Read again') : h('span.developing', 'developing')));
    } else {
      if (status === 'asking' || status === 'draft') {
        nodes.push(h('div.reading', h('span.reading-pulse'), h('span', 'The Navigator is reading this star'),
          h('button.quiet', { type: 'button', onclick: () => app.stopArrival() }, 'Stop')));
      }
      if (film.x) nodes.push(h('p.synopsis', firstSentences(film.x)), h('p.essence-by', source(deep ? 'memory' : 'book')));
      if (status === 'offline') {
        nodes.push(h('p.nav-off', 'The Navigator is not connected, so no one is reading this star to you. What you see is the chart.',
          h('button.quiet', { type: 'button', onclick: () => app.panels.open('navigator') }, 'Connect')));
      } else if (status === 'waiting') {
        nodes.push(h('p.nav-off', 'Finding the Navigator…'));
      } else if (status === 'idle' && pilot.connected) {
        nodes.push(h('button.act.act-read', { type: 'button', onclick: () => app.readArrival() }, icon('spark', 16), h('span', 'Ask the Navigator to read this star')));
      } else if (status === 'failed') {
        nodes.push(h('p.nav-off', state.arrivalNote, h('button.quiet', { type: 'button', onclick: () => app.readArrival(true) }, 'Try again')));
      }
    }
    replace(parts.essence, nodes);

    const anyRead = state.rays.some(ray => ray.read);
    const rows = state.rays.map(ray => {
      const light = lightById(ray.light);
      const shared = ray.shared.map(entry => universe.traits[entry.trait].s || universe.traits[entry.trait].t);
      const body = ray.read
        ? [h('span.frow-claim', ray.claim), ray.watch ? h('span.frow-watch', h('em', 'Watch for '), ray.watch.replace(/^watch for\s*/i, '')) : null]
        : h('span.frow-shared', shared.length ? `Both: ${shared.join(' · ')}` : 'Nearest under this light');
      return filmRow(ray.star, { light: ray.light, kicker: `${light.name} · ${light.asks.toLowerCase()}`, body, tag: source(ray.read ? 'claude' : 'chart') });
    });
    const beyond = a && a.beyond ? beyondCard(a.beyond) : null;
    replace(parts.rays,
      h('h3.dsec-title', h('span', 'Six rays lead on from here')),
      h('p.dsec-note', anyRead
        ? 'Under each light, the film Claude chose as this one\'s truest companion.'
        : 'Under each light, the film the chart places nearest. Follow one, or change the light and watch the universe re-form around this star.'),
      rows.length ? rows : h('p.dsec-note', 'The chart has nothing near this star yet.'),
      beyond);
  }

  function beyondCard(beyond) {
    const known = app.search.exact(beyond.title, beyond.year);
    return h('div.beyond',
      h('p.beyond-kicker', 'Beyond the chart', source('claude')),
      h('p.beyond-title', beyond.title, h('span.frow-year', String(beyond.year))),
      h('p.beyond-why', beyond.why),
      known >= 0
        ? h('button.act', { type: 'button', onclick: () => app.focusStar(known) }, icon('arrow', 16), h('span', 'Go to this star'))
        : h('button.act', { type: 'button', onclick: () => app.chartFilm(beyond.title, { year: beyond.year }) }, icon('spark', 16), h('span', 'Chart this star')));
  }

  function deepField() {
    if (!parts || parts.star !== state.focus) return;
    const star = parts.star;
    const found = state.deep.get(star) || [];
    const asking = state.deepState === 'asking';
    const nodes = [h('h3.dsec-title', h('span', 'The deep field'))];
    if (!found.length && !asking) {
      nodes.push(h('p.dsec-note', 'The chart holds 2,204 films. Claude knows a great many more. Look deeper and the Navigator charts films from beyond it, near this star.'));
    }
    if (found.length) {
      nodes.push(h('p.dsec-note', h('span', `${plural(found.length, 'film')} from beyond the chart, nearest first. `), source('memory')));
      nodes.push(...found.map(item => filmRow(item.star, {
        light: item.light, kicker: lightById(item.light).name,
        body: item.claim ? h('span.frow-claim', item.claim) : null,
      })));
    }
    if (asking) {
      nodes.push(h('div.reading', h('span.reading-pulse'), h('span', found.length ? 'Still looking' : 'Looking past the chart'),
        h('button.quiet', { type: 'button', onclick: () => { pilot.cancel('tool'); } }, 'Stop')));
    } else {
      nodes.push(h('button.act.act-deeper', { type: 'button', disabled: !pilot.connected, onclick: () => app.lookDeeper(star) },
        icon('deeper', 17), h('span', found.length ? 'Look deeper still' : 'Look deeper')));
      if (!pilot.connected) nodes.push(h('p.nav-off', 'This needs the Navigator.', h('button.quiet', { type: 'button', onclick: () => app.panels.open('navigator') }, 'Connect')));
    }
    replace(parts.deeper, nodes);
  }

  // ── A galaxy.
  function showGalaxy(g, armIndex = -1) {
    shownStar = -1;
    parts = null;
    const sky = state.sky;
    const galaxy = universe.galaxies[sky][g];
    const light = lightById(sky);
    const share = ([trait, percent]) => h('button.chip', { type: 'button', onclick: () => app.showTrait(trait) }, universe.traits[trait].s || universe.traits[trait].t, h('span.chip-n', `${percent}%`));
    const head = h('header.galaxy-head', { style: { '--c': light.color } },
      h('p.dossier-kicker', h('span.kick-dot', { style: { '--c': light.color } }), `A galaxy under ${light.name.toLowerCase()}`),
      h('h2.dossier-title', galaxy.name),
      h('p.galaxy-thesis', galaxy.thesis),
      h('p.dossier-meta', `${plural(galaxy.size, 'film')} · ${plural(galaxy.arms.length, 'arm')}`));
    const doors = section('doors', h('span', 'Ways in', source('chart')),
      h('p.dsec-note', 'Well-known films near its heart.'),
      h('div.door-grid', galaxy.doors.slice(0, 5).map(star => h('button.door', { type: 'button', title: `${films[star].t} (${films[star].y})`, onclick: () => app.focusStar(star) },
        poster(films[star]), h('span.door-title', films[star].t)))));
    const arms = section('arms', 'Its arms',
      galaxy.arms.map(arm => h('button.arm-row', { type: 'button', class: arm.arm === armIndex ? 'on' : '', onclick: () => app.openGalaxy(g, arm.arm) },
        h('span.arm-name', arm.name), h('span.arm-size', plural(arm.size, 'film')),
        h('span.arm-lead', arm.lead.slice(0, 3).map(star => films[star].t).join(' · ')))));
    const made = section('traits', h('span', 'What holds it together', source('chart')),
      h('div.trait-chips', galaxy.top.slice(0, 10).map(share)));
    const typical = section('typical', 'At its heart',
      galaxy.typical.slice(0, 6).map(star => filmRow(star, {})));
    replace(scroll, head, doors, arms, made, typical);
    sheet.hidden = false;
    sheet.dataset.kind = 'galaxy';
    sheet.setAttribute('aria-label', galaxy.name);
    scroll.scrollTop = 0;
    requestAnimationFrame(() => sheet.classList.add('on'));
  }

  function hide() {
    shownStar = -1;
    parts = null;
    sheet.classList.remove('on', 'tall');
    sheet.hidden = true;
  }

  app.on(what => {
    if (what === 'arrival') arrival();
    else if (what === 'deep') deepField();
    else if (what === 'marks') marks();
    else if (what === 'sky') { place(); }
    else if (what === 'navigator') { arrival(); deepField(); }
  });

  return {
    showStar, showGalaxy, hide,
    width: () => (sheet.hidden || app.small ? 0 : sheet.getBoundingClientRect().width),
    height: () => (sheet.hidden || !app.small ? 0 : sheet.getBoundingClientRect().height),
    get star() { return shownStar; },
  };
}
