// Hocus Vocus: ART.rj, the chibi cast kit (the owners' approved RoxorLoops and Jasmin drawing kit, ported from tools/hocus_vocus/rj_art/kit.js).
// Loaded right after art.js (it builds on ART.tk) and before art_cast.js, which registers the figures and the ART.hero adapter. One IIFE, no
// global: everything hangs off ART.rj (called RJ inside the cast files). This header is the manual.
//
// ======================================================================================================================================
// QUICK START FOR A NEW CHARACTER (read the RoxorLoops and Jasmin blocks of art_cast.js, they are the worked examples)
// ======================================================================================================================================
//   RJ.register(id, RJ.rig({ id, accent, skel, base, poses, life, exprs, face, arm, legs, mic, layers, bust, bounds, tip, tweak }))
//   RJ.rig builds {draw, bust, bounds, points} for you: whole-body transform, ground shadow, pose maths with idle life, arms with two-bone IK,
//   the mic, legs and shoes, blinking, effects and the bust crop. You only draw what is unique: hair, head, torso and outfit, in LAYERS.
//
//   FIGURE SPACE (s = 1): feet centre at (0, 0), y negative is up, +x is the way the character faces (slight 3/4 view to the viewer's right;
//   o.flip mirrors the whole figure about x = 0). Whole figure about 262 px tall to the top of the skull (hair, a mohawk or a ponytail may
//   rise past that: spec.bounds is the box of the whole silhouette INCLUDING hair and the widest pose reach, not the effects, and it may be
//   lopsided with x0 and x1), head about 118 px tall.
//   STAGING A DUO: RoxorLoops on the party's left facing right (the default) and Jasmin on the right with o.flip = true, as on the owners' duo
//   card. The key light stays on the upper right of the screen for a flipped figure too (RJ.frame sets RJ._flip, RJ.cel, RJ.lock, RJ.blob and
//   the legs read RJ.lightAngle(), and a hand-written shadow offset in a character block goes through RJ.lx(dx)). Only fixed highlight
//   polygons (hair gloss bands) simply mirror with the figure.
//   A taller character overrides spec.skel (RoxorLoops raises neck, head, shoulders and leg tops by 12). Rest skeleton RJ.SKEL: waist and
//   torso pivot (0,-78), neck pivot (0,-146), head centre (2,-204), shoulders (+-26,-131), leg tops (+-15,-72), arm bones 23 + 21, ankles at
//   y = -12 (sneaker sole at y = 0).
//   Layers (spec.layers, every one optional, each is fn(g, S)), in draw order:
//     backHair  head space   drawn FIRST, behind the back arm and the torso (ponytails, long hair hanging behind)
//     torso     rest space   the torso rotates about the hip with the pose; neck, clothes, belt: draw in the rest skeleton coordinates
//     mid       head space   after the torso, before the head (a mullet tail that lies on the shoulders, a hood back)
//     head      head space   skull, face (call RJ.drawFace(g, S)), hair, hat. Origin = HEAD CENTRE, y up is negative, face turned +x
//     over      rest space   after the FRONT arm, in the torso's space (a dress strap that must cover the arm's shoulder joint)
//     top       head space   after the front arm (rarely needed: a hand-held thing in front of the face)
//     fx        fn(g, S, name) called for every effect name the pose lists, after the kit's own effect of that name
//   S (given to every layer): S.g, S.t, S.P (the resolved pose numbers), S.spec, S.C (RJ.C), S.A (the accent colours), S.face (eyes, mouth,
//   brow, blush, look, open (blink 0..1)), S.sway (a -1..1 slow wave for hair and cloth), S.beat (0..1 pulse on beat poses), S.pt (live
//   positions in figure space: mouth, micHead, hand, head, shF, shB, chest, feet, tip), S.M (the matrices: root, hips, torso, neck, head).
//   The face: spec.face = {eyes: [near, far] each {x, y, w, h}, brows, nose, mouth: [x, y, w], blush, eye: {...}} (see RJ.drawFace), head space.
//   Poses: spec.poses holds tables of the numbers in RJ.BASE_POSE (only the ones that differ) for the names in RJ.POSES plus 'bust' (the
//   portrait pose: keep hands low so no stray hand or mic ball shows at the crop's edge). A figure without a table for a pose falls back
//   (RJ.FALLBACK): windup to sing, strike to attack, block to idle, down to hurt, walk to idle. Anything a table does not set comes from
//   spec.base, then RJ.BASE_POSE. Idle life (breathing, sway, blink, the walk's steps) is added by RJ.resolve from RJ.LIFE (spec.life
//   overrides per pose). spec.tweak(P, t) may edit the resolved numbers over time (a hand lifting between slaps); it is optional, pure in t,
//   and a throwing tweak is swallowed. spec.tip(P, Lay) -> [x, y] names the striking point (default: the mic head).
//   Blends: o.mix = {pose, k} draws the pose blended toward a second pose (RJ.blend: numbers and number arrays lerp, strings, booleans and
//   the fx list switch at k = 0.5; a mic travelling between the hand and the mouth slides, a mic appearing from 'none' grows in the fist).
//   Portrait: spec.bust = {rect: [x0, y0, x1, y1] the preferred head-and-shoulders crop, face: [x0, y0, x1, y1] the rectangle that must stay
//   fully visible, pose}. For a box that is short or wide the zoom is reduced until the face fits and the crop is centred on it.
//
// ======================================================================================================================================
// THE HELPER API (everything hangs off RJ = ART.rj; all drawing helpers take the canvas context first and never throw for odd numbers)
// ======================================================================================================================================
//   Registry      RJ.register(id, impl) -> impl   RJ.draw(ctx, id, o)   RJ.bust(ctx, id, w, h, o)   RJ.point(id, name, o) -> {x,y} | null
//                 (names: head mouth hand mic micHead feet chest tip shF shB)   RJ.bake(id, o) -> {canvas, w, h, key, draw(ctx, x, y, s)} a
//                 frame cached in the ART.sprite LRU (keys 'rj|...', RJ.bakeKey(id, o) names it without baking)   RJ.norm(o) sanitises {x, y, s, pose, t, flip, expr, mix, noShadow, noFx}
//                 (s 0 stays a tiny 0.001 so a scale-in tween starts invisible; negative or NaN s is 1)   RJ.frame(ctx, o, fn)
//                 save, translate, scale, flip, then fn(ctx)   RJ.POSES   RJ.FALLBACK   RJ.BAKE_BOX {x0 -170, x1 150, y0 -345, y1 24}
//   Palette       RJ.C (ink, skin, skinSh, skinHi, blush, white, teeth, mouthIn, tongue, mic...)   RJ.ACCENT[id] = {main, dark, light, glow}
//                 for every cast id   RJ.accent(id)   RJ.LINE {main, mid, fine} outline widths   RJ.shade(hex, dl?) the warm cel shadow
//                 RJ.tint(hex, k?)
//   Cel and ink   RJ.cel(g, pts, base, opts) celFill with the house defaults (dark brown line, warm shadow)   RJ.ink(g, pts, opts) inkPath with
//                 house defaults   RJ.hatch(g, items, {color, w, alpha}) many short strokes as one path   RJ.fillPts(g, pts, col, alpha)   RJ.blob(g, items, {fill, shade, rot}) a union of capsules and ellipses with
//                 ONE outline (hands and small round things)   RJ.lock(g, spine, base, opts) tk.ribbon with hair defaults
//                 TIP for hair: a hand-shaped closed polygon with sharp corners ([x, y, 1]) plus ink lines inside gives crisper cartoon
//                 silhouettes than ribbons; ribbons are good for thin, flowing, tapering locks.
//   Face          RJ.drawFace(g, S)   RJ.eyeCel(g, e, side, st, E, preset) the flat cartoon eye   RJ.eye(...) picks it   RJ.brow(g, x, y, w, o)
//                 RJ.mouth(g, x, y, w, kind, o) kinds: smile smirk smirkTeeth sing grin happyOpen beat ow grit flat frown tiny   RJ.EXPR (named
//                 expressions)   RJ.blinkOpen(t, seed) -> 0..1   RJ.SKULL   RJ.skullPts({w, h, chin})   RJ.skinHead(g, o)   RJ.ear(g, x, y, o)
//                 RJ.neck(g, x, y, o)   RJ.fxSweat
//   Body          RJ.hand(g, kind, x, y, ang, o) kinds: fist point open relaxed   RJ.fistOnMic(g, x, y, axis, o)   RJ.mic(g, x, y, ang, o)
//                 RJ.drawArm(g, A) two-bone IK sausage arm with sleeve, cuff and hand   RJ.handParts(kind, o)   RJ.hurtEye   RJ.noseTick
//                 RJ.drawLeg(g, L) leg, sock and shoe   RJ.shoe(g, x, y, ang, o)   RJ.ik2(...) two-bone IK   RJ.sleeve(...) a sleeve polygon
//   Effects       RJ.fx.sweat notes arcs burst sparkles hearts stars rings petals wave mute, and RJ.fxDraw(g, S, name), which maps the names
//                 a pose lists in P.fx: notes arcs burst sparkles sparkleMic hearts stars sweat mute rings petals wave pad
//   Pose system   RJ.BASE_POSE (every key a pose table may set)   RJ.LIFE (idle motion per pose)   RJ.resolve(spec, pose, t, expr) -> P
//                 RJ.blend(Pa, Pb, k) -> P   RJ.layout(spec, P) -> matrices and live points   RJ.rig(spec) -> impl
//   Foes          RJ.foe: the shared foe kit for the enemy files (see the FOE KIT block at the end of this file)
//   House style: dark warm brown line (RJ.C.ink) of even width with a slight taper, flat cel colours with ONE hard shadow, a thin highlight,
//   large flat-cel eyes with catchlights, small blush marks. Everything is a pure function of its arguments (t seconds drives every loop, no
//   clock, no unseeded random call). Cost: about 1 ms of script per figure, the rest is canvas raster; bake with RJ.bake when a figure is
//   drawn many times without animating.
// ======================================================================================================================================
(function () {
  'use strict';
  const tk = ART.tk, mat = tk.mat;
  const RJ = (ART.rj = ART.rj || { chars: {}, ids: [] });
  const TAU = Math.PI * 2, PI = Math.PI;
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : (d === undefined ? 0 : d));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const fr = (v) => v - Math.floor(v);
  const has = (obj, k) => !!obj && typeof k === 'string' && Object.prototype.hasOwnProperty.call(obj, k);   // 'constructor' and '__proto__' are not poses or ids

  // ----------------------------------------------------------------------------------------------------------------------------------
  // palette and line weights
  // ----------------------------------------------------------------------------------------------------------------------------------
  const C = (RJ.C = {
    ink: '#2d170f',            // outline: warm near-black brown (the owners' cards use a brown line, never pure black)
    inkSoft: '#6b3a28',        // interior detail lines (eyelid creases, finger gaps)
    skin: '#fdd3b6', skinSh: '#f8b48e', skinHi: '#ffe9da', skinDeep: '#e59c7c',
    blush: '#ff8d98',
    white: '#fffaf1', teeth: '#fffdf6',
    mouthIn: '#9c2f45', tongue: '#ff8fa3',
    mic: '#1d1c22', micSh: '#0c0b0f', micHi: '#615f6d', micGrill: '#3a3942',
    gold: '#ffc94d', orange: '#ffb347',
  });
  // one entry per cast id; the outfits share their base id's accent
  RJ.ACCENT = {
    roxor: { main: '#78bd35', dark: '#3f7f18', light: '#d3edb0', glow: '#a9f060' },
    jasmin: { main: '#ff7fb2', dark: '#c93f78', light: '#ffc9de', glow: '#ffa6cc' },
    rawclaw: { main: '#8b4dff', dark: '#4a1fb5', light: '#d2bcff', glow: '#b78cff' },
    andy: { main: '#ff8a1f', dark: '#b5530a', light: '#ffd0a0', glow: '#ffb45e' },
    jordan: { main: '#2ec4b6', dark: '#0d4f4a', light: '#e6fffb', glow: '#6ff0e6' },
  };
  RJ.accent = (id) => RJ.ACCENT[id] || RJ.ACCENT.jasmin;
  const LINE = (RJ.LINE = { main: 2.0, mid: 1.6, fine: 1.15 });

  const hslM = new Map();
  function toHsl(hex) {
    let v = hslM.get(hex);
    if (v) return v;
    const c = U.color.rgb(hex), r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    v = [h, s, l];
    if (hslM.size > 600) hslM.clear();
    hslM.set(hex, v);
    return v;
  }
  // the warm cel shadow: a little darker, a little more saturated, hue nudged toward red (never the heavy indigo shade of ART.tk.shade)
  RJ.shade = (hex, dl) => { const v = toHsl(hex); return U.color.hsl(v[0] - 5, clamp(v[1] * 1.06, 0, 1), clamp(v[2] - (dl === undefined ? 0.13 : dl), 0, 1)); };
  RJ.tint = (hex, k) => U.color.mix(hex, '#ffffff', k === undefined ? 0.3 : k);

  // ----------------------------------------------------------------------------------------------------------------------------------
  // registry and dispatchers
  // ----------------------------------------------------------------------------------------------------------------------------------
  RJ.POSES = ['idle', 'sing', 'attack', 'hurt', 'cheer', 'windup', 'strike', 'block', 'down', 'walk'];
  // a figure without a table for one of the newer poses borrows the nearest older one
  RJ.FALLBACK = { windup: 'sing', strike: 'attack', block: 'idle', down: 'hurt', walk: 'idle' };
  RJ.register = function (id, impl) {
    if (typeof id !== 'string' || !id || !impl) return impl;
    RJ.chars[id] = impl;
    if (RJ.ids.indexOf(id) < 0) RJ.ids.push(id);
    return impl;
  };
  // sanitised draw options: nothing downstream ever sees NaN, a missing pose or a negative scale
  RJ.norm = function (o) {
    o = o || {};
    const s = num(o.s, 1);
    const mx = o.mix && typeof o.mix.pose === 'string' && num(o.mix.k) > 0 ? { pose: o.mix.pose, k: clamp(num(o.mix.k), 0, 1) } : undefined;
    return { x: num(o.x), y: num(o.y), s: s > 0 ? s : s === 0 ? 1e-3 : 1, pose: typeof o.pose === 'string' ? o.pose : 'idle', t: num(o.t), flip: !!o.flip, expr: typeof o.expr === 'string' ? o.expr : undefined,
      mix: mx, noShadow: !!o.noShadow, noFx: !!o.noFx };
  };
  // save, move to the feet centre, scale, mirror when flipped, call fn(ctx), restore (even when fn throws)
  // The key light stays on the upper right of the SCREEN for a flipped figure too: while a flipped figure is drawn RJ._flip is true, the shading helpers
  // (RJ.cel, RJ.lock, RJ.blob, the legs) read RJ.lightAngle(), and a hand-written light offset goes through RJ.lx(dx) (the x offset of a shadow shape is
  // negated, because the whole drawing is mirrored afterwards).
  RJ._flip = false;
  RJ.lx = (dx) => (RJ._flip ? -dx : dx);
  RJ.lightAngle = () => (RJ._flip ? -PI - tk.light : tk.light);
  RJ.frame = function (ctx, o, fn) {
    const n = RJ.norm(o), prev = RJ._flip;
    ctx.save(); RJ._flip = n.flip;
    try { ctx.translate(n.x, n.y); ctx.scale(n.s * (n.flip ? -1 : 1), n.s); fn(ctx, n); } finally { RJ._flip = prev; ctx.restore(); }
  };
  RJ.placeholder = function (ctx, id, o) {
    const n = RJ.norm(o);
    ART.placeholder(ctx, String(id), n.x - 40 * n.s, n.y - 200 * n.s, 80 * n.s, 200 * n.s, { color: '#8f5fe8' });
  };
  RJ.draw = function (ctx, id, o) {
    if (!ctx) return;
    const n = RJ.norm(o), impl = has(RJ.chars, id) ? RJ.chars[id] : null;
    ctx.save();
    try {
      if (impl && typeof impl.draw === 'function') impl.draw(ctx, n); else RJ.placeholder(ctx, id, n);
    } catch (e) { if (typeof console !== 'undefined') console.error('RJ.draw ' + id + ': ' + (e && e.stack || e)); }
    ctx.restore();
  };
  // portrait crop: fills the w x h box with the head and shoulders, no backdrop. o: {t, expr, pose}
  RJ.bust = function (ctx, id, w, h, o) {
    if (!ctx) return;
    w = num(w, 300); h = num(h, 400);
    if (!(w > 0 && h > 0)) return;
    const impl = has(RJ.chars, id) ? RJ.chars[id] : null;
    ctx.save();
    try {
      ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
      if (impl && typeof impl.bust === 'function') impl.bust(ctx, w, h, o || {});
      else ART.placeholder(ctx, String(id), 0, 0, w, h, { color: '#8f5fe8' });
    } catch (e) { if (typeof console !== 'undefined') console.error('RJ.bust ' + id + ': ' + (e && e.stack || e)); }
    ctx.restore();
  };
  // live stage position of a named point: 'head' 'mouth' 'hand' 'mic' 'feet' 'chest'. null for an unknown id or name.
  RJ.point = function (id, name, o) {
    const impl = has(RJ.chars, id) ? RJ.chars[id] : null;
    if (!impl || typeof impl.points !== 'function') return null;
    const p = impl.points(RJ.norm(o));
    return p && p[name] ? { x: p[name][0], y: p[name][1] } : null;
  };

  // Bake one frame of a figure for static uses (cards, lists, thumbnails, the map token): RJ.bake(id, {pose, t, expr, flip, s, mix, noFx,
  // noShadow, post}) returns {canvas, w, h, key, draw(ctx, x, y, s?)} where (x, y) is the feet centre. The frame is an ART.sprite (key 'rj|' + id +
  // '|' + pose + '|' + expr + '|' + flip + '|' + t + '|' + q, plus the blend and the options), so the global sprite LRU owns the memory. q is the
  // raster scale ceil(2 s) / 2 (0.5 to 3). o.post(g, w, h) runs on the finished frame (o.postKey must name it in the key). The box is RJ.BAKE_BOX.
  const BAKE_BOX = (RJ.BAKE_BOX = { x0: -170, x1: 150, y0: -345, y1: 24 });   // wide enough for the widest silhouette (a swung ponytail, the monster mane)
  // the sprite key RJ.bake uses for these options (so a caller can ask ART.sprite.has(key) before baking)
  RJ.bakeKey = function (id, o) {
    o = o || {};
    const n = RJ.norm(o), q = clamp(Math.ceil(n.s * 2) / 2, 0.5, 3);
    return ['rj', id, n.pose, n.expr || '', n.flip ? 1 : 0, n.t.toFixed(2), q, n.mix ? n.mix.pose + ':' + n.mix.k.toFixed(3) : '', (n.noFx ? 'x' : '') + (n.noShadow ? 's' : ''), typeof o.postKey === 'string' ? o.postKey : ''].join('|');
  };
  RJ.bake = function (id, o) {
    o = o || {};
    const n = RJ.norm(o), B = BAKE_BOX, q = clamp(Math.ceil(n.s * 2) / 2, 0.5, 3), w = B.x1 - B.x0, h = B.y1 - B.y0, ox = n.flip ? -B.x1 : B.x0;
    const key = RJ.bakeKey(id, o);
    const spr = ART.sprite(key, w * q, h * q, (g) => {
      g.scale(q, q);
      RJ.draw(g, id, { x: -ox, y: -B.y0, s: 1, pose: n.pose, t: n.t, expr: n.expr, flip: n.flip, mix: n.mix, noFx: n.noFx, noShadow: n.noShadow });
      if (typeof o.post === 'function') { g.save(); try { o.post(g, w, h); } finally { g.restore(); } }
    });
    return { canvas: spr, w, h, key, draw(ctx, x, y, s) { const k = s > 0 ? s : n.s; ART.blit(ctx, spr, num(x) + ox * k, num(y) + B.y0 * k, w * k, h * k); } };
  };

  // ----------------------------------------------------------------------------------------------------------------------------------
  // cel / ink wrappers
  // ----------------------------------------------------------------------------------------------------------------------------------
  // celFill with the house defaults. opts as tk.celFill; shadow defaults to the warm shade of base, line to LINE.main in the ink colour.
  RJ.cel = function (g, pts, base, o) {
    const opt = Object.assign({ line: LINE.main, lineColor: C.ink, wobble: 0.05, weightVar: 0.45, hi: false, hiW: 1.8, hiAlpha: 0.8, light: RJ.lightAngle() }, o);
    if (opt.shadow === undefined) opt.shadow = RJ.shade(base);
    if (opt.hi === true) opt.hi = RJ.tint(base, 0.4);
    tk.celFill(g, pts, base, opt);
  };
  RJ.ink = function (g, pts, o) { tk.inkPath(g, pts, Object.assign({ w: LINE.mid, color: C.ink, taper: 0.3, wobble: 0.04 }, o)); };
  // Many short hatch strokes (hair streaks, stubble ticks, fur and fold marks) as ONE round-capped path: items are [x0, y0, x1, y1] or point lists.
  // o: {color, w, alpha}. Far cheaper than one tapered ink stroke each, and at these widths it reads the same.
  RJ.hatch = function (g, items, o) {
    o = o || {};
    if (!g || !Array.isArray(items) || !items.length) return;
    g.save();
    g.strokeStyle = o.color || C.inkSoft; g.lineWidth = Math.max(0.3, num(o.w, 1.2)); g.lineCap = 'round'; g.lineJoin = 'round';
    if (o.alpha !== undefined) g.globalAlpha *= clamp(num(o.alpha, 1), 0, 1);
    g.beginPath();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it) continue;
      if (typeof it[0] === 'number') { g.moveTo(num(it[0]), num(it[1])); g.lineTo(num(it[2]), num(it[3])); }
      else for (let j = 0; j < it.length; j++) { const p = it[j]; if (j) g.lineTo(num(p[0]), num(p[1])); else g.moveTo(num(p[0]), num(p[1])); }
    }
    g.stroke();
    g.restore();
  };
  RJ.fillPts = function (g, pts, col, alpha) {
    g.save(); if (alpha !== undefined) g.globalAlpha *= clamp(alpha, 0, 1);
    g.beginPath(); tk.trace(g, pts); g.fillStyle = col; g.fill(); g.restore();
  };
  // a hair lock: tk.ribbon with the house hair look (warm shadow, soft highlight band, brown ink line). o as tk.ribbon.
  RJ.lock = function (g, spine, base, o) {
    o = o || {};
    tk.ribbon(g, spine, base, Object.assign({ light: RJ.lightAngle(), line: LINE.main, lineColor: C.ink, shadow: RJ.shade(base, 0.14), gloss: true, glossColor: RJ.tint(base, 0.38), glossAlpha: 0.7, strands: 1, seed: 3 }, o));
  };
  // A union of round shapes drawn with ONE outline, hand-painter style: an ink pass, a shade pass, then the skin shifted toward the light so
  // a thin shade crescent stays on the lower left and the line is thin on the lit side. items: {a:[x,y], b:[x,y], w} capsule, {e:[cx,cy,rx,ry,rot]}
  // ellipse. o: {fill, shade, ink, L (outline width), rot (rotation of the local frame, so the light shift stays upright), lit (1 = thin shade crescent, 2 to 3 = a wider shade band)}
  RJ.blob = function (g, items, o) {
    o = o || {};
    const fill = o.fill || C.skin, shade = o.shade || RJ.shade(fill), ink = o.ink || C.ink, L = o.L === undefined ? LINE.main : o.L;
    const rot = num(o.rot, 0), lit = o.lit > 0 ? o.lit : 1, lx = RJ.lx(0.5) * 0.95 * lit, ly = -0.87 * 0.95 * lit;   // key light from the upper right, in world space
    const c = Math.cos(-rot), s = Math.sin(-rot), dx = lx * c - ly * s, dy = lx * s + ly * c;
    const pass = (grow, col, ox, oy) => {
      g.save(); g.fillStyle = col; g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.a) { g.lineWidth = Math.max(0.4, it.w + grow); g.beginPath(); g.moveTo(it.a[0] + ox, it.a[1] + oy); g.lineTo(it.b[0] + ox, it.b[1] + oy); g.stroke(); }
        else if (it.e) { const e = it.e; g.beginPath(); g.ellipse(e[0] + ox, e[1] + oy, Math.max(0.3, e[2] + grow / 2), Math.max(0.3, e[3] + grow / 2), e[4] || 0, 0, TAU); g.fill(); }
      }
      g.restore();
    };
    pass(L * 1.7, ink, 0, 0);
    pass(0, shade, 0, 0);
    pass(-1.3 * lit, fill, dx, dy);
  };

  // ----------------------------------------------------------------------------------------------------------------------------------
  // hands and the mic
  // ----------------------------------------------------------------------------------------------------------------------------------
  // A hand at (x, y) = the wrist, fingers pointing along ang. kind: 'fist' (a plain fist), 'point' (index finger out, thumb up), 'open' (fingers fanned,
  // o.spread 0..1.5), 'relaxed' (open, fingers soft and close). o: {skin, shade, k (size multiplier)}
  // RJ.handParts(kind, o) -> {items, detail(g), k}: the same hand as blob items in the wrist's local frame (+x along the fingers) plus a fn drawing the finger
  // gap lines, so RJ.drawArm can fold a free hand into the arm's own blob (ONE outline from shoulder to fingertips, no wrist seam).
  RJ.handParts = function (kind, o) {
    o = o || {};
    const k = (o.k || 1) * (kind === 'point' ? 1.3 : 1);
    const gaps = [];
    let items;
    if (kind === 'point') {                                // one long index finger out, a short thumb up, three curled fingers stacked under the index
      items = [{ e: [5, 2, 7.4, 7.4] }, { a: [9, -1.6], b: [24, -2.6], w: 4.8 }, { a: [3.5, -4], b: [7, -11.2], w: 4.4 },
        { e: [11.6, 3.4, 3.4, 3.1, 0.1] }, { e: [10.8, 6.8, 3.3, 2.9, 0.15] }, { e: [9.2, 10, 3.1, 2.6, 0.2] }];
      gaps.push([[8.8, 5.2], [13.4, 5.4]], [[7.8, 8.5], [12.4, 8.9]]);
    } else if (kind === 'open' || kind === 'relaxed') {
      const sp = kind === 'relaxed' ? 0.42 : (o.spread === undefined ? 1 : o.spread), len = [8.5, 10.5, 10, 7.5];
      items = [{ e: [4, 0.5, 7, 7.2] }];
      const tips = [];
      for (let i = 0; i < 4; i++) {
        const th = (i - 1.5) * 0.3 * sp + (kind === 'relaxed' ? 0.28 : 0), by = (i - 1.5) * 3.5, bx = 8;
        const tx = bx + Math.cos(th) * len[i], ty = by + Math.sin(th) * len[i];
        items.push({ a: [bx, by], b: [tx, ty], w: 4.3 });
        tips.push([bx, by, tx, ty]);
      }
      items.push({ a: [2, -5], b: [9.5, -10 + (kind === 'relaxed' ? 3 : 0)], w: 4.6 });
      for (let i = 0; i < 3; i++) { const a = tips[i], b = tips[i + 1]; gaps.push([[(a[0] + b[0]) / 2 + 1, (a[1] + b[1]) / 2], [(a[2] + b[2]) / 2 - 1.5, (a[3] + b[3]) / 2]]); }
    } else {                                               // fist
      items = [{ e: [6.5, 0, 8, 7.4] }, { a: [3, 5.2], b: [11, 5.6], w: 4.6 }];
      gaps.push([[8.5, -5.4], [13.6, -3.4]], [[8.5, -2], [14.2, -0.6]], [[8.5, 1.6], [13.6, 2.4]]);
    }
    return { items, k, detail(g) { gaps.forEach((pts) => RJ.ink(g, pts, { w: LINE.fine * 0.85, color: C.inkSoft, taper: 0.5 })); } };
  };
  RJ.hand = function (g, kind, x, y, ang, o) {
    o = o || {};
    const P = RJ.handParts(kind, o), k = P.k, sk = o.skin || C.skin, sh = o.shade || C.skinSh, fy = Math.cos(ang) < 0 ? -1 : 1;   // pointing left: mirror so the thumb stays on top
    g.save(); g.translate(x, y); g.rotate(ang); g.scale(k, k * fy);
    RJ.blob(g, P.items, { fill: sk, shade: sh, rot: ang, L: LINE.main * 0.82 / Math.sqrt(k) });
    P.detail(g);
    g.restore();
  };
  // A fist wrapped around a mic shaft: (x, y) is the grip, axis the mic's axis angle (head toward tail). The thumb lies toward the head.
  RJ.fistOnMic = function (g, x, y, axis, o) {
    o = o || {};
    const k = o.k || 1;
    g.save(); g.translate(x, y); g.rotate(axis); g.scale(k, k);
    RJ.blob(g, [{ e: [0, 0.5, 8.6, 7.8] }, { a: [-4.6, -4.6], b: [-10, -5.8], w: 4.8 }], { fill: o.skin || C.skin, shade: o.shade || C.skinSh, rot: axis, L: LINE.main * 0.82 / Math.sqrt(k) });
    for (let i = -1; i <= 1; i++) RJ.ink(g, [[i * 3.6 + 0.4, -0.2], [i * 3.6 + 0.9, 3.2], [i * 3.6 + 0.2, 6.2]], { w: LINE.fine * 0.85, color: C.inkSoft, taper: 0.5 });
    g.restore();
  };
  // A handheld mic: (x, y) = centre of the ball head, the shaft runs toward ang. o: {accent (band colour), headR (8.5), len (40), bands (2), k}
  RJ.mic = function (g, x, y, ang, o) {
    o = o || {};
    const A = o.accent || '#78bd35', R = o.headR || 9.5, len = o.len || 42, bands = o.bands === undefined ? 2 : o.bands;
    g.save(); g.translate(x, y); g.rotate(ang); if (o.k) g.scale(o.k, o.k);
    const x0 = R * 0.55, x1 = R * 0.55 + len, w0 = R * 1.02, w1 = R * 0.8;
    const bandAt = (u, th) => {
      const xa = lerp(x0, x1, u), w = lerp(w0, w1, u);
      RJ.cel(g, [[xa - th / 2, -w / 2 - 0.6], [xa + th / 2, -w / 2 - 0.6], [xa + th / 2, w / 2 + 0.6], [xa - th / 2, w / 2 + 0.6]], A, { line: LINE.fine + 0.2, tension: 0, shadow: RJ.shade(A, 0.12) });
    };
    RJ.cel(g, [[x0, -w0 / 2], [x1 - 2, -w1 / 2], [x1 + 1.6, 0], [x1 - 2, w1 / 2], [x0, w0 / 2]], C.mic, { shadow: C.micSh, line: LINE.mid + 0.2, tension: 0.3, rim: C.micHi, rimW: 1.4, rimSide: 'light', rimAlpha: 0.9 });
    RJ.ink(g, [[x0 + 5, -w0 / 2 + 1.5], [x1 - 7, -w1 / 2 + 1.4]], { w: 1.1, color: C.micHi, taper: 0.4, wobble: 0 });
    if (bands > 0) bandAt(clamp((R + 1.8 - x0) / len, 0.05, 0.5), 3.6);          // the ring just under the ball, clear of the hand
    if (bands > 1) bandAt(0.84, 2.6);
    // ball head: dark with a grille hint and a glossy catch
    RJ.cel(g, tk.circlePts(0, 0, R, 14), C.mic, { shadow: C.micSh, line: LINE.mid + 0.2, rim: C.micHi, rimW: 1.4, rimSide: 'light', rimAlpha: 0.9 });
    g.save(); g.beginPath(); g.arc(0, 0, R - 1, 0, TAU); g.clip();
    g.strokeStyle = C.micGrill; g.lineWidth = 0.8; g.globalAlpha = 0.7;
    for (let i = -1; i <= 1; i++) { g.beginPath(); g.ellipse(0, 0, Math.max(0.5, R * 0.34 * Math.abs(i) + 0.3), R, 0, 0, TAU); g.stroke(); }
    g.restore();
    RJ.ink(g, [[-R * 0.58, -R * 0.12], [-R * 0.36, -R * 0.58], [R * 0.06, -R * 0.74]], { w: 1.9, color: '#9b99a8', taper: 0.5, wobble: 0 });
    g.beginPath(); g.arc(-R * 0.42, -R * 0.4, Math.max(0.9, R * 0.1), 0, TAU); g.fillStyle = '#c9c7d4'; g.fill();
    g.restore();
  };

  // ----------------------------------------------------------------------------------------------------------------------------------
  // arms and legs
  // ----------------------------------------------------------------------------------------------------------------------------------
  // two-bone IK: shoulder s, target t, bone lengths l1 l2, bend +1 or -1 (which way the elbow bows). Returns {e: elbow, w: wrist (clamped)}.
  RJ.ik2 = function (s, t, l1, l2, bend) {
    let dx = t[0] - s[0], dy = t[1] - s[1], d = Math.hypot(dx, dy);
    const maxD = l1 + l2 - 0.4, minD = Math.abs(l1 - l2) + 1;
    if (d < 1e-6) { dx = 0; dy = minD; d = minD; }
    if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; } else if (d < minD) { dx *= minD / d; dy *= minD / d; d = minD; }
    const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)), a1 = Math.atan2(dy, dx) + (bend < 0 ? -a : a);
    return { e: [s[0] + Math.cos(a1) * l1, s[1] + Math.sin(a1) * l1], w: [s[0] + dx, s[1] + dy] };
  };
  // a short sleeve (or any flared tube with a rounded shoulder end) from s along s->e: len 0..1 of the way, widths at the shoulder and at the cuff
  RJ.sleeve = function (s, e, len, w0, w1) {
    const dx = e[0] - s[0], dy = e[1] - s[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux;
    const px = s[0] + dx * len, py = s[1] + dy * len, h0 = w0 / 2, h1 = w1 / 2;
    return [[s[0] + nx * h0, s[1] + ny * h0], [s[0] + nx * h0 * 0.7 - ux * h0 * 0.7, s[1] + ny * h0 * 0.7 - uy * h0 * 0.7], [s[0] - ux * h0 * 1.02, s[1] - uy * h0 * 1.02],
      [s[0] - nx * h0 * 0.7 - ux * h0 * 0.7, s[1] - ny * h0 * 0.7 - uy * h0 * 0.7], [s[0] - nx * h0, s[1] - ny * h0],
      [px - nx * h1, py - ny * h1, 1], [px + nx * h1, py + ny * h1, 1]];
  };
  // A whole arm. A: {s: shoulder, t: hand target, bend, l: [upper, fore], w: [shoulder width, wrist width], skin, skinSh,
  //   sleeve: {color, len (0.9), w0, w1, shade} or null, parts: {kind, rot, o} a free hand folded into the arm's own outline (instead of hand), lit (shade band width),
  //   mid: fn(g, wrist, elbow) drawn after the arm and sleeve but before the hand (the mic),
  //   hand: fn(g, wrist, ang, elbow) draws the hand}. Returns {e, w, ang}.
  RJ.drawArm = function (g, A) {
    const l = A.l || [23, 21], w = A.w || [15, 11], r = RJ.ik2(A.s, A.t, l[0], l[1], A.bend || 1);
    const skin = A.skin || C.skin, sh = A.skinSh || C.skinSh;
    // The limb is a chain of overlapping round capsules drawn as ONE blob (one ink outline, a hard shade band on the lower left): the elbow is always
    // rounded and the outline cannot fold over itself at a sharp bend the way an offset ribbon does. The width eases from the shoulder to the wrist.
    const items = [], wAt = (u) => w[0] + (w[1] - w[0]) * u + 1.2 * Math.sin(PI * u);
    const chain = (p, q, u0, u1) => {
      const n = Math.max(2, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 4));
      for (let i = 0; i < n; i++) {
        const f0 = i / n, f1 = (i + 1) / n;
        items.push({ a: [lerp(p[0], q[0], f0), lerp(p[1], q[1], f0)], b: [lerp(p[0], q[0], f1), lerp(p[1], q[1], f1)], w: wAt(lerp(u0, u1, (f0 + f1) / 2)) });
      }
    };
    chain(A.s, r.e, 0, 0.5); chain(r.e, r.w, 0.5, 1);
    // A.parts = {kind, ang offset, o} folds a free hand into the same blob (one outline from shoulder to fingertips, no bracelet-like seam at the wrist)
    let hp = null, hang = 0;
    if (A.parts && !A.mid) {
      hp = RJ.handParts(A.parts.kind, A.parts.o);
      hang = Math.atan2(r.w[1] - r.e[1], r.w[0] - r.e[0]) + num(A.parts.rot);
      const ca = Math.cos(hang), sa = Math.sin(hang), k = hp.k, fy = ca < 0 ? -1 : 1;                // a hand pointing left is mirrored so the thumb stays on top
      const tf = (p) => [r.w[0] + (p[0] * ca - p[1] * fy * sa) * k, r.w[1] + (p[0] * sa + p[1] * fy * ca) * k];
      hp.items.forEach((it) => { if (it.e) { const c = tf(it.e); items.push({ e: [c[0], c[1], it.e[2] * k, it.e[3] * k, fy * (it.e[4] || 0) + hang] }); } else items.push({ a: tf(it.a), b: tf(it.b), w: it.w * k }); });
    }
    RJ.blob(g, items, { fill: skin, shade: sh, L: LINE.main * 0.95, lit: A.lit || 2.4 });
    if (hp) { g.save(); g.translate(r.w[0], r.w[1]); g.rotate(hang); g.scale(hp.k, hp.k * (Math.cos(hang) < 0 ? -1 : 1)); hp.detail(g); g.restore(); }
    if (A.sleeve) {
      const sl = A.sleeve, poly = RJ.sleeve(A.s, r.e, sl.len === undefined ? 0.88 : sl.len, sl.w0 || 20, sl.w1 || 23);
      RJ.cel(g, poly, sl.color, { shadow: sl.shade || RJ.shade(sl.color), hi: sl.hi || false, line: sl.line || LINE.main, depth: 5, decor: sl.decor });
    }
    const ang = Math.atan2(r.w[1] - r.e[1], r.w[0] - r.e[0]);
    if (A.cuff) {                                          // a ribbed cuff band across the wrist (onesies, jackets)
      const cu = A.cuff, ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux, hw = (w[1] + 4) / 2, cx = r.w[0] - ux * 5, cy = r.w[1] - uy * 5;
      RJ.cel(g, [[cx - nx * hw - ux * 4, cy - ny * hw - uy * 4], [cx + nx * hw - ux * 4, cy + ny * hw - uy * 4], [cx + nx * hw + ux * 5, cy + ny * hw + uy * 5], [cx - nx * hw + ux * 5, cy - ny * hw + uy * 5]], cu.color, { shadow: cu.light || RJ.shade(cu.color), line: LINE.main, tension: 0.35, depth: 3 });
      RJ.ink(g, [[cx - nx * hw * 0.8, cy - ny * hw * 0.8], [cx + nx * hw * 0.8, cy + ny * hw * 0.8]], { w: 1, color: cu.light || RJ.shade(cu.color), taper: 0.2, wobble: 0 });
    }
    if (A.mid) A.mid(g, r.w, r.e);
    if (A.hand && !hp) A.hand(g, r.w, ang, r.e);
    return { e: r.e, w: r.w, ang };
  };
  // A sneaker with the ankle at (x, y) and the toe toward +x (rotated by ang). o: {color, sole, accent, toeCap, heel, shade, k, paw (a round furry foot with
  // toe lines instead of a sneaker)}
  RJ.shoe = function (g, x, y, ang, o) {
    o = o || {};
    const col = o.color || '#e0f07a', sole = o.sole || RJ.tint(col, 0.55), shd = o.shade || RJ.shade(col, 0.15);
    g.save(); g.translate(x, y); g.rotate(ang || 0); if (o.k) g.scale(o.k, o.k);
    const pts = o.paw ? [[-11, -5], [-13.5, 4], [-11, 12.2, 1], [22, 12.2, 1], [28, 7], [25, -1], [14, -4], [2, -8]] : [[-10, -5], [-11.5, 3, 0], [-9.5, 12.2, 1], [21, 12.2, 1], [25.5, 8], [24, 3], [15, -0.5], [7, -4], [-1, -7.5]];
    RJ.cel(g, pts, col, { shadow: shd, line: LINE.main, depth: 5, hi: o.hi === undefined ? RJ.tint(col, 0.35) : o.hi, hiW: 1.6, decor: (gg) => {
      if (o.paw) { [[14, 2], [19, 3], [23, 4]].forEach((t) => RJ.ink(gg, [[t[0], t[1]], [t[0] + 1.5, t[1] + 9]], { w: 1.3, color: o.pawLine || C.inkSoft, taper: 0.5, wobble: 0 })); return; }
      gg.beginPath(); gg.rect(-14, 8.2, 44, 8); gg.fillStyle = sole; gg.fill();                   // the sole
      RJ.ink(gg, [[-14, 8.2], [30, 8.2]], { w: 1.2, color: C.inkSoft, taper: 0, wobble: 0 });
      if (o.toeCap) { gg.beginPath(); gg.moveTo(15, -4); gg.quadraticCurveTo(21, 2, 18, 9); gg.lineTo(30, 9); gg.lineTo(30, -4); gg.closePath(); gg.fillStyle = o.toeCap; gg.fill(); RJ.ink(gg, [[15, -3], [19.5, 3], [17.5, 8.5]], { w: 1.2, color: C.inkSoft, taper: 0.3, wobble: 0 }); }
      if (o.heel) { gg.beginPath(); gg.rect(-14, -2, 7, 11); gg.fillStyle = o.heel; gg.fill(); }
      if (o.accent) { gg.beginPath(); gg.moveTo(-14, 5.2); gg.lineTo(30, 5.2); gg.lineTo(30, 7.2); gg.lineTo(-14, 7.2); gg.closePath(); gg.fillStyle = o.accent; gg.fill(); }
    } });
    if (!o.paw) {
      RJ.ink(g, [[0.5, -3.6], [4.6, -0.4]], { w: 1.1, color: C.inkSoft, taper: 0.5, wobble: 0 });                     // lace ticks
      RJ.ink(g, [[3.4, -5.6], [7.2, -2.2]], { w: 1.1, color: C.inkSoft, taper: 0.5, wobble: 0 });
    }
    g.restore();
  };
  // A leg from the hip to the ankle plus its shoe. L: {hip, ankle, w: [hip width, ankle width], color (pants) or skin, shade, bow (knee bow px, +x forward),
  //   sock: {color, len (px up from the ankle), shade}, shoe: opts of RJ.shoe, rot (toe angle), pantsHem (draw the pants over the shoe), cuff: color}
  RJ.drawLeg = function (g, L) {
    const hip = L.hip, an = L.ankle, w = L.w || [18, 14], bow = L.bow === undefined ? 2 : L.bow;
    const mid = [(hip[0] + an[0]) / 2 + bow, (hip[1] + an[1]) / 2];
    const col = L.color || C.skin, shd = L.shade || (L.color ? RJ.shade(L.color) : C.skinSh);
    const prof = L.profile || ((u) => 1 - (1 - w[1] / w[0]) * u);
    const limb = () => tk.ribbon(g, [hip, mid, an], col, { light: RJ.lightAngle(), wMax: w[0], w0: w[0], w1: w[1], profile: prof, cap: 'flat', gloss: false, strands: 0, shadow: shd, shadowW: 0.36, line: LINE.main, lineColor: C.ink, wobble: 0.05, weightVar: 0.45 });
    if (L.pantsOver) { RJ.shoe(g, an[0], an[1], L.rot || 0, L.shoe); limb(); if (L.decor) L.decor(g, hip, an, mid); }
    else {
      limb();
      if (L.decor) L.decor(g, hip, an, mid);
      if (L.sock) {
        const sl = L.sock.len || 18, u = clamp(1 - sl / Math.max(1, Math.hypot(hip[0] - an[0], hip[1] - an[1])), 0, 0.98);
        const a = [lerp(hip[0], an[0], u) + (mid[0] - lerp(hip[0], an[0], 0.5)) * 0.3, lerp(hip[1], an[1], u)];
        tk.ribbon(g, [a, [(a[0] + an[0]) / 2, (a[1] + an[1]) / 2 + 1], [an[0], an[1] + 2]], L.sock.color, { light: RJ.lightAngle(), wMax: w[1] + 2.6, w0: w[1] + 2.6, w1: w[1] + 2.4, profile: () => 1, cap: 'flat', gloss: false, strands: 0, shadow: L.sock.shade || RJ.shade(L.sock.color, 0.1), line: LINE.main, lineColor: C.ink });
      }
      RJ.shoe(g, an[0], an[1], L.rot || 0, L.shoe);
    }
  };

  // ----------------------------------------------------------------------------------------------------------------------------------
  // head parts: skull, ear, neck
  // ----------------------------------------------------------------------------------------------------------------------------------
  // The default chibi skull in head space (origin = head centre, face turned +x): 14 control points, closed Catmull-Rom. About 118 wide, 118 tall.
  RJ.SKULL = [[-2, -58], [30, -53], [52, -34], [60, -4], [56, 24], [40, 46], [22, 57], [4, 60], [-16, 56], [-36, 44], [-54, 24], [-62, -3], [-58, -33], [-40, -52]];
  // a scaled copy: o.w, o.h multipliers (1 = default), o.chin pulls the chin point (px, + = longer)
  RJ.skullPts = function (o) {
    o = o || {};
    const sx = o.w || 1, sy = o.h || 1, chin = num(o.chin);
    return RJ.SKULL.map((p) => [p[0] * sx, p[1] * sy + (p[1] > 40 ? chin * ((p[1] - 40) / 20) : 0)]);
  };
  // plain skin skull cel (hair is drawn over it by the character). o: {pts, skin, shade, line}
  RJ.skinHead = function (g, o) {
    o = o || {};
    RJ.cel(g, o.pts || RJ.SKULL, o.skin || C.skin, { shadow: o.shade || C.skinSh, line: o.line || LINE.main + 0.2, depth: 9, hi: o.hi === undefined ? C.skinHi : o.hi, hiW: 2 });
  };
  // an ear at (x, y), radius about r, on the -x side by default (o.side = 1 puts it on +x)
  RJ.ear = function (g, x, y, o) {
    o = o || {};
    const r = o.r || 13, sd = o.side === 1 ? 1 : -1, sk = o.skin || C.skin, sh = o.shade || C.skinSh;
    // a round-topped ear: the rim bulges away from the head (toward sd), the lobe is soft
    const pts = [[r * 0.45 * sd, -r * 0.92], [r * 0.2 * sd, -r * 1.08], [r * 0.82 * sd, -r * 0.82], [r * 1.0 * sd, -r * 0.2], [r * 0.82 * sd, r * 0.52], [r * 0.34 * sd, r * 0.98], [-r * 0.1 * sd, r * 0.86], [-r * 0.3 * sd, r * 0.2], [-r * 0.2 * sd, -r * 0.6]];
    pts.splice(1, 1);
    g.save(); g.translate(x, y);
    RJ.cel(g, pts, sk, { shadow: sh, line: LINE.main, depth: 3, hi: false });
    RJ.ink(g, [[r * 0.62 * sd, -r * 0.42], [r * 0.7 * sd, r * 0.1], [r * 0.42 * sd, r * 0.52]], { w: LINE.fine, color: C.inkSoft, taper: 0.4 });
    RJ.ink(g, [[r * 0.3 * sd, -r * 0.5], [r * 0.12 * sd, -r * 0.05], [r * 0.22 * sd, r * 0.28]], { w: LINE.fine * 0.85, color: C.inkSoft, taper: 0.5 });
    g.restore();
  };
  // a neck block in rest space, centred at x with its top at y. o: {skin, shade, w, h}
  RJ.neck = function (g, x, y, o) {
    o = o || {};
    const w = o.w || 24, h = o.h || 16;
    RJ.cel(g, [[x - w / 2, y], [x + w / 2, y], [x + w / 2 + 2, y + h], [x - w / 2 - 2, y + h]], o.skin || C.skin, { shadow: o.shade || C.skinSh, line: LINE.main, tension: 0.2, shadowShape: { poly: [[x - w, y - 2], [x + w, y - 2], [x + w, y + h * 0.55], [x - w, y + h * 0.55]] } });
  };

  // ----------------------------------------------------------------------------------------------------------------------------------
  // the face
  // ----------------------------------------------------------------------------------------------------------------------------------
  // named expressions: partial face states (RJ.resolve applies one when o.expr names it, over the pose's own face)
  RJ.EXPR = {
    neutral: { eyes: 'open', mouth: 'smile', brow: 0 },
    happy: { eyes: 'happy', mouth: 'happyOpen', brow: -0.1 },
    smirk: { eyes: 'open', mouth: 'smirkTeeth', brow: 0.35 },
    sing: { eyes: 'half', mouth: 'sing', brow: -0.1 },
    hurt: { eyes: 'hurt', mouth: 'ow', brow: -0.6, sweat: 1 },
    angry: { eyes: 'angry', mouth: 'ow', brow: 1 },
    wow: { eyes: 'wide', mouth: 'sing', brow: -0.4, browY: -3 },
    shy: { eyes: 'open', mouth: 'smile', brow: -0.4, blush: 1.6 },
    sleepy: { eyes: 'sleepy', mouth: 'flat', brow: -0.2 },
  };
  // blink: 1 = open, dips to 0 and back over 0.16 s about every 4 to 5.5 s. A pure function of t and a per-character seed.
  RJ.blinkOpen = function (t, seed) {
    const per = 3.7 + 1.8 * tk.vary(seed, 'bp'), ph = ((num(t) + tk.vary(seed, 'bo') * per) % per + per) % per;
    return ph < 0.16 ? Math.abs(ph / 0.08 - 1) : 1;
  };

  // Mouths. (x, y) = centre of the mouth line, w its width. kind: smile smirk smirkTeeth sing grin happyOpen beat ow flat frown tiny. Unknown = smile.
  // o: {ink, lineW, inner, tongue, teeth (bool: show teeth in open mouths), puff}
  RJ.mouth = function (g, x, y, w, kind, o) {
    o = o || {};
    w = w > 0 ? w : 14;
    const ink = o.ink || C.ink, lw = o.lineW || Math.max(1.3, w * 0.115), inner = o.inner || C.mouthIn, tongue = o.tongue || C.tongue;
    const line = (pts, ww, seed) => tk.inkPath(g, pts, { w: ww || lw, color: ink, taper: 0.42, wobble: 0.04, seed: seed | 0 });
    const closedShape = (pts, opt) => {
      opt = opt || {};
      g.save();
      g.beginPath(); tk.trace(g, pts); g.fillStyle = opt.inner || inner; g.fill(); g.clip();
      if (opt.tongue !== false) { g.beginPath(); g.ellipse(x + (opt.tx || 0), y + w * (opt.ty === undefined ? 0.36 : opt.ty), w * (opt.trx || 0.3), w * (opt.try || 0.16), 0, 0, TAU); g.fillStyle = tongue; g.fill(); }
      if (opt.teeth) {
        const th = w * opt.teeth;
        g.beginPath(); g.rect(x - w, y - w * 0.3, w * 2, th + w * 0.3); g.fillStyle = C.teeth; g.fill();
        g.strokeStyle = 'rgba(120,70,60,0.5)'; g.lineWidth = 0.8;
        for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(x + i * w * 0.14 + (opt.tx || 0), y - w * 0.1); g.lineTo(x + i * w * 0.14 + (opt.tx || 0), y + th * 0.9); g.stroke(); }
        g.beginPath(); g.moveTo(x - w, y + th); g.lineTo(x + w, y + th); g.strokeStyle = 'rgba(120,70,60,0.35)'; g.stroke();
      }
      g.restore();
      tk.inkPath(g, pts, { closed: true, w: lw * 1.2, color: ink, align: 0, wobble: 0.02 });
    };
    if (kind === 'smirk') {
      line([[x - w / 2, y + w * 0.06], [x - w * 0.1, y + w * 0.14], [x + w * 0.3, y + w * 0.04], [x + w / 2, y - w * 0.17]]);
      line([[x + w * 0.5, y - w * 0.14], [x + w * 0.6, y - w * 0.26]], lw * 0.9, 2);
    } else if (kind === 'smirkTeeth') {
      closedShape([[x - w * 0.5, y + w * 0.02], [x - w * 0.1, y - w * 0.03], [x + w * 0.3, y - w * 0.1], [x + w * 0.54, y - w * 0.24], [x + w * 0.44, y + w * 0.08], [x + w * 0.14, y + w * 0.3], [x - w * 0.22, y + w * 0.24]], { teeth: 0.3, ty: 0.34, trx: 0.2, try: 0.1, tx: 0.08 * w });
      line([[x + w * 0.54, y - w * 0.22], [x + w * 0.64, y - w * 0.32]], lw * 0.9, 2);
    } else if (kind === 'sing') {
      closedShape(tk.ellipsePts(x, y + w * 0.16, w * 0.3, w * 0.4, 12), { ty: 0.42, trx: 0.2, try: 0.14, teeth: o.teeth ? 0.12 : 0 });
    } else if (kind === 'grin') {
      closedShape([[x - w * 0.52, y - w * 0.08], [x - w * 0.2, y - w * 0.02], [x + w * 0.2, y - w * 0.02], [x + w * 0.52, y - w * 0.1], [x + w * 0.38, y + w * 0.32], [x, y + w * 0.5], [x - w * 0.38, y + w * 0.32]], { teeth: 0.19, ty: 0.38, try: 0.15 });
    } else if (kind === 'happyOpen') {
      closedShape([[x - w * 0.5, y - w * 0.04], [x - w * 0.2, y + w * 0.01], [x + w * 0.2, y + w * 0.01], [x + w * 0.5, y - w * 0.06], [x + w * 0.36, y + w * 0.3], [x, y + w * 0.46], [x - w * 0.36, y + w * 0.3]], { ty: 0.34, trx: 0.28, try: 0.15 });
    } else if (kind === 'beat') {
      // a beatbox mouth: a wide D (flat top lip, round bottom) with a strip of upper teeth and a dark interior; the mic usually covers its right half
      closedShape([[x - w * 0.47, y - w * 0.05, 1], [x - w * 0.1, y - w * 0.09], [x + w * 0.28, y - w * 0.1], [x + w * 0.48, y - w * 0.06, 1], [x + w * 0.4, y + w * 0.22], [x + w * 0.12, y + w * 0.42], [x - w * 0.2, y + w * 0.4], [x - w * 0.42, y + w * 0.2]],
        { teeth: 0.2, inner: o.innerBeat || '#6f2036', ty: 0.36, trx: 0.2, try: 0.09 });
      if (o.puff) { g.save(); g.globalAlpha *= 0.55; [-1, 1].forEach((sd) => line([[x + sd * w * 0.64, y - w * 0.04], [x + sd * w * 0.78, y + w * 0.1], [x + sd * w * 0.78, y + w * 0.22], [x + sd * w * 0.64, y + w * 0.36]], lw * 0.5, 3)); g.restore(); }
    } else if (kind === 'ow') {
      // a yelp: a rounded open mouth with a dark interior, a white strip of upper teeth and a little tongue
      closedShape([[x - w * 0.44, y + w * 0.02, 1], [x - w * 0.14, y - w * 0.05], [x + w * 0.16, y - w * 0.05], [x + w * 0.44, y + w * 0.01, 1], [x + w * 0.38, y + w * 0.26], [x + w * 0.1, y + w * 0.44], [x - w * 0.16, y + w * 0.44], [x - w * 0.4, y + w * 0.26]],
        { teeth: 0.15, ty: 0.4, trx: 0.22, try: 0.12 });
    } else if (kind === 'grit') {                          // gritted teeth: a white bow-tie with tooth lines
      const sh = [[x - w * 0.5, y + w * 0.12], [x - w * 0.3, y - w * 0.04], [x, y + w * 0.06], [x + w * 0.3, y - w * 0.04], [x + w * 0.5, y + w * 0.12], [x + w * 0.3, y + w * 0.3], [x, y + w * 0.22], [x - w * 0.3, y + w * 0.3]];
      g.save(); g.beginPath(); tk.trace(g, sh, 0, 0, 0.5); g.fillStyle = C.teeth; g.fill(); g.restore();
      tk.inkPath(g, sh, { closed: true, w: lw * 1.2, color: ink, align: 0, tension: 0.5 });
      line([[x - w * 0.1, y + w * 0.04], [x - w * 0.1, y + w * 0.24]], lw * 0.6, 4); line([[x + w * 0.12, y + w * 0.04], [x + w * 0.12, y + w * 0.24]], lw * 0.6, 5);
    } else if (kind === 'flat') line([[x - w / 2, y], [x, y + w * 0.04], [x + w / 2, y - w * 0.02]]);
    else if (kind === 'frown') line([[x - w / 2, y + w * 0.1], [x - w * 0.2, y - w * 0.02], [x + w * 0.2, y - w * 0.02], [x + w / 2, y + w * 0.1]]);
    else if (kind === 'tiny') closedShape(tk.ellipsePts(x, y + w * 0.05, w * 0.13, w * 0.12, 8), { tongue: false });
    else {
      line([[x - w / 2, y - w * 0.02], [x - w * 0.22, y + w * 0.14], [x + w * 0.2, y + w * 0.14], [x + w / 2, y - w * 0.08]]);
      line([[x + w * 0.5, y - w * 0.06], [x + w * 0.58, y - w * 0.16]], lw * 0.9, 2);
    }
  };
  // a drop of sweat (a teardrop with a catchlight)
  RJ.fxSweat = function (g, x, y, r) {
    r = r || 5;
    RJ.cel(g, [[x, y - r * 1.5, 1], [x + r * 0.85, y + r * 0.1], [x, y + r * 0.95], [x - r * 0.85, y + r * 0.1]], '#9fdcff', { shadow: '#6bb4ee', line: LINE.mid, depth: r * 0.4 });
    RJ.ink(g, [[x - r * 0.4, y - r * 0.1], [x - r * 0.35, y + r * 0.4]], { w: 1.2, color: '#ffffff', taper: 0.5, wobble: 0 });
  };

  // Eyebrow: a thick brush stroke, fullest around the middle, with a slight arch. side -1 = near (left) brow. tilt > 0 lowers the inner end (cocky,
  // angry), < 0 raises it (worried). o: {thick, arch, color, alpha}
  RJ.brow = function (g, x, y, w, o) {
    o = o || {};
    const side = o.side === 1 ? 1 : -1, tilt = num(o.tilt), arch = num(o.arch, 0.3), th = o.thick || Math.max(2, w * 0.14);
    const ang = -tilt * 0.55, c = Math.cos(ang), s = Math.sin(ang);
    const raw = [[-w / 2, 0], [-w * 0.2, -arch * w * 0.13], [w * 0.15, -arch * w * 0.16], [w / 2, w * 0.04]];
    const pts = raw.map((p) => [x + side * (p[0] * c - p[1] * s), y + (p[0] * s + p[1] * c)]);
    tk.inkPath(g, pts, { w: th, color: o.color || C.ink, pressure: (u) => 0.28 + 0.72 * Math.pow(Math.sin(PI * clamp(u * 0.85 + 0.06, 0, 1)), 0.9), taperStart: 0.04, taperEnd: 0.12, wobble: 0.03, seed: o.seed | 0, alpha: o.alpha, weightVar: 0 });
  };
  // Eye presets for the cel eye (inner corner drop, lid drop, size): same idea as ART.tk.eyePresets.
  const CEL_EYE = { open: {}, neutral: {}, half: { drop: 0.38 }, sleepy: { drop: 0.5, tilt: -0.12 }, wide: { wide: 1.12 }, determined: { tilt: 0.3, drop: 0.14 }, angry: { tilt: 0.6, drop: 0.2 }, sad: { tilt: -0.5, drop: 0.1 }, smirk: { tilt: 0.22, drop: 0.3 } };
  // The cartoon cel eye of the owners' cards: a round almond of sclera with visible white, a FLAT iris (dark top, lighter lens below with a hard edge, thin dark
  // ring), a big round catchlight and a small one, a thick tapered upper lid with an outer flick, an optional crease and lashes. (x, y) = eye centre in head
  // space, w and h the eye size, side -1 = near (left) eye, outer corner at -x. E: {iris: [top, bottom], ring, sclera, ink, irisW (0.72 of half width), irisH
  // (0.92 of half height), hl: [[dx, dy, r], ...] catchlights in iris radii, lid (line weight), wing 0..1, crease (bool), lashes (0..3), tilt, drop, lowerLine,
  // onEye(g, e, side, st, geom) called with the iris geometry in head space}
  RJ.eyeCel = function (g, e, side, st, E, preset) {
    const w = e.w, h = e.h, pr = CEL_EYE[preset] || CEL_EYE.open;
    const wide = pr.wide || 1, a = w / 2 * wide, b = h / 2 * wide;
    const open = clamp(num(st.open, 1), 0, 1);
    const tilt = pr.tilt !== undefined ? pr.tilt : num(E.tilt), drop = pr.drop !== undefined ? pr.drop : num(E.drop);
    const ink = E.ink || C.ink, lw = E.lid || Math.max(1.4, w * 0.075);
    const yb = (x) => 0.1 * b + 0.9 * b * (1 - (x / a) * (x / a));
    const topPts = [[-a * 0.62, -b * 0.8], [-a * 0.12, -b * 1.0], [a * 0.5, -b * 0.92]];
    const cutY = -b + 2 * b * drop;
    const top = topPts.map((p) => {
      let y = Math.max(p[1], cutY);
      y += tilt * b * 0.5 * (-p[0] / a);
      y = lerp(yb(p[0]), y, open);
      return [p[0], Math.min(y, yb(p[0]) - 0.05 * b)];
    });
    const I = [-a, b * 0.12, 1], O = [a * 1.02, -b * 0.05 - tilt * b * 0.1, 1];
    const shape = [I, top[0], top[1], top[2], O, [a * 0.58, b * 0.68], [0, b * 0.98], [-a * 0.6, b * 0.8]];
    const look = st.look || [0, 0];
    const rx = a * (E.irisW || 0.72), ry = b * (E.irisH || 0.92), icx = num(look[0]) * a * 0.22, icy = b * 0.06 + num(look[1]) * b * 0.16;
    const iris = E.iris || ['#3a2210', '#704520'];
    g.save();
    g.translate(e.x, e.y); if (side < 0) g.scale(-1, 1);
    g.save();
    g.beginPath(); tk.trace(g, shape); g.clip();
    g.fillStyle = E.sclera || '#fffdfa'; g.fillRect(-a * 1.3, -b * 1.3, a * 2.6, b * 2.6);
    // the lid's soft shade across the top of the white
    g.fillStyle = 'rgba(205,160,150,0.30)'; g.beginPath(); g.rect(-a * 1.3, -b * 1.4, a * 2.6, b * 1.4 + top[1][1] + b * 0.5); g.fill();
    // iris: flat dark, lighter lens below with a hard edge
    g.beginPath(); g.ellipse(icx, icy, rx, ry, 0, 0, TAU); g.fillStyle = iris[0]; g.fill();
    g.save(); g.beginPath(); g.ellipse(icx, icy, rx, ry, 0, 0, TAU); g.clip();
    g.beginPath(); g.ellipse(icx, icy + ry * 0.62, rx * 1.08, ry * 0.62, 0, 0, TAU); g.fillStyle = iris[1]; g.fill();
    g.restore();
    g.lineWidth = Math.max(0.8, w * 0.04); g.strokeStyle = E.ring || ink; g.beginPath(); g.ellipse(icx, icy, rx, ry, 0, 0, TAU); g.stroke();
    // catchlights (in iris radii, the big round one then a small one); world-space left, so the sign is flipped for the mirrored eye
    const hl = E.hl || [[-0.38, -0.46, 0.26], [-0.34, -0.1, 0.12]], hs = E.hlSide === undefined ? -1 : E.hlSide;
    g.fillStyle = '#ffffff';
    for (let i = 0; i < hl.length; i++) { g.beginPath(); g.arc(icx + hl[i][0] * rx * (side < 0 ? -1 : 1) * (hs < 0 ? 1 : -1), icy + hl[i][1] * ry, Math.max(0.6, hl[i][2] * rx), 0, TAU); g.fill(); }
    g.restore();
    // ink: heavy upper lid with the outer flick, a crease, lashes, a fine lower lid
    const wing = E.wing === undefined ? 0.6 : E.wing;
    const wx = O[0] + wing * w * 0.3, wy = O[1] - wing * h * 0.22 + tilt * b * -0.05;
    const lashK = E.lash || 1;
    tk.inkPath(g, [[I[0] + a * 0.03, I[1] - b * 0.04], top[0], top[1], top[2], [O[0], O[1]], [wx, wy]], { w: lw * 2.3 * lashK, color: ink, taperStart: 0.2, taperEnd: 0.16, pressure: (u) => 0.4 + 0.75 * Math.pow(u, 0.7), wobble: 0.04, seed: 7, weightVar: 0 });
    if (E.crease) tk.inkPath(g, [[-a * 0.35, top[0][1] - b * 0.38], [a * 0.15, top[1][1] - b * 0.42], [a * 0.62, top[2][1] - b * 0.3]], { w: lw * 0.75, color: E.creaseColor || ink, alpha: 0.9, taper: 0.45, wobble: 0.03, weightVar: 0 });
    const nl = E.lashes | 0;
    for (let i = 0; i < nl; i++) {
      const u = 0.62 + i * 0.17, px = lerp(top[1][0], O[0], u) + a * 0.04, py = lerp(top[1][1], O[1], u) - b * 0.04;
      tk.inkPath(g, [[px, py], [px + a * 0.2, py - b * (0.22 + 0.06 * i)]], { w: lw * 0.8, color: ink, taper: 0.6, wobble: 0, weightVar: 0 });
    }
    if (E.lowerLine !== false) tk.inkPath(g, [[a * 0.7, b * 0.62], [a * 0.3, b * 0.94], [-a * 0.15, b * 1.0], [-a * 0.55, b * 0.84]], { w: lw * 0.55, color: ink, alpha: 0.75, taper: 0.4, wobble: 0.03, weightVar: 0 });
    g.restore();
    if (E.onEye && open > 0.45) E.onEye(g, e, side, st, { cx: e.x + (side < 0 ? -icx : icx), cy: e.y + icy, rx, ry, a, b });
  };
  // the '> <' hurt eye: a slightly curved chevron with round ends, kept inside the eye box (thin like the lids of the other eyes, not a slab)
  RJ.hurtEye = function (g, e, side, E) {
    E = E || {};
    const a = e.w / 2, b = e.h / 2, lw = E.hurtLine || Math.max(2.2, e.w * 0.1);
    g.save(); g.translate(e.x, e.y); if (side < 0) g.scale(-1, 1);
    g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = E.ink || C.ink; g.lineWidth = lw;
    g.beginPath(); g.moveTo(a * 0.78, -b * 0.6); g.quadraticCurveTo(a * 0.12, -b * 0.38, -a * 0.58, b * 0.02); g.quadraticCurveTo(a * 0.12, b * 0.4, a * 0.78, b * 0.62); g.stroke();
    g.restore();
  };
  // One eye. e = {x, y, w, h}, side -1 = near (left) eye, +1 far. Closed, happy and hurt use the toolkit's inked arcs; the rest use the cel eye above
  // (set F.eye.style = 'tk' to force ART.tk.eye's glossy gradient eye instead).
  RJ.eye = function (g, e, side, st, F) {
    const E = F.eye || {};
    let preset = st.eyes === 'open' || !st.eyes ? (E.expr || 'neutral') : st.eyes;
    if (preset === 'closed' && E.closedExpr) preset = E.closedExpr;
    const isArc = preset === 'happy' || preset === 'closed' || preset === 'hurt';
    if (preset === 'hurt') { RJ.hurtEye(g, e, side, E); return; }
    if (!isArc && E.style !== 'tk') { RJ.eyeCel(g, e, side, st, E, preset); return; }
    const o = {
      expr: preset, side, open: st.eyes === 'open' || !st.eyes || preset === (E.expr || 'neutral') ? st.open : 1, look: st.look,
      iris: E.iris, pupil: E.pupil, ring: E.ring, sclera: E.sclera || '#fffaf4', ink: E.ink || C.ink, lineW: E.lineW || (isArc ? Math.max(1.1, e.w * 0.085) * 0.78 : undefined), lash: E.lash,
      wing: E.wing, catch: E.catch, catchSide: E.catchSide === undefined ? -1 : E.catchSide, star: E.star, lashes: E.lashes,
    };
    if (preset === (E.expr || 'neutral')) { if (E.tilt !== undefined) o.tilt = E.tilt; if (E.drop !== undefined) o.drop = E.drop; }
    tk.eye(g, e.x, e.y, e.w, e.h, o);
    if (!isArc && E.onEye && o.open > 0.45) E.onEye(g, e, side, st, null);
  };
  // the nose: a tiny curved ink tick on the face centreline (the cards draw nothing more), s = face size hint
  RJ.noseTick = function (g, x, y, s) {
    const k = clamp(num(s, 60) / 60, 0.5, 2);
    tk.inkPath(g, [[x - 0.6 * k, y - 2.6 * k], [x + 1.5 * k, y + 0.2 * k], [x + 0.3 * k, y + 2.3 * k]], { w: 1.25 * k, color: C.ink, alpha: 0.7, taper: 0.5, wobble: 0, weightVar: 0 });
  };
  // The whole face from spec.face, in head space. F: {eyes: [near {x,y,w,h}, far {x,y,w,h}], brows: [[x,y,w], [x,y,w]], browStyle: {color, thick, arch},
  //   nose: [x,y,size], mouth: [x,y,w], mouthStyle: {...}, blush: [[x,y,w],[x,y,w]], blushColor, eye: {iris, pupil, ring, sclera, expr, tilt, drop,
  //   lineW, lash, wing, catch, catchSide, closedExpr, onEye(g, e, side, st)}}. Draws blush, nose, eyes, brows, mouth in that order.
  RJ.drawFace = function (g, S) {
    const F = S.spec.face, st = S.face;
    if (!F) return;
    const bl = F.blush || [];
    for (let i = 0; i < bl.length; i++) tk.blush(g, bl[i][0], bl[i][1], bl[i][2] * clamp(st.blush, 0.2, 1.8), { color: F.blushColor || C.blush, alpha: clamp(0.22 * st.blush + 0.06, 0.04, 0.5) });
    if (F.nose) RJ.noseTick(g, F.nose[0], F.nose[1], F.nose[2] || 60);
    const es = F.eyes || [];
    if (es[0]) RJ.eye(g, es[0], -1, st, F);
    if (es[1]) RJ.eye(g, es[1], 1, st, F);
    const br = F.brows || [], bs = F.browStyle || {};
    for (let i = 0; i < br.length; i++) {
      const sd = i === 0 ? -1 : 1;
      RJ.brow(g, br[i][0], br[i][1] + st.browY + (F.browLift || 0), br[i][2], { side: sd, tilt: st.brow * (bs.tiltK === undefined ? 1 : bs.tiltK) + (bs.tilt || 0), arch: bs.arch === undefined ? 0.4 : bs.arch, thick: bs.thick, color: bs.color || C.ink, seed: i });
    }
    if (F.mouth) RJ.mouth(g, F.mouth[0], F.mouth[1], F.mouth[2], st.mouth, F.mouthStyle);
    if (st.sweat > 0.3 && F.sweat) RJ.fxSweat(g, F.sweat[0], F.sweat[1], F.sweat[2] || 5);
  };

  // ----------------------------------------------------------------------------------------------------------------------------------
  // effects (figure space, drawn last)
  // ----------------------------------------------------------------------------------------------------------------------------------
  const FX = (RJ.fx = {});
  FX.sweat = RJ.fxSweat;
  // rising music notes from (x, y): t seconds, col fill colour, n notes
  FX.notes = function (g, x, y, t, col, n) {
    n = n || 3;
    for (let i = 0; i < n; i++) {
      const u = fr(num(t) * 0.55 + i / n), a = Math.sin(PI * u), px = x + 34 + i * 10 + Math.sin(u * 5 + i * 2) * 5 + u * 16, py = y - 6 - u * 44 - i * 5, sz = 11 + (i % 2) * 3;
      const kind = i % 2 ? 'beamed' : 'eighth', rot = Math.sin(u * 4 + i) * 0.25;
      tk.note(g, px, py, sz * 1.22, { kind, color: C.ink, alpha: a * 0.95, rot, line: Math.max(2.6, sz * 0.26) });
      tk.note(g, px, py, sz, { kind, color: col, alpha: a, rot });
    }
  };
  // directional sound arcs from (x, y) toward ang: three arcs that expand and fade
  FX.arcs = function (g, x, y, ang, t, col, n) {
    n = n || 3;
    g.save(); g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const u = fr(num(t) * 1.3 + i / n), r = 14 + u * 36, a = Math.sin(PI * Math.min(1, u * 1.15)) * 0.95, sp = 0.62 - u * 0.12;
      g.globalAlpha = a; g.strokeStyle = C.ink; g.lineWidth = 6.2 - u * 2; g.beginPath(); g.arc(x, y, r, ang - sp, ang + sp); g.stroke();
      g.strokeStyle = col; g.lineWidth = 3.4 - u * 1.4; g.beginPath(); g.arc(x, y, r, ang - sp, ang + sp); g.stroke();
    }
    g.restore();
  };
  // a comic impact burst: jagged star in col with a light core, centre (x, y), radius r, rotation by t for a little life
  FX.burst = function (g, x, y, r, col, light, t) {
    const n = 11, pts = [], rot = 0.2 + Math.sin(num(t) * 9) * 0.05;
    for (let i = 0; i < n * 2; i++) { const a = rot + (i / (n * 2)) * TAU, rr = i % 2 ? r * 0.55 : r * (0.92 + 0.14 * Math.sin(i * 2.3)); pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr, 1]); }
    RJ.cel(g, pts, col, { shadow: RJ.shade(col, 0.1), line: LINE.main, tension: 0, depth: r * 0.14 });
    RJ.cel(g, tk.circlePts(x, y, r * 0.38, 10), light, { shadow: false, line: false });
  };
  // star sparkles around (x, y): list of [dx, dy, r, rot], colour, t twinkle
  FX.sparkles = function (g, x, y, list, col, t) {
    for (let i = 0; i < list.length; i++) {
      const p = list[i], tw = 0.75 + 0.25 * Math.sin(num(t) * 4.2 + i * 1.9);
      tk.sparkle(g, x + p[0], y + p[1], p[2] * tw, { color: col || '#ffffff', rot: p[3] || 0, glow: 0.35, thin: 0.2 });
    }
  };
  FX.hearts = function (g, x, y, t, col) {
    for (let i = 0; i < 3; i++) {
      const u = fr(num(t) * 0.5 + i / 3), a = Math.sin(PI * u), px = x + (i - 1) * 14 + Math.sin(u * 4 + i) * 4, py = y - u * 40, s = 5 + i;
      g.save(); g.globalAlpha = a;
      RJ.cel(g, [[px, py + s * 1.1, 1], [px - s * 1.2, py - s * 0.1], [px - s * 0.6, py - s * 0.9], [px, py - s * 0.4], [px + s * 0.6, py - s * 0.9], [px + s * 1.2, py - s * 0.1]], col, { line: LINE.fine + 0.3, depth: 2 });
      g.restore();
    }
  };
  // little 'hit' stars (hurt): three four-point stars orbiting (x, y)
  FX.stars = function (g, x, y, t, col) {
    for (let i = 0; i < 3; i++) { const a = num(t) * 3 + i * TAU / 3; tk.sparkle(g, x + Math.cos(a) * 24, y + Math.sin(a) * 8, 5.5, { color: col || '#ffe45e', glow: 0.2 }); }
  };
  // two sound rings bowed toward +x in front of (x, y), like a soft shield of sound (block): they pulse outward and fade
  FX.rings = function (g, x, y, t, col) {
    g.save(); g.lineCap = 'round';
    for (let i = 0; i < 2; i++) {
      const u = fr(num(t) * 0.9 + i * 0.5), r = 40 + i * 16 + u * 10, a = 0.55 + 0.4 * Math.sin(PI * u), sp = 0.95 - i * 0.1;
      g.globalAlpha = a; g.strokeStyle = C.ink; g.lineWidth = 6.6; g.beginPath(); g.arc(x, y, r, -sp, sp); g.stroke();
      g.strokeStyle = col; g.lineWidth = 3.8; g.beginPath(); g.arc(x, y, r, -sp, sp); g.stroke();
      g.strokeStyle = '#ffffff'; g.globalAlpha = a * 0.6; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, r - 1, -sp * 0.8, -sp * 0.3); g.stroke();
    }
    g.restore();
  };
  // three cherry petals drifting off (x, y) toward +x and up (Jasmin's strike)
  FX.petals = function (g, x, y, t) {
    for (let i = 0; i < 3; i++) {
      const u = fr(num(t) * 0.8 + i / 3), px = x + 16 + u * 62 + i * 6, py = y - 8 - u * 26 + Math.sin(u * 6 + i * 2) * 8 + (i - 1) * 12;
      tk.petal(g, px, py, 6.5 + (i % 2) * 1.5, u * 4 + i, Math.sin(PI * u) * 0.95, i % 2 ? '#ffc2dc' : '#ff7eb6');
    }
  };
  // an orange low-frequency wave rolling along the ground from (x, y) toward +x (Andy's strike)
  FX.wave = function (g, x, y, t, col) {
    const ph = num(t) * 9;
    for (let k = 0; k < 2; k++) {
      const pts = [], amp = (k ? 5 : 8), len = 170 - k * 40;
      for (let i = 0; i <= 24; i++) { const u = i / 24; pts.push([x + u * len, y - k * 10 - amp * Math.sin(u * 3.2 * TAU - ph) * Math.sin(PI * u)]); }
      g.save(); g.globalAlpha *= k ? 0.6 : 0.95;
      tk.inkPath(g, pts, { w: 6.2, color: C.ink, taper: 0.5, wobble: 0, weightVar: 0 });
      tk.inkPath(g, pts, { w: 3.4, color: col, taper: 0.5, wobble: 0, weightVar: 0 });
      g.restore();
    }
  };
  // a small grey speech bubble with three dots: the voiceless look of the down pose (lost their voice for a moment)
  FX.mute = function (g, x, y, t) {
    const b = 1 + 0.03 * Math.sin(num(t) * 2.2);
    g.save(); g.translate(x, y); g.scale(b, b);
    RJ.cel(g, [[-22, -12], [0, -17], [22, -12], [27, 0], [22, 11], [4, 14], [-6, 22, 1], [-8, 14], [-22, 11], [-27, 0]], '#e4e1ec', { shadow: '#bdb8cc', line: LINE.main, depth: 3, tension: 0.7, hi: '#ffffff', hiW: 1.2 });
    for (let i = -1; i <= 1; i++) { const a = 0.55 + 0.45 * Math.max(0, Math.sin(num(t) * 3 - i * 0.9)); g.beginPath(); g.arc(i * 9.5, 0, 3, 0, TAU); g.fillStyle = 'rgba(90,84,112,' + a.toFixed(3) + ')'; g.fill(); }
    g.restore();
  };
  // a violet flash on the pad (RawClaw's strike): a glow, four short rays and two sparkles, pulsing on the beat
  FX.flash = function (g, x, y, t, col, beat) {
    const b = clamp(num(beat), 0, 1);
    tk.glow(g, x, y, 34 + 14 * b, col, 0.45 + 0.35 * b);
    for (let i = 0; i < 4; i++) {
      const an = i * PI / 2 + PI / 4, r0 = 12 + 3 * b, r1 = 22 + 8 * b;
      RJ.ink(g, [[x + Math.cos(an) * r0, y + Math.sin(an) * r0], [x + Math.cos(an) * r1, y + Math.sin(an) * r1]], { w: 4.2, color: C.ink, taper: 0.3, wobble: 0, weightVar: 0 });
      RJ.ink(g, [[x + Math.cos(an) * (r0 + 1), y + Math.sin(an) * (r0 + 1)], [x + Math.cos(an) * (r1 - 1), y + Math.sin(an) * (r1 - 1)]], { w: 2.2, color: '#f1e6ff', taper: 0.3, wobble: 0, weightVar: 0 });
    }
    FX.sparkles(g, x, y, [[-26, -20, 5, 0.2], [28, -24, 6, 0.4]], '#ffffff', t);
  };
  RJ.fxDraw = function (g, S, name) {
    const A = S.A, pt = S.pt, t = S.t;
    if (name === 'mute') FX.mute(g, pt.head[0] + 30, pt.head[1] - 84, t);
    else if (name === 'rings') FX.rings(g, pt.chest[0] + 8, pt.chest[1] + 6, t, A.main);
    else if (name === 'petals') FX.petals(g, pt.micHead[0], pt.micHead[1], t);
    else if (name === 'wave') FX.wave(g, pt.feet[0] + 18, pt.feet[1] - 4, t, A.main);
    else if (name === 'pad') FX.flash(g, (pt.tip || pt.chest)[0], (pt.tip || pt.chest)[1], t, A.main, S.beat);
    else if (name === 'notes') FX.notes(g, pt.micHead[0], pt.micHead[1] - 6, t, A.main, 3);
    else if (name === 'arcs') FX.arcs(g, pt.micHead[0], pt.micHead[1], S.P.micFace, t, A.main, 3);
    else if (name === 'burst') FX.burst(g, pt.micHead[0] + 46, pt.micHead[1] + 2, 18 + 8 * S.beat, A.main, A.light, t);   // clear of the far eye even when the mic sits at the mouth
    else if (name === 'sparkles') FX.sparkles(g, pt.head[0], pt.head[1], [[58, -52, 7, 0.3], [78, -12, 5, 0], [64, 28, 4, 0.4], [-60, -44, 5, 0.2]], A.glow, t);
    else if (name === 'sparkleMic') FX.sparkles(g, pt.micHead[0], pt.micHead[1], [[22, -18, 7, 0.2], [34, 6, 4.5, 0], [16, 22, 4, 0.5], [44, -26, 4, 0.1]], '#ffffff', t);
    else if (name === 'hearts') FX.hearts(g, pt.head[0] + 80, pt.head[1] - 36, t, A.main);
    else if (name === 'stars') FX.stars(g, pt.head[0], pt.head[1] - 74, t, '#ffe45e');
    else if (name === 'sweat') { /* drawn inside the face */ }
  };

  // ----------------------------------------------------------------------------------------------------------------------------------
  // the pose system
  // ----------------------------------------------------------------------------------------------------------------------------------
  // Skeleton at rest (figure space). Override per character with spec.skel.
  RJ.SKEL = { hip: [0, -78], neck: [0, -146], headC: [2, -204], shF: [26, -131], shB: [-26, -131], hipF: [15, -72], hipB: [-15, -72], arm: [23, 21] };
  // Every number or name a pose table may set. Angles are radians, + is clockwise on screen, px are at s = 1.
  RJ.BASE_POSE = {
    bx: 0, by: 0, lean: 0, squash: 1, legDy: 0,                  // whole body offset, lean about the feet, vertical squash, legs bob
    torsoDx: 0, torsoDy: 0, torsoRot: 0, breath: 1,
    headRot: 0, headDx: 0, headDy: 0, headScale: 1,
    // the front (mic) arm. mic: 'mouth' (mic head near the mouth: micDx/micDy offset in head space), 'hand' (hand target fHand relative to the
    // front shoulder, the mic hangs from it) or 'none'. micAng = direction head -> tail. micGrip = px from the head centre to the grip.
    // micK scales the mic (a blend from 'none' grows it in the fist).
    mic: 'mouth', micAng: 1.05, micDx: 14, micDy: 8, micGrip: 24, micFace: 0, micK: 1,
    fHand: [14, 40], fBend: 1, fKind: 'fist', fRot: 0, fSpread: 1,
    // the back (free) arm. bFront 1 draws it over the torso.
    bHand: [-12, 40], bBend: 1, bKind: 'relaxed', bRot: 0, bSpread: 1, bFront: 0,
    // feet: ankle targets in figure space (y -12 = standing), toe rotation; fBow and bBow (when set) bow each knee by that many px (+x forward)
    fFoot: [24, -12], bFoot: [-22, -12], fFootRot: 0, bFootRot: 0, fBow: null, bBow: null,
    eyes: 'open', mouth: 'smile', brow: 0, browY: 0, blush: 1, sweat: 0, look: [0.3, 0],
    fx: [], flare: 0, hair: 0,
  };
  // idle motion per pose (added on top of the table by RJ.resolve): bob px at period s, sway rad, head rad, beat (0..1 amplitude) at beatHz, shake px,
  // jump px at hz, step {hz (steps a second), stride px, lift px}: the walk cycle (the feet swing in opposite phase, the lifted one moves forward)
  RJ.LIFE = {
    idle: { bob: 1.1, per: 3.2, sway: 0.012, head: 0.016 },
    sing: { bob: 1.6, per: 2.0, sway: 0.03, head: 0.035 },
    attack: { bob: 0.8, per: 1.2, sway: 0.01, head: 0.01, beat: 1, beatHz: 2.6 },
    hurt: { bob: 0.5, per: 1.6, shake: 1.6, head: 0.02 },
    cheer: { bob: 0.8, per: 0.9, sway: 0.02, head: 0.025, jump: 14, jumpHz: 1.7 },
    windup: { bob: 0.6, per: 1.2, head: 0.01 },
    strike: { bob: 0.8, per: 1.2, beat: 1, beatHz: 2.6 },
    block: { bob: 0.5, per: 2.4 },
    down: { bob: 0.4, per: 4.0, head: 0.008 },
    walk: { bob: 2.4, per: 0.5, head: 0.01, step: { hz: 2, stride: 9, lift: 5 } },
  };
  // the table a pose name draws with: its own, else its fallback (RJ.FALLBACK), else idle
  RJ.tableOf = function (spec, pose) {
    const poses = spec.poses || {};
    if (has(poses, pose) && poses[pose]) return pose;
    const fb = has(RJ.FALLBACK, pose) ? RJ.FALLBACK[pose] : null;
    return fb && has(poses, fb) && poses[fb] ? fb : 'idle';
  };
  // The final numbers for (pose, t, expr): base + table + idle life + expression override + spec.tweak. Returns a fresh object plus {sway, beat,
  // open, face}. P.pose is the requested pose when it is a kit pose (a strike drawn from the attack table still says 'strike'), P.table the table used.
  RJ.resolve = function (spec, pose, t, expr) {
    const poses = spec.poses || {}, pn = RJ.tableOf(spec, pose);
    const P = Object.assign({}, RJ.BASE_POSE, spec.base, poses[pn]);
    const name = typeof pose === 'string' && (has(poses, pose) || RJ.POSES.indexOf(pose) >= 0) ? pose : pn;
    P.pose = name; P.table = pn;
    const lk = has(RJ.LIFE, name) ? name : pn;
    const m = tk.motion(), ph = tk.vary(spec.id, 'life') * TAU, L = Object.assign({}, has(RJ.LIFE, lk) ? RJ.LIFE[lk] : RJ.LIFE.idle, has(spec.life, lk) ? spec.life[lk] : null);
    t = num(t);
    const w = TAU * t;
    P.sway = Math.sin(w / 2.6 + ph) * m;
    const breath = Math.sin(w / (L.per || 3.2) + ph);
    P.torsoDy += (L.bob || 0) * breath * m;
    P.legDy += (L.bob || 0) * breath * 0.25 * m;
    P.breath *= 1 + 0.006 * breath * m;
    P.lean += (L.sway || 0) * Math.sin(w / 4.1 + ph + 1) * m;
    P.headRot += (L.head || 0) * Math.sin(w / 3.7 + ph + 2) * m;
    P.headDy += 0.5 * breath * m;
    P.beat = 0;
    if (L.beat) {
      const b = Math.pow(Math.abs(Math.sin(PI * t * (L.beatHz || 2))), 3);       // sharp pulses on the beat
      P.beat = b * m;
      P.torsoDy += 3.6 * b * L.beat * m; P.headDy += 3 * b * L.beat * m; P.headRot += 0.05 * b * L.beat * m; P.lean += 0.02 * b * L.beat * m;
      P.fHand = [P.fHand[0] + 2.5 * b * m, P.fHand[1]]; P.micDx += 1.5 * b * m;
    }
    if (L.shake) { P.bx += L.shake * Math.sin(t * 46) * m; P.headRot += 0.025 * Math.sin(t * 38) * m; }
    if (L.jump) {
      const j = Math.abs(Math.sin(PI * t * (L.jumpHz || 1.6))) * L.jump * m;
      P.by -= j; P.fFoot = [P.fFoot[0], P.fFoot[1] - 0.6 * j]; P.bFoot = [P.bFoot[0], P.bFoot[1] - 0.6 * j];     // ankles tuck up in the air
      P.squash *= 1 - 0.03 * (1 - j / (L.jump * m || 1)) * m;                                                  // and squash a little on landing
    }
    if (L.step) {
      // the walk: two steps a cycle; the forward-swinging foot lifts, the planted one slides back (the body bob comes from bob and per above)
      const st = L.step, a = PI * t * (st.hz || 2), u = Math.sin(a), v = Math.cos(a), sk = 0.35 + 0.65 * m;
      P.fFoot = [P.fFoot[0] + (st.stride || 9) * u * sk, P.fFoot[1] - (st.lift || 5) * Math.max(0, v) * sk];
      P.bFoot = [P.bFoot[0] - (st.stride || 9) * u * sk, P.bFoot[1] - (st.lift || 5) * Math.max(0, -v) * sk];
      P.fFootRot += -0.25 * Math.max(0, v) * sk; P.bFootRot += -0.25 * Math.max(0, -v) * sk;
      P.stepPhase = u;
    }
    P.hairSwing = P.sway + P.lean * -6 + (P.beat || 0) * -0.4 + (L.step ? 0.6 * Math.sin(PI * t * (L.step.hz || 2) * 2) * m : 0);
    // face
    const ex = expr && (has(spec.exprs, expr) ? spec.exprs[expr] : has(RJ.EXPR, expr) ? RJ.EXPR[expr] : null);
    if (ex) for (const k in ex) P[k] = ex[k];
    P.open = P.eyes === 'open' ? RJ.blinkOpen(t, spec.id) : 1;
    if (typeof spec.tweak === 'function') { try { spec.tweak(P, t); } catch (e) { /* a bad tweak must never break a draw */ } }
    return P;
  };
  // Blend two resolved poses: numbers and number arrays lerp, strings, booleans and the fx list switch at k = 0.5. The two mic modes are kept
  // (P._micA, P._micB, P._micK) so RJ.layout can slide the mic between the hand and the mouth; a mic coming from 'none' grows in the fist.
  RJ.blend = function (Pa, Pb, k) {
    k = clamp(num(k), 0, 1);
    if (!Pb || k <= 0) return Pa;
    const out = {};
    const keys = Object.keys(Pa).concat(Object.keys(Pb).filter((x) => !(x in Pa)));
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i], a = Pa[key], b = Pb[key];
      if (typeof a === 'number' && typeof b === 'number') out[key] = a + (b - a) * k;
      else if (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x) => typeof x === 'number') && b.every((x) => typeof x === 'number')) out[key] = a.map((x, j) => x + (b[j] - x) * k);
      else out[key] = k < 0.5 ? (key in Pa ? a : b) : (key in Pb ? b : a);
    }
    const ma = Pa.mic === 'none' ? 0 : 1, mb = Pb.mic === 'none' ? 0 : 1;
    out.micK = num(Pa.micK, 1) * ma + (num(Pb.micK, 1) * mb - num(Pa.micK, 1) * ma) * k;
    if (out.micK > 0.02 && out.mic === 'none') out.mic = ma ? Pa.mic : Pb.mic;
    if (Pa.mic !== Pb.mic) { out._micA = Pa.mic; out._micB = Pb.mic; out._micK = k; }
    out.open = k < 0.5 ? num(Pa.open, 1) : num(Pb.open, 1);         // the blink belongs to whichever eyes are showing
    return out;
  };

  // matrices and live points for a resolved pose
  RJ.layout = function (spec, P) {
    const SK = spec.skel, F = spec.face || {};
    const root = mat.local(0, 0, P.bx, P.by, P.lean, 1, P.squash);
    const hips = mat.mul(root, mat.local(0, 0, 0, P.legDy, 0, 1, 1));
    const torso = mat.mul(root, mat.local(SK.hip[0], SK.hip[1], P.torsoDx, P.torsoDy, P.torsoRot, 1, P.breath));
    const neck = mat.mul(torso, mat.local(SK.neck[0], SK.neck[1], P.headDx, P.headDy, P.headRot, P.headScale, P.headScale));
    const head = mat.mul(neck, [1, 0, 0, 1, SK.headC[0], SK.headC[1]]);
    const mo = F.mouth || [10, 38, 20];
    const pt = {
      head: mat.pt(head, 0, 0), mouth: mat.pt(head, mo[0], mo[1]), shF: mat.pt(torso, SK.shF[0], SK.shF[1]), shB: mat.pt(torso, SK.shB[0], SK.shB[1]),
      hipF: mat.pt(hips, SK.hipF[0], SK.hipF[1]), hipB: mat.pt(hips, SK.hipB[0], SK.hipB[1]), feet: [P.bx, P.by], chest: mat.pt(torso, 0, -112),
    };
    // front hand and mic head, for one mic mode
    const M = spec.mic || {}, grip = P.micGrip, dir = [Math.cos(P.micAng), Math.sin(P.micAng)];
    const place = (mode) => {
      if (mode === 'mouth') { const mh = mat.pt(head, mo[0] + P.micDx, mo[1] + P.micDy); return { micHead: mh, hand: [mh[0] + dir[0] * grip, mh[1] + dir[1] * grip] }; }
      const hd = [pt.shF[0] + P.fHand[0], pt.shF[1] + P.fHand[1]];
      return { micHead: [hd[0] - dir[0] * grip, hd[1] - dir[1] * grip], hand: hd };
    };
    if (P._micA !== undefined && (P._micA === 'mouth') !== (P._micB === 'mouth')) {
      // a blend between a mic at the mouth and a mic in the hand: both placements, lerped, so the mic slides and never pops
      const a = place(P._micA), b = place(P._micB), k = clamp(num(P._micK), 0, 1);
      pt.micHead = [lerp(a.micHead[0], b.micHead[0], k), lerp(a.micHead[1], b.micHead[1], k)];
      pt.hand = [lerp(a.hand[0], b.hand[0], k), lerp(a.hand[1], b.hand[1], k)];
    } else { const p = place(P.mic); pt.micHead = p.micHead; pt.hand = p.hand; }
    pt.mic = pt.micHead;
    const Lay = { root, hips, torso, neck, head, pt, M };
    let tip = null;
    if (typeof spec.tip === 'function') { try { tip = spec.tip(P, Lay); } catch (e) { tip = null; } }
    pt.tip = tip && isFinite(tip[0]) && isFinite(tip[1]) ? tip : pt.micHead;
    return Lay;
  };
  // resolve a pose, blended toward n.mix when one is given
  RJ.pose = function (spec, n) {
    const P = RJ.resolve(spec, n.pose, n.t, n.expr);
    return n.mix && n.mix.k > 0 ? RJ.blend(P, RJ.resolve(spec, n.mix.pose, n.t, n.expr), n.mix.k) : P;
  };

  // ----------------------------------------------------------------------------------------------------------------------------------
  // the rig: turns a spec into {draw, bust, bounds, points}
  // ----------------------------------------------------------------------------------------------------------------------------------
  // spec: {id, accent (key of RJ.ACCENT), skel, base, poses, life, exprs, face, arm: {l, w, skin, skinSh, sleeve, hand: {skin, shade}},
  //   legs: {w, color, shade, skin, sock, shoe, pantsOver, bow, profile(u), decor(g, hip, ankle, mid)}, mic: {accent, headR, len, bands}, layers, bust: {rect: [x0, y0, x1, y1], pose},
  //   bounds: {w, h} or {x0, x1, h}, shadow: false to skip the ground shadow, tip(P, Lay) -> [x, y] the striking point, tweak(P, t)}
  RJ.rig = function (spec) {
    spec.skel = Object.assign({}, RJ.SKEL, spec.skel);
    spec.poses = spec.poses || { idle: {} };
    spec.layers = spec.layers || {};
    const A = RJ.accent(spec.accent || spec.id);
    const bounds = Object.assign({ w: 150, h: 300 }, spec.bounds);
    // a centred box by default; x0 and x1 may be given for a figure whose reach is lopsided (a long ponytail), then w is x1 - x0
    if (!(typeof bounds.x0 === 'number' && typeof bounds.x1 === 'number' && bounds.x1 > bounds.x0)) { bounds.x0 = -bounds.w / 2; bounds.x1 = bounds.w / 2; } else bounds.w = bounds.x1 - bounds.x0;
    bounds.y0 = -bounds.h; bounds.y1 = 0;

    // draw one layer in the space of matrix M (null = figure space), balanced even on error
    function layer(g, M, fn, S) {
      if (!fn) return;
      g.save();
      try { if (M) g.transform(M[0], M[1], M[2], M[3], M[4], M[5]); fn(g, S); } finally { g.restore(); }
    }
    function makeS(g, t, P, Lay) {
      return {
        g, t, P, spec, C, A, k: 1, M: Lay, pt: Lay.pt, sway: P.sway, beat: P.beat || 0,
        face: { eyes: P.eyes, mouth: P.mouth, brow: P.brow, browY: P.browY, blush: P.blush, look: P.look, open: P.open, sweat: P.sweat },
      };
    }
    function arm(g, S, front) {
      const P = S.P, pt = S.pt, ar = spec.arm || {}, hs = ar.hand || {}, ml = spec.mic || {};
      const sh = front ? pt.shF : pt.shB;
      const A2 = { s: sh, t: front ? pt.hand : [pt.shB[0] + P.bHand[0], pt.shB[1] + P.bHand[1]], bend: front ? P.fBend : P.bBend, l: ar.l, w: ar.w, skin: ar.skin, skinSh: ar.skinSh, sleeve: ar.sleeve, cuff: ar.cuff };
      if (front && P.mic !== 'none') {
        const mk = clamp(num(P.micK, 1), 0, 1);
        if (mk > 0.02) A2.mid = (gg, w) => {
          // a mic growing in (a blend from 'none') scales about the grip, so it appears in the fist
          if (mk < 0.999) { gg.save(); gg.translate(w[0], w[1]); gg.scale(mk, mk); gg.translate(-w[0], -w[1]); }
          RJ.mic(gg, pt.micHead[0], pt.micHead[1], P.micAng, { accent: ml.accent || A.main, headR: ml.headR, len: ml.len, bands: ml.bands });
          if (mk < 0.999) gg.restore();
        };
        A2.hand = (gg, w) => RJ.fistOnMic(gg, w[0], w[1], P.micAng, hs);
      } else {
        const kind = front ? P.fKind : P.bKind, rot = front ? P.fRot : P.bRot, spread = front ? P.fSpread : P.bSpread;
        A2.hand = (gg, w, ang) => RJ.hand(gg, kind, w[0], w[1], ang + rot, Object.assign({ spread }, hs));
        if (!ar.noFold && !ar.cuff && (hs.skin || C.skin) === (ar.skin || C.skin)) A2.parts = { kind, rot, o: Object.assign({ spread }, hs) };   // folded into the arm only when the hand matches the arm's colour
      }
      return RJ.drawArm(g, A2);
    }
    function legs(g, S) {
      const P = S.P, pt = S.pt, lg = spec.legs || {};
      const one = (hip, ankle, rot, sign, bow) => RJ.drawLeg(g, { hip, ankle, rot, w: lg.w, color: lg.color, shade: lg.shade, sock: lg.sock, shoe: lg.shoe, pantsOver: lg.pantsOver, decor: lg.decor, profile: lg.profile,
        bow: typeof bow === 'number' && isFinite(bow) ? bow : (lg.bow === undefined ? 2 : lg.bow * sign) });
      one(pt.hipB, [P.bx + P.bFoot[0], P.by + P.bFoot[1]], P.bFootRot, 0.8, P.bBow);
      one(pt.hipF, [P.bx + P.fFoot[0], P.by + P.fFoot[1]], P.fFootRot, 1, P.fBow);
    }
    function render(g, n, o) {
      o = o || {};
      const P = RJ.pose(spec, n), Lay = RJ.layout(spec, P), S = makeS(g, n.t, P, Lay), L = spec.layers;
      if (!o.noShadow && !n.noShadow && spec.shadow !== false) {
        const j = clamp(-P.by / 40, 0, 1), rx = 40 * (1 - 0.22 * j), ry = 7.5 * (1 - 0.2 * j);
        g.save(); g.fillStyle = 'rgba(20,6,40,' + (0.3 - 0.1 * j).toFixed(3) + ')'; g.beginPath(); g.ellipse(P.bx * 0.9 + 2, 1.5, rx, ry, 0, 0, TAU); g.fill(); g.restore();
      }
      layer(g, Lay.head, L.backHair, S);
      if (!P.bFront) arm(g, S, false);
      legs(g, S);
      layer(g, Lay.torso, L.torso, S);
      if (P.bFront) arm(g, S, false);
      layer(g, Lay.head, L.mid, S);
      layer(g, Lay.head, L.head, S);
      arm(g, S, true);
      layer(g, Lay.torso, L.over, S);
      layer(g, Lay.head, L.top, S);
      if (!o.noFx && !n.noFx) {
        const fxs = Array.isArray(P.fx) ? P.fx : [];
        for (let i = 0; i < fxs.length; i++) { g.save(); try { RJ.fxDraw(g, S, fxs[i]); if (L.fx) L.fx(g, S, fxs[i]); } finally { g.restore(); } }
      }
    }
    const impl = {
      bounds,
      draw(ctx, o) { RJ.frame(ctx, o, (g, n) => render(g, n)); },
      // portrait crop. Sizes are validated and the box is clipped here too, so calling RJ.chars[id].bust(ctx, w, h) directly is safe. spec.bust.rect is the
      // preferred crop (head and shoulders, covers the box). spec.bust.face is the rectangle that must stay fully visible (the head): when the box is short or
      // wide the zoom is reduced until the face fits with 10% to spare, centred on the face, instead of cutting through it.
      bust(ctx, w, h, o) {
        if (!ctx) return;
        w = num(w, 300); h = num(h, 400);
        if (!(w > 0 && h > 0)) return;
        o = o || {};
        const bs = spec.bust || {}, R = bs.rect || [-80, -300, 80, -80], rw = R[2] - R[0], rh = R[3] - R[1], F = bs.face;
        let k = Math.max(w / rw, h / rh), tx = w / 2 - (R[0] + R[2]) / 2 * k, ty = -R[1] * k;
        if (F) {
          const fw = F[2] - F[0], fh = F[3] - F[1];
          k = Math.min(k, Math.min(w / fw, h / fh) / 1.1);
          const fcx = (F[0] + F[2]) / 2, fcy = (F[1] + F[3]) / 2, hx = fw / 2 * k * 1.05, hy = fh / 2 * k * 1.05;
          const x0 = hx - fcx * k, x1 = w - hx - fcx * k, y0 = hy - fcy * k, y1 = h - hy - fcy * k;
          tx = clamp(tx, Math.min(x0, x1), Math.max(x0, x1));                                  // keeps the face inside the box horizontally
          ty = h < rh * k - 0.5 ? h * 0.46 - fcy * k : ty;                                     // a short box: face centre near 46% of the height
          ty = clamp(ty, Math.min(y0, y1), Math.max(y0, y1));                                  // and vertically (top anchored when it all fits)
        }
        ctx.save();
        try {
          ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
          ctx.translate(tx, ty); ctx.scale(k, k);
          render(ctx, RJ.norm({ pose: o.pose || bs.pose || 'idle', t: o.t, expr: o.expr || bs.expr, mix: o.mix }), { noShadow: true, noFx: true });
        } finally { ctx.restore(); }
      },
      points(o) {
        const n = RJ.norm(o), P = RJ.pose(spec, n), Lay = RJ.layout(spec, P), out = {};
        for (const k in Lay.pt) { const p = Lay.pt[k]; out[k] = [n.x + p[0] * n.s * (n.flip ? -1 : 1), n.y + p[1] * n.s]; }
        return out;
      },
    };
    return impl;
  };

  // ======================================================================================================================================
  // THE FOE KIT (HV_ART_AUDIO 4.2): RJ.foe, the shared helpers every enemy file builds its creatures from, so the 51 enemies share the cast's
  // chibi style: an even outline in the Act's line colour, flat cel colour with one warm hard shadow and one highlight, big flat-cel eyes with
  // a big and a small catchlight, cute even when grumpy. Act lines (E-D5): Act I and II deep navy #22264a, Act III cool slate #5a5f7a; the
  // main width by size class s 2.0, m 2.4, l 2.8, xl 3.2 (mid 0.8 and fine 0.575 of it). Every helper takes the context first, is a pure
  // function of its arguments (t seconds for anything that moves), never throws for odd numbers and leaves save and restore balanced.
  //   foe.ink(act, size?) -> {color, main, mid, fine}          foe.pal(act) -> the Act palette {list: [...], line, gloss: [...], accent}
  //   foe.cel(g, pts, base, o)          like RJ.cel with the Act line (o.act 1 to 3, o.size 's' 'm' 'l' 'xl', or o.line / o.lineColor)
  //   foe.limb(g, a, b, w, color, o)    a stubby capsule limb [x, y] to [x, y], one outline, round ends (o.act, o.size, o.shade)
  //   foe.eyes(g, x, y, w, o)           a pair of eyes centred on (x, y), each w wide (o.n 1 for one eye, o.gap centre to centre, default 1.3 w).
  //                                     o.kind round sleepy glare dot heart screen needle lens; o.open 0..1 (blink), o.look [-1..1, -1..1], o.act,
  //                                     o.iris (two colours), o.glow (screen eyes), o.h (height, default by kind)
  //   foe.mouth(g, x, y, w, kind, o)    RJ.mouth kinds plus glossSmile squeal O grumble (o.act for the line colour)
  //   foe.glossSmile(g, x, y, w, o)     THE Gloss smile: one small closed curve with two tiny upturned ends, identical everywhere (HV_ENEMIES 8)
  //   foe.glossSheen(g, box, k, o)      the Gloss on [x, y, w, h]: an opalescent film, a diagonal highlight sweep like a phone screen catching
  //                                     light, an airbrushed edge, a faint polite sparkle. o.shape clips it (any shape descriptor), o.t, o.seed
  //   foe.winOver(g, S, p, o)           the die pose, p 0..1: the Gloss flakes off as sparkles (0 to 0.35), one happy hop in real colours (0.35 to
  //                                     0.6), a pop into the Act's confetti (0.6 to 1); nothing of the body is drawn after 0.62. o.draw(g, S) paints
  //                                     the creature, o.gloss(g, S, k) its Gloss layer, o.box [x0, y0, x1, y1], o.act, o.confetti petals hearts grid
  //                                     broken (default by Act), o.hop px (18), o.seed
  //   foe.hurtFlash(g, S, k, o)         the fresh-hit white silhouette: o.draw(g) paints the shape in the current space, o.box [x0, y0, x1, y1],
  //                                     o.key a sprite key naming the shape; draws one white blit at 0.85 k, a second offset one while k > 0.5
  //   foe.sparkles(g, x, y, list, act, t)   foe.notes(g, x, y, t, act, n)   foe.rings(g, x, y, r, act, t)   the kit fx in the Act colours
  // ======================================================================================================================================
  const foe = (RJ.foe = {});
  const FOE_W = { s: 2.0, m: 2.4, l: 2.8, xl: 3.2 };
  const FOE_PAL = {
    1: { line: '#22264a', list: ['#e8553f', '#8fe3c0', '#ffd84d', '#7cc6ff', '#ff9fc6', '#2bb3b1', '#ffcf8a'], accent: '#ff9fc6', confetti: 'petals' },
    2: { line: '#22264a', list: ['#3d7bff', '#3ff0ff', '#ff3b5c', '#ff6fb5', '#6dff8a', '#fff2c4'], accent: '#3ff0ff', confetti: 'hearts' },
    3: { line: '#5a5f7a', list: ['#f4f1fb', '#e6d9ff', '#d9fff4', '#ffe3f1', '#c9cbd6', '#ff4d6d'], accent: '#ff4d6d', confetti: 'broken' },
  };
  const GLOSS = ['#f4f1fb', '#e6d9ff', '#d9fff4', '#ffe3f1'];
  const actOf = (a) => (a === 2 || a === 3 ? a : 1);
  foe.GLOSS = GLOSS;
  foe.pal = (act) => { const P = FOE_PAL[actOf(act)]; return { line: P.line, list: P.list.slice(), accent: P.accent, confetti: P.confetti, gloss: GLOSS.slice() }; };
  foe.ink = function (act, size) {
    const W = has(FOE_W, size) ? FOE_W[size] : FOE_W.m;
    return { color: FOE_PAL[actOf(act)].line, main: W, mid: W * 0.8, fine: W * 0.575 };
  };
  foe.cel = function (g, pts, base, o) {
    o = o || {};
    const ink = foe.ink(o.act, o.size);
    RJ.cel(g, pts, base, Object.assign({ line: ink.main, lineColor: ink.color }, o));
  };
  foe.limb = function (g, a, b, w, color, o) {
    o = o || {};
    if (!a || !b) return;
    const ink = foe.ink(o.act, o.size), ww = Math.max(1, num(w, 12));
    RJ.blob(g, [{ a: [num(a[0]), num(a[1])], b: [num(b[0]), num(b[1])], w: ww }], { fill: color || '#ffcf8a', shade: o.shade || RJ.shade(color || '#ffcf8a'), ink: ink.color, L: o.line || ink.main, lit: 1.6 });
  };
  // one eye at (x, y), w wide, kind as foe.eyes; side -1 is the eye on the left of the screen (its catchlights mirror)
  function foeEye(g, x, y, w, kind, o, side) {
    const ink = o.lineColor || foe.ink(o.act, o.size).color, open = clamp(num(o.open, 1), 0, 1), look = o.look || [0, 0];
    const lx = clamp(num(look[0]), -1, 1) * w * 0.12, ly = clamp(num(look[1]), -1, 1) * w * 0.1, lw = Math.max(1, w * 0.09);
    const h = num(o.h, kind === 'dot' ? w : kind === 'screen' ? w * 0.82 : w * 1.12);
    g.save(); g.translate(x, y);
    if (kind === 'dot') {
      const r = Math.max(0.6, w * 0.36);
      if (open < 0.3) { RJ.ink(g, [[-r, 0], [0, r * 0.4], [r, 0]], { w: lw, color: ink, taper: 0.3, wobble: 0 }); g.restore(); return; }
      g.beginPath(); g.ellipse(lx, ly, r, r * (0.3 + 0.7 * open), 0, 0, TAU); g.fillStyle = ink; g.fill();
      g.beginPath(); g.arc(lx - r * 0.35, ly - r * 0.35, Math.max(0.5, r * 0.32), 0, TAU); g.fillStyle = '#ffffff'; g.fill();
      g.restore(); return;
    }
    if (kind === 'screen') {
      // a little glass screen glowing from inside (Act II): a rounded rect, a cyan face light, two pixel eyes
      const a = w / 2, b = h / 2, glowC = o.glow || '#3ff0ff';
      tk.glow(g, 0, 0, w * 0.9, glowC, 0.45);
      RJ.cel(g, tk.rrectPts(-a, -b, w, h, Math.min(a, b) * 0.45), '#132050', { shadow: '#0b1434', line: lw, lineColor: ink, depth: 1.5, tension: 0 });
      const ph = Math.max(0.6, b * 0.9 * open);
      g.beginPath(); g.rect(lx - a * 0.32, ly - ph * 0.5, a * 0.64, ph); g.fillStyle = glowC; g.fill();
      g.beginPath(); g.rect(lx - a * 0.18, ly - ph * 0.42, a * 0.2, Math.max(0.5, ph * 0.3)); g.fillStyle = '#ffffff'; g.fill();
      g.restore(); return;
    }
    if (kind === 'lens') {
      // chrome rings (Act III): two bands of chrome, a dark lens, one mirror streak; it never blinks, it irises down
      const r = w / 2;
      RJ.cel(g, tk.circlePts(0, 0, r, 18), '#c9cbd6', { shadow: '#9a9db0', line: lw, lineColor: ink, depth: r * 0.2, hi: '#ffffff', hiW: 1.2 });
      g.beginPath(); g.arc(0, 0, r * 0.72, 0, TAU); g.fillStyle = '#e9ebf3'; g.fill();
      g.beginPath(); g.arc(lx * 0.6, ly * 0.6, Math.max(0.6, r * (0.28 + 0.24 * open)), 0, TAU); g.fillStyle = '#3a3f5a'; g.fill();
      g.beginPath(); g.arc(lx * 0.6 - r * 0.12, ly * 0.6 - r * 0.14, Math.max(0.5, r * 0.12), 0, TAU); g.fillStyle = '#ffffff'; g.fill();
      RJ.ink(g, [[-r * 0.55, -r * 0.2], [-r * 0.2, -r * 0.55]], { w: Math.max(0.8, r * 0.12), color: '#ffffff', taper: 0.4, wobble: 0, alpha: 0.85 });
      g.restore(); return;
    }
    if (kind === 'needle') {
      // a round tuner gauge with a needle that swings with o.look (Act III tuners): cute as an eye, precise as a meter
      const r = w / 2, an = -PI / 2 + clamp(num(look[0]), -1, 1) * 0.8;
      RJ.cel(g, tk.circlePts(0, 0, r, 18), '#fffaf1', { shadow: '#e2dcef', line: lw, lineColor: ink, depth: r * 0.15 });
      for (let i = -2; i <= 2; i++) { const a2 = -PI / 2 + i * 0.4; RJ.ink(g, [[Math.cos(a2) * r * 0.62, Math.sin(a2) * r * 0.62], [Math.cos(a2) * r * 0.8, Math.sin(a2) * r * 0.8]], { w: Math.max(0.6, lw * 0.5), color: ink, taper: 0, wobble: 0 }); }
      RJ.ink(g, [[0, r * 0.25], [Math.cos(an) * r * 0.7, r * 0.25 + Math.sin(an) * r * 0.7]], { w: Math.max(0.8, lw * 0.8), color: '#ff4d6d', taper: 0.2, wobble: 0 });
      g.beginPath(); g.arc(0, r * 0.25, Math.max(0.6, r * 0.12), 0, TAU); g.fillStyle = ink; g.fill();
      if (open < 0.99) { g.beginPath(); g.rect(-r, -r, r * 2, r * 2 * (1 - open)); g.fillStyle = 'rgba(214,206,235,0.95)'; g.fill(); }
      g.restore(); return;
    }
    // round, sleepy, glare, heart: the cast's flat cel eye in creature proportions
    const a = w / 2, b = h / 2;
    if (open < 0.12) {                                     // shut: a soft downward arc
      RJ.ink(g, [[-a, -b * 0.05], [0, b * 0.32], [a, -b * 0.05]], { w: lw * 1.3, color: ink, taper: 0.35, wobble: 0 });
      g.restore(); return;
    }
    const lid = kind === 'sleepy' ? 0.45 : kind === 'glare' ? 0.3 : 0;
    const sh = b * (0.35 + 0.65 * open);
    g.save();
    g.beginPath(); g.ellipse(0, (b - sh) * 0.6, a, sh, 0, 0, TAU); g.clip();
    g.fillStyle = '#fffdfa'; g.fillRect(-a - 1, -b - 1, w + 2, h + 2);
    const iris = o.iris || ['#2b2f55', '#5a6fb0'], ir = a * 0.72, icx = lx, icy = ly + b * 0.08;
    if (kind === 'heart') {
      const s = ir * 1.05;
      g.beginPath(); g.moveTo(icx, icy + s * 0.8); g.bezierCurveTo(icx - s * 1.3, icy - s * 0.1, icx - s * 0.6, icy - s * 1.05, icx, icy - s * 0.35); g.bezierCurveTo(icx + s * 0.6, icy - s * 1.05, icx + s * 1.3, icy - s * 0.1, icx, icy + s * 0.8); g.closePath();
      g.fillStyle = o.heart || '#ff6fb5'; g.fill();
    } else {
      g.beginPath(); g.ellipse(icx, icy, ir, ir * 1.12, 0, 0, TAU); g.fillStyle = iris[0]; g.fill();
      g.save(); g.beginPath(); g.ellipse(icx, icy, ir, ir * 1.12, 0, 0, TAU); g.clip();
      g.beginPath(); g.ellipse(icx, icy + ir * 0.75, ir * 1.1, ir * 0.7, 0, 0, TAU); g.fillStyle = iris[1]; g.fill(); g.restore();
    }
    g.fillStyle = '#ffffff';
    const sx = side < 0 ? -1 : 1;
    g.beginPath(); g.arc(icx - ir * 0.38 * sx, icy - ir * 0.48, Math.max(0.7, ir * 0.36), 0, TAU); g.fill();
    g.beginPath(); g.arc(icx + ir * 0.3 * sx, icy + ir * 0.35, Math.max(0.5, ir * 0.16), 0, TAU); g.fill();
    if (lid > 0) {                                         // a heavy lid: sleepy droops level, glare tilts down to the inner corner (grumpy, never scary)
      const tilt = kind === 'glare' ? -side * b * 0.5 : 0;
      g.beginPath(); g.moveTo(-a - 2, -b - 2); g.lineTo(a + 2, -b - 2); g.lineTo(a + 2, -b + h * lid + tilt); g.lineTo(-a - 2, -b + h * lid - tilt); g.closePath(); g.fillStyle = o.lidColor || '#d6cdea'; g.fill();
    }
    g.restore();
    g.lineWidth = lw; g.strokeStyle = ink;
    g.beginPath(); g.ellipse(0, (b - sh) * 0.6, a, sh, 0, 0, TAU); g.stroke();
    if (lid > 0) { const tilt = kind === 'glare' ? -side * b * 0.5 : 0; RJ.ink(g, [[-a, -b + h * lid - tilt], [a, -b + h * lid + tilt]], { w: lw * 1.3, color: ink, taper: 0.2, wobble: 0 }); }
    g.restore();
  }
  foe.eyes = function (g, x, y, w, o) {
    if (!g) return;
    o = o || {};
    w = Math.max(1, num(w, 14));
    const kind = typeof o.kind === 'string' ? o.kind : 'round', n = o.n === 1 ? 1 : 2, gap = num(o.gap, w * 1.3);
    x = num(x); y = num(y);
    if (n === 1) foeEye(g, x, y, w, kind, o, 1);
    else { foeEye(g, x - gap / 2, y, w, kind, o, -1); foeEye(g, x + gap / 2, y, w, kind, o, 1); }
  };
  foe.glossSmile = function (g, x, y, w, o) {
    if (!g) return;
    o = o || {};
    w = Math.max(2, num(w, 12)); x = num(x); y = num(y);
    const col = o.color || foe.ink(o.act || 3).color, lw = Math.max(1, w * 0.12);
    g.save(); g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(x - w / 2, y); g.quadraticCurveTo(x, y + w * 0.3, x + w / 2, y);   // the one small closed curve
    g.moveTo(x - w / 2, y); g.lineTo(x - w / 2 - w * 0.08, y - w * 0.08);                           // and its two tiny upturned ends
    g.moveTo(x + w / 2, y); g.lineTo(x + w / 2 + w * 0.08, y - w * 0.08);
    g.stroke(); g.restore();
  };
  foe.mouth = function (g, x, y, w, kind, o) {
    if (!g) return;
    o = o || {};
    w = Math.max(2, num(w, 14)); x = num(x); y = num(y);
    const ink = o.ink || foe.ink(o.act, o.size).color, lw = Math.max(1.2, w * 0.11);
    if (kind === 'glossSmile') { foe.glossSmile(g, x, y, w, { color: ink }); return; }
    if (kind === 'O') {
      RJ.cel(g, tk.ellipsePts(x, y + w * 0.18, w * 0.26, w * 0.32, 12), '#9c2f45', { shadow: false, line: lw, lineColor: ink });
      g.beginPath(); g.ellipse(x, y + w * 0.36, w * 0.14, w * 0.08, 0, 0, TAU); g.fillStyle = '#ff8fa3'; g.fill();
      return;
    }
    if (kind === 'squeal') {
      // a wide, wobbly open squeak (the Mic Squeal): a lemon-wedge mouth with a zigzag edge and a tiny tongue
      const pts = [[x - w / 2, y - w * 0.05, 1]];
      for (let i = 1; i < 6; i++) pts.push([x - w / 2 + i * w / 6, y - w * 0.05 + (i % 2 ? -w * 0.07 : 0), 1]);
      pts.push([x + w / 2, y - w * 0.05, 1], [x + w * 0.3, y + w * 0.36], [x, y + w * 0.46], [x - w * 0.3, y + w * 0.36]);
      RJ.cel(g, pts, '#9c2f45', { shadow: false, line: lw, lineColor: ink, tension: 0.2 });
      g.beginPath(); g.ellipse(x, y + w * 0.32, w * 0.16, w * 0.07, 0, 0, TAU); g.fillStyle = '#ff8fa3'; g.fill();
      return;
    }
    if (kind === 'grumble') {
      // a wavy grumbling line, a pout more than a frown
      const pts = []; for (let i = 0; i <= 8; i++) { const u = i / 8; pts.push([x - w / 2 + u * w, y + Math.sin(u * TAU * 1.5) * w * 0.07 + w * 0.06 * Math.sin(PI * u)]); }
      RJ.ink(g, pts, { w: lw, color: ink, taper: 0.3, wobble: 0 });
      return;
    }
    RJ.mouth(g, x, y, w, typeof kind === 'string' ? kind : 'smile', Object.assign({ ink }, o));
  };
  // the airbrushed Gloss film on [x, y, w, h] at strength k (0..1)
  foe.glossSheen = function (g, box, k, o) {
    if (!g || !box) return;
    o = o || {};
    k = clamp(num(k, 1), 0, 1);
    if (k <= 0.01) return;
    const x = num(box[0]), y = num(box[1]), w = Math.max(1, num(box[2], 10)), h = Math.max(1, num(box[3], 10)), t = num(o.t), m = tk.motion();
    g.save();
    if (o.shape) { g.beginPath(); tk.trace(g, o.shape); g.clip(); }
    const canG = typeof g.createLinearGradient === 'function' && typeof g.createRadialGradient === 'function';
    // the opalescent film: lilac, mint and blush blending across the box
    if (canG) {
      const gr = g.createLinearGradient(x, y, x + w, y + h);
      gr.addColorStop(0, U.color.rgba(GLOSS[1], 0.55 * k)); gr.addColorStop(0.5, U.color.rgba(GLOSS[2], 0.45 * k)); gr.addColorStop(1, U.color.rgba(GLOSS[3], 0.55 * k));
      g.fillStyle = gr;
    } else g.fillStyle = U.color.rgba(GLOSS[0], 0.5 * k);
    g.fillRect(x, y, w, h);
    // the highlight sweep: a soft diagonal band, like a phone screen catching the light, sliding slowly with t
    const u = ((num(o.phase) + t * 0.12 * m) % 1 + 1) % 1, cx = x - w * 0.3 + u * w * 1.6, band = Math.max(4, Math.min(w, h) * 0.32);
    if (canG) {
      const sw = g.createLinearGradient(cx - band, y, cx + band, y + band * 0.6);
      sw.addColorStop(0, 'rgba(255,255,255,0)'); sw.addColorStop(0.5, 'rgba(255,255,255,' + (0.6 * k).toFixed(3) + ')'); sw.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = sw;
    } else g.fillStyle = 'rgba(255,255,255,' + (0.25 * k).toFixed(3) + ')';
    g.beginPath(); g.moveTo(cx - band, y - 2); g.lineTo(cx + band * 0.4, y - 2); g.lineTo(cx - band * 0.2 + h * 0.5, y + h + 2); g.lineTo(cx - band * 1.6 + h * 0.5, y + h + 2); g.closePath(); g.fill();
    // the airbrushed edge: a soft pale rim fading inward
    if (canG) {
      const rr = Math.max(w, h) * 0.75, ed = g.createRadialGradient(x + w / 2, y + h / 2, rr * 0.45, x + w / 2, y + h / 2, rr);
      ed.addColorStop(0, 'rgba(244,241,251,0)'); ed.addColorStop(1, U.color.rgba(GLOSS[0], 0.6 * k));
      g.fillStyle = ed; g.fillRect(x, y, w, h);
    }
    g.restore();
    // a faint polite sparkle
    const sp = clamp(Math.min(w, h) * 0.12, 2.5, 9) * (0.85 + 0.15 * Math.sin(t * 2.4 + num(o.seed)) * m);
    tk.sparkle(g, x + w * 0.78, y + h * 0.22, sp, { color: '#ffffff', alpha: 0.85 * k, glow: 0.3 });
  };
  // the Act's fx: sparkles, notes and sound rings in the Act colours
  foe.sparkles = function (g, x, y, list, act, t) { if (!g || !Array.isArray(list)) return; const P = FOE_PAL[actOf(act)]; list.forEach((p, i) => FX.sparkles(g, num(x), num(y), [p], P.list[i % P.list.length], t)); };
  foe.notes = function (g, x, y, t, act, n) { if (!g) return; FX.notes(g, num(x) - 34, num(y), t, FOE_PAL[actOf(act)].accent, n || 3); };
  foe.rings = function (g, x, y, r, act, t) {
    if (!g) return;
    r = Math.max(1, num(r, 14)); const col = FOE_PAL[actOf(act)].accent, ink = FOE_PAL[actOf(act)].line, m = tk.motion();
    g.save(); g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const u = fr(num(t) * 0.8 * m + i / 3), rr = r * (1 + u * 1.4);
      g.globalAlpha = Math.sin(PI * u) * 0.9;
      g.strokeStyle = ink; g.lineWidth = Math.max(1.5, r * 0.26); g.beginPath(); g.arc(num(x), num(y), rr, 0, TAU); g.stroke();
      g.strokeStyle = col; g.lineWidth = Math.max(0.8, r * 0.13); g.beginPath(); g.arc(num(x), num(y), rr, 0, TAU); g.stroke();
    }
    g.restore();
  };
  // one confetti piece of an Act: a petal or a bunting flag (I), a heart or a pixel (II), a square chip (III)
  function confettiPiece(g, kind, x, y, s, rot, col, ink, a) {
    if (!(a > 0.02) || !(s > 0.3)) return;
    g.save(); g.globalAlpha *= clamp(a, 0, 1); g.translate(x, y); g.rotate(rot);
    if (kind === 'petal') tk.petal(g, 0, 0, s, 0, 1, col);
    else if (kind === 'flag') { g.beginPath(); g.moveTo(-s, -s * 0.6); g.lineTo(s, -s * 0.6); g.lineTo(0, s * 0.9); g.closePath(); g.fillStyle = col; g.fill(); g.lineWidth = Math.max(0.6, s * 0.18); g.strokeStyle = ink; g.stroke(); }
    else if (kind === 'heart') { g.beginPath(); g.moveTo(0, s * 0.8); g.bezierCurveTo(-s * 1.3, -s * 0.1, -s * 0.6, -s * 1.05, 0, -s * 0.35); g.bezierCurveTo(s * 0.6, -s * 1.05, s * 1.3, -s * 0.1, 0, s * 0.8); g.closePath(); g.fillStyle = col; g.fill(); g.lineWidth = Math.max(0.6, s * 0.16); g.strokeStyle = ink; g.stroke(); }
    else if (kind === 'pixel') { g.fillStyle = col; g.fillRect(-s * 0.55, -s * 0.55, s * 1.1, s * 1.1); }
    else { g.fillStyle = col; g.fillRect(-s * 0.7, -s * 0.45, s * 1.4, s * 0.9); g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(-s * 0.7, -s * 0.45, s * 1.4, s * 0.25); }
    g.restore();
  }
  // the Act's confetti burst from (cx, cy), q 0..1 since the pop: petals and flags, hearts and dimming pixels, a grid that breaks (or holds)
  foe.confetti = function (g, cx, cy, q, act, o) {
    if (!g) return;
    o = o || {};
    const P = FOE_PAL[actOf(act)], style = typeof o.confetti === 'string' ? o.confetti : P.confetti, n = Math.max(6, Math.min(40, num(o.n, 22))), sz = num(o.size, 7), R = num(o.r, 70);
    q = clamp(num(q), 0, 1);
    const rr = tk.rng('foeconf', num(o.seed), style), fade = q < 0.75 ? 1 : 1 - (q - 0.75) / 0.25;
    for (let i = 0; i < n; i++) {
      const a = rr() * TAU, sp = 0.45 + rr() * 0.55, col = P.list[i % P.list.length], spin = (rr() - 0.5) * 8;
      let x, y;
      if (style === 'grid' || style === 'broken') {
        // Act III: the confetti starts in a perfect grid; 'broken' scatters it as it falls (the Gloss losing), 'grid' keeps it aligned
        const cols = 6, gx = (i % cols - (cols - 1) / 2) * sz * 2.4, gy = (Math.floor(i / cols) - 2) * sz * 2.4, br = style === 'broken' ? clamp(q * 1.6, 0, 1) : 0;
        x = cx + gx * (0.4 + q) + Math.cos(a) * R * sp * q * br; y = cy + gy * (0.4 + q) + Math.sin(a) * R * sp * q * br * 0.6 + q * q * 40;
        confettiPiece(g, 'chip', x, y, sz * 0.8, br * spin * q, col, P.line, fade);
      } else {
        x = cx + Math.cos(a) * R * sp * Math.sqrt(q); y = cy + Math.sin(a) * R * sp * 0.7 * Math.sqrt(q) + q * q * 50;
        const kind = style === 'hearts' ? (i % 3 === 2 ? 'pixel' : 'heart') : (i % 3 === 2 ? 'flag' : 'petal');
        const dim = kind === 'pixel' ? clamp(1 - q * 1.4, 0, 1) : 1;      // Act II pixels dim out first
        confettiPiece(g, kind, x, y, sz * (kind === 'pixel' ? 0.6 : 1), spin * q, col, P.line, fade * dim);
      }
    }
  };
  // the win-over (the die pose), p 0..1
  foe.winOver = function (g, S, p, o) {
    if (!g) return;
    o = o || {};
    p = clamp(num(p), 0, 1);
    const act = actOf(o.act), B = Array.isArray(o.box) && o.box.length === 4 ? o.box.map((v) => num(v)) : [-50, -120, 50, 0];
    const cx = (B[0] + B[2]) / 2, cy = (B[1] + B[3]) / 2, bw = Math.max(4, B[2] - B[0]), bh = Math.max(4, B[3] - B[1]), hop = num(o.hop, 18);
    const body = (dy, sx, sy) => {
      if (typeof o.draw !== 'function') return;
      g.save();
      try { g.translate(cx, B[3] + dy); g.scale(sx, sy); g.translate(-cx, -B[3]); o.draw(g, S); } finally { g.restore(); }
    };
    if (p < 0.35) {
      // the Gloss flakes off: the body in real colours, the Gloss layer fading, pastel flakes rising off the box as sparkles
      body(0, 1, 1);
      const k = 1 - p / 0.35;
      if (typeof o.gloss === 'function') { g.save(); try { o.gloss(g, S, k); } finally { g.restore(); } }
      const rr = tk.rng('foeflake', num(o.seed));
      for (let i = 0; i < 9; i++) {
        const fx = B[0] + rr() * bw, fy = B[1] + rr() * bh, u = clamp(p / 0.35 * (0.6 + rr() * 0.6) - rr() * 0.2, 0, 1);
        tk.sparkle(g, fx + Math.sin(i + u * 4) * 6, fy - u * 34, (3 + rr() * 4) * Math.sin(PI * u), { color: GLOSS[i % 4], alpha: Math.sin(PI * u), glow: 0.4, rot: u * 2 });
      }
    } else if (p < 0.6) {
      // one small happy hop with the real colours back, a little squash on take-off and landing
      const u = (p - 0.35) / 0.25, j = Math.sin(PI * u), sq = 1 - 0.08 * Math.pow(Math.cos(PI * u), 8);
      body(-hop * j, 1 + (1 - sq) * 0.6, sq);
      if (u > 0.3) FX.sparkles(g, cx, B[1] - hop * j, [[-bw * 0.4, -6, 5, 0.2], [bw * 0.45, -14, 6, 0.4]], FOE_PAL[act].accent, u * 2);
    } else if (p < 0.62) {
      // the pop: the body shrinks to nothing in a blink
      const u = (p - 0.6) / 0.02;
      body(0, 1 - u, 1 - u);
    }
    if (p >= 0.6) {
      const q = (p - 0.6) / 0.4;
      if (q < 0.25) { tk.glow(g, cx, cy, Math.max(bw, bh) * (0.4 + q * 2), FOE_PAL[act].accent, 0.6 * (1 - q * 4)); }
      foe.confetti(g, cx, cy, q, act, { confetti: o.confetti, seed: o.seed, r: Math.max(bw, bh) * 0.9, size: clamp(Math.max(bw, bh) * 0.06, 4, 10) });
    }
  };
  // the fresh-hit white silhouette: one white blit of the shape, and a second one offset while the hit is very fresh
  foe.hurtFlash = function (g, S, k, o) {
    if (!g) return;
    o = o || {};
    k = clamp(num(k), 0, 1);
    if (k <= 0.02 || typeof o.draw !== 'function') return;
    const B = Array.isArray(o.box) && o.box.length === 4 ? o.box.map((v) => num(v)) : [-60, -140, 60, 4];
    const w = Math.max(2, B[2] - B[0]), h = Math.max(2, B[3] - B[1]), q = clamp(num(o.q, 2), 0.5, 3);
    const spr = ART.sprite('foe|flash|' + (typeof o.key === 'string' ? o.key : 'shape') + '|' + q, w * q, h * q, (gg) => {
      gg.scale(q, q); gg.translate(-B[0], -B[1]);
      o.draw(gg, S);
      gg.globalCompositeOperation = 'source-atop'; gg.fillStyle = '#ffffff'; gg.fillRect(B[0], B[1], w, h);
    });
    ART.blit(g, spr, B[0], B[1], w, h, 0.85 * k);
    if (k > 0.5) ART.blit(g, spr, B[0] + 2, B[1] - 2, w, h, 0.5 * (k - 0.5) * 2);
  };

  // the gallery sheet of the foe kit: eyes, mouths, the Gloss smile, the sheen per Act, a win-over strip per Act, a hurt flash
  ART.sheet('foe_kit', (canvas, params) => {
    const ctx = canvas.getContext('2d'), W = num(params.w, 1600), H = num(params.h, 900), t = num(+params.t, 0);
    tk.sky(ctx, 0, 0, W, H, 'night');
    const label = (s, x, y) => { ctx.font = '600 13px system-ui'; ctx.fillStyle = '#e9e2ff'; ctx.textAlign = 'left'; ctx.fillText(s, x, y); };
    label('RJ.foe: the shared foe kit (eyes, mouths, the Gloss smile, the sheen, the win-over, the hurt flash)', 14, 22);
    const kinds = ['round', 'sleepy', 'glare', 'dot', 'heart', 'screen', 'needle', 'lens'], cw = (W - 40) / kinds.length;
    kinds.forEach((kd, i) => {
      const x = 20 + cw * (i + 0.5), act = kd === 'screen' ? 2 : kd === 'needle' || kd === 'lens' ? 3 : 1;
      ctx.fillStyle = act === 3 ? '#e6e3f2' : act === 2 ? '#1b2350' : '#ffd8a8'; ctx.beginPath(); ctx.ellipse(x, 90, cw * 0.36, 44, 0, 0, TAU); ctx.fill();
      foe.eyes(ctx, x, 84, Math.min(26, cw * 0.18), { kind: kd, act, open: 1, look: [Math.sin(t), 0] });
      foe.mouth(ctx, x, 112, 16, act === 3 ? 'glossSmile' : 'smile', { act });
      label(kd, x - cw * 0.3, 150);
    });
    const mouths = ['smile', 'grin', 'happyOpen', 'ow', 'frown', 'glossSmile', 'squeal', 'O', 'grumble'], mw = (W - 40) / mouths.length;
    mouths.forEach((mk, i) => { const x = 20 + mw * (i + 0.5); ctx.fillStyle = '#ffd8a8'; ctx.beginPath(); ctx.arc(x, 196, 30, 0, TAU); ctx.fill(); foe.mouth(ctx, x, 196, 26, mk, { act: 1 }); label(mk, x - mw * 0.3, 244); });
    [1, 2, 3].forEach((act, i) => {
      const x = 20 + i * (W - 40) / 3, y = 270, bw = (W - 40) / 3 - 20;
      const blob = tk.rrectPts(x + bw * 0.2, y, bw * 0.6, 120, 40);
      foe.cel(ctx, blob, foe.pal(act).list[0], { act, size: 'm', hi: true });
      foe.glossSheen(ctx, [x + bw * 0.2, y, bw * 0.6, 120], 1, { shape: blob, t, seed: i });
      foe.eyes(ctx, x + bw * 0.5, y + 50, 18, { kind: act === 2 ? 'screen' : act === 3 ? 'lens' : 'round', act });
      foe.glossSmile(ctx, x + bw * 0.5, y + 86, 18, { act });
      label('Act ' + act + ' sheen, line ' + foe.ink(act).color, x + bw * 0.2, y + 140);
    });
    // a win-over strip per Act on a sample creature (a round critter with stubby limbs and one Gloss patch), then the same critter freshly hit
    const n = 9, sw = (W - 40) / (n + 1), rowH = (H - 450) / 3;
    [1, 2, 3].forEach((act, r) => {
      const y0 = 440 + r * rowH, P = foe.pal(act), roman = act === 1 ? 'I ' : act === 2 ? 'II ' : 'III ';
      const critter = (g) => {
        foe.limb(g, [-22, -20], [-26, -2], 12, P.list[1], { act });
        foe.limb(g, [22, -20], [26, -2], 12, P.list[1], { act });
        foe.cel(g, tk.ellipsePts(0, -48, 42, 40, 18), P.list[0], { act, hi: true });
        foe.eyes(g, 0, -56, 14, { kind: act === 2 ? 'screen' : act === 3 ? 'lens' : 'round', act });
        foe.mouth(g, 0, -34, 14, 'happyOpen', { act });
      };
      for (let i = 0; i <= n; i++) {
        const cx = 20 + sw * (i + 0.5), base = y0 + rowH * 0.78, sc = Math.min(1, rowH / 150);
        ctx.save(); ctx.translate(cx, base); ctx.scale(sc, sc);
        if (i < n) {
          const p = i / (n - 1);
          foe.winOver(ctx, null, p, { act, box: [-46, -92, 46, 0], seed: act, draw: critter, gloss: (g, S, k) => foe.glossSheen(g, [-42, -88, 84, 80], k, { shape: tk.ellipsePts(0, -48, 42, 40, 18), t }) });
          ctx.restore();
          label(roman + p.toFixed(2), cx - 22, y0 + rowH - 4);
        } else {
          critter(ctx);
          foe.hurtFlash(ctx, null, 0.8, { key: 'sheet' + act, box: [-50, -96, 50, 4], draw: critter });
          ctx.restore();
          label(roman + 'hit', cx - 22, y0 + rowH - 4);
        }
      }
    });
  });
})();
