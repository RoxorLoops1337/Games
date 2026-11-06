// Combat screen layout: pure geometry, no state. 1280x720 logical canvas.
import { CARD_W, CARD_H } from '../art/cards.js';
import { enemyBounds } from '../art/enemies.js';

export const W = 1280, H = 720;
export const HERO_X = 260, FOOT_Y = 458;
export const BAR_H = 56;
export const PLAY_LINE = 420;
export const DRAW_POS = { x: 64, y: 642 }, DISC_POS = { x: 1216, y: 642 }, EXH_POS = { x: 1136, y: 664 };
export const PILE_S = 0.3, EXH_S = 0.2;
export const ORB = { x: 86, y: 534, size: 88 };
export const STRAIN_BOX = { x: 14, y: 442, w: 150, h: 44 };
export const END_BTN = { x: 1086, y: 546, w: 172, h: 54 };
export const HAND_CX = 622, HAND_Y = 626, HAND_SPREAD = 940;
export const HOVER_Y = 520, HOVER_S = 1.22;       // desktop hover: lifted full face
export const SEL_Y = 470, SEL_S = 1.18;           // desktop selected (click-to-play)
export const PREVIEW_Y = 400, PREVIEW_S = 1.0;    // touch tap preview
export const PLAY_BTN = { w: 120, h: 52 }, CANCEL_BTN = 44;
export const AIM_LINE = PLAY_LINE - 40, ARM_Y = 400, DISARM_Y = 440;
export const ENEMY_REGION = { x0: 500, x1: 1252 };
export const GOLD_POS = { x: 300, y: 28 };
export const DECK_BTN = { x: 1052, y: 9, w: 108, h: 38 };
export const GEAR_BTN = { x: 1176, y: 9, w: 44, h: 38 };
export const POTION0 = { x: 372, y: 9, size: 38, step: 44 };
export const RELIC0 = { x: 520, y: 28, x1: 920, size: 28 };

// UX_SPEC 1: n<=4 .72, 5-6 .66, 7-8 .60, 9-10 .54. Spread 940 centred on 622, step = min(cw, (940 - cw) / (n - 1)).
export function handScale(n) { return n <= 4 ? 0.72 : n <= 6 ? 0.66 : n <= 8 ? 0.6 : 0.54; }

// Resting fan slot of card i out of n.
export function handSlot(i, n) {
  const s = handScale(n), cw = CARD_W * s;
  const step = n > 1 ? Math.min(cw, (HAND_SPREAD - cw) / (n - 1)) : 0;
  const off = i - (n - 1) / 2;
  return { x: HAND_CX + off * step, y: HAND_Y + off * off * (n > 6 ? 1.6 : 2.4), rot: off * (n > 6 ? 0.022 : 0.032), s, cw, ch: CARD_H * s, step };
}
// Visible strip of resting card i (the only part that counts for hover): left edge to the next card's left edge.
export function handStrip(i, n) {
  const sl = handSlot(i, n), x0 = sl.x - sl.cw / 2;
  return { x0, x1: i >= n - 1 ? x0 + sl.cw : x0 + sl.step, top: sl.y - sl.ch / 2 - 4, bottom: H };
}

// Slots for a row of enemies (defs in order). Returns [{x, scale, w, h}]
export function enemySlots(defs) {
  const n = defs.length;
  if (!n) return [];
  const gap = n > 3 ? 10 : 22;
  const bs = defs.map((d) => { const b = enemyBounds(d) || { w: 150, h: 170 }; return { w: Math.max(40, b.w), h: Math.max(40, b.h) }; });
  const total = bs.reduce((a, b) => a + b.w, 0) + gap * (n - 1);
  const regionW = ENEMY_REGION.x1 - ENEMY_REGION.x0;
  const maxH = Math.max(...bs.map((b) => b.h));
  const sc = Math.min(1, regionW / total, 300 / maxH);
  const usedW = total * sc;
  let cur = (ENEMY_REGION.x0 + ENEMY_REGION.x1) / 2 - usedW / 2;
  return bs.map((b) => { const w = b.w * sc; const x = cur + w / 2; cur += w + gap * sc; return { x, scale: sc, w, h: b.h * sc }; });
}

export function inRectXY(px, py, x, y, w, h) { return px >= x && px <= x + w && py >= y && py <= y + h; }

// status icon layout: returns [{id, n, x, y}] centred on cx, wrapping within maxW
export function statusSlots(ids, cx, y, maxW, size) {
  const step = size + 6;
  const perRow = Math.max(1, Math.floor((maxW + 6) / step));
  const out = [];
  for (let r = 0; r * perRow < ids.length; r++) {
    const row = ids.slice(r * perRow, (r + 1) * perRow);
    const w = row.length * step - 6;
    row.forEach((id, i) => out.push({ id, x: cx - w / 2 + size / 2 + i * step, y: y + r * (size + 8) + size / 2 }));
  }
  return out;
}
