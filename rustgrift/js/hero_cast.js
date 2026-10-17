'use strict';
// owned by the hero_cast agent (see WORLD_DESIGN.md)
// ===================== HERO CAST: makes every `{kind:'rj', rj:<ART.rj id>, s, seed, expr}` figure spec work in the Rustgrift engine =====================
// Loaded after js/art_*.js and js/hv/* (ART.rj), before the cast_*.js files and main.js.
//  - wraps the globals drawFigure / drawFigureProc: kind 'rj' draws through ART.rj, everything else goes to the previous functions
//  - maps the engine pose {t, atk, talk, hurt, sit, mug, dead, bust} onto the kit poses (idle sing attack hurt cheer windup strike block down walk)
//  - keeps the key light on the upper right of the screen for externally mirrored figures (battle enemies: drawUnit scales x by -1)
//  - tiny scales with t == 0 (the HUD portrait circles) draw a head close-up through ART.rj.bust instead of a 20px full body
//  - SPR.renderSheet works for kind 'rj' specs (cell 512, scale 1.5, noShadow; the dead cell lies the figure down)
//  - helpers for other agents: RGBust, RGFigure, RGPose, RGIsRJ, RGHeroCards
// Engine figure space: feet at (0,0), facing +x, about 250 units tall at scale 1. Kit space: same, about 262 units tall, so RG_RJ_K scales it to fit.
const RG_RJ_K = 250 / 262;

function RGIsRJ(s) { return !!(s && s.kind === 'rj'); }

// engine pose -> {pose, mix, expr, noFx, dy} for ART.rj.draw
function RGPose(p, spec) {
  p = p || {};
  const ez = (k) => k * k * (3 - 2 * k), cl = (v) => Math.max(0, Math.min(1, v));
  const expr = p.expr || (spec && spec.expr) || undefined;
  if (p.dead === true || p.down) return { pose: 'down', expr: p.expr, noFx: true };
  if (p.sit) return { pose: 'down', mix: { pose: 'idle', k: 0.18 }, expr: p.expr || 'happy', noFx: true, sit: true };
  if (p.hurt) return { pose: 'hurt', expr: p.expr };
  const a = +p.atk || 0;
  if (a > 0) {
    if (a < 0.16) return { pose: 'idle', mix: { pose: 'windup', k: ez(a / 0.16) }, expr };       // gather
    if (a < 0.35) return { pose: 'windup', mix: { pose: 'strike', k: Math.pow((a - 0.16) / 0.19, 2.2) }, expr: p.expr };   // coil, then snap at .35
    if (a < 0.8) return { pose: 'strike', expr: p.expr };                                          // the hit
    return { pose: 'strike', mix: { pose: 'idle', k: ez((a - 0.8) / 0.2) }, expr: p.expr };          // recover
  }
  const tk = cl(+p.talk || 0);
  if (tk > 0) return tk >= 0.999 ? { pose: 'sing', expr: p.expr } : { pose: 'idle', mix: { pose: 'sing', k: cl(tk * 1.6) }, expr: p.expr };
  if (p.cheer) return { pose: 'cheer', expr: p.expr };
  if (p.walk) return { pose: 'walk', expr };
  if (p.block) return { pose: 'block', expr };
  return { pose: 'idle', expr };
}

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
  const P = RGPose(p, s);
  const k = (s.s || 1) * RG_RJ_K;
  c.save();
  // un-mirror an external flip and let the kit mirror instead, so the key light stays upper right on screen
  let flip = !!s.flip;
  if (info.mirror) { c.scale(-1, 1); flip = !flip; }
  let y = 0;
  if (P.sit) y = -30;                                                   // RestScene: the camp chair seat is ~30 units up
  R.draw(c, id, { x: 0, y, s: k, pose: P.pose, mix: P.mix, t: p.t || 0, flip, expr: P.expr, noShadow: !!p.noShadow || P.sit, noFx: !!(P.noFx || p.noFx) });
  if (p.mug && P.sit) rg_mug(c, id, { x: 0, y, s: k, pose: P.pose, mix: P.mix, t: p.t || 0, flip }, p.t || 0);
  c.restore();
}

// a little steaming camp mug held at the figure's front hand
function rg_mug(c, id, o, t) {
  const R = ART.rj, h = R.point(id, 'hand', o); if (!h) return;
  const ink = (R.C && R.C.ink) || '#3a2418', sc = o.s;
  c.save(); c.translate(h.x + (o.flip ? -10 : 10) * sc, h.y - 12 * sc); c.scale(sc, sc);
  c.lineJoin = 'round'; c.lineWidth = 2.6; c.strokeStyle = ink;
  c.beginPath(); c.moveTo(-10, -14); c.lineTo(10, -14); c.lineTo(8.5, 10); c.quadraticCurveTo(0, 13, -8.5, 10); c.closePath(); c.fillStyle = '#f6eedd'; c.fill(); c.stroke();
  c.fillStyle = '#ff7eb6'; c.beginPath(); c.moveTo(0, 2); c.bezierCurveTo(-6, -4, -3, -9, 0, -5.5); c.bezierCurveTo(3, -9, 6, -4, 0, 2); c.fill();
  c.beginPath(); c.arc(o.flip ? -12 : 12, -3, 5.5, -1.4, 1.4, !!o.flip); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 2.2; c.lineCap = 'round';
  for (let i = 0; i < 2; i++) { const ph = (t * 0.7 + i * 0.5) % 1; c.globalAlpha = Math.sin(ph * Math.PI) * 0.9; c.beginPath(); c.moveTo(-4 + i * 7, -18 - ph * 16); c.quadraticCurveTo(-8 + i * 7, -24 - ph * 16, -3 + i * 7, -30 - ph * 16); c.stroke(); }
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
      if (name === 'dead') { c.translate(100, -58); c.rotate(-1.45); p.down = true; }   // knocked flat on the back: the sitting slump tipped over
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
// Draw an ART.rj figure with feet at (x, y). pose: a kit pose name, or an engine pose object {atk, talk, hurt, sit, ...}. s is in kit units (1 = 262 tall).
function RGFigure(c, rjId, x, y, s, pose, t, flip, o) {
  o = o || {};
  const P = typeof pose === 'object' && pose ? RGPose(Object.assign({ t }, pose)) : { pose: pose || 'idle' };
  ART.rj.draw(c, rjId, { x, y, s: s || 1, pose: P.pose, mix: o.mix || P.mix, t: t || 0, flip: !!flip, expr: o.expr || P.expr, noShadow: !!o.noShadow, noFx: !!(o.noFx || P.noFx) });
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
window.RGBust = RGBust; window.RGFigure = RGFigure; window.RGPose = RGPose; window.RGIsRJ = RGIsRJ; window.RGHeroCards = RGHeroCards;
