// UI juice: sounds, haptics, ripples, toasts, floaters, rolling counters, curved fly-to particles, confetti.
// Everything animates with transform and opacity only (Web Animations API), and every piece cleans up after itself.
import { Audio } from '../audio.js';
import { icon } from '../icons.js';
import { S, $, esc, store, clamp } from './state.js';

export const reduced = () => document.documentElement.dataset.reduce === '1';
export function initReduce() {
  const saved = store.get('reduce', null); let mq = false; try { mq = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* old browser */ }
  setReduced(saved === null ? mq : !!saved, false);
}
export function setReduced(on, save = true) { document.documentElement.dataset.reduce = on ? '1' : '0'; if (save) store.set('reduce', !!on); }

// ---------- sound and touch ----------
export const snd = (n, o) => { try { return Audio.sfx(n, o); } catch { return false; } };
export const ui = (n) => { try { Audio.ui(n); } catch { /* audio is optional */ } };
export const haptic = (ms = 10) => { try { if (S.haptics !== false && navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(ms); } catch { /* unsupported */ } };
export const panAt = (x) => { try { return Audio.panFor(x, S.view ? S.view.look.x : 0); } catch { return 0; } };

// ---------- WAAPI helpers ----------
const anim = (el, kf, opt) => { try { return el.animate(kf, opt); } catch { return null; } };
export const BOUNCE = 'cubic-bezier(.3,1.6,.6,1)';
export function pulse(el, k = 1.25, ms = 380) { if (!el || reduced()) return; anim(el, [{ transform: 'scale(1)' }, { transform: `scale(${k})`, offset: 0.35 }, { transform: 'scale(1)' }], { duration: ms, easing: BOUNCE }); }
export function shake(el, ms = 420) { if (!el) return; el.classList.add('hot'); setTimeout(() => el.classList.remove('hot'), ms + 200); if (!reduced()) anim(el, [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }], { duration: ms, easing: 'ease-out' }); }
export function wobble(el) { if (!el || reduced()) return; anim(el, [{ transform: 'rotate(0)' }, { transform: 'rotate(-14deg)' }, { transform: 'rotate(11deg)' }, { transform: 'rotate(-7deg)' }, { transform: 'rotate(0)' }], { duration: 600, easing: 'ease-out' }); }

// ---------- ripple, press sound, disabled-with-a-reason ----------
let ripOn = false;
export function installPress() {
  if (ripOn) return; ripOn = true;
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest && e.target.closest('button, .tap'); if (!b || b.disabled) return;
    if (reduced() || b.classList.contains('norip')) return;
    let w = b.querySelector(':scope > .rw'); if (!w) { w = document.createElement('span'); w.className = 'rw'; b.appendChild(w); }
    const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 1.6, i = document.createElement('i'); i.className = 'rip';
    i.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`; w.appendChild(i);
    const a = anim(i, [{ transform: 'scale(.1)', opacity: 0.55 }, { transform: 'scale(1)', opacity: 0 }], { duration: 520, easing: 'ease-out' });
    if (a) a.onfinish = () => i.remove(); else setTimeout(() => i.remove(), 540);
  }, true);
  let lastHover = null;
  document.addEventListener('pointerover', (e) => { if (e.pointerType !== 'mouse') return; const b = e.target.closest && e.target.closest('button, .tap'); if (b && b !== lastHover && !b.classList.contains('off') && !b.disabled) { lastHover = b; ui('hover'); } else if (!b) lastHover = null; }, true);
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button, .tap'); if (!b) return;
    const off = b.closest('.off');
    if (off) { e.stopImmediatePropagation(); e.preventDefault(); const why = off.dataset.why; if (why) toast(why, { type: 'warn', icon: 'info', key: 'why' }); ui('deny'); haptic([14, 40, 14]); shake(off);
      for (const g of (off.dataset.short || '').split(',')) { if (!g) continue; const chip = g === 'coins' ? document.getElementById('pCoins') : document.querySelector(`.gp[data-g="${g}"]`) || (g === 'scrolls' ? document.getElementById('pScrolls') : null); if (chip) shake(chip); }
      return; }
    const s = b.dataset.snd; if (s !== 'none') ui(s || 'tap'); haptic(b.dataset.hap ? +b.dataset.hap : 9);
  }, true);
}

// ---------- toasts: speech bubbles with a queue, grouping and tap to dismiss ----------
const live = new Map(); const pending = []; const MAX_VIS = 3;
export function toast(text, o = {}) {
  const host = $('#toasts'); if (!host) return;
  const key = o.key; const hit = key && live.get(key);
  if (hit && hit.el.isConnected) {
    hit.count++; hit.total += o.n || 0;
    hit.tx.innerHTML = esc(o.group ? o.group(hit.total, hit.count) : text); if (o.group) { hit.badge.textContent = '×' + hit.count; hit.badge.hidden = false; }
    pulse(hit.el, 1.08, 300); clearTimeout(hit.timer); hit.timer = setTimeout(() => drop(hit), o.ms || 3000); return;
  }
  if (host.children.length >= MAX_VIS) { pending.push([text, o]); if (pending.length > 6) pending.shift(); return; }
  const el = document.createElement('div'); el.className = 't tb t-' + (o.type || 'info');
  el.innerHTML = `${o.icon ? `<span class="ti">${icon(o.icon, 22)}</span>` : ''}<span class="tx">${esc(text)}</span><b class="tc" hidden></b>`;
  const rec = { el, tx: el.querySelector('.tx'), badge: el.querySelector('.tc'), count: 1, total: o.n || 0, timer: 0, key };
  el.onclick = () => { if (o.click) { try { o.click(); } catch { /* ignore */ } } drop(rec, true); }; host.appendChild(el); if (key) live.set(key, rec);
  rec.timer = setTimeout(() => drop(rec), o.ms || 3000);
  if (o.sound !== false) { const s = o.sound || (o.type === 'bad' ? 'error' : o.type === 'warn' ? 'warn' : 'toast'); snd(s, { vol: 0.8 }); }
}
function drop(rec, fast) {
  clearTimeout(rec.timer); if (rec.key && live.get(rec.key) === rec) live.delete(rec.key);
  const el = rec.el; if (!el.isConnected || el.dataset.dying) return; el.dataset.dying = '1';
  const a = reduced() ? null : anim(el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-10px) scale(.9)' }], { duration: fast ? 140 : 260, easing: 'ease-in' });
  const done = () => { el.remove(); const n = pending.shift(); if (n) toast(n[0], n[1]); };
  if (a) a.onfinish = done; else done();
}
/** "+5 wood", then "+10 wood x2" when the same thing keeps happening */
export function toastGain(key, n, label, ic) { toast(`+${n} ${label}`, { key: 'g_' + key, n, icon: ic, type: 'good', sound: false, ms: 2200, group: (t) => `+${t} ${label}` }); }

// ---------- floaters (+N) ----------
export function floatAt(x, y, html, cls = '') {
  const layer = $('#fxl'); if (!layer) return; const d = document.createElement('div'); d.className = 'fl ' + cls; d.innerHTML = html; d.style.left = x + 'px'; d.style.top = y + 'px'; layer.appendChild(d);
  const a = reduced() ? null : anim(d, [{ transform: 'translate(-50%,6px) scale(.5)', opacity: 0 }, { transform: 'translate(-50%,-8px) scale(1.18)', opacity: 1, offset: 0.18 }, { transform: 'translate(-50%,-14px) scale(1)', opacity: 1, offset: 0.5 }, { transform: 'translate(-50%,-48px) scale(1)', opacity: 0 }], { duration: 1200, easing: 'ease-out' });
  if (a) a.onfinish = () => d.remove(); else setTimeout(() => d.remove(), 1200);
}
export function floatOver(el, html, cls = '') { if (!el) return; const r = el.getBoundingClientRect(); floatAt(r.left + r.width / 2, r.top + 4, html, cls); }

// ---------- rolling counters ----------
const rolling = new Set(); let rafId = 0;
const ease = (t) => 1 - Math.pow(1 - t, 3);
function tick(now) {
  for (const r of rolling) {
    const t = Math.min(1, (now - r.t0) / r.dur), v = r.from + (r.to - r.from) * ease(t);
    const s = r.fmt(Math.round(v)); if (s !== r.last) { r.last = s; r.el.textContent = s; }
    if (t >= 1) rolling.delete(r);
  }
  rafId = rolling.size ? requestAnimationFrame(tick) : 0;
}
/** show `to` in el, ticking from the previous value with an eased roll and a pop. Returns the delta. */
export function roll(el, to, fmtFn = String, o = {}) {
  const from = el._shown === undefined ? to : el._shown; el._shown = to; const delta = to - from;
  for (const r of rolling) if (r.el === el) rolling.delete(r);
  if (delta === 0 || reduced() || o.instant) { el.textContent = fmtFn(to); return delta; }
  rolling.add({ el, from, to, t0: performance.now(), dur: clamp(380 + Math.log10(Math.abs(delta) + 1) * 220, 380, 1100), fmt: fmtFn, last: '' });
  if (!rafId) rafId = requestAnimationFrame(tick);
  if (o.pop !== false && delta > 0) pulse(el.closest('.gp, .pill') || el, 1.18, 420);
  return delta;
}

// ---------- fly-to: icons travel along a curve to a HUD element with a sparkle trail ----------
let flying = 0;
function pointOf(t) { if (!t) return { x: innerWidth / 2, y: 60 }; if (t.getBoundingClientRect) { const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; } return t; }
export function flyTo(from, target, o = {}) {
  const layer = $('#fxl'); if (!layer || !from) return; const n = Math.min(o.n || 5, 9), size = o.size || 26, ic = o.icon || 'coins';
  const e = pointOf(target);
  for (let i = 0; i < n; i++) {
    if (flying > 60) break; flying++;
    const s = { x: from.x + (Math.random() - 0.5) * 36, y: from.y + (Math.random() - 0.5) * 24 };
    const side = Math.random() < 0.5 ? -1 : 1, mx = (s.x + e.x) / 2 + side * (50 + Math.random() * 70), my = (s.y + e.y) / 2 - 60 - Math.random() * 60;
    const el = document.createElement('div'); el.className = 'fly'; el.innerHTML = icon(ic, size); layer.appendChild(el);
    const kf = []; const N = 14;
    for (let k = 0; k <= N; k++) { const u = k / N, a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u; const x = a * s.x + b * mx + c * e.x, y = a * s.y + b * my + c * e.y; kf.push({ transform: `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%) scale(${(0.5 + Math.sin(u * Math.PI) * 0.75 - u * 0.2).toFixed(2)}) rotate(${(u * 260 * side).toFixed(0)}deg)`, opacity: u > 0.93 ? 0.4 : 1, offset: u }); }
    const delay = (o.delay || 0) + i * 75, dur = o.dur || 950;
    if (reduced()) { el.remove(); flying--; if (i === 0 && o.onArrive) o.onArrive(); continue; }
    const a = anim(el, kf, { duration: dur, delay, easing: 'cubic-bezier(.4,.1,.5,1)', fill: 'both' });
    const fin = () => { el.remove(); flying--; if (o.onArrive) o.onArrive(i); };
    if (a) a.onfinish = fin; else setTimeout(fin, dur + delay);
    if (n <= 6 && flying < 40) for (let k = 1; k <= 3; k++) {
      const u = k * 0.2 + 0.04, a2 = (1 - u) * (1 - u), b2 = 2 * (1 - u) * u, c2 = u * u; const x = a2 * s.x + b2 * mx + c2 * e.x, y = a2 * s.y + b2 * my + c2 * e.y;
      const sp = document.createElement('i'); sp.className = 'spk'; sp.style.cssText = `left:${x}px;top:${y}px;color:${o.trail || '#ffd54a'}`; layer.appendChild(sp);
      const t = anim(sp, [{ transform: 'translate(-50%,-50%) scale(0)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.2) rotate(40deg)', opacity: 1, offset: 0.3 }, { transform: 'translate(-50%,-50%) scale(0) rotate(90deg)', opacity: 0 }], { duration: 520, delay: delay + dur * u, fill: 'both' });
      if (t) t.onfinish = () => sp.remove(); else setTimeout(() => sp.remove(), delay + dur + 520);
    }
  }
}
/** star sparkles bursting from a point */
export function sparkAt(x, y, n = 8, colors = ['#ffd54a', '#fff', '#ff9db3', '#8fd3f4']) {
  const layer = $('#fxl'); if (!layer || reduced()) return;
  for (let i = 0; i < n; i++) {
    const sp = document.createElement('i'); sp.className = 'spk'; sp.style.cssText = `left:${x}px;top:${y}px;color:${colors[i % colors.length]};width:${8 + Math.random() * 8}px;height:${8 + Math.random() * 8}px`; layer.appendChild(sp);
    const a = Math.random() * 6.283, d = 24 + Math.random() * 46;
    const t = anim(sp, [{ transform: 'translate(-50%,-50%) scale(0)', opacity: 1 }, { transform: `translate(${Math.cos(a) * d - 8}px,${Math.sin(a) * d - 8}px) scale(1.2) rotate(120deg)`, opacity: 1, offset: 0.5 }, { transform: `translate(${Math.cos(a) * d * 1.3}px,${Math.sin(a) * d * 1.3 + 12}px) scale(0) rotate(240deg)`, opacity: 0 }], { duration: 700 + Math.random() * 300, easing: 'ease-out' });
    if (t) t.onfinish = () => sp.remove(); else setTimeout(() => sp.remove(), 1000);
  }
}

// ---------- confetti on a canvas (one rAF loop while particles live) ----------
let cv = null, cx = null, parts = [], craf = 0, clast = 0;
function ensureCanvas() {
  if (cv) return true; cv = $('#confetti'); if (!cv) return false; cx = cv.getContext('2d'); const fit = () => { cv.width = innerWidth; cv.height = innerHeight; }; fit(); addEventListener('resize', fit); return true;
}
const CONF = ['#ff7f9f', '#ffd54a', '#8fdc6a', '#8fd3f4', '#cdbbff', '#ffb03a', '#ffffff'];
export function confetti(x, y, n = 70, o = {}) {
  if (!ensureCanvas()) return; if (reduced()) n = Math.round(n / 4); const power = o.power || 1, up = o.up === undefined ? 1 : o.up;
  for (let i = 0; i < n && parts.length < 220; i++) {
    const a = (o.cone ? -Math.PI / 2 + (Math.random() - 0.5) * o.cone : Math.random() * Math.PI * 2), v = (240 + Math.random() * 520) * power;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * (a < 0 ? up : 0.8) - (o.lift || 120), r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 14, w: 6 + Math.random() * 7, h: 4 + Math.random() * 6, c: (o.colors || CONF)[i % (o.colors || CONF).length], life: 1.6 + Math.random() * 1.2, circle: Math.random() < 0.25 });
  }
  if (!craf) { clast = performance.now(); craf = requestAnimationFrame(cstep); }
}
function cstep(now) {
  const dt = Math.min(0.05, (now - clast) / 1000); clast = now; cx.clearRect(0, 0, cv.width, cv.height);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life -= dt; if (p.life <= 0 || p.y > cv.height + 30) { parts.splice(i, 1); continue; }
    p.vy += 900 * dt; p.vx *= 1 - 1.3 * dt; p.vy *= 1 - 0.6 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
    cx.globalAlpha = Math.min(1, p.life * 1.5); cx.fillStyle = p.c; cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r);
    if (p.circle) { cx.beginPath(); cx.arc(0, 0, p.w / 2.2, 0, 6.283); cx.fill(); } else cx.fillRect(-p.w / 2, -p.h / 2 * Math.abs(Math.cos(p.r * 1.7)), p.w, p.h * Math.abs(Math.cos(p.r * 1.7)) + 1);
    cx.restore();
  }
  cx.globalAlpha = 1; craf = parts.length ? requestAnimationFrame(cstep) : (cx.clearRect(0, 0, cv.width, cv.height), 0);
}
