// Cell Serpent: everything that is drawn in code, in the Hocus Vocus "chibi candy" look:
// an even warm-brown outline (never black), flat base colour + one hard cel shadow on the
// lower left + one gloss band on the upper right, big flat-cel eyes with a big and a small
// catchlight, round bouncy shapes. Light comes from the upper right.
//
// createArtDraw(makeCanvas) returns the drawing kit. `makeCanvas(w, h)` gives an offscreen
// canvas (the browser passes document.createElement, the tests pass a stub), so baked
// sprites are cached once and blitted. Anything that must move its face (heads) is drawn
// live with drawHead().
export const INK = '#2d170f';
const TAU = Math.PI * 2;

const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
export const shade = (h, k = 0.28) => mix(h, '#4a1a30', k);
export const tint = (h, k = 0.35) => mix(h, '#ffffff', k);

// ------------------------------------------------------------------ path helpers
const circ = (x, y, r) => g => { g.beginPath(); g.arc(x, y, r, 0, TAU); };
const ell = (x, y, rx, ry, rot = 0) => g => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); };
const poly = pts => g => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); };
const star = (n, r1, r2, rot = 0) => poly(Array.from({ length: n * 2 }, (_, i) => { const a = rot + (i / (n * 2)) * TAU, r = i % 2 ? r2 : r1; return [Math.cos(a) * r, Math.sin(a) * r]; }));

// Base colour, one cel shadow crescent (lower left), one gloss band (upper right), warm outline.
function cel(g, base, path, o = {}) {
  const R = o.r || 20, lw = o.lw || Math.max(2, R * 0.1);
  g.save(); path(g); g.clip();
  g.fillStyle = o.shadow || shade(base); g.fillRect(-400, -400, 800, 800);
  g.save(); g.translate(R * 0.14, -R * 0.14); path(g); g.fillStyle = base; g.fill(); g.restore();
  if (o.hi !== false) {
    g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = Math.max(1.5, R * 0.1); g.lineCap = 'round';
    g.beginPath(); g.arc(o.hx || 0, o.hy || 0, (o.hr || R) * 0.66, -1.25, -0.45); g.stroke();
  }
  g.restore();
  g.lineJoin = 'round'; g.lineWidth = lw; g.strokeStyle = INK; path(g); g.stroke();
}
const ink = (g, w, col = INK) => { g.lineWidth = w; g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round'; };
function line(g, pts, w, col = INK) { ink(g, w, col); g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); }
// a stick with a coloured core: outline first, colour on top
function stick(g, a, b, w, col) { line(g, [a, b], w, INK); line(g, [a, b], w * 0.55, col); }

// A big flat-cel eye. look: [-1..1, -1..1], open: 0..1 (blink).
function eye(g, x, y, rx, ry, o = {}) {
  const open = o.open === undefined ? 1 : o.open, iris = o.iris || '#7a4a22', lk = o.look || [0, 0];
  g.save(); g.translate(x, y);
  if (open < 0.2) { line(g, [[-rx, 0], [rx, 0.1 * ry]], Math.max(2, rx * 0.22)); g.restore(); return; }
  g.save(); ell(0, 0, rx, ry * open)(g); g.clip();
  g.fillStyle = '#fffaf0'; g.fillRect(-rx * 2, -ry * 2, rx * 4, ry * 4);
  const ix = lk[0] * rx * 0.28, iy = lk[1] * ry * 0.25;
  g.fillStyle = iris; ell(ix, iy, rx * 0.72, ry * 0.86)(g); g.fill();
  g.fillStyle = shade(iris, 0.5); ell(ix, iy + ry * 0.12, rx * 0.5, ry * 0.58)(g); g.fill();
  g.fillStyle = INK; ell(ix, iy, rx * 0.34, ry * 0.42)(g); g.fill();
  g.fillStyle = '#fff'; circ(ix - rx * 0.26, iy - ry * 0.3, rx * 0.2)(g); g.fill(); circ(ix + rx * 0.22, iy + ry * 0.26, rx * 0.09)(g); g.fill();
  g.restore();
  g.lineWidth = Math.max(2, rx * 0.2); g.strokeStyle = INK; ell(0, 0, rx, ry * open)(g); g.stroke();
  g.restore();
}
function brow(g, x0, y0, x1, y1, w) { line(g, [[x0, y0], [x1, y1]], w); }
function blush(g, x, y, r, col = '#ff6fa8') { g.save(); g.globalAlpha = 0.55; g.fillStyle = col; ell(x, y, r, r * 0.6)(g); g.fill(); g.restore(); }
function fangsMouth(g, x, y, w, open = 1, col = '#7a1633') {
  g.beginPath(); g.moveTo(x - w, y); g.lineTo(x + w, y); g.quadraticCurveTo(x, y + w * (0.5 + open * 1.1), x - w, y); g.closePath();
  g.fillStyle = col; g.fill(); ink(g, Math.max(2, w * 0.18)); g.stroke();
  g.fillStyle = '#fffaf0'; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x + s * w * 0.9, y); g.lineTo(x + s * w * 0.45, y); g.lineTo(x + s * w * 0.68, y + w * 0.5); g.closePath(); g.fill(); ink(g, Math.max(1.2, w * 0.1)); g.stroke(); }
}
function sparkle(g, x, y, r, col = '#fff8ec') { g.save(); g.translate(x, y); star(4, r, r * 0.22, 0)(g); g.fillStyle = col; g.fill(); ink(g, Math.max(1, r * 0.12)); g.stroke(); g.restore(); }

// ------------------------------------------------------------------ palettes
const SKIN = {
  pink: { base: '#ff7eb6', sh: '#d9488f', lite: '#ffc2dc', eye: '#ffc23d', acc: '#ffd84d' },
  purple: { base: '#a88bff', sh: '#6a4cd6', lite: '#dccfff', eye: '#ff5a8a', acc: '#ff7eb6', crystal: true },
  mint: { base: '#6fe0a8', sh: '#2fae78', lite: '#c4f5dc', eye: '#ff7eb6', acc: '#ffd84d' },
  sun: { base: '#ffb84d', sh: '#d9791e', lite: '#ffe0a8', eye: '#6a4cd6', acc: '#ff5a8a' },
  sky: { base: '#6fc8ff', sh: '#3d8fd6', lite: '#cdeaff', eye: '#ff5a8a', acc: '#ffd84d', crystal: true },
};
const KIND = { armor: '#aebbd6', bomb: '#ff4d6d', spitter: '#7be35a', gold: '#ffd84d' };

// ------------------------------------------------------------------ the kit
export function createArtDraw(makeCanvas, dpr = 2) {
  const cache = new Map();
  // bake(key, w, h, fn): fn draws around (0,0); the sprite is w x h logical units.
  function bake(key, w, h, fn) {
    if (cache.has(key)) return cache.get(key);
    let spr = null;
    const c = makeCanvas && makeCanvas(Math.ceil(w * dpr), Math.ceil(h * dpr));
    if (c) { const g = c.getContext('2d'); g.scale(dpr, dpr); g.translate(w / 2, h / 2); fn(g); spr = { c, w, h }; }
    cache.set(key, spr); return spr;
  }
  const B = 40;   // bake radius

  // ---- snake body segment (faces +x, toward the head) ----
  function bodyFn(skin, boss, kind) {
    const P = SKIN[skin] || SKIN.pink;
    return g => {
      const r = B;
      if (kind === 'armor') { bodyBase(g, P, boss, r); const pl = poly(Array.from({ length: 8 }, (_, i) => [Math.cos(i / 8 * TAU + 0.39) * r * 0.86, Math.sin(i / 8 * TAU + 0.39) * r * 0.86])); cel(g, KIND.armor, pl, { r, shadow: '#6f7d9a', hr: r * 0.9 });
        for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + Math.PI / 4; cel(g, '#e9eef8', circ(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.09), { r: r * 0.1, hi: false, lw: 1.6 }); }
        line(g, [[-r * 0.5, 0], [r * 0.5, 0]], r * 0.07, '#6f7d9a'); line(g, [[0, -r * 0.5], [0, r * 0.5]], r * 0.07, '#6f7d9a'); return; }
      if (kind === 'bomb') { cel(g, KIND.bomb, circ(0, 0, r * 0.92), { r, shadow: '#b32b4a' });
        line(g, [[r * 0.2, -r * 0.85], [r * 0.35, -r * 1.1], [r * 0.1, -r * 1.25]], r * 0.12);
        eye(g, -r * 0.3, -r * 0.05, r * 0.2, r * 0.24, { iris: '#2d170f' }); eye(g, r * 0.3, -r * 0.05, r * 0.2, r * 0.24, { iris: '#2d170f' });
        brow(g, -r * 0.55, -r * 0.42, -r * 0.1, -r * 0.28, r * 0.09); brow(g, r * 0.55, -r * 0.42, r * 0.1, -r * 0.28, r * 0.09);
        fangsMouth(g, 0, r * 0.38, r * 0.22, 0.4); return; }
      if (kind === 'spitter') { cel(g, KIND.spitter, circ(0, 0, r * 0.92), { r, shadow: '#3f9a3a' });
        for (const [x, y, s] of [[-0.5, -0.45, 0.1], [0.55, -0.5, 0.08], [-0.6, 0.35, 0.07]]) cel(g, '#b9f7a3', circ(x * r, y * r, s * r), { r: s * r, hi: false, lw: 1.6 });
        eye(g, -r * 0.28, -r * 0.2, r * 0.16, r * 0.2, { iris: '#2d170f' }); eye(g, r * 0.28, -r * 0.2, r * 0.16, r * 0.2, { iris: '#2d170f' });
        g.beginPath(); g.ellipse(0, r * 0.28, r * 0.3, r * 0.26, 0, 0, TAU); g.fillStyle = '#7a1633'; g.fill(); ink(g, r * 0.07); g.stroke();
        g.fillStyle = '#ff9ac0'; ell(0, r * 0.38, r * 0.16, r * 0.1)(g); g.fill(); return; }
      if (kind === 'gold') { bodyBase(g, { ...P, base: '#ffd84d', sh: '#d49a1e', lite: '#fff1a8' }, boss, r);
        cel(g, '#fff1a8', star(5, r * 0.5, r * 0.22, -Math.PI / 2), { r: r * 0.5, shadow: '#e0a82a', lw: 2 }); return; }
      bodyBase(g, P, boss, r);
    };
  }
  function bodyBase(g, P, boss, r) {
    const crystal = !!P.crystal;
    for (const s of [-1, 1]) for (const x of [-0.25, 0.3]) {   // stubby legs
      stick(g, [x * r, s * r * 0.7], [x * r + r * 0.12, s * r * 1.12], r * 0.26, tint(P.base, 0.15));
      cel(g, tint(P.base, 0.35), circ(x * r + r * 0.14, s * r * 1.14, r * 0.14), { r: r * 0.14, hi: false, lw: 1.8 });
    }
    if (crystal) {
      const pts = Array.from({ length: 18 }, (_, i) => { const a = (i / 18) * TAU, rr = i % 2 ? r * 0.8 : r * 1.02; return [Math.cos(a) * rr, Math.sin(a) * rr]; });
      cel(g, P.base, poly(pts), { r, shadow: P.sh, lw: r * 0.09 });
      cel(g, P.lite, poly(Array.from({ length: 6 }, (_, i) => [Math.cos(i / 6 * TAU + 0.3) * r * 0.42, Math.sin(i / 6 * TAU + 0.3) * r * 0.42])), { r: r * 0.4, shadow: tint(P.base, 0.3), hi: false, lw: 1.8 });
    } else {
      cel(g, P.base, circ(0, 0, r * 0.94), { r, shadow: P.sh });
      g.save(); g.globalAlpha = 0.7; g.fillStyle = P.lite; for (const [x, y, s] of [[-0.35, 0.05, 0.1], [0.05, 0.38, 0.08], [0.1, -0.36, 0.07]]) { circ(x * r, y * r, s * r)(g); g.fill(); } g.restore();
    }
    if (boss) {   // gold studs / pink crystals along the back
      for (const s of [-1, 1]) for (const x of [-0.3, 0.2]) cel(g, crystal ? '#ff7eb6' : '#ffd84d', poly([[x * r - r * 0.12, s * r * 0.82], [x * r + r * 0.12, s * r * 0.82], [x * r, s * r * 1.22]]), { r: r * 0.2, hi: false, lw: 2, shadow: crystal ? '#d9488f' : '#d49a1e' });
    }
  }

  // ---- minions (upright) ----
  function face(g, r, mood, o = {}) {
    const ex = r * (o.ex || 0.3), ey = r * (o.ey || -0.12), rx = r * (o.rx || 0.2), ry = r * (o.ry || 0.25);
    eye(g, -ex, ey, rx, ry, { iris: o.iris || '#7a4a22' }); eye(g, ex, ey, rx, ry, { iris: o.iris || '#7a4a22' });
    if (mood !== 'calm') { brow(g, -ex - rx, ey - ry * 1.15, -ex + rx * 0.8, ey - ry * 0.75, r * 0.075); brow(g, ex + rx, ey - ry * 1.15, ex - rx * 0.8, ey - ry * 0.75, r * 0.075); }
    if (o.mouth !== false) fangsMouth(g, 0, r * (o.my || 0.34), r * 0.2, 0.5);
    if (o.blush) { blush(g, -ex - rx * 0.6, ey + ry * 1.2, rx * 0.7); blush(g, ex + rx * 0.6, ey + ry * 1.2, rx * 0.7); }
  }
  function virus(col, spikes, horns) {
    return g => {
      const r = B * 0.78;
      for (let i = 0; i < spikes; i++) { const a = i / spikes * TAU + 0.2, x = Math.cos(a), y = Math.sin(a); stick(g, [x * r * 0.8, y * r * 0.8], [x * r * 1.28, y * r * 1.28], r * 0.22, shade(col, 0.1)); cel(g, tint(col, 0.2), circ(x * r * 1.36, y * r * 1.36, r * 0.16), { r: r * 0.16, hi: false, lw: 1.8 }); }
      cel(g, col, circ(0, 0, r), { r, shadow: shade(col, 0.3) });
      if (horns) for (const s of [-1, 1]) cel(g, '#fff1a8', poly([[s * r * 0.5, -r * 0.7], [s * r * 0.85, -r * 0.55], [s * r * 0.9, -r * 1.2]]), { r: r * 0.3, hi: false, lw: 2, shadow: '#e0a82a' });
      face(g, r, 'angry', { iris: '#2d170f', blush: true });
    };
  }
  const MIN = {
    green: virus('#6fe05a', 10), red: virus('#ff5a6e', 12, true),
    yellow: g => {
      const r = B * 0.8;
      for (const s of [-1, 1]) { line(g, [[s * r * 0.3, -r * 0.8], [s * r * 0.6, -r * 1.25]], r * 0.1); cel(g, '#ff7eb6', circ(s * r * 0.62, -r * 1.3, r * 0.15), { r: r * 0.15, hi: false, lw: 2 }); }
      cel(g, '#ffd84d', ell(0, 0, r * 0.85, r * 0.98), { r, shadow: '#d49a1e' });
      face(g, r, 'angry', { iris: '#2d170f', blush: true, ey: -0.05 });
    },
    jelly: g => {
      const r = B * 0.85, pts = [];
      for (let i = 0; i <= 12; i++) { const a = Math.PI + (i / 12) * Math.PI; pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.95]); }
      for (let i = 0; i <= 8; i++) { const x = r - (i / 8) * 2 * r; pts.push([x, r * 0.1 + (i % 2 ? r * 0.5 : r * 0.78)]); }
      cel(g, '#6fc8ff', poly(pts), { r, shadow: '#3d8fd6' });
      face(g, r, 'angry', { iris: '#1b2a5a', blush: true, ey: -0.1 });
    },
    eye: g => {
      const r = B * 0.78;
      for (const s of [-1, 1]) for (const k of [0.35, 0.78]) stick(g, [s * r * k, r * 0.7], [s * r * (k + 0.35), r * 1.25], r * 0.2, '#c4405a');
      cel(g, '#fff8ec', circ(0, 0, r), { r, shadow: '#e8c9c0' });
      eye(g, 0, 0, r * 0.62, r * 0.7, { iris: '#ff5a78' });
      brow(g, -r * 0.8, -r * 0.8, r * 0.1, -r * 0.55, r * 0.1);
    },
    robot: g => {
      const r = B * 0.8;
      for (const s of [-1, 1]) cel(g, '#ff7eb6', poly([[s * r * 0.8, -r * 0.2], [s * r * 1.45, -r * 0.7], [s * r * 1.1, r * 0.4]]), { r: r * 0.4, hi: false, lw: 2.2, shadow: '#d9488f' });
      cel(g, '#dfe6f6', circ(0, 0, r), { r, shadow: '#9aa6c6' });
      cel(g, '#394a78', circ(0, 0, r * 0.62), { r: r * 0.6, hi: false, lw: 2.4, shadow: '#232f55' });
      g.fillStyle = '#39f0ff'; circ(0, 0, r * 0.42)(g); g.fill(); g.fillStyle = '#b7fbff'; circ(0, 0, r * 0.26)(g); g.fill();
      g.fillStyle = '#fff'; circ(-r * 0.14, -r * 0.14, r * 0.1)(g); g.fill();
      brow(g, -r * 0.55, -r * 0.7, r * 0.4, -r * 0.5, r * 0.09);
    },
    bat: g => {
      const r = B * 0.7;
      for (const s of [-1, 1]) cel(g, '#a05fe0', poly([[s * r * 0.7, -r * 0.2], [s * r * 1.7, -r * 1.0], [s * r * 1.5, -r * 0.1], [s * r * 1.35, r * 0.25], [s * r * 1.0, r * 0.1], [s * r * 0.8, r * 0.5]]), { r: r * 0.7, hi: false, lw: 2.4, shadow: '#6a3aa8' });
      cel(g, '#6a4cb0', circ(0, 0, r), { r, shadow: '#43307f' });
      for (const s of [-1, 1]) cel(g, '#6a4cb0', poly([[s * r * 0.35, -r * 0.8], [s * r * 0.7, -r * 1.3], [s * r * 0.85, -r * 0.55]]), { r: r * 0.3, hi: false, lw: 2, shadow: '#43307f' });
      face(g, r, 'angry', { iris: '#ff5a78', blush: true, ey: -0.08 });
    },
    ghost: g => {
      const r = B * 0.8, pts = [];
      for (let i = 0; i <= 14; i++) { const a = Math.PI + (i / 14) * Math.PI; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
      for (let i = 0; i <= 8; i++) { const x = r - (i / 8) * 2 * r; pts.push([x, r * 0.55 + Math.sin(i * 1.6) * r * 0.22 + (i % 2 ? r * 0.2 : 0)]); }
      g.save(); g.globalAlpha = 0.93; cel(g, '#e6d9ff', poly(pts), { r, shadow: '#b69cf0' }); g.restore();
      eye(g, -r * 0.34, -r * 0.1, r * 0.2, r * 0.27, { iris: '#39d0ff' }); eye(g, r * 0.34, -r * 0.1, r * 0.2, r * 0.27, { iris: '#39d0ff' });
      brow(g, -r * 0.6, -r * 0.5, -r * 0.15, -r * 0.35, r * 0.08); brow(g, r * 0.6, -r * 0.5, r * 0.15, -r * 0.35, r * 0.08);
      g.fillStyle = '#7a1633'; ell(0, r * 0.32, r * 0.14, r * 0.18)(g); g.fill(); ink(g, r * 0.06); g.stroke();
    },
  };

  // ---- pickups ----
  const PICK = {
    gem: g => { const r = B * 0.7; cel(g, '#39f0ff', poly([[0, -r], [r * 0.75, -r * 0.1], [0, r], [-r * 0.75, -r * 0.1]]), { r, shadow: '#1b9ccf', lw: 3 }); line(g, [[-r * 0.75, -r * 0.1], [r * 0.75, -r * 0.1]], 2.2, '#1b9ccf'); sparkle(g, r * 0.2, -r * 0.4, r * 0.28); },
    coin: g => { const r = B * 0.7; cel(g, '#ffd84d', circ(0, 0, r), { r, shadow: '#d49a1e' }); g.strokeStyle = '#d49a1e'; g.lineWidth = r * 0.12; circ(0, 0, r * 0.66)(g); g.stroke(); cel(g, '#fff1a8', star(5, r * 0.42, r * 0.18, -Math.PI / 2), { r: r * 0.4, hi: false, lw: 1.6, shadow: '#e0a82a' }); },
    chest: g => { const r = B * 0.85;
      cel(g, '#c9803c', poly([[-r, -r * 0.2], [r, -r * 0.2], [r, r * 0.8], [-r, r * 0.8]]), { r, shadow: '#8c4f22', lw: 3, hi: false });
      cel(g, '#e09a52', poly([[-r, -r * 0.2], [-r * 0.9, -r * 0.8], [r * 0.9, -r * 0.8], [r, -r * 0.2]]), { r, shadow: '#a8622b', lw: 3, hi: false });
      g.fillStyle = '#ffd84d'; g.fillRect(-r * 0.12, -r * 0.8, r * 0.24, r * 1.6); ink(g, 2); g.strokeRect(-r * 0.12, -r * 0.8, r * 0.24, r * 1.6);
      cel(g, '#fff1a8', circ(0, r * 0.12, r * 0.22), { r: r * 0.22, shadow: '#e0a82a', lw: 2.4, hi: false }); sparkle(g, r * 0.7, -r * 0.95, r * 0.3); },
    heal: g => { const r = B * 0.8; const path = gg => { gg.beginPath(); gg.moveTo(0, r * 0.85); gg.bezierCurveTo(-r * 1.4, -r * 0.1, -r * 0.7, -r * 1.0, 0, -r * 0.35); gg.bezierCurveTo(r * 0.7, -r * 1.0, r * 1.4, -r * 0.1, 0, r * 0.85); gg.closePath(); };
      cel(g, '#ff5a7e', path, { r, shadow: '#c42a54', hy: -r * 0.2 }); g.fillStyle = '#fff8ec'; g.fillRect(-r * 0.1, -r * 0.3, r * 0.2, r * 0.6); g.fillRect(-r * 0.3, -r * 0.1, r * 0.6, r * 0.2); },
    shield: g => { const r = B * 0.85, path = gg => { gg.beginPath(); gg.moveTo(-r * 0.8, -r * 0.7); gg.quadraticCurveTo(0, -r * 1.05, r * 0.8, -r * 0.7); gg.lineTo(r * 0.8, -r * 0.05); gg.quadraticCurveTo(r * 0.7, r * 0.7, 0, r); gg.quadraticCurveTo(-r * 0.7, r * 0.7, -r * 0.8, -r * 0.05); gg.closePath(); };
      cel(g, '#4fb8ff', path, { r, shadow: '#2a78d6', hy: -r * 0.2 }); cel(g, '#bfe6ff', star(5, r * 0.34, r * 0.15, -Math.PI / 2), { r: r * 0.3, hi: false, lw: 1.6, shadow: '#7fc8ff' }); },
    rage: g => { const r = B * 0.85; cel(g, '#ff9a2e', star(8, r, r * 0.62, 0.2), { r, shadow: '#d6601a', lw: 3 }); cel(g, '#ffe14a', circ(0, 0, r * 0.45), { r: r * 0.45, shadow: '#e0a82a', hi: false, lw: 2 });
      g.fillStyle = '#c42a54'; poly([[-r * 0.1, -r * 0.32], [r * 0.2, -r * 0.05], [0, -r * 0.02], [r * 0.12, r * 0.32], [-r * 0.2, 0], [0, 0]])(g); g.fill(); },
  };

  // ---- weapon pieces (face +x unless upright) ----
  const WPN = {
    swab: g => { const r = B; line(g, [[-r * 1.2, 0], [r * 1.2, 0]], r * 0.42); line(g, [[-r * 1.2, 0], [r * 1.2, 0]], r * 0.24, '#ffe8c8');
      for (const s of [-1, 1]) cel(g, '#fffaf0', circ(s * r * 1.3, 0, r * 0.46), { r: r * 0.46, shadow: '#e6d6c8', lw: 3 }); },
    dagger: g => { const r = B;
      cel(g, '#dfe6f6', poly([[r * 1.2, 0], [r * 0.1, -r * 0.3], [-r * 0.35, 0], [r * 0.1, r * 0.3]]), { r: r * 0.7, shadow: '#9aa6c6', lw: 3, hi: false });
      line(g, [[r * 0.9, 0], [-r * 0.2, 0]], 2, '#9aa6c6');
      cel(g, '#ffd84d', poly([[-r * 0.35, -r * 0.4], [-r * 0.2, -r * 0.4], [-r * 0.2, r * 0.4], [-r * 0.35, r * 0.4]]), { r: r * 0.3, shadow: '#d49a1e', lw: 2.4, hi: false });
      cel(g, '#ff7eb6', poly([[-r * 0.85, -r * 0.14], [-r * 0.35, -r * 0.14], [-r * 0.35, r * 0.14], [-r * 0.85, r * 0.14]]), { r: r * 0.3, shadow: '#d9488f', lw: 2.4, hi: false }); },
    needle: g => { const r = B; line(g, [[-r * 1.0, 0], [r * 1.2, 0]], r * 0.2); line(g, [[-r * 1.0, 0], [r * 1.2, 0]], r * 0.09, '#f2f6ff');
      cel(g, '#ff7eb6', circ(-r * 1.05, 0, r * 0.2), { r: r * 0.2, shadow: '#d9488f', lw: 2.4, hi: false }); },
    stick: g => { const r = B; line(g, [[-r * 2, 0], [r * 1.6, 0]], r * 0.5); line(g, [[-r * 2, 0], [r * 1.6, 0]], r * 0.32, '#ff9ac6'); line(g, [[-r * 2, -r * 0.05], [r * 1.2, -r * 0.05]], r * 0.07, '#ffd0e6');
      for (const x of [0.5, 1.0, 1.5]) cel(g, '#ffe3f0', circ(r * x, 0, r * 0.3), { r: r * 0.3, shadow: '#ff9ac6', lw: 3, hi: false });
      cel(g, '#ffd84d', circ(-r * 2, 0, r * 0.34), { r: r * 0.34, shadow: '#d49a1e', lw: 3, hi: false }); },
    tower: g => { const r = B;
      cel(g, '#fff8ec', poly([[-r * 0.6, r * 0.9], [-r * 0.5, -r * 0.5], [r * 0.5, -r * 0.5], [r * 0.6, r * 0.9]]), { r, shadow: '#e6d6c8', lw: 3.4, hi: false });
      cel(g, '#4fb8ff', poly([[-r * 0.8, -r * 0.5], [0, -r * 1.25], [r * 0.8, -r * 0.5]]), { r, shadow: '#2a78d6', lw: 3.4, hi: false });
      g.fillStyle = '#ff5a7e'; g.fillRect(-r * 0.09, -r * 0.1, r * 0.18, r * 0.5); g.fillRect(-r * 0.25, r * 0.06, r * 0.5, r * 0.18);
      eye(g, -r * 0.22, -r * 0.3, r * 0.1, r * 0.13, { iris: '#2d170f' }); eye(g, r * 0.22, -r * 0.3, r * 0.1, r * 0.13, { iris: '#2d170f' });
      sparkle(g, r * 0.55, -r * 1.1, r * 0.22); },
  };

  // ---- shots: music notes (sound is the currency of this world) ----
  function noteFn(col, crit) {
    return g => {
      const r = B * 0.55;
      const stem = [[r * 0.5, r * 0.3], [r * 0.5, -r * 1.2]];
      line(g, stem, r * 0.34); line(g, stem, r * 0.16, col);
      g.beginPath(); g.moveTo(r * 0.5, -r * 1.2); g.bezierCurveTo(r * 1.5, -r * 1.0, r * 1.3, -r * 0.2, r * 1.0, r * 0.1); ink(g, r * 0.34); g.stroke(); ink(g, r * 0.16, col); g.stroke();
      cel(g, col, ell(0, r * 0.35, r * 0.62, r * 0.46, -0.4), { r: r * 0.6, lw: r * 0.14, shadow: shade(col, 0.3) });
      if (crit) sparkle(g, -r * 0.7, -r * 0.7, r * 0.55, '#fff8ec');
    };
  }
  function acidFn(g) { const r = B * 0.55; cel(g, '#8dff6a', circ(0, 0, r), { r, shadow: '#43b83a' }); fangsMouth(g, 0, r * 0.12, r * 0.28, 0.2, '#2f7a2a'); eye(g, -r * 0.3, -r * 0.3, r * 0.14, r * 0.18, { iris: '#2d170f' }); eye(g, r * 0.3, -r * 0.3, r * 0.14, r * 0.18, { iris: '#2d170f' }); }

  const SPR = {
    body: (skin, boss, kind) => bake(`body|${skin}|${boss ? 1 : 0}|${kind || ''}`, B * 3.2, B * 3.2, bodyFn(skin, boss, kind)),
    minion: id => bake('min|' + id, B * 3.4, B * 3.4, MIN[id] || MIN.green),
    pickup: k => bake('pk|' + k, B * 2.4, B * 2.4, PICK[k] || PICK.gem),
    note: crit => bake('note|' + (crit ? 1 : 0), B * 2.4, B * 2.4, noteFn(crit ? '#ffd84d' : '#6fe3ff', crit)),
    acid: () => bake('acid', B * 1.6, B * 1.6, acidFn),
    weapon: id => bake('wpn|' + id, B * 4.6, B * 3.4, WPN[id] || WPN.dagger),
  };

  // blit a baked sprite centred at (x, y), `size` wide, optional rotation / flip
  function blit(g, spr, x, y, size, rot = 0, flip = false, alpha = 1) {
    if (!spr) return false;
    const k = size / spr.w;
    g.save(); g.translate(x, y); if (rot) g.rotate(rot); if (flip) g.scale(-1, 1); if (alpha !== 1) g.globalAlpha *= alpha;
    g.drawImage(spr.c, -spr.w * k / 2, -spr.h * k / 2, spr.w * k, spr.h * k); g.restore(); return true;
  }

  // live head: body and feelers rotate with the snake, the FACE stays upright and looks at the player.
  function drawHead(g, x, y, r, ang, o = {}) {
    const P = SKIN[o.skin] || SKIN.pink, boss = !!o.boss, crystal = !!P.crystal, t = o.t || 0;
    g.save(); g.translate(x, y); g.scale(r / B, r / B);
    const R = B;
    g.save(); g.rotate(ang);
    // feelers (bob on their own)
    if (!boss) for (const s of [-1, 1]) { const w = Math.sin(t * 5 + s) * R * 0.12; line(g, [[-R * 0.1, s * R * 0.55], [R * 0.5, s * (R * 0.95 + w)], [R * 0.95, s * (R * 1.1 + w)]], R * 0.16); line(g, [[-R * 0.1, s * R * 0.55], [R * 0.5, s * (R * 0.95 + w)], [R * 0.95, s * (R * 1.1 + w)]], R * 0.08, P.base); cel(g, P.acc, circ(R * 0.98, s * (R * 1.1 + w), R * 0.17), { r: R * 0.17, hi: false, lw: 2.2, shadow: shade(P.acc) }); }
    else for (const s of [-1, 1]) cel(g, '#ffd84d', poly([[R * 0.1, s * R * 0.7], [R * 0.9, s * R * 1.05], [R * 0.55, s * R * 1.65], [R * 0.45, s * R * 0.95]]), { r: R * 0.7, hi: false, lw: 3, shadow: '#d49a1e' });
    for (const s of [-1, 1]) { stick(g, [R * 0.1, s * R * 0.75], [R * 0.25, s * R * 1.1], R * 0.28, tint(P.base, 0.15)); cel(g, tint(P.base, 0.35), circ(R * 0.28, s * R * 1.12, R * 0.15), { r: R * 0.15, hi: false, lw: 1.8 }); }
    if (crystal) {
      const pts = Array.from({ length: 20 }, (_, i) => { const a = (i / 20) * TAU, rr = i % 2 ? R * 0.84 : R * 1.06; return [Math.cos(a) * rr, Math.sin(a) * rr]; });
      cel(g, P.base, poly(pts), { r: R, shadow: P.sh, lw: R * 0.09 });
    } else cel(g, P.base, circ(0, 0, R * 0.98), { r: R, shadow: P.sh });
    g.restore();
    // face
    const fx = Math.cos(ang) * R * 0.18, fy = Math.sin(ang) * R * 0.18;
    g.translate(fx, fy - R * 0.04);
    const open = (t % 3.7) > 3.55 ? 0.1 : 1, look = o.look || [0, 0];
    eye(g, -R * 0.36, -R * 0.1, R * 0.28, R * 0.34, { iris: boss ? '#ff3d5a' : P.eye, look, open });
    eye(g, R * 0.36, -R * 0.1, R * 0.28, R * 0.34, { iris: boss ? '#ff3d5a' : P.eye, look, open });
    const bw = boss ? 0.62 : 0.5;
    brow(g, -R * 0.68, -R * 0.62, -R * 0.1, -R * bw * 0.6, R * 0.1); brow(g, R * 0.68, -R * 0.62, R * 0.1, -R * bw * 0.6, R * 0.1);
    blush(g, -R * 0.62, R * 0.2, R * 0.16, crystal ? '#ff8ac4' : '#ff3d7a'); blush(g, R * 0.62, R * 0.2, R * 0.16, crystal ? '#ff8ac4' : '#ff3d7a');
    fangsMouth(g, 0, R * 0.34, R * 0.3, o.mouth === undefined ? 0.6 : o.mouth);
    if (o.flash > 0) { g.fillStyle = `rgba(255,255,255,${Math.min(0.7, o.flash * 5)})`; circ(0, 0, R * 1.05)(g); g.fill(); }
    g.restore();
  }

  // flat colour fallback shapes are not needed: the kit always draws. Expose helpers for UI art too.
  return { SPR, blit, drawHead, cel, eye, sparkle, MINION_IDS: Object.keys(MIN), cache, B };
}
