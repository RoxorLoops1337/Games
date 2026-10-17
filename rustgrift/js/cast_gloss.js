'use strict';
// owned by the cast_gloss agent (see WORLD_DESIGN.md)
//
// THE GLOSS SUITS: the five figures of the smooth label crew, built on the Hocus Vocus chibi kit (ART.rj, js/hv/art_cast_kit.js).
//   npc_gloss_sheen   Madame Sheen     boss       pearl helmet bob with a blunt fringe, chrome cat-eye sunglasses worn low, a long pink coat with
//                                                 shoulder pads and a sash, satin gloves; prop: the GOLD RECORD (presented, flung like a disc)
//   npc_gloss_mute    Mr. Mute         enforcer   very tall, broad lilac suit, dark plum flat-top; his mouth is sealed by a CHROME SMILE plate (a big
//                                                 Gloss smile with rivets and a speaker grille); prop: a chrome MIC STAND wrapped in pink ribbon (staff/baton)
//   npc_gloss_tune    Agent Autotune   grunt      glossy pink pompadour quiff, chrome earpiece with a coiled cord, pitch-perfect smirk, cropped pink suit,
//                                                 a waveform tie; prop: a PEARL MIC wrapped in gloss (the kit mic, recoloured) and staircase pitch waves
//   npc_gloss_ivy     Intern Ivy       grunt      small and nervous, two messy buns stuck with pens, big pink round glasses, five lanyards with badges,
//                                                 lilac cardigan and pleated skirt; prop: a HUGE CLIPBOARD with a paper stack (papers fly when hit)
//   npc_gloss_sol     Sleek Sol        merchant   round oily-charming salesman, slicked hair with one curl and a little curled moustache, pearl-white
//                                                 pinstripe double-breasted suit, PEARL CUFFLINKS; props: a long CONTRACT SCROLL trailing to the floor and a gold pen
// The crew motif on every member: pearl pink #f4b6e0 and lilac with chrome silver; a diagonal gloss highlight sweep on the big surfaces (a static
// band plus a glint that slides across now and then, like a phone screen catching the light); the shared small closed Gloss smile with its tiny
// upturned ends and a 'ting' sparkle; chrome teeth when they grin. House rules from the kit: warm brown line, one hard cel shadow, a thin
// highlight, big flat-cel eyes with catchlights, blush, breathing, blinking and hair and cloth sway.
// Extra pose numbers (pass through RJ.resolve and lerp in blends): recHeld/recRot (Sheen), glassDy/glassRot (Sheen), coatHem/coatFlare (Sheen),
// stAng/stHold (Mute), cbRot (Ivy), penRot/scrollLen (Sol).
(function () {
  if (typeof ART === 'undefined' || !ART.rj || !ART.tk || typeof ART.rj.rig !== 'function') return;
  const RJ = ART.rj, tk = ART.tk, C = RJ.C, LINE = RJ.LINE, mat = tk.mat, foe = RJ.foe || {};
  const TAU = Math.PI * 2, PI = Math.PI;
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : (d === undefined ? 0 : d));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const fr = (v) => v - Math.floor(v);

  // ------------------------------------------------------------------------------------------------------------------------------------------
  // the crew palette
  // ------------------------------------------------------------------------------------------------------------------------------------------
  const G = {
    pink: '#f4b6e0', pinkSh: '#e28fc8', pinkLt: '#ffdcf1', pinkDk: '#c9629f', hot: '#ff7ec4',
    lilac: '#cdb8f2', lilacSh: '#a891dc', lilacLt: '#ece2ff', lilacDk: '#7d66b8',
    pearl: '#fbf6ff', pearlSh: '#e0d3ee', pearlHi: '#ffffff',
    chrome: '#e4e7f1', chromeSh: '#a1a6bf', chromeDk: '#6e7392', chromeHi: '#ffffff',
    gold: '#ffd35e', goldSh: '#e7a42c', goldLt: '#fff1b4', goldDk: '#a96c14',
    shirt: '#fffaf7', shirtSh: '#ead6e5',
    mint: '#c9fbe9', blush: '#ff93b8',
  };
  RJ.ACCENT.gloss = RJ.ACCENT.gloss || { main: G.pink, dark: G.pinkDk, light: G.pinkLt, glow: '#ffc8ec' };

  // ------------------------------------------------------------------------------------------------------------------------------------------
  // shared helpers
  // ------------------------------------------------------------------------------------------------------------------------------------------
  // The Gloss sweep: clipped to a shape, a static diagonal highlight band (a wide one and a thin one beside it) and, every few seconds, a glint
  // that slides across the whole surface. Flat alpha (no gradients) so it stays crisp like the cel shading. box [x0, y0, x1, y1] of the shape.
  // o: {at (0..1 band position), k (band width share), alpha, per (s between glints), ph (phase), tension, still (no glint)}
  function sweep(g, shape, box, t, o) {
    o = o || {};
    const x0 = box[0], y0 = box[1], x1 = box[2], y1 = box[3], w = x1 - x0, h = y1 - y0;
    if (!(w > 1 && h > 1)) return;
    const al = o.alpha === undefined ? 0.42 : o.alpha, sl = Math.min(h, w * 1.6) * 0.5;
    g.save();
    g.beginPath(); tk.trace(g, shape, 0, 0, o.tension); g.clip();
    const band = (cx, bw, a) => {
      if (!(a > 0.01)) return;
      g.beginPath(); g.moveTo(cx - bw / 2 + sl, y0 - 2); g.lineTo(cx + bw / 2 + sl, y0 - 2); g.lineTo(cx + bw / 2 - sl, y1 + 2); g.lineTo(cx - bw / 2 - sl, y1 + 2); g.closePath();
      g.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')'; g.fill();
    };
    const bw = Math.max(2.5, w * (o.k || 0.15)), base = x0 + w * (o.at === undefined ? 0.66 : o.at);
    band(base, bw, al); band(base + bw * 1.05, bw * 0.3, al * 1.25);
    if (!o.still) {
      const m = tk.motion(), per = o.per || 5.5, u = fr((num(t) + (o.ph || 0)) / per) / 0.22;
      if (u < 1 && m > 0) band(x0 - sl - bw + (w + 2 * sl + 2 * bw) * u, bw * 0.55, 0.55 * Math.sin(PI * u) * m);
    }
    g.restore();
  }
  // a chrome cel: silver with a cool shadow, a dark horizon band and a white streak (the cartoon chrome), then the sweep
  function chrome(g, pts, o) {
    o = o || {};
    const box = tk.shapeBox(pts) || [0, 0, 1, 1], h = box[3] - box[1];
    RJ.cel(g, pts, o.base || G.chrome, { shadow: o.shade || G.chromeSh, line: o.line === undefined ? LINE.main : o.line, depth: o.depth === undefined ? Math.max(1.2, h * 0.18) : o.depth, tension: o.tension, hi: '#ffffff', hiW: o.hiW || 1.3, decor: (gg) => {
      if (o.band !== false) {
        gg.fillStyle = G.chromeDk; gg.globalAlpha = 0.5; gg.fillRect(box[0] - 5, box[1] + h * 0.56, box[2] - box[0] + 10, h * 0.16); gg.globalAlpha = 1;
        gg.fillStyle = 'rgba(255,255,255,0.75)'; gg.fillRect(box[0] - 5, box[1] + h * 0.26, box[2] - box[0] + 10, Math.max(0.8, h * 0.08));
      }
      if (o.decor) o.decor(gg);
    } });
  }
  // a pearl: a cream-lilac ball with a pink blush on the shadow side and a white catch
  function pearl(g, x, y, r, o) {
    o = o || {};
    RJ.cel(g, tk.circlePts(x, y, r, Math.max(8, Math.round(r * 2))), o.color || G.pearl, { shadow: o.shade || G.pearlSh, line: o.line === undefined ? Math.max(0.8, Math.min(LINE.mid, r * 0.45)) : o.line, depth: r * 0.45, hi: false });
    g.beginPath(); g.arc(x + RJ.lx(r * 0.32), y - r * 0.34, Math.max(0.5, r * 0.3), 0, TAU); g.fillStyle = '#ffffff'; g.fill();
  }
  // THE Gloss smile: the foe kit's closed curve with two upturned ends, in the cast's warm ink, plus a tiny 'ting' sparkle at the corner
  function glossSmile(g, x, y, w, t, o) {
    o = o || {};
    if (foe.glossSmile) foe.glossSmile(g, x, y, w, { color: o.color || C.ink });
    else RJ.mouth(g, x, y, w, 'smile');
    if (o.ting !== false) {
      const tw = 0.7 + 0.3 * Math.sin(num(t) * 3.1 + x) * tk.motion();
      tk.sparkle(g, x + w * 0.7, y - w * 0.3, Math.max(1.5, w * 0.22) * tw, { color: '#ffffff', glow: 0.25, thin: 0.18 });
    }
  }
  // the mouth for a face: the Gloss kinds, chrome teeth for the grins, else the kit mouths
  function faceMouth(g, S, x, y, w) {
    const k = S.face.mouth, F = S.spec.face, st = F.mouthStyle;
    if (k === 'gloss') { glossSmile(g, x, y, w, S.t); return; }
    if (k === 'glossSmirk') { g.save(); g.translate(x, y); g.rotate(-0.16); glossSmile(g, 0, 0, w, S.t); g.restore(); return; }
    if (k === 'chromeGrin' || k === 'chromeSmirk' || k === 'grit') {
      const keep = C.teeth; C.teeth = '#e9ecf6';
      try { RJ.mouth(g, x, y, w, k === 'chromeGrin' ? 'grin' : k === 'chromeSmirk' ? 'smirkTeeth' : 'grit', st); } finally { C.teeth = keep; }
      tk.sparkle(g, x + w * 0.18, y + w * 0.08, Math.max(1.4, w * 0.16), { color: '#ffffff', glow: 0, thin: 0.18 });
      return;
    }
    RJ.mouth(g, x, y, w, k, st);
  }
  // skull, skin shade, a hair cast shadow, the face (the mouth drawn by faceMouth) and the outline. o: {skull, skin, shade, cast, castDy, under, noMouth}
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
    const F = S.spec.face, m = F.mouth;
    F.mouth = null;
    try { RJ.drawFace(g, S); } finally { F.mouth = m; }
    if (m && !o.noMouth) faceMouth(g, S, m[0], m[1], m[2]);
    RJ.ink(g, skull, { closed: true, w: LINE.main + 0.2, color: C.ink, align: 0.2, weightVar: 0.5 });
  }
  // draw fn(g) in figure space from a head-space layer
  function inFig(g, S, fn) {
    g.save();
    const inv = mat.inv(S.M.head); g.transform(inv[0], inv[1], inv[2], inv[3], inv[4], inv[5]);
    try { fn(g); } finally { g.restore(); }
  }
  // draw fn(g) in figure space from a torso-space layer
  function inFigT(g, S, fn) {
    g.save();
    const inv = mat.inv(S.M.torso); g.transform(inv[0], inv[1], inv[2], inv[3], inv[4], inv[5]);
    try { fn(g); } finally { g.restore(); }
  }
  // the wrist of an arm, solved like the rig solves it (figure space)
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
  // a point at local (lx, ly) of a frame at (x, y) turned by a
  const rot = (x, y, a, lx, ly) => [x + lx * Math.cos(a) - ly * Math.sin(a), y + lx * Math.sin(a) + ly * Math.cos(a)];
  // a cuff band with a pearl cufflink on a wrist (figure space)
  function cufflink(g, wr, r, col) {
    const ux = Math.cos(wr.ang), uy = Math.sin(wr.ang);
    let nx = -uy, ny = ux; if (ny > 0) { nx = -nx; ny = -ny; }
    pearl(g, wr.w[0] - ux * 6 + nx * 3.5, wr.w[1] - uy * 6 + ny * 3.5, r, { color: col });
  }
  // pastel notes, sparkles in the Gloss film colours, a polite 'ting'
  function glossNotes(g, x, y, t, n) { RJ.fx.notes(g, x + 16, y, t, G.hot, n || 3); }      // the kit puts them 34 px further out, clear of the face
  function glossSparkles(g, x, y, list, t) { const cols = ['#ffffff', G.pinkLt, G.lilacLt, G.mint]; list.forEach((p, i) => RJ.fx.sparkles(g, x, y, [p], cols[i % cols.length], t)); }
  // a Gloss shield: two bowed pearl-pink rings with a white edge (block)
  function glossRings(g, x, y, t) { RJ.fx.rings(g, x, y, t, G.pink); }
  // a rounded box polygon (tension 0)
  function rbox(x, y, w, h, r, n) {
    r = Math.min(r, w / 2, h / 2); n = n || 3;
    const pts = [], cs = [[x + w - r, y + r, -0.5], [x + w - r, y + h - r, 0], [x + r, y + h - r, 0.5], [x + r, y + r, 1]];
    for (let c = 0; c < 4; c++) for (let i = 0; i <= n; i++) { const a = (cs[c][2] + i / n * 0.5) * PI; pts.push([cs[c][0] + Math.cos(a) * r, cs[c][1] + Math.sin(a) * r]); }
    return pts;
  }
  // a boss-sized rig: the whole figure drawn k times larger (draw, points and bounds; the bust frames the same head and shoulders)
  function scaled(impl, k) {
    const d = impl.draw, p = impl.points, sz = (o) => Object.assign({}, o, { s: (o && o.s > 0 ? o.s : 1) * k });
    impl.draw = (ctx, o) => d.call(impl, ctx, sz(o));
    impl.points = (o) => p.call(impl, sz(o));
    const b = impl.bounds;
    impl.bounds = { w: b.w * k, h: b.h * k, x0: b.x0 * k, x1: b.x1 * k, y0: b.y0 * k, y1: 0 };
    return impl;
  }
  // a rig whose kit palette (the mic colours) is swapped for the length of each draw
  function withPal(impl, pal) {
    const wrap = (fn) => function () {
      const keep = {};
      for (const k in pal) { keep[k] = C[k]; C[k] = pal[k]; }
      try { return fn.apply(impl, arguments); } finally { for (const k in keep) C[k] = keep[k]; }
    };
    impl.draw = wrap(impl.draw); impl.bust = wrap(impl.bust);
    return impl;
  }
  // a leg decor: a crisp crease down the trouser front and a hem line over the shoe
  function trouserDecor(hemCol, creaseCol) {
    return function (g, hip, an) {
      const dx = an[0] - hip[0], dy = an[1] - hip[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux;
      RJ.ink(g, [[hip[0] + ux * 12 + nx * 3, hip[1] + uy * 12 + ny * 3], [an[0] - ux * 8 + nx * 3, an[1] - uy * 8 + ny * 3]], { w: 1.2, color: creaseCol, taper: 0.4, wobble: 0, alpha: 0.9 });
      const qx = an[0] - ux * 5, qy = an[1] - uy * 5;
      RJ.ink(g, [[qx - nx * 12, qy - ny * 12], [qx + nx * 12, qy + ny * 12]], { w: 1.5, color: hemCol || C.ink, taper: 0.2, wobble: 0 });
    };
  }
  // the common sit-down of the down pose (as Roxor's): legs crossed, shoulders slumped
  const SIT = { by: 50, torsoDy: 4, torsoRot: 0.07, lean: 0.03, headRot: 0.22, headDy: 2, fFoot: [-12, -58], bFoot: [14, -58], fBow: 24, bBow: -22, fFootRot: -0.5, bFootRot: 0.4, eyes: 'closed', mouth: 'flat', brow: -0.25, blush: 0.7 };
  const HURT = { lean: -0.13, torsoRot: -0.08, headRot: -0.14, headDx: -3, fFoot: [12, -12], bFoot: [-20, -12], eyes: 'hurt', mouth: 'ow', brow: -0.7, sweat: 1, blush: 0.6 };

  // ==========================================================================================================================================
  // MADAME SHEEN (boss): pearl helmet bob, chrome cat-eye sunglasses worn low (her eyes peek over), long pink coat, satin gloves, the gold record
  // ==========================================================================================================================================
  (function sheen() {
    const H = {
      hair: '#f1e8fc', hairSh: '#c9b6e8', hairHi: '#ffffff', hairPink: '#ffd6ee', hairMint: '#d2f7ec',
      skin: '#fde3d3', skinSh: '#f2bba8',
      coat: G.pink, coatSh: G.pinkSh, coatLt: G.pinkLt, coatDk: G.pinkDk, lining: '#b9a0ec', liningSh: '#9479d0',
      blouse: '#efe6ff', blouseSh: '#cdbcef', tights: '#8b72bf', tightsSh: '#6c56a0', shoe: '#e05aa6', shoeSh: '#b33f84',
      glove: G.pearl, gloveSh: G.pearlSh, lensT: '#f6a8d8', lensB: '#a98ce6', iris: ['#4a2f7c', '#a57fe2'],
    };
    const SKULL = RJ.skullPts({ w: 0.98, chin: 3 });
    // the bob: one polygon round the outside and back up the face opening (far side tip, the blunt fringe, the near side tip). Sharp points [x, y, 1].
    const BOB = [[10, -76], [36, -71], [56, -56], [68, -34], [72, -10], [72, 14], [69, 36], [64, 52], [58, 61, 1],
      [53, 50], [56, 30], [58, 8], [57, -10], [53, -21, 1],
      [36, -24], [16, -26], [-6, -25], [-24, -21], [-38, -15, 1],
      [-41, 4], [-42, 24], [-40, 42], [-35, 56], [-29, 64, 1],
      [-46, 64], [-61, 57], [-72, 40], [-78, 16], [-78, -12], [-72, -38], [-58, -60], [-34, -74]];
    const BOB_BACK = [[-66, -40], [-80, 8], [-74, 50], [-50, 68], [0, 66], [44, 66], [66, 44], [70, 0], [60, -40], [20, -68], [-30, -68]];
    // the anime ring highlight across the crown (white), with thin opal tints either side, and the flow lines
    const RING = [[-58, -44], [-40, -60], [-12, -68], [18, -67], [44, -58], [60, -42], [56, -36], [40, -50], [16, -58], [-12, -59], [-38, -52], [-54, -38]];
    const RING_P = [[-60, -34], [-42, -50], [-14, -58], [-14, -55], [-40, -46], [-58, -30]];
    const RING_M = [[46, -50], [62, -34], [66, -22], [62, -22], [58, -32], [44, -46]];
    const FLOW = [[[-46, -26], [-60, 0], [-62, 30], [-54, 52]], [[-30, -40], [-46, -14], [-52, 20]], [[48, -36], [62, -12], [63, 18], [60, 44]], [[2, -70], [-2, -50], [-4, -30]], [[22, -68], [24, -48], [28, -28]]];
    const CAST = [[-38, -15], [-24, -21], [-6, -25], [16, -26], [36, -24], [53, -21], [53, -12], [36, -16], [16, -18], [-6, -17], [-24, -13], [-38, -7]];
    const face = {
      eyes: [{ x: -14, y: 13, w: 30, h: 27 }, { x: 38, y: 12, w: 26, h: 26 }],
      brows: [[-14, -9, 24], [42, -9, 21]],
      browStyle: { thick: 3.6, arch: 0.6, tilt: 0.1, color: '#7c62a8' },
      nose: [24, 37, 56],
      mouth: [12, 47, 15],
      mouthStyle: { lineW: 1.5, inner: '#a83a6a', tongue: '#f590b8' },
      blush: [[-20, 37, 17], [44, 35, 14]],
      blushColor: '#ff8fbf',
      sweat: [60, -30, 5],
      eye: { iris: H.iris, ring: '#2a1840', sclera: '#fffdfd', expr: 'neutral', irisW: 0.7, irisH: 0.95, lid: 2.1, wing: 0.9, lash: 1.2, crease: true, lashes: 2, tilt: 0.12, drop: 0.22, hl: [[-0.38, -0.5, 0.3], [-0.3, -0.1, 0.13]] },
    };
    function back(g, S) {
      g.save(); g.translate(0, -40); g.rotate(S.P.hairSwing * 0.02); g.translate(0, 40);
      RJ.cel(g, BOB_BACK, H.hair, { shadow: H.hairSh, line: LINE.main, depth: 8, tension: 0.8 });
      g.restore();
    }
    function hair(g, S) {
      const sw = S.P.hairSwing * 1.2;
      // the two bob tips swing a touch: shear the lower part of the polygon with the sway
      const pts = BOB.map((p) => (p[1] > 20 ? [p[0] + sw * (p[1] - 20) / 44, p[1]].concat(p.slice(2)) : p));
      RJ.cel(g, pts, H.hair, { shadow: false, line: LINE.main + 0.3, tension: 0.75, weightVar: 0.3, decor: (gg) => {
        // the hard shadow: the near side mass and the underside of the far side
        RJ.fillPts(gg, [[-78, -10], [-72, 36], [-60, 58], [-44, 66], [-30, 66], [-36, 56], [-41, 40], [-42, 20], [-41, 2], [-38, -15], [-46, -10], [-62, -6]], H.hairSh, 0.85);
        RJ.fillPts(gg, [[52, -21], [57, -8], [58, 10], [56, 30], [53, 50], [58, 62], [50, 62], [46, 40], [48, 10], [46, -14]], H.hairSh, 0.85);
        RJ.fillPts(gg, [[-38, -15], [-24, -21], [-6, -25], [16, -26], [36, -24], [53, -21], [53, -27], [36, -30], [16, -32], [-6, -31], [-24, -27], [-38, -21]], H.hairSh, 0.6);
        RJ.fillPts(gg, RING_P, H.hairPink, 0.95);
        RJ.fillPts(gg, RING_M, H.hairMint, 0.95);
        RJ.fillPts(gg, RING, H.hairHi, 0.95);
        FLOW.forEach((l, i) => RJ.ink(gg, l, { w: 1.3, color: H.hairSh, taper: 0.5, wobble: 0.02, seed: i }));
        // the blunt fringe: a few straight cut ticks along its edge
        RJ.hatch(gg, [[-28, -24, -27, -32], [-14, -27, -13, -35], [2, -28, 2, -36], [20, -28, 21, -36], [38, -26, 39, -33]], { color: H.hairSh, w: 1.2, alpha: 0.8 });
      } });
      sweep(g, pts, [-78, -76, 72, 64], S.t, { at: 0.62, k: 0.1, alpha: 0.32, tension: 0.75, ph: 0.4 });
    }
    // the chrome cat-eye sunglasses, low on the nose: the eyes peek over the frames. P.glassDy slides them down, P.glassRot tilts them.
    const LENS_N = [[-43, 7, 1], [-32, 14], [-14, 15], [3, 15, 1], [3, 25], [-2, 33], [-15, 36], [-29, 33], [-36, 23]];
    const LENS_F = [[25, 15, 1], [37, 15], [50, 12], [60, 4, 1], [58, 17], [53, 28], [42, 32], [31, 31], [26, 24]];
    function glasses(g, S) {
      const P = S.P;
      g.save(); g.translate(14, 18 + num(P.glassDy)); g.rotate(num(P.glassRot)); g.translate(-14, -18);
      const arm = [[-37, 13], [-48, 11], [-58, 13]];
      RJ.ink(g, arm, { w: 4, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
      RJ.ink(g, arm, { w: 2, color: G.chrome, taper: 0, wobble: 0, weightVar: 0 });
      [LENS_N, LENS_F].forEach((L, i) => {
        const b = tk.shapeBox(L);
        g.save(); g.beginPath(); tk.trace(g, L, 0, 0, 0.5); g.clip();
        g.fillStyle = H.lensB; g.fillRect(b[0] - 2, b[1] - 2, b[2] - b[0] + 4, b[3] - b[1] + 4);
        g.fillStyle = H.lensT; g.fillRect(b[0] - 2, b[1] - 2, b[2] - b[0] + 4, (b[3] - b[1]) * 0.5 + 2);
        g.restore();
        sweep(g, L, b, S.t, { at: 0.5, k: 0.22, alpha: 0.6, tension: 0.5, per: 4.5, ph: i * 0.3 });
        RJ.ink(g, L, { closed: true, w: 6, color: C.ink, wobble: 0, weightVar: 0, tension: 0.5 });
        RJ.ink(g, L, { closed: true, w: 3.4, color: G.chrome, wobble: 0, weightVar: 0, tension: 0.5 });
        RJ.ink(g, L.slice(0, 4), { w: 1.3, color: '#ffffff', taper: 0.3, wobble: 0, weightVar: 0, tension: 0.5 });
        RJ.ink(g, L.slice(5, 8), { w: 1.2, color: G.chromeDk, taper: 0.3, wobble: 0, weightVar: 0, tension: 0.5, alpha: 0.8 });
      });
      const br = [[3, 19], [14, 16], [25, 19]];
      RJ.ink(g, br, { w: 5, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
      RJ.ink(g, br, { w: 2.6, color: G.chrome, taper: 0, wobble: 0, weightVar: 0 });
      // rhinestone pearls on the upswept corners
      pearl(g, -41, 9, 2.6); pearl(g, 58, 6, 2.3);
      g.restore();
    }
    function head(g, S) {
      headBase(g, S, { skull: SKULL, skin: H.skin, shade: H.skinSh, cast: CAST, castDy: 4 });
      hair(g, S);
      glasses(g, S);
    }
    const COAT_TOP = -162;
    function coatPts(P, sway) {
      const hem = num(P.coatHem, -4), fl = num(P.coatFlare), st = num(P.stepPhase) * 4, s = sway * 2.5, k = hem > -20 ? 1 : 0;      // sitting: soft hem corners pooled on the floor
      const y60 = -84 + (hem + 84) * 0.3, y30 = -84 + (hem + 84) * 0.68;
      return [[-14, COAT_TOP], [14, COAT_TOP], [40, -156], [48, -146, 1], [45, -122], [40, -100], [38, -84], [44, y60], [52 + fl * 0.5 + st, y30], [58 + fl + s + st, hem - 2 - 4 * (1 - k), k],
        [30 + s, hem + 2], [0 + s, hem + 3], [-30 + s, hem + 2], [-60 - fl + s - st, hem - 2 - 4 * (1 - k), k], [-54 - fl * 0.5 - st, y30], [-46, y60], [-40, -84], [-42, -100], [-47, -122], [-50, -146, 1], [-42, -156]];
    }
    function torso(g, S) {
      const P = S.P, sw = S.sway;
      RJ.neck(g, 2, -172, { w: 20, h: 18, skin: H.skin, shade: H.skinSh });
      const pts = coatPts(P, sw), hem = num(P.coatHem, -4);
      // the lilac lining and the tights showing in the split below the sash
      RJ.cel(g, [[-4, -86], [6, -86], [22 + sw * 2.5, hem], [-16 + sw * 2.5, hem]], H.lining, { shadow: H.liningSh, line: false, tension: 0, depth: 4 });
      RJ.cel(g, pts, H.coat, { shadow: H.coatSh, line: LINE.main + 0.2, depth: 9, tension: 0.45, hi: H.coatLt, hiW: 2, decor: (gg) => {
        // the split of the coat below the sash: lining in the gap
        gg.beginPath(); gg.moveTo(-1, -86); gg.lineTo(8, -86); gg.lineTo(24 + sw * 2.5, hem + 6); gg.lineTo(-18 + sw * 2.5, hem + 6); gg.closePath(); gg.fillStyle = H.lining; gg.fill();
        gg.beginPath(); gg.moveTo(-1, -86); gg.lineTo(2, -86); gg.lineTo(-12 + sw * 2.5, hem + 6); gg.lineTo(-18 + sw * 2.5, hem + 6); gg.closePath(); gg.fillStyle = H.liningSh; gg.fill();
        RJ.ink(gg, [[-1, -86], [-18 + sw * 2.5, hem + 2]], { w: LINE.main, color: C.ink, taper: 0.1, wobble: 0 });
        RJ.ink(gg, [[8, -86], [24 + sw * 2.5, hem + 2]], { w: LINE.main, color: C.ink, taper: 0.1, wobble: 0 });
        // fold lines on the skirt of the coat
        RJ.hatch(gg, [[[-30, -60], [-38, -30], [-42, hem - 6]], [[30, -60], [38, -30], [42, hem - 6]], [[-16, -50], [-22, hem - 10]]], { color: H.coatSh, w: 1.4, alpha: 0.9 });
        // the shoulder pads: a seam curve on each shoulder
        RJ.ink(gg, [[30, -158], [36, -146], [36, -134]], { w: 1.2, color: H.coatSh, taper: 0.4, wobble: 0 });
        RJ.ink(gg, [[-32, -158], [-38, -146], [-38, -134]], { w: 1.2, color: H.coatSh, taper: 0.4, wobble: 0 });
      } });
      sweep(g, pts, [-60, COAT_TOP, 58, hem], S.t, { at: 0.64, k: 0.1, alpha: 0.34, tension: 0.45, ph: 1.7, per: 6 });
      // the silk blouse in the V and the pearl necklace
      RJ.cel(g, [[-12, -163], [12, -163], [4, -128], [0, -122, 1], [-4, -128]], H.blouse, { shadow: H.blouseSh, line: LINE.mid, depth: 2, tension: 0.4 });
      for (let i = 0; i < 9; i++) { const u = i / 8, a = PI * (0.12 + 0.76 * u); pearl(g, Math.cos(a) * 13, -160 + Math.sin(a) * 15, 2.4); }
      pearl(g, 0, -141, 3.6);
      // the big shawl lapels in the light pink with a chrome piping
      const lapN = [[-14, -164], [-30, -156], [-34, -140], [-18, -112], [-2, -92, 1], [-6, -116], [-10, -140]];
      const lapF = [[14, -164], [30, -156], [32, -140], [20, -112], [6, -92, 1], [8, -116], [10, -140]];
      [lapN, lapF].forEach((L) => RJ.cel(g, L, H.coatLt, { shadow: H.coat, line: LINE.mid + 0.2, depth: 3, tension: 0.6, decor: (gg) => RJ.ink(gg, L.slice(1, 5), { w: 1.6, color: G.chrome, taper: 0.2, wobble: 0, alpha: 0.95, tension: 0.6 }) }));
      // the sash belt with a chrome buckle
      RJ.cel(g, [[-41, -92], [-10, -96], [16, -96], [40, -92], [40, -80], [16, -83], [-10, -83], [-41, -80]], H.coatDk, { shadow: RJ.shade(H.coatDk, 0.1), line: LINE.main, depth: 2.5, tension: 0.3 });
      chrome(g, rbox(-4, -98, 16, 18, 4), { line: LINE.mid, depth: 2.5 });
      g.beginPath(); g.rect(1.5, -93, 5, 8); g.fillStyle = H.coatDk; g.fill();
      // a pearl brooch on the near lapel
      pearl(g, -22, -136, 3.4); pearl(g, -27, -131, 2); pearl(g, -17, -131, 2);
    }
    // ---- the gold record: in the back hand (mid layer: over the coat, under the head), or flying in the strike ----
    function record(g, x, y, r, a, t) {
      g.save(); g.translate(x, y); g.rotate(a);
      RJ.cel(g, tk.circlePts(0, 0, r, 24), G.gold, { shadow: G.goldSh, line: LINE.main + 0.2, depth: r * 0.16, hi: G.goldLt, hiW: 1.8, decor: (gg) => {
        gg.lineWidth = 0.9; gg.strokeStyle = G.goldDk; gg.globalAlpha = 0.55;
        for (let k = 0; k < 4; k++) { gg.beginPath(); gg.arc(0, 0, r * (0.5 + k * 0.12), 0, TAU); gg.stroke(); }
        gg.globalAlpha = 1;
      } });
      sweep(g, tk.circlePts(0, 0, r, 24), [-r, -r, r, r], t, { at: 0.5, k: 0.22, alpha: 0.55, per: 3.2 });
      RJ.cel(g, tk.circlePts(0, 0, r * 0.36, 14), G.hot, { shadow: G.pinkDk, line: LINE.mid, depth: 2 });
      tk.sparkle(g, -r * 0.12, -r * 0.1, r * 0.17, { color: '#ffffff', glow: 0, thin: 0.25 });
      g.beginPath(); g.arc(r * 0.06, r * 0.08, Math.max(0.8, r * 0.06), 0, TAU); g.fillStyle = C.ink; g.fill();
      g.restore();
    }
    function recordAt(S) { const b = wristOf(S, false), P = S.P, a = b.ang + num(P.recRot); return { p: rot(b.w[0], b.w[1], a, 12, 0), a }; }
    // the record in the back hand: under the head while that arm is behind the body (mid layer), over everything when it is raised or thrust
    // forward (top layer: P.bFront or P.recTop)
    function holdRecord(g, S) {
      inFig(g, S, (gg) => {
        if (num(S.P.recHeld, 1) >= 0.5) { const r = recordAt(S); record(gg, r.p[0], r.p[1], 21, S.t * 0.4 + num(S.P.recRot), S.t); }
        redrawHand(gg, S, false);
      });
    }
    function mid(g, S) { if (!(S.P.bFront || S.P.recTop)) holdRecord(g, S); }
    function top(g, S) { if (S.P.bFront || S.P.recTop) holdRecord(g, S); }
    function fx(g, S, name) {
      const t = S.t, P = S.P;
      if (name === 'gnotes') glossNotes(g, S.pt.mouth[0] + 6, S.pt.mouth[1] - 14, t, 3);
      else if (name === 'gsparkles') glossSparkles(g, S.pt.head[0], S.pt.head[1], [[66, -60, 8, 0.3], [84, -10, 5, 0], [70, 34, 4, 0.4], [-74, -50, 6, 0.2], [-82, 10, 4, 0]], t);
      else if (name === 'grings') glossRings(g, S.pt.chest[0] + 14, S.pt.chest[1] + 10, t);
      else if (name === 'recglow') { const r = recordAt(S); tk.glow(g, r.p[0], r.p[1], 44, G.gold, 0.35 + 0.2 * Math.sin(t * 4)); glossSparkles(g, r.p[0], r.p[1], [[-26, -24, 6, 0.2], [28, -18, 5, 0.4], [20, 26, 4, 0]], t); }
      else if (name === 'recthrow') {
        // the record flung toward the target: a spinning gold disc on a curve with pearly speed dashes and a 'ting'
        const b = wristOf(S, false), u = fr(t * 1.1), x = b.w[0] + 34 + u * 90, y = b.w[1] - 10 - Math.sin(PI * u) * 22;
        g.save(); g.globalAlpha *= Math.min(1, (1 - u) * 3);
        for (let i = 1; i <= 3; i++) RJ.ink(g, [[x - 26 - i * 9, y - 12 + i * 7], [x - 12 - i * 9, y - 12 + i * 7]], { w: 3.6, color: i % 2 ? G.pinkLt : '#ffffff', taper: 0.4, wobble: 0, weightVar: 0 });
        g.save(); g.translate(x, y); g.scale(1, 0.62); record(g, 0, 0, 20, t * 14, t); g.restore();
        tk.sparkle(g, x + 20, y - 18, 7, { color: '#ffffff', glow: 0.3 });
        g.restore();
      }
    }
    const regal = { eyes: 'open', mouth: 'gloss', brow: 0.15, blush: 0.9 };
    const poses = {
      idle: Object.assign({ fHand: [10, 50], fBend: -1, fKind: 'fist', fRot: 0.5, bHand: [-34, -12], bBend: 1, bKind: 'fist', bRot: 0, recRot: -1.2, headRot: -0.05, torsoRot: -0.02, fx: [] }, regal),
      sing: { fHand: [40, -8], fBend: 1, fKind: 'open', fRot: -0.5, fSpread: 0.8, bHand: [-34, -10], bBend: 1, bKind: 'fist', recRot: -1.2, headRot: -0.08, eyes: 'open', mouth: 'chromeSmirk', brow: 0.3, blush: 1, fx: ['gnotes'], look: [0.5, -0.2] },
      attack: { fHand: [8, 48], fBend: -1, fKind: 'fist', fRot: 0.5, bHand: [70, 18], bBend: 1, bKind: 'fist', bFront: 1, recRot: -0.2, lean: 0.08, torsoRot: 0.07, headRot: 0.04, headDx: 3,
        fFoot: [32, -12], bFoot: [-26, -12], eyes: 'determined', mouth: 'chromeSmirk', brow: 0.5, fx: ['recglow'], look: [0.6, 0] },
      windup: { fHand: [12, 50], fBend: -1, fKind: 'fist', fRot: 0.5, bHand: [-44, -34], bBend: 1, bKind: 'fist', recRot: -2.2, lean: -0.06, torsoRot: -0.08, headRot: -0.06,
        fFoot: [26, -12], bFoot: [-24, -12], eyes: 'half', mouth: 'gloss', brow: 0.45, fx: ['recglow'], look: [0.5, 0] },
      strike: { fHand: [8, 48], fBend: -1, fKind: 'fist', fRot: 0.5, bHand: [74, 14], bBend: 1, bKind: 'open', bSpread: 1.2, bFront: 1, recHeld: 0, lean: 0.12, bx: 4, torsoRot: 0.08, headRot: 0.05, headDx: 3,
        fFoot: [36, -12], bFoot: [-26, -12], eyes: 'determined', mouth: 'chromeSmirk', brow: 0.5, fx: ['recthrow'], look: [0.6, 0] },
      hurt: Object.assign({ fHand: [24, 30], fBend: -1, fKind: 'open', fSpread: 1.3, fRot: 0.2, bHand: [-36, -8], bBend: 1, bKind: 'fist', recRot: -1.5, glassDy: 7, glassRot: 0.16, fx: ['stars'] }, HURT),
      cheer: { fHand: [10, 50], fBend: -1, fKind: 'fist', fRot: 0.5, bHand: [-46, -22], bBend: 1, bKind: 'fist', recRot: -0.9, recTop: 1, headRot: -0.06, eyes: 'happy', mouth: 'chromeGrin', brow: -0.1, blush: 1.3,
        fFoot: [20, -12], bFoot: [-18, -12], fx: ['gsparkles', 'recglow'] },
      block: { fHand: [10, 50], fBend: -1, fKind: 'fist', fRot: 0.5, bHand: [58, 8], bBend: 1, bKind: 'fist', bFront: 1, recRot: -1.57, headRot: -0.08, eyes: 'open', mouth: 'gloss', brow: 0.4,
        fFoot: [28, -12], bFoot: [-28, -12], fx: ['grings'] },
      down: Object.assign({ fHand: [16, 46], fBend: 1, fKind: 'relaxed', fRot: 0.2, bHand: [-8, 52], bBend: -1, bKind: 'fist', recRot: -0.4, coatHem: -48, coatFlare: 8, glassDy: 9, glassRot: -0.2, fx: ['mute'] }, SIT),
      walk: Object.assign({ fHand: [10, 50], fBend: -1, fKind: 'fist', fRot: 0.5, bHand: [-30, 14], bBend: 1, bKind: 'fist', recRot: -1.0, headRot: -0.05, fx: [] }, regal),
      bust: Object.assign({ fHand: [8, 58], fBend: -1, fKind: 'relaxed', fRot: 0.2, bHand: [-8, 58], bBend: 1, bKind: 'relaxed', recHeld: 0, headRot: -0.04, fx: [] }, regal),
    };
    const spec = {
      id: 'npc_gloss_sheen', accent: 'gloss',
      skel: { neck: [0, -158], headC: [2, -216], shF: [28, -143], shB: [-28, -143], hip: [0, -80], hipF: [13, -80], hipB: [-13, -80] },
      base: { mic: 'none', recTop: 0, recHeld: 1, recRot: -1.2, glassDy: 0, glassRot: 0, coatHem: -4, coatFlare: 0 },
      poses, face,
      exprs: { smirk: { eyes: 'open', mouth: 'chromeSmirk', brow: 0.35 }, neutral: { eyes: 'open', mouth: 'gloss', brow: 0.15 } },
      arm: { l: [26, 24], w: [19, 14], skin: H.coat, skinSh: H.coatSh, cuff: { color: H.coatLt, light: H.coat }, hand: { skin: H.glove, shade: H.gloveSh } },
      legs: { w: [21, 15], color: H.tights, shade: H.tightsSh, pantsOver: true, bow: 2, shoe: { color: H.shoe, sole: '#ffd2ea', shade: H.shoeSh, toeCap: '#ff86c4', hi: '#ffb5dc', k: 1.05 } },
      life: { idle: { bob: 1.0, per: 3.6, sway: 0.01, head: 0.014 }, walk: { bob: 1.6, per: 0.55, head: 0.008, step: { hz: 1.8, stride: 8, lift: 4 } } },
      tip: (P, Lay) => { const b = Lay.pt.shB; return [b[0] + P.bHand[0] + 14, b[1] + P.bHand[1]]; },
      bounds: { h: 308, x0: -132, x1: 129 },      // measured over the ten poses (no effects); the rig is drawn 1.12x, scaled() scales these too
      bust: { rect: [-92, -298, 92, -94], face: [-82, -294, 76, -140], pose: 'bust' },
      layers: { backHair: back, torso, mid, head, top, fx },
      tweak(P, t) {
        if (P.pose === 'idle') P.recRot = num(P.recRot) + 0.08 * Math.sin(t * 1.3) * tk.motion();      // she turns the record so it catches the light
      },
    };
    RJ.register('npc_gloss_sheen', scaled(RJ.rig(spec), 1.12));
  })();

  // ==========================================================================================================================================
  // MR. MUTE (enforcer): very tall, broad lilac suit, plum flat-top, the chrome smile plate over his mouth, a chrome mic stand wrapped in pink
  // ==========================================================================================================================================
  (function mute() {
    const H = {
      hair: '#4c3a6e', hairSh: '#2e2148', hairHi: '#8c76b8',
      skin: '#f6cdb0', skinSh: '#e2a98a',
      suit: '#a596d4', suitSh: '#7f6eb4', suitLt: '#c8bdf0', suitDk: '#5f4f94',
      shirt: G.pink, shirtSh: G.pinkSh, tie: '#e45aa6', tieSh: '#b33f84',
      pants: '#8c7cc2', pantsSh: '#6a5aa2', shoe: '#3d3158', shoeSh: '#261d3a',
      iris: ['#3a2a5e', '#7d6ab8'],
    };
    const SKULL = [[-2, -58], [30, -54], [52, -36], [60, -6], [58, 24], [48, 46], [30, 58], [10, 62], [-12, 58], [-34, 46], [-52, 26], [-61, -4], [-58, -34], [-40, -53]];
    // the flat-top: square crown, short slicked sides
    const TOP = [[-58, -26], [-62, -50], [-56, -74], [-40, -82, 1], [-10, -86], [22, -86], [46, -82, 1], [60, -66], [62, -40], [58, -20, 1],
      [52, -30], [40, -36], [22, -40], [4, -40], [-14, -38], [-30, -34], [-42, -26], [-46, -8], [-50, 10, 1], [-58, 0]];
    const CAST = [[-46, -8], [-42, -26], [-30, -34], [-14, -38], [4, -40], [22, -40], [40, -36], [52, -30], [52, -22], [40, -28], [22, -32], [4, -32], [-14, -30], [-30, -26], [-40, -18]];
    const face = {
      eyes: [{ x: -14, y: 16, w: 27, h: 24 }, { x: 37, y: 15, w: 23, h: 23 }],
      brows: [[-15, -8, 27], [42, -8, 23]],
      browStyle: { thick: 6.2, arch: 0.15, tilt: 0.12, color: H.hairSh },
      nose: [24, 33, 60],
      mouth: [9, 46, 30],
      blush: [[-22, 36, 16], [44, 34, 13]],
      sweat: [60, -18, 5],
      eye: { iris: H.iris, ring: '#1b1230', sclera: '#fffdfa', expr: 'neutral', irisW: 0.66, irisH: 0.92, lid: 2.3, wing: 0.3, lash: 1.1, crease: true, lashes: 0, tilt: 0.08, drop: 0.32, hl: [[-0.4, -0.5, 0.3], [-0.34, -0.12, 0.13]] },
    };
    // the chrome smile plate: the Gloss smile, made big and bolted on. P.plateRot jolts it in the hurt pose.
    const PLATE = [[-17, 31, 1], [-8, 36], [0, 38.5], [9, 39.5], [18, 38.5], [27, 36], [35, 31, 1], [36, 39], [31, 48], [20, 54], [9, 55.5], [-2, 54], [-13, 48], [-18, 39]];
    function plate(g, S) {
      const P = S.P, sh = P.pose === 'hurt' ? Math.sin(S.t * 40) * 1.2 * tk.motion() : 0;
      g.save(); g.translate(9 + sh, 44); g.rotate(num(P.plateRot)); g.translate(-9, -44);
      g.save(); g.globalAlpha = 0.25; g.fillStyle = H.skinSh; g.beginPath(); tk.trace(g, PLATE, RJ.lx(-1.5), 3, 0.5); g.fill(); g.restore();
      // smooth silver with a blush of pink in the shadow: no horizon band here, so it never reads as teeth
      chrome(g, PLATE, { tension: 0.5, depth: 2.5, band: false, shade: '#c9a9cf' });
      sweep(g, PLATE, [-18, 31, 36, 56], S.t, { at: 0.5, k: 0.14, alpha: 0.6, tension: 0.5, per: 3.6 });
      // the Gloss smile engraved across it (a groove with a lit lower lip), the speaker grille under it and the two rivets
      g.save(); g.translate(RJ.lx(0.6), 0.9); foe.glossSmile ? foe.glossSmile(g, 9, 43, 26, { color: '#ffffff' }) : 0; g.restore();
      if (foe.glossSmile) foe.glossSmile(g, 9, 43, 26, { color: G.chromeDk });
      [[5, 51], [9, 51.6], [13, 51]].forEach((h) => { g.beginPath(); g.arc(h[0], h[1], 1, 0, TAU); g.fillStyle = G.chromeDk; g.fill(); });
      [[-12, 38], [30, 38]].forEach((r) => { g.beginPath(); g.arc(r[0], r[1], 1.7, 0, TAU); g.fillStyle = G.chromeDk; g.fill(); g.beginPath(); g.arc(r[0] - 0.5, r[1] - 0.5, 0.7, 0, TAU); g.fillStyle = '#ffffff'; g.fill(); });
      tk.sparkle(g, 36, 30, 3.8 * (0.7 + 0.3 * Math.sin(S.t * 3)), { color: '#ffffff', glow: 0.25, thin: 0.18 });
      g.restore();
    }
    function hair(g, S) {
      RJ.cel(g, TOP, H.hair, { shadow: H.hairSh, line: LINE.main + 0.2, depth: 6, tension: 0.55, hi: H.hairHi, hiW: 1.6, hiAlpha: 0.7, decor: (gg) => {
        // the flat top's lit plane and the comb lines
        RJ.fillPts(gg, [[-40, -82], [-10, -86], [22, -86], [46, -82], [40, -76], [20, -79], [-10, -79], [-36, -76]], H.hairHi, 0.6);
        RJ.hatch(gg, [[[-30, -70], [-40, -54], [-48, -30]], [[-10, -74], [-20, -58], [-26, -40]], [[14, -76], [10, -58], [6, -42]], [[36, -74], [40, -56], [44, -36]]], { color: H.hairSh, w: 1.3, alpha: 0.9 });
      } });
      sweep(g, TOP, [-62, -86, 62, 10], S.t, { at: 0.7, k: 0.08, alpha: 0.28, tension: 0.55, ph: 2.1 });
    }
    function head(g, S) {
      headBase(g, S, { skull: SKULL, skin: H.skin, shade: H.skinSh, cast: CAST, castDy: 4, noMouth: true });
      RJ.ear(g, -53, 22, { r: 13, side: -1, skin: H.skin, shade: H.skinSh });
      hair(g, S);
      plate(g, S);
    }
    const JK = [[-16, -190], [16, -190], [44, -182], [54, -170, 1], [52, -140], [46, -110], [44, -86], [46, -74, 1], [20, -68], [0, -72], [-20, -68], [-46, -74, 1], [-44, -86], [-46, -110], [-52, -140], [-54, -170, 1], [-44, -182]];
    function torso(g, S) {
      g.translate(0, -12);      // the suit was drawn for a skeleton 12 lower: the whole torso rides up with the taller skel
      RJ.neck(g, 2, -194, { w: 22, h: 16, skin: H.skin, shade: H.skinSh });
      RJ.cel(g, JK, H.suit, { shadow: H.suitSh, line: LINE.main + 0.2, depth: 9, tension: 0.35, hi: H.suitLt, hiW: 1.8, decor: (gg) => {
        RJ.hatch(gg, [[[-34, -150], [-28, -128], [-30, -104]], [[32, -150], [26, -128], [28, -104]]], { color: H.suitSh, w: 1.4, alpha: 0.9 });
        RJ.ink(gg, [[2, -116], [2, -72]], { w: 1.6, color: C.ink, taper: 0.1, wobble: 0 });          // the jacket's closing line
      } });
      sweep(g, JK, [-54, -190, 54, -68], S.t, { at: 0.68, k: 0.12, alpha: 0.3, tension: 0.35, ph: 0.9, per: 6.5 });
      // shirt V, tie with a chrome clip
      RJ.cel(g, [[-14, -192], [14, -192], [4, -150], [0, -116, 1], [-4, -150]], H.shirt, { shadow: H.shirtSh, line: LINE.mid, depth: 2, tension: 0.2 });
      RJ.cel(g, [[-5, -190], [5, -190], [4, -183], [-4, -183]], H.tie, { shadow: H.tieSh, line: LINE.fine + 0.3, tension: 0, depth: 1 });
      RJ.cel(g, [[-4, -183], [4, -183], [6, -140], [0, -126, 1], [-6, -140]], H.tie, { shadow: H.tieSh, line: LINE.fine + 0.4, tension: 0.2, depth: 2 });
      chrome(g, rbox(-9, -158, 18, 5, 2), { line: LINE.fine + 0.2, band: false, depth: 1 });
      // peaked lapels
      const lapN = [[-14, -192], [-28, -184], [-32, -172, 1], [-24, -170], [-30, -160, 1], [-14, -136], [0, -118, 1], [-4, -150]];
      const lapF = [[14, -192], [28, -184], [30, -172, 1], [22, -170], [28, -160, 1], [14, -136], [4, -118, 1], [4, -150]];
      [lapN, lapF].forEach((L) => RJ.cel(g, L, H.suitLt, { shadow: H.suit, line: LINE.mid + 0.2, depth: 3, tension: 0.3 }));
      // the pink pocket square with a gloss shine, two chrome buttons
      RJ.cel(g, [[24, -146], [30, -152, 1], [34, -146], [38, -151, 1], [40, -142], [24, -142]], G.pink, { shadow: G.pinkSh, line: LINE.fine + 0.3, tension: 0.1, depth: 1.5 });
      RJ.ink(g, [[22, -142], [42, -142]], { w: 1.8, color: H.suitSh, taper: 0, wobble: 0 });
      [[6, -104], [6, -88]].forEach((b) => chrome(g, tk.circlePts(b[0], b[1], 3, 10), { line: LINE.fine + 0.2, band: false, depth: 1 }));
    }
    // the chrome mic stand wrapped in a pink ribbon, held in the front hand. P.stAng tips it (0 upright), P.stUp the length above the hand.
    function stand(g, S) {
      const P = S.P, f = wristOf(S, true), a = num(P.stAng), up = num(P.stUp, 78), dx = Math.sin(a), dy = -Math.cos(a);
      // a planted stand reaches exactly to the floor
      const dn = P.stFoot ? Math.max(20, (-num(P.by) - 1 - f.w[1]) / Math.max(0.3, Math.cos(a))) : num(P.stDn, 96);
      const top = [f.w[0] + dx * up, f.w[1] + dy * up], bot = [f.w[0] - dx * dn, f.w[1] - dy * dn];
      RJ.ink(g, [bot, top], { w: 7.6, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
      RJ.ink(g, [bot, top], { w: 4.6, color: G.chrome, taper: 0, wobble: 0, weightVar: 0 });
      RJ.ink(g, [[bot[0] + 1.2, bot[1]], [top[0] + 1.2, top[1]]], { w: 1.2, color: '#ffffff', taper: 0, wobble: 0, weightVar: 0 });
      // the ribbon spiral: short diagonal pink wraps along the pole
      const L = up + dn, n = Math.floor(L / 13), nx = -dy, ny = dx;
      for (let i = 1; i < n; i++) {
        const u = i / n, cx = lerp(bot[0], top[0], u), cy = lerp(bot[1], top[1], u);
        const p0 = [cx - nx * 4 - dx * 3, cy - ny * 4 - dy * 3], p1 = [cx + nx * 4 + dx * 3, cy + ny * 4 + dy * 3];
        RJ.ink(g, [p0, p1], { w: 4.6, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
        RJ.ink(g, [p0, p1], { w: 2.6, color: i % 2 ? G.hot : G.pink, taper: 0, wobble: 0, weightVar: 0 });
      }
      // the round chrome foot (only when it stands on the ground) and the mic at the top in its clip
      if (P.stFoot) chrome(g, tk.ellipsePts(bot[0], bot[1] + 1, 18, 4.5, 14), { line: LINE.mid, depth: 1.5, band: false });
      g.save(); g.translate(top[0], top[1]); g.rotate(a);
      chrome(g, rbox(-4, -6, 8, 8, 2), { line: LINE.fine + 0.3, band: false, depth: 1 });
      RJ.cel(g, [[-5.5, -6], [5.5, -6], [4.5, -22], [-4.5, -22]], G.pink, { shadow: G.pinkSh, line: LINE.mid, tension: 0.3, depth: 2 });
      const head = tk.circlePts(0, -29, 9, 16);
      chrome(g, head, { line: LINE.mid + 0.2, depth: 2.5, decor: (gg) => { gg.strokeStyle = G.chromeSh; gg.lineWidth = 0.8; for (let i = -1; i <= 1; i++) { gg.beginPath(); gg.ellipse(0, -29, Math.abs(i) * 3.2 + 0.4, 9, 0, 0, TAU); gg.stroke(); } } });
      sweep(g, head, [-9, -38, 9, -20], S.t, { at: 0.5, k: 0.25, alpha: 0.5, per: 4 });
      g.restore();
      redrawHand(g, S, true);
    }
    function top(g, S) { inFig(g, S, (gg) => stand(gg, S)); }
    function fx(g, S, name) {
      const t = S.t, P = S.P;
      if (name === 'platearcs') {
        // he speaks only through the grille of his chrome smile: small pink sound arcs
        const m = S.pt.mouth; RJ.fx.arcs(g, m[0] + 22, m[1] + 4, 0.1, t, G.hot, 3);
      } else if (name === 'gsparkles') glossSparkles(g, S.pt.head[0], S.pt.head[1], [[64, -60, 7, 0.3], [82, -14, 5, 0], [-72, -46, 5, 0.2]], t);
      else if (name === 'grings') glossRings(g, S.pt.chest[0] + 18, S.pt.chest[1] + 14, t);
      else if (name === 'swing') {
        // the baton swing: a pearly arc trail behind the mic head and a burst where it lands
        const f = wristOf(S, true), a = num(P.stAng), up = num(P.stUp, 78), tx = f.w[0] + Math.sin(a) * (up + 26), ty = f.w[1] - Math.cos(a) * (up + 26);
        g.save(); g.lineCap = 'round';
        for (let i = 0; i < 3; i++) { g.globalAlpha = 0.75 - i * 0.2; g.strokeStyle = i ? G.pinkLt : '#ffffff'; g.lineWidth = 6 - i * 1.6; g.beginPath(); g.arc(f.w[0], f.w[1], up + 26 + i * 7, a - PI / 2 - 1.1, a - PI / 2 - 0.15); g.stroke(); }
        g.restore();
        RJ.fx.burst(g, tx + 18, ty + 4, 16 + 8 * S.beat, G.pink, '#ffffff', t);
      }
    }
    const stoic = { eyes: 'open', mouth: 'flat', brow: 0.15, blush: 0.6 };
    const poses = {
      idle: Object.assign({ fHand: [34, 56], fBend: -1, fKind: 'fist', fRot: -1.4, stAng: 0, stUp: 78, stDn: 98, stFoot: 1, bHand: [-8, 58], bBend: 1, bKind: 'fist', bRot: 0.4, headRot: 0.02, fx: [] }, stoic),
      sing: Object.assign({ fHand: [34, 56], fBend: -1, fKind: 'fist', fRot: -1.4, stAng: 0, stUp: 78, stDn: 98, stFoot: 1, bHand: [-40, 4], bBend: 1, bKind: 'point', bRot: 0.4, headRot: -0.04, fx: ['platearcs'] }, { eyes: 'half', brow: 0.25, blush: 0.8, look: [0.5, 0] }),
      windup: { fHand: [4, 24], fBend: 1, fKind: 'fist', fRot: -1.4, stAng: -1.25, stUp: 74, stDn: 36, stFoot: 0, bHand: [-30, 20], bBend: 1, bKind: 'fist', lean: -0.07, torsoRot: -0.1, headRot: -0.02,
        fFoot: [28, -12], bFoot: [-28, -12], eyes: 'determined', brow: 0.55, blush: 0.6, fx: [], look: [0.6, 0] },
      attack: { fHand: [52, -6], fBend: 1, fKind: 'fist', fRot: -1.4, stAng: 1.05, stUp: 60, stDn: 40, stFoot: 0, bHand: [-34, 10], bBend: 1, bKind: 'fist', lean: 0.1, torsoRot: 0.08, headRot: 0.05, headDx: 3,
        fFoot: [34, -12], bFoot: [-28, -12], eyes: 'determined', brow: 0.55, blush: 0.6, fx: ['swing'], look: [0.6, 0] },
      strike: { fHand: [54, 4], fBend: 1, fKind: 'fist', fRot: -1.4, stAng: 1.45, stUp: 60, stDn: 40, stFoot: 0, bHand: [-36, 6], bBend: 1, bKind: 'fist', lean: 0.14, bx: 6, torsoRot: 0.1, headRot: 0.06, headDx: 3,
        fFoot: [38, -12], bFoot: [-28, -12], eyes: 'determined', brow: 0.6, blush: 0.6, fx: ['swing'], look: [0.6, 0] },
      hurt: Object.assign({ fHand: [30, 40], fBend: -1, fKind: 'fist', fRot: -1.4, stAng: 0.35, stUp: 78, stDn: 70, stFoot: 0, bHand: [-36, -6], bBend: 1, bKind: 'open', bSpread: 1.3, plateRot: 0.12, fx: ['stars'] }, HURT),
      cheer: { fHand: [36, -44], fBend: 1, fKind: 'fist', fRot: -1.4, stAng: 0.25, stUp: 58, stDn: 70, stFoot: 0, bHand: [-14, 54], bBend: 1, bKind: 'fist', headRot: 0.02, eyes: 'happy', brow: -0.1, blush: 1.2,
        fFoot: [22, -12], bFoot: [-20, -12], fx: ['gsparkles'] },
      block: { fHand: [44, -24], fBend: 1, fKind: 'fist', fRot: -1.4, stAng: 0.05, stUp: 80, stDn: 70, stFoot: 0, bHand: [48, -10], bBend: 1, bKind: 'fist', bFront: 1, headRot: -0.04, eyes: 'open', brow: 0.45, blush: 0.6,
        fFoot: [30, -12], bFoot: [-30, -12], fx: ['grings'] },
      down: Object.assign({ fHand: [40, 40], fBend: 1, fKind: 'fist', fRot: -1.4, stAng: 1.45, stUp: 40, stDn: 60, stFoot: 0, bHand: [-8, 54], bBend: -1, bKind: 'relaxed', bRot: 0.3, plateRot: -0.1, fx: ['mute'] }, SIT, { mouth: 'flat' }),
      walk: Object.assign({ fHand: [34, 50], fBend: -1, fKind: 'fist', fRot: -1.4, stAng: 0.12, stUp: 78, stDn: 80, stFoot: 0, bHand: [-14, 56], bBend: 1, bKind: 'fist', bRot: 0.4, headRot: 0.02, fx: [] }, stoic),
      bust: Object.assign({ fHand: [10, 60], fBend: -1, fKind: 'fist', stAng: PI, stUp: 60, stDn: 20, stFoot: 0, bHand: [-8, 60], bBend: 1, bKind: 'fist', fx: [] }, stoic),
    };
    const spec = {
      id: 'npc_gloss_mute', accent: 'gloss',
      skel: { neck: [0, -194], headC: [2, -250], shF: [34, -180], shB: [-34, -180], hip: [0, -110], hipF: [17, -108], hipB: [-17, -108] },
      base: { mic: 'none', stAng: 0, stUp: 78, stDn: 96, stFoot: 0, plateRot: 0, headScale: 0.94 },
      poses, face,
      exprs: { happy: { eyes: 'happy', brow: -0.1, blush: 1.2 }, smirk: { eyes: 'half', brow: 0.35 }, angry: { eyes: 'angry', brow: 1 } },
      arm: { l: [32, 30], w: [22, 16], skin: H.suit, skinSh: H.suitSh, cuff: { color: G.shirt, light: G.shirtSh }, hand: { skin: H.skin, shade: H.skinSh } },
      legs: { w: [30, 22], color: H.pants, shade: H.pantsSh, pantsOver: true, bow: 1.5, profile: (u) => 1 - 0.25 * u, decor: trouserDecor(C.ink, H.pantsSh), shoe: { color: H.shoe, sole: '#7d6aa8', shade: H.shoeSh, toeCap: '#5a4a80', hi: '#7a68a6', k: 1.3 } },
      life: { idle: { bob: 0.8, per: 4.0, sway: 0.006, head: 0.01 }, walk: { bob: 2.0, per: 0.6, head: 0.008, step: { hz: 1.7, stride: 12, lift: 5 } } },
      tip: (P, Lay) => { const sh = Lay.pt.shF, a = num(P.stAng), up = num(P.stUp, 78) + 26; return [sh[0] + P.fHand[0] + Math.sin(a) * up, sh[1] + P.fHand[1] - Math.cos(a) * up]; },
      bounds: { h: 346, x0: -129, x1: 212 },      // measured: the stand swung out in the strike is the widest reach
      bust: { rect: [-92, -320, 92, -116], face: [-80, -316, 76, -170], pose: 'bust' },
      layers: { torso, head, top, fx },
      tweak(P, t) {
        if (P.pose === 'idle') P.bHand = [P.bHand[0], P.bHand[1] - 1.5 * Math.max(0, Math.sin(t * 1.9)) * tk.motion()];      // cracks his knuckles, slowly
        else if (P.pose === 'attack' || P.pose === 'strike') P.stAng = num(P.stAng) + 0.25 * (P.beat - 0.5);
      },
    };
    RJ.register('npc_gloss_mute', RJ.rig(spec));
  })();

  // ==========================================================================================================================================
  // AGENT AUTOTUNE (grunt): pink pompadour quiff, chrome earpiece and coiled cord, pitch-perfect smirk, cropped pink suit, a pearl gloss mic
  // ==========================================================================================================================================
  (function tune() {
    const H = {
      hair: '#ff8fcf', hairSh: '#d9589f', hairHi: '#ffd7ef', hairDk: '#a63a78',
      skin: '#fbd2b8', skinSh: '#eba98c',
      jk: G.pink, jkSh: G.pinkSh, jkLt: G.pinkLt, shirt: '#ece2ff', shirtSh: '#c9b9ee', tie: '#7d66b8', tieSh: '#5c4796',
      pants: '#8a74c6', pantsSh: '#6853a6', shoe: G.pearl, shoeSh: G.pearlSh,
      iris: ['#5a2048', '#d0609c'],
    };
    const SKULL = RJ.skullPts({ w: 0.97, chin: 4 });
    // the pompadour: a big wave rising off the forehead and breaking forward (+x) with a curled lip; slick short sides
    const QUIFF = [[-60, -12], [-64, -36], [-58, -56], [-44, -70], [-26, -80], [-6, -90], [16, -99], [40, -106], [62, -106], [80, -95], [88, -78], [85, -62], [74, -52, 1],
      [66, -58], [62, -52], [54, -42, 1], [57, -30], [54, -19, 1], [42, -24], [26, -30], [8, -32], [-10, -30], [-26, -24], [-38, -14], [-44, 4], [-46, 22, 1], [-58, 16]];
    const Q_SH = [[-60, -12], [-64, -36], [-58, -58], [-44, -74], [-30, -82], [-34, -66], [-40, -48], [-42, -28], [-44, 4], [-46, 22], [-58, 16]];
    const Q_HI = [[[-16, -84], [6, -94], [30, -102], [54, -104], [72, -98], [68, -94], [52, -99], [30, -97], [6, -89], [-14, -80]], [[30, -74], [48, -80], [66, -80], [62, -76], [48, -75], [32, -70]]];
    const Q_FLOW = [[[-40, -60], [-10, -78], [24, -90], [60, -96], [80, -86]], [[-30, -44], [0, -62], [34, -74], [70, -72], [82, -64]], [[-34, -24], [-8, -40], [22, -46], [50, -42]], [[-40, -6], [-44, -30], [-50, -50]]];
    const CAST = [[-44, 4], [-38, -14], [-26, -24], [-10, -30], [8, -32], [26, -30], [42, -24], [54, -19], [54, -12], [42, -18], [26, -24], [8, -26], [-10, -24], [-26, -18], [-38, -6]];
    const face = {
      eyes: [{ x: -13, y: 16, w: 28, h: 25 }, { x: 38, y: 14, w: 24, h: 24 }],
      brows: [[-14, -9, 25], [43, -15, 22]],
      browStyle: { thick: 4.6, arch: 0.55, tilt: 0.25, color: H.hairDk },
      nose: [24, 34, 56],
      mouth: [11, 45, 16],
      mouthStyle: { lineW: 1.45, inner: '#a83a6a', tongue: '#f590b8' },
      blush: [[-20, 36, 16], [43, 34, 13]],
      sweat: [60, -22, 5],
      eye: { iris: H.iris, ring: '#2a0f22', sclera: '#fffdfa', expr: 'smirk', irisW: 0.68, irisH: 0.94, lid: 2.1, wing: 0.7, lash: 1.1, crease: true, lashes: 1, tilt: 0.22, drop: 0.3, hl: [[-0.4, -0.5, 0.3], [-0.32, -0.12, 0.13]] },
    };
    function hair(g, S) {
      const sw = S.P.hairSwing;
      const pts = QUIFF.map((p) => (p[0] > 40 && p[1] < -60 ? [p[0] + sw * 1.4, p[1] + sw * 0.6].concat(p.slice(2)) : p));
      RJ.cel(g, pts, H.hair, { shadow: false, line: LINE.main + 0.2, tension: 0.7, weightVar: 0.35, decor: (gg) => {
        RJ.fillPts(gg, Q_SH, H.hairSh, 0.9);
        RJ.fillPts(gg, [[54, -42], [62, -52], [66, -58], [74, -52], [85, -62], [80, -56], [70, -46], [60, -36], [57, -30]], H.hairSh, 0.85);
        RJ.ink(gg, [[80, -70], [74, -64], [70, -58], [72, -54]], { w: 1.4, color: H.hairDk, taper: 0.4, wobble: 0 });      // the roll of the front curl
        Q_HI.forEach((f) => RJ.fillPts(gg, f, H.hairHi, 0.9));
        Q_FLOW.forEach((l, i) => RJ.ink(gg, l, { w: 1.4, color: H.hairDk, taper: 0.5, wobble: 0.02, seed: i, alpha: 0.9 }));
      } });
      sweep(g, pts, [-64, -108, 88, 10], S.t, { at: 0.55, k: 0.08, alpha: 0.35, tension: 0.7, per: 4.2, ph: 0.6 });
    }
    // the chrome earpiece in the near ear and its coiled cord running down behind the jaw into the collar
    function earpiece(g, S) {
      const coil = [];
      for (let i = 0; i <= 22; i++) { const u = i / 22, x = -52 + u * 8 + Math.sin(u * PI * 9) * 2.8, y = 30 + u * 46; coil.push([x, y]); }
      RJ.ink(g, coil, { w: 3, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
      RJ.ink(g, coil, { w: 1.4, color: G.lilacLt, taper: 0, wobble: 0, weightVar: 0 });
      chrome(g, tk.ellipsePts(-52, 22, 6, 7.5, 12), { line: LINE.mid, depth: 1.5, band: false });
      g.beginPath(); g.arc(-52, 22, 2.4, 0, TAU); g.fillStyle = G.hot; g.fill();
      const blink = 0.5 + 0.5 * Math.sin(S.t * 5);
      tk.glow(g, -52, 22, 7, G.hot, 0.25 * blink);
    }
    function head(g, S) {
      headBase(g, S, { skull: SKULL, skin: H.skin, shade: H.skinSh, cast: CAST, castDy: 4 });
      RJ.ear(g, -50, 24, { r: 13, side: -1, skin: H.skin, shade: H.skinSh });
      hair(g, S);
      earpiece(g, S);
    }
    const JK = [[-14, -154], [14, -154], [34, -148], [42, -134, 1], [40, -114], [36, -96], [38, -86, 1], [16, -82], [8, -90], [0, -84], [-8, -90], [-16, -82], [-38, -86, 1], [-36, -96], [-40, -114], [-42, -134, 1], [-34, -148]];
    function torso(g, S) {
      RJ.neck(g, 2, -158, { w: 20, h: 18, skin: H.skin, shade: H.skinSh });
      // the shirt and the waveform tie show between the open jacket fronts
      RJ.cel(g, [[-12, -156], [12, -156], [14, -86], [-14, -86]], H.shirt, { shadow: H.shirtSh, line: LINE.mid, tension: 0, depth: 3 });
      RJ.cel(g, JK, H.jk, { shadow: H.jkSh, line: LINE.main + 0.2, depth: 8, tension: 0.35, hi: H.jkLt, hiW: 1.8, decor: (gg) => {
        // the open front: the shirt shows in a narrow gap
        gg.beginPath(); gg.moveTo(-10, -154); gg.lineTo(10, -154); gg.lineTo(7, -88); gg.lineTo(-7, -88); gg.closePath(); gg.fillStyle = H.shirt; gg.fill();
        RJ.ink(gg, [[-10, -154], [-7, -88]], { w: LINE.mid, color: C.ink, taper: 0.1, wobble: 0 }); RJ.ink(gg, [[10, -154], [7, -88]], { w: LINE.mid, color: C.ink, taper: 0.1, wobble: 0 });
        RJ.hatch(gg, [[[-30, -128], [-26, -110], [-28, -96]], [[28, -128], [24, -112], [26, -98]]], { color: H.jkSh, w: 1.3, alpha: 0.9 });
      } });
      sweep(g, JK, [-42, -154, 42, -82], S.t, { at: 0.7, k: 0.12, alpha: 0.35, tension: 0.35, ph: 2.4, per: 5 });
      // the tie: skinny lilac with a pink pitch waveform (a staircase: autotuned) and a chrome bar
      const tie = [[-3.5, -150], [3.5, -150], [4.5, -98], [0, -90, 1], [-4.5, -98]];
      RJ.cel(g, tie, H.tie, { shadow: H.tieSh, line: LINE.fine + 0.4, tension: 0.15, depth: 1.5, decor: (gg) => {
        RJ.ink(gg, [[-4, -136], [-2, -136], [-2, -128], [2, -128], [2, -120], [-2, -120], [-2, -112], [2, -112], [2, -104]], { w: 1.2, color: G.pink, taper: 0, wobble: 0, weightVar: 0 });
      } });
      RJ.cel(g, [[-4, -154], [4, -154], [3.5, -148], [-3.5, -148]], H.tie, { shadow: H.tieSh, line: LINE.fine + 0.3, tension: 0, depth: 1 });
      chrome(g, rbox(-8, -142, 16, 4, 1.5), { line: LINE.fine + 0.2, band: false, depth: 1 });
      // notched lapels in a lighter pink with a chrome pin
      const lapN = [[-12, -156], [-24, -150], [-26, -140, 1], [-20, -138], [-22, -130, 1], [-9, -112, 1], [-10, -140]];
      const lapF = [[12, -156], [24, -150], [25, -140, 1], [19, -138], [21, -130, 1], [9, -112, 1], [10, -140]];
      [lapN, lapF].forEach((L) => RJ.cel(g, L, H.jkLt, { shadow: H.jk, line: LINE.mid + 0.2, depth: 2.5, tension: 0.3 }));
      chrome(g, tk.circlePts(-19, -134, 2.6, 10), { line: LINE.fine + 0.1, band: false, depth: 0.8 });
    }
    function fx(g, S, name) {
      const t = S.t, mh = S.pt.micHead;
      if (name === 'pitch') {
        // autotune: staircase pitch waves snapping onto a grid, in pink and lilac, and notes locked to the steps
        const ang = S.P.micFace || 0;
        for (let k = 0; k < 2; k++) {
          const pts = [], ph = fr(t * 1.6 + k * 0.5), x0 = mh[0] + 18 + k * 6, y0 = mh[1] - 4 - k * 10, st = 12;
          for (let i = 0; i < 9; i++) { const lv = Math.round(Math.sin(i * 0.9 + ph * TAU + k) * 2) * 6; pts.push([x0 + i * st, y0 + lv], [x0 + (i + 1) * st, y0 + lv]); }
          g.save(); g.globalAlpha *= 0.95 - k * 0.3; g.translate(mh[0], mh[1]); g.rotate(ang); g.translate(-mh[0], -mh[1]);
          RJ.ink(g, pts, { w: 6, color: C.ink, taper: 0.3, wobble: 0, weightVar: 0 });
          RJ.ink(g, pts, { w: 3.2, color: k ? G.lilac : G.hot, taper: 0.3, wobble: 0, weightVar: 0 });
          g.restore();
        }
        if (name === 'pitch' && S.beat > 0.3) RJ.fx.burst(g, mh[0] + 52, mh[1] - 4, 10 + 10 * S.beat, G.pink, '#ffffff', t);
      } else if (name === 'gnotes') glossNotes(g, mh[0], mh[1] - 8, t, 3);
      else if (name === 'gsparkles') glossSparkles(g, S.pt.head[0], S.pt.head[1], [[66, -70, 7, 0.3], [84, -20, 5, 0], [-70, -50, 5, 0.2], [70, 30, 4, 0.4]], t);
      else if (name === 'grings') glossRings(g, S.pt.chest[0] + 10, S.pt.chest[1] + 8, t);
      else if (name === 'micgloss') RJ.fx.sparkles(g, mh[0], mh[1], [[16, -14, 5, 0.2], [24, 8, 3.5, 0]], '#ffffff', t);
    }
    const smug = { eyes: 'open', mouth: 'glossSmirk', brow: 0.2, blush: 0.9 };
    const poses = {
      idle: Object.assign({ mic: 'hand', fHand: [14, 38], fBend: -1, micAng: 1.25, micGrip: 22, bHand: [-8, 50], bBend: 1, bKind: 'fist', bRot: 0.3, headRot: -0.03, torsoRot: -0.02, fx: ['micgloss'] }, smug),
      sing: { mic: 'mouth', micDx: 6, micDy: 6, micAng: 1.0, fBend: 1, bHand: [-46, -10], bBend: -1, bKind: 'open', bRot: 0.2, bSpread: 1.1, headRot: -0.05, eyes: 'half', mouth: 'sing', brow: 0.1, blush: 1, fx: ['gnotes'], look: [0.4, 0] },
      attack: { mic: 'mouth', micDx: 6, micDy: 5, micAng: 0.95, fBend: 1, lean: 0.1, torsoRot: 0.07, headRot: 0.06, headDx: 3, bHand: [-14, -60], bBend: -1, bKind: 'open', bRot: -0.5,
        fFoot: [34, -12], bFoot: [-26, -12], eyes: 'determined', mouth: 'sing', brow: 0.45, fx: ['pitch'], look: [0.5, 0] },
      windup: { mic: 'mouth', micDx: 4, micDy: 7, micAng: 1.05, fBend: 1, squash: 0.97, torsoDy: 5, lean: -0.04, headRot: -0.03, bHand: [-12, -64], bBend: -1, bKind: 'point', bRot: -0.9,
        fFoot: [26, -12], bFoot: [-24, -12], eyes: 'half', mouth: 'glossSmirk', brow: 0.3, fx: [], look: [0.4, 0] },
      strike: { mic: 'mouth', micDx: 6, micDy: 5, micAng: 0.95, fBend: 1, lean: 0.15, bx: 4, torsoRot: 0.08, headRot: 0.07, headDx: 3, bHand: [-14, -62], bBend: -1, bKind: 'open', bRot: -0.5,
        fFoot: [36, -12], bFoot: [-26, -12], eyes: 'determined', mouth: 'sing', brow: 0.5, fx: ['pitch'], look: [0.5, 0] },
      hurt: Object.assign({ mic: 'hand', fHand: [4, 38], fBend: -1, micAng: 1.9, micGrip: 22, bHand: [-34, -10], bBend: -1, bKind: 'open', bSpread: 1.3, bFront: 1, fx: ['stars'] }, HURT, { mouth: 'grit' }),
      cheer: { mic: 'hand', fHand: [42, -38], fBend: 1, micAng: 1.45, micGrip: 22, bHand: [-34, -22], bBend: -1, bKind: 'point', bRot: -0.6, eyes: 'happy', mouth: 'chromeGrin', brow: -0.2, blush: 1.2, headRot: 0.04,
        fFoot: [20, -12], bFoot: [-18, -12], fx: ['gsparkles'] },
      block: { mic: 'hand', fHand: [-34, 26], fBend: -1, micAng: -0.15, micGrip: 20, bHand: [46, 30], bBend: 1, bKind: 'fist', bRot: 0.2, bFront: 1, headRot: -0.08, eyes: 'open', mouth: 'glossSmirk', brow: 0.35,
        fFoot: [26, -12], bFoot: [-26, -12], fx: ['grings'] },
      down: Object.assign({ mic: 'hand', fHand: [16, 46], fBend: 1, micAng: -1.35, micGrip: 18, bHand: [-6, 50], bBend: -1, bKind: 'relaxed', bRot: 0.3, fx: ['mute'] }, SIT),
      walk: Object.assign({ mic: 'hand', fHand: [14, 38], fBend: -1, micAng: 1.25, micGrip: 22, bHand: [-30, 6], bBend: -1, bKind: 'point', bRot: 0.2, headRot: -0.03, fx: [] }, smug),
      bust: Object.assign({ mic: 'hand', fHand: [12, 58], fBend: -1, micAng: 1.5, micGrip: 22, bHand: [-12, 58], bBend: 1, bKind: 'relaxed', headRot: -0.02, fx: [] }, smug),
    };
    const spec = {
      id: 'npc_gloss_tune', accent: 'gloss',
      skel: { neck: [0, -152], headC: [2, -210], shF: [27, -137], shB: [-27, -137], hip: [0, -80], hipF: [14, -78], hipB: [-14, -78] },
      base: {},
      poses, face,
      exprs: { smirk: { eyes: 'open', mouth: 'chromeSmirk', brow: 0.35 }, neutral: { eyes: 'open', mouth: 'glossSmirk', brow: 0.2 } },
      arm: { l: [25, 23], w: [18, 13], skin: H.jk, skinSh: H.jkSh, cuff: { color: H.shirt, light: H.shirtSh }, hand: { skin: H.skin, shade: H.skinSh } },
      legs: { w: [25, 17], color: H.pants, shade: H.pantsSh, pantsOver: true, bow: 2, profile: (u) => 1 - 0.32 * u, decor: trouserDecor(C.ink, H.pantsSh), shoe: { color: H.shoe, sole: G.lilac, shade: H.shoeSh, toeCap: G.pinkLt, accent: G.hot, hi: '#ffffff', k: 1.15 } },
      mic: { accent: G.hot, headR: 10, len: 40, bands: 2 },
      life: { idle: { bob: 1.2, per: 2.6, sway: 0.016, head: 0.02 }, walk: { bob: 2.6, per: 0.5, head: 0.012, step: { hz: 2, stride: 10, lift: 5 } } },
      bounds: { h: 333, x0: -123, x1: 162 },
      bust: { rect: [-90, -330, 94, -112], face: [-78, -324, 86, -148], pose: 'bust' },
      layers: { torso, head, fx },
      // the idle twirls the mic a little, the walk clicks along
      tweak(P, t) { if (P.pose === 'idle') P.micAng = num(P.micAng) + 0.12 * Math.sin(t * 2.2) * tk.motion(); },
    };
    // the pearl mic: the kit mic recoloured while he is drawn (pearl-pink body and head, lilac grille)
    RJ.register('npc_gloss_tune', withPal(RJ.rig(spec), { mic: '#f8d4ec', micSh: '#dba3c9', micHi: '#ffffff', micGrill: '#b29ad8' }));
  })();

  // ==========================================================================================================================================
  // INTERN IVY (grunt): small and nervous, two buns stuck with pens, big pink round glasses, five lanyards, a huge clipboard hugged to her chest
  // ==========================================================================================================================================
  (function ivy() {
    const H = {
      hair: '#8a5232', hairSh: '#5b321c', hairHi: '#c4875a',
      skin: '#fdd8bf', skinSh: '#f0b297',
      cardi: G.lilac, cardiSh: G.lilacSh, cardiLt: G.lilacLt, blouse: G.shirt, blouseSh: G.shirtSh, bow: G.hot, bowSh: G.pinkDk,
      skirt: G.pink, skirtSh: G.pinkSh, skirtLt: G.pinkLt, sock: '#ffffff', shoe: '#e0589e', shoeSh: '#b13d7c',
      board: '#f6c3e2', boardSh: '#dd95c4', paper: '#fffdf8', paperSh: '#ece1e6', line: '#b8a8d8',
      iris: ['#5b3218', '#c08040'], frame: '#ff7ec4',
    };
    const SKULL = RJ.skullPts({ w: 1.02, h: 1.0, chin: 1 });
    const HAIR = [[-62, 10], [-68, -18], [-62, -46], [-46, -64], [-22, -74], [6, -76], [32, -70], [52, -56], [63, -34], [66, -10], [62, 14, 1],
      [56, -8], [50, -22], [38, -30], [26, -24, 1], [18, -36], [2, -34], [-10, -26, 1], [-14, -36], [-30, -30], [-40, -16], [-46, 4], [-48, 26, 1], [-56, 20]];
    const STRANDS = [[[-60, 8], [-70, 26], [-66, 40]], [[60, 10], [68, 26], [64, 38]]];
    const BUNS = [[-38, -70, 22], [36, -72, 21]];
    const CAST = [[-46, 4], [-40, -16], [-30, -30], [-14, -36], [-10, -26], [2, -34], [18, -36], [26, -24], [38, -30], [50, -22], [56, -8], [56, 0], [48, -14], [38, -22], [26, -16], [18, -28], [2, -26], [-10, -18], [-28, -22], [-40, -8]];
    const face = {
      eyes: [{ x: -13, y: 18, w: 31, h: 32 }, { x: 39, y: 16, w: 27, h: 30 }],
      brows: [[-14, -10, 22], [42, -11, 19]],
      browStyle: { thick: 3.8, arch: 0.5, tilt: -0.25, color: H.hairSh },
      nose: [24, 38, 52],
      mouth: [12, 49, 13],
      mouthStyle: { lineW: 1.4, inner: '#b03a5a', tongue: '#f590b0' },
      blush: [[-20, 40, 19], [44, 37, 15]],
      blushColor: '#ff8aa8',
      sweat: [62, -8, 5],
      eye: { iris: H.iris, ring: '#2a1408', sclera: '#fffdfa', expr: 'wide', irisW: 0.7, irisH: 0.9, lid: 1.9, wing: 0.3, lash: 1.0, crease: false, lashes: 2, tilt: -0.1, drop: 0, hl: [[-0.38, -0.48, 0.32], [-0.3, -0.08, 0.14], [0.3, 0.38, 0.1]] },
    };
    function pen(g, x, y, a, col, cap) {
      g.save(); g.translate(x, y); g.rotate(a);
      RJ.cel(g, [[-2.8, 0], [2.8, 0], [2.8, -36], [0, -42, 1], [-2.8, -36]], col, { shadow: RJ.shade(col, 0.12), line: LINE.mid, tension: 0, depth: 1.5 });
      RJ.cel(g, [[-3.2, -24], [3.2, -24], [3.2, -36], [0, -42, 1], [-3.2, -36]], cap, { shadow: RJ.shade(cap, 0.15), line: LINE.mid, tension: 0, depth: 1 });
      RJ.ink(g, [[3.6, -24], [3.6, -33]], { w: 1.3, color: G.chromeSh, taper: 0, wobble: 0 });
      g.restore();
    }
    function buns(g, S) {
      const sw = S.P.hairSwing;
      pen(g, -44, -72, -0.6 + sw * 0.05, G.chrome, G.hot);
      pen(g, 42, -76, 0.5 + sw * 0.05, G.pink, G.chrome);
      pen(g, 30, -74, 0.15, '#ffe28a', G.lilacDk);
      BUNS.forEach((b, i) => {
        const pts = tk.ellipsePts(b[0] + sw * 0.6, b[1], b[2], b[2] * 0.92, 16);
        RJ.cel(g, pts, H.hair, { shadow: H.hairSh, line: LINE.main + 0.2, depth: 6, hi: H.hairHi, hiW: 1.6, decor: (gg) => {
          RJ.hatch(gg, [[[b[0] - 14, b[1] - 4], [b[0] - 4, b[1] - 14], [b[0] + 10, b[1] - 12]], [[b[0] - 10, b[1] + 8], [b[0] + 4, b[1] + 2], [b[0] + 14, b[1] - 6]]], { color: H.hairSh, w: 1.3 });
        } });
        // a messy loop sticking out of each bun
        RJ.lock(g, [[b[0] + (i ? 10 : -10), b[1] - 14], [b[0] + (i ? 22 : -22), b[1] - 24], [b[0] + (i ? 14 : -16), b[1] - 32]], H.hair, { wMax: 6, w0: 5, w1: 0, bend: sw * 0.2, gloss: false, strands: 0, shadow: H.hairSh });
      });
    }
    function hair(g, S) {
      const sw = S.P.hairSwing;
      STRANDS.forEach((s, i) => RJ.lock(g, s, H.hair, { wMax: 8, w0: 7, w1: 0, bend: sw * 0.25 * (i ? 1 : -1), gloss: false, strands: 0, shadow: H.hairSh }));
      RJ.cel(g, HAIR, H.hair, { shadow: H.hairSh, line: LINE.main + 0.2, depth: 7, tension: 0.75, weightVar: 0.35, decor: (gg) => {
        RJ.fillPts(gg, [[-30, -66], [0, -72], [30, -66], [44, -58], [28, -60], [0, -64], [-28, -58]], H.hairHi, 0.6);
        RJ.hatch(gg, [[[2, -70], [-6, -50], [-10, -30]], [[20, -70], [24, -50], [24, -32]], [[-34, -56], [-46, -30], [-50, 0]], [[44, -50], [56, -26], [58, 0]]], { color: H.hairSh, w: 1.3, alpha: 0.9 });
        // flyaway ticks: she ran here
        RJ.hatch(gg, [[-6, -76, -4, -84], [12, -76, 16, -84]], { color: H.hairSh, w: 1.4 });
      } });
      RJ.hatch(g, [[[-6, -75], [-3, -83], [1, -86]], [[12, -76], [17, -83], [22, -84]]], { color: C.ink, w: 1.6 });
    }
    // big round pink glasses (her eyes look even bigger through them)
    function glasses(g, S) {
      const lens = [[-13, 19, 21, 20], [39, 17, 18, 19]];
      const arm = [[-34, 15], [-46, 14], [-56, 18]];
      RJ.ink(g, arm, { w: 3.4, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
      RJ.ink(g, arm, { w: 1.6, color: H.frame, taper: 0, wobble: 0, weightVar: 0 });
      lens.forEach((l) => {
        g.beginPath(); g.ellipse(l[0], l[1], l[2], l[3], 0, 0, TAU); g.fillStyle = 'rgba(255,220,240,0.12)'; g.fill();
        g.lineWidth = 3.4; g.strokeStyle = C.ink; g.beginPath(); g.ellipse(l[0], l[1], l[2], l[3], 0, 0, TAU); g.stroke();
        g.lineWidth = 1.7; g.strokeStyle = H.frame; g.beginPath(); g.ellipse(l[0], l[1], l[2], l[3], 0, 0, TAU); g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2; g.lineCap = 'round';
        g.beginPath(); g.moveTo(l[0] + l[2] * 0.4, l[1] - l[3] * 0.66); g.lineTo(l[0] + l[2] * 0.66, l[1] - l[3] * 0.34); g.stroke();
      });
      const br = [[8, 15], [14, 12], [21, 14]];
      RJ.ink(g, br, { w: 3.4, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
      RJ.ink(g, br, { w: 1.6, color: H.frame, taper: 0, wobble: 0, weightVar: 0 });
    }
    function backHair(g, S) { buns(g, S); }
    function head(g, S) {
      headBase(g, S, { skull: SKULL, skin: H.skin, shade: H.skinSh, cast: CAST, castDy: 3 });
      RJ.ear(g, -52, 24, { r: 12, side: -1, skin: H.skin, shade: H.skinSh });
      hair(g, S);
      glasses(g, S);
    }
    // ---- the body: a pleated pink skirt, a lilac cardigan, a white blouse with a pink bow, and five lanyards ----
    const SKIRT = [[-28, -82], [28, -82], [36, -64], [44, -44, 1], [30, -40], [15, -43], [0, -40], [-15, -43], [-30, -40], [-44, -44, 1], [-36, -64]];
    const CARDI = [[-13, -142], [13, -142], [30, -136], [36, -122, 1], [34, -100], [32, -80, 1], [12, -76], [0, -80], [-12, -76], [-32, -80, 1], [-34, -100], [-36, -122, 1], [-30, -136]];
    const LANYARDS = [
      { c: G.hot, x: -19, len: 30, card: '#ffffff', w: 13, rot: -0.22 },
      { c: G.lilacDk, x: -8, len: 42, card: G.mint, w: 12, rot: 0.08 },
      { c: G.gold, x: 5, len: 34, card: G.pinkLt, w: 12, rot: 0.15 },
      { c: G.chromeSh, x: 16, len: 46, card: '#ffffff', w: 11, rot: 0.25 },
      { c: '#5fd3c0', x: -2, len: 56, card: '#fff1b4', w: 12, rot: -0.1 },
    ];
    function torso(g, S) {
      const sw = S.sway, P = S.P;
      RJ.neck(g, 2, -148, { w: 18, h: 16, skin: H.skin, shade: H.skinSh });
      // the skirt (under the cardigan) with pleats that swish
      const sk = SKIRT.map((p) => (p[1] > -50 ? [p[0] + sw * 2 + num(P.stepPhase) * 2, p[1]].concat(p.slice(2)) : p));
      RJ.cel(g, sk, H.skirt, { shadow: H.skirtSh, line: LINE.main, depth: 6, tension: 0.3, hi: H.skirtLt, hiW: 1.5, decor: (gg) => {
        RJ.hatch(gg, [[-15 + sw, -43, -10, -78], [0 + sw, -40, 0, -78], [15 + sw, -43, 10, -78], [-30 + sw, -40, -20, -78], [30 + sw, -40, 20, -78]], { color: H.skirtSh, w: 1.3 });
      } });
      RJ.cel(g, CARDI, H.cardi, { shadow: H.cardiSh, line: LINE.main + 0.2, depth: 7, tension: 0.4, hi: H.cardiLt, hiW: 1.6, decor: (gg) => {
        gg.beginPath(); gg.moveTo(-8, -142); gg.lineTo(8, -142); gg.lineTo(5, -78); gg.lineTo(-5, -78); gg.closePath(); gg.fillStyle = H.blouse; gg.fill();
        RJ.ink(gg, [[-8, -142], [-5, -78]], { w: LINE.mid, color: C.ink, taper: 0.1, wobble: 0 }); RJ.ink(gg, [[8, -142], [5, -78]], { w: LINE.mid, color: C.ink, taper: 0.1, wobble: 0 });
        gg.beginPath(); gg.rect(-40, -86, 80, 6); gg.fillStyle = H.cardiSh; gg.fill();      // ribbed hem
        RJ.hatch(gg, [[-30, -86, -30, -80], [-22, -86, -22, -80], [-14, -86, -14, -80], [16, -86, 16, -80], [24, -86, 24, -80], [32, -86, 32, -80]], { color: H.cardiLt, w: 1, alpha: 0.8 });
      } });
      sweep(g, CARDI, [-36, -142, 36, -76], S.t, { at: 0.72, k: 0.1, alpha: 0.3, tension: 0.4, per: 7, ph: 3 });
      // the blouse collar and the pink bow
      RJ.cel(g, [[-12, -144], [0, -138], [12, -144], [10, -134], [0, -132], [-10, -134]], H.blouse, { shadow: H.blouseSh, line: LINE.mid, depth: 1.5, tension: 0.3 });
      RJ.cel(g, [[0, -136], [-10, -142, 1], [-12, -130, 1]], H.bow, { shadow: H.bowSh, line: LINE.mid, depth: 1.5, tension: 0.4 });
      RJ.cel(g, [[0, -136], [10, -142, 1], [12, -130, 1]], H.bow, { shadow: H.bowSh, line: LINE.mid, depth: 1.5, tension: 0.4 });
      RJ.cel(g, tk.circlePts(0, -136, 3, 8), H.bow, { shadow: H.bowSh, line: LINE.mid, depth: 1 });
    }
    function lanyards(g, S) {
      const sw = S.sway;
      LANYARDS.forEach((L, i) => {
        const sx = L.x * 0.3, top = [sx - 10 - i * 0.8, -138], top2 = [sx + 10 + i * 0.8, -138], bx = L.x + sw * (2 + i * 0.6), by = -146 + L.len;
        RJ.ink(g, [top, [bx - 2, by - 4]], { w: 3.2, color: C.ink, taper: 0, wobble: 0, weightVar: 0 }); RJ.ink(g, [top, [bx - 2, by - 4]], { w: 1.6, color: L.c, taper: 0, wobble: 0, weightVar: 0 });
        RJ.ink(g, [top2, [bx + 2, by - 4]], { w: 3.2, color: C.ink, taper: 0, wobble: 0, weightVar: 0 }); RJ.ink(g, [top2, [bx + 2, by - 4]], { w: 1.6, color: L.c, taper: 0, wobble: 0, weightVar: 0 });
      });
      LANYARDS.forEach((L, i) => {
        const bx = L.x + sw * (2 + i * 0.6), by = -146 + L.len;
        g.save(); g.translate(bx, by); g.rotate(L.rot + sw * 0.05 * (i % 2 ? 1 : -1));
        RJ.cel(g, rbox(-L.w / 2, -2, L.w, L.w * 1.25, 2), L.card, { shadow: RJ.shade(L.card, 0.1), line: LINE.mid, tension: 0, depth: 1.5 });
        g.fillStyle = L.c; g.fillRect(-L.w / 2 + 1, -1, L.w - 2, 3);
        g.beginPath(); g.arc(-L.w * 0.18, L.w * 0.5, L.w * 0.16, 0, TAU); g.fillStyle = G.lilacSh; g.fill();
        RJ.hatch(g, [[L.w * 0.05, L.w * 0.42, L.w * 0.36, L.w * 0.42], [L.w * 0.05, L.w * 0.62, L.w * 0.3, L.w * 0.62], [-L.w * 0.36, L.w * 0.92, L.w * 0.32, L.w * 0.92]], { color: '#8a7aa8', w: 0.9 });
        g.restore();
      });
    }
    // ---- the huge clipboard, held at the front wrist (top layer, figure space), both hands redrawn on top ----
    function clipboard(g, S) {
      const P = S.P, f = wristOf(S, true), a = num(P.cbRot), W = 70, Hh = 94;
      g.save(); g.translate(f.w[0], f.w[1]); g.rotate(a); g.translate(P.cbSide ? -10 : -W + 10, -Hh * (P.cbSide ? 0.6 : 0.5));
      const board = rbox(0, 0, W, Hh, 5);
      RJ.cel(g, board, H.board, { shadow: H.boardSh, line: LINE.main + 0.2, depth: 4, tension: 0, hi: '#ffe4f3', hiW: 1.5 });
      // a fat stack of papers, a little askew, the top one a contract with lines and a 'sign here' tab
      RJ.cel(g, [[5, 9], [W - 3, 7], [W - 4, Hh - 3], [6, Hh - 4]], H.paperSh, { shadow: false, line: LINE.fine + 0.3, tension: 0 });
      RJ.cel(g, [[4, 8], [W - 5, 9], [W - 6, Hh - 5], [4, Hh - 6]], H.paper, { shadow: H.paperSh, line: LINE.fine + 0.4, tension: 0, depth: 2 });
      RJ.hatch(g, [[10, 22, W - 12, 22], [10, 29, W - 16, 29], [10, 36, W - 12, 36], [10, 43, W - 20, 43], [10, 50, W - 14, 50]], { color: H.line, w: 1.4 });
      RJ.ink(g, [[10, Hh - 15], [W - 24, Hh - 15]], { w: 1.4, color: C.ink, taper: 0, wobble: 0 });
      RJ.ink(g, [[12, Hh - 22], [17, Hh - 17]], { w: 1.4, color: G.hot, taper: 0, wobble: 0 }); RJ.ink(g, [[17, Hh - 22], [12, Hh - 17]], { w: 1.4, color: G.hot, taper: 0, wobble: 0 });
      RJ.cel(g, [[W - 4, Hh - 24], [W + 8, Hh - 24], [W + 13, Hh - 19, 1], [W + 8, Hh - 14], [W - 4, Hh - 14]], G.hot, { shadow: G.pinkDk, line: LINE.mid, tension: 0, depth: 1.5 });
      tk.sparkle(g, 14, 14, 3.4, { color: G.hot, glow: 0, thin: 0.25 });
      sweep(g, board, [0, 0, W, Hh], S.t, { at: 0.7, k: 0.12, alpha: 0.28, per: 5, ph: 1.2 });
      // the chrome clip
      chrome(g, [[W / 2 - 13, -5], [W / 2 + 13, -5], [W / 2 + 15, 4], [W / 2 + 8, 11], [W / 2 - 8, 11], [W / 2 - 15, 4]], { line: LINE.mid + 0.2, depth: 2.5 });
      g.beginPath(); g.ellipse(W / 2, 1, 4, 2, 0, 0, TAU); g.fillStyle = G.chromeDk; g.fill();
      g.restore();
    }
    function top(g, S) {
      inFig(g, S, (gg) => {
        clipboard(gg, S);
        gg.save(); gg.transform(S.M.torso[0], S.M.torso[1], S.M.torso[2], S.M.torso[3], S.M.torso[4], S.M.torso[5]); lanyards(gg, S); gg.restore();
        if (S.P.bFront) redrawHand(gg, S, false);
        redrawHand(gg, S, true);
      });
    }
    function fx(g, S, name) {
      const t = S.t, P = S.P, f = wristOf(S, true);
      if (name === 'papers' || name === 'paperstorm') {
        // loose sheets fluttering off the clipboard
        const n = name === 'paperstorm' ? 5 : 3;
        for (let i = 0; i < n; i++) {
          const u = fr(t * 0.7 + i / n), x = f.w[0] - 10 + (name === 'paperstorm' ? 1 : -0.6) * u * 80 + Math.sin(u * 7 + i) * 10 + i * 6, y = f.w[1] - 50 - u * 50 + i * 4;
          g.save(); g.globalAlpha *= Math.sin(PI * u); g.translate(x, y); g.rotate(Math.sin(u * 6 + i) * 0.8 + i);
          RJ.cel(g, [[-8, -10], [8, -10], [8, 10], [-8, 10]], H.paper, { shadow: H.paperSh, line: LINE.fine + 0.4, tension: 0, depth: 2 });
          RJ.hatch(g, [[-5, -5, 5, -5], [-5, 0, 4, 0], [-5, 5, 5, 5]], { color: H.line, w: 1 });
          g.restore();
        }
        if (name === 'paperstorm' && S.beat > 0.3) RJ.fx.burst(g, f.w[0] + 40, f.w[1] - 40, 10 + 8 * S.beat, G.pink, '#ffffff', t);
      } else if (name === 'gnotes') glossNotes(g, S.pt.mouth[0] + 4, S.pt.mouth[1] - 10, t, 3);
      else if (name === 'gsparkles') glossSparkles(g, S.pt.head[0], S.pt.head[1], [[62, -62, 7, 0.3], [80, -16, 5, 0], [-74, -46, 5, 0.2]], t);
      else if (name === 'grings') glossRings(g, S.pt.chest[0] + 22, S.pt.chest[1] + 10, t);
    }
    // the poses: she always clutches the board (front hand on its right edge, back hand under it across her body)
    const nervous = { eyes: 'open', mouth: 'gloss', brow: -0.45, blush: 1.4, sweat: 1, look: [0.2, 0.1] };
    const poses = {
      idle: Object.assign({ fHand: [22, 50], fBend: 1, fKind: 'fist', fRot: -1.2, cbRot: -0.1, bHand: [40, 56], bBend: 1, bKind: 'fist', bRot: -0.3, bFront: 1, headRot: 0.06, fx: [] }, nervous),
      sing: { fHand: [30, 10], fBend: 1, fKind: 'fist', fRot: -1.2, cbRot: 0.2, cbSide: 1, bHand: [-36, -6], bBend: -1, bKind: 'point', bRot: -0.4, headRot: -0.02, eyes: 'open', mouth: 'sing', brow: -0.2, blush: 1.4, fx: ['gnotes'], look: [0.4, 0.2] },
      windup: { fHand: [20, 44], fBend: 1, fKind: 'fist', fRot: -1.2, cbRot: -0.25, bHand: [40, 50], bBend: 1, bKind: 'fist', bFront: 1, lean: -0.06, torsoRot: -0.08, headRot: -0.04, squash: 0.98,
        fFoot: [24, -12], bFoot: [-22, -12], eyes: 'closed', mouth: 'grit', brow: 0.4, blush: 1.6, sweat: 1, fx: [] },
      attack: { fHand: [46, -10], fBend: 1, fKind: 'fist', fRot: -1.2, cbRot: 0.7, cbSide: 1, bHand: [-34, 0], bBend: -1, bKind: 'open', bSpread: 1.2, lean: 0.1, torsoRot: 0.08, headRot: 0.05, headDx: 2,
        fFoot: [32, -12], bFoot: [-24, -12], eyes: 'closed', mouth: 'ow', brow: 0.2, blush: 1.6, fx: ['paperstorm'] },
      strike: { fHand: [50, 2], fBend: 1, fKind: 'fist', fRot: -1.2, cbRot: 1.2, cbSide: 1, bHand: [-34, 4], bBend: -1, bKind: 'open', bSpread: 1.3, lean: 0.14, bx: 4, torsoRot: 0.1, headRot: 0.06, headDx: 2,
        fFoot: [36, -12], bFoot: [-24, -12], eyes: 'closed', mouth: 'ow', brow: 0.3, blush: 1.6, fx: ['paperstorm'] },
      hurt: Object.assign({ fHand: [26, 40], fBend: 1, fKind: 'fist', fRot: -1.2, cbRot: 0.35, cbSide: 1, bHand: [-34, -10], bBend: -1, bKind: 'open', bSpread: 1.4, fx: ['stars', 'papers'] }, HURT),
      cheer: { fHand: [32, -40], fBend: 1, fKind: 'fist', fRot: -1.2, cbRot: 0.2, cbSide: 1, bHand: [-30, -42], bBend: -1, bKind: 'open', bSpread: 1.3, headRot: 0.04, eyes: 'happy', mouth: 'happyOpen', brow: -0.3, blush: 1.7,
        fFoot: [18, -12], bFoot: [-16, -12], fx: ['gsparkles'] },
      block: { fHand: [30, 2], fBend: 1, fKind: 'fist', fRot: -1.2, cbRot: 0.05, bHand: [52, 0], bBend: 1, bKind: 'fist', bRot: -0.3, bFront: 1, squash: 0.97, torsoDy: 4, headRot: 0.12, headDx: -2,
        fFoot: [24, -12], bFoot: [-24, -12], eyes: 'closed', mouth: 'flat', brow: -0.5, blush: 1.5, sweat: 1, fx: ['grings'] },
      down: Object.assign({ fHand: [22, 40], fBend: 1, fKind: 'fist', fRot: -1.2, cbRot: -1.1, bHand: [-6, 52], bBend: -1, bKind: 'relaxed', bRot: 0.3, fx: ['mute', 'papers'] }, SIT),
      walk: Object.assign({ fHand: [22, 50], fBend: 1, fKind: 'fist', fRot: -1.2, cbRot: -0.1, bHand: [40, 56], bBend: 1, bKind: 'fist', bRot: -0.3, bFront: 1, headRot: 0.06, fx: [] }, nervous),
      bust: Object.assign({ fHand: [22, 62], fBend: 1, fKind: 'fist', fRot: -1.2, cbRot: -0.1, bHand: [40, 66], bBend: 1, bKind: 'fist', bFront: 1, headRot: 0.04, fx: [] }, nervous),
    };
    const spec = {
      id: 'npc_gloss_ivy', accent: 'gloss',
      skel: { neck: [0, -140], headC: [2, -198], shF: [23, -126], shB: [-23, -126], hip: [0, -74], hipF: [12, -72], hipB: [-12, -72] },
      base: { mic: 'none', cbRot: -0.1, cbSide: 0 },
      poses, face,
      exprs: { neutral: { eyes: 'open', mouth: 'gloss', brow: -0.45 }, smirk: { eyes: 'half', mouth: 'gloss', brow: -0.1 } },
      arm: { l: [23, 21], w: [16, 12], skin: H.cardi, skinSh: H.cardiSh, cuff: { color: H.cardiSh, light: H.cardiLt }, hand: { skin: H.skin, shade: H.skinSh } },
      legs: { w: [16, 13], skin: H.skin, color: H.skin, shade: H.skinSh, bow: 1, sock: { color: H.sock, len: 16, shade: '#e6dcef' }, shoe: { color: H.shoe, sole: '#ffd2ea', shade: H.shoeSh, toeCap: '#ff86c4', hi: '#ffb5dc', k: 1.05 } },
      life: {
        idle: { bob: 1.4, per: 1.9, sway: 0.02, head: 0.03, shake: 0.35 },      // fidgety: a faster breath and a tiny tremble
        walk: { bob: 3, per: 0.42, head: 0.014, step: { hz: 2.4, stride: 7, lift: 5 } },
      },
      tip: (P, Lay) => { const f = Lay.pt.hand; return [f[0] + 10, f[1] - 40]; },
      bounds: { h: 328, x0: -148, x1: 167 },
      bust: { rect: [-92, -300, 92, -96], face: [-80, -296, 78, -136], pose: 'bust' },
      layers: { backHair, torso, head, top, fx },
      // the nervous tap of her pen hand on the board and the darting look
      tweak(P, t) {
        if (P.pose === 'idle' || P.pose === 'walk') {
          const m = tk.motion();
          P.bHand = [P.bHand[0], P.bHand[1] - 2.5 * Math.max(0, Math.sin(t * 7)) * m];
          P.look = [0.2 + 0.4 * Math.sign(Math.sin(t * 0.9)) * m, 0.1];
        }
      },
    };
    RJ.register('npc_gloss_ivy', RJ.rig(spec));
  })();

  // ==========================================================================================================================================
  // SLEEK SOL (merchant / fixer): round, oily-charming, slicked hair with one curl and a tiny curled moustache, pearl-white pinstripe suit,
  // pearl cufflinks, a long contract scroll trailing to the floor and a gold pen offered to you
  // ==========================================================================================================================================
  (function sol() {
    const H = {
      hair: '#3f2c5c', hairSh: '#241838', hairHi: '#8e78b8', temple: '#cfc6e6',
      skin: '#f8cfae', skinSh: '#e6a988',
      suit: G.pearl, suitSh: '#ddcdea', suitLt: '#ffffff', stripe: '#f2b8de', shirt: G.pink, shirtSh: G.pinkSh, tie: '#8d74cc', tieSh: '#6a52aa',
      pants: '#e8dcf4', pantsSh: '#c7b5dd', shoe: '#e7569f', shoeSh: '#b33d7c',
      paper: '#fffaf0', paperSh: '#eadfc8', line: '#b8a8d8', seal: G.hot,
      iris: ['#3a2410', '#9a6430'],
    };
    const SKULL = RJ.skullPts({ w: 1.02, chin: 2 });
    const HAIR = [[-60, 6], [-64, -24], [-56, -50], [-38, -66], [-12, -74], [16, -74], [40, -66], [56, -52], [64, -32], [62, -14, 1], [54, -26], [40, -34], [24, -38], [8, -38],
      [-8, -36], [-24, -32], [-38, -22], [-44, -6], [-48, 12, 1], [-56, 10]];
    const CURL = [[14, -38], [22, -28], [18, -18], [10, -20], [12, -26]];
    const CAST = [[-44, -6], [-38, -22], [-24, -32], [-8, -36], [8, -38], [24, -38], [40, -34], [54, -26], [54, -18], [40, -26], [24, -30], [8, -30], [-8, -28], [-24, -24], [-38, -14]];
    const face = {
      eyes: [{ x: -13, y: 16, w: 28, h: 24 }, { x: 38, y: 14, w: 24, h: 23 }],
      brows: [[-14, -8, 25], [43, -9, 22]],
      browStyle: { thick: 4.6, arch: 0.7, tilt: 0.05, color: H.hairSh },
      nose: [25, 32, 60],
      mouth: [12, 47, 15],
      mouthStyle: { lineW: 1.45, inner: '#a83a6a', tongue: '#f590b8' },
      blush: [[-20, 36, 17], [44, 34, 14]],
      sweat: [60, -22, 5],
      eye: { iris: H.iris, ring: '#1e1006', sclera: '#fffdfa', expr: 'smirk', irisW: 0.68, irisH: 0.94, lid: 2.1, wing: 0.55, lash: 1.1, crease: true, lashes: 0, tilt: 0.15, drop: 0.28, hl: [[-0.4, -0.5, 0.3], [-0.32, -0.12, 0.13]] },
    };
    function hair(g, S) {
      const sw = S.P.hairSwing;
      RJ.cel(g, HAIR, H.hair, { shadow: H.hairSh, line: LINE.main + 0.2, depth: 7, tension: 0.7, decor: (gg) => {
        RJ.fillPts(gg, [[-40, -62], [-12, -70], [16, -70], [40, -62], [50, -54], [30, -58], [0, -62], [-30, -56]], H.hairHi, 0.85);
        RJ.hatch(gg, [[[-58, -26], [-60, -8], [-56, 6]], [[-53, -28], [-54, -10], [-51, 4]]], { color: H.temple, w: 2.2 });       // silver streaks at the temple
        RJ.hatch(gg, [[[-34, -56], [-10, -64], [20, -64], [44, -54]], [[-40, -40], [-14, -50], [18, -52], [48, -40]], [[-44, -24], [-24, -36], [6, -40]]], { color: H.hairSh, w: 1.3, alpha: 0.9 });
      } });
      sweep(g, HAIR, [-64, -74, 64, 12], S.t, { at: 0.58, k: 0.1, alpha: 0.4, tension: 0.7, per: 3.8, ph: 0.9 });
      // the one oily curl on the forehead
      g.save(); g.translate(14, -38); g.rotate(sw * 0.08); g.translate(-14, 38);
      RJ.ink(g, CURL, { w: 5.4, color: C.ink, taper: 0.5, wobble: 0, weightVar: 0 });
      RJ.ink(g, CURL, { w: 2.8, color: H.hair, taper: 0.5, wobble: 0, weightVar: 0 });
      g.restore();
    }
    // the tiny curled moustache above the Gloss smile
    function stache(g, S) {
      const y = 40.5, x = 12, up = S.P.pose === 'hurt' ? 2 : 0;
      [-1, 1].forEach((sd) => {
        const pts = [[x + sd * 1, y], [x + sd * 7, y + 0.5 + up], [x + sd * 13, y - 1 + up], [x + sd * 16, y - 5 + up], [x + sd * 13.5, y - 8 + up]];
        RJ.ink(g, pts, { w: 3.6, color: C.ink, taper: 0.55, wobble: 0, weightVar: 0 });
        RJ.ink(g, pts.slice(0, 4), { w: 1.6, color: H.hairHi, taper: 0.6, wobble: 0, weightVar: 0 });
      });
    }
    function head(g, S) {
      headBase(g, S, { skull: SKULL, skin: H.skin, shade: H.skinSh, cast: CAST, castDy: 4 });
      RJ.ear(g, -53, 22, { r: 13, side: -1, skin: H.skin, shade: H.skinSh });
      hair(g, S);
      stache(g, S);
    }
    // the round double-breasted jacket with a belly
    const JK = [[-14, -152], [14, -152], [34, -147], [42, -134, 1], [47, -114], [57, -92], [55, -71], [42, -59, 1], [14, -55], [0, -59], [-14, -55], [-42, -59, 1], [-55, -71], [-57, -92], [-47, -114], [-42, -134, 1], [-34, -147]];
    function torso(g, S) {
      RJ.neck(g, 2, -156, { w: 22, h: 16, skin: H.skin, shade: H.skinSh });
      RJ.cel(g, JK, H.suit, { shadow: H.suitSh, line: LINE.main + 0.2, depth: 9, tension: 0.5, hi: H.suitLt, hiW: 2, decor: (gg) => {
        // pink pinstripes
        gg.globalAlpha = 0.8;
        RJ.hatch(gg, [-48, -36, -24, -12, 0, 12, 24, 36, 48].map((x) => [x, -160, x + x * 0.12, -52]), { color: H.stripe, w: 1.1 });
        gg.globalAlpha = 1;
        RJ.ink(gg, [[-10, -110], [30, -62]], { w: 1.6, color: C.ink, taper: 0.1, wobble: 0 });      // the double-breasted overlap
        RJ.hatch(gg, [[[-34, -78], [-20, -72], [-6, -72]], [[30, -86], [40, -80]]], { color: H.suitSh, w: 1.4 });
      } });
      sweep(g, JK, [-57, -152, 57, -55], S.t, { at: 0.66, k: 0.12, alpha: 0.5, tension: 0.5, per: 5, ph: 0.2 });
      // shirt V and the lilac tie
      RJ.cel(g, [[-12, -154], [12, -154], [6, -130], [0, -112, 1], [-6, -130]], H.shirt, { shadow: H.shirtSh, line: LINE.mid, depth: 2, tension: 0.2 });
      RJ.cel(g, [[-4, -153], [4, -153], [5, -128], [0, -118, 1], [-5, -128]], H.tie, { shadow: H.tieSh, line: LINE.fine + 0.4, tension: 0.2, depth: 1.5 });
      pearl(g, 0, -138, 2.6);      // a pearl tie pin
      // wide peaked lapels in pink, six gold buttons, a pink pocket square
      const lapN = [[-14, -154], [-30, -146], [-34, -134, 1], [-26, -132], [-30, -122, 1], [-12, -108, 1], [-8, -136]];
      const lapF = [[14, -154], [30, -146], [32, -134, 1], [24, -132], [28, -122, 1], [8, -112, 1], [8, -136]];
      [lapN, lapF].forEach((L) => RJ.cel(g, L, G.pinkLt, { shadow: G.pink, line: LINE.mid + 0.2, depth: 2.5, tension: 0.3 }));
      [[-6, -96], [18, -96], [-4, -80], [20, -80], [-2, -66], [22, -66]].forEach((b) => RJ.cel(g, tk.circlePts(b[0], b[1], 2.8, 10), G.gold, { shadow: G.goldSh, line: LINE.fine + 0.3, depth: 1 }));
      RJ.cel(g, [[26, -132], [31, -138, 1], [35, -132], [39, -137, 1], [42, -128], [26, -128]], G.hot, { shadow: G.pinkDk, line: LINE.fine + 0.3, tension: 0.1, depth: 1.5 });
    }
    // ---- the contract scroll (front hand) and the gold pen (back hand), in figure space from the top layer ----
    function scroll(g, S) {
      const P = S.P, f = wristOf(S, true), len = num(P.scrollLen, 1), t = S.t, a = num(P.scRot);
      const x = f.w[0] + 6, y = f.w[1] - 2, sw = Math.sin(t * 1.4) * 4 * tk.motion();
      // the paper hangs from the roll in the hand and pools on the floor with a curl at its end
      const gy = -S.P.by - 4;
      const drop = Math.max(10, (gy - y) * len);
      const L = [x - 11, y + 4], R = [x + 11, y + 4];
      const end = [x + 18 + sw + (1 - len) * 10, Math.min(gy, y + drop)];
      const sheet = [[L[0], L[1]], [R[0], R[1]], [R[0] + 6 + sw * 0.5, (R[1] + end[1]) / 2], [end[0] + 12, end[1]], [end[0] - 12, end[1] + 1], [L[0] + 4 + sw * 0.5, (L[1] + end[1]) / 2]];
      g.save(); g.translate(x, y); g.rotate(a); g.translate(-x, -y);
      RJ.cel(g, sheet, H.paper, { shadow: H.paperSh, line: LINE.main, depth: 3, tension: 0.35, decor: (gg) => {
        const rows = Math.floor((end[1] - y - 10) / 7);
        for (let i = 0; i < rows; i++) { const v = (i + 1) / (rows + 1), yy = lerp(y + 8, end[1] - 6, v), xx = lerp(x, end[0], v) + sw * 0.5 * Math.sin(PI * v); RJ.hatch(gg, [[xx - 8, yy, xx + 6 - (i % 3) * 2, yy]], { color: H.line, w: 1.2 }); }
      } });
      // the curl at the bottom and the pink wax seal near the end, the dotted line and its X
      if (len > 0.5) {
        RJ.cel(g, tk.ellipsePts(end[0] + 10, end[1] - 4, 6, 5, 12), H.paperSh, { shadow: false, line: LINE.mid, depth: 1 });
        RJ.cel(g, tk.circlePts(end[0] - 4, end[1] - 14, 5.5, 12), H.seal, { shadow: G.pinkDk, line: LINE.mid, depth: 1.5, hi: '#ffc2e2', hiW: 1 });
        tk.sparkle(g, end[0] - 4, end[1] - 14, 3, { color: '#ffffff', glow: 0, thin: 0.25 });
      }
      // the roll in the hand: a gold-capped cylinder
      RJ.cel(g, rbox(x - 13, y - 4, 26, 9, 4), H.paper, { shadow: H.paperSh, line: LINE.main, tension: 0, depth: 2 });
      [x - 15, x + 13].forEach((cx) => RJ.cel(g, rbox(cx - 2, y - 6, 5, 13, 2), G.gold, { shadow: G.goldSh, line: LINE.mid, tension: 0, depth: 1 }));
      g.restore();
    }
    function goldPen(g, S) {
      const b = wristOf(S, false), a = b.ang + num(S.P.penRot), c = Math.cos(a), s = Math.sin(a), x = b.w[0] + c * 4, y = b.w[1] + s * 4;
      const p0 = [x - c * 10, y - s * 10], p1 = [x + c * 28, y + s * 28];
      RJ.ink(g, [p0, p1], { w: 7, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
      RJ.ink(g, [p0, [x + c * 20, y + s * 20]], { w: 4.6, color: G.gold, taper: 0, wobble: 0, weightVar: 0 });
      RJ.ink(g, [[x + c * 20, y + s * 20], p1], { w: 4.6, color: G.chrome, taper: 0.5, wobble: 0, weightVar: 0 });
      RJ.ink(g, [[p0[0] - s * 1.2, p0[1] + c * 1.2], [x + c * 18 - s * 1.2, y + s * 18 + c * 1.2]], { w: 1.2, color: G.goldLt, taper: 0, wobble: 0, weightVar: 0 });
      pearl(g, p0[0], p0[1], 3);
      tk.sparkle(g, p1[0] + c * 3, p1[1] + s * 3, 3.4 * (0.7 + 0.3 * Math.sin(S.t * 4)), { color: '#ffffff', glow: 0.3, thin: 0.2 });
    }
    function top(g, S) {
      inFig(g, S, (gg) => {
        scroll(gg, S);
        redrawHand(gg, S, true);
        if (S.P.bFront || S.P.penOut) { goldPen(gg, S); redrawHand(gg, S, false); }
        cufflink(gg, wristOf(S, true), 3.6);
        if (S.P.bFront || S.P.penOut) cufflink(gg, wristOf(S, false), 3.6);
      });
    }
    function mid(g, S) {
      // the back hand's pen and cufflink when that arm is behind the body
      if (S.P.bFront || S.P.penOut) return;
      inFig(g, S, (gg) => { goldPen(gg, S); redrawHand(gg, S, false); cufflink(gg, wristOf(S, false), 3.6); });
    }
    function fx(g, S, name) {
      const t = S.t, b = wristOf(S, false);
      if (name === 'ink') {
        // the pen strike: a looping signature flourish of pink ink and a burst where the nib lands
        const a = b.ang + num(S.P.penRot), x = b.w[0] + Math.cos(a) * 34, y = b.w[1] + Math.sin(a) * 34, u = fr(t * 1.3);
        const pts = []; for (let i = 0; i <= 18; i++) { const v = i / 18 * u; pts.push([x + 8 + v * 70, y - 6 + Math.sin(v * 16) * 9 - v * 12]); }
        if (pts.length > 2) { RJ.ink(g, pts, { w: 5, color: C.ink, taper: 0.5, wobble: 0, weightVar: 0 }); RJ.ink(g, pts, { w: 2.8, color: G.hot, taper: 0.5, wobble: 0, weightVar: 0 }); }
        RJ.fx.burst(g, x + 6, y - 4, 10 + 8 * S.beat, G.gold, '#fff6d0', t);
      } else if (name === 'gnotes') glossNotes(g, S.pt.mouth[0] + 6, S.pt.mouth[1] - 12, t, 3);
      else if (name === 'gsparkles') glossSparkles(g, S.pt.head[0], S.pt.head[1], [[64, -58, 7, 0.3], [82, -14, 5, 0], [-72, -44, 5, 0.2], [74, 30, 4, 0.4]], t);
      else if (name === 'grings') glossRings(g, S.pt.chest[0] + 16, S.pt.chest[1] + 14, t);
      else if (name === 'coins') {
        // a little shower of gold coins (the deal is good, for him)
        for (let i = 0; i < 4; i++) { const u = fr(t * 0.9 + i / 4), x = S.pt.head[0] - 50 + i * 30 + Math.sin(u * 5 + i) * 6, y = S.pt.head[1] - 80 + u * 70; g.save(); g.globalAlpha *= Math.sin(PI * u); g.translate(x, y); g.scale(Math.cos(u * 9 + i), 1); RJ.cel(g, tk.circlePts(0, 0, 6, 12), G.gold, { shadow: G.goldSh, line: LINE.mid, depth: 1.5, hi: G.goldLt, hiW: 1 }); g.restore(); }
      }
    }
    const oily = { eyes: 'open', mouth: 'gloss', brow: 0.25, blush: 1.0 };
    const poses = {
      idle: Object.assign({ fHand: [14, 34], fBend: -1, fKind: 'fist', fRot: -1.4, scrollLen: 1, bHand: [40, 16], bBend: 1, bKind: 'fist', bRot: 0.1, bFront: 1, penRot: -0.9, headRot: 0.05, torsoRot: -0.03, fx: [] }, oily),
      sing: { fHand: [14, 34], fBend: -1, fKind: 'fist', fRot: -1.4, scrollLen: 1, bHand: [62, 4], bBend: 1, bKind: 'fist', bFront: 1, penRot: -0.7, headRot: -0.04, eyes: 'open', mouth: 'chromeSmirk', brow: 0.4, blush: 1.1, fx: ['gnotes'], look: [0.5, 0] },
      windup: { fHand: [10, 36], fBend: -1, fKind: 'fist', fRot: -1.4, scrollLen: 0.9, bHand: [-36, -36], bBend: 1, bKind: 'fist', penRot: -1.8, penOut: 1, lean: -0.06, torsoRot: -0.08, headRot: -0.04,
        fFoot: [26, -12], bFoot: [-24, -12], eyes: 'half', mouth: 'glossSmirk', brow: 0.45, fx: [], look: [0.5, 0] },
      attack: { fHand: [10, 36], fBend: -1, fKind: 'fist', fRot: -1.4, scrollLen: 0.9, bHand: [70, 12], bBend: 1, bKind: 'fist', bFront: 1, penRot: -0.15, lean: 0.1, torsoRot: 0.07, headRot: 0.05, headDx: 3,
        fFoot: [32, -12], bFoot: [-24, -12], eyes: 'determined', mouth: 'chromeSmirk', brow: 0.5, fx: ['ink'], look: [0.6, 0] },
      strike: { fHand: [10, 36], fBend: -1, fKind: 'fist', fRot: -1.4, scrollLen: 0.9, bHand: [74, 16], bBend: 1, bKind: 'fist', bFront: 1, penRot: 0, lean: 0.14, bx: 4, torsoRot: 0.09, headRot: 0.06, headDx: 3,
        fFoot: [36, -12], bFoot: [-24, -12], eyes: 'determined', mouth: 'chromeSmirk', brow: 0.55, fx: ['ink'], look: [0.6, 0] },
      hurt: Object.assign({ fHand: [20, 26], fBend: -1, fKind: 'fist', fRot: -1.4, scrollLen: 0.7, bHand: [-36, -10], bBend: 1, bKind: 'open', bSpread: 1.3, penRot: -1, fx: ['stars'] }, HURT),
      cheer: { fHand: [14, 34], fBend: -1, fKind: 'fist', fRot: -1.4, scrollLen: 1, bHand: [-46, -36], bBend: 1, bKind: 'fist', penRot: -1.2, penOut: 1, headRot: 0.04, eyes: 'happy', mouth: 'chromeGrin', brow: -0.1, blush: 1.4,
        fFoot: [20, -12], bFoot: [-18, -12], fx: ['gsparkles', 'coins'] },
      block: { fHand: [30, -4], fBend: 1, fKind: 'fist', fRot: -1.4, scrollLen: 0.75, bHand: [-20, 34], bBend: 1, bKind: 'fist', penRot: -1.2, headRot: -0.08, eyes: 'open', mouth: 'gloss', brow: 0.4,
        fFoot: [26, -12], bFoot: [-26, -12], fx: ['grings'] },
      down: Object.assign({ fHand: [20, 42], fBend: 1, fKind: 'fist', fRot: -1.4, scrollLen: 1, bHand: [-6, 52], bBend: -1, bKind: 'fist', penRot: -0.4, fx: ['mute'] }, SIT),
      walk: Object.assign({ fHand: [14, 34], fBend: -1, fKind: 'fist', fRot: -1.4, scrollLen: 1, bHand: [-24, 24], bBend: 1, bKind: 'fist', penRot: -1.2, headRot: 0.05, fx: [] }, oily),
      bust: Object.assign({ fHand: [12, 60], fBend: -1, fKind: 'fist', fRot: -1.4, scrollLen: 0, bHand: [-10, 60], bBend: 1, bKind: 'fist', penRot: -1.4, headRot: 0.04, fx: [] }, oily),
    };
    const spec = {
      id: 'npc_gloss_sol', accent: 'gloss',
      skel: { neck: [0, -150], headC: [2, -208], shF: [30, -136], shB: [-30, -136], hip: [0, -72], hipF: [16, -66], hipB: [-16, -66] },
      base: { mic: 'none', scrollLen: 1, penRot: -1, penOut: 0, scRot: 0 },
      poses, face,
      exprs: { smirk: { eyes: 'open', mouth: 'chromeSmirk', brow: 0.4 }, neutral: { eyes: 'open', mouth: 'gloss', brow: 0.25 } },
      arm: { l: [25, 23], w: [20, 15], skin: H.suit, skinSh: H.suitSh, cuff: { color: H.shirt, light: H.shirtSh }, hand: { skin: H.skin, shade: H.skinSh } },
      legs: { w: [28, 22], color: H.pants, shade: H.pantsSh, pantsOver: true, bow: 2, profile: (u) => 1 - 0.2 * u, decor: trouserDecor(C.ink, H.pantsSh), shoe: { color: H.shoe, sole: '#ffd2ea', shade: H.shoeSh, toeCap: '#ff86c4', hi: '#ffb5dc', k: 1.2 } },
      life: { idle: { bob: 1.3, per: 2.8, sway: 0.018, head: 0.022 }, walk: { bob: 2.4, per: 0.55, head: 0.01, step: { hz: 1.8, stride: 8, lift: 4 } } },
      tip: (P, Lay) => { const b = Lay.pt.shB; return [b[0] + P.bHand[0] + 28, b[1] + P.bHand[1]]; },
      bounds: { h: 298, x0: -122, x1: 130 },
      bust: { rect: [-92, -296, 92, -92], face: [-80, -290, 78, -136], pose: 'bust' },
      layers: { torso, mid, head, top, fx },
      // the pen twirls between his fingers while he waits for your signature
      tweak(P, t) { if (P.pose === 'idle') P.penRot = num(P.penRot) + 0.35 * Math.sin(t * 2.4) * tk.motion(); },
    };
    RJ.register('npc_gloss_sol', RJ.rig(spec));
  })();

  window.RGCAST = window.RGCAST || {};
  window.RGCAST.gloss = {
    ids: ['npc_gloss_sheen', 'npc_gloss_mute', 'npc_gloss_tune', 'npc_gloss_ivy', 'npc_gloss_sol'],
    note: [
      'npc_gloss_sheen: Madame Sheen (boss, drawn 1.12x): pearl helmet bob, chrome cat-eye shades worn low, long pink coat and sash, satin gloves; the gold record (flung in the strike)',
      'npc_gloss_mute: Mr. Mute (enforcer): very tall lilac suit, plum flat-top, mouth sealed by a riveted chrome smile plate that talks through a grille; a chrome mic stand wrapped in pink ribbon',
      'npc_gloss_tune: Agent Autotune (grunt): pink pompadour quiff, chrome earpiece on a coiled cord, the tilted Gloss smirk, cropped pink suit, waveform tie; a pearl mic and staircase pitch waves',
      'npc_gloss_ivy: Intern Ivy (grunt): small and nervous, pen-stuck buns, big pink round glasses, five lanyards with badges; a huge clipboard (papers fly)',
      'npc_gloss_sol: Sleek Sol (merchant/fixer): round pearl pinstripe double-breasted suit, slick hair with one curl and a curled moustache, pearl cufflinks; a contract scroll to the floor and a gold pen',
    ].join('\n'),
  };
})();
