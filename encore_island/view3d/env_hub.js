// Encore Island 3D environment: the zoned home island floor (render_world.js drawHubFloor in 3D). Every zone is a thin bevelled slab (<= 0.06 high) with
// an ink outline and its own painted texture: cobbles, veined marble, ember basalt, planks, rippled sand, chamfered slabs, aqua dock tiles, flagstones.
// Higher tiers sit on top of lower ones, in the 2D draw order (boulevards, zones, terrace, plaza). Stage, signs, lamps and plates belong to hub3d.js.
import * as THREE from 'three';
import * as kit from './kit.js';
import { W, TAU, Acc, patchMat } from './env_util.js';

const D2R = Math.PI / 180, INKC = new THREE.Color(0x2d170f);
const TIER = { blvd: 0.022, zone: 0.034, terrace: 0.044, plaza: 0.054 };

// ---------------------------------------------------------------- textures (512 px, seamless by drawing wrapped copies)
const wrap9 = (S, f) => { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) f(dx, dy); };
function bevelRect(g, x, y, w, h, r, base, hi, lo, lw = 3) { // a stone with a lit top-left edge and a shaded bottom-right edge
  kit.rrPath(g, x, y, w, h, r); const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, hi); gr.addColorStop(0.5, base); gr.addColorStop(1, lo); g.fillStyle = gr; g.fill();
  g.save(); kit.rrPath(g, x, y, w, h, r); g.clip(); g.lineWidth = lw * 2; g.strokeStyle = 'rgba(255,255,255,0.5)'; kit.rrPath(g, x + 1, y + 1, w - 2, h - 2, r); g.stroke(); g.strokeStyle = 'rgba(70,40,90,0.22)'; kit.rrPath(g, x - 1, y + 2, w + 2, h + 2, r); g.stroke(); g.restore();
}
const speck = (g, r, S, n, col, a, rad = 1.4) => { for (let i = 0; i < n; i++) { g.fillStyle = col; g.globalAlpha = a * (0.4 + r() * 0.6); g.beginPath(); g.arc(r() * S, r() * S, rad * (0.5 + r()), 0, TAU); g.fill(); } g.globalAlpha = 1; };
const jitterHex = (hex, r, amt) => '#' + new THREE.Color(hex).offsetHSL((r() - 0.5) * 0.02, 0, (r() - 0.5) * amt).getHexString();
const TEX = {
  cobble(g, S) { const r = kit.rng(5); g.fillStyle = '#cfa97a'; g.fillRect(0, 0, S, S); const n = 5, cs = S / n, pal = ['#fff1d6', '#f9e8c8', '#f4dfb8', '#fcebd0'];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const sh = (j % 2) * cs / 2, w = cs - 9 - r() * 6, h = cs - 9 - r() * 6, x = i * cs + sh + 4 + r() * 4, y = j * cs + 4 + r() * 4, base = jitterHex(pal[(r() * 4) | 0], r, 0.05);
      wrap9(S, (dx, dy) => { bevelRect(g, x + dx, y + dy, w, h, 22 + r() * 8, base, '#fffaf0', '#e8d0a6'); if ((i + j) % 3 === 0) { g.fillStyle = 'rgba(255,126,182,0.10)'; kit.rrPath(g, x + dx, y + dy, w, h, 24); g.fill(); } }); }
    speck(g, r, S, 140, '#b89868', 0.35); speck(g, r, S, 90, '#ffffff', 0.5, 1.1); },
  marble(g, S) { const r = kit.rng(9), n = 4, cs = S / n; g.fillStyle = '#d5c6ee'; g.fillRect(0, 0, S, S);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = i * cs, y = j * cs; const gr = g.createLinearGradient(x, y, x + cs, y + cs); const odd = (i + j) % 2; gr.addColorStop(0, odd ? '#f9f4ff' : '#fffaf6'); gr.addColorStop(1, odd ? '#e9e0f8' : '#f0e8f6'); g.fillStyle = gr; g.fillRect(x + 2, y + 2, cs - 4, cs - 4);
      g.save(); g.beginPath(); g.rect(x + 2, y + 2, cs - 4, cs - 4); g.clip(); g.lineCap = 'round';
      for (let v = 0; v < 3; v++) { const vx = x + r() * cs, vy = y + r() * cs, sg = r() < 0.5 ? 1 : -1; g.beginPath(); g.moveTo(vx - 60 * sg, vy - 50); g.bezierCurveTo(vx - 20, vy - 30 + r() * 40, vx + 10, vy + 20 - r() * 30, vx + 70 * sg, vy + 60); g.strokeStyle = 'rgba(150,120,200,0.26)'; g.lineWidth = 3 + r() * 3; g.stroke(); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.2; g.stroke(); }
      g.restore(); g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillRect(x + 3, y + 3, cs - 6, 3); g.fillRect(x + 3, y + 3, 3, cs - 6); g.fillStyle = 'rgba(120,90,170,0.35)'; g.fillRect(x + 3, y + cs - 6, cs - 6, 3); g.fillRect(x + cs - 6, y + 3, 3, cs - 6); }
    speck(g, r, S, 22, '#f0b83c', 0.85, 1.7); },
  basalt(g, S) { const r = kit.rng(13); g.fillStyle = '#1e1220'; g.fillRect(0, 0, S, S); const n = 4, cs = S / n;
    const tiles = []; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) tiles.push([i * cs + (j % 2) * cs / 2 + 6, j * cs + 6, cs - 12, cs - 12]);
    g.save(); g.shadowColor = '#ff7a2a'; g.shadowBlur = 14; g.strokeStyle = 'rgba(255,140,50,0.75)'; g.lineWidth = 3; for (const [x, y, w, h] of tiles) wrap9(S, (dx, dy) => { kit.rrPath(g, x - 4 + dx, y - 4 + dy, w + 8, h + 8, 20); g.stroke(); }); g.restore();
    for (const [x, y, w, h] of tiles) wrap9(S, (dx, dy) => bevelRect(g, x + dx, y + dy, w, h, 16, jitterHex('#4c3a4a', r, 0.07), '#6a5568', '#33222f', 2.5));
    speck(g, r, S, 70, '#ff9a2e', 0.8, 1.8); speck(g, r, S, 40, '#ffd84d', 0.8, 1.2); speck(g, r, S, 100, '#8a7088', 0.4, 1.2); },
  plank(g, S) { const r = kit.rng(17), rows = 8, rh = S / rows, pal = ['#d2b080', '#c9a878', '#bf9a6a', '#d8b886', '#c4a070'];
    for (let j = 0; j < rows; j++) { const y = j * rh, L = S / 2, off = r() * L; for (let k = -1; k < 3; k++) { const x = off + k * L, base = jitterHex(pal[(r() * 5) | 0], r, 0.06);
      wrap9(S, (dx, dy) => { const gr = g.createLinearGradient(0, y + dy, 0, y + dy + rh); gr.addColorStop(0, '#ead2a8'); gr.addColorStop(0.12, base); gr.addColorStop(1, '#a98255'); g.fillStyle = gr; g.fillRect(x + dx + 1, y + dy + 1, L - 2, rh - 2);
        g.strokeStyle = 'rgba(90,50,20,0.28)'; g.lineWidth = 1.4; for (let q = 0; q < 4; q++) { const gy = y + dy + 8 + q * (rh - 14) / 3 + r() * 4; g.beginPath(); g.moveTo(x + dx + 4, gy); g.bezierCurveTo(x + dx + L * 0.3, gy - 3 + r() * 6, x + dx + L * 0.65, gy + 3 - r() * 6, x + dx + L - 4, gy + r() * 3); g.stroke(); }
        for (const nx of [x + 9, x + L - 9]) { g.fillStyle = 'rgba(60,30,10,0.55)'; g.beginPath(); g.arc(nx + dx, y + dy + rh / 2, 2.4, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,240,200,0.5)'; g.beginPath(); g.arc(nx + dx - 0.7, y + dy + rh / 2 - 0.7, 1, 0, TAU); g.fill(); }
        g.fillStyle = 'rgba(50,25,8,0.55)'; g.fillRect(x + dx, y + dy, 2.5, rh); }); }
      g.fillStyle = 'rgba(50,25,8,0.55)'; g.fillRect(0, y, S, 2.5); } },
  sand(g, S) { const r = kit.rng(21); g.fillStyle = '#f3d9a8'; g.fillRect(0, 0, S, S); g.lineCap = 'round';
    for (let i = 0; i < 18; i++) { const y = (i + r() * 0.5) * S / 18, ph = r() * 6; for (const [col, off, lw] of [['rgba(255,250,230,0.8)', -2, 2.6], ['rgba(190,150,95,0.32)', 3, 3]]) { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); for (let x = -8; x <= S + 8; x += 8) { const yy = y + off + Math.sin(x * 0.03 + ph) * 5 + Math.sin(x * 0.09 + ph * 2) * 2; x < 0 ? g.moveTo(x, yy) : g.lineTo(x, yy); } g.stroke(); } }
    speck(g, r, S, 260, '#c8a468', 0.4, 1.2); speck(g, r, S, 120, '#ffffff', 0.5, 1.2);
    for (let i = 0; i < 9; i++) { const x = r() * S, y = r() * S; wrap9(S, (dx, dy) => { g.fillStyle = 'rgba(150,115,70,0.45)'; g.beginPath(); g.ellipse(x + dx + 1.5, y + dy + 2, 7 + r() * 4, 4.5, 0.3, 0, TAU); g.fill(); g.fillStyle = '#e8d2a4'; g.beginPath(); g.ellipse(x + dx, y + dy, 7 + r() * 4, 4.5, 0.3, 0, TAU); g.fill(); }); } },
  slab(g, S) { const r = kit.rng(25), n = 3, cs = S / n; g.fillStyle = '#a995c6'; g.fillRect(0, 0, S, S);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = i * cs + 5, y = j * cs + 5, w = cs - 10;
      const base = (i + j) % 2 ? '#f4eefa' : '#ebe2f4'; wrap9(S, (dx, dy) => bevelRect(g, x + dx, y + dy, w, w, 10, base, '#ffffff', '#d9cbe8', 4));
      g.strokeStyle = 'rgba(130,100,170,0.22)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + w * (0.2 + r() * 0.2), y + 8); g.lineTo(x + w * (0.4 + r() * 0.3), y + w * 0.55); g.lineTo(x + w * (0.3 + r() * 0.5), y + w - 8); g.stroke(); }
    speck(g, r, S, 90, '#9a82c0', 0.28, 2); speck(g, r, S, 60, '#ffffff', 0.7, 1.2); },
  dock(g, S) { const r = kit.rng(29), n = 4, cs = S / n; g.fillStyle = '#9fd8e8'; g.fillRect(0, 0, S, S);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = i * cs + 4, y = j * cs + 4, w = cs - 8; wrap9(S, (dx, dy) => bevelRect(g, x + dx, y + dy, w, w, 14, (i + j) % 2 ? '#e2faff' : '#cdf1fa', '#ffffff', '#b4e2ee', 3));
      g.strokeStyle = 'rgba(70,170,200,0.45)'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); for (let q = 0; q < 2; q++) { const yy = y + w * (0.38 + q * 0.26); g.moveTo(x + w * 0.2, yy); g.quadraticCurveTo(x + w * 0.35, yy - 9, x + w * 0.5, yy); g.quadraticCurveTo(x + w * 0.65, yy + 9, x + w * 0.8, yy); } g.stroke(); }
    speck(g, r, S, 50, '#ffffff', 0.8, 1.4); },
  landing(g, S) { const r = kit.rng(33); g.fillStyle = '#2e2244'; g.fillRect(0, 0, S, S); const rows = 4, rh = S / rows;
    for (let j = 0; j < rows; j++) { const y = j * rh, L = S / 2, off = r() * L; for (let k = -1; k < 3; k++) { const x = off + k * L; wrap9(S, (dx, dy) => bevelRect(g, x + dx + 4, y + dy + 4, L - 8, rh - 8, 14, jitterHex('#6f5f92', r, 0.08), '#9a8abc', '#4c3d6c', 3)); } }
    speck(g, r, S, 90, '#5a8a6a', 0.45, 2.2); speck(g, r, S, 120, '#b8a8d8', 0.35, 1.3); },
};
const TILEU = { cobble: 5.1, marble: 8, basalt: 5.1, plank: 4, sand: 6, slab: 6, dock: 4, landing: 5 };
const _tm = {};
function texMat(kind) {
  if (_tm[kind]) return _tm[kind]; const map = kit.canvasTex(512, 512, (g, w) => TEX[kind](g, w), { repeat: true, aniso: 8 });
  const m = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: kind === 'marble' ? 0.38 : kind === 'dock' ? 0.45 : 0.88, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.userData.shared = true; return (_tm[kind] = m);
}
const TRIM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

// ---------------------------------------------------------------- polygons (world units, XZ) and slab builder
const circ = (cx, cz, r, n = 72) => { const p = []; for (let i = 0; i < n; i++) { const a = i / n * TAU; p.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); } return p; };
const ell = (cx, cz, rx, rz, n = 72) => { const p = []; for (let i = 0; i < n; i++) { const a = i / n * TAU; p.push([cx + Math.cos(a) * rx, cz + Math.sin(a) * rz]); } return p; };
function capsule(ax, az, bx, bz, w, n = 10) { // stadium around the segment a-b
  const a = Math.atan2(bz - az, bx - ax), p = []; for (let i = 0; i <= n; i++) { const t = a - Math.PI / 2 + i / n * Math.PI; p.push([bx + Math.cos(t) * w / 2, bz + Math.sin(t) * w / 2]); }
  for (let i = 0; i <= n; i++) { const t = a + Math.PI / 2 + i / n * Math.PI; p.push([ax + Math.cos(t) * w / 2, az + Math.sin(t) * w / 2]); } return p;
}
function sector(cx, cz, r0, r1, a0, a1, n = 40) { const p = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; p.push([cx + Math.cos(a) * r1, cz + Math.sin(a) * r1]); } for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * i / n; p.push([cx + Math.cos(a) * r0, cz + Math.sin(a) * r0]); } return p; }
const area = (p) => { let s = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; s += p[i][0] * q[1] - q[0] * p[i][1]; } return s / 2; };
function offsetPoly(p, d) { // push every vertex outward along its averaged normal
  const n = p.length, sg = area(p) > 0 ? 1 : -1, out = [];
  for (let i = 0; i < n; i++) { const a = p[(i + n - 1) % n], b = p[(i + 1) % n], tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1; out.push([p[i][0] + tz / l * d * sg, p[i][1] - tx / l * d * sg]); }
  return out;
}
const col3 = (c) => (c.isColor ? c : new THREE.Color(c));

/** collects slabs into per-material accumulators; each piece: top face (textured), rim bevel, ink outline */
class Floor {
  constructor() { this.tex = {}; this.trim = new Acc(); }
  texAcc(k) { return this.tex[k] || (this.tex[k] = { p: [], n: [], c: [], uv: [] }); }
  /** triangle into the trim mesh, wound so its normal points up (the slabs are viewed from above only) */
  triUp(a, ya, ca, b, yb, cb, c, yc, cc) {
    const ny = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
    if (ny >= 0) this.trim.triv(a[0], ya, a[1], ca, b[0], yb, b[1], cb, c[0], yc, c[1], cc); else this.trim.triv(a[0], ya, a[1], ca, c[0], yc, c[1], cc, b[0], yb, b[1], cb);
  }
  band(P, Q, yp, yq, cp, cq) { const n = P.length; for (let i = 0; i < n; i++) { const j = (i + 1) % n; this.triUp(P[i], yp, cp, P[j], yp, cp, Q[i], yq, cq); this.triUp(P[j], yp, cp, Q[j], yq, cq, Q[i], yq, cq); } }
  slab(poly, y, kind, rimHex, o = {}) {
    const A = this.texAcc(kind), up = TILEU[kind], tint = col3(o.tint || 0xffffff);
    const pts = poly.map((q) => new THREE.Vector2(q[0], q[1])), faces = THREE.ShapeUtils.triangulateShape(pts, []);
    for (const f of faces) { let [a, b, c] = f; const pa = poly[a], pb = poly[b], pc = poly[c]; if ((pb[1] - pa[1]) * (pc[0] - pa[0]) - (pb[0] - pa[0]) * (pc[1] - pa[1]) < 0) { const t = b; b = c; c = t; }
      for (const i of [a, b, c]) { A.p.push(poly[i][0], y, poly[i][1]); A.n.push(0, 1, 0); A.c.push(tint.r, tint.g, tint.b); A.uv.push(poly[i][0] / up, poly[i][1] / up); } }
    const rim = col3(rimHex), o1 = offsetPoly(poly, 0.05), o2 = offsetPoly(poly, 0.15);
    this.band(poly, o1, y, y - 0.016, rim, rim.clone().multiplyScalar(0.8)); this.band(o1, o2, y - 0.016, y - 0.018, INKC, INKC);
  }
  /** a small flat quad centred at (x, z) rotated by `a`: dashes, studs */
  quad(x, z, w, l, a, y, col) {
    const ca = Math.cos(a), sa = Math.sin(a), c = col3(col), P = [[-l / 2, -w / 2], [l / 2, -w / 2], [l / 2, w / 2], [-l / 2, w / 2]].map(([u, v]) => [x + u * ca - v * sa, z + u * sa + v * ca]);
    this.triUp(P[0], y, c, P[1], y, c, P[2], y, c); this.triUp(P[0], y, c, P[2], y, c, P[3], y, c);
  }
  build() {
    const grp = new THREE.Group(); grp.name = 'hubFloor';
    for (const k in this.tex) { const A = this.tex[k], g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(A.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(A.n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(A.c, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(A.uv, 2)); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, texMat(k)); m.receiveShadow = true; m.castShadow = false; m.name = 'floor_' + k; grp.add(m); }
    const tg = this.trim.build(false); if (tg) { const m = new THREE.Mesh(tg, TRIM); m.receiveShadow = true; m.name = 'floor_trim'; grp.add(m); }
    return grp;
  }
}

/** build the whole hub floor + terrace balustrade. All hub constants are read from the 2D game's globals. */
export function buildHubFloor() {
  const F = new Floor(), w = (v) => v * W;
  const plazaR = w(PLAZA_R), blvdW = w(BLVD_W);
  // boulevards (capsules from the plaza edge to each end); lengths follow blvdPathTo
  const ends = { 90: TERRACE.y + 280 - 90, '-90': 345, 180: 345, '-40': 390, 0: 500, 33: 440, 148: 470 };
  for (const d of ZONE_DEG) { const a = d * D2R, r1 = ends[d] !== undefined ? ends[d] : 470, a0 = PLAZA_R - 30;
    F.slab(capsule(w(Math.cos(a) * a0), w(Math.sin(a) * a0), w(Math.cos(a) * r1), w(Math.sin(a) * r1), blvdW), TIER.blvd, 'cobble', 0xfff1d6); }
  // zones (2D order)
  const Z = (cx, cy, rx, ry, kind, rim, y = TIER.zone, tint) => F.slab(ell(w(cx), w(cy), w(rx), w(ry)), y, kind, rim, { tint });
  Z(0, -345, 290, 130, 'marble', 0xfff8ee); Z(345, -180, 190, 150, 'basalt', 0x7a5a60); Z(-345, -140, 190, 200, 'plank', 0xe8c89a); Z(500, 60, 95, 70, 'sand', 0xfff1d6);
  Z(WAYPAD.x, WAYPAD.y, 86, 86, 'dock', 0xdff8ff); Z(HATCH.x, HATCH.y + 10, 92, 76, 'landing', 0x8a7aa8);
  // training terrace: slab ring sector
  const T = TERRACE, a0 = T.a0 * D2R, a1 = T.a1 * D2R;
  F.slab(sector(w(T.x), w(T.y), w(T.r - 60), w(T.r + 110), a0, a1, 48), TIER.terrace, 'slab', 0xfff8ee);
  // stage plaza
  F.slab(circ(0, 0, plazaR, 96), TIER.plaza, 'cobble', 0xfff1d6);
  // inlays: the plaza's pink dashed ring and the pink dashes along each boulevard
  const pr = w(PLAZA_R - 18), nd = 46; for (let i = 0; i < nd; i++) { const a = (i + 0.5) / nd * TAU; F.quad(Math.cos(a) * pr, Math.sin(a) * pr, 0.1, w(18), a + Math.PI / 2, TIER.plaza + 0.003, 0xf08ab8); }
  for (const d of ZONE_DEG) { const a = d * D2R, r1 = ends[d] !== undefined ? ends[d] : 470; for (let r = PLAZA_R + 14; r < r1 - 40; r += 30) F.quad(w(Math.cos(a) * r), w(Math.sin(a) * r), 0.06, w(12), a, TIER.blvd + 0.004, 0xf4a6c6); }
  const grp = F.build();
  // ---- terrace balustrade: lathe-turned posts with ball finials, a handrail between them, ink-dark base rail
  const b = new kit.Builder({ ao: 0.12 }), R = w(T.r + 96), cxx = w(T.x), czz = w(T.y), lav = 0xd8c8f0, lavD = 0xb8a4dc, step = 5.5 * D2R, pts = [];
  for (let d = T.a0; d <= T.a1 + 0.01; d += 5.5) { const a = d * D2R; pts.push([cxx + Math.cos(a) * R, czz + Math.sin(a) * R, a]); }
  for (const [x, z, a] of pts) { b.cyl(lav, x, TIER.terrace, z, 0.075, 0.07, kit.seg(8), 1.25); b.part(kit.GB.cyl(kit.seg(10), 0.6), lav, x, TIER.terrace + 0.3, z, 0.075, 0.5, 0.075); b.ball(0xfff4ff, x, TIER.terrace + 0.62, z, 0.105); b.ball(lavD, x, TIER.terrace + 0.1, z, 0.09, 0.6); }
  for (let i = 0; i + 1 < pts.length; i++) { const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, l = Math.hypot(x1 - x0, z1 - z0), ang = -Math.atan2(z1 - z0, x1 - x0);
    b.rbox(0xf2e8ff, mx, TIER.terrace + 0.5, mz, l + 0.04, 0.07, 0.11, 0.45, ang); b.rbox(lavD, mx, TIER.terrace + 0.12, mz, l + 0.02, 0.05, 0.08, 0.4, ang);
    for (const f of [0.33, 0.66]) b.part(kit.GB.cyl(kit.seg(8), 0.9), lav, x0 + (x1 - x0) * f, TIER.terrace + 0.3, z0 + (z1 - z0) * f, 0.032, 0.36, 0.032); }
  const bal = b.build({ ao: 0.12 }); bal.name = 'terraceRail'; grp.add(bal);
  return grp;
}
