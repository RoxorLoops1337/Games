// WARDROBE: the Credit shop (flow.openWardrobe(), title menu or the W key). Spend Credit on card backs, hero tints, titles and one
// starting relic, and equip what you own. Credit is paid by the case file at the end of a run (engine/meta2.js).
// Mouse and keyboard: every tile has one action button, arrow keys walk the buttons (ui/core.js), Enter fires, 1-4 or Tab switch
// category, Escape closes. Layout: a modal panel like the Codex, the Pause / Fullscreen zone (top right) stays free.
import { tscale } from './graft_parts.js';
import { COL, W, H, rgba } from './core.js';
import { drawCardBack } from '../art/cards.js';
import { drawPortrait, setHeroTint } from '../art/heroes.js';
import { drawRelic } from '../art/icons.js';
import { RELICS, HEROES } from '../data/index.js';
import * as M from '../engine/meta.js';
import { clampText } from './deckview.js';
import { lnw } from '../art/linework.js';

const CATS = [
  { id: 'back', label: 'Card backs', list: 'backs', cols: 4, prev: 178 },
  { id: 'tint', label: 'Tints', list: 'tints', cols: 4, prev: 160 },
  { id: 'title', label: 'Titles', list: 'titles', cols: 4, prev: 0 },
  { id: 'relic', label: 'Start relic', list: 'relics', cols: 4, prev: 96 },
];
const LOADOUT = { back: 'back', tint: 'tint', title: 'title', relic: 'relic' };

// What can be shown for a category: id, name, cost (null = earned), hint for earned-only items.
export function wardrobeEntries(kind) {
  const earnedBy = (id) => M.ACHIEVEMENTS.find((a) => a.reward && a.reward.kind === kind && a.reward.id === id);
  const mk = (id, name, cost, extra = {}) => { const a = earnedBy(id); return { id, name, cost: cost === undefined ? null : cost, ach: a || null, ...extra }; };
  if (kind === 'back') return M.CARD_BACKS.map((b) => mk(b.id, b.name, b.cost));
  if (kind === 'tint') return M.TINTS.map((t) => mk(t.id, t.name, t.id === 'none' ? 0 : t.cost, { color: t.color }));
  if (kind === 'relic') return [mk(null, 'No starting relic', 0), ...M.START_RELICS.map((r) => mk(r.id, (RELICS[r.id] || {}).name || r.id, r.cost, { text: (RELICS[r.id] || {}).text || '' }))];
  const out = [mk(null, 'No title', 0)], seen = new Set();
  for (const t of M.TITLES) { out.push(mk(t.id, t.name, t.cost)); seen.add(t.id); }
  for (const a of M.ACHIEVEMENTS) if (a.reward && a.reward.kind === 'title' && !seen.has(a.reward.id)) { out.push(mk(a.reward.id, a.reward.name || a.reward.id, null)); seen.add(a.reward.id); }
  return out;
}
const isOwned = (meta, c, e) => e.id === null || meta.cosmetics[c.list].includes(e.id) || (c.id === 'tint' && e.id === 'none');
const isOn = (meta, c, e) => meta.loadout[LOADOUT[c.id]] === e.id;

export default {
  enter(app) {
    this.cat = 0; this.toast = null;
    this.anim = (app.shared.meta && app.shared.meta.settings && app.shared.meta.settings.reducedMotion) ? 1 : 0;
  },
  setCat(i) { this.cat = ((i % CATS.length) + CATS.length) % CATS.length; },
  key(app, e) {
    if (app.top() !== this) return false;
    if (e.key === 'Escape') { app.pop(); return true; }
    if (e.key === 'Tab') { this.setCat(this.cat + (e.shiftKey ? -1 : 1)); return true; }
    if (/^[1-4]$/.test(e.key)) { this.setCat(+e.key - 1); return true; }
    return false;
  },
  draw(app) {
    const ts = app.textScale; app.textScale = Math.min(tscale(app), 1.25);
    try { this.drawAll(app); } finally { app.textScale = ts; }
  },
  act(app, c, e) {
    const meta = app.shared.meta, flow = app.shared.flow, kind = c.id;
    let msg = null;
    if (!isOwned(meta, c, e)) {
      const r = M.buy(meta, kind, e.id);
      if (!r.ok) return;
      M.equip(meta, kind, e.id); msg = `${e.name}: bought and equipped (-${r.cost} Credit)`;
      if (app.shared.audio) app.shared.audio.sfx('gilded', { vol: 0.7 });
    } else if (isOn(meta, c, e)) {
      if (kind === 'title' || kind === 'relic') { M.equip(meta, kind, null); msg = `${e.name}: removed`; }
    } else { M.equip(meta, kind, e.id); msg = `${e.name}: equipped`; }
    if (flow && flow.saveMeta) flow.saveMeta();
    if (msg) this.toast = { msg, t: 2.2 };
  },
  drawAll(app) {
    const ctx = app.ctx, meta = app.shared.meta;
    if (this.anim < 1) this.anim = Math.min(1, this.anim + app.dt / 0.16);
    const k = 1 - Math.pow(1 - this.anim, 3);
    ctx.save(); ctx.fillStyle = `rgba(6,4,3,${0.82 * k})`; ctx.fillRect(0, 0, W, H); ctx.restore();
    ctx.save(); ctx.globalAlpha = k; ctx.translate(0, (1 - k) * 14);
    app.reg('wardrobe-panel', 14, 10, W - 28, H - 20, { overlay: true });
    app.panel(14, 10, W - 28, H - 20, { r: 14, fill: '#1c1714', stroke: 'rgba(232,220,196,.5)', lw: 3 });
    app.text('Wardrobe', 36, 18, { size: 28, bold: true, color: COL.lamp });
    const bal = (meta.credit && meta.credit.bal) || 0;
    app.reg('wardrobe-credit', 230, 14, 210, 40, { group: 'credit' });
    app.rr(230, 14, 210, 40, 8); ctx.fillStyle = 'rgba(10,8,7,.8)'; ctx.fill(); ctx.lineWidth = lnw(1.5); ctx.strokeStyle = rgba(COL.lamp, 0.6); ctx.stroke();
    app.text(`CREDIT  ${bal}`, 335, 22, { size: 22, bold: true, align: 'center', color: COL.lamp, maxW: 194 });
    app.text('Paid by the case file at the end of a run.', 456, 26, { size: 14, ui: true, italic: true, color: 'rgba(232,220,196,.6)', maxW: 600 });
    app.reg('wardrobe-x', 1080, 16, 36, 36, { group: 'x' }); // left of the global Pause / Fullscreen zone
    let closing = false;
    if (app.button('X', 1080, 16, 36, 36, { size: 20, ui: true, r: 18 })) closing = true;
    // categories
    const tw = 200, ty = 62;
    CATS.forEach((c, i) => {
      const on = this.cat === i, owned = wardrobeEntries(c.id).filter((e) => e.id !== null && isOwned(meta, c, e)).length, total = wardrobeEntries(c.id).filter((e) => e.id !== null).length;
      app.reg('wardrobe-cat' + i, 30 + i * (tw + 8), ty, tw, 34, { group: 'cat' + i });
      if (app.button(`${i + 1}  ${c.label} ${owned}/${total}`, 30 + i * (tw + 8), ty, tw, 34, { size: 15, ui: true, fill: on ? '#5a4720' : COL.slab2, stroke: on ? COL.lamp : 'rgba(232,220,196,.4)', color: on ? COL.lamp : COL.vellum, r: 7 })) this.setCat(i);
    });
    const c = CATS[this.cat], entries = wardrobeEntries(c.id);
    this.drawGrid(app, c, entries, 28, 108, W - 56, H - 108 - 18);
    if (this.toast && this.toast.t > 0) { this.toast.t -= app.dt; app.text(this.toast.msg, 640, 72, { size: 15, ui: true, align: 'center', color: COL.lamp, alpha: Math.min(1, this.toast.t), maxW: 380 }); }
    ctx.restore();
    if (closing && app.top() === this) app.pop();
  },
  drawGrid(app, c, entries, x, y, w, h) {
    const ctx = app.ctx, meta = app.shared.meta, gap = 10, cols = c.cols;
    const rows = Math.ceil(entries.length / cols), cw = Math.floor((w - gap * (cols - 1)) / cols);
    const ch = Math.min(c.id === 'title' ? 108 : 290, Math.floor((h - gap * (rows - 1)) / rows));
    const heroId = (app.shared.run && app.shared.run.hero) || 'marrow';
    entries.forEach((e, i) => {
      const tx = x + (i % cols) * (cw + gap), ty = y + Math.floor(i / cols) * (ch + gap);
      const owned = isOwned(meta, c, e), on = isOn(meta, c, e), afford = e.cost !== null && meta.credit.bal >= e.cost;
      app.reg(`wardrobe-${c.id}-${i}`, tx, ty, cw, ch, { group: `tile${i}` });
      app.panel(tx, ty, cw, ch, { r: 10, fill: on ? 'rgba(50,40,18,.92)' : 'rgba(22,18,15,.92)', stroke: on ? COL.lamp : owned ? 'rgba(232,220,196,.45)' : 'rgba(232,220,196,.2)', lw: on ? 2.5 : 1.5 });
      if (c.prev) {
        const pcx = tx + cw / 2, pcy = ty + 12 + c.prev / 2;
        ctx.save(); ctx.beginPath(); ctx.rect(tx + 2, ty + 2, cw - 4, c.prev + 20); ctx.clip();
        if (!owned) ctx.globalAlpha = 0.7;
        if (c.id === 'back') drawCardBack(ctx, pcx, pcy, { scale: (c.prev - 6) / 310, back: e.id, t: 1.2 });
        else if (c.id === 'tint') { setHeroTint(e.color); try { drawPortrait(ctx, heroId in HEROES ? heroId : 'marrow', pcx, pcy, c.prev - 16); } finally { setHeroTint(M.tintColor(meta)); } }
        else if (e.id) drawRelic(ctx, e.id, pcx, pcy, 64);
        else { ctx.font = '38px serif'; ctx.fillStyle = 'rgba(232,220,196,.25)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('-', pcx, pcy); }
        ctx.restore();
      }
      let yy = ty + 12 + (c.prev ? c.prev + 12 : 0);
      app.text(e.name, tx + 14, yy, { size: 18, bold: true, color: owned ? COL.vellum : 'rgba(232,220,196,.7)', maxW: cw - 28 });
      yy += 24;
      if (e.text && c.id === 'relic') { app.text(clampText(app, e.text, cw - 28, 13, 2, { ui: true }), tx + 14, yy - 2, { size: 13, ui: true, maxW: cw - 28, lineH: 15, color: 'rgba(232,220,196,.75)' }); yy += 32; }
      const state = on ? 'Equipped' : owned ? 'Owned' : e.cost === null ? (e.ach ? `Earn: ${e.ach.name}` : 'Earned in play') : `${e.cost} Credit`;
      app.text(state, tx + 14, yy, { size: 14, ui: true, color: on ? COL.lamp : owned ? COL.good : e.cost !== null && !afford ? COL.scar : 'rgba(232,220,196,.7)', maxW: cw - 28 });
      const lab = !owned ? (e.cost === null ? 'Locked' : afford ? `Buy  ${e.cost}` : `Need ${e.cost}`) : on ? (c.id === 'title' || c.id === 'relic' ? 'Remove' : 'Equipped') : 'Equip';
      const dis = (!owned && (e.cost === null || !afford)) || (on && (c.id === 'back' || c.id === 'tint'));
      const bh = 32, by = ty + ch - bh - 10;
      if (app.inRect(tx, ty, cw, ch)) app.tooltip(e.name, e.ach ? `${e.ach.text}${owned ? '' : ' Earned by this record.'}` : e.text || (e.cost === null ? 'Earned in play.' : 'Costs Credit.'), { color: COL.lamp, gloss: [e.ach ? e.ach.text : '', e.text || ''] });
      if (app.button(lab, tx + 12, by, cw - 24, bh, { size: 15, ui: true, r: 7, disabled: dis, fill: !owned && afford ? '#4a3a1d' : undefined, stroke: !owned && afford ? COL.lamp : undefined })) this.act(app, c, e);
    });
  },
};
