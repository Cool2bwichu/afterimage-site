// The voyage itself: what happens when a star is reached, a light is changed,
// a course is plotted. Views draw; this decides.
import { ALL_LIGHTS, LIGHT_IDS, lightById } from '../engine/lights.mjs';
import { UNLIT } from '../engine/universe.mjs';
import { prism, passage, between, driftNext, carriers, constellationProgress, sharedTraits, closestLight } from '../engine/voyage.mjs';
import { attachControls } from '../cosmos/camera.mjs';
import { hexToRgb } from '../cosmos/math.mjs';
import { createHud } from './hud.mjs';
import { createDossier } from './dossier.mjs';
import { createSearchView } from './search.mjs';
import { createPanels } from './panels.mjs';
import { createEntrance } from './entrance.mjs';

const RGB = Object.fromEntries(ALL_LIGHTS.map(light => [light.id, hexToRgb(light.color)]));
const IVORY = [0.96, 0.94, 0.9];
const STARLIGHT = [0.87, 0.78, 0.63];
const SILVER = [0.61, 0.73, 0.73];
const PALE = [0.8, 0.88, 1];
// The whole universe in one look: how far back, how steeply, and how far the camera leans toward the viewer.
export const OVERVIEW = { reach: 2.0, reachSmall: 3.4, pitch: 0.95, bias: 0.125 };

export function createApp({ root, universe, depth, cosmos, labels, pilot, store, search, small, reducedMotion }) {
  const state = {
    sky: 'white',
    focus: -1,
    galaxy: -1,
    arrival: null,        // what the Navigator said of the focused star
    arrivalState: 'idle', // idle | asking | draft | read | failed | offline
    arrivalNote: '',
    rays: [],             // the six rays of the focused star: [{ light, star, shared, claim, watch, read }]
    deep: new Map(),      // star → [{ star, light, claim }] found by looking deeper from it
    deepState: 'idle',
    current: null,        // a lit set: { kind, id, label, stars: Set, colour }
    tool: null,           // the open tool panel: { name, data }
    voyage: null,         // a course or passage being followed: { kind, name, stops: [...], at }
    drift: false,
    entered: false,
    readArrivals: true,
    found: new Set(),     // constellations found so far
  };
  const listeners = new Set();
  const films = universe.films;
  const starOf = slug => universe.indexOfSlug(slug);
  const slugOf = star => films[star].s;

  const sets = () => ({
    loved: new Set([...store.state.loved].map(starOf).filter(i => i >= 0)),
    seen: new Set([...store.state.seen].map(starOf).filter(i => i >= 0)),
    visited: new Set(store.state.wake.map(starOf).filter(i => i >= 0)),
  });
  let marks = sets();

  const app = {
    root, universe, depth, cosmos, labels, pilot, store, search, state, small, reducedMotion,
    films, starOf, slugOf,
    get marks() { return marks; },
    on(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
  const refresh = what => { for (const listener of listeners) listener(what); };
  app.refresh = refresh;

  // ── Where the cosmos sits behind the panels.
  function frameCosmos() {
    const { width, height } = cosmos.size;
    const right = app.dossier?.width() || 0;
    const left = app.panels?.width() || 0;
    const below = small ? Math.max(app.dossier?.height() || 0, app.panels?.height() || 0) : 0;
    root.style.setProperty('--inset-left', `${left}px`);
    root.style.setProperty('--inset-right', `${right}px`);
    labels.setInsets({ left, right, bottom: below });
    cosmos.camera.setBias(state.focus < 0 && state.galaxy < 0 ? OVERVIEW.bias : 0);
    // The star you are at sits in the middle of the sky that is left uncovered.
    if (small) cosmos.camera.setCentre(0, Math.min(0.55, below / Math.max(height, 1)));
    else cosmos.camera.setCentre((left - right) / Math.max(width, 1), 0);
  }
  app.frameCosmos = frameCosmos;

  // ── Lines in the sky.
  function drawRays() {
    if (state.focus < 0) { cosmos.setLines('rays', []); cosmos.setRayEnds([]); return; }
    cosmos.setLines('rays', state.rays.map((ray, n) => ({
      a: state.focus, b: ray.star, colour: [...RGB[ray.light], 0.85], width: 2.6, style: 1, phase: n * 0.17, wait: n * 0.07, grow: 0.9,
    })));
    cosmos.setRayEnds(state.rays.map(ray => ray.star));
  }

  function drawLinks() {
    if (state.focus < 0) { cosmos.setLines('links', []); return; }
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
    cosmos.setLines('wake', lines);
  }

  function drawDeep() {
    const found = state.focus >= 0 ? state.deep.get(state.focus) : null;
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

  function labelContext() {
    const rays = new Map(state.rays.map(ray => [ray.star, lightById(ray.light).color]));
    for (const item of (state.focus >= 0 && state.deep.get(state.focus)) || []) rays.set(item.star, '#cfe0ff');
    if (state.voyage) for (const stop of state.voyage.stops) if (!rays.has(stop.star)) rays.set(stop.star, '#dec6a0');
    labels.setContext({ focus: state.focus, rays, highlight: state.current ? state.current.stars : null, loved: marks.loved });
  }

  function syncMarks() {
    marks = sets();
    cosmos.setMarks({ loved: marks.loved, visited: marks.visited });
    labelContext();
  }

  // ── Arriving at a star.
  function computedRays(star) {
    return prism(universe, star).map(ray => ({ light: ray.light, star: ray.star, shared: ray.shared, claim: '', watch: '', read: false }));
  }

  function applyArrival(star, arrival, done) {
    if (state.focus !== star) return;
    state.arrival = arrival;
    const read = new Map((arrival.rays || []).map(ray => [ray.light, ray]));
    const taken = new Set();
    state.rays = LIGHT_IDS.map(light => {
      const mine = read.get(light);
      const charted = state.rays.find(ray => ray.light === light) || null;
      if (mine && mine.star !== star && !taken.has(mine.star)) {
        taken.add(mine.star);
        return { light, star: mine.star, shared: sharedTraits(universe, light, star, mine.star, 3), claim: mine.claim, watch: mine.watch, read: true };
      }
      if (charted) taken.add(charted.star);
      return charted;
    }).filter(Boolean);
    state.arrivalState = done ? 'read' : 'draft';
    drawRays();
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
  app.readArrival = (fresh = false) => { if (state.focus >= 0) readArrival(state.focus, { fresh }); };
  app.stopArrival = () => { pilot.cancel('arrival'); state.arrivalState = 'idle'; refresh('arrival'); };

  /**
   * Goes to a star.
   * @param {number} star
   * @param {{ quiet?: boolean, light?: string, far?: boolean, instant?: boolean }} [how]
   *   quiet: do not ask the Navigator (drifting, passing through); light: the ray travelled along
   */
  function focusStar(star, how = {}) {
    if (!(star >= 0 && star < universe.count)) return;
    const from = state.focus;
    if (!how.keepVoyage && state.voyage && !state.voyage.stops.some(stop => stop.star === star)) endVoyage();
    if (!how.drifting && state.drift) stopDrift();
    pilot.cancel('arrival');
    state.focus = star;
    state.galaxy = -1;
    state.arrival = null;
    state.arrivalState = 'idle';
    state.arrivalNote = '';
    state.rays = computedRays(star);
    state.deepState = 'idle';
    store.visit(slugOf(star));
    syncMarks();
    cosmos.setFocus(star);
    drawRays(); drawLinks(); drawWake(); drawDeep();

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
    updateAddress();
    checkConstellations();
    refresh('focus');
    if (!how.quiet && state.readArrivals) readArrival(star);
    else { const kept = pilot.cachedArrival(star); if (kept) applyArrival(star, kept, true); else { state.arrivalState = pilot.connected ? 'idle' : 'offline'; refresh('arrival'); } }
  }

  function blur() {
    pilot.cancel('arrival');
    state.focus = -1;
    state.galaxy = -1;
    state.rays = [];
    cosmos.setFocus(-1);
    cosmos.camera.setFollow(null);
    drawRays(); drawLinks(); drawDeep();
    labelContext();
    app.dossier?.hide();
    frameCosmos();
    updateAddress();
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
      cosmos.setSky(sky, { around: cosmos.positionOf(star) });
      camera.flyTo({ follow: () => cosmos.positionOf(star), hold: true, target: cosmos.restingPlace(star), duration: 2.9, lift: 1.5 });
    } else if (state.galaxy >= 0) {
      state.galaxy = -1;
      app.dossier?.hide();
      cosmos.setSky(sky);
      overview(2.9);
    } else {
      cosmos.setSky(sky);
      overview(2.9);
    }
    const light = lightById(sky);
    app.hud?.caption(`${light.name} · ${light.line}`, light.color, 5200);
    updateAddress();
    refresh('sky');
  }

  function overview(duration) {
    const reach = cosmos.reachOf(state.sky);
    cosmos.camera.flyTo({ target: [0, -30, 0], distance: reach * (small ? OVERVIEW.reachSmall : OVERVIEW.reach), pitch: OVERVIEW.pitch, ...(duration ? { duration } : {}) });
  }

  function goHome() {
    if (state.drift) stopDrift();
    blur();
    overview();
  }

  function openGalaxy(g, armIndex = -1) {
    const galaxy = (universe.galaxies[state.sky] || [])[g];
    if (!galaxy) return;
    if (state.drift) stopDrift();
    pilot.cancel('arrival');
    state.focus = -1;
    state.rays = [];
    state.galaxy = g;
    cosmos.setFocus(-1);
    drawRays(); drawLinks(); drawDeep();
    labelContext();
    const arm = armIndex >= 0 ? galaxy.arms.find(entry => entry.arm === armIndex) : null;
    cosmos.camera.flyTo(arm
      ? { target: arm.at, distance: galaxy.radius * 0.95, pitch: 0.7 }
      : { target: galaxy.centre, distance: galaxy.radius * (small ? 3.6 : 2.5), pitch: 0.82, swoop: 0.25 });
    app.dossier?.showGalaxy(g, armIndex);
    frameCosmos();
    updateAddress();
    refresh('focus');
  }

  // ── Love, seen.
  function toggle(set, star) {
    const on = store.toggle(set, slugOf(star));
    syncMarks();
    refresh('marks');
    return on;
  }

  // ── Lit sets: a current (everything carrying a trait), a nebula, a constellation.
  function setCurrent(current) {
    state.current = current;
    cosmos.setHighlight(current ? current.stars : null);
    cosmos.setLines('figure', current && current.figure ? current.figure : []);
    labelContext();
    refresh('current');
  }

  function showTrait(trait) {
    const record = universe.traits[trait];
    if (!record) return;
    const stars = new Set(carriers(universe, trait));
    setCurrent({ kind: 'trait', id: trait, label: record.t, note: 'a current', stars, colour: lightById(LIGHT_IDS[record.l]).color });
    if (state.focus < 0 || stars.size > 60) widen();
  }

  function showRegister(index) {
    const register = universe.bundle.registers[index];
    if (!register) return;
    const stars = new Set();
    films.forEach((film, i) => { if (film.rg && film.rg.includes(index)) stars.add(i); });
    setCurrent({ kind: 'register', id: index, label: register.label, note: register.blurb, stars, colour: register.hue });
    widen();
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

  function showConstellation(index) {
    const constellation = universe.bundle.constellations[index];
    if (!constellation) return;
    const stars = new Set(constellation.stars);
    setCurrent({
      kind: 'constellation', id: index, label: constellation.name,
      note: constellation.traits.map(trait => universe.traits[trait].t).join(' and '),
      stars, colour: '#dec6a0', figure: figureOf(stars),
    });
    widen(constellation.stars);
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
    for (const entry of progress) {
      if (!entry.found || state.found.has(entry.id)) continue;
      state.found.add(entry.id);
      if (!state.restoring) {
        const constellation = universe.bundle.constellations[entry.id];
        app.hud?.toast(`A constellation: ${constellation.name}`, { detail: `${constellation.traits.map(trait => universe.traits[trait].t).join(', and ')}. ${entry.seen} of its ${entry.total} stars are in your wake.`, action: 'Show it', onAction: () => showConstellation(entry.id), tone: 'gold' });
      }
    }
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

  // ── Voyages: a course the Navigator plots, or a passage the chart finds.
  function beginVoyage(voyage) {
    state.voyage = { ...voyage, at: -1 };
    drawVoyage();
    labelContext();
    refresh('voyage');
  }

  function endVoyage() {
    if (!state.voyage) return;
    state.voyage = null;
    drawVoyage();
    labelContext();
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

  // ── Drift: the chart carries you, a star at a time. No one is asked anything.
  let driftTimer = 0;
  function driftStep() {
    if (!state.drift) return;
    let star = state.focus;
    if (star < 0) {
      const lit = [];
      const G = universe.galaxyOf[state.sky];
      for (let i = 0; i < universe.base; i += 1) if (films[i].rn >= 3 && G[i] !== UNLIT) lit.push(i);
      star = lit[Math.floor(Math.random() * lit.length)] ?? 0;
      focusStar(star, { quiet: true, drifting: true });
    } else {
      const next = driftNext(universe, star, marks.visited, state.sky);
      if (!next) { stopDrift(); return; }
      const light = next.light === 'white' ? closestLight(universe, star, next.star).light : next.light;
      focusStar(next.star, { quiet: true, drifting: true, light });
    }
    driftTimer = setTimeout(driftStep, reducedMotion ? 9000 : 8200);
  }
  function startDrift() {
    if (state.drift) return;
    state.drift = true;
    refresh('drift');
    driftStep();
  }
  function stopDrift() {
    if (!state.drift) return;
    state.drift = false;
    clearTimeout(driftTimer);
    refresh('drift');
  }

  // ── The address bar remembers where you are.
  let writingAddress = false;
  function updateAddress() {
    const parts = [];
    if (state.focus >= 0) parts.push('star', slugOf(state.focus));
    else if (state.galaxy >= 0) parts.push('galaxy', String(state.galaxy));
    if (state.sky !== 'white') parts.push('light', state.sky);
    const hash = parts.length ? `#/${parts.join('/')}` : '';
    if (hash === window.location.hash || (!hash && !window.location.hash)) return;
    writingAddress = true;
    try { window.history.replaceState(null, '', hash || window.location.pathname + window.location.search); } catch { /* a sandboxed frame may refuse */ }
    writingAddress = false;
  }

  function readAddress() {
    const parts = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    const found = {};
    for (let n = 0; n + 1 < parts.length; n += 2) found[parts[n]] = decodeURIComponent(parts[n + 1]);
    return found;
  }

  function followAddress({ instant = false } = {}) {
    const address = readAddress();
    const sky = lightById(address.light) && address.light ? address.light : null;
    if (sky && sky !== state.sky && ALL_LIGHTS.some(light => light.id === sky)) {
      state.sky = sky;
      root.style.setProperty('--light', lightById(sky).color);
      cosmos.setSky(sky, { immediate: true });
      labels.rebuild();
    }
    if (address.star && starOf(address.star) >= 0) { focusStar(starOf(address.star), { instant }); return true; }
    if (address.galaxy !== undefined && (universe.galaxies[state.sky] || [])[Number(address.galaxy)]) { openGalaxy(Number(address.galaxy)); return true; }
    return false;
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
  });

  Object.assign(app, {
    focusStar, blur, setSky, goHome, openGalaxy, overview, toggle,
    setCurrent, showTrait, showRegister, showConstellation, widen,
    lookDeeper, chartFilm, beginVoyage, endVoyage, voyageTo, plotPassage,
    startDrift, stopDrift, checkConstellations, followAddress,
    between: (a, b) => between(universe, a, b, 4),
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

  window.addEventListener('hashchange', () => { if (!writingAddress) followAddress(); });
  window.addEventListener('resize', () => requestAnimationFrame(frameCosmos));
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
    if (event.key === '/') { event.preventDefault(); app.searchView.open(); }
    else if (/^[0-6]$/.test(event.key)) setSky(ALL_LIGHTS[Number(event.key)].id);
    else if (event.key === 'h' || event.key === 'Home') goHome();
    else if (event.key === 'd') { if (state.drift) stopDrift(); else startDrift(); }
    else if (event.key === 'l' && state.focus >= 0) toggle('loved', state.focus);
  });

  return app;
}
