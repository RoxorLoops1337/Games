// Hub tab bar polish (batch 4, agent 19): one consistent baked icon set for the tabs, and
// swipe left/right on the hub body to change tab (the slide direction comes from motion.tabDir).
import { iconURL } from './icons.js';

const ICON = { Shop: 'tab_shop', Stats: 'tab_stats', Battle: 'tab_battle', Skills: 'tab_skills', Pets: 'tab_pets', Gear: 'tab_gear' };

// pure: which tab a swipe lands on (null when it is not a clear horizontal swipe or there is no tab that way)
export function swipeTarget(order, cur, dx, dy, ms) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax < 56 || ax < ay * 1.8 || ms > 900) return null;
  const i = order.indexOf(cur) + (dx < 0 ? 1 : -1);
  return i >= 0 && i < order.length ? order[i] : null;
}

// swap the emoji in the tab buttons for baked icons (headless: iconURL is '' so the emoji stay)
export function paintTabIcons(root = document) {
  for (const b of root.querySelectorAll('.tabs button[data-tab]')) {
    const u = iconURL(ICON[b.dataset.tab] || ''), s = b.querySelector('b');
    if (!u || !s || s.querySelector('img')) continue;
    s.innerHTML = `<img class="tico" src="${u}" alt="" draggable="false">`;
  }
}

// round 10: the tab badge shows how many things are ready (1 to 9, then 9+)
export const badgeLabel = n => (n > 0 ? (n > 9 ? '9+' : String(Math.floor(n))) : '');
let tabUp = null;
export const onTabUp = f => { tabUp = f; };   // r11: called when a badge number goes up (main plays the ping)
export function setTabCount(btn, n) {
  const d = btn && btn.querySelector('.dot'); if (!d) return;
  const t = badgeLabel(n);
  if (d.textContent !== t) { d.textContent = t; d.classList.toggle('wide', t.length > 1); if (d.dataset.n !== undefined) { d.classList.remove('bump'); void d.offsetWidth; d.classList.add('bump'); if (tabUp && t && (+d.dataset.n || 0) < (n > 9 ? 10 : n)) tabUp(); } d.dataset.n = t; }
}

// pure: how far the pane follows the finger. With a tab to go to it follows at about half speed (soft cap),
// with no tab that way (the first or last one) it stiffens fast into a short rubber-band bump.
export function rubber(dx, hasTarget) {
  const a = Math.abs(dx), s = dx < 0 ? -1 : 1;
  if (hasTarget) return s * Math.min(a * 0.55, 120);
  return s * 34 * (1 - Math.exp(-a / 90));
}

// pure: where the tab bar indicator sits (in tab slots) while a swipe is dragged: it slides toward the next tab,
// reaching it at a 110px drag, and only nudges (a tenth of a slot) at the first or last tab
export function indicatorPos(idx, dx, has) {
  const k = Math.min(1, Math.abs(dx) / 110), s = dx < 0 ? 1 : -1;
  return idx + s * k * (has ? 1 : 0.1);
}

// the sliding bar on the tab bar; sync() follows the .on button, drag() follows the finger
function makeIndicator(nav) {
  if (!nav) return null;
  let ind = nav.querySelector('.tabind');
  if (!ind) { ind = document.createElement('i'); ind.className = 'tabind'; ind.setAttribute('aria-hidden', 'true'); nav.appendChild(ind); }
  const btns = () => [...nav.querySelectorAll('button[data-tab]')];
  nav.style.setProperty('--n', String(btns().length || 6));
  const idx = () => Math.max(0, btns().findIndex(b => b.classList.contains('on')));
  const sync = () => { if (nav.classList.contains('tdrag')) nav.classList.remove('tdrag'); nav.style.setProperty('--i', String(idx())); };
  sync();
  if (typeof MutationObserver === 'function') new MutationObserver(ms => { if (ms.some(m => m.target !== nav)) sync(); }).observe(nav, { attributes: true, attributeFilter: ['class'], subtree: true });
  return { sync, idx, drag: (dx, has) => { if (!nav.classList.contains('tdrag')) nav.classList.add('tdrag'); nav.style.setProperty('--i', indicatorPos(idx(), dx, has).toFixed(3)); } };
}

// opts: { order, cur(): tab, go(tab): switch, hub: element, pane?(): the active tab element (it follows the finger), bump?(): edge haptic }
export function bindHubSwipe({ order, cur, go, hub, pane, bump }) {
  let sx = 0, sy = 0, st = 0, row0 = 0, live = false, drag = false, armed = false, bumped = false, el = null;
  const calm = () => document.documentElement.classList.contains('rm');
  const ind = makeIndicator(hub.querySelector('.tabs'));
  let row = null;
  // the hero and sliders keep their own swipe; a scrollable chip row is remembered so a swipe that starts on it
  // scrolls the row while it still has room that way, and changes tab once the row is at its edge
  const hscroll = el => {
    row = null;
    for (let e = el; e && e !== hub; e = e.parentElement) {
      if (e.scrollWidth > e.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(e).overflowX)) { if (!row) row = e; continue; }
      if ((e.classList && e.classList.contains('bt-hero')) || e.tagName === 'INPUT') return true;
    }
    return false;
  };
  const rowHasRoom = dx => !!row && (dx < 0 ? row.scrollLeft + row.clientWidth < row.scrollWidth - 2 : row.scrollLeft > 2);
  const free = (spring) => {   // let go of the pane: spring back (or snap when we are leaving the tab)
    const p = el; el = null; drag = false; armed = false; bumped = false;
    if (!p) return;
    p.classList.remove('rb-drag');
    if (!spring) { p.style.translate = ''; p.style.opacity = ''; p.classList.remove('rb-back'); return; }
    p.classList.add('rb-back'); p.style.translate = '0px'; p.style.opacity = '';
    setTimeout(() => { p.classList.remove('rb-back'); p.style.translate = ''; }, 420);
  };
  hub.addEventListener('touchstart', e => {
    free(false);
    live = e.touches.length === 1 && !!e.target.closest && !e.target.closest('.tabs') && !hscroll(e.target);
    if (live) { row0 = row ? row.scrollLeft : 0; sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = performance.now(); }
  }, { passive: true });
  hub.addEventListener('touchmove', e => {
    if (!live || !pane || calm()) return;
    const t = e.touches[0]; if (!t) return;
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (!drag) {
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      if (rowHasRoom(dx) || (row && row.scrollLeft !== row0)) { live = false; return; }
      el = pane(); if (!el) return;
      drag = true; el.classList.remove('rb-back'); el.classList.add('rb-drag');
    }
    const i = order.indexOf(cur()) + (dx < 0 ? 1 : -1), has = i >= 0 && i < order.length;
    el.style.translate = rubber(dx, has) + 'px 0';
    el.style.opacity = has ? String(Math.max(0.55, 1 - Math.abs(dx) / 420)) : '';
    if (ind) ind.drag(dx, has);
    if (!has && !bumped && Math.abs(dx) > 40) { bumped = true; if (bump) bump(); }
    const ready = has && Math.abs(dx) >= 56;
    if (ready !== armed) { armed = ready; el.classList.toggle('rb-armed', ready); }
  }, { passive: true });
  hub.addEventListener('touchend', e => {
    if (!live) return; live = false;
    const t = e.changedTouches[0]; if (!t) { free(true); return; }
    const to = swipeTarget(order, cur(), t.clientX - sx, t.clientY - sy, performance.now() - st);
    if (el) el.classList.remove('rb-armed');
    if (to) { free(false); go(to); } else free(true);
    if (ind) ind.sync();
  }, { passive: true });
  hub.addEventListener('touchcancel', () => { live = false; free(true); if (ind) ind.sync(); }, { passive: true });
}
