// CHARACTER HAIR AND HATS. Both are built on headShell(): a conforming shell over the faceted head with a per-angle hairline.
// th = angle from +z (front) toward +x (character left). t = 0 at the hairline, 1 at the crown.
import { C, mix, shade, lite, K, K2, MB, loft, ball, box, tube, lerp, clamp, sstep, mat } from './char_geo.js';
import { HY, HEAD_TOP, HN, HA0, SQ, headP, facePt, ringAt } from './char_body.js';

const absA = (th) => { let a = th % (Math.PI * 2); if (a > Math.PI) a -= Math.PI * 2; if (a < -Math.PI) a += Math.PI * 2; return Math.abs(a); };
const front = (th) => Math.max(0, Math.cos(th));
const kf = (keys, a) => { for (let i = 0; i < keys.length - 1; i++) if (a <= keys[i + 1][0]) { const t = (a - keys[i][0]) / (keys[i + 1][0] - keys[i][0]); return lerp(keys[i][1], keys[i + 1][1], t); } return keys[keys.length - 1][1]; };
const CENTRE = [0, 0.3, -0.01];
const T_TOP = 0.565;

// shell over the head. o: cols, rows, yb(th), thick(th,t), lift(th,t), col(th,t), sk(th,t), apexLift, nh, flat
export function headShell(mb, o) {
  const cols = o.cols || HN, rows = o.rows || 3, a0 = Math.PI / cols, G = [];
  const apexT = (o.thick ? o.thick(0, 1) : 0.03) + (o.apexLift || 0);
  for (let i = 0; i < cols; i++) {
    const th = a0 + (i / cols) * Math.PI * 2, yb = o.yb(absA(th)) + (o.jag ? ((i * 5) % 3 - 1) * o.jag : 0), col = [];
    for (let j = 0; j <= rows; j++) {
      const t = j / rows, y = lerp(yb, T_TOP, t), hang = y < 0.07;
      let p0 = headP(th, hang ? 0.07 : y); if (hang) { p0 = [p0[0] * (o.hangScale || 1), y, p0[2]]; }
      const dx = p0[0] - CENTRE[0], dy = (hang ? 0.07 : y) - CENTRE[1], dz = p0[2] - CENTRE[2], l = Math.hypot(dx, dy, dz) || 1, th2 = o.thick(th, t), lf = o.lift ? o.lift(th, t) : 0;
      const nx = hang ? p0[0] / (Math.hypot(p0[0], p0[2]) || 1) : dx / l, nz = hang ? (p0[2] - ringAt(0.07).cz) / (Math.hypot(p0[0], p0[2] - ringAt(0.07).cz) || 1) : dz / l, ny = hang ? 0 : dy / l;
      col.push([p0[0] + nx * th2, HY + (hang ? y : p0[1]) + ny * th2 + lf, p0[2] + nz * th2]);
    }
    G.push(col);
  }
  const apex = [0, HY + HEAD_TOP + apexT, -0.035], ca = (th, t) => (o.col ? C(o.col(th, t)) : C('#ff00ff')), sa = (th, t) => (o.sk ? o.sk(th, t) : K('head')), nh = !!o.nh;
  for (let i = 0; i < cols; i++) {
    const i2 = (i + 1) % cols, th0 = a0 + (i / cols) * Math.PI * 2, th1 = a0 + ((i + 1) / cols) * Math.PI * 2, thm = (th0 + th1) / 2;
    for (let j = 0; j < rows; j++) {
      const A = G[i][j], B = G[i2][j], Cc = G[i2][j + 1], D = G[i][j + 1], t0 = j / rows, t1 = (j + 1) / rows, hint = [(A[0] + B[0]) / 2, (A[1] + D[1]) / 2 - HY - 0.3, (A[2] + B[2]) / 2 + 0.01];
      const stripe = o.flatHair ? 1 : (i % 2 ? 0.93 : 1.04), c0 = ca(thm, t0).multiplyScalar(stripe), c1 = ca(thm, t1).multiplyScalar(stripe), s0 = sa(thm, t0), s1 = sa(thm, t1);
      mb.triH(A, B, Cc, hint, c0, c0, c1, s0, s0, s1, nh, o.flat); mb.triH(A, Cc, D, hint, c0, c1, c1, s0, s1, s1, nh, o.flat);
    }
    const top0 = G[i][rows], top1 = G[i2][rows], ct = ca(thm, 1), st = sa(thm, 1);
    mb.triH(apex, top0, top1, [0, 1, 0], ct, ct, ct, st, st, st, nh, o.flat);
  }
  return G;
}

// ------------------------------------------------------------------ hairlines
const HL = {
  high: (a) => kf([[0, 0.45], [0.5, 0.44], [1.0, 0.38], [1.5, 0.31], [2.0, 0.27], [2.6, 0.21], [3.15, 0.18]], a),
  fringe: (a) => kf([[0, 0.38], [0.5, 0.385], [1.0, 0.36], [1.5, 0.3], [2.0, 0.26], [2.6, 0.2], [3.15, 0.18]], a),
  faded: (a) => kf([[0, 0.45], [0.5, 0.45], [1.0, 0.41], [1.5, 0.37], [2.0, 0.35], [2.6, 0.32], [3.15, 0.3]], a),
  bob: (a) => kf([[0, 0.39], [0.6, 0.38], [1.0, 0.2], [1.5, 0.0], [2.2, -0.04], [3.15, -0.05]], a),
  long: (a) => kf([[0, 0.4], [0.6, 0.39], [1.0, 0.15], [1.4, -0.12], [2.2, -0.34], [3.15, -0.36]], a),
};

// fringe blades along the front hairline: hair, not a swim cap
function fringe(mb, base, hi, yb, n, len, thick, spread) {
  const K_h = K('head');
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n, th = (t - 0.5) * 2 * spread, y0 = yb(Math.abs(th)) + 0.012, w = spread * 2 / n * 0.5, a = headP(th - w, y0), b = headP(th + w, y0), m = headP(th, y0 - len * (0.7 + 0.5 * ((k * 7) % 3) / 2));
    const out = (p, e) => { const dx = p[0], dz = p[2] - ringAt(p[1]).cz, l = Math.hypot(dx, dz, 0.0001); return [p[0] + dx / l * e, HY + p[1], p[2] + dz / l * e]; };
    const A = out(a, thick), B = out(b, thick), M = out(m, thick + 0.012);
    const c0 = mix(base, hi, 0.2 + 0.4 * ((k * 3) % 2));
    mb.triH(A, B, M, [(A[0] + B[0]) / 2, 0.2, (A[2] + B[2]) / 2], c0, c0, shade(base, 0.8), K_h, K_h, K_h);
  }
}
function partLine(mb, px, col, thick) {
  const K_h = K('head'), ys = [0.44, 0.49, 0.54, 0.57], pts = ys.map((y) => { const r = ringAt(y), th = Math.asin(clamp(px / r.rx, -0.99, 0.99)), p = headP(th, y), dx = p[0], dz = p[2] - r.cz, l = Math.hypot(dx, dz, 0.0001); return [p[0] + dx / l * thick, HY + y + 0.012 * (y - 0.4), p[2] + dz / l * thick]; });
  for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; mb.triH([a[0] - 0.008, a[1], a[2]], [a[0] + 0.008, a[1], a[2]], [b[0] + 0.006, b[1], b[2]], [0, 1, 0.3], col, col, col, K_h, K_h, K_h, true, true); mb.triH([a[0] - 0.008, a[1], a[2]], [b[0] + 0.006, b[1], b[2]], [b[0] - 0.006, b[1], b[2]], [0, 1, 0.3], col, col, col, K_h, K_h, K_h, true, true); }
}
// per-style recipe. returns nothing, adds into mb
export function buildHair(mb, ctx, hatCover) {
  const look = ctx.look, h = look.hair || {}, style = h.style || 'crop', base = C(h.color || '#2a2024'), tip = h.tip ? C(h.tip) : null, sk = ctx.skin;
  if (style === 'bald') return;
  const K_h = K('head'), hi = lite(base, 0.12), lo = shade(base, 0.78), cov = hatCover ? 0.3 : 1;                  // cov: hat sits on top, tame the volume
  const colF = (th, t) => { let c = mix(shade(base, 0.82), hi, sstep(0, 1, t)); if (tip) c = c.lerp(tip, sstep(0.55, 0.0, t) * 0.9); return c; };
  const sk2 = (th, t) => (t < 0.35 ? K2('head', th > 0 && absA(th) < 3 ? (Math.sin(th) > 0 ? 'hairSL' : 'hairSR') : 'hairB', (1 - t / 0.35) * 0.45) : K_h);
  const S = (o) => headShell(mb, Object.assign({ col: colF, sk: sk2, jag: 0.014, clump: 0.012 }, o));
  const fade = (th, t) => mix(sk, base, sstep(0.0, 0.8, t) * 0.92 + 0.0);
  switch (style) {
    case 'buzz': S({ yb: HL.high, rows: 3, thick: () => 0.012, col: (th, t) => mix(mix(sk, base, 0.7), base, t), sk: () => K_h }); break;
    case 'crop': if (!hatCover) fringe(mb, base, hi, HL.fringe, 6, 0.07, 0.05, 0.85); S({ yb: HL.fringe, rows: 3, thick: (th, t) => 0.028 + 0.025 * Math.sin(t * Math.PI * 0.5) * cov + 0.02 * front(th) * t * cov }); break;
    case 'sidepart': if (!hatCover) { fringe(mb, base, hi, HL.fringe, 5, 0.06, 0.06, 0.8); partLine(mb, 0.09, shade(base, 0.5), 0.066); } S({ yb: HL.fringe, rows: 4, thick: (th, t) => (0.03 + 0.03 * Math.sin(t * Math.PI * 0.5) + (th > 0 && th < 1.5 ? 0.035 * t : 0)) * (0.4 + 0.6 * cov) }); break;
    case 'quiff': S({ yb: HL.high, rows: 5, thick: (th, t) => (0.03 + 0.03 * t + 0.05 * Math.pow(front(th), 2) * t * t) * (0.4 + 0.6 * cov), lift: (th, t) => 0.05 * Math.pow(front(th), 2) * t * t * cov, apexLift: 0.0 }); break;
    case 'undercut': S({ yb: (a) => Math.max(HL.high(a), 0.36 + 0.0 * a), rows: 4, thick: (th, t) => (t < 0.35 ? 0.006 : 0.05 + 0.03 * t) * (0.4 + 0.6 * cov), col: (th, t) => (t < 0.3 ? mix(mix(sk, base, 0.5), base, t / 0.3) : colF(th, t)) }); break;
    case 'fade': case 'fadewave': case 'hightop': {
      const tall = style === 'hightop', wave = style === 'fadewave';
      S({ yb: HL.faded, rows: 5, thick: (th, t) => (0.012 + (tall ? 0.085 : 0.045) * sstep(0.25, 0.8, t) + (wave ? 0.01 * Math.sin(t * 19) : 0)) * (0.4 + 0.6 * cov), lift: (th, t) => (tall ? 0.07 : 0) * sstep(0.5, 1, t) * cov, col: (th, t) => (wave ? mix(fade(th, t), shade(base, 0.8 + 0.2 * Math.sin(t * 19 + th * 3) * 0.5 + 0.1), 0.25) : fade(th, t)), sk: () => K_h, apexLift: tall ? 0.07 : 0 }); break;
    }
    case 'waves': if (!hatCover) fringe(mb, base, hi, HL.fringe, 5, 0.05, 0.05, 0.8); S({ yb: HL.fringe, rows: 6, thick: (th, t) => (0.035 + 0.025 * t + 0.006 * Math.sin(t * 22)) * (0.4 + 0.6 * cov), col: (th, t) => mix(colF(th, t), shade(base, 0.75), 0.5 + 0.5 * Math.sin(t * 22 + 1)) }); break;
    case 'curly': {
      S({ yb: HL.fringe, rows: 4, thick: (th, t) => (0.045 + 0.04 * t) * (0.5 + 0.5 * cov) });
      if (!hatCover) for (let i = 0; i < 12; i++) { const th = HA0 + (i / 12) * Math.PI * 2, y = i % 2 ? 0.44 : 0.38, p = headP(th, y), r = 0.075; if (front(th) > 0.7 && y < 0.42) continue; ball(mb, [p[0] * 1.2, HY + y + 0.05, p[2] * 1.2 - 0.0], [r, r * 0.9, r], mix(base, hi, (i % 3) / 4), K_h, { detail: 0, jit: 0.02 }); }
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2, rr = 0.13 * cov; ball(mb, [Math.sin(a) * rr, HY + 0.6, -0.035 + Math.cos(a) * rr], [0.08, 0.07, 0.08], mix(base, hi, i / 6), K_h, { detail: 0, jit: 0.02 }); }
      break;
    }
    case 'afro': {
      S({ cols: 16, yb: (a) => kf([[0, 0.46], [0.6, 0.45], [1.2, 0.3], [2.0, 0.12], [3.15, 0.06]], a), rows: 5, thick: (th, t) => (0.03 + (0.175 - 0.03) * Math.pow(Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.5), 0.7) * (front(th) > 0.5 ? 0.55 + 0.45 * t : 1)) * (hatCover ? 0.55 : 1), sk: (th, t) => K_h, apexLift: 0.03 }); break;
    }
    case 'bob': if (!hatCover) fringe(mb, base, hi, HL.bob, 7, 0.07, 0.065, 0.9); S({ yb: HL.bob, rows: 5, hangScale: 1.04, thick: (th, t) => (0.05 + 0.03 * Math.sin(t * Math.PI * 0.5)) * (t < 0.3 ? 0.9 : 1) * (0.5 + 0.5 * cov) + (t < 0.2 ? 0.03 : 0), sk: (th, t) => (t < 0.6 ? K2('head', Math.abs(Math.sin(th)) > 0.5 ? (Math.sin(th) > 0 ? 'hairSL' : 'hairSR') : 'hairB', (1 - t / 0.6) * 0.8) : K_h) }); break;
    case 'long': if (!hatCover) { fringe(mb, base, hi, HL.long, 7, 0.07, 0.065, 0.9); partLine(mb, 0.0, shade(base, 0.5), 0.064); } S({ yb: HL.long, rows: 7, hangScale: 1.03, thick: (th, t) => (0.05 + 0.025 * Math.sin(t * Math.PI * 0.5) + (t < 0.4 ? 0.025 : 0)) * (0.5 + 0.5 * cov), sk: (th, t) => (t < 0.7 ? K2('head', Math.abs(Math.sin(th)) > 0.6 ? (Math.sin(th) > 0 ? 'hairSL' : 'hairSR') : 'hairB', (1 - t / 0.7) * 0.9) : K_h) }); break;
    case 'mullet': S({ yb: (a) => kf([[0, 0.42], [1.0, 0.36], [1.8, 0.2], [2.6, -0.05], [3.15, -0.12]], a), rows: 5, thick: (th, t) => (0.035 + 0.03 * t) * (0.5 + 0.5 * cov), sk: (th, t) => (t < 0.5 && absA(th) > 1.9 ? K2('head', 'hairB', 1 - t / 0.5) : K_h) }); break;
    case 'ponytail': {
      S({ yb: HL.fringe, rows: 4, thick: (th, t) => (0.03 + 0.025 * t) * (0.5 + 0.5 * cov) });
      tube(mb, [[0, HY + 0.45, -0.25], [0, HY + 0.46, -0.34], [0, HY + 0.33, -0.43], [0, HY + 0.16, -0.43], [0, HY - 0.02, -0.4]], [0.05, 0.065, 0.06, 0.04, 0.012], (t) => colF(0, t < 0.2 ? 0.8 : 0.5 + (tip ? 0 : 0.3) * (1 - t)), { n: 6, sk: (t) => (t < 0.25 ? K('head') : t < 0.6 ? K2('head', 'hairB', 0.6) : K2('hairB', 'hairB2', 1)), tip: 0.03 });
      ball(mb, [0, HY + 0.45, -0.28], [0.04, 0.04, 0.04], ctx.acc2 || '#ff3ea5', K_h, { detail: 0 }); break;
    }
    case 'pigtails': {
      S({ yb: HL.fringe, rows: 4, thick: (th, t) => (0.03 + 0.025 * t) * (0.5 + 0.5 * cov) });
      [1, -1].forEach((s) => tube(mb, [[s * 0.22, HY + 0.44, -0.08], [s * 0.34, HY + 0.4, -0.1], [s * 0.38, HY + 0.24, -0.08], [s * 0.37, HY + 0.08, -0.06]], [0.045, 0.06, 0.055, 0.015], (t) => colF(0, 0.4 + 0.6 * (1 - t)), { n: 6, sk: (t) => K2('head', s > 0 ? 'hairSL' : 'hairSR', clamp(t * 1.3, 0, 1)), tip: 0.03 }));
      break;
    }
    case 'buns': {
      S({ yb: HL.high, rows: 4, thick: (th, t) => (0.022 + 0.02 * t) * (0.6 + 0.4 * cov) }); if (!hatCover) partLine(mb, 0.0, shade(base, 0.5), 0.034);
      [1, -1].forEach((s) => { const r = 0.12, c = [s * 0.15, HY + 0.63, -0.05]; ball(mb, c, [r, r * 0.95, r], base, K(s > 0 ? 'puffL' : 'puffR'), { detail: 1, col2: hi, jit: 0.04 });
        loft(mb, [{ y: HY + 0.59, rx: 0.062, rz: 0.062, cx: s * 0.15, cz: -0.05, c: C(ctx.acc2 || '#ffd23f'), sk: K(s > 0 ? 'puffL' : 'puffR') }, { y: HY + 0.615, rx: 0.07, rz: 0.07, cx: s * 0.15, cz: -0.05, c: C(ctx.acc2 || '#ffd23f'), sk: K(s > 0 ? 'puffL' : 'puffR') }], { n: 6, caps: '' }); });
      break;
    }
    case 'topknot': { S({ yb: HL.faded, rows: 4, thick: (th, t) => (0.012 + 0.045 * sstep(0.3, 0.8, t)) * (0.5 + 0.5 * cov), col: fade, sk: () => K_h }); ball(mb, [0, HY + 0.66, -0.07], [0.085, 0.09, 0.085], base, K_h, { detail: 1, col2: hi, jit: 0.025 }); break; }
    case 'dreadbun': { S({ yb: HL.faded, rows: 4, thick: (th, t) => (0.012 + 0.045 * sstep(0.3, 0.8, t)) * (0.5 + 0.5 * cov), col: fade, sk: () => K_h }); ball(mb, [0, HY + 0.68, -0.08], [0.1, 0.09, 0.1], base, K('puffL'), { detail: 1, col2: hi, jit: 0.04 }); [-0.07, 0.07].forEach((x) => tube(mb, [[x, HY + 0.6, -0.1], [x * 2, HY + 0.55, -0.2]], [0.02, 0.012], base, { n: 4, tip: 0.02, sk: K('head') })); break; }
    case 'braids': case 'locs': case 'twists': {
      const long = style === 'locs', tw = style === 'twists', cnt = tw ? 9 : long ? 11 : 8, len = tw ? 0.17 : long ? 0.34 : 0.3;
      S({ yb: HL.fringe, rows: 3, thick: (th, t) => (0.03 + 0.03 * t) * (0.5 + 0.5 * cov) });
      for (let i = 0; i < cnt; i++) {
        const th = Math.PI * (0.42 + 1.16 * (i + 0.5) / cnt), ang = th, y0 = tw ? 0.36 : 0.32, sideSign = Math.sin(ang) > 0 ? 1 : -1;
        if (tw && Math.cos(ang) > 0.55) continue;
        const p = headP(ang, y0 + (i % 3) * 0.03), r = 1.1, bx = p[0] * r, bz = p[2] * r, ox = Math.sin(ang), oz = Math.cos(ang), dl = len * (0.8 + 0.4 * ((i * 37) % 10) / 10);
        const hb = Math.abs(ox) > 0.55 ? (ox > 0 ? 'hairSL' : 'hairSR') : 'hairB';
        tube(mb, [[bx, HY + p[1], bz], [bx + ox * 0.05, HY + p[1] - dl * 0.5, bz + oz * 0.05], [bx + ox * 0.06, HY + p[1] - dl, bz + oz * 0.06]], tw ? [0.032, 0.03, 0.018] : [0.026, 0.024, 0.014], (t) => (tip ? mix(base, tip, t) : mix(base, hi, 0.2 + 0.25 * ((i % 3) / 2) - t * 0.1)), { n: tw ? 4 : 5, sk: (t) => K2('head', hb, clamp(t * 1.1, 0, 1)), tip: 0.025, a0: i });
        void sideSign;
      }
      if (tw) [1, -1].forEach((s) => [0, 1, 2].forEach((k) => { if (hatCover) return; const a = 0.45 + k * 0.45, p = headP(s * a, 0.5); tube(mb, [[p[0] * 1.02, HY + 0.52 + k * 0.01, p[2]], [p[0] * 1.2, HY + 0.62 + k * 0.01, p[2] * 1.0]], [0.03, 0.016], mix(base, hi, 0.2), { n: 4, tip: 0.02, sk: K_h }); }));
      break;
    }
    case 'cornrows': {
      S({ yb: HL.high, rows: 4, thick: () => 0.016, col: (th, t) => mix(mix(sk, base, 0.8), shade(base, 0.8), 0.3), sk: () => K_h });
      [-0.2, -0.1, 0, 0.1, 0.2].forEach((x, i) => {
        const pts = []; for (let k = 0; k < 7; k++) { const z = 0.2 - k * 0.075; let y = 0.58; for (let yy = 0.58; yy > 0.3; yy -= 0.004) { if (Math.abs(x) <= ringAt(yy).rx * 0.82 && true) { const zz = -0.035 + 0; void zz; } } void y; const rr = ringAt(0.5); const yTop = 0.585 - (Math.abs(x) / 0.3) * 0.2 - (k > 4 ? (k - 4) * 0.06 : 0) - (z > 0.12 ? (z - 0.12) * 0.7 : 0); pts.push([x * (1 + Math.max(0, -z) * 0.2), HY + yTop + 0.012, z]); void rr; }
        tube(mb, pts, 0.017, (t) => mix(base, hi, 0.25 + 0.1 * (i % 2)), { n: 3, sk: K_h, tip: 0.01 });
      });
      [-0.1, 0.1].forEach((x) => tube(mb, [[x, HY + 0.3, -0.25], [x * 1.2, HY + 0.18, -0.28], [x * 1.3, HY + 0.06, -0.26]], [0.026, 0.022, 0.012], base, { n: 4, tip: 0.02, sk: (t) => K2('head', 'hairB', t) }));
      break;
    }
    case 'mohawk': {
      S({ yb: HL.faded, rows: 3, thick: () => 0.006, col: (th, t) => mix(sk, base, 0.35 + 0.2 * t), sk: () => K_h });
      for (let k = 0; k < 8; k++) { const z = 0.2 - k * 0.062, yTop = k < 2 ? 0.54 : k > 6 ? 0.5 : 0.575, ht = 0.16 + 0.04 * Math.sin(k * 1.3), c = [0, HY + yTop + 0.01, z]; const pts = [[-0.045, 0, 0.03], [0.045, 0, 0.03], [0.045, 0, -0.03], [-0.045, 0, -0.03]].map((p) => [c[0] + p[0], c[1] + p[1], c[2] + p[2]]); const tp = [0, c[1] + ht, z - 0.04]; const cl = mix(base, tip || hi, 0.0), ct = tip ? C(tip) : lite(base, 0.2); for (let q = 0; q < 4; q++) mb.triH(tp, pts[q], pts[(q + 1) % 4], [pts[q][0] + pts[(q + 1) % 4][0], 1, pts[q][2] + pts[(q + 1) % 4][2]], ct, cl, cl, K_h, K_h, K_h); }
      break;
    }
    case 'spiky': case 'flame': {
      S({ yb: HL.fringe, rows: 3, thick: (th, t) => 0.03 + 0.015 * t });
      const n = style === 'flame' ? 9 : 11;
      for (let k = 0; k < n; k++) { const th = HA0 + (k / n) * Math.PI * 2 + 0.2, rr = k === 0 ? 0 : 0.2 + (k % 3) * 0.02, y = 0.56 - rr * 0.35, ht = (style === 'flame' ? 0.2 : 0.12) + 0.04 * ((k * 5) % 3), c = k === 0 ? [0, HY + 0.6, -0.035] : [Math.sin(th) * rr, HY + y, -0.035 + Math.cos(th) * rr], lean = style === 'flame' ? [0, 0, -0.03] : [Math.sin(th) * 0.04, 0, Math.cos(th) * 0.04], b = 0.045; const pts = [[-b, 0, -b], [b, 0, -b], [b, 0, b], [-b, 0, b]].map((p) => [c[0] + p[0], c[1] + p[1], c[2] + p[2]]); const tp = [c[0] + lean[0], c[1] + ht, c[2] + lean[2]]; const ct = (tip ? C(tip) : lite(base, 0.25)); for (let q = 0; q < 4; q++) mb.triH(tp, pts[q], pts[(q + 1) % 4], [pts[q][0] + pts[(q + 1) % 4][0] - 2 * c[0], 1, pts[q][2] + pts[(q + 1) % 4][2] - 2 * c[2]], ct, base, base, K_h, K_h, K_h); }
      break;
    }
    default: S({ yb: HL.fringe, rows: 4, thick: (th, t) => 0.03 + 0.025 * t });
  }
}

// ------------------------------------------------------------------ hats
// returns { cover: bool } so hair can tame its volume; hats are built from headShell + plates
export const HAT_COVER = { flatcap: 0.7, ivy: 0.7, fitted: 1, cap: 1, capback: 1, snapback: 1, trucker: 1, beanie: 1, bucket: 1, bucketfur: 1, durag: 1, bandana: 1, beret: 1, fedora: 1, cowboy: 1, tophat: 1, hood: 1, pirate: 1, wizard: 1, chef: 1, visor: 0.5, crown: 0.5, headphonehat: 0.5, catears: 0.5, headband: 0.4, halo: 0, none: 0 };
// curved plate (brim): outer arc points, flat thick slab. pts [[x,y,z]...] centre line near head, extends outward by w along the horizontal outward dir
function plate(mb, ring, outRing, colT, colB, sk) {
  const n = ring.length;
  for (let i = 0; i < n - 1; i++) {
    const a = ring[i], b = ring[i + 1], c = outRing[i + 1], d = outRing[i], hu = [0, 1, 0];
    mb.triH(a, b, c, hu, colT, colT, colT, sk(i), sk(i + 1), sk(i + 1)); mb.triH(a, c, d, hu, colT, colT, colT, sk(i), sk(i + 1), sk(i));
    mb.triH(a, b, c, [0, -1, 0], colB, colB, colB, sk(i), sk(i + 1), sk(i + 1)); mb.triH(a, c, d, [0, -1, 0], colB, colB, colB, sk(i), sk(i + 1), sk(i));
  }
}
function ringPts(y, grow, a0, a1, n, lift) {
  const out = []; for (let i = 0; i <= n; i++) { const th = lerp(a0, a1, i / n), p = headP(th, y), l = Math.hypot(p[0], p[2] - ringAt(y).cz) || 1; out.push([p[0] + (p[0] / l) * grow, HY + y + (lift ? lift(i / n) : 0), p[2] + ((p[2] - ringAt(y).cz) / l) * grow]); }
  return out;
}
function brim(mb, y, g0, g1, a0, a1, droop, colT, colB, skf, n) {
  const inner = ringPts(y, g0, a0, a1, n || 8), outer = ringPts(y, g1, a0, a1, n || 8, (t) => -droop * (1 - Math.abs(t - 0.5) * 0)); plate(mb, inner, outer, colT, colB, skf);
  // edge thickness
  for (let i = 0; i < (n || 8); i++) { const a = outer[i], b = outer[i + 1], th = 0.012; mb.triH(a, b, [b[0], b[1] - th, b[2]], [(a[0] + b[0]) * 0.5, 0, (a[2] + b[2]) * 0.5], colT, colT, colB, skf(i), skf(i + 1), skf(i + 1)); mb.triH(a, [b[0], b[1] - th, b[2]], [a[0], a[1] - th, a[2]], [(a[0] + b[0]) * 0.5, 0, (a[2] + b[2]) * 0.5], colT, colB, colB, skf(i), skf(i + 1), skf(i)); }
}

// cap bill: tongue shaped (longest at the centre), droops toward its tip
function brimTongue(mb, y, g0, w, mid, half, droop, colT, colB, skf, n) {
  const inner = [], outer = [];
  for (let i = 0; i <= n; i++) { const t = i / n, th = mid + (t - 0.5) * 2 * half, p = headP(th, y), cz = ringAt(y).cz, l = Math.hypot(p[0], p[2] - cz) || 1, dx = p[0] / l, dz = (p[2] - cz) / l, wv = w * Math.pow(Math.max(0, Math.cos((t - 0.5) * Math.PI * 0.92)), 0.55);
    inner.push([p[0] + dx * g0, HY + y, p[2] + dz * g0]); outer.push([p[0] + dx * (g0 + wv), HY + y - droop * (wv / w) - 0.0, p[2] + dz * (g0 + wv)]); }
  plate(mb, inner, outer, colT, colB, skf);
  for (let i = 0; i < n; i++) { const a = outer[i], b = outer[i + 1], th = 0.014, hint = [(a[0] + b[0]) * 0.5, 0, (a[2] + b[2]) * 0.5]; mb.triH(a, b, [b[0], b[1] - th, b[2]], hint, colT, colT, colB, skf(i), skf(i + 1), skf(i + 1)); mb.triH(a, [b[0], b[1] - th, b[2]], [a[0], a[1] - th, a[2]], hint, colT, colB, colB, skf(i), skf(i + 1), skf(i)); }
}
export function buildHat(mb, glow, ctx) {
  const look = ctx.look, ht = look.hat || {}, id = ht.id || 'none'; if (id === 'none' || !HAT_COVER[id] && HAT_COVER[id] !== 0) return;
  const col = C(ht.color || '#17141f'), c2 = ht.color2 ? C(ht.color2) : lite(col, 0.18), K_h = K('head'), dark = shade(col, 0.7), accent = C(ht.accent || '#ffd23f');
  const bs = (i) => K_h, vol = ctx.hairVol || 0;      // hairVol: extra crown lift under the hat
  const dome = (yb, thick, rows, extra) => headShell(mb, Object.assign({ flatHair: 0, yb: typeof yb === 'function' ? yb : () => yb, rows: rows || 5, thick: (th, t) => (typeof thick === 'function' ? thick(th, t) : thick) + vol * 0.5 * t, col: (th, t) => mix(shade(col, 0.88), lite(col, 0.06), t), sk: () => K_h, apexLift: 0.0 }, extra || {}));
  const capBill = (a0, a1, w, droop, up) => brimTongue(mb, 0.43, 0.04, w, (a0 + a1) / 2, (a1 - a0) / 2, droop, lite(col, 0.08), shade(col, 0.55), bs, 6);
  switch (id) {
    case 'fitted': case 'cap': case 'snapback': case 'trucker': case 'capback': {
      const back = id === 'capback', yb = (th) => 0.425 - 0.07 * (1 - Math.cos(th)) * 0.5 + (Math.cos(th) > 0.5 ? 0.0 : 0), th = 0.034;
      dome(yb, (a, t) => th + 0.015 * Math.sin(t * Math.PI * 0.6), 4, { col: (a, t) => (id === 'trucker' && Math.cos(a) < -0.1 ? mix('#e8dcc8', c2, 0.3) : id === 'snapback' && Math.cos(a) > 0.6 && t < 0.5 ? c2 : mix(shade(col, 0.86), lite(col, 0.08), t)) });
      // seams + button
      ball(mb, [0, HY + HEAD_TOP + 0.075 + vol * 0.5, -0.035], [0.022, 0.016, 0.022], c2, K_h, { detail: 0 });
      const a0 = back ? Math.PI - 1.05 : -1.05, a1 = back ? Math.PI + 1.05 : 1.05;
      capBill(a0, a1, 0.2, 0.04);
      // front logo diamond (or back when worn backwards) in accent
      const lz = back ? -1 : 1, fz = back ? facePt(0, 0.45).z : facePt(0, 0.45).z; void fz; const ly = HY + 0.5 + vol * 0.2;
      if (id === 'fitted' || id === 'cap' || id === 'capback') { const zf = (back ? -0.0 : 0.0), zz = lz > 0 ? 0.268 : -0.3; const d = [[0, 0.04], [0.026, 0], [0, -0.04], [-0.026, 0]].map(([u, v]) => [u, ly + v, zz + (lz > 0 ? 0.017 - Math.abs(u) * 0.2 : -0.017 + Math.abs(u) * 0.2)]); void zf; mb.poly(d, accent, K_h, [0, 0.25, lz], { nh: true, flat: true }); }
      break;
    }
    case 'flatcap': case 'ivy': {
      headShell(mb, { yb: (a) => 0.405 + 0.03 * Math.cos(a) - 0.04 * (1 - Math.cos(a)) * 0.5, rows: 3, thick: (th, t) => 0.04 + 0.03 * Math.sin(Math.min(1, t * 1.3) * Math.PI * 0.5) + 0.03 * front(th) * t, lift: (th, t) => -0.07 * t * t, col: (th, t, i) => mix(shade(col, 0.82), lite(col, 0.08), t), sk: () => K_h, apexLift: -0.06 });
      brimTongue(mb, 0.425, 0.05, 0.1, 0, 1.0, 0.012, lite(col, 0.06), shade(col, 0.55), bs, 5);
      ball(mb, [0, HY + HEAD_TOP + 0.045, -0.035], [0.012, 0.012, 0.012], c2, K_h, { detail: 0 }); break;
    }
    case 'beanie': {
      dome(0.4, (a, t) => 0.055 + 0.02 * Math.sin(t * 3), 5, {});
      loft(mb, [0.37, 0.43].map((y, i) => ({ y: HY + y, rx: ringAt(y).rx + 0.085, rz: ringAt(y).rz + 0.085, cz: ringAt(y).cz, c: i ? shade(col, 0.95) : shade(col, 0.7), sk: K_h })), { n: 12, a0: HA0, sq: 0.85, caps: '' });
      ball(mb, [0, HY + HEAD_TOP + 0.1 + vol * 0.5, -0.035], [0.05, 0.05, 0.05], c2, K_h, { detail: 1, jit: 0.02 }); break;
    }
    case 'bucket': case 'bucketfur': {
      const bc = id === 'bucketfur' ? lite(col, 0.2) : col;
      dome(0.39, (a, t) => 0.06 + 0.012 * t, 4, { col: (a, t) => mix(shade(bc, 0.86), lite(bc, 0.04), t) });
      brim(mb, 0.4, 0.04, 0.2, 0, Math.PI * 2, 0.05, lite(bc, 0.04), shade(bc, 0.6), bs, 12); break;
    }
    case 'durag': {
      dome((a) => 0.35 + 0.1 * (Math.cos(a) > 0 ? 0.65 : 0.1) * Math.cos(a) * 0 + (Math.cos(a) > 0.2 ? 0.07 : 0), 0.026, 5, { col: (a, t) => mix(shade(col, 0.9), lite(col, 0.1), t) });
      tube(mb, [[0, HY + 0.34, -0.27], [0, HY + 0.28, -0.4], [0, HY + 0.12, -0.46], [0, HY - 0.06, -0.44]], [0.06, 0.07, 0.055, 0.02], (t) => mix(col, shade(col, 0.8), t), { n: 4, flatY: 0.6, sk: (t) => K2('head', 'tail', clamp(t * 1.3, 0, 1)), tip: 0.02 });
      [-1, 1].forEach((s) => tube(mb, [[s * 0.1, HY + 0.34, -0.26], [s * 0.2, HY + 0.28, -0.4]], 0.016, c2, { n: 3, sk: K_h, tip: 0.01 })); break;
    }
    case 'bandana': { dome(0.4, 0.04, 4, {}); tube(mb, [[0.1, HY + 0.4, -0.28], [0.22, HY + 0.3, -0.4], [0.28, HY + 0.2, -0.42]], [0.03, 0.04, 0.012], col, { n: 4, flatY: 0.5, sk: (t) => K2('head', 'tail', t), tip: 0.02 }); break; }
    case 'headband': { loft(mb, [0.4, 0.46].map((y, i) => ({ y: HY + y, rx: ringAt(y).rx + 0.03, rz: ringAt(y).rz + 0.03, cz: ringAt(y).cz, c: col, sk: K_h })), { n: 12, a0: HA0, sq: SQ, caps: '' }); break; }
    case 'beret': { ball(mb, [0.05, HY + 0.56, -0.02], [0.28, 0.1, 0.27], col, K_h, { detail: 1, col2: lite(col, 0.1), jit: 0.015, m: mat([0, 0, 0], [0, 0, -0.12]) }); ball(mb, [0.06, HY + 0.66, -0.02], [0.02, 0.025, 0.02], c2, K_h, { detail: 0 }); break; }
    case 'fedora': case 'cowboy': case 'tophat': {
      const top = id === 'tophat';
      loft(mb, [{ y: HY + 0.42, rx: ringAt(0.42).rx + 0.05, rz: ringAt(0.42).rz + 0.05, cz: ringAt(0.42).cz }, { y: HY + 0.5, rx: 0.25, rz: 0.25, cz: -0.03 }, { y: HY + (top ? 0.9 : 0.68), rx: top ? 0.235 : 0.2, rz: top ? 0.235 : 0.22, cz: -0.03 }].map((r, i) => Object.assign(r, { c: i === 0 ? shade(col, 0.8) : mix(col, lite(col, 0.1), i / 2), sk: K_h })), { n: 10, a0: Math.PI / 10, caps: 't', capCol: lite(col, 0.08) });
      brim(mb, 0.42, 0.03, id === 'cowboy' ? 0.3 : 0.19, 0, Math.PI * 2, id === 'cowboy' ? -0.04 : 0.02, lite(col, 0.03), shade(col, 0.55), bs, 12);
      loft(mb, [0.43, 0.5].map((y) => ({ y: HY + y, rx: 0.262, rz: 0.255, cz: -0.03, c: c2, sk: K_h })), { n: 10, a0: Math.PI / 10, caps: '' }); break;
    }
    case 'crown': { loft(mb, [{ y: HY + 0.5, rx: 0.2, rz: 0.2, cz: -0.03, c: shade('#d4a017', 0.8), sk: K_h }, { y: HY + 0.58, rx: 0.215, rz: 0.215, cz: -0.03, c: '#ffd23f', sk: K_h }], { n: 10, a0: Math.PI / 10 }); for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2, c = [Math.sin(a) * 0.215, HY + 0.58, -0.03 + Math.cos(a) * 0.215], b = 0.05; const bp = [[-b, 0, 0], [b, 0, 0]].map((p) => [c[0] + p[0] * Math.cos(a), c[1], c[2] - p[0] * Math.sin(a)]); const tp = [c[0], c[1] + 0.09, c[2]]; mb.triH(tp, bp[0], bp[1], [Math.sin(a), 0, Math.cos(a)], '#fff2a8'.length ? C('#fff2a8') : col, C('#ffd23f'), C('#ffd23f'), K_h, K_h, K_h); mb.triH(tp, bp[1], bp[0], [-Math.sin(a), 0, -Math.cos(a)], C('#fff2a8'), C('#d4a017'), C('#d4a017'), K_h, K_h, K_h); } break; }
    case 'halo': { tube(mb, Array.from({ length: 12 }, (_, i) => [Math.sin((i / 12) * 6.283) * 0.2, HY + HEAD_TOP + 0.22, -0.035 + Math.cos((i / 12) * 6.283) * 0.2]), 0.016, C('#fff2a8'), { n: 3, closed: true, sk: K_h, nh: true }); break; }
    case 'catears': { loft(mb, [0.43, 0.49].map((y) => ({ y: HY + y, rx: ringAt(y).rx + 0.03, rz: ringAt(y).rz + 0.03, cz: ringAt(y).cz, c: col, sk: K_h })), { n: 12, a0: HA0, caps: '' }); [1, -1].forEach((s) => { const c = [s * 0.16, HY + 0.56, -0.02], b = 0.065; const base = [[-b, 0, -b * 0.5], [b, 0, -b * 0.5], [0, 0, b * 0.7]].map((p) => [c[0] + p[0], c[1] + p[1], c[2] + p[2]]); const tp = [c[0] + s * 0.02, c[1] + 0.13, c[2] - 0.01]; for (let q = 0; q < 3; q++) mb.triH(tp, base[q], base[(q + 1) % 3], [base[q][0] + base[(q + 1) % 3][0] - 2 * c[0], 0.3, base[q][2] + base[(q + 1) % 3][2] - 2 * c[2]], q === 0 ? lite(col, 0.2) : col, col, col, K_h, K_h, K_h); }); break; }
    case 'visor': { loft(mb, [0.4, 0.47].map((y) => ({ y: HY + y, rx: ringAt(y).rx + 0.03, rz: ringAt(y).rz + 0.03, cz: ringAt(y).cz, c: col, sk: K_h })), { n: 12, a0: HA0, caps: '' }); capBill(-1.15, 1.15, 0.17, 0.03); break; }
    case 'headphonehat': { loft(mb, [0.43, 0.49].map((y) => ({ y: HY + y, rx: ringAt(y).rx + 0.03, rz: ringAt(y).rz + 0.03, cz: ringAt(y).cz, c: c2, sk: K_h })), { n: 12, a0: HA0, caps: '' }); [1, -1].forEach((s) => ball(mb, [s * 0.35, HY + 0.26, -0.01], [0.09, 0.11, 0.1], lite(col, 0.1), K_h, { detail: 1, jit: 0.02 })); break; }
    case 'chef': { dome(0.41, 0.04, 3, {}); ball(mb, [0, HY + 0.68, -0.03], [0.24, 0.17, 0.24], lite(col, 0.55), K_h, { detail: 1, jit: 0.03 }); break; }
    case 'wizard': { loft(mb, [{ y: HY + 0.42, rx: 0.3, rz: 0.29, cz: -0.02, c: shade(col, 0.8) }, { y: HY + 0.7, rx: 0.17, rz: 0.17, cz: -0.04, c: col }, { y: HY + 1.0, rx: 0.07, rz: 0.07, cz: -0.12, c: lite(col, 0.1) }].map((r) => Object.assign(r, { sk: K_h })), { n: 8, caps: 't', capTip: [0, HY + 1.15, -0.2] }); brim(mb, 0.42, 0.03, 0.2, 0, Math.PI * 2, 0.0, col, shade(col, 0.6), bs, 12); break; }
    case 'pirate': { dome(0.4, 0.05, 4, {}); brim(mb, 0.4, 0.03, 0.14, -2.6, 2.6, 0.03, lite(col, 0.04), shade(col, 0.6), bs, 8); ball(mb, [0, HY + 0.5, 0.3], [0.04, 0.04, 0.01], '#fff2dc', K_h, { detail: 0 }); break; }
    case 'hood': { headShell(mb, { yb: (a) => (Math.abs(Math.sin(a)) < 0.5 && Math.cos(a) > 0 ? 0.42 : Math.cos(a) > 0 ? 0.3 - 0.0 : -0.04), rows: 6, hangScale: 1.1, thick: (a, t) => 0.065 + 0.03 * t + (Math.cos(a) < 0 && t < 0.7 ? 0.04 : 0) + (Math.cos(a) > 0.2 && Math.cos(a) < 0.9 ? 0 : 0), col: (a, t) => mix(shade(col, 0.82), col, t), sk: (a, t) => (t < 0.5 ? K2('head', 'chest', 0.0) : K_h) }); break; }
    default: break;
  }
}
void box; void MB; void sstep;
