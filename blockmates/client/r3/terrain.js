// Turns a 16x16 section of the world into real 3D geometry: cubes with only their visible faces, a back wall layer,
// leaves, trunks, crossed-quad plants, layered props, and translucent liquids. Light is baked per vertex (sky + block).
import * as THREE from 'three';
import { BLOCKS, B, H, W, L_LAVA } from '../../shared/data.js';
import { computeLight, SEC } from '../cworld.js';

const M = 15;
const FACE = { front: 1.0, top: 1.06, left: 0.8, right: 0.7, bottom: 0.5 };

class Buf {
  constructor() { this.pos = []; this.uv = []; this.col = []; this.lit = []; this.top = []; this.idx = []; this.n = 0; }
  get empty() { return this.n === 0; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('lit', new THREE.Float32BufferAttribute(this.lit, 2));
    g.setAttribute('wave', new THREE.Float32BufferAttribute(this.top, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

export class TerrainMesher {
  constructor(cw, atlas) { this.cw = cw; this.atlas = atlas; }

  isCube(id) { if (!id) return false; const d = BLOCKS[id]; return d.solid && !d.oneway && !d.door && id !== B.glass; }
  cubeAt(x, y) { return this.isCube(this.cw.fgAt(x, y)); }
  leafAt(x, y) { const id = this.cw.fgAt(x, y); return id === B.leaves || id === B.pine_leaves; }

  build(sx, sy) {
    const cw = this.cw, x0 = sx * SEC, y0 = sy * SEC;
    const L = computeLight(cw, x0 - M, y0 - M, SEC + 2 * M, SEC + 2 * M);
    this.L = L;
    const solid = new Buf(), water = new Buf(), lava = new Buf();
    this.solid = solid;
    for (let ty = 0; ty < SEC; ty++) for (let tx = 0; tx < SEC; tx++) {
      const x = x0 + tx, y = y0 + ty;
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      const fg = cw.fgAt(x, y), bg = cw.bgAt(x, y), lq = cw.liqAt(x, y);
      const v = ((x * 73856093) ^ (y * 19349663)) >>> 0 & 3;
      if (bg && !this.cubeAt(x, y)) this.backWall(x, y, bg, v);
      if (fg) this.foreground(x, y, fg, v);
      if (lq) this.liquid(lq, x, y, lq >> 4 === L_LAVA ? lava : water);
    }
    return { solid: solid.empty ? null : solid.geometry(), water: water.empty ? null : water.geometry(), lava: lava.empty ? null : lava.geometry() };
  }

  // ---------------------------------------------------------------- light
  light(fx, fy) { // bilinear between cell centres; (fx, fy) in tile grid coordinates
    const L = this.L, u = fx - 0.5, v = fy - 0.5, cx = Math.floor(u), cy = Math.floor(v), ax = u - cx, ay = v - cy;
    const at = (x, y, a) => { const i = (Math.max(0, Math.min(L.h - 1, y - L.y0))) * L.w + Math.max(0, Math.min(L.w - 1, x - L.x0)); return a[i]; };
    const mix = (a) => (at(cx, cy, a) * (1 - ax) + at(cx + 1, cy, a) * ax) * (1 - ay) + (at(cx, cy + 1, a) * (1 - ax) + at(cx + 1, cy + 1, a) * ax) * ay;
    return [mix(L.sky) / 15, mix(L.blk) / 15];
  }

  // corners: [BL, BR, TR, TL] as [x, ty, z] with ty in tile rows (y grows downward); emitted with three.js y = -ty
  quad(buf, c, uvr, shade, tint = null, glow = 0, wave = 0) {
    const base = buf.n;
    const t = tint || [1, 1, 1];
    const us = [uvr[0], uvr[2], uvr[2], uvr[0]], vs = [uvr[1], uvr[1], uvr[3], uvr[3]];
    for (let i = 0; i < 4; i++) {
      const [px, py, pz] = c[i];
      buf.pos.push(px, -py, pz);
      buf.uv.push(us[i], vs[i]);
      const s = shade;
      buf.col.push(t[0] * s, t[1] * s, t[2] * s);
      const l = glow ? [1, 1] : this.light(px, py);
      buf.lit.push(l[0], l[1]);
      buf.top.push(wave === 2 || (wave && (i === 2 || i === 3)) ? 1 : 0);
    }
    buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    buf.n += 4;
  }

  // an axis aligned box; faces: which sides to emit; tiles: {front, top, side, bottom} uv rects
  box(buf, x0, y0, z0, x1, y1, z1, tiles, faces, tint, glow) {
    // y0 = top row coordinate, y1 = bottom row coordinate (y1 > y0)
    if (faces.front) this.quad(buf, [[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1]], tiles.front, FACE.front, tint, glow);
    if (faces.top) this.quad(buf, [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]], tiles.top || tiles.front, FACE.top, tint, glow);
    if (faces.bottom) this.quad(buf, [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], tiles.bottom || tiles.front, FACE.bottom, tint, glow);
    if (faces.left) this.quad(buf, [[x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0]], tiles.side || tiles.front, FACE.left, tint, glow);
    if (faces.right) this.quad(buf, [[x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1]], tiles.side || tiles.front, FACE.right, tint, glow);
  }

  backWall(x, y, bg, v) {
    const t = this.atlas.tile(bg, v);
    // contact shadow from cubes next to this wall cell
    const c = (cx, cy) => (this.cubeAt(cx, cy) ? 1 : 0);
    const dark = (a, b, d) => 0.5 - 0.1 * (a + b + (a && b ? 1 : d));
    const buf = this.solid, base = buf.n;
    const corners = [[x, y + 1], [x + 1, y + 1], [x + 1, y], [x, y]];
    const shades = [
      dark(c(x - 1, y), c(x, y + 1), c(x - 1, y + 1)), dark(c(x + 1, y), c(x, y + 1), c(x + 1, y + 1)),
      dark(c(x + 1, y), c(x, y - 1), c(x + 1, y - 1)), dark(c(x - 1, y), c(x, y - 1), c(x - 1, y - 1)),
    ];
    const us = [t[0], t[2], t[2], t[0]], vs = [t[1], t[1], t[3], t[3]];
    for (let i = 0; i < 4; i++) {
      const [px, py] = corners[i];
      buf.pos.push(px, -py, 0);
      buf.uv.push(us[i], vs[i]);
      const s = shades[i];
      buf.col.push(s * 0.95, s * 0.93, s * 1.15);
      const l = this.light(px, py); buf.lit.push(l[0], l[1]); buf.top.push(0);
    }
    buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3); buf.n += 4;
  }

  tilesFor(id, v) {
    const a = this.atlas, t = a.tile(id, v);
    if (id === B.grass) return { front: t, top: a.extra('grass_top'), side: t, bottom: a.tile(B.dirt, v) };
    if (id === B.snow) return { front: t, top: a.extra('snow_top'), side: t, bottom: t };
    if (id === B.log) return { front: t, top: a.extra('log_end'), side: t, bottom: a.extra('log_end') };
    return { front: t, top: t, side: t, bottom: t };
  }

  foreground(x, y, id, v) {
    const bd = BLOCKS[id], buf = this.solid, glow = bd.light >= 8 && bd.solid ? 0 : 0;
    const tiles = this.tilesFor(id, v);
    if (this.isCube(id)) {
      this.box(buf, x, y, 0, x + 1, y + 1, 1, tiles, {
        front: true, top: !this.cubeAt(x, y - 1), bottom: !this.cubeAt(x, y + 1), left: !this.cubeAt(x - 1, y), right: !this.cubeAt(x + 1, y),
      }, null, bd.light >= 9 ? 1 : glow);
      return;
    }
    if (id === B.leaves || id === B.pine_leaves) {
      const same = (cx, cy) => this.leafAt(cx, cy) || this.cubeAt(cx, cy);
      this.box(buf, x, y, 0.02, x + 1, y + 1, 0.98, tiles, { front: true, top: !same(x, y - 1), bottom: !same(x, y + 1), left: !same(x - 1, y), right: !same(x + 1, y) });
      // a second, slightly offset shell so the foliage has depth when seen from the side
      this.box(buf, x + 0.06, y + 0.06, 0.2, x + 0.94, y + 0.94, 0.8, tiles, { front: false, top: false, bottom: false, left: !same(x - 1, y), right: !same(x + 1, y) }, [0.85, 0.9, 0.85]);
      return;
    }
    if (id === B.log) { // trunks are rounder than cubes: a narrower box
      const up = this.cw.fgAt(x, y - 1) === B.log, dn = this.cw.fgAt(x, y + 1) === B.log;
      this.box(buf, x + 0.14, y, 0.15, x + 0.86, y + 1, 0.85, tiles, { front: true, top: !up, bottom: !dn, left: true, right: true });
      return;
    }
    if (id === B.cactus) {
      this.box(buf, x + 0.18, y, 0.2, x + 0.82, y + 1, 0.8, { front: tiles.front, top: tiles.front, side: tiles.front, bottom: tiles.front }, { front: true, top: this.cw.fgAt(x, y - 1) !== B.cactus, left: true, right: true });
      return;
    }
    if (bd.oneway) { // platform: a slab at the top of the cell
      this.box(buf, x, y, 0, x + 1, y + 0.32, 1, tiles, { front: true, top: true, bottom: true, left: true, right: true });
      return;
    }
    if (id === B.glass) { for (const z of [0.97, 0.03]) this.slice(x, y, z, tiles.front, 1, 0); return; }
    if (bd.door) { for (const z of [0.58, 0.5, 0.42]) this.slice(x, y, z, tiles.front, z === 0.58 ? 1 : 0.8, 0); return; }
    if (bd.plant && !bd.light) { // crossed quads
      const t = tiles.front;
      this.quad(buf, [[x, y + 1, 0.1], [x + 1, y + 1, 0.9], [x + 1, y, 0.9], [x, y, 0.1]], t, 0.95);
      this.quad(buf, [[x, y + 1, 0.9], [x + 1, y + 1, 0.1], [x + 1, y, 0.1], [x, y, 0.9]], t, 0.85);
      return;
    }
    if (id === B.ladder) { for (const z of [0.9, 0.86, 0.82]) this.slice(x, y, z, tiles.front, 1 - (0.9 - z) * 2, 0); return; }
    if (id === B.torch) { for (const z of [0.56, 0.5, 0.44]) this.slice(x, y, z, tiles.front, 1, 1); return; }
    // furniture and other props: stacked layers give them thickness
    const layers = bd.station || bd.container || bd.bed || bd.waystone ? [0.8, 0.72, 0.64, 0.56, 0.48, 0.4, 0.32, 0.24] : [0.6, 0.52, 0.44, 0.36];
    const emit = bd.light >= 8 ? 1 : 0;
    layers.forEach((z, i) => this.slice(x, y, z, tiles.front, 1 - i * 0.035, emit));
  }

  slice(x, y, z, uvr, shade, glow) {
    this.quad(this.solid, [[x, y + 1, z], [x + 1, y + 1, z], [x + 1, y, z], [x, y, z]], uvr, shade, null, glow);
  }

  liquid(lq, x, y, buf) {
    const lvl = lq & 15, t = lq >> 4, cw = this.cw;
    const above = cw.liqAt(x, y - 1), full = above && (above >> 4) === t;
    const hgt = full ? 1 : Math.max(0.12, lvl / 8);
    const top = y + 1 - hgt, z1 = 0.96, z0 = 0.04;
    const e = this.atlas.extra('white');
    const col = t === L_LAVA ? [1, 0.55, 0.12] : [0.18, 0.5, 0.95];
    const glow = t === L_LAVA ? 1 : 0;
    this.quad(buf, [[x, y + 1, z1], [x + 1, y + 1, z1], [x + 1, top, z1], [x, top, z1]], e, 1, col, glow, full ? 0 : 1);
    if (!full) this.quad(buf, [[x, top, z1], [x + 1, top, z1], [x + 1, top, z0], [x, top, z0]], e, 1.15, col, glow, 2);
    if (!cw.liqAt(x - 1, y) && !this.cubeAt(x - 1, y)) this.quad(buf, [[x, y + 1, z0], [x, y + 1, z1], [x, top, z1], [x, top, z0]], e, 0.8, col, glow);
    if (!cw.liqAt(x + 1, y) && !this.cubeAt(x + 1, y)) this.quad(buf, [[x + 1, y + 1, z1], [x + 1, y + 1, z0], [x + 1, top, z0], [x + 1, top, z1]], e, 0.7, col, glow);
  }
}
