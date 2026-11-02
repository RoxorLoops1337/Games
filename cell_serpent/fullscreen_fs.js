// Phone full screen (owner request). Android Chrome and friends: Fullscreen API on a real tap. iPhone Safari has no page
// fullscreen at all, so we show a one-time "Add to Home Screen" hint (the installed app opens full screen).
// Pure helpers first (unit tested), DOM glue below.
export const A2HS_KEY = 'cell_serpent_a2hs_fs';

// iPhone, iPod, iPad (iPadOS 13+ reports as a Mac with touch points)
export function isIOSDevice(ua = '', platform = '', touchPoints = 0) {
  return /iPhone|iPod|iPad/.test(ua) || (platform === 'MacIntel' && touchPoints > 1);
}
// true when the page already runs as an installed app
export function isStandalone(env = {}) { return !!(env.navStandalone || env.displayStandalone || env.displayFullscreen); }
// the hint card: only on iOS, only when not installed, only once, never on desktop
export function shouldShowA2hs(env = {}) {
  if (!isIOSDevice(env.ua || '', env.platform || '', env.touchPoints || 0)) return false;
  if (isStandalone(env)) return false;
  if (env.seen) return false;
  return true;
}
// should a tap try the Fullscreen API
export function wantsFullscreenRequest(o = {}) {
  return !!(o.enabled && o.supported && !o.isFull && !o.pending);
}

function fsEl() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
function fsSupported() { const e = document.documentElement; return !!(e && (e.requestFullscreen || e.webkitRequestFullscreen)); }
let enabledFn = () => true, pending = false;

// call from a user gesture; resolves true when fullscreen was entered
export function requestFs(force = false) {
  try {
    if (!force && !wantsFullscreenRequest({ enabled: enabledFn(), supported: fsSupported(), isFull: !!fsEl(), pending })) return Promise.resolve(false);
    if (fsEl() || !fsSupported()) return Promise.resolve(!!fsEl());
    const e = document.documentElement; pending = true;
    const p = e.requestFullscreen ? e.requestFullscreen({ navigationUI: 'hide' }) : e.webkitRequestFullscreen();
    return Promise.resolve(p).then(() => { pending = false; lockPortrait(); return true; }, () => { pending = false; return false; });
  } catch (err) { pending = false; return Promise.resolve(false); }
}
export function exitFs() { try { if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) {} }
function lockPortrait() { try { const o = screen.orientation; if (o && o.lock) o.lock('portrait').catch(() => {}); } catch (e) {} }

function readSeen() { try { return localStorage.getItem(A2HS_KEY) === '1'; } catch (e) { return false; } }
function markSeen() { try { localStorage.setItem(A2HS_KEY, '1'); } catch (e) {} }
function mq(q) { try { return !!(window.matchMedia && matchMedia(q).matches); } catch (e) { return false; } }

function a2hsEnv() {
  return { ua: navigator.userAgent, platform: navigator.platform, touchPoints: navigator.maxTouchPoints, navStandalone: navigator.standalone === true, displayStandalone: mq('(display-mode: standalone)'), displayFullscreen: mq('(display-mode: fullscreen)'), seen: readSeen() };
}
function showA2hs() {
  if (document.getElementById('a2hsFs')) return;
  const d = document.createElement('div'); d.id = 'a2hsFs'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Add to Home Screen for full screen');
  d.innerHTML = '<div class="a2t"><b>Full screen on iPhone</b><span>Tap <u>Share</u>, then <u>Add to Home Screen</u>. Open the game from its icon.</span></div><button type="button" class="a2x" aria-label="Close">OK</button><i class="a2arrow" aria-hidden="true"></i>';
  d.querySelector('.a2x').onclick = () => d.remove();
  document.body.appendChild(d); markSeen();
  setTimeout(() => document.addEventListener('pointerdown', () => d.remove(), { once: true, capture: true }), 600);   // any next tap clears it so it never sits over a run
  setTimeout(() => d.remove(), 14000);
}

// glue: getOn() reads save.settings.fullscreen
export function initFullscreen(getOn) {
  enabledFn = getOn || (() => true);
  const sup = fsSupported();
  document.documentElement.classList.toggle('fs-ok', sup);
  const btn = document.getElementById('fsBtn');
  const paint = () => { if (btn) { btn.classList.toggle('on', !!fsEl()); btn.hidden = !sup; btn.setAttribute('aria-label', fsEl() ? 'Leave full screen' : 'Full screen'); } };
  paint();
  // an explicit tap on the fullscreen button always toggles; every other request is gated by the setting
  if (btn) btn.addEventListener('click', e => { e.stopPropagation(); if (fsEl()) exitFs(); else requestFs(true); });
  for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, paint);
  // first tap on the title or PLAY (or a later explicit tap on them after the player left fullscreen)
  document.addEventListener('click', e => {
    const t = e.target; if (!t || !t.closest) return;
    if (t.closest('#fsBtn')) return;
    if (t.closest('#title') || t.closest('#playBtn')) requestFs();
    const row = t.closest('#settings .tgl[data-k="fullscreen"]');
    if (row) { if (enabledFn()) requestFs(); else exitFs(); }   // main.js toggled the setting before this bubbles up
  });
  // iPhone Safari: no page fullscreen, so one friendly hint
  if (!sup) { const env = a2hsEnv(); if (shouldShowA2hs(env)) setTimeout(() => { if (shouldShowA2hs(a2hsEnv())) showA2hs(); }, 2500); }
  // landscape on a phone: the rotate overlay is pure CSS (coarse pointer, small height); build its node here
  if (!document.getElementById('rotateFs')) { const r = document.createElement('div'); r.id = 'rotateFs'; r.setAttribute('aria-hidden', 'true'); r.innerHTML = '<div><i></i><b>Rotate your phone</b><span>Cell Serpent plays upright</span></div>'; document.body.appendChild(r); }
}
// call when a run starts (a user gesture): get fullscreen if the player wants it
export function fsOnRun() { requestFs(); }
