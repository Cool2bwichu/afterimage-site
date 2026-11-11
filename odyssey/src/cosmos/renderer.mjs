// The cosmos: every film a star, drawn in WebGL2. The renderer knows nothing
// about films except where they are, how bright, and what colour. It keeps the
// current position of every star (they move when the light changes), so
// labels, posters and picking can ask where a star is on screen right now.
import { SKIES, UNLIT } from '../engine/universe.mjs';
import { lightById } from '../engine/lights.mjs';
import { mulberry32, hashString, gaussian } from '../engine/rng.mjs';
import { createCamera, FOV } from './camera.mjs';
import { clamp, lerp, easeInOut, angleDelta, hexToRgb, multiply } from './math.mjs';
import * as S from './shaders.mjs';

const DUST_PER_STAR = 10;
const HEADROOM = 3072; // room for stars charted later before buffers are rebuilt
const MAX_LINES = 640;
const LINE_FLOATS = 14;
const GLOW_FLOATS = 15;

// What the dark is made of under each light: two nebula tints and the black itself.
const SKY_TINTS = {
  white: { a: '#2c4c74', b: '#86583a', base: '#05080e' },
  story: { a: '#8c5a20', b: '#6e2a2c', base: '#080604' },
  feeling: { a: '#8c3452', b: '#463678', base: '#080509' },
  image: { a: '#1c6c86', b: '#27478a', base: '#03070b' },
  idea: { a: '#553c98', b: '#27468a', base: '#06050c' },
  world: { a: '#2a7850', b: '#1c5a6c', base: '#030806' },
  hands: { a: '#304c98', b: '#553a88', base: '#04060c' },
};

// Each galaxy of the white sky takes one of these; a coloured sky varies its own hue.
const GALAXY_HUES = ['#f2b066', '#79d3ea', '#f08aa0', '#bda0f7', '#8fdcaa', '#8aa8f5', '#dec6a0', '#e9967a', '#9cbbb9', '#d7a6e8', '#a8c686', '#7fb7f0', '#f0c987', '#c9a0a0'];

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader failed to compile: ${log}`);
  }
  return shader;
}

function program(gl, vertex, fragment) {
  const handle = gl.createProgram();
  gl.attachShader(handle, compile(gl, gl.VERTEX_SHADER, vertex));
  gl.attachShader(handle, compile(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(handle);
  if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) throw new Error(`Program failed to link: ${gl.getProgramInfoLog(handle)}`);
  const uniforms = {};
  const count = gl.getProgramParameter(handle, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i += 1) {
    const info = gl.getActiveUniform(handle, i);
    uniforms[info.name] = gl.getUniformLocation(handle, info.name);
  }
  return { handle, uniforms };
}

function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

/** A film's own colour, lifted until it can be a star. */
export function starColour(hex) {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  return hslToRgb(h, clamp(s * 1.05, 0.18, 0.8), clamp(l, 0.66, 0.82));
}

function galaxyColour(sky, g) {
  if (sky === 'white') return hexToRgb(GALAXY_HUES[g % GALAXY_HUES.length]);
  const [r, gg, b] = hexToRgb(lightById(sky).color);
  const [h, s, l] = rgbToHsl(r, gg, b);
  const shift = (((g * 37) % 9) - 4) / 9 * 0.085;
  return hslToRgb((h + shift + 1) % 1, clamp(s * (0.8 + ((g * 13) % 5) * 0.06), 0, 1), clamp(l + (((g * 7) % 5) - 2) * 0.025, 0.4, 0.85));
}

export function createCosmos({ canvas, universe, reducedMotion = false, small = false }) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('This browser cannot draw the universe (WebGL2 is unavailable).');

  const camera = createCamera({ reducedMotion });
  const programs = {
    sky: program(gl, S.SKY_VS, S.SKY_FS),
    far: program(gl, S.FAR_VS, S.FAR_FS),
    glow: program(gl, S.GLOW_VS, S.GLOW_FS),
    dust: program(gl, S.DUST_VS, S.DUST_FS),
    star: program(gl, S.STAR_VS, S.STAR_FS),
    line: program(gl, S.LINE_VS, S.LINE_FS),
  };
  const maxPoint = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1];

  // ── Shared quads.
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const strip = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, strip);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), gl.STATIC_DRAW);

  const attribute = (location, buffer, size, type, normalised, stride, offset, divisor = 0) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, type, normalised, stride, offset);
    gl.vertexAttribDivisor(location, divisor);
  };

  // ── The sky cube, baked once.
  const skyTexture = gl.createTexture();
  {
    const size = small ? 256 : 512;
    const bake = program(gl, S.SKY_BAKE_VS, S.SKY_BAKE_FS);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    attribute(0, quad, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, skyTexture);
    const faces = [
      [gl.TEXTURE_CUBE_MAP_POSITIVE_X, [0, 0, -1, 0, -1, 0, 1, 0, 0]],
      [gl.TEXTURE_CUBE_MAP_NEGATIVE_X, [0, 0, 1, 0, -1, 0, -1, 0, 0]],
      [gl.TEXTURE_CUBE_MAP_POSITIVE_Y, [1, 0, 0, 0, 0, 1, 0, 1, 0]],
      [gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, [1, 0, 0, 0, 0, -1, 0, -1, 0]],
      [gl.TEXTURE_CUBE_MAP_POSITIVE_Z, [1, 0, 0, 0, -1, 0, 0, 0, 1]],
      [gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, [-1, 0, 0, 0, -1, 0, 0, 0, -1]],
    ];
    for (const [target] of faces) gl.texImage2D(target, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.viewport(0, 0, size, size);
    gl.disable(gl.BLEND);
    gl.useProgram(bake.handle);
    for (const [target, face] of faces) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, target, skyTexture, 0);
      gl.uniformMatrix3fv(bake.uniforms.uFace, false, new Float32Array(face));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(framebuffer);
    gl.deleteProgram(bake.handle);
    gl.deleteVertexArray(vao);
  }
  const skyVao = gl.createVertexArray();
  gl.bindVertexArray(skyVao);
  attribute(0, quad, 2, gl.FLOAT, false, 0, 0);

  // ── The far field.
  const FAR_COUNT = small ? 2600 : 5200;
  const farVao = gl.createVertexArray();
  {
    const random = mulberry32(90210);
    const data = new Float32Array(FAR_COUNT * 7);
    const band = [0.22, 0.93, 0.3];
    const bandLength = Math.hypot(...band);
    const tints = [[0.78, 0.86, 1], [1, 0.97, 0.92], [1, 0.86, 0.72], [0.86, 0.92, 1], [1, 1, 1]];
    for (let i = 0; i < FAR_COUNT; i += 1) {
      let x; let y; let z; let keep;
      do {
        const u = random() * 2 - 1;
        const phi = random() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        x = s * Math.cos(phi); y = u; z = s * Math.sin(phi);
        const off = (x * band[0] + y * band[1] + z * band[2]) / bandLength;
        keep = 0.3 + 0.7 * Math.exp(-((off / 0.4) ** 2));
      } while (random() > keep);
      const tint = tints[Math.floor(random() * tints.length)];
      data.set([x, y, z, random() ** 3.2, tint[0], tint[1], tint[2]], i * 7);
    }
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.bindVertexArray(farVao);
    attribute(0, buffer, 4, gl.FLOAT, false, 28, 0);
    attribute(1, buffer, 3, gl.FLOAT, false, 28, 16);
  }

  // ── Stars and their dust. Arrays are sized with headroom and rebuilt when outgrown.
  let capacity = 0;
  let count = 0;
  let cur; let from; let to; let polar; let delay;
  let colour; let data; let glowGoal;
  let dustOffset; let dustPos; let dustColour; let dustSize;
  const buffers = { pos: gl.createBuffer(), colour: gl.createBuffer(), data: gl.createBuffer(), dustPos: gl.createBuffer(), dustColour: gl.createBuffer(), dustSize: gl.createBuffer() };
  const starVao = gl.createVertexArray();
  const dustVao = gl.createVertexArray();

  let sky = 'white';
  let transition = null;
  let positionsDirty = true;
  let dataDirty = true;
  let glowEasing = false;

  // What lights a star up beyond its own renown.
  let focus = -1;
  let hover = -1;
  let highlight = null; // Set<number> | null
  let rayEnds = new Set();
  const marks = { loved: new Set(), visited: new Set() };
  let dim = 0;
  let dimGoal = 0;

  function allocate(needed) {
    const next = needed + HEADROOM;
    const grow = (old, length, Type) => { const array = new Type(length); if (old) array.set(old.subarray(0, Math.min(old.length, length))); return array; };
    cur = grow(cur, next * 3, Float32Array);
    from = grow(from, next * 3, Float32Array);
    to = grow(to, next * 3, Float32Array);
    polar = new Float32Array(next * 4);
    delay = grow(delay, next, Float32Array);
    colour = grow(colour, next * 4, Uint8Array);
    data = grow(data, next * 4, Float32Array);
    glowGoal = grow(glowGoal, next, Float32Array);
    dustOffset = grow(dustOffset, next * DUST_PER_STAR * 3, Float32Array);
    dustPos = grow(dustPos, next * DUST_PER_STAR * 3, Float32Array);
    dustColour = grow(dustColour, next * DUST_PER_STAR * 4, Uint8Array);
    dustSize = grow(dustSize, next * DUST_PER_STAR, Float32Array);
    capacity = next;

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.pos); gl.bufferData(gl.ARRAY_BUFFER, cur.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.colour); gl.bufferData(gl.ARRAY_BUFFER, colour.byteLength, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.data); gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.dustPos); gl.bufferData(gl.ARRAY_BUFFER, dustPos.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.dustColour); gl.bufferData(gl.ARRAY_BUFFER, dustColour.byteLength, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.dustSize); gl.bufferData(gl.ARRAY_BUFFER, dustSize.byteLength, gl.STATIC_DRAW);

    gl.bindVertexArray(starVao);
    attribute(0, quad, 2, gl.FLOAT, false, 0, 0);
    attribute(1, buffers.pos, 3, gl.FLOAT, false, 0, 0, 1);
    attribute(2, buffers.colour, 4, gl.UNSIGNED_BYTE, true, 0, 0, 1);
    attribute(3, buffers.data, 4, gl.FLOAT, false, 0, 0, 1);
    gl.bindVertexArray(dustVao);
    attribute(0, buffers.dustPos, 3, gl.FLOAT, false, 0, 0);
    attribute(1, buffers.dustColour, 4, gl.UNSIGNED_BYTE, true, 0, 0);
    attribute(2, buffers.dustSize, 1, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  /** Fills in everything about stars [start, end) that does not change from frame to frame. */
  function describe(start, end) {
    for (let i = start; i < end; i += 1) {
      const film = universe.films[i];
      const random = mulberry32(hashString(film.s || `star-${i}`));
      const rgb = starColour(film.hi);
      const renown = clamp((film.rn ?? 1) / 4, 0, 1);
      colour[i * 4] = Math.round(rgb[0] * 255);
      colour[i * 4 + 1] = Math.round(rgb[1] * 255);
      colour[i * 4 + 2] = Math.round(rgb[2] * 255);
      colour[i * 4 + 3] = Math.round(renown * 255);
      data[i * 4] = 3.3 + renown * 5.6;
      data[i * 4 + 1] = random();
      data[i * 4 + 2] = universe.isDeep(i) ? 4 : 0;
      data[i * 4 + 3] = 0;
      for (let d = 0; d < DUST_PER_STAR; d += 1) {
        const at = i * DUST_PER_STAR + d;
        const reach = 9 + random() * 16;
        dustOffset[at * 3] = gaussian(random) * reach;
        dustOffset[at * 3 + 1] = gaussian(random) * reach * 0.36;
        dustOffset[at * 3 + 2] = gaussian(random) * reach;
        const soft = 0.55 + random() * 0.45;
        dustColour[at * 4] = Math.round(lerp(rgb[0], 1, 0.15) * 255 * soft);
        dustColour[at * 4 + 1] = Math.round(lerp(rgb[1], 1, 0.15) * 255 * soft);
        dustColour[at * 4 + 2] = Math.round(lerp(rgb[2], 1, 0.15) * 255 * soft);
        dustColour[at * 4 + 3] = Math.round((0.13 + random() * 0.2) * 255);
        dustSize[at] = 1.1 + random() * random() * 3.6;
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.colour); gl.bufferSubData(gl.ARRAY_BUFFER, 0, colour, 0, end * 4);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.dustColour); gl.bufferSubData(gl.ARRAY_BUFFER, 0, dustColour, 0, end * DUST_PER_STAR * 4);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.dustSize); gl.bufferSubData(gl.ARRAY_BUFFER, 0, dustSize, 0, end * DUST_PER_STAR);
    dataDirty = true;
  }

  function syncDust() {
    for (let i = 0; i < count; i += 1) {
      const x = cur[i * 3]; const y = cur[i * 3 + 1]; const z = cur[i * 3 + 2];
      for (let d = 0; d < DUST_PER_STAR; d += 1) {
        const at = (i * DUST_PER_STAR + d) * 3;
        dustPos[at] = x + dustOffset[at];
        dustPos[at + 1] = y + dustOffset[at + 1];
        dustPos[at + 2] = z + dustOffset[at + 2];
      }
    }
  }

  // ── The glow of the galaxies.
  const glowVao = gl.createVertexArray();
  const glowBuffer = gl.createBuffer();
  let glowCount = 0;
  let glowFade = [0, 1];
  {
    gl.bindVertexArray(glowVao);
    attribute(0, quad, 2, gl.FLOAT, false, 0, 0);
    const stride = GLOW_FLOATS * 4;
    attribute(1, glowBuffer, 3, gl.FLOAT, false, stride, 0, 1);
    attribute(2, glowBuffer, 3, gl.FLOAT, false, stride, 12, 1);
    attribute(3, glowBuffer, 3, gl.FLOAT, false, stride, 24, 1);
    attribute(4, glowBuffer, 4, gl.FLOAT, false, stride, 36, 1);
    attribute(5, glowBuffer, 2, gl.FLOAT, false, stride, 52, 1);
  }

  function glowsOf(skyId, set, out) {
    for (const galaxy of universe.galaxies[skyId] || []) {
      const rgb = galaxyColour(skyId, galaxy.g);
      const n = galaxy.normal;
      // Two directions lying in the galaxy's plane.
      let ux = n[1]; let uy = -n[0]; let uz = 0;
      let length = Math.hypot(ux, uy, uz);
      if (length < 0.001) { ux = 1; uy = 0; uz = 0; length = 1; }
      ux /= length; uy /= length; uz /= length;
      const vx = n[1] * uz - n[2] * uy;
      const vy = n[2] * ux - n[0] * uz;
      const vz = n[0] * uy - n[1] * ux;
      const disc = galaxy.radius * 1.55;
      out.push(...galaxy.centre, ux * disc, uy * disc, uz * disc, vx * disc, vy * disc, vz * disc, ...rgb, 0.19, 0, set);
      const core = galaxy.radius * 0.5;
      out.push(...galaxy.centre, core, 0, 0, 0, core, 0, ...rgb.map(c => lerp(c, 1, 0.35)), 0.3, 1, set);
      for (const arm of galaxy.arms || []) {
        const reach = galaxy.radius * 0.42;
        out.push(...arm.at, reach, 0, 0, 0, reach, 0, ...rgb, 0.085, 1, set);
      }
    }
  }

  function rebuildGlows(leaving) {
    const list = [];
    if (leaving) glowsOf(leaving, 0, list);
    glowsOf(sky, 1, list);
    glowCount = list.length / GLOW_FLOATS;
    gl.bindBuffer(gl.ARRAY_BUFFER, glowBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(list), gl.DYNAMIC_DRAW);
  }

  // ── Lines of light.
  const lineVao = gl.createVertexArray();
  const lineBuffer = gl.createBuffer();
  const lineData = new Float32Array(MAX_LINES * LINE_FLOATS);
  const lineGroups = new Map();
  let lineCount = 0;
  {
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, lineData.byteLength, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(lineVao);
    attribute(0, strip, 2, gl.FLOAT, false, 0, 0);
    const stride = LINE_FLOATS * 4;
    attribute(1, lineBuffer, 3, gl.FLOAT, false, stride, 0, 1);
    attribute(2, lineBuffer, 3, gl.FLOAT, false, stride, 12, 1);
    attribute(3, lineBuffer, 4, gl.FLOAT, false, stride, 24, 1);
    attribute(4, lineBuffer, 4, gl.FLOAT, false, stride, 40, 1);
    gl.bindVertexArray(null);
  }

  const point = (ref, out, at) => {
    if (typeof ref === 'number') {
      out[at] = cur[ref * 3]; out[at + 1] = cur[ref * 3 + 1]; out[at + 2] = cur[ref * 3 + 2];
    } else { out[at] = ref[0]; out[at + 1] = ref[1]; out[at + 2] = ref[2]; }
  };

  function syncLines(now) {
    let n = 0;
    for (const lines of lineGroups.values()) {
      for (const line of lines) {
        if (n >= MAX_LINES) break;
        if (typeof line.a === 'number' && line.a >= count) continue;
        if (typeof line.b === 'number' && line.b >= count) continue;
        const at = n * LINE_FLOATS;
        point(line.a, lineData, at);
        point(line.b, lineData, at + 3);
        lineData[at + 6] = line.colour[0]; lineData[at + 7] = line.colour[1]; lineData[at + 8] = line.colour[2];
        lineData[at + 9] = line.colour[3] ?? 1;
        lineData[at + 10] = line.width ?? 2.2;
        lineData[at + 11] = line.style ?? 0;
        lineData[at + 12] = line.phase ?? 0;
        lineData[at + 13] = reducedMotion ? 1 : clamp((now - line.born - (line.wait || 0)) / (line.grow || 0.9), 0, 1);
        n += 1;
      }
    }
    lineCount = n;
    if (n) {
      gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, lineData, 0, n * LINE_FLOATS);
    }
  }

  // ── Sky tints, eased between lights.
  const tint = { a: hexToRgb(SKY_TINTS.white.a), b: hexToRgb(SKY_TINTS.white.b), base: hexToRgb(SKY_TINTS.white.base), star: [1, 1, 1], mix: 0 };
  const tintGoal = { a: [...tint.a], b: [...tint.b], base: [...tint.base], star: [1, 1, 1], mix: 0 };
  function aimTints(skyId) {
    const tones = SKY_TINTS[skyId] || SKY_TINTS.white;
    hexToRgb(tones.a, tintGoal.a);
    hexToRgb(tones.b, tintGoal.b);
    hexToRgb(tones.base, tintGoal.base);
    hexToRgb(lightById(skyId).color, tintGoal.star);
    tintGoal.mix = skyId === 'white' ? 0 : 0.2;
  }

  // ── Growth and layout.
  function adopt(start) {
    const target = universe.positions[sky];
    for (let i = start; i < count; i += 1) {
      for (let k = 0; k < 3; k += 1) {
        cur[i * 3 + k] = target[i * 3 + k];
        to[i * 3 + k] = target[i * 3 + k];
        from[i * 3 + k] = target[i * 3 + k];
      }
    }
    positionsDirty = true;
  }

  function sync() {
    const next = universe.count;
    if (next > capacity) allocate(next);
    const start = count;
    count = next;
    if (start === 0 || next > start) {
      describe(start, next);
      adopt(start);
      if (start > 0) {
        // A star charted just now flares as it appears.
        for (let i = start; i < next; i += 1) data[i * 4 + 3] = 3.2;
        glowEasing = true;
      }
      refreshGlowGoals();
    }
  }

  function refreshGlowGoals() {
    for (let i = 0; i < count; i += 1) {
      let value = 0;
      if (highlight) value = highlight.has(i) ? 1 : 0;
      if (rayEnds.has(i)) value = Math.max(value, 1.25);
      if (i === hover) value = Math.max(value, 1.1) + 0.35;
      if (i === focus) value = 2;
      glowGoal[i] = value;
      const mark = (marks.loved.has(i) ? 1 : 0) + (marks.visited.has(i) ? 2 : 0) + (universe.isDeep(i) ? 4 : 0);
      if (data[i * 4 + 2] !== mark) { data[i * 4 + 2] = mark; dataDirty = true; }
    }
    dimGoal = highlight ? 0.74 : 0;
    glowEasing = true;
  }

  function setSky(next, { immediate = false, around = null } = {}) {
    if (!SKIES.includes(next) || next === sky) return;
    const leaving = sky;
    sky = next;
    aimTints(next);
    const target = universe.positions[next];
    from.set(cur.subarray(0, count * 3));
    to.set(target.subarray(0, count * 3));
    if (immediate || reducedMotion) {
      cur.set(to.subarray(0, count * 3));
      transition = null;
      positionsDirty = true;
      rebuildGlows(null);
      glowFade = [0, 1];
      return;
    }
    const centre = around || [0, 0, 0];
    const random = mulberry32(hashString(`${leaving}>${next}`));
    for (let i = 0; i < count; i += 1) {
      const x0 = from[i * 3]; const z0 = from[i * 3 + 2];
      const x1 = to[i * 3]; const z1 = to[i * 3 + 2];
      const a0 = Math.atan2(z0, x0);
      polar[i * 4] = Math.hypot(x0, z0);
      polar[i * 4 + 1] = a0;
      polar[i * 4 + 2] = Math.hypot(x1, z1);
      polar[i * 4 + 3] = angleDelta(a0, Math.atan2(z1, x1));
      const reach = Math.hypot(x0 - centre[0], z0 - centre[2]);
      delay[i] = clamp(reach / 3200, 0, 1) * 0.26 + random() * 0.07;
    }
    transition = { elapsed: 0, duration: 2.7 };
    rebuildGlows(leaving);
    glowFade = [1, 0];
  }

  function stepTransition(dt) {
    if (!transition) return;
    transition.elapsed += dt;
    const t = clamp(transition.elapsed / transition.duration, 0, 1);
    const span = 1 - 0.33;
    for (let i = 0; i < count; i += 1) {
      const e = easeInOut(clamp((t - delay[i]) / span, 0, 1));
      const radius = lerp(polar[i * 4], polar[i * 4 + 2], e);
      const angle = polar[i * 4 + 1] + polar[i * 4 + 3] * e;
      cur[i * 3] = Math.cos(angle) * radius;
      cur[i * 3 + 1] = lerp(from[i * 3 + 1], to[i * 3 + 1], e);
      cur[i * 3 + 2] = Math.sin(angle) * radius;
    }
    glowFade = [1 - easeInOut(clamp(t * 1.7, 0, 1)), easeInOut(clamp(t * 1.5 - 0.4, 0, 1))];
    positionsDirty = true;
    if (t >= 1) {
      cur.set(to.subarray(0, count * 3));
      transition = null;
      glowFade = [0, 1];
      rebuildGlows(null);
      for (const listener of settled) listener(sky);
    }
  }

  // ── The frame.
  let width = 1;
  let height = 1;
  let dpr = 1;
  let last = 0;
  let clock = 0;
  let running = true;
  let view = null;
  const frameListeners = new Set();
  const settled = new Set();
  const rotProj = new Float32Array(16);
  const rotation = new Float32Array(16);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, small ? 1.75 : 2);
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    const w = Math.round(width * dpr);
    const h = Math.round(height * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    camera.resize(width, height);
  }

  function draw(now) {
    if (!running) return;
    const seconds = now / 1000;
    const dt = Math.min(0.05, last ? seconds - last : 0.016);
    last = seconds;
    clock += dt;

    camera.update(dt);
    stepTransition(dt);
    if (transition && camera.following) camera.update(0);

    const ease = 1 - Math.exp(-dt * 2.4);
    for (let k = 0; k < 3; k += 1) {
      tint.a[k] = lerp(tint.a[k], tintGoal.a[k], ease);
      tint.b[k] = lerp(tint.b[k], tintGoal.b[k], ease);
      tint.base[k] = lerp(tint.base[k], tintGoal.base[k], ease);
      tint.star[k] = lerp(tint.star[k], tintGoal.star[k], ease);
    }
    tint.mix = lerp(tint.mix, tintGoal.mix, ease);
    dim = lerp(dim, dimGoal, 1 - Math.exp(-dt * 5));

    if (glowEasing) {
      const k = 1 - Math.exp(-dt * 7);
      let moving = false;
      for (let i = 0; i < count; i += 1) {
        const present = data[i * 4 + 3];
        const goal = glowGoal[i];
        if (present === goal) continue;
        const next = Math.abs(goal - present) < 0.004 ? goal : lerp(present, goal, k);
        data[i * 4 + 3] = next;
        if (next !== goal) moving = true;
      }
      glowEasing = moving;
      dataDirty = true;
    }

    if (positionsDirty) {
      syncDust();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.pos); gl.bufferSubData(gl.ARRAY_BUFFER, 0, cur, 0, count * 3);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.dustPos); gl.bufferSubData(gl.ARRAY_BUFFER, 0, dustPos, 0, count * DUST_PER_STAR * 3);
      positionsDirty = false;
    }
    if (dataDirty) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers.data); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, count * 4);
      dataDirty = false;
    }
    syncLines(clock);

    view = camera.frame();
    const { viewProj, basis, focal } = view;
    gl.viewport(0, 0, canvas.width, canvas.height);

    // The sky.
    gl.disable(gl.BLEND);
    gl.useProgram(programs.sky.handle);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, skyTexture);
    const tanY = Math.tan(FOV / 2);
    let u = programs.sky.uniforms;
    gl.uniform1i(u.uSky, 0);
    gl.uniform3fv(u.uRight, basis.right);
    gl.uniform3fv(u.uUp, basis.up);
    gl.uniform3fv(u.uForward, basis.forward);
    gl.uniform2f(u.uTan, tanY * (width / height), tanY);
    gl.uniform2f(u.uCentre, view.cx, view.cy);
    gl.uniform3fv(u.uTintA, tint.a);
    gl.uniform3fv(u.uTintB, tint.b);
    gl.uniform3fv(u.uBase, tint.base);
    gl.uniform1f(u.uStrength, 1.25);
    gl.uniform1f(u.uTime, clock);
    gl.bindVertexArray(skyVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    // The far field turns with the camera but never comes nearer.
    rotation.set(view.view);
    rotation[12] = 0; rotation[13] = 0; rotation[14] = 0;
    multiply(rotProj, view.proj, rotation);
    gl.useProgram(programs.far.handle);
    u = programs.far.uniforms;
    gl.uniformMatrix4fv(u.uRotProj, false, rotProj);
    gl.uniform1f(u.uDpr, dpr);
    gl.uniform1f(u.uTime, clock);
    gl.bindVertexArray(farVao);
    gl.drawArrays(gl.POINTS, 0, FAR_COUNT);

    // Galaxy glow.
    if (glowCount) {
      gl.useProgram(programs.glow.handle);
      u = programs.glow.uniforms;
      gl.uniformMatrix4fv(u.uViewProj, false, viewProj);
      gl.uniform3fv(u.uRight, basis.right);
      gl.uniform3fv(u.uUp, basis.up);
      gl.uniform2f(u.uFade, glowFade[0] * (1 - dim * 0.6), glowFade[1] * (1 - dim * 0.6));
      gl.uniform3fv(u.uEye, view.eye);
      gl.bindVertexArray(glowVao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, glowCount);
    }

    // Dust.
    gl.useProgram(programs.dust.handle);
    u = programs.dust.uniforms;
    gl.uniformMatrix4fv(u.uViewProj, false, viewProj);
    gl.uniform1f(u.uFocal, focal * dpr);
    gl.uniform1f(u.uDpr, dpr);
    gl.uniform1f(u.uMaxPoint, maxPoint);
    gl.uniform1f(u.uDistance, view.distance);
    gl.uniform1f(u.uDim, dim);
    gl.uniform3fv(u.uTint, tint.star);
    gl.uniform1f(u.uTintMix, tint.mix * 1.6);
    gl.bindVertexArray(dustVao);
    gl.drawArrays(gl.POINTS, 0, count * DUST_PER_STAR);

    // Lines.
    if (lineCount) {
      gl.useProgram(programs.line.handle);
      u = programs.line.uniforms;
      gl.uniformMatrix4fv(u.uViewProj, false, viewProj);
      gl.uniform2f(u.uViewport, canvas.width, canvas.height);
      gl.uniform1f(u.uDpr, dpr);
      gl.uniform1f(u.uTime, reducedMotion ? 0 : clock);
      gl.bindVertexArray(lineVao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, lineCount);
    }

    // Stars.
    gl.useProgram(programs.star.handle);
    u = programs.star.uniforms;
    gl.uniformMatrix4fv(u.uViewProj, false, viewProj);
    gl.uniform2f(u.uViewport, canvas.width, canvas.height);
    gl.uniform1f(u.uFocal, focal * dpr);
    gl.uniform1f(u.uTime, reducedMotion ? 0 : clock);
    gl.uniform1f(u.uDim, dim);
    gl.uniform1f(u.uDpr, dpr);
    gl.uniform1f(u.uDistance, view.distance);
    gl.uniform3fv(u.uTint, tint.star);
    gl.uniform1f(u.uTintMix, tint.mix);
    gl.bindVertexArray(starVao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    gl.bindVertexArray(null);

    for (const listener of frameListeners) listener(view, clock, dt);
    requestAnimationFrame(draw);
  }

  // ── Questions the rest of the site asks.
  /** Where a star is on screen now: { x, y } in CSS pixels, depth along the view, or null behind the eye. */
  function project(i, out = {}) {
    return projectPoint(cur[i * 3], cur[i * 3 + 1], cur[i * 3 + 2], out);
  }

  function projectPoint(x, y, z, out = {}) {
    if (!view) return null;
    const m = view.viewProj;
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w <= 0.01) return null;
    out.x = ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w * 0.5 + 0.5) * width;
    out.y = (0.5 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / w * 0.5) * height;
    out.depth = w;
    return out;
  }

  /** How wide a star is drawn, in CSS pixels, at a depth. */
  function sizeAt(i, depth) {
    const glow = data[i * 4 + 3];
    const lift = Math.min(glow, 2);
    const px = (data[i * 4] * (1 + 0.55 * lift) * view.focal / depth) * 2;
    return clamp(px, 1.5 + (colour[i * 4 + 3] / 255) * 2.0 + lift * 2.6, 300);
  }

  /** The star under a point on screen, or -1. */
  function pick(x, y, reach = 1) {
    if (!view) return -1;
    const m = view.viewProj;
    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < count; i += 1) {
      const px = cur[i * 3]; const py = cur[i * 3 + 1]; const pz = cur[i * 3 + 2];
      const w = m[3] * px + m[7] * py + m[11] * pz + m[15];
      if (w <= 0.01) continue;
      const sx = ((m[0] * px + m[4] * py + m[8] * pz + m[12]) / w * 0.5 + 0.5) * width;
      const dx = sx - x;
      if (dx > 46 || dx < -46) continue;
      const sy = (0.5 - (m[1] * px + m[5] * py + m[9] * pz + m[13]) / w * 0.5) * height;
      const dy = sy - y;
      if (dy > 46 || dy < -46) continue;
      const radius = clamp(sizeAt(i, w) * 0.2, 9, 34) * reach;
      const distance = Math.hypot(dx, dy);
      if (distance > radius) continue;
      // Nearer to the pointer wins; among near ties, the brighter and the closer star.
      const score = distance / radius - (colour[i * 4 + 3] / 255) * 0.25 + (dim > 0.2 && glowGoal[i] < 0.5 ? 1 : 0);
      if (score < bestScore) { bestScore = score; best = i; }
    }
    return best;
  }

  const positionOf = (i, out = [0, 0, 0]) => { out[0] = cur[i * 3]; out[1] = cur[i * 3 + 1]; out[2] = cur[i * 3 + 2]; return out; };
  /** Where a star will rest under the present light, wherever it is in flight now. */
  const restingPlace = (i, out = [0, 0, 0]) => {
    const target = universe.positions[sky];
    out[0] = target[i * 3]; out[1] = target[i * 3 + 1]; out[2] = target[i * 3 + 2];
    return out;
  };

  function setLines(group, lines) {
    if (!lines || !lines.length) { lineGroups.delete(group); return; }
    lineGroups.set(group, lines.map(line => ({ ...line, born: line.born ?? clock })));
  }

  /** How far out the lit stars of a sky reach: the frame for an overview. */
  function reachOf(skyId = sky) {
    const P = universe.positions[skyId];
    const G = universe.galaxyOf[skyId];
    let reach = 0;
    for (let i = 0; i < universe.base; i += 1) {
      if (G[i] === UNLIT) continue;
      reach = Math.max(reach, Math.hypot(P[i * 3], P[i * 3 + 2]));
    }
    return reach || 1500;
  }

  // ── Begin.
  allocate(universe.count);
  sync();
  aimTints(sky);
  rebuildGlows(null);
  resize();
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  observer?.observe(canvas);
  window.addEventListener('resize', resize);
  universe.onGrow(() => sync());
  requestAnimationFrame(draw);

  return {
    canvas, camera, universe,
    get sky() { return sky; },
    get count() { return count; },
    get view() { return view; },
    get size() { return { width, height }; },
    get transitioning() { return Boolean(transition); },
    get clock() { return clock; },
    setSky, project, projectPoint, pick, positionOf, restingPlace, setLines, reachOf, sizeAt, resize,
    setFocus(i) { focus = i; refreshGlowGoals(); },
    setHover(i) { if (hover !== i) { hover = i; refreshGlowGoals(); } },
    setHighlight(set) { highlight = set && set.size ? set : null; refreshGlowGoals(); },
    setRayEnds(list) { rayEnds = new Set(list); refreshGlowGoals(); },
    setMarks({ loved, visited }) { if (loved) marks.loved = loved; if (visited) marks.visited = visited; refreshGlowGoals(); },
    onFrame(listener) { frameListeners.add(listener); return () => frameListeners.delete(listener); },
    onSettled(listener) { settled.add(listener); return () => settled.delete(listener); },
    stop() { running = false; observer?.disconnect(); window.removeEventListener('resize', resize); },
  };
}
