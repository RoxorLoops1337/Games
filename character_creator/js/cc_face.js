// Character Studio face: the skull, the ears, every eye, brow, nose and mouth, freckles and paint, facial hair, earrings and glasses.
// All in head space for the default head (K.T reshapes the skull and the hair; the face features keep their own size and only move).
(function () {
  'use strict';
  const CC = window.CC, RJ = ART.rj, tk = ART.tk, C = RJ.C, LINE = RJ.LINE;
  const { clamp, lerp, TAU } = CC.u, col = CC.col;
  const PI = Math.PI;
  const FACE = (CC.face = {});

  // ---- the skull and everything that sits on it ----
  FACE.skin = function (g, S, K, hair, beard) {
    g.save();
    g.beginPath(); tk.trace(g, K.skull); g.clip();
    g.fillStyle = K.skin; g.fillRect(-120, -140, 240, 300);
    g.fillStyle = K.skinSh; g.beginPath(); g.rect(-120, -140, 240, 300); tk.trace(g, K.skull, RJ.lx(2.6), -4.4); g.fill('evenodd');
    if (hair && hair.pre) hair.pre(g, S);
    if (hair && hair.fshadow) { g.fillStyle = K.skinSh; g.beginPath(); tk.trace(g, hair.fshadow, 0, 6.5); g.fill(); }
    if (beard) beard(g);
    g.restore();
  };
  FACE.outline = function (g, K) { RJ.ink(g, K.skull, { closed: true, w: LINE.main + 0.2, color: C.ink, align: 0.2, weightVar: 0.5 }); };

  // ---- ears ----
  FACE.earFar = function (g, K) {
    const st = K.c.ear;
    if (st === 'hidden' || st === 'cat' || st === 'pointy') return;
    const p = K.T([58, K.fg.earY - 1]);
    RJ.ear(g, p[0], p[1], { r: 9 * K.c.earSize * (st === 'small' ? 0.75 : st === 'big' ? 1.3 : 1), side: 1, skin: K.skin, shade: K.skinSh });
  };
  FACE.earNear = function (g, K) {
    const st = K.c.ear, p = K.T([-54, K.fg.earY]), r = K.fg.earR;
    if (st === 'hidden' || st === 'cat') return;
    if (st === 'pointy') {
      const T = K.TT, a = T([[-48, -2], [-60, -10], [-94, -34, 1], [-78, -2], [-70, 12], [-60, 22], [-50, 20]]);
      RJ.cel(g, a, K.skin, { shadow: K.skinSh, line: LINE.main, depth: 3, tension: 0.7 });
      RJ.ink(g, T([[-64, -4], [-80, -18], [-72, 0], [-62, 14]]), { w: LINE.fine, color: C.inkSoft, taper: 0.4 });
      const b = T([[48, -4], [60, -12], [78, -26, 1], [68, 0], [58, 14]]);
      return;
    }
    RJ.ear(g, p[0], p[1], { r: r * (st === 'small' ? 0.72 : st === 'big' ? 1.3 : 1), side: -1, skin: K.skin, shade: K.skinSh });
  };
  // animal ears on top of the head, behind the hair so the cap covers their bases (the 'cat' ear style)
  FACE.catEars = function (g, K) {
    if (K.c.ear !== 'cat') return;
    const T = K.TT, H = K.hair;
    [[[-58, -52], [-60, -86], [-30, -70, 1]], [[54, -46], [60, -84], [26, -72, 1]]].forEach((e, i) => {
      RJ.cel(g, T([[e[0][0], e[0][1], 1], [e[1][0], e[1][1], 1], [e[2][0], e[2][1], 1]]), H.base, { shadow: H.sh, line: LINE.main, depth: 4, hi: H.hi, hiW: 1.4, tension: 0.2 });
      const a = e[0], b = e[1], c = e[2], m = (p, q, k) => [lerp(p[0], q[0], k), lerp(p[1], q[1], k)];
      RJ.cel(g, T([m(a, [0, -50], 0.0).concat(1), m(b, a, 0.55).concat(1), m(c, a, 0.5).concat(1)].map((p, j) => (j === 1 ? [lerp(b[0], (a[0] + c[0]) / 2, 0.45), lerp(b[1], (a[1] + c[1]) / 2, 0.45), 1] : j === 2 ? [lerp(c[0], (a[0] + b[0]) / 2, 0.4), lerp(c[1], (a[1] + b[1]) / 2, 0.4), 1] : [lerp(a[0], c[0], 0.2), lerp(a[1], c[1], 0.2) - 2, 1]))), '#ffb3c8', { shadow: false, line: false, tension: 0.2 });
    });
  };
  FACE.earrings = function (g, K) {
    const st = K.c.earring, c = K.c.earC;
    if (st === 'none' || K.c.ear === 'hidden' || K.c.ear === 'cat') return;
    const r = K.fg.earR, e = K.T([-54, K.fg.earY]), x = e[0] + 1, y = e[1] + r * 0.95;
    const hi = col.tint(c, 0.5);
    const ring = (rx, ry) => { g.save(); g.lineWidth = 3.6; g.strokeStyle = C.ink; g.beginPath(); g.ellipse(x, y + ry * 0.55, rx, ry, 0.1, 0, TAU); g.stroke(); g.lineWidth = 1.9; g.strokeStyle = c; g.beginPath(); g.ellipse(x, y + ry * 0.55, rx, ry, 0.1, 0, TAU); g.stroke(); g.lineWidth = 0.9; g.strokeStyle = hi; g.beginPath(); g.ellipse(x, y + ry * 0.55, rx, ry, 0.1, 3.6, 4.6); g.stroke(); g.restore(); };
    if (st === 'hoop') ring(6.2, 8.8);
    else if (st === 'bighoop') ring(9.5, 13);
    else if (st === 'stud') { RJ.cel(g, tk.circlePts(x, y - 2, 3.4, 10), c, { shadow: col.shade(c, 0.1), line: LINE.mid, depth: 1 }); g.beginPath(); g.arc(x - 1, y - 3, 0.9, 0, TAU); g.fillStyle = '#fff'; g.fill(); }
    else if (st === 'drop') { RJ.ink(g, [[x, y - 2], [x, y + 8]], { w: 1.6, color: C.ink, taper: 0, wobble: 0 }); tk.sparkle(g, x, y + 13, 7, { color: c, glow: 0.2, thin: 0.35 }); }
    else if (st === 'heart') { RJ.ink(g, [[x, y - 2], [x, y + 3]], { w: 1.4, color: C.ink, taper: 0, wobble: 0 }); RJ.cel(g, [[x, y + 14, 1], [x - 6, y + 7], [x - 3, y + 3], [x, y + 6], [x + 3, y + 3], [x + 6, y + 7]], c, { shadow: col.shade(c, 0.1), line: LINE.mid, depth: 2, hi }); }
    else if (st === 'cuff') { const a = K.T([-60, K.fg.earY - 8]); g.save(); g.lineWidth = 3.4; g.strokeStyle = C.ink; g.beginPath(); g.arc(a[0] + 4, a[1] + 4, 8, PI * 0.8, PI * 1.7); g.stroke(); g.lineWidth = 1.8; g.strokeStyle = c; g.beginPath(); g.arc(a[0] + 4, a[1] + 4, 8, PI * 0.8, PI * 1.7); g.stroke(); g.restore(); }
  };

  // ---- the eyes ----
  function sparkleOn(K) {
    const kind = K.c.sparkle, c = K.c.sparkleC;
    if (kind === 'none') return null;
    return (g, e, side, st, ge) => {
      if (!ge) return;
      const dir = RJ._flip ? -1 : 1, fr = Math.max(2.2, ge.rx * 0.33), fx = ge.cx + dir * 0.34 * ge.rx, fy = ge.cy - 0.3 * ge.ry;
      g.save();
      if (kind === 'flower') {
        for (let i = 0; i < 5; i++) { const an = -PI / 2 + (i / 5) * TAU; g.beginPath(); g.ellipse(fx + Math.cos(an) * fr * 0.62, fy + Math.sin(an) * fr * 0.62, fr * 0.6, fr * 0.45, an, 0, TAU); g.fillStyle = c; g.fill(); }
        g.beginPath(); g.arc(fx, fy, fr * 0.3, 0, TAU); g.fillStyle = col.tint(c, 0.7); g.fill();
      } else if (kind === 'star') tk.sparkle(g, fx, fy, fr * 1.5, { color: c, glow: 0, thin: 0.22 });
      else if (kind === 'heart') RJ.cel(g, [[fx, fy + fr * 0.9, 1], [fx - fr * 1.1, fy - fr * 0.1], [fx - fr * 0.5, fy - fr * 0.8], [fx, fy - fr * 0.35], [fx + fr * 0.5, fy - fr * 0.8], [fx + fr * 1.1, fy - fr * 0.1]], c, { shadow: false, line: false, depth: 0 });
      else if (kind === 'note') tk.note(g, fx, fy, fr * 2.1, { kind: 'eighth', color: c });
      else if (kind === 'ring') { g.lineWidth = Math.max(1, fr * 0.5); g.strokeStyle = c; g.beginPath(); g.arc(ge.cx, ge.cy + ge.ry * 0.1, ge.rx * 0.5, 0, TAU); g.stroke(); }
      g.restore();
    };
  }
  function dotEye(g, e, side, st, K) {
    const dir = RJ._flip ? -1 : 1, o = clamp(st.open === undefined ? 1 : st.open, 0, 1), s = st.eyes, lid = s === 'half' ? 0.55 : s === 'sleepy' ? 0.35 : 1;
    const rx = e.w * 0.36, ry = Math.max(0.6, e.h * 0.46 * o * lid);
    g.save(); g.translate(e.x, e.y + (1 - lid) * e.h * 0.2);
    g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, TAU); g.fillStyle = '#2a1a1f'; g.fill();
    if (o * lid > 0.4) {
      g.fillStyle = '#fff'; g.beginPath(); g.arc(dir * rx * 0.3, -ry * 0.35, rx * 0.34, 0, TAU); g.fill();
      g.beginPath(); g.arc(-dir * rx * 0.25, ry * 0.3, rx * 0.15, 0, TAU); g.fill();
    }
    g.restore();
  }
  FACE.eye = function (g, e, side, st, K) {
    const E = K.eyeStyle, c = K.c;
    if (st.eyes === 'hurt') { RJ.hurtEye(g, e, side, { ink: C.ink, hurtLine: 2.3 }); return; }
    if (E.dot && st.eyes !== 'closed' && st.eyes !== 'happy') { dotEye(g, e, side, st, K); return; }
    const state = E.arcs && st.eyes !== 'closed' ? 'happy' : st.eyes;
    const F = { eye: {
      iris: K.iris, ring: col.shade(c.iris, 0.3), sclera: '#fffdfa', expr: 'neutral', irisW: E.irisW || 0.74, irisH: E.irisH || 0.92, tilt: (E.tilt || 0) + c.eyeTilt, drop: E.drop || 0,
      lashes: c.lashes, lash: E.lashK || 1, wing: E.wing === undefined ? 0.5 : E.wing, crease: E.crease !== false, creaseColor: K.hair.sh, lid: Math.max(1.4, e.w * 0.075),
      hl: [[-0.38, -0.5, 0.3], [-0.3, -0.12, 0.14]], hlSide: RJ._flip ? 1 : -1, ink: C.ink, onEye: sparkleOn(K),
    } };
    if (c.eyes === 'star') F.eye.onEye = (gg, ee, sd, ss, ge) => { if (ge) tk.sparkle(gg, ge.cx + (RJ._flip ? -1 : 1) * ge.rx * 0.34, ge.cy - ge.ry * 0.3, ge.rx * 0.5, { color: '#ffffff', glow: 0, thin: 0.22 }); };
    RJ.eye(g, e, side, Object.assign({}, st, { eyes: state }), F);
  };

  // ---- brows, nose, mouth, blush ----
  const BROW = {
    soft: { thick: 3.2, arch: 0.62, tilt: 0 }, thick: { thick: 5.8, arch: 0.4, tilt: 0.1 }, thin: { thick: 2.2, arch: 0.5, tilt: 0 },
    flat: { thick: 4, arch: 0.05, tilt: 0 }, angry: { thick: 5.4, arch: 0.3, tilt: 0.45 },
  };
  FACE.brows = function (g, st, K) {
    const b = BROW[K.c.brow];
    if (!b) return;
    const F = K.fg, tl = (st.brow || 0) + K.c.browTilt + b.tilt, by = (st.browY || 0), th = b.thick * K.c.browThick;
    const wn = F.w * 0.84, wf = F.wF * 0.84;
    RJ.brow(g, F.cx - F.gap / 2 - 1 - wn / 2 + 1.5, F.browY + by + 1.5, wn - 2, { side: -1, tilt: tl, arch: b.arch, thick: th, color: K.browColor, seed: 0 });
    RJ.brow(g, F.cx + F.gap / 2 + 1 + wf / 2, F.browY + by + 1.5, wf, { side: 1, tilt: tl, arch: b.arch, thick: th * 0.92, color: K.browColor, seed: 1 });
  };
  FACE.nose = function (g, K) {
    const st = K.c.nose, x = K.fg.cx, y = K.fg.noseY, ink = col.mix(K.hair.sh, '#2d170f', 0.4);
    if (st === 'none') return;
    if (st === 'tick') { tk.inkPath(g, [[x - 0.9, y - 2.4], [x + 0.7, y - 0.1], [x + 0.2, y + 1.9]], { w: 1.25, color: ink, alpha: 0.7, taper: 0.5, wobble: 0, weightVar: 0, step: 1 }); g.save(); g.globalAlpha *= 0.28; g.fillStyle = K.skinDeep; g.beginPath(); g.ellipse(x, y + 2.4, 2.3, 1.1, 0, 0, TAU); g.fill(); g.restore(); }
    else if (st === 'button') { g.save(); g.globalAlpha = 0.4; g.fillStyle = K.skinDeep; g.beginPath(); g.ellipse(x + 0.6, y + 1.4, 4, 3.2, 0, 0, TAU); g.fill(); g.restore(); tk.inkPath(g, [[x - 3.2, y + 2.6], [x - 1, y + 4.2], [x + 2, y + 4.2], [x + 4, y + 2.6]], { w: 1.2, color: ink, alpha: 0.75, taper: 0.4, wobble: 0, weightVar: 0 }); g.beginPath(); g.arc(x + 1.4, y - 0.4, 1, 0, TAU); g.fillStyle = K.skinHi; g.fill(); }
    else if (st === 'dot') { g.beginPath(); g.arc(x + 0.6, y + 1.5, 1.7, 0, TAU); g.fillStyle = col.mix(K.skinDeep, '#6b3a28', 0.4); g.fill(); }
    else if (st === 'pointy') tk.inkPath(g, [[x - 1.6, y - 7], [x + 3.4, y + 1], [x - 0.4, y + 3.2]], { w: 1.5, color: ink, alpha: 0.85, taper: 0.5, wobble: 0, weightVar: 0 });
    else if (st === 'wide') { tk.inkPath(g, [[x - 5, y + 2.6], [x - 2.2, y + 4], [x + 0.6, y + 3.4]], { w: 1.3, color: ink, alpha: 0.8, taper: 0.4, wobble: 0, weightVar: 0 }); tk.inkPath(g, [[x + 0.6, y + 3.4], [x + 3.6, y + 4.1], [x + 6.2, y + 2.4]], { w: 1.3, color: ink, alpha: 0.8, taper: 0.4, wobble: 0, weightVar: 0 }); }
  };
  FACE.mouth = function (g, st, K) {
    const F = K.fg, kind = st.mouth, w = F.mouthW, x = F.cx, y = F.mouthY, lip = K.c.lip;
    const sty = { lineW: 1.4, inner: '#d9626f', tongue: '#f29aa0', ink: lip ? col.shade(lip, 0.3) : C.ink };
    if (lip && (kind === 'smile' || kind === 'tiny' || kind === 'smirk' || kind === 'flat')) {
      g.save(); g.fillStyle = lip; g.globalAlpha = 0.9; g.beginPath(); g.ellipse(x, y + w * 0.16, w * 0.34, w * 0.1, 0, 0, TAU); g.fill(); g.restore();
    }
    RJ.mouth(g, x, y, w, kind, sty);
    if (lip && kind !== 'smile' && kind !== 'tiny' && kind !== 'smirk' && kind !== 'flat') { g.save(); g.strokeStyle = lip; g.lineWidth = 1.6; g.globalAlpha = 0.8; g.beginPath(); g.moveTo(x - w * 0.5, y); g.quadraticCurveTo(x, y - w * 0.12, x + w * 0.5, y); g.stroke(); g.restore(); }
  };
  FACE.blush = function (g, st, K) {
    const F = K.fg, k = clamp((st.blush === undefined ? 1 : st.blush) * K.c.blush, 0, 2);
    if (K.c.blush <= 0.01) return;
    tk.blush(g, F.near.x, F.blushY, 19 * clamp(k, 0.2, 1.8), { color: K.c.blushC, alpha: clamp(0.22 * k + 0.06, 0.04, 0.55) });
    tk.blush(g, F.far.x, F.blushY, 17 * clamp(k, 0.2, 1.8), { color: K.c.blushC, alpha: clamp(0.22 * k + 0.06, 0.04, 0.55) });
  };

  // ---- freckles and face paint ----
  FACE.marks = function (g, K) {
    const F = K.fg, c = K.c, dot = col.mix(K.skinDeep, '#8a4a2a', 0.45);
    const dots = (list, r) => { g.save(); g.fillStyle = dot; g.globalAlpha = 0.85; list.forEach((p) => { g.beginPath(); g.arc(p[0], p[1], r, 0, TAU); g.fill(); }); g.restore(); };
    const nx = F.near.x, fx = F.far.x, y = F.eyeY + 17;
    if (c.freckles === 'light') dots([[nx - 3, y], [nx + 2, y + 3], [nx - 8, y + 4], [fx + 2, y], [fx - 3, y + 3], [fx + 7, y + 4], [F.cx - 4, y - 5], [F.cx + 5, y - 5]], 1.15);
    else if (c.freckles === 'heavy') dots([[nx - 3, y], [nx + 2, y + 3], [nx - 8, y + 4], [nx - 12, y - 1], [nx + 6, y - 2], [nx - 1, y + 7], [fx + 2, y], [fx - 3, y + 3], [fx + 7, y + 4], [fx + 11, y - 1], [fx - 6, y - 2], [fx + 1, y + 7], [F.cx - 4, y - 5], [F.cx + 5, y - 5], [F.cx, y - 8], [F.cx - 8, y - 9], [F.cx + 9, y - 9], [nx - 6, y + 9], [fx + 5, y + 9]], 1.25);
    else if (c.freckles === 'nose') dots([[F.cx - 6, y - 7], [F.cx - 2, y - 9], [F.cx + 3, y - 9], [F.cx + 8, y - 7], [F.cx - 4, y - 4], [F.cx + 6, y - 4]], 1.1);
    const mc = c.markC, ink = col.shade(mc, 0.2), py = F.blushY + 1;
    const star = (x0, y0, r) => { const p = []; for (let i = 0; i < 10; i++) { const a = -PI / 2 + i * PI / 5, rr = i % 2 ? r * 0.45 : r; p.push([x0 + Math.cos(a) * rr, y0 + Math.sin(a) * rr, 1]); } RJ.cel(g, p, mc, { shadow: false, line: LINE.fine + 0.2, lineColor: ink, tension: 0 }); };
    if (c.mark === 'mole') { g.beginPath(); g.arc(F.cx + 17, F.mouthY + 2, 1.7, 0, TAU); g.fillStyle = '#3a1d0f'; g.fill(); }
    else if (c.mark === 'starPaint') star(nx - 2, py + 2, 7.5);
    else if (c.mark === 'heartPaint') RJ.cel(g, [[nx - 1, py + 9, 1], [nx - 8, py + 2], [nx - 5, py - 3], [nx - 1, py - 0.5], [nx + 3, py - 3], [nx + 6, py + 2]], mc, { shadow: false, line: LINE.fine + 0.2, lineColor: ink, tension: 0.6 });
    else if (c.mark === 'glitter') { [[nx - 4, py + 2, 4.2], [nx + 3, py + 7, 2.8], [nx - 9, py + 8, 2.4], [fx + 3, py + 2, 3.8], [fx - 3, py + 7, 2.6]].forEach((s) => tk.sparkle(g, s[0], s[1], s[2], { color: mc, glow: 0.3, thin: 0.25 })); }
    else if (c.mark === 'stripe') { [[0, 0], [5, 3]].forEach((o) => RJ.ink(g, [[fx - 9 + o[0], py - 4 + o[1]], [fx + 3 + o[0], py + 10 + o[1]]], { w: 3.4, color: mc, taper: 0.1, wobble: 0, pressure: 'flat', alpha: 0.95 })); }
    else if (c.mark === 'bolt') RJ.cel(g, [[fx + 6, py - 8, 1], [fx - 2, py + 1], [fx + 2, py + 1.5], [fx - 5, py + 11, 1], [fx + 8, py + 0.5], [fx + 3.6, py - 0.2]], mc, { shadow: false, line: LINE.fine + 0.2, lineColor: ink, tension: 0 });
    else if (c.mark === 'noteMark') tk.note(g, nx - 2, py + 3, 12, { kind: 'eighth', color: mc });
    else if (c.mark === 'scar') { RJ.ink(g, [[F.cx + 24, F.eyeY - 22], [F.cx + 13, F.eyeY + 18]], { w: 2.2, color: '#c26a62', taper: 0.4, wobble: 0.04 }); [[-9, 1], [-3, 10], [3, 19]].forEach((o) => RJ.ink(g, [[F.cx + 21 + o[0] * 0.4 - 3, F.eyeY - 14 + o[1] + 6], [F.cx + 22 + o[0] * 0.4 + 3, F.eyeY - 14 + o[1] + 9]], { w: 1.3, color: '#c26a62', taper: 0.3, wobble: 0 })); }
    else if (c.mark === 'bandaid') {
      g.save(); g.translate(fx - 6, py + 4); g.rotate(-0.5);
      RJ.cel(g, [[-11, -4.5], [11, -4.5], [11, 4.5], [-11, 4.5]], '#f4c7a0', { shadow: '#e0a67a', line: LINE.mid, depth: 2, tension: 0.2 });
      RJ.cel(g, [[-4, -4.5], [4, -4.5], [4, 4.5], [-4, 4.5]], '#fbe3cf', { shadow: false, line: LINE.fine, tension: 0 });
      g.restore();
    }
  };

  // ---- facial hair (clipped to the skull, drawn before the features so the mouth stays on top) ----
  FACE.facialHair = function (K) {
    const st = K.c.facial;
    if (st === 'none') return null;
    const F = K.fg, T = K.TT, H = { base: K.facialColor, sh: col.shade(K.facialColor, 0.04), hi: col.tint(K.facialColor, 0.3) }, cx = F.cx, my = F.mouthY;
    const cel = (g, pts, o) => RJ.cel(g, pts, H.base, Object.assign({ shadow: H.sh, line: LINE.main, depth: 4, hi: H.hi, hiW: 1.4, tension: 0.8, weightVar: 0.3 }, o));
    const stache = (g, big) => cel(g, [[cx - 22, my - 4], [cx - 12, my - 12 - (big ? 2 : 0)], [cx, my - 8], [cx + 12, my - 12 - (big ? 2 : 0)], [cx + 22, my - 4], [cx + 16, my + 1], [cx + 8, my - 3.5], [cx, my - 4], [cx - 8, my - 3.5], [cx - 16, my + 1]], { depth: 3 });
    const muzzle = (g) => { g.save(); g.fillStyle = K.skin; g.beginPath(); g.ellipse(cx, my - 1, 15, 8.5, 0, 0, TAU); g.fill(); g.restore(); };
    const jaw = [[-48, 6], [-46, 22], [-38, 41], [-24, 51.5], [-9, 56.4], [9, 60.4], [27, 55.2], [42, 43], [53.5, 28], [58, 12]];
    const inner = [[58, 8], [52, 18], [44, 29], [32, 34], [20, 32], [9, 29], [-3, 31], [-14, 33], [-30, 33], [-42, 26], [-47, 8]];
    return (g) => {
      if (st === 'stubble') {
        g.save(); g.globalAlpha = 0.3; g.fillStyle = H.base; g.beginPath(); tk.trace(g, jaw.concat(inner)); g.fill(); g.globalAlpha = 1;
        const t = []; for (let i = 0; i < 42; i++) { const x = -42 + (i * 37) % 96, y = 24 + ((i * 29) % 34); t.push([x, y, x + 1.5, y + 2.4]); }
        RJ.hatch(g, t, { w: 0.9, color: H.base, alpha: 0.7 }); g.restore();
      } else if (st === 'moustache') stache(g, false);
      else if (st === 'curly') { stache(g, true); [[-1, 0], [1, 1]].forEach((s) => lockCurl(g, H, cx + s[0] * 21, my - 4, s[0])); }
      else if (st === 'goatee') { cel(g, [[cx - 11, my + 6], [cx + 11, my + 6], [cx + 12, my + 22], [cx + 4, my + 28], [cx - 4, my + 28], [cx - 12, my + 22]], { depth: 3 }); muzzle(g); stache(g, false); }
      else if (st === 'soul') cel(g, [[cx - 5, my + 7], [cx + 5, my + 7], [cx + 4.5, my + 14], [cx - 4.5, my + 14]], { depth: 1.5, tension: 0.6 });
      else if (st === 'beard' || st === 'long') {
        const ext = st === 'long' ? [[40, 70], [20, 110], [9, 128], [-4, 110], [-26, 74]] : [];
        const outer = [[-50, 4], [-50, 22], [-40, 45], [-24, 58], [-9, 63], [9, 67], [27, 61], [42, 49], [55, 30], [60, 10]];
        const pts = st === 'long' ? [[-50, 4], [-52, 24], [-46, 52], [-28, 82], [-8, 118], [9, 134], [24, 116], [42, 80], [56, 46], [60, 10]].concat(inner) : outer.concat(inner);
        cel(g, pts.map((p) => p.slice()), { depth: 6 });
        muzzle(g); stache(g, false);
      } else if (st === 'chops') { cel(g, [[-50, -6], [-44, -6], [-40, 18], [-36, 38], [-46, 40], [-52, 24]], { depth: 3 }); cel(g, [[58, -4], [52, -4], [49, 18], [46, 36], [56, 36], [60, 20]], { depth: 3 }); }
    };
  };
  function lockCurl(g, H, x, y, dir) {
    RJ.lock(g, [[x, y], [x + dir * 7, y + 1], [x + dir * 12, y - 4], [x + dir * 10, y - 9]], H.base, { wMax: 5, w0: 5, w1: 0.5, tipPow: 1, shadow: H.sh, line: LINE.mid, gloss: false, strands: 0 });
  }

  // ---- glasses and eye patch (over the hair) ----
  FACE.glasses = function (g, K) {
    const st = K.c.glasses;
    if (st === 'none') return;
    const F = K.fg, fc = K.c.glC1, lc = K.c.glC2, n = F.near, f = F.far, ey = F.eyeY;
    const rr = Math.max(n.w, n.h) / 2 + 5, rf = rr * 0.9;
    const lens = (draw, x, y, r, tintA) => {
      g.save(); g.beginPath(); draw(g, x, y, r); g.clip(); g.fillStyle = lc; g.globalAlpha = tintA; g.fillRect(x - r * 1.6, y - r * 1.6, r * 3.2, r * 3.2); g.globalAlpha = 0.55; g.strokeStyle = '#fff'; g.lineWidth = 2.2; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - r * 0.55, y - r * 0.1); g.lineTo(x - r * 0.1, y - r * 0.6); g.stroke(); g.restore();
    };
    const frame = (draw, x, y, r, w) => { g.save(); g.lineJoin = 'round'; g.beginPath(); draw(g, x, y, r); g.lineWidth = w + 2.2; g.strokeStyle = C.ink; g.stroke(); g.lineWidth = w; g.strokeStyle = fc; g.stroke(); g.restore(); };
    const circle = (gg, x, y, r) => gg.arc(x, y, r, 0, TAU);
    const square = (gg, x, y, r) => { const h = r * 0.9, w = r * 1.05, q = 5; gg.moveTo(x - w + q, y - h); gg.lineTo(x + w - q, y - h); gg.quadraticCurveTo(x + w, y - h, x + w, y - h + q); gg.lineTo(x + w, y + h - q); gg.quadraticCurveTo(x + w, y + h, x + w - q, y + h); gg.lineTo(x - w + q, y + h); gg.quadraticCurveTo(x - w, y + h, x - w, y + h - q); gg.lineTo(x - w, y - h + q); gg.quadraticCurveTo(x - w, y - h, x - w + q, y - h); gg.closePath(); };
    const cat = (gg, x, y, r) => { gg.moveTo(x - r, y - r * 0.5); gg.quadraticCurveTo(x - r * 0.2, y - r * 0.9, x + r * 0.7, y - r * 1.15); gg.lineTo(x + r * 1.05, y - r * 0.95); gg.quadraticCurveTo(x + r * 1.1, y + r * 0.5, x + r * 0.1, y + r * 0.85); gg.quadraticCurveTo(x - r * 0.9, y + r * 0.9, x - r, y - r * 0.5); gg.closePath(); };
    const avi = (gg, x, y, r) => { gg.moveTo(x - r * 1.05, y - r * 0.8); gg.quadraticCurveTo(x, y - r * 1.05, x + r * 1.05, y - r * 0.8); gg.quadraticCurveTo(x + r * 1.0, y + r * 0.95, x + r * 0.1, y + r * 1.0); gg.quadraticCurveTo(x - r * 1.05, y + r * 0.7, x - r * 1.05, y - r * 0.8); gg.closePath(); };
    const starF = (gg, x, y, r) => { for (let i = 0; i < 10; i++) { const a = -PI / 2 + i * PI / 5, q = i % 2 ? r * 0.55 : r * 1.12; (i ? gg.lineTo : gg.moveTo).call(gg, x + Math.cos(a) * q, y + Math.sin(a) * q); } gg.closePath(); };
    const heartF = (gg, x, y, r) => { gg.moveTo(x, y + r * 0.95); gg.bezierCurveTo(x - r * 1.5, y + r * 0.1, x - r * 0.9, y - r * 1.1, x, y - r * 0.35); gg.bezierCurveTo(x + r * 0.9, y - r * 1.1, x + r * 1.5, y + r * 0.1, x, y + r * 0.95); gg.closePath(); };
    const arm = () => { RJ.ink(g, [[n.x - rr + 1, ey - 2], [-52, ey - 1]], { w: 2.4, color: fc, taper: 0, wobble: 0, pressure: 'flat' }); };
    const pair = (shape, fw, tint) => {
      const bx0 = n.x + rr * 0.9, bx1 = f.x - rf * 0.9;
      RJ.ink(g, [[bx0, ey - 3], [(bx0 + bx1) / 2, ey - 6], [bx1, ey - 3]], { w: 2.6, color: C.ink, taper: 0, wobble: 0, pressure: 'flat' });
      RJ.ink(g, [[bx0, ey - 3], [(bx0 + bx1) / 2, ey - 6], [bx1, ey - 3]], { w: 1.4, color: fc, taper: 0, wobble: 0, pressure: 'flat' });
      arm();
      lens(shape, n.x, ey, rr, tint); lens(shape, f.x, ey, rf, tint);
      frame(shape, n.x, ey, rr, fw); frame(shape, f.x, ey, rf, fw);
    };
    if (st === 'round') pair(circle, 2.8, 0.22);
    else if (st === 'square') pair(square, 3, 0.22);
    else if (st === 'cateye') pair(cat, 3, 0.2);
    else if (st === 'aviator') pair(avi, 2, 0.88);
    else if (st === 'starShade') pair(starF, 2.4, 0.92);
    else if (st === 'heartShade') pair(heartF, 2.4, 0.92);
    else if (st === 'visor') {
      const x0 = n.x - rr - 2, x1 = f.x + rf + 2, hh = Math.max(n.h, 20) / 2 + 5;
      const shape = (gg) => { const q = 12; gg.moveTo(x0 + q, ey - hh); gg.lineTo(x1 - q, ey - hh); gg.quadraticCurveTo(x1, ey - hh, x1, ey); gg.quadraticCurveTo(x1 - 2, ey + hh, x1 - q * 1.5, ey + hh); gg.lineTo(x0 + q * 1.5, ey + hh); gg.quadraticCurveTo(x0 + 2, ey + hh, x0, ey); gg.quadraticCurveTo(x0, ey - hh, x0 + q, ey - hh); gg.closePath(); };
      arm(); lens(shape, (x0 + x1) / 2, ey, (x1 - x0) / 2, 0.9); frame(shape, 0, 0, 1, 2.8);
    } else if (st === 'monocle') { lens(circle, f.x, ey, rf, 0.18); frame(circle, f.x, ey, rf, 2.8); RJ.ink(g, [[f.x + rf * 0.6, ey + rf * 0.85], [f.x + rf * 0.9 + 3, ey + rf + 18], [f.x + 4, ey + rf + 38]], { w: 1.3, color: fc, taper: 0, wobble: 0 }); }
    else if (st === 'patch') {
      RJ.ink(g, [[n.x - rr * 0.5, ey - 14], [-30, -50], [-4, -58]], { w: 1.8, color: C.ink, taper: 0, wobble: 0 });
      RJ.ink(g, [[n.x + rr * 0.9, ey + 6], [f.x, ey - 28], [48, -34]], { w: 1.8, color: C.ink, taper: 0, wobble: 0 });
      RJ.cel(g, tk.ellipsePts(n.x, ey, rr * 0.95, rr * 0.85, 14, -0.2), fc, { shadow: col.shade(fc, 0.1), line: LINE.main, depth: 3, hi: col.tint(fc, 0.3), hiW: 1.4 });
    }
  };
})();
