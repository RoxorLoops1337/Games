// Particles, decals, tracers, casings, atmosphere and explosions.
//
// Everything here is a lie told to the eye, and the lies are chosen by what the
// eye actually integrates. A spark is a point of light moving at 20 m/s; over a
// 16 ms frame it covers 30 cm, so the retina sees a streak — draw it as a round
// dot and it reads as confetti. Smoke has no silhouette, so it must be soft
// against whatever it intersects or the hard clip line against the floor gives
// the whole thing away. Impact debris that hangs in the air is a screensaver;
// debris that arcs, hits the ground and stops is a bullet.
//
// The system is built around one idea: the CPU writes a *spawn record* and never
// touches the particle again. Position, velocity, size, colour and rotation are
// all evaluated in the vertex shader from (origin, velocity, drag, gravity, t0),
// using the closed-form solution to linear drag. That means a 400-particle
// explosion costs 400 buffer writes once, and zero work per frame afterwards.
// Nothing in here allocates a geometry, a material or a typed array after boot.

import * as THREE from 'three';
import * as C from '../core/constants.js';
import { emit, mulberry32, clamp } from '../core/state.js';
import { raycast, groundBelow } from '../world/collision.js';

const S = C.SURFACE;

export function createFX(G, engine, materials) {
  // Rule 2 of the architecture: a visual system that fails must drop itself, not
  // the game. Every GPU-shaped thing below happens inside this try.
  try {
    return build(G, engine, materials);
  } catch (err) {
    if (typeof console !== 'undefined') console.warn('[fx] disabled:', err);
    return { step() {}, handle() {}, update() {}, reset() {}, failed: true, error: err };
  }
}

// ── procedural atlases ───────────────────────────────────────────────────────
//
// Both atlases are drawn once at boot into a 2D canvas. Two textures, ~1.5 ms,
// and it keeps the promise that nothing is fetched at runtime. Every tile is
// drawn inset from its cell so a mip level never bleeds a neighbouring sprite
// into the edge of a particle — the classic "why is my smoke rimmed in blood".

const PART_COLS = 4, PART_ROWS = 3, PART_TILE = 128;
// tile ids
const T_PUFF = 0, T_SMOKE = 1, T_STREAK = 2, T_CHIP = 3, T_GLOW = 4,
      T_DROP = 5, T_LEAF = 6, T_MOTE = 7, T_FLASH = 8, T_SHARD = 9,
      T_RING = 10, T_MIST = 11;

function particleAtlas(rnd) {
  const cv = document.createElement('canvas');
  cv.width = PART_COLS * PART_TILE; cv.height = PART_ROWS * PART_TILE;
  const g = cv.getContext('2d');
  const cell = (i) => { g.save(); g.translate((i % PART_COLS) * PART_TILE, ((i / PART_COLS) | 0) * PART_TILE); };
  const end = () => g.restore();
  const H = PART_TILE / 2, PAD = 10;
  const R = H - PAD;

  const radial = (cx, cy, r, stops) => {
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    for (const [o, a] of stops) grd.addColorStop(o, `rgba(255,255,255,${a})`);
    g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
  };

  // 0 — soft puff. A gaussian-ish core with a few off-centre lobes so the
  // silhouette is not a perfect circle; a circle reads as a bubble, not dust.
  cell(T_PUFF);
  radial(H, H, R, [[0, 0.85], [0.45, 0.42], [1, 0]]);
  for (let i = 0; i < 6; i++) {
    const a = rnd() * 7, d = R * 0.35 * rnd();
    radial(H + Math.cos(a) * d, H + Math.sin(a) * d, R * (0.35 + rnd() * 0.3), [[0, 0.30], [1, 0]]);
  }
  end();

  // 1 — smoke wisp. Lumpier and hollower than the puff so a stack of them
  // builds structure instead of an even grey blob.
  cell(T_SMOKE);
  for (let i = 0; i < 12; i++) {
    const a = rnd() * 7, d = R * 0.5 * Math.sqrt(rnd());
    radial(H + Math.cos(a) * d, H + Math.sin(a) * d, R * (0.28 + rnd() * 0.34), [[0, 0.22], [0.6, 0.10], [1, 0]]);
  }
  radial(H, H, R, [[0, 0.16], [0.7, 0.08], [1, 0]]);
  end();

  // 2 — spark streak. Bright core tapering to the right, because the quad is
  // oriented with +x along the velocity: the head is hot, the tail is the
  // afterimage the eye left behind.
  cell(T_STREAK);
  {
    const grd = g.createLinearGradient(PAD, 0, PART_TILE - PAD, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.55, 'rgba(255,255,255,0.55)');
    grd.addColorStop(0.88, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    for (let y = 0; y < PART_TILE; y++) {
      const t = (y - H) / (R * 0.55);
      const a = Math.exp(-t * t * 2.2);
      g.globalAlpha = a; g.fillRect(0, y, PART_TILE, 1);
    }
    g.globalAlpha = 1;
    radial(PART_TILE - PAD - R * 0.18, H, R * 0.22, [[0, 1], [1, 0]]);
  }
  end();

  // 3 — chip. A small hard-edged shard of rock: solid centre, one soft pixel of
  // edge so it antialiases instead of crawling.
  cell(T_CHIP);
  g.fillStyle = '#fff'; g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * 7 + rnd() * 0.4, d = R * (0.45 + rnd() * 0.5);
    const x = H + Math.cos(a) * d, y = H + Math.sin(a) * d * 0.7;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath(); g.fill();
  end();

  // 4 — tight glow. The core of a flash or a hot spark: almost all the energy
  // inside 20% of the radius, which is what makes a highlight bloom.
  cell(T_GLOW);
  radial(H, H, R, [[0, 1], [0.12, 0.75], [0.35, 0.18], [1, 0]]);
  end();

  // 5 — droplet. Teardrop for water and blood, heavy end leading.
  cell(T_DROP);
  g.fillStyle = '#fff'; g.beginPath();
  g.moveTo(H, PAD); g.quadraticCurveTo(H + R * 0.85, H, H, PART_TILE - PAD);
  g.quadraticCurveTo(H - R * 0.85, H, H, PAD); g.fill();
  end();

  // 6 — leaf. Flat ellipse with a spine; tumbles broadside-on when it flutters.
  cell(T_LEAF);
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.beginPath(); g.ellipse(H, H, R * 0.9, R * 0.42, 0.4, 0, 7); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(H - R * 0.8, H + R * 0.3); g.lineTo(H + R * 0.8, H - R * 0.3); g.stroke();
  end();

  // 7 — mote. The atmosphere sprite. Nearly all falloff, no core: a dust mote is
  // sub-pixel and what you actually see is its scattered halo.
  cell(T_MOTE);
  radial(H, H, R, [[0, 0.9], [0.3, 0.35], [1, 0]]);
  end();

  // 8 — muzzle star. Radiating spikes plus a core. Rotated randomly per shot so
  // consecutive rounds never show the same shape; a repeating flash is the
  // fastest way to make automatic fire look like a looping animation.
  cell(T_FLASH);
  radial(H, H, R * 0.55, [[0, 1], [0.25, 0.6], [1, 0]]);
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * 7 + 0.3, w = 0.10 + rnd() * 0.16, len = R * (0.55 + rnd() * 0.45);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath(); g.moveTo(H, H);
    g.lineTo(H + Math.cos(a - w) * len, H + Math.sin(a - w) * len);
    g.lineTo(H + Math.cos(a + w) * len, H + Math.sin(a + w) * len);
    g.closePath(); g.fill();
  }
  end();

  // 9 — shard. Long thin triangle for glass and splinters.
  cell(T_SHARD);
  g.fillStyle = '#fff'; g.beginPath();
  g.moveTo(PAD, H); g.lineTo(PART_TILE - PAD, H - R * 0.26); g.lineTo(PART_TILE - PAD * 1.6, H + R * 0.30);
  g.closePath(); g.fill();
  end();

  // 10 — ring. Smoke ring and shockwave: hollow, soft on both edges.
  cell(T_RING);
  {
    const grd = g.createRadialGradient(H, H, 0, H, H, R);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.62, 'rgba(255,255,255,0)');
    grd.addColorStop(0.82, 'rgba(255,255,255,0.9)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, PART_TILE, PART_TILE);
  }
  end();

  // 11 — mist blob. Blood mist: many tiny dots rather than one cloud, so a
  // spray reads as atomised fluid instead of coloured fog.
  cell(T_MIST);
  for (let i = 0; i < 46; i++) {
    const a = rnd() * 7, d = R * Math.sqrt(rnd());
    radial(H + Math.cos(a) * d, H + Math.sin(a) * d, R * (0.05 + rnd() * 0.14), [[0, 0.75], [1, 0]]);
  }
  end();

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

const DEC_COLS = 4, DEC_ROWS = 4, DEC_TILE = 128;
const D_CONCRETE = 0, D_METAL = 1, D_SAND = 2, D_WOOD = 3, D_GLASS = 4,
      D_RUBBER = 5, D_SCUFF = 6, D_RIPPLE = 7,
      D_BLOOD_A = 8, D_BLOOD_B = 9, D_BLOOD_C = 10,
      D_SCORCH_A = 11, D_SCORCH_B = 12, D_POOL = 13, D_DUST = 14, D_HOLE = 15;

function decalAtlas(rnd) {
  const cv = document.createElement('canvas');
  cv.width = DEC_COLS * DEC_TILE; cv.height = DEC_ROWS * DEC_TILE;
  const g = cv.getContext('2d');
  const H = DEC_TILE / 2, PAD = 8, R = H - PAD;
  const cell = (i) => { g.save(); g.translate((i % DEC_COLS) * DEC_TILE, ((i / DEC_COLS) | 0) * DEC_TILE); };
  const end = () => g.restore();
  const radial = (cx, cy, r, stops) => {
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    for (const [o, col] of stops) grd.addColorStop(o, col);
    g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
  };
  // Decals are drawn as *darkness plus tint*: white in the texture means "leave
  // the wall alone", black means "punch a hole". The instance colour then tints
  // the ring, so one hole tile serves grey concrete and rusty steel.
  const hole = (core, ringA, ringR) => {
    radial(H, H, ringR, [[0, `rgba(0,0,0,${ringA})`], [0.55, `rgba(0,0,0,${ringA * 0.35})`], [1, 'rgba(0,0,0,0)']]);
    radial(H, H, core, [[0, 'rgba(0,0,0,0.96)'], [0.65, 'rgba(0,0,0,0.82)'], [1, 'rgba(0,0,0,0)']]);
  };
  const speckle = (n, maxR, a) => {
    for (let i = 0; i < n; i++) {
      const ang = rnd() * 7, d = R * Math.sqrt(rnd());
      g.fillStyle = `rgba(0,0,0,${a * (0.4 + rnd() * 0.6)})`;
      g.beginPath(); g.arc(H + Math.cos(ang) * d, H + Math.sin(ang) * d, maxR * rnd(), 0, 7); g.fill();
    }
  };

  cell(D_CONCRETE); hole(R * 0.26, 0.34, R); speckle(60, 2.6, 0.5); end();

  // Metal: a tight punched hole with a *bright* lip, because a jacketed round
  // peels the paint back and leaves bare, specular metal around the crater.
  cell(D_METAL);
  radial(H, H, R * 0.62, [[0, 'rgba(255,255,255,0.55)'], [0.45, 'rgba(255,255,255,0.16)'], [1, 'rgba(255,255,255,0)']]);
  hole(R * 0.22, 0.24, R * 0.7);
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    const a = rnd() * 7;
    g.beginPath(); g.moveTo(H + Math.cos(a) * R * 0.3, H + Math.sin(a) * R * 0.3);
    g.lineTo(H + Math.cos(a) * R * (0.5 + rnd() * 0.5), H + Math.sin(a) * R * (0.5 + rnd() * 0.5)); g.stroke();
  }
  end();

  // Sand: no crater, just a damp-looking depression. Sand collapses.
  cell(D_SAND); radial(H, H, R, [[0, 'rgba(0,0,0,0.5)'], [0.5, 'rgba(0,0,0,0.22)'], [1, 'rgba(0,0,0,0)']]); speckle(40, 3.4, 0.22); end();

  cell(D_WOOD);
  hole(R * 0.2, 0.28, R * 0.75);
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3; g.lineCap = 'round';
  for (let i = 0; i < 11; i++) {
    const a = rnd() * 7, l = R * (0.35 + rnd() * 0.6);
    g.beginPath(); g.moveTo(H, H); g.lineTo(H + Math.cos(a) * l, H + Math.sin(a) * l); g.stroke();
  }
  end();

  // Glass: radial cracks plus concentric ones. The concentric rings are what
  // make it read as glass and not as a scratched wall.
  cell(D_GLASS);
  radial(H, H, R * 0.18, [[0, 'rgba(0,0,0,0.9)'], [1, 'rgba(0,0,0,0)']]);
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.6;
  const spokes = [];
  for (let i = 0; i < 12; i++) { const a = i / 12 * 7 + rnd() * 0.3; spokes.push(a); g.beginPath(); g.moveTo(H, H); g.lineTo(H + Math.cos(a) * R, H + Math.sin(a) * R); g.stroke(); }
  for (let r = 0.3; r < 1; r += 0.22) {
    g.beginPath();
    for (let i = 0; i <= spokes.length; i++) {
      const a = spokes[i % spokes.length] + (i >= spokes.length ? 7 : 0);
      const rr = R * r * (0.85 + rnd() * 0.3);
      const x = H + Math.cos(a) * rr, y = H + Math.sin(a) * rr;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
  }
  end();

  cell(D_RUBBER); radial(H, H, R * 0.8, [[0, 'rgba(0,0,0,0.72)'], [0.6, 'rgba(0,0,0,0.28)'], [1, 'rgba(0,0,0,0)']]); end();
  cell(D_SCUFF); radial(H, H, R, [[0, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']]); speckle(24, 4, 0.2); end();

  cell(D_RIPPLE);
  g.strokeStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 3; i++) { g.lineWidth = 5 - i * 1.4; g.globalAlpha = 0.7 - i * 0.2; g.beginPath(); g.arc(H, H, R * (0.4 + i * 0.28), 0, 7); g.stroke(); }
  g.globalAlpha = 1;
  end();

  // Blood: an irregular core with satellite droplets thrown further than the
  // main mass. Symmetry is the tell — real splatter is never round.
  for (let v = 0; v < 3; v++) {
    cell(D_BLOOD_A + v);
    g.fillStyle = 'rgba(0,0,0,0.92)';
    g.beginPath();
    const lobes = 9 + (v * 3);
    for (let i = 0; i <= lobes; i++) {
      const a = i / lobes * 7;
      const rr = R * (0.30 + 0.34 * Math.abs(Math.sin(a * (1.7 + v) + v)) + rnd() * 0.12);
      const x = H + Math.cos(a) * rr, y = H + Math.sin(a) * rr;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath(); g.fill();
    for (let i = 0; i < 26; i++) {
      const a = rnd() * 7, d = R * (0.55 + rnd() * 0.45);
      g.globalAlpha = 0.3 + rnd() * 0.6;
      g.beginPath(); g.arc(H + Math.cos(a) * d, H + Math.sin(a) * d, 1 + rnd() * 4.5, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    end();
  }

  for (let v = 0; v < 2; v++) {
    cell(D_SCORCH_A + v);
    radial(H, H, R, [[0, 'rgba(0,0,0,0.9)'], [0.35, 'rgba(0,0,0,0.6)'], [0.75, 'rgba(0,0,0,0.2)'], [1, 'rgba(0,0,0,0)']]);
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineCap = 'round';
    for (let i = 0; i < 22; i++) {
      const a = rnd() * 7, l0 = R * (0.3 + rnd() * 0.3), l1 = R * (0.7 + rnd() * 0.3);
      g.lineWidth = 1 + rnd() * 5;
      g.beginPath(); g.moveTo(H + Math.cos(a) * l0, H + Math.sin(a) * l0);
      g.lineTo(H + Math.cos(a) * l1, H + Math.sin(a) * l1); g.stroke();
    }
    speckle(50, 3, 0.3);
    end();
  }

  cell(D_POOL); radial(H, H, R, [[0, 'rgba(0,0,0,0.95)'], [0.7, 'rgba(0,0,0,0.8)'], [0.95, 'rgba(0,0,0,0.2)'], [1, 'rgba(0,0,0,0)']]); end();
  cell(D_DUST); radial(H, H, R, [[0, 'rgba(0,0,0,0.22)'], [1, 'rgba(0,0,0,0)']]); end();
  cell(D_HOLE); hole(R * 0.3, 0.3, R * 0.85); end();

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

// ── shader fragments shared by every family ──────────────────────────────────

// Closed-form linear drag. A particle under `dv/dt = -k v + g` has an exact
// solution, so there is no reason to integrate it on the CPU: one exp() in the
// vertex shader gives the whole trajectory at any time, which is what lets a
// spawn be write-once. It also gives the *right* deceleration curve — dust that
// eases to a stop rather than travelling in a straight line and vanishing.
const GLSL_SIM = /* glsl */`
vec3 simDrag(vec3 p0, vec3 v0, float t, float k, float gy, out vec3 vOut) {
  float e = exp(-k * t);
  float ii = (1.0 - e) / k;
  vOut = v0 * e + vec3(0.0, gy, 0.0) * ii;
  return p0 + v0 * ii + vec3(0.0, gy, 0.0) * ((t - ii) / k);
}
`;

const GLSL_FOG = /* glsl */`
uniform vec3 uFogColor;
uniform float uFogDensity;
float fogAmount(float viewZ) {
  float d = uFogDensity * viewZ;
  return 1.0 - exp(-d * d);
}
`;

// The particle vertex program. Six instanced vec4s in, one camera-facing
// (or velocity-aligned) quad out.
const PART_VERT = /* glsl */`
attribute vec4 iOrig;   // xyz spawn position, w spawn time
attribute vec4 iVel;    // xyz spawn velocity, w lifetime
attribute vec4 iColA;   // rgb birth colour, w birth size
attribute vec4 iColB;   // rgb death colour, w death size
attribute vec4 iSim;    // x drag, y gravity scale, z stretch, w turbulence
attribute vec4 iVis;    // x tile, y peak alpha, z rotation, w fade power
attribute vec4 iExtra;  // x floor height, y restitution, z spin, w unused

uniform float uTime, uGravity, uStretch;
uniform vec3 uWind;

varying vec2 vUv;
varying vec4 vCol;
varying vec2 vScreenUV;
varying float vTile, vFog, vViewZ;

${GLSL_SIM}
${GLSL_FOG}

void main() {
  float age = uTime - iOrig.w;
  float life = max(iVel.w, 1e-4);
  if (age < 0.0 || age > life) {
    // Off-frustum rather than a degenerate triangle: a zero-area quad still
    // rasterises a fragment on some drivers, and a dead particle must cost
    // nothing but a vertex.
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vCol = vec4(0.0); vUv = vec2(0.0); vTile = 0.0; vFog = 0.0; vViewZ = -1.0;
    vScreenUV = vec2(0.0);
    return;
  }

  float k = max(iSim.x, 0.02);
  float gy = uGravity * iSim.y;
  vec3 vel;
  vec3 p = simDrag(iOrig.xyz, iVel.xyz, age, k, gy, vel);

  // One analytic bounce off the ground plane under the impact. Chips and sparks
  // that arc off a wall, hit the floor and skitter are the difference between
  // "an effect played" and "something was struck"; a full collision query per
  // particle is out of the question, but the floor is where 90% of the bounces
  // the player notices actually happen.
  if (iExtra.y > 0.0) {
    float a = 0.5 * gy, b = iVel.y, c0 = iOrig.y - iExtra.x;
    float disc = b * b - 4.0 * a * c0;
    if (a < 0.0 && disc > 0.0) {
      float t1 = (-b - sqrt(disc)) / (2.0 * a);
      if (t1 > 0.0 && age > t1) {
        vec3 v1;
        vec3 p1 = simDrag(iOrig.xyz, iVel.xyz, t1, k, gy, v1);
        p1.y = iExtra.x;
        v1 = vec3(v1.x * 0.45, -v1.y * iExtra.y, v1.z * 0.45);
        p = simDrag(p1, v1, age - t1, k * 2.5, gy, vel);
        p.y = max(p.y, iExtra.x);
      }
    }
  }

  // Turbulence doubles as wind susceptibility: light things get pushed by the
  // desert wind and wander, heavy things do not.
  float sd = iVis.z * 13.7;
  p += uWind * iSim.w * age
     + vec3(sin(age * 1.9 + sd), sin(age * 1.4 + sd * 1.7), cos(age * 2.3 + sd * 0.6)) * iSim.w * 0.30;

  float r = age / life;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vec3 vv = mat3(viewMatrix) * vel;
  float size = mix(iColA.w, iColB.w, r);

  // Motion stretch, done in view space so the elongation follows the *screen*
  // projection of the velocity. A spark flying straight at the camera should
  // stay a dot, and it does, because its screen-space velocity is near zero.
  float rot = iVis.z + iExtra.z * age;
  vec2 ax = vec2(cos(rot), sin(rot));
  float along = size;
  if (iSim.z > 0.0) {
    float l = length(vv.xy);
    if (l > 1e-4) ax = vv.xy / l;
    along = size + min(length(vv) * iSim.z * uStretch, size * 12.0);
  }
  vec2 q = position.xy;
  mv.xy += ax * (q.x * along) + vec2(-ax.y, ax.x) * (q.y * size);

  vViewZ = mv.z;
  vFog = fogAmount(mv.z);
  gl_Position = projectionMatrix * mv;
  // Screen UV straight from clip space, so the depth lookup does not care what
  // resolution the post chain happens to be rendering the scene at.
  vScreenUV = gl_Position.xy / gl_Position.w * 0.5 + 0.5;
  vUv = uv;
  vTile = iVis.x;
  // Fade-in over the first 4% of life kills the pop of a particle appearing at
  // full opacity; the pow() on the way out is what separates a spark (fades
  // fast, high power) from smoke (fades late, low power).
  float a = iVis.y * pow(max(1.0 - r, 0.0), max(iVis.w, 0.01)) * smoothstep(0.0, 0.04, r);
  vCol = vec4(mix(iColA.rgb, iColB.rgb, r), a);
}
`;

const PART_FRAG = /* glsl */`
#include <packing>
uniform sampler2D uAtlas;
uniform sampler2D uDepth;
uniform vec2 uGrid;
uniform float uSoft, uSoftDist, uNear, uFar, uAdditive, uIntensity;
uniform vec3 uFogColor;

varying vec2 vUv;
varying vec4 vCol;
varying vec2 vScreenUV;
varying float vTile, vFog, vViewZ;

void main() {
  if (vCol.a <= 0.001) discard;
  // Tile rows count from the bottom: a CanvasTexture is uploaded with flipY, so
  // row 0 of the canvas ends up at the top of UV space. Getting this backwards
  // silently swaps whole rows of the atlas — smoke drawn with the muzzle-flash
  // sprite, and every effect subtly wrong in a way that is hard to name.
  vec2 cellIdx = vec2(mod(vTile, uGrid.x), (uGrid.y - 1.0) - floor(vTile / uGrid.x));
  vec2 uv = (cellIdx + clamp(vUv, 0.002, 0.998)) / uGrid;
  vec4 tex = texture2D(uAtlas, uv);
  float a = tex.a * vCol.a;
  if (a <= 0.002) discard;

  // Soft particles. Without this a smoke puff sitting on the floor draws a
  // razor-sharp ellipse where it intersects, and that single line undoes every
  // other thing in this file. The depth comes from a half-res prepass (or from
  // the post chain when it exposes one); when neither exists the term is a
  // uniform-controlled no-op rather than a second shader.
  if (uSoft > 0.5) {
    float d = unpackRGBAToDepth(texture2D(uDepth, vScreenUV));
    float sceneZ = perspectiveDepthToViewZ(d, uNear, uFar);
    a *= clamp((vViewZ - sceneZ) / uSoftDist, 0.0, 1.0);
  }

  vec3 col = vCol.rgb * tex.rgb * uIntensity;
  // Additive light is *removed* by fog rather than tinted by it: a glow behind
  // a kilometre of dusty air contributes less, it does not turn brown.
  if (uAdditive > 0.5) a *= (1.0 - vFog);
  else col = mix(col, uFogColor, vFog);
  gl_FragColor = vec4(col, a);
}
`;

// Atmosphere. A finite block of particles wrapped around the camera in world
// space, which is mathematically an infinite field for the price of ~600
// instances. Nothing is ever respawned, nothing is ever written after boot —
// the whole layer is one static buffer and a mod().
const ATMO_VERT = /* glsl */`
attribute vec4 aRnd;   // xyz unit cell position, w layer (0 mote, 1 haze, 2 streak)
attribute vec4 aCfg;   // x size, y speed multiplier, z phase, w brightness

uniform float uTime, uStretch;
uniform vec3 uSpan, uCam, uWind, uSunDir, uSunCol, uShadeCol;
uniform float uGround;

varying vec2 vUv;
varying vec4 vCol;
varying float vTile, vFog;

${GLSL_FOG}

void main() {
  vec3 span = uSpan;
  vec3 anchor = vec3(uCam.x, uGround, uCam.z) - vec3(span.x, 0.0, span.z) * 0.5;
  vec3 p = aRnd.xyz * span + uWind * (uTime * aCfg.y);
  // Bobbing before the wrap, so a mote drifting out of the box re-enters mid-bob
  // rather than snapping to a grid position.
  p.y += sin(uTime * 0.55 * aCfg.y + aCfg.z * 6.28) * span.y * 0.06;
  p = mod(p - anchor, span) + anchor;

  vec3 toCam = p - uCam;
  float dist = length(toCam);
  // Forward scattering. Dust is only *visible* when it is between you and the
  // light: look toward the low sun and the air fills with sparks, turn around
  // and it nearly vanishes. This one term is most of why a dusk scene feels like
  // it has air in it.
  float fs = pow(max(dot(normalize(toCam), -uSunDir), 0.0), 5.0);
  // Even away from the sun a mote picks up sky bounce, so the floor is a third
  // of the peak rather than zero — a field that vanishes when you turn round
  // reads as a bug, not as physics.
  float bright = aCfg.w * mix(0.34, 1.0, fs);
  // Near fade so a mote never lands on the lens, far fade so the field has no
  // visible edge where the wrap box ends.
  bright *= smoothstep(0.30, 1.1, dist) * (1.0 - smoothstep(span.x * 0.34, span.x * 0.52, dist));

  vec4 mv = viewMatrix * vec4(p, 1.0);
  float size = aCfg.x;
  vec2 ax = vec2(cos(aCfg.z * 6.28), sin(aCfg.z * 6.28));
  float along = size;
  if (aRnd.w > 1.5) {
    // Wind-blown sand: stretched along the screen projection of the wind.
    vec3 wv = mat3(viewMatrix) * uWind * aCfg.y;
    float l = length(wv.xy);
    if (l > 1e-4) ax = wv.xy / l;
    along = size + length(wv) * uStretch * 6.0;
  } else if (aRnd.w > 0.5) {
    // Heat haze: a slow vertical breathing, strongest against the ground.
    // Critically, it only exists at distance. Shimmer is an accumulation of
    // refraction along a long sight line — you never see it at arm's length —
    // and a haze quad the camera can walk inside washes the whole frame out.
    float h = clamp(1.0 - (p.y - uGround) / max(span.y, 0.001), 0.0, 1.0);
    size *= 1.0 + 0.25 * sin(uTime * 1.3 + aCfg.z * 9.0);
    along = size;
    bright *= h * h * smoothstep(5.0, 11.0, dist);
  }
  vec2 q = position.xy;
  mv.xy += ax * (q.x * along) + vec2(-ax.y, ax.x) * (q.y * size);

  vFog = fogAmount(mv.z);
  gl_Position = projectionMatrix * mv;
  vUv = uv;
  vTile = aRnd.w > 1.5 ? ${T_STREAK}.0 : (aRnd.w > 0.5 ? ${T_PUFF}.0 : ${T_MOTE}.0);
  vCol = vec4(mix(uShadeCol, uSunCol, fs), max(bright, 0.0));
}
`;

const ATMO_FRAG = /* glsl */`
uniform sampler2D uAtlas;
uniform vec2 uGrid;
uniform float uAdditive, uIntensity;
uniform vec3 uFogColor;
varying vec2 vUv;
varying vec4 vCol;
varying float vTile, vFog;
void main() {
  if (vCol.a <= 0.001) discard;
  vec2 cellIdx = vec2(mod(vTile, uGrid.x), (uGrid.y - 1.0) - floor(vTile / uGrid.x));
  vec4 tex = texture2D(uAtlas, (cellIdx + clamp(vUv, 0.002, 0.998)) / uGrid);
  float a = tex.a * vCol.a;
  if (a <= 0.002) discard;
  vec3 col = vCol.rgb * uIntensity;
  if (uAdditive > 0.5) a *= (1.0 - vFog);
  else col = mix(col, uFogColor, vFog);
  gl_FragColor = vec4(col, a);
}
`;

// Tracers. The whole flight is a function of time, so a tracer is also
// write-once: the CPU records origin, direction, muzzle velocity and the
// distance to whatever the round hits, and the GPU draws the segment between
// where the head is now and where the tail trails behind it.
const TRACER_VERT = /* glsl */`
attribute vec4 tOrig;   // xyz origin, w spawn time
attribute vec4 tDir;    // xyz direction, w travel distance
attribute vec4 tCfg;    // x speed, y life, z width, w length

uniform float uTime;
varying vec2 vUv;
varying float vAlpha;

void main() {
  float age = uTime - tOrig.w;
  if (age < 0.0 || age > tCfg.y) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vUv = vec2(0.0); vAlpha = 0.0; return;
  }
  float travelled = age * tCfg.x;
  float head = min(travelled, tDir.w);
  float tail = max(head - tCfg.w, 0.0);
  vec3 hp = tOrig.xyz + tDir.xyz * head;
  vec3 tp = tOrig.xyz + tDir.xyz * tail;

  vec3 hv = (viewMatrix * vec4(hp, 1.0)).xyz;
  vec3 tv = (viewMatrix * vec4(tp, 1.0)).xyz;
  // Billboard around the segment: the quad always faces the camera but keeps
  // its long axis on the bullet path, which is what a real tracer photograph
  // looks like at any viewing angle except straight down the barrel.
  vec3 mid = mix(tv, hv, position.x + 0.5);
  vec2 d = hv.xy - tv.xy;
  float l = length(d);
  vec2 perp = l > 1e-5 ? vec2(-d.y, d.x) / l : vec2(0.0, 1.0);
  mid.xy += perp * (position.y * tCfg.z);

  gl_Position = projectionMatrix * vec4(mid, 1.0);
  vUv = uv;
  // Bright at the head, gone at the tail, and the whole thing dims once the
  // round has landed so the streak retracts instead of blinking out.
  float landed = travelled > tDir.w ? 1.0 - clamp((travelled - tDir.w) / max(tCfg.w, 0.01), 0.0, 1.0) : 1.0;
  vAlpha = landed * (1.0 - age / tCfg.y);
}
`;

const TRACER_FRAG = /* glsl */`
varying vec2 vUv;
varying float vAlpha;
uniform vec3 uColor;
void main() {
  if (vAlpha <= 0.001) discard;
  float across = 1.0 - abs(vUv.y - 0.5) * 2.0;
  float core = pow(across, 3.0);
  float along = pow(clamp(vUv.x, 0.0, 1.0), 2.2);
  float a = core * along * vAlpha;
  if (a <= 0.002) discard;
  gl_FragColor = vec4(uColor * (0.5 + core * 1.6), a);
}
`;

// Decals. A small quad pushed off the surface along its normal, not a projected
// decal box: the level is an AABB soup of flat faces, so a plane aligned to the
// hit normal is exact on every surface a bullet can actually strike, and the
// whole ring buffer stays one draw call with no per-decal geometry. A projected
// box would need either a clipped mesh per decal (an allocation per bullet, and
// this file allocates nothing after boot) or a deferred pass this module does
// not own. The cost of the cheap version is that a hole straddling a convex
// corner floats off the adjoining face — mitigated by keeping holes small, and
// by the 1.2 cm offset plus a polygon-offset bias that stops the z-fighting the
// offset alone would still leave at grazing angles.
const DECAL_VERT = /* glsl */`
attribute vec4 dPos;    // xyz centre, w birth time
attribute vec4 dRight;  // xyz tangent, w radius
attribute vec4 dUp;     // xyz bitangent, w lifetime
attribute vec4 dNrm;    // xyz normal, w tile
attribute vec4 dTint;   // rgb tint, a peak alpha

uniform float uTime;
uniform vec3 uSunDir, uSunCol, uAmbCol;

varying vec2 vUv;
varying vec4 vCol;
varying float vTile, vFog;

${GLSL_FOG}

void main() {
  float age = uTime - dPos.w;
  float life = max(dUp.w, 1e-3);
  if (age < 0.0 || age > life) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vUv = vec2(0.0); vCol = vec4(0.0); vTile = 0.0; vFog = 0.0; return;
  }
  vec3 wp = dPos.xyz + dRight.xyz * (position.x * dRight.w) + dUp.xyz * (position.y * dRight.w);
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;
  vUv = uv;
  vTile = dNrm.w;
  vFog = fogAmount(mv.z);
  // Decals are lit, not pasted. An unlit black bullet hole on a sunlit wall is
  // the single most obvious sticker artefact there is, and a wrap term keeps
  // the shadow side from going flat.
  float ndl = dot(dNrm.xyz, -uSunDir);
  vec3 lit = uAmbCol + uSunCol * max(ndl * 0.5 + 0.5, 0.0) * max(ndl, 0.0);
  float fadeIn = smoothstep(0.0, 0.06, age);
  float fadeOut = 1.0 - smoothstep(life * 0.82, life, age);
  vCol = vec4(dTint.rgb * lit, dTint.a * fadeIn * fadeOut);
}
`;

const DECAL_FRAG = /* glsl */`
uniform sampler2D uAtlas;
uniform vec2 uGrid;
uniform vec3 uFogColor;
varying vec2 vUv;
varying vec4 vCol;
varying float vTile, vFog;
void main() {
  if (vCol.a <= 0.002) discard;
  vec2 cellIdx = vec2(mod(vTile, uGrid.x), (uGrid.y - 1.0) - floor(vTile / uGrid.x));
  vec4 tex = texture2D(uAtlas, (cellIdx + clamp(vUv, 0.004, 0.996)) / uGrid);
  float a = tex.a * vCol.a;
  if (a <= 0.003) discard;
  // The atlas stores darkness; the tint carries the colour. Multiplying the
  // tint by the texture's own luminance keeps the bright metal lip bright.
  vec3 col = mix(vCol.rgb, vCol.rgb * 3.0, tex.r);
  col = mix(col, uFogColor, vFog);
  gl_FragColor = vec4(col, a);
}
`;

// Explosion shockwave: a thin refracting-looking shell. Real screen-space
// distortion needs the scene colour, which this module cannot read, so the
// shell is drawn as an additive rim instead — the eye reads a fast expanding
// bright ring as a pressure front just as readily, and it costs one draw call
// with no render target.
const WAVE_VERT = /* glsl */`
varying vec3 vN; varying vec3 vView;
void main() {
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;
const WAVE_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uAlpha;
varying vec3 vN; varying vec3 vView;
void main() {
  float f = 1.0 - abs(dot(normalize(vN), normalize(vView)));
  float rim = pow(clamp(f, 0.0, 1.0), 6.0);
  float a = rim * uAlpha;
  if (a <= 0.002) discard;
  gl_FragColor = vec4(uColor * (0.6 + rim), a);
}
`;

// ── build ────────────────────────────────────────────────────────────────────

function build(G, engine, materials) {
  void materials;                       // FX owns its own materials end to end
  const THREE_ = THREE;
  const tier = engine.tier;
  const P = tier.parts;
  const rnd = mulberry32(0x5eed7ac0);   // never G.rng — the sim's stream is its own
  const rr = (a, b) => a + (b - a) * rnd();
  const sym = (a) => (rnd() * 2 - 1) * a;

  // ── budgets ────────────────────────────────────────────────────────────────
  // Split roughly 40/60 between light-emitting and light-occluding particles:
  // sparks and flashes are short-lived and numerous, smoke and dust are few and
  // long-lived, and the two never compete for the same slot.
  const N_ADD = Math.max(48, Math.round(P * 0.40));
  const N_ALPHA = Math.max(64, Math.round(P * 0.60));
  const N_MOTE = clamp(Math.round(P * 0.50), 48, 900);
  const N_STREAK = clamp(Math.round(P * 0.16), 16, 260);
  const N_DECAL = [32, 48, 80, 128][G.settings.quality] || 64;
  const N_CASING = [8, 16, 24, 32][G.settings.quality] || 16;
  const N_TRACER = [8, 12, 20, 32][G.settings.quality] || 12;
  const N_LIGHT = tier.parts >= 700 ? 3 : 1;

  const group = new THREE_.Group();
  group.name = 'fx';
  group.matrixAutoUpdate = false;
  engine.scene.add(group);

  const atlasP = particleAtlas(rnd);
  const atlasD = decalAtlas(rnd);
  atlasP.anisotropy = Math.min(4, tier.aniso);
  atlasD.anisotropy = tier.aniso;

  // One quad shared by every instanced family. Four vertices, six indices, and
  // it never changes for the lifetime of the process.
  const quadPos = new THREE_.BufferAttribute(new Float32Array([
    -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0,
  ]), 3);
  const quadUv = new THREE_.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2);
  const quadIdx = new THREE_.BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1);
  const INF_SPHERE = new THREE_.Sphere(new THREE_.Vector3(), 1e6);

  const clock = { t: 0 };

  // ── depth for soft particles ───────────────────────────────────────────────
  // Preferred source is whatever the post chain already has; failing that we
  // render our own half-res depth. Half res is plenty: the term it feeds is a
  // 30 cm-wide fade, so a two-pixel error in the silhouette is invisible, and a
  // quarter of the fragments makes the extra pass affordable.
  const wantSoft = P >= 700;
  let depthRT = null, depthMat = null;
  if (wantSoft) {
    depthRT = new THREE_.WebGLRenderTarget(2, 2, {
      minFilter: THREE_.NearestFilter, magFilter: THREE_.NearestFilter,
      depthBuffer: true, stencilBuffer: false,
    });
    depthMat = new THREE_.MeshDepthMaterial({ depthPacking: THREE_.RGBADepthPacking });
  }
  const dummyDepth = new THREE_.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  dummyDepth.needsUpdate = true;

  const shared = {
    uTime: { value: 0 },
    uGravity: { value: C.GRAVITY },
    uStretch: { value: 0.016 },       // ≈ one frame of exposure, in seconds
    uWind: { value: new THREE_.Vector3(0.9, 0.05, 0.42) },
    uAtlas: { value: atlasP },
    uGrid: { value: new THREE_.Vector2(PART_COLS, PART_ROWS) },
    uDepth: { value: dummyDepth },
    uSoft: { value: 0 },
    uNear: { value: engine.camera.near },
    uFar: { value: engine.camera.far },
    uFogColor: { value: new THREE_.Color(0x1b2028) },
    uFogDensity: { value: 0.012 },
  };

  function particleMaterial(additive, softDist, intensity) {
    return new THREE_.ShaderMaterial({
      vertexShader: PART_VERT,
      fragmentShader: PART_FRAG,
      uniforms: Object.assign({
        uSoftDist: { value: softDist },
        uAdditive: { value: additive ? 1 : 0 },
        uIntensity: { value: intensity },
      }, shared),
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: additive ? THREE_.AdditiveBlending : THREE_.NormalBlending,
      side: THREE_.DoubleSide,
    });
  }

  // ── particle pools ─────────────────────────────────────────────────────────
  const PATTR = [
    ['iOrig', 4], ['iVel', 4], ['iColA', 4], ['iColB', 4],
    ['iSim', 4], ['iVis', 4], ['iExtra', 4],
  ];

  function makePool(n, material, order) {
    const geo = new THREE_.InstancedBufferGeometry();
    geo.setIndex(quadIdx);
    geo.setAttribute('position', quadPos);
    geo.setAttribute('uv', quadUv);
    const a = {};
    for (const [name, sz] of PATTR) {
      const attr = new THREE_.InstancedBufferAttribute(new Float32Array(n * sz), sz);
      attr.setUsage(THREE_.DynamicDrawUsage);
      geo.setAttribute(name, attr);
      a[name] = attr;
    }
    geo.boundingSphere = INF_SPHERE;
    geo.instanceCount = 0;
    const mesh = new THREE_.Mesh(geo, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    return {
      n, geo, mesh, a,
      arr: {
        iOrig: a.iOrig.array, iVel: a.iVel.array, iColA: a.iColA.array,
        iColB: a.iColB.array, iSim: a.iSim.array, iVis: a.iVis.array, iExtra: a.iExtra.array,
      },
      head: 0, high: 0, until: -1,
      lo: Infinity, hi: -1,
    };
  }

  // Alpha before additive. Smoke is an occluder and must be composited first so
  // the fireball and the sparks sit *on* it; the reverse order makes every glow
  // look like it is behind its own smoke. Within the alpha pool particles are
  // written in spawn order and drawn in that order, which for an expanding burst
  // is already back-to-front from the point it was spawned at — a true per-frame
  // depth sort would mean rewriting the whole instance buffer every frame, which
  // is exactly the bandwidth this design exists to avoid.
  const matAlpha = particleMaterial(false, 0.45, 1.0);
  // Additive families are pushed past 1.0 deliberately: sparks, flashes and
  // fireballs are the only things in a dusk scene that are genuinely brighter
  // than the sky, and clamping them to white makes them read as paper cut-outs
  // sitting in front of the world. Over-range is also what the bloom pass is
  // looking for, so this is the one number that decides whether a hit glows.
  const matAdd = particleMaterial(true, 0.12, 2.4);
  const alphaPool = makePool(N_ALPHA, matAlpha, 10);
  const addPool = makePool(N_ADD, matAdd, 12);

  // The spawn record. One module-level object, filled and pushed; no allocation
  // anywhere on the path from an event to the GPU.
  const _p = {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    life: 1, drag: 1.5, grav: 1, stretch: 0, turb: 0,
    r0: 1, g0: 1, b0: 1, s0: 0.08,
    r1: 1, g1: 1, b1: 1, s1: 0.04,
    tile: T_PUFF, alpha: 1, rot: 0, fade: 1.6,
    floor: -1e6, rest: 0, spin: 0,
  };
  const c0 = (hex, m) => { m = m === undefined ? 1 : m; _p.r0 = ((hex >> 16) & 255) / 255 * m; _p.g0 = ((hex >> 8) & 255) / 255 * m; _p.b0 = (hex & 255) / 255 * m; };
  const c1 = (hex, m) => { m = m === undefined ? 1 : m; _p.r1 = ((hex >> 16) & 255) / 255 * m; _p.g1 = ((hex >> 8) & 255) / 255 * m; _p.b1 = (hex & 255) / 255 * m; };

  function push(pool) {
    const i = pool.head;
    pool.head = (pool.head + 1) % pool.n;
    if (i + 1 > pool.high) pool.high = i + 1;
    if (i < pool.lo) pool.lo = i;
    if (i > pool.hi) pool.hi = i;
    const o = i * 4, A = pool.arr;
    A.iOrig[o] = _p.x; A.iOrig[o + 1] = _p.y; A.iOrig[o + 2] = _p.z; A.iOrig[o + 3] = clock.t;
    A.iVel[o] = _p.vx; A.iVel[o + 1] = _p.vy; A.iVel[o + 2] = _p.vz; A.iVel[o + 3] = _p.life;
    A.iColA[o] = _p.r0; A.iColA[o + 1] = _p.g0; A.iColA[o + 2] = _p.b0; A.iColA[o + 3] = _p.s0;
    A.iColB[o] = _p.r1; A.iColB[o + 1] = _p.g1; A.iColB[o + 2] = _p.b1; A.iColB[o + 3] = _p.s1;
    A.iSim[o] = _p.drag; A.iSim[o + 1] = _p.grav; A.iSim[o + 2] = _p.stretch; A.iSim[o + 3] = _p.turb;
    A.iVis[o] = _p.tile; A.iVis[o + 1] = _p.alpha; A.iVis[o + 2] = _p.rot; A.iVis[o + 3] = _p.fade;
    A.iExtra[o] = _p.floor; A.iExtra[o + 1] = _p.rest; A.iExtra[o + 2] = _p.spin; A.iExtra[o + 3] = 0;
    const until = clock.t + _p.life;
    if (until > pool.until) pool.until = until;
  }

  function flushPool(pool) {
    if (pool.hi >= 0) {
      const start = pool.lo, count = pool.hi - pool.lo + 1;
      for (const [name] of PATTR) {
        const attr = pool.a[name];
        if (attr.clearUpdateRanges && count < pool.n) {
          attr.clearUpdateRanges();
          attr.addUpdateRange(start * 4, count * 4);
        }
        attr.needsUpdate = true;
      }
      pool.lo = Infinity; pool.hi = -1;
    }
    // A pool with nothing alive draws nothing at all — an idle scene must not
    // pay for the vertex shader of three thousand dead particles.
    pool.geo.instanceCount = clock.t < pool.until ? pool.high : 0;
  }

  function clearPool(pool) {
    pool.arr.iVel.fill(0);
    pool.arr.iOrig.fill(-1e9);
    for (const [name] of PATTR) {
      const attr = pool.a[name];
      if (attr.clearUpdateRanges) attr.clearUpdateRanges();
      attr.needsUpdate = true;
    }
    pool.head = 0; pool.high = 0; pool.until = -1; pool.lo = Infinity; pool.hi = -1;
    pool.geo.instanceCount = 0;
  }

  // ── atmosphere ─────────────────────────────────────────────────────────────
  // Two meshes and not one line of per-frame CPU work. Motes are additive
  // because a lit dust speck is a source, not an occluder; sand streaks are
  // alpha because a gust of sand genuinely hides what is behind it.
  const atmoU = {
    uTime: { value: 0 },
    uStretch: shared.uStretch,
    // uSpan is deliberately absent: it is the one uniform that differs between
    // the two atmosphere meshes, so each material supplies its own.
    uCam: { value: new THREE_.Vector3() },
    uWind: shared.uWind,
    uSunDir: { value: new THREE_.Vector3(0.42, -0.34, 0.62).normalize() },
    uSunCol: { value: new THREE_.Color(0xffcb8c) },
    uShadeCol: { value: new THREE_.Color(0x53617a) },
    uGround: { value: 0 },
    uAtlas: { value: atlasP },
    uGrid: shared.uGrid,
    uFogColor: shared.uFogColor,
    uFogDensity: shared.uFogDensity,
  };

  function makeAtmo(n, additive, intensity, span, fill) {
    const geo = new THREE_.InstancedBufferGeometry();
    geo.setIndex(quadIdx);
    geo.setAttribute('position', quadPos);
    geo.setAttribute('uv', quadUv);
    const rndA = new Float32Array(n * 4), cfg = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) fill(i, rndA, cfg);
    geo.setAttribute('aRnd', new THREE_.InstancedBufferAttribute(rndA, 4));
    geo.setAttribute('aCfg', new THREE_.InstancedBufferAttribute(cfg, 4));
    geo.boundingSphere = INF_SPHERE;
    geo.instanceCount = n;
    const mat = new THREE_.ShaderMaterial({
      vertexShader: ATMO_VERT,
      fragmentShader: ATMO_FRAG,
      uniforms: Object.assign({
        uSpan: { value: span },
        uAdditive: { value: additive ? 1 : 0 },
        uIntensity: { value: intensity },
      }, atmoU),
      transparent: true, depthWrite: false, depthTest: true,
      blending: additive ? THREE_.AdditiveBlending : THREE_.NormalBlending,
      side: THREE_.DoubleSide,
    });
    const mesh = new THREE_.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = additive ? 11 : 9;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    return mesh;
  }

  const HAZE_FRAC = 0.16;   // of the mote budget, spent on ground heat shimmer
  // The mote field is deliberately small — 20 m, not 60. A dust mote is
  // sub-pixel past about eight metres, so spreading the budget over a large
  // volume spends most of it on particles that never light a single pixel;
  // concentrating it near the camera is what makes the air visible.
  const moteMesh = makeAtmo(N_MOTE, true, 1.0, new THREE_.Vector3(20, 11, 20), (i, a, c) => {
    const haze = i < N_MOTE * HAZE_FRAC;
    a[i * 4] = rnd(); a[i * 4 + 1] = haze ? rnd() * 0.22 : Math.pow(rnd(), 1.6); a[i * 4 + 2] = rnd();
    a[i * 4 + 3] = haze ? 1 : 0;
    if (haze) {
      // Heat shimmer: broad, dim, warm, hugging the ground. Not a refraction —
      // this module cannot read the scene colour — but a low-contrast warm
      // gradient that breathes reads as rising air well enough at distance.
      // The alpha is deliberately at the edge of perception: shimmer you can
      // point at is fog, and fog is somebody else's pass.
      c[i * 4] = rr(0.8, 2.0); c[i * 4 + 1] = rr(0.05, 0.16);
      c[i * 4 + 2] = rnd(); c[i * 4 + 3] = rr(0.010, 0.026);
    } else {
      c[i * 4] = rr(0.022, 0.070); c[i * 4 + 1] = rr(0.12, 0.5);
      c[i * 4 + 2] = rnd(); c[i * 4 + 3] = rr(0.22, 0.80);
    }
  });
  const streakMesh = makeAtmo(N_STREAK, false, 1.0, new THREE_.Vector3(26, 5, 26), (i, a, c) => {
    // Weighted to the bottom of the band: wind-driven sand hugs the ground.
    a[i * 4] = rnd(); a[i * 4 + 1] = Math.pow(rnd(), 2.4); a[i * 4 + 2] = rnd(); a[i * 4 + 3] = 2;
    c[i * 4] = rr(0.012, 0.032); c[i * 4 + 1] = rr(1.6, 3.8);
    c[i * 4 + 2] = rnd(); c[i * 4 + 3] = rr(0.07, 0.24);
  });

  // ── decals ─────────────────────────────────────────────────────────────────
  const decalU = {
    uTime: { value: 0 },
    uAtlas: { value: atlasD },
    uGrid: { value: new THREE_.Vector2(DEC_COLS, DEC_ROWS) },
    uSunDir: { value: new THREE_.Vector3(0.42, -0.34, 0.62).normalize() },
    uSunCol: { value: new THREE_.Color(0x000000) },
    uAmbCol: { value: new THREE_.Color(0x3a4250) },
    uFogColor: shared.uFogColor,
    uFogDensity: shared.uFogDensity,
  };
  const decalGeo = new THREE_.InstancedBufferGeometry();
  decalGeo.setIndex(quadIdx);
  decalGeo.setAttribute('position', quadPos);
  decalGeo.setAttribute('uv', quadUv);
  const DATTR = ['dPos', 'dRight', 'dUp', 'dNrm', 'dTint'];
  const dA = {};
  for (const name of DATTR) {
    const attr = new THREE_.InstancedBufferAttribute(new Float32Array(N_DECAL * 4), 4);
    attr.setUsage(THREE_.DynamicDrawUsage);
    decalGeo.setAttribute(name, attr);
    dA[name] = attr;
  }
  decalGeo.boundingSphere = INF_SPHERE;
  decalGeo.instanceCount = 0;
  const decalMat = new THREE_.ShaderMaterial({
    vertexShader: DECAL_VERT, fragmentShader: DECAL_FRAG, uniforms: decalU,
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE_.NormalBlending, side: THREE_.DoubleSide,
    // The 1.2 cm normal offset handles the common case; polygon offset covers
    // the grazing angles where 1.2 cm of world space is sub-pixel in depth.
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
  });
  const decalMesh = new THREE_.Mesh(decalGeo, decalMat);
  decalMesh.frustumCulled = false;
  decalMesh.renderOrder = 5;
  decalMesh.matrixAutoUpdate = false;
  group.add(decalMesh);
  const decals = { head: 0, high: 0, lo: Infinity, hi: -1 };

  const _t1 = new THREE_.Vector3(), _t2 = new THREE_.Vector3(), _n = new THREE_.Vector3();

  function addDecal(x, y, z, nx, ny, nz, radius, tile, tint, alpha, life) {
    _n.set(nx, ny, nz);
    if (_n.lengthSq() < 1e-8) _n.set(0, 1, 0);
    _n.normalize();
    // Any two vectors perpendicular to the normal will do; picking the axis the
    // normal is *least* aligned with keeps the cross product well-conditioned.
    const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
    _t1.set(ay < ax && ay < az ? 0 : 1, ay < ax && ay < az ? 1 : 0, 0);
    if (az < ax && az < ay) _t1.set(0, 0, 1);
    _t1.crossVectors(_n, _t1).normalize();
    _t2.crossVectors(_n, _t1).normalize();
    // Random roll, so twenty holes in the same wall are twenty different holes.
    const ang = rnd() * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang);
    const rx = _t1.x * ca + _t2.x * sa, ry = _t1.y * ca + _t2.y * sa, rz = _t1.z * ca + _t2.z * sa;
    const ux = -_t1.x * sa + _t2.x * ca, uy = -_t1.y * sa + _t2.y * ca, uz = -_t1.z * sa + _t2.z * ca;

    const i = decals.head;
    decals.head = (decals.head + 1) % N_DECAL;
    if (i + 1 > decals.high) decals.high = i + 1;
    if (i < decals.lo) decals.lo = i;
    if (i > decals.hi) decals.hi = i;
    const o = i * 4;
    dA.dPos.array[o] = x + _n.x * 0.012; dA.dPos.array[o + 1] = y + _n.y * 0.012;
    dA.dPos.array[o + 2] = z + _n.z * 0.012; dA.dPos.array[o + 3] = clock.t;
    dA.dRight.array[o] = rx; dA.dRight.array[o + 1] = ry; dA.dRight.array[o + 2] = rz; dA.dRight.array[o + 3] = radius;
    dA.dUp.array[o] = ux; dA.dUp.array[o + 1] = uy; dA.dUp.array[o + 2] = uz; dA.dUp.array[o + 3] = life;
    dA.dNrm.array[o] = _n.x; dA.dNrm.array[o + 1] = _n.y; dA.dNrm.array[o + 2] = _n.z; dA.dNrm.array[o + 3] = tile;
    dA.dTint.array[o] = ((tint >> 16) & 255) / 255; dA.dTint.array[o + 1] = ((tint >> 8) & 255) / 255;
    dA.dTint.array[o + 2] = (tint & 255) / 255; dA.dTint.array[o + 3] = alpha;

    // Retire the decal four slots ahead of the write head. The oldest decal in a
    // ring buffer must fade out *before* it is overwritten, or a wall full of
    // holes visibly blinks one out every time you pull the trigger.
    const j = (decals.head + 3) % N_DECAL;
    const oj = j * 4;
    const born = dA.dPos.array[oj + 3];
    if (dA.dUp.array[oj + 3] > 0) {
      const shortened = clock.t - born + 0.9;
      if (shortened < dA.dUp.array[oj + 3]) {
        dA.dUp.array[oj + 3] = shortened;
        if (j < decals.lo) decals.lo = j;
        if (j > decals.hi) decals.hi = j;
      }
    }
  }

  function flushDecals() {
    if (decals.hi >= 0) {
      for (const name of DATTR) {
        const attr = dA[name];
        const count = decals.hi - decals.lo + 1;
        if (attr.clearUpdateRanges && count < N_DECAL) {
          attr.clearUpdateRanges();
          attr.addUpdateRange(decals.lo * 4, count * 4);
        }
        attr.needsUpdate = true;
      }
      decals.lo = Infinity; decals.hi = -1;
    }
    decalGeo.instanceCount = decals.high;
  }

  // ── tracers ────────────────────────────────────────────────────────────────
  const tracerU = { uTime: { value: 0 }, uColor: { value: new THREE_.Color(0xffd9a0) } };
  const tracerGeo = new THREE_.InstancedBufferGeometry();
  tracerGeo.setIndex(quadIdx);
  tracerGeo.setAttribute('position', quadPos);
  tracerGeo.setAttribute('uv', quadUv);
  const TATTR = ['tOrig', 'tDir', 'tCfg'];
  const tA = {};
  for (const name of TATTR) {
    const attr = new THREE_.InstancedBufferAttribute(new Float32Array(N_TRACER * 4), 4);
    attr.setUsage(THREE_.DynamicDrawUsage);
    tracerGeo.setAttribute(name, attr);
    tA[name] = attr;
  }
  tracerGeo.boundingSphere = INF_SPHERE;
  tracerGeo.instanceCount = 0;
  const tracerMesh = new THREE_.Mesh(tracerGeo, new THREE_.ShaderMaterial({
    vertexShader: TRACER_VERT, fragmentShader: TRACER_FRAG, uniforms: tracerU,
    transparent: true, depthWrite: false, blending: THREE_.AdditiveBlending, side: THREE_.DoubleSide,
  }));
  tracerMesh.frustumCulled = false;
  tracerMesh.renderOrder = 12;
  tracerMesh.matrixAutoUpdate = false;
  group.add(tracerMesh);
  const tracers = { head: 0, high: 0, until: -1 };

  // 420 m/s is a lie in both directions: a real 5.56 round leaves the barrel at
  // 900 and is gone before the frame ends, while the tracers players remember
  // from films crawl. This is fast enough to be a snap and slow enough that the
  // eye catches the direction, which is the only job a tracer has.
  const TRACER_SPEED = 420, TRACER_LEN = 5.5;

  function addTracer(ox, oy, oz, dx, dy, dz, dist) {
    const i = tracers.head;
    tracers.head = (tracers.head + 1) % N_TRACER;
    if (i + 1 > tracers.high) tracers.high = i + 1;
    const o = i * 4;
    tA.tOrig.array[o] = ox; tA.tOrig.array[o + 1] = oy; tA.tOrig.array[o + 2] = oz; tA.tOrig.array[o + 3] = clock.t;
    tA.tDir.array[o] = dx; tA.tDir.array[o + 1] = dy; tA.tDir.array[o + 2] = dz; tA.tDir.array[o + 3] = dist;
    const life = dist / TRACER_SPEED + TRACER_LEN / TRACER_SPEED + 0.02;
    tA.tCfg.array[o] = TRACER_SPEED; tA.tCfg.array[o + 1] = life;
    tA.tCfg.array[o + 2] = 0.045; tA.tCfg.array[o + 3] = TRACER_LEN;
    for (const name of TATTR) tA[name].needsUpdate = true;
    if (clock.t + life > tracers.until) tracers.until = clock.t + life;
  }

  // ── shell casings ──────────────────────────────────────────────────────────
  // The one thing in this file simulated on the CPU, because a casing has to
  // actually hit the world: the whole point of it is the ping when it lands,
  // and a ping that fires at the wrong moment is worse than no ping.
  const casingMat = new THREE_.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.92, roughness: 0.34 });
  const casingGeo = new THREE_.CylinderGeometry(0.0046, 0.0052, 0.023, 6, 1);
  const casingMesh = new THREE_.InstancedMesh(casingGeo, casingMat, N_CASING);
  casingMesh.frustumCulled = false;
  casingMesh.castShadow = false;
  casingMesh.instanceMatrix.setUsage(THREE_.DynamicDrawUsage);
  group.add(casingMesh);

  // Flat arrays rather than an array of objects: 32 casings is nothing, but the
  // habit is what keeps the hot path free of hidden-class churn.
  const cas = {
    pos: new Float32Array(N_CASING * 3),
    vel: new Float32Array(N_CASING * 3),
    quat: new Float32Array(N_CASING * 4),
    spin: new Float32Array(N_CASING * 3),
    t: new Float32Array(N_CASING),          // age
    state: new Uint8Array(N_CASING),        // 0 dead, 1 flying, 2 at rest
    bounces: new Uint8Array(N_CASING),
    head: 0, live: 0,
  };
  for (let i = 0; i < N_CASING; i++) cas.quat[i * 4 + 3] = 1;

  const _cq = new THREE_.Quaternion(), _cq2 = new THREE_.Quaternion();
  const _cv = new THREE_.Vector3(), _cs = new THREE_.Vector3(1, 1, 1);
  const _cm = new THREE_.Matrix4();
  const _ro = { x: 0, y: 0, z: 0 }, _rd = { x: 0, y: 0, z: 0 };

  function ejectCasing(x, y, z, rx, ry, rz, fx, fy, fz, vx, vy, vz) {
    const i = cas.head;
    cas.head = (cas.head + 1) % N_CASING;
    const o = i * 3;
    cas.pos[o] = x; cas.pos[o + 1] = y; cas.pos[o + 2] = z;
    // Out of the port, up and slightly forward, plus whatever the player is
    // already doing — a casing that ignores the shooter's velocity looks like it
    // was dropped by the level, not by the gun.
    const sp = rr(2.1, 3.0), up = rr(1.5, 2.3);
    cas.vel[o] = rx * sp + fx * 0.4 + vx;
    cas.vel[o + 1] = up + fy * 0.4 + vy;
    cas.vel[o + 2] = rz * sp + fz * 0.4 + vz;
    void ry;
    cas.spin[o] = sym(34); cas.spin[o + 1] = sym(26); cas.spin[o + 2] = sym(34);
    const q = i * 4;
    cas.quat[q] = 0; cas.quat[q + 1] = 0; cas.quat[q + 2] = 0; cas.quat[q + 3] = 1;
    cas.t[i] = 0; cas.state[i] = 1; cas.bounces[i] = 0;
  }

  const CASING_LIFE = 16;

  function stepCasings(dt) {
    let anyLive = 0;
    for (let i = 0; i < N_CASING; i++) {
      if (!cas.state[i]) continue;
      anyLive++;
      cas.t[i] += dt;
      if (cas.t[i] > CASING_LIFE) { cas.state[i] = 0; continue; }
      if (cas.state[i] === 2) continue;   // asleep: still drawn, no longer stepped

      const o = i * 3;
      cas.vel[o + 1] += C.GRAVITY * dt;
      let mx = cas.vel[o] * dt, my = cas.vel[o + 1] * dt, mz = cas.vel[o + 2] * dt;
      const len = Math.hypot(mx, my, mz);
      if (len > 1e-6 && G.world.grid) {
        _ro.x = cas.pos[o]; _ro.y = cas.pos[o + 1]; _ro.z = cas.pos[o + 2];
        _rd.x = mx / len; _rd.y = my / len; _rd.z = mz / len;
        const hit = raycast(G.world, _ro, _rd, len + 0.012);
        if (hit) {
          const back = 0.010;
          cas.pos[o] = hit.point.x + hit.normal.x * back;
          cas.pos[o + 1] = hit.point.y + hit.normal.y * back;
          cas.pos[o + 2] = hit.point.z + hit.normal.z * back;
          const vn = cas.vel[o] * hit.normal.x + cas.vel[o + 1] * hit.normal.y + cas.vel[o + 2] * hit.normal.z;
          const speed = Math.hypot(cas.vel[o], cas.vel[o + 1], cas.vel[o + 2]);
          // Brass is light and hard: it keeps almost no normal energy and a lot
          // of tangential, which is why casings skitter rather than bounce.
          const rest = 0.34, fric = 0.62;
          cas.vel[o] = (cas.vel[o] - hit.normal.x * vn * (1 + rest)) * fric;
          cas.vel[o + 1] = (cas.vel[o + 1] - hit.normal.y * vn * (1 + rest)) * fric;
          cas.vel[o + 2] = (cas.vel[o + 2] - hit.normal.z * vn * (1 + rest)) * fric;
          cas.spin[o] *= 0.55; cas.spin[o + 1] *= 0.55; cas.spin[o + 2] *= 0.55;
          cas.bounces[i]++;
          if (speed > 0.7) {
            // The audio layer owns the sound; FX only reports that brass met
            // concrete, how hard, and on what.
            emit(G, 'casingHit', {
              pos: { x: cas.pos[o], y: cas.pos[o + 1], z: cas.pos[o + 2] },
              surface: hit.surface, speed,
            });
          }
          if (cas.bounces[i] >= 4 || Math.hypot(cas.vel[o], cas.vel[o + 1], cas.vel[o + 2]) < 0.45) {
            cas.state[i] = 2;
            // Lie flat. A casing standing on end is a physics bug the eye finds
            // instantly, so the settle pose is authored, not simulated.
            _cq.setFromAxisAngle(_cv.set(0, 0, 1), Math.PI / 2);
            _cq2.setFromAxisAngle(_cv.set(0, 1, 0), rnd() * 6.283);
            _cq.premultiply(_cq2);
            const q = i * 4;
            cas.quat[q] = _cq.x; cas.quat[q + 1] = _cq.y; cas.quat[q + 2] = _cq.z; cas.quat[q + 3] = _cq.w;
          }
          continue;
        }
      }
      cas.pos[o] += mx; cas.pos[o + 1] += my; cas.pos[o + 2] += mz;
      // Integrate the tumble as a quaternion delta; euler angles would gimbal
      // exactly where a spinning casing spends most of its time.
      const q = i * 4;
      _cq.set(cas.quat[q], cas.quat[q + 1], cas.quat[q + 2], cas.quat[q + 3]);
      _cv.set(cas.spin[o] * dt, cas.spin[o + 1] * dt, cas.spin[o + 2] * dt);
      const ang = _cv.length();
      if (ang > 1e-6) {
        _cq2.setFromAxisAngle(_cv.divideScalar(ang), ang);
        _cq.premultiply(_cq2).normalize();
        cas.quat[q] = _cq.x; cas.quat[q + 1] = _cq.y; cas.quat[q + 2] = _cq.z; cas.quat[q + 3] = _cq.w;
      }
      if (cas.pos[o + 1] < G.world.bounds.min.y) cas.state[i] = 0;
    }
    cas.live = anyLive;
  }

  function syncCasings() {
    if (!cas.live && !casingMesh.visible) return;
    casingMesh.visible = cas.live > 0;
    for (let i = 0; i < N_CASING; i++) {
      const o = i * 3, q = i * 4;
      if (!cas.state[i]) {
        _cm.makeScale(0, 0, 0);
      } else {
        // Fade out by shrinking in the last second, so a recycled slot never
        // pops out of existence in front of the player.
        const s = cas.t[i] > CASING_LIFE - 1 ? Math.max(0, CASING_LIFE - cas.t[i]) : 1;
        _cq.set(cas.quat[q], cas.quat[q + 1], cas.quat[q + 2], cas.quat[q + 3]);
        _cv.set(cas.pos[o], cas.pos[o + 1], cas.pos[o + 2]);
        _cs.set(s, s, s);
        _cm.compose(_cv, _cq, _cs);
      }
      casingMesh.setMatrixAt(i, _cm);
    }
    casingMesh.instanceMatrix.needsUpdate = true;
  }

  // ── dynamic lights ─────────────────────────────────────────────────────────
  // These live directly on the scene and are *never* removed or made invisible.
  // Three hashes the visible-light counts into the program cache key, so toggling
  // a light's visibility recompiles every material in the scene — a 200 ms hitch
  // on the first shot. Idle lights sit at intensity 0 instead, which costs one
  // dead loop iteration per fragment and nothing else.
  const lights = [];
  for (let i = 0; i < N_LIGHT; i++) {
    const l = new THREE_.PointLight(0xffc27a, 0, 14, 2);
    l.castShadow = false;
    engine.scene.add(l);
    lights.push({ light: l, t: 0, dur: 0, peak: 0, hue: 0xffc27a });
  }
  let lightHead = 0;
  const _lc = new THREE_.Color();

  function flash(x, y, z, peak, dur, hex, range) {
    const s = lights[lightHead];
    lightHead = (lightHead + 1) % lights.length;
    s.light.position.set(x, y, z);
    s.light.color.set(hex);
    s.light.distance = range;
    s.peak = peak; s.dur = dur; s.t = 0;
    s.light.intensity = peak;
  }

  function stepLights(dt) {
    for (let i = 0; i < lights.length; i++) {
      const s = lights[i];
      if (s.dur <= 0) continue;
      s.t += dt;
      if (s.t >= s.dur) { s.dur = 0; s.light.intensity = 0; continue; }
      // A muzzle flash is not a fade — it is a spike with a short tail. Squaring
      // the remaining fraction is what makes it read as ignition rather than as
      // someone turning a lamp down.
      const k = 1 - s.t / s.dur;
      s.light.intensity = s.peak * k * k;
    }
    void _lc;
  }

  // ── shockwave shells ───────────────────────────────────────────────────────
  const waveGeo = new THREE_.SphereGeometry(1, 20, 12);
  const waves = [];
  for (let i = 0; i < 2; i++) {
    const mat = new THREE_.ShaderMaterial({
      vertexShader: WAVE_VERT, fragmentShader: WAVE_FRAG,
      uniforms: { uColor: { value: new THREE_.Color(0xffd9a8) }, uAlpha: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE_.AdditiveBlending,
      side: THREE_.DoubleSide,
    });
    const m = new THREE_.Mesh(waveGeo, mat);
    m.frustumCulled = false;
    m.renderOrder = 13;
    m.visible = false;
    group.add(m);
    waves.push({ mesh: m, mat, t: 0, dur: 0, r0: 0, r1: 1 });
  }
  let waveHead = 0;

  function shockwave(x, y, z, radius, dur) {
    const w = waves[waveHead];
    waveHead = (waveHead + 1) % waves.length;
    w.mesh.position.set(x, y, z);
    w.t = 0; w.dur = dur; w.r0 = radius * 0.15; w.r1 = radius;
    w.mesh.visible = true;
  }

  function stepWaves(dt) {
    for (let i = 0; i < waves.length; i++) {
      const w = waves[i];
      if (w.dur <= 0) continue;
      w.t += dt;
      if (w.t >= w.dur) { w.dur = 0; w.mesh.visible = false; w.mat.uniforms.uAlpha.value = 0; continue; }
      const k = w.t / w.dur;
      // Expands fast then decelerates, exactly like a real blast front losing
      // energy to the air. Linear expansion looks like an animated circle.
      const e = 1 - Math.pow(1 - k, 2.6);
      const r = w.r0 + (w.r1 - w.r0) * e;
      w.mesh.scale.setScalar(r);
      w.mat.uniforms.uAlpha.value = Math.pow(1 - k, 1.8) * 0.38;
    }
  }

  // ── impact recipes ─────────────────────────────────────────────────────────
  //
  // Every surface gets its own read, and the differences are deliberately
  // exaggerated: in the 200 ms a player actually looks at an impact, only the
  // three loudest cues survive — colour, whether anything glows, and how fast
  // the debris slows down. Concrete is grey, dull and lingers; metal is white,
  // hot and streaks; sand is brown, heavy and stops.

  const _dir = { x: 0, y: 0, z: 0 };
  const _up = { x: 0, y: 1, z: 0 };

  // A random direction inside a cone about (nx,ny,nz). Writes into `_dir`; the
  // spread parameter is the sine of the half-angle, so 1 is a full hemisphere.
  function cone(nx, ny, nz, spread) {
    let ux = 0, uy = 0, uz = 0;
    if (Math.abs(ny) < 0.9) { ux = -nz; uz = nx; } else { ux = 1; }
    let l = Math.hypot(ux, uy, uz) || 1; ux /= l; uy /= l; uz /= l;
    const bx = ny * uz - nz * uy, by = nz * ux - nx * uz, bz = nx * uy - ny * ux;
    const a = rnd() * Math.PI * 2, r = spread * Math.sqrt(rnd());
    const cx = Math.cos(a) * r, cy = Math.sin(a) * r;
    const k = Math.sqrt(Math.max(0, 1 - r * r));
    _dir.x = nx * k + ux * cx + bx * cy;
    _dir.y = ny * k + uy * cx + by * cy;
    _dir.z = nz * k + uz * cx + bz * cy;
    l = Math.hypot(_dir.x, _dir.y, _dir.z) || 1;
    _dir.x /= l; _dir.y /= l; _dir.z /= l;
    void _up;
  }

  // Where the debris from this hit will land. A wall hit throws chips that
  // bounce on the floor below the wall, not on the wall itself.
  function floorUnder(x, y, z) {
    if (!G.world.grid) return y - 1.6;
    const g = groundBelow(G.world, x, y + 0.02, z, 8);
    return g ? g.y : y - 1.6;
  }

  const RECIPE = {};

  RECIPE[S.CONCRETE] = (x, y, z, nx, ny, nz, dx, dy, dz, e, fy) => {
    const n = Math.round(7 * e);
    for (let i = 0; i < n; i++) {
      cone(nx, ny, nz, 0.85);
      const sp = rr(2.6, 8.5) * e;
      _p.x = x; _p.y = y; _p.z = z;
      _p.vx = _dir.x * sp; _p.vy = _dir.y * sp + rr(0.4, 1.6); _p.vz = _dir.z * sp;
      _p.life = rr(0.7, 1.5); _p.drag = 0.6; _p.grav = 1; _p.stretch = 0.6; _p.turb = 0;
      c0(0xa9a296); c1(0x6a6459);
      _p.s0 = rr(0.022, 0.045); _p.s1 = _p.s0 * 0.8;
      _p.tile = T_CHIP; _p.alpha = 1; _p.rot = rnd() * 6.28; _p.fade = 0.6;
      _p.floor = fy; _p.rest = rr(0.25, 0.45); _p.spin = sym(18);
      push(alphaPool);
    }
    // The prompt puff: fast, bright, gone in a third of a second.
    for (let i = 0; i < 2; i++) {
      cone(nx, ny, nz, 0.6);
      _p.x = x + nx * 0.03; _p.y = y + ny * 0.03; _p.z = z + nz * 0.03;
      const sp = rr(0.8, 2.2);
      _p.vx = _dir.x * sp; _p.vy = _dir.y * sp; _p.vz = _dir.z * sp;
      _p.life = rr(0.25, 0.45); _p.drag = 7; _p.grav = -0.02; _p.stretch = 0; _p.turb = 0;
      c0(0xd8d2c6); c1(0x8b857a);
      _p.s0 = rr(0.22, 0.36); _p.s1 = _p.s0 * 2.6;
      _p.tile = T_PUFF; _p.alpha = 0.5; _p.rot = rnd() * 6.28; _p.fade = 1.6;
      _p.floor = -1e6; _p.rest = 0; _p.spin = 0;
      push(alphaPool);
    }
    // And the dust that stays. This is the part that makes concrete concrete:
    // a cloud that hangs, thins and drifts on the wind for two seconds after
    // everything else has finished.
    for (let i = 0; i < Math.round(4 * e); i++) {
      cone(nx, ny, nz, 1.0);
      const sp = rr(0.2, 1.1);
      _p.x = x + sym(0.06); _p.y = y + sym(0.06); _p.z = z + sym(0.06);
      _p.vx = _dir.x * sp; _p.vy = _dir.y * sp * 0.4 + 0.25; _p.vz = _dir.z * sp;
      _p.life = rr(1.6, 3.0); _p.drag = 1.6; _p.grav = 0.03; _p.stretch = 0; _p.turb = 0.5;
      c0(0xc3bcae); c1(0x7f7a70);
      _p.s0 = rr(0.28, 0.48); _p.s1 = _p.s0 * rr(3.0, 4.5);
      _p.tile = T_SMOKE; _p.alpha = rr(0.14, 0.26); _p.rot = rnd() * 6.28; _p.fade = 1.9;
      _p.floor = -1e6; _p.rest = 0; _p.spin = sym(0.4);
      push(alphaPool);
    }
    addDecal(x, y, z, nx, ny, nz, rr(0.055, 0.085), D_CONCRETE, 0x6e6a63, 0.95, 55);
  };

  RECIPE[S.METAL] = (x, y, z, nx, ny, nz, dx, dy, dz, e, fy) => {
    // Sparks. The colour ramp is the effect: incandescent white at birth, then
    // yellow, then a deep orange as the fragment radiates its heat away in
    // under a second. Two colours and a lerp buy the whole black-body curve.
    const n = Math.round(14 * e);
    for (let i = 0; i < n; i++) {
      // Biased around the reflection of the incoming round rather than the
      // normal — sparks come off the ricochet, and this is why a shot into
      // steel throws its sparks *back down the range* at you.
      const d = dx * nx + dy * ny + dz * nz;
      const rx = dx - 2 * d * nx, ry = dy - 2 * d * ny, rz = dz - 2 * d * nz;
      cone(rx, ry, rz, 0.62);
      const sp = rr(4, 15) * e;
      _p.x = x; _p.y = y; _p.z = z;
      _p.vx = _dir.x * sp; _p.vy = _dir.y * sp + rr(0, 1.2); _p.vz = _dir.z * sp;
      _p.life = rr(0.24, 0.70); _p.drag = 1.4; _p.grav = 0.85;
      // Stretch is tuned *shorter* than the physically correct 1/60 s smear.
      // The honest length reads as a scratch on the lens; a little under it
      // reads as a spark, because the eye expects a bright head with a hint of
      // tail rather than a uniform hairline.
      _p.stretch = rr(0.45, 0.80); _p.turb = 0;
      c0(0xfff0c4); c1(0xd4300a);
      _p.s0 = rr(0.035, 0.062); _p.s1 = _p.s0 * 0.4;
      _p.tile = T_STREAK; _p.alpha = 1; _p.rot = 0; _p.fade = 0.55;
      _p.floor = fy; _p.rest = rr(0.35, 0.6); _p.spin = 0;
      push(addPool);
    }
    // The strike flash. One frame of white where the round bit; without it the
    // sparks look like they were spawned by nothing.
    _p.x = x + nx * 0.02; _p.y = y + ny * 0.02; _p.z = z + nz * 0.02;
    _p.vx = _p.vy = _p.vz = 0;
    _p.life = 0.07; _p.drag = 1; _p.grav = 0; _p.stretch = 0; _p.turb = 0;
    c0(0xffffff); c1(0xffb15a);
    _p.s0 = rr(0.42, 0.62); _p.s1 = 0.08;
    _p.tile = T_GLOW; _p.alpha = 1; _p.rot = rnd() * 6.28; _p.fade = 1.2;
    _p.floor = -1e6; _p.rest = 0; _p.spin = 0;
    push(addPool);
    // Fragments of the metal itself — dark, few, no glow. No dust: steel does
    // not make dust, and adding a puff here is the classic way to make every
    // surface in a game feel like painted concrete.
    for (let i = 0; i < Math.round(3 * e); i++) {
      cone(nx, ny, nz, 0.8);
      const sp = rr(2, 6);
      _p.x = x; _p.y = y; _p.z = z;
      _p.vx = _dir.x * sp; _p.vy = _dir.y * sp + 0.8; _p.vz = _dir.z * sp;
      _p.life = rr(0.6, 1.2); _p.drag = 0.7; _p.grav = 1; _p.stretch = 0.4; _p.turb = 0;
      c0(0x8d8f92); c1(0x4a4c50);
      _p.s0 = rr(0.014, 0.026); _p.s1 = _p.s0;
      _p.tile = T_CHIP; _p.alpha = 1; _p.rot = rnd() * 6.28; _p.fade = 0.6;
      _p.floor = fy; _p.rest = 0.4; _p.spin = sym(24);
      push(alphaPool);
    }
    if (e > 0.5) flash(x + nx * 0.15, y + ny * 0.15, z + nz * 0.15, 3.5 * e, 0.07, 0xffd9a0, 4.5);
    addDecal(x, y, z, nx, ny, nz, rr(0.038, 0.055), D_METAL, 0x8e8b86, 0.95, 55);
  };

  RECIPE[S.SAND] = (x, y, z, nx, ny, nz, dx, dy, dz, e, fy) => {
    for (let i = 0; i < Math.round(11 * e); i++) {
      cone(nx, ny, nz, 0.7);
      const sp = rr(1.6, 5.2) * e;
      _p.x = x; _p.y = y; _p.z = z;
      _p.vx = _dir.x * sp; _p.vy = _dir.y * sp + rr(0.5, 2.0); _p.vz = _dir.z * sp;
      // Heavy and high-drag: grains lose their speed almost immediately and
      // then just fall. That deceleration is the entire read of "sand".
      _p.life = rr(0.6, 1.2); _p.drag = 2.4; _p.grav = 1; _p.stretch = 0.3; _p.turb = 0;
      c0(0xc7a878); c1(0x8a6f47);
      _p.s0 = rr(0.022, 0.042); _p.s1 = _p.s0 * 0.9;
      _p.tile = T_CHIP; _p.alpha = 1; _p.rot = rnd() * 6.28; _p.fade = 0.8;
      _p.floor = fy; _p.rest = 0.08; _p.spin = sym(10);
      push(alphaPool);
    }
    for (let i = 0; i < Math.round(5 * e); i++) {
      cone(nx, ny, nz, 0.9);
      const sp = rr(0.5, 1.9);
      _p.x = x; _p.y = y; _p.z = z;
      _p.vx = _dir.x * sp; _p.vy = _dir.y * sp * 0.7 + 0.5; _p.vz = _dir.z * sp;
      _p.life = rr(0.9, 1.8); _p.drag = 3.2; _p.grav = 0.22; _p.stretch = 0; _p.turb = 0.25;
      c0(0xd9bb8b); c1(0x9c8158);
      _p.s0 = rr(0.30, 0.52); _p.s1 = _p.s0 * rr(2.2, 3.2);
      _p.tile = T_PUFF; _p.alpha = rr(0.35, 0.6); _p.rot = rnd() * 6.28; _p.fade = 1.5;
      _p.floor = -1e6; _p.rest = 0; _p.spin = 0;
      push(alphaPool);
    }
    addDecal(x, y, z, nx, ny, nz, rr(0.10, 0.16), D_SAND, 0x8b7350, 0.6, 30);
  };

  RECIPE[S.WOOD] = (x, y, z, nx, ny, nz, dx, dy, dz, e, fy) => {
    for (let i = 0; i < Math.round(8 * e); i++) {
      cone(nx, ny, nz, 0.75);
      const sp = rr(2.4, 7.5) * e;
      _p.x = x; _p.y = y; _p.z = z;
      _p.vx = _dir.x * sp; _p.vy = _dir.y * sp + rr(0.3, 1.5); _p.vz = _dir.z * sp;
      _p.life = rr(0.8, 1.6); _p.drag = 1.1; _p.grav = 0.9;
      // Splinters are drawn on the shard tile and spun hard: a long thin
      // fragment tumbling end over end is unmistakably wood.
      _p.stretch = 0; _p.turb = 0.1;
      c0(0xa8763f); c1(0x5f4223);
      _p.s0 = rr(0.030, 0.062); _p.s1 = _p.s0;
      _p.tile = T_SHARD; _p.alpha = 1; _p.rot = rnd() * 6.28; _p.fade = 0.7;
      _p.floor = fy; _p.rest = 0.22; _p.spin = sym(26);
      push(alphaPool);
    }
    for (let i = 0; i < 3; i++) {
      cone(nx, ny, nz, 0.8);
      const sp = rr(0.4, 1.5);
      _p.x = x; _p.y = y; _p.z = z;
      _p.vx = _dir.x * sp; _p.vy = _dir.y * sp + 0.3; _p.vz = _dir.z * sp;
      _p.life = rr(0.7, 1.4); _p.drag = 4; _p.grav = 0.05; _p.stretch = 0; _p.turb = 0.4;
      c0(0xd6b483); c1(0x93764f);
      _p.s0 = rr(0.20, 0.34); _p.s1 = _p.s0 * 2.8;
      _p.tile = T_SMOKE; _p.alpha = 0.30; _p.rot = rnd() * 6.28; _p.fade = 1.7;
      _p.floor = -1e6; _p.rest = 0; _p.spin = 0;
      push(alphaPool);
    }
    addDecal(x, y, z, nx, ny, nz, rr(0.05, 0.08), D_WOOD, 0x4b3218, 0.92, 55);
  };

  RECIPE[S.GLASS] = (x, y, z, nx, ny, nz, dx, dy, dz, e, fy) => {
    for (let i = 0; i < Math.round(13 * e); i++) {
      cone(nx, ny, nz, 0.95);
      const sp = rr(3, 9) * e;
      _p.x = x; _p.y = y; _p.z = z;
      _p.vx = _dir.x * sp; _p.vy = _dir.y * sp + rr(0.2, 1.4); _p.vz = _dir.z * sp;
      _p.life = rr(0.9, 1.7); _p.drag = 0.5; _p.grav = 1; _p.stretch = 0.3; _p.turb = 0;
      c0(0xe8f6ff); c1(0x9fc0d0);
      _p.s0 = rr(0.020, 0.042); _p.s1 = _p.s0;
      _p.tile = T_SHARD; _p.alpha = 0.9; _p.rot = rnd() * 6.28; _p.fade = 0.5;
      _p.floor = fy; _p.rest = 0.30; _p.spin = sym(30);
      push(alphaPool);
    }
    // Glints. Shards catching the low sun as they tumble is what sells glass,
    // and it is cheap: a handful of additive sparkles on the same trajectories.
    for (let i = 0; i < Math.round(6 * e); i++) {
      cone(nx, ny, nz, 0.95);
      const sp = rr(3, 9) * e;
      _p.x = x; _p.y = y; _p.z = z;
      _p.vx = _dir.x * sp; _p.vy = _dir.y * sp + 0.8; _p.vz = _dir.z * sp;
      _p.life = rr(0.4, 0.9); _p.drag = 0.5; _p.grav = 1; _p.stretch = 0.5; _p.turb = 0;
      c0(0xffffff); c1(0x8fc8ff);
      _p.s0 = rr(0.024, 0.044); _p.s1 = 0.008;
      _p.tile = T_GLOW; _p.alpha = 0.9; _p.rot = 0; _p.fade = 1.0;
      _p.floor = fy; _p.rest = 0.3; _p.spin = 0;
      push(addPool);
    }
    _p.x = x; _p.y = y; _p.z = z; _p.vx = _p.vy = _p.vz = 0;
    _p.life = 0.09; _p.drag = 1; _p.grav = 0; _p.stretch = 0; _p.turb = 0;
    c0(0xffffff); c1(0xbfe4ff);
    _p.s0 = 0.34; _p.s1 = 0.06; _p.tile = T_GLOW; _p.alpha = 0.9; _p.rot = 0; _p.fade = 1.4;
    _p.floor = -1e6; _p.rest = 0; _p.spin = 0;
    push(addPool);
    addDecal(x, y, z, nx, ny, nz, rr(0.14, 0.22), D_GLASS, 0xbcd6e4, 0.85, 55);
  };

  RECIPE[S.FLESH] = (x, y, z, nx, ny, nz, dx, dy, dz, e, fy) => {
    // The spray follows the *bullet*, not the surface normal. Blood leaves a
    // body along the path the round took through it, and getting this backwards
    // is the difference between a wound and a paint splash.
    for (let i = 0; i < Math.round(16 * e); i++) {
      cone(dx, dy, dz, 0.42);
      const sp = rr(1.5, 7) * e;
      _p.x = x; _p.y = y; _p.z = z;
      _p.vx = _dir.x * sp; _p.vy = _dir.y * sp + rr(-0.2, 1.0); _p.vz = _dir.z * sp;
      _p.life = rr(0.35, 0.9); _p.drag = 2.8; _p.grav = 1; _p.stretch = 0.8; _p.turb = 0;
      c0(0xa3140f); c1(0x4a0705);
      _p.s0 = rr(0.024, 0.055); _p.s1 = _p.s0 * 0.7;
      _p.tile = T_DROP; _p.alpha = 1; _p.rot = rnd() * 6.28; _p.fade = 1.0;
      _p.floor = fy; _p.rest = 0; _p.spin = sym(12);
      push(alphaPool);
    }
    // The mist: fine, atomised, hangs for a beat and is gone. This is the part
    // the eye reads as "that hit something alive".
    for (let i = 0; i < Math.round(5 * e); i++) {
      cone(dx, dy, dz, 0.7);
      const sp = rr(0.6, 2.6);
      _p.x = x; _p.y = y; _p.z = z;
      _p.vx = _dir.x * sp; _p.vy = _dir.y * sp + 0.2; _p.vz = _dir.z * sp;
      _p.life = rr(0.45, 0.9); _p.drag = 5; _p.grav = 0.25; _p.stretch = 0; _p.turb = 0.15;
      c0(0xb8231a); c1(0x5e0d09);
      _p.s0 = rr(0.22, 0.40); _p.s1 = _p.s0 * 2.2;
      _p.tile = T_MIST; _p.alpha = rr(0.35, 0.6); _p.rot = rnd() * 6.28; _p.fade = 1.6;
      _p.floor = -1e6; _p.rest = 0; _p.spin = 0;
      push(alphaPool);
    }
    // Splatter lands on whatever was behind the target, along the bullet line.
    if (G.world.grid) {
      _ro.x = x + dx * 0.05; _ro.y = y + dy * 0.05; _ro.z = z + dz * 0.05;
      _rd.x = dx; _rd.y = dy; _rd.z = dz;
      const back = raycast(G.world, _ro, _rd, 3.5);
      if (back) {
        addDecal(back.point.x, back.point.y, back.point.z,
          back.normal.x, back.normal.y, back.normal.z,
          rr(0.18, 0.34), D_BLOOD_A + ((rnd() * 3) | 0), 0x5c0a07, 0.9, 40);
      }
    }
  };

  RECIPE[S.FOLIAGE] = (x, y, z, nx, ny, nz, dx, dy, dz, e) => {
    for (let i = 0; i < Math.round(9 * e); i++) {
      cone(dx, dy, dz, 0.8);
      const sp = rr(1.2, 4);
      _p.x = x; _p.y = y; _p.z = z;
      _p.vx = _dir.x * sp; _p.vy = _dir.y * sp + rr(0, 1); _p.vz = _dir.z * sp;
      // High drag and almost no gravity: a leaf does not fall, it flutters, and
      // the turbulence term does the fluttering for free.
      _p.life = rr(1.4, 2.8); _p.drag = 4.5; _p.grav = 0.10; _p.stretch = 0; _p.turb = 0.9;
      c0(0x6f8f3f); c1(0x3d5322);
      _p.s0 = rr(0.032, 0.065); _p.s1 = _p.s0;
      _p.tile = T_LEAF; _p.alpha = 1; _p.rot = rnd() * 6.28; _p.fade = 1.2;
      _p.floor = -1e6; _p.rest = 0; _p.spin = sym(9);
      push(alphaPool);
    }
    for (let i = 0; i < 2; i++) {
      _p.x = x + sym(0.05); _p.y = y + sym(0.05); _p.z = z + sym(0.05);
      _p.vx = sym(0.4); _p.vy = rr(0.1, 0.5); _p.vz = sym(0.4);
      _p.life = rr(0.6, 1.2); _p.drag = 4; _p.grav = 0.02; _p.stretch = 0; _p.turb = 0.5;
      c0(0x9fb572); c1(0x6c7f4c);
      _p.s0 = 0.20; _p.s1 = 0.52;
      _p.tile = T_SMOKE; _p.alpha = 0.16; _p.rot = rnd() * 6.28; _p.fade = 1.8;
      _p.floor = -1e6; _p.rest = 0; _p.spin = 0;
      push(alphaPool);
    }
  };

  RECIPE[S.WATER] = (x, y, z, nx, ny, nz, dx, dy, dz, e) => {
    // A crown, not a burst: water thrown up by an impact leaves as a ring of
    // droplets around the entry point and comes straight back down.
    for (let i = 0; i < Math.round(16 * e); i++) {
      const a = rnd() * Math.PI * 2, tilt = rr(0.15, 0.5);
      const sp = rr(2.2, 5.5) * e;
      _p.x = x; _p.y = y; _p.z = z;
      _p.vx = Math.cos(a) * tilt * sp; _p.vy = sp * (1 - tilt * 0.5); _p.vz = Math.sin(a) * tilt * sp;
      _p.life = rr(0.5, 1.0); _p.drag = 0.9; _p.grav = 1; _p.stretch = 0.6; _p.turb = 0;
      c0(0xdff0f7); c1(0x8fb6c6);
      _p.s0 = rr(0.024, 0.050); _p.s1 = _p.s0 * 0.8;
      _p.tile = T_DROP; _p.alpha = 0.85; _p.rot = rnd() * 6.28; _p.fade = 0.9;
      _p.floor = y; _p.rest = 0; _p.spin = sym(8);
      push(alphaPool);
    }
    _p.x = x; _p.y = y + 0.01; _p.z = z; _p.vx = _p.vy = _p.vz = 0;
    _p.life = 0.5; _p.drag = 1; _p.grav = 0; _p.stretch = 0; _p.turb = 0;
    c0(0xeaf6fb); c1(0xa8c8d6);
    _p.s0 = 0.20; _p.s1 = 1.05; _p.tile = T_RING; _p.alpha = 0.55; _p.rot = 0; _p.fade = 1.6;
    _p.floor = -1e6; _p.rest = 0; _p.spin = 0;
    push(alphaPool);
    addDecal(x, y, z, nx, ny, nz, 0.3, D_RIPPLE, 0xbfe0ee, 0.4, 1.2);
  };

  RECIPE[S.RUBBER] = (x, y, z, nx, ny, nz, dx, dy, dz, e, fy) => {
    // Rubber eats the round: almost nothing comes back out. The read is the
    // *absence* of debris, plus a dull soot-coloured puff.
    for (let i = 0; i < Math.round(4 * e); i++) {
      cone(nx, ny, nz, 0.6);
      const sp = rr(1, 3);
      _p.x = x; _p.y = y; _p.z = z;
      _p.vx = _dir.x * sp; _p.vy = _dir.y * sp + 0.4; _p.vz = _dir.z * sp;
      _p.life = rr(0.5, 1.0); _p.drag = 2.6; _p.grav = 1; _p.stretch = 0.2; _p.turb = 0;
      c0(0x3a3a3c); c1(0x1e1e20);
      _p.s0 = rr(0.018, 0.034); _p.s1 = _p.s0;
      _p.tile = T_CHIP; _p.alpha = 1; _p.rot = rnd() * 6.28; _p.fade = 0.8;
      _p.floor = fy; _p.rest = 0.15; _p.spin = sym(14);
      push(alphaPool);
    }
    _p.x = x + nx * 0.02; _p.y = y + ny * 0.02; _p.z = z + nz * 0.02;
    _p.vx = nx * 0.5; _p.vy = ny * 0.5 + 0.2; _p.vz = nz * 0.5;
    _p.life = 0.5; _p.drag = 5; _p.grav = 0.02; _p.stretch = 0; _p.turb = 0.2;
    c0(0x54524f); c1(0x2c2b29);
    _p.s0 = 0.18; _p.s1 = 0.50; _p.tile = T_SMOKE; _p.alpha = 0.35; _p.rot = rnd() * 6.28; _p.fade = 1.7;
    _p.floor = -1e6; _p.rest = 0; _p.spin = 0;
    push(alphaPool);
    addDecal(x, y, z, nx, ny, nz, rr(0.05, 0.08), D_RUBBER, 0x1c1c1e, 0.85, 55);
  };

  function impact(px, py, pz, nx, ny, nz, dx, dy, dz, surface, energy) {
    const fn = RECIPE[surface] || RECIPE[S.CONCRETE];
    const e = clamp(energy === undefined ? 1 : energy, 0.25, 1.6);
    const fy = ny > 0.5 ? py : floorUnder(px, py, pz);
    fn(px, py, pz, nx, ny, nz, dx, dy, dz, e, fy);
  }

  // ── muzzle flash, shots, explosions ────────────────────────────────────────

  const _mz = new THREE_.Vector3(), _fwd = new THREE_.Vector3();
  const _right = new THREE_.Vector3(), _upv = new THREE_.Vector3();
  // Where the flash lives if the viewmodel does not tell us. Camera-space:
  // right of centre, a little below the eye, half a metre forward.
  const MUZZLE_LOCAL = new THREE_.Vector3(0.13, -0.055, -0.56);
  const PORT_LOCAL = new THREE_.Vector3(0.17, -0.045, -0.30);
  let muzzleNode = null, muzzleFn = null;

  // Three ways to find the barrel, in descending order of trust, re-probed on
  // every shot until one of them answers: the viewmodel is built after FX and
  // swaps its model on every weapon change, so a value cached at boot would be
  // a flash hanging in the air where the last gun used to be.
  function muzzleWorld(out) {
    if (!muzzleNode && !muzzleFn) {
      muzzleNode = engine.view.getObjectByName ? engine.view.getObjectByName('muzzle') : null;
      if (!muzzleNode) {
        const vm = engine.viewmodel
          || (typeof window !== 'undefined' && window.BLACKSITE && window.BLACKSITE.viewmodel);
        if (vm && typeof vm.muzzle === 'function') muzzleFn = vm.muzzle;
      }
    }
    if (muzzleNode) { muzzleNode.getWorldPosition(out); return out; }
    if (muzzleFn && muzzleFn(out, null)) return out;
    return out.copy(MUZZLE_LOCAL).applyMatrix4(engine.viewCam.matrixWorld);
  }

  let shotCount = 0;
  const TRACER_EVERY = 3;

  // `at` is a world position for a shot that did not come from the player's own
  // gun — an enemy rifle needs the same flash and the same light, just not from
  // the viewmodel's barrel, and it must not eject brass into the player's face.
  function muzzleFlash(dx, dy, dz, silenced, at) {
    const cam = engine.camera;
    const local = !at;
    if (at) _mz.set(at.x, at.y, at.z); else muzzleWorld(_mz);
    const gain = silenced ? 0.30 : 1;
    _fwd.set(dx, dy, dz);
    if (_fwd.lengthSq() < 1e-8) _fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    _fwd.normalize();
    _right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _upv.set(0, 1, 0).applyQuaternion(cam.quaternion);

    // The star. Randomly rolled every shot; the same flash twice in a row is
    // what makes automatic fire look like a looping GIF.
    _p.x = _mz.x; _p.y = _mz.y; _p.z = _mz.z;
    _p.vx = _fwd.x * 1.2; _p.vy = _fwd.y * 1.2; _p.vz = _fwd.z * 1.2;
    // Three frames, not two: at 60 fps a two-frame flash is a coin toss on
    // whether the player's monitor ever shows it, and a flash you only see half
    // the time reads as a stutter in the gun rather than as light.
    _p.life = 0.055; _p.drag = 1; _p.grav = 0; _p.stretch = 0; _p.turb = 0;
    c0(0xfff3d0); c1(0xff9a2e);
    _p.s0 = rr(0.40, 0.58) * gain; _p.s1 = _p.s0 * 0.5;
    _p.tile = T_FLASH; _p.alpha = 1; _p.rot = rnd() * 6.28; _p.fade = 0.9;
    _p.floor = -1e6; _p.rest = 0; _p.spin = 0;
    push(addPool);
    _p.life = 0.065; _p.s0 = rr(0.22, 0.30) * gain; _p.s1 = 0.05;
    _p.tile = T_GLOW; c0(0xffffff); c1(0xffb352);
    push(addPool);

    // Sparks blown out of the barrel with the gas.
    for (let i = 0; i < (silenced ? 2 : 6); i++) {
      cone(_fwd.x, _fwd.y, _fwd.z, 0.34);
      const sp = rr(3, 11);
      _p.x = _mz.x; _p.y = _mz.y; _p.z = _mz.z;
      _p.vx = _dir.x * sp; _p.vy = _dir.y * sp; _p.vz = _dir.z * sp;
      _p.life = rr(0.10, 0.26); _p.drag = 5; _p.grav = 0.7; _p.stretch = 0.7; _p.turb = 0;
      c0(0xfff6d8); c1(0xd2500c);
      _p.s0 = rr(0.022, 0.040); _p.s1 = 0.006;
      _p.tile = T_STREAK; _p.alpha = 1; _p.rot = 0; _p.fade = 0.7;
      _p.floor = -1e6; _p.rest = 0; _p.spin = 0;
      push(addPool);
    }
    // And the smoke that drifts off the muzzle afterwards — the thing that
    // makes a firefight accumulate rather than reset every trigger pull.
    for (let i = 0; i < 2; i++) {
      cone(_fwd.x, _fwd.y, _fwd.z, 0.5);
      const sp = rr(0.6, 2.0);
      _p.x = _mz.x; _p.y = _mz.y; _p.z = _mz.z;
      _p.vx = _dir.x * sp; _p.vy = _dir.y * sp + 0.35; _p.vz = _dir.z * sp;
      _p.life = rr(0.5, 1.1); _p.drag = 4.5; _p.grav = -0.03; _p.stretch = 0; _p.turb = 0.6;
      c0(0xbfbcb4); c1(0x6f6d68);
      _p.s0 = rr(0.10, 0.17); _p.s1 = _p.s0 * rr(3.5, 5.5);
      _p.tile = T_SMOKE; _p.alpha = rr(0.10, 0.20); _p.rot = rnd() * 6.28; _p.fade = 1.9;
      _p.floor = -1e6; _p.rest = 0; _p.spin = sym(0.5);
      push(alphaPool);
    }

    // The real light. This is the part that sells it: for three frames the
    // walls, the viewmodel and the dust in the air all get brighter, and no
    // sprite can fake that.
    flash(_mz.x, _mz.y, _mz.z, 9.0 * gain, 0.055, 0xffc98a, 11);

    // Eject brass out of the port. Ejection lags the shot by a frame or two in
    // reality; nobody has ever noticed it not doing so.
    if (local) {
      const port = _cv.copy(PORT_LOCAL).applyMatrix4(engine.viewCam.matrixWorld);
      ejectCasing(port.x, port.y, port.z,
        _right.x, _right.y, _right.z,
        _fwd.x, _fwd.y, _fwd.z,
        G.player.vel.x, G.player.vel.y, G.player.vel.z);
    }

    // Tracer on one round in three, from the muzzle to whatever it will hit.
    shotCount++;
    if (shotCount % TRACER_EVERY === 0) {
      let dist = 120;
      if (G.world.grid) {
        _ro.x = _mz.x; _ro.y = _mz.y; _ro.z = _mz.z;
        _rd.x = _fwd.x; _rd.y = _fwd.y; _rd.z = _fwd.z;
        const hit = raycast(G.world, _ro, _rd, 200);
        if (hit) dist = hit.t;
      }
      addTracer(_mz.x, _mz.y, _mz.z, _fwd.x, _fwd.y, _fwd.z, dist);
    }
  }

  function explosion(x, y, z, radius, power) {
    const R = radius || 4.5;
    const pw = power === undefined ? 1 : power;

    // Fireball. The colour ramp is the whole effect: a core that starts white,
    // passes through the yellows and dies deep red, with the outer shells born
    // later and cooler so the ball has depth instead of being a flat disc.
    for (let i = 0; i < Math.round(26 * pw); i++) {
      cone(rr(-1, 1), rr(-0.2, 1), rr(-1, 1), 1);
      const sp = rr(1.5, 9) * pw;
      _p.x = x + sym(0.2); _p.y = y + sym(0.2); _p.z = z + sym(0.2);
      _p.vx = _dir.x * sp; _p.vy = _dir.y * sp * 0.8 + rr(1, 4); _p.vz = _dir.z * sp;
      _p.life = rr(0.30, 0.75); _p.drag = 6.5; _p.grav = -0.35; _p.stretch = 0; _p.turb = 0.2;
      const hot = rnd();
      c0(hot > 0.6 ? 0xfffbe0 : 0xffd166, 1);
      c1(hot > 0.6 ? 0xff6a12 : 0x8c1c04, 1);
      _p.s0 = R * rr(0.10, 0.24); _p.s1 = _p.s0 * rr(1.7, 2.6);
      _p.tile = hot > 0.5 ? T_PUFF : T_SMOKE; _p.alpha = 1; _p.rot = rnd() * 6.28; _p.fade = 1.3;
      _p.floor = -1e6; _p.rest = 0; _p.spin = sym(1.2);
      push(addPool);
    }

    // The expanding smoke ring: born flat and outward, buoyant, and it outlives
    // the fire by an order of magnitude. Explosions in games look cheap when the
    // smoke leaves at the same time as the flame.
    for (let i = 0; i < Math.round(20 * pw); i++) {
      const a = (i / Math.round(20 * pw)) * Math.PI * 2 + sym(0.25);
      const sp = rr(3, 7) * pw;
      _p.x = x; _p.y = y + rr(-0.2, 0.4); _p.z = z;
      _p.vx = Math.cos(a) * sp; _p.vy = rr(0.4, 2.2); _p.vz = Math.sin(a) * sp;
      _p.life = rr(2.4, 4.6); _p.drag = 1.5; _p.grav = -0.05; _p.stretch = 0; _p.turb = 0.8;
      c0(0x6e6255); c1(0x2f2b27);
      _p.s0 = R * rr(0.12, 0.24); _p.s1 = _p.s0 * rr(2.6, 4.2);
      _p.tile = T_SMOKE; _p.alpha = rr(0.30, 0.55); _p.rot = rnd() * 6.28; _p.fade = 1.8;
      _p.floor = -1e6; _p.rest = 0; _p.spin = sym(0.5);
      push(alphaPool);
    }

    // Ground dust skirt: the blast pushing air out along the floor.
    const fy = floorUnder(x, y, z);
    for (let i = 0; i < Math.round(14 * pw); i++) {
      const a = rnd() * Math.PI * 2, sp = rr(4, 11) * pw;
      _p.x = x + Math.cos(a) * 0.3; _p.y = fy + 0.12; _p.z = z + Math.sin(a) * 0.3;
      _p.vx = Math.cos(a) * sp; _p.vy = rr(0.2, 1.4); _p.vz = Math.sin(a) * sp;
      _p.life = rr(1.4, 2.8); _p.drag = 2.6; _p.grav = 0.02; _p.stretch = 0; _p.turb = 0.6;
      c0(0xc0a982); c1(0x6e6152);
      _p.s0 = R * rr(0.10, 0.20); _p.s1 = _p.s0 * rr(2.4, 3.6);
      _p.tile = T_SMOKE; _p.alpha = rr(0.25, 0.45); _p.rot = rnd() * 6.28; _p.fade = 1.9;
      _p.floor = -1e6; _p.rest = 0; _p.spin = sym(0.4);
      push(alphaPool);
    }

    // Debris, thrown high and bouncing where it lands.
    for (let i = 0; i < Math.round(22 * pw); i++) {
      cone(rr(-1, 1), rr(0.2, 1), rr(-1, 1), 1);
      const sp = rr(5, 18) * pw;
      _p.x = x; _p.y = y; _p.z = z;
      _p.vx = _dir.x * sp; _p.vy = Math.abs(_dir.y) * sp + rr(1, 5); _p.vz = _dir.z * sp;
      _p.life = rr(1.2, 2.6); _p.drag = 0.35; _p.grav = 1; _p.stretch = 0.5; _p.turb = 0;
      c0(0x8b8378); c1(0x413c35);
      _p.s0 = rr(0.04, 0.09); _p.s1 = _p.s0;
      _p.tile = T_CHIP; _p.alpha = 1; _p.rot = rnd() * 6.28; _p.fade = 0.7;
      _p.floor = fy; _p.rest = rr(0.2, 0.45); _p.spin = sym(20);
      push(alphaPool);
    }
    // Burning embers arcing out of the fireball.
    for (let i = 0; i < Math.round(18 * pw); i++) {
      cone(rr(-1, 1), rr(0, 1), rr(-1, 1), 1);
      const sp = rr(4, 16) * pw;
      _p.x = x; _p.y = y; _p.z = z;
      _p.vx = _dir.x * sp; _p.vy = _dir.y * sp + rr(1, 4); _p.vz = _dir.z * sp;
      _p.life = rr(0.6, 1.6); _p.drag = 1.1; _p.grav = 0.9; _p.stretch = 0.6; _p.turb = 0.2;
      c0(0xffe9b0); c1(0x8f1a02);
      _p.s0 = rr(0.045, 0.09); _p.s1 = 0.012;
      _p.tile = T_STREAK; _p.alpha = 1; _p.rot = 0; _p.fade = 0.8;
      _p.floor = fy; _p.rest = 0.4; _p.spin = 0;
      push(addPool);
    }

    addDecal(x, fy, z, 0, 1, 0, R * rr(0.55, 0.8), rnd() > 0.5 ? D_SCORCH_A : D_SCORCH_B, 0x141210, 0.88, 90);
    flash(x, y + 0.6, z, 60 * pw, 0.45, 0xffb04a, R * 5);
    shockwave(x, y, z, R * 1.15, 0.34);

    // The camera kick. Written to G.shake, which engine.updateCamera decays and
    // turns into a band-limited offset; FX never touches the camera itself.
    const d = Math.hypot(G.player.pos.x - x, G.player.pos.y - y, G.player.pos.z - z);
    const near = clamp(1 - d / (R * 4), 0, 1);
    shakeAdd(2.6 * pw * near * near, 0.55);
  }

  function shakeAdd(amp, dur) {
    if (amp <= 0) return;
    if (amp > G.shake.amp) G.shake.amp = amp;
    if (dur > G.shake.t) G.shake.t = dur;
  }

  // Footfalls kick up the surface they land on. Cheap, easy to overdo — two
  // particles, low alpha, and only on the loose surfaces where it is plausible.
  function footDust(x, y, z, surface, hard) {
    if (surface !== S.SAND && surface !== S.CONCRETE) return;
    const n = hard ? 5 : 2;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, sp = rr(0.3, 1.4) * (hard ? 2.2 : 1);
      _p.x = x + Math.cos(a) * 0.12; _p.y = y + 0.03; _p.z = z + Math.sin(a) * 0.12;
      _p.vx = Math.cos(a) * sp; _p.vy = rr(0.15, 0.7); _p.vz = Math.sin(a) * sp;
      _p.life = rr(0.7, 1.5); _p.drag = 3.2; _p.grav = 0.04; _p.stretch = 0; _p.turb = 0.5;
      if (surface === S.SAND) { c0(0xd0b284); c1(0x8f7a58); }
      else { c0(0xb5b0a6); c1(0x74706a); }
      _p.s0 = rr(0.16, 0.30); _p.s1 = _p.s0 * rr(2.5, 4);
      _p.tile = T_SMOKE; _p.alpha = rr(0.06, 0.16) * (hard ? 1.8 : 1);
      _p.rot = rnd() * 6.28; _p.fade = 2.0;
      _p.floor = -1e6; _p.rest = 0; _p.spin = 0;
      push(alphaPool);
    }
  }

  // ── depth prepass ──────────────────────────────────────────────────────────
  const _clearCol = new THREE_.Color();
  let softActive = false;

  function renderDepth() {
    // Nothing alive means nothing to soften. The atmosphere layer does not use
    // the depth term at all, so an idle scene must not pay for a second pass
    // over the level just to have it sampled by no one.
    if (clock.t >= alphaPool.until && clock.t >= addPool.until) {
      shared.uSoft.value = 0; softActive = false; return;
    }
    // Free if the post chain already produced one — the same texture, one fewer
    // pass, and it upgrades itself the moment postfx starts exposing it.
    const external = engine.post && (engine.post.depthTexture || engine.post.sceneDepth);
    if (external) {
      shared.uDepth.value = external;
      shared.uSoft.value = 1;
      softActive = true;
      return;
    }
    if (!depthRT) { shared.uSoft.value = 0; softActive = false; return; }

    const r = engine.renderer;
    const w = Math.max(2, Math.floor(engine.size.w * engine.size.dpr * 0.5));
    const h = Math.max(2, Math.floor(engine.size.h * engine.size.dpr * 0.5));
    if (depthRT.width !== w || depthRT.height !== h) depthRT.setSize(w, h);

    // FX must not occlude itself, and re-running the shadow pass for a depth
    // prepass would double the most expensive thing in the frame.
    group.visible = false;
    const prevShadowAuto = r.shadowMap.autoUpdate;
    const prevTarget = r.getRenderTarget();
    const prevBg = engine.scene.background;
    const prevOverride = engine.scene.overrideMaterial;
    r.getClearColor(_clearCol);
    const prevAlpha = r.getClearAlpha();

    r.shadowMap.autoUpdate = false;
    engine.scene.background = null;
    engine.scene.overrideMaterial = depthMat;
    r.setRenderTarget(depthRT);
    r.setClearColor(0xffffff, 1);
    r.clear(true, true, false);
    r.render(engine.scene, engine.camera);

    engine.scene.overrideMaterial = prevOverride;
    engine.scene.background = prevBg;
    r.setRenderTarget(prevTarget);
    r.setClearColor(_clearCol, prevAlpha);
    r.shadowMap.autoUpdate = prevShadowAuto;
    group.visible = true;

    shared.uDepth.value = depthRT.texture;
    shared.uSoft.value = 1;
    softActive = true;
  }

  // ── scene light sampling ───────────────────────────────────────────────────
  // Decals and atmosphere need to know where the sun is, but lighting.js owns
  // the sun and this module owns nothing outside src/fx. So look it up, cache
  // it, and fall back to a plausible dusk if it is not there yet.
  let sunLight = null, hemiLight = null, lightScan = 0;
  const _sunV = new THREE_.Vector3();

  function sampleLights() {
    if (!sunLight || !hemiLight) {
      engine.scene.traverse((o) => {
        if (!sunLight && o.isDirectionalLight) sunLight = o;
        if (!hemiLight && o.isHemisphereLight) hemiLight = o;
      });
    }
    if (sunLight) {
      _sunV.copy(sunLight.position);
      if (sunLight.target) _sunV.sub(sunLight.target.position);
      _sunV.normalize().negate();          // direction the light travels
      decalU.uSunDir.value.copy(_sunV);
      atmoU.uSunDir.value.copy(_sunV);
      const i = Math.min(sunLight.intensity, 4) * 0.28;
      decalU.uSunCol.value.copy(sunLight.color).multiplyScalar(i);
      atmoU.uSunCol.value.copy(sunLight.color).multiplyScalar(1.0);
    }
    if (hemiLight) {
      decalU.uAmbCol.value.copy(hemiLight.color).multiplyScalar(hemiLight.intensity * 0.45)
        .lerp(hemiLight.groundColor, 0.45);
      atmoU.uShadeCol.value.copy(hemiLight.color).multiplyScalar(0.55);
    }
    const fog = engine.scene.fog;
    if (fog) {
      shared.uFogColor.value.copy(fog.color);
      shared.uFogDensity.value = fog.density !== undefined ? fog.density : 0.008;
    } else {
      shared.uFogDensity.value = 0;
    }
  }
  sampleLights();

  // ── the module interface main.js already calls ─────────────────────────────

  const api = {
    // Fixed 120 Hz. Only things whose *timing* is gameplay-visible live here:
    // casing physics (because it emits the audio event), light decay and the
    // shockwave, all of which would judder if they ran on a variable clock.
    step(g, dt) {
      void g;
      stepCasings(dt);
      stepLights(dt);
      stepWaves(dt);
    },

    // Every drained event passes through here. FX never reaches back into the
    // simulation; it reads the record and draws the consequence.
    handle(e) {
      switch (e.type) {
        case 'shot': {
          const d = e.dir || engine.aimDir;
          // A shot whose origin is not the player's own eye came from somebody
          // else's gun, and gets its flash where that gun is.
          const o = e.origin;
          const remote = o && Math.hypot(o.x - G.player.pos.x, o.y - G.player.pos.y, o.z - G.player.pos.z) > 0.6;
          muzzleFlash(d.x, d.y, d.z, e.silenced, remote ? o : null);
          break;
        }
        case 'impact': {
          const p = e.point || e.pos;
          if (!p) break;
          const n = e.normal || { x: 0, y: 1, z: 0 };
          let dx = 0, dy = 0, dz = 0;
          if (e.dir) { dx = e.dir.x; dy = e.dir.y; dz = e.dir.z; }
          else {
            // No bullet vector on the event: the line from the eye to the hit
            // is the right answer for anything the player fired, and a good
            // enough one for anything else.
            dx = p.x - G.player.pos.x; dy = p.y - G.player.pos.y; dz = p.z - G.player.pos.z;
            const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
          }
          impact(p.x, p.y, p.z, n.x, n.y, n.z, dx, dy, dz,
            e.surface === undefined ? S.CONCRETE : e.surface, e.energy);
          break;
        }
        case 'explosion': {
          const p = e.point || e.pos;
          if (p) explosion(p.x, p.y, p.z, e.radius, e.power);
          break;
        }
        case 'kill': {
          // A kill gets a second, wetter burst on top of whatever the killing
          // round already drew, so the last hit reads differently from the rest.
          const p = e.point || (e.target && e.target.pos);
          if (p) {
            const d = e.dir || engine.aimDir;
            RECIPE[S.FLESH](p.x, p.y, p.z, -d.x, -d.y, -d.z, d.x, d.y, d.z, 1.5, floorUnder(p.x, p.y, p.z));
          }
          break;
        }
        case 'step': {
          const p = e.pos;
          if (p) footDust(p.x, p.y - G.player.eye, p.z, e.surface, false);
          break;
        }
        case 'land': {
          const p = e.pos;
          if (p) footDust(p.x, p.y - G.player.eye, p.z, e.surface, true);
          if (e.hard > 0.7) shakeAdd(0.5 * e.hard, 0.18);
          break;
        }
        case 'slide': {
          const p = e.pos;
          if (p) footDust(p.x, p.y - G.player.eye, p.z, G.player.groundSurface, true);
          break;
        }
        default: break;
      }
    },

    // Per rendered frame. Camera-relative work and buffer uploads only.
    update(dt) {
      clock.t += dt;
      const t = clock.t;
      shared.uTime.value = t;
      atmoU.uTime.value = t;
      decalU.uTime.value = t;
      tracerU.uTime.value = t;
      shared.uNear.value = engine.camera.near;
      shared.uFar.value = engine.camera.far;

      if (++lightScan >= 30) { lightScan = 0; sampleLights(); }

      // The atmosphere field is anchored to the camera in XZ and to the floor
      // the player is standing on in Y, so motes never end up buried under the
      // ground or stranded above a rooftop.
      atmoU.uCam.value.copy(engine.camera.position);
      atmoU.uGround.value = G.player.pos.y - G.player.eye - 0.4;

      renderDepth();

      flushPool(alphaPool);
      flushPool(addPool);
      flushDecals();
      tracerGeo.instanceCount = t < tracers.until ? tracers.high : 0;
      syncCasings();
    },

    reset() {
      clearPool(alphaPool);
      clearPool(addPool);
      for (const name of DATTR) {
        dA[name].array.fill(0);
        if (dA[name].clearUpdateRanges) dA[name].clearUpdateRanges();
        dA[name].needsUpdate = true;
      }
      decals.head = 0; decals.high = 0; decals.lo = Infinity; decals.hi = -1;
      decalGeo.instanceCount = 0;
      for (const name of TATTR) { tA[name].array.fill(0); tA[name].needsUpdate = true; }
      tracers.head = 0; tracers.high = 0; tracers.until = -1;
      tracerGeo.instanceCount = 0;
      cas.state.fill(0); cas.head = 0; cas.live = 0;
      syncCasings();
      for (const s of lights) { s.dur = 0; s.light.intensity = 0; }
      for (const w of waves) { w.dur = 0; w.mesh.visible = false; }
      shotCount = 0;
      muzzleNode = null; muzzleFn = null;
    },

    dispose() {
      group.removeFromParent();
      for (const s of lights) s.light.removeFromParent();
      atlasP.dispose(); atlasD.dispose();
      if (depthRT) depthRT.dispose();
    },

    // Exposed for the screenshot rig and for anyone who wants to fire an effect
    // without going through the event queue.
    impact, explosion, muzzleFlash, addDecal, shakeAdd,
    pools: { alpha: alphaPool, add: addPool },
    budgets: {
      add: N_ADD, alpha: N_ALPHA, motes: N_MOTE, streaks: N_STREAK,
      decals: N_DECAL, casings: N_CASING, tracers: N_TRACER, lights: N_LIGHT,
    },
    get soft() { return softActive; },
    group, decalMesh, moteMesh, streakMesh, casingMesh, tracerMesh, engine,
  };

  return api;
}

export { createFX as default };
