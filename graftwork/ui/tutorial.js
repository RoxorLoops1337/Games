// Contextual tips. Other screens call maybeTip(app, key, x, y, text, opts) every frame.
// The first time a key is shown it pulses near (x,y); a click on its Got it button dismisses it (the rest of the bubble is click-through) for good
// (meta.tips[key] = 1, saved through flow.saveMeta()). meta.settings.tips === false switches every tip off.
// Call it LAST in your draw() so the bubble sits on top. Only one tip shows per frame; the first caller wins.
import { COL, W, H, clamp, rgba } from './core.js';
import { lnw } from '../art/linework.js';

export const TIP_TEXTS = {
  energy: 'Energy pays for cards. You get 3 a turn. Unspent Energy is lost.',
  intent: 'The icon over an enemy is its next move. Sword: damage. Shield: Block. Flame: a curse. Plan around it. Small icons under its health are statuses: hover them.',
  block: 'Block soaks damage this turn, then it is gone. Raise it when the sword is coming.',
  endturn: 'End Turn when done. Cards you did not play are discarded unless they Retain.',
  graftpick: 'You never add cards. Pick one of your own cards and sew one graft onto it.',
  boonprice: 'Every graft has a Boon and a Price. The Price is always paid. Read it.',
  budget: 'Budget is how much graft Weight (1 to 3 each) your deck carries for free. Go over it and you take Strain: weaker cards.',
  strain: 'Weight over Budget is Strain. Each point Tithes one ungrafted (Bare) card: it fights at 75 percent this fight. The deck view shows which.',
  overload: 'A third graft is an Overload: numbers x1.5, +1 Weight, and a 25 percent chance to Shatter the card for good.',
  skipping: 'You may skip the graft: heal 8, gain 1 Budget for good, or take 10 gold.',
  forge: 'The Forge heals, strips a graft, upgrades a card or Expands your Budget. One service per visit.',
  shop: 'Cards, grafts, relics and potions for gold. Removing a card is the cheapest upgrade.',
  resonance: 'Three grafts of one school wake a small bonus. Six wake a larger one. The strip in the deck view tracks it.',
  thread_chain: 'Two cards of one school tie a knot. Keep sharing a school to grow the Line, up to 5 knots.',
  thread_cut: 'A card of another school Cuts the Line and cashes it in. A longer Line pays more. Hover Line, Stitch or Cut for the rule.',
  claim: 'Claim: the Matron takes your most grafted card for the fight, at -25% like a Tithe. Tempering a card makes it immune.',
  ringing: 'Ringing is a junk card: unplayable, and it fades if unplayed. Some grafts and bosses shuffle it into your deck.',
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

// o: { pos: {x, y} fixed top-left corner of the bubble (use a quiet corner so it never covers what it teaches about), side: 'below'|'above'|'left'|'right' (where the bubble sits relative to the point, default 'below'), w: max width (default 270) }
// Returns true while the tip is on screen this frame.
export function maybeTip(app, key, x, y, text, o = {}) {
  const meta = app.shared.meta;
  if (!meta || !tipsActive(meta) || tipSeen(meta, key) || app.blocked) return false;
  if (app._tipFrame === app.frame && app._tipKey !== key) return false; // one tip at a time
  app._tipFrame = app.frame; app._tipKey = key;
  if (text === undefined) text = TIP_TEXTS[key] || '';
  // o.fallback: { pos, w, maxBottom }: used instead when the wrapped bubble would not fit between o.pos.y and o.maxBottom (small screens inflate the text)
  const fitB = o.fitBottom !== undefined ? o.fitBottom : o.maxBottom;
  if (o.fallback && o.pos && fitB !== undefined) {
    const mw = o.w || 270, ls = app.wrap(text, mw - 24, 15, { ui: true }), need = ls.length * Math.round(19 * app.sz(15, { ui: true }) / 15) + 24 + Math.max(24, Math.round(app.sz(14, { ui: true }) * 1.7)) + 4;
    if (o.pos.y + need > fitB) { const fb = o.fallback; return maybeTip(app, key, x, y, text, { ...o, ...fb, fallback: null }); }
  }
  const ctx = app.ctx, side = o.side || 'below', maxW = o.w || 270, pad = 12;
  const lines = app.wrap(text, maxW - pad * 2, 15, { ui: true });
  const bw = Math.min(maxW, Math.max(...lines.map((l) => app.measure(l, 15, { ui: true }))) + pad * 2 + 2);
  const lh = Math.round(19 * app.sz(15, { ui: true }) / 15), btnH = Math.max(24, Math.round(app.sz(14, { ui: true }) * 1.7));
  const bh = lines.length * lh + pad * 2 + btnH + 4; // real wrapped height incl. the small-screen text boost
  const pulse = (Math.sin(app.t * 4) + 1) / 2, gap = 16 + pulse * 4;
  let bx, by;
  if (side === 'below') { bx = x - bw / 2; by = y + gap; }
  else if (side === 'above') { bx = x - bw / 2; by = y - gap - bh; }
  else if (side === 'left') { bx = x - gap - bw; by = y - bh / 2; }
  else { bx = x + gap; by = y - bh / 2; }
  if (o.pos) { bx = o.pos.x; by = o.pos.y; } // o.pos: fixed top-left spot in a quiet corner, the arrow still reaches (x, y)
  bx = clamp(bx, 8, W - bw - 8); by = clamp(by, 8, H - bh - 8);
  // o.maxBottom keeps the bubble clear of the hero plate, the Thread rail and the hand (the arrow just reaches further).
  if (o.maxBottom !== undefined && by + bh > o.maxBottom) by = Math.max(8, o.maxBottom - bh);
  // o.avoid: rects (enemy name, move and intent plates) the bubble must never cover: slide it below them, else left of them.
  for (const r of o.avoid || []) {
    if (bx < r.x + r.w && bx + bw > r.x && by < r.y + r.h && by + bh > r.y) {
      const lim = o.maxBottom !== undefined ? o.maxBottom : H - 8;
      if (r.y + r.h + 8 + bh <= lim) by = r.y + r.h + 8; else if (r.x - bw - 8 >= 8) bx = r.x - bw - 8; else by = Math.max(8, lim - bh);
    }
  }
  // The bubble never eats clicks: only the small Got it button does, so cards, End Turn and the rail stay playable under it.
  const dbw = Math.max(78, Math.round(app.measure('Got it', 14, { ui: true, bold: true }) + 28)), dbh = btnH, dbx = bx + bw - pad - dbw + 4, dby = by + bh - dbh - 8;
  const inside = x >= bx && x <= bx + bw && y >= by && y <= by + bh;
  ctx.save();
  ctx.fillStyle = '#2a2116'; ctx.strokeStyle = COL.lamp; ctx.lineWidth = lnw(2);
  const ex = clamp(x, bx + 16, bx + bw - 16), ey = clamp(y, by + 16, by + bh - 16);
  if (!inside) {
    // arrow from the nearest bubble edge to the point; a long reach is a thin line with a head so it hides little
    const fromTop = y < by, fromBot = y > by + bh, fromL = x < bx, fromR = x > bx + bw;
    const sx = fromL ? bx : fromR ? bx + bw : ex, sy = fromTop ? by : fromBot ? by + bh : ey;
    const dist = Math.hypot(x - sx, y - sy);
    if (dist > 60) {
      const ang = Math.atan2(y - sy, x - sx), hx = x - Math.cos(ang) * 10, hy = y - Math.sin(ang) * 10;
      ctx.globalAlpha = 0.85; ctx.setLineDash && ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hy); ctx.stroke(); ctx.setLineDash && ctx.setLineDash([]);
      ctx.fillStyle = COL.lamp; ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(hx - Math.sin(ang) * 7, hy + Math.cos(ang) * 7); ctx.lineTo(hx + Math.sin(ang) * 7, hy - Math.cos(ang) * 7);
      ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; ctx.fillStyle = '#2a2116';
    } else {
      ctx.beginPath();
      if (fromBot) { ctx.moveTo(ex - 9, by + bh); ctx.lineTo(x, y - 2); ctx.lineTo(ex + 9, by + bh); }
      else if (fromTop) { ctx.moveTo(ex - 9, by); ctx.lineTo(x, y + 2); ctx.lineTo(ex + 9, by); }
      else if (fromR) { ctx.moveTo(bx + bw, ey - 9); ctx.lineTo(x - 2, y); ctx.lineTo(bx + bw, ey + 9); }
      else { ctx.moveTo(bx, ey - 9); ctx.lineTo(x + 2, y); ctx.lineTo(bx, ey + 9); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
  ctx.shadowColor = rgba(COL.lamp, 0.35 + pulse * 0.4); ctx.shadowBlur = 10 + pulse * 10;
  app.rr(bx, by, bw, bh, 10); ctx.fillStyle = '#2a2116'; ctx.fill(); ctx.shadowBlur = 0;
  ctx.lineWidth = lnw(2); ctx.strokeStyle = COL.lamp; ctx.stroke();
  ctx.restore();
  app.text(text, bx + pad, by + pad, { size: 15, ui: true, maxW: maxW - pad * 2, lineH: 19, color: COL.vellum });
  const hot = app.inRect(dbx, dby, dbw, dbh);
  ctx.save(); app.rr(dbx, dby, dbw, dbh, 8); ctx.fillStyle = hot ? '#7a5410' : '#3a2f1a'; ctx.fill(); ctx.lineWidth = lnw(1.5); ctx.strokeStyle = COL.lamp; ctx.stroke(); ctx.restore();
  app.text('Got it', dbx + dbw / 2, dby + dbh / 2, { size: 14, ui: true, bold: true, align: 'center', baseline: 'middle', color: COL.vellum });
  app._tipBtn = { x: dbx, y: dby, w: dbw, h: dbh }; // for tests and tooling
  app._tipBox = { x: bx, y: by, w: bw, h: bh };
  if (hot) {
    app.cursor = 'pointer';
    if (app.clicked(dbx, dby, dbw, dbh)) {
      dismissTip(app, key);
      app.mouse.released = false; app.mouse.pressed = false; // swallow so widgets drawn after this do not also fire
      if (app.shared.audio && app.shared.audio.sfx) app.shared.audio.sfx('uiClick');
    }
  }
  return true;
}

// The Thread lesson: two one-time callouts driven by the seam events (ui/seam_ui.js calls threadLesson from onSeamEvent).
// 'thread_chain' waits for the first extend that makes a Line of 2+; 'thread_cut' for the first cut that pays.
// Both are stored in meta.tips like every other tip, so they show once, and a click skips them for good.
// A player who already dismissed the old single 'thread' tip is treated as having seen the chain lesson.
export const THREAD_LESSONS = ['thread_chain', 'thread_cut'];
export function threadLesson(app, ev) {
  const meta = app.shared && app.shared.meta;
  if (!meta || !tipsActive(meta)) return null;
  let key = null;
  if (ev.t === 'seamExtend' && (ev.len | 0) >= 2) key = 'thread_chain';
  else if (ev.t === 'seamCut' && (ev.paid | 0) > 0) key = 'thread_cut';
  if (!key || tipSeen(meta, key)) return null;
  if (key === 'thread_chain' && tipSeen(meta, 'thread')) return null;
  return key;
}
export function skipThreadLesson(app) { for (const k of THREAD_LESSONS) dismissTip(app, k); }
