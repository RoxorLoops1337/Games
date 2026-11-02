// ui_core.js: tiny DOM helpers shared by all menu screens: element builder, canvas icons, live (animated) canvases, modals, toasts.
import * as AE from './art_entities.js';
import * as AW from './art_world.js';
import { RARITY } from './data_core.js';
import { GEAR } from './data_meta.js';
import { HINTS } from './data_story.js';
import { t } from './i18n.js';
import { focusables, labelDialog } from './a11y.js';
export { focusables, labelDialog };

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
  // a click handler on a plain element (card, chip, stone) makes it a real button for the keyboard and screen readers: focusable, role=button, Enter and Space click it
  if (attrs && typeof attrs.onclick === 'function' && !NATIVE_CLICKABLE.has(tag)) {
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
    el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); el.click(); } });
  }
  return el;
}
const NATIVE_CLICKABLE = new Set(['button', 'a', 'input', 'select', 'textarea', 'summary', 'label']);

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
// Accessibility (round 6): every modal is role=dialog + aria-modal, labelled by its first heading, moves focus inside when it opens, traps Tab,
// closes on Esc when closing is allowed (not for `sticky` modals unless o.escClose) and gives focus back to the opener when it closes.
let root = null;
export function setRoot(el) { root = el; }
const modalStack = [];          // open modal apis, oldest first
export const openModals = () => modalStack.slice();
// find the element again when the opener was rebuilt while the modal was open (the hub re-renders): same tag, aria-label and text
function refind(sig) {
  if (!sig || !root) return null;
  for (const el of root.querySelectorAll(sig.tag)) if (matches(el, sig)) return el;
  return null;
}
const sigOf = (el) => (el && el.tagName ? { tag: el.tagName.toLowerCase(), id: el.id || '', cls: el.className, label: el.getAttribute('aria-label') || '', text: (el.textContent || '').trim() } : null);
// Re-render a container and keep keyboard focus: the focused control is found again by tag, class, aria-label and text (the nth match when
// several look the same). Used by the hub, which rebuilds its tabs and panel after every tap.
export function keepFocus(container, fn) {
  const act = typeof document !== 'undefined' ? document.activeElement : null;
  let sig = null, nth = 0;
  if (act && act !== document.body && container.contains(act)) {
    sig = sigOf(act);
    for (const el of container.querySelectorAll(sig.tag)) { if (el === act) break; if (matches(el, sig)) nth++; }
  }
  fn();
  if (!sig) return;
  let k = 0;
  for (const el of container.querySelectorAll(sig.tag)) if (matches(el, sig)) { if (k++ === nth) { try { el.focus({ preventScroll: true }); } catch (e) { /* ignore */ } return; } }
}
const matches = (el, sig) => sig.id ? el.id === sig.id : el.className === sig.cls && (el.getAttribute('aria-label') || '') === sig.label && (el.textContent || '').trim() === sig.text;
export function modal(content, o = {}) {
  const bg = h('div', { class: 'modal-bg', style: o.noBlur ? '' : '' });
  const box = h('div', { class: 'modal' + (o.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', tabindex: '-1' }, content);
  bg.append(box);
  const opener = typeof document !== 'undefined' ? document.activeElement : null;
  const sig = sigOf(opener && opener !== document.body ? opener : null);
  let closed = false;
  const api = {
    el: bg, box, escClose: o.escClose != null ? !!o.escClose : !o.sticky,
    close() {
      if (closed) return; closed = true;
      const i = modalStack.indexOf(api); if (i >= 0) modalStack.splice(i, 1);
      const had = bg.contains(typeof document !== 'undefined' ? document.activeElement : null);
      bg.remove();
      if (had || (typeof document !== 'undefined' && (!document.activeElement || document.activeElement === document.body))) {
        const back = opener && opener.isConnected ? opener : refind(sig);
        if (back && back.focus && !modalStack.length) { try { back.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
        else if (modalStack.length) { const top = modalStack[modalStack.length - 1]; const f = focusables(top.box)[0]; if (f) f.focus({ preventScroll: true }); }
      }
      if (o.onClose) o.onClose();
    },
  };
  if (!o.sticky) bg.addEventListener('pointerdown', (e) => { if (e.target === bg) api.close(); });
  (o.parent || root).append(bg);
  modalStack.push(api);
  labelDialog(box);
  // focus moves inside: the first control (or the dialog itself when it has none)
  if (o.focus !== false) { const f = focusables(box)[0] || box; try { f.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  return api;
}
// Tab trap and Esc for the topmost modal (one listener for the whole page, installed once)
if (typeof document !== 'undefined' && !document.__dtbModalKeys) {
  document.__dtbModalKeys = true;
  document.addEventListener('keydown', (e) => {
    const top = modalStack[modalStack.length - 1];
    if (!top) return;
    if (!top.el.isConnected) { modalStack.splice(modalStack.indexOf(top), 1); return; }
    labelDialog(top.box);
    if (e.key === 'Escape') {
      if (top.escClose) { e.preventDefault(); e.stopPropagation(); top.close(); }
      return;
    }
    if (e.key !== 'Tab') return;
    const list = focusables(top.box), act = document.activeElement;
    if (!list.length) { e.preventDefault(); top.box.focus(); return; }
    const i = list.indexOf(act);
    if (i < 0) { e.preventDefault(); list[e.shiftKey ? list.length - 1 : 0].focus(); }
    else if (e.shiftKey && i === 0) { e.preventDefault(); list[list.length - 1].focus(); }
    else if (!e.shiftKey && i === list.length - 1) { e.preventDefault(); list[0].focus(); }
  }, true);
}
// Toasts: a persistent polite live region OUTSIDE #ui (screens replace #ui's children) carries the text for screen readers; the visible toast is
// hidden from them so nothing is read twice. An action toast keeps its button reachable, only its message is mirrored.
let toastEl = null, toastT = 0, liveEl = null;
function announce(msg) {
  if (typeof document === 'undefined' || !document.body) return;
  if (!liveEl || !liveEl.isConnected) {
    liveEl = h('div', { id: 'dtb-live', class: 'toast-live', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    liveEl.style.cssText = 'position:fixed;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;left:0;top:0;pointer-events:none';
    document.body.append(liveEl);
  }
  liveEl.textContent = '';
  setTimeout(() => { if (liveEl) liveEl.textContent = String(msg); }, 30);
}
export function toast(msg, ms = 2200) {
  if (toastEl) toastEl.remove();
  toastEl = h('div', { class: 'toast', 'aria-hidden': 'true' }, msg);
  root.append(toastEl);
  announce(msg);
  clearTimeout(toastT); toastT = setTimeout(() => { if (toastEl) toastEl.remove(); toastEl = null; }, ms);
}
// An actionable toast: a message plus one button (the language offer). Stays a bit longer, replaces any toast.
export function actionToast(msg, label, fn, ms = 9000) {
  if (toastEl) toastEl.remove();
  const el = h('div', { class: 'toast act' }, h('span', { class: 'toast-msg', 'aria-hidden': 'true' }, msg),
    h('button', { class: 'btn small green', onclick: () => { el.remove(); if (toastEl === el) toastEl = null; fn(); } }, label));
  toastEl = el; root.append(el);
  announce(msg);
  clearTimeout(toastT); toastT = setTimeout(() => { el.remove(); if (toastEl === el) toastEl = null; }, ms);
  return el;
}

// ---- Modal queue (round 6). Several things want to open a blocking modal when the hub shows (Welcome back, Daily Gig, What's new, a first-time
// hint, a friend invite ...). They go through ONE queue: one blocking modal at a time, MODAL_GAP_MS between two, lower priority number first
// (ties: first come first served), nothing opens during a battle or cutscene (default: only on the hub; o.screens overrides), and a modal that
// is closed or torn down always starts the next. `open(done)` must open the modal and call `done()` once when it closes (or at once when it
// decided not to show anything). A foreign modal that is already open (Settings, a crate opening) holds the queue unless o.over is set.
export const MODAL_PRIO = { invite: 10, welcome: 20, royalties: 25, daily: 30, whatsnew: 40, lang: 45, hint: 50 };
export const MODAL_GAP_MS = 350, MODAL_RETRY_MS = 300, MODAL_OPEN_GRACE_MS = 800;
const qEnv = {
  setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (id) => clearTimeout(id), now: () => Date.now(),
  screen: () => 'hub',
  modalOpen: () => typeof document !== 'undefined' && !!document.querySelector && !!document.querySelector('.modal-bg'),
};
export function setModalEnv(o) { Object.assign(qEnv, o || {}); }
const mq = { list: [], active: null, timer: null, lastEnd: -Infinity, seq: 0 };
export function resetModalQueue() { if (mq.timer != null) qEnv.clearTimeout(mq.timer); mq.list = []; mq.active = null; mq.timer = null; mq.lastEnd = -Infinity; }
export const modalQueueState = () => ({ queued: mq.list.map((x) => x.id), active: mq.active ? mq.active.id : null });
function qSchedule(ms) { if (mq.timer != null) qEnv.clearTimeout(mq.timer); mq.timer = qEnv.setTimeout(qStep, ms); }
function qRelease(item) {
  if (mq.active !== item) return;
  mq.active = null; mq.lastEnd = qEnv.now();
  if (mq.list.length) qSchedule(MODAL_GAP_MS);
}
function qStep() {
  mq.timer = null;
  const now = qEnv.now();
  if (mq.active) {
    const a = mq.active;
    // watchdog: the screen was rebuilt and the modal vanished without closing
    if (a.blocking && a.modal && now - a.since > MODAL_OPEN_GRACE_MS && !qEnv.modalOpen()) { qRelease(a); return; }
    qSchedule(MODAL_RETRY_MS); return;
  }
  if (!mq.list.length) return;
  const scr = qEnv.screen();
  const ready = mq.list.filter((x) => x.screens.includes(scr) && x.at <= now);
  if (!ready.length) { qSchedule(MODAL_RETRY_MS); return; }
  ready.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
  const item = ready[0];
  const wait = MODAL_GAP_MS - (now - mq.lastEnd);
  if (wait > 0) { qSchedule(wait); return; }
  if (!item.over && qEnv.modalOpen()) { qSchedule(MODAL_RETRY_MS); return; }
  mq.list.splice(mq.list.indexOf(item), 1);
  item.since = now; mq.active = item;
  const done = () => qRelease(item);
  try { item.open(done); } catch (e) { qRelease(item); return; }
  if (mq.active === item) qSchedule(MODAL_RETRY_MS);
}
// queueModal(id, priority, open, o?)  o: { screens: ['hub'], over: false, delay: 0 (ms), modal: true (false for a toast: the queue then relies on done()) }
// Returns false when an item with the same id is already queued or open.
export function queueModal(id, priority, open, o = {}) {
  if (mq.list.some((x) => x.id === id) || (mq.active && mq.active.id === id)) return false;
  mq.list.push({ id, priority, open, seq: mq.seq++, screens: o.screens || ['hub'], over: !!o.over, blocking: true, modal: o.modal !== false, at: qEnv.now() + (o.delay || 0), since: 0 });
  if (mq.timer == null && !mq.active) qSchedule(0);
  return true;
}
// is a queued or open item of this id around? (the hints use it so the same hint is not queued twice)
export const modalQueued = (id) => mq.list.some((x) => x.id === id) || !!(mq.active && mq.active.id === id);

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
    // the hint joins the modal queue (lowest priority): it waits for any Welcome back, Daily Gig or What's new that is still to come
    queueModal('hint:' + id, MODAL_PRIO.hint, (release) => {
      if (id !== 'hint_setlist' && setlistOpen()) { delete p.tutorial.hints[id]; hintBusy = false; app.save(); release(); if (done) done(); return; }
      hintActive = true;
      const fin = () => { hintActive = false; hintBusy = false; lastHintEnd = hintNowFn(); release(); if (done) done(); };
      if (app.hooks && app.hooks.onHint) app.hooks.onHint(id, fin); else fin();
    }, { over: id === 'hint_setlist' });
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
