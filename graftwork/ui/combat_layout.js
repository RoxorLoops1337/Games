// Combat screen layout: pure geometry, no state. 1280x720 logical canvas.
import { CARD_W, CARD_H } from '../art/cards.js';
import { enemyBounds } from '../art/enemies.js';

export const W = 1280, H = 720;
export const HERO_X = 260, FOOT_Y = 458;
export const BAR_H = 56;
export const PLAY_LINE = 420;
export const DRAW_POS = { x: 74, y: 673 }, DISC_POS = { x: 1206, y: 673 }, EXH_POS = { x: 1120, y: 682 };
export const PILE_S = 0.3, EXH_S = 0.2;
export const ORB = { x: 84, y: 578, size: 88 };
export const STRAIN_BOX = { x: 14, y: 466, w: 128, h: 44 };
// Hero plate (hp bar, block, statuses) sits right of the strain box and ends above the resting hand (y 516).
// h 64: hp bar, then one 28 px status row with the status names under the icons (<= 3 statuses); the nearest resting card top is y ~529.
export const HERO_PLATE = { x: 150, y: 464, w: 220, h: 64 };
// Hero tips (statuses, hp, block) fill this band on the empty wall above the hero, never the Thread rail or the hand below it.
export const HERO_TIP_BAND = { x: 16, y: 76, bottom: 440, dir: 1 };
// Enemy lane (x 500..1252, y 70..400): nameplate+move y70..104, intent 104..134, art above the foot, hp bar + status rows below it.
export const ENEMY_FOOT = 356, ENEMY_ART_H = 195, ENEMY_SLOT_MIN = 110, ENEMY_LANE_TOP = 70;
export const END_BTN = { x: 1086, y: 546, w: 172, h: 54 };
export const SEAM = { x: 380, y: 468, w: 696, h: 50 }; // the thread rail (ui/seam_ui.js): right of the hero plate, above the hand, left of End Turn
export const HAND_CX = 600, HAND_Y = 642, HAND_SPREAD = 900; // spec 622/940 widened away from END TURN (x1086); y keeps resting tops under the Thread rail (y518)
export const HAND_GAP = 20;                       // extra air between small-hand cards (n <= 6)
export const HOVER_S = 0.92;                      // desktop hover: lifted full face, sized so the lifted card stays below the enemy lane (top >= HOVER_TOP)
export const HOVER_TOP = 420;                     // the lifted card never reaches above this y (enemy hp bars end ~ y400)
export const HOVER_Y = H - (CARD_H * HOVER_S) / 2 - 6;
export const SEL_Y = 470, SEL_S = 1.18;           // desktop selected (click-to-play)
export const PREVIEW_Y = 400, PREVIEW_S = 1.0;    // touch tap preview
export const PLAY_BTN = { w: 120, h: 52 }, CANCEL_BTN = 44;
export const AIM_LINE = PLAY_LINE - 40, ARM_Y = 400, DISARM_Y = 440;
export const ENEMY_REGION = { x0: 470, x1: 1262 };
export const GOLD_POS = { x: 300, y: 28 };
export const DECK_BTN = { x: 1020, y: 9, w: 108, h: 38 };
// Top-right x 1128..1272 y 0..56 is RESERVED for the global Pause and Fullscreen buttons: nothing of ours may enter it.
export const RESERVED_TR = { x: 1128, y: 0, w: 144, h: 56 };
export const POTION0 = { x: 372, y: 9, size: 38, step: 44, max: 132 };
export const RELIC0 = { x: 530, y: 28, x1: 930, size: 28, show: 9, step: 38 };
export const TURN_POS = { x: 975, y: 15 };

// UX_SPEC 1: n<=4 .72, 5-6 .66, 7-8 .60, 9-10 .54. Spread 940 centred on 622, step = min(cw, (940 - cw) / (n - 1)).
export function handScale(n) { return n <= 4 ? 0.72 : n <= 6 ? 0.66 : n <= 8 ? 0.6 : 0.54; }

// Resting fan slot of card i out of n.
export function handSlot(i, n) {
  const s = handScale(n), cw = CARD_W * s;
  // Small hands fan with a small GAP so each name strip clears the next card's cost orb; big hands squeeze (then hover lifts the full face).
  const step = n > 1 ? Math.min(cw + (n <= 6 ? HAND_GAP : 0), (HAND_SPREAD - cw) / (n - 1)) : 0;
  const off = i - (n - 1) / 2;
  return { x: HAND_CX + off * step, y: HAND_Y + off * off * (n > 6 ? 1.6 : 2.4), rot: off * (n > 6 ? 0.022 : 0.032), s, cw, ch: CARD_H * s, step };
}
// Visible strip of resting card i (the only part that counts for hover): left edge to the next card's left edge.
export function handStrip(i, n) {
  const sl = handSlot(i, n), x0 = sl.x - sl.cw / 2;
  return { x0, x1: i >= n - 1 ? x0 + sl.cw : x0 + sl.step, top: sl.y - sl.ch / 2 - 4, bottom: H };
}

// Slots for the enemy lane (defs in order). Returns [{x, scale, w, h, sw}]; sw = slot width (>= 110) the HUD may use, slots never overlap.
export function enemySlots(defs, spriteBox) {
  const n = defs.length;
  if (!n) return [];
  const gap = n > 3 ? 10 : 40;
  const bs = defs.map((d) => { const b = (spriteBox && spriteBox(d)) || enemyBounds(d) || { w: 150, h: 170 }; return { w: Math.max(40, b.w), h: Math.max(40, b.h) }; });
  const regionW = ENEMY_REGION.x1 - ENEMY_REGION.x0;
  const maxH = Math.max(...bs.map((b) => b.h));
  // Art height budget: a lone enemy or a duo stands big (bosses and elites bigger still), 3+ keep the clear 195 lane.
  // painted figures: a lone normal stands a little smaller than an elite, a boss the biggest (their layout boxes already carry the kind scale)
  const tallest = Math.max(...defs.map((d) => (spriteBox && spriteBox(d) ? (d.kind === 'boss' ? 0.94 : d.kind === 'elite' ? 0.94 : 0.86) : d.kind === 'boss' ? 0.94 : 1)));
  const budget = n === 1 ? 212 : n === 2 ? 206 : n === 3 ? 200 : ENEMY_ART_H;
  let sc = Math.min(2.1, (budget * tallest) / maxH);
  const widths = (k) => bs.map((b) => Math.max(ENEMY_SLOT_MIN, b.w * k + 34));
  const total = (k) => widths(k).reduce((a, w) => a + w, 0) + gap * (n - 1);
  while (total(sc) > regionW && sc > 0.5) sc -= 0.02;
  sc = Math.max(0.5, sc);
  let ws = widths(sc);
  const tot = ws.reduce((a, w) => a + w, 0) + gap * (n - 1);
  if (tot > regionW) ws = ws.map((w) => w * (regionW - gap * (n - 1)) / (tot - gap * (n - 1))); // squeeze slots, never the min below ~100
  let cur = (ENEMY_REGION.x0 + ENEMY_REGION.x1) / 2 - (ws.reduce((a, w) => a + w, 0) + gap * (n - 1)) / 2;
  return bs.map((b, i) => { const x = cur + ws[i] / 2; cur += ws[i] + gap; return { x, scale: sc, w: b.w * sc, h: b.h * sc, sw: ws[i] }; });
}

export function inRectXY(px, py, x, y, w, h) { return px >= x && px <= x + w && py >= y && py <= y + h; }

