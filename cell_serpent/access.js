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
