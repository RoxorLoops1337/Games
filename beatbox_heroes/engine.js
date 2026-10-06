// BEATBOX HEROES -- engine.js
// The thin runtime: integer pixel scaling, input, the scene manager, particles, screen shake / flash / fade,
// a pixel-text cache, glow sprites, and the DOM UI kit (buttons, toasts, banners, dialogs, HUD).
(function (root) {
  'use strict';
  const BBH = root.BBH;
  const { Pix, PAL, Font, Core, CATALOG } = BBH;
  const W = 360, H = 640, UW = 270, UH = 480, K = W / UW;   // canvas grid 360x640; DOM UI is authored in 270x480 CSS units
  const $ = (id) => document.getElementById(id);

  const E = BBH.Eng = { W, H, UW, UH, K, scenes: {}, scene: null, sceneName: '', t: 0, dt: 0, S: 1, particles: [], paused: false, frame: 0 };

  /* ---------------------------------------------------------------- storage */
  const mem = {};
  const store = E.store = {
    getItem(k) { try { return root.localStorage.getItem(k); } catch (e) { return k in mem ? mem[k] : null; } },
    setItem(k, v) { try { root.localStorage.setItem(k, v); } catch (e) { mem[k] = v; } },
    removeItem(k) { try { root.localStorage.removeItem(k); } catch (e) { delete mem[k]; } },
  };
  const defaults = { music: 0.8, sfx: 0.9, offset: 0, reduce: false, scan: true, muted: false };
  E.settings = Object.assign({}, defaults);
  try { Object.assign(E.settings, JSON.parse(store.getItem('bbh:settings') || '{}')); } catch (e) { /* ignore */ }
  E.saveSettings = () => store.setItem('bbh:settings', JSON.stringify(E.settings));

  /* ------------------------------------------------------------------ audio */
  const noop = () => {};
  E.A = () => BBH.Audio || { sfx: noop, drum: noop, unlock: noop, setMuted: noop, setVolume: noop, now: () => performance.now() / 1000, music: { play: noop, stop: noop, beat: () => 0, bpm: () => 100, current: () => null }, groove: { start: () => null, stop: noop, setIntensity: noop } };
  E.sfx = (name, o) => { try { E.A().sfx(name, o); } catch (e) { /* audio must never break the game */ } };
  E.music = (id, o) => { try { E.A().music.play(id, o); } catch (e) { /* ignore */ } };
  E.applyAudioSettings = () => { try { const A = E.A(); A.setMuted(!!E.settings.muted); A.setVolume({ music: E.settings.music, sfx: E.settings.sfx }); } catch (e) { /* ignore */ } };

  /* ---------------------------------------------------------------- display */
  const stage = $('stage'), cv = $('cv'), ui = $('ui');
  const ctx = E.ctx = cv.getContext('2d', { alpha: false });
  E.cv = cv; E.ui = ui; E.stage = stage;
  ctx.imageSmoothingEnabled = false;
  function resize() {
    const vw = root.innerWidth, vh = root.innerHeight, dpr = root.devicePixelRatio || 1;
    let n = Math.min(vw * dpr / W, vh * dpr / H);              // device pixels per canvas pixel
    if (n >= 2) n = Math.floor(n);                              // integer = crisp (below 2x, fractional so the game still fills the screen)
    const s = n * K / dpr;                                    // stage scale (stage is 270x480 css units, canvas is 360 px across it)
    E.S = s; stage.style.transform = 'scale(' + s + ')';
    stage.style.left = Math.floor((vw - UW * s) / 2) + 'px'; stage.style.top = Math.floor((vh - UH * s) / 2) + 'px';
  }
  root.addEventListener('resize', resize); resize();

  /* ------------------------------------------- layout-space context wrapper */
  // Scenes with hand-placed drawing (the rhythm game) think in the old 270x480 layout space. LCtx scales POSITIONS
  // (and rect/ellipse/gradient geometry) by K with edge snapping, but leaves sprite and text sizes native, so everything
  // stays on the 360x640 pixel grid. Native drawing uses the real context (L.real).
  class LCtx {
    constructor(real) { this.real = real; this.L = true; }
    px(x) { return Math.round(x * K); } py(y) { return Math.round(y * K); }
    save() { this.real.save(); } restore() { this.real.restore(); } beginPath() { this.real.beginPath(); } stroke() { this.real.stroke(); } fill() { this.real.fill(); } closePath() { this.real.closePath(); }
    fillRect(x, y, w, h) { const x0 = this.px(x), y0 = this.py(y); this.real.fillRect(x0, y0, Math.max(1, this.px(x + w) - x0), Math.max(1, this.py(y + h) - y0)); }
    moveTo(x, y) { this.real.moveTo(x * K, y * K); } lineTo(x, y) { this.real.lineTo(x * K, y * K); }
    ellipse(x, y, rx, ry, a, s, e) { this.real.ellipse(x * K, y * K, rx * K, ry * K, a, s, e); }
    createLinearGradient(a, b, c2, d) { return this.real.createLinearGradient(a * K, b * K, c2 * K, d * K); }
    drawImage(img, x, y, w, h) { if (w === undefined) this.real.drawImage(img, this.px(x), this.py(y)); else this.real.drawImage(img, this.px(x), this.py(y), w, h); }
    translate(x, y) { this.real.translate(x * K, y * K); }
    burst(x, y, n, o) { o = Object.assign({}, o); if (o.speed) o.speed *= K; E.burst(x * K, y * K, n, o); }
  }
  ['fillStyle', 'strokeStyle', 'globalAlpha', 'globalCompositeOperation', 'lineWidth'].forEach((p) => Object.defineProperty(LCtx.prototype, p, { get() { return this.real[p]; }, set(v) { this.real[p] = v; } }));
  const LC = E.Lctx = new LCtx(ctx);

  /* ------------------------------------------------------------------ input */
  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; };
  E.pointer = { x: 0, y: 0, down: false };
  cv.addEventListener('pointerdown', (e) => { const p = pos(e); E.pointer = { x: p.x, y: p.y, down: true }; E.unlockAudio(); try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } if (E.scene && E.scene.pointer) E.scene.pointer('down', p.x, p.y, e.pointerId); });
  cv.addEventListener('pointermove', (e) => { const p = pos(e); E.pointer.x = p.x; E.pointer.y = p.y; if (E.scene && E.scene.pointer) E.scene.pointer('move', p.x, p.y, e.pointerId); });
  const up = (e) => { const p = pos(e); E.pointer.down = false; if (E.scene && E.scene.pointer) E.scene.pointer('up', p.x, p.y, e.pointerId); };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  root.addEventListener('keydown', (e) => { if (e.repeat) return; if (/INPUT|TEXTAREA/.test((document.activeElement || {}).tagName || '')) return; E.unlockAudio(); if (E.scene && E.scene.key) { if (E.scene.key(e.code, true, e) !== false && /^(Space|Arrow)/.test(e.code)) e.preventDefault(); } });
  root.addEventListener('keyup', (e) => { if (E.scene && E.scene.key) E.scene.key(e.code, false, e); });
  let unlocked = false;
  E.unlockAudio = () => { if (unlocked) { return; } unlocked = true; try { E.A().unlock(); E.applyAudioSettings(); } catch (e) { unlocked = false; } };
  ['touchstart', 'mousedown'].forEach((n) => root.addEventListener(n, () => E.unlockAudio(), { passive: true }));
  document.addEventListener('visibilitychange', () => { E.paused = document.hidden; if (E.scene && E.scene.visibility) E.scene.visibility(!document.hidden); });

  /* ------------------------------------------------------------ text, glow */
  const txtCache = new Map();
  E.txt = function (c, str, x, y, o) {
    if (c.L) { x = c.px(x); y = c.py(y); c = c.real; }
    o = o || {}; str = String(str);
    const key = str + '|' + (o.color || '#fff') + '|' + (o.scale || 1) + '|' + (o.outline || '') + '|' + (o.shadow || '');
    let p = txtCache.get(key);
    if (!p) { if (txtCache.size > 600) txtCache.clear(); p = Font.text(str, { color: o.color || '#fffaf0', scale: o.scale || 1, outline: o.outline === undefined ? PAL.ink : o.outline, shadow: o.shadow }); txtCache.set(key, p); }
    const w = p.w; let dx = x;
    if (o.align === 'c') dx = x - Math.floor(w / 2); else if (o.align === 'r') dx = x - w;
    if (o.a !== undefined && o.a < 1) { c.save(); c.globalAlpha = o.a; p.draw(c, dx, y); c.restore(); } else p.draw(c, dx, y);
    return w;
  };
  const bayer = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const glows = new Map();
  // dithered additive glow sprite (use with globalCompositeOperation 'lighter')
  E.glow = function (r, color) {
    r = Math.max(2, Math.round(r)); const key = r + color; let p = glows.get(key); if (p) return p;
    const k = BBH.C(color); p = new Pix(r * 2 + 1, r * 2 + 1);
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = Math.sqrt(x * x + y * y) / r; if (d >= 1) continue;
      const inten = (1 - d) * (1 - d), th = (bayer[(y + r) & 3][(x + r) & 3] + 0.5) / 16;
      const lvl = Math.floor(inten * 4 + (inten * 4 % 1 > th ? 1 : 0)) / 4; if (lvl <= 0) continue;
      p.px(x + r, y + r, [k[0] * lvl, k[1] * lvl, k[2] * lvl, 255]);
    }
    glows.set(key, p); return p;
  };
  E.drawGlow = (c, x, y, r, color, a) => { if (c.L) { x *= K; y *= K; r *= K; c = c.real; } const g = E.glow(r, color); c.save(); c.globalCompositeOperation = 'lighter'; if (a !== undefined) c.globalAlpha = a; c.drawImage(g.canvas(), Math.round(x - r), Math.round(y - r)); c.restore(); };
  // vignette + faint scanlines, built once
  const overlay = new Pix(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - W / 2) / (W / 2), dy = (y - H / 2) / (H / 2), d = Math.sqrt(dx * dx * 0.9 + dy * dy * 0.7);
    const v = Math.max(0, d - 0.62) * 1.5, th = (bayer[y & 3][x & 3] + 0.5) / 16;
    const lvl = Math.floor(v * 5 + ((v * 5) % 1 > th ? 1 : 0)) / 5; if (lvl > 0) overlay.px(x, y, [10, 6, 24, Math.min(255, lvl * 200)]);
  }
  const scan = new Pix(W, H); for (let y = 0; y < H; y += 2) scan.rect(0, y, W, 1, [0, 0, 0, 22]);

  /* ----------------------------------------------------------------- juice */
  let shakeAmt = 0, shakeT = 0, flashCol = null, flashT = 0, flashDur = 1;
  E.shake = (amt, ms) => { if (E.settings.reduce) amt *= 0.3; shakeAmt = Math.max(shakeAmt, amt); shakeT = Math.max(shakeT, ms || 150); };
  E.flash = (color, ms) => { if (E.settings.reduce) return; flashCol = color || '#fff'; flashT = flashDur = ms || 140; };
  let fadeA = 0, fadeTo = 0, fadeSpeed = 0, fadeCol = '#120d1f';
  E.fadeTo = (a, ms, col) => { fadeTo = a; fadeSpeed = Math.abs(a - fadeA) / Math.max(1, ms || 200); if (col) fadeCol = col; };
  E.spawn = (p) => { p.life = p.life || 600; p.age = 0; E.particles.push(p); if (E.particles.length > 500) E.particles.shift(); return p; };
  E.burst = (x, y, n, o) => {
    o = o || {};
    for (let i = 0; i < n; i++) {
      const a = (o.angle !== undefined ? o.angle : Math.random() * Math.PI * 2) + (Math.random() - 0.5) * (o.spread === undefined ? 6.28 : o.spread), sp = (o.speed || 60) * (0.4 + Math.random() * 0.8);
      const col = o.colors ? o.colors[(Math.random() * o.colors.length) | 0] : (o.color || '#fff');
      E.spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up || 0), ay: o.gravity === undefined ? 120 : o.gravity, life: (o.life || 600) * (0.6 + Math.random() * 0.6), color: col, size: o.size || 1, spr: o.spr, fade: true });
    }
  };
  function updateParticles(dt) {
    const s = dt / 1000;
    for (let i = E.particles.length - 1; i >= 0; i--) {
      const p = E.particles[i]; p.age += dt; if (p.age >= p.life) { E.particles.splice(i, 1); continue; }
      p.vy += (p.ay || 0) * s; p.vx += (p.ax || 0) * s; p.x += p.vx * s; p.y += p.vy * s;
    }
  }
  function drawParticles(c) {
    for (const p of E.particles) {
      const k = 1 - p.age / p.life; c.save(); if (p.fade) c.globalAlpha = Math.min(1, k * 1.6);
      if (p.add) c.globalCompositeOperation = 'lighter';
      if (p.spr) { const sp = Array.isArray(p.spr) ? p.spr[Math.min(p.spr.length - 1, Math.floor((1 - k) * p.spr.length))] : p.spr; sp.draw(c, p.x - (sp.w >> 1), p.y - (sp.h >> 1)); }
      else { c.fillStyle = p.color; const s = p.size || 1; c.fillRect(Math.round(p.x), Math.round(p.y), s, s); }
      c.restore();
    }
  }
  E.fxSprite = (name) => { try { return BBH.World.fx(name); } catch (e) { return null; } };
  E.icon = (name) => { try { return BBH.World.icon(name); } catch (e) { return new Pix(12, 12).rect(1, 1, 10, 10, '#ff00ff'); } };

  /* ---------------------------------------------------------------- scenes */
  E.go = function (name, args, o) {
    o = o || {};
    const sw = () => {
      if (E.scene && E.scene.leave) { try { E.scene.leave(); } catch (e) { console.error(e); } }
      E.clearUI(); E.particles.length = 0;
      E.sceneName = name; E.scene = E.scenes[name]; if (!E.scene) throw new Error('no scene ' + name);
      E.scene.t = 0;
      if (E.scene.enter) E.scene.enter(args || {});
      if (!o.nofade) E.fadeTo(0, o.ms || 220);
    };
    if (o.nofade || !E.scene) { fadeA = 0; fadeTo = 0; sw(); return; }
    E.fadeTo(1, o.ms || 180); E.pendingSwitch = sw; E.switchAt = E.t + (o.ms || 180);
  };

  /* ------------------------------------------------------------------ loop */
  let last = 0;
  E.start = function () {
    const tick = (now) => {
      requestAnimationFrame(tick);
      let dt = Math.min(50, now - (last || now)); last = now; if (E.paused) return;
      E.dt = dt; E.t += dt; E.frame++;
      if (E.pendingSwitch && E.t >= E.switchAt) { const f = E.pendingSwitch; E.pendingSwitch = null; f(); }
      try {
        if (E.scene) { E.scene.t += dt; if (E.scene.update) E.scene.update(dt); }
        updateParticles(dt);
        ctx.save();
        if (shakeT > 0) { shakeT -= dt; const a = shakeAmt * Math.max(0, shakeT / 150 > 1 ? 1 : shakeT / 150); ctx.translate(Math.round((Math.random() - 0.5) * 2 * a), Math.round((Math.random() - 0.5) * 2 * a)); if (shakeT <= 0) shakeAmt = 0; }
        ctx.fillStyle = PAL.ink; ctx.fillRect(0, 0, W, H);
        if (E.scene && E.scene.draw) E.scene.draw(ctx, LC);
        drawParticles(ctx);
        ctx.restore();
        if (E.scene && E.scene.drawTop) E.scene.drawTop(ctx);
        if (!E.settings.reduce || true) overlay.draw(ctx, 0, 0);
        if (E.settings.scan) scan.draw(ctx, 0, 0);
        if (flashT > 0) { flashT -= dt; ctx.save(); ctx.globalAlpha = Math.max(0, flashT / flashDur) * 0.55; ctx.fillStyle = flashCol; ctx.fillRect(0, 0, W, H); ctx.restore(); }
        if (fadeA !== fadeTo) { fadeA += Math.sign(fadeTo - fadeA) * fadeSpeed * dt; if (Math.abs(fadeA - fadeTo) < fadeSpeed * dt) fadeA = fadeTo; }
        if (fadeA > 0.01) { ctx.save(); ctx.globalAlpha = Math.min(1, fadeA); ctx.fillStyle = fadeCol; ctx.fillRect(0, 0, W, H); ctx.restore(); }
        if (E.showFps) { E.fps = (E.fps || 60) * 0.95 + (1000 / dt) * 0.05; E.txt(ctx, Math.round(E.fps) + ' FPS', 2, 2, { color: '#9dff4a' }); }
      } catch (err) { E.fatal(err); }
    };
    requestAnimationFrame(tick);
  };
  E.fatal = function (err) {
    console.error(err); const f = $('fatal'); f.style.display = 'block';
    f.textContent = 'Something broke:\n' + (err && err.stack || err) + '\n\n(tap to dismiss)'; f.onclick = () => { f.style.display = 'none'; };
  };

  /* ----------------------------------------------------------------- UI kit */
  // h('div.panel.col', {style:{left:'4px'}, onclick:fn}, child, 'text', ...)
  const h = E.h = function (spec, props, ...kids) {
    const parts = spec.split('.'), el = document.createElement(parts[0] || 'div'); if (parts.length > 1) el.className = parts.slice(1).join(' ');
    if (props) for (const k of Object.keys(props)) {
      const v = props[k]; if (v === undefined || v === null || v === false) continue;
      if (k === 'style') Object.assign(el.style, v); else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'html') el.innerHTML = v; else if (k === 'text') el.textContent = v; else el.setAttribute(k, v);
    }
    for (const c of kids.flat()) { if (c === undefined || c === null || c === false) continue; el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); }
    return el;
  };
  E.clearUI = () => { ui.innerHTML = ''; E.toastY = 0; };
  E.add = (el) => { ui.appendChild(el); return el; };
  E.pixEl = function (pix, scale, extra) {
    const c = document.createElement('canvas'); c.width = pix.w; c.height = pix.h; c.getContext('2d').drawImage(pix.canvas(), 0, 0);
    c.style.width = pix.w * (scale || 1) + 'px'; c.style.height = pix.h * (scale || 1) + 'px'; if (extra) Object.assign(c.style, extra); return c;
  };
  E.iconEl = (name, scale, extra) => E.pixEl(E.icon(name), scale || 1, extra);
  // gold/pink/... button; fn gets the click. Plays a click sfx. opts: {cls, style, sfx}
  E.btn = function (label, cls, fn, style) {
    const b = h('div.btn' + (cls ? '.' + cls.split(' ').join('.') : ''), { style }, label);
    b.addEventListener('click', (ev) => { ev.stopPropagation(); if (b.classList.contains('dis')) { E.sfx('error'); return; } E.sfx('click'); if (fn) fn(ev); });
    return b;
  };
  E.bar = function (color, frac) { const i = h('i', { style: { width: Math.max(0, Math.min(1, frac)) * 100 + '%', background: color, boxShadow: 'inset 0 1px 0 rgba(255,255,255,.35)' } }); return h('div.bar', null, i); };

  // toasts stack from the top
  let toasts = [];
  E.toast = function (text, kind) {
    const el = h('div.toast' + (kind ? '.' + kind : ''), { style: { top: 40 + toasts.length * 22 + 'px' } }, text); ui.appendChild(el); toasts.push(el);
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => { el.remove(); toasts = toasts.filter((x) => x !== el); toasts.forEach((t, i) => { t.style.top = 40 + i * 22 + 'px'; }); }, 300); }, 2300);
  };

  // big banner popups (achievement, level up, unlock). queued so they never overlap
  const bq = []; let bBusy = false;
  E.banner = function (kind, title, sub, pix) { bq.push({ kind, title, sub, pix }); if (!bBusy) nextBanner(); };
  function nextBanner() {
    const b = bq.shift(); if (!b) { bBusy = false; return; } bBusy = true;
    const col = b.kind === 'levelup' ? 'var(--lime)' : b.kind === 'achievement' ? 'var(--gold2)' : 'var(--cyan)';
    const el = h('div.panel.pop', { style: { left: '14px', right: '14px', top: '58px', textAlign: 'center', padding: '8px 6px', zIndex: 40, boxShadow: '0 0 0 1px var(--ink),0 0 0 2px ' + col + ',0 0 0 3px var(--ink), inset 0 0 0 1px #34235a', pointerEvents: 'none' } },
      h('div.tp', { style: { color: col, marginBottom: '4px' } }, b.kind === 'levelup' ? 'LEVEL UP!' : b.kind === 'achievement' ? 'ACHIEVEMENT' : 'NEW UNLOCK'),
      b.pix ? h('div', { style: { display: 'flex', justifyContent: 'center', marginBottom: '3px' } }, E.pixEl(b.pix, b.pix.w > 30 ? 1 : 2)) : null,
      h('div.h2', { style: { color: 'var(--cream)' } }, b.title), b.sub ? h('div.ts', { style: { marginTop: '3px' } }, b.sub) : null);
    ui.appendChild(el);
    E.burst(180, 107, 22, { colors: [PAL.gold, PAL.neonPink, PAL.neonCyan, PAL.neonLime, '#fff'], speed: 90, up: 30 });
    setTimeout(() => { el.style.transition = 'opacity .25s'; el.style.opacity = '0'; setTimeout(() => { el.remove(); nextBanner(); }, 260); }, 2400);
  }

  // Dialog: lines = [{ who:'foxy'|null, name?, look?, text, mood? }]; returns after the last tap via onDone
  E.dialog = function (lines, onDone) {
    let i = 0, shown = 0, timer = null, full = '';
    const box = h('div.panel.sheet', { style: { height: '86px', zIndex: 50, padding: '6px' } });
    const portrait = h('div', { style: { position: 'absolute', left: '6px', top: '-26px', width: '56px', height: '56px', background: 'var(--n0)', boxShadow: '0 0 0 1px var(--ink), 0 0 0 2px var(--dusk), 0 0 0 3px var(--ink)' } });
    const nameEl = h('div.tp.gold', { style: { position: 'absolute', left: '68px', top: '-9px', background: 'var(--n2)', padding: '2px 4px', boxShadow: '0 0 0 1px var(--ink)' } });
    const textEl = h('div.t', { style: { position: 'absolute', left: '8px', right: '8px', top: '34px', height: '48px', overflow: 'hidden', fontSize: '8px', lineHeight: '10px' } });
    const hint = h('div.tp.blink', { style: { position: 'absolute', right: '6px', bottom: '3px', color: 'var(--gold2)' } }, '>');
    box.append(portrait, nameEl, textEl, hint);
    const veil = h('div.full', { style: { zIndex: 49 } }); ui.append(veil, box);
    function show() {
      const L = lines[i]; if (!L) { finish(); return; }
      const npc = L.who && Core.NPCS[L.who]; const look = L.look || (npc && npc.look) || null; const nm = L.name || (npc && npc.name) || '';
      portrait.innerHTML = ''; if (look) { try { portrait.appendChild(E.pixEl(BBH.Chars.portrait(BBH.Chars.fix(look), L.mood || 'neutral'), 1)); } catch (e) { /* ignore */ } }
      portrait.style.display = look ? 'block' : 'none'; nameEl.textContent = nm; nameEl.style.display = nm ? 'block' : 'none';
      full = L.text; shown = 0; textEl.textContent = ''; clearInterval(timer);
      timer = setInterval(() => { shown += 1; textEl.textContent = full.slice(0, shown); if (shown % 3 === 1 && full[shown - 1] !== ' ') E.sfx('click', { quiet: true, pitch: 1.4 }); if (shown >= full.length) clearInterval(timer); }, 22);
    }
    function adv() { if (shown < full.length) { clearInterval(timer); shown = full.length; textEl.textContent = full; return; } i++; if (i >= lines.length) finish(); else { E.sfx('click'); show(); } }
    function finish() { clearInterval(timer); box.remove(); veil.remove(); if (onDone) onDone(); }
    box.addEventListener('click', adv); veil.addEventListener('click', adv); show();
    return { close: finish };
  };

  // Modal: { title, body: Element|string, buttons:[{label, cls, fn}] }
  E.modal = function (o) {
    const veil = h('div.full', { style: { background: 'rgba(10,6,24,.72)', zIndex: 60 } });
    const buttons = (o.buttons || [{ label: 'OK' }]).map((b) => E.btn(b.label, b.cls || '', () => { close(); if (b.fn) b.fn(); }));
    const box = h('div.panel.pop', { style: { left: '18px', right: '18px', top: o.top || '140px', zIndex: 61, padding: '8px' } },
      o.title ? h('div.h1.ctr', { style: { marginBottom: '6px' } }, o.title) : null,
      typeof o.body === 'string' ? h('div.t.ctr', { style: { marginBottom: '8px' } }, o.body) : o.body, h('div.row', { style: { justifyContent: 'center', marginTop: '8px' } }, buttons));
    function close() { veil.remove(); box.remove(); }
    ui.append(veil, box); return { close };
  };

  /* -------------------------------------------------------------- the HUD */
  E.hudEl = null;
  E.makeHud = function (G) {
    const need = (icon, color) => { const b = E.bar(color, 1); return { box: h('div.row', { style: { gap: '2px' } }, E.iconEl(icon, 1), h('div.grow', null, b)), bar: b.firstChild }; };
    const en = need('energy', '#ffd23f'), hu = need('food', '#7be08f'), mo = need('mood', '#ff7bc4');
    const clk = h('div.tp', { style: { color: 'var(--cream)' } }), cash = h('div.tp.gold'), fans = h('div.tp.cyan'), lvl = h('div.tp.lime');
    const xp = E.bar('#9dff4a', 0);
    const el = h('div.panel.flat', { style: { left: '0', right: '0', top: '0', height: '39px', padding: '3px 4px', zIndex: 20, background: 'rgba(23,16,39,.9)' } },
      h('div.row', { style: { justifyContent: 'space-between', height: '10px' } }, clk,
        h('div.row', { style: { gap: '2px' } }, E.iconEl('coin', 1), cash), h('div.row', { style: { gap: '2px' } }, E.iconEl('fans', 1), fans), lvl),
      h('div.row', { style: { marginTop: '4px', gap: '5px' } }, h('div.grow', null, en.box), h('div.grow', null, hu.box), h('div.grow', null, mo.box)),
      h('div', { style: { marginTop: '3px', height: '4px' } }, xp));
    xp.style.height = '3px';
    el.update = function (ch) {
      clk.textContent = Core.dayName(ch.day).slice(0, 3).toUpperCase() + ' ' + ch.day + '  ' + Core.clock(ch.minutes);
      cash.textContent = '$' + ch.cash; fans.textContent = ch.fans; lvl.textContent = 'LV' + ch.level;
      en.bar.style.width = ch.energy / ch.maxEnergy * 100 + '%'; en.bar.style.background = ch.energy < 20 ? '#ff4f6a' : '#ffd23f';
      hu.bar.style.width = ch.hunger + '%'; hu.bar.style.background = ch.hunger < 20 ? '#ff4f6a' : '#7be08f'; mo.bar.style.width = ch.mood + '%';
      xp.firstChild.style.width = ch.xp / Core.xpNeed(ch.level) * 100 + '%';
    };
    // the secret dev door: triple tap the clock
    let taps = 0, tt = 0; clk.addEventListener('click', () => { const n = performance.now(); taps = n - tt < 600 ? taps + 1 : 1; tt = n; if (taps >= 3) { taps = 0; if (G.openDev) G.openDev(); } });
    clk.style.pointerEvents = 'auto'; E.hudEl = el; el.update(G.ch); return el;
  };

  /* --------------------------------------------------------- draw helpers */
  // deterministic rain streaks (no state): density drops over the screen, wind in px/s
  E.rain = function (c, t, o) {
    if (c.L) c = c.real;
    o = o || {}; const n = o.n || 60, vy = o.vy || 260, vx = o.vx || -50, len = o.len || 4, w = o.w || W, h2 = o.h || H;
    c.save(); c.fillStyle = o.color || 'rgba(170,200,255,0.45)';
    for (let i = 0; i < n; i++) {
      const sp = 0.7 + ((i * 7) % 5) / 8, x = (((i * 53) % w) + vx * sp * t / 1000) % w, y = (((i * 97) % h2) + vy * sp * t / 1000) % h2;
      c.fillRect(Math.round((x + w) % w), Math.round(y), 1, len);
    }
    c.restore();
  };
  // soft contact shadow under a character (feet centre x,y)
  E.shadow = function (c, x, y, w, a) {
    if (c.L) { x = c.px(x); y = c.py(y); w = (w || 26) * K; c = c.real; }
    c.save(); c.fillStyle = 'rgba(10,6,24,' + (a === undefined ? 0.45 : a) + ')'; w = w || 34;
    c.fillRect(Math.round(x - w / 2 + 2), Math.round(y - 2), w - 4, 1); c.fillRect(Math.round(x - w / 2), Math.round(y - 1), w, 2); c.fillRect(Math.round(x - w / 2 + 2), Math.round(y + 1), w - 4, 1); c.restore();
  };
  // draw a character with feet at (x,y). o: {flip, scale, shadow, frame}
  E.hero = function (c, look, pose, x, y, o) {
    if (c.L) { x = c.px(x); y = c.py(y); c = c.real; }
    o = o || {}; const C = BBH.Chars, sp = C.render(look, pose, o.t === undefined ? E.t : o.t, { frame: o.frame, flip: false }), sc = o.scale || 1;
    if (o.shadow !== false) E.shadow(c, x, y, 34 * sc, o.shadowA);
    const cv = sp.canvas();
    if (o.a !== undefined && o.a < 1) { c.save(); c.globalAlpha = o.a; }
    if (sc === 1) sp.draw(c, x - (sp.w >> 1), y - sp.h + 1, { flip: o.flip });
    else { c.save(); c.imageSmoothingEnabled = false; const w = sp.w * sc, hh = sp.h * sc, dx = Math.round(x - w / 2), dy = Math.round(y - hh + sc);
      if (o.flip) { c.translate(dx + w, dy); c.scale(-1, 1); c.drawImage(cv, 0, 0, w, hh); } else c.drawImage(cv, dx, dy, w, hh); c.restore(); }
    if (o.a !== undefined && o.a < 1) c.restore();
    return sp;
  };
  E.beat = () => { try { return E.A().music.beat() || 0; } catch (e) { return 0; } };

  BBH.E = E; E.W = W; E.H = H;
})(typeof globalThis !== 'undefined' ? globalThis : this);
