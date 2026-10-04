// crew.js: the crew characters of the RoxorLoops and Jasmin cast, built on kit.js (RJ.rig). The three friends are likenesses drawn from photos the owners
// provided, in the same chibi style as the two mains (same ink line, cel shading and scale): the hairstyle, glasses and clothes are what is kept, the faces
// stay gentle and symmetric. Each character is one block with a palette object at its top, so a correction is a colour or a shape swap, not a rewrite.
//   'rawclaw'       the electronic producer and beatboxer. Accent ELECTRIC VIOLET. Black hair in one smooth swept-up wave leaning to the viewer's right with a soft fade at both temples, strong dark
//                   straight brows, a gentle symmetric face with a soft smile, warm olive skin, a light stubble hint, a light grey zip jacket with a dark collar over a navy hoodie (hood down, round the neck)
//                   and a blue tee at the throat, headphones round the neck on a violet-edged band and cord, a pad sampler on a strap whose pads light up with the pose and whose
//                   little screen shows the glowing three-slash claw mark.
//   'rawclaw_goat'  his joke profile picture as a friendly goat cosplay: the same body and clothes, two floppy cream goat ears out to the sides, two small horns, a
//                   longer muzzle-ish chin with a tiny cream goat beard that curls at the tip, big warm eyes and a happy open mouth. Same five poses and bust.
//   'andy'          the groovy bass player and loop-pedal tinkerer. Accent WARM ORANGE. Shaggy hair with an orange headband, a retro striped tee, bell-bottoms,
//                   a sunburst bass on a strap (the attack is a thumb slap with sound rings) and a loop pedal with a green LED on the ground.
//   'jordan'        the virtual assistant who draws the graphics and runs the merch shop. Accent TEAL. Black wavy shoulder-length hair parted in the middle, round
//                   thin black-rimmed glasses, light tan skin, a slim build in a black tee with a big pale teal disc badge high on the chest and black pants, black bracelets on one wrist and a blue-faced
//                   wristwatch on the other, a small plain round pendant on a dark cord, teal piping on the hem, sleeves and trouser cuffs, a teal merch tote and a tablet in a teal case with a stylus.
// Same interface and scale as roxor.js and jasmin.js: RJ.register(id, RJ.rig(spec)) gives {draw, bust, bounds, points}.
//   Props: things that hang on the body (the sampler, the bass, the tote) are drawn in the torso layer, under the arms. Things the hands hold and move
//   (the assistant's tablet and stylus) are drawn in figure space from the 'top' layer (so portraits have them too) and the gripping hands are drawn again on
//   top, so a prop never covers its own fingers. the bass player's pedal and cable sit on the ground in the 'fx' hook (not part of a portrait).
//   spec.tweak(P, t): crew.js wraps RJ.resolve once so a spec may edit the resolved pose numbers over time (a hand lifting between slaps, fingers
//   drumming). It is optional, pure in t, and a throwing tweak is swallowed. kit.js is untouched (crewRig wraps each crew portrait to fix its framing in tall boxes).
(function () {
  'use strict';
  const tk = ART.tk, C = RJ.C, LINE = RJ.LINE, mat = tk.mat;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const fr = (v) => v - Math.floor(v);

  RJ.ACCENT.rawclaw = { main: '#8b4dff', dark: '#4a1fb5', light: '#d2bcff', glow: '#b78cff' };
  RJ.ACCENT.andy = { main: '#ff8a1f', dark: '#b5530a', light: '#ffd0a0', glow: '#ffb45e' };
  RJ.ACCENT.jordan = { main: '#1fc4bd', dark: '#0b6f72', light: '#a6efe9', glow: '#6ff0e6' };

  // ------------------------------------------------------------------------------------------------------------------------------------------------
  // shared helpers (all the crew)
  // ------------------------------------------------------------------------------------------------------------------------------------------------
  // OPTIONAL POSE ANIMATION HOOK. kit.js poses are static tables plus a beat pulse; a crew spec may add spec.tweak(P, t) which edits the resolved pose numbers
  // (a hand lifting between slaps, fingers drumming). RJ.resolve is wrapped once; specs without a tweak are untouched. Always assign fresh arrays in a tweak.
  if (!RJ._crewTweak) {
    RJ._crewTweak = true;
    const baseResolve = RJ.resolve;
    RJ.resolve = function (spec, pose, t, expr) {
      const P = baseResolve(spec, pose, t, expr);
      if (spec && typeof spec.tweak === 'function') { try { spec.tweak(P, isFinite(t) ? +t : 0); } catch (e) { /* a bad tweak must never break a draw */ } }
      return P;
    };
  }
  // many short ink strokes: list items are [x0, y0, x1, y1] or a point list
  const strokes = (g, list, o) => list.forEach((l, i) => RJ.ink(g, typeof l[0] === 'number' ? [[l[0], l[1]], [l[2], l[3]]] : l, Object.assign({ w: 1.25, taper: 0.5, wobble: 0, seed: i }, o)));
  // a box with rounded corners as an explicit polygon (draw it with tension 0)
  function rbox(x, y, w, h, r, n) {
    r = Math.min(r, w / 2, h / 2); n = n || 3;
    const pts = [], cs = [[x + w - r, y + r, -0.5], [x + w - r, y + h - r, 0], [x + r, y + h - r, 0.5], [x + r, y + r, 1]];
    for (let c = 0; c < 4; c++) for (let i = 0; i <= n; i++) { const a = (cs[c][2] + i / n * 0.5) * Math.PI; pts.push([cs[c][0] + Math.cos(a) * r, cs[c][1] + Math.sin(a) * r]); }
    return pts;
  }
  // skull, soft skin shadow, optional cast shadow of the hair, then the face and the outline. The hair is drawn over it by the caller.
  // o: {skull, skin, shade, cast (a polygon: the hair's cast shadow on the forehead), castDy, under (fn(g) drawn inside the skull, before the face)}
  // The skin shade offset goes through RJ.lx so a flipped figure keeps its key light on the upper right of the screen (as in roxor.js).
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
  // torso rest space to figure space (live, with the pose)
  const tPt = (S, x, y) => mat.pt(S.M.torso, x, y);
  // the wrist of an arm, solved like the rig solves it: used to draw a hand again on top of a prop
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
  // a four-point sparkle patch / glint with an ink-free light core
  function glint(g, x, y, r, col) { tk.sparkle(g, x, y, r, { color: col || '#ffffff', glow: 0.25, thin: 0.2 }); }
  // little round LED with a light core and an additive halo (halo 0 = no glow)
  function led(g, x, y, r, col, halo, a) {
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = col; g.fill();
    g.beginPath(); g.arc(x - r * 0.25, y - r * 0.3, r * 0.4, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fill();
    if (halo) tk.glow(g, x, y, halo, col, a === undefined ? 0.6 : a, false);
  }
  // a thin band across a forearm at distance d from the wrist (towards the elbow): bracelets and watch straps. k = the arm's own unit vector (elbow to wrist).
  function armBand(g, wr, d, half, col, th, edge) {
    const ux = Math.cos(wr.ang), uy = Math.sin(wr.ang), nx = -uy, ny = ux, cx = wr.w[0] - ux * d, cy = wr.w[1] - uy * d;
    const a = [cx - nx * half, cy - ny * half], b = [cx + nx * half, cy + ny * half];
    RJ.ink(g, [a, b], { w: th + 2.4, color: edge || C.ink, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, [a, b], { w: th, color: col, taper: 0, wobble: 0, weightVar: 0 });
  }

  // PORTRAIT FRAMING. kit.js works out the crop offset before it shrinks the zoom to fit spec.bust.face, so in a box taller than a wide head (the goat's ears in a
  // portrait box) the head ends up pushed to the bottom with an empty band above it. crewRig builds the rig, then wraps its bust: the framing is worked out here with
  // the offset taken AFTER the shrink (same rules as the kit: cover the rect, shrink until the face fits with 10% to spare, centre on the face in a short box, keep
  // the face inside), and the kit is handed an equivalent plain rect, so kit.js stays untouched. Odd sizes are passed straight to the kit, which validates them.
  function crewRig(spec) {
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

  // ================================================================================================================================================
  // RAWCLAW: the producer. Swept-up tousled dark hair with a short fade, strong brows, warm olive skin with a stubble hint, light grey jacket with a dark collar
  // over a navy hoodie (hood down), blue tee at the throat, headphones round the neck on a violet cord, pad sampler on a strap with the glowing claw mark.
  // 'rawclaw_goat' is the same body and clothes with a friendly goat-cosplay head (see makeRawclaw(true)).
  // ================================================================================================================================================
  const R = {
    hair: '#2d221d', hairSh: '#170e0a', hairHi: '#745b4b',
    skin: '#ecc196', skinSh: '#d6a077', skinHi: '#f8dcb9', skinDeep: '#c08a62',
    fade: '#6e5750', fadeDk: '#4d3b3a', stub: '#7d5c47',
    jacket: '#cfd2de', jacketSh: '#a3a8bf', jacketHi: '#f0f2f8', collar: '#2c3049', collarSh: '#181a2c', zip: '#80849c',
    hood: '#2f4175', hoodSh: '#1b2756', hoodHi: '#5b6eb0', hoodDk: '#111838', cord: '#8fa0d8',
    tee: '#2f6bef', teeSh: '#1c45b8',
    pants: '#303450', pantsSh: '#1e2136',
    violet: '#9a63ff', violetDk: '#5224b8', glow: '#c9a8ff',
    pad: '#ebe7f6', padSh: '#c2b9da', padOff: '#6f4fd0', padOn: '#f1e6ff',
    phones: '#2e2b38', phonesSh: '#17151f', phonesHi: '#5d586f',
    iris: ['#2a1810', '#74492a'],
    // goat cosplay
    fur: '#efd9b3', furSh: '#d3b07e', furHi: '#fff1d6', inner: '#f6a8b4', innerSh: '#df8294',
    horn: '#f6d5a2', hornSh: '#dba56a', hornHi: '#fff0d2', hornDk: '#c58b52',
    gIris: ['#4a2a14', '#b9783a'],
  };
  const RC_SKULL = RJ.skullPts({ w: 0.98, chin: 7 });
  const GT_SKULL = RJ.skullPts({ w: 0.97, chin: 12 });
  // the hair, in head space: one smooth wave swept up from the back of the head and leaning to the viewer's right, rising to a soft quiff at the front with only
  // three shallow points (the notches between them are short), a hairline that rises over the forehead with two small strands that fall onto it, and a soft fade at
  // both temples (see rcFadeUnder). Points [x, y, 1] are the soft tips.
  const RC_TOP = [[50, -33], [55, -43], [57, -55], [58, -67], [59, -79], [66, -91, 1], [56, -100], [44, -105], [31, -104], [20, -100, 1], [10, -95], [0, -95], [-10, -93, 1], [-20, -90], [-31, -85], [-42, -79],
    [-52, -72], [-58, -62], [-62, -52], [-65, -42], [-66, -32], [-66, -24]];
  // the lower edge: the top of the fade, then the hairline with two small strands that fall onto the forehead
  const RC_LINE = [[-60, -23], [-52, -31], [-42, -38], [-28, -42], [-14, -45], [0, -47], [5, -47], [8, -40, 1], [12, -47], [24, -46], [28, -46], [31, -39, 1], [34, -45], [40, -42]];
  const RC_HAIR = RC_TOP.concat(RC_LINE);
  // the combed flow of the wave: long curves that sweep up from the nape toward the front lock, and the glossy bands along the crest
  const RC_FLOW = [[[-52, -62], [-36, -76], [-14, -87], [10, -93], [34, -98], [56, -97]], [[-44, -54], [-26, -68], [-4, -79], [20, -86], [42, -88], [60, -84]],
    [[-34, -48], [-14, -60], [8, -70], [30, -77], [52, -76]], [[-20, -48], [0, -56], [22, -63], [46, -64]],
    [[20, -100], [25, -90], [28, -80]], [[-10, -93], [-5, -84], [-2, -74]], [[66, -91], [62, -82], [59, -72]]];
  const RC_HI = [[[-24, -86], [-6, -93], [14, -99], [34, -103], [52, -99], [46, -96], [32, -99], [14, -96], [-4, -90], [-20, -82]], [[-46, -72], [-36, -78], [-24, -82], [-30, -76], [-42, -69]]];
  // the near temple (hair-toned short growth that melts into the skin) and the far temple
  const RC_FADE = [[-66, -26], [-56, -32], [-42, -39], [-36, -35], [-39, -21], [-42, -5], [-43, 11], [-45, 23], [-52, 29], [-61, 22], [-67, 2]];
  const RC_FADE_FAR = [[40, -42], [50, -37], [58, -28], [62, -12], [62, 8], [55, 4], [52, -12], [46, -28]];
  const RC_JAW = [[-45, 30], [-34, 44], [-14, 55], [6, 59], [26, 57], [46, 45], [57, 28], [62, 52], [30, 74], [-10, 74], [-42, 64]];

  function rcHair(g, S) {
    RJ.cel(g, RC_HAIR, R.hair, { shadow: R.hairSh, line: LINE.main + 0.1, depth: 6, tension: 0.7, weightVar: 0.4, decor: (gg) => {
      RC_HI.forEach((f) => RJ.fillPts(gg, f, R.hairHi, 0.7));
      RC_FLOW.forEach((l, i) => RJ.ink(gg, l, { w: 1.4, color: R.hairSh, taper: 0.55, wobble: 0.02, alpha: 0.95, seed: i }));
      strokes(gg, [[-30, -70, -22, -75], [-6, -80, 4, -84], [20, -86, 30, -88], [38, -84, 46, -84], [-16, -60, -8, -65], [10, -72, 18, -76], [34, -74, 42, -75]], { color: R.hairHi, w: 1.25, alpha: 0.85 });
    } });
    // a few loose strands at the quiff: the tousled look
    [[[60, -97], [67, -103], [64, -110]], [[28, -104], [29, -111], [33, -115]], [[-8, -94], [-12, -100], [-10, -105]]].forEach((w, i) => RJ.ink(g, w, { w: 1.6, color: C.ink, taper: 0.7, wobble: 0.02, seed: i }));
  }
  // the soft fade at both temples (gradients that melt into the skin, no hard edge) and the stubble hint along the jaw
  function rcFadeUnder(g) {
    const soft = (poly, x0, x1, a) => {
      const gr = g.createLinearGradient(x0, 0, x1, 0);
      gr.addColorStop(0, 'rgba(58,44,40,' + a + ')'); gr.addColorStop(0.5, 'rgba(92,71,63,' + (a * 0.5).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(110,87,80,0)');
      g.beginPath(); tk.trace(g, poly); g.fillStyle = gr; g.fill();
    };
    soft(RC_FADE, -67, -37, 0.95);
    soft(RC_FADE_FAR, 63, 44, 0.6);
    strokes(g, [[-50, -22, -47, -19], [-46, -10, -43, -7], [-47, 3, -44, 6], [-49, 14, -46, 17], [-56, -12, -53, -9], [-54, 2, -51, 5], [-40, -26, -38, -22], [56, -22, 55, -18], [58, -8, 57, -4], [55, 2, 54, 5]], { color: R.fadeDk, w: 1, alpha: 0.55 });
    // the stubble hint: a flat soft tone hugging the jaw, and a few short ticks
    g.save(); g.globalAlpha = 0.34; g.fillStyle = R.stub; g.beginPath(); tk.trace(g, RC_JAW, 0, 0, 0.5); g.fill(); g.restore();
    strokes(g, [[-24, 47, -22, 50], [-12, 53, -10, 56], [0, 57, 2, 60], [14, 57, 16, 60], [26, 53, 28, 56], [38, 46, 40, 49], [-6, 39, -4, 41], [24, 39, 26, 41], [-32, 42, -30, 45], [46, 40, 48, 43]], { color: R.stub, w: 1, alpha: 0.6 });
  }
  // a small strong nose: a short hook for the tip and the nostril under it (no long cheek crease, it read as a worry line)
  function rcNose(g, S) {
    RJ.ink(g, [[22.4, 28.2], [22.6, 31.6], [25.6, 33.4]], { w: 1.3, color: C.inkSoft, taper: 0.5, wobble: 0, alpha: 0.7 });
    RJ.ink(g, [[22.6, 36], [25.2, 37], [27.6, 35.8]], { w: 1.3, color: C.ink, taper: 0.5, wobble: 0, alpha: 0.55 });
  }
  function rcHead(g, S) {
    headBase(g, S, { skull: RC_SKULL, skin: R.skin, shade: R.skinSh, cast: RC_LINE.concat([[40, -50], [-60, -50]]), castDy: 5, under: rcFadeUnder });
    rcNose(g, S);
    rcHair(g, S);
    RJ.ear(g, -52, 25, { r: 14, side: -1, skin: R.skin, shade: R.skinSh });
  }
  // the short back of the head: a little hair at the nape that sways a little
  const RC_NAPE = [[-56, -4], [-68, 8], [-72, 24], [-66, 38], [-58, 40, 1], [-52, 28], [-52, 10]];
  function rcNape(g, S) {
    g.save(); g.translate(-56, 0); g.rotate(S.P.hairSwing * 0.04); g.translate(56, 0);
    RJ.cel(g, RC_NAPE, R.hair, { shadow: R.hairSh, line: LINE.main, depth: 4, tension: 0.7, hi: R.hairHi, hiW: 1.2, hiAlpha: 0.6 });
    g.restore();
  }

  // ---- the goat cosplay: floppy ears out to the sides, small horns, a longer muzzle-ish chin with a tiny beard ----
  const GT_EAR = [[-50, -12], [-62, -14], [-78, -8], [-94, 4], [-108, 18], [-117, 33, 1], [-105, 41], [-89, 39], [-73, 33], [-59, 27], [-50, 21]];
  const GT_EAR_IN = [[-58, -3], [-70, -4], [-84, 3], [-98, 14], [-107, 27, 1], [-97, 31], [-84, 29], [-70, 23], [-58, 17]];
  const GT_FOLD = [[-57, 7], [-80, 14], [-101, 25]];
  const farEar = (p) => [4 - p[0] * 0.92, 6 + (p[1] - 6) * 0.95].concat(p.slice(2));
  function gtEars(g, S) {
    const sw = S.P.hairSwing * 0.03;
    [-1, 1].forEach((sd) => {
      const f = sd < 0 ? (p) => p : farEar, ear = GT_EAR.map(f), inn = GT_EAR_IN.map(f), fold = GT_FOLD.map(f);
      g.save(); g.translate(sd < 0 ? -52 : 54, 6); g.rotate(sw * sd); g.translate(sd < 0 ? 52 : -54, -6);
      RJ.cel(g, ear, R.fur, { shadow: R.furSh, line: LINE.main, depth: 5, tension: 0.8, hi: R.furHi, hiW: 1.5, hiAlpha: 0.7 });
      RJ.cel(g, inn, R.inner, { shadow: R.innerSh, line: LINE.fine + 0.2, depth: 3, tension: 0.8, hi: false });
      RJ.ink(g, fold, { w: LINE.fine, color: R.innerSh, taper: 0.5, wobble: 0.02 });
      g.restore();
    });
  }
  // two small curved horns: a tapered ribbon that rises from the crown and bends outward and back (the far one is the near one mirrored about x = 14)
  const GT_HORN = [[-12, -62], [-14, -76], [-22, -88], [-35, -93]];
  function gtHorns(g, S) {
    [-1, 1].forEach((sd) => {
      const sp = sd < 0 ? GT_HORN : GT_HORN.map((p) => [28 - p[0], p[1]]);
      tk.ribbon(g, sp, R.horn, { wMax: 17, w0: 16, w1: 1.5, tipPow: 0.9, gloss: true, glossColor: R.hornHi, glossAlpha: 0.75, strands: 0, shadow: R.hornSh, shadowW: 0.5, line: LINE.main, lineColor: C.ink, decor: (gg) => {
        [0.34, 0.56].forEach((u) => {
          const i = Math.min(sp.length - 2, Math.floor(u * (sp.length - 1))), k = u * (sp.length - 1) - i, x = lerp(sp[i][0], sp[i + 1][0], k), y = lerp(sp[i][1], sp[i + 1][1], k);
          RJ.ink(gg, [[x - 9, y + 0.5], [x, y - 2.2], [x + 9, y + 0.5]], { w: 1.15, color: R.hornDk, taper: 0.3, wobble: 0, alpha: 0.9 });
        });
      } });
    });
  }
  // the tiny goat beard: a short cream tuft (the colour of the horns, so it separates from the navy hoodie) that curls out at its tip and wiggles a little with the sway
  const GT_BEARD = [[-1, 66], [11, 66], [15, 70], [15, 76], [19, 81], [24, 80, 1], [20, 86], [13, 84], [10, 88, 1], [5, 83], [-1, 80, 1], [-3, 73]];
  function gtBeard(g, S) {
    g.save(); g.translate(6, 66); g.rotate(S.P.hairSwing * 0.05); g.translate(-6, -66);
    RJ.cel(g, GT_BEARD, R.fur, { shadow: R.furSh, line: LINE.main, depth: 3.4, tension: 0.6, hi: R.furHi, hiW: 1.3, hiAlpha: 0.85, decor: (gg) => {
      strokes(gg, [[[2, 69], [3, 75], [6, 81]], [[9, 69], [11, 75], [14, 81]]], { color: R.hornDk, w: 1.1, alpha: 0.7 });
    } });
    g.restore();
  }
  // a lighter, rounder muzzle patch around the mouth, drawn under the face features
  function gtMuzzleUnder(g) {
    rcFadeUnder(g);
    g.save(); g.globalAlpha = 0.6; g.beginPath(); tk.trace(g, tk.ellipsePts(12, 46, 21, 18, 14)); g.fillStyle = R.skinHi; g.fill(); g.restore();
    [[18.5, 37.5], [25.5, 36.5]].forEach((n) => { g.beginPath(); g.ellipse(n[0], n[1], 1.5, 1.1, -0.3, 0, TAU); g.fillStyle = R.skinDeep; g.globalAlpha = 0.8; g.fill(); g.globalAlpha = 1; });
  }
  function gtHead(g, S) {
    gtEars(g, S);
    headBase(g, S, { skull: GT_SKULL, skin: R.skin, shade: R.skinSh, cast: RC_LINE.concat([[40, -50], [-60, -50]]), castDy: 5, under: gtMuzzleUnder });
    gtHorns(g, S);
    rcHair(g, S);
    gtBeard(g, S);
  }

  function rcFaceSpec(goat) {
    if (goat) {
      return {
        eyes: [{ x: -13, y: 17, w: 34, h: 31 }, { x: 40, y: 15, w: 29, h: 29 }],
        brows: [[-14, -7, 26], [44, -7, 22]],
        browStyle: { thick: 4.6, arch: 0.35, tilt: -0.12, color: R.hairSh },
        nose: [22, 34, 60],
        mouth: [11, 50, 25],
        mouthStyle: { lineW: 1.4, puff: true, inner: '#a53a52', tongue: '#ff8fa3' },
        blush: [[-8, 36, 17], [42, 34, 14]],
        sweat: [56, -14, 5],
        eye: { iris: R.gIris, ring: '#26140a', sclera: '#fffaf2', expr: 'neutral', irisW: 0.8, irisH: 1.0, lid: 2.0, wing: 0.35, lash: 1.0, crease: false, lashes: 0, tilt: -0.08, drop: 0, hl: [[-0.36, -0.46, 0.3], [-0.32, -0.08, 0.15]] },
      };
    }
    // gentle and symmetric: two matching big eyes (the far one only a touch narrower for the 3/4 turn), matching brows, a soft closed smile
    return {
      eyes: [{ x: -14, y: 15, w: 29, h: 26 }, { x: 39, y: 15, w: 27.5, h: 25 }],
      brows: [[-15, -7, 28], [44, -7, 27]],
      browStyle: { thick: 6.2, arch: 0.2, tilt: 0.02, color: R.hairSh },
      mouth: [10, 44, 20],
      mouthStyle: { lineW: 1.4, puff: true, inner: '#a53a52' },
      blush: [[-6, 32, 13], [41, 31, 12]],
      blushColor: '#f0907e',
      sweat: [56, -14, 5],
      eye: { iris: R.iris, ring: '#1a0e08', sclera: '#f7efe6', expr: 'neutral', irisW: 0.68, irisH: 0.98, lid: 2.0, wing: 0.4, lash: 1.05, crease: true, lashes: 0, tilt: 0.02, drop: 0.05, hl: [[-0.36, -0.46, 0.36], [-0.3, -0.06, 0.17]] },
    };
  }

  // the pad lights: 0..1 per pad, a pure function of the pose and t
  function rcPad(S, i) {
    const t = S.t, pose = S.P.pose, col = i % 4, row = (i / 4) | 0;
    if (pose === 'attack') return Math.pow(Math.abs(Math.sin(Math.PI * (t * 2.6 + col * 0.12 + row * 0.5))), 3);
    if (pose === 'sing') return (Math.floor(t * 4) % 8) === i ? 1 : (((Math.floor(t * 4) + 4) % 8) === i ? 0.45 : 0);
    if (pose === 'cheer') return Math.max(0, Math.sin(t * 7 - col * 1.0 - row * 0.5));
    if (pose === 'hurt') return Math.sin(t * 40 + i * 2.1) > 0.82 ? 0.7 : 0;
    return (Math.floor(t * 1.5) % 8) === i ? 0.5 + 0.5 * Math.sin(fr(t * 1.5) * Math.PI) : 0;
  }
  function rcCup(g, x, y, k, rot) {
    g.save(); g.translate(x, y); g.rotate(rot || 0); g.scale(k, k);
    RJ.cel(g, tk.ellipsePts(0, 0, 11, 14.5, 14), R.phones, { shadow: R.phonesSh, line: LINE.main, depth: 4, hi: R.phonesHi, hiW: 1.5 });
    g.lineWidth = 3.2; g.strokeStyle = R.violetDk; g.beginPath(); g.ellipse(0, 0.5, 6.6, 9.2, 0, 0, TAU); g.stroke();
    g.lineWidth = 1.7; g.strokeStyle = R.violet; g.beginPath(); g.ellipse(0, 0.5, 6.6, 9.2, 0, 0, TAU); g.stroke();
    RJ.ink(g, [[-5, -7], [-8, -2]], { w: 1.4, color: '#ffffff', taper: 0.5, wobble: 0, alpha: 0.6 });
    g.restore();
  }
  // the three-slash claw mark, a little glowing screen graphic
  function rcClaw(g, cx, cy, k, glow) {
    if (glow) tk.glow(g, cx, cy, 13 * k, R.violet, 0.5);
    for (let i = -1; i <= 1; i++) {
      const o = i * 4.4 * k, a = [[cx + o - 2.4 * k, cy - 5.6 * k + Math.abs(i) * 0.9 * k], [cx + o + 0.3 * k, cy + 0.3 * k], [cx + o + 2.4 * k, cy + 6 * k - Math.abs(i) * 0.9 * k]];
      RJ.ink(g, a, { w: 2.8 * k, color: R.violetDk, taper: 0.5, wobble: 0, weightVar: 0 });
      RJ.ink(g, a, { w: 1.5 * k, color: '#d6b8ff', taper: 0.5, wobble: 0, weightVar: 0 });
    }
  }
  const RC_JACKET = [[-15, -151], [15, -151], [31, -146], [37, -132], [38, -108], [41, -79, 1], [-41, -79, 1], [-38, -108], [-37, -132], [-31, -146]];
  const RC_PANEL = [[-13, -152], [13, -152], [19, -132], [20, -106], [22, -80, 1], [-22, -80, 1], [-20, -106], [-19, -132]];
  function rcTorso(g, S) {
    // the headphones' violet cord round the back of the neck, then the neck itself
    const band = [[-29, -136], [-26, -150], [-12, -158], [4, -159], [20, -156], [30, -148], [31, -137]];
    RJ.ink(g, band, { w: 6, color: R.phonesSh, taper: 0, wobble: 0 });
    RJ.ink(g, band, { w: 3.4, color: R.violet, taper: 0, wobble: 0 });
    RJ.neck(g, 2, -156, { w: 22, h: 22, skin: R.skin, shade: R.skinSh });
    // the light grey jacket: body, ribbed hem, a few folds
    RJ.cel(g, RC_JACKET, R.jacket, { shadow: R.jacketSh, line: LINE.main, depth: 8, hi: R.jacketHi, hiW: 1.6, hiAlpha: 0.8, tension: 0.5, decor: (gg) => {
      gg.beginPath(); gg.rect(-45, -88, 90, 10); gg.fillStyle = R.jacketSh; gg.fill();
      RJ.ink(gg, [[-45, -88], [45, -88]], { w: 1.3, color: R.zip, taper: 0, wobble: 0 });
      strokes(gg, [[-32, -130, -26, -114], [30, -132, 26, -116], [-30, -104, -27, -94]], { color: R.jacketHi, alpha: 0.85, w: 1.4 });
    } });
    // the navy hoodie in the open front, with the jacket's zip tapes down both edges
    RJ.cel(g, RC_PANEL, R.hood, { shadow: R.hoodSh, line: LINE.main, depth: 5, hi: R.hoodHi, hiW: 1.4, hiAlpha: 0.6, tension: 0.4, decor: (gg) => {
      gg.beginPath(); gg.rect(-26, -88, 52, 9); gg.fillStyle = R.hoodSh; gg.fill();
      RJ.ink(gg, [[-26, -88], [26, -88]], { w: 1.2, color: R.hoodDk, taper: 0, wobble: 0 });
    } });
    [[-1, [[-13, -150], [-19, -130], [-20, -106], [-22, -82]]], [1, [[13, -150], [19, -130], [20, -106], [22, -82]]]].forEach((z) => {
      RJ.ink(g, z[1], { w: 3.4, color: R.collar, taper: 0, wobble: 0, weightVar: 0 });
      for (let i = 0; i < 9; i++) { const y = -146 + i * 7.4, x = z[0] * (13 + (i / 8) * 8.5); RJ.ink(g, [[x, y], [x - z[0] * 2.4, y + 1.2]], { w: 1, color: R.zip, taper: 0, wobble: 0, weightVar: 0 }); }
    });
    // the dark collar standing round the neck on each side of the hood
    [[-1, [[-14, -153], [-24, -151], [-31, -146], [-29, -140], [-20, -143], [-12, -147]]], [1, [[16, -153], [26, -151], [33, -146], [31, -140], [22, -143], [14, -147]]]].forEach((c) => {
      RJ.cel(g, c[1], R.collar, { shadow: R.collarSh, line: LINE.mid, depth: 2.4, tension: 0.6, hi: false });
    });
    // the blue tee at the throat, then the hood lying round the neck like a soft roll
    RJ.cel(g, [[-14, -153, 1], [16, -153, 1], [10, -144], [2, -134, 1], [-8, -144]], R.tee, { shadow: R.teeSh, line: LINE.mid, depth: 3, tension: 0.3, hi: false });
    const roll = [[-29, -152], [-28, -141], [-21, -129], [-8, -122], [4, -121], [18, -126], [28, -136], [31, -150], [22, -149], [16, -138], [6, -132], [-6, -133], [-16, -139], [-21, -149]];
    RJ.cel(g, roll, R.hood, { shadow: R.hoodSh, line: LINE.main, depth: 4, hi: R.hoodHi, hiW: 1.5, hiAlpha: 0.7, tension: 0.75, decor: (gg) => {
      strokes(gg, [[[-26, -146], [-24, -136], [-17, -128]], [[26, -146], [24, -137], [16, -129]]], { color: R.hoodHi, w: 1.2, alpha: 0.7 });
    } });
    // the drawstrings with their little tips
    [[-7, -131, -9, -114], [9, -131, 11, -113]].forEach((l, i) => {
      const sp = [[l[0], l[1]], [(l[0] + l[2]) / 2 + (i ? 1.4 : -1.4), (l[1] + l[3]) / 2], [l[2], l[3]]];
      RJ.ink(g, sp, { w: 3.6, color: C.ink, taper: 0, wobble: 0, weightVar: 0 }); RJ.ink(g, sp, { w: 1.8, color: R.cord, taper: 0, wobble: 0, weightVar: 0 });
      RJ.ink(g, [[l[2], l[3] - 0.5], [l[2] + (i ? 0.4 : -0.4), l[3] + 4]], { w: 3.4, color: '#f4efe4', taper: 0, wobble: 0, weightVar: 0 });
    });
    // the headphone band: a thin violet-edged arc across the collar from cup to cup, in front of the hoodie and tucked behind the chin
    const hb = [[-20, -139], [-12, -132], [2, -128.5], [15, -131.5], [21, -139]];
    RJ.ink(g, hb, { w: 6.2, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, hb, { w: 4.4, color: R.violet, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, hb, { w: 2.4, color: R.phones, taper: 0, wobble: 0, weightVar: 0 });
    // the sampler's strap (mostly hidden by the cups) and the sampler
    [[-14, -140, -19, -114], [16, -140, 22, -114]].forEach((l) => { const sp = [[l[0], l[1]], [(l[0] + l[2]) / 2, (l[1] + l[3]) / 2], [l[2], l[3]]]; RJ.ink(g, sp, { w: 4, color: R.phonesSh, taper: 0, wobble: 0 }); RJ.ink(g, sp, { w: 2, color: R.violet, taper: 0, wobble: 0 }); });
    rcSampler(g, S);
  }
  // headphones' cups and their violet cord: after the arms, so the sleeves never hide them
  function rcOver(g, S) {
    const cord = [[-24, -112], [-31, -106], [-32, -99], [-27, -95]];
    RJ.ink(g, cord, { w: 4, color: R.phonesSh, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, cord, { w: 2.2, color: R.violet, taper: 0, wobble: 0, weightVar: 0 });
    RJ.cel(g, rbox(-28.5, -97.6, 5.4, 4.6, 1), R.phones, { shadow: false, line: LINE.fine, tension: 0 });
    rcCup(g, -22, -125, 0.85, 0.1);
    rcCup(g, 25, -126, 0.78, -0.1);
  }
  function rcSampler(g, S) {
    const x0 = -26, y0 = -112, w = 52, h = 31;
    RJ.cel(g, rbox(x0, y0, w, h, 4.5), R.pad, { shadow: R.padSh, line: LINE.main, depth: 3.5, tension: 0, hi: '#ffffff', hiW: 1.4, hiAlpha: 0.9 });
    // the little screen with the glowing claw mark, and two knobs on the top strip
    RJ.cel(g, rbox(x0 + 3.6, y0 + 2.6, 19, 7.4, 1.6), '#241a46', { shadow: false, line: LINE.fine, tension: 0 });
    rcClaw(g, x0 + 13, y0 + 6.3, 0.62, true);
    led(g, x0 + 31, y0 + 6.2, 2.3, R.violet, 0);
    led(g, x0 + 39, y0 + 6.2, 2.3, '#8f86a8', 0);
    // 4 x 2 pads, lit by the pose
    for (let i = 0; i < 8; i++) {
      const c = i % 4, r = (i / 4) | 0, px = x0 + 3.2 + c * 12, py = y0 + 12.4 + r * 8.8, v = rcPad(S, i);
      RJ.cel(g, rbox(px, py, 9.6, 7.2, 1.8), v > 0.05 ? R.padOn : R.padOff, { shadow: v > 0.05 ? '#c9a8ff' : '#5236a6', line: LINE.fine + 0.1, tension: 0, depth: 2, hi: false });
      if (v > 0.05) { g.save(); g.globalAlpha = clamp(v, 0, 1); g.fillStyle = '#ffffff'; g.beginPath(); g.rect(px + 1.4, py + 1, 6.8, 2.2); g.fill(); g.restore(); tk.glow(g, px + 4.8, py + 3.6, 12, R.violet, 0.75 * v); }
    }
  }
  // attack effect: sound arcs climbing off the pads, short rays that pulse on the beat, a violet bloom and a few pops
  function rcFx(g, S, name) {
    if (name === 'goatnotes') { const h = S.pt.head; RJ.fx.notes(g, h[0] + 56, h[1] - 16, S.t, RJ.accent('rawclaw').main, 3); return; }
    if (name !== 'padfx') return;
    const p = tPt(S, 1, -104), t = S.t, b = S.beat;
    tk.glow(g, p[0], p[1], 42 + 10 * b, R.violet, 0.4 + 0.3 * b, false);
    g.save(); g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const u = fr(t * 1.3 + i / 3), r = 30 + u * 56, a = Math.sin(Math.PI * Math.min(1, u * 1.12)) * 0.95, sp = 0.7 - u * 0.15;
      [0, Math.PI].forEach((dir) => {
        g.globalAlpha = a; g.strokeStyle = C.ink; g.lineWidth = 6.4 - u * 2.2; g.beginPath(); g.arc(p[0], p[1] + 6, r, dir - sp, dir + sp); g.stroke();
        g.strokeStyle = i % 2 ? '#e9dcff' : R.glow; g.lineWidth = 3.8 - u * 1.4; g.beginPath(); g.arc(p[0], p[1] + 6, r, dir - sp, dir + sp); g.stroke();
      });
    }
    g.restore();
    for (let i = 0; i < 5; i++) {
      const an = -Math.PI / 2 + (i - 2) * 0.42, r0 = 16 + 4 * b, r1 = 26 + 12 * b;
      RJ.ink(g, [[p[0] + Math.cos(an) * r0, p[1] + Math.sin(an) * r0], [p[0] + Math.cos(an) * r1, p[1] + Math.sin(an) * r1]], { w: 4.4, color: C.ink, taper: 0.3, wobble: 0, weightVar: 0 });
      RJ.ink(g, [[p[0] + Math.cos(an) * (r0 + 1), p[1] + Math.sin(an) * (r0 + 1)], [p[0] + Math.cos(an) * (r1 - 1), p[1] + Math.sin(an) * (r1 - 1)]], { w: 2.4, color: '#e9dcff', taper: 0.3, wobble: 0, weightVar: 0 });
    }
    RJ.fx.sparkles(g, p[0], p[1], [[-46, -34, 6, 0.2], [48, -38, 7, 0.3], [-30, -62, 4.5, 0], [32, -66, 4, 0.1]], R.glow, t);
  }

  // The five poses plus the portrait pose. The goat shares them but keeps a happier face (it never frowns, it bleats).
  function rcPoses(goat) {
    const cool = goat ? { eyes: 'open', mouth: 'happyOpen', brow: -0.15 } : { eyes: 'open', mouth: 'smile', brow: 0 };
    const P = {
      idle: Object.assign({ mic: 'none', fHand: [3, 44], fBend: -1, fKind: 'fist', fRot: -0.2, bHand: [-1, 44], bBend: 1, bKind: 'fist', bRot: 0.2, bFront: 1, headRot: 0.04, fx: [] }, cool),
      // the goat keeps its big warm eyes wide open while it sings, and its notes float up past the ear tip instead of landing on the ear (see rcFx 'goatnotes')
      sing: { mic: 'mouth', micDx: 14, micDy: 7, micAng: 1.0, fBend: 1, bHand: [8, 36], bBend: 1, bKind: 'fist', bRot: 0.4, bFront: 1, eyes: goat ? 'open' : 'half', mouth: 'beat', brow: goat ? -0.1 : 0.1, headRot: -0.03, fx: [goat ? 'goatnotes' : 'notes'], look: [0.4, 0] },
      attack: { mic: 'none', fHand: [-6, 38], fBend: -1, fKind: 'fist', fRot: -0.4, bHand: [8, 38], bBend: 1, bKind: 'fist', bRot: 0.4, bFront: 1, lean: 0.08, torsoRot: 0.05, headRot: 0.08, headDx: 3,
        fFoot: [32, -12], bFoot: [-24, -12], eyes: goat ? 'open' : 'determined', mouth: goat ? 'grin' : 'beat', brow: goat ? 0.2 : 0.4, fx: ['padfx'], look: [0.5, 0.2] },
      hurt: { mic: 'none', fHand: [30, -4], fBend: -1, fKind: 'open', fSpread: 1.3, fRot: 0.2, bHand: [-34, -10], bBend: 1, bKind: 'open', bSpread: 1.3, lean: -0.13, torsoRot: -0.08, headRot: -0.14, headDx: -3,
        fFoot: [12, -12], bFoot: [-20, -12], eyes: 'hurt', mouth: 'ow', brow: -0.7, sweat: 1, blush: 0.6, fx: ['stars'] },
      cheer: { mic: 'none', fHand: [30, -40], fBend: 1, fKind: 'fist', fRot: -0.1, bHand: [-30, -40], bBend: -1, bKind: 'fist', bRot: 0.1, eyes: 'happy', mouth: goat ? 'happyOpen' : 'grin', brow: -0.2, headRot: 0.04,
        fFoot: [20, -12], bFoot: [-18, -12], fx: ['sparkles'] },
      // the portrait pose: both hands low so no stray fist shows at the edge of the head-and-shoulders crop
      bust: Object.assign({ mic: 'none', fHand: [12, 58], fBend: -1, fKind: 'fist', fRot: -0.2, bHand: [-12, 58], bBend: 1, bKind: 'fist', bRot: 0.2, bFront: 1, headRot: 0.03, fx: [] }, cool),
    };
    return P;
  }

  function makeRawclaw(goat) {
    return {
      id: goat ? 'rawclaw_goat' : 'rawclaw',
      accent: 'rawclaw',
      skel: { neck: [0, -150], headC: [2, -208], shF: [26, -135], shB: [-26, -135], hip: [0, -78] },
      base: {},
      poses: rcPoses(goat),
      face: rcFaceSpec(goat),
      exprs: { smirk: { eyes: 'open', mouth: 'smirk', brow: 0.15 } },
      arm: { l: [26, 24], w: [21, 18], skin: R.jacket, skinSh: R.jacketSh, cuff: { color: R.hood, light: R.hoodSh }, hand: { skin: R.skin, shade: R.skinSh } },
      legs: {
        w: [31, 24], color: R.pants, shade: R.pantsSh, pantsOver: true, bow: 2,
        shoe: { color: '#f4efff', sole: '#c3a9ff', shade: '#ddd2f4', toeCap: '#8b4dff', accent: '#8b4dff', hi: '#ffffff', k: 1.2 },
        decor(g, hip, an) {
          const dx = an[0] - hip[0], dy = an[1] - hip[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux, qx = an[0] - ux * 7, qy = an[1] - uy * 7;
          RJ.ink(g, [[qx - nx * 9, qy - ny * 9], [qx + nx * 9, qy + ny * 9]], { w: 1.5, color: C.ink, taper: 0.2, wobble: 0 });
          const mx = (hip[0] + an[0]) / 2, my = (hip[1] + an[1]) / 2;
          RJ.ink(g, [[mx - nx * 4, my - ny * 4], [mx - nx * 10 + ux * 2, my - ny * 10 + uy * 2]], { w: 1.4, color: R.pantsSh, taper: 0.5, wobble: 0 });
          RJ.ink(g, [[qx - ux * 4 - nx * 8, qy - uy * 4 - ny * 8], [qx - ux * 4 + nx * 8, qy - uy * 4 + ny * 8]], { w: 2, color: R.violet, taper: 0.1, wobble: 0, alpha: 0.95 });
        },
      },
      mic: { accent: R.violet, headR: 10, len: 40, bands: 2 },
      bounds: goat ? { h: 337, x0: -150, x1: 143 } : { h: 336, x0: -131, x1: 137 },       // the silhouette over all five poses (the hurt lean, the attack reach, the goat's ears), not the effects
      bust: goat ? { rect: [-136, -324, 134, -96], face: [-110, -318, 112, -142], pose: 'bust' } : { rect: [-92, -324, 88, -92], face: [-76, -318, 78, -146], pose: 'bust' },
      layers: { backHair: rcNape, torso: rcTorso, head: goat ? gtHead : rcHead, over: rcOver, fx: rcFx },
      // the hands drum the pads: alternate hits in the attack, a lazy tap of the back hand while he beatboxes
      tweak(P, t) {
        if (P.pose === 'attack') {
          const f = Math.pow(Math.abs(Math.sin(Math.PI * t * 2.6)), 3), k = Math.pow(Math.abs(Math.sin(Math.PI * (t * 2.6 + 0.5))), 3);
          P.fHand = [P.fHand[0], P.fHand[1] - 11 * (1 - f)]; P.bHand = [P.bHand[0], P.bHand[1] - 11 * (1 - k)];
        } else if (P.pose === 'sing') {
          const k = Math.pow(Math.abs(Math.sin(Math.PI * t * 2)), 3);
          P.bHand = [P.bHand[0], P.bHand[1] - 7 * (1 - k)];
        }
      },
    };
  }
  RJ.register('rawclaw', crewRig(makeRawclaw(false)));
  RJ.register('rawclaw_goat', crewRig(makeRawclaw(true)));
  // ================================================================================================================================================
  // ANDY: the groovy bass player. Shaggy hair, orange headband, retro striped tee, bell-bottoms, sunburst bass on a strap, loop pedal with a green LED.
  // ================================================================================================================================================
  const A = {
    hair: '#7a4423', hairSh: '#4b2711', hairHi: '#bd7d48',
    band: '#ff8a1f', bandSh: '#d4640a', bandHi: '#ffc07a', bandDk: '#a84a05',
    tee: '#ff9a35', teeSh: '#e17714', teeHi: '#ffca8c', cream: '#fff0d4', creamSh: '#ecd2a4',
    pants: '#7a533a', pantsSh: '#523523', pantsHi: '#9c7253',
    bass: '#ffcb42', bassMid: '#ff8f1f', bassEdge: '#b93a0c', bassHi: '#fff0a8', pick: '#fff2d2', pickSh: '#e4d0a2',
    wood: '#ecc88e', woodSh: '#c99a58', board: '#3a2214', metal: '#dfe2ec', metalSh: '#9da1b4',
    strap: '#82512e', strapSh: '#57331c', stitch: '#f3d39e',
    iris: ['#3b220f', '#966030'],
    ped: '#2f2b38', pedSh: '#1b1822', led: '#59ff7e', glow: '#ffb45e', light: '#fff0d4',
  };
  const AN_SKULL = RJ.skullPts({ w: 1.03, chin: 2 });
  const AN_HAIR = [[-66, 12], [-74, -14], [-72, -40], [-60, -62], [-47, -76], [-37, -90, 1], [-27, -82], [-12, -89], [-4, -102, 1], [6, -89], [16, -91], [27, -100, 1], [35, -85], [47, -78], [58, -63], [66, -40], [67, -16], [63, 4, 1],
    [54, -4], [51, -22], [44, -34], [34, -40], [20, -44], [4, -46], [-12, -45], [-28, -40], [-40, -28], [-44, -8], [-45, 14], [-47, 34, 1], [-55, 26]];
  const AN_BACK = [[-56, -22], [-74, -4], [-82, 16], [-78, 38], [-69, 50, 1], [-60, 38], [-52, 26], [-52, 4]];
  const AN_BAND = [[-70, -14], [-62, -28], [-48, -39], [-28, -46], [-4, -48], [22, -46], [44, -40], [58, -30]];

  function anHair(g, S) {
    RJ.cel(g, AN_HAIR, A.hair, { shadow: false, line: LINE.main + 0.2, tension: 0.8, weightVar: 0.3, decor: (gg) => {
      RJ.fillPts(gg, [[-74, -6], [-66, 14], [-55, 26], [-47, 34], [-45, 14], [-43, -4], [-52, -30], [-70, -40]], A.hairSh, 0.5);
      RJ.fillPts(gg, [[-26, -80], [0, -85], [28, -81], [44, -72], [20, -66], [-6, -68], [-34, -66]], A.hairHi, 0.5);
      const flow = [[[6, -40], [22, -58], [44, -72], [62, -60]], [[4, -40], [-10, -58], [-32, -72], [-62, -58]], [[-40, -30], [-56, -20], [-66, 0]], [[20, -40], [38, -46], [54, -36]], [[-8, -42], [-24, -48], [-42, -42]]];
      flow.forEach((l, i) => RJ.ink(gg, l, { w: 1.4, color: A.hairSh, taper: 0.5, wobble: 0.02, alpha: 0.95, seed: i }));
      strokes(gg, [[-10, -76, -6, -68], [-4, -78, 0, -70], [4, -78, 8, -70], [20, -74, 24, -66], [32, -70, 36, -62], [-26, -72, -22, -64], [-60, -34, -56, -26], [-66, -12, -62, -4], [58, -44, 60, -36]], { color: A.hairHi, w: 1.3, alpha: 0.95 });
    } });
    
  }
  function anBand(g, S) {
    const sw = S.P.hairSwing;
    // the knot's two tails sway behind the head
    [[[-68, -14], [-82, -6], [-94, 8]], [[-68, -14], [-86, -18], [-100, -14]]].forEach((sp, i) => RJ.lock(g, sp, A.band, { wMax: 10, w0: 9, w1: 3, tipPow: 1.0, bend: sw * 0.35 * (i ? -1 : 1), gloss: false, strands: 0, shadow: A.bandSh, line: LINE.main }));
    tk.ribbon(g, AN_BAND, A.band, { wMax: 12, w0: 12, w1: 12, profile: () => 1, cap: 'flat', gloss: false, strands: 0, shadow: A.bandSh, shadowW: 0.4, line: LINE.main, lineColor: C.ink, wobble: 0.03 });
    [0.15, 0.33, 0.5, 0.67, 0.85].forEach((u) => { const i = Math.min(AN_BAND.length - 2, Math.floor(u * (AN_BAND.length - 1))), k = u * (AN_BAND.length - 1) - i, x = lerp(AN_BAND[i][0], AN_BAND[i + 1][0], k), y = lerp(AN_BAND[i][1], AN_BAND[i + 1][1], k); g.beginPath(); g.arc(x, y, 1.5, 0, TAU); g.fillStyle = A.cream; g.fill(); });
    RJ.cel(g, tk.ellipsePts(-67, -15, 6.5, 6, 10), A.band, { shadow: A.bandSh, line: LINE.mid, depth: 2, hi: A.bandHi, hiW: 1.2 });
  }
  function anBack(g, S) {
    g.save(); g.translate(-56, -10); g.rotate(S.P.hairSwing * 0.04); g.translate(56, 10);
    RJ.cel(g, AN_BACK, A.hair, { shadow: A.hairSh, line: LINE.main, depth: 5, tension: 0.8, hi: A.hairHi, hiW: 1.4, hiAlpha: 0.5 });
    g.restore();
  }
  function anHead(g, S) {
    headBase(g, S, { skull: AN_SKULL, cast: [[-58, -34], [-30, -48], [0, -50], [30, -48], [56, -34], [50, -16], [20, -38], [-10, -38], [-40, -16]], castDy: 6, under: (gg) => {
      // a flat beard shadow along the jaw, in the same hard-edged cel as the skin shade
      gg.beginPath(); tk.trace(gg, [[-47, 30], [-34, 44], [-14, 54], [4, 57], [24, 55], [44, 44], [56, 28], [60, 50], [30, 70], [-10, 70], [-40, 62]], 0, 0, 0.5); gg.fillStyle = '#dca383'; gg.globalAlpha = 0.75; gg.fill();
    } });
    anHair(g, S);
    anBand(g, S);
    RJ.cel(g, [[44, -46], [56, -48], [64, -36], [67, -16], [63, 4, 1], [54, -4], [51, -22], [47, -34]], A.hair, { shadow: false, line: LINE.main, tension: 0.6, depth: 2, decor: (gg) => { strokes(gg, [[[56, -42], [60, -26], [58, -10]], [[50, -40], [54, -24]]], { color: A.hairSh, w: 1.3, alpha: 0.9 }); } });
    RJ.ear(g, -53, 27, { r: 13.5, side: -1 });
  }

  function anFaceSpec() {
    return {
      eyes: [{ x: -13, y: 17, w: 30, h: 28 }, { x: 39, y: 14, w: 25, h: 26 }],
      brows: [[-14, -9, 28], [44, -9, 25]],
      browStyle: { thick: 5.4, arch: 0.45, tilt: -0.05, color: '#432511' },
      nose: [26, 32, 60],
      mouth: [8, 44, 25],
      mouthStyle: { lineW: 1.5, inner: '#b03a4a', tongue: '#f27c8e' },
      blush: [[-18, 36, 21], [38, 34, 18]],
      sweat: [57, -8, 5],
      eye: { iris: A.iris, ring: '#26140a', sclera: '#fffbf4', expr: 'neutral', irisW: 0.72, irisH: 0.96, lid: 2.0, wing: 0.5, lash: 1.0, crease: true, lashes: 0, tilt: -0.04, drop: 0, hl: [[-0.4, -0.5, 0.26], [-0.34, -0.14, 0.12]] },
    };
  }

  // ---- the bass in its own frame: origin at the body centre, +x along the neck, rotated so the neck rises to the right ----
  const AN_ANG = 0.4, AN_C = [-2, -94];
  const bassPt = (lx, ly) => [AN_C[0] + lx * Math.cos(AN_ANG) + ly * Math.sin(AN_ANG), AN_C[1] - lx * Math.sin(AN_ANG) + ly * Math.cos(AN_ANG)];
  const AN_BODY = [[48, -18, 1], [41, -27], [22, -36], [-5, -40], [-33, -36], [-50, -21], [-55, 3], [-50, 22], [-33, 35], [-7, 39], [15, 34], [28, 27], [35, 25, 1], [33, 10], [29, 0], [33, -8]];
  const AN_NECK = 118, AN_BRIDGE = -33;
  function anBass(g, S) {
    // the strap over the shoulder to the upper horn
    const sp = [[-17, -152], [-3, -140], [15, -128], [34, -118]];
    RJ.ink(g, sp, { w: 9, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, sp, { w: 6.4, color: A.strap, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, sp.map((p) => [p[0] + 0.6, p[1] + 2.2]), { w: 1.3, color: A.stitch, taper: 0, wobble: 0, weightVar: 0, alpha: 0.9 });
    g.save(); g.translate(AN_C[0], AN_C[1]); g.rotate(-AN_ANG);
    // neck (maple with a dark fretboard) and the headstock
    const N = AN_NECK;
    RJ.cel(g, [[22, -5.2], [N, -4.4], [N, 4.4], [22, 5.2]], A.wood, { shadow: A.woodSh, line: LINE.main, tension: 0, depth: 2.4 });
    g.beginPath(); g.moveTo(24, -3.8); g.lineTo(N, -3); g.lineTo(N, 3); g.lineTo(24, 3.8); g.closePath(); g.fillStyle = A.board; g.fill();
    for (let x = 34, k = 0; x <= N - 6; x += 10.5 - k * 0.35, k++) RJ.ink(g, [[x, -3.6 + k * 0.05], [x, 3.6 - k * 0.05]], { w: 0.95, color: '#e9dcc0', taper: 0, wobble: 0, weightVar: 0 });
    [56, 78].forEach((x) => { g.beginPath(); g.arc(x, 0, 1.25, 0, TAU); g.fillStyle = A.cream; g.fill(); });
    RJ.cel(g, [[N - 2, -5], [N + 4, -8], [N + 17, -8.6], [N + 20, -1.5], [N + 17, 6.6], [N + 4, 6.6], [N - 2, 4.4]], A.wood, { shadow: A.woodSh, line: LINE.main, tension: 0.3, depth: 2.2, hi: '#f8e2b8', hiW: 1.1 });
    [[N + 6, 8], [N + 11, 8.3], [N + 16, 7.6]].forEach((p) => { RJ.cel(g, tk.circlePts(p[0], p[1] + 1.2, 2.3, 8), A.metal, { shadow: A.metalSh, line: LINE.fine + 0.2, depth: 1 }); });
    // the body, a sunburst: dark red edge, orange middle
    RJ.cel(g, AN_BODY, A.bass, { shadow: '#f0a01f', line: LINE.main + 0.2, tension: 0.6, depth: 6, hi: A.bassHi, hiW: 2.2, decor: (gg) => {
      gg.lineJoin = 'round';
      gg.beginPath(); tk.trace(gg, AN_BODY, 0, 0, 0.6); gg.lineWidth = 27; gg.strokeStyle = A.bassMid; gg.globalAlpha = 0.9; gg.stroke();
      gg.beginPath(); tk.trace(gg, AN_BODY, 0, 0, 0.6); gg.lineWidth = 12; gg.strokeStyle = A.bassEdge; gg.globalAlpha = 0.95; gg.stroke();
    } });
    // pickguard, two pickups, bridge, knobs
    RJ.cel(g, [[20, 3], [14, -11], [-4, -20], [-26, -17], [-37, 0], [-32, 17], [-12, 23], [10, 16]], A.pick, { shadow: A.pickSh, line: LINE.fine + 0.2, depth: 2.4, tension: 0.6 });
    [[-4, -12, 9, 24], [-21, -11, 8, 22]].forEach((r) => {
      RJ.cel(g, rbox(r[0], r[1], r[2], r[3], 2), '#26212c', { shadow: false, line: LINE.fine + 0.2, tension: 0 });
      for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(r[0] + r[2] / 2, r[1] + 4 + i * (r[3] - 8) / 3, 1.2, 0, TAU); g.fillStyle = '#c8c5d2'; g.fill(); }
    });
    RJ.cel(g, rbox(AN_BRIDGE - 3, -11, 7, 22, 1.5), A.metal, { shadow: A.metalSh, line: LINE.fine + 0.2, tension: 0, depth: 1.5 });
    [[-19, 28], [-31, 25]].forEach((p) => RJ.cel(g, tk.circlePts(p[0], p[1], 3.6, 8), '#2a2430', { shadow: false, line: LINE.fine + 0.2, rim: '#8b86a0', rimW: 1, rimSide: 'light' }));
    RJ.cel(g, tk.circlePts(43, -17, 2.4, 8), A.metal, { shadow: A.metalSh, line: LINE.fine, depth: 1 });
    // four strings from the bridge to the nut
    for (let i = 0; i < 4; i++) RJ.ink(g, [[AN_BRIDGE, -4.8 + i * 3.2], [N, -2.5 + i * 1.7]], { w: 1.0, color: '#f3eee0', taper: 0, wobble: 0, weightVar: 0, alpha: 0.95 });
    g.restore();
  }
  function anTorso(g, S) {
    RJ.neck(g, 2, -156, { w: 22, h: 22 });
    RJ.cel(g, [[-14, -151], [14, -151], [32, -146], [37, -131], [37, -106], [40, -78, 1], [-40, -78, 1], [-37, -106], [-37, -131], [-32, -146]], A.tee, { shadow: A.teeSh, line: LINE.main, depth: 8, hi: A.teeHi, hiW: 1.6, hiAlpha: 0.7, tension: 0.5, decor: (gg) => {
      gg.beginPath(); gg.rect(-45, -128, 90, 8); gg.fillStyle = A.cream; gg.fill();
      gg.beginPath(); gg.rect(-45, -113, 90, 3); gg.fillStyle = A.cream; gg.fill();
      RJ.ink(gg, [[-45, -128], [45, -128]], { w: 1.1, color: A.creamSh, taper: 0, wobble: 0, alpha: 0.9 });
    } });
    RJ.cel(g, [[-15, -152], [-9, -143], [0, -141], [9, -143], [15, -152], [11, -151], [7, -147], [0, -145], [-7, -147], [-11, -151]], A.cream, { shadow: A.creamSh, line: LINE.mid, depth: 2 });
    anBass(g, S);
  }

  // loop pedal on the ground with a flashing green LED, and the cable from the bass to it (figure space, drawn last)
  function anPedal(g, S) {
    const x = -70, y = 0, t = S.t, on = S.P.pose === 'sing' || S.P.pose === 'attack' ? Math.abs(Math.sin(Math.PI * t * 2)) : 0.7 + 0.3 * Math.sin(t * 2.4);
    const jp = bassPt(-19, 36), j = tPt(S, jp[0], jp[1]);
    const cable = [[j[0], j[1]], [j[0] - 10, j[1] + 26], [x + 12, y - 28], [x + 10, y - 17]];
    RJ.ink(g, cable, { w: 3.6, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, cable, { w: 1.9, color: '#4a4558', taper: 0, wobble: 0, weightVar: 0 });
    g.save(); g.fillStyle = 'rgba(20,6,40,0.28)'; g.beginPath(); g.ellipse(x + 2, y + 2, 25, 6, 0, 0, TAU); g.fill(); g.restore();
    RJ.cel(g, [[x - 17, y - 15], [x + 17, y - 15], [x + 19, y - 1, 1], [x - 19, y - 1, 1]], A.ped, { shadow: A.pedSh, line: LINE.main, tension: 0, depth: 3 });
    RJ.cel(g, [[x - 14, y - 28], [x + 16, y - 28], [x + 19, y - 15, 1], [x - 17, y - 15, 1]], A.band, { shadow: A.bandSh, line: LINE.main, tension: 0, depth: 3, hi: A.bandHi, hiW: 1.4 });
    RJ.cel(g, tk.ellipsePts(x + 1, y - 21, 8, 3.8, 12), A.metal, { shadow: A.metalSh, line: LINE.fine + 0.2, depth: 1.5, hi: false });
    [[-9, -25.5], [10, -25.5]].forEach((p) => { g.beginPath(); g.arc(x + p[0], y + p[1], 1.9, 0, TAU); g.fillStyle = '#2a2430'; g.fill(); });
    led(g, x - 11, y - 22.5, 2.4, A.led, 12, 0.35 + 0.55 * on);
    strokes(g, [[x - 11, y - 9, x + 11, y - 9]], { color: A.cream, w: 2, taper: 0.1 });
  }
  function anFx(g, S, name) {
    const t = S.t;
    if (name === 'prop') { anPedal(g, S); return; }
    if (name === 'bassnotes') { const hp = bassPt(AN_NECK + 12, -22), p = tPt(S, hp[0], hp[1]); RJ.fx.notes(g, p[0] - 22, p[1] - 6, t, A.band, 3); return; }
    if (name === 'bassfx') {
      // the slap: fat sound rings spreading from the body, a chunky note popping out, a small burst on the strings at the hit
      const cp = bassPt(-4, 0), c = tPt(S, cp[0], cp[1]), a = fr(t * 2.6), b = S.beat;
      tk.glow(g, c[0], c[1], 40 + 12 * b, A.glow, 0.22 + 0.2 * b, false);
      g.save(); g.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        const age = a + k, r = 16 + age * 34, al = Math.max(0, 1 - age / 2.8);
        g.globalAlpha = al;
        g.strokeStyle = C.ink; g.lineWidth = 8.4 - age * 1.4; g.beginPath(); g.ellipse(c[0], c[1], r, r * 0.86, -AN_ANG, 0, TAU); g.stroke();
        g.strokeStyle = k % 2 ? '#ffd9a8' : A.band; g.lineWidth = 5.6 - age * 1.0; g.beginPath(); g.ellipse(c[0], c[1], r, r * 0.86, -AN_ANG, 0, TAU); g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(c[0], c[1], r - 1.2, r * 0.86 - 1.2, -AN_ANG, 3.7, 4.7); g.stroke();
      }
      g.restore();
      // one chunky note per slap, floating off the headstock side so it never crosses the face
      const nk = fr(t * 2.6 / 2), hp = bassPt(AN_NECK + 6, -16), hq = tPt(S, hp[0], hp[1]), nx = hq[0] + 8 + nk * 16, ny = hq[1] - 10 - nk * 40;
      tk.note(g, nx, ny, 21 + 6 * nk, { kind: 'eighth', color: C.ink, alpha: 1 - nk, line: 5.2 });
      tk.note(g, nx, ny, 17 + 5 * nk, { kind: 'eighth', color: A.band, alpha: 1 - nk });
      if (b > 0.35) RJ.fx.burst(g, c[0] + 12, c[1] - 26, 8 + 8 * b, A.band, A.light, t);
    }
  }

  function anPoses() {
    const easy = { eyes: 'open', mouth: 'happyOpen', brow: -0.15 };
    return {
      idle: Object.assign({ mic: 'none', fHand: [33, 22], fBend: 1, fKind: 'fist', fRot: -0.25, bHand: [20, 42], bBend: 1, bKind: 'relaxed', bRot: 0.3, bFront: 1, headRot: 0.03, fx: ['prop'] }, easy),
      sing: { mic: 'none', fHand: [35, 19], fBend: 1, fKind: 'fist', fRot: -0.25, bHand: [20, 42], bBend: 1, bKind: 'relaxed', bRot: 0.3, bFront: 1, eyes: 'happy', mouth: 'grin', brow: -0.2, headRot: -0.05, bFoot: [-40, -12], fx: ['prop', 'bassnotes'] },
      attack: { mic: 'none', fHand: [35, 19], fBend: 1, fKind: 'fist', fRot: -0.25, bHand: [20, 42], bBend: 1, bKind: 'fist', bRot: 0.5, bFront: 1, lean: 0.05, torsoRot: 0.03, headRot: 0.06, headDx: 2,
        fFoot: [30, -12], bFoot: [-26, -12], eyes: 'open', mouth: 'grin', brow: 0.45, fx: ['prop', 'bassfx'] },
      hurt: { mic: 'none', fHand: [30, 0], fBend: -1, fKind: 'open', fSpread: 1.3, fRot: 0.2, bHand: [-34, -12], bBend: 1, bKind: 'open', bSpread: 1.3, lean: -0.13, torsoRot: -0.08, headRot: -0.14, headDx: -3,
        fFoot: [12, -12], bFoot: [-20, -12], eyes: 'hurt', mouth: 'ow', brow: -0.7, sweat: 1, blush: 0.6, fx: ['prop', 'stars'] },
      cheer: { mic: 'none', fHand: [30, -42], fBend: 1, fKind: 'fist', fRot: -0.1, bHand: [-36, -36], bBend: -1, bKind: 'open', bSpread: 1.4, bRot: 0.3, eyes: 'happy', mouth: 'happyOpen', brow: -0.2, headRot: 0.05,
        fFoot: [20, -12], bFoot: [-18, -12], fx: ['prop', 'sparkles'] },
      // the portrait pose: both hands low and close to the bass body, so no stray hand sits at the edge of the head-and-shoulders crop
      bust: Object.assign({ mic: 'none', fHand: [22, 50], fBend: 1, fKind: 'fist', fRot: -0.25, bHand: [8, 54], bBend: 1, bKind: 'fist', bRot: 0.35, bFront: 1, headRot: 0.03, fx: [] }, easy),
    };
  }

  const anSpec = {
    id: 'andy',
    accent: 'andy',
    skel: {},
    base: {},
    poses: anPoses(),
    life: { idle: { bob: 1.8, per: 1.7, sway: 0.03, head: 0.04 }, sing: { bob: 2.0, per: 1.1, sway: 0.04, head: 0.06, beat: 0.5, beatHz: 2 } },
    face: anFaceSpec(),
    exprs: { smirk: { eyes: 'open', mouth: 'smirkTeeth', brow: 0.3 } },
    arm: { l: [26, 24], w: [19, 15], skin: C.skin, skinSh: C.skinSh, sleeve: { color: A.tee, shade: A.teeSh, len: 0.8, w0: 24, w1: 28, hi: false }, cuff: { color: A.cream, light: A.creamSh }, hand: { skin: C.skin, shade: C.skinSh } },
    legs: {
      w: [34, 34], color: A.pants, shade: A.pantsSh, pantsOver: true, bow: 2, profile: (u) => 0.78 + 0.36 * u * u,
      shoe: { color: A.cream, sole: '#ffd9a0', shade: A.creamSh, toeCap: A.band, accent: A.band, hi: '#ffffff', k: 1.2 },
      decor(g, hip, an) {
        const dx = an[0] - hip[0], dy = an[1] - hip[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux;
        RJ.ink(g, [[hip[0] + ux * 10 + nx * 2, hip[1] + uy * 10 + ny * 2], [an[0] - ux * 6 + nx * 2, an[1] - uy * 6 + ny * 2]], { w: 1.3, color: A.pantsHi, taper: 0.4, wobble: 0, alpha: 0.9 });
        const qx = an[0] - ux * 5, qy = an[1] - uy * 5;
        RJ.ink(g, [[qx - nx * 16, qy - ny * 16], [qx + nx * 16, qy + ny * 16]], { w: 1.5, color: C.ink, taper: 0.2, wobble: 0 });
      },
    },
    mic: { accent: A.band },
    bounds: { w: 260, h: 316 },
    bust: { rect: [-95.5, -312, 84.5, -72], face: [-80, -308, 76, -138], pose: 'bust' },
    layers: { backHair: anBack, torso: anTorso, head: anHead, fx: anFx },
    // the slap: the plucking hand lifts between hits and comes down on the beat; in the groove it bobs a little and the back foot taps the pedal
    tweak(P, t) {
      if (P.pose === 'attack') {
        const b = P.beat;
        P.bHand = [P.bHand[0] - 4 * (1 - b), P.bHand[1] - 21 * (1 - b)];
        P.bKind = b > 0.45 ? 'fist' : 'relaxed';
      } else if (P.pose === 'sing') {
        const k = Math.pow(Math.abs(Math.sin(Math.PI * t * 2)), 2);
        P.bHand = [P.bHand[0], P.bHand[1] - 4 * (1 - k)];
        P.bFoot = [P.bFoot[0], P.bFoot[1] - 8 * Math.pow(Math.max(0, Math.sin(Math.PI * t * 2)), 2)];
      }
    },
  };
  RJ.register('andy', crewRig(anSpec));
  // ================================================================================================================================================
  // 'jordan': the virtual assistant who draws the graphics and runs the merch shop. Black wavy shoulder-length hair parted in the middle, round thin dark glasses,
  // a slim build in a black tee with a small round pale blue badge and black pants, black bracelets on one wrist and a blue-faced watch on the other, a small
  // pendant on a cord. The teal accent lives in the merch tote with its strap and in the tablet's case. Calm, creative, friendly.
  // ================================================================================================================================================
  const J = {
    hair: '#3a3144', hairSh: '#1e1727', hairHi: '#7d6f93', hairHi2: '#a396b8',
    skin: '#f1c59c', skinSh: '#dea577',
    tee: '#322f3d', teeSh: '#1d1b26', teeHi: '#5a5470', rib: '#4a4658',
    pants: '#2c2a37', pantsSh: '#1a1822', pantsHi: '#4c4860',
    badge: '#c9f1ec', badgeSh: '#94d6d0', badgeHi: '#f1fffd',
    teal: '#1fc4bd', tealSh: '#0f8e92', tealDk: '#0b6568', tealHi: '#7be8de',
    frame: '#2b2630', frameHi: '#7b7592',
    watch: '#2b2935', watchRim: '#6c6682', face: '#2f7be8', faceHi: '#9ccbff', strap: '#26232f',
    metal: '#d9dce6', metalSh: '#9da1b4',
    screen: '#e9fffb', screenDk: '#9fe6df', bezelHi: '#5fe0d8',
    tee2: '#ff9fbc', tee2Sh: '#e57a9c', logoG: '#76c02f', gold: '#ffd36b',
    iris: ['#2a170e', '#6a4128'],
  };
  const JD_SKULL = RJ.skullPts({ w: 0.98, chin: 3 });
  // the hair frames the face like curtains: a part at x = 14, the hairlines arch down from it to the temples, the sides fall past the jaw into wavy ends that rest on
  // the shoulders. Sharp points [x, y, 1] are the tips of the waves.
  const JD_FRONT = [[12, -71], [28, -70], [44, -64], [55, -52], [62, -34], [65, -14], [64, 4], [68, 20], [65, 36], [70, 52], [76, 63], [80, 66, 1], [71, 72, 1], [66, 70], [63, 79, 1],
    [56, 62], [55, 40], [57, 18], [56, -4], [53, -20], [46, -30], [36, -38], [26, -43], [18, -46], [14, -46, 1],
    [6, -45], [-5, -42], [-16, -36], [-27, -27], [-35, -16], [-39, -2], [-40, 14], [-41, 30], [-44, 46], [-47, 60], [-49, 72, 1], [-55, 64, 1], [-60, 79, 1], [-66, 68, 1],
    [-67, 56], [-76, 40], [-68, 21], [-77, 2], [-71, -16], [-66, -34], [-54, -52], [-36, -64], [-14, -70]];
  // the curtain strands: arcs from the part round the skull on both sides, and the lines that separate the long fronts from the rest
  const JD_FLOW = [[[14, -69], [-8, -62], [-30, -46], [-48, -20], [-57, 8]], [[14, -69], [34, -62], [50, -44], [58, -18], [62, 12]],
    [[8, -56], [-12, -50], [-30, -34], [-42, -8]], [[22, -58], [38, -52], [50, -36], [56, -12]],
    [[-34, -22], [-38, 0], [-40, 24], [-45, 50]], [[-52, 16], [-58, 34], [-56, 50], [-62, 68]], [[58, 14], [64, 30], [62, 46], [68, 62]], [[-30, 24], [-34, 44], [-40, 62]], [[-46, 40], [-50, 56], [-48, 70]], [[60, 42], [62, 56], [66, 70]]];
  const JD_HI = [[[-4, -68], [14, -71], [34, -68], [48, -60], [46, -63], [32, -66], [14, -67], [-2, -64]], [[-56, -26], [-64, -6], [-68, 14], [-65, 14], [-60, -6], [-53, -24]],
    [[62, -22], [67, -2], [66, 12], [63, 10], [63, -4], [59, -20]]];
  // the mass behind the head and shoulders: the back of the long hair with its own wavy ends
  const JD_BACK = [[-24, -67], [-48, -58], [-64, -36], [-72, -8], [-70, 22], [-68, 44], [-72, 64], [-71, 80, 1], [-60, 72], [-50, 85, 1], [-38, 74], [-20, 82], [0, 86, 1], [18, 78], [34, 84, 1], [48, 74],
    [60, 83, 1], [67, 64], [69, 40], [68, 12], [66, -16], [58, -42], [44, -60], [26, -69], [0, -72]];
  const JD_CAST = [[-35, -16], [-27, -27], [-16, -36], [-5, -42], [6, -45], [14, -46], [18, -46], [26, -43], [36, -38], [46, -30], [53, -20], [53, -14], [46, -24], [36, -32], [26, -37], [18, -40], [14, -40], [6, -39], [-5, -36], [-16, -30], [-27, -21], [-35, -10]];

  function jdBack(g, S) {
    g.save(); g.translate(0, -50); g.rotate(S.P.hairSwing * 0.025); g.translate(0, 50);
    RJ.cel(g, JD_BACK, J.hair, { shadow: J.hairSh, line: LINE.main, depth: 6, tension: 0.8, hi: J.hairHi, hiW: 1.5, hiAlpha: 0.5, decor: (gg) => {
      [[[-60, 10], [-66, 34], [-64, 56]], [[-40, 50], [-42, 66]], [[44, 40], [48, 60]], [[62, 12], [68, 40], [66, 58]]].forEach((l, i) => RJ.ink(gg, l, { w: 1.3, color: J.hairSh, taper: 0.5, wobble: 0.02, alpha: 0.9, seed: i }));
    } });
    g.restore();
  }
  function jdHair(g, S) {
    RJ.cel(g, JD_FRONT, J.hair, { shadow: J.hairSh, line: LINE.main + 0.2, depth: 7, tension: 0.8, weightVar: 0.32, decor: (gg) => {
      JD_HI.forEach((f) => RJ.fillPts(gg, f, J.hairHi, 0.6));
      RJ.ink(gg, [[18, -65.5], [30, -64.5], [43, -59.5], [53, -49], [59, -34], [62, -16], [62, 2]], { w: 1.5, color: J.teal, taper: 0.55, wobble: 0, alpha: 0.6 });      // the teal rim light on the lit edge
      JD_FLOW.forEach((l, i) => RJ.ink(gg, l, { w: 1.4, color: J.hairSh, taper: 0.5, wobble: 0.02, alpha: 0.95, seed: i }));
      strokes(gg, [[0, -66, -4, -59], [8, -68, 5, -60], [24, -66, 28, -58], [36, -62, 41, -54], [-18, -62, -22, -54], [-36, -50, -39, -42], [52, -44, 55, -36], [-62, -16, -64, -8], [64, -8, 66, 0]], { color: J.hairHi2, w: 1.25, alpha: 0.85 });
    } });
    // the part itself: a fine light line from the crown to the hairline
    RJ.ink(g, [[14, -70], [14, -58], [14, -47]], { w: 1.4, color: J.hairHi, taper: 0.5, wobble: 0, alpha: 0.85 });
  }
  function jdGlasses(g, S) {
    const lens = [[-10, 19, 18.5, 18], [38, 17, 16.4, 17.6]];
    // the near temple arm runs back to where the ear is hidden in the hair
    const arm = [[-29, 13], [-40, 13], [-52, 17]];
    RJ.ink(g, arm, { w: 3, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, arm, { w: 1.3, color: J.frame, taper: 0, wobble: 0, weightVar: 0 });
    lens.forEach((l) => {
      g.beginPath(); g.ellipse(l[0], l[1], l[2], l[3], 0, 0, TAU); g.fillStyle = 'rgba(200,225,245,0.14)'; g.fill();
      g.lineWidth = 2.5; g.strokeStyle = C.ink; g.beginPath(); g.ellipse(l[0], l[1], l[2], l[3], 0, 0, TAU); g.stroke();
      g.lineWidth = 1.15; g.strokeStyle = J.frame; g.beginPath(); g.ellipse(l[0], l[1], l[2], l[3], 0, 0, TAU); g.stroke();
      g.lineWidth = 0.9; g.strokeStyle = J.frameHi; g.beginPath(); g.ellipse(l[0], l[1], l[2], l[3], 0, 3.7, 4.6); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(l[0] + l[2] * 0.42, l[1] - l[3] * 0.64); g.lineTo(l[0] + l[2] * 0.68, l[1] - l[3] * 0.3); g.stroke();
      g.beginPath(); g.moveTo(l[0] + l[2] * 0.76, l[1] - l[3] * 0.14); g.lineTo(l[0] + l[2] * 0.8, l[1] - l[3] * 0.02); g.stroke();
    });
    const bridge = [[8.5, 13], [15, 10], [21, 12]];
    RJ.ink(g, bridge, { w: 3, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, bridge, { w: 1.3, color: J.frame, taper: 0, wobble: 0, weightVar: 0 });
  }
  function jdHead(g, S) {
    headBase(g, S, { skull: JD_SKULL, skin: J.skin, shade: J.skinSh, cast: JD_CAST, castDy: 0 });
    jdHair(g, S);
    jdGlasses(g, S);
  }
  function jdFaceSpec() {
    return {
      eyes: [{ x: -10, y: 19, w: 25, h: 24 }, { x: 38, y: 17, w: 22, h: 23 }],
      brows: [[-12, -9, 24], [42, -9, 20]],
      browStyle: { thick: 4.2, arch: 0.3, tilt: -0.05, color: J.hairSh },
      nose: [19, 38, 56],
      mouth: [7, 47, 16],
      mouthStyle: { lineW: 1.4, inner: '#c8505f', tongue: '#f59aa4' },
      blush: [[-17, 41, 17], [35, 39, 14]],
      sweat: [58, -12, 5],
      eye: { iris: J.iris, ring: '#150b06', sclera: '#fffdfa', expr: 'neutral', irisW: 0.7, irisH: 0.96, lid: 1.9, wing: 0.25, lash: 1.0, crease: false, lashes: 0, tilt: -0.03, drop: 0.05, hl: [[-0.4, -0.5, 0.27], [-0.36, -0.14, 0.12]] },
    };
  }

  // ---- the merch tote: standing on the ground at his side with folded tees poking out (figure space, drawn in the fx hook under the name 'prop') ----
  function jdTote(g, S) {
    const x = -70, y = 0;
    g.save(); g.fillStyle = 'rgba(20,6,40,0.28)'; g.beginPath(); g.ellipse(x + 2, y + 2, 25, 5.5, 0, 0, TAU); g.fill(); g.restore();
    // two folded tees: a cream one behind and a pink one in front, each with a tiny round print
    RJ.cel(g, rbox(x - 3, y - 66, 17, 30, 3), '#fff6e6', { shadow: '#eadcc3', line: LINE.main, depth: 3, tension: 0, hi: false, decor: (gg) => { RJ.ink(gg, [[x - 1, y - 58], [x + 12, y - 60]], { w: 1.1, color: '#eadcc3', taper: 0.4, wobble: 0 }); } });
    RJ.cel(g, [[x - 17, y - 42], [x - 16, y - 55], [x - 10, y - 59], [x - 2, y - 57], [x + 1, y - 50], [x + 1, y - 42]], J.tee2, { shadow: J.tee2Sh, line: LINE.main, depth: 3, tension: 0.6, decor: (gg) => {
      RJ.ink(gg, [[x - 15, y - 51], [x - 8, y - 54], [x, y - 50]], { w: 1.2, color: J.tee2Sh, taper: 0.4, wobble: 0 });
      gg.beginPath(); gg.arc(x - 7, y - 47.5, 2.4, 0, TAU); gg.fillStyle = J.logoG; gg.fill();
    } });
    // the handles, then the bag itself
    [[x - 11, y - 42, x - 9, y - 68, x + 7, y - 68, x + 9, y - 42]].forEach((h) => {
      const sp = [[h[0], h[1]], [h[2], h[3]], [h[4], h[5]], [h[6], h[7]]];
      RJ.ink(g, sp, { w: 6.6, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
      RJ.ink(g, sp, { w: 4, color: J.tealDk, taper: 0, wobble: 0, weightVar: 0 });
    });
    RJ.cel(g, rbox(x - 18, y - 42, 36, 42, 3.5), J.teal, { shadow: J.tealSh, line: LINE.main, depth: 5, tension: 0, hi: J.tealHi, hiW: 1.4, hiAlpha: 0.75, decor: (gg) => {
      gg.beginPath(); gg.rect(x - 20, y - 42, 40, 6); gg.fillStyle = J.tealDk; gg.fill();
      RJ.ink(gg, [[x - 13, y - 33], [x - 13, y - 4]], { w: 1.1, color: J.tealSh, taper: 0, wobble: 0 });
    } });
    tk.sparkle(g, x + 1, y - 19, 10.5, { color: '#f4fffd', glow: 0, thin: 0.22 });
    tk.sparkle(g, x + 11, y - 28, 3.8, { color: J.gold, glow: 0, thin: 0.22 });
  }
  const JD_TEE = [[-14, -151], [14, -151], [29, -146], [33, -131], [32, -106], [34, -78, 1], [-34, -78, 1], [-32, -106], [-33, -131], [-29, -146]];
  function jdTorso(g, S) {
    RJ.neck(g, 2, -156, { w: 20, h: 22, skin: J.skin, shade: J.skinSh });
    RJ.cel(g, JD_TEE, J.tee, { shadow: J.teeSh, line: LINE.main, depth: 7, hi: J.teeHi, hiW: 1.5, hiAlpha: 0.75, tension: 0.5, decor: (gg) => {
      gg.beginPath(); gg.rect(-40, -85, 80, 8); gg.fillStyle = J.teeSh; gg.fill();
      RJ.ink(gg, [[-40, -84.2], [40, -84.2]], { w: 2, color: J.teal, taper: 0, wobble: 0, weightVar: 0, alpha: 0.95 });      // the teal piping along the hem
      strokes(gg, [[-27, -128, -22, -114], [26, -130, 22, -116], [-26, -100, -24, -92], [20, -100, 19, -92]], { color: J.teeHi, alpha: 0.8, w: 1.3 });
    } });
    // the crew neck: a ribbed collar that hugs the base of the neck
    RJ.cel(g, [[-14, -152], [-9, -144], [0, -142], [9, -144], [14, -152], [10, -151], [6, -147.5], [0, -146], [-6, -147.5], [-10, -151]], J.rib, { shadow: J.teeSh, line: LINE.mid, depth: 2, hi: false });
    // the pendant: a small plain round silver disc on a dark cord, and the big pale teal badge high on the
    // wearer's left chest (a plain disc with a teal ring and an inner ring, no lettering)
    [[[-9, -148], [-5.5, -135], [0, -127]], [[10, -148], [6, -135], [0, -127]]].forEach((c) => {
      RJ.ink(g, c, { w: 3, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
      RJ.ink(g, c, { w: 1.3, color: '#5b566b', taper: 0, wobble: 0, weightVar: 0 });
    });
    RJ.cel(g, tk.circlePts(0, -122, 4.6, 14), J.metal, { shadow: '#8d889c', line: LINE.fine + 0.2, depth: 1, hi: false });      // a small plain round pendant (no symbol)
    RJ.cel(g, tk.circlePts(17, -120, 11.4, 20), J.badge, { shadow: J.badgeSh, line: LINE.mid, depth: 3, hi: J.badgeHi, hiW: 1.4, hiAlpha: 0.9, decor: (gg) => {
      gg.lineWidth = 2.1; gg.strokeStyle = J.teal; gg.beginPath(); gg.arc(17, -120, 9.8, 0, TAU); gg.stroke();
      gg.lineWidth = 0.9; gg.strokeStyle = J.tealSh; gg.beginPath(); gg.arc(17, -120, 6.6, 0, TAU); gg.stroke();
    } });
  }

  // ---- props in figure space: the tablet in the front hand, the stylus in the back hand, both hands drawn again on top, the watch and the bracelets ----
  function jdScreen(g, S, x, y, w, h) {
    const pose = S.P.pose, t = S.t;
    g.save();
    g.beginPath(); g.rect(x, y, w, h); g.clip();
    const gr = g.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, J.screen); gr.addColorStop(1, J.screenDk); g.fillStyle = gr; g.fillRect(x, y, w, h);
    const cx = x + w / 2, cy = y + h / 2 - 2;
    const line = (pts, ww, col) => RJ.ink(g, pts, { w: ww, color: col, taper: 0.4, wobble: 0, weightVar: 0 });
    if (pose === 'attack') { g.fillStyle = 'rgba(255,255,255,' + (0.4 + 0.5 * S.beat).toFixed(2) + ')'; g.fillRect(x, y, w, h); tk.sparkle(g, cx, cy, 13 + 4 * S.beat, { color: J.teal, glow: 0, thin: 0.2 }); }
    else if (pose === 'cheer') { RJ.cel(g, [[cx, cy + 9, 1], [cx - 10, cy - 1], [cx - 5, cy - 9], [cx, cy - 4], [cx + 5, cy - 9], [cx + 10, cy - 1]], '#ff7fa8', { shadow: '#e0527f', line: LINE.fine + 0.2, depth: 2 }); }
    else if (pose === 'sing') { tk.note(g, cx, cy + 4, 12, { kind: 'beamed', color: J.tealDk }); }
    else if (pose === 'hurt') { line([[cx - 11, cy - 8], [cx - 5, cy - 2]], 2, J.tealDk); line([[cx - 5, cy - 8], [cx - 11, cy - 2]], 2, J.tealDk); line([[cx + 5, cy - 8], [cx + 11, cy - 2]], 2, J.tealDk); line([[cx + 11, cy - 8], [cx + 5, cy - 2]], 2, J.tealDk); line([[cx - 8, cy + 10], [cx - 3, cy + 6], [cx + 3, cy + 10], [cx + 8, cy + 6]], 1.8, J.tealDk); }
    else {
      // a doodle: a little sparkle logo being drawn, and a squiggle with a trailing dot
      tk.sparkle(g, cx, cy - 6, 8, { color: J.teal, glow: 0, thin: 0.2 });
      line([[cx - 13, cy + 10], [cx - 6, cy + 5], [cx, cy + 11], [cx + 7, cy + 6], [cx + 13, cy + 10]], 2, J.tealSh);
      g.beginPath(); g.arc(cx - 13, cy + 17, 1.6, 0, TAU); g.arc(cx - 6, cy + 17, 1.6, 0, TAU); g.fillStyle = J.tealSh; g.fill();
    }
    // a soft glare
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w * 0.55, y); g.lineTo(x, y + h * 0.4); g.closePath(); g.fill();
    g.restore();
  }
  function jdTablet(g, S, wr) {
    const P = S.P, TW = 38, TH = 50, X0 = -13, Y0 = -TH - 4;   // held from underneath: the tablet's lower edge sits just above the wrist, so the forearm and the watch stay in view
    g.save(); g.translate(wr.w[0], wr.w[1]); g.rotate(P.tabRot || 0);
    // a halo of three soft rounded outlines (flat alpha, so it stays clean when a figure is baked onto a transparent canvas)
    [[11, 0.07], [7, 0.1], [3.4, 0.16]].forEach((h) => { g.save(); g.globalAlpha = Math.min(1, h[1] + 0.12 * (S.beat || 0)); g.lineWidth = h[0] * 2; g.lineJoin = 'round'; g.strokeStyle = J.teal; g.beginPath(); tk.trace(g, rbox(X0, Y0, TW, TH, 5 + h[0] * 0.6), 0, 0, 0); g.stroke(); g.restore(); });
    // the teal case round the screen
    RJ.cel(g, rbox(X0, Y0, TW, TH, 5), J.teal, { shadow: J.tealSh, line: LINE.main, depth: 3, tension: 0, hi: J.bezelHi, hiW: 1.3 });
    RJ.cel(g, rbox(X0 + 2.6, Y0 + 2.6, TW - 5.2, TH - 5.2, 3), '#25232d', { shadow: false, line: LINE.fine, tension: 0 });
    RJ.cel(g, rbox(X0 + 4, Y0 + 4, TW - 8, TH - 8, 2.2), J.screen, { shadow: false, line: LINE.fine, tension: 0 });
    jdScreen(g, S, X0 + 4.4, Y0 + 4.4, TW - 8.8, TH - 8.8);
    g.beginPath(); g.arc(X0 + TW / 2, Y0 + 2.3, 0.8, 0, TAU); g.fillStyle = '#7d768f'; g.fill();
    g.restore();
  }
  function jdStylus(g, S, bw) {
    const k = bw.ang + (S.P.bRot || 0), c = Math.cos(k), s = Math.sin(k), x = bw.w[0], y = bw.w[1];
    const a = [x - c * 9, y - s * 9], b = [x + c * 27, y + s * 27];
    RJ.ink(g, [a, b], { w: 5.6, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, [a, [x + c * 20, y + s * 20]], { w: 3.2, color: J.teal, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, [[x + c * 20, y + s * 20], b], { w: 3.2, color: '#fff6e6', taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, [[x + c * 26, y + s * 26], [x + c * 30, y + s * 30]], { w: 1.6, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
    return b;
  }
  // a blue-faced wristwatch: a short strap across the forearm and a small round case with a blue dial, seated just before the hand (about 70 percent of the first
  // size, so it never reads as a badge on the tablet)
  function jdWatch(g, wr) {
    const ux = Math.cos(wr.ang), uy = Math.sin(wr.ang), k = 0.72;
    let nx = -uy, ny = ux;
    if (ny > 0) { nx = -nx; ny = -ny; }
    armBand(g, wr, 8, 5.4, J.strap, 4.2);
    const cx = wr.w[0] - ux * 8 + nx * 1, cy = wr.w[1] - uy * 8 + ny * 1;
    RJ.cel(g, tk.circlePts(cx, cy, 7.6 * k, 14), J.watch, { shadow: '#15131b', line: LINE.mid, depth: 1.8, hi: false });
    g.beginPath(); g.arc(cx, cy, 6.2 * k, 0, TAU); g.lineWidth = 0.9; g.strokeStyle = J.watchRim; g.stroke();
    g.beginPath(); g.arc(cx, cy, 5 * k, 0, TAU); g.fillStyle = J.face; g.fill();
    g.beginPath(); g.arc(cx - 1.6 * k, cy - 1.8 * k, 1.7 * k, 0, TAU); g.fillStyle = J.faceHi; g.globalAlpha = 0.9; g.fill(); g.globalAlpha = 1;
    RJ.ink(g, [[cx, cy], [cx + 2.6 * k, cy - 1.8 * k]], { w: 0.9, color: '#e9f3ff', taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, [[cx, cy], [cx - 0.4 * k, cy - 3.2 * k]], { w: 0.9, color: '#e9f3ff', taper: 0, wobble: 0, weightVar: 0 });
  }
  // two thin black bracelets on the other wrist
  function jdBracelets(g, wr) {
    armBand(g, wr, 7, 7.4, J.strap, 2.8);
    armBand(g, wr, 12, 7.8, J.strap, 2.8);
  }
  // a thin teal band just inside the end of a sleeve (figure space): the same geometry as RJ.sleeve, shoulder to elbow
  function jdSleevePipe(g, S, front) {
    const P = S.P, pt = S.pt, ar = S.spec.arm, sh = front ? pt.shF : pt.shB, tg = front ? pt.hand : [pt.shB[0] + P.bHand[0], pt.shB[1] + P.bHand[1]];
    const r = RJ.ik2(sh, tg, ar.l[0], ar.l[1], front ? P.fBend : P.bBend), dx = r.e[0] - sh[0], dy = r.e[1] - sh[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux;
    const px = sh[0] + dx * ar.sleeve.len - ux * 2, py = sh[1] + dy * ar.sleeve.len - uy * 2, h = ar.sleeve.w1 / 2 - 1.6;
    RJ.ink(g, [[px - nx * h, py - ny * h], [px + nx * h, py + ny * h]], { w: 2, color: J.teal, taper: 0, wobble: 0, weightVar: 0, alpha: 0.95 });
  }
  // the back sleeve's piping goes in the 'mid' layer: after the back arm when it is drawn over the torso (bFront), before the head and its hair
  function jdMid(g, S) {
    if (!S.P.bFront) return;
    g.save();
    const inv = mat.inv(S.M.head); g.transform(inv[0], inv[1], inv[2], inv[3], inv[4], inv[5]);
    jdSleevePipe(g, S, false);
    g.restore();
  }
  // the tablet, the stylus and both gripping hands, drawn in figure space from the head-space 'top' layer (so the portrait crop has them too)
  function jdProps(g, S) {
    g.save();
    const inv = mat.inv(S.M.head); g.transform(inv[0], inv[1], inv[2], inv[3], inv[4], inv[5]);
    jdSleevePipe(g, S, true);
    const f = wristOf(S, true), b = wristOf(S, false);
    jdStylus(g, S, b);
    jdTablet(g, S, f);
    redrawHand(g, S, false);
    redrawHand(g, S, true);
    jdBracelets(g, b);
    jdWatch(g, f);
    g.restore();
  }
  function jdFx(g, S, name) {
    const t = S.t;
    if (name === 'prop') { jdTote(g, S); return; }
    const f = wristOf(S, true), P = S.P, ca = Math.cos(P.tabRot || 0), sa = Math.sin(P.tabRot || 0), cx = f.w[0] + (6 * ca + 21 * sa), cy = f.w[1] + (6 * sa - 21 * ca);
    if (name === 'doodle') {
      // the design strike: a teal logo burst out of the tablet, sparkles and a swoosh
      const b = S.beat;
      tk.glow(g, cx, cy, 40 + 12 * b, J.teal, 0.4 + 0.3 * b, false);
      RJ.fx.burst(g, cx + 30, cy - 24, 10 + 8 * b, J.teal, '#e6fffc', t);
      RJ.fx.sparkles(g, cx, cy, [[34, 8, 6, 0.2], [38, -48, 5, 0], [14, -44, 4.5, 0.4], [50, -10, 4, 0.1]], J.tealHi, t);
    } else if (name === 'hearts') RJ.fx.hearts(g, cx, cy - 22, t, '#ff7fa8');
    else if (name === 'tabnotes') RJ.fx.notes(g, cx - 6, cy - 22, t, J.teal, 3);
  }

  function jdPoses() {
    const warm = { eyes: 'open', mouth: 'smile', brow: -0.2, blush: 1.35 };
    return {
      idle: Object.assign({ mic: 'none', fHand: [10, 37], fBend: -1, fKind: 'fist', fRot: -0.3, tabRot: 0.1, bHand: [22, 31], bBend: 1, bKind: 'point', bRot: 0.1, bFront: 1, headRot: 0.04, fx: ['prop'] }, warm),
      sing: { mic: 'none', fHand: [26, 36], fBend: -1, fKind: 'fist', fRot: -0.3, tabRot: 0.1, bHand: [-32, -6], bBend: 1, bKind: 'open', bRot: 0.2, eyes: 'happy', mouth: 'happyOpen', brow: -0.3, headRot: -0.04, fx: ['prop', 'tabnotes'] },
      attack: { mic: 'none', fHand: [44, 22], fBend: -1, fKind: 'fist', fRot: -0.3, tabRot: 0.3, bHand: [36, 20], bBend: 1, bKind: 'point', bRot: -0.1, bFront: 1, lean: 0.07, torsoRot: 0.04, headRot: 0.07, headDx: 3,
        fFoot: [34, -12], bFoot: [-24, -12], eyes: 'determined', mouth: 'happyOpen', brow: 0.25, fx: ['prop', 'doodle'], look: [0.5, 0] },
      hurt: { mic: 'none', fHand: [8, 40], fBend: -1, fKind: 'fist', fRot: -0.2, tabRot: -0.35, bHand: [-34, -14], bBend: 1, bKind: 'open', bSpread: 1.3, lean: -0.13, torsoRot: -0.08, headRot: -0.14, headDx: -3,
        fFoot: [12, -12], bFoot: [-20, -12], eyes: 'hurt', mouth: 'ow', brow: -0.7, sweat: 1, blush: 0.6, fx: ['prop', 'stars'] },
      cheer: { mic: 'none', fHand: [42, -26], fBend: 1, fKind: 'fist', fRot: -0.2, tabRot: 0.4, bHand: [-30, -40], bBend: -1, bKind: 'fist', bRot: 0.1, eyes: 'happy', mouth: 'happyOpen', brow: -0.2, headRot: 0.05,
        fFoot: [20, -12], bFoot: [-18, -12], fx: ['prop', 'hearts'] },
      // the portrait pose: the tablet held low at the far side, the stylus hand down by the tote
      bust: Object.assign({ mic: 'none', fHand: [16, 52], fBend: -1, fKind: 'fist', fRot: -0.3, tabRot: 0.1, bHand: [-12, 56], bBend: 1, bKind: 'point', bRot: 0.1, bFront: 1, headRot: 0.03, fx: [] }, warm),
    };
  }

  const jdSpec = {
    id: 'jordan',
    accent: 'jordan',
    skel: {},
    base: { tabRot: 0.1 },
    poses: jdPoses(),
    face: jdFaceSpec(),
    exprs: { smirk: { eyes: 'open', mouth: 'smirk', brow: 0.2 } },
    arm: { l: [26, 24], w: [17, 13], skin: J.skin, skinSh: J.skinSh, sleeve: { color: J.tee, shade: J.teeSh, len: 0.8, w0: 21, w1: 25, hi: false }, hand: { skin: J.skin, shade: J.skinSh } },
    legs: {
      w: [27, 21], color: J.pants, shade: J.pantsSh, pantsOver: true, bow: 2,
      shoe: { color: '#fffaf0', sole: '#bdf3ee', shade: '#e8dfd0', toeCap: J.teal, accent: J.teal, hi: '#ffffff', k: 1.15 },
      decor(g, hip, an) {
        const dx = an[0] - hip[0], dy = an[1] - hip[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux, qx = an[0] - ux * 7, qy = an[1] - uy * 7;
        RJ.ink(g, [[qx - nx * 10, qy - ny * 10], [qx + nx * 10, qy + ny * 10]], { w: 1.6, color: C.ink, taper: 0.2, wobble: 0 });
        RJ.ink(g, [[qx - ux * 4 - nx * 9, qy - uy * 4 - ny * 9], [qx - ux * 4 + nx * 9, qy - uy * 4 + ny * 9]], { w: 1.7, color: J.teal, taper: 0.2, wobble: 0, alpha: 0.95 });
        const mx = (hip[0] + an[0]) / 2, my = (hip[1] + an[1]) / 2;
        RJ.ink(g, [[mx + nx * 5, my + ny * 5], [mx + nx * 7 + ux * 18, my + ny * 7 + uy * 18]], { w: 1.3, color: J.teal, taper: 0.5, wobble: 0, alpha: 0.5 });
      },
    },
    mic: { accent: J.teal },
    bounds: { h: 293, x0: -126, x1: 129 },       // the silhouette over all five poses (the hurt lean, the tablet's reach), not the effects
    bust: { rect: [-96, -298, 92, -76], face: [-82, -292, 80, -150], pose: 'bust' },
    layers: { backHair: jdBack, torso: jdTorso, mid: jdMid, head: jdHead, top: jdProps, fx: jdFx },
    // the stylus hand makes little drawing strokes in the idle, the sing waves and the attack flicks the stylus on the beat
    tweak(P, t) {
      if (P.pose === 'idle') { const k = Math.sin(t * 3.1); P.bHand = [P.bHand[0] + 2.2 * k, P.bHand[1] + 1.2 * Math.sin(t * 6.2)]; }
      else if (P.pose === 'attack') { const b = P.beat; P.bHand = [P.bHand[0] + 6 * b, P.bHand[1] - 6 * b]; P.bRot = -0.1 + 0.4 * b; }
      else if (P.pose === 'sing') { P.bRot = 0.2 + 0.4 * Math.sin(t * 6); }
    },
  };
  RJ.register('jordan', crewRig(jdSpec));
})();
