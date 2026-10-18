'use strict';
// owned by the hero_cast agent (see WORLD_DESIGN.md)
// ===================== HERO CAST: makes every `{kind:'rj', rj:<ART.rj id>, s, seed, expr}` figure spec work in the Rustgrift engine =====================
// Loaded after js/art_*.js and js/hv/* (ART.rj), before the cast_*.js files and main.js.
//  - wraps the globals drawFigure / drawFigureProc: kind 'rj' draws through ART.rj, everything else goes to the previous functions
//  - maps the engine pose {t, atk, talk, hurt, sit, mug, dead, cheer, block, walk, win, bust} onto kit poses through a per-rig STATE MAP
//    (RG_STATE_MAP[rjId][state] = {pose, mix, expr, set, still}); `set` overrides resolved pose numbers (a grip, a sitting leg) for that state only
//  - wraps unitPose (battle.js) with a tiny animation state machine: per unit it remembers the last state and cross-fades into the new one
//    (hurt snaps in, everything else eases; the outgoing pose is frozen while it fades = "frozen blending")
//  - keeps the key light on the upper right of the screen for externally mirrored figures (battle enemies: drawUnit scales x by -1)
//  - tiny scales with t == 0 (the HUD portrait circles) draw a head close-up through ART.rj.bust instead of a 20px full body
//  - SPR.renderSheet works for kind 'rj' specs (cell 512, scale 1.5, noShadow; the dead cell lies the figure down)
//  - helpers for other agents: RGBust, RGFigure, RGPose, RGIsRJ, RGHeroCards, RG_STATE_MAP
// Engine figure space: feet at (0,0), facing +x, about 250 units tall at scale 1. Kit space: same, about 262 units tall, so RG_RJ_K scales it to fit.
const RG_RJ_K = 250 / 262;

function RGIsRJ(s) { return !!(s && s.kind === 'rj'); }

// ---------- expressions added for the engine (the kit's RJ.EXPR is an open table; rig exprs with the same name would win) ----------
if (typeof ART !== 'undefined' && ART.rj && ART.rj.EXPR) {
  const E = ART.rj.EXPR;
  // talking: eyes open (the kit 'sing' face has the eyes shut), the mouth flaps between three shapes
  E.rg_talkA = E.rg_talkA || { eyes: 'open', mouth: 'happyOpen', brow: -0.15 };
  E.rg_talkB = E.rg_talkB || { eyes: 'open', mouth: 'sing', brow: -0.1 };
  E.rg_talkC = E.rg_talkC || { eyes: 'open', mouth: 'smile', brow: -0.1 };
  // arguing: same flap, a firmer brow
  E.rg_argA = E.rg_argA || { eyes: 'open', mouth: 'grin', brow: 0.35 };
  E.rg_argB = E.rg_argB || { eyes: 'open', mouth: 'sing', brow: 0.4 };
  E.rg_argC = E.rg_argC || { eyes: 'open', mouth: 'smirkTeeth', brow: 0.35 };
}
// mouth flap: about 9 shapes a second, never the same shape twice in a row
function rg_flap(t, kind) {
  const i = Math.floor((+t || 0) * 9) % 4, s = ['A', 'B', 'A', 'C'][i < 0 ? 0 : i];
  return (kind === 'arg' ? 'rg_arg' : 'rg_talk') + s;
}

// ---------- the per-rig state map ----------
// state names: idle windup strike hurt talk argueUp argue block buff cheer dead sit walk
//   entry: {pose: kit pose, mix: {pose, k} a constant blend, expr: expression name (overrides the table's face), set: {...} | fn(P, t) pose numbers,
//           still: true keeps the feet and body height of 'idle' (no built-in jump: drawUnit already hops the unit), mug: false (sit without the mug)}
const RG_STATE_DEF = {
  idle: { pose: 'idle' },
  windup: { pose: 'windup' },
  strike: { pose: 'strike' },
  hurt: { pose: 'hurt' },
  talk: { pose: 'sing', talk: 'talk' },
  argueUp: { pose: 'windup', talk: 'arg' },              // negotiation influence card: the breath before the point
  argue: { pose: 'block', talk: 'arg' },                  // ...and the point itself (kit block = the free hand out, the voice up)
  block: { pose: 'block', still: true },
  buff: { pose: 'cheer', still: true },
  cheer: { pose: 'cheer' },
  win: { pose: 'cheer' },
  dead: { pose: 'hurt', expr: 'hurt' },
  ko: { pose: 'hurt', expr: 'hurt', noFx: false },              // game over: lying in the gutter, seeing stars
  walk: { pose: 'walk' },
  // the camp chair: the seat is ~34 units above the feet. Hips onto the seat, thighs forward, shins down to the floor, the free hand on the knee.
  sit: { pose: 'idle', expr: 'happy', noFx: true, set: null },
};
const RG_SIT_LEGS = { by: 22, legDy: 0, fFoot: [44, -34], bFoot: [30, -34], fBow: 30, bBow: 26, fFootRot: 0, bFootRot: 0, lean: -0.03 };
RG_STATE_DEF.sit.set = Object.assign({ bHand: [-2, 50], bBend: -1, bKind: 'relaxed', bRot: 0.3 }, RG_SIT_LEGS);
// the mug replaces the mic in the front hand while sitting
const RG_SIT_MUG = { mic: 'none', fHand: [22, 26], fBend: 1, fKind: 'fist', fRot: -0.2 };
const RG_STATE_MAP = {
  roxor: {
    // roxor's strike/attack keep the mic at the mouth (a beatbox blast): fine. block holds the mic out sideways: use it as the guard.
    argue: { pose: 'attack', talk: 'arg' },
  },
  jasmin: {
    // kit idle holds the mic up by the chin, kit sing has the eyes shut: talk keeps the mic at the mouth but the eyes open
    talk: { pose: 'sing', talk: 'talk' },
    // her kit block hugs the mic to the chest with the free arm hidden: arguing is the sing pose (mic at the mouth, free hand open) leaning in
    argue: { pose: 'sing', talk: 'arg', noFx: true, set: (P) => { P.lean += 0.06; P.headDx += 3; P.torsoRot += 0.04; P.fx = []; } },
  },
  andy: {
    // the bass never leaves his hands: talking = strumming along (kit sing), arguing = the punchy downstroke of the attack table
    talk: { pose: 'sing', talk: 'talk' },
    argueUp: { pose: 'windup', talk: 'arg' },
    argue: { pose: 'attack', talk: 'arg' },
    sit: { pose: 'sing', expr: 'happy', noFx: true, mug: false, set: RG_SIT_LEGS },
  },
  rawclaw: {
    // his kit sing pulls a beatbox mic out of nowhere: for a short bark he just talks over the pad; arguing = half of the palm push
    talk: { pose: 'idle', talk: 'talk' },
    argueUp: { pose: 'windup', talk: 'arg' },
    argue: { pose: 'idle', mix: { pose: 'strike', k: 0.45 }, talk: 'arg' },
    sit: { pose: 'idle', expr: 'happy', noFx: true, mug: false, set: RG_SIT_LEGS },
  },
};
// the map entry for a rig and a state: rig table, else the jasmin_unicorn -> jasmin style base id, else the default
function rg_entry(id, state) {
  const m = RG_STATE_MAP[id] || RG_STATE_MAP[String(id).split('_')[0]];
  return (m && m[state]) || RG_STATE_DEF[state] || RG_STATE_DEF.idle;
}

// ---------- engine pose -> pose descriptor ----------
// Returns {state, a: entry, b: entry|null, k (blend a -> b), expr, noFx, sit, pose, mix}. pose/mix are the plain kit equivalents (for callers that
// draw through ART.rj.draw themselves, like RGFigure); rg_drawRJ uses a/b/k so the per-state `set` numbers apply.
const rg_ez = (k) => k * k * (3 - 2 * k), rg_cl = (v) => Math.max(0, Math.min(1, v));
function RGPose(p, spec) {
  p = p || {};
  const id = (spec && spec.rj) || 'roxor', E = (st) => rg_entry(id, st);
  const out = (state, a, b, k, extra) => {
    const d = Object.assign({ state, a, b: b || null, k: b ? rg_cl(k) : 0 }, extra || {});
    d.pose = a.pose; d.mix = b && d.k > 0 ? { pose: b.pose, k: d.k } : a.mix;
    const domi = d.k >= 0.5 && b ? b : a;
    // a talking state keeps its flapping mouth through its whole blend (else the far side's table face, e.g. the shut 'sing' eyes, shows at k >= .5)
    const tk = domi.talk || a.talk || (b && b.talk);
    d.expr = p.expr || (tk ? rg_flap(p.t, tk) : domi.expr) || (spec && spec.expr) || undefined;
    d.noFx = !!(a.noFx || p.noFx);
    return d;
  };
  if (p.state && RG_STATE_DEF[p.state]) return out(p.state, E(p.state));
  if (p.dead === true || p.down || (+p.deadK || 0) > 0) return out('dead', E('dead'), null, 0, { noFx: true });
  if (p.sit) return out('sit', E('sit'), null, 0, { sit: true });
  if (p.hurt) return out('hurt', E('hurt'));
  const a = +p.atk || 0, arg = (+p.talk || 0) > 0 && a > 0;
  if (a > 0) {
    // anticipation (gather, then coil and snap), the hit is held, then a slow ease back (follow-through)
    const W = E(arg ? 'argueUp' : 'windup'), S = E(arg ? 'argue' : 'strike'), I = E('idle');
    if (a < 0.16) return out('windup', I, W, rg_ez(a / 0.16));
    if (a < 0.35) return out('windup', W, S, Math.pow((a - 0.16) / 0.19, 2.2));
    if (a < 0.72) return out('strike', S);
    return out('strike', S, I, rg_ez((a - 0.72) / 0.28));
  }
  const tk = rg_cl(+p.talk || 0);
  if (tk > 0) return tk >= 0.999 ? out('talk', E('talk')) : out('talk', E('idle'), E('talk'), rg_cl(tk * 1.6));
  if (p.win) return out('win', E('win'));
  if (p.block) return out('block', E('block'), null, 0);
  if (p.buff || p.cheer) return out(p.buff ? 'buff' : 'cheer', E(p.buff ? 'buff' : 'cheer'));
  if (p.walk) return out('walk', E('walk'));
  return out('idle', E('idle'));
}

// ---------- the resolve hook ----------
// While rg_drawRJ draws, ART.rj.pose is answered from the descriptor (both sides resolved with their `set` numbers, blended, then cross-faded from the
// previous state). Outside rg_drawRJ the kit is untouched. Installed once; the kit's own function stays the fallback.
let RG_CUR = null;
function rg_resolveEntry(R, spec, e, t, expr) {
  let P = R.resolve(spec, e.pose || 'idle', t, expr);
  if (e.mix && e.mix.k > 0) P = R.blend(P, R.resolve(spec, e.mix.pose, t, expr), e.mix.k);
  if (e.still) {
    const I = R.resolve(spec, 'idle', t, expr);
    P.by = I.by; P.fFoot = I.fFoot; P.bFoot = I.bFoot; P.squash = I.squash; P.legDy = I.legDy; P.fFootRot = I.fFootRot; P.bFootRot = I.bFootRot;
  }
  if (e.set) {
    if (typeof e.set === 'function') { try { e.set(P, t); } catch (er) { /* never break a draw */ } }
    else Object.assign(P, e.set);
  }
  if (e._mug) Object.assign(P, RG_SIT_MUG);
  return P;
}
function rg_resolveDesc(R, spec, d, t) {
  let P = rg_resolveEntry(R, spec, d.a, t, d.expr);
  if (d.b && d.k > 0) P = R.blend(P, rg_resolveEntry(R, spec, d.b, t, d.expr), d.k);
  return P;
}
(function rg_hook() {
  const R = typeof ART !== 'undefined' && ART.rj;
  if (!R || typeof R.pose !== 'function' || R._rgHooked) return;
  const kitPose = R.pose;
  R._rgHooked = true;
  R.pose = function (spec, n) {
    const X = RG_CUR;
    if (!X || !X.d) return kitPose(spec, n);
    try {
      const t = n && n.t || 0;
      let P = rg_resolveDesc(R, spec, X.d, t);
      if (X.from && X.from.d && X.from.k < 1) P = R.blend(rg_resolveDesc(R, spec, X.from.d, t), P, rg_cl(X.from.k));
      return P;
    } catch (e) { return kitPose(spec, n); }
  };
})();

// current uniform scale of the context relative to the game's base transform, and whether it is mirrored
function rg_ctxInfo(c) {
  let m = null;
  try { m = c.getTransform(); } catch (e) { m = null; }
  if (!m) return { s: 1, mirror: false };
  const det = m.a * m.d - m.b * m.c, base = (typeof renderScale === 'number' && c.canvas && typeof ctx !== 'undefined' && c === ctx) ? renderScale : 1;
  return { s: Math.sqrt(Math.abs(det)) / base, mirror: det < 0 };
}

// draw an rj spec at the current origin (feet at 0,0, facing +x in the current transform)
function rg_drawRJ(c, s, p) {
  const R = ART && ART.rj; if (!R) return;
  p = p || {};
  const id = s.rj || 'roxor', info = rg_ctxInfo(c);
  // HUD portrait: tiny scale, frozen time -> head close-up inside the portrait circle (centre 54 units above the feet, radius about 75 units)
  if (p.bust || (info.s < 0.4 && p.t === 0 && !p.atk && !p.talk)) {
    c.save();
    if (info.mirror) c.scale(-1, 1);
    const B = 168; c.translate(6.7 - B / 2, -54 - B / 2);
    R.bust(c, id, B, B, { expr: p.expr || s.expr, t: p.t || 0 });
    c.restore();
    return;
  }
  // scene context the engine pose does not carry: knocked out on the game over screen, celebrating on the victory screen
  const scn = typeof G !== 'undefined' && G.scene;
  if (scn && !p._unit && !p.state) {
    if (typeof GameOverScene !== 'undefined' && scn instanceof GameOverScene) p = Object.assign({}, p, { state: 'ko' });
    else if (typeof VictoryScene !== 'undefined' && scn instanceof VictoryScene) p = Object.assign({}, p, { state: 'win', talk: 0 });
  }
  const d = RGPose(p, s);
  // figures drawn outside drawUnit (char select flourish, menus) get a light cross-fade too, keyed by the spec object, unless the same spec is drawn
  // more than once in a frame (then it would fight itself)
  if (!p._unit && !p.rgFrom && s && typeof s === 'object') p = Object.assign({}, p, { rgFrom: rg_specFade(s, d) });
  const mug = !!(p.mug && d.sit && d.a.mug !== false);
  if (mug) { d.a = Object.assign({}, d.a, { _mug: true }); }
  const k = (s.s || 1) * RG_RJ_K;
  c.save();
  // un-mirror an external flip and let the kit mirror instead, so the key light stays upper right on screen
  let flip = !!s.flip;
  if (info.mirror) { c.scale(-1, 1); flip = !flip; }
  const o = { x: 0, y: 0, s: k, pose: d.k >= 0.5 && d.b ? d.b.pose : d.a.pose, t: p.t || 0, flip, expr: d.expr, noShadow: !!p.noShadow || !!d.sit || d.state === 'ko' || d.state === 'dead', noFx: !!(d.noFx || p.noFx) };
  const prevCur = RG_CUR;
  RG_CUR = { d, from: p.rgFrom || null };
  try {
    R.draw(c, id, o);
    if (mug) rg_mug(c, id, o, p.t || 0);
  } finally { RG_CUR = prevCur; }
  c.restore();
}

const RG_SPEC_SM = typeof WeakMap === 'function' ? new WeakMap() : null;
function rg_specFade(s, d) {
  if (!RG_SPEC_SM || typeof G === 'undefined') return null;
  const now = G.time || 0, fr = (typeof G.frame === 'number' ? G.frame : now);
  let S = RG_SPEC_SM.get(s);
  if (!S) { S = { key: d.state, last: d, prev: null, t0: -9, fr, n: 0, multi: false }; RG_SPEC_SM.set(s, S); return null; }
  if (S.fr === fr) { S.n++; S.multi = true; } else { S.multi = S.n > 1; S.fr = fr; S.n = 1; }
  if (S.multi || now < S.t0 - 1) { S.key = d.state; S.last = d; S.prev = null; S.t0 = now; return null; }
  if (d.state !== S.key) { S.prev = S.last; S.t0 = now; S.key = d.state; }
  S.last = d;
  if (!S.prev) return null;
  const k = (now - S.t0) / 0.12;
  if (k >= 1 || k < 0) { S.prev = null; return null; }
  return { d: S.prev, k: rg_ez(k) };
}

// a little steaming camp mug held in the figure's front fist (the mic is put away while sitting)
function rg_mug(c, id, o, t) {
  const R = ART.rj, h = R.point(id, 'hand', o); if (!h) return;
  const ink = (R.C && R.C.ink) || '#3a2418', sc = o.s, fl = o.flip ? -1 : 1;
  c.save(); c.translate(h.x + 4 * fl * sc, h.y - 6 * sc); c.scale(sc * fl, sc);
  c.lineJoin = 'round'; c.lineWidth = 2.6; c.strokeStyle = ink;
  c.beginPath(); c.moveTo(-9, -16); c.lineTo(11, -16); c.lineTo(9.5, 8); c.quadraticCurveTo(1, 11, -7.5, 8); c.closePath(); c.fillStyle = '#f6eedd'; c.fill(); c.stroke();
  c.fillStyle = '#ff7eb6'; c.beginPath(); c.moveTo(1, 0); c.bezierCurveTo(-5, -6, -2, -11, 1, -7.5); c.bezierCurveTo(4, -11, 7, -6, 1, 0); c.fill();
  c.beginPath(); c.arc(13, -5, 5.5, -1.4, 1.4); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 2.2; c.lineCap = 'round';
  for (let i = 0; i < 2; i++) { const ph = (t * 0.7 + i * 0.5) % 1; c.globalAlpha = Math.sin(ph * Math.PI) * 0.9; c.beginPath(); c.moveTo(-3 + i * 7, -20 - ph * 16); c.quadraticCurveTo(-7 + i * 7, -26 - ph * 16, -2 + i * 7, -32 - ph * 16); c.stroke(); }
  c.restore();
}

// ---------- wrap the engine's figure entry points ----------
const rg_prevDrawFigureProc = drawFigureProc;
const rg_prevDrawFigure = drawFigure;
// eslint-disable-next-line no-func-assign
drawFigureProc = function (c, s, pose) {
  if (RGIsRJ(s)) { rg_drawRJ(c, s, pose || {}); return; }
  rg_prevDrawFigureProc(c, s, pose);
};
// kind 'rj' figures draw live from the rig; an imported sprite sheet is only used when the spec opts in with useSheet:true
// eslint-disable-next-line no-func-assign
drawFigure = function (c, s, pose) {
  if (RGIsRJ(s) && !(s.useSheet && s.spriteKey && typeof SPR !== 'undefined' && SPR.draw(c, s, pose))) { rg_drawRJ(c, s, pose || {}); return; }
  rg_prevDrawFigure(c, s, pose);
};

// ---------- the unit state machine (battle, negotiation, world fights all draw units through drawUnit -> unitPose) ----------
// Cross-fade time (s) into a state, by [from][to] then [*][to]. Hurt snaps in (a hit must read on the frame it lands); everything eases out.
const RG_XFADE = {
  '*': { idle: 0.16, talk: 0.1, hurt: 0, windup: 0.05, strike: 0, block: 0.1, buff: 0.1, win: 0.25, dead: 0.08, cheer: 0.15 },
  hurt: { idle: 0.22, windup: 0.08, talk: 0.15 },
  strike: { windup: 0.07, idle: 0.1 },                  // a multi-hit card re-arms: a short re-coil instead of a pop
  talk: { idle: 0.2 },
};
const RG_HURT_HOLD = 0.26;
function rg_xfade(from, to) {
  const r = RG_XFADE[from] && RG_XFADE[from][to];
  return r != null ? r : (RG_XFADE['*'][to] != null ? RG_XFADE['*'][to] : 0.12);
}
if (typeof unitPose === 'function') {
  const rg_prevUnitPose = unitPose;
  // eslint-disable-next-line no-func-assign
  unitPose = function (u, dir) {
    const r = rg_prevUnitPose(u, dir);
    if (!u || !RGIsRJ(u.spec)) return r;
    r._unit = true;
    const p = u.pose || {}, sc = (typeof G !== 'undefined' && G.scene) || null, now = (typeof G !== 'undefined' && G.time) || 0;
    const S = u._rg || (u._rg = { key: null, last: null, t0: -9, dur: 0, prev: null, blk: u.block || 0 });
    if (u.dead || p.dead > 0) r.deadK = Math.max(0.01, p.dead || 0);
    // the engine's hurt is only "flash > .05" (about 70 ms, 4 frames): too short to read. A fresh hit holds the hurt pose for RG_HURT_HOLD s, then it
    // eases out. A summon flash (.5) is not a hit.
    const fl = +p.flash || 0;
    if (fl > (S.fl || 0) + 0.05 && fl < 0.45) S.hurtUntil = now + RG_HURT_HOLD;
    S.fl = fl;
    if (!r.atk && !(+r.talk > 0) && S.hurtUntil > now && S.hurtUntil - now <= RG_HURT_HOLD + 0.01) r.hurt = true;
    // a hop is the "played a non-attack card" beat: a guard if the block went up, otherwise a buff flourish
    if (p.hop > 0 && !r.atk && !r.hurt) { if ((u.block || 0) > S.blk) r.block = true; else r.buff = true; } else S.blk = u.block || 0;
    if (sc && sc.over === 'win' && sc.P === u) r.win = true;
    const d = RGPose(r, u.spec);
    if (S.key !== null && d.state !== S.key) {
      S.t0 = now; S.dur = rg_xfade(S.key, d.state); S.prev = S.dur > 0 ? S.last : null;
    }
    S.key = d.state; S.last = d;
    if (S.prev && S.dur > 0) {
      const k = (now - S.t0) / S.dur;
      if (k < 1 && k >= 0) r.rgFrom = { d: S.prev, k: rg_ez(k) }; else S.prev = null;
    }
    return r;
  };
}

// ---------- sprite sheet export for rj specs ----------
if (typeof SPR !== 'undefined' && SPR.renderSheet) {
  const rg_prevRender = SPR.renderSheet;
  SPR.renderSheet = function (key) {
    const spec0 = this.specFor(key);
    if (!RGIsRJ(spec0)) return rg_prevRender.call(this, key);
    const spec = Object.assign({}, spec0); delete spec.spriteKey;
    const cv = document.createElement('canvas'); cv.width = SHEET.cell * SHEET.cols; cv.height = SHEET.cell * SHEET.rows; const c = cv.getContext('2d');
    c.fillStyle = MAGENTA; c.fillRect(0, 0, cv.width, cv.height);
    POSES.forEach((name, i) => {
      const col = i % SHEET.cols, row = (i / SHEET.cols) | 0;
      c.save(); c.translate(col * SHEET.cell + SHEET.feetX, row * SHEET.cell + SHEET.feetY); c.scale(SHEET.scale, SHEET.scale);
      const p = { t: 0.4, atk: 0, talk: 0, noShadow: true };
      if (name === 'windup') p.atk = .17; if (name === 'strike') p.atk = .6; if (name === 'talk') p.talk = 1; if (name === 'hurt') p.hurt = true;
      if (name === 'dead') { c.translate(100, -58); c.rotate(-1.45); p.dead = true; }   // knocked flat on the back
      rg_drawRJ(c, spec, p);
      c.restore();
    });
    return cv;
  };
}

// ---------- helpers for other agents ----------
// Portrait sticker: the head-and-shoulders crop of an ART.rj figure inside a rounded frame at (x, y, w, h). o: {t, pose, bg, ring, r, lw}
function RGBust(c, rjId, x, y, w, h, expr, o) {
  o = o || {};
  const R = ART.rj, A = (R.accent && R.accent(rjId)) || { main: '#8f5fe8', light: '#e8dcff', dark: '#4a2e7a' };
  const ink = (R.C && R.C.ink) || '#3a2418', r = o.r != null ? o.r : Math.min(w, h) * 0.18, lw = o.lw || Math.max(2, Math.min(w, h) * 0.035);
  const rr = (X, Y, W2, H2, rad) => { c.beginPath(); if (c.roundRect) c.roundRect(X, Y, W2, H2, rad); else c.rect(X, Y, W2, H2); };
  c.save();
  c.translate(x, y);
  // drop shadow + white sticker border
  c.fillStyle = 'rgba(30,15,5,.22)'; rr(lw * 0.6, lw * 1.6, w, h, r); c.fill();
  c.fillStyle = '#fff'; rr(-lw * 1.2, -lw * 1.2, w + lw * 2.4, h + lw * 2.4, r + lw); c.fill();
  // backdrop: accent wash with a soft light from the upper right
  rr(0, 0, w, h, r); c.save(); c.clip();
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, o.bg || A.light || '#fff'); g.addColorStop(1, A.main || '#ccc'); c.fillStyle = g; c.fillRect(0, 0, w, h);
  const rg = c.createRadialGradient(w * 0.72, h * 0.22, 2, w * 0.72, h * 0.22, Math.max(w, h) * 0.7); rg.addColorStop(0, 'rgba(255,255,255,.55)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = rg; c.fillRect(0, 0, w, h);
  R.bust(c, rjId, w, h, { expr: expr || undefined, t: o.t || 0, pose: o.pose });
  c.restore();
  c.lineWidth = lw; c.strokeStyle = o.ring || ink; rr(0, 0, w, h, r); c.stroke();
  c.restore();
}
// Draw an ART.rj figure with feet at (x, y). pose: a kit pose name, or an engine pose object {atk, talk, hurt, sit, ...} (then the state map applies,
// including its `set` numbers). s is in kit units (1 = 262 tall).
function RGFigure(c, rjId, x, y, s, pose, t, flip, o) {
  o = o || {};
  if (typeof pose === 'object' && pose) {
    c.save(); c.translate(x, y);
    rg_drawRJ(c, { kind: 'rj', rj: rjId, s: (s || 1) / RG_RJ_K, flip: !!flip }, Object.assign({ t: t || 0, expr: o.expr, noShadow: !!o.noShadow, noFx: !!o.noFx }, pose));
    c.restore();
    return;
  }
  ART.rj.draw(c, rjId, { x, y, s: s || 1, pose: pose || 'idle', mix: o.mix, t: t || 0, flip: !!flip, expr: o.expr, noShadow: !!o.noShadow, noFx: !!o.noFx });
}
// Layout of n hero cards across the 1280-wide char select (the 360x520 card art scaled to fit): [{x, y, w, h, k, cx}]
function RGHeroCards(n, o) {
  o = o || {};
  const Wd = o.w || 1280, gap = o.gap || 24, margin = o.margin || 40, cw0 = 360, ch0 = 520;
  const k = Math.min(1, (Wd - margin * 2 - gap * (n - 1)) / (n * cw0)), cw = cw0 * k, chh = ch0 * k;
  const x0 = (Wd - (n * cw + (n - 1) * gap)) / 2, y = o.y != null ? o.y : 105 + (ch0 - chh) / 2;
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x: x0 + i * (cw + gap), y, w: cw, h: chh, k, cx: x0 + i * (cw + gap) + cw / 2 });
  return out;
}
window.RGBust = RGBust; window.RGFigure = RGFigure; window.RGPose = RGPose; window.RGIsRJ = RGIsRJ; window.RGHeroCards = RGHeroCards; window.RG_STATE_MAP = RG_STATE_MAP;
