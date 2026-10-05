// Hocus Vocus: the chibi cast (ART.rj figures), the ART.hero adapter and ART.cast. Loaded after art_cast_kit.js, in the slot the original
// hero art held (before art_enemies_1.js). Ported from the owners' approved drawings in tools/hocus_vocus/rj_art/ (roxor.js, jasmin.js, crew.js).
//
// THE FIGURES (cast ids; HV_ART_AUDIO 2.4)
//   roxor, roxor_monster      RoxorLoops (hero kuro): stage clothes and the Monster Onesie (hood eyes and horns, bible 7.1)
//   jasmin, jasmin_unicorn    Jasmin (hero hanae): stage clothes and the Unicorn Onesie (gold horn, pastel mane, her pink scrunchie)
//   rawclaw, rawclaw_goat     RawClaw (hero suzu): stage clothes and the Goat Suit (cosy cream, headphones over the ears, the pad on its strap)
//   andy                      Andy (hero raiga): no outfit (bible 7.1)
//   jordan                    Jordan, the Merch Stall (not a hero): ART.cast only
//   Every figure has the kit's five pose tables (idle sing attack hurt cheer) and the heroes add windup strike block down walk (HV_ART_AUDIO
//   2.5); a figure without a table falls back (RJ.FALLBACK). Each figure block keeps its palette object at the top, so a correction is a
//   colour or a shape swap, not a rewrite.
//
// THE ART.hero CONTRACT (DESIGN 5.6, HV_ART_AUDIO 2.3: every call site of the original hero art keeps working)
//   ART.hero.draw(ctx, heroId, {x, y, s, pose, t, pt, flip, alpha, glow, shadow, skin?, gloss?, cache?, expr?})
//        (x, y) is the feet centre, nominal height 250 * s (hair may rise above: bounds.top), faces right, flip mirrors. pose is one of
//        LISTS.poses; pt (seconds since the pose began) drives the one-shot timelines below and holds the last key; t (absolute seconds) drives
//        every loop. The figure is drawn with the kit at s * CAST_K (0.9). alpha multiplies globalAlpha; glow (0..1 or a hex) adds an aura behind
//        the chest; shadow:false skips the ground shadow; skin 'skin' or 'stage' overrides the viewer's outfit; gloss (0..1) draws the Filter's
//        pastel wash from a cached frame; cache:true draws a cached frame. Below s 0.4 (the map token) and under quality 'low' cached frames are
//        drawn (ART.sprite keys 'rj|...'). An unknown id draws a labelled placeholder. Every call is wrapped (warn once, never throw).
//   Timelines (engine pose: [time s, kit pose] keys, eased): attack idle, windup 0.07, strike 0.15 to 0.26, idle 0.42; cast idle, sing 0.12 to
//        0.38, idle 0.5; hurt idle, hurt 0.04 to 0.12, idle 0.26; block idle, block 0.12; down idle, hurt 0.08, down 0.5; cheer idle, cheer 0.1.
//   ART.hero.portrait(ctx, heroId, {x, y, w, h, expr, t, skin?})   a stage spotlight in the hero colour plus the kit bust (cover and crop)
//   ART.hero.medallion(ctx, heroId, x, y, r, skin?)   a cached round face: hero colour disc, cream rim, warm outline
//   ART.hero.bounds(heroId) -> {w, h: 250, head, hand, feet, weapon, top}   ART.hero.pointAt(heroId, name, o) head hand tip bladeMid chest feet
//        weapon (and the kit points mouth micHead shF shB)   ART.hero.poseMs(pose)   ART.hero.keyPt(pose)   ART.hero.warm(heroId, s) -> frames
//        baked   ART.hero.audit(heroId) -> clipped frames (reads pixels: dev and tests only)   ART.hero.expressions()   ART.hero.ids()
//   Outfits (HV_ART_AUDIO 2.11): ART.hero.outfits(map?) sets or reads the viewer's map {hanae, kuro, suzu, raiga: 'skin' or 'stage'} (the UI pushes
//        it; junk is ignored), ART.hero.skins(heroId), ART.hero.castId(heroId, skin). ART never reads META, storage or the clock.
//   ART.cast.draw(ctx, castId, {x, y, s, pose, mood, expr, t, flip, alpha, shadow})   moods hello buy poor sold leave empty (Jordan's stall)
//   ART.cast.bust(ctx, castId, w, h, o)   ART.cast.medallion(ctx, castId, x, y, r)   ART.cast.point(castId, name, o)   ART.cast.bake(castId, o)
//   ART.cast.ids()   ART.cast.moods()   ART.hero.perf(castId, n) -> ms a live draw on a no-op context (the cast_perf sheet)
//   Gallery sheets: heroes, hero_anim (hero pose t skin), portraits, hero_lineup, hero_dev (hero=id[,id]|all pose zoom t mode=portrait expr
//   skin), cast_skins, cast_jordan, cast_perf. Determinism: a figure is a pure function of its arguments (no clock, no unseeded random call).
(function () {
  'use strict';
  const RJ = ART.rj;
  // roxor.js: RoxorLoops (id 'roxor', accent GREEN) and his monster-onesie variant ('roxor_monster'). Built on kit.js (RJ.rig).
  // Beatbox and support hero. Identity: tall swooping mohawk pushed up and forward, shaved stubble sides, a short mullet tail, pale blue-grey
  // cheeky eyes, smirk with a flash of teeth, black tee with an orange smiley, olive pants, lime sneakers, black mic with a green band.
  // The face, the stubble, the mohawk and the mullet are shared by both variants (makeRoxor(variant)); the variant swaps outfit and hood.
  function castRoxor() {
  const tk = ART.tk, C = RJ.C, LINE = RJ.LINE;
  const TAU = Math.PI * 2;

  const H = {
    hair: '#6b3a22', hairSh: '#3a1d0f', streak: '#a0522d', hairHi: '#8f4b2a',
    stub: '#9a6a50', stubDk: '#7a4e38',
    tee: '#463a32', teeSh: '#2c241f', teeHi: '#6a5b4f',
    orange: '#ffb44d', orangeSh: '#f19a2d',
    pants: '#7fa631', pantsSh: '#5a7f20',
    shoe: '#d6ed6b', shoeSole: '#f2f9b4', shoeSh: '#a9c24a',
    iris: ['#4c5d7e', '#7f93b8'],
    fur: '#41741f', furSh: '#2c5014', furLt: '#5b9230', furDk: '#27470f', horn: '#f6d5a2', hornSh: '#dba56a',
  };

  // ---- shapes in head space (origin = head centre, face turned +x). Measured against the owners' card, one unit = 1/118 of the head width. ----
  // the hairline between the face and the shaved side (the stubble crescent lies to the left of it)
  const HAIRLINE = [[-17, -50], [-22.5, -45], [-27.5, -39], [-31.5, -32], [-35, -25], [-38, -15], [-40.2, -6], [-41.3, 3], [-41.5, 12], [-40.5, 22]];
  function polyFrom(curve, tail) {
    const f = tk.flatten(curve, { closed: false, step: 2.5 }), out = [];
    for (let i = 0; i < f.length; i += 2) out.push([f[i], f[i + 1]]);
    return { poly: out.concat(tail) };
  }
  // the skin region: everything to the right of the hairline (extends past the skull, which clips it)
  const FACE_REGION = polyFrom(HAIRLINE, [[-72, 30], [-72, 94], [94, 94], [94, -84], [-17, -84]]);
  // the hair's lower edge: the stubble's top edge, the dome peak at x = -16, the long slope down to the front tongue (28, -31), then up the right side
  const MASS_LOW = [[47, -46], [44, -43.5], [40, -42.5], [36, -40.5], [32.5, -38.5], [31.2, -34], [30, -32.5], [28.5, -31.8, 1], [24, -31.8], [20, -32.7], [16.5, -34.2], [12, -35.4], [8, -37], [4, -40], [0, -43.5], [-3, -45.5], [-6, -48], [-10, -47.8], [-14, -48.4], [-17, -50], [-20, -51.2], [-26, -52.4], [-35, -51.6], [-44.5, -48.8], [-54, -41]];
  // the swept-up quiff, measured on the owners' card: a back swoosh that hooks up at the left, then four tall flame locks that each rise with a long convex
  // right edge and curl their tip back to the left, and a front lock that hangs in a curled point at the forehead. Points [x, y, 1] are sharp corners (tips and
  // the V-notches between the locks). The base runs straight out of the shaved side's top edge, so there is no step on the left. Closed by MASS_LOW.
  const CREST_TOP = [
    [-56.5, -38.5], [-55.5, -45], [-52, -52], [-46, -58.5], [-39.5, -63.5], [-33, -67.5], [-28.5, -71.5], [-26.8, -76.5], [-27.2, -80.8], [-29.2, -83.4, 1],   // back swoosh and its hooked tip
    [-25.2, -83.6], [-22, -80.5], [-19.5, -76.5], [-17.3, -72.5, 1],                                                                                          // the hook's inner curl, first valley
    [-18.6, -79], [-19.6, -85], [-18.8, -88.6, 1],                                                                                                            // lock A rising to its tip
    [-14.3, -91.4], [-10.4, -92.5], [-6.3, -92.1], [-2.7, -89.6], [0.2, -86, 1],                                                                              // lock A top, valley
    [1.8, -90.5], [0.6, -94.5], [-1.4, -97.8, 1],                                                                                                             // lock B (tallest) left edge to its tip
    [3.7, -96.9], [8.9, -93.7], [14.8, -89], [19, -84], [20.8, -82, 1],                                                                                       // lock B top, valley
    [21.2, -91], [19.2, -95.5], [17.2, -98.5, 1],                                                                                                             // lock C
    [24.3, -96.4], [29.5, -90.5], [33.3, -85], [35.6, -79.5], [36, -77, 1],                                                                                   // lock C top, valley
    [36.2, -83], [36.4, -88], [36.6, -89.8, 1],                                                                                                               // lock D
    [41, -89.2], [45.6, -84.6], [49.2, -76], [50.8, -66], [50.2, -57], [48.5, -51],                                                                           // lock D top and the crest's front edge
  ];
  // stretch the crest upward a little (above the mass) so the silhouette survives thumbnail sizes
  const STRETCH = (p) => (p[1] < -62 ? [p[0], -62 + (p[1] + 62) * 1.06].concat(p.slice(2)) : p);
  const HAIR_OUTLINE = CREST_TOP.map(STRETCH).concat(MASS_LOW);
  // the hard shadow of the hair: the swoosh's underside and a flank on the left of each lock
  const SHADOW_FLAMES = [
    [[-56.5, -38.5], [-55.5, -45], [-52, -52], [-46, -58.5], [-39.5, -63.5], [-33, -67.5], [-28.5, -71.5], [-26, -62], [-32, -56], [-43, -50], [-52, -43]],
    [[-19.6, -85], [-18.8, -88.6], [-14.3, -91.4], [-16.5, -80], [-17.3, -72.5], [-18.6, -79]],
    [[0.2, -86], [1.8, -90.5], [0.6, -94.5], [-1.4, -97.8], [3.7, -96.9], [2, -88], [-2, -76], [-5, -64], [-3, -52], [-6, -58], [-8, -70], [-4, -80]],
    [[20.8, -82], [21.2, -91], [19.2, -95.5], [17.2, -98.5], [22, -96], [24, -86], [21, -72], [17, -60], [14, -68], [18, -78]],
    [[36, -77], [36.2, -83], [36.6, -89.8], [39, -88], [40, -80], [36, -66], [30, -58], [33, -70]],
  ];
  // the thin highlight bands along the upper third of each lock's top edge
  const HAIR_LIGHT = [
    [[-14.3, -91.4], [-10.4, -92.5], [-6.3, -92.1], [-2.7, -89.6], [-5, -87.5], [-9.5, -89.5], [-14, -88.5]],
    [[3.7, -96.9], [8.9, -93.7], [14.8, -89], [13, -86], [8, -90], [3, -93.5]],
    [[24.3, -96.4], [29.5, -90.5], [33.3, -85], [31, -83], [27.5, -88], [23, -93.5]],
    [[41, -89.2], [45.6, -84.6], [49.2, -76], [47, -76], [44, -83], [40, -86]],
  ];
  // the lock separation lines: they start at the valleys and flow down into the hair mass in S curves
  const VALLEYS = [
    [[-17.3, -72.5], [-19.5, -65], [-20, -57], [-17.5, -51]],
    [[0.2, -86], [-2.5, -77], [-6.5, -68], [-8.5, -60], [-5.5, -53], [-3, -47.5]],
    [[20.8, -82], [14.5, -77], [9, -69], [6, -60], [7, -51], [11, -43], [14, -37.5]],
    [[36, -77], [30, -70], [25.5, -62], [22, -53], [20, -45], [21, -39]],
    [[-9, -75], [-12.5, -66], [-13, -58]],
    [[27, -86], [24, -72], [20, -62], [16, -56]],
    [[-1, -66], [3, -58], [4, -49]],
  ];
  // the mullet: four wavy locks that drop from behind the ear to the collar, each with a sideways S-bend and a tip flicked outward to the left
  const MULLET = [
    { sp: [[-44, 20], [-54, 31], [-55, 43], [-61, 53], [-69, 56]], w: 17 },
    { sp: [[-40, 25], [-49, 37], [-46, 51], [-53, 63], [-61, 68]], w: 16 },
    { sp: [[-34, 28], [-41, 40], [-36, 53], [-41, 64], [-49, 68]], w: 15 },
    { sp: [[-27, 31], [-34, 42], [-28, 52], [-25, 60], [-18, 60]], w: 13 },
  ];

  function lockDraw(g, L, base, sw, o) {
    // the mullet locks use the ribbon's default taper: wide root, rounded swell, a tip that flicks out
    RJ.lock(g, L.sp, base, Object.assign({ wMax: L.w, w0: L.w * 0.7, w1: 0, tipPow: 1.5, bend: sw, strands: 1, shadow: H.hairSh, glossColor: H.streak, glossAlpha: 0.55, line: LINE.main }, o));
  }
  function mohawk(g, S, col, sh, scale, hi, streak) {
    g.save();
    if (scale) g.scale(scale, scale);
    RJ.cel(g, HAIR_OUTLINE, col, { shadow: false, line: LINE.main, tension: 0.7, weightVar: 0.4, decor: (gg) => {
      SHADOW_FLAMES.forEach((f, i) => RJ.fillPts(gg, f.map(STRETCH), sh, i === 0 ? 0.95 : 0.55));
      HAIR_LIGHT.forEach((f) => RJ.fillPts(gg, f.map(STRETCH), hi || H.hairHi, 0.7));
      VALLEYS.forEach((v, i) => RJ.ink(gg, v.map(STRETCH), { w: LINE.main * (i < 4 ? 1.2 : 0.85), color: C.ink, taper: 0.4, pressure: 'head', wobble: 0.03, seed: i }));
      // the card's orange-brown hatching: short light strokes clustered on the middle of each lock
      const hat = [[-9, -80, -8, -75], [-7, -82, -6, -77], [-5, -80, -4, -74], [3, -75, 5, -69], [6, -77, 8, -70], [9, -79, 11, -72], [17, -74, 18, -67], [20, -76, 22, -69], [24, -72, 25, -65],
        [31, -72, 32, -65], [34, -70, 35, -63], [46, -66, 47, -58], [-8, -66, -7, -60], [1, -60, 2, -54], [13, -60, 14, -54], [-38, -60, -33, -56]];
      RJ.hatch(gg, hat.map((h) => [STRETCH([h[0], h[1]]), STRETCH([h[2], h[3]])]), { w: 1.15, color: streak || H.streak, alpha: 0.85 });
    } });
    RJ.ink(g, MASS_LOW, { w: LINE.main + 0.2, color: C.ink, taper: 0.1, pressure: 'flat', wobble: 0.03 });
    g.restore();
  }

  // Roxor's own skull: leaner than the default round one, an egg with the chin pulled toward the front (+x) and a lighter jaw
  const ROX_SKULL = [[-2, -58], [30, -53], [52, -34], [60, -4], [57, 24], [45, 45], [29, 57], [12, 60], [-6, 56], [-26, 46], [-47, 29], [-61, -1], [-58, -33], [-40, -52]];

  // the shaved skull, face and features. mon = monster variant: no stubble (the hood covers the sides).
  function faceBase(g, S, mon) {
    const skull = mon ? RJ.SKULL : ROX_SKULL;
    g.save();
    g.beginPath(); tk.trace(g, skull); g.clip();
    g.fillStyle = H.stub; g.fillRect(-90, -100, 180, 200);          // the shaved side: one flat tan, no texture (the cards use none)
    g.beginPath(); tk.trace(g, mon ? skull : FACE_REGION); g.fillStyle = C.skin; g.fill();
    // skin shadow: lower-left crescent of the skull and of the hairline edge, plus the fringe's cast shadow on the forehead
    g.save();
    g.beginPath(); tk.trace(g, mon ? skull : FACE_REGION); g.clip();
    g.fillStyle = C.skinSh;
    g.beginPath(); g.rect(-100, -100, 200, 200); tk.trace(g, skull, RJ.lx(4.5), -8); g.fill('evenodd');
    if (!mon) { g.beginPath(); g.rect(-100, -100, 200, 200); tk.trace(g, FACE_REGION, RJ.lx(3.2), -4); g.fill('evenodd'); }
    g.beginPath(); tk.trace(g, { poly: MASS_LOW.concat([[-60, -100], [60, -100]]) }, RJ.lx(1.5), 7); g.fill();
    g.restore();
    if (!mon) {                                                    // the stubble side only: a thin darker lower-left edge and a few short stubble ticks
      g.save();
      g.beginPath(); g.rect(-100, -100, 200, 200); tk.trace(g, FACE_REGION); g.clip('evenodd');
      g.globalAlpha = 0.7; g.fillStyle = H.stubDk;
      g.beginPath(); g.rect(-100, -100, 200, 200); tk.trace(g, skull, RJ.lx(4), -7); g.fill('evenodd');
      g.globalAlpha = 1;
      RJ.hatch(g, [[-52, -18, -49, -15], [-50, -4, -47, -1], [-53, 8, -50, 11], [-47, -28, -44, -25], [-55, -30, -52, -27], [-47, 12, -45, 15], [-52, 17, -49, 19], [-45, 2, -42, 4]], { w: 0.8, color: H.stubDk, alpha: 0.5 });
      g.restore();
    }
    g.restore();
    RJ.drawFace(g, S);
    RJ.ink(g, skull, { closed: true, w: LINE.main + 0.4, color: C.ink, align: 0.2, weightVar: 0.5 });
    if (!mon) {
      RJ.ink(g, HAIRLINE.slice(0, 5), { w: LINE.main, color: C.ink, taper: 0.15, pressure: 'flat', wobble: 0.03 });
      RJ.ear(g, -51, 23, { r: 15.5, side: -1 });
    }
  }

  function faceSpec() {
    return {
      // narrow, half-lidded almond eyes (the card's cool, cheeky look), slate-blue irises, thick brown brows at about 20 degrees close above the lids
      eyes: [{ x: -16, y: 16, w: 31, h: 21 }, { x: 40, y: 15, w: 27, h: 20 }],
      brows: [[-16.5, -5.5, 27], [45, -5, 25]],
      browStyle: { thick: 5.8, arch: 0.5, tilt: 0.32, color: '#5a2c18' },
      nose: [18, 29, 60],
      mouth: [12, 41, 18],
      mouthStyle: { teeth: true, lineW: 1.4, puff: true },
      blush: [[-8, 29, 17], [42, 29, 15]],
      sweat: [56, -14, 5],
      eye: { iris: H.iris, ring: '#1c2636', sclera: '#f2eadf', expr: 'neutral', irisW: 0.5, irisH: 0.86, lid: 2.1, wing: 0.55, lash: 1.15, crease: true, lashes: 0, tilt: 0.2, drop: 0.2, hl: [[-0.38, -0.5, 0.3], [-0.3, -0.12, 0.14]] },
    };
  }

  // poses: numbers from RJ.BASE_POSE. Facing +x; the front arm (right of the screen) carries the mic, the back arm is the free one.
  // Brow numbers are added to the face's base tilt (0.32, about 20 degrees on the card): idle 0.3 is the cocky smirk, nothing goes past 0.5 so attack stays
  // fierce but friendly instead of a snarl.
  function poses() {
    const smirk = { eyes: 'open', mouth: 'smirkTeeth', brow: 0.22 };
    return {
      idle: Object.assign({
        mic: 'hand', fHand: [16, 36], fBend: -1, micAng: 1.3, micGrip: 22,
        bHand: [-42, 10], bBend: -1, bKind: 'point', bRot: 0.28, fx: [], headRot: 0.04, torsoRot: -0.02,
      }, smirk),
      sing: { mic: 'mouth', micDx: 5, micDy: 6, micAng: 1.0, fBend: 1, bHand: [-44, -2], bBend: -1, bKind: 'point', bRot: 0.12, eyes: 'open', mouth: 'beat', brow: 0.1, headRot: -0.03, fx: ['notes'], look: [0.4, 0] },
      attack: { mic: 'mouth', micDx: 6, micDy: 5, micAng: 0.95, fBend: 1, lean: 0.1, torsoRot: 0.07, headRot: 0.07, headDx: 3, bHand: [-34, -30], bBend: -1, bKind: 'fist', bRot: -0.3,
        fFoot: [34, -12], bFoot: [-26, -12], eyes: 'determined', mouth: 'beat', brow: 0.5, fx: ['burst'], look: [0.5, 0] },
      hurt: { mic: 'hand', fHand: [4, 38], fBend: -1, micAng: 1.9, micGrip: 22, lean: -0.13, torsoRot: -0.08, headRot: -0.14, headDx: -3, bHand: [-34, -8], bBend: -1, bKind: 'open', bSpread: 1.3, bFront: 1,
        fFoot: [12, -12], bFoot: [-20, -12], eyes: 'hurt', mouth: 'ow', brow: -0.7, sweat: 1, blush: 0.6, fx: ['stars'] },
      cheer: { mic: 'hand', fHand: [46, -34], fBend: 1, micAng: 1.45, micGrip: 22, bHand: [-46, -34], bBend: -1, bKind: 'fist', bRot: -0.2, eyes: 'happy', mouth: 'grin', brow: -0.2, headRot: 0.04,
        fFoot: [20, -12], bFoot: [-18, -12], fx: ['sparkles'] },
      // the new poses (HV_ART_AUDIO 2.5). windup: a crouch with both hands cupped round the mic at the mouth, eyes half shut, the beatbox mouth
      windup: { mic: 'mouth', micDx: 4, micDy: 7, micAng: 1.05, fBend: 1, squash: 0.97, torsoDy: 6, lean: -0.03, headRot: -0.02, bHand: [32, -10], bBend: 1, bKind: 'relaxed', bRot: -1.4, bSpread: 0.6, bFront: 1,
        fFoot: [26, -12], bFoot: [-24, -12], eyes: 'half', mouth: 'beat', brow: 0.3, fx: [], look: [0.4, 0] },
      // strike: the kit attack (the green burst at the mic) leaning 0.06 further in
      strike: { mic: 'mouth', micDx: 6, micDy: 5, micAng: 0.95, fBend: 1, lean: 0.16, bx: 4, torsoRot: 0.07, headRot: 0.07, headDx: 3, bHand: [-34, -30], bBend: -1, bKind: 'fist', bRot: -0.3,
        fFoot: [36, -12], bFoot: [-26, -12], eyes: 'determined', mouth: 'beat', brow: 0.5, fx: ['burst'], look: [0.5, 0] },
      // block: arms crossed over the smiley, the mic tucked under the far arm, chin up, the cocky smirk, green rings
      block: { mic: 'hand', fHand: [-36, 26], fBend: -1, micAng: -0.15, micGrip: 20, bHand: [44, 30], bBend: 1, bKind: 'fist', bRot: 0.2, bFront: 1, headRot: -0.09, torsoRot: -0.02,
        fFoot: [26, -12], bFoot: [-26, -12], eyes: 'open', mouth: 'smirkTeeth', brow: 0.3, fx: ['rings'] },
      // down: sitting cross-legged, the mic dangling from one hand, shoulders slumped, eyes closed, the grey '...' bubble
      down: { mic: 'hand', fHand: [16, 46], fBend: 1, micAng: -1.35, micGrip: 18, by: 52, torsoDy: 4, torsoRot: 0.07, lean: 0.03, headRot: 0.24, headDy: 2, bHand: [-6, 50], bBend: -1, bKind: 'relaxed', bRot: 0.3,
        fFoot: [-12, -60], bFoot: [14, -60], fBow: 24, bBow: -22, fFootRot: -0.5, bFootRot: 0.4, eyes: 'closed', mouth: 'flat', brow: -0.25, blush: 0.6, fx: ['mute'] },
      // walk: the bouncy strut, the free hand clicking its fingers (see the tweak)
      walk: Object.assign({
        mic: 'hand', fHand: [16, 36], fBend: -1, micAng: 1.3, micGrip: 22,
        bHand: [-34, 4], bBend: -1, bKind: 'point', bRot: 0.1, fx: [], headRot: 0.04, torsoRot: -0.02,
      }, smirk),
    };
  }

  // the portrait pose: both hands low so no stray hand or mic ball shows at the edge of the head-and-shoulders crop
  function bustPose() {
    return Object.assign({ mic: 'hand', fHand: [12, 56], fBend: -1, micAng: 1.5, micGrip: 22, bHand: [-14, 56], bBend: 1, bKind: 'relaxed', fx: [], headRot: 0.04, torsoRot: -0.02 }, { eyes: 'open', mouth: 'smirkTeeth', brow: 0.2 });
  }
  // the monster keeps the same poses but points with the free hand in idle (as in the artist's costume picture)
  function monsterPoses() {
    const p = poses();
    p.idle = Object.assign({}, p.idle, { bHand: [-42, 8], bBend: -1, bKind: 'point', bRot: 0.3 });
    return p;
  }

  function makeRoxor(monster) {
    const hair = monster ? '#2f6a1c' : H.hair, hairSh = monster ? '#1c4510' : H.hairSh;
    const fur = H.fur;
    const spec = {
      id: monster ? 'roxor_monster' : 'roxor',
      accent: 'roxor',
      // normal Roxor is the taller of the pair: head and shoulders raised 12 units (the monster keeps the default chunky skeleton)
      skel: monster ? {} : { neck: [0, -158], headC: [2, -216], shF: [26, -143], shB: [-26, -143], hip: [0, -76], hipF: [15, -76], hipB: [-15, -76] },
      base: {},
      poses: Object.assign(monster ? monsterPoses() : poses(), { bust: bustPose() }),
      face: faceSpec(),
      arm: { l: [26, 24], w: monster ? [20, 16] : [18, 14], skin: monster ? fur : C.skin, skinSh: monster ? H.furSh : C.skinSh,
        sleeve: monster ? null : { color: H.tee, shade: H.teeSh, len: 0.78, w0: 24, w1: 28, hi: false, line: 1.5 },
        cuff: monster ? { color: H.furDk, light: H.furSh } : null, hand: { skin: C.skin, shade: C.skinSh } },
      legs: monster ? {
        w: [38, 30], color: fur, shade: H.furSh, pantsOver: true, bow: 2,
        shoe: { color: fur, sole: fur, shade: H.furSh, hi: H.furLt, k: 1.35, paw: true, pawLine: H.furDk },
        decor(g, hip, an) { furTufts(g, [[(hip[0] + an[0]) / 2 - 3, (hip[1] + an[1]) / 2 - 4], [an[0] + 4, an[1] - 6]]); },
      } : {
        w: [37, 26], color: H.pants, shade: H.pantsSh, pantsOver: true, bow: 2, profile: (u) => 1 - 0.28 * u + 0.1 * Math.sin(Math.PI * Math.min(1, u * 1.15)),
        shoe: { color: H.shoe, sole: H.shoeSole, shade: H.shoeSh, toeCap: '#e8f5a0', k: 1.25 },
        decor(g, hip, an) {                                              // ankle cuff and a knee crease
          const dx = an[0] - hip[0], dy = an[1] - hip[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux;
          const qx = an[0] - ux * 8, qy = an[1] - uy * 8;
          RJ.ink(g, [[qx - nx * 10, qy - ny * 10], [qx + nx * 10, qy + ny * 10]], { w: 1.6, color: C.ink, taper: 0.2, wobble: 0 });
          const mx = (hip[0] + an[0]) / 2 - ux * 1, my = (hip[1] + an[1]) / 2;
          RJ.ink(g, [[mx - nx * 4, my - ny * 4], [mx - nx * 11 + ux * 2, my - ny * 11 + uy * 2]], { w: 1.4, color: H.pantsSh, taper: 0.5, wobble: 0 });
          RJ.ink(g, [[mx + nx * 5, my + ny * 5 + 5], [mx + nx * 10, my + ny * 10 + 7]], { w: 1.3, color: H.pantsSh, taper: 0.5, wobble: 0 });
        },
      },
      mic: { accent: RJ.ACCENT.roxor.main, headR: 10.5, len: 44, bands: 2 },
      bounds: monster ? { w: 240, h: 318, x0: -150, x1: 90 } : { w: 212, h: 332, x0: -122, x1: 90 },     // hair, mane and the widest pose reach (not effects)
      life: { walk: { bob: 3, per: 0.5, head: 0.012, step: { hz: 2, stride: 10, lift: 6 } } },      // the strut bounces a little more than the kit walk
      // the free hand snaps its fingers on every other step of the walk
      tweak(P, t) { if (P.pose === 'walk') P.bKind = Math.sin(Math.PI * t * 2) > 0.2 ? 'fist' : 'point'; },
      bust: { rect: monster ? [-100, -322, 100, -108] : [-92, -338, 92, -126], face: monster ? [-78, -310, 78, -150] : [-70, -322, 64, -152], pose: 'bust' },
      layers: {},
    };
    const L = spec.layers;

    if (!monster) {
      L.mid = (g, S) => {                                              // the mullet tail, lying over the shoulder behind the ear
        const sw = S.P.hairSwing * 0.5;
        MULLET.forEach((m, i) => lockDraw(g, m, i === 0 ? hair : RJ.shade(hair, 0.02), sw * (1 + i * 0.3), { shadow: '#522a17', wMax: m.w, strands: 1, glossAlpha: 0.7 }));
      };
      L.head = (g, S) => { faceBase(g, S, false); mohawk(g, S, hair, hairSh); };
      L.torso = (g, S) => teeAndPants(g, S);
    } else {
      L.backHair = (g, S) => hoodBack(g, S);
      L.head = (g, S) => {
        faceBase(g, S, true);
        hoodFront(g, S);
        mohawk(g, S, hair, hairSh, 0.92, '#5aa634', '#7cc24a');
        horns(g, S);
        hoodEyes(g, S);
      };
      L.torso = (g, S) => onesie(g, S);
    }
    return spec;
  }

  // ---- the normal outfit ----
  const TEE = [[-13, -154], [13, -154], [33, -147], [38, -130], [38, -104], [41, -77, 1], [24, -73], [0, -71.5], [-24, -73], [-41, -77, 1], [-38, -104], [-38, -130], [-33, -147]];
  function teeAndPants(g, S) {
    RJ.neck(g, 2, -166, { w: 22, h: 20 });
    RJ.cel(g, TEE, H.tee, { shadow: H.teeSh, line: LINE.main, depth: 8, hi: H.teeHi, hiW: 1.6, hiAlpha: 0.7, rim: '#85756a', rimW: 1.6, rimSide: 'light', rimAlpha: 0.75 });
    // a wide scoop neckline that shows the neck, with a thin lighter rim of tee colour
    RJ.cel(g, [[-17, -155, 1], [-13, -145.5], [0, -139.5], [13, -145.5], [17, -155, 1], [15.5, -155], [11.5, -148], [0, -142.5], [-11.5, -148], [-15.5, -155]], '#5a4e44', { shadow: H.teeSh, line: LINE.fine + 0.3, depth: 1.5, tension: 0.7 });
    RJ.cel(g, [[-15.5, -156, 1], [15.5, -156, 1], [11.5, -148], [0, -142.5], [-11.5, -148]], C.skin, { shadow: C.skinSh, line: false, depth: 3, tension: 0.7 });
    // fold lines
    RJ.ink(g, [[-30, -130], [-22, -118], [-24, -104]], { w: 1.4, color: H.teeHi, taper: 0.5, wobble: 0.02, alpha: 0.8 });
    RJ.ink(g, [[26, -134], [20, -120], [24, -106]], { w: 1.4, color: H.teeHi, taper: 0.5, wobble: 0.02, alpha: 0.8 });
    // the round orange smiley (as big as the card's), slightly right of centre (3/4 view)
    const cx = 6, cy = -111, r = 16.5, f = r / 13;
    RJ.cel(g, tk.circlePts(cx, cy, r, 18), H.orange, { shadow: H.orangeSh, line: LINE.mid, depth: 5, hi: '#ffd08a', hiW: 1.5 });
    RJ.ink(g, [[cx - 5.5 * f, cy - 5 * f], [cx - 5.5 * f, cy - 1.8 * f]], { w: 1.9, color: '#4d2c10', taper: 0.3, wobble: 0 });
    RJ.ink(g, [[cx + 4.5 * f, cy - 5 * f], [cx + 4.5 * f, cy - 1.8 * f]], { w: 1.9, color: '#4d2c10', taper: 0.3, wobble: 0 });
    RJ.ink(g, [[cx - 8.5 * f, cy + 1.2 * f], [cx - 4 * f, cy + 6.4 * f], [cx + 2 * f, cy + 7.6 * f], [cx + 7.5 * f, cy + 4.6 * f], [cx + 9 * f, cy + 1 * f]], { w: 2, color: '#4d2c10', taper: 0.3, wobble: 0 });
  }

  // ---- the monster onesie ----
  function furTufts(g, pts) {                                           // small curly 'u' tufts, the cartoon's fur marks (one path for all of them)
    RJ.hatch(g, pts.map((p) => [[p[0] - 3.5, p[1] - 2], [p[0] - 2, p[1] + 1.6], [p[0], p[1] - 0.6], [p[0] + 1.6, p[1] + 1.8], [p[0] + 3.4, p[1] - 1.6]]), { w: 1.3, color: H.furDk, alpha: 0.9 });
  }
  // a scalloped, fluffy closed outline of an ellipse: n soft rounded bumps (quadratic-like arcs, amp = bump height as a share of the radius) with a little cusp
  // between neighbours, like the plush hood on the artist's costume. dir -1 turns the bumps inward (the face opening).
  function furRing(cx, cy, rx, ry, n, amp, phase, dir) {
    const pts = [], sd = dir === -1 ? -1 : 1, steps = 4;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < steps; j++) {
        const t = j / steps, a = (phase || 0) + ((i + t) / n) * TAU, k = 1 + sd * amp * Math.pow(Math.sin(Math.PI * t), 0.85);
        pts.push(j === 0 ? [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 1] : [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
      }
    }
    return pts;
  }
  const HOOD_OUT = () => furRing(-2, -3, 76, 73, 16, 0.05, 0.2), HOOD_IN = () => furRing(4, 6, 55, 58, 20, 0.034, 0.1, -1);
  function hoodBack(g, S) {
    const sw = S.P.hairSwing;
    // the dark fur mane hanging at the back of the hood (left): five soft hair tufts that droop and curl, as on the artist's costume
    const tufts = [[[-62, -34], [-78, -42], [-94, -36]], [[-68, -14], [-86, -19], [-101, -9]], [[-70, 6], [-88, 10], [-101, 22]], [[-66, 26], [-82, 34], [-92, 48]], [[-58, 42], [-71, 53], [-77, 68]]];
    tufts.forEach((s2, i) => RJ.lock(g, s2, H.furDk, { wMax: 14, w0: 13, w1: 0, tipPow: 1.25, bend: sw * 0.15 * (i + 1), gloss: false, strands: 1, shadow: '#1a350a', line: LINE.main }));
    RJ.cel(g, HOOD_OUT(), H.fur, { shadow: H.furSh, line: LINE.main, depth: 9, hi: H.furLt, hiW: 2, tension: 0.9 });
  }
  function hoodFront(g, S) {
    const outer = HOOD_OUT(), inner = HOOD_IN();
    g.save();
    g.beginPath(); tk.trace(g, outer); tk.trace(g, inner); g.fillStyle = H.fur; g.fill('evenodd');
    // hard shadow band on the lower-left of the ring (key light from the upper right)
    g.save(); g.beginPath(); tk.trace(g, outer); tk.trace(g, inner); g.clip('evenodd');
    g.fillStyle = H.furSh; g.beginPath(); g.rect(-100, -100, 200, 200); tk.trace(g, outer, RJ.lx(6), -9); g.fill('evenodd');
    g.restore();
    g.restore();
    RJ.ink(g, outer, { closed: true, w: LINE.main + 0.3, color: C.ink, align: 0.3 });
    RJ.ink(g, inner, { closed: true, w: LINE.main, color: C.ink, align: -0.3 });
    furTufts(g, [[-62, -22], [-66, 6], [-52, 38], [58, -40], [66, -4], [60, 30], [-30, 64], [22, 66], [-6, -66], [40, -62], [-42, -58]]);
  }
  function horns(g, S) {
    // two short thick cream horns with ridges, sitting close to the face on the top of the hood, a darker ring band at the base
    [[-1, [[-55, -60], [-58, -72], [-56, -84], [-50, -95, 1], [-47, -84], [-44, -72], [-38, -61]]], [1, [[59, -60], [62, -72], [60, -84], [54, -95, 1], [51, -84], [48, -72], [42, -61]]]].forEach((h) => {
      const sd = h[0], pts = h[1], b0 = sd < 0 ? -55 : 59;
      RJ.cel(g, pts, H.horn, { shadow: H.hornSh, line: LINE.main, depth: 5, hi: '#fff0d2', hiW: 1.3, tension: 0.8, decor: (gg) => {
        const bx = sd < 0 ? [-57, -37] : [43, 63];
        RJ.fillPts(gg, [[bx[0], -58], [bx[1], -58], [bx[1], -66], [bx[0], -67]], '#d29a62', 0.9);                       // the darker ring band at the base
        RJ.ink(gg, [[bx[0], -66.5], [(bx[0] + bx[1]) / 2, -68], [bx[1], -66]], { w: 1.2, color: H.hornSh, taper: 0.3, wobble: 0 });
        [[-58, -74, -45, -76], [-57, -83, -48, -85]].forEach((r) => {
          const x0 = sd < 0 ? r[0] : 4 - r[0], x1 = sd < 0 ? r[2] : 4 - r[2];
          RJ.ink(gg, [[x0, r[1]], [(x0 + x1) / 2, r[1] - 2.5], [x1, r[3]]], { w: 1.2, color: H.hornSh, taper: 0.3, wobble: 0 });
        });
      } });
    });
  }
  // the two round monster eyes on the hood (bible 7.1), sitting on the fur ring under the horns, looking where he looks
  function hoodEyes(g, S) {
    const lk = S.face && S.face.look ? S.face.look : [0.3, 0];
    [[-64, -44, 10.5], [62, -42, 9.5]].forEach((e) => {
      RJ.cel(g, tk.circlePts(e[0], e[1], e[2], 16), '#fffaf1', { shadow: '#e2d9c7', line: LINE.main, depth: e[2] * 0.25, hi: false });
      const px = e[0] + (lk[0] || 0) * e[2] * 0.25, py = e[1] + 1 + (lk[1] || 0) * e[2] * 0.2;
      g.beginPath(); g.arc(px, py, e[2] * 0.52, 0, TAU); g.fillStyle = '#1d1c22'; g.fill();
      g.beginPath(); g.arc(px - e[2] * 0.2, py - e[2] * 0.22, e[2] * 0.2, 0, TAU); g.fillStyle = '#ffffff'; g.fill();
    });
  }
  const ONESIE_BODY = [[-30, -142], [30, -142], [42, -130], [44, -108], [42, -84], [38, -60], [34, -44], [8, -40], [0, -47], [-8, -40], [-34, -44], [-38, -60], [-42, -84], [-44, -108], [-42, -130]];
  function onesie(g, S) {
    RJ.neck(g, 2, -154, { w: 22, h: 20 });
    RJ.cel(g, ONESIE_BODY, H.fur, { shadow: H.furSh, line: LINE.main, depth: 9, hi: H.furLt, hiW: 1.8, tension: 0.9 });
    // the orange smiley on the belly, big
    const cx = 5, cy = -92, r = 21;
    RJ.cel(g, tk.circlePts(cx, cy, r, 18), H.orange, { shadow: H.orangeSh, line: LINE.mid, depth: 6, hi: '#ffd08a', hiW: 1.6 });
    RJ.ink(g, [[cx - 8, cy - 8], [cx - 8, cy - 3]], { w: 2.2, color: '#4d2c10', taper: 0.3, wobble: 0 });
    RJ.ink(g, [[cx + 7, cy - 8], [cx + 7, cy - 3]], { w: 2.2, color: '#4d2c10', taper: 0.3, wobble: 0 });
    RJ.ink(g, [[cx - 13, cy + 1], [cx - 6, cy + 10], [cx + 2, cy + 12], [cx + 10, cy + 8], [cx + 13, cy + 1]], { w: 2.4, color: '#4d2c10', taper: 0.3, wobble: 0 });
    // the zip pull cord hanging from the neck down over the belly with a little knob at the end, as on the card
    RJ.ink(g, [[-9, -141], [-14, -128], [-13, -112], [-15, -97]], { w: 3.4, color: C.ink, taper: 0, wobble: 0 });
    RJ.ink(g, [[-9, -141], [-14, -128], [-13, -112], [-15, -97]], { w: 1.8, color: '#b8d96a', taper: 0, wobble: 0 });
    RJ.cel(g, tk.ellipsePts(-15, -95, 2.8, 3.6, 8), '#b8d96a', { shadow: '#7fa83a', line: LINE.fine + 0.2, depth: 1 });
    furTufts(g, [[-28, -120], [28, -122], [-30, -80], [32, -76], [-18, -58], [20, -56], [-6, -130]]);
  }

  RJ.register('roxor', RJ.rig(makeRoxor(false)));
  RJ.register('roxor_monster', RJ.rig(makeRoxor(true)));
  }

  // jasmin.js: Jasmin (id 'jasmin', accent PINK) and her unicorn onesie skin ('jasmin_unicorn'). The attack hero, an angelic soft singer (not a belter).
  // Built on kit.js (RJ.rig). Both skins share ONE face, built on an explicit grid (see FG below) and drawn by this file's own face code (jFace).
  // Identity: glossy brown hair in a HIGH PONYTAIL with a pink scrunchie and a pink hair clip, big warm brown eyes with a pink flower sparkle in each iris, long
  // lashes, a hoop earring, a pearl necklace with a pink heart, a pink sleeveless dress with a fitted waist and pleated flared skirt, white socks, white
  // and pink sneakers, a black mic with a pink band, a happy open smile. Faces slightly to the viewer's right (the card is mirrored).
  function castJasmin() {
  const tk = ART.tk, C = RJ.C, LINE = RJ.LINE;
  const TAU = Math.PI * 2, PI = Math.PI;
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : (d === undefined ? 0 : d));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };

  const J = {
    hair: '#5c321b', hairSh: '#3a1d0f', hairLt: '#85502d', streak: '#bd7246',
    dress: '#fd9bb4', dressSh: '#ea7897', dressLt: '#ffbccb', pleat: '#f58aa6',
    pink: '#ff7fb2', pinkDk: '#d9457f', scrunchie: '#ff9bc0',
    white: '#fffaf4', whiteSh: '#ead9d6', pearl: '#fffdf8', pearlSh: '#d9cfd0',
    flower: '#ff8fb9', flowerCore: '#ffd9e6',
    silver: '#cfd5de', hoopGold: '#f4c64e', hoopHi: '#fff1b8',
    brow: '#5a3321', lash: '#2d170f',
  };

  // ==================================================================================================================================
  // THE FACE GRID (head space: origin = head centre, y up is negative, the face turned to +x by the card's slight 3/4 view)
  // ==================================================================================================================================
  //   face width     the skull is x -62 .. 59.5 (121.5 wide, about 4.2 mean eye widths) and y -58 .. 60.3 (a soft rounded jaw that tapers to a small round chin whose lowest point is ON the centre line)
  //   centre line    x = cx = 9: nose, mouth and chin sit exactly on it. The 3/4 turn moves it about +10 from the skull centre (x -1).
  //   eye line       y = eyeY = 7: the vertical middle of the face oval (hairline about -50 at the centre line, chin 60.3, middle 5; the iris sits on the line)
  //   eyes           both 31 high on the same line. Near eye 31 wide, far eye 27.3 (88%, the card's only 3/4 concession). One eye width (29, the mean of the two)
  //                  between the inner corners, split evenly by the centre line: inner corners at cx -+ 14.5, outer corners at cx - 45.5 and cx + 41.7.
  //   brows          mirrored arches 31 above the eye line (lifted), inner ends at cx -+ 15.5, 84% of their eye's width
  //   nose           tip y = eyeY + 17, mouth line y = eyeY + 30 (23.5 wide), blushes y = eyeY + 21 centred under each eye
  //   ears           near ear centre y = 8, r 15.5: the top level with the upper lid line (y -9), the lobe level with the nose tip (y 23); the far ear mirrors it, smaller
  const FG = (() => {
    const cx = 9, eyeY = 7, eyeH = 31, wN = 31, wF = 27.3, gap = 29;
    const nearX = cx - gap / 2 - wN / 2, farX = cx + gap / 2 + wF / 2;
    return {
      cx, eyeY, eyeH, wN, wF, gap,
      near: { x: nearX, y: eyeY, w: wN, h: eyeH }, far: { x: farX, y: eyeY, w: wF, h: eyeH },
      browWn: 26, browWf: 23, browY: eyeY - 31, noseY: eyeY + 17, mouthY: eyeY + 30, mouthW: 23.5, blushY: eyeY + 21,
      earY: 8, earR: 15.5,
    };
  })();

  // ---- the skull: a smooth outline, soft rounded jaw with a gentle taper, the small chin at x = cx ----
  const SKULL = [[-2, -58], [30, -54], [51, -36], [59.5, -8], [59, 11], [53.5, 28], [42, 43], [27, 55.2], [9, 60.4], [-9, 56.4], [-24, 51.5], [-38, 41], [-52, 25], [-60.5, 6], [-62, -10], [-58, -33], [-40, -52]];

  // ---- hair in head space ----
  // Measured on the owners' card, which draws her facing LEFT: MX mirrors card coordinates (card x, y in head units) to our right-facing figure.
  const MX = (list) => list.map((p) => [-p[0] - 4, p[1]]);
  // the hair cap: a ring around the forehead dome. Outer edge = the glossy crown, inner edge = the hairline: a smooth arc with a tiny part and a downward
  // hair tip at x = 4 (a little right of the centre line toward the near side, "centre-ish"), the side bangs sweeping down to the near ear; on the far side the
  // hair ends high at the temple.
  const CAP_OUTER = [[59, -10], [60, -24], [57, -38], [52, -50], [44, -60], [34, -67], [22, -72], [8, -76], [-7, -77], [-22, -76], [-36, -70], [-52, -60], [-64, -44], [-69, -24], [-69.5, -4], [-67.5, 12], [-61, 24]];
  const HAIRLINE = [[-45.5, 12], [-44.5, 3], [-42, -6], [-38, -14], [-32.5, -22.5], [-26, -29.5], [-18.5, -35.5], [-11, -40], [-4, -43.6], [1, -45.6], [3, -47.2], [4.4, -43.6, 1], [6.4, -48.4], [11, -50.6], [20, -52], [30, -50.6], [40, -46.8], [48.5, -40], [54.5, -29.5], [58, -17], [59, -8]];
  const CAP = CAP_OUTER.concat(HAIRLINE);
  const CAP_SOFT = CAP_OUTER.concat(HAIRLINE.filter((p, i) => i < 10 || i > 12));            // the same ring without the part tip, for the cast shadow on the forehead

  function capDecor(g) {
    // lit band along the crown from the part toward the ponytail, then long dark flow lines and light hatch streaks
    RJ.fillPts(g, [[34, -66], [14, -74], [-8, -75], [-30, -70], [-40, -62], [-28, -62], [-8, -67], [14, -65], [30, -58]], J.hairLt, 0.8);
    const lines = [[[-3, -44], [10, -58], [30, -69], [48, -72]], [[12, -47], [28, -58], [46, -63]], [[28, -50], [42, -56], [54, -52]], [[-50, -46], [-42, -62], [-28, -72]], [[-36, -52], [-26, -66]], [[-20, -50], [-12, -64], [0, -72]], [[40, -30], [52, -34], [60, -24]]];
    lines.forEach((l, i) => RJ.ink(g, MX(l), { w: 1.4, color: J.hairSh, taper: 0.5, wobble: 0.02, alpha: 0.95, seed: i }));
    const hatch = [[[-14, -70], [-8, -62]], [[-10, -72], [-4, -64]], [[-4, -73], [2, -66]], [[4, -70], [9, -62]], [[10, -66], [14, -59]], [[28, -62], [33, -54]], [[32, -58], [37, -50]], [[-42, -64], [-37, -56]], [[-50, -56], [-46, -48]], [[40, -50], [43, -44]]];
    RJ.hatch(g, hatch.map((h) => MX(h)), { w: 1.1, color: J.streak, alpha: 0.95 });
  }

  // the ponytail: one chunky mass that rises from the scrunchie on the crown (card (36,-72)), arches up and back, then cascades down behind her and ends in
  // an S-curl. Silhouette measured on the card; the inner edge runs behind the head. Card coordinates, mirrored by MX.
  const TAIL_UNM = [[20, -78], [28, -85], [38, -92], [50, -96], [63, -95], [75, -90], [86, -80], [93, -66], [97, -48], [99, -28], [98, -6], [96, 16], [93, 34], [89, 44], [84, 53, 1], [79, 59], [74, 69], [70, 78], [68, 86], [71, 90], [77, 89], [82, 84, 1],
    [80, 92], [75, 97], [67, 99], [58, 96], [49, 91], [40, 83], [33, 72], [30, 60], [33, 47], [42, 35], [52, 22], [58, 6], [63, -14], [56, -36], [44, -56], [34, -64]];
  const TAIL_OUTLINE = MX(TAIL_UNM);
  // the one hard shadow: a band along the side that faces the head (where the hair tucks behind the skull)
  const TAIL_SHADOW = MX([[46, -62], [58, -38], [66, -14], [64, 8], [58, 24], [48, 38], [38, 50], [33, 62], [35, 74], [42, 85], [52, 93], [64, 99], [68, 92], [56, 84], [47, 74], [46, 62], [52, 50], [60, 38], [68, 22], [76, 2], [78, -22], [72, -46], [62, -68], [50, -78]]);
  const TAIL_LINES = [[[34, -86], [48, -90], [63, -85], [76, -70]], [[40, -74], [54, -82], [68, -74], [76, -54]], [[78, -62], [86, -42], [88, -12], [85, 18], [79, 40], [75, 52]], [[72, -34], [78, -6], [76, 26], [68, 50], [58, 70], [52, 86]], [[90, -14], [91, 12], [88, 32]], [[64, 70], [63, 82], [66, 92], [72, 95]]];
  const TAIL_HATCH = [[[52, -92], [58, -87]], [[58, -93], [64, -88]], [[64, -91], [70, -85]], [[86, -44], [88, -32]], [[88, -30], [90, -16]], [[80, 28], [81, 40]], [[84, 22], [85, 32]], [[66, 58], [67, 70]], [[71, 60], [72, 72]], [[72, -66], [76, -58]]];
  // two light bands: along the crown of the arc and on the curl at the tip (the lit side, upper right)
  const TAIL_LIGHT = [[[40, -86], [54, -92], [68, -89], [80, -79], [87, -66], [83, -66], [75, -76], [64, -82], [52, -85], [42, -81]], [[88, 38], [84, 52], [78, 66], [74, 80], [73, 87], [76, 84], [80, 70], [86, 56], [90, 42]]];
  function ponytail(g, S) {
    g.save();
    g.translate(-39, -72); g.rotate(0.09 + S.P.hairSwing * 0.05); g.translate(39, 72);        // a gentle sway of the whole tail about the scrunchie
    RJ.cel(g, TAIL_OUTLINE, J.hair, { shadow: false, line: LINE.main + 0.2, tension: 0.85, weightVar: 0.3, decor: (gg) => {
      RJ.fillPts(gg, TAIL_SHADOW, J.hairSh, 0.55);
      TAIL_LIGHT.forEach((l) => RJ.fillPts(gg, MX(l), J.hairLt, 0.75));
      TAIL_LINES.forEach((l, i) => RJ.ink(gg, MX(l), { w: 1.5, color: J.hairSh, taper: 0.45, wobble: 0.03, alpha: 0.95, seed: i }));
      RJ.hatch(gg, TAIL_HATCH.map((h) => MX(h)), { w: 1.15, color: J.streak, alpha: 0.95 });
    } });
    g.restore();
  }

  function scrunchie(g, pal) {
    // one smooth band wrapped round the root of the tail, as on the card: a curved strip across the root (about (22,-82) to (49,-67) in card coordinates), fuller
    // in the middle, with one outline, a lighter sheen along its top and a single darker fold line
    const P = pal || { base: J.scrunchie, shade: J.pink, hi: '#ffd3e2', fold: J.pinkDk };
    const cx = 35.5, cy = -75, an = 0.46, ca = Math.cos(an), sa = Math.sin(an), top = [], bot = [];
    for (let i = 0; i <= 8; i++) {
      const s = -1 + i / 4, lx = s * 16, ly = -3 * (1 - s * s), hw = 5.5 - 1.7 * s * s;
      top.push([cx + lx * ca - (ly - hw) * sa, cy + lx * sa + (ly - hw) * ca]);
      bot.push([cx + lx * ca - (ly + hw) * sa, cy + lx * sa + (ly + hw) * ca]);
    }
    RJ.cel(g, MX(top.concat(bot.reverse())), P.base, { shadow: P.shade, line: LINE.main, depth: 3, hi: P.hi, hiW: 1.4, tension: 0.9 });
    RJ.ink(g, MX([[cx + 4.2 * ca + 4.5 * sa, cy + 4.2 * sa - 4.4 * ca], [cx + 5.2 * ca - 4 * sa, cy + 5.2 * sa + 4.1 * ca]]), { w: 1.3, color: P.fold, taper: 0.4, wobble: 0, alpha: 0.75 });
  }
  function hairClip(g) {
    // a snap clip: solid pink with a lighter pink core and a thin darker slit
    g.save(); g.translate(-57, -25); g.rotate(0.38);
    RJ.cel(g, [[0, -14.5], [4.6, -12], [5.8, -4], [4.2, 6], [1.6, 14], [-1.6, 14], [-4.2, 6], [-5.8, -4], [-4.6, -12]], J.pink, { shadow: J.pinkDk, line: LINE.mid, depth: 3, hi: '#ffc2d9', hiW: 1.3, tension: 0.9 });
    RJ.cel(g, [[0, -10], [2.8, -7], [3.4, -1], [2.2, 5], [0.6, 9.5], [-0.6, 9.5], [-2.2, 5], [-3.4, -1], [-2.8, -7]], '#ffb3cd', { shadow: false, line: LINE.fine, lineColor: J.pinkDk, tension: 0.9 });
    RJ.ink(g, [[0, -6.5], [0.2, 0], [0, 6.5]], { w: 1.0, color: J.pinkDk, taper: 0.5, wobble: 0, alpha: 0.85 });
    g.restore();
  }
  // the hoop hangs from the near ear lobe (ear centre x, y)
  function hoop(g, ex, ey) {
    const x = ex + 1, y = ey + 27;
    g.save(); g.lineWidth = 3.6; g.strokeStyle = C.ink; g.beginPath(); g.ellipse(x, y, 6.2, 8.8, 0.1, 0, TAU); g.stroke();
    g.lineWidth = 1.9; g.strokeStyle = J.hoopGold; g.beginPath(); g.ellipse(x, y, 6.2, 8.8, 0.1, 0, TAU); g.stroke();       // a gold hoop (bible 3.1)
    g.lineWidth = 0.9; g.strokeStyle = J.hoopHi; g.beginPath(); g.ellipse(x, y, 6.2, 8.8, 0.1, 3.6, 4.6); g.stroke();
    g.restore();
  }

  // ==================================================================================================================================
  // THE FACE (jFace): blush, nose, eyes, brows, mouth, all from the grid above, mirrored about x = FG.cx
  // ==================================================================================================================================
  const bezP = (P, t) => {
    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [a * P[0][0] + b * P[1][0] + c * P[2][0] + d * P[3][0], a * P[0][1] + b * P[1][1] + c * P[2][1] + d * P[3][1]];
  };
  const bezT = (P, t) => {                                              // the unit tangent
    const u = 1 - t;
    const dx = 3 * u * u * (P[1][0] - P[0][0]) + 6 * u * t * (P[2][0] - P[1][0]) + 3 * t * t * (P[3][0] - P[2][0]);
    const dy = 3 * u * u * (P[1][1] - P[0][1]) + 6 * u * t * (P[2][1] - P[1][1]) + 3 * t * t * (P[3][1] - P[2][1]);
    const l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  };
  const bezPts = (P, a, b, n) => { const o = []; for (let i = 0; i <= n; i++) o.push(bezP(P, lerp(a, b, i / n))); return o; };
  const rgba = (hex, a) => U.color.rgba(hex, clamp(num(a), 0, 1).toFixed(3));
  const canGrad = (g) => typeof g.createLinearGradient === 'function' && typeof g.createRadialGradient === 'function';

  // eye presets for the open eye: o = how far the lids open (1 full), tilt = inner corner drop (+ angry, - sad), wide = size multiplier
  const EYE_PRE = {
    open: { o: 1 }, neutral: { o: 1 }, half: { o: 0.56, tilt: 0.1 }, sleepy: { o: 0.36, tilt: -0.16 }, wide: { o: 1, wide: 1.1 },
    determined: { o: 0.86, tilt: 0.45 }, angry: { o: 0.78, tilt: 0.85 }, sad: { o: 0.92, tilt: -0.6 }, smirk: { o: 0.74, tilt: 0.26 },
  };

  // The two lid curves of an eye in its local frame (inner corner at -a, outer corner at +a, up is -y). k.open blends the upper lid toward the lower one.
  function eyeCurves(a, b, k) {
    const o = clamp(num(k.open, 1), 0, 1), tl = num(k.tilt);
    const I = [-a, 0.2 * b + tl * b * 0.22], O = [a, -0.08 * b - tl * b * 0.16];
    const chord = (x) => I[1] + ((x + a) / (2 * a)) * (O[1] - I[1]);
    const yc = (x) => chord(x) + 0.5 * b * (1 - (x / a) * (x / a));            // where both lids meet when the eye is shut: a soft downward bow, like the closed eye
    const ux1 = -0.72 * a, ux2 = 0.62 * a, lx1 = 0.66 * a, lx2 = -0.5 * a, lo = Math.sqrt(o);
    const U1 = [ux1, lerp(yc(ux1), -1.4 * b + tl * b * 0.5 * 0.72, o)], U2 = [ux2, lerp(yc(ux2), -1.32 * b - tl * b * 0.5 * 0.62, o)];
    const L1 = [lx1, lerp(yc(lx1), 1.12 * b, lo)], L2 = [lx2, lerp(yc(lx2), 1.2 * b, lo)];
    return { I, O, up: [I, U1, U2, O], lo: [O, L1, L2, I] };
  }
  function lash(g, p, dir, len, w, col, alpha) {
    tk.inkPath(g, [[p[0], p[1]], [p[0] + dir[0] * len * 0.55 + dir[1] * len * 0.06, p[1] + dir[1] * len * 0.55 - dir[0] * len * 0.06], [p[0] + dir[0] * len, p[1] + dir[1] * len]],
      { w, color: col, taper: 0.55, wobble: 0, weightVar: 0, alpha });
  }

  // the open eye: sclera, a graduated brown iris, two catchlights, the pink flower sparkle, lid shade, a refined upper lash line with a wing, a floating crease, lashes
  function openEye(g, e, side, st, pre) {
    const wide = pre.wide || 1, a = e.w / 2 * wide, b = e.h / 2 * wide, sx = side < 0 ? -1 : 1;   // sx: local x -> figure x
    const ss = sx * (RJ._flip ? -1 : 1);                                                         // ss: local x -> screen x (a flipped figure keeps the card's light sides on screen)
    const open = clamp(num(st.open, 1), 0, 1) * clamp(pre.o, 0, 1);
    const cv = eyeCurves(a, b, { open, tilt: pre.tilt });
    const look = st.look || [0, 0];
    const rx = a * 0.74, ry = b * 0.9, icx = (num(look[0]) * 0.06 * sx - 0.07) * a, icy = b * 0.03 + num(look[1]) * b * 0.14;
    const W = a * 0.22, lashCol = J.lash;
    g.save();
    g.translate(e.x, e.y); if (side < 0) g.scale(-1, 1);
    const shape = () => { g.beginPath(); g.moveTo(cv.up[0][0], cv.up[0][1]); g.bezierCurveTo(cv.up[1][0], cv.up[1][1], cv.up[2][0], cv.up[2][1], cv.up[3][0], cv.up[3][1]); g.bezierCurveTo(cv.lo[1][0], cv.lo[1][1], cv.lo[2][0], cv.lo[2][1], cv.lo[3][0], cv.lo[3][1]); g.closePath(); };
    g.save();
    shape(); g.clip();
    g.fillStyle = '#fffdfa'; g.fillRect(-a * 1.4, -b * 1.5, a * 2.8, b * 3);
    // the lid's soft shade across the top of the white
    g.fillStyle = 'rgba(214,166,158,0.34)'; g.fillRect(-a * 1.4, -b * 1.5, a * 2.8, b * 1.5 + b * lerp(0.2, -0.46, clamp(open, 0, 1)) );
    // iris: a vertical oval, graduated from a deep brown top to a warm amber bottom
    g.save();
    g.beginPath(); g.ellipse(icx, icy, rx, ry, 0, 0, TAU); g.clip();
    if (canGrad(g)) {
      const gr = g.createLinearGradient(0, icy - ry, 0, icy + ry);
      gr.addColorStop(0, '#26130a'); gr.addColorStop(0.34, '#3d2210'); gr.addColorStop(0.62, '#62401c'); gr.addColorStop(1, '#8e5b2b');
      g.fillStyle = gr;
    } else g.fillStyle = '#4c2b14';
    g.fillRect(icx - rx - 1, icy - ry - 1, rx * 2 + 2, ry * 2 + 2);
    g.fillStyle = 'rgba(214,150,84,0.34)'; g.beginPath(); g.ellipse(icx, icy + ry * 0.66, rx * 0.8, ry * 0.36, 0, 0, TAU); g.fill();       // the lower glow
    g.strokeStyle = 'rgba(255,222,168,0.42)'; g.lineWidth = Math.max(0.7, a * 0.06); g.beginPath(); g.ellipse(icx, icy, rx * 0.86, ry * 0.88, 0, 0.18 * PI, 0.78 * PI); g.stroke();   // reflected light low in the iris
    g.fillStyle = 'rgba(24,10,4,0.38)'; g.beginPath(); g.ellipse(icx, icy - ry * 0.02, rx * 0.4, ry * 0.42, 0, 0, TAU); g.fill();             // the pupil
    g.restore();
    g.lineWidth = Math.max(0.8, a * 0.05); g.strokeStyle = '#2a1408'; g.beginPath(); g.ellipse(icx, icy, rx, ry, 0, 0, TAU); g.stroke();
    // two catchlights, on the viewer's left of the iris on screen (as on the card, flipped or not): a big round one and a small one under it
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(icx + ss * -0.4 * rx, icy - 0.42 * ry, Math.max(1.3, 0.25 * rx), 0, TAU); g.fill();
    g.beginPath(); g.arc(icx + ss * -0.22 * rx, icy - 0.05 * ry, Math.max(0.8, 0.11 * rx), 0, TAU); g.fill();
    g.restore();
    // the pink flower sparkle (upper right of the iris on screen) and two small pink dashes low left
    if (open > 0.45) {
      const fr = Math.max(2.2, rx * 0.33), fx = icx + ss * 0.34 * rx, fy = icy - 0.3 * ry;
      g.save();
      for (let i = 0; i < 5; i++) { const an = -PI / 2 + (i / 5) * TAU; g.beginPath(); g.ellipse(fx + Math.cos(an) * fr * 0.62, fy + Math.sin(an) * fr * 0.62, fr * 0.6, fr * 0.45, an, 0, TAU); g.fillStyle = J.flower; g.fill(); }
      g.beginPath(); g.arc(fx, fy, fr * 0.3, 0, TAU); g.fillStyle = J.flowerCore; g.fill();
      tk.inkPath(g, [[icx + ss * -0.5 * rx, icy + ry * 0.4], [icx + ss * -0.34 * rx, icy + ry * 0.52]], { w: 1.4, color: J.flower, taper: 0.4, wobble: 0, weightVar: 0 });
      tk.inkPath(g, [[icx + ss * -0.44 * rx, icy + ry * 0.6], [icx + ss * -0.28 * rx, icy + ry * 0.72]], { w: 1.1, color: J.flower, taper: 0.4, wobble: 0, weightVar: 0 });
      g.restore();
    }
    // the sclera's thin lower outline
    tk.inkPath(g, bezPts(cv.lo, 0, 1, 12), { w: 1.0, color: '#4a2a1c', alpha: 0.85 * smooth(open / 0.4), taper: 0.4, wobble: 0, weightVar: 0, step: 1.5 });
    // the upper lash line: thin at the inner corner, fullest across the outer half, ending in a small wing; one even stroke
    const up = bezPts(cv.up, 0, 1, 16);
    const wing = [[a * 1.1, cv.O[1] + b * 0.05], [a * 1.25, cv.O[1] - b * 0.1 * (0.4 + 0.6 * open)]];
    const stroke = up.concat(wing);
    tk.inkPath(g, stroke, { w: W, color: lashCol, taper: 0, pressure: (u) => (u < 0.55 ? 0.2 + 0.8 * Math.pow(smooth(u / 0.55), 1.2) : u < 0.8 ? 1 : 1 - 0.88 * smooth((u - 0.8) / 0.2)), wobble: 0, weightVar: 0, step: 1.5 });
    if (open > 0.5) {
      // three small lashes fanning out of the outer end, each a little shorter, and a floating crease line above the lid
      [[0.7, a * 0.2, 1.5], [0.83, a * 0.18, 1.3], [0.95, a * 0.15, 1.1]].forEach((l) => {
        const p = bezP(cv.up, l[0]), tg = bezT(cv.up, l[0]), nrm = [tg[1], -tg[0]];
        lash(g, p, [nrm[0] * 0.8 + tg[0] * 0.6, nrm[1] * 0.8 + tg[1] * 0.6], l[1], l[2], lashCol, 1);
      });
      const cr = []; for (let i = 0; i <= 8; i++) { const t = lerp(0.24, 0.74, i / 8), p = bezP(cv.up, t); cr.push([p[0] + a * 0.02, p[1] - b * 0.3 - b * 0.05 * Math.sin(PI * i / 8)]); }
      tk.inkPath(g, cr, { w: 0.95, color: J.hair, alpha: 0.62 * smooth((open - 0.5) / 0.4), taper: 0.5, wobble: 0, weightVar: 0, step: 1.5 });
    }
    // a thin lower lash hint at the outer end
    { const p = bezP(cv.lo, 0.04), tg = bezT(cv.lo, 0.04); lash(g, p, [tg[1] * 0.7 - tg[0] * 0.7, -tg[0] * 0.7 - tg[1] * 0.7], a * 0.2, 0.9, lashCol, 0.7); }
    g.restore();
  }

  // a closed eye: an arc with the same even lash line. happy = bowed up (smiling eyes), otherwise bowed down (a soft closed eye for singing)
  function closedEye(g, e, side, happy) {
    const a = e.w / 2, b = e.h / 2, W = a * 0.22;
    const P = happy ? [[-a, 0.3 * b], [-0.5 * a, -0.92 * b], [0.46 * a, -0.96 * b], [a, 0.24 * b]] : [[-a, -0.1 * b], [-0.46 * a, 0.7 * b], [0.5 * a, 0.7 * b], [a, -0.2 * b]];
    g.save();
    g.translate(e.x, e.y + (happy ? 0 : b * 0.12)); if (side < 0) g.scale(-1, 1);
    tk.inkPath(g, bezPts(P, 0, 1, 16), { w: W * 0.98, color: J.lash, taper: 0, pressure: (u) => (u < 0.5 ? 0.35 + 0.65 * smooth(u / 0.5) : 1 - 0.8 * smooth((u - 0.62) / 0.38)), wobble: 0, weightVar: 0, step: 1.5 });
    [[0.66, a * 0.2, 1.4], [0.8, a * 0.18, 1.25], [0.93, a * 0.15, 1.1]].forEach((l) => {
      const p = bezP(P, l[0]), tg = bezT(P, l[0]), nrm = happy ? [tg[1], -tg[0]] : [-tg[1], tg[0]];
      lash(g, p, [nrm[0] * 0.78 + tg[0] * 0.62, nrm[1] * 0.78 + tg[1] * 0.62], l[1], l[2], J.lash, 1);
    });
    g.restore();
  }

  function jEye(g, e, side, st) {
    const nm = st.eyes === 'open' || !st.eyes ? 'open' : st.eyes;
    if (nm === 'hurt') { RJ.hurtEye(g, e, side, { ink: J.lash, hurtLine: 2.3 }); return; }
    if (nm === 'closed' || nm === 'happy') { closedEye(g, e, side, nm === 'happy'); return; }
    openEye(g, e, side, st, Object.prototype.hasOwnProperty.call(EYE_PRE, nm) ? EYE_PRE[nm] : EYE_PRE.open);
  }

  // a soft arched brow: the arch peaks about 46% along from the inner end, the outer tail dips a little, thin and evenly tapered. side -1 near, +1 far.
  function jBrow(g, x, y, w, side, tilt, th) {
    const sx = side < 0 ? -1 : 1, arch = w * 0.17, pts = [];
    for (let i = 0; i <= 12; i++) {
      const u = i / 12, lx = (u - 0.5) * w, ly = -arch * Math.sin(PI * Math.pow(u, 0.9)) + w * 0.075 * u * u + tilt * w * 0.3 * (0.5 - u);
      pts.push([x + sx * lx, y + ly]);
    }
    tk.inkPath(g, pts, { w: th, color: J.brow, pressure: (u) => (u < 0.25 ? 0.55 + 0.45 * smooth(u / 0.25) : 1 - 0.8 * smooth((u - 0.45) / 0.55)), taperStart: 0.02, taperEnd: 0, wobble: 0, weightVar: 0, step: 1.5 });
  }

  // a small nose hint exactly on the centre line: a tiny curved tick whose middle is on x = cx, and a soft shade dab under it
  function jNose(g) {
    const x = FG.cx, y = FG.noseY;
    g.save(); g.globalAlpha *= 0.28; g.fillStyle = C.skinDeep; g.beginPath(); g.ellipse(x, y + 2.4, 2.3, 1.1, 0, 0, TAU); g.fill(); g.restore();
    tk.inkPath(g, [[x - 0.9, y - 2.4], [x + 0.7, y - 0.1], [x + 0.2, y + 1.9]], { w: 1.25, color: J.hair, alpha: 0.7, taper: 0.5, wobble: 0, weightVar: 0, step: 1 });
  }

  // blush: a soft rose glow with three short slanting marks, mirrored about the centre line (the far one a little smaller)
  function jBlush(g, x, y, w, side, k) {
    const al = clamp(0.28 * k + 0.14, 0.08, 0.6), ww = w * clamp(k, 0.4, 1.7) ** 0.5, sx = side < 0 ? -1 : 1;
    g.save(); g.translate(x, y); g.scale(1, 0.6);
    if (canGrad(g)) {
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, ww * 0.58);
      gr.addColorStop(0, rgba(C.blush, al)); gr.addColorStop(0.5, rgba(C.blush, al * 0.8)); gr.addColorStop(1, rgba(C.blush, 0));
      g.fillStyle = gr;
    } else g.fillStyle = rgba(C.blush, al * 0.6);
    g.beginPath(); g.arc(0, 0, ww * 0.58, 0, TAU); g.fill();
    g.restore();
    g.save(); g.strokeStyle = '#e8707e'; g.globalAlpha *= clamp(0.16 + 0.26 * k, 0.12, 0.6); g.lineWidth = 0.85; g.lineCap = 'round';
    g.beginPath();
    for (let i = 0; i < 3; i++) { const bx = x + sx * (i - 1) * ww * 0.16, by = y + 0.5; g.moveTo(bx - sx * ww * 0.045, by + ww * 0.13); g.lineTo(bx + sx * ww * 0.045, by - ww * 0.13); }
    g.stroke(); g.restore();
  }

  // ---- mouths: symmetric about the centre line, a defined upper lip with a cupid's bow dip, a rose inner mouth and a pink tongue ----
  const MOUTH_HAPPY = [[-0.5, 0.0], [-0.34, -0.045], [-0.17, -0.05], [0, -0.015], [0.17, -0.05], [0.34, -0.045], [0.5, 0.0], [0.48, 0.2], [0.41, 0.4], [0.27, 0.55], [0.1, 0.6], [0, 0.605], [-0.1, 0.6], [-0.27, 0.55], [-0.41, 0.4], [-0.48, 0.2]].map((p) => [p[0] * 1.1, p[1]]);       // a touch wider than tall, like the card's big D
  const MOUTH_SING = [[0, -0.045], [0.14, -0.06], [0.27, 0.02], [0.32, 0.19], [0.28, 0.39], [0.15, 0.53], [0, 0.57], [-0.15, 0.53], [-0.28, 0.39], [-0.32, 0.19], [-0.27, 0.02], [-0.14, -0.06]];
  const MOUTH_OW = [[-0.4, 0.0, 1], [-0.2, -0.05], [0, -0.015], [0.2, -0.05], [0.4, 0.0, 1], [0.38, 0.2], [0.2, 0.4], [0, 0.46], [-0.2, 0.4], [-0.38, 0.2]];
  function openMouth(g, x, y, w, shape, nTop, tongueY, tongueW) {
    const pts = shape.map((p) => [x + p[0] * w, y + p[1] * w, p[2]]);
    g.save();
    g.beginPath(); tk.trace(g, pts); g.clip();
    if (canGrad(g)) { const gr = g.createLinearGradient(0, y, 0, y + w * 0.6); gr.addColorStop(0, '#b94456'); gr.addColorStop(0.45, '#d9626f'); gr.addColorStop(1, '#e8737f'); g.fillStyle = gr; } else g.fillStyle = '#d9626f';
    g.fillRect(x - w, y - w * 0.3, w * 2, w * 1.2);
    g.fillStyle = '#f59aa6'; g.beginPath(); g.ellipse(x, y + w * tongueY, w * tongueW, w * 0.15, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,214,222,0.6)'; g.beginPath(); g.ellipse(x - w * 0.04, y + w * (tongueY - 0.03), w * tongueW * 0.5, w * 0.04, 0, 0, TAU); g.fill();
    g.restore();
    tk.inkPath(g, pts, { closed: true, w: 1.15, color: C.ink, align: 0, wobble: 0, weightVar: 0.2, step: 1 });
    // the upper lip line a little bolder, tapering at the corners
    if (nTop) { const top = pts.slice(0, nTop); tk.inkPath(g, top, { w: 1.75, color: C.ink, taper: 0.3, wobble: 0, weightVar: 0, step: 1.5 }); }
  }
  function jMouth(g, kind, x, y, w) {
    if (kind === 'happyOpen') openMouth(g, x, y, w * 1.2, MOUTH_HAPPY, 7, 0.4, 0.26);
    else if (kind === 'sing') openMouth(g, x, y, w * 0.96, MOUTH_SING, 0, 0.4, 0.2);
    else if (kind === 'ow') openMouth(g, x, y, w, MOUTH_OW, 5, 0.34, 0.22);
    else if (kind === 'smile' || !kind) {
      // a small closed smile: the line dips at the middle, a cupid's bow hint above it, a soft lower lip below
      tk.inkPath(g, [[x - w * 0.5, y - w * 0.04], [x - w * 0.27, y + w * 0.09], [x, y + w * 0.13], [x + w * 0.27, y + w * 0.09], [x + w * 0.5, y - w * 0.04]], { w: 1.5, color: C.ink, taper: 0.4, wobble: 0, weightVar: 0, step: 1.5 });
      tk.inkPath(g, [[x - w * 0.14, y + w * 0.27], [x, y + w * 0.3], [x + w * 0.14, y + w * 0.27]], { w: 0.95, color: C.inkSoft, alpha: 0.55, taper: 0.5, wobble: 0, weightVar: 0 });
      tk.inkPath(g, [[x - w * 0.51, y - w * 0.04], [x - w * 0.55, y - w * 0.09], [x - w * 0.575, y - w * 0.15]], { w: 0.9, color: C.ink, alpha: 0.5, taper: 0.5, wobble: 0, weightVar: 0, step: 1 });
      tk.inkPath(g, [[x + w * 0.51, y - w * 0.04], [x + w * 0.55, y - w * 0.09], [x + w * 0.575, y - w * 0.15]], { w: 0.9, color: C.ink, alpha: 0.5, taper: 0.5, wobble: 0, weightVar: 0, step: 1 });
    } else RJ.mouth(g, x, y, w, kind, { lineW: 1.4, inner: '#d9626f', tongue: '#f29aa0' });
  }

  // the whole face for one frame. S.face = {eyes, mouth, brow, browY, blush, look, open, sweat}
  function jFace(g, S) {
    const st = S.face, F = S.spec.face;
    if (!F) return;
    const k = clamp(num(st.blush, 1), 0.2, 1.8);
    jBlush(g, F.blush[0][0], F.blush[0][1], F.blush[0][2], -1, k);
    jBlush(g, F.blush[1][0], F.blush[1][1], F.blush[1][2], 1, k);
    jNose(g);
    jEye(g, F.eyes[0], -1, st);
    jEye(g, F.eyes[1], 1, st);
    const tl = num(st.brow), by = num(st.browY);
    jBrow(g, F.brows[0][0] + 1.5, F.brows[0][1] + by + 1.5, F.brows[0][2] - 2, -1, tl, 5.2);
    jBrow(g, F.brows[1][0], F.brows[1][1] + by + 1.5, F.brows[1][2], 1, tl, 4.8);
    jMouth(g, st.mouth, F.mouth[0], F.mouth[1], F.mouth[2]);
    if (num(st.sweat) > 0.3 && F.sweat) RJ.fxSweat(g, F.sweat[0], F.sweat[1], F.sweat[2] || 5);
  }

  function faceSpec() {
    const nx = FG.near.x, fx = FG.far.x;
    return {
      eyes: [FG.near, FG.far],
      brows: [[FG.cx - FG.gap / 2 - 1 - FG.browWn / 2, FG.browY, FG.browWn], [FG.cx + FG.gap / 2 + 1 + FG.browWf / 2, FG.browY, FG.browWf]],
      browStyle: { thick: 3.2, arch: 0.62, tilt: 0.0, color: J.brow },
      nose: [FG.cx, FG.noseY, 60],
      mouth: [FG.cx, FG.mouthY, FG.mouthW],
      mouthStyle: { lineW: 1.4, inner: '#d9626f', tongue: '#f29aa0' },
      blush: [[nx, FG.blushY, 19], [fx, FG.blushY, 17]],
      sweat: [57, -12, 5],
      eye: { iris: ['#3a2010', '#744820'], ring: '#2a1408', sclera: '#fffdfa', expr: 'neutral' },
    };
  }

  // ==================================================================================================================================
  // the head
  // ==================================================================================================================================
  // skin skull with its soft shadow, the face and the outline: shared by both skins
  function faceBase(g, S, hairShadow) {
    g.save();
    g.beginPath(); tk.trace(g, SKULL); g.clip();
    g.fillStyle = C.skin; g.fillRect(-90, -100, 180, 200);
    g.fillStyle = C.skinSh;
    g.beginPath(); g.rect(-100, -100, 200, 200); tk.trace(g, SKULL, RJ.lx(2.6), -4.4); g.fill('evenodd');
    if (hairShadow) { g.beginPath(); tk.trace(g, CAP_SOFT, 0, 6.5); g.fill(); }          // the hair's cast shadow on the forehead
    g.restore();
    jFace(g, S);
    RJ.ink(g, SKULL, { closed: true, w: LINE.main + 0.2, color: C.ink, align: 0.2, weightVar: 0.5 });
  }
  function drawHead(g, S) {
    const ey = FG.earY;
    RJ.ear(g, 58, ey - 1, { r: 9, side: 1 });                              // the far ear peeks out behind the cheek
    faceBase(g, S, true);
    // hair cap over it
    RJ.cel(g, CAP, J.hair, { shadow: false, line: LINE.main + 0.2, decor: capDecor, tension: 0.9, weightVar: 0.35 });
    RJ.ink(g, HAIRLINE, { w: LINE.mid, color: C.ink, taper: 0.12, pressure: 'flat', wobble: 0.02 });
    RJ.ear(g, -54, ey, { r: FG.earR, side: -1 });
    hoop(g, -54, ey);
    hairClip(g);
    scrunchie(g);
  }

  function poses() {
    const happy = { eyes: 'open', mouth: 'happyOpen', brow: -0.15 };
    return {
      idle: Object.assign({
        mic: 'hand', fHand: [22, -4], fBend: 1, micAng: 1.0, micGrip: 22,
        bHand: [-38, 14], bBend: -1, bKind: 'open', bSpread: 0.85, bRot: 0.12, flare: 0, fx: [], headRot: -0.04,
      }, happy),
      sing: { mic: 'mouth', micDx: 18, micDy: 11, micAng: 1.1, fBend: 1, bHand: [-36, 8], bBend: -1, bKind: 'open', bSpread: 0.8, bRot: 0.1, eyes: 'closed', mouth: 'sing', brow: -0.5, headRot: 0.05, flare: 0.3, fx: ['notes'] },
      attack: { mic: 'hand', fHand: [46, -6], fBend: 1, micAng: 0.2, micGrip: 24, bHand: [-34, 20], bBend: -1, bKind: 'open', bRot: 0.2, lean: 0.05, torsoRot: 0.04, headRot: 0.05, headDx: 2,
        eyes: 'determined', mouth: 'sing', brow: 0.5, browY: -1, flare: 0.7, fFoot: [22, -12], bFoot: [-14, -12], fx: ['arcs', 'sparkleMic'] },
      hurt: { mic: 'hand', fHand: [8, 12], fBend: 1, micAng: 1.3, micGrip: 22, lean: -0.1, torsoRot: -0.06, headRot: -0.12, headDx: -3, bHand: [-34, -10], bBend: -1, bKind: 'open', bSpread: 1.3, flare: -0.2,
        eyes: 'hurt', mouth: 'ow', brow: -0.8, sweat: 1, blush: 0.5, fFoot: [12, -12], bFoot: [-18, -12], fx: ['stars'] },
      cheer: { mic: 'hand', fHand: [22, -4], fBend: 1, micAng: 1.0, micGrip: 22, bHand: [-40, -34], bBend: -1, bKind: 'open', bRot: 0.3, bSpread: 1.4, eyes: 'happy', mouth: 'happyOpen', brow: -0.2, headRot: 0.05, flare: 0.8,
        fFoot: [18, -12], bFoot: [-14, -12], fx: ['hearts'] },
      // the new poses (HV_ART_AUDIO 2.5). windup: eyes closed, a small inhale, the mic drawn to the chest, the free hand lifted open like a conductor's breath
      windup: { mic: 'hand', fHand: [-12, 10], fBend: 1, micAng: 1.45, micGrip: 22, torsoDy: -2, lean: -0.04, headRot: -0.07, bHand: [-40, -16], bBend: -1, bKind: 'open', bSpread: 1.2, bRot: -0.5,
        flare: 0.25, eyes: 'closed', mouth: 'tiny', brow: -0.35, fFoot: [20, -12], bFoot: [-16, -12], fx: [] },
      // strike: the kit attack (the mic thrust toward the enemy, sparkles) plus three cherry petals, mouth singing
      strike: { mic: 'hand', fHand: [46, -6], fBend: 1, micAng: 0.2, micGrip: 24, bHand: [-34, 20], bBend: -1, bKind: 'open', bRot: 0.2, lean: 0.06, bx: 3, torsoRot: 0.04, headRot: 0.05, headDx: 2,
        eyes: 'determined', mouth: 'sing', brow: 0.5, browY: -1, flare: 0.7, fFoot: [24, -12], bFoot: [-14, -12], fx: ['arcs', 'sparkleMic', 'petals'] },
      // block: the free hand raised palm forward (a soft shield), the mic at the mouth, a held 'ooh', pink rings
      block: { mic: 'mouth', micDx: 16, micDy: 10, micAng: 1.2, fBend: 1, bHand: [-44, -12], bBend: -1, bKind: 'open', bSpread: 1.0, bRot: 0.2, bFront: 1, headRot: 0.02, lean: -0.02,
        eyes: 'determined', mouth: 'sing', brow: 0.3, flare: 0.3, fFoot: [22, -12], bFoot: [-18, -12], fx: ['rings'] },
      // down: sitting on the stage floor, both knees to one side, the mic in her lap, head bowed, eyes closed, the grey '...' bubble
      down: { mic: 'hand', fHand: [4, 42], fBend: 1, micAng: 0.1, micGrip: 22, by: 46, lean: -0.02, torsoRot: 0.05, headRot: 0.26, headDx: 2, bHand: [-10, 48], bBend: -1, bKind: 'relaxed', bRot: 0.2,
        fFoot: [-24, -55], bFoot: [-36, -55], fBow: 26, bBow: 20, fFootRot: 0.15, bFootRot: 0.1, flare: 0.4, eyes: 'closed', mouth: 'flat', brow: -0.3, blush: 0.7, fx: ['mute'] },
    };
  }

  // ---- the dress ----
  const BODICE = [[-14, -142], [-30, -136], [-27, -120], [-23, -104], [-22, -93, 1], [22, -93, 1], [23, -104], [27, -120], [30, -136], [14, -142], [10, -133], [5, -126], [0, -123], [-5, -126], [-10, -133]];
  function skirtPts(P) {
    const f = 1 + P.flare * 0.12, w = 43 * f, y = -49 + P.flare * 1.5;
    // five soft scallops along the hem, one per pleat
    return [[-23, -91, 1], [23, -91, 1], [w * 0.6, -70], [w * 1.0, y - 2], [w * 0.8, y + 2.2], [w * 0.4, y - 0.6], [0, y + 2.4], [-w * 0.4, y - 0.6], [-w * 0.8, y + 2.2], [-w * 1.0, y - 2], [-w * 0.6, -70]];
  }
  function dress(g, S) {
    const P = S.P;
    RJ.neck(g, 2, -152, { w: 20, h: 22 });
    // chest skin inside the scoop neckline
    RJ.cel(g, [[-16, -142], [16, -142], [8, -128], [0, -122], [-8, -128]], C.skin, { shadow: C.skinSh, line: false, depth: 3 });
    // skirt first (the bodice and waistband overlap its top)
    const sk = skirtPts(P);
    RJ.cel(g, sk, J.dressLt, { shadow: J.dress, line: LINE.main, depth: 5, tension: 0.6, decor: (gg) => {
      const w = 43 * (1 + P.flare * 0.12);
      for (let i = -2; i <= 2; i++) {                                                // five pleats fanning from the waist; every other one is a darker fold
        const hx = i * 9, tx = i * (w / 2.7);
        if (i % 2) RJ.fillPts(gg, [[hx - 3.2, -91], [hx + 3.2, -91], [tx + 7, -44], [tx - 7, -44]], J.pleat, 0.5);
        RJ.ink(gg, [[hx, -90], [tx * 0.55 + hx * 0.45, -70], [tx * 1.02, -48]], { w: 1.2, color: J.dressSh, taper: 0.45, wobble: 0, alpha: 0.9 });
      }
    } });
    RJ.cel(g, BODICE, J.dress, { shadow: J.dressSh, line: LINE.main, depth: 6, hi: '#ffc3d7', hiW: 1.5, tension: 0.8 });
    // waistband
    RJ.cel(g, [[-23.5, -96], [23.5, -96], [24.5, -89], [-24.5, -89]], J.pleat, { shadow: J.dressSh, line: LINE.mid, tension: 0.2, depth: 2 });
    necklace(g);
  }
  // the near arm's round shoulder cap lies over the dress, so the strap and the armhole edge are drawn again on top of it (clipped to the strap region)
  function strapOver(g, S) {
    if (S.P.mic === 'mouth') return;                              // the mic at the mouth: the raised forearm crosses the strap, so the shoulder must stay on top
    g.save();
    g.beginPath(); g.rect(15, -150, 30, 21); g.clip();
    RJ.cel(g, BODICE, J.dress, { shadow: J.dressSh, line: LINE.main, depth: 6, hi: '#ffc3d7', hiW: 1.5, tension: 0.8 });
    g.restore();
  }
  function necklace(g) {
    const pts = [];
    for (let i = 0; i <= 11; i++) {                                                  // a sagging string of pearls from strap to strap
      const u = i / 11, x = -13 + u * 26, y = -141 + Math.sin(u * Math.PI) * 13 + (Math.abs(u - 0.5) < 0.1 ? 1 : 0);
      pts.push([x, y]);
    }
    RJ.ink(g, pts, { w: 1, color: C.inkSoft, taper: 0, wobble: 0, alpha: 0.5 });
    pts.forEach((p, i) => { if (i === 5 || i === 6) return; g.beginPath(); g.arc(p[0], p[1], 2.1, 0, TAU); g.fillStyle = J.pearl; g.fill(); g.lineWidth = 0.9; g.strokeStyle = C.ink; g.stroke(); });
    // heart pendant
    RJ.cel(g, [[0, -112, 1], [-6, -118], [-3.4, -123], [0, -120.5], [3.4, -123], [6, -118]], J.pink, { shadow: J.pinkDk, line: LINE.mid, depth: 2, hi: '#ffc2d9', hiW: 1 });
  }

  // ==================================================================================================================================
  // THE UNICORN ONESIE SKIN ('jasmin_unicorn'): the same face (same grid, same face code), a fluffy pink and white hood with small ears and a strip of her brown
  // fringe under the trim, a cream spiral horn with a gold tip, a pastel rainbow mane tail (pink, lilac, mint, yellow) in place of the ponytail running down the
  // back of the hood, a pink and white onesie, hoof boots, the same mic with a pink band.
  // ==================================================================================================================================
  const UN = {
    pink: '#ffb9d6', pinkSh: '#f594bd', pinkLt: '#ffdbea', pinkDk: '#e86fa5',
    white: '#fffafd', whiteSh: '#e9dcf2', whiteLn: '#cdbce0',
    rose: '#ff9fc6', lilac: '#c9a8f4', mint: '#9fe8cf', yellow: '#ffe888',
    horn: '#ffd45c', hornSh: '#e3a634', gold: '#ffcb4f', goldSh: '#e19d1c', hornTip: '#fff1b8',
    hoof: '#d9c2f5', hoofSh: '#b99ce6', hoofLn: '#8d6cc4',
  };

  // dense closed polylines: a Catmull-Rom control ring flattened, offset along its normals and scalloped (fluffy edges)
  const denseOf = (ctrl) => { const f = tk.flatten(ctrl, { closed: true, step: 3 }), o = []; for (let i = 0; i + 1 < f.length; i += 2) o.push([f[i], f[i + 1]]); return o; };
  const polyDir = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const j = (i + 1) % P.length; a += P[i][0] * P[j][1] - P[j][0] * P[i][1]; } return a > 0 ? 1 : -1; };
  const normalsOf = (P) => {
    const sg = polyDir(P);
    return P.map((p, i) => { const a = P[(i + P.length - 1) % P.length], b = P[(i + 1) % P.length]; let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l; return [ty * sg, -tx * sg]; });
  };
  const offsetPoly = (P, d) => { const N = normalsOf(P); return P.map((p, i) => [p[0] + N[i][0] * d, p[1] + N[i][1] * d]); };
  function scallop(P, seg, amp) {
    const n = P.length, N = normalsOf(P), L = [0];
    for (let i = 1; i <= n; i++) L.push(L[i - 1] + Math.hypot(P[i % n][0] - P[i - 1][0], P[i % n][1] - P[i - 1][1]));
    const total = L[n] || 1, m = Math.max(3, Math.round(total / seg)), out = [];
    for (let i = 0; i < n; i++) { const u = (L[i] / total) * m, t = u - Math.floor(u), off = amp * Math.pow(Math.sin(PI * t), 0.8); out.push([P[i][0] + N[i][0] * off, P[i][1] + N[i][1] * off]); }
    return out;
  }
  // the face window of the hood (hairline moved up 6 so a strip of her brown fringe shows under the trim), the pink hood body, the white trim ring
  const WIN_CTRL = [[-47, 14], [-46, 1], [-43.5, -9], [-39, -18], [-33.5, -27], [-27, -35], [-19, -41.5], [-10, -46.5], [-1, -50], [9, -54], [20, -56.5], [31, -55.5], [41, -51.5], [50, -44], [55, -33], [57.8, -21], [58.6, -8],
    [58, 10], [52.6, 27.4], [41.2, 42.2], [26.6, 54], [9, 59.3], [-8.8, 55.3], [-23.6, 50.5], [-37.6, 40], [-50, 26]];           // the lower half hugs the skull, a hair inside it, so no gap shows between face and trim
  const HOOD_CTRL = [[2, -83], [26, -81], [46, -72], [62, -52], [72, -26], [75, 2], [74, 28], [68, 50], [54, 68], [34, 77], [10, 80], [-14, 78], [-36, 70], [-54, 56], [-67, 38], [-74, 14], [-76, -12], [-72, -40], [-58, -64], [-36, -79], [-14, -84]];
  const WIN = { poly: denseOf(WIN_CTRL) };
  const HOOD_OUT = { poly: scallop(denseOf(HOOD_CTRL), 21, 3.4) };
  const TRIM_OUT = { poly: scallop(offsetPoly(WIN.poly, 6.4), 12.5, 2.5) };

  // the outline of a dense scalloped polygon as one plain round-joined stroke (a tapered ink line over hundreds of points costs ten times more)
  function outline(g, shape, w) {
    g.save(); g.beginPath(); tk.trace(g, shape); g.closePath(); g.lineWidth = w; g.lineJoin = 'round'; g.strokeStyle = C.ink; g.stroke(); g.restore();
  }
  // little curly fur marks, the cartoon's fluff
  function fluffMarks(g, pts, col, alpha) {
    g.save(); g.strokeStyle = col; g.globalAlpha *= alpha === undefined ? 0.9 : alpha; g.lineWidth = 1.25; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    pts.forEach((p, i) => { const r = ((i * 37) % 7 - 3) * 0.12; g.moveTo(p[0] - 3 * Math.cos(r), p[1] + 1.4 - 3 * Math.sin(r)); g.quadraticCurveTo(p[0], p[1] - 3.2, p[0] + 3 * Math.cos(r), p[1] + 1.4 + 3 * Math.sin(r)); });
    g.stroke(); g.restore();
  }
  // a pointed unicorn ear (pink outside, soft white inside) at base (x, y), leaning by rot, scaled k
  function unicornEar(g, x, y, rot, k) {
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(k, k);
    RJ.cel(g, [[-10, 2], [-10, -10], [-6.5, -23], [0, -35, 1], [6.5, -22], [10, -9], [10, 2]], UN.pink, { shadow: UN.pinkSh, line: LINE.main, depth: 4, hi: UN.pinkLt, hiW: 1.4, tension: 0.8 });
    RJ.cel(g, [[-5.2, 0], [-5.2, -9], [-3, -19], [0, -26, 1], [3, -18], [5.2, -8], [5.2, 0]], '#ffeaf3', { shadow: UN.whiteSh, line: false, depth: 2, tension: 0.8 });
    g.restore();
  }
  // the cream spiral horn with a gold tip: base (x, y) on the crown, leaning forward by rot
  function unicornHorn(g, x, y, rot) {
    g.save(); g.translate(x, y); g.rotate(rot);
    const pts = [[-8.5, 3], [-6.3, -11], [-3.2, -26], [0.6, -39, 1], [4.6, -25], [7.2, -11], [9, 3]];
    RJ.cel(g, pts, UN.horn, { shadow: UN.hornSh, line: LINE.main, depth: 4, hi: '#ffffff', hiW: 1.2, tension: 0.8, decor: (gg) => {
      for (let i = 0; i < 5; i++) { const yy = 2 - i * 9; RJ.ink(gg, [[-10, yy + 6], [0, yy - 1.5], [10, yy - 8]], { w: 2.1, color: UN.hornSh, taper: 0.1, wobble: 0, pressure: 'flat' }); }
      gg.beginPath(); gg.moveTo(-10, -27); gg.lineTo(10, -34); gg.lineTo(10, -50); gg.lineTo(-10, -50); gg.closePath(); gg.fillStyle = UN.hornTip; gg.fill();     // the bright tip of the gold horn
      RJ.ink(gg, [[-10, -27], [0, -30.5], [10, -34]], { w: 1.3, color: UN.goldSh, taper: 0.1, wobble: 0, pressure: 'flat' });
      RJ.ink(gg, [[-1.4, -36], [0.2, -30]], { w: 1.3, color: '#fff3b8', taper: 0.5, wobble: 0 });
    } });
    // a fluffy collar where the horn leaves the hood
    [-5.5, 0, 5.5].forEach((dx, i) => RJ.cel(g, tk.circlePts(dx, 2.6, 4.9 - (i === 1 ? 0 : 0.5), 10), UN.white, { shadow: UN.whiteSh, line: LINE.fine + 0.3, depth: 1.5 }));
    g.restore();
  }
  function hoodHead(g, S) {
    // the ears first, a little higher, so the scalloped fur edge of the hood overlaps their bases
    unicornEar(g, 49, -68, 0.4, 0.92);
    unicornEar(g, -9, -81, -0.3, 1);
    // the strip of brown fringe under the trim (the classic hair cap clipped to the window)
    g.save();
    g.beginPath(); tk.trace(g, WIN); g.clip();
    RJ.cel(g, CAP, J.hair, { shadow: false, line: LINE.main + 0.2, decor: capDecor, tension: 0.9, weightVar: 0.35 });
    RJ.ink(g, HAIRLINE, { w: LINE.mid, color: C.ink, taper: 0.12, pressure: 'flat', wobble: 0.02 });
    g.restore();
    // the pink hood: scalloped outer edge, window cut out, one hard shadow band on the lower left
    g.save();
    g.beginPath(); tk.trace(g, HOOD_OUT); tk.trace(g, WIN); g.fillStyle = UN.pink; g.fill('evenodd');
    g.save(); g.beginPath(); tk.trace(g, HOOD_OUT); tk.trace(g, WIN); g.clip('evenodd');
    g.fillStyle = UN.pinkSh; g.beginPath(); g.rect(-120, -120, 240, 240); tk.trace(g, HOOD_OUT, RJ.lx(6), -9); g.fill('evenodd');
    g.restore();
    g.restore();
    outline(g, HOOD_OUT, LINE.main + 0.4);
    fluffMarks(g, [[-62, -30], [-66, 0], [-58, 36], [-40, 62], [66, -34], [70, -2], [66, 34], [40, -70], [-24, -72], [-50, -52], [22, 70], [-12, 72], [52, 58]], UN.pinkDk, 0.85);
    // the white fluffy trim round the face window
    g.save();
    g.beginPath(); tk.trace(g, TRIM_OUT); tk.trace(g, WIN); g.fillStyle = UN.white; g.fill('evenodd');
    g.save(); g.beginPath(); tk.trace(g, TRIM_OUT); tk.trace(g, WIN); g.clip('evenodd');
    g.fillStyle = UN.whiteSh; g.beginPath(); g.rect(-120, -120, 240, 240); tk.trace(g, TRIM_OUT, RJ.lx(3.4), -5.2); g.fill('evenodd');
    g.restore();
    g.restore();
    outline(g, TRIM_OUT, LINE.main + 0.2);
    outline(g, WIN, LINE.main + 0.2);
    fluffMarks(g, [[-52, -2], [-50, 30], [-30, 52], [52, -42], [62, 8], [52, 40], [-4, 68]], UN.whiteLn, 0.9);
    // the horn and the scrunchie where the mane tail leaves the hood
    unicornHorn(g, 21, -76, 0.12);
    scrunchie(g);                                                                                              // her own pink scrunchie ties the mane tail (bible 7.1)
  }

  // the mane tail replaces the ponytail: the same silhouette in four pastel bands (pink at the root, then lilac, mint and yellow at the curl)
  const cutPoly = (a, b, far) => {                                         // the half plane on one side of the (softly waving) line a-b, in card coordinates
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, k = 10, nx = -dy / len, ny = dx / len, n = 48, pts = [];
    for (let i = 0; i <= n; i++) {
      const t = -k + (i / n) * (2 * k + 1), w = 2.8 * Math.sin(t * len / 5.5);
      pts.push([a[0] + dx * t + nx * w, a[1] + dy * t + ny * w]);
    }
    const f0 = pts[0], f1 = pts[n];
    pts.push([f1[0] + far[0], f1[1] + far[1]], [f0[0] + far[0], f0[1] + far[1]]);
    return pts.map((p) => [-p[0] - 4, p[1], 1]);                           // sharp corners everywhere: a plain polygon
  };
  const MANE_CUTS = [[[130, -66], [60, -38], [0, 900], UN.lilac], [[130, -8], [58, 10], [0, 900], UN.mint], [[130, 36], [60, 48], [0, 900], UN.yellow]];
  function maneTail(g, S) {
    g.save();
    g.translate(-39, -72); g.rotate(0.09 + S.P.hairSwing * 0.05); g.translate(39, 72);
    RJ.cel(g, TAIL_OUTLINE, UN.rose, { shadow: false, line: LINE.main + 0.2, tension: 0.85, weightVar: 0.3, decor: (gg) => {
      MANE_CUTS.forEach((c) => RJ.fillPts(gg, cutPoly(c[0], c[1], c[2]), c[3], 1));
      gg.save(); gg.globalCompositeOperation = 'multiply'; RJ.fillPts(gg, TAIL_SHADOW, '#f3e2fb', 0.6); gg.restore();                // the one hard shadow, tinted by the band under it
      TAIL_LIGHT.forEach((l) => RJ.fillPts(gg, MX(l), '#ffffff', 0.5));
      TAIL_LINES.forEach((l, i) => RJ.ink(gg, MX(l), { w: 1.5, color: '#9a63b8', taper: 0.45, wobble: 0.03, alpha: 0.5, seed: i }));
      RJ.hatch(gg, TAIL_HATCH.map((h) => MX(h)), { w: 1.15, color: '#ffffff', alpha: 0.7 });
    } });
    g.restore();
  }

  // ---- the onesie ----
  const ONESIE = [[-17, -146], [-30, -141], [-35, -128], [-35, -106], [-33, -88], [-35, -70], [-31, -60], [-15, -54], [0, -59], [15, -54], [31, -60], [35, -70], [33, -88], [35, -106], [35, -128], [30, -141], [17, -146]];
  function onesie(g, S) {
    RJ.neck(g, 2, -152, { w: 20, h: 22 });
    RJ.cel(g, ONESIE, UN.pink, { shadow: UN.pinkSh, line: LINE.main, depth: 8, hi: UN.pinkLt, hiW: 1.6, hiAlpha: 0.8, tension: 0.9 });
    // the white fluffy tummy panel with the zip running down the front (a little right of centre, the 3/4 view)
    RJ.cel(g, tk.ellipsePts(6, -92, 16, 21, 16), UN.white, { shadow: UN.whiteSh, line: LINE.mid, depth: 5, hi: '#ffffff', hiW: 1.3 });
    RJ.ink(g, [[6, -128], [6.4, -108], [6, -88], [6.4, -66]], { w: 3.2, color: C.ink, taper: 0, wobble: 0 });
    RJ.ink(g, [[6, -128], [6.4, -108], [6, -88], [6.4, -66]], { w: 1.5, color: '#f3dbe8', taper: 0, wobble: 0 });
    RJ.cel(g, [[6, -121], [10.4, -117], [9, -110.5], [6, -108.5], [3, -110.5], [1.6, -117]], UN.gold, { shadow: UN.goldSh, line: LINE.fine + 0.3, depth: 1.5, tension: 0.7 });       // the zip pull
    fluffMarks(g, [[-24, -122], [-26, -96], [24, -118], [27, -92], [-22, -70], [24, -68]], UN.pinkDk, 0.8);
    fluffMarks(g, [[-4, -82], [14, -100]], UN.whiteLn, 0.9);
    // a little gold star patch on the chest, on the near side
    tk.sparkle(g, -17, -112, 5.5, { color: UN.gold, glow: 0.15, thin: 0.35 });
  }
  // a hoof boot at the ankle (drawn over the leg): a cream fluffy boot with a lilac hoof and its cleft, and a scalloped white cuff
  function hoofBoot(g, hip, an) {
    g.save(); g.translate(an[0], an[1]);
    RJ.cel(g, [[-11, -4], [-13.5, 4], [-11, 12.4, 1], [22, 12.4, 1], [28.4, 7], [25.4, -1], [14, -4], [2, -8]], UN.white, { shadow: UN.whiteSh, line: LINE.main, depth: 5, hi: '#ffffff', hiW: 1.4, tension: 0.9 });
    // the hoof: a rounded lilac cap over the toe with a darker lower wall, a lighter rim and the cleft
    RJ.cel(g, [[7, -2.5], [16, -3.5], [25, -1.2], [28.6, 6], [27, 12.4, 1], [7, 12.4, 1]], UN.hoof, { shadow: UN.hoofSh, line: LINE.main, depth: 4.5, hi: '#efe2ff', hiW: 1.3, tension: 0.7, decor: (gg) => {
      RJ.ink(gg, [[7, 1.5], [16, 0.2], [27, 2.4]], { w: 1.2, color: UN.hoofLn, taper: 0.3, wobble: 0, alpha: 0.8 });                      // where the hoof wall meets the pastern
      RJ.ink(gg, [[19.4, 1.4], [19.9, 12.4]], { w: 1.4, color: UN.hoofLn, taper: 0.45, wobble: 0 });                                       // the cleft
    } });
    // the fluffy cuff round the ankle, scalloped
    RJ.cel(g, [[-14, -17], [-9, -20], [-4, -17], [1, -20], [6, -17], [11, -20], [14, -16], [15, -7], [11, -4], [6, -7], [1, -4], [-4, -7], [-9, -4], [-14, -7]], UN.white, { shadow: UN.whiteSh, line: LINE.main, depth: 3, hi: '#ffffff', hiW: 1.2, tension: 0.7 });
    g.restore();
  }

  function makeJasmin(uni) {
    const base = poses();
    const spec = {
      id: uni ? 'jasmin_unicorn' : 'jasmin',
      accent: 'jasmin',
      skel: { shF: [21, -122], shB: [-24, -124], hipF: [12, -58], hipB: [-12, -58] },
      base: {},
      poses: Object.assign(base, { bust: Object.assign({}, base.idle, { bHand: [-22, 44], bBend: 1, bKind: 'relaxed', bRot: 0.1, bSpread: 1 }) }),
      face: faceSpec(),
      exprs: { smirk: { eyes: 'open', mouth: 'smirk', brow: 0.2 }, angry: { eyes: 'determined', mouth: 'frown', brow: 0.8 } },
      arm: uni ? { l: [26, 24], w: [19, 15], skin: UN.pink, skinSh: UN.pinkSh, cuff: { color: UN.white, light: UN.whiteSh }, hand: { skin: C.skin, shade: C.skinSh } }
        : { l: [26, 24], w: [17, 13], skin: C.skin, skinSh: C.skinSh, hand: { skin: C.skin, shade: C.skinSh } },
      legs: uni ? {
        w: [29, 23], color: UN.pink, shade: UN.pinkSh, bow: 1.5, pantsOver: true,
        shoe: { color: UN.white, shade: UN.whiteSh, k: 0.001 },                                  // hidden: the hoof boot in decor replaces the sneaker
        decor: hoofBoot,
      } : {
        w: [27, 21], color: C.skin, shade: C.skinSh, bow: 1.5,
        sock: { color: J.white, shade: J.whiteSh, len: 17 },
        shoe: { color: J.white, sole: '#ffe1ea', shade: J.whiteSh, toeCap: '#ffcadb', heel: '#c4e4ff', hi: '#ffffff' },
      },
      mic: { accent: J.pink, headR: 11.5, len: 40, bands: 2 },
      bounds: uni ? { w: 256, h: 336, x0: -164, x1: 92 } : { w: 238, h: 322, x0: -158, x1: 80 },   // the tail swings far to the back: the box is lopsided, hair (the unicorn hood and horn too) and the widest pose reach (not effects)
      bust: uni ? { rect: [-112, -344, 104, -92], face: [-76, -322, 90, -132], pose: 'bust' } : { rect: [-112, -306, 96, -92], face: [-68, -286, 80, -140], pose: 'bust' },
      layers: uni ? {
        backHair: (g, S) => maneTail(g, S),
        torso: (g, S) => onesie(g, S),
        head: (g, S) => { faceBase(g, S, false); hoodHead(g, S); },
      } : {
        backHair: (g, S) => ponytail(g, S),
        torso: (g, S) => dress(g, S),
        head: (g, S) => drawHead(g, S),
        over: (g, S) => strapOver(g, S),
      },
    };
    return spec;
  }
  // The kit fits the portrait crop to the bust pose only. A pose that moves the head (attack leans in about 23 units, hurt recoils about 37) would lose part of
  // the face, so for any other pose the same crop is shifted by that pose's head offset (one rig per pose, built on first use; the offset is the middle of the
  // head's travel over a few seconds, so the crop holds still while the head bobs). Anything odd falls back to the kit's own crop.
  function followHead(spec) {
    const impl = RJ.rig(spec), base = impl.bust, bp = spec.bust.pose, rigs = {};
    const mid = (pose) => {                                              // the centre of the head's range of travel in this pose
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (let i = 0; i < 9; i++) { const h = impl.points({ pose, t: i * 0.35 }).head; x0 = Math.min(x0, h[0]); x1 = Math.max(x1, h[0]); y0 = Math.min(y0, h[1]); y1 = Math.max(y1, h[1]); }
      return [(x0 + x1) / 2, (y0 + y1) / 2];
    };
    const shifted = (pose) => {
      const a = mid(bp), b = mid(pose);
      const dx = num(b[0]) - num(a[0]), dy = num(b[1]) - num(a[1]), mv = (r) => [r[0] + dx, r[1] + dy, r[2] + dx, r[3] + dy];
      return RJ.rig(Object.assign({}, spec, { bust: Object.assign({}, spec.bust, { rect: mv(spec.bust.rect), face: mv(spec.bust.face) }) }));
    };
    impl.bust = function (ctx, w, h, o) {
      const pose = o && typeof o.pose === 'string' ? o.pose : bp;
      if (pose === bp || !Object.prototype.hasOwnProperty.call(spec.poses, pose)) return base.call(impl, ctx, w, h, o);
      let r = rigs[pose];
      if (!r) { try { r = shifted(pose); } catch (e) { r = impl; } rigs[pose] = r; }
      return r === impl ? base.call(impl, ctx, w, h, o) : r.bust(ctx, w, h, o);
    };
    return impl;
  }
  RJ.register('jasmin', followHead(makeJasmin(false)));
  RJ.register('jasmin_unicorn', followHead(makeJasmin(true)));
  }

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
  function castCrew() {
  const tk = ART.tk, C = RJ.C, LINE = RJ.LINE, mat = tk.mat;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const fr = (v) => v - Math.floor(v);
  // the crew accents live in RJ.ACCENT (art_cast_kit.js)

  // ------------------------------------------------------------------------------------------------------------------------------------------------
  // shared helpers (all the crew)
  // ------------------------------------------------------------------------------------------------------------------------------------------------
  // spec.tweak(P, t) is part of the kit now (RJ.resolve calls it): a crew spec may edit the resolved pose numbers over time.
  // many short ink strokes: list items are [x0, y0, x1, y1] or a point list
  const strokes = (g, list, o) => { o = o || {}; RJ.hatch(g, list, { w: (o.w || 1.25) * 0.9, color: o.color, alpha: o.alpha }); };
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
  // the Goat Suit (bible 7.1): the same cut in a cosy cream fabric, the hoodie roll and the cuffs a warmer cream
  const GOAT = Object.assign({}, R, { jacket: '#f3e2c2', jacketSh: '#d9bd8e', jacketHi: '#fff6e4', zip: '#c3a272', collar: '#e4cc9f', collarSh: '#c3a272', hood: '#fbefd8', hoodSh: '#e3cba1', hoodHi: '#ffffff', hoodDk: '#c3a272', cord: '#c3a272', pants: '#ead6b1', pantsSh: '#cdb183' });
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
    gtPhones(g, S);
    gtBeard(g, S);
  }
  // the goat suit wears its headphones over the ears (bible 7.1): a violet-edged band over the crown, between the horns, and a cup on each side
  // where the floppy ears leave the head
  function gtPhones(g, S) {
    const band = [[-60, -4], [-62, -36], [-48, -78], [-18, -104], [14, -108], [44, -92], [60, -58], [62, -10]];
    RJ.ink(g, band, { w: 8.4, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, band, { w: 6.2, color: R.phones, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, band, { w: 2.2, color: R.violet, taper: 0, wobble: 0, weightVar: 0 });
    rcCup(g, -58, 6, 1.05, 0.12);
    rcCup(g, 60, 4, 0.9, -0.12);
  }
  // little curly fluff marks: the costume's cosy fabric
  function fluff(g, pts, col) {
    g.save(); g.strokeStyle = col; g.globalAlpha *= 0.8; g.lineWidth = 1.25; g.lineCap = 'round';
    g.beginPath();
    pts.forEach((p) => { g.moveTo(p[0] - 3, p[1] + 1.4); g.quadraticCurveTo(p[0], p[1] - 3.2, p[0] + 3, p[1] + 1.4); });
    g.stroke(); g.restore();
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
    if (pose === 'attack' || pose === 'strike') return Math.pow(Math.abs(Math.sin(Math.PI * (t * 2.6 + col * 0.12 + row * 0.5))), 3);
    if (pose === 'windup') return 0.35;
    if (pose === 'down') return 0;
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
    const goat = !!S.spec.goatSuit, Q = goat ? GOAT : R;                    // the goat suit wears the same cut in cream; its headphones sit over the ears
    // the headphones' violet cord round the back of the neck, then the neck itself
    const band = [[-29, -136], [-26, -150], [-12, -158], [4, -159], [20, -156], [30, -148], [31, -137]];
    if (!goat) { RJ.ink(g, band, { w: 6, color: Q.phonesSh, taper: 0, wobble: 0 }); RJ.ink(g, band, { w: 3.4, color: Q.violet, taper: 0, wobble: 0 }); }
    RJ.neck(g, 2, -156, { w: 22, h: 22, skin: Q.skin, shade: Q.skinSh });
    // the light grey jacket: body, ribbed hem, a few folds
    RJ.cel(g, RC_JACKET, Q.jacket, { shadow: Q.jacketSh, line: LINE.main, depth: 8, hi: Q.jacketHi, hiW: 1.6, hiAlpha: 0.8, tension: 0.5, decor: (gg) => {
      gg.beginPath(); gg.rect(-45, -88, 90, 10); gg.fillStyle = Q.jacketSh; gg.fill();
      RJ.ink(gg, [[-45, -88], [45, -88]], { w: 1.3, color: Q.zip, taper: 0, wobble: 0 });
      strokes(gg, [[-32, -130, -26, -114], [30, -132, 26, -116], [-30, -104, -27, -94]], { color: Q.jacketHi, alpha: 0.85, w: 1.4 });
    } });
    // the navy hoodie in the open front, with the jacket's zip tapes down both edges
    RJ.cel(g, RC_PANEL, Q.hood, { shadow: Q.hoodSh, line: LINE.main, depth: 5, hi: Q.hoodHi, hiW: 1.4, hiAlpha: 0.6, tension: 0.4, decor: (gg) => {
      gg.beginPath(); gg.rect(-26, -88, 52, 9); gg.fillStyle = Q.hoodSh; gg.fill();
      RJ.ink(gg, [[-26, -88], [26, -88]], { w: 1.2, color: Q.hoodDk, taper: 0, wobble: 0 });
    } });
    [[-1, [[-13, -150], [-19, -130], [-20, -106], [-22, -82]]], [1, [[13, -150], [19, -130], [20, -106], [22, -82]]]].forEach((z) => {
      RJ.ink(g, z[1], { w: 3.4, color: Q.collar, taper: 0, wobble: 0, weightVar: 0 });
      for (let i = 0; i < 9; i++) { const y = -146 + i * 7.4, x = z[0] * (13 + (i / 8) * 8.5); RJ.ink(g, [[x, y], [x - z[0] * 2.4, y + 1.2]], { w: 1, color: Q.zip, taper: 0, wobble: 0, weightVar: 0 }); }
    });
    // the dark collar standing round the neck on each side of the hood
    [[-1, [[-14, -153], [-24, -151], [-31, -146], [-29, -140], [-20, -143], [-12, -147]]], [1, [[16, -153], [26, -151], [33, -146], [31, -140], [22, -143], [14, -147]]]].forEach((c) => {
      RJ.cel(g, c[1], Q.collar, { shadow: Q.collarSh, line: LINE.mid, depth: 2.4, tension: 0.6, hi: false });
    });
    // the blue tee at the throat, then the hood lying round the neck like a soft roll
    RJ.cel(g, [[-14, -153, 1], [16, -153, 1], [10, -144], [2, -134, 1], [-8, -144]], Q.tee, { shadow: Q.teeSh, line: LINE.mid, depth: 3, tension: 0.3, hi: false });
    const roll = [[-29, -152], [-28, -141], [-21, -129], [-8, -122], [4, -121], [18, -126], [28, -136], [31, -150], [22, -149], [16, -138], [6, -132], [-6, -133], [-16, -139], [-21, -149]];
    RJ.cel(g, roll, Q.hood, { shadow: Q.hoodSh, line: LINE.main, depth: 4, hi: Q.hoodHi, hiW: 1.5, hiAlpha: 0.7, tension: 0.75, decor: (gg) => {
      strokes(gg, [[[-26, -146], [-24, -136], [-17, -128]], [[26, -146], [24, -137], [16, -129]]], { color: Q.hoodHi, w: 1.2, alpha: 0.7 });
    } });
    // the drawstrings with their little tips
    [[-7, -131, -9, -114], [9, -131, 11, -113]].forEach((l, i) => {
      const sp = [[l[0], l[1]], [(l[0] + l[2]) / 2 + (i ? 1.4 : -1.4), (l[1] + l[3]) / 2], [l[2], l[3]]];
      RJ.ink(g, sp, { w: 3.6, color: C.ink, taper: 0, wobble: 0, weightVar: 0 }); RJ.ink(g, sp, { w: 1.8, color: Q.cord, taper: 0, wobble: 0, weightVar: 0 });
      RJ.ink(g, [[l[2], l[3] - 0.5], [l[2] + (i ? 0.4 : -0.4), l[3] + 4]], { w: 3.4, color: '#f4efe4', taper: 0, wobble: 0, weightVar: 0 });
    });
    // the headphone band: a thin violet-edged arc across the collar from cup to cup, in front of the hoodie and tucked behind the chin
    const hb = [[-20, -139], [-12, -132], [2, -128.5], [15, -131.5], [21, -139]];
    if (!goat) {
      RJ.ink(g, hb, { w: 6.2, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
      RJ.ink(g, hb, { w: 4.4, color: Q.violet, taper: 0, wobble: 0, weightVar: 0 });
      RJ.ink(g, hb, { w: 2.4, color: Q.phones, taper: 0, wobble: 0, weightVar: 0 });
    } else fluff(g, [[-30, -122], [30, -120], [-32, -98], [33, -96], [-24, -140], [26, -141]], '#c9a979');
    // the sampler's strap (mostly hidden by the cups) and the sampler
    [[-14, -140, -19, -114], [16, -140, 22, -114]].forEach((l) => { const sp = [[l[0], l[1]], [(l[0] + l[2]) / 2, (l[1] + l[3]) / 2], [l[2], l[3]]]; RJ.ink(g, sp, { w: 4, color: Q.phonesSh, taper: 0, wobble: 0 }); RJ.ink(g, sp, { w: 2, color: Q.violet, taper: 0, wobble: 0 }); });
    rcSampler(g, S);
  }
  // headphones' cups and their violet cord: after the arms, so the sleeves never hide them
  function rcOver(g, S) {
    if (S.spec.goatSuit) return;                                               // the goat suit's headphones are on its head (gtPhones)
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
      // the new poses (HV_ART_AUDIO 2.5). windup: both hands lifted above the pad, leaning back
      windup: { mic: 'none', fHand: [-3, 18], fBend: -1, fKind: 'open', fSpread: 1.1, fRot: 0.6, bHand: [7, 17], bBend: 1, bKind: 'open', bSpread: 1.1, bRot: -0.6, bFront: 1, lean: -0.05, headRot: -0.05,
        fFoot: [26, -12], bFoot: [-22, -12], eyes: goat ? 'open' : 'determined', mouth: goat ? 'happyOpen' : 'flat', brow: goat ? 0 : 0.3, fx: [], look: [0.4, 0.3] },
      // strike: the kit attack (hands slam the pad) with a step in, the pad flashing violet
      strike: { mic: 'none', fHand: [-6, 38], fBend: -1, fKind: 'fist', fRot: -0.4, bHand: [8, 38], bBend: 1, bKind: 'fist', bRot: 0.4, bFront: 1, bx: goat ? 6 : 17, lean: goat ? 0.06 : 0.09, torsoRot: 0.05, headRot: 0.08, headDx: 3,
        fFoot: [34, -12], bFoot: [-24, -12], eyes: goat ? 'open' : 'determined', mouth: goat ? 'grin' : 'beat', brow: goat ? 0.2 : 0.4, fx: ['padfx', 'pad'], look: [0.5, 0.2] },
      // block: the pad hugged to the chest like a shield, calm eyes, violet rings
      block: { mic: 'none', fHand: [-4, 24], fBend: -1, fKind: 'fist', fRot: -0.9, bHand: [6, 24], bBend: 1, bKind: 'fist', bRot: 0.9, bFront: 1, headRot: 0.02, lean: -0.03, torsoDy: 2,
        fFoot: [26, -12], bFoot: [-24, -12], eyes: 'open', mouth: goat ? 'happyOpen' : 'smile', brow: -0.1, fx: ['rings'] },
      // down: sitting with the pad on his knees, eyes closed, the grey '...' bubble
      down: { mic: 'none', fHand: [-2, 34], fBend: -1, fKind: 'fist', fRot: -0.3, bHand: [2, 34], bBend: 1, bKind: 'fist', bRot: 0.3, bFront: 1, by: 52, torsoDy: 3, headRot: 0.2, headDy: 2,
        fFoot: [52, -62], bFoot: [38, -62], fFootRot: -1.2, bFootRot: -1.1, eyes: 'closed', mouth: 'flat', brow: -0.2, blush: 0.6, fx: ['mute'] },
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
      goatSuit: goat,
      arm: { l: [26, 24], w: [21, 18], skin: goat ? GOAT.jacket : R.jacket, skinSh: goat ? GOAT.jacketSh : R.jacketSh, cuff: { color: goat ? GOAT.hood : R.hood, light: goat ? GOAT.hoodSh : R.hoodSh }, hand: { skin: R.skin, shade: R.skinSh } },
      legs: {
        w: [31, 24], color: goat ? GOAT.pants : R.pants, shade: goat ? GOAT.pantsSh : R.pantsSh, pantsOver: true, bow: 2,
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
      life: { walk: { bob: 1.6, per: 0.5, head: 0.008, step: { hz: 2, stride: 7, lift: 4 } } },       // a slow, laid-back walk
      tip: (P, L) => mat.pt(L.torso, 0, -96),                                                         // the striking point: the centre of the pads
      bust: goat ? { rect: [-136, -324, 134, -96], face: [-110, -318, 112, -142], pose: 'bust' } : { rect: [-92, -324, 88, -92], face: [-76, -318, 78, -146], pose: 'bust' },
      layers: { backHair: rcNape, torso: rcTorso, head: goat ? gtHead : rcHead, over: rcOver, fx: rcFx },
      // the hands drum the pads: alternate hits in the attack, a lazy tap of the back hand while he beatboxes
      tweak(P, t) {
        if (P.pose === 'attack' || P.pose === 'strike') {
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
  // the bass frame for a pose: P.bassRot (radians, + raises the neck) turns it about the body centre, P.bassDx and P.bassDy move it (torso rest space)
  const bassAng = (P) => AN_ANG + (P && isFinite(P.bassRot) ? +P.bassRot : 0);
  const bassC = (P) => [AN_C[0] + (P && isFinite(P.bassDx) ? +P.bassDx : 0), AN_C[1] + (P && isFinite(P.bassDy) ? +P.bassDy : 0)];
  const bassPt = (lx, ly, P) => { const a = bassAng(P), c = bassC(P); return [c[0] + lx * Math.cos(a) + ly * Math.sin(a), c[1] - lx * Math.sin(a) + ly * Math.cos(a)]; };
  // a point held on the bass at rest (torso rest space) carried along when the bass turns or moves: hands stay on the neck and the body
  const onBass = (p, P) => { const c = AN_C, a = AN_ANG, dx = p[0] - c[0], dy = p[1] - c[1], lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a); return bassPt(lx, ly, P); };
  const AN_BODY = [[48, -18, 1], [41, -27], [22, -36], [-5, -40], [-33, -36], [-50, -21], [-55, 3], [-50, 22], [-33, 35], [-7, 39], [15, 34], [28, 27], [35, 25, 1], [33, 10], [29, 0], [33, -8]];
  const AN_NECK = 118, AN_BRIDGE = -33;
  function anBass(g, S) {
    // the strap over the shoulder to the upper horn
    const sp = [[-17, -152], [-3, -140], [15, -128], [34, -118]];
    RJ.ink(g, sp, { w: 9, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, sp, { w: 6.4, color: A.strap, taper: 0, wobble: 0, weightVar: 0 });
    RJ.ink(g, sp.map((p) => [p[0] + 0.6, p[1] + 2.2]), { w: 1.3, color: A.stitch, taper: 0, wobble: 0, weightVar: 0, alpha: 0.9 });
    const bc = bassC(S.P);
    g.save(); g.translate(bc[0], bc[1]); g.rotate(-bassAng(S.P));
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
    const x = -70, y = 0, t = S.t, on = S.P.pose === 'sing' || S.P.pose === 'attack' || S.P.pose === 'strike' ? Math.abs(Math.sin(Math.PI * t * 2)) : 0.7 + 0.3 * Math.sin(t * 2.4);
    const jp = bassPt(-19, 36, S.P), j = tPt(S, jp[0], jp[1]);
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
    if (name === 'bassnotes') { const hp = bassPt(AN_NECK + 12, -22, S.P), p = tPt(S, hp[0], hp[1]); RJ.fx.notes(g, p[0] - 22, p[1] - 6, t, A.band, 3); return; }
    if (name === 'bassfx') {
      // the slap: fat sound rings spreading from the body, a chunky note popping out, a small burst on the strings at the hit
      const cp = bassPt(-4, 0, S.P), c = tPt(S, cp[0], cp[1]), a = fr(t * 2.6), b = S.beat, ra = -bassAng(S.P);
      tk.glow(g, c[0], c[1], 40 + 12 * b, A.glow, 0.22 + 0.2 * b, false);
      g.save(); g.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        const age = a + k, r = 16 + age * 34, al = Math.max(0, 1 - age / 2.8);
        g.globalAlpha = al;
        g.strokeStyle = C.ink; g.lineWidth = 8.4 - age * 1.4; g.beginPath(); g.ellipse(c[0], c[1], r, r * 0.86, ra, 0, TAU); g.stroke();
        g.strokeStyle = k % 2 ? '#ffd9a8' : A.band; g.lineWidth = 5.6 - age * 1.0; g.beginPath(); g.ellipse(c[0], c[1], r, r * 0.86, ra, 0, TAU); g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(c[0], c[1], r - 1.2, r * 0.86 - 1.2, ra, 3.7, 4.7); g.stroke();
      }
      g.restore();
      // one chunky note per slap, floating off the headstock side so it never crosses the face
      const nk = fr(t * 2.6 / 2), hp = bassPt(AN_NECK + 6, -16, S.P), hq = tPt(S, hp[0], hp[1]), nx = hq[0] + 8 + nk * 16, ny = hq[1] - 10 - nk * 40;
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
      // the new poses (HV_ART_AUDIO 2.5). windup: the bass neck raised (the fretting hand comes up with it), leaning back, eyes closed: the bass face
      windup: { mic: 'none', fHand: [35, 19], fBend: 1, fKind: 'fist', fRot: -0.25, bHand: [20, 42], bBend: 1, bKind: 'relaxed', bRot: 0.3, bFront: 1, bassRot: 0.4, lean: -0.06, headRot: -0.1,
        fFoot: [26, -12], bFoot: [-24, -12], eyes: 'closed', mouth: 'flat', brow: 0.35, fx: ['prop'] },
      // strike: the kit attack (a big strum) with a step in, bass notes and an orange wave rolling along the ground
      strike: { mic: 'none', fHand: [35, 19], fBend: 1, fKind: 'fist', fRot: -0.25, bHand: [20, 42], bBend: 1, bKind: 'fist', bRot: 0.5, bFront: 1, bx: 14, lean: 0.05, torsoRot: 0.03, headRot: 0.06, headDx: 2, bassRot: 0.3,
        fFoot: [32, -12], bFoot: [-26, -12], eyes: 'open', mouth: 'grin', brow: 0.45, fx: ['prop', 'bassfx', 'bassnotes', 'wave'] },
      // block: the bass body turned forward like a shield, feet planted wide, determined eyes
      block: { mic: 'none', fHand: [35, 19], fBend: 1, fKind: 'fist', fRot: -0.25, bHand: [20, 42], bBend: 1, bKind: 'fist', bRot: 0.3, bFront: 1, bassRot: 0.8, bassDx: 12, bassDy: 4, headRot: 0.02,
        fFoot: [36, -12], bFoot: [-34, -12], eyes: 'determined', mouth: 'flat', brow: 0.4, fx: ['prop', 'rings'] },
      // down: sitting on the floor with the bass across his knees, head tipped back, eyes closed, the grey '...' bubble
      down: { mic: 'none', fHand: [35, 22], fBend: 1, fKind: 'relaxed', fRot: -0.25, bHand: [20, 42], bBend: 1, bKind: 'relaxed', bRot: 0.3, bFront: 1, by: 52, bassRot: -0.12, headRot: -0.3, headDx: -2,
        fFoot: [52, -62], bFoot: [38, -62], fFootRot: -1.2, bFootRot: -1.1, eyes: 'closed', mouth: 'flat', brow: -0.1, fx: ['prop', 'mute'] },
      // walk: a heavy, relaxed walk with the bass bouncing (see the tweak)
      walk: Object.assign({ mic: 'none', fHand: [33, 22], fBend: 1, fKind: 'fist', fRot: -0.25, bHand: [20, 42], bBend: 1, bKind: 'relaxed', bRot: 0.3, bFront: 1, headRot: 0.03, fx: [] }, easy),
    };
  }

  const anSpec = {
    id: 'andy',
    accent: 'andy',
    skel: {},
    base: {},
    poses: anPoses(),
    life: { idle: { bob: 1.8, per: 1.7, sway: 0.03, head: 0.04 }, sing: { bob: 2.0, per: 1.1, sway: 0.04, head: 0.06, beat: 0.5, beatHz: 2 }, walk: { bob: 2.8, per: 0.5, head: 0.012, step: { hz: 2, stride: 8, lift: 4 } } },
    tip: (P, L) => { const p = bassPt(AN_NECK + 14, 0, P); return mat.pt(L.torso, p[0], p[1]); },        // the striking point: the bass headstock
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
      if (P.pose === 'attack' || P.pose === 'strike') {
        const b = P.beat;
        P.bHand = [P.bHand[0] - 4 * (1 - b), P.bHand[1] - 21 * (1 - b)];
        P.bKind = b > 0.45 ? 'fist' : 'relaxed';
      } else if (P.pose === 'sing') {
        const k = Math.pow(Math.abs(Math.sin(Math.PI * t * 2)), 2);
        P.bHand = [P.bHand[0], P.bHand[1] - 4 * (1 - k)];
        P.bFoot = [P.bFoot[0], P.bFoot[1] - 8 * Math.pow(Math.max(0, Math.sin(Math.PI * t * 2)), 2)];
      } else if (P.pose === 'walk') P.bassRot = 0.05 * Math.sin(Math.PI * t * 4) * tk.motion();
      // a turned or moved bass carries both hands along (the fretting hand on the neck, the plucking hand on the body)
      if (P.bassRot || P.bassDx || P.bassDy) {
        const SK = anSpec.skel, sf = SK.shF || [26, -131], sb = SK.shB || [-26, -131];
        const f0 = [sf[0] + P.fHand[0], sf[1] + P.fHand[1]], f1 = onBass(f0, P), b0 = [sb[0] + P.bHand[0], sb[1] + P.bHand[1]], b1 = onBass(b0, P);
        P.fHand = [P.fHand[0] + f1[0] - f0[0], P.fHand[1] + f1[1] - f0[1]];
        P.bHand = [P.bHand[0] + b1[0] - b0[0], P.bHand[1] + b1[1] - b0[1]];
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
    // the handles first, so the shirts sit in front of them
    [[x - 11, y - 42, x - 9, y - 68, x + 7, y - 68, x + 9, y - 42]].forEach((h) => {
      const sp = [[h[0], h[1]], [h[2], h[3]], [h[4], h[5]], [h[6], h[7]]];
      RJ.ink(g, sp, { w: 6.6, color: C.ink, taper: 0, wobble: 0, weightVar: 0 });
      RJ.ink(g, sp, { w: 4, color: J.tealDk, taper: 0, wobble: 0, weightVar: 0 });
    });
    // two folded T-shirts tucked in the bag, leaning apart: a violet one behind with a star print and a sunny yellow one in front with a round print.
    // Each shows its shoulders, two short sleeves and a round neckline, so they read as shirts and not as a pair of ears (P11 D11)
    const tee = (cx, cy, rot, hw, col, sh, collar, print) => {
      g.save(); g.translate(cx, cy); g.rotate(rot);
      const body = [[-3.8, 0, 1], [-hw * 0.6, 1.4, 1], [-hw, 7.5, 1], [-hw + 3.8, 12.8, 1], [-hw * 0.6, 10.4, 1], [-hw * 0.6, 28, 1], [hw * 0.6, 28, 1], [hw * 0.6, 10.4, 1], [hw - 3.8, 12.8, 1], [hw, 7.5, 1], [hw * 0.6, 1.4, 1], [3.8, 0, 1], [0, 3.2]];
      RJ.cel(g, body, col, { shadow: sh, line: LINE.main, depth: 2.6, tension: 0.2, hi: false, decor: (gg) => {
        gg.beginPath(); gg.moveTo(-3.8, 0); gg.quadraticCurveTo(0, 7.4, 3.8, 0); gg.closePath(); gg.fillStyle = sh; gg.fill();      // the inside of the collar
        RJ.ink(gg, [[-hw * 0.6, 1.4], [-hw * 0.6 + 0.6, 10.4]], { w: 1, color: sh, taper: 0, wobble: 0 });
        RJ.ink(gg, [[hw * 0.6, 1.4], [hw * 0.6 - 0.6, 10.4]], { w: 1, color: sh, taper: 0, wobble: 0 });
        if (print === 'dot') { gg.beginPath(); gg.arc(0, 16.5, 2.8, 0, TAU); gg.fillStyle = J.logoG; gg.fill(); } else tk.sparkle(gg, 0, 16.5, 3.6, { color: '#fff6e6', glow: 0, thin: 0.25 });
      } });
      RJ.ink(g, [[-3.8, 0], [0, 4.6], [3.8, 0]], { w: 1.7, color: collar, taper: 0, wobble: 0, weightVar: 0 });                      // the neckband
      g.restore();
    };
    tee(x + 7, y - 66, 0.12, 12.5, '#a77bff', '#7e56d8', '#d6c2ff', 'star');
    tee(x - 8, y - 62, -0.14, 12.5, '#ffd84d', '#e0aa22', '#fff2a8', 'dot');
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
  }

  castRoxor();
  castJasmin();
  castCrew();
  // =====================================================================================================================================
  // THE ART.hero ADAPTER (HV_ART_AUDIO 2.3): the original hero contract (every member, every call site unchanged), drawn with the cast
  // =====================================================================================================================================
  const tk = ART.tk;
  const TAU = Math.PI * 2, PI = Math.PI;
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : (d === undefined ? 0 : d));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const cA = (a) => (a >= 0 ? (a <= 1 ? a : 1) : 0);
  const pos = (v, d) => (v > 0 && isFinite(v) ? v : d);
  const own = (o, k) => !!o && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
  const CAST_K = 0.9;                                                // kit px to engine px: the head centre lands near y -184 to -194
  const SMALL_S = 0.4;                                               // below this engine scale (the map token) a figure blits cached frames
  const POSE_MS = { attack: 420, cast: 500, hurt: 260, block: 300, down: 500, cheer: 800, idle: 0, walk: 0 };
  const KEYT = { attack: 0.36, cast: 0.75, hurt: 0.28, block: 1, down: 1, cheer: 0.45, idle: 0, walk: 0 };
  const EXPRS = ['neutral', 'smile', 'angry', 'hurt', 'determined'];
  const EXPR_KIT = { neutral: 'neutral', smile: 'happy', angry: 'angry', hurt: 'hurt', determined: 'smirk' };
  // hero id -> the cast ids of its stage clothes and its outfit (Andy has none, bible 7.1)
  const HEROES = { hanae: { stage: 'jasmin', skin: 'jasmin_unicorn' }, kuro: { stage: 'roxor', skin: 'roxor_monster' }, suzu: { stage: 'rawclaw', skin: 'rawclaw_goat' }, raiga: { stage: 'andy', skin: null } };
  const outfit = { hanae: 'stage', kuro: 'stage', suzu: 'stage', raiga: 'stage' };   // the viewer's effective outfits, pushed by the UI
  const warned = {};
  const warnOnce = (key, e) => { if (warned[key]) return; warned[key] = 1; if (typeof console !== 'undefined' && console.warn) console.warn('ART.hero ' + key + ': ' + (e && e.message ? e.message : e)); };
  const heroCol = (id) => { const d = DATA.heroes && DATA.heroes[id]; return d && d.color ? { c: d.color, a: d.accent || '#ffffff', d: d.dark || '#2d170f' } : { c: '#a9c4ff', a: '#ffffff', d: '#3a3f6a' }; };
  const CAST_COL = { jordan: { c: '#2ec4b6', a: '#e6fffb', d: '#0d4f4a' } };
  const colOfCast = (cid) => { for (const h in HEROES) if (HEROES[h].stage === cid || HEROES[h].skin === cid) return heroCol(h); return CAST_COL[cid] || { c: '#8f5fe8', a: '#ffffff', d: '#2a1a5a' }; };
  // the cast id drawn for a hero: skin 'skin' or 'stage' when given, else the viewer's outfit; a missing outfit figure falls back to the stage clothes
  function castOf(id, skin) {
    const h = own(HEROES, id) ? HEROES[id] : null;
    if (!h) return null;
    const want = skin === 'skin' || skin === 'stage' ? skin : outfit[id];
    return want === 'skin' && h.skin && own(RJ.chars, h.skin) ? h.skin : h.stage;
  }

  // The engine poses on the kit poses (HV_ART_AUDIO 2.5): [time s, kit pose] keys, eased with inOutSine between neighbours. One-shot poses hold
  // their last key for any larger pt; idle and walk are loops and ignore pt.
  const TL = {
    attack: [[0, 'idle'], [0.07, 'windup'], [0.15, 'strike'], [0.26, 'strike'], [0.42, 'idle']],
    cast: [[0, 'idle'], [0.12, 'sing'], [0.38, 'sing'], [0.5, 'idle']],
    hurt: [[0, 'idle'], [0.04, 'hurt'], [0.12, 'hurt'], [0.26, 'idle']],
    block: [[0, 'idle'], [0.12, 'block']],
    down: [[0, 'idle'], [0.08, 'hurt'], [0.5, 'down']],
    cheer: [[0, 'idle'], [0.1, 'cheer']],
  };
  const easeIO = (u) => 0.5 - 0.5 * Math.cos(PI * clamp(u, 0, 1));
  function kitPose(pose, pt) {
    if (pose === 'walk') return { pose: 'walk' };
    const tl = own(TL, pose) ? TL[pose] : null;
    if (!tl) return { pose: 'idle' };
    pt = num(pt, 0);
    if (pt <= tl[0][0]) return { pose: tl[0][1] };
    for (let i = 1; i < tl.length; i++) {
      if (pt < tl[i][0]) {
        const a = tl[i - 1], b = tl[i];
        if (a[1] === b[1]) return { pose: a[1] };
        return { pose: a[1], mix: { pose: b[1], k: easeIO((pt - a[0]) / (b[0] - a[0])) } };
      }
    }
    return { pose: tl[tl.length - 1][1] };
  }
  const kitExpr = (e) => (typeof e === 'string' && own(EXPR_KIT, e) ? EXPR_KIT[e] : undefined);

  // a cached frame of a cast figure (the map token, low quality, outfit swatches, the Filter's pastel wash): RJ.bake with a quantised time
  // Loops: the walk at 8 frames a cycle (1 s), idle at 4 frames a second over a 4 s loop; other poses t to 1/8 s modulo 4 s and the blend to 1/30.
  // A looping figure bakes its next frames two a draw, so the whole loop is ready after a few frames and the steady state bakes nothing.
  const LOOPS = { walk: { n: 8, dt: 1 / 8 }, idle: { n: 16, dt: 1 / 4 } };
  function cachedFrame(cid, kp, o, ks) {
    const loop = !kp.mix && o.cache !== true && own(LOOPS, kp.pose) ? LOOPS[kp.pose] : null;
    const fi = loop ? ((Math.round(num(o.t) / loop.dt) % loop.n) + loop.n) % loop.n : 0;
    const tq = o.cache === true && !tk.lowQ() ? Math.round(num(o.t) * 100) / 100 : loop ? fi * loop.dt : (((Math.round(num(o.t) * 8) % 32) + 32) % 32) / 8;
    const gloss = clamp(num(o.gloss), 0, 1);
    const mix = kp.mix ? { pose: kp.mix.pose, k: Math.round(kp.mix.k * 30) / 30 } : undefined;
    if (loop && gloss <= 0.01) {
      let baked = 0;
      for (let j = 1; j < loop.n && baked < 2; j++) {
        const fo = { pose: kp.pose, t: ((fi + j) % loop.n) * loop.dt, expr: kitExpr(o.expr), flip: !!o.flip, s: ks, noShadow: o.shadow === false };
        if (!ART.sprite.has(RJ.bakeKey(cid, fo))) { RJ.bake(cid, fo); baked++; }
      }
    }
    const post = gloss > 0.01 ? (g, w, h) => {
      // the Filter's pastel wash (HV_ENEMIES 5.3): a pastel film over the figure only, and a soft diagonal sheen like a phone screen catching light
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(244,241,251,' + (0.2 * gloss).toFixed(3) + ')'; g.fillRect(0, 0, w, h);
      const gr = g.createLinearGradient(0, 0, w, h);
      gr.addColorStop(0.35, 'rgba(230,217,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,' + (0.18 * gloss).toFixed(3) + ')'); gr.addColorStop(0.65, 'rgba(217,255,244,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    } : null;
    return RJ.bake(cid, { pose: kp.pose, mix, t: tq, expr: kitExpr(o.expr), flip: !!o.flip, s: ks, noShadow: o.shadow === false, post, postKey: post ? 'gloss' + gloss.toFixed(2) : '' });
  }

  // ART.hero.draw(ctx, heroId, {x, y, s, pose, t, pt, flip, alpha, glow, shadow, skin, gloss, cache, expr})
  function drawHero(ctx, id, o) {
    if (!ctx) return;
    o = o || {};
    const x = num(o.x), y = num(o.y), s0 = num(o.s, 1), s = s0 > 0 ? s0 : s0 === 0 ? 1e-3 : 1;
    const cid = castOf(id, o.skin);
    if (!cid || !own(RJ.chars, cid)) {
      ctx.save();
      try { ctx.translate(x, y); ctx.scale(o.flip ? -s : s, s); if (o.alpha !== undefined) ctx.globalAlpha = ctx.globalAlpha * cA(o.alpha); ART.placeholder(ctx, String(id) + (typeof o.pose === 'string' ? ' ' + o.pose : ''), -50, -250, 100, 250, { color: '#5b3f8a' }); } finally { ctx.restore(); }
      return;
    }
    ctx.save();
    try {
      if (o.alpha !== undefined) ctx.globalAlpha = ctx.globalAlpha * cA(o.alpha);
      const kp = kitPose(typeof o.pose === 'string' ? o.pose : 'idle', o.pt), ks = s * CAST_K;
      if (o.glow) {
        const col = typeof o.glow === 'string' && o.glow.charAt(0) === '#' ? o.glow : heroCol(id).c, a = typeof o.glow === 'number' ? clamp(o.glow, 0, 1) : 0.8;
        tk.glow(ctx, x, y - 118 * ks, 72 * s, col, 0.5 * a);
      }
      const gloss = clamp(num(o.gloss), 0, 1);
      if (o.cache === true || gloss > 0.01 || tk.lowQ() || s < SMALL_S) cachedFrame(cid, kp, o, ks).draw(ctx, x, y, ks);
      else RJ.draw(ctx, cid, { x, y, s: ks, pose: kp.pose, mix: kp.mix, t: num(o.t), flip: !!o.flip, expr: kitExpr(o.expr), noShadow: o.shadow === false });
    } catch (e) { warnOnce('draw ' + id, e); } finally { ctx.restore(); }
  }

  // live points: head hand tip bladeMid chest feet weapon (and the kit's mouth micHead shF shB), in stage px
  function pointAt(id, name, o) {
    o = o || {};
    const x = num(o.x), y = num(o.y), cid = castOf(id, o.skin);
    if (!cid || !own(RJ.chars, cid)) return { x, y };
    try {
      const s0 = num(o.s, 1), s = s0 > 0 ? s0 : 1, ks = s * CAST_K;
      const at = (pose, mix) => RJ.chars[cid].points({ x, y, s: ks, pose, mix, t: num(o.t), flip: !!o.flip });
      const kp = kitPose(typeof o.pose === 'string' ? o.pose : 'idle', o.pt), p = at(kp.pose, kp.mix);
      const P = (k) => (p[k] ? { x: p[k][0], y: p[k][1] } : { x, y });
      if (name === 'bladeMid') { const a = P('hand'), b = P('tip'); return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
      if (name === 'weapon') { const r = at('idle'); return r.tip ? { x: r.tip[0], y: r.tip[1] } : { x, y }; }
      if (name === 'feet') return { x: p.feet ? p.feet[0] : x, y: p.feet ? p.feet[1] : y };
      return own(p, name) ? P(name) : { x, y };
    } catch (e) { warnOnce('pointAt ' + id, e); return { x, y }; }
  }

  // bounds at s = 1 in engine px, from the stage figure's idle pose at t = 0 (computed once)
  const DEFAULT_BOUNDS = { w: 130, h: 250, head: { x: 4, y: -186 }, hand: { x: 8, y: -80 }, feet: { x: 0, y: 0 }, weapon: { x: 80, y: -120 }, top: -250 };
  const boundsMemo = {};
  function boundsOf(id) {
    let b = boundsMemo[id];
    if (!b) {
      b = DEFAULT_BOUNDS;
      const cid = own(HEROES, id) ? HEROES[id].stage : null, impl = cid && own(RJ.chars, cid) ? RJ.chars[cid] : null;
      if (impl) {
        try {
          const p = impl.points({ pose: 'idle', t: 0, s: 1 }), r = (q) => ({ x: Math.round(q[0] * CAST_K), y: Math.round(q[1] * CAST_K) });
          b = { w: Math.round(impl.bounds.w * CAST_K), h: 250, head: r(p.head), hand: r(p.hand), feet: { x: 0, y: 0 }, weapon: r(p.tip), top: Math.round(-impl.bounds.h * CAST_K) };
          boundsMemo[id] = b;
        } catch (e) { warnOnce('bounds ' + id, e); }
      }
    }
    return { w: b.w, h: b.h, head: { x: b.head.x, y: b.head.y }, hand: { x: b.hand.x, y: b.hand.y }, feet: { x: b.feet.x, y: b.feet.y }, weapon: { x: b.weapon.x, y: b.weapon.y }, top: b.top };
  }

  // ---- portraits (HV_ART_AUDIO 2.7): a stage spotlight in the hero colour, then the kit bust ----
  const mixC = (a, b, k) => U.color.mix(a, b, k);
  function backdrop(g, id, col, w, h) {
    const light = mixC(col.c, '#ffffff', 0.55), deep = mixC(col.d, '#140f2e', 0.35);
    const gr = g.createRadialGradient(w * 0.5, h * 0.18, Math.min(w, h) * 0.05, w * 0.5, h * 0.4, Math.max(w, h) * 0.85);
    gr.addColorStop(0, light); gr.addColorStop(0.45, mixC(col.c, col.d, 0.35)); gr.addColorStop(1, deep);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // the soft cone of light from the top edge
    const cone = g.createLinearGradient(0, 0, 0, h);
    cone.addColorStop(0, 'rgba(255,248,236,0.42)'); cone.addColorStop(1, 'rgba(255,248,236,0)');
    g.fillStyle = cone; g.beginPath(); g.moveTo(w * 0.36, 0); g.lineTo(w * 0.64, 0); g.lineTo(w * 0.95, h); g.lineTo(w * 0.05, h); g.closePath(); g.fill();
    // bokeh dots
    const n = 6 + Math.floor(tk.vary(id, 'bokn') * 5);
    for (let i = 0; i < n; i++) {
      const bx = tk.vary(id, 'bx' + i) * w, by = tk.vary(id, 'by' + i) * h * 0.85, br = Math.max(1.5, Math.min(w, h) * (0.03 + 0.05 * tk.vary(id, 'br' + i)));
      g.beginPath(); g.arc(bx, by, br, 0, TAU); g.fillStyle = 'rgba(255,248,236,' + (0.08 + 0.12 * tk.vary(id, 'ba' + i)).toFixed(3) + ')'; g.fill();
    }
    // a soft stage floor glow at the bottom
    const fl = g.createLinearGradient(0, h * 0.75, 0, h);
    fl.addColorStop(0, 'rgba(20,15,46,0)'); fl.addColorStop(1, 'rgba(20,15,46,0.35)');
    g.fillStyle = fl; g.fillRect(0, h * 0.75, w, h * 0.25);
  }
  function backdropLive(ctx, id, col, x, y, w, h, t) {
    const m = tk.motion(), mn = Math.min(w, h), light = mixC(col.c, '#ffffff', 0.6);
    tk.glow(ctx, x + w * 0.5, y + h * 0.3, mn * 0.55 * (1 + 0.04 * Math.sin(t * 1.3) * m), light, 0.35);
    const sr = clamp(mn * 0.05, 4, 14);
    [[0.16, 0.2, 0], [0.86, 0.32, 1.7]].forEach((p, i) => tk.sparkle(ctx, x + w * p[0], y + h * p[1], sr * (0.8 + 0.2 * Math.sin(t * 3 + p[2]) * m) * (i ? 0.85 : 1), { color: '#fff8ec', glow: 0.5, rot: 0.2 * i }));
    if (id === 'hanae') {
      for (let i = 0; i < 3; i++) { const u = ((t * 0.12 * m + i / 3) % 1 + 1) % 1; tk.petal(ctx, x + w * (0.9 - u * 0.8) + Math.sin(t + i * 2) * mn * 0.03, y + h * (0.08 + u * 0.7), Math.max(2, mn * 0.035), t * 0.8 + i, Math.sin(PI * u) * 0.9, i % 2 ? '#ffc2dc' : '#ff7eb6'); }
    } else if (id === 'kuro') {
      for (let i = 0; i < 2; i++) { const u = ((t / 1.6 + i * 0.5) % 1 + 1) % 1; ctx.save(); ctx.globalAlpha *= 0.55 * (1 - u); ctx.strokeStyle = light; ctx.lineWidth = Math.max(1, mn * 0.012); ctx.beginPath(); ctx.arc(x + w * 0.84, y + h * 0.62, mn * (0.05 + 0.12 * u), 0, TAU); ctx.stroke(); ctx.restore(); }
    } else if (id === 'suzu') {
      ctx.save(); ctx.globalAlpha *= 0.4; ctx.strokeStyle = light; ctx.lineWidth = Math.max(1, mn * 0.012); ctx.beginPath();
      for (let i = 0; i <= 40; i++) { const u = i / 40, px = x + u * w, py = y + h * 0.72 + Math.sin(u * TAU * 3 + t * 2 * m) * mn * 0.025 * Math.sin(PI * u); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
      ctx.stroke(); ctx.restore();
    } else if (id === 'raiga') {
      ctx.save(); ctx.strokeStyle = light; ctx.lineWidth = Math.max(1.2, mn * 0.016);
      for (let k = 0; k < 2; k++) { ctx.globalAlpha = 0.35 - k * 0.12; ctx.beginPath(); for (let i = 0; i <= 40; i++) { const u = i / 40, px = x + u * w, py = y + h * (0.9 - k * 0.06) + Math.sin(u * TAU * 1.5 - t * 1.1 * m + k) * mn * 0.02; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.stroke(); }
      ctx.restore();
    }
  }
  function portrait(ctx, id, o) {
    if (!ctx) return;
    o = o || {};
    const x = num(o.x), y = num(o.y), w = pos(o.w, 150), h = pos(o.h, 200), t = num(o.t), cid = castOf(id, o.skin);
    if (!cid || !own(RJ.chars, cid)) { ART.placeholder(ctx, String(id) + ' ' + (typeof o.expr === 'string' ? o.expr : 'neutral'), x, y, w, h, { color: '#5b3f8a' }); return; }
    const col = heroCol(id), expr = kitExpr(o.expr) || 'neutral';
    ctx.save();
    try {
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      const bg = ART.sprite('cast|pbg|' + id + '|' + col.c + '|' + col.d + '|' + Math.round(w) + 'x' + Math.round(h), w, h, (g) => backdrop(g, id, col, w, h));
      ART.blit(ctx, bg, x, y, w, h);
      backdropLive(ctx, id, col, x, y, w, h, t);
      ctx.translate(x, y);
      RJ.bust(ctx, cid, w, h, { t, expr });
    } catch (e) { warnOnce('portrait ' + id, e); } finally { ctx.restore(); }
  }

  // ---- medallions: a cached round face per (cast id, colour, radius) ----
  function medal(ctx, cid, col, x, y, r) {
    const rq = Math.round(r * 2) / 2, pad = Math.ceil(rq * 0.12) + 2, size = rq * 2 + pad * 2;
    const spr = ART.sprite('cast|medal|' + cid + '|' + col.c + '|' + rq, size, size, (g) => {
      const c = size / 2;
      const gr = g.createRadialGradient(c - rq * 0.25, c - rq * 0.35, rq * 0.1, c, c, rq);
      gr.addColorStop(0, mixC(col.c, '#ffffff', 0.55)); gr.addColorStop(1, col.c);
      g.beginPath(); g.arc(c, c, rq, 0, TAU); g.fillStyle = gr; g.fill();
      g.save(); g.beginPath(); g.arc(c, c, rq, 0, TAU); g.clip();
      g.translate(c - rq, c - rq * 0.96); RJ.bust(g, cid, rq * 2, rq * 2, { pose: 'bust', t: 0.4 });
      g.restore();
      g.lineWidth = Math.max(1, rq * 0.09); g.strokeStyle = '#fff8ec'; g.beginPath(); g.arc(c, c, rq - rq * 0.045, 0, TAU); g.stroke();
      g.lineWidth = Math.max(1, rq * 0.08); g.strokeStyle = '#2d170f'; g.beginPath(); g.arc(c, c, rq + rq * 0.04, 0, TAU); g.stroke();
    });
    ART.blit(ctx, spr, x - size / 2, y - size / 2, size, size);
  }
  function medallion(ctx, id, x, y, r, skin) {
    if (!ctx) return;
    r = pos(r, 24); x = num(x); y = num(y);
    const cid = castOf(id, skin);
    if (!cid || !own(RJ.chars, cid)) { ART.placeholder(ctx, String(id), x - r, y - r, r * 2, r * 2, { round: true, color: '#5b3f8a' }); return; }
    try { medal(ctx, cid, heroCol(id), x, y, r); } catch (e) { warnOnce('medallion ' + id, e); }
  }

  const keyPt = (pose) => (POSE_MS[pose] || 0) / 1000 * (KEYT[pose] === undefined ? 0.5 : KEYT[pose]);
  const heroIds = () => ((DATA.LISTS && DATA.LISTS.heroIds) || Object.keys(HEROES)).filter((id) => own(HEROES, id));

  // bake the frames the first fight blits: the eight poses at their key moment, the medallions, the token's walk cycle
  function warm(id, s) {
    let n = 0;
    const cid = castOf(id);
    if (!cid || !own(RJ.chars, cid)) return 0;
    const ks = pos(num(s, 1), 1) * CAST_K;
    try {
      Object.keys(POSE_MS).forEach((pose) => { cachedFrame(cid, kitPose(pose, keyPt(pose)), { cache: true, t: 0 }, ks); n++; });
      [19, 24, 44].forEach((r) => { medallion({ drawImage() {} }, id, 0, 0, r); n++; });
      for (let i = 0; i < 8; i++) { cachedFrame(cid, { pose: 'walk' }, { t: i / 8 }, 0.28 * CAST_K); n++; }
    } catch (e) { warnOnce('warm ' + id, e); }
    return n;
  }

  // dev and tests: bake every pose of both outfits at its key moment (no effects) and report frames whose paint touches the bake box edge
  function audit(id) {
    const bad = [];
    if (!own(HEROES, id)) return bad;
    const casts = [HEROES[id].stage].concat(HEROES[id].skin ? [HEROES[id].skin] : []);
    const frames = [];
    RJ.POSES.forEach((p) => frames.push({ pose: p, t: p === 'walk' ? 0.25 : 0 }));
    Object.keys(TL).forEach((p) => { const kp = kitPose(p, keyPt(p)); frames.push({ pose: kp.pose, mix: kp.mix, t: 0, label: p }); });
    casts.forEach((cid) => frames.forEach((f) => {
      const B = RJ.BAKE_BOX, w = B.x1 - B.x0, h = B.y1 - B.y0;
      let d = null, cw = 0, ch = 0;
      try {
        const spr = ART.sprite('cast|audit|' + cid + '|' + (f.label || f.pose), w * 2, h * 2, (g) => { g.scale(2, 2); RJ.draw(g, cid, { x: -B.x0, y: -B.y0, s: 1, pose: f.pose, mix: f.mix, t: f.t, noFx: true }); });
        if (!spr || spr._inert || !spr.getContext) return;
        cw = spr.width; ch = spr.height;
        d = spr.getContext('2d').getImageData(0, 0, cw, ch).data;
      } catch (e) { return; }
      if (!d || d.length < cw * ch * 4) return;
      const hit = (px, py) => d[(py * cw + px) * 4 + 3] > 24, edges = [];
      for (let px = 0; px < cw && edges.indexOf('top') < 0; px++) if (hit(px, 0)) edges.push('top');
      for (let px = 0; px < cw && edges.indexOf('bottom') < 0; px++) if (hit(px, ch - 1)) edges.push('bottom');
      for (let py = 0; py < ch && edges.indexOf('left') < 0; py++) if (hit(0, py)) edges.push('left');
      for (let py = 0; py < ch && edges.indexOf('right') < 0; py++) if (hit(cw - 1, py)) edges.push('right');
      if (edges.length) {
        let x0 = cw, y0 = ch, x1 = 0, y1 = 0;
        for (let py = 0; py < ch; py++) for (let px = 0; px < cw; px++) if (hit(px, py)) { if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
        bad.push({ part: cid + ' ' + (f.label || f.pose), edges, size: [cw, ch], alpha: [x0, y0, x1, y1] });
      }
    }));
    ART.sprite.drop('cast|audit|');
    return bad;
  }

  ART.hero.draw = drawHero;
  ART.hero.portrait = portrait;
  ART.hero.medallion = medallion;
  ART.hero.bounds = boundsOf;
  ART.hero.poseMs = (pose) => POSE_MS[pose] || 0;
  ART.hero.pointAt = pointAt;
  ART.hero.keyPt = keyPt;
  ART.hero.warm = warm;
  ART.hero.audit = audit;
  ART.hero.expressions = () => EXPRS.slice();
  ART.hero.ids = () => heroIds();
  // the viewer's outfit map {hanae, kuro, suzu, raiga: 'skin' or 'stage'}: set it (unknown keys and values are ignored) and read a copy back
  ART.hero.outfits = (map) => {
    if (map && typeof map === 'object') Object.keys(outfit).forEach((k) => { if (own(map, k) && (map[k] === 'skin' || map[k] === 'stage')) outfit[k] = map[k]; });
    return Object.assign({}, outfit);
  };
  ART.hero.skins = (id) => (own(HEROES, id) ? [{ id: 'stage', cast: HEROES[id].stage }].concat(HEROES[id].skin ? [{ id: 'skin', cast: HEROES[id].skin }] : []) : []);
  ART.hero.castId = (id, skin) => castOf(id, skin);
  ART.declare('hero', Object.keys(HEROES));

  // ---- ART.cast: the thin public wrapper for Jordan, the outfits, story art and the gallery (HV_ART_AUDIO 2.10) ----
  // Jordan's Merch Stall moods: hello (waving, tablet up), buy, poor (an oops, never sad), sold (shows the tablet), leave, empty
  const MOODS = { hello: { pose: 'sing', expr: 'happy' }, buy: { pose: 'cheer' }, poor: { pose: 'hurt', expr: 'shy' }, sold: { pose: 'attack' }, leave: { pose: 'sing' }, empty: { pose: 'idle', expr: 'sleepy' } };
  const castOk = (cid) => typeof cid === 'string' && own(RJ.chars, cid);
  const castOpts = (o) => {
    o = o || {};
    const md = typeof o.mood === 'string' && own(MOODS, o.mood) ? MOODS[o.mood] : null;
    return { x: num(o.x), y: num(o.y), s: num(o.s, 1) * CAST_K, pose: md ? md.pose : (typeof o.pose === 'string' ? o.pose : 'idle'), expr: md && md.expr ? md.expr : (typeof o.expr === 'string' ? o.expr : undefined), t: num(o.t), flip: !!o.flip, mix: o.mix, noShadow: o.shadow === false, noFx: !!o.noFx };
  };
  ART.cast = {
    draw(ctx, cid, o) {
      if (!ctx) return;
      const n = castOpts(o);
      if (!castOk(cid)) { RJ.placeholder(ctx, cid, n); return; }
      ctx.save();
      try { if (o && o.alpha !== undefined) ctx.globalAlpha = ctx.globalAlpha * cA(o.alpha); RJ.draw(ctx, cid, n); } catch (e) { warnOnce('cast ' + cid, e); } finally { ctx.restore(); }
    },
    bust(ctx, cid, w, h, o) { if (!ctx) return; o = o || {}; RJ.bust(ctx, cid, w, h, { t: num(o.t), expr: typeof o.expr === 'string' ? o.expr : undefined, pose: typeof o.pose === 'string' ? o.pose : undefined }); },
    medallion(ctx, cid, x, y, r) {
      if (!ctx) return;
      r = pos(r, 24); x = num(x); y = num(y);
      if (!castOk(cid)) { ART.placeholder(ctx, String(cid), x - r, y - r, r * 2, r * 2, { round: true, color: '#5b3f8a' }); return; }
      try { medal(ctx, cid, colOfCast(cid), x, y, r); } catch (e) { warnOnce('cast medallion ' + cid, e); }
    },
    point(cid, name, o) { const n = castOpts(o); if (!castOk(cid)) return { x: n.x, y: n.y }; const p = RJ.point(cid, name, n); return p || { x: n.x, y: n.y }; },
    bake(cid, o) { return RJ.bake(castOk(cid) ? cid : 'jordan', castOpts(o)); },
    ids: () => RJ.ids.slice(),
    moods: () => Object.keys(MOODS),
  };
  // ---- gallery sheets ----
  const POSES8 = () => (DATA.LISTS && DATA.LISTS.poses) || Object.keys(POSE_MS);
  const ptOf = (pose, params) => (params && params.pt !== undefined && isFinite(+params.pt) ? +params.pt : keyPt(pose));
  const skinOf = (params) => (params && (params.skin === 'skin' || params.skin === 'stage') ? params.skin : undefined);
  const floor = (g, w, h, y) => { g.fillStyle = 'rgba(20,15,46,0.5)'; g.fillRect(0, y, w, h - y); g.fillStyle = 'rgba(255,248,236,0.08)'; g.fillRect(0, y, w, 2); };

  ART.sheet('hero_dev', (canvas, params) => {
    const pose = params.pose || 'idle', sc = num(+params.zoom, 2.6), all = params.hero === 'all';
    const ids = all ? heroIds() : String(params.hero || 'hanae').split(',');
    const ctx = canvas.getContext('2d'), W = params.w, H = params.h;
    tk.sky(ctx, 0, 0, W, H, 'night');
    if (params.mode === 'portrait') { ids.forEach((hid, i) => { const pw = W / ids.length, ph = Math.min(H, pw / 0.75); portrait(ctx, hid, { x: i * pw, y: 0, w: pw, h: ph, expr: params.expr || 'neutral', t: num(+params.t, 0), skin: skinOf(params) }); }); return; }
    floor(ctx, W, H, H * 0.9);
    ids.forEach((hid, i) => drawHero(ctx, hid, { x: W * (i + 0.5) / ids.length, y: H * 0.93, s: all ? Math.min(sc, H * 0.86 / 300, W / ids.length / 250) : sc, pose, t: num(+params.t, 0), pt: ptOf(pose, params), skin: skinOf(params) }));
    ctx.font = '600 14px system-ui'; ctx.fillStyle = '#c9bff0'; ctx.textAlign = 'left'; ctx.fillText(ids.join(',') + ' / ' + pose + ' / t=' + num(+params.t, 0).toFixed(2), 12, 22);
  });

  ART.sheet('heroes', (canvas, params) => {
    const ids = heroIds(), poses = POSES8(), t = num(+params.t, 0), skin = skinOf(params), cells = [];
    ids.forEach((id) => poses.forEach((pose) => cells.push({ id, pose, label: id + ' ' + pose })));
    ART.sheetGrid(canvas, params, cells, (g, cell, w, h) => {
      tk.sky(g, 0, 0, w, h, 'night');
      floor(g, w, h, h * 0.88);
      const s = Math.min(w / 250, h * 0.86 / 300);
      drawHero(g, cell.id, { x: w / 2, y: h * 0.9, s, pose: cell.pose, t, pt: ptOf(cell.pose, params), skin });
    }, { cols: poses.length, title: 'ART.hero: every hero, every pose (one-shots at their key moment)', gap: 6, labelH: 16 });
  });

  ART.sheet('portraits', (canvas, params) => {
    const ids = heroIds(), t = num(+params.t, 0), skin = skinOf(params), cells = [];
    ids.forEach((id) => { EXPRS.forEach((e) => cells.push({ id, expr: e, label: id + ' ' + e })); cells.push({ id, medal: 44, label: id + ' medallion' }); cells.push({ id, medal: 9, label: id + ' r9' }); });
    ART.sheetGrid(canvas, params, cells, (g, cell, w, h) => {
      tk.sky(g, 0, 0, w, h, 'night');
      if (cell.medal) { medallion(g, cell.id, w / 2, h / 2, Math.min(cell.medal, Math.min(w, h) * 0.42), skin); return; }
      const pw = Math.min(w, h * 0.75), ph = pw / 0.75;
      portrait(g, cell.id, { x: (w - pw) / 2, y: 0, w: pw, h: ph, expr: cell.expr, t, skin });
    }, { cols: EXPRS.length + 2, title: 'ART.hero.portrait: expressions, medallions', gap: 6, labelH: 16 });
  });

  // a little round stage under the night sky: the backdrop of the lineup and the outfit sheets
  function stage(ctx, W, H, t, gy) {
    tk.sky(ctx, 0, 0, W, H, 'night');
    tk.stars(ctx, 0, 0, W, H * 0.6, t, { n: 70, seed: 3 });
    tk.moon(ctx, W * 0.82, H * 0.14, H * 0.06, { phase: 0.15 });
    for (let i = 0; i < 3; i++) {
      const cx = W * (0.25 + i * 0.25), cone = ctx.createLinearGradient(0, 0, 0, gy);
      cone.addColorStop(0, 'rgba(255,244,214,0.20)'); cone.addColorStop(1, 'rgba(255,244,214,0.02)');
      ctx.fillStyle = cone; ctx.beginPath(); ctx.moveTo(cx - W * 0.02, 0); ctx.lineTo(cx + W * 0.02, 0); ctx.lineTo(cx + W * 0.11, gy); ctx.lineTo(cx - W * 0.11, gy); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#2a1d4f'; ctx.beginPath(); ctx.ellipse(W / 2, gy + H * 0.05, W * 0.52, H * 0.09, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff1d6'; ctx.beginPath(); ctx.ellipse(W / 2, gy + H * 0.035, W * 0.5, H * 0.075, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5b3fa8'; ctx.beginPath(); ctx.ellipse(W / 2, gy + H * 0.03, W * 0.49, H * 0.068, 0, 0, TAU); ctx.fill();
    for (let i = 0; i < 18; i++) { const u = i / 17, bx = W * (0.04 + u * 0.92), by = H * (0.06 + 0.05 * Math.sin(PI * u)); tk.glow(ctx, bx, by, 9, i % 3 === 0 ? '#ff7eb6' : i % 3 === 1 ? '#3fcf6a' : '#ffd84d', 0.6 + 0.3 * Math.sin(t * 2 + i)); ctx.beginPath(); ctx.arc(bx, by, 2.4, 0, TAU); ctx.fillStyle = '#fff8ec'; ctx.fill(); }
  }
  ART.sheet('hero_lineup', (canvas, params) => {
    const ctx = canvas.getContext('2d'), W = params.w, H = params.h, t = num(+params.t, 0), ids = heroIds(), gy = H * 0.8;
    stage(ctx, W, H, t, gy);
    ids.forEach((id, i) => drawHero(ctx, id, { x: W * (0.2 + i * 0.2), y: gy + (i % 2 ? 6 : 0), s: (H * 0.6) / 300 * (i % 2 ? 0.94 : 1), pose: 'idle', t: t + i * 0.7, flip: i >= 2, skin: skinOf(params) }));
    tk.vignette(ctx, W, H, { alpha: 0.45 });
  });

  ART.sheet('hero_anim', (canvas, params) => {
    const hid = params.hero || heroIds()[0], t = num(+params.t, 0), poses = params.pose ? String(params.pose).split(',') : ['attack', 'cast', 'hurt'];
    const n = params.pose && poses.length === 1 ? 12 : 8, cells = [], skin = skinOf(params);
    poses.forEach((pose) => { for (let i = 0; i < n; i++) cells.push({ pose, i, label: pose + ' ' + Math.round(i / (n - 1) * (POSE_MS[pose] || 1000)) + 'ms' }); });
    ART.sheetGrid(canvas, params, cells, (g, cell, w, h) => {
      tk.sky(g, 0, 0, w, h, 'night');
      floor(g, w, h, h * 0.88);
      const dur = (POSE_MS[cell.pose] || 1000) / 1000, s = Math.min(w / 260, h * 0.86 / 300);
      drawHero(g, hid, { x: w * 0.45, y: h * 0.9, s, pose: cell.pose, t: (POSE_MS[cell.pose] ? t + cell.i * 0.033 : t + cell.i / (n - 1) * dur), pt: cell.i / (n - 1) * dur, skin });
    }, { cols: n > 8 ? n / 2 : n, title: hid + ': ' + poses.join(', ') + ' across the pose', gap: 4, labelH: 16 });   // one pose: 12 frames in two rows of 6
  });

  ART.sheet('cast_skins', (canvas, params) => {
    const t = num(+params.t, 0), poses = String(params.poses || 'idle,attack,block,down,cheer').split(','), cells = [];
    heroIds().filter((id) => HEROES[id].skin).forEach((id) => ['stage', 'skin'].forEach((sk) => {
      poses.forEach((p) => cells.push({ id, sk, pose: p, label: id + ' ' + sk + ' ' + p }));
      cells.push({ id, sk, medal: true, label: id + ' ' + sk + ' medallion' });
    }));
    ART.sheetGrid(canvas, params, cells, (g, cell, w, h) => {
      tk.sky(g, 0, 0, w, h, 'night');
      if (cell.medal) { medallion(g, cell.id, w / 2, h * 0.36, Math.min(w, h) * 0.3, cell.sk); medallion(g, cell.id, w / 2, h * 0.82, 9, cell.sk); return; }
      floor(g, w, h, h * 0.88);
      drawHero(g, cell.id, { x: w / 2, y: h * 0.9, s: Math.min(w / 250, h * 0.86 / 300), pose: cell.pose, t, pt: ptOf(cell.pose, params), skin: cell.sk });
    }, { cols: poses.length + 1, title: 'Outfits: stage clothes and the three skins (same poses, same anchors)', gap: 6, labelH: 16 });
  });

  ART.sheet('cast_jordan', (canvas, params) => {
    const t = num(+params.t, 0), cells = Object.keys(MOODS).map((m) => ({ mood: m, label: 'jordan ' + m })).concat([{ bust: true, label: 'jordan bust' }, { medal: true, label: 'jordan medallion r44, r14' }]);
    ART.sheetGrid(canvas, params, cells, (g, cell, w, h) => {
      tk.sky(g, 0, 0, w, h, 'night');
      if (cell.bust) { const pw = Math.min(w, h * 0.75); g.save(); g.translate((w - pw) / 2, 0); backdrop(g, 'jordan', CAST_COL.jordan, pw, pw / 0.75); ART.cast.bust(g, 'jordan', pw, pw / 0.75, { t }); g.restore(); return; }
      if (cell.medal) { ART.cast.medallion(g, 'jordan', w / 2, h * 0.4, Math.min(44, Math.min(w, h) * 0.3)); ART.cast.medallion(g, 'jordan', w / 2, h * 0.84, 14); return; }
      floor(g, w, h, h * 0.88);
      ART.cast.draw(g, 'jordan', { x: w / 2, y: h * 0.9, s: Math.min(w / 260, h * 0.86 / 300), mood: cell.mood, t });
    }, { cols: 4, title: "Jordan (ART.cast): the Merch Stall moods, bust and medallion", gap: 6, labelH: 16 });
  });

  // the live-draw budget (HV_ART_AUDIO 2.8): every cast figure drawn 200 times into a no-op context, ms per draw against 1.2 ms
  const NOOP_CTX = (() => {
    let self = null;
    const fn = () => self;
    const handler = { get: (tg, k) => (k === 'canvas' ? undefined : k === 'measureText' ? () => ({ width: 0 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : fn), set: () => true };
    self = typeof Proxy === 'function' ? new Proxy(function () {}, handler) : null;
    return self;
  })();
  ART.hero.perf = (cid, n) => {
    const clock = typeof performance !== 'undefined' && performance.now ? () => performance.now() : null;
    if (!clock || !NOOP_CTX || !castOk(cid)) return -1;
    n = Math.max(1, Math.min(2000, num(n, 200) | 0));
    const t0 = clock();
    for (let i = 0; i < n; i++) RJ.draw(NOOP_CTX, cid, { x: 0, y: 0, s: 1, pose: RJ.POSES[i % RJ.POSES.length], t: i * 0.016 });
    return (clock() - t0) / n;
  };
  ART.sheet('cast_perf', (canvas, params) => {
    const ctx = canvas.getContext('2d'), W = params.w, H = params.h, ids = RJ.ids.slice(), n = num(+params.n, 200);
    tk.sky(ctx, 0, 0, W, H, 'night');
    ctx.font = '600 16px system-ui'; ctx.fillStyle = '#e9e2ff'; ctx.textAlign = 'left';
    ctx.fillText('Cast live-draw cost: ' + n + ' draws each into a no-op context (budget 1.2 ms a figure)', 16, 26);
    const bw = W - 260, rowH = Math.min(36, (H - 60) / Math.max(1, ids.length));
    ids.forEach((cid, i) => {
      const ms = ART.hero.perf(cid, n), y = 50 + i * rowH, len = clamp(ms / 2.4, 0, 1) * bw;
      ctx.fillStyle = ms > 1.2 ? '#ff7e7e' : '#3fcf6a'; ctx.fillRect(200, y, Math.max(2, len), rowH * 0.6);
      ctx.fillStyle = '#e9e2ff'; ctx.fillText(cid, 16, y + rowH * 0.5); ctx.fillText(ms >= 0 ? ms.toFixed(3) + ' ms' : 'n/a', 210 + len, y + rowH * 0.5);
    });
    ctx.strokeStyle = '#ffd84d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(200 + bw * 0.5, 40); ctx.lineTo(200 + bw * 0.5, H - 10); ctx.stroke();
  });
})();
