// AFTERIMAGE, the Odyssey. The chart is a file; the sky is drawn from it; the
// Navigator is found at run time. This file only puts the pieces together.
import { openUniverse } from './engine/universe.mjs';
import { createSearch } from './engine/search.mjs';
import { createCosmos } from './cosmos/renderer.mjs';
import { createLabels } from './cosmos/labels.mjs';
import { createStore } from './ui/store.mjs';
import { configurePosters, postersFound } from './ui/posters.mjs';
import { createPilot } from './nav/pilot.mjs';
import { createReadings } from './nav/readings.mjs';
import { createApp, OVERVIEW } from './ui/app.mjs';

/* global __CHART_BYTES__ */
const root = document.getElementById('odyssey');
const veil = document.getElementById('veil');
const config = window.ODYSSEY || {};
// A build may name each file outright (the claude.ai edition names them for their contents).
const dataUrl = name => config[name] || `${config.data || './data/'}${name}.json`;
// How big the chart is, as the build measured it: the veil shows how much of it has come.
const CHART_BYTES = config.chartBytes || (typeof __CHART_BYTES__ === 'number' ? __CHART_BYTES__ : 0);

function say(text, detail = '', retry = false) {
  if (!veil) return;
  veil.querySelector('.veil-line').textContent = text;
  veil.querySelector('.veil-detail').textContent = detail;
  veil.querySelector('.veil-bar')?.classList.remove('on');
  if (retry && !veil.querySelector('.veil-retry')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'veil-retry';
    button.textContent = 'Try again';
    button.addEventListener('click', () => window.location.reload());
    veil.append(button);
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

/** The chart, read as it arrives, so a slow connection shows how far along it is. */
async function fetchChart(url) {
  const started = performance.now();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const plain = !response.headers.get('content-encoding');
  const expected = CHART_BYTES || (plain ? Number(response.headers.get('content-length')) || 0 : 0);
  const bar = veil?.querySelector('.veil-bar');
  if (!response.body || !expected || !bar) return response.json();
  const fill = bar.firstElementChild;
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    // Only a wait long enough to notice is given a bar.
    if (performance.now() - started > 450) bar.classList.add('on');
    fill.style.width = `${Math.min(100, (received / expected) * 100).toFixed(1)}%`;
  }
  const bytes = new Uint8Array(received);
  let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function boot() {
  const small = window.matchMedia('(max-width: 720px)').matches;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const [bundle, posters] = await Promise.all([
    fetchChart(dataUrl('universe')),
    config.posters ? fetchJson(config.posters).catch(() => null) : null,
  ]);
  // Inside claude.ai a page can show only what was published with it.
  if (config.edition === 'claude') configurePosters({ outside: false });
  if (posters) {
    const base = config.posterBase || './';
    const tiers = Object.fromEntries(Object.entries(posters.tiers).map(([name, tier]) => [name, { ...tier, files: tier.files.map(file => (file ? `${base}${file}` : null)) }]));
    configurePosters({ sheets: { tiers, index: posters.index } });
  }

  const universe = openUniverse(bundle);
  const search = createSearch(universe);
  const store = createStore();

  let cosmos;
  try {
    cosmos = createCosmos({ canvas: document.getElementById('cosmos'), universe, reducedMotion, small });
  } catch {
    say('This browser cannot draw the universe.', 'The Odyssey needs WebGL2, which every current browser has. Try another browser, or turn hardware acceleration on.');
    return;
  }
  const overviewDistance = cosmos.reachOf('white') * (small ? OVERVIEW.reachSmall : OVERVIEW.reach);
  cosmos.camera.jumpTo({ target: [0, -30, 0], distance: overviewDistance * 1.25, yaw: 0.5, pitch: OVERVIEW.pitch, bias: OVERVIEW.bias });

  // The deeper notes on each film are read only by a Navigator inside this page (a companion keeps
  // its own copy), so they are fetched the first time one comes aboard, and never for anyone else.
  const depth = [];
  let deepening = false;
  const deepen = () => {
    if (deepening) return;
    deepening = true;
    fetchJson(dataUrl('depth')).then(file => { for (const film of file.films || []) depth.push(film); }).catch(() => { deepening = false; });
  };

  // What the Navigator wrote of each star before anyone arrived (scripts/pre-read.mjs), fetched a shard at a time.
  const readings = config.readings === false ? null : createReadings({ url: config.readings || `${config.data || './data/'}readings/index.json` });
  readings?.open(); // the index is small, and the Navigator's panel tells of it
  let app = null;
  const pilot = createPilot({
    universe, depth, search, store, readings, edition: config.edition || 'site',
    onStatus: status => {
      if (status?.mode === 'inpage') deepen();
      app?.refresh('navigator');
    },
    // A catalogue has answered for stars already in the sky: their plates take the posters, and their dossiers the rest.
    onFacts: films => { postersFound(films); app?.refresh('facts'); },
  });
  const labels = createLabels({
    root: document.getElementById('labels'), cosmos, universe, small,
    onStar: star => app?.focusStar(star),
    onGalaxy: g => app?.openGalaxy(g),
    onArm: (g, arm) => app?.openGalaxy(g, arm),
  });
  app = createApp({ root, universe, depth, cosmos, labels, pilot, store, search, small, reducedMotion, edition: config.edition || 'site' });
  window.__odyssey = { app, universe, cosmos, pilot, store };

  // Set out: straight to the star, galaxy or voyage the address names, or by way of the threshold.
  const named = /^#(star|galaxy|voyage)-/.test(window.location.hash);
  if (named) {
    app.entrance.skip();
    if (!app.followAddress({ instant: true })) app.entrance.show();
  } else {
    app.followAddress({ instant: true }); // an address may name a light alone
    app.entrance.show();
    cosmos.camera.flyTo({ distance: overviewDistance, duration: 3.2 });
  }

  veil?.classList.add('gone');
  setTimeout(() => veil?.remove(), 900);
  pilot.find();
}

boot().catch(error => {
  console.error(error);
  say('The chart could not be opened.', 'The connection may have dropped while it loaded.', true);
});
