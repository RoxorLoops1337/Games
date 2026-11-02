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

// settings that change the page itself (menu text size, slide bar side)
export function applyPageSettings(st) {
  document.documentElement.classList.toggle('bigtext', !!st.bigText);
  document.documentElement.classList.toggle('hc', !!st.highContrast);
  const sl = document.getElementById('accSlider');
  if (sl) { sl.classList.toggle('lf', !!st.leftHand); sl.classList.toggle('rt', !st.leftHand); }
}

// reduced motion is on by default when the device asks for it
export const systemReduceMotion = () => { try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };

// on-screen slide bar: acts like the drag joystick (thumb offset from the middle = speed), springs back on release
export function initSlider(joy, isPlaying) {
  const el = document.getElementById('accSlider'), th = document.getElementById('accThumb'); if (!el) return;
  let id = null;
  const set = dx => { th.style.transform = `translateX(${dx * (el.clientWidth / 2 - 34)}px)`; el.setAttribute('aria-valuenow', dx.toFixed(2)); };
  const move = e => { const r = el.getBoundingClientRect(); const dx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2 - 34))); joy.sdx = dx; set(dx); };
  el.addEventListener('pointerdown', e => { if (!isPlaying()) return; id = e.pointerId; el.setPointerCapture(id); move(e); e.preventDefault(); });
  el.addEventListener('pointermove', e => { if (e.pointerId === id) move(e); });
  const end = e => { if (e.pointerId === id) { id = null; joy.sdx = 0; set(0); } };
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
let meter = null, lastGv = -1, lastTier = 0;
export const grooveText = gv => 'Groove ' + gv + ' of 20' + (gv >= 1 ? ', plus ' + Math.floor(gv * 1.5) + ' percent damage' : '') + (gv >= 20 ? ', on fire' : '');
export function watchGroove(gv) {
  gv = Math.max(0, Math.min(20, Math.floor(gv || 0))); if (gv === lastGv) return; lastGv = gv;
  if (!meter && typeof document !== 'undefined') { meter = document.createElement('div'); meter.id = 'a11yGroove'; meter.className = 'sr'; meter.setAttribute('role', 'meter'); meter.setAttribute('aria-label', 'Groove'); meter.setAttribute('aria-valuemin', '0'); meter.setAttribute('aria-valuemax', '20'); document.body.appendChild(meter); }
  if (meter) { meter.setAttribute('aria-valuenow', String(gv)); meter.setAttribute('aria-valuetext', grooveText(gv)); }
  const tier = gv >= 20 ? 4 : gv >= 15 ? 3 : gv >= 10 ? 2 : gv >= 5 ? 1 : 0;
  if (tier !== lastTier) { lastTier = tier; if (tier) announce(grooveText(gv)); }
}
export function resetGroove() { lastGv = -1; lastTier = 0; }
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
