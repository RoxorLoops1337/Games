// Archive kit: shared drawing + data for the unlock progression UI (ui/archive.js, the end screen panel, the codex, the NEW ribbon).
// Data comes from engine/unlock.js (unlockState, isItemUnlocked, lockedHint); nothing here changes the model.
import { COL } from './core.js';
import { drawCard, drawGraftPatch, drawSchoolGlyph, CARD_H } from '../art/cards.js';
import { drawRelic, drawPotion, drawEventSeal } from '../art/icons.js';
import { CARDS, GRAFTS, RELICS, POTIONS, EVENTS, BUILD_CARDS } from '../data/index.js';
import { UNLOCKS, isUnlocked, isFresh, takeFresh, unlockState } from '../engine/unlock.js';
import { cardSpec } from '../engine/cards.js';
import { lnw } from '../art/linework.js';

// 'build' (Ward building cards) joins when the unlock model gates any
export const KINDS = ['card', 'graft', 'relic', 'potion', 'event', ...(Object.values(UNLOCKS).some((e) => e.kind === 'build') ? ['build'] : [])];
export const KIND_LABEL = { card: 'Cards', graft: 'Grafts', relic: 'Relics', potion: 'Potions', event: 'Events', build: 'Building cards' };
export const KIND_ONE = { card: 'card', graft: 'graft', relic: 'relic', potion: 'potion', event: 'event', build: 'building card' };
const TABLE = { card: CARDS, graft: GRAFTS, relic: RELICS, potion: POTIONS, event: EVENTS, build: BUILD_CARDS };
const RARITY_COL = { common: '#b9ad92', uncommon: '#8fd0a0', rare: '#f2c14e', boss: '#c58bff', shop: '#7fd0e0', start: '#b9ad92' };
export const GOLD = '#f2c14e';

// ---------------------------------------------------------------- data
function itemName(kind, id) { const d = TABLE[kind] && TABLE[kind][id]; return d ? d.name : id; }
// every gateable item of a kind (start items included), with its state for this player
export function itemViews(meta, kind) {
  const out = [];
  for (const e of Object.values(UNLOCKS)) {
    if (e.kind !== kind) continue;
    out.push({ unlockId: e.id, kind, itemId: e.itemId, name: itemName(kind, e.itemId), rarity: e.rarity, hero: e.hero, school: e.school, act: e.act, hint: e.hint, unlocked: e.tier === 'start' || isUnlocked(meta, e.id), start: e.tier === 'start' });
  }
  const R = { common: 0, uncommon: 1, shop: 1.5, rare: 2, boss: 3 };
  out.sort((a, b) => (b.unlocked - a.unlocked) * 0 + (R[a.rarity] || 0) - (R[b.rarity] || 0) || (a.hero || 'z').localeCompare(b.hero || 'z') || a.name.localeCompare(b.name));
  return out;
}
// { card: { got, total }, ... } where got counts start items plus opened ones (the Codex and Archive both read this)
export function categoryCounts(meta) {
  const out = {}; for (const k of KINDS) out[k] = { got: 0, total: 0 };
  for (const e of Object.values(UNLOCKS)) { const c = out[e.kind]; if (!c) continue; c.total++; if (e.tier === 'start' || isUnlocked(meta, e.id)) c.got++; }
  return out;
}
export const percentLabelOf = (st) => (st.done ? 'Archive complete' : `Archive ${st.percent} percent`);
export const percentLabel = (meta) => percentLabelOf(unlockState(meta));
// unlockState walks every unlock, so a screen that only shows it asks once per visit instead of every frame: on its first frame after enter (the screen
// clears `_unl` there), when the stack returns to it (a modal over it closed: Settings can erase the profile) and when the profile object is swapped.
// Nothing changes the unlock model while the title or the Archive is the top screen.
export function unlockOnce(scr, app) {
  const meta = app.shared.meta, top = app.top() === scr, c = scr._unl;
  if (!c || c.meta !== meta || (top && !c.top)) scr._unl = { meta, top, st: unlockState(meta) };
  else c.top = top;
  return scr._unl.st;
}
// the short first sentence of a hint ("A Wick rare card.")
export const shortHint = (h) => String(h || '').split('. ')[0].replace(/\.$/, '') + '.';

// ---------------------------------------------------------------- art
export function drawArt(app, kind, itemId, cx, cy, size, o = {}) {
  const g = app.ctx;
  if (kind === 'build') { const w = size * 0.7; app.rr(cx - w / 2, cy - size / 2, w, size, 5); g.fillStyle = '#221c18'; g.fill(); g.lineWidth = lnw(2); g.strokeStyle = '#7fd0e0'; g.stroke(); g.fillStyle = '#7fd0e0'; g.fillRect(cx - w * 0.3, cy - size * 0.1, w * 0.6, 2); g.fillRect(cx - w * 0.3, cy + size * 0.1, w * 0.4, 2); }
  else if (kind === 'card') { let sp = null; try { sp = cardSpec({ uid: 0, id: itemId, grafts: [], up: 0 }); } catch { sp = null; } if (sp) drawCard(g, sp, cx, cy, { scale: size / CARD_H, alpha: o.alpha === undefined ? 1 : o.alpha }); }
  else if (kind === 'graft') { const d = GRAFTS[itemId]; if (d) drawGraftPatch(g, d, cx - size * 0.75, cy - size * 0.42, size * 1.5, size * 0.84, {}); }
  else if (kind === 'relic') drawRelic(g, itemId, cx, cy, size * 0.9);
  else if (kind === 'potion') drawPotion(g, itemId, cx, cy, size * 0.9);
  else drawEventSeal(g, cx, cy, size * 0.4, true, false);
}
export function padlock(g, x, y, s, col = '#9b8f7a') {
  g.save(); g.translate(x, y); g.scale(s, s); g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 3;
  g.beginPath(); g.arc(0, -4, 6, Math.PI, 0); g.stroke(); g.fillRect(-8, -4, 16, 12); g.restore();
}
// dark engraved silhouette of an item kind with a dashed edge and a lock; size = the box height
export function drawSilhouette(app, kind, cx, cy, size, o = {}) {
  const g = app.ctx, hot = !!o.hot, edge = hot ? 'rgba(232,220,196,.5)' : 'rgba(232,220,196,.2)';
  g.save(); g.fillStyle = hot ? '#1d1815' : '#13100e'; g.strokeStyle = edge; g.lineWidth = lnw(1.6); g.setLineDash([5, 4]);
  if (kind === 'card' || kind === 'build') { const w = size * 0.7, h = size; app.rr(cx - w / 2, cy - h / 2, w, h, 5); }
  else if (kind === 'graft') { const w = size * 1.3, h = size * 0.62; app.rr(cx - w / 2, cy - h / 2, w, h, 4); }
  else if (kind === 'event') { g.beginPath(); g.arc(cx, cy, size * 0.4, 0, 6.283); }
  else if (kind === 'potion') { const w = size * 0.55, h = size * 0.85; app.rr(cx - w / 2, cy - h / 2 + size * 0.06, w, h, size * 0.2); }
  else { g.beginPath(); g.arc(cx, cy, size * 0.42, 0, 6.283); }
  g.fill(); g.stroke(); g.setLineDash([]); g.restore();
  padlock(g, cx, cy + size * 0.02, Math.max(0.35, size / 72), hot ? '#b7aa8c' : '#6d655a');
}
// an unlocked tile for the grid: real art for relic/potion/graft/event, a small tinted card face for cards (150 full cards per frame would be heavy)
export function drawMini(app, view, cx, cy, size, o = {}) {
  const g = app.ctx;
  if (view.kind === 'card') {
    const w = size * 0.7, h = size, col = RARITY_COL[view.rarity] || COL.vellum, sc = view.school && COL[view.school] ? COL[view.school] : col;
    app.rr(cx - w / 2, cy - h / 2, w, h, 5); g.fillStyle = o.hot ? '#2c2420' : '#221c18'; g.fill(); g.lineWidth = lnw(2); g.strokeStyle = col; g.stroke();
    if (view.school) drawSchoolGlyph(g, view.school, cx, cy - h * 0.12, Math.max(4, size * 0.2), sc);
    g.fillStyle = col; g.fillRect(cx - w * 0.3, cy + h * 0.2, w * 0.6, 2); g.fillRect(cx - w * 0.3, cy + h * 0.32, w * 0.4, 2);
  } else drawArt(app, view.kind, view.itemId, cx, cy, size);
}

// ---------------------------------------------------------------- NEW ribbon (once per item)
// A finished run opens items (meta.unlocked.fresh). The first time one is drawn in an offer the ribbon shows, the item leaves the fresh set (saved on the next
// meta save) and stays 'live' while the same screen is open, so it does not blink out under the player's eyes.
let live = new Set(), liveScreen = null, lastFrame = -9;
export function newRibbon(app, itemId, x, y, w, o = {}) {
  const meta = app.shared.meta; if (!meta) return false;
  const scr = app.current || null; if (scr !== liveScreen || app.frame - lastFrame > 2) { live = new Set(); liveScreen = scr; }
  lastFrame = app.frame;
  if (isFresh(meta, itemId)) { takeFresh(meta, itemId); live.add(itemId); }
  if (!live.has(itemId)) return false;
  const g = app.ctx, s = o.size || 11, tw = Math.max(34, app.measure('NEW', s, { ui: true, bold: true }) + 14), th = Math.ceil(app.sz(s, { ui: true, bold: true }) * 1.2) + 4;
  const rx = o.right ? x + w - tw : x;
  g.save(); g.fillStyle = GOLD; g.strokeStyle = '#7a5a12'; g.lineWidth = lnw(1.5);
  g.beginPath(); g.moveTo(rx, y); g.lineTo(rx + tw, y); g.lineTo(rx + tw - 6, y + th / 2); g.lineTo(rx + tw, y + th); g.lineTo(rx, y + th); g.closePath(); g.fill(); g.stroke(); g.restore();
  app.text('NEW', rx + (tw - 6) / 2, y + 2, { size: s, ui: true, bold: true, align: 'center', color: '#2a1d05', fit: { w: tw - 10, lines: 1 } });
  return true;
}
