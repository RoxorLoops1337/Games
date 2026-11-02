// doodle_battle.js: the DOODLE look of the battle view (crayon notebook style). battle.js calls these at the top of drawBoard, drawPanel, drawHud,
// drawDeploy, drawHero, drawBanner and drawTutorial when the style is 'doodle'; each takes the Battle instance `b` first and keeps the same state
// (hpLag, coinPop, press, readyFlash...) and layout (R) as the classic drawing, so input and hit areas are identical in both styles.
// No glow, no additive blend, no gradients: paper bands, taped panels, fat crayon buttons, dashed crayon rings. Static art is baked via the HUD kit.
import { W, H, COLS, ROWS, TURRETS, ENEMIES, BOSSES, COL, ECON, MAX_LEVEL, fmt, BOARD_X, BOARD_Y, BOARD_W, BOARD_H, TURRET_PARTNERS, SYNERGY_BY_ID } from './data_core.js';
import { WAVE_MODS } from './data_run.js';
import { TUTORIAL } from './data_story.js';
import * as AE from './art_entities.js';
import * as AW from './art_world.js';
import * as K from './doodle_kit.js';
import * as DH from './doodle_hud.js';
import * as DD from './doodle_depth.js';
import { R } from './battle.js';
import { BT } from './battle_text.js';
import * as A11Y from './a11y.js';

const C = K.C, INK = C.ink, TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hh = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const easeOutBack = (k) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
const AFFIX_COL = { golden: '#ffc83a', swift: '#2fc4b2', armored: '#9a9aa6', regen: '#43b94a', giant: '#ff9226' };
const DIM = '#6b6477';
// colour-blind cue vocabulary: ALLY rings are solid or long dashes, ENEMY rings are dots or dash-dot, so a ring is never told apart by colour alone
const CBD = { enemy: [2, 8], boss: [18, 6, 3, 6], ally: [20, 6], range: [24, 7] };
const AFFIX_GLYPH = { golden: 'coin', swift: 'bolt', armored: 'shield', regen: 'plus', giant: 'arrow_up' };
const frame = (t) => Math.floor(t * K.BOIL_FPS) % 3;

// a live wobbly crayon ring (cheap: one ink pass, one colour pass). dash optional.
// The wobble only depends on the radius, the boil frame (3 of them) and the seed, so the outline is built once per (radius rounded to half a pixel,
// frame, seed mod 16) as a Path2D and replayed at the ring's centre: a ring costs two strokes instead of ~60 lineTo calls a frame. Node (no Path2D) builds it live.
const RING_CACHE = new Map();
function ringGeom(r, seed, fr) {
  const n = clamp(Math.round(r / 3), 12, 30), sd = seed || 0, pts = [];
  for (let i = 0; i <= n; i++) { const a = i / n * TAU, q = r * (1 + (hh((i % n) * 5.3 + fr * 9.1 + sd) - 0.5) * 0.07); pts.push(Math.cos(a) * q, Math.sin(a) * q); }
  return pts;
}
function ringPath2D(r, seed, fr) {
  const rr = Math.max(1, Math.round(r * 2) / 2), sd = ((seed || 0) % 16 + 16) % 16, key = rr + '|' + sd + '|' + fr;
  let p = RING_CACHE.get(key);
  if (!p) {
    const pts = ringGeom(rr, sd, fr); p = new Path2D(); p.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
    if (RING_CACHE.size > 600) RING_CACHE.clear();
    RING_CACHE.set(key, p);
  }
  return p;
}
const HAS_P2D = typeof Path2D !== 'undefined';
function ring(ctx, x, y, r, col, w, t, o = {}) {
  const fr = frame(t), seed = o.seed || 0;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (o.dash) { ctx.setLineDash(o.dash); ctx.lineDashOffset = -(o.march || 0); }
  const al = o.alpha == null ? 1 : o.alpha;
  if (HAS_P2D) {
    const p = ringPath2D(r, seed, fr);
    ctx.translate(x, y);
    if (o.ink !== false) { ctx.globalAlpha = al * 0.85; ctx.strokeStyle = INK; ctx.lineWidth = w + 3; ctx.stroke(p); }
    ctx.globalAlpha = al; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke(p);
  } else {
    const pts = ringGeom(r, seed, fr), path = () => { ctx.beginPath(); ctx.moveTo(x + pts[0], y + pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(x + pts[i], y + pts[i + 1]); };
    if (o.ink !== false) { path(); ctx.globalAlpha = al * 0.85; ctx.strokeStyle = INK; ctx.lineWidth = w + 3; ctx.stroke(); }
    path(); ctx.globalAlpha = al; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
  }
  ctx.restore();
}
function rrectStroke(ctx, x, y, w, h, r, col, lw, alpha, dash, march) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round';
  if (dash) { ctx.setLineDash(dash); ctx.lineDashOffset = -(march || 0); }
  DH.rrect(ctx, x, y, w, h, r); ctx.stroke(); ctx.restore();
}

// ---------------------------------------------------------------------------------------------------- board
const SORT_T = [], SORT_E = [];
export function drawBoard(b, ctx, t, beat) {
  const run = b.run, fx = b.fx, cb = DD.cbOn(b);
  AW.drawBoard(ctx, run.map.id, run.world.id, t, { beat, slotHint: b.slotHint, hoverSlot: b.hoverSlot ? [b.hoverSlot.c, b.hoverSlot.r] : null, dropSlot: b.targetSlot != null ? [b.targetSlot % COLS, Math.floor(b.targetSlot / COLS)] : null, skin: b.skin });
  AW.drawStageBase(ctx, run.world.id, run.map.base.x, run.map.base.y, { t, hp: run.stageFrac, hit: Math.max(0, b.hurtFlash), beat, studio: (b.prof && b.prof.studio) || null });
  drawGates(b, ctx, t);
  // selected range: a pale tinted disc with a marching dashed crayon edge
  const sel = b.selected ? run.turretById(b.selected) : null;
  if (sel) {
    const rg = run.turretRange(sel), def = TURRETS[sel.type];
    ctx.save(); ctx.globalAlpha = 0.14; ctx.fillStyle = def.color; ctx.beginPath(); ctx.arc(sel.x, sel.y, rg, 0, TAU); ctx.fill(); ctx.restore();
    ring(ctx, sel.x, sel.y, rg, def.color, 4, t, { dash: cb ? CBD.range : [12, 9], march: t * 24, alpha: 0.9, seed: sel.id });
  }
  const dragT = b.drag && b.drag.moved ? run.turretById(b.drag.id) : null;
  const hintT = dragT || sel;
  const syn = hintT ? synHints(b, hintT) : null;
  if (syn) for (const sl of syn.tiles) {   // tiles where a synergy partner would link: a dashed pink square with a little heart
    const x = sl.x - 30, y = sl.y - 30;
    rrectStroke(ctx, x, y, 60, 60, 10, C.pink, 4, 0.55 + 0.35 * Math.sin(t * 6 + sl.idx), [9, 7], t * 20);
    ctx.save(); ctx.globalAlpha = 0.75; ctx.fillStyle = C.pink; ctx.strokeStyle = INK; ctx.lineWidth = 1.8; heartPath(ctx, sl.x, sl.y + 20, 8); ctx.fill(); ctx.stroke(); ctx.restore();
  }
  // turrets: a scribbled ground shadow, a pop ring when new, and the merge invitation
  const ts = SORT_T; ts.length = 0; for (const tu of run.turrets) ts.push(tu); ts.sort((a, c) => a.y - c.y);   // scratch arrays: no new array per frame
  ctx.save(); ctx.fillStyle = INK;   // every ground shadow in one path and one fill (a dragged turret's shadow is fainter)
  for (let pass = 0; pass < 2; pass++) {
    ctx.globalAlpha = pass ? 0.08 : 0.2; ctx.beginPath(); let any = false;
    for (const tu of ts) { if (!!(b.drag && b.drag.moved && b.drag.id === tu.id) !== !!pass) continue; const rx = 25 + tu.level; ctx.moveTo(tu.x + rx, tu.y + 24); ctx.ellipse(tu.x, tu.y + 24, rx, 8, 0, 0, TAU); any = true; }
    if (any) ctx.fill();
  }
  ctx.restore();
  for (const tu of ts) {
    const hidden = b.drag && b.drag.moved && b.drag.id === tu.id;
    const age = run.t - (tu.born || 0), def = TURRETS[tu.type];
    if (age < 0.5) ring(ctx, tu.x, tu.y, 20 + age * 70, def.color, 3.5, t, { alpha: (0.5 - age) * 1.8, seed: tu.id });
    if (tu.fire > 0.5) ring(ctx, tu.x, tu.y, 38, def.color, 3, t, { alpha: (tu.fire - 0.5) * 1.2, ink: false, seed: tu.id });
    const canMerge = hintT && hintT !== tu && run.canMerge(hintT, tu);
    if (syn && syn.partners.has(tu.id) && !canMerge) ring(ctx, tu.x, tu.y, 40, C.pink, 3.5, t, { dash: cb ? CBD.ally : [8, 7], march: -t * 18, alpha: 0.8, seed: tu.id + 9 });
    if (canMerge) {
      const k = 0.5 + 0.5 * Math.sin(t * 8);
      ring(ctx, tu.x, tu.y, 41 + k * 4, C.lime, 5, t, { alpha: 0.7 + 0.3 * k, seed: tu.id + 3 });
      if (cb) { ctx.save(); ctx.beginPath(); ctx.arc(tu.x - 28, tu.y - 28, 8, 0, TAU); ctx.fillStyle = C.paper; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore(); AE.drawGlyph(ctx, 'merge', tu.x - 28, tu.y - 28, 12, INK); }
    }
    AE.drawTurret(ctx, tu.type, tu.level, tu.x, tu.y, {
      t, ang: tu.ang, fire: Math.max(0, tu.fire), jammed: tu.jam > 0, buff: tu.auraRate > 0 ? 'rate' : tu.auraDmg > 0 ? 'dmg' : null,
      selected: tu.id === b.selected, alpha: hidden ? 0.3 : tu.stolen > 0 ? 0.4 : 1, spawn: clamp(age / 0.25, 0, 1),
    });
    if (!hidden) {
      DD.drawTurretMark(b, ctx, tu, t); DD.drawOverclock(b, ctx, tu, t);
      if (tu.branch) DD.drawBranchMark(b, ctx, tu);
      else if (tu.id === b.selected && b.panelCards) ring(ctx, tu.x, tu.y, 42, C.gold, 4, t, { dash: [10, 7], march: t * 24, alpha: 0.9, seed: tu.id + 5 });
      if (!tu.branch && run.canBranch(tu)) DD.drawBranchBadge(b, ctx, tu, t);
    }
  }
  DD.drawDarkLane(b, ctx, t);
  drawLinks(b, ctx, t);
  // enemies: bosses get a marching dashed threat ring, elites a coloured ring
  const en = SORT_E; en.length = 0; for (const e of run.enemies) en.push(e); en.sort((a, c) => (a.flying - c.flying) || (a.y - c.y));
  for (const e of en) {
    if (e.boss) {
      const bc = BOSSES[e.type].color;
      ring(ctx, e.x, e.y + e.r * 0.5, e.r * 1.5, e.gated ? C.gold : bc, 4, t, { dash: cb ? CBD.boss : [14, 10], march: t * 30, alpha: 0.55 + 0.25 * Math.sin(t * 5), seed: 1 });
      AE.drawBoss(ctx, e.type, e.x, e.y, { t, ang: e.ang, hp: e.hp / e.maxHp, hit: e.hitT > 0 ? e.hitT / 0.12 : 0, gated: e.gated, phase: e.phase, scale: e.r / BOSSES[e.type].r });
      DD.drawBossMarks(b, ctx, e, t); DD.drawFrozenMark(b, ctx, e, t);
    } else {
      if (e.affix) {
        ring(ctx, e.x, e.y, e.r * 1.45, AFFIX_COL[e.affix] || C.gold, cb ? 3.6 : 3, t, { dash: cb ? CBD.enemy : [8, 6], march: t * 22, alpha: 0.7 + 0.2 * Math.sin(t * 6 + e.id), seed: e.id });
        if (cb) {   // each elite kind has its own symbol on a sticker
          const gx = e.x + e.r * 0.95, gy = e.y - e.r * 0.95;
          ctx.save(); ctx.beginPath(); ctx.arc(gx, gy, 8.5, 0, TAU); ctx.fillStyle = C.paper; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
          AE.drawGlyph(ctx, AFFIX_GLYPH[e.affix] || 'star', gx, gy, 12, AFFIX_COL[e.affix] || C.gold);
        }
      }
      const sc = e.r / ENEMIES[e.type].r;
      AE.drawEnemy(ctx, e.type, e.x, e.y, {
        t, ang: e.ang, hp: e.hp / e.maxHp, hit: e.hitT > 0 ? e.hitT / 0.12 : 0, slow: e.slowT > 0 && e.slowAmt > 0, stun: e.stun > 0, burn: e.burnT > 0, mark: e.markT > 0,
        shield: e.shieldMax ? e.shield / e.shieldMax : 0, affix: e.affix, scale: sc, rage: e.rage, id: e.id,
      });
      DD.drawFrozenMark(b, ctx, e, t);
    }
  }
  DD.drawWorldFx(b, ctx, t);
  // projectiles: the doodle projectile and a ribbon trail, no glow
  for (const p of run.projectiles) {
    if (p.delay > 0) continue;
    const col = PROJ_COL[p.style] || C.paper;
    if (p.style !== 'hat') fx.trail(p.id, p.x, p.y, col, p.big ? 7 : 4.5);
    AE.drawProjectile(ctx, p.style, p.x, p.y, { t, ang: p.ang || 0, scale: p.small ? 0.7 : p.big ? 1.5 : 1 });
  }
  // dragged turret ghost
  if (b.drag && b.drag.moved) {
    const tu = run.turretById(b.drag.id);
    if (tu) {
      ring(ctx, b.drag.x, b.drag.y - 20, 46, TURRETS[tu.type].color, 4, t, { dash: [10, 8], march: t * 30, alpha: 0.9, seed: 7 });
      AE.drawTurret(ctx, tu.type, tu.level, b.drag.x, b.drag.y - 20, { t, ang: tu.ang, scale: 1.15, selected: true, alpha: 0.95 });
    }
  }
  b.panel = null;
  if (sel) b.drawPanel(ctx, sel);
}
// crayon-ish projectile ribbon colours: darker than the classic neon so they read on paper
const PROJ_COL = { kick: '#ff9226', snare: '#ffb81c', hat: '#2fc4b2', scratch: '#7b4fd0', cowbell: '#e8a21c', vocal: '#ff5fb0', orb: '#ff5fb0' };

const HEART_U = K.heart(0, 0, 16);   // the unit heart, scaled per call (no array per heart per frame)
function heartPath(ctx, cx, cy, sz) { const k = sz / 16; ctx.beginPath(); ctx.moveTo(cx + HEART_U[0] * k, cy + HEART_U[1] * k); for (let i = 2; i < HEART_U.length; i += 2) ctx.lineTo(cx + HEART_U[i] * k, cy + HEART_U[i + 1] * k); ctx.closePath(); }
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// empty tiles (and the partner turrets next to them) where a synergy partner of turret `src` would link. Cached per frame-ish by turret count and selection.
function synHints(b, src) {
  const run = b.run, partners = new Set((TURRET_PARTNERS[src.type] || []).map((p) => p.partner)), tiles = [], who = new Set();
  if (!partners.size) return null;
  for (const sl of run.map.buildable) {
    const occ = run.grid.get(sl.idx);
    if (occ && occ !== src) continue;
    if (occ === src && !(b.drag && b.drag.moved)) continue;   // a placed, selected turret: show where it could MOVE to link
    let hit = false;
    for (const [dc, dr] of NB) {
      const c = sl.c + dc, r = sl.r + dr; if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
      const tu = run.grid.get(r * COLS + c);
      if (tu && tu !== src && partners.has(tu.type)) { hit = true; who.add(tu.id); }
    }
    if (hit && occ !== src) tiles.push(sl);
  }
  return { tiles: tiles.slice(0, 24), partners: who };
}
// a short linked-chain and a little heart between two adjacent turrets that have an active synergy
function drawLinks(b, ctx, t) {
  const cb = DD.cbOn(b);
  for (const L of b.links || []) {
    const A = L.a, B = L.b, mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, ang = Math.atan2(B.y - A.y, B.x - A.x), bob = Math.sin(t * 5 + A.id) * 2;
    if (cb) {   // colour-blind cue: a dotted tether runs turret to turret, so a link reads as a chain by its shape, not by pink
      ctx.save(); ctx.lineCap = 'round'; ctx.setLineDash([2, 9]); ctx.lineDashOffset = -t * 10;
      ctx.beginPath(); ctx.moveTo(A.x, A.y + 6); ctx.lineTo(B.x, B.y + 6); ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(A.x, A.y + 6); ctx.lineTo(B.x, B.y + 6); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke(); ctx.restore();
    }
    ctx.save(); ctx.translate(mx, my); ctx.rotate(ang); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const dx of [-9, 9]) {   // two interlocked chain links
      ctx.beginPath(); ctx.ellipse(dx, 0, 10, 6, 0, 0, TAU); ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.stroke();
      ctx.strokeStyle = cb ? '#fff' : C.pink; ctx.lineWidth = 3; ctx.stroke();
    }
    ctx.restore();
    ctx.save(); ctx.fillStyle = C.pink; ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; heartPath(ctx, mx, my - 12 + bob, 9 + b.synPop * 4); ctx.fill(); ctx.stroke(); ctx.restore();
  }
}
// spawn gate markers: an arrow and a tag with the incoming enemy types and counts per lane (small arrow and total while a wave is running)
function drawGates(b, ctx, t) {
  const pv = b.pv && b.pv.next; if (!pv) return;
  const run = b.run, mid = run.phase === 'wave', cb = DD.cbOn(b);
  for (const L of pv.lanes) {
    const lane = run.map.lanes[L.lane]; if (!lane) continue;
    const p0 = lane.pts[0], p1 = lane.pts[1];
    let gx = p0.x, gy = p0.y;
    if (p0.c < 0) gx = BOARD_X; else if (p0.c >= COLS) gx = BOARD_X + BOARD_W;
    if (p0.r < 0) gy = BOARD_Y; else if (p0.r >= ROWS) gy = BOARD_Y + BOARD_H;
    const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x), dx = Math.cos(ang), dy = Math.sin(ang), bob = Math.sin(t * 5 + L.lane) * 3;
    const ax = gx + dx * (14 + bob), ay = gy + dy * (14 + bob);
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang); ctx.fillStyle = L.boss ? C.red : C.orange; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -11); ctx.lineTo(-2, 0); ctx.lineTo(-6, 11); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (cb && L.boss) { ctx.translate(-9, 0); ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -11); ctx.lineTo(-2, 0); ctx.lineTo(-6, 11); ctx.closePath(); ctx.fill(); ctx.stroke(); }   // boss gates: a double arrow
    ctx.restore();
    const rows = L.enemies.slice().sort((a, c) => c.count - a.count), tot = rows.reduce((a, r) => a + r.count, 0);
    const shown = mid ? [] : rows.slice(0, 3), extra = rows.length - shown.length;
    const tw = mid ? 44 : 10 + shown.length * 38 + (extra > 0 && !mid ? 18 : 0) + (L.boss ? 28 : 0), th = mid ? 22 : 32;
    let cx = gx + dx * 54 + (Math.abs(dx) > 0 ? tw * 0.35 * dx : 0), cy = gy + dy * 54 + (Math.abs(dy) > 0 ? th * 0.3 * dy : 0);
    cx = clamp(cx, BOARD_X + tw / 2 + 4, BOARD_X + BOARD_W - tw / 2 - 4); cy = clamp(cy, BOARD_Y + th / 2 + 4, BOARD_Y + BOARD_H - th / 2 - 4);
    ctx.save(); ctx.globalAlpha = mid ? 0.8 : 0.95;
    DH.glass(ctx, cx - tw / 2, cy - th / 2, tw, th, 9, { edge: L.boss ? C.red : C.orange });
    if (mid) DH.text(ctx, 'x' + tot, cx, cy + 1, 13, INK, 'center');
    else {
      let x = cx - tw / 2 + 8;
      for (const r of shown) {
        const d = ENEMIES[r.type]; AE.drawEnemy(ctx, r.type, x + 9, cy, { t, scale: clamp(9 / d.r, 0.4, 0.8), hp: 1 });
        DH.text(ctx, 'x' + r.count, x + 28, cy + 1, 12, INK, 'center'); x += 38;
      }
      if (extra > 0) { DH.text(ctx, '+' + extra, x + 4, cy + 1, 11, DIM, 'center'); x += 18; }
      if (L.boss) AE.drawGlyph(ctx, 'crown', x + 12, cy, 22, C.red);
    }
    if (cb) {   // colour-blind cue: the lane number on a sticker at the corner of the tag (the preview card calls the same lane GATE n)
      const nx = cx - tw / 2 + 1, ny = cy - th / 2 + 1;
      ctx.beginPath(); ctx.arc(nx, ny, 10, 0, TAU); ctx.fillStyle = L.boss ? C.red : C.yellow; ctx.fill(); ctx.lineWidth = 2.6; ctx.strokeStyle = INK; ctx.stroke();
      DH.text(ctx, String(L.lane + 1), nx, ny + 0.5, 14, L.boss ? '#fff' : INK, 'center', 900, { maxW: 14 });
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------------------------------- selected-turret panel
// Which half of the board the panel sits on: the half away from the selected turret, with hysteresis so it does not flip while a turret is nudged
// around the middle. If the chosen half would still touch the turret (the upgrade-path sheet makes the panel taller) it flips.
const PANEL_X = 16, PANEL_W = 508, SHEET_H = 154;
export function panelSide(b, tu, h, sheet) {
  const mid = BOARD_Y + BOARD_H / 2, HYS = 40, st = b.panelSide && b.panelSide.id === tu.id ? b.panelSide : null;
  let top = st ? st.top : tu.y > mid;
  if (st) { if (top && tu.y < mid - HYS) top = false; else if (!top && tu.y > mid + HYS) top = true; }
  const ext = sheet ? SHEET_H : 0, TH = 40;   // the turret sprite is about 72 tall, a little slack for the pad glow
  const hits = (isTop) => (isTop ? tu.y - TH < BOARD_Y + 6 + h + ext : tu.y + TH > BOARD_Y + BOARD_H - h - 6 - ext);
  if (hits(top) && !hits(!top)) top = !top;
  b.panelSide = { id: tu.id, top };
  return top;
}
export function drawPanel(b, ctx, tu) {
  DH.setHudTime(b.t);
  const run = b.run, def = TURRETS[tu.type];
  // ---- text first, so the panel can size itself (a long German perk or synergy takes a second line; the Larger text setting grows everything)
  const k = A11Y.textScale(), LH13 = 15, X0 = 16, TW = PANEL_W - 2 * X0;
  const perkKey = Object.keys(def.perks).map(Number).filter((q) => q > tu.level).sort((a, c) => a - c)[0];
  const perkL = DH.wrapLines(ctx, perkKey ? BT.perk(perkKey, def.perks[perkKey]) : BT.maxed(), TW, 13, LH13, 2);
  const act = run.synergiesOf(tu);
  const synStr = act.length ? (act.length > 1 ? BT.synMore(BT.synLine(act[0].name, act[0].desc), act.length - 1) : BT.synLine(act[0].name, act[0].desc)) : BT.noLink();
  const synL = DH.wrapLines(ctx, synStr, PANEL_W - 42 - 14, 13, LH13, 2);
  const yPerk = 78 + 6 * (k - 1), yDiv = yPerk + (perkL.lines.length - 1) * perkL.lh + 12 + 4 * (k - 1);
  const ySyn = yDiv + 16 + 2 * (k - 1), yWork = ySyn + (synL.lines.length - 1) * synL.lh + 25 + 4 * (k - 1);
  const BH = Math.round(yWork + 20 + 3 * (k - 1));
  const canB = run.canBranch(tu) && !(b.drag && b.drag.moved);
  const top = panelSide(b, tu, BH, canB);
  const box = { x: PANEL_X, y: top ? BOARD_Y + 6 : BOARD_Y + BOARD_H - BH - 6, w: PANEL_W, h: BH };
  ctx.save();
  DH.glass(ctx, box.x, box.y, box.w, box.h, 16, { edge: def.color });
  DD.flatIcon(ctx, tu.type, box.x + 38, box.y + 36, 54);
  DH.text(ctx, def.name, box.x + 76, box.y + 18, 19, INK, 'left', 900, { maxW: 200 });
  for (let i = 0; i < MAX_LEVEL; i++) {   // level pips: inked dots
    ctx.beginPath(); ctx.arc(box.x + 78 + i * 13, box.y + 36, 4.4, 0, TAU);
    ctx.fillStyle = i < tu.level ? (tu.level >= 7 ? C.gold : def.color) : 'rgba(43,39,51,0.14)'; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = INK; ctx.stroke();
  }
  let line;
  if (def.kind === 'aura_rate') line = BT.auraRate(Math.round(def.aura * (1 + 0.2 * (tu.level - 1)) * 100 * (tu.level >= 7 ? 1.5 : 1)));
  else if (def.kind === 'aura_dmg') line = BT.auraDmg(Math.round(def.aura * (1 + 0.2 * (tu.level - 1)) * 100 * (tu.level >= 7 ? 1.5 : 1)));
  else line = BT.stats(fmt(run.turretDmg(tu)), run.turretRate(tu).toFixed(1));
  DH.text(ctx, line, box.x + 76, box.y + 56 + 2 * (k - 1), 14, DIM, 'left', 900, { maxW: 214 });
  // the next perk (or "fully upgraded") on its own full-width row, up to two lines
  perkL.lines.forEach((l, i) => DH.text(ctx, l, box.x + X0, box.y + yPerk + i * perkL.lh, perkL.size, '#b8780a', 'left', 900, { maxW: TW, raw: true }));
  const mode = { x: box.x + box.w - 202, y: box.y + 4, w: 106, h: 62 };
  const sell = { x: box.x + box.w - 94, y: box.y + 4, w: 86, h: 62 };
  const isAttacker = def.kind !== 'aura_rate' && def.kind !== 'aura_dmg';
  if (isAttacker) DH.button(ctx, mode, '#b9a6f0', { label: BT.mode(tu.mode), sub: BT.target(), size: 15 });
  DH.button(ctx, sell, C.red, { label: '+' + Math.floor(tu.paid * Math.min(0.95, ECON.sellBack + run.mods.sell)), sub: BT.sell(), size: 17 });
  // synergies: the active ones with their text, then "works well with" icons (a heart on the partners that are linked right now)
  ctx.save(); ctx.strokeStyle = 'rgba(43,39,51,0.25)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(box.x + 14, box.y + yDiv); ctx.lineTo(box.x + box.w - 14, box.y + yDiv); ctx.stroke(); ctx.restore();
  ctx.save(); ctx.fillStyle = C.pink; ctx.strokeStyle = INK; ctx.lineWidth = 1.8; heartPath(ctx, box.x + 26, box.y + ySyn - 1, 8); ctx.fill(); ctx.stroke(); ctx.restore();
  synL.lines.forEach((l, i) => DH.text(ctx, l, box.x + 42, box.y + ySyn + i * synL.lh, synL.size, act.length ? '#d6358a' : DIM, 'left', 900, { maxW: PANEL_W - 42 - 14, raw: true }));
  const labW = 136 + 14 * (k - 1);
  DH.text(ctx, BT.worksWith(), box.x + 14, box.y + yWork, 13, INK, 'left', 900, { maxW: labW });
  const ps = TURRET_PARTNERS[tu.type] || [], linked = new Set(act.map((a) => a.withType));
  ps.forEach((pp, i) => {
    const px = box.x + 14 + labW + 14 + i * 44, py = box.y + yWork - 1;
    DD.flatIcon(ctx, pp.partner, px, py, 26);
    if (linked.has(pp.partner)) { ctx.save(); ctx.fillStyle = C.pink; ctx.strokeStyle = INK; ctx.lineWidth = 1.6; heartPath(ctx, px + 12, py - 10, 6); ctx.fill(); ctx.stroke(); ctx.restore(); }
  });
  const br = DD.branchOf(tu);
  if (br) {   // the chosen upgrade path: emblem and name next to the level pips
    DD.emblem(ctx, box.x + 190, box.y + 36, 11, br.glyph, def.color);
    DH.text(ctx, br.name, box.x + 206, box.y + 36, 13, '#d6358a', 'left', 900, { maxW: 92 });
  }
  b.panel = { box, mode: isAttacker ? mode : { x: -99, y: -99, w: 0, h: 0 }, sell };
  b.panelCards = false;
  if (canB) {   // a prominent "Choose upgrade" sheet with two big cards
    const lay = DD.drawBranchPanel(b, ctx, tu, box);
    b.panel.cards = lay.cards; b.panel.sheet = lay.box; b.panelCards = true;
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------------- HUD
// the top and bottom bars sit on translucent paper bands with a crayon rule in the stage colour (baked once per accent)
function band(ctx, key, y, h, accent, ruleAtBottom, t) {
  const e = K.sprite('db:band:' + key + ':' + accent, W, h, (pen, c) => {
    c.globalAlpha = 0.82; c.fillStyle = C.paper; c.fillRect(-W / 2, -h / 2, W, h); c.globalAlpha = 1;
    const ry = ruleAtBottom ? h / 2 - 3 : -h / 2 + 3, pts = []; for (let x = -W / 2 - 10; x <= W / 2 + 10; x += 30) pts.push(x, ry + pen.rr(-1.2, 1.2));
    pen.ln(pts, INK, 3, false, 0.8); pen.ln(pts.map((v, i) => (i % 2 ? v + 3.5 : v)), accent || C.blue, 2.4, false, 0.8);
  }, { seed: 3 });
  K.blit(ctx, e, W / 2, y + h / 2, t);
}
export function drawHud(b, ctx, t, beat) {
  DH.setHudTime(t);
  const run = b.run, cbx = DD.cbOn(b);
  const accent = b.world.accent;
  band(ctx, 'top', 0, 118, accent, true, t);
  band(ctx, 'bot', 838, H - 838, accent, false, t);
  // pause
  DH.button(ctx, R.pause, C.purple, { icon: 'pause', glyph: AE.drawGlyph, press: b.pressK('pause') });
  // stage health: heart socket + scribble bar with a ghost showing the damage taken
  const hp = R.hp, f = run.stageFrac;
  if (b.hpLag == null || b.hpLag < f) b.hpLag = f; else b.hpLag += (f - b.hpLag) * 0.06;
  DH.glass(ctx, hp.x, hp.y, hp.w, hp.h, 14, { edge: f < 0.3 ? C.red : C.blue, glow: f < 0.3 ? C.red : null, glowA: 0.5 + 0.3 * Math.sin(t * 9) });
  const bw = hp.w - 62;
  const hcol = f > 0.5 ? [C.green, '#8fe07a'] : f > 0.25 ? ['#e8a21c', C.yellow] : [C.red, '#ff8a7a'];
  DH.liquidBar(ctx, hp.x + 52, hp.y + 11, bw, 22, f, hcol[0], hcol[1], t, { lag: b.hpLag });
  ctx.save();
  const hs = 1 + (f < 0.3 ? 0.14 * Math.max(0, Math.sin(t * 9)) : 0) + b.hurtFlash * 0.25;
  ctx.translate(hp.x + 26, hp.y + 22); ctx.scale(hs, hs);
  AE.drawGlyph(ctx, 'heart', 0, 0, 30, COL.red);
  ctx.restore();
  DH.text(ctx, run.stageHp + '/' + run.stageMax, hp.x + 52 + bw / 2, hp.y + 23, 15, '#fff', 'center');
  if (cbx && f < 0.5) {   // colour-blind cue: low health is also a hatched bar, a dashed edge and a warning triangle that pulses when it is critical
    const crit = f < 0.3, fw = bw * f;
    ctx.save(); ctx.beginPath(); ctx.rect(hp.x + 52, hp.y + 11, Math.max(0, fw), 22); ctx.clip(); ctx.strokeStyle = 'rgba(43,39,51,0.55)'; ctx.lineWidth = 2.4; ctx.beginPath();
    for (let x = hp.x + 40; x < hp.x + 52 + fw + 24; x += 9) { ctx.moveTo(x, hp.y + 33); ctx.lineTo(x + 22, hp.y + 11); }
    ctx.stroke(); ctx.restore();
    if (crit) rrectStroke(ctx, hp.x, hp.y, hp.w, hp.h, 14, INK, 3, 0.9, [7, 6], t * 16);
    const k = crit ? 1 + 0.25 * Math.max(0, Math.sin(t * 9)) : 1, tx = hp.x + hp.w - 13, ty = hp.y + 5;
    ctx.save(); ctx.translate(tx, ty); ctx.scale(k, k); ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(11, 8); ctx.lineTo(-11, 8); ctx.closePath();
    ctx.fillStyle = crit ? C.red : C.yellow; ctx.fill(); ctx.lineWidth = 2.6; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
    DH.text(ctx, crit ? '!!' : '!', tx, ty + 2.5 * k, 12 * k, crit ? '#fff' : INK, 'center', 900, { maxW: 16 });
  }
  // wave
  const w = R.wave;
  DH.glass(ctx, w.x, w.y, w.w, w.h, 14, { edge: C.blue });
  DH.text(ctx, BT.wave(Math.max(1, run.wave), run.endless ? 0 : run.wavesTotal), w.x + w.w / 2, w.y + 16, 19, INK, 'center', 900, { maxW: w.w - 14 });
  if (run.wmId) { const m = WAVE_MODS[run.wmId]; DH.text(ctx, (cbx ? (m.good ? '+ ' : '- ') : '') + m.name, w.x + w.w / 2, w.y + 37, 14, m.good ? C.green : C.orange, 'center', 900, { maxW: w.w - 14 }); }
  else if (run.phase === 'prep' && (run.endless || run.wave < run.wavesTotal)) {
    const spec = run.upcoming();
    const types = [...new Set(spec.groups.map((gr) => gr.type))].slice(0, 3);
    const n = types.length + (spec.boss ? 1 : 0) + (spec.mod ? 1 : 0);
    let x = w.x + w.w / 2 - (n - 1) * 13;
    DH.text(ctx, BT.next(), w.x + 12, w.y + 37, 10, DIM, 'left', 900, { maxW: 36 });
    for (const ty of types) { AE.drawEnemy(ctx, ty, x + 8, w.y + 36, { t, scale: 0.62, hp: 1 }); x += 26; }
    if (spec.boss) { AE.drawGlyph(ctx, 'crown', x + 8, w.y + 36, 22, C.red); x += 26; }
    if (spec.mod) { AE.drawGlyph(ctx, WAVE_MODS[spec.mod].glyph, x + 8, w.y + 36, 20, WAVE_MODS[spec.mod].good ? C.green : C.orange); if (cbx) DH.text(ctx, WAVE_MODS[spec.mod].good ? '+' : '-', x + 23, w.y + 36, 16, INK, 'center', 900, { maxW: 12 }); }
  } else DH.text(ctx, run.world.name, w.x + w.w / 2, w.y + 37, 13, DIM, 'center', 900, { maxW: w.w - 14 });
  { const q = b.pv.open ? 1 : 0.8 + 0.2 * Math.sin(t * 4), qx = w.x + w.w - 10, qy = w.y + 9;   // "tap for the wave preview" badge
    ctx.save(); ctx.beginPath(); ctx.arc(qx, qy, 9 * q, 0, TAU); ctx.fillStyle = b.pv.open ? C.yellow : C.sky; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
    DH.text(ctx, '?', qx, qy + 1, 12, INK, 'center'); }
  DD.drawMilestoneChip(b, ctx, t);
  // coins: the number pops when it changes
  const c = R.coins;
  if (b._coinLast == null) b._coinLast = run.coins;
  if (run.coins !== b._coinLast) { b.coinPop = run.coins > b._coinLast ? 1 : 0.5; b._coinLast = run.coins; }
  b.coinPop = Math.max(0, (b.coinPop || 0) - 0.06);
  DH.glass(ctx, c.x, c.y, c.w, c.h, 14, { edge: C.gold });
  ctx.save(); ctx.translate(c.x + 24, c.y + 22); const cs = 1 + b.coinPop * 0.25; ctx.scale(cs, cs);
  AE.drawGlyph(ctx, 'coin', 0, 0, 30); ctx.restore();
  ctx.save(); ctx.translate(c.x + 46, c.y + 23); const ts2 = 1 + b.coinPop * 0.18; ctx.scale(ts2, ts2); DH.text(ctx, fmt(run.coins), 0, 0, 24, '#e8a21c', 'left', 900); ctx.restore();
  // hype
  const h = R.hype, hf = clamp(run.hype / run.hypeNeed, 0, 1);
  DH.glass(ctx, h.x, h.y, h.w, h.h, 14, { edge: hf > 0.85 ? C.gold : C.blue, glow: hf > 0.85 ? C.gold : null, glowA: 0.5 + 0.3 * Math.sin(t * 8) });
  DH.liquidBar(ctx, h.x + 58, h.y + 10, h.w - 66, 20, hf, C.pink, C.gold, t, {});
  DH.bezel(ctx, h.x + 27, h.y + 20, 17, C.gold);
  DH.text(ctx, run.level + '', h.x + 27, h.y + 21, 16, INK, 'center');
  DH.text(ctx, BT.hype(), h.x + 58 + (h.w - 66) / 2, h.y + 20, 12, '#fff', 'center', 900, { maxW: h.w - 74 });
  if (cbx && hf > 0.85) {   // colour-blind cue: nearly full hype is a pulsing star, not only a gold edge
    const k = 1 + 0.18 * Math.sin(t * 8);
    ctx.save(); ctx.translate(h.x + h.w - 20, h.y + 20); ctx.scale(k, k); ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU); ctx.fillStyle = C.paper; ctx.fill(); ctx.lineWidth = 2.6; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
    AE.drawGlyph(ctx, 'star', h.x + h.w - 20, h.y + 20, 18 * k, C.gold);
  }
  // combo meter: a spiky badge that grows with the combo, changes colour at 10, 25, 50, 100 and pulses on each milestone
  if (b.comboShow > 0.01) {
    const cb = run.combo, tier = b.comboTier, col = [C.sky, C.gold, C.orange, C.red, C.mag][tier];
    const r = (17 + Math.min(15, cb * 0.18) + b.comboPulse * 9) * (0.6 + 0.4 * b.comboShow), cx = 42, cy = 142 + (tier > 0 ? 4 : 0);
    const bump = 1 + Math.max(0, 1 - (t - (b.comboT || 0)) * 7) * 0.18;
    ctx.save(); ctx.globalAlpha = b.comboShow; ctx.translate(cx, cy); ctx.scale(bump, bump); ctx.rotate(Math.sin(t * 3) * 0.05 * (1 + tier));
    const st = K.star(0, 0, r * 1.25, 0.72, t * (0.3 + tier * 0.15), cbx ? 8 + tier * 2 : 10);   // colour-blind cue: more spikes at every tier
    ctx.beginPath(); ctx.moveTo(st[0], st[1]); for (let i = 2; i < st.length; i += 2) ctx.lineTo(st[i], st[i + 1]); ctx.closePath();
    ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 3.6; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
    if (tier > 0) ring(ctx, cx, cy, r * 1.25 + 7 + b.comboPulse * 6, col, 3.5, t, { dash: [8, 7], march: t * 28, alpha: b.comboShow * 0.9, seed: tier });
    ctx.save(); ctx.globalAlpha = b.comboShow;
    DH.text(ctx, String(cb), cx, cy - 2, Math.round(16 + Math.min(8, cb * 0.08)), tier >= 3 ? '#fff' : INK, 'center');
    DH.text(ctx, BT.combo(), cx, cy + r * 1.25 + 9, 11, INK, 'center', 900, { maxW: 60 });
    if (cbx && tier > 0) {   // tier pips: one diamond per milestone reached (10, 25, 50, 100)
      for (let i = 0; i < tier; i++) { const px = cx - (tier - 1) * 6 + i * 12, py = cy - r * 1.25 - 7; ctx.beginPath(); ctx.moveTo(px, py - 5); ctx.lineTo(px + 5, py); ctx.lineTo(px, py + 5); ctx.lineTo(px - 5, py); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke(); }
    }
    const f = clamp(run.comboT / (ECON.comboWindow || 1), 0, 1);   // time left before the combo drops
    ctx.fillStyle = INK; ctx.fillRect(cx - 22, cy + r * 1.25 + 18, 44, 5); ctx.fillStyle = col; ctx.fillRect(cx - 21, cy + r * 1.25 + 19, 42 * f, 3);
    ctx.restore();
  }
  if (run.combo !== b._comboLast) { b._comboLast = run.combo; b.comboT = t; }
  // speed
  DH.button(ctx, R.speed, C.sky, { label: b.speed + 'x', sub: BT.speed(), size: 20, press: b.pressK('speed') });
  // call wave
  const call = R.call;
  const prep = run.phase === 'prep', canCall = prep || (run.phase === 'wave' && !run.spawnQ.length);
  const left = prep ? Math.max(0, Math.ceil(run.prepT)) : 0;
  const lastWave = !run.endless && run.wave >= run.wavesTotal;
  const cp = b.pressK('call');
  if (lastWave && run.phase !== 'prep') DH.button(ctx, call, C.purple, { label: BT.finalWave(), size: 17, press: cp, glow: 0.4 + 0.3 * Math.sin(t * 6), glowColor: C.pink });
  else if (prep) DH.button(ctx, call, C.green, { label: run.wave === 0 ? BT.startWave1() : BT.nextWave(), sub: run.prepT > 100 ? BT.tapToBegin() : BT.prepSub(left, Math.round(Math.min(ECON.prepSeconds, run.prepT) * ECON.earlyBonusPerSec)), size: 17, press: cp, glow: 0.25 + 0.25 * Math.sin(t * 6), glowColor: C.lime });
  else if (canCall) DH.button(ctx, call, C.blue, { label: BT.callNext(), sub: BT.bonusCoins(), size: 17, press: cp });
  else DH.button(ctx, call, '#b9b3c8', { label: BT.left(run.enemies.length), sub: BT.fighting(), size: 17, dim: true, press: cp });
  // boss bar: a taped nameplate over a scribble bar with a ghost
  const boss = run.enemies.find((e) => e.boss);
  if (boss) {
    const bx = 52, by = 112, bw2 = 436, bf = clamp(boss.hp / boss.maxHp, 0, 1);
    if (b.bossLag == null || b.bossLag < bf) b.bossLag = bf; else b.bossLag += (bf - b.bossLag) * 0.05;
    DH.glass(ctx, bx - 8, by - 6, bw2 + 16, 30, 12, { edge: C.red, glow: C.red, glowA: 0.35 });
    DH.liquidBar(ctx, bx, by, bw2, 18, bf, boss.gated ? '#e0a21c' : C.red, boss.gated ? C.yellow : '#ff8a7a', t, { lag: b.bossLag, ticks: DD.phaseTicks(b, boss) || (boss.type === 'playback' ? [0.33, 0.66] : null) });
    DH.text(ctx, BOSSES[boss.type].name.toUpperCase(), W / 2, by + 10, 13, '#fff', 'center', 900, { maxW: 300 });
    DD.drawBossHud(b, ctx, boss, bx, by, bw2, t);
  } else b.bossLag = null;
  // bottom bar
  b.drawHero(ctx, 'roxor', R.heroR, t);
  b.drawHero(ctx, 'jasmin', R.heroJ, t);
  const locked = !b.prof.autoMerge;
  DH.button(ctx, R.merge, locked ? '#b9b3c8' : C.green, { icon: locked ? 'lock' : 'merge', glyph: AE.drawGlyph, sub: BT.merge(), size: 13, press: b.pressK('merge'), dim: locked });
  rerollBtn(b, ctx, R.reroll, false, t); rerollBtn(b, ctx, R.rerollG, true, t);
  b.drawDeploy(ctx, t, beat);
  drawPool(b, ctx, t);
  DD.drawModBadges(b, ctx, t);
  const slotsLeft = run.slotCapacity() - run.turrets.length;
  DH.text(ctx, run.turrets.length + '/' + run.slotCapacity(), 54, 849, 14, slotsLeft < 3 ? '#d4620a' : INK, 'center');
  DH.text(ctx, BT.tiles(), 54, 862, 10, DIM, 'center', 900, { maxW: 60 });
}
// the re-roll buttons: coins (or a free setlist reroll first) and gems. Greyed with the price in red when it cannot be paid.
function rerollBtn(b, ctx, r, gem, t) {
  const p = b.pool, can = gem ? p.can.gems : p.can.coins, free = !gem && p.free > 0;
  const price = gem ? p.cost.gems : p.cost.coins;
  DH.button(ctx, r, can ? (gem ? C.purple : C.sky) : '#b9b3c8', {
    press: b.pressK(gem ? 'rerollG' : 'reroll'), dim: !can && !p.why ? false : !can,
    draw: (c, x, y, bh) => {
      const cx = x + r.w / 2;
      c.save(); c.translate(cx, y + 15); c.rotate(b.rerollSpin * TAU); AE.drawGlyph(c, 'reroll', 0, 0, 25, '#fff'); c.restore();
      const col = can ? '#fff' : '#e8403f';
      if (free) DH.text(c, BT.free(), cx, y + bh - 22, 14, C.lime, 'center', 900, { maxW: r.w - 10 });
      else if (p.why === 'single' || p.why === 'locked') DH.text(c, BT.no(), cx, y + bh - 22, 13, DIM, 'center', 900, { maxW: r.w - 10 });
      else { AE.drawGlyph(c, gem ? 'diamond' : 'coin', cx - 13, y + bh - 22, 17); DH.text(c, fmt(price), cx + 6, y + bh - 21, 15, col, 'center'); }
      DH.text(c, gem ? BT.gems() : free ? 'x' + p.free : BT.roll(), cx, y + bh - 7, 11, '#fff', 'center', 900, { maxW: r.w - 8 });
    },
  });
}
// the drop pool: a strip of all turret icons in the pool, the queued one lifted and ringed, with its chance
function drawPool(b, ctx, t) {
  const r = R.pool, p = b.pool, run = b.run, n = p.odds.length; if (!n) return;
  DH.glass(ctx, r.x, r.y, r.w, r.h, 10, { edge: C.lav });
  const pitch = Math.min(29, (r.w - 16) / n), x0 = r.x + r.w / 2 - (n - 1) * pitch / 2, cy = r.y + r.h / 2 + 1;
  p.odds.forEach((o, i) => {
    const x = x0 + i * pitch, nx = o.type === run.nextType;
    ctx.save(); ctx.globalAlpha = nx ? 1 : o.p > 0 ? 0.75 : 0.25;
    if (nx) { ring(ctx, x, cy - 1, 17, TURRETS[o.type].color, 3.5, t, { seed: i, alpha: 1 }); }
    DD.flatIcon(ctx, o.type, x, cy - 1 - (nx ? 2 + Math.sin(t * 7) : 0), nx ? 31 : 25);
    ctx.restore();
  });
  const pct = Math.max(p.next > 0 ? 1 : 0, Math.round(p.next * 100));
  DH.text(ctx, BT.next(), 487, 849, 10, DIM, 'center', 900, { maxW: 44 }); DH.text(ctx, pct + '%', 487, 862, 15, '#d6358a', 'center');
}

export function drawDeploy(b, ctx, t, beat) {
  DH.setHudTime(t);
  const run = b.run, d = R.deploy;
  const cost = run.deployCost(false), can = run.coins >= cost && run.canDeploy().ok;
  const ph = b.beatPhase, nextDef = TURRETS[run.nextType];
  const near = b.prof.settings.beat && Math.min(ph, 1 - ph) * (60 / run.bpm) <= ECON.beatWindow;
  const pk = b.pressK('deploy');
  const sc = 1 + 0.035 * beat + Math.max(0, b.deployPulse) * 0.06 - pk * 0.04;
  ctx.save();
  ctx.translate(d.x + d.w / 2, d.y + d.h / 2); ctx.scale(sc, sc); ctx.translate(-(d.x + d.w / 2), -(d.y + d.h / 2));
  // the beat halo: a dashed crayon outline closing in on the button, solid green when the beat lands
  if (b.prof.settings.beat) {
    const grow = 1 + (1 - ph) * 0.2;
    ctx.save(); ctx.translate(d.x + d.w / 2, d.y + d.h / 2);
    rrectStroke(ctx, -d.w / 2 * grow, -d.h / 2 * grow, d.w * grow, d.h * grow, 28, INK, near ? 9 : 5, near ? 0.9 : 0.25 + 0.4 * ph, near ? null : [10, 8], t * 20);
    rrectStroke(ctx, -d.w / 2 * grow, -d.h / 2 * grow, d.w * grow, d.h * grow, 28, near ? C.lime : C.sky, near ? 5 : 3, near ? 1 : 0.3 + 0.6 * ph, near ? null : [10, 8], t * 20);
    ctx.restore();
  }
  DH.button(ctx, d, can ? C.pink : '#b9b3c8', { radius: 22, press: pk, glow: can ? 0.2 + 0.2 * beat : 0, glowColor: C.lime });
  // equalizer in the corner, bouncing to the beat
  ctx.save(); ctx.globalAlpha = can ? 0.7 : 0.35; ctx.fillStyle = '#fff';
  for (let i = 0; i < 5; i++) { const hh2 = 5 + 10 * (0.5 + 0.5 * Math.sin(t * (5 + i * 1.3) + i)) * (0.5 + beat * 0.7); DH.rrect(ctx, d.x + d.w - 38 + i * 6, d.y + 24 - hh2, 4, hh2, 2); ctx.fill(); }
  ctx.restore();
  // socket with the next turret: a paper disc with an inked rim; it spins when the drop is re-rolled
  const sx = d.x + 33, sy = d.y + d.h / 2;
  ctx.beginPath(); ctx.arc(sx, sy, 24, 0, TAU); ctx.fillStyle = C.paper; ctx.fill();
  ring(ctx, sx, sy, 24, nextDef.color, 3.5, t, { seed: 11 });
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(b.rerollSpin * TAU); DD.flatIcon(ctx, run.nextType, 0, 0, 42); ctx.restore();
  // the chance of this drop, as a paper sticker on the socket
  const pct = Math.max(b.pool.next > 0 ? 1 : 0, Math.round(b.pool.next * 100));
  DH.glass(ctx, d.x + 1, d.y - 1, 36, 17, 8, { edge: C.pink });
  DH.text(ctx, pct + '%', d.x + 19, d.y + 8, 12, INK, 'center');
  DH.text(ctx, BT.drop(), d.x + 64, d.y + 19, 25, '#fff', 'left', 900, { maxW: d.w - 90 });
  DH.text(ctx, nextDef.name, d.x + 64, d.y + 36, 12, '#fff', 'left', 900, { maxW: d.w - 72 });
  if (run.mods.freeDeploys > 0) DH.text(ctx, BT.freeN(run.mods.freeDeploys), d.x + 64, d.y + 50, 16, C.lime, 'left', 900, { maxW: d.w - 72 });
  else { AE.drawGlyph(ctx, 'coin', d.x + 72, d.y + 49, 18); DH.text(ctx, fmt(cost), d.x + 85, d.y + 50, 19, can ? C.yellow : '#ffd0d0', 'left'); }
  if (b.targetSlot != null) AE.drawGlyph(ctx, 'target', d.x + d.w - 18, d.y + 40, 18, '#fff');
  ctx.restore();
}

export function drawHero(b, ctx, who, c, t) {
  DH.setHudTime(t);
  const run = b.run, name = who === 'roxor' ? 'heroR' : 'heroJ';
  const ready = run.heroReady(who), max = run.heroMax(who), cd = run.heroCd[who];
  const col = who === 'roxor' ? C.green : C.pink;
  b._ready = b._ready || {};
  if (ready && b._ready[who] === false) b.readyFlash = Object.assign(b.readyFlash || {}, { [who]: t });
  b._ready[who] = ready;
  const rf = b.readyFlash && b.readyFlash[who] != null ? Math.max(0, 1 - (t - b.readyFlash[who]) * 2.2) : 0;
  const pk = b.pressK(name), pulse = ready ? 0.5 + 0.5 * Math.sin(t * 6) : 0;
  ctx.save();
  const sc = 1 - pk * 0.06 + rf * 0.08;
  ctx.translate(c.x, c.y); ctx.scale(sc, sc); ctx.translate(-c.x, -c.y);
  DH.bezel(ctx, c.x, c.y, c.r, ready ? col : '#b9b3c8');
  ctx.save(); ctx.beginPath(); ctx.arc(c.x, c.y, c.r - 6, 0, TAU); ctx.clip();
  ctx.fillStyle = ready ? K.C.paper : '#e6e1ef'; ctx.fillRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);
  ctx.globalAlpha = ready ? 1 : 0.55;
  AW.drawBust(ctx, who, c.x, c.y + 8, c.r * 2.1, { t, outfit: b.prof.outfits.worn[who], pose: ready ? 'hype' : 'idle' });
  ctx.globalAlpha = 1;
  if (!ready) {   // cooldown: a flat graphite wedge sweeping round
    const a0 = -Math.PI / 2, a1 = a0 + TAU * (cd / max);
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.arc(c.x, c.y, c.r, a0, a1, false); ctx.closePath(); ctx.fillStyle = 'rgba(43,39,51,0.45)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + Math.cos(a1) * c.r, c.y + Math.sin(a1) * c.r); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
  }
  ctx.restore();
  if (!ready) DH.text(ctx, Math.ceil(cd) + '', c.x, c.y, 26, '#fff', 'center');
  if (ready) ring(ctx, c.x, c.y, c.r + 6 + pulse * 3, col, 4, t, { dash: [10, 8], march: t * 26, alpha: 0.6 + pulse * 0.4, seed: who === 'roxor' ? 2 : 4 });
  ctx.restore();
  const lab = DD.drawHeroTag(b, ctx, who, c, t);
  DH.text(ctx, lab, c.x, c.y + c.r + 12, 12, ready ? (who === 'roxor' ? '#2a8a30' : '#d6358a') : DIM, 'center', 900, { maxW: 84 });
}

// ---------------------------------------------------------------------------------------------------- banner: a taped paper strip
export function drawBanner(b, ctx) {
  const bn = b.banner; if (!bn) return;
  DH.setHudTime(b.t);
  const inK = clamp(bn.t / 0.28, 0, 1), outK = clamp((bn.life - bn.t) / 0.3, 0, 1);
  const a = Math.min(inK, outK), k = bn.t / bn.life;
  const y = bn.small ? 300 : 380;
  const sc = 0.6 + 0.4 * easeOutBack(inK) + (bn.boss ? Math.sin(bn.t * 30) * 0.004 * (1 - k) : 0);
  ctx.save();
  ctx.globalAlpha = a; ctx.translate(W / 2, y); ctx.scale(sc, sc); ctx.rotate(bn.small ? 0 : -0.018);
  if (!bn.small) {
    const bh = bn.sub ? 112 : 80;
    DH.glass(ctx, -250, -52, 500, bh, 22, { edge: bn.boss ? C.red : bn.color });
    if (bn.boss) {   // red hazard ticks along the top edge
      ctx.globalAlpha = a * 0.55; ctx.strokeStyle = C.red; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath();
      const off = (bn.t * 40) % 40; for (let x = -230 + off; x < 230; x += 40) { ctx.moveTo(x, -44); ctx.lineTo(x + 14, -38); }
      ctx.stroke(); ctx.globalAlpha = a;
    }
  }
  DH.text(ctx, bn.text, 0, bn.small ? 0 : -14, bn.small ? 38 : (bn.text.length > 20 ? 28 : 40), bn.color, 'center', 900, { maxW: 470 });
  if (bn.sub && !bn.small) DH.wrapText(ctx, bn.sub, 0, 28, 460, 16, 20, INK, 'center', 2);
  else if (bn.sub) DH.text(ctx, bn.sub, 0, 36, 16, '#fff', 'center', 900, { maxW: 470 });
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------------- tutorial: a dimmed page with a crayon-circled spot and a paper speech bubble
export function drawTutorial(b, ctx) {
  const spot = b.tutSpot();
  const s = TUTORIAL[b.tut.i];
  if (!s) return;
  DH.setHudTime(b.t);
  ctx.save();
  if (spot && !s.free) {
    ctx.fillStyle = 'rgba(43,39,51,0.62)';
    ctx.beginPath(); ctx.rect(0, 0, W, H);
    if (spot.round) { ctx.moveTo(spot.x + spot.w, spot.y + spot.h / 2); ctx.arc(spot.x + spot.w / 2, spot.y + spot.h / 2, spot.w / 2, 0, TAU, true); }
    else DH.rrectPath(ctx, spot.x, spot.y, spot.w, spot.h, 16, true);
    ctx.fill('evenodd');
  } else if (!s.free) { ctx.fillStyle = 'rgba(43,39,51,0.5)'; ctx.fillRect(0, 0, W, H); }
  if (spot) {
    const k = 0.5 + 0.5 * Math.sin(b.t * 6);
    if (spot.round) ring(ctx, spot.x + spot.w / 2, spot.y + spot.h / 2, spot.w / 2 + 3, C.yellow, 5 + k * 2, b.t, { dash: [16, 9], march: b.t * 30, seed: 5 });
    else {
      rrectStroke(ctx, spot.x, spot.y, spot.w, spot.h, 16, INK, 10 + k * 2, 0.9, null);
      rrectStroke(ctx, spot.x, spot.y, spot.w, spot.h, 16, C.yellow, 5 + k * 2, 1, [16, 9], b.t * 30);
    }
  }
  // Loopy and a paper speech bubble with a tail, bobbing a little
  const atTop = spot && spot.y > 400 ? true : (spot ? spot.y < 400 ? false : true : false);
  const bob = Math.sin(b.t * 2.2) * 3;
  const by = (atTop ? 140 : 560) + bob, bw = 470, bh = 150, bx = 60;
  DH.glass(ctx, bx - 30, by, bw, bh, 22, { edge: C.yellow });
  ctx.beginPath(); ctx.moveTo(bx - 8, by + bh - 6); ctx.lineTo(bx - 38, by + bh + 28); ctx.lineTo(bx + 24, by + bh - 6); ctx.closePath();
  ctx.fillStyle = K.C.paper; ctx.fill(); ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx - 4, by + bh - 7); ctx.lineTo(bx + 20, by + bh - 7); ctx.strokeStyle = K.C.paper; ctx.lineWidth = 6; ctx.stroke();
  AW.drawLoopy(ctx, 50, by + bh - 20, 78, { t: b.t, mood: 'happy', talk: b.tut.t < 2.5 });
  DH.wrapText(ctx, b.tutBubble ? b.tutBubble.text : '', bx + 70, by + 32, bw - 100, 20, 24, INK, 'left');
  if (s.wait === 'tap') { const k2 = 0.5 + 0.5 * Math.sin(b.t * 5); ctx.globalAlpha = 0.6 + 0.4 * k2; DH.text(ctx, BT.tapToContinue(), bx - 30 + bw - 20, by + bh - 16, 14, C.purple, 'right', 900, { maxW: 220 }); }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------------- wave preview card
// A compact taped card listing the next wave: wave twist, then per lane the enemy types with names, counts and badges (flying, armored, elite), and the boss.
export function drawPreview(b, ctx) {
  if (!b.pv || !b.pv.open) return;
  const pv = b.pv.next; DH.setHudTime(b.t);
  const run = b.run, k = clamp(b.pv.t / 0.22, 0, 1), sc = 0.7 + 0.3 * easeOutBack(k);
  const lanes = pv ? pv.lanes.filter((l) => l.enemies.length || l.boss) : [];
  const CW = 464, CELL = 40, head = pv && pv.mod ? 74 : 52;
  let h = head + 34;
  for (const l of lanes) h += 24 + Math.ceil(l.enemies.length / 2) * CELL + (l.boss ? 30 : 0) + 6;
  if (!pv) h = head + 40;
  if (b.pv.cur) h += 24;
  h = Math.min(h, 640);
  const x = (W - CW) / 2, y = clamp(470 - h / 2, 126, 820 - h);
  ctx.save();
  ctx.globalAlpha = 0.45 * k; ctx.fillStyle = INK; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = k;
  ctx.translate(W / 2, y + h / 2); ctx.scale(sc, sc); ctx.translate(-W / 2, -(y + h / 2));
  DH.glass(ctx, x, y, CW, h, 18, { edge: pv && pv.hasBoss ? C.red : C.blue });
  if (!pv) { DH.text(ctx, BT.noMoreWaves(), W / 2, y + h / 2, 18, INK, 'center', 900, { maxW: CW - 30 }); ctx.restore(); return; }
  DH.text(ctx, BT.nextWaveCard(pv.wave, run.endless ? 0 : run.wavesTotal), x + 20, y + 28, 22, INK, 'left', 900, { maxW: 270 });
  DH.text(ctx, BT.staticCount(pv.total), x + CW - 20, y + 28, 16, DIM, 'right', 900, { maxW: 150 });
  let yy = y + 50;
  if (pv.mod) {
    const m = WAVE_MODS[pv.mod.id], good = m && m.good;
    if (m && m.glyph) AE.drawGlyph(ctx, m.glyph, x + 32, yy + 8, 22, good ? C.green : C.orange);
    DH.text(ctx, pv.mod.name, x + 52, yy + 2, 15, good ? '#2a8a30' : '#d4620a', 'left', 900, { maxW: CW - 70 });
    DH.text(ctx, pv.mod.desc, x + 52, yy + 20, 12, DIM, 'left', 900, { maxW: CW - 70 }); yy += 24;
  }
  yy = y + head;
  if (b.pv.cur) { DH.text(ctx, BT.onField(b.pv.cur.total), x + 20, yy + 4, 13, DIM, 'left', 900, { maxW: CW - 40 }); yy += 24; }
  lanes.forEach((l, li) => {
    ctx.save(); ctx.strokeStyle = 'rgba(43,39,51,0.3)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(x + 14, yy); ctx.lineTo(x + CW - 14, yy); ctx.stroke(); ctx.restore();
    DH.text(ctx, pv.lanes.length > 1 ? BT.gate(l.lane + 1) : BT.enemies(), x + 20, yy + 14, 13, C.purple, 'left', 900, { maxW: 200 });
    yy += 24;
    l.enemies.forEach((en, i) => {
      const d = ENEMIES[en.type], cx = x + 16 + (i % 2) * (CW / 2), cy = yy + Math.floor(i / 2) * CELL + CELL / 2 - 2;
      AE.drawEnemy(ctx, en.type, cx + 14, cy, { t: b.t, scale: clamp(13 / d.r, 0.4, 0.9), hp: 1 });
      DH.text(ctx, d.name + ' x' + en.count, cx + 36, cy - 6, 14, INK, 'left', 900, { maxW: 150 });
      let bx = cx + 36; const bd = [];
      if (en.flying) bd.push([BT.flying(), C.sky]); if (en.armored) bd.push([BT.armored(), '#7a7f92']); if (en.elite) bd.push([BT.elite(), C.orange]);
      for (const [lab, col] of bd) { DH.text(ctx, lab, bx, cy + 10, 11, col, 'left', 900, { maxW: 70 }); bx += Math.min(70, lab.length * 6) + 10; }
    });
    yy += Math.ceil(l.enemies.length / 2) * CELL;
    if (l.boss) {
      const bd = BOSSES[l.boss];
      AE.drawGlyph(ctx, 'crown', x + 34, yy + 12, 24, C.red);
      DH.text(ctx, BT.bossCard(bd ? bd.name : l.boss), x + 56, yy + 7, 15, C.red, 'left', 900, { maxW: CW - 76 });
      if (bd && bd.trick) DH.text(ctx, bd.trick, x + 56, yy + 23, 11, DIM, 'left', 900, { maxW: CW - 76 });
      yy += 30;
    }
    yy += 6;
  });
  DH.text(ctx, BT.closeHint(), W / 2, y + h - 16, 12, DIM, 'center', 900, { maxW: CW - 40 });
  ctx.restore();
}
