// roxor.js: RoxorLoops (id 'roxor', accent GREEN) and his monster-onesie variant ('roxor_monster'). Built on kit.js (RJ.rig).
// Beatbox and support hero. Identity: tall swooping mohawk pushed up and forward, shaved stubble sides, a short mullet tail, pale blue-grey
// cheeky eyes, smirk with a flash of teeth, black tee with an orange smiley, olive pants, lime sneakers, black mic with a green band.
// The face, the stubble, the mohawk and the mullet are shared by both variants (makeRoxor(variant)); the variant swaps outfit and hood.
(function () {
  'use strict';
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
      hat.forEach((h, i) => RJ.ink(gg, [STRETCH([h[0], h[1]]), STRETCH([h[2], h[3]])], { w: 1.3, color: streak || H.streak, taper: 0.5, wobble: 0, alpha: 0.85, seed: i }));
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
      [[-52, -18, -49, -15], [-50, -4, -47, -1], [-53, 8, -50, 11], [-47, -28, -44, -25], [-55, -30, -52, -27], [-47, 12, -45, 15], [-52, 17, -49, 19], [-45, 2, -42, 4]].forEach((t, i) =>
        RJ.ink(g, [[t[0], t[1]], [t[2], t[3]]], { w: 0.9, color: H.stubDk, taper: 0.5, wobble: 0, alpha: 0.5, seed: i }));
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
  function furTufts(g, pts) {                                           // small curly 'u' tufts, the cartoon's fur marks
    for (let i = 0; i < pts.length; i++) {
      const x = pts[i][0], y = pts[i][1];
      RJ.ink(g, [[x - 3.5, y - 2], [x - 2, y + 1.6], [x, y - 0.6], [x + 1.6, y + 1.8], [x + 3.4, y - 1.6]], { w: 1.4, color: H.furDk, taper: 0.4, wobble: 0, alpha: 0.9 });
    }
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
})();
