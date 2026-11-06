// Phone zoom face: the long-press and the tap preview show ONE big card (about 70 percent of the stage height, centred) so the rules text is readable.
// Pure drawing: combat.js decides when (long press = while the finger is down, preview = until the next tap).
import { W, H } from './core.js';
import { drawCard, CARD_W, CARD_H } from '../art/cards.js';

export const ZOOM_FRAC = 0.7;
export const zoomScale = () => (H * ZOOM_FRAC) / CARD_H;
// o: { cost, tithed, jam, mark, hint }
export function drawCardZoom(app, spec, o = {}) {
  const ctx = app.ctx, s = zoomScale(), a = Math.min(1, (app.t - (o.t0 || 0)) * 8);
  ctx.save();
  ctx.fillStyle = `rgba(6,5,4,${0.72 * (o.t0 === undefined ? 1 : a)})`; ctx.fillRect(0, 0, W, H);
  ctx.restore();
  drawCard(ctx, spec, W / 2, H / 2, { scale: s, tithed: o.tithed, jam: o.jam, mark: o.mark, cost: o.cost, glow: 0.4, hover: true });
  app.text(o.hint || 'Release to close', W / 2, H - 22, { size: 14, ui: true, align: 'center', baseline: 'middle', color: 'rgba(232,220,196,.75)', shadow: true });
  if (app.reg) app.reg('card_zoom', W / 2 - CARD_W * s / 2, H / 2 - CARD_H * s / 2, CARD_W * s, CARD_H * s, { layer: 'hud', group: 'zoom', overlay: true });
}
