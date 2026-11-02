// Batch 12 (agent n): a friendly "Install for full screen" pill on the title.
//  - Android Chrome: the browser's beforeinstallprompt event is kept and the pill calls the real install prompt.
//  - iPhone Safari: no install event exists, so the pill re-opens the Add to Home Screen card (fullscreen_fs.js).
//  - Hidden when the game already runs installed (standalone / fullscreen display mode), after appinstalled, and after the
//    player declined the prompt. Never shown on desktop. Pure helpers first (unit tested), DOM glue below.
import { isIOSDevice, isStandalone, showA2hs } from './fullscreen_fs.js';

export const INSTALL_DECLINED_KEY = 'cell_serpent_install_no_b12n';

// which offer to show: 'prompt' (Android install prompt), 'ios' (Add to Home Screen steps) or '' (nothing)
export function installOffer(env = {}) {
  if (isStandalone(env) || env.installed || env.declined) return '';
  if (env.hasPrompt) return 'prompt';
  if (isIOSDevice(env.ua || '', env.platform || '', env.touchPoints || 0)) return 'ios';
  return '';
}
export function installLabel(kind) { return kind === 'ios' ? 'Full screen: Add to Home' : kind === 'prompt' ? 'Install for full screen' : ''; }

let deferred = null, installed = false, pill = null;
const mq = q => { try { return !!(window.matchMedia && matchMedia(q).matches); } catch (e) { return false; } };
const declined = () => { try { return localStorage.getItem(INSTALL_DECLINED_KEY) === '1'; } catch (e) { return false; } };
const markDeclined = () => { try { localStorage.setItem(INSTALL_DECLINED_KEY, '1'); } catch (e) { /* ignore */ } };
function env() {
  return { ua: navigator.userAgent, platform: navigator.platform, touchPoints: navigator.maxTouchPoints, navStandalone: navigator.standalone === true, displayStandalone: mq('(display-mode: standalone)'), displayFullscreen: mq('(display-mode: fullscreen)'), hasPrompt: !!deferred, installed, declined: declined() };
}
function paint() {
  const kind = installOffer(env());
  if (!kind) { if (pill) { pill.remove(); pill = null; } return; }
  if (!pill) {
    const host = document.getElementById('title'); if (!host) return;
    pill = document.createElement('button'); pill.type = 'button'; pill.id = 'inst_b12n';
    pill.innerHTML = '<i aria-hidden="true"></i><span></span>';
    pill.addEventListener('click', e => { e.stopPropagation(); onTap(); });
    host.insertBefore(pill, host.querySelector('.row'));   // the currency row stays the last child (the title layout keys on it)
  }
  pill.dataset.k = kind; pill.querySelector('span').textContent = installLabel(kind);
  pill.setAttribute('aria-label', kind === 'ios' ? 'Full screen: how to add the game to your Home Screen' : 'Install the game for full screen');
}
function onTap() {
  if (deferred) {
    const ev = deferred; deferred = null;
    try {
      ev.prompt();
      Promise.resolve(ev.userChoice).then(c => { if (c && c.outcome === 'accepted') installed = true; else markDeclined(); paint(); }, () => paint());
    } catch (e) { /* ignore */ }
    paint();
  } else if (pill && pill.dataset.k === 'ios') showA2hs();
}
export function initInstall() {
  window.addEventListener('beforeinstallprompt', e => { try { e.preventDefault(); } catch (x) { /* ignore */ } deferred = e; setTimeout(paint, 900); });
  window.addEventListener('appinstalled', () => { installed = true; deferred = null; paint(); });
  try { const m = matchMedia('(display-mode: standalone)'); if (m.addEventListener) m.addEventListener('change', paint); } catch (e) { /* ignore */ }
  setTimeout(paint, 1200);   // iPhone: no event, so decide from the user agent once the title has settled
}
