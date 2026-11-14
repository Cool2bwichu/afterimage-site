// The dossier: what is known of the star you have reached, and the six rays
// that lead away from it. Everything here says where it came from: the chart
// (computed), the encyclopedia, or Claude reading as the Navigator.
import { lightById } from '../engine/lights.mjs';
import { UNLIT } from '../engine/universe.mjs';
import { holdsArm } from '../engine/journey.mjs';
import { closestLight, sharedTraits, traitsOf } from '../engine/voyage.mjs';
import { TIME, TIME_RINGS } from '../engine/time.mjs';
import { TEMPERS, TEMPER_COLOUR, bendsOf, temperOf, temperWord } from '../engine/temper.mjs';
import { h, icon, replace, plural } from './dom.mjs';
import { poster } from './posters.mjs';
import { createGrip } from './grip.mjs';

const SOURCES = {
  chart: ['charted', 'Computed from the chart: what the two films are recorded as sharing.'],
  claude: ['read by Claude', 'Written by Claude as the Navigator, from its own knowledge of the films.'],
  ahead: ['read by Claude ahead of time', 'Written by Claude as the Navigator when the chart was printed, before you arrived.'],
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
  const grip = h('button.sheet-grip', { type: 'button', 'aria-label': 'Make this panel taller or shorter' });
  const sheet = h('aside.sheet.sheet-right.dossier', { 'aria-label': 'The star you have reached', hidden: true },
    grip,
    h('button.sheet-close', { type: 'button', 'aria-label': 'Leave this star', onclick: () => app.blur() }, icon('close', 18)),
    scroll);
  app.root.querySelector('#app').append(sheet);
  createGrip({ sheet, grip, onResize: () => app.frameCosmos(), onClose: () => app.blur() });
  // The sky is framed again once the sheet has finished growing or shrinking.
  sheet.addEventListener('transitionend', event => { if (event.target === sheet && event.propertyName === 'height') app.frameCosmos(); });

  // Someone reading is not moved on by the drift: a mouse resting on the sheet, or a finger that touched it lately.
  let over = false;
  let touched = -1e9;
  sheet.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') over = true; });
  sheet.addEventListener('pointerleave', event => { if (event.pointerType === 'mouse') over = false; });
  sheet.addEventListener('pointerdown', () => { touched = performance.now(); });
  scroll.addEventListener('scroll', () => { touched = performance.now(); }, { passive: true });

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
  const traitName = trait => universe.traits[trait].s || universe.traits[trait].t;

  function filmRow(star, { light = null, colour = null, kicker = '', body = null, onGo, tag = null, go = 'arrow', title = null }) {
    const film = films[star];
    const tint = colour || (light ? lightById(light).color : null);
    return h('button.frow', {
      type: 'button', style: tint ? { '--c': tint } : null, class: tint ? 'has-light' : '', title,
      onclick: onGo || (() => app.focusStar(star, light ? { light } : {})),
      onpointerenter: () => cosmos.setHover(star), onpointerleave: () => cosmos.setHover(-1),
    },
    h('span.frow-poster', poster(film, { words: false })),
    h('span.frow-text',
      kicker ? h('span.frow-kicker', kicker, tag) : null,
      h('span.frow-title', film.t, h('span.frow-year', String(film.y))),
      body),
    h('span.frow-go', icon(go, 15)));
  }

  // The plain facts of a film, and the ways out to the rest of the web.
  const metaOf = film => [String(film.y), film.d, (film.c || []).slice(0, 2).join(', '), film.rt ? `${film.rt} min` : ''].filter(Boolean).join(' · ');
  const linksOf = film => [
    film.w ? h('a.ext', { href: `https://en.wikipedia.org/wiki/${encodeURIComponent(film.w.replace(/ /g, '_'))}`, target: '_blank', rel: 'noopener noreferrer' }, 'Wikipedia') : null,
    film.im ? h('a.ext', { href: `https://www.imdb.com/title/${film.im}/`, target: '_blank', rel: 'noopener noreferrer' }, 'IMDb') : null,
    h('a.ext', { href: `https://letterboxd.com/search/films/${encodeURIComponent(`${film.t} ${film.y}`)}/`, target: '_blank', rel: 'noopener noreferrer' }, 'Letterboxd'),
  ];
  /** A catalogue has answered for a star from beyond the chart while its dossier was open. */
  function facts() {
    if (!parts) return;
    const film = films[parts.star];
    parts.meta.textContent = metaOf(film);
    replace(parts.links, linksOf(film));
  }

  // ── A star.
  function showStar(star) {
    shownStar = star;
    const film = films[star];
    const deep = universe.isDeep(star);

    const act = (name, glyph, label, set) => h(`button.act.act-${name}`, { type: 'button', onclick: () => app.toggle(set, star) }, icon(glyph, 17), h('span', label));
    const love = act('love', 'heart', 'Love', 'loved');
    const save = act('save', 'bookmark', 'Add to watchlist', 'watchlist');
    const seen = act('seen', 'check', 'Watched', 'seen');
    const aside = h('button.act-aside', { type: 'button', title: 'Never offer this film as somewhere to go next', onclick: () => app.toggle('hidden', star) }, icon('aside', 15), h('span', 'Not for me'));
    const asideNote = h('p.aside-note', { hidden: true }, 'Set aside. It will not be offered as somewhere to go next.',
      h('button.quiet', { type: 'button', onclick: () => app.toggle('hidden', star, false) }, 'Undo'));
    const kicker = h('p.dossier-kicker');
    const meta = h('p.dossier-meta', metaOf(film));
    const hazeLine = h('p.dossier-haze', { hidden: true });
    const head = h('header.dossier-head', { style: { '--hi': film.hi, '--lo': film.lo } },
      h('div.dossier-poster', poster(film, { eager: true, size: 'large' })),
      h('div.dossier-id',
        kicker,
        h('h2.dossier-title', film.t),
        meta,
        hazeLine,
        deep ? h('p.dossier-deep', source('memory')) : null),
      h('div.dossier-acts', love, save, seen, aside),
      asideNote);

    const voyage = h('div.dossier-voyage', { hidden: true });
    const essence = section('essence', null);
    const sight = section('sight', null);
    sight.hidden = true;
    const rays = section('rays', null);
    const holes = section('wormhole', null);
    holes.hidden = true;
    const temperBox = section('temper', null);
    const deeper = section('deeper', null);

    const drawn = (linesOf.get(star) || []).filter(line => line.other < universe.count).sort((a, b) => b.strength - a.strength).slice(0, 8);
    const lines = drawn.length ? section('lines', h('span', 'Lines drawn in the atlas', source('atlas')),
      drawn.map(line => filmRow(line.other, { kicker: line.type, body: line.claim ? h('span.frow-claim', line.claim) : null }))) : null;

    const groups = traitsOf(universe, star, 5).map(({ light, traits }) => ({ light, traits: traits.filter(t => !t.veiled).slice(0, 5) })).filter(group => group.traits.length);
    // Two traits of one group with the same short name (directed by and written by
    // David Lynch) are each given their whole name.
    const chipName = traits => {
      const count = new Map();
      for (const { trait } of traits) count.set(traitName(trait).toLowerCase(), (count.get(traitName(trait).toLowerCase()) || 0) + 1);
      return trait => (count.get(traitName(trait).toLowerCase()) > 1 ? universe.traits[trait].t : traitName(trait));
    };
    const traitsSection = groups.length ? section('traits', h('span', 'What this star is made of', source(deep ? 'memory' : 'chart')),
      h('p.dsec-note', 'Choose any one to see every film that shares it, the truest first.'),
      groups.map(group => {
        const name = chipName(group.traits);
        return h('div.trait-group', { style: { '--c': lightById(group.light).color } },
          h('span.trait-light', lightById(group.light).name),
          h('div.trait-chips', group.traits.map(({ trait }) => h('button.chip', { type: 'button', onclick: () => app.browse('trait', trait) }, name(trait)))));
      })) : null;

    const shape = storyShape(film);
    const recall = film.rc ? veiled('What stays with people', film.rc, deep ? 'memory' : 'atlas', 'This may give something away.') : null;

    const links = h('p.ext-row', linksOf(film));
    const tools = section('tools', 'From here',
      h('div.tool-row',
        h('button.act', { type: 'button', onclick: () => app.panels.open('collide', { a: star }) }, icon('collide', 17), h('span', 'Collide with…')),
        h('button.act', { type: 'button', onclick: () => app.panels.open('passage', { a: star }) }, icon('passage', 17), h('span', 'Passage to…')),
        h('button.act', { type: 'button', onclick: () => app.share() }, icon('share', 17), h('span', 'Share'))),
      links);

    parts = { star, kicker, meta, links, love, save, seen, aside, asideNote, voyage, essence, sight, rays, holes, temper: temperBox, deeper, haze: hazeLine };
    // The rays come before anything that may give the story away. In Lookback the line of sight comes first.
    replace(scroll, head, voyage, essence, sight, rays, holes, temperBox, recall, deeper, lines, traitsSection, shape, tools);
    sheet.hidden = false;
    sheet.dataset.kind = 'star';
    sheet.setAttribute('aria-label', `${film.t}, ${film.y}`);
    scroll.scrollTop = 0;
    requestAnimationFrame(() => sheet.classList.add('on'));
    place(); marks(); journey(); arrival(); wormhole(); deepField(); timeline(); temper(); hazeNote();
  }

  // ── A wormhole: a film far across the sky that is yet one of the nearest in what happens, how it feels, or what it is about.
  const ordinal = n => {
    const tens = n % 100;
    const suffix = tens > 10 && tens < 14 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th';
    return `${n.toLocaleString('en')}${suffix}`;
  };
  function wormhole() {
    if (!parts || parts.star !== state.focus) return;
    const holes = state.holes || [];
    const box = parts.holes;
    box.hidden = !holes.length;
    if (!holes.length) { replace(box); return; }
    const colour = app.colours.wormhole;
    const rows = holes.map((hole, n) => {
      const light = lightById(hole.light);
      const galaxy = universe.galaxies.white[universe.galaxyOf.white[hole.star]];
      return filmRow(hole.star, {
        colour, go: 'wormhole', title: `Go through to ${films[hole.star].t}`,
        kicker: h('span.worm-kick', h('span.kick-dot', { style: { '--c': light.color } }), `Near in ${light.short}`),
        body: [
          h('span.frow-shared', `Both: ${hole.shared.map(traitName).join(' \u00b7 ')}`),
          h('span.worm-far', `Under white light only the ${ordinal(hole.rank + 1)} most alike${galaxy ? `, out in ${galaxy.name}` : ''}`),
        ],
        onGo: () => app.throughWormhole(n),
      });
    });
    replace(box,
      h('h3.dsec-title', h('span', holes.length > 1 ? 'Two wormholes' : 'A wormhole', source('chart'))),
      h('p.dsec-note', 'Far across the sky from here, in another galaxy and far down the list of films most like it, yet one of its nearest in one deep thing. The short way through.'),
      rows);
  }

  /** A film outside tonight's seeing says why, and offers the way to change it. */
  function hazeNote() {
    if (!parts) return;
    const why = app.outsideSeeing(parts.star);
    parts.haze.hidden = !why.length;
    replace(parts.haze, why.length ? [icon('moon', 13), h('span', `Outside tonight's seeing: ${why.join(', ')}. `),
      h('button.quiet', { type: 'button', onclick: () => app.panels.open('seeing') }, 'Change it')] : []);
  }

  // ── Its temper: how the film treats you, in five readings, and the films it bends into.
  function temper() {
    if (!parts) return;
    const star = parts.star;
    const film = films[star];
    const own = temperOf(film);
    const box = parts.temper;
    if (!own) { box.hidden = true; replace(box); return; }
    box.hidden = false;
    const deep = universe.isDeep(star);
    const rows = TEMPERS.map((entry, n) => (own[n] >= 0
      ? h('div.temper-row', { role: 'listitem', title: `${entry.name}: 0 is ${entry.low}, 100 is ${entry.high}`, 'aria-label': `${entry.name}: ${temperWord(entry.id, own[n])}, ${own[n]} of 100` },
        h('span.temper-name', entry.name),
        h('span.temper-track', { 'aria-hidden': 'true' }, h('span.temper-fill', { style: { width: `${Math.max(3, own[n])}%` } })),
        h('span.temper-word', { 'aria-hidden': 'true' }, temperWord(entry.id, own[n])))
      : null)).filter(Boolean);
    const offered = bendsOf(universe, star, { exclude: app.notFor });
    replace(box,
      h('h3.dsec-title', h('span', 'Its temper', source(deep ? 'memory' : 'atlas'))),
      h('div.temper', { role: 'list', 'aria-label': `How ${film.t} treats you` }, rows),
      offered.length ? h('div.bend',
        h('p.bend-lead', `Like ${film.t}, but…`),
        h('div.trait-chips', offered.map(entry => {
          const lit = state.current?.kind === 'bend' && state.current.id === `${star}:${entry.id}:${entry.direction}`;
          return h('button.chip.bend-chip', {
            type: 'button', style: { '--c': TEMPER_COLOUR }, class: lit ? 'on' : '', 'aria-pressed': String(lit),
            title: `The films most like ${film.t}, ${entry.label}`,
            onclick: () => (lit ? app.panels.open('set') : app.bendTo(star, entry.id, entry.direction)),
          }, entry.label);
        }))) : null,
      deep ? null : reasons(star));
  }

  /** Why the atlas reads a film's temper as it does: its own notes, fetched when first asked for. */
  function reasons(star) {
    const placeholder = TEMPERS.map(entry => h('p.temper-reason', h('strong', `${entry.name}. `), 'What the atlas saw in it.'));
    const body = h('div.veil-text.temper-why', placeholder);
    const label = h('span', 'Develop');
    const lift = h('button.veil-lift', {
      type: 'button', 'aria-label': 'Show why the atlas reads its temper so',
      onclick: async () => {
        lift.disabled = true;
        label.textContent = 'Developing';
        try {
          const notes = await app.deepen();
          if (!parts || parts.star !== star) return;
          const own = temperOf(films[star]);
          const why = (notes[star] && notes[star].ax) || [];
          const said = TEMPERS.map((entry, n) => (why[n] && own[n] >= 0 ? h('p.temper-reason', h('strong', `${entry.name}, ${own[n]}. `), why[n]) : null)).filter(Boolean);
          replace(body, said.length ? said : h('p.temper-reason', 'The atlas left no notes on this film.'));
          wrap.classList.add('lifted');
        } catch {
          lift.disabled = false;
          label.textContent = 'Could not fetch the notes. Try again';
        }
      },
    }, icon('eye', 15), label);
    const wrap = h('div.veil', body, lift);
    return h('div.temper-reasons', h('p.temper-why-title', 'Why it reads so'), wrap, h('p.dsec-note', 'The atlas\'s own notes. They may give the story away.'));
  }

  // ── Lookback: the line of sight through a film, back toward the horizon and forward toward the present.
  function timeline() {
    if (!parts || parts.star !== state.focus) return;
    const star = parts.star;
    const film = films[star];
    if (state.sky !== TIME || !film.y) { parts.sight.hidden = true; replace(parts.sight); return; }
    const line = app.lineOf(star);
    const row = (step, direction) => {
      const other = films[step.star];
      const years = Math.abs(other.y - film.y);
      const light = closestLight(universe, step.from, step.star).light;
      const shared = sharedTraits(universe, 'white', step.from, step.star, 2).map(entry => traitName(entry.trait));
      const said = step.from === star ? 'Both' : `With ${films[step.from].t}`;
      return filmRow(step.star, {
        colour: direction < 0 ? TIME_RINGS.before.color : TIME_RINGS.after.color,
        kicker: years ? `${plural(years, 'year')} ${direction < 0 ? 'before' : 'after'}` : 'the same year',
        body: shared.length ? h('span.frow-shared', `${said}: ${shared.join(' · ')}`) : null,
        onGo: () => app.focusStar(step.star, { light }),
      });
    };
    parts.sight.hidden = false;
    replace(parts.sight,
      h('h3.dsec-title', h('span', 'Its line of sight', source('chart'))),
      h('p.dsec-note', line.back.length || line.forth.length
        ? 'Outward from it, back toward the horizon: the film most like it at least four years older, then the one most like that. Inward, the same toward the present.'
        : 'Nothing on the chart lies far enough back or forward along its line.'),
      line.back.length ? h('div.sight-run', h('p.sight-way', 'Back through time'), line.back.map(step => row(step, -1))) : null,
      line.forth.length ? h('div.sight-run', h('p.sight-way', 'Toward the present'), line.forth.map(step => row(step, 1))) : null);
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
      replace(parts.kicker, h('span.kick-dot', { style: { '--c': light.color } }), sky === TIME
        ? 'No year on record, so it cannot be placed in time'
        : `Unlit under ${light.name.toLowerCase()}: the chart has nothing to place it by here`);
      return;
    }
    const galaxy = universe.galaxies[sky][g];
    const within = galaxy.arms.find(entry => entry.arm === universe.armOf[sky][parts.star]);
    const arm = holdsArm(universe, parts.star, within) ? within : null;
    replace(parts.kicker,
      h('span.kick-dot', { style: { '--c': light.color } }),
      h('button.kick-link', { type: 'button', onclick: () => app.openGalaxy(galaxy.g) }, galaxy.name),
      arm ? h('span.kick-arm', ' · ') : null,
      arm ? h('button.kick-link.kick-arm-link', { type: 'button', onclick: () => app.openGalaxy(galaxy.g, arm.arm) }, arm.name) : null);
  }

  function marks() {
    if (!parts) return;
    const star = parts.star;
    const set = (button, on, offLabel, onLabel) => {
      button.classList.toggle('on', on);
      button.setAttribute('aria-pressed', String(on));
      button.lastChild.textContent = on ? onLabel : offLabel;
    };
    set(parts.love, app.marks.loved.has(star), 'Love', 'Loved');
    set(parts.save, app.marks.watchlist.has(star), 'Add to watchlist', 'On your watchlist');
    set(parts.seen, app.marks.seen.has(star), 'Watched', 'Watched');
    const hidden = app.marks.hidden.has(star);
    parts.aside.hidden = hidden;
    parts.asideNote.hidden = !hidden;
  }

  // ── A voyage under way, or landed, at this star.
  function journey() {
    if (!parts) return;
    const j = state.journey;
    const at = j ? j.path[j.path.length - 1].star : -1;
    const band = parts.voyage;
    if (!j || at !== parts.star) { band.hidden = true; replace(band); return; }
    const origin = films[j.origin];
    const jumps = j.path.length - 1;
    band.hidden = false;
    if (j.landed) {
      replace(band,
        h('p.dv-kicker', icon('flag', 14), h('span', j.shared ? 'A voyage someone shared' : 'Tonight\'s film')),
        h('p.dv-text', jumps
          ? `Found on a voyage of ${plural(jumps, 'jump')} from ${origin.t}.`
          : 'The voyage ended where it began.'),
        h('div.dv-acts',
          h('button.act', { type: 'button', onclick: () => app.panels.open('voyage') }, icon('passage', 16), h('span', 'The voyage')),
          h('button.act', { type: 'button', onclick: () => app.share() }, icon('share', 16), h('span', 'Share'))));
      return;
    }
    replace(band,
      h('p.dv-kicker', icon('door', 14), h('span', jumps ? `On a voyage · ${plural(jumps, 'jump')} from ${origin.t}` : 'Setting out')),
      h('p.dv-text', jumps ? 'Three doors open from here, each under its own light. Take one, or land: this could be tonight\'s film.' : 'Three doors open from here, each under its own light onto a film near this one. Take one to begin.'),
      h('div.dv-acts',
        h('button.act', { type: 'button', onclick: () => app.panels.open('voyage') }, icon('door', 16), h('span', 'The doors')),
        jumps ? h('button.act.act-primary', { type: 'button', onclick: () => app.land() }, icon('flag', 16), h('span', 'Land here')) : null));
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
    const by = a && a.ahead ? 'ahead' : 'claude';

    if (a && a.essence) {
      nodes.push(h('p.essence-text', a.essence), h('p.essence-by', source(by),
        status === 'read' ? (pilot.connected ? h('button.quiet', { type: 'button', onclick: () => app.readArrival(true) }, a.ahead ? 'Read it now' : 'Read again') : null) : h('span.developing', 'developing')));
    } else {
      if (status === 'asking' || status === 'draft') {
        nodes.push(h('div.reading', h('span.reading-pulse'), h('span', 'The Navigator is reading this star'),
          h('button.quiet', { type: 'button', onclick: () => app.stopArrival() }, 'Stop')));
      }
      if (film.x) nodes.push(h('p.synopsis', firstSentences(film.x)), h('p.essence-by', source(deep ? 'memory' : 'book')));
      if (status === 'offline') {
        nodes.push(pilot.canConnect
          ? h('p.nav-off', 'The Navigator is not connected, so no one is reading this star to you. What you see is the chart.',
            h('button.quiet', { type: 'button', onclick: () => app.panels.open('navigator') }, 'Connect'))
          : h('p.nav-off', 'Claude is not answering in this view, so no one is reading this star to you. What you see is the chart.'));
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
      const shared = ray.shared.map(entry => traitName(entry.trait));
      const body = ray.read
        ? [h('span.frow-claim', ray.claim), ray.watch ? h('span.frow-watch', h('em', 'Watch for '), ray.watch.replace(/^watch for\s*/i, '')) : null]
        : h('span.frow-shared', shared.length ? `Both: ${shared.join(' · ')}` : 'Nearest under this light');
      return filmRow(ray.star, { light: ray.light, kicker: `${light.name} · ${light.asks.toLowerCase()}`, body, tag: source(ray.read ? by : 'chart') });
    });
    const beyond = a && a.beyond ? beyondCard(a.beyond, by) : null;
    const under = state.journey && !state.journey.landed;
    replace(parts.rays,
      h('h3.dsec-title', h('span', 'Six rays lead on from here')),
      h('p.dsec-note', anyRead
        ? 'Under each light, the film Claude chose as this one\'s truest companion.'
        : 'Under each light, the film the chart places nearest. Follow one, or change the light and watch the universe re-form around this star.'),
      rows.length ? rows : h('p.dsec-note', 'The chart has nothing near this star yet.'),
      beyond,
      under ? null : h('button.act.act-setout', { type: 'button', onclick: () => app.setOut(star) }, icon('door', 17), h('span', 'Set out on a voyage from here')));
  }

  function beyondCard(beyond, by) {
    const known = app.search.exact(beyond.title, beyond.year);
    return h('div.beyond',
      h('p.beyond-kicker', 'Beyond the chart', source(by)),
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
      nodes.push(h('p.dsec-note', `The chart holds ${universe.base.toLocaleString('en')} films. Claude knows a great many more. Look deeper and the Navigator charts films from beyond it, near this star.`));
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
      if (!pilot.connected) nodes.push(h('p.nav-off', 'This needs the Navigator.', pilot.canConnect ? h('button.quiet', { type: 'button', onclick: () => app.panels.open('navigator') }, 'Connect') : null));
    }
    replace(parts.deeper, nodes);
  }

  // ── A galaxy, and one of its star systems.
  const doorGrid = stars => h('div.door-grid', stars.slice(0, 5).map(star => h('button.door', {
    type: 'button', title: `${films[star].t} (${films[star].y})`, onclick: () => app.focusStar(star),
    onpointerenter: () => cosmos.setHover(star), onpointerleave: () => cosmos.setHover(-1),
  }, poster(films[star]), h('span.door-title', films[star].t))));
  const armRow = (g, arm, on = false) => h('button.arm-row', { type: 'button', class: on ? 'on' : '', onclick: () => app.openGalaxy(g, arm.arm) },
    h('span.arm-name', arm.name), h('span.arm-size', plural(arm.size, 'film')),
    h('span.arm-lead', arm.lead.slice(0, 3).map(star => films[star].t).join(' · ')));

  function showSheet(kind, label) {
    sheet.hidden = false;
    sheet.dataset.kind = kind;
    sheet.setAttribute('aria-label', label);
    scroll.scrollTop = 0;
    requestAnimationFrame(() => sheet.classList.add('on'));
  }

  function showGalaxy(g) {
    shownStar = -1;
    parts = null;
    const sky = state.sky;
    const galaxy = universe.galaxies[sky][g];
    const light = lightById(sky);
    const ring = Boolean(galaxy.ring); // a decade of Lookback
    const share = ([trait, percent]) => h('button.chip', { type: 'button', onclick: () => app.browse('trait', trait) }, traitName(trait), h('span.chip-n', `${percent}%`));
    const head = h('header.galaxy-head', { style: { '--c': light.color } },
      h('p.dossier-kicker', h('span.kick-dot', { style: { '--c': light.color } }), ring ? 'A decade, seen in Lookback' : `A galaxy under ${light.name.toLowerCase()}`),
      h('h2.dossier-title', galaxy.name),
      h('p.galaxy-thesis', galaxy.thesis),
      h('p.dossier-meta', `${plural(galaxy.size, 'film')} · ${ring ? plural(galaxy.arms.length, 'kind') + ' of film' : plural(galaxy.arms.length, 'star system')}`),
      h('div.dossier-acts', h('button.act.act-primary', { type: 'button', onclick: () => app.browse('galaxy', g) }, icon('list', 16), h('span', `Browse its ${plural(galaxy.size, 'film')}`))));
    const doors = section('doors', h('span', 'Ways in', source('chart')),
      h('p.dsec-note', ring ? 'The best-known film of each of its largest kinds.' : 'Well-known films near its heart.'),
      doorGrid(galaxy.doors));
    const arms = section('arms', ring ? 'Its kinds of film' : 'Its star systems', galaxy.arms.map(arm => armRow(g, arm)));
    const made = section('traits', h('span', ring ? 'What sets it apart' : 'What holds it together', source('chart')),
      ring ? h('p.dsec-note', 'Carried by many of its films, and by few films of other years.') : null,
      h('div.trait-chips', galaxy.top.slice(0, 10).map(share)));
    const typical = section('typical', 'At its heart',
      galaxy.typical.slice(0, 6).map(star => filmRow(star, {})));
    replace(scroll, head, doors, arms, made, typical);
    showSheet('galaxy', galaxy.name);
  }

  /** A kind of film through the decades of Lookback: how much of it each ring holds, each a way to that ring. */
  function kindThroughTime(kind, at) {
    const decades = universe.galaxies[TIME] || [];
    const counts = decades.map(decade => decade.arms.find(arm => arm.arm === kind)?.size || 0);
    const most = Math.max(1, ...counts);
    return h('div.kind-time', { role: 'group', 'aria-label': 'How many of its films each decade holds' }, decades.map((decade, g) => {
      const n = counts[g];
      const short = decade.name.replace(/^The /, '').replace(/^Before /, '<');
      return h('button.kind-decade', {
        type: 'button', class: g === at ? 'on' : '', disabled: !n, 'aria-current': g === at ? 'true' : null,
        title: `${decade.name}: ${plural(n, 'film')}`, 'aria-label': `${decade.name}: ${plural(n, 'film')}`,
        onclick: () => app.openGalaxy(g, kind),
      }, h('span.kind-bar', { style: { '--h': `${Math.round((n / most) * 100)}%` } }), h('span.kind-label', short));
    }));
  }

  function showArm(g, armIndex) {
    const sky = state.sky;
    const galaxy = universe.galaxies[sky][g];
    const arm = galaxy && galaxy.arms.find(entry => entry.arm === armIndex);
    if (!arm) { showGalaxy(g); return; }
    shownStar = -1;
    parts = null;
    const light = lightById(sky);
    const ring = Boolean(galaxy.ring);
    const head = h('header.galaxy-head.arm-head', { style: { '--c': light.color } },
      h('p.dossier-kicker', h('span.kick-dot', { style: { '--c': light.color } }), ring ? 'A kind of film, in ' : 'A star system in ',
        h('button.kick-link', { type: 'button', onclick: () => app.openGalaxy(g) }, galaxy.name)),
      h('h2.dossier-title', arm.name.replace(' · ', '\u00a0· ')),
      h('p.dossier-meta', ring ? `${plural(arm.size, 'film')} made ${app.when(galaxy)}` : `${plural(arm.size, 'film')} · under ${light.name.toLowerCase()}`),
      h('div.dossier-acts', h('button.act.act-primary', { type: 'button', onclick: () => app.browse('arm', g, armIndex) }, icon('list', 16), h('span', `Browse its ${plural(arm.size, 'film')}`))));
    const lead = section('doors', h('span', 'Its brightest stars', source('chart')), doorGrid(arm.lead));
    const made = section('traits', h('span', 'What holds it together', source('chart')),
      h('div.trait-chips', (arm.top || []).slice(0, 8).map(trait => h('button.chip', { type: 'button', onclick: () => app.browse('trait', trait) }, traitName(trait)))));
    const history = ring ? section('kind-time', h('span', `${arm.name} through the decades`, source('chart')),
      h('p.dsec-note', 'How many of its films each decade holds. Choose one to go there.'),
      kindThroughTime(armIndex, g)) : null;
    const others = galaxy.arms.filter(entry => entry.arm !== armIndex);
    const siblings = others.length ? section('arms', ring ? `Other kinds ${app.when(galaxy)}` : `The other systems of ${galaxy.name}`, others.map(entry => armRow(g, entry))) : null;
    replace(scroll, head, lead, history, made, siblings);
    showSheet('arm', ring ? `${arm.name}, ${app.when(galaxy)}` : `${arm.name}, in ${galaxy.name}`);
  }

  function hide() {
    shownStar = -1;
    parts = null;
    over = false;
    sheet.classList.remove('on', 'tall');
    sheet.hidden = true;
  }

  app.on(what => {
    if (what === 'arrival') { arrival(); wormhole(); }
    else if (what === 'deep') deepField();
    else if (what === 'marks' || what === 'current') { if (what === 'marks') { marks(); wormhole(); } temper(); }
    else if (what === 'seeing') { hazeNote(); arrival(); wormhole(); }
    else if (what === 'sky') { place(); timeline(); }
    else if (what === 'holes') wormhole();
    else if (what === 'navigator') { arrival(); deepField(); }
    else if (what === 'facts') facts();
    else if (what === 'journey') { journey(); arrival(); }
  });

  return {
    showStar, showGalaxy, showArm, hide,
    /** Whether someone is reading the sheet now. */
    reading: () => !sheet.hidden && (over || performance.now() - touched < 8000),
    width: () => (sheet.hidden || app.small ? 0 : sheet.getBoundingClientRect().width),
    height: () => (sheet.hidden || !app.small ? 0 : sheet.getBoundingClientRect().height),
    get star() { return shownStar; },
  };
}
