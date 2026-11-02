// Accessibility and comfort helpers (agent 18). Small, DOM-only, no game rules.
const LABELS = { stPrev: 'Previous stage', stNext: 'Next stage', enPlus: 'Get more energy', setBtnT: 'Settings', setBtnH: 'Settings', muteBtn: 'Sound on or off' };

// every icon-only button gets an aria-label (also buttons the hub builds later)
export function labelButtons(root = document) {
  for (const b of root.querySelectorAll('button')) {
    if (b.getAttribute('aria-label')) continue;
    const txt = (b.textContent || '').replace(/[^A-Za-z0-9]/g, '');
    if (LABELS[b.id]) b.setAttribute('aria-label', LABELS[b.id]);
    else if (!txt) b.setAttribute('aria-label', b.title || (b.className || '').split(' ')[0] || 'Button');
  }
}

export const textScaleOf = st => { const v = st && typeof st.textScale === 'number' && isFinite(st.textScale) ? st.textScale : 1; return Math.max(1, Math.min(1.4, v > 1 ? v : st && st.bigText ? 1.12 : 1)); };
export const textScaleLabel = v => Math.round(v * 100) + '%';

// settings that change the page itself (menu text size, slide bar side)
export function applyPageSettings(st) {
  const ts = textScaleOf(st), de = document.documentElement;   // text size slider (the old "bigger text" switch counts as 112%)
  de.classList.toggle('ts', ts > 1); de.style.setProperty('--ts', String(ts));
  document.documentElement.classList.toggle('hc', !!st.highContrast);
  const sl = document.getElementById('accSlider');
  if (sl) { sl.classList.toggle('lf', !!st.leftHand); sl.classList.toggle('rt', !st.leftHand); }
}

// reduced motion is on by default when the device asks for it
export const systemReduceMotion = () => { try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };

// on-screen slide bar: acts like the drag joystick (thumb offset from the middle = speed), springs back on release
export function initSlider(joy, isPlaying, onTap) {
  const el = document.getElementById('accSlider'), th = document.getElementById('accThumb'); if (!el) return;
  let id = null;
  const set = dx => { th.style.transform = `translateX(${dx * (el.clientWidth / 2 - 34)}px)`; el.setAttribute('aria-valuenow', dx.toFixed(2)); };
  const move = e => { const r = el.getBoundingClientRect(); const dx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2 - 34))); joy.sdx = dx; set(dx); };
  el.addEventListener('pointerdown', e => { if (!isPlaying()) return; id = e.pointerId; el.setPointerCapture(id); move(e); e.preventDefault(); });
  el.addEventListener('pointermove', e => { if (e.pointerId === id) move(e); });
  let t0 = 0, moved = 0;   // a quick tap on the bar (no real slide) is the Encore tap, since the bar can sit over the duo on short phones
  let sx = 0; el.addEventListener('pointerdown', e => { t0 = Date.now(); moved = 0; sx = e.clientX; }); el.addEventListener('pointermove', e => { moved = Math.max(moved, Math.abs(e.clientX - sx)); });
  const end = e => { if (e.pointerId === id) { id = null; if (e.type === 'pointerup' && onTap && Date.now() - t0 < 260 && moved < 14 && isPlaying()) onTap(); joy.sdx = 0; set(0); } };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  set(0);
}
export function showSlider(on) { const el = document.getElementById('accSlider'); if (el) el.classList.toggle('on', !!on); }

// Escape closes settings and panels (the pause screen is handled by the game)
export function initKeys(isMenuMode) {
  addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !isMenuMode()) return;
    for (const id of ['setClose', 'pClose']) { const b = document.getElementById(id); if (b && b.offsetParent) { b.click(); e.preventDefault(); return; } }
  });
}

// pause guard: the first tap only arms the button
let armed = -1e12;
export function pauseAllowed(guard, now = Date.now()) { if (!guard) return true; if (now - armed < 1600) { armed = -1e12; return true; } armed = now; return false; }

// ---- screen reader support: one polite live region (stage start, pick results, game over, groove tiers)
let live = null, liveT = 0;
function liveEl() {
  if (live || typeof document === 'undefined') return live;
  live = document.createElement('div'); live.id = 'a11yLive'; live.className = 'sr'; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true');
  document.body.appendChild(live); return live;
}
export function announce(msg) {
  const el = liveEl(); if (!el) return;
  el.textContent = ''; clearTimeout(liveT); liveT = setTimeout(() => { el.textContent = String(msg); }, 60);   // the gap makes repeated lines read again
}
// groove meter text alternative: a hidden meter element, spoken only when the tier changes
let meter = null, lastGv = -1, lastTier = 0, peakTier = 0;
export const grooveText = gv => 'Groove ' + gv + ' of 20' + (gv >= 1 ? ', plus ' + Math.floor(gv * 1.5) + ' percent damage' : '') + (gv >= 20 ? ', on fire' : '');
export function watchGroove(gv) {
  gv = Math.max(0, Math.min(20, Math.floor(gv || 0))); if (gv === lastGv) return 0; lastGv = gv;
  if (!meter && typeof document !== 'undefined') { meter = document.createElement('div'); meter.id = 'a11yGroove'; meter.className = 'sr'; meter.setAttribute('role', 'meter'); meter.setAttribute('aria-label', 'Groove'); meter.setAttribute('aria-valuemin', '0'); meter.setAttribute('aria-valuemax', '20'); document.body.appendChild(meter); }
  if (meter) { meter.setAttribute('aria-valuenow', String(gv)); meter.setAttribute('aria-valuetext', grooveText(gv)); }
  const tier = gv >= 20 ? 4 : gv >= 15 ? 3 : gv >= 10 ? 2 : gv >= 5 ? 1 : 0;
  let ret = 0;
  peakTier = Math.max(peakTier, tier);
  if (tier !== lastTier) { ret = tier === 0 && peakTier >= 2 ? -1 : 0; if (tier === 0) peakTier = 0; lastTier = tier; if (tier) announce(grooveText(gv)); }
  return ret;   // -1: a real streak (tier 2 or more) just ran out, the game plays a soft sigh
}
// beat streak milestones (10, 20, 30...) are spoken once each; a broken streak re-arms them. Returns the milestone just reached, or 0
let lastMile = 0;
export const streakText = n => 'Beat streak ' + n + (n >= 20 ? ', on the beat' : '');
export function watchStreak(n) {
  n = Math.max(0, n | 0);
  if (n < 10) { lastMile = 0; return 0; }
  const m = Math.floor(n / 10) * 10; if (m <= lastMile) return 0;
  lastMile = m; announce(streakText(m)); return m;
}
export function resetStreak() { lastMile = 0; }
export function resetGroove() { lastMile = 0; lastGv = -1; lastTier = 0; peakTier = 0; }
export const RARITY_WORDS = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

// thumb zone: the bottom third of the screen is the only place that steers; a faint hint shows where
export function showZone(on) { const el = document.getElementById('accZone'); if (!el) return; el.classList.toggle('on', !!on); if (on) { el.classList.remove('fade'); void el.offsetWidth; el.classList.add('fade'); } }
export const inThumbZone = (y, h) => y >= h * (2 / 3);
export const zoneSteer = (targetX, cellX, span = 60) => Math.max(-1, Math.min(1, (targetX - cellX) / span));

// keyboard: roving arrows on the bottom tab bar, focus moves into a screen when it opens, the reward bar is a real button
export function initKeyboard() {
  const nr = document.getElementById('nextRew');
  if (nr) { nr.setAttribute('role', 'button'); nr.tabIndex = 0; nr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nr.click(); } }); }
  const nav = document.querySelector('.tabs');
  if (nav) nav.addEventListener('keydown', e => {
    const k = e.key; if (k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'Home' && k !== 'End') return;
    const bs = [...nav.querySelectorAll('button')], i = bs.indexOf(document.activeElement); if (i < 0) return;
    const to = k === 'Home' ? 0 : k === 'End' ? bs.length - 1 : (i + (k === 'ArrowRight' ? 1 : -1) + bs.length) % bs.length;
    bs[to].focus(); e.preventDefault();
  });
  const seen = new WeakMap();
  new MutationObserver(ms => {
    for (const m of ms) {
      const s = m.target, on = s.classList.contains('on'), was = seen.get(s) || false; seen.set(s, on);
      if (!on || was || s.id === 'title') continue;
      const first = s.id === 'hub' ? s.querySelector('.tabs button.on') : s.querySelector('.card.pick, button:not([disabled])');
      if (first) setTimeout(() => { if (s.classList.contains('on') && (!document.activeElement || document.activeElement === document.body || !s.contains(document.activeElement))) { try { first.focus({ preventScroll: true }); } catch (e) { /* ignore */ } } }, 60);
    }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  const cur = () => { for (const b of document.querySelectorAll('.tabs button')) { if (b.classList.contains('on')) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); } };
  cur(); new MutationObserver(cur).observe(nav || document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  const cv = document.getElementById('c'); if (cv && !cv.getAttribute('aria-label')) { cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', 'Game field. The duo slides left and right and shoots up on its own. Keys: arrows or A and D to move, space for Encore, P to pause.'); }
}

// ---- screen reader pass for the hub panels (round 4): bars become progress bars, decorative pictures are hidden,
// screens are named dialogs, toasts are spoken, and closing a panel puts focus back on the button that opened it
export function barPercent(el) {
  const i = el && el.querySelector && el.querySelector(':scope > i[style*="width"]'); if (!i) return -1;
  const m = /width:\s*([\d.]+)%/.exec(i.getAttribute('style') || ''); return m ? Math.max(0, Math.min(100, Math.round(+m[1]))) : -1;
}
export function srPass(root = document) {
  for (const b of root.querySelectorAll('.bar, .lbar')) {
    const pc = barPercent(b); if (pc < 0) continue;
    if (!b.getAttribute('role')) { b.setAttribute('role', 'progressbar'); b.setAttribute('aria-valuemin', '0'); b.setAttribute('aria-valuemax', '100'); }
    b.setAttribute('aria-valuenow', String(pc));
    const par = b.parentElement, txt = ((par && par.textContent) || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    b.setAttribute('aria-label', txt || 'Progress');
  }
  for (const im of root.querySelectorAll('img:not([alt]):not([aria-hidden])')) im.setAttribute('aria-hidden', 'true');   // decorative art (an empty alt would change layout)
  for (const sv of root.querySelectorAll('svg:not([aria-hidden]):not([role])')) if (!sv.closest('[role="img"]') && !sv.getAttribute('aria-label')) sv.setAttribute('aria-hidden', 'true');
}
export function initSrPass() {
  if (typeof document === 'undefined') return;
  const toast = document.getElementById('toast'); if (toast) { toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite'); }
  for (const s of document.querySelectorAll('section.scr')) {
    if (s.id === 'title' || s.id === 'hub') continue;
    const h = s.querySelector('h2'); s.setAttribute('role', 'dialog');
    if (h) { if (!h.id) h.id = s.id + 'H'; s.setAttribute('aria-labelledby', h.id); } else s.setAttribute('aria-label', s.id);
  }
  let t = 0; const run = () => { clearTimeout(t); t = setTimeout(() => srPass(document), 120); };
  run(); new MutationObserver(run).observe(document.body, { childList: true, subtree: true });
  // focus return
  let outside = null, opener = null; const seen = new WeakMap();
  const inDialog = el => !!(el && el.closest && el.closest('section.scr.on:not(#hub):not(#title)'));
  document.addEventListener('focusin', e => { if (!inDialog(e.target) && e.target !== document.body) outside = e.target; });
  new MutationObserver(ms => {
    for (const m of ms) {
      const s = m.target; if (!s.matches || !s.matches('section.scr') || s.id === 'hub' || s.id === 'title') continue;
      const on = s.classList.contains('on'), was = seen.get(s) || false; seen.set(s, on);
      if (on && !was) opener = outside;
      else if (!on && was && opener) { const o = opener; opener = null; setTimeout(() => { const ae = document.activeElement; if (o.isConnected && o.offsetParent !== null && (!ae || ae === document.body || s.contains(ae)) && !document.querySelector('section.scr.on:not(#hub):not(#title)')) { try { o.focus({ preventScroll: true }); } catch (x) { /* ignore */ } } }, 60); }
    }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
}

// ---- arrow-key grid navigation (Battle tab): the arrow keys jump to the nearest button in that direction
// items: [{ x, y, w, h }] rects; returns the index of the best neighbour of items[from] in dir ('L','R','U','D'), or -1
export function gridNext(items, from, dir) {
  const a = items[from]; if (!a) return -1;
  const ax = a.x + a.w / 2, ay = a.y + a.h / 2; let best = -1, bs = Infinity;
  items.forEach((b, i) => {
    if (i === from) return;
    const dx = b.x + b.w / 2 - ax, dy = b.y + b.h / 2 - ay;
    const main = dir === 'L' ? -dx : dir === 'R' ? dx : dir === 'U' ? -dy : dy, side = dir === 'L' || dir === 'R' ? Math.abs(dy) : Math.abs(dx);
    if (main < 4) return;   // must lie in that direction
    const sc = main + side * 2.5;   // prefer the same row or column
    if (sc < bs) { bs = sc; best = i; }
  });
  return best;
}
export function initGridNav(root) {
  if (!root) return;
  const SEL = 'button:not([disabled]),[role="button"],[tabindex="0"]';
  root.addEventListener('keydown', e => {
    const dir = { ArrowLeft: 'L', ArrowRight: 'R', ArrowUp: 'U', ArrowDown: 'D' }[e.key]; const el = document.activeElement;
    if (!dir || !el || !root.contains(el) || el.matches('input,textarea,select')) return;
    const list = [...root.querySelectorAll(SEL)].filter(b => b.offsetParent !== null);
    const from = list.indexOf(el); if (from < 0) return;
    const to = gridNext(list.map(b => { const r = b.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }), from, dir);
    if (to < 0) return;
    e.preventDefault(); const t = list[to]; try { t.focus(); t.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (x) { /* ignore */ }
  });
  // choosing a stage rebuilds the chips: keep the keyboard on the chosen one
  root.addEventListener('keyup', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.classList && e.target.classList.contains('chip')) setTimeout(() => { const s = root.querySelector('#stChips .chip.sel'); if (s) s.focus({ preventScroll: true }); }, 30);
  });
}
