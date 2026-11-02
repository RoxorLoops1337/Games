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

// opts: { order, cur(): tab, go(tab): switch, hub: element }
export function bindHubSwipe({ order, cur, go, hub }) {
  let sx = 0, sy = 0, st = 0, live = false;
  const hscroll = el => {
    for (let e = el; e && e !== hub; e = e.parentElement) {
      if (e.scrollWidth > e.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(e).overflowX)) return true;
      if ((e.classList && e.classList.contains('bt-hero')) || e.tagName === 'INPUT') return true;
    }
    return false;
  };
  hub.addEventListener('touchstart', e => {
    live = e.touches.length === 1 && !!e.target.closest && !e.target.closest('.tabs') && !hscroll(e.target);
    if (live) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = performance.now(); }
  }, { passive: true });
  hub.addEventListener('touchend', e => {
    if (!live) return; live = false;
    const t = e.changedTouches[0]; if (!t) return;
    const to = swipeTarget(order, cur(), t.clientX - sx, t.clientY - sy, performance.now() - st);
    if (to) go(to);
  }, { passive: true });
  hub.addEventListener('touchcancel', () => { live = false; }, { passive: true });
}
