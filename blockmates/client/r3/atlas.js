// One texture holding every painted block tile (4 variants each) plus a few extra faces (grass top, log end...).
import * as THREE from 'three';
import { BLOCKS, B } from '../../shared/data.js';
import { tileArt, S, VARIANTS, shade } from '../art.js';

const COLS = 20;
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

const EXTRA = {
  grass_top(g, r) {
    g.fillStyle = '#62c244'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 70; i++) { g.fillStyle = shade('#62c244', (r() - 0.5) * 50); g.fillRect(r() * 30 | 0, r() * 30 | 0, 2 + (r() * 2 | 0), 2); }
    g.fillStyle = '#86e45f'; for (let i = 0; i < 14; i++) g.fillRect(r() * 30 | 0, r() * 30 | 0, 1, 3);
  },
  log_end(g, r) {
    g.fillStyle = '#c99a62'; g.fillRect(0, 0, S, S);
    for (let k = 14; k > 0; k -= 3) { g.strokeStyle = k % 2 ? '#a8793c' : '#8a5a2a'; g.lineWidth = 1.5; g.beginPath(); g.arc(16, 16, k, 0, 7); g.stroke(); }
    g.fillStyle = '#6a4220'; g.beginPath(); g.arc(16, 16, 2, 0, 7); g.fill(); void r;
  },
  snow_top(g, r) { g.fillStyle = '#f6faff'; g.fillRect(0, 0, S, S); for (let i = 0; i < 40; i++) { g.fillStyle = r() < 0.5 ? '#dce8f8' : '#fff'; g.fillRect(r() * 30 | 0, r() * 30 | 0, 2, 2); } },
  white(g) { g.fillStyle = '#fff'; g.fillRect(0, 0, S, S); },
};
export const EXTRA_NAMES = Object.keys(EXTRA);

export function buildAtlas() {
  const names = EXTRA_NAMES;
  const total = BLOCKS.length * VARIANTS + names.length;
  const rows = Math.ceil(total / COLS);
  const cv = document.createElement('canvas');
  cv.width = COLS * S; cv.height = rows * S;
  const g = cv.getContext('2d');
  const cell = new Map(); // key -> index
  let n = 0;
  for (let id = 1; id < BLOCKS.length; id++) for (let v = 0; v < VARIANTS; v++) { const i = n++; g.drawImage(tileArt(id, v), (i % COLS) * S, ((i / COLS) | 0) * S); cell.set(id * 8 + v, i); }
  for (const nm of names) {
    const i = n++; g.save(); g.translate((i % COLS) * S, ((i / COLS) | 0) * S); g.beginPath(); g.rect(0, 0, S, S); g.clip();
    EXTRA[nm](g, rng(77 + i)); g.restore(); cell.set('x' + nm, i);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  tex.anisotropy = 1;
  const W = cv.width, Hh = cv.height, e = 0.6; // inset in texels so neighbours never bleed in
  function uv(index) {
    const x0 = (index % COLS) * S, y0 = ((index / COLS) | 0) * S;
    return [(x0 + e) / W, 1 - (y0 + S - e) / Hh, (x0 + S - e) / W, 1 - (y0 + e) / Hh]; // u0,v0,u1,v1 (v up)
  }
  return {
    texture: tex, canvas: cv,
    tile(id, variant) { return uv(cell.get(id * 8 + (variant & 3))); },
    extra(name) { return uv(cell.get('x' + name)); },
  };
}
void B;
