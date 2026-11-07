// COMBAT ART: the painted creatures and the modular-kit backdrop of the battle screen (design/WARD.md "Combat art").
// The Ward map draws the actor sprites of assets/ward/manifest.json; this module draws the SAME sprites in battle so both screens share one style.
//   spriteOf(id, app)          { img, def, bbox, kind } or null (no manifest / not painted / still decoding): callers draw the procedural figure
//   spriteBounds(def, app)     layout box { w, h } of a painted enemy in layout units (U per 2x pixel), or null: ui/combat_layout.js sizes lanes from it
//   drawEnemySprite / drawHeroSprite   the figure with its pose: lunge, hit reaction, block, death collapse, status overlays, elite and boss presence
//   contactShadow(ctx, x, floorY, rx, a)   the one grounding shadow every combatant gets (painted or procedural)
//   gradeProcedural(ctx, on)   a matching colour grade for the procedural fallbacks
//   drawBackdrop(app, ctx, o)  the kit room behind the combatants (wall, trim, pieces, lamp cones, perspective floor); false = draw the old backdrop
// The art faces down-right: the hero stands left facing right as drawn, enemies stand right and are flipped to face the hero.
// Everything is a no-op in node (no Image / fetch): the procedural look is exercised there.
import { assets } from './assets.js';
import { pose as atkPose } from '../art/attacks.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeIn = (t) => { const k = clamp(t, 0, 1); return k * k; };
const TAU = Math.PI * 2;

// 1 layout px = U sprite px of the 2x frame (256 wide): a lone normal enemy then stands ~200 px tall in the 212 px lane
export const U = 0.8;
export const KIND_K = { normal: 1, elite: 1.12, boss: 1.22 };
export const HERO_S = 1.2; // the hero, in 2x sprite px per logical px: 225 px of art becomes ~270
export const FACING = { hero: 1, enemy: -1 };
export const GRADE = 'sepia(0.2) saturate(0.82) contrast(1.06) brightness(0.96)';

// ------------------------------------------------------------------ sprites
const HI = new Map(); // combat (@3x, 512 px) images: { img, ok, bad }, keyed by file
const hiLoader = { make: null }; // test hook
function loadHi(file) {
  let e = HI.get(file);
  if (e) return e;
  e = { img: null, ok: false, bad: false };
  HI.set(file, e);
  try {
    if (!assets.available()) { e.bad = true; return e; }
    const im = hiLoader.make ? hiLoader.make() : new Image();
    im.onload = () => { e.ok = true; };
    im.onerror = () => { e.bad = true; };
    im.src = assets.base + file;
    e.img = im;
  } catch (err) { e.bad = true; }
  return e;
}
export function __setHi(file, img) { HI.set(file, { img, ok: true, bad: false }); }
export function __resetHi() { HI.clear(); }

// The painted figure of an actor id (hero id or enemy id). Prefers the 512 px combat file (file3x) and shows the 2x / 1x one while it decodes.
export function spriteOf(id, app) {
  if (!id || !assets.ready()) return null;
  const d = assets.def('actors', id);
  if (!d) return null;
  let img = null;
  if (d.file3x) { const e = loadHi(d.file3x); if (e.ok) img = e.img; }
  if (!img) { const a = assets.actor(id, app); if (a) img = a.img; }
  if (!img) return null;
  const w = d.w || 256, h = d.h || 256;
  const bbox = Array.isArray(d.bbox) && d.bbox.length === 4 ? d.bbox : [w * 0.08, h * 0.07, w * 0.92, h * 0.95];
  return { img, def: d, bbox, ax: d.anchorX || w / 2, ay: d.anchorY || h * 0.95, kind: d.kind || 'normal' };
}
// ask for the images of a fight (hero and enemies) so they are decoded by the first frame
export function warm(app, ids) {
  try {
    assets.ensure(app);
    if (!assets.ready()) return;
    for (const id of ids) { const d = assets.def('actors', id); if (!d) continue; assets.actor(id, app); if (d.file3x) loadHi(d.file3x); }
  } catch (e) { /* art is optional */ }
}
export const kindK = (def) => KIND_K[def && def.kind] || 1;
export function spriteBounds(def, app) {
  const sp = def && spriteOf(def.id, app);
  if (!sp) return null;
  const k = U * kindK(def), b = sp.bbox;
  return { w: Math.max(40, (b[2] - b[0]) * k), h: Math.max(40, (b[3] - b[1]) * k), sprite: true, kind: def.kind || 'normal' };
}

// ------------------------------------------------------------------ shadows
// One grounding shadow for every combatant: a wide soft pool and a tight dark core under the feet. y is the floor line the feet stand on.
export function contactShadow(ctx, x, y, rx, a = 1, lift = 0) {
  if (!(a > 0)) return;
  const k = clamp(1 - lift / 260, 0.35, 1), w = rx * k;
  ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.26);
  let g = ctx.createRadialGradient(0, 0, w * 0.08, 0, 0, w * 1.05);
  g.addColorStop(0, `rgba(0,0,0,${0.5 * a * k})`); g.addColorStop(0.55, `rgba(0,0,0,${0.26 * a * k})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, w * 1.05, 0, TAU); ctx.fill();
  g = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.55);
  g.addColorStop(0, `rgba(0,0,0,${0.62 * a * k})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, w * 0.55, 0, TAU); ctx.fill();
  ctx.restore();
}
// a matching colour grade for procedural fallbacks (ctx.filter where the canvas has it)
export function gradeProcedural(ctx, on) { try { if ('filter' in ctx) ctx.filter = on ? GRADE : 'none'; } catch (e) { /* no filters */ } }

// ------------------------------------------------------------------ tint overlays (silhouette-only colour: flash, poison, burn...)
let SC = null;
function scratch(w, h) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  if (!SC) SC = document.createElement('canvas');
  if (SC.width !== w) SC.width = w;
  if (SC.height !== h) SC.height = h;
  return SC;
}
function tint(ctx, sp, s, color, a) {
  if (!(a > 0.01)) return;
  const im = sp.img, iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
  if (!(iw > 0) || !(ih > 0)) return;
  const c = scratch(iw, ih); if (!c) return;
  const g = c.getContext('2d'); if (!g) return;
  g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, iw, ih); g.drawImage(im, 0, 0);
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = color; g.fillRect(0, 0, iw, ih); g.globalCompositeOperation = 'source-over';
  ctx.save(); ctx.globalAlpha *= clamp(a, 0, 1); ctx.drawImage(c, -sp.ax * s, -sp.ay * s, sp.def.w * s, sp.def.h * s); ctx.restore();
}

// status overlays: [color, strength]. Sprites keep their own paint; a status only washes and glows over it.
const WASH = { poison: ['#4fd060', 0.3], burn: ['#ff8a2a', 0.32], vulnerable: ['#e8404a', 0.2], weak: ['#7a8ca8', 0.26], frail: ['#8e86a8', 0.22], bleed: ['#b3122e', 0.26], brittle: ['#9ed8ee', 0.24], rejection: ['#c64a8a', 0.2], infection: ['#a8c63a', 0.26], numb: ['#6a86b0', 0.22], marked: ['#f2c14e', 0.18], corroded: ['#b87a3a', 0.24], lured: ['#7fd1e0', 0.2], fragile: ['#c8d8e0', 0.2] };
function washOf(st, t) {
  if (!st) return null;
  let best = null;
  for (const id in WASH) if (st[id] > 0) { const w = WASH[id]; if (!best || w[1] > best[1]) best = [w[0], w[1], id]; }
  return best ? { color: best[0], a: best[1] * (0.7 + 0.3 * Math.sin(t * 4)), id: best[2] } : null;
}

// ------------------------------------------------------------------ presence: elite aura, boss presence
function aura(ctx, kind, x, y, bw, bh, t, reduced, dim) {
  const boss = kind === 'boss', col = boss ? '196,34,60' : '242,193,78', pulse = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * (boss ? 1.6 : 2.2));
  ctx.save(); ctx.translate(x, y);
  // back glow
  const R = Math.max(bw, bh) * (boss ? 0.82 : 0.66);
  const g = ctx.createRadialGradient(0, -bh * 0.5, R * 0.1, 0, -bh * 0.5, R);
  g.addColorStop(0, `rgba(${col},${(boss ? 0.34 : 0.26) * (0.75 + 0.25 * pulse) * dim})`); g.addColorStop(1, `rgba(${col},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -bh * 0.5, R, 0, TAU); ctx.fill();
  // floor sigil: flat ellipse rings
  ctx.lineWidth = boss ? 2.5 : 2; ctx.strokeStyle = `rgba(${col},${(0.5 + 0.2 * pulse) * dim})`;
  ctx.beginPath(); ctx.ellipse(0, 3, bw * (boss ? 0.62 : 0.55), bw * (boss ? 0.62 : 0.55) * 0.26, 0, 0, TAU); ctx.stroke();
  if (boss) { ctx.strokeStyle = `rgba(${col},${0.3 * dim})`; ctx.beginPath(); ctx.ellipse(0, 3, bw * 0.78, bw * 0.78 * 0.26, 0, 0, TAU); ctx.stroke(); }
  // rising motes (deterministic in t, nothing to allocate)
  if (!reduced) {
    const n = boss ? 9 : 5;
    ctx.fillStyle = `rgba(${boss ? '255,120,120' : '255,226,140'},${0.7 * dim})`;
    for (let i = 0; i < n; i++) {
      const p = (t * (0.18 + (i % 3) * 0.05) + i * 0.37) % 1, mx = Math.sin(i * 12.9 + t * 0.7) * bw * 0.42, my = -p * bh * 0.95;
      ctx.globalAlpha = (1 - p) * 0.8 * dim; ctx.beginPath(); ctx.arc(mx, my, 1.6 + (i % 2), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// block: a riveted steel plate hanging in front of the figure (toward the opponent), flashing when it takes a hit or is gained
function shieldPlate(ctx, x, y, bw, bh, dir, block, pulse) {
  const a = clamp(0.5 + Math.min(0.2, block * 0.008) + pulse * 0.4, 0, 0.95), px = x + dir * (bw * 0.5 + 12), h = bh * 0.8, w = 20 + pulse * 8;
  ctx.save(); ctx.translate(px, y - bh * 0.46);
  const g = ctx.createLinearGradient(-w, 0, w, 0);
  g.addColorStop(0, `rgba(160,190,205,${a * 0.18})`); g.addColorStop(0.5, `rgba(196,224,236,${a * 0.7})`); g.addColorStop(1, `rgba(160,190,205,${a * 0.18})`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, w, h / 2, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = `rgba(214,236,244,${a})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, 0, w, h / 2, 0, 0, TAU); ctx.stroke();
  ctx.fillStyle = `rgba(240,250,255,${a})`;
  for (const k of [-0.36, 0, 0.36]) { ctx.beginPath(); ctx.arc(dir * w * 0.5, k * h, 2.2, 0, TAU); ctx.fill(); }
  ctx.restore();
}

// ------------------------------------------------------------------ the figure
// o: { s (2x-px scale), flip, sx, sy (squash from the feet), rot (about the body), pivot (px above the feet), dy, alpha, flash, wash:{color,a}, glow:{color,a} }
function figure(ctx, sp, x, y, o) {
  const s = o.s, pv = o.pivot || 0;
  ctx.save();
  ctx.translate(x, y + (o.dy || 0));
  if (o.rot) { ctx.translate(0, -pv); ctx.rotate(o.rot); ctx.translate(0, pv); }
  ctx.scale((o.flip || 1) * (o.sx || 1), o.sy || 1);
  if (o.alpha !== undefined && o.alpha < 1) ctx.globalAlpha *= o.alpha;
  try { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; } catch (e) { /* fake ctx */ }
  ctx.drawImage(sp.img, -sp.ax * s, -sp.ay * s, sp.def.w * s, sp.def.h * s);
  if (o.wash) tint(ctx, sp, s, o.wash.color, o.wash.a);
  if (o.glow) tint(ctx, sp, s, o.glow.color, o.glow.a);
  if (o.flash > 0) tint(ctx, sp, s, '#ffffff', o.flash * 0.72);
  ctx.restore();
}

const bodyOf = (def) => (def && def.art && def.art.body) || '';

// Enemy pose from its display state ed (ui/combat.js mkEd): the attack rig (tell = wind-up, act = lunge, hold = contact, rec = recoil), the cast pulse,
// the hit reaction, the death collapse and the idle breath, which scales from the feet and never lifts the sprite.
export function enemyPoseOf(ed, def, t, reduced) {
  const P = { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, glow: 0, flash: 0, alpha: 1, shadowA: 1, lift: 0, cast: 0 };
  const a = ed.anim || {}, d = clamp(ed.dying || 0, 0, 1);
  const hitK = Math.max(a.hit || 0, clamp((ed.hurt || 0) * 3, 0, 1));
  P.flash = easeOut(hitK) * (d > 0 ? 0.0 : 1);
  if (d > 0) {
    // collapse: squash down at once, then settle and sink, then fade at the floor (never dissolve in the air)
    const q = easeOut(d / 0.34), p2 = clamp((d - 0.34) / 0.66, 0, 1);
    P.sy = lerp(1, 0.5, q) - 0.14 * easeIn(p2); P.sx = lerp(1, 1.2, q) + 0.06 * easeIn(p2);
    P.dy = 10 * easeOut(p2); P.alpha = 1 - clamp((p2 - 0.35) / 0.65, 0, 1); if (P.alpha < 0.002) P.alpha = 0; P.shadowA = P.alpha; P.flash = (1 - q) * 0.7;
    return P;
  }
  const idle = reduced ? 0 : Math.sin((t + (ed.phase || 0)) * 2.1);
  P.sy = 1 + (a.sq || 0) + idle * 0.016; P.sx = 1 / (1 + (a.sq || 0)) * (1 - idle * 0.008);
  const k = ed.atk && ed.atk.phase, s = ed.scale || 1;
  if (ed.atkKind === 'attack' && ed.atkT >= 0 && k && k !== 'idle') {
    let R = null;
    try { R = atkPose(def && def.id, bodyOf(def), k, ed.atk.k || 0); } catch (e) { R = null; }
    if (R) {
      P.dx = clamp(R.dx || 0, -120, 40) * s; P.dy = clamp(R.dy || 0, -50, 12) * s; P.rot = clamp(R.rot || 0, -0.5, 0.5);
      P.sy *= clamp(R.sy || 1, 0.7, 1.3); P.sx *= clamp(R.sx || 1, 0.7, 1.3); P.glow = clamp(R.glow || 0, 0, 1);
      P.lift = Math.max(0, -P.dy);
    }
  } else if (ed.atkKind === 'cast' && ed.atkT >= 0) {
    const c = clamp(ed.atkT / 0.45, 0, 1), up = Math.sin(c * Math.PI);
    P.sy *= 1 + 0.05 * up; P.sx *= 1 - 0.02 * up; P.cast = up; P.glow = 0.5 * up;
  }
  if (!reduced && hitK > 0) P.dx += Math.sin(t * 95) * 5 * hitK * hitK * s; // hit shake
  return P;
}

// Draw one painted enemy. (x, floorY) is the foot point, ed.scale the lane scale. Returns the pose (the caller reads shadowA).
export function drawEnemySprite(ctx, sp, def, ed, x, floorY, t, o = {}) {
  const reduced = !!o.reduced, P = enemyPoseOf(ed, def, t, reduced), k = ed.scale * U * kindK(def);
  const bw = ed.w || (sp.bbox[2] - sp.bbox[0]) * k, bh = ed.h || (sp.bbox[3] - sp.bbox[1]) * k, px = x + P.dx;
  const kind = def && def.kind, st = ed.st || {};
  ctx.save();
  if (P.alpha < 1) ctx.globalAlpha *= 1;
  contactShadow(ctx, px - P.dx * 0.15, floorY - 1, clamp(bw * 0.6, 40, 170), P.shadowA * (o.shadowA === undefined ? 1 : o.shadowA), P.lift);
  if ((kind === 'elite' || kind === 'boss') && !(ed.dying > 0.34)) aura(ctx, kind, px, floorY, bw, bh, t, reduced, P.alpha);
  const wash = washOf(st, t);
  const glow = P.glow > 0.02 ? { color: P.cast ? '#ffe9a8' : '#ff5a3a', a: P.glow * 0.34 } : null;
  figure(ctx, sp, px, floorY, { s: k, flip: FACING.enemy, sx: P.sx, sy: P.sy, rot: P.rot, pivot: bh * 0.45, dy: P.dy, alpha: P.alpha, flash: P.flash, wash: wash && !(ed.dying > 0) ? wash : null, glow });
  if (!(ed.dying > 0)) {
    if (ed.block > 0) shieldPlate(ctx, px, floorY, bw, bh, -1, ed.block, ed.bpulse || 0);
    if (!reduced && st.poison > 0) bubbles(ctx, px, floorY, bw, bh, t, '#7fe08a');
    if (!reduced && st.burn > 0) flames(ctx, px, floorY, bw, bh, t);
    if (ed.stunT > 0) stars(ctx, px, floorY - bh - 6, t, ed.stunT);
  }
  ctx.restore();
  return P;
}

// The hero. hs: { attack (S.P.attack 0..2), kick (heroKick), hit (0..1), block, bpulse, dying (0..1), t, reduced, win }
export function heroAttackPose(u) {
  // u 0..1 over the 0.5 s attack: anticipation (pull back, crouch), a fast strike, a long recoil
  if (u <= 0) return { dx: 0, rot: 0, sx: 1, sy: 1 };
  if (u < 0.28) { const e = easeOut(u / 0.28); return { dx: -12 * e, rot: -0.07 * e, sx: 1 + 0.02 * e, sy: 1 - 0.04 * e }; }
  if (u < 0.46) { const e = easeOut((u - 0.28) / 0.18); return { dx: lerp(-12, 46, e), rot: lerp(-0.07, 0.1, e), sx: lerp(1.02, 0.97, e), sy: lerp(0.96, 1.04, e) }; }
  const e = easeOut((u - 0.46) / 0.54); return { dx: lerp(46, 0, e), rot: lerp(0.1, 0, e), sx: lerp(0.97, 1, e), sy: lerp(1.04, 1, e) };
}
export function drawHeroSprite(ctx, sp, x, floorY, hs) {
  const t = hs.t || 0, d = clamp(hs.dying || 0, 0, 1), s = HERO_S, bw = (sp.bbox[2] - sp.bbox[0]) * s, bh = (sp.bbox[3] - sp.bbox[1]) * s;
  const A = heroAttackPose(hs.attack > 0 ? hs.attack / 2 : 0);
  let dx = A.dx - (hs.kick || 0) * 14, sx = A.sx, sy = A.sy, rot = A.rot, dy = 0, alpha = 1, flash = easeOut(hs.hit || 0) * 0.6, sh = 1;
  const idle = hs.reduced ? 0 : Math.sin(t * 2.0);
  if (d === 0) { sy *= 1 + idle * 0.016; sx *= 1 - idle * 0.008; if (hs.block > 0) { sy *= 0.97; rot -= 0.025; } }
  if (!hs.reduced && (hs.hit || 0) > 0) dx += Math.sin(t * 95) * 5 * hs.hit * hs.hit;
  if (hs.kick > 0) { sy *= 1 - 0.05 * Math.min(1, hs.kick); sx *= 1 + 0.03 * Math.min(1, hs.kick); }
  if (d > 0) { // the fall: crumple, then topple backwards and lie on the floor
    const q = easeOut(d / 0.3), p2 = clamp((d - 0.3) / 0.7, 0, 1);
    sy = lerp(1, 0.78, q); sx = lerp(1, 1.08, q); rot = -1.35 * easeIn(p2) * (1 - 0.1 * p2); dy = 8 * easeOut(p2); dx -= 26 * easeOut(p2); alpha = 1 - 0.55 * p2; flash = (1 - q) * 0.6; sh = 1 - 0.4 * p2;
  }
  ctx.save();
  contactShadow(ctx, x + dx * 0.5, floorY - 1, clamp(bw * 0.9, 48, 120) * (d > 0 ? 1 + 0.5 * easeIn(clamp((d - 0.3) / 0.7, 0, 1)) : 1), sh);
  figure(ctx, sp, x + dx, floorY, { s, flip: FACING.hero, sx, sy, rot, pivot: bh * 0.4, dy, alpha, flash });
  if (d === 0 && hs.block > 0) shieldPlate(ctx, x + dx, floorY, bw, bh, 1, hs.block, hs.bpulse || 0);
  if (d === 0 && !hs.reduced && hs.st) { if (hs.st.poison > 0) bubbles(ctx, x + dx, floorY, bw, bh, t, '#7fe08a'); if (hs.st.burn > 0) flames(ctx, x + dx, floorY, bw, bh, t); }
  ctx.restore();
  return { w: bw, h: bh };
}

function bubbles(ctx, x, y, bw, bh, t, col) {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = col;
  for (let i = 0; i < 4; i++) { const p = (t * 0.5 + i * 0.27) % 1; ctx.globalAlpha = (1 - p) * 0.8; ctx.beginPath(); ctx.arc(Math.sin(i * 7.3) * bw * 0.3, -bh * (0.2 + p * 0.7), 2.2 + (i % 2), 0, TAU); ctx.fill(); }
  ctx.restore();
}
function flames(ctx, x, y, bw, bh, t) {
  ctx.save(); ctx.translate(x, y);
  for (let i = 0; i < 5; i++) {
    const p = (t * 0.9 + i * 0.21) % 1, fx = Math.sin(i * 5.1) * bw * 0.32, fy = -bh * (0.1 + p * 0.55);
    ctx.globalAlpha = (1 - p) * 0.85; ctx.fillStyle = i % 2 ? '#ff9a3c' : '#ffd36a';
    ctx.beginPath(); ctx.ellipse(fx, fy, 4 * (1 - p) + 1.5, 7 * (1 - p) + 2, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
function stars(ctx, x, y, t, k) {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#f2c14e'; ctx.strokeStyle = '#1a1208'; ctx.lineWidth = 1.5; ctx.globalAlpha = clamp(k * 1.4, 0, 1);
  for (let i = 0; i < 3; i++) { const an = t * 3 + i * TAU / 3; ctx.beginPath(); ctx.arc(Math.cos(an) * 24, Math.sin(an) * 7, 4.5, 0, TAU); ctx.fill(); ctx.stroke(); }
  ctx.restore();
}

// ------------------------------------------------------------------ backdrop: the modular kit as a battle room
const KIT_FILES = { 'floors/wood': 1, 'floors/stone': 1, 'walls/wood': 1, 'walls/stone': 1, 'pieces/window': 1, 'pieces/door': 1, 'pieces/banner': 1, 'pieces/sconce': 1 };
const KIT = new Map();
const kitBase = () => (assets.base.endsWith('ward/') ? assets.base.slice(0, -5) + 'ward_kit/' : assets.base + 'kit/');
function kitImg(key, app) {
  if (!KIT_FILES[key]) return null;
  const want = assets.use2x(app) ? '@2x' : '@1x', file = key + want + '.webp';
  let e = KIT.get(file);
  if (!e) {
    e = { img: null, ok: false, bad: false }; KIT.set(file, e);
    try {
      if (!assets.available()) { e.bad = true; return null; }
      const im = hiLoader.make ? hiLoader.make() : new Image();
      im.onload = () => { e.ok = true; }; im.onerror = () => { e.bad = true; };
      im.src = kitBase() + file; e.img = im;
    } catch (err) { e.bad = true; }
  }
  return e.ok ? e.img : null;
}
export function __setKit(key, img, app) { KIT.set(key + (assets.use2x(app) ? '@2x' : '@1x') + '.webp', { img, ok: true, bad: false }); }
export function __resetKit() { KIT.clear(); BK.key = ''; BK.cv = null; BK.fade = 0; }

const WALL_B = 300, HORIZON = 150, WT = 56; // wall base line, vanishing line of the floor, top of the stage under the HUD bar
// What the room is made of, by act and encounter: normal fights in the wooden wards, elites and bosses in stone with banners.
export function recipeOf(act, kind) {
  const boss = kind === 'boss' || kind === 'final', elite = kind === 'elite';
  const a = act === 2 ? 2 : act === 3 ? 3 : 1;
  const wall = boss || elite || a === 3 ? 'stone' : 'wood', floor = boss || a === 2 ? 'stone' : 'wood';
  const tint = a === 1 ? 'rgba(150,185,160,0.30)' : a === 2 ? 'rgba(214,160,70,0.30)' : 'rgba(150,60,110,0.34)';
  const dim = boss ? 0.55 : elite ? 0.46 : 0.38;
  const lamps = boss ? [330, 640, 1010] : [400, 880];
  let pieces;
  if (boss) pieces = [['banner', 120, 0.62], ['door', 860, 0.9], ['banner', 640, 0.5], ['banner', 1190, 0.62], ['sconce', 330, 0.7], ['sconce', 1010, 0.7]];
  else if (elite) pieces = [['banner', 150, 0.56], ['window', 640, 0.62], ['banner', 1150, 0.56], ['sconce', 400, 0.7], ['sconce', 880, 0.7]];
  else pieces = [['window', 150, 0.62], ['door', 640, 0.7], ['window', 1130, 0.62], ['sconce', 400, 0.7], ['sconce', 880, 0.7]];
  return { wall, floor, tint, dim, lamps, pieces, boss, elite, act: a };
}
const BK = { key: '', cv: null, q: 1, fade: 0 };
function mkCanvas(w, h) { if (typeof document === 'undefined' || !document.createElement) return null; const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; }
function tileRect(g, img, x0, y0, x1, y1, tw, th, ox = 0, oy = 0) {
  g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
  for (let y = y0 - ((y0 - oy) % th + th) % th; y < y1; y += th) for (let x = x0 - ((x0 - ox) % tw + tw) % tw; x < x1; x += tw) g.drawImage(img, x, y, tw + 0.6, th + 0.6);
  g.restore();
}
// the floor in perspective: horizontal strips, each one a slice of the texture scaled by its depth, tiled across and baked once
function floorStrips(g, img, W, H, wallB) {
  const iw = img.naturalWidth || img.width || 512, ih = img.naturalHeight || img.height || 512, base = 0.78, ar = 0.42, step = 2;
  let v = 0;
  for (let y = wallB; y < H; y += step) {
    const f = (y - HORIZON) / (H - HORIZON), tw = iw * base * f, rows = step / (f * base * ar);
    const sy = v % ih, sh = Math.max(1, Math.min(rows, ih - sy));
    const x0 = W / 2 - tw * (Math.ceil(W / 2 / tw) + 0.5);
    for (let x = x0; x < W + tw; x += tw) g.drawImage(img, 0, sy, iw, sh, x, y, tw + 0.8, step + 0.8);
    v += rows;
  }
}
function bake(app, ctx, R, imgs, q) {
  const W = 1280, H = 720, cv = mkCanvas(W * q, H * q); if (!cv) return null;
  const g = cv.getContext('2d'); if (!g) return null;
  g.scale(q, q); g.imageSmoothingEnabled = true; try { g.imageSmoothingQuality = 'high'; } catch (e) { /* fake */ }
  g.fillStyle = '#0c0b0a'; g.fillRect(0, 0, W, H);
  // wall
  const wt = imgs.wall, ww = wt.naturalWidth || wt.width || 512, ws = R.wall === 'stone' ? 0.78 : 0.7;
  tileRect(g, wt, 0, 0, W, WALL_B, ww * ws, ww * ws);
  // lighting grade of the wall: dark at the top, lifted at the lamps, plus the act tint
  let gr = g.createLinearGradient(0, 0, 0, WALL_B); gr.addColorStop(0, `rgba(0,0,0,${R.dim + 0.3})`); gr.addColorStop(1, `rgba(0,0,0,${R.dim - 0.04})`);
  g.fillStyle = gr; g.fillRect(0, 0, W, WALL_B);
  g.fillStyle = R.tint; g.globalCompositeOperation = 'multiply'; g.fillRect(0, 0, W, WALL_B); g.globalCompositeOperation = 'source-over';
  // cornice shadow under the HUD bar and a chair rail
  gr = g.createLinearGradient(0, WT, 0, WT + 46); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, WT, W, 46);
  g.fillStyle = 'rgba(8,6,5,0.75)'; g.fillRect(0, WALL_B - 78, W, 5); g.fillStyle = 'rgba(255,230,190,0.1)'; g.fillRect(0, WALL_B - 73, W, 2);
  // pieces
  const ps = assets.use2x(app) ? 0.5 : 1; // kit sprites are 2x files (or half-size @1x)
  for (const [name, px, sc] of R.pieces) {
    const im = imgs[name]; if (!im) continue;
    const iw = (im.naturalWidth || im.width) * ps, ih = (im.naturalHeight || im.height) * ps, k = sc * (name === 'door' ? 1.0 : 1.0) * 1.2, w = iw * k, h = ih * k;
    const y = name === 'door' ? WALL_B - h + 6 : name === 'sconce' ? 150 : 76 + (WALL_B - 78 - 76 - h) / 2 + h * 0.0;
    g.save(); g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 14; g.shadowOffsetY = 4; g.globalAlpha = 0.92;
    g.drawImage(im, px - w / 2, name === 'banner' ? WT + 14 : y, w, h); g.restore();
  }
  // baseboard
  gr = g.createLinearGradient(0, WALL_B - 6, 0, WALL_B + 30); gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = '#2a1d15'; g.fillRect(0, WALL_B - 14, W, 14); g.fillStyle = 'rgba(255,220,170,0.16)'; g.fillRect(0, WALL_B - 14, W, 2); g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, WALL_B - 2, W, 2);
  // floor
  floorStrips(g, imgs.floor, W, H, WALL_B);
  gr = g.createLinearGradient(0, WALL_B, 0, H); gr.addColorStop(0, `rgba(0,0,0,${R.dim + 0.34})`); gr.addColorStop(0.35, `rgba(0,0,0,${R.dim + 0.1})`); gr.addColorStop(1, `rgba(0,0,0,${R.dim + 0.22})`);
  g.fillStyle = gr; g.fillRect(0, WALL_B, W, H - WALL_B);
  g.fillStyle = R.tint; g.globalCompositeOperation = 'multiply'; g.fillRect(0, WALL_B, W, H - WALL_B); g.globalCompositeOperation = 'source-over';
  gr = g.createLinearGradient(0, WALL_B, 0, WALL_B + 40); gr.addColorStop(0, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, WALL_B, W, 40);
  // side falloff
  gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, 'rgba(0,0,0,0.45)'); gr.addColorStop(0.18, 'rgba(0,0,0,0)'); gr.addColorStop(0.82, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  return cv;
}

// Draws the battle room. Returns true when it drew the kit room; false means the caller draws the old backdrop (kit not decoded or not available).
export function drawBackdrop(app, ctx, o) {
  const imgs = { wall: null, floor: null, window: kitImg('pieces/window', app), door: kitImg('pieces/door', app), banner: kitImg('pieces/banner', app), sconce: kitImg('pieces/sconce', app) };
  const R = recipeOf(o.act, o.kind);
  imgs.wall = kitImg('walls/' + R.wall, app); imgs.floor = kitImg('floors/' + R.floor, app);
  if (!imgs.wall || !imgs.floor) return false;
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1, q = clamp(Math.round((app.scale || 1) * dpr * 2) / 2, 1, 1.5);
  const key = [R.act, R.wall, R.floor, R.boss ? 'b' : R.elite ? 'e' : 'n', q, imgs.window ? 1 : 0, imgs.door ? 1 : 0, imgs.banner ? 1 : 0, imgs.sconce ? 1 : 0].join('|');
  if (BK.key !== key) { const cv = bake(app, ctx, R, imgs, q); if (!cv) return false; BK.key = key; BK.cv = cv; BK.q = q; BK.fade = o.t > 0 && BK.fade > 0 ? BK.fade : 0; }
  BK.fade = Math.min(1, BK.fade + 0.05);
  ctx.save(); ctx.globalAlpha = o.reduced ? 1 : easeOut(BK.fade);
  ctx.drawImage(BK.cv, 0, 0, 1280, 720);
  ctx.restore();
  lampLight(ctx, R, o.t || 0, o.reduced);
  return true;
}
// lamp cones: warm light falling from each sconce across the wall and floor (additive, flickering; steady with reduced motion)
function lampLight(ctx, R, t, reduced) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  R.lamps.forEach((lx, i) => {
    const fl = reduced ? 0.9 : 0.86 + 0.08 * Math.sin(t * 7.3 + i * 2.1) + 0.06 * Math.sin(t * 13.7 + i * 5.3), top = 168, a = 0.2 * fl * (R.boss ? 0.8 : 1);
    for (const [wd, ka] of [[190, 0.5], [130, 0.8], [70, 1]]) { // nested cones: a soft edge without a blur
      const g = ctx.createLinearGradient(0, top, 0, 470); g.addColorStop(0, `rgba(255,196,110,${a * ka * 0.55})`); g.addColorStop(1, 'rgba(255,170,80,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(lx - 10, top); ctx.lineTo(lx + 10, top); ctx.lineTo(lx + wd, 470); ctx.lineTo(lx - wd, 470); ctx.closePath(); ctx.fill();
    }
    const r = ctx.createRadialGradient(lx, top + 6, 2, lx, top + 6, 90); r.addColorStop(0, `rgba(255,214,140,${0.5 * fl})`); r.addColorStop(1, 'rgba(255,160,70,0)');
    ctx.fillStyle = r; ctx.beginPath(); ctx.arc(lx, top + 6, 90, 0, TAU); ctx.fill();
    const pool = ctx.createRadialGradient(lx, 392, 6, lx, 392, 200); pool.addColorStop(0, `rgba(255,190,100,${0.16 * fl})`); pool.addColorStop(1, 'rgba(255,170,80,0)');
    ctx.save(); ctx.translate(0, 392); ctx.scale(1, 0.3); ctx.translate(0, -392); ctx.fillStyle = pool; ctx.beginPath(); ctx.arc(lx, 392, 200, 0, TAU); ctx.fill(); ctx.restore();
  });
  ctx.restore();
}
