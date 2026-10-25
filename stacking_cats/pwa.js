// Installable app support: service worker, install prompt and the iPhone hint. Never throws.
let deferred = null;
const listeners = new Set();

export function canInstall() { return !!deferred; }
export function onInstallChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function fire() { for (const f of listeners) { try { f(); } catch (e) { /* ignore */ } } }

export async function promptInstall() {
  try {
    if (!deferred) return false;
    const d = deferred; deferred = null; fire();
    d.prompt();
    const r = await d.userChoice;
    return !!r && r.outcome === 'accepted';
  } catch (e) { return false; }
}

// true on iPhone and iPad Safari (no install prompt there) when not already running as an app
export function isIosSafari() {
  try {
    const ua = navigator.userAgent || '';
    const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return ios && !isStandalone();
  } catch (e) { return false; }
}
export function isStandalone() {
  try { return (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches) || navigator.standalone === true; } catch (e) { return false; }
}

export function registerPwa() {
  try {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
    window.addEventListener('beforeinstallprompt', (e) => { try { e.preventDefault(); deferred = e; fire(); } catch (x) { /* ignore */ } });
    window.addEventListener('appinstalled', () => { deferred = null; fire(); });
    const h = location.hostname, ok = location.protocol === 'https:' || h === 'localhost' || h === '127.0.0.1';
    if (!ok || !('serviceWorker' in navigator)) return;
    const go = () => { try { navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {}); } catch (e) { /* ignore */ } };
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
  } catch (e) { /* never block the game */ }
}
registerPwa();
