'use strict';
// owned by the cast_choir agent (see WORLD_DESIGN.md)
//
// THE STATIC CHOIR (crew id 'static_choir', colour cyan #3fd8e8 + slate grey): a robed hush-cult that mutes people. Whispery, eerie but cute.
// Five ART.rj figures built on js/hv/art_cast_kit.js (RJ.rig), drawn in the Hocus Vocus chibi-candy style: warm brown outline, one hard cel
// shadow, a thin highlight, huge flat glossy eyes with catchlights, blush, idle breathing, blinking and cloth sway.
//
//   npc_choir_hush     The Hush (boss): tall floating figure, a peaked hood that flops back with a glowing cyan bead, a face of soft grey TV
//                      static with two glowing eyes, a scalloped capelet, a long charcoal robe with wispy hem points, the mute-speaker medallion.
//   npc_choir_crackle  Cantor Crackle (enforcer): static-charged silver spiky hair with cyan tips, a tall stand-up lightning collar, a slate robe
//                      with a cyan zigzag band and hem, sparks crackling around him, a tuning-fork staff taller than he is.
//   npc_choir_fuzz     Choirboy Fuzz (grunt): a little kid with a huge fuzzy cloud of static-grey hair, a too-big robe pooling on the floor and
//                      swallowing his hands, a white scalloped surplice collar with a cyan bow, an open cyan song book.
//   npc_choir_whisper  Sister Whisper (grunt): a long pale-grey veil with a cyan circlet and a tiny tuning-fork charm, finger to her lips ('shh'),
//                      sleepy lashes, a bell-shaped blue-grey robe, drifting 'shh' letters.
//   npc_choir_reverb   Brother Reverb (merchant / fixer): round and kind, warm brown skin, silver side tufts and a round silver beard, a big rolled
//                      cowl, a rope belt with a pouch of tuning forks (his wares), echo rings rippling round him and an echoing 'HA ha ha'.
//
// Every figure: spec.layers (backHair torso mid head over top fx), a face spec (The Hush draws its own static face), pose tables for idle sing
// attack hurt cheer windup strike block down walk plus 'bust', spec.life, spec.bounds, spec.tip. Custom pose keys (staffAng, staffUp, staffDown,
// staffBoth, book, bookTilt, glitch, hover) are read by this file's layers only. Custom fx names (crackle zap zapburst buzz hum bonk shh hushwave
// echo haha echoblast static staticburst) are drawn by each figure's fx layer; the kit's own (rings mute stars sparkles) are used as is.
// Everything is a pure function of the arguments (t drives every loop; the static noise is a hash of t, no random call, no clock).
(function () {
  if (typeof ART === 'undefined' || !ART.rj || !ART.tk) return;
  const RJ = ART.rj, tk = ART.tk, mat = tk.mat, C = RJ.C, LINE = RJ.LINE;
  const TAU = Math.PI * 2, PI = Math.PI;
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : (d === undefined ? 0 : d));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const fr = (v) => v - Math.floor(v);
  const hsh = (a, b, c) => fr(Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453);

  RJ.ACCENT.static_choir = RJ.ACCENT.static_choir || { main: '#3fd8e8', dark: '#1597b0', light: '#bff4fa', glow: '#8ff0ff' };

  // ---- the crew palette ----
  const K = {
    cyan: '#3fd8e8', cyanDk: '#1597b0', cyanLt: '#bff4fa', cyanGlow: '#8ff0ff', cyanSh: '#22b3c9',
    silver: '#cdd3e0', silverSh: '#9aa3b8', silverHi: '#eef1f7',
    white: '#f6f8fc', whiteSh: '#d0d6e4',
    sock: '#3c4354', sockSh: '#2b3040',
    slipper: '#5b6478', slipperSh: '#434a5c',
  };

  // ======================================================================================================================================
  // shared helpers
  // ======================================================================================================================================
  // from a layer's space (matrix M) back to figure space
  function toFig(g, M) { const i = mat.inv(M); g.transform(i[0], i[1], i[2], i[3], i[4], i[5]); }
  // the wrist of an arm solved the way the rig solves it
  function wristOf(S, front) {
    const P = S.P, pt = S.pt, ar = S.spec.arm || {}, l = ar.l || [23, 21];
    const sh = front ? pt.shF : pt.shB, tg = front ? pt.hand : [pt.shB[0] + P.bHand[0], pt.shB[1] + P.bHand[1]];
    const r = RJ.ik2(sh, tg, l[0], l[1], front ? P.fBend : P.bBend);
    return { w: r.w, e: r.e, ang: Math.atan2(r.w[1] - r.e[1], r.w[0] - r.e[0]) };
  }
  function redrawHand(g, S, front, kind, rot) {
    const P = S.P, k = wristOf(S, front), hs = (S.spec.arm && S.spec.arm.hand) || {};
    RJ.hand(g, kind || (front ? P.fKind : P.bKind), k.w[0], k.w[1], k.ang + (rot === undefined ? (front ? P.fRot : P.bRot) : rot), Object.assign({ spread: front ? P.fSpread : P.bSpread }, hs));
  }
  // the ground (figure y = 0) as a function of x in torso rest space, so a robe hem can pool on the floor when the figure sits or kneels
  function groundFn(S) {
    const iv = mat.inv(S.M.torso), a = mat.pt(iv, -150, 0), b = mat.pt(iv, 150, 0), k = (b[1] - a[1]) / ((b[0] - a[0]) || 1);
    return (x) => a[1] + (x - a[0]) * k;
  }
  // skull, the hard skin shade, an optional cast shadow, then the face and the outline (hair goes on top, drawn by the caller)
  function headBase(g, S, o) {
    const skull = o.skull || RJ.SKULL;
    g.save();
    g.beginPath(); tk.trace(g, skull); g.clip();
    g.fillStyle = o.skin || C.skin; g.fillRect(-130, -130, 260, 260);
    g.fillStyle = o.shade || C.skinSh;
    g.beginPath(); g.rect(-130, -130, 260, 260); tk.trace(g, skull, RJ.lx(4.5), -8); g.fill('evenodd');
    if (o.cast) { g.beginPath(); tk.trace(g, o.cast, 0, o.castDy === undefined ? 7 : o.castDy); g.fill(); }
    if (o.under) o.under(g);
    g.restore();
    RJ.drawFace(g, S);
    RJ.ink(g, skull, { closed: true, w: LINE.main + 0.2, color: C.ink, align: 0.2, weightVar: 0.5 });
  }
  // A robe in torso rest space. o: {top, neck, sh, waistY, waist, hemY, hem, n, wave(u, i) -> dy, sharp (hem points sharp), swayK, stepK, color,
  // shade, hi, trim (colour), trimW, trimDy, band: fn(gg) (decor drawn inside), folds: [[x0, y0, x1, y1]...] (fold lines toward the hem), belly}
  // Returns {pts, hem} (the hem points after the ground clamp) for anything that follows the hem.
  function robe(g, S, o) {
    const P = S.P, G = groundFn(S), n = o.n || 6;
    const drift = S.sway * num(o.swayK, 3) + num(P.stepPhase) * num(o.stepK, 3) - num(P.lean) * 30;
    const hem = [];
    let pool = 0;
    for (let i = 0; i <= n; i++) {
      const u = i / n, k = 0.35 + 0.65 * Math.abs(u - 0.5) * 2;
      let x = lerp(-o.hem, o.hem, u) + drift * k, y = o.hemY + (o.wave ? o.wave(u, i, S) : 0);
      const gy = G(x) - 1.5;
      if (y > gy) { pool = Math.max(pool, y - gy); y = gy; }
      hem.push([x, y, o.sharp && (i % 2 === 0) ? 1 : 0]);
    }
    if (pool > 0) { const sp = Math.min(pool, 40) * 0.45; hem.forEach((p) => { p[0] *= 1 + sp / Math.max(20, o.hem); }); }
    hem[0][2] = 1; hem[n][2] = 1;
    const by = o.belly || 0;
    const pts = [[-o.neck, o.top], [-o.sh * 0.72, o.top + 3], [-o.sh, o.top + 15], [-o.waist - by, o.waistY]].concat(hem.map((p) => [p[0], p[1], p[2]]))
      .concat([[o.waist + by, o.waistY], [o.sh, o.top + 15], [o.sh * 0.72, o.top + 3], [o.neck, o.top]]);
    const trimW = num(o.trimW, 4);
    RJ.cel(g, pts, o.color, { shadow: o.shade, line: LINE.main, depth: num(o.depth, 9), hi: o.hi || false, hiW: 1.6, hiAlpha: 0.7, tension: 0.55, decor: (gg) => {
      if (o.band) o.band(gg, hem);
      if (o.folds) RJ.hatch(gg, o.folds.map((f) => [[f[0], f[1]], [lerp(f[0], f[2], 0.5) + drift * 0.3, lerp(f[1], f[3], 0.5)], [f[2] + drift * 0.6, Math.min(f[3], hem[0][1])]]), { color: o.shade, w: 1.6, alpha: 0.9 });
      if (o.trim) {
        const hl = hem.map((p) => [p[0], p[1] - num(o.trimDy, 0)]);
        RJ.ink(gg, hl, { w: trimW * 2, color: o.trim, taper: 0, wobble: 0, weightVar: 0 });
        RJ.ink(gg, hl.map((p) => [p[0], p[1] - trimW]), { w: 1.2, color: C.ink, taper: 0, wobble: 0, weightVar: 0, alpha: 0.85 });
      }
    } });
    return { pts, hem };
  }
  // a little tuning fork (a charm, a pouch ware): base at (x, y), pointing up, h tall
  function miniFork(g, x, y, h, col, rot) {
    g.save(); g.translate(x, y); g.rotate(rot || 0);
    const w = h * 0.34;
    RJ.blob(g, [{ a: [0, 0], b: [0, -h * 0.45], w: Math.max(1.6, h * 0.13) }, { e: [0, -h * 0.47, w * 0.62, h * 0.12] }, { a: [-w * 0.5, -h * 0.5], b: [-w * 0.5, -h], w: Math.max(1.4, h * 0.12) }, { a: [w * 0.5, -h * 0.5], b: [w * 0.5, -h], w: Math.max(1.4, h * 0.12) }],
      { fill: col || K.silver, shade: K.silverSh, L: LINE.fine + 0.2, rot: rot || 0 });
    g.restore();
  }
  // grey TV static inside the current clip: cells flicker 12 times a second, plus a soft rolling scan band. o: {base, mid, light, cell, glitch}
  function tvStatic(g, x0, y0, w, h, t, o) {
    o = o || {};
    const cell = o.cell || 4, m = tk.motion(), fps = Math.floor(num(t) * 12 * (m < 1 ? 0.25 : 1)), cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
    g.fillStyle = o.base || '#7c8496'; g.fillRect(x0, y0, w, h);
    const mid = new Path2D(), lit = new Path2D(), dk = new Path2D();
    for (let j = 0; j < rows; j++) {
      const shift = o.glitch && hsh(j, 3, fps) < o.glitch * 0.25 ? Math.round((hsh(j, 9, fps) - 0.5) * 4) * cell : 0;
      for (let i = 0; i < cols; i++) {
        const v = hsh(i, j, fps), x = x0 + i * cell + shift, y = y0 + j * cell;
        if (v > 0.82) lit.rect(x, y, cell, cell); else if (v > 0.5) mid.rect(x, y, cell, cell); else if (v < 0.12) dk.rect(x, y, cell, cell);
      }
    }
    g.fillStyle = o.mid || '#9aa2b3'; g.fill(mid);
    g.fillStyle = o.light || '#c9cfdb'; g.fill(lit);
    g.fillStyle = o.dark || '#5f6677'; g.fill(dk);
    const band = y0 + fr(num(t) * 0.35 * m) * (h + 20) - 10;
    g.fillStyle = 'rgba(235,250,255,0.28)'; g.fillRect(x0, band, w, 7);
    g.fillStyle = 'rgba(235,250,255,0.14)'; g.fillRect(x0, band + 9, w, 3);
  }
  // a glowing cyan line (sound, sparks): a soft wide pass, then the ink, then the cyan, then a white core
  function glowLine(g, pts, w, col, a) {
    g.save(); g.globalAlpha *= a === undefined ? 1 : a;
    RJ.ink(g, pts, { w: w + 2.6, color: C.ink, taper: 0.3, wobble: 0, weightVar: 0 });
    RJ.ink(g, pts, { w: w, color: col || K.cyan, taper: 0.3, wobble: 0, weightVar: 0 });
    RJ.ink(g, pts, { w: Math.max(0.6, w * 0.35), color: '#ffffff', taper: 0.4, wobble: 0, weightVar: 0, alpha: 0.85 });
    g.restore();
  }
  // a small zigzag spark at (x, y), size s, angle a
  function spark(g, x, y, s, a, alpha) {
    const c = Math.cos(a), sn = Math.sin(a), P = (u, v) => [x + (u * c - v * sn) * s, y + (u * sn + v * c) * s];
    glowLine(g, [P(-1, 0), P(-0.3, -0.45), P(0.1, 0.35), P(1, -0.1)], 2.2, K.cyan, alpha);
  }
  // text that stays readable on a flipped figure (the frame mirrors it otherwise)
  function word(g, s, x, y, size, rot, alpha, col) {
    g.save(); g.globalAlpha *= clamp(alpha, 0, 1); g.translate(x, y); if (RJ._flip) g.scale(-1, 1); g.rotate(rot || 0);
    g.font = '800 ' + size.toFixed(1) + "px 'Baloo 2', 'Arial Rounded MT Bold', sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = Math.max(2, size * 0.24); g.strokeStyle = C.ink; g.strokeText(s, 0, 0);
    g.fillStyle = col || K.cyan; g.fillText(s, 0, 0);
    g.restore();
  }
  // the crew's shared effects (figure space). Each figure's fx layer forwards the names it does not handle itself here.
  function choirFx(g, S, name) {
    const t = S.t, pt = S.pt, m = tk.motion();
    if (name === 'hum') { RJ.fx.notes(g, pt.mouth[0] + 14, pt.mouth[1] - 26, t, K.cyan, 3); return; }
    if (name === 'shh') {
      for (let i = 0; i < 3; i++) {
        const u = fr(t * 0.45 * m + i / 3), a = Math.sin(PI * u);
        word(g, i === 1 ? 'shh' : 'sh', pt.mouth[0] + 30 + u * 34 + i * 6, pt.mouth[1] - 14 - u * 46 + Math.sin(u * 5 + i) * 4, 13 + i * 2 - u * 2, -0.15 + 0.1 * i, a * 0.95, i === 1 ? K.cyanLt : K.cyan);
      }
      return;
    }
    if (name === 'hushwave') {
      const hp = wristOf(S, true).w;
      RJ.fx.arcs(g, hp[0] + 16, hp[1], 0, t, K.cyan, 3);
      const u = fr(t * 0.9 * m);
      g.save(); g.globalAlpha *= Math.sin(PI * u); RJ.fx.mute(g, hp[0] + 70 + u * 40, hp[1] - 14 - u * 8, t); g.restore();
      return;
    }
    if (name === 'echo') { echoRings(g, S, false); return; }
  }
  // echo rings round the waist, back halves (behind the body, from backHair) and front halves (fx)
  function echoRings(g, S, back) {
    const t = S.t, m = tk.motion(), c = mat.pt(S.M.torso, 0, -78);
    g.save(); g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const u = fr(t * 0.32 * m + i / 3), rx = 58 + u * 62, ry = rx * 0.24, a = Math.sin(PI * u) * 0.8;
      const a0 = back ? PI : 0, a1 = back ? TAU : PI;
      g.globalAlpha = a * (back ? 0.6 : 1);
      g.strokeStyle = C.ink; g.lineWidth = 4.2 - u * 1.5; g.beginPath(); g.ellipse(c[0], c[1] + 6 - u * 8, rx, ry, 0, a0, a1); g.stroke();
      g.strokeStyle = i % 2 ? K.cyanLt : K.cyan; g.lineWidth = 2.4 - u * 0.9; g.beginPath(); g.ellipse(c[0], c[1] + 6 - u * 8, rx, ry, 0, a0, a1); g.stroke();
    }
    g.restore();
  }
  // The portrait framing of the Hocus Vocus crew (art_cast.js crewRig): the kit works out the crop offset before it shrinks the zoom to fit
  // spec.bust.face, so in a tall box the head can end up low with an empty band above it. This wrapper takes the offset AFTER the shrink (same
  // rules: cover the rect, shrink until the face fits with 10% to spare, centre on the face in a short box, keep the face inside) and hands
  // the kit an equivalent plain rect.
  function choirRig(spec) {
    const impl = RJ.rig(spec), kitBust = impl.bust;
    impl.bust = function (ctx, w, h, o) {
      const bs = spec.bust, R = bs && bs.rect, F = bs && bs.face;
      if (!(typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0 && w < 1e5 && h < 1e5 && R && F)) return kitBust.call(impl, ctx, w, h, o);
      const rw = R[2] - R[0], rh = R[3] - R[1], fw = F[2] - F[0], fh = F[3] - F[1];
      const k = Math.min(Math.max(w / rw, h / rh), Math.min(w / fw, h / fh) / 1.1);
      const fcx = (F[0] + F[2]) / 2, fcy = (F[1] + F[3]) / 2, hx = fw / 2 * k * 1.05, hy = fh / 2 * k * 1.05;
      const x0 = hx - fcx * k, x1 = w - hx - fcx * k, y0 = hy - fcy * k, y1 = h - hy - fcy * k;
      let tx = w / 2 - (R[0] + R[2]) / 2 * k, ty = -R[1] * k;
      tx = clamp(tx, Math.min(x0, x1), Math.max(x0, x1));
      if (h < rh * k - 0.5) ty = h * 0.46 - fcy * k;
      ty = clamp(ty, Math.min(y0, y1), Math.max(y0, y1));
      const kept = spec.bust;
      spec.bust = Object.assign({}, bs, { rect: [-tx / k, -ty / k, (w - tx) / k, (h - ty) / k], face: undefined });
      try { return kitBust.call(impl, ctx, w, h, o); } finally { spec.bust = kept; }
    };
    return impl;
  }
  const SHOE = { color: K.slipper, sole: '#8b93a6', shade: K.slipperSh, hi: '#7c869c', k: 1.05 };

  // ======================================================================================================================================
  // CANTOR CRACKLE (enforcer): static-charged spiky silver hair, a stand-up lightning collar, sparks, the tuning-fork staff
  // ======================================================================================================================================
  const CR = {
    robe: '#677186', robeSh: '#4f586b', robeHi: '#8892a8', dk: '#454c5e',
    hair: '#e9edf5', hairSh: '#b8c1d4', hairHi: '#ffffff',
    collar: '#596276', collarSh: '#434b5d', lining: '#2f8394',
    brow: '#8a93a8', iris: ['#0d6278', '#38cfe2'],
  };
  const CR_SKULL = RJ.skullPts({ w: 1.0, h: 1.0, chin: 1 });
  const CR_HAIR = [
    [-56, 26], [-64, 2, 1], [-66, -14], [-86, -30, 1], [-66, -42], [-82, -72, 1], [-54, -64], [-50, -100, 1], [-30, -74], [-12, -114, 1], [2, -80], [24, -110, 1],
    [30, -76], [56, -92, 1], [50, -60], [76, -56, 1], [58, -38], [64, -22, 1],
    [50, -30], [44, -16, 1], [36, -32], [22, -22, 1], [14, -38], [0, -26, 1], [-8, -40], [-22, -30, 1], [-30, -42], [-42, -30], [-46, -8], [-48, 14],
  ];
  const CR_TIPS = [[-86, -30], [-82, -72], [-50, -100], [-12, -114], [24, -110], [56, -92], [76, -56]];
  function crHair(g, S) {
    RJ.cel(g, CR_HAIR, CR.hair, { shadow: CR.hairSh, line: LINE.main + 0.2, depth: 7, tension: 0.55, hi: CR.hairHi, hiW: 1.8, decor: (gg) => {
      CR_TIPS.forEach((p, i) => { gg.beginPath(); gg.arc(p[0], p[1], 15 + (i % 2) * 3, 0, TAU); gg.fillStyle = K.cyan; gg.fill(); gg.beginPath(); gg.arc(p[0] + RJ.lx(3), p[1] - 3, 7, 0, TAU); gg.fillStyle = K.cyanLt; gg.fill(); });
      RJ.hatch(gg, [[[-40, -40], [-52, -60], [-60, -64]], [[-22, -46], [-34, -72], [-46, -86]], [[-2, -44], [-8, -76], [-11, -96]], [[16, -46], [20, -76], [23, -96]], [[34, -42], [44, -66], [52, -80]], [[48, -40], [60, -50], [68, -54]]], { color: CR.hairSh, w: 1.5, alpha: 0.95 });
    } });
  }
  // the stand-up collar: two stiff wings flaring out past the head with a lightning-zigzag top edge (we see their dark teal lining)
  const CR_COLLAR = [[-30, -146], [-56, -156], [-80, -174], [-98, -202, 1], [-80, -194], [-78, -222, 1], [-62, -200], [-50, -216, 1], [-40, -182], [40, -182], [52, -216, 1], [64, -200], [80, -222, 1], [82, -194], [100, -202, 1], [82, -174], [58, -156], [32, -146]];
  const CR_LINING = [[-30, -150], [-54, -161], [-74, -178], [-86, -198], [-76, -192], [-72, -206], [-60, -194], [-52, -204], [-42, -180], [42, -180], [54, -204], [62, -194], [74, -206], [78, -192], [88, -198], [76, -178], [56, -161], [32, -150]];
  function crTorso(g, S) {
    RJ.cel(g, CR_COLLAR, CR.collar, { shadow: CR.collarSh, line: LINE.main, depth: 5, tension: 0.25, decor: (gg) => {
      RJ.fillPts(gg, CR_LINING, CR.lining, 1);
      RJ.hatch(gg, [[[-60, -166], [-70, -186]], [[-44, -160], [-54, -184]], [[60, -166], [70, -186]], [[44, -160], [54, -184]]], { color: '#24485a', w: 1.6 });
      RJ.ink(gg, [[-98, -202], [-80, -194], [-78, -222], [-62, -200], [-50, -216], [-40, -182]], { w: 6, color: K.cyan, taper: 0, wobble: 0, weightVar: 0 });
      RJ.ink(gg, [[40, -182], [52, -216], [64, -200], [80, -222], [82, -194], [100, -202]], { w: 6, color: K.cyan, taper: 0, wobble: 0, weightVar: 0 });
    } });
    RJ.neck(g, 2, -158, { w: 22, h: 16 });
    robe(g, S, { top: -152, neck: 15, sh: 40, waistY: -96, waist: 38, hemY: -9, hem: 50, n: 8, color: CR.robe, shade: CR.robeSh, hi: CR.robeHi, trim: K.cyan, trimW: 4.5,
      wave: (u, i) => (i % 2 ? -7 : 0), sharp: true, swayK: 3,
      folds: [[-20, -90, -30, -12], [14, -88, 24, -14], [-4, -70, -6, -14]],
      band: (gg) => {                                                      // the zigzag lightning band down the front
        const z = [[4, -150], [10, -132], [0, -116], [10, -98], [0, -80], [10, -62], [0, -44], [10, -26], [3, -6]];
        RJ.ink(gg, z, { w: 9, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
        RJ.ink(gg, z, { w: 6, color: K.cyan, taper: 0, wobble: 0, weightVar: 0 });
        RJ.ink(gg, z.map((p) => [p[0] + 1, p[1] - 1]), { w: 1.6, color: K.cyanLt, taper: 0, wobble: 0, weightVar: 0 });
      } });
    // rope belt and the fork emblem on the chest
    RJ.ink(g, [[-38, -96], [-12, -92], [14, -92], [38, -96]], { w: 6.5, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, [[-38, -96], [-12, -92], [14, -92], [38, -96]], { w: 4, color: CR.dk, taper: 0, wobble: 0, weightVar: 0 });
    miniFork(g, -18, -112, 20, K.cyan, -0.1);
  }
  function crHead(g, S) {
    headBase(g, S, { skull: CR_SKULL, cast: [[-50, -30], [-20, -44], [10, -46], [40, -40], [58, -26], [40, -22], [10, -30], [-20, -28]], castDy: 4 });
    crHair(g, S);
    RJ.ear(g, -53, 24, { r: 13.5, side: -1 });
  }
  // the staff: a silver shaft through the fist, the fork at the top end (figure space, drawn from the head layer, before the front arm grips it)
  function crStaffGeo(S) {
    const P = S.P, k = wristOf(S, true), a = num(P.staffAng, -PI / 2), grip = [k.w[0] + Math.cos(k.ang) * 6.5, k.w[1] + Math.sin(k.ang) * 6.5];
    return { grip, a, up: num(P.staffUp, 150), down: num(P.staffDown, 70) };
  }
  function crStaff(g, S) {
    const G = crStaffGeo(S), P = S.P, t = S.t;
    g.save(); g.translate(G.grip[0], G.grip[1]); g.rotate(G.a);
    const up = G.up, dn = G.down;
    // shaft, a cyan band under the fork, a round pommel
    RJ.cel(g, [[-dn, -3.6], [up, -3.6], [up, 3.6], [-dn, 3.6]], K.silver, { shadow: K.silverSh, line: LINE.main, tension: 0, depth: 2.6, rim: K.silverHi, rimW: 1.2, rimSide: 'light' });
    [[-8, 10], [up - 14, 6]].forEach((b) => RJ.cel(g, [[b[0], -5], [b[0] + b[1], -5], [b[0] + b[1], 5], [b[0], 5]], b[0] < 0 ? CR.dk : K.cyan, { shadow: b[0] < 0 ? '#33394a' : K.cyanSh, line: LINE.fine + 0.3, tension: 0, depth: 1.5 }));
    RJ.blob(g, [{ e: [-dn - 2, 0, 7, 7] }], { fill: K.cyan, shade: K.cyanSh, rot: G.a, L: LINE.main * 0.8 });
    // the fork: a knob, a U, two long tines with cyan-dipped ends
    const buzz = num(P.forkBuzz, 0), vib = buzz > 0 ? Math.sin(t * 70) * 1.2 * buzz * tk.motion() : 0;
    RJ.blob(g, [{ e: [up + 2, 0, 8, 8] }, { a: [up + 6, -10], b: [up + 6, 10], w: 7 }, { a: [up + 6, -10 - vib], b: [up + 44, -10.5 - vib], w: 6.4 }, { a: [up + 6, 10 + vib], b: [up + 44, 10.5 + vib], w: 6.4 }],
      { fill: K.silver, shade: K.silverSh, rot: G.a, L: LINE.main * 0.9 });
    RJ.blob(g, [{ a: [up + 36, -10.5 - vib], b: [up + 45, -10.5 - vib], w: 6.4 }, { a: [up + 36, 10.5 + vib], b: [up + 45, 10.5 + vib], w: 6.4 }], { fill: K.cyan, shade: K.cyanSh, rot: G.a, L: LINE.main * 0.8 });
    g.beginPath(); g.arc(up, -2.6, 2.2, 0, TAU); g.fillStyle = '#ffffff'; g.fill();
    if (buzz > 0) {                                                        // the hum: glow between the tines, little vibration ticks
      tk.glow(g, up + 30, 0, 26 + 6 * buzz, K.cyan, 0.35 * buzz + 0.15, false);
      for (let s = -1; s <= 1; s += 2) for (let i = 0; i < 2; i++) {
        const xx = up + 22 + i * 14, yy = s * (19 + 2 * Math.sin(t * 30 + i));
        RJ.ink(g, [[xx - 4, yy], [xx, yy + s * 3], [xx + 4, yy]], { w: 1.6, color: K.cyanDk, taper: 0.2, wobble: 0, weightVar: 0, alpha: 0.9 });
      }
    }
    g.restore();
  }
  function crTipPt(S) { const G = crStaffGeo(S); return [G.grip[0] + Math.cos(G.a) * (G.up + 46), G.grip[1] + Math.sin(G.a) * (G.up + 46)]; }
  function crFx(g, S, name) {
    const t = S.t, m = tk.motion();
    if (name === 'crackle') {                                              // three little sparks flickering round the robe and the hair
      const f = Math.floor(t * 7 * (m < 1 ? 0.3 : 1));
      for (let i = 0; i < 3; i++) {
        const v = hsh(i, 1, f), w = hsh(i, 2, f), on = hsh(i, 3, f) > 0.3;
        if (!on) continue;
        const p = i === 0 ? mat.pt(S.M.head, -70 + v * 140, -110 + w * 30) : mat.pt(S.M.torso, (v - 0.5) * 120, -130 + w * 110);
        spark(g, p[0], p[1], 7 + 4 * w, v * TAU, 0.9);
      }
      return;
    }
    if (name === 'buzz') return;                                           // drawn inside the staff (P.forkBuzz)
    if (name === 'zap' || name === 'zapburst') {
      const p = crTipPt(S), f = Math.floor(t * 14), len = name === 'zapburst' ? 120 : 90, x1 = p[0] + len, y1 = p[1] + 4 * Math.sin(t * 9);
      tk.glow(g, p[0], p[1], 34, K.cyan, 0.5, false);
      for (let k = 0; k < 2; k++) {
        const pts = [[p[0], p[1]]];
        for (let i = 1; i < 6; i++) pts.push([lerp(p[0], x1, i / 6), lerp(p[1], y1, i / 6) + (hsh(i, k, f) - 0.5) * 22]);
        pts.push([x1, y1]);
        glowLine(g, pts, k ? 2.2 : 3.6, k ? K.cyanLt : K.cyan, k ? 0.8 : 1);
      }
      if (name === 'zapburst') RJ.fx.burst(g, x1 + 8, y1, 18 + 8 * S.beat, K.cyan, K.cyanLt, t);
      return;
    }
    choirFx(g, S, name);
  }
  function crPoses() {
    const stern = { eyes: 'open', mouth: 'smirk', brow: 0.25 };
    const st = { mic: 'none', fKind: 'fist', fRot: 0 };
    return {
      idle: Object.assign({}, st, { fHand: [24, 46], fBend: -1, staffAng: -1.62, bHand: [-6, 52], bBend: 1, bKind: 'relaxed', bRot: 0.2, headRot: 0.03, fx: ['crackle'] }, stern),
      sing: Object.assign({}, st, { fHand: [24, 40], fBend: -1, staffAng: -1.52, forkBuzz: 1, bHand: [-34, -10], bBend: -1, bKind: 'open', bSpread: 1.2, bRot: -0.2, headRot: -0.08, eyes: 'half', mouth: 'sing', brow: -0.1, fx: ['hum', 'crackle'] }),
      attack: Object.assign({}, st, { fHand: [32, 2], fBend: 1, staffAng: -0.6, staffUp: 56, staffDown: 70, forkBuzz: 1, lean: 0.08, torsoRot: 0.05, headRot: 0.06, headDx: 2, bHand: [-30, 30], bBend: 1, bKind: 'fist',
        fFoot: [26, -12], bFoot: [-22, -12], eyes: 'determined', mouth: 'grit', brow: 0.5, look: [0.5, 0], fx: ['zap', 'crackle'] }),
      hurt: Object.assign({}, st, { fHand: [22, 40], fBend: -1, staffAng: -1.25, staffUp: 130, bHand: [-34, -8], bBend: -1, bKind: 'open', bSpread: 1.3, lean: -0.13, torsoRot: -0.08, headRot: -0.14, headDx: -3,
        fFoot: [10, -12], bFoot: [-18, -12], eyes: 'hurt', mouth: 'ow', brow: -0.7, sweat: 1, blush: 0.6, fx: ['stars'] }),
      cheer: Object.assign({}, st, { fHand: [16, -62], fBend: 1, staffAng: -1.45, staffUp: 94, staffDown: 110, forkBuzz: 0.6, bHand: [-40, -40], bBend: -1, bKind: 'fist', bRot: -0.2, eyes: 'happy', mouth: 'grin', brow: -0.2, headRot: 0.04, fx: ['crackle', 'sparkles'] }),
      windup: Object.assign({}, st, { fHand: [14, -78], fBend: 1, staffAng: -2.5, staffUp: 110, staffDown: 24, forkBuzz: 1, bHand: [-22, -36], bBend: -1, bKind: 'open', bRot: -0.3, lean: -0.08, squash: 0.98, torsoDy: 4, headRot: -0.05,
        fFoot: [22, -12], bFoot: [-24, -12], eyes: 'determined', mouth: 'grit', brow: 0.45, fx: ['crackle'] }),
      strike: Object.assign({}, st, { fHand: [36, 0], fBend: 1, staffAng: -0.5, staffUp: 56, staffDown: 70, forkBuzz: 1, lean: 0.14, bx: 6, torsoRot: 0.07, headRot: 0.07, headDx: 3, bHand: [-32, 26], bBend: 1, bKind: 'fist',
        fFoot: [32, -12], bFoot: [-24, -12], eyes: 'determined', mouth: 'grit', brow: 0.55, look: [0.5, 0], fx: ['zapburst', 'crackle'] }),
      block: Object.assign({}, st, { fHand: [28, 26], fBend: 1, staffAng: -0.3, staffUp: 40, staffDown: 110, staffBoth: 1, forkBuzz: 0.7, bHand: [20, 46], bBend: 1, bKind: 'fist', bFront: 1, headRot: -0.05,
        fFoot: [22, -12], bFoot: [-24, -12], eyes: 'determined', mouth: 'flat', brow: 0.4, fx: ['rings', 'crackle'] }),
      down: Object.assign({}, st, { fHand: [36, 44], fBend: -1, staffAng: -0.95, staffUp: 80, staffDown: 40, by: 34, torsoDy: 2, torsoRot: 0.06, lean: 0.02, headRot: 0.22, headDy: 2, bHand: [-4, 52], bBend: 1, bKind: 'relaxed', bRot: 0.3,
        fFoot: [22, -36], bFoot: [-14, -36], fBow: 16, bBow: 12, eyes: 'closed', mouth: 'flat', brow: -0.25, blush: 0.6, fx: ['mute'] }),
      walk: Object.assign({}, st, { fHand: [26, 44], fBend: -1, staffAng: -1.6, bHand: [-8, 50], bBend: 1, bKind: 'relaxed', bRot: 0.2, headRot: 0.03, fx: ['crackle'] }, stern),
      bust: Object.assign({}, st, { fHand: [22, 58], fBend: -1, staffAng: -1.62, bHand: [-8, 56], bBend: 1, bKind: 'relaxed', headRot: 0.03, fx: [] }, stern),
    };
  }
  const crSpec = {
    id: 'npc_choir_crackle', accent: 'static_choir',
    skel: { neck: [0, -150], headC: [2, -208], shF: [27, -134], shB: [-27, -134] },
    base: { fFoot: [18, -12], bFoot: [-16, -12] },
    poses: crPoses(),
    life: { idle: { bob: 1.2, per: 3.0, sway: 0.012, head: 0.018 }, walk: { bob: 2.2, per: 0.5, head: 0.01, step: { hz: 2, stride: 8, lift: 4 } } },
    face: {
      eyes: [{ x: -13, y: 17, w: 30, h: 26 }, { x: 39, y: 15, w: 25, h: 24 }],
      brows: [[-14, -8, 30], [44, -8, 27]], browStyle: { thick: 6.8, arch: 0.35, tilt: 0.18, color: CR.brow },
      nose: [26, 32, 60], mouth: [9, 44, 22], mouthStyle: { lineW: 1.5 },
      blush: [[-18, 34, 18], [38, 33, 15]], sweat: [57, -10, 5],
      eye: { iris: CR.iris, ring: '#0b3440', sclera: '#fbfdff', expr: 'neutral', irisW: 0.66, irisH: 0.92, lid: 2.1, wing: 0.45, lash: 1.05, crease: true, lashes: 0, tilt: 0.12, drop: 0.12, hl: [[-0.4, -0.5, 0.28], [-0.32, -0.12, 0.13]] },
    },
    arm: { l: [24, 22], w: [19, 21], skin: CR.robe, skinSh: CR.robeSh, cuff: { color: K.cyan, light: K.cyanSh }, hand: { skin: C.skin, shade: C.skinSh } },
    legs: { w: [22, 16], color: K.sock, shade: K.sockSh, bow: 2, shoe: SHOE },
    mic: { accent: K.cyan },
    bounds: { h: 340, x0: -150, x1: 180 },
    bust: { rect: [-104, -330, 104, -112], face: [-94, -326, 90, -146], pose: 'bust' },
    tweak(P, t) {
      if (P.pose === 'walk') P.staffAng += 0.1 * num(P.stepPhase);
      if (P.pose === 'idle') P.forkBuzz = Math.max(0, Math.sin(t * 1.3) - 0.6) * 1.6;
    },
    layers: {
      torso: crTorso, head: (g, S) => { crHead(g, S); },
      top: (g, S) => {
        // the front fist wrapped round the staff (the kit's mic grip), and the back fist too when both hands hold it
        toFig(g, S.M.head);
        const G = crStaffGeo(S);
        RJ.fistOnMic(g, G.grip[0], G.grip[1], G.a + PI, { skin: C.skin, shade: C.skinSh });
        if (S.P.staffBoth) {
          const b = wristOf(S, false), ux = Math.cos(G.a), uy = Math.sin(G.a), dx = b.w[0] - G.grip[0], dy = b.w[1] - G.grip[1], d = dx * ux + dy * uy;
          RJ.fistOnMic(g, G.grip[0] + ux * d, G.grip[1] + uy * d, G.a + PI, { skin: C.skin, shade: C.skinSh });
        }
      },
      fx: crFx,
    },
  };
  // the staff sits in front of the head but under the gripping fist: drawn at the end of the head layer, in figure space
  crSpec.layers.head = (g, S) => { crHead(g, S); g.save(); toFig(g, S.M.head); crStaff(g, S); g.restore(); };

  // ======================================================================================================================================
  // CHOIRBOY FUZZ (grunt): the kid with the fuzzy static hair cloud, the too-big robe, the surplice collar and the cyan song book
  // ======================================================================================================================================
  const FZ = {
    robe: '#838ca0', robeSh: '#646d82', robeHi: '#a3abbe', dk: '#4c5467',
    hair: '#c4c1ea', hairSh: '#9793cc', hairHi: '#e9e7fb', hairDk: '#7a75b4',
    skin: '#f2c49b', skinSh: '#dda077',
    iris: ['#3a4f7a', '#7e9bd0'],
    book: '#3fd8e8', bookSh: '#1fa6be', page: '#fffaf0', pageSh: '#e3dccb',
  };
  // a scalloped cloud ring: n bumps round an ellipse, amp share of the radius
  function cloudPts(cx, cy, rx, ry, n, amp, ph) {
    const out = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < 4; j++) {
      const u = j / 4, a = ph + ((i + u) / n) * TAU, k = 1 + amp * Math.pow(Math.sin(PI * u), 0.8);
      out.push(j === 0 ? [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 1] : [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    return out;
  }
  const FZ_SKULL = RJ.skullPts({ w: 1.0, h: 0.98, chin: -2 });
  // an irregular fuzzy outline: n soft bumps of uneven size round an ellipse (seeded, fixed)
  function fuzzPts(cx, cy, rx, ry, n) {
    const out = [];
    let a = 0.2;
    const ws = []; let tot = 0;
    for (let i = 0; i < n; i++) { const w = 0.7 + 0.6 * hsh(i, 11, 0); ws.push(w); tot += w; }
    for (let i = 0; i < n; i++) {
      const span = ws[i] / tot * TAU, amp = 0.07 + 0.09 * hsh(i, 12, 0);
      for (let j = 0; j < 4; j++) {
        const u = j / 4, an = a + span * u, k = 1 + amp * Math.pow(Math.sin(PI * u), 0.8);
        out.push(j === 0 ? [cx + Math.cos(an) * rx, cy + Math.sin(an) * ry, 1] : [cx + Math.cos(an) * rx * k, cy + Math.sin(an) * ry * k]);
      }
      a += span;
    }
    return out;
  }
  function fzCloud(g, S, front) {
    const sw = S.P.hairSwing * 1.5;
    g.save(); g.translate(0, -30); g.rotate(sw * 0.02); g.translate(0, 30);
    if (!front) {
      RJ.cel(g, fuzzPts(-4, -24, 84, 76, 17), FZ.hair, { shadow: FZ.hairSh, line: LINE.main + 0.2, depth: 11, tension: 0.6, hi: FZ.hairHi, hiW: 2.2, decor: (gg) => fzFlecks(gg, S, -4, -26, 80, 68) });
    } else {
      // the ahoge: one springy lock standing up out of the fuzz, then the shaggy fringe
      RJ.lock(g, [[2, -70], [8, -100], [26 + sw * 4, -110], [30 + sw * 6, -96]], FZ.hair, { wMax: 10, w0: 9, w1: 2, tipPow: 1.2, gloss: false, strands: 0, shadow: FZ.hairSh, shadowW: 0.3, line: LINE.main });
      RJ.cel(g, [[-58, -2], [-62, -36], [-42, -62], [-6, -72], [30, -66], [56, -46], [64, -18], [56, -22, 1], [50, -8], [42, -24, 1], [32, -14], [24, -30, 1], [12, -22], [4, -34, 1], [-8, -22], [-16, -34, 1], [-28, -22], [-38, -34, 1], [-46, -16], [-52, 2, 1]],
        FZ.hair, { shadow: FZ.hairSh, line: LINE.main + 0.1, depth: 6, tension: 0.55, hi: FZ.hairHi, hiW: 1.8, decor: (gg) => {
          RJ.hatch(gg, [[[-30, -52], [-36, -40]], [[-8, -58], [-10, -44]], [[16, -56], [20, -42]], [[38, -50], [44, -38]]], { color: FZ.hairDk, w: 1.3, alpha: 0.8 });
          fzFlecks(gg, S, 0, -48, 56, 16);
        } });
    }
    g.restore();
  }
  // the static in his fuzz: tiny cyan and lilac flecks that twinkle
  function fzFlecks(g, S, cx, cy, rx, ry) {
    const f = Math.floor(S.t * 5 * tk.motion());
    for (let i = 0; i < 14; i++) {
      const a = hsh(i, 7, 0) * TAU, r = Math.sqrt(hsh(i, 8, 0)), on = hsh(i, 9, f) > 0.4;
      if (!on) continue;
      g.fillStyle = i % 3 ? K.cyan : '#ffffff';
      g.fillRect(cx + Math.cos(a) * rx * r - 1.5, cy + Math.sin(a) * ry * r - 1.5, 3, 3);
    }
    RJ.hatch(g, [[[cx - rx * 0.5, cy - ry * 0.2], [cx - rx * 0.45, cy - ry * 0.05], [cx - rx * 0.36, cy - ry * 0.12]], [[cx + rx * 0.2, cy - ry * 0.5], [cx + rx * 0.27, cy - ry * 0.36], [cx + rx * 0.35, cy - ry * 0.44]]], { color: FZ.hairDk, w: 1.3, alpha: 0.8 });
  }
  function fzTorso(g, S) {
    RJ.neck(g, 2, -136, { w: 20, h: 14, skin: FZ.skin, shade: FZ.skinSh });
    robe(g, S, { top: -132, neck: 15, sh: 36, waistY: -80, waist: 38, hemY: 4, hem: 54, n: 6, color: FZ.robe, shade: FZ.robeSh, hi: FZ.robeHi, trim: K.cyan, trimW: 3.5, trimDy: 2,
      wave: (u, i) => (i % 2 ? -3 : 2), swayK: 4, depth: 10,
      folds: [[-24, -70, -40, 0], [-8, -60, -14, 0], [14, -64, 22, 0], [30, -70, 44, 0]] });
  }
  // the white surplice collar with its scalloped edge and the cyan bow (over the arms' shoulder joints)
  function fzOver(g, S) {
    const pts = [[-16, -136], [16, -136], [32, -130], [42, -118], [44, -104, 1], [34, -100], [26, -104, 1], [16, -96], [6, -100, 1], [-6, -96], [-16, -100, 1], [-28, -98], [-36, -104, 1], [-44, -106], [-42, -120], [-32, -132]];
    RJ.cel(g, pts, K.white, { shadow: K.whiteSh, line: LINE.main, depth: 6, tension: 0.6, hi: '#ffffff' });
    RJ.ink(g, [[-14, -134], [0, -128], [14, -134]], { w: 1.4, color: K.whiteSh, taper: 0.3, wobble: 0 });
    // the bow
    RJ.blob(g, [{ e: [-8, -128, 8, 5.5, 0.35] }, { e: [12, -128, 8, 5.5, -0.35] }, { a: [-2, -122], b: [-7, -110], w: 4 }, { a: [6, -122], b: [10, -110], w: 4 }, { e: [2, -128, 4.2, 4.2] }], { fill: K.cyan, shade: K.cyanSh, L: LINE.main * 0.85 });
    fzBook(g, S);
  }
  // the song book: open between both hands, or shut in the front fist (figure space)
  function fzBook(g, S) {
    const P = S.P;
    g.save(); toFig(g, S.M.torso);
    const f = wristOf(S, true), b = wristOf(S, false), tilt = num(P.bookTilt);
    if (P.book === 'shut') {
      const c = [f.w[0] + Math.cos(f.ang) * 7, f.w[1] + Math.sin(f.ang) * 7];
      g.save(); g.translate(c[0], c[1]); g.rotate(f.ang + PI / 2 + tilt);
      RJ.cel(g, [[-15, -32], [15, -32], [15, 8], [-15, 8]], FZ.book, { shadow: FZ.bookSh, line: LINE.main, tension: 0.15, depth: 4, hi: K.cyanLt, hiW: 1.4 });
      g.fillStyle = FZ.page; g.fillRect(12, -30, 3, 36);
      tk.note(g, 1, -14, 14, { kind: 'eighth', color: '#ffffff' });
      g.restore();
      RJ.hand(g, 'fist', f.w[0], f.w[1], f.ang, { skin: FZ.skin, shade: FZ.skinSh, k: 0.9 });
    } else {
      const cx = (f.w[0] + b.w[0]) / 2, cy = (f.w[1] + b.w[1]) / 2 - 10, a = Math.atan2(f.w[1] - b.w[1], f.w[0] - b.w[0]) * 0.6 + tilt;
      g.save(); g.translate(cx, cy); g.rotate(a);
      RJ.cel(g, [[-34, -22], [0, -18], [34, -22], [36, 18], [0, 22], [-36, 18]], FZ.book, { shadow: FZ.bookSh, line: LINE.main, tension: 0.2, depth: 3 });
      [-1, 1].forEach((s) => {
        RJ.cel(g, [[0, -16], [s * 16, -20], [s * 31, -19], [s * 32, 15], [s * 16, 16], [0, 19]], FZ.page, { shadow: FZ.pageSh, line: LINE.fine + 0.4, tension: 0.3, depth: 2 });
        RJ.hatch(g, [-12, -6, 0, 6].map((y) => [s * 6, y - 2, s * 26, y - 3]), { color: '#a9b3c6', w: 1, alpha: 0.9 });
      });
      tk.note(g, 15, -2, 12, { kind: 'beamed', color: K.cyanDk });
      tk.note(g, -18, 2, 11, { kind: 'eighth', color: K.cyanDk });
      g.restore();
      RJ.hand(g, 'fist', f.w[0], f.w[1], f.ang, { skin: FZ.skin, shade: FZ.skinSh, k: 0.9 });
      RJ.hand(g, 'fist', b.w[0], b.w[1], b.ang, { skin: FZ.skin, shade: FZ.skinSh, k: 0.9 });
    }
    g.restore();
  }
  function fzFx(g, S, name) {
    if (name === 'bonk') {
      const f = wristOf(S, true), x = f.w[0] + 30, y = f.w[1] - 14;
      RJ.fx.burst(g, x, y, 16 + 8 * S.beat, K.cyan, K.cyanLt, S.t);
      word(g, 'shh!', x + 18, y - 28, 15, -0.2, 0.95, '#ffffff');
      return;
    }
    choirFx(g, S, name);
  }
  function fzPoses() {
    const st = { mic: 'none', fKind: 'fist', bKind: 'fist' };
    return {
      idle: Object.assign({}, st, { book: 'open', fHand: [6, 30], fBend: 1, bHand: [26, 34], bBend: 1, bFront: 1, bookTilt: 0.05, headRot: 0.04, eyes: 'open', mouth: 'smile', brow: -0.1, look: [0.3, 0.3], fx: [] }),
      sing: Object.assign({}, st, { book: 'open', fHand: [8, 16], fBend: 1, bHand: [28, 20], bBend: 1, bFront: 1, bookTilt: -0.05, headRot: -0.1, eyes: 'happy', mouth: 'sing', brow: -0.2, fx: ['hum'] }),
      attack: Object.assign({}, st, { book: 'shut', fHand: [36, -22], fBend: 1, bHand: [-26, 22], bBend: -1, lean: 0.08, headRot: 0.06, bookTilt: 0.3,
        fFoot: [24, -12], bFoot: [-18, -12], eyes: 'angry', mouth: 'ow', brow: 0.6, look: [0.5, 0], fx: ['bonk'] }),
      hurt: Object.assign({}, st, { book: 'open', fHand: [4, 30], fBend: 1, bHand: [22, 34], bBend: 1, bFront: 1, bookTilt: 0.4, lean: -0.13, torsoRot: -0.08, headRot: -0.14, headDx: -3,
        eyes: 'hurt', mouth: 'ow', brow: -0.7, sweat: 1, blush: 0.6, fx: ['stars'] }),
      cheer: Object.assign({}, st, { book: 'shut', fHand: [36, -64], fBend: 1, bHand: [-34, -44], bBend: -1, bKind: 'open', bSpread: 1.3, bookTilt: -0.2, eyes: 'happy', mouth: 'happyOpen', brow: -0.2, headRot: 0.05, fx: ['sparkles', 'hum'] }),
      windup: Object.assign({}, st, { book: 'shut', fHand: [36, -30], fBend: 1, bHand: [-30, 18], bBend: -1, bookTilt: -0.9, lean: -0.08, squash: 0.98, torsoDy: 3, eyes: 'determined', mouth: 'grit', brow: 0.5, fx: [] }),
      strike: Object.assign({}, st, { book: 'shut', fHand: [44, 6], fBend: 1, bHand: [-28, 24], bBend: -1, bx: 6, lean: 0.14, headRot: 0.07, headDx: 2, bookTilt: 0.6,
        fFoot: [28, -12], bFoot: [-20, -12], eyes: 'angry', mouth: 'ow', brow: 0.6, look: [0.5, 0], fx: ['bonk'] }),
      block: Object.assign({}, st, { book: 'open', fHand: [4, -16], fBend: 1, bHand: [24, -12], bBend: 1, bFront: 1, bookTilt: 0, headRot: 0.04, eyes: 'wide', mouth: 'flat', brow: -0.4, look: [0.4, 0], fx: ['rings'] }),
      down: Object.assign({}, st, { book: 'open', fHand: [6, 40], fBend: 1, bHand: [24, 42], bBend: 1, bFront: 1, bookTilt: 0.2, by: 28, torsoRot: 0.05, headRot: 0.2, headDy: 2,
        fFoot: [20, -30], bFoot: [-14, -30], fBow: 12, bBow: 10, eyes: 'closed', mouth: 'flat', brow: -0.3, blush: 0.9, fx: ['mute'] }),
      walk: Object.assign({}, st, { book: 'open', fHand: [6, 30], fBend: 1, bHand: [26, 34], bBend: 1, bFront: 1, bookTilt: 0.05, headRot: 0.04, eyes: 'open', mouth: 'smile', brow: -0.1, look: [0.3, 0.2], fx: [] }),
      bust: Object.assign({}, st, { book: 'open', fHand: [6, 40], fBend: 1, bHand: [26, 44], bBend: 1, bFront: 1, headRot: 0.04, eyes: 'open', mouth: 'smile', brow: -0.1, fx: [] }),
    };
  }
  const fzSpec = {
    id: 'npc_choir_fuzz', accent: 'static_choir',
    skel: { hip: [0, -66], neck: [0, -128], headC: [2, -184], shF: [23, -115], shB: [-23, -115], hipF: [12, -62], hipB: [-12, -62], arm: [20, 18] },
    base: { fFoot: [14, -12], bFoot: [-12, -12] },
    poses: fzPoses(),
    life: { idle: { bob: 1.3, per: 2.6, sway: 0.016, head: 0.03 }, sing: { bob: 1.8, per: 1.2, sway: 0.03, head: 0.05 }, walk: { bob: 2.6, per: 0.45, head: 0.015, step: { hz: 2.2, stride: 6, lift: 3 } } },
    face: {
      eyes: [{ x: -13, y: 16, w: 33, h: 33 }, { x: 39, y: 14, w: 28, h: 30 }],
      brows: [[-14, -12, 24], [44, -12, 21]], browStyle: { thick: 4.8, arch: 0.5, tilt: -0.05, color: '#7d7891' },
      nose: [26, 34, 54], mouth: [10, 46, 20], mouthStyle: { lineW: 1.5 },
      blush: [[-20, 38, 22], [40, 36, 18]], sweat: [56, -14, 5],
      eye: { iris: FZ.iris, ring: '#1d2740', sclera: '#fffdf8', expr: 'neutral', irisW: 0.74, irisH: 0.96, lid: 2.0, wing: 0.4, lash: 1.0, crease: false, lashes: 0, tilt: -0.05, drop: 0, hl: [[-0.38, -0.48, 0.3], [-0.3, -0.1, 0.14], [0.36, 0.42, 0.1]] },
    },
    arm: { l: [21, 19], w: [18, 24], skin: FZ.robe, skinSh: FZ.robeSh, cuff: { color: K.white, light: K.whiteSh }, hand: { skin: FZ.skin, shade: FZ.skinSh, k: 0.9 } },
    legs: { w: [18, 14], color: K.sock, shade: K.sockSh, bow: 2, shoe: Object.assign({}, SHOE, { k: 0.95 }) },
    mic: { accent: K.cyan },
    bounds: { h: 308, x0: -146, x1: 140 },
    bust: { rect: [-100, -306, 96, -92], face: [-94, -302, 86, -126], pose: 'bust' },
    layers: {
      backHair: (g, S) => fzCloud(g, S, false),
      torso: fzTorso,
      head: (g, S) => {
        headBase(g, S, { skull: FZ_SKULL, skin: FZ.skin, shade: FZ.skinSh, cast: [[-56, -36], [-20, -50], [20, -50], [56, -32], [40, -24], [0, -34], [-40, -26]], castDy: 6, under: (gg) => {
          // a few freckles
          [[-24, 30], [-18, 34], [-28, 36], [42, 30], [48, 33]].forEach((p) => { gg.beginPath(); gg.arc(p[0], p[1], 1.2, 0, TAU); gg.fillStyle = '#d58a6a'; gg.fill(); });
        } });
        RJ.ear(g, -54, 24, { r: 13, side: -1, skin: FZ.skin, shade: FZ.skinSh });
        fzCloud(g, S, true);
      },
      over: fzOver,
      fx: fzFx,
    },
  };

  // ======================================================================================================================================
  // SISTER WHISPER (grunt): the long veil with the cyan circlet, finger to her lips
  // ======================================================================================================================================
  const WH = {
    robe: '#7686a0', robeSh: '#5a6882', robeHi: '#98a7bf',
    veil: '#e6e9f1', veilSh: '#bec5d6', veilHi: '#ffffff', lining: '#9aa5bb',
    hair: '#4b3550', hairSh: '#2f1f33', hairHi: '#7a5a80',
    iris: ['#3e3a6a', '#8f87c6'],
  };
  const WH_SKULL = RJ.skullPts({ w: 0.98, h: 1.0, chin: 2 });
  function whBack(g, S) {
    const sw = S.P.hairSwing;
    g.save(); g.translate(-20, -40); g.rotate(sw * 0.03); g.translate(20, 40);
    const pts = [[-40, -60], [-70, -40], [-82, 0], [-88, 50], [-96, 100], [-104, 136 + sw * 3, 1], [-70, 130], [-40, 136], [-10, 126, 1], [10, 80], [40, 60]];
    RJ.cel(g, pts, WH.veil, { shadow: WH.veilSh, line: LINE.main, depth: 12, tension: 0.6, decor: (gg) => {
      RJ.hatch(gg, [[[-70, 20], [-80, 80], [-88, 120]], [[-50, 40], [-56, 90], [-60, 124]]], { color: WH.veilSh, w: 1.6, alpha: 0.9 });
      RJ.ink(gg, [[-104, 136 + sw * 3], [-70, 130], [-40, 136], [-10, 126]], { w: 7, color: K.cyan, taper: 0, wobble: 0, weightVar: 0 });
    } });
    g.restore();
  }
  // the veil over the head: a soft cap round the face, the sides falling past the shoulders, the cyan circlet and its little fork charm
  const WH_VEIL_OUT = [[-48, 92], [-72, 60], [-80, 10], [-74, -36], [-52, -66], [-16, -78], [22, -74], [52, -54], [68, -22], [70, 20], [66, 64], [56, 96, 1], [46, 64], [50, 20], [44, -16], [20, -34], [-10, -38], [-34, -28], [-46, 0], [-46, 40], [-36, 80, 1]];
  function whHead(g, S) {
    headBase(g, S, { skull: WH_SKULL, cast: [[-40, -26], [-10, -40], [20, -38], [46, -18], [30, -20], [0, -30], [-30, -18]], castDy: 6 });
    // side-swept dark fringe peeking under the veil
    RJ.cel(g, [[-46, 14], [-46, -16], [-30, -36], [0, -42], [30, -36], [48, -20], [54, 2, 1], [44, -8], [30, -16], [12, -20], [-6, -18], [-22, -10], [-34, 2], [-40, 18, 1]], WH.hair, { shadow: WH.hairSh, line: LINE.main, depth: 4, tension: 0.7, hi: WH.hairHi, hiW: 1.4, decor: (gg) => {
      RJ.hatch(gg, [[[-28, -24], [-8, -30], [16, -28], [36, -18]], [[-36, -6], [-20, -20], [0, -24]]], { color: WH.hairSh, w: 1.3, alpha: 0.9 });
    } });
    const sw = S.P.hairSwing;
    const out = WH_VEIL_OUT.map((p) => (p[1] > 40 ? [p[0] + sw * (p[1] - 40) * 0.06, p[1], p[2]] : p));
    RJ.cel(g, out, WH.veil, { shadow: WH.veilSh, line: LINE.main + 0.2, depth: 9, tension: 0.6, hi: WH.veilHi, hiW: 2, decor: (gg) => {
      RJ.hatch(gg, [[[-62, 20], [-60, 50], [-50, 80]], [[60, 30], [58, 60], [52, 86]], [[-30, -60], [-10, -54]]], { color: WH.veilSh, w: 1.5, alpha: 0.9 });
      RJ.fillPts(gg, [[-46, 40], [-46, 0], [-34, -28], [-10, -38], [20, -34], [44, -16], [50, 20], [46, 64], [40, 30], [36, -6], [16, -26], [-10, -30], [-30, -20], [-40, 6], [-40, 50]], WH.lining, 0.55);
    } });
    // the circlet: a cyan band across the veil's brow with the fork charm
    RJ.ink(g, [[-54, -40], [-28, -50], [4, -54], [34, -48], [58, -32]], { w: 8, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, [[-54, -40], [-28, -50], [4, -54], [34, -48], [58, -32]], { w: 5, color: K.cyan, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, [[-30, -51.5], [4, -55.5], [30, -50]], { w: 1.4, color: K.cyanLt, taper: 0.3, wobble: 0, weightVar: 0 });
    miniFork(g, 6, -40 + Math.sin(S.t * 2) * 0.5, 15, K.cyan, Math.sin(S.t * 1.7) * 0.08);
    RJ.cel(g, tk.circlePts(6, -53, 4.5, 10), K.cyanLt, { shadow: K.cyan, line: LINE.fine + 0.3, depth: 1.5 });
  }
  function whTorso(g, S) {
    RJ.neck(g, 2, -158, { w: 20, h: 16 });
    robe(g, S, { top: -150, neck: 13, sh: 34, waistY: -100, waist: 28, hemY: -10, hem: 56, n: 8, color: WH.robe, shade: WH.robeSh, hi: WH.robeHi, trim: K.cyan, trimW: 3.5,
      wave: (u, i) => (i % 2 ? -2 : 1.5), swayK: 4, depth: 10,
      folds: [[-14, -96, -34, -14], [0, -92, -2, -14], [14, -96, 32, -14]],
      band: (gg) => {                                                      // a sash at the waist
        RJ.cel(gg, [[-40, -108], [40, -108], [40, -96], [-40, -96]], WH.robeSh, { shadow: false, line: LINE.fine + 0.3, tension: 0 });
        RJ.ink(gg, [[-40, -102], [40, -102]], { w: 2.2, color: K.cyan, taper: 0, wobble: 0, weightVar: 0 });
      } });
    // the pendant: a little mute-speaker charm on a fine chain
    RJ.ink(g, [[-12, -150], [-2, -134], [6, -130], [14, -136], [18, -150]], { w: 1.2, color: '#5d6478', taper: 0, wobble: 0, weightVar: 0 });
    RJ.cel(g, tk.circlePts(6, -124, 6, 12), K.cyan, { shadow: K.cyanSh, line: LINE.fine + 0.4, depth: 1.5, hi: K.cyanLt, hiW: 1 });
    g.beginPath(); g.moveTo(2, -126); g.lineTo(5, -126); g.lineTo(8, -129); g.lineTo(8, -119); g.lineTo(5, -122); g.lineTo(2, -122); g.closePath(); g.fillStyle = '#ffffff'; g.fill();
  }
  // the 'shh' hand: a soft fist under the chin with ONE index finger standing straight up across the lips (drawn over the arm's own fist)
  function whShh(g, S) {
    if (!S.P.shh) return;
    toFig(g, S.M.head);
    const k = wristOf(S, true), c = [k.w[0] + Math.cos(k.ang) * 6.5, k.w[1] + Math.sin(k.ang) * 6.5], m = S.pt.mouth;
    const fx = lerp(c[0], m[0], 0.5) + 1, top = Math.min(c[1] - 12, m[1] - 9);
    RJ.blob(g, [{ e: [c[0], c[1], 8.6, 8.2, 0] }, { a: [fx, c[1] - 4], b: [fx, top], w: 5.6 }], { fill: C.skin, shade: C.skinSh, L: LINE.main * 0.85 });
    RJ.ink(g, [[c[0] - 6, c[1] - 1], [c[0] + 3, c[1] - 2]], { w: LINE.fine, color: C.inkSoft, taper: 0.5, wobble: 0 });
    RJ.ink(g, [[c[0] - 6, c[1] + 3], [c[0] + 3, c[1] + 3]], { w: LINE.fine, color: C.inkSoft, taper: 0.5, wobble: 0 });
    RJ.blob(g, [{ e: [c[0] + 5.5, c[1] + 1, 3.4, 4.6, 0.2] }], { fill: C.skin, shade: C.skinSh, L: LINE.main * 0.7 });
  }
  function whPoses() {
    const shh = { mic: 'none', fHand: [-10, -2], fBend: -1, fKind: 'fist', fRot: 0, shh: 1, eyes: 'half', mouth: 'tiny', brow: -0.15, blush: 1.4 };
    const lowB = { bHand: [-8, 52], bBend: 1, bKind: 'relaxed', bRot: 0.25 };
    return {
      idle: Object.assign({}, shh, lowB, { headRot: 0.06, look: [0.4, 0], fx: ['shh'] }),
      sing: { mic: 'none', fHand: [-14, 22], fBend: 1, fKind: 'fist', fRot: 0, bHand: [32, 22], bBend: 1, bKind: 'fist', bRot: 0, bFront: 1, headRot: -0.1, eyes: 'closed', mouth: 'sing', brow: -0.25, blush: 1.4, fx: ['shh', 'hum'] },
      attack: { mic: 'none', fHand: [50, 2], fBend: -1, fKind: 'open', fSpread: 0.7, fRot: -1.3, bHand: [-24, 34], bBend: 1, bKind: 'relaxed', lean: 0.06, torsoRot: 0.04, headRot: 0.05,
        fFoot: [24, -12], bFoot: [-20, -12], eyes: 'determined', mouth: 'tiny', brow: 0.4, look: [0.5, 0], fx: ['hushwave'] },
      hurt: Object.assign({}, lowB, { mic: 'none', fHand: [12, 30], fBend: -1, fKind: 'open', fSpread: 1.3, bHand: [-32, -10], bBend: -1, bKind: 'open', bSpread: 1.3, lean: -0.13, torsoRot: -0.08, headRot: -0.14, headDx: -3,
        eyes: 'hurt', mouth: 'ow', brow: -0.7, sweat: 1, blush: 0.6, fx: ['stars'] }),
      cheer: { mic: 'none', fHand: [40, -66], fBend: 1, fKind: 'open', fSpread: 1.2, fRot: -0.3, bHand: [-8, 50], bBend: 1, bKind: 'relaxed', bRot: 0.25, headRot: 0.08, eyes: 'happy', mouth: 'happyOpen', brow: -0.3, blush: 1.8, fx: ['sparkles', 'shh'] },
      windup: Object.assign({}, shh, { bHand: [24, -2], bBend: 1, bKind: 'relaxed', bRot: -0.8, bFront: 1, lean: -0.05, squash: 0.98, headRot: 0.02, eyes: 'closed', fx: ['shh'] }),
      strike: { mic: 'none', fHand: [54, -2], fBend: -1, fKind: 'open', fSpread: 0.8, fRot: -1.3, bHand: [-26, 34], bBend: 1, bKind: 'relaxed', bx: 6, lean: 0.12, torsoRot: 0.06, headRot: 0.06, headDx: 2,
        fFoot: [28, -12], bFoot: [-22, -12], eyes: 'determined', mouth: 'tiny', brow: 0.45, look: [0.5, 0], fx: ['hushwave', 'shh'] },
      block: Object.assign({}, lowB, { mic: 'none', fHand: [38, -18], fBend: 1, fKind: 'open', fSpread: 1, fRot: -1.3, headRot: -0.04, eyes: 'determined', mouth: 'flat', brow: 0.35, fx: ['rings'] }),
      down: Object.assign({}, lowB, { mic: 'none', fHand: [8, 40], fBend: 1, fKind: 'relaxed', by: 32, torsoRot: 0.05, headRot: 0.24, headDy: 2, fFoot: [20, -34], bFoot: [-14, -34], fBow: 14, bBow: 10,
        eyes: 'closed', mouth: 'flat', brow: -0.3, blush: 0.8, fx: ['mute'] }),
      walk: Object.assign({}, shh, lowB, { headRot: 0.05, fx: ['shh'] }),
      bust: Object.assign({}, shh, { bHand: [-8, 56], bBend: 1, bKind: 'relaxed', headRot: 0.05, fx: [] }),
    };
  }
  const whSpec = {
    id: 'npc_choir_whisper', accent: 'static_choir',
    skel: { shF: [24, -132], shB: [-24, -132] },
    base: { fFoot: [16, -12], bFoot: [-14, -12] },
    poses: whPoses(),
    life: { idle: { bob: 1.0, per: 3.6, sway: 0.014, head: 0.02 }, walk: { bob: 2.0, per: 0.5, head: 0.01, step: { hz: 2, stride: 7, lift: 3 } } },
    face: {
      eyes: [{ x: -12, y: 17, w: 30, h: 27 }, { x: 39, y: 15, w: 25, h: 25 }],
      brows: [[-13, -6, 24], [44, -6, 21]], browStyle: { thick: 4, arch: 0.45, tilt: -0.1, color: WH.hair },
      nose: [26, 32, 56], mouth: [10, 44, 20], mouthStyle: { lineW: 1.4 },
      blush: [[-18, 34, 20], [38, 33, 16]], sweat: [56, -10, 5],
      eye: { iris: WH.iris, ring: '#211d3d', sclera: '#fffdfb', expr: 'neutral', irisW: 0.7, irisH: 0.94, lid: 2.1, wing: 0.7, lash: 1.2, crease: true, lashes: 2, tilt: -0.05, drop: 0.18, hl: [[-0.4, -0.5, 0.28], [-0.3, -0.1, 0.13]] },
    },
    arm: { l: [23, 21], w: [17, 20], skin: WH.robe, skinSh: WH.robeSh, cuff: { color: K.cyan, light: K.cyanSh }, hand: { skin: C.skin, shade: C.skinSh } },
    legs: { w: [18, 14], color: K.sock, shade: K.sockSh, bow: 2, shoe: SHOE },
    mic: { accent: K.cyan },
    bounds: { h: 296, x0: -128, x1: 122 },
    bust: { rect: [-96, -292, 96, -98], face: [-86, -288, 84, -112], pose: 'bust' },
    layers: { backHair: whBack, torso: whTorso, head: whHead, top: whShh, fx: (g, S, n) => choirFx(g, S, n) },
  };

  // ======================================================================================================================================
  // BROTHER REVERB (merchant / fixer): round and kind, silver beard, rolled cowl, a pouch of tuning forks, echo rings and an echoing laugh
  // ======================================================================================================================================
  const RV = {
    robe: '#7a8091', robeSh: '#5d6374', robeHi: '#9ba1b2',
    cowl: '#8f96a8', cowlSh: '#6e7588', cowlHi: '#b2b8c8',
    skin: '#c98d62', skinSh: '#aa6f48', skinHi: '#e0aa82',
    beard: '#e2e5ec', beardSh: '#b9bfcd', rope: '#3fd8e8',
    pouch: '#5c6477', pouchSh: '#454c5d',
    iris: ['#3b2412', '#8a5a32'],
  };
  const RV_SKULL = RJ.skullPts({ w: 1.06, h: 1.0, chin: 0 });
  function rvTorso(g, S) {
    RJ.neck(g, 2, -156, { w: 26, h: 18, skin: RV.skin, shade: RV.skinSh });
    robe(g, S, { top: -146, neck: 18, sh: 44, waistY: -86, waist: 58, hemY: -9, hem: 52, n: 6, color: RV.robe, shade: RV.robeSh, hi: RV.robeHi, trim: K.cyan, trimW: 4,
      wave: (u, i) => (i % 2 ? -2 : 1), swayK: 2, depth: 12,
      folds: [[-28, -60, -36, -14], [24, -60, 30, -14]] });
    // the rope belt under the belly, its knot and tassels, and the pouch of tuning forks
    const belt = [[-50, -66], [-20, -58], [12, -58], [46, -66]];
    RJ.ink(g, belt, { w: 7, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, belt, { w: 4.4, color: K.cyan, taper: 0, wobble: 0, weightVar: 0 });
    RJ.hatch(g, [[-40, -64, -36, -60], [-24, -61, -20, -57], [-6, -60, -2, -56], [12, -60, 16, -56], [28, -63, 32, -59]], { color: K.cyanDk, w: 1.2 });
    const sw = S.sway * 3;
    RJ.lock(g, [[-14, -58], [-16 + sw, -44], [-14 + sw, -32]], K.cyan, { wMax: 5, w0: 4, w1: 3, gloss: false, strands: 0, shadow: K.cyanSh, line: LINE.fine + 0.4 });
    RJ.lock(g, [[-8, -58], [-6 + sw, -46], [-4 + sw, -36]], K.cyan, { wMax: 5, w0: 4, w1: 3, gloss: false, strands: 0, shadow: K.cyanSh, line: LINE.fine + 0.4 });
    RJ.cel(g, tk.circlePts(-11, -59, 5, 10), K.cyan, { shadow: K.cyanSh, line: LINE.fine + 0.4, depth: 1.5 });
    miniFork(g, 30, -66, 22, K.silver, -0.25); miniFork(g, 38, -64, 18, K.cyan, 0.15); miniFork(g, 46, -62, 20, K.silver, 0.4);
    RJ.cel(g, [[24, -66], [54, -66], [56, -48], [50, -36], [28, -36], [22, -48]], RV.pouch, { shadow: RV.pouchSh, line: LINE.main, depth: 4, tension: 0.5, hi: '#7d869b', hiW: 1.2 });
    RJ.ink(g, [[24, -60], [39, -54], [55, -60]], { w: 1.4, color: RV.pouchSh, taper: 0.2, wobble: 0 });
    g.beginPath(); g.arc(39, -51, 3, 0, TAU); g.fillStyle = K.cyan; g.fill();
  }
  // the big rolled cowl: a fat ring round the neck, over the shoulder joints
  function rvOver(g, S) {
    const pts = [[-46, -150], [-30, -162], [0, -166], [30, -162], [48, -150], [52, -136], [40, -124], [16, -118], [-10, -118], [-36, -124], [-52, -136]];
    RJ.cel(g, pts, RV.cowl, { shadow: RV.cowlSh, line: LINE.main, depth: 8, tension: 0.8, hi: RV.cowlHi, hiW: 2, decor: (gg) => {
      RJ.ink(gg, [[-44, -140], [-20, -132], [10, -131], [42, -138]], { w: 1.6, color: RV.cowlSh, taper: 0.4, wobble: 0.02 });
      RJ.ink(gg, [[-40, -128], [-10, -122], [20, -122], [44, -130]], { w: 3, color: K.cyan, taper: 0, wobble: 0, weightVar: 0 });
    } });
  }
  function rvHead(g, S) {
    headBase(g, S, { skull: RV_SKULL, skin: RV.skin, shade: RV.skinSh, under: (gg) => {
      // the beard round the jaw (the mouth is drawn over it by the face)
      gg.beginPath(); tk.trace(gg, [[-50, 20], [-36, 30], [-14, 30], [10, 34], [32, 30], [52, 20], [62, 36], [50, 70], [10, 80], [-30, 74], [-56, 50]]); gg.fillStyle = RV.beard; gg.fill();
      gg.beginPath(); tk.trace(gg, [[-56, 40], [-40, 56], [-10, 66], [30, 64], [50, 52], [40, 80], [-40, 80]]); gg.fillStyle = RV.beardSh; gg.fill();
      // the shiny pate
      gg.beginPath(); gg.ellipse(18, -42, 16, 7, -0.3, 0, TAU); gg.fillStyle = RV.skinHi; gg.globalAlpha = 0.8; gg.fill(); gg.globalAlpha = 1;
    } });
    // the beard's fluffy lower edge below the chin (outside the skull)
    RJ.cel(g, cloudPts(6, 56, 34, 16, 7, 0.16, 0.2).filter((p) => p[1] > 46), RV.beard, { shadow: RV.beardSh, line: LINE.main, depth: 4, tension: 0.7 });
    // the silver horseshoe of hair round the back of the head, fluffy tufts over the ears
    RJ.cel(g, cloudPts(-58, 8, 13, 26, 6, 0.12, 0.5), RV.beard, { shadow: RV.beardSh, line: LINE.main, depth: 4, tension: 0.8, hi: '#ffffff', hiW: 1.4 });
    RJ.ear(g, -50, 24, { r: 14, side: -1, skin: RV.skin, shade: RV.skinSh });
    RJ.cel(g, cloudPts(60, 4, 7, 15, 4, 0.14, 0.3), RV.beard, { shadow: RV.beardSh, line: LINE.main, depth: 2, tension: 0.8 });
  }
  function rvFx(g, S, name) {
    const t = S.t, m = tk.motion();
    if (name === 'haha') {
      const h = S.pt.head, base = fr(t * 0.6 * m);
      ['HA', 'ha', 'ha', 'ha'].forEach((s, i) => {
        const u = clamp(base * 1.6 - i * 0.2, 0, 1), a = Math.sin(PI * u);
        word(g, s, h[0] + 70 + i * 24, h[1] - 40 - i * 14 + Math.sin(t * 6 + i) * 2, 22 - i * 3.5, -0.12 + i * 0.05, Math.max(0.15, a) * (1 - i * 0.16), i ? K.cyanLt : K.cyan);
      });
      return;
    }
    if (name === 'echoblast') {
      const c = mat.pt(S.M.torso, 30, -110);
      g.save(); g.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const u = fr(t * 1.2 * m + i / 4), r = 20 + u * 90, a = Math.sin(PI * u);
        g.globalAlpha = a; g.strokeStyle = C.ink; g.lineWidth = 7 - u * 3; g.beginPath(); g.ellipse(c[0] + 20 + u * 40, c[1], r * 0.45, r, 0, -1.2, 1.2); g.stroke();
        g.strokeStyle = i % 2 ? K.cyanLt : K.cyan; g.lineWidth = 4.2 - u * 2; g.beginPath(); g.ellipse(c[0] + 20 + u * 40, c[1], r * 0.45, r, 0, -1.2, 1.2); g.stroke();
      }
      g.restore();
      return;
    }
    choirFx(g, S, name);
  }
  function rvPoses() {
    const kind = { eyes: 'open', mouth: 'happyOpen', brow: -0.25 };
    const belly = { bHand: [30, 34], bBend: 1, bKind: 'relaxed', bRot: 0.4, bFront: 1 };
    return {
      idle: Object.assign({ mic: 'none', fHand: [30, -32], fBend: 1, fKind: 'open', fSpread: 1.1, fRot: -0.5, headRot: 0.05, fx: ['echo'] }, belly, kind),
      sing: Object.assign({ mic: 'none', fHand: [-4, 40], fBend: 1, fKind: 'relaxed', fRot: 0.6, lean: -0.06, headRot: -0.14, headDx: -2, eyes: 'happy', mouth: 'grin', brow: -0.3, fx: ['echo', 'haha'] }, belly),
      attack: Object.assign({ mic: 'none', fHand: [44, 0], fBend: 1, fKind: 'open', fSpread: 1.2, fRot: -1.2, lean: 0.05, torsoRot: 0.03, headRot: 0.04, fFoot: [24, -12], bFoot: [-20, -12],
        eyes: 'happy', mouth: 'grin', brow: 0.1, fx: ['echo', 'haha', 'echoblast'] }, belly),
      hurt: { mic: 'none', fHand: [20, 30], fBend: -1, fKind: 'open', fSpread: 1.3, bHand: [-36, -8], bBend: -1, bKind: 'open', bSpread: 1.3, lean: -0.12, torsoRot: -0.07, headRot: -0.14, headDx: -3,
        eyes: 'hurt', mouth: 'ow', brow: -0.7, sweat: 1, blush: 0.8, fx: ['stars'] },
      cheer: { mic: 'none', fHand: [44, -34], fBend: 1, fKind: 'open', fSpread: 1.3, fRot: -0.3, bHand: [-46, -34], bBend: -1, bKind: 'open', bSpread: 1.3, bRot: 0.3, headRot: -0.04, eyes: 'happy', mouth: 'grin', brow: -0.3, fx: ['echo', 'haha', 'sparkles'] },
      windup: Object.assign({ mic: 'none', fHand: [22, -40], fBend: 1, fKind: 'open', fRot: -0.4, lean: -0.1, squash: 1.02, headRot: -0.1, eyes: 'closed', mouth: 'sing', brow: -0.2, fx: ['echo'] }, belly),
      strike: Object.assign({ mic: 'none', fHand: [48, -4], fBend: 1, fKind: 'open', fSpread: 1.3, fRot: -1.2, bx: 6, lean: 0.1, torsoRot: 0.05, headRot: 0.06, headDx: 2, fFoot: [28, -12], bFoot: [-22, -12],
        eyes: 'happy', mouth: 'grin', brow: 0.15, fx: ['echo', 'haha', 'echoblast'] }, belly),
      block: { mic: 'none', fHand: [40, -16], fBend: 1, fKind: 'open', fSpread: 1, fRot: -1.3, bHand: [52, -4], bBend: 1, bKind: 'open', bRot: -1.2, bFront: 1, headRot: -0.03, eyes: 'open', mouth: 'smile', brow: 0.1, fx: ['rings', 'echo'] },
      down: Object.assign({ mic: 'none', fHand: [14, 44], fBend: 1, fKind: 'relaxed', by: 30, torsoRot: 0.04, headRot: 0.2, headDy: 2, fFoot: [22, -32], bFoot: [-16, -32], fBow: 14, bBow: 10,
        eyes: 'closed', mouth: 'flat', brow: -0.35, blush: 0.8, fx: ['mute'] }, belly),
      walk: Object.assign({ mic: 'none', fHand: [30, -30], fBend: 1, fKind: 'open', fSpread: 1.1, fRot: -0.5, headRot: 0.05, fx: ['echo'] }, belly, kind),
      bust: Object.assign({ mic: 'none', fHand: [20, 50], fBend: 1, fKind: 'relaxed', fRot: 0.4, headRot: 0.04, fx: [] }, belly, kind),
    };
  }
  const rvSpec = {
    id: 'npc_choir_reverb', accent: 'static_choir',
    skel: { neck: [0, -146], headC: [2, -202], shF: [32, -128], shB: [-32, -128] },
    base: { fFoot: [20, -12], bFoot: [-18, -12] },
    poses: rvPoses(),
    life: { idle: { bob: 1.6, per: 2.8, sway: 0.012, head: 0.02 }, sing: { bob: 3.2, per: 0.5, sway: 0.02, head: 0.04 }, cheer: { bob: 1.2, per: 0.9, sway: 0.02, head: 0.025, jump: 8, jumpHz: 1.6 }, walk: { bob: 2.6, per: 0.55, head: 0.01, step: { hz: 1.8, stride: 7, lift: 3 } } },
    face: {
      eyes: [{ x: -14, y: 14, w: 28, h: 25 }, { x: 40, y: 12, w: 24, h: 23 }],
      brows: [[-15, -9, 28], [45, -9, 25]], browStyle: { thick: 6.4, arch: 0.55, tilt: -0.12, color: '#c9ced9' },
      nose: [28, 30, 64], mouth: [10, 42, 26], mouthStyle: { lineW: 1.6 },
      blush: [[-20, 32, 22], [40, 30, 18]], blushColor: '#ef7b6e', sweat: [58, -12, 5],
      eye: { iris: RV.iris, ring: '#26140a', sclera: '#fffaf2', expr: 'neutral', irisW: 0.74, irisH: 0.96, lid: 2.1, wing: 0.4, lash: 1.0, crease: true, lashes: 0, tilt: -0.1, drop: 0.08, hl: [[-0.4, -0.5, 0.28], [-0.32, -0.12, 0.13]] },
    },
    arm: { l: [24, 22], w: [22, 25], skin: RV.robe, skinSh: RV.robeSh, cuff: { color: K.cyan, light: K.cyanSh }, hand: { skin: RV.skin, shade: RV.skinSh } },
    legs: { w: [24, 18], color: K.sock, shade: K.sockSh, bow: 2, shoe: SHOE },
    mic: { accent: K.cyan },
    bounds: { h: 268, x0: -116, x1: 118 },
    bust: { rect: [-96, -276, 96, -96], face: [-84, -270, 84, -126], pose: 'bust' },
    layers: { backHair: (g, S) => { if ((S.P.fx || []).indexOf('echo') >= 0) { g.save(); toFig(g, S.M.head); echoRings(g, S, true); g.restore(); } }, torso: (g, S) => { rvTorso(g, S); rvOver(g, S); }, head: rvHead, fx: rvFx },
  };

  // ======================================================================================================================================
  // THE HUSH (boss): a tall floating hooded figure, a face of soft TV static with two glowing eyes, the capelet, the mute medallion
  // ======================================================================================================================================
  const HU = {
    robe: '#4e576b', robeSh: '#394052', robeHi: '#6c7690', dk: '#2c3240',
    hood: '#5a647a', hoodSh: '#424a5e', hoodHi: '#7984a0', inner: '#1f2430',
    glove: '#cfd2e4', gloveSh: '#a6abc6',
  };
  // the hood in head space: a big rounded cowl whose peak flops back into a soft point with a glowing bead
  const HU_HOOD = [[60, 52], [76, 22], [80, -14], [72, -50], [50, -78], [16, -92], [-20, -96], [-50, -98], [-80, -92, 1], [-70, -82], [-74, -70], [-84, -40], [-86, -4], [-80, 30], [-62, 56], [-30, 70], [22, 68]];
  const HU_FACE = (() => { const out = []; for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU; out.push([8 + Math.cos(a) * 53, 4 + Math.sin(a) * 51]); } return out; })();
  function huHoodBack(g, S) {
    // the cloak hanging from the hood down the back, flaring behind the robe (torso space, behind everything)
    const sw = S.P.hairSwing, d = S.sway * 5 - num(S.P.lean) * 40;
    g.save(); toFig(g, S.M.head); const T = S.M.torso; g.transform(T[0], T[1], T[2], T[3], T[4], T[5]);
    const G = groundFn(S), hem = [[-100 + d, 4, 1], [-80 + d, -6], [-64 + d, 6, 1], [-44 + d * 0.6, -6], [-24, 2, 1]].map((p) => [p[0], Math.min(p[1], G(p[0]) - 2), p[2]]);
    RJ.cel(g, [[-20, -184], [-54, -168], [-76, -114], [-88, -50]].concat(hem, [[0, -120]]), HU.hood, { shadow: HU.hoodSh, line: LINE.main, depth: 12, tension: 0.6, decor: (gg) => {
      RJ.hatch(gg, [[[-50, -130], [-66, -60], [-74, -10]], [[-34, -120], [-44, -60], [-48, -10]]], { color: HU.hoodSh, w: 1.6, alpha: 0.9 });
      RJ.ink(gg, hem, { w: 7, color: K.cyanDk, taper: 0, wobble: 0, weightVar: 0 });
    } });
    g.restore();
    void sw;
  }
  function huEyes(g, S) {
    const st = S.face, lk = st.look || [0, 0], open = clamp(num(st.open, 1), 0, 1), P = S.P, mode = st.eyes;
    const E = [[-14, 8, 24, 32, -1], [34, 6, 20, 29, 1]];
    E.forEach((e) => {
      const x = e[0] + num(lk[0]) * 3, y = e[1] + num(lk[1]) * 3, w = e[2], h = e[3], side = e[4];
      tk.glow(g, x, y, w * 1.6, K.cyan, 0.55, false);
      if (mode === 'happy' || mode === 'closed') {
        const up = mode === 'happy' ? -1 : 1;
        glowLine(g, [[x - w * 0.42, y + 2], [x, y + up * h * 0.22], [x + w * 0.42, y + 2]], 3.6, K.cyanGlow);
        return;
      }
      if (mode === 'hurt') {
        const s = side < 0 ? 1 : -1;       // the chevrons point at each other
        glowLine(g, [[x - s * w * 0.4, y - h * 0.3], [x + s * w * 0.3, y], [x - s * w * 0.4, y + h * 0.3]], 3.6, K.cyanGlow);
        return;
      }
      const hh = h / 2 * Math.max(0.1, open), ww = w / 2 * (mode === 'wide' ? 1.1 : 1);
      g.save();
      g.beginPath(); g.ellipse(x, y, ww, hh, 0, 0, TAU);
      if (mode === 'angry' || mode === 'determined') {               // a slanted lid: lower toward the inner corner
        g.save(); g.clip();
        const tilt = (mode === 'angry' ? 0.55 : 0.35) * hh, inner = side < 0 ? 1 : -1;
        g.beginPath(); g.moveTo(x - ww - 2, y - hh - 2); g.lineTo(x + ww + 2, y - hh - 2); g.lineTo(x + inner * (ww + 2), y - hh * 0.25 + tilt); g.lineTo(x - inner * (ww + 2), y - hh * 0.25 - tilt); g.closePath();
        g.globalCompositeOperation = 'destination-out'; g.fill(); g.restore();
      }
      g.restore();
      // the eye itself, drawn through a clip of the open shape
      g.save();
      g.beginPath(); g.ellipse(x, y, ww, hh, 0, 0, TAU); g.clip();
      if (mode === 'angry' || mode === 'determined') {
        const tilt = (mode === 'angry' ? 0.55 : 0.35) * hh, inner = side < 0 ? 1 : -1;
        g.beginPath(); g.moveTo(x - inner * (ww + 2), y - hh * 0.25 - tilt); g.lineTo(x + inner * (ww + 2), y - hh * 0.25 + tilt); g.lineTo(x + ww + 2, y + hh + 2); g.lineTo(x - ww - 2, y + hh + 2); g.closePath(); g.clip();
      }
      g.fillStyle = '#e8feff'; g.fillRect(x - ww - 2, y - hh - 2, ww * 2 + 4, hh * 2 + 4);
      g.beginPath(); g.ellipse(x, y + hh * 0.75, ww * 1.15, hh * 0.85, 0, 0, TAU); g.fillStyle = K.cyan; g.fill();
      g.beginPath(); g.ellipse(x, y + hh * 0.95, ww * 0.9, hh * 0.45, 0, 0, TAU); g.fillStyle = K.cyanDk; g.globalAlpha = 0.5; g.fill(); g.globalAlpha = 1;
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(x - ww * 0.32, y - hh * 0.42, Math.max(1, ww * 0.34), 0, TAU); g.fill();
      g.beginPath(); g.arc(x + ww * 0.3, y + hh * 0.3, Math.max(0.8, ww * 0.15), 0, TAU); g.fill();
      g.restore();
      g.save(); g.lineWidth = 2.2; g.strokeStyle = '#0d5566'; g.beginPath(); g.ellipse(x, y, ww, hh, 0, 0, TAU); g.stroke(); g.restore();
    });
    // soft blush pixels and the mouth (none, a little glowing 'o', a soft smile or a wavy hum)
    const bl = clamp(num(st.blush, 1), 0, 2);
    if (bl > 0.2) [[-26, 30], [44, 27]].forEach((p) => { g.save(); g.globalAlpha = 0.35 * bl; g.fillStyle = '#ff9fb8'; for (let i = 0; i < 3; i++) g.fillRect(p[0] - 7 + i * 5, p[1] + (i % 2) * 2 - 2, 4, 3); g.restore(); });
    const mo = st.mouth;
    if (mo === 'tiny' || mo === 'sing') { tk.glow(g, 12, 36, 12, K.cyan, 0.5, false); g.beginPath(); g.ellipse(12, 36, mo === 'sing' ? 5 : 3.5, mo === 'sing' ? 6.5 : 3.5, 0, 0, TAU); g.fillStyle = '#e8feff'; g.fill(); g.lineWidth = 1.8; g.strokeStyle = '#0d5566'; g.stroke(); }
    else if (mo === 'smile') glowLine(g, [[2, 32], [12, 38], [22, 32]], 2.6, K.cyanGlow);
    else if (mo === 'wave') { const pts = []; for (let i = 0; i <= 8; i++) pts.push([0 + i * 3.2, 36 + Math.sin(i * 1.4 + S.t * 8) * 2.4]); glowLine(g, pts, 2.2, K.cyanGlow); }
  }
  function huHead(g, S) {
    const P = S.P, t = S.t, glitch = num(P.glitch);
    const sw = P.hairSwing;
    const hood = HU_HOOD.map((p) => (p[1] < -90 ? [p[0] + sw * 3, p[1] + sw * 1.5, p[2]] : p));
    RJ.cel(g, hood, HU.hood, { shadow: HU.hoodSh, line: LINE.main + 0.3, depth: 10, tension: 0.7, hi: HU.hoodHi, hiW: 2.2, decor: (gg) => {
      RJ.hatch(gg, [[[-40, -80], [-56, -60], [-64, -30]], [[30, -78], [52, -56], [62, -26]], [[-56, -96], [-66, -84]]], { color: HU.hoodSh, w: 1.6, alpha: 0.95 });
    } });
    // the face opening: dark hood lining, then the static oval with its soft cyan rim
    RJ.cel(g, HU_FACE.map((p) => [p[0] + (p[0] - 8) * 0.08, p[1] + (p[1] - 8) * 0.06]), HU.inner, { shadow: false, line: LINE.main, tension: 1 });
    g.save();
    g.beginPath(); tk.trace(g, HU_FACE); g.clip();
    tvStatic(g, -50, -52, 116, 120, t, { cell: 4, glitch: glitch, base: P.pose === 'down' ? '#5f6677' : '#7c8496' });
    g.fillStyle = 'rgba(31,36,48,0.35)'; g.beginPath(); g.rect(-60, -60, 140, 140); tk.trace(g, HU_FACE, RJ.lx(5), 7); g.fill('evenodd');   // the hood's shade on the static
    if (glitch > 0.3) { g.fillStyle = 'rgba(255,90,140,0.25)'; g.fillRect(-50, -10 + Math.sin(t * 23) * 20, 116, 6); g.fillStyle = 'rgba(63,216,232,0.3)'; g.fillRect(-50, 20 + Math.sin(t * 17) * 20, 116, 5); }
    huEyes(g, S);
    g.restore();
    RJ.ink(g, HU_FACE, { closed: true, w: 3.4, color: K.cyan, align: 0, wobble: 0, weightVar: 0, alpha: 0.9 });
    RJ.ink(g, HU_FACE, { closed: true, w: LINE.main, color: C.ink, align: 0, wobble: 0.02 });
    // the glowing bead at the hood's tip, on a short cord
    const tip = hood[8], bead = [tip[0] - 6 + sw * 4, tip[1] + 18];
    RJ.ink(g, [[tip[0] + 2, tip[1] + 2], [bead[0], bead[1] - 6]], { w: 2, color: C.ink, taper: 0, wobble: 0 });
    tk.glow(g, bead[0], bead[1], 18, K.cyan, 0.5 + 0.2 * Math.sin(t * 2.4), false);
    RJ.cel(g, tk.circlePts(bead[0], bead[1], 7, 12), K.cyan, { shadow: K.cyanSh, line: LINE.mid, depth: 2, hi: '#ffffff', hiW: 1.4 });
    // the cyan trim along the hood's front edge
    RJ.ink(g, [[60, 52], [76, 22], [80, -14], [72, -50], [50, -78]], { w: 4, color: K.cyan, taper: 0, wobble: 0, weightVar: 0, alpha: 0.95 });
  }
  function huTorso(g, S) {
    const t = S.t;
    robe(g, S, { top: -178, neck: 20, sh: 46, waistY: -100, waist: 42, hemY: 6, hem: 66, n: 10, color: HU.robe, shade: HU.robeSh, hi: HU.robeHi, trim: K.cyan, trimW: 4, trimDy: 5,
      wave: (u, i, SS) => (i % 2 ? -16 : 0) + Math.sin(SS.t * 2.2 + i) * 2.2, sharp: true, swayK: 6, depth: 12,
      folds: [[-30, -96, -48, 0], [-10, -80, -16, 0], [24, -84, 40, 0]],
      band: (gg) => {                                                       // the front panel with an equalizer pattern that softly moves
        RJ.fillPts(gg, [[-6, -178], [14, -178], [20, 10], [-12, 10]], HU.dk, 1);
        RJ.ink(gg, [[-6, -178], [-12, 10]], { w: 1.4, color: K.cyanDk, taper: 0, wobble: 0, weightVar: 0 });
        RJ.ink(gg, [[14, -178], [20, 10]], { w: 1.4, color: K.cyanDk, taper: 0, wobble: 0, weightVar: 0 });
        for (let i = 0; i < 6; i++) {
          const y = -86 + i * 15, hgt = 3 + 4 * Math.abs(Math.sin(t * 2 + i * 1.3)) * tk.motion() + (i % 2) * 2;
          gg.fillStyle = i % 2 ? K.cyanDk : K.cyan;
          gg.fillRect(-2 + i * 0.3, y - hgt / 2, 4, hgt); gg.fillRect(4 + i * 0.4, y - hgt * 0.35, 4, hgt * 0.7); gg.fillRect(10 + i * 0.5, y - hgt * 0.45, 4, hgt * 0.9);
        }
      } });
  }
  // the capelet over the shoulders with its scalloped edge, and the mute-speaker medallion
  function huOver(g, S) {
    const edge = [[64, -128], [50, -132], [38, -118], [26, -128], [14, -112], [2, -124], [-10, -112], [-22, -126], [-34, -116], [-48, -130], [-62, -126]];
    const pts = [[-26, -186], [26, -186], [48, -174], [60, -152], [64, -128, 1]].concat(edge.slice(1, -1).map((p, i) => (i % 2 ? [p[0], p[1], 1] : p)), [[-62, -126, 1], [-60, -152], [-50, -174]]);
    RJ.cel(g, pts, HU.hood, { shadow: HU.hoodSh, line: LINE.main, depth: 8, tension: 0.55, hi: HU.hoodHi, hiW: 1.8, decor: (gg) => {
      RJ.ink(gg, edge, { w: 7, color: K.cyan, taper: 0, wobble: 0, weightVar: 0 });
    } });
    const t = S.t, cx = 4, cy = -154;
    tk.glow(g, cx, cy, 26, K.cyan, 0.3 + 0.15 * Math.sin(t * 2), false);
    RJ.cel(g, tk.circlePts(cx, cy, 15, 16), K.silver, { shadow: K.silverSh, line: LINE.main, depth: 3, hi: '#ffffff', hiW: 1.4 });
    RJ.cel(g, tk.circlePts(cx, cy, 10.5, 14), HU.dk, { shadow: false, line: LINE.fine + 0.2 });
    // the mute icon: a speaker and a slash, in cyan
    g.beginPath(); g.moveTo(cx - 7, cy - 2.5); g.lineTo(cx - 4, cy - 2.5); g.lineTo(cx + 0.5, cy - 6.5); g.lineTo(cx + 0.5, cy + 6.5); g.lineTo(cx - 4, cy + 2.5); g.lineTo(cx - 7, cy + 2.5); g.closePath(); g.fillStyle = K.cyan; g.fill();
    RJ.ink(g, [[cx + 3, cy - 4], [cx + 8, cy + 4]], { w: 2, color: K.cyan, taper: 0, wobble: 0 });
    RJ.ink(g, [[cx + 8, cy - 4], [cx + 3, cy + 4]], { w: 2, color: K.cyan, taper: 0, wobble: 0 });
  }
  function huFx(g, S, name) {
    const t = S.t, m = tk.motion();
    if (name === 'static' || name === 'staticburst') {
      // flecks of static drifting up off the hem and round the figure
      const n = name === 'staticburst' ? 16 : 10, base = mat.pt(S.M.torso, 0, -10);
      for (let i = 0; i < n; i++) {
        const u = fr(t * (0.18 + 0.05 * hsh(i, 1, 0)) * m + hsh(i, 2, 0)), x = base[0] + (hsh(i, 3, 0) - 0.5) * 170 + Math.sin(u * 6 + i) * 8, y = base[1] - u * 260, a = Math.sin(PI * u);
        const s = 3 + 3 * hsh(i, 4, 0), on = hsh(i, 5, Math.floor(t * 6 * m)) > 0.25;
        if (!on) continue;
        g.globalAlpha = a * 0.9; g.fillStyle = C.ink; g.fillRect(x - s / 2 - 1, y - s / 2 - 1, s + 2, s + 2);
        g.fillStyle = i % 3 ? '#c9cfdb' : K.cyan; g.fillRect(x - s / 2, y - s / 2, s, s); g.globalAlpha = 1;
      }
      return;
    }
    choirFx(g, S, name);
  }
  function huPoses() {
    const calm = { eyes: 'open', mouth: 'none', brow: 0 };
    const folded = { mic: 'none', fHand: [-18, 62], fBend: -1, fKind: 'relaxed', fRot: 0.3, bHand: [30, 64], bBend: 1, bKind: 'relaxed', bRot: 0.5, bFront: 1 };
    return {
      idle: Object.assign({}, folded, calm, { headRot: 0.04, look: [0.3, 0], fx: ['static'] }),
      sing: { mic: 'none', fHand: [40, 22], fBend: 1, fKind: 'open', fSpread: 1.1, fRot: -0.3, bHand: [-40, 22], bBend: -1, bKind: 'open', bSpread: 1.1, bRot: 0.3, headRot: -0.08, eyes: 'happy', mouth: 'wave', fx: ['static', 'hum'] },
      attack: { mic: 'none', fHand: [54, -10], fBend: 1, fKind: 'open', fSpread: 1.2, fRot: -1.3, bHand: [-34, 24], bBend: -1, bKind: 'relaxed', lean: 0.05, torsoRot: 0.04, headRot: 0.05, glitch: 0.4,
        eyes: 'angry', mouth: 'none', look: [0.5, 0], fx: ['static', 'hushwave'] },
      hurt: { mic: 'none', fHand: [20, 30], fBend: -1, fKind: 'open', fSpread: 1.3, bHand: [-38, -10], bBend: -1, bKind: 'open', bSpread: 1.3, lean: -0.12, torsoRot: -0.07, headRot: -0.14, headDx: -3, glitch: 1,
        eyes: 'hurt', mouth: 'tiny', fx: ['staticburst', 'stars'] },
      cheer: { mic: 'none', fHand: [54, -54], fBend: 1, fKind: 'open', fSpread: 1.3, fRot: -0.3, bHand: [-54, -54], bBend: -1, bKind: 'open', bSpread: 1.3, bRot: 0.3, eyes: 'happy', mouth: 'smile', blush: 1.6, fx: ['static', 'sparkles'] },
      windup: { mic: 'none', fHand: [60, -44], fBend: 1, fKind: 'open', fSpread: 1.4, fRot: -0.2, bHand: [-60, -44], bBend: -1, bKind: 'open', bSpread: 1.4, bRot: 0.2, lean: -0.05, headRot: -0.06, glitch: 0.6,
        eyes: 'angry', mouth: 'none', fx: ['staticburst'] },
      strike: { mic: 'none', fHand: [58, -16], fBend: 1, fKind: 'open', fSpread: 1.4, fRot: -1.3, bHand: [-34, 20], bBend: -1, bKind: 'relaxed', bx: 8, lean: 0.1, torsoRot: 0.06, headRot: 0.06, headDx: 2, glitch: 0.6,
        eyes: 'angry', mouth: 'none', look: [0.5, 0], fx: ['staticburst', 'hushwave', 'mute'] },
      block: { mic: 'none', fHand: [44, -20], fBend: 1, fKind: 'open', fSpread: 1, fRot: -1.3, bHand: [56, -4], bBend: 1, bKind: 'open', bRot: -1.2, bFront: 1, headRot: -0.03, eyes: 'determined', mouth: 'none', fx: ['rings', 'static'] },
      down: Object.assign({}, folded, { hover: 0, by: 26, torsoRot: 0.05, headRot: 0.22, headDy: 3, glitch: 0.5, eyes: 'closed', mouth: 'none', fFoot: [18, -28], bFoot: [-14, -28], fx: ['mute'] }),
      walk: Object.assign({}, folded, calm, { lean: 0.05, headRot: 0.03, fx: ['static'] }),
      bust: Object.assign({}, folded, calm, { headRot: 0.04, fx: [] }),
    };
  }
  const huSpec = {
    id: 'npc_choir_hush', accent: 'static_choir',
    skel: { hip: [0, -96], neck: [0, -180], headC: [2, -234], shF: [31, -162], shB: [-31, -162], hipF: [14, -90], hipB: [-14, -90] },
    base: { hover: 1, fFoot: [12, -12], bFoot: [-12, -12], headScale: 1.0 },
    poses: huPoses(),
    life: { idle: { bob: 1.4, per: 3.6, sway: 0.016, head: 0.02 }, walk: { bob: 2, per: 1.6, head: 0.01, sway: 0.01, step: { hz: 1, stride: 0.01, lift: 0.01 } } },
    face: { mouth: [12, 36, 14] },
    arm: { l: [30, 27], w: [21, 25], skin: HU.robe, skinSh: HU.robeSh, cuff: { color: K.cyan, light: K.cyanSh }, hand: { skin: HU.glove, shade: HU.gloveSh, k: 1.05 } },
    legs: { w: [16, 12], color: HU.dk, shade: '#20242f', bow: 2, shoe: Object.assign({}, SHOE, { k: 0.75, color: HU.dk, shade: '#20242f', sole: HU.dk }) },
    mic: { accent: K.cyan },
    bounds: { h: 350, x0: -160, x1: 136 },
    bust: { rect: [-108, -344, 100, -124], face: [-94, -340, 90, -166], pose: 'bust' },
    tweak(P, t) {
      // the float: hovering above the floor with a slow drift (the down pose sinks to the floor)
      const hv = num(P.hover, 1), m = tk.motion();
      P.by -= hv * (8 + 4 * Math.sin(t * 1.5) * m);
      if (P.pose === 'idle' || P.pose === 'walk') P.glitch = Math.max(num(P.glitch), Math.max(0, Math.sin(t * 0.9) - 0.85) * 4);
    },
    layers: { backHair: huHoodBack, torso: (g, S) => { huTorso(g, S); huOver(g, S); }, head: huHead, fx: huFx },
  };

  // ======================================================================================================================================
  // registration
  // ======================================================================================================================================
  const crImpl = choirRig(crSpec);
  // the striking point of the cantor is the tip of his fork (the rig's tip hook only sees the layout, so the fork is solved again here)
  crSpec.tip = (P, Lay) => {
    const S = { P, pt: Lay.pt, spec: crSpec };
    return crTipPt(S);
  };
  fzSpec.tip = (P, Lay) => { const k = wristOf({ P, pt: Lay.pt, spec: fzSpec }, true); return [k.w[0] + 18, k.w[1] - 10]; };
  whSpec.tip = (P, Lay) => { const k = wristOf({ P, pt: Lay.pt, spec: whSpec }, true); return [k.w[0] + 14, k.w[1]]; };
  rvSpec.tip = (P, Lay) => mat.pt(Lay.torso, 60, -110);
  huSpec.tip = (P, Lay) => { const k = wristOf({ P, pt: Lay.pt, spec: huSpec }, true); return [k.w[0] + 20, k.w[1]]; };
  RJ.register('npc_choir_hush', choirRig(huSpec));
  RJ.register('npc_choir_crackle', crImpl);
  RJ.register('npc_choir_fuzz', choirRig(fzSpec));
  RJ.register('npc_choir_whisper', choirRig(whSpec));
  RJ.register('npc_choir_reverb', choirRig(rvSpec));

  window.RGCAST = window.RGCAST || {};
  window.RGCAST.static_choir = {
    ids: ['npc_choir_hush', 'npc_choir_crackle', 'npc_choir_fuzz', 'npc_choir_whisper', 'npc_choir_reverb'],
    note: [
      'npc_choir_hush: The Hush (boss), tall floating hooded figure, grey TV-static face with two glowing cyan eyes, flopped hood with a glowing bead, scalloped capelet, mute-speaker medallion.',
      'npc_choir_crackle: Cantor Crackle (enforcer), static-charged silver spiky hair with cyan tips, stand-up lightning collar, zigzag robe band, crackling sparks, tuning-fork staff (tip = fork).',
      'npc_choir_fuzz: Choirboy Fuzz (grunt), kid with a huge fuzzy static-grey hair cloud, too-big pooling robe, white surplice collar with a cyan bow, cyan song book (bonks with it shut).',
      'npc_choir_whisper: Sister Whisper (grunt), long pale veil with a cyan circlet and fork charm, finger to her lips, sleepy lashes, drifting shh letters, hush-wave attack.',
      'npc_choir_reverb: Brother Reverb (merchant/fixer), round and kind, silver beard and tufts, rolled cowl, pouch of tuning forks, echo rings and an echoing HA ha ha.',
    ].join('\n'),
  };
})();
