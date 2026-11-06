// Immediate-mode canvas UI toolkit. One 1280x720 logical canvas, scaled to fit. Every screen is an object:
//   { name, enter(app, params), leave(app), update(app, dt), draw(app), key(app, e) }
// Screens redraw every frame and call app.button(...) etc.; clicks are resolved from last frame's pointer state.
import * as LAYOUT from './layout_registry.js';
import * as CH from './chrome.js';
import { renderTip } from './tooltips.js';
export const W = 1280, H = 720;
export const FONT = 'Georgia, "Iowan Old Style", "Palatino Linotype", serif';
export const FONT_UI = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';
export const COL = {
  slab: '#1A1614', slab2: '#26201c', vellum: '#E8DCC4', vellum2: '#d6c7a6', ink: '#2B1E1A', suture: '#0E0E0E', lamp: '#F2C14E', scar: '#B3263A',
  attack: '#8C2F2F', skill: '#3E5C6B', power: '#5B3F7A', junk: '#6E6A5E', good: '#7fcf8a', bad: '#ff7a7a', gold: '#F2C14E', energy: '#7fd1e0',
  ember: '#FF6A2B', echo: '#7FD1E0', hoard: '#C9A227', blood: '#9E0F2E', rust: '#A0522D', static: '#E8F542', gilded: '#F5E6A8',
};
export const EASE = {
  linear: (t) => t, out: (t) => 1 - Math.pow(1 - t, 3), in: (t) => t * t * t, inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }, bounce: (t) => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375; return n * (t -= 2.625 / d) * t + 0.984375; },
};
// Small-screen policy (phones). app.scale is CSS px per logical px; on a 844x390 phone it is ~0.58, so a 16 px label is 9 CSS px.
// The floor only engages below SMALL.floorBelow scale, so desktop and every layout test (scale 1) are untouched.
export const SMALL = { minTextPx: 11, minTouchPx: 40, floorBelow: 0.95, maxBoost: 1.5, cropY: 0, maxHitGrow: 14 };
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
export function shade(hex, k) { const n = parseInt(hex.slice(1), 16); const f = (v) => clamp(Math.round(v * k), 0, 255); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; }

export function createApp(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  const app = {
    canvas, ctx, w: W, h: H, t: 0, dt: 0, frame: 0,
    mouse: { x: -999, y: -999, down: false, pressed: false, released: false, wheel: 0, rx: 0, ry: 0 },
    keys: new Set(), pressedKeys: [],
    screens: {}, stack: [], tweens: [], timers: [],
    cursor: 'default', tip: null, hot: null, shared: opts.shared || {},
    scale: 1, offX: 0, offY: 0, cropY: 0, safe: { l: 0, t: 0, r: 0, b: 0 }, minPx: SMALL.minTextPx, minTouch: SMALL.minTouchPx, textCache: new Map(), layout: LAYOUT,
    reg: (id, x, y, w, h, o) => LAYOUT.register(id, x, y, w, h, o),
    chrome: CH,
    navButtons: false, // screens opt in: Tab / Shift-Tab / Enter walk the buttons registered last frame
    focus: { idx: -1, active: false, n: 0, curN: 0, list: [], cur: [], fire: false, lx: -999, ly: -999 },
  };
  const NO = Object.freeze({}); // shared empty options: calls without options allocate nothing
  const TO = {}; // scratch text options for the chrome's own labels (read synchronously by app.text)

  // ---- stage scaling ----
  // Safe-area insets in CSS px (notches, home bar). Read from a hidden probe styled with env(safe-area-inset-*); zeros without a DOM.
  let probe = null;
  function insets() {
    const z = { l: 0, t: 0, r: 0, b: 0 };
    try {
      if (typeof document === 'undefined' || !document.body || !document.createElement) return z;
      if (!probe) {
        probe = document.createElement('div');
        probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
        document.body.appendChild(probe);
      }
      const cs = getComputedStyle(probe);
      return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
    } catch { return z; }
  }
  app.resize = () => {
    const iw = window.innerWidth, ih = window.innerHeight;
    if (!(iw > 0 && ih > 0)) return; // hidden iframe / minimised: keep the last good size
    // Short, wide viewports (phones in landscape): drop SMALL.cropY logical px of the top and bottom margins so the stage scales up ~7%.
    // The chrome (pause, fullscreen) is moved inside app.safe, so nothing important sits in the cropped strip.
    const wide = ih < 600 && iw / ih > W / H;
    const crop = wide ? SMALL.cropY : 0;
    app.cropY = crop;
    app.scale = Math.min(iw / W, ih / (H - crop * 2));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = W * app.scale, ch = H * app.scale;
    app.offX = (iw - cw) / 2; app.offY = (ih - ch) / 2;
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    canvas.style.left = app.offX + 'px'; canvas.style.top = app.offY + 'px';
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    app.dpr = dpr; app.px = canvas.width / W;
    // logical margins (from the canvas edges) that are visible AND clear of notches
    const I = insets(), s = app.scale;
    app.safe = {
      l: Math.max(0, (I.l - app.offX) / s), t: Math.max(0, (I.t - app.offY) / s),
      r: Math.max(0, W - (iw - I.r - app.offX) / s), b: Math.max(0, H - (ih - I.b - app.offY) / s),
    };
  };
  const toLogical = (e) => { const r = canvas.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) return { x: app.mouse.x, y: app.mouse.y }; return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
  canvas.addEventListener('pointermove', (e) => { const p = toLogical(e); app.mouse.x = p.x; app.mouse.y = p.y; });
  canvas.addEventListener('pointerdown', (e) => { const p = toLogical(e); app.mouse.x = p.x; app.mouse.y = p.y; app.mouse.down = true; app.mouse.pressed = true; app.mouse.button = e.button; canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointerup', (e) => { const p = toLogical(e); app.mouse.x = p.x; app.mouse.y = p.y; app.mouse.down = false; app.mouse.released = true; app.mouse.touchUp = !!e.pointerType && e.pointerType !== 'mouse'; });
  // Touch fires pointerleave right after pointerup: moving the pointer away at once would eat the tap (clicks are resolved on the next tick). Touch parks the pointer after that tick instead.
  canvas.addEventListener('pointerleave', (e) => { if (!app.mouse.down && !(e && e.pointerType && e.pointerType !== 'mouse')) { app.mouse.x = -999; app.mouse.y = -999; } });
  canvas.addEventListener('pointercancel', () => { app.mouse.down = false; app.mouse.released = false; app.mouse.x = -999; app.mouse.y = -999; });
  canvas.addEventListener('wheel', (e) => { app.mouse.wheel += e.deltaY; e.preventDefault(); }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', (e) => { if (e.repeat) return; app.keys.add(e.key); app.pressedKeys.push(e); if (app.navButtons && e.key === 'Tab') e.preventDefault(); const s = top(); if (s && s.key && s.key(app, e)) e.preventDefault(); });
  window.addEventListener('keyup', (e) => app.keys.delete(e.key));
  window.addEventListener('resize', app.resize);

  // ---- screens ----
  const top = () => app.stack[app.stack.length - 1];
  app.register = (name, scr) => { scr.name = name; app.screens[name] = scr; };
  app.go = (name, params) => {
    for (const s of app.stack) if (s.leave) s.leave(app);
    app.stack = []; app.navButtons = false; app.focus.idx = -1; app.focus.active = false;
    const s = app.screens[name]; if (!s) throw new Error('no screen ' + name);
    app.stack.push(s); app.current = name; app.sceneT = 0;
    if (s.enter) s.enter(app, params || {});
  };
  app.push = (name, params) => { const s = app.screens[name]; if (!s) throw new Error('no screen ' + name); app.stack.push(s); if (s.enter) s.enter(app, params || {}); };
  app.pop = () => { const s = app.stack.pop(); if (s && s.leave) s.leave(app); };
  app.top = top;

  // ---- tweens and timers ----
  app.tween = (obj, props, ms, ease = 'out', done) => {
    const from = {}; for (const k of Object.keys(props)) from[k] = obj[k];
    const tw = { obj, from, to: props, t: 0, ms, ease: EASE[ease] || ease, done };
    app.tweens.push(tw); return tw;
  };
  app.after = (ms, fn) => { app.timers.push({ ms, fn }); };
  app.clearTweens = (obj) => { app.tweens = app.tweens.filter((t) => !obj || t.obj !== obj); };

  // ---- drawing helpers ----
  const fontCache = new Map();
  function font(size, o = NO) {
    const k = size * 8 + (o.italic ? 1 : 0) + (o.bold ? 2 : 0) + (o.ui ? 4 : 0);
    let f = fontCache.get(k);
    if (!f) { f = `${o.italic ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${size}px ${o.ui ? FONT_UI : FONT}`; if (fontCache.size > 600) fontCache.clear(); fontCache.set(k, f); }
    return f;
  }
  app.font = font;
  const hasLS = 'letterSpacing' in ctx; // canvas letterSpacing (engraved names); skipped where unsupported
  // Text scale: settings may store 1 / 1.25 / 1.5 or 100 / 125 / 150. Public wrap, measure and text all apply it the same way (unless o.fixed).
  const scaleOf = (o) => { if (o.fixed) return 1; const v = app.textScale; return v >= 50 ? v / 100 : v > 0 ? v : 1; };
  // Final font size in logical px: user scale, then the small-screen floor (never more than SMALL.maxBoost x, so layouts still fit).
  const fin = (size, o) => {
    const n = Math.round(size * scaleOf(o)), s = app.scale;
    if (!(s < SMALL.floorBelow) || !(s > 0)) return n;
    const fl = Math.ceil(app.minPx / s);
    return n >= fl ? n : Math.min(fl, Math.round(n * SMALL.maxBoost));
  };
  app.sz = (size, o = NO) => fin(size, o);
  const spacing = (o) => { if (hasLS && o.engraved) ctx.letterSpacing = '0.5px'; };
  function tabW(ln) { const cell = ctx.measureText('0').width; let w = 0; for (let i = 0; i < ln.length; i++) { const c = ln.charCodeAt(i); w += c >= 48 && c <= 57 ? cell : ctx.measureText(ln[i]).width; } return w; }
  function lineW(ln, o) { return o.tab ? tabW(ln) : ctx.measureText(ln).width; }
  // size here is the FINAL (already scaled) size
  function wrapRaw(str, maxW, size, o) {
    const key = str + '|' + maxW + '|' + size + '|' + (o.bold ? 1 : 0) + (o.ui ? 1 : 0) + (o.italic ? 1 : 0) + (o.engraved ? 1 : 0) + (o.tab ? 1 : 0);
    const hit = app.textCache.get(key); if (hit) return hit;
    ctx.save(); ctx.font = font(size, o); spacing(o);
    const out = [];
    for (const para of String(str).split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const test = line ? line + ' ' + word : word;
        if (lineW(test, o) > maxW && line) { out.push(line); line = word; } else line = test;
      }
      out.push(line);
    }
    ctx.restore();
    if (app.textCache.size > 800) app.textCache.clear();
    app.textCache.set(key, out); return out;
  }
  app.wrap = (str, maxW, size, o = NO) => wrapRaw(str, maxW, fin(size, o), o);
  const ONE = [''];
  function put(stroke, ln, x, y, o) {
    if (!o.tab) { if (stroke) ctx.strokeText(ln, x, y); else ctx.fillText(ln, x, y); return; }
    const al = ctx.textAlign, tw = tabW(ln), cell = ctx.measureText('0').width;
    let cx = al === 'center' ? x - tw / 2 : al === 'right' || al === 'end' ? x - tw : x;
    ctx.textAlign = 'left';
    for (let i = 0; i < ln.length; i++) {
      const c = ln.charCodeAt(i), ch = ln[i], isD = c >= 48 && c <= 57, cw = isD ? cell : ctx.measureText(ch).width;
      const dx = isD ? (cell - ctx.measureText(ch).width) / 2 : 0;
      if (stroke) ctx.strokeText(ch, cx + dx, y); else ctx.fillText(ch, cx + dx, y);
      cx += cw;
    }
    ctx.textAlign = al;
  }
  // text(str, x, y, {size, color, align, baseline, bold, italic, ui, maxW, lineH, shadow, alpha, stroke, engraved, tab, fixed}) -> total height
  app.textScale = 1;
  app.text = (str, x, y, o = NO) => {
    const usz = o.size || 18, size = fin(usz, o), lineH = o.lineH ? Math.round(o.lineH * size / usz) : Math.round(size * 1.22);
    ctx.save();
    ctx.font = font(size, o); ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.baseline || 'top';
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    spacing(o);
    let lines;
    if (o.maxW) lines = wrapRaw(str, o.maxW, size, o);
    else { str = String(str); if (str.indexOf('\n') >= 0) lines = str.split('\n'); else { ONE[0] = str; lines = ONE; } }
    const col = o.color || COL.vellum;
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i], yy = y + i * lineH;
      if (o.shadow) { ctx.fillStyle = 'rgba(0,0,0,.65)'; put(false, ln, x + 1.5, yy + 1.5, o); }
      if (o.engraved) { ctx.fillStyle = 'rgba(255,236,190,.2)'; put(false, ln, x, yy + 1, o); ctx.fillStyle = 'rgba(0,0,0,.6)'; put(false, ln, x, yy - 1, o); } // debossed: lit lower lip, dark upper lip
      if (o.stroke) { ctx.lineWidth = o.strokeW || 3; ctx.strokeStyle = o.stroke; ctx.lineJoin = 'round'; put(true, ln, x, yy, o); }
      ctx.fillStyle = col; put(false, ln, x, yy, o);
    }
    ctx.restore();
    return lines.length * lineH;
  };
  app.measure = (str, size, o = NO) => { ctx.save(); ctx.font = font(fin(size, o), o); spacing(o); const w = lineW(String(str), o); ctx.restore(); return w; };
  app.rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); };
  // panel: brass-framed slab (cached texture). o: {fill, stroke, r, lw, rivets:false, plain:true}
  app.panel = (x, y, w, h, o = NO) => CH.panel(app, x, y, w, h, o);
  app.inRect = (x, y, w, h) => app.mouse.x >= x && app.mouse.x <= x + w && app.mouse.y >= y && app.mouse.y <= y + h && !app.blocked;
  app.hover = app.inRect;
  // A click is used ONCE per frame: whoever claims it first (a button) consumes it, so a modal that opens on that click
  // cannot also receive it and pick whatever card appeared under the pointer.
  app.clicked = (x, y, w, h) => {
    const hit = !!(app.mouse.released && app.mouse.pressStart && inBox(app.mouse.pressStart, x, y, w, h) && app.inRect(x, y, w, h));
    if (hit) app.mouse.released = false;
    return hit;
  };
  function inBox(p, x, y, w, h) { return p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h; }
  function keyHit(k) { const a = app.pressedKeys; for (let i = 0; i < a.length; i++) { const e = a[i]; if (e && e.key && e.key.toLowerCase() === k) return true; } return false; }
  // Visual press feedback hook: a short brass ripple inside the rect. Screens may call it for custom widgets; set app.onPress to also react.
  app.press = (x, y, w, h, r) => { CH.press(app, x, y, w, h, r); if (app.onPress) app.onPress(x, y, w, h); };
  let hotX = NaN, hotY = NaN, hotL = null;
  // button: returns true on click. o: {fill, stroke, r, color, size, disabled, icon(ctx,x,y,w,h), sub, subColor, key, bold, ui}
  app.button = (label, x, y, w, h, o = NO) => {
    const dis = !!o.disabled, F = app.focus;
    // Hit target floor: a button smaller than minTouch CSS px on screen grows its HIT area (not its look), by at most SMALL.maxHitGrow logical px a side.
    let hx = x, hy = y, hw = w, hh = h;
    if (app.scale < SMALL.floorBelow && app.scale > 0) {
      const m = app.minTouch / app.scale, gx = clamp((m - w) / 2, 0, SMALL.maxHitGrow), gy = clamp((m - h) / 2, 0, SMALL.maxHitGrow);
      hx -= gx; hy -= gy; hw += gx * 2; hh += gy * 2;
    }
    const over = !dis && app.inRect(hx, hy, hw, hh);
    const down = over && app.mouse.down;
    if (over) { app.cursor = 'pointer'; if (hotL !== label || hotX !== x || hotY !== y) { hotL = label; hotX = x; hotY = y; app.hot = label + x + y; if (app.onHover) app.onHover(); } }
    else if (dis && app.inRect(hx, hy, hw, hh)) app.cursor = 'not-allowed';
    let fi = -1;
    if (app.navButtons) { // register for keyboard navigation (pooled records, no allocation after warm-up)
      fi = F.curN++; let rec = F.cur[fi]; if (!rec) rec = F.cur[fi] = { x: 0, y: 0, w: 0, h: 0, dis: false, label: '' };
      rec.x = x; rec.y = y; rec.w = w; rec.h = h; rec.dis = dis; rec.label = label;
    }
    const dy = CH.button(app, x, y, w, h, o, dis ? 3 : down ? 2 : over ? 1 : 0);
    if (fi >= 0 && F.active && fi === F.idx) CH.focusRing(app, x, y + dy, w, h, o.r === undefined ? 8 : o.r);
    if (o.icon) o.icon(ctx, x, y + dy, w, h);
    const size = o.size || 20, ty = y + dy + (o.sub ? h / 2 - app.sz(size) * 0.95 : h / 2 - app.sz(size) * 0.55);
    TO.size = size; TO.align = 'center'; TO.color = dis ? 'rgba(232,220,196,.35)' : (o.color || COL.vellum); TO.bold = o.bold !== false; TO.ui = o.ui; TO.shadow = !dis; TO.maxW = 0;
    app.text(label, x + w / 2, ty, TO);
    if (o.sub) { TO.size = Math.round(size * 0.7); TO.color = o.subColor || 'rgba(232,220,196,.7)'; TO.bold = false; TO.ui = true; TO.shadow = false; app.text(o.sub, x + w / 2, ty + app.sz(size) * 1.15, TO); }
    if (!dis && o.key && keyHit(o.key)) { app.press(x, y, w, h, o.r); return true; }
    if (!dis && fi >= 0 && F.active && F.fire && fi === F.idx) { F.fire = false; app.press(x, y, w, h, o.r); if (app.onClick) app.onClick(); return true; }
    if (!dis && app.clicked(hx, hy, hw, hh)) { app.press(x, y, w, h, o.r); if (app.onClick) app.onClick(); return true; }
    return false;
  };
  // tooltip(title, text, {color, lines}): shown near the pointer this frame. ui/tooltips.js renderTip draws it; the fallback below is used when it returns false.
  app.tooltip = (title, text, o = NO) => { app.tip = { title, text, color: o.color, lines: o.lines, o }; };
  function drawTip() {
    const tip = app.tip; if (!tip) return;
    if (!app.forceTipFallback && renderTip(app, tip) !== false) return; // forceTipFallback: tests and debugging
    const maxW = 300, pad = 12, lh = app.sz(20), tsz = app.sz(19);
    const body = tip.lines ? tip.lines.join('\n') : (tip.text || '');
    const bl = body ? app.wrap(body, maxW, 16, { ui: true }) : [];
    const tl = tip.title ? app.wrap(tip.title, maxW, 19, { bold: true }) : [];
    const h = pad * 2 + tl.length * (tsz + 4) + bl.length * lh, pw = maxW + pad * 2;
    let x = app.mouse.x + 18, y = app.mouse.y + 18;
    if (x + pw > W - 6) x = app.mouse.x - pw - 12; // flip to the left of the pointer
    x = clamp(x, 6, W - pw - 6); y = clamp(y, 6, H - h - 6);
    app.panel(x, y, pw, h, { fill: 'rgba(14,12,10,.97)', stroke: tip.color || 'brass', rivets: false });
    let yy = y + pad;
    if (tip.title) yy += app.text(tip.title, x + pad, yy, { size: 19, bold: true, color: tip.color || COL.lamp, engraved: true, maxW }) + 4;
    if (body) app.text(body, x + pad, yy, { size: 16, ui: true, maxW, lineH: 20, color: COL.vellum });
  }

  // ---- frame loop ----
  let last = 0, running = false;
  app.shake = { x: 0, y: 0 };
  function frame(now) {
    if (!running) return;
    const raw = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    app.tick(raw);
    requestAnimationFrame(frame);
  }
  // keyboard navigation over the buttons registered LAST frame (screens opt in with app.navButtons = true)
  function focusStep() {
    const F = app.focus, prev = F.list; F.list = F.cur; F.cur = prev; F.n = F.curN; F.curN = 0;
    if (!app.navButtons) { F.active = false; return; }
    if (app.mouse.x !== F.lx || app.mouse.y !== F.ly) { if (F.lx !== -999 && app.mouse.x > -900) F.active = false; F.lx = app.mouse.x; F.ly = app.mouse.y; }
    const keys = app.pressedKeys;
    for (let i = 0; i < keys.length; i++) {
      const e = keys[i], k = e && e.key;
      if (k === 'Tab' && F.n > 0) {
        const dir = e.shiftKey ? -1 : 1; let idx = F.active ? F.idx : (dir > 0 ? -1 : F.n);
        for (let g = 0; g < F.n; g++) { idx = (idx + dir + F.n) % F.n; if (!F.list[idx].dis) break; }
        F.idx = idx; F.active = true;
      } else if ((k === 'Enter' || k === ' ') && F.active && F.idx >= 0 && F.idx < F.n) F.fire = true;
    }
  }
  // one simulation + draw step (tests call this directly)
  app.tick = (raw) => {
    const dt = raw * (app.timeScale === undefined ? 1 : app.timeScale);
    app.dt = dt; app.t += dt; app.sceneT += dt; app.frame++;
    // pointer click bookkeeping
    if (app.mouse.pressed) app.mouse.pressStart = { x: app.mouse.x, y: app.mouse.y };
    CH.frameStart(app);
    focusStep();
    // tweens
    for (const tw of app.tweens) {
      tw.t += dt * 1000; const k = clamp(tw.t / tw.ms, 0, 1), e = tw.ease(k);
      for (const p of Object.keys(tw.to)) tw.obj[p] = lerp(tw.from[p], tw.to[p], e);
      if (k >= 1 && tw.done) { const d = tw.done; tw.done = null; d(); }
    }
    app.tweens = app.tweens.filter((tw) => tw.t < tw.ms);
    for (const tm of app.timers) tm.ms -= dt * 1000;
    const due = app.timers.filter((tm) => tm.ms <= 0); app.timers = app.timers.filter((tm) => tm.ms > 0);
    for (const tm of due) tm.fn();
    // draw
    ctx.setTransform(app.px, 0, 0, app.px, 0, 0);
    ctx.clearRect(0, 0, W, H);
    app.tip = null; app.cursor = 'default'; LAYOUT.clear();
    const stack = app.stack;
    for (let i = 0; i < stack.length; i++) {
      const s = stack[i];
      app.blocked = i < stack.length - 1; // only the top screen takes pointer input
      if (s.update) s.update(app, dt);
      if (s.draw) s.draw(app);
    }
    app.blocked = false;
    CH.drawRipples(app);
    drawTip();
    if (app.overlay) app.overlay(app);
    if (app.afterFrame) app.afterFrame(app);
    canvas.style.cursor = app.cursor;
    if (app.mouse.touchUp) { app.mouse.touchUp = false; app.mouse.x = -999; app.mouse.y = -999; }
    app.focus.fire = false;
    app.mouse.pressed = false; app.mouse.released = false; app.mouse.wheel = 0; app.pressedKeys.length = 0;
  };
  app.start = () => { app.resize(); running = true; last = performance.now(); requestAnimationFrame(frame); };
  app.stop = () => { running = false; };
  return app;
}
