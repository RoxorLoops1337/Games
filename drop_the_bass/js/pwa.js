// pwa.js: service worker registration, the "new version ready" toast and the install prompt flow.
// Everything is feature detected and failure tolerant. Plain static test servers (localhost) skip the worker unless ?sw=1.
//
// Wiring an install button (ui_hub.js settings): import { canInstall, promptInstall, onInstallChange, isInstalled } from './pwa.js';
//   const b = btn('Install the app', async () => { await promptInstall(); }); b.hidden = !canInstall();
//   onInstallChange(() => { b.hidden = !canInstall(); });
import { t } from './i18n.js';
let deferred = null;
const listeners = new Set();
let installed = false;
const ping = () => listeners.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } });

export function isInstalled() {
  try { return installed || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) || (typeof navigator !== 'undefined' && navigator.standalone === true); } catch (e) { return false; }
}
// true when the browser offered the install prompt and it has not been used yet
export function canInstall() { return !!deferred && !isInstalled(); }
export function onInstallChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
// shows the browser install dialog; resolves 'accepted', 'dismissed' or 'unavailable'
export async function promptInstall() {
  if (!deferred) return 'unavailable';
  const ev = deferred; deferred = null; ping();
  try { await ev.prompt(); const c = await ev.userChoice; if (c && c.outcome === 'accepted') installed = true; ping(); return c && c.outcome === 'accepted' ? 'accepted' : 'dismissed'; } catch (e) { return 'unavailable'; }
}

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; ping(); });
  window.addEventListener('appinstalled', () => { installed = true; deferred = null; ping(); });
}

// ---- online state (the hub shows a small Offline chip). navigator.onLine can only be trusted when it says false.
export function isOnline() { try { return typeof navigator === 'undefined' || navigator.onLine !== false; } catch (e) { return true; } }
const netListeners = new Set();
export function onOnlineChange(fn) { netListeners.add(fn); return () => netListeners.delete(fn); }
if (typeof window !== 'undefined' && window.addEventListener) {
  const pingNet = () => netListeners.forEach((fn) => { try { fn(isOnline()); } catch (e) { /* ignore */ } });
  window.addEventListener('online', pingNet); window.addEventListener('offline', pingNet);
}

// the small update toast. text is the string to translate: 'New version ready, tap to refresh'
export const UPDATE_TEXT = 'New version ready, tap to refresh';
function showUpdateToast(onTap, text) {
  if (typeof document === 'undefined' || document.getElementById('dtb-update')) return;
  const b = document.createElement('button');
  b.id = 'dtb-update'; b.type = 'button'; b.textContent = text || t('pwa.update', 'New version ready, tap to refresh');
  b.setAttribute('role', 'status');
  b.style.cssText = 'position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:99999;max-width:90vw;padding:12px 18px;min-height:44px;border:3px solid #2b2733;border-radius:16px;background:#ffd23c;color:#2b2733;font:20px "Patrick Hand",system-ui,sans-serif;box-shadow:0 4px 0 #2b2733;cursor:pointer';
  b.addEventListener('click', () => { b.disabled = true; onTap(); });
  document.body.appendChild(b);
}

// opts: { text } overrides the toast string (i18n); { onOfflineReady } is called once per page load when the worker has precached the whole
// app shell for the first time (install waits for the precache, so 'activated' on a first visit means everything is stored). Returns a promise of the registration or null. Never throws.
export async function initPwa(opts) {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
    const host = location.hostname, local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    if (local && !/[?&]sw=1\b/.test(location.search)) return null;
    const had = !!navigator.serviceWorker.controller;
    const reg = await navigator.serviceWorker.register('sw.js', { scope: './' });
    const text = opts && opts.text;
    const offer = (w) => showUpdateToast(() => w.postMessage('SKIP_WAITING'), text);
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing; if (!w) return;
      w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
    });
    let readyFired = false;
    const ready = () => { if (readyFired || had) return; readyFired = true; try { if (opts && typeof opts.onOfflineReady === 'function') opts.onOfflineReady(); } catch (e) { /* ignore */ } };
    // first visit only (a page that already had a controller is an update or an old install, not "first time")
    if (!had) {
      if (reg.active && reg.active.state === 'activated') ready();
      const first = reg.installing || reg.waiting;
      if (first) first.addEventListener('statechange', () => { if (first.state === 'activated') ready(); });
      reg.addEventListener('updatefound', () => { const w = reg.installing; if (w) w.addEventListener('statechange', () => { if (w.state === 'activated') ready(); }); });
    }
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!had) { ready(); return; } if (reloading) return; reloading = true; location.reload(); });
    // look for a new version when the app comes back to the foreground
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    return reg;
  } catch (e) { return null; }
}
