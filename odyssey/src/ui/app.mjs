// The voyage itself: what happens when a star is reached, a light is changed,
// a course is plotted, a door is taken, a film is landed on. Views draw; this decides.
import { ALL_LIGHTS, LIGHT_IDS, lightById } from '../engine/lights.mjs';
import { UNLIT } from '../engine/universe.mjs';
import { prism, passage, between, driftNext, carriers, constellationProgress, sharedTraits, closestLight } from '../engine/voyage.mjs';
import { doors, homeLikeness, rings, routeOf, typicality } from '../engine/journey.mjs';
import { heightAt, lineage, timeRings, TIME, TIME_RINGS } from '../engine/time.mjs';
import { cometBond, cometFor, cometPath, nightOf } from '../engine/comet.mjs';
import { TEMPER_COLOUR, TEMPER_IDS, bend, temperById, temperOf, temperWord } from '../engine/temper.mjs';
import { CLEAR_SKY, cleanSeeing, describeSeeing, hazeOf, isClear, outside } from '../engine/seeing.mjs';
import { bearingResult, bearingStrength, createBearing, reasonOf } from '../engine/bearing.mjs';
import { bondOf, decodeSky, encodeSky, skiesMeet, together } from '../engine/together.mjs';
import { wormholes } from '../engine/wormhole.mjs';
import { attachControls } from '../cosmos/camera.mjs';
import { createOrbits } from '../cosmos/orbits.mjs';
import { createFigures } from '../cosmos/figures.mjs';
import { createComet } from '../cosmos/comet.mjs';
import { hexToRgb } from '../cosmos/math.mjs';
import { GALAXY_HUES } from '../cosmos/renderer.mjs';
import { createHud } from './hud.mjs';
import { createDossier } from './dossier.mjs';
import { createSearchView } from './search.mjs';
import { createPanels } from './panels.mjs';
import { createEntrance } from './entrance.mjs';
import { h, plural } from './dom.mjs';

const RGB = Object.fromEntries(ALL_LIGHTS.map(light => [light.id, hexToRgb(light.color)]));
const IVORY = [0.96, 0.94, 0.9];
const STARLIGHT = [0.87, 0.78, 0.63];
const GOLD = [0.94, 0.79, 0.53];
const SILVER = [0.61, 0.73, 0.73];
const PALE = [0.8, 0.88, 1];
const SEEING = '#c9d7f2'; // tonight's seeing: moonlight
const WORMHOLE = '#e48cff'; // a wormhole: the short way through
const WORM = hexToRgb(WORMHOLE);
// The whole universe in one look: how far back, how steeply, and how far the camera leans toward the viewer.
export const OVERVIEW = { reach: 2.0, reachSmall: 3.4, pitch: 0.95, bias: 0.125 };
const DRIFT_EVERY = 12500;
const HUD_TOP = 76; // the instruments along the top of the screen, and where you are beneath them
const KEYS = [['/', 'find a film'], ['0–6', 'change the light'], ['7', 'look back through time'], ['← → ↑ ↓', 'turn the sky'], ['+ −', 'nearer, further'], ['Backspace', 'go back'], ['Esc', 'leave or close'], ['L', 'love'], ['W', 'watchlist'], ['D', 'drift'], ['C', 'tonight\'s comet'], ['J', 'through a wormhole'], ['B', 'take a bearing'], ['T', 'watching together'], ['H', 'the whole universe'], ['?', 'these keys']];

export function createApp({ root, universe, depth, deepen = () => Promise.reject(new Error('no deeper notes here')), cosmos, labels, pilot, store, search, small, reducedMotion, edition = 'site' }) {
  const state = {
    sky: 'white',
    focus: -1,
    galaxy: -1,
    arm: -1,
    arrival: null,        // what the Navigator said of the focused star
    arrivalState: 'idle', // idle | looking (for a reading written ahead) | asking | draft | read | failed | waiting | offline
    arrivalNote: '',
    rays: [],             // the six rays of the focused star: [{ light, star, shared, claim, watch, read }]
    holes: [],            // its wormholes: [{ star, light, sim, rank, shared }]
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
  // Tonight's seeing, kept for the night it was set, and the haze over the films outside it.
  let seeing = store.state.seeing && store.state.seeing.night === nightOf() ? cleanSeeing(store.state.seeing) : cleanSeeing(CLEAR_SKY);
  let haze = hazeOf(universe, seeing);
  // Films never offered as somewhere to go next: the ones set aside, the ones already watched, and tonight's haze.
  let notFor = new Set();
  const excluding = () => { notFor = new Set([...marks.hidden, ...marks.seen, ...haze]); };
  excluding();

  const app = {
    root, universe, depth, deepen, cosmos, labels, pilot, store, search, state, small, reducedMotion, edition,
    films, starOf, slugOf,
    get marks() { return marks; },
    get notFor() { return notFor; },
    get seeing() { return seeing; },
    get haze() { return haze; },
    on(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
  const refresh = what => { for (const listener of listeners) listener(what); };
  app.refresh = refresh;
  // Lookback arranges the films by time; for likeness it sees them as white light does.
  const likeness = () => (state.sky === TIME ? 'white' : state.sky);
  // "the 1960s", "before 1930": a decade of Lookback, said inside a sentence.
  const when = galaxy => (/^The /.test(galaxy.name) ? `in ${galaxy.name.replace(/^The /, 'the ')}` : galaxy.name.replace(/^Before/, 'before'));
  app.when = when;

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
    if (state.focus < 0) { cosmos.setLines('rays', []); cosmos.setLines('wormhole', []); cosmos.setRayEnds([]); return; }
    const list = leading();
    // Inside a star system the rings say it; the lines wait until you draw back.
    cosmos.setLines('rays', state.system ? [] : list.map((ray, n) => ({
      a: state.focus, b: ray.star, colour: [...RGB[ray.light], 0.85], width: 2.6, style: 1, phase: n * 0.17, wait: n * 0.07, grow: 0.9,
    })));
    // A wormhole is drawn last and slowest: a thread of beads running off across the sky.
    cosmos.setLines('wormhole', state.system ? [] : state.holes.map((hole, n) => ({
      a: state.focus, b: hole.star, colour: [...WORM, 0.85], width: 2.4, style: 5, phase: n * 0.37, wait: 0.7 + n * 0.3, grow: 1.8,
    })));
    cosmos.setRayEnds([...list.map(ray => ray.star), ...state.holes.map(hole => hole.star)]);
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

  // ── Lookback: the rings of the decades, and a film's line of sight back and forward through time.
  let sight = { key: '', back: [], forth: [] };
  function lineOf(star) {
    const key = `${star}:${universe.count}`;
    if (sight.key !== key) {
      sight = { key, back: lineage(universe, star, { direction: -1 }), forth: lineage(universe, star, { direction: 1 }) };
    }
    return sight;
  }

  function drawEpochs() {
    if (state.sky !== TIME || !universe.time) { cosmos.setLines('epochs', []); return; }
    const lines = [];
    universe.time.edges.forEach((radius, n) => {
      const pieces = Math.max(24, Math.min(72, Math.round(radius / 14)));
      const y = heightAt(radius);
      const alpha = n === 0 ? 0.16 : 0.07;
      for (let k = 0; k < pieces; k += 1) {
        const a0 = (k / pieces) * Math.PI * 2;
        const a1 = ((k + 1) / pieces) * Math.PI * 2;
        lines.push({ a: [Math.cos(a0) * radius, y, Math.sin(a0) * radius], b: [Math.cos(a1) * radius, y, Math.sin(a1) * radius], colour: [...IVORY, alpha], width: 1.1, style: 4, grow: 1.4, wait: 0.9 + n * 0.05 });
      }
    });
    cosmos.setLines('epochs', lines);
  }

  const BEFORE = hexToRgb(TIME_RINGS.before.color);
  const AFTER = hexToRgb(TIME_RINGS.after.color);
  function drawSight() {
    if (state.sky !== TIME || state.focus < 0 || state.system) { cosmos.setLines('sight', []); return; }
    const line = lineOf(state.focus);
    const lines = [];
    line.back.forEach((step, n) => lines.push({ a: step.from, b: step.star, colour: [...BEFORE, 0.8 - n * 0.09], width: 2.2, style: 1, phase: n * 0.21, wait: 0.5 + n * 0.32, grow: 0.7 }));
    line.forth.forEach((step, n) => lines.push({ a: step.from, b: step.star, colour: [...AFTER, 0.75 - n * 0.09], width: 2, style: 1, phase: n * 0.21, wait: 0.5 + n * 0.32, grow: 0.7 }));
    cosmos.setLines('sight', lines);
  }
  app.lineOf = lineOf;

  function labelContext() {
    const rays = new Map(leading().map(ray => [ray.star, lightById(ray.light).color]));
    if (state.sky === TIME && state.focus >= 0) {
      const line = lineOf(state.focus);
      for (const step of line.back) if (!rays.has(step.star)) rays.set(step.star, TIME_RINGS.before.color);
      for (const step of line.forth) if (!rays.has(step.star)) rays.set(step.star, TIME_RINGS.after.color);
    }
    for (const item of (state.focus >= 0 && state.deep.get(state.focus)) || []) rays.set(item.star, '#cfe0ff');
    for (const hole of state.holes) if (!rays.has(hole.star)) rays.set(hole.star, WORMHOLE);
    if (state.voyage) for (const stop of state.voyage.stops) if (!rays.has(stop.star)) rays.set(stop.star, '#dec6a0');
    if (state.journey) for (const stop of state.journey.path) if (!rays.has(stop.star)) rays.set(stop.star, '#f0c987');
    // In Lookback the kinds of film are named only in the decade you are in.
    const ring = state.sky !== TIME ? -1 : state.focus >= 0 ? universe.galaxyOf.time[state.focus] : state.galaxy;
    labels.setContext({ focus: state.focus, rays, highlight: state.current ? state.current.lit || state.current.stars : null, loved: marks.loved, ring });
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
    onStar: (star, light) => focusStar(star, { light: LIGHT_IDS.includes(light) || state.focus < 0 ? light : closestLight(universe, state.focus, star).light }),
    onHole: n => throughWormhole(n),
    onHover: star => cosmos.setHover(star),
    onMode: active => {
      state.system = active;
      labels.setContext({ system: active });
      cosmos.setVeil(active ? 0.5 : 0);
      drawRays(); drawLinks(); drawDeep(); drawSight();
      refresh('system');
    },
  });

  function updateSystem() {
    if (state.focus < 0) { orbits.setSystem(-1); return; }
    const first = new Map();
    const taken = new Set();
    for (const door of openDoors()) { first.set(door.light, door.star); taken.add(door.star); }
    for (const ray of state.rays) if (!first.has(ray.light) && !taken.has(ray.star)) { first.set(ray.light, ray.star); taken.add(ray.star); }
    orbits.setLight(likeness());
    let built;
    if (state.sky === TIME) {
      // Seen in time, a film's system is what came before it, what came after, and what was made beside it.
      const line = lineOf(state.focus);
      built = timeRings(universe, state.focus, { exclude: notFor, per: small ? 2 : 3, back: line.back, forth: line.forth });
    } else {
      // Under one light its ring goes innermost, where it shows best; on a phone the
      // innermost ring runs behind the film's own card, so the rings keep their order there.
      const lead = small || state.sky === 'white' ? null : state.sky;
      built = rings(universe, state.focus, { first, exclude: notFor, per: small ? 2 : 3, lead });
    }
    // A wormhole leads somewhere the rings do not already show.
    const shown = new Set(built.flatMap(ring => ring.stars));
    if (state.holes.some(hole => shown.has(hole.star))) {
      state.holes = holesAt(state.focus, shown);
      drawRays(); labelContext();
      refresh('holes');
    }
    orbits.setHoles(state.focus, state.holes.map(hole => ({ star: hole.star, colour: WORMHOLE, says: `far across the sky, yet near in ${lightById(hole.light).short}` })));
    orbits.setSystem(state.focus, built);
    orbits.setDoors(openDoors().map(door => door.star));
  }

  // ── Constellations waiting in the sky.
  const figures = createFigures({
    root: document.getElementById('labels'), cosmos, universe, small,
    onFigure: id => browse('constellation', id),
    hintOf: id => hintOf(id),
  });
  const quietSky = () => figures.setEnabled(!state.current && !state.journey && !state.voyage);

  // ── Tonight's comet: once a night, a film the chart thinks you are missing crosses the sky until it is caught.
  const COMET = '#a9c8ff';
  let comet = null; // tonight's, as kept, with its stars: { night, slug, from, light, why, caught, star, fromStar }
  const cometView = createComet({
    root: document.getElementById('labels'), cosmos, reducedMotion,
    // It crosses an open sky: not a star you are at, a voyage under way or a drift.
    room: () => Boolean(comet && !comet.caught && state.entered && state.focus < 0 && !state.journey && !state.voyage && !state.drift),
    onCatch: () => catchComet(),
  });
  /** Tonight's comet, chosen the first time it is asked for each night and kept, so it is the same all night. */
  function tonight() {
    const night = nightOf();
    let kept = store.state.comets.find(other => other.night === night);
    if (kept && starOf(kept.slug) < 0) kept = null; // its film has left the chart: another is chosen
    // Until it is caught its film is unknown, so if tonight's seeing hazes it, one that fits is chosen instead.
    if (kept && !kept.caught && haze.has(starOf(kept.slug))) kept = null;
    if (!kept) {
      const exclude = new Set([...marks.hidden, ...marks.seen, ...marks.watchlist, ...haze]);
      for (const other of store.state.comets) { const star = starOf(other.slug); if (star >= 0) exclude.add(star); }
      const visited = store.state.wake.map(starOf).filter(star => star >= 0);
      const picked = cometFor(universe, { night, loved: [...marks.loved], visited, exclude });
      kept = picked && store.keepComet({ night, slug: slugOf(picked.star), from: picked.from >= 0 ? slugOf(picked.from) : null, light: picked.light, why: picked.why });
    }
    if (!kept) { comet = null; cometView.set(null); return null; }
    if (!comet || comet.night !== kept.night || comet.slug !== kept.slug) {
      comet = { ...kept, star: starOf(kept.slug), fromStar: kept.from ? starOf(kept.from) : -1 };
      cometView.set({ star: comet.star, path: cometPath(night) });
    }
    comet.caught = kept.caught;
    return comet;
  }
  /** Why the comet carried its film, in a sentence. */
  function cometReason(entry) {
    const star = entry.star ?? starOf(entry.slug);
    const fromStar = entry.fromStar ?? (entry.from ? starOf(entry.from) : -1);
    if (fromStar < 0 || star < 0) return 'A film the chart thought you were missing.';
    const from = films[fromStar].t;
    const lead = { loved: `It came from near ${from}, which you love`, visited: `It came from near ${from}, where you had been` }[entry.why] || `Few have found it. It came from near ${from}`;
    if (!entry.light) return `${lead}.`;
    const shared = cometBond(universe, fromStar, star, entry.light).said.map(trait => universe.traits[trait].s || universe.traits[trait].t);
    return `${lead}, alike in ${lightById(entry.light).short}${shared.length ? `: ${shared.join(' · ')}` : ''}.`;
  }
  /** Catches tonight's comet: what it carries is revealed, and you are taken to it. */
  function catchComet() {
    const entry = tonight();
    if (!entry || entry.star < 0) return;
    const first = !entry.caught;
    if (first) {
      if (cometView.shown) cometView.flare();
      store.catchComet(entry.night);
      entry.caught = true;
      refresh('comet');
    }
    const go = () => {
      focusStar(entry.star);
      app.hud?.caption(`${first ? 'Tonight\'s comet' : 'Tonight\'s comet, caught'} · ${cometReason(entry)}`, COMET, 9000);
    };
    if (first && cometView.shown && !reducedMotion) setTimeout(go, 380); else go();
  }
  /** Draws back until tonight's comet can be seen crossing the sky. */
  function showComet() {
    const entry = tonight();
    if (!entry) return;
    if (entry.caught) { catchComet(); return; }
    if (state.drift) stopDrift();
    if (state.focus >= 0 || state.galaxy >= 0) blur();
    // Seen from above: where it is now, and the way it still has to go.
    const place = cometView.where();
    if (place) {
      const target = [0, 1, 2].map(k => place.at[k] * 0.62 + place.star[k] * 0.38);
      const span = Math.hypot(place.at[0] - place.star[0], place.at[2] - place.star[2]);
      cosmos.camera.flyTo({ target, distance: Math.min(1500, Math.max(650, span * (small ? 2.6 : 1.8))), pitch: 0.95 });
    }
    app.hud?.caption('Tonight\'s comet · catch it to see the film it carries', COMET, 6500);
  }
  // A new night brings a new comet, even to a sky left open.
  setInterval(() => {
    if (comet && comet.night !== nightOf()) { tonight(); refresh('comet'); }
    // Tonight's seeing was for tonight: a new night begins under a clear sky.
    if (store.state.seeing && store.state.seeing.night !== nightOf()) setSeeing(CLEAR_SKY);
    // And tonight's bearing: a new night is found afresh.
    if (store.state.bearing && store.state.bearing.night !== nightOf()) {
      store.set('bearing', null);
      if (state.current?.kind === 'bearing' && !taking) setCurrent(null);
      refresh('bearing');
    }
  }, 60000);

  // ── Arriving at a star.
  function computedRays(star) {
    return prism(universe, star, { exclude: notFor }).map(ray => ({ light: ray.light, star: ray.star, shared: ray.shared, claim: '', watch: '', read: false }));
  }
  /** The wormholes at a star: never a film a ray or a ring already leads to, or one that is not offered. */
  function holesAt(star, shown = null) {
    if (star < 0) return [];
    return wormholes(universe, star, { exclude: new Set([...notFor, ...state.rays.map(ray => ray.star), ...(shown || [])]) });
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
    state.holes = holesAt(star);
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
   * @param {{ quiet?: boolean, light?: string, instant?: boolean, drifting?: boolean, keepVoyage?: boolean, history?: boolean, through?: string }} [how]
   *   quiet: do not ask the Navigator (drifting, passing through); light: the ray travelled along;
   *   history: arrived by going back or forward, so nothing is added to the way back;
   *   through: arrived through a wormhole, said so in these words
   */
  function focusStar(star, how = {}) {
    if (!(star >= 0 && star < universe.count)) return;
    const from = state.focus;
    if (!how.keepVoyage && state.voyage && !state.voyage.stops.some(stop => stop.star === star)) endVoyage();
    if (!how.drifting && state.drift) stopDrift();
    pilot.cancel('arrival');
    // A decade lit only because it was opened goes dark when you leave it for one of its stars.
    if (state.current?.auto) setCurrent(null);
    state.focus = star;
    state.galaxy = -1;
    state.arm = -1;
    state.arrival = null;
    state.arrivalState = 'idle';
    state.arrivalNote = '';
    state.rays = computedRays(star);
    state.holes = holesAt(star);
    state.deepState = 'idle';
    extendJourney(star, how.light);
    store.visit(slugOf(star));
    syncMarks();
    cosmos.setFocus(star);
    drawRays(); drawLinks(); drawWake(); drawDeep(); drawJourney(); drawSight();
    updateSystem();

    const place = cosmos.restingPlace(star);
    const camera = cosmos.camera;
    const near = small ? 118 : 150;
    if (how.instant) camera.jumpTo({ target: place, distance: near, pitch: 0.5 });
    else if (how.through) {
      // Out of a wormhole: already at the far film, far back and turned, and drawn in toward it.
      camera.jumpTo({ target: place, distance: near * 3.4, pitch: 0.66, yaw: camera.state.yaw - 1.1 });
      camera.flyTo({ target: place, distance: near, pitch: 0.5, swoop: 1.1, duration: reducedMotion ? 0.001 : 2.1, follow: () => cosmos.positionOf(star) });
    } else camera.flyTo({ target: place, distance: near, pitch: 0.5, swoop: from >= 0 ? (star % 2 ? 0.34 : -0.34) : 0.5, follow: () => cosmos.positionOf(star) });

    if (how.through) app.hud?.caption(how.through, WORMHOLE, 6500);
    else if (from >= 0 && from !== star && how.light) {
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

  // ── Wormholes: at a star, a film far across the sky that is yet one of its nearest in one deep thing.
  let warping = false;
  /** Goes through a wormhole: the sky is drawn into the star you are at, and opens again at the far film. */
  function throughWormhole(n = 0) {
    const hole = state.holes[n];
    const from = state.focus;
    if (!hole || from < 0 || warping) return;
    if (state.drift) stopDrift();
    const shared = hole.shared.slice(0, 2).map(trait => universe.traits[trait].s || universe.traits[trait].t);
    const through = `Through a wormhole from ${films[from].t} \u00b7 alike in ${lightById(hole.light).short}${shared.length ? `: ${shared.join(' \u00b7 ')}` : ''}`;
    const go = () => { if (state.focus === from) focusStar(hole.star, { light: hole.light, through }); }; // unless gone elsewhere meanwhile
    if (reducedMotion) { go(); return; }
    // Drawn in where the star is on screen, or the middle of the open sky.
    const at = cosmos.project(from) || { x: (covered.left + cosmos.size.width - covered.right) / 2, y: cosmos.size.height / 2 };
    const warp = h('div.warp', { 'aria-hidden': 'true', style: { '--x': `${Math.round(at.x)}px`, '--y': `${Math.round(at.y)}px` } },
      h('div.warp-shade'), h('div.warp-rings'), h('div.warp-light'));
    root.querySelector('#app').append(warp);
    warping = true;
    setTimeout(go, 800); // when the light fills the sky
    setTimeout(() => { warp.remove(); warping = false; }, 1650);
  }

  function blur({ history = false } = {}) {
    clearTimeout(arrivalTimer);
    pilot.cancel('arrival');
    if (state.current?.auto) setCurrent(null);
    state.focus = -1;
    state.galaxy = -1;
    state.arm = -1;
    state.rays = [];
    state.holes = [];
    cosmos.setFocus(-1);
    cosmos.camera.setFollow(null);
    orbits.setSystem(-1);
    drawRays(); drawLinks(); drawDeep(); drawSight();
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
    if (state.current && (state.current.kind === 'galaxy' || state.current.kind === 'arm' || state.current.kind === 'kind')) setCurrent(null);
    drawEpochs(); drawSight(); labelContext();
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
    state.holes = [];
    state.galaxy = g;
    const arm = armIndex >= 0 ? galaxy.arms.find(entry => entry.arm === armIndex) : null;
    state.arm = arm ? armIndex : -1;
    cosmos.setFocus(-1);
    orbits.setSystem(-1);
    drawRays(); drawLinks(); drawDeep(); drawSight();
    labelContext();
    cosmos.camera.flyTo(arm
      ? { target: arm.at, distance: galaxy.radius * 0.95, pitch: 0.7 }
      // A decade is a ring around the present: all of it is framed.
      : galaxy.ring ? { target: galaxy.centre, distance: galaxy.ring.outer * (small ? 3.3 : 2.3), pitch: 0.95, swoop: 0.2 }
        : { target: galaxy.centre, distance: galaxy.radius * (small ? 3.6 : 2.5), pitch: 0.82, swoop: 0.25 });
    // A ring among rings is easiest to see lit, unless something else is lit already.
    if (galaxy.ring && (!state.current || state.current.auto || state.current.kind === 'galaxy' || state.current.kind === 'arm')) {
      const set = setOf(arm ? 'arm' : 'galaxy', g, armIndex);
      if (set) show({ ...set, auto: true }, { frame: false });
    } else if (state.current?.auto) setCurrent(null);
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
      state.holes = holesAt(state.focus);
      if (kept) applyArrival(state.focus, kept, state.arrivalState === 'read');
      if (state.journey && !state.journey.landed) computeDoors();
      drawRays(); updateSystem(); labelContext();
    }
    refresh('marks');
  }

  /** Sets tonight's seeing: the films outside it fade into haze, and nothing in the haze is offered next. */
  function setSeeing(next) {
    const was = describeSeeing(seeing);
    seeing = cleanSeeing(next);
    store.set('seeing', isClear(seeing) ? null : { night: nightOf(), ...seeing });
    haze = hazeOf(universe, seeing);
    cosmos.setHaze(haze);
    labels.setContext({ haze: haze.size ? haze : null });
    marksChanged();
    if (!comet || !comet.caught) { tonight(); refresh('comet'); } // an uncaught comet keeps to tonight's seeing
    refresh('seeing');
    const now = describeSeeing(seeing);
    if (now !== was) app.hud?.caption(now ? `Tonight · ${now} · ${plural(universe.count - haze.size, 'film')} in view, the rest in haze` : 'A clear sky · every film in view again', SEEING, 6000);
  }
  /** Why a film is outside tonight's seeing, in short phrases; empty if it is in view. */
  const outsideSeeing = star => (haze.has(star) ? outside(universe, star, seeing) : []);

  // ── Take a bearing: a few choices between two films everyone knows, and the sky turns toward tonight's film.
  const BEARING = '#d8c48e';
  let taking = null; // the bearing under way, if one is
  // Never offered at the end: what is never offered anywhere, and the films already loved. Never shown as a landmark: what is set aside or in the haze.
  const bearingAway = () => new Set([...notFor, ...marks.loved]);
  const bearingVeil = () => new Set([...marks.hidden, ...haze]);
  /** Tonight's bearing, if one was taken, as [[chosen, passed over]] in stars. */
  function keptBearing() {
    const kept = store.state.bearing;
    if (!kept || kept.night !== nightOf()) return null;
    const choices = kept.choices.map(pair => pair.map(starOf)).filter(pair => pair.every(star => star >= 0));
    return choices.length ? choices : null;
  }
  const bearingNames = choices => {
    const names = [...new Set(choices.map(pair => pair[0]))].map(star => films[star].t);
    return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || '';
  };
  /** Why a film answers tonight's bearing, in a line: the films chosen it is nearest, and what it shares with the first. */
  function bearingReason(reason) {
    const near = reason.near.map(star => films[star].t);
    const shared = reason.shared.map(trait => universe.traits[trait].s || universe.traits[trait].t);
    if (!near.length) return '';
    return `Near ${near.join(' and ')}, which you chose${shared.length ? ` \u00b7 ${shared.join(' \u00b7 ')}` : ''}`;
  }
  /** Turns the sky toward a few films: their middle, close enough to see most of them. */
  function aimAt(stars) {
    if (!stars.length) return;
    const P = universe.positions[state.sky];
    let x = 0; let y = 0; let z = 0;
    for (const star of stars) { x += P[star * 3]; y += P[star * 3 + 1]; z += P[star * 3 + 2]; }
    x /= stars.length; y /= stars.length; z /= stars.length;
    const reach = stars.map(star => Math.hypot(P[star * 3] - x, P[star * 3 + 2] - z)).sort((a, b) => a - b);
    const far = reach[Math.floor(reach.length * 0.7)] || 0;
    cosmos.camera.setFollow(null);
    cosmos.camera.flyTo({ target: [x, y, z], distance: Math.min(2200, Math.max(480, far * (small ? 3.4 : 2.4))), pitch: 0.9 });
  }
  /** Lights what the bearing leans toward so far: fewer films with every choice, the sky turning toward them. */
  function lightBearing() {
    const bearing = taking;
    if (!bearing || !bearing.round) { if (state.current?.kind === 'bearing') setCurrent(null); return; }
    const n = Math.round(320 / 1.7 ** (bearing.round - 1));
    const lit = bearing.lit(n);
    setCurrent({
      kind: 'bearing', id: 'live', label: 'Tonight\'s bearing', note: `${bearing.round} of ${bearing.rounds} choices made: toward ${bearingNames(bearing.choices)}`,
      stars: new Set(lit), colour: BEARING, light: 'white', strength: bearingStrength(bearing.weight, lit),
    });
    aimAt(lit.slice(0, Math.max(8, Math.round(n / 3))));
  }
  /** Takes a bearing: the one under way, tonight's if one was taken, or a new one (always, when asked afresh). */
  function takeBearing({ fresh = false } = {}) {
    if (state.drift) stopDrift();
    if (fresh || (!taking && !keptBearing())) {
      taking = createBearing(universe, { exclude: bearingAway(), veil: bearingVeil(), seed: (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0 });
      if (state.current?.kind === 'bearing') setCurrent(null);
    } else if (!taking && state.current?.kind !== 'bearing') {
      const set = setOf('bearing', 'tonight');
      if (set) show(set, { frame: false });
    }
    if (state.focus >= 0 || state.galaxy >= 0) blur();
    app.panels.open('bearing');
  }
  /** One film of the pair is nearer tonight. After the last choice the bearing is kept for the night and the sky turns to it. */
  function chooseBearing(star) {
    if (!taking) return;
    taking.choose(star);
    if (!taking.done) { lightBearing(); refresh('bearing'); return; }
    store.set('bearing', { night: nightOf(), choices: taking.choices.map(pair => pair.map(slugOf)) });
    taking = null;
    const set = setOf('bearing', 'tonight');
    if (set) { show(set, { frame: false }); aimAt(set.result.picks.map(pick => pick.star).concat(set.result.stars.slice(0, 9))); }
    refresh('bearing');
    if (set) app.hud?.caption(`Tonight's bearing \u00b7 the sky has turned toward ${films[set.result.picks[0].star].t}`, BEARING, 6500);
  }
  const skipBearing = () => { if (taking) { taking.skip(); refresh('bearing'); } };

  // ── Watching together: two skies, and the films each person would choose for reasons of their own.
  const YOURS = '#f0c987';
  const THEIRS = '#a9b8ff';
  const TOGETHER = '#e3cfee';
  const theirStars = () => (store.state.together?.slugs || []).map(starOf).filter(star => star >= 0);
  const theirName = () => store.state.together?.name || '';
  /** Sets the other sky: the films the other person loves, and their name if given. */
  function setTheirs(slugs, name = theirName()) {
    const clean = [...new Set(slugs)].filter(slug => starOf(slug) >= 0).slice(0, 60);
    const named = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 24);
    store.set('together', clean.length || named ? { name: named, slugs: clean } : null);
    if (state.current?.kind === 'together') { const set = setOf('together', 'now'); if (set) setCurrent(set); else setCurrent(null); }
    refresh('together');
  }
  const addTheirs = star => setTheirs([...(store.state.together?.slugs || []), slugOf(star)]);
  const dropTheirs = star => setTheirs((store.state.together?.slugs || []).filter(slug => slug !== slugOf(star)));
  const nameTheirs = name => setTheirs(store.state.together?.slugs || [], name);
  /** What the two skies come to: the films for both, under which lights they meet, and the films both love. */
  function bothSkies() {
    const mine = [...marks.loved];
    const theirs = theirStars();
    if (!mine.length || !theirs.length) return null;
    return {
      mine, theirs, name: theirName(),
      both: together(universe, mine, theirs, { exclude: notFor, k: 12 }),
      lights: skiesMeet(universe, mine, theirs),
      shared: theirs.filter(star => marks.loved.has(star)),
    };
  }
  /** Why a film is for one of you, in a line: "Near Heat · Obsession · Cerebral horror". */
  function sideOf(side, star) {
    if (side.from < 0) return '';
    const shared = bondOf(universe, side.from, star).map(trait => universe.traits[trait].s || universe.traits[trait].t);
    return `Near ${films[side.from].t}${shared.length ? ` \u00b7 ${shared.join(' \u00b7 ')}` : ''}`;
  }
  /** A sky someone sent: it becomes the other sky, and the films for both of you are shown. */
  function receiveSky(sky) {
    const stars = sky.slugs.map(starOf).filter(star => star >= 0);
    if (!stars.length) return false;
    store.set('together', { name: sky.name || '', slugs: stars.map(slugOf) });
    refresh('together');
    app.panels.open('together');
    app.hud?.caption(`${sky.name ? `${sky.name}\u2019s sky` : 'A sky sent to you'} \u00b7 ${plural(stars.length, 'film')} they love`, THEIRS, 6000);
    return true;
  }
  /** Your sky, to send: a link where there is one, or a line to paste into theirs. */
  async function sendSky() {
    const slugs = [...store.state.loved].slice(-60);
    if (!slugs.length) return;
    const line = encodeSky(slugs);
    const link = edition === 'claude' ? '' : `${window.location.origin}${window.location.pathname}#${encodeURIComponent(line)}`;
    const text = `My sky in the Odyssey: ${plural(slugs.length, 'film')} I love. Open it to see the films for both of us.`;
    const touch = small || window.matchMedia?.('(pointer: coarse)').matches;
    if (touch && link && typeof navigator.share === 'function') {
      try { await navigator.share({ title: 'My sky', text, url: link }); return; } catch (error) { if (error?.name === 'AbortError') return; }
    }
    const words = link ? `${text}\n${link}` : line;
    try {
      await navigator.clipboard.writeText(words);
      app.hud?.toast(link ? 'Copied: a link to your sky' : 'Copied: your sky, as a line', { detail: link ? 'Send it to the person you are watching with.' : 'They paste it into Watching together, in their own Odyssey.', tone: 'pale' });
    } catch {
      app.hud?.toast('Copy this to send your sky', { detail: words, hold: 16000 });
    }
  }

  const undoBearing = () => { if (taking) { taking.undo(); lightBearing(); refresh('bearing'); } };

  // ── Lit sets: a current (everything carrying a trait), a nebula, a constellation, a galaxy or one of its systems.
  function setCurrent(current) {
    state.current = current;
    cosmos.setHighlight(current ? current.lit || current.stars : null); // lit: more than is listed (the films each loves, for two skies)
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
    if (kind === 'bend') {
      // A film bent along one of its readings: the films most like it with that one clearly changed.
      const [at, id2, way] = String(id).split(':');
      const star = Number(at);
      const direction = Number(way);
      const temper = temperById(id2);
      const own = star >= 0 && star < universe.count ? temperOf(films[star]) : null;
      const n = TEMPER_IDS.indexOf(id2);
      if (!temper || !own || !(own[n] >= 0)) return null;
      const found = bend(universe, star, id2, direction, { exclude: notFor });
      if (!found.length) return null;
      const film = films[star];
      const top = found[0].score || 1;
      const name = temper.name.toLowerCase();
      return {
        kind, id, from: star, label: `Like ${film.t}, but ${direction < 0 ? temper.less : temper.more}`,
        note: `The films most like ${film.t} with clearly ${direction < 0 ? 'less' : 'more'} ${name}, and the rest of its temper kept. ${film.t} reads ${own[n]} for ${name}: ${temperWord(id2, own[n])}.`,
        stars: new Set(found.map(entry => entry.star)), colour: TEMPER_COLOUR, light: 'white',
        strength: new Map(found.map(entry => [entry.star, entry.score / top])),
        rows: new Map(found.map(entry => [entry.star, `${temper.name} ${entry.value} against ${film.t}\u2019s ${own[n]}`])),
      };
    }
    if (kind === 'together') {
      // The films for both of you: each with a thread to the film you love it is nearest, and one to theirs.
      const skies = bothSkies();
      if (!skies || !skies.both.length) return null;
      const name = skies.name || 'them';
      const warm = hexToRgb(YOURS);
      const cool = hexToRgb(THEIRS);
      const figure = [];
      skies.both.forEach((entry, n) => {
        if (entry.mine.from >= 0) figure.push({ a: entry.mine.from, b: entry.star, colour: [...warm, 0.6], width: 1.3, style: 0, grow: 1.3, wait: n * 0.09 });
        if (entry.theirs.from >= 0) figure.push({ a: entry.theirs.from, b: entry.star, colour: [...cool, 0.6], width: 1.3, style: 0, grow: 1.3, wait: n * 0.09 + 0.05 });
      });
      const top = skies.both[0].score || 1;
      return {
        kind, id, label: 'For both of you', skies,
        note: `Each near a film you love and near one ${name === 'them' ? 'they love' : `${name} loves`}: gold threads to yours, blue to theirs`,
        stars: new Set(skies.both.map(entry => entry.star)), colour: TOGETHER, light: 'white', figure,
        lit: new Set([...skies.both.map(entry => entry.star), ...skies.mine, ...skies.theirs]),
        strength: new Map(skies.both.map(entry => [entry.star, entry.score / top])),
        rows: new Map(skies.both.map(entry => [entry.star, [sideOf(entry.mine, entry.star) && `For you: ${sideOf(entry.mine, entry.star)}`, sideOf(entry.theirs, entry.star) && `For ${name}: ${sideOf(entry.theirs, entry.star)}`].filter(Boolean).join(' / ')])),
      };
    }
    if (kind === 'bearing') {
      // Where tonight's bearing points: the films the sky leans toward after the choices made.
      const choices = keptBearing();
      if (!choices) return null;
      const result = bearingResult(universe, choices, { exclude: bearingAway(), galaxyOf: universe.galaxyOf.white });
      if (!result) return null;
      const cache = new Map();
      const scoresOf = star => { if (!cache.has(star)) cache.set(star, universe.model.scores('white', star)); return cache.get(star); };
      return {
        kind, id, label: 'Tonight\'s bearing', result, choices,
        note: `Where your ${choices.length} choices point: toward ${bearingNames(choices)}, and away from the films passed over`,
        stars: new Set(result.stars), colour: BEARING, light: 'white', strength: result.strength,
        rows: new Map(result.stars.map(star => [star, bearingReason(reasonOf(universe, star, choices, scoresOf))])),
      };
    }
    if (kind === 'kind') {
      // A kind of film in Lookback: one galaxy of white light, followed back through every decade.
      const galaxy = (universe.galaxies.white || [])[id];
      const A = universe.armOf[TIME];
      if (!galaxy || !A) return null;
      const stars = new Set();
      for (let i = 0; i < universe.count; i += 1) if (A[i] === id) stars.add(i);
      return {
        kind, id, label: `${galaxy.name}, through time`,
        note: `${plural(stars.size, 'film')} of ${galaxy.name}, the oldest at the edge of the sky and the newest near the present`,
        stars, colour: GALAXY_HUES[id % GALAXY_HUES.length], light: 'white', sky: TIME,
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
      if (state.sky === TIME) {
        return {
          kind, id, arm, label: record ? `${record.name} ${when(galaxy)}` : galaxy.name,
          note: record ? `${plural(record.size, 'film')} of ${record.name} made ${when(galaxy)}` : galaxy.thesis,
          stars, colour: light.color, light: 'white', sky: TIME,
        };
      }
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
  // A kind of film named at the horizon of Lookback: every film of that kind, lit from the present to the silent years.
  const showKind = g => show(setOf('kind', g), { frame: false });
  /** "Like this, but gentler": a star bent along one of its readings, lit and listed. */
  const bendTo = (star, temper, direction) => browse('bend', `${star}:${temper}:${direction}`);
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
      for (let i = 0; i < universe.base; i += 1) if (films[i].rn >= 3 && G[i] !== UNLIT && !marks.hidden.has(i) && !haze.has(i)) lit.push(i);
      star = lit[Math.floor(Math.random() * lit.length)] ?? 0;
      focusStar(star, { quiet: true, drifting: true });
    } else {
      const next = driftNext(universe, star, new Set([...marks.visited, ...marks.hidden, ...haze]), likeness());
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
      place = arm ? (galaxy.ring ? `${arm.name} ${when(galaxy)}` : arm.name) : galaxy ? galaxy.name : '';
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
    else if (place.startsWith('sky')) found.sky = decodeSky(place);
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
      drawEpochs();
      refresh('sky');
    }
    if (address.sky) {
      // A sky someone sent: taken in once, and the address put back to where the voyager is.
      const taken = receiveSky(address.sky);
      written = '';
      try { window.history.replaceState({ odyssey: depthNow }, '', window.location.pathname + window.location.search); } catch { /* a sandboxed frame may refuse */ }
      if (taken) return true;
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
    setCurrent, showTrait, showRegister, showConstellation, showKind, bendTo, browse, setOf, widen,
    lookDeeper, chartFilm, beginVoyage, endVoyage, voyageTo, plotPassage,
    setOut, takeDoor, stepBack, land, endJourney, showKeptRoute, homeOf, openDoors,
    startDrift, stopDrift, checkConstellations, followAddress, back, share, hintOf,
    tonight, catchComet, showComet, cometReason, setSeeing, outsideSeeing,
    takeBearing, chooseBearing, skipBearing, undoBearing, taking: () => taking, bearingTaken: () => Boolean(keptBearing()),
    theirStars, theirName, addTheirs, dropTheirs, nameTheirs, setTheirs, bothSkies, sideOf, receiveSky, sendSky,
    throughWormhole,
    colours: { yours: YOURS, theirs: THEIRS, together: TOGETHER, bearing: BEARING, wormhole: WORMHOLE },
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
  cosmos.setHaze(haze);
  labels.setContext({ haze: haze.size ? haze : null });
  syncMarks();
  checkConstellations();
  state.restoring = false;
  tonight(); // tonight's comet, chosen (or found again) before anything is shown
  drawWake();
  root.style.setProperty('--light', lightById(state.sky).color);
  frameCosmos();
  drawEpochs();
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
      else if (state.current && !(state.current.auto && state.galaxy >= 0)) setCurrent(null);
      else if (state.focus >= 0 || state.galaxy >= 0) blur();
      return;
    }
    if (typing || !state.entered) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key; // Caps Lock or Shift change nothing
    if (key === '/') { event.preventDefault(); app.searchView.open(); }
    else if (/^[0-7]$/.test(key)) setSky(ALL_LIGHTS[Number(key)].id);
    else if (key === 'h' || key === 'Home') goHome();
    else if (key === 'd') { if (state.drift) stopDrift(); else startDrift(); }
    else if (key === 'c') catchComet();
    else if (key === 'j' && state.holes.length) throughWormhole(0);
    else if (key === 'b') takeBearing();
    else if (key === 't') app.panels.toggle('together');
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
