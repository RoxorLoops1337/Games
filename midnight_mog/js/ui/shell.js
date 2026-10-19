// Midnight Mog UI shell: the single-canvas immediate-mode toolkit every screen builds on. See docs/UI.md for the contract.
//
// FRAME PROTOCOL (the app loop owns it):
//     ui.begin(dtSeconds);            // resolves input against last frame's hit regions, advances timers
//     screen.update(app, dt, ui); screen.draw(ctx, app, ui);   // widgets register regions as they draw
//     ui.end();                       // dialogs, toasts, tooltip, focus ring, transition, then swaps the region lists
// Widgets are functions: `if (ui.button('play', rect, 'Play', {kind:'primary'})) go()`. Ids must be unique per screen.
// Input: tap, drag, long press, wheel and keyboard (Tab, arrows, Enter, Space, Escape) all resolve to the same ids.
// Render only: nothing here touches sim state. No Math.random. Gradients are cached, nothing allocates in the per-widget path.
import { PAL, FONT, RARITY, rgba, mix, shade, glow, font, rarityColor, prism } from '../palette.js';
import { drawText, wrapText, fitText, formatNum } from '../render/text.js';
import * as CATART from '../render/catart.js';
import * as ICONS from '../render/icons.js';
import * as WORLD from '../render/world.js';
import { CARD_BY_ID } from '../data/cards.js';
import { CAT_BY_ID } from '../data/cats.js';

const TAU = Math.PI * 2;
export const fin = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const outCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const outBack = (t) => { t = clamp(t, 0, 1) - 1; return 1 + 2.70158 * t * t * t + 1.70158 * t * t; };
export const inOutSine = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
/** Cheap deterministic hash of a string or number to 0..1 (per-entity variation without Math.random). */
export function hash01(k) {
  let h = 2166136261;
  const s = String(k);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// ------------------------------------------------------------------------------------------------ drawing helpers
/** Chamfered rectangle path (cut corners, style bible section 5). */
export function chamfer(ctx, x, y, w, h, c) {
  c = Math.max(0, Math.min(c, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + c, y); ctx.lineTo(x + w - c, y); ctx.lineTo(x + w, y + c); ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h); ctx.lineTo(x + c, y + h); ctx.lineTo(x, y + h - c); ctx.lineTo(x, y + c); ctx.closePath();
}
const GRADS = new Map();
/** Cached vertical gradient in local space (0..h). Translate the context to the shape origin before using it. */
export function vgrad(ctx, key, h, c0, c1, c2) {
  const k = key + '|' + Math.round(h);
  let g = GRADS.get(k);
  if (!g) {
    g = ctx.createLinearGradient(0, 0, 0, Math.max(1, h));
    g.addColorStop(0, c0);
    if (c2) { g.addColorStop(0.5, c1); g.addColorStop(1, c2); } else g.addColorStop(1, c1);
    GRADS.set(k, g);
  }
  return g;
}
export function inside(r, x, y) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
export function inset(r, d, d2) { const dy = d2 === undefined ? d : d2; return { x: r.x + d, y: r.y + dy, w: Math.max(0, r.w - d * 2), h: Math.max(0, r.h - dy * 2) }; }
export function R(x, y, w, h) { return { x, y, w, h }; }

/** Small built-in glyph set for icon buttons. All strokes, bone by default. */
export function drawGlyph(ctx, name, cx, cy, s, color, t) {
  color = color || PAL.bone;
  const r = s * 0.5;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const stroke = (w) => { ctx.strokeStyle = PAL.ink; ctx.lineWidth = w + 2.4; ctx.stroke(); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke(); };
  const fillInk = () => { ctx.lineWidth = 2.4; ctx.strokeStyle = PAL.ink; ctx.stroke(); ctx.fillStyle = color; ctx.fill(); };
  const lw = Math.max(1.6, s * 0.11);
  switch (name) {
    case 'pause': ctx.beginPath(); ctx.rect(-r * 0.62, -r * 0.7, r * 0.45, r * 1.4); ctx.rect(r * 0.17, -r * 0.7, r * 0.45, r * 1.4); fillInk(); break;
    case 'play': ctx.beginPath(); ctx.moveTo(-r * 0.5, -r * 0.75); ctx.lineTo(r * 0.8, 0); ctx.lineTo(-r * 0.5, r * 0.75); ctx.closePath(); fillInk(); break;
    case 'close': ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.6); ctx.lineTo(r * 0.6, r * 0.6); ctx.moveTo(r * 0.6, -r * 0.6); ctx.lineTo(-r * 0.6, r * 0.6); stroke(lw * 1.3); break;
    case 'back': ctx.beginPath(); ctx.moveTo(r * 0.5, -r * 0.7); ctx.lineTo(-r * 0.4, 0); ctx.lineTo(r * 0.5, r * 0.7); stroke(lw * 1.3); break;
    case 'plus': ctx.beginPath(); ctx.moveTo(-r * 0.65, 0); ctx.lineTo(r * 0.65, 0); ctx.moveTo(0, -r * 0.65); ctx.lineTo(0, r * 0.65); stroke(lw * 1.3); break;
    case 'check': ctx.beginPath(); ctx.moveTo(-r * 0.65, 0); ctx.lineTo(-r * 0.15, r * 0.5); ctx.lineTo(r * 0.7, -r * 0.5); stroke(lw * 1.4); break;
    case 'speed1': case 'speed2': case 'speed3': {
      const n = name === 'speed1' ? 1 : name === 'speed2' ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const ox = (i - (n - 1) / 2) * r * 0.78;
        ctx.beginPath(); ctx.moveTo(ox - r * 0.38, -r * 0.62); ctx.lineTo(ox + r * 0.4, 0); ctx.lineTo(ox - r * 0.38, r * 0.62); ctx.closePath(); fillInk();
      }
      break;
    }
    case 'auto': {
      ctx.beginPath(); ctx.arc(0, 0, r * 0.62, -0.5, Math.PI * 1.15); stroke(lw);
      ctx.beginPath(); ctx.moveTo(-r * 0.78, -r * 0.1); ctx.lineTo(-r * 0.5, r * 0.5); ctx.lineTo(-r * 0.1, r * 0.1); ctx.closePath(); fillInk();
      ctx.beginPath(); ctx.moveTo(r * 0.12, -r * 0.3); ctx.lineTo(r * 0.12, r * 0.3); ctx.lineTo(r * 0.5, 0); ctx.closePath(); fillInk();
      break;
    }
    case 'cycle': {
      ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0.3, Math.PI * 1.55); stroke(lw);
      ctx.beginPath(); ctx.moveTo(r * 0.1, -r * 0.95); ctx.lineTo(r * 0.62, -r * 0.55); ctx.lineTo(r * 0.0, -r * 0.3); ctx.closePath(); fillInk();
      break;
    }
    case 'gear': {
      ctx.beginPath();
      for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, rr = i % 2 ? r * 0.62 : r * 0.9; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath(); fillInk();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.27, 0, TAU); ctx.fillStyle = PAL.ink; ctx.fill();
      break;
    }
    case 'sound': case 'mute': {
      ctx.beginPath(); ctx.moveTo(-r * 0.8, -r * 0.3); ctx.lineTo(-r * 0.35, -r * 0.3); ctx.lineTo(r * 0.1, -r * 0.75); ctx.lineTo(r * 0.1, r * 0.75); ctx.lineTo(-r * 0.35, r * 0.3); ctx.lineTo(-r * 0.8, r * 0.3); ctx.closePath(); fillInk();
      if (name === 'sound') { ctx.beginPath(); ctx.arc(r * 0.1, 0, r * 0.55, -0.9, 0.9); stroke(lw); ctx.beginPath(); ctx.arc(r * 0.1, 0, r * 0.9, -0.8, 0.8); stroke(lw * 0.8); }
      else { ctx.beginPath(); ctx.moveTo(r * 0.35, -r * 0.4); ctx.lineTo(r * 0.95, r * 0.4); ctx.moveTo(r * 0.95, -r * 0.4); ctx.lineTo(r * 0.35, r * 0.4); stroke(lw); }
      break;
    }
    case 'info': ctx.beginPath(); ctx.moveTo(0, -r * 0.05); ctx.lineTo(0, r * 0.65); stroke(lw * 1.4); ctx.beginPath(); ctx.arc(0, -r * 0.55, lw * 0.9, 0, TAU); fillInk(); break;
    case 'menu': ctx.beginPath(); for (let i = -1; i <= 1; i++) { ctx.moveTo(-r * 0.7, i * r * 0.5); ctx.lineTo(r * 0.7, i * r * 0.5); } stroke(lw * 1.2); break;
    case 'star': {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * TAU, rr = i % 2 ? r * 0.4 : r * 0.9; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath(); fillInk(); break;
    }
    default: ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, TAU); fillInk();
  }
  ctx.restore();
  void t;
}

// ------------------------------------------------------------------------------------------------ button styles
const KINDS = {
  primary: { base: PAL.magenta, text: PAL.bone, stroke: true },
  positive: { base: PAL.lime, text: PAL.ink, stroke: false },
  secondary: { base: PAL.violet, text: PAL.bone, stroke: true },
  danger: { base: PAL.magentaDeep, text: PAL.bone, stroke: true },
  info: { base: PAL.cyanDeep, text: PAL.bone, stroke: true },
  icon: { base: PAL.ink3, text: PAL.bone, stroke: true },
};
const KEYMAP = { ' ': 'space', spacebar: 'space', esc: 'escape', arrowleft: 'left', arrowright: 'right', arrowup: 'up', arrowdown: 'down' };
const CAP_TAP = 9; // px of travel before a press becomes a drag

// ------------------------------------------------------------------------------------------------ createUI
/**
 * createUI(canvas, opts?) -> ui
 * opts: {width, height, dpr} fixed size (tests, labs) | {window, document} injected globals | {maxColumn} (default 520).
 */
export function createUI(canvas, opts = {}) {
  const win = opts.window !== undefined ? opts.window : (typeof window !== 'undefined' ? window : null);
  const doc = opts.document !== undefined ? opts.document : (typeof document !== 'undefined' ? document : null);
  const ctx = canvas.getContext('2d');

  const ui = {
    canvas, ctx, w: 390, h: 800, dpr: 1, t: 0, dt: 1 / 60, frame: 0,
    safe: { top: 0, bottom: 0, left: 0, right: 0 }, col: { x: 0, w: 390 }, content: { x: 0, y: 0, w: 390, h: 800 }, maxColumn: opts.maxColumn || 520,
    reduceMotion: false, keyboard: false, layer: 0,
    renderScale: 1,   // 0.5..1: dynamic resolution, main.js lowers it when the battle cannot hold the frame rate (backing store only, layout and input stay in CSS px)
    // pointer
    px: -1, py: -1, down: false, dragging: false, sx: 0, sy: 0, dx: 0, dy: 0, pointerType: 'mouse', inside: false,
    pressId: '', pressLayer: 0, pressT: 0,
    // resolved per frame by begin()
    hotId: '', tapId: '', longId: '', focusId: '', drop: null, wheel: 0,
    onSound: null, onAnnounce: null,
  };

  // ---- regions (hit testing). Two pooled lists: `cur` is being filled this frame, `prev` is what the player sees.
  let prev = [], cur = [], prevN = 0, curN = 0;
  const makeReg = () => ({ id: '', x: 0, y: 0, w: 0, h: 0, layer: 0, focus: false, label: '' });
  let ox = 0, oy = 0;                 // coordinate offset (scroll containers)
  const clipStack = [];               // absolute rects
  let pendingTap = '', pendingDrop = null, keyPending = [], keyNow = [], moveAcc = { x: 0, y: 0 }, wheelAcc = 0;
  let longFired = false;
  const RS = { hover: false, down: false, tap: false, long: false, focus: false, dragging: false, x: 0, y: 0, w: 0, h: 0 };

  function topAt(x, y, minLayer) {
    let best = null;
    for (let i = 0; i < prevN; i++) {
      const r = prev[i];
      if (r.layer < (minLayer || 0)) continue;
      if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) continue;
      if (!best || r.layer >= best.layer) best = r;
    }
    return best;
  }
  /** Rect {x,y,w,h} of a region drawn last frame (tutorial spotlights, tests), or null. Scroll offsets are already applied. */
  ui.rectOf = function (id) {
    for (let i = 0; i < prevN; i++) if (prev[i].id === id) return { x: prev[i].x, y: prev[i].y, w: prev[i].w, h: prev[i].h };
    return null;
  };
  /** Snapshot of the regions drawn last frame: [{id,x,y,w,h,layer}] (QA tools, monkey tests). Allocates, never call per frame in the game. */
  ui.regionList = function () { const out = []; for (let i = 0; i < prevN; i++) { const r = prev[i]; out.push({ id: r.id, x: r.x, y: r.y, w: r.w, h: r.h, layer: r.layer, label: r.label }); } return out; };
  function topLayer() { let m = 0; for (let i = 0; i < prevN; i++) if (prev[i].layer > m) m = prev[i].layer; return m; }

  // Hit target growth: a control drawn smaller than 44 px gets a 44 px hit region centred on it (the drawing does not change).
  const MIN_HIT = 44;
  const grown = { x: 0, y: 0, w: 0, h: 0 };
  function grow(r) {
    if (r.h >= MIN_HIT && r.w >= MIN_HIT) return r;
    grown.x = r.x; grown.y = r.y; grown.w = r.w; grown.h = r.h;
    if (r.h < MIN_HIT) { grown.y = r.y - (MIN_HIT - r.h) / 2; grown.h = MIN_HIT; }
    if (r.w < MIN_HIT) { grown.x = r.x - (MIN_HIT - r.w) / 2; grown.w = MIN_HIT; }
    return grown;
  }
  /** Register a hit region and read its state. The returned object is shared: read it immediately. */
  function region(id, r, o) {
    let x = r.x + ox, y = r.y + oy, w = r.w, h = r.h;
    if (clipStack.length) {
      const c = clipStack[clipStack.length - 1];
      const x2 = Math.min(x + w, c.x + c.w), y2 = Math.min(y + h, c.y + c.h);
      x = Math.max(x, c.x); y = Math.max(y, c.y); w = Math.max(0, x2 - x); h = Math.max(0, y2 - y);
    }
    let rec = cur[curN];
    if (!rec) { rec = makeReg(); cur[curN] = rec; }
    curN++;
    rec.id = id; rec.x = x; rec.y = y; rec.w = w; rec.h = h; rec.layer = ui.layer;
    rec.focus = !!(o && o.focus); rec.label = (o && o.label) || '';
    const isHot = ui.hotId === id && ui.inside;
    RS.hover = isHot;
    RS.down = ui.down && ui.pressId === id && !ui.dragging;
    RS.dragging = ui.down && ui.pressId === id && ui.dragging;
    RS.tap = ui.tapId === id;
    RS.long = ui.longId === id;
    RS.focus = ui.keyboard && ui.focusId === id;
    RS.x = x; RS.y = y; RS.w = w; RS.h = h;
    return RS;
  }

  // ---- persistent widget state
  const states = new Map();
  function state(key, init) {
    let s = states.get(key);
    if (!s) { s = init ? Object.assign({}, init) : {}; states.set(key, s); }
    s._f = ui.frame;
    return s;
  }
  function sweepStates() {
    if (ui.frame % 600 !== 0) return;
    for (const [k, s] of states) if (ui.frame - s._f > 400) states.delete(k);
  }

  function sound(name) { if (ui.onSound) { try { ui.onSound(name); } catch (e) { /* audio is optional */ } } }

  // ---- live region for screen readers
  let live = null;
  function ensureLive() {
    if (live || !doc || !doc.createElement) return;
    try {
      live = doc.createElement('div');
      live.setAttribute('aria-live', 'polite'); live.setAttribute('role', 'status'); live.setAttribute('aria-atomic', 'true');
      live.style.cssText = 'position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;';
      (doc.body || doc.documentElement).appendChild(live);
      if (canvas.setAttribute) { canvas.setAttribute('tabindex', '0'); canvas.setAttribute('role', 'application'); canvas.setAttribute('aria-label', 'Midnight Mog'); }
    } catch (e) { live = null; }
  }
  ui.announceLog = [];
  ui.announce = function (msg) {
    msg = String(msg || '');
    if (!msg) return;
    ui.announceLog.push(msg); if (ui.announceLog.length > 20) ui.announceLog.shift();
    ensureLive();
    if (live) { live.textContent = ''; live.textContent = msg; }
    if (ui.onAnnounce) ui.onAnnounce(msg);
  };

  // ------------------------------------------------------------------------------------------ sizing
  function readSafeInsets() {
    const s = { top: 0, bottom: 0, left: 0, right: 0 };
    if (!doc || !doc.createElement || !win || !win.getComputedStyle) return s;
    try {
      const d = doc.createElement('div');
      d.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);';
      (doc.body || doc.documentElement).appendChild(d);
      const cs = win.getComputedStyle(d);
      s.top = parseFloat(cs.paddingTop) || 0; s.right = parseFloat(cs.paddingRight) || 0; s.bottom = parseFloat(cs.paddingBottom) || 0; s.left = parseFloat(cs.paddingLeft) || 0;
      d.remove();
    } catch (e) { /* ignore */ }
    return s;
  }
  ui.resize = function (w, h, dpr) {
    let cw = w, ch = h;
    if (!(cw > 0) || !(ch > 0)) {
      cw = opts.width; ch = opts.height;
      if (!(cw > 0) || !(ch > 0)) {
        const rc = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
        cw = (rc && rc.width) || canvas.clientWidth || (win && win.innerWidth) || 390;
        ch = (rc && rc.height) || canvas.clientHeight || (win && win.innerHeight) || 800;
      }
    }
    const d = dpr || opts.dpr || (win && win.devicePixelRatio) || 1;
    ui.dpr = Math.max(0.5, clamp(d, 1, 3) * clamp(ui.renderScale, 0.5, 1));
    ui.w = Math.max(160, Math.round(cw)); ui.h = Math.max(200, Math.round(ch));
    canvas.width = Math.round(ui.w * ui.dpr); canvas.height = Math.round(ui.h * ui.dpr);
    if (canvas.style && !opts.width) { /* css size comes from the stylesheet */ }
    const sf = readSafeInsets();
    ui.safe.top = sf.top; ui.safe.bottom = sf.bottom; ui.safe.left = sf.left; ui.safe.right = sf.right;
    const cwid = Math.min(ui.w - ui.safe.left - ui.safe.right, ui.maxColumn);
    ui.col.w = cwid; ui.col.x = Math.round((ui.w - cwid) / 2);
    ui.content.x = ui.col.x; ui.content.w = cwid;
    ui.content.y = ui.safe.top; ui.content.h = ui.h - ui.safe.top - ui.safe.bottom;
    ui.wide = ui.w > ui.maxColumn * 1.4;
    ctx.setTransform(ui.dpr, 0, 0, ui.dpr, 0, 0);
    try { ICONS.setResolution && ICONS.setResolution(ui.dpr); } catch (e) { /* optional */ }
    return ui;
  };

  // ------------------------------------------------------------------------------------------ layout helpers
  /** 12-column grid cell inside the content column. ui.rect(col,row,colSpan=1,rowSpan=1,{cols:12,rowH:56,gap:10,top:0}) */
  ui.rect = function (col, row, cs, rs, o) {
    o = o || {};
    const cols = o.cols || 12, gap = o.gap === undefined ? 10 : o.gap, rowH = o.rowH || 56, top = o.top === undefined ? 0 : o.top;
    cs = cs || 1; rs = rs || 1;
    const c = ui.content, pad = o.pad === undefined ? 12 : o.pad;
    const cw = (c.w - pad * 2 - gap * (cols - 1)) / cols;
    return { x: c.x + pad + col * (cw + gap), y: c.y + top + row * (rowH + gap), w: cw * cs + gap * (cs - 1), h: rowH * rs + gap * (rs - 1) };
  };
  /** Split a rect into n columns (n number or weights array). */
  ui.cols = function (r, n, gap) {
    gap = gap === undefined ? 8 : gap;
    const wts = Array.isArray(n) ? n : new Array(n).fill(1);
    const tot = wts.reduce((a, b) => a + b, 0), avail = r.w - gap * (wts.length - 1), out = [];
    let x = r.x;
    for (const wt of wts) { const w = (avail * wt) / tot; out.push({ x, y: r.y, w, h: r.h }); x += w + gap; }
    return out;
  };
  ui.rows = function (r, n, gap) {
    gap = gap === undefined ? 8 : gap;
    const wts = Array.isArray(n) ? n : new Array(n).fill(1);
    const tot = wts.reduce((a, b) => a + b, 0), avail = r.h - gap * (wts.length - 1), out = [];
    let y = r.y;
    for (const wt of wts) { const h = (avail * wt) / tot; out.push({ x: r.x, y, w: r.w, h }); y += h + gap; }
    return out;
  };
  /** A w by h rect placed inside r by anchors (0..1). */
  ui.place = function (r, w, h, ax, ay) { ax = ax === undefined ? 0.5 : ax; ay = ay === undefined ? 0.5 : ay; return { x: r.x + (r.w - w) * ax, y: r.y + (r.h - h) * ay, w, h }; };
  ui.inset = inset;
  ui.inside = inside;

  // ------------------------------------------------------------------------------------------ input
  function keyName(k) { k = String(k || '').toLowerCase(); return KEYMAP[k] || k; }
  const input = {
    down(x, y, type) {
      ui.keyboard = false;
      ui.px = x; ui.py = y; ui.sx = x; ui.sy = y; ui.down = true; ui.dragging = false; ui.inside = true; ui.pointerType = type || ui.pointerType;
      const hit = ui.transitioning ? null : topAt(x, y);
      ui.pressId = hit ? hit.id : ''; ui.pressLayer = hit ? hit.layer : 0; ui.pressT = ui.t; longFired = false;
      if (hit && hit.focus) ui.focusId = hit.id;
    },
    move(x, y, type) {
      if (type) ui.pointerType = type;
      moveAcc.x += x - ui.px; moveAcc.y += y - ui.py;
      ui.px = x; ui.py = y; ui.inside = true;
      if (ui.down && !ui.dragging) {
        const dx = x - ui.sx, dy = y - ui.sy;
        if (dx * dx + dy * dy > CAP_TAP * CAP_TAP) ui.dragging = true;
      }
    },
    up(x, y) {
      if (x !== undefined) { ui.px = x; ui.py = y; }
      if (!ui.down) return;
      ui.down = false;
      if (ui.dragging) { pendingDrop = { id: ui.pressId, x: ui.px, y: ui.py }; }
      else if (ui.pressId) {
        const hit = topAt(ui.px, ui.py);
        if (hit && hit.id === ui.pressId) pendingTap = hit.id;
      }
      ui.dragging = false;
      if (ui.pointerType !== 'mouse') ui.inside = false;
    },
    leave() { ui.inside = false; },
    wheel(dy) { wheelAcc += dy; },
    key(k) {
      const n = keyName(k);
      keyPending.push(n);
      ui.keyboard = true;
    },
  };
  ui.input = input;

  function focusables() {
    const top = topLayer();
    const out = [];
    for (let i = 0; i < prevN; i++) if (prev[i].focus && prev[i].layer === top && prev[i].w > 0 && prev[i].h > 0) out.push(prev[i]);
    return out;
  }
  function focusMove(dir, spatial) {
    const list = focusables();
    if (!list.length) return;
    const curIdx = list.findIndex((r) => r.id === ui.focusId);
    if (curIdx < 0) { ui.focusId = list[0].id; announceFocus(list[0]); return; }
    let nxt = null;
    if (spatial) {
      const c = list[curIdx], cx = c.x + c.w / 2, cy = c.y + c.h / 2;
      let bd = 1e9;
      for (let i = 0; i < list.length; i++) {
        if (i === curIdx) continue;
        const r = list[i], dx = r.x + r.w / 2 - cx, dy = r.y + r.h / 2 - cy;
        const along = spatial === 'left' ? -dx : spatial === 'right' ? dx : spatial === 'up' ? -dy : dy;
        if (along <= 1) continue;
        const across = spatial === 'left' || spatial === 'right' ? Math.abs(dy) : Math.abs(dx);
        const d = along + across * 2.2;
        if (d < bd) { bd = d; nxt = r; }
      }
      if (!nxt) return;
    } else nxt = list[(curIdx + dir + list.length) % list.length];
    ui.focusId = nxt.id; announceFocus(nxt); sound('ui_focus');
  }
  function announceFocus(r) { if (r && r.label) ui.announce(r.label); }

  ui.keyHit = (name) => keyNow.indexOf(name) >= 0;
  /** Consume a key so later readers (and the shell) do not see it. */
  ui.eatKey = (name) => { const i = keyNow.indexOf(name); if (i >= 0) keyNow.splice(i, 1); return i >= 0; };
  ui.keysHit = () => keyNow;

  // ------------------------------------------------------------------------------------------ dialogs, toasts, tooltip, transition (state)
  const dialogs = [];
  const toasts = [];
  let tip = null;
  const tipBuf = { x: 0, y: 0, w: 0, h: 0, title: '', text: '', on: false };
  ui.trans = null;
  ui.transitioning = false;

  // ------------------------------------------------------------------------------------------ frame begin / end
  ui.begin = function (dt) {
    dt = clamp(fin(dt, 1 / 60), 0, 0.1);
    ui.dt = dt; ui.t += dt; ui.frame++;
    // swap key buffers
    keyNow.length = 0;
    for (let i = 0; i < keyPending.length; i++) keyNow.push(keyPending[i]);
    keyPending.length = 0;
    ui.dx = moveAcc.x; ui.dy = moveAcc.y; moveAcc.x = 0; moveAcc.y = 0;
    ui.wheel = wheelAcc; wheelAcc = 0;
    ui.tapId = pendingTap; pendingTap = '';
    ui.drop = pendingDrop; pendingDrop = null;
    ui.longId = '';
    if (ui.down && !ui.dragging && !longFired && ui.pressId && ui.t - ui.pressT >= 0.5) { ui.longId = ui.pressId; longFired = true; sound('ui_long'); }
    const hit = ui.inside ? topAt(ui.px, ui.py) : null;
    ui.hotId = hit ? hit.id : '';
    // keyboard: dialogs get Escape first, then focus navigation
    if (keyNow.length) {
      if (ui.eatKey('tab')) focusMove(ui.keyHitShift ? -1 : 1);
      const dirs = ['left', 'right', 'up', 'down'];
      for (let i = 0; i < dirs.length; i++) if (ui.keyHit(dirs[i]) && focusables().length > 1 && ui.keyboard) { if (ui.focusId) { focusMove(0, dirs[i]); ui.eatKey(dirs[i]); } }
      if (ui.keyHit('enter') || ui.keyHit('space')) {
        const f = ui.focusId && focusables().find((r) => r.id === ui.focusId);
        if (f) { pendingTap = ''; ui.tapId = f.id; ui.eatKey('enter'); ui.eatKey('space'); }
      }
      if (dialogs.length && ui.keyHit('escape')) {
        const d = dialogs[dialogs.length - 1];
        if (d.dismiss !== false) { ui.eatKey('escape'); closeDialog(d, d.cancelId || 'cancel'); }
      }
    }
    if (ui.focusId && !focusables().some((r) => r.id === ui.focusId) && ui.keyboard) ui.focusId = '';
    if (ui.transitioning) { ui.tapId = ''; ui.longId = ''; ui.drop = null; }
    curN = 0; ox = 0; oy = 0; clipStack.length = 0; ui.layer = 0; tip = null; tipBuf.on = false;
    sweepStates();
    return ui;
  };

  ui.end = function () {
    // top layers: dialogs, toasts, tooltip, transition
    drawDialogs();
    drawToasts();
    drawTip();
    drawTransition();
    // swap region lists
    const t = prev; prev = cur; cur = t; prevN = curN; curN = 0;
    ui.tapId = ''; ui.longId = ''; ui.drop = null;
    return ui;
  };

  /** Convenience: begin(dt), fn(ui), end(). */
  ui.run = function (dt, fn) { ui.begin(dt); fn(ui); ui.end(); };

  // layers: widgets drawn inside a layer sit above lower layers and block them
  ui.pushLayer = () => { ui.layer++; return ui.layer; };
  ui.popLayer = () => { ui.layer = Math.max(0, ui.layer - 1); };
  /** Full-screen region on the current layer that swallows input (used under dialogs and menus). */
  ui.block = (id) => region(id || '__block', { x: -ox, y: -oy, w: ui.w, h: ui.h }, null);
  ui.region = region;

  // ------------------------------------------------------------------------------------------ ctx helpers
  ui.sound = sound;
  ui.state = state;
  ui.text = function (str, x, y, o) { return drawText(ctx, str, x, y, o); };
  ui.wrap = function (str, maxW, o) { return wrapText(ctx, str, maxW, o); };
  ui.fit = function (str, maxW, o) { return fitText(ctx, str, maxW, o); };
  ui.num = formatNum;
  ui.clear = function (color) { ctx.setTransform(ui.dpr, 0, 0, ui.dpr, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = color || PAL.ink; ctx.fillRect(0, 0, ui.w, ui.h); };
  ui.withClip = function (r, fn, c) {
    ctx.save();
    chamfer(ctx, r.x, r.y, r.w, r.h, c || 0); ctx.clip();
    clipStack.push({ x: r.x + ox, y: r.y + oy, w: r.w, h: r.h });
    try { fn(); } finally { clipStack.pop(); ctx.restore(); }
  };

  ui.vignette = function (alpha) {
    const g = ctx.createRadialGradient(ui.w / 2, ui.h / 2, Math.min(ui.w, ui.h) * 0.35, ui.w / 2, ui.h / 2, Math.max(ui.w, ui.h) * 0.75);
    g.addColorStop(0, rgba(PAL.ink, 0)); g.addColorStop(1, rgba(PAL.void, alpha === undefined ? 0.55 : alpha));
    ctx.fillStyle = g; ctx.fillRect(0, 0, ui.w, ui.h);
  };
  ui.scanlines = function (a) {
    ctx.fillStyle = rgba(PAL.void, a === undefined ? 0.06 : a);
    for (let y = 0; y < ui.h; y += 3) ctx.fillRect(0, y, ui.w, 1);
  };
  // ---- cached layers: a slow animated backdrop (window lights, weather) is painted into an offscreen canvas at a low rate and
  // blitted every frame. Rasterising the city each frame costs about 17 ms on software canvases; the blit costs almost nothing.
  // Without a document (tests) it returns false and the caller paints directly.
  const layers = new Map();
  ui.cachedDraw = function (key, x, y, w, h, interval, paint) {
    if (!doc || !doc.createElement || ui.noLayerCache || !(w > 0) || !(h > 0)) return false;
    const px = Math.max(1, Math.round(w * ui.dpr)), py = Math.max(1, Math.round(h * ui.dpr));
    let L = layers.get(key);
    if (!L || L.px !== px || L.py !== py) {
      let cv = null, cx = null;
      try { cv = doc.createElement('canvas'); cv.width = px; cv.height = py; cx = cv.getContext && cv.getContext('2d'); } catch (e) { cx = null; }
      if (!cx) return false;
      if (layers.size > 10) layers.delete(layers.keys().next().value);
      L = { cv, cx, px, py, t: -1e9 };
      layers.set(key, L);
    }
    if (ui.t - L.t >= interval) {
      L.cx.setTransform(ui.dpr, 0, 0, ui.dpr, 0, 0); L.cx.globalAlpha = 1; L.cx.globalCompositeOperation = 'source-over';
      L.cx.clearRect(0, 0, w, h);
      paint(L.cx, w, h, ui.t);
      L.t = ui.t;
    }
    ctx.drawImage(L.cv, x, y, w, h);
    return true;
  };
  /** Night-city backdrop for menu screens. districtId optional. Falls back to a plain gradient if world.js is unavailable. */
  ui.background = function (districtId, o) {
    o = o || {};
    let done = false;
    const did = districtId || 'rooftop_row';
    if (WORLD.drawTownBackdrop) {
      try {
        done = ui.cachedDraw('bg:' + did, 0, 0, ui.w, ui.h, 0.1, (c, w, h, t) => WORLD.drawTownBackdrop(c, w, h, t, { districtId: did }));
        if (!done) { WORLD.drawTownBackdrop(ctx, ui.w, ui.h, ui.t, { districtId: did }); done = true; }
      } catch (e) { done = false; }
    }
    if (!done) {
      const g = vgrad(ctx, 'bg', ui.h, PAL.void, PAL.ink3, PAL.violet);
      ctx.fillStyle = g; ctx.fillRect(0, 0, ui.w, ui.h);
    }
    if (o.dim) { ctx.fillStyle = rgba(PAL.void, o.dim); ctx.fillRect(0, 0, ui.w, ui.h); }
    ui.vignette(0.5);
  };

  // ------------------------------------------------------------------------------------------ widgets
  function focusRing(x, y, w, h, c) {
    ctx.save();
    chamfer(ctx, x - 4, y - 4, w + 8, h + 8, c + 2);
    ctx.setLineDash([7, 4]); ctx.lineDashOffset = -ui.t * 18;
    ctx.strokeStyle = PAL.ink; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = PAL.cyan; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }

  /**
   * Button. Returns true on the frame it is tapped (mouse, touch or Enter/Space).
   * o: {kind:'primary'|'positive'|'secondary'|'danger'|'info'|'icon', icon:'pause'|fn(ctx,cx,cy,size,t), disabled, size, badge, sub, aria, toggled, pulse, noSound}
   */
  ui.button = function (id, r, label, o) {
    o = o || {};
    const disabled = !!o.disabled;
    const k = KINDS[o.kind] || (o.icon ? KINDS.icon : KINDS.secondary);
    const st = region(id, grow(r), { focus: !disabled, label: o.aria || (typeof label === 'string' ? label : o.icon || id) });
    const hover = st.hover, isDown = st.down && !disabled, tapped = st.tap, focused = st.focus;
    const S = state('btn:' + id, { pr: 0, hv: 0 });
    S.pr += ((isDown ? 1 : 0) - S.pr) * Math.min(1, ui.dt * 28);
    S.hv += ((hover && !disabled ? 1 : 0) - S.hv) * Math.min(1, ui.dt * 14);
    const w = r.w, h = r.h, c = Math.min(6, h * 0.22);
    const x = r.x, y = r.y + S.pr * 2;
    const base = disabled ? PAL.slate : k.base;
    ctx.save();
    ctx.translate(x, y);
    // bloom: strong when primary and idle-pulsing, brighter on hover, big when pressed
    if (!disabled) {
      const pulse = o.pulse ? 0.5 + 0.5 * Math.sin(ui.t * 4) : 0;
      const ga = (o.kind === 'primary' || o.kind === 'positive' ? 0.22 : 0.1) + S.hv * 0.18 + S.pr * 0.25 + pulse * 0.25;
      glow(ctx, w / 2, h / 2, Math.max(w, h) * 0.85, base, ga);
    }
    // drop slab (the lip under the button) that disappears when pressed
    if (!isDown) { chamfer(ctx, 0, 3, w, h, c); ctx.fillStyle = shade(base, -0.6); ctx.fill(); }
    // ink outline, then gradient body
    chamfer(ctx, 0, 0, w, h, c); ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = PAL.ink; ctx.stroke();
    ctx.fillStyle = vgrad(ctx, 'btn' + base + (S.hv > 0.5 ? 'h' : ''), h, shade(base, 0.15 + S.hv * 0.08), shade(base, -0.2));
    ctx.fill();
    // inner highlight and frame
    ctx.save(); chamfer(ctx, 0, 0, w, h, c); ctx.clip();
    ctx.fillStyle = rgba(PAL.bone, disabled ? 0.1 : 0.5); ctx.fillRect(c, 2, w - c * 2, 2);
    ctx.fillStyle = rgba(PAL.bone, 0.06); ctx.fillRect(0, 0, w, h * 0.45);
    if (!disabled && o.kind !== 'icon') { ctx.fillStyle = rgba(PAL.magenta, 0.0); }
    // diagonal scanning shine on primary
    if (!disabled && o.kind === 'primary' && !ui.reduceMotion) {
      const ph = ((ui.t * 0.45 + hash01(id)) % 1.6) - 0.3;
      ctx.fillStyle = rgba(PAL.bone, 0.16);
      ctx.beginPath(); const sx = ph * (w + h);
      ctx.moveTo(sx - h * 0.5, 0); ctx.lineTo(sx - h * 0.5 + 12, 0); ctx.lineTo(sx - h * 1.5 + 12, h); ctx.lineTo(sx - h * 1.5, h); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    chamfer(ctx, 1, 1, w - 2, h - 2, c); ctx.lineWidth = 1; ctx.strokeStyle = rgba(shade(base, 0.45), disabled ? 0.3 : 0.7); ctx.stroke();
    if (o.toggled) { chamfer(ctx, 1, 1, w - 2, h - 2, c); ctx.lineWidth = 2; ctx.strokeStyle = PAL.cyan; ctx.stroke(); glow(ctx, w / 2, h / 2, Math.max(w, h) * 0.7, PAL.cyan, 0.2); }
    // content
    const col = disabled ? PAL.bone : k.text;   // bone on the slate fill is 5.3:1 (boneDim at 0.7 was 2:1)
    if (o.icon) {
      const s = o.size || Math.min(w, h) * 0.56;
      if (typeof o.icon === 'function') o.icon(ctx, w / 2, h / 2, s, ui.t);
      else drawGlyph(ctx, o.icon, w / 2, h / 2, s, disabled ? PAL.boneDim : PAL.bone, ui.t);
    } else if (label !== undefined && label !== null && label !== '') {
      const size = o.size || clamp(h * 0.4, 12, 24);
      const hasSub = !!o.sub;
      drawText(ctx, label, w / 2, h / 2 + size * (hasSub ? 0.08 : 0.34) - (hasSub ? size * 0.28 : 0), { size, kind: 'display', color: col, align: 'center', maxWidth: w - 14, stroke: k.stroke && !disabled ? Math.max(3, size * 0.16) : false });
      if (hasSub) drawText(ctx, o.sub, w / 2, h / 2 + size * 0.82, { size: clamp(size * 0.55, 11, 15), kind: 'body', weight: 700, color: disabled ? PAL.bone : (o.kind === 'positive' ? PAL.ink : PAL.bone), align: 'center', maxWidth: w - 14, stroke: o.kind === 'positive' ? false : 2 });
    }
    ctx.restore();
    if (o.badge) ui.badge(r.x + r.w - 4, r.y + 2, o.badge);
    if (focused && !disabled) focusRing(r.x, r.y, w, h, c);
    if (tapped) {
      if (disabled) { sound('ui_deny'); return false; }
      if (!o.noSound) sound(o.sfx || 'ui_tap');
      return true;
    }
    return false;
  };

  /** Panel with chamfered frame. o: {rarity, title, fill, glow:boolean, pad, alpha} Returns the inner content rect. */
  ui.panel = function (r, o) {
    o = o || {};
    const rar = o.rarity && RARITY[o.rarity] ? o.rarity : null;
    const col = rar ? (rar === 'mythic' ? prism(ui.t) : RARITY[rar].color) : (o.color || PAL.violet);
    const c = o.chamfer === undefined ? 6 : o.chamfer;
    const x = r.x, y = r.y, w = r.w, h = r.h;
    ctx.save();
    ctx.translate(x, y);
    if ((o.glow || (rar && RARITY[rar].glowAlpha > 0.3)) && !o.noGlow) glow(ctx, w / 2, h / 2, Math.max(w, h) * 0.75, col, rar ? RARITY[rar].glowAlpha * 0.35 : 0.14);
    chamfer(ctx, 0, 0, w, h, c); ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = PAL.ink; ctx.stroke();
    ctx.globalAlpha *= o.alpha === undefined ? 0.97 : o.alpha;
    ctx.fillStyle = o.fill || vgrad(ctx, 'panel', h, PAL.ink3, PAL.ink2, PAL.ink2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.save(); chamfer(ctx, 0, 0, w, h, c); ctx.clip();
    // faint halftone dots in the lower right
    ctx.fillStyle = rgba(PAL.violet, 0.18);
    for (let yy = h - 6; yy > h * 0.55; yy -= 6) for (let xx = w - 6 - (((h - yy) / 6) & 1) * 3; xx > w * 0.5; xx -= 6) { const d = (xx / w - 0.5) * (yy / h - 0.55) * 4; ctx.beginPath(); ctx.arc(xx, yy, clamp(d, 0, 1.2), 0, TAU); ctx.fill(); }
    ctx.restore();
    chamfer(ctx, 0, 0, w, h, c); ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke();
    chamfer(ctx, 4, 4, w - 8, h - 8, Math.max(0, c - 2)); ctx.lineWidth = 1; ctx.strokeStyle = rgba(PAL.bone, 0.08); ctx.stroke();
    // cyan highlight line along the top-left
    ctx.strokeStyle = rgba(PAL.cyan, 0.85); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(c, 1); ctx.lineTo(Math.min(w * 0.45, 140), 1); ctx.moveTo(1, c); ctx.lineTo(1, Math.min(h * 0.4, 60)); ctx.stroke();
    ctx.restore();
    let top = 0;
    if (o.title) {
      const tw = Math.min(w - 24, Math.max(90, o.title.length * 11 + 36));
      ctx.save(); ctx.translate(x + 12, y - 11);
      chamfer(ctx, 0, 0, tw, 24, 5); ctx.lineWidth = 5; ctx.strokeStyle = PAL.ink; ctx.stroke();
      ctx.fillStyle = vgrad(ctx, 'ptitle', 24, shade(col, -0.1), shade(col, -0.5)); ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = rgba(PAL.bone, 0.5); chamfer(ctx, 1, 1, tw - 2, 22, 4); ctx.stroke();
      drawText(ctx, o.title, tw / 2, 17, { size: 14, kind: 'display', align: 'center', maxWidth: tw - 12, color: PAL.bone, stroke: 3 });
      ctx.restore();
      top = 18;
    }
    const pad = o.pad === undefined ? 10 : o.pad;
    return { x: x + pad, y: y + pad + top, w: Math.max(0, w - pad * 2), h: Math.max(0, h - pad * 2 - top) };
  };

  /** Tabs. items: [{id,label,badge?}]. Returns the id that is active afterwards (changes on tap). */
  ui.tabs = function (id, r, items, active) {
    const n = items.length, gap = 4, tw = (r.w - gap * (n - 1)) / n;
    let out = active;
    for (let i = 0; i < n; i++) {
      const it = items[i], x = r.x + i * (tw + gap), on = it.id === active;
      const st = region(id + ':' + it.id, grow({ x, y: r.y, w: tw, h: r.h }), { focus: true, label: it.label + (on ? ', selected' : '') });
      const S = state('tab:' + id + ':' + it.id, { a: on ? 1 : 0 });
      S.a += ((on ? 1 : 0) - S.a) * Math.min(1, ui.dt * 16);
      ctx.save(); ctx.translate(x, r.y);
      const h = r.h, c = 6;
      ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(0, c); ctx.lineTo(c, 0); ctx.lineTo(tw - c, 0); ctx.lineTo(tw, c); ctx.lineTo(tw, h); ctx.closePath();
      ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = PAL.ink; ctx.stroke();
      ctx.fillStyle = mix(PAL.ink2, mix(PAL.cyanDeep, PAL.ink3, 0.4), S.a); ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = on ? PAL.cyan : rgba(PAL.violet, 1); ctx.stroke();
      if (S.a > 0.05) { glow(ctx, tw / 2, h, tw * 0.7, PAL.cyan, 0.25 * S.a); ctx.fillStyle = PAL.cyan; ctx.fillRect(6, h - 3, tw - 12, 3); }
      drawText(ctx, it.label, tw / 2, h / 2 + 6, { size: clamp(h * 0.38, 12, 17), kind: 'display', align: 'center', color: on ? PAL.bone : PAL.violetText, maxWidth: tw - 10, stroke: on ? 3 : 2 });
      ctx.restore();
      if (it.badge) ui.badge(x + tw - 6, r.y + 4, it.badge);
      if (st.focus) focusRing(x, r.y, tw, r.h, 6);
      if (st.tap && !on) { out = it.id; sound('ui_tab'); }
    }
    return out;
  };

  /**
   * Scroll list with inertia, wheel, drag and an elastic edge. fn(ctx, w, scrollY, viewH) draws in local coordinates (0,0 is the
   * view's top-left plus scroll) and registers widgets normally. o: {axis:'y'|'x', pad, bar:true}. Returns the scroll state.
   */
  ui.scroll = function (id, r, contentSize, fn, o) {
    o = o || {};
    const horiz = o.axis === 'x';
    const S = state('scr:' + id, { p: 0, v: 0, drag: false });
    const view = horiz ? r.w : r.h;
    const maxP = Math.max(0, contentSize - view);
    const st = region(id, r, null);
    const inView = ui.inside && inside({ x: r.x + ox, y: r.y + oy, w: r.w, h: r.h }, ui.px, ui.py) && ui.layer >= topLayer();
    const startsIn = ui.down && ui.pressLayer === ui.layer && inside({ x: r.x + ox, y: r.y + oy, w: r.w, h: r.h }, ui.sx, ui.sy);
    if (startsIn && ui.dragging) {
      const d = horiz ? ui.dx : ui.dy;
      let p = S.p - d * ((S.p < 0 || S.p > maxP) ? 0.5 : 1);
      S.v = lerp(S.v, -d / Math.max(ui.dt, 1 / 120), 0.35);
      S.p = p; S.drag = true;
    } else {
      S.drag = false;
      if (inView && ui.wheel) { S.p = clamp(S.p + ui.wheel * 0.8, 0, maxP); S.v = 0; }
      if (S.p < 0 || S.p > maxP) { // spring back
        const target = S.p < 0 ? 0 : maxP;
        S.p += (target - S.p) * Math.min(1, ui.dt * 14); S.v = 0;
        if (Math.abs(S.p - target) < 0.3) S.p = target;
      } else if (Math.abs(S.v) > 4 && !ui.reduceMotion) {
        S.p += S.v * ui.dt; S.v *= Math.pow(0.04, ui.dt);
        if (S.p < 0 || S.p > maxP) S.v *= 0.3;
      } else S.v = 0;
    }
    if (!(maxP > 0)) { S.p = 0; S.v = 0; }
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
    clipStack.push({ x: r.x + ox, y: r.y + oy, w: r.w, h: r.h });
    const oox = ox, ooy = oy;
    if (horiz) { ox += r.x - S.p; oy += r.y; ctx.translate(r.x - S.p, r.y); } else { ox += r.x; oy += r.y - S.p; ctx.translate(r.x, r.y - S.p); }
    try { fn(ctx, horiz ? contentSize : r.w, S.p, view); } finally { ox = oox; oy = ooy; clipStack.pop(); ctx.restore(); }
    // slim neon scroll bar + edge fades
    if (maxP > 0 && o.bar !== false) {
      const frac = view / contentSize, len = Math.max(24, view * frac), pos = (S.p / maxP) * (view - len);
      const a = clamp(0.25 + Math.min(1, Math.abs(S.v) / 200) * 0.6 + (S.drag ? 0.4 : 0), 0, 1);
      ctx.fillStyle = rgba(PAL.cyan, 0.5 * a);
      if (horiz) ctx.fillRect(r.x + pos, r.y + r.h - 3, len, 2); else ctx.fillRect(r.x + r.w - 3, r.y + pos, 2, len);
    }
    void st;
    return S;
  };

  /**
   * Bar. v 0..1. o: {kind:'hp'|'energy'|'progress'|'xp', segments:n, label:'12/40', markers:[0..1], id (for the trailing ghost), h}
   */
  ui.bar = function (r, v, o) {
    o = o || {};
    v = clamp(fin(v), 0, 1);
    const kind = o.kind || 'progress';
    const col = kind === 'hp' ? PAL.hp : kind === 'energy' ? PAL.energy : kind === 'xp' ? PAL.violetHi : PAL.lime;
    const back = kind === 'hp' ? PAL.hpBack : PAL.ink2;
    const c = Math.min(4, r.h * 0.3);
    let ghost = v;
    if (o.id) {
      const S = state('bar:' + o.id, { g: v });
      if (v >= S.g) S.g = v; else S.g += (v - S.g) * Math.min(1, ui.dt * 2.2);
      ghost = S.g;
    }
    ctx.save(); ctx.translate(r.x, r.y);
    const w = r.w, h = r.h;
    chamfer(ctx, 0, 0, w, h, c); ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = PAL.ink; ctx.stroke();
    ctx.fillStyle = back; ctx.fill();
    ctx.save(); chamfer(ctx, 0, 0, w, h, c); ctx.clip();
    const iw = w - 4;
    if (ghost > v + 0.002) { ctx.fillStyle = rgba(PAL.bone, 0.75); ctx.fillRect(2, 2, iw * ghost, h - 4); }
    if (v > 0) {
      ctx.fillStyle = vgrad(ctx, 'bar' + col, h, shade(col, 0.2), shade(col, -0.25));
      ctx.fillRect(2, 2, iw * v, h - 4);
      ctx.fillStyle = rgba(PAL.bone, 0.75); ctx.fillRect(2, 2, iw * v, 1);
      if (!ui.reduceMotion) { const sx = ((ui.t * 0.6) % 1.4 - 0.2) * iw; ctx.fillStyle = rgba(PAL.bone, 0.18); ctx.fillRect(Math.min(sx, iw * v - 8), 2, 8, h - 4); }
    }
    if (o.segments > 1) { ctx.fillStyle = rgba(PAL.ink, 0.8); for (let i = 1; i < o.segments; i++) ctx.fillRect(2 + (iw * i) / o.segments - 0.5, 2, 1, h - 4); }
    ctx.restore();
    chamfer(ctx, 0, 0, w, h, c); ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(shade(col, -0.2), 0.9); ctx.stroke();
    if (v > 0.02 && v < 1) glow(ctx, 2 + iw * v, h / 2, h * 1.6, col, 0.35);
    if (o.markers) for (let i = 0; i < o.markers.length; i++) { const mx = 2 + iw * o.markers[i]; ctx.fillStyle = rgba(PAL.bone, 0.7); ctx.fillRect(mx - 0.5, 1, 1, h - 2); }
    ctx.restore();
    if (o.label) drawText(ctx, o.label, r.x + r.w / 2, r.y + r.h / 2 + Math.min(5, r.h * 0.28), { size: clamp(r.h * 0.72, 10, 16), kind: 'body', weight: 800, align: 'center', color: PAL.bone, stroke: 3 });
  };

  /** Toggle switch (chamfered, not a pill). Returns the new value. */
  ui.toggle = function (id, r, value, label) {
    const st = region(id, grow(r), { focus: true, label: (label || id) + (value ? ', on' : ', off') });
    const S = state('tg:' + id, { a: value ? 1 : 0 });
    S.a += ((value ? 1 : 0) - S.a) * Math.min(1, ui.dt * 18);
    const tw = Math.min(64, r.w), th = Math.min(r.h, 32), tx = r.x + r.w - tw, ty = r.y + (r.h - th) / 2;
    if (label) drawText(ctx, label, r.x, r.y + r.h / 2 + 5, { size: 15, kind: 'body', color: PAL.bone, maxWidth: r.w - tw - 10 });
    ctx.save(); ctx.translate(tx, ty);
    chamfer(ctx, 0, 0, tw, th, 6); ctx.lineWidth = 5; ctx.strokeStyle = PAL.ink; ctx.stroke();
    ctx.fillStyle = mix(PAL.ink2, PAL.limeDeep, S.a); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = mix(PAL.violet, PAL.lime, S.a); ctx.stroke();
    const kw = th - 8, kx = 4 + (tw - kw - 8) * S.a;
    if (S.a > 0.1) glow(ctx, kx + kw / 2, th / 2, th, PAL.lime, 0.3 * S.a);
    chamfer(ctx, kx, 4, kw, th - 8, 4); ctx.lineWidth = 3; ctx.strokeStyle = PAL.ink; ctx.stroke();
    ctx.fillStyle = mix(PAL.boneDim, PAL.bone, S.a); ctx.fill();
    ctx.restore();
    if (st.focus) focusRing(r.x, r.y, r.w, r.h, 6);
    if (st.tap) { sound('ui_toggle'); return !value; }
    return value;
  };

  /** Slider. Returns the new value. o: {min,max,step,label,format(v)->string} */
  ui.slider = function (id, r, value, o) {
    o = o || {};
    const min = o.min === undefined ? 0 : o.min, max = o.max === undefined ? 1 : o.max, step = o.step || 0;
    const st = region(id, r, { focus: true, label: (o.label || id) + ', ' + Math.round(value * 100) / 100 });
    const trackX = r.x + 8, trackW = r.w - 16, cy = r.y + (o.label ? r.h * 0.68 : r.h / 2);
    let v = value;
    if ((st.down || st.dragging) || (ui.down && ui.pressId === id)) {
      let f = clamp((ui.px - trackX) / trackW, 0, 1);
      v = min + f * (max - min);
      if (step) v = Math.round(v / step) * step;
    } else if (st.focus) {
      if (ui.keyHit('left')) v = clamp(value - (step || (max - min) / 20), min, max);
      if (ui.keyHit('right')) v = clamp(value + (step || (max - min) / 20), min, max);
    }
    const f = clamp((v - min) / (max - min || 1), 0, 1);
    ctx.save();
    chamfer(ctx, trackX, cy - 4, trackW, 8, 3); ctx.lineWidth = 5; ctx.strokeStyle = PAL.ink; ctx.stroke(); ctx.fillStyle = PAL.ink2; ctx.fill();
    ctx.fillStyle = PAL.cyan; ctx.fillRect(trackX + 1, cy - 3, (trackW - 2) * f, 6);
    glow(ctx, trackX + trackW * f, cy, 20, PAL.cyan, 0.4);
    ctx.translate(trackX + trackW * f, cy);
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(9, 0); ctx.lineTo(0, 11); ctx.lineTo(-9, 0); ctx.closePath();
    ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = PAL.ink; ctx.stroke(); ctx.fillStyle = PAL.bone; ctx.fill();
    ctx.restore();
    if (o.label) drawText(ctx, o.label + (o.format ? '  ' + o.format(v) : ''), r.x + 4, r.y + 11, { size: 13, kind: 'body', color: PAL.boneDim });
    if (st.focus) focusRing(r.x, r.y, r.w, r.h, 4);
    return v;
  };

  /** Small notification badge (count or '!'). (x,y) is the centre. */
  ui.badge = function (x, y, text, o) {
    o = o || {};
    const s = String(text === true ? '!' : text);
    const r = Math.max(8, s.length * 4 + 5);
    ctx.save();
    glow(ctx, x, y, r * 2.2, o.color || PAL.magenta, 0.35);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.lineWidth = 3; ctx.strokeStyle = PAL.ink; ctx.stroke();
    ctx.fillStyle = o.color || PAL.magenta; ctx.fill();
    ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.3, r * 0.35, 0, TAU); ctx.fillStyle = rgba(PAL.bone, 0.35); ctx.fill();
    drawText(ctx, s, x, y + 4.5, { size: 12, kind: 'body', weight: 800, align: 'center', color: PAL.bone, stroke: 2.5 });
    ctx.restore();
  };

  /** Counting number: returns the displayed value easing toward target. Snaps with reduced motion. */
  ui.ticker = function (key, target, o) {
    const S = state('tk:' + key, { v: o && o.from !== undefined ? o.from : target });
    target = fin(target);
    const rate = (o && o.rate) || 6;
    if (ui.reduceMotion) S.v = target;
    else {
      const d = target - S.v;
      if (Math.abs(d) < 0.5) S.v = target;
      else S.v += d * (1 - Math.exp(-rate * ui.dt)) + Math.sign(d) * Math.min(Math.abs(d), (o && o.min ? o.min : 1) * ui.dt * 30);
      if ((d > 0 && S.v > target) || (d < 0 && S.v < target)) S.v = target;
    }
    S.busy = S.v !== target;
    return S.v;
  };

  /** Row of currency counters. cur = {fish,yarn,gems,tokens}. Returns the id of a tapped currency, else ''. o: {show:[..], size} */
  ui.currencyStrip = function (r, cur, o) {
    o = o || {};
    const show = o.show || ['fish', 'yarn', 'gems', 'tokens'];
    const cells = ui.cols(r, show.length, 6);
    let tapped = '';
    for (let i = 0; i < show.length; i++) {
      const id = show[i], cr = cells[i];
      const st = region('cur:' + id, grow(cr), { focus: true, label: id + ' ' + formatNum(fin(cur && cur[id])) });
      const col = id === 'fish' ? PAL.bone : id === 'yarn' ? PAL.magenta : id === 'gems' ? PAL.cyan : PAL.lime;
      ctx.save(); ctx.translate(cr.x, cr.y);
      chamfer(ctx, 0, 0, cr.w, cr.h, 5); ctx.lineWidth = 5; ctx.strokeStyle = PAL.ink; ctx.stroke();
      ctx.fillStyle = vgrad(ctx, 'cstrip', cr.h, PAL.ink3, PAL.ink); ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = rgba(col, st.hover ? 0.9 : 0.45); ctx.stroke();
      ctx.restore();
      const isz = cr.h * 0.92;
      if (ICONS.drawCurrency) ICONS.drawCurrency(ctx, id, cr.x + isz * 0.55, cr.y + cr.h / 2, isz, ui.t);
      const val = ui.ticker('cur:' + id, fin(cur && cur[id]));
      drawText(ctx, formatNum(Math.round(val)), cr.x + cr.w - 6, cr.y + cr.h / 2 + 5, { size: clamp(cr.h * 0.5, 12, 16), kind: 'body', weight: 800, align: 'right', color: PAL.bone, maxWidth: cr.w - isz - 10, stroke: 3 });
      if (st.focus) focusRing(cr.x, cr.y, cr.w, cr.h, 5);
      if (st.tap) { tapped = id; sound('ui_tap'); }
    }
    return tapped;
  };

  // ---- card widget
  const TYPE_GLYPH = { summon: 'paw', spell: 'star', trap: 'zig', build: 'house' };
  function typeGlyph(type, cx, cy, s, col) {
    ctx.save(); ctx.translate(cx, cy);
    ctx.fillStyle = col; ctx.strokeStyle = PAL.ink; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    const g = TYPE_GLYPH[type] || 'star';
    ctx.beginPath();
    if (g === 'paw') {
      ctx.ellipse(0, s * 0.18, s * 0.34, s * 0.28, 0, 0, TAU); ctx.stroke(); ctx.fill();
      for (let i = 0; i < 4; i++) { const a = -2.6 + i * 0.68; ctx.beginPath(); ctx.arc(Math.cos(a) * s * 0.42, Math.sin(a) * s * 0.42 - s * 0.05, s * 0.12, 0, TAU); ctx.stroke(); ctx.fill(); }
    } else if (g === 'star') {
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * TAU, rr = i % 2 ? s * 0.22 : s * 0.5; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath(); ctx.stroke(); ctx.fill();
    } else if (g === 'zig') {
      ctx.moveTo(-s * 0.5, s * 0.3); ctx.lineTo(-s * 0.3, -s * 0.3); ctx.lineTo(-s * 0.1, s * 0.1); ctx.lineTo(s * 0.1, -s * 0.4); ctx.lineTo(s * 0.3, s * 0.1); ctx.lineTo(s * 0.5, -s * 0.3); ctx.lineTo(s * 0.5, s * 0.4); ctx.lineTo(-s * 0.5, s * 0.4); ctx.closePath(); ctx.stroke(); ctx.fill();
    } else {
      ctx.moveTo(-s * 0.5, s * 0.4); ctx.lineTo(-s * 0.5, -s * 0.05); ctx.lineTo(0, -s * 0.5); ctx.lineTo(s * 0.5, -s * 0.05); ctx.lineTo(s * 0.5, s * 0.4); ctx.closePath(); ctx.stroke(); ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Card widget (5:7). card = card object or id. o: {level, count, selected, disabled, afford:true|false, compact, lift:0..1, cost, hint, noRegion, tint}
   * Returns the region state (shared object): {hover, down, tap, long, dragging, focus}.
   */
  ui.card = function (id, r, card, o) {
    o = o || {};
    if (typeof card === 'string') card = CARD_BY_ID[card];
    const st = o.noRegion ? RS : region(id, r, { focus: !o.disabled, label: card ? card.name + ', cost ' + (o.cost !== undefined ? o.cost : card.cost) : id });
    if (o.noRegion) { RS.hover = RS.down = RS.tap = RS.long = RS.focus = RS.dragging = false; }
    const save = { hover: st.hover, down: st.down, tap: st.tap, long: st.long, dragging: st.dragging, focus: st.focus, x: st.x, y: st.y, w: st.w, h: st.h };
    const S = state('card:' + id, { lift: 0 });
    const want = clamp((o.lift || 0) + (o.selected ? 0.7 : 0) + (save.hover ? 0.25 : 0), 0, 1);
    S.lift += (want - S.lift) * Math.min(1, ui.dt * 18);
    const rid = card && RARITY[card.rarity] ? card.rarity : 'common';
    const w = r.w, h = r.h, t = ui.t;
    const cost = o.cost !== undefined ? o.cost : card ? card.cost : 0;
    const afford = o.afford !== false;
    const lift = S.lift * Math.min(14, h * 0.1);
    ctx.save();
    ctx.translate(r.x + w / 2, r.y + h / 2 - lift); const sc = 1 + S.lift * 0.05; ctx.scale(sc, sc); ctx.translate(-w / 2, -h / 2);
    const c = Math.max(4, w * 0.06);
    if (o.selected) glow(ctx, w / 2, h / 2, Math.max(w, h) * 0.85, PAL.cyan, 0.4);
    // plate
    chamfer(ctx, 0, 0, w, h, c); ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = PAL.ink; ctx.stroke();
    ctx.fillStyle = vgrad(ctx, 'cardp', h, PAL.ink3, PAL.ink2, PAL.ink); ctx.fill();
    // art window
    const ax = 4, ay = 4, aw = w - 8, ah = h * 0.54;
    ctx.save(); chamfer(ctx, ax, ay, aw, ah, Math.max(2, c - 2)); ctx.clip();
    let drew = false;
    if (CATART.drawCardArt && card) { try { CATART.drawCardArt(ctx, card, ax, ay, aw, ah, { t, tint: o.tint }); drew = true; } catch (e) { drew = false; } }
    if (!drew) { ctx.fillStyle = PAL.violet; ctx.fillRect(ax, ay, aw, ah); }
    ctx.restore();
    // name banner
    const by = ay + ah - 1, bh = Math.max(14, h * 0.12);
    ctx.fillStyle = rgba(PAL.ink, 0.92); ctx.fillRect(4, by, w - 8, bh);
    ctx.fillStyle = rgba(rarityColor(rid), 0.85); ctx.fillRect(4, by, w - 8, 1.5); ctx.fillRect(4, by + bh - 1, w - 8, 1);
    if (card) {
      const nm = fitText(ctx, card.name, w - 14, { size: clamp(w * 0.115, 9, 15), min: 7, kind: 'display', stroke: 2 });
      drawText(ctx, nm.text, w / 2, by + bh / 2 + nm.size * 0.34, { size: nm.size, kind: 'display', align: 'center', color: rid === 'legend' || rid === 'mythic' ? rarityColor(rid) : PAL.bone, stroke: 2.5 });
    }
    // body text
    if (card && !o.compact && h > 150) {
      const ty = by + bh + 4, th = h - (ty) - 20;
      const fs = clamp(w * 0.082, 9.5, 13);
      const lines = wrapText(ctx, card.text, w - 16, { size: fs, kind: 'body', weight: 600 });
      const maxL = Math.max(1, Math.floor(th / (fs * 1.2)));
      for (let i = 0; i < Math.min(lines.length, maxL); i++) drawText(ctx, lines[i], w / 2, ty + fs + i * fs * 1.2, { size: fs, kind: 'body', weight: 600, align: 'center', color: PAL.boneDim, stroke: 2 });
    }
    // rarity frame (on top of art, under the gems)
    if (CATART.drawRarityFrame) { try { CATART.drawRarityFrame(ctx, rid, 0, 0, w, h, t, { chamfer: c }); } catch (e) { /* optional */ } }
    else { chamfer(ctx, 0, 0, w, h, c); ctx.lineWidth = 2; ctx.strokeStyle = rarityColor(rid); ctx.stroke(); }
    // cost gem top-left
    if (card) {
      const gr = clamp(w * 0.15, 9, 17), gx = gr + 1, gy = gr + 1;
      const gcol = afford ? PAL.cyan : PAL.magenta;
      glow(ctx, gx, gy, gr * 2.2, gcol, afford ? 0.4 : 0.25);
      ctx.beginPath(); ctx.arc(gx, gy, gr, 0, TAU); ctx.lineWidth = 3.5; ctx.strokeStyle = PAL.ink; ctx.stroke();
      ctx.fillStyle = vgrad(ctx, 'gem' + gcol, gr * 2, shade(gcol, 0.1), shade(gcol, -0.55)); ctx.save(); ctx.translate(0, gy - gr); ctx.beginPath(); ctx.arc(gx, gr, gr, 0, TAU); ctx.fill(); ctx.restore();
      ctx.beginPath(); ctx.arc(gx, gy, gr, 0, TAU); ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(PAL.bone, 0.7); ctx.stroke();
      drawText(ctx, String(cost), gx, gy + gr * 0.4, { size: gr * 1.25, kind: 'display', align: 'center', color: PAL.bone, stroke: 2.5 });
      typeGlyph(card.type, w - gr - 3, gr + 3, gr * 1.1, rgba(PAL.bone, 0.9));
    }
    // count / level footer
    if (!o.compact && (o.level || o.count)) {
      const txt = (o.level ? 'Lv ' + o.level : '') + (o.level && o.count ? '  ' : '') + (o.count ? 'x' + o.count : '');
      drawText(ctx, txt, w - 8, h - 7, { size: clamp(w * 0.085, 9, 13), kind: 'body', weight: 800, align: 'right', color: PAL.bone, stroke: 2.5 });
    }
    if (o.disabled || !afford) { chamfer(ctx, 0, 0, w, h, c); ctx.fillStyle = rgba(PAL.void, o.disabled ? 0.6 : 0.42); ctx.fill(); }
    if (o.selected) { chamfer(ctx, -1, -1, w + 2, h + 2, c + 1); ctx.lineWidth = 2.5; ctx.strokeStyle = PAL.cyan; ctx.stroke(); }
    ctx.restore();
    if (save.focus) focusRing(r.x, r.y, w, h, c);
    st.hover = save.hover; st.down = save.down; st.tap = save.tap; st.long = save.long; st.dragging = save.dragging; st.focus = save.focus; st.x = save.x; st.y = save.y; st.w = save.w; st.h = save.h;
    if (st.tap) sound(o.disabled ? 'ui_deny' : 'ui_tap');
    return st;
  };

  /** Cat tile for rosters. o: {level, stars, locked, selected, badge, compact} Returns region state (shared). */
  ui.catTile = function (id, r, catId, o) {
    o = o || {};
    const cat = CAT_BY_ID[catId];
    const st = region(id, r, { focus: true, label: (cat ? cat.name : catId) + (o.locked ? ', locked' : o.level ? ', level ' + o.level : '') });
    const keep = { hover: st.hover, down: st.down, tap: st.tap, long: st.long, dragging: st.dragging, focus: st.focus, x: st.x, y: st.y, w: st.w, h: st.h };
    const rid = cat ? cat.rarity : 'common';
    const w = r.w, h = r.h, c = Math.max(4, Math.min(8, w * 0.07));
    ctx.save(); ctx.translate(r.x, r.y + (keep.down ? 2 : 0));
    if (o.selected) glow(ctx, w / 2, h / 2, Math.max(w, h) * 0.8, PAL.cyan, 0.4);
    chamfer(ctx, 0, 0, w, h, c); ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = PAL.ink; ctx.stroke();
    ctx.fillStyle = vgrad(ctx, 'tile', h, PAL.ink3, PAL.ink); ctx.fill();
    const ph = h - (o.compact ? 4 : 22);
    ctx.save(); chamfer(ctx, 3, 3, w - 6, ph - 3, Math.max(2, c - 2)); ctx.clip();
    if (CATART.drawCatPortrait && cat) {
      try { CATART.drawCatPortrait(ctx, catId, 3, 3, w - 6, ph - 3, { t: ui.t, level: o.level, stars: o.stars }); } catch (e) { ctx.fillStyle = PAL.violet; ctx.fillRect(3, 3, w - 6, ph - 3); }
    } else { ctx.fillStyle = PAL.violet; ctx.fillRect(3, 3, w - 6, ph - 3); }
    if (o.locked) { ctx.fillStyle = rgba(PAL.void, 0.82); ctx.fillRect(3, 3, w - 6, ph - 3); drawText(ctx, '?', w / 2, 3 + (ph - 3) / 2 + 14, { size: 40, kind: 'display', align: 'center', color: PAL.slateText }); }
    ctx.restore();
    if (CATART.drawRarityFrame) { try { CATART.drawRarityFrame(ctx, rid, 0, 0, w, h, ui.t, { chamfer: c }); } catch (e) { /* optional */ } }
    else { chamfer(ctx, 0, 0, w, h, c); ctx.lineWidth = 2; ctx.strokeStyle = rarityColor(rid); ctx.stroke(); }
    if (!o.compact) {
      const nm = fitText(ctx, o.locked ? '???' : (cat ? cat.name : catId), w - 10, { size: 12, min: 8, kind: 'body', weight: 800, stroke: 2 });
      drawText(ctx, nm.text, w / 2, h - 7, { size: nm.size, kind: 'body', weight: 800, align: 'center', color: PAL.bone, stroke: 2.5 });
    }
    if (cat && ICONS.drawRoleIcon && !o.locked) ICONS.drawRoleIcon(ctx, cat.role, 13, 13, 18);
    if (o.level && !o.locked) drawText(ctx, 'Lv' + o.level, w - 6, 16, { size: 12, kind: 'body', weight: 800, align: 'right', color: PAL.bone, stroke: 3 });
    if (o.stars && CATART.drawStarPips && !o.locked) CATART.drawStarPips(ctx, o.stars, w / 2, ph - 6, Math.min(w, 60));
    ctx.restore();
    if (o.badge) ui.badge(r.x + r.w - 4, r.y + 4, o.badge);
    if (keep.focus) focusRing(r.x, r.y, w, h, c);
    st.hover = keep.hover; st.down = keep.down; st.tap = keep.tap; st.long = keep.long; st.dragging = keep.dragging; st.focus = keep.focus; st.x = keep.x; st.y = keep.y; st.w = keep.w; st.h = keep.h;
    if (st.tap) sound('ui_tap');
    return st;
  };

  // ------------------------------------------------------------------------------------------ tooltip
  /** Queue a tooltip for this frame, anchored to a rect. Call when a region is hovered or long-pressed. */
  ui.tip = function (anchor, title, text) {
    tipBuf.x = anchor.x + ox; tipBuf.y = anchor.y + oy; tipBuf.w = anchor.w; tipBuf.h = anchor.h; tipBuf.title = title || ''; tipBuf.text = text || ''; tipBuf.on = true; tip = tipBuf;
  };
  function drawTip() {
    if (!tip || !tip.on) return;
    const maxW = Math.min(260, ui.w - 24);
    const tl = tip.title ? 20 : 0;
    const lines = tip.text ? wrapText(ctx, tip.text, maxW - 20, { size: 13, kind: 'body', weight: 600 }) : [];
    const h = 14 + tl + lines.length * 17;
    let w = maxW;
    let x = clamp(tip.x + tip.w / 2 - w / 2, 8, ui.w - w - 8);
    let y = tip.y - h - 10;
    if (y < 8) y = tip.y + tip.h + 10;
    y = clamp(y, 8, ui.h - h - 8);
    ctx.save(); ctx.translate(x, y);
    chamfer(ctx, 0, 0, w, h, 6); ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = PAL.ink; ctx.stroke();
    ctx.fillStyle = rgba(PAL.ink2, 0.98); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = PAL.cyan; ctx.stroke();
    if (tip.title) drawText(ctx, tip.title, 10, 20, { size: 15, kind: 'display', color: PAL.bone, maxWidth: w - 20, stroke: 3 });
    for (let i = 0; i < lines.length; i++) drawText(ctx, lines[i], 10, 20 + tl - 2 + i * 17, { size: 13, kind: 'body', weight: 600, color: PAL.boneDim, stroke: 2 });
    ctx.restore();
  }

  // ------------------------------------------------------------------------------------------ toasts
  const TOAST_COL = { info: PAL.cyan, ok: PAL.lime, warn: PAL.magenta, error: PAL.magenta, reward: PAL.cyan, legend: PAL.gold };
  /** Queue a toast. kind: info | ok | warn | error | reward | legend (legend is the only gold one: best loot). */
  ui.toast = function (msg, kind) {
    msg = String(msg || '');
    if (!msg) return;
    const last = toasts[toasts.length - 1];
    if (last && last.msg === msg && ui.t - last.t0 < 0.8) { last.t0 = ui.t; return; }
    toasts.push({ msg, kind: kind || 'info', t0: ui.t, ttl: 2.8 });
    if (toasts.length > 4) toasts.shift();
    ui.announce(msg);
    sound('ui_toast');
  };
  function drawToasts() {
    let y = ui.toastY !== undefined ? ui.toastY : ui.safe.top + 8;
    for (let i = toasts.length - 1; i >= 0; i--) if (ui.t - toasts[i].t0 > toasts[i].ttl) toasts.splice(i, 1);
    for (let i = 0; i < toasts.length; i++) {
      const T = toasts[i], age = ui.t - T.t0;
      const inA = ui.reduceMotion ? 1 : outBack(age / 0.28), outA = clamp((T.ttl - age) / 0.3, 0, 1);
      const col = TOAST_COL[T.kind] || PAL.cyan;
      const w = Math.min(ui.w - 24, Math.max(160, T.msg.length * 8.2 + 36)), h = 34;
      const x = (ui.w - w) / 2, yy = y - (1 - inA) * 30;
      ctx.save(); ctx.globalAlpha = outA * clamp(inA, 0, 1);
      ctx.translate(x, yy);
      glow(ctx, w / 2, h / 2, w * 0.5, col, 0.18);
      chamfer(ctx, 0, 0, w, h, 6); ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = PAL.ink; ctx.stroke();
      ctx.fillStyle = rgba(PAL.ink2, 0.98); ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = col; ctx.stroke();
      ctx.fillStyle = col; ctx.fillRect(6, 7, 3, h - 14);
      drawText(ctx, T.msg, w / 2 + 3, h / 2 + 5, { size: 14, kind: 'body', weight: 700, align: 'center', color: PAL.bone, maxWidth: w - 30, stroke: 3 });
      ctx.restore();
      y += h + 6;
    }
  }

  // ------------------------------------------------------------------------------------------ dialogs
  /**
   * Dialog. d: {id, title, text, body(ctx, rect, ui), height, buttons:[{id,label,kind}], onPick(id), dismiss:true, cancelId}
   * Opens on top of everything and blocks input below. Escape or tapping outside closes with cancelId (when dismiss !== false).
   */
  ui.dialog = function (d) {
    const dlg = Object.assign({ buttons: [{ id: 'ok', label: 'OK', kind: 'primary' }], dismiss: true, cancelId: 'cancel' }, d);
    dlg.id = dlg.id || ('dlg' + ui.frame);
    dlg.t0 = ui.t;
    for (let i = dialogs.length - 1; i >= 0; i--) if (dialogs[i].id === dlg.id) dialogs.splice(i, 1);
    dialogs.push(dlg);
    sound('ui_open');
    ui.announce((dlg.title ? dlg.title + '. ' : '') + (dlg.text || ''));
    return dlg;
  };
  ui.confirm = function (title, text, onYes, o) {
    o = o || {};
    return ui.dialog({
      id: o.id || 'confirm', title, text, buttons: [{ id: 'no', label: o.noLabel || 'Cancel', kind: 'secondary' }, { id: 'yes', label: o.yesLabel || 'OK', kind: o.danger ? 'danger' : 'primary' }],
      cancelId: 'no', onPick: (pick) => { if (pick === 'yes' && onYes) onYes(); },
    });
  };
  function closeDialog(d, pick) {
    const i = dialogs.indexOf(d);
    if (i >= 0) dialogs.splice(i, 1);
    sound('ui_close');
    if (d.onPick) d.onPick(pick);
  }
  ui.closeDialog = (id) => { for (let i = dialogs.length - 1; i >= 0; i--) if (!id || dialogs[i].id === id) { dialogs.splice(i, 1); } };
  ui.hasDialog = () => dialogs.length > 0;

  function drawDialogs() {
    for (let di = 0; di < dialogs.length; di++) {
      const d = dialogs[di];
      const age = ui.t - d.t0, a = ui.reduceMotion ? 1 : clamp(age / 0.2, 0, 1), pop = ui.reduceMotion ? 1 : outBack(age / 0.3);
      const L = ui.pushLayer();
      void L;
      ctx.save();
      ctx.fillStyle = rgba(PAL.void, 0.74 * a); ctx.fillRect(0, 0, ui.w, ui.h);
      ctx.restore();
      const blk = region('__dlgblock' + d.id, { x: 0, y: 0, w: ui.w, h: ui.h }, null);
      if (blk.tap && d.dismiss !== false) { ui.popLayer(); closeDialog(d, d.cancelId || 'cancel'); return; }
      const w = Math.min(ui.w - 32, 380);
      const textFs = 15;
      const lines = d.text ? wrapText(ctx, d.text, w - 36, { size: textFs, kind: 'body', weight: 600 }) : [];
      const bodyH = d.body ? (d.height || 120) : 0;
      const h = Math.max(150, 62 + lines.length * 21 + bodyH + 74);
      const x = (ui.w - w) / 2, y = (ui.h - h) / 2;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(x + w / 2, y + h / 2); ctx.scale(0.9 + 0.1 * pop, 0.9 + 0.1 * pop); ctx.translate(-w / 2, -h / 2);
      ctx.restore();
      ctx.save(); ctx.globalAlpha = a;
      ctx.translate(ui.w / 2, ui.h / 2); const sc = 0.92 + 0.08 * clamp(pop, 0, 1.1); ctx.scale(sc, sc); ctx.translate(-ui.w / 2, -ui.h / 2);
      // swallow taps on the panel itself
      region('__dlgpanel' + d.id, { x, y, w, h }, null);
      const inner = ui.panel({ x, y, w, h }, { title: d.title, glow: true, color: PAL.violetHi });
      let cy = inner.y + 12;
      for (let i = 0; i < lines.length; i++) { drawText(ctx, lines[i], x + w / 2, cy + textFs + i * 21 - 4, { size: textFs, kind: 'body', weight: 600, align: 'center', color: PAL.bone, stroke: 3 }); }
      cy += lines.length * 21 + 6;
      if (d.body) { d.body(ctx, { x: inner.x, y: cy, w: inner.w, h: bodyH }, ui); cy += bodyH; }
      const nb = d.buttons.length, bw = Math.min(150, (inner.w - (nb - 1) * 10) / nb), bh = 46;
      const totalW = bw * nb + (nb - 1) * 10;
      for (let i = 0; i < nb; i++) {
        const b = d.buttons[i];
        const bx = x + (w - totalW) / 2 + i * (bw + 10), by = y + h - bh - 16;
        if (ui.button('dlg:' + d.id + ':' + b.id, { x: bx, y: by, w: bw, h: bh }, b.label, { kind: b.kind || 'secondary', disabled: b.disabled })) { ctx.restore(); ui.popLayer(); closeDialog(d, b.id); return; }
      }
      ctx.restore();
      ui.popLayer();
    }
  }

  // ------------------------------------------------------------------------------------------ transitions
  /**
   * Screen transition. kind: 'fade' | 'wipe' | 'iris' | 'glitch'. onMid runs when the screen is fully covered (switch screens there).
   * Input is blocked while it plays. Reduced motion uses a short fade.
   */
  ui.transition = function (kind, onMid, o) {
    o = o || {};
    if (ui.trans) { if (onMid && !ui.trans.fired) { try { onMid(); } catch (e) { /* ignore */ } ui.trans.fired = true; } return; }
    const dur = ui.reduceMotion ? 0.24 : (o.dur || (kind === 'iris' ? 0.7 : 0.55));
    ui.trans = { kind: ui.reduceMotion ? 'fade' : kind, t: 0, dur, onMid, fired: false, cx: o.cx === undefined ? ui.w / 2 : o.cx, cy: o.cy === undefined ? ui.h / 2 : o.cy };
    ui.transitioning = true;
  };
  function drawTransition() {
    const T = ui.trans;
    if (!T) return;
    T.t += ui.dt;
    const p = clamp(T.t / T.dur, 0, 1);
    if (p >= 0.5 && !T.fired) { T.fired = true; if (T.onMid) { try { T.onMid(); } catch (e) { ui.toast('Screen error', 'error'); } } }
    const cover = p < 0.5 ? inOutSine(p * 2) : inOutSine(2 - p * 2);   // 0 -> 1 -> 0
    const W = ui.w, H = ui.h;
    ctx.save();
    if (T.kind === 'wipe') {
      const slabs = 5, sh = H / slabs + 20;
      for (let i = 0; i < slabs; i++) {
        const d = (i % 2 ? 1 : -1);
        const prog = clamp(cover * 1.4 - i * 0.08, 0, 1);
        const edge = W * 1.4 * prog;
        const x0 = d > 0 ? -W * 0.2 : W * 1.2 - edge;
        ctx.beginPath();
        const y0 = i * (H / slabs) - 10, sk = 40;
        ctx.moveTo(x0, y0); ctx.lineTo(x0 + edge + sk, y0); ctx.lineTo(x0 + edge, y0 + sh); ctx.lineTo(x0 - sk, y0 + sh); ctx.closePath();
        ctx.fillStyle = PAL.ink; ctx.fill();
        ctx.fillStyle = i % 2 ? PAL.magenta : PAL.cyan; ctx.globalAlpha = 0.9;
        ctx.beginPath(); const ex = d > 0 ? x0 + edge : x0; ctx.moveTo(ex - 4, y0); ctx.lineTo(ex + 4 + sk * d, y0); ctx.lineTo(ex + 4 + (sk - 2) * d, y0 + sh); ctx.lineTo(ex - 4 - 2 * d, y0 + sh); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      }
    } else if (T.kind === 'iris') {
      const maxR = Math.hypot(W, H);
      const rr = maxR * (1 - cover);
      ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.moveTo(T.cx + rr, T.cy); ctx.arc(T.cx, T.cy, Math.max(0.01, rr), 0, TAU, true);
      ctx.fillStyle = PAL.void; ctx.fill('evenodd');
      if (rr > 4) { ctx.beginPath(); ctx.arc(T.cx, T.cy, rr, 0, TAU); ctx.lineWidth = 3; ctx.strokeStyle = rgba(PAL.cyan, 0.9); ctx.stroke(); }
    } else if (T.kind === 'glitch') {
      ctx.fillStyle = rgba(PAL.void, cover); ctx.fillRect(0, 0, W, H);
      const bands = 9;
      for (let i = 0; i < bands; i++) {
        const k = hash01('g' + i + Math.floor(T.t * 24));
        if (k < 0.5 - cover * 0.4) continue;
        const by = k * H, bh = 8 + k * 36, off = (hash01('o' + i + Math.floor(T.t * 24)) - 0.5) * 60 * cover;
        ctx.fillStyle = rgba(i % 2 ? PAL.cyan : PAL.magenta, 0.6 * cover); ctx.fillRect(off, by, W, bh);
      }
    } else { ctx.fillStyle = rgba(PAL.void, cover); ctx.fillRect(0, 0, W, H); }
    ctx.restore();
    if (p >= 1) { ui.trans = null; ui.transitioning = false; }
  }

  // ------------------------------------------------------------------------------------------ reduced motion + DOM wiring
  ui.setReduceMotion = (b) => { ui.reduceMotion = !!b; };
  let mq = null;
  if (win && win.matchMedia) {
    try {
      mq = win.matchMedia('(prefers-reduced-motion: reduce)');
      ui.reduceMotion = !!mq.matches;
      const onMq = (e) => { ui.reduceMotion = !!e.matches; };
      if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
    } catch (e) { mq = null; }
  }
  const handlers = [];
  function on(target, type, fn, opt) { if (target && target.addEventListener) { target.addEventListener(type, fn, opt); handlers.push([target, type, fn, opt]); } }
  function pos(e) {
    const rc = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: ui.w, height: ui.h };
    const sx = rc.width ? ui.w / rc.width : 1, sy = rc.height ? ui.h / rc.height : 1;
    return [(e.clientX - rc.left) * sx, (e.clientY - rc.top) * sy];
  }
  on(canvas, 'pointerdown', (e) => { const p = pos(e); try { canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ } input.move(p[0], p[1], e.pointerType); input.down(p[0], p[1], e.pointerType); if (e.preventDefault) e.preventDefault(); });
  on(canvas, 'pointermove', (e) => { const p = pos(e); input.move(p[0], p[1], e.pointerType); });
  on(canvas, 'pointerup', (e) => { const p = pos(e); input.up(p[0], p[1]); });
  on(canvas, 'pointercancel', () => { ui.down = false; ui.dragging = false; });
  on(canvas, 'pointerleave', () => { if (!ui.down) input.leave(); });
  on(canvas, 'wheel', (e) => { input.wheel(e.deltaY); if (e.preventDefault) e.preventDefault(); }, { passive: false });
  on(canvas, 'contextmenu', (e) => { if (e.preventDefault) e.preventDefault(); });
  on(win, 'keydown', (e) => {
    const tg = e.target && e.target.tagName;
    if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return;
    ui.keyHitShift = !!e.shiftKey;
    const n = keyName(e.key);
    if (n === 'tab' || n === 'space' || n === 'left' || n === 'right' || n === 'up' || n === 'down') { if (e.preventDefault) e.preventDefault(); }
    input.key(e.key);
  });
  if (win && win.ResizeObserver && canvas.parentElement) { try { const ro = new win.ResizeObserver(() => ui.resize()); ro.observe(canvas.parentElement); handlers.push([{ removeEventListener() { ro.disconnect(); } }, '', null]); } catch (e) { /* ignore */ } }
  else on(win, 'resize', () => ui.resize());
  ui.destroy = function () { for (const h of handlers) { try { h[0].removeEventListener(h[1], h[2], h[3]); } catch (e) { /* ignore */ } } handlers.length = 0; };

  ui.resize();
  ensureLive();
  return ui;
}

export { KINDS as BUTTON_KINDS };
