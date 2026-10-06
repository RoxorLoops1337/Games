// BEATBOX HEROES -- pix.js
// A tiny software pixel buffer ("Pix") + colour tools + the shared noir palette.
// Everything in the game's art is painted into Pix buffers (typed arrays), so it runs
// identically in the browser and in node tests, and can be written to PNG for review.
// No DOM, no canvas needed except Pix#canvas() / Pix#draw() which only run in a browser.
(function (root) {
  'use strict';
  const BBH = root.BBH || (root.BBH = {});

  /* ------------------------------------------------------------------ utils */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  function rng(seed) {                      // mulberry32: tiny, fast, deterministic
    let s = seed >>> 0;
    const f = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.int = (n) => Math.floor(f() * n);
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    return f;
  }
  function hashStr(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }

  /* ----------------------------------------------------------------- colour */
  // A colour is: 0xRRGGBB number, '#rgb' / '#rrggbb' / '#rrggbbaa' string, or [r,g,b,a?].
  const cache = new Map();
  function C(c) {
    if (Array.isArray(c)) return c.length === 3 ? [c[0], c[1], c[2], 255] : c;
    if (typeof c === 'number') return [(c >> 16) & 255, (c >> 8) & 255, c & 255, 255];
    let hit = cache.get(c);
    if (hit) return hit;
    let s = String(c).trim();
    if (s[0] === '#') s = s.slice(1);
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    if (s.length === 6) s += 'ff';
    const n = parseInt(s, 16);
    hit = Number.isFinite(n) && s.length === 8
      ? [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
      : [255, 0, 255, 255];                 // loud magenta = bad colour string
    cache.set(c, hit);
    return hit;
  }
  const h2 = (n) => (n < 16 ? '0' : '') + n.toString(16);
  const hex = (c) => { const a = C(c); return '#' + h2(a[0]) + h2(a[1]) + h2(a[2]); };
  function toHsl(c) {
    const [R, G, B] = C(c); const r = R / 255, g = G / 255, b = B / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  function hsl(h, s, l) {                   // h degrees, s/l 0..1 -> '#rrggbb'
    h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
    const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return '#' + h2(Math.round(f(0) * 255)) + h2(Math.round(f(8) * 255)) + h2(Math.round(f(4) * 255));
  }
  function mix(a, b, t) {
    const A = C(a), B = C(b);
    return '#' + h2(Math.round(lerp(A[0], B[0], t))) + h2(Math.round(lerp(A[1], B[1], t))) + h2(Math.round(lerp(A[2], B[2], t)));
  }
  function hueToward(h, target, amt) {      // move hue h toward target by up to amt degrees (shortest way)
    let d = ((target - h + 540) % 360) - 180;
    return h + clamp(d, -amt, amt);
  }
  // 5-step ramp with noir hue shifting: shadows slide cool/violet, lights slide warm.
  // { deep, shade, base, light, hi }
  function ramp(base) {
    const [h, s, l] = toHsl(base);
    return {
      deep: hsl(hueToward(h, 268, 26), clamp(s * 0.95 + 0.04, 0, 1), l * 0.46),
      shade: hsl(hueToward(h, 268, 12), clamp(s * 1.04, 0, 1), l * 0.72),
      base: hex(base),
      light: hsl(hueToward(h, 44, 7), clamp(s * 1.0, 0, 1), l + (1 - l) * 0.26),
      hi: hsl(hueToward(h, 50, 12), clamp(s * 0.9, 0, 1), l + (1 - l) * 0.55),
    };
  }
  const lighten = (c, k) => { const [h, s, l] = toHsl(c); return hsl(h, s, l + (1 - l) * k); };
  const darken = (c, k) => { const [h, s, l] = toHsl(c); return hsl(h, s, l * (1 - k)); };

  /* ---------------------------------------------------------------- palette */
  // The locked noir palette: indigo shadows, warm window light, hot neon accents.
  const PAL = {
    ink: '#120d1f', night0: '#171027', night1: '#1f1536', night2: '#2c1d4d', violet: '#43296f', dusk: '#6a3b8f',
    plum: '#8e4a9c', rose: '#c9577f', coral: '#ff6b6b', orange: '#ff9a4a', amber: '#ffbe55', cream: '#fff0c9',
    gold: '#D4A017', brick0: '#3a1d2e', brick1: '#5b2a35', brick2: '#8a3f3f', brick3: '#b4604a',
    asphalt0: '#1c1a2b', asphalt1: '#2d2a42', asphalt2: '#46405e', concrete: '#7a7794', fog: '#a7a3c4',
    neonPink: '#ff3ea5', neonCyan: '#2ee6ff', neonLime: '#9dff4a', neonRed: '#ff2f4f', neonViolet: '#a86bff', neonYellow: '#ffe14d',
    white: '#fffaf0', teal: '#1f7a8c', green: '#3f9b5a', leaf: '#6fcf6f', blue: '#3a5fcd', sky: '#7fb2ff',
  };

  /* -------------------------------------------------------------------- Pix */
  class Pix {
    constructor(w, h) {
      this.w = w | 0; this.h = h | 0;
      this.data = new Uint8ClampedArray(this.w * this.h * 4);
      this._cv = null; this._dirty = true;
    }
    clone() { const p = new Pix(this.w, this.h); p.data.set(this.data); return p; }
    clear() { this.data.fill(0); this._dirty = true; return this; }
    fill(c) { return this.rect(0, 0, this.w, this.h, c, true); }
    inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
    // alpha-over single pixel (c may carry alpha; extra `a` multiplies it)
    px(x, y, c, a) {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
      const k = C(c), d = this.data, i = (y * this.w + x) * 4;
      let sa = k[3]; if (a !== undefined) sa = sa * a / 255;
      if (sa >= 254.5) { d[i] = k[0]; d[i + 1] = k[1]; d[i + 2] = k[2]; d[i + 3] = 255; }
      else if (sa > 0) {
        const da = d[i + 3], oa = sa + da * (1 - sa / 255);
        d[i] = (k[0] * sa + d[i] * da * (1 - sa / 255)) / oa;
        d[i + 1] = (k[1] * sa + d[i + 1] * da * (1 - sa / 255)) / oa;
        d[i + 2] = (k[2] * sa + d[i + 2] * da * (1 - sa / 255)) / oa;
        d[i + 3] = oa;
      }
      this._dirty = true; return this;
    }
    // additive light (for glows): adds colour * a, alpha stays
    add(x, y, c, a) {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
      const k = C(c), d = this.data, i = (y * this.w + x) * 4, f = (a === undefined ? 255 : a) / 255;
      d[i] += k[0] * f; d[i + 1] += k[1] * f; d[i + 2] += k[2] * f;
      if (d[i + 3] < 255) d[i + 3] = Math.max(d[i + 3], Math.min(255, 255 * f * (k[3] / 255)));
      this._dirty = true; return this;
    }
    get(x, y) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return [0, 0, 0, 0];
      const i = (y * this.w + x) * 4, d = this.data; return [d[i], d[i + 1], d[i + 2], d[i + 3]];
    }
    alphaAt(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.data[(y * this.w + x) * 4 + 3]; }
    rect(x, y, w, h, c, replace) {
      x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
      const k = C(c);
      if (replace || k[3] === 255) {
        const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(this.w, x + w), y1 = Math.min(this.h, y + h), d = this.data;
        for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
          const i = (yy * this.w + xx) * 4; d[i] = k[0]; d[i + 1] = k[1]; d[i + 2] = k[2]; d[i + 3] = k[3];
        }
        this._dirty = true;
      } else for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.px(xx, yy, k);
      return this;
    }
    hline(x, y, w, c) { return this.rect(x, y, w, 1, c); }
    vline(x, y, h, c) { return this.rect(x, y, 1, h, c); }
    frame(x, y, w, h, c) { return this.hline(x, y, w, c).hline(x, y + h - 1, w, c).vline(x, y, h, c).vline(x + w - 1, y, h, c); }
    line(x0, y0, x1, y1, c, t) {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1); t = t || 1;
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy, o = Math.floor((t - 1) / 2);
      for (;;) {
        if (t === 1) this.px(x0, y0, c); else this.rect(x0 - o, y0 - o, t, t, c);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
      return this;
    }
    // filled ellipse centred on (cx,cy) (may be half-integers for even sizes)
    ellipse(cx, cy, rx, ry, c) {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x - cx) / (rx + 0.5), ny = (y - cy) / (ry + 0.5);
        if (nx * nx + ny * ny <= 1) this.px(x, y, c);
      }
      return this;
    }
    // ellipse with 5-tone banded shading from a light direction (lx,ly unit-ish, default top-left)
    shadedEllipse(cx, cy, rx, ry, rp, lx, ly) {
      lx = lx === undefined ? -0.55 : lx; ly = ly === undefined ? -0.7 : ly;
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x - cx) / (rx + 0.5), ny = (y - cy) / (ry + 0.5), d = nx * nx + ny * ny;
        if (d > 1) continue;
        const t = nx * lx + ny * ly - 0.15 * d;   // -1 (lit) .. +1 (shade)
        this.px(x, y, t < -0.62 ? rp.hi : t < -0.18 ? rp.light : t < 0.34 ? rp.base : t < 0.74 ? rp.shade : rp.deep);
      }
      return this;
    }
    ring(cx, cy, rx, ry, c) {
      for (let y = Math.floor(cy - ry) - 1; y <= Math.ceil(cy + ry) + 1; y++) for (let x = Math.floor(cx - rx) - 1; x <= Math.ceil(cx + rx) + 1; x++) {
        const nx = (x - cx) / (rx + 0.5), ny = (y - cy) / (ry + 0.5), d = nx * nx + ny * ny;
        const inner = ((x - cx) / (rx - 0.5)) ** 2 + ((y - cy) / (ry - 0.5)) ** 2;
        if (d <= 1 && inner > 1) this.px(x, y, c);
      }
      return this;
    }
    poly(pts, c) {                          // scanline fill of a simple polygon [[x,y],...]
      let y0 = Infinity, y1 = -Infinity;
      for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
      for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
        const xs = [], yc = y + 0.5;
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
        xs.sort((p, q) => p - q);
        for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) this.px(x, y, c);
      }
      return this;
    }
    // draw ASCII rows. map: { char: colour }; '.' and ' ' are transparent.
    rows(rowsArr, x, y, map) {
      for (let j = 0; j < rowsArr.length; j++) for (let i = 0; i < rowsArr[j].length; i++) {
        const ch = rowsArr[j][i]; if (ch === '.' || ch === ' ') continue;
        const col = map[ch]; if (col !== undefined) this.px(x + i, y + j, col);
      }
      return this;
    }
    // copy another Pix onto this one. opts: flip (mirror x), flipY, a (0..255), add (additive), ox/oy origin offset
    blit(src, dx, dy, o) {
      o = o || {}; dx = Math.round(dx); dy = Math.round(dy);
      const sw = src.w, sh = src.h, sd = src.data;
      for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
        const i = (y * sw + x) * 4, sa = sd[i + 3]; if (!sa) continue;
        const tx = dx + (o.flip ? sw - 1 - x : x), ty = dy + (o.flipY ? sh - 1 - y : y);
        if (o.add) this.add(tx, ty, [sd[i], sd[i + 1], sd[i + 2], 255], o.a === undefined ? sa : sa * o.a / 255);
        else this.px(tx, ty, [sd[i], sd[i + 1], sd[i + 2], 255], o.a === undefined ? sa : sa * o.a / 255);
      }
      return this;
    }
    // coloured outline around the opaque shape. col: colour, or fn(neighbourRGBA)->colour (selective outline).
    // The buffer needs 1px of transparent padding. Returns this.
    outline(col, diag) {
      const w = this.w, h = this.h, src = this.data.slice(), nb = diag ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (src[(y * w + x) * 4 + 3] > 40) continue;
        let best = null;
        for (const [ox, oy] of nb) {
          const nx = x + ox, ny = y + oy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = (ny * w + nx) * 4; if (src[j + 3] > 200) { best = [src[j], src[j + 1], src[j + 2], 255]; break; }
        }
        if (best) this.px(x, y, typeof col === 'function' ? col(best) : col);
      }
      return this;
    }
    // Replace every pixel of colour `from` (exact RGB) by `to` -- cheap palette swaps
    swap(from, to) {
      const f = C(from), t = C(to), d = this.data;
      for (let i = 0; i < d.length; i += 4) if (d[i] === f[0] && d[i + 1] === f[1] && d[i + 2] === f[2] && d[i + 3]) { d[i] = t[0]; d[i + 1] = t[1]; d[i + 2] = t[2]; }
      this._dirty = true; return this;
    }
    // multiply every opaque pixel by a colour (tinting / night grade)
    tint(c, k) {
      const t = C(c), d = this.data; k = k === undefined ? 1 : k;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3]) {
        d[i] = lerp(d[i], d[i] * t[0] / 255, k); d[i + 1] = lerp(d[i + 1], d[i + 1] * t[1] / 255, k); d[i + 2] = lerp(d[i + 2], d[i + 2] * t[2] / 255, k);
      }
      this._dirty = true; return this;
    }
    countOpaque() { let n = 0; const d = this.data; for (let i = 3; i < d.length; i += 4) if (d[i] > 127) n++; return n; }
    bounds() {
      let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.data[(y * this.w + x) * 4 + 3] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    }
    hash() { let h = 2166136261 >>> 0; const d = this.data; for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 16777619) >>> 0; } return h; }
    // ---- browser only: cached offscreen canvas of this buffer (re-uploaded when dirty)
    canvas() {
      if (!this._cv) { this._cv = document.createElement('canvas'); this._cv.width = this.w; this._cv.height = this.h; this._dirty = true; }
      if (this._dirty) { this._cv.getContext('2d').putImageData(new ImageData(this.data, this.w, this.h), 0, 0); this._dirty = false; }
      return this._cv;
    }
    draw(ctx, x, y, o) {                    // draw onto a 2D context at integer coords (optionally flipped)
      const cv = this.canvas(); o = o || {};
      if (o.flip) { ctx.save(); ctx.translate(Math.round(x) + this.w, Math.round(y)); ctx.scale(-1, 1); ctx.drawImage(cv, 0, 0); ctx.restore(); }
      else ctx.drawImage(cv, Math.round(x), Math.round(y));
    }
    // ---- node only: PNG bytes, optionally nearest-neighbour enlarged, optionally over a background
    png(scale, bg) {
      const zlib = require('zlib'), s = scale || 1, W = this.w * s, H = this.h * s;
      const raw = Buffer.alloc((W * 4 + 1) * H), bgc = bg ? C(bg) : null;
      for (let y = 0; y < H; y++) {
        raw[y * (W * 4 + 1)] = 0;
        for (let x = 0; x < W; x++) {
          const i = ((Math.floor(y / s)) * this.w + Math.floor(x / s)) * 4, o = y * (W * 4 + 1) + 1 + x * 4, a = this.data[i + 3] / 255;
          if (bgc) { raw[o] = this.data[i] * a + bgc[0] * (1 - a); raw[o + 1] = this.data[i + 1] * a + bgc[1] * (1 - a); raw[o + 2] = this.data[i + 2] * a + bgc[2] * (1 - a); raw[o + 3] = 255; }
          else { raw[o] = this.data[i]; raw[o + 1] = this.data[i + 1]; raw[o + 2] = this.data[i + 2]; raw[o + 3] = this.data[i + 3]; }
        }
      }
      const crcT = (Pix._crc = Pix._crc || (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })());
      const crc = (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcT[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
      const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cr]); };
      const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
      return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
    }
  }
  // Lay several Pix side by side into a contact sheet (galleries / review images).
  Pix.sheet = function (list, cols, pad, bg) {
    pad = pad === undefined ? 2 : pad;
    const cw = Math.max(...list.map((p) => p.w)) + pad, ch = Math.max(...list.map((p) => p.h)) + pad;
    const rows = Math.ceil(list.length / cols), out = new Pix(cols * cw + pad, rows * ch + pad);
    if (bg) out.fill(bg);
    list.forEach((p, i) => out.blit(p, pad + (i % cols) * cw, pad + Math.floor(i / cols) * ch));
    return out;
  };

  Object.assign(BBH, { Pix, PAL, C, hex, hsl, toHsl, mix, ramp, lighten, darken, clamp, lerp, rng, hashStr, SCREEN: { W: 270, H: 480 } });
  if (typeof module !== 'undefined' && module.exports) module.exports = BBH;
})(typeof globalThis !== 'undefined' ? globalThis : this);
