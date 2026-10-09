// Encore Island 3D environment: one mood per biome, smoothly blended by which island the camera focus is nearest to.
// Internal moods keep colours as THREE.Color so blending never allocates; getMood() converts to the kit's string form on demand.
import * as THREE from 'three';
import * as kit from './kit.js';
import { biomeIdx } from './env_util.js';

const COL = ['skyTop', 'skyMid', 'skyLow', 'fog', 'sun', 'hemiSky', 'hemiGround', 'rim', 'water', 'waterDeep', 'cloudCol', 'sunDisc', 'foamCol'];
const NUM = ['fogNear', 'fogFar', 'sunI', 'hemiI', 'exposure', 'stars', 'cloud', 'flora', 'sunSize', 'sparkle', 'foam'];
export const MOOD_KEYS = { COL, NUM };
// extras on top of kit.DEFAULT_MOOD: cloudCol / sunDisc / foamCol colours, stars (0..1), cloud (LOOK.cloud shadow strength), flora (night glow), sunSize, sparkle (water glitter), foam
const BASE = Object.assign({}, kit.DEFAULT_MOOD, { cloudCol: '#ffffff', sunDisc: '#fff6d8', foamCol: '#ffffff', stars: 0, cloud: 0.32, flora: 0, sunSize: 1, sparkle: 1, foam: 1 });
const M = (o) => Object.assign({}, BASE, o);

/** the eight Soundlands, indexed like BIOMES (0 = Blossom Bay, which is also the home island) */
export const BIOME_MOODS = [
  M({ name: 'Blossom Bay', skyTop: '#79bff0', skyMid: '#f2c9e6', skyLow: '#ffe4dc', fog: '#fbdfe8', fogNear: 62, fogFar: 205, sun: '#fff0dc', sunI: 2.55, sunDir: [-0.5, 0.72, 0.42], hemiSky: '#d6e6ff', hemiGround: '#f0c8f0', hemiI: 0.95, exposure: 1.06, rim: '#9ad8ff', water: '#58d0d6', waterDeep: '#2e8fc0', cloudCol: '#fff4fa', sunDisc: '#fff2dc', foamCol: '#ffffff', cloud: 0.3 }),
  M({ name: 'Mint Meadow', skyTop: '#48aeee', skyMid: '#a6e8f2', skyLow: '#eafff4', fog: '#d4f6ee', fogNear: 66, fogFar: 215, sun: '#ffffea', sunI: 2.75, sunDir: [-0.32, 0.95, 0.3], hemiSky: '#cdf0ff', hemiGround: '#d8f8e0', hemiI: 0.95, exposure: 1.06, rim: '#9af0d8', water: '#44d6c2', waterDeep: '#1f8fb0', cloudCol: '#ffffff', sunDisc: '#ffffe6', foamCol: '#f4fffa', cloud: 0.34 }),
  M({ name: 'Sunset Dunes', skyTop: '#8a74d6', skyMid: '#ffae78', skyLow: '#ffdca4', fog: '#ffcf9c', fogNear: 52, fogFar: 190, sun: '#ffb460', sunI: 3.0, sunDir: [-0.85, 0.42, 0.36], hemiSky: '#ffc89a', hemiGround: '#c890d8', hemiI: 0.85, exposure: 1.05, rim: '#ffb070', water: '#60ccbc', waterDeep: '#37819f', cloudCol: '#ffd2b0', sunDisc: '#ffd08a', foamCol: '#fff4e0', sunSize: 1.7, cloud: 0.38 }),
  M({ name: 'Frost Fjord', skyTop: '#66a6e8', skyMid: '#c2e4ff', skyLow: '#eaf6ff', fog: '#d8ecff', fogNear: 44, fogFar: 170, sun: '#e8f2ff', sunI: 2.3, sunDir: [-0.42, 0.62, 0.5], hemiSky: '#cfe4ff', hemiGround: '#bcd0f4', hemiI: 1.0, exposure: 1.06, rim: '#bfe8ff', water: '#74d8ee', waterDeep: '#3677c0', cloudCol: '#f4faff', sunDisc: '#f2f8ff', foamCol: '#ffffff', sparkle: 1.4, cloud: 0.26 }),
  M({ name: 'Candy Canyon', skyTop: '#5a46aa', skyMid: '#be88e0', skyLow: '#ffb6d8', fog: '#e2b2e6', fogNear: 48, fogFar: 180, sun: '#ffc6e6', sunI: 2.45, sunDir: [-0.62, 0.55, 0.36], hemiSky: '#e0b8ff', hemiGround: '#a07ad0', hemiI: 0.9, exposure: 1.04, rim: '#ff9ad2', water: '#b09af2', waterDeep: '#5a4cb2', cloudCol: '#ffd6f0', sunDisc: '#ffd6ee', foamCol: '#fff0fa', stars: 0.3, cloud: 0.36 }),
  M({ name: 'Lime Lagoon', skyTop: '#52c4e2', skyMid: '#c4f08c', skyLow: '#f6ffc8', fog: '#e0f8aa', fogNear: 60, fogFar: 205, sun: '#fffcd2', sunI: 2.85, sunDir: [-0.38, 0.9, 0.34], hemiSky: '#dcffb8', hemiGround: '#a8e8a0', hemiI: 0.95, exposure: 1.07, rim: '#d4ff80', water: '#6ee8a8', waterDeep: '#25a088', cloudCol: '#fbffe8', sunDisc: '#ffffd0', foamCol: '#fbffe6', sparkle: 1.2, cloud: 0.3 }),
  M({ name: 'Neon Night', skyTop: '#070728', skyMid: '#26267a', skyLow: '#5a48b0', fog: '#26266c', fogNear: 46, fogFar: 165, sun: '#a0b4ff', sunI: 1.5, sunDir: [-0.42, 0.72, 0.42], hemiSky: '#6272e8', hemiGround: '#3c2a86', hemiI: 0.95, exposure: 1.1, rim: '#6ee0d8', water: '#2c42a8', waterDeep: '#0e1a5c', cloudCol: '#5c58b4', sunDisc: '#d8e4ff', foamCol: '#a8f0ff', stars: 1, cloud: 0.18, flora: 1, sunSize: 1.5, sparkle: 1.6 }),
  M({ name: 'Gold Gala', skyTop: '#ffb25a', skyMid: '#ffde8a', skyLow: '#fff4c4', fog: '#ffe8a4', fogNear: 56, fogFar: 195, sun: '#fff0b4', sunI: 2.95, sunDir: [-0.5, 0.7, 0.4], hemiSky: '#fff0c0', hemiGround: '#f0c070', hemiI: 0.95, exposure: 1.06, rim: '#ffe080', water: '#f0d27c', waterDeep: '#c4883a', cloudCol: '#fff6d8', sunDisc: '#fffadc', foamCol: '#fffbe6', sparkle: 2, cloud: 0.3 }),
];

const _tmpC = new THREE.Color();
/** Mood with Color objects + arrays, plain numbers. Accepts a partial mood in kit's string form (missing keys come from `base`). */
export function parseMood(m, base = BASE) {
  const out = { sunDir: [0, 1, 0] };
  for (const k of COL) out[k] = new THREE.Color().set(m[k] !== undefined ? m[k] : base[k]);
  for (const k of NUM) out[k] = m[k] !== undefined ? m[k] : base[k];
  const sd = m.sunDir || base.sunDir; out.sunDir = [sd[0], sd[1], sd[2]]; return out;
}
export function copyMood(a, b) { for (const k of COL) a[k].copy(b[k]); for (const k of NUM) a[k] = b[k]; a.sunDir[0] = b.sunDir[0]; a.sunDir[1] = b.sunDir[1]; a.sunDir[2] = b.sunDir[2]; return a; }
/** out = lerp(a, b, t) with no allocation */
export function mixMood(out, a, b, t) {
  for (const k of COL) out[k].copy(a[k]).lerp(b[k], t);
  for (const k of NUM) out[k] = a[k] + (b[k] - a[k]) * t;
  for (let i = 0; i < 3; i++) out.sunDir[i] = a.sunDir[i] + (b.sunDir[i] - a.sunDir[i]) * t; return out;
}
/** kit-style string mood (what the engine and tests expect from getMood) */
export function toKit(m) { const o = {}; for (const k of COL) o[k] = '#' + m[k].getHexString(); for (const k of NUM) o[k] = m[k]; o.sunDir = m.sunDir.slice(); return o; }
export const newMood = () => parseMood(BASE);

// season tints from f_meta.js SEASONS (rgba strings); applied as a gentle wash over the sky, fog, hemisphere and water
const _sc = {};
export function seasonWash(m, sd, k = 4) {
  if (!sd || !sd.tint) return; let c = _sc[sd.id];
  if (!c) { const r = /rgba?\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)/.exec(sd.tint); c = _sc[sd.id] = r ? { col: new THREE.Color(+r[1] / 255, +r[2] / 255, +r[3] / 255), a: +r[4] } : { col: new THREE.Color(1, 1, 1), a: 0 }; }
  const t = Math.min(0.5, c.a * k); for (const key of ['skyMid', 'skyLow', 'fog', 'hemiSky', 'water', 'cloudCol']) m[key].lerp(c.col, t);
}
export function biomeMoodFor(k) { return BIOME_MOODS[biomeIdx(k)]; }
