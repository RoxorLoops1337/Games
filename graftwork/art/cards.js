// STUB: the art team replaces this. Contract is fixed.
//   CARD_W/CARD_H logical card size. drawCard draws a full card face CENTERED at (x,y).
//   o: { scale=1, rot=0, tithed, jam, cost (effective cost to show: number|'X'), glow 0..1, selected, dim 0..1, alpha, hover, preview }
import { COL } from '../ui/core.js';
import { cardLines } from '../engine/text.js';
export const CARD_W = 220, CARD_H = 310;
export function drawSchoolGlyph(ctx, school, x, y, r, color) { ctx.save(); ctx.fillStyle = color || COL[school] || '#fff'; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); ctx.restore(); }
export function drawCard(ctx, spec, x, y, o = {}) {
  const s = o.scale || 1;
  ctx.save(); ctx.translate(x, y); ctx.rotate(o.rot || 0); ctx.scale(s, s); if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  ctx.fillStyle = COL[spec.type] || '#444'; ctx.fillRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H);
  ctx.fillStyle = COL.vellum; ctx.fillRect(-CARD_W / 2 + 8, -CARD_H / 2 + 8, CARD_W - 16, CARD_H - 16);
  ctx.fillStyle = COL.ink; ctx.font = 'bold 18px Georgia'; ctx.textAlign = 'center'; ctx.fillText(spec.name, 0, -CARD_H / 2 + 34);
  ctx.font = '14px Georgia'; cardLines(spec, o.tithed).forEach((l, i) => ctx.fillText(l, 0, 40 + i * 18));
  ctx.fillText(String(o.cost === undefined ? spec.cost : o.cost), -CARD_W / 2 + 22, -CARD_H / 2 + 30);
  ctx.restore();
}
export function drawCardBack(ctx, x, y, o = {}) { ctx.save(); ctx.translate(x, y); ctx.scale(o.scale || 1, o.scale || 1); ctx.fillStyle = '#3a2f28'; ctx.fillRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H); ctx.restore(); }
// A stitched graft patch tile (offers, shop, deck view). Drawn with its top-left at (x,y).
export function drawGraftPatch(ctx, graft, x, y, w, h, o = {}) { ctx.save(); ctx.fillStyle = COL[graft.school] || '#888'; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#000'; ctx.font = '16px Georgia'; ctx.fillText(graft.name, x + 8, y + 24); ctx.restore(); }
