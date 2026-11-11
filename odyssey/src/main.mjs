import { openUniverse } from './engine/universe.mjs';
import { createCosmos } from './cosmos/renderer.mjs';
import { attachControls } from './cosmos/camera.mjs';

const bundle = await (await fetch('./data/universe.json')).json();
const universe = openUniverse(bundle);
const canvas = document.getElementById('cosmos');
const cosmos = createCosmos({ canvas, universe });
attachControls(canvas, cosmos.camera, {});
window.__odyssey = { universe, cosmos };
