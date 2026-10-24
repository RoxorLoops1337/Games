// ui_core.js: tiny DOM helpers shared by all menu screens: element builder, canvas icons, live (animated) canvases, modals, toasts.
import * as AE from './art_entities.js';
import * as AW from './art_world.js';
import { TURRETS, RARITY, COL } from './data_core.js';
import { GEAR } from './data_meta.js';

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// ---- canvases that draw once (icons) or every frame (live)
const live = [];
export function canvasOf(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  const dpr = 2;
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  c.style.width = w + 'px'; c.style.height = h + 'px';
  const ctx = c.getContext('2d');
  const run = (t) => { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h); draw(ctx, t || 0, w, h); };
  try { run(0); } catch (e) { /* art errors must never break the menu */ }
  if (opts.live) live.push({ c, run });
  return c;
}
export function tickLive(t) {
  for (let i = live.length - 1; i >= 0; i--) {
    const L = live[i];
    if (!L.c.isConnected) { if (L.c.__seen) live.splice(i, 1); continue; }
    L.c.__seen = true;
    try { L.run(t); } catch (e) { /* ignore */ }
  }
  if (live.length > 200) live.splice(0, live.length - 200);
}
export function icon(name, px = 26, color) { return canvasOf(px, px, (ctx) => AE.drawGlyph(ctx, name, px / 2, px / 2, px, color)); }
export function turretIcon(type, px = 52) { return canvasOf(px, px, (ctx) => AE.drawTurretIconFlat(ctx, type, px / 2, px / 2, px * 0.92)); }
export function turretLive(type, level, px = 72) { return canvasOf(px, px, (ctx, t) => AE.drawTurret(ctx, type, level, px / 2, px / 2, { t, ang: -0.6 + Math.sin(t) * 0.5, scale: px / 72 }), { live: true }); }
export function gearIcon(item, px = 64) {
  const tpl = GEAR[item.tpl];
  return canvasOf(px, px, (ctx, t) => {
    AE.drawRarityFrame(ctx, item.rarity, px / 2, px / 2, px - 6, px - 6, t);
    AE.drawGear(ctx, tpl.slot, item.tpl, item.rarity, px / 2, px / 2, px * 0.62);
  }, { live: item.rarity === 'legendary' || item.rarity === 'mythic' });
}
export function enemyIcon(type, px = 70, boss = false) {
  return canvasOf(px, px, (ctx, t) => {
    if (boss) AE.drawBoss(ctx, type, px / 2, px / 2 + 4, { t, scale: px / 110, hp: 1 });
    else AE.drawEnemy(ctx, type, px / 2, px / 2 + 2, { t, scale: Math.min(1.6, px / 44), hp: 1 });
  }, { live: true });
}
export function currencyIcon(kind, px = 26) { return icon(kind === 'coins' ? 'coin' : kind === 'diamonds' ? 'diamond' : kind === 'records' ? 'record' : 'fans', px); }

// ---- modal and toast. `root` is the #ui element.
let root = null;
export function setRoot(el) { root = el; }
export function modal(content, o = {}) {
  const bg = h('div', { class: 'modal-bg', style: o.noBlur ? '' : '' });
  const box = h('div', { class: 'modal' + (o.wide ? ' wide' : '') }, content);
  bg.append(box);
  const api = { el: bg, box, close() { bg.remove(); if (o.onClose) o.onClose(); } };
  if (!o.sticky) bg.addEventListener('pointerdown', (e) => { if (e.target === bg) api.close(); });
  (o.parent || root).append(bg);
  return api;
}
let toastEl = null, toastT = 0;
export function toast(msg, ms = 2200) {
  if (toastEl) toastEl.remove();
  toastEl = h('div', { class: 'toast' }, msg);
  root.append(toastEl);
  clearTimeout(toastT); toastT = setTimeout(() => { if (toastEl) toastEl.remove(); toastEl = null; }, ms);
}
export const rarClass = (r) => 'rar-' + r;
export const rarName = (r) => RARITY[r].name;
export function currencyChip(kind, n) { return h('span', { class: 'chip' }, currencyIcon(kind, 18), String(n)); }
export function btn(label, onClick, cls = '', attrs = {}) { return h('button', Object.assign({ class: 'btn ' + cls, onclick: onClick }, attrs), label); }
export { AE, AW };
