// The voyage itself: what happens when a star is reached, a light is changed,
// a course is plotted, a door is taken, a film is landed on. Views draw; this decides.
import { ALL_LIGHTS, LIGHT_IDS, lightById } from '../engine/lights.mjs';
import { UNLIT } from '../engine/universe.mjs';
import { prism, passage, between, driftNext, carriers, constellationProgress, sharedTraits, closestLight } from '../engine/voyage.mjs';
import { doors, homeLikeness, rings, routeOf, typicality } from '../engine/journey.mjs';
import { attachControls } from '../cosmos/camera.mjs';
import { createOrbits } from '../cosmos/orbits.mjs';
import { createFigures } from '../cosmos/figures.mjs';
import { hexToRgb } from '../cosmos/math.mjs';
import { createHud } from './hud.mjs';
import { createDossier } from './dossier.mjs';
import { createSearchView } from './search.mjs';
import { createPanels } from './panels.mjs';
import { createEntrance } from './entrance.mjs';
import { h } from './dom.mjs';

const RGB = Object.fromEntries(ALL_LIGHTS.map(light => [light.id, hexToRgb(light.color)]));
const IVORY = [0.96, 0.94, 0.9];
const STARLIGHT = [0.87, 0.78, 0.63];
const GOLD = [0.94, 0.79, 0.53];
const SILVER = [0.61, 0.73, 0.73];
const PALE = [0.8, 0.88, 1];
// The whole universe in one look: how far back, how steeply, and how far the camera leans toward the viewer.
export const OVERVIEW = { reach: 2.0, reachSmall: 3.4, pitch: 0.95, bias: 0.125 };
const DRIFT_EVERY = 12500;
const HUD_TOP = 76; // the instruments along the top of the screen, and where you are beneath them
const KEYS = [['/', 'find a film'], ['0–6', 'change the light'], ['← → ↑ ↓', 'turn the sky'], ['+ −', 'nearer, further'], ['Backspace', 'go back'], ['Esc', 'leave or close'], ['L', 'love'], ['W', 'watchlist'], ['D', 'drift'], ['H', 'the whole universe'], ['?', 'these keys']];

export function createApp({ root, universe, depth, cosmos, labels, pilot, store, search, small, reducedMotion, edition = 'site' }) {
  const state = {
    sky: 'white',
    focus: -1,
    galaxy: -1,
    arm: -1,
    arrival: null,        // what the Navigator said of the focused star
    arrivalState: 'idle', // idle | looking (for a reading written ahead) | asking | draft | read | failed | waiting | offline
    arrivalNote: '',
    rays: [],             // the six rays of the focused star: [{ light, star, shared, claim, watch, read }]
    deep: new Map(),      // star → [{ star, light, claim }] found by looking deeper from it
    deepState: 'idle',
    current: null,        // a lit set: { kind, id, label, note, stars: Set, colour, light, strength? }
    tool: null,           // the open tool panel: { name }
    voyage: null,         // a course, passage or trail being followed: { kind, name, stops: [...], at }
    journey: null,        // a voyage set out on: { origin, path: [{ star, light, shared }], doors, landed, shared }
    system: false,        // whether the focused star's system is open around it
    drift: false,
    entered: false,
    readArrivals: store.state.readArrivals,
    found: new Set(),     // constellations found so far
  };
  const listeners = new Set();
  const films = universe.films;
  const starOf = slug => universe.indexOfSlug(slug);
  const slugOf = star => films[star].s;

  const toStars = slugs => new Set([...slugs].map(starOf).filter(i => i >= 0));
  const sets = () => ({
    loved: toStars(store.state.loved),
    seen: toStars(store.state.seen),
    watchlist: toStars(store.state.watchlist),
    hidden: toStars(store.state.hidden),
    visited: toStars(store.state.visited),
  });
  let marks = sets();
  // Films never offered as somewhere to go next: the ones set aside, and the ones already watched.
  let notFor = new Set();
  const excluding = () => { notFor = new Set([...marks.hidden, ...marks.seen]); };
  excluding();

  const app = {
    root, universe, depth, cosmos, labels, pilot, store, search, state, small, reducedMotion, edition,
    films, starOf, slugOf,
    get marks() { return marks; },
    get notFor() { return notFor; },
    on(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
  const refresh = what => { for (const listener of listeners) listener(what); };
  app.refresh = refresh;

  // ── Where the cosmos sits behind the panels.
  // What covers the sky, in CSS pixels from each edge: the panels, the
  // instruments along the top, and the light dial along the bottom.
  const covered = { left: 0, right: 0, top: HUD_TOP, bottom: 0 };
  function frameCosmos() {
    const { width, height } = cosmos.size;
    const right = app.dossier?.width() || 0;
    const left = app.panels?.width() || 0;
    const below = small ? Math.max(app.dossier?.height() || 0, app.panels?.height() || 0) : 0;
    root.style.setProperty('--inset-left', `${left}px`);
    root.style.setProperty('--inset-right', `${right}px`);
    labels.setInsets({ left, right, bottom: below });
    Object.assign(covered, { left, right, bottom: Math.max(below, small ? 72 : 118) });
    cosmos.camera.setBias(state.focus < 0 && state.galaxy < 0 ? OVERVIEW.bias : 0);
    // The star you are at sits in the middle of the sky that is left uncovered,
    // below the instruments along the top.
    if (small) cosmos.camera.setCentre(0, Math.min(0.55, (below - (state.focus >= 0 ? HUD_TOP : 0)) / Math.max(height, 1)));
    else cosmos.camera.setCentre((left - right) / Math.max(width, 1), 0);
  }
  app.frameCosmos = frameCosmos;

  // ── Lines in the sky.
  const journeyAt = () => (state.journey ? state.journey.path[state.journey.path.length - 1].star : -1);
  const openDoors = () => (state.journey && !state.journey.landed && journeyAt() === state.focus ? state.journey.doors : []);

  /** The lines that lead away from the star you are at: a voyage's doors, or its six rays. */
  function leading() {
    const list = openDoors();
    return list.length ? list.map(door => ({ light: door.light, star: door.star })) : state.rays;
  }

  function drawRays() {
    if (state.focus < 0) { cosmos.setLines('rays', []); cosmos.setRayEnds([]); return; }
    const list = leading();
    // Inside a star system the rings say it; the lines wait until you draw back.
    cosmos.setLines('rays', state.system ? [] : list.map((ray, n) => ({
      a: state.focus, b: ray.star, colour: [...RGB[ray.light], 0.85], width: 2.6, style: 1, phase: n * 0.17, wait: n * 0.07, grow: 0.9,
    })));
    cosmos.setRayEnds(list.map(ray => ray.star));
  }

  function drawLinks() {
    if (state.focus < 0 || state.system) { cosmos.setLines('links', []); return; }
    const lines = [];
    for (const [other] of universe.model.linked[state.focus] || []) {
      if (other >= universe.count) continue;
      lines.push({ a: state.focus, b: other, colour: [...SILVER, 0.5], width: 1.6, style: 2, grow: 1.1 });
    }
    cosmos.setLines('links', lines.slice(0, 16));
  }

  function drawWake() {
    const stars = store.state.wake.slice(-16).map(starOf).filter(i => i >= 0);
    const lines = [];
    for (let n = 1; n < stars.length; n += 1) {
      if (stars[n] === stars[n - 1]) continue;
      lines.push({ a: stars[n - 1], b: stars[n], colour: [...IVORY, 0.34], width: 1.3, style: 3, phase: n / stars.length, born: -10 });
    }
    cosmos.setLines('wake', state.journey ? [] : lines);
  }

  function drawDeep() {
    const found = state.focus >= 0 && !state.system ? state.deep.get(state.focus) : null;
    cosmos.setLines('deep', (found || []).map(item => ({ a: state.focus, b: item.star, colour: [...PALE, 0.5], width: 1.5, style: 0, grow: 1.2 })));
  }

  function drawVoyage() {
    const voyage = state.voyage;
    if (!voyage) { cosmos.setLines('voyage', []); return; }
    const lines = [];
    for (let n = 1; n < voyage.stops.length; n += 1) {
      const leg = voyage.stops[n];
      const colour = leg.light ? RGB[leg.light] : STARLIGHT;
      lines.push({ a: voyage.stops[n - 1].star, b: leg.star, colour: [...colour, 0.9], width: 2.4, style: 1, phase: n * 0.13, wait: n * 0.18, grow: 0.8 });
    }
    cosmos.setLines('voyage', lines);
  }

  /** The road a voyage has travelled: each leg in the colour of its light, all of it gold once landed. */
  function drawJourney() {
    const j = state.journey;
    if (!j) { cosmos.setLines('journey', []); return; }
    const lines = [];
    for (let n = 1; n < j.path.length; n += 1) {
      const leg = j.path[n];
      const colour = j.landed ? GOLD : RGB[leg.light] || STARLIGHT;
      lines.push({ a: j.path[n - 1].star, b: leg.star, colour: [...colour, j.landed ? 0.95 : 0.75], width: j.landed ? 2.6 : 2, style: j.landed ? 0 : 3, phase: 1, wait: j.landed ? n * 0.22 : 0, grow: j.landed ? 0.9 : 0.6, born: j.landed ? undefined : -10 });
    }
    cosmos.setLines('journey', lines);
  }

  function labelContext() {
    const rays = new Map(leading().map(ray => [ray.star, lightById(ray.light).color]));
    for (const item of (state.focus >= 0 && state.deep.get(state.focus)) || []) rays.set(item.star, '#cfe0ff');
    if (state.voyage) for (const stop of state.voyage.stops) if (!rays.has(stop.star)) rays.set(stop.star, '#dec6a0');
    if (state.journey) for (const stop of state.journey.path) if (!rays.has(stop.star)) rays.set(stop.star, '#f0c987');
    labels.setContext({ focus: state.focus, rays, highlight: state.current ? state.current.stars : null, loved: marks.loved });
  }

  function syncMarks() {
    marks = sets();
    excluding();
    cosmos.setMarks({ loved: marks.loved, visited: marks.visited });
    figures.setProgress(state.found, marks.visited);
    labelContext();
  }

  // ── The star system around the star you are at.
  const orbits = createOrbits({
    root: document.getElementById('labels'), cosmos, universe, small, reducedMotion, insets: covered,
    onStar: (star, light) => focusStar(star, { light }),
    onHover: star => cosmos.setHover(star),
    onMode: active => {
      state.system = active;
      labels.setContext({ system: active });
      cosmos.setVeil(active ? 0.5 : 0);
      drawRays(); drawLinks(); drawDeep();
      refresh('system');
    },
  });

  function updateSystem() {
    if (state.focus < 0) { orbits.setSystem(-1); return; }
    const first = new Map();
    const taken = new Set();
    for (const door of openDoors()) { first.set(door.light, door.star); taken.add(door.star); }
    for (const ray of state.rays) if (!first.has(ray.light) && !taken.has(ray.star)) { first.set(ray.light, ray.star); taken.add(ray.star); }
    orbits.setLight(state.sky);
    // Under one light its ring goes innermost, where it shows best; on a phone the
    // innermost ring runs behind the film's own card, so the rings keep their order there.
    const lead = small || state.sky === 'white' ? null : state.sky;
    orbits.setSystem(state.focus, rings(universe, state.focus, { first, exclude: notFor, per: small ? 2 : 3, lead }));
    orbits.setDoors(openDoors().map(door => door.star));
  }

  // ── Constellations waiting in the sky.
  const figures = createFigures({
    root: document.getElementById('labels'), cosmos, universe, small,
    onFigure: id => browse('constellation', id),
    hintOf: id => hintOf(id),
  });
  const quietSky = () => figures.setEnabled(!state.current && !state.journey && !state.voyage);

  // ── Arriving at a star.
  function computedRays(star) {
    return prism(universe, star, { exclude: notFor }).map(ray => ({ light: ray.light, star: ray.star, shared: ray.shared, claim: '', watch: '', read: false }));
  }

  function applyArrival(star, arrival, done) {
    if (state.focus !== star) return;
    state.arrival = arrival;
    const read = new Map((arrival.rays || []).map(ray => [ray.light, ray]));
    const taken = new Set();
    state.rays = LIGHT_IDS.map(light => {
      const mine = read.get(light);
      const charted = state.rays.find(ray => ray.light === light) || null;
      // The Navigator's companion for a film the voyager has watched or set aside gives way to the chart's.
      if (mine && mine.star !== star && !taken.has(mine.star) && !notFor.has(mine.star)) {
        taken.add(mine.star);
        return { light, star: mine.star, shared: sharedTraits(universe, light, star, mine.star, 3), claim: mine.claim, watch: mine.watch, read: true };
      }
      if (charted) taken.add(charted.star);
      return charted;
    }).filter(Boolean);
    state.arrivalState = done ? 'read' : 'draft';
    drawRays();
    updateSystem();
    labelContext();
    refresh('arrival');
  }

  async function readArrival(star, { fresh = false } = {}) {
    const kept = fresh ? null : pilot.cachedArrival(star);
    if (kept) { applyArrival(star, kept, true); return; }
    if (!pilot.connected) { state.arrivalState = pilot.status.mode === 'connecting' ? 'waiting' : 'offline'; refresh('arrival'); return; }
    state.arrivalState = 'asking';
    state.arrivalNote = '';
    refresh('arrival');
    try {
      const arrival = await pilot.arrival(star, { fresh, onDraft: draft => applyArrival(star, draft, false) });
      applyArrival(star, arrival, true);
    } catch (error) {
      if (state.focus !== star) return;
      const note = pilot.explain(error);
      if (!note) { if (state.arrivalState === 'asking') { state.arrivalState = 'idle'; refresh('arrival'); } return; }
      state.arrivalState = 'failed';
      state.arrivalNote = note;
      refresh('arrival');
    }
  }
  let arrivalTimer = 0;
  app.readArrival = (fresh = false) => { clearTimeout(arrivalTimer); if (state.focus >= 0) readArrival(state.focus, { fresh }); };
  app.stopArrival = () => { clearTimeout(arrivalTimer); pilot.cancel('arrival'); state.arrivalState = 'idle'; refresh('arrival'); };

  /**
   * Goes to a star.
   * @param {number} star
   * @param {{ quiet?: boolean, light?: string, instant?: boolean, drifting?: boolean, keepVoyage?: boolean, history?: boolean }} [how]
   *   quiet: do not ask the Navigator (drifting, passing through); light: the ray travelled along;
   *   history: arrived by going back or forward, so nothing is added to the way back
   */
  function focusStar(star, how = {}) {
    if (!(star >= 0 && star < universe.count)) return;
    const from = state.focus;
    if (!how.keepVoyage && state.voyage && !state.voyage.stops.some(stop => stop.star === star)) endVoyage();
    if (!how.drifting && state.drift) stopDrift();
    pilot.cancel('arrival');
    state.focus = star;
    state.galaxy = -1;
    state.arm = -1;
    state.arrival = null;
    state.arrivalState = 'idle';
    state.arrivalNote = '';
    state.rays = computedRays(star);
    state.deepState = 'idle';
    extendJourney(star, how.light);
    store.visit(slugOf(star));
    syncMarks();
    cosmos.setFocus(star);
    drawRays(); drawLinks(); drawWake(); drawDeep(); drawJourney();
    updateSystem();

    const place = cosmos.restingPlace(star);
    const camera = cosmos.camera;
    const near = small ? 118 : 150;
    if (how.instant) camera.jumpTo({ target: place, distance: near, pitch: 0.5 });
    else camera.flyTo({ target: place, distance: near, pitch: 0.5, swoop: from >= 0 ? (star % 2 ? 0.34 : -0.34) : 0.5, follow: () => cosmos.positionOf(star) });

    if (from >= 0 && from !== star && how.light) {
      const shared = sharedTraits(universe, how.light, from, star, 3).map(entry => universe.traits[entry.trait].s || universe.traits[entry.trait].t);
      app.hud?.caption(shared.length ? `${lightById(how.light).name} · ${shared.join(' · ')}` : lightById(how.light).name, lightById(how.light).color);
    }
    app.dossier?.showStar(star);
    frameCosmos();
    updateAddress({ push: !how.drifting && !how.history && !how.instant });
    checkConstellations();
    quietSky();
    refresh('focus');
    clearTimeout(arrivalTimer);
    const kept = pilot.cachedArrival(star);
    if (kept) { applyArrival(star, kept, true); return; }
    // With nothing kept here, a reading written ahead of time is looked for first. Only without one is the Navigator asked.
    const ask = () => {
      if (!how.quiet && state.readArrivals && pilot.connected) {
        // Asked a moment after arriving, so passing through a star on the way to another asks nothing.
        state.arrivalState = 'asking';
        refresh('arrival');
        arrivalTimer = setTimeout(() => { if (state.focus === star) readArrival(star); }, how.instant ? 250 : 1100);
      } else if (!how.quiet && state.readArrivals) readArrival(star);
      else { state.arrivalState = pilot.connected ? 'idle' : 'offline'; refresh('arrival'); }
    };
    state.arrivalState = 'looking';
    refresh('arrival');
    pilot.aheadArrival(star).then(ahead => {
      if (state.focus !== star || state.arrivalState !== 'looking') return; // moved on, or asked for a reading meanwhile
      if (ahead) applyArrival(star, ahead, true);
      else ask();
    });
  }

  function blur({ history = false } = {}) {
    clearTimeout(arrivalTimer);
    pilot.cancel('arrival');
    state.focus = -1;
    state.galaxy = -1;
    state.arm = -1;
    state.rays = [];
    cosmos.setFocus(-1);
    cosmos.camera.setFollow(null);
    orbits.setSystem(-1);
    drawRays(); drawLinks(); drawDeep();
    labelContext();
    app.dossier?.hide();
    frameCosmos();
    updateAddress({ push: !history });
    refresh('focus');
  }

  // ── Changing the light.
  function setSky(sky) {
    if (sky === state.sky || !lightById(sky)) return;
    state.sky = sky;
    store.set('sky', sky);
    root.style.setProperty('--light', lightById(sky).color);
    const camera = cosmos.camera;
    if (state.focus >= 0) {
      const star = state.focus;
      updateSystem();
      cosmos.setSky(sky, { around: cosmos.positionOf(star) });
      camera.flyTo({ follow: () => cosmos.positionOf(star), hold: true, target: cosmos.restingPlace(star), duration: 2.9, lift: 1.5 });
    } else if (state.galaxy >= 0) {
      state.galaxy = -1;
      state.arm = -1;
      app.dossier?.hide();
      cosmos.setSky(sky);
      overview(2.9);
    } else {
      cosmos.setSky(sky);
      overview(2.9);
    }
    // A galaxy or star system lit up belongs to the light it was found under.
    if (state.current && (state.current.kind === 'galaxy' || state.current.kind === 'arm')) setCurrent(null);
    const light = lightById(sky);
    app.hud?.caption(`${light.name} · ${light.line}`, light.color, 5200);
    updateAddress();
    refresh('sky');
  }

  function overview(duration) {
    const reach = cosmos.reachOf(state.sky);
    cosmos.camera.flyTo({ target: [0, -30, 0], distance: reach * (small ? OVERVIEW.reachSmall : OVERVIEW.reach), pitch: OVERVIEW.pitch, ...(duration ? { duration } : {}) });
  }

  function goHome({ history = false } = {}) {
    if (state.drift) stopDrift();
    blur({ history });
    overview();
  }

  function openGalaxy(g, armIndex = -1, { history = false } = {}) {
    const galaxy = (universe.galaxies[state.sky] || [])[g];
    if (!galaxy) return;
    if (state.drift) stopDrift();
    pilot.cancel('arrival');
    state.focus = -1;
    state.rays = [];
    state.galaxy = g;
    const arm = armIndex >= 0 ? galaxy.arms.find(entry => entry.arm === armIndex) : null;
    state.arm = arm ? armIndex : -1;
    cosmos.setFocus(-1);
    orbits.setSystem(-1);
    drawRays(); drawLinks(); drawDeep();
    labelContext();
    cosmos.camera.flyTo(arm
      ? { target: arm.at, distance: galaxy.radius * 0.95, pitch: 0.7 }
      : { target: galaxy.centre, distance: galaxy.radius * (small ? 3.6 : 2.5), pitch: 0.82, swoop: 0.25 });
    if (arm) app.dossier?.showArm(g, armIndex); else app.dossier?.showGalaxy(g);
    frameCosmos();
    updateAddress({ push: !history });
    refresh('focus');
  }

  // ── Love, watched, saved for later, set aside.
  function toggle(set, star, on = null) {
    const slug = slugOf(star);
    const value = on === null ? !store.state[set].has(slug) : on;
    store.mark(set, slug, value);
    marksChanged();
    return value;
  }

  function marksChanged() {
    const before = notFor;
    syncMarks();
    const moved = before.size !== notFor.size || [...notFor].some(star => !before.has(star));
    if (moved && state.focus >= 0) {
      // What may be offered next has changed: the rays, the doors and the rings are drawn again.
      const kept = state.arrival;
      state.rays = computedRays(state.focus);
      if (kept) applyArrival(state.focus, kept, state.arrivalState === 'read');
      if (state.journey && !state.journey.landed) computeDoors();
      drawRays(); updateSystem(); labelContext();
    }
    refresh('marks');
  }

  // ── Lit sets: a current (everything carrying a trait), a nebula, a constellation, a galaxy or one of its systems.
  function setCurrent(current) {
    state.current = current;
    cosmos.setHighlight(current ? current.stars : null);
    cosmos.setLines('figure', current && current.figure ? current.figure : []);
    figures.setLit(current && current.kind === 'constellation' ? current.id : -1);
    labelContext();
    quietSky();
    refresh('current');
  }

  const strengthOf = (light, trait, stars) => {
    // How truly each film carries a trait: how like the other carriers it is under the trait's own light,
    // leaning on how strongly the chart recorded the trait in it (often the same for all, so it only leans).
    const index = universe.model.index[light];
    const typical = typicality(universe, stars, light);
    return new Map(stars.map(star => {
      const raw = (index.traits(star, 400).find(entry => entry.trait === trait)?.raw || 0) / 255;
      return [star, Math.max(0, typical.get(star) || 0) * (0.55 + 0.45 * raw)];
    }));
  };

  /** A set of films, ready to light up and to browse. */
  function setOf(kind, id, arm = -1) {
    if (kind === 'trait') {
      const record = universe.traits[id];
      if (!record) return null;
      const light = LIGHT_IDS[record.l];
      const stars = carriers(universe, id);
      return { kind, id, label: record.t, note: '', stars: new Set(stars), colour: lightById(light).color, light, strength: strengthOf(light, id, stars) };
    }
    if (kind === 'register') {
      const register = universe.bundle.registers[id];
      if (!register) return null;
      const stars = new Set();
      films.forEach((film, i) => { if (film.rg && film.rg.includes(id)) stars.add(i); });
      return { kind, id, label: register.label, note: register.blurb, stars, colour: register.hue, light: 'white' };
    }
    if (kind === 'constellation') {
      const constellation = universe.bundle.constellations[id];
      if (!constellation) return null;
      const known = state.found.has(id);
      const traits = constellation.traits.map(trait => universe.traits[trait].t);
      const stars = new Set(constellation.stars.filter(star => star < universe.count));
      const hint = hintOf(id);
      return {
        kind, id, known, label: known ? constellation.name : 'An unnamed figure',
        note: known ? traits.join(' and ') : `Something to do with ${hint.name}; ${films[hint.star].t} is one of its stars. Visit three of them to learn its name.`,
        stars, colour: '#dec6a0', light: 'white', figure: figureOf(stars),
      };
    }
    if (kind === 'galaxy' || kind === 'arm') {
      const galaxy = (universe.galaxies[state.sky] || [])[id];
      if (!galaxy) return null;
      const G = universe.galaxyOf[state.sky];
      const A = universe.armOf[state.sky];
      const record = kind === 'arm' ? galaxy.arms.find(entry => entry.arm === arm) : null;
      if (kind === 'arm' && !record) return null;
      const stars = new Set();
      for (let i = 0; i < universe.count; i += 1) if (G[i] === id && (kind === 'galaxy' || A[i] === arm)) stars.add(i);
      const light = lightById(state.sky);
      return {
        kind, id, arm, label: record ? record.name : galaxy.name,
        note: record ? `A star system in ${galaxy.name}, under ${light.name.toLowerCase()}` : galaxy.thesis,
        stars, colour: light.color, light: state.sky,
      };
    }
    return null;
  }

  // What can be said of a figure before its name is known: the rarer of its two traits, and its best-known star.
  const traitCount = new Map();
  for (const figure of universe.bundle.constellations) for (const trait of figure.traits) traitCount.set(trait, (traitCount.get(trait) || 0) + 1);
  // A trait said as a thing ("dreams", not "dreamlike"; "music", not "led by its music"), so that "something to do with" reads.
  const thingOf = trait => {
    const { t, n } = universe.traits[trait];
    return n ? n.charAt(0).toLowerCase() + n.slice(1) : t;
  };
  const hints = new Map();
  function hintOf(id) {
    if (hints.has(id)) return hints.get(id);
    const figure = universe.bundle.constellations[id];
    const [a, b] = figure.traits;
    const trait = (traitCount.get(a) || 0) < (traitCount.get(b) || 0) ? a : b;
    const stars = figure.stars.filter(star => star < universe.count);
    const star = stars.reduce((best, other) => ((films[other].rn ?? 0) > (films[best].rn ?? 0) ? other : best), stars[0]);
    const hint = { trait, name: thingOf(trait), star };
    hints.set(id, hint);
    return hint;
  }

  function show(set, { frame = true } = {}) {
    if (!set) return null;
    setCurrent(set);
    if (frame) {
      if (set.kind === 'constellation') widen([...set.stars]);
      else if (set.kind === 'trait') { if (state.focus < 0 || set.stars.size > 60) widen(); }
      else if (set.kind === 'register') widen();
    }
    return set;
  }
  const showTrait = trait => show(setOf('trait', trait));
  const showRegister = index => show(setOf('register', index));
  const showConstellation = index => show(setOf('constellation', index));
  /** Lights a set and opens its list of films. */
  function browse(kind, id, arm = -1) {
    const set = kind === 'galaxy' || kind === 'arm' ? show(setOf(kind, id, arm), { frame: false }) : show(setOf(kind, id, arm));
    if (set) app.panels.open('set');
    return set;
  }

  function figureOf(stars) {
    // The shortest set of lines that joins the stars: a figure to draw in the sky.
    const list = [...stars];
    if (list.length < 2) return [];
    const P = universe.positions[state.sky];
    const distance = (a, b) => Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2]);
    const joined = new Set([list[0]]);
    const lines = [];
    while (joined.size < list.length) {
      let best = null;
      for (const a of joined) for (const b of list) {
        if (joined.has(b)) continue;
        const d = distance(a, b);
        if (!best || d < best.d) best = { a, b, d };
      }
      joined.add(best.b);
      lines.push({ a: best.a, b: best.b, colour: [...STARLIGHT, 0.8], width: 1.7, style: 0, grow: 1.4, wait: lines.length * 0.16 });
    }
    return lines;
  }

  /** Pulls back until a set of stars (or the whole sky) is in view. */
  function widen(stars = null) {
    if (stars && stars.length) {
      const P = universe.positions[state.sky];
      let x = 0; let y = 0; let z = 0;
      for (const star of stars) { x += P[star * 3]; y += P[star * 3 + 1]; z += P[star * 3 + 2]; }
      x /= stars.length; y /= stars.length; z /= stars.length;
      let reach = 0;
      for (const star of stars) reach = Math.max(reach, Math.hypot(P[star * 3] - x, P[star * 3 + 2] - z));
      cosmos.camera.flyTo({ target: [x, y, z], distance: Math.max(420, reach * (small ? 3.6 : 2.4)), pitch: 0.9 });
      cosmos.camera.setFollow(null);
      return;
    }
    if (cosmos.camera.goal.distance < 900) { cosmos.camera.setFollow(null); overview(); }
  }

  function checkConstellations() {
    const progress = constellationProgress(universe, marks.visited);
    let grew = false;
    for (const entry of progress) {
      if (!entry.found || state.found.has(entry.id)) continue;
      state.found.add(entry.id);
      grew = true;
      if (!state.restoring) {
        const constellation = universe.bundle.constellations[entry.id];
        app.hud?.toast(`A constellation: ${constellation.name}`, { detail: `${constellation.traits.map(trait => universe.traits[trait].t).join(', and ')}. ${entry.seen} of its ${entry.total} stars are in your wake.`, action: 'Show it', onAction: () => browse('constellation', entry.id), tone: 'gold' });
      }
    }
    if (grew) figures.setProgress(state.found, marks.visited);
    return progress;
  }

  // ── Beyond the chart.
  async function lookDeeper(star = state.focus) {
    if (star < 0) return;
    if (!pilot.connected) { app.hud?.toast(pilot.explain({ code: 'offline' })); return; }
    state.deepState = 'asking';
    if (!state.deep.has(star)) state.deep.set(star, []);
    refresh('deep');
    try {
      await pilot.deepField(star, {
        onStar: item => {
          const list = state.deep.get(star);
          if (!list.some(entry => entry.star === item.star)) list.push({ star: item.star, light: item.light, claim: item.claim, isNew: item.isNew });
          if (state.focus === star) { drawDeep(); labelContext(); }
          refresh('deep');
        },
      });
      state.deepState = 'idle';
    } catch (error) {
      const note = pilot.explain(error);
      state.deepState = 'idle';
      if (note) app.hud?.toast(note);
    }
    refresh('deep');
  }

  async function chartFilm(query, hints = {}) {
    if (!pilot.connected) { app.hud?.toast(pilot.explain({ code: 'offline' })); return -1; }
    app.hud?.working(`Charting “${query}” from memory`);
    try {
      const result = await pilot.chart(query, hints);
      app.hud?.working('');
      if (result.star < 0) { app.hud?.toast(result.note); return -1; }
      if (result.isNew) app.hud?.toast(`${films[result.star].t} is on your chart now`, { detail: 'Charted by Claude from memory.', tone: 'pale' });
      focusStar(result.star);
      return result.star;
    } catch (error) {
      app.hud?.working('');
      const note = pilot.explain(error);
      if (note) app.hud?.toast(note);
      return -1;
    }
  }

  // ── Voyages followed stop by stop: a course the Navigator plots, a passage or a trail the chart finds.
  function beginVoyage(voyage) {
    if (state.journey) endJourney();
    state.voyage = { ...voyage, at: -1 };
    drawVoyage();
    labelContext();
    quietSky();
    refresh('voyage');
  }

  function endVoyage() {
    if (!state.voyage) return;
    state.voyage = null;
    drawVoyage();
    labelContext();
    quietSky();
    refresh('voyage');
  }

  function voyageTo(n) {
    const voyage = state.voyage;
    if (!voyage || !voyage.stops[n]) return;
    voyage.at = n;
    focusStar(voyage.stops[n].star, { keepVoyage: true, light: voyage.stops[n].light });
    refresh('voyage');
  }

  function plotPassage(a, b) {
    const route = passage(universe, a, b);
    if (!route || route.stars.length < 2) { app.hud?.toast('The chart finds no passage between those two.'); return null; }
    const stops = route.stars.map((star, n) => ({
      star,
      light: n ? route.legs[n - 1].light : null,
      note: n ? route.legs[n - 1].shared.map(entry => universe.traits[entry.trait].s || universe.traits[entry.trait].t).join(' · ') : '',
    }));
    beginVoyage({ kind: 'passage', name: `${films[a].t} to ${films[b].t}`, heading: `${stops.length - 1} steps, each to the nearest film that leads on.`, stops, source: 'chart' });
    widen(route.stars);
    return state.voyage;
  }

  // ── A voyage set out on: from a film, through doors chosen one at a time, to the film you land on.
  const nameOf = shared => shared.map(entry => universe.traits[entry.trait].s || universe.traits[entry.trait].t).join(' · ');

  function computeDoors() {
    const j = state.journey;
    if (!j || j.landed) return;
    const last = j.path[j.path.length - 1];
    j.doors = doors(universe, last.star, {
      origin: j.origin, path: j.path.map(stop => stop.star), exclude: notFor, loved: [...marks.loved], last: last.light, k: 3,
    });
  }

  /** Any move while a voyage is under way is part of it: forward to a new star, or back to one already passed. */
  function extendJourney(star, light) {
    const j = state.journey;
    if (!j || j.landed) return;
    const at = j.path.findIndex(stop => stop.star === star);
    if (at >= 0) j.path.length = at + 1;
    else {
      const previous = j.path[j.path.length - 1].star;
      const leg = light && light !== 'white' ? light : closestLight(universe, previous, star).light;
      j.path.push({ star, light: leg, shared: sharedTraits(universe, leg, previous, star, 2) });
    }
    computeDoors();
    refresh('journey');
  }

  function setOut(origin) {
    if (!(origin >= 0 && origin < universe.count)) return;
    if (state.drift) stopDrift();
    if (state.voyage) endVoyage();
    setCurrent(null);
    state.journey = { origin, path: [{ star: origin, light: null, shared: [] }], doors: [], landed: false, shared: false };
    computeDoors();
    focusStar(origin);
    quietSky();
    app.panels.open('voyage');
    refresh('journey');
  }

  function takeDoor(n) {
    const door = openDoors()[n];
    if (door) focusStar(door.star, { light: door.light });
  }

  function stepBack() {
    const j = state.journey;
    if (!j || j.landed || j.path.length < 2) return;
    focusStar(j.path[j.path.length - 2].star);
  }

  /** Lands the voyage on the film you are at: tonight's film, kept with the road that led to it. */
  function land() {
    const j = state.journey;
    if (!j || j.landed || j.path.length < 2) return;
    const last = j.path[j.path.length - 1].star;
    j.landed = true;
    j.doors = [];
    if (!marks.seen.has(last)) store.mark('watchlist', slugOf(last), true);
    j.route = store.keepRoute({
      name: `${films[j.origin].t} to ${films[last].t}`,
      heading: `${j.path.length - 1} ${j.path.length === 2 ? 'jump' : 'jumps'} from ${films[j.origin].t}`,
      kind: 'voyage', savedAt: new Date().toISOString(), landed: slugOf(last),
      stops: j.path.map(stop => ({ slug: slugOf(stop.star), light: stop.light, note: nameOf(stop.shared) })),
    });
    syncMarks();
    drawJourney(); drawRays(); updateSystem(); labelContext();
    updateAddress({ push: true });
    refresh('marks');
    refresh('journey');
  }

  /** Shows a voyage already landed: one kept in the log, or one read from a link. */
  function showRoute(route, { instant = false, shared = false, history = false } = {}) {
    const stops = route.filter(stop => stop.star >= 0 && stop.star < universe.count);
    if (!stops.length) return false;
    if (state.drift) stopDrift();
    if (state.voyage) endVoyage();
    setCurrent(null);
    state.journey = { origin: stops[0].star, path: stops, doors: [], landed: true, shared };
    focusStar(stops[stops.length - 1].star, { instant, history: true, quiet: shared });
    drawJourney();
    if (stops.length > 1 && !instant) setTimeout(() => { if (state.journey && state.journey.path === stops) widen(stops.map(stop => stop.star)); }, 900);
    updateAddress({ push: !history && !instant });
    app.panels.open('voyage');
    refresh('journey');
    return true;
  }

  function showKeptRoute(route) {
    const stops = route.stops.map((stop, n) => {
      const star = starOf(stop.slug);
      const previous = n ? starOf(route.stops[n - 1].slug) : -1;
      const light = LIGHT_IDS.includes(stop.light) ? stop.light : n && star >= 0 && previous >= 0 ? closestLight(universe, previous, star).light : null;
      return { star, light: n ? light : null, shared: n && star >= 0 && previous >= 0 && light ? sharedTraits(universe, light, previous, star, 2) : [] };
    });
    return showRoute(stops);
  }

  function endJourney() {
    if (!state.journey) return;
    state.journey = null;
    drawJourney(); drawRays(); drawWake(); updateSystem(); labelContext();
    quietSky();
    updateAddress();
    refresh('journey');
  }

  /** How much of the film a voyage set out from is still in the film it is at, 0..1. */
  const homeOf = () => (state.journey ? homeLikeness(universe, state.journey.origin, journeyAt()) : 1);

  // ── Drift: the chart carries you, a star at a time. No one is asked anything.
  let driftTimer = 0;
  function driftStep() {
    if (!state.drift) return;
    // A voyager reading the dossier is not moved on mid-sentence.
    if (app.dossier?.reading()) { driftTimer = setTimeout(driftStep, 2500); return; }
    let star = state.focus;
    if (star < 0) {
      const lit = [];
      const G = universe.galaxyOf[state.sky];
      for (let i = 0; i < universe.base; i += 1) if (films[i].rn >= 3 && G[i] !== UNLIT && !marks.hidden.has(i)) lit.push(i);
      star = lit[Math.floor(Math.random() * lit.length)] ?? 0;
      focusStar(star, { quiet: true, drifting: true });
    } else {
      const next = driftNext(universe, star, new Set([...marks.visited, ...marks.hidden]), state.sky);
      if (!next) { stopDrift(); return; }
      const light = next.light === 'white' ? closestLight(universe, star, next.star).light : next.light;
      focusStar(next.star, { quiet: true, drifting: true, light });
    }
    driftTimer = setTimeout(driftStep, reducedMotion ? DRIFT_EVERY + 2000 : DRIFT_EVERY);
  }
  function startDrift() {
    if (state.drift) return;
    if (state.journey && !state.journey.landed) endJourney();
    state.drift = true;
    refresh('drift');
    driftStep();
  }
  function stopDrift() {
    if (!state.drift) return;
    state.drift = false;
    clearTimeout(driftTimer);
    updateAddress({ push: true });
    refresh('drift');
  }

  // ── The address remembers where you are, as one plain name: star-<film>, galaxy-<n>, galaxy-<n>-arm-<m>,
  // voyage-<film>~<film>~… or light-<light>, with "--<light>" after a place seen under one light.
  // Each place reached by choice is a step the browser's Back button (and the one in the corner) returns through.
  let written = null;
  let depthNow = 0;      // how many places deep into this visit the voyager is
  let fallback = null;   // the way back, kept here when the page may not write the browser's history

  function addressOf() {
    const light = state.sky !== 'white' ? state.sky : '';
    const j = state.journey;
    if (j && j.landed && j.path.length > 1 && journeyAt() === state.focus) return `voyage-${j.path.map(stop => slugOf(stop.star)).join('~')}${light ? `--${light}` : ''}`;
    if (state.focus >= 0) return `star-${slugOf(state.focus)}${light ? `--${light}` : ''}`;
    if (state.galaxy >= 0) return `galaxy-${state.galaxy}${state.arm >= 0 ? `-arm-${state.arm}` : ''}${light ? `--${light}` : ''}`;
    return light ? `light-${light}` : '';
  }

  // The browser's tab, history and bookmarks name where you are.
  const pageTitle = document.title || 'AFTERIMAGE · The Odyssey';
  function updateTitle() {
    if (edition === 'claude') return; // an Artifact keeps the name it was published with
    let place = '';
    if (state.focus >= 0) {
      const film = films[state.focus];
      place = state.journey && state.journey.landed ? `Tonight: ${film.t}` : `${film.t} (${film.y})`;
    } else if (state.galaxy >= 0) {
      const galaxy = (universe.galaxies[state.sky] || [])[state.galaxy];
      const arm = galaxy && state.arm >= 0 ? galaxy.arms.find(entry => entry.arm === state.arm) : null;
      place = arm ? arm.name : galaxy ? galaxy.name : '';
    }
    const next = place ? `${place} · The Odyssey` : pageTitle;
    if (document.title !== next) document.title = next;
  }

  function updateAddress({ push = false } = {}) {
    updateTitle();
    const name = addressOf();
    const now = window.location.hash.replace(/^#/, '');
    if (name === now) return;
    written = name;
    const url = name ? `#${name}` : window.location.pathname + window.location.search;
    try {
      if (push) { window.history.pushState({ odyssey: depthNow + 1 }, '', url); depthNow += 1; }
      else window.history.replaceState({ odyssey: depthNow }, '', url);
    } catch {
      // A sandboxed frame may refuse: the way back is kept here instead.
      if (push) { (fallback ||= []).push(now); depthNow += 1; }
    }
    refresh('history');
  }

  function back() {
    if (depthNow <= 0) return;
    if (fallback && fallback.length) {
      const name = fallback.pop();
      depthNow -= 1;
      arriveAt(name);
      refresh('history');
      return;
    }
    window.history.back();
  }

  function readAddress(raw = window.location.hash.replace(/^#/, '')) {
    try { raw = decodeURIComponent(raw); } catch { /* keep it as written */ }
    const [place, light = ''] = raw.split('--');
    const found = {};
    const galaxy = /^galaxy-(\d+)(?:-arm-(\d+))?$/.exec(place);
    if (place.startsWith('star-')) found.star = place.slice(5);
    else if (galaxy) { found.galaxy = Number(galaxy[1]); if (galaxy[2] !== undefined) found.arm = Number(galaxy[2]); }
    else if (place.startsWith('voyage-')) found.voyage = place.slice(7).split('~').filter(Boolean).slice(0, 40);
    else if (place.startsWith('light-')) found.light = place.slice(6);
    if (light) found.light = light;
    return found;
  }

  /** Goes where an address says. Never adds to the way back: the address is already where the browser is. */
  function followAddress({ instant = false, raw } = {}) {
    const address = readAddress(raw);
    const sky = address.light && ALL_LIGHTS.some(light => light.id === address.light) ? address.light : null;
    if (sky && sky !== state.sky) {
      state.sky = sky;
      root.style.setProperty('--light', lightById(sky).color);
      cosmos.setSky(sky, { immediate: true });
      labels.rebuild();
      refresh('sky');
    }
    if (address.voyage) {
      const route = routeOf(universe, address.voyage);
      if (route.length > 1) return showRoute(route, { instant, shared: true, history: true });
      if (route.length === 1) { focusStar(route[0].star, { instant, history: true }); return true; }
    }
    if (address.star && starOf(address.star) >= 0) {
      if (state.journey && state.journey.landed) endJourney();
      focusStar(starOf(address.star), { instant, history: true });
      return true;
    }
    if (address.galaxy !== undefined && (universe.galaxies[state.sky] || [])[address.galaxy]) {
      openGalaxy(address.galaxy, address.arm ?? -1, { history: true });
      return true;
    }
    return false;
  }

  function arriveAt(raw) {
    if (!followAddress({ raw })) {
      if (state.journey) endJourney();
      if (state.focus >= 0 || state.galaxy >= 0) goHome({ history: true });
    }
  }

  // ── Hands on the sky.
  attachControls(cosmos.canvas, cosmos.camera, {
    onTap(x, y) {
      const star = cosmos.pick(x, y, small ? 1.5 : 1);
      if (star >= 0) focusStar(star);
    },
    onHover(x, y) {
      const star = x < 0 ? -1 : cosmos.pick(x, y);
      cosmos.setHover(star);
      labels.setContext({ hover: star });
      cosmos.canvas.style.cursor = star >= 0 ? 'pointer' : '';
    },
    onGesture() { if (state.drift) stopDrift(); },
    // Names, poster cards and the moons of a star system lie over the sky: a drag that starts on one still moves it.
    surfaces: [document.getElementById('labels')].filter(Boolean),
  });

  /** Says where you are in words, for a friend: the link where there is one, and the film's name always. */
  async function share() {
    const j = state.journey;
    const film = state.focus >= 0 ? films[state.focus] : null;
    let text = film ? `${film.t} (${film.y})` : 'AFTERIMAGE, the Odyssey';
    if (j && j.landed && film) text = `Tonight: ${film.t} (${film.y}), found on a voyage from ${j.path.map(stop => films[stop.star].t).join(' → ')}`;
    const link = edition === 'claude' ? '' : window.location.href;
    const words = link ? `${text}\n${link}` : text;
    // On a phone, the phone's own way of sharing; anywhere else, or if it cannot, the clipboard.
    const touch = small || window.matchMedia?.('(pointer: coarse)').matches;
    if (touch && link && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: film ? film.t : 'The Odyssey', text, url: link });
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return; // they closed it: nothing to do
      }
    }
    try {
      await navigator.clipboard.writeText(words);
      app.hud?.toast(link ? 'Copied: the link and the film' : 'Copied', { detail: text, tone: 'pale' });
    } catch {
      app.hud?.toast('Copy this to share it', { detail: words, hold: 14000 });
    }
  }

  /** A journal was read in: stars found beyond the chart come back, and the marks and wake are drawn again. */
  function reloadKept() {
    pilot.restore();
    state.restoring = true;
    marksChanged();
    checkConstellations();
    state.restoring = false;
    drawWake();
  }

  Object.assign(app, {
    focusStar, blur, setSky, goHome, openGalaxy, overview, toggle, reloadKept,
    setCurrent, showTrait, showRegister, showConstellation, browse, setOf, widen,
    lookDeeper, chartFilm, beginVoyage, endVoyage, voyageTo, plotPassage,
    setOut, takeDoor, stepBack, land, endJourney, showKeptRoute, homeOf, openDoors,
    startDrift, stopDrift, checkConstellations, followAddress, back, share, hintOf,
    canGoBack: () => depthNow > 0,
    between: (a, b) => between(universe, a, b, 4, notFor),
    progress: () => constellationProgress(universe, marks.visited),
  });

  // ── Views.
  app.hud = createHud(app);
  app.dossier = createDossier(app);
  app.panels = createPanels(app);
  app.searchView = createSearchView(app);
  app.entrance = createEntrance(app);

  // ── Begin: put back what was found before, then go where the address says.
  state.restoring = true;
  pilot.restore();
  syncMarks();
  checkConstellations();
  state.restoring = false;
  drawWake();
  root.style.setProperty('--light', lightById(state.sky).color);
  frameCosmos();
  try { window.history.replaceState({ odyssey: 0 }, ''); } catch { /* a sandboxed frame may refuse */ }

  window.addEventListener('popstate', event => {
    depthNow = event.state && Number.isInteger(event.state.odyssey) ? event.state.odyssey : 0;
    written = window.location.hash.replace(/^#/, '');
    arriveAt();
    if (!state.entered) app.entrance.leave();
    refresh('history');
  });
  window.addEventListener('hashchange', () => {
    if (window.location.hash.replace(/^#/, '') === written) return;
    // An address followed from the threshold is a way of setting out like any other.
    if (followAddress() && !state.entered) app.entrance.leave();
  });
  window.addEventListener('resize', () => requestAnimationFrame(frameCosmos));
  // Another tab changed what is kept.
  store.onChange(() => marksChanged());
  // The Navigator may come aboard after a star was reached: read that star then.
  listeners.add(what => {
    if (what !== 'navigator' || !pilot.connected || state.focus < 0 || !state.readArrivals) return;
    if (state.arrivalState === 'waiting' || state.arrivalState === 'offline') readArrival(state.focus);
  });
  window.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    const typing = /^(input|textarea|select)$/i.test(event.target.tagName || '') || event.target.isContentEditable;
    if (event.key === 'Escape') {
      if (app.searchView.isOpen()) app.searchView.close();
      else if (state.tool) app.panels.close();
      else if (state.current) setCurrent(null);
      else if (state.focus >= 0 || state.galaxy >= 0) blur();
      return;
    }
    if (typing || !state.entered) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key; // Caps Lock or Shift change nothing
    if (key === '/') { event.preventDefault(); app.searchView.open(); }
    else if (/^[0-6]$/.test(key)) setSky(ALL_LIGHTS[Number(key)].id);
    else if (key === 'h' || key === 'Home') goHome();
    else if (key === 'd') { if (state.drift) stopDrift(); else startDrift(); }
    else if (key === 'l' && state.focus >= 0) toggle('loved', state.focus);
    else if (key === 'w' && state.focus >= 0) toggle('watchlist', state.focus);
    else if (key === 'Backspace' && app.canGoBack()) { event.preventDefault(); back(); }
    else if (key === '?') showKeys();
    else if (key === '+' || key === '=') cosmos.camera.zoom(0.74);
    else if (key === '-' || key === '_') cosmos.camera.zoom(1.35);
    else if (key.startsWith('Arrow') && !event.target.closest?.('.sheet, .search-box, .entrance, .toast')) {
      // The arrows turn the sky, unless they are scrolling a panel.
      event.preventDefault();
      const step = event.shiftKey ? 2.2 : 1;
      if (key === 'ArrowLeft') cosmos.camera.orbit(-44 * step, 0);
      else if (key === 'ArrowRight') cosmos.camera.orbit(44 * step, 0);
      else if (key === 'ArrowUp') cosmos.camera.orbit(0, -36 * step);
      else if (key === 'ArrowDown') cosmos.camera.orbit(0, 36 * step);
    }
  });

  // Every key, on one card: ? shows it, and ? again puts it away.
  let keysCard = null;
  function showKeys() {
    if (keysCard?.shown) { keysCard.close(); keysCard = null; return; }
    const detail = h('span.keys', KEYS.map(([name, what]) => h('span.key', h('kbd', name), ` ${what}`)));
    keysCard = app.hud?.toast('Keys', { detail, tone: 'pale', hold: 16000 }) || null;
  }

  return app;
}
