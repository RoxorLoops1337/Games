// Page side of the offline copy (sw.js does the work). The player taps "Download for offline play" (Settings > App and offline): nothing is downloaded on its own.
// Safe under node (no window: everything is a no-op); mockable via initOffline({window, navigator, channel}).
// State comes from the service worker over a BroadcastChannel: none | checking | downloading | ready | update-available | update-ready | error.
const ASKED_KEY = 'graftwork_offline_asked';
let host = null;
const win = () => (host ? host.window : globalThis.window) || null;
const nav = () => (host ? host.navigator : globalThis.navigator) || null;

export const S = { state: 'none', pct: 0, bytes: 0, latestBytes: 0, version: null, message: '', started: false, offer: false, listening: null };

export function formatBytes(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
export function saveData() { const n = nav(), c = n && (n.connection || n.mozConnection); return !!(c && c.saveData); }
export function offlineSupported() {
  const n = nav(), w = win(); if (!n || !w || !n.serviceWorker) return false;
  return !!(w.isSecureContext || (w.location && /^(localhost|127\.0\.0\.1)$/.test(w.location.hostname)));
}
export function offlineReady() { return S.state === 'ready' || S.state === 'update-ready' || S.state === 'update-available'; }
export function offlineLabel() {
  switch (S.state) {
    case 'downloading': return `Downloading ${S.pct}%`;
    case 'checking': return S.bytes ? `Checking (${formatBytes(S.bytes)})` : 'Checking...';
    case 'ready': return `Ready (${formatBytes(S.bytes)})`;
    case 'update-ready': return 'Update ready, restart to apply';
    case 'update-available': return 'Update available';
    case 'error': return 'Download failed, try again';
    default: return 'Not downloaded';
  }
}
export function sizeNote() { return `${S.latestBytes ? formatBytes(S.latestBytes) : 'about 11 MB'}, best on wifi`; }

export function apply(m) {
  if (!m || m.type !== 'state') return;
  S.state = m.state || 'none';
  if (m.state === 'downloading') S.pct = m.pct || 0; else if (m.state === 'ready' || m.state === 'none') S.pct = 0;
  if (typeof m.bytes === 'number') S.bytes = m.bytes;
  if (typeof m.latestBytes === 'number' && m.latestBytes) S.latestBytes = m.latestBytes;
  S.version = m.version || null; S.message = m.message || '';
}
async function send(msg) {
  const n = nav(); if (!n || !n.serviceWorker) return false;
  try { const reg = await n.serviceWorker.ready; const sw = reg.active || (n.serviceWorker.controller); if (!sw) return false; sw.postMessage(msg); return true; } catch { return false; }
}
export const downloadOffline = () => { S.state = 'downloading'; S.pct = 0; return send({ type: 'download' }); };
export const checkUpdates = () => send({ type: 'check', apply: !saveData() });
export const removeOffline = () => send({ type: 'remove' });

export function initOffline(h) {
  if (h) { host = h; S.state = 'none'; S.pct = 0; S.bytes = 0; S.latestBytes = 0; S.offer = false; S.listening = null; S.started = false; }
  const w = win(), n = nav(); if (!offlineSupported() || S.listening === w) return;
  S.listening = w;
  try {
    const ch = (host && host.channel) || (typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('graftwork-sw') : null);
    if (ch) ch.onmessage = (e) => apply(e.data);
  } catch { /* no BroadcastChannel */ }
  Promise.resolve(n.serviceWorker.register('sw.js', { scope: './' })).then(() => { S.started = true; return send({ type: 'check', apply: !saveData() }); }).catch(() => {});
}

// ---- the one-time "Download for offline play?" offer after a successful install ----
const store = () => { try { return win() && win().localStorage; } catch { return null; } };
export function asked() { const s = store(); try { return !!(s && s.getItem(ASKED_KEY)); } catch { return false; } }
export function markAsked() { const s = store(); try { if (s) s.setItem(ASKED_KEY, '1'); } catch { /* private mode */ } }
export function requestOffer() { if (offlineSupported() && !asked() && !saveData()) S.offer = true; }
export function offerDue() { return S.offer && S.state === 'none' && !asked(); }
export function clearOffer() { S.offer = false; markAsked(); }
export function resetOffline() { host = null; S.state = 'none'; S.pct = 0; S.bytes = 0; S.latestBytes = 0; S.offer = false; S.listening = null; S.started = false; S.message = ''; }
