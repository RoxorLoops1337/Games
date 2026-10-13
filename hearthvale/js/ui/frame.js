// The one sheet that every panel lives in: springs open from its button, dims the backdrop, swipe down to close,
// tabs with a sliding indicator, staggered entrance, and a diffed body so a tap never lands on a rebuilt button.
import { icon } from '../icons.js';
import { S, $, $$, esc } from './state.js';
import { ui, reduced, BOUNCE, haptic } from './fx.js';

const screens = {};
export const register = (def) => { screens[def.id] = def; };
export const screenDef = (id) => screens[id];
let ind = null, cur = null, el = null, body = null, head = null, tabsEl = null, scrim = null, pressed = false, shownKey = '', closeTimer = 0;

export const current = () => cur;
export const isOpen = (id) => !!cur && (!id || cur.def.id === id);
export const curParams = () => (cur ? cur.p : null);

export function initFrame() {
  el = $('#sheet'); body = $('.sh-body', el); head = $('.sh-head', el); tabsEl = $('.sh-tabs', el); scrim = $('#scrim');
  scrim.addEventListener('click', () => close());
  $('.x', el).innerHTML = icon('close', 20); $('.x', el).addEventListener('click', () => { ui('close'); close(); });
  el.addEventListener('pointerdown', () => { pressed = true; });
  for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, () => { if (!pressed) return; pressed = false; setTimeout(() => render(false), 40); });
  body.addEventListener('click', (e) => { const a = e.target.closest('[data-a]'); if (!a || !cur || !cur.def.act) return; try { cur.def.act(a.dataset.a, a, S, cur.p, api, e); } catch (err) { console.error('act', err); } });
  tabsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b && cur) setTab(b.dataset.tab); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && cur) { close(); e.stopPropagation(); } }, true);
  ind = document.createElement('i'); ind.className = 'ind';
  initDrag();
  setInterval(tickCountdowns, 500);
}

/** open a registered screen. `from` is the element the panel springs out of. */
export function open(id, p = {}, from = null) {
  const def = screens[id]; if (!def) return false;
  clearTimeout(closeTimer);
  const wasOpen = !!cur && !el.hidden;
  const same = wasOpen && cur.def.id === id;
  if (same && p.toggle) { close(); return false; }
  cur = { def, p: { ...p }, tab: p.tab || (def.tabs ? (def.defaultTab || def.tabs(S, p)[0].id) : null) };
  if (def.onOpen) { try { def.onOpen(S, cur.p); } catch (e) { console.error(e); } }
  el.hidden = false; el.dataset.screen = id; el.className = 'sheet' + (def.wide ? ' wide' : '') + (def.modal ? ' modal' : ' soft') + (def.tall ? ' tall' : '') + ' op';
  scrim.hidden = !def.modal; scrim.classList.toggle('on', !!def.modal); document.body.classList.toggle('sheet-modal', !!def.modal); document.body.classList.add('sheet-open');
  shownKey = ''; body.dataset.h = ''; tabsEl.dataset.h = ''; head.dataset.h = '';
  render(true, !same);
  if (!same || !wasOpen) animateIn(from);
  ui(same ? 'tab' : 'open');
  return true;
}
function animateIn(from) {
  if (reduced()) return; let ox = '50%', oy = '100%';
  if (from && from.getBoundingClientRect) { const r = el.getBoundingClientRect(), f = from.getBoundingClientRect(); ox = (f.left + f.width / 2 - r.left) + 'px'; oy = (f.top + f.height / 2 - r.top) + 'px'; }
  el.style.transformOrigin = `${ox} ${oy}`;
  try { el.animate([{ transform: 'scale(.55) translateY(40px)', opacity: 0 }, { transform: 'scale(1.03) translateY(-4px)', opacity: 1, offset: 0.65 }, { transform: 'none', opacity: 1 }], { duration: 440, easing: BOUNCE }); } catch { /* old browser */ }
  if (S.view && !document.body.classList.contains('lowfx')) { /* backdrop dim is CSS */ }
}
export function close(silent = false) {
  if (!cur) return; const def = cur.def; cur = null; pressed = false;
  if (def.onClose) { try { def.onClose(S); } catch (e) { console.error(e); } }
  scrim.classList.remove('on'); document.body.classList.remove('sheet-modal', 'sheet-open');
  if (!silent) ui('close');
  if (reduced() || silent) { el.hidden = true; scrim.hidden = true; return; }
  el.classList.add('closing');
  try { el.animate([{ transform: el.style.transform || 'none', opacity: 1 }, { transform: 'translateY(60px) scale(.92)', opacity: 0 }], { duration: 190, easing: 'ease-in' }); } catch { /* ignore */ }
  clearTimeout(closeTimer); closeTimer = setTimeout(() => { if (!cur) { el.hidden = true; scrim.hidden = true; el.classList.remove('closing'); el.style.transform = ''; } }, 190);
}
export function setTab(id) {
  if (!cur || cur.tab === id) return; const tabs = cur.def.tabs ? cur.def.tabs(S, cur.p) : []; const ni = tabs.findIndex((t) => t.id === id), oi = tabs.findIndex((t) => t.id === cur.tab);
  cur.tab = id; if (cur.def.onTab) cur.def.onTab(S, cur.p, id); body.scrollTop = 0; render(true, true); ui('tab');
  if (!reduced()) { try { body.animate([{ transform: `translateX(${ni > oi ? 26 : -26}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,.9,.3,1)' }); } catch { /* ignore */ } }
}
export function refresh() { render(false); }

const api = { open, close, setTab, rerender: () => render(true), refresh };
export const frameApi = api;

function render(force, stagger) {
  if (!cur || !S.you) return; if (pressed && !force) return;
  const def = cur.def;
  let html = '';
  try { html = def.render(S, cur.p, cur.tab, api) || ''; } catch (e) { console.error('screen render', def.id, e); html = '<p class="small" style="padding:12px">Oops, something went wrong here. Try again in a moment.</p>'; }
  // header
  try {
    const title = typeof def.title === 'function' ? def.title(S, cur.p) : def.title || '', sub = def.sub ? def.sub(S, cur.p) : '', ic = def.icon ? (typeof def.icon === 'function' ? def.icon(S, cur.p) : def.icon) : '';
    const hh = title + '|' + sub + '|' + ic;
    if (head.dataset.h !== hh) { head.dataset.h = hh; $('.sh-ic', head).innerHTML = ic ? (ic.startsWith('<') ? ic : icon(ic, 34)) : ''; $('.sh-title', head).innerHTML = title; $('.sh-sub', head).innerHTML = sub; }
    const tabs = def.tabs ? def.tabs(S, cur.p) : null;
    if (tabs) {
      const th = JSON.stringify(tabs) + cur.tab;
      if (tabsEl.dataset.h !== th) {
        const first = !tabsEl.dataset.h || tabsEl.dataset.on === cur.tab; tabsEl.dataset.h = th; tabsEl.dataset.on = cur.tab; tabsEl.hidden = false;
        tabsEl.innerHTML = tabs.map((t) => `<button class="tab${t.id === cur.tab ? ' on' : ''}" data-tab="${t.id}" data-snd="none">${t.icon ? icon(t.icon, 20) : ''}<span>${esc(t.label)}</span>${t.pip ? `<i class="pip">${t.pip === true ? '' : t.pip}</i>` : ''}</button>`).join('');
        tabsEl.prepend(ind); placeInd(first);
      }
    } else { tabsEl.hidden = true; tabsEl.dataset.h = ''; }
  } catch (e) { console.error(e); }
  // body
  if (!force && def.keepFocus && body.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') { if (def.live) def.live(body, S); return; }
  if (!force && body.dataset.h === html) return;
  const keep = body.scrollTop, inner = {}; $$('[data-keep]', body).forEach((n) => { inner[n.dataset.keep] = [n.scrollTop, n.scrollLeft]; });
  body.dataset.h = html; body.innerHTML = html; body.scrollTop = keep; $$('[data-keep]', body).forEach((n) => { const v = inner[n.dataset.keep]; if (v) { n.scrollTop = v[0]; n.scrollLeft = v[1]; } });
  if (stagger !== false && (stagger || shownKey !== def.id + cur.tab)) {
    shownKey = def.id + cur.tab;
    if (!reduced()) { body.classList.add('stag'); Array.from(body.children).slice(0, 16).forEach((c, i) => c.style.setProperty('--i', i)); setTimeout(() => body.classList.remove('stag'), 900); }
  }
  try { if (def.bind) def.bind(body, S, cur.p, cur.tab, api); } catch (e) { console.error('screen bind', def.id, e); }
  tickCountdowns();
}
function placeInd(instant) {
  const on = $('.tab.on', tabsEl); if (!on || !ind) return;
  const x = on.offsetLeft, w = on.offsetWidth; if (instant) ind.style.transition = 'none';
  ind.style.width = w + 'px'; ind.style.transform = `translateX(${x}px)`; if (instant) { void ind.offsetWidth; ind.style.transition = ''; }
}

/** `<span class="cd" data-t="worldSeconds">` and `<span class="cdms" data-at="epochMs">` tick without rebuilding the panel */
function tickCountdowns() {
  if (!S.snap) return; const nowT = S.snap.t + (performance.now() - S.snapAt) / 1000;
  for (const n of $$('.cd', document)) { const left = Math.max(0, +n.dataset.t - nowT); const s = Math.ceil(left), v = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); if (n.textContent !== v) n.textContent = v; }
  for (const n of $$('.cdms', document)) { const ms = Math.max(0, +n.dataset.at - Date.now()), m = Math.ceil(ms / 60000), v = m >= 60 ? Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm' : m + ' min'; if (n.textContent !== v) n.textContent = v; }
}

// ---------- swipe down to close ----------
function initDrag() {
  let d = null;
  const move = (dy) => { dy = Math.max(0, dy); el.style.transform = `translateY(${dy}px)`; scrim.style.opacity = String(Math.max(0, 1 - dy / 320)); return dy; };
  const end = (dy, vel) => {
    scrim.style.opacity = '';
    if (dy > 90 || vel > 0.7) { el.style.transform = ''; close(); return; }
    if (dy > 0) { try { el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 320, easing: BOUNCE }); } catch { /* ignore */ } }
    el.style.transform = '';
  };
  el.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('[data-drag]') || e.target.closest('button')) return;
    d = { y: e.clientY, t: performance.now(), dy: 0, id: e.pointerId }; try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  });
  el.addEventListener('pointermove', (e) => { if (!d || e.pointerId !== d.id) return; d.dy = move(e.clientY - d.y); });
  const up = (e) => { if (!d || e.pointerId !== d.id) return; const vel = d.dy / Math.max(1, performance.now() - d.t); const dy = d.dy; d = null; end(dy, vel); };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  // pull the body down from its top edge (touch only)
  let t0 = null;
  body.addEventListener('touchstart', (e) => { t0 = body.scrollTop <= 0 ? { y: e.touches[0].clientY, t: performance.now(), dy: 0, on: false } : null; }, { passive: true });
  body.addEventListener('touchmove', (e) => {
    if (!t0) return; const dy = e.touches[0].clientY - t0.y;
    if (!t0.on) { if (dy > 14 && body.scrollTop <= 0) t0.on = true; else if (dy < -4) { t0 = null; return; } else return; }
    if (e.cancelable) e.preventDefault(); t0.dy = move(dy - 14);
  }, { passive: false });
  const tend = () => { if (t0 && t0.on) { const vel = t0.dy / Math.max(1, performance.now() - t0.t); end(t0.dy, vel); } t0 = null; };
  body.addEventListener('touchend', tend); body.addEventListener('touchcancel', tend);
}
