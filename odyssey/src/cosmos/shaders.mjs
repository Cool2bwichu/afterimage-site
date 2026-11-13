// The light itself. Everything in the cosmos is drawn additively: stars, dust,
// the glow of galaxies and the rays between films all add their light to the
// dark behind them, the way a long exposure does.

const HEAD = `#version 300 es
precision highp float;
`;

// ── The sky behind everything: a nebula baked once into a cube map.
export const SKY_BAKE_VS = `${HEAD}
layout(location = 0) in vec2 aCorner;
out vec2 vUV;
void main() { vUV = aCorner; gl_Position = vec4(aCorner, 0.0, 1.0); }
`;

export const SKY_BAKE_FS = `${HEAD}
in vec2 vUV;
uniform mat3 uFace;
out vec4 frag;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float fbm(vec3 p) {
  float amplitude = 0.5;
  float sum = 0.0;
  for (int i = 0; i < 6; i++) {
    sum += amplitude * noise(p);
    p = p * 2.03 + vec3(11.7, 3.1, 5.3);
    amplitude *= 0.5;
  }
  return sum;
}
void main() {
  vec3 dir = normalize(uFace * vec3(vUV, 1.0));
  vec3 warp = vec3(fbm(dir * 2.1 + 3.0), fbm(dir * 2.1 + 17.0), fbm(dir * 2.1 + 31.0)) - 0.5;
  // A band across the sky, as a galaxy seen from inside has.
  float band = exp(-pow(dot(dir, normalize(vec3(0.22, 0.93, 0.3))) / 0.42, 2.0));
  float broad = fbm(dir * 1.5 + warp * 1.7);
  float fine = fbm(dir * 3.6 + warp * 2.6 + 9.0);
  float lanes = fbm(dir * 2.6 + warp * 1.2 + 23.0);
  float cloudA = pow(smoothstep(0.34, 0.82, broad), 1.5) * (0.3 + 0.9 * band);
  float cloudB = pow(smoothstep(0.42, 0.88, fine), 2.0) * (0.25 + 1.0 * band);
  float dark = smoothstep(0.42, 0.7, lanes);
  frag = vec4(cloudA, cloudB, dark, band);
}
`;

export const SKY_VS = `${HEAD}
layout(location = 0) in vec2 aCorner;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform vec2 uTan;     // tan(half fov) * aspect, tan(half fov)
uniform vec2 uCentre;  // the principal point, in clip units
out vec3 vDir;
out vec2 vClip;
void main() {
  vClip = aCorner;
  vDir = uForward + uRight * (aCorner.x - uCentre.x) * uTan.x + uUp * (aCorner.y - uCentre.y) * uTan.y;
  gl_Position = vec4(aCorner, 0.0, 1.0);
}
`;

export const SKY_FS = `${HEAD}
in vec3 vDir;
in vec2 vClip;
uniform samplerCube uSky;
uniform vec3 uTintA;
uniform vec3 uTintB;
uniform vec3 uBase;
uniform float uStrength;
uniform float uTime;
out vec4 frag;
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec4 sky = texture(uSky, normalize(vDir));
  float lanes = 1.0 - sky.b * 0.6;
  vec3 colour = uBase * (0.55 + 0.75 * sky.a);
  colour += uTintA * sky.r * lanes * uStrength;
  colour += uTintB * sky.g * lanes * uStrength * 0.9;
  // Darker toward the corners, as a lens is.
  float vignette = 1.0 - 0.42 * smoothstep(0.55, 1.5, length(vClip * vec2(0.92, 1.0)));
  colour *= vignette;
  // A grain of dither, so the dark gradients never band.
  colour += (hash12(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0 * 1.6;
  frag = vec4(max(colour, 0.0), 1.0);
}
`;

// ── The far field: stars too distant to be films.
export const FAR_VS = `${HEAD}
layout(location = 0) in vec4 aStar;   // direction, magnitude
layout(location = 1) in vec3 aTint;
uniform mat4 uRotProj;
uniform float uDpr;
uniform float uTime;
out vec3 vColour;
void main() {
  vec4 clip = uRotProj * vec4(aStar.xyz, 1.0);
  gl_Position = vec4(clip.xy, clip.w * 0.9999, clip.w);
  float magnitude = aStar.w;
  float twinkle = 0.82 + 0.18 * sin(uTime * (0.6 + fract(magnitude * 91.7) * 1.8) + magnitude * 200.0);
  gl_PointSize = (1.0 + magnitude * 2.2) * uDpr;
  vColour = aTint * (0.26 + magnitude * 0.9) * twinkle;
}
`;

export const FAR_FS = `${HEAD}
in vec3 vColour;
out vec4 frag;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float falloff = exp(-dot(p, p) * 2.6);
  frag = vec4(vColour * falloff, 1.0);
}
`;

// ── The glow of a galaxy: a disc lying in the galaxy's own plane, or a
// soft ball facing the eye.
export const GLOW_VS = `${HEAD}
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec3 aCentre;
layout(location = 2) in vec3 aU;
layout(location = 3) in vec3 aV;
layout(location = 4) in vec4 aColour;   // rgb, strength
layout(location = 5) in vec2 aKind;     // 1 = faces the eye; which sky's set (0 leaving, 1 arriving)
uniform mat4 uViewProj;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec2 uFade;       // strength of the leaving and the arriving sets
uniform vec3 uEye;
out vec2 vP;
out vec4 vColour;
void main() {
  float reach = length(aU);
  vec3 u = aKind.x > 0.5 ? uRight * reach : aU;
  vec3 v = aKind.x > 0.5 ? uUp * reach : aV;
  vec3 world = aCentre + u * aCorner.x + v * aCorner.y;
  gl_Position = uViewProj * vec4(world, 1.0);
  vP = aCorner;
  // From inside a galaxy its glow is only a faint haze: the stars are the view.
  float inside = smoothstep(0.7, 3.2, length(uEye - aCentre) / max(reach, 1.0));
  vColour = vec4(aColour.rgb, aColour.a * mix(uFade.x, uFade.y, aKind.y) * mix(0.12, 1.0, inside));
}
`;

export const GLOW_FS = `${HEAD}
in vec2 vP;
in vec4 vColour;
out vec4 frag;
void main() {
  float r2 = dot(vP, vP);
  float glow = max(0.0, exp(-r2 * 3.4) - 0.0334) + 0.5 * max(0.0, exp(-r2 * 14.0) - 0.000001);
  frag = vec4(vColour.rgb * glow * vColour.a, 1.0);
}
`;

// ── Dust: the unresolved light between the stars of an arm.
export const DUST_VS = `${HEAD}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec4 aColour;   // rgb, strength
layout(location = 2) in float aSize;
uniform mat4 uViewProj;
uniform float uFocal;
uniform float uDpr;
uniform float uMaxPoint;
uniform float uDistance;
uniform float uDim;
uniform vec3 uTint;
uniform float uTintMix;
out vec4 vColour;
void main() {
  vec4 clip = uViewProj * vec4(aPos, 1.0);
  gl_Position = clip;
  float depth = max(clip.w, 0.001);
  float px = aSize * uFocal / depth * 2.0;
  float size = clamp(px, 1.0 * uDpr, min(uMaxPoint, 46.0 * uDpr));
  gl_PointSize = size;
  // Near dust is large and soft, like bokeh; far dust is a faint grain.
  float spread = 1.0 / (1.0 + size * size * 0.012);
  float fog = mix(1.0, 0.45, smoothstep(uDistance * 1.3, uDistance * 3.5, depth));
  float near = smoothstep(uDistance * 0.05, uDistance * 0.3, depth);
  vColour = vec4(mix(aColour.rgb, uTint, uTintMix), aColour.a * spread * fog * near * (1.0 - uDim * 0.7));
}
`;

export const DUST_FS = `${HEAD}
in vec4 vColour;
out vec4 frag;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float falloff = exp(-dot(p, p) * 2.8);
  frag = vec4(vColour.rgb * vColour.a * falloff, 1.0);
}
`;

// ── A film.
export const STAR_VS = `${HEAD}
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec3 aPos;
layout(location = 2) in vec4 aColour;   // rgb, renown 0..1
layout(location = 3) in vec4 aData;     // world size, phase, marks, glow
uniform mat4 uViewProj;
uniform vec2 uViewport;
uniform float uFocal;
uniform float uTime;
uniform float uDim;
uniform float uDpr;
uniform float uDistance;
uniform vec3 uTint;
uniform float uTintMix;
out vec2 vP;
out vec3 vColour;
out float vSize;
out float vBright;
out vec3 vMarks;   // loved, deep, spikes
void main() {
  vec4 clip = uViewProj * vec4(aPos, 1.0);
  if (clip.w <= 0.01) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float glow = aData.w;
  float marks = aData.z;
  float loved = mod(marks, 2.0) >= 1.0 ? 1.0 : 0.0;
  float visited = mod(floor(marks / 2.0), 2.0) >= 1.0 ? 1.0 : 0.0;
  float deep = mod(floor(marks / 4.0), 2.0) >= 1.0 ? 1.0 : 0.0;
  float lift = min(glow, 2.0);
  float world = aData.x * (1.0 + 0.55 * lift + 0.25 * loved);
  float px = world * uFocal / clip.w * 2.0;
  float least = (1.5 + aColour.a * 2.0 + lift * 2.6 + loved * 1.2) * uDpr;
  float size = clamp(px, least, 300.0 * uDpr);
  float twinkle = 1.0 + 0.13 * sin(uTime * (0.7 + fract(aData.y * 7.3) * 1.4) + aData.y * 40.0);
  float fog = mix(1.0, 0.42, smoothstep(uDistance * 1.25, uDistance * 3.4, clip.w));
  float renown = 0.3 + 0.7 * aColour.a;
  float lit = mix(1.0 - uDim, 1.0, clamp(glow, 0.0, 1.0));
  vBright = renown * twinkle * fog * lit * (1.0 + 0.55 * lift + 0.2 * visited) * mix(0.5, 1.0, clamp(px / least, 0.0, 1.0));
  vSize = size;
  vP = aCorner;
  vColour = mix(aColour.rgb, uTint, uTintMix);
  vMarks = vec3(loved, deep, clamp(aColour.a * 1.3 - 0.45 + lift * 0.7, 0.0, 1.0));
  gl_Position = vec4(clip.xy / clip.w + aCorner * size / uViewport, 0.0, 1.0);
}
`;

export const STAR_FS = `${HEAD}
in vec2 vP;
in vec3 vColour;
in float vSize;
in float vBright;
in vec3 vMarks;
uniform float uTime;
out vec4 frag;
void main() {
  float r2 = dot(vP, vP);
  if (r2 > 1.0) discard;
  float r = sqrt(r2);
  float large = smoothstep(5.0, 44.0, vSize);
  float core = exp(-r2 * mix(3.0, 64.0, large));
  float halo = exp(-r2 * 5.2) * 0.2 * large;
  vec2 a = abs(vP);
  float spikes = (exp(-a.y * 70.0) * exp(-a.x * 3.6) + exp(-a.x * 70.0) * exp(-a.y * 3.6)) * vMarks.z * smoothstep(12.0, 60.0, vSize);
  float edge = 1.0 - smoothstep(0.72, 1.0, r);
  vec3 hot = mix(vColour, vec3(1.0, 0.985, 0.96), mix(0.3, 0.8, large));
  vec3 colour = vColour * (halo + spikes * 0.55) + hot * core;
  // A loved film wears a warm ring; a film charted from memory, a pale thin one.
  float ringable = smoothstep(9.0, 26.0, vSize);
  float lovedRing = exp(-pow((r - 0.56) * 13.0, 2.0)) * vMarks.x * ringable * (0.75 + 0.25 * sin(uTime * 1.6));
  float deepRing = exp(-pow((r - 0.34) * 22.0, 2.0)) * vMarks.y * ringable * 0.55;
  colour += vec3(1.0, 0.76, 0.44) * lovedRing * 0.75 + vec3(0.86, 0.93, 1.0) * deepRing;
  frag = vec4(colour * vBright * edge, 1.0);
}
`;

// ── A line of light between two films: a ray of the prism, a drawn line
// from the atlas, the wake, a passage, the figure of a constellation.
export const LINE_VS = `${HEAD}
layout(location = 0) in vec2 aCorner;   // along 0..1, across -1..1
layout(location = 1) in vec3 aA;
layout(location = 2) in vec3 aB;
layout(location = 3) in vec4 aColour;
layout(location = 4) in vec4 aStyle;    // width px, style, phase, grow 0..1
uniform mat4 uViewProj;
uniform vec2 uViewport;
uniform float uDpr;
out vec2 vUV;
out vec4 vColour;
out vec4 vStyle;
out float vLength;
void main() {
  vec4 a = uViewProj * vec4(aA, 1.0);
  vec4 b = uViewProj * vec4(aB, 1.0);
  float near = 1.0;
  if (a.w < near && b.w < near) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  if (a.w < near) a = mix(a, b, (near - a.w) / (b.w - a.w));
  else if (b.w < near) b = mix(b, a, (near - b.w) / (a.w - b.w));
  vec2 sa = a.xy / a.w * uViewport * 0.5;
  vec2 sb = b.xy / b.w * uViewport * 0.5;
  vec2 dir = sb - sa;
  float len = length(dir);
  dir = len > 0.0001 ? dir / len : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);
  float along = aCorner.x * clamp(aStyle.w, 0.0, 1.0);
  vec2 p = mix(sa, sb, along) + normal * aCorner.y * aStyle.x * uDpr;
  gl_Position = vec4(p / (uViewport * 0.5), 0.0, 1.0);
  vUV = vec2(along, aCorner.y);
  vColour = aColour;
  vStyle = aStyle;
  vLength = len / uDpr;
}
`;

export const LINE_FS = `${HEAD}
in vec2 vUV;
in vec4 vColour;
in vec4 vStyle;
in float vLength;
uniform float uTime;
out vec4 frag;
void main() {
  float across = exp(-vUV.y * vUV.y * 7.0) * 0.55 + exp(-vUV.y * vUV.y * 60.0);
  float style = vStyle.y;
  // A contour (style 4) is one stroke drawn in pieces: its pieces do not fade at their ends.
  float ends = style > 3.5 ? 1.0 : smoothstep(0.0, 0.035, vUV.x) * (1.0 - smoothstep(0.93, 1.0, vUV.x) * 0.75);
  float brightness = 1.0;
  if (style > 0.5 && style < 1.5) {
    // Light travelling outward along a ray.
    float travel = fract(vUV.x * max(vLength, 1.0) / 190.0 - uTime * 0.42 + vStyle.z);
    brightness = 0.36 + 1.25 * exp(-pow((travel - 0.5) * 5.2, 2.0));
  } else if (style > 1.5 && style < 2.5) {
    // A drawn line: dashes.
    brightness = 0.25 + 0.75 * smoothstep(0.42, 0.5, abs(fract(vUV.x * max(vLength, 1.0) / 13.0) - 0.5) * 2.0);
  } else if (style > 2.5 && style < 3.5) {
    // The wake: fainter the further back it lies.
    brightness = 0.4 + 0.6 * vStyle.z;
  }
  frag = vec4(vColour.rgb * vColour.a * across * ends * brightness, 1.0);
}
`;
