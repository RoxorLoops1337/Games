/* SUNBEAM SIEGE gfx: juice system. Defines window.SB.gfx.fx (a default instance) and fx.create(opts).
 * Logical pixel coordinates (scene canvas, 384x216 desktop). Visual only: uses its own RNG, never combat RNG.
 * Fixed 60Hz internal step. Reduce motion: no shake, no particles except one static flash glyph,
 * numbers appear in place for 700ms, cards crossfade for 120ms.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  root.SB = root.SB || {}; SB.gfx = SB.gfx || {};

  // ---------- pixel font (3x5) ----------
  var FONT = {
    A: '.x.x.xxxxx.xx.x', B: 'xx.x.xxx.x.xxx.', C: '.xxx..x..x...xx', D: 'xx.x.xx.xx.xxx.', E: 'xxxx..xx.x..xxx', F: 'xxxx..xx.x..x..',
    G: '.xxx..x.xx.x.xx', H: 'x.xx.xxxxx.xx.x', I: 'xxx.x..x..x.xxx', J: '..x..x..xx.x.x.', K: 'x.xx.xxx.x.xx.x', L: 'x..x..x..x..xxx',
    M: 'x.xxxxxxxx.xx.x', N: 'xx.x.xx.xx.xx.x', O: '.x.x.xx.xx.x.x.', P: 'xx.x.xxx.x..x..', Q: '.x.x.xx.xxx..xx', R: 'xx.x.xxx.x.xx.x',
    S: '.xxx...x....xx.', T: 'xxx.x..x..x..x.', U: 'x.xx.xx.xx.xxxx', V: 'x.xx.xx.xx.x.x.', W: 'x.xx.xxxxxxxx.x', X: 'x.xx.x.x.x.xx.x',
    Y: 'x.xx.x.x..x..x.', Z: 'xxx..x.x.x..xxx',
    '0': 'xxxx.xx.xx.xxxx', '1': '.x.xx..x..x.xxx', '2': 'xx...x.x.x..xxx', '3': 'xx...x.x...xxx.', '4': 'x.xx.xxxx..x..x', '5': 'xxxx..xx...xxx.',
    '6': '.xxx..xxxx.xxxx', '7': 'xxx..x.x..x..x.', '8': 'xxxx.xxxxx.xxxx', '9': 'xxxx.xxxx..xx.',
    '+': '....x.xxx.x....', '-': '......xxx......', 'x': '....x.x.x.x.x..', '!': '.x..x..x.....x.', '.': '............x..', '?': 'xx...x.x.....x.', ' ': '               '
  };
  FONT['9'] = 'xxx' + 'x.x' + 'xxx' + '..x' + 'xx.';
  FONT['6'] = '.xx' + 'x..' + 'xxx' + 'x.x' + 'xxx';
  function glyph(ch) { return FONT[ch] || FONT[String(ch).toUpperCase()] || FONT['?']; }
  function textWidth(str, scale) { return (String(str).length * 4 - 1) * (scale || 1); }
  function drawText(ctx, str, x, y, o) {
    o = o || {}; var sc = o.scale || 1, col = o.color || '#f6ecd8', out = o.outline === undefined ? '#140f26' : o.outline;
    str = String(str); var w = textWidth(str, sc); if (o.align === 'center') x -= Math.round(w / 2); else if (o.align === 'right') x -= w;
    x = Math.round(x); y = Math.round(y);
    function pass(c, dx, dy) {
      ctx.fillStyle = c;
      for (var i = 0; i < str.length; i++) {
        var g = glyph(str[i]), ox = x + i * 4 * sc + dx;
        for (var k = 0; k < 15; k++) if (g[k] === 'x') ctx.fillRect(ox + (k % 3) * sc, y + ((k / 3) | 0) * sc + dy, sc, sc);
      }
    }
    if (out) { pass(out, -1, 0); pass(out, 1, 0); pass(out, 0, -1); pass(out, 0, 1); pass(out, 1, 1); }
    pass(col, 0, 0);
  }

  var BITMAPS = {
    heart: ['.x.x.', 'xxxxx', '.xxx.', '..x..'],
    paw: ['x.x.x', '.....', '.xxx.', 'xxxxx', '.xxx.'],
    spark: ['..x..', '..x..', 'xxxxx', '..x..', '..x..'],
    star: ['x...x', '.x.x.', '..x..', '.x.x.', 'x...x'],
    z: ['xxx', '..x', '.x.', 'x..', 'xxx'],
    leaf: ['..xx', '.xxx', 'xxx.', 'xx..'],
    coin: ['.xx.', 'xxxx', 'xxxx', '.xx.'],
    drop: ['.x.', 'xxx', 'xxx', '.x.']
  };
  var EASE = {
    linear: function (t) { return t; },
    out: function (t) { return 1 - (1 - t) * (1 - t); },
    in: function (t) { return t * t; },
    inOut: function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
    outBack: function (t) { var c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  };
  var SHAKE = { hit: [1, 80], bigHit: [3, 180], catDies: [2, 150], sunbeamHit: [4, 260], bossSlam: [5, 350], knock: [3, 200] };
  var NUM_COLORS = { damage: '#ff5d6c', crit: '#ffd95a', heal: '#7be495', block: '#b7b0c8', shatter: '#5fb4ff', hairball: '#b8a85a', warmth: '#ffc766', warmthLoss: '#ff5d6c', info: '#f6ecd8', purr: '#ff8fb0' };
  var CARD_KINDS = {
    draw: { ms: 260, peak: 40, ease: 'out', s0: 1, s1: 1, rot: 0, flip: true },
    unit: { ms: 180, peak: 0, ease: 'in', s0: 1, s1: 0.3, rot: 0 },
    spell: { ms: 320, peak: 60, ease: 'in', s0: 1.2, s1: 0.4, rot: 0 },
    discard: { ms: 240, peak: 0, ease: 'in', s0: 1, s1: 0.7, rot: 15 },
    created: { ms: 300, peak: 30, ease: 'out', s0: 0.5, s1: 1, rot: 0 },
    reward: { ms: 320, peak: 20, ease: 'inOut', s0: 1.3, s1: 0.4, rot: 0 }
  };

  function create(opts) {
    opts = opts || {};
    var fx = {};
    var seed = (opts.seed === undefined ? 0x5eed : opts.seed) >>> 0;
    function rnd() { seed = (seed + 0x6D2B79F5) >>> 0; var t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
    function rr(a, b) { return a + (b - a) * rnd(); }
    var reducedOverride = opts.reduceMotion === undefined ? null : !!opts.reduceMotion;
    var speed = opts.speed || 1, shakeScale = opts.shakeScale === undefined ? 1 : opts.shakeScale;
    var MAXP = 400, MAXN = 24;
    var parts = [], i;
    for (i = 0; i < MAXP; i++) parts.push({ on: false });
    var nums = [], effects = [], emitters = {}, flashes = {}, overlays = [];
    var now = 0, acc = 0, STEP = 1000 / 60, frozenUntil = 0;
    var sh = { p: 0, ms: 0, t: 0, x: 0, y: 0 };

    function isReduced() {
      if (reducedOverride !== null) return reducedOverride;
      try {
        if (typeof document !== 'undefined' && document.documentElement && document.documentElement.classList.contains('reduce-motion')) return true;
        if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
      } catch (e) { /* ignore */ }
      return false;
    }
    fx.isReduced = isReduced;
    fx.setReduceMotion = function (b) { reducedOverride = b === null ? null : !!b; if (isReduced()) { fx.clear(); } };
    fx.setSpeed = function (s) { speed = s || 1; };
    fx.setShakeScale = function (s) { shakeScale = s; };
    fx.rand = rnd;

    function alloc() {
      for (var k = 0; k < MAXP; k++) if (!parts[k].on) return parts[k];
      return null;
    }
    // spawn a particle; o fields: x,y,vx,vy,ax,ay,drag,life,size,color,shape,delay,sway,swayAmp,grow,curve,end,fade
    function P(o) {
      var p = alloc(); if (!p) return null;
      p.on = true; p.x = o.x; p.y = o.y; p.vx = o.vx || 0; p.vy = o.vy || 0; p.ax = o.ax || 0; p.ay = o.ay || 0; p.drag = o.drag === undefined ? 1 : o.drag;
      p.life = 0; p.max = o.life || 400; p.size = o.size || 1; p.color = o.color || '#fff'; p.shape = o.shape || 'sq'; p.delay = o.delay || 0;
      p.sway = o.sway || 0; p.swayAmp = o.swayAmp || 0; p.x0 = o.x; p.grow = o.grow || 0; p.curve = o.curve || null; p.end = o.end || null; p.fade = o.fade === undefined ? 0.35 : o.fade;
      p.len = o.len || 0; p.blink = o.blink || 0; p.ring = o.ring || 0;
      return p;
    }

    // ---------- core loop ----------
    fx.update = function (dtMs) {
      acc += Math.min(dtMs, 100) * speed;
      while (acc >= STEP) { acc -= STEP; step(STEP); }
    };
    fx.hitStop = function (ms) { if (!isReduced()) frozenUntil = Math.max(frozenUntil, now + ms); };
    fx.isHitStopped = function () { return now < frozenUntil; };
    function step(dt) {
      now += dt;
      if (now < frozenUntil) return;
      var k, p, e;
      // shake
      if (sh.t > 0) { sh.t -= dt; var f = Math.max(0, sh.t / sh.ms), pw = sh.p * f * shakeScale; sh.x = Math.round((rnd() * 2 - 1) * pw); sh.y = Math.round((rnd() * 2 - 1) * pw); if (sh.t <= 0) { sh.x = 0; sh.y = 0; } }
      // emitters
      for (var key in emitters) { e = emitters[key]; e.t -= dt; while (e.t <= 0) { e.t += e.every; e.fn(e); } }
      // particles
      for (k = 0; k < MAXP; k++) {
        p = parts[k]; if (!p.on) continue;
        if (p.delay > 0) { p.delay -= dt; if (p.delay > 0) continue; p.life += -p.delay; p.delay = 0; }
        p.life += dt;
        if (p.life >= p.max) { p.on = false; if (p.end) p.end(p); continue; }
        var u = p.life / p.max;
        if (p.curve) {
          var c = p.curve, te = EASE[c.ease || 'inOut'](u), a = 1 - te;
          p.x = a * a * c.sx + 2 * a * te * c.cx + te * te * c.ex; p.y = a * a * c.sy + 2 * a * te * c.cy + te * te * c.ey;
        } else {
          p.vx += p.ax * dt; p.vy += p.ay * dt; var dr = Math.pow(p.drag, dt / STEP); p.vx *= dr; p.vy *= dr;
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.sway) p.x = p.x0 + Math.sin(p.life * p.sway) * p.swayAmp + (p.x - p.x0 - Math.sin((p.life - dt) * p.sway) * p.swayAmp) * 0 ;
          if (p.sway) p.x0 += p.vx * dt;
        }
      }
      for (k = nums.length - 1; k >= 0; k--) { nums[k].t += dt; if (nums[k].t >= nums[k].life + nums[k].delay) nums.splice(k, 1); }
      for (k = effects.length - 1; k >= 0; k--) { effects[k].t += dt; if (effects[k].t >= effects[k].life) { if (effects[k].end) effects[k].end(); effects.splice(k, 1); } }
      for (k = overlays.length - 1; k >= 0; k--) { overlays[k].t += dt; if (overlays[k].t >= overlays[k].life) overlays.splice(k, 1); }
      for (var id in flashes) if (flashes[id] <= now) delete flashes[id];
    }
    fx.clear = function () { for (var k = 0; k < MAXP; k++) parts[k].on = false; nums.length = 0; effects.length = 0; overlays.length = 0; emitters = {}; flashes = {}; sh.t = 0; sh.x = sh.y = 0; frozenUntil = 0; };
    fx.liveCount = function () { var c = 0; for (var k = 0; k < MAXP; k++) if (parts[k].on) c++; return c; };
    fx.now = function () { return now; };

    // ---------- shake and flash ----------
    fx.shake = function (power, ms) {
      if (isReduced() || shakeScale <= 0) return;
      if (sh.t > 0 && sh.p * (sh.t / sh.ms) > power) return;
      sh.p = power; sh.ms = ms; sh.t = ms;
    };
    fx.shakeEvent = function (name) { var s = SHAKE[name]; if (s) fx.shake(s[0], s[1]); };
    fx.shakeOffset = function () { return { x: sh.x, y: sh.y }; };
    fx.flash = function (id, ms) { flashes[id] = now + (ms || 66); };
    fx.isFlashing = function (id) { return flashes[id] > now; };

    // ---------- shapes ----------
    function drawBitmap(ctx, bm, x, y, size) {
      var w = bm[0].length, h = bm.length; x = Math.round(x - (w * size) / 2); y = Math.round(y - (h * size) / 2);
      for (var j = 0; j < h; j++) for (var i2 = 0; i2 < w; i2++) if (bm[j][i2] === 'x') ctx.fillRect(x + i2 * size, y + j * size, size, size);
    }
    function drawRing(ctx, cx, cy, r, th) {
      var n = Math.max(8, Math.round(r * 5));
      for (var a = 0; a < n; a++) { var an = (a / n) * Math.PI * 2; ctx.fillRect(Math.round(cx + Math.cos(an) * r), Math.round(cy + Math.sin(an) * r), th || 1, th || 1); }
    }
    function drawParticle(ctx, p) {
      var u = p.life / p.max, al = 1;
      if (p.fade > 0 && u > 1 - p.fade) al = Math.max(0, (1 - u) / p.fade);
      if (p.blink && Math.floor(p.life / p.blink) % 2) return;
      if (al < 1) ctx.globalAlpha = al;
      ctx.fillStyle = p.color;
      var s = p.size + (p.grow ? Math.floor(u * p.grow) : 0), x = Math.round(p.x), y = Math.round(p.y);
      switch (p.shape) {
        case 'sq': ctx.fillRect(x, y, s, s); break;
        case 'streak': ctx.fillRect(x, y, p.len || 8, 1); break;
        case 'ring': drawRing(ctx, x, y, 2 + u * (p.ring || 10), 1); break;
        default: if (BITMAPS[p.shape]) drawBitmap(ctx, BITMAPS[p.shape], x, y, s); else ctx.fillRect(x, y, s, s);
      }
      if (al < 1) ctx.globalAlpha = 1;
    }

    // ---------- draw ----------
    fx.draw = function (ctx) {
      var k, p;
      ctx.save(); ctx.imageSmoothingEnabled = false;
      for (k = 0; k < effects.length; k++) { ctx.save(); effects[k].draw(ctx, effects[k], effects[k].t / effects[k].life); ctx.restore(); }
      for (k = 0; k < MAXP; k++) { p = parts[k]; if (p.on && p.delay <= 0) drawParticle(ctx, p); }
      ctx.globalAlpha = 1;
      for (k = 0; k < nums.length; k++) drawNumber(ctx, nums[k]);
      for (k = 0; k < overlays.length; k++) drawOverlay(ctx, overlays[k]);
      ctx.restore();
    };
    fx.drawText = drawText; fx.textWidth = textWidth;

    // ---------- damage numbers ----------
    fx.number = function (x, y, value, kind, o) {
      o = o || {}; kind = kind || 'damage';
      var big = o.big !== undefined ? o.big : (kind === 'crit' || (typeof value === 'number' && Math.abs(value) >= 10 && (kind === 'damage' || kind === 'heal')));
      var txt = typeof value === 'number' ? ((kind === 'heal' || kind === 'warmth' || kind === 'purr') ? '+' + value : (kind === 'block' ? '0' : '-' + Math.abs(value))) : String(value);
      if (kind === 'block' && typeof value === 'number' && value !== 0) txt = '0';
      var idx = o.index || 0;
      if (nums.length >= MAXN) nums.shift();
      nums.push({ x: x + (idx ? Math.round(((idx % 2) ? 1 : -1) * Math.min(6, 2 + idx * 2)) : 0), y: y, text: txt, color: o.color || NUM_COLORS[kind] || NUM_COLORS.info, t: 0, delay: idx * 70, life: 700, big: big, shield: kind === 'block' });
    };
    function drawNumber(ctx, n) {
      var t = n.t - n.delay; if (t < 0) return;
      var red = isReduced(), u = t / n.life, sc = n.big ? 2 : 1, rise = red ? 0 : 18 * EASE.out(Math.min(1, u));
      if (!red && t < 100) sc += 1; // pop: 1.4 to 1.0 approximated with integer pixel scale
      var al = 1; if (t > n.life - 200) al = Math.max(0, (n.life - t) / 200);
      var wob = (!red && n.big) ? Math.round(Math.sin(t / 25) * 1) : 0;
      ctx.globalAlpha = al;
      var tx = n.x + wob, ty = n.y - rise - 5 * sc;
      if (n.shield) { drawText(ctx, n.text, tx + 3, ty, { scale: sc, color: n.color, align: 'center' }); ctx.fillStyle = n.color; ctx.fillRect(tx - 4 * sc, ty, 1, 4 * sc); }
      else drawText(ctx, n.text, tx, ty, { scale: sc, color: n.color, align: 'center' });
      ctx.globalAlpha = 1;
    }

    // ---------- overlays (screen edge vignette, tint) ----------
    fx.vignette = function (color, ms, maxAlpha) { if (isReduced()) return; overlays.push({ kind: 'vig', color: color, t: 0, life: ms || 600, a: Math.min(0.3, maxAlpha || 0.3) }); };
    fx.tint = function (color, ms, a) { if (isReduced()) return; overlays.push({ kind: 'tint', color: color, t: 0, life: ms || 400, a: Math.min(0.3, a || 0.2) }); };
    function drawOverlay(ctx, o) {
      var u = o.t / o.life, a = o.a * (u < 0.2 ? u / 0.2 : (1 - u) / 0.8), w = ctx.canvas ? ctx.canvas.width : 384, h = ctx.canvas ? ctx.canvas.height : 216;
      var sx = ctx.getTransform ? ctx.getTransform().a : 1; w = w / sx; h = h / sx;
      ctx.fillStyle = o.color;
      if (o.kind === 'tint') { ctx.globalAlpha = a; ctx.fillRect(0, 0, w, h); }
      else { for (var b = 0; b < 6; b++) { ctx.globalAlpha = a * (1 - b / 6); ctx.fillRect(0, b * 2, w, 2); ctx.fillRect(0, h - (b + 1) * 2, w, 2); ctx.fillRect(b * 2, 0, 2, h); ctx.fillRect(w - (b + 1) * 2, 0, 2, h); } }
      ctx.globalAlpha = 1;
    }

    // ---------- effect helper ----------
    function effect(life, draw, end) { effects.push({ t: 0, life: life, draw: draw, end: end }); }
    function staticGlyph(x, y, shape, color, ms) { effect(ms || 120, function (ctx, e) { ctx.fillStyle = color; drawBitmap(ctx, BITMAPS[shape], x, y, 2); }); }

    // ---------- presets ----------
    fx.hit = function (x, y, color) {
      if (isReduced()) { staticGlyph(x, y, 'star', '#fff', 120); return; }
      for (var k = 0; k < 6; k++) { var a = rnd() * Math.PI * 2, sp = rr(0.05, 0.1); P({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 0.93, life: 300, size: k % 2 ? 2 : 1, color: k % 2 ? '#ffffff' : (color || '#ffd95a') }); }
    };
    fx.slash = function (x, y, o) {
      o = o || {}; var dir = o.dir === -1 ? -1 : 1, col = o.color || '#f6ecd8';
      if (isReduced()) { staticGlyph(x, y, 'spark', col, 120); return; }
      effect(220, function (ctx, e, u) {
        var prog = Math.min(1, u / 0.55), al = u > 0.7 ? (1 - u) / 0.3 : 1; ctx.fillStyle = col; ctx.globalAlpha = al;
        for (var l = 0; l < 3; l++) { var ox = x + (l - 1) * 4 * dir, n = Math.round(12 * prog); for (var j = 0; j < n; j++) ctx.fillRect(Math.round(ox - dir * (j * 0.6 - 3)), Math.round(y - 6 + j), 1, 1); }
      });
    };
    fx.heal = fx.purr = function (x, y, o) {
      o = o || {}; var col = o.color || '#7be495';
      if (isReduced()) { staticGlyph(x, y - 6, 'heart', col, 500); return; }
      for (var k = 0; k < 8; k++) P({ x: x + rr(-8, 8), y: y, vy: -0.018 - rnd() * 0.01, life: 900, shape: 'heart', size: 1, color: col, delay: k * 70, sway: 0.006, swayAmp: 3, fade: 0.4 });
    };
    fx.hearts = function (x, y) { fx.heal(x, y, { color: '#ff8fb0' }); };
    fx.dust = function (x, y) {
      if (isReduced()) return;
      for (var k = 0; k < 8; k++) P({ x: x + rr(-3, 3), y: y, vx: (k < 4 ? -1 : 1) * rr(0.02, 0.06), vy: -rr(0.005, 0.03), drag: 0.95, life: 350, size: rnd() < 0.5 ? 2 : 1, color: '#c9a77a' });
    };
    // flow: particles along a quadratic curve from a to b
    function flow(a, b, n, o) {
      o = o || {}; var arc = o.arc === undefined ? 30 : o.arc;
      for (var k = 0; k < n; k++) {
        var cx = (a.x + b.x) / 2 + rr(-10, 10), cy = Math.min(a.y, b.y) - arc + rr(-8, 8);
        P({ x: a.x, y: a.y, life: o.ms || 600, delay: k * (o.stagger || 50), shape: o.shape || 'spark', size: 1, color: o.color || '#ffd95a', fade: 0.1, curve: { sx: a.x + rr(-3, 3), sy: a.y + rr(-3, 3), cx: cx, cy: cy, ex: b.x, ey: b.y, ease: o.ease || 'inOut' }, end: k === n - 1 ? o.done : null });
      }
    }
    fx.warmthGain = function (from, to, done) {
      if (isReduced()) { staticGlyph(to.x, to.y, 'spark', '#ffd95a', 160); if (done) done(); return; }
      flow(from, to, 10, { color: '#ffd95a', shape: 'spark', done: done });
    };
    fx.fishGain = function (from, to, done) {
      if (isReduced()) { staticGlyph(to.x, to.y, 'coin', '#ffd95a', 160); if (done) done(); return; }
      flow(from, to, 6, { color: '#ffd95a', shape: 'coin', ms: 520, ease: 'outBack', arc: 18, done: done });
    };
    fx.energy = function (from, to) {
      if (isReduced()) { staticGlyph(to.x, to.y, 'spark', '#ffe66b', 120); return; }
      flow(from, to, 5, { color: '#ffe66b', shape: 'spark', ms: 360, stagger: 35, arc: 10 });
    };
    fx.dust2 = fx.dust;
    fx.sparkle = function (x, y, n, colors) {
      colors = colors || ['#fff3b0', '#ffd95a', '#ffffff'];
      if (isReduced()) { staticGlyph(x, y, 'star', colors[0], 160); return; }
      for (var k = 0; k < (n || 6); k++) { var a = rnd() * Math.PI * 2, sp = rr(0.02, 0.06); P({ x: x + rr(-3, 3), y: y + rr(-3, 3), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.01, drag: 0.96, life: 500 + rnd() * 300, shape: rnd() < 0.5 ? 'star' : 'spark', color: colors[k % colors.length], blink: 70 }); }
    };
    fx.hairball = function (from, to, done) {
      if (isReduced()) { staticGlyph(to.x, to.y, 'drop', '#8a8a3a', 300); if (done) done(); return; }
      var dx = to.x - from.x, dy = to.y - from.y, T = 420, g = 0.0009;
      for (var k = 0; k < 6; k++) {
        var tt = T + k * 20, vx = dx / tt, vy = (dy - 0.5 * g * tt * tt) / tt;
        P({ x: from.x, y: from.y, vx: vx, vy: vy, ay: g, life: tt, delay: k * 35, size: k % 2 ? 2 : 3, color: k % 2 ? '#8a8a3a' : '#a9a44a', fade: 0, end: k === 5 ? function () { fx.splat(to.x, to.y); if (done) done(); } : null });
      }
    };
    fx.splat = function (x, y) {
      if (isReduced()) return;
      effect(1000, function (ctx, e, u) {
        ctx.globalAlpha = u < 0.7 ? 1 : (1 - u) / 0.3; ctx.fillStyle = '#7d7a34';
        var pts = [[-4, 0], [-2, -1], [0, -2], [2, -1], [4, 0], [-3, 1], [3, 1], [0, 0], [-6, 1], [6, 1]];
        for (var j = 0; j < pts.length; j++) ctx.fillRect(Math.round(x + pts[j][0]), Math.round(y + pts[j][1]), 2, 1);
        ctx.fillStyle = '#a9a44a'; ctx.fillRect(Math.round(x - 1), Math.round(y - 1), 2, 1);
      });
    };
    fx.catnip = function (x, y, w, h) {
      if (isReduced()) return;
      for (var k = 0; k < 20; k++) P({ x: x + rr(0, w || 40), y: y + (h || 30) + rr(0, 8), vy: -rr(0.02, 0.05), life: 1100, shape: 'leaf', color: k % 2 ? '#7be495' : '#4fd1a0', sway: 0.008 + rnd() * 0.004, swayAmp: rr(3, 7), delay: k * 25, fade: 0.4 });
      fx.vignette('#7be495', 600, 0.3);
    };
    fx.zoomies = function (w, h) {
      if (isReduced()) return;
      for (var k = 0; k < 30; k++) P({ x: -10 - rr(0, 60), y: rr(0, h || 216), vx: rr(0.35, 0.7), life: 700, shape: 'streak', len: Math.round(rr(8, 18)), color: k % 3 ? '#dcb0ff' : '#ffffff', fade: 0.3, delay: k * 12 });
      fx.tint('#3a2a5e', 700, 0.25);
    };
    fx.yarn = function (from, to, o) {
      o = o || {}; var col = o.color || '#ff6fae', col2 = '#c4488a', loops = o.loops || 3;
      var sag = o.sag === undefined ? 14 : o.sag, cx = (from.x + to.x) / 2, cy = Math.max(from.y, to.y) + sag;
      var life = isReduced() ? 700 : 1100;
      effect(life, function (ctx, e, u) {
        var prog = isReduced() ? 1 : Math.min(1, u / 0.3), al = u > 0.8 ? (1 - u) / 0.2 : 1; ctx.globalAlpha = al;
        var N = 28, nn = Math.round(N * prog);
        for (var j = 0; j <= nn; j++) { var t = j / N, a = 1 - t, x = a * a * from.x + 2 * a * t * cx + t * t * to.x, y = a * a * from.y + 2 * a * t * cy + t * t * to.y; ctx.fillStyle = (j >> 1) % 2 ? col : col2; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); if (j % 5 === 0) ctx.fillRect(Math.round(x), Math.round(y) + 1, 1, 1); }
        if (prog >= 1) { var wl = Math.min(1, (u - 0.3) / 0.25); for (var l = 0; l < loops; l++) { if (wl < (l + 1) / loops) { if (wl * loops < l) break; } ctx.fillStyle = l % 2 ? col : col2; var rx = 6 - l, ry = 3; for (var an = 0; an < 20; an++) { var th = an / 20 * Math.PI * 2; ctx.fillRect(Math.round(to.x + Math.cos(th) * rx), Math.round(to.y - 6 + l * 3 + Math.sin(th) * ry), 1, 1); } } }
      });
    };
    // thread following a list of points (a cat running with yarn); points: [{x,y},...]
    fx.yarnTrail = function (points, o) {
      o = o || {}; var col = o.color || '#ff6fae', col2 = '#c4488a'; if (points.length < 2) return;
      effect(o.ms || 1200, function (ctx, e, u) {
        var al = u > 0.7 ? (1 - u) / 0.3 : 1, n = isReduced() ? points.length : Math.max(2, Math.round(points.length * Math.min(1, u / 0.5)));
        ctx.globalAlpha = al; var c = 0;
        for (var j = 0; j < n - 1; j++) { var a = points[j], b = points[j + 1], len = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1); for (var s = 0; s < len; s++) { ctx.fillStyle = ((c++ >> 1) % 2) ? col : col2; ctx.fillRect(Math.round(a.x + (b.x - a.x) * s / len), Math.round(a.y + (b.y - a.y) * s / len + Math.sin(c * 0.4) * 1), 1, 1); } }
      });
    };
    fx.pawTrail = function (from, to, o) {
      o = o || {}; var n = o.count || 6, col = o.color || '#f0d3a3';
      if (isReduced()) { staticGlyph(to.x, to.y, 'paw', col, 400); return; }
      var ang = Math.atan2(to.y - from.y, to.x - from.x);
      for (var k = 0; k < n; k++) { var t = k / (n - 1 || 1), side = k % 2 ? 2 : -2; P({ x: from.x + (to.x - from.x) * t - Math.sin(ang) * side, y: from.y + (to.y - from.y) * t + Math.cos(ang) * side, life: 900, delay: k * 70, shape: 'paw', color: col, fade: 0.6 }); }
    };
    fx.confetti = function (w) {
      if (isReduced()) return;
      var cols = ['#ffd95a', '#ff8fb0', '#7be495', '#6ec6ff', '#dcb0ff'];
      for (var k = 0; k < 40; k++) P({ x: rr(0, w || 384), y: -rr(2, 40), vy: rr(0.03, 0.07), life: 2200, shape: k % 3 ? 'sq' : 'paw', size: k % 3 ? 2 : 1, color: cols[k % cols.length], sway: 0.005, swayAmp: 4, delay: k * 30, fade: 0.2 });
    };
    // burst a sprite into its own pixels. pixels: SB.gfx.pestprint.pixels(desc). feet at (x,y)
    fx.deathBurst = function (x, y, pixels, scale) {
      scale = scale || 1; if (isReduced()) { staticGlyph(x, y - 8, 'star', '#ffffff', 160); return; }
      var n = Math.min(pixels.length, 18), step = pixels.length / n;
      for (var k = 0; k < n; k++) { var px = pixels[Math.floor(k * step)], a = rnd() * Math.PI - Math.PI;
        P({ x: x + px.x * scale, y: y + px.y * scale, vx: Math.cos(a) * rr(0.02, 0.08), vy: Math.sin(a) * rr(0.05, 0.12), ay: 0.0007, life: 700 + rnd() * 200, size: 2, color: px.color, fade: 0.3 }); }
    };
    // ghost cat floats up and fades. drawFn(ctx, x, y, alpha)
    fx.ghost = function (x, y, drawFn) {
      var life = isReduced() ? 500 : 900;
      effect(life, function (ctx, e, u) { var up = isReduced() ? 0 : 20 * EASE.out(u); ctx.globalAlpha = 0.6 * (1 - u); drawFn(ctx, x, y - up, ctx.globalAlpha); });
    };
    // continuous emitters
    fx.zzz = function (key, x, y) {
      if (isReduced()) { emitters['z' + key] = null; delete emitters['z' + key]; effects = effects.filter(function (e) { return e.key !== 'z' + key; }); effects.push({ key: 'z' + key, t: 0, life: 1e9, draw: function (ctx) { ctx.fillStyle = '#c3ccff'; drawBitmap(ctx, BITMAPS.z, x + 6, y - 8, 1); } }); return; }
      emitters['z' + key] = { t: rnd() * 600, every: 750, x: x, y: y, fn: function (e) { P({ x: e.x + 5, y: e.y - 6, vy: -0.014, vx: 0.006, life: 1500, shape: 'z', size: 1, grow: 1, color: '#c3ccff', sway: 0.004, swayAmp: 2, fade: 0.4 }); } };
    };
    fx.zzzMove = function (key, x, y) { var e = emitters['z' + key]; if (e) { e.x = x; e.y = y; } };
    fx.zzzStop = function (key) { delete emitters['z' + key]; effects = effects.filter(function (e) { return e.key !== 'z' + key; }); };
    fx.sunbeamMotes = function (on, x0, x1, y0) {
      if (!on || isReduced()) { delete emitters.motes; return; }
      emitters.motes = { t: 0, every: 333, fn: function () { P({ x: rr(x0, x1), y: y0, vy: 0.008 + rnd() * 0.006, vx: rr(-0.004, 0.004), life: 4000, size: 1, color: '#ffe9a8', sway: 0.002, swayAmp: 2, fade: 0.3 }); } };
    };
    fx.drawStars = function (ctx, stars, tick) { // stars: [{x,y,phase}], 2px twinkle on 2s loops
      var red = isReduced(); ctx.fillStyle = '#ffe9a8';
      for (var k = 0; k < stars.length; k++) { var s = stars[k], on = red ? 1 : (Math.floor(((tick || 0) * 16.667 + (s.phase || 0)) / 1000) % 2 === 0 || ((tick || 0) * 16.667 + (s.phase || 0)) % 2000 < 1700); if (on) ctx.fillRect(s.x, s.y, 2, 2); }
    };

    // ---------- card flight ----------
    fx.cardKinds = CARD_KINDS;
    // returns {ms, at(t) -> {x,y,rot,scale}} for tests and custom animators
    fx.cardCurve = function (S, E, kind, o) {
      var K = Object.assign({}, CARD_KINDS[kind] || CARD_KINDS.draw, o || {});
      var mx = (S.x + E.x) / 2, my = (S.y + E.y) / 2 - K.peak, ease = EASE[K.ease] || EASE.out;
      var dir = (E.x >= S.x) ? 1 : -1;
      return {
        ms: K.ms, kind: kind, flip: !!K.flip,
        at: function (t) { var te = ease(t), a = 1 - te; return { x: a * a * S.x + 2 * a * te * mx + te * te * E.x, y: a * a * S.y + 2 * a * te * my + te * te * E.y, rot: K.rot * dir * te, scale: K.s0 + (K.s1 - K.s0) * te, t: t }; }
      };
    };
    // animate a DOM element (positioned at its S origin via transform). Returns a Promise. Cards never shake or lag in reduce motion.
    fx.flyCard = function (el, S, E, kind, o) {
      o = o || {};
      var done = function () { if (o.done) o.done(); };
      if (!el || !el.animate) { done(); return Promise.resolve(); }
      var base = o.base || '', tf = function (x, y, rot, sc) { return 'translate(' + Math.round(x - S.x) + 'px,' + Math.round(y - S.y) + 'px) rotate(' + rot.toFixed(1) + 'deg) scale(' + sc.toFixed(3) + ')'; };
      var anim;
      if (isReduced()) {
        anim = el.animate([{ transform: base + ' ' + tf(S.x, S.y, 0, 1), opacity: 1, offset: 0 }, { transform: base + ' ' + tf(S.x, S.y, 0, 1), opacity: 0, offset: 0.45 }, { transform: base + ' ' + tf(E.x, E.y, 0, 1), opacity: 0, offset: 0.55 }, { transform: base + ' ' + tf(E.x, E.y, 0, 1), opacity: 1, offset: 1 }], { duration: 120, fill: 'forwards' });
      } else {
        var c = fx.cardCurve(S, E, kind, o), frames = [], n = 14, hold = kind === 'spell' ? 180 : 0, total = c.ms + hold;
        for (var k = 0; k <= n; k++) {
          var p = c.at(k / n), fr = { transform: base + ' ' + tf(p.x, p.y, p.rot, p.scale), offset: (k / n) * (c.ms / total) };
          if (c.flip) fr.transform += ' scaleX(' + Math.abs(Math.cos(p.t * Math.PI)).toFixed(3) + ')'; // flip from back to face at 50%
          frames.push(fr);
        }
        if (hold) frames.push({ transform: frames[frames.length - 1].transform, offset: 1 });
        anim = el.animate(frames, { duration: total, fill: 'forwards', easing: 'linear' });
      }
      return anim.finished.then(done, done);
    };
    // invalid play: horizontal shake +-6px 3 times over 200ms
    fx.shakeCard = function (el) {
      if (!el || !el.animate) return Promise.resolve();
      if (isReduced()) return el.animate([{ outlineColor: '#ff5d6c' }, { outlineColor: 'transparent' }], { duration: 120 }).finished.catch(function () {});
      return el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 200 }).finished.catch(function () {});
    };

    fx.create = create;
    return fx;
  }

  SB.gfx.fx = create({});
  SB.gfx.fx.create = create;
})();
