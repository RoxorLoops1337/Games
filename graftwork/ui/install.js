// Install as an app (PWA). Chrome and Edge (Android, desktop) fire `beforeinstallprompt`: we keep the event and call prompt() from our own button.
// iOS has no such event: Share > Add to Home Screen, so we show an instruction dialog. Other browsers (Firefox desktop, in-app browsers): no button.
// Safe under node (no window: everything is a no-op); mockable for tests via setHost({window, navigator}).
// Offline play is separate (ui/offline.js, sw.js): the player downloads it from Settings > App and offline.
import { COL } from './core.js';
import { requestOffer } from './offline.js';

let host = null;
const win = () => (host ? host.window : globalThis.window) || null;
const nav = () => (host ? host.navigator : globalThis.navigator) || null;

const S = { deferred: null, installed: false, toast: null, listening: null };

function isIOS() {
  const n = nav(); if (!n) return false;
  return /iPhone|iPad|iPod/.test(n.userAgent || '') || (n.platform === 'MacIntel' && (n.maxTouchPoints || 0) > 1);
}
// Facebook, Instagram, Line, TikTok, Android WebView and friends cannot install or add to the home screen from the page.
function inAppBrowser() {
  const n = nav(); if (!n) return false;
  return /FBAN|FBAV|Instagram|Line\/|Twitter|MicroMessenger|TikTok|BytedanceWebview|Snapchat|; wv\)/i.test(n.userAgent || '');
}
// The three display-mode queries are made ONCE per window and their live `matches` is read after that. isInstalled() runs every frame on the title and
// twice a frame in Settings, and used to call matchMedia three times each time (six parsed queries per frame while Settings was open).
let MQ = null, MQW = null;
function displayModes(w) {
  if (MQW !== w) { MQW = w; MQ = null; try { if (w && w.matchMedia) MQ = ['fullscreen', 'standalone', 'minimal-ui'].map((m) => w.matchMedia(`(display-mode: ${m})`)); } catch { MQ = null; /* no matchMedia */ } }
  return MQ;
}
export function isInstalled() {
  const w = win(), n = nav();
  if (S.installed) return true;
  if (n && n.standalone === true) return true;
  const mq = displayModes(w);
  if (mq) for (let i = 0; i < mq.length; i++) if (mq[i] && mq[i].matches) return true;
  return false;
}
// 'installed' | 'prompt' (Chrome path) | 'ios' (instruction dialog) | 'none' (hide the button)
export function installMode() {
  if (!win()) return 'none';
  if (isInstalled()) return 'installed';
  if (S.deferred) return 'prompt';
  if (isIOS() && !inAppBrowser()) return 'ios';
  return 'none';
}
export const canInstall = () => installMode() === 'prompt';
export const installAvailable = () => { const m = installMode(); return m === 'prompt' || m === 'ios'; }; // the button shows only then
export const installToast = () => S.toast;

export function say(msg, secs = 4) { S.toast = { msg, t: secs }; }

// Returns 'accepted' | 'dismissed' | 'ios' | 'unavailable' | 'error'. Call it from a click (prompt() needs a recent user gesture).
export async function install(app) {
  const m = installMode();
  if (m === 'ios') { if (app && app.push) app.push('install_help'); return 'ios'; }
  if (m !== 'prompt') return 'unavailable';
  const ev = S.deferred; S.deferred = null; // a deferred event can be used once; the browser fires a new one later if the user dismissed
  try {
    await ev.prompt();
    const c = await ev.userChoice;
    if (c && c.outcome === 'accepted') { S.installed = true; say('Installed. Graftwork is on your home screen or app list.'); requestOffer(); return 'accepted'; }
    return 'dismissed';
  } catch { return 'error'; }
}

export function initInstall(h) {
  if (h) { host = h; S.deferred = null; S.installed = false; S.toast = null; S.listening = null; }
  const w = win(); if (!w || !w.addEventListener || S.listening === w) return;
  S.listening = w;
  w.addEventListener('beforeinstallprompt', (e) => { if (e.preventDefault) e.preventDefault(); S.deferred = e; });
  w.addEventListener('appinstalled', () => { S.installed = true; S.deferred = null; say('Installed. Graftwork is on your home screen or app list.'); requestOffer(); });
}
export function resetInstall() { host = null; S.deferred = null; S.installed = false; S.toast = null; S.listening = null; }
initInstall(); // the event can fire before main.js boots: listen from import time

// Overlay: a short toast (called from main.js app.overlay).
export function drawInstallToast(app) {
  const t = S.toast; if (!t) return;
  t.t -= Math.min(0.1, app.dt || 0.016);
  if (t.t <= 0) { S.toast = null; return; }
  const a = Math.min(1, t.t / 0.4), g = app.ctx, w = 560, h = 44, x = 640 - w / 2, y = 640;
  g.save(); g.globalAlpha = a;
  app.panel(x, y, w, h, { r: 10, fill: 'rgba(20,16,14,.96)', stroke: COL.lamp });
  app.text(t.msg, 640, y + 11, { size: 16, ui: true, align: 'center', color: COL.vellum, fit: { w: w - 24, lines: 1 } });
  g.restore();
}

// The iOS instruction dialog, a screen (app.register('install_help', installHelp)): pushed by install().
export const installHelp = {
  calm() { return true; },
  enter() { this.fresh = true; },
  leave() {},
  draw(app) {
    const g = app.ctx;
    if (this.fresh) { app.mouse.released = false; app.mouse.pressed = false; this.fresh = false; }
    g.save(); g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(0, 0, 1280, 720); g.restore();
    const x = 340, y = 190, w = 600, h = 300;
    app.panel(x, y, w, h, { r: 14, fill: 'rgba(20,16,14,.98)', stroke: COL.lamp });
    app.text('Install on iPhone or iPad', 640, y + 22, { size: 26, bold: true, align: 'center', fit: { w: w - 40, lines: 1 } });
    app.text('Tap Share, then Add to Home Screen.', 640, y + 76, { size: 20, ui: true, align: 'center', maxW: w - 60 });
    app.text('Graftwork then opens fullscreen from your home screen, like an app.', 640, y + 120, { size: 16, ui: true, align: 'center', maxW: w - 80, color: '#d9cba8' });
    app.text('Safari shows Share in the toolbar. In other browsers, open the menu first.', 640, y + 170, { size: 14, ui: true, italic: true, align: 'center', maxW: w - 80, color: 'rgba(232,220,196,.65)' });
    if (app.button('Got it', 640 - 90, y + h - 66, 180, 46, { size: 20 }) || app.pressedKeys.some((e) => e.key === 'Escape' || e.key === 'Enter')) app.pop();
  },
  key(app, e) { return app.top() === this && (e.key === 'Escape' || e.key === 'Enter'); },
};
