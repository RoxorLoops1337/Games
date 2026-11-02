// ui_core.js: tiny DOM helpers shared by all menu screens: element builder, canvas icons, live (animated) canvases, modals, toasts.
import * as AE from './art_entities.js';
import * as AW from './art_world.js';
import { RARITY } from './data_core.js';
import { GEAR } from './data_meta.js';
import { HINTS } from './data_story.js';
import { t } from './i18n.js';

// Element.append / replaceChildren turn null and false into the text "null": drop them instead, so conditional children are safe.
if (typeof Element !== 'undefined' && !Element.prototype.__dtbPatched) {
  for (const m of ['append', 'prepend', 'replaceChildren']) {
    const orig = Element.prototype[m];
    Element.prototype[m] = function (...kids) { return orig.apply(this, kids.flat(Infinity).filter((k) => k != null && k !== false)); };
  }
  Element.prototype.__dtbPatched = true;
}

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
  const dpr = typeof window !== 'undefined' && window.devicePixelRatio ? Math.min(3, Math.max(2, Math.ceil(window.devicePixelRatio))) : 2;
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
// An actionable toast: a message plus one button (the language offer). Stays a bit longer, replaces any toast.
export function actionToast(msg, label, fn, ms = 9000) {
  if (toastEl) toastEl.remove();
  const el = h('div', { class: 'toast act' }, h('span', { class: 'toast-msg' }, msg),
    h('button', { class: 'btn small green', onclick: () => { el.remove(); if (toastEl === el) toastEl = null; fn(); } }, label));
  toastEl = el; root.append(el);
  clearTimeout(toastT); toastT = setTimeout(() => { el.remove(); if (toastEl === el) toastEl = null; }, ms);
  return el;
}
// First-time hints in the hub flows. Each id lives in HINTS (data_hints_extra.js) and is shown once per profile (profile.tutorial.hints[id]).
// Rules: at most one hint at a time, at least HINT_GAP_MS between two hints in a session, never over the Setlist sheet except hint_setlist
// itself, and hint_skin_buy only once the first stage is cleared. A hint that may not show now is NOT marked as seen and not kept: the screen
// that asks for it asks again the next time it is shown, so the rest "queue" on later screens. Returns true when the hint will be shown.
export const HINT_GAP_MS = 20000;
let hintNowFn = () => Date.now();
let lastHintEnd = -Infinity, hintBusy = false, hintActive = false;
export function setHintClock(fn) { hintNowFn = fn || (() => Date.now()); }
export function resetHintState() { lastHintEnd = -Infinity; hintBusy = false; hintActive = false; }
const setlistOpen = () => typeof document !== 'undefined' && !!document.querySelector && !!document.querySelector('.setlist');
const firstStageCleared = (p) => !!p.prog && Object.values(p.prog).some((w) => w && w.cleared);
export function hubHint(app, id, done) {
  const p = app.profile;
  if (!HINTS[id] || !p.tutorial.done || p.tutorial.hints[id]) return false;
  if (id === 'hint_skin_buy' && !firstStageCleared(p)) return false;
  if (id !== 'hint_setlist' && setlistOpen()) return false;
  // a hint card that was torn down without closing (screen rebuilt) must not block the hints for good
  if (hintBusy && hintActive && typeof document !== 'undefined' && !document.querySelector('.hint-card')) { hintBusy = false; hintActive = false; lastHintEnd = hintNowFn(); }
  if (hintBusy || hintNowFn() - lastHintEnd < HINT_GAP_MS) return false;
  hintBusy = true;
  p.tutorial.hints[id] = true; app.save();
  setTimeout(() => {
    if (id !== 'hint_setlist' && setlistOpen()) { delete p.tutorial.hints[id]; hintBusy = false; app.save(); if (done) done(); return; }
    hintActive = true;
    const fin = () => { hintActive = false; hintBusy = false; lastHintEnd = hintNowFn(); if (done) done(); };
    if (app.hooks && app.hooks.onHint) app.hooks.onHint(id, fin); else fin();
  }, 450);
  return true;
}
export const rarClass = (r) => 'rar-' + r;
export const rarName = (r) => RARITY[r].name;
export function currencyChip(kind, n) { return h('span', { class: 'chip' }, currencyIcon(kind, 18), String(n)); }
export function btn(label, onClick, cls = '', attrs = {}) { return h('button', Object.assign({ class: 'btn ' + cls, onclick: onClick }, attrs), label); }
export { AE, AW };

// ---- quick mute: one speaker button for the title screen and the pause menu. State lives in profile.settings.muted (applied by app.applySettings
// through AudioFx.mute). The icon shows the state (waves = sound on, a red cross = muted); aria-label and aria-pressed follow it.
export function speakerIcon(muted, px = 30) {
  return canvasOf(px, px, (ctx) => {
    const k = px / 30;
    ctx.save(); ctx.scale(k, k); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = '#2b2733'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(4, 11); ctx.lineTo(10, 11); ctx.lineTo(17, 5); ctx.lineTo(17, 25); ctx.lineTo(10, 19); ctx.lineTo(4, 19); ctx.closePath();
    ctx.fillStyle = muted ? '#b9b2c8' : '#ffc83d'; ctx.fill(); ctx.stroke();
    if (muted) {
      ctx.strokeStyle = '#e8403f'; ctx.lineWidth = 3.6;
      ctx.beginPath(); ctx.moveTo(21, 10); ctx.lineTo(29, 20); ctx.moveTo(29, 10); ctx.lineTo(21, 20); ctx.stroke();
    } else {
      ctx.lineWidth = 2.8;
      ctx.beginPath(); ctx.arc(17, 15, 6, -0.9, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(17, 15, 11, -0.9, 0.9); ctx.stroke();
    }
    ctx.restore();
  });
}
export function muteButton(app, extra) {
  const s = app.profile.settings;
  const b = h('button', { class: 'iconbtn mute-btn', type: 'button', 'data-mute': '' });
  const paint = () => {
    const on = !!s.muted;
    b.replaceChildren(speakerIcon(on, 30));
    b.setAttribute('aria-label', on ? t('audio.unmute', 'Unmute sound') : t('audio.mute', 'Mute sound'));
    b.setAttribute('title', on ? t('audio.unmute', 'Unmute sound') : t('audio.mute', 'Mute sound'));
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.classList.toggle('is-muted', on);
  };
  b.addEventListener('click', () => { s.muted = !s.muted; app.applySettings(); app.save(); paint(); if (!s.muted) app.audio.play('ui_click'); if (extra) extra(); });
  b.addEventListener('pointerdown', (e) => e.stopPropagation());   // on the title screen a tap on this button must not count as TAP TO START
  paint();
  return b;
}
