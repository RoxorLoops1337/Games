// Fullscreen helper. Safe under node (everything is a no-op), mockable for tests via setHost({document, window, navigator}).
// Browsers only allow a fullscreen request inside a user gesture, so UI code never calls toggleFullscreen from the canvas tick:
// buttons call requestFs(app) which either was already served by the window pointerup listener (button rects in app.fsRects)
// or sets app.pendingFs, processed by the next window pointerup/keydown. The F key toggles directly (it IS a keydown).
import { COL, W, H } from './core.js';

let host = null;
export function setHost(h) { host = h || null; }
const doc = () => (host ? host.document : globalThis.document) || null;
const win = () => (host ? host.window : globalThis.window) || null;
const nav = () => (host ? host.navigator : globalThis.navigator) || null;

export function isIPhone() { const n = nav(); return !!(n && /iPhone|iPod/.test(n.userAgent || '')); }
function requestFn(d) { const el = d && d.documentElement; return el ? (el.requestFullscreen || el.webkitRequestFullscreen || null) : null; }
export function canFullscreen() {
  const d = doc(); if (!d || isIPhone()) return false;
  if (d.fullscreenEnabled === false) return false;
  return !!requestFn(d);
}
export function isFullscreen() { const d = doc(); return !!(d && (d.fullscreenElement || d.webkitFullscreenElement)); }
export function toggleFullscreen() {
  const d = doc(); if (!d || !canFullscreen()) return false;
  try {
    let r;
    if (isFullscreen()) { const ex = d.exitFullscreen || d.webkitExitFullscreen; if (!ex) return false; r = ex.call(d); }
    else { const el = d.documentElement; r = (el.requestFullscreen || el.webkitRequestFullscreen).call(el); }
    if (r && r.catch) r.catch(() => {});
    return true;
  } catch { return false; }
}
// Called from button clicks seen by the tick.
export function requestFs(app) {
  if (app.fsHandledFrame !== undefined && app.frame - app.fsHandledFrame <= 1) { app.fsHandledFrame = undefined; return; }
  app.pendingFs = true;
}
function typing() { const d = doc(); const a = d && d.activeElement; return !!(a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName || '') || a.isContentEditable)); }
function fsRectsOf(app) { if (app.fsRectsFrame !== app.frame) { app.fsRects = []; app.fsRectsFrame = app.frame; } return app.fsRects; }

export function installFullscreen(app) {
  app.pendingFs = false; app.fs = isFullscreen(); app.fsRects = [];
  const w = win(), d = doc(); if (!w || !w.addEventListener) return;
  const sync = () => {
    app.fs = isFullscreen();
    const st = app.shared && app.shared.meta && app.shared.meta.settings; if (st) st.fullscreen = app.fs;
    if (app.resize) app.resize();
  };
  if (d && d.addEventListener) { d.addEventListener('fullscreenchange', sync); d.addEventListener('webkitfullscreenchange', sync); }
  const flush = () => { if (app.pendingFs) { app.pendingFs = false; toggleFullscreen(); } };
  const toLogical = (e) => {
    const c = app.canvas; const r = c && c.getBoundingClientRect ? c.getBoundingClientRect() : null;
    if (!r || !(r.width > 0)) return null;
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const hit = (e) => { const p = toLogical(e); return !!p && (app.fsRects || []).some((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h); };
  let downIn = false;
  w.addEventListener('pointerdown', (e) => { downIn = hit(e); });
  w.addEventListener('pointerup', (e) => {
    if (downIn && hit(e)) { app.pendingFs = false; app.fsHandledFrame = app.frame; toggleFullscreen(); }
    else flush();
    downIn = false;
  });
  w.addEventListener('keydown', (e) => {
    if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat && !typing()) {
      app.pendingFs = false; app.fsHandledFrame = app.frame; toggleFullscreen(); return;
    }
    flush();
  });
  app.fsSync = sync;
}

export function drawFsIcon(g, x, y, w, h, on) {
  const cx = x + w / 2, cy = y + h / 2, s = Math.min(w, h) * 0.26, a = s * 0.7;
  g.save(); g.strokeStyle = COL.vellum; g.lineWidth = 2.5; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const px = cx + sx * s, py = cy + sy * s, d = on ? -1 : 1; // corners point outward when entering, inward when leaving
    g.moveTo(px - sx * a * d, py); g.lineTo(px, py); g.lineTo(px, py - sy * a * d);
  }
  g.stroke(); g.restore();
}
// A fullscreen icon button. Returns true on click (the request is already queued). Hidden when unsupported.
export function fsButton(app, x, y, w, h, o = {}) {
  if (!canFullscreen()) return false;
  fsRectsOf(app).push({ x, y, w, h });
  if (app.reg) app.reg(o.id || 'fs_btn', x, y, w, h, { layer: 'hud' });
  const on = isFullscreen();
  const over = app.inRect(x, y, w, h);
  if (over) app.tooltip(on ? 'Exit fullscreen' : 'Fullscreen', 'Shortcut: F');
  const hit = app.button('', x, y, w, h, { icon: (g, ix, iy, iw, ih) => drawFsIcon(g, ix, iy, iw, ih, on), stroke: o.stroke });
  if (o.hint) app.text('F', x + w - 9, y + h - 15, { size: 11, ui: true, bold: true, align: 'right', color: 'rgba(242,193,78,.85)', fixed: true });
  if (hit) requestFs(app);
  return hit;
}
// Register an arbitrary clickable rect (pause menu row) so its click is served inside the pointer gesture.
export function fsRegisterRect(app, x, y, w, h) { fsRectsOf(app).push({ x, y, w, h }); }
