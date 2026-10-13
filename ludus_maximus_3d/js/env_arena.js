// env_arena.js : elliptical Roman colosseum bowl.
//   createArena({ crowd:3700, density:1, decalRes:2048, seed }) -> arena
//   arena.group  add to scene          arena.update(t, dt)  per frame
//   arena.setHype(0..1)  cheer jump + raised arms    arena.setWave(0..1)  stadium wave around the bowl
//   arena.setGate(0..1, side 0|1|undefined)  portcullis open amount      arena.setNight(0..1)  arches/torch glow
//   arena.stampFootprint(x,z,heading,scale,side)  arena.scuff(x0,z0,x1,z1,width)  sand decal canvas painting
//   arena.setDensity(0..1) crowd LOD        arena.DIM  dimensions        arena.shadowHint {center, radius}
// Draw calls: ~28 (+ shadow pass). Crowd = 1 InstancedMesh animated in the vertex shader (zero CPU per frame).
import * as THREE from 'three';
import { mergeGeos, prepGeo, colorize, boxGeo, patchMaterial, bakeInstances, createFlames, createBlobShadows, createDustMotes } from './envfx.js';
import { makeSandTexture, makeStoneTexture, makeMarbleTexture, tfbm, tnoise } from './envtex.js';
import { TOD, applyTOD } from './sky.js';

const TAU = Math.PI * 2;
export const DIM = {
  SA: 22, SB: 14.5,              // sand semi-axes (x long, z short)
  PH: 3.0,                       // podium wall height
  FD: 17.5, FH: 18.0,            // facade offset from sand edge + height
  TIER: 4.7,                     // facade tier height
};
const { SA, SB, PH, FD, FH, TIER } = DIM;
const P = (d, th) => [Math.cos(th) * (SA + d), Math.sin(th) * (SB + d)];
const NRM = (d, th) => { const a = SA + d, b = SB + d; const x = Math.cos(th) / a, z = Math.sin(th) / b, l = Math.hypot(x, z); return [x / l, z / l]; };
const lerp = (a, b, t) => a + (b - a) * t;
const C = (h) => new THREE.Color(h);

/** arc-length lookup for the ring at offset d: returns thetas evenly spaced by distance */
function arcThetas(d, count, phase = 0) {
  const n = 1440, cum = new Float32Array(n + 1);
  let prev = P(d, 0);
  for (let i = 1; i <= n; i++) { const q = P(d, (i / n) * TAU); cum[i] = cum[i - 1] + Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q; }
  const L = cum[n], out = new Float32Array(count);
  for (let k = 0; k < count; k++) {
    const s = ((k + phase) / count % 1) * L; let lo = 0, hi = n;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
    out[k] = ((lo + (s - cum[lo]) / (cum[hi] - cum[lo] || 1)) / n) * TAU;
  }
  return { thetas: out, length: L };
}

/**
 * Sweep a profile segment around the ellipse. seg: {a:[d,y], b:[d,y], ca, cb (grey or [r,g,b]), face:'out'|'in'|'up'|'down', v0}
 * Analytic smooth normals, per-quad vertices (so any quad can be skipped/tinted), uv in 1/uvM meter units.
 */
function sweep(segs, N, { skip, tint, uvM = 6 } = {}) {
  const pos = [], nor = [], uv = [], col = [];
  for (const s of segs) {
    const [da, ya] = s.a, [db, yb] = s.b;
    const ca = Array.isArray(s.ca) ? s.ca : [s.ca, s.ca, s.ca], cb = Array.isArray(s.cb) ? s.cb : [s.cb, s.cb, s.cb];
    const segLen = Math.hypot(db - da, yb - ya);
    let arc = 0; let pp = P(da, 0);
    const arcs = [0];
    for (let j = 1; j <= N; j++) { const q = P(da, (j / N) * TAU); arc += Math.hypot(q[0] - pp[0], q[1] - pp[1]); pp = q; arcs.push(arc); }
    for (let j = 0; j < N; j++) {
      const t0 = (j / N) * TAU, t1 = ((j + 1) / N) * TAU;
      if (skip && skip(j, (t0 + t1) / 2, s)) continue;
      const m = tint ? tint(j, s) : 1;
      const v = [[da, ya, t0, 0, arcs[j]], [db, yb, t0, 1, arcs[j]], [da, ya, t1, 0, arcs[j + 1]], [db, yb, t1, 1, arcs[j + 1]]];
      const V = v.map(([d, y, th, e, ar]) => {
        const p = P(d, th); const n = NRM(d, th);
        let nn = s.face === 'out' ? [n[0], 0, n[1]] : s.face === 'in' ? [-n[0], 0, -n[1]] : s.face === 'up' ? [0, 1, 0] : [0, -1, 0];
        return { p: [p[0], y, p[1]], n: nn, uv: [ar / uvM, ((s.v0 || 0) + e * segLen) / uvM], c: (e ? cb : ca).map((x) => x * m) };
      });
      // orientation: want triangle normal along desired normal
      const e1 = [V[1].p[0] - V[0].p[0], V[1].p[1] - V[0].p[1], V[1].p[2] - V[0].p[2]];
      const e2 = [V[2].p[0] - V[0].p[0], V[2].p[1] - V[0].p[1], V[2].p[2] - V[0].p[2]];
      const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const dn = V[0].n; const flip = cr[0] * dn[0] + cr[1] * dn[1] + cr[2] * dn[2] < 0;
      const tris = flip ? [[0, 2, 1], [1, 2, 3]] : [[0, 1, 2], [2, 1, 3]];
      // second triangle winding must match first; (2,1,3) is the consistent partner of (0,1,2); (1,2,3) of (0,2,1)
      for (const tri of tris) for (const k of tri) { const q = V[k]; pos.push(...q.p); nor.push(...q.n); uv.push(...q.uv); col.push(...q.c); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** place helper: matrix for an object at ring(d,theta) height y, +z facing inward (inward=true) or outward */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function ringMatrix(d, th, y, { inward = true, scale = 1, dOff = 0, yaw = 0 } = {}) {
  const dd = d + dOff, p = P(dd, th), n = NRM(d, th);
  const ang = Math.atan2(inward ? -n[0] : n[0], inward ? -n[1] : n[1]) + yaw;
  _q.setFromEuler(_e.set(0, ang, 0)); _s.set(typeof scale === 'number' ? scale : scale.x, typeof scale === 'number' ? scale : scale.y, typeof scale === 'number' ? scale : scale.z);
  _p.set(p[0], y, p[1]);
  return _m.compose(_p, _q, _s).clone();
}

function archShape(hw, hs, rise, hole = null) {
  const s = new THREE.Shape(); s.moveTo(-hw, 0); s.lineTo(hw, 0); s.lineTo(hw, hs); s.absellipse(0, hs, hw, rise, 0, Math.PI, false); s.lineTo(-hw, 0);
  if (hole) s.holes.push(hole);
  return s;
}

function makeBannerAtlas() {
  const W = 192, H = 480, c = document.createElement('canvas'); c.width = W * 3; c.height = H; const x = c.getContext('2d');
  const defs = [['#5a1f5e', '#f2c14e', '#3a1040'], ['#a8482a', '#f0e2c0', '#6a2a18'], ['#2f5a4a', '#f2c14e', '#173528']];
  defs.forEach(([base, trim, dark], i) => {
    const ox = i * W; x.save(); x.beginPath(); x.moveTo(ox + 6, 0); x.lineTo(ox + W - 6, 0); x.lineTo(ox + W - 6, H - 70); x.lineTo(ox + W / 2, H - 26); x.lineTo(ox + 6, H - 70); x.closePath(); x.clip();
    const g = x.createLinearGradient(ox, 0, ox + W, 0); g.addColorStop(0, dark); g.addColorStop(0.25, base); g.addColorStop(0.75, base); g.addColorStop(1, dark);
    x.fillStyle = g; x.fillRect(ox, 0, W, H);
    x.strokeStyle = trim; x.lineWidth = 8; x.strokeRect(ox + 16, 12, W - 32, H - 70);
    x.lineWidth = 2; x.strokeRect(ox + 26, 22, W - 52, H - 90);
    // laurel wreath + crossed blades
    x.lineWidth = 6; x.beginPath(); x.arc(ox + W / 2, 170, 54, 0.6, Math.PI * 2 - 0.6 - Math.PI * 0.0); x.stroke();
    for (let k = 0; k < 9; k++) { const a = 0.9 + k * 0.55; x.beginPath(); x.ellipse(ox + W / 2 + Math.cos(a) * 54, 170 + Math.sin(a) * 54, 11, 5, a + 1.57, 0, TAU); x.fillStyle = trim; x.fill(); }
    x.lineWidth = 9; x.beginPath(); x.moveTo(ox + W / 2 - 34, 134); x.lineTo(ox + W / 2 + 34, 206); x.moveTo(ox + W / 2 + 34, 134); x.lineTo(ox + W / 2 - 34, 206); x.stroke();
    x.fillStyle = trim; x.fillRect(ox + 28, 290, W - 56, 8); x.fillRect(ox + 28, 308, W - 56, 4);
    for (let k = 0; k < 5; k++) { x.beginPath(); x.moveTo(ox + 36 + k * 30, 330); x.lineTo(ox + 51 + k * 30, 380 + (k % 2) * 14); x.lineTo(ox + 66 + k * 30, 330); x.fill(); }
    x.restore();
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function makeSailTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 12; i++) { x.fillStyle = `rgba(0,0,0,${0.02 + (i % 2) * 0.03})`; x.fillRect(0, i * 21.3, 128, 10); }
  const g = x.createLinearGradient(0, 0, 128, 0); g.addColorStop(0, 'rgba(60,30,20,0.55)'); g.addColorStop(0.06, 'rgba(60,30,20,0)'); g.addColorStop(0.94, 'rgba(60,30,20,0)'); g.addColorStop(1, 'rgba(60,30,20,0.55)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 256);
  x.fillStyle = 'rgba(242,193,78,0.9)'; x.fillRect(0, 244, 128, 12); x.fillStyle = 'rgba(90,31,94,0.55)'; x.fillRect(0, 232, 128, 6);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}


// ---------------------------------------------------------------------------------------------------------------------
// THEMES: data-driven arena looks. createArena().setTheme(id, ctx) applies one at runtime (no rebuild, no new draw calls beyond
// the small dressing groups). pickTheme(meta) chooses from the fight meta (league, season, event kind, festival, weather).
//   stone   : texture for the whole bowl (kind) + tint      sand: floor texture + tint + decal style (see paintDecal)
//   crowd   : density multiplier, visible seat rows, palettes, patrician ratio (low rows / high rows)
//   velarium: shown + tint     banners: tint + count of inner banners   gold: bronze trim colour   torch: min flame glow 0..1
//   sky     : overrides on a TOD preset (base)      dress: lazily built groups      horizon: distant silhouette ring
// ---------------------------------------------------------------------------------------------------------------------
export const THEMES = {
  sandpit: {
    name: 'Provincial Sandpit', blurb: 'Rustic timber stands under a plain daytime sky.',
    stone: { kind: 'wood', tint: 0xf0d0a8 }, sand: { kind: 'sand', tint: 0xe6cf9c, decal: 'ruts' }, gold: 0x8a6a3a,
    crowd: { density: 0.55, rows: 8, pleb: [0x8a6a44, 0x6e5236, 0x9a7a50, 0x7a5a3a, 0x5a4a34, 0xa08860, 0x6a6a44, 0x8a5a3a, 0xb59a6a], pat: [0xcaa46a, 0x9a7a50], patLow: 0.04, patHigh: 0 },
    velarium: false, banners: { tint: 0xb89868, count: 14 }, torch: 0.15, dress: ['palisade', 'hay'], horizon: 'hills',
    base: 'golden', sky: { sunElev: 58, sunAz: 195, sunColor: 0xfff0d8, sunInt: 3.1, hemiSky: 0xa8c0e8, hemiGround: 0xa89470, hemiInt: 1.4, fog: 0xc9d6dc, fogDensity: 0.0046, skyTop: 0x3f7ed0, skyMid: 0x9cc4ec, skyHor: 0xdfe6e0, glow: 0xfff0c0, cloudLit: 0xffffff, cloudShade: 0x8aa0c0, cloudAmt: 0.5, exposure: 0.96, sunSize: 0.03 },
  },
  capua: {
    name: 'Capua Amphitheatre', blurb: 'Weathered travertine at golden hour. The classic look.',
    stone: { kind: 'stone', tint: 0xffffff }, sand: { kind: 'sand', tint: 0xffffff, decal: 'rake' }, gold: 0xb8803a,
    crowd: { density: 1, rows: 99, pleb: null, pat: null, patLow: 0.55, patHigh: 0.07 }, velarium: true, banners: { tint: 0xffffff, count: 56 }, torch: 0, dress: [], horizon: null,
    base: 'golden', sky: { sunElev: 46, sunAz: 205 },
  },
  colosseum: {
    name: 'Colosseum, Rome', blurb: 'Gleaming marble, the imperial box and the velarium. Torchlit by night.',
    stone: { kind: 'marble', tint: 0xfff6e4 }, sand: { kind: 'sand', tint: 0xfff2dc, decal: 'medallion' }, gold: 0xe8c060,
    crowd: { density: 1, rows: 99, pleb: [0xe8dcc0, 0xd8c8a0, 0xc9a66b, 0xf0e8d4, 0xb58a5a, 0xe9e0cc, 0xa8784a], pat: [0xf4efe2, 0xf4efe2, 0x5a1f5e, 0x7a1f3c, 0xe9e0cc, 0xffffff], patLow: 0.8, patHigh: 0.2 },
    velarium: true, velTint: 0xfff0d8, banners: { tint: 0xffffff, count: 56 }, torch: 0.1, dress: ['imperial'], horizon: 'city',
    base: 'golden', sky: { sunElev: 42, sunAz: 215, sunColor: 0xffd9a8, hemiSky: 0xb0a8d8, sunInt: 3.4, exposure: 0.92 },
    night: { lights: true, exposure: 1.35, sunScale: 0.6 },
  },
  desert: {
    name: 'Desert Pit', blurb: 'Bleached sandstone under a white sun. Thin, hardy crowd in robes.',
    stone: { kind: 'sandstone', tint: 0xffe6b4 }, sand: { kind: 'sand', tint: 0xfff0c8, decal: 'cracks' }, gold: 0xc8962f,
    crowd: { density: 0.62, rows: 99, pleb: [0xf0e4c8, 0xe0d0a8, 0xd8c090, 0xc8a878, 0xb89868, 0xf4ecd8, 0xa87850], pat: [0x8a2f2f, 0xe6d6a0], patLow: 0.12, patHigh: 0.03 },
    velarium: true, velTint: 0xd8b078, banners: { tint: 0xe0b070, count: 40 }, torch: 0.05, dress: ['obelisks'], horizon: 'dunes',
    base: 'golden', sky: { sunElev: 66, sunAz: 200, sunColor: 0xfff4dc, sunInt: 3.9, hemiSky: 0xd8c8a8, hemiGround: 0xd9b078, hemiInt: 1.5, fog: 0xe8c48c, fogDensity: 0.0098, skyTop: 0x5a8ed0, skyMid: 0xe6c8a0, skyHor: 0xf8dca8, glow: 0xfff0b0, cloudAmt: 0.15, cloudLit: 0xfff4dc, cloudShade: 0xc8a878, exposure: 1.0 },
  },
  gaul: {
    name: 'Snowy Gaul Arena', blurb: 'A frozen bowl in the northern hills: snow on the stands, furs in the crowd.',
    stone: { kind: 'snowstone', tint: 0xf4f8ff }, sand: { kind: 'snow', tint: 0xffffff, decal: 'snow' }, gold: 0x9aa8c0,
    crowd: { density: 0.8, rows: 99, pleb: [0xdfe6ee, 0xb8c4d4, 0x8a9ab4, 0x6a7a94, 0x7a5a44, 0xeef2f6, 0x4a5a74, 0x9a4a38], pat: [0x2a4a8a, 0xf0f4fa], patLow: 0.18, patHigh: 0.05 },
    velarium: false, banners: { tint: 0xa8c0f0, count: 56 }, torch: 0.35, dress: ['snowdrifts', 'snowfall'], horizon: 'peaks',
    base: 'golden', sky: { sunElev: 24, sunAz: 160, sunColor: 0xdce8ff, sunInt: 2.3, hemiSky: 0xaec4ea, hemiGround: 0xe8f0ff, hemiInt: 1.75, fog: 0xd0dcec, fogDensity: 0.0088, skyTop: 0x7e94b8, skyMid: 0xb8c8de, skyHor: 0xe4ecf6, glow: 0xdce8ff, cloudLit: 0xf4f8ff, cloudShade: 0x8a98b4, cloudAmt: 0.95, exposure: 0.95, sunSize: 0.026 },
  },
  etna: {
    name: 'Etna Festival Arena', blurb: 'Basalt stands at the foot of the volcano: embers, glowing fissures, red sky.',
    stone: { kind: 'basalt', tint: 0xffe0d0 }, sand: { kind: 'ash', tint: 0xffffff, decal: 'ash' }, gold: 0xd0702a, glowSand: true,
    crowd: { density: 0.9, rows: 99, pleb: [0x7a2a1c, 0x5a2a24, 0x9a4a2a, 0x3a2a2a, 0x8a6a4a, 0xb86a2a], pat: [0x1a1418, 0x7a1f1f], patLow: 0.2, patHigh: 0.06 },
    velarium: false, banners: { tint: 0xff9a60, count: 56 }, torch: 0.75, dress: ['embers'], horizon: 'volcano',
    base: 'dusk', sky: { sunElev: 14, sunAz: 250, sunColor: 0xff8a50, sunInt: 3.6, hemiSky: 0xb08090, hemiGround: 0xc07850, hemiInt: 2.0, fog: 0x6a3a34, fogDensity: 0.0062, skyTop: 0x2a1a30, skyMid: 0x7a3a34, skyHor: 0xff7a40, glow: 0xff5a28, cloudLit: 0xff9a60, cloudShade: 0x3a2028, cloudAmt: 0.8, stars: 0, exposure: 1.2, night: 0.3 },
  },
};
export const THEME_IDS = Object.keys(THEMES);

/** choose a theme id from the fight meta {weather, league, season, kind, festival}. Order: game mode, weather, festival, tournament, league. */
export function pickTheme(m = {}) {
  const lg = m.league | 0, season = m.season || 1, kind = m.kind || '', wx = m.weather || 'clear';
  if (m.theme && THEMES[m.theme]) return m.theme;                 // explicit override (lab, screenshots, tests)
  if (kind === 'pit') return 'etna';
  if (kind === 'horde') return 'desert';
  if (kind === 'bounty') return 'sandpit';
  if (wx === 'dust') return 'desert';
  if (wx === 'rain' && lg >= 1) return 'gaul';
  if (m.festival === 'mars' || m.festival === 'bacchus') return 'etna';
  if (kind === 'grand' || lg >= 3) return 'colosseum';
  if (kind === 'tourney') return lg >= 2 ? 'colosseum' : 'capua';
  if (lg === 0) return 'sandpit';
  if (lg === 1) return 'capua';
  return ['capua', 'gaul', 'desert'][(season - 1) % 3];
}
/** true when this theme should be lit as a torchlit night (weather night, or the evening finals of an Imperial season) */
export function themeNight(id, m = {}) { return (m.weather === 'night') || (id === 'colosseum' && m.kind === 'grand' && (m.season || 1) % 2 === 0); }

function weatherSky(base, wx) {
  const p = Object.assign({}, base);
  if (wx === 'rain') Object.assign(p, { sunInt: base.sunInt * 0.4, hemiInt: base.hemiInt * 1.1, fog: 0x8a93a8, fogDensity: Math.max(base.fogDensity, 0.012), exposure: 0.95, cloudAmt: 0.95, glow: 0x9aa6bd, skyTop: 0x4a5670, skyMid: 0x7a869d, skyHor: 0xa7afc0 });
  if (wx === 'dust') Object.assign(p, { fog: 0xd9a066, fogDensity: Math.max(base.fogDensity, 0.014), sunInt: base.sunInt * 0.75, skyHor: 0xe0b078, skyMid: 0xc89a6a });
  if (wx === 'heat') Object.assign(p, { fog: 0xffc47a, sunInt: base.sunInt * 1.1, exposure: Math.max(base.exposure, 1.0) });
  return p;
}
const rgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
/** small seamless ground texture (snow, ash): two colors blended by fbm, optional bright specks. Returns {map,bump}. */
function makeGroundTex(size, c1, c2, seed, { speck = 0, speckC = 0xffffff, per = 8 } = {}) {
  const cv = document.createElement('canvas'), bv = document.createElement('canvas'); cv.width = cv.height = bv.width = bv.height = size;
  const x = cv.getContext('2d'), bx = bv.getContext('2d'), id = x.createImageData(size, size), bd = bx.createImageData(size, size);
  const A = rgb(c1), B = rgb(c2), Sp = rgb(speckC);
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const u = px / size, v = py / size, n = tfbm(u * per, v * per, per, 4, seed), sp = tnoise(u * size / 2, v * size / 2, size / 2, seed + 3) > 1 - speck ? 1 : 0, i = (py * size + px) * 4;
    for (let c = 0; c < 3; c++) id.data[i + c] = (A[c] + (B[c] - A[c]) * n) * (1 - sp) + Sp[c] * sp;
    id.data[i + 3] = 255; const hh = Math.round(255 * (0.45 + n * 0.4)); bd.data[i] = bd.data[i + 1] = bd.data[i + 2] = hh; bd.data[i + 3] = 255;
  }
  x.putImageData(id, 0, 0); bx.putImageData(bd, 0, 0);
  const mk = (c, srgb) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
  return { map: mk(cv, true), bump: mk(bv, false) };
}

export function createArena({ crowd = 3700, density = 1, decalRes = 2048, seed = 7, lite = false } = {}) {
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const group = new THREE.Group(); group.name = 'arena';
  const U = { uTime: { value: 0 }, uHype: { value: 0 }, uWave: { value: 0 }, uWaveSpeed: { value: 1.5 }, uWaveK: { value: 2 }, uAxisR: { value: SA / SB }, uWind: { value: 1 } };
  const stone = makeStoneTexture(512, { bx: 4, by: 6, seed: 11 });
  const sandTex = makeSandTexture(1024, 3);
  stone.map.anisotropy = sandTex.map.anisotropy = 8;

  // ---------------- merged stone: podium wall, seating, promenade, facade (one draw call) ----------------
  const N = 160, AISLES = 16, per = N / AISLES;
  const GATE_HALF = 0.118;
  const angDist = (a, b) => Math.abs(((a - b + Math.PI * 3) % TAU) - Math.PI);
  const inGate = (th) => angDist(th, 0) < GATE_HALF || angDist(th, Math.PI) < GATE_HALF;
  const rowsInfo = [];      // {d, y, tw} per seat row (crowd rows)
  const segs = [];
  // podium wall (faces arena) with AO + purple frieze + gold line
  segs.push({ a: [0, 0], b: [0, 1.5], ca: [0.5, 0.45, 0.42], cb: [0.9, 0.86, 0.8], face: 'in', gate: true });
  segs.push({ a: [0, 1.5], b: [0, 1.95], ca: [0.92, 0.88, 0.82], cb: [0.95, 0.9, 0.84], face: 'in', gate: true, v0: 1.5 });
  const FRIEZE = [[0.62, 0.3, 0.68], [0.55, 0.28, 0.62]];
  segs.push({ a: [-0.02, 1.95], b: [-0.02, 2.45], ca: FRIEZE[0], cb: FRIEZE[1], face: 'in', gate: true, v0: 1.95 });
  segs.push({ a: [-0.03, 2.45], b: [-0.03, 2.58], ca: [1.2, 0.95, 0.4], cb: [1.2, 0.95, 0.4], face: 'in', gate: true, v0: 2.45 });
  segs.push({ a: [0, 2.58], b: [0, PH], ca: [0.98, 0.94, 0.88], cb: [1.0, 0.96, 0.9], face: 'in', gate: true, v0: 2.58 });
  segs.push({ a: [-0.2, PH], b: [0.25, PH], ca: 1.0, cb: 1.0, face: 'up', gate: true });                   // coping
  segs.push({ a: [-0.2, PH - 0.0], b: [-0.2, PH - 0.22], ca: 0.9, cb: 0.7, face: 'in', gate: true });
  let d = 0.25, y = PH;
  for (let k = 0; k < 15; k++) {
    if (k === 9) {                                                                                // praecinctio: wide walkway + balteus wall
      segs.push({ a: [d, y], b: [d, y + 1.1], ca: [0.55, 0.5, 0.48], cb: [1, 0.96, 0.9], face: 'in', v0: 0 }); y += 1.1;
      segs.push({ a: [d, y], b: [d + 1.4, y], ca: 1.0, cb: 0.78, face: 'up' }); d += 1.4;
    }
    const rise = 0.5, tw = 0.85;
    segs.push({ a: [d, y], b: [d, y + rise], ca: 0.62, cb: 1.0, face: 'in', v0: k * 0.5 }); y += rise;
    segs.push({ a: [d, y], b: [d + tw, y], ca: 1.0, cb: 0.74, face: 'up' });
    rowsInfo.push({ d, y, tw }); d += tw;
  }
  const dEnd = d, yTop = y;
  const dIn = FD - 1.2;
  segs.push({ a: [dEnd, yTop], b: [dIn, yTop], ca: 0.85, cb: 0.7, face: 'up' });                    // promenade
  const gal = [[yTop, 12.6], [12.6, 16.6], [16.6, FH]];
  segs.push({ a: [dIn, yTop], b: [dIn, 12.6], ca: 0.5, cb: 0.9, face: 'in' });
  segs.push({ a: [dIn, 12.6], b: [dIn, 16.6], ca: 0.9, cb: 1.0, face: 'in', v0: 12.6 });
  segs.push({ a: [dIn, 16.6], b: [dIn, FH], ca: 1.0, cb: 0.92, face: 'in', v0: 16.6 });
  void gal;
  segs.push({ a: [dIn, FH], b: [FD + 0.1, FH], ca: 1.0, cb: 1.0, face: 'up' });                    // parapet cap
  for (let t = 0; t < 3; t++) {                                                                      // facade outer, per tier with under-cornice shadow
    const y0 = t * TIER, y1 = (t + 1) * TIER;
    segs.push({ a: [FD, y0], b: [FD, y1 - 0.9], ca: t === 0 ? [0.62, 0.55, 0.5] : [0.88, 0.84, 0.78], cb: 1.0, face: 'out', v0: y0 });
    segs.push({ a: [FD, y1 - 0.9], b: [FD, y1], ca: 1.0, cb: 0.7, face: 'out', v0: y1 - 0.9 });
    const cy0 = y1, cy1 = y1 + 0.38;                                                                  // cornice ring
    segs.push({ a: [FD + 0.3, cy0 - 0.12], b: [FD + 0.3, cy1], ca: 0.95, cb: 1.05, face: 'out', v0: 0 });
    segs.push({ a: [FD, cy0 - 0.12], b: [FD + 0.3, cy0 - 0.12], ca: 0.5, cb: 0.55, face: 'down' });
    segs.push({ a: [FD, cy1], b: [FD + 0.3, cy1], ca: 1.1, cb: 1.1, face: 'up' });
    if (t < 2) { /* tier continues above cornice; wall above starts at cy1 but we already span to y1; fine */ }
  }
  segs.push({ a: [FD, 3 * TIER + 0.38], b: [FD, FH], ca: 0.9, cb: 0.95, face: 'out', v0: 3 * TIER });  // attic
  segs.push({ a: [FD + 0.4, FH - 0.5], b: [FD + 0.4, FH + 0.05], ca: 1.0, cb: 1.1, face: 'out' });   // crown cornice
  segs.push({ a: [FD, FH - 0.5], b: [FD + 0.4, FH - 0.5], ca: 0.5, cb: 0.5, face: 'down' });
  segs.push({ a: [FD, FH + 0.05], b: [FD + 0.4, FH + 0.05], ca: 1.1, cb: 1.1, face: 'up' });

  const stoneGeo = sweep(segs, N, {
    skip: (j, th, sg) => sg.gate && inGate(th),
    tint: (j, sg) => ((j % per) === 0 && sg.face !== 'out' && sg.a[1] >= PH) ? 0.72 : 1,
  });
  const stoneMat = new THREE.MeshStandardMaterial({ map: stone.map, bumpMap: stone.bump, bumpScale: 2.2, vertexColors: true, roughness: 0.93, metalness: 0 });
  const stoneMesh = new THREE.Mesh(stoneGeo, stoneMat); stoneMesh.castShadow = stoneMesh.receiveShadow = true; stoneMesh.name = 'stone';
  group.add(stoneMesh);

  // ---------------- sand floor + decal ----------------
  const sandGeo = (() => {
    const R = 12, S = 96, pos = [], uv = [], col = [], idx = [], nor = [];
    pos.push(0, 0, 0); uv.push(0, 0); col.push(1.05, 1.0, 0.95); nor.push(0, 1, 0);
    for (let r = 1; r <= R; r++) for (let j = 0; j < S; j++) {
      const th = (j / S) * TAU, f = r / R, x = Math.cos(th) * SA * f, z = Math.sin(th) * SB * f;
      pos.push(x, 0, z); uv.push(x / 5, z / 5);
      const ao = 1 - 0.38 * Math.pow(Math.max(0, (f - 0.7) / 0.3), 1.6);
      col.push(ao * 1.0, ao * 0.97, ao * 0.95); nor.push(0, 1, 0);
    }
    for (let j = 0; j < S; j++) idx.push(0, 1 + ((j + 1) % S), 1 + j);
    for (let r = 1; r < R; r++) for (let j = 0; j < S; j++) {
      const a = 1 + (r - 1) * S + j, b = 1 + (r - 1) * S + ((j + 1) % S), c = 1 + r * S + j, e = 1 + r * S + ((j + 1) % S);
      idx.push(a, b, c, b, e, c);
    }
    const g = new THREE.BufferGeometry(); g.setIndex(idx);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    return g;
  })();
  const sandMat = new THREE.MeshStandardMaterial({ map: sandTex.map, bumpMap: sandTex.bump, bumpScale: 2.0, vertexColors: true, roughness: 1, metalness: 0 });
  const sand = new THREE.Mesh(sandGeo, sandMat); sand.receiveShadow = true; sand.name = 'sand'; group.add(sand);

  const DW = decalRes, DH = Math.round(decalRes * SB / SA);
  const dc = document.createElement('canvas'); dc.width = DW; dc.height = DH; const dx = dc.getContext('2d');
  const decalTex = new THREE.CanvasTexture(dc); decalTex.colorSpace = THREE.SRGBColorSpace; decalTex.anisotropy = 1;
  // no mipmaps: regenerating a 2048 mip chain on every upload makes some (mobile) GPUs show black blocks for a frame
  decalTex.generateMipmaps = false; decalTex.minFilter = THREE.LinearFilter; decalTex.magFilter = THREE.LinearFilter;
  const ppm = DW / (2 * SA);
  const toPx = (x, z) => [(x + SA) * ppm, (z + SB) * ppm];
  // base decal layer (raked sand by default). Themes repaint it with another style (see THEMES.decal); footprints and scuffs paint on top.
  function paintDecal(style, rnd) {
    dx.clearRect(0, 0, DW, DH); dx.lineCap = 'round';
    const ell = (cx, cy, rx, ry) => { dx.beginPath(); dx.ellipse(cx, cy, rx, ry, 0, 0, TAU); };
    if (style === 'snow') { dx.fillStyle = 'rgba(236,244,255,0.62)'; dx.fillRect(0, 0, DW, DH); }
    if (style === 'ash') { dx.fillStyle = 'rgba(30,18,18,0.28)'; dx.fillRect(0, 0, DW, DH); }
    const rings = style === 'ruts' ? 14 : style === 'cracks' || style === 'ash' ? 0 : 46;
    for (let i = 0; i < rings; i++) {
      const f = 0.12 + i * (style === 'ruts' ? 0.06 : 0.019) + rnd() * 0.004; const dark = i % 2;
      dx.strokeStyle = style === 'snow' ? (dark ? 'rgba(90,100,120,0.12)' : 'rgba(255,255,255,0.16)') : dark ? 'rgba(120,92,58,0.10)' : 'rgba(255,240,205,0.09)'; dx.lineWidth = Math.max(1.5, ppm * (dark ? 0.05 : 0.04));
      dx.beginPath(); dx.ellipse(DW / 2, DH / 2, (SA - 0.4) * f * ppm * 1.0, (SB - 0.4) * f * ppm * 1.0, 0, 0, TAU); dx.stroke();
    }
    // trampled patches: many soft darker blotches, dense near the centre, thinning out (fighting-circle wear)
    const wear = style === 'snow' ? '96,84,72' : style === 'ash' ? '10,6,6' : style === 'cracks' ? '150,110,64' : '122,92,58';
    const nWear = style === 'ruts' ? 130 : style === 'snow' ? 120 : 90;
    for (let i = 0; i < nWear; i++) {
      const a = rnd() * TAU, d = Math.pow(rnd(), 1.6) * 0.62, rx = (0.7 + rnd() * 1.9) * ppm, ry = rx * (0.45 + rnd() * 0.4);
      const cx0 = DW / 2 + Math.cos(a) * d * SA * ppm, cy0 = DH / 2 + Math.sin(a) * d * SB * ppm * 1.1;
      dx.save(); dx.translate(cx0, cy0); dx.rotate(rnd() * Math.PI); dx.scale(1, ry / rx);
      const g = dx.createRadialGradient(0, 0, 0, 0, 0, rx); const al = (style === 'snow' ? 0.14 : 0.07) + (1 - d) * (style === 'snow' ? 0.22 : 0.10);
      g.addColorStop(0, `rgba(${wear},${al})`); g.addColorStop(1, `rgba(${wear},0)`); dx.fillStyle = g; dx.fillRect(-rx, -rx, rx * 2, rx * 2); dx.restore();
    }
    if (style === 'ruts') {
      dx.strokeStyle = 'rgba(70,48,28,0.34)'; dx.lineWidth = ppm * 0.18;
      for (let i = 0; i < 6; i++) { const z0 = (rnd() - 0.5) * 2 * SB * 0.8 * ppm + DH / 2; dx.beginPath(); dx.moveTo(DW * 0.05, z0); dx.bezierCurveTo(DW * 0.35, z0 + (rnd() - 0.5) * ppm * 3, DW * 0.65, z0 + (rnd() - 0.5) * ppm * 3, DW * 0.95, z0 + (rnd() - 0.5) * ppm * 2); dx.stroke(); }
      dx.strokeStyle = 'rgba(214,186,110,0.5)'; dx.lineWidth = Math.max(1, ppm * 0.03);
      for (let i = 0; i < 260; i++) { const x0 = rnd() * DW, y0 = rnd() * DH, a = rnd() * TAU; dx.beginPath(); dx.moveTo(x0, y0); dx.lineTo(x0 + Math.cos(a) * ppm * 0.35, y0 + Math.sin(a) * ppm * 0.35); dx.stroke(); }
    }
    if (style === 'cracks' || style === 'ash') {
      const glow = style === 'ash';
      for (let i = 0; i < (glow ? 26 : 34); i++) {
        let x0 = rnd() * DW, y0 = rnd() * DH, a = rnd() * TAU; const wob = 0.5 + rnd();
        dx.strokeStyle = glow ? `rgba(255,${110 + Math.floor(rnd() * 70)},30,${0.7 + rnd() * 0.3})` : 'rgba(82,56,32,0.45)'; dx.lineWidth = Math.max(1.5, ppm * (glow ? 0.07 : 0.045) * (0.6 + rnd()));
        dx.beginPath(); dx.moveTo(x0, y0);
        for (let k = 0; k < 9; k++) { a += (rnd() - 0.5) * wob; x0 += Math.cos(a) * ppm * 0.9; y0 += Math.sin(a) * ppm * 0.9; dx.lineTo(x0, y0); }
        dx.stroke();
      }
    }
    if (style === 'medallion') {
      dx.strokeStyle = 'rgba(242,193,78,0.22)'; dx.lineWidth = ppm * 0.18; ell(DW / 2, DH / 2, SA * 0.62 * ppm, SB * 0.62 * ppm); dx.stroke();
      dx.strokeStyle = 'rgba(122,48,110,0.16)'; dx.lineWidth = ppm * 0.45; ell(DW / 2, DH / 2, SA * 0.7 * ppm, SB * 0.7 * ppm); dx.stroke();
    }
    const cg = dx.createRadialGradient(DW / 2, DH / 2, 0, DW / 2, DH / 2, 7 * ppm);
    cg.addColorStop(0, style === 'ash' ? 'rgba(0,0,0,0.3)' : 'rgba(118,88,56,0.16)'); cg.addColorStop(1, 'rgba(118,88,56,0)'); dx.fillStyle = cg; dx.fillRect(DW / 2 - 7 * ppm, DH / 2 - 7 * ppm, 14 * ppm, 14 * ppm);
  }
  paintDecal('rake', rnd);
  let decalDirty = true;
  const decalGeo = sandGeo.clone(); {
    const p = decalGeo.attributes.position, uv = decalGeo.attributes.uv;
    for (let i = 0; i < p.count; i++) { p.setY(i, 0.012); uv.setXY(i, (p.getX(i) + SA) / (2 * SA), 1 - (p.getZ(i) + SB) / (2 * SB)); }
    decalGeo.deleteAttribute('color');
  }
  const decalMat = new THREE.MeshLambertMaterial({ map: decalTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const decal = new THREE.Mesh(decalGeo, decalMat); decal.receiveShadow = true; decal.renderOrder = 1; decal.name = 'sand_decal'; group.add(decal);

  function stampFootprint(x, z, heading = 0, scale = 1, side = 1) {
    const [px, pz] = toPx(x + Math.cos(heading + Math.PI / 2) * 0.1 * side * scale, z + Math.sin(heading + Math.PI / 2) * 0.1 * side * scale);
    dx.save(); dx.translate(px, pz); dx.rotate(heading);
    const L = 0.3 * scale * ppm, W = 0.11 * scale * ppm;
    dx.fillStyle = 'rgba(255,232,185,0.22)'; dx.beginPath(); dx.ellipse(-L * 0.04, 0, L * 0.62, W * 0.86, 0, 0, TAU); dx.fill();   // kicked-up rim
    dx.fillStyle = 'rgba(88,58,32,0.50)'; dx.beginPath(); dx.ellipse(-L * 0.12, 0, L * 0.30, W * 0.62, 0, 0, TAU); dx.fill();           // heel
    dx.beginPath(); dx.ellipse(L * 0.2, 0, L * 0.34, W * 0.7, 0, 0, TAU); dx.fill();                                                      // ball/toe
    dx.restore(); decalDirty = true;
  }
  function scuff(x0, z0, x1, z1, width = 0.5) {
    const [a, b] = toPx(x0, z0), [c, e] = toPx(x1, z1);
    dx.lineCap = 'round'; dx.strokeStyle = 'rgba(255,232,185,0.18)'; dx.lineWidth = width * ppm * 1.5; dx.beginPath(); dx.moveTo(a, b); dx.lineTo(c, e); dx.stroke();
    dx.strokeStyle = 'rgba(92,62,36,0.34)'; dx.lineWidth = width * ppm; dx.beginPath(); dx.moveTo(a, b); dx.lineTo(c, e); dx.stroke(); decalDirty = true;
  }

  // ---------------- void arches, archivolts, columns, windows, niches ----------------
  // PERF: every static repeated piece is BAKED into the mesh that shares its material (stone, void/dark MeshBasic, bronze) instead of one InstancedMesh each:
  // 14 fewer draw calls (the stone and its casters are drawn twice with the shadow pass). bakeIM(im) = the instances' geometry transformed by their matrices.
  const bakeIM = bakeInstances;
  const stoneParts = [], voidParts = [], bronzeParts = [], tunParts = [];
  const voidMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff });
  const archBase = archShape(1.15, 2.9, 1.15), voidGeo = new THREE.ShapeGeometry(archBase, 6);
  { const p = voidGeo.attributes.position, c = []; for (let i = 0; i < p.count; i++) { const t = Math.min(1, p.getY(i) / 4); c.push(0.012 + 0.05 * t, 0.009 + 0.03 * t, 0.02 + 0.045 * t); } voidGeo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); }
  const BAYS = 60;
  const outer = arcThetas(FD, BAYS, 0.5), pier = arcThetas(FD, BAYS, 0);   // arches at bay centers, columns at boundaries
  const voidMats = [];
  const archM = [];
  for (let t = 0; t < 3; t++) for (let i = 0; i < BAYS; i++) archM.push(ringMatrix(FD, outer.thetas[i], t * TIER + 0.05, { inward: false, dOff: 0.05 }));
  const inner = arcThetas(dIn, BAYS, 0.5);
  for (let i = 0; i < BAYS; i++) archM.push(ringMatrix(dIn, inner.thetas[i], 12.7, { inward: true, dOff: -0.04, scale: 0.98 }));
  const voidMesh = new THREE.InstancedMesh(voidGeo, voidMat, archM.length); archM.forEach((m, i) => voidMesh.setMatrixAt(i, m)); voidMesh.name = 'arch_voids';
  voidParts.push(...bakeIM(voidMesh));
  // archivolt (stone ring around each opening)
  const hole = new THREE.Path(); hole.moveTo(-1.15, 0); hole.lineTo(-1.15, 2.9); hole.absellipse(0, 2.9, 1.15, 1.15, Math.PI, 0, true); hole.lineTo(1.15, 0); hole.lineTo(-1.15, 0);
  const ringShape = new THREE.Shape(); ringShape.moveTo(-1.5, 0); ringShape.lineTo(1.5, 0); ringShape.lineTo(1.5, 2.9); ringShape.absellipse(0, 2.9, 1.5, 1.5, 0, Math.PI, false); ringShape.lineTo(-1.5, 0); ringShape.holes.push(hole);
  const ringGeo = prepGeo(new THREE.ExtrudeGeometry(ringShape, { depth: 0.45, bevelEnabled: false, curveSegments: 4 }), { uvScale: 0.25 });
  { const c = ringGeo.attributes.color, p = ringGeo.attributes.position; for (let i = 0; i < p.count; i++) { const k = 0.8 + 0.2 * Math.min(1, p.getY(i) / 4); c.setXYZ(i, k, k, k); } }
  const ringMesh = new THREE.InstancedMesh(ringGeo, stoneMat, archM.length); ringMesh.castShadow = ringMesh.receiveShadow = true;
  archM.forEach((m, i) => { const mm = m.clone(); const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(); mm.decompose(p, q, sc); const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q); p.addScaledVector(fwd, -0.05); ringMesh.setMatrixAt(i, new THREE.Matrix4().compose(p, q, sc)); });
  stoneParts.push(...bakeIM(ringMesh));
  // engaged half-columns between the arches (3 tiers) + attic windows
  const colGeo = prepGeo(new THREE.CylinderGeometry(0.34, 0.4, TIER - 0.5, 10, 1), { uvScale: 0.5 });
  { const c = colGeo.attributes.color, p = colGeo.attributes.position; for (let i = 0; i < p.count; i++) { const k = 0.72 + 0.28 * (p.getY(i) / (TIER - 0.5) + 0.5); c.setXYZ(i, k, k, k); } }
  const colMesh = new THREE.InstancedMesh(colGeo, stoneMat, BAYS * 3);
  for (let t = 0; t < 3; t++) for (let i = 0; i < BAYS; i++) { const m = ringMatrix(FD, pier.thetas[i], t * TIER + (TIER - 0.5) / 2 + 0.05, { inward: false, dOff: 0.12 }); colMesh.setMatrixAt(t * BAYS + i, m); }
  stoneParts.push(...bakeIM(colMesh));
  const winGeo = (() => { const g = new THREE.PlaneGeometry(0.9, 1.5); g.translate(0, 0.75, 0); const c = []; const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const t = p.getY(i) / 1.5; c.push(0.01 + 0.04 * t, 0.008 + 0.025 * t, 0.016 + 0.04 * t); } g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); return g; })();
  const winMesh = new THREE.InstancedMesh(winGeo, voidMat, BAYS * 2);
  for (let i = 0; i < BAYS; i++) { winMesh.setMatrixAt(i, ringMatrix(FD, outer.thetas[i], 3 * TIER + 0.9, { inward: false, dOff: 0.06 })); winMesh.setMatrixAt(BAYS + i, ringMatrix(dIn, inner.thetas[i], 16.8, { inward: true, dOff: -0.04, scale: { x: 0.7, y: 0.6, z: 1 } })); }
  voidParts.push(...bakeIM(winMesh));
  // podium niches with iron bars (ground-level wall detail)
  const nicheShape = archShape(0.5, 1.0, 0.5), nicheGeo = new THREE.ShapeGeometry(nicheShape, 8);
  { const p = nicheGeo.attributes.position, c = []; for (let i = 0; i < p.count; i++) { const t = Math.min(1, p.getY(i) / 1.6); c.push(0.006 + 0.03 * t, 0.005 + 0.02 * t, 0.01 + 0.03 * t); } nicheGeo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); }
  const nich = arcThetas(0, 44, 0.5).thetas.filter((th) => !inGate(th) && angDist(th, Math.PI / 2) > 0.05);
  const nicheMesh = new THREE.InstancedMesh(nicheGeo, voidMat, nich.length);
  nich.forEach((th, i) => nicheMesh.setMatrixAt(i, ringMatrix(0, th, 0.35, { inward: true, dOff: -0.04 })));
  voidParts.push(...bakeIM(nicheMesh));
  { const vm = new THREE.Mesh(mergeGeos(voidParts), voidMat); vm.name = 'arch_voids'; group.add(vm); }
  const barParts = []; for (let k = -2; k <= 2; k++) { const b = new THREE.BoxGeometry(0.04, 1.55, 0.04); b.translate(k * 0.2, 0.9, 0); barParts.push(b); }
  { const b = new THREE.BoxGeometry(1.0, 0.04, 0.04); b.translate(0, 1.0, 0); barParts.push(b); const b2 = b.clone(); b2.translate(0, 0.45, 0); barParts.push(b2); }
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x3c3d44, metalness: 0.6, roughness: 0.55 });
  const barMesh = new THREE.InstancedMesh(mergeGeos(barParts), ironMat, nich.length);
  nich.forEach((th, i) => barMesh.setMatrixAt(i, ringMatrix(0, th, 0.35, { inward: true, dOff: -0.1 })));
  barMesh.castShadow = true; group.add(barMesh);
  // bronze clipei (round shields) between niches
  const clGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.06, 14); clGeo.rotateX(Math.PI / 2);
  const bronzeMat = new THREE.MeshStandardMaterial({ color: 0xb8803a, metalness: 0.75, roughness: 0.38 });
  const clTh = arcThetas(0, 44, 0).thetas.filter((th) => !inGate(th) && angDist(th, Math.PI / 2) > 0.05 && angDist(th, -Math.PI / 2) > 0.05);
  const clMesh = new THREE.InstancedMesh(clGeo, bronzeMat, clTh.length);
  clTh.forEach((th, i) => clMesh.setMatrixAt(i, ringMatrix(0, th, 1.0, { inward: true, dOff: -0.05 })));
  bronzeParts.push(...bakeIM(clMesh));

  // ---------------- gates: stone frame, tunnel, portcullis ----------------
  const hw = 1.7, gh = 1.75, rise = 0.9;
  const gateParts = [];
  const gateFrame = (() => {
    const o = new THREE.Shape(); o.moveTo(-hw - 0.8, 0); o.lineTo(hw + 0.8, 0); o.lineTo(hw + 0.8, PH + 0.1); o.lineTo(-hw - 0.8, PH + 0.1); o.lineTo(-hw - 0.8, 0);
    const h = new THREE.Path(); h.moveTo(-hw, 0); h.lineTo(hw, 0); h.lineTo(hw, gh); h.absellipse(0, gh, hw, rise, 0, Math.PI, false); h.lineTo(-hw, 0); o.holes.push(h);
    const g = prepGeo(new THREE.ExtrudeGeometry(o, { depth: 0.9, bevelEnabled: false, curveSegments: 8 }), { uvScale: 0.17 }); g.translate(0, 0, -0.45); return g;
  })();
  const tunnelGeo = new THREE.BoxGeometry(hw * 2 + 0.1, PH, 3.6); tunnelGeo.translate(0, PH / 2, -1.8 - 0.4);
  const tunnelMat = new THREE.MeshBasicMaterial({ color: 0x0b0912, side: THREE.BackSide });
  const gates = [];
  const gateMeshes = new THREE.Group();
  const portGeo = (() => {
    const parts = [];
    for (let k = -6; k <= 6; k++) { const b = new THREE.BoxGeometry(0.075, 3.0, 0.075); b.translate(k * 0.27, 1.5 - 0.1, 0); parts.push(b); const c = new THREE.ConeGeometry(0.06, 0.28, 5); c.rotateX(Math.PI); c.translate(k * 0.27, -0.24, 0); parts.push(c); }
    for (let k = 0; k < 6; k++) { const b = new THREE.BoxGeometry(hw * 2, 0.07, 0.08); b.translate(0, 0.4 + k * 0.52, 0.0); parts.push(b); }
    return mergeGeos(parts);
  })();
  const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), gh + rise - 0.02);
  const portMat = new THREE.MeshStandardMaterial({ color: 0x4a4b53, metalness: 0.65, roughness: 0.5, clippingPlanes: [clip] });
  for (let g = 0; g < 2; g++) {
    const th = g ? Math.PI : 0, m = ringMatrix(0, th, 0, { inward: true, dOff: -0.1 });
    const frame = new THREE.Mesh(gateFrame, stoneMat); frame.applyMatrix4(m); frame.castShadow = frame.receiveShadow = true;
    const tun = new THREE.Mesh(tunnelGeo, tunnelMat); tun.applyMatrix4(m);
    const port = new THREE.Mesh(portGeo, portMat); port.applyMatrix4(m); port.castShadow = true;
    const base = port.position.clone();
    stoneParts.push(frame.geometry.clone().applyMatrix4(frame.matrix)); tunParts.push(tun.geometry.clone().applyMatrix4(tun.matrix));
    gateMeshes.add(port); gates.push({ port, base, dir: new THREE.Vector3(0, 1, 0) });
  }
  group.add(gateMeshes);
  { const tm = new THREE.Mesh(mergeGeos(tunParts), tunnelMat); tm.name = 'gate_tunnels'; group.add(tm); }
  { const old = stoneMesh.geometry; stoneMesh.geometry = mergeGeos([old, ...stoneParts]); old.dispose(); }
  function setGate(open, side) { gates.forEach((g, i) => { if (side === undefined || side === i) g.port.position.copy(g.base).addScaledVector(g.dir, open * (gh + rise + 0.3)); }); }
  setGate(0);

  // ---------------- torches / braziers ----------------
  const torchGeo = mergeGeos([(() => { const c = new THREE.CylinderGeometry(0.035, 0.045, 0.9, 6); c.translate(0, 0.45, 0); return c; })(), (() => { const c = new THREE.CylinderGeometry(0.14, 0.05, 0.22, 8); c.translate(0, 0.98, 0); return c; })(), (() => { const b = new THREE.BoxGeometry(0.08, 0.08, 0.22); b.translate(0, 0.2, -0.1); return b; })()]);
  const tTh = arcThetas(0, 28, 0.25).thetas.filter((th) => !inGate(th) && angDist(th, Math.PI / 2) > 0.1 && angDist(th, -Math.PI / 2) > 0.1);
  const torchMesh = new THREE.InstancedMesh(torchGeo, bronzeMat, tTh.length);
  const flamePts = [];
  tTh.forEach((th, i) => { const m = ringMatrix(0, th, 1.55, { inward: true, dOff: -0.25 }); torchMesh.setMatrixAt(i, m); const p = new THREE.Vector3().setFromMatrixPosition(m); flamePts.push({ x: p.x, y: p.y + 1.05, z: p.z, s: 0.8 }); });
  bronzeParts.push(...bakeIM(torchMesh));
  // brazier tripods flanking gates
  const brGeo = mergeGeos([(() => { const c = new THREE.CylinderGeometry(0.42, 0.2, 0.34, 10); c.translate(0, 1.15, 0); return c; })(), ...[0, 1, 2].map((k) => { const c = new THREE.CylinderGeometry(0.03, 0.04, 1.2, 5); c.translate(0.22, 0.6, 0); c.rotateY((k / 3) * TAU); return c; })]);
  const brPos = [[SA - 2.6, 2.7], [SA - 2.6, -2.7], [-SA + 2.6, 2.7], [-SA + 2.6, -2.7]];
  const brMesh = new THREE.InstancedMesh(brGeo, bronzeMat, 4);
  brPos.forEach(([x, z], i) => { brMesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0, z)); flamePts.push({ x, y: 1.3, z, s: 1.7 }); });
  bronzeParts.push(...bakeIM(brMesh));
  { const bm = new THREE.Mesh(mergeGeos(bronzeParts), bronzeMat); bm.name = 'bronze_fittings'; bm.castShadow = !lite; group.add(bm); }
  const flames = createFlames(flamePts, { glowScale: 3.4 }); group.add(flames.group);

  // ---------------- banners (vertex sway) + masts ----------------
  const banGeo = new THREE.PlaneGeometry(1.4, 3.6, 3, 12); banGeo.translate(0, -1.8, 0);
  { const n = banGeo.attributes.position.count, v = new Float32Array(n), uvA = banGeo.attributes.uv; for (let i = 0; i < n; i++) v[i] = Math.pow(1 - uvA.getY(i), 1.4); banGeo.setAttribute('aSway', new THREE.BufferAttribute(v, 1)); }
  const bTh = arcThetas(dIn, 28, 0.5).thetas;
  const banCount = bTh.length + 28;
  const varAttr = new Float32Array(banCount);
  banGeo.setAttribute('aVar', new THREE.InstancedBufferAttribute(varAttr, 1));
  const banMat = patchMaterial(new THREE.MeshLambertMaterial({ map: makeBannerAtlas(), side: THREE.DoubleSide, alphaTest: 0.5 }), {
    key: 'banner', uniforms: { uTime: U.uTime, uWind: U.uWind },
    vPars: 'attribute float aSway; attribute float aVar; uniform float uTime, uWind;',
    vAfterUv: '#ifdef USE_MAP\n vMapUv.x = (vMapUv.x + aVar) / 3.0;\n#endif',
    vBody: `vec3 ip = instanceMatrix[3].xyz; float ph = ip.x*0.37 + ip.z*0.21;
      transformed.z += aSway * uWind * (sin(uTime*1.7 + ph + position.y*1.3) * 0.16 + sin(uTime*3.1 + ph*2.0 + position.y*2.0) * 0.05);
      transformed.x += aSway * uWind * sin(uTime*1.3 + ph) * 0.05;`,
  });
  const banMesh = new THREE.InstancedMesh(banGeo, banMat, banCount); banMesh.name = 'banners';
  bTh.forEach((th, i) => { varAttr[i] = i % 3; banMesh.setMatrixAt(i, ringMatrix(dIn, th, 16.3, { inward: true, dOff: -0.1 })); });
  const mastTh = arcThetas(FD - 0.5, 28, 0).thetas;
  const mastGeo = new THREE.CylinderGeometry(0.06, 0.1, 6.5, 6); mastGeo.translate(0, 3.25, 0);
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a3c26, roughness: 0.85 });
  const mastMesh = new THREE.InstancedMesh(mastGeo, woodMat, mastTh.length);
  mastTh.forEach((th, i) => {
    mastMesh.setMatrixAt(i, ringMatrix(FD - 0.5, th, FH, { inward: false }));
    const j = bTh.length + i; varAttr[j] = (i + 1) % 3;
    const m = ringMatrix(FD - 0.5, th, FH + 6.3, { inward: false, scale: 0.55, yaw: Math.PI / 2, dOff: 0.0 }); banMesh.setMatrixAt(j, m);
  });
  mastMesh.castShadow = !lite; group.add(mastMesh, banMesh);

  // ---------------- velarium: translucent striped sails ----------------
  const SAILS = 30, SEG = 6, RAD = 7, vN = SAILS * SEG, dInV = 5.5, dOutV = FD - 0.7;
  const vIdx = [];
  const cream = C(0xf3e6c8), terra = C(0xc4663f);
  // each sail owns its vertices (uv.x 0..1 per sail, parity picks cream/terracotta via vertex color)
  const sPos = [], sUv = [], sCol = [], sSw = [];
  for (let sIdx = 0; sIdx < SAILS; sIdx++) {
    const c = sIdx % 2 === 0 ? cream : terra, base = sPos.length / 3;
    for (let r = 0; r <= RAD; r++) for (let k = 0; k <= SEG; k++) {
      const th = ((sIdx * SEG + k) / vN) * TAU, f = k / SEG, sr = r / RAD, dd = lerp(dInV, dOutV, sr), p = P(dd, th);
      const sag = Math.sin(Math.PI * f) * (0.55 + 0.9 * Math.sin(Math.PI * sr)) * (0.3 + 0.7 * sr);
      sPos.push(p[0], lerp(15.0, 21.2, Math.pow(sr, 0.9)) - sag, p[1]); sUv.push(f, sr); sCol.push(c.r, c.g, c.b);
      sSw.push(Math.sin(Math.PI * f) * Math.sin(Math.PI * Math.min(1, sr * 1.15)) * (0.4 + 0.6 * (1 - sr)));
    }
    for (let r = 0; r < RAD; r++) for (let k = 0; k < SEG; k++) { const a = base + r * (SEG + 1) + k, b = a + 1, c2 = a + SEG + 1, d2 = c2 + 1; vIdx.push(a, c2, b, b, c2, d2); }
  }
  const velGeo = new THREE.BufferGeometry(); velGeo.setIndex(vIdx);
  velGeo.setAttribute('position', new THREE.Float32BufferAttribute(sPos, 3)); velGeo.setAttribute('uv', new THREE.Float32BufferAttribute(sUv, 2));
  velGeo.setAttribute('color', new THREE.Float32BufferAttribute(sCol, 3)); velGeo.setAttribute('aSway', new THREE.Float32BufferAttribute(sSw, 1)); velGeo.computeVertexNormals();
  const velMat = patchMaterial(new THREE.MeshLambertMaterial({ map: makeSailTexture(), vertexColors: true, side: THREE.DoubleSide, emissive: 0x6a3a1a }), {
    key: 'velarium', uniforms: { uTime: U.uTime, uWind: U.uWind },
    vPars: 'attribute float aSway; uniform float uTime, uWind;',
    vBody: 'transformed.y += aSway * uWind * (sin(uTime*0.9 + position.x*0.13 + position.z*0.11) * 0.28 + sin(uTime*1.9 + position.x*0.31) * 0.08);',
  });
  velMat.emissiveIntensity = 0.55;
  const velarium = new THREE.Mesh(velGeo, velMat); velarium.castShadow = true; velarium.receiveShadow = true; velarium.name = 'velarium'; group.add(velarium);

  // ---------------- crowd: ONE InstancedMesh, animated in the vertex shader ----------------
  // Round 3: readable spectators. Hi tier (91 tris): tapered torso, head, hair / cap / hood / laurel dome (15 tris, collapsed for the bald), two-segment arms with an
  // elbow. Lite (medium, low: 40 tris, unchanged geometry): same shader, no dome (a hair cap is painted on the head), one-segment arms. Per instance (aRand, aRand2):
  // skin, hair colour, headwear type, outfit (tunic with belt and sleeves / draped toga with folds / hooded cloak), a sash, standing fans (rows near the camera) and
  // senators (the imperial box). Arms: idle on the lap, clapping forearms, one arm waving or both arms cheering, all driven by uHype and the wave, zero CPU per frame.
  const parts = [];
  const addPart = (g, id) => { g = g.toNonIndexed(); const n = g.attributes.position.count; g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(id), 1)); parts.push(g); };
  { const g = new THREE.CylinderGeometry(0.2, 0.15, 0.62, lite ? 5 : 6, 1); g.translate(0, 0.39, 0); addPart(g, 0); }
  { const g = lite ? new THREE.OctahedronGeometry(0.14, 0) : new THREE.IcosahedronGeometry(0.135, 0); g.translate(0, 0.88, 0.01); addPart(g, 1); }
  { const g = lite ? new THREE.CylinderGeometry(0.04, 0.032, 0.34, 3, 1, true) : new THREE.CylinderGeometry(0.044, 0.034, 0.34, 4, 2, true); g.translate(-0.25, 0.51, 0); addPart(g, 2); }
  { const g = lite ? new THREE.CylinderGeometry(0.04, 0.032, 0.34, 3, 1, true) : new THREE.CylinderGeometry(0.044, 0.034, 0.34, 4, 2, true); g.translate(0.25, 0.51, 0); addPart(g, 3); }
  if (!lite) { const g = new THREE.SphereGeometry(0.152, 5, 2, 0, TAU, 0, Math.PI * 0.58); g.translate(0, 0.88, 0.0); addPart(g, 4); }
  const crowdGeo = mergeGeos(parts.map((g) => { if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; }));
  // seats
  const seats = [];
  const aisleHalfArc = 0.55;
  rowsInfo.forEach((row, k) => {
    const dSeat = row.d + row.tw * 0.6;
    const cnt = Math.round(arcThetas(dSeat, 8).length / 0.62);
    const { thetas } = arcThetas(dSeat, cnt, (k % 2) * 0.5);
    for (let i = 0; i < cnt; i++) {
      const th = thetas[i];
      const sp = Math.hypot(-Math.sin(th) * (SA + dSeat), Math.cos(th) * (SB + dSeat));       // arc speed
      const aisleF = (th / TAU) * AISLES; const dA = Math.abs(aisleF - Math.round(aisleF)) * (TAU / AISLES) * sp;
      if (dA < aisleHalfArc + 0.15) continue;
      if (inGate(th) && k < 2) { /* gate tunnel is under the first rows, seats are fine */ }
      seats.push({ th, d: dSeat, y: row.y, k });
    }
  });
  for (let i = seats.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [seats[i], seats[j]] = [seats[j], seats[i]]; }
  // featured spectators: senators in the two imperial boxes (instances 0..F-1, always inside the visible count, hidden unless the imperial dress is active)
  const boxM = [Math.PI / 2, -Math.PI / 2].map((th) => ringMatrix(rowsInfo[6].d + 0.3, th, rowsInfo[6].y + 0.02, { inward: true }));
  const featured = [];
  boxM.forEach((M) => [[-2.4, -0.75], [-1.2, -0.75], [0, -0.75], [1.2, -0.75], [2.4, -0.75], [-0.6, 0.05], [0.6, 0.05]].forEach(([x, z]) => featured.push(new THREE.Matrix4().multiplyMatrices(M, new THREE.Matrix4().makeTranslation(x, 0.5, z)))));
  const F = featured.length, baseN = Math.min(seats.length, crowd), total = baseN + F;
  const aRand = new Float32Array(total * 4), aRand2 = new Float32Array(total * 4);
  const inBox = new Uint8Array(total), isFeat = new Uint8Array(total);
  const palPleb = [0xb58a5a, 0x8a5a3a, 0xc9a66b, 0x7a5a3c, 0x9a4a38, 0xd8c8a0, 0x6a7a4a, 0xa6783f, 0xc0703a, 0x8a6d58, 0x5f6b7a, 0x3f5f8f, 0x8f3a34, 0x4f7a58, 0xc9a13c, 0x6b4a73, 0xe0d6bc, 0x2f3a4a];
  const palPat = [0xf4efe2, 0xe9e0cc, 0xf4efe2, 0x5a1f5e, 0xd8cfe0, 0x9a2f3c];
  const crowdMat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: false }), {
    key: 'crowd3' + (lite ? 'L' : 'H'), uniforms: { uTime: U.uTime, uHype: U.uHype, uWave: U.uWave, uWaveSpeed: U.uWaveSpeed, uWaveK: U.uWaveK, uAxisR: U.uAxisR },
    vPars: `attribute float aPart; attribute vec4 aRand; attribute vec4 aRand2; uniform float uTime, uHype, uWave, uWaveSpeed, uWaveK, uAxisR;
      varying float vPart; varying float vSkin; varying float vHair; varying float vLy; varying vec3 vR2; varying float vFlag; varying vec3 vLp; varying float vHy;`,
    vBody: `
      vec3 ip = instanceMatrix[3].xyz;
      float ang = atan(ip.z * uAxisR, ip.x);
      float wv = sin(ang * uWaveK - uTime * uWaveSpeed);
      float pulse = uWave * smoothstep(0.3, 0.95, wv);
      float ph = aRand.x * 6.2831;
      float fl = floor(aRand2.w), fw = fract(aRand2.w);
      float stand = step(0.5, fl) * step(fl, 1.5), sen = step(1.5, fl);
      float hype = uHype * (1.0 - 0.55 * sen);
      float beat = max(0.0, sin(uTime * (6.0 + aRand.w * 3.5) + ph));
      float hop = hype * beat * (0.06 + 0.16 * aRand.w) * (1.0 + 0.7 * stand);
      float idle = (0.012 + 0.012 * aRand.w) * sin(uTime * (1.1 + aRand.w * 0.8) + ph) * (0.3 + position.y);
      float stretch = 1.0 + pulse * 0.6 + hype * 0.04 * beat;
      float lift = stand * 0.38;
      vLy = position.y; vPart = aPart; vSkin = aRand.y; vHair = aRand.z; vR2 = aRand2.xyz; vFlag = fl; vLp = position;
      transformed.x += idle;
      transformed.y = (position.y + lift) * stretch + hop;
      if (aPart < 0.5) {
        float top = step(0.4, position.y);
        if (stand > 0.5) { transformed.y = mix(0.0, position.y + lift, top) * stretch + hop; transformed.xz *= mix(0.7, 1.0, top); }
      } else if (aPart > 3.5) {
        float t = aRand2.x, bald = step(0.84, t), hat = step(0.52, t) * step(t, 0.70), hood = step(0.70, t) * step(t, 0.84);
        vec3 rel = position - vec3(0.0, 0.88, 0.0);
        rel.y += 0.035 * smoothstep(0.0, 0.12, rel.z) * (1.0 - hood);
        vec3 sc = mix(vec3(1.0), vec3(1.1, 1.5, 1.1), hat); sc = mix(sc, vec3(1.18, 1.1, 1.22), hood); sc *= 1.0 - bald;
        rel.z -= 0.02 * hood; rel.y += 0.03 * hat;
        rel *= sc; transformed.xz = rel.xz + vec2(idle, 0.0); transformed.y = (0.88 + rel.y + lift) * stretch + hop;
      }
      if (aPart > 1.5 && aPart < 3.5) {
        float side = aPart < 2.5 ? -1.0 : 1.0;
        float raise = clamp(hype * 1.6 - aRand.z * 0.9 + pulse * 1.3, 0.0, 1.0);
        float oneArm = step(0.55, fw);
        float rr = side > 0.0 ? raise : raise * mix(1.0, 0.18, oneArm);
        float clap = (1.0 - rr) * smoothstep(0.1, 0.45, hype) * step(fw, 0.5) * (1.0 - sen * 0.7);
        float cb = 0.5 + 0.5 * sin(uTime * (7.0 + aRand.w * 3.0) + ph);
        vec3 rel = vec3(position.x - side * 0.25, position.y - 0.68, position.z);
        rel.xz *= 1.0 + 0.55 * step(position.y, 0.4);
        float bend = 0.4 + 1.15 * clap * (1.0 - 0.45 * cb) + rr * (0.2 + 0.45 * (0.5 + 0.5 * sin(uTime * 9.0 + ph + side)));
        float wb = step(position.y, 0.5);
        { vec3 e = rel - vec3(0.0, -0.17, 0.0); float cb2 = cos(-bend), sb2 = sin(-bend); vec3 r2 = vec3(e.x, e.y * cb2 - e.z * sb2, e.y * sb2 + e.z * cb2) + vec3(0.0, -0.17, 0.0); rel = mix(rel, r2, wb); }
        float fwd = 0.18 + clap * (0.95 + 0.2 * cb);
        { float cf = cos(-fwd), sf = sin(-fwd); rel = vec3(rel.x, rel.y * cf - rel.z * sf, rel.y * sf + rel.z * cf); }
        float a2 = rr * (2.55 + 0.45 * sin(uTime * 10.0 + ph)) - clap * 0.35 + 0.1;
        float cs = cos(a2), sn = sin(a2) * side;
        vec2 r = vec2(rel.x * cs - rel.y * sn, rel.x * sn + rel.y * cs);
        transformed.x = side * 0.25 + r.x + idle; transformed.z = rel.z;
        transformed.y = (0.68 + lift + r.y) * stretch + hop;
      }
      vHy = transformed.y;`,
    fPars: 'varying float vPart; varying float vSkin; varying float vHair; varying float vLy; varying vec3 vR2; varying float vFlag; varying vec3 vLp; varying float vHy;',
    fBody: `
      vec3 base = diffuseColor.rgb;
      vec3 skin = mix(mix(vec3(0.60, 0.36, 0.22), vec3(0.34, 0.17, 0.09), smoothstep(0.0, 0.5, vSkin)), vec3(0.14, 0.06, 0.03), smoothstep(0.5, 1.0, vSkin));
      float ou = vR2.z, sen = step(1.5, vFlag), toga = step(0.5, ou) * step(ou, 0.85), cloak = step(0.85, ou);
      toga = max(toga, sen); cloak *= 1.0 - sen;
      float hs = vR2.y * 6.0; vec3 hairC = hs < 1.0 ? vec3(0.012, 0.009, 0.007) : hs < 2.0 ? vec3(0.05, 0.03, 0.018) : hs < 3.0 ? vec3(0.13, 0.065, 0.03) : hs < 4.0 ? vec3(0.26, 0.09, 0.035) : hs < 5.0 ? vec3(0.34, 0.33, 0.32) : vec3(0.5, 0.35, 0.14);
      vec3 togaC = mix(vec3(0.7, 0.66, 0.56), base, 0.14 * (1.0 - sen)); togaC = mix(togaC, vec3(0.8, 0.77, 0.7), sen);
      togaC *= 0.8 + 0.2 * sin(vLp.x * 15.0 + vLp.y * 22.0);
      vec3 cloakC = base * vec3(0.55, 0.5, 0.5);
      if (vPart < 0.5) {
        vec3 c = base;
        c = mix(c, c * 0.45, step(0.335, vLy) * step(vLy, 0.385) * (1.0 - toga) * (1.0 - cloak));          // belt
        c = mix(c, togaC, toga); c = mix(c, cloakC, cloak);
        float band = 1.0 - smoothstep(0.02, 0.034, abs(vLp.x + (vLy - 0.4) * 0.35 - 0.06));               // purple stripe: broad on senators, thin on a few others
        c = mix(c, vec3(0.34, 0.05, 0.3), band * toga * max(sen, step(0.72, vR2.x)) * step(0.0, vLp.z + 0.05));
        c = mix(c, skin, step(0.69, vLy) * (1.0 - smoothstep(0.07, 0.1, length(vLp.xz))));               // neckline
        if (vFlag > 0.5 && vFlag < 1.5) c = mix(c, skin, 1.0 - smoothstep(0.0, 0.01, vHy - 0.5));        // standing fans: bare shins under the hem
        diffuseColor.rgb = c;
      } else if (vPart < 1.5) {
        vec3 hc = hairC; ${lite ? '' : 'hc = skin;'}
        ${lite ? 'diffuseColor.rgb = vLy > 0.925 ? hc : skin;' : 'diffuseColor.rgb = skin;'}
      } else if (vPart < 3.5) {
        float left = step(vPart, 2.5);
        float cover = max(cloak, toga * left);
        vec3 sl = mix(base, togaC, toga); sl = mix(sl, cloakC, cloak);
        float sleeve = max(cover, step(0.52, vLy) * step(0.4, vR2.x + vR2.y * 0.5) * (1.0 - toga));
        diffuseColor.rgb = mix(skin, sl, sleeve);
      } else {
        float t = vR2.x, wreath = step(0.40, t) * step(t, 0.52), hat = step(0.52, t) * step(t, 0.70), hood = step(0.70, t) * step(t, 0.84);
        vec3 hc = hairC;
        hc = mix(hc, vec3(0.2, 0.3, 0.07), wreath * (1.0 - smoothstep(0.03, 0.07, vLp.y - 0.88)));
        hc = mix(hc, mix(base * 1.05, vec3(0.64, 0.52, 0.3), step(0.5, fract(vR2.y * 7.0))), hat);
        hc = mix(hc, base * vec3(0.6, 0.55, 0.55), hood);
        diffuseColor.rgb = hc;
      }
      diffuseColor.rgb *= 0.55 + 0.45 * smoothstep(0.05, 0.85, vLy);`,
  });
  crowdGeo.setAttribute('aRand', new THREE.InstancedBufferAttribute(aRand, 4));
  crowdGeo.setAttribute('aRand2', new THREE.InstancedBufferAttribute(aRand2, 4));
  const crowdMesh = new THREE.InstancedMesh(crowdGeo, crowdMat, total); crowdMesh.name = 'crowd'; crowdMesh.receiveShadow = true; crowdMesh.frustumCulled = false;
  const col = new THREE.Color(), rc = ((a) => () => (a = (a * 16807) % 2147483647) / 2147483647)(99173), _fm = new THREE.Matrix4(), _fp = new THREE.Vector3(), _fq = new THREE.Quaternion(), _fs = new THREE.Vector3();
  for (let i = 0; i < F; i++) {   // senators: ivory togas with a purple stripe, wreaths or bald, grey and brown hair, one standing at the rail now and then
    crowdMesh.setMatrixAt(i, featured[i]); isFeat[i] = 1; col.setHex(0xf0ead8); crowdMesh.setColorAt(i, col);
    const r = rc(); aRand[i * 4] = rc(); aRand[i * 4 + 1] = 0.05 + rc() * 0.35; aRand[i * 4 + 2] = rc() * 0.4; aRand[i * 4 + 3] = rc();
    aRand2[i * 4] = r < 0.55 ? 0.46 : 0.9; aRand2[i * 4 + 1] = r < 0.5 ? 0.75 : 0.4; aRand2[i * 4 + 2] = 0.7; aRand2[i * 4 + 3] = 2 + rc();
  }
  for (let j = 0; j < baseN; j++) {
    const i = F + j, st = seats[j], n = NRM(st.d, st.th), p = P(st.d, st.th);
    const jit = (rnd() - 0.5) * 0.25;
    const yaw = Math.atan2(-n[0], -n[1]) + jit + (rnd() - 0.5) * 0.2;
    const sc = 0.92 + rnd() * 0.2;
    _q.setFromEuler(_e.set(0, yaw, 0)); crowdMesh.setMatrixAt(i, _m.compose(_p.set(p[0] + (rnd() - 0.5) * 0.1, st.y, p[1]), _q, _s.set(sc, sc * (0.95 + rnd() * 0.1), sc)));
    const patrician = st.k < 4 ? rnd() < 0.55 : rnd() < 0.07;
    col.setHex((patrician ? palPat : palPleb)[Math.floor(rnd() * (patrician ? palPat.length : palPleb.length))]);
    col.offsetHSL(0, (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.08);
    crowdMesh.setColorAt(i, col);
    aRand[i * 4] = rnd(); aRand[i * 4 + 1] = Math.pow(rnd(), 1.3); aRand[i * 4 + 2] = rnd(); aRand[i * 4 + 3] = rnd();
    const standing = rc() < (st.k < 5 ? 0.09 : 0.018);
    aRand2[i * 4] = rc(); aRand2[i * 4 + 1] = rc(); aRand2[i * 4 + 2] = patrician ? 0.5 + rc() * 0.35 : rc(); aRand2[i * 4 + 3] = (standing ? 1 : 0) + rc() * 0.999;
    for (let b = 0; b < 2; b++) { _fm.copy(boxM[b]).invert(); _fp.set(p[0], st.y, p[1]).applyMatrix4(_fm); if (Math.abs(_fp.x) < 3.9 && Math.abs(_fp.z) < 2.1 && Math.abs(_fp.y) < 1.4) inBox[i] = 1; }
  }
  crowdMesh.instanceMatrix.needsUpdate = true; if (crowdMesh.instanceColor) crowdMesh.instanceColor.needsUpdate = true;
  group.add(crowdMesh);
  const crowdTotal = total;
  let tierDensity = density, themeDensity = 1;
  const recount = () => { crowdMesh.count = F + Math.floor(baseN * Math.max(0, Math.min(1, tierDensity)) * themeDensity); };
  recount();

  // ---------------- blob shadows under braziers (cheap contact) ----------------
  group.add(createBlobShadows(brPos.map(([x, z]) => ({ x, y: 0, z, r: 0.9 })), { opacity: 0.5 }));


  // ================================================================= THEMES (runtime) =================================================================
  const TC = {}, lcg = (a) => () => (a = (a * 16807) % 2147483647) / 2147483647;
  const stoneTex = (kind) => TC['s' + kind] || (TC['s' + kind] = (() => {
    if (kind === 'stone') return stone;
    let t;
    if (kind === 'wood') t = makeStoneTexture(512, { bx: 2, by: 10, base: 0x9a6a3c, tint: 0x6a4222, mortar: 0x24120a, seed: 5 });
    else if (kind === 'marble') { t = makeMarbleTexture(512, 21); t.map.repeat.set(2, 2); t.bump.repeat.set(2, 2); }
    else if (kind === 'sandstone') t = makeStoneTexture(512, { bx: 3, by: 5, base: 0xe6c88c, tint: 0xc89a58, mortar: 0x8a6a40, seed: 9 });
    else if (kind === 'snowstone') t = makeStoneTexture(512, { bx: 4, by: 6, base: 0xe8eef8, tint: 0xaebcd4, mortar: 0x6a7890, seed: 13 });
    else t = makeStoneTexture(512, { bx: 4, by: 6, base: 0x8a7870, tint: 0x4e3e3a, mortar: 0x2a1a18, seed: 17 });   // basalt
    t.map.anisotropy = t.bump.anisotropy = 8; return t;
  })());
  const sandTexFor = (kind) => TC['g' + kind] || (TC['g' + kind] = kind === 'snow' ? makeGroundTex(256, 0xf4f8ff, 0xc2d0e6, 31, { speck: 0.02 }) : kind === 'ash' ? makeGroundTex(256, 0x5a4a44, 0x8a7066, 41, { speck: 0.006, speckC: 0xff7a30 }) : sandTex);

  // crowd: row visibility + outfit palettes (instance matrices keep the originals in M0, hidden seats are collapsed)
  const M0 = crowdMesh.instanceMatrix.array.slice(), rowOf = new Uint8Array(total);
  for (let j = 0; j < baseN; j++) rowOf[F + j] = seats[j].k;
  function dressCrowd(c, seed, dress = []) {
    const arr = crowdMesh.instanceMatrix.array, r = lcg(seed), pl = c.pleb || palPleb, pt = c.pat || palPat, col2 = new THREE.Color(), imp = dress.indexOf('imperial') >= 0;
    for (let i = 0; i < total; i++) {
      const vis = isFeat[i] ? imp : (rowOf[i] <= (c.rows == null ? 99 : c.rows)) && !(imp && inBox[i]);
      for (let e = 0; e < 16; e++) arr[i * 16 + e] = vis ? M0[i * 16 + e] : (e === 15 ? 1 : 0);
      if (isFeat[i]) continue;
      const patrician = rowOf[i] < 4 ? r() < c.patLow : r() < c.patHigh;
      col2.setHex((patrician ? pt : pl)[Math.floor(r() * (patrician ? pt.length : pl.length))]); col2.offsetHSL(0, (r() - 0.5) * 0.08, (r() - 0.5) * 0.08);
      crowdMesh.setColorAt(i, col2);
    }
    crowdMesh.instanceMatrix.needsUpdate = true; crowdMesh.instanceColor.needsUpdate = true;
  }
  // banners: keep a fraction of the instances, evenly spread
  const B0 = banMesh.instanceMatrix.array.slice(), BN = banCount;
  function thinBanners(n) {
    const f = Math.max(0, Math.min(1, n / BN)), arr = banMesh.instanceMatrix.array;
    for (let j = 0; j < BN; j++) { const keep = Math.floor((j + 1) * f) !== Math.floor(j * f); for (let e = 0; e < 16; e++) arr[j * 16 + e] = keep ? B0[j * 16 + e] : (e === 15 ? 1 : 0); }
    banMesh.instanceMatrix.needsUpdate = true;
  }

  // ---- dressing groups (built on first use, then only toggled) ----
  const dressG = {}; const dressBuild = {};
  const colored = (g, hex) => { const c = new THREE.Color(hex); return colorize(g, () => [c.r, c.g, c.b]); };
  const instRing = (geo, mat, list, name) => { const m = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((mx, i) => m.setMatrixAt(i, mx)); m.name = name; m.frustumCulled = false; return m; };
  dressBuild.palisade = () => {
    const logGeo = new THREE.CylinderGeometry(0.1, 0.13, 1.5, 6); logGeo.translate(0, 0.75, 0); const tip = new THREE.ConeGeometry(0.1, 0.22, 6); tip.translate(0, 1.6, 0);
    const mats = Array.from(arcThetas(0.12, 170, 0).thetas).filter((th) => !inGate(th)).map((th, i) => ringMatrix(0.12, th, PH - 0.05, { inward: true, scale: { x: 1, y: 0.8 + ((i * 7) % 5) * 0.09, z: 1 } }));
    const m = instRing(mergeGeos([logGeo, tip]), woodMat, mats, 'palisade'); m.castShadow = !lite; return m;
  };
  dressBuild.hay = () => {
    const bale = new THREE.BoxGeometry(0.95, 0.5, 0.55); bale.translate(0, 0.25, 0); const hm = new THREE.MeshLambertMaterial({ color: 0xcfae5a }); const r = lcg(77), list = [];
    [2, 5, 7].forEach((k) => { const row = rowsInfo[k]; for (let i = 0; i < 18; i++) { const th = r() * TAU; if (inGate(th)) continue; list.push(ringMatrix(row.d + row.tw * 0.35, th, row.y, { inward: true, yaw: (r() - 0.5) * 0.5 })); } });
    const m = instRing(bale, hm, list, 'hay'); m.castShadow = false; m.receiveShadow = true; return m;
  };
  dressBuild.imperial = () => {
    const g = new THREE.Group(); g.name = 'imperial_box';
    const parts = [colored(boxGeo(7.2, 0.5, 3.4, 0, 0.25, 0), 0xf4ead4)];
    [-3.2, 3.2].forEach((x) => [-1.4, 1.4].forEach((z) => parts.push(colored(new THREE.CylinderGeometry(0.16, 0.2, 3.2, 10).translate(x, 2.1, z), 0xf2d27a))));
    parts.push(colored(boxGeo(7.6, 0.3, 3.8, 0, 3.85, 0), 0x5a1f5e), colored(boxGeo(7.8, 0.12, 4.0, 0, 4.06, 0), 0xf2c14e), colored(boxGeo(7.0, 1.7, 0.1, 0, 2.0, -1.65), 0x7a1f3c));
    const gm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 });
    const mesh = new THREE.Mesh(mergeGeos(parts), gm); mesh.castShadow = !lite; mesh.receiveShadow = true;
    const row = rowsInfo[6];
    [Math.PI / 2, -Math.PI / 2].forEach((th) => { const m = mesh.clone(); m.applyMatrix4(ringMatrix(row.d + 0.3, th, row.y + 0.02, { inward: true })); g.add(m); });
    return g;
  };
  dressBuild.obelisks = () => {
    const ob = mergeGeos([colored(new THREE.CylinderGeometry(0.3, 0.55, 6.4, 4).translate(0, 3.2, 0), 0xe0b878), colored(new THREE.ConeGeometry(0.3, 0.7, 4).translate(0, 6.75, 0), 0xf2d27a)]);
    ob.rotateY(Math.PI / 4);
    const om = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }); const list = [];
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => list.push(new THREE.Matrix4().makeTranslation(sx * (SA - 2.0), 0, sz * 5.4)));
    const m = instRing(ob, om, list, 'obelisks'); m.castShadow = !lite; return m;
  };
  dressBuild.snowdrifts = () => {
    const lump = new THREE.IcosahedronGeometry(1, 1); const sm = new THREE.MeshLambertMaterial({ color: 0xf4f8ff }); const r = lcg(31), list = [];
    arcThetas(0.7, 72, 0).thetas.forEach((th) => { if (inGate(th)) return; const q = P(0.7, th), s = 0.5 + r() * 0.5; list.push(new THREE.Matrix4().compose(new THREE.Vector3(q[0], 0.02, q[1]), new THREE.Quaternion(), new THREE.Vector3(s * 1.5, s * 0.34, s))); });
    arcThetas(dEnd + 0.4, 64, 0.5).thetas.forEach((th) => { const q = P(dEnd + 0.4, th), s = 0.45 + r() * 0.6; list.push(new THREE.Matrix4().compose(new THREE.Vector3(q[0], yTop, q[1]), new THREE.Quaternion(), new THREE.Vector3(s * 1.6, s * 0.4, s))); });
    const m = instRing(lump, sm, list, 'snowdrifts'); m.receiveShadow = true; return m;
  };
  const particles = {};
  dressBuild.snowfall = () => { const f = createDustMotes({ count: lite ? 140 : 340, min: new THREE.Vector3(-30, 0.3, -22), max: new THREE.Vector3(30, 24, 22), size: 3.4, color: 0xffffff, wind: new THREE.Vector3(0.7, -2.2, 0.3), intensity: 2.0, seed: 5 }); particles.snowfall = f; return f.points; };
  dressBuild.embers = () => { const f = createDustMotes({ count: lite ? 90 : 220, min: new THREE.Vector3(-30, 0.3, -22), max: new THREE.Vector3(30, 26, 22), size: 2.6, color: 0xff8a30, wind: new THREE.Vector3(0.5, 1.6, 0.2), intensity: 2.6, seed: 9 }); particles.embers = f; return f.points; };
  let lights = null;
  function nightLights(on) {
    if (lite) return; if (!lights) { lights = new THREE.Group(); lights.name = 'torch_lights'; [[-11, 6, 0], [11, 6, 0], [0, 6, 8]].forEach(([x, y, z]) => { const l = new THREE.PointLight(0xffa860, 36, 50, 1.6); l.position.set(x, y, z); lights.add(l); }); group.add(lights); }
    lights.visible = on;
  }

  // ---- distant horizon silhouettes (one merged unlit mesh each; they show when the camera is high or the shot is wide) ----
  const hz = {}; let hzGroup = null;
  function buildHorizon(kind) {
    const r = lcg(kind.length * 977 + 13), parts = [];
    const cone = (rad, h, seg, ang, dist, c0, c1, sq = 1) => {
      const g = new THREE.ConeGeometry(rad, h, seg, 1, true); g.translate(0, h / 2, 0); g.scale(1, 1, sq);
      const A = new THREE.Color(c0), B = new THREE.Color(c1);
      g.rotateY(r() * 3); g.translate(Math.cos(ang) * dist, -4, Math.sin(ang) * dist);
      parts.push(colorize(g, (x, y) => { const k = Math.min(1, Math.max(0, (y + 4) / h)); return [A.r + (B.r - A.r) * k, A.g + (B.g - A.g) * k, A.b + (B.b - A.b) * k]; }));
    };
    if (kind === 'hills') for (let i = 0; i < 26; i++) cone(40 + r() * 40, 22 + r() * 26, 7, (i / 26) * TAU + r() * 0.2, 250 + r() * 40, 0x4a6a3c, 0x7a9a5a, 0.7);
    else if (kind === 'peaks') for (let i = 0; i < 24; i++) cone(46 + r() * 40, 70 + r() * 90, 6, (i / 24) * TAU + r() * 0.2, 270 + r() * 50, 0x5a6a86, 0xf4f8ff);
    else if (kind === 'dunes') { for (let i = 0; i < 20; i++) cone(70 + r() * 40, 14 + r() * 12, 8, (i / 20) * TAU + r() * 0.2, 240 + r() * 40, 0xd8a860, 0xeccf94, 0.8); cone(70, 80, 4, 2.3, 300, 0xc89850, 0xe8c888); cone(55, 62, 4, 3.4, 330, 0xc89850, 0xe8c888); }
    else if (kind === 'city') for (let i = 0; i < 46; i++) { const ang = (i / 46) * TAU + r() * 0.1, hgt = 8 + r() * 24, w = 10 + r() * 14, b = new THREE.BoxGeometry(w, hgt, w * 0.8); b.translate(0, hgt / 2 - 4, 0); b.rotateY(ang); b.translate(Math.cos(ang) * (215 + r() * 40), 0, Math.sin(ang) * (215 + r() * 40)); const tc = [0xb8704a, 0xd8b890, 0xc88a5a, 0xe8d8b8][i % 4], A = new THREE.Color(tc), B = A.clone().multiplyScalar(0.55); parts.push(colorize(b, (x, y) => { const k = Math.min(1, Math.max(0, (y + 4) / hgt)); return [B.r + (A.r - B.r) * k, B.g + (A.g - B.g) * k, B.b + (A.b - B.b) * k]; })); }
    else if (kind === 'volcano') {
      const ang = Math.PI * 1.35, VX = Math.cos(ang) * 300, VZ = Math.sin(ang) * 300; const g = new THREE.CylinderGeometry(13, 100, 130, 12, 1, true); g.translate(0, 61, 0);
      const A = new THREE.Color(0x2e1c1c), B = new THREE.Color(0x7a4636); g.rotateY(0.3);
      parts.push(colorize(g, (x, y) => { const k = Math.min(1, Math.max(0, (y + 4) / 130)); return [A.r + (B.r - A.r) * k, A.g + (B.g - A.g) * k, A.b + (B.b - A.b) * k]; }).translate(VX, 0, VZ));
      for (let i = 0; i < 7; i++) { const phi = (i / 7) * TAU + 0.2, st = new THREE.BoxGeometry(4, 90, 0.6); st.rotateZ(Math.atan(87 / 130)); st.translate(57, 65, 0); st.rotateY(phi); parts.push(colored(st, i % 2 ? 0xff7a28 : 0xffb040).translate(VX, 0, VZ)); }
      const cr = new THREE.CircleGeometry(14, 12); cr.rotateX(-Math.PI / 2); cr.translate(VX, 127, VZ); parts.push(colored(cr, 0xffa040));
      for (let i = 0; i < 14; i++) cone(26 + r() * 20, 10 + r() * 14, 6, (i / 14) * TAU, 270 + r() * 30, 0x1a1214, 0x3a2220, 0.8);
    }
    const geo = mergeGeos(parts), m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
    m.name = 'horizon_' + kind; m.frustumCulled = false; m.renderOrder = -5; return m;
  }

  let curTheme = 'capua', curDecal = 'rake', curNight = false;
  /** apply a theme. ctx: {rig, scene, sky, renderer, wx, night, seed}. Returns the sky preset it applied (null when no lighting rig was given). */
  function setTheme(id, ctx = {}) {
    const th = THEMES[id] || THEMES.capua; curTheme = THEMES[id] ? id : 'capua';
    const st = stoneTex(th.stone.kind); stoneMat.map = st.map; stoneMat.bumpMap = st.bump; stoneMat.color.setHex(th.stone.tint);
    const sa = sandTexFor(th.sand.kind); sandMat.map = sa.map; sandMat.bumpMap = sa.bump; sandMat.color.setHex(th.sand.tint);
    if (curDecal !== th.sand.decal) { paintDecal(th.sand.decal, lcg(1234 + curTheme.length)); curDecal = th.sand.decal; decalDirty = true; }
    decalMat.emissiveMap = decalTex; decalMat.emissive.setHex(th.glowSand ? 0xffffff : 0x000000); decalMat.emissiveIntensity = th.glowSand ? 1.0 : 0;
    bronzeMat.color.setHex(th.gold);
    velarium.visible = !!th.velarium; velMat.color.setHex(th.velTint || 0xffffff);
    banMat.color.setHex(th.banners.tint); thinBanners(th.banners.count);
    themeDensity = th.crowd.density; dressCrowd(th.crowd, 4242 + curTheme.length * 31, th.dress); recount();
    for (const k of Object.keys(dressG)) dressG[k].visible = false;
    for (const k of th.dress) { if (!dressG[k]) { dressG[k] = dressBuild[k](); group.add(dressG[k]); } dressG[k].visible = true; }
    for (const k of Object.keys(hz)) hz[k].visible = false;
    if (th.horizon) { if (!hz[th.horizon]) { hz[th.horizon] = buildHorizon(th.horizon); group.add(hz[th.horizon]); } hz[th.horizon].visible = true; }
    const night = !!ctx.night || ctx.wx === 'night'; curNight = night; nightLights(night && !!th.night && th.night.lights);
    let preset = null;
    if (ctx.rig && ctx.scene && ctx.sky) {
      let p;
      if (night) { p = Object.assign({}, TOD.night, th.night && th.night.exposure ? { exposure: th.night.exposure } : {}); if (th.night && th.night.sunScale) p.sunInt *= th.night.sunScale; }
      else p = weatherSky(Object.assign({}, TOD[th.base], th.sky), ctx.wx || 'clear');
      preset = applyTOD(p, { rig: ctx.rig, scene: ctx.scene, sky: ctx.sky, renderer: ctx.renderer });
    }
    api.setNight(Math.max(preset ? preset.night || 0 : night ? 1 : 0, th.torch || 0));
    return preset;
  }

  // ---------------- night glow for arch voids ----------------
  const voidDay = new THREE.Color(0xffffff);
  function setNight(n) { voidMat.color.copy(voidDay).lerp(new THREE.Color(2.6, 1.15, 0.35), n * 0.55); velMat.emissiveIntensity = lerp(0.55, 0.18, n); }

  function update(t, dt) {
    U.uTime.value = t;
    flames.update(t, nightV);
    for (const k in particles) if (dressG[k] && dressG[k].visible) particles[k].update(t, Math.min(2, globalThis.devicePixelRatio || 1));
    if (decalDirty && t - lastDecalUp > 0.12) { decalTex.needsUpdate = true; decalDirty = false; lastDecalUp = t; } // throttled upload
  }
  let lastDecalUp = -1;
  let nightV = 0;
  const api = {
    group, DIM, uniforms: U, stoneMat, crowdMesh, velarium, flames, decalCanvas: dc,
    shadowHint: { center: new THREE.Vector3(0, 6, 0), radius: 50 },
    crowdTotal,
    update(t, dt) { update(t, dt); },
    setHype(v) { U.uHype.value = v; }, setWave(v) { U.uWave.value = v; }, setWind(v) { U.uWind.value = v; },
    setGate, setNight(n) { nightV = n; setNight(n); },
    setTheme, get theme() { return curTheme; }, THEMES,
    setDensity(d) { tierDensity = d; recount(); },
    stampFootprint, scuff,
    /** Paint a walking trail of footprints between two points (lab / intro helper). */
    footTrail(x0, z0, x1, z1, step = 0.55, scale = 1) { const dx_ = x1 - x0, dz = z1 - z0, L = Math.hypot(dx_, dz), h = Math.atan2(dz, dx_); for (let d = 0, i = 0; d < L; d += step, i++) stampFootprint(x0 + dx_ * d / L, z0 + dz * d / L, h, scale, i % 2 ? 1 : -1); },
    ring: P, normalAt: NRM,
    dispose() { group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); }); },
  };
  return api;
}
