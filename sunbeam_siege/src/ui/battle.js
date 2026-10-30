/* SUNBEAM SIEGE battle.js (agent C3). The battle screen: house cutaway canvas, DOM HUD, hand, event playback.
 * Registers SB.ui.screens.battle. Mount params: {run, encounter, node, battle?, factory?, opts?}.
 * Reads design/API.md state and events; see design/C3-ui-notes.md for the event fields consumed. No em dashes. */
(function () {
  'use strict';
  window.SB = window.SB || {};
  var ui = SB.ui, h = ui.h, tryf = function (f, d) { try { return f(); } catch (e) { return d; } };
  var FLOOR_NAMES = ['Cellar', 'Parlor', 'Attic'];
  var PEST_SIZE = { small: 1, medium: 2, large: 3, boss: 5 };

  function clone(o) { return o === undefined ? o : JSON.parse(JSON.stringify(o)); }
  function now() { return performance.now(); }
  function hashStr(s) { return ui.hash(s); }
  function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function sfx(name, o) { tryf(function () { if (SB.audio && SB.audio.play) SB.audio.play(name, o); }); }
  function pestSize(p) { var s = p.size; return typeof s === 'number' ? s : (PEST_SIZE[s] || 1); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  // ----------------------------------------------------------------- geometry
  function geometry(mode) {
    var G;
    if (mode === 'phone') {
      G = { mode: mode, W: 288, H: 296, roofH: 26, floorH: 88, feetOff: 66, x0: 4, x1: 284, catPitch: 34, catRight: 142, pestLeft: 148, pestUnit: 27, labelInline: false };
    } else {
      G = { mode: mode, W: 384, H: 208, roofH: 24, floorH: 60, feetOff: 45, x0: 22, x1: 362, catPitch: 36, catRight: 232, pestLeft: 238, pestUnit: 24, labelInline: true };
    }
    G.top = function (f) { return G.roofH + (2 - f) * G.floorH; };
    G.feet = function (f) { return G.top(f) + G.feetOff; };
    G.catX = function (start, size) { return G.catRight - (start + size / 2) * G.catPitch; };
    G.pestX = function (start, size) { return G.pestLeft + (start + size / 2) * G.pestUnit; };
    G.room = function (f, i) { return G.labelInline ? { x: 28 + i * 26, y: G.top(f) + 22, w: 24, h: 24 } : { x: 62 + i * 24, y: G.top(f) + 2, w: 22, h: 22 }; };
    G.label = function (f) { return G.labelInline ? { x: 28, y: G.top(f) + 5, w: 50, h: 12 } : { x: 6, y: G.top(f) + 3, w: 52, h: 16 }; };
    G.inc = function (f) { return G.labelInline ? { x: G.x1 - 36, y: G.top(f) + 4, w: 34, h: 14 } : { x: G.W - 58, y: G.top(f) + 3, w: 52, h: 16 }; };
    return G;
  }

  // ----------------------------------------------------------------- pixel glyphs for particles
  var GLYPH = {
    heart: ['.X.X.', 'XXXXX', 'XXXXX', '.XXX.', '..X..'],
    paw: ['X.X.X', '.....', '.XXX.', 'XXXXX', '.XXX.'],
    star: ['..X..', '..X..', 'XXXXX', '.XXX.', '.X.X.'],
    leaf: ['..XXX', '.XXXX', 'XXXX.', 'XXX..', 'X....'],
    spark: ['..X..', '..X..', 'XXXXX', '..X..', '..X..']
  };

  // ----------------------------------------------------------------- the screen
  function create(root, params) {
    params = params || {};
    var run = params.run || null, encounter = params.encounter || null;
    var factory = params.factory || (SB.battle && SB.battle.create) || (SB.mockBattle && SB.mockBattle.create);
    var B = params.battle || (params.restore && SB.battle && SB.battle.restore ? SB.battle.restore(run, params.restore) : factory(run, encounter, params.opts || {}));
    var rng = mulberry(hashStr(JSON.stringify(params.seed || (run && run.seed) || 1)) + 99);

    var mode = ui.layout().mode, G = geometry(mode), s = 2;
    var vm = clone(B.state);
    var V = { units: new Map(), parts: [], tweens: [], stars: [], nums: 0, dark: null, confetti: false, roofFlash: 0, vignette: 0, tint: 0, shake: null, tickBase: now() };
    var inbox = [], queue = [], playing = false, skip = false, destroyed = false, raf = 0, lastFrame = 0;
    var sel = null, drag = null, handEls = new Map(), handOrder = [], dealN = 0, hoverUid = null, ended = false, endShown = false, kbCursor = -1, tgtCursor = -1;
    var logLines = [], logOpen = false, phaseText = '', keepMode = false, abilUsed = {};
    var cleanups = [];
    var hooks = ui.battleHooks = ui.battleHooks || {};
    function hook(name, a) { tryf(function () { if (hooks[name]) hooks[name](a); if (hooks.any) hooks.any(name, a); }); }

    // ---------------- DOM skeleton
    var el = {};
    var rootEl = h('div.battle', { 'data-mode': mode });
    root.appendChild(rootEl);
    el.top = h('div.b-top');
    el.menuBtn = h('button.btn.alt.sm.icon', { 'aria-label': 'Pause menu', 'data-tip': 'Menu (Esc)', onclick: function () { pauseMenu(); } }, ui.icon('menu', { size: 18 }));
    el.deckBtn = h('button.btn.alt.sm.b-deckbtn', { 'aria-label': 'View deck', onclick: function () { openPile('deck'); } }, ui.icon('cards', { size: 16 }), h('span.b-deckn', {}, '0'));
    el.relics = h('div.b-relics', { role: 'list', 'aria-label': 'Relics' });
    el.clock = h('div.b-clock', { tabindex: '0', 'data-gl': 'witching_hour' });
    el.logBtn = h('button.btn.alt.sm.icon', { 'aria-label': 'Battle log', 'data-tip': 'Log (L)', onclick: function () { toggleLog(); } }, ui.icon('book', { size: 18 }));
    el.helpBtn = h('button.btn.alt.sm.icon.b-helpbtn', { 'aria-label': 'Keyboard help', 'data-tip': 'Keys (?)', onclick: function () { keyHelp(); } }, ui.icon('help', { size: 18 }));
    el.top.appendChild(el.menuBtn); el.top.appendChild(el.deckBtn); el.top.appendChild(el.relics); el.top.appendChild(el.clock); el.top.appendChild(el.logBtn); el.top.appendChild(el.helpBtn);

    el.main = h('div.b-main');
    el.wrap = h('div.b-wrap');
    el.stage = h('div.b-stage');
    el.canvas = h('canvas.b-canvas', { 'aria-hidden': 'true' });
    el.overlay = h('div.b-over');
    el.fx = h('div.b-fx', { 'aria-hidden': 'true' });
    el.banner = h('div.b-banner', { 'aria-hidden': 'true' });
    el.vignette = h('div.b-vig');
    el.stage.appendChild(el.canvas); el.stage.appendChild(el.overlay); el.stage.appendChild(el.fx); el.stage.appendChild(el.banner);
    el.wrap.appendChild(el.stage);
    el.garden = h('div.b-garden', { role: 'list', 'aria-label': 'Pests waiting in the garden' });
    el.sceneCol = h('div.b-scenecol', {}, el.wrap, el.garden);
    el.side = h('aside.b-side', { 'aria-label': 'Inspector' });
    el.main.appendChild(el.sceneCol); el.main.appendChild(el.side);

    el.bottom = h('div.b-bottom');
    el.status = h('div.b-status');
    el.drawPile = pileBtn('draw', 'Draw pile (D)');
    el.discPile = pileBtn('discard', 'Discard pile (X)');
    el.exhPile = pileBtn('exhaust', 'Exhaust pile');
    el.orbs = h('div.b-orbs', { 'data-tut': 'zoomies', tabindex: '0', 'data-gl': 'zoomies' });
    el.nip = h('div.b-nip.hidden', { tabindex: '0', 'data-gl': 'nip' });
    el.bank = h('div.b-bank.hidden', { tabindex: '0', 'data-tip': 'Banked Lives: lives set aside in the Moon clan bank.' });
    el.prompt = h('div.b-prompt.hidden', { role: 'status' });
    el.tray = h('div.b-tray.hidden', { role: 'group', 'aria-label': 'Abilities and retain' });
    el.pw = h('div.b-pw', {}, el.tray, el.prompt);
    el.handWrap = h('div.b-handwrap');
    el.hand = h('div.b-hand', { role: 'list', 'aria-label': 'Hand', 'data-tut': 'hand' });
    el.handWrap.appendChild(el.hand);
    el.end = h('button.btn.b-end', { 'data-tut': 'endturn', onclick: function () { endTurn(); } }, h('span', {}, 'End'), h('span', {}, 'Turn'));
    el.left = h('div.b-left', {}, el.drawPile, h('div.b-meters', {}, el.orbs, el.nip, el.bank));
    el.right = h('div.b-right', {}, el.exhPile, el.discPile);
    el.status.appendChild(el.left); el.status.appendChild(h('span.sp')); el.status.appendChild(el.right);
    el.bottom.appendChild(el.status); el.bottom.appendChild(el.pw); el.bottom.appendChild(el.handWrap); el.bottom.appendChild(el.end);

    el.arrow = h('svg.b-arrow', { width: '100%', height: '100%' });
    el.arrow.innerHTML = '<defs><marker id="b-ah" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#ffd95a"/></marker></defs><line x1="0" y1="0" x2="0" y2="0" stroke="#ffd95a" stroke-width="3" stroke-dasharray="7 6" marker-end="url(#b-ah)"/>';
    el.arrow.style.display = 'none';
    el.live = h('div.vh', { 'aria-live': 'polite', role: 'log' });
    el.log = h('div.b-log.hidden', { role: 'log', 'aria-label': 'Battle log' });
    el.phase = h('div.b-phase', { 'aria-hidden': 'true' });
    el.endOverlay = null;

    rootEl.appendChild(el.top); rootEl.appendChild(el.main); rootEl.appendChild(el.bottom);
    rootEl.appendChild(el.vignette); rootEl.appendChild(el.arrow); rootEl.appendChild(el.live); rootEl.appendChild(el.log);
    el.sceneCol.appendChild(el.phase);
    var ctx = el.canvas.getContext('2d');

    function pileBtn(kind, label) {
      var b = h('button.b-pile.' + kind, { 'aria-label': label, 'data-tip': label, onclick: function () { openPile(kind); } },
        h('i.pb3'), h('i.pb2'), h('i.pb1'), h('b.pn', {}, '0'));
      return b;
    }

    // ---------------- scene bg (cached)
    var bg = null, bgKey = '';
    function mkCanvas(w, hh) { var c = document.createElement('canvas'); c.width = w; c.height = hh; return c; }
    function buildBg() {
      var c = mkCanvas(G.W, G.H), x = c.getContext('2d'), W = G.W, H = G.H;
      x.imageSmoothingEnabled = false;
      function R(col, a, b, w2, h2) { x.fillStyle = col; x.fillRect(a, b, w2, h2); }
      // sky with dither bands
      var bands = ['#0f0b24', '#1d1745', '#3a2a5e'];
      R(bands[0], 0, 0, W, H);
      var bandH = Math.ceil(H / 3);
      for (var yy = 0; yy < H; yy++) {
        var bi = Math.min(2, Math.floor(yy / bandH)), edge = (yy % bandH) < 6 && bi > 0;
        R(bands[bi], 0, yy, W, 1);
        if (edge) for (var xx = (yy % 2); xx < W; xx += 2) R(bands[bi - 1], xx, yy, 1, 1);
      }
      // far roofs
      x.fillStyle = '#2a2147';
      for (var rx = 0; rx < W; rx += 18) { var rh = 6 + ((rx * 7) % 11); x.fillRect(rx, H - rh - 6, 16, rh); x.fillRect(rx + 2, H - rh - 8, 12, 2); }
      // moon
      var mx = mode === 'phone' ? 18 : 10, my = 12; R('#fff1c9', mx, my, 7, 7); R('#ffe2a0', mx + 4, my + 3, 3, 3); R('#fff8e0', mx + 1, my + 1, 2, 2);
      // house shell
      var hx0 = G.x0 - 4, hx1 = G.x1 + 4, houseTop = G.roofH, houseBot = G.top(0) + G.floorH;
      R('#4a2e3c', hx0, houseTop, hx1 - hx0, houseBot - houseTop);
      for (var f = 2; f >= 0; f--) {
        var t = G.top(f), fh = G.floorH, ix0 = G.x0, iw = G.x1 - G.x0;
        if (f === 0) { // cellar stone
          R('#3d3a4f', ix0, t, iw, fh);
          for (var by = 0; by < fh - 4; by += 6) { var off = (by / 6) % 2 ? 7 : 0; for (var bx = -off; bx < iw; bx += 14) { R('#4d4a62', ix0 + Math.max(0, bx), t + by, Math.min(13, iw - Math.max(0, bx), bx < 0 ? 14 + bx - 1 : 13), 1); R('#34314a', ix0 + Math.max(0, bx) + (bx < 0 ? 0 : 13), t + by, 1, 6); } R('#34314a', ix0, t + by + 5, iw, 1); }
        } else if (f === 1) { // parlor wallpaper
          R('#6b4558', ix0, t, iw, fh);
          for (var sx = 0; sx < iw; sx += 8) R('#5f3d50', ix0 + sx, t, 4, fh);
          for (var dy = 6; dy < fh - 8; dy += 12) for (var dx = 4; dx < iw; dx += 16) { R('#7b5266', ix0 + dx, t + dy, 2, 2); }
        } else { // attic planks
          R('#6a4a3a', ix0, t, iw, fh);
          for (var py = 0; py < fh; py += 7) { R('#7e5a46', ix0, t + py, iw, 1); R('#583a2e', ix0, t + py + 6, iw, 1); }
          for (var pxk = 0; pxk < iw; pxk += 31) R('#583a2e', ix0 + pxk + (f * 11) % 17, t, 1, fh);
          R('#4a3024', ix0, t, iw, 2);
        }
        // window glow (centered between cats and pests)
        if (f > 0) { var wx = (mode === 'phone' ? G.W / 2 - 9 : 150), wy = t + 8; R('#2a1d2a', wx - 1, wy - 1, 20, 20); R('#ffc766', wx, wy, 18, 18); R('#ffe2a0', wx, wy, 18, 4); R('#8a5a3a', wx + 8, wy, 2, 18); R('#8a5a3a', wx, wy + 8, 18, 2); }
        // slab
        R('#8a5a5a', ix0, t + fh - 4, iw, 1); R('#3b2530', ix0, t + fh - 3, iw, 3);
        // stairs on the right (decor)
        for (var st = 0; st < 5; st++) R(f === 0 ? '#2c2a3c' : '#2f1c28', G.x1 - 4 - st * 4, t + fh - 8 - st * 4, 4 + st * 4, 4);
        // baseboard
        R('#8a5a5a', ix0, t + fh - 6, iw, 2);
        // side shadows
        R('rgba(10,7,22,.35)', ix0, t, 3, fh); R('rgba(10,7,22,.35)', ix0 + iw - 3, t, 3, fh);
      }
      // roof
      R('#2a1a2e', hx0 - 6, houseTop - 4, hx1 - hx0 + 12, 6);
      x.fillStyle = '#5a2a3a';
      for (var ry = 0; ry < G.roofH - 6; ry += 4) { var inset = Math.floor((G.roofH - ry) * 0.9); x.fillRect(hx0 - 4 + inset - 12, ry + 6, hx1 - hx0 + 8 - (inset - 12) * 2, 4); }
      x.fillStyle = '#7a3a4a';
      for (var ry2 = 0; ry2 < G.roofH - 6; ry2 += 4) { var inset2 = Math.floor((G.roofH - ry2) * 0.9); var rw = hx1 - hx0 + 8 - (inset2 - 12) * 2; for (var sx2 = 0; sx2 < rw; sx2 += 8) x.fillRect(hx0 - 4 + inset2 - 12 + sx2, ry2 + 6, 7, 1); }
      // garden strip
      R('#1b2a3a', 0, H - 5, W, 5); for (var gx = 0; gx < W; gx += 5) R('#2f5a4a', gx, H - 6 - ((gx * 3) % 3), 2, 3);
      bg = c; bgKey = mode + G.W;
    }

    // ---------------- sizing
    var fitSig = '';
    function fit(force) {
      var L = ui.layout(); mode = L.mode;
      if (G.mode !== mode) { G = geometry(mode); bg = null; }
      rootEl.setAttribute('data-mode', mode);
      var availW = el.sceneCol.clientWidth, gardenH = el.garden.offsetHeight || 0;
      var availH = el.sceneCol.clientHeight - gardenH - 4;
      if (mode === 'phone') availH = L.h - el.top.offsetHeight - Math.max(gardenH, 32) - 12 - 232 - parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-b') || 0);
      if (availW < 50 || availH < 50) return;
      var sc = Math.min(availW / G.W, availH / G.H);
      if (mode === 'desktop' && sc >= 2.4) sc = Math.floor(sc * 4) / 4;
      s = Math.max(0.8, sc);
      var cw = Math.round(G.W * s), chh = Math.round(G.H * s);
      el.stage.style.width = cw + 'px'; el.stage.style.height = chh + 'px';
      el.canvas.width = G.W; el.canvas.height = G.H; el.canvas.style.width = cw + 'px'; el.canvas.style.height = chh + 'px';
      rootEl.style.setProperty('--u', s + 'px');
      var hudFont = Math.max(9, Math.min(13, 4.6 * s));
      rootEl.style.setProperty('--hud', hudFont + 'px');
      var cwCard;
      if (mode === 'phone') {
        var handAvail = L.h - el.top.offsetHeight - chh - Math.max(gardenH, 32) - 12 - 46 - 10 - 40;
        cwCard = Math.max(78, Math.min(114, Math.round(handAvail / 1.4 * 0.9)));
        // use the real height of the hand row when it is known, so spare vertical room becomes bigger, more readable cards
        var realH = el.handWrap.clientHeight;
        if (realH > 90) cwCard = Math.max(78, Math.min(136, Math.round((realH - 30) / 1.42)));
      } else {
        var hh = el.handWrap.clientHeight || 160;
        cwCard = Math.max(L.short ? 64 : 92, Math.min(150, Math.round(hh / 1.4 * 0.74)));
      }
      el.hand.style.setProperty('--hand-cw', cwCard + 'px');
      var sig = [mode, cw, chh, cwCard, el.handWrap.clientWidth].join(',');
      if (sig === fitSig && !force) return;
      fitSig = sig;
      if (!bg || bgKey !== mode + G.W) buildBg();
      buildBoardFrame();
      layoutUnits(true);
      renderHud();
      layoutHand();
      refreshTargets();
    }

    // ---------------- board frame (floors, rooms, labels, roof)
    var frame = {};
    function px(v) { return Math.round(v * s) + 'px'; }
    function buildBoardFrame() {
      ui.clear(el.overlay);
      frame = { floors: [], rooms: [], inc: [] };
      // roof overlay
      var roof = h('div.b-roof', { style: { left: px(G.x0), width: px(G.x1 - G.x0), top: '0px', height: px(G.roofH) } });
      el.sun = h('div.b-sun', { 'data-tut': 'warmth', tabindex: '0', 'data-gl': 'warmth' },
        ui.icon('warmth', { size: '1.5em', cls: 'neutral' }),
        h('div.b-warm', {}, h('div.b-warm-fill'), h('div.b-warm-ticks'), h('div.b-warm-pre')),
        h('b.b-warm-n.num', {}, '40/40'));
      el.shade = h('span.b-shade.chip', { tabindex: '0', 'data-gl': 'shade' }, ui.icon('umbrella', { size: '1em', vec: true }), h('b', {}, '0'));
      el.sunInc = h('span.b-inc.sun.hidden', { 'data-tip': 'Pests that will reach the Sunbeam this round.' }, ui.icon('sunbeam', { size: '1.2em' }), h('b', {}, '0'));
      roof.appendChild(el.sun); roof.appendChild(el.shade); roof.appendChild(el.sunInc);
      el.overlay.appendChild(roof); el.roof = roof;
      for (var f = 2; f >= 0; f--) {
        (function (f) {
          var top = G.top(f);
          var fb = h('button.b-floor', { 'data-floor': f, 'data-tut': 'floor-' + f, 'aria-label': FLOOR_NAMES[f] + ' floor', onclick: function () { onFloorTap(f); },
            style: { left: px(G.x0), top: px(top), width: px(G.x1 - G.x0), height: px(G.floorH - 2) } });
          el.overlay.appendChild(fb); frame.floors[f] = fb;
          var lb = G.label(f);
          var lab = h('span.b-flabel', { style: { left: px(lb.x), top: px(lb.y), height: px(lb.h) } }, FLOOR_NAMES[f]);
          el.overlay.appendChild(lab);
          frame.rooms[f] = [];
          for (var i = 0; i < 2; i++) {
            var r = G.room(f, i);
            var rb = h('button.b-room', { 'aria-label': FLOOR_NAMES[f] + ' room slot ' + (i + 1), style: { left: px(r.x), top: px(r.y), width: px(r.w), height: px(r.h) } });
            el.overlay.appendChild(rb); frame.rooms[f][i] = rb;
          }
          var ib = G.inc(f);
          var inc = h('span.b-inc.hidden', { style: { left: px(ib.x), top: px(ib.y) }, tabindex: '0' }, ui.icon('claw', { size: '1em' }), h('b', {}, '0'));
          el.overlay.appendChild(inc); frame.inc[f] = inc;
        })(f);
      }
      // unit layers
      el.units = h('div.b-units'); el.overlay.appendChild(el.units);
      V.units.forEach(function (v) { v.hud = null; });
      updateFloorMeta();
    }

    function updateFloorMeta() {
      for (var f = 0; f < 3; f++) {
        var fl = vm.floors[f];
        var inc = (vm.incoming && vm.incoming[f]) || 0;
        var ie = frame.inc[f];
        if (ie) {
          ie.classList.toggle('hidden', !inc || playing);
          ie.querySelector('b').textContent = inc;
          ie.setAttribute('data-tip', 'Pests on the ' + FLOOR_NAMES[f] + ' will deal ' + inc + ' damage to your cats this round.');
          ie.setAttribute('aria-label', inc + ' incoming damage on the ' + FLOOR_NAMES[f]);
        }
        for (var i = 0; i < 2; i++) {
          var rb = frame.rooms[f] && frame.rooms[f][i]; if (!rb) continue;
          var item = fl.rooms && fl.rooms[i];
          ui.clear(rb); rb.classList.toggle('filled', !!item);
          rb.onmouseenter = null;
          if (item) {
            var rt = item.rtype || item.kind;
            var ic = rt === 'box' || /box/i.test(item.id || '') ? 'box' : rt === 'toy' ? 'toy' : 'stairs';
            var fragile = rt === 'toy' && item.kw && item.kw.fragile;
            rb.appendChild(ui.icon(ic, { size: '70%' }));
            if (item.durability != null) rb.appendChild(h('i.b-rdur', {}, String(item.durability)));
            if (fragile) rb.appendChild(h('i.b-rdur.frag', {}, '!'));
            rb.classList.toggle('fragile', !!fragile);
            rb.setAttribute('data-tip', item.name + (item.text ? ': ' + item.text : '') + (fragile ? ' Tap to knock it off with a cat on this floor.' : ''));
            rb.setAttribute('aria-label', item.name + (fragile ? ', fragile, tap to knock it off' : ''));
            rb.onclick = fragile ? (function (ru, rf) { return function (e) { e.stopPropagation(); knockToy(ru, rf); }; })(item.uid, f) : null;
          } else { rb.classList.remove('fragile'); rb.onclick = null; rb.removeAttribute('data-tip'); rb.setAttribute('aria-label', FLOOR_NAMES[f] + ' room slot ' + (i + 1) + ' empty'); }
        }
      }
      var sb = vm.sunbeam || { warmth: 0, max: 40, shade: 0 };
      var pct = Math.max(0, Math.min(1, sb.warmth / (sb.max || 1)));
      el.sun.querySelector('.b-warm-fill').style.width = (pct * 100) + '%';
      el.sun.querySelector('.b-warm-n').textContent = sb.warmth + '/' + sb.max;
      el.sun.querySelector('.b-warm-ticks').style.backgroundSize = (100 / (sb.max / 5)) + '% 100%';
      el.sun.classList.toggle('low', pct <= 0.25);
      rootEl.classList.toggle('b-lowwarm', pct <= 0.25);
      el.shade.classList.toggle('hidden', !sb.shade);
      el.shade.querySelector('b').textContent = sb.shade || 0;
      var si = (vm.incoming && vm.incoming[3]) || 0;
      el.sunInc.classList.toggle('hidden', !si || playing);
      el.sunInc.querySelector('b').textContent = '-' + si;
      el.sunInc.classList.toggle('lethal', si >= sb.warmth + (sb.shade || 0));
      rootEl.classList.toggle('b-warn', !!si && !playing);
      el.sun.setAttribute('aria-label', 'Warmth ' + sb.warmth + ' of ' + sb.max);
    }

    // ---------------- units: model, layout, HUD
    function allUnitsOf(list) {
      var out = [];
      for (var f = 0; f < 3; f++) {
        var fl = list.floors[f];
        (fl.cats || []).forEach(function (c) { out.push({ d: c, side: 'cat', f: f }); });
        (fl.pests || []).forEach(function (p) { out.push({ d: p, side: 'pest', f: f }); });
      }
      return out;
    }
    function viewOf(uid) { return V.units.get(uid) || null; }
    function spriteInfo(v) {
      var d = v.d;
      if (v.side === 'cat') {
        if (!v.genome) v.genome = ui.genome(d.art, d.id);
        var sc = (v.genome && v.genome.scale) || 1;
        return { w: 32 * sc, h: 32 * sc };
      }
      if (!v.desc) v.desc = pestDesc(d);
      var pp = SB.gfx && SB.gfx.pestprint;
      if (pp && !v.sp) v.sp = tryf(function () { return pp.make(v.desc); }, null);
      return v.sp ? { w: v.sp.w, h: v.sp.h } : { w: 32, h: 32 };
    }
    var PSP = null;
    function pestDesc(p) {
      var pp = SB.gfx && SB.gfx.pestprint; if (!pp) return null;
      if (!PSP) PSP = pp.species.concat(pp.catalog || []);
      var id = String(p.id || '').replace(/^pest_/, ''), name = String(p.name || '').toLowerCase(), pick = null;
      var toks = id.split('_');
      if (PSP.indexOf(id) >= 0) pick = id;
      else if (PSP.indexOf('boss_' + id) >= 0) pick = 'boss_' + id;
      else {
        for (var i = toks.length - 1; i >= 0 && !pick; i--) if (PSP.indexOf(toks[i]) >= 0) pick = toks[i];
        if (!pick) {
          var kw = [[/pup|terrier|pug|corgi|dachshund|retriever|beagle|husky|bulldog|poodle|dog|hound|dane|wolf|alpha|shepherd/, 'dog'], [/mouse|mice|vole|chipmunk|gerbil/, 'mouse'], [/alarm|clock/, 'alarm_clock'], [/rat/, 'rat'], [/hamster/, 'hamster'],
            [/squirrel/, 'squirrel'], [/vacuum|robot/, 'vacuum'], [/spray/, 'spray'], [/bath|tub|tide/, 'bathtub'], [/crate|carrier/, 'carrier'], [/dot|laser/, 'laserdot'], [/crow|magpie|owl|swan/, 'crow'],
            [/dryer/, 'hairdryer'], [/door/, 'door'], [/cucumber|cuke/, 'cucumber'], [/hose/, 'hose'], [/mop|lint|clippers|scale|cone/, 'mop'], [/flea|tick|hornet|spider/, 'spider'], [/snake/, 'snake'], [/fox|tomcat|possum|hedgehog/, 'fox'], [/balloon|fireworks|thunder/, 'balloon'], [/goose/, 'goose'], [/raccoon/, 'raccoon']];
          for (var k = 0; k < kw.length && !pick; k++) if (kw[k][0].test(id + ' ' + name)) pick = kw[k][1];
        }
      }
      var sz = pestSize(p), sizeKey = sz >= 5 ? 'B' : sz === 3 ? 'L' : sz === 2 ? 'M' : 'S';
      var d = { species: pick || 'mouse', size: sizeKey, seed: hashStr(p.id || ''), boss: sz >= 5 };
      if (/boss_|rat_king|clock_dawn/.test(p.id || '')) d.boss = true;
      return d;
    }
    function ensureViews() {
      var seen = {};
      allUnitsOf(vm).forEach(function (u) {
        seen[u.d.uid] = 1;
        var v = V.units.get(u.d.uid);
        if (!v) {
          v = { uid: u.d.uid, side: u.side, d: u.d, x: null, y: null, ox: 0, oy: 0, flashUntil: 0, pose: null, poseUntil: 0, alpha: 1, dying: 0, hud: null, born: now(), phase: (hashStr(u.d.uid) % 60), fall: 0 };
          V.units.set(u.d.uid, v);
        }
        v.d = u.d; v.f = u.f; v.side = u.side;
      });
      V.units.forEach(function (v, uid) { if (!seen[uid] && !v.dying) { dropView(v); V.units.delete(uid); } });
    }
    function dropView(v) { if (v.hud && v.hud.parentNode) v.hud.parentNode.removeChild(v.hud); v.hud = null; }
    function layoutUnits(snap) {
      for (var f = 0; f < 3; f++) {
        var fl = vm.floors[f], start = 0;
        (fl.cats || []).slice().sort(function (a, b) { return a.pos - b.pos; }).forEach(function (c) {
          var v = viewOf(c.uid); if (!v) return; var size = c.size || 1;
          v.tx = G.catX(start, size); v.ty = G.feet(f); start += size; if (v.x == null || snap) { v.x = v.tx; v.y = v.ty; }
        });
        start = 0;
        (fl.pests || []).slice().sort(function (a, b) { return a.pos - b.pos; }).forEach(function (p) {
          var v = viewOf(p.uid); if (!v) return; var size = pestSize(p);
          v.tx = G.pestX(start, size); v.ty = G.feet(f); start += size; if (v.x == null || snap) { v.x = v.tx; v.y = v.ty; }
        });
      }
    }
    function intentOf(p) {
      var it = null;
      (vm.intents || []).forEach(function (x) { if (x.pestUid === p.uid) it = x; });
      return it || (p.intent && typeof p.intent === 'object' ? p.intent : null);
    }
    function hpColorClass(hp, max) { return max && hp / max < 0.4 ? ' low' : ''; }
    function buildHud(v) {
      var d = v.d, u = h('div.u.' + v.side + (d.champion ? '.champ' : ''), { 'data-uid': d.uid });
      v.hud = u; v._hx = null; v._hy = null;
      v.hit = h('button.u-hit', { 'data-uid': d.uid, 'data-side': v.side, onclick: function (e) { e.stopPropagation(); onUnitTap(v); } });
      u.appendChild(v.hit);
      v.top = h('div.u-top'); v.plate = h('div.u-plate'); v.chips = h('div.u-chips');
      u.appendChild(v.top); u.appendChild(v.plate); u.appendChild(v.chips);
      var hov = function () { inspect(v); };
      v.hit.addEventListener('mouseenter', hov); v.hit.addEventListener('focus', hov);
      el.units.appendChild(u);
      return u;
    }
    function renderHud() {
      if (!el.units) return;
      V.units.forEach(function (v) {
        if (v.dying) return;
        if (!v.hud || !v.hud.parentNode) buildHud(v);
        updateHud(v);
      });
    }
    function updateHud(v) {
      var d = v.d, si = spriteInfo(v), hs = (si.h - 3) * s, ws = Math.min(si.w * 0.7, 40) * s;
      var hit = v.hit;
      hit.style.width = Math.round(ws * 1.25) + 'px'; hit.style.height = Math.round(hs) + 'px'; hit.style.left = Math.round(-ws * 0.625) + 'px'; hit.style.top = Math.round(-hs) + 'px';
      v.top.style.bottom = Math.round(hs - 1 * s) + 'px';
      v.plate.style.top = Math.round(-2.5 * s) + 'px';
      v.chips.style.top = Math.round(6.2 * s) + 'px';
      v.hud.classList.toggle('napping', !!d.napping); v.hud.classList.toggle('hidden-unit', !!d.hidden);
      // plate
      ui.clear(v.plate);
      if (v.side === 'cat') {
        var hpLow = hpColorClass(d.health, d.maxHealth);
        v.plate.appendChild(h('span.pl.atk', {}, ui.icon('sword', { size: '.85em' }), h('b.num', {}, String(d.power))));
        v.plate.appendChild(h('span.pl.hp' + hpLow, {}, ui.icon('heart', { size: '.85em' }), h('b.num', {}, String(d.health))));
        hit.setAttribute('aria-label', d.name + ', attack ' + d.power + ', health ' + d.health + ' of ' + d.maxHealth + ', ' + d.lives + ' lives' + (d.napping ? ', napping' : ''));
        // top: lives and nap
        ui.clear(v.top);
        var lives = h('span.u-lives', { 'data-tip': d.name + ': ' + d.lives + (d.maxLives ? ' of ' + d.maxLives : '') + ' lives left' });
        if ((d.maxLives || d.lives) <= 5) { for (var i = 0; i < (d.maxLives || d.lives); i++) lives.appendChild(h('i' + (i < d.lives ? '' : '.off'))); }
        else lives.appendChild(h('span', {}, ui.icon('paw', { size: '1em' }), 'x' + d.lives));
        v.top.appendChild(lives);
        var nap = h('button.u-nap' + (d.napping ? '.on' : ''), { 'aria-pressed': d.napping ? 'true' : 'false', 'aria-label': (d.napping ? 'Wake ' : 'Nap ') + d.name, 'data-tip': d.napping ? 'Wake up (Stretch attack)' : 'Nap: skip attacking, heal 2, gain Rested',
          onclick: function (e) { e.stopPropagation(); doNap(d.uid); } }, ui.icon('zzz', { size: '85%' }));
        v.top.appendChild(nap);
        var par = (vm.attached || []).filter(function (a) { return a.host === d.uid && !a.dead; })[0];
        if (par) {
          var pd = tryf(function () { return SB.content.pest(par.id) || {}; }, {}), cost = pd.parasite && pd.parasite.removeCost != null ? pd.parasite.removeCost : 1;
          v.top.appendChild(h('button.u-scratch', { 'aria-label': 'Scratch off ' + (par.name || 'parasite') + ' for ' + cost + ' Zoomies', 'data-tip': (par.name || 'Parasite') + ' is clinging on. Tap to scratch it off for ' + cost + ' Zoomies.',
            onclick: function (e) { e.stopPropagation(); doScratch(d.uid); } }, ui.icon('claw', { size: '85%' }), h('b.num', {}, String(cost))));
        }
      } else {
        var fl = d.fluff || 0;
        v.plate.appendChild(h('span.pl.hp' + hpColorClass(d.hp, d.maxHp), {}, ui.icon('heart', { size: '.85em' }), h('b.num', {}, String(d.hp))));
        if (fl) v.plate.appendChild(h('span.pl.fl', { 'data-gl': 'fluff' }, ui.icon('cloud', { size: '.85em' }), h('b.num', {}, String(fl))));
        if (d.meter) Object.keys(d.meter).forEach(function (mk) {
          var mv = d.meter[mk], mx = d.meterMax && d.meterMax[mk];
          if (typeof mv !== 'number' || (!mv && !mx)) return;
          v.plate.appendChild(h('span.pl.mt', { 'data-tip': (d.name || 'Boss') + ' ' + mk + ' ' + mv + (mx ? '/' + mx : '') }, h('b.num', {}, mk.slice(0, 4) + ' ' + mv + (mx ? '/' + mx : ''))));
        });
        var it = intentOf(d);
        hit.setAttribute('aria-label', d.name + ', health ' + d.hp + ' of ' + d.maxHp + (it ? ', intent: ' + (it.text || it.kind) : ''));
        ui.clear(v.top);
        if (it) v.top.appendChild(intentBubble(it, d));
      }
      // chips
      ui.clear(v.chips);
      var list = ui.statusList(d.statuses);
      if (v.side === 'cat' && d.hidden) list.unshift({ id: 'hidden', n: 1, name: 'Hidden', icon: 'peek-box', tone: 'neutral', gl: ui.gl('hidden') });
      list.slice(0, 4).forEach(function (st) { v.chips.appendChild(ui.statusChip(st)); });
      if (list.length > 4) v.chips.appendChild(h('span.st-chip.more', { 'data-tip': list.slice(4).map(function (x) { return x.name + ' ' + x.n; }).join(', ') }, '+' + (list.length - 4)));
    }
    function intentBubble(it, p) {
      var kind = it.kind || '';
      var g = ui.gl(it.icon) || ui.gl('intent_attack');
      var base = String(it.icon || '').replace(/^intent_/, ''); if (base === 'multi') base = 'multi_attack';
      var iconName = ui.pxName(base) ? base : ((g && g.icon) || 'claw');
      var tone = /sunbeam/.test(it.icon + kind) ? 'sun' : /attack|multi/.test(it.icon + kind) ? 'atk' : /climb/.test(it.icon + kind) ? 'climb' : /sleep|defend/.test(it.icon + kind) ? 'calm' : 'misc';
      var b = h('span.u-intent.' + tone, { tabindex: '0', 'data-tip': (it.text || (g && g.tooltip) || 'Intent') });
      b.appendChild(ui.icon(iconName, { size: '1.05em' }));
      if (it.dmg) { b.appendChild(h('b.num', {}, String(it.dmg) + (it.hits > 1 ? 'x' + it.hits : ''))); }
      return b;
    }

    // ---------------- inspector
    var inspected = null;
    function unitInfoNode(v) {
      var d = v.d, it = v.side === 'pest' ? intentOf(d) : null;
      var n = h('div.insp');
      n.appendChild(h('div.insp-h', {}, h('b', {}, d.name), h('span.insp-sub', {}, v.side === 'cat' ? (d.champion ? 'Champion' : 'Cat') : 'Pest'),
        d.lives != null ? h('span.insp-lv', {}, ui.icon('paw', { size: '1em' }), d.lives + (d.maxLives ? '/' + d.maxLives : '')) : null));
      if (v.side === 'cat') n.appendChild(h('div.insp-row', {}, ui.icon('sword', { size: '1em' }), 'Attack ' + d.power, ui.icon('heart', { size: '1em' }), 'Health ' + d.health + '/' + d.maxHealth));
      else n.appendChild(h('div.insp-row', {}, ui.icon('heart', { size: '1em' }), 'Health ' + d.hp + '/' + d.maxHp, d.fluff ? [ui.icon('cloud', { size: '1em' }), 'Fluff ' + d.fluff] : null));
      if (it) n.appendChild(h('div.insp-int', {}, ui.icon((it.icon || '').replace(/^intent_/, '') || 'claw', { size: '1.1em' }), it.text || 'Unknown intent'));
      var sl = ui.statusList(d.statuses);
      sl.forEach(function (st) { n.appendChild(h('div.insp-st', { 'data-gl': st.gl ? st.gl.ref : null }, ui.statusChip(st), h('span', {}, (st.gl ? st.gl.tooltip : st.name)))); });
      var traits = (d.traits || []).concat(d.tags || []);
      if (traits.length) n.appendChild(h('div.insp-tags', {}, traits.map(function (t) { var g = ui.gl(t); return h('span.chip', { 'data-gl': g ? g.ref : null, tabindex: '0' }, t); })));
      return n;
    }
    function inspect(v) {
      inspected = v.uid;
      if (!el.side.offsetParent) return;
      renderSide();
    }
    function sideHeader() { return h('div.side-h', {}, 'Inspector'); }
    function sideGardenInfo() { return h('div.side-note', {}, 'Hover or focus a cat or pest for details. Statuses and intents have tooltips.'); }
    function renderSide() {
      if (!el.side.offsetParent) return;
      var keep = inspected && viewOf(inspected) && !viewOf(inspected).dying ? viewOf(inspected) : null;
      ui.clear(el.side);
      el.side.appendChild(h('div.side-h', {}, 'Incoming'));
      var list = vm.garden || [];
      var q = h('div.side-q');
      if (!list.length) q.appendChild(h('div.side-note', {}, 'The garden is empty. Suspiciously quiet.'));
      list.slice(0, 7).forEach(function (p, i) {
        var cv = h('canvas', { width: 40, height: 40 });
        var pp = SB.gfx && SB.gfx.pestprint;
        if (pp) tryf(function () { var cx = cv.getContext('2d'); cx.imageSmoothingEnabled = false; pp.drawPest(cx, pestDesc(p), 'idle0', 20, 37, 1, 0, {}); });
        q.appendChild(h('div.side-p', { 'data-tip': p.name }, cv, h('span', {}, h('b', {}, p.name), h('small', {}, (p.hp != null ? p.hp + ' HP' : '') + (i === 0 ? ' (next)' : '')))));
      });
      el.side.appendChild(q);
      el.side.appendChild(h('div.side-h', {}, 'Inspector'));
      if (keep) el.side.appendChild(unitInfoNode(keep)); else el.side.appendChild(sideGardenInfo());
    }

    // ---------------- hand
    function cardSig(c) { return JSON.stringify([c.card && c.card.cost, c.card && c.card.text, c.card && c.card.power, c.card && c.card.health, c.card && c.card.name]); }
    function pileRect(kind) { var b = kind === 'draw' ? el.drawPile : kind === 'exhaust' ? el.exhPile : el.discPile; return b.getBoundingClientRect(); }
    function cardOpts(entry, cp) {
      return { size: 'hand', playable: cp && cp.ok, unaffordable: cp && !cp.ok && /zoom|energy|afford/i.test(cp.reason || '') };
    }
    function renderHand() {
      var turnOk = vm.turn === 'player' && !playing && !ended;
      var seen = {};
      handOrder = [];
      (vm.hand || []).forEach(function (entry, i) {
        seen[entry.uid] = 1; handOrder.push(entry.uid);
        if (!entry.card) { var cv = tryf(function () { return B.cardView(entry.uid); }, null); if (cv) entry.card = cv; }
        var cp = turnOk ? tryf(function () { return B.canPlay(entry.uid); }, null) : null;
        var rec = handEls.get(entry.uid), sig = cardSig(entry);
        var o = cardOpts(entry, cp);
        if (!rec || rec.sig !== sig) {
          var c = ui.card(entry.card || entry, o);
          c.setAttribute('role', 'listitem'); c.setAttribute('data-uid', entry.uid);
          var fresh = !rec;
          if (rec) { rec.el.replaceWith(c); }
          rec = { el: c, sig: sig, entry: entry }; handEls.set(entry.uid, rec);
          bindCard(rec, entry.uid);
          el.hand.appendChild(c);
          if (fresh) dealIn(c);
        } else {
          rec.el.classList.toggle('playable', !!(cp && cp.ok)); rec.el.classList.toggle('unaff', !!o.unaffordable);
        }
        rec.entry = entry;
        rec.el.classList.toggle('selected', !!(sel && sel.uid === entry.uid));
        rec.el.classList.toggle('kept', (vm.retainPick || []).indexOf(entry.uid) >= 0);
        rec.el.style.zIndex = String(10 + i);
        var key = i < 9 ? ' (key ' + (i + 1) + ')' : '';
        rec.el.setAttribute('aria-label', (entry.card && entry.card.name || '') + (cp && !cp.ok ? ', unplayable: ' + cp.reason : '') + key);
      });
      handEls.forEach(function (rec, uid) {
        if (!seen[uid]) { handEls.delete(uid); flyAway(rec.el, 'discard'); }
      });
      layoutHand();
    }
    function dealIn(c) {
      var idx = dealN++ % 10;
      if (ui.reduced() || !c.animate) { c.style.opacity = '0'; requestAnimationFrame(function () { c.style.transition = 'opacity .12s'; c.style.opacity = '1'; }); return; }
      c.style.visibility = 'hidden';
      requestAnimationFrame(function () {
        if (!c.parentNode) return;
        var pr = pileRect('draw'), cr = c.getBoundingClientRect(), fin = getComputedStyle(c).transform;
        var dx = pr.left + pr.width / 2 - (cr.left + cr.width / 2), dy = pr.top + pr.height / 2 - (cr.top + cr.height / 2);
        c.style.visibility = '';
        c.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.35) rotate(-10deg)', opacity: 0.2 }, { transform: fin === 'none' ? 'none' : fin, opacity: 1 }],
          { duration: 320 / (skip ? 6 : ui.speed()), delay: idx * 45 / (skip ? 6 : ui.speed()), easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' });
      });
      sfx('card_draw');
    }
    function flyAway(c, dest, onDone) {
      if (!c.parentNode) { if (onDone) onDone(); return; }
      var r = c.getBoundingClientRect(), pr = pileRect(dest === 'exhaust' ? 'exhaust' : 'discard');
      var cs = getComputedStyle(c), w = r.width, hh = r.height;
      c.style.cssText += ';position:fixed;left:' + r.left + 'px;top:' + r.top + 'px;width:' + w + 'px;height:' + hh + 'px;transform:none;margin:0;bottom:auto;z-index:300;pointer-events:none;transition:none;';
      c.classList.remove('selected', 'playable');
      document.body.appendChild(c);
      var dx = pr.left + pr.width / 2 - (r.left + w / 2), dy = pr.top + pr.height / 2 - (r.top + hh / 2);
      if (ui.reduced() || !c.animate) { c.style.opacity = '0'; setTimeout(function () { c.remove(); if (onDone) onDone(); }, 120); return; }
      var a = c.animate([{ transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.35) rotate(' + ((rng() - 0.5) * 30) + 'deg)', opacity: 0.2 }],
        { duration: 300 / ui.speed(), easing: 'ease-in', delay: Math.random() * 60 / ui.speed(), fill: 'forwards' });
      a.onfinish = function () { c.remove(); if (onDone) onDone(); };
    }
    function layoutHand() {
      var n = handOrder.length, W = el.hand.clientWidth, cwc = parseFloat(el.hand.style.getPropertyValue('--hand-cw')) || 110;
      var phone = mode === 'phone';
      el.hand.classList.toggle('row', phone);
      handOrder.forEach(function (uid, i) {
        var rec = handEls.get(uid); if (!rec) return; var c = rec.el;
        if (phone) { c.style.setProperty('--x', '0px'); c.style.setProperty('--y', '0px'); c.style.setProperty('--r', '0deg'); c.style.marginRight = '6px'; return; } // no overlap on phones: the stats sit on the right edge of a card and must stay readable
        c.style.marginRight = '';
        var room = W - cwc * 1.5 - 28, gap = Math.min(cwc * 0.92, room / Math.max(1, n - 1)), total = (n - 1) * gap + cwc, x0 = (W - total) / 2 - 6; // 1.5: a hovered, rotated edge card grows ~50% wider and and must not reach End Turn
        var mid = (n - 1) / 2, k = i - mid;
        c.style.setProperty('--x', Math.round(x0 + i * gap) + 'px');
        c.style.setProperty('--y', Math.round(k * k * (n > 7 ? 1.1 : 1.8)) + 'px');
        c.style.setProperty('--r', (k * (n > 7 ? 2 : 3)).toFixed(1) + 'deg');
      });
    }
    function bindCard(rec, uid) {
      var c = rec.el, down = null, longT = 0, moved = false;
      c.addEventListener('pointerdown', function (e) {
        if (e.button) return;
        if (locked()) return;
        down = { x: e.clientX, y: e.clientY, id: e.pointerId, t: now() }; moved = false;
        clearTimeout(longT);
        longT = setTimeout(function () { if (down && !moved) { down = null; ui.cardDetail(rec.entry.card || rec.entry); } }, 480);
      });
      c.addEventListener('pointermove', function (e) {
        if (!down) return;
        var dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (!drag && (Math.abs(dy) > 10 || (mode !== 'phone' && Math.abs(dx) > 10)) && (mode !== 'phone' || dy < -10)) {
          moved = true; clearTimeout(longT); startDrag(uid, c, e);
        }
        if (drag) moveDrag(e);
      });
      var end = function (e) {
        clearTimeout(longT);
        if (drag && drag.uid === uid) { endDrag(e); down = null; return; }
        if (down && !moved && !locked()) { selectCard(uid); }
        down = null;
      };
      c.addEventListener('pointerup', end);
      c.addEventListener('pointercancel', function () { clearTimeout(longT); if (drag) cancelDrag(); down = null; });
      c.addEventListener('contextmenu', function (e) { e.preventDefault(); ui.cardDetail(rec.entry.card || rec.entry); });
      c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); selectCard(uid); } });
      c.addEventListener('mouseenter', function () { hoverUid = uid; });
      c.addEventListener('mouseleave', function () { if (hoverUid === uid) hoverUid = null; });
    }

    // ---------------- selection and targeting
    function locked() { return playing || ended || vm.turn !== 'player' || B.state.turn !== 'player' || ui.modal.count() > 0 && false; }
    function selectCard(uid) {
      if (locked()) return;
      if (keepMode) return toggleKeep(uid);
      if (sel && sel.uid === uid) {
        if (sel.cp.needsTarget === 'none') return playSelected();
        return clearSel();
      }
      var cp = B.canPlay(uid);
      var rec = handEls.get(uid);
      if (!cp.ok) {
        if (rec) { rec.el.classList.remove('shake'); void rec.el.offsetWidth; rec.el.classList.add('shake'); }
        sfx('ui_click', { pitch: 0.7 }); ui.toast(cp.reason || 'Cannot play that.', { tone: 'bad', ms: 1800 }); clearSel(); return;
      }
      sel = { uid: uid, cp: cp }; tgtCursor = -1;
      hook('select', { uid: uid, cp: cp });
      sfx('ui_click');
      refreshTargets(); renderHand();
    }
    function clearSel() {
      sel = null; refreshTargets(); renderHand(); renderTray(); el.arrow.style.display = 'none';
    }
    function playSelected() {
      if (!sel || sel.abil) return;
      var uid = sel.uid; var cp = sel.cp;
      if (cp.needsTarget !== 'none') { ui.toast(cp.needsTarget === 'floor' ? 'Pick a floor.' : cp.needsTarget === 'cat' ? 'Pick a cat.' : 'Pick a pest.'); return; }
      doPlay(uid, null);
    }
    function entryMatchesUnit(entry, v) {
      var d = v.d;
      if (entry.pestUid) return entry.pestUid === d.uid;
      if (entry.catUid) return entry.catUid === d.uid;
      if (entry.uid) return entry.uid === d.uid;
      if (entry.floor !== undefined && entry.pos !== undefined) return entry.floor === d.floor && entry.pos === d.pos;
      return false;
    }
    function targetsList() { return (sel && sel.cp.targets) || []; }
    function refreshTargets() {
      var mode2 = sel ? sel.cp.needsTarget : null, tg = targetsList();
      rootEl.classList.toggle('b-targeting', !!sel && mode2 !== 'none');
      for (var f = 0; f < 3; f++) {
        var ok = mode2 === 'floor' && tg.some(function (t) { return t.floor === f; });
        frame.floors[f] && frame.floors[f].classList.toggle('tgt', ok);
      }
      V.units.forEach(function (v) {
        if (!v.hit) return;
        var on = false, want = (mode2 === 'pest' && v.side === 'pest') || (mode2 === 'cat' && v.side === 'cat');
        if (want) on = tg.some(function (t) { return entryMatchesUnit(t, v); });
        v.hit.classList.toggle('tgt', on);
        v.hud && v.hud.classList.toggle('tgt', on);
      });
      // prompt bar
      if (sel) {
        var nm = sel.abil ? sel.abil.name : ((handEls.get(sel.uid) && handEls.get(sel.uid).entry.card && handEls.get(sel.uid).entry.card.name) || 'card');
        var msg = mode2 === 'floor' ? 'Choose a floor for ' + nm : mode2 === 'pest' ? 'Choose a pest for ' + nm : mode2 === 'cat' ? 'Choose a cat for ' + nm : 'Play ' + nm + '?';
        ui.clear(el.prompt);
        el.prompt.classList.remove('hidden');
        el.prompt.appendChild(h('span.pm', {}, msg));
        if (mode2 === 'none') el.prompt.appendChild(h('button.btn.sm', { onclick: function () { playSelected(); } }, 'Play'));
        el.prompt.appendChild(h('button.btn.alt.sm', { onclick: function () { clearSel(); } }, 'Cancel'));
      } else if (!el.prompt.__info) el.prompt.classList.add('hidden');
    }
    function onFloorTap(f) {
      if (!sel) { return; }
      if (sel.cp.needsTarget !== 'floor') { ui.toast(sel.cp.needsTarget === 'none' ? 'That card needs no target. Tap it again to play.' : 'Pick a ' + (sel.cp.needsTarget === 'pest' ? 'pest' : 'cat') + ' instead.', { ms: 1500 }); return; }
      var t = targetsList().filter(function (x) { return x.floor === f; })[0];
      if (!t) { ui.toast('That floor is full.', { tone: 'bad', ms: 1500 }); return; }
      commit(t);
    }
    function onUnitTap(v) {
      if (sel && !locked()) {
        var mode2 = sel.cp.needsTarget;
        if ((mode2 === 'pest' && v.side === 'pest') || (mode2 === 'cat' && v.side === 'cat')) {
          var t = targetsList().filter(function (x) { return entryMatchesUnit(x, v); })[0];
          if (t) return commit(t);
          ui.toast('Not a valid target.', { tone: 'bad', ms: 1400 }); return;
        }
        if (mode2 === 'floor') return onFloorTap(v.d.floor);
      }
      showInfoStrip(v); inspect(v);
    }
    function showInfoStrip(v) {
      if (mode !== 'phone') return;
      ui.clear(el.prompt); el.prompt.classList.remove('hidden'); el.prompt.__info = true; el.prompt.appendChild(unitInfoNode(v));
      clearTimeout(showInfoStrip.t);
      showInfoStrip.t = setTimeout(function () { el.prompt.__info = false; if (!sel) el.prompt.classList.add('hidden'); }, 5000);
    }
    function doPlay(uid, target) {
      var rec = handEls.get(uid);
      // the tutorial driver can ask for a specific slot ('in front of Biscuit'): it returns {floor,pos} for the card being played
      if (hooks.target) { var t2 = tryf(function () { return hooks.target(uid, target); }, null); if (t2) target = t2; }
      sel = null; refreshTargets(); el.arrow.style.display = 'none';
      var res = act(function () { return B.playCard(uid, target); });
      if (res && res.ok === false) {
        ui.toast(res.reason || 'Cannot play that.', { tone: 'bad' }); sfx('ui_click', { pitch: 0.7 });
        if (rec) { rec.el.classList.remove('shake'); void rec.el.offsetWidth; rec.el.classList.add('shake'); }
        renderHand();
      } else hook('played', { uid: uid, target: target });
    }
    // ---------------- activated abilities and retain picks
    function abilityList() {
      var out = [];
      (vm.floors || []).forEach(function (fl) { (fl.cats || []).forEach(function (c) { if (c.dead || c.removed) return; (c.activated || []).forEach(function (a, i) { out.push({ cat: c, idx: i, a: a }); }); }); });
      out.sort(function (x, y) { return (y.cat.champion ? 1 : 0) - (x.cat.champion ? 1 : 0); });
      return out;
    }
    function abilCost(a) { return a.free ? 0 : (a.cost || 0); }
    function abilKey(it) { return it.cat.uid + ':' + it.idx; }
    function abilTip(it) {
      var a = it.a, lim = a.limit ? (a.limit.n || 1) === 1 ? ' Once per ' + (a.limit.per === 'fight' || a.limit.per === 'battle' ? 'fight' : 'turn') + '.' : ' ' + a.limit.n + ' times per ' + (a.limit.per === 'fight' || a.limit.per === 'battle' ? 'fight' : 'turn') + '.' : '';
      var tg = a.targeting === 'cat' ? ' Choose a cat.' : a.targeting === 'floor' ? ' Choose a floor.' : '';
      return it.cat.name + ': ' + (a.name || 'Ability') + '. ' + (a.text || a.desc || '') + (abilCost(a) ? ' Costs ' + abilCost(a) + ' Zoomies.' : ' Free.') + lim + tg;
    }
    function qualifies(a, c) {
      var ok = true;
      (a.requires || []).forEach(function (r) {
        var v = r.check === 'targetLives' ? c.lives : r.check === 'targetPower' ? c.power : null;
        if (v == null || r.value == null) return;
        var op = r.op || '>=';
        if (op === '>=' && !(v >= r.value)) ok = false; else if (op === '>' && !(v > r.value)) ok = false; else if (op === '<=' && !(v <= r.value)) ok = false; else if (op === '<' && !(v < r.value)) ok = false; else if (op === '==' && !(v === r.value)) ok = false;
      });
      return ok;
    }
    function startAbility(it) {
      if (locked()) return;
      var a = it.a, cost = abilCost(a);
      if (cost > (vm.zoomies || 0)) { ui.toast('Not enough Zoomies for ' + (a.name || 'that') + '.', { tone: 'bad', ms: 1600 }); sfx('ui_click', { pitch: 0.7 }); return; }
      keepMode = false;
      if (a.targeting === 'cat') {
        var tg = []; vm.floors.forEach(function (fl) { (fl.cats || []).forEach(function (c) { if (!c.dead && qualifies(a, c)) tg.push({ catUid: c.uid, uid: c.uid }); }); });
        if (!tg.length) { ui.toast('No cat qualifies for ' + (a.name || 'that') + ' right now.', { tone: 'bad', ms: 1800 }); return; }
        sel = { uid: 'abil:' + abilKey(it), abil: { catUid: it.cat.uid, idx: it.idx, name: a.name || 'ability' }, cp: { ok: true, needsTarget: 'cat', targets: tg } };
        sfx('ui_click'); refreshTargets(); renderHand(); renderTray(); return;
      }
      if (a.targeting === 'floor') {
        var tf = [0, 1, 2].map(function (f) { return { floor: f }; });
        sel = { uid: 'abil:' + abilKey(it), abil: { catUid: it.cat.uid, idx: it.idx, name: a.name || 'ability' }, cp: { ok: true, needsTarget: 'floor', targets: tf } };
        sfx('ui_click'); refreshTargets(); renderHand(); renderTray(); return;
      }
      doAbility(it.cat.uid, it.idx, null, a);
    }
    function commit(t) {
      if (!sel) return;
      if (sel.abil) { var ab = sel.abil; var tgt = t && t.catUid ? { catUid: t.catUid } : t && t.floor !== undefined ? { floor: t.floor } : null; sel = null; refreshTargets(); el.arrow.style.display = 'none'; doAbility(ab.catUid, ab.idx, tgt); renderTray(); return; }
      var rec = handEls.get(sel.uid), ct = rec && rec.entry && rec.entry.card && rec.entry.card.type;
      var n = t && t.floor !== undefined && vm.floors[t.floor] ? (vm.floors[t.floor].cats || []).filter(function (c) { return !c.dead && !c.removed; }).length : 0;
      if ((ct === 'unit' || ct === 'champion') && t && t.pos === undefined && n > 0 && !(hooks.target && hooks.target(sel.uid, t))) return askSlot(sel.uid, t.floor, n);
      doPlay(sel.uid, t);
    }
    // Front / Middle / Back chooser for a cat going onto a floor that already has cats.
    function askSlot(uid, floor, n) {
      var opts = [['Front', 0]];
      if (n >= 2) opts.push(['Middle', Math.floor(n / 2)]);
      opts.push(['Back', n]);
      ui.clear(el.prompt); el.prompt.classList.remove('hidden');
      el.prompt.appendChild(h('span.pm', {}, 'Where on the ' + FLOOR_NAMES[floor] + '?'));
      opts.forEach(function (o) {
        el.prompt.appendChild(h('button.btn.sm', { 'data-tut': 'slot-' + o[0].toLowerCase(), onclick: function () { doPlay(uid, { floor: floor, pos: o[1] }); } }, o[0]));
      });
      el.prompt.appendChild(h('button.btn.alt.sm', { onclick: function () { clearSel(); } }, 'Cancel'));
    }
    function doAbility(catUid, idx, target, a) {
      var res = act(function () { return B.useAbility(catUid, idx, target || undefined); });
      if (res && res.ok === false) { ui.toast(res.reason || 'Cannot use that now.', { tone: 'bad' }); sfx('ui_click', { pitch: 0.7 }); renderTray(); return; }
      abilUsed[catUid + ':' + idx] = vm.round; sfx('relic_gain', { vol: 0.5 });
      hook('ability', { catUid: catUid, idx: idx, target: target });
    }
    function retainSlots() { return tryf(function () { return B.mod ? B.mod('retainSlots', 0) : 0; }, 0) || 0; }
    function toggleKeep(uid) {
      if (!B.toggleRetain) return;
      var r = B.toggleRetain(uid);
      if (r && r.ok === false) { ui.toast(r.reason || 'Cannot keep that.', { tone: 'bad', ms: 1600 }); sfx('ui_click', { pitch: 0.7 }); return; }
      vm.retainPick = clone(B.state.retainPick || []); sfx('ui_click', { pitch: r && r.kept ? 1.3 : 0.9 });
      renderHand(); renderTray();
    }
    function renderTray() {
      var list = abilityList(), slots = retainSlots(), myTurn = vm.turn === 'player' && !playing && !ended;
      if (!list.length && !slots) { el.tray.classList.add('hidden'); ui.clear(el.tray); keepMode = false; return; }
      ui.clear(el.tray); el.tray.classList.remove('hidden');
      list.forEach(function (it) {
        var a = it.a, cost = abilCost(a), key = abilKey(it);
        var spent = a.limit && (a.limit.per === 'turn' || a.limit.per === 'round') && abilUsed[key] === vm.round && (a.limit.n || 1) === 1;
        var dis = !myTurn || cost > (vm.zoomies || 0) || spent;
        var on = sel && sel.abil && sel.abil.catUid === it.cat.uid && sel.abil.idx === it.idx;
        var b = h('button.btn.sm.b-ab' + (on ? '.on' : '') + (dis ? '.dim' : ''), { type: 'button', 'aria-disabled': dis ? 'true' : 'false', 'data-tip': abilTip(it), 'data-uid': it.cat.uid, 'data-abil': a.id || String(it.idx),
          'aria-label': (a.name || 'Ability') + ' for ' + it.cat.name + (cost ? ', ' + cost + ' Zoomies' : ', free') + (spent ? ', already used' : ''), onclick: function () { ui.tooltip.hide(); if (on) { clearSel(); renderTray(); return; } if (spent) { ui.toast('Already used this turn.', { tone: 'bad', ms: 1400 }); return; } startAbility(it); } },
          ui.icon('bolt', { size: '1.1em' }), h('span.ab-n', {}, a.name || 'Ability'), h('b.ab-c.num', {}, cost ? String(cost) : 'Free'));
        el.tray.appendChild(b);
      });
      if (slots) {
        var picked = (vm.retainPick || []).filter(function (u) { return (vm.hand || []).some(function (x) { return x.uid === u; }); }).length;
        var kb = h('button.btn.sm.b-keep' + (keepMode ? '.on' : '') + (!myTurn ? '.dim' : ''), { type: 'button', 'aria-pressed': keepMode ? 'true' : 'false', 'data-tip': 'Retain: pick up to ' + slots + ' card' + (slots === 1 ? '' : 's') + ' to keep in hand at end of turn. If you pick none, your dearest playable card is kept for you. Key K.',
          onclick: function () { ui.tooltip.hide(); if (!myTurn) return; keepMode = !keepMode; if (keepMode) clearSel(); sfx('ui_click'); renderHand(); renderTray(); } },
          ui.icon('cards', { size: '1.1em' }), h('span.ab-n', {}, keepMode ? 'Keeping' : 'Keep'), h('b.ab-c.num', {}, picked + '/' + slots));
        el.tray.appendChild(kb);
      }
      el.hand.classList.toggle('keeping', keepMode);
    }

    function doNap(uid) {
      if (locked()) return;
      var res = act(function () { return B.toggleNap(uid); });
      if (res && res.ok === false) { ui.toast(res.reason || 'Cannot nap now.', { tone: 'bad' }); sfx('ui_click', { pitch: 0.7 }); }
    }

    function doScratch(catUid) {
      if (locked()) return;
      var res = act(function () { return B.scratchOff(catUid); });
      if (res && res.ok === false) { ui.toast(res.reason || 'Cannot scratch that off.', { tone: 'bad' }); sfx('ui_click', { pitch: 0.7 }); }
    }
    // Fragile toy: any cat on that floor can knock it off (the engine allows one knock per cat per turn)
    function knockToy(roomUid, floor) {
      if (locked()) return;
      var cats = (vm.floors[floor].cats || []).slice();
      if (!cats.length) { ui.toast('Needs a cat on that floor to knock it off.', { tone: 'bad', ms: 1800 }); return; }
      var last = null;
      for (var i = 0; i < cats.length; i++) {
        var uid = cats[i].uid;
        var res = act(function () { return B.knockOffToy(roomUid, uid); });
        if (res && res.ok !== false) return;
        last = res;
        if (playing) return;
      }
      ui.toast((last && last.reason) || 'Cannot knock that off.', { tone: 'bad', ms: 1800 }); sfx('ui_click', { pitch: 0.7 });
    }

    // ---------------- dragging
    function startDrag(uid, c, e) {
      var cp = B.canPlay(uid);
      if (!cp.ok) { drag = null; selectCard(uid); return; }
      sel = { uid: uid, cp: cp }; refreshTargets();
      drag = { uid: uid, el: c, cp: cp, ox: e.clientX, oy: e.clientY, r: c.getBoundingClientRect() };
      c.classList.add('drag'); c.style.setProperty('--dw', drag.r.width + 'px');
      c.setPointerCapture && tryf(function () { c.setPointerCapture(e.pointerId); });
      moveDrag(e);
    }
    function moveDrag(e) {
      var c = drag.el; c.style.left = (e.clientX - drag.r.width / 2) + 'px'; c.style.top = (e.clientY - drag.r.height * 0.6) + 'px';
      var under = targetUnder(e.clientX, e.clientY);
      rootEl.querySelectorAll('.drop-hot').forEach(function (n) { n.classList.remove('drop-hot'); });
      if (under && under.el) under.el.classList.add('drop-hot');
    }
    function targetUnder(x, y) {
      var els = document.elementsFromPoint(x, y), mode2 = drag ? drag.cp.needsTarget : (sel && sel.cp.needsTarget);
      for (var i = 0; i < els.length; i++) {
        var n = els[i];
        if (n.classList && n.classList.contains('u-hit') && n.classList.contains('tgt')) { var v = viewOf(n.getAttribute('data-uid')); if (v) { var t = targetsList().filter(function (q) { return entryMatchesUnit(q, v); })[0]; if (t) return { entry: t, el: n }; } }
      }
      for (var j = 0; j < els.length; j++) {
        var m = els[j];
        if (m.classList && m.classList.contains('b-floor') && m.classList.contains('tgt')) { var f = +m.getAttribute('data-floor'); var tt = targetsList().filter(function (q) { return q.floor === f; })[0]; if (tt) return { entry: tt, el: m }; }
      }
      // floor from unit hit when targeting floors
      if (mode2 === 'floor') {
        for (var k = 0; k < els.length; k++) { var u = els[k]; if (u.classList && u.classList.contains('u-hit')) { var vv = viewOf(u.getAttribute('data-uid')); if (vv) { var t3 = targetsList().filter(function (q) { return q.floor === vv.d.floor; })[0]; if (t3) return { entry: t3, el: frame.floors[vv.d.floor] }; } } }
      }
      return null;
    }
    function endDrag(e) {
      var d = drag, c = d.el; drag = null;
      rootEl.querySelectorAll('.drop-hot').forEach(function (n) { n.classList.remove('drop-hot'); });
      c.classList.remove('drag'); c.style.left = ''; c.style.top = ''; tryf(function () { c.releasePointerCapture(e.pointerId); });
      var handTop = el.hand.getBoundingClientRect().top;
      if (d.cp.needsTarget === 'none') {
        if (e.clientY < handTop - 30) { doPlay(d.uid, null); return; }
        clearSel(); return;
      }
      var under = targetUnder(e.clientX, e.clientY);
      if (under) { doPlay(d.uid, under.entry); return; }
      // dropped nowhere: keep selected for tap-to-target if released over scene, else cancel
      if (e.clientY < handTop - 10) { renderHand(); } else clearSel();
    }
    function cancelDrag() { if (!drag) return; var c = drag.el; c.classList.remove('drag'); c.style.left = ''; c.style.top = ''; drag = null; clearSel(); }
    var onPtrMove = function (e) {
      if (sel && sel.cp.needsTarget !== 'none' && !drag && e.pointerType === 'mouse') {
        var rec = handEls.get(sel.uid); if (!rec) return; var r = rec.el.getBoundingClientRect();
        var ln = el.arrow.querySelector('line'); ln.setAttribute('x1', r.left + r.width / 2); ln.setAttribute('y1', r.top + 10); ln.setAttribute('x2', e.clientX); ln.setAttribute('y2', e.clientY);
        el.arrow.style.display = 'block';
      } else if (el.arrow.style.display !== 'none') el.arrow.style.display = 'none';
    };
    document.addEventListener('pointermove', onPtrMove); cleanups.push(function () { document.removeEventListener('pointermove', onPtrMove); });
    var onDocDown = function (e) {
      if (!sel || drag) return;
      var t = e.target;
      if (t.closest && (t.closest('.card') || t.closest('.u-hit') || t.closest('.b-floor') || t.closest('.b-prompt') || t.closest('.u-nap') || t.closest('.modal-back'))) return;
      clearSel();
    };
    document.addEventListener('pointerdown', onDocDown); cleanups.push(function () { document.removeEventListener('pointerdown', onDocDown); });

    // ---------------- piles, orbs, chips, topbar
    function openPile(kind) { sfx('ui_click'); ui.deckViewer.pile(B, run, kind); }
    function renderStatus() {
      el.drawPile.querySelector('.pn').textContent = vm.drawCount != null ? vm.drawCount : 0;
      el.discPile.querySelector('.pn').textContent = vm.discardCount != null ? vm.discardCount : 0;
      el.exhPile.querySelector('.pn').textContent = vm.exhaustCount != null ? vm.exhaustCount : 0;
      el.exhPile.classList.toggle('hidden', !vm.exhaustCount);
      // zoomies orbs: show up to 10, filled per current zoomies. Max follows turn type.
      var z = vm.zoomies || 0, maxZ = Math.max(z, (vm.clock && vm.clock.isWitching) ? 5 : 3, vm.zoomiesMax || 0);
      ui.clear(el.orbs);
      el.orbs.setAttribute('data-gl', 'zoomies'); el.orbs.classList.toggle('witch', !!(vm.clock && vm.clock.isWitching));
      var shown = Math.min(maxZ, 6);
      for (var i = 0; i < shown; i++) el.orbs.appendChild(h('i.orb' + (i < z ? '.full' : ''), {}, i < z ? ui.icon('zoomies', { size: '80%' }) : null));
      el.orbs.appendChild(h('b.num.orbn', {}, z + '/' + maxZ));
      el.orbs.setAttribute('aria-label', 'Zoomies ' + z + ' of ' + maxZ);
      // nip
      var nip = vm.nip || {}, showNip = (nip.meter > 0 || nip.surge || nip.crash || (run && (run.clan === 'mischief' || run.side === 'mischief')));
      el.nip.classList.toggle('hidden', !showNip); el.nip.classList.toggle('surge', !!nip.surge); el.nip.classList.toggle('crash', !!nip.crash);
      ui.clear(el.nip);
      el.nip.appendChild(ui.icon('nip', { size: '1.3em', cls: 'good' }));
      var bar = h('div.nip-bar'); for (var k = 0; k < 10; k++) bar.appendChild(h('i' + (k < (nip.meter || 0) ? '.on' : '')));
      el.nip.appendChild(bar);
      el.nip.appendChild(h('b.num', {}, nip.surge ? 'SURGE' : nip.crash ? 'CRASH' : (nip.meter || 0) + '/10'));
      // bank
      var showBank = (vm.bank > 0) || (run && (run.clan === 'moon' || run.side === 'moon'));
      el.bank.classList.toggle('hidden', !showBank); ui.clear(el.bank);
      el.bank.appendChild(ui.icon('lives', { size: '1.3em' })); el.bank.appendChild(h('b.num', {}, 'Banked ' + (vm.bank || 0)));
      // end turn button
      el.end.disabled = vm.turn !== 'player' || playing || ended;
      el.end.classList.toggle('glow', !playing && vm.turn === 'player' && !(vm.hand || []).some(function (x) { var cp = tryf(function () { return B.canPlay(x.uid); }); return cp && cp.ok; }));
      // topbar
      el.deckBtn.querySelector('.b-deckn').textContent = run && run.deck ? run.deck.length : '';
      renderClock(); renderTray();
    }
    function renderClock() {
      var c = vm.clock || { round: vm.round, nextWitching: 3, isWitching: false };
      var r = c.round || vm.round || 1, left = (c.nextWitching || 0) - r;
      ui.clear(el.clock);
      var pips = h('span.ck-pips');
      for (var i = 1; i <= 3; i++) {
        var rr = Math.floor((r - 1) / 3) * 3 + i, isW = i === 3;
        pips.appendChild(h('i' + (rr === r ? '.now' : rr < r ? '.past' : '') + (isW ? '.moon' : '')));
      }
      el.clock.appendChild(ui.icon('moon', { size: '1.3em', cls: 'neutral' }));
      el.clock.appendChild(h('span.ck-r', {}, h('b', {}, 'Round ' + r), run && run.night ? h('small', {}, ' Night ' + run.night + '/9') : null));
      el.clock.appendChild(pips);
      var msg = c.isWitching ? 'WITCHING HOUR' : left === 1 ? 'Witching next round!' : left > 1 ? 'Witching in ' + left : '';
      if (msg) el.clock.appendChild(h('span.ck-msg' + (c.isWitching || left === 1 ? '.hot' : ''), {}, msg));
      el.clock.classList.toggle('hot', !!(c.isWitching || left === 1));
      rootEl.classList.toggle('b-witching', !!c.isWitching);
    }
    function renderRelics() {
      ui.clear(el.relics);
      var rl = (run && run.relics) || [];
      var icons = ['star', 'fish', 'bell', 'leaf', 'moon', 'sun', 'bolt', 'heart', 'shield', 'box', 'claw', 'paw'];
      rl.forEach(function (r) {
        var id = r.id || r, def = tryf(function () { return SB.content && SB.content.relic ? SB.content.relic(id) : null; }) || ((SB.data.relics || []).filter(function (x) { return x.id === id; })[0]) || { id: id, name: id, text: '' };
        var hs = hashStr(id), hue = hs % 360;
        var b = h('button.b-relic.rar-' + (def.rarity || 'common'), { role: 'listitem', 'data-id': id, 'aria-label': def.name, style: { '--rh': hue } }, ui.icon(icons[hs % icons.length], { size: '70%', vec: true }),
          r.counter ? h('i.rc', {}, String(r.counter)) : null);
        ui.tooltip.bind(b, function () { return { title: def.name, text: def.text, aside: def.flavor, cat: def.rarity, icon: icons[hs % icons.length] }; });
        b.addEventListener('click', function () { ui.tooltip({ title: def.name, text: def.text, aside: def.flavor, cat: def.rarity }, b); setTimeout(function () { ui.tooltip.hide(b); }, 2600); });
        el.relics.appendChild(b);
      });
    }
    function renderGarden() {
      ui.clear(el.garden);
      el.garden.appendChild(h('span.g-label', {}, ui.icon('stairs', { size: '1em' }), 'Garden'));
      var list = vm.garden || [];
      if (!list.length) el.garden.appendChild(h('span.g-empty', {}, 'Nobody waiting. Suspicious.'));
      list.forEach(function (p, i) {
        var cv = h('canvas', { width: 40, height: 40 });
        var b = h('span.g-pest', { role: 'listitem', tabindex: '0', 'data-uid': p.uid, 'data-tip': p.name + ' (' + (p.hp != null ? p.hp : '?') + ' HP). ' + (i === 0 ? 'Next in.' : 'In ' + (i + 1) + ' waves.') }, cv);
        var pp = SB.gfx && SB.gfx.pestprint;
        if (pp) tryf(function () { var cx = cv.getContext('2d'); cx.imageSmoothingEnabled = false; var d = pestDesc(p); var sp = pp.make(d); pp.drawPest(cx, d, 'idle0', 20, 37, 1, 0, {}); });
        el.garden.appendChild(b);
      });
    }
    function renderAll() {
      ensureViews(); layoutUnits(false); renderHud(); updateFloorMeta(); renderStatus(); renderHand(); renderGarden(); renderSide(); refreshTargets();
    }

    // ---------------- log
    function logLine(t) {
      logLines.push(t); if (logLines.length > 120) logLines.shift();
      if (!el.log.classList.contains('hidden')) renderLog();
      ui.announce && el.live.appendChild(h('div', {}, t)); while (el.live.children.length > 5) el.live.removeChild(el.live.firstChild);
    }
    function renderLog() {
      ui.clear(el.log);
      el.log.appendChild(h('div.log-h', {}, h('b', {}, 'Battle log'), h('button.btn.alt.sm.icon', { 'aria-label': 'Close log', onclick: function () { toggleLog(false); } }, ui.icon('x', { size: 14 }))));
      var body = h('div.log-b');
      logLines.slice(-80).forEach(function (l) { body.appendChild(h('div.log-l', {}, l)); });
      el.log.appendChild(body); body.scrollTop = body.scrollHeight;
    }
    function toggleLog(on) {
      logOpen = on === undefined ? !logOpen : on; el.log.classList.toggle('hidden', !logOpen); if (logOpen) renderLog();
    }
    function nameOf(uid) { var v = viewOf(uid); return v ? v.d.name : (uid === 'sunbeam' ? 'the Sunbeam' : 'something'); }

    // ---------------- tweens, particles, numbers, shake
    function tween(obj, key, to, ms, ease) {
      return new Promise(function (res) {
        if (ui.reduced()) ms = Math.min(ms, 80);
        ms = ms / ui.speed() / (skip ? 6 : 1);
        if (ms < 8) { obj[key] = to; return res(); }
        V.tweens.push({ o: obj, k: key, a: obj[key] || 0, b: to, t0: now(), d: ms, e: ease || easeOut, done: res });
      });
    }
    function sleep(ms) { return new Promise(function (r) { setTimeout(r, Math.max(0, ms / ui.speed() / (skip ? 8 : 1))); }); }
    function spawn(p) { if (V.parts.length > 400) V.parts.shift(); V.parts.push(p); }
    function burst(x, y, o) {
      if (ui.reduced()) { spawn({ x: x, y: y, vx: 0, vy: 0, ax: 0, ay: 0, life: 160, max: 160, size: 3, color: o.colors ? o.colors[0] : '#fff', shape: 'star', fade: 1 }); return; }
      var n = o.n || 8, cols = o.colors || ['#fff'];
      for (var i = 0; i < n; i++) {
        var a = o.dir !== undefined ? o.dir + (rng() - 0.5) * (o.spread || 1.6) : rng() * 6.28, sp = (o.speed || 1.2) * (0.5 + rng());
        spawn({ x: x + (rng() - 0.5) * (o.jit || 2), y: y + (rng() - 0.5) * (o.jit || 2), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + (o.vy || 0), ax: 0, ay: o.g === undefined ? 0.06 : o.g,
          life: (o.life || 380) * (0.7 + rng() * 0.6), max: (o.life || 380), size: o.size || (rng() < 0.3 ? 2 : 1), color: cols[(rng() * cols.length) | 0], shape: o.shape || 'sq', fade: 1 });
      }
    }
    function floatNum(v, text, cls, opts) {
      if (!ui.settings.get('dmgNumbers') && cls !== 'status') return;
      opts = opts || {};
      var x = opts.x !== undefined ? opts.x : (v ? v.x : G.W / 2), y = opts.y !== undefined ? opts.y : (v ? v.y - 30 : G.roofH);
      var n = h('span.fnum.' + cls, {}, text);
      var jitter = ((V.nums++ % 5) - 2) * 6;
      n.style.left = Math.round(x * s + jitter) + 'px'; n.style.top = Math.round(y * s) + 'px';
      n.style.animationDuration = (opts.dur || 800) / ui.speed() + 'ms';
      el.fx.appendChild(n);
      while (el.fx.children.length > 24) el.fx.removeChild(el.fx.firstChild);
      setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, (opts.dur || 800) / ui.speed() + 50);
    }
    function shake(power, ms) {
      var k = +ui.settings.get('shake'); if (!k || ui.reduced()) return;
      V.shake = { p: power * k, t0: now(), d: ms / (skip ? 4 : 1) };
    }
    function banner(text, sub, cls) {
      return new Promise(function (res) {
        var b = h('div.bn' + (cls ? '.' + cls : ''), {}, h('b', {}, text), sub ? h('small', {}, sub) : null);
        ui.clear(el.banner); el.banner.appendChild(b);
        var d = (ui.reduced() ? 500 : 1000) / (skip ? 6 : ui.speed());
        b.style.animationDuration = d + 'ms';
        setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); res(); }, d);
      });
    }
    function flashVig(c) { el.vignette.style.setProperty('--vc', c); el.vignette.classList.remove('flash'); void el.vignette.offsetWidth; el.vignette.classList.add('flash'); }
    function setPhase(t) { phaseText = t || ''; el.phase.textContent = phaseText; el.phase.classList.toggle('on', !!phaseText); }

    // ---------------- event playback
    function refOf(x) {
      if (x == null) return null;
      if (x === 'sunbeam' || (x && x.sunbeam)) return { sun: true };
      if (typeof x === 'string') { var v = viewOf(x); return v ? { v: v } : (x === 'player' ? { player: true } : null); }
      var uid = x.uid || x.pestUid || x.catUid || x.unit; var v2 = uid && viewOf(uid);
      if (v2) return { v: v2 };
      if (x.floor !== undefined) return { floor: x.floor, pos: x.pos };
      return null;
    }
    function unitPoint(r) {
      if (!r) return null;
      if (r.v) return { x: r.v.x, y: r.v.y - 14, f: r.v.d.floor };
      if (r.sun) return { x: G.W / 2, y: G.roofH - 8, f: 3 };
      if (r.floor !== undefined) return { x: G.W / 2, y: G.feet(r.floor) - 14, f: r.floor };
      return null;
    }
    function vmFind(uid) {
      for (var f = 0; f < 3; f++) {
        var fl = vm.floors[f], u = (fl.cats || []).concat(fl.pests || []).filter(function (x) { return x.uid === uid; })[0];
        if (u) return u;
      }
      return null;
    }
    function finalUnit(uid) {
      var out = null;
      B.state.floors.forEach(function (fl) { (fl.cats || []).concat(fl.pests || []).forEach(function (u) { if (u.uid === uid) out = u; }); });
      (B.state.garden || []).forEach(function (u) { if (u.uid === uid) out = u; });
      return out;
    }
    function vmRemove(uid) {
      vm.floors.forEach(function (fl) { fl.cats = (fl.cats || []).filter(function (c) { return c.uid !== uid; }); fl.pests = (fl.pests || []).filter(function (c) { return c.uid !== uid; }); });
      vm.garden = (vm.garden || []).filter(function (c) { return c.uid !== uid; });
    }
    function vmAdd(u, side, f) {
      var fl = vm.floors[f]; if (!fl) return;
      var list = side === 'cat' ? (fl.cats = fl.cats || []) : (fl.pests = fl.pests || []);
      if (list.some(function (x) { return x.uid === u.uid; })) return;
      u.floor = f; list.push(u);
      list.sort(function (a, b) { return a.pos - b.pos; });
    }
    function recompact() { vm.floors.forEach(function (fl, f) { (fl.cats || []).forEach(function (c, i) { c.pos = i; c.floor = f; }); (fl.pests || []).forEach(function (c, i) { c.pos = i; c.floor = f; }); }); }
    function ev(type, e) { return (H[type] || H._default)(e); }

    // reconcile helpers for engine events that move units off the board (swallow, trap, parasites) and back (spit, release)
    function syncAttached(rebuild) {
      vm.attached = clone(B.state.attached || []);
      V.units.forEach(function (v) { if (v.side === 'cat' && v.hud) updateHud(v); });
    }
    function pull(e, word, log) {
      var r = refOf(e.uid);
      if (r && r.v) { var v = r.v; floatNum(v, word, 'status bad', { y: v.y - 36, dur: 950 }); v.dying = now(); v.flashUntil = now() + 120; dropHudSoon(v); sfx('hiss', { vol: 0.5, pitch: 0.7 }); shake(2, 150); logLine(v.d.name + ' ' + log + '.'); }
      vmRemove(e.uid); recompact(); layoutUnits(false); renderHud(); updateFloorMeta();
      if (r && r.v) setTimeout(function () { if (V.units.get(e.uid) === r.v) V.units.delete(e.uid); }, 500 / ui.speed());
      return sleep(300);
    }
    function bringBack() {
      B.state.floors.forEach(function (fl, f) {
        (fl.cats || []).forEach(function (c) { if (!vmFind(c.uid)) { var nu = clone(c); vmAdd(nu, 'cat', f); } });
      });
      recompact(); ensureViews(); layoutUnits(false); renderHud(); updateFloorMeta();
      return sleep(260);
    }
    var H = {
      _default: function () { return Promise.resolve(); },
      draw: function (e) {
        var uid = e.cardUid || e.uid;
        if (uid && !(vm.hand || []).some(function (x) { return x.uid === uid; })) {
          var fin = (B.state.hand || []).filter(function (x) { return x.uid === uid; })[0];
          if (fin) { vm.hand.push(clone(fin)); }
        }
        vm.drawCount = Math.max(0, (vm.drawCount || 0) - 1);
        renderHand(); renderStatus();
        return sleep(80);
      },
      play: function (e) {
        var uid = e.cardUid || e.uid, rec = handEls.get(uid), c = rec && rec.el;
        vm.hand = (vm.hand || []).filter(function (x) { return x.uid !== uid; });
        if (e.cost != null) vm.zoomies = Math.max(0, (vm.zoomies || 0) - e.cost);
        var card = (e.card) || (rec && rec.entry.card) || {};
        logLine(e.type === 'ability' ? (e.name || 'An ability') + ' is used.' : 'You play ' + (card.name || 'a card') + '.');
        sfx(card.type === 'unit' || card.type === 'champion' ? 'cat_deploy' : 'card_play');
        handEls.delete(uid); handOrder = handOrder.filter(function (x) { return x !== uid; }); layoutHand(); renderStatus();
        if (!c) return sleep(120);
        return new Promise(function (res) {
          var r = c.getBoundingClientRect(), sr = el.stage.getBoundingClientRect();
          c.style.cssText += ';position:fixed;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;transform:none;margin:0;bottom:auto;z-index:300;pointer-events:none;transition:none;';
          c.classList.remove('selected', 'playable'); document.body.appendChild(c);
          var unitLike = card.type === 'unit' || card.type === 'champion' || card.type === 'toy';
          var tx = sr.left + sr.width / 2 - (r.left + r.width / 2), ty = sr.top + sr.height * 0.62 - (r.top + r.height / 2);
          if (ui.reduced() || !c.animate) { setTimeout(function () { c.remove(); res(); }, 100); return; }
          var a1 = c.animate([{ transform: 'translate(0,0) scale(1)' }, { transform: 'translate(' + tx + 'px,' + ty + 'px) scale(1.15)' }], { duration: 200 / (skip ? 6 : ui.speed()), easing: 'ease-out', fill: 'forwards' });
          a1.onfinish = function () {
            setTimeout(function () {
              var exh = /exhaust/i.test(card.text || '') || (card.keywords && card.keywords.exhaust);
              if (unitLike) { var a2 = c.animate([{ transform: 'translate(' + tx + 'px,' + ty + 'px) scale(1.15)', opacity: 1 }, { transform: 'translate(' + tx + 'px,' + (ty - 40) + 'px) scale(.2)', opacity: 0 }], { duration: 180 / (skip ? 6 : ui.speed()), fill: 'forwards' }); a2.onfinish = function () { c.remove(); res(); }; return; }
              if (exh) { var a3 = c.animate([{ filter: 'brightness(1)', opacity: 1 }, { filter: 'brightness(3) sepia(1)', opacity: 0, transform: 'translate(' + tx + 'px,' + (ty - 20) + 'px) scale(1.2)' }], { duration: 400 / (skip ? 6 : ui.speed()), fill: 'forwards' }); a3.onfinish = function () { c.remove(); res(); }; return; }
              var pr = pileRect('discard'), dx = pr.left + pr.width / 2 - (r.left + r.width / 2), dy = pr.top + pr.height / 2 - (r.top + r.height / 2);
              var a4 = c.animate([{ transform: 'translate(' + tx + 'px,' + ty + 'px) scale(1.15)', opacity: 1 }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.3)', opacity: .3 }], { duration: 280 / (skip ? 6 : ui.speed()), easing: 'ease-in', fill: 'forwards' });
              a4.onfinish = function () { c.remove(); res(); };
            }, 140 / (skip ? 6 : ui.speed()));
          };
        });
      },
      deploy: function (e) {
        var u = clone(e.unit) || clone(finalUnit(e.uid));
        if (u) { u.floor = e.floor !== undefined ? e.floor : u.floor; if (e.pos !== undefined) u.pos = e.pos; vmRemove(u.uid); vmAdd(u, 'cat', u.floor); recompact(); }
        ensureViews(); layoutUnits(false);
        var v = viewOf(e.uid);
        if (v) { v.y = v.ty - 14; v.x = v.tx; v.squash = 1; buildHudIfNeeded(v); burst(v.tx, v.ty, { n: 8, colors: ['#c9b48a', '#a8956a', '#e8d8b0'], speed: 0.9, g: 0.02, spread: 6.28, life: 350, jit: 5 }); shake(1, 80); logLine((u && u.name) + ' arrives on the ' + FLOOR_NAMES[u ? u.floor : 0] + '.'); }
        renderHud(); updateFloorMeta(); refreshTargets();
        return sleep(260);
      },
      attack: function (e) {
        var a = refOf(e.from), t = refOf(e.to);
        if (!a || !a.v) { if (a && a.player) { sfx('claw_scratch'); } return sleep(90); }
        var v = a.v, dir = v.side === 'cat' ? 1 : -1, tp = unitPoint(t);
        if (tp && t.v && t.v.d.floor !== v.d.floor) dir = tp.x > v.x ? 1 : -1;
        if (t && t.sun) dir = 0;
        v.pose = 'attack'; v.poseUntil = now() + 260 / ui.speed();
        sfx(v.side === 'cat' ? 'claw_scratch' : 'pest_squeak', { pitch: 0.9 + rng() * 0.3 });
        var lungeP = tween(v, 'ox', dir * 8, 90, easeOut);
        if (t && t.sun) tween(v, 'oy', -6, 90, easeOut);
        if (tp) slash(tp.x, tp.y, v.side === 'cat' ? 1 : -1);
        return lungeP.then(function () { tween(v, 'ox', 0, 140, easeOut); tween(v, 'oy', 0, 140, easeOut); return sleep(40); });
      },
      damage: function (e) {
        var r = refOf(e.to || e.uid || e.target); if (!r) return sleep(30);
        if (r.sun) return H.sunbeamHit(e);
        if (!r.v) return sleep(30);
        var v = r.v, d = vmFind(v.uid) || v.d, amt = e.amount || 0;
        if (d.maxHp !== undefined) d.hp = e.hp !== undefined ? e.hp : Math.max(0, d.hp - amt); else d.health = e.hp !== undefined ? e.hp : (e.health !== undefined ? e.health : Math.max(0, d.health - amt));
        if (e.blocked && d.fluff) d.fluff = Math.max(0, d.fluff - e.blocked);
        var big = amt >= 10;
        v.flashUntil = now() + 70; v.pose = v.side === 'cat' ? 'hurt' : 'hurt'; v.poseUntil = now() + 300 / ui.speed();
        var kdir = v.side === 'cat' ? -1 : 1; tween(v, 'ox', kdir * 3, 50).then(function () { tween(v, 'ox', 0, 120); });
        burst(v.x, v.y - 14, { n: 6, colors: ['#ffffff', ui.clanColors[(v.side === 'cat' ? 'alley' : 'pest')].light], speed: 1.4, life: 300, g: 0.05 });
        if (amt > 0) floatNum(v, (ui.settings.get('cbIcons') ? '-' : '-') + amt, big ? 'dmg big' : 'dmg'); else if (e.blocked) floatNum(v, '0', 'block');
        if (e.blocked && amt > 0) floatNum(v, '(' + e.blocked + ' blocked)', 'block', { y: v.y - 40 });
        shake(big ? 3 : 1, big ? 180 : 80);
        sfx(big ? 'heavy_hit' : 'pounce_hit', { pitch: 0.9 + rng() * 0.25 });
        logLine(nameOf(e.from) + ' hits ' + v.d.name + ' for ' + amt + '.');
        updateHudQuick(v);
        return sleep(big ? 200 : 110);
      },
      heal: function (e) {
        var r = refOf(e.uid || e.to); if (!r || !r.v) return sleep(30); var v = r.v, d = vmFind(v.uid) || v.d;
        if (d.maxHealth !== undefined) d.health = Math.min(d.maxHealth, e.health !== undefined ? e.health : d.health + (e.amount || 0)); else if (d.maxHp !== undefined) d.hp = Math.min(d.maxHp, d.hp + (e.amount || 0));
        floatNum(v, '+' + (e.amount || 0), 'heal'); burst(v.x, v.y - 20, { n: 6, colors: ['#7be495', '#b6f0c8'], shape: 'heart', g: -0.02, speed: 0.4, vy: -0.4, life: 800, size: 1 });
        sfx('purr', { dur: 0.5, vol: 0.5 });
        updateHudQuick(v); return sleep(120);
      },
      lifeSpent: function (e) {
        var r = refOf(e.uid); if (!r || !r.v) return sleep(40); var v = r.v, d = vmFind(v.uid) || v.d;
        d.lives = e.lives !== undefined ? e.lives : Math.max(0, (d.lives || 1) - 1);
        floatNum(v, '-1 life', 'life', { y: v.y - 38 }); sfx('life_spent'); shake(2, 150); updateHudQuick(v);
        logLine(v.d.name + ' spends a life.');
        return sleep(180);
      },
      death: function (e) {
        if (e.detached) { vmRemove(e.uid); syncAttached(); return sleep(60); }
        var r = refOf(e.uid); if (!r || !r.v) { vmRemove(e.uid); return sleep(20); }
        var v = r.v; v.dying = now(); v.flashUntil = now() + 120; v.deathSide = v.side;
        dropHudSoon(v);
        var colors = ['#ffffff', '#cfc8d8'];
        if (v.side === 'pest') { var pp = SB.gfx && SB.gfx.pestprint; var px2 = pp && v.desc ? tryf(function () { return pp.pixels(v.desc, 'idle0', 14); }, null) : null; if (px2) { px2.forEach(function (p) { spawn({ x: v.x + p.x, y: v.y + p.y, vx: (rng() - 0.5) * 1.8, vy: -0.6 - rng() * 1.2, ax: 0, ay: 0.08, life: 650, max: 650, size: 2, color: p.color, shape: 'sq', fade: 1 }); }); } else burst(v.x, v.y - 12, { n: 14, colors: ['#8c9a8a', '#c4cec2', '#fff'], speed: 1.6, life: 600, size: 2 }); sfx('squeak'); }
        else { burst(v.x, v.y - 14, { n: 10, colors: ['#ffffff', '#ffd95a'], speed: 1.1, vy: -0.8, g: -0.02, life: 700, shape: 'star' }); sfx('meow', { pitch: 0.8 }); }
        shake(v.side === 'cat' ? 2 : 1, 150);
        logLine(v.d.name + (v.side === 'cat' ? ' is down.' : ' is defeated.'));
        vmRemove(e.uid); recompact(); layoutUnits(false); renderHud(); updateFloorMeta();
        setTimeout(function () { if (V.units.get(e.uid) === v) { V.units.delete(e.uid); } }, (v.side === 'cat' ? 750 : 550) / ui.speed());
        return sleep(v.side === 'cat' ? 380 : 300);
      },
      spawn: function (e) {
        var u = clone(finalUnit(e.uid)) || clone(e.unit);
        if (!u) return sleep(20);
        vmRemove(u.uid); u.floor = e.floor !== undefined ? e.floor : u.floor; if (e.pos !== undefined) u.pos = e.pos; vmAdd(u, 'pest', u.floor); recompact(); ensureViews(); layoutUnits(false);
        var v = viewOf(u.uid); if (v) { v.x = G.x0 + 6; v.y = v.ty + 4; v.alpha = 0; tween(v, 'alpha', 1, 250); buildHudIfNeeded(v); burst(v.tx, v.ty, { n: 6, colors: ['#9aa8a0', '#c4cec2'], speed: 0.7, g: 0.02, life: 300, jit: 5 }); sfx('squeak', { pitch: 0.8 }); logLine(u.name + ' slips in to the ' + FLOOR_NAMES[u.floor] + '.'); }
        renderHud(); renderGarden(); updateFloorMeta();
        return sleep(300);
      },
      move: function (e) {
        var r = refOf(e.uid); if (!r || !r.v) return sleep(20); var v = r.v;
        var d = vmFind(v.uid); var to = e.to !== undefined && typeof e.to === 'number' ? e.to : e.floor;
        if (d && to !== undefined) { var fin = finalUnit(e.uid); vmRemove(v.uid); var nu = clone(d); nu.pos = fin && fin.floor === to ? fin.pos : 99; vmAdd(nu, v.side, to); recompact(); }
        ensureViews(); v = viewOf(e.uid); layoutUnits(false); updateFloorMeta();
        logLine(v.d.name + ' climbs to the ' + FLOOR_NAMES[to] + '.');
        sfx('squeak', { pitch: 1.1, vol: 0.5 });
        var hops = [0, 1, 2].map(function (i) { return function () { return tween(v, 'oy', -7, 90).then(function () { return tween(v, 'oy', 0, 90); }); }; });
        return hops[0]().then(hops[1]).then(hops[2]).then(function () { burst(v.tx, v.ty, { n: 6, colors: ['#c9b48a', '#a8956a'], speed: 0.8, g: 0.02, life: 300, jit: 5 }); renderHud(); });
      },
      knock: function (e) {
        var r = refOf(e.uid); if (!r || !r.v) return sleep(20); var v = r.v;
        var to = e.to !== undefined && typeof e.to === 'number' ? e.to : (v.d.floor - (e.floors || 1));
        if (to >= 0) { var d = vmFind(v.uid); var fin = finalUnit(e.uid); if (d) { vmRemove(v.uid); var nu = clone(d); nu.pos = fin && fin.floor === to ? fin.pos : 99; vmAdd(nu, 'pest', to); recompact(); } }
        else { vmRemove(v.uid); }
        v.fall = 1; ensureViews(); layoutUnits(false); updateFloorMeta();
        sfx('knock_off'); shake(3, 200); logLine(v.d.name + ' is knocked down!');
        return sleep(380).then(function () { v.fall = 0; if (to >= 0) burst(v.tx, v.ty, { n: 10, colors: ['#c9b48a', '#fff'], speed: 1.2, life: 350, jit: 6 }); renderHud(); });
      },
      status: function (e) {
        var r = refOf(e.uid); var name = e.status || e.name;
        if (e.floor !== undefined && !r) { var g0 = ui.gl(name); if (name === 'room' || e.kind === 'room') { var fin = B.state.floors[e.floor]; vm.floors[e.floor].rooms = clone(fin.rooms); updateFloorMeta(); sfx('box_flap'); return sleep(160); } if (g0) logLine('The ' + FLOOR_NAMES[e.floor] + ' gains ' + g0.name + '.'); return sleep(80); }
        if (!r || !r.v) return sleep(40); var v = r.v, d = vmFind(v.uid) || v.d;
        d.statuses = d.statuses || {};
        var cur = d.statuses[name]; var curN = cur && typeof cur === 'object' ? (cur.n || 0) : (cur || 0);
        var nextN = e.stacks !== undefined ? e.stacks : e.total !== undefined ? e.total : curN + (e.amount !== undefined ? e.amount : 1);
        if (nextN > 0) d.statuses[name] = nextN; else delete d.statuses[name];
        var g = ui.gl(name), nm = g ? g.name : name;
        var amt = e.amount !== undefined ? e.amount : nextN - curN;
        floatNum(v, (amt >= 0 ? '+' : '') + amt + ' ' + nm, 'status ' + (g && g.tone === 'debuff' ? 'bad' : 'good'), { y: v.y - 36, dur: 950 });
        burst(v.x, v.y - 18, { n: 4, colors: g && g.tone === 'debuff' ? ['#ff5d6c', '#ffd0d4'] : ['#7be495', '#d0ffe0'], shape: 'spark', speed: 0.5, g: -0.03, life: 500 });
        updateHudQuick(v); return sleep(120);
      },
      phase: function (e) {
        var name = String(e.name || e.phase || ''), text = e.text || e.label || name.replace(/_/g, ' ');
        setPhase(text);
        if (/^(draw|round|player|dawn)$/i.test(name) || e.banner) {
          var rn = e.round || (B.state.clock && B.state.clock.round) || B.state.round;
          return banner('ROUND ' + rn, run && run.night ? 'Night ' + run.night : '', 'round');
        }
        if (/pest|prowl|attack/i.test(name) && /pest/i.test(name)) sfx('hiss', { vol: 0.4 });
        return sleep(160);
      },
      witching: function (e) {
        sfx('witching_gong'); tryf(function () { SB.audio.music('witching'); }); V.tint = 1;
        burst(G.W / 2, G.H / 2, { n: 20, colors: ['#c3ccff', '#7a8cff', '#fff'], shape: 'star', speed: 1.5, g: -0.01, life: 900, jit: 80 });
        logLine('The Witching Hour begins.');
        return banner('WITCHING HOUR', '+2 Zoomies, +1 draw. Cats go Zoomies.', 'witch');
      },
      surge: function () { sfx('zoomies_surge'); flashVig('#7be495'); burst(G.W / 2, G.H, { n: 20, colors: ['#7be495', '#b6f0c8'], shape: 'leaf', speed: 1, vy: -1, g: -0.02, life: 800, jit: 120 }); return banner('CATNIP SURGE', '', 'surge'); },
      crash: function () { sfx('crash_down'); flashVig('#6fd6ff'); return banner('CRASH', 'Everyone naps. Gently.', 'crash'); },
      nap: function (e) { var r = refOf(e.uid); if (r && r.v) { var d = vmFind(r.v.uid) || r.v.d; d.napping = true; sfx('nap_zzz'); updateHudQuick(r.v); logLine(r.v.d.name + ' curls up for a nap.'); } return sleep(140); },
      wake: function (e) { var r = refOf(e.uid); if (r && r.v) { var d = vmFind(r.v.uid) || r.v.d; d.napping = false; sfx('wake_stretch'); updateHudQuick(r.v); logLine(r.v.d.name + ' wakes with a stretch.'); } return sleep(140); },
      zoom: function (e) {
        var a = refOf(e.uid), t = refOf(e.to);
        if (!a || !a.v) { if (e.amount) floatNum(null, '+' + e.amount + ' Zoomies', 'zoomies', { x: G.W / 2, y: G.H - 8 }); sfx('life_gained', { pitch: 1.4, vol: 0.5 }); return sleep(100); }
        var v = a.v, tp = unitPoint(t);
        sfx('zoom'); for (var i = 0; i < 8; i++) spawn({ x: v.x - 12 + i * 3, y: v.y - 10 - (i % 3) * 3, vx: -1.8, vy: 0, ax: 0, ay: 0, life: 260, max: 260, size: 1, color: '#fff', shape: 'sq', fade: 1 });
        v.pose = 'attack'; v.poseUntil = now() + 250; if (tp) slash(tp.x, tp.y, 1);
        return tween(v, 'ox', tp ? Math.max(-14, Math.min(14, (tp.x - v.x) * 0.2)) : 6, 80).then(function () { return tween(v, 'ox', 0, 140); });
      },
      sunbeamHit: function (e) {
        var sb = vm.sunbeam, amt = e.amount || 0;
        if (e.shade !== undefined) sb.shade = Math.max(0, (sb.shade || 0) - e.shade);
        sb.warmth = e.warmth !== undefined ? e.warmth : Math.max(0, sb.warmth - amt);
        V.roofFlash = now(); shake(4, 260); sfx('heavy_hit', { pitch: 0.7 });
        floatNum(null, amt ? '-' + amt + ' Warmth' : 'Shaded', 'warm', { x: G.W / 2, y: G.roofH + 6 });
        burst(G.W / 2, G.roofH - 4, { n: 10, colors: ['#ffd95a', '#ffb347', '#fff3b0'], speed: 1.2, life: 500, jit: 40 });
        tryf(function () { SB.audio.setWarmth(sb.warmth, sb.max); });
        logLine('The Sunbeam loses ' + amt + ' Warmth.');
        updateFloorMeta(); return sleep(260);
      },
      intent: function () { return sleep(10); },
      shuffle: function () { sfx('card_draw', { pitch: 0.7 }); vm.discardCount = 0; vm.drawCount = (vm.drawCount || 0) + (B.state.discardCount || 0); renderStatus(); return sleep(180); },
      discard: function (e) {
        var uid = e.uid || e.cardUid, rec = handEls.get(uid);
        vm.hand = (vm.hand || []).filter(function (x) { return x.uid !== uid; });
        if (rec) { handEls.delete(uid); handOrder = handOrder.filter(function (x) { return x !== uid; }); flyAway(rec.el, 'discard'); layoutHand(); }
        vm.discardCount = (vm.discardCount || 0) + 1; renderStatus();
        return sleep(e.overdraw ? 220 : 60);
      },
      exhaust: function (e) {
        var uid = e.uid || e.cardUid, rec = handEls.get(uid);
        vm.hand = (vm.hand || []).filter(function (x) { return x.uid !== uid; });
        if (rec) { handEls.delete(uid); handOrder = handOrder.filter(function (x) { return x !== uid; }); flyAway(rec.el, 'exhaust'); layoutHand(); }
        vm.exhaustCount = (vm.exhaustCount || 0) + 1; sfx('hiss', { vol: 0.35, pitch: 1.4 }); renderStatus();
        return sleep(160);
      },
      create: function (e) { sfx('relic_gain', { vol: 0.35, pitch: 1.3 }); var nm = (e.id && SB.ui.cardDef(e.id) || {}).name; if (nm) logLine('A ' + nm + ' appears.'); vm.drawCount = B.state.drawCount; vm.discardCount = B.state.discardCount; renderStatus(); return sleep(120); },
      room: function (e) {
        var fin = B.state.floors[e.floor]; if (fin && vm.floors[e.floor]) vm.floors[e.floor].rooms = clone(fin.rooms);
        updateFloorMeta(); if (e.action === 'place') { sfx('box_flap'); var fr = frame.rooms[e.floor] && frame.rooms[e.floor][0]; var pt = { x: G.W / 2, y: G.feet(e.floor) - 10 }; burst(pt.x - 80, pt.y, { n: 8, colors: ['#d9a96a', '#f0d3a3'], speed: 0.8, g: 0.02, life: 350, jit: 8 }); }
        else if (e.action === 'flatten' || e.action === 'remove') sfx('box_flap', { pitch: 0.7 });
        return sleep(160);
      },
      box: function (e) { var r = refOf(e.uid); if (r && r.v) { var d = vmFind(r.v.uid), fin = finalUnit(e.uid); if (d && fin) { d.boxed = fin.boxed; d.hidden = fin.hidden; } sfx('box_flap', { vol: 0.5 }); updateHudQuick(r.v); } return sleep(140); },
      relic: function (e) {
        var b = el.relics.querySelector('[data-id="' + (e.id || e.relic) + '"]'); if (b) { b.classList.remove('proc'); void b.offsetWidth; b.classList.add('proc'); sfx('relic_gain', { vol: 0.4 }); }
        return sleep(160);
      },
      toast: function (e) { ui.toast(e.text || e.message || e.msg || ''); return sleep(60); },
      // ---- events added for the Act 2 and 3 bosses, parasites, the Nip meter and the cat flap
      wave: function () { sfx('pest_squeak', { vol: 0.5, pitch: 0.8 }); logLine('Another wave scurries in.'); return sleep(80); },
      pestDown: function (e) { if ((vm.attached || []).length) syncAttached(); if (e.boss) { shake(4, 300); burst(G.W / 2, G.H / 2, { n: 24, colors: ['#ffd95a', '#fff3b0', '#fff'], shape: 'star', speed: 1.6, g: 0.02, life: 800, jit: 90 }); sfx('heavy_hit', { pitch: 0.6 }); return sleep(260); } return sleep(10); },
      nip: function (e) {
        vm.nip = vm.nip || {}; vm.nip.meter = e.meter != null ? e.meter : vm.nip.meter; renderStatus();
        if (e.amount > 0) { floatNum(null, '+' + e.amount + ' Nip', 'zoomies', { x: G.W / 2, y: G.H - 8 }); sfx('life_gained', { pitch: 1.2, vol: 0.3 }); }
        return sleep(60);
      },
      flap: function (e) {
        var g = (B.state.garden || []).filter(function (x) { return x.uid === e.uid; })[0];
        if (g && !(vm.garden || []).some(function (x) { return x.uid === e.uid; })) { vm.garden = [clone(g)].concat(vm.garden || []); }
        renderGarden(); sfx('knock_off', { pitch: 1.3, vol: 0.6 }); logLine((g ? g.name : 'A pest') + ' is flung out of the cat flap.');
        return sleep(160);
      },
      attach: function (e) {
        var r = refOf(e.uid), host = refOf(e.host);
        vmRemove(e.uid); syncAttached(true); recompact(); ensureViews(); layoutUnits(false);
        if (host && host.v) { floatNum(host.v, 'Latched on!', 'status bad', { y: host.v.y - 36, dur: 950 }); updateHudQuick(host.v); }
        sfx('pest_squeak', { pitch: 1.3 }); logLine((r && r.v ? r.v.d.name : 'A parasite') + ' clings to ' + (host && host.v ? host.v.d.name : 'a cat') + '.');
        renderHud(); renderGarden(); updateFloorMeta();
        return sleep(260);
      },
      meter: function (e) {
        var r = refOf(e.uid); if (!r || !r.v) return sleep(10);
        var d = vmFind(r.v.uid) || r.v.d; d.meter = d.meter || {}; if (e.total != null) d.meter[e.meter] = e.total;
        if (e.amount) floatNum(r.v, (e.amount > 0 ? '+' : '') + e.amount + ' ' + e.meter, 'status ' + (e.amount > 0 ? 'bad' : 'good'), { y: r.v.y - 36, dur: 800 });
        updateHudQuick(r.v); return sleep(90);
      },
      inhale: function (e) {
        var r = refOf(e.uid);
        vm.drawCount = B.state.drawCount != null && !queue.length ? B.state.drawCount : Math.max(0, (vm.drawCount || 0) - (e.count || 0)); renderStatus();
        sfx('whoosh', { pitch: 0.6 }); if (r && r.v) { shake(2, 220); burst(r.v.x - 10, r.v.y - 10, { n: 10, colors: ['#9aa8a0', '#fff'], speed: 0.6, g: 0, vy: 0, life: 400, jit: 24 }); }
        logLine((r && r.v ? r.v.d.name : 'The pest') + ' inhales ' + (e.count || 0) + ' card' + (e.count === 1 ? '' : 's') + '.');
        return sleep(260);
      },
      swallow: function (e) { return pull(e, 'Swallowed!', 'is swallowed whole'); },
      trap: function (e) { return pull(e, 'Trapped!', 'is trapped'); },
      spit: function (e) { vm.drawCount = B.state.drawCount != null ? B.state.drawCount : vm.drawCount; renderStatus(); sfx('knock_off', { pitch: 0.8 }); shake(3, 200); logLine('Everything is spat back out.'); return bringBack(); },
      release: function () { sfx('relic_gain', { vol: 0.4 }); return bringBack(); },
      jam: function (e) { var r = refOf(e.uid); sfx('heavy_hit', { pitch: 0.5 }); shake(5, 320); flashVig('#ff5d6c'); if (r && r.v) floatNum(r.v, 'JAMMED', 'status good', { y: r.v.y - 40, dur: 1100 }); return banner('JAMMED', 'It stops. It stares. Hit it now.', 'surge'); },
      dawn: function () { sfx('witching_gong', { pitch: 1.3 }); flashVig('#ffd95a'); logLine('Dawn is coming. Hold the house.'); return banner('DAWN', 'Hold the house until sunrise.', 'witch'); },
      dawnTick: function (e) { logLine('Dawn round ' + (e.rounds || '') + '.'); sfx('ui_click', { pitch: 1.4 }); return sleep(60); },
      win: function () { V.confetti = now(); sfx('victory_fanfare'); tryf(function () { SB.audio.music('victory'); }); return sleep(500); },
      lose: function () { V.dark = now(); sfx('defeat_sting'); tryf(function () { SB.audio.music('defeat'); }); return sleep(900); }
    };
    function slash(x, y, dir) {
      if (ui.reduced()) return;
      for (var i = 0; i < 3; i++) for (var k = 0; k < 5; k++) spawn({ x: x - 6 + i * 3 + k * dir * 1.2, y: y - 5 + k * 2, vx: 0, vy: 0, ax: 0, ay: 0, life: 140 + k * 14, max: 160, size: 1, color: '#f6ecd8', shape: 'sq', fade: 1 });
    }
    function buildHudIfNeeded(v) { if (!v.hud || !v.hud.parentNode) buildHud(v); updateHud(v); }
    function dropHudSoon(v) { if (v.hud) { v.hud.classList.add('gone'); var hh = v.hud; setTimeout(function () { if (hh.parentNode) hh.parentNode.removeChild(hh); }, 250); v.hud = null; } }
    function updateHudQuick(v) { if (v.hud) updateHud(v); }

    // ---------------- act / queue pump
    var inAct = false, flushT = 0;
    function flushInbox() { if (destroyed || !inbox.length) return; var evs = inbox.splice(0); queue.push.apply(queue, evs); pump(); }
    function act(fn) {
      if (playing) return { ok: false, reason: 'Hold on, the night is still unfolding.' };
      inbox.length = 0; inAct = true;
      var res; try { res = fn(); } finally { inAct = false; }
      var evs = inbox.splice(0);
      if (!evs.length && Array.isArray(res)) evs = res;
      if (res && res.ok === false) { return res; }
      if (evs.length) { queue.push.apply(queue, evs); pump(); }
      else { resync(); }
      return res || { ok: true };
    }
    function pump() {
      if (playing) return;
      playing = true; skip = false; rootEl.classList.add('b-playing'); clearSelQuiet();
      renderStatus(); updateFloorMeta();
      (function next() {
        if (destroyed) return;
        if (!queue.length) return finishPlayback();
        var e = queue.shift();
        var p; try { p = ev(e.type, e); } catch (err) { console.error('event ' + e.type, err); p = Promise.resolve(); }
        // watchdog: an animation promise that never settles must not freeze the night
        var settled = false, wd = setTimeout(function () { if (!settled && !destroyed) { settled = true; console.warn('[battle] event ' + e.type + ' timed out, moving on'); next(); } }, 3500);
        Promise.resolve(p).then(function () { if (!settled) { settled = true; clearTimeout(wd); next(); } }, function (err) { console.error(err); if (!settled) { settled = true; clearTimeout(wd); next(); } });
      })();
    }
    function clearSelQuiet() { sel = null; el.arrow.style.display = 'none'; }
    function finishPlayback() {
      playing = false; skip = false; rootEl.classList.remove('b-playing'); setPhase('');
      resync();
      hook('playbackDone', { state: B.state });
      var res = tryf(function () { return B.result(); }, null);
      if ((res || B.state.turn === 'over') && !endShown) { showEnd(res || tryf(function () { return B.result(); }, null) || { outcome: 'lose' }); }
      else if (vm.turn === 'player') {
        saveSnap(false);
        var wz = vm.clock && vm.clock.isWitching; tryf(function () { SB.audio.music(wz ? 'witching' : (isBoss() ? 'boss' : 'battle')); });
        maybeAutoEnd();
      }
    }
    function maybeAutoEnd() {
      if (!ui.settings.get('autoEnd') || ended) return;
      var any = (vm.hand || []).some(function (x) { var cp = tryf(function () { return B.canPlay(x.uid); }); return cp && cp.ok; });
      if (!any) setTimeout(function () { if (!playing && !destroyed && vm.turn === 'player') endTurn(true); }, 600);
    }
    function resync() {
      vm = clone(B.state);
      ensureViews(); layoutUnits(false);
      renderAll();
      tryf(function () { SB.audio.setWarmth(vm.sunbeam.warmth, vm.sunbeam.max); });
    }
    function isBoss() { return !!(encounter && (encounter.boss || /boss/i.test(encounter.type || encounter.id || ''))) || (params.node && params.node.type === 'boss'); }

    // ---------------- end turn
    function endTurn(force) {
      if (locked()) return;
      var go = function () {
        clearSelQuiet(); refreshTargets();
        hook('endTurn', {});
        // discard the hand visually first
        var uids = handOrder.slice();
        uids.forEach(function (uid, i) { var rec = handEls.get(uid); if (rec) { handEls.delete(uid); setTimeout(function () { flyAway(rec.el, 'discard'); }, i * 30 / ui.speed()); } });
        handOrder = []; vm.hand = []; vm.turn = 'resolving';
        sfx('ui_click');
        // Input stays locked (playing) during the short discard animation, then the lock is released and the engine runs the round
        // in the SAME timer callback. (An empty hand used to schedule both at 0 ms in the wrong order, so act() was refused
        // with 'Hold on' and End Turn was lost for good: that was the stuck End Turn after the Act 2 boss, whose hand gets inhaled.)
        var delay = uids.length ? Math.min(400, 120 + uids.length * 30) / ui.speed() : 0;
        playing = true;
        setTimeout(function () {
          if (destroyed) return;
          playing = false;
          var r = act(function () { return B.endTurn(); });
          if (r && r.ok === false) { vm.turn = 'player'; resync(); ui.toast(r.reason || 'Could not end the turn.', { tone: 'bad' }); }
        }, delay);
        renderStatus();
      };
      if (!force && ui.settings.get('confirmEndTurn')) {
        var playable = (vm.hand || []).filter(function (x) { var cp = tryf(function () { return B.canPlay(x.uid); }); return cp && cp.ok; }).length;
        if (playable && vm.zoomies > 0) {
          ui.confirm({ title: 'End the turn?', text: 'You still have ' + vm.zoomies + ' Zoomies and ' + playable + ' playable card' + (playable === 1 ? '' : 's') + '.', yes: 'End turn', no: 'Keep playing' }).then(function (ok) { if (ok) go(); });
          return;
        }
      }
      go();
    }

    // ---------------- end overlay, growth report
    // mid-fight autosave: a snapshot at each player turn start, dropped when the fight ends (tutorial and event-less runs skip it)
    function saveSnap(clear) {
      var run = params.run; if (!run || run.tutorial || run.noAutosave || !SB.run || !SB.run.saveBattle || params.battle) return;
      tryf(function () { SB.run.saveBattle(run, clear ? null : B.serialize()); });
    }
    function showEnd(result) {
      endShown = true; ended = true; saveSnap(true);
      var win = result.outcome === 'win';
      renderStatus(); renderHand();
      var ov = h('div.b-endov.' + (win ? 'win' : 'lose'));
      var box = h('div.b-endbox.panel');
      box.appendChild(h('h1.title', {}, win ? 'The Sunbeam holds.' : (result.surrendered ? 'You curled up and gave in.' : 'The house went dark.')));
      var st = result.stats || {};
      var rows = h('div.b-endstats');
      var pairs = [['Rounds', vm.round || st.rounds], ['Damage dealt', st.damage != null ? st.damage : st.damageDealt], ['Cards played', st.cardsPlayed], ['Warmth left', vm.sunbeam ? vm.sunbeam.warmth + '/' + vm.sunbeam.max : null]];
      pairs.forEach(function (p) { if (p[1] != null && p[1] !== undefined) rows.appendChild(h('div', {}, h('small', {}, p[0]), h('b.num', {}, String(p[1])))); });
      box.appendChild(rows);
      if (win && result.loot && result.loot.fish) box.appendChild(h('div.b-loot', {}, ui.icon('fish', { size: '1.2em', cls: 'neutral' }), '+' + result.loot.fish + ' Fish'));
      var btns = h('div.b-endbtns');
      var growth = result.growth || [];
      if (growth.length) btns.appendChild(h('button.btn.alt', { onclick: function () { growthReport(result, function () { }); } }, 'Growth report'));
      btns.appendChild(h('button.btn', { autofocus: true, onclick: function () { continueOut(result); } }, win ? 'Continue' : 'Continue'));
      box.appendChild(btns); ov.appendChild(box); rootEl.appendChild(ov); el.endOverlay = ov;
      if (win) { tryf(function () { SB.audio.music('victory'); }); }
      var firstBtn = btns.querySelector('.btn:last-child'); if (firstBtn) tryf(function () { firstBtn.focus(); });
      if (win && growth.length) setTimeout(function () { if (!destroyed) growthReport(result); }, 700 / ui.speed());
      hook('ended', result);
    }
    function growthReport(result) {
      var list = result.growth || [];
      var body = h('div.growth');
      body.appendChild(h('p.growth-intro', {}, list.length ? 'Your cats were busy.' : 'Nothing grew this time. It happens.'));
      list.forEach(function (g, i) {
        var text = typeof g === 'string' ? g : (g.text || g.desc || g.label || ((g.name || g.cardName || 'A card') + ' ' + (g.kind || 'grew')));
        var kind = typeof g === 'string' ? 'growth' : (g.kind || g.type || 'growth');
        var ic = /mastery/.test(kind) ? 'star' : /knead/.test(kind) ? 'paw' : /life|lives/.test(kind) ? 'heart' : /evol/.test(kind) ? 'up' : /xp|play/.test(kind) ? 'bolt' : 'plus';
        var row = h('div.growth-row', { style: { animationDelay: (i * 160 / ui.speed()) + 'ms' } }, h('span.g-ic', {}, ui.icon(ic, { size: '1.3em' })), h('div', {}, h('b', {}, g.name || g.cardName || ''), h('div', {}, text)));
        body.appendChild(row);
      });
      return ui.modal(body, { title: 'Growth report', buttons: [{ label: 'Nice', cls: '' }] });
    }
    function continueOut(result) {
      var win = result.outcome === 'win';
      var payload = { run: run, result: result, battle: B, encounter: encounter, node: params.node, outcome: result.outcome };
      hook('leave', payload);
      ui.go(win ? 'reward' : 'gameover', payload);
    }

    // ---------------- pause, help
    function pauseMenu() {
      if (ended) return;
      var body = h('div.pause');
      var s2 = ui.settings;
      function seg(key, opts) { var wrap = h('div.seg'); opts.forEach(function (o) { var b = h('button' + (s2.get(key) === o[0] ? '.on' : ''), { onclick: function () { s2.set(key, o[0]); ui.$$('button', wrap).forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); fit(); } }, o[1]); wrap.appendChild(b); }); return wrap; }
      function sw(key) { var i = h('input.switch', { type: 'checkbox', onchange: function () { s2.set(key, i.checked); } }); i.checked = !!s2.get(key); return i; }
      body.appendChild(h('div.field', {}, h('label', {}, 'Text size'), seg('textSize', [['s', 'S'], ['m', 'M'], ['l', 'L'], ['xl', 'XL']])));
      body.appendChild(h('div.field', {}, h('label', {}, 'Animation speed'), seg('fast', [[1, 'x1'], [2, 'x2'], [3, 'x3']])));
      body.appendChild(h('div.field', {}, h('label', {}, 'Screen shake'), seg('shake', [[0, 'Off'], [0.5, 'Half'], [1, 'Full']])));
      body.appendChild(h('div.field', {}, h('label', {}, 'Reduce motion'), sw('reduceMotion')));
      body.appendChild(h('div.field', {}, h('label', {}, 'Damage numbers'), sw('dmgNumbers')));
      body.appendChild(h('div.field', {}, h('label', {}, 'Confirm End Turn with Zoomies left'), sw('confirmEndTurn')));
      body.appendChild(h('div.field', {}, h('label', {}, 'High contrast'), sw('highContrast')));
      body.appendChild(h('div.field', {}, h('label', {}, 'Shape icons for colorblind play'), sw('cbIcons')));
      if (mode === 'phone') body.appendChild(h('div.field', {}, h('label', {}, 'Left-handed (End Turn on the left)'), sw('leftHanded')));
      if (SB.audio && SB.audio.setMuted) body.appendChild(h('div.field', {}, h('label', {}, 'Mute all sound'), (function () { var i = h('input.switch', { type: 'checkbox', onchange: function () { SB.audio.setMuted('master', i.checked); } }); i.checked = !!tryf(function () { return SB.audio.isMuted('master'); }); return i; })()));
      ui.modal(body, { title: 'Paused', buttons: [
        { label: 'Surrender', cls: 'danger', close: false, onClick: function (m) {
          ui.confirm({ title: 'Surrender?', text: 'The house goes dark and the run ends. Cats will think less of you, quietly.', yes: 'Surrender', no: 'Keep fighting', danger: true }).then(function (ok) { if (ok) { m.close(); surrender(); } });
        } },
        { label: 'Keys', cls: 'alt', close: false, onClick: function () { keyHelp(); } },
        { label: 'Resume' }] });
    }
    function surrender() {
      var res = act(function () { return B.surrender(); });
      if (!playing) { var r = tryf(function () { return B.result(); }, null); if (r && !endShown) showEnd(r); }
    }
    function keyHelp() {
      var rows = [['1 to 9', 'Select card in hand'], ['Left / Right', 'Cycle cards or targets'], ['Up / Down', 'Change floor target'], ['Enter / Space', 'Play or confirm'], ['E', 'End turn (Space too, with no card chosen)'],
        ['N', 'Toggle Nap on the focused cat'], ['A', 'Use the first available ability'], ['K', 'Keep mode: pick cards to retain'], ['D / X', 'Draw / discard pile'], ['L', 'Battle log'], ['Esc', 'Cancel, then pause'], ['?', 'This list']];
      ui.modal(h('div.keys', {}, rows.map(function (r) { return h('div.field', {}, h('kbd', {}, r[0]), h('span', {}, r[1])); })), { title: 'Keyboard' });
    }

    // ---------------- keyboard
    function targetOrder() {
      // floors/units available for the current selection, attic first
      var tg = targetsList(), mode2 = sel && sel.cp.needsTarget, out = [];
      if (mode2 === 'floor') [2, 1, 0].forEach(function (f) { var t = tg.filter(function (x) { return x.floor === f; })[0]; if (t) out.push({ entry: t, label: FLOOR_NAMES[f], el: frame.floors[f] }); });
      else if (mode2 === 'pest' || mode2 === 'cat') {
        var vs = []; V.units.forEach(function (v) { if (!v.dying && v.side === (mode2 === 'pest' ? 'pest' : 'cat')) { var t = tg.filter(function (x) { return entryMatchesUnit(x, v); })[0]; if (t) vs.push({ entry: t, v: v }); } });
        vs.sort(function (a, b) { return (b.v.d.floor - a.v.d.floor) || (mode2 === 'cat' ? b.v.x - a.v.x : a.v.x - b.v.x); });
        out = vs.map(function (q) { return { entry: q.entry, label: q.v.d.name, el: q.v.hit, v: q.v }; });
      }
      return out;
    }
    function moveCursor(dir) {
      var list = targetOrder(); if (!list.length) return;
      tgtCursor = (tgtCursor + dir + list.length) % list.length; if (tgtCursor < 0) tgtCursor = 0;
      rootEl.querySelectorAll('.kbd-hot').forEach(function (n) { n.classList.remove('kbd-hot'); });
      var it = list[tgtCursor]; if (it.el) { it.el.classList.add('kbd-hot'); tryf(function () { it.el.focus({ preventScroll: true }); }); }
      el.live.appendChild(h('div', {}, it.label));
    }
    var onKey = function (e) {
      if (destroyed || e.ctrlKey || e.metaKey || e.altKey) return;
      if (ui.modal.count() > 0) return;
      var k = e.key, tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (ended) { if (k === 'Enter' && el.endOverlay) { /* default button handles it */ } return; }
      if (k === 'Escape') { e.preventDefault(); if (sel) clearSel(); else pauseMenu(); return; }
      if (k === '?') { keyHelp(); return; }
      if (k === 'd' || k === 'D') { openPile('draw'); return; }
      if (k === 'x' || k === 'X') { openPile('discard'); return; }
      if (k === 'l' || k === 'L') { toggleLog(); return; }
      if (locked()) return;
      if (/^[1-9]$/.test(k)) { var uid = handOrder[+k - 1]; if (uid) { e.preventDefault(); selectCard(uid); } return; }
      if (k === 'e' || k === 'E') { e.preventDefault(); endTurn(); return; }
      if (k === 'k' || k === 'K') { if (retainSlots()) { keepMode = !keepMode; if (keepMode) clearSel(); renderHand(); renderTray(); } return; }
      if (k === 'a' || k === 'A') { var al = abilityList().filter(function (x) { return abilCost(x.a) <= (vm.zoomies || 0); }); if (al.length) startAbility(al[0]); return; }
      if (k === 'n' || k === 'N') { var f = document.activeElement; if (f && f.classList && f.classList.contains('u-hit') && f.getAttribute('data-side') === 'cat') { doNap(f.getAttribute('data-uid')); } return; }
      if (sel && sel.cp.needsTarget !== 'none') {
        if (k === 'ArrowRight' || k === 'ArrowDown') { e.preventDefault(); moveCursor(1); return; }
        if (k === 'ArrowLeft' || k === 'ArrowUp') { e.preventDefault(); moveCursor(-1); return; }
        if (k === 'Enter' || k === ' ') { e.preventDefault(); var list = targetOrder(); var it = list[tgtCursor >= 0 ? tgtCursor : 0]; if (it) commit(it.entry); return; }
      } else if (sel) {
        if (k === 'Enter' || k === ' ') { e.preventDefault(); playSelected(); return; }
      } else {
        if (k === 'ArrowRight' || k === 'ArrowLeft') {
          if (document.activeElement && document.activeElement.classList.contains('u-hit')) return;
          e.preventDefault(); kbCursor = (kbCursor + (k === 'ArrowRight' ? 1 : -1) + handOrder.length) % Math.max(1, handOrder.length);
          var rec = handEls.get(handOrder[kbCursor]); if (rec) rec.el.focus({ preventScroll: true }); return;
        }
        if (k === ' ') { if (document.activeElement && document.activeElement.classList.contains('card')) return; e.preventDefault(); endTurn(); return; }
      }
    };
    document.addEventListener('keydown', onKey); cleanups.push(function () { document.removeEventListener('keydown', onKey); });

    // ---------------- canvas render loop
    function drawFrame(t) {
      if (destroyed) return;
      raf = requestAnimationFrame(drawFrame);
      if (document.hidden) return;
      var dt = Math.min(48, t - lastFrame); lastFrame = t;
      var tk = Math.floor((t - V.tickBase) / 16.67);
      // tweens
      var tn = now();
      V.tweens = V.tweens.filter(function (w) {
        var p = Math.min(1, (tn - w.t0) / w.d); w.o[w.k] = w.a + (w.b - w.a) * w.e(p);
        if (p >= 1) { w.o[w.k] = w.b; w.done(); return false; } return true;
      });
      // unit smoothing
      V.units.forEach(function (v) {
        if (v.tx === undefined) return;
        var k = v.fall ? 0.22 : 0.3; if (ui.reduced()) k = 1;
        v.x += (v.tx - v.x) * k; v.y += (v.ty - v.y) * k;
        if (Math.abs(v.tx - v.x) < 0.2) v.x = v.tx; if (Math.abs(v.ty - v.y) < 0.2) v.y = v.ty;
        if (v.hud) { var hx = Math.round((v.x + v.ox) * s), hy = Math.round((v.y + v.oy) * s); if (v._hx !== hx || v._hy !== hy) { v.hud.style.transform = 'translate(' + hx + 'px,' + hy + 'px)'; v._hx = hx; v._hy = hy; } }
        if (v.squash && v.squash > 0) v.squash = Math.max(0, v.squash - dt / 160);
      });
      // shake
      if (V.shake) {
        var sp = (tn - V.shake.t0) / V.shake.d;
        if (sp >= 1) { V.shake = null; el.stage.style.transform = ''; }
        else { var pw = V.shake.p * (1 - sp); el.stage.style.transform = 'translate(' + Math.round((rng() - 0.5) * 2 * pw * Math.max(1, s * 0.6)) + 'px,' + Math.round((rng() - 0.5) * 2 * pw * Math.max(1, s * 0.6)) + 'px)'; }
      }
      // particles
      for (var i = V.parts.length - 1; i >= 0; i--) {
        var p = V.parts[i]; p.life -= dt; if (p.life <= 0) { V.parts.splice(i, 1); continue; }
        var st = dt / 16.67; p.vx += p.ax * st; p.vy += p.ay * st; p.x += p.vx * st; p.y += p.vy * st;
      }
      draw(tk, tn);
    }
    function draw(tk, tn) {
      if (!bg) buildBg();
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, G.W, G.H);
      ctx.drawImage(bg, 0, 0);
      var sb = vm.sunbeam || { warmth: 40, max: 40 }, pct = sb.warmth / (sb.max || 1);
      // stars
      for (var i = 0; i < 14; i++) {
        var sx = (i * 53 + 11) % G.W, sy = (i * 29 + 5) % (G.roofH + 6), on = ui.reduced() ? 1 : (Math.floor(tn / 1000 + i * 0.7) % 2);
        if (sx > G.x0 - 6 && sx < G.x1 + 6 && sy > 6) continue;
        ctx.fillStyle = on ? '#ffe9a8' : '#8a7aa8'; ctx.fillRect(sx, sy, on ? 2 : 1, on ? 2 : 1);
      }
      // sunbeam rays
      var rays = Math.max(1, Math.ceil(pct * 8)), cx0 = G.W / 2, cy0 = G.roofH - 8;
      var flick = pct <= 0.25 && !ui.reduced() ? (0.6 + Math.random() * 0.4) : 1;
      ctx.save(); ctx.globalAlpha = 0.1 * flick + (V.confetti ? 0.18 : 0);
      ctx.fillStyle = '#ffd95a';
      for (var r = 0; r < rays; r++) {
        var ang = Math.PI * (0.12 + 0.76 * (r + 0.5) / rays) + (ui.reduced() ? 0 : Math.sin(tn / 1800 + r) * 0.02), len = G.H * 0.42;
        ctx.beginPath(); ctx.moveTo(cx0, cy0); ctx.lineTo(cx0 + Math.cos(ang - 0.05) * len, cy0 + Math.sin(ang - 0.05) * len); ctx.lineTo(cx0 + Math.cos(ang + 0.05) * len, cy0 + Math.sin(ang + 0.05) * len); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      // floor tint for witching / zoomies
      if (vm.clock && vm.clock.isWitching) { ctx.fillStyle = 'rgba(58,42,94,.28)'; ctx.fillRect(G.x0, G.roofH, G.x1 - G.x0, G.H - G.roofH); }
      // units sorted: floor, then x
      var arr = []; V.units.forEach(function (v) { if (v.x != null) arr.push(v); });
      arr.sort(function (a, b) { return (a.d.floor !== b.d.floor ? 0 : 0) || (a.y - b.y) || (b.side === 'cat' ? -1 : 1) - (a.side === 'cat' ? -1 : 1) || a.x - b.x; });
      arr.forEach(function (v) { drawUnit(v, tk, tn); });
      // particles
      V.parts.forEach(function (p) {
        var a = p.fade ? Math.min(1, p.life / (p.max * 0.5)) : 1; ctx.globalAlpha = a; ctx.fillStyle = p.color;
        var gl = GLYPH[p.shape];
        if (gl) { var sz = Math.max(1, p.size > 2 ? 1 : 1); for (var yy = 0; yy < 5; yy++) for (var xx = 0; xx < 5; xx++) if (gl[yy][xx] === 'X') ctx.fillRect(Math.round(p.x + (xx - 2) * sz * 0.8), Math.round(p.y + (yy - 2) * sz * 0.8), sz, sz); }
        else ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      });
      ctx.globalAlpha = 1;
      // confetti (win)
      if (V.confetti && !ui.reduced() && V.parts.length < 120 && Math.random() < 0.35) {
        spawn({ x: G.x0 + Math.random() * (G.x1 - G.x0), y: G.roofH, vx: (Math.random() - 0.5) * 0.6, vy: 0.3 + Math.random() * 0.5, ax: 0, ay: 0.01, life: 1800, max: 1800, size: 1, color: ['#ffd95a', '#ff8a3d', '#ffc08a', '#fff3b0'][(Math.random() * 4) | 0], shape: 'paw', fade: 1 });
      }
      // roof warning flash
      if (V.roofFlash && tn - V.roofFlash < 350) { ctx.fillStyle = 'rgba(255,93,108,' + (0.4 * (1 - (tn - V.roofFlash) / 350)).toFixed(2) + ')'; ctx.fillRect(G.x0, 0, G.x1 - G.x0, G.roofH + 4); }
      // loss: lights out floor by floor, top to bottom
      if (V.dark) {
        var prog = (tn - V.dark) / (200 / ui.speed());
        for (var f2 = 2; f2 >= 0; f2--) { var idx = 2 - f2, a2 = Math.max(0, Math.min(1, prog - idx)); if (a2 > 0) { ctx.fillStyle = 'rgba(10,7,22,' + (0.72 * a2).toFixed(2) + ')'; ctx.fillRect(G.x0, G.top(f2), G.x1 - G.x0, G.floorH); } }
        if (prog > 0.5) { ctx.fillStyle = 'rgba(10,7,22,' + Math.min(0.7, (prog - 0.5) * 0.3).toFixed(2) + ')'; ctx.fillRect(0, 0, G.W, G.roofH); }
      }
    }
    function drawUnit(v, tk, tn) {
      var d = v.d, x = v.x + v.ox, y = v.y + v.oy, flash = tn < v.flashUntil, pose = v.pose && tn < v.poseUntil ? v.pose : null;
      var alpha = v.alpha;
      if (v.side === 'cat') {
        var pp = SB.gfx && SB.gfx.pawprint; if (!pp) { ctx.fillStyle = '#f09040'; ctx.fillRect(x - 8, y - 20, 16, 20); return; }
        if (!v.genome) v.genome = ui.genome(d.art, d.id);
        var g = v.genome, sc = (g && g.scale) || 1;
        var py = y - 29;
        if (v.squash > 0) py += Math.round(v.squash * 2);
        if (v.dying) {
          var tt = Math.min(1, (tn - v.dying) / (650 / ui.speed()));
          pp.deathFade(ctx, g, x - 16, py, 1, tt); return;
        }
        var pn = pose || (d.napping ? 'sleep' : d.boxed ? 'boxed' : d.hidden ? 'hidden' : 'idle');
        if (d.hidden && pn === 'hidden') alpha *= 0.85;
        var po = { name: pn, flash: flash, alpha: alpha };
        pp.drawCat(ctx, g, po, Math.round(x - 16), Math.round(py), 1, tk + v.phase);
        if (d.champion || (g && g.scale > 1)) { ctx.fillStyle = 'rgba(255,207,74,.55)'; ctx.fillRect(Math.round(x - 9), Math.round(y - 1), 18, 1); }
      } else {
        var pr = SB.gfx && SB.gfx.pestprint; if (!pr || !v.desc) { if (!v.desc) v.desc = pestDesc(d); ctx.fillStyle = '#8c9a8a'; ctx.fillRect(x - 8, y - 20, 16, 20); if (!pr) return; }
        var a3 = alpha;
        if (v.dying) { var tt2 = (tn - v.dying) / (420 / ui.speed()); a3 *= Math.max(0, 1 - Math.max(0, tt2 - 0.25) / 0.75); if (tt2 > 1) return; }
        var pn2 = pose === 'attack' ? 'attack' : pose === 'hurt' ? 'hurt' : 'idle';
        pr.drawPest(ctx, v.desc, pn2, Math.round(x), Math.round(y), 1, tk + v.phase, { flash: flash || (v.dying && tn - v.dying < 120), alpha: a3, phase: v.phase, reduceMotion: ui.reduced() });
      }
    }

    // ---------------- vignette / low warmth handled by CSS classes; hover/focus handlers for phone info
    // ---------------- boot
    function boot() {
      B.on(function (e) { inbox.push(e); if (!inAct) { clearTimeout(flushT); flushT = setTimeout(flushInbox, 0); } });
      renderRelics();
      el.vignette.className = 'b-vig';
      fit();
      renderAll();
      tryf(function () { SB.audio.music(isBoss() ? 'boss' : 'battle'); SB.audio.setWarmth(vm.sunbeam.warmth, vm.sunbeam.max); });
      raf = requestAnimationFrame(drawFrame);
      // opening banner
      if (B.state.turn === 'over') { var r0 = tryf(function () { return B.result(); }, null); if (r0) showEnd(r0); }
      else {
        playing = true; rootEl.classList.add('b-playing');
        banner('ROUND ' + (vm.round || 1), run && run.night ? 'Night ' + run.night + ' of 9' : '', 'round').then(function () { playing = false; rootEl.classList.remove('b-playing'); renderAll(); saveSnap(false); hook('ready', { state: B.state }); });
      }
      // tap scene during playback to speed through
      el.stage.addEventListener('pointerdown', function () { if (playing) skip = true; });
    }
    var ro = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(function () { if (!destroyed) fit(); }) : null;
    if (ro) { ro.observe(el.sceneCol); ro.observe(el.handWrap); }
    var offResize = ui.onResize(function () { if (!destroyed) { setTimeout(fit, 30); } });
    var offSettings = ui.settings.onChange(function (k) { if (k === 'leftHanded') rootEl.classList.toggle('lefty', !!ui.settings.get('leftHanded')); });
    rootEl.classList.toggle('lefty', !!ui.settings.get('leftHanded'));
    setTimeout(boot, 0);

    return {
      B: B, el: el, root: rootEl,
      state: function () { return vm; },
      isPlaying: function () { return playing; },
      selectCard: selectCard, endTurn: endTurn, pauseMenu: pauseMenu, toggleLog: toggleLog, fit: fit,
      skipPlayback: function () { skip = true; },
      destroy: function () {
        destroyed = true; cancelAnimationFrame(raf); cleanups.forEach(function (f) { f(); });
        if (ro) ro.disconnect(); offResize && offResize(); offSettings && offSettings();
        handEls.forEach(function (r) { if (r.el.parentNode) r.el.remove(); });
        if (rootEl.parentNode) rootEl.parentNode.removeChild(rootEl);
        document.querySelectorAll('body > .card').forEach(function (n) { n.remove(); });
      }
    };
  }

  var current = null;
  ui.screens.battle = {
    mount: function (root, params) { current = create(root, params); ui.battle = current; },
    unmount: function () { if (current) { current.destroy(); current = null; ui.battle = null; } }
  };
  ui.battleFactory = { geometry: geometry };
})();
