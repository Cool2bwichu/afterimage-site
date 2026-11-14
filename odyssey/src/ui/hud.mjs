// The instruments around the sky: where you are, the light you are seeing
// by, the Navigator's state, your wake, and whatever needs saying.
import { holdsArm } from '../engine/journey.mjs';
import { ALL_LIGHTS, lightById } from '../engine/lights.mjs';
import { UNLIT } from '../engine/universe.mjs';
import { describeSeeing } from '../engine/seeing.mjs';
import { h, icon, replace, plural } from './dom.mjs';
import { poster } from './posters.mjs';

export function createHud(app) {
  const { universe, state, store, pilot, cosmos, films } = app;

  // ── Top: the name of the place, and the tools.
  const crumbs = h('div.crumbs', { 'aria-live': 'polite' });
  const brand = h('button.brand', { type: 'button', title: 'Back to the whole universe (H)', onclick: () => app.goHome() },
    h('span.brand-mark', 'AFTERIMAGE'), h('span.brand-sub', 'The Odyssey'));
  const backButton = h('button.hud-back', { type: 'button', title: 'Back to where you were (Backspace)', 'aria-label': 'Back to where you were', hidden: true, onclick: () => app.back() }, icon('back', 16));

  const tool = (name, label, glyph, action, key = '') => {
    const count = h('span.tool-count');
    const button = h('button.tool', { type: 'button', title: key ? `${label} (${key})` : label, 'aria-label': label, 'aria-keyshortcuts': key || null, onclick: action }, icon(glyph), h('span.tool-label', label), count);
    return { button, count, name };
  };
  const tools = {
    search: tool('search', 'Find a film', 'search', () => app.searchView.open(), '/'),
    voyage: tool('voyage', 'Set out', 'compass', () => app.panels.toggle(state.tool?.name === 'course' ? 'course' : 'voyage')),
    sky: tool('sky', 'Your sky', 'heart', () => app.panels.toggle('sky')),
    figures: tool('figures', 'Constellations', 'constellation', () => app.panels.toggle('figures')),
    nebulae: tool('nebulae', 'Nebulae', 'nebula', () => app.panels.toggle('nebulae')),
    drift: tool('drift', 'Drift', 'drift', () => (state.drift ? app.stopDrift() : app.startDrift()), 'D'),
  };
  const navDot = h('span.nav-dot');
  const navLabel = h('span.nav-label', 'Finding the Navigator');
  const navChip = h('button.nav-chip', { type: 'button', 'aria-haspopup': 'dialog', onclick: () => app.panels.toggle('navigator') }, navDot, navLabel);
  const top = h('div.hud-top', h('div.hud-left', h('div.hud-brandline', backButton, brand), crumbs), h('nav.hud-tools', { 'aria-label': 'Tools' }, Object.values(tools).map(entry => entry.button), navChip));

  // ── Bottom: the dial of lights.
  const dialButtons = ALL_LIGHTS.map((light, n) => h('button.dial-light', {
    type: 'button', class: light.id === 'time' ? 'time' : '', style: { '--c': light.color }, title: `${light.name}: ${light.asks} (${n})`, 'aria-label': `${light.name}: ${light.asks}`,
    onclick: () => app.setSky(light.id),
  }, h('span.dial-swatch'), h('span.dial-name', light.name)));
  const dialLine = h('p.dial-line');
  // Tonight's seeing sits beside the lights: the light you see by, and how clear tonight is.
  const seeingButton = h('button.dial-seeing', {
    type: 'button', title: 'Tonight\'s seeing: what tonight can hold', 'aria-label': 'Tonight\'s seeing', 'aria-haspopup': 'dialog',
    onclick: () => app.panels.toggle('seeing'),
  }, icon('moon', 16));
  const dial = h('div.dial', { role: 'group', 'aria-label': 'The light the universe is seen by' }, h('div.dial-lights', seeingButton, dialButtons), dialLine);

  // ── Things said in passing.
  const captionText = h('p.caption-text');
  const caption = h('div.caption', { 'aria-live': 'polite' }, captionText);
  let captionTimer = 0;

  const toasts = h('div.toasts', { 'aria-live': 'polite' });
  const workingText = h('span.working-text');
  const working = h('div.working', { hidden: true }, h('span.working-pulse'), workingText,
    h('button.working-stop', { type: 'button', onclick: () => { pilot.cancel('tool'); api.working(''); } }, 'Stop'));

  const currentLabel = h('span.current-label');
  const currentNote = h('span.current-note');
  const currentList = h('button.current-list', { type: 'button', title: 'List its films, the truest first', onclick: () => app.panels.open('set') }, icon('list', 15), h('span', 'Films'));
  const current = h('div.current', { hidden: true }, h('span.current-dot'), h('span.current-text', currentLabel, currentNote), currentList,
    h('button.current-close', { type: 'button', 'aria-label': 'Put the lights back', onclick: () => app.setCurrent(null) }, icon('close', 15)));

  // ── A course, passage or trail being followed.
  const voyageName = h('span.voyage-name');
  const voyageStop = h('span.voyage-stop');
  const voyagePrev = h('button.voyage-step', { type: 'button', 'aria-label': 'Previous stop', onclick: () => app.voyageTo(Math.max(0, (state.voyage?.at ?? 0) - 1)) }, icon('back', 16));
  const voyageNext = h('button.voyage-step.next', { type: 'button', onclick: () => app.voyageTo(Math.min((state.voyage?.stops.length || 1) - 1, (state.voyage?.at ?? -1) + 1)) }, h('span', 'Next'), icon('arrow', 16));
  const panelOf = kind => ({ passage: 'passage', trail: 'set' }[kind] || 'course');
  const voyage = h('div.voyage', { hidden: true },
    h('button.voyage-open', { type: 'button', title: 'Show the whole voyage', onclick: () => app.panels.open(panelOf(state.voyage?.kind)) }, voyageName, voyageStop),
    voyagePrev, voyageNext,
    h('button.voyage-end', { type: 'button', 'aria-label': 'End this voyage', onclick: () => app.endVoyage() }, icon('close', 15)));

  // ── A voyage set out on: where it is, and the way to land it.
  const jbarKicker = h('span.jbar-kicker');
  const jbarName = h('span.jbar-name');
  const jbarLand = h('button.jbar-land', { type: 'button', onclick: () => app.land() }, icon('flag', 15), h('span', 'Land here'));
  const jbar = h('div.jbar', { hidden: true },
    h('button.jbar-open', { type: 'button', title: 'Show the voyage and its doors', onclick: () => app.panels.open('voyage') }, icon('door', 17), h('span.jbar-text', jbarKicker, jbarName)),
    jbarLand,
    h('button.jbar-end', { type: 'button', 'aria-label': 'End the voyage', title: 'End the voyage', onclick: () => app.endJourney() }, icon('close', 15)));

  // ── The wake: where you have been.
  const wakeList = h('div.wake-list');
  const wakeLog = h('p.wake-log');
  const wake = h('div.wake', { role: 'group', 'aria-label': 'Your wake' }, wakeList, wakeLog);

  const zoom = h('div.zoom',
    h('button', { type: 'button', 'aria-label': 'Closer', title: 'Closer (+)', onclick: () => cosmos.camera.zoom(0.62) }, icon('plus', 16)),
    h('button', { type: 'button', 'aria-label': 'Further', title: 'Further (−)', onclick: () => cosmos.camera.zoom(1.6) }, icon('minus', 16)),
    h('button', { type: 'button', 'aria-label': 'The whole universe', onclick: () => app.goHome() }, icon('home', 16)));

  const bottom = h('div.hud-bottom', wake, h('div.hud-centre', caption, voyage, jbar, dial), zoom);
  const layer = h('div.hud', top, h('div.hud-notices', current, working, toasts), bottom);
  app.root.querySelector('#app').append(layer);

  function place() {
    const sky = state.sky;
    const parts = [];
    const light = lightById(sky);
    parts.push(h('span.crumb.crumb-light', { style: { '--c': light.color } }, light.name));
    let g = -1;
    let armName = '';
    if (state.focus >= 0) {
      g = universe.galaxyOf[sky][state.focus];
      if (g !== UNLIT) {
        const galaxy = universe.galaxies[sky][g];
        const armIndex = universe.armOf[sky][state.focus];
        const arm = galaxy && galaxy.arms.find(entry => entry.arm === armIndex);
        armName = holdsArm(universe, state.focus, arm) ? arm.name : '';
      }
    } else if (state.galaxy >= 0) {
      g = state.galaxy;
      const arm = state.arm >= 0 && universe.galaxies[sky][g] ? universe.galaxies[sky][g].arms.find(entry => entry.arm === state.arm) : null;
      armName = arm ? arm.name : '';
    }
    if (g >= 0 && g !== UNLIT && universe.galaxies[sky][g]) {
      const galaxy = universe.galaxies[sky][g];
      parts.push(h('button.crumb', { type: 'button', onclick: () => app.openGalaxy(galaxy.g) }, galaxy.name));
      if (armName) parts.push(h('span.crumb.crumb-arm', armName));
    } else if (state.focus >= 0) {
      parts.push(h('span.crumb.crumb-arm', 'beyond the lit galaxies'));
    }
    replace(crumbs, parts.flatMap((part, n) => (n ? [h('span.crumb-sep', '›'), part] : [part])));
  }

  function lights() {
    ALL_LIGHTS.forEach((light, n) => {
      const on = light.id === state.sky;
      dialButtons[n].classList.toggle('on', on);
      dialButtons[n].setAttribute('aria-pressed', String(on));
    });
    const light = lightById(state.sky);
    const said = { white: ' · all six lights together', time: ' · the present at the centre, the past at the edge' }[state.sky];
    // On a phone the row of lights is too narrow to name the lit one: the line beneath it does.
    replace(dialLine,
      h('span.dial-say', h('strong', light.asks), said || ` · alike in ${light.short}`),
      h('span.dial-say-short', h('strong', light.name), ` · ${light.short}`));
  }

  function logbook() {
    const visited = app.marks.visited.size;
    const stars = store.state.wake.slice(-7).map(app.starOf).filter(i => i >= 0);
    const unique = stars.filter((star, n) => stars.indexOf(star) === n);
    replace(wakeList, unique.map(star => h('button.wake-star', {
      type: 'button', title: `${films[star].t} (${films[star].y})`, class: star === state.focus ? 'on' : '',
      onclick: () => app.focusStar(star),
    }, poster(films[star], { words: false }))));
    const found = state.found.size;
    const beyond = universe.count - universe.base;
    const parts = [];
    if (visited) parts.push(plural(visited, 'star'));
    if (found) parts.push(plural(found, 'constellation'));
    if (beyond) parts.push(`${beyond.toLocaleString('en')} beyond the chart`);
    wakeLog.textContent = parts.join(' · ');
    wake.classList.toggle('empty', !visited);
  }

  function counts() {
    const loved = app.marks.loved.size;
    tools.sky.count.textContent = loved ? String(loved) : '';
    tools.figures.count.textContent = state.found.size ? String(state.found.size) : '';
    tools.drift.button.classList.toggle('on', state.drift);
    tools.drift.button.setAttribute('aria-pressed', String(state.drift));
    const open = state.tool?.name === 'course' ? 'voyage' : state.tool?.name;
    for (const entry of Object.values(tools)) entry.button.classList.toggle('open', open === entry.name);
    tools.voyage.button.classList.toggle('on', Boolean(state.journey && !state.journey.landed));
    currentList.hidden = state.tool?.name === 'set';
  }

  function history() {
    backButton.hidden = !app.canGoBack();
  }

  function seeingState() {
    const said = describeSeeing(app.seeing);
    seeingButton.classList.toggle('on', Boolean(said));
    seeingButton.classList.toggle('open', state.tool?.name === 'seeing');
    seeingButton.setAttribute('aria-label', said ? `Tonight's seeing: ${said}` : 'Tonight\'s seeing: a clear sky');
    seeingButton.title = said ? `Tonight: ${said}` : 'Tonight\'s seeing: what tonight can hold';
  }

  function navigator() {
    const status = pilot.status;
    navChip.dataset.mode = status.mode;
    navLabel.textContent = status.label;
    navChip.title = status.detail || status.label;
  }

  function lit() {
    const set = state.current;
    current.hidden = !set;
    if (set) {
      current.style.setProperty('--c', set.colour || '#dec6a0');
      currentLabel.textContent = set.label.charAt(0).toUpperCase() + set.label.slice(1);
      currentNote.textContent = ` · ${plural(set.stars.size, 'film')}`;
      current.title = set.note || '';
    }
    keepClear();
  }

  // The names in the sky keep out from under the chip, measured once it has been laid out (a panel moves it).
  let clearing = 0;
  function keepClear() {
    cancelAnimationFrame(clearing);
    clearing = requestAnimationFrame(() => {
      const box = current.hidden ? null : current.getBoundingClientRect();
      app.labels?.setBlocked(box && box.width ? [[box.left - 6, box.top - 4, box.right + 6, box.bottom + 4]] : []);
    });
  }

  function journey() {
    const v = state.voyage;
    voyage.hidden = !v;
    if (v) {
      voyageName.textContent = v.name;
      voyageStop.textContent = v.at >= 0 ? `Stop ${v.at + 1} of ${v.stops.length}` : `${v.stops.length} stops`;
      voyagePrev.disabled = v.at <= 0;
      voyageNext.disabled = v.at >= v.stops.length - 1;
      voyageNext.firstChild.textContent = v.at < 0 ? 'Begin' : 'Next';
    }
    const j = state.journey;
    // The panel says all this at length; the bar is for when it is closed.
    jbar.hidden = !j || state.tool?.name === 'voyage';
    if (!j) return;
    const last = films[j.path[j.path.length - 1].star];
    const jumps = j.path.length - 1;
    jbar.classList.toggle('landed', j.landed);
    if (j.landed) {
      jbarKicker.textContent = j.shared ? 'A voyage that landed on' : 'Tonight';
      jbarName.textContent = last.t;
    } else {
      jbarKicker.textContent = jumps ? `Under way · ${plural(jumps, 'jump')}` : 'Setting out';
      jbarName.textContent = jumps ? `from ${films[j.origin].t}` : `from ${last.t}`;
    }
    jbarLand.hidden = j.landed || !jumps;
    jbarLand.lastChild.textContent = state.focus === j.path[jumps].star ? 'Land here' : `Land on ${last.t}`;
  }

  const api = {
    /** A line said in passing, in a light's colour. */
    caption(text, colour = '#f4efe5', hold = 4200) {
      clearTimeout(captionTimer);
      captionText.textContent = text;
      caption.style.setProperty('--c', colour);
      caption.classList.add('on');
      captionTimer = setTimeout(() => caption.classList.remove('on'), hold);
    },
    /** Something worth stopping for. */
    toast(text, { detail = '', action = '', onAction = null, tone = '', hold = 7000 } = {}) {
      const close = () => { item.classList.remove('on'); setTimeout(() => item.remove(), 400); };
      const item = h('div.toast', { class: tone ? `tone-${tone}` : '' },
        h('div.toast-body', h('p.toast-text', text), detail ? h('p.toast-detail', detail) : null),
        action ? h('button.toast-action', { type: 'button', onclick: () => { close(); onAction?.(); } }, action) : null,
        h('button.toast-close', { type: 'button', 'aria-label': 'Dismiss', onclick: close }, icon('close', 14)));
      toasts.append(item);
      while (toasts.children.length > 3) toasts.firstChild.remove();
      requestAnimationFrame(() => item.classList.add('on'));
      setTimeout(close, hold);
      return { close, get shown() { return item.isConnected && item.classList.contains('on'); } };
    },
    /** A long call in progress, with a way to stop it. Empty text clears it. */
    working(text) {
      working.hidden = !text;
      workingText.textContent = text;
    },
    setEntered(on) { layer.classList.toggle('entered', on); },
    update(what) {
      if (!what || what === 'focus' || what === 'sky') place();
      if (!what || what === 'sky') lights();
      if (!what || what === 'focus' || what === 'marks' || what === 'deep') logbook();
      if (!what || what === 'marks' || what === 'drift' || what === 'tool' || what === 'focus') counts();
      if (!what || what === 'navigator') navigator();
      if (!what || what === 'current') lit();
      else if (what === 'focus' || what === 'tool') keepClear();
      if (!what || what === 'voyage' || what === 'focus' || what === 'journey' || what === 'tool') journey();
      if (!what || what === 'journey') counts();
      if (!what || what === 'history') history();
      if (!what || what === 'seeing' || what === 'tool') seeingState();
    },
  };
  app.on(api.update);
  api.update();
  return api;
}
