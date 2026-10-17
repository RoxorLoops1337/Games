'use strict';
// owned by the cast_loop agent (see WORLD_DESIGN.md)
// =====================================================================================================================================
// THE LOOP RATS (crew id loop_rats, lime #6cc22e): street beatbox & looper buskers. Chaotic, loud, loyal. Five ART.rj figures built on the
// Hocus Vocus chibi kit (js/hv/art_cast_kit.js; same ink line, one hard warm cel shadow, a thin highlight, big flat glossy eyes, blush):
//   npc_loop_mama   Mama Loop (boss)      elder busker queen: a huge curly grey-green hair cloud with a guitar-pick crown, vinyl earrings, a lime
//                                         fringed shawl over a plum dress, a LOOP-PEDAL BACKPACK whose three pedals light up, a mic on a coiled cord.
//                                         Accent: plum + gold. Built bigger (taller skeleton, larger head, broader shoulders).
//   npc_loop_stomp  Stomp (enforcer)      tap-dancing bruiser: broad barrel chest, a tiny lime bowler hat on a flat-top, cherry-red suspenders and
//                                         sweatbands, cropped pinstripe trousers and SPRING-HEELED TAP BOOTS (silver taps, coil springs that squash).
//                                         Accent: cherry red. His strike is a stomp with a ground shockwave.
//   npc_loop_echo   Echo (grunt)          a small kid in an oversized lime hoodie, giant cyan HEADPHONES over a messy mop with a lime streak, a
//                                         yellow MEGAPHONE that shouts sound arcs. Accent: sunny yellow + cyan. The shortest of the crew.
//   npc_loop_tape   Tape Worm (grunt)     lanky, hunched cassette-hoarder: a lavender beanie, a long SCARF OF MAGNETIC TAPE wound round the neck with
//                                         pastel cassettes dangling and clinking, an olive parka with bulging pockets; lashes a stream of tape.
//                                         Accent: lavender.
//   npc_loop_dotty  Dotty Dub (merchant)  cheerful pedal merchant: two round hair puffs, cobalt GOGGLES on her forehead, a lime polka-dot bandana,
//                                         rolled sleeves, a TOOL BELT with wrench, screwdriver and spare pedals, a cobalt fuzz pedal held up to sell.
//                                         Accent: cobalt blue.
// All are fictional, no animal materials (canvas, plastic, rubber, metal). Every figure: the ten kit poses + 'bust', idle breathing, blink,
// hair and cloth sway, flips cleanly (o.flip), and a portrait crop. Props hanging on the body are drawn in the torso layer or, when they sit
// behind the body (the backpack), in backHair through the torso matrix; hand-held props are drawn in figure space from 'top' and the
// gripping hand is drawn again on top so a prop never hides its own fingers.
// =====================================================================================================================================
(function () {
  if (typeof ART === 'undefined' || !ART.rj || !ART.rj.rig || !ART.tk) return;
  const RJ = ART.rj, tk = ART.tk, C = RJ.C, LINE = RJ.LINE, mat = tk.mat;
  const TAU = Math.PI * 2, PI = Math.PI;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const fr = (v) => v - Math.floor(v);
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : (d === undefined ? 0 : d));

  // the crew accent (the kit reads RJ.ACCENT[spec.accent] for the mic band and the kit effects)
  const LIME = { main: '#6cc22e', dark: '#3f8f1a', light: '#d3f0b0', glow: '#a6e65a' };
  RJ.ACCENT.loop_rats = LIME;
  const L = { lime: '#6cc22e', limeSh: '#4f9a1e', limeDk: '#3f8f1a', limeHi: '#a6e65a', limeLt: '#d3f0b0' };

  // ---------------------------------------------------------------------------------------------------------------------------------
  // shared helpers
  // ---------------------------------------------------------------------------------------------------------------------------------
  // a box with rounded corners as an explicit polygon (draw with tension 0)
  function rbox(x, y, w, h, r, n) {
    r = Math.min(r, w / 2, h / 2); n = n || 3;
    const pts = [], cs = [[x + w - r, y + r, -0.5], [x + w - r, y + h - r, 0], [x + r, y + h - r, 0.5], [x + r, y + r, 1]];
    for (let c = 0; c < 4; c++) for (let i = 0; i <= n; i++) { const a = (cs[c][2] + i / n * 0.5) * PI; pts.push([cs[c][0] + Math.cos(a) * r, cs[c][1] + Math.sin(a) * r]); }
    return pts;
  }
  // skull, soft skin shadow, optional hair cast shadow, the face and the outline (as the HV crew's headBase). o: {skull, skin, shade, cast, castDy, under}
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
  // draw fn(g) in another space from inside a layer: from = the layer's matrix (S.M.head or S.M.torso), to = the target (null = figure space)
  function within(g, from, to, fn) {
    g.save();
    try {
      const I = mat.inv(from); g.transform(I[0], I[1], I[2], I[3], I[4], I[5]);
      if (to) g.transform(to[0], to[1], to[2], to[3], to[4], to[5]);
      fn(g);
    } finally { g.restore(); }
  }
  // the wrist of an arm, solved as the rig solves it
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
  function led(g, x, y, r, col, halo, a) {
    g.beginPath(); g.arc(x, y, r + 0.9, 0, TAU); g.fillStyle = C.ink; g.fill();
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = col; g.fill();
    g.beginPath(); g.arc(x - r * 0.3, y - r * 0.32, r * 0.38, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fill();
    if (halo) tk.glow(g, x, y, halo, col, a === undefined ? 0.6 : a, false);
  }
  // a scalloped cloud outline: n round bumps around an ellipse (curly hair, puffs). Corner points between bumps are sharp.
  function cloud(cx, cy, rx, ry, n, amp, ph, a0, a1) {
    const pts = [], full = a0 === undefined, A0 = full ? 0 : a0, span = full ? TAU : a1 - a0, steps = 5;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < steps; j++) {
        const u = j / steps, a = (ph || 0) + A0 + ((i + u) / n) * span, k = 1 + amp * Math.pow(Math.sin(PI * u), 0.6);
        pts.push(j === 0 ? [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 1] : [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
      }
    }
    if (!full) { const a = (ph || 0) + A0 + span; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 1]); }
    return pts;
  }
  // little curl spirals (one path): list of [x, y, r, rot]
  function curls(g, list, col, w, alpha) {
    RJ.hatch(g, list.map((c) => {
      const pts = [];
      for (let i = 0; i <= 9; i++) { const u = i / 9, a = (c[3] || 0) + u * 4.4, r = c[2] * (1 - 0.62 * u); pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]); }
      return pts;
    }), { color: col, w: w || 1.3, alpha: alpha === undefined ? 0.9 : alpha });
  }
  // a pastel cassette, centred at (x, y), w wide, rotated. o: {label, body, reel}
  function cassette(g, x, y, w, rot, col, o) {
    o = o || {};
    const h = w * 0.64;
    g.save(); g.translate(x, y); g.rotate(rot || 0);
    RJ.cel(g, rbox(-w / 2, -h / 2, w, h, w * 0.1, 2), col, { shadow: RJ.shade(col, 0.12), line: LINE.mid, tension: 0, depth: Math.max(1.2, w * 0.08), hi: RJ.tint(col, 0.45), hiW: 1 });
    RJ.cel(g, rbox(-w * 0.38, -h * 0.36, w * 0.76, h * 0.42, w * 0.05, 2), o.label || '#fff6e2', { shadow: false, line: LINE.fine, tension: 0 });
    g.beginPath(); g.rect(-w * 0.22, -h * 0.24, w * 0.44, h * 0.16); g.fillStyle = '#3a2a2a'; g.fill();
    [-1, 1].forEach((sd) => { g.beginPath(); g.arc(sd * w * 0.13, -h * 0.16, Math.max(0.8, w * 0.055), 0, TAU); g.fillStyle = o.reel || '#fff6e2'; g.fill(); });
    RJ.cel(g, [[-w * 0.3, h / 2], [-w * 0.22, h * 0.18], [w * 0.22, h * 0.18], [w * 0.3, h / 2]], RJ.shade(col, 0.06), { shadow: false, line: LINE.fine, tension: 0 });
    g.restore();
  }
  // a lime loop glyph (infinity) of size r at (x, y): ink under, lime over, white glint
  function loopGlyph(g, x, y, r, a, col) {
    if (!(a > 0.02)) return;
    const pts = [];
    for (let i = 0; i <= 28; i++) { const u = i / 28 * TAU; pts.push([x + Math.sin(u) * r, y + Math.sin(u) * Math.cos(u) * r * 0.9]); }
    g.save(); g.globalAlpha *= clamp(a, 0, 1);
    tk.inkPath(g, pts, { w: Math.max(3, r * 0.42), color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
    tk.inkPath(g, pts, { w: Math.max(1.6, r * 0.24), color: col || L.lime, taper: 0, wobble: 0, weightVar: 0 });
    g.restore();
  }
  // lime loops rising and orbiting from (x, y)
  function fxLoops(g, x, y, t, n, col) {
    for (let i = 0; i < n; i++) {
      const u = fr(t * 0.45 + i / n), a = Math.sin(PI * u);
      loopGlyph(g, x + Math.sin(u * 5 + i * 2.1) * 14 + (i - (n - 1) / 2) * 16, y - u * 58, 7 + 4 * a + i, a * 0.95, i % 2 ? L.limeHi : L.lime);
    }
  }
  // PORTRAIT FRAMING (as the HV crewRig): the crop offset is taken after the face-fit shrink so a tall box never pushes the head down.
  function rig(spec) {
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
  // the common hurt / down poses (each figure adds its own hands and props)
  const HURT = { lean: -0.13, torsoRot: -0.08, headRot: -0.14, headDx: -3, fFoot: [12, -12], bFoot: [-20, -12], eyes: 'hurt', mouth: 'ow', brow: -0.7, sweat: 1, blush: 0.6 };

  // =================================================================================================================================
  // MAMA LOOP (boss): the elder busker queen
  // =================================================================================================================================
  function castMama() {
    const M = {
      skin: '#c08458', skinSh: '#9a6038', skinHi: '#d9a47c', blush: '#ef6f7c',
      hair: '#b3c4a1', hairSh: '#869a74', hairHi: '#dfe9cf', hairDk: '#6d805c',
      plum: '#a2448f', plumSh: '#7a2a6c', plumHi: '#c871b4', plumDk: '#5b1f52',
      gold: '#ffcb4a', goldSh: '#e09a22', goldHi: '#fff0b0',
      pack: '#3d3448', packSh: '#272030', packHi: '#625775',
      ped: ['#ffd23a', '#ff7fb2', '#3fd8e8'], tights: '#4a3550', tightsSh: '#2f2036',
      vinyl: '#26222c', brow: '#7e8a72', iris: ['#2d4a17', '#7ab43c'],
    };
    const SKULL = RJ.skullPts({ w: 1.04, chin: 1 });
    // the hair cloud behind the head, and the front curls that sit along the hairline
    const BACK = cloud(-8, -20, 88, 75, 14, 0.14, 0.15);
    const FRONT = [{ e: [-58, -12, 15, 17] }, { e: [-52, -34, 17, 16] }, { e: [-36, -50, 18, 16] }, { e: [-14, -58, 19, 16] }, { e: [10, -58, 18, 15] }, { e: [31, -52, 16, 14] },
      { e: [47, -40, 14, 13] }, { e: [56, -25, 10, 11] }, { e: [-62, 10, 12, 15] }, { e: [-60, 32, 11, 13] }];
    const CURLS_BACK = [[-70, -60, 9, 0.4], [-44, -86, 10, 1.2], [-12, -96, 9, 2], [22, -92, 10, 0.6], [52, -74, 9, 1.6], [70, -44, 8, 0.2], [-88, -26, 9, 2.4], [-86, 12, 8, 1], [-74, 42, 9, 2.8], [62, -8, 7, 1], [-30, -70, 7, 0.8], [6, -78, 7, 2.2], [36, -70, 6, 1.4]];
    const CURLS_FRONT = [[-58, -14, 7, 0.4], [-50, -36, 8, 1.4], [-34, -52, 8, 2.2], [-12, -60, 8, 0.8], [11, -59, 7, 1.8], [31, -53, 7, 2.6], [47, -41, 6, 0.6], [-61, 10, 6, 2], [-59, 32, 5, 1]];

    function hairBack(g, S) {
      g.save(); g.translate(-8, 40); g.rotate(S.P.hairSwing * 0.03); g.translate(8, -40);
      RJ.cel(g, BACK, M.hair, { shadow: M.hairSh, line: LINE.main + 0.2, depth: 11, tension: 0.6, hi: M.hairHi, hiW: 2.4, hiAlpha: 0.8, decor: (gg) => {
        curls(gg, CURLS_BACK, M.hairDk, 1.4, 0.75);
        // a few silvery-lime streaks: the crew colour, worn with age
        RJ.hatch(gg, [[[-20, -98], [-6, -90], [2, -80]], [[40, -84], [52, -76], [58, -64]], [[-80, -40], [-84, -24]]], { color: L.limeHi, w: 2.2, alpha: 0.8 });
      } });
      g.restore();
    }
    function hairFront(g, S) {
      RJ.blob(g, FRONT, { fill: M.hair, shade: M.hairSh, lit: 1.8, L: LINE.main * 0.95 });
      curls(g, CURLS_FRONT, M.hairDk, 1.3, 0.8);
      RJ.hatch(g, [[-20, -66, -8, -68], [16, -66, 24, -62]], { color: M.hairHi, w: 2, alpha: 0.9 });
    }
    // the crown of guitar picks, perched on the cloud
    function crown(g, S) {
      g.save(); g.translate(36, -86); g.rotate(0.42 + S.P.hairSwing * 0.02);
      const base = [[-24, 6], [24, 6], [22, -2], [-22, -2]];
      [[-15, -0.35, M.ped[1]], [15, 0.35, M.ped[2]], [0, 0, L.lime]].forEach((p) => {
        g.save(); g.translate(p[0], -2); g.rotate(p[1]);
        RJ.cel(g, [[-8, 0], [-9, -9], [-5, -17], [0, -20, 1], [5, -17], [9, -9], [8, 0]], M.gold, { shadow: M.goldSh, line: LINE.main, depth: 2.5, hi: M.goldHi, hiW: 1.2, tension: 0.6 });
        g.beginPath(); g.arc(0, -9, 3.3, 0, TAU); g.fillStyle = C.ink; g.fill();
        g.beginPath(); g.arc(0, -9, 2.4, 0, TAU); g.fillStyle = p[2]; g.fill();
        g.beginPath(); g.arc(-0.8, -9.8, 0.8, 0, TAU); g.fillStyle = '#ffffff'; g.fill();
        g.restore();
      });
      RJ.cel(g, base, M.gold, { shadow: M.goldSh, line: LINE.main, depth: 2, tension: 0, hi: M.goldHi, hiW: 1 });
      g.restore();
    }
    // a vinyl-record earring swinging under the ear
    function earring(g, S) {
      const sw = S.P.hairSwing * 0.15 + Math.sin(S.t * 2.1) * 0.05 * tk.motion();
      g.save(); g.translate(-50, 36); g.rotate(sw);
      RJ.ink(g, [[0, 0], [0, 7]], { w: 1.4, color: M.goldSh, taper: 0, wobble: 0 });
      RJ.cel(g, tk.circlePts(0, 16, 9, 16), M.vinyl, { shadow: false, line: LINE.mid, rim: '#6a6474', rimW: 1.4, rimSide: 'light' });
      g.strokeStyle = '#4a4552'; g.lineWidth = 0.8; g.beginPath(); g.arc(0, 16, 6.2, 0, TAU); g.stroke();
      g.beginPath(); g.arc(0, 16, 3.4, 0, TAU); g.fillStyle = L.lime; g.fill();
      g.beginPath(); g.arc(0, 16, 1, 0, TAU); g.fillStyle = M.vinyl; g.fill();
      g.restore();
    }
    function head(g, S) {
      headBase(g, S, { skull: SKULL, skin: M.skin, shade: M.skinSh, cast: [[-60, -30], [-30, -48], [0, -54], [30, -50], [56, -32], [50, -18], [20, -40], [-10, -42], [-44, -20]], castDy: 6, under: (gg) => {
        // smile lines and the laugh crinkles of a lifetime of busking (soft, warm)
        RJ.hatch(gg, [[[-36, 8], [-40, 12]], [[-36, 16], [-41, 18]], [[2, 34], [-1, 40], [0, 46]], [[30, 33], [34, 39]]], { color: M.skinSh, w: 1.6, alpha: 0.95 });
      } });
      RJ.ear(g, -52, 22, { r: 14, side: -1, skin: M.skin, shade: M.skinSh });
      earring(g, S);
      hairFront(g, S);
      // a beauty mark
      g.beginPath(); g.arc(34, 30, 1.6, 0, TAU); g.fillStyle = '#5a2f1c'; g.fill();
      crown(g, S);
    }
    // the loop-pedal backpack, behind the body (torso rest space): a plum-trimmed rig with three stomp pedals whose LED rings pulse
    function pack(g, S) {
      const P = S.P, t = S.t, busy = P.pose === 'sing' || P.pose === 'attack' || P.pose === 'strike' || P.pose === 'windup';
      // the antenna with a lime loop flag
      const sw = S.sway * 0.08 + (P.hairSwing || 0) * 0.02;
      g.save(); g.translate(-62, -172); g.rotate(-0.22 + sw);
      RJ.ink(g, [[0, 0], [0, -52]], { w: 4.2, color: C.ink, taper: 0, wobble: 0 });
      RJ.ink(g, [[0, 0], [0, -52]], { w: 2, color: '#b9b4c6', taper: 0, wobble: 0 });
      led(g, 0, -54, 3.4, L.limeHi, busy ? 16 : 9, busy ? 0.4 + 0.4 * Math.abs(Math.sin(PI * t * 2.6)) : 0.3);
      g.restore();
      RJ.cel(g, rbox(-88, -178, 58, 100, 13, 3), M.pack, { shadow: M.packSh, line: LINE.main + 0.2, tension: 0, depth: 7, hi: M.packHi, hiW: 1.8 });
      RJ.cel(g, rbox(-92, -184, 40, 14, 6, 2), M.plum, { shadow: M.plumSh, line: LINE.main, tension: 0, depth: 3, hi: M.plumHi, hiW: 1.2 });
      // three pedals stacked on the side we see
      for (let i = 0; i < 3; i++) {
        const y = -164 + i * 29, col = M.ped[i], on = busy ? Math.pow(Math.abs(Math.sin(PI * t * 2.6 - i * 0.9)), 2) : 0.35 + 0.25 * Math.sin(t * 1.7 + i * 2);
        RJ.cel(g, rbox(-84, y, 36, 24, 4, 2), col, { shadow: RJ.shade(col, 0.12), line: LINE.mid, tension: 0, depth: 2.6, hi: RJ.tint(col, 0.45), hiW: 1.1 });
        RJ.cel(g, tk.circlePts(-73, y + 14, 5.2, 12), '#d9dbe6', { shadow: '#9da1b4', line: LINE.fine + 0.2, depth: 1.5 });
        g.save(); g.lineWidth = 2.2; g.strokeStyle = C.ink; g.beginPath(); g.arc(-58, y + 12, 5.5, 0, TAU); g.stroke();
        g.strokeStyle = on > 0.5 ? L.limeHi : L.limeDk; g.lineWidth = 1.6; g.beginPath(); g.arc(-58, y + 12, 5.5, -PI / 2, -PI / 2 + TAU * (busy ? fr(t * 0.9 + i * 0.33) : 0.75)); g.stroke(); g.restore();
        led(g, -58, y + 12, 1.8, L.limeHi, on > 0.4 ? 9 : 0, on * 0.5);
      }
    }
    // the shawl's back drape (torso rest space), behind the body: a big lime triangle with a fringe
    function shawlBack(g, S) {
      const sw = S.sway * 3;
      const pts = [[-42, -150], [-30, -156], [30, -156], [44, -148], [40, -110], [8 + sw, -84, 1], [-36 + sw, -96], [-50, -122]];
      RJ.cel(g, pts, L.lime, { shadow: L.limeSh, line: LINE.main, tension: 0.4, depth: 6 });
    }
    function backHair(g, S) {
      within(g, S.M.head, S.M.torso, (gg) => { pack(gg, S); shawlBack(gg, S); });
      hairBack(g, S);
    }
    // dress, skirt and the visible pack strap (torso rest space)
    const BODICE = [[-16, -160], [16, -160], [36, -152], [44, -132], [46, -108], [44, -88, 1], [-44, -88, 1], [-46, -108], [-44, -132], [-36, -152]];
    function skirtPts(S) {
      const sw = S.sway * 2.5, P = S.P;
      const fl = P.pose === 'walk' ? 3 * Math.sin(S.t * PI * 4) : 0;
      if (P.pose === 'down') return [[-44, -92], [44, -92], [56, -74], [70, -58], [72, -48, 1], [36, -44], [0, -42], [-36, -44], [-72, -48, 1], [-70, -58], [-56, -74]];   // pooled on the floor
      return [[-44, -92], [44, -92], [50, -60], [56 + sw + fl, -26], [58 + sw + fl, -12, 1], [30, -8], [0, -6], [-30, -8], [-58 + sw - fl, -12, 1], [-56 + sw - fl, -26], [-50, -60]];
    }
    function torso(g, S) {
      RJ.neck(g, 2, -172, { w: 24, h: 18, skin: M.skin, shade: M.skinSh });
      // long skirt (patchwork busker skirt): plum with lime and gold patches and a lime hem
      const sk = skirtPts(S);
      RJ.cel(g, sk, M.plum, { shadow: M.plumSh, line: LINE.main + 0.2, tension: 0.5, depth: 9, hi: M.plumHi, hiW: 1.8, decor: (gg) => {
        const hy = S.P.pose === 'down' ? -42 : 0, hw = S.P.pose === 'down' ? 80 : 62;
        RJ.fillPts(gg, [[-hw, hy - 26], [hw, hy - 26], [hw, hy], [-hw, hy]], L.lime, 0.95);
        RJ.fillPts(gg, [[-hw, hy - 28], [hw, hy - 28], [hw, hy - 25], [-hw, hy - 25]], L.limeDk, 0.9);
        for (let i = -4; i <= 4; i++) { gg.beginPath(); gg.arc(i * 15 + 4, hy - 17, 2.4, 0, TAU); gg.fillStyle = M.gold; gg.fill(); }
        RJ.cel(gg, rbox(14, -76, 16, 15, 2, 1), M.gold, { shadow: M.goldSh, line: LINE.fine + 0.2, tension: 0, depth: 2 });
        RJ.cel(gg, rbox(-34, -62, 15, 17, 2, 1), L.limeHi, { shadow: L.lime, line: LINE.fine + 0.2, tension: 0, depth: 2 });
        RJ.hatch(gg, [[[16, -78], [16, -60]], [[-34, -63], [-30, -63], [-26, -63]], [[28, -76], [30, -60]]], { color: C.inkSoft, w: 0.9, alpha: 0.6 });
        RJ.hatch(gg, [[-14, -86, -18, -30], [6, -86, 8, -30], [26, -84, 34, -32], [-32, -82, -40, -32]], { color: M.plumSh, w: 1.4, alpha: 0.8 });
      } });
      RJ.cel(g, BODICE, M.plum, { shadow: M.plumSh, line: LINE.main, depth: 8, hi: M.plumHi, hiW: 1.6, tension: 0.5 });
      // a wide scoop neckline
      RJ.cel(g, [[-18, -161, 1], [18, -161, 1], [12, -150], [0, -146], [-12, -150]], M.skin, { shadow: M.skinSh, line: LINE.mid, depth: 3, tension: 0.6 });
      // a lime sash belt with a gold buckle shaped like a loop
      RJ.cel(g, [[-46, -98], [46, -98], [46, -88], [-46, -88]], L.limeDk, { shadow: '#2c6610', line: LINE.mid, tension: 0, depth: 2 });
      loopGlyph(g, 8, -93, 7, 1, M.gold);
      // the pack strap over the front shoulder
      RJ.ink(g, [[22, -160], [30, -140], [32, -116], [26, -100]], { w: 8.6, color: C.ink, taper: 0, wobble: 0 });
      RJ.ink(g, [[22, -160], [30, -140], [32, -116], [26, -100]], { w: 6, color: M.pack, taper: 0, wobble: 0 });
      RJ.cel(g, rbox(26, -132, 10, 8, 2, 1), '#d9dbe6', { shadow: '#9da1b4', line: LINE.fine + 0.2, tension: 0, depth: 1.4 });
    }
    // the shawl over both shoulders, knotted at the chest, with tassels (drawn with the torso, so the front arm and the mic pass in front of it)
    function shawl(g, S) {
      const sw = S.sway * 2.2, P = S.P;
      const left = [[-54, -150], [-36, -165], [-8, -164], [2, -136], [-2, -110, 1], [-18, -114], [-38, -120], [-56, -128]];
      const right = [[6, -164], [30, -164], [48, -157], [58, -140], [56, -122, 1], [38, -118], [20, -114], [8, -110, 1], [4, -136]];
      RJ.cel(g, left, L.lime, { shadow: L.limeSh, line: LINE.main, tension: 0.5, depth: 6, hi: L.limeHi, hiW: 1.5 });
      RJ.cel(g, right, L.lime, { shadow: L.limeSh, line: LINE.main, tension: 0.5, depth: 6, hi: L.limeHi, hiW: 1.5, decor: (gg) => {
        RJ.hatch(gg, [[[16, -156], [24, -140], [30, -128]], [[34, -154], [40, -140]]], { color: L.limeSh, w: 1.2, alpha: 0.8 });
      } });
      // the knot and the two hanging ends with gold tassels
      const ends = [[[2, -120], [0 + sw, -100], [-2 + sw * 1.4, -84]], [[6, -120], [12 + sw, -102], [16 + sw * 1.4, -88]]];
      ends.forEach((sp, i) => {
        RJ.lock(g, sp, L.lime, { wMax: 11, w0: 10, w1: 6, profile: () => 1, cap: 'flat', gloss: false, strands: 0, shadow: L.limeSh, line: LINE.main });
        const e = sp[2];
        RJ.hatch(g, [-3, -1, 1, 3].map((dx) => [e[0] + dx, e[1] - 1, e[0] + dx * 1.3, e[1] + 7]), { color: C.ink, w: 2.6 });
        RJ.hatch(g, [-3, -1, 1, 3].map((dx) => [e[0] + dx, e[1] - 1, e[0] + dx * 1.3, e[1] + 6]), { color: M.gold, w: 1.3 });
      });
      RJ.cel(g, tk.ellipsePts(4, -120, 8, 7, 12), L.lime, { shadow: L.limeSh, line: LINE.main, depth: 2.5, hi: L.limeHi, hiW: 1.2 });
      // the fringe along the bottom edges of the shawl
      const fringe = [];
      [[[-56, -128], [-38, -120], [-18, -114], [-4, -110]], [[56, -122], [38, -118], [20, -114], [8, -110]]].forEach((edge) => {
        for (let i = 0; i < edge.length - 1; i++) for (let k = 0; k < 3; k++) {
          const u = k / 3, x = lerp(edge[i][0], edge[i + 1][0], u), y = lerp(edge[i][1], edge[i + 1][1], u), dx = sw * 0.6;
          fringe.push([x, y - 1, x + dx, y + 8]);
        }
      });
      RJ.hatch(g, fringe, { color: C.ink, w: 3.2 });
      RJ.hatch(g, fringe, { color: L.limeHi, w: 1.6 });
    }
    function fx(g, S, name) {
      const t = S.t, pt = S.pt;
      if (name === 'loops') { const p = mat.pt(S.M.torso, -60, -190); fxLoops(g, p[0], p[1], t, 3); }
      else if (name === 'boom') {
        // the pack speaker boom: fat lime rings rolling out in front of her
        const c = pt.chest, b = S.beat;
        tk.glow(g, c[0] + 40, c[1], 50 + 16 * b, LIME.glow, 0.18 + 0.2 * b, false);
        RJ.fx.arcs(g, pt.micHead[0] + 6, pt.micHead[1], 0, t, L.lime, 3);
        RJ.fx.arcs(g, pt.micHead[0] + 4, pt.micHead[1], 0, t + 0.4, M.gold, 2);
      } else if (name === 'queen') RJ.fx.sparkles(g, pt.head[0], pt.head[1] - 40, [[-70, -70, 7, 0.3], [64, -86, 8, 0], [90, -30, 5, 0.4], [-96, -10, 5, 0.2]], M.goldHi, t);
    }
    function poses() {
      const sly = { eyes: 'open', mouth: 'smirkTeeth', brow: 0.15 };
      return {
        idle: Object.assign({ mic: 'hand', fHand: [16, 40], fBend: -1, micAng: 1.35, micGrip: 22, bHand: [-24, 42], bBend: 1, bKind: 'fist', bRot: 0.6, headRot: 0.03, fx: [] }, sly),
        sing: { mic: 'mouth', micDx: 6, micDy: 8, micAng: 1.05, fBend: 1, bHand: [-50, -12], bBend: -1, bKind: 'open', bSpread: 1.2, bRot: -0.2, eyes: 'half', mouth: 'sing', brow: -0.15, headRot: -0.05, fx: ['notes', 'loops'], look: [0.4, 0] },
        attack: { mic: 'mouth', micDx: 6, micDy: 6, micAng: 0.95, fBend: 1, lean: 0.07, torsoRot: 0.05, headRot: 0.06, headDx: 3, bHand: [-36, -34], bBend: -1, bKind: 'fist', bRot: -0.3,
          fFoot: [32, -12], bFoot: [-26, -12], eyes: 'determined', mouth: 'beat', brow: 0.45, fx: ['burst', 'loops'], look: [0.5, 0] },
        hurt: Object.assign({ mic: 'hand', fHand: [4, 40], fBend: -1, micAng: 1.9, micGrip: 22, bHand: [-36, -10], bBend: -1, bKind: 'open', bSpread: 1.3, bFront: 1, fx: ['stars'] }, HURT, { lean: -0.09 }),
        cheer: { mic: 'hand', fHand: [36, -44], fBend: 1, micAng: 1.5, micGrip: 22, bHand: [-46, -40], bBend: -1, bKind: 'open', bSpread: 1.4, bRot: 0.2, eyes: 'happy', mouth: 'grin', brow: -0.2, headRot: 0.04,
          fFoot: [20, -12], bFoot: [-20, -12], fx: ['sparkles', 'queen'] },
        windup: { mic: 'mouth', micDx: 4, micDy: 8, micAng: 1.05, fBend: 1, squash: 0.97, torsoDy: 5, lean: -0.04, headRot: -0.04, bHand: [34, -10], bBend: 1, bKind: 'relaxed', bRot: -1.4, bSpread: 0.6, bFront: 1,
          fFoot: [26, -12], bFoot: [-24, -12], eyes: 'closed', mouth: 'beat', brow: 0.3, fx: ['loops'], look: [0.4, 0] },
        strike: { mic: 'mouth', micDx: 6, micDy: 6, micAng: 0.95, fBend: 1, lean: 0.13, bx: 4, torsoRot: 0.06, headRot: 0.06, headDx: 3, bHand: [-40, -38], bBend: -1, bKind: 'open', bSpread: 1.4, bRot: -0.4,
          fFoot: [34, -12], bFoot: [-26, -12], eyes: 'angry', mouth: 'beat', brow: 0.5, fx: ['boom', 'burst', 'loops'], look: [0.5, 0] },
        block: { mic: 'hand', fHand: [-34, 30], fBend: -1, micAng: -0.2, micGrip: 20, bHand: [44, 30], bBend: 1, bKind: 'fist', bRot: 0.2, bFront: 1, headRot: -0.09,
          fFoot: [26, -12], bFoot: [-26, -12], eyes: 'smirk', mouth: 'smirk', brow: 0.35, fx: ['rings'] },
        down: { mic: 'hand', fHand: [16, 50], fBend: 1, micAng: -1.35, micGrip: 18, by: 50, torsoDy: 4, torsoRot: 0.06, lean: 0.03, headRot: 0.22, headDy: 2, bHand: [-6, 52], bBend: -1, bKind: 'relaxed', bRot: 0.3,
          fFoot: [-12, -58], bFoot: [14, -58], fBow: 24, bBow: -22, fFootRot: -0.5, bFootRot: 0.4, eyes: 'closed', mouth: 'flat', brow: -0.25, blush: 0.6, fx: ['mute'] },
        walk: Object.assign({ mic: 'hand', fHand: [16, 40], fBend: -1, micAng: 1.35, micGrip: 22, bHand: [-28, 30], bBend: 1, bKind: 'relaxed', bRot: 0.3, headRot: 0.03, fx: [] }, sly),
        bust: Object.assign({ mic: 'hand', fHand: [12, 58], fBend: -1, micAng: 1.5, micGrip: 22, bHand: [-14, 56], bBend: 1, bKind: 'relaxed', headRot: 0.03, fx: [] }, sly),
      };
    }
    const spec = {
      id: 'npc_loop_mama', accent: 'loop_rats',
      // the boss is built bigger: a taller skeleton (head and shoulders up 14), broader shoulders and a larger head
      skel: { neck: [0, -160], headC: [2, -216], shF: [32, -146], shB: [-30, -146], hip: [0, -82], hipF: [16, -74], hipB: [-16, -74] },
      base: { headScale: 1.1 },
      poses: poses(),
      life: { cheer: { bob: 0.8, per: 0.9, sway: 0.02, head: 0.025, jump: 8, jumpHz: 1.5 }, idle: { bob: 1.4, per: 3.6, sway: 0.014, head: 0.02 }, sing: { bob: 2, per: 1.6, sway: 0.03, head: 0.05, beat: 0.4, beatHz: 1.6 } },
      face: {
        eyes: [{ x: -13, y: 16, w: 30, h: 26 }, { x: 39, y: 14, w: 26, h: 24 }],
        brows: [[-14, -8, 28], [44, -9, 25]],
        browStyle: { thick: 6.2, arch: 0.5, tilt: 0.1, color: M.brow },
        nose: [24, 31, 66], mouth: [10, 44, 24],
        mouthStyle: { lineW: 1.6, teeth: true, inner: '#8a2a48', tongue: '#f2809a' },
        blush: [[-18, 34, 22], [38, 32, 18]], blushColor: M.blush,
        sweat: [58, -10, 5],
        eye: { iris: M.iris, ring: '#1d2a10', sclera: '#fffaf1', expr: 'neutral', irisW: 0.68, irisH: 0.95, lid: 2.3, wing: 0.7, lash: 1.2, crease: true, lashes: 2, tilt: 0.08, drop: 0.24, hl: [[-0.4, -0.5, 0.28], [-0.34, -0.12, 0.13]] },
      },
      arm: { l: [27, 25], w: [21, 16], skin: M.skin, skinSh: M.skinSh, sleeve: { color: M.plum, shade: M.plumSh, len: 0.62, w0: 30, w1: 31, hi: M.plumHi }, hand: { skin: M.skin, shade: M.skinSh } },
      legs: { w: [26, 19], color: M.tights, shade: M.tightsSh, pantsOver: true, bow: 2,
        shoe: { color: L.lime, sole: '#f0f9dd', shade: L.limeSh, toeCap: L.limeDk, accent: M.gold, k: 1.3 } },
      mic: { accent: M.gold, headR: 11, len: 44, bands: 2 },
      bounds: { x0: -134, x1: 142, h: 352 },
      bust: { rect: [-112, -350, 100, -110], face: [-100, -340, 92, -150], pose: 'bust' },
      layers: { backHair, torso: (g, S) => { torso(g, S); shawl(g, S); }, head, fx },
    };
    return spec;
  }

  // =================================================================================================================================
  // STOMP (enforcer): the tap-dancing bruiser on spring heels
  // =================================================================================================================================
  function castStomp() {
    const K = {
      skin: '#e3a878', skinSh: '#c4825a', blush: '#f27d86',
      red: '#e8433f', redSh: '#b92a2a', redHi: '#ff8a7a',
      pants: '#3d3b4c', pantsSh: '#272533', stripe: '#6d6a84',
      hat: '#2b2733', hatSh: '#16131c', hatHi: '#575166',
      shoe: '#2b2733', spat: '#fffaf1', tap: '#c9ced9', tapSh: '#8d93a6',
      brow: '#2a1a12', iris: ['#3a2010', '#8a5a2c'], gold: '#ffcb4a', goldSh: '#e09a22',
      stub: '#c98e66',
    };
    const SKULL = [[-2, -58], [30, -54], [53, -36], [61, -6], [60, 22], [50, 42], [30, 56], [8, 60], [-14, 57], [-36, 46], [-54, 26], [-62, -3], [-59, -33], [-40, -52]];
    // the lime flat-top: a crisp block with a slight forward lean and a short shaved back
    const FLAT = (() => {
      const top = [];
      for (let i = 0; i <= 14; i++) { const x = -58 + i * 8; top.push([x, (i % 2 ? -83 : -78) + i * 0.15, 1]); }
      return [[-60, -24], [-64, -50, 1], [-60, -66]].concat(top, [[60, -66], [62, -50, 1], [61, -30, 1], [53, -36], [46, -44, 1], [38, -40], [26, -47], [12, -42, 1], [4, -46], [-14, -44], [-34, -38], [-46, -30], [-48, -10], [-52, 4, 1], [-56, -6]]);
    })();
    function hat(g, S) {
      // the tiny bowler, perched and tilted forward on the flat-top; it hops a little on the beat
      g.save(); g.translate(6, -80 - 3 * S.beat); g.rotate(0.16 + S.P.hairSwing * 0.03 - 0.06 * S.beat);
      RJ.cel(g, [[-20, 0], [-20, -10], [-15, -22], [-4, -28], [8, -28], [17, -22], [21, -10], [21, 0]], K.hat, { shadow: K.hatSh, line: LINE.main, tension: 0.6, depth: 4, hi: K.hatHi, hiW: 1.6 });
      RJ.cel(g, [[-20.5, -1], [21.5, -1], [21.5, -7], [-20.5, -7]], K.red, { shadow: K.redSh, line: LINE.mid, tension: 0, depth: 1.5 });
      RJ.cel(g, tk.ellipsePts(0.5, 0.5, 30, 6, 18), K.hat, { shadow: K.hatSh, line: LINE.main, depth: 2.5, hi: K.hatHi, hiW: 1.2 });
      // a lime tape-loop pin in the band
      loopGlyph(g, 13, -4, 4.4, 1, L.limeHi);
      g.restore();
    }
    function head(g, S) {
      headBase(g, S, { skull: SKULL, skin: K.skin, shade: K.skinSh, cast: [[-56, -30], [-20, -46], [20, -48], [56, -34], [50, -22], [20, -40], [-20, -38], [-50, -18]], castDy: 6, under: (gg) => {
        // a shaved stubble jaw and the chin cleft
        gg.globalAlpha = 0.45; gg.fillStyle = K.stub;
        gg.beginPath(); tk.trace(gg, [[-46, 26], [-30, 46], [-6, 58], [20, 58], [44, 44], [58, 26], [62, 64], [-50, 64]], 0, 0, 0.5); gg.fill();
        gg.globalAlpha = 1;
      } });
      RJ.ink(g, [[14, 56], [15, 52]], { w: 1.3, color: C.inkSoft, taper: 0.4, wobble: 0 });
      RJ.ear(g, -54, 22, { r: 14, side: -1, skin: K.skin, shade: K.skinSh });
      // the band-aid across the nose: tough, but cute
      g.save(); g.translate(28, 25); g.rotate(-0.35);
      RJ.cel(g, rbox(-9, -3.6, 18, 7.2, 3, 2), '#ffe1c2', { shadow: '#f0c49c', line: LINE.fine + 0.2, tension: 0, depth: 1.2 });
      g.beginPath(); g.rect(-3, -3, 6, 6); g.fillStyle = '#f7d2ae'; g.fill();
      [[-1.5, -1.2], [1.5, -1.2], [-1.5, 1.4], [1.5, 1.4]].forEach((p) => { g.beginPath(); g.arc(p[0], p[1], 0.55, 0, TAU); g.fillStyle = '#c99a72'; g.fill(); });
      g.restore();
      RJ.cel(g, FLAT, L.lime, { shadow: L.limeSh, line: LINE.main + 0.2, tension: 0.35, depth: 6, hi: L.limeHi, hiW: 2, decor: (gg) => {
        RJ.hatch(gg, [[-42, -74, -40, -64], [-26, -76, -25, -66], [-10, -76, -10, -68], [6, -76, 6, -66], [22, -76, 22, -68], [38, -74, 38, -64], [-34, -60, -33, -52], [-18, -62, -18, -54], [14, -62, 14, -54], [30, -60, 30, -54]], { color: L.limeSh, w: 1.3, alpha: 0.85 });
        RJ.fillPts(gg, [[-30, -79], [20, -80], [16, -74], [-26, -73]], L.limeHi, 0.75);
        RJ.fillPts(gg, [[-66, -40], [-48, -36], [-46, 6], [-66, 6]], L.limeDk, 0.55);
      } });
      hat(g, S);
    }
    const TANK = [[-16, -150], [16, -150], [42, -142], [52, -122], [52, -100], [48, -80, 1], [-48, -80, 1], [-52, -100], [-52, -122], [-42, -142]];
    function torso(g, S) {
      RJ.neck(g, 2, -164, { w: 28, h: 18, skin: K.skin, shade: K.skinSh });
      // the trouser waist under the tank
      RJ.cel(g, [[-48, -88], [48, -88], [46, -70], [-46, -70]], K.pants, { shadow: K.pantsSh, line: LINE.main, tension: 0, depth: 3 });
      RJ.cel(g, TANK, L.lime, { shadow: L.limeSh, line: LINE.main, depth: 9, hi: L.limeHi, hiW: 1.8, tension: 0.5, decor: (gg) => {
        // a darker lime racing stripe and the big white boot-print emblem
        RJ.fillPts(gg, [[-60, -112], [60, -112], [60, -104], [-60, -104]], L.limeDk, 0.6);
        const star = [];
        for (let i = 0; i < 10; i++) { const a = -PI / 2 + i * PI / 5, r = i % 2 ? 6 : 14; star.push([6 + Math.cos(a) * r, -124 + Math.sin(a) * r, 1]); }
        RJ.cel(gg, star, '#fffaf1', { shadow: '#e6e0d0', line: LINE.mid, depth: 2, tension: 0 });
      } });
      // the ribbed collar
      RJ.cel(g, [[-17, -151, 1], [17, -151, 1], [12, -140], [0, -136], [-12, -140]], K.skin, { shadow: K.skinSh, line: LINE.mid, depth: 2, tension: 0.6 });
      // red suspenders with gold clips
      [[[24, -148], [26, -120], [24, -86]], [[-22, -148], [-20, -120], [-18, -86]]].forEach((sp) => {
        RJ.ink(g, sp, { w: 9.2, color: C.ink, taper: 0, wobble: 0 });
        RJ.ink(g, sp, { w: 6.4, color: K.red, taper: 0, wobble: 0 });
        RJ.ink(g, sp.map((p) => [p[0] - 1.4, p[1]]), { w: 1.2, color: K.redHi, taper: 0, wobble: 0, alpha: 0.8 });
        RJ.cel(g, rbox(sp[2][0] - 5, sp[2][1] - 6, 10, 8, 1.5, 1), K.gold, { shadow: K.goldSh, line: LINE.fine + 0.2, tension: 0, depth: 1.5 });
      });
      // the red bow tie
      RJ.cel(g, [[0, -146], [-13, -153, 1], [-14, -139, 1]], K.red, { shadow: K.redSh, line: LINE.mid, tension: 0.2, depth: 2 });
      RJ.cel(g, [[2, -146], [16, -153, 1], [16, -139, 1]], K.red, { shadow: K.redSh, line: LINE.mid, tension: 0.2, depth: 2 });
      RJ.cel(g, tk.ellipsePts(1, -146, 4, 4.4, 8), K.red, { shadow: K.redSh, line: LINE.mid, depth: 1 });
    }
    // a coil spring under the heel, squashed by the stomp (figure space, called from the leg decor)
    function spring(g, an) {
      const sole = an[1] + 16, hx = an[0] - 7, len = clamp(0 - sole, 4, 15), n = 4, pts = [];
      for (let i = 0; i <= n * 8; i++) { const u = i / (n * 8), a = u * n * TAU; pts.push([hx + Math.sin(a) * 6, sole + u * len + Math.cos(a) * 1.2]); }
      tk.inkPath(g, pts, { w: 4.4, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
      tk.inkPath(g, pts, { w: 2.2, color: K.tap, taper: 0, wobble: 0, weightVar: 0 });
      RJ.cel(g, rbox(hx - 8, sole + len - 1, 16, 4, 1.5, 1), K.tap, { shadow: K.tapSh, line: LINE.fine + 0.3, tension: 0, depth: 1 });
    }
    function legDecor(g, hip, an) {
      const dx = an[0] - hip[0], dy = an[1] - hip[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux;
      // pinstripes and the cropped hem with a red sock band
      RJ.hatch(g, [[hip[0] + ux * 10 - nx * 5, hip[1] + uy * 10 - ny * 5, an[0] - ux * 12 - nx * 5, an[1] - uy * 12 - ny * 5], [hip[0] + ux * 10 + nx * 5, hip[1] + uy * 10 + ny * 5, an[0] - ux * 12 + nx * 5, an[1] - uy * 12 + ny * 5]], { color: K.stripe, w: 1.2, alpha: 0.9 });
      const qx = an[0] - ux * 7, qy = an[1] - uy * 7;
      RJ.ink(g, [[qx - nx * 12, qy - ny * 12], [qx + nx * 12, qy + ny * 12]], { w: 1.6, color: C.ink, taper: 0.2, wobble: 0 });
      spring(g, an);
    }
    function fx(g, S, name) {
      const t = S.t, P = S.P;
      if (name === 'taps') {
        // little silver clacks at whichever toe is tapping
        [[P.fFoot, 0], [P.bFoot, 1]].forEach((f, i) => {
          const k = Math.pow(Math.max(0, Math.sin(PI * t * 4 + i * PI)), 6);
          if (k > 0.05) RJ.fx.sparkles(g, P.bx + f[0][0] + 22, P.by + f[0][1] + 14, [[0, 0, 4 + 5 * k, 0.4], [10, -8, 3 * k, 0]], '#ffffff', t);
        });
      } else if (name === 'stomp') {
        const x = P.bx + P.fFoot[0] + 10, y = P.by - 2, b = S.beat;
        tk.glow(g, x, y - 10, 46, LIME.glow, 0.25 + 0.25 * b, false);
        RJ.fx.wave(g, x, y, t, L.lime);
        RJ.fx.burst(g, x + 16, y - 14, 14 + 10 * b, K.red, '#ffd0c8', t);
        // dust puffs
        for (let i = 0; i < 3; i++) {
          const u = fr(t * 1.6 + i / 3), px = x - 30 + i * 6 - u * 26, py = y - 6 - u * 14;
          g.save(); g.globalAlpha *= (1 - u) * 0.9;
          RJ.cel(g, tk.circlePts(px, py, 5 + u * 6, 10), '#e7e1f2', { shadow: '#bdb6d0', line: LINE.fine + 0.3, depth: 2 });
          g.restore();
        }
      } else if (name === 'tapnotes') RJ.fx.notes(g, S.pt.head[0] + 20, S.pt.head[1] - 60, t, L.lime, 3);
    }
    const F = 28;   // the ankles ride 28 px up on the springs
    function poses() {
      const tough = { eyes: 'open', mouth: 'smirk', brow: 0.3 };
      const feet = { fFoot: [26, -F], bFoot: [-24, -F] };
      return {
        idle: Object.assign({ mic: 'none', fHand: [12, 46], fBend: -1, fKind: 'fist', fRot: 0.2, bHand: [-8, 46], bBend: 1, bKind: 'fist', bRot: 0.3, headRot: 0.03, fx: [] }, feet, tough),
        // the tap routine: jazz hands, toes clacking (see the tweak)
        sing: Object.assign({ mic: 'none', fHand: [40, -6], fBend: 1, fKind: 'open', fSpread: 1.5, fRot: -0.6, bHand: [-42, -6], bBend: -1, bKind: 'open', bSpread: 1.5, bRot: 0.6, headRot: -0.05,
          eyes: 'happy', mouth: 'grin', brow: -0.1, fx: ['taps', 'tapnotes'] }, feet),
        attack: { mic: 'none', fHand: [30, 10], fBend: 1, fKind: 'fist', fRot: -0.4, bHand: [-30, 10], bBend: -1, bKind: 'fist', bRot: 0.3, lean: 0.08, bx: 6, torsoRot: 0.06, headRot: 0.05, headDx: 3,
          fFoot: [40, -F + 6], bFoot: [-24, -F], eyes: 'angry', mouth: 'grit', brow: 0.5, fx: ['stomp'], look: [0.5, 0.3] },
        hurt: Object.assign({ mic: 'none', fHand: [26, -4], fBend: -1, fKind: 'open', fSpread: 1.3, fRot: 0.2, bHand: [-36, -10], bBend: 1, bKind: 'open', bSpread: 1.3, fx: ['stars'] }, HURT, { fFoot: [14, -F], bFoot: [-22, -F] }),
        cheer: Object.assign({ mic: 'none', fHand: [36, -42], fBend: 1, fKind: 'open', fSpread: 1.5, fRot: -0.3, bHand: [-38, -42], bBend: -1, bKind: 'open', bSpread: 1.5, bRot: 0.3, headRot: 0.04,
          eyes: 'happy', mouth: 'happyOpen', brow: -0.2, fx: ['sparkles', 'taps'] }, feet),
        // the windup: knee up high, fists up, the spring stretched under the raised boot
        windup: { mic: 'none', fHand: [26, -14], fBend: 1, fKind: 'fist', fRot: -0.4, bHand: [-22, -10], bBend: -1, bKind: 'fist', bRot: 0.3, lean: -0.05, torsoRot: -0.04, headRot: -0.03,
          fFoot: [48, -76], fFootRot: -0.2, fBow: 18, bFoot: [-20, -F], squash: 0.98, eyes: 'determined', mouth: 'grit', brow: 0.5, fx: [], look: [0.5, 0.2] },
        strike: { mic: 'none', fHand: [32, 8], fBend: 1, fKind: 'fist', fRot: -0.4, bHand: [-34, 6], bBend: -1, bKind: 'fist', bRot: 0.3, lean: 0.1, bx: 8, torsoRot: 0.08, torsoDy: 4, headRot: 0.06, headDx: 3,
          fFoot: [44, -16], bFoot: [-26, -F], squash: 0.96, eyes: 'angry', mouth: 'grit', brow: 0.55, fx: ['stomp'], look: [0.5, 0.4] },
        block: Object.assign({ mic: 'none', fHand: [22, -30], fBend: 1, fKind: 'fist', fRot: -1.2, bHand: [34, -20], bBend: 1, bKind: 'fist', bRot: -1.3, bFront: 1, headRot: 0.06, headDy: 4,
          eyes: 'determined', mouth: 'grit', brow: 0.45, fx: ['rings'] }, { fFoot: [30, -F], bFoot: [-30, -F] }),
        down: { mic: 'none', fHand: [20, 50], fBend: 1, fKind: 'relaxed', fRot: 0.3, bHand: [-6, 52], bBend: -1, bKind: 'relaxed', bRot: 0.3, by: 46, torsoDy: 4, torsoRot: 0.07, lean: 0.03, headRot: 0.24, headDy: 2,
          fFoot: [-14, -64], bFoot: [18, -64], fBow: 28, bBow: -26, fFootRot: -0.5, bFootRot: 0.4, eyes: 'closed', mouth: 'frown', brow: -0.25, blush: 0.6, fx: ['mute'] },
        walk: Object.assign({ mic: 'none', fHand: [14, 44], fBend: -1, fKind: 'fist', fRot: 0.2, bHand: [-12, 44], bBend: 1, bKind: 'fist', bRot: 0.3, headRot: 0.03, fx: [] }, feet, tough),
        bust: Object.assign({ mic: 'none', fHand: [10, 50], fBend: -1, fKind: 'fist', bHand: [-8, 50], bBend: 1, bKind: 'fist', headRot: 0.03, fx: [] }, feet, tough),
      };
    }
    return {
      id: 'npc_loop_stomp', accent: 'loop_rats',
      // broad: wide shoulders, a barrel chest, the whole body riding on the springs
      skel: { neck: [0, -152], headC: [2, -208], shF: [40, -138], shB: [-38, -138], hip: [0, -80], hipF: [20, -74], hipB: [-20, -74] },
      base: {},
      poses: poses(),
      // he bounces on his springs: a faster, deeper idle bob
      life: { idle: { bob: 2.6, per: 0.9, sway: 0.01, head: 0.015 }, walk: { bob: 4, per: 0.5, head: 0.012, step: { hz: 2, stride: 10, lift: 8 } }, sing: { bob: 3, per: 0.5, sway: 0.03, head: 0.04 } },
      tweak(P, t) {
        if (P.pose === 'sing' || P.pose === 'cheer') {
          // shuffle-ball-change: the toes tap in turn
          const a = Math.max(0, Math.sin(PI * t * 4)), b = Math.max(0, -Math.sin(PI * t * 4)), m = tk.motion();
          P.fFoot = [P.fFoot[0] + 4 * a * m, P.fFoot[1] - 9 * a * m]; P.fFootRot += -0.35 * a * m;
          P.bFoot = [P.bFoot[0] - 3 * b * m, P.bFoot[1] - 9 * b * m]; P.bFootRot += -0.35 * b * m;
        }
      },
      tip: (P) => [P.bx + P.fFoot[0] + 18, P.by + P.fFoot[1] + 18],
      face: {
        eyes: [{ x: -12, y: 16, w: 28, h: 25 }, { x: 38, y: 14, w: 24, h: 23 }],
        brows: [[-12, -5, 30], [42, -6, 26]],
        browStyle: { thick: 7.6, arch: 0.25, tilt: 0.3, color: K.brow },
        nose: null, mouth: [10, 43, 24],
        mouthStyle: { lineW: 1.7, teeth: true },
        blush: [[-16, 33, 20], [38, 31, 17]], blushColor: K.blush,
        sweat: [56, -14, 5],
        eye: { iris: K.iris, ring: '#26140a', sclera: '#fffaf1', expr: 'neutral', irisW: 0.66, irisH: 0.92, lid: 2.4, wing: 0.45, lash: 1.2, crease: false, lashes: 0, tilt: 0.24, drop: 0.16, hl: [[-0.4, -0.5, 0.28], [-0.32, -0.12, 0.12]] },
      },
      arm: { l: [26, 25], w: [25, 19], skin: K.skin, skinSh: K.skinSh, cuff: { color: K.red, light: K.redSh }, hand: { skin: K.skin, shade: K.skinSh, k: 1.15 } },
      legs: { w: [34, 26], color: K.pants, shade: K.pantsSh, pantsOver: true, bow: 2, profile: (u) => 1 - 0.22 * u, decor: legDecor,
        shoe: { color: K.shoe, sole: K.tap, shade: '#16131c', toeCap: K.spat, heel: K.spat, hi: '#5a5468', k: 1.32 } },
      bounds: { x0: -100, x1: 122, h: 330 },
      bust: { rect: [-96, -318, 96, -100], face: [-80, -306, 78, -146], pose: 'bust' },
      layers: { torso, head, fx },
    };
  }

  // =================================================================================================================================
  // ECHO (grunt): the loud kid with the giant headphones and the megaphone
  // =================================================================================================================================
  function castEcho() {
    const E = {
      hair: '#5a3826', hairSh: '#36200f', hairHi: '#8a5a3a',
      cup: '#3fc8ee', cupSh: '#1f93ba', cupHi: '#a6ecff', pad: '#2c2a3a',
      yellow: '#ffd23a', yellowSh: '#e8a618', yellowHi: '#fff1a8', bell: '#fffaf1',
      shorts: '#4a6fc8', shortsSh: '#30509c', sock: '#ffd23a', sockSh: '#e8a618',
      shoe: '#fffaf1', shoeSh: '#d9d2c4', iris: ['#2b3a12', '#6fa830'], freckle: '#c07850',
    };
    const SKULL = RJ.skullPts({ w: 1.0, h: 1.0, chin: -2 });
    // the messy mop: a spiky fringe over the forehead, a lime-dyed streak
    const MOP = [[-62, 6], [-68, -18], [-66, -42], [-56, -60], [-40, -72], [-22, -80, 1], [-14, -72], [0, -82, 1], [8, -72], [24, -78, 1], [30, -68], [46, -66, 1], [48, -56], [60, -50, 1], [58, -38], [64, -24, 1],
      [52, -26], [46, -16, 1], [38, -30], [28, -22, 1], [20, -34], [8, -24, 1], [0, -36], [-12, -26, 1], [-18, -38], [-30, -32, 1], [-36, -20], [-44, -10], [-48, 8, 1], [-54, 2]];
    const STREAK = [[0, -82], [8, -72], [24, -78], [30, -68], [20, -58], [14, -40], [8, -24], [6, -44], [2, -62]];
    function cupAt(g, x, y, r, far, S) {
      RJ.cel(g, tk.ellipsePts(x, y, r * 0.78, r, 18), E.cup, { shadow: E.cupSh, line: LINE.main + 0.2, depth: r * 0.22, hi: E.cupHi, hiW: 1.8 });
      if (!far) {
        RJ.cel(g, tk.ellipsePts(x - r * 0.08, y, r * 0.5, r * 0.68, 16), L.lime, { shadow: L.limeSh, line: LINE.mid, depth: 2.5, hi: L.limeHi, hiW: 1.2 });
        // a little speaker grille that pulses on the beat
        const k = 1 + 0.12 * S.beat;
        RJ.cel(g, tk.circlePts(x - r * 0.08, y, r * 0.28 * k, 12), E.pad, { shadow: false, line: LINE.fine + 0.2 });
        g.beginPath(); g.arc(x - r * 0.16, y - r * 0.1, r * 0.08, 0, TAU); g.fillStyle = '#ffffff'; g.fill();
      }
    }
    function backHair(g, S) {
      // the far headphone cup peeks out behind the head, and the hoodie's hood lies behind the neck
      cupAt(g, 60, 4, 21, true, S);
    }
    function head(g, S) {
      headBase(g, S, { skull: SKULL, cast: [[-52, -24], [-30, -38], [0, -40], [30, -36], [52, -28], [46, -16], [20, -30], [-10, -30], [-40, -14]], castDy: 6, under: (gg) => {
        [[-26, 30], [-20, 34], [-30, 36], [44, 28], [50, 31], [40, 33]].forEach((p) => { gg.beginPath(); gg.arc(p[0], p[1], 1.3, 0, TAU); gg.fillStyle = E.freckle; gg.fill(); });
      } });
      RJ.cel(g, MOP, E.hair, { shadow: E.hairSh, line: LINE.main + 0.2, tension: 0.45, depth: 6, hi: E.hairHi, hiW: 1.8, decor: (gg) => {
        RJ.fillPts(gg, STREAK, L.lime, 0.95);
        RJ.fillPts(gg, [[2, -78], [8, -70], [20, -72], [12, -64], [6, -54]], L.limeHi, 0.8);
        RJ.hatch(gg, [[[-30, -60], [-36, -44], [-34, -32]], [[-12, -66], [-14, -48], [-12, -28]], [[36, -60], [36, -44], [30, -24]], [[-48, -50], [-56, -30], [-54, -10]]], { color: E.hairSh, w: 1.3, alpha: 0.9 });
      } });
      // the headband over the top, then the big near cup over the ear
      const band = [[-56, -6], [-58, -40], [-44, -70], [-14, -88], [20, -88], [46, -72], [58, -50], [60, -14]];
      tk.ribbon(g, band, L.lime, { wMax: 11, w0: 11, w1: 11, profile: () => 1, cap: 'flat', gloss: false, strands: 0, shadow: L.limeSh, shadowW: 0.4, line: LINE.main, lineColor: C.ink, wobble: 0.02 });
      RJ.hatch(g, [[-36, -76, -32, -80], [-6, -88, -2, -89], [24, -86, 28, -85]], { color: L.limeHi, w: 1.8, alpha: 0.9 });
      cupAt(g, -56, 12, 24, false, S);
    }
    // the oversized hoodie (torso rest space), the hood bunched behind the neck, shorts below
    const HOODIE = [[-18, -128], [18, -128], [36, -120], [42, -100], [44, -76], [46, -54, 1], [-46, -54, 1], [-44, -76], [-42, -100], [-36, -120]];
    function torso(g, S) {
      RJ.neck(g, 2, -140, { w: 20, h: 16 });
      // shorts
      RJ.cel(g, [[-40, -62], [40, -62], [42, -40, 1], [6, -38], [0, -46], [-6, -38], [-42, -40, 1]], E.shorts, { shadow: E.shortsSh, line: LINE.main, tension: 0.2, depth: 4, hi: '#7d9be0', hiW: 1.2 });
      // the hood behind the neck
      RJ.cel(g, [[-34, -126], [-24, -142], [0, -146], [24, -140], [32, -126], [0, -128]], L.limeDk, { shadow: '#2c6610', line: LINE.main, tension: 0.6, depth: 3 });
      RJ.cel(g, HOODIE, L.lime, { shadow: L.limeSh, line: LINE.main, depth: 8, hi: L.limeHi, hiW: 1.8, tension: 0.5, decor: (gg) => {
        // the kangaroo pocket and a yellow lightning bolt
        RJ.cel(gg, [[-24, -78], [24, -78], [30, -60], [-30, -60]], L.limeSh, { shadow: false, line: LINE.mid, tension: 0.2 });
        gg.save(); gg.translate(4, -102);
        RJ.cel(gg, [[2, -12], [-6, 1], [0, 1], [-3, 12, 1], [7, -2], [1, -2], [5, -12, 1]], E.yellow, { shadow: E.yellowSh, line: LINE.fine + 0.3, tension: 0, depth: 1.5 });
        gg.restore();
        RJ.fillPts(gg, [[-60, -60], [60, -60], [60, -54], [-60, -54]], L.limeDk, 0.8);
      } });
      // the collar opening and the drawstrings
      RJ.cel(g, [[-14, -129, 1], [14, -129, 1], [9, -121], [0, -118], [-9, -121]], C.skin, { shadow: C.skinSh, line: LINE.mid, depth: 2, tension: 0.6 });
      const sw = S.sway * 2;
      [[-6, -121], [8, -121]].forEach((p, i) => {
        RJ.ink(g, [[p[0], p[1]], [p[0] + sw * 0.5 - 1, p[1] + 10], [p[0] + sw - (i ? 0 : 2), p[1] + 20]], { w: 3.4, color: C.ink, taper: 0, wobble: 0 });
        RJ.ink(g, [[p[0], p[1]], [p[0] + sw * 0.5 - 1, p[1] + 10], [p[0] + sw - (i ? 0 : 2), p[1] + 20]], { w: 1.7, color: '#fffaf1', taper: 0, wobble: 0 });
      });
    }
    // the megaphone (figure space): the grip at the front wrist, the bell along ang. P.megAng is the direction (+x forward)
    function megaphone(g, S) {
      const P = S.P, k = wristOf(S, true), ang = num(P.megAng, 0), w = k.w;
      g.save(); g.translate(w[0], w[1]); g.rotate(ang);
      // handle below the body, then the body (a cone from the mouthpiece at -14 to the bell at +46)
      RJ.cel(g, rbox(-6, -2, 10, 18, 3, 2), '#3a3644', { shadow: '#1e1b26', line: LINE.mid, tension: 0, depth: 2 });
      const cone = [[-16, -7], [30, -18], [46, -24, 1], [46, 24, 1], [30, 18], [-16, 7]];
      RJ.cel(g, cone, E.yellow, { shadow: E.yellowSh, line: LINE.main + 0.2, tension: 0.15, depth: 5, hi: E.yellowHi, hiW: 1.8, decor: (gg) => {
        RJ.fillPts(gg, [[8, -16], [18, -18], [18, 18], [8, 16]], L.lime, 0.95);
        RJ.hatch(gg, [[8, -15, 8, 15], [18, -17, 18, 17]], { color: L.limeDk, w: 1.2 });
      } });
      RJ.cel(g, rbox(-24, -6, 10, 12, 3, 2), '#3a3644', { shadow: '#1e1b26', line: LINE.mid, tension: 0, depth: 1.5 });
      RJ.cel(g, tk.ellipsePts(46, 0, 7, 24.5, 16), E.bell, { shadow: '#d9d2c4', line: LINE.main, depth: 2.5 });
      RJ.cel(g, tk.ellipsePts(47.5, 0, 4, 17, 14), '#3a3644', { shadow: false, line: LINE.fine + 0.2 });
      g.restore();
      // the gripping fist over the handle
      RJ.hand(g, 'fist', w[0], w[1], ang + PI / 2 - 0.3, Object.assign({}, S.spec.arm.hand));
    }
    function top(g, S) { within(g, S.M.head, null, (gg) => megaphone(gg, S)); }
    function bellPt(S) {
      const P = S.P, k = wristOf(S, true), ang = num(P.megAng, 0);
      return [k.w[0] + Math.cos(ang) * 50, k.w[1] + Math.sin(ang) * 50];
    }
    function fx(g, S, name) {
      const t = S.t;
      if (name === 'shout') { const b = bellPt(S), a = num(S.P.megAng, 0); RJ.fx.arcs(g, b[0] + 4, b[1], a, t, E.yellow, 3); RJ.fx.arcs(g, b[0] + 2, b[1], a, t + 0.35, L.lime, 2); }
      else if (name === 'blast') { const b = bellPt(S); RJ.fx.burst(g, b[0] + 26, b[1], 16 + 9 * S.beat, E.yellow, E.yellowHi, t); }
      else if (name === 'megnotes') { const b = bellPt(S); RJ.fx.notes(g, b[0] - 30, b[1], t, L.lime, 3); }
    }
    function poses() {
      const cheeky = { eyes: 'open', mouth: 'smirkTeeth', brow: 0.15 };
      return {
        idle: Object.assign({ mic: 'none', fHand: [14, 34], fBend: -1, fKind: 'fist', megAng: -0.5, bHand: [-14, 30], bBend: 1, bKind: 'fist', bRot: 0.4, headRot: 0.05, fx: [] }, cheeky),
        sing: { mic: 'none', fHand: [20, -10], fBend: 1, fKind: 'fist', megAng: -0.12, megMouth: 1, bHand: [-34, -16], bBend: -1, bKind: 'open', bSpread: 1.3, bRot: 0.1, headRot: -0.05, eyes: 'happy', mouth: 'happyOpen', brow: -0.2, fx: ['megnotes', 'shout'] },
        attack: { mic: 'none', fHand: [22, -12], fBend: 1, fKind: 'fist', megAng: -0.05, megMouth: 1, bHand: [-30, -26], bBend: -1, bKind: 'fist', bRot: -0.3, lean: 0.1, bx: 4, torsoRot: 0.06, headRot: 0.04, headDx: 3,
          fFoot: [30, -12], bFoot: [-24, -12], eyes: 'angry', mouth: 'ow', brow: 0.5, fx: ['shout', 'blast'], look: [0.5, 0] },
        hurt: Object.assign({ mic: 'none', fHand: [10, 34], fBend: -1, fKind: 'fist', megAng: 1.2, bHand: [-28, -8], bBend: -1, bKind: 'open', bSpread: 1.3, bFront: 1, fx: ['stars'] }, HURT),
        cheer: { mic: 'none', fHand: [26, -40], fBend: 1, fKind: 'fist', megAng: -0.55, bHand: [-30, -36], bBend: -1, bKind: 'fist', bRot: -0.2, eyes: 'happy', mouth: 'grin', brow: -0.2, headRot: 0.05,
          fFoot: [18, -12], bFoot: [-18, -12], fx: ['sparkles'] },
        // the windup: a big breath in, the megaphone hugged to the chest, cheeks puffed
        windup: { mic: 'none', fHand: [8, 12], fBend: 1, fKind: 'fist', megAng: -0.9, bHand: [24, 14], bBend: 1, bKind: 'fist', bRot: -1.2, bFront: 1, squash: 0.96, lean: -0.06, torsoDy: 3, headRot: -0.1,
          fFoot: [22, -12], bFoot: [-22, -12], eyes: 'closed', mouth: 'tiny', brow: 0.4, blush: 1.6, fx: [] },
        strike: { mic: 'none', fHand: [22, -12], fBend: 1, fKind: 'fist', megAng: -0.05, megMouth: 1, bHand: [-34, -28], bBend: -1, bKind: 'open', bSpread: 1.4, bRot: -0.3, lean: 0.14, bx: 6, torsoRot: 0.07, headRot: 0.05, headDx: 3,
          fFoot: [32, -12], bFoot: [-26, -12], eyes: 'angry', mouth: 'ow', brow: 0.55, fx: ['shout', 'blast'], look: [0.5, 0] },
        block: { mic: 'none', fHand: [16, -6], fBend: 1, fKind: 'fist', megAng: -1.45, bHand: [22, 6], bBend: 1, bKind: 'fist', bRot: -1.2, bFront: 1, headRot: 0.08, headDy: 4, lean: -0.04,
          fFoot: [24, -12], bFoot: [-24, -12], eyes: 'determined', mouth: 'frown', brow: 0.3, fx: ['rings'] },
        down: { mic: 'none', fHand: [26, 40], fBend: 1, fKind: 'fist', megAng: 0.3, bHand: [-6, 42], bBend: -1, bKind: 'relaxed', bRot: 0.3, by: 42, torsoDy: 3, torsoRot: 0.07, headRot: 0.24,
          fFoot: [36, -54], bFoot: [28, -50], fFootRot: -1.1, bFootRot: -1, eyes: 'closed', mouth: 'frown', brow: -0.3, blush: 0.8, fx: ['mute'] },
        walk: Object.assign({ mic: 'none', fHand: [14, 34], fBend: -1, fKind: 'fist', megAng: -0.5, bHand: [-24, 22], bBend: 1, bKind: 'relaxed', bRot: 0.3, headRot: 0.05, fx: [] }, cheeky),
        bust: Object.assign({ mic: 'none', fHand: [10, 46], fBend: -1, fKind: 'fist', megAng: 0.4, bHand: [-10, 44], bBend: 1, bKind: 'relaxed', headRot: 0.04, fx: [] }, cheeky),
      };
    }
    return {
      id: 'npc_loop_echo', accent: 'loop_rats',
      // a kid: the whole body 18 px shorter (short legs and torso), the same big head
      skel: { neck: [0, -130], headC: [2, -188], shF: [24, -118], shB: [-24, -118], hip: [0, -66], hipF: [13, -62], hipB: [-13, -62] },
      base: { headScale: 0.98 },
      poses: poses(),
      life: { idle: { bob: 1.4, per: 2.2, sway: 0.02, head: 0.03 }, sing: { bob: 2.4, per: 0.8, sway: 0.03, head: 0.05, beat: 0.6, beatHz: 2.4 }, walk: { bob: 3, per: 0.45, head: 0.015, step: { hz: 2.2, stride: 8, lift: 6 } } },
      // the shouting poses put the megaphone's mouthpiece on the mouth: the grip (the wrist) sits 26 px along the megaphone from the mouth
      tweak(P) {
        if (!P.megMouth) return;
        const Lay = RJ.layout(this, P), a = num(P.megAng, 0), mo = Lay.pt.mouth, sh = Lay.pt.shF;
        P.fHand = [mo[0] + Math.cos(a) * 26 + 3 - sh[0], mo[1] + Math.sin(a) * 26 + 2 - sh[1]];
      },
      // the striking point: the megaphone's bell (the wrist solved as the rig solves it)
      tip: (P, Lay) => { const r = RJ.ik2(Lay.pt.shF, Lay.pt.hand, 21, 20, P.fBend), a = num(P.megAng, 0); return [r.w[0] + Math.cos(a) * 50, r.w[1] + Math.sin(a) * 50]; },
      face: {
        eyes: [{ x: -14, y: 16, w: 31, h: 31 }, { x: 38, y: 14, w: 27, h: 29 }],
        brows: [[-14, -10, 24], [42, -11, 21]],
        browStyle: { thick: 5, arch: 0.5, tilt: 0.05, color: '#3a2214' },
        nose: [22, 30, 54], mouth: [10, 42, 20],
        mouthStyle: { lineW: 1.5, teeth: true },
        blush: [[-18, 32, 20], [38, 30, 17]],
        sweat: [52, -16, 5],
        eye: { iris: E.iris, ring: '#1d2a10', sclera: '#fffaf1', expr: 'neutral', irisW: 0.74, irisH: 0.96, lid: 2.0, wing: 0.4, lash: 1.0, crease: true, lashes: 0, tilt: 0, drop: 0, hl: [[-0.4, -0.5, 0.3], [-0.34, -0.12, 0.14], [0.36, 0.4, 0.1]] },
      },
      arm: { l: [21, 20], w: [17, 14], skin: L.lime, skinSh: L.limeSh, cuff: { color: L.limeDk, light: '#2c6610' }, hand: { skin: C.skin, shade: C.skinSh, k: 1.05 } },
      legs: { w: [17, 13], color: C.skin, shade: C.skinSh, bow: 1.5, sock: { color: E.sock, len: 18, shade: E.sockSh },
        shoe: { color: E.shoe, sole: L.limeLt, shade: E.shoeSh, toeCap: L.lime, accent: E.yellow, k: 1.22 } },
      bounds: { x0: -88, x1: 130, h: 294 },
      bust: { rect: [-92, -294, 92, -86], face: [-84, -282, 82, -120], pose: 'bust' },
      layers: { backHair, torso, head, top, fx },
    };
  }

  // =================================================================================================================================
  // TAPE WORM (grunt): the lanky cassette hoarder wrapped in a scarf of tape
  // =================================================================================================================================
  function castTape() {
    const T = {
      skin: '#f8d7bf', skinSh: '#e6ae90', blush: '#ff8f9c', freckle: '#d08a62',
      hair: '#d9b26a', hairSh: '#b08540', hairHi: '#f4d79a',
      hat: '#b79ae8', hatSh: '#8f6fd0', hatHi: '#dccbff', hatRib: '#9a7ddc',
      parka: '#7f9a3e', parkaSh: '#5f7a2a', parkaHi: '#a6bf62', parkaDk: '#4a5f1e',
      shirt: '#fff3dc', shirtSt: '#b79ae8',
      tape: '#4a3428', tapeSh: '#2e1f17', tapeHi: '#9a7a62',
      jeans: '#34374f', jeansSh: '#22243a',
      cas: ['#ff9cc6', '#8fe3c0', '#ffd23a', '#b79ae8', '#7fd0e8'],
      iris: ['#3a2a6a', '#9a86d8'],
    };
    const SKULL = RJ.skullPts({ w: 0.97, h: 1.0, chin: 4 });
    // the slouchy beanie: ribbed brim across the forehead, the body slumping back to the pom
    const HAT = [[-66, -26, 1], [-64, -52], [-56, -74], [-40, -90], [-18, -100], [8, -102], [30, -96], [48, -82], [58, -62], [62, -40, 1], [30, -44], [0, -46], [-34, -40]];
    const BRIM = [[-68, -22, 1], [-66, -40, 1], [-30, -50], [10, -54], [44, -50], [64, -44, 1], [64, -28, 1], [36, -34], [0, -36], [-36, -30]];
    // shaggy locks that stick out under the beanie (back: behind the head; front: over the ears and the forehead)
    const LOCKS_BACK = [{ sp: [[-58, -24], [-72, -6], [-74, 18], [-80, 34]], w: 18 }, { sp: [[-50, -18], [-62, 6], [-60, 30], [-66, 46]], w: 16 }, { sp: [[54, -26], [64, -4], [66, 18], [72, 30]], w: 14 }];
    const FRINGE = [[-50, -32], [-38, -36], [-20, -38], [0, -40], [20, -38], [40, -36], [56, -32], [52, -18, 1], [44, -26], [36, -14, 1], [28, -26], [18, -16, 1], [10, -28], [-2, -16, 1], [-10, -30], [-22, -18, 1], [-30, -30], [-44, -16, 1]];
    function backHair(g, S) {
      const sw = S.P.hairSwing;
      LOCKS_BACK.forEach((l, i) => RJ.lock(g, l.sp, T.hair, { wMax: l.w, w0: l.w * 0.8, w1: 0, tipPow: 1.3, bend: sw * 0.25 * (i + 1), shadow: T.hairSh, glossColor: T.hairHi, glossAlpha: 0.6 }));
    }
    function head(g, S) {
      headBase(g, S, { skull: SKULL, skin: T.skin, shade: T.skinSh, cast: [[-56, -30], [-20, -42], [20, -42], [56, -32], [50, -18], [20, -30], [-20, -30], [-50, -16]], castDy: 6, under: (gg) => {
        [[16, 26], [21, 23], [26, 27], [31, 24], [8, 28], [36, 27]].forEach((p) => { gg.beginPath(); gg.arc(p[0], p[1], 1.25, 0, TAU); gg.fillStyle = T.freckle; gg.fill(); });
      } });
      RJ.ear(g, -52, 22, { r: 13, side: -1, skin: T.skin, shade: T.skinSh });
      // a lock in front of the ear
      RJ.lock(g, [[-50, -20], [-56, 4], [-52, 24], [-56, 36]], T.hair, { wMax: 13, w0: 11, w1: 0, tipPow: 1.3, bend: S.P.hairSwing * 0.2, shadow: T.hairSh, glossColor: T.hairHi, glossAlpha: 0.6 });
      RJ.cel(g, FRINGE, T.hair, { shadow: T.hairSh, line: LINE.main, tension: 0.4, depth: 4, hi: T.hairHi, hiW: 1.4 });
      // the beanie and its lime pom, which bobs a beat behind the head
      const sw = S.P.hairSwing;
      const pom = [-50 + sw * 3, -90 + Math.abs(sw) * 2];
      RJ.cel(g, cloud(pom[0], pom[1], 13, 13, 9, 0.18, 0.3), L.lime, { shadow: L.limeSh, line: LINE.main, depth: 4, tension: 0.5, hi: L.limeHi, hiW: 1.4 });
      RJ.cel(g, HAT, T.hat, { shadow: T.hatSh, line: LINE.main + 0.2, tension: 0.55, depth: 8, hi: T.hatHi, hiW: 2, decor: (gg) => {
        RJ.hatch(gg, [[[-40, -48], [-30, -80]], [[-14, -50], [-6, -92]], [[12, -50], [16, -94]], [[36, -48], [36, -84]]], { color: T.hatSh, w: 1.2, alpha: 0.7 });
      } });
      RJ.cel(g, BRIM, T.hatRib, { shadow: T.hatSh, line: LINE.main, tension: 0.4, depth: 3, decor: (gg) => {
        const r = []; for (let x = -62; x <= 62; x += 6) r.push([x, -50, x, -26]);
        RJ.hatch(gg, r, { color: T.hatSh, w: 1, alpha: 0.6 });
      } });
      // a cassette-shaped badge on the brim
      cassette(g, 34, -40, 16, -0.12, T.cas[0]);
    }
    // the long olive-lime parka (torso rest space), open over a striped tee, pockets bulging with tapes
    const PARKA_L = [[-18, -156], [-36, -150], [-46, -130], [-48, -96], [-52, -60], [-54, -38, 1], [-8, -36, 1], [-4, -90], [-6, -140]];
    const PARKA_R = [[18, -156], [36, -150], [46, -130], [48, -96], [52, -60], [52, -38, 1], [10, -36, 1], [6, -90], [8, -140]];
    function torso(g, S) {
      RJ.neck(g, 3, -168, { w: 20, h: 18, skin: T.skin, shade: T.skinSh });
      // the striped tee showing between the open fronts
      RJ.cel(g, [[-14, -156], [14, -156], [12, -60], [-12, -60]], T.shirt, { shadow: '#ead9bc', line: LINE.main, tension: 0, depth: 3, decor: (gg) => {
        for (let y = -150; y < -60; y += 9) { gg.beginPath(); gg.rect(-20, y, 40, 4); gg.fillStyle = T.shirtSt; gg.fill(); }
      } });
      const sw = S.sway * 2;
      [PARKA_L, PARKA_R].forEach((pts, i) => {
        const q = pts.map((p) => (p[1] > -70 ? [p[0] + sw * (i ? 1 : 0.6), p[1]].concat(p.slice(2)) : p));
        RJ.cel(g, q, T.parka, { shadow: T.parkaSh, line: LINE.main, tension: 0.4, depth: 8, hi: T.parkaHi, hiW: 1.6, decor: (gg) => {
          // a lime zip trim along the opening and the bulging pocket
          RJ.hatch(gg, [i ? [[8, -140], [6, -90], [10, -38]] : [[-6, -140], [-4, -90], [-8, -38]]], { color: L.lime, w: 4 });
          RJ.hatch(gg, [i ? [[30, -150], [44, -132], [46, -110]] : [[-30, -150], [-44, -132], [-46, -110]]], { color: T.parkaSh, w: 1.3, alpha: 0.8 });
        } });
      });
      // pockets with cassettes peeking out
      [[-30, -74, 1, 2], [30, -72, 0, 3]].forEach((pk) => {
        cassette(g, pk[0] - 2, pk[1] - 12, 18, pk[2] ? -0.3 : 0.25, T.cas[pk[3]]);
        RJ.cel(g, rbox(pk[0] - 14, pk[1] - 8, 28, 20, 4, 2), T.parka, { shadow: T.parkaSh, line: LINE.main, tension: 0, depth: 3, hi: T.parkaHi, hiW: 1.2 });
        RJ.ink(g, [[pk[0] - 12, pk[1] - 3], [pk[0] + 12, pk[1] - 3]], { w: 1.2, color: T.parkaDk, taper: 0, wobble: 0 });
      });
      // the fur-free hood rolled behind the neck
      RJ.cel(g, [[-30, -154], [-16, -166], [0, -168], [18, -166], [30, -154], [0, -156]], T.parkaDk, { shadow: '#33410f', line: LINE.main, tension: 0.6, depth: 3 });
    }
    // the scarf of tape: three wraps round the neck, two long tails with cassettes, a loose curl of tape (after the front arm)
    function scarf(g, S) {
      const sw = S.sway * 4 + S.P.hairSwing * 1.5, t = S.t, m = tk.motion();
      const tapeLock = (sp, w, o) => RJ.lock(g, sp, T.tape, Object.assign({ wMax: w, w0: w, w1: w, profile: () => 1, cap: 'flat', gloss: true, glossColor: T.tapeHi, glossAlpha: 0.75, strands: 0, shadow: T.tapeSh, line: LINE.main }, o));
      // the loose thin tape curling down the chest
      const curl = []; for (let i = 0; i <= 24; i++) { const u = i / 24; curl.push([-10 + Math.sin(u * 9 + t * 1.2 * m) * 6 + sw * u, -144 + u * 64]); }
      tk.inkPath(g, curl, { w: 3.6, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
      tk.inkPath(g, curl, { w: 2, color: T.tapeHi, taper: 0, wobble: 0, weightVar: 0 });
      // the tails, each ending in a cassette that swings and clinks against the other
      const tails = [[[12, -148], [18 + sw * 0.4, -126], [14 + sw, -104], [18 + sw * 1.4, -88]], [[22, -150], [32 + sw * 0.4, -130], [30 + sw, -112]]];
      tails.forEach((sp, i) => {
        tapeLock(sp, 9);
        const e = sp[sp.length - 1], rk = Math.sin(t * 2.6 + i * 1.7) * 0.18 * m + sw * 0.03;
        cassette(g, e[0] + 1, e[1] + 12, 29 - i * 4, rk + (i ? 0.3 : -0.15), T.cas[i ? 4 : 1]);
      });
      tapeLock([[-28, -146], [-12, -136], [10, -136], [28, -146]], 12);
      tapeLock([[-26, -155], [-6, -146], [16, -148], [30, -155]], 11);
      tapeLock([[-22, -161], [0, -155], [24, -160]], 8);
      // a cassette clipped on the wrap
      cassette(g, -20, -144, 21, -0.4, T.cas[2]);
    }
    // the hand-held cassette (figure space)
    function held(g, S) {
      const P = S.P;
      if (P.hold === 0) return;
      const k = wristOf(S, true), a = k.ang + num(P.fRot);
      const cx = k.w[0] + Math.cos(a) * 10, cy = k.w[1] + Math.sin(a) * 10;
      cassette(g, cx, cy, 28, a + PI / 2, T.cas[3]);
      RJ.hand(g, 'fist', k.w[0], k.w[1], a, S.spec.arm.hand);
    }
    function top(g, S) { within(g, S.M.head, null, (gg) => held(gg, S)); }
    // the lash: a stream of tape whipping forward from the hand with a spinning cassette at its end
    function lashPts(S, len, amp) {
      const k = wristOf(S, true), t = S.t, pts = [];
      for (let i = 0; i <= 30; i++) { const u = i / 30, w = Math.sin(u * 2.6 * TAU - t * 12) * amp * Math.sin(PI * u * 0.9); pts.push([k.w[0] + u * len, k.w[1] - 6 * u + w]); }
      return pts;
    }
    function fx(g, S, name) {
      const t = S.t;
      if (name === 'lash') {
        const pts = lashPts(S, 120, 9), e = pts[pts.length - 1];
        tk.inkPath(g, pts, { w: 7, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
        tk.inkPath(g, pts, { w: 4.2, color: T.tape, taper: 0, wobble: 0, weightVar: 0 });
        tk.inkPath(g, pts, { w: 1.2, color: T.tapeHi, taper: 0.2, wobble: 0, weightVar: 0, alpha: 0.9 });
        cassette(g, e[0] + 8, e[1], 26, t * 9, T.cas[0]);
        RJ.fx.burst(g, e[0] + 30, e[1] - 6, 12 + 8 * S.beat, L.lime, L.limeLt, t);
      } else if (name === 'twirl') {
        // a loop of tape whirling round the raised hand
        const k = wristOf(S, true), r = 22, pts = [];
        for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU * 0.85 + t * 8; pts.push([k.w[0] + Math.cos(a) * r, k.w[1] - 18 + Math.sin(a) * r * 0.45]); }
        tk.inkPath(g, pts, { w: 6, color: C.ink, taper: 0.3, wobble: 0, weightVar: 0 });
        tk.inkPath(g, pts, { w: 3.2, color: T.tape, taper: 0.3, wobble: 0, weightVar: 0 });
        fxLoops(g, k.w[0], k.w[1] - 30, t, 2);
      } else if (name === 'clink') {
        // the two tail cassettes knock together now and then
        const p = mat.pt(S.M.torso, 24, -82), k = Math.pow(Math.max(0, Math.sin(t * 2.6)), 12);
        if (k > 0.05) RJ.fx.sparkles(g, p[0], p[1], [[8, -4, 3 + 4 * k, 0.3], [-4, 6, 2.5 * k, 0]], '#ffffff', t);
      } else if (name === 'tapenotes') { const k = wristOf(S, true); RJ.fx.notes(g, k.w[0] - 20, k.w[1] - 20, t, L.lime, 3); }
    }
    function poses() {
      const sly = { eyes: 'half', mouth: 'smirk', brow: -0.1 };
      return {
        idle: Object.assign({ mic: 'none', fHand: [22, 20], fBend: 1, fKind: 'fist', fRot: -0.3, bHand: [-8, 48], bBend: 1, bKind: 'relaxed', bRot: 0.3, headRot: 0.05, fx: ['clink'] }, sly),
        // he shows off his favourite tape, eyes shining
        sing: { mic: 'none', fHand: [26, -16], fBend: 1, fKind: 'fist', fRot: -0.6, bHand: [-34, -12], bBend: -1, bKind: 'open', bSpread: 1.2, bRot: 0.2, headRot: -0.06, eyes: 'happy', mouth: 'happyOpen', brow: -0.2, fx: ['tapenotes', 'clink'] },
        attack: { mic: 'none', fHand: [44, -2], fBend: 1, fKind: 'fist', fRot: 0, hold: 0, bHand: [-30, -20], bBend: -1, bKind: 'fist', bRot: -0.3, lean: 0.08, bx: 4, torsoRot: 0.1, headRot: 0.05, headDx: 6,
          fFoot: [30, -12], bFoot: [-24, -12], eyes: 'determined', mouth: 'grin', brow: 0.4, fx: ['lash'], look: [0.5, 0] },
        hurt: Object.assign({ mic: 'none', fHand: [8, 36], fBend: -1, fKind: 'fist', fRot: 0.4, bHand: [-34, -10], bBend: -1, bKind: 'open', bSpread: 1.3, bFront: 1, fx: ['stars'] }, HURT),
        cheer: { mic: 'none', fHand: [22, -50], fBend: 1, fKind: 'fist', fRot: -0.4, bHand: [-36, -36], bBend: -1, bKind: 'open', bSpread: 1.4, bRot: 0.3, eyes: 'happy', mouth: 'grin', brow: -0.2, headRot: 0.05,
          fFoot: [20, -12], bFoot: [-20, -12], fx: ['sparkles', 'clink'] },
        windup: { mic: 'none', fHand: [34, -40], fBend: 1, fKind: 'fist', fRot: -0.2, hold: 0, bHand: [-24, 20], bBend: 1, bKind: 'fist', bRot: 0.3, lean: -0.06, torsoRot: -0.02, headRot: -0.06, headDx: 2,
          fFoot: [24, -12], bFoot: [-24, -12], eyes: 'determined', mouth: 'smirkTeeth', brow: 0.35, fx: ['twirl'], look: [0.5, -0.2] },
        strike: { mic: 'none', fHand: [46, -4], fBend: 1, fKind: 'fist', fRot: 0, hold: 0, bHand: [-36, -24], bBend: -1, bKind: 'open', bSpread: 1.3, bRot: -0.3, lean: 0.12, bx: 6, torsoRot: 0.12, headRot: 0.06, headDx: 6,
          fFoot: [34, -12], bFoot: [-26, -12], eyes: 'angry', mouth: 'grit', brow: 0.5, fx: ['lash'], look: [0.5, 0] },
        block: { mic: 'none', fHand: [26, -4], fBend: 1, fKind: 'fist', fRot: -1.2, bHand: [34, 4], bBend: 1, bKind: 'open', bRot: -1.2, bFront: 1, lean: -0.05, headRot: 0.1, headDy: 4,
          fFoot: [24, -12], bFoot: [-28, -12], eyes: 'sad', mouth: 'frown', brow: -0.3, fx: ['rings'] },
        down: { mic: 'none', fHand: [22, 46], fBend: 1, fKind: 'fist', fRot: 0.2, bHand: [-6, 52], bBend: -1, bKind: 'relaxed', bRot: 0.3, by: 54, torsoDy: 4, torsoRot: 0.1, headRot: 0.26,
          fFoot: [44, -66], bFoot: [34, -62], fFootRot: -1.1, bFootRot: -1.0, eyes: 'closed', mouth: 'flat', brow: -0.3, blush: 0.6, fx: ['mute'] },
        walk: Object.assign({ mic: 'none', fHand: [22, 22], fBend: 1, fKind: 'fist', fRot: -0.3, bHand: [-20, 40], bBend: 1, bKind: 'relaxed', bRot: 0.3, headRot: 0.05, fx: ['clink'] }, sly),
        bust: Object.assign({ mic: 'none', fHand: [10, 54], fBend: -1, fKind: 'fist', hold: 0, bHand: [-8, 52], bBend: 1, bKind: 'relaxed', headRot: 0.05, fx: [] }, sly),
      };
    }
    return {
      id: 'npc_loop_tape', accent: 'loop_rats',
      // lanky: long legs and neck, a forward hunch (the torso and head lean in)
      skel: { neck: [0, -160], headC: [4, -216], shF: [24, -146], shB: [-24, -146], hip: [0, -88], hipF: [14, -84], hipB: [-14, -84] },
      base: { torsoRot: 0.05, headDx: 3 },
      poses: poses(),
      life: { idle: { bob: 1.2, per: 3.8, sway: 0.02, head: 0.025 } },
      tip: (P, Lay) => { const r = RJ.ik2(Lay.pt.shF, Lay.pt.hand, 28, 26, P.fBend); return [r.w[0] + 128, r.w[1] - 6]; },
      face: {
        eyes: [{ x: -13, y: 16, w: 29, h: 27 }, { x: 38, y: 14, w: 25, h: 25 }],
        brows: [[-13, -10, 24], [42, -11, 21]],
        browStyle: { thick: 4.6, arch: 0.4, tilt: -0.1, color: '#9a6a32' },
        nose: [24, 30, 58], mouth: [10, 43, 21],
        mouthStyle: { lineW: 1.5, teeth: true },
        blush: [[-18, 33, 20], [38, 31, 17]], blushColor: T.blush,
        sweat: [54, -14, 5],
        eye: { iris: T.iris, ring: '#211640', sclera: '#fffaf1', expr: 'neutral', irisW: 0.7, irisH: 0.94, lid: 2.1, wing: 0.5, lash: 1.05, crease: true, lashes: 0, tilt: -0.05, drop: 0.28, hl: [[-0.4, -0.5, 0.28], [-0.34, -0.12, 0.13]] },
      },
      arm: { l: [28, 26], w: [17, 14], skin: T.parka, skinSh: T.parkaSh, cuff: { color: T.parkaDk, light: '#33410f' }, hand: { skin: T.skin, shade: T.skinSh } },
      legs: { w: [18, 14], color: T.jeans, shade: T.jeansSh, pantsOver: true, bow: 2,
        shoe: { color: T.hat, sole: '#fff3dc', shade: T.hatSh, toeCap: '#fff3dc', accent: L.lime, k: 1.18 } },
      bounds: { x0: -100, x1: 150, h: 338 },
      bust: { rect: [-96, -332, 96, -112], face: [-84, -326, 82, -152], pose: 'bust' },
      layers: { backHair, torso, head, over: scarf, top, fx },
    };
  }

  // =================================================================================================================================
  // DOTTY DUB (merchant / fixer): the cheerful pedal merchant
  // =================================================================================================================================
  function castDotty() {
    const D = {
      skin: '#8a5636', skinSh: '#6b3d22', blush: '#ef6f80',
      hair: '#2a1a14', hairSh: '#140a06', hairHi: '#5a3a2a',
      cobalt: '#3d7bff', cobaltSh: '#2652c8', cobaltHi: '#9cbcff', cobaltDk: '#1a3a94',
      shirt: '#fff3dc', shirtSh: '#ead9bc',
      belt: '#c9965a', beltSh: '#9c6c36', beltHi: '#e8be86',
      brass: '#e0a83a', brassSh: '#b07a18', metal: '#d9dce6', metalSh: '#9da1b4',
      legs: '#2f3550', legsSh: '#1d2236',
      pink: '#ff7fb2', iris: ['#3a1c0e', '#a8682e'],
    };
    const SKULL = RJ.skullPts({ w: 1.0, chin: 2 });
    // two big round hair puffs on top, and the hair cap over the skull with a soft front swoop
    const CAP = [[-60, 8], [-64, -20], [-58, -44], [-42, -58], [-18, -66], [10, -66], [34, -58], [52, -42], [60, -24, 1], [48, -30], [36, -38], [20, -42], [8, -38], [-4, -44], [-20, -40], [-36, -32], [-46, -18], [-50, 4, 1]];
    function puff(g, cx, cy, r, ph, S) {
      RJ.cel(g, cloud(cx, cy, r, r * 0.96, 10, 0.1, ph), D.hair, { shadow: D.hairSh, line: LINE.main + 0.2, tension: 0.5, depth: 7, hi: D.hairHi, hiW: 2, decor: (gg) => {
        curls(gg, [[cx - r * 0.3, cy - r * 0.2, r * 0.22, 0.4], [cx + r * 0.25, cy + r * 0.1, r * 0.2, 2], [cx - r * 0.1, cy + r * 0.4, r * 0.18, 1.2]], D.hairHi, 1.3, 0.7);
      } });
    }
    function backHair(g, S) {
      const sw = S.P.hairSwing;
      // the far puff sits behind the head; bounces gently
      g.save(); g.translate(sw * 1.5, Math.abs(sw) * 1); puff(g, 36, -76, 27, 0.6, S); g.restore();
    }
    function goggles(g, S) {
      // the strap round the head, then two brass-rimmed cobalt lenses pushed up on the forehead
      tk.ribbon(g, [[-62, -30], [-30, -46], [10, -50], [44, -44], [60, -34]], '#2b2733', { wMax: 8, w0: 8, w1: 8, profile: () => 1, cap: 'flat', gloss: false, strands: 0, shadow: '#16131c', line: LINE.mid, lineColor: C.ink });
      [[-12, -46, 15], [32, -45, 13]].forEach((e, i) => {
        RJ.cel(g, tk.circlePts(e[0], e[1], e[2], 18), D.brass, { shadow: D.brassSh, line: LINE.main, depth: 2.5, hi: '#ffe08a', hiW: 1.4 });
        RJ.cel(g, tk.circlePts(e[0], e[1], e[2] - 4, 16), D.cobalt, { shadow: D.cobaltSh, line: LINE.mid, depth: 3 });
        RJ.ink(g, [[e[0] - e[2] * 0.45, e[1] - e[2] * 0.05], [e[0] - e[2] * 0.2, e[1] - e[2] * 0.42]], { w: 2.4, color: '#ffffff', taper: 0.4, wobble: 0, alpha: 0.9 });
        g.beginPath(); g.arc(e[0] + e[2] * 0.25, e[1] + e[2] * 0.25, 1.5, 0, TAU); g.fillStyle = '#d6e4ff'; g.fill();
      });
      RJ.cel(g, rbox(1, -48, 8, 6, 2, 1), D.brass, { shadow: D.brassSh, line: LINE.fine + 0.2, tension: 0, depth: 1 });
    }
    function head(g, S) {
      headBase(g, S, { skull: SKULL, skin: D.skin, shade: D.skinSh, cast: [[-56, -24], [-20, -40], [20, -42], [56, -26], [50, -14], [20, -32], [-20, -30], [-48, -10]], castDy: 6 });
      RJ.ear(g, -52, 22, { r: 13.5, side: -1, skin: D.skin, shade: D.skinSh });
      // a tiny stud earring shaped like an LED
      led(g, -52, 34, 2.4, L.limeHi, 0);
      RJ.cel(g, CAP, D.hair, { shadow: D.hairSh, line: LINE.main + 0.2, tension: 0.55, depth: 5, hi: D.hairHi, hiW: 1.6, decor: (gg) => {
        RJ.hatch(gg, [[[-40, -50], [-30, -40]], [[-12, -60], [-6, -46]], [[20, -60], [24, -46]], [[42, -50], [44, -38]]], { color: D.hairHi, w: 1.4, alpha: 0.7 });
      } });
      // the near puff with its lime scrunchie
      const sw = S.P.hairSwing;
      g.save(); g.translate(sw * 2, Math.abs(sw)); puff(g, -34, -78, 30, 0.2, S);
      RJ.cel(g, [[-52, -56], [-44, -64], [-24, -64], [-16, -56], [-24, -50], [-44, -50]], L.lime, { shadow: L.limeSh, line: LINE.main, tension: 0.6, depth: 2.5, hi: L.limeHi, hiW: 1.2 });
      g.restore();
      goggles(g, S);
      // a pencil tucked behind the ear
      g.save(); g.translate(-46, 2); g.rotate(-0.9);
      RJ.cel(g, [[-14, -2.6], [10, -2.6], [16, 0, 1], [10, 2.6], [-14, 2.6]], '#ffd23a', { shadow: '#e8a618', line: LINE.fine + 0.3, tension: 0, depth: 1 });
      g.restore();
    }
    // the shirt, the polka-dot bandana, the cobalt bib apron and the tool belt (torso rest space)
    const SHIRT = [[-16, -152], [16, -152], [34, -146], [40, -128], [40, -104], [42, -80, 1], [-42, -80, 1], [-40, -104], [-40, -128], [-34, -146]];
    const APRON = [[-22, -136], [22, -136], [26, -96], [44, -90], [50, -60], [52, -40, 1], [-52, -40, 1], [-50, -60], [-44, -90], [-26, -96]];
    function dots(g, pts, r, col) { pts.forEach((p) => { g.beginPath(); g.arc(p[0], p[1], r, 0, TAU); g.fillStyle = col; g.fill(); }); }
    function torso(g, S) {
      RJ.neck(g, 2, -164, { w: 22, h: 18, skin: D.skin, shade: D.skinSh });
      RJ.cel(g, SHIRT, D.shirt, { shadow: D.shirtSh, line: LINE.main, depth: 7, hi: '#ffffff', hiW: 1.4, tension: 0.5 });
      const sw = S.sway * 1.5;
      RJ.cel(g, APRON.map((p) => (p[1] > -70 ? [p[0] + sw, p[1]].concat(p.slice(2)) : p)), D.cobalt, { shadow: D.cobaltSh, line: LINE.main, tension: 0.3, depth: 7, hi: D.cobaltHi, hiW: 1.6, decor: (gg) => {
        // lime stitching and a bib pocket with a little lime loop logo
        RJ.ink(gg, [[-18, -132], [-22, -98], [-42, -92], [-48, -46]], { w: 1.1, color: L.limeHi, taper: 0, wobble: 0 });
        RJ.ink(gg, [[18, -132], [22, -98], [42, -92], [48, -46]], { w: 1.1, color: L.limeHi, taper: 0, wobble: 0 });
        RJ.cel(gg, rbox(-12, -126, 24, 18, 3, 2), D.cobaltSh, { shadow: false, line: LINE.fine + 0.3, tension: 0 });
        loopGlyph(gg, 0, -117, 6, 1, L.lime);
        RJ.hatch(gg, [[-24, -70, -30, -44], [10, -70, 14, -44], [32, -72, 40, -44]], { color: D.cobaltDk, w: 1.3, alpha: 0.7 });
      } });
      // apron straps
      [[-22, -136, -20, -154], [22, -136, 22, -154]].forEach((s) => { RJ.ink(g, [[s[0], s[1]], [s[2], s[3]]], { w: 7.4, color: C.ink, taper: 0, wobble: 0 }); RJ.ink(g, [[s[0], s[1]], [s[2], s[3]]], { w: 4.8, color: D.cobalt, taper: 0, wobble: 0 }); });
      [[-22, -138], [22, -138]].forEach((p) => RJ.cel(g, tk.circlePts(p[0], p[1], 3, 8), D.brass, { shadow: D.brassSh, line: LINE.fine + 0.2, depth: 1 }));
      // the tool belt with its pouches: a wrench, a screwdriver, a spare pink pedal
      RJ.cel(g, [[-52, -96], [52, -96], [54, -84], [-54, -84]], D.belt, { shadow: D.beltSh, line: LINE.main, tension: 0, depth: 3, hi: D.beltHi, hiW: 1.2 });
      RJ.cel(g, rbox(-6, -97, 12, 14, 2, 1), D.brass, { shadow: D.brassSh, line: LINE.mid, tension: 0, depth: 2 });
      // wrench sticking out of the left pouch
      g.save(); g.translate(-36, -92); g.rotate(-0.35);
      RJ.cel(g, [[-3, 0], [3, 0], [3, -20], [7, -24], [6, -32, 1], [2, -27], [-2, -27], [-6, -32, 1], [-7, -24], [-3, -20]], D.metal, { shadow: D.metalSh, line: LINE.mid, tension: 0, depth: 1.5 });
      g.restore();
      RJ.cel(g, rbox(-46, -92, 20, 22, 3, 2), D.belt, { shadow: D.beltSh, line: LINE.main, tension: 0, depth: 3, hi: D.beltHi, hiW: 1 });
      // screwdriver
      g.save(); g.translate(34, -92); g.rotate(0.25);
      RJ.cel(g, [[-1.4, 0], [1.4, 0], [1.4, -14], [-1.4, -14]], D.metal, { shadow: D.metalSh, line: LINE.fine + 0.2, tension: 0, depth: 0.8 });
      RJ.cel(g, rbox(-4, -26, 8, 13, 3, 2), '#ffd23a', { shadow: '#e8a618', line: LINE.mid, tension: 0, depth: 1.5 });
      g.restore();
      RJ.cel(g, rbox(24, -90, 20, 20, 3, 2), D.belt, { shadow: D.beltSh, line: LINE.main, tension: 0, depth: 3, hi: D.beltHi, hiW: 1 });
      // a mini pedal clipped to the belt
      RJ.cel(g, rbox(8, -88, 13, 17, 2.5, 2), D.pink, { shadow: RJ.shade(D.pink, 0.12), line: LINE.mid, tension: 0, depth: 1.5 });
      led(g, 14.5, -83, 1.4, L.limeHi, 0);
      // the polka-dot bandana: a knot at the throat, a triangle on the chest
      RJ.cel(g, [[-22, -158], [20, -158], [16, -144], [2, -116, 1], [-16, -144]], L.lime, { shadow: L.limeSh, line: LINE.main, tension: 0.3, depth: 3, hi: L.limeHi, hiW: 1.2, decor: (gg) => {
        dots(gg, [[-10, -152], [2, -153], [-4, -143], [8, -144], [2, -133], [14, -153], [-14, -150], [5, -124]], 2, '#ffffff');
      } });
      RJ.cel(g, tk.ellipsePts(16, -154, 5, 4, 10), L.lime, { shadow: L.limeSh, line: LINE.mid, depth: 1.5 });
      [[[18, -154], [26 + sw, -146]], [[18, -154], [24 + sw, -142]]].forEach((sp, i) => RJ.lock(g, [sp[0], [sp[0][0] + 4, sp[0][1] + 4 + i * 2], sp[1]], L.lime, { wMax: 6, w0: 5, w1: 2, gloss: false, strands: 0, shadow: L.limeSh, line: LINE.mid }));
    }
    // the cobalt fuzz pedal she sells (figure space): the fist grips its lower edge, the pedal stands along ang
    function pedalAt(S) {
      const P = S.P, k = wristOf(S, true), a = num(P.pedAng, -PI / 2);
      return { k, a, c: [k.w[0] + Math.cos(a) * 20, k.w[1] + Math.sin(a) * 20] };
    }
    function pedal(g, S) {
      const P = S.P, t = S.t, q = pedalAt(S), on = P.pose === 'attack' || P.pose === 'strike' || P.pose === 'windup' ? 0.6 + 0.4 * Math.abs(Math.sin(PI * t * 3)) : 0.55 + 0.25 * Math.sin(t * 2.2);
      g.save(); g.translate(q.c[0], q.c[1]); g.rotate(q.a + PI / 2);
      RJ.cel(g, rbox(-15, -20, 30, 40, 5, 2), D.cobalt, { shadow: D.cobaltSh, line: LINE.main + 0.2, tension: 0, depth: 4, hi: D.cobaltHi, hiW: 1.6 });
      RJ.cel(g, rbox(-11, -2, 22, 8, 1.5, 1), '#fffaf1', { shadow: false, line: LINE.fine + 0.2, tension: 0 });
      g.save(); if (RJ._flip) g.scale(-1, 1); g.font = '800 6.5px system-ui'; g.textAlign = 'center'; g.fillStyle = D.cobaltDk; g.fillText('DUB', 0, 4.4); g.restore();   // the label stays readable when the figure is mirrored
      [[-7, -12], [7, -12]].forEach((p, i) => {
        RJ.cel(g, tk.circlePts(p[0], p[1], 3.8, 10), '#2b2733', { shadow: false, line: LINE.fine + 0.2 });
        const ka = -PI / 2 + (i ? 0.6 : -0.4) + (P.pose === 'windup' && i ? Math.sin(t * 6) * 0.8 : 0);
        RJ.ink(g, [[p[0], p[1]], [p[0] + Math.cos(ka) * 3, p[1] + Math.sin(ka) * 3]], { w: 1.2, color: '#ffffff', taper: 0, wobble: 0 });
      });
      RJ.cel(g, tk.circlePts(0, 13, 4.6, 12), D.metal, { shadow: D.metalSh, line: LINE.fine + 0.3, depth: 1.5 });
      led(g, 10, 12, 1.9, L.limeHi, 12 * on, 0.45 * on);
      g.restore();
      RJ.hand(g, 'fist', q.k.w[0], q.k.w[1], q.k.ang + num(P.fRot), S.spec.arm.hand);
      if (P.screw) {
        // the screwdriver in the back hand, twisting a knob
        const b = wristOf(S, false), a = b.ang - 0.4 + Math.sin(t * 6) * 0.2;
        g.save(); g.translate(b.w[0], b.w[1]); g.rotate(a);
        RJ.cel(g, rbox(4, -4, 13, 8, 3, 2), '#ffd23a', { shadow: '#e8a618', line: LINE.mid, tension: 0, depth: 1.5 });
        RJ.cel(g, [[17, -1.4], [30, -1.4], [30, 1.4], [17, 1.4]], D.metal, { shadow: D.metalSh, line: LINE.fine + 0.2, tension: 0, depth: 0.8 });
        g.restore();
        RJ.hand(g, 'fist', b.w[0], b.w[1], b.ang, S.spec.arm.hand);
      }
    }
    function top(g, S) { within(g, S.M.head, null, (gg) => pedal(gg, S)); }
    function fx(g, S, name) {
      const t = S.t;
      if (name === 'zap') {
        const q = pedalAt(S), x = q.c[0], y = q.c[1], b = S.beat;
        tk.glow(g, x, y, 40 + 14 * b, LIME.glow, 0.3 + 0.3 * b, false);
        for (let i = 0; i < 3; i++) {
          const a = -0.4 + i * 0.4, len = 54 + 16 * b + i * 6, e = [x + Math.cos(a) * len, y + Math.sin(a) * len], j = Math.sin(t * 23 + i * 2) * 5;
          const pts = [[x + Math.cos(a) * 18, y + Math.sin(a) * 18], [x + Math.cos(a) * len * 0.45 + j, y + Math.sin(a) * len * 0.45 - j], [x + Math.cos(a) * len * 0.7 - j, y + Math.sin(a) * len * 0.7 + j], e];
          RJ.ink(g, pts, { w: 6, color: C.ink, taper: 0.3, wobble: 0, weightVar: 0 });
          RJ.ink(g, pts, { w: 3.2, color: L.limeHi, taper: 0.3, wobble: 0, weightVar: 0 });
        }
        RJ.fx.burst(g, x + 64, y - 6, 12 + 8 * b, L.lime, L.limeLt, t);
      } else if (name === 'tink') {
        const q = pedalAt(S); RJ.fx.sparkles(g, q.c[0], q.c[1], [[16, -18, 6, 0.2], [22, 10, 4, 0], [-18, -20, 4, 0.4]], '#ffffff', t);
      } else if (name === 'dubnotes') { const q = pedalAt(S); RJ.fx.notes(g, q.c[0] - 20, q.c[1] - 12, t, L.lime, 3); }
    }
    function poses() {
      const sunny = { eyes: 'open', mouth: 'happyOpen', brow: -0.15 };
      return {
        // holding up her best pedal with a little wave of the other hand (see the tweak)
        idle: Object.assign({ mic: 'none', fHand: [22, 8], fBend: 1, fKind: 'fist', fRot: -0.2, pedAng: -1.45, bHand: [-34, -20], bBend: -1, bKind: 'open', bSpread: 1.1, bRot: -0.1, headRot: 0.04, fx: ['tink'] }, sunny),
        sing: { mic: 'none', fHand: [26, -4], fBend: 1, fKind: 'fist', fRot: -0.2, pedAng: -1.3, bHand: [-40, -14], bBend: -1, bKind: 'open', bSpread: 1.4, bRot: 0.1, headRot: -0.05, eyes: 'happy', mouth: 'grin', brow: -0.2, fx: ['dubnotes'] },
        attack: { mic: 'none', fHand: [40, -10], fBend: 1, fKind: 'fist', fRot: -0.2, pedAng: -0.2, bHand: [-30, -20], bBend: -1, bKind: 'fist', bRot: -0.3, lean: 0.08, bx: 4, torsoRot: 0.06, headRot: 0.04, headDx: 3,
          fFoot: [30, -12], bFoot: [-24, -12], eyes: 'determined', mouth: 'smirkTeeth', brow: 0.35, fx: ['zap'], look: [0.5, 0] },
        hurt: Object.assign({ mic: 'none', fHand: [10, 30], fBend: -1, fKind: 'fist', fRot: 0.4, pedAng: 0.9, bHand: [-34, -10], bBend: -1, bKind: 'open', bSpread: 1.3, bFront: 1, fx: ['stars'] }, HURT),
        cheer: { mic: 'none', fHand: [34, -40], fBend: 1, fKind: 'fist', fRot: -0.2, pedAng: -1.35, bHand: [-36, -36], bBend: -1, bKind: 'open', bSpread: 1.4, bRot: 0.3, eyes: 'happy', mouth: 'grin', brow: -0.25, headRot: 0.05,
          fFoot: [20, -12], bFoot: [-20, -12], fx: ['sparkles', 'tink'] },
        // the windup: tweaking a knob with the screwdriver, tongue-out concentration
        windup: { mic: 'none', fHand: [26, 4], fBend: 1, fKind: 'fist', fRot: -0.2, pedAng: -1.2, screw: 1, bHand: [52, 6], bBend: 1, bKind: 'fist', bRot: 0, bFront: 1, lean: -0.03, headRot: 0.06,
          fFoot: [24, -12], bFoot: [-24, -12], eyes: 'half', mouth: 'smirk', brow: 0.3, fx: [], look: [0.6, 0.5] },
        strike: { mic: 'none', fHand: [44, -12], fBend: 1, fKind: 'fist', fRot: -0.2, pedAng: -0.15, bHand: [-36, -26], bBend: -1, bKind: 'open', bSpread: 1.4, bRot: -0.3, lean: 0.12, bx: 6, torsoRot: 0.08, headRot: 0.05, headDx: 3,
          fFoot: [34, -12], bFoot: [-26, -12], eyes: 'angry', mouth: 'grin', brow: 0.45, fx: ['zap'], look: [0.5, 0] },
        block: { mic: 'none', fHand: [26, -16], fBend: 1, fKind: 'fist', fRot: -0.2, pedAng: -1.3, bHand: [30, 0], bBend: 1, bKind: 'open', bRot: -1.2, bFront: 1, lean: -0.05, headRot: 0.08, headDy: 3,
          fFoot: [24, -12], bFoot: [-28, -12], eyes: 'wide', mouth: 'ow', brow: -0.3, fx: ['rings'] },
        down: { mic: 'none', fHand: [26, 44], fBend: 1, fKind: 'fist', fRot: 0.2, pedAng: 0.2, bHand: [-6, 52], bBend: -1, bKind: 'relaxed', bRot: 0.3, by: 50, torsoDy: 4, torsoRot: 0.07, headRot: 0.24,
          fFoot: [44, -62], bFoot: [34, -58], fFootRot: -1.1, bFootRot: -1.0, eyes: 'closed', mouth: 'flat', brow: -0.3, blush: 0.6, fx: ['mute'] },
        walk: Object.assign({ mic: 'none', fHand: [20, 20], fBend: 1, fKind: 'fist', fRot: -0.2, pedAng: -1.2, bHand: [-22, 36], bBend: 1, bKind: 'relaxed', bRot: 0.3, headRot: 0.04, fx: [] }, sunny),
        bust: Object.assign({ mic: 'none', fHand: [12, 54], fBend: -1, fKind: 'fist', pedAng: 0.3, bHand: [-10, 52], bBend: 1, bKind: 'relaxed', headRot: 0.04, fx: [] }, sunny),
      };
    }
    return {
      id: 'npc_loop_dotty', accent: 'loop_rats',
      skel: {},
      base: {},
      poses: poses(),
      life: { idle: { bob: 1.3, per: 2.6, sway: 0.02, head: 0.03 } },
      tweak(P, t) {
        // the friendly wave in idle: the open back hand rocks side to side
        if (P.pose === 'idle') { const w = Math.sin(t * 5) * tk.motion(); P.bHand = [P.bHand[0] + 4 * w, P.bHand[1] - Math.abs(w) * 2]; P.bRot += 0.25 * w; }
      },
      tip: (P, Lay) => { const r = RJ.ik2(Lay.pt.shF, Lay.pt.hand, 23, 22, P.fBend), a = num(P.pedAng, -PI / 2); return [r.w[0] + Math.cos(a) * 20, r.w[1] + Math.sin(a) * 20]; },
      face: {
        eyes: [{ x: -13, y: 16, w: 31, h: 30 }, { x: 39, y: 14, w: 27, h: 28 }],
        brows: [[-13, -12, 25], [43, -13, 22]],
        browStyle: { thick: 5, arch: 0.55, tilt: -0.1, color: D.hair },
        nose: [24, 31, 58], mouth: [10, 43, 22],
        mouthStyle: { lineW: 1.5, teeth: true },
        blush: [[-18, 34, 21], [39, 32, 18]], blushColor: D.blush,
        sweat: [54, -10, 5],
        eye: { iris: D.iris, ring: '#26120a', sclera: '#fffaf1', expr: 'neutral', irisW: 0.74, irisH: 0.96, lid: 2.0, wing: 0.7, lash: 1.15, crease: true, lashes: 2, tilt: -0.04, drop: 0, hl: [[-0.4, -0.5, 0.3], [-0.34, -0.12, 0.14]] },
      },
      arm: { l: [23, 22], w: [17, 14], skin: D.skin, skinSh: D.skinSh, sleeve: { color: D.shirt, shade: D.shirtSh, len: 0.75, w0: 24, w1: 26, hi: '#ffffff' }, hand: { skin: D.skin, shade: D.skinSh } },
      legs: { w: [20, 15], color: D.legs, shade: D.legsSh, pantsOver: true, bow: 2,
        shoe: { color: L.lime, sole: '#fff3dc', shade: L.limeSh, toeCap: D.cobalt, accent: '#fffaf1', k: 1.22 } },
      bounds: { x0: -92, x1: 136, h: 328 },
      bust: { rect: [-94, -318, 94, -104], face: [-80, -310, 78, -146], pose: 'bust' },
      layers: { backHair, torso, head, top, fx },
    };
  }

  const SPECS = { loop_mama: castMama, loop_stomp: castStomp, loop_echo: castEcho, loop_tape: castTape, loop_dotty: castDotty };
  window.RGCAST = window.RGCAST || {};
  const ids = [];
  Object.keys(SPECS).forEach((k) => {
    try { RJ.register('npc_' + k, rig(SPECS[k]())); ids.push('npc_' + k); } catch (e) { if (typeof console !== 'undefined') console.error('cast_loop ' + k + ': ' + (e && e.stack || e)); }
  });
  window.RGCAST.loop_rats = {
    ids,
    note: [
      'npc_loop_mama: Mama Loop (boss), elder busker queen: huge curly grey-green hair with a guitar-pick crown, lime fringed shawl, plum patchwork dress, loop-pedal backpack with pulsing pedals, mic; built bigger.',
      'npc_loop_stomp: Stomp (enforcer), broad tap-dancing bruiser: lime flat-top under a tiny bowler, red suspenders and bow tie, pinstripe trousers, spring-heeled spectator tap boots; strikes with a stomp shockwave (tip = front boot).',
      'npc_loop_echo: Echo (grunt), small loud kid: oversized lime hoodie, giant cyan headphones, lime-streaked mop, yellow megaphone that shouts sound arcs (tip = megaphone bell).',
      'npc_loop_tape: Tape Worm (grunt), lanky hunched cassette hoarder: lavender beanie, scarf of magnetic tape with clinking cassettes, olive parka with tape-stuffed pockets; lashes a stream of tape (tip = cassette at the end).',
      'npc_loop_dotty: Dotty Dub (merchant/fixer), cheerful pedal merchant: two hair puffs, cobalt goggles up, lime polka-dot bandana, cobalt bib apron, tool belt; sells and zaps with a cobalt DUB pedal (tip = pedal).',
    ].join('\n'),
  };
})();
