// Immediate-mode canvas UI toolkit. One 1280x720 logical canvas, scaled to fit. Every screen is an object:
//   { name, enter(app, params), leave(app), update(app, dt), draw(app), key(app, e) }
// Screens redraw every frame and call app.button(...) etc.; clicks are resolved from last frame's pointer state.
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
    scale: 1, offX: 0, offY: 0, textCache: new Map(),
  };

  // ---- stage scaling ----
  app.resize = () => {
    const iw = window.innerWidth, ih = window.innerHeight;
    if (!(iw > 0 && ih > 0)) return; // hidden iframe / minimised: keep the last good size
    app.scale = Math.min(iw / W, ih / H);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = W * app.scale + 'px'; canvas.style.height = H * app.scale + 'px';
    canvas.style.left = (iw - W * app.scale) / 2 + 'px'; canvas.style.top = (ih - H * app.scale) / 2 + 'px';
    canvas.width = Math.round(W * app.scale * dpr); canvas.height = Math.round(H * app.scale * dpr);
    app.dpr = dpr; app.px = canvas.width / W;
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
  window.addEventListener('keydown', (e) => { if (e.repeat) return; app.keys.add(e.key); app.pressedKeys.push(e); const s = top(); if (s && s.key && s.key(app, e)) e.preventDefault(); });
  window.addEventListener('keyup', (e) => app.keys.delete(e.key));
  window.addEventListener('resize', app.resize);

  // ---- screens ----
  const top = () => app.stack[app.stack.length - 1];
  app.register = (name, scr) => { scr.name = name; app.screens[name] = scr; };
  app.go = (name, params) => {
    for (const s of app.stack) if (s.leave) s.leave(app);
    app.stack = [];
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
  function font(size, o = {}) { return `${o.italic ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${size}px ${o.ui ? FONT_UI : FONT}`; }
  app.font = font;
  app.wrap = (str, maxW, size, o = {}) => {
    const key = str + '|' + maxW + '|' + size + '|' + (o.bold ? 1 : 0) + (o.ui ? 1 : 0);
    const hit = app.textCache.get(key); if (hit) return hit;
    ctx.save(); ctx.font = font(size, o);
    const out = [];
    for (const para of String(str).split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > maxW && line) { out.push(line); line = word; } else line = test;
      }
      out.push(line);
    }
    ctx.restore();
    if (app.textCache.size > 800) app.textCache.clear();
    app.textCache.set(key, out); return out;
  };
  // text(str, x, y, {size, color, align, baseline, bold, italic, ui, maxW, lineH, shadow, alpha, stroke}) -> total height
  app.textScale = 1;
  app.text = (str, x, y, o = {}) => {
    const size = Math.round((o.size || 18) * (o.fixed ? 1 : app.textScale)), lineH = o.lineH || Math.round(size * 1.22);
    ctx.save();
    ctx.font = font(size, o); ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.baseline || 'top';
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    const lines = o.maxW ? app.wrap(str, o.maxW, size, o) : String(str).split('\n');
    lines.forEach((ln, i) => {
      const yy = y + i * lineH;
      if (o.shadow) { ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillText(ln, x + 1.5, yy + 1.5); }
      if (o.stroke) { ctx.lineWidth = o.strokeW || 3; ctx.strokeStyle = o.stroke; ctx.lineJoin = 'round'; ctx.strokeText(ln, x, yy); }
      ctx.fillStyle = o.color || COL.vellum; ctx.fillText(ln, x, yy);
    });
    ctx.restore();
    return lines.length * lineH;
  };
  app.measure = (str, size, o = {}) => { ctx.save(); ctx.font = font(size, o); const w = ctx.measureText(str).width; ctx.restore(); return w; };
  app.rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); };
  app.panel = (x, y, w, h, o = {}) => {
    ctx.save();
    app.rr(x, y, w, h, o.r === undefined ? 10 : o.r);
    ctx.fillStyle = o.fill || 'rgba(26,22,20,.92)'; ctx.fill();
    ctx.lineWidth = o.lw || 2; ctx.strokeStyle = o.stroke || 'rgba(232,220,196,.35)'; ctx.stroke();
    ctx.restore();
  };
  app.inRect = (x, y, w, h) => app.mouse.x >= x && app.mouse.x <= x + w && app.mouse.y >= y && app.mouse.y <= y + h && !app.blocked;
  app.hover = app.inRect;
  app.clicked = (x, y, w, h) => app.mouse.released && app.mouse.pressStart && inBox(app.mouse.pressStart, x, y, w, h) && app.inRect(x, y, w, h);
  function inBox(p, x, y, w, h) { return p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h; }
  // button: returns true on click. o: {fill, color, size, disabled, icon(ctx,x,y,w,h), sub, key, hot}
  app.button = (label, x, y, w, h, o = {}) => {
    const over = !o.disabled && app.inRect(x, y, w, h);
    const down = over && app.mouse.down;
    if (over) { app.cursor = 'pointer'; if (app.hot !== label + x + y) { app.hot = label + x + y; if (app.onHover) app.onHover(); } }
    ctx.save();
    const lift = over && !down ? -2 : 0;
    app.rr(x, y + lift, w, h, o.r === undefined ? 8 : o.r);
    const base = o.fill || COL.slab2;
    ctx.fillStyle = o.disabled ? 'rgba(60,54,50,.7)' : down ? shade(base.startsWith('#') ? base : '#26201c', 0.8) : over ? shade(base.startsWith('#') ? base : '#26201c', 1.35) : base;
    ctx.fill();
    ctx.lineWidth = over ? 2.5 : 1.8; ctx.strokeStyle = o.disabled ? 'rgba(232,220,196,.2)' : over ? COL.lamp : (o.stroke || 'rgba(232,220,196,.55)'); ctx.stroke();
    ctx.restore();
    if (o.icon) o.icon(ctx, x, y + lift, w, h);
    const ty = y + lift + (o.sub ? h / 2 - (o.size || 20) * 0.95 : h / 2 - (o.size || 20) * 0.55);
    app.text(label, x + w / 2, ty, { size: o.size || 20, align: 'center', color: o.disabled ? 'rgba(232,220,196,.35)' : (o.color || COL.vellum), bold: o.bold !== false, ui: o.ui });
    if (o.sub) app.text(o.sub, x + w / 2, ty + (o.size || 20) * 1.15, { size: Math.round((o.size || 20) * 0.7), align: 'center', color: o.subColor || 'rgba(232,220,196,.7)', ui: true });
    if (o.key && app.pressedKeys.some((e) => e.key.toLowerCase() === o.key) && !o.disabled) return true;
    if (!o.disabled && app.clicked(x, y, w, h)) { if (app.onClick) app.onClick(); return true; }
    return false;
  };
  // tooltip(lines | string): shown near the pointer this frame. {title, text, color}
  app.tooltip = (title, text, o = {}) => { app.tip = { title, text, color: o.color, lines: o.lines }; };
  function drawTip() {
    const tip = app.tip; if (!tip) return;
    const maxW = 300, pad = 12;
    const body = tip.lines ? tip.lines.join('\n') : (tip.text || '');
    const bl = body ? app.wrap(body, maxW, 16, { ui: true }) : [];
    const h = pad * 2 + (tip.title ? 26 : 0) + bl.length * 20;
    let x = app.mouse.x + 18, y = app.mouse.y + 18;
    if (x + maxW + pad * 2 > W) x = app.mouse.x - maxW - pad * 2 - 12;
    if (y + h > H) y = H - h - 8;
    app.panel(x, y, maxW + pad * 2, h, { fill: 'rgba(14,12,10,.97)', stroke: tip.color || COL.lamp });
    let yy = y + pad;
    if (tip.title) { app.text(tip.title, x + pad, yy, { size: 19, bold: true, color: tip.color || COL.lamp }); yy += 26; }
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
  // one simulation + draw step (tests call this directly)
  app.tick = (raw) => {
    const dt = raw * (app.timeScale === undefined ? 1 : app.timeScale);
    app.dt = dt; app.t += dt; app.sceneT += dt; app.frame++;
    // pointer click bookkeeping
    if (app.mouse.pressed) app.mouse.pressStart = { x: app.mouse.x, y: app.mouse.y };
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
    app.tip = null; app.cursor = 'default';
    const stack = app.stack;
    for (let i = 0; i < stack.length; i++) {
      const s = stack[i];
      app.blocked = i < stack.length - 1; // only the top screen takes pointer input
      if (s.update) s.update(app, dt);
      if (s.draw) s.draw(app);
    }
    app.blocked = false;
    drawTip();
    if (app.overlay) app.overlay(app);
    canvas.style.cursor = app.cursor;
    if (app.mouse.touchUp) { app.mouse.touchUp = false; app.mouse.x = -999; app.mouse.y = -999; }
    app.mouse.pressed = false; app.mouse.released = false; app.mouse.wheel = 0; app.pressedKeys.length = 0;
  };
  app.start = () => { app.resize(); running = true; last = performance.now(); requestAnimationFrame(frame); };
  app.stop = () => { running = false; };
  return app;
}
