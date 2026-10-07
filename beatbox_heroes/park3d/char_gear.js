// CHARACTER GEAR: glasses and accessories (neck, ears, hand, wrist, back). Face gear hugs the head through facePt().
import { C, mix, shade, lite, K, K2, loft, ball, box, tube, lerp, clamp, mat, INK, CREAM } from './char_geo.js';
import { HY, facePt, headP, ringAt, H } from './char_body.js';
import { bodyR, wearMeta, torsoFront, TOPS } from './char_wear.js';

const proj = (pts, off) => pts.map(([x, y]) => { const f = facePt(x, y); return [x + f.n[0] * off, HY + y + f.n[1] * off, f.z + f.n[2] * off]; });
const ellp = (rx, ry, n, cx, cy, rot, fn) => { const p = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; let u = Math.cos(a) * rx, v = Math.sin(a) * ry; if (fn) { const q = fn(u, v, a); u = q[0]; v = q[1]; } p.push([cx + u, cy + v]); } return p; };
const rrect = (w, h, r, cx, cy) => { const p = []; [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(([sx, sy], q) => { for (let i = 0; i <= 2; i++) { const a = (Math.atan2(sy, sx)) + 0; void a; const t = (q * 90 + i * 45 + 0) * Math.PI / 180; void t; } }); const pts = []; const c = [[1, 1], [-1, 1], [-1, -1], [1, -1]]; const st = [0, 0.5, 1]; c.forEach(([sx, sy], q) => { const a0 = [0, 90, 180, 270][q] * Math.PI / 180; st.forEach((k) => { const a = a0 + k * Math.PI / 2; pts.push([cx + sx * (w - r) + Math.cos(a) * r, cy + sy * (h - r) + Math.sin(a) * r]); }); }); void p; return pts; };
const GL = {
  round: { shape: (cx, cy) => ellp(0.074, 0.072, 12, cx, cy), clear: 1 }, gold_round: { shape: (cx, cy) => ellp(0.074, 0.072, 12, cx, cy), clear: 1, rim: '#d4a017' },
  nerd: { shape: (cx, cy) => rrect(0.078, 0.062, 0.02, cx, cy), clear: 1 },
  shades: { shape: (cx, cy, s) => [[-0.078, 0.055], [0.078, 0.055], [0.076, 0.0], [0.03, -0.055], [-0.03, -0.055], [-0.075, -0.0]].map(([u, v]) => [cx + u, cy + v]), dark: 1 },
  wayfarer: { shape: (cx, cy, s) => [[-0.085, 0.052], [0.08, 0.062], [0.08, 0.0], [0.04, -0.05], [-0.04, -0.05], [-0.085, 0.0]].map(([u, v]) => [cx + u * (s > 0 ? 1 : 1), cy + v]), dark: 1 },
  aviator: { shape: (cx, cy) => ellp(0.078, 0.078, 12, cx, cy, 0, (u, v) => [u, v < 0 ? v * 0.95 : v * 0.8]), dark: 1, rim: '#d4a017' },
  oversized: { shape: (cx, cy) => rrect(0.092, 0.082, 0.03, cx, cy), dark: 1 },
  sport: { shape: (cx, cy) => [[-0.09, 0.05], [0.09, 0.055], [0.085, -0.02], [0.03, -0.055], [-0.05, -0.045], [-0.09, 0.0]].map(([u, v]) => [cx + u, cy + v]), dark: 1, tint: '#ff6b35' },
  heart: { shape: (cx, cy) => { const p = []; for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, x = 16 * Math.pow(Math.sin(a), 3), y = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a); p.push([cx + x * 0.0046, cy + y * 0.0046 + 0.0]); } return p; }, dark: 1, tint: '#ff3ea5' },
  star: { shape: (cx, cy) => { const p = []; for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.04 : 0.088; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return p; }, dark: 1, tint: '#ffd23f' },
  goggles: { shape: (cx, cy) => ellp(0.082, 0.082, 10, cx, cy), dark: 1, rim: '#b98b5e', tint: '#ffb703', thick: 1 },
};
export function buildGlasses(mb, glow, ctx) {
  const g = ctx.look.glasses || {}, id = g.id || 'none'; if (id === 'none') return;
  const col = C(g.color || '#17141f'), K_h = K('head'), ey = 0.275, off = 0.026, FACE = (x, y) => facePt(x, y);
  const strip = (a, b, th, c, o) => { const A = proj([a], o || 0.027)[0], Bp = proj([b], o || 0.027)[0]; tube(mb, [A, Bp], th, c, { n: 3, sk: K_h, nh: true, flat: true }); };
  if (id === 'chromeshield' || id === 'visor_shield') {
    const cols = 8, rows = 3, top = lite(col, 0.45), mid = mix(col, '#7aa8ff', 0.5), bot = mix(col, '#6c5cd6', 0.75), x0 = -0.21, x1 = 0.21, y1 = 0.345, y0 = 0.205;
    const ytop = (x) => y1 - 0.012 * Math.pow(Math.abs(x) / 0.21, 2), ybot = (x) => y0 + 0.035 * Math.pow(Math.abs(x) / 0.21, 2) + (Math.abs(x) < 0.04 ? 0.012 : 0);
    const V = []; for (let i = 0; i <= cols; i++) { const x = lerp(x0, x1, i / cols), col2 = []; for (let r = 0; r <= rows; r++) col2.push([x, lerp(ytop(x), ybot(x), r / rows)]); V.push(col2); }
    const rc = (r) => (r === 0 ? top : r === 1 ? mid : bot);
    for (let r = 0; r < rows; r++) for (let i = 0; i < cols; i++) mb.poly(proj([V[i][r], V[i + 1][r], V[i + 1][r + 1], V[i][r + 1]], off + 0.004), rc(r), K_h, [0, 0, 1], { flat: true, nh: true });
    for (let i = 0; i < cols; i++) { mb.poly(proj([V[i][0], V[i + 1][0], [V[i + 1][0][0], V[i + 1][0][1] + 0.014], [V[i][0][0], V[i][0][1] + 0.014]], off + 0.001), shade(col, 0.55), K_h, [0, 0, 1], { flat: true, nh: true }); }
    [[-0.13, 0.05], [0.04, 0.036]].forEach(([x, w]) => mb.poly(proj([[x, 0.335], [x + w, 0.335], [x + w - 0.05, 0.225], [x - 0.05, 0.225]], off + 0.007), CREAM, K_h, [0, 0, 1], { flat: true, nh: true }));
    [1, -1].forEach((s) => { const a = proj([[s * 0.205, 0.28]], 0.028)[0]; tube(mb, [a, [s * 0.285, HY + 0.28, 0.06], [s * 0.31, HY + 0.27, -0.02]], 0.01, shade(col, 0.55), { n: 3, sk: K_h, nh: true }); });
    return;
  }
  if (id === 'neonbar') { const p = proj([[-0.2, 0.3], [0.2, 0.3], [0.2, 0.25], [-0.2, 0.25]], off + 0.004); glow.poly(p, C(g.color && g.color !== '#17141f' ? g.color : '#2ee6ff').multiplyScalar(1.1), K_h, [0, 0, 1], { flat: true, nh: true }); strip([-0.205, 0.3], [-0.3, 0.27], 0.008, INK); strip([0.205, 0.3], [0.3, 0.27], 0.008, INK); return; }
  if (id === 'vr') { const p = proj([[-0.2, 0.34], [0.2, 0.34], [0.215, 0.2], [-0.215, 0.2]], off + 0.01); mb.poly(p, '#2b2a3f', K_h, [0, 0, 1], { flat: true, nh: true }); glow.poly(proj([[-0.17, 0.3], [0.17, 0.3], [0.17, 0.27], [-0.17, 0.27]], off + 0.014), C('#2ee6ff').multiplyScalar(1.1), K_h, [0, 0, 1], { flat: true, nh: true }); tube(mb, [[-0.3, HY + 0.28, 0.08], [-0.31, HY + 0.28, -0.1], [0, HY + 0.3, -0.31], [0.31, HY + 0.28, -0.1], [0.3, HY + 0.28, 0.08]], 0.014, '#3a3850', { n: 3, sk: K_h, nh: true }); return; }
  if (id === 'eyepatch') { mb.poly(proj(ellp(0.075, 0.065, 9, 0.124, ey, 0), off + 0.003), '#1f1a2a', K_h, [0, 0, 1], { flat: true, nh: true }); tube(mb, [proj([[0.19, 0.31]], 0.02)[0], [0.3, HY + 0.4, 0.0], [0, HY + 0.47, -0.3], [-0.3, HY + 0.4, 0.0], proj([[-0.06, 0.2]], 0.02)[0]], 0.007, '#1f1a2a', { n: 3, sk: K_h, nh: true }); return; }
  if (id === 'monocle') { const c = ellp(0.078, 0.078, 12, -0.124, ey, 0), ci = ellp(0.064, 0.064, 12, -0.124, ey, 0); for (let i = 0; i < 12; i++) mb.poly(proj([c[i], c[(i + 1) % 12], ci[(i + 1) % 12], ci[i]], off), '#d4a017', K_h, [0, 0, 1], { flat: true, nh: true }); tube(mb, [proj([[-0.124, ey - 0.075]], off)[0], [-0.12, HY + 0.1, 0.27], [-0.1, HY - 0.05, 0.2]], 0.004, '#d4a017', { n: 3, sk: K_h, nh: true }); return; }
  const spec = GL[id] || GL.shades;
  [1, -1].forEach((s) => {
    const cx = s * 0.124, shape = spec.shape(cx, ey, s), n = shape.length, ctr = [cx, ey];
    if (spec.clear) {
      const rimC = spec.rim ? C(spec.rim) : col;
      const inner = shape.map(([x, y]) => [ctr[0] + (x - ctr[0]) * 0.8, ctr[1] + (y - ctr[1]) * 0.8]);
      for (let i = 0; i < n; i++) mb.poly(proj([shape[i], shape[(i + 1) % n], inner[(i + 1) % n], inner[i]], off), rimC, K_h, [0, 0, 1], { flat: true, nh: true });
    } else {
      const rimC = spec.rim ? C(spec.rim) : shade(col, 0.55), lensC = spec.tint ? mix(C(spec.tint), INK, 0.35) : mix(col, '#2a2440', 0.55);
      const outer = shape.map(([x, y]) => [ctr[0] + (x - ctr[0]) * 1.12, ctr[1] + (y - ctr[1]) * 1.12]);
      mb.poly(proj(shape, off + 0.004), lensC, K_h, [0, 0, 1], { flat: true, nh: true, centre: lite(lensC, 0.1) });
      for (let i = 0; i < n; i++) mb.poly(proj([outer[i], outer[(i + 1) % n], shape[(i + 1) % n], shape[i]], off + 0.002), rimC, K_h, [0, 0, 1], { flat: true, nh: true });
      // glint streak
      const gl = lite(lensC, 0.5); mb.poly(proj([[cx - 0.04 * s, ey + 0.045], [cx - 0.01 * s, ey + 0.045], [cx - 0.05 * s, ey - 0.02], [cx - 0.075 * s, ey - 0.02]].map(([x, y]) => [x, y]), off + 0.007), gl, K_h, [0, 0, 1], { flat: true, nh: true });
    }
  });
  // bridge + temples
  const bc = spec.rim ? C(spec.rim) : shade(col, 0.6); strip([-0.055, ey + 0.012], [0.055, ey + 0.012], 0.007, bc, off + 0.001);
  [1, -1].forEach((s) => { const a = proj([[s * 0.2, ey + 0.015]], off)[0]; tube(mb, [a, [s * 0.285, HY + 0.285, 0.07], [s * 0.31, HY + 0.265, -0.02]], 0.008, bc, { n: 3, sk: K_h, nh: true }); });
  if (id === 'goggles') tube(mb, [[-0.3, HY + 0.28, 0.08], [-0.31, HY + 0.28, -0.1], [0, HY + 0.3, -0.31], [0.31, HY + 0.28, -0.1], [0.3, HY + 0.28, 0.08]], 0.02, '#6b4a2a', { n: 4, sk: K_h, nh: true });
}

// ------------------------------------------------------------------ boombox (also used by the NPC prop). c = centre, rot = euler, s = scale
export function boombox(mb, glow, c, rot, sc, sk, colour) {
  sc = sc || 1; const M = mat(c, rot), P = (x, y, z) => { const v = [x * sc, y * sc, z * sc]; const m = M.elements; return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]]; };
  const body = C(colour || '#c0392b'), dark = C('#2b2a3f'), sil = C('#c9d3e6');
  box(mb, c, [0.34 * sc, 0.2 * sc, 0.1 * sc], body, sk, { rot, nh: false });
  [-1, 1].forEach((s) => { const ctr = P(s * 0.1, -0.015, 0.052); const ring = [], ring2 = []; for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; ring.push(P(s * 0.1 + Math.cos(a) * 0.058, -0.015 + Math.sin(a) * 0.058, 0.052)); ring2.push(P(s * 0.1 + Math.cos(a) * 0.04, -0.015 + Math.sin(a) * 0.04, 0.056)); }
    const hint = new (mat.constructor === Function ? Object : Object)(); void hint; const nrm = [M.elements[8], M.elements[9], M.elements[10]];
    for (let i = 0; i < 8; i++) { mb.triH(ctr, ring[i], ring[(i + 1) % 8], nrm, dark, sil, sil, sk, sk, sk, true); mb.triH(ring[i], ring2[i], ring2[(i + 1) % 8], nrm, sil, shade(sil, 0.7), shade(sil, 0.7), sk, sk, sk, true); }
    for (let i = 0; i < 8; i++) mb.triH(P(s * 0.1, -0.015, 0.058), ring2[i], ring2[(i + 1) % 8], nrm, shade(dark, 0.9), dark, dark, sk, sk, sk, true); });
  mb.poly([P(-0.045, 0.06, 0.051), P(0.045, 0.06, 0.051), P(0.045, 0.085, 0.051), P(-0.045, 0.085, 0.051)], '#e8c36a', sk, [M.elements[8], M.elements[9], M.elements[10]], { flat: true, nh: true });
  tube(mb, [P(-0.12, 0.1, 0), P(-0.08, 0.15, 0), P(0.08, 0.15, 0), P(0.12, 0.1, 0)], 0.01, sil, { n: 4, sk, nh: true });
  if (glow) glow.poly([P(0.12, 0.062, 0.051), P(0.15, 0.062, 0.051), P(0.15, 0.08, 0.051), P(0.12, 0.08, 0.051)], C('#9dff4a').multiplyScalar(1.1), sk, [M.elements[8], M.elements[9], M.elements[10]], { flat: true, nh: true });
}

// ------------------------------------------------------------------ accessories
export function buildAccessories(mb, glow, ctx, api) {
  const acc = ctx.look.acc || {}, d = ctx.d, look = ctx.look, W = ctx.rest, hat = look.hat && look.hat.id, K_h = K('head');
  const A = (slot) => { const a = acc[slot]; return a && a.id && a.id.indexOf('none') !== 0 ? a : null; };
  // ---- neck
  const nk = A('neck');
  if (nk) {
    const cc = C(nk.color || '#d4a017'), id = nk.id, zf = (y) => torsoFront(look, d, y) + 0.014;
    const vpath = (top, bot, xs, thick) => { const pts = []; const N = 9; for (let i = 0; i <= N; i++) { const t = i / N, y = lerp(top, bot, t); pts.push([-xs * (1 - t) * (1 - t * 0.0), y, zf(y)]); } for (let i = N - 1; i >= 0; i--) { const t = i / N, y = lerp(top, bot, t); pts.push([xs * (1 - t), y, zf(y)]); } return pts; };
    if (id === 'chain' || id === 'cubanchain' || id === 'dogtags' || id === 'medal' || id === 'lanyard') {
      const bot = id === 'chain' ? 0.76 : id === 'cubanchain' ? 0.72 : id === 'lanyard' ? 0.66 : 0.74, xs = 0.095, pts = [], N = 7;
      for (let i = 0; i <= N; i++) { const t = i / N, y = lerp(0.905, bot, t), x = -lerp(xs, 0.0, Math.pow(t, 0.9)); pts.push([x, y, lerp(0.0, 1, Math.min(1, t * 2.0)) * (zf(y) - 0.0) + (1 - Math.min(1, t * 2)) * 0.075]); }
      const back = [[0.0, 0.905, -0.075]]; const right = []; for (let i = N; i >= 0; i--) { const q = pts[i]; right.push([-q[0], q[1], q[2]]); }
      const loop = [back[0]].concat(pts.map((p) => p), right); loop.pop();
      const thick = id === 'cubanchain' ? 0.013 : id === 'lanyard' ? 0.016 : 0.0075;
      const full = [[0, 0.905, -0.07]].concat(pts.slice(0, -1), [[0, bot, zf(bot)]], right.slice().reverse().slice(1).reverse());
      void loop; void full;
      const ring = []; ring.push([0, 0.905, -0.075]); for (let i = 0; i <= N; i++) ring.push(pts[i]); for (let i = N - 1; i >= 0; i--) ring.push([-pts[i][0], pts[i][1], pts[i][2]]);
      tube(mb, ring, thick, (t) => (id === 'lanyard' ? C(nk.color || '#e63946') : t > 0.2 && t < 0.8 ? lite(cc, 0.15) : cc), { n: 3, closed: true, sk: (t) => (t > 0.18 && t < 0.82 ? K2('chest', 'chain', clamp((0.5 - Math.abs(t - 0.5)) * 2.4 * 0.0 + 0.0, 0, 1)) : K('chest')), flatY: id === 'lanyard' ? 0.3 : 1 });
      const by = bot - 0.005, bz = zf(bot) + 0.004, ck = K('chain');
      if (id === 'dogtags') { box(mb, [-0.012, by - 0.045, bz + 0.004], [0.042, 0.06, 0.006], '#c9d3e6', ck, { rot: [0, 0, 0.12] }); box(mb, [0.014, by - 0.06, bz + 0.0], [0.042, 0.06, 0.006], '#aeb8cc', ck, { rot: [0, 0, -0.1] }); }
      if (id === 'medal') { ball(mb, [0, by - 0.035, bz + 0.012], [0.05, 0.05, 0.012], '#ffd23f', ck, { detail: 1 }); }
      if (id === 'lanyard') box(mb, [0, by - 0.06, bz + 0.002], [0.07, 0.09, 0.006], '#f2e6d0', ck);
      if (id === 'cubanchain') ball(mb, [0, by - 0.02, bz + 0.004], [0.022, 0.022, 0.012], '#ffd23f', ck, { detail: 0 });
    }
    if (id === 'scarf') { loft(mb, [{ y: 0.86, rx: 0.14, rz: 0.13, cz: 0.0, c: shade(cc, 0.8), sk: K('chest') }, { y: 0.92, rx: 0.13, rz: 0.12, cz: 0.0, c: cc, sk: K2('chest', 'neck', 0.6) }, { y: 0.97, rx: 0.115, rz: 0.11, cz: 0, c: lite(cc, 0.1), sk: K('neck') }], { n: 8, caps: '' }); box(mb, [0.07, 0.72, zf(0.76) - 0.02], [0.07, 0.24, 0.025], mix(cc, '#ffffff', 0.15), K('chain')); }
    if (id === 'bowtie') { const z = zf(0.88) + 0.005, y = 0.88; mb.poly([[0, y, z], [0.07, y + 0.035, z], [0.07, y - 0.035, z]], cc, K('chest'), [0, 0, 1], { nh: true, flat: true }); mb.poly([[0, y, z], [-0.07, y + 0.035, z], [-0.07, y - 0.035, z]], cc, K('chest'), [0, 0, 1], { nh: true, flat: true }); ball(mb, [0, y, z + 0.005], [0.016, 0.02, 0.012], shade(cc, 0.7), K('chest'), { detail: 0 }); }
    if (id === 'hpneck') { tube(mb, [[-0.1, 0.9, 0.06], [-0.125, 0.92, -0.06], [0, 0.93, -0.12], [0.125, 0.92, -0.06], [0.1, 0.9, 0.06]], 0.016, '#3a3850', { n: 4, sk: K('chest') }); [-1, 1].forEach((s) => ball(mb, [s * 0.1, 0.83, zf(0.83) + 0.0], [0.05, 0.06, 0.03], cc, K('chest'), { detail: 0 })); }
  }
  // ---- ears
  const er = A('ears');
  if (er) {
    const cc = C(er.color || '#d4a017'), id = er.id;
    [1, -1].forEach((s) => {
      const lobe = H(s * 0.305, 0.205, -0.012), hb = K(s > 0 ? 'hairSL' : 'hairSR');
      if (id === 'studs' || id === 'iced') ball(mb, [lobe[0] + s * 0.012, lobe[1] - 0.005, lobe[2] + 0.012], [0.014, 0.014, 0.014], id === 'iced' ? '#e8f4ff' : cc, K_h, { detail: 0, nh: true });
      if (id === 'hoops') { const pts = []; for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; pts.push([lobe[0] + s * 0.014, lobe[1] - 0.05 + Math.cos(a) * 0.048, lobe[2] + 0.01 + Math.sin(a) * 0.048]); } tube(mb, pts, 0.0085, cc, { n: 3, closed: true, sk: hb, nh: true }); }
      if (id === 'dangles') { tube(mb, [[lobe[0] + s * 0.014, lobe[1], lobe[2] + 0.01], [lobe[0] + s * 0.016, lobe[1] - 0.05, lobe[2] + 0.012]], 0.004, cc, { n: 3, sk: hb, nh: true }); ball(mb, [lobe[0] + s * 0.016, lobe[1] - 0.07, lobe[2] + 0.012], [0.022, 0.022, 0.01], '#ffd23f', hb, { detail: 0, nh: true }); }
      if (id === 'hpears') ball(mb, [s * 0.335, HY + 0.255, -0.01], [0.055, 0.09, 0.09], cc, K_h, { detail: 0 });
    });
    if (id === 'hpears') tube(mb, Array.from({ length: 9 }, (_, i) => { const a = (i / 8) * Math.PI, x = -Math.cos(a) * 0.335, y = 0.255 + Math.sin(a) * 0.4; return [x, HY + y, -0.02]; }), 0.018, shade(cc, 0.8), { n: 4, sk: K_h });
  }
  // ---- wrist (watch on the left)
  const wr = A('wrist');
  if (wr) {
    const cc = C(wr.color || '#2ee6ff'), id = wr.id, s = 1, wy = W.wrL[1], x = s * d.shX, sk = K('wrL');
    const ring = (y, h, r, c) => loft(mb, [{ y: y + h / 2, rx: r, rz: r, cx: x, c, sk: K('wrL') }, { y: y - h / 2, rx: r, rz: r, cx: x, c, sk: K('wrL') }], { n: 8, caps: '' });
    if (id === 'watch' || id === 'icedwatch') { ring(wy + 0.03, 0.035, 0.05, '#3a3850'); const ice = id === 'icedwatch'; box(mb, [x + 0.045, wy + 0.03, 0.0], [0.016, 0.045, 0.045], ice ? '#e8f4ff' : '#d4a017', sk); if (ice) { glow.poly([[x + 0.055, wy + 0.045, -0.015], [x + 0.055, wy + 0.045, 0.01], [x + 0.055, wy + 0.04, 0.0]], C('#ffffff').multiplyScalar(0.95), sk, [1, 0, 0], { flat: true, nh: true }); } }
    if (id === 'wristband') ring(wy + 0.04, 0.05, 0.052, cc);
    if (id === 'bracelets') { ring(wy + 0.025, 0.014, 0.05, '#d4a017'); ring(wy + 0.05, 0.014, 0.052, '#c9d3e6'); }
    if (id === 'stackedbands') [0.02, 0.045, 0.07].forEach((o, i) => ring(wy + o, 0.02, 0.05 + i * 0.002, ['#ff3ea5', '#2ee6ff', '#ffd23f'][i]));
  }
  // ---- hand: mic or boombox in the right hand
  const hd = A('hand');
  if (hd) {
    const id = hd.id, s = -1, x = s * d.shX, wy = W.wrR[1], sk = K('wrR'), cc = C(hd.color && id !== 'mic' ? hd.color : '#6b6b80');
    if (/mic/.test(id)) {
      const gold = id === 'goldmic' ? C('#e8b923') : null, neon = id === 'neonmic';
      const head = neon ? mix('#2b2a3f', '#2ee6ff', 0.2) : gold || C('#5a566e'), handle = gold ? shade(gold, 0.75) : C('#3a3850'), hy = wy - 0.215;
      loft(mb, [{ y: wy - 0.05, rx: 0.02, rz: 0.02, cx: x, c: shade(handle, 0.8), sk }, { y: wy - 0.16, rx: 0.024, rz: 0.024, cx: x, c: handle, sk }, { y: hy + 0.05, rx: 0.03, rz: 0.03, cx: x, c: lite(handle, 0.1), sk }], { n: 6, caps: 'b' });
      ball(mb, [x, hy, 0], [0.047, 0.05, 0.047], head, sk, { detail: 1, col2: lite(head, 0.15) });
      if (neon) glow.poly([[x - 0.03, hy + 0.02, 0.04], [x + 0.03, hy + 0.02, 0.04], [x + 0.03, hy - 0.01, 0.045], [x - 0.03, hy - 0.01, 0.045]], C('#2ee6ff').multiplyScalar(1.1), sk, [0, 0, 1], { flat: true, nh: true });
      else loft(mb, [{ y: hy + 0.012, rx: 0.049, rz: 0.049, cx: x, c: lite(handle, 0.35), sk }, { y: hy - 0.008, rx: 0.049, rz: 0.049, cx: x, c: lite(handle, 0.35), sk }], { n: 6, caps: '', nh: true });
    }
    if (id === 'boombox') boombox(mb, glow, [x - 0.02, wy - 0.28, 0.0], [0, Math.PI / 2, 0], 0.9, sk, hd.color || '#c0392b');
  }
  // ---- back
  const bk = A('back');
  if (bk) {
    const cc = C(bk.color || '#6b6b80'), id = bk.id, sk = K('chest');
    if (id === 'backpack') { box(mb, [0, 0.72, -0.185], [0.26, 0.3, 0.13], cc, sk, { taper: 0.92 }); box(mb, [0, 0.66, -0.26], [0.2, 0.12, 0.03], shade(cc, 0.8), sk); [1, -1].forEach((s) => tube(mb, [[s * 0.09, 0.86, -0.06], [s * 0.1, 0.86, 0.04], [s * 0.1, 0.7, 0.1], [s * 0.1, 0.58, 0.0], [s * 0.09, 0.6, -0.1]], 0.014, shade(cc, 0.7), { n: 3, sk, nh: true })); }
    if (id === 'cape') { const c2 = cc; loft(mb, [0.88, 0.7, 0.55, 0.38].map((y, i) => ({ y, rx: 0.17 + i * 0.045, rz: 0.03, cz: -0.15 - i * 0.03, c: mix(c2, shade(c2, 0.7), i / 3), sk: i < 1 ? K('chest') : K2('chest', 'cape', clamp(i / 2, 0, 1)) })), { n: 8, caps: '', a0: 0 }); }
    if (id === 'wings') [1, -1].forEach((s) => { const p = (x, y, z) => [s * x, y, z]; const col = C('#ff3ea5').multiplyScalar(1.05), col2 = C('#2ee6ff').multiplyScalar(1.05); glow.triH(p(0.08, 0.8, -0.14), p(0.5, 1.1, -0.2), p(0.35, 0.8, -0.2), [0, 0, -1], col, col2, col, sk, sk, sk, true, true); glow.triH(p(0.08, 0.78, -0.14), p(0.35, 0.8, -0.2), p(0.4, 0.55, -0.2), [0, 0, -1], col, col2, col2, sk, sk, sk, true, true); });
    if (id === 'guitar') { ball(mb, [0.05, 0.62, -0.2], [0.16, 0.2, 0.06], '#b5573f', sk, { detail: 1, rot: [0, 0, 0.5] }); box(mb, [0.18, 0.95, -0.2], [0.04, 0.4, 0.03], '#7a5238', sk, { rot: [0, 0, 0.5] }); }
    if (id === 'crossbody') { tube(mb, [[0.14, 0.88, -0.02], [0.0, 0.7, 0.16], [-0.14, 0.5, 0.1], [-0.24, 0.45, -0.02]], 0.014, shade(cc, 0.8), { n: 3, sk, nh: true }); box(mb, [-0.24, 0.42, 0.0], [0.07, 0.15, 0.2], cc, K('hips')); }
  }
}
void TOPS; void wearMeta; void bodyR; void clamp; void CREAM; void ringAt; void headP;
