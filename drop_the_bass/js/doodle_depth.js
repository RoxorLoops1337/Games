// doodle_depth.js: the DOODLE drawing for the depth systems in the battle view: turret branch choice, boss phase effects, hero ability effects,
// the drop pool popover, run modifier badges and their popover. battle.js owns the state and the sim calls; this file draws and keeps a small
// per-battle effect state in `b.dx` (freeze timer, dark lane band, coin rain, shield pings...). No Math.random, no Date: jitter comes from hashes
// and the battle clock. Crayon look: no glow, no gradients. Every function leaves the ctx state as it found it (save/restore).
import { W, H, COLS, TURRETS, BOSSES, COL, BOARD_X, BOARD_Y, BOARD_W, BOARD_H, TILE, TURRET_PARTNERS, SYNERGY_BY_ID } from './data_core.js';
import { TURRET_BRANCHES, BRANCH_BY_ID, BOSS_PHASE_EFFECTS, RUN_MODIFIER_BY_ID, BRANCH_LEVEL, ENDLESS_MILESTONES } from './data_depth.js';
import * as AE from './art_entities.js';
import * as K from './doodle_kit.js';
import * as DH from './doodle_hud.js';
import { BT } from './battle_text.js';
import { R } from './battle.js';

const C = K.C, INK = C.ink, TAU = Math.PI * 2, DIM = '#6b6477';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hh = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const frame = (t) => Math.floor(t * K.BOIL_FPS) % 3;
const easeOutBack = (k) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };

export const ABILITY_GLYPH = { blast: 'wave', freeze: 'snow', overclock: 'bolt', song: 'note', coinrain: 'coin', shield: 'shield' };
export const ABILITY_SHORT = { blast: 'Blast', freeze: 'Freeze', overclock: 'Overclock', song: 'Song', coinrain: 'Coin Rain', shield: 'Shield' };
export const ABILITY_COLOR = { blast: C.lime, freeze: C.sky, overclock: C.orange, song: C.pink, coinrain: C.gold, shield: C.sky };

// ---- hit rectangles (logical units). The board ends at y 840 and the DROP row hit starts at 901 (battle.js ROW_HIT): the pool strip gets the 61
// units in between, which is 44 px on a 390 wide phone. The drawn strip (R.pool) is smaller, the icons sit in its middle.
export const POOL_HIT = { x: 90, y: 840, w: 360, h: 61 };
export function modsHit(b) { const n = (b.run.modifiers || []).length; return n ? { x: 496, y: 122, w: 44, h: 14 + 31 * n } : null; }
const inR = (r, x, y) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
export function poolIndexAt(b, x, y) {
  if (!inR(POOL_HIT, x, y)) return -1;
  const n = b.pool.odds.length; if (!n) return -1;
  const r = R.pool, pitch = Math.min(29, (r.w - 16) / n), x0 = r.x + r.w / 2 - (n - 1) * pitch / 2;
  return clamp(Math.round((x - x0) / pitch), 0, n - 1);
}

// ---- accessibility: the colour-blind cue switch (profile setting, default off). Every cue in this file and doodle_battle.js asks this one function.
export const cbOn = (b) => !!(b && b.prof && b.prof.settings && b.prof.settings.colorblind === true);

// ---- endless milestones: the next one not yet reached and how far the run is towards it (null outside endless or when all are reached)
export function milestoneInfo(run) {
  if (!run || !run.endless) return null;
  const done = run.milestones || [];
  let prev = 0;
  for (const m of ENDLESS_MILESTONES) {
    if (!done.includes(m.id)) return { id: m.id, wave: m.wave, name: m.name, prev, frac: clamp(((run.wave || 0) - prev) / Math.max(1, m.wave - prev), 0, 1) };
    prev = m.wave;
  }
  return null;
}
// the chip hangs under the wave pill; it hides behind the boss bar (which sits at the same height) and flashes when a milestone is reached
export const MS_CHIP = { x: 262, y: 108, w: 138, h: 23 };
export function drawMilestoneChip(b, ctx, t) {
  const mi = milestoneInfo(b.run); if (!mi) return;
  if (b.run.enemies.some((e) => e.boss)) return;
  const c = MS_CHIP, fl = b.msFlash || 0, pulse = fl > 0 ? 0.5 + 0.5 * Math.sin(t * 22) : 0;
  DH.setHudTime(t);
  ctx.save();
  const sc = 1 + fl * 0.12; ctx.translate(c.x + c.w / 2, c.y + c.h / 2); ctx.scale(sc, sc); ctx.translate(-(c.x + c.w / 2), -(c.y + c.h / 2));
  DH.glass(ctx, c.x, c.y, c.w, c.h, 8, { edge: fl > 0 ? C.gold : C.lav });
  if (fl > 0) { ctx.globalAlpha = 0.35 + 0.4 * pulse; ctx.fillStyle = C.gold; DH.rrect(ctx, c.x, c.y, c.w, c.h, 8); ctx.fill(); ctx.globalAlpha = 1; }
  AE.drawGlyph(ctx, 'star', c.x + 13, c.y + 9.5, 16, C.gold);
  DH.text(ctx, BT.goalWave(mi.wave), c.x + 24 + (c.w - 30) / 2, c.y + 9, 13, INK, 'center', 900, { maxW: c.w - 34 });
  // progress bar along the bottom edge of the chip
  const bx = c.x + 9, bw = c.w - 18, by = c.y + c.h - 6;
  ctx.fillStyle = INK; ctx.fillRect(bx - 1.5, by - 1.5, bw + 3, 6); ctx.fillStyle = '#fffdf4'; ctx.fillRect(bx, by, bw, 3);
  ctx.fillStyle = fl > 0 ? C.gold : C.pink; ctx.fillRect(bx, by, bw * (fl > 0 ? 1 : mi.frac), 3);
  ctx.restore();
}

// ---- state
export function st(b) {
  return b.dx || (b.dx = { freezeT: 0, freezeMax: 1, dark: null, steals: {}, coins: [], coinN: 0, coinAcc: 0, ping: 0, durs: {}, ocT: 0 });
}
export function tick(b, dt) {
  const s = st(b), run = b.run;
  if (s.freezeT > 0) s.freezeT = Math.max(0, s.freezeT - dt);
  if (s.ping > 0) s.ping = Math.max(0, s.ping - dt * 2.2);
  if (s.dark && b.t > s.dark.until) s.dark = null;
  for (const id of Object.keys(s.steals)) { const t = run.turretById(+id); if (!t || !(t.stolen > 0)) delete s.steals[id]; }
  if (run.coinRainT > 0 && !b.paused) {
    s.coinAcc += dt;
    while (s.coinAcc > 0.06) { s.coinAcc -= 0.06; spawnCoin(s, false); }
  }
  for (let i = s.coins.length - 1; i >= 0; i--) { const c = s.coins[i]; c.y += c.vy * dt; c.x += c.vx * dt; c.rot += dt * c.spin; if (c.y > H + 20) s.coins.splice(i, 1); }
}
function spawnCoin(s, burst) {
  if (s.coins.length > 70) return;
  const n = ++s.coinN;
  s.coins.push({ x: 20 + hh(n * 3.1) * (W - 40), y: burst ? -20 - hh(n * 1.7) * 120 : -14, vy: 260 + hh(n * 5.3) * 200, vx: (hh(n * 7.9) - 0.5) * 40, rot: hh(n) * TAU, spin: 4 + hh(n * 2.3) * 6, r: 8 + hh(n * 4.1) * 4 });
}
// event-side state changes (battle.js still does the sfx, banner and particles)
export function onEvent(b, e) {
  const s = st(b);
  if (e.k === 'bossPhase') {
    if (e.id === 'dark_lane' && e.cols) s.dark = { c0: e.cols[0], c1: e.cols[1], from: b.t, until: b.t + (e.dur || 5), dur: e.dur || 5 };
    if (e.id === 'steal_turret' && e.turretId != null) s.steals[e.turretId] = { total: e.dur || 8, bx: e.bossX, by: e.bossY };
  } else if (e.k === 'freeze') { s.freezeT = e.dur || 3; s.freezeMax = s.freezeT; }
  else if (e.k === 'hero') {
    const run = b.run;
    if (e.ability === 'overclock') s.durs.overclock = Math.max(run.overclockT, 0.1);
    else if (e.ability === 'coinrain') { s.durs.coinrain = Math.max(run.coinRainT, 0.1); for (let i = 0; i < 30; i++) spawnCoin(s, true); }
    else if (e.ability === 'shield') s.durs.shield = Math.max(run.shieldT, 0.1);
  } else if (e.k === 'leak' && e.shield) s.ping = 1;
}
export function activeFrac(b, ability) {
  const s = st(b), run = b.run;
  const cur = ability === 'overclock' ? run.overclockT : ability === 'coinrain' ? run.coinRainT : ability === 'shield' ? run.shieldT : ability === 'freeze' ? s.freezeT : 0;
  if (!(cur > 0)) return 0;
  const mx = ability === 'freeze' ? s.freezeMax : (s.durs[ability] || cur);
  return clamp(cur / Math.max(mx, cur), 0, 1);
}

// ---- small drawing helpers
function wobRing(ctx, x, y, r, col, w, t, o = {}) {
  const fr = frame(t), n = clamp(Math.round(r / 3), 10, 26), seed = o.seed || 0;
  const path = () => {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) { const a = o.a0 != null ? o.a0 + (o.a1 - o.a0) * i / n : i / n * TAU, q = r * (1 + (hh((i % n) * 5.3 + fr * 9.1 + seed) - 0.5) * 0.06); const px = x + Math.cos(a) * q, py = y + Math.sin(a) * q; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
  };
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (o.dash) { ctx.setLineDash(o.dash); ctx.lineDashOffset = -(o.march || 0); }
  const al = o.alpha == null ? 1 : o.alpha;
  if (o.fill) { path(); ctx.globalAlpha = al * o.fill; ctx.fillStyle = col; ctx.fill(); }
  if (o.ink !== false) { path(); ctx.globalAlpha = al * 0.85; ctx.strokeStyle = INK; ctx.lineWidth = w + 3; ctx.stroke(); }
  path(); ctx.globalAlpha = al; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
  ctx.restore();
}
function starPath(ctx, x, y, r, rot) { const p = K.star(x, y, r, 0.45, rot, 4); ctx.beginPath(); ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]); ctx.closePath(); }
function disc(ctx, x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 2.6; ctx.strokeStyle = INK; ctx.stroke(); }
// a round sticker with a glyph in it
export function emblem(ctx, x, y, r, glyph, col) {
  ctx.save(); disc(ctx, x, y, r, C.paper);
  ctx.beginPath(); ctx.arc(x, y, r - 3.5, 0, TAU); ctx.fillStyle = col; ctx.globalAlpha = 0.35; ctx.fill(); ctx.globalAlpha = 1;
  AE.drawGlyph(ctx, glyph, x, y, r * 1.35, col); ctx.restore();
}
// A turret list icon (paper tile plus the instrument) baked once per type and size and replayed with one drawImage; art_entities.drawTurretIconFlat
// redraws about fifteen paths every call, and the pool strip alone shows a dozen of them every frame.
export function flatIcon(ctx, type, x, y, size) {
  const sz = Math.round(size * 2) / 2, box = Math.ceil(sz * 1.2) + 4;
  const e = K.sprite('dd:ico:' + type + ':' + sz, box, box, (pen, c) => AE.drawTurretIconFlat(c, type, 0, 0, sz), { frames: 1 });
  K.blit(ctx, e, x, y, 0);
}
const fitText = (ctx, str, maxW, size) => {
  ctx.save(); ctx.font = 'bold ' + size + 'px ' + DH.FONT; let out = String(str);
  if (ctx.measureText(out).width > maxW) { while (out.length > 4 && ctx.measureText(out + '...').width > maxW) out = out.slice(0, -1); out += '...'; }
  ctx.restore(); return out;
};

// ================================================================================================ 1. branches
export function branchOf(tu) { return tu && tu.branch ? BRANCH_BY_ID[tu.branch] || null : null; }
export function branchLayout(b, tu, box) {
  const opts = b.run.branchOptions(tu);
  const HEAD = 32, CH = 100, PH = HEAD + CH + 14, GAP = 10, below = box.y < BOARD_Y + BOARD_H / 2;
  const y = below ? box.y + box.h + 8 : box.y - 8 - PH, x = 16, w = 508;
  const cw = (w - 24 - GAP) / 2;
  return { box: { x, y, w, h: PH }, cards: opts.map((o, i) => ({ x: x + 12 + i * (cw + GAP), y: y + HEAD, w: cw, h: CH, id: o.id, name: o.name, desc: o.desc, glyph: o.glyph })) };
}
export function drawBranchPanel(b, ctx, tu, box) {
  const lay = branchLayout(b, tu, box), def = TURRETS[tu.type], t = b.t, B = lay.box;
  const pr = b.branchPress && b.t - b.branchPress.t < 0.2 ? b.branchPress.id : null;
  ctx.save();
  DH.glass(ctx, B.x, B.y, B.w, B.h, 16, { edge: C.gold, glow: C.gold, glowA: 0.55 + 0.3 * Math.sin(t * 6) });
  starPath(ctx, B.x + 26, B.y + 18, 10 + Math.sin(t * 5) * 1.5, t * 0.8); ctx.fillStyle = C.yellow; ctx.fill(); ctx.lineWidth = 2.4; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.stroke();
  DH.text(ctx, BT.chooseUpgrade(), B.x + 46, B.y + 18, 20, INK, 'left', 900, { maxW: 170 });
  DH.text(ctx, BT.pickPath(def.name, tu.level), B.x + B.w - 14, B.y + 18, 12, DIM, 'right', 900, { maxW: B.w - 250 });
  for (let i = 0; i < lay.cards.length; i++) {
    const c = lay.cards[i], down = pr === c.id, dy = down ? 3 : 0, k = 0.5 + 0.5 * Math.sin(t * 4 + i * 1.7);
    DH.glass(ctx, c.x, c.y + dy, c.w, c.h, 14, { edge: def.color, glow: i === 0 ? null : null });
    ctx.save(); ctx.globalAlpha = 0.5 + 0.4 * k; ctx.setLineDash([8, 7]); ctx.lineDashOffset = -t * 20; DH.rrect(ctx, c.x - 2, c.y + dy - 2, c.w + 4, c.h + 4, 16); ctx.strokeStyle = def.color; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
    emblem(ctx, c.x + 30, c.y + dy + 32, 20, c.glyph, def.color);
    if (cbOn(b)) { ctx.save(); disc(ctx, c.x + 10, c.y + dy + 10, 9, i ? C.yellow : C.paper); ctx.restore(); DH.text(ctx, i ? 'B' : 'A', c.x + 10, c.y + dy + 10.5, 13, INK, 'center', 900, { maxW: 14 }); }
    DH.text(ctx, fitText(ctx, c.name, c.w - 66, 17), c.x + 58, c.y + dy + 20, 17, INK, 'left');
    DH.wrapText(ctx, c.desc, c.x + 58, c.y + dy + 42, c.w - 66, 12, 15, INK, 'left', 3);
    DH.text(ctx, BT.tap(), c.x + 30, c.y + dy + c.h - 14, 11, def.color === C.yellow ? '#b8780a' : def.color, 'center', 900, { maxW: 50 });
  }
  ctx.restore();
  return lay;
}
// the sparkle badge above a turret that can take a branch
export function drawBranchBadge(b, ctx, tu, t) {
  const x = tu.x + 22, y = tu.y - 28 + Math.sin(t * 5 + tu.id) * 2, k = 0.5 + 0.5 * Math.sin(t * 7 + tu.id);
  ctx.save();
  starPath(ctx, x, y, 11 + k * 2.5, t * 0.9); ctx.fillStyle = C.yellow; ctx.fill(); ctx.lineWidth = 2.6; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.stroke();
  DH.text(ctx, '!', x, y + 1, 12, INK, 'center');
  ctx.restore();
}
// a small emblem on a branched turret
export function drawBranchMark(b, ctx, tu) {
  const br = branchOf(tu); if (!br) return;
  emblem(ctx, tu.x + 24, tu.y + 22, 10, br.glyph, TURRETS[tu.type].color);
  if (cbOn(b)) {   // which of the two paths: a letter on the corner of the emblem
    const i = Math.max(0, (TURRET_BRANCHES[tu.type] || []).findIndex((q) => q.id === tu.branch));
    ctx.save(); disc(ctx, tu.x + 33, tu.y + 31, 7, i ? C.yellow : C.paper); ctx.restore(); DH.text(ctx, i ? 'B' : 'A', tu.x + 33, tu.y + 31.5, 10, INK, 'center', 900, { maxW: 10 });
  }
}

// ================================================================================================ 2. boss phases and turret marks
// a dim crayon scribble over the columns the boss darkened (drawn over the turrets, under the enemies)
export function drawDarkLane(b, ctx, t) {
  const d = st(b).dark; if (!d) return;
  const age = b.t - d.from, left = d.until - b.t, a = Math.min(clamp(age / 0.35, 0, 1), clamp(left / 0.6, 0, 1));
  const x0 = BOARD_X + d.c0 * TILE, x1 = BOARD_X + (d.c1 + 1) * TILE, y0 = BOARD_Y, y1 = BOARD_Y + BOARD_H, fr = frame(t);
  ctx.save(); ctx.globalAlpha = a * 0.2; ctx.fillStyle = INK; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.globalAlpha = a * 0.5; ctx.strokeStyle = '#3a3347'; ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
  let dir = 1;
  for (let y = y0 + 6; y < y1; y += 13) {
    const j = hh(y * 0.37 + fr * 7.1) * 5;
    if (dir > 0) { ctx.moveTo(x0 + 3 + j, y); ctx.lineTo(x1 - 3 - j, y + 9); } else { ctx.moveTo(x1 - 3 - j, y); ctx.lineTo(x0 + 3 + j, y + 9); }
    dir = -dir;
  }
  ctx.stroke(); ctx.restore();
  const cx = (x0 + x1) / 2, cb = cbOn(b);
  if (cb) {   // colour-blind cue: a second hatch the other way (a cross-hatch is never a normal tile) and a dashed border with a lock
    ctx.save(); ctx.globalAlpha = a * 0.45; ctx.strokeStyle = '#3a3347'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath();
    for (let y = y0 + 6; y < y1; y += 26) { ctx.moveTo(x0 + 4, y + 9); ctx.lineTo(x1 - 4, y); }
    ctx.stroke(); ctx.globalAlpha = a; ctx.setLineDash([12, 8]); ctx.lineDashOffset = -t * 14; ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.strokeRect(x0 + 2, y0 + 2, x1 - x0 - 4, y1 - y0 - 4);
    ctx.restore();
    ctx.save(); ctx.globalAlpha = a; AE.drawGlyph(ctx, 'lock', cx - 70, y0 + 43, 22, INK); AE.drawGlyph(ctx, 'lock', cx + 70, y0 + 43, 22, INK); ctx.restore();
  }
  ctx.save(); ctx.globalAlpha = a; DH.glass(ctx, cx - 58, y0 + 30, 116, 26, 9, { edge: C.purple }); DH.text(ctx, BT.darkLane(Math.ceil(Math.max(0, left))), cx, y0 + 43, 13, INK, 'center', 900, { maxW: 104 }); ctx.restore();
}
// a gray smudge on turrets that are jammed, in the dark or stolen
export function drawTurretMark(b, ctx, tu, t) {
  const run = b.run, s = st(b);
  const stolen = tu.stolen > 0, dark = tu.dark > 0, jam = tu.jam > 0;
  if (stolen || dark || jam) {
    ctx.save(); ctx.globalAlpha = stolen ? 0.5 : 0.42; ctx.fillStyle = '#8e8a9a'; ctx.beginPath(); ctx.arc(tu.x, tu.y + 2, 31, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.5; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath();
    for (let i = -2; i <= 2; i++) { ctx.moveTo(tu.x + i * 11 - 12, tu.y + 26); ctx.lineTo(tu.x + i * 11 + 12, tu.y - 22); }
    ctx.stroke(); ctx.restore();
    if (jam && !stolen) DH.text(ctx, 'zz', tu.x + 18, tu.y - 26 + Math.sin(t * 4 + tu.id) * 2, 13, C.purple, 'center');
    if (dark && !stolen) DH.text(ctx, BT.dark(), tu.x, tu.y - 30, 11, '#fff', 'center', 900, { maxW: 60 });
  }
  if (stolen) {
    const info = s.steals[tu.id] || (s.steals[tu.id] = { total: Math.max(8, tu.stolen) }), total = Math.max(info.total, tu.stolen), f = clamp(tu.stolen / total, 0, 1);
    const boss = run.enemies.find((e) => e.boss), bx = boss ? boss.x : tu.x, by = boss ? boss.y : BOARD_Y - 30;
    // the rope: a dashed wobbly line from the boss to the turret
    ctx.save(); ctx.lineCap = 'round'; ctx.setLineDash([9, 6]); ctx.lineDashOffset = -t * 18; ctx.lineWidth = 3.2; ctx.strokeStyle = '#8a5a2b'; ctx.globalAlpha = 0.85;
    const mx = (bx + tu.x) / 2 + Math.sin(t * 3 + tu.id) * 14, my = (by + tu.y) / 2 + 10;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(mx, my, tu.x, tu.y - 8); ctx.stroke(); ctx.restore();
    // the ghost sitting on top of it
    const gy = tu.y - 18 + Math.sin(t * 4 + tu.id) * 3;
    ctx.save(); ctx.translate(tu.x, gy); ctx.beginPath(); ctx.moveTo(-13, 12); ctx.lineTo(-13, -3); ctx.arc(0, -3, 13, Math.PI, 0); ctx.lineTo(13, 12);
    for (let i = 0; i < 3; i++) ctx.quadraticCurveTo(13 - i * 8.7 - 2.9, 18 + (i % 2 ? -2 : 2), 13 - (i + 1) * 8.7, 12);
    ctx.closePath(); ctx.fillStyle = '#fffdf4'; ctx.fill(); ctx.lineWidth = 2.8; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-5, -4, 2.6, 0, TAU); ctx.arc(5, -4, 2.6, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(0, 4, 3, 2.5, 0, 0, TAU); ctx.fill(); ctx.restore();
    // countdown ring + seconds
    wobRing(ctx, tu.x, tu.y, 38, '#d8d2e4', 5, t, { alpha: 0.7, seed: tu.id });
    wobRing(ctx, tu.x, tu.y, 38, C.purple, 5, t, { a0: -Math.PI / 2, a1: -Math.PI / 2 + TAU * f, seed: tu.id + 4 });
    DH.glass(ctx, tu.x - 16, tu.y + 24, 32, 18, 7, { edge: C.purple });
    DH.text(ctx, Math.ceil(tu.stolen) + 's', tu.x, tu.y + 33, 12, INK, 'center');
  }
}
// overclock: turrets pulse orange
export function drawOverclock(b, ctx, tu, t) {
  if (!(b.run.overclockT > 0)) return;
  const k = 0.5 + 0.5 * Math.sin(t * 11 + tu.id), left = b.run.overclockT, a = left < 1 ? 0.4 + 0.6 * Math.sin(t * 24) * Math.sin(t * 24) : 1;
  wobRing(ctx, tu.x, tu.y, 33 + k * 3, C.orange, 3.5, t, { alpha: (0.55 + 0.4 * k) * a, seed: tu.id });
  ctx.save(); ctx.translate(tu.x - 24, tu.y - 24); ctx.globalAlpha = 0.9 * a; ctx.beginPath(); ctx.moveTo(4, -9); ctx.lineTo(-5, 2); ctx.lineTo(0, 2); ctx.lineTo(-4, 10); ctx.lineTo(6, -2); ctx.lineTo(1, -2); ctx.closePath();
  ctx.fillStyle = C.yellow; ctx.fill(); ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
}
// bulwark bubble and enrage steam on a boss
export function drawBossMarks(b, ctx, e, t) {
  if (e.shield > 0 && e.bulwarkMax > 0) {
    const f = clamp(e.shield / e.bulwarkMax, 0, 1), r = e.r * 1.38;
    ctx.save();
    ctx.globalAlpha = 0.16 + 0.12 * f; ctx.fillStyle = '#9fdcff'; ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.fill(); ctx.restore();
    wobRing(ctx, e.x, e.y, r, C.sky, 4 + f * 2, t, { alpha: 0.55 + 0.4 * f, seed: 5 });
    ctx.save(); ctx.globalAlpha = 0.9; ctx.lineCap = 'round'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(e.x, e.y, r - 7, Math.PI * 1.1, Math.PI * 1.4); ctx.stroke(); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(e.x, e.y, r - 7, Math.PI * 1.5, Math.PI * 1.56); ctx.stroke(); ctx.restore();
  }
  if (e.rageMul > 1) {
    for (let k = 0; k < 3; k++) {
      const ph = (t * 0.9 + k / 3) % 1, x = e.x + (k - 1) * e.r * 0.55 + Math.sin(t * 3 + k) * 4, y = e.y - e.r * 0.75 - ph * 34, r = 4 + ph * 8;
      ctx.save(); ctx.globalAlpha = (1 - ph) * 0.95; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = '#ff7a6a'; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
    }
    const vx = e.x + e.r * 0.62, vy = e.y - e.r * 0.62, p = 1 + 0.15 * Math.sin(t * 10);
    ctx.save(); ctx.translate(vx, vy); ctx.scale(p, p); ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 5.5; ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(6, -2); ctx.moveTo(-6, 4); ctx.lineTo(6, 4); ctx.moveTo(-2, -7); ctx.lineTo(-2, 9); ctx.moveTo(3, -7); ctx.lineTo(3, 9); ctx.stroke();
    ctx.strokeStyle = C.red; ctx.lineWidth = 2.6; ctx.stroke(); ctx.restore();
  }
}
// phase thresholds (hp fractions) of the living boss for the HUD bar
export function phaseTicks(b, boss) {
  const run = b.run; if (!run.bossPhaseList) return null;
  const list = run.bossPhaseList(boss) || [];
  const at = [...new Set(list.map((p) => p.at).filter((v) => v > 0 && v < 1))];   // several effects can share one threshold (Dr. Dead Air has three at 0.33): one notch
  return at.length ? at : null;
}
// the notches drawn on the boss bar (the Mr. Playback fallback when the sim lists no phases)
export function bossTicks(b, boss) { return phaseTicks(b, boss) || (boss.type === 'playback' ? [0.33, 0.66] : null); }
// colour-blind cue: each notch carries the number of the phase it leads to (the highest threshold starts phase 2); phases already reached are filled
function drawPhaseNumbers(b, ctx, boss, bx, by, bw, phase) {
  const ticks = bossTicks(b, boss); if (!ticks) return;
  const desc = ticks.slice().sort((a, c) => c - a);
  ctx.save(); ctx.lineCap = 'round';
  desc.forEach((at, i) => {
    const x = bx + bw * at, y = by + 31, n = i + 2, reached = phase >= n;
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, by + 18); ctx.lineTo(x, y - 6); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.fillStyle = reached ? C.red : C.paper; ctx.fill(); ctx.lineWidth = 2.6; ctx.stroke();
    DH.text(ctx, String(n), x, y + 0.5, 12, reached ? '#fff' : INK, 'center', 900, { maxW: 12 });
  });
  ctx.restore();
}
// "PHASE n/m" counts the distinct health thresholds (the notches on the bar), not every effect: sim.js lists seven effects for Dr. Dead Air but only four steps
export function phaseState(b, boss, info) {
  const ticks = bossTicks(b, boss);
  if (!ticks) return { phase: Math.min(info.phase || 1, info.phases || 1), phases: info.phases || 1 };
  const f = info.hpFrac == null ? boss.hp / boss.maxHp : info.hpFrac;
  return { phase: 1 + ticks.filter((at) => f <= at + 1e-9).length, phases: ticks.length + 1 };
}
// the shield strip and "PHASE n/m" tag on the boss bar
export function drawBossHud(b, ctx, boss, bx, by, bw, t) {
  const info = b.run.bossInfo ? b.run.bossInfo(boss.id) : null; if (!info) return;
  if (cbOn(b)) drawPhaseNumbers(b, ctx, boss, bx, by, bw, phaseState(b, boss, info).phase);
  if (info.shieldFrac > 0) {
    ctx.save(); ctx.fillStyle = INK; ctx.fillRect(bx, by + 19.5, bw, 5.5); ctx.fillStyle = C.sky; ctx.fillRect(bx + 1, by + 20.5, (bw - 2) * info.shieldFrac, 3.5); ctx.restore();
  }
  const ps = phaseState(b, boss, info);
  if (ps.phases > 1) DH.text(ctx, BT.phaseOf(ps.phase, ps.phases), bx + bw - 6, by + 10, 11, '#fff', 'right', 900, { maxW: 90 });
}

// ================================================================================================ 3. hero abilities
// icy overlay, falling snow, coin shower, stage shield dome (drawn in board space, over the enemies)
export function drawWorldFx(b, ctx, t) {
  const s = st(b), run = b.run;
  if (s.freezeT > 0) {
    const k = clamp(s.freezeT / 0.5, 0, 1) * clamp((s.freezeMax - s.freezeT) / 0.15 + 0.2, 0, 1);
    ctx.save(); ctx.globalAlpha = 0.24 * k; ctx.fillStyle = '#8fd0ff'; ctx.fillRect(BOARD_X, BOARD_Y, BOARD_W, BOARD_H);
    ctx.globalAlpha = 0.5 * k; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.beginPath();
    for (let i = -6; i < 24; i++) { ctx.moveTo(BOARD_X + i * 26, BOARD_Y); ctx.lineTo(BOARD_X + i * 26 + 150, BOARD_Y + 150); }
    ctx.stroke();
    // icicles hanging from the top edge, frost on the bottom edge
    ctx.globalAlpha = 0.95 * k; ctx.lineJoin = 'round'; ctx.lineWidth = 2.6; ctx.strokeStyle = INK; ctx.fillStyle = '#dff3ff';
    for (let i = 0; i < 14; i++) { const x = BOARD_X + 6 + i * 38.5, len = 14 + hh(i * 3.3) * 22; ctx.beginPath(); ctx.moveTo(x, BOARD_Y); ctx.lineTo(x + 30, BOARD_Y); ctx.lineTo(x + 15, BOARD_Y + len); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    ctx.restore();
    // snow drifting down
    ctx.save(); ctx.globalAlpha = 0.9 * k; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.beginPath();
    for (let i = 0; i < 26; i++) {
      const x = BOARD_X + hh(i * 1.9) * BOARD_W + Math.sin(t * 1.5 + i) * 10, y = BOARD_Y + ((hh(i * 4.7) * BOARD_H + t * (50 + hh(i) * 40)) % BOARD_H);
      flake(ctx, x, y, 4 + hh(i * 2.2) * 3);
    }
    ctx.stroke(); ctx.restore();
  }
  if (s.coins.length) {
    ctx.save(); ctx.lineWidth = 2.2; ctx.strokeStyle = INK; ctx.fillStyle = C.gold;
    for (const c of s.coins) { const w = Math.max(2, Math.abs(Math.cos(c.rot)) * c.r); ctx.beginPath(); ctx.ellipse(c.x, c.y, w, c.r, 0, 0, TAU); ctx.fill(); ctx.stroke(); }
    ctx.restore();
  }
  if (run.shieldT > 0 || s.ping > 0) {
    const base = run.map.base, R0 = 112, left = run.shieldT, blink = left > 0 && left < 1.4 ? (Math.sin(t * 22) > 0 ? 1 : 0.35) : 1;
    const ap = clamp(left > 0 ? 1 : s.ping, 0, 1) * blink, f = activeFrac(b, 'shield');
    ctx.save(); ctx.globalAlpha = (0.16 + s.ping * 0.18) * ap; ctx.fillStyle = '#9fdcff'; ctx.beginPath(); ctx.arc(base.x, base.y, R0, 0, TAU); ctx.fill(); ctx.restore();
    wobRing(ctx, base.x, base.y, R0, C.sky, 5, t, { alpha: 0.85 * ap, seed: 9 });
    wobRing(ctx, base.x, base.y, R0 - 12, '#ffffff', 3, t, { alpha: 0.7 * ap, dash: [14, 12], march: t * 30, ink: false, seed: 3 });
    ctx.save(); ctx.globalAlpha = 0.9 * ap; ctx.lineCap = 'round'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(base.x, base.y, R0 - 20, Math.PI * 1.15, Math.PI * 1.4); ctx.stroke(); ctx.restore();
    if (s.ping > 0) wobRing(ctx, base.x, base.y, R0 + (1 - s.ping) * 50, C.sky, 5, t, { alpha: s.ping, seed: 6 });
    if (left > 0) { wobRing(ctx, base.x, base.y - R0 - 16, 11, '#d8d2e4', 4, t, { alpha: 0.8, seed: 2 }); wobRing(ctx, base.x, base.y - R0 - 16, 11, C.sky, 4, t, { a0: -Math.PI / 2, a1: -Math.PI / 2 + TAU * f, seed: 8 }); }
  }
}
function flake(ctx, x, y, r) { for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; ctx.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } }
// a snowflake and an ice cube hint on every frozen enemy
export function drawFrozenMark(b, ctx, e, t) {
  if (!(e.frozen && e.stun > 0)) return;
  const y = e.y - e.r - 8 + Math.sin(t * 3 + e.id) * 2;
  ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = '#9fdcff'; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 1.12, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.beginPath(); flake(ctx, e.x, y, 7); ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.4; ctx.beginPath(); flake(ctx, e.x, y, 7); ctx.stroke(); ctx.restore();
}
// the ability glyph and small name on a hero button, plus a timer ring while the effect lasts
export function drawHeroTag(b, ctx, who, c, t) {
  const ab = b.run.heroAbility ? b.run.heroAbility[who] : (who === 'roxor' ? 'blast' : 'song'), col = ABILITY_COLOR[ab] || C.lime;
  const left = activeFrac(b, ab);
  if (left > 0) wobRing(ctx, c.x, c.y, c.r + 12, col, 5, t, { a0: -Math.PI / 2, a1: -Math.PI / 2 + TAU * left, seed: who === 'roxor' ? 1 : 2 });
  const bx = c.x + (who === 'roxor' ? 27 : -27), by = c.y - 29;
  emblem(ctx, bx, by, 13, ABILITY_GLYPH[ab] || 'star', col);
  return BT.ability(ab, ab);
}

// ================================================================================================ 4. popovers
function sheet(ctx, h, edge, k, bottom) {
  const CW = 484, x = (W - CW) / 2, y = clamp(bottom - h, 126, 830 - h), sc = 0.8 + 0.2 * easeOutBack(k);
  ctx.translate(W / 2, y + h / 2); ctx.scale(sc, sc); ctx.translate(-W / 2, -(y + h / 2));
  DH.glass(ctx, x, y, CW, h, 18, { edge });
  return { x, y, w: CW };
}
export function drawPoolCard(b, ctx) {
  const pc = b.popover; if (!pc || pc.kind !== 'pool') return;
  const def = TURRETS[pc.type]; if (!def) return;
  DH.setHudTime(b.t);
  const k = clamp(pc.t / 0.2, 0, 1), perks = Object.keys(def.perks || {}).map(Number).sort((a, c) => a - c);
  const partners = TURRET_PARTNERS[pc.type] || [], branches = TURRET_BRANCHES[pc.type] || [];
  const o = b.pool.odds.find((q) => q.type === pc.type), pct = o ? Math.round(o.p * 100) : 0;
  const h = 62 + 40 + 22 + perks.length * 18 + 22 + partners.length * 24 + 22 + branches.length * 38 + 26;
  ctx.save(); ctx.globalAlpha = 0.4 * k; ctx.fillStyle = INK; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = k;
  const P = sheet(ctx, h, def.color, k, 828), x = P.x + 18;
  let y = P.y;
  flatIcon(ctx, pc.type, P.x + 44, y + 38, 54);
  DH.text(ctx, def.name, P.x + 82, y + 26, 22, INK, 'left', 900, { maxW: 240 });
  DH.text(ctx, pct > 0 ? BT.dropChance(pct) : BT.notInPool(), P.x + 82, y + 48, 14, '#d6358a', 'left', 900, { maxW: P.w - 100 });
  DH.text(ctx, def.kind === 'aura_rate' || def.kind === 'aura_dmg' ? BT.support() : BT.attacker(), P.x + P.w - 18, y + 26, 13, DIM, 'right', 900, { maxW: 110 });
  y += 66;
  DH.wrapText(ctx, def.blurb, x, y + 6, P.w - 36, 14, 17, INK, 'left', 2); y += 40;
  DH.text(ctx, BT.getsBetter(), x, y + 6, 13, C.purple, 'left', 900, { maxW: P.w - 36 }); y += 22;
  for (const lv of perks) { DH.text(ctx, BT.lv(lv), x + 4, y + 2, 13, '#b8780a', 'left', 900, { maxW: 48 }); DH.text(ctx, fitText(ctx, def.perks[lv], P.w - 90, 13), x + 54, y + 2, 13, INK, 'left'); y += 18; }
  y += 4;
  DH.text(ctx, BT.worksWithSide(), x, y + 6, 13, C.purple, 'left', 900, { maxW: P.w - 36 }); y += 22;
  for (const pp of partners) {
    flatIcon(ctx, pp.partner, x + 14, y + 6, 24);
    const sy = SYNERGY_BY_ID[pp.id];
    DH.text(ctx, fitText(ctx, BT.partnerLine(TURRETS[pp.partner] ? TURRETS[pp.partner].name : pp.partner, pp.name || (sy && sy.name) || '', pp.desc || ''), P.w - 70, 12), x + 34, y + 6, 12, INK, 'left'); y += 24;
  }
  y += 4;
  DH.text(ctx, BT.upgradePaths(BRANCH_LEVEL), x, y + 6, 13, C.purple, 'left', 900, { maxW: P.w - 36 }); y += 22;
  for (const br of branches) {
    emblem(ctx, x + 14, y + 9, 12, br.glyph, def.color);
    DH.text(ctx, br.name, x + 36, y + 2, 13, INK, 'left', 900, { maxW: P.w - 72 });
    DH.text(ctx, fitText(ctx, br.desc, P.w - 72, 11), x + 36, y + 19, 11, DIM, 'left'); y += 38;
  }
  DH.text(ctx, BT.closeHint(), W / 2, P.y + h - 14, 12, DIM, 'center', 900, { maxW: P.w - 40 });
  ctx.restore();
}
export function drawModBadges(b, ctx, t) {
  const mods = b.run.modifiers || []; if (!mods.length) return;
  DH.setHudTime(t);
  mods.forEach((id, i) => {
    const m = RUN_MODIFIER_BY_ID[id]; if (!m) return;
    const x = 520, y = 138 + i * 31, p = b.popover && b.popover.kind === 'mods' ? 1 : 0.92 + 0.08 * Math.sin(t * 3 + i);
    ctx.save(); ctx.translate(x, y); ctx.scale(p, p);
    disc(ctx, 0, 0, 13, C.paper); ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fillStyle = C.orange; ctx.globalAlpha = 0.28; ctx.fill(); ctx.globalAlpha = 1;
    AE.drawGlyph(ctx, m.glyph, 0, 0, 17, '#d4620a'); ctx.restore();
  });
}
export function drawModCard(b, ctx) {
  const pc = b.popover; if (!pc || pc.kind !== 'mods') return;
  const mods = (b.run.modifiers || []).map((id) => RUN_MODIFIER_BY_ID[id]).filter(Boolean); if (!mods.length) return;
  DH.setHudTime(b.t);
  const k = clamp(pc.t / 0.2, 0, 1), h = 78 + mods.length * 56 + 26;
  ctx.save(); ctx.globalAlpha = 0.4 * k; ctx.fillStyle = INK; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = k;
  const P = sheet(ctx, h, C.orange, k, 560), x = P.x + 18;
  let y = P.y;
  DH.text(ctx, BT.runMods(), x, y + 28, 22, INK, 'left', 900, { maxW: 250 });
  const mul = { records: 1, fans: 1, diamonds: 1 }; for (const m of mods) for (const q of Object.keys(mul)) mul[q] *= (m.mul && m.mul[q]) || 1;
  DH.text(ctx, BT.rewardsMul(mul.records.toFixed(2).replace(/0$/, '')), P.x + P.w - 18, y + 28, 15, '#2a8a30', 'right', 900, { maxW: 190 });
  y += 54;
  for (const m of mods) {
    emblem(ctx, x + 20, y + 20, 18, m.glyph, C.orange);
    DH.text(ctx, m.name, x + 50, y + 8, 16, INK, 'left', 900, { maxW: P.w - 100 });
    DH.wrapText(ctx, m.desc, x + 50, y + 28, P.w - 100, 12, 15, DIM, 'left', 2);
    y += 56;
  }
  DH.text(ctx, BT.closeHint(), W / 2, P.y + h - 14, 12, DIM, 'center', 900, { maxW: P.w - 40 });
  ctx.restore();
}
