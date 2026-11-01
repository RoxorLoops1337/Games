// Contextual tips. Other screens call maybeTip(app, key, x, y, text, opts) every frame.
// The first time a key is shown it pulses near (x,y); a click on the bubble dismisses it for good
// (meta.tips[key] = 1, saved through flow.saveMeta()). meta.settings.tips === false switches every tip off.
// Call it LAST in your draw() so the bubble sits on top. Only one tip shows per frame; the first caller wins.
import { COL, W, H, clamp, rgba } from './core.js';

export const TIP_TEXTS = {
  energy: 'Energy pays for cards. You get 3 each turn and it does not carry over. Spend it.',
  intent: 'The icon over an enemy is its next move. A sword is damage, a shield is Block, a flame is a curse. Plan around it.',
  block: 'Block soaks damage this turn, then it is gone. Build it when the sword is coming.',
  endturn: 'End Turn when you are done. Unspent cards stay in your hand only if they Retain.',
  graftpick: 'You never add cards. Pick one of your own cards and one graft to sew onto it.',
  boonprice: 'Every graft has a Boon and a Price. The Boon is the good part. The Price is always paid, so read it.',
  budget: 'Budget is how much Weight your deck carries for free. Each graft weighs 1 to 3.',
  strain: 'Weight over Budget is Strain. Each point Tithes a plain card: it fights at 75 percent. The deck view shows which.',
  overload: 'A third graft is an Overload: numbers x1.5, one extra Weight, and a 25 percent chance to Shatter the card for good.',
  skipping: 'You may skip the graft. Heal 8, gain 1 Budget for good, or take 10 gold. Doing nothing is a plan.',
  forge: 'The Forge heals you, strips a graft, upgrades a card or Expands your Budget. One service per visit.',
  shop: 'Cards, grafts, relics and potions for gold. Removing a card is the cheapest way to improve your deck.',
  resonance: 'Three grafts of one school wake a small bonus. Six wake a larger one. The strip at the bottom of the deck view tracks it.',
  jam: 'Backfire jams grafted cards in your opening hand. A jammed card costs 1 more this turn.',
};

export function tipsActive(meta) {
  return !(meta && meta.settings && meta.settings.tips === false);
}
export function tipSeen(meta, key) { return !!(meta && meta.tips && meta.tips[key]); }
export function dismissTip(app, key) {
  const meta = app.shared.meta; if (!meta) return;
  (meta.tips = meta.tips || {})[key] = 1;
  const f = app.shared.flow; if (f && f.saveMeta) f.saveMeta();
}
export function resetTips(app) {
  const meta = app.shared.meta; if (!meta) return;
  meta.tips = {}; const f = app.shared.flow; if (f && f.saveMeta) f.saveMeta();
}

// o: { side: 'below'|'above'|'left'|'right' (where the bubble sits relative to the point, default 'below'), w: max width (default 270) }
// Returns true while the tip is on screen this frame.
export function maybeTip(app, key, x, y, text, o = {}) {
  const meta = app.shared.meta;
  if (!meta || !tipsActive(meta) || tipSeen(meta, key) || app.blocked) return false;
  if (app._tipFrame === app.frame && app._tipKey !== key) return false; // one tip at a time
  app._tipFrame = app.frame; app._tipKey = key;
  if (text === undefined) text = TIP_TEXTS[key] || '';
  const ctx = app.ctx, side = o.side || 'below', maxW = o.w || 270, pad = 12;
  const lines = app.wrap(text, maxW - pad * 2, 15, { ui: true });
  const bw = Math.min(maxW, Math.max(...lines.map((l) => app.measure(l, 15, { ui: true }))) + pad * 2 + 2);
  const bh = lines.length * 19 + pad * 2 + 18;
  const pulse = (Math.sin(app.t * 4) + 1) / 2, gap = 16 + pulse * 4;
  let bx, by;
  if (side === 'below') { bx = x - bw / 2; by = y + gap; }
  else if (side === 'above') { bx = x - bw / 2; by = y - gap - bh; }
  else if (side === 'left') { bx = x - gap - bw; by = y - bh / 2; }
  else { bx = x + gap; by = y - bh / 2; }
  bx = clamp(bx, 8, W - bw - 8); by = clamp(by, 8, H - bh - 8);
  ctx.save();
  // arrow from the bubble edge to the point
  const ax = clamp(x, bx + 16, bx + bw - 16), ay = clamp(y, by + 16, by + bh - 16);
  ctx.fillStyle = '#2a2116'; ctx.strokeStyle = COL.lamp; ctx.lineWidth = 2;
  ctx.beginPath();
  if (side === 'below') { ctx.moveTo(ax - 9, by); ctx.lineTo(x, y + 2); ctx.lineTo(ax + 9, by); }
  else if (side === 'above') { ctx.moveTo(ax - 9, by + bh); ctx.lineTo(x, y - 2); ctx.lineTo(ax + 9, by + bh); }
  else if (side === 'left') { ctx.moveTo(bx + bw, ay - 9); ctx.lineTo(x - 2, y); ctx.lineTo(bx + bw, ay + 9); }
  else { ctx.moveTo(bx, ay - 9); ctx.lineTo(x + 2, y); ctx.lineTo(bx, ay + 9); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.shadowColor = rgba(COL.lamp, 0.35 + pulse * 0.4); ctx.shadowBlur = 10 + pulse * 10;
  app.rr(bx, by, bw, bh, 10); ctx.fillStyle = '#2a2116'; ctx.fill(); ctx.shadowBlur = 0;
  ctx.lineWidth = 2; ctx.strokeStyle = COL.lamp; ctx.stroke();
  ctx.restore();
  app.text(text, bx + pad, by + pad, { size: 15, ui: true, maxW: maxW - pad * 2, lineH: 19, color: COL.vellum });
  app.text('Click to dismiss', bx + bw - pad, by + bh - 20, { size: 12, ui: true, align: 'right', color: 'rgba(242,193,78,.8)' });
  if (app.inRect(bx, by, bw, bh)) {
    app.cursor = 'pointer';
    if (app.clicked(bx, by, bw, bh)) {
      dismissTip(app, key);
      app.mouse.released = false; app.mouse.pressed = false; // swallow so widgets drawn after this do not also fire
      if (app.shared.audio && app.shared.audio.sfx) app.shared.audio.sfx('uiClick');
    }
  }
  return true;
}
