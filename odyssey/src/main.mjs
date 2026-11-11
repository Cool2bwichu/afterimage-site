// AFTERIMAGE, the Odyssey. The chart is a file; the sky is drawn from it; the
// Navigator is found at run time. This file only puts the pieces together.
import { openUniverse } from './engine/universe.mjs';
import { createSearch } from './engine/search.mjs';
import { createCosmos } from './cosmos/renderer.mjs';
import { createLabels } from './cosmos/labels.mjs';
import { createStore } from './ui/store.mjs';
import { configurePosters } from './ui/posters.mjs';
import { createPilot } from './nav/pilot.mjs';
import { createApp, OVERVIEW } from './ui/app.mjs';

const root = document.getElementById('odyssey');
const veil = document.getElementById('veil');
const config = window.ODYSSEY || {};
const dataUrl = name => `${config.data || './data/'}${name}`;

function say(text, detail = '') {
  if (!veil) return;
  veil.querySelector('.veil-line').textContent = text;
  veil.querySelector('.veil-detail').textContent = detail;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

async function boot() {
  const small = window.matchMedia('(max-width: 720px)').matches;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const [bundle, posters] = await Promise.all([
    fetchJson(dataUrl('universe.json')),
    config.posters ? fetchJson(config.posters).catch(() => null) : null,
  ]);
  if (posters) {
    const base = config.posterBase || './';
    const tiers = Object.fromEntries(Object.entries(posters.tiers).map(([name, tier]) => [name, { ...tier, files: tier.files.map(file => `${base}${file}`) }]));
    configurePosters({ sheets: { tiers, index: posters.index } });
  }

  const universe = openUniverse(bundle);
  const search = createSearch(universe);
  const store = createStore();

  let cosmos;
  try {
    cosmos = createCosmos({ canvas: document.getElementById('cosmos'), universe, reducedMotion, small });
  } catch (error) {
    say('This browser cannot draw the universe.', 'The Odyssey needs WebGL2, which every current browser has. Try another browser, or turn hardware acceleration on.');
    return;
  }
  const overviewDistance = cosmos.reachOf('white') * (small ? OVERVIEW.reachSmall : OVERVIEW.reach);
  cosmos.camera.jumpTo({ target: [0, -30, 0], distance: overviewDistance * 1.25, yaw: 0.5, pitch: OVERVIEW.pitch, bias: OVERVIEW.bias });

  // The deeper notes on each film are only read by the Navigator; they follow later.
  const depth = [];
  fetchJson(dataUrl('depth.json')).then(file => { for (const film of file.films || []) depth.push(film); }).catch(() => {});

  let app = null;
  const pilot = createPilot({ universe, depth, search, store, onStatus: () => app?.refresh('navigator') });
  const labels = createLabels({
    root: document.getElementById('labels'), cosmos, universe, small,
    onStar: star => app?.focusStar(star),
    onGalaxy: g => app?.openGalaxy(g),
    onArm: (g, arm) => app?.openGalaxy(g, arm),
  });
  app = createApp({ root, universe, depth, cosmos, labels, pilot, store, search, small, reducedMotion });
  window.__odyssey = { app, universe, cosmos, pilot, store };

  // Set out: straight to the star the address names, or by way of the threshold.
  const named = /^#(star|galaxy)-/.test(window.location.hash);
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
  say('The chart could not be opened.', 'Reload the page to try again.');
});
