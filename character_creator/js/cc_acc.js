// Character Studio accessories: headwear (24), neckwear (11), back items (10), wrists and gloves. Headwear is drawn in head space for the
// default head (K.TT reshapes it with the skull); neckwear and back items are in the torso's rest space.
//   CC.headwear(K) -> {cover: 'full'|'part'|'none', front(g,S), back(g,S)}   cover says how much of the hair a hat hides
//   CC.neckwear(K) -> fn(g,S) | null           CC.backItem(K) -> fn(g,S) | null           CC.wristInfo(K) -> {cuff, glove}
(function () {
  'use strict';
  const CC = window.CC, RJ = ART.rj, tk = ART.tk, C = RJ.C, LINE = RJ.LINE;
  const { clamp, lerp, TAU } = CC.u, col = CC.col;
  const PI = Math.PI;

  const cel = (g, pts, base, o) => RJ.cel(g, pts, base, Object.assign({ shadow: col.shade(base), line: LINE.main, depth: 5, hi: col.tint(base, 0.32), hiW: 1.5, hiAlpha: 0.7, tension: 0.7, weightVar: 0.35 }, o));
  // a thick strip along a spine (a band, a brim, a strap)
  const band = (g, K, spine, w, base, o) => cel(g, K.TT(CC.strip(spine, w, w, 0)), base, Object.assign({ depth: 3, tension: 0.6 }, o));
  const dome = (d, n) => CC.ring(d).slice(0, n || 8);
  const HEAD_BAND = [[-62, 2], [-58, -22], [-42, -42], [-18, -54], [8, -58], [32, -54], [50, -42], [58, -26], [60, -10]];
  const flower = (g, x, y, r, c1, c2) => {
    for (let i = 0; i < 5; i++) { const a = -PI / 2 + (i / 5) * TAU; RJ.cel(g, tk.ellipsePts(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.55, r * 0.42, 10, a), c1, { shadow: col.shade(c1), line: LINE.fine + 0.2, depth: 1.2, tension: 0.9 }); }
    RJ.cel(g, tk.circlePts(x, y, r * 0.3, 8), c2, { shadow: col.shade(c2), line: LINE.fine, depth: 1 });
  };
  const star = (g, x, y, r, c, rot) => { const p = []; for (let i = 0; i < 10; i++) { const a = -PI / 2 + (rot || 0) + i * PI / 5, rr = i % 2 ? r * 0.45 : r; p.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr, 1]); } RJ.cel(g, p, c, { shadow: col.shade(c), line: LINE.mid, depth: 1.5, tension: 0 }); };
  const heart = (g, x, y, r, c) => RJ.cel(g, [[x, y + r * 0.95, 1], [x - r * 1.2, y - r * 0.1], [x - r * 0.6, y - r * 0.9], [x, y - r * 0.4], [x + r * 0.6, y - r * 0.9], [x + r * 1.2, y - r * 0.1]], c, { shadow: col.shade(c), line: LINE.mid, depth: 2, hi: col.tint(c, 0.4), hiW: 1 });

  // ---- hats ----
  CC.headwear = function (K) {
    const c = K.c, c1 = c.hwC1, c2 = c.hwC2, T = K.TT, st = c.headwear;
    const D = {};
    D.none = () => null;
    D.beanie = () => ({ cover: 'full', front(g) {
      const lower = [[-62, 6], [-52, -8], [-32, -19], [-6, -25], [20, -25], [42, -21], [57, -13]];
      cel(g, T(dome(16, 8).concat(lower)), c1, { depth: 8, tension: 0.8, decor: (gg) => { for (let i = -40; i < 70; i += 9) RJ.ink(gg, T([[i * 0.9 - 14, -100], [i * 0.5 - 6, -26]]), { w: 1, color: col.shade(c1, 0.18), taper: 0.4, wobble: 0, alpha: 0.7 }); } });
      cel(g, T(lower.concat(lower.slice().reverse().map((p) => [p[0] + 1, p[1] - 14]))), c2, { depth: 3, tension: 0.7, decor: (gg) => { for (let i = 0; i < 12; i++) { const p = CC.along(lower, i / 11); RJ.ink(gg, T([[p[0], p[1]], [p[0] + 1, p[1] - 14]]), { w: 1, color: col.shade(c2, 0.2), taper: 0, wobble: 0, alpha: 0.6 }); } } });
      const tp = K.T([4, -90]); RJ.cel(g, tk.circlePts(tp[0], tp[1], 11, 12), c2, { shadow: col.shade(c2), line: LINE.main, depth: 3, hi: col.tint(c2, 0.4), hiW: 1.4 });
    } });
    const capBase = (g, back) => {
      const lower = [[-60, 0], [-50, -14], [-30, -26], [-4, -30], [22, -29], [44, -25], [58, -16]];
      cel(g, T(dome(14, 8).concat(lower)), c1, { depth: 7, tension: 0.8, decor: (gg) => { RJ.ink(gg, T([[2, -86], [-6, -50], [0, -30]]), { w: 1.3, color: col.shade(c1, 0.22), taper: 0.4, wobble: 0 }); RJ.ink(gg, T([[24, -82], [32, -50], [34, -30]]), { w: 1.3, color: col.shade(c1, 0.22), taper: 0.4, wobble: 0 }); RJ.ink(gg, T([[-30, -76], [-40, -50], [-42, -26]]), { w: 1.3, color: col.shade(c1, 0.22), taper: 0.4, wobble: 0 }); } });
      RJ.cel(g, K.T([4, -82]).concat([]) && tk.circlePts(K.T([4, -82])[0], K.T([4, -82])[1], 3.6, 8), c2, { shadow: col.shade(c2), line: LINE.mid, depth: 1 });
      return lower;
    };
    D.cap = () => ({ cover: 'part', front(g) {
      capBase(g);
      cel(g, T([[34, -28], [66, -32], [88, -24], [90, -16], [64, -17], [30, -21]]), c2, { depth: 3, tension: 0.5 });
    } });
    D.capback = () => ({ cover: 'part', front(g) {
      capBase(g);
      cel(g, T([[-40, -24], [-68, -32], [-90, -26], [-92, -18], [-66, -17], [-38, -18]]), c2, { depth: 3, tension: 0.5 });
      RJ.ink(g, T([[50, -22], [44, -34], [34, -44]]), { w: 3, color: c2, taper: 0, wobble: 0, pressure: 'flat' });
    } });
    D.bucket = () => ({ cover: 'full', front(g) {
      const lower = [[-58, -10], [-46, -26], [-24, -33], [4, -35], [30, -33], [48, -26], [58, -14]];
      cel(g, T(dome(12, 8).concat(lower)), c1, { depth: 7, tension: 0.8 });
      cel(g, T([[-78, -12], [-54, -32], [-4, -38], [46, -32], [84, -14], [72, -4], [30, -14], [-4, -16], [-34, -14], [-72, -4]]), col.shade(c1, -0.03), { depth: 4, tension: 0.6, decor: (gg) => { RJ.ink(gg, T([[-60, -26], [-4, -32], [50, -26]]), { w: 3, color: c2, taper: 0, wobble: 0, pressure: 'flat' }); } });
    } });
    D.beret = () => ({ cover: 'part', front(g) {
      const e = tk.ellipsePts(8, -62, 58, 24, 18, -0.12).map((p) => p);
      cel(g, T(e), c1, { depth: 7, tension: 0.9, decor: (gg) => { RJ.ink(gg, T([[-30, -66], [0, -72], [40, -70]]), { w: 1.2, color: col.shade(c1, 0.2), taper: 0.4, wobble: 0 }); } });
      cel(g, T([[8, -90], [12, -92], [14, -86], [9, -84]]), c1, { depth: 1, tension: 0.4 });
    } });
    D.headband = () => ({ cover: 'none', front(g) { band(g, K, HEAD_BAND, 9, c1, { decor: (gg) => { RJ.ink(gg, T(HEAD_BAND.map((p) => [p[0], p[1] - 2.6])), { w: 1.6, color: c2, taper: 0, wobble: 0 }); RJ.ink(gg, T(HEAD_BAND.map((p) => [p[0], p[1] + 2.6])), { w: 1.6, color: c2, taper: 0, wobble: 0 }); } }); } });
    D.bow = () => ({ cover: 'none', front(g) {
      g.save(); const p = K.T([24, -78]); g.translate(p[0], p[1]); g.rotate(0.35);
      [1, -1].forEach((s) => cel(g, [[0, 0, 1], [s * 22, -17], [s * 30, -3], [s * 24, 16]], c1, { depth: 4, tension: 0.7, hi: col.tint(c1, 0.4) }));
      cel(g, tk.circlePts(0, 0, 6.5, 10), c2, { depth: 2, tension: 0.9 });
      g.restore();
    } });
    D.flowers = () => ({ cover: 'none', front(g) {
      band(g, K, HEAD_BAND.map((p) => [p[0], p[1] - 1]), 4, '#4f9a4a', { depth: 1, tension: 0.6 });
      for (let i = 0; i < 8; i++) { const p = K.T(CC.along(HEAD_BAND, 0.04 + i * 0.13)); flower(g, p[0], p[1] - 2, 9.5 - (i % 2) * 1.5, i % 2 ? c2 : c1, i % 2 ? c1 : c2); }
    } });
    D.catears = () => ({ cover: 'none', front(g) {
      band(g, K, HEAD_BAND, 5, c1, { depth: 2 });
      [[-38, -66, -0.3], [36, -64, 0.3]].forEach((e) => { const p = K.T([e[0], e[1]]); g.save(); g.translate(p[0], p[1]); g.rotate(e[2]); cel(g, [[-14, 6, 1], [-2, -34, 1], [16, 6, 1]], c1, { depth: 4, tension: 0.2 }); cel(g, [[-7, 4, 1], [-1, -22, 1], [9, 4, 1]], c2, { shadow: false, line: false, tension: 0.2 }); g.restore(); });
    } });
    D.bunny = () => ({ cover: 'none', front(g) {
      band(g, K, HEAD_BAND, 5, c1, { depth: 2 });
      [[-30, -84, -0.25, 1], [30, -82, 0.2, 0.92]].forEach((e) => { const p = K.T([e[0], e[1]]); g.save(); g.translate(p[0], p[1]); g.rotate(e[2]); g.scale(e[3], e[3]); cel(g, tk.ellipsePts(0, -22, 10, 34, 16, 0), c1, { depth: 4, tension: 0.9 }); cel(g, tk.ellipsePts(0, -20, 5, 26, 14, 0), c2, { shadow: false, line: false, tension: 0.9 }); g.restore(); });
    } });
    D.horns = () => ({ cover: 'none', front(g) {
      [[-34, -64, -0.4, 1], [40, -62, 0.4, 0.9]].forEach((e) => { const p = K.T([e[0], e[1]]); g.save(); g.translate(p[0], p[1]); g.rotate(e[2]); g.scale(e[3], e[3]); cel(g, [[-8, 3], [-7, -12], [-1, -26], [10, -34, 1], [6, -18], [8, 3]], c1, { depth: 3, tension: 0.8 }); g.restore(); });
    } });
    D.halo = () => ({ cover: 'none', back: null, front(g) {
      const p = K.T([6, -104]); g.save(); g.translate(p[0], p[1]); g.rotate(-0.08);
      g.lineWidth = 8.2; g.strokeStyle = C.ink; g.beginPath(); g.ellipse(0, 0, 36, 10, 0, 0, TAU); g.stroke();
      g.lineWidth = 5; g.strokeStyle = c1; g.beginPath(); g.ellipse(0, 0, 36, 10, 0, 0, TAU); g.stroke();
      g.lineWidth = 1.6; g.strokeStyle = col.tint(c1, 0.6); g.beginPath(); g.ellipse(0, 0, 36, 10, 0, 3.4, 4.8); g.stroke();
      g.restore();
    } });
    D.crown = () => ({ cover: 'none', front(g) {
      const pts = [[-38, -52], [-40, -90, 1], [-24, -72], [-8, -98, 1], [8, -72], [24, -96, 1], [38, -68], [50, -86, 1], [52, -50]];
      cel(g, T(pts), c1, { depth: 5, tension: 0.2 });
      band(g, K, [[-40, -54], [4, -60], [52, -52]], 9, col.shade(c1, 0.04), { depth: 2, tension: 0.3 });
      [[-24, -60, c2], [4, -64, '#ff7eb6'], [32, -60, c2]].forEach((m) => { const p = K.T([m[0], m[1]]); RJ.cel(g, tk.circlePts(p[0], p[1], 4.2, 8), m[2], { shadow: col.shade(m[2]), line: LINE.fine + 0.2, depth: 1 }); });
    } });
    D.tiara = () => ({ cover: 'none', front(g) {
      const arc = [[-34, -50], [-18, -66], [4, -70], [26, -66], [44, -52]];
      band(g, K, arc, 5, c1, { depth: 1.5 });
      const p = K.T([4, -72]); star(g, p[0], p[1] - 8, 10, c1, 0); RJ.cel(g, tk.circlePts(p[0], p[1] - 8, 3.4, 8), c2, { shadow: col.shade(c2), line: LINE.fine, depth: 1 });
      [-20, 28].forEach((x) => { const q = K.T([x, CC.along(arc, x < 0 ? 0.25 : 0.75)[1] - 4]); RJ.cel(g, tk.circlePts(x * K.sw, q[1], 3, 8), c2, { shadow: col.shade(c2), line: LINE.fine, depth: 1 }); });
    } });
    D.wizard = () => ({ cover: 'full', front(g, S) {
      const sw = (S && S.P ? S.P.hairSwing : 0) * 4;
      cel(g, T([[-50, -50], [-30, -92], [-10, -128], [14, -158 + 0], [38 + sw, -176, 1], [36 + sw, -156], [34, -128], [46, -92], [60, -52]]), c1, { depth: 9, tension: 0.6, decor: (gg) => { RJ.ink(gg, T([[-6, -118], [20, -118]]), { w: 0, color: c2 }); tk.sparkle(gg, K.T([-4, -100])[0], K.T([-4, -100])[1], 6, { color: c2, glow: 0, thin: 0.3 }); tk.sparkle(gg, K.T([22, -128])[0], K.T([22, -128])[1], 4.5, { color: c2, glow: 0, thin: 0.3 }); tk.sparkle(gg, K.T([16, -76])[0], K.T([16, -76])[1], 5, { color: c2, glow: 0, thin: 0.3 }); } });
      band(g, K, [[-50, -53], [4, -60], [60, -52]], 9, c2, { depth: 2, tension: 0.4 });
      cel(g, T([[-82, -42], [-56, -62], [4, -68], [64, -60], [92, -42], [64, -34], [4, -42], [-56, -34]]), col.shade(c1, -0.02), { depth: 4, tension: 0.6 });
    } });
    D.tophat = () => ({ cover: 'full', front(g) {
      cel(g, T([[-40, -56], [-38, -118], [40, -120], [42, -56]]), c1, { depth: 7, tension: 0.3 });
      cel(g, T([[-39, -66], [41, -68], [42, -56], [-40, -55]]), c2, { depth: 2, tension: 0.2, noHi: true });
      cel(g, T([[-70, -50], [-40, -62], [4, -66], [48, -62], [74, -50], [48, -42], [4, -45], [-44, -42]]), col.shade(c1, -0.02), { depth: 4, tension: 0.6 });
    } });
    D.headphones = () => ({ cover: 'none',
      back(g) { const p = K.T([59, 6]); cel(g, tk.ellipsePts(p[0] + 3, p[1], 9, 15, 14, 0), c1, { depth: 3, tension: 0.9 }); },
      front(g) {
        const arc = [[-60, 6], [-66, -30], [-46, -66], [-4, -82], [38, -72], [60, -42], [62, -6]];
        band(g, K, arc, 8, c1, { depth: 3, tension: 0.7 });
        const n = K.T([-56, 8]); cel(g, tk.ellipsePts(n[0], n[1], 13, 18, 14, 0), c1, { depth: 4, tension: 0.9 });
        cel(g, tk.ellipsePts(n[0] + 3, n[1], 8.5, 13, 12, 0), c2, { depth: 3, tension: 0.9, noHi: true });
      } });
    D.headset = () => ({ cover: 'none', front(g) {
      band(g, K, [[-60, 4], [-66, -32], [-46, -64], [-4, -80], [38, -70], [58, -44], [60, -8]], 5, '#2a2a36', { depth: 2 });
      const n = K.T([-56, 10]); cel(g, tk.ellipsePts(n[0], n[1], 10, 14, 12, 0), '#2a2a36', { depth: 3, tension: 0.9 }); cel(g, tk.circlePts(n[0] + 1, n[1], 4.5, 8), c1, { depth: 1, tension: 0.9 });
      const boom = K.TT([[-52, 22], [-44, 46], [-26, 56], [-4, 52], [12, 44]]); RJ.ink(g, boom, { w: 3.2, color: C.ink, taper: 0, wobble: 0, pressure: 'flat' }); RJ.ink(g, boom, { w: 1.8, color: '#4a4a5a', taper: 0, wobble: 0, pressure: 'flat' });
      const m = boom[boom.length - 1]; cel(g, tk.circlePts(m[0], m[1], 5.6, 10), '#2a2a36', { depth: 2, tension: 0.9 }); cel(g, tk.circlePts(m[0], m[1], 2.6, 8), c1, { shadow: false, line: false });
    } });
    D.bandana = () => ({ cover: 'part', front(g) {
      const lower = [[-60, 2], [-50, -14], [-30, -26], [-4, -32], [22, -31], [44, -26], [58, -16]];
      cel(g, T(dome(11, 8).concat(lower)), c1, { depth: 5, tension: 0.8, pattern: 'polka', decor: (gg, box) => { CC.pattern(gg, 'polka', tk.shapeBox(T(dome(11, 8).concat(lower))), c1, c2); } });
      const k = K.T([-64, -14]); g.save(); g.translate(k[0], k[1]);
      cel(g, [[0, 0, 1], [-24, -12], [-30, 6, 1]], c1, { depth: 3, tension: 0.4 }); cel(g, [[0, 0, 1], [-22, 14], [-30, 30, 1]], c1, { depth: 3, tension: 0.4 });
      RJ.cel(g, tk.circlePts(0, 0, 5, 8), col.shade(c1), { shadow: false, line: LINE.mid }); g.restore();
    } });
    D.partyhat = () => ({ cover: 'part', front(g) {
      const b = K.T([20, -66]); g.save(); g.translate(b[0], b[1]); g.rotate(0.3);
      cel(g, [[-22, 4, 1], [0, -64, 1], [22, 4, 1]], c1, { depth: 6, tension: 0.2, decor: (gg) => { [-40, -22, -4].forEach((y) => RJ.ink(gg, [[-30, y + 12], [30, y - 4]], { w: 4, color: c2, taper: 0, wobble: 0, pressure: 'flat' })); } });
      RJ.cel(g, tk.circlePts(0, -66, 7.5, 12), c2, { shadow: col.shade(c2), line: LINE.main, depth: 2, hi: col.tint(c2, 0.4) });
      g.restore();
    } });
    D.star = () => ({ cover: 'none', front(g) { [[40, -42, 8, 0.2], [48, -26, 6, -0.3], [32, -52, 5, 0]].forEach((s) => { const p = K.T([s[0], s[1]]); star(g, p[0], p[1], s[2], s[2] > 6 ? c1 : c2, s[3]); }); } });
    D.heartclip = () => ({ cover: 'none', front(g) { const p = K.T([-50, -28]); g.save(); g.translate(p[0], p[1]); g.rotate(-0.3); heart(g, 0, 0, 10, c1); g.restore(); } });
    D.flower = () => ({ cover: 'none', front(g) { const p = K.T([-46, -38]); flower(g, p[0], p[1], 14, c1, c2); } });
    D.hood = () => hoodDef(K);
    return (D[st] || D.none)();
  };

  // ---- the animal hood (the onesie hood of the game: a scalloped plush ring round the face, a pair of ears or horns) ----
  const WIN_CTRL = [[-47, 14], [-46, 1], [-43.5, -9], [-39, -18], [-33.5, -27], [-27, -35], [-19, -41.5], [-10, -46.5], [-1, -50], [9, -54], [20, -56.5], [31, -55.5], [41, -51.5], [50, -44], [55, -33], [57.8, -21], [58.6, -8], [58, 10], [52.6, 27.4], [41.2, 42.2], [26.6, 54], [9, 59.3], [-8.8, 55.3], [-23.6, 50.5], [-37.6, 40], [-50, 26]];
  const HOOD_CTRL = [[2, -83], [26, -81], [46, -72], [62, -52], [72, -26], [75, 2], [74, 28], [68, 50], [54, 68], [34, 77], [10, 80], [-14, 78], [-36, 70], [-54, 56], [-67, 38], [-74, 14], [-76, -12], [-72, -40], [-58, -64], [-36, -79], [-14, -84]];
  const dense = (ctrl) => { const f = tk.flatten(ctrl, { closed: true, step: 3 }), o = []; for (let i = 0; i + 1 < f.length; i += 2) o.push([f[i], f[i + 1]]); return o; };
  const dirOf = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const j = (i + 1) % P.length; a += P[i][0] * P[j][1] - P[j][0] * P[i][1]; } return a > 0 ? 1 : -1; };
  const normals = (P) => { const sg = dirOf(P); return P.map((p, i) => { const a = P[(i + P.length - 1) % P.length], b = P[(i + 1) % P.length]; let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; return [ty / l * sg, -tx / l * sg]; }); };
  const offset = (P, d) => { const N = normals(P); return P.map((p, i) => [p[0] + N[i][0] * d, p[1] + N[i][1] * d]); };
  function scallop(P, seg, amp) {
    const n = P.length, N = normals(P), L = [0];
    for (let i = 1; i <= n; i++) L.push(L[i - 1] + Math.hypot(P[i % n][0] - P[i - 1][0], P[i % n][1] - P[i - 1][1]));
    const total = L[n] || 1, m = Math.max(3, Math.round(total / seg)), out = [];
    for (let i = 0; i < n; i++) { const u = (L[i] / total) * m, t = u - Math.floor(u), off = amp * Math.pow(Math.sin(PI * t), 0.8); out.push([P[i][0] + N[i][0] * off, P[i][1] + N[i][1] * off]); }
    return out;
  }
  function hoodDef(K) {
    const c1 = K.c.hwC1, c2 = K.c.hwC2, an = K.c.animal, T = K.TT;
    const WIN = dense(WIN_CTRL), OUT = scallop(dense(HOOD_CTRL), 21, 3.4), TRIM = scallop(offset(WIN, 6.4), 12.5, 2.5);
    const furMarks = (g, pts, c) => RJ.hatch(g, pts.map((p) => [[p[0] - 3, p[1] - 1.4], [p[0], p[1] - 3.2], [p[0] + 3, p[1] - 1.4]]), { w: 1.25, color: c, alpha: 0.85 });
    const ears = (g) => {
      if (an === 'bear') [[-60, -76, 0], [58, -72, 0]].forEach((e) => { const p = K.T([e[0], e[1]]); cel(g, tk.circlePts(p[0], p[1], 19, 14), c1, { depth: 4, tension: 0.9 }); cel(g, tk.circlePts(p[0] + 1, p[1] + 1, 10, 12), c2, { shadow: col.shade(c2), line: false, depth: 2, noHi: true }); });
      else if (an === 'cat') [[-52, -76, -0.4], [54, -74, 0.4]].forEach((e) => { const p = K.T([e[0], e[1]]); g.save(); g.translate(p[0], p[1]); g.rotate(e[2]); cel(g, [[-18, 8, 1], [-3, -46, 1], [20, 8, 1]], c1, { depth: 4, tension: 0.2 }); cel(g, [[-9, 5, 1], [-2, -32, 1], [11, 5, 1]], c2, { shadow: false, line: false, tension: 0.2 }); g.restore(); });
      else if (an === 'bunny') [[-34, -72, -0.2], [38, -70, 0.2]].forEach((e, i) => { const p = K.T([e[0], e[1]]); g.save(); g.translate(p[0], p[1]); g.rotate(e[2] + (i ? 0.1 : -0.05)); cel(g, tk.ellipsePts(0, -30, 11, 40, 16, 0), c1, { depth: 4, tension: 0.9 }); cel(g, tk.ellipsePts(0, -28, 5.5, 31, 14, 0), c2, { shadow: false, line: false, tension: 0.9 }); g.restore(); });
      else if (an === 'unicorn') {
        [[-9, -81, -0.3, 1], [49, -68, 0.4, 0.9]].forEach((e) => { const p = K.T([e[0], e[1]]); g.save(); g.translate(p[0], p[1]); g.rotate(e[2]); g.scale(e[3], e[3]); cel(g, [[-10, 2], [-10, -10], [-6.5, -23], [0, -35, 1], [6.5, -22], [10, -9], [10, 2]], c1, { depth: 4, tension: 0.8 }); cel(g, [[-5.2, 0], [-5.2, -9], [-3, -19], [0, -26, 1], [3, -18], [5.2, -8], [5.2, 0]], c2, { shadow: false, line: false, tension: 0.8 }); g.restore(); });
        const p = K.T([21, -76]); g.save(); g.translate(p[0], p[1]); g.rotate(0.12);
        cel(g, [[-8.5, 3], [-6.3, -11], [-3.2, -26], [0.6, -39, 1], [4.6, -25], [7.2, -11], [9, 3]], '#ffd45c', { depth: 4, tension: 0.8, decor: (gg) => { for (let i = 0; i < 4; i++) { const yy = 2 - i * 9; RJ.ink(gg, [[-10, yy + 6], [0, yy - 1.5], [10, yy - 8]], { w: 2, color: '#e3a634', taper: 0.1, wobble: 0, pressure: 'flat' }); } } });
        g.restore();
      } else if (an === 'monster') [[-55, -60, -1], [59, -60, 1]].forEach((e) => { const p = K.T([e[0], e[1]]); g.save(); g.translate(p[0], p[1]); g.scale(e[2], 1); cel(g, [[-4, 0], [-3, -12], [3, -26], [10, -34, 1], [10, -18], [12, 0]], c2, { depth: 4, tension: 0.8 }); g.restore(); });
      else if (an === 'dino') [[-30, -80], [-6, -88], [18, -86], [40, -76]].forEach((e, i) => { const p = K.T([e[0], e[1]]); cel(g, [[p[0] - 9, p[1] + 4, 1], [p[0], p[1] - 22 + i % 2 * 3, 1], [p[0] + 9, p[1] + 4, 1]], c2, { depth: 3, tension: 0.2 }); });
    };
    return { cover: 'full', hideHair: true,
      back(g) { ears(g); },
      front(g) {
        g.save();
        // the plush ring: scalloped outer edge, window cut out, one hard shadow band on the lower left
        g.beginPath(); tk.trace(g, T(OUT)); tk.trace(g, T(WIN)); g.fillStyle = c1; g.fill('evenodd');
        g.save(); g.beginPath(); tk.trace(g, T(OUT)); tk.trace(g, T(WIN)); g.clip('evenodd'); g.fillStyle = col.shade(c1); g.beginPath(); g.rect(-120, -120, 240, 240); tk.trace(g, T(OUT), RJ.lx(6), -9); g.fill('evenodd'); g.restore();
        g.restore();
        g.save(); g.beginPath(); tk.trace(g, T(OUT)); g.closePath(); g.lineWidth = LINE.main + 0.4; g.lineJoin = 'round'; g.strokeStyle = C.ink; g.stroke(); g.restore();
        furMarks(g, T([[-62, -30], [-66, 0], [-58, 36], [-40, 62], [66, -34], [70, -2], [66, 34], [40, -70], [-24, -72], [-50, -52], [22, 70], [-12, 72], [52, 58]]), col.shade(c1, 0.3));
        g.save(); g.beginPath(); tk.trace(g, T(TRIM)); tk.trace(g, T(WIN)); g.fillStyle = c2; g.fill('evenodd');
        g.clip('evenodd'); g.fillStyle = col.shade(c2); g.beginPath(); g.rect(-120, -120, 240, 240); tk.trace(g, T(TRIM), RJ.lx(3.4), -5.2); g.fill('evenodd'); g.restore();
        g.save(); g.lineWidth = LINE.main + 0.2; g.lineJoin = 'round'; g.strokeStyle = C.ink; g.beginPath(); tk.trace(g, T(TRIM)); g.closePath(); g.stroke(); g.beginPath(); tk.trace(g, T(WIN)); g.closePath(); g.stroke(); g.restore();
      },
      window: T(WIN) };
  }

  // ---- neckwear (torso space) ----
  CC.neckwear = function (K) {
    const st = K.c.neck, c = K.c.neckC;
    if (st === 'none') return null;
    const sh = col.shade(c), hi = col.tint(c, 0.4);
    const beads = (g, col2) => {
      const pts = [];
      for (let i = 0; i <= 11; i++) { const u = i / 11; pts.push([-13 + u * 26, -141 + Math.sin(u * PI) * 13 + (Math.abs(u - 0.5) < 0.1 ? 1 : 0)]); }
      RJ.ink(g, pts, { w: 1, color: C.inkSoft, taper: 0, wobble: 0, alpha: 0.5 });
      pts.forEach((p, i) => { if (st === 'heart' && (i === 5 || i === 6)) return; g.beginPath(); g.arc(p[0], p[1], 2.2, 0, TAU); g.fillStyle = col2; g.fill(); g.lineWidth = 0.9; g.strokeStyle = C.ink; g.stroke(); });
    };
    return (g, S) => {
      if (st === 'beads') beads(g, c);
      else if (st === 'heart') { beads(g, '#fffdf8'); RJ.cel(g, [[0, -112, 1], [-6, -118], [-3.4, -123], [0, -120.5], [3.4, -123], [6, -118]], c, { shadow: sh, line: LINE.mid, depth: 2, hi, hiW: 1 }); }
      else if (st === 'choker') { RJ.ink(g, [[-11, -148], [0, -143.5], [11, -148]], { w: 5, color: C.ink, taper: 0, wobble: 0, pressure: 'flat' }); RJ.ink(g, [[-11, -148], [0, -143.5], [11, -148]], { w: 3, color: c, taper: 0, wobble: 0, pressure: 'flat' }); RJ.cel(g, tk.circlePts(0, -142.5, 3, 8), '#ffd84d', { shadow: false, line: LINE.fine, depth: 1 }); }
      else if (st === 'chain') { RJ.ink(g, [[-12, -148], [-8, -134], [0, -126], [8, -134], [12, -148]], { w: 3, color: C.ink, taper: 0, wobble: 0 }); RJ.ink(g, [[-12, -148], [-8, -134], [0, -126], [8, -134], [12, -148]], { w: 1.6, color: c, taper: 0, wobble: 0 }); RJ.cel(g, tk.circlePts(0, -122, 5, 10), c, { shadow: sh, line: LINE.mid, depth: 2, hi }); }
      else if (st === 'scarf') {
        RJ.cel(g, [[-19, -153, 1], [19, -153, 1], [23, -140], [20, -132], [0, -128], [-20, -132], [-23, -140]], c, { shadow: sh, line: LINE.main, depth: 5, hi, hiW: 1.5, tension: 0.8, decor: (gg) => { for (let x = -16; x <= 16; x += 8) RJ.ink(gg, [[x, -150], [x * 1.1, -128]], { w: 1.2, color: sh, taper: 0.4, wobble: 0, alpha: 0.7 }); } });
        RJ.cel(g, [[8, -134], [24, -130], [27, -100], [27, -92, 1], [15, -94], [11, -112]], c, { shadow: sh, line: LINE.main, depth: 4, hi, hiW: 1.4, tension: 0.5, decor: (gg) => { [-98, -108, -118].forEach((y) => RJ.ink(gg, [[8, y], [30, y - 2]], { w: 3, color: col.mix(c, '#ffffff', 0.5), taper: 0, wobble: 0, pressure: 'flat' })); } });
      }
      else if (st === 'bowtie') { [1, -1].forEach((s) => RJ.cel(g, [[0, -140, 1], [s * 14, -149], [s * 15, -131]], c, { shadow: sh, line: LINE.mid, depth: 3, hi, tension: 0.4 })); RJ.cel(g, tk.circlePts(0, -140, 3.6, 8), sh, { shadow: false, line: LINE.mid }); }
      else if (st === 'tie') { RJ.cel(g, [[-4, -141, 1], [4, -141, 1], [3, -137], [9, -102, 1], [0, -94, 1], [-9, -102, 1], [-3, -137]], c, { shadow: sh, line: LINE.main, depth: 3, hi, hiW: 1.2, tension: 0.2 }); RJ.cel(g, [[-5.5, -146, 1], [5.5, -146, 1], [4.5, -138], [-4.5, -138]], sh, { shadow: false, line: LINE.mid, tension: 0.3 }); }
      else if (st === 'bandana') { RJ.cel(g, [[-20, -152, 1], [20, -152, 1], [11, -134], [0, -122, 1], [-11, -134]], c, { shadow: sh, line: LINE.main, depth: 4, hi, tension: 0.35, decor: (gg) => { CC.pattern(gg, 'polka', [-20, -152, 20, -122], c, col.mix(c, '#ffffff', 0.7)); } }); }
      else if (st === 'phones') { RJ.ink(g, [[-19, -148], [-22, -126], [-16, -114]], { w: 5, color: C.ink, taper: 0, wobble: 0 }); RJ.ink(g, [[19, -148], [22, -126], [16, -114]], { w: 5, color: C.ink, taper: 0, wobble: 0 }); [-1, 1].forEach((s) => { RJ.ink(g, [[s * 19, -148], [s * 22, -126], [s * 16, -114]], { w: 3, color: c, taper: 0, wobble: 0 }); RJ.cel(g, tk.ellipsePts(s * 15, -112, 9, 12, 12, 0.2 * s), c, { shadow: sh, line: LINE.main, depth: 3, hi }); RJ.cel(g, tk.ellipsePts(s * 15, -112, 5.5, 8, 10, 0.2 * s), col.mix(c, '#ffffff', 0.4), { shadow: false, line: LINE.mid }); }); }
      else if (st === 'lei') {
        for (let i = 0; i < 9; i++) { const u = i / 8, x = -22 + u * 44, y = -147 + Math.sin(u * PI) * 22; const f = i % 2 ? '#ff7eb6' : '#ffd84d'; (function (xx, yy, ff) { for (let k = 0; k < 5; k++) { const a = -PI / 2 + (k / 5) * TAU; RJ.cel(g, tk.ellipsePts(xx + Math.cos(a) * 3.6, yy + Math.sin(a) * 3.6, 3.2, 2.5, 8, a), ff, { shadow: col.shade(ff), line: LINE.fine + 0.2, depth: 1, tension: 0.9 }); } RJ.cel(g, tk.circlePts(xx, yy, 1.8, 6), '#fff4e6', { shadow: false, line: false }); })(x, y, i === 4 ? c : f); }
      }
      else if (st === 'bell') { RJ.ink(g, [[-11, -148], [0, -143.5], [11, -148]], { w: 5, color: C.ink, taper: 0, wobble: 0, pressure: 'flat' }); RJ.ink(g, [[-11, -148], [0, -143.5], [11, -148]], { w: 3, color: c, taper: 0, wobble: 0, pressure: 'flat' }); RJ.cel(g, tk.circlePts(0, -138, 5.2, 10), '#ffd84d', { shadow: col.shade('#ffd84d'), line: LINE.main, depth: 2, hi: '#fff1b8' }); RJ.ink(g, [[-3, -137], [3, -137]], { w: 1.2, color: C.ink, taper: 0, wobble: 0 }); }
    };
  };

  // ---- back items (torso space, drawn behind the whole figure) ----
  CC.backItem = function (K) {
    const st = K.c.back, c = K.c.backC;
    if (st === 'none') return null;
    const sh = col.shade(c), hi = col.tint(c, 0.4), c2 = col.mix(c, '#ffffff', 0.55);
    const cel2 = (g, pts, base, o) => RJ.cel(g, pts, base, Object.assign({ shadow: col.shade(base), line: LINE.main, depth: 6, hi: col.tint(base, 0.34), hiW: 1.6, hiAlpha: 0.7, tension: 0.7 }, o));
    return (g, S) => {
      const t = S.t || 0, flap = Math.sin(t * 3.2) * 0.07 * (S.P && S.P.pose !== 'down' ? 1 : 0.2), sway = (S.P ? S.P.hairSwing : 0) * 4;
      if (st === 'backpack') {
        cel2(g, [[-52, -134], [-30, -138], [-26, -92], [-30, -84], [-52, -86], [-56, -112]], c, { depth: 6, tension: 0.8, decor: (gg) => { cel2(gg, [[-54, -106], [-36, -108], [-36, -92], [-54, -92]], sh, { depth: 2, tension: 0.2, noHi: true }); RJ.ink(gg, [[-52, -124], [-30, -126]], { w: 1.4, color: sh, taper: 0, wobble: 0 }); } });
        RJ.ink(g, [[-44, -140], [-40, -148], [-34, -140]], { w: 4, color: C.ink, taper: 0, wobble: 0 }); RJ.ink(g, [[-44, -140], [-40, -148], [-34, -140]], { w: 2, color: sh, taper: 0, wobble: 0 });
      } else if (st === 'cape') {
        cel2(g, [[-22, -146], [22, -146], [30, -112 + sway * 0.2], [28 + sway, -66], [8 + sway, -48], [-14 + sway, -58], [-40 + sway, -50], [-56 + sway, -64], [-46, -104], [-30, -138]], c, { depth: 9, tension: 0.6, decor: (gg) => { for (let i = -2; i <= 2; i++) RJ.ink(gg, [[i * 9, -140], [i * 12 + sway, -52]], { w: 1.2, color: sh, taper: 0.5, wobble: 0, alpha: 0.6 }); RJ.fillPts(gg, [[-60, -78], [40, -66], [40, -44], [-60, -50]], col.shade(c, 0.3), 0.18); } });
      } else if (st === 'angel' || st === 'fairy' || st === 'bat' || st === 'butterfly') {
        [[-1, 1.0, -0.22 - flap], [1, 0.82, 0.18 + flap]].forEach((w) => {
          g.save(); g.translate(w[0] * 14, -128); g.rotate(w[2] * w[0] * -1); g.scale(w[0] * w[1] * 1.4, w[1] * 1.4);
          if (st === 'angel') { cel2(g, [[0, 2, 1], [-20, -30], [-50, -62], [-84, -70, 1], [-72, -48], [-92, -40, 1], [-76, -22], [-92, -6, 1], [-70, 4], [-82, 22, 1], [-52, 22], [-34, 30], [-12, 20]], '#fffaf1', { depth: 6, tension: 0.7, decor: (gg) => { [[-20, -10, -70, -50], [-18, 2, -76, -24], [-14, 12, -70, 4]].forEach((l) => RJ.ink(gg, [[l[0], l[1]], [l[2], l[3]]], { w: 1.2, color: '#d9cfd0', taper: 0.5, wobble: 0 })); } }); }
          else if (st === 'fairy') { [[[0, 0], [-34, -64], [-78, -76], [-84, -36], [-48, -6]], [[0, 6], [-30, 10], [-62, 34], [-52, 56], [-18, 34]]].forEach((p, i) => { g.save(); g.globalAlpha = 0.82; cel2(g, p.map((q, j) => (j === 0 ? [q[0], q[1], 1] : q)), i ? c2 : c, { depth: 4, tension: 0.8, hi: '#ffffff', decor: (gg) => { RJ.ink(gg, [p[0], p[2]], { w: 1, color: sh, taper: 0.5, wobble: 0, alpha: 0.6 }); RJ.ink(gg, [p[0], [p[1][0] * 0.8, p[1][1] * 0.8 + 4]], { w: 1, color: sh, taper: 0.5, wobble: 0, alpha: 0.6 }); } }); g.restore(); }); }
          else if (st === 'bat') { cel2(g, [[0, 0, 1], [-30, -50], [-66, -78, 1], [-74, -40], [-92, -14, 1], [-66, -10], [-60, 18, 1], [-38, 4], [-24, 22, 1], [-12, 6]], c, { depth: 6, tension: 0.2, decor: (gg) => { [[-66, -78, -40, 0], [-92, -14, -34, 2], [-60, 18, -26, 6]].forEach((l) => RJ.ink(gg, [[0, 0], [l[0], l[1]]], { w: 1.6, color: sh, taper: 0.4, wobble: 0 })); } }); }
          else { [[[0, -2], [-34, -76], [-84, -84], [-90, -38], [-50, -6]], [[0, 4], [-28, 14], [-60, 38], [-52, 62], [-16, 34]]].forEach((p, i) => cel2(g, p.map((q, j) => (j === 0 ? [q[0], q[1], 1] : q)), i ? col.mix(c, '#ffffff', 0.25) : c, { depth: 5, tension: 0.85, decor: (gg) => { gg.fillStyle = c2; [[-60, -52, 8], [-46, -34, 5]].forEach((s) => { if (!i) { gg.beginPath(); gg.arc(s[0], s[1], s[2], 0, TAU); gg.fill(); } }); } })); }
          g.restore();
        });
      } else if (st === 'cattail' || st === 'devil' || st === 'dinotail' || st === 'bunnytail') {
        g.save(); g.translate(-18, -82);
        if (st === 'bunnytail') { RJ.cel(g, tk.circlePts(-22, 8, 14, 14), '#fffaf1', { shadow: '#e2d9e8', line: LINE.main, depth: 4, hi: '#ffffff', hiW: 1.4 }); }
        else {
          const sp = CC.waveSpine([0, 0], [-62, -26], 1.4, 8, 10).map((p, i) => [p[0], p[1] + sway * 0.3 * (i / 10)]);
          if (st === 'cattail') { cel2(g, CC.strip(sp.concat([[-74 + sway, -52]]), 13, 9, 2), c, { depth: 4, tension: 0.9 }); }
          else if (st === 'devil') { RJ.ink(g, sp, { w: 5.5, color: C.ink, taper: 0, wobble: 0 }); RJ.ink(g, sp, { w: 3.2, color: c, taper: 0, wobble: 0 }); const e = sp[sp.length - 1]; RJ.cel(g, [[e[0] - 4, e[1] + 2, 1], [e[0] - 18, e[1] - 6], [e[0] - 7, e[1] - 14, 1], [e[0] - 4, e[1] - 8]], c, { shadow: sh, line: LINE.main, depth: 2, tension: 0.3 }); }
          else { cel2(g, CC.strip(CC.waveSpine([0, 0], [-66, 0], 1.2, 6, 10).map((p, i) => [p[0], p[1] + sway * 0.2 * (i / 10)]), 28, 4, 2), c, { depth: 5, tension: 0.9, decor: (gg) => { for (let x = -10; x > -60; x -= 14) RJ.cel(gg, [[x + 4, -12, 1], [x, -20, 1], [x - 5, -12, 1]], col.mix(c, '#ffffff', 0.4), { shadow: false, line: LINE.mid, tension: 0.2 }); } }); }
        }
        g.restore();
      }
    };
  };

  // ---- wrists and gloves: what the arm draws ----
  CC.wristInfo = function (K) {
    const c = K.c;
    const out = { cuff: null, handSkin: null };
    const w = c.wrist, wc = c.wristC;
    if (w !== 'none') out.cuff = { color: wc, light: col.shade(wc, -0.02), gold: w === 'bangles' || w === 'watch' };
    if (w === 'bangles') out.cuff = { color: '#f4c64e', light: '#fff1b8' };
    if (w === 'watch') out.cuff = { color: '#2a2a36', light: '#9aa0b4' };
    if (c.gloves === 'full') out.handSkin = c.gloveC;
    else if (c.gloves === 'fingerless') out.cuff = out.cuff || { color: c.gloveC, light: col.shade(c.gloveC, -0.02) };
    return out;
  };
})();
