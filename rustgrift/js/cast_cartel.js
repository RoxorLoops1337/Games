'use strict';
// owned by the cast_cartel agent (see WORLD_DESIGN.md)
//
// THE BASS CARTEL (crew id bass_cartel, purple #7a45b0): subwoofer gangsters in purple hoodies and speaker chains. Andy's 'Thunder Bass' world cousin, the
// rowdy side. Five ART.rj figures built on js/hv/art_cast_kit.js (RJ.rig), drawn in the Hocus Vocus chibi-candy style: warm brown line, ONE hard cel
// shadow, a thin highlight, huge glossy flat eyes with catchlights, blush, idle breathing / blink / cloth sway, and a bass 'wobble' on the beat poses.
//   npc_cartel_sub    Big Sub      boss. Enormous gentle giant (own big skeleton), flat-top, boxed beard, hands in the hoodie pocket, a speaker-chain
//                                  necklace with a gold woofer medallion, a big woofer cone sewn on the back of the hoodie that pumps on the beat.
//   npc_cartel_drop   Drop         enforcer. Teardrop-pointed hood, a visor that DROPS over the eyes when he attacks (glowing slit eyes), crouched and
//                                  springy, a glowing three-bar equaliser patch on the chest.
//   npc_cartel_kick   Kick         grunt twin A. Purple hoodie with lilac trim, a round kick-drum belt buckle, a felt kick-drum beater, band-aid on the near cheek.
//   npc_cartel_snare  Snare        grunt twin B, the mirror: lilac hoodie with purple trim, a snare drum worn as a hat (sticks through the lugs), a twirling
//                                  drumstick, band-aid on the far cheek, leans back where Kick leans in.
//   npc_cartel_wanda  Woofer Wanda merchant / fixer. Big curly puff with a purple head-wrap, cone-speaker earrings, sleeves pushed up, a canvas tool apron,
//                                  carries a little speaker box (her stock) that she aims and blasts.
// Custom pose keys (read by the layers, blended by RJ.blend like any number): pocket (0/1 hands in the hoodie pocket, Big Sub), visor (0 up .. 1 down,
// Drop), stick (drumstick spin, Snare), box ('carry' | 'aim', Wanda). Custom fx names: subwave subnotes thump dropwave.
// No real people, no animal materials: fabric hoodies, webbing belts, canvas apron, rubber and plastic speakers.
(function () {
  if (typeof ART === 'undefined' || !ART.rj || !ART.rj.rig) return;
  const RJ = ART.rj, tk = ART.tk, C = RJ.C, LINE = RJ.LINE, mat = tk.mat;
  const TAU = Math.PI * 2, PI = Math.PI;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : (d === undefined ? 0 : d));
  const fr = (v) => v - Math.floor(v);

  RJ.ACCENT.bass_cartel = { main: '#7a45b0', dark: '#4a2378', light: '#d9c2f5', glow: '#b98aff' };

  // ---- the crew palette (one place to recolour) ----
  const PU = {
    main: '#7a45b0', sh: '#5b2f8d', dk: '#3d1d63', lt: '#a77ddb', hi: '#b996e6',
    lilac: '#c4a2ee', lilacSh: '#9f7bd0', lilacHi: '#e2cdfa',
    glow: '#c99bff', neon: '#f0b8ff',
    gold: '#ffc94d', goldSh: '#d8902a', goldHi: '#fff1b6',
    chrome: '#dfe2ee', chromeSh: '#a0a4ba',
    pants: '#2e2540', pantsSh: '#1d1729', pantsHi: '#4a3d63',
    white: '#fbf6ff', whiteSh: '#d9cdea',
    iris: ['#2a1634', '#8a5cc7'], ring: '#1a0e22',
  };
  const SP = { rim: '#2c2436', surround: '#463c52', surroundSh: '#30283a', cone: '#5c5170', coneSh: '#40374f', cap: '#211b29', capSh: '#120e17' };

  // ------------------------------------------------------------------------------------------------------------------------------------
  // shared helpers
  // ------------------------------------------------------------------------------------------------------------------------------------
  const ell = (cx, cy, rx, ry, n, rot) => tk.ellipsePts(cx, cy, rx, ry, n || 18, rot || 0);
  // change the current layer space to another rig space: from = the layer's matrix, to = target matrix (null = figure space)
  function respace(g, from, to) {
    const M = mat.mul(mat.inv(from), to || mat.I());
    g.transform(M[0], M[1], M[2], M[3], M[4], M[5]);
  }
  // skull, skin shade (through RJ.lx so a flipped figure keeps the key light upper right), optional under(), then the face and the outline
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
    if (o.over) o.over(g);
    RJ.ink(g, skull, { closed: true, w: LINE.main + 0.2, color: C.ink, align: 0.2, weightVar: 0.5 });
  }
  // the wrist of an arm as the rig solves it (to put a prop in a hand and draw the hand again on top)
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
  // portrait framing as art_cast.js crewRig does it (the offset is taken after the zoom shrinks to fit the face)
  function cartelRig(spec) {
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
  // a scalloped closed outline round an ellipse (curls, puffs): n bumps of height amp (share of the radius)
  function scallop(cx, cy, rx, ry, n, amp, phase) {
    const pts = [], steps = 4;
    for (let i = 0; i < n; i++) for (let j = 0; j < steps; j++) {
      const u = j / steps, a = (phase || 0) + ((i + u) / n) * TAU, k = 1 + amp * Math.pow(Math.sin(PI * u), 0.85);
      pts.push(j === 0 ? [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 1] : [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    return pts;
  }
  // points at equal arc length along a smoothed open curve: [{x, y, a (tangent)}]
  function along(pts, gap) {
    const f = tk.flatten(pts, { closed: false, step: 1.2 }), P = [];
    for (let i = 0; i < f.length; i += 2) P.push([f[i], f[i + 1]]);
    const out = [];
    let acc = 0, next = gap / 2;
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      while (d > 0 && acc + d >= next) { const u = (next - acc) / d; out.push({ x: lerp(a[0], b[0], u), y: lerp(a[1], b[1], u), a: Math.atan2(b[1] - a[1], b[0] - a[0]) }); next += gap; }
      acc += d;
    }
    return out;
  }

  // A round speaker face: rim, rubber surround, cone, dust cap, screws, a catch of light. (x, y) centre, r radius; o: {sx (squash across, 3/4 view),
  // rot, pump 0..1 (the cone pushes out), rim, rimSh, cone, cap, screws (bool), line, ring (an extra gold bezel colour)}
  function speaker(g, x, y, r, o) {
    o = o || {};
    const sx = o.sx || 1, pump = clamp(num(o.pump), 0, 1.4), rim = o.rim || SP.rim, rot = o.rot || 0, n = r > 14 ? 22 : 14;
    const L = o.line === undefined ? LINE.main : o.line;
    g.save(); g.translate(x, y);
    RJ.cel(g, ell(0, 0, r * sx, r, n, rot), rim, { shadow: o.rimSh || RJ.shade(rim, 0.1), line: L, depth: Math.max(1, r * 0.12), hi: o.rimHi || RJ.tint(rim, 0.35), hiW: Math.max(0.8, r * 0.06) });
    if (o.ring) RJ.ink(g, ell(0, 0, r * sx * 0.9, r * 0.9, n, rot), { closed: true, w: Math.max(0.8, r * 0.08), color: o.ring, taper: 0, wobble: 0, weightVar: 0 });
    if (o.screws !== false && r > 9) {
      for (let i = 0; i < 4; i++) { const a = PI / 4 + i * PI / 2; g.beginPath(); g.arc(Math.cos(a) * r * 0.9 * sx, Math.sin(a) * r * 0.9, Math.max(0.6, r * 0.055), 0, TAU); g.fillStyle = o.screw || '#8f86a0'; g.fill(); }
    }
    const rs = r * 0.78;
    RJ.cel(g, ell(0, 0, rs * sx, rs, n, rot), SP.surround, { shadow: SP.surroundSh, line: Math.max(0.8, L * 0.6), depth: rs * 0.12 });
    const rc = r * 0.62 * (1 + 0.08 * pump);
    RJ.cel(g, ell(0, 0, rc * sx, rc, n, rot), o.cone || SP.cone, { shadow: o.coneSh || SP.coneSh, line: Math.max(0.7, L * 0.5), depth: rc * 0.22 });
    const rd = r * 0.27 * (1 + 0.18 * pump);
    RJ.cel(g, ell(0, 0, rd * sx, rd, 12, rot), o.cap || SP.cap, { shadow: SP.capSh, line: Math.max(0.7, L * 0.55), depth: rd * 0.3 });
    g.beginPath(); g.arc(RJ.lx(rd * 0.32) * sx, -rd * 0.36, Math.max(0.6, rd * 0.26), 0, TAU); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fill();
    // a thin light catch on the surround toward the key light
    g.save(); g.scale(sx, 1); g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = Math.max(0.7, r * 0.06); g.lineCap = 'round';
    g.beginPath(); const a0 = RJ._flip ? PI + 0.4 : -1.45, a1 = RJ._flip ? PI + 1.45 : -0.4; g.arc(0, 0, r * 0.7, Math.min(a0, a1) + (RJ._flip ? -PI * 0 : 0), Math.max(a0, a1)); g.stroke(); g.restore();
    g.restore();
  }
  // a chain along a curve: oval links in gold (face-on, then edge-on), every o.spk-th link a tiny speaker disc. o: {gap, r, spk, col, sh}
  function chain(g, pts, o) {
    o = o || {};
    const r = o.r || 3.4, list = along(pts, o.gap || r * 1.55), col = o.col || PU.gold, sh = o.sh || PU.goldSh;
    list.forEach((p, i) => {
      if (o.spk && i % o.spk === Math.floor(o.spk / 2)) { speaker(g, p.x, p.y + 1, r * 1.55, { rim: col, rimSh: sh, rimHi: PU.goldHi, screws: false, line: LINE.fine + 0.2 }); return; }
      if (i % 2 === 0) {
        RJ.cel(g, ell(p.x, p.y, r, r * 0.66, 10, p.a), col, { shadow: sh, line: LINE.fine + 0.25, depth: 1.1 });
        g.beginPath(); g.ellipse(p.x, p.y, r * 0.42, r * 0.22, p.a, 0, TAU); g.fillStyle = C.ink; g.globalAlpha = 0.8; g.fill(); g.globalAlpha = 1;
      } else {
        RJ.cel(g, ell(p.x, p.y, r * 0.86, r * 0.32, 8, p.a), col, { shadow: sh, line: LINE.fine + 0.25, depth: 0.8 });
      }
      if (i % 2 === 0) { g.beginPath(); g.arc(p.x + RJ.lx(r * 0.35), p.y - r * 0.3, Math.max(0.5, r * 0.18), 0, TAU); g.fillStyle = PU.goldHi; g.fill(); }
    });
  }
  // a drawstring hanging from (x, y) with a little aglet, swinging with sw
  function drawstring(g, x, y, len, sw, col, tip) {
    const pts = [[x, y], [x + sw * 2, y + len * 0.5], [x + sw * 4, y + len]];
    RJ.ink(g, pts, { w: 3.6, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, pts, { w: 1.8, color: col, taper: 0, wobble: 0, weightVar: 0 });
    RJ.cel(g, tk.rrectPts(x + sw * 4 - 2.2, y + len - 1, 4.4, 7, 1.6), tip || PU.chrome, { shadow: PU.chromeSh, line: LINE.fine + 0.2, depth: 1, tension: 0.3 });
  }
  // The hoodie body in torso rest space. o: {W (half width), top, bot, col, sh, lt, rib (hem band colour), trim (hood + pocket colour), trimSh, pocket,
  //   px (pocket x shift), strings (colour or false), hoodDown (bool), noHem, neck: {w, h, skin, shade}, decor(g)}
  function hoodie(g, S, o) {
    const W = o.W, T = o.top, B = o.bot, sw = S.sway, trim = o.trim || o.col, trimSh = o.trimSh || RJ.shade(trim);
    if (o.hoodDown !== false) {           // the hood lying down behind the neck: a soft roll that shows above the shoulders
      RJ.cel(g, [[-W * 0.62, T + 10], [-W * 0.66, T - 4], [-W * 0.42, T - 15], [0, T - 18], [W * 0.42, T - 15], [W * 0.62, T - 4], [W * 0.58, T + 10]], trim, { shadow: trimSh, line: LINE.main, depth: 6, tension: 0.8 });
    }
    if (o.neck !== false) RJ.neck(g, 2, T - 14, Object.assign({ w: 22, h: 22 }, o.neck));
    const body = [[-15, T], [15, T], [W - 7, T + 5], [W + 1, T + 22], [W + 2, B - 26], [W + 5, B - 3, 1], [W * 0.5, B + 1], [0, B + 1.5], [-W * 0.5, B + 1], [-W - 5, B - 3, 1], [-W - 2, B - 26], [-W - 1, T + 22], [-W + 7, T + 5]];
    RJ.cel(g, body, o.col, { shadow: o.sh, line: LINE.main, depth: 9, hi: o.lt, hiW: 1.8, hiAlpha: 0.75, tension: 0.55, decor: (gg) => {
      if (!o.noHem) {
        gg.fillStyle = o.rib || o.sh; gg.fillRect(-W - 8, B - 10, 2 * W + 16, 14);
        RJ.ink(gg, [[-W - 6, B - 10], [W + 6, B - 10]], { w: 1.3, color: C.ink, taper: 0, wobble: 0, alpha: 0.75, weightVar: 0 });
        const rib = []; for (let x = -W + 2; x < W; x += 5.5) rib.push([x, B - 7, x + 0.4, B - 1]);
        RJ.hatch(gg, rib, { w: 1, color: RJ.shade(o.rib || o.sh, 0.08), alpha: 0.7 });
      }
      // a couple of fold marks at the sides
      RJ.ink(gg, [[-W + 6, T + 24], [-W + 12, T + 36], [-W + 9, T + 48]], { w: 1.3, color: o.sh, taper: 0.5, wobble: 0.02 });
      RJ.ink(gg, [[W - 6, T + 28], [W - 11, T + 40]], { w: 1.3, color: o.lt, taper: 0.5, wobble: 0.02, alpha: 0.9 });
      if (o.decor) o.decor(gg);
    } });
    if (o.pocket !== false) pocket(g, o);
    // the hood's front lip round the neckline
    RJ.cel(g, [[-19, T - 5, 1], [-12, T + 7], [0, T + 11], [12, T + 7], [19, T - 5, 1], [14, T - 2], [7, T + 3], [0, T + 4.5], [-7, T + 3], [-14, T - 2]], trim, { shadow: trimSh, line: LINE.main, depth: 2.5, tension: 0.7 });
    if (o.strings !== false) {
      drawstring(g, -7, T + 7, o.strLen || 26, sw * 0.6, o.strings || PU.white, o.aglet);
      drawstring(g, 8, T + 7, (o.strLen || 26) - 3, sw * 0.6, o.strings || PU.white, o.aglet);
    }
  }
  function pocketPts(o) { const W = o.W, B = o.bot, px = o.px || 3, pw = o.pw || W * 0.62; return [[-pw + px, B - 38, 1], [pw + px, B - 38, 1], [pw + 7 + px, B - 12, 1], [-pw - 7 + px, B - 12, 1]]; }
  function pocket(g, o) {
    const W = o.W, B = o.bot, px = o.px || 3, pw = o.pw || W * 0.62, trim = o.pocketCol || o.col;
    RJ.cel(g, pocketPts(o), trim, { shadow: RJ.shade(trim, 0.09), line: LINE.mid, depth: 3, tension: 0.15 });
    RJ.ink(g, [[-pw + px + 4, B - 34], [-pw + px - 2, B - 16]], { w: 1.3, color: C.ink, taper: 0.4, wobble: 0, alpha: 0.85 });
    RJ.ink(g, [[pw + px - 4, B - 34], [pw + px + 2, B - 16]], { w: 1.3, color: C.ink, taper: 0.4, wobble: 0, alpha: 0.85 });
  }
  // pants with a side stripe and an ankle cuff (legs.decor)
  function pantsDecor(stripe, shade) {
    return function (g, hip, an) {
      const dx = an[0] - hip[0], dy = an[1] - hip[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux;
      if (stripe) {
        const a = [hip[0] + ux * 6 - nx * 3, hip[1] + uy * 6 - ny * 3], b = [an[0] - ux * 10 - nx * 3, an[1] - uy * 10 - ny * 3];
        RJ.ink(g, [a, b], { w: 3.2, color: stripe, taper: 0, wobble: 0, weightVar: 0, alpha: 0.95 });
      }
      const qx = an[0] - ux * 7, qy = an[1] - uy * 7;
      RJ.ink(g, [[qx - nx * 15, qy - ny * 15], [qx + nx * 15, qy + ny * 15]], { w: 1.5, color: C.ink, taper: 0.2, wobble: 0 });
      const mx = (hip[0] + an[0]) / 2, my = (hip[1] + an[1]) / 2;
      RJ.ink(g, [[mx + nx * 4, my + ny * 4], [mx + nx * 10 + ux * 3, my + ny * 10 + uy * 3]], { w: 1.2, color: shade || PU.pantsHi, taper: 0.5, wobble: 0 });
    };
  }

  // ---- shared fx ----
  // fat purple sub-bass shock rings rolling toward +x from (x, y) (sx < 1 squashes them into a cone)
  function subRings(g, x, y, t, beat, col, size) {
    const a = fr(t * 2.6), k = size || 1;
    tk.glow(g, x, y, (34 + 14 * beat) * k, PU.glow, 0.25 + 0.25 * beat, false);
    g.save(); g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const age = a + i, r = (12 + age * 26) * k, al = Math.max(0, 1 - age / 2.9), sp = 0.85 - age * 0.08;
      g.globalAlpha = al;
      g.strokeStyle = C.ink; g.lineWidth = (8 - age * 1.5) * Math.sqrt(k); g.beginPath(); g.ellipse(x, y, r, r * 1.05, 0, -sp, sp); g.stroke();
      g.strokeStyle = i % 2 ? PU.lilac : col; g.lineWidth = (5.2 - age * 1.1) * Math.sqrt(k); g.beginPath(); g.ellipse(x, y, r, r * 1.05, 0, -sp, sp); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.1; g.beginPath(); g.ellipse(x, y, r - 1, r * 1.05 - 1, 0, -sp * 0.85, -sp * 0.3); g.stroke();
    }
    g.restore();
  }
  function fxCommon(g, S, name) {
    const t = S.t, pt = S.pt, A = S.A;
    if (name === 'subwave') { const p = pt.tip; subRings(g, p[0] + 10, p[1], t, S.beat, A.main, S.spec.fxK || 1); if (S.beat > 0.35) RJ.fx.burst(g, p[0] + 34, p[1] - 6, (10 + 9 * S.beat) * (S.spec.fxK || 1), A.main, A.light, t); }
    else if (name === 'thump') { const p = pt.tip; RJ.fx.burst(g, p[0] + 22, p[1], 15 + 9 * S.beat, A.main, A.light, t); }
    else if (name === 'subnotes') { RJ.fx.notes(g, pt.head[0] + (S.spec.noteDx || 10), pt.head[1] - (S.spec.noteDy || 40), t, A.main, 3); }
    else if (name === 'dropwave') { RJ.fx.wave(g, pt.feet[0] + 14, pt.feet[1] - 4, t, A.main); const b = S.beat; if (b > 0.2) { tk.glow(g, pt.feet[0] + 20, pt.feet[1] - 6, 50, PU.glow, 0.3 * b, false); } }
  }
  // the bass wobble on the beat poses: the whole body jiggles a touch as the sub hits
  function wobble(P, t, k) {
    const b = num(P.beat);
    if (b > 0.01) { const w = Math.sin(t * TAU * 7) * b * (k || 1) * tk.motion(); P.squash *= 1 + 0.018 * w; P.headRot += 0.012 * w; }
  }
  const EYE = (o) => Object.assign({ iris: PU.iris, ring: PU.ring, sclera: '#fffbf6', expr: 'neutral', irisW: 0.72, irisH: 0.95, lid: 2.0, wing: 0.5, lash: 1.0, crease: true, lashes: 0, tilt: 0, drop: 0, hl: [[-0.4, -0.5, 0.28], [-0.34, -0.12, 0.13]] }, o);

  // ====================================================================================================================================
  // BIG SUB (boss): the enormous gentle giant. Own big skeleton (about 1.25x the cast), hood down, hands in the pocket, speaker-chain necklace with a
  // gold woofer medallion, a big woofer cone on the back of the hoodie. Deep-voiced menace: half-lidded calm eyes, heavy brows, small smile.
  // ====================================================================================================================================
  const BS = {
    skin: '#b97a52', skinSh: '#985a37', skinHi: '#d89d76', blush: '#e86a7e',
    hair: '#2b1c35', hairSh: '#170e1e', hairHi: '#5d4272', shave: '#6e4a3a',
    shoe: '#fbf6ff', shoeSh: '#d4c6e6', sole: '#e9dcff',
  };
  const BS_SKULL = RJ.skullPts({ w: 1.12, h: 1.0, chin: 6 });
  // flat-top: flat crown, faded sides, square front corner
  const BS_HAIR = [[-60, 2, 1], [-66, -22], [-67, -46], [-63, -66], [-58, -88, 1], [-30, -92], [6, -93], [36, -91], [58, -86, 1], [64, -64], [67, -44], [64, -30, 1], [52, -38], [34, -42], [12, -43], [-10, -41], [-30, -37], [-44, -28], [-50, -12], [-52, 4, 1]];
  const BS_BEARD = [[-60, 2], [-52, 22], [-36, 38], [-16, 48], [0, 54], [24, 52], [44, 38], [58, 20], [63, 12], [72, 30], [70, 80], [-70, 80], [-72, 20]];
  function bsHead(g, S) {
    headBase(g, S, { skull: BS_SKULL, skin: BS.skin, shade: BS.skinSh, cast: [[-64, -40], [-30, -44], [10, -46], [50, -42], [66, -32], [56, -24], [20, -34], [-20, -32], [-52, -20]], castDy: 5,
      under: (gg) => {
        // boxed beard along the jaw and a little goatee under the lip, flat cel
        RJ.fillPts(gg, BS_BEARD, BS.hair, 1);
        RJ.fillPts(gg, BS_BEARD.map((p) => [p[0] + RJ.lx(-3), p[1] + 5]), BS.hairSh, 0.8);
        RJ.fillPts(gg, [[2, 54], [8, 51], [18, 51], [24, 55], [20, 62], [6, 62]], BS.hair, 1);
        RJ.hatch(gg, [[-40, 46, -38, 52], [-20, 55, -19, 60], [30, 53, 31, 58], [48, 42, 50, 47]], { w: 1, color: BS.hairHi, alpha: 0.7 });
      } });
    // the beard's top edge in ink
    RJ.ink(g, [[-58, 2], [-51, 21], [-35, 37], [-16, 47]], { w: LINE.main * 0.9, color: C.ink, taper: 0.3, wobble: 0.02 });
    RJ.ink(g, [[30, 49], [44, 38], [60, 16]], { w: LINE.main * 0.9, color: C.ink, taper: 0.3, wobble: 0.02 });
    // flat-top
    RJ.cel(g, BS_HAIR, BS.hair, { shadow: false, line: LINE.main + 0.2, tension: 0.6, decor: (gg) => {
      RJ.fillPts(gg, [[-68, -60], [-60, -24], [-56, 6], [-48, 4], [-50, -20], [-44, -36], [-60, -64]], BS.shave, 0.55);            // the faded side
      RJ.fillPts(gg, [[-60, -86], [-30, -89], [6, -90], [36, -88], [57, -83], [40, -82], [0, -84], [-40, -82]], BS.hairHi, 0.55);   // light on the flat crown
      RJ.fillPts(gg, [[-66, -40], [-60, -14], [-52, 4], [-50, -12], [-44, -28], [-58, -50]], BS.hairSh, 0.7);
      // a sound wave shaved into the fade
      RJ.ink(gg, [[-62, -52], [-58, -60], [-54, -46], [-50, -58], [-46, -50]], { w: 1.6, color: PU.lilac, taper: 0.2, wobble: 0, alpha: 0.9 });
      RJ.hatch(gg, [[-20, -86, -18, -78], [-6, -88, -4, -80], [10, -88, 12, -80], [26, -86, 28, -78], [42, -84, 44, -76], [-36, -84, -34, -76]], { w: 1.1, color: BS.hairSh, alpha: 0.8 });
    } });
    RJ.ear(g, -60, 24, { r: 15, side: -1, skin: BS.skin, shade: BS.skinSh });
    // a gold stud
    g.beginPath(); g.arc(-62, 36, 2.6, 0, TAU); g.fillStyle = C.ink; g.fill(); g.beginPath(); g.arc(-62, 36, 1.8, 0, TAU); g.fillStyle = PU.gold; g.fill();
  }
  const BS_T = -198, BS_B = -80, BS_W = 70;
  function bsWoofer(g, S) {
    // drawn first (behind the back arm): the big woofer on the back of the hoodie, a fabric bulge round it
    g.save();
    respace(g, S.M.head, S.M.torso);
    const charging = Array.isArray(S.P.fx) && S.P.fx.indexOf('charge') >= 0;
    const pump = S.beat * 1.2 + 0.25 * (0.5 + 0.5 * Math.sin(S.t * 2.2)) + (charging ? 0.7 * (0.5 + 0.5 * Math.sin(S.t * 9)) : 0);
    RJ.cel(g, ell(-72, -142, 30, 54, 22), PU.main, { shadow: PU.sh, line: LINE.main, depth: 8, hi: PU.lt, hiW: 1.6 });
    speaker(g, -88, -142, 46, { sx: 0.5, pump, ring: PU.lilac });
    g.restore();
  }
  function bsTorso(g, S) {
    hoodie(g, S, { W: BS_W, top: BS_T, bot: BS_B, col: PU.main, sh: PU.sh, lt: PU.lt, rib: PU.sh, trim: PU.main, pocket: true, pw: 46, px: 4, strings: PU.lilac, strLen: 30,
      neck: { w: 32, h: 24, skin: BS.skin, shade: BS.skinSh },
      decor: (gg) => { RJ.ink(gg, [[-30, -150], [-24, -134]], { w: 1.3, color: PU.sh, taper: 0.5, wobble: 0.02 }); } });
    // the speaker chain: heavy gold links with tiny speaker discs, down to the medallion
    const sway = S.sway * 1.5;
    chain(g, [[-32, BS_T - 2], [-26, -178], [-12, -162], [4 + sway, -156], [20, -164], [30, -180], [32, BS_T - 2]], { r: 4.2, spk: 5 });
    // the medallion: a gold-rimmed woofer
    speaker(g, 4 + sway, -140, 16, { rim: PU.gold, rimSh: PU.goldSh, rimHi: PU.goldHi, pump: S.beat, screw: PU.goldSh });
    tk.sparkle(g, 14 + sway, -151, 4 + 1.5 * Math.sin(S.t * 3), { color: '#ffffff', glow: 0.2, thin: 0.2 });
  }
  function bsOver(g, S) {
    // hands tucked in the pocket: the pocket's front drawn again over the hands
    if (num(S.P.pocket) > 0.5) pocket(g, { W: BS_W, bot: BS_B, col: PU.main, pw: 46, px: 4 });
  }
  function bsFx(g, S, name) {
    fxCommon(g, S, name);
    if (name === 'charge') {
      // the back woofer charging: a pulsing glow and rings rising off it
      const c = mat.pt(S.M.torso, -90, -142), t = S.t, p = 0.5 + 0.5 * Math.sin(t * 9);
      tk.glow(g, c[0], c[1], 64 + 10 * p, PU.glow, 0.35 + 0.25 * p, false);
      g.save(); g.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const u = fr(t * 1.4 + i / 3), r = 20 + u * 40;
        g.globalAlpha = Math.sin(PI * u) * 0.9;
        g.strokeStyle = C.ink; g.lineWidth = 6; g.beginPath(); g.ellipse(c[0], c[1], r * 0.55, r, 0, PI * 0.55, PI * 1.45); g.stroke();
        g.strokeStyle = PU.lilac; g.lineWidth = 3.2; g.beginPath(); g.ellipse(c[0], c[1], r * 0.55, r, 0, PI * 0.55, PI * 1.45); g.stroke();
      }
      g.restore();
    }
  }
  function bsPoses() {
    const calm = { eyes: 'open', mouth: 'smile', brow: 0.15 };
    const pocketHands = { pocket: 1, mic: 'none', fHand: [-26, 56], fBend: -1, fKind: 'fist', fRot: 0.4, bHand: [16, 60], bBend: 1, bKind: 'fist', bRot: -0.4, bFront: 1 };
    return {
      idle: Object.assign({}, pocketHands, calm, { headRot: 0.04, fx: [] }),
      // the deep voice: one big palm out, 'easy now', purple notes
      sing: Object.assign({}, calm, { pocket: 0, mic: 'none', fHand: [40, -8], fBend: 1, fKind: 'open', fSpread: 0.9, fRot: -0.5, bHand: [34, 58], bBend: 1, bKind: 'fist', bFront: 1,
        mouth: 'sing', eyes: 'half', brow: 0.0, headRot: -0.06, fx: ['subnotes'] }),
      // charging the sub: chest out, fists clenched low, the back woofer glowing up
      windup: { pocket: 0, mic: 'none', fHand: [6, 52], fBend: -1, fKind: 'fist', fRot: 0.3, bHand: [-4, 54], bBend: 1, bKind: 'fist', bRot: -0.3,
        lean: -0.06, torsoRot: -0.05, torsoDy: 3, headRot: -0.06, fFoot: [34, -12], bFoot: [-36, -12], eyes: 'determined', mouth: 'grit', brow: 0.45, look: [0.6, 0], fx: ['charge'] },
      // the haymaker: a giant fist and a sub-bass shockwave
      attack: { pocket: 0, mic: 'none', fHand: [50, -6], fBend: 1, fKind: 'fist', fRot: 0, bHand: [14, 40], bBend: 1, bKind: 'fist', bFront: 1,
        lean: 0.08, torsoRot: 0.06, headRot: 0.06, headDx: 3, fFoot: [38, -12], bFoot: [-34, -12], eyes: 'determined', mouth: 'beat', brow: 0.5, look: [0.6, 0], fx: ['subwave'] },
      strike: { pocket: 0, mic: 'none', fHand: [48, -4], fBend: 1, fKind: 'fist', fRot: 0, bHand: [8, 42], bBend: 1, bKind: 'fist', bFront: 1, bx: 2,
        lean: 0.12, torsoRot: 0.08, headRot: 0.07, headDx: 3, fFoot: [44, -12], bFoot: [-34, -12], eyes: 'angry', mouth: 'beat', brow: 0.5, look: [0.6, 0], fx: ['subwave'] },
      hurt: { pocket: 0, mic: 'none', fHand: [30, 4], fBend: -1, fKind: 'open', fSpread: 1.3, fRot: 0.3, bHand: [-36, -6], bBend: -1, bKind: 'open', bSpread: 1.3, lean: -0.1, torsoRot: -0.07,
        headRot: -0.13, headDx: -3, fFoot: [16, -12], bFoot: [-26, -12], eyes: 'hurt', mouth: 'ow', brow: -0.6, sweat: 1, blush: 0.6, fx: ['stars'] },
      cheer: { pocket: 0, mic: 'none', fHand: [32, -52], fBend: 1, fKind: 'fist', fRot: -0.2, bHand: [-34, -50], bBend: -1, bKind: 'fist', bRot: -0.2, headRot: 0.04,
        fFoot: [26, -12], bFoot: [-26, -12], eyes: 'happy', mouth: 'grin', brow: -0.2, fx: ['sparkles'] },
      // the wall: both forearms up in front of the chest, chin tucked
      block: { pocket: 0, mic: 'none', fHand: [20, -20], fBend: 1, fKind: 'fist', fRot: -1.3, bHand: [58, -16], bBend: 1, bKind: 'fist', bRot: -1.2, bFront: 1, headRot: 0.06, headDy: 3,
        fFoot: [36, -12], bFoot: [-36, -12], eyes: 'determined', mouth: 'flat', brow: 0.45, fx: ['rings'] },
      down: { pocket: 0, mic: 'none', fHand: [14, 52], fBend: 1, fKind: 'relaxed', bHand: [-4, 56], bBend: -1, bKind: 'relaxed', by: 62, torsoDy: 4, torsoRot: 0.07, headRot: 0.22, headDy: 2,
        fFoot: [-14, -74], bFoot: [18, -74], fBow: 30, bBow: -26, fFootRot: -0.5, bFootRot: 0.4, eyes: 'closed', mouth: 'flat', brow: -0.25, blush: 0.6, fx: ['mute'] },
      walk: Object.assign({}, pocketHands, calm, { headRot: 0.03, fx: [] }),
      bust: Object.assign({}, pocketHands, calm, { headRot: 0.04, fx: [] }),
    };
  }
  const bsSpec = {
    id: 'npc_cartel_sub', accent: 'bass_cartel',
    skel: { hip: [0, -92], neck: [0, -188], headC: [2, -240], shF: [48, -168], shB: [-48, -168], hipF: [24, -86], hipB: [-24, -86] },
    base: { headScale: 0.95 },
    poses: bsPoses(),
    life: { idle: { bob: 1.6, per: 4.0, sway: 0.01, head: 0.018 }, sing: { bob: 1.8, per: 2.4, sway: 0.02, head: 0.03, beat: 0.6, beatHz: 1.6 }, walk: { bob: 3.2, per: 0.62, head: 0.012, step: { hz: 1.6, stride: 12, lift: 5 } } },
    face: {
      eyes: [{ x: -18, y: 15, w: 30, h: 26 }, { x: 44, y: 12, w: 26, h: 24 }],
      brows: [[-18, -10, 32], [48, -11, 28]], browStyle: { thick: 7.4, arch: 0.25, tilt: 0.12, color: '#22142b' },
      nose: [26, 30, 70], mouth: [10, 42, 24], mouthStyle: { lineW: 1.7, teeth: true },
      blush: [[-22, 32, 20], [42, 30, 17]], blushColor: BS.blush, sweat: [62, -10, 6],
      eye: EYE({ drop: 0.24, tilt: -0.05, irisW: 0.66, lid: 2.3 }),
    },
    exprs: { angry: { eyes: 'angry', mouth: 'grit', brow: 0.7 } },
    arm: { l: [34, 32], w: [30, 24], skin: BS.skin, skinSh: BS.skinSh, sleeve: { color: PU.main, shade: PU.sh, len: 0.86, w0: 42, w1: 38 }, cuff: { color: PU.sh, light: PU.dk }, hand: { skin: BS.skin, shade: BS.skinSh, k: 1.45 } },
    legs: { w: [54, 42], color: PU.pants, shade: PU.pantsSh, pantsOver: true, bow: 2, profile: (u) => 0.9 + 0.12 * Math.sin(PI * u),
      shoe: { color: BS.shoe, sole: BS.sole, shade: BS.shoeSh, toeCap: PU.lilac, accent: PU.main, k: 1.55 }, decor: pantsDecor(PU.main) },
    bounds: { x0: -132, x1: 150, h: 340 },
    tip: (P, Lay) => Lay.pt.hand,
    fxK: 1.25, noteDx: 44, noteDy: 64,
    bust: { rect: [-112, -340, 112, -110], face: [-92, -336, 86, -170], pose: 'bust' },
    layers: { backHair: bsWoofer, torso: bsTorso, head: bsHead, over: bsOver, fx: bsFx },
    tweak(P, t) { wobble(P, t, 1.2); if (P.pose === 'walk') P.headRot += 0.02 * Math.sin(PI * t * 3.2) * tk.motion(); },
  };

  // ====================================================================================================================================
  // DROP (enforcer): hood up with a teardrop point that flops back, spiky bangs, a visor that drops over the eyes (glowing slit eyes) when he
  // attacks; crouched and springy on his toes. Unique: the glowing equaliser patch on the chest.
  // ====================================================================================================================================
  const DR = { hair: '#3a2450', hairSh: '#21132f', hairHi: '#6a4c88', visor: '#25143a', visorEdge: '#5b2f8d', slit: '#f4c2ff',
    shoe: '#fbf6ff', shoeSh: '#d4c6e6' };
  const DR_HOOD = [[-46, 64], [-66, 40], [-76, 4], [-74, -30], [-66, -58], [-64, -82], [-74, -104, 1], [-46, -92], [-14, -82], [20, -76], [48, -60], [66, -34], [72, -2], [70, 30], [60, 54], [40, 68]];
  const DR_OPEN = ell(10, 12, 54, 56, 24);
  function drBack(g, S) {
    // the hood's back mass (behind the head), the drop point sways
    g.save();
    g.translate(-60, -60); g.rotate(S.P.hairSwing * 0.05); g.translate(60, 60);
    RJ.cel(g, DR_HOOD, PU.main, { shadow: PU.sh, line: LINE.main + 0.2, depth: 10, hi: PU.lt, hiW: 2, tension: 0.75 });
    g.restore();
  }
  function drVisor(g, S, v) {
    // v 0 = pushed up on the hood brow, 1 = down over the eyes
    const y = lerp(-54, 0, v), t = S.t, glow = 0.55 + 0.45 * v;
    const pts = [[-50, y + 4], [-30, y - 3], [10, y - 6], [50, y - 3], [70, y + 4, 1], [68, y + 22, 1], [40, y + 28], [10, y + 30], [-30, y + 27], [-50, y + 22, 1]];
    RJ.cel(g, pts, DR.visor, { shadow: '#160a24', line: LINE.main + 0.2, depth: 4, rim: DR.visorEdge, rimW: 2.4, rimSide: 'light', rimAlpha: 0.9, tension: 0.6, decor: (gg) => {
      // glass sheen
      RJ.fillPts(gg, [[0, y - 6], [14, y - 6], [-6, y + 30], [-20, y + 30]], '#ffffff', 0.12);
      RJ.fillPts(gg, [[22, y - 6], [28, y - 6], [8, y + 30], [2, y + 30]], '#ffffff', 0.1);
    } });
    // the slit: a glowing line, and when it is down two glowing eye-dashes that follow the expression
    const sy = y + 12;
    tk.glow(g, 10, sy, 60, PU.glow, 0.25 * glow, false);
    if (v > 0.6) {
      const ex = S.face.eyes, ang = ex === 'angry' || ex === 'determined' ? 0.22 : ex === 'happy' ? -0.15 : 0.05, hh = ex === 'hurt' ? 2 : 5;
      [[-16, -1], [44, 1]].forEach((e) => {
        g.save(); g.translate(e[0], sy); g.rotate(ang * e[1] * (e[0] < 0 ? -1 : 1));
        tk.glow(g, 0, 0, 18, PU.neon, 0.5, false);
        g.beginPath(); g.ellipse(0, 0, 11, hh * S.face.open + 0.8, 0, 0, TAU); g.fillStyle = DR.slit; g.fill();
        g.beginPath(); g.ellipse(-3, -1, 4, 1.2, 0, 0, TAU); g.fillStyle = '#ffffff'; g.fill();
        g.restore();
      });
    } else {
      RJ.ink(g, [[-38, sy], [60, sy]], { w: 3, color: DR.slit, taper: 0.3, wobble: 0, weightVar: 0, alpha: 0.9 });
      const u = 0.5 + 0.5 * Math.sin(t * 2.4);
      tk.glow(g, lerp(-34, 56, u), sy, 10, PU.neon, 0.9, false);
      g.beginPath(); g.arc(lerp(-34, 56, u), sy, 2.2, 0, TAU); g.fillStyle = '#ffffff'; g.fill();
    }
  }
  function drHead(g, S) {
    const v = clamp(num(S.P.visor), 0, 1);
    headBase(g, S, { skull: RJ.SKULL, cast: [[-60, -40], [-20, -56], [30, -54], [62, -36], [60, -18], [30, -30], [-10, -30], [-50, -20]], castDy: 6 });
    // spiky bangs under the hood
    RJ.cel(g, [[-48, -50], [-30, -60], [0, -62], [34, -58], [60, -44], [58, -26, 1], [48, -34], [40, -18, 1], [30, -34], [16, -14, 1], [6, -34], [-6, -20, 1], [-14, -36], [-30, -22, 1], [-36, -38], [-48, -30]], DR.hair,
      { shadow: DR.hairSh, line: LINE.main, depth: 4, tension: 0.5, hi: DR.hairHi, hiW: 1.4 });
    // the hood ring round the face opening
    g.save();
    g.translate(-60, -60); g.rotate(S.P.hairSwing * 0.05); g.translate(60, 60);
    const outer = DR_HOOD;
    g.beginPath(); tk.trace(g, outer, 0, 0, 0.75); tk.trace(g, DR_OPEN); g.fillStyle = PU.main; g.fill('evenodd');
    g.save(); g.beginPath(); tk.trace(g, outer, 0, 0, 0.75); tk.trace(g, DR_OPEN); g.clip('evenodd');
    g.fillStyle = PU.sh; g.beginPath(); g.rect(-130, -130, 260, 260); tk.trace(g, outer, RJ.lx(6), -9, 0.75); g.fill('evenodd');
    // the inner lip of the hood in a darker band (depth of the opening)
    g.beginPath(); tk.trace(g, ell(10, 12, 60, 62, 24)); tk.trace(g, DR_OPEN); g.fillStyle = PU.dk; g.globalAlpha = 0.55; g.fill('evenodd'); g.globalAlpha = 1;
    g.restore();
    RJ.ink(g, outer, { closed: true, w: LINE.main + 0.3, color: C.ink, align: 0.3, tension: 0.75 });
    RJ.ink(g, DR_OPEN, { closed: true, w: LINE.main, color: C.ink, align: -0.3 });
    RJ.ink(g, [[-58, -70], [-46, -50], [-40, -30]], { w: 1.3, color: PU.sh, taper: 0.5, wobble: 0.02 });       // the seam of the point
    g.restore();
    drVisor(g, S, v);
  }
  const DR_T = -154, DR_B = -62, DR_W = 38;
  function drTorso(g, S) {
    hoodie(g, S, { W: DR_W, top: DR_T, bot: DR_B, col: PU.main, sh: PU.sh, lt: PU.lt, rib: PU.dk, trim: PU.main, hoodDown: false, pocket: true, pw: 24, px: 4, strings: PU.lilac, strLen: 30, aglet: PU.lilac,
      neck: { w: 20, h: 20 } });
    // the equaliser patch on the chest: three bars that pump with the beat
    const x0 = 6, y0 = -116, b = S.beat, t = S.t;
    RJ.cel(g, tk.rrectPts(x0 - 12, y0 - 14, 24, 20, 4), '#1d1129', { shadow: false, line: LINE.mid, tension: 0.3 });
    for (let i = 0; i < 3; i++) {
      const h = 4 + 10 * clamp(0.35 + 0.35 * Math.sin(t * (5 + i * 1.7) + i * 2) + 0.5 * b, 0.1, 1);
      g.beginPath(); g.rect(x0 - 8 + i * 6, y0 + 2 - h, 4, h); g.fillStyle = i === 1 ? PU.neon : PU.glow; g.fill();
    }
    tk.glow(g, x0, y0 - 4, 18, PU.glow, 0.35 + 0.3 * b, false);
  }
  function drPoses() {
    const crouch = { torsoDy: 9, legDy: 9, fBow: 9, bBow: 7, fFootRot: -0.12, bFootRot: -0.18 };
    const cocky = { eyes: 'open', mouth: 'smirkTeeth', brow: 0.25 };
    return {
      idle: Object.assign({}, crouch, cocky, { visor: 0, mic: 'none', fHand: [20, 30], fBend: 1, fKind: 'fist', fRot: -0.6, bHand: [-14, 34], bBend: -1, bKind: 'fist', bRot: 0.2, lean: 0.03, headRot: 0.05, fx: [] }),
      sing: Object.assign({}, crouch, { visor: 0, mic: 'none', fHand: [30, -6], fBend: 1, fKind: 'point', fRot: -0.6, bHand: [-14, 34], bBend: -1, bKind: 'fist', eyes: 'open', mouth: 'grin', brow: 0.2, headRot: -0.04, fx: ['subnotes'] }),
      // about to drop: deep crouch, visor half down, fist cocked
      windup: Object.assign({}, crouch, { visor: 0.55, mic: 'none', torsoDy: 18, legDy: 18, fBow: 16, bBow: 12, lean: -0.04, fHand: [-12, 36], fBend: 1, fKind: 'fist', fRot: -0.4, bHand: [26, 14], bBend: 1, bKind: 'open', bRot: -0.8, bFront: 1,
        fFoot: [28, -12], bFoot: [-26, -12], eyes: 'determined', mouth: 'grit', brow: 0.4, headRot: 0.08, fx: [] }),
      // the drop: visor down, leaping punch, a purple wave on the ground
      attack: { visor: 1, mic: 'none', by: -10, lean: 0.12, torsoRot: 0.1, fHand: [44, -6], fBend: 1, fKind: 'fist', fRot: -0.2, bHand: [-30, -14], bBend: -1, bKind: 'fist', bRot: -0.3,
        fFoot: [32, -18], bFoot: [-30, -8], fFootRot: -0.3, bFootRot: -0.4, eyes: 'determined', mouth: 'grin', brow: 0.5, headRot: 0.06, fx: ['thump'] },
      strike: { visor: 1, mic: 'none', bx: 8, torsoDy: 12, legDy: 12, fBow: 12, bBow: 10, lean: 0.14, torsoRot: 0.14, fHand: [46, 10], fBend: 1, fKind: 'fist', fRot: 0.2, bHand: [-30, -10], bBend: -1, bKind: 'fist',
        fFoot: [40, -12], bFoot: [-34, -12], eyes: 'angry', mouth: 'grin', brow: 0.5, headRot: 0.08, fx: ['thump', 'dropwave'] },
      hurt: { visor: 0, mic: 'none', fHand: [26, 4], fBend: -1, fKind: 'open', fSpread: 1.3, bHand: [-30, -10], bBend: -1, bKind: 'open', bSpread: 1.3, lean: -0.13, torsoRot: -0.08, headRot: -0.15, headDx: -3,
        fFoot: [12, -12], bFoot: [-22, -12], eyes: 'hurt', mouth: 'ow', brow: -0.7, sweat: 1, blush: 0.6, fx: ['stars'] },
      cheer: { visor: 0.15, mic: 'none', fHand: [42, -40], fBend: 1, fKind: 'point', fRot: -0.3, bHand: [-30, -38], bBend: -1, bKind: 'fist', eyes: 'happy', mouth: 'grin', brow: -0.2, headRot: 0.05, fx: ['sparkles'] },
      block: Object.assign({}, crouch, { visor: 1, mic: 'none', fHand: [18, -18], fBend: 1, fKind: 'fist', fRot: -1.3, bHand: [42, -12], bBend: 1, bKind: 'fist', bRot: -1.2, bFront: 1, fFoot: [28, -12], bFoot: [-28, -12],
        eyes: 'determined', mouth: 'flat', brow: 0.4, headRot: 0.08, fx: ['rings'] }),
      down: { visor: 0, mic: 'none', fHand: [16, 44], fBend: 1, fKind: 'relaxed', bHand: [-6, 48], bBend: -1, bKind: 'relaxed', by: 52, torsoDy: 4, torsoRot: 0.08, headRot: 0.25, headDy: 2,
        fFoot: [-12, -60], bFoot: [14, -60], fBow: 24, bBow: -22, fFootRot: -0.5, bFootRot: 0.4, eyes: 'closed', mouth: 'flat', brow: -0.25, blush: 0.6, fx: ['mute'] },
      walk: Object.assign({}, crouch, cocky, { visor: 0, mic: 'none', fHand: [18, 32], fBend: 1, fKind: 'fist', bHand: [-14, 34], bBend: -1, bKind: 'fist', headRot: 0.04, fx: [] }),
      bust: Object.assign({}, cocky, { visor: 0, mic: 'none', fHand: [12, 50], fBend: 1, fKind: 'fist', bHand: [-12, 50], bBend: -1, bKind: 'fist', headRot: 0.04, fx: [] }),
    };
  }
  const drSpec = {
    id: 'npc_cartel_drop', accent: 'bass_cartel', skel: {}, base: {},
    poses: drPoses(),
    // springy: a quick bounce on the toes even standing still
    life: { idle: { bob: 2.6, per: 0.75, sway: 0.015, head: 0.02 }, walk: { bob: 3.4, per: 0.45, head: 0.012, step: { hz: 2.2, stride: 10, lift: 7 } }, windup: { bob: 1.8, per: 0.5, head: 0.01, shake: 0.6 },
      sing: { bob: 2.0, per: 0.9, sway: 0.03, head: 0.035, beat: 0.6, beatHz: 2.2 } },
    face: {
      eyes: [{ x: -14, y: 16, w: 30, h: 28 }, { x: 40, y: 14, w: 25, h: 26 }],
      brows: [[-15, -6, 26], [44, -6, 23]], browStyle: { thick: 5.2, arch: 0.4, tilt: 0.25, color: DR.hairSh },
      nose: [24, 32, 58], mouth: [10, 44, 21], mouthStyle: { lineW: 1.5, teeth: true },
      blush: [[-18, 36, 19], [40, 34, 16]], sweat: [56, -4, 5],
      eye: EYE({ iris: ['#251634', '#b07cf0'], tilt: 0.12, drop: 0.12, wing: 0.7 }),
    },
    arm: { l: [24, 22], w: [17, 13], sleeve: { color: PU.main, shade: PU.sh, len: 0.9, w0: 24, w1: 25 }, cuff: { color: PU.dk, light: '#2a1048' }, hand: { skin: C.skin, shade: C.skinSh } },
    legs: { w: [30, 22], color: PU.pants, shade: PU.pantsSh, pantsOver: true, bow: 3, profile: (u) => 1 - 0.25 * u + 0.12 * Math.sin(PI * u),
      shoe: { color: DR.shoe, sole: '#e9dcff', shade: DR.shoeSh, toeCap: PU.main, accent: PU.lilac, heel: PU.main, k: 1.25 }, decor: pantsDecor(PU.lilac) },
    bounds: { x0: -158, x1: 142, h: 330 },
    tip: (P, Lay) => Lay.pt.hand,
    noteDx: 20,
    bust: { rect: [-100, -312, 92, -100], face: [-84, -306, 80, -136], pose: 'bust' },
    layers: { backHair: drBack, torso: drTorso, head: drHead, fx: fxCommon },
    tweak(P, t) { wobble(P, t, 1); },
  };

  // ====================================================================================================================================
  // THE TWINS: Kick and Snare. One face and build, mirrored details: Kick wears purple with lilac trim, the kick drum on his belt, a felt beater, leans
  // in, band-aid on the near cheek; Snare wears lilac with purple trim, the snare drum on his head, a twirling stick, leans back, band-aid far side.
  // ====================================================================================================================================
  const TW = { skin: '#eab48b', skinSh: '#d08f69', hair: '#3b2346', hairSh: '#22122a', hairHi: '#6d4b80', belt: '#2a2234', aid: '#ffd9b0', aidSh: '#e8b98a',
    felt: '#fbf6ff', feltSh: '#d6c8ea', wood: '#f0cf96', woodSh: '#c99c5c', drumHead: '#fbf6ff', drumHeadSh: '#e0d4ee' };
  const TW_SKULL = RJ.skullPts({ w: 1.06, h: 0.98, chin: 1 });
  function twHair(g, S, kick) {
    // short spiky crop with one big front curl (Kick's flips up, Snare's peeks out under the hat)
    const pts = kick
      ? [[-62, 4, 1], [-68, -24], [-62, -50], [-48, -66], [-54, -78, 1], [-30, -72], [-20, -86, 1], [-2, -72], [14, -84, 1], [26, -66], [48, -58], [62, -40], [66, -22, 1], [52, -30], [36, -34], [20, -34], [6, -44, 1], [-6, -34], [-26, -30], [-42, -20], [-50, -4], [-52, 6, 1]]
      : [[-62, 4, 1], [-68, -24], [-64, -46], [-40, -54], [0, -56], [40, -52], [62, -38], [66, -22, 1], [52, -30], [36, -34], [20, -34], [6, -44, 1], [-6, -34], [-26, -30], [-42, -20], [-50, -4], [-52, 6, 1]];
    RJ.cel(g, pts, TW.hair, { shadow: TW.hairSh, line: LINE.main + 0.1, depth: 5, tension: 0.55, hi: TW.hairHi, hiW: 1.5, decor: (gg) => {
      RJ.hatch(gg, [[-40, -50, -36, -40], [-24, -56, -20, -46], [30, -52, 26, -42], [44, -46, 40, -38]], { w: 1.1, color: TW.hairHi, alpha: 0.8 });
    } });
    // the front tuft: one flame-shaped lock flicking up and forward (sways a little)
    const sw = S.P.hairSwing * 0.06;
    g.save(); g.translate(14, -42); g.rotate(sw); g.translate(-14, 42);
    RJ.cel(g, [[2, -40], [8, -56], [20, -66], [34, -70, 1], [28, -60], [24, -48], [18, -38]], TW.hair, { shadow: TW.hairSh, line: LINE.main, depth: 3, tension: 0.6, hi: TW.hairHi, hiW: 1.3 });
    g.restore();
  }
  function bandAid(g, x, y, rot) {
    g.save(); g.translate(x, y); g.rotate(rot);
    RJ.cel(g, tk.rrectPts(-10, -4, 20, 8, 3.5), TW.aid, { shadow: TW.aidSh, line: LINE.fine + 0.3, depth: 1.5, tension: 0.4 });
    g.beginPath(); g.rect(-3.5, -3, 7, 6); g.fillStyle = '#fff1dd'; g.fill();
    [[-1.5, -1], [1.5, 1], [1.5, -1], [-1.5, 1]].forEach((p) => { g.beginPath(); g.arc(p[0], p[1], 0.6, 0, TAU); g.fillStyle = TW.aidSh; g.fill(); });
    g.restore();
  }
  function snareHat(g, S) {
    // a snare drum worn tilted on the head: shell with chrome hoops and lugs, a white batter head, a stick tucked through the lugs
    const b = S.beat;
    g.save(); g.translate(2, -60); g.rotate(0.14 + S.P.hairSwing * 0.02 - b * 0.04);
    // the spare stick behind
    RJ.cel(g, [[-58, -16], [44, -42], [46, -38], [-56, -12]], TW.wood, { shadow: TW.woodSh, line: LINE.fine + 0.4, depth: 1.2, tension: 0 });
    RJ.cel(g, ell(46, -40, 3.4, 2.6, 10, -0.25), TW.wood, { shadow: TW.woodSh, line: LINE.fine + 0.3, depth: 1 });
    // shell
    const shell = [[-50, -6], [50, -6], [50, 16, 1], [36, 21], [0, 23], [-36, 21], [-50, 16, 1]];
    RJ.cel(g, shell, PU.main, { shadow: PU.sh, line: LINE.main, depth: 5, tension: 0.4, hi: PU.lt, hiW: 1.6, decor: (gg) => {
      // a sparkle wrap: little light flecks
      [[-36, 6], [-20, 12], [-4, 4], [14, 12], [30, 6], [40, 14], [-28, 16], [6, 16]].forEach((p, i) => { gg.beginPath(); gg.arc(p[0], p[1], 1 + (i % 2) * 0.6, 0, TAU); gg.fillStyle = PU.hi; gg.fill(); });
      // chrome lugs
      [-38, -14, 10, 34].forEach((x) => { RJ.cel(gg, tk.rrectPts(x - 3, 2, 6, 10, 2), PU.chrome, { shadow: PU.chromeSh, line: LINE.fine + 0.2, depth: 1, tension: 0.3 }); });
    } });
    // bottom hoop
    RJ.cel(g, [[-52, 14], [-36, 19], [0, 21], [36, 19], [52, 14], [52, 18, 1], [36, 24], [0, 26], [-36, 24], [-52, 18, 1]], PU.chrome, { shadow: PU.chromeSh, line: LINE.fine + 0.4, depth: 1.5, tension: 0.6 });
    // the batter head (an ellipse on top) and its hoop
    RJ.cel(g, ell(0, -6, 52, 12, 26), PU.chrome, { shadow: PU.chromeSh, line: LINE.main, depth: 2 });
    RJ.cel(g, ell(0, -6.5, 47, 9.5, 26), TW.drumHead, { shadow: TW.drumHeadSh, line: LINE.fine + 0.3, depth: 2, hi: '#ffffff', hiW: 1.2 });
    // a little star logo dot on the head, and the tap mark
    tk.sparkle(g, 8, -7, 4 + 3 * b, { color: PU.glow, glow: 0, thin: 0.25 });
    g.restore();
  }
  function kickBuckle(g, S, x, y) {
    // the round kick-drum buckle: purple shell rim, white front head, a little port hole and the crew star
    const b = S.beat;
    const r = 16 * (1 + 0.06 * b);
    RJ.cel(g, ell(x, y, r * 0.9, r, 20), PU.gold, { shadow: PU.goldSh, line: LINE.main, depth: 2.5, hi: PU.goldHi, hiW: 1.2 });
    RJ.cel(g, ell(x, y, r * 0.74, r * 0.82, 20), TW.drumHead, { shadow: TW.drumHeadSh, line: LINE.fine + 0.3, depth: 2.4 });
    RJ.cel(g, ell(x - 3, y + 1, r * 0.45, r * 0.12, 12), PU.main, { shadow: PU.sh, line: LINE.fine, depth: 1, decor: (gg) => {} });
    tk.sparkle(g, x + 3, y - 4, 4.5, { color: PU.main, glow: 0, thin: 0.25 });
    RJ.ink(g, [[x - 5, y + 6], [x + 5, y + 6]], { w: 1.2, color: PU.lilac, taper: 0.3, wobble: 0 });
    g.beginPath(); g.arc(x + RJ.lx(4), y - 7, 1.5, 0, TAU); g.fillStyle = '#ffffff'; g.fill();
  }
  function twTorso(kick) {
    const body = kick ? PU.main : PU.lilac, sh = kick ? PU.sh : PU.lilacSh, lt = kick ? PU.lt : PU.lilacHi, trim = kick ? PU.lilac : PU.main, trimSh = kick ? PU.lilacSh : PU.sh;
    return function (g, S) {
      // the belt (webbing) under a cropped hoodie, then the hoodie
      RJ.cel(g, [[-38, -92], [38, -92], [39, -78, 1], [-39, -78, 1]], TW.belt, { shadow: '#18121f', line: LINE.main, depth: 2, tension: 0.2 });
      hoodie(g, S, { W: 40, top: -154, bot: -88, col: body, sh, lt, rib: trim, trim, trimSh, pocket: true, pocketCol: trim, pw: 24, px: 4, strings: kick ? PU.white : PU.dk, strLen: 22,
        aglet: kick ? PU.lilac : PU.chrome, neck: { w: 21, h: 20, skin: TW.skin, shade: TW.skinSh } });
      if (kick) kickBuckle(g, S, 5, -84);
      else { RJ.cel(g, tk.rrectPts(-3, -90, 14, 10, 2.5), PU.chrome, { shadow: PU.chromeSh, line: LINE.fine + 0.4, depth: 1.5, tension: 0.3 }); }
    };
  }
  // the props: Kick's felt beater, Snare's drumstick; drawn in figure space after the front arm, the fist drawn again on top
  function twProp(kick) {
    return function (g, S) {
      if (S.P.prop === 0) return;
      g.save(); respace(g, S.M.head, null);
      const k = wristOf(S, true), w = k.w, a = k.ang;
      let sa = typeof S.P.stickAbs === 'number' && isFinite(S.P.stickAbs) ? S.P.stickAbs : a - PI / 2 + num(S.P.stickRot);   // through the fist (or a fixed screen angle)
      if (!kick) sa += num(S.P.stick) * S.t * TAU;                   // Snare spins it
      const ux = Math.cos(sa), uy = Math.sin(sa), gx = w[0] + Math.cos(a) * 6, gy = w[1] + Math.sin(a) * 6;
      const p0 = [gx - ux * 12, gy - uy * 12], p1 = [gx + ux * (kick ? 44 : 52), gy + uy * (kick ? 44 : 52)];
      const nx = -uy, ny = ux, hw = kick ? 3 : 2.4, tw = kick ? 2.8 : 1.5;
      RJ.cel(g, [[p0[0] + nx * hw, p0[1] + ny * hw], [p1[0] + nx * tw, p1[1] + ny * tw], [p1[0] - nx * tw, p1[1] - ny * tw], [p0[0] - nx * hw, p0[1] - ny * hw]], kick ? PU.chrome : TW.wood,
        { shadow: kick ? PU.chromeSh : TW.woodSh, line: LINE.fine + 0.5, depth: 1.4, tension: 0 });
      if (kick) {
        // the felt beater head: a fat felt cylinder across the shaft (white felt, a purple band, the round end face showing)
        const c = [p1[0] + ux * 8, p1[1] + uy * 8], hx = 17, hy = 11;
        const box = [[c[0] - nx * hx - ux * hy, c[1] - ny * hx - uy * hy], [c[0] + nx * hx - ux * hy, c[1] + ny * hx - uy * hy], [c[0] + nx * hx + ux * hy, c[1] + ny * hx + uy * hy], [c[0] - nx * hx + ux * hy, c[1] - ny * hx + uy * hy]];
        RJ.cel(g, box, TW.felt, { shadow: TW.feltSh, line: LINE.main, depth: 4, hi: '#ffffff', hiW: 1.4, tension: 0.35, decor: (gg) => {
          const b0 = [c[0] - nx * 4, c[1] - ny * 4], b1 = [c[0] + nx * 4, c[1] + ny * 4];
          gg.beginPath(); gg.moveTo(b0[0] - ux * 14, b0[1] - uy * 14); gg.lineTo(b0[0] + ux * 14, b0[1] + uy * 14); gg.lineTo(b1[0] + ux * 14, b1[1] + uy * 14); gg.lineTo(b1[0] - ux * 14, b1[1] - uy * 14); gg.closePath(); gg.fillStyle = PU.main; gg.fill();
        } });
        const e = [c[0] + nx * hx, c[1] + ny * hx];
        RJ.cel(g, ell(e[0], e[1], hy, 4.5, 12, sa), '#efe6fa', { shadow: TW.feltSh, line: LINE.mid, depth: 1.5 });
      } else {
        RJ.cel(g, ell(p1[0] + ux * 2, p1[1] + uy * 2, 3.6, 2.8, 10, sa), TW.wood, { shadow: TW.woodSh, line: LINE.fine + 0.4, depth: 1 });
      }
      redrawHand(g, S, true, 'fist');
      g.restore();
    };
  }
  function twHead(kick) {
    return function (g, S) {
      headBase(g, S, { skull: TW_SKULL, skin: TW.skin, shade: TW.skinSh, cast: [[-62, -36], [-20, -42], [30, -40], [64, -28], [60, -16], [30, -28], [-10, -26], [-50, -14]], castDy: 5 });
      if (kick) bandAid(g, -26, 36, -0.5); else bandAid(g, 38, 33, 0.55);
      RJ.ear(g, -56, 24, { r: 14, side: -1, skin: TW.skin, shade: TW.skinSh });
      twHair(g, S, kick);
      if (!kick) snareHat(g, S);
    };
  }
  function twPoses(kick) {
    const tough = { eyes: 'open', mouth: kick ? 'grin' : 'smirkTeeth', brow: 0.3 };
    const lean = kick ? 0.04 : -0.04;
    const stick = kick ? 0 : 1;
    return {
      idle: Object.assign({}, tough, { mic: 'none', fHand: [20, 40], fBend: 1, fKind: 'fist', fRot: -0.4, stickAbs: -0.9, stick: kick ? 0 : 0.5, bHand: kick ? [-12, 36] : [-8, 26], bBend: -1, bKind: 'fist', bRot: 0.3, lean, headRot: kick ? 0.06 : -0.06, fx: [] }),
      sing: { mic: 'none', fHand: [30, 14], fBend: 1, fKind: 'fist', fRot: -0.6, stickAbs: 0.3, stick: 0, bHand: [-34, -6], bBend: -1, bKind: 'point', bRot: 0.1, eyes: 'open', mouth: 'beat', brow: 0.15, headRot: kick ? 0.04 : -0.04, lean, fx: ['subnotes'] },
      windup: { mic: 'none', fHand: [-6, 40], fBend: 1, fKind: 'fist', fRot: -0.2, stickAbs: -2.6, stick: 0, bHand: [28, 16], bBend: 1, bKind: 'open', bRot: -0.6, bFront: 1, lean: -0.08, torsoRot: -0.08,
        fFoot: [26, -12], bFoot: [-28, -12], eyes: 'determined', mouth: 'grit', brow: 0.45, fx: [] },
      // the hit: the beater / stick swung down at the foe
      attack: { mic: 'none', fHand: [32, 16], fBend: 1, fKind: 'fist', fRot: 0, stickAbs: 0.55, stick: 0, bHand: [-30, -10], bBend: -1, bKind: 'fist', bRot: -0.3, lean: 0.12, torsoRot: 0.08, headRot: 0.06, headDx: 2,
        fFoot: [34, -12], bFoot: [-26, -12], eyes: 'determined', mouth: 'grin', brow: 0.5, look: [0.5, 0], fx: ['thump'] },
      strike: { mic: 'none', fHand: [34, 22], fBend: 1, fKind: 'fist', fRot: 0, stickAbs: 1.0, stick: 0, bHand: [-30, -10], bBend: -1, bKind: 'fist', bRot: -0.3, lean: 0.15, bx: 2, torsoRot: 0.1, headRot: 0.08, headDx: 2,
        fFoot: [38, -12], bFoot: [-28, -12], eyes: 'angry', mouth: 'grin', brow: 0.5, look: [0.5, 0], fx: ['thump', 'subwave'] },
      hurt: { mic: 'none', fHand: [20, 6], fBend: -1, fKind: 'fist', fRot: 0.6, stick: 0, bHand: [-32, -8], bBend: -1, bKind: 'open', bSpread: 1.3, lean: -0.13, torsoRot: -0.08, headRot: -0.14, headDx: -3,
        fFoot: [12, -12], bFoot: [-22, -12], eyes: 'hurt', mouth: 'ow', brow: -0.7, sweat: 1, blush: 0.6, fx: ['stars'] },
      cheer: { mic: 'none', fHand: [40, -36], fBend: 1, fKind: 'fist', fRot: -0.3, stickAbs: -1.0, stick: kick ? 0 : 1.2, bHand: [-30, -40], bBend: -1, bKind: 'fist', eyes: 'happy', mouth: 'grin', brow: -0.2, headRot: 0.05,
        fFoot: [20, -12], bFoot: [-18, -12], fx: ['sparkles'] },
      block: { mic: 'none', fHand: [20, 2], fBend: 1, fKind: 'fist', fRot: -1.3, stickAbs: 3.0, stick: 0, bHand: [42, -8], bBend: 1, bKind: 'fist', bRot: -1.2, bFront: 1, headRot: 0.06, fFoot: [26, -12], bFoot: [-28, -12],
        eyes: 'determined', mouth: 'flat', brow: 0.4, fx: ['rings'] },
      down: { mic: 'none', prop: 0, fHand: [16, 44], fBend: 1, fKind: 'relaxed', bHand: [-6, 48], bBend: -1, bKind: 'relaxed', by: 52, torsoDy: 4, torsoRot: 0.08, headRot: 0.22, headDy: 2,
        fFoot: [-12, -60], bFoot: [14, -60], fBow: 24, bBow: -22, fFootRot: -0.5, bFootRot: 0.4, eyes: 'closed', mouth: 'flat', brow: -0.25, blush: 0.6, fx: ['mute'] },
      walk: Object.assign({}, tough, { mic: 'none', fHand: [18, 38], fBend: 1, fKind: 'fist', fRot: -0.4, stickAbs: -0.7, stick: 0, bHand: [-12, 34], bBend: -1, bKind: 'fist', lean, fx: [] }),
      bust: Object.assign({}, tough, { mic: 'none', prop: 0, fHand: [10, 50], fBend: 1, fKind: 'fist', bHand: [-10, 50], bBend: -1, bKind: 'fist', fx: [] }),
    };
  }
  function twSpec(kick) {
    const body = kick ? PU.main : PU.lilac, sh = kick ? PU.sh : PU.lilacSh, cuff = kick ? PU.lilac : PU.main;
    return {
      id: kick ? 'npc_cartel_kick' : 'npc_cartel_snare', accent: 'bass_cartel', skel: {}, base: {},
      poses: twPoses(kick),
      life: { idle: { bob: 1.5, per: kick ? 2.2 : 2.6, sway: 0.02, head: 0.025 }, sing: { bob: 1.8, per: 1.2, sway: 0.03, head: 0.04, beat: 0.7, beatHz: 2.2 } },
      face: {
        eyes: [{ x: -14, y: 17, w: 31, h: 29 }, { x: 41, y: 14, w: 26, h: 27 }],
        brows: [[-15, -7, 27], [45, -8, 24]], browStyle: { thick: 6, arch: 0.35, tilt: 0.2, color: TW.hairSh },
        nose: [25, 32, 60], mouth: [9, 45, 24], mouthStyle: { lineW: 1.6, teeth: true },
        blush: [[-18, 36, 21], [40, 34, 18]], sweat: [58, -6, 5],
        eye: EYE({ tilt: 0.1, drop: 0.06 }),
      },
      arm: { l: [24, 22], w: [20, 16], skin: TW.skin, skinSh: TW.skinSh, sleeve: { color: body, shade: sh, len: 0.86, w0: 27, w1: 28 }, cuff: { color: cuff, light: RJ.shade(cuff, 0.12) }, hand: { skin: TW.skin, shade: TW.skinSh, k: 1.12 } },
      legs: { w: [36, 30], color: PU.pants, shade: PU.pantsSh, pantsOver: true, bow: 2, profile: (u) => 0.9 + 0.14 * Math.sin(PI * u),
        shoe: { color: kick ? PU.white : PU.dk, sole: kick ? '#e9dcff' : '#fbf6ff', shade: kick ? PU.whiteSh : '#25103f', toeCap: kick ? PU.lilac : PU.main, accent: kick ? PU.main : PU.lilac, k: 1.3, hi: kick ? undefined : '#6a4598' },
        decor: pantsDecor(kick ? PU.lilac : PU.main) },
      bounds: { x0: -130, x1: 150, h: kick ? 304 : 308 },
      tip: (P, Lay) => { const w = Lay.pt.hand; return [w[0] + 22, w[1] + 18]; },
      bust: kick ? { rect: [-96, -300, 92, -96], face: [-80, -292, 78, -140], pose: 'bust' } : { rect: [-96, -316, 92, -100], face: [-80, -310, 80, -140], pose: 'bust' },
      layers: { torso: twTorso(kick), head: twHead(kick), top: twProp(kick), fx: fxCommon },
      tweak(P, t) {
        wobble(P, t, 1);
        // the twins nod to the beat on opposite counts in their idle
        if (P.pose === 'idle') P.headRot += 0.03 * Math.sin(PI * t * 2 + (kick ? 0 : PI)) * tk.motion();
      },
    };
  }

  // ====================================================================================================================================
  // WOOFER WANDA (merchant / fixer): a big curly puff with a purple head-wrap, cone-speaker earrings, sleeves pushed up, a canvas tool apron, a little
  // speaker box (her stock) carried by the handle or aimed and blasted. Warm and shrewd: knowing half-lidded eyes, a one-sided smile.
  // ====================================================================================================================================
  const WA = { skin: '#a8694a', skinSh: '#87503a', hair: '#2b1a17', hairSh: '#170c0a', hairHi: '#5a3a30', blush: '#e0607c',
    apron: '#e8cf9a', apronSh: '#c9a96d', apronDk: '#a8864e', tee: '#f2e6ff', teeSh: '#d2c0ea', box: '#5b2f8d', boxSh: '#3d1d63', lip: '#9a3b5c' };
  const WA_SKULL = RJ.skullPts({ w: 1.0, h: 1.0, chin: 3 });
  function waEarring(g, x, y, sw, big) {
    // a gold hook and a cone speaker that swings
    const a = sw * 0.35, L = 14, ex = x + Math.sin(a) * L, ey = y + Math.cos(a) * L;
    RJ.ink(g, [[x, y], [ex, ey - 6]], { w: 3.2, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, [[x, y], [ex, ey - 6]], { w: 1.6, color: PU.gold, taper: 0, wobble: 0, weightVar: 0 });
    speaker(g, ex, ey + 4, big ? 10.5 : 9, { rim: PU.gold, rimSh: PU.goldSh, rimHi: PU.goldHi, screws: false, line: LINE.mid, rot: a });
  }
  function waBack(g, S) {
    const sw = S.P.hairSwing;
    // the curly halo behind the head and the big puff on top
    g.save(); g.translate(-10, -88); g.rotate(sw * 0.025); g.translate(10, 88);
    RJ.cel(g, scallop(-10, -84, 48, 38, 11, 0.12, 0.3), WA.hair, { shadow: WA.hairSh, line: LINE.main + 0.2, depth: 8, hi: WA.hairHi, hiW: 1.8, tension: 0.9 });
    g.restore();
    RJ.cel(g, scallop(-6, -2, 76, 70, 16, 0.07, 0.15), WA.hair, { shadow: WA.hairSh, line: LINE.main + 0.2, depth: 9, hi: WA.hairHi, hiW: 1.6, tension: 0.9 });
    // the far earring peeks out behind the jaw
    waEarring(g, 54, 34, sw, false);
  }
  function waHead(g, S) {
    const sw = S.P.hairSwing;
    headBase(g, S, { skull: WA_SKULL, skin: WA.skin, shade: WA.skinSh, cast: [[-62, -36], [-20, -44], [30, -42], [62, -30], [58, -16], [30, -30], [-10, -28], [-50, -16]], castDy: 6 });
    // a pencil tucked behind the ear in the curls (the fixer's tally), drawn under the hair cap and the ear
    RJ.cel(g, [[-86, 14], [-50, -2], [-48, 3], [-84, 19]], '#ffd24d', { shadow: '#e0a52a', line: LINE.fine + 0.4, depth: 1.4, tension: 0 });
    RJ.cel(g, [[-86, 14], [-93, 18, 1], [-84, 19]], '#f1d7b0', { shadow: false, line: LINE.fine + 0.3, tension: 0 });
    // the curly front: a scalloped cap over the top of the skull, curls at the temple
    const cap = [[-66, 10], [-70, -18], [-64, -44], [-48, -60], [-20, -68], [14, -68], [42, -58], [60, -40], [64, -22, 1], [54, -30], [46, -24, 1], [38, -36], [26, -30, 1], [16, -40], [2, -34, 1], [-10, -42], [-24, -34, 1], [-36, -40], [-44, -26], [-50, -8], [-52, 14, 1]];
    RJ.cel(g, cap, WA.hair, { shadow: WA.hairSh, line: LINE.main + 0.1, depth: 6, tension: 0.7, hi: WA.hairHi, hiW: 1.6, decor: (gg) => {
      // curl marks
      RJ.hatch(gg, [[[-50, -40], [-46, -46], [-40, -44]], [[-30, -54], [-26, -60], [-20, -58]], [[-6, -58], [-2, -64], [4, -62]], [[20, -56], [24, -62], [30, -60]], [[40, -48], [44, -54], [50, -50]], [[-60, -16], [-56, -22], [-50, -20]]], { w: 1.3, color: WA.hairHi, alpha: 0.9 });
    } });
    // the purple head-wrap round the base of the puff, knot and tails on the back side
    RJ.cel(g, [[-58, -50], [-36, -66], [0, -74], [34, -68], [52, -56], [48, -46], [30, -56], [0, -62], [-34, -56], [-54, -40]], PU.main, { shadow: PU.sh, line: LINE.main, depth: 3, tension: 0.6, hi: PU.lt, hiW: 1.3, decor: (gg) => {
      [[-40, -58], [-20, -66], [0, -68], [20, -64], [38, -58]].forEach((p) => { gg.beginPath(); gg.arc(p[0], p[1], 1.5, 0, TAU); gg.fillStyle = PU.gold; gg.fill(); });
    } });
    [[[-58, -48], [-74, -40], [-82, -26]], [[-58, -48], [-78, -54], [-90, -48]]].forEach((sp, i) => RJ.lock(g, sp, PU.main, { wMax: 9, w0: 8, w1: 3, tipPow: 1, bend: sw * 0.3 * (i ? -1 : 1), gloss: false, strands: 0, shadow: PU.sh, line: LINE.main }));
    RJ.cel(g, ell(-58, -48, 7, 6.5, 12), PU.main, { shadow: PU.sh, line: LINE.mid, depth: 2, hi: PU.lt, hiW: 1 });
    RJ.ear(g, -54, 24, { r: 13, side: -1, skin: WA.skin, shade: WA.skinSh });
    waEarring(g, -55, 36, sw, true);
  }
  function waTorso(g, S) {
    // zip hoodie open over a lilac tee, then the canvas tool apron at the waist
    RJ.neck(g, 2, -168, { w: 20, h: 22, skin: WA.skin, shade: WA.skinSh });
    hoodie(g, S, { W: 37, top: -154, bot: -80, col: PU.main, sh: PU.sh, lt: PU.lt, rib: PU.dk, trim: PU.main, pocket: false, strings: false, neck: false, noHem: true, decor: (gg) => {
      // the open front: tee showing between the zip edges
      RJ.cel(gg, [[-10, -156], [12, -156], [10, -76], [-12, -76]], WA.tee, { shadow: WA.teeSh, line: LINE.mid, depth: 3, tension: 0.2 });
      RJ.ink(gg, [[-11, -150], [-12, -80]], { w: 2.4, color: PU.gold, taper: 0, wobble: 0, alpha: 0.95 });
      RJ.ink(gg, [[12, -150], [10, -80]], { w: 2.4, color: PU.gold, taper: 0, wobble: 0, alpha: 0.95 });
      tk.sparkle(gg, 1, -124, 5, { color: PU.main, glow: 0, thin: 0.25 });
    } });
    // a little gold speaker-chain choker
    chain(g, [[-14, -156], [-6, -148], [4, -146], [14, -150], [18, -156]], { r: 2.6, spk: 7 });
    // apron: canvas, two pockets, a coiled cable and a screwdriver handle sticking out, a price tag on a string
    const ap = [[-36, -88], [36, -88], [40, -50], [30, -42], [0, -40], [-30, -42], [-40, -50]];
    RJ.cel(g, [[-40, -94], [40, -94], [40, -86], [-40, -86]], WA.apronDk, { shadow: false, line: LINE.mid, tension: 0 });
    RJ.cel(g, ap, WA.apron, { shadow: WA.apronSh, line: LINE.main, depth: 5, tension: 0.3, hi: '#fbe8c0', hiW: 1.3, decor: (gg) => {
      RJ.hatch(gg, [[-30, -60, 30, -60]], { w: 1.2, color: WA.apronDk, alpha: 0.9 });
      RJ.hatch(gg, [[0, -60, 0, -44]], { w: 1.2, color: WA.apronDk, alpha: 0.9 });
      // stitch dashes
      const st = []; for (let x = -32; x < 32; x += 5) st.push([x, -84, x + 2.5, -84]); RJ.hatch(gg, st, { w: 1, color: WA.apronDk, alpha: 0.8 });
    } });
    // screwdriver handle in the left pocket, cable coil in the right
    RJ.cel(g, tk.rrectPts(-24, -74, 7, 15, 3), PU.lilac, { shadow: PU.lilacSh, line: LINE.fine + 0.4, depth: 1.5, tension: 0.4 });
    RJ.ink(g, [[14, -62], [16, -70], [24, -72], [26, -64], [20, -60], [18, -68]], { w: 3.4, color: C.ink, taper: 0, wobble: 0 });
    RJ.ink(g, [[14, -62], [16, -70], [24, -72], [26, -64], [20, -60], [18, -68]], { w: 1.8, color: PU.main, taper: 0, wobble: 0 });
    const ts = S.sway * 3;
    RJ.ink(g, [[30, -86], [33 + ts, -72]], { w: 1, color: C.inkSoft, taper: 0, wobble: 0 });
    RJ.cel(g, [[28 + ts, -72], [38 + ts, -72], [40 + ts, -62], [30 + ts, -60]], '#fffaf1', { shadow: '#e6dcc8', line: LINE.fine + 0.3, depth: 1, tension: 0.2, decor: (gg) => {
      RJ.hatch(gg, [[31 + ts, -68, 37 + ts, -68], [31 + ts, -65, 35 + ts, -65]], { w: 1, color: PU.main, alpha: 0.9 });
    } });
  }
  // the speaker box in her front hand: carried by the handle, or aimed (face forward) and blasting
  function waBox(g, S) {
    if (S.P.box === 'none') return;
    g.save(); respace(g, S.M.head, null);
    const k = wristOf(S, true), w = k.w, aim = S.P.box === 'aim', b = S.beat;
    const cx = aim ? w[0] + Math.cos(k.ang) * 18 : w[0] + 4, cy = aim ? w[1] + Math.sin(k.ang) * 18 : w[1] + 26, rot = aim ? clamp(k.ang * 0.3, -0.3, 0.3) : S.sway * 0.06;
    g.save(); g.translate(cx, cy); g.rotate(rot);
    if (!aim) {
      // the handle the fist holds
      RJ.ink(g, [[-9, -16], [-9, -24], [9, -24], [9, -16]], { w: 5.2, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
      RJ.ink(g, [[-9, -16], [-9, -24], [9, -24], [9, -16]], { w: 2.8, color: PU.lilac, taper: 0, wobble: 0, weightVar: 0 });
    }
    const pump = aim ? b * 1.2 : 0.2 * (0.5 + 0.5 * Math.sin(S.t * 3));
    RJ.cel(g, tk.rrectPts(-16, -17, 32, 36, 6), WA.box, { shadow: WA.boxSh, line: LINE.main, depth: 4, tension: 0.4, hi: PU.lt, hiW: 1.4 });
    speaker(g, 0, 5, 11.5, { pump, line: LINE.mid, ring: PU.gold });
    speaker(g, 0, -10, 4, { screws: false, line: LINE.fine + 0.2, cap: PU.gold });
    g.beginPath(); g.arc(11, -12, 1.6, 0, TAU); g.fillStyle = '#7dff9a'; g.fill(); tk.glow(g, 11, -12, 6, '#7dff9a', 0.6, false);
    g.restore();
    if (!aim) redrawHand(g, S, true, 'fist');
    g.restore();
  }
  function waFx(g, S, name) {
    fxCommon(g, S, name);
    if (name === 'blast') {
      const k = wristOf(S, true), w = k.w;
      const x = w[0] + Math.cos(k.ang) * 18 + 22, y = w[1] + Math.sin(k.ang) * 18 + 5;
      RJ.fx.arcs(g, x, y, 0, S.t, S.A.main, 3);
      if (S.beat > 0.4) RJ.fx.burst(g, x + 40, y - 2, 10 + 8 * S.beat, S.A.main, S.A.light, S.t);
    }
    if (name === 'coin') {
      // a tiny sparkle of a done deal over her shoulder
      RJ.fx.sparkles(g, S.pt.head[0], S.pt.head[1], [[66, -40, 6, 0.3], [80, -10, 4, 0]], PU.gold, S.t);
    }
  }
  function waPoses() {
    const shrewd = { eyes: 'open', mouth: 'smirk', brow: 0.15 };
    const hip = { bHand: [-12, 38], bBend: -1, bKind: 'fist', bRot: 1.4 };
    return {
      idle: Object.assign({}, shrewd, hip, { box: 'carry', mic: 'none', fHand: [12, 34], fBend: 1, fKind: 'fist', fRot: -1.2, headRot: 0.05, lean: -0.02, fx: [] }),
      // the sales pitch: the box held up to show it off, the other hand pointing at it, 'listen to that, honey'
      sing: { box: 'aim', mic: 'none', fHand: [34, -6], fBend: 1, fKind: 'fist', bHand: [44, 14], bBend: 1, bKind: 'point', bRot: -0.5, bFront: 1,
        eyes: 'open', mouth: 'happyOpen', brow: -0.1, headRot: -0.06, fx: ['coin'] },
      windup: { box: 'aim', mic: 'none', fHand: [-4, 14], fBend: 1, fKind: 'fist', bHand: [16, 4], bBend: 1, bKind: 'open', bRot: -1.2, bFront: 1, lean: -0.06, torsoRot: -0.06,
        fFoot: [26, -12], bFoot: [-26, -12], eyes: 'smirk', mouth: 'smirkTeeth', brow: 0.35, fx: [] },
      attack: Object.assign({}, hip, { box: 'aim', mic: 'none', fHand: [44, -6], fBend: 1, fKind: 'fist', lean: 0.08, torsoRot: 0.06, headRot: 0.04, fFoot: [32, -12], bFoot: [-26, -12],
        eyes: 'determined', mouth: 'grin', brow: 0.4, fx: ['blast'] }),
      strike: Object.assign({}, hip, { box: 'aim', mic: 'none', fHand: [46, -10], fBend: 1, fKind: 'fist', lean: 0.12, bx: 4, torsoRot: 0.08, headRot: 0.05, fFoot: [36, -12], bFoot: [-28, -12],
        eyes: 'determined', mouth: 'grin', brow: 0.45, fx: ['blast', 'subwave'] }),
      hurt: { box: 'carry', mic: 'none', fHand: [8, 36], fBend: 1, fKind: 'fist', fRot: -1.2, bHand: [-30, -10], bBend: -1, bKind: 'open', bSpread: 1.3, lean: -0.12, torsoRot: -0.08, headRot: -0.14, headDx: -3,
        fFoot: [12, -12], bFoot: [-22, -12], eyes: 'hurt', mouth: 'ow', brow: -0.7, sweat: 1, blush: 0.6, fx: ['stars'] },
      cheer: { box: 'carry', mic: 'none', fHand: [46, -32], fBend: 1, fKind: 'fist', fRot: -1.4, bHand: [-30, -40], bBend: -1, bKind: 'open', bSpread: 1.3, eyes: 'happy', mouth: 'happyOpen', brow: -0.2, headRot: 0.05,
        fFoot: [20, -12], bFoot: [-18, -12], fx: ['sparkles', 'coin'] },
      // the speaker held up as a shield
      block: { box: 'aim', mic: 'none', fHand: [26, -26], fBend: 1, fKind: 'fist', bHand: [36, -10], bBend: 1, bKind: 'open', bRot: -1.3, bFront: 1, headRot: 0.06, fFoot: [26, -12], bFoot: [-28, -12],
        eyes: 'determined', mouth: 'flat', brow: 0.35, fx: ['rings'] },
      down: { box: 'none', mic: 'none', fHand: [16, 44], fBend: 1, fKind: 'relaxed', bHand: [-6, 48], bBend: -1, bKind: 'relaxed', by: 52, torsoDy: 4, torsoRot: 0.08, headRot: 0.22, headDy: 2,
        fFoot: [-12, -60], bFoot: [14, -60], fBow: 24, bBow: -22, fFootRot: -0.5, bFootRot: 0.4, eyes: 'closed', mouth: 'flat', brow: -0.25, blush: 0.6, fx: ['mute'] },
      walk: Object.assign({}, shrewd, { box: 'carry', mic: 'none', fHand: [12, 34], fBend: 1, fKind: 'fist', fRot: -1.2, bHand: [-14, 34], bBend: -1, bKind: 'relaxed', bRot: 0.3, headRot: 0.04, fx: [] }),
      bust: Object.assign({}, shrewd, { box: 'none', mic: 'none', fHand: [10, 50], fBend: 1, fKind: 'fist', bHand: [-10, 50], bBend: -1, bKind: 'relaxed', fx: [] }),
    };
  }
  const waSpec = {
    id: 'npc_cartel_wanda', accent: 'bass_cartel', skel: {}, base: {},
    poses: waPoses(),
    life: { idle: { bob: 1.2, per: 3.4, sway: 0.015, head: 0.02 }, sing: { bob: 1.4, per: 1.6, sway: 0.03, head: 0.045, beat: 0.4, beatHz: 1.8 } },
    face: {
      eyes: [{ x: -14, y: 16, w: 30, h: 27 }, { x: 40, y: 13, w: 25, h: 25 }],
      brows: [[-15, -8, 26], [45, -10, 23]], browStyle: { thick: 4.6, arch: 0.6, tilt: 0.1, color: WA.hairSh },
      nose: [25, 31, 58], mouth: [10, 43, 21], mouthStyle: { lineW: 1.6, ink: WA.lip, teeth: true },
      blush: [[-18, 34, 19], [40, 32, 16]], blushColor: WA.blush, sweat: [56, -6, 5],
      eye: EYE({ iris: ['#3a1f12', '#c27c33'], drop: 0.26, tilt: 0.08, lashes: 2, wing: 0.8, lash: 1.15 }),
    },
    exprs: { happy: { eyes: 'happy', mouth: 'happyOpen', brow: -0.1 } },
    arm: { l: [24, 22], w: [16, 12], skin: WA.skin, skinSh: WA.skinSh, sleeve: { color: PU.main, shade: PU.sh, len: 0.52, w0: 25, w1: 27 },
      hand: { skin: WA.skin, shade: WA.skinSh } },
    legs: { w: [32, 30], color: '#3a2d4f', shade: '#251c35', pantsOver: true, bow: 2, profile: (u) => 0.86 + 0.2 * u * u,
      shoe: { color: PU.lilac, sole: '#fbf6ff', shade: PU.lilacSh, toeCap: PU.main, accent: PU.gold, k: 1.25 }, decor: pantsDecor(null, '#54456e') },
    bounds: { x0: -150, x1: 132, h: 344 },
    tip: (P, Lay) => { const w = Lay.pt.hand; return [w[0] + 30, w[1] + 2]; },
    bust: { rect: [-104, -330, 96, -100], face: [-88, -324, 82, -140], pose: 'bust' },
    layers: { backHair: waBack, torso: waTorso, head: waHead, top: waBox, fx: waFx },
    tweak(P, t) { wobble(P, t, 0.8); },
  };

  RJ.register('npc_cartel_sub', cartelRig(bsSpec));
  RJ.register('npc_cartel_drop', cartelRig(drSpec));
  RJ.register('npc_cartel_kick', cartelRig(twSpec(true)));
  RJ.register('npc_cartel_snare', cartelRig(twSpec(false)));
  RJ.register('npc_cartel_wanda', cartelRig(waSpec));

  window.RGCAST = window.RGCAST || {};
  window.RGCAST.bass_cartel = {
    ids: ['npc_cartel_sub', 'npc_cartel_drop', 'npc_cartel_kick', 'npc_cartel_snare', 'npc_cartel_wanda'],
    note: [
      'npc_cartel_sub: Big Sub, boss. Enormous gentle giant (own big skeleton), flat-top and boxed beard, hands in the hoodie pocket, speaker-chain necklace with a gold woofer medallion, a woofer on the back that pumps on the beat; palm-push sub-bass shockwave.',
      'npc_cartel_drop: Drop, enforcer. Teardrop-pointed hood, crouched and springy, a visor that drops over the eyes into glowing slit-eyes when he attacks, glowing equaliser patch; leaping punch and ground wave.',
      'npc_cartel_kick: Kick, grunt twin. Purple hoodie with lilac trim, round kick-drum belt buckle, felt kick beater, band-aid near cheek, leans in.',
      'npc_cartel_snare: Snare, grunt twin. Mirror of Kick: lilac hoodie with purple trim, snare drum worn as a hat with a stick through the lugs, twirling drumstick, band-aid far cheek, leans back.',
      'npc_cartel_wanda: Woofer Wanda, merchant/fixer. Big curly puff with purple head-wrap, cone-speaker earrings, pencil behind the ear, open zip hoodie and canvas tool apron, carries a speaker box she aims and blasts.',
    ].join('\n'),
  };
})();
