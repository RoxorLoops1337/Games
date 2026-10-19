// Midnight Mog battle HUD: top bar (base hp, wave progress with boss marker, speed, pause), the hand of cards with
// drag-to-tile and tap-select-tap-place, energy orbs, relic strip, pause menu, result overlay with reward fly-in, boss intro.
// Everything here draws through the shell (ui.*) and reads the battle state; it never mutates sim state. Actions go out
// through the `ctl` object the battle screen passes in (select, tapCard, drop, cycleSpeed, toggleAuto, cycleHand, pause, quit).
// Layout comes from render/world.js layoutFor(); if that module is missing a plausible stub layout is built.
import { PAL, rgba, glow, rarityColor } from '../palette.js';
import { drawText, fitText, wrapText, formatNum, formatTime } from '../render/text.js';
import * as ICONS from '../render/icons.js';
import * as ENEMYART from '../render/enemyart.js';
import * as FXMOD from '../render/fx.js';
import { CARD_BY_ID } from '../data/cards.js';
import { RELIC_BY_ID } from '../data/relics.js';
import { cardCost } from '../sim/effects.js';
import { chamfer, vgrad, clamp, lerp, outBack, outCubic, drawGlyph } from './shell.js';

const TAU = Math.PI * 2;
export const SPEEDS = [1, 2, 3];

// ------------------------------------------------------------------------------------------------ layout
/** Rects for the hand cards inside L.handRect. Returns {cards:[rect], strip:rect, cw, ch}. Reuses one result object. */
const HL = { cards: [], strip: { x: 0, y: 0, w: 0, h: 0 }, cw: 0, ch: 0 };
export function handLayout(L, n) {
  const hr = L.handRect;
  const stripH = clamp(hr.h * 0.3, 40, 52);
  HL.strip.x = hr.x + 8; HL.strip.y = hr.y; HL.strip.w = hr.w - 16; HL.strip.h = stripH;
  n = Math.max(1, n);
  const gap = 6, pad = 8;
  const availH = hr.h - stripH - 6;
  let cw = (hr.w - pad * 2 - gap * (n - 1)) / n;
  let ch = cw * 1.4;
  if (ch > availH) { ch = availH; cw = ch / 1.4; }
  cw = Math.min(cw, 120); ch = cw * 1.4;
  const total = cw * n + gap * (n - 1);
  const x0 = hr.x + (hr.w - total) / 2;
  const y = hr.y + hr.h - ch - 4;
  while (HL.cards.length < n) HL.cards.push({ x: 0, y: 0, w: 0, h: 0 });
  HL.cards.length = n;
  for (let i = 0; i < n; i++) { const r = HL.cards[i]; r.x = x0 + i * (cw + gap); r.y = y; r.w = cw; r.h = ch; }
  HL.cw = cw; HL.ch = ch;
  return HL;
}

/** Fill `mask` (flat array lane*8+col-1) with 1 for tiles where a summon may be placed. Returns the count of free tiles. */
export function placeableMask(b, mask) {
  const lanes = b.lanes || 5, cols = b.cols || 8;
  for (let i = 0; i < lanes * cols; i++) mask[i] = 1;
  mask.length = lanes * cols;
  let free = lanes * cols;
  const us = b.units;
  for (let i = 0; i < us.length; i++) {
    const u = us[i];
    if (u.dead || (u.kind !== 'cat' && u.kind !== 'barricade')) continue;
    const h = u.kind === 'cat' && u.home ? u.home : u;
    const c = Math.round(h.x), l = Math.round(h.y);
    if (c < 1 || c > cols || l < 0 || l >= lanes) continue;
    const k = l * cols + c - 1;
    if (mask[k]) { mask[k] = 0; free--; }
  }
  return free;
}

// ------------------------------------------------------------------------------------------------ small pieces
/** Segmented energy row. Draws the big gem with the integer value and one pip per energy slot, the next pip filling. */
export function drawEnergy(ctx, ui, r, energy, cap, t, o) {
  o = o || {};
  const whole = Math.floor(energy + 1e-6), part = energy - whole;
  const full = energy >= cap - 1e-6;
  // big gem
  const gr = Math.min(r.h * 0.5, 24), gx = r.x + gr + 2, gy = r.y + r.h / 2;
  const pulse = full ? 0.5 + 0.5 * Math.sin(t * 8) : 0;
  const shake = o.shake > 0 ? Math.sin(t * 60) * 3 * o.shake : 0;
  ctx.save();
  ctx.translate(shake, 0);
  glow(ctx, gx, gy, gr * 2.4, PAL.cyan, 0.35 + pulse * 0.3);
  ctx.beginPath();
  ctx.moveTo(gx, gy - gr); ctx.lineTo(gx + gr * 0.9, gy - gr * 0.25); ctx.lineTo(gx + gr * 0.6, gy + gr * 0.85); ctx.lineTo(gx - gr * 0.6, gy + gr * 0.85); ctx.lineTo(gx - gr * 0.9, gy - gr * 0.25); ctx.closePath();
  ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = PAL.ink; ctx.stroke();
  ctx.save(); ctx.translate(0, gy - gr); ctx.fillStyle = vgrad(ctx, 'egem', gr * 2, PAL.bone, PAL.cyan, PAL.cyanDeep); ctx.beginPath();
  ctx.moveTo(gx, 0); ctx.lineTo(gx + gr * 0.9, gr * 0.75); ctx.lineTo(gx + gr * 0.6, gr * 1.85); ctx.lineTo(gx - gr * 0.6, gr * 1.85); ctx.lineTo(gx - gr * 0.9, gr * 0.75); ctx.closePath(); ctx.fill(); ctx.restore();
  ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(PAL.bone, 0.8); ctx.stroke();
  drawText(ctx, String(whole), gx, gy + gr * 0.42, { size: gr * 1.15, kind: 'display', align: 'center', color: PAL.ink, stroke: false });
  ctx.restore();
  // pips
  const px0 = gx + gr + 10, avail = r.x + r.w - px0;
  const pw = Math.min(22, (avail - (cap - 1) * 4) / cap), ph = Math.min(r.h * 0.5, 22);
  const py = gy - ph / 2;
  for (let i = 0; i < cap; i++) {
    const x = px0 + i * (pw + 4);
    const fill = i < whole ? 1 : i === whole ? part : 0;
    ctx.save(); ctx.translate(x + shake, py);
    ctx.beginPath(); ctx.moveTo(pw * 0.2, 0); ctx.lineTo(pw, 0); ctx.lineTo(pw * 0.8, ph); ctx.lineTo(0, ph); ctx.closePath();
    ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = PAL.ink; ctx.stroke();
    ctx.fillStyle = PAL.ink2; ctx.fill();
    if (fill > 0) {
      ctx.save(); ctx.clip();
      ctx.fillStyle = vgrad(ctx, 'pip', ph, PAL.bone, PAL.cyan, PAL.cyanDeep);
      ctx.globalAlpha = i < whole ? 1 : 0.55 + 0.25 * fill;
      ctx.fillRect(0, ph * (1 - fill), pw, ph * fill);
      ctx.restore();
    }
    ctx.lineWidth = 1.2; ctx.strokeStyle = fill >= 1 ? PAL.cyan : rgba(PAL.cyan, 0.4); ctx.beginPath(); ctx.moveTo(pw * 0.2, 0); ctx.lineTo(pw, 0); ctx.lineTo(pw * 0.8, ph); ctx.lineTo(0, ph); ctx.closePath(); ctx.stroke();
    if (fill >= 1) glow(ctx, pw * 0.5, ph * 0.5, pw * 1.6, PAL.cyan, 0.3 + pulse * 0.25);
    ctx.restore();
  }
}

/** Zig-zag crown marker for the boss wave (enemies cut, they do not curve). */
function drawBossMark(ctx, x, y, s, lit, t) {
  ctx.save(); ctx.translate(x, y);
  if (lit) glow(ctx, 0, 0, s * 2.2, PAL.magenta, 0.5 + 0.2 * Math.sin(t * 8));
  ctx.beginPath();
  ctx.moveTo(-s, s * 0.7); ctx.lineTo(-s, -s * 0.2); ctx.lineTo(-s * 0.5, s * 0.2); ctx.lineTo(0, -s * 0.9); ctx.lineTo(s * 0.5, s * 0.2); ctx.lineTo(s, -s * 0.2); ctx.lineTo(s, s * 0.7); ctx.closePath();
  ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = PAL.ink; ctx.stroke();
  ctx.fillStyle = lit ? PAL.magenta : PAL.violet; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = rgba(PAL.bone, 0.6); ctx.stroke();
  ctx.fillStyle = PAL.ink; ctx.fillRect(-s * 0.45, s * 0.2, s * 0.25, s * 0.25); ctx.fillRect(s * 0.2, s * 0.2, s * 0.25, s * 0.25);
  ctx.restore();
}

/** Base castle heart glyph for the hp bar. */
function drawBaseGlyph(ctx, x, y, s, hurt) {
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(-s, s * 0.8); ctx.lineTo(-s, -s * 0.1); ctx.lineTo(-s * 0.55, -s * 0.1); ctx.lineTo(-s * 0.55, -s * 0.55); ctx.lineTo(-s * 0.2, -s * 0.55); ctx.lineTo(-s * 0.2, -s * 0.1);
  ctx.lineTo(s * 0.2, -s * 0.1); ctx.lineTo(s * 0.2, -s * 0.55); ctx.lineTo(s * 0.55, -s * 0.55); ctx.lineTo(s * 0.55, -s * 0.1); ctx.lineTo(s, -s * 0.1); ctx.lineTo(s, s * 0.8); ctx.closePath();
  ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = PAL.ink; ctx.stroke();
  ctx.fillStyle = hurt > 0.2 ? PAL.magenta : PAL.cyan; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = rgba(PAL.bone, 0.7); ctx.stroke();
  ctx.fillStyle = PAL.ink; ctx.beginPath(); ctx.moveTo(-s * 0.25, s * 0.8); ctx.lineTo(-s * 0.25, s * 0.25); ctx.arc(0, s * 0.25, s * 0.25, Math.PI, 0); ctx.lineTo(s * 0.25, s * 0.8); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ top bar
const TB = { x: 0, y: 0, w: 0, h: 0 };
/** The HUD column: full width on a phone, the hand's max-width column on a wide screen. */
function column(L, bar, out) { out.x = L.handRect.x; out.w = L.handRect.w; out.y = bar.y; out.h = bar.h; return out; }
export function drawTopBar(ctx, ui, L, S, ctl) {
  const b = S.b, tb = column(L, L.topBar, TB), t = S.clock;
  const pad = 8, bh = 44;
  const y = tb.y + (tb.h - bh) / 2;
  // right side buttons: pause, speed
  const pauseR = { x: tb.x + tb.w - pad - 44, y, w: 44, h: bh };
  const speedR = { x: pauseR.x - 6 - 48, y, w: 48, h: bh };
  if (ui.button('pause', pauseR, '', { kind: 'icon', icon: 'pause', aria: 'Pause' })) ctl.pause();
  const spd = SPEEDS[S.speedIdx];
  const speedIcon = (c, cx, cy, sz) => {
    drawGlyph(c, 'speed' + spd, cx, cy - 5, sz * 0.78, PAL.bone, 0);
    drawText(c, spd + 'X', cx, cy + sz * 0.62, { size: 12, kind: 'display', align: 'center', color: spd > 1 ? PAL.cyan : PAL.boneDim, stroke: 3 });
  };
  if (ui.button('speed', speedR, '', { kind: 'icon', icon: speedIcon, aria: 'Speed ' + spd + 'x', toggled: S.speedIdx > 0 })) ctl.cycleSpeed();
  // base hp (left)
  const hpW = clamp(tb.w * 0.3, 96, 170);
  const hpR = { x: tb.x + pad + 24, y: y + 6, w: hpW - 24, h: 22 };
  const hpFrac = b.base.maxHp > 0 ? b.base.hp / b.base.maxHp : 0;
  drawBaseGlyph(ctx, tb.x + pad + 11, y + 17, 11, S.baseFlash);
  ui.bar(hpR, hpFrac, { kind: 'hp', id: 'basehp', label: formatNum(Math.max(0, Math.ceil(b.base.hp))) });
  if (S.baseFlash > 0) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(PAL.magenta, 0.35 * S.baseFlash); ctx.fillRect(hpR.x, hpR.y, hpR.w, hpR.h); ctx.restore(); }
  drawText(ctx, 'BASE', hpR.x + 2, y + 41, { size: 11, kind: 'display', color: PAL.boneDim, stroke: 2.5 });
  // wave progress (centre)
  const wx = hpR.x + hpR.w + 14, ww = speedR.x - 10 - wx;
  if (ww > 50) {
    const prog = waveProgress(b);
    const barR = { x: wx, y: y + 6, w: ww - 18, h: 18 };
    const markers = [];
    for (let i = 1; i < b.waves; i++) markers.push(i / b.waves);
    ui.bar(barR, prog, { kind: 'progress', markers });
    const bossLit = !!(b.info && b.info.isBoss) && b.wave >= b.waves;
    if (b.info && b.info.isBoss) drawBossMark(ctx, barR.x + barR.w + 10, barR.y + barR.h / 2 + 1, 9, bossLit, t);
    const label = b.wave > 0 ? 'WAVE ' + b.wave + '/' + b.waves : 'GET READY';
    drawText(ctx, label, wx, y + 41, { size: 12, kind: 'display', color: PAL.bone, stroke: 3, maxWidth: ww });
    const secs = formatTime(b.t);
    drawText(ctx, secs, wx + ww - 18, y + 41, { size: 11, kind: 'body', weight: 700, color: PAL.boneDim, align: 'right', stroke: 2.5 });
  }
}

/** 0..1 progress through the stage's waves, counting the wave that is currently spawning. */
export function waveProgress(b) {
  const sp = b.sp;
  if (!sp || !b.waves) return 0;
  let done = sp.next || 0;
  if (sp.state === 'run' && sp.pending && sp.pending.length) done += (sp.pi || 0) / sp.pending.length;
  if (sp.done && b.enemies.length === 0) done = b.waves;
  return clamp(done / b.waves, 0, 1);
}

// ------------------------------------------------------------------------------------------------ relics
export function drawRelicStrip(ctx, ui, L, S, ctl) {
  const rel = S.relics;
  if (!rel.length) return;
  const sz = 22, gap = 4;
  const y0 = L.topBar.y + L.topBar.h + 1;
  const maxN = Math.min(rel.length, Math.floor((L.w - 16) / (sz + gap)));
  for (let i = 0; i < maxN; i++) {
    const id = rel[i];
    const r = { x: L.handRect.x + 8 + i * (sz + gap), y: y0, w: sz, h: sz };
    const st = ui.region('relic:' + id, r, { focus: true, label: (RELIC_BY_ID[id] ? RELIC_BY_ID[id].name : id) });
    ctx.save(); ctx.globalAlpha = 0.92;
    if (ICONS.drawRelic) ICONS.drawRelic(ctx, id, r.x + sz / 2, r.y + sz / 2, sz, S.clock);
    ctx.restore();
    if (st.hover || st.long || st.tap) { const rd = RELIC_BY_ID[id]; if (rd) ui.tip(r, rd.name, rd.text); }
  }
  if (rel.length > maxN) drawText(ctx, '+' + (rel.length - maxN), L.handRect.x + 8 + maxN * (sz + gap), y0 + 16, { size: 12, kind: 'body', weight: 800, color: PAL.boneDim, stroke: 3 });
}

// ------------------------------------------------------------------------------------------------ bottom bar
const BB = { x: 0, y: 0, w: 0, h: 0 };
export function drawBottomBar(ctx, ui, L, S, ctl) {
  const b = S.b, bb = column(L, L.bottomBar, BB), pad = 8;
  const bh = 44, y = bb.y + (bb.h - bh) / 2;
  const cycleR = { x: bb.x + bb.w - pad - 44, y, w: 44, h: bh };
  const autoR = { x: cycleR.x - 6 - 44, y, w: 44, h: bh };
  const canCycle = b.energy >= 1 - 1e-9 && !b.over;
  if (ui.button('auto', autoR, '', { kind: 'icon', icon: 'auto', aria: 'Auto play cards ' + (S.auto ? 'on' : 'off'), toggled: S.auto })) ctl.toggleAuto();
  if (S.auto) drawText(ctx, 'AUTO', autoR.x + 22, autoR.y - 2, { size: 10, kind: 'display', align: 'center', color: PAL.cyan, stroke: 3 });
  if (ui.button('cycle', cycleR, '', { kind: 'icon', icon: 'cycle', aria: 'Redraw hand for 1 energy', disabled: !canCycle })) ctl.cycleHand();
  drawText(ctx, '1', cycleR.x + 37, cycleR.y + 40, { size: 12, kind: 'display', color: canCycle ? PAL.cyan : PAL.slate, align: 'center', stroke: 3 });
  const er = { x: bb.x + pad, y: bb.y, w: autoR.x - bb.x - pad - 8, h: bb.h };
  drawEnergy(ctx, ui, er, b.energy, b.energyCap, S.clock, { shake: S.energyShake });
}

// ------------------------------------------------------------------------------------------------ hand
const TARGET_HINT = { tile: 'Tap or drag onto a rooftop tile', enemy: 'Tap or drag onto an enemy', lane: 'Tap or drag onto a lane', none: 'Tap again, or drag up, to cast' };
export function drawHand(ctx, ui, L, S, ctl) {
  const b = S.b, hand = b.hand, n = hand.length;
  const hl = handLayout(L, Math.max(1, n));
  // detail strip
  const st = hl.strip;
  const selCard = S.sel >= 0 && S.sel < n ? CARD_BY_ID[hand[S.sel]] : null;
  ctx.save();
  chamfer(ctx, st.x, st.y + 2, st.w, st.h - 4, 5);
  ctx.fillStyle = rgba(PAL.ink, 0.72); ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = rgba(selCard ? rarityColor(selCard.rarity) : PAL.violet, 0.8); ctx.stroke();
  ctx.restore();
  if (selCard) {
    const cost = cardCost(b, selCard);
    const need = b.energy + 1e-9 < cost;
    drawText(ctx, selCard.name, st.x + 10, st.y + 16, { size: 14, kind: 'display', color: selCard.rarity === 'legend' || selCard.rarity === 'mythic' ? rarityColor(selCard.rarity) : PAL.bone, stroke: 3, maxWidth: st.w * 0.55 });
    drawText(ctx, need ? 'NEED ' + cost + ' ENERGY' : TARGET_HINT[selCard.effect.target || 'none'], st.x + st.w - 10, st.y + 16, { size: 11, kind: 'body', weight: 800, align: 'right', color: need ? PAL.magenta : PAL.lime, stroke: 2.5, maxWidth: st.w * 0.44 });
    const fs = 11.5;
    const lines = wrapText(ctx, selCard.text, st.w - 20, { size: fs, kind: 'body', weight: 600 });
    for (let i = 0; i < Math.min(2, lines.length); i++) drawText(ctx, lines[i], st.x + 10, st.y + 16 + (i + 1) * 13, { size: fs, kind: 'body', weight: 600, color: PAL.boneDim, stroke: 2, maxWidth: st.w - 20 });
  } else {
    const dr = b.draw ? b.draw.length : 0, di = b.discard ? b.discard.length : 0;
    drawText(ctx, S.hintText || 'Pick a card', st.x + 10, st.y + st.h / 2 + 4, { size: 13, kind: 'body', weight: 700, color: PAL.boneDim, stroke: 2.5, maxWidth: st.w - 130 });
    drawText(ctx, 'DRAW ' + dr + ' / DISC ' + di, st.x + st.w - 10, st.y + st.h / 2 + 4, { size: 10, kind: 'display', align: 'right', color: PAL.violetHi, stroke: 2.5 });
  }
  // cards
  for (let i = 0; i < n; i++) {
    const card = CARD_BY_ID[hand[i]];
    if (!card) continue;
    const r = hl.cards[i];
    const cost = cardCost(b, card);
    const afford = b.energy + 1e-9 >= cost;
    const dragging = S.drag && S.drag.i === i && S.drag.active;
    const lvl = S.cardLevels[card.id] || 1;
    const rr = dragging ? { x: r.x, y: r.y + 6, w: r.w, h: r.h } : r;
    const cs = ui.card('hand' + i, rr, card, { afford, cost, compact: true, selected: S.sel === i, level: lvl, lift: afford ? 0 : -0.2 });
    if (cs.tap) ctl.tapCard(i);
    if (cs.dragging) ctl.dragCard(i, ui.px, ui.py);
    if (dragging) { ctx.save(); chamfer(ctx, r.x, r.y, r.w, r.h, 6); ctx.fillStyle = rgba(PAL.void, 0.55); ctx.fill(); ctx.restore(); }
    // hotkey number
    if (L.w > 600) drawText(ctx, String(i + 1), r.x + r.w / 2, r.y - 4, { size: 11, kind: 'display', align: 'center', color: PAL.violetHi, stroke: 2.5 });
    // affordable shine: a thin cyan underline pulse when the card is ready
    if (afford && !dragging) { ctx.fillStyle = rgba(PAL.cyan, 0.35 + 0.25 * Math.sin(S.clock * 5 + i)); ctx.fillRect(r.x + 6, r.y + r.h + 1, r.w - 12, 2); }
  }
  const drop = ui.drop;
  if (drop && drop.id.indexOf('hand') === 0) ctl.dropCard(parseInt(drop.id.slice(4), 10), drop.x, drop.y);
  if (!ui.down && S.drag) S.drag = null;
}

/** The card that follows the finger while dragging. Drawn above the world, under overlays. */
export function drawDragCard(ctx, ui, L, S) {
  const d = S.drag;
  if (!d || !d.active) return;
  const card = CARD_BY_ID[S.b.hand[d.i]];
  if (!card) return;
  const w = Math.min(86, HL.cw * 1.15), h = w * 1.4;
  if (d.tile) return;   // over the field the screen draws a ghost unit instead
  const over = false;
  const r = { x: d.x - w / 2, y: d.y - h - 14, w, h };
  ctx.save();
  ctx.globalAlpha = over ? 0.55 : 0.95;
  ui.card('dragghost', r, card, { noRegion: true, compact: true, selected: true, afford: true, cost: cardCost(S.b, card) });
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ pause
export function drawPause(ctx, ui, L, S, ctl) {
  ui.pushLayer();
  ctx.fillStyle = rgba(PAL.void, 0.78); ctx.fillRect(0, 0, ui.w, ui.h);
  ui.block('__pauseblock');
  const w = Math.min(ui.w - 40, 300), h = 310;
  const x = (ui.w - w) / 2, y = Math.max(ui.safe.top + 20, (ui.h - h) / 2 - 20);
  const inner = ui.panel({ x, y, w, h }, { title: 'PAUSED', glow: true, color: PAL.violetHi });
  let cy = inner.y + 14;
  const bw = inner.w, bh = 48;
  if (ui.button('resume', { x: inner.x, y: cy, w: bw, h: bh }, 'Resume', { kind: 'primary' })) ctl.pause();
  cy += bh + 12;
  const half = (bw - 8) / 2;
  const muted = !!S.muted;
  if (ui.button('mute', { x: inner.x, y: cy, w: half, h: 44 }, muted ? 'Sound off' : 'Sound on', { kind: 'secondary', size: 16 })) ctl.toggleMute();
  if (ui.button('autop', { x: inner.x + half + 8, y: cy, w: half, h: 44 }, S.auto ? 'Auto on' : 'Auto off', { kind: 'secondary', size: 16, toggled: S.auto })) ctl.toggleAuto();
  cy += 44 + 12;
  drawText(ctx, S.info ? S.info.label : '', x + w / 2, cy + 12, { size: 14, kind: 'body', weight: 700, align: 'center', color: PAL.boneDim, stroke: 3, maxWidth: inner.w });
  drawText(ctx, 'Wave ' + S.b.wave + ' of ' + S.b.waves + '   ' + formatTime(S.b.t), x + w / 2, cy + 32, { size: 13, kind: 'body', weight: 700, align: 'center', color: PAL.boneDim, stroke: 3 });
  cy += 50;
  if (ui.button('quit', { x: inner.x, y: y + h - 16 - 46 - 4, w: bw, h: 46 }, 'Quit battle', { kind: 'danger' })) ctl.askQuit();
  ui.popLayer();
}

// ------------------------------------------------------------------------------------------------ boss intro
/** Banner with the boss portrait sliding in. S.intro = {id, name, t, dur}. */
export function drawBossIntro(ctx, ui, L, S) {
  const I = S.intro;
  if (!I) return;
  const p = clamp(I.t / I.dur, 0, 1);
  const inP = outCubic(p / 0.18), outP = clamp((1 - p) / 0.16, 0, 1);
  const a = Math.min(inP, outP);
  const W = ui.w, h = Math.min(150, L.h * 0.2), y = L.field.y + L.field.h * 0.5 - h / 2;
  ctx.save();
  ctx.globalAlpha = a;
  // hazard stripes
  const sw = 18;
  ctx.fillStyle = rgba(PAL.void, 0.82); ctx.fillRect(0, y, W, h);
  ctx.save(); ctx.beginPath(); ctx.rect(0, y - 8, W, 8); ctx.rect(0, y + h, W, 8); ctx.clip();
  ctx.fillStyle = PAL.magenta; ctx.fillRect(0, y - 8, W, 16 + h);
  ctx.fillStyle = PAL.ink;
  const off = (I.t * 40) % (sw * 2);
  for (let x = -sw * 2 + off; x < W + sw; x += sw * 2) { ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + sw, y - 8); ctx.lineTo(x + sw - 8, y + h + 8); ctx.lineTo(x - 8, y + h + 8); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  ctx.fillStyle = rgba(PAL.void, 0.9); ctx.fillRect(0, y, W, h);
  glow(ctx, W * 0.5, y + h / 2, W * 0.6, PAL.magenta, 0.12);
  // portrait
  const pw = h * 1.1, px = (W - 330 > 0 ? W * 0.5 - 150 : 12) - (1 - inP) * 160;
  ctx.save(); ctx.beginPath(); ctx.rect(0, y, W, h); ctx.clip();
  if (ENEMYART.drawEnemyPortrait) { try { ENEMYART.drawEnemyPortrait(ctx, I.id, Math.max(8, px - pw * 0.15), y + 4, pw, h - 8, { t: I.t, anim: 'walk', animT: 0 }); } catch (e) { /* optional */ } }
  ctx.restore();
  const tx = Math.max(8, px) + pw + 6 + (1 - inP) * 200;
  drawText(ctx, 'WARNING', tx, y + h * 0.3, { size: 14, kind: 'display', color: PAL.magenta, stroke: 3 });
  const fit = fitText(ctx, I.name, W - tx - 10, { size: 34, min: 16, kind: 'display', stroke: 4 });
  drawText(ctx, fit.text, tx, y + h * 0.3 + fit.size + 4, { size: fit.size, kind: 'display', color: PAL.bone, gradient: [PAL.bone, PAL.cyan], glow: 14, glowColor: PAL.magenta, stroke: 4 });
  if (I.sub) drawText(ctx, I.sub, tx, y + h - 14, { size: 13, kind: 'body', weight: 700, color: PAL.boneDim, stroke: 3, maxWidth: W - tx - 10 });
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------ result overlay
const CUR_COL = { fish: PAL.bone, yarn: PAL.magenta, gems: PAL.cyan, tokens: PAL.lime, key: PAL.cyan };
const CUR_NAME = { fish: 'Fish', yarn: 'Yarn', gems: 'Gems', tokens: 'Tokens', key: 'Crate key' };

/** Prepare result animation rows from battleResult / resolveEcho output. */
export function makeResultState(res, title) {
  const rows = [];
  for (const r of res.rewards || []) rows.push({ kind: r.kind, id: r.id, amount: r.amount || 0, burst: false, shown: 0 });
  return { res, title: title || (res.won ? 'VICTORY' : 'DEFEAT'), t: 0, rows, sounds: 0 };
}

export function drawResult(ctx, ui, L, S, ctl) {
  const R = S.result;
  if (!R) return;
  const res = R.res, won = !!res.won;
  R.t += ui.dt;
  const t = R.t;
  ui.pushLayer();
  const bgA = clamp(t / 0.35, 0, 1);
  ctx.fillStyle = rgba(PAL.void, 0.8 * bgA); ctx.fillRect(0, 0, ui.w, ui.h);
  ui.block('__resblock');
  const accent = won ? PAL.cyan : PAL.magenta;
  const W = Math.min(ui.w - 24, 400), cx = ui.w / 2;
  // title
  const tp = ui.reduceMotion ? 1 : outBack(t / 0.5);
  const ty = ui.safe.top + Math.max(70, ui.h * 0.14);
  ctx.save(); ctx.translate(cx, ty); ctx.scale(clamp(tp, 0, 1.15), clamp(tp, 0, 1.15));
  glow(ctx, 0, -14, 190, accent, 0.35 * bgA);
  drawText(ctx, R.title, 0, 0, { size: Math.min(58, W / 6.4), kind: 'display', align: 'center', gradient: won ? [PAL.bone, PAL.cyan] : [PAL.bone, PAL.magenta], glow: 18, glowColor: accent, stroke: 6, maxWidth: W });
  ctx.restore();
  const subY = ty + 26;
  let subtitle = '';
  if (res.echo) subtitle = 'The city remembers you';
  else if (won) subtitle = res.perfect ? 'PERFECT: the base took no damage' : 'The base holds';
  else subtitle = res.over === 'timeout' ? 'The night ran out' : 'The base fell on wave ' + Math.max(1, res.wave);
  drawText(ctx, subtitle, cx, subY, { size: 15, kind: 'body', weight: 700, align: 'center', color: res.perfect ? PAL.lime : PAL.boneDim, stroke: 3, alpha: clamp((t - 0.3) / 0.3, 0, 1), maxWidth: W });
  // reward panel
  const rows = R.rows;
  const rowH = 54, nRows = Math.max(1, rows.length);
  const px = cx - W / 2, py = subY + 30;
  const hasStats = !res.echo;
  const ph = 28 + (hasStats ? 46 : 8) + (won ? nRows * rowH : 70) + 10;
  const panelA = clamp((t - 0.25) / 0.3, 0, 1);
  ctx.save(); ctx.globalAlpha = panelA; ctx.translate(0, (1 - outCubic(panelA)) * 24);
  const inner = ui.panel({ x: px, y: py, w: W, h: ph }, { title: won ? 'REWARDS' : 'DEBRIEF', color: accent });
  // stats line
  const stats = res.echo ? [] : [['TIME', formatTime(res.seconds)], ['KILLS', String(res.kills || 0)], ['WAVE', Math.max(1, res.wave) + '/' + (res.waves || '?')]];
  if (stats.length) {
    const cw = inner.w / stats.length;
    for (let i = 0; i < stats.length; i++) {
      drawText(ctx, stats[i][0], inner.x + cw * (i + 0.5), inner.y + 12, { size: 11, kind: 'display', align: 'center', color: PAL.violetHi, stroke: 2.5 });
      drawText(ctx, stats[i][1], inner.x + cw * (i + 0.5), inner.y + 32, { size: 17, kind: 'body', weight: 800, align: 'center', color: PAL.bone, stroke: 3 });
    }
  }
  ctx.restore();
  let ry = inner.y + (stats.length ? 46 : 8);
  if (won) {
    if (!rows.length) drawText(ctx, 'No spoils this time', cx, ry + 30, { size: 14, kind: 'body', weight: 700, align: 'center', color: PAL.boneDim, stroke: 3 });
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const start = 0.7 + i * 0.28;
      const lt = (t - start) / 0.55;
      const slotX = inner.x + 28, slotY = ry + i * rowH + rowH / 2 - 6;
      if (lt <= 0) continue;
      const p = outCubic(clamp(lt, 0, 1));
      const sx = cx, sy = py - 20;
      const x = lerp(sx, slotX, p), y = lerp(sy, slotY, p) - Math.sin(p * Math.PI) * 50;
      const landed = lt >= 1;
      const sz = 40 * (landed ? 1 + 0.25 * Math.max(0, 1 - (lt - 1) * 4) : 0.6 + 0.4 * p);
      if (landed && !row.burst) {
        row.burst = true;
        if (S.fx) { try { FXMOD.burstAt(S.fx, slotX, slotY, CUR_COL[row.kind] || PAL.cyan, 14, {}); } catch (e) { /* optional */ } }
        ctl.sound(row.kind === 'key' ? 'reward_key' : 'reward_tick');
      }
      // row plate
      if (landed || lt > 0.4) {
        const ra = clamp((lt - 0.4) / 0.4, 0, 1);
        ctx.save(); ctx.globalAlpha = ra;
        chamfer(ctx, inner.x + 4, ry + i * rowH + 2, inner.w - 8, rowH - 8, 5);
        ctx.fillStyle = rgba(PAL.ink, 0.5); ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = rgba(CUR_COL[row.kind] || PAL.cyan, 0.5); ctx.stroke();
        ctx.restore();
      }
      if (row.kind === 'key') {
        const best = !!(res.boss && res.firstClear);
        if (ICONS.drawCrate) { try { ICONS.drawCrate(ctx, row.id || 'alley_crate', x, y, sz * 1.5, { t: S.clock, glow: best ? 1.4 : 0.8 }); } catch (e) { /* optional */ } }
      } else if (ICONS.drawCurrency) ICONS.drawCurrency(ctx, row.kind, x, y, sz, S.clock);
      if (landed) {
        const v = outCubic(clamp((lt - 1) / 1.1, 0, 1)) * row.amount;
        const label = row.kind === 'key' ? (CUR_NAME.key + ' x' + row.amount) : '+' + formatNum(Math.round(v));
        drawText(ctx, label, inner.x + 64, ry + i * rowH + rowH / 2 + 2, { size: row.kind === 'key' ? 17 : 24, kind: 'display', color: row.kind === 'key' ? PAL.cyan : PAL.bone, stroke: 4, maxWidth: inner.w - 150 });
        const nm = row.kind === 'key' ? (row.id || '').replace(/_/g, ' ') : CUR_NAME[row.kind] || row.kind;
        drawText(ctx, nm, inner.x + inner.w - 12, ry + i * rowH + rowH / 2 + 2, { size: 12, kind: 'body', weight: 700, align: 'right', color: PAL.boneDim, stroke: 3 });
      }
    }
    if (res.firstClear && t > 1.2) drawText(ctx, 'FIRST CLEAR', px + W - 12, py - 4 + 0, { size: 12, kind: 'display', align: 'right', color: PAL.lime, stroke: 3, alpha: 0.6 + 0.4 * Math.sin(t * 6) });
  } else {
    const lines = res.over === 'timeout' ? ['Time ran out before the last wave fell.', 'Stronger cats or a better deck will turn the night.'] : ['Your cats held for ' + formatTime(res.seconds) + '.', 'Merge the same cat on adjacent tiles to power it up.'];
    for (let i = 0; i < lines.length; i++) drawText(ctx, lines[i], cx, ry + 20 + i * 20, { size: 14, kind: 'body', weight: 600, align: 'center', color: PAL.boneDim, stroke: 3, maxWidth: inner.w });
  }
  // buttons
  const by = py + ph + 14;
  const ba = clamp((t - (won ? 0.9 + rows.length * 0.28 : 0.9)) / 0.3, 0, 1);
  if (ba > 0) {
    ctx.save(); ctx.globalAlpha = ba;
    const bw = (W - 10) / 2, bh = 52;
    if (won) {
      if (ui.button('res_again', { x: px, y: by, w: bw, h: bh }, res.echo ? 'Replay' : 'Replay', { kind: 'secondary' })) ctl.replay();
      if (ui.button('res_go', { x: px + bw + 10, y: by, w: bw, h: bh }, 'Continue', { kind: 'primary', pulse: true })) ctl.leave(true);
    } else {
      if (ui.button('res_leave', { x: px, y: by, w: bw, h: bh }, 'Leave', { kind: 'secondary' })) ctl.leave(false);
      if (ui.button('res_retry', { x: px + bw + 10, y: by, w: bw, h: bh }, 'Retry', { kind: 'primary', pulse: true })) ctl.replay();
    }
    ctx.restore();
  }
  ui.popLayer();
}

