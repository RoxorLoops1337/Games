// Client-side copy of the tiles the server has streamed: chunk arrays, painted sections and the light map.
import { W, H, CHUNK, BLOCKS, B, L_LAVA } from '../shared/data.js';
import { unpackLayers } from '../shared/codec.js';
import { tileArt, S } from './art.js';

export const SEC = 16; // section = 16x16 tiles painted into one canvas

export class CWorld {
  constructor() {
    this.chunks = new Map();
    this.meta = new Map();
    this.secs = new Map();
    this.dirty = new Set();
    this.skyTop = new Int16Array(W).fill(-1); // first opaque row per column (-1 = unknown)
    this.ver = 0;
  }
  hasChunk(cx) { return this.chunks.has(cx); }
  fgAt(x, y) {
    if (x < 0 || x >= W || y >= H) return B.bedrock;
    if (y < 0) return 0;
    const c = this.chunks.get((x / CHUNK) | 0);
    return c ? c.fg[(x % CHUNK) * H + y] : B.bedrock; // unloaded ground is a wall, so nobody falls through it
  }
  bgAt(x, y) {
    if (x < 0 || x >= W || y < 0 || y >= H) return 0;
    const c = this.chunks.get((x / CHUNK) | 0);
    return c ? c.bg[(x % CHUNK) * H + y] : 0;
  }
  liqAt(x, y) {
    if (x < 0 || x >= W || y < 0 || y >= H) return 0;
    const c = this.chunks.get((x / CHUNK) | 0);
    return c ? c.liq[(x % CHUNK) * H + y] : 0;
  }
  setChunk(cx, b64, meta) {
    const l = unpackLayers(b64, CHUNK * H);
    this.chunks.set(cx, l);
    for (let lx = 0; lx < CHUNK; lx++) this.recomputeSky(cx * CHUNK + lx);
    for (const m of meta || []) this.meta.set(m[0] + ',' + m[1], m[2]);
    this.dirtyChunk(cx);
    for (const n of [cx - 1, cx + 1]) if (this.chunks.has(n)) this.dirtyChunk(n); // borders shade against neighbours
    this.ver++;
  }
  dropChunk(cx) {
    this.chunks.delete(cx);
    for (const k of [...this.secs.keys()]) { const sx = +k.split(',')[0]; if (((sx * SEC) / CHUNK | 0) === cx) this.secs.delete(k); }
    for (const k of [...this.meta.keys()]) if (((+k.split(',')[0] / CHUNK) | 0) === cx) this.meta.delete(k);
    this.ver++;
  }
  dirtyChunk(cx) { for (let sx = cx * CHUNK / SEC; sx < (cx + 1) * CHUNK / SEC; sx++) for (let sy = 0; sy < H / SEC; sy++) this.dirty.add(sx + ',' + sy); }
  apply(x, y, l, v) {
    const c = this.chunks.get((x / CHUNK) | 0);
    if (!c) return;
    const arr = l === 0 ? c.fg : l === 1 ? c.bg : c.liq;
    const i = (x % CHUNK) * H + y;
    if (arr[i] === v) return;
    arr[i] = v;
    if (l === 0) this.recomputeSky(x);
    if (l === 2) { this.dirtyLiq = true; this.ver++; return; }
    const sx = Math.floor(x / SEC), sy = Math.floor(y / SEC);
    this.dirty.add(sx + ',' + sy);
    // edge shading of the next section over
    if (x % SEC === 0) this.dirty.add((sx - 1) + ',' + sy);
    if (x % SEC === SEC - 1) this.dirty.add((sx + 1) + ',' + sy);
    if (y % SEC === 0) this.dirty.add(sx + ',' + (sy - 1));
    if (y % SEC === SEC - 1) this.dirty.add(sx + ',' + (sy + 1));
    this.ver++;
  }
  opaque(id) { if (!id) return false; const d = BLOCKS[id]; return d.solid && id !== B.glass; }
  recomputeSky(x) {
    const c = this.chunks.get((x / CHUNK) | 0);
    if (!c) return;
    const col = (x % CHUNK) * H;
    let y = 0;
    for (; y < H; y++) { const id = c.fg[col + y]; if (id && BLOCKS[id].solid && id !== B.glass) break; }
    this.skyTop[x] = y;
  }

  // -------------------------------------------------------------- section painting
  section(sx, sy) {
    const k = sx + ',' + sy;
    let s = this.secs.get(k);
    if (!s || this.dirty.has(k)) {
      if (!s) { s = { bg: document.createElement('canvas'), fg: document.createElement('canvas'), used: 0 }; s.bg.width = s.bg.height = s.fg.width = s.fg.height = SEC * S; this.secs.set(k, s); }
      this.paint(s, sx, sy);
      this.dirty.delete(k);
    }
    s.used = performance.now();
    return s;
  }
  paint(s, sx, sy) {
    const gb = s.bg.getContext('2d'), gf = s.fg.getContext('2d');
    gb.clearRect(0, 0, s.bg.width, s.bg.height); gf.clearRect(0, 0, s.fg.width, s.fg.height);
    const x0 = sx * SEC, y0 = sy * SEC;
    let any = false;
    for (let ty = 0; ty < SEC; ty++) {
      for (let tx = 0; tx < SEC; tx++) {
        const x = x0 + tx, y = y0 + ty;
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        const fg = this.fgAt(x, y), bg = this.bgAt(x, y);
        const v = ((x * 73856093) ^ (y * 19349663)) >>> 0 & 3;
        const px = tx * S, py = ty * S;
        if (bg && !(fg && BLOCKS[fg].solid && !BLOCKS[fg].oneway)) {
          gb.drawImage(tileArt(bg, v), px, py);
          gb.fillStyle = 'rgba(14,12,30,0.5)'; gb.fillRect(px, py, S, S);
          // soft shadow cast by solid neighbours
          if (this.solidFg(x, y - 1)) { gb.fillStyle = 'rgba(0,0,0,0.25)'; gb.fillRect(px, py, S, 5); }
          if (this.solidFg(x - 1, y)) { gb.fillStyle = 'rgba(0,0,0,0.18)'; gb.fillRect(px, py, 4, S); }
          any = true;
        }
        if (fg) {
          const d = BLOCKS[fg];
          if (d.solid && !d.oneway && fg !== B.glass && !d.door) this.paintSolid(gf, fg, v, x, y, px, py);
          else gf.drawImage(tileArt(fg, v), px, py);
          any = true;
        }
      }
    }
    s.empty = !any;
  }
  solidFg(x, y) { const id = this.fgAt(x, y); return !!id && BLOCKS[id].solid && !BLOCKS[id].oneway && !BLOCKS[id].door; }
  paintSolid(g, id, v, x, y, px, py) {
    g.drawImage(tileArt(id, v), px, py);
    const t = !this.solidFg(x, y - 1), b = !this.solidFg(x, y + 1), l = !this.solidFg(x - 1, y), r = !this.solidFg(x + 1, y);
    if (t) { g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(px, py, S, 3); g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(px, py, S, 1); }
    if (b) { g.fillStyle = 'rgba(0,0,0,0.26)'; g.fillRect(px, py + S - 4, S, 4); g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(px, py + S - 1, S, 1); }
    if (l) { g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(px, py, 3, S); g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(px, py, 1, S); }
    if (r) { g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(px + S - 3, py, 3, S); g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(px + S - 1, py, 1, S); }
    // rounded outer corners
    const R = 8;
    g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
    if (t && l) { g.beginPath(); g.moveTo(px, py); g.lineTo(px + R, py); g.quadraticCurveTo(px, py, px, py + R); g.fill(); }
    if (t && r) { g.beginPath(); g.moveTo(px + S, py); g.lineTo(px + S - R, py); g.quadraticCurveTo(px + S, py, px + S, py + R); g.fill(); }
    if (b && l) { g.beginPath(); g.moveTo(px, py + S); g.lineTo(px + R, py + S); g.quadraticCurveTo(px, py + S, px, py + S - R); g.fill(); }
    if (b && r) { g.beginPath(); g.moveTo(px + S, py + S); g.lineTo(px + S - R, py + S); g.quadraticCurveTo(px + S, py + S, px + S, py + S - R); g.fill(); }
    g.restore();
  }
  prune(limit = 90) {
    if (this.secs.size <= limit) return;
    const arr = [...this.secs.entries()].sort((a, b) => a[1].used - b[1].used);
    for (let i = 0; i < arr.length - limit; i++) this.secs.delete(arr[i][0]);
  }
}

// ------------------------------------------------------------------ light
// Returns {sky, blk, x0, y0, w, h}: two 0..15 light levels per cell of the given rectangle.
export function computeLight(cw, x0, y0, w, h, outBuf) {
  const n = w * h;
  const sky = outBuf?.sky && outBuf.sky.length === n ? outBuf.sky.fill(0) : new Uint8Array(n);
  const blk = outBuf?.blk && outBuf.blk.length === n ? outBuf.blk.fill(0) : new Uint8Array(n);
  const cost = new Uint8Array(n);
  const qa = [], qb = [];
  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      const x = x0 + tx, y = y0 + ty, i = ty * w + tx;
      const id = cw.fgAt(x, y);
      cost[i] = cw.opaque(id) ? 5 : (id === B.leaves ? 2 : 1);
      if (x < 0 || x >= W || y < 0 || y >= H) { cost[i] = 5; continue; }
      const top = cw.skyTop[x];
      if (top >= 0 && y < top) { sky[i] = 15; qa.push(i); }
      else if (top < 0 && y < 60) { sky[i] = 15; qa.push(i); }
      let L = id ? BLOCKS[id].light : 0;
      if (!L) { const lq = cw.liqAt(x, y); if (lq && (lq >> 4) === L_LAVA) L = 12; }
      if (L) { blk[i] = L; qb.push(i); }
    }
  }
  const flood = (arr, q) => {
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi], v = arr[i];
      if (v <= 1) continue;
      const tx = i % w, ty = (i / w) | 0;
      if (tx > 0) relax(arr, q, i - 1, v);
      if (tx < w - 1) relax(arr, q, i + 1, v);
      if (ty > 0) relax(arr, q, i - w, v);
      if (ty < h - 1) relax(arr, q, i + w, v);
    }
  };
  const relax = (arr, q, j, v) => { const nv = v - cost[j]; if (nv > arr[j]) { arr[j] = nv; q.push(j); } };
  flood(sky, qa); flood(blk, qb);
  return { sky, blk, x0, y0, w, h };
}
