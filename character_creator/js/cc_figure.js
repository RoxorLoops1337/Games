// Character Studio figure: builds an ART.rj rig (the game's chibi kit) from a character and draws it. CC.rigFor(character) -> rig,
// CC.draw(ctx, character, {x, y, s, pose, t, flip, expr}), CC.bust(ctx, character, w, h, o).
// The skeleton, arms, legs, mic, blinking and poses are the kit's own, so a character moves exactly like the game's cast.
(function () {
  'use strict';
  const CC = window.CC, RJ = ART.rj, tk = ART.tk, C = RJ.C, LINE = RJ.LINE;
  const { clamp, lerp } = CC.u, col = CC.col, FACE = CC.face;
  const mat = tk.mat;

  // ---- poses (the numbers are the kit's RJ.BASE_POSE keys; the tables are the owners' two characters' poses, merged) ----
  function poses(K) {
    const c = K.c, mouth = c.mouth, hasMic = c.mic !== 'none';
    const happy = { eyes: 'open', mouth, brow: -0.1 };
    const P = {};
    P.idle = Object.assign({ mic: 'hand', fHand: [22, -4], fBend: 1, micAng: 1.0, micGrip: 22, bHand: [-38, 14], bBend: -1, bKind: 'open', bSpread: 0.85, bRot: 0.12, fx: [], headRot: -0.04 }, happy);
    P.cool = Object.assign({ mic: 'hand', fHand: [16, 36], fBend: -1, micAng: 1.3, micGrip: 22, bHand: [-42, 10], bBend: -1, bKind: 'point', bRot: 0.28, fx: [], headRot: 0.04, torsoRot: -0.02 }, { eyes: 'open', mouth, brow: 0.22 });
    P.sweet = { mic: 'hand', fHand: [-6, 8], fBend: 1, micAng: 1.4, micGrip: 22, bHand: [-8, 14], bBend: -1, bKind: 'relaxed', bRot: -0.4, bFront: 1, headRot: 0.06, eyes: 'happy', mouth: 'smile', blush: 1.4, fx: ['hearts'] };
    P.hips = Object.assign({ mic: 'hand', fHand: [16, 36], fBend: -1, micAng: 1.55, micGrip: 22, bHand: [-16, 36], bBend: 1, bKind: 'fist', bRot: 0.4, fx: [], headRot: 0.04, torsoRot: -0.02, fFoot: [26, -12], bFoot: [-24, -12] }, { eyes: 'open', mouth, brow: 0.2 });
    P.wave = Object.assign({ mic: 'hand', fHand: [20, 2], fBend: 1, micAng: 1.1, micGrip: 22, bHand: [-34, -44], bBend: -1, bKind: 'open', bSpread: 1.3, bRot: 0.2, fx: [], headRot: -0.06 }, happy);
    P.sing = { mic: 'mouth', micDx: 14, micDy: 9, micAng: 1.1, fBend: 1, bHand: [-36, 8], bBend: -1, bKind: 'open', bSpread: 0.8, bRot: 0.1, eyes: 'closed', mouth: 'sing', brow: -0.4, headRot: 0.05, fx: ['notes'], look: [0.4, 0] };
    P.attack = { mic: 'hand', fHand: [46, -6], fBend: 1, micAng: 0.2, micGrip: 24, bHand: [-34, 20], bBend: -1, bKind: 'open', bRot: 0.2, lean: 0.05, torsoRot: 0.04, headRot: 0.05, headDx: 2, eyes: 'determined', mouth: 'sing', brow: 0.5, browY: -1, fFoot: [24, -12], bFoot: [-14, -12], fx: ['arcs', 'sparkleMic'] };
    P.hurt = { mic: 'hand', fHand: [8, 12], fBend: 1, micAng: 1.3, micGrip: 22, lean: -0.1, torsoRot: -0.06, headRot: -0.12, headDx: -3, bHand: [-34, -10], bBend: -1, bKind: 'open', bSpread: 1.3, eyes: 'hurt', mouth: 'ow', brow: -0.8, sweat: 1, blush: 0.5, fFoot: [12, -12], bFoot: [-18, -12], fx: ['stars'] };
    P.cheer = { mic: 'hand', fHand: [44, -34], fBend: 1, micAng: 1.45, micGrip: 22, bHand: [-44, -34], bBend: -1, bKind: 'open', bRot: 0.3, bSpread: 1.4, eyes: 'happy', mouth: 'happyOpen', brow: -0.2, headRot: 0.05, fFoot: [20, -12], bFoot: [-16, -12], fx: ['sparkles'] };
    P.windup = { mic: 'hand', fHand: [-12, 10], fBend: 1, micAng: 1.45, micGrip: 22, torsoDy: -2, lean: -0.04, headRot: -0.07, bHand: [-40, -16], bBend: -1, bKind: 'open', bSpread: 1.2, bRot: -0.5, eyes: 'closed', mouth: 'tiny', brow: -0.35, fFoot: [20, -12], bFoot: [-16, -12], fx: [] };
    P.strike = Object.assign({}, P.attack, { lean: 0.16, bx: 3, fFoot: [36, -12], fx: ['arcs', 'sparkleMic', 'petals'] });
    P.block = { mic: 'hand', fHand: [-36, 26], fBend: -1, micAng: -0.15, micGrip: 20, bHand: [44, 30], bBend: 1, bKind: 'fist', bRot: 0.2, bFront: 1, headRot: -0.09, torsoRot: -0.02, fFoot: [26, -12], bFoot: [-26, -12], eyes: 'determined', mouth: 'smirk', brow: 0.3, fx: ['rings'] };
    P.down = { mic: 'hand', fHand: [16, 46], fBend: 1, micAng: -1.35, micGrip: 18, by: 52, torsoDy: 4, torsoRot: 0.07, lean: 0.03, headRot: 0.24, headDy: 2, bHand: [-6, 50], bBend: -1, bKind: 'relaxed', bRot: 0.3, fFoot: [-12, -60], bFoot: [14, -60], fBow: 24, bBow: -22, fFootRot: -0.5, bFootRot: 0.4, eyes: 'closed', mouth: 'flat', brow: -0.25, blush: 0.6, fx: ['mute'] };
    P.walk = Object.assign({ mic: 'hand', fHand: [16, 36], fBend: -1, micAng: 1.3, micGrip: 22, bHand: [-34, 4], bBend: -1, bKind: 'point', bRot: 0.1, fx: [], headRot: 0.04, torsoRot: -0.02 }, { eyes: 'open', mouth, brow: 0.15 });
    P.bust = Object.assign({}, P.idle, { fHand: [12, 56], fBend: -1, micAng: 1.5, bHand: [-14, 56], bBend: 1, bKind: 'relaxed', bRot: 0.1, bSpread: 1 });
    if (!hasMic) {
      // no mic: the front hand is empty, an open hand where the mic would be
      for (const k in P) {
        const t = P[k];
        if (t.mic === 'mouth') { t.mic = 'none'; t.fHand = [32, -26]; t.fBend = 1; t.fKind = 'open'; t.fRot = 0.3; }
        else if (t.mic === 'hand') { t.mic = 'none'; t.fKind = t.fKind || (k === 'cheer' || k === 'attack' || k === 'wave' ? 'open' : 'relaxed'); if (k === 'hips') t.fKind = 'fist'; if (k === 'block') t.fKind = 'fist'; }
      }
    }
    return P;
  }

  // inverse-then-forward: draw something in the torso's rest space from the back layer (which is in head space)
  function inTorso(g, S, fn) {
    g.save();
    try { const hi = mat.inv(S.M.head), t = S.M.torso; g.transform(hi[0], hi[1], hi[2], hi[3], hi[4], hi[5]); g.transform(t[0], t[1], t[2], t[3], t[4], t[5]); fn(g, S); } finally { g.restore(); }
  }
  // stretch the garment layers for the build, torso length and leg length sliders
  function bodyFit(g, c, fn) {
    g.save();
    try { g.translate(0, -c.legLen); g.translate(0, -78); g.scale(1 + (c.build - 1) * 0.85, c.torsoLen); g.translate(0, 78); fn(g); } finally { g.restore(); }
  }

  function makeSpec(c) {
    const K = CC.resolve(c), O = CC.outfit(K), F = K.fg;
    const hairDef = CC.hairStyle(K), hat = CC.headwear(K) || { cover: 'none', front() {} };
    const covered = hat.cover === 'full' || hat.cover === 'part';
    const under = covered ? CC.hairUnderHat(K) : null;
    const neck = CC.neckwear(K), back = CC.backItem(K), W = CC.wristInfo(K), A = O.arm;
    const beard = FACE.facialHair(K);
    O.setNeck(neck);
    RJ.ACCENT.cc = { main: c.micC, dark: col.shade(c.micC, 0.2), light: col.tint(c.micC, 0.5), glow: col.tint(c.micC, 0.3) };

    const b = 1 + (c.build - 1) * 0.85, L = c.legLen, k = c.torsoLen, hipY = -78 - L;
    const skel = {
      hip: [0, hipY], hipF: [15 * (1 + (c.build - 1) * 0.4), -72 - L], hipB: [-15 * (1 + (c.build - 1) * 0.4), -72 - L],
      neck: [0, hipY - 68 * k], headC: [2, hipY - 68 * k - 58], shF: [26 * b, hipY - 53 * k], shB: [-26 * b, hipY - 53 * k],
    };
    const aw = 0.9 + 0.1 * c.build;
    // arms: a long sleeve colours the whole arm and ends in a cuff; a short one is a sleeve over a skin arm
    const arm = { l: [24 * c.armLen, 22 * c.armLen], w: [18 * aw, 14 * aw], skin: K.skin, skinSh: K.skinSh, hand: { skin: K.skin, shade: K.skinSh } };
    if (A.kind === 'long' && A.color) { arm.skin = A.color; arm.skinSh = col.shade(A.color); arm.cuff = { color: A.cuff || col.shade(A.color, -0.02), light: col.shade(A.cuff || A.color) }; arm.w = [20 * aw, 16 * aw]; }
    else if (A.kind === 'short') arm.sleeve = { color: A.sleeveColor, shade: col.shade(A.sleeveColor), len: A.len, w0: 25 * aw, w1: 28 * aw, hi: false, line: 1.5 };
    if (W.cuff && !arm.cuff) arm.cuff = { color: W.cuff.color, light: W.cuff.light };
    if (W.handSkin) { arm.hand = { skin: W.handSkin, shade: col.shade(W.handSkin) }; arm.noFold = true; }

    const legs = O.legs;
    const P = poses(K);
    const spec = {
      id: 'cc', accent: 'cc', skel, base: {}, poses: P, face: { mouth: [F.cx, F.mouthY, F.mouthW] },
      arm, legs, mic: { accent: c.micC, headR: 10.5, len: 44 * c.micLen, bands: 2 },
      life: { walk: { bob: 3, per: 0.5, head: 0.012, step: { hz: 2, stride: 10, lift: 6 } } },
      bounds: { x0: -150, x1: 120, h: 340 - L },
      bust: { rect: [-110, -330 - L, 110, -118 - L], face: [-76, -280 - L, 72, -140 - L], pose: 'bust' },
      tweak(Pn, t) { if (Pn.pose === 'wave') Pn.bRot = 0.2 + 0.4 * Math.sin(t * 7); },
      layers: {},
    };
    const Ls = spec.layers;

    Ls.backHair = (g, S) => {
      if (back) inTorso(g, S, (gg) => bodyFit(gg, c, (g3) => back(g3, S)));
      if (hat.back) hat.back(g, S);
      FACE.catEars(g, K);
      if (hairDef.back && !hat.hideHair && !(covered && hairDef.top)) hairDef.back(g, S);
    };
    Ls.mid = (g, S) => { if (hairDef.mid && !hat.hideHair) hairDef.mid(g, S); };
    Ls.torso = (g, S) => bodyFit(g, c, (gg) => O.torso(gg, S));
    Ls.head = (g, S) => {
      FACE.earFar(g, K);
      FACE.skin(g, S, K, hat.cover === 'full' ? under : hairDef, beard);
      const st = S.face;
      FACE.blush(g, st, K);
      FACE.marks(g, K);
      FACE.nose(g, K);
      FACE.eye(g, F.near, -1, st, K);
      FACE.eye(g, F.far, 1, st, K);
      FACE.brows(g, st, K);
      FACE.mouth(g, st, K);
      if (st.sweat > 0.3) RJ.fxSweat(g, 57, -12, 5);
      FACE.outline(g, K);
      const front = covered ? under : hairDef;
      if (hat.window) { g.save(); g.beginPath(); tk.trace(g, hat.window); g.clip(); front.front(g, S); g.restore(); }
      else front.front(g, S);
      FACE.earNear(g, K);
      FACE.earrings(g, K);
      if (!hat.hideHair && (!covered || hat.cover === 'part') && hairDef.over) hairDef.over(g, S);
      (hairDef.ties || []).forEach((t) => { if (!hat.hideHair && !(covered && hairDef.top)) CC.hairTie(g, K, { x: t.x * K.sw, y: t.y * K.sh, a: t.a, r: t.r }); });
      FACE.glasses(g, K);
      if (hat.front) hat.front(g, S);
    };
    Ls.over = (g, S) => { /* garment parts that lie over the arm: none yet */ };
    return spec;
  }

  // ---- public API ----
  // rigs are cached by value (a small LRU) and by object identity (the editor passes the same character object every frame)
  const cache = new Map(), byObj = new WeakMap();
  CC.rigFor = function (cfg) {
    let r = cfg && typeof cfg === 'object' ? byObj.get(cfg) : null;
    if (r) return r;
    const c = CC.clean(cfg), key = JSON.stringify(c);
    r = cache.get(key);
    if (!r) {
      const spec = makeSpec(c);
      r = { impl: RJ.rig(spec), spec, cfg: c };
      cache.set(key, r);
      if (cache.size > 60) cache.delete(cache.keys().next().value);
    }
    if (cfg && typeof cfg === 'object') byObj.set(cfg, r);
    return r;
  };
  CC.draw = function (ctx, cfg, o) {
    o = o || {};
    const r = CC.rigFor(cfg), s = (o.s || 1) * r.cfg.height;
    ctx.save();
    try { r.impl.draw(ctx, RJ.norm(Object.assign({}, o, { s, expr: o.expr === 'auto' ? undefined : o.expr }))); } catch (e) { if (window.console) console.error('CC.draw', e); } finally { ctx.restore(); }
  };
  CC.bust = function (ctx, cfg, w, h, o) {
    const r = CC.rigFor(cfg);
    ctx.save();
    try { r.impl.bust(ctx, w, h, Object.assign({}, o, { expr: o && o.expr === 'auto' ? undefined : o && o.expr })); } catch (e) { if (window.console) console.error('CC.bust', e); } finally { ctx.restore(); }
  };
  // a framed view for thumbnails and the portrait: anchor 'head' | 'chest' | 'feet', span = how many figure pixels tall the box shows
  CC.view = function (ctx, cfg, w, h, o) {
    o = o || {};
    const r = CC.rigFor(cfg), pose = o.pose || 'bust', t = o.t === undefined ? 1 : o.t, pts = r.impl.points({ pose, t, s: 1 }), a = pts[o.anchor || 'head'] || pts.head;
    const k = h / (o.span || 210) * (o.zoom || 1), ox = o.dx || 0, oy = o.dy === undefined ? 0 : o.dy;
    ctx.save();
    try {
      ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
      r.impl.draw(ctx, RJ.norm({ x: w / 2 - a[0] * k + ox * k, y: h * (o.at === undefined ? 0.5 : o.at) - a[1] * k + oy * k, s: k, pose, t, expr: o.expr === 'auto' ? undefined : o.expr, flip: o.flip, noShadow: true, noFx: true }));
    } catch (e) { if (window.console) console.error('CC.view', e); } finally { ctx.restore(); }
  };
  CC.pointsOf = function (cfg, o) { const r = CC.rigFor(cfg); return r.impl.points(RJ.norm(Object.assign({}, o, { s: ((o && o.s) || 1) * r.cfg.height }))); };
})();
