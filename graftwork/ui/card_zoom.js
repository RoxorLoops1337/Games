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

// ---- phone info card: touch cannot hover, so a truncated description opens as one readable card. Tap anywhere to close.
// A screen draws a chip beside truncated text (infoChip), opens the card when it is tapped, and calls drawInfoCard LAST in draw().
// While open, infoOpen() is true: the screen treats itself as blocked so the closing tap never reaches a button underneath.
const INFO = { on: false, title: '', text: '', color: '#F2C14E', f0: 0, t0: 0 };
export const infoOpen = () => INFO.on;
export const infoClose = () => { INFO.on = false; };
export const touchUi = (app) => !!(app.mouse && app.mouse.touch) || app.scale < 0.95;
export function openInfoCard(app, title, text, color) { Object.assign(INFO, { on: true, title: String(title || ''), text: String(text || ''), color: color || '#F2C14E', f0: app.frame, t0: app.t }); }
// The small 'i' chip. Returns true on the frame it is tapped (the tap is consumed). Pass `also` rects (tap targets for the truncated text itself).
export function infoChip(app, x, y, also = []) {
  const ctx = app.ctx, r = 11;
  ctx.save(); ctx.fillStyle = 'rgba(14,12,10,.85)'; ctx.strokeStyle = '#F2C14E'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); ctx.stroke(); ctx.restore();
  app.text('i', x, y + 1, { size: 14, bold: true, ui: true, align: 'center', baseline: 'middle', color: '#F2C14E' });
  if (app.reg) app.reg('info_chip', x - r, y - r, r * 2, r * 2, { layer: 'hud' });
  let hit = app.clicked(x - r - 3, y - r - 3, r * 2 + 6, r * 2 + 6);
  for (const a of also) if (!hit && app.clicked(a.x, a.y, a.w, a.h)) hit = true;
  return hit;
}
// Draws and services the open card. Returns true while it is open.
export function drawInfoCard(app) {
  if (!INFO.on) return false;
  const ctx = app.ctx, a = Math.min(1, (app.t - INFO.t0) * 10), pw = 620, pad = 22;
  const lines = String(INFO.text).split('\n').flatMap((p) => app.wrap(p, pw - pad * 2, 20, { ui: true }));
  const lh = Math.round(26 * app.sz(20, { ui: true }) / 20), th = Math.round(34 * app.sz(26, { bold: true }) / 26);
  const ph = Math.min(H - 60, pad * 2 + th + lines.length * lh + 34), px = (W - pw) / 2, py = (H - ph) / 2;
  ctx.save(); ctx.fillStyle = `rgba(6,5,4,${0.72 * a})`; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = a;
  ctx.fillStyle = '#2a2116'; ctx.strokeStyle = INFO.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 14); ctx.fill(); ctx.stroke(); ctx.restore();
  app.text(INFO.title, W / 2, py + pad, { size: 26, bold: true, ui: true, align: 'center', color: INFO.color, shadow: true, maxW: pw - pad * 2 });
  lines.forEach((ln, i) => app.text(ln, px + pad, py + pad + th + i * lh, { size: 20, ui: true, color: '#E8DCC4' }));
  app.text('Tap to close', W / 2, py + ph - 24, { size: 14, ui: true, align: 'center', baseline: 'middle', color: 'rgba(232,220,196,.6)' });
  if (app.reg) app.reg('info_card', px, py, pw, ph, { layer: 'hud', group: 'zoom', overlay: true });
  if (app.frame > INFO.f0 + 1 && app.mouse.released) { app.mouse.released = false; INFO.on = false; }
  return true;
}
