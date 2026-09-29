// Inkwoven -- ART.hero: the four heroes (Hanae, Kuro, Suzu, Raiga), their eight poses, bust portraits and medallions. Extends ART (art.js).
//
// PUBLIC API (DESIGN 5.6; these members REPLACE the placeholders of art.js)
//   ART.hero.draw(ctx, heroId, {x, y, s, pose, t, pt, flip, alpha, glow, shadow})
//        The battle sprite. (x, y) is the FEET CENTRE, nominal height 250 * s (hair, ahoge and weapons may rise above), faces RIGHT, flip mirrors
//        about the origin. pose is one of LISTS.poses (idle attack cast hurt block down cheer walk; an unknown pose is idle). t is ABSOLUTE
//        SECONDS and drives every loop (breathing, hair and cloth sway, blink, glow pulses, orbiting ofuda and orbs, lightning crackle).
//        pt is SECONDS SINCE THE POSE BEGAN: one-shot poses derive swing and recoil from pt and HOLD their end pose for any larger pt, loops
//        (idle, walk) ignore it. alpha multiplies globalAlpha. glow is a number 0..1 (hero-coloured aura, always a faint one) or a hex colour
//        string. shadow:false skips the ink-smear contact shadow the sprite draws under its feet (SCENE need not draw one). An unknown id
//        draws a placeholder. Average cost is about 0.15 ms on a real canvas (the sprites are cached, only matrices move).
//   ART.hero.portrait(ctx, heroId, {x, y, w, h, expr, t})
//        Full-detail bust, x y = top-left, composed for 3:4 (design space 300 x 400); other ratios scale to COVER the rectangle and crop, keeping
//        the top and the face. expr is one of LISTS.expressions (neutral smile angry hurt determined; unknown = neutral). t animates a slow
//        breath, blinks and swaying hair and streamers. The portrait draws its own sumi backdrop (a dry-brush enso in the hero's colour, splatter
//        and screen-tone) and clips to its rectangle.
//   ART.hero.medallion(ctx, heroId, x, y, r)     round face icon, (x, y) = centre, cached per radius, gold rim and ink ring outside r by 3 px
//   ART.hero.bounds(heroId) -> {w, h, head:{x,y}, hand:{x,y}, feet:{x,y}, weapon:{x,y}}   offsets from the feet centre at s = 1 (y negative is up),
//        not mirrored by flip; the box is w wide, centred on x, and h (250) tall. hand and weapon are the idle rest positions.
//   ART.hero.poseMs(pose) -> natural length in ms (attack 420, cast 500, hurt 260, block 300, down 500, cheer 800; idle and walk 0)
//   Extras beyond DESIGN:
//   ART.hero.pointAt(heroId, name, {x, y, s, pose, t, pt, flip}) -> {x, y}   LIVE stage position of a named point: 'head' 'hand' 'tip' (weapon tip
//        or the striking fist) 'bladeMid' 'chest' 'feet' 'weapon'. Use it to spawn VFX exactly where the blade or fist is.
//   ART.hero.keyPt(pose) -> seconds into a pose where it looks best frozen (attack 0.15, cast 0.375...): card art and stills pass it as pt.
//   ART.hero.warm(heroId, s) -> sprites baked   pre-bakes every part at the raster scale for s (call while loading to avoid a first-frame hitch)
//   ART.hero.expressions() -> the five portrait expressions    ART.hero.ids() -> hero ids with art
//   ART.hero.audit(heroId) -> [{part, edges, size, alpha}]   dev tool: parts whose art touches the edge of their sprite box (clipped). Reads pixels.
//   Gallery sheets: hero_dev (params hero=id[,id]|all pose zoom t mode=portrait expr), heroes (all heroes x all poses at their key moment),
//   hero_lineup (the four at combat scale on a night backdrop), portraits (five expressions and two medallions each), hero_anim (film strip:
//   params hero pose t; without pose it shows attack, cast and hurt).
//
// HOW IT IS BUILT (read this before touching a hero)
//   A hero is a 2D cutout puppet. Every part (hair lock, sleeve, leg, weapon...) is drawn ONCE, at rest, by a function that uses the toolkit
//   (celFill, ribbon, eye...), cached as a sprite per raster scale q = ceil(2 * s) / 2, and composited each frame under a bone matrix. Swaying
//   things (ponytails, sleeves, sashes, streamers, ahoge) are ART.tk.chain parts: one drawing sliced into 2 to 4 slabs bent at joints.
//   The face is baked per expression combination (eyes, mouth, brow, blush) and blinks by swapping to a closed variant. Only three things are
//   drawn live every frame: the contact shadow, glows, and fx parts (petals, blade trails, orbiting ofuda and orbs, glyphs, lightning).
//   Bones: root > hips > torso > head; torso > armF1 > armF2 > weapon; torso > armB1 > armB2; hips > legF1 > legF2 > footF; hips > legB1 > legB2 > footB
//   (F = the near arm and leg, B = the far ones; heroes face right, so the viewer sees their right side). Hands and feet are placed with two-bone
//   inverse kinematics, so poses are tables of targets, not angles: hx, hy (near hand relative to the shoulder), bhx, bhy (far hand), wa (weapon
//   angle, 0 = up, + = leaning forward), fx, fy, bfx, bfy (ankle targets), bx, by, brot (whole body), torsoRot, headRot, hipsDy, and the face
//   (eyes, mouth, brow, blush) and effect strengths (glow, trail, power, wind). BASE below lists every key with its default.
//   The rig: heads are scaled 0.88 about the neck (rig.headScale), and every part box is padded by 8 px so outlines never clip.
//   A hero spec (defineHero) = {id, col (palette), rig, lm (face landmarks), skull, parts (draw order), poses, anchors, bounds, bust}.
//   Determinism: nothing here reads a clock or Math.random; a hero draw is a pure function of its arguments (plus the sprite cache).
(() => {
  'use strict';
  const tk = ART.tk, pal = tk.pal, mat = tk.mat;
  const clamp = tk.clamp, lerp = tk.lerp, num = tk.num;
  const TAU = Math.PI * 2, PI = Math.PI;
  const SPECS = {};                              // hero id -> spec (below)
  const POSE_MS = { attack: 420, cast: 500, hurt: 260, block: 300, down: 500, cheer: 800, idle: 0, walk: 0 };
  const cA = (a) => (a >= 0 ? (a <= 1 ? a : 1) : 0);
  const pos = (v, d) => (v > 0 && isFinite(v) ? v : d);

  // ---------------------------------------------------------------------------------------------------------------
  // the pose key: every number a pose can drive. Poses are tables of keyframes over this dictionary, blended with ART.tk.poseTrack.
  // Angles are radians, + is clockwise on screen (a raised arm swings NEGATIVE forward); hand and foot targets are px.
  // ---------------------------------------------------------------------------------------------------------------
  const BASE = {
    bx: 0, by: 0, brot: 0, bsx: 1, bsy: 1,          // whole body: offset, lean about the feet, squash and stretch
    hipsRot: 0, hipsDy: 4, torsoRot: 0, torsoDx: 0, headRot: 0, headDx: 0, headDy: 0,
    hx: 10, hy: 50, bhx: 2, bhy: 50,                // near and far hand targets relative to their shoulder
    wa: 0.6,                                        // weapon angle in body space: 0 = blade up, + = leaning forward
    fx: -10, fy: -14, bfx: 14, bfy: -14, frot: 0, bfrot: 0,   // near and far ankle targets (root space), foot flatness
    eyes: 'open', mouth: 'smile', brow: 0, blush: 0,
    glow: 0, trail: 0, power: 0, wind: 1,
  };

  // ---------------------------------------------------------------------------------------------------------------
  // two-bone inverse kinematics in a frame where a limb at rest hangs straight down. sign +1 bends the middle joint clockwise-below
  // the line (elbows), -1 the other way (knees).
  // ---------------------------------------------------------------------------------------------------------------
  function ik(sx, sy, tx, ty, l1, l2, sign) {
    let dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy);
    const maxD = l1 + l2 - 0.05, minD = Math.abs(l1 - l2) + 0.5;
    if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; }
    else if (d < minD) { if (d < 1e-6) { dx = 0; dy = minD; } else { dx *= minD / d; dy *= minD / d; } d = minD; }
    const phi = Math.atan2(dy, dx), a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    const a1 = phi + sign * a, ex = sx + Math.cos(a1) * l1, ey = sy + Math.sin(a1) * l1;
    const a2 = Math.atan2(sy + dy - ey, sx + dx - ex);
    return { r1: a1 - PI / 2, r2: a2 - a1 };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // the drawing helper handed to every part: S.cel / S.line / S.lock scale chibi-space coordinates by S.k (1 for the battle sprite, about
  // 2 for the bust portrait) and line widths by S.L, so one description of a head serves both.
  // ---------------------------------------------------------------------------------------------------------------
  function makeS(g, spec, o) {
    o = o || {};
    const k = o.k || 1, bust = !!o.bust;
    const S = { g, k, bust, spec, c: spec.col, light: tk.light, t: o.t || 0 };
    const lk = bust ? Math.min(2.4, k * 0.9) : 1;
    S.L = (px) => px * lk;
    S.P = (pts) => (k === 1 ? pts : tk.xf(pts, { s: k }));
    S.n = (v) => v * k;
    S.cel = (pts, base, opt) => {
      const oo = Object.assign({ line: S.L(2.3), rim: spec.col.rim, rimW: S.L(2), rimAlpha: 1, hi: 'auto', hiW: S.L(2.2) }, opt);
      if (oo.hi === false || oo.hi === null) oo.hi = undefined;
      if (oo.depth !== undefined) oo.depth *= k;
      if (oo.shadowShape) oo.shadowShape = Array.isArray(oo.shadowShape) ? S.P(oo.shadowShape) : (oo.shadowShape.poly ? { poly: S.P(oo.shadowShape.poly) } : oo.shadowShape);
      if (typeof oo.line === 'number') oo.line = oo.line === 0 ? false : (opt && opt.rawLine ? oo.line : oo.line);
      tk.celFill(g, Array.isArray(pts) ? S.P(pts) : pts, base, oo);
    };
    S.line = (pts, opt) => tk.inkPath(g, S.P(pts), Object.assign({}, opt, { w: S.L((opt && opt.w) || 1.4), color: (opt && opt.color) || pal.ink }));
    S.fill = (pts, color, alpha) => {
      g.save(); if (alpha !== undefined) g.globalAlpha = g.globalAlpha * cA(alpha);
      g.beginPath(); tk.trace(g, S.P(pts)); g.fillStyle = color; g.fill(); g.restore();
    };
    // hair lock / ribbon: widths in chibi px
    S.lock = (spine, base, opt) => {
      const oo = Object.assign({ line: S.L(2.4), rim: spec.col.rim, rimW: S.L(1.3) }, opt);
      ['wMax', 'w0', 'w1'].forEach((key) => { if (oo[key] !== undefined) oo[key] *= k; });
      tk.ribbon(g, S.P(spine), base, oo);
    };
    S.gloss = (spine, w, alpha, color) => tk.gloss(g, S.P(spine), { w: w * k, alpha, color });
    S.ell = (cx, cy, rx, ry, n, rot) => tk.ellipsePts(cx, cy, rx, ry, n || 12, rot || 0);
    S.clip = (pts) => { g.beginPath(); tk.trace(g, S.P(pts)); g.clip(); };
    S.sparkle = (x, y, r, opt) => tk.sparkle(g, x * k, y * k, r * k, opt);
    return S;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // hero specs: defineHero fills in the rig defaults and compiles the pose tables
  // ---------------------------------------------------------------------------------------------------------------
  const DEFAULT_RIG = {
    hips: [0, -62], waist: [0, -82], neck: [2, -134],
    shF: [-8, -124], shB: [12, -126],
    hipF: [-4, -60], hipB: [8, -60],
    arm: [28, 27], leg: [21, 25],
    HC: [4, -186], headScale: 0.88,
  };
  function defineHero(spec) {
    spec.rig = Object.assign({}, DEFAULT_RIG, spec.rig);
    spec._frames = {};
    spec._chains = {};
    spec.base = spec.base || {};
    SPECS[spec.id] = spec;
    return spec;
  }
  // one pose key with per-hero base deltas applied
  const K0 = (spec, d) => Object.assign({}, BASE, spec.base, d);
  function framesFor(spec, pose) {
    let f = spec._frames[pose];
    if (f) return f;
    const def = spec.poses[pose] || spec.poses.idle;
    f = def.frames.map((fr) => [fr[0], K0(spec, fr[1])]);
    spec._frames[pose] = f;
    return f;
  }
  const hash01 = (id, salt) => tk.vary(id, salt);

  // the pose key for (pose, t, pt): keyframes plus the always-on life (breathing, drift)
  function poseState(spec, pose, t, pt) {
    const def = spec.poses[pose] || spec.poses.idle;
    const fr = framesFor(spec, spec.poses[pose] ? pose : 'idle');
    const dur = (POSE_MS[pose] || 0) / 1000;
    let p = 0;
    if (def.loop) p = (((t / def.loop) % 1) + 1) % 1;
    else if (dur > 0) p = clamp(num(pt, 0) / dur, 0, 1);
    const K = tk.poseTrack(fr, p, def.ease || 'inOutSine');           // a fresh copy: everything below edits it
    K.p = p;
    const m = tk.motion(), ph = hash01(spec.id, 'life') * TAU;
    K.breath = 1 + 0.012 * m * Math.sin(TAU * t / 3.2 + ph);
    if (!def.still) {
      K.hipsDy += 0.9 * m * Math.sin(TAU * t / 3.2 + ph);
      K.headRot += 0.014 * m * Math.sin(TAU * t / 3.7 + ph + 1);
      K.headDy += 0.7 * m * Math.sin(TAU * t / 3.2 + ph + 0.6);
      K.hy += 0.9 * m * Math.sin(TAU * t / 3.2 + ph + 0.3);
      K.wa += 0.02 * m * Math.sin(TAU * t / 2.6 + ph);
    }
    return K;
  }

  // walk the skeleton: matrices of every bone in hero space
  function evaluate(spec, K) {
    const R = spec.rig, M = {}, l = R.arm, ll = R.leg;
    M.root = mat.local(0, 0, K.bx, K.by, K.brot, K.bsx, K.bsy);
    const hipsLocal = mat.local(R.hips[0], R.hips[1], 0, K.hipsDy, K.hipsRot, 1, 1);
    M.hips = mat.mul(M.root, hipsLocal);
    M.torso = mat.mul(M.hips, mat.local(R.waist[0], R.waist[1], K.torsoDx, 0, K.torsoRot, 1, K.breath));
    M.head = mat.mul(M.torso, mat.local(R.neck[0], R.neck[1], K.headDx, K.headDy, K.headRot, R.headScale, R.headScale));
    const arm = (sh, hx, hy, tag) => {
      const r = ik(sh[0], sh[1], sh[0] + hx, sh[1] + hy, l[0], l[1], 1);
      M['arm' + tag + '1'] = mat.mul(M.torso, mat.local(sh[0], sh[1], 0, 0, r.r1, 1, 1));
      M['arm' + tag + '2'] = mat.mul(M['arm' + tag + '1'], mat.local(sh[0], sh[1] + l[0], 0, 0, r.r2, 1, 1));
      return r;
    };
    const rf = arm(R.shF, K.hx, K.hy, 'F');
    arm(R.shB, K.bhx, K.bhy, 'B');
    const wrist = [R.shF[0], R.shF[1] + l[0] + l[1]];
    const rotW = K.wa - (K.hipsRot + K.torsoRot + rf.r1 + rf.r2);
    M.weapon = mat.mul(M.armF2, mat.local(wrist[0], wrist[1], 0, 0, rotW, 1, 1));
    const invHips = mat.inv(hipsLocal);
    const leg = (hip, fx, fy, frot, tag) => {
      const tp = mat.pt(invHips, fx, fy);
      const r = ik(hip[0], hip[1], tp[0], tp[1], ll[0], ll[1], -1);
      M['leg' + tag + '1'] = mat.mul(M.hips, mat.local(hip[0], hip[1], 0, 0, r.r1, 1, 1));
      M['leg' + tag + '2'] = mat.mul(M['leg' + tag + '1'], mat.local(hip[0], hip[1] + ll[0], 0, 0, r.r2, 1, 1));
      M['foot' + tag] = mat.mul(M['leg' + tag + '2'], mat.local(hip[0], hip[1] + ll[0] + ll[1], 0, 0, frot - K.hipsRot - r.r1 - r.r2, 1, 1));
    };
    leg(R.hipF, K.fx, K.fy, K.frot, 'F');
    leg(R.hipB, K.bfx, K.bfy, K.bfrot, 'B');
    return M;
  }
  // rest-space point of a named anchor, transformed by the current pose
  function anchorAt(spec, M, name) {
    const a = spec.anchors[name];
    if (!a) return [0, -100];
    return mat.pt(M[a[0]], a[1][0], a[1][1]);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // baking: parts are cached sprites keyed by hero, part and raster scale q
  // ---------------------------------------------------------------------------------------------------------------
  const qOf = (s) => Math.max(0.5, Math.ceil(clamp(s, 0.25, 2.5) * 2) / 2);
  const PAD = 8;                                                    // every part box grows by this so outlines and glows never clip
  const boxOf = (part) => { const b = part.box; return [b[0] - PAD, b[1] - PAD, b[2] + PAD, b[3] + PAD]; };
  // washi grain baked into every sprite (only where the sprite has paint): nothing is perfectly clean
  function grainOver(g, x, y, w, h) {
    g.save(); g.globalCompositeOperation = 'source-atop';
    tk.paperGrain(g, x, y, w, h, { alpha: 0.85, force: true });
    g.restore();
  }
  function partSprite(spec, part, q) {
    const b = boxOf(part), w = b[2] - b[0], h = b[3] - b[1];
    return ART.sprite('hero|' + spec.id + '|' + part.id + '|' + q, w * q, h * q, (g) => {
      g.scale(q, q); g.translate(-b[0], -b[1]);
      part.draw(makeS(g, spec, { k: 1 }));
      grainOver(g, b[0], b[1], w, h);
    });
  }
  function partChain(spec, part) {
    let c = spec._chains[part.id];
    if (c) return c;
    const key = 'hero|' + spec.id + '|' + part.id;
    c = tk.chain(key, {
      spine: part.chain.spine, cuts: part.chain.cuts, reach: part.chain.reach, overlap: part.chain.overlap,
      draw: (g) => { part.draw(makeS(g, spec, { k: 1 })); grainOver(g, -400, -400, 800, 800); },
    });
    spec._chains[part.id] = c;
    return c;
  }
  // eyes and brows: the face state a pose asks for, quantised so the number of baked faces stays small
  const EYE_MAP = {
    open: { expr: 'neutral' }, closed: { expr: 'closed' }, half: { expr: 'half' }, happy: { expr: 'happy' }, angry: { expr: 'angry' },
    determined: { expr: 'determined' }, hurt: { expr: 'hurt' }, wide: { expr: 'wide' }, sleepy: { expr: 'sleepy' }, sad: { expr: 'sad' }, smirk: { expr: 'smirk' },
  };
  const faceKey = (f) => f.eyes + '|' + f.mouth + '|' + (Math.round(f.brow * 4) / 4) + '|' + (f.blush > 0.5 ? 1 : 0);
  function faceSprite(spec, f, q) {
    const b = spec.faceBox || [-64, -64, 68, 66], w = b[2] - b[0], h = b[3] - b[1];
    return ART.sprite('hero|' + spec.id + '|face|' + faceKey(f) + '|' + q, w * q, h * q, (g) => {
      g.scale(q, q); g.translate(-b[0], -b[1]);
      spec.drawFace(makeS(g, spec, { k: 1 }), { eyes: f.eyes, mouth: f.mouth, brow: Math.round(f.brow * 4) / 4, blush: f.blush > 0.5 });
      grainOver(g, b[0], b[1], w, h);
    });
  }
  function blinkState(spec, t) {
    const per = 3.6 + 1.7 * hash01(spec.id, 'blinkp'), ph = ((t + 0.3 + hash01(spec.id, 'blinko') * (per - 0.6)) % per + per) % per;
    if (ph > 0.17) return 0;
    return ph < 0.05 || ph > 0.12 ? 1 : 2;              // 1 = half closed, 2 = shut
  }

  // ---------------------------------------------------------------------------------------------------------------
  // drawing a hero
  // ---------------------------------------------------------------------------------------------------------------
  function drag(K, Kp) {
    const vx = (K.bx - Kp.bx) / 0.04, om = ((K.torsoRot - Kp.torsoRot) + (K.headRot - Kp.headRot) + (K.brot - Kp.brot)) / 0.04;
    return clamp(vx * 0.0016 + om * 0.05, -0.6, 0.6);
  }
  // one shared brush-smear shadow
  function shadowSprite() {
    return ART.sprite('hero|shadow', 116, 26, (g) => {
      const r = tk.rng('hero', 'shadow'), pts = [];
      for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; pts.push([58 + Math.cos(a) * (46 + r() * 8), 13 + Math.sin(a) * (7 + r() * 2.2)]); }
      g.beginPath(); tk.trace(g, pts); g.fillStyle = tk.rgba(pal.ink, 0.42); g.fill();
      g.beginPath(); tk.trace(g, pts.map((p) => [58 + (p[0] - 58) * 0.66, 13 + (p[1] - 13) * 0.6])); g.fillStyle = tk.rgba(pal.ink, 0.28); g.fill();
      for (let i = 0; i < 5; i++) {
        const y = 7 + r() * 12, x0 = 4 + r() * 22, x1 = 92 + r() * 20;
        tk.inkPath(g, [[x0, y], [(x0 + x1) / 2, y + (r() - 0.5) * 3], [x1, y + (r() - 0.5) * 2]], { w: 1.2 + r() * 1.3, color: pal.ink, alpha: 0.22, taper: 0.45, wobble: 0.3, seed: i });
      }
    });
  }
  function drawHero(ctx, id, o) {
    const spec = SPECS[id];
    o = o || {};
    if (!spec) { ART.placeholder(ctx, String(id), num(o.x, 0) - 50, num(o.y, 0) - 250, 100, 250); return; }
    const s = num(o.s, 1) > 0 ? num(o.s, 1) : 1, t = num(o.t, 0), pt = Math.max(0, num(o.pt, 0));
    const pose = spec.poses[o.pose] ? o.pose : 'idle';
    const q = qOf(s), m = tk.motion();
    const K = poseState(spec, pose, t, pt);
    const Kp = poseState(spec, pose, t - 0.04, Math.max(0, pt - 0.04));
    const M = evaluate(spec, K);
    const dragA = drag(K, Kp) * m;
    ctx.save();
    ctx.translate(num(o.x, 0), num(o.y, 0));
    if (o.alpha !== undefined) ctx.globalAlpha = ctx.globalAlpha * cA(o.alpha);
    ctx.scale(o.flip ? -s : s, s);
    // contact shadow: a dry-brush ink smear, shrinking when the hero leaves the ground
    if (o.shadow !== false) {
      const lift = clamp(-(K.by) / 60, 0, 1), spr = shadowSprite();
      ctx.save(); ctx.globalAlpha = ctx.globalAlpha * (1 - lift * 0.55);
      const sw = 116 * (1 - lift * 0.3);
      ctx.drawImage(spr, K.bx * 0.6 + 2 - sw / 2, -13, sw, 26);
      ctx.restore();
    }
    const gl = typeof o.glow === 'number' ? clamp(o.glow, 0, 1) : o.glow ? 0.6 : 0;
    tk.glow(ctx, K.bx * 0.5, -125, 132, typeof o.glow === 'string' ? o.glow : spec.col.aura, 0.09 + (gl > 0.01 ? gl * 0.5 : 0));
    const st = { spec, K, M, t, pt, pose, p: K.p, q, s, m, dragA, at: (name) => anchorAt(spec, M, name), heroScale: s };
    st.motion = m;
    // manga speed lines behind a striking hero
    if (K.trail > 0.25 && pose === 'attack') {
      tk.speedLines(ctx, 0, -110, { mode: 'dir', rect: [-200 + K.bx * 0.4, -215, 210, 200], angle: 0, len: 130, n: 16, seed: Math.floor(t * 18), w: 2.8, alpha: 0.42 * K.trail, color: spec.col.rim });
    }
    const parts = spec.parts;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.live) {
        ctx.save();
        const bm = part.bone ? M[part.bone] : null;
        if (bm) ctx.transform(bm[0], bm[1], bm[2], bm[3], bm[4], bm[5]);
        part.live(ctx, st);
        ctx.restore();
        continue;
      }
      const bm = M[part.bone] || M.root;
      ctx.save();
      ctx.transform(bm[0], bm[1], bm[2], bm[3], bm[4], bm[5]);
      if (part.face) {
        let eyes = K.eyes;
        if (eyes === 'open' || eyes === 'half' || eyes === 'determined' || eyes === 'sleepy') { const b = blinkState(spec, t); if (b === 2) eyes = 'closed'; else if (b === 1 && eyes === 'open') eyes = 'half'; }
        const fb = spec.faceBox || [-64, -64, 68, 66];
        const spr = faceSprite(spec, { eyes, mouth: K.mouth, brow: K.brow, blush: K.blush }, q);
        const hc = spec.rig.HC;
        ctx.drawImage(spr, hc[0] + fb[0], hc[1] + fb[1], fb[2] - fb[0], fb[3] - fb[1]);
        // a twinkle in the eyes every few seconds
        if (eyes !== 'closed' && eyes !== 'happy' && eyes !== 'hurt' && m > 0.5) {
          const per = 4.6 + 1.3 * hash01(spec.id, 'glintp'), ph = ((t + 1.1 + 2 * hash01(spec.id, 'glinto')) % per + per) % per;
          if (ph < 0.42) {
            const u = Math.sin(ph / 0.42 * PI), en = spec.lm.eyeN, ef = spec.lm.eyeF;
            tk.sparkle(ctx, hc[0] + en.x + 4, hc[1] + en.y - 9, 6.5 * u, { color: '#ffffff', glow: 0.3 });
            tk.sparkle(ctx, hc[0] + ef.x + 3, hc[1] + ef.y - 8, 5 * u, { color: '#ffffff', glow: 0.3 });
          }
        }
      } else if (part.chain) {
        const c = partChain(spec, part), sw = part.chain.sway || {};
        const nj = c.segs.length, bends = new Array(nj), org = part.origin || [0, 0];
        const wind = K.wind * (sw.windK === undefined ? 1 : sw.windK);
        for (let j = 0; j < nj; j++) {
          const gain = sw.gain ? sw.gain[j] : 0.3 + 0.55 * j;
          bends[j] = m * (num(sw.amp, 0.12) * wind * gain * Math.sin(TAU * (num(sw.freq, 0.45) * t + num(sw.phase, 0)) - num(sw.lag, 0.8) * j) + dragA * num(sw.drag, 1) * gain * 0.9) + (sw.rest ? (sw.rest[j] || 0) : 0);
        }
        if (sw.hang) bends[0] -= sw.hang * Math.atan2(bm[1], bm[0]);          // hanging cloth keeps hanging when its bone swings
        ctx.translate(org[0], org[1]);
        c.draw(ctx, bends, q);
      } else {
        const b = boxOf(part), org = part.origin || [0, 0];
        if (part.sway) {
          const sw = part.sway;
          ctx.translate(sw.px || 0, sw.py || 0);
          ctx.rotate(m * (num(sw.amp, 0.04) * K.wind * Math.sin(TAU * (num(sw.freq, 0.4) * t + num(sw.phase, 0))) + dragA * num(sw.drag, 0.4)));
          ctx.translate(-(sw.px || 0), -(sw.py || 0));
        }
        ctx.drawImage(partSprite(spec, part, q), org[0] + b[0], org[1] + b[1], b[2] - b[0], b[3] - b[1]);
      }
      ctx.restore();
    }
    // a hit spark and flash on the chest while a hurt pose lands
    if (pose === 'hurt' && pt < 0.22) {
      const u = 1 - pt / 0.22, hp = mat.pt(M.torso, 6, -108);
      ctx.save(); ctx.translate(hp[0] + 12, hp[1] - 6);
      tk.glow(ctx, 0, 0, 40 * u + 14, '#ffffff', 0.7 * u);
      tk.sparkle(ctx, 0, 0, 30 * u + 6, { color: '#ffffff', rot: 0.4, glow: 0 });
      tk.sparkle(ctx, 0, 0, 20 * u + 4, { color: spec.col.aura, rot: 0.4 + PI / 4, glow: 0 });
      ctx.restore();
    }
    ctx.restore();
  }
  // where a named point of the hero (head, hand, tip, chest, feet) is on the stage for a pose, honouring x, y, s and flip
  function pointAt(id, name, o) {
    const spec = SPECS[id];
    o = o || {};
    if (!spec) return { x: num(o.x, 0), y: num(o.y, 0) };
    const s = num(o.s, 1) > 0 ? num(o.s, 1) : 1, K = poseState(spec, spec.poses[o.pose] ? o.pose : 'idle', num(o.t, 0), Math.max(0, num(o.pt, 0)));
    const p = anchorAt(spec, evaluate(spec, K), name);
    return { x: num(o.x, 0) + (o.flip ? -1 : 1) * p[0] * s, y: num(o.y, 0) + p[1] * s };
  }
  // pre-bake every sprite of a hero at the raster scale for s so the first frame in a fight does not hitch
  function warm(id, s) {
    const spec = SPECS[id];
    if (!spec) return 0;
    const q = qOf(num(s, 1));
    let n = 0;
    spec.parts.forEach((part) => {
      if (part.live) return;
      if (part.face) return;
      if (part.chain) { n += partChain(spec, part).warm(q); return; }
      partSprite(spec, part, q); n++;
    });
    ['open', 'closed', 'half'].forEach((e) => { faceSprite(spec, { eyes: e, mouth: 'smile', brow: 0, blush: 0 }, q); n++; });
    return n;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // shared part painters used by every hero spec
  // ---------------------------------------------------------------------------------------------------------------
  // The standard face, in two layers so the portrait can blink without rebaking the skin: drawFaceBase (skin, fringe shadow) and
  // drawFaceFeatures (blush, eyes, brows, mouth, nose, glasses). Landmarks live in spec.lm (chibi px, head space); the bust uses
  // spec.skullBust and spec.lmBust when the spec has them (a longer, narrower jaw and slightly higher eyes: full anime proportion).
  function drawFaceBase(S) {
    const g = S.g, sp = S.spec, c = sp.col;
    const fs = S.bust && sp.skullBust ? sp.skullBust : sp.skull;
    S.cel(fs, c.skin, { shadow: c.skinD, depth: 6, line: S.L(2.4), rim: null });
    const fsh = S.bust && sp.fringeShadowBust ? sp.fringeShadowBust : sp.fringeShadow;
    if (fsh) { g.save(); S.clip(fs); S.fill(fsh, c.skinD, 1); g.restore(); }
    if (sp.faceUnder) sp.faceUnder(S);
  }
  function drawFaceFeatures(S, f) {
    const g = S.g, sp = S.spec, c = sp.col, k = S.k;
    const lm = S.bust && sp.lmBust ? sp.lmBust : sp.lm;
    const ey = EYE_MAP[f.eyes] || EYE_MAP.open;
    const ex = { iris: c.iris, ring: c.irisRing, pupil: c.pupil, lineW: S.L(1.5), look: [0.34, 0.02], glow: sp.eyeGlow || 0, wing: sp.wing === undefined ? 0.55 : sp.wing, lash: sp.lash || 1, ink: c.lash };
    if (f.blush) {
      tk.blush(g, lm.blushN[0] * k, lm.blushN[1] * k, lm.blushN[2] * k, { color: c.blush });
      tk.blush(g, lm.blushF[0] * k, lm.blushF[1] * k, lm.blushF[2] * k, { color: c.blush });
    }
    const en = lm.eyeN, ef = lm.eyeF;
    tk.eye(g, en.x * k, en.y * k, en.w * k, en.h * k, Object.assign({ side: -1 }, ex, ey));
    tk.eye(g, ef.x * k, ef.y * k, ef.w * k, ef.h * k, Object.assign({ side: 1 }, ex, ey));
    const bw = lm.browW || 20;
    tk.brow(g, lm.browN[0] * k, (lm.browN[1] - (f.brow < 0 ? f.brow * 2 : 0)) * k, bw * k, { side: -1, tilt: f.brow, arch: f.brow > 0.3 ? 0.1 : 0.4, color: c.brow, thick: S.L(sp.browThick || 2.6), seed: 1 });
    tk.brow(g, lm.browF[0] * k, (lm.browF[1] - (f.brow < 0 ? f.brow * 2 : 0)) * k, bw * 0.85 * k, { side: 1, tilt: f.brow, arch: f.brow > 0.3 ? 0.1 : 0.4, color: c.brow, thick: S.L(sp.browThick || 2.6), seed: 2 });
    tk.mouth(g, lm.mouth[0] * k, lm.mouth[1] * k, lm.mouth[2] * k, f.mouth, { lineW: S.L(1.3), inner: c.mouthIn, tongue: c.tongue });
    if (lm.nose) tk.nose(g, lm.nose[0] * k, lm.nose[1] * k, 46 * k, { skin: c.skin });
    if (sp.faceExtra) sp.faceExtra(S, f);
  }
  function drawFaceStd(S, f) { drawFaceBase(S); drawFaceFeatures(S, f); }
  // the same landmark set with everything below the eyes stretched (bust proportions) and the eyes nudged up
  function stretchLower(pts, from, k) { return pts.map((p) => { const q = [p[0], p[1] > from ? from + (p[1] - from) * k : p[1]]; if (p[2]) q.push(p[2]); return q; }); }
  function bustFace(spec, kk) {
    kk = kk || 1.2;
    spec.skullBust = stretchLower(spec.skull, 6, kk).map((p) => [p[0] * (p[1] > 20 ? 0.94 : 1), p[1]]);
    spec.fringeShadowBust = spec.fringeShadow;
    const L = spec.lm, up = (e) => ({ x: e.x, y: e.y - 3, w: e.w * 1.02, h: e.h * 1.03 }), low = (a) => [a[0], a[1] > 6 ? 6 + (a[1] - 6) * kk : a[1], a[2]];
    spec.lmBust = { eyeN: up(L.eyeN), eyeF: up(L.eyeF), mouth: low(L.mouth), browN: [L.browN[0], L.browN[1] - 3], browF: [L.browF[0], L.browF[1] - 3], browW: L.browW, blushN: low(L.blushN), blushF: low(L.blushF), nose: L.nose ? low([L.nose[0], L.nose[1]]) : null };
  }

  // tapered tube between two y heights at x: limbs, sleeves, handles (round at both ends unless o.flat)
  function tubePts(x, y0, y1, w0, w1, capTop, capBot) {
    const ym = (y0 + y1) / 2, wm = (w0 + w1) / 2 * 1.02;
    const pts = [[x - w0 / 2, y0], [x - wm / 2, ym], [x - w1 / 2, y1]];
    pts.push([x, y1 + w1 * (capBot === undefined ? 0.42 : capBot)]);
    pts.push([x + w1 / 2, y1], [x + wm / 2, ym], [x + w0 / 2, y0]);
    pts.push([x, y0 - w0 * (capTop === undefined ? 0.42 : capTop)]);
    return pts;
  }
  const tube = (S, x, y0, y1, w0, w1, base, o) => S.cel(tubePts(x, y0, y1, w0, w1, o && o.capTop, o && o.capBot), base, o);

  // a five-petal blossom (the hairpin, the tsuba, a fallen petal cluster)
  function blossom(S, cx, cy, r, base, centre, rot, o) {
    const g = S.g;
    for (let i = 0; i < 5; i++) {
      const a = (rot || 0) + i * TAU / 5;
      const px = cx + Math.cos(a) * r * 0.55, py = cy + Math.sin(a) * r * 0.55;
      S.cel(S.ell(px, py, r * 0.52, r * 0.36, 8, a), base, Object.assign({ line: S.L(1.5), depth: r * 0.16, rim: null }, o));
    }
    S.cel(S.ell(cx, cy, r * 0.26, r * 0.26, 8), centre, { line: S.L(1.2), depth: 1, rim: null, shadow: false });
  }

  const petal = tk.petal;

  // Fade-out crescent trail of a moving point pair (blade base and tip), from sampled skeletons: a translucent swoosh between the two paths
  // plus a bright ink-white core along the tip path. o: color, inner (0..1 how far along the blade the inner edge sits), n (samples),
  // span (seconds of history), gain (0..1)
  function sweepTrail(ctx, st, anchorA, anchorB, o) {
    const K = st.K;
    if (!(K.trail > 0.02)) return;
    o = o || {};
    const n = o.n || 15, span = o.span || 0.16, col = o.color || '#ffffff', inner = o.inner === undefined ? 0.5 : o.inner;
    const A = [], B = [];
    for (let i = 0; i < n; i++) {
      const back = span * i / (n - 1);
      if (st.pt - back < 0 && st.pose !== 'idle' && !spec_loop(st.spec, st.pose)) break;
      const Ki = poseState(st.spec, st.pose, st.t - back, Math.max(0, st.pt - back));
      const Mi = evaluate(st.spec, Ki);
      A.push(anchorAt(st.spec, Mi, anchorA)); B.push(anchorAt(st.spec, Mi, anchorB));
    }
    if (A.length < 3) return;
    ctx.save();
    for (let i = 0; i < A.length - 1; i++) {
      const f0 = 1 - i / (A.length - 1);
      const a = [lerp(A[i][0], B[i][0], inner), lerp(A[i][1], B[i][1], inner)], b = [lerp(A[i + 1][0], B[i + 1][0], inner), lerp(A[i + 1][1], B[i + 1][1], inner)];
      ctx.globalAlpha = cA(K.trail * Math.pow(f0, 1.3) * (o.gain === undefined ? 0.6 : o.gain));
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(B[i][0], B[i][1]); ctx.lineTo(B[i + 1][0], B[i + 1][1]); ctx.lineTo(b[0], b[1]); ctx.closePath();
      ctx.fillStyle = f0 > 0.55 ? tk.tint(col, 0.55) : col; ctx.fill();
    }
    ctx.globalAlpha = cA(K.trail * 0.95);
    tk.inkPath(ctx, B.slice().reverse(), { w: 3.4, color: '#ffffff', taperStart: 0.7, taperEnd: 0.05, pressure: 'flat', wobble: 0.04, step: 4 });
    ctx.restore();
  }
  const spec_loop = (spec, pose) => !!(spec.poses[pose] && spec.poses[pose].loop);

  // ===============================================================================================================
  // HANAE, the Blossom Blade
  // ===============================================================================================================
  (() => {
    const c = {
      skin: '#ffe3d2', skinD: '#f2b6b6', blush: '#ff7aa6',
      hair: '#ff7eb6', hairD: '#d2508f', hairB: '#e8629f', hairL: '#ffd6ea',
      tip: '#ffb6d8', tipD: '#e88ab8', iris: ['#7a1244', '#ff6fb0'], irisRing: '#4a0a2c', pupil: '#2a0620', lash: '#2a0a24', brow: '#b0245c',
      mouthIn: '#8a1a3a', tongue: '#ff7fa0',
      rim: '#ffe4f0', aura: '#ff7eb6',
      white: '#fff8f4', whiteD: '#e2c4de', pink: '#ffa9cf', rose: '#d63a6e', roseD: '#8e1a4a', black: '#2b2446', kote: '#a01e44', koteD: '#5c0f28',
      steel: '#e4ecff', steelD: '#9fb0dc', gold: '#f5c96a', wood: '#8a5a3a', woodD: '#5a3820',
    };
    const R = DEFAULT_RIG;
    const W = [R.shF[0], R.shF[1] + R.arm[0] + R.arm[1]];               // wrist of the near arm at rest
    const HC = R.HC;
    const dk = (col) => tk.mix(col, '#6a4a9a', 0.17);                    // far-side tone: pulled toward violet, never grey

    // ------------------------------------------------------------------ head parts (head space: origin at the head centre)
    const skull = [[2, -46], [26, -43], [41, -26], [46, 0], [43, 22], [30, 38], [12, 47], [-6, 46], [-24, 38], [-38, 22], [-44, -2], [-42, -24], [-28, -40]];
    const lm = {
      eyeN: { x: -14, y: 8, w: 27, h: 35 }, eyeF: { x: 26, y: 7, w: 21, h: 33 },
      mouth: [9, 33, 13], browN: [-14, -19], browF: [26, -19], browW: 21,
      blushN: [-25, 24, 15], blushF: [38, 23, 10], nose: [7, 22],
    };
    const fringeShadow = [[-44, -46], [48, -46], [48, -8], [34, -3], [22, -10], [8, -1], [-8, -8], [-22, 2], [-36, -2], [-44, 0]];

    const hairBack = {
      id: 'hairBack', bone: 'head', origin: HC, box: [-66, -90, 70, 58],
      draw(S) {
        const pts = [[-50, -8], [-56, -34], [-44, -60], [-16, -74], [16, -76], [44, -64], [58, -38], [56, -6], [48, 22], [30, 34], [8, 30], [-14, 34], [-38, 38], [-50, 20]];
        S.cel(pts, c.hairB, { shadow: c.hairD, depth: 9, line: S.L(3) });
      },
    };
    const ponytail = {
      id: 'ponytail', bone: 'head', origin: HC, box: [-130, -100, 30, 100],
      chain: { spine: [[-30, -52], [-56, -72], [-86, -58], [-100, -22], [-94, 24], [-82, 62]], cuts: [0.3, 0.55, 0.8], reach: 44, sway: { amp: 0.14, freq: 0.38, phase: 0.1, lag: 0.7, drag: 1.4 } },
      draw(S) {
        const sp = [[-30, -52], [-56, -72], [-86, -58], [-100, -22], [-94, 24], [-82, 62]];
        S.lock(sp, c.hair, { wMax: 30, w0: 14, w1: 0, tipPow: 1.5, shadow: c.hairD, shadowW: 0.6, line: S.L(3), strands: 2, glossAlpha: 0.75, glossColor: c.hairL, tipColor: c.tip, tipShadow: c.tipD, tipFrac: 0.3, halftone: { d: 4.4, alpha: 0.22, color: '#a02c6a' } });
        S.lock([[-40, -60], [-64, -70], [-90, -50], [-100, -18]], c.hair, { wMax: 12, w0: 8, w1: 2, shadow: c.hairD, line: S.L(2), gloss: false, strands: 0 });
      },
    };
    const bow = {
      id: 'bow', bone: 'head', origin: HC, box: [-70, -90, -8, -20],
      chain: { spine: [[-34, -56], [-46, -46], [-54, -36]], cuts: [0.5], reach: 24, sway: { amp: 0.2, freq: 0.5, phase: 0.4, drag: 1.5 } },
      draw(S) {
        const ink = pal.ink;
        S.cel([[-36, -58], [-52, -74], [-62, -66], [-58, -52], [-40, -54]], c.white, { shadow: c.whiteD, depth: 4, line: S.L(1.8) });
        S.cel([[-34, -60], [-44, -80], [-30, -84], [-22, -70]], c.white, { shadow: c.whiteD, depth: 4, line: S.L(1.8) });
        S.lock([[-36, -54], [-46, -44], [-52, -32]], c.white, { wMax: 11, w0: 7, w1: 3, shadow: c.whiteD, line: S.L(1.7), gloss: false, strands: 0 });
        S.cel(S.ell(-36, -58, 6, 6.5, 8), c.pink, { depth: 2, line: S.L(1.7) });
      },
    };
    const face = { id: 'face', bone: 'head', face: true };
    const bangs = {
      id: 'bangs', bone: 'head', origin: HC, box: [-64, -84, 70, 50],
      draw(S) {
        // fringe locks first, their roots tucked under the crown cap drawn last
        const lockOpt = { wMax: 21, w0: 12, w1: 0, tipPow: 1.3, shadow: c.hairD, shadowW: 0.6, line: S.L(2.4), strands: 1, glossAlpha: 0.75, glossColor: c.hairL, tipColor: c.tip, tipShadow: c.tipD, tipFrac: 0.28 };
        S.lock([[-30, -52], [-30, -38], [-22, -20], [-13, -7]], c.hair, Object.assign({}, lockOpt, { wMax: 19 }));
        S.lock([[-6, -56], [-3, -42], [3, -26], [11, -11]], c.hair, lockOpt);
        S.lock([[20, -56], [25, -42], [33, -24], [43, -7]], c.hair, lockOpt);
        S.lock([[38, -50], [50, -34], [54, -14], [50, 8]], c.hair, Object.assign({}, lockOpt, { wMax: 17, strands: 0 }));
        S.lock([[-42, -44], [-46, -26], [-42, -10], [-36, 2]], c.hair, Object.assign({}, lockOpt, { wMax: 12, strands: 0, gloss: false }));
        const cap = [[-46, -6], [-50, -30], [-40, -54], [-18, -67], [10, -71], [34, -63], [50, -40], [54, -8], [46, -34], [30, -46], [10, -50], [-10, -49], [-30, -45], [-42, -32]];
        S.cel(cap, c.hair, { shadow: c.hairD, depth: 9, line: S.L(3), halftone: { d: 4.4, alpha: 0.3, color: '#a02c6a' } });
        // the anime "angel ring": a curved highlight band across the crown
        S.gloss([[-38, -46], [-20, -60], [6, -65], [30, -58], [46, -42]], 7.5, 0.9, c.hairL);
        S.gloss([[-34, -34], [-28, -41]], 3, 0.85, c.hairL);
      },
    };
    const sideN = {
      id: 'sideN', bone: 'head', origin: HC, box: [-70, -24, -10, 70],
      chain: { spine: [[-38, -6], [-45, 14], [-44, 36], [-38, 56]], cuts: [0.5], reach: 24, sway: { amp: 0.1, freq: 0.5, phase: 0.6, drag: 1.2 } },
      draw(S) { S.lock([[-38, -6], [-45, 14], [-44, 36], [-38, 56]], c.hair, { wMax: 15, w0: 11, w1: 0, shadow: c.hairD, line: S.L(2.2), strands: 1 }); },
    };
    const sideF = {
      id: 'sideF', bone: 'head', origin: HC, box: [20, -24, 76, 70],
      chain: { spine: [[46, -6], [52, 12], [51, 32], [46, 50]], cuts: [0.5], reach: 22, sway: { amp: 0.1, freq: 0.5, phase: 0.2, drag: 1.2 } },
      draw(S) { S.lock([[46, -6], [52, 12], [51, 32], [46, 50]], c.hair, { wMax: 13, w0: 10, w1: 0, shadow: c.hairD, line: S.L(2.2), strands: 1 }); },
    };
    const ahoge = {
      id: 'ahoge', bone: 'head', origin: HC, box: [-40, -110, 20, -56],
      chain: { spine: [[-2, -66], [-6, -82], [-16, -94], [-30, -92]], cuts: [0.5], reach: 16, sway: { amp: 0.22, freq: 0.7, phase: 0.3, drag: 1.5 } },
      draw(S) { S.lock([[-2, -66], [-6, -82], [-16, -94], [-30, -92]], c.hair, { wMax: 7, w0: 6, w1: 0, shadow: c.hairD, line: S.L(1.8), gloss: false, strands: 0 }); },
    };
    const pin = {
      id: 'pin', bone: 'head', origin: HC, box: [16, -66, 52, -30],
      draw(S) { blossom(S, 34, -46, 10, c.white, c.gold, 0.3, { shadow: c.whiteD }); },
    };

    // ------------------------------------------------------------------ body
    const kx = R.shF[0], bx = R.shB[0];
    const armSleeve = (S, x, sy, dark) => {
      const base = dark ? dk(c.white) : c.white;
      S.cel([[x - 12, sy + 2], [x - 13, sy + 18], [x - 15, sy + 34], [x + 15, sy + 34], [x + 13, sy + 16], [x + 11, sy + 2], [x, sy - 6]], base, { shadow: c.whiteD, depth: 5, line: S.L(2.2) });
      S.cel([[x - 15, sy + 28], [x + 15, sy + 28], [x + 16, sy + 34], [x - 16, sy + 34]], c.pink, { shadow: c.rose, depth: 3, line: S.L(1.7), rim: null });
    };
    const armLower = (S, x, ty, dark) => {
      tube(S, x, ty - 2, ty + 24, 12.5, 10.5, dark ? dk(c.kote) : c.kote, { shadow: c.koteD, depth: 4, line: S.L(2.0), capTop: 0.1 });
      S.cel([[x - 6, ty + 8], [x + 6, ty + 8], [x + 6, ty + 12], [x - 6, ty + 12]], '#ffd6ea', { line: S.L(1.2), depth: 1, shadow: false, rim: null });
      S.cel(S.ell(x, ty + 30, 7.4, 7.4, 10), dark ? dk(c.skin) : c.skin, { shadow: c.skinD, depth: 3, line: S.L(1.8), rim: null });
    };
    const armParts = [
      { id: 'armB1', bone: 'armB1', box: [bx - 22, -134, bx + 22, -88], draw: (S) => armSleeve(S, bx, -124, true) },
      { id: 'armB2', bone: 'armB2', box: [bx - 16, -104, bx + 16, -56], draw: (S) => armLower(S, bx, -98, true) },
    ];
    const legParts = (tag, hip, dark) => [
      { id: 'leg' + tag + '1', bone: 'leg' + tag + '1', box: [hip[0] - 14, -72, hip[0] + 14, -30], draw: (S) => tube(S, hip[0], -66, hip[1] + 21 - 2, 14.5, 12, dark ? dk(c.skin) : c.skin, { shadow: c.skinD, depth: 4, line: S.L(2.0), capTop: 0.1 }) },
      { id: 'leg' + tag + '2', bone: 'leg' + tag + '2', box: [hip[0] - 12, hip[1] + 18, hip[0] + 12, -8], draw: (S) => tube(S, hip[0], hip[1] + 19, -19, 12, 9.5, dark ? dk(c.skin) : c.skin, { shadow: c.skinD, depth: 4, line: S.L(2.0) }) },
      { id: 'foot' + tag, bone: 'foot' + tag, box: [hip[0] - 16, -32, hip[0] + 28, 4], draw(S) {
        const ax = hip[0], ay = -14;
        // teeth of the geta, plank, then the white tabi with a red strap
        S.cel([[ax - 8, ay + 8], [ax - 2, ay + 8], [ax - 2, ay + 14], [ax - 8, ay + 14]], c.wood, { shadow: c.woodD, depth: 2, line: S.L(1.7), rim: null });
        S.cel([[ax + 10, ay + 8], [ax + 17, ay + 8], [ax + 17, ay + 14], [ax + 10, ay + 14]], c.wood, { shadow: c.woodD, depth: 2, line: S.L(1.7), rim: null });
        S.cel([[ax - 11, ay + 4], [ax + 21, ay + 4], [ax + 22, ay + 8], [ax - 11, ay + 8]], '#b07a4a', { shadow: c.woodD, depth: 2, line: S.L(1.7), rim: null });
        S.cel([[ax - 7, ay - 6], [ax + 4, ay - 8], [ax + 13, ay - 3], [ax + 19, ay + 2], [ax + 17, ay + 5], [ax - 9, ay + 5]], dark ? dk(c.white) : c.white, { shadow: c.whiteD, depth: 3, line: S.L(1.8), rim: null });
        S.line([[ax - 3, ay + 3], [ax + 8, ay - 3], [ax + 14, ay + 1]], { w: 1.6, color: c.rose, taper: 0.2 });
      } },
    ];
    const skirt = {
      id: 'skirt', bone: 'hips', box: [-44, -78, 46, -34], sway: { px: 0, py: -72, amp: 0.05, freq: 0.42, phase: 0.2, drag: 0.5 },
      draw(S) {
        S.cel([[-22, -74], [24, -74], [34, -58], [40, -42], [12, -38], [-8, -40], [-38, -42], [-32, -58]], c.black, { shadow: '#161030', depth: 6, line: S.L(3), halftone: { d: 4, alpha: 0.3, color: '#0a0620' } });
        S.cel([[-38, -42], [-8, -40], [12, -38], [40, -42], [39, -48], [12, -44], [-8, -46], [-37, -48]], c.pink, { shadow: c.rose, depth: 2, line: S.L(1.7), rim: null });
        [[-14, -72, -22, -46], [-2, -72, -3, -44], [10, -72, 16, -44], [20, -70, 30, -46]].forEach((l) => S.line([[l[0], l[1]], [(l[0] + l[2]) / 2, (l[1] + l[3]) / 2], [l[2], l[3]]], { w: 1.2, color: '#6a5a9a', taper: 0.4, alpha: 0.8 }));
      },
    };
    const torso = {
      id: 'torso', bone: 'torso', box: [-40, -142, 40, -60],
      draw(S) {
        tube(S, 2, -140, -128, 13, 14, c.skin, { shadow: c.skinD, depth: 3, line: S.L(1.8), capTop: 0, capBot: 0.05, rim: null });
        // inner kosode and obi
        S.cel([[-16, -128], [2, -132], [18, -126], [21, -100], [19, -84], [-19, -84], [-21, -102]], c.white, { shadow: c.whiteD, depth: 6, line: S.L(2.3) });
        S.cel([[-21, -88], [22, -88], [24, -72], [-23, -71]], c.rose, { shadow: c.roseD, depth: 5, line: S.L(2.3) });
        S.line([[-21, -84], [0, -83], [22, -84]], { w: 1.3, color: c.gold, taper: 0.2, alpha: 0.9 });
        // the short haori: white with a pink hem and petal print
        S.cel([[-24, -122], [-14, -133], [10, -134], [23, -125], [27, -102], [30, -84, 1], [12, -82], [-6, -85], [-26, -82, 1], [-27, -102]], c.white, { shadow: c.whiteD, depth: 7, line: S.L(3) });
        S.cel([[-26, -82], [-6, -85], [12, -82], [30, -84], [30, -92], [12, -91], [-6, -93], [-27, -91]], c.pink, { shadow: c.rose, depth: 3, line: S.L(1.7), rim: null });
        // collar V
        S.cel([[-2, -134], [8, -133], [12, -112], [3, -98], [-4, -112]], c.white, { shadow: c.whiteD, depth: 3, line: S.L(1.8), rim: null });
        S.cel([[-5, -134], [0, -134], [6, -100], [3, -98], [-6, -114]], c.rose, { shadow: c.roseD, depth: 2, line: S.L(1.6), rim: null });
        S.cel([[6, -134], [12, -132], [15, -116], [10, -110]], c.rose, { shadow: c.roseD, depth: 2, line: S.L(1.6), rim: null });
        [[-16, -110], [-8, -100], [14, -102], [20, -112], [-18, -122]].forEach((p, i) => blossom(S, p[0], p[1], 3.6, i % 2 ? '#ffc2dc' : '#ff9cc6', c.gold, i, { line: S.L(1), depth: 0.5, shadow: false, rim: null }));
      },
    };
    const obiTail = {
      id: 'obiTail', bone: 'torso', origin: [0, 0], box: [-64, -100, -6, -30],
      chain: { spine: [[-24, -78], [-34, -66], [-40, -50], [-42, -36]], cuts: [0.5], reach: 22, sway: { amp: 0.16, freq: 0.5, phase: 0.7, drag: 1.4 } },
      draw(S) {
        S.lock([[-24, -78], [-34, -66], [-40, -50], [-42, -36]], c.rose, { wMax: 12, w0: 9, w1: 7, cap: 'flat', tipPow: 1, shadow: c.roseD, line: S.L(2.2), gloss: false, strands: 0, rim: null });
        S.lock([[-22, -76], [-28, -62], [-27, -46]], c.rose, { wMax: 10, w0: 7, w1: 5, cap: 'flat', tipPow: 1, shadow: c.roseD, line: S.L(2.2), gloss: false, strands: 0, rim: null });
        S.cel([[-18, -86], [-32, -100], [-46, -94], [-46, -80], [-32, -74]], c.rose, { shadow: c.roseD, depth: 4, line: S.L(2.4), rim: null });
        S.cel(S.ell(-24, -82, 6, 6, 8), c.roseD, { depth: 1.5, line: S.L(2), shadow: false, rim: null });
      },
    };
    const saya = {
      id: 'saya', bone: 'hips', box: [-58, -100, 30, -30],
      draw(S) {
        S.cel(tk.xf(tubePts(0, 0, 57, 9, 7.5, 0.3, 0.5), { rot: 0.885, dx: 6, dy: -86 }), c.black, { shadow: '#161030', depth: 3, line: S.L(2.2), rim: '#8a7ac8' });
        S.cel(S.ell(6, -86, 6, 5, 8), c.gold, { depth: 2, line: S.L(1.7), rim: null });
        S.line([[-30, -56], [-22, -60], [-14, -70]], { w: 2, color: c.pink, taper: 0.1 });
      },
    };
    const weapon = {
      id: 'weapon', bone: 'weapon', box: [W[0] - 18, W[1] - 124, W[0] + 18, W[1] + 26],
      draw(S) {
        const g = S.g;
        g.translate(W[0], W[1]);
        // blade
        S.cel([[-3.6, -20], [3.8, -20], [4.2, -56], [4.5, -90], [7.5, -114, 1], [-1, -100], [-3.4, -66]], c.steel, { shadow: c.steelD, depth: 3.2, line: S.L(2.0), rim: '#ffffff', rimW: 1 });
        S.line([[-1.5, -30], [0.5, -52], [-0.5, -76], [2.5, -100]], { w: 1, color: '#ffffff', taper: 0.3, alpha: 0.85 });
        S.gloss([[2, -26], [3, -56], [3.4, -86]], 1.6, 0.9, '#ffffff');
        // habaki, tsuba, handle
        S.cel([[-4.6, -23], [4.8, -23], [4.8, -19], [-4.6, -19]], c.gold, { depth: 1, line: S.L(1.5), rim: null });
        blossom(S, 0, -16, 10.5, '#ffd6ea', c.gold, 0.2, { shadow: '#e59ac0', rim: null });
        S.cel([[-4.2, -12], [4.2, -12], [4.6, 15], [-4.6, 15]], c.rose, { shadow: c.roseD, depth: 2, line: S.L(1.8), rim: null, tension: 0.2 });
        S.line([[-4, -8], [4, 0], [-4, 8]], { w: 1.1, color: '#ffffff', taper: 0.2, alpha: 0.9 });
        S.line([[4, -8], [-4, 0], [4, 8]], { w: 1.1, color: '#ffffff', taper: 0.2, alpha: 0.9 });
        S.cel(S.ell(0, 17, 5.4, 4, 8), c.gold, { depth: 1.5, line: S.L(1.7), rim: null });
      },
    };
    const fingers = {
      id: 'fingers', bone: 'weapon', box: [W[0] - 14, W[1] - 16, W[0] + 14, W[1] + 14],
      draw(S) {
        S.g.translate(W[0], W[1]);
        S.cel([[-8, -8], [8, -8], [9, 6], [0, 10], [-9, 6]], c.skin, { shadow: c.skinD, depth: 3, line: S.L(1.8), rim: null });
        [-3.4, 0, 3.4].forEach((y) => S.line([[-8, y - 1], [0, y + 1.6], [8, y - 1]], { w: 1, color: c.skinD, taper: 0.3 }));
        S.cel(S.ell(-8.5, -4, 3, 2.6, 6), c.skin, { depth: 1, line: S.L(1.5), rim: null, shadow: false });
      },
    };

    // ------------------------------------------------------------------ live fx
    const fx = [
      { id: 'auraBack', bone: 'root', live(ctx, st) {
        const K = st.K;
        if (K.glow > 0.02) tk.glow(ctx, 6, -130, 110, '#ff7eb6', 0.5 * K.glow);
      } },
      { id: 'trail', bone: 'root', live(ctx, st) { sweepTrail(ctx, st, 'bladeMid', 'tip', { color: '#ffb0d4', span: 0.11, inner: 0.72, gain: 0.8, n: 12 }); } },
      { id: 'petals', bone: 'root', live(ctx, st) {
        const t = st.t, K = st.K, m = st.motion;
        // idle: two petals wandering near her; attack: a spray from the blade; cast: a spiral
        for (let i = 0; i < 3; i++) {
          const ph = (t * 0.16 + i * 0.37) % 1, x = 40 - ph * 150 + Math.sin(t * 1.3 + i * 2) * 14, y = -210 + ph * 200 + Math.sin(t * 2 + i) * 8;
          petal(ctx, x, y, 4.2 + i * 0.5, t * 1.4 + i, Math.sin(ph * PI) * 0.9 * m, i % 2 ? '#ffc2dc' : '#ff9cc6');
        }
        if (K.power > 0.05) {
          const n = 12;
          for (let i = 0; i < n; i++) {
            const seed = tk.vary('hanae', 'p' + i), u = clamp(st.p * 1.3 - seed * 0.5, 0, 1);
            if (u <= 0 || u >= 1) continue;
            const tp = st.at('tip'), a = seed * TAU + u * 5.5, r = 12 + u * 55 * (0.5 + seed);
            petal(ctx, tp[0] + Math.cos(a) * r * (st.pose === 'cast' ? 1.4 : 0.8), tp[1] + Math.sin(a) * r * 0.9 + u * 22, 4 + seed * 3, a + u * 6, (1 - u) * K.power, seed > 0.5 ? '#ffc2dc' : '#ff9cc6');
          }
        }
      } },
      { id: 'glint', bone: 'root', live(ctx, st) {
        const ph = (st.t % 4.2) / 4.2;
        if (ph < 0.22) { const tp = st.at('bladeMid'), tt = st.at('tip'), u = ph / 0.22, k = Math.sin(u * PI); tk.sparkle(ctx, lerp(tp[0], tt[0], u), lerp(tp[1], tt[1], u), 7 * k, { color: '#ffffff' }); }
      } },
    ];

    // ------------------------------------------------------------------ poses
    const mono = (o) => ({ frames: [[0, o]] });
    const spec = defineHero({
      id: 'hanae', col: c, rig: {}, lm, skull, fringeShadow, faceBox: [-64, -64, 68, 66],
      drawFace: drawFaceStd, wing: 0.6, lash: 1.05,
      base: { blush: 1 },
      anchors: {
        head: ['head', [HC[0], HC[1]]], hand: ['weapon', [W[0], W[1] + 2]], tip: ['weapon', [W[0], W[1] - 112]], bladeMid: ['weapon', [W[0], W[1] - 56]],
        chest: ['torso', [0, -104]], feet: ['root', [0, 0]], weapon: ['weapon', [W[0], W[1] - 112]],
      },
      parts: [
        ponytail, hairBack, bow, saya, obiTail, fx[0],
        armParts[0], armParts[1],
        ...legParts('B', R.hipB, true), ...legParts('F', R.hipF, false),
        skirt, torso, face, bangs, sideN, sideF, ahoge, pin,
        { id: 'armF1', bone: 'armF1', box: [kx - 22, -134, kx + 22, -88], draw: (S) => armSleeve(S, kx, -124, false) },
        { id: 'armF2', bone: 'armF2', box: [kx - 16, -104, kx + 16, -56], draw: (S) => armLower(S, kx, -98, false) },
        weapon, fingers, fx[1], fx[2], fx[3],
      ],
      poses: {
        idle: { frames: [[0, { hx: 16, hy: 44, wa: 1.05, bhx: -4, bhy: 46, torsoRot: 0.04, headRot: 0.0 }]] },
        attack: { ease: 'inOutSine', frames: [
          [0.00, { hx: 16, hy: 44, wa: 1.05, bhx: -4, bhy: 46, torsoRot: 0.04 }],
          [0.20, { bx: -9, brot: -0.10, torsoRot: -0.22, headRot: 0.10, hipsDy: 9, hx: -8, hy: -46, wa: -0.55, bhx: -12, bhy: 30, fx: -18, bfx: 18, eyes: 'determined', mouth: 'flat', brow: 0.5, power: 0.3, wind: 1.4 }],
          [0.36, { bx: 20, brot: 0.15, torsoRot: 0.30, headRot: -0.10, hipsDy: 11, hx: 46, hy: -6, wa: 1.7, bhx: -14, bhy: 34, fx: -16, bfx: 28, eyes: 'angry', mouth: 'shout', brow: 0.8, power: 1, trail: 1, wind: 3 }],
          [0.58, { bx: 28, brot: 0.12, torsoRot: 0.24, hipsDy: 9, hx: 44, hy: 16, wa: 2.15, bhx: -10, bhy: 40, fx: -14, bfx: 30, eyes: 'determined', mouth: 'grin', brow: 0.4, power: 0.5, trail: 0.7, wind: 2 }],
          [1.00, { bx: 4, brot: 0.03, torsoRot: 0.06, hipsDy: 5, hx: 16, hy: 44, wa: 1.1, bhx: -4, bhy: 46, fx: -12, bfx: 15, trail: 0 }],
        ] },
        cast: { frames: [
          [0.00, { hx: 16, hy: 44, wa: 1.05, bhx: -4, bhy: 46, torsoRot: 0.04 }],
          [0.32, { bx: -4, hipsDy: 9, torsoRot: -0.08, headRot: 0.05, hx: 24, hy: 34, wa: 1.4, bhx: 10, bhy: 30, eyes: 'closed', mouth: 'flat', brow: -0.2, glow: 0.5, power: 0.4, fx: -14, bfx: 18, wind: 1.6 }],
          [0.62, { bx: 5, hipsDy: 3, brot: 0.03, torsoRot: 0.05, headRot: -0.06, hx: 30, hy: 20, wa: 1.25, bhx: 44, bhy: -12, eyes: 'determined', mouth: 'open', brow: 0.3, glow: 1, power: 1, wind: 2.6 }],
          [1.00, { bx: 5, hipsDy: 4, torsoRot: 0.05, hx: 30, hy: 22, wa: 1.25, bhx: 44, bhy: -10, eyes: 'determined', mouth: 'smile', glow: 0.7, power: 0.6, wind: 2 }],
        ] },
        hurt: { ease: 'outQuad', frames: [
          [0.00, { hx: 16, hy: 44, wa: 1.05, bhx: -4, bhy: 46 }],
          [0.25, { bx: -15, brot: -0.24, torsoRot: -0.30, headRot: -0.20, hipsDy: 2, hx: -4, hy: 34, bhx: -16, bhy: 30, wa: 0.3, fx: -20, bfx: 6, eyes: 'hurt', mouth: 'open', brow: -0.5, wind: 2.8 }],
          [0.60, { bx: -9, brot: -0.14, torsoRot: -0.15, headRot: -0.1, hipsDy: 4, hx: 6, hy: 40, wa: 0.7, eyes: 'hurt', mouth: 'open', brow: -0.4, wind: 2 }],
          [1.00, { bx: -3, brot: -0.05, torsoRot: -0.03, hx: 14, hy: 44, wa: 1.0, eyes: 'half', mouth: 'flat', brow: 0.2 }],
        ] },
        block: { frames: [
          [0.00, { hx: 16, hy: 44, wa: 1.05, bhx: -4, bhy: 46 }],
          [0.40, { bx: -3, brot: -0.05, hipsDy: 10, torsoRot: 0.05, hx: 14, hy: 8, wa: 0.85, bhx: 24, bhy: 6, fx: -16, bfx: 20, eyes: 'determined', mouth: 'grit', brow: 0.8, power: 0.5, wind: 1.8 }],
          [1.00, { bx: -3, brot: -0.05, hipsDy: 10, torsoRot: 0.05, hx: 14, hy: 8, wa: 0.85, bhx: 24, bhy: 6, fx: -16, bfx: 20, eyes: 'determined', mouth: 'grit', brow: 0.8, power: 0.5, wind: 1.4 }],
        ] },
        down: { ease: 'outQuad', frames: [
          [0.00, { hx: 16, hy: 44, wa: 1.05, bhx: -4, bhy: 46 }],
          [0.45, { bx: 4, brot: 0.04, hipsDy: 30, torsoRot: 0.22, headRot: 0.32, hx: 22, hy: 30, wa: 2.1, bhx: 12, bhy: 34, fx: -12, bfx: 18, eyes: 'closed', mouth: 'flat', brow: -0.3, wind: 2 }],
          [1.00, { bx: 5, brot: 0.05, hipsDy: 35, torsoRot: 0.28, headRot: 0.42, hx: 22, hy: 30, wa: 2.1, bhx: 12, bhy: 34, fx: -12, bfx: 18, eyes: 'closed', mouth: 'flat', brow: -0.4, wind: 0.8 }],
        ] },
        cheer: { frames: [
          [0.00, { hx: 16, hy: 44, wa: 1.05, bhx: -4, bhy: 46 }],
          [0.22, { hipsDy: 14, torsoRot: -0.06, hx: 6, hy: 36, wa: 0.5, bhx: 0, bhy: 40, fx: -14, bfx: 16, eyes: 'happy', mouth: 'smile', blush: 1 }],
          [0.45, { by: -30, hipsDy: -4, hx: -36, hy: -34, wa: -0.35, bhx: 44, bhy: -34, fx: -12, fy: -30, bfx: 12, bfy: -34, eyes: 'happy', mouth: 'grin', blush: 1, wind: 3, glow: 0.5 }],
          [0.72, { hipsDy: 9, hx: -34, hy: -30, wa: -0.3, bhx: 42, bhy: -30, eyes: 'happy', mouth: 'grin', blush: 1, wind: 2 }],
          [1.00, { hipsDy: 3, hx: -34, hy: -32, wa: -0.28, bhx: 44, bhy: -30, torsoRot: -0.05, eyes: 'happy', mouth: 'grin', blush: 1, glow: 0.3 }],
        ] },
        walk: { loop: 0.9, ease: 'inOutSine', frames: [
          [0.00, { fx: -26, bfx: 22, by: 0, hipsDy: 6, hx: 8, hy: 24, wa: -0.3, bhx: -2, bhy: 46, torsoRot: 0.08, brot: 0.03 }],
          [0.25, { fx: -8, fy: -30, bfx: 8, by: -4, hipsDy: 3, hx: 8, hy: 24, wa: -0.3, bhx: -6, bhy: 46, torsoRot: 0.08, brot: 0.03 }],
          [0.50, { fx: 22, bfx: -26, by: 0, hipsDy: 6, hx: 8, hy: 24, wa: -0.3, bhx: 4, bhy: 46, torsoRot: 0.08, brot: 0.03 }],
          [0.75, { fx: 8, bfx: -8, bfy: -30, by: -4, hipsDy: 3, hx: 8, hy: 24, wa: -0.3, bhx: 0, bhy: 46, torsoRot: 0.08, brot: 0.03 }],
          [1.00, { fx: -26, bfx: 22, by: 0, hipsDy: 6, hx: 8, hy: 24, wa: -0.3, bhx: -2, bhy: 46, torsoRot: 0.08, brot: 0.03 }],
        ], still: true },
      },
      bounds: { w: 130, h: 250, head: { x: 4, y: -186 }, hand: { x: 8, y: -80 }, feet: { x: 0, y: 0 }, weapon: { x: 84, y: -124 } },
    });
    bustFace(spec);
    void spec; void mono;
  })();

  // ===============================================================================================================
  // KURO, the Inkweaver
  // ===============================================================================================================
  (() => {
    const c = {
      skin: '#fbe6d8', skinD: '#e2b4b8', blush: '#ff9ab8',
      hair: '#2f2966', hairD: '#161040', hairB: '#211b52', hairL: '#8f86ff', tip: '#5ff5ff', tipD: '#22b4d0',
      iris: ['#3a2a9a', '#b0a4ff'], irisRing: '#150a4a', pupil: '#0a0630', lash: '#0d0826', brow: '#1a1445',
      mouthIn: '#5a1030', tongue: '#e0708c',
      rim: '#9af6ff', aura: '#7a6bff',
      coat: '#2b2678', coatD: '#141040', coatL: '#5654c8', trim: '#5ff5ff', gold: '#f5c96a', paper: '#f3e6c8', paperD: '#cbb98f',
      shaft: '#2a1f52', shaftD: '#150f30', boot: '#181236', glass: '#5ff5ff',
    };
    const R = Object.assign({}, DEFAULT_RIG, { shF: [-9, -124], shB: [11, -126] });
    const W = [R.shF[0], R.shF[1] + R.arm[0] + R.arm[1]];
    const HC = R.HC;
    const dk = (col) => tk.mix(col, '#3a2a8a', 0.2);

    const skull = [[2, -45], [24, -42], [38, -24], [43, 0], [40, 22], [28, 38], [12, 46], [-4, 45], [-22, 37], [-36, 22], [-42, -2], [-40, -24], [-26, -40]];
    const lm = {
      eyeN: { x: -14, y: 9, w: 25, h: 32 }, eyeF: { x: 25, y: 8, w: 19, h: 30 },
      mouth: [9, 32, 12], browN: [-14, -17], browF: [25, -17], browW: 20,
      blushN: [-24, 24, 13], blushF: [36, 22, 9], nose: [7, 22],
    };
    const fringeShadow = [[-44, -46], [46, -46], [46, -6], [30, -2], [14, -8], [-4, 0], [-20, -8], [-44, 0]];

    // hair: messy indigo with cyan-dipped tips
    const strand = (S, spine, w, base, opt) => S.lock(spine, base, Object.assign({ wMax: w, w0: w * 0.7, w1: 0, tipPow: 1.25, shadow: c.hairD, shadowW: 0.6, line: S.L(2.5), strands: 0, glossAlpha: 0.65, glossColor: c.hairL, tipColor: c.tip, tipShadow: c.tipD, tipFrac: 0.3 }, opt));
    const hairBack = {
      id: 'hairBack', bone: 'head', origin: HC, box: [-80, -100, 74, 60],
      draw(S) {
        strand(S, [[-38, -10], [-56, 8], [-62, 34], [-58, 52]], 13, c.hair);
        strand(S, [[-40, -24], [-60, -30], [-76, -22]], 14, c.hair);
        strand(S, [[-34, -42], [-52, -56], [-68, -58]], 14, c.hair);
        strand(S, [[-10, -62], [-18, -80], [-14, -98]], 13, c.hair);
        strand(S, [[40, -50], [58, -60], [70, -54]], 12, c.hair);
        S.cel([[-44, -10], [-52, -36], [-40, -60], [-14, -72], [16, -74], [42, -62], [54, -34], [50, -4], [40, 20], [20, 12], [-4, 18], [-28, 20], [-46, 8]], c.hairB, { shadow: c.hairD, depth: 8, line: S.L(3) });
      },
    };
    const face = { id: 'face', bone: 'head', face: true };
    const bangs = {
      id: 'bangs', bone: 'head', origin: HC, box: [-64, -84, 70, 50],
      draw(S) {
        strand(S, [[-30, -52], [-30, -38], [-22, -20], [-14, -6]], 20, c.hair, { tipFrac: 0.26 });
        strand(S, [[-6, -56], [-2, -42], [6, -26], [16, -10]], 22, c.hair, { tipFrac: 0.26 });
        strand(S, [[20, -56], [26, -42], [33, -24], [39, -10]], 20, c.hair, { tipFrac: 0.26 });
        strand(S, [[38, -50], [48, -36], [50, -16], [46, 2]], 17, c.hair, { tipFrac: 0.26, strands: 0 });
        const cap = [[-46, -6], [-50, -30], [-40, -54], [-18, -67], [10, -71], [34, -63], [50, -40], [54, -8], [46, -34], [30, -46], [10, -50], [-10, -49], [-30, -45], [-42, -32]];
        S.cel(cap, c.hair, { shadow: c.hairD, depth: 9, line: S.L(3), halftone: { d: 4.4, alpha: 0.3, color: '#05031a' } });
        S.gloss([[-38, -46], [-20, -60], [6, -65], [30, -58], [46, -42]], 7, 0.75, c.hairL);
      },
    };
    const sideN = {
      id: 'sideN', bone: 'head', origin: HC, box: [-74, -24, -6, 96],
      chain: { spine: [[-38, -6], [-46, 18], [-46, 44], [-40, 74]], cuts: [0.4, 0.72], reach: 24, sway: { amp: 0.1, freq: 0.42, phase: 0.6, drag: 1.2 } },
      draw(S) {
        S.lock([[-38, -6], [-46, 18], [-46, 44], [-40, 74]], c.hair, { wMax: 17, w0: 11, w1: 0, shadow: c.hairD, line: S.L(2.2), strands: 1, glossColor: c.hairL, tipColor: c.tip, tipShadow: c.tipD, tipFrac: 0.3 });
        
      },
    };
    const sideF = {
      id: 'sideF', bone: 'head', origin: HC, box: [16, -24, 74, 60],
      chain: { spine: [[44, -6], [50, 12], [49, 30], [44, 46]], cuts: [0.5], reach: 20, sway: { amp: 0.1, freq: 0.5, phase: 0.2, drag: 1.2 } },
      draw(S) { S.lock([[44, -6], [50, 12], [49, 30], [44, 46]], c.hair, { wMax: 12, w0: 9, w1: 0, shadow: c.hairD, line: S.L(2.0), strands: 0 }); },
    };
    const fringeCurl = {
      id: 'ahoge', bone: 'head', origin: HC, box: [-30, -100, 40, -56],
      chain: { spine: [[12, -66], [20, -82], [16, -94], [4, -98]], cuts: [0.5], reach: 14, sway: { amp: 0.2, freq: 0.6, phase: 0.1, drag: 1.4 } },
      draw(S) { S.lock([[12, -66], [20, -82], [16, -94], [4, -98]], c.hair, { wMax: 6, w0: 6, w1: 0, shadow: c.hairD, line: S.L(1.7), gloss: false, strands: 0 }); },
    };
    const faceExtra = (S, f) => {
      // round glasses with a glint
      const g = S.g, k = S.k, L = S.bust && S.spec.lmBust ? S.spec.lmBust : lm, en = L.eyeN, ef = L.eyeF;
      const ring = (e, r, ry) => {
        const pts = S.ell(e.x + 1, e.y + 1, r, ry, 16);
        g.beginPath(); tk.trace(g, S.P(pts)); g.fillStyle = tk.rgba(c.glass, 0.13); g.fill();
        tk.inkPath(g, S.P(pts), { closed: true, w: S.L(2.0), color: '#2a2058', align: 0, weightVar: 0.5 });
        tk.inkPath(g, S.P(pts), { closed: true, w: S.L(0.9), color: c.glass, align: -0.2, alpha: 0.9, weightVar: 0 });
      };
      ring(en, 19, 21); ring(ef, 16, 19);
      tk.inkPath(g, S.P([[en.x + 19, en.y - 2], [(en.x + ef.x) / 2 + 2, en.y - 5], [ef.x - 16, ef.y - 2]]), { w: S.L(1.7), color: '#2a2058', taper: 0.2 });
      tk.inkPath(g, S.P([[en.x - 19, en.y - 4], [en.x - 34, en.y - 8]]), { w: S.L(1.5), color: '#2a2058', taper: 0.3 });
      [[en, 19, 21], [ef, 16, 19]].forEach(([e, r]) => {
        tk.inkPath(g, S.P([[e.x - r * 0.5, e.y - r * 0.55], [e.x + r * 0.05, e.y - r * 0.95]]), { w: S.L(1.8), color: '#ffffff', alpha: 0.85, taper: 0.4, wobble: 0 });
        tk.inkPath(g, S.P([[e.x - r * 0.72, e.y - r * 0.15], [e.x - r * 0.6, e.y + r * 0.25]]), { w: S.L(1.3), color: '#ffffff', alpha: 0.6, taper: 0.4, wobble: 0 });
      });
    };

    // ------------------------------------------------------------------ body
    const kx = R.shF[0], bx = R.shB[0];
    const armUpper = (S, x, sy, dark) => {
      const base = dark ? dk(c.coat) : c.coat;
      S.cel([[x - 12, sy + 2], [x - 13, sy + 20], [x - 14, sy + 34], [x + 14, sy + 34], [x + 13, sy + 20], [x + 11, sy + 2], [x, sy - 6]], base, { shadow: c.coatD, depth: 5, line: S.L(2.2), halftone: { d: 4, alpha: 0.35, color: '#05031a' } });
      S.line([[x - 12, sy + 32], [x, sy + 34], [x + 12, sy + 32]], { w: 1.4, color: c.trim, taper: 0.2, alpha: 0.9 });
    };
    const armLower = (S, x, ty, dark) => {
      const base = dark ? dk(c.coat) : c.coat;
      // trumpet cuff sleeve
      S.cel([[x - 8, ty - 2], [x - 12, ty + 12], [x - 16, ty + 24], [x + 16, ty + 24], [x + 12, ty + 12], [x + 8, ty - 2], [x, ty - 5]], base, { shadow: c.coatD, depth: 5, line: S.L(2.2), halftone: { d: 4, alpha: 0.35, color: '#05031a' } });
      S.cel([[x - 16, ty + 19], [x + 16, ty + 19], [x + 17, ty + 25], [x - 17, ty + 25]], c.coatL, { shadow: c.coat, depth: 2, line: S.L(1.7), rim: null });
      S.line([[x - 15, ty + 22], [x + 15, ty + 22]], { w: 1.3, color: c.trim, taper: 0.1 });
      S.cel(S.ell(x + 1, ty + 31, 7, 7.4, 10), dark ? dk(c.skin) : c.skin, { shadow: c.skinD, depth: 3, line: S.L(1.8), rim: null });
      // the glowing calligraphy on the back of the hand
      S.line([[x - 2, ty + 28], [x + 3, ty + 30], [x - 1, ty + 34], [x + 4, ty + 35]], { w: 1.4, color: c.trim, taper: 0.2 });
    };
    const legParts = (tag, hip, dark) => [
      { id: 'leg' + tag + '1', bone: 'leg' + tag + '1', box: [hip[0] - 14, -72, hip[0] + 14, -30], draw: (S) => tube(S, hip[0], -66, hip[1] + 19, 14, 12, dark ? dk('#2a2260') : '#2a2260', { shadow: '#13103a', depth: 4, line: S.L(2.0), capTop: 0.1 }) },
      { id: 'leg' + tag + '2', bone: 'leg' + tag + '2', box: [hip[0] - 12, hip[1] + 18, hip[0] + 12, -8], draw: (S) => tube(S, hip[0], hip[1] + 19, -19, 12, 10, dark ? dk('#2a2260') : '#2a2260', { shadow: '#13103a', depth: 4, line: S.L(2.0) }) },
      { id: 'foot' + tag, bone: 'foot' + tag, box: [hip[0] - 16, -34, hip[0] + 28, 4], draw(S) {
        const ax = hip[0], ay = -14;
        S.cel([[ax - 8, ay - 10], [ax + 5, ay - 10], [ax + 14, ay - 2], [ax + 20, ay + 6], [ax + 20, ay + 14], [ax - 9, ay + 14]], dark ? dk(c.boot) : c.boot, { shadow: '#0a0620', depth: 3, line: S.L(2.0), rim: '#7a6bff' });
        S.cel([[ax - 9, ay + 10], [ax + 20, ay + 10], [ax + 21, ay + 14], [ax - 9, ay + 14]], '#0a0620', { shadow: false, depth: 1, line: S.L(1.6), rim: null });
        S.line([[ax - 7, ay - 4], [ax + 6, ay - 6]], { w: 1.6, color: c.trim, taper: 0.2 });
      } },
    ];
    const coatFront = {
      id: 'coatFront', bone: 'hips', box: [-46, -84, 50, -22], sway: { px: 0, py: -76, amp: 0.045, freq: 0.4, phase: 0.1, drag: 0.6 },
      draw(S) {
        S.cel([[-26, -78], [26, -78], [34, -58], [40, -36], [30, -24], [12, -26], [2, -34], [-8, -24], [-30, -26], [-40, -34], [-34, -58]], c.coat, { shadow: c.coatD, depth: 7, line: S.L(3), halftone: { d: 4.2, alpha: 0.36, color: '#05031a' } });
        // ink-splash hem
        [[-30, -30, 4], [-6, -30, 5], [16, -28, 4.5], [34, -33, 3.6]].forEach((b, i) => tk.inkBlot(S.g, b[0], b[1], b[2], { color: i % 2 ? '#ffffff' : c.trim, seed: i + 2, drips: 1, n: 9, jag: 0.4 }));
        S.line([[-34, -34], [-20, -30], [-4, -34], [10, -30], [26, -34], [38, -36]], { w: 1.4, color: c.trim, taper: 0.1, alpha: 0.9 });
        S.line([[0, -76], [3, -50], [2, -30]], { w: 1.4, color: '#3a3a8a', taper: 0.4 });
      },
    };
    const coatTail = {
      id: 'coatTail', bone: 'hips', box: [-96, -100, 0, 30],
      chain: { spine: [[-14, -74], [-32, -62], [-46, -40], [-52, -14]], cuts: [0.4, 0.72], reach: 32, sway: { amp: 0.16, freq: 0.36, phase: 0.3, drag: 1.6 } },
      draw(S) {
        S.lock([[-14, -74], [-32, -62], [-46, -40], [-52, -14]], c.coat, { wMax: 34, w0: 22, w1: 14, cap: 'flat', tipPow: 1, shadow: c.coatD, shadowW: 0.6, line: S.L(3), gloss: false, strands: 0, halftone: { d: 4.2, alpha: 0.34, color: '#05031a' } });
        [[-50, -20, 4.6], [-44, -10, 3.4]].forEach((b, i) => tk.inkBlot(S.g, b[0], b[1], b[2], { color: i % 2 ? '#ffffff' : c.trim, seed: i + 7, drips: 1, n: 9, jag: 0.4 }));
      },
    };
    const scroll = {
      id: 'scroll', bone: 'torso', box: [4, -100, 76, -20],
      chain: { spine: [[24, -84], [34, -76], [42, -62], [44, -44]], cuts: [0.4, 0.72], reach: 20, sway: { amp: 0.24, freq: 0.5, phase: 0.8, drag: 1.5, gain: [0.5, 1.1, 1.7] } },
      draw(S) {
        S.lock([[24, -84], [34, -76], [42, -62], [44, -44]], '#f8eed2', { wMax: 15, w0: 12, w1: 12, cap: 'flat', tipPow: 1, shadow: '#d2bd8e', shadowW: 0.5, line: S.L(2), gloss: false, strands: 0, rim: null, tipColor: '#e8383d', tipShadow: '#a01c34', tipFrac: 0.12 });
        [[28, -80, 33, -75], [34, -72, 39, -66], [38, -62, 41, -54], [40, -54, 42, -47]].forEach((l) => S.line([[l[0], l[1]], [l[2], l[3]]], { w: 1.5, color: '#2a2058', taper: 0.3 }));
        // the rolled scroll at his belt
        S.cel([[14, -90], [30, -90], [32, -80], [16, -80]], '#f8eed2', { shadow: '#d2bd8e', depth: 3, line: S.L(2), rim: null, tension: 0.4 });
        S.cel(S.ell(15, -85, 3.4, 5.6, 8), '#e6d3a3', { shadow: false, depth: 1, line: S.L(1.8), rim: null });
        S.cel([[22, -90], [26, -90], [26, -80], [22, -80]], c.trim, { shadow: false, depth: 1, line: S.L(1.4), rim: null, tension: 0.2 });
      },
    };
    const torso = {
      id: 'torso', bone: 'torso', box: [-42, -156, 44, -60],
      draw(S) {
        tube(S, 2, -142, -126, 12, 13, c.skin, { shadow: c.skinD, depth: 3, line: S.L(1.8), capTop: 0, capBot: 0.05, rim: null });
        // paper-white shirt, coat body, belt
        S.cel([[-12, -132], [2, -134], [16, -130], [18, -100], [16, -80], [-16, -80], [-16, -102]], c.paper, { shadow: c.paperD, depth: 6, line: S.L(2.2) });
        S.cel([[-22, -124], [-12, -132], [-4, -131], [-8, -110], [-6, -84], [-14, -78], [-26, -80], [-28, -102]], c.coat, { shadow: c.coatD, depth: 6, line: S.L(3), halftone: { d: 4, alpha: 0.35, color: '#05031a' } });
        S.cel([[6, -131], [14, -132], [24, -124], [28, -102], [26, -80], [16, -78], [10, -84], [8, -110]], c.coat, { shadow: c.coatD, depth: 6, line: S.L(3), halftone: { d: 4, alpha: 0.35, color: '#05031a' } });
        S.cel([[-26, -86], [26, -86], [27, -76], [-27, -76]], '#0d0a26', { shadow: false, depth: 2, line: S.L(2.2), rim: '#7a6bff' });
        S.cel([[-3, -87], [5, -87], [5, -76], [-3, -76]], c.gold, { depth: 1.5, line: S.L(1.5), rim: null });
        S.line([[-26, -80], [-8, -80]], { w: 1.2, color: c.trim, taper: 0.2 });
        // high collar
        S.cel([[-14, -128], [-16, -146], [-6, -152], [4, -148], [4, -132], [-6, -126]], c.coat, { shadow: c.coatD, depth: 4, line: S.L(2.3), halftone: { d: 4, alpha: 0.3, color: '#05031a' } });
        S.cel([[8, -132], [10, -150], [20, -148], [26, -138], [22, -126], [14, -124]], c.coat, { shadow: c.coatD, depth: 4, line: S.L(2.3), halftone: { d: 4, alpha: 0.3, color: '#05031a' } });
        S.line([[-15, -142], [-6, -148], [4, -144]], { w: 1.3, color: c.trim, taper: 0.2 });
        S.line([[10, -145], [18, -144], [24, -136]], { w: 1.3, color: c.trim, taper: 0.2 });
        // drips of cyan ink down the chest
        S.line([[-10, -118], [-9, -108], [-11, -96]], { w: 1.3, color: c.trim, taper: 0.4, alpha: 0.8 });
      },
    };
    const weapon = {
      id: 'weapon', bone: 'weapon', box: [W[0] - 30, W[1] - 218, W[0] + 30, W[1] + 44],
      draw(S) {
        S.g.translate(W[0], W[1]);
        // the shaft with gold bands and glowing runes
        S.cel([[-3.6, 36], [3.6, 36], [3.4, -150], [-3.4, -150]], c.shaft, { shadow: c.shaftD, depth: 2.4, line: S.L(2.0), rim: '#7a6bff', rimW: 1, tension: 0.15 });
        [-110, -70, -30, 8].forEach((y) => S.cel([[-4.6, y], [4.6, y], [4.6, y + 4], [-4.6, y + 4]], c.gold, { depth: 1, line: S.L(1.6), rim: null }));
        [-90, -50, -12, 20].forEach((y) => S.line([[-1.4, y], [1.4, y + 6]], { w: 1.2, color: c.trim, taper: 0.2 }));
        // ferrule and the brush head: dark at the ferrule, white-cyan at the point
        S.cel([[-5.4, -150], [5.4, -150], [5.8, -158], [-5.8, -158]], c.gold, { depth: 1.5, line: S.L(1.5), rim: null });
        S.cel([[-5.6, -158], [5.6, -158], [10, -178], [8, -198], [0, -216, 1], [-8, -198], [-10, -178]], '#2a3a9a', { shadow: '#151a5a', depth: 3, line: S.L(2.2), rim: null });
        S.g.save();
        S.clip([[-5.6, -158], [5.6, -158], [10, -178], [8, -198], [0, -216], [-8, -198], [-10, -178]]);
        const gr = S.g.createLinearGradient(0, -158, 0, -216); gr.addColorStop(0, 'rgba(95,245,255,0)'); gr.addColorStop(0.5, 'rgba(95,245,255,0.75)'); gr.addColorStop(1, 'rgba(230,255,255,1)');
        S.g.fillStyle = gr; S.g.fillRect(-14, -220, 28, 66);
        S.g.restore();
        [[-4, -170, -1, -206], [0, -166, 1, -212], [4, -170, 3, -204]].forEach((l) => S.line([[l[0], l[1]], [l[2], l[3]]], { w: 1, color: '#ffffff', taper: 0.4, alpha: 0.8 }));
      },
    };
    const fingers = {
      id: 'fingers', bone: 'weapon', box: [W[0] - 12, W[1] - 14, W[0] + 12, W[1] + 12],
      draw(S) {
        S.g.translate(W[0], W[1]);
        S.cel([[-7.5, -7], [7.5, -7], [8.5, 6], [0, 9.5], [-8.5, 6]], c.skin, { shadow: c.skinD, depth: 3, line: S.L(1.8), rim: null });
        [-3, 0.4, 3.8].forEach((y) => S.line([[-7, y - 1], [0, y + 1.4], [7, y - 1]], { w: 1, color: c.skinD, taper: 0.3 }));
        S.line([[-2, -4], [2, -2], [-1, 1]], { w: 1.2, color: c.trim, taper: 0.2 });
      },
    };

    // ------------------------------------------------------------------ live fx: orbs, glyph, glow
    const orb = (ctx, x, y, r, t, ph) => {
      tk.glow(ctx, x, y, r * 2.4, '#7a6bff', 0.45);
      ctx.save();
      const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
      g.addColorStop(0, '#8f86ff'); g.addColorStop(0.55, '#2f2a80'); g.addColorStop(1, '#0d0a34');
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = g; ctx.fill();
      ctx.lineWidth = 2.2; ctx.strokeStyle = pal.ink; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x - r * 0.34, y - r * 0.4, r * 0.28, r * 0.18, -0.6, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
      ctx.beginPath(); ctx.arc(x + r * 0.4, y + r * 0.42, r * 0.09, 0, TAU); ctx.fillStyle = 'rgba(95,245,255,0.9)'; ctx.fill();
      ctx.restore();
    };
    const orbFx = (front) => ({
      id: 'orbs' + (front ? 'F' : 'B'), bone: 'root', live(ctx, st) {
        const t = st.t, K = st.K, m = st.motion, conv = clamp(K.power, 0, 1);
        for (let i = 0; i < 3; i++) {
          const a = t * 0.7 * (1 + conv * 1.5) + i * TAU / 3, depth = Math.cos(a);
          if ((depth > 0) !== front) continue;
          const cx = lerp(-68, -26, conv * 0.6), cy = lerp(-160, -132, conv * 0.6);
          const rx = lerp(24, 20, conv), ry = lerp(40, 22, conv);
          const x = cx + Math.sin(a) * rx, y = cy + Math.cos(a * 0.5 + i) * ry * 0.5 + Math.sin(a) * ry * 0.5 + Math.sin(t * 1.6 + i) * 3 * m;
          orb(ctx, x, y, 6.2 + depth * 1.2 + conv * 1.5, t, i);
        }
      },
    });
    const glyphStrokes = [
      [[0, -40], [0, 40]], [[-34, -12], [34, -12]], [[-26, -34], [-10, 6], [-26, 34]], [[26, -34], [10, 6], [26, 34]], [[-30, 34], [0, 44], [30, 34]],
    ];
    const glyphFx = {
      id: 'glyph', bone: 'root', live(ctx, st) {
        const K = st.K;
        if (!(K.power > 0.05) || st.pose !== 'cast') return;
        const u = clamp((st.p - 0.25) / 0.5, 0, 1), cx = 92, cy = -150, sc = 0.9 + 0.1 * Math.sin(st.t * 3);
        tk.glow(ctx, cx, cy, 70, '#5ff5ff', 0.5 * K.power);
        ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc);
        ctx.beginPath(); ctx.arc(0, 0, 46, 0, TAU); ctx.lineWidth = 2; ctx.strokeStyle = tk.rgba('#5ff5ff', 0.5 * K.power); ctx.stroke();
        glyphStrokes.forEach((s, i) => {
          const v = clamp(u * glyphStrokes.length - i, 0, 1);
          if (v <= 0) return;
          const pts = s.map((p) => [p[0], p[1]]);
          const n = Math.max(2, Math.ceil(pts.length * v + 0.001)), part = pts.slice(0, n);
          if (v < 1 && pts.length === 2) part[1] = [lerp(pts[0][0], pts[1][0], v), lerp(pts[0][1], pts[1][1], v)];
          tk.inkPath(ctx, part, { w: 4.2, color: '#eaffff', taper: 0.15, wobble: 0.1, seed: i });
          tk.inkPath(ctx, part, { w: 8, color: tk.rgba('#5ff5ff', 0.35), taper: 0.15, wobble: 0.1, seed: i });
        });
        ctx.restore();
      },
    };
    const trail = { id: 'trail', bone: 'root', live(ctx, st) { sweepTrail(ctx, st, 'bladeMid', 'tip', { color: '#5ff5ff', span: 0.12, inner: 0.7, gain: 0.55, n: 12 }); } };
    const handGlow = {
      id: 'handGlow', bone: 'root', live(ctx, st) {
        const K = st.K, pulse = 0.5 + 0.5 * Math.sin(st.t * 3.4);
        const a = st.at('hand'), tip = st.at('brush');
        tk.glow(ctx, a[0], a[1], 10 + 3 * pulse + 10 * K.power, '#5ff5ff', 0.12 + 0.1 * pulse + 0.3 * K.glow);
        tk.glow(ctx, tip[0], tip[1], 22 + 6 * pulse + 16 * K.power, '#5ff5ff', 0.55 + 0.2 * pulse + 0.25 * K.glow);
        if (K.power > 0.3 || st.pose === 'idle') {
          for (let i = 0; i < 3; i++) { const ph = (st.t * 0.5 + i * 0.33) % 1; tk.sparkle(ctx, tip[0] + Math.sin(ph * 9 + i) * 8, tip[1] - ph * 26, 3 * (1 - ph) + 1, { color: '#eaffff', alpha: 1 - ph, glow: 0.4 }); }
        }
        if (st.pose === 'attack' && K.trail > 0.1) {
          for (let i = 0; i < 7; i++) {
            const sd = tk.vary('kuro', 'ink' + i), u = clamp(st.p * 2.2 - 0.6 - sd * 0.25, 0, 1);
            if (u <= 0 || u >= 1) continue;
            tk.inkBlot(ctx, tip[0] + 30 + u * 90 + sd * 20, tip[1] + (sd - 0.5) * 30 + u * 16, (1 - u) * (3 + sd * 4) + 1.5, { color: sd > 0.5 ? '#151044' : '#5ff5ff', seed: i });
          }
        }
      },
    };

    const spec = defineHero({
      id: 'kuro', col: c, rig: { shF: R.shF, shB: R.shB }, lm, skull, fringeShadow, faceBox: [-64, -64, 68, 66],
      drawFace: drawFaceStd, wing: 0.5, lash: 0.95, faceExtra, browThick: 2.4,
      anchors: {
        head: ['head', [HC[0], HC[1]]], hand: ['weapon', [W[0], W[1] + 2]], brush: ['weapon', [W[0], W[1] - 206]], tip: ['weapon', [W[0], W[1] - 206]], bladeMid: ['weapon', [W[0], W[1] - 150]],
        chest: ['torso', [0, -104]], feet: ['root', [0, 0]], weapon: ['weapon', [W[0], W[1] - 206]],
      },
      parts: [
        orbFx(false), coatTail, hairBack, scroll, sideN,
        { id: 'armB1', bone: 'armB1', box: [bx - 22, -134, bx + 22, -88], draw: (S) => armUpper(S, bx, -124, true) },
        { id: 'armB2', bone: 'armB2', box: [bx - 22, -104, bx + 22, -56], draw: (S) => armLower(S, bx, -98, true) },
        ...legParts('B', R.hipB, true), ...legParts('F', R.hipF, false),
        coatFront, torso, face, bangs, sideF, fringeCurl,
        { id: 'armF1', bone: 'armF1', box: [kx - 22, -134, kx + 22, -88], draw: (S) => armUpper(S, kx, -124, false) },
        { id: 'armF2', bone: 'armF2', box: [kx - 22, -104, kx + 22, -56], draw: (S) => armLower(S, kx, -98, false) },
        weapon, fingers, trail, handGlow, glyphFx, orbFx(true),
      ],
      poses: {
        idle: { frames: [[0, { hx: 44, hy: 26, wa: 0.28, bhx: 0, bhy: 46, torsoRot: -0.02, mouth: 'smirk', headRot: 0.02 }]] },
        attack: { frames: [
          [0.00, { hx: 44, hy: 26, wa: 0.28, bhx: 0, bhy: 46, mouth: 'smirk' }],
          [0.24, { bx: -8, brot: -0.08, torsoRot: -0.2, headRot: 0.08, hipsDy: 8, hx: 12, hy: -34, wa: -0.75, bhx: -14, bhy: 34, fx: -18, bfx: 18, eyes: 'determined', mouth: 'flat', brow: 0.4, power: 0.3, wind: 1.4 }],
          [0.42, { bx: 14, brot: 0.12, torsoRot: 0.26, headRot: -0.08, hipsDy: 10, hx: 50, hy: 6, wa: 1.5, bhx: 6, bhy: 36, fx: -14, bfx: 26, eyes: 'determined', mouth: 'grin', brow: 0.5, power: 1, trail: 1, wind: 2.6 }],
          [0.66, { bx: 18, brot: 0.08, torsoRot: 0.18, hipsDy: 8, hx: 50, hy: 14, wa: 1.75, bhx: 6, bhy: 40, fx: -12, bfx: 26, eyes: 'open', mouth: 'smirk', power: 0.5, trail: 0.5, wind: 1.8 }],
          [1.00, { bx: 4, brot: 0.02, torsoRot: 0.02, hipsDy: 5, hx: 44, hy: 26, wa: 0.3, bhx: 0, bhy: 46, fx: -12, bfx: 15, mouth: 'smirk' }],
        ] },
        cast: { frames: [
          [0.00, { hx: 44, hy: 26, wa: 0.28, bhx: 0, bhy: 46, mouth: 'smirk' }],
          [0.32, { bx: -3, hipsDy: 8, torsoRot: -0.06, hx: 38, hy: 30, wa: 0.7, bhx: 30, bhy: 6, eyes: 'closed', mouth: 'flat', glow: 0.6, power: 0.4, fx: -14, bfx: 18, wind: 1.6 }],
          [0.66, { bx: 4, hipsDy: 4, torsoRot: 0.06, headRot: -0.05, hx: 44, hy: 14, wa: 0.95, bhx: 48, bhy: -12, eyes: 'determined', mouth: 'grin', brow: 0.4, glow: 1, power: 1, wind: 2.6 }],
          [1.00, { bx: 4, hipsDy: 4, torsoRot: 0.06, hx: 44, hy: 14, wa: 0.95, bhx: 48, bhy: -12, eyes: 'determined', mouth: 'smirk', glow: 0.8, power: 0.7, wind: 2 }],
        ] },
        hurt: { ease: 'outQuad', frames: [
          [0.00, { hx: 44, hy: 26, wa: 0.28, bhx: 0, bhy: 46 }],
          [0.25, { bx: -15, brot: -0.24, torsoRot: -0.3, headRot: -0.22, hipsDy: 2, hx: 14, hy: 30, wa: -0.3, bhx: -16, bhy: 30, fx: -20, bfx: 6, eyes: 'hurt', mouth: 'open', brow: -0.5, wind: 2.8 }],
          [0.60, { bx: -9, brot: -0.14, torsoRot: -0.15, headRot: -0.1, hipsDy: 4, hx: 24, hy: 30, wa: 0.1, eyes: 'hurt', mouth: 'open', brow: -0.4, wind: 2 }],
          [1.00, { bx: -3, brot: -0.05, torsoRot: -0.03, hx: 42, hy: 26, wa: 0.25, eyes: 'half', mouth: 'flat', brow: 0.2 }],
        ] },
        block: { frames: [
          [0.00, { hx: 44, hy: 26, wa: 0.28, bhx: 0, bhy: 46 }],
          [0.40, { bx: -3, brot: -0.05, hipsDy: 10, torsoRot: 0.04, hx: 30, hy: 4, wa: 1.5, bhx: 20, bhy: 8, fx: -16, bfx: 20, eyes: 'determined', mouth: 'grit', brow: 0.8, power: 0.6, wind: 1.8 }],
          [1.00, { bx: -3, brot: -0.05, hipsDy: 10, torsoRot: 0.04, hx: 30, hy: 4, wa: 1.5, bhx: 20, bhy: 8, fx: -16, bfx: 20, eyes: 'determined', mouth: 'grit', brow: 0.8, power: 0.6, wind: 1.4 }],
        ] },
        down: { ease: 'outQuad', frames: [
          [0.00, { hx: 44, hy: 26, wa: 0.28, bhx: 0, bhy: 46 }],
          [0.45, { bx: 4, brot: 0.04, hipsDy: 30, torsoRot: 0.22, headRot: 0.32, hx: 22, hy: 30, wa: 0.9, bhx: 12, bhy: 34, fx: -12, bfx: 18, eyes: 'closed', mouth: 'flat', brow: -0.3, wind: 2 }],
          [1.00, { bx: 5, brot: 0.05, hipsDy: 35, torsoRot: 0.28, headRot: 0.42, hx: 22, hy: 30, wa: 0.95, bhx: 12, bhy: 34, fx: -12, bfx: 18, eyes: 'closed', mouth: 'flat', brow: -0.4, wind: 0.8 }],
        ] },
        cheer: { frames: [
          [0.00, { hx: 44, hy: 26, wa: 0.28, bhx: 0, bhy: 46 }],
          [0.22, { hipsDy: 14, torsoRot: -0.06, hx: 30, hy: 30, wa: 0.4, bhx: 0, bhy: 40, fx: -14, bfx: 16, eyes: 'happy', mouth: 'smile', blush: 1 }],
          [0.45, { by: -28, hipsDy: -4, hx: -34, hy: -34, wa: -0.2, bhx: 44, bhy: -34, fx: -12, fy: -30, bfx: 12, bfy: -34, eyes: 'happy', mouth: 'grin', blush: 1, wind: 3, glow: 0.6 }],
          [0.72, { hipsDy: 9, hx: -32, hy: -30, wa: -0.18, bhx: 42, bhy: -30, eyes: 'happy', mouth: 'grin', blush: 1, wind: 2 }],
          [1.00, { hipsDy: 3, hx: -32, hy: -32, wa: -0.15, bhx: 44, bhy: -30, torsoRot: -0.05, eyes: 'happy', mouth: 'grin', blush: 1, glow: 0.4 }],
        ] },
        walk: { loop: 0.9, ease: 'inOutSine', frames: [
          [0.00, { fx: -26, bfx: 22, hipsDy: 6, hx: 40, hy: 20, wa: 0.15, bhx: -2, bhy: 46, torsoRot: 0.06, brot: 0.02 }],
          [0.25, { fx: -8, fy: -30, bfx: 8, by: -4, hipsDy: 3, hx: 40, hy: 20, wa: 0.15, bhx: -6, bhy: 46, torsoRot: 0.06, brot: 0.02 }],
          [0.50, { fx: 22, bfx: -26, hipsDy: 6, hx: 40, hy: 20, wa: 0.15, bhx: 4, bhy: 46, torsoRot: 0.06, brot: 0.02 }],
          [0.75, { fx: 8, bfx: -8, bfy: -30, by: -4, hipsDy: 3, hx: 40, hy: 20, wa: 0.15, bhx: 0, bhy: 46, torsoRot: 0.06, brot: 0.02 }],
          [1.00, { fx: -26, bfx: 22, hipsDy: 6, hx: 40, hy: 20, wa: 0.15, bhx: -2, bhy: 46, torsoRot: 0.06, brot: 0.02 }],
        ], still: true },
      },
      bounds: { w: 124, h: 250, head: { x: 4, y: -186 }, hand: { x: 38, y: -98 }, feet: { x: 0, y: 0 }, weapon: { x: 74, y: -252 } },
    });
    bustFace(spec);
    void spec;
  })();

  // ===============================================================================================================
  // SUZU, the Moon Miko
  // ===============================================================================================================
  (() => {
    const c = {
      skin: '#fdebe0', skinD: '#e6bcc4', blush: '#ff9ab8',
      hair: '#e9efff', hairD: '#94a6e0', hairB: '#c8d5ff', hairL: '#ffffff',
      iris: ['#5f86d8', '#e2f2ff'], irisRing: '#2a3a78', pupil: '#1c2a5c', lash: '#2e3866', brow: '#7a88bd',
      mouthIn: '#7a1638', tongue: '#ff8aa2',
      rim: '#d6e6ff', aura: '#a9c4ff',
      white: '#fcfcff', whiteD: '#b6c4ec', red: '#e8424f', redD: '#a01c34', redL: '#ff7a80', blue: '#a9c4ff', gold: '#f5c96a', wood: '#f3e6c8', woodD: '#c9b58a',
    };
    const R = DEFAULT_RIG;
    const W = [R.shF[0], R.shF[1] + R.arm[0] + R.arm[1]];
    const HC = R.HC;
    const dk = (col) => tk.mix(col, '#5a6ab8', 0.16);

    const skull = [[2, -46], [24, -43], [38, -26], [43, -2], [41, 20], [30, 37], [12, 47], [-6, 46], [-24, 38], [-37, 20], [-43, -4], [-41, -26], [-28, -41]];
    const lm = {
      eyeN: { x: -14, y: 9, w: 27, h: 36 }, eyeF: { x: 26, y: 8, w: 21, h: 34 },
      mouth: [9, 34, 11], browN: [-14, -20], browF: [26, -20], browW: 18,
      blushN: [-25, 25, 14], blushF: [38, 24, 10], nose: [7, 23],
    };
    const fringeShadow = [[-44, -46], [46, -46], [46, -4], [30, 0], [14, -4], [-2, 0], [-20, -4], [-44, 0]];

    const halo = {
      id: 'halo', bone: 'head', live(ctx, st) {
        const t = st.t, K = st.K, p = 0.5 + 0.5 * Math.sin(t * 1.6), cx = HC[0] - 6, cy = HC[1] - 6, r = 74;
        tk.glow(ctx, cx, cy, 110, '#a9c4ff', 0.24 + 0.1 * p + 0.3 * K.glow);
        ctx.save(); ctx.translate(cx, cy); ctx.globalCompositeOperation = 'lighter';
        tk.inkPath(ctx, tk.arcPts(0, 0, r, r * 1.02, 2.5, 5.9, 12), { w: 5, color: tk.rgba('#cfe0ff', 0.55), taper: 0.4, wobble: 0.05, pressure: 'mid' });
        tk.inkPath(ctx, tk.arcPts(0, 0, r - 5, r * 1.02 - 5, 2.9, 5.5, 10), { w: 2, color: tk.rgba('#ffffff', 0.9), taper: 0.5, wobble: 0 });
        tk.sparkle(ctx, Math.cos(2.5) * r, Math.sin(2.5) * r, 5 + 2 * p, { color: '#ffffff', alpha: 0.9 });
        ctx.restore();
      },
    };
    const hairBack = {
      id: 'hairBack', bone: 'head', origin: HC, box: [-66, -90, 70, 60],
      draw(S) { S.cel([[-50, -8], [-56, -34], [-44, -60], [-16, -74], [16, -76], [44, -64], [58, -38], [56, -6], [50, 26], [30, 40], [8, 34], [-14, 38], [-38, 42], [-50, 24]], c.hairB, { shadow: c.hairD, depth: 9, line: S.L(3) }); },
    };
    const longLock = (id, spine, w, layerBase) => ({
      id, bone: 'head', origin: HC, box: [-130, -30, 90, 200],
      chain: { spine, cuts: [0.28, 0.55, 0.8], reach: w * 0.9 + 12, sway: { amp: 0.09, freq: 0.32, phase: (spine[0][0] * 0.03), lag: 0.6, drag: 1.3 } },
      draw(S) {
        S.lock(spine, layerBase || c.hair, { wMax: w, w0: w * 0.7, w1: 2, tipPow: 1.6, shadow: c.hairD, shadowW: 0.55, line: S.L(3), strands: 2, glossAlpha: 0.85, glossColor: c.hairL, halftone: { d: 4.4, alpha: 0.2, color: '#6a7ec8' }, tipColor: '#bfd2ff', tipShadow: '#8ea4e8', tipFrac: 0.3 });
      },
    });
    const longA = longLock('longA', [[-32, -8], [-52, 34], [-60, 96], [-56, 158]], 36, c.hairB);
    const longB = longLock('longB', [[-14, -6], [-24, 44], [-26, 108], [-22, 168]], 34, c.hair);
    const longC = longLock('longC', [[28, -8], [46, 34], [54, 96], [52, 152]], 32, c.hairB);
    const face = { id: 'face', bone: 'head', face: true };
    const bangs = {
      id: 'bangs', bone: 'head', origin: HC, box: [-66, -84, 72, 50],
      draw(S) {
        const cap = [[-46, -4], [-50, -30], [-38, -54], [-16, -68], [10, -72], [34, -64], [48, -40], [52, -6], [44, -12], [30, -16], [16, -13], [2, -16], [-12, -13], [-26, -16], [-38, -12]];
        S.cel(cap, c.hair, { shadow: c.hairD, shadowShape: [[-60, -30], [60, -30], [60, 30], [-60, 30]], depth: 8, line: S.L(3), halftone: { d: 4.2, alpha: 0.2, color: '#6a7ec8' } });
        S.gloss([[-38, -42], [-20, -57], [6, -63], [30, -55], [46, -38]], 7.5, 0.95, c.hairL);
        [[-6, -68, -4, -44, -3, -20], [16, -68, 16, -44, 17, -20], [-26, -60, -28, -42, -30, -20], [36, -60, 38, -42, 40, -22]].forEach((l) => S.line([[l[0], l[1]], [l[2], l[3]], [l[4], l[5]]], { w: 1.1, color: c.hairD, taper: 0.5 }));
      },
    };
    const cheek = (id, spine, w, phase) => ({
      id, bone: 'head', origin: HC, box: [-80, -30, 90, 120],
      chain: { spine, cuts: [0.4, 0.72], reach: w + 10, sway: { amp: 0.09, freq: 0.4, phase, drag: 1.2 } },
      draw(S) {
        S.lock(spine, c.hair, { wMax: w, w0: w * 0.8, w1: 1, tipPow: 1.5, shadow: c.hairD, line: S.L(2.2), strands: 1, glossColor: c.hairL });
        // red and white mizuhiki tie
        const ty = spine[1][1] + 6, tx = spine[1][0];
        S.cel([[tx - 7, ty - 2], [tx + 7, ty - 2], [tx + 7, ty + 6], [tx - 7, ty + 6]], c.red, { shadow: c.redD, depth: 2, line: S.L(1.5), rim: null });
        S.line([[tx - 7, ty + 1], [tx + 7, ty + 3]], { w: 1.2, color: '#ffffff', taper: 0.2 });
      },
    });
    const cheekN = cheek('cheekN', [[-42, -12], [-47, 24], [-46, 56], [-42, 86]], 15, 0.5);
    const cheekF = cheek('cheekF', [[44, -12], [49, 22], [48, 52], [44, 80]], 13, 0.1);
    const ribbonTails = (id, x, y, dir) => ({
      id, bone: 'head', origin: HC, box: [-90, -20, 90, 100],
      chain: { spine: [[x, y], [x + dir * 6, y + 16], [x + dir * 4, y + 34], [x + dir * 8, y + 50]], cuts: [0.5], reach: 14, sway: { amp: 0.26, freq: 0.55, phase: dir * 0.3, drag: 1.6 } },
      draw(S) { S.lock([[x, y], [x + dir * 6, y + 16], [x + dir * 4, y + 34], [x + dir * 8, y + 50]], c.red, { wMax: 6, w0: 5, w1: 1.4, shadow: c.redD, line: S.L(1.5), gloss: false, strands: 0, rim: null }); },
    });
    const tailsN = ribbonTails('tailsN', -47, 30, -1), tailsF = ribbonTails('tailsF', 49, 28, 1);
    const kanzashi = {
      id: 'kanzashi', bone: 'head', origin: HC, box: [10, -96, 66, -18],
      chain: { spine: [[36, -56], [40, -46], [39, -34]], cuts: [0.5], reach: 14, sway: { amp: 0.28, freq: 0.7, phase: 0.2, drag: 1.4 } },
      draw(S) {
        // crescent moon: outer arc out, inner arc back
        const out = tk.arcPts(34, -68, 13, 13, -0.7, 3.5, 9), inn = tk.arcPts(38, -71, 10, 10, 3.3, -0.55, 9);
        S.cel(out.concat(inn), c.gold, { shadow: '#c8983a', depth: 2.4, line: S.L(2), rim: '#fff2c8' });
        [[41, -46], [40, -37]].forEach((p, i) => S.cel(S.ell(p[0], p[1], 3.2 - i * 0.5, 3.2 - i * 0.5, 6), i ? '#a9c4ff' : '#ffffff', { line: S.L(1.4), depth: 0.8, shadow: false, rim: null }));
        S.line([[38, -60], [41, -48]], { w: 1, color: c.gold, taper: 0.2 });
      },
    };

    // ------------------------------------------------------------------ body
    const kx = R.shF[0], bx = R.shB[0];
    const sleeve = (id, bone, x, dark) => ({
      id, bone, box: [x - 70, -140, x + 60, -10],
      chain: { spine: [[x - 2, -122], [x - 8, -104], [x - 12, -88], [x - 14, -72]], cuts: [0.4, 0.75], reach: 36, sway: { amp: 0.12, freq: 0.36, phase: x * 0.02, lag: 0.7, drag: 0.6, hang: 0.7 } },
      draw(S) {
        const base = dark ? dk(c.white) : c.white;
        S.lock([[x - 2, -122], [x - 8, -104], [x - 12, -88], [x - 14, -72]], base, { wMax: 36, w0: 20, w1: 36, profile: (u) => 0.55 + 0.45 * Math.pow(u, 1.5), cap: 'flat', shadow: c.whiteD, shadowW: 0.55, line: S.L(3), gloss: false, strands: 0, halftone: { d: 4.4, alpha: 0.18, color: '#7a8ec8' }, tipColor: c.red, tipShadow: c.redD, tipFrac: 0.13 });
        S.line([[x - 4, -114], [x - 10, -96], [x - 14, -80]], { w: 1.2, color: c.whiteD, taper: 0.5 });
        S.line([[x + 6, -112], [x + 2, -96], [x - 2, -82]], { w: 1.1, color: c.whiteD, taper: 0.5, alpha: 0.8 });
      },
    });
    const armSkin = (S, x, sy, dark) => {
      const sk = dark ? dk(c.skin) : c.skin;
      tube(S, x, sy - 4, sy + 30, 10.5, 9.5, sk, { shadow: c.skinD, depth: 3, line: S.L(1.8), capTop: 0.2, rim: null });
    };
    const armLowerSkin = (S, x, ty, dark) => {
      const sk = dark ? dk(c.skin) : c.skin;
      tube(S, x, ty - 2, ty + 24, 9.8, 8.6, sk, { shadow: c.skinD, depth: 3, line: S.L(1.8), capTop: 0.1, rim: null });
      S.cel([[x - 6, ty + 20], [x + 6, ty + 20], [x + 6, ty + 25], [x - 6, ty + 25]], c.red, { shadow: c.redD, depth: 1, line: S.L(1.6), rim: null });
      if (dark) S.cel(S.ell(x, ty + 30, 6.8, 7, 10), sk, { shadow: c.skinD, depth: 3, line: S.L(1.8), rim: null });
    };
    const legParts = (tag, hip, dark) => [
      { id: 'leg' + tag + '1', bone: 'leg' + tag + '1', box: [hip[0] - 14, -72, hip[0] + 14, -30], draw: (S) => tube(S, hip[0], -66, hip[1] + 19, 14, 12, c.red, { shadow: c.redD, depth: 4, line: S.L(2.0), capTop: 0.1 }) },
      { id: 'leg' + tag + '2', bone: 'leg' + tag + '2', box: [hip[0] - 12, hip[1] + 18, hip[0] + 12, -8], draw: (S) => tube(S, hip[0], hip[1] + 19, -19, 12, 10, dark ? dk(c.skin) : c.skin, { shadow: c.skinD, depth: 4, line: S.L(2.0) }) },
      { id: 'foot' + tag, bone: 'foot' + tag, box: [hip[0] - 16, -32, hip[0] + 28, 4], draw(S) {
        const ax = hip[0], ay = -14;
        S.cel([[ax - 10, ay + 10], [ax + 22, ay + 10], [ax + 23, ay + 14], [ax - 10, ay + 14]], '#3a2a38', { shadow: false, depth: 1, line: S.L(1.7), rim: null });
        S.cel([[ax - 7, ay - 6], [ax + 4, ay - 8], [ax + 13, ay - 3], [ax + 19, ay + 3], [ax + 18, ay + 10], [ax - 9, ay + 10]], dark ? dk(c.white) : c.white, { shadow: c.whiteD, depth: 3, line: S.L(1.8), rim: null });
        S.line([[ax - 3, ay + 4], [ax + 8, ay - 3], [ax + 15, ay + 3]], { w: 1.8, color: c.red, taper: 0.2 });
      } },
    ];
    const hakama = {
      id: 'hakama', bone: 'hips', box: [-58, -92, 62, -8], sway: { px: 0, py: -84, amp: 0.035, freq: 0.36, phase: 0.2, drag: 0.5 },
      draw(S) {
        S.cel([[-25, -86], [27, -86], [38, -64], [50, -38], [54, -20], [22, -14], [2, -17], [-24, -14], [-48, -20], [-46, -38], [-36, -64]], c.red, { shadow: c.redD, depth: 8, line: S.L(3), halftone: { d: 4.2, alpha: 0.3, color: '#6a0e28' } });
        [[-16, -84, -34, -18], [-3, -84, -8, -16], [10, -84, 16, -16], [22, -82, 38, -18]].forEach((l) => S.line([[l[0], l[1]], [(l[0] + l[2]) / 2 - 1, (l[1] + l[3]) / 2], [l[2], l[3]]], { w: 1.6, color: c.redD, taper: 0.4, alpha: 0.9 }));
        S.cel([[-48, -24], [-2, -21], [54, -24], [54, -19], [-2, -16], [-48, -19]], c.white, { shadow: c.whiteD, depth: 1.5, line: S.L(1.5), rim: null });
      },
    };
    const torso = {
      id: 'torso', bone: 'torso', box: [-40, -142, 40, -70],
      draw(S) {
        tube(S, 2, -140, -126, 12.5, 13, c.skin, { shadow: c.skinD, depth: 3, line: S.L(1.8), capTop: 0, capBot: 0.05, rim: null });
        S.cel([[-16, -129], [2, -134], [18, -128], [21, -104], [22, -86], [-22, -86], [-20, -106]], c.white, { shadow: c.whiteD, depth: 6, line: S.L(2.3), halftone: { d: 4.2, alpha: 0.22, color: '#7a8ec8' } });
        // red collar, crossed
        S.cel([[-12, -132], [-2, -134], [10, -104], [2, -98], [-10, -114]], c.red, { shadow: c.redD, depth: 2, line: S.L(1.7), rim: null });
        S.cel([[8, -134], [16, -130], [12, -110], [4, -100], [2, -112]], c.redL, { shadow: c.red, depth: 2, line: S.L(1.7), rim: null });
        // himo cord and mizuhiki knot at the chest
        S.cel([[-22, -92], [24, -92], [24, -84], [-22, -84]], c.white, { shadow: c.whiteD, depth: 2, line: S.L(2.0), rim: null });
        S.line([[-20, -88], [22, -88]], { w: 1.2, color: c.red, taper: 0.1 });
        S.cel([[-6, -116], [0, -120], [6, -116], [0, -112]], c.red, { shadow: c.redD, depth: 1, line: S.L(1.6), rim: null });
        S.cel(S.ell(0, -116, 2.4, 2.4, 6), c.white, { line: S.L(1), depth: 0.5, shadow: false, rim: null });
      },
    };
    const weapon = {
      id: 'weapon', bone: 'weapon', box: [W[0] - 22, W[1] - 112, W[0] + 22, W[1] + 30],
      draw(S) {
        S.g.translate(W[0], W[1]);
        S.cel([[-3.2, 24], [3.2, 24], [3.4, -92], [-3.4, -92]], c.wood, { shadow: c.woodD, depth: 2, line: S.L(2.0), rim: '#ffffff', rimW: 1, tension: 0.15 });
        [[-56], [-10]].forEach((y) => S.cel([[-4.6, y[0]], [4.6, y[0]], [4.6, y[0] + 6], [-4.6, y[0] + 6]], c.red, { shadow: c.redD, depth: 1.4, line: S.L(1.5), rim: null }));
        S.cel(S.ell(0, -96, 5.4, 5.4, 8), c.gold, { shadow: '#c8983a', depth: 1.6, line: S.L(1.7), rim: '#fff2c8' });
        S.cel([[-5, -90], [5, -90], [4, -84], [-4, -84]], c.red, { shadow: c.redD, depth: 1, line: S.L(1.6), rim: null });
      },
    };
    const shide = (id, dir, phase) => ({
      id, bone: 'weapon', box: [W[0] - 46, W[1] - 112, W[0] + 46, W[1] + 10],
      chain: { spine: [[W[0], W[1] - 90], [W[0] + dir * 8, W[1] - 76], [W[0] + dir * 4, W[1] - 60], [W[0] + dir * 11, W[1] - 44]], cuts: [0.5], reach: 18, sway: { amp: 0.32, freq: 0.7, phase, drag: 1.8 } },
      draw(S) {
        // zig-zag folded paper streamer
        const x0 = W[0], y0 = W[1] - 90, pts = [], pts2 = [];
        for (let i = 0; i <= 5; i++) { const y = y0 + i * 9, off = (i % 2 ? 1 : -1) * 4; pts.push([x0 + dir * (7 + i * 1.4) + off, y]); pts2.push([x0 + dir * (7 + i * 1.4) - 9 * dir + off * 0.4, y + 4]); }
        S.cel(pts.concat(pts2.reverse()), c.white, { shadow: c.whiteD, depth: 3, line: S.L(1.7), rim: null, tension: 0 });
        S.line([[x0 + dir * 8, y0 + 3], [x0 + dir * 12, y0 + 40]], { w: 1, color: c.whiteD, taper: 0.4 });
      },
    });
    const shideL = shide('shideL', -1, 0.2), shideR = shide('shideR', 1, 0.9);
    const fingers = {
      id: 'fingers', bone: 'weapon', box: [W[0] - 12, W[1] - 14, W[0] + 12, W[1] + 12],
      draw(S) {
        S.g.translate(W[0], W[1]);
        S.cel([[-7, -7], [7, -7], [8, 6], [0, 9.5], [-8, 6]], c.skin, { shadow: c.skinD, depth: 3, line: S.L(1.8), rim: null });
        [-3, 0.4, 3.8].forEach((y) => S.line([[-6.5, y - 1], [0, y + 1.4], [6.5, y - 1]], { w: 1, color: c.skinD, taper: 0.3 }));
      },
    };

    // ------------------------------------------------------------------ live fx: ofuda orbit
    const ofuda = (ctx, x, y, s, rot, alpha, glowK) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = ctx.globalAlpha * alpha;
      if (glowK > 0) tk.glow(ctx, 0, 0, 22 * s, '#ffb0b4', glowK);
      const w = 8 * s, h = 19 * s;
      ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); ctx.fillStyle = '#fffaf0'; ctx.fill();
      ctx.lineWidth = 1.6; ctx.strokeStyle = pal.ink; ctx.stroke();
      ctx.fillStyle = '#e8424f'; ctx.fillRect(-w / 2, -h / 2 + 1.5, w, 2); ctx.fillRect(-w / 2, h / 2 - 3.5, w, 2);
      ctx.strokeStyle = '#c0182c'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-w * 0.2, -h * 0.28); ctx.lineTo(w * 0.2, -h * 0.2); ctx.moveTo(0, -h * 0.28); ctx.lineTo(-0.5, h * 0.22); ctx.moveTo(-w * 0.25, h * 0.02); ctx.lineTo(w * 0.28, 0); ctx.moveTo(-w * 0.2, h * 0.14); ctx.lineTo(w * 0.18, h * 0.2); ctx.stroke();
      ctx.restore();
    };
    const ofudaFx = (front) => ({
      id: 'ofuda' + (front ? 'F' : 'B'), bone: 'root', live(ctx, st) {
        const t = st.t, K = st.K, m = st.motion, pw = clamp(K.power, 0, 1);
        const n = 4, spin = 0.55 + pw * 2.4;
        for (let i = 0; i < n; i++) {
          let a = t * spin * m + i * TAU / n + (st.pose === 'attack' ? 0 : 0);
          const depth = Math.sin(a);
          let x = Math.cos(a) * (58 + pw * 26), y = -122 + Math.sin(a) * (20 + pw * 8) + Math.sin(t * 1.4 + i * 1.7) * 4 * m;
          let rot = Math.cos(a) * 0.35 + Math.sin(t * 0.9 + i) * 0.1;
          if (st.pose === 'attack') {
            const u = clamp((st.p - 0.3 - i * 0.05) / 0.5, 0, 1);
            if (u > 0) { const h = st.at('tip'); x = lerp(x, h[0] + 30 + u * 130, u); y = lerp(y, h[1] + 10 + (i - 1.5) * 8, u); rot = lerp(rot, PI / 2, u); }
          }
          if ((depth > 0) !== front && !(st.pose === 'attack' && front)) continue;
          ofuda(ctx, x, y, 0.95 + depth * 0.12, rot, 0.85 + 0.15 * depth, 0.25 + 0.5 * pw);
        }
      },
    });
    const moonDust = {
      id: 'dust', bone: 'root', live(ctx, st) {
        for (let i = 0; i < 5; i++) {
          const ph = (st.t * 0.12 + i * 0.2) % 1, x = -40 + i * 26 + Math.sin(st.t * 0.8 + i * 2) * 10, y = -70 - ph * 150;
          tk.sparkle(ctx, x, y, 2.4 + (i % 2) * 1.2, { color: '#e6f0ff', alpha: Math.sin(ph * PI) * 0.9 * st.motion, glow: 0.4 });
        }
        if (st.pose === 'cast' && st.K.power > 0.3) tk.glow(ctx, 0, -120, 120, '#ffffff', 0.25 * st.K.power);
      },
    };

    const trail = { id: 'trail', bone: 'root', live(ctx, st) { sweepTrail(ctx, st, 'bladeMid', 'tip', { color: '#dfeaff', span: 0.12, inner: 0.6, gain: 0.6, n: 12 }); } };
    const spec = defineHero({
      id: 'suzu', col: c, rig: {}, lm, skull, fringeShadow, faceBox: [-64, -64, 68, 66],
      drawFace: drawFaceStd, wing: 0.25, lash: 0.9, eyeGlow: 0.45, browThick: 2, base: { blush: 1 },
      anchors: {
        head: ['head', [HC[0], HC[1]]], hand: ['weapon', [W[0], W[1] + 2]], tip: ['weapon', [W[0], W[1] - 96]], bladeMid: ['weapon', [W[0], W[1] - 50]],
        chest: ['torso', [0, -104]], feet: ['root', [0, 0]], weapon: ['weapon', [W[0], W[1] - 96]],
      },
      parts: [
        halo, longA, longC, hairBack, longB, ofudaFx(false), cheekN,
        { id: 'armB1', bone: 'armB1', box: [bx - 16, -134, bx + 16, -88], draw: (S) => armSkin(S, bx, -124, true) },
        { id: 'armB2', bone: 'armB2', box: [bx - 16, -104, bx + 16, -56], draw: (S) => armLowerSkin(S, bx, -98, true) },
        sleeve('sleeveB', 'armB1', bx, true),
        ...legParts('B', R.hipB, true), ...legParts('F', R.hipF, false),
        hakama, torso, face, bangs, cheekF, tailsN, tailsF, kanzashi,
        { id: 'armF1', bone: 'armF1', box: [kx - 16, -134, kx + 16, -88], draw: (S) => armSkin(S, kx, -124, false) },
        { id: 'armF2', bone: 'armF2', box: [kx - 16, -104, kx + 16, -56], draw: (S) => armLowerSkin(S, kx, -98, false) },
        sleeve('sleeveF', 'armF1', kx, false),
        weapon, shideL, shideR, fingers, trail, moonDust, ofudaFx(true),
      ],
      poses: {
        idle: { frames: [[0, { hx: 40, hy: 24, wa: 0.5, bhx: 0, bhy: 46, torsoRot: -0.02, mouth: 'smile', eyes: 'open' }]] },
        attack: { frames: [
          [0.00, { hx: 44, hy: 22, wa: 0.16, bhx: 0, bhy: 46 }],
          [0.24, { bx: -6, brot: -0.06, torsoRot: -0.14, headRot: 0.06, hipsDy: 7, hx: 24, hy: 8, wa: -0.4, bhx: 16, bhy: 20, fx: -16, bfx: 18, eyes: 'determined', mouth: 'flat', brow: 0.3, power: 0.3, wind: 1.4 }],
          [0.44, { bx: 12, brot: 0.1, torsoRot: 0.2, headRot: -0.06, hipsDy: 9, hx: 50, hy: 4, wa: 1.45, bhx: 34, bhy: 6, fx: -12, bfx: 24, eyes: 'determined', mouth: 'open', brow: 0.4, power: 1, trail: 1, wind: 2.6 }],
          [0.70, { bx: 14, brot: 0.06, torsoRot: 0.12, hipsDy: 8, hx: 50, hy: 10, wa: 1.6, bhx: 30, bhy: 14, eyes: 'open', mouth: 'smile', power: 0.5, trail: 0.4, wind: 1.8 }],
          [1.00, { bx: 4, brot: 0.02, torsoRot: 0.0, hipsDy: 5, hx: 44, hy: 22, wa: 0.2, bhx: 0, bhy: 46, fx: -12, bfx: 15 }],
        ] },
        cast: { frames: [
          [0.00, { hx: 44, hy: 22, wa: 0.16, bhx: 0, bhy: 46 }],
          [0.32, { bx: -2, hipsDy: 8, torsoRot: -0.04, hx: 34, hy: 8, wa: 0.05, bhx: 28, bhy: 10, eyes: 'closed', mouth: 'flat', glow: 0.7, power: 0.5, fx: -14, bfx: 18, wind: 1.6 }],
          [0.66, { bx: 2, hipsDy: 3, torsoRot: 0.02, headRot: -0.07, hx: 36, hy: -22, wa: 0.05, bhx: 46, bhy: -14, eyes: 'determined', mouth: 'open', brow: 0.2, glow: 1, power: 1, wind: 2.8 }],
          [1.00, { bx: 2, hipsDy: 3, hx: 36, hy: -24, wa: 0.05, bhx: 46, bhy: -16, eyes: 'determined', mouth: 'smile', glow: 0.85, power: 0.8, wind: 2.2 }],
        ] },
        hurt: { ease: 'outQuad', frames: [
          [0.00, { hx: 44, hy: 22, wa: 0.16, bhx: 0, bhy: 46 }],
          [0.25, { bx: -14, brot: -0.22, torsoRot: -0.26, headRot: -0.2, hipsDy: 2, hx: 12, hy: 30, wa: -0.3, bhx: -14, bhy: 30, fx: -20, bfx: 6, eyes: 'hurt', mouth: 'open', brow: -0.5, wind: 2.8 }],
          [0.60, { bx: -8, brot: -0.12, torsoRot: -0.13, headRot: -0.1, hipsDy: 4, hx: 26, hy: 28, wa: 0.0, eyes: 'hurt', mouth: 'open', brow: -0.4, wind: 2 }],
          [1.00, { bx: -3, brot: -0.05, torsoRot: -0.03, hx: 42, hy: 22, wa: 0.14, eyes: 'half', mouth: 'flat', brow: 0.2 }],
        ] },
        block: { frames: [
          [0.00, { hx: 44, hy: 22, wa: 0.16, bhx: 0, bhy: 46 }],
          [0.40, { bx: -2, brot: -0.04, hipsDy: 8, torsoRot: 0.03, hx: 30, hy: 10, wa: 0.6, bhx: 22, bhy: 14, fx: -14, bfx: 18, eyes: 'determined', mouth: 'grit', brow: 0.6, glow: 0.6, power: 0.7, wind: 1.8 }],
          [1.00, { bx: -2, brot: -0.04, hipsDy: 8, torsoRot: 0.03, hx: 30, hy: 10, wa: 0.6, bhx: 22, bhy: 14, fx: -14, bfx: 18, eyes: 'determined', mouth: 'grit', brow: 0.6, glow: 0.6, power: 0.7, wind: 1.4 }],
        ] },
        down: { ease: 'outQuad', frames: [
          [0.00, { hx: 44, hy: 22, wa: 0.16, bhx: 0, bhy: 46 }],
          [0.45, { bx: 4, brot: 0.04, hipsDy: 30, torsoRot: 0.2, headRot: 0.3, hx: 22, hy: 30, wa: 1.9, bhx: 12, bhy: 34, fx: -12, bfx: 18, eyes: 'closed', mouth: 'flat', brow: -0.3, wind: 2 }],
          [1.00, { bx: 5, brot: 0.05, hipsDy: 35, torsoRot: 0.26, headRot: 0.4, hx: 22, hy: 30, wa: 1.95, bhx: 12, bhy: 34, fx: -12, bfx: 18, eyes: 'closed', mouth: 'flat', brow: -0.4, wind: 0.8 }],
        ] },
        cheer: { frames: [
          [0.00, { hx: 44, hy: 22, wa: 0.16, bhx: 0, bhy: 46 }],
          [0.22, { hipsDy: 14, torsoRot: -0.06, hx: 30, hy: 30, wa: 0.4, bhx: 0, bhy: 40, fx: -14, bfx: 16, eyes: 'happy', mouth: 'smile', blush: 1 }],
          [0.45, { by: -28, hipsDy: -4, hx: -34, hy: -34, wa: -0.2, bhx: 44, bhy: -34, fx: -12, fy: -30, bfx: 12, bfy: -34, eyes: 'happy', mouth: 'grin', blush: 1, wind: 3, glow: 0.7, power: 0.6 }],
          [0.72, { hipsDy: 9, hx: -32, hy: -30, wa: -0.18, bhx: 42, bhy: -30, eyes: 'happy', mouth: 'grin', blush: 1, wind: 2, glow: 0.5 }],
          [1.00, { hipsDy: 3, hx: -32, hy: -32, wa: -0.15, bhx: 44, bhy: -30, torsoRot: -0.05, eyes: 'happy', mouth: 'grin', blush: 1, glow: 0.5 }],
        ] },
        walk: { loop: 0.9, ease: 'inOutSine', frames: [
          [0.00, { fx: -26, bfx: 22, hipsDy: 6, hx: 40, hy: 24, wa: 0.05, bhx: -2, bhy: 46, torsoRot: 0.05, brot: 0.02 }],
          [0.25, { fx: -8, fy: -30, bfx: 8, by: -4, hipsDy: 3, hx: 40, hy: 24, wa: 0.05, bhx: -6, bhy: 46, torsoRot: 0.05, brot: 0.02 }],
          [0.50, { fx: 22, bfx: -26, hipsDy: 6, hx: 40, hy: 24, wa: 0.05, bhx: 4, bhy: 46, torsoRot: 0.05, brot: 0.02 }],
          [0.75, { fx: 8, bfx: -8, bfy: -30, by: -4, hipsDy: 3, hx: 40, hy: 24, wa: 0.05, bhx: 0, bhy: 46, torsoRot: 0.05, brot: 0.02 }],
          [1.00, { fx: -26, bfx: 22, hipsDy: 6, hx: 40, hy: 24, wa: 0.05, bhx: -2, bhy: 46, torsoRot: 0.05, brot: 0.02 }],
        ], still: true },
      },
      bounds: { w: 132, h: 250, head: { x: 4, y: -186 }, hand: { x: 36, y: -102 }, feet: { x: 0, y: 0 }, weapon: { x: 40, y: -196 } },
    });
    bustFace(spec);
    void spec;
  })();

  // ===============================================================================================================
  // RAIGA, the Thunder Monk
  // ===============================================================================================================
  (() => {
    const c = {
      skin: '#dea068', skinD: '#b06c3c', blush: '#ff8a5a',
      hair: '#ff9a2e', hairD: '#d2600a', hairB: '#e87818', hairL: '#ffd070', tip: '#ffe45e', tipD: '#f0a800',
      iris: ['#a85a00', '#ffd23a'], irisRing: '#5a2a00', pupil: '#3a1600', lash: '#2a1000', brow: '#6a2e00',
      mouthIn: '#6a1420', tongue: '#e8607a',
      rim: '#fff0a8', aura: '#ffe45e',
      robe: '#5a2a0a', robeD: '#341604', robeL: '#8a4a1a', trim: '#ff9a2e', cream: '#f4ead0', creamD: '#c8b488', wrap: '#f8f2e4', wrapD: '#c8bca0',
      sash: '#ff9a2e', sashD: '#c26008', bolt: '#5fd0ff', boltCore: '#eaffff', bead: '#6a3410', beadD: '#3a1a08', red: '#e8383d',
    };
    const R = Object.assign({}, DEFAULT_RIG, { shF: [-13, -124], shB: [16, -126], hipF: [-8, -60], hipB: [13, -60], arm: [29, 28], HC: [4, -184], neck: [2, -132] });
    const W = [R.shF[0], R.shF[1] + R.arm[0] + R.arm[1]];
    const HC = R.HC;
    const dk = (col) => tk.mix(col, '#5a2a0a', 0.22);

    const skull = [[2, -46], [26, -44], [42, -28], [48, -2], [48, 20], [41, 37], [26, 47], [6, 49], [-14, 47], [-32, 40], [-43, 22], [-47, -2], [-44, -26], [-30, -40]];
    const lm = {
      eyeN: { x: -15, y: 7, w: 25, h: 30 }, eyeF: { x: 28, y: 6, w: 20, h: 28 },
      mouth: [11, 33, 17], browN: [-15, -18], browF: [28, -18], browW: 24,
      blushN: [-27, 22, 13], blushF: [40, 22, 9], nose: [8, 21],
    };
    const fringeShadow = [[-46, -46], [48, -46], [48, -14], [30, -12], [12, -16], [-8, -12], [-46, -12]];

    const spike = (S, spine, w, base, tip) => S.lock(spine, base, { wMax: w, w0: w * 0.8, w1: 0, tipPow: 1.15, shadow: c.hairD, shadowW: 0.6, line: S.L(2.6), strands: 0, glossAlpha: 0.7, glossColor: c.hairL, tipColor: tip, tipShadow: c.tipD, tipFrac: 0.34 });
    const hairBack = {
      id: 'hairBack', bone: 'head', origin: HC, box: [-84, -116, 86, 46],
      draw(S) {
        spike(S, [[-40, -12], [-62, -14], [-80, -2]], 22, c.hair, c.tip);
        spike(S, [[-38, -34], [-60, -42], [-78, -44]], 24, c.hair, c.tip);
        spike(S, [[-28, -54], [-44, -76], [-54, -98]], 24, c.hair, c.tip);
        spike(S, [[-6, -62], [-8, -88], [0, -110]], 24, c.hair, c.tip);
        spike(S, [[18, -64], [30, -88], [44, -100]], 24, c.hair, c.tip);
        spike(S, [[38, -52], [58, -66], [74, -66]], 22, c.hair, c.tip);
        S.cel([[-46, -10], [-54, -36], [-42, -60], [-14, -72], [16, -74], [44, -62], [56, -34], [52, -4], [42, 14], [20, 6], [-4, 12], [-30, 14], [-48, 4]], c.hairB, { shadow: c.hairD, depth: 8, line: S.L(3) });
      },
    };
    const face = { id: 'face', bone: 'head', face: true };
    const bangs = {
      id: 'bangs', bone: 'head', origin: HC, box: [-66, -84, 74, 40],
      draw(S) {
        const cap = [[-48, -4], [-52, -30], [-40, -54], [-18, -68], [10, -72], [36, -64], [50, -40], [54, -8], [46, -18], [34, -28], [14, -34], [-6, -32], [-28, -28], [-42, -14]];
        S.cel(cap, c.hair, { shadow: c.hairD, depth: 9, line: S.L(3) });
        // lightning-shaped bangs: two angular bolts across the forehead
        S.cel([[-24, -62], [-8, -66], [-2, -44], [-12, -46], [-6, -22, 1], [-22, -40], [-14, -42]], c.tip, { shadow: c.tipD, depth: 3, line: S.L(2.2), rim: null });
        S.cel([[6, -66], [24, -64], [26, -40], [16, -42], [26, -18, 1], [8, -34], [12, -38]], c.tip, { shadow: c.tipD, depth: 3, line: S.L(2.2), rim: null });
        S.cel([[34, -58], [48, -44], [46, -26], [40, -30], [46, -6, 1], [32, -26], [34, -34]], c.hair, { shadow: c.hairD, depth: 3, line: S.L(2.2), rim: null });
        S.gloss([[-38, -42], [-20, -58], [6, -64], [30, -56], [44, -40]], 6, 0.8, c.hairL);
      },
    };
    const sideN = {
      id: 'sideN', bone: 'head', origin: HC, box: [-74, -24, -6, 60],
      chain: { spine: [[-42, -10], [-50, 8], [-50, 26], [-46, 42]], cuts: [0.5], reach: 20, sway: { amp: 0.08, freq: 0.5, phase: 0.6, drag: 1.2 } },
      draw(S) { spike(S, [[-42, -10], [-50, 8], [-50, 26], [-46, 44]], 16, c.hair, c.tip); },
    };
    const band = {
      id: 'band', bone: 'head', origin: HC, box: [-60, -60, 66, -10],
      draw(S) {
        S.cel([[-46, -30], [-40, -46], [-16, -56], [10, -58], [34, -52], [48, -40], [50, -26], [40, -36], [14, -42], [-12, -40], [-36, -34]].map((p) => [p[0], p[1] + 2]), c.wrap, { shadow: c.wrapD, depth: 4, line: S.L(2.2), rim: null });
        S.line([[-40, -42], [-12, -50], [16, -52], [42, -44]], { w: 1.2, color: c.wrapD, taper: 0.3, alpha: 0.8 });
        S.cel([[-6, -50], [8, -50], [8, -44], [-6, -44]], '#c8382d', { depth: 1, line: S.L(1.6), shadow: false, rim: null });
      },
    };
    const bandTails = {
      id: 'bandTails', bone: 'head', origin: HC, box: [-130, -80, -20, 40],
      chain: { spine: [[-44, -34], [-64, -30], [-84, -20], [-102, -10]], cuts: [0.4, 0.72], reach: 16, sway: { amp: 0.2, freq: 0.5, phase: 0.2, lag: 0.7, drag: 1.7 } },
      draw(S) {
        S.lock([[-44, -34], [-64, -30], [-84, -20], [-102, -10]], c.wrap, { wMax: 12, w0: 9, w1: 7, cap: 'flat', tipPow: 1, shadow: c.wrapD, line: S.L(2.0), gloss: false, strands: 0, rim: null });
        S.lock([[-44, -30], [-62, -18], [-78, 0], [-90, 14]], c.wrap, { wMax: 11, w0: 8, w1: 6, cap: 'flat', tipPow: 1, shadow: c.wrapD, line: S.L(2.0), gloss: false, strands: 0, rim: null });
      },
    };

    // ------------------------------------------------------------------ body
    const kx = R.shF[0], bx = R.shB[0];
    let fistArtRef = null;
    const armUpper = (S, x, sy, dark) => {
      tube(S, x, sy - 4, sy + 32, 16, 15, dark ? dk(c.skin) : c.skin, { shadow: c.skinD, depth: 4, line: S.L(2.2), capTop: 0.25, rim: null });
      S.line([[x - 3, sy + 8], [x + 1, sy + 14], [x - 2, sy + 22]], { w: 1.2, color: c.skinD, taper: 0.4, alpha: 0.8 });
    };
    const armLower = (S, x, ty, dark) => {
      const wr = dark ? dk(c.wrap) : c.wrap;
      tube(S, x, ty - 3, ty + 26, 15, 13.5, dark ? dk(c.skin) : c.skin, { shadow: c.skinD, depth: 3, line: S.L(2.0), capTop: 0.1, rim: null });
      // wrapped forearm
      S.cel([[x - 8, ty + 4], [x + 8, ty + 4], [x + 7.5, ty + 26], [x - 7.5, ty + 26]], wr, { shadow: c.wrapD, depth: 3, line: S.L(2.0), rim: null });
      [8, 13, 18, 23].forEach((y, i) => S.line([[x - 8, ty + y - 1], [x + 8, ty + y + 1]], { w: 1.2, color: c.wrapD, taper: 0.2, alpha: 0.85 }));
      if (dark) fistShape(S, x, ty + 34, dark);
    };
    const fistShape = (S, x, y, dark) => { S.g.save(); S.g.translate(x, y - 2); S.g.rotate(PI); fistArtRef(S); S.g.restore(); void dark; };
    const legParts = (tag, hip, dark) => [
      { id: 'leg' + tag + '1', bone: 'leg' + tag + '1', box: [hip[0] - 18, -72, hip[0] + 18, -28], draw: (S) => tube(S, hip[0], -68, hip[1] + 21 - 1, 19, 17, dark ? dk(c.robe) : c.robe, { shadow: c.robeD, depth: 5, line: S.L(2.2), capTop: 0.1, halftone: { d: 4, alpha: 0.28, color: '#1a0a02' } }) },
      { id: 'leg' + tag + '2', bone: 'leg' + tag + '2', box: [hip[0] - 14, hip[1] + 16, hip[0] + 14, -8], draw(S) {
        tube(S, hip[0], hip[1] + 19, -19, 13, 11, dark ? dk(c.skin) : c.skin, { shadow: c.skinD, depth: 3, line: S.L(2.0) });
        S.cel([[hip[0] - 8, -32], [hip[0] + 8, -32], [hip[0] + 7, -21], [hip[0] - 7, -21]], dark ? dk(c.cream) : c.cream, { shadow: c.creamD, depth: 2, line: S.L(1.7), rim: null });
      } },
      { id: 'foot' + tag, bone: 'foot' + tag, box: [hip[0] - 16, -32, hip[0] + 30, 4], draw(S) {
        const ax = hip[0], ay = -14;
        S.cel([[ax - 9, ay + 10], [ax + 24, ay + 10], [ax + 25, ay + 14], [ax - 9, ay + 14]], '#8a6a34', { shadow: '#5a4020', depth: 1.5, line: S.L(1.7), rim: null });
        S.cel([[ax - 8, ay - 6], [ax + 4, ay - 8], [ax + 14, ay - 2], [ax + 21, ay + 4], [ax + 21, ay + 10], [ax - 9, ay + 10]], dark ? dk(c.skin) : c.skin, { shadow: c.skinD, depth: 3, line: S.L(2.0), rim: null });
        S.line([[ax - 2, ay + 8], [ax + 8, ay + 0], [ax + 16, ay + 6]], { w: 1.8, color: c.red, taper: 0.2 });
        [8, 12, 16].forEach((x) => S.line([[ax + x + 5, ay + 6], [ax + x + 5.5, ay + 9]], { w: 0.9, color: c.skinD, taper: 0.4 }));
      } },
    ];
    const pants = {
      id: 'pants', bone: 'hips', box: [-58, -84, 60, -36], sway: { px: 0, py: -74, amp: 0.03, freq: 0.4, phase: 0.2, drag: 0.4 },
      draw(S) {
        S.g.translate(2, 0); S.g.scale(1.14, 1); S.g.translate(-2, 0);
        S.cel([[-26, -80], [28, -80], [36, -60], [38, -44], [16, -38], [2, -46], [-14, -38], [-34, -44], [-34, -60]], c.robe, { shadow: c.robeD, depth: 6, line: S.L(3), halftone: { d: 4.2, alpha: 0.3, color: '#1a0a02' } });
        S.line([[-12, -74], [-14, -50]], { w: 1.3, color: c.robeL, taper: 0.4 });
        S.line([[14, -74], [18, -48]], { w: 1.3, color: c.robeL, taper: 0.4 });
      },
    };
    const sashTail = {
      id: 'sashTail', bone: 'torso', box: [-70, -110, -8, -20],
      chain: { spine: [[-16, -80], [-32, -68], [-42, -50], [-46, -30]], cuts: [0.5], reach: 24, sway: { amp: 0.18, freq: 0.5, phase: 0.7, drag: 1.4 } },
      draw(S) {
        S.lock([[-16, -80], [-32, -68], [-42, -50], [-46, -30]], c.sash, { wMax: 16, w0: 12, w1: 10, cap: 'flat', tipPow: 1, shadow: c.sashD, line: S.L(2.2), gloss: false, strands: 0 });
        S.lock([[-12, -84], [-28, -80], [-40, -66], [-46, -52]], c.sash, { wMax: 14, w0: 10, w1: 8, cap: 'flat', tipPow: 1, shadow: c.sashD, line: S.L(2.2), gloss: false, strands: 0 });
      },
    };
    const torso = {
      id: 'torso', bone: 'torso', box: [-60, -146, 62, -60],
      draw(S) {
        S.g.translate(2, 0); S.g.scale(1.18, 1); S.g.translate(-2, 0);
        tube(S, 2, -142, -124, 17, 18, c.skin, { shadow: c.skinD, depth: 4, line: S.L(2.0), capTop: 0, capBot: 0.05, rim: null });
        // bare chest and belly with two muscle lines
        S.cel([[-22, -128], [2, -134], [26, -128], [28, -100], [26, -80], [-26, -80], [-28, -100]], c.skin, { shadow: c.skinD, depth: 7, line: S.L(3), rim: c.rim });
        S.line([[2, -120], [3, -104], [2, -90]], { w: 1.3, color: c.skinD, taper: 0.3 });
        S.line([[-12, -108], [-2, -104]], { w: 1.2, color: c.skinD, taper: 0.4, alpha: 0.9 });
        S.line([[16, -108], [6, -104]], { w: 1.2, color: c.skinD, taper: 0.4, alpha: 0.9 });
        // open robe panels
        S.cel([[-27, -126], [-12, -134], [-6, -132], [-14, -106], [-10, -78], [-32, -76], [-34, -102]], c.robe, { shadow: c.robeD, depth: 6, line: S.L(3), halftone: { d: 4, alpha: 0.3, color: '#1a0a02' } });
        S.cel([[8, -132], [20, -134], [32, -126], [34, -102], [32, -76], [14, -78], [12, -106]], c.robe, { shadow: c.robeD, depth: 6, line: S.L(3), halftone: { d: 4, alpha: 0.3, color: '#1a0a02' } });
        S.line([[-12, -132], [-16, -106], [-13, -80]], { w: 2, color: c.trim, taper: 0.1 });
        S.line([[10, -132], [13, -106], [13, -80]], { w: 2, color: c.trim, taper: 0.1 });
        // the big sash with a knot
        S.cel([[-27, -91], [29, -91], [30, -75], [-28, -75]], c.sash, { shadow: c.sashD, depth: 5, line: S.L(3), tension: 0.22, halftone: { d: 4, alpha: 0.26, color: '#8a3c00' } });
        S.line([[-26, -83], [28, -83]], { w: 1.4, color: c.sashD, taper: 0.1, alpha: 0.9 });
        S.cel([[-24, -96], [-8, -94], [-6, -70], [-22, -68]], c.sashD, { shadow: '#8a3c00', depth: 3, line: S.L(2.2), rim: null, tension: 0.3 });
        S.cel(S.ell(-15, -82, 4.4, 4.4, 8), c.sash, { shadow: c.sashD, depth: 1.5, line: S.L(1.7), rim: null });
        // juzu beads
        const n = 13;
        for (let i = 0; i < n; i++) {
          const u = i / (n - 1), x = lerp(-15, 19, u), y = -130 + Math.sin(u * PI) * 30 - (Math.abs(u - 0.5) < 0.05 ? 0 : 0);
          S.cel(S.ell(x, y, 4.1, 4.1, 7), i === 6 ? c.red : c.bead, { shadow: c.beadD, depth: 1.6, line: S.L(1.6), rim: null });
        }
        S.cel([[0, -100], [4, -100], [5, -90], [-1, -90]], c.red, { shadow: '#a01818', depth: 1, line: S.L(1.6), rim: null });
      },
    };
    const fistArt = (S, mirror) => {
      // knuckles point up (-y) in weapon space: the block of the hand, four finger bumps, the thumb across, and the wrapping bands
      S.cel([[-11, -2], [-11, -12], [-5, -17], [4, -17], [10, -12], [11, -2], [9, 7], [0, 10], [-9, 7]], c.wrap, { shadow: c.wrapD, depth: 4, line: S.L(2.3), rim: c.rim, tension: 0.8 });
      [-6.5, -2.2, 2.2, 6.5].forEach((dx) => S.line([[dx, -17], [dx * 0.95, -8]], { w: 1.3, color: c.wrapD, taper: 0.3, alpha: 0.95 }));
      [-8.5, -4.3, 0, 4.3, 8.5].forEach((dx) => S.cel(S.ell(dx * 0.98, -16.5, 2.3, 1.8, 6), c.wrap, { shadow: false, depth: 0.5, line: S.L(1.1), rim: null, hi: false }));
      S.cel([[-13, -1], [-10, -8], [-3, -7], [-1, 0], [-6, 5], [-12, 4]], c.wrap, { shadow: c.wrapD, depth: 2, line: S.L(1.8), rim: null, tension: 0.7 });
      S.line([[-11, 3], [11, 3]], { w: 1.8, color: c.red, taper: 0.1 });
      S.line([[-9, 7], [9, 7]], { w: 1.2, color: c.wrapD, taper: 0.2 });
      void mirror;
    };
    fistArtRef = fistArt;
    const weapon = {   // the near fist (knuckles point up in weapon space; wa says where they point)
      id: 'weapon', bone: 'weapon', box: [W[0] - 24, W[1] - 26, W[0] + 24, W[1] + 22],
      draw(S) { S.g.translate(W[0], W[1]); fistArt(S); },
    };

    // ------------------------------------------------------------------ live fx: crackling lightning
    const bolt = (ctx, x0, y0, x1, y1, seed, w, jag) => tk.bolt(ctx, x0, y0, x1, y1, { seed, w, jag });
    const crackle = (ctx, x, y, r, t, n, seedBase, pw) => {
      const q = Math.floor(t * 14);
      tk.glow(ctx, x, y, r * 1.1, '#5fd0ff', 0.35 + 0.35 * pw);
      for (let i = 0; i < n; i++) {
        const rr = tk.rng('crk', seedBase, q, i), a = rr() * TAU, l = r * (0.5 + rr() * 0.7);
        bolt(ctx, x + Math.cos(a) * 4, y + Math.sin(a) * 4, x + Math.cos(a) * l, y + Math.sin(a) * l, q * 31 + i + seedBase, 1.4 + pw, 6 + 6 * pw);
      }
    };
    const stormFx = {
      id: 'storm', bone: 'root', live(ctx, st) {
        const K = st.K, t = st.t, pw = clamp(K.power, 0, 1), m = st.motion;
        const hn = st.at('hand'), hf = st.at('farHand');
        const idleK = 0.35 + 0.65 * pw;
        crackle(ctx, hn[0], hn[1], 18 + 20 * pw, t, 2 + Math.round(pw * 3), 1, pw * idleK);
        crackle(ctx, hf[0], hf[1], 16 + 16 * pw, t, 2 + Math.round(pw * 2), 2, pw * idleK);
        if (pw > 0.4 || st.pose === 'cast') {
          const q = Math.floor(t * 14);
          bolt(ctx, hn[0], hn[1], hf[0], hf[1], q, 2, 10);
        }
        if (st.pose === 'attack' && K.trail > 0.1) {
          ctx.save(); ctx.globalAlpha = ctx.globalAlpha * K.trail;
          const u = clamp((st.p - 0.3) / 0.4, 0, 1);
          ctx.beginPath(); ctx.ellipse(hn[0] + 24, hn[1], 8 + u * 36, 16 + u * 44, 0, 0, TAU); ctx.lineWidth = 4 - u * 2.5; ctx.strokeStyle = tk.rgba('#eaffff', 1 - u * 0.7); ctx.stroke();
          ctx.restore();
          bolt(ctx, hn[0] - 10, hn[1], hn[0] + 110 + u * 60, hn[1] - 10 + u * 8, Math.floor(t * 16), 3, 14);
        }
        if (st.pose === 'cast' && K.power > 0.4) {
          const q = Math.floor(t * 12), top = -420;
          const bx0 = 82 + Math.sin(q) * 10;
          bolt(ctx, bx0, top, 86, -30, q + 4, 3.4, 26);
          tk.glow(ctx, 86, -30, 60, '#eaffff', 0.5 * K.power);
        }
        for (let i = 0; i < 4; i++) { const ph = (t * 0.7 + i * 0.25) % 1; tk.sparkle(ctx, hn[0] + Math.sin(ph * 12 + i) * 14, hn[1] - ph * 22, 2.4 * (1 - ph) + 0.6, { color: '#eaffff', alpha: (1 - ph) * m, glow: 0.3 }); }
      },
    };

    const spec = defineHero({
      id: 'raiga', col: c, rig: { shF: R.shF, shB: R.shB, hipF: R.hipF, hipB: R.hipB, arm: R.arm, HC: R.HC, neck: R.neck }, lm, skull, fringeShadow, faceBox: [-64, -64, 72, 66],
      drawFace: drawFaceStd, wing: 0.35, lash: 1.1, browThick: 4.4,
      anchors: {
        head: ['head', [HC[0], HC[1]]], hand: ['weapon', [W[0], W[1] - 6]], tip: ['weapon', [W[0], W[1] - 18]], bladeMid: ['weapon', [W[0], W[1] + 2]],
        farHand: ['armB2', [R.shB[0], R.shB[1] + R.arm[0] + R.arm[1] + 6]], chest: ['torso', [0, -104]], feet: ['root', [0, 0]], weapon: ['weapon', [W[0], W[1] - 18]],
      },
      parts: [
        bandTails, hairBack, sashTail,
        { id: 'armB1', bone: 'armB1', box: [bx - 22, -134, bx + 22, -88], draw: (S) => armUpper(S, bx, -124, true) },
        { id: 'armB2', bone: 'armB2', box: [bx - 22, -104, bx + 22, -48], draw: (S) => armLower(S, bx, -98, true) },
        ...legParts('B', R.hipB, true), ...legParts('F', R.hipF, false),
        pants, torso, face, bangs, band, sideN,
        { id: 'armF1', bone: 'armF1', box: [kx - 22, -134, kx + 22, -88], draw: (S) => armUpper(S, kx, -124, false) },
        { id: 'armF2', bone: 'armF2', box: [kx - 22, -104, kx + 22, -56], draw: (S) => armLower(S, kx, -98, false) },
        weapon, stormFx,
      ],
      poses: {
        idle: { frames: [[0, { hx: 48, hy: 2, wa: 1.5, bhx: 14, bhy: 38, torsoRot: 0.04, hipsDy: 7, fx: -16, bfx: 20, mouth: 'smile', eyes: 'open' }]] },
        attack: { frames: [
          [0.00, { hx: 48, hy: 2, wa: 1.5, bhx: 14, bhy: 38, hipsDy: 7, fx: -16, bfx: 20 }],
          [0.24, { bx: -10, brot: -0.1, torsoRot: -0.22, headRot: 0.08, hipsDy: 12, hx: 6, hy: 30, wa: 0.8, bhx: 30, bhy: 6, fx: -20, bfx: 22, eyes: 'determined', mouth: 'grit', brow: 0.7, power: 0.5, wind: 1.4 }],
          [0.42, { bx: 24, brot: 0.14, torsoRot: 0.3, headRot: -0.1, hipsDy: 12, hx: 58, hy: 0, wa: 1.57, bhx: 20, bhy: 20, fx: -16, bfx: 32, eyes: 'angry', mouth: 'shout', brow: 0.9, power: 1, trail: 1, wind: 3 }],
          [0.66, { bx: 28, brot: 0.1, torsoRot: 0.24, hipsDy: 10, hx: 56, hy: 4, wa: 1.57, bhx: 20, bhy: 22, eyes: 'determined', mouth: 'grin', brow: 0.4, power: 0.5, trail: 0.4, wind: 2 }],
          [1.00, { bx: 6, brot: 0.03, torsoRot: 0.05, hipsDy: 8, hx: 36, hy: 16, wa: 1.2, bhx: 30, bhy: 6, fx: -14, bfx: 18, mouth: 'smile' }],
        ] },
        cast: { frames: [
          [0.00, { hx: 48, hy: 2, wa: 1.5, bhx: 14, bhy: 38, hipsDy: 7, fx: -16, bfx: 20 }],
          [0.32, { bx: -3, hipsDy: 14, torsoRot: -0.05, hx: 12, hy: 36, wa: 1.5, bhx: 34, bhy: 26, eyes: 'closed', mouth: 'grit', brow: 0.5, glow: 0.6, power: 0.5, fx: -16, bfx: 22, wind: 1.6 }],
          [0.66, { bx: 6, hipsDy: 8, torsoRot: 0.06, headRot: -0.05, hx: 46, hy: -14, wa: 1.2, bhx: 50, bhy: -8, eyes: 'determined', mouth: 'shout', brow: 0.6, glow: 1, power: 1, wind: 2.8 }],
          [1.00, { bx: 6, hipsDy: 8, torsoRot: 0.06, hx: 46, hy: -14, wa: 1.2, bhx: 50, bhy: -8, eyes: 'determined', mouth: 'grin', glow: 0.8, power: 0.8, wind: 2 }],
        ] },
        hurt: { ease: 'outQuad', frames: [
          [0.00, { hx: 48, hy: 2, wa: 1.5, bhx: 14, bhy: 38, hipsDy: 7, fx: -16, bfx: 20 }],
          [0.25, { bx: -13, brot: -0.2, torsoRot: -0.26, headRot: -0.2, hipsDy: 4, hx: 10, hy: 34, wa: 0.6, bhx: -8, bhy: 34, fx: -20, bfx: 8, eyes: 'hurt', mouth: 'open', brow: -0.4, wind: 2.8 }],
          [0.60, { bx: -8, brot: -0.12, torsoRot: -0.13, headRot: -0.1, hipsDy: 6, hx: 22, hy: 28, wa: 0.9, eyes: 'hurt', mouth: 'open', brow: -0.3, wind: 2 }],
          [1.00, { bx: -3, brot: -0.05, torsoRot: -0.03, hipsDy: 7, hx: 34, hy: 18, wa: 1.15, eyes: 'half', mouth: 'grit', brow: 0.4 }],
        ] },
        block: { frames: [
          [0.00, { hx: 48, hy: 2, wa: 1.5, bhx: 14, bhy: 38, hipsDy: 7, fx: -16, bfx: 20 }],
          [0.40, { bx: -3, brot: -0.04, hipsDy: 13, torsoRot: 0.06, hx: 34, hy: -4, wa: 0.4, bhx: 34, bhy: 2, fx: -18, bfx: 24, eyes: 'determined', mouth: 'grit', brow: 0.9, power: 0.6, glow: 0.4, wind: 1.8 }],
          [1.00, { bx: -3, brot: -0.04, hipsDy: 13, torsoRot: 0.06, hx: 34, hy: -4, wa: 0.4, bhx: 34, bhy: 2, fx: -18, bfx: 24, eyes: 'determined', mouth: 'grit', brow: 0.9, power: 0.6, glow: 0.4, wind: 1.4 }],
        ] },
        down: { ease: 'outQuad', frames: [
          [0.00, { hx: 48, hy: 2, wa: 1.5, bhx: 14, bhy: 38, hipsDy: 7, fx: -16, bfx: 20 }],
          [0.45, { bx: 4, brot: 0.04, hipsDy: 30, torsoRot: 0.2, headRot: 0.3, hx: 20, hy: 40, wa: 2.4, bhx: 24, bhy: 40, fx: -12, bfx: 20, eyes: 'closed', mouth: 'flat', brow: -0.3, wind: 2 }],
          [1.00, { bx: 5, brot: 0.05, hipsDy: 36, torsoRot: 0.26, headRot: 0.4, hx: 20, hy: 42, wa: 2.5, bhx: 24, bhy: 42, fx: -12, bfx: 20, eyes: 'closed', mouth: 'flat', brow: -0.4, wind: 0.8 }],
        ] },
        cheer: { frames: [
          [0.00, { hx: 48, hy: 2, wa: 1.5, bhx: 14, bhy: 38, hipsDy: 7, fx: -16, bfx: 20 }],
          [0.22, { hipsDy: 16, torsoRot: -0.06, hx: 20, hy: 34, wa: 1.0, bhx: 22, bhy: 34, fx: -16, bfx: 20, eyes: 'happy', mouth: 'grin', blush: 0 }],
          [0.45, { by: -30, hipsDy: -4, hx: -40, hy: -34, wa: 0.1, bhx: 48, bhy: -34, fx: -14, fy: -30, bfx: 16, bfy: -34, eyes: 'happy', mouth: 'shout', wind: 3, glow: 0.7, power: 0.7 }],
          [0.72, { hipsDy: 10, hx: -38, hy: -30, wa: 0.1, bhx: 46, bhy: -30, eyes: 'happy', mouth: 'grin', wind: 2, glow: 0.5, power: 0.5 }],
          [1.00, { hipsDy: 4, hx: -38, hy: -32, wa: 0.1, bhx: 46, bhy: -30, torsoRot: -0.05, eyes: 'happy', mouth: 'grin', glow: 0.5, power: 0.4 }],
        ] },
        walk: { loop: 0.9, ease: 'inOutSine', frames: [
          [0.00, { fx: -28, bfx: 24, hipsDy: 8, hx: 30, hy: 22, wa: 1.0, bhx: 22, bhy: 20, torsoRot: 0.07, brot: 0.02 }],
          [0.25, { fx: -8, fy: -30, bfx: 8, by: -4, hipsDy: 5, hx: 28, hy: 24, wa: 1.0, bhx: 24, bhy: 18, torsoRot: 0.07, brot: 0.02 }],
          [0.50, { fx: 24, bfx: -28, hipsDy: 8, hx: 26, hy: 20, wa: 1.0, bhx: 26, bhy: 22, torsoRot: 0.07, brot: 0.02 }],
          [0.75, { fx: 8, bfx: -8, bfy: -30, by: -4, hipsDy: 5, hx: 28, hy: 24, wa: 1.0, bhx: 24, bhy: 18, torsoRot: 0.07, brot: 0.02 }],
          [1.00, { fx: -28, bfx: 24, hipsDy: 8, hx: 30, hy: 22, wa: 1.0, bhx: 22, bhy: 20, torsoRot: 0.07, brot: 0.02 }],
        ], still: true },
      },
      bounds: { w: 140, h: 250, head: { x: 4, y: -184 }, hand: { x: 34, y: -104 }, feet: { x: 0, y: 0 }, weapon: { x: 56, y: -112 } },
    });
    bustFace(spec);
    void spec;
  })();

  // ===============================================================================================================
  // BUST PORTRAITS AND MEDALLIONS
  //   design space 300 x 400 (3:4), head centre (150, 170), head parts scaled by PK from chibi head space. Layers, back to front:
  //   back chains (animated) / back statics / body / face skin + features (per expression and blink) / front statics / front chains
  // ===============================================================================================================
  const PW = 300, PH = 400, PHC = [150, 176], PK = 1.7;
  const EXPR = {
    neutral: { eyes: 'open', mouth: null, brow: 0, blush: 0 },
    smile: { eyes: 'happy', mouth: 'grin', brow: -0.1, blush: 1 },
    angry: { eyes: 'angry', mouth: 'shout', brow: 0.9, blush: 0 },
    hurt: { eyes: 'hurt', mouth: 'open', brow: -0.5, blush: 0 },
    determined: { eyes: 'determined', mouth: 'smirk', brow: 0.55, blush: 0 },
  };
  const BUST = {};                                                           // hero id -> fn(S, spec): the body in design space
  const BUSTFX = {};                                                         // hero id -> fn(ctx, st): live extras in design space
  const taperPoly = (x0, y0, x1, y1, w0, w1) => {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    return [[x0 + nx * w0 / 2, y0 + ny * w0 / 2], [x1 + nx * w1 / 2, y1 + ny * w1 / 2], [x1 - nx * w1 / 2, y1 - ny * w1 / 2], [x0 - nx * w0 / 2, y0 - ny * w0 / 2]];
  };

  function bustSplit(spec) {
    if (spec._bustSplit) return spec._bustSplit;
    const fi = spec.parts.findIndex((p) => p.face);
    const heads = spec.parts.map((p, i) => ({ p, i })).filter((o) => o.p.bone === 'head' && !o.p.face);
    const out = { backC: [], backS: [], frontS: [], frontC: [] };
    heads.forEach((o) => {
      if (o.p.live) { (o.i < fi ? out.backS : out.frontS).push(o.p); return; }
      if (o.p.chain) (o.i < fi ? out.backC : out.frontC).push(o.p);
      else (o.i < fi ? out.backS : out.frontS).push(o.p);
    });
    spec._bustSplit = out;
    return out;
  }
  const bustS = (g, spec, bustBody) => makeS(g, spec, { k: bustBody ? 1 : PK, bust: true });
  const sqOf = (sc) => Math.max(0.125, Math.min(2.5, Math.ceil(sc * 8) / 8));
  const headPart = (g, spec, part) => { g.save(); g.translate(PHC[0], PHC[1]); if (part.live) { part.live(g, { spec, K: spec.poses.idle.frames[0][1], t: 0, pt: 0, p: 0, pose: 'idle', motion: 0, at: () => [0, 0], bust: true }); } else part.draw(bustS(g, spec, false)); g.restore(); };

  // the sumi backdrop of every portrait: a wet wash, a dry-brush enso circle in the hero's colour, splatter and a corner screen-tone
  function bustBackdrop(g, spec) {
    const c = spec.col, cx = 150, cy = 200, R = 132, r = tk.rng('enso', spec.id);
    g.save();
    const gr = g.createRadialGradient(cx, cy, 20, cx, cy, R + 40);
    gr.addColorStop(0, tk.rgba(c.aura, 0.34)); gr.addColorStop(0.7, tk.rgba(c.aura, 0.14)); gr.addColorStop(1, tk.rgba(c.aura, 0));
    g.fillStyle = gr; g.fillRect(0, 0, PW, PH);
    const a0 = -2.5 + r() * 0.5, a1 = a0 + 5.5 + r() * 0.4;
    const arc = (rad, n) => tk.arcPts(cx, cy, rad, rad * 0.98, a0, a1, n || 22);
    tk.inkPath(g, arc(R), { w: 30, color: tk.rgba(c.aura, 0.62), taper: 0.32, pressure: (u) => 0.35 + 0.65 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.08)), 0.7), wobble: 0.3, seed: 3, freq: 0.03, step: 6 });
    tk.inkPath(g, arc(R + 4), { w: 8, color: tk.rgba(pal.ink, 0.45), taper: 0.4, pressure: 'mid', wobble: 0.5, seed: 5, freq: 0.05, step: 6 });
    for (let i = 0; i < 9; i++) tk.inkPath(g, arc(R - 12 + i * 3.2, 18), { w: 1.4, color: tk.rgba('#ffffff', 0.32), taper: 0.45, pressure: 'mid', wobble: 0.6, seed: 10 + i, step: 6 });
    for (let i = 0; i < 16; i++) {
      const a = r() * Math.PI * 2, d = R + 22 + r() * 60, rr = 1.4 + r() * 4.6;
      tk.inkBlot(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.98, rr, { color: i % 4 === 0 ? pal.gold : (i % 2 ? tk.rgba(c.aura, 0.8) : tk.rgba(pal.ink, 0.55)), seed: i, n: 8 });
    }
    tk.halftoneRamp(g, 0, 210, 150, 190, { d: 8, dir: 2.3, r0: 0.3, r1: 3.2, color: c.aura, alpha: 0.32 });
    tk.halftoneRamp(g, 170, 0, 130, 140, { d: 8, dir: -0.9, r0: 0.3, r1: 2.8, color: pal.ink, alpha: 0.22 });
    g.restore();
  }
  function bustSprite(spec, layer, extra, sq, w, h, fn) {
    return ART.sprite('hero|' + spec.id + '|bust|' + layer + '|' + extra + '|' + sq, w * sq, h * sq, (g) => { g.scale(sq, sq); fn(g); });
  }
  function bustChain(spec, part, sq) {
    const key = part.id + '|' + sq;
    spec._bchains = spec._bchains || {};
    let c = spec._bchains[key];
    if (c) return c;
    const sp = part.chain.spine.map((p) => [PHC[0] + p[0] * PK, PHC[1] + p[1] * PK]);
    c = tk.chain('hero|' + spec.id + '|bustchain|' + part.id, {
      spine: sp, cuts: part.chain.cuts, reach: (part.chain.reach || 30) * PK, overlap: 6,
      draw: (g) => { g.save(); g.translate(PHC[0], PHC[1]); part.draw(bustS(g, spec, false)); g.restore(); },
    });
    spec._bchains[key] = c;
    return c;
  }
  function chainBends(part, c, t, m) {
    const sw = part.chain.sway || {}, nj = c.segs.length, b = new Array(nj);
    for (let j = 0; j < nj; j++) {
      const gain = sw.gain ? sw.gain[j] : 0.3 + 0.55 * j;
      b[j] = m * 0.75 * num(sw.amp, 0.12) * gain * Math.sin(TAU * (num(sw.freq, 0.45) * t + num(sw.phase, 0)) - num(sw.lag, 0.8) * j);
    }
    return b;
  }

  function drawPortrait(ctx, id, o) {
    const spec = SPECS[id];
    o = o || {};
    const x = num(o.x, 0), y = num(o.y, 0);
    if (!spec || !spec.bust) { ART.placeholder(ctx, String(id) + ' ' + (o.expr || 'neutral'), x, y, pos(o.w, 150), pos(o.h, 200)); return; }
    const w = pos(o.w, 150), h = pos(o.h, 200), t = num(o.t, 0), m = tk.motion();
    const sc = Math.max(w / PW, h / PH), sq = sqOf(sc);
    const ex = EXPR[o.expr] || EXPR.neutral;
    const dx = x + (w - PW * sc) / 2, dy = y;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.translate(dx, dy); ctx.scale(sc, sc);
    const sp = bustSplit(spec), small = sc < 0.3;
    const breathe = Math.sin(TAU * t / 3.2 + hash01(id, 'life') * TAU) * m, hy = breathe * 1.5, by = breathe * 0.7;
    tk.glow(ctx, PHC[0], PHC[1] + 20, 210, spec.col.aura, 0.16 + (o.glow ? 0.2 : 0));
    // back layer: animated chains, then static back hair
    ctx.save(); ctx.translate(0, hy);
    if (!small) sp.backC.forEach((p) => { const c = bustChain(spec, p, sq); c.draw(ctx, chainBends(p, c, t, m), sq); });
    const back = bustSprite(spec, 'back', 0, sq, PW, PH, (g) => { bustBackdrop(g, spec); sp.backS.forEach((p) => headPart(g, spec, p)); });
    ctx.drawImage(back, 0, 0, PW, PH);
    ctx.restore();
    ctx.save(); ctx.translate(0, by);
    const body = bustSprite(spec, 'body', 0, sq, PW, PH, (g) => spec.bust(bustS(g, spec, true), spec));
    ctx.drawImage(body, 0, 0, PW, PH);
    ctx.restore();
    // head group
    ctx.save(); ctx.translate(0, hy);
    let eyes = ex.eyes;
    if (eyes === 'open' || eyes === 'determined') { const b = blinkState(spec, t); if (b === 2) eyes = 'closed'; else if (b === 1 && eyes === 'open') eyes = 'half'; }
    const mouth = ex.mouth || spec.poses.idle.frames[0][1].mouth || 'smile';
    const fkey = eyes + '|' + mouth + '|' + ex.brow + '|' + ex.blush;
    const FB = [30, 60, 270, 290];
    const face = bustSprite(spec, 'face', fkey, sq, FB[2] - FB[0], FB[3] - FB[1], (g) => {
      g.translate(-FB[0], -FB[1]);
      g.save(); g.translate(PHC[0], PHC[1]);
      const S = bustS(g, spec, false);
      drawFaceBase(S); drawFaceFeatures(S, { eyes, mouth, brow: ex.brow, blush: ex.blush > 0.5 });
      g.restore();
    });
    ctx.drawImage(face, FB[0], FB[1], FB[2] - FB[0], FB[3] - FB[1]);
    const front = bustSprite(spec, 'front', 0, sq, PW, PH, (g) => sp.frontS.forEach((p) => headPart(g, spec, p)));
    ctx.drawImage(front, 0, 0, PW, PH);
    if (!small) sp.frontC.forEach((p) => { const c = bustChain(spec, p, sq); c.draw(ctx, chainBends(p, c, t, m), sq); });
    ctx.restore();
    if (!small && BUSTFX[id]) BUSTFX[id](ctx, { t, m, spec, expr: o.expr || 'neutral' });
    ctx.restore();
  }

  // round face icon: cached per hero and radius; hero-coloured disc with dots, the face, a gold rim
  function drawMedallion(ctx, id, x, y, r) {
    const spec = SPECS[id];
    r = pos(r, 24); x = num(x, 0); y = num(y, 0);
    if (!spec || !spec.bust) { ART.placeholder(ctx, String(id), x - r, y - r, r * 2, r * 2, { round: true }); return; }
    const rq = Math.round(r * 2) / 2;
    const spr = ART.sprite('hero|' + id + '|medal|' + rq, rq * 2 + 6, rq * 2 + 6, (g) => {
      const c = rq + 3;
      g.beginPath(); g.arc(c, c, rq, 0, TAU);
      const gr = g.createRadialGradient(c - rq * 0.3, c - rq * 0.4, rq * 0.1, c, c, rq);
      gr.addColorStop(0, tk.tint(spec.col.aura, 0.45)); gr.addColorStop(1, tk.shade(spec.col.aura, 0.25));
      g.fillStyle = gr; g.fill();
      g.save(); g.clip();
      tk.halftone(g, c - rq, c + rq * 0.1, rq * 2, rq * 0.9, { d: Math.max(3, rq * 0.16), color: pal.ink, alpha: 0.2, force: true });
      const sc = (rq * 2) / 214;
      g.translate(c - PHC[0] * sc, c - (PHC[1] + 6) * sc); g.scale(sc, sc);
      const sp = bustSplit(spec);
      sp.backC.forEach((p) => { const ch = bustChain(spec, p, sqOf(sc)); ch.draw(g, null, sqOf(sc)); });
      sp.backS.forEach((p) => headPart(g, spec, p));
      g.save(); g.translate(0, 0);
      g.save(); g.translate(PHC[0], PHC[1]);
      const S = bustS(g, spec, false);
      const fe = spec.poses.idle.frames[0][1];
      drawFaceBase(S); drawFaceFeatures(S, { eyes: 'open', mouth: fe.mouth || 'smile', brow: 0, blush: false });
      g.restore(); g.restore();
      sp.frontS.forEach((p) => headPart(g, spec, p));
      sp.frontC.forEach((p) => { const ch = bustChain(spec, p, sqOf(sc)); ch.draw(g, null, sqOf(sc)); });
      g.restore();
      tk.inkPath(g, tk.ellipsePts(c, c, rq, rq, 24), { closed: true, w: Math.max(1.6, rq * 0.1), color: pal.gold, align: -0.4, weightVar: 0, wobble: 0 });
      tk.inkPath(g, tk.ellipsePts(c, c, rq + 1, rq + 1, 24), { closed: true, w: Math.max(1.6, rq * 0.09), color: pal.ink, align: 0.6, weightVar: 0.2, wobble: 0.05 });
    });
    ctx.drawImage(spr, x - rq - 3, y - rq - 3, rq * 2 + 6, rq * 2 + 6);
  }
  ART.hero.portrait = drawPortrait;
  ART.hero.medallion = drawMedallion;
  ART.hero.expressions = () => Object.keys(EXPR);

  // ------------------------------------------------------------------ bust bodies
  const shoulders = (wide) => [[-4 - wide, 400], [8 - wide, 354], [30 - wide * 0.6, 328], [66, 312], [108, 303], [132, 297], [158, 295], [186, 299], [212, 305], [246, 315], [276 + wide * 0.6, 333], [292 + wide, 357], [304 + wide, 400]];
  // the neck (wide w px) with the chin's cast shadow
  const bustNeck = (S, spec, w) => {
    const c = spec.col, g = S.g, nk = tubePts(154, 240, 316, w, w + 10, 0.1, 0);
    tk.celFill(g, nk, c.skin, { shadow: c.skinD, depth: 9, line: 3.2, rim: null, hi: false });
    g.save(); g.beginPath(); tk.trace(g, nk); g.clip();
    g.fillStyle = tk.rgba('#7a3a4a', 0.42); g.beginPath(); tk.trace(g, [[104, 250], [206, 250], [212, 280], [176, 294], [138, 290], [108, 276]]); g.fill();
    g.restore();
  };
  const seam = (g, pts, color, w) => tk.inkPath(g, pts, { w: w || 2.2, color, taper: 0.45, wobble: 0.1 });

  BUST.hanae = (S, spec) => {
    const c = spec.col, g = S.g;
    bustNeck(S, spec, 42);
    tk.celFill(g, shoulders(0), c.white, { shadow: c.whiteD, depth: 14, line: 3.6, rim: c.rim, rimW: 3, hi: true, hiW: 4, halftone: { d: 6, alpha: 0.18, color: '#c090b8' } });
    // the kosode showing in the V, then the two lapels as tapered ribbons
    tk.celFill(g, [[122, 300], [190, 300], [176, 354], [162, 400], [142, 400], [130, 352]], '#ffe6ef', { shadow: '#f2bcd0', depth: 6, line: 2.8, rim: null, hi: false });
    tk.ribbon(g, [[118, 296], [136, 342], [150, 400]], c.rose, { wMax: 22, w0: 18, w1: 12, cap: 'flat', tipPow: 1, shadow: c.roseD, line: 3, gloss: false, strands: 0, rim: null });
    tk.ribbon(g, [[196, 300], [180, 344], [166, 400]], '#f0578e', { wMax: 20, w0: 16, w1: 11, cap: 'flat', tipPow: 1, shadow: c.roseD, line: 3, gloss: false, strands: 0, rim: null });
    // sleeve seams, folds and the pink hem line
    seam(g, [[112, 304], [84, 320], [52, 342]], c.whiteD, 2.6); seam(g, [[192, 304], [226, 318], [258, 338]], c.whiteD, 2.6);
    seam(g, [[62, 350], [84, 372], [92, 398]], c.whiteD, 2); seam(g, [[244, 350], [232, 376], [236, 398]], c.whiteD, 2); seam(g, [[100, 346], [110, 372], [108, 398]], c.whiteD, 1.6);
    tk.inkPath(g, [[26, 372], [66, 350], [104, 342]], { w: 3.2, color: c.pink, taper: 0.4 });
    [[54, 372, 9], [92, 356, 7], [30, 392, 8], [238, 350, 9], [268, 376, 8], [214, 338, 6]].forEach((b, i) => blossom(S, b[0], b[1], b[2], i % 2 ? '#ffc2dc' : '#ff9cc6', c.gold, i, { line: 1.6, depth: 1, shadow: false, rim: null, hi: false }));
    // the rose obi at the very bottom
    tk.celFill(g, [[-4, 386], [150, 380], [304, 384], [304, 404], [-4, 404]], c.rose, { shadow: c.roseD, depth: 5, line: 3, rim: null, tension: 0.3 });
    tk.inkPath(g, [[0, 393], [150, 388], [300, 392]], { w: 2, color: c.gold, taper: 0.1 });
    // the katana: hilt, flower tsuba and the blade climbing out of the frame
    tk.celFill(g, taperPoly(276, 330, 330, 232, 15, 7), c.steel, { shadow: c.steelD, depth: 4, line: 3, rim: '#ffffff', rimW: 1.4, tension: 0.15 });
    tk.inkPath(g, [[282, 322], [306, 282], [326, 246]], { w: 1.8, color: '#ffffff', taper: 0.3, alpha: 0.9 });
    tk.celFill(g, taperPoly(226, 388, 264, 342, 15, 14), c.rose, { shadow: c.roseD, depth: 3, line: 3, rim: null, tension: 0.15 });
    tk.inkPath(g, [[236, 372], [252, 366], [244, 352]], { w: 2, color: '#ffffff', taper: 0.2, alpha: 0.9 });
    blossom({ g, L: S.L, ell: S.ell, cel: (pts, base, oo) => tk.celFill(g, pts, base, Object.assign({ line: 3 }, oo)) }, 270, 336, 26, '#ffd6ea', c.gold, 0.3, { shadow: '#e59ac0', rim: null });
  };
  BUSTFX.hanae = (ctx, st) => {
    for (let i = 0; i < 6; i++) {
      const ph = (st.t * 0.14 + i * 0.17) % 1, x = 250 - ph * 230 + Math.sin(st.t * 1.3 + i * 2) * 16, y = 40 + ph * 300 + Math.sin(st.t * 2 + i) * 8;
      petal(ctx, x, y, 7 + (i % 3) * 2, st.t * 1.2 + i, Math.sin(ph * PI) * 0.9 * st.m, i % 2 ? '#ffc2dc' : '#ff9cc6');
    }
  };

  BUST.kuro = (S, spec) => {
    const c = spec.col, g = S.g, hal = { d: 5.5, alpha: 0.3, color: '#05031a' };
    bustNeck(S, spec, 40);
    tk.celFill(g, shoulders(-4), c.coat, { shadow: c.coatD, depth: 16, line: 3.6, rim: c.rim, rimW: 3, hi: c.coatL, hiW: 4, halftone: hal });
    // paper shirt with its stand collar, then the coat lapels
    tk.celFill(g, [[130, 300], [184, 298], [176, 352], [160, 400], [146, 400], [136, 352]], c.paper, { shadow: c.paperD, depth: 6, line: 2.8, rim: null, hi: false });
    tk.celFill(g, [[130, 284], [182, 282], [188, 302], [126, 304]], c.paper, { shadow: c.paperD, depth: 4, line: 2.8, rim: null, hi: false, tension: 0.4 });
    tk.celFill(g, [[128, 298], [110, 302], [88, 338], [104, 400], [146, 400], [134, 352]], c.coat, { shadow: c.coatD, depth: 9, line: 3.2, rim: c.rim, hi: c.coatL, hiW: 3, halftone: hal });
    tk.celFill(g, [[184, 298], [204, 304], [228, 340], [214, 400], [174, 400], [186, 352]], c.coat, { shadow: c.coatD, depth: 9, line: 3.2, rim: c.rim, hi: c.coatL, hiW: 3, halftone: hal });
    seam(g, [[128, 302], [134, 352], [146, 398]], c.trim, 2.4); seam(g, [[184, 302], [186, 352], [176, 398]], c.trim, 2.4);
    // the tall stand-up collar, in angular panels
    tk.celFill(g, [[100, 308], [94, 258], [112, 236], [136, 250], [140, 298], [120, 314]], c.coat, { shadow: c.coatD, depth: 9, line: 3.4, rim: c.rim, tension: 0.32, hi: c.coatL, hiW: 3, halftone: hal });
    tk.celFill(g, [[170, 296], [176, 246], [200, 228], [224, 246], [224, 308], [196, 316]], c.coat, { shadow: c.coatD, depth: 9, line: 3.4, rim: c.rim, tension: 0.32, hi: c.coatL, hiW: 3, halftone: hal });
    seam(g, [[98, 296], [100, 262], [114, 242]], c.trim, 2.6); seam(g, [[220, 300], [220, 258], [204, 236]], c.trim, 2.6);
    // shoulder seams, folds and glowing calligraphy
    seam(g, [[104, 316], [70, 326], [40, 350]], c.coatL, 2.4); seam(g, [[222, 320], [252, 328], [280, 350]], c.coatL, 2.4);
    [[[40, 392], [62, 366], [54, 346]], [[262, 392], [280, 366], [270, 346]], [[64, 340], [92, 334], [112, 324]]].forEach((st, i) => { tk.inkPath(g, st, { w: 5, color: tk.rgba(c.trim, 0.35), taper: 0.3, seed: i }); tk.inkPath(g, st, { w: 2.2, color: c.trim, taper: 0.3, seed: i }); });
    [[20, 398, 9], [80, 402, 7], [232, 400, 8], [274, 394, 10]].forEach((b, i) => tk.inkBlot(g, b[0], b[1], b[2], { color: i % 2 ? '#ffffff' : c.trim, seed: i + 3, drips: 1 }));
    // the fude staff, climbing out of the frame at the right
    tk.celFill(g, taperPoly(272, 406, 246, 40, 15, 12), c.shaft, { shadow: c.shaftD, depth: 5, line: 3.2, rim: '#7a6bff', rimW: 2, tension: 0.15 });
    [346, 266, 186, 116].forEach((yy) => { const u = (406 - yy) / 366, cx = lerp(272, 246, u); tk.celFill(g, [[cx - 9, yy], [cx + 9, yy], [cx + 9, yy + 8], [cx - 9, yy + 8]], c.gold, { depth: 2, line: 2.4, shadow: false, rim: null, tension: 0.25, hi: false }); });
  };
  BUSTFX.kuro = (ctx, st) => {
    const c = st.spec.col, t = st.t, m = st.m;
    // the glowing brush head above the frame's right edge
    const bx = 240, by = 26, p = 0.5 + 0.5 * Math.sin(t * 3);
    tk.glow(ctx, bx, by + 10, 60 + 6 * p, '#5ff5ff', 0.6);
    ctx.save(); ctx.translate(bx, by);
    const pts = [[-10, 34], [10, 34], [20, 8], [15, -22], [0, -50, 1], [-15, -22], [-20, 8]];
    tk.celFill(ctx, pts, '#2a3a9a', { shadow: '#151a5a', depth: 5, line: 3.4, rim: null });
    ctx.save(); ctx.beginPath(); tk.trace(ctx, pts); ctx.clip();
    const gr = ctx.createLinearGradient(0, 34, 0, -50); gr.addColorStop(0, 'rgba(95,245,255,0)'); gr.addColorStop(0.5, 'rgba(95,245,255,0.8)'); gr.addColorStop(1, 'rgba(240,255,255,1)');
    ctx.fillStyle = gr; ctx.fillRect(-30, -60, 60, 100); ctx.restore();
    ctx.restore();
    for (let i = 0; i < 3; i++) { const a = t * 0.7 + i * TAU / 3, x = 40 + Math.cos(a) * 26, y = 250 + Math.sin(a) * 60 + Math.sin(t * 1.6 + i) * 4 * m, r = 10 + Math.sin(a) * 2; tk.glow(ctx, x, y, r * 2.4, '#7a6bff', 0.5); const gr2 = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r); gr2.addColorStop(0, '#8f86ff'); gr2.addColorStop(0.55, '#2f2a80'); gr2.addColorStop(1, '#0d0a34'); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = gr2; ctx.fill(); ctx.lineWidth = 2.6; ctx.strokeStyle = pal.ink; ctx.stroke(); ctx.beginPath(); ctx.ellipse(x - r * 0.34, y - r * 0.4, r * 0.28, r * 0.18, -0.6, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill(); }
    void c;
  };

  BUST.suzu = (S, spec) => {
    const c = spec.col, g = S.g, hal = { d: 6, alpha: 0.18, color: '#8a9ed0' };
    bustNeck(S, spec, 40);
    tk.celFill(g, shoulders(0), c.white, { shadow: c.whiteD, depth: 14, line: 3.4, rim: c.rim, rimW: 3, hi: true, hiW: 4, halftone: hal });
    // crossed red collar as two ribbons, the himo band and the mizuhiki knot
    tk.ribbon(g, [[116, 298], [138, 340], [160, 384]], c.red, { wMax: 24, w0: 18, w1: 12, cap: 'flat', tipPow: 1, shadow: c.redD, line: 3, gloss: false, strands: 0, rim: null });
    tk.ribbon(g, [[194, 302], [176, 338], [150, 382]], c.redL, { wMax: 22, w0: 16, w1: 12, cap: 'flat', tipPow: 1, shadow: c.red, line: 3, gloss: false, strands: 0, rim: null });
    tk.celFill(g, [[126, 366], [176, 362], [178, 378], [126, 382]], c.white, { shadow: c.whiteD, depth: 3, line: 2.6, rim: null, tension: 0.3 });
    tk.celFill(g, [[140, 350], [152, 340], [166, 350], [152, 362]], c.red, { shadow: c.redD, depth: 2, line: 2.4, rim: null });
    tk.celFill(g, tk.ellipsePts(153, 351, 4, 4, 6), c.white, { shadow: false, depth: 1, line: 1.6, rim: null });
    // the two wide detached sleeves at the shoulders: red hem, blue lining
    const sl = (x0, dir) => {
      const pts = dir > 0 ? [[x0, 322], [x0 + 38, 302], [x0 + 82, 308], [x0 + 100, 338], [x0 + 96, 400], [x0 - 4, 400]] : [[x0, 322], [x0 - 38, 302], [x0 - 82, 308], [x0 - 100, 338], [x0 - 96, 400], [x0 + 4, 400]];
      tk.celFill(g, pts, c.white, { shadow: c.whiteD, depth: 14, line: 3.6, rim: c.rim, rimW: 3, hi: true, hiW: 4, halftone: hal });
      const hem = dir > 0 ? [[x0 - 2, 370], [x0 + 98, 370], [x0 + 96, 388], [x0 - 4, 390]] : [[x0 + 2, 370], [x0 - 98, 370], [x0 - 96, 388], [x0 + 4, 390]];
      tk.celFill(g, hem, c.red, { shadow: c.redD, depth: 3, line: 2.6, rim: null, hi: false, tension: 0.3 });
      seam(g, dir > 0 ? [[x0 + 28, 322], [x0 + 40, 352]] : [[x0 - 28, 322], [x0 - 40, 352]], c.whiteD, 2);
      seam(g, dir > 0 ? [[x0 + 58, 326], [x0 + 62, 356]] : [[x0 - 58, 326], [x0 - 62, 356]], c.whiteD, 1.6);
    };
    sl(4, 1); sl(296, -1);
    // the gohei at the right
    tk.celFill(g, taperPoly(252, 406, 246, 196, 10, 8), c.wood, { shadow: c.woodD, depth: 3, line: 3, rim: '#ffffff', rimW: 1.4, tension: 0.15 });
    [340, 262].forEach((yy) => tk.celFill(g, [[240, yy], [258, yy], [258, yy + 12], [240, yy + 12]], c.red, { shadow: c.redD, depth: 2, line: 2.4, rim: null, tension: 0.25, hi: false }));
    tk.celFill(g, tk.ellipsePts(246, 190, 10, 10, 10), c.gold, { shadow: '#c8983a', depth: 3, line: 2.6, rim: '#fff2c8' });
  };
  BUSTFX.suzu = (ctx, st) => {
    const t = st.t, m = st.m;
    // paper streamers of the gohei and orbiting ofuda
    for (let s = -1; s <= 1; s += 2) {
      const sway = Math.sin(t * 1.8 + s) * 4 * m, pts = [];
      for (let i = 0; i <= 6; i++) pts.push([246 + s * (12 + i * 2.4) + (i % 2 ? 5 : -5) + sway * i * 0.18, 190 + i * 14]);
      const p2 = pts.map((p) => [p[0] - s * 13, p[1] + 6]).reverse();
      tk.celFill(ctx, { poly: pts.concat(p2) }, '#fcfcff', { shadow: '#b6c4ec', depth: 4, line: 2.6, rim: null });
    }
    const ofuda = (x, y, rot, s) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath(); ctx.rect(-8 * s, -19 * s, 16 * s, 38 * s); ctx.fillStyle = '#fffaf0'; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = pal.ink; ctx.stroke();
      ctx.fillStyle = '#e8424f'; ctx.fillRect(-8 * s, -17 * s, 16 * s, 4 * s); ctx.fillRect(-8 * s, 13 * s, 16 * s, 4 * s);
      ctx.strokeStyle = '#c0182c'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-3 * s, -8 * s); ctx.lineTo(3 * s, -6 * s); ctx.moveTo(0, -8 * s); ctx.lineTo(0, 8 * s); ctx.moveTo(-4 * s, 0); ctx.lineTo(4 * s, 0); ctx.stroke(); ctx.restore();
    };
    for (let i = 0; i < 3; i++) { const a = t * 0.6 + i * TAU / 3; tk.glow(ctx, 44 + Math.cos(a) * 16, 150 + i * 60, 28, '#ffb0b4', 0.3); ofuda(44 + Math.cos(a) * 16, 150 + i * 60 + Math.sin(a * 1.3) * 5 * m, Math.sin(a) * 0.4 - 0.2, 1); }
    for (let i = 0; i < 6; i++) { const ph = (t * 0.1 + i * 0.17) % 1; tk.sparkle(ctx, 30 + i * 46, 350 - ph * 300, 4 + (i % 2) * 2, { color: '#e6f0ff', alpha: Math.sin(ph * PI) * m, glow: 0.4 }); }
  };

  BUST.raiga = (S, spec) => {
    const c = spec.col, g = S.g, hal = { d: 5.5, alpha: 0.3, color: '#1a0a02' };
    const nk = tubePts(154, 240, 316, 56, 66, 0.1, 0);
    tk.celFill(g, nk, c.skin, { shadow: c.skinD, depth: 10, line: 3.4, rim: null, hi: false });
    g.save(); g.beginPath(); tk.trace(g, nk); g.clip();
    g.fillStyle = tk.rgba('#5a2a0a', 0.42); g.beginPath(); tk.trace(g, [[100, 250], [208, 250], [214, 282], [176, 296], [136, 292], [102, 276]]); g.fill();
    g.restore();
    tk.celFill(g, shoulders(14), c.skin, { shadow: c.skinD, depth: 16, line: 3.8, rim: c.rim, rimW: 3, hi: true, hiW: 4 });
    // collarbones, pectorals and the belly line
    seam(g, [[104, 316], [130, 324], [152, 320]], c.skinD, 2.6); seam(g, [[204, 316], [180, 324], [158, 320]], c.skinD, 2.6);
    seam(g, [[112, 354], [136, 368], [152, 362]], c.skinD, 2.4); seam(g, [[198, 354], [176, 368], [158, 362]], c.skinD, 2.4);
    seam(g, [[154, 336], [157, 370], [155, 400]], c.skinD, 2.4);
    // open robe panels with a heavy orange trim
    tk.celFill(g, [[-6, 404], [2, 350], [34, 320], [84, 304], [120, 304], [126, 350], [108, 404]], c.robe, { shadow: c.robeD, depth: 14, line: 3.6, rim: c.rim, hi: c.robeL, hiW: 3, halftone: hal });
    tk.celFill(g, [[306, 404], [298, 350], [266, 320], [216, 304], [184, 304], [178, 350], [196, 404]], c.robe, { shadow: c.robeD, depth: 14, line: 3.6, rim: c.rim, hi: c.robeL, hiW: 3, halftone: hal });
    seam(g, [[122, 306], [128, 350], [110, 402]], c.trim, 4.4); seam(g, [[182, 306], [176, 350], [194, 402]], c.trim, 4.4);
    seam(g, [[30, 336], [60, 322], [92, 314]], c.robeL, 2.4); seam(g, [[276, 336], [246, 322], [214, 314]], c.robeL, 2.4);
    // juzu beads
    const n = 15;
    for (let i = 0; i < n; i++) { const u = i / (n - 1), x = lerp(112, 200, u), y = 304 + Math.sin(u * PI) * 70; tk.celFill(g, tk.ellipsePts(x, y, 8.4, 8.4, 9), i === 7 ? c.red : c.bead, { shadow: c.beadD, depth: 3, line: 2.4, rim: null, hi: false }); }
    tk.celFill(g, [[147, 372], [159, 372], [161, 398], [145, 398]], c.red, { shadow: '#a01818', depth: 2, line: 2.2, rim: null, tension: 0.3 });
  };
  BUSTFX.raiga = (ctx, st) => {
    const t = st.t, q = Math.floor(t * 14), fx = 236, fy = 350;
    tk.glow(ctx, fx, fy, 70, '#5fd0ff', 0.45);
    tk.celFill(ctx, tk.ellipsePts(fx, fy, 30, 28, 12), '#f8f2e4', { shadow: '#c8bca0', depth: 8, line: 3.4, rim: '#ffffff' });
    [-14, -5, 5, 14].forEach((dx) => tk.inkPath(ctx, [[fx + dx, fy - 26], [fx + dx * 0.9, fy - 12]], { w: 2.2, color: '#c8bca0', taper: 0.3 }));
    tk.inkPath(ctx, [[fx - 28, fy + 6], [fx + 28, fy + 6]], { w: 3.4, color: '#e8383d', taper: 0.1 });
    for (let i = 0; i < 5; i++) {
      const rr = tk.rng('pcrk', q, i), a = rr() * TAU, l = 40 + rr() * 40, pts = [[fx, fy]];
      for (let j = 1; j < 6; j++) { const u = j / 6, o = (rr() - 0.5) * 16 * Math.sin(u * PI); pts.push([fx + Math.cos(a) * l * u - Math.sin(a) * o, fy + Math.sin(a) * l * u + Math.cos(a) * o]); }
      tk.inkPath(ctx, { poly: pts }, { w: 6, color: tk.rgba('#5fd0ff', 0.4), taper: 0.2, wobble: 0, pressure: 'flat' });
      tk.inkPath(ctx, { poly: pts }, { w: 2.4, color: '#eaffff', taper: 0.25, wobble: 0, pressure: 'flat' });
    }
  };
  Object.keys(BUST).forEach((id) => { if (SPECS[id]) SPECS[id].bust = BUST[id]; });

  // ===============================================================================================================
  // public API and gallery sheets
  // ===============================================================================================================
  const KEYT = { attack: 0.36, cast: 0.75, hurt: 0.28, block: 1, down: 1, cheer: 0.45, idle: 0, walk: 0 };
  ART.hero.draw = drawHero;
  ART.hero.poseMs = (pose) => POSE_MS[pose] || 0;
  ART.hero.bounds = (id) => {
    const s = SPECS[id];
    const b = s ? s.bounds : { w: 130, h: 250, head: { x: 4, y: -186 }, hand: { x: 8, y: -80 }, feet: { x: 0, y: 0 }, weapon: { x: 80, y: -120 } };
    return { w: b.w, h: b.h, head: { x: b.head.x, y: b.head.y }, hand: { x: b.hand.x, y: b.hand.y }, feet: { x: b.feet.x, y: b.feet.y }, weapon: { x: b.weapon.x, y: b.weapon.y } };
  };
  ART.hero.pointAt = pointAt;
  ART.hero.keyPt = (pose) => (POSE_MS[pose] || 0) / 1000 * (KEYT[pose] === undefined ? 0.5 : KEYT[pose]);
  ART.hero.warm = warm;
  ART.hero.ids = () => Object.keys(SPECS);
  // Dev tool: bake every sprite part at 2x and report parts whose art touches the edge of its box (clipped). Reads pixels, so never call per frame.
  ART.hero.audit = (id) => {
    const spec = SPECS[id], bad = [];
    if (!spec) return bad;
    spec.parts.forEach((part) => {
      if (part.live || part.face || part.chain || !part.box) return;
      const cv = partSprite(spec, part, 2), w = cv.width, h = cv.height;
      let g = null, d = null;
      try { g = cv.getContext('2d'); d = g.getImageData(0, 0, w, h).data; } catch (e) { return; }
      const edges = [];
      const hit = (x, y) => d[(y * w + x) * 4 + 3] > 24;
      for (let x = 0; x < w && edges.indexOf('top') < 0; x++) if (hit(x, 0)) edges.push('top');
      for (let x = 0; x < w && edges.indexOf('bottom') < 0; x++) if (hit(x, h - 1)) edges.push('bottom');
      for (let y = 0; y < h && edges.indexOf('left') < 0; y++) if (hit(0, y)) edges.push('left');
      for (let y = 0; y < h && edges.indexOf('right') < 0; y++) if (hit(w - 1, y)) edges.push('right');
      if (edges.length) {
        let x0 = w, y0 = h, x1 = 0, y1 = 0;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (hit(x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        bad.push({ part: part.id, edges, size: [w, h], alpha: [x0, y0, x1, y1] });
      }
    });
    return bad;
  };
  ART.declare('hero', Object.keys(SPECS));

  const heroIds = () => DATA.LISTS.heroIds.filter((id) => SPECS[id]);
  const keyPt = (pose, params) => (params && params.pt !== undefined ? params.pt : (POSE_MS[pose] || 0) / 1000 * (KEYT[pose] === undefined ? 0.5 : KEYT[pose]));

  ART.sheet('hero_dev', (canvas, params) => {
    const pose = params.pose || 'idle', sc = num(params.zoom, 2.6), all = params.hero === 'all';
    const ids = all ? heroIds() : String(params.hero || "hanae").split(",");
    const ctx = canvas.getContext('2d');
    const W = params.w, H = params.h;
    tk.sky(ctx, 0, 0, W, H, 'night');
    if (params.mode === 'portrait') { ids.forEach((hid, i) => { const pw = W / ids.length, ph = Math.min(H, pw / 0.75); ART.hero.portrait(ctx, hid, { x: i * pw, y: 0, w: pw, h: ph, expr: params.expr || 'neutral', t: num(params.t, 0) }); }); return; }
    ctx.fillStyle = 'rgba(20,15,46,0.55)'; ctx.fillRect(0, H * 0.9, W, H * 0.1);
    ids.forEach((hid, i) => ART.hero.draw(ctx, hid, { x: W * (i + 0.5) / ids.length, y: H * 0.93, s: all ? Math.min(sc, H * 0.86 / 280, W / ids.length / 190) : sc, pose, t: num(params.t, 0), pt: keyPt(pose, params) }));
    ctx.font = '600 14px system-ui'; ctx.fillStyle = '#c9bff0'; ctx.textAlign = 'left'; ctx.fillText(ids.join(',') + ' / ' + pose + ' / t=' + num(params.t, 0).toFixed(2), 12, 22);
  });

  ART.sheet('heroes', (canvas, params) => {
    const ids = heroIds(), poses = DATA.LISTS.poses, t = num(params.t, 0);
    const cells = [];
    ids.forEach((id) => poses.forEach((pose) => cells.push({ id, pose, label: id + ' ' + pose })));
    ART.sheetGrid(canvas, params, cells, (g, cell, w, h) => {
      tk.sky(g, 0, 0, w, h, 'night');
      g.fillStyle = 'rgba(20,15,46,0.5)'; g.fillRect(0, h * 0.88, w, h * 0.12);
      const s = Math.min(w / 215, h * 0.88 / 286);
      ART.hero.draw(g, cell.id, { x: w / 2, y: h * 0.9, s, pose: cell.pose, t, pt: keyPt(cell.pose, params) });
    }, { cols: poses.length, title: 'ART.hero: every hero, every pose (one-shots at their key moment)', gap: 6, labelH: 16 });
  });

  ART.sheet('portraits', (canvas, params) => {
    const ids = heroIds(), t = num(params.t, 0), exprs = ART.hero.expressions ? ART.hero.expressions() : ['neutral'];
    const cells = [];
    ids.forEach((id) => { exprs.forEach((e) => cells.push({ id, expr: e, label: id + ' ' + e })); cells.push({ id, medal: 44, label: id + ' medallion' }); cells.push({ id, medal: 18, label: id + ' small' }); });
    ART.sheetGrid(canvas, params, cells, (g, cell, w, h) => {
      tk.sky(g, 0, 0, w, h, 'night');
      if (cell.medal) { ART.hero.medallion(g, cell.id, w / 2, h / 2, cell.medal); return; }
      const pw = Math.min(w, h * 0.75), ph = pw / 0.75;
      ART.hero.portrait(g, cell.id, { x: (w - pw) / 2, y: 0, w: pw, h: ph, expr: cell.expr, t });
    }, { cols: exprs.length + 2, title: 'ART.hero.portrait: expressions, medallions', gap: 6, labelH: 16 });
  });

  ART.sheet('hero_lineup', (canvas, params) => {
    const ctx = canvas.getContext('2d'), W = params.w, H = params.h, t = num(params.t, 0), ids = heroIds();
    tk.sky(ctx, 0, 0, W, H, 'night');
    tk.stars(ctx, 0, 0, W, H * 0.6, t, { n: 70, seed: 3 });
    tk.moon(ctx, W * 0.31, H * 0.12, H * 0.055, { phase: 0.3 });
    tk.mist(ctx, 0, H * 0.45, W, H * 0.4, t, { seed: 5, alpha: 0.16 });
    const gy = H * 0.78;
    ctx.fillStyle = '#0d0b1e'; ctx.fillRect(0, gy, W, H - gy);
    const g2 = ctx.createLinearGradient(0, gy - 30, 0, gy + 10); g2.addColorStop(0, 'rgba(91,63,168,0)'); g2.addColorStop(1, 'rgba(91,63,168,0.45)');
    ctx.fillStyle = g2; ctx.fillRect(0, gy - 30, W, 40);
    ids.forEach((id, i) => ART.hero.draw(ctx, id, { x: W * (0.2 + i * 0.2), y: gy + (i % 2 ? 6 : 0), s: (H * 0.6) / 250 * (i % 2 ? 0.94 : 1), pose: 'idle', t: t + i * 0.7 }));
    tk.kirakira(ctx, 0, 0, W, H, t, { n: 30, seed: 9 });
    tk.paperGrain(ctx, 0, 0, W, H, { alpha: 0.35 });
    tk.vignette(ctx, W, H, { alpha: 0.55 });
  });

  ART.sheet('hero_anim', (canvas, params) => {
    const hid = params.hero || heroIds()[0], t = num(params.t, 0), poses = params.pose ? [params.pose] : ['attack', 'cast', 'hurt'];
    const n = params.pose ? 12 : 8, cells = [];
    poses.forEach((pose) => { for (let i = 0; i < n; i++) cells.push({ pose, i, label: pose + ' ' + Math.round(i / (n - 1) * (POSE_MS[pose] || 800)) + 'ms' }); });
    ART.sheetGrid(canvas, params, cells, (g, cell, w, h) => {
      tk.sky(g, 0, 0, w, h, 'night');
      const dur = (POSE_MS[cell.pose] || 800) / 1000, s = Math.min(w / 230, h * 0.88 / 286);
      ART.hero.draw(g, hid, { x: w * 0.42, y: h * 0.9, s, pose: cell.pose, t: t + cell.i * 0.033, pt: cell.i / (n - 1) * dur });
    }, { cols: n, title: hid + ': ' + poses.join(', ') + ' across the pose', gap: 4, labelH: 16 });
  });
})();
