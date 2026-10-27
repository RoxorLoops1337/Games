/* SUNBEAM SIEGE UI kit (C4). Shared helpers for the non-battle screens: DOM builder, pixel glyphs, sprite canvases,
 * dialogs, settings store, content lookups, typewriter, seeds. Classic script, defines SB.ui.kit (alias SB.kit).
 * Depends only on data files and gfx; every SB.ui.* / SB.run.* call from other agents is guarded. */
(function () {
  'use strict';
  window.SB = window.SB || {}; SB.ui = SB.ui || {}; SB.ui.screens = SB.ui.screens || {};
  var K = SB.ui.kit = SB.kit = {};
  var D = function () { return SB.data || {}; };

  // ------------------------------------------------------------------ DOM
  K.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  // h('div.card.big#id', {on:{click:fn}, style:{}, data:{}, text:'', html:'', attrs}, ...kids)
  K.h = function (spec, props) {
    var m = /^([a-z0-9]*)((?:[.#][\w-]+)*)$/i.exec(spec) || [spec, 'div', ''];
    var el = document.createElement(m[1] || 'div'), rest = m[2], i;
    (rest.match(/[.#][\w-]+/g) || []).forEach(function (t) { if (t[0] === '.') el.classList.add(t.slice(1)); else el.id = t.slice(1); });
    var kids = Array.prototype.slice.call(arguments, 2);
    if (props && (typeof props !== 'object' || props.nodeType || Array.isArray(props) || typeof props === 'string' || typeof props === 'number')) { kids.unshift(props); props = null; }
    if (props) for (var k in props) {
      var v = props[k]; if (v == null || v === false) continue;
      if (k === 'class') v.split(/\s+/).forEach(function (c) { if (c) el.classList.add(c); });
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style') { if (typeof v === 'string') el.style.cssText = v; else for (var s in v) el.style.setProperty(s.indexOf('-') >= 0 ? s : s.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); }), v[s]); }
      else if (k === 'on') for (var ev in v) el.addEventListener(ev, v[ev]);
      else if (k === 'data') for (var d in v) el.dataset[d] = v[d];
      else if (k === 'tut') el.setAttribute('data-tut', v);
      else if (k === 'value') el.value = v;
      else if (k === 'disabled') el.disabled = !!v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    (function add(list) {
      for (var j = 0; j < list.length; j++) {
        var c = list[j];
        if (c == null || c === false) continue;
        if (Array.isArray(c)) add(c);
        else if (c.nodeType) el.appendChild(c);
        else el.appendChild(document.createTextNode(String(c)));
      }
    })(kids);
    return el;
  };
  var h = K.h;
  K.$ = function (sel, root) { return (root || document).querySelector(sel); };
  K.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  K.clear = function (el) { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  K.clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  K.cap = function (s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); };
  K.pick = function (arr, rng) { return arr && arr.length ? arr[Math.floor((rng ? rng() : Math.random()) * arr.length) % arr.length] : undefined; };
  K.hash = function (s) { var x = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; };
  K.fmtTime = function (sec) { sec = Math.max(0, Math.round(sec || 0)); var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; };
  K.wait = function (ms) { return new Promise(function (r) { setTimeout(r, K.reduced() ? Math.min(ms, 30) : ms); }); };

  // ------------------------------------------------------------------ scope (cleanup of listeners/timers per screen)
  K.scope = function () {
    var items = [], dead = false;
    var S = {
      on: function (t, ev, fn, o) { t.addEventListener(ev, fn, o); items.push(function () { t.removeEventListener(ev, fn, o); }); return fn; },
      timeout: function (fn, ms) { var id = setTimeout(function () { if (!dead) fn(); }, ms); items.push(function () { clearTimeout(id); }); return id; },
      interval: function (fn, ms) { var id = setInterval(function () { if (!dead) fn(); }, ms); items.push(function () { clearInterval(id); }); return id; },
      add: function (fn) { items.push(fn); return fn; },
      get dead() { return dead; },
      dispose: function () { dead = true; items.splice(0).forEach(function (f) { try { f(); } catch (e) { /* ignore */ } }); }
    };
    return S;
  };

  // ------------------------------------------------------------------ settings (SB.ui.settings from ui-core owns nl_settings)
  // keys: textSize s|m|l|xl, reduceMotion, highContrast, cbIcons, shake 0..1, dmgNumbers, fast 1..3, confirmEndTurn, autoEnd, leftHanded
  var LOCAL = { textSize: 'm', reduceMotion: false, highContrast: false, cbIcons: false, shake: 1, dmgNumbers: true, fast: 1, confirmEndTurn: true, autoEnd: false, leftHanded: false };
  K.settings = {
    get: function (k) {
      var S = SB.ui && SB.ui.settings;
      if (S && S.get) { var v = S.get(k); return v === undefined ? LOCAL[k] : v; }
      return LOCAL[k];
    },
    set: function (k, v) {
      var S = SB.ui && SB.ui.settings;
      if (S && S.set) S.set(k, v); else { LOCAL[k] = v; K.settings.apply(); }
      mirrorToProfile();
    },
    all: function () { var S = SB.ui && SB.ui.settings; return S && S.all ? S.all() : Object.assign({}, LOCAL); },
    apply: function () {
      var cl = document.documentElement.classList, s = K.settings.all();
      if (SB.ui && SB.ui.settings) return; // ui-core applies its own classes
      ['text-xs', 'text-s', 'text-m', 'text-l', 'text-xl'].forEach(function (c) { cl.remove(c); });
      cl.add('text-' + (s.textSize || 'm'));
      cl.toggle('reduce-motion', !!s.reduceMotion); cl.toggle('motion-ok', !s.reduceMotion);
      cl.toggle('cb-icons', !!s.cbIcons); cl.toggle('high-contrast', !!s.highContrast); cl.toggle('left-handed', !!s.leftHanded);
    }
  };
  K.reduced = function () { var S = SB.ui && SB.ui.reduced; return S ? S() : !!K.settings.get('reduceMotion'); };
  function mirrorToProfile() {
    try {
      var p = K.prof.get(); if (!p) return;
      p.settings = p.settings || {};
      var g = K.settings.get;
      p.settings.fast = g('fast') > 1; p.settings.leftHanded = !!g('leftHanded');
      p.settings.reducedMotion = !!g('reduceMotion'); p.settings.textScale = { s: 0.9, m: 1, l: 1.2, xl: 1.4 }[g('textSize')] || 1;
      try { p.settings.hush = !!(SB.audio && SB.audio.isMuted && SB.audio.isMuted('master')); } catch (e) { /* ignore */ }
      K.prof.save();
    } catch (e) { /* ignore */ }
  }

  // ------------------------------------------------------------------ profile access (SB.profile wraps SB.data.meta)
  var profCache = null, profStatus = 'new', forceNext = false;
  K.prof = {
    get: function () {
      if (profCache) return profCache;
      try {
        var r = SB.profile && SB.profile.load ? SB.profile.load(forceNext) : D().meta && D().meta.load ? D().meta.load() : null;
        forceNext = false;
        if (r && r.profile) { profCache = r.profile; profStatus = r.status || 'ok'; }
        else if (r && typeof r === 'object') { profCache = r; profStatus = SB.profile && SB.profile.status ? SB.profile.status() : 'ok'; }
      } catch (e) { profCache = null; profStatus = 'unavailable'; }
      if (!profCache && D().meta && D().meta.newProfile) profCache = D().meta.newProfile();
      return profCache;
    },
    status: function () { K.prof.get(); return profStatus; },
    reload: function () { profCache = null; forceNext = true; return K.prof.get(); },
    save: function () {
      try { if (!profCache) return; if (SB.profile && SB.profile.save) SB.profile.save(profCache); else if (D().meta && D().meta.save) D().meta.save(profCache); } catch (e) { /* ignore */ }
    },
    sync: function () { try { if (SB.profile && SB.profile.syncUnlocks) SB.profile.syncUnlocks(K.prof.get()); else if (D().meta && D().meta.syncUnlocks) D().meta.syncUnlocks(K.prof.get()); } catch (e) { /* ignore */ } },
    has: function (kind, id) {
      var p = K.prof.get(); if (!p || !p.unlocked) return true;
      var list = p.unlocked[kind + 's'] || p.unlocked[kind];
      return !list || list.indexOf(id) >= 0;
    },
    level: function () { var p = K.prof.get(); return p && p.level || 1; }
  };

  // ------------------------------------------------------------------ sound
  K.sfx = function (name, o) { try { if (SB.audio && SB.audio.play) return SB.audio.play(name, o); } catch (e) { /* ignore */ } };
  K.music = function (scene) { try { if (SB.audio && SB.audio.music) SB.audio.music(scene); } catch (e) { /* ignore */ } };
  K.click = function () { K.sfx('ui_click'); };

  // ------------------------------------------------------------------ pixel glyphs (map nodes, buttons). Rows of chars -> inline SVG.
  var GP = { k: '#1c1630', w: '#f6ecd8', W: '#b7a9c9', y: '#ffd95a', Y: '#c9962a', r: '#ff5d6c', R: '#b13445', g: '#7be495', G: '#2f8a55', b: '#5fb4ff', B: '#2f66b0',
    v: '#b88cff', V: '#6a45b8', n: '#c99a62', N: '#7a5326', s: '#b7b0c8', S: '#6e6680', p: '#ff8fb0', m: '#ff8a3d', M: '#b5521c', t: '#4fd1c5', T: '#1f8078', c: '#f0d3a3', z: '#fff3b0' };
  var GL = {
    battle: ['w..........w', 'ww........ww', '.ww......ww.', '..ww....ww..', '...ww..ww...', '....wwww....', '.....ww.....', '....wwww....', '...ww..ww...', '..ww....ww..', '.ww......ww.', 'ww........ww'],
    night: ['....yyyy....', '..yyyzzy....', '.yyzyyY.....', '.yyyY.......', 'yyyY........', 'yyyY........', 'yyyY........', '.yyyY...yy..', '.yyyyYYYyyY.', '..yyyyyyyY..', '....yyyyY...', '.....YYY....'],
    elite: ['..y..y..y...', '..yyyyyyy...', '..yyyyyyy...', '....rr......', '..rrrrrrr...', '.rrr.rr.rrr.', '.rrr....rrr.', '..rrrrrrrr..', '...rrrrrr...', '....rrrr....', '............', '............'],
    shop: ['....nnnn....', '...nnNNnn...', '....nnnn....', '...nnnnnn...', '..nnnyynnn..', '.nnnnyYnnnn.', '.nnnyyYynnn.', '.nnnnyYnnnn.', '.nnnnnnnnnN.', '.nNnnnnnnNN.', '..NNNNNNNN..', '............'],
    event: ['..wwwwwwwwwc', '.wwwwwwwwwcc', '.wwkkkkkwwcc', '.wwwwwwwwwcc', '.wwkkkkkkwcc', '.wwwwwwwwwcc', '.wwkkkkwwwcc', '.wwwwwwwwwcc', '.wwwwwwwwwc.', '..cccccccc..', '............', '............'],
    post: ['.....nn.....', '....nNNn....', '....nnNn....', '....nNnn....', '....nnNn....', '....nNNn....', '....nnNn....', '....nNnn....', '..nnnnnnnnn.', '.nNNNNNNNNNn', '.nnnnnnnnnnn', '............'],
    nook: ['............', '............', '...pppppp...', '..pppzzppp..', '.pppppppppp.', '.pPPPPPPPPp.', '.ppppppppRp.', '.pRRRRRRRRp.', '..pppppppp..', '............', '............', '............'],
    treasure: ['............', '............', '..nnnnnnnn..', '.nnnnnnnnnn.', '.NNNNyyNNNN.', '.nnnnyYnnnn.', '.nnnnyYnnnn.', '.nnnnnnnnnn.', '.nNnnnnnnNn.', '.NNNNNNNNNN.', '............', '............'],
    mystery: ['...vvvvvv...', '..vvVVVVvv..', '..vv....vv..', '......vvv...', '.....vvv....', '....vvv.....', '....vv......', '............', '....vv......', '....vv......', '............', '............'],
    boss: ['y..y..y..y..', 'yy.yy.yyyy.y', 'yyyyyyyyyyyy', '.yyyyyyyyyy.', '..yyyyyyyy..', '.rrrrrrrrrr.', '.rwkrrrrkwr.', '.rrrrrrrrrr.', '..rrrppprr..', '...rrrrrr...', '............', '............'],
    deck: ['.wwwwwwww...', '.wssssssw...', '.wssWWssw.ww', '.wssssssw.ws', '.wsSSSSsw.ws', '.wssssssw.ws', '.wwwwwwww.ws', '......wwwwws', '............', '............', '............', '............'],
    relic: ['....yyyy....', '..yyzzyyyy..', '.yzzyyyyYY..', '.yzyyyyyYY..', '.yyyyyyYYY..', '..yyyYYYY...', '...YYYYY....', '....YYY.....', '............', '............', '............', '............'],
    map: ['.nnnnnnnnnn.', 'nwwwwwwwwwwn', 'nwkwwwwwwkwn', 'nwwkwwwwkwwn', 'nwwwkkkkwwwn', 'nwwwwrrwwwwn', 'nwwwkwwkwwwn', 'nwwkwwwwkwwn', 'nwwwwwwwwwwn', '.nnnnnnnnnn.', '............', '............'],
    cog: ['....ww......', '.w.wwww.w...', '.wwwwwwww...', '..wwSSww....', 'wwwS..Swwww.', 'wwwS..Swwww.', '..wwSSww....', '.wwwwwwww...', '.w.wwww.w...', '....ww......', '............', '............'],
    lock: ['...ssss.....', '..ss..ss....', '..s....s....', '.ssssssss...', '.sSSSSSSs...', '.sSSkkSSs...', '.sSSkkSSs...', '.sSSSSSSs...', '.ssssssss...', '............', '............', '............'],
    check: ['..........gg', '.........ggg', '........ggg.', 'gg.....ggg..', 'ggg...ggg...', '.ggg.ggg....', '..ggggg.....', '...ggg......', '............', '............', '............', '............'],
    close: ['ww........ww', '.ww......ww.', '..ww....ww..', '...ww..ww...', '....wwww....', '....wwww....', '...ww..ww...', '..ww....ww..', '.ww......ww.', 'ww........ww', '............', '............'],
    back: ['....w.......', '...ww.......', '..www.......', '.wwwwwwwwww.', '..www.......', '...ww.......', '....w.......', '............', '............', '............', '............', '............'],
    home: ['.....ww.....', '....wwww....', '...wwwwww...', '..wwwwwwww..', '.wwwwwwwwww.', '..wwwkkwww..', '..wwwkkwww..', '..wwwkkwww..', '............', '............', '............', '............'],
    paw: ['..w..w..w...', '.ww.ww.ww...', '..w..w..w...', '.....ww.....', '...wwwwww...', '..wwwwwwww..', '..wwwwwwww..', '...ww..ww...', '............', '............', '............', '............'],
    chest: ['............', '..nnnnnnnn..', '.nnnnnnnnnn.', '.NNNNNNNNNN.', '.nnnnyynnnn.', '.nnnnyynnnn.', '.nNNNNNNNNn.', '............', '............', '............', '............', '............'],
    cushion: ['............', '............', '..pppppppp..', '.pppppppppp.', '.ppzzppppRp.', '.pppppppRRp.', '..RRRRRRRR..', '............', '............', '............', '............', '............'],
    scroll: ['..wwwwwwww..', '.wwwwwwwwww.', '..wkkkkkkw..', '..wwwwwwww..', '..wkkkkkww..', '..wwwwwwww..', '..wkkkkkkw..', '.wwwwwwwwww.', '..wwwwwwww..', '............', '............', '............'],
    sort: ['.wwwwwwwwww.', '............', '..wwwwwwww..', '............', '...wwwwww...', '............', '............', '............', '............', '............', '............', '............'],
    star: ['.....yy.....', '.....yy.....', '....yyyy....', 'yyyyyyyyyyyy', '.yyyyyyyyyy.', '..yyyyyyyy..', '...yyyyyy...', '..yyyyyyyy..', '.yyyy..yyyy.', '.yy......yy.', '............', '............'],
    note: ['....wwwww...', '....wkkkw...', '....w...w...', '....w...w...', '....w...w...', '..www..www..', '.wwww.wwww..', '..ww...ww...', '............', '............', '............', '............'],
    hush: ['....w.......', '...ww..w..w.', '.wwww...ww..', '.wwww...ww..', '.wwww..w..w.', '...ww.......', '....w.......', '............', '............', '............', '............', '............'],
    dice: ['.wwwwwwwww..', 'wwwwwwwwwww.', 'wkkwwwwwkkw.', 'wkkwwwwwkkw.', 'wwwwwkkwwww.', 'wwwwwkkwwww.', 'wkkwwwwwkkw.', 'wkkwwwwwkkw.', 'wwwwwwwwwww.', '.wwwwwwwww..', '............', '............'],
    copy: ['.wwwwww.....', '.wssssw.....', '.wss.wwwwww.', '.wss.wssssw.', '.wwwww.ssssw', '.....ws.ssw.', '.....wssssw.', '.....wwwwww.', '............', '............', '............', '............'],
    reroll: ['...wwww.....', '.wwwwwwww...', 'ww.....ww...', 'w......www..', 'w.......ww..', 'w..........w', 'ww.....ww...', '.wwwwwwww...', '...wwww.....', '............', '............', '............'],
    sparkle: ['.....y......', '.....y......', '....yzy.....', 'yyyyzzzyyyy.', '....yzy.....', '.....y......', '.....y......', '............', '............', '............', '............', '............'],
    hammer: ['..ssssss....', '.ssSSSSss...', '.ssSSSSss...', '..ssssss....', '....nn......', '....nn......', '....nn......', '....nn......', '....nn......', '............', '............', '............'],
    tag: ['..ssssss....', '.sssssssss..', 'sss.ssssss..', 'sssssssss...', '.ssssssss...', '..ssssss....', '............', '............', '............', '............', '............', '............'],
    tuna: ['..ssssss....', '.ssbbbbss...', '.sbbbbbbs...', '.sbbwwbbs...', '.sbbbbbbs...', '.ssbbbbss...', '..ssssss....', '............', '............', '............', '............', '............'],
    heart: ['.rr..rr.....', 'rrrrrrrr....', 'rrrrrrrr....', 'rrrrrrrr....', '.rrrrrr.....', '..rrrr......', '...rr.......', '............', '............', '............', '............', '............']
  };
  // auto 1px dark outline around opaque pixels
  function outline(rows) {
    var H = rows.length, W = 0; rows.forEach(function (r) { W = Math.max(W, r.length); });
    var g = []; for (var y = -1; y <= H; y++) { var line = []; for (var x = -1; x <= W; x++) line.push((y >= 0 && y < H && x >= 0 && x < W && rows[y][x] && rows[y][x] !== '.' && rows[y][x] !== ' ') ? rows[y][x] : '.'); g.push(line); }
    var out = g.map(function (r) { return r.slice(); });
    for (var yy = 0; yy < g.length; yy++) for (var xx = 0; xx < g[0].length; xx++) {
      if (g[yy][xx] !== '.') continue;
      var n = (yy > 0 && g[yy - 1][xx] !== '.') || (yy < g.length - 1 && g[yy + 1][xx] !== '.') || (xx > 0 && g[yy][xx - 1] !== '.') || (xx < g[0].length - 1 && g[yy][xx + 1] !== '.');
      if (n) out[yy][xx] = 'k';
    }
    return out.map(function (r) { return r.join(''); });
  }
  var glyphCache = {};
  K.glyphSvg = function (name, px) {
    var rows = GL[name]; if (!rows) return '';
    var key = name + ':' + px; if (glyphCache[key]) return glyphCache[key];
    var g = outline(rows), W = g[0].length, H = g.length, parts = [];
    for (var y = 0; y < H; y++) { var x = 0; while (x < W) { var ch = g[y][x]; if (ch === '.') { x++; continue; } var x2 = x; while (x2 + 1 < W && g[y][x2 + 1] === ch) x2++; parts.push('<rect x="' + x + '" y="' + y + '" width="' + (x2 - x + 1) + '" height="1" fill="' + (GP[ch] || '#fff') + '"/>'); x = x2 + 1; } }
    var scale = (px || 24) / 14;
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + Math.round(W * scale) + '" height="' + Math.round(H * scale) + '" viewBox="0 0 ' + W + ' ' + H + '" shape-rendering="crispEdges" aria-hidden="true">' + parts.join('') + '</svg>';
    return (glyphCache[key] = s);
  };
  K.hasGlyph = function (n) { return !!GL[n]; };
  // icon(name, px): uses SB.gfx.icons (12x12 pixel icons) when the name exists there, else our glyph set.
  K.icon = function (name, px, cls) {
    px = px || 16;
    var html = '';
    try {
      var I = SB.gfx && SB.gfx.icons;
      if (I && I.names && I.names.indexOf(name) >= 0) html = I.svg(name, px / 12, { cb: K.settings.get('cbIcons') });
    } catch (e) { html = ''; }
    if (!html) html = K.glyphSvg(name, px * 1.15);
    var el = document.createElement('span'); el.className = 'ico' + (cls ? ' ' + cls : ''); el.style.setProperty('--s', px + 'px'); el.style.lineHeight = '0'; el.innerHTML = html;
    var svg = el.firstChild; if (svg && svg.style) { svg.style.width = px + 'px'; svg.style.height = 'auto'; svg.style.imageRendering = 'pixelated'; }
    return el;
  };
  K.fishIcon = function (px) { return K.icon('fish', px || 16); };

  // ------------------------------------------------------------------ sprites
  var tickN = 0, sprites = [], loopOn = false, lastT = 0;
  function loop(t) {
    if (!sprites.length) { loopOn = false; return; }
    requestAnimationFrame(loop);
    if (t - lastT < 33) return;
    lastT = t; tickN += K.reduced() ? 0 : 2;
    for (var i = sprites.length - 1; i >= 0; i--) {
      var s = sprites[i];
      if (!s.cv.isConnected) { if (s.seen) { sprites.splice(i, 1); continue; } else if (++s.wait > 120) { sprites.splice(i, 1); continue; } }
      else s.seen = true;
      if (s.cv.isConnected) s.draw(tickN + s.off);
    }
  }
  function register(cv, draw) {
    var s = { cv: cv, draw: draw, off: (Math.random() * 100) | 0, seen: false, wait: 0 };
    sprites.push(s); draw(tickN + s.off);
    if (!loopOn) { loopOn = true; requestAnimationFrame(loop); }
    return s;
  }
  // genome resolution: registry id, descriptor string, object genome, or a card/champion definition
  K.genomeFor = function (what, extra) {
    var P = SB.gfx && SB.gfx.pawprint; if (!P) return null;
    try {
      if (!what) return P.randomGenome(1, extra);
      if (typeof what === 'object' && (what.body || what.fur || what.pattern)) return P.normalize(what);
      if (typeof what === 'object') {
        var id = what.id || what.cardId, hint = what.art && (what.art.hint || (typeof what.art === 'string' ? what.art : '')) || '';
        if (P.registry && P.registry[id]) return P.registry[id];
        if (hint) { var g = P.fromDescriptor(hint, K.hash(id || hint)); if (what.type === 'champion' || what.rarity === 'champion' || what.rarity === 'legendary') g.scale = 1.25; return g; }
        return P.randomGenome(K.hash(id || 'x'), { clan: what.clan, rarity: what.rarity });
      }
      var s = String(what);
      if (P.registry && P.registry[s]) return P.registry[s];
      if (s.indexOf(' ') > 0) return P.fromDescriptor(s, K.hash(s));
      return P.fromId(s);
    } catch (e) { return null; }
  };
  // cat(what, {scale:3, pose:'idle', flip:false, tick:true}) -> animated canvas
  K.cat = function (what, o) {
    o = o || {};
    var g = K.genomeFor(what, o.genome), P = SB.gfx && SB.gfx.pawprint, sc = o.scale || 3;
    var gs = g && g.scale || 1;
    var w = Math.ceil(32 * gs) * sc + 2 * sc, hh = Math.ceil(32 * gs) * sc + sc;
    var cv = h('canvas.spr', { width: w, height: hh, 'aria-hidden': 'true' });
    if (o.cls) cv.className += ' ' + o.cls;
    if (!g || !P) return cv;
    var ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    var x = Math.round((w - 32 * sc) / 2), y = hh - 32 * sc - 0;
    register(cv, function (t) {
      ctx.clearRect(0, 0, w, hh);
      var pose = typeof o.pose === 'function' ? o.pose(t) : (o.pose || 'idle');
      try { P.drawCat(ctx, g, typeof pose === 'string' ? { name: pose, flip: o.flip, flash: o.flash, alpha: o.alpha } : pose, x, y, sc, t); } catch (e) { /* ignore */ }
    });
    return cv;
  };
  K.pestDesc = function (p) {
    if (!p) return { species: 'mouse' };
    if (typeof p === 'string') p = (SB.content && SB.content.pest && SB.content.pest(p)) || K.find('pests', p) || { id: p };
    var id = String(p.id || ''), sz = p.size;
    var desc = { species: id.replace(/^pest_/, '').replace(/^(boss|elite|add|tutorial)_/, ''), size: sz, seed: K.hash(id) };
    if (p.tier === 'boss') desc.boss = true;
    var P = SB.gfx && SB.gfx.pestprint; var base = id.replace(/^pest_/, '');
    var guess = [base, desc.species, base.replace(/^boss_/, 'boss_'), base.split('_')[0]];
    // art hint words give species when the id is not a known name
    var hint = String(p.art || '').toLowerCase();
    if (P && P.catalog) {
      var found = guess.find(function (g) { return P.catalog.indexOf(g) >= 0 || (P.species && P.species.indexOf(g) >= 0); });
      if (!found) { found = P.catalog.find(function (c) { return hint.indexOf(c.replace(/_/g, ' ')) >= 0 || hint.indexOf(c.split('_')[0]) >= 0; }); }
      if (found) desc.species = found;
    }
    return desc;
  };
  K.pest = function (p, o) {
    o = o || {};
    var P = SB.gfx && SB.gfx.pestprint, sc = o.scale || 2;
    var desc = K.pestDesc(p), spr;
    try { spr = P.make(desc); } catch (e) { spr = null; }
    var w = spr ? spr.w * sc + 2 * sc : 32 * sc, hh = spr ? spr.h * sc + 2 * sc : 32 * sc;
    var cv = h('canvas.spr', { width: w, height: hh, 'aria-hidden': 'true' });
    if (!spr) return cv;
    var ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    register(cv, function (t) {
      ctx.clearRect(0, 0, w, hh);
      try { P.drawPest(ctx, spr, o.pose || 'idle', Math.round(w / 2), hh - 2 * sc, sc, t, { flip: o.flip === undefined ? true : o.flip, reduceMotion: K.reduced() }); } catch (e) { /* ignore */ }
    });
    return cv;
  };
  // draw one frame into an arbitrary ctx at a given time (used by procedural scenes)
  K.drawCatAt = function (ctx, what, pose, x, y, scale, tick, opts) {
    var g = K.genomeFor(what); var P = SB.gfx && SB.gfx.pawprint; if (!g || !P) return;
    var p = { name: pose || 'idle' }; if (opts) for (var k in opts) p[k] = opts[k];
    try { P.drawCat(ctx, g, p, x, y, scale, tick || 0); } catch (e) { /* ignore */ }
  };
  K.drawPestAt = function (ctx, what, pose, x, y, scale, tick, opts) {
    var P = SB.gfx && SB.gfx.pestprint; if (!P) return;
    try { P.drawPest(ctx, K.pestDesc(what), pose || 'idle', x, y, scale, tick || 0, opts || {}); } catch (e) { /* ignore */ }
  };
  K.registerAnim = register;
  K.tick = function () { return tickN; };

  // silhouette: dark flat version of a canvas (locked entries)
  K.silhouette = function (canvas) {
    var c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height; c.className = canvas.className;
    var ctx = c.getContext('2d'); ctx.drawImage(canvas, 0, 0); ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = '#0c0818'; ctx.fillRect(0, 0, c.width, c.height);
    return c;
  };
  K.staticCat = function (what, scale, pose) {
    var g = K.genomeFor(what), P = SB.gfx && SB.gfx.pawprint; scale = scale || 3;
    var gs = g && g.scale || 1, w = Math.ceil(32 * gs) * scale + 2 * scale, hh = Math.ceil(32 * gs) * scale + scale;
    var cv = h('canvas.spr', { width: w, height: hh, 'aria-hidden': 'true' });
    if (!g || !P) return cv;
    var ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    try { P.drawCat(ctx, g, pose || 'idle0', Math.round((w - 32 * scale) / 2), hh - 32 * scale, scale, 0); } catch (e) { /* ignore */ }
    return cv;
  };
  K.staticPest = function (p, scale) {
    var P = SB.gfx && SB.gfx.pestprint; scale = scale || 2;
    var spr; try { spr = P.make(K.pestDesc(p)); } catch (e) { return h('canvas.spr', { width: 32, height: 32 }); }
    var w = spr.w * scale + 2 * scale, hh = spr.h * scale + 2 * scale, cv = h('canvas.spr', { width: w, height: hh });
    var ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    try { P.drawPest(ctx, spr, 'idle0', Math.round(w / 2), hh - 2 * scale, scale, 0, { flip: true }); } catch (e) { /* ignore */ }
    return cv;
  };

  // ------------------------------------------------------------------ content lookup (SB.content first, raw data second)
  var idx = {};
  function build(kind) {
    if (idx[kind]) return idx[kind];
    var m = {}, d = D(), arrs = [];
    if (kind === 'cards') arrs = [d.cardsAlley, d.cardsHearth, d.cardsMoon, d.cardsMischief, d.cardsNeutral, d.cardsStarters, d.championsAH, d.championsMM, d.championsAHTokens, d.tutorial && d.tutorial.cards];
    if (kind === 'pests') arrs = [d.enemiesRodents, d.enemiesDogs, d.enemiesHousehold, d.enemiesWild, d.enemiesBosses, d.enemiesElites, d.enemiesBossAdds, d.tutorial && d.tutorial.enemies];
    if (kind === 'relics') arrs = [d.relics];
    if (kind === 'events') arrs = [d.events];
    if (kind === 'upgrades') arrs = [d.upgrades];
    arrs.forEach(function (a) { (a || []).forEach(function (o) { if (o && o.id) m[o.id] = o; }); });
    return (idx[kind] = m);
  }
  K.find = function (kind, id) {
    var m = build(kind); if (!id) return null;
    if (m[id]) return m[id];
    var pre = { cards: ['neutral_', 'curse_', 'alley_', 'hearth_', 'moon_', 'mischief_'], pests: ['pest_'], relics: ['relic_'], events: ['evt_'], upgrades: ['up_'] }[kind] || [];
    for (var i = 0; i < pre.length; i++) if (m[pre[i] + id]) return m[pre[i] + id];
    return null;
  };
  K.card = function (id) { try { var c = SB.content && SB.content.card && SB.content.card(id); if (c) return c; } catch (e) { /* ignore */ } return K.find('cards', id); };
  K.cards = function () { try { if (SB.content && SB.content.cards) { var a = SB.content.cards(); if (a && a.length) return a; } } catch (e) { /* ignore */ } var m = build('cards'); return Object.keys(m).map(function (k) { return m[k]; }); };
  K.relic = function (id) { try { var c = SB.content && SB.content.relic && SB.content.relic(id); if (c) return c; } catch (e) { /* ignore */ } return K.find('relics', id); };
  K.relics = function () { return (D().relics || []).slice(); };
  K.pestDef = function (id) { try { var c = SB.content && SB.content.pest && SB.content.pest(id); if (c) return c; } catch (e) { /* ignore */ } return K.find('pests', id); };
  K.pests = function () { var m = build('pests'); return Object.keys(m).map(function (k) { return m[k]; }).filter(function (p) { return !p.tutorialOnly && !/^pest_tutorial/.test(p.id); }); };
  K.upgrade = function (id) { try { var c = SB.content && SB.content.upgrade && SB.content.upgrade(id); if (c) return c; } catch (e) { /* ignore */ } return K.find('upgrades', id); };
  K.eventDef = function (id) { try { var c = SB.content && SB.content.event && SB.content.event(id); if (c) return c; } catch (e) { /* ignore */ } return K.find('events', id); };
  // card instance -> display card (cost, power, health, text...) using the engine when it is there
  K.effective = function (inst) {
    if (!inst) return null;
    try { if (SB.cardInst && SB.cardInst.effective && inst.uid !== undefined) { var e = SB.cardInst.effective(inst); if (e) return e; } } catch (er) { /* ignore */ }
    var def = K.card(inst.id || inst); if (!def) return { id: inst.id || String(inst), name: inst.id || String(inst), type: 'unit', clan: 'neutral', rarity: 'common', cost: 1, text: '', stats: {} };
    return def;
  };
  K.cardName = function (inst) { var e = K.effective(inst); return e && e.name || (inst && inst.id) || '?'; };

  // ------------------------------------------------------------------ clans, rarity
  var CLANS = {
    alley: { id: 'alley', name: 'Alley Tabbies', color: '#ff8a3d', dark: '#a8431a', light: '#ffc08a', play: 'Scrappers. Claws, Pounce, Frenzy.' },
    hearth: { id: 'hearth', name: 'Hearthpaws', color: '#ffc65a', dark: '#a86a1a', light: '#ffe6a8', play: 'Cozy support. Purr, Nap, Cuddle Pile.' },
    moon: { id: 'moon', name: 'Moonwhiskers', color: '#7a8cff', dark: '#3a3f9e', light: '#c3ccff', play: 'Mystics. Nine Lives, Reborn, Marked.' },
    mischief: { id: 'mischief', name: 'Mischief', color: '#3fd6c0', dark: '#1f7a8a', light: '#ffa0dc', play: 'Chaos. Knock It Off, Boxes, Nip.' },
    neutral: { id: 'neutral', name: 'Neutral', color: '#cfc8d8', dark: '#6e6680', light: '#ece8f2', play: 'Strays that fit anywhere.' },
    pest: { id: 'pest', name: 'Pest', color: '#8c9a8a', dark: '#3f4a40', light: '#c4cec2', play: '' },
    curse: { id: 'curse', name: 'Curse', color: '#8c9a8a', dark: '#3f4a40', light: '#c4cec2', play: '' }
  };
  K.clan = function (id) {
    id = ({ lap: 'hearth', prowl: 'alley', nap: 'moon', chaos: 'mischief' })[id] || id;
    var c = CLANS[id] || CLANS.neutral, out = {}; for (var k in c) out[k] = c[k];
    try { var st = (D().story.clans || []).find(function (x) { return x.id === id; }); if (st) { out.name = st.name || out.name; out.motto = st.motto; out.bio = st.bio; out.quirk = st.quirk; out.origin = st.origin; out.likes = st.likes; out.dislikes = st.dislikes; out.rivalries = st.rivalries; } } catch (e) { /* ignore */ }
    return out;
  };
  K.clanIcon = function (id, px) { return K.icon('clan_' + id, px || 16); };
  K.rarityColor = function (r) { return ({ common: '#b8b0c8', basic: '#b8b0c8', uncommon: '#5fb4ff', rare: '#ffcf4a', epic: '#d46bff', champion: '#ff5d6c', legendary: '#ff5d6c', curse: '#6b7a68', starter: '#7be495', boss: '#ff8a3d' })[r] || '#b8b0c8'; };

  // ------------------------------------------------------------------ champions
  var CLAN_ORDER = ['alley', 'hearth', 'mischief', 'moon'];
  K.champions = function (clan) {
    var d = D(), all = [].concat(d.championsAH || [], d.championsMM || []);
    var list = all.filter(function (c) { return c.clan === clan; });
    return list;
  };
  // meta.champions rows are placeholders champion_<clan>_<n>; resolve to the real card via championIdMap or by order
  K.championSlots = function (clan) {
    var meta = D().meta, rows = (meta && meta.champions || []).filter(function (c) { return c.clan === clan; }).sort(function (a, b) { return a.slot - b.slot; });
    var real = K.champions(clan), map = meta && meta.championIdMap || {};
    return rows.map(function (r, i) {
      var cid = map[r.id] || (real[i] && real[i].id);
      var def = cid && (K.card(cid) || real.find(function (c) { return c.id === cid; })) || real[i] || null;
      return { slot: r.slot, metaId: r.id, id: def && def.id, def: def, unlock: r.unlock };
    });
  };
  K.championUnlocked = function (slotRow) {
    var p = K.prof.get(); if (!p || !p.unlocked) return !slotRow.unlock || slotRow.unlock.type === 'start';
    var l = p.unlocked.champions || [];
    return l.indexOf(slotRow.metaId) >= 0 || l.indexOf(slotRow.id) >= 0;
  };
  K.unlockHint = function (u) {
    if (!u) return 'Locked.';
    if (u.type === 'start') return '';
    if (u.type === 'level') return 'Reach Whisker level ' + u.level + '.';
    if (u.type === 'achievement') { var a = (D().meta.achievements || []).find(function (x) { return x.id === u.id; }); return a ? 'Achievement: ' + a.name + '.' : 'Earn an achievement.'; }
    if (u.type === 'rankWin') return 'Win a run at Mischief Rank ' + (u.rank != null ? u.rank : '?') + '.';
    return 'Keep playing to find out.';
  };

  // ------------------------------------------------------------------ seed helpers
  K.seed = {
    random: function () { try { return D().meta.seed.randomSeed(); } catch (e) { var a = '0123456789ABCDEFGHJKMNPQRSTVWXYZ', s = ''; for (var i = 0; i < 8; i++) s += a[Math.floor(Math.random() * 32)]; return s; } },
    normalize: function (s) { try { return D().meta.seed.normalize(s); } catch (e) { return String(s || '').toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V').replace(/[^0-9A-Z]/g, '').slice(0, 8); } }
  };

  // ------------------------------------------------------------------ dialogs
  var dlgStack = [];
  K.dialog = function (o) {
    o = o || {};
    var root = document.getElementById('overlay-root') || document.body;
    var body = h('div.modal-b'); if (o.body) { if (typeof o.body === 'string') body.innerHTML = o.body; else body.appendChild(o.body); }
    var closeBtn = h('button.ibtn', { 'aria-label': 'Close', on: { click: function () { api.close(); } } }, K.icon('close', 14));
    var head = h('div.modal-h', h('h2', o.title || ''), o.noClose ? null : closeBtn);
    var m = h('div.modal' + (o.wide ? '.wide' : '') + (o.sheet ? '.sheet' : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title || 'Dialog', tabindex: '-1' }, o.title ? head : null, body);
    if (o.footer && o.footer.length) m.appendChild(h('div.modal-f', o.footer));
    if (o.cls) m.className += ' ' + o.cls;
    var back = h('div.modal-back' + (o.sheet ? '.sheet-back' : ''), m);
    var closed = false;
    var api = {
      el: m, body: body, back: back,
      close: function (val) {
        if (closed) return; closed = true;
        document.removeEventListener('keydown', onKey, true);
        if (back.parentNode) back.parentNode.removeChild(back);
        var i = dlgStack.indexOf(api); if (i >= 0) dlgStack.splice(i, 1);
        if (o.onClose) o.onClose(val);
      }
    };
    function onKey(e) {
      if (e.key === 'Escape' && dlgStack[dlgStack.length - 1] === api && !o.noClose) { e.stopPropagation(); e.preventDefault(); api.close(); }
    }
    document.addEventListener('keydown', onKey, true);
    if (!o.noBackdropClose) back.addEventListener('mousedown', function (e) { if (e.target === back && !o.noClose) api.close(); });
    root.appendChild(back); dlgStack.push(api);
    try { m.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    return api;
  };
  K.closeAllDialogs = function () { dlgStack.slice().forEach(function (d) { d.close(); }); };
  K.hasDialog = function () { return dlgStack.length > 0; };
  K.confirm = function (o) {
    return new Promise(function (resolve) {
      var d;
      var yes = h('button.btn' + (o.danger ? '.danger' : ''), { on: { click: function () { resolve(true); d.close(true); } } }, o.ok || 'OK');
      var no = h('button.btn.alt', { on: { click: function () { d.close(false); } } }, o.cancel || 'Cancel');
      d = K.dialog({ title: o.title || 'Sure?', body: h('p', { style: 'line-height:1.4' }, o.text || ''), footer: [no, yes], onClose: function (v) { resolve(v === true); } });
    });
  };
  K.toast = function (msg, kind) {
    try { if (SB.ui.toast && SB.ui.toast !== K.toast) { SB.ui.toast(msg, { tone: kind }); return; } } catch (e) { /* ignore */ }
    var root = document.getElementById('toast-root'); if (!root) return;
    var t = h('div.sb-toast' + (kind ? '.' + kind : ''), { style: 'pointer-events:none;margin:4px auto;width:max-content;max-width:90vw' }, msg); root.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2400);
  };

  // ------------------------------------------------------------------ lightweight tooltip for plain strings (hover/focus/long-press)
  var tipEl = null, tipFor = null;
  function showTip(el, html) {
    if (!tipEl) { tipEl = h('div#c4-tip', { role: 'tooltip', style: 'position:fixed;z-index:9200;max-width:min(300px,86vw);pointer-events:none;background:var(--ui-panel-hi);color:var(--ui-text);border:2px solid var(--ui-border-hi);border-radius:4px;box-shadow:0 3px 0 var(--ui-shadow);padding:.5em .7em;font:calc(13px*var(--text-scale))/1.3 var(--font-body);display:none' }); document.body.appendChild(tipEl); }
    tipEl.innerHTML = html; tipEl.style.display = 'block'; tipFor = el;
    var r = el.getBoundingClientRect(), tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
    var x = K.clamp(r.left + r.width / 2 - tw / 2, 6, window.innerWidth - tw - 6), y = r.top - th - 8; if (y < 6) y = r.bottom + 8;
    tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
  }
  function hideTip() { if (tipEl) tipEl.style.display = 'none'; tipFor = null; }
  K.hideTip = hideTip;
  K.tip = function (el, content) {
    var get = typeof content === 'function' ? content : function () { return content; };
    var timer;
    el.addEventListener('mouseenter', function () { var c = get(); if (c) showTip(el, c); });
    el.addEventListener('mouseleave', hideTip);
    el.addEventListener('focus', function () { var c = get(); if (c) showTip(el, c); });
    el.addEventListener('blur', hideTip);
    el.addEventListener('touchstart', function () { timer = setTimeout(function () { var c = get(); if (c) showTip(el, c); }, 350); }, { passive: true });
    el.addEventListener('touchend', function () { clearTimeout(timer); setTimeout(hideTip, 1800); }, { passive: true });
    el.addEventListener('touchmove', function () { clearTimeout(timer); }, { passive: true });
    return el;
  };

  // ------------------------------------------------------------------ typewriter and counters
  K.typewriter = function (el, text, o) {
    o = o || {};
    var i = 0, done = false, timer = null, cps = o.cps || 48;
    el.textContent = '';
    function fin() { if (done) return; done = true; clearTimeout(timer); el.textContent = text; if (o.onDone) o.onDone(); }
    if (K.reduced() || cps >= 999) { fin(); return { skip: function () { }, get done() { return true; }, stop: function () { } }; }
    var step = function () {
      if (done) return;
      var n = Math.max(1, Math.round(cps / 30));
      i = Math.min(text.length, i + n); el.textContent = text.slice(0, i);
      if (i >= text.length) { fin(); return; }
      var ch = text[i - 1], extra = (ch === '.' || ch === '!' || ch === '?') ? 180 : (ch === ',' ? 90 : 0);
      timer = setTimeout(step, 1000 / 30 + extra);
    };
    step();
    return { skip: fin, get done() { return done; }, stop: function () { done = true; clearTimeout(timer); } };
  };
  K.countUp = function (el, to, ms, fmt) {
    fmt = fmt || function (n) { return String(Math.round(n)); };
    if (K.reduced() || ms <= 0) { el.textContent = fmt(to); return { skip: function () { el.textContent = fmt(to); } }; }
    var t0 = performance.now(), raf, stop = false;
    function f(t) { if (stop) return; var p = Math.min(1, (t - t0) / ms); el.textContent = fmt(to * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(f); }
    raf = requestAnimationFrame(f);
    return { skip: function () { stop = true; cancelAnimationFrame(raf); el.textContent = fmt(to); } };
  };

  // ------------------------------------------------------------------ small widgets
  K.btn = function (label, o) {
    o = o || {};
    var b = h('button.btn' + (o.kind ? '.' + o.kind.split(' ').join('.') : '') + (o.size ? '.' + o.size : ''), { type: 'button', disabled: o.disabled ? true : null, 'data-tut': o.tut || null, title: o.title || null },
      o.icon ? K.icon(o.icon, o.iconSize || 16) : null, label);
    if (o.onClick) b.addEventListener('click', function (e) { if (b.disabled || b.getAttribute('aria-disabled') === 'true') return; K.click(); o.onClick(e); });
    return b;
  };
  K.fishChip = function (n, cls) { return h('span.chip.' + (cls || 'gold'), K.icon('fish', 14), h('span.num', String(n))); };
  K.screenHead = function (title, sub, right) {
    return h('div.hdr', h('div', h('h1.screen-title', title), sub ? h('p.screen-sub', sub) : null), right ? h('div.row.gap-s', right) : null);
  };
  K.mini = function (cardLike, o) {
    // mini card via the shared renderer if available
    return K.cardEl(cardLike, Object.assign({ size: 'mini' }, o));
  };
  K.cardEl = function (cardLike, o) {
    o = o || {};
    try {
      if (SB.ui.card && SB.ui.card !== K.cardEl) {
        var el = SB.ui.card(cardLike, o);
        if (el && el.nodeType) return el;
      }
    } catch (e) { if (window.console) console.warn('card render failed', e); }
    // fallback: tiny chip so screens never break
    var d = K.effective(cardLike) || {};
    return h('div.card.sz-mini.clan-' + (d.clan || 'neutral'), h('div.c-head', h('span.c-name', d.name || '?')), h('div.c-text', d.text || ''));
  };
  // card tap -> detail dialog (large card + optional extra content)
  K.inspectCard = function (cardLike, extra) {
    var big = K.cardEl(cardLike, { size: 'detail', detail: true });
    var b = h('div.row.gap-l.wrap', { style: 'justify-content:center;align-items:flex-start' }, big, extra || null);
    return K.dialog({ title: K.cardName(cardLike), body: b, wide: !!extra });
  };

  K.relicIcon = function (r, px) {
    var def = typeof r === 'string' ? K.relic(r) : (K.relic(r.id) || r);
    var rar = def && def.rarity || 'common';
    var b = h('button.relic-ico', { type: 'button', style: '--rar:' + K.rarityColor(rar), 'aria-label': def && def.name || 'Relic' });
    var letter = (def && def.name || '?').replace(/^(the|a)\s+/i, '').charAt(0).toUpperCase();
    var g = K.hasGlyph('relic') ? K.icon('relic', px || 20) : h('span.g', letter);
    b.appendChild(g);
    K.tip(b, function () { return def ? '<b style="color:var(--sunbeam)">' + K.esc(def.name) + '</b><br>' + K.esc(def.text || '') : ''; });
    b.addEventListener('click', function () { if (def) K.showRelic(def); });
    return b;
  };
  K.showRelic = function (def) {
    var rar = def.rarity || 'common';
    var body = h('div.col', { style: 'gap:8px' },
      h('div.row.gap-s.wrap', h('span.chip', { style: 'border-color:' + K.rarityColor(rar) + ';color:' + K.rarityColor(rar) }, K.cap(rar)), def.clan ? h('span.chip', K.clanIcon(def.clan, 12), K.clan(def.clan).name) : null, (def.tags || []).filter(function (t) { return t === 'heirloom'; }).map(function (t) { return h('span.chip.gold', 'Heirloom'); })),
      h('p', { style: 'font-size:calc(15px*var(--text-scale));line-height:1.4' }, def.text || ''),
      def.flavor ? h('p.dim', { style: 'font-style:italic' }, def.flavor) : null);
    return K.dialog({ title: def.name, body: body, sheet: true });
  };

  // elder cat speech bubble (tutorial, story)
  K.elderCat = function (scale) { return K.cat('elder_cat', { scale: scale || 3 }); };

  // ------------------------------------------------------------------ generic procedural scene painter helpers (story panels, event vignettes)
  K.rngFor = function (seedStr) {
    var a = K.hash(seedStr) || 1;
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };


  // ------------------------------------------------------------------ screen registration with an error card instead of a blank page
  // K.register('map', {mount(root, params), unmount()}). root is the <section class="screen"> made by SB.ui.go.
  K.register = function (name, def) {
    var wrapped = {
      mount: function (root, params) {
        root.classList.add('c4screen');
        try { def.mount(root, params || {}); }
        catch (e) {
          if (window.console) console.error('[screen ' + name + ']', e);
          try { if (def.unmount) def.unmount(); } catch (e2) { /* ignore */ }
          K.clear(root);
          root.appendChild(h('div.sc', h('div.inner.narrow', h('div.panel.pad.col', { style: 'margin-top:40px' },
            h('h2.screen-title', { style: 'font-size:20px;color:var(--danger)' }, 'This screen tripped over a toy'),
            h('p.dim', name + ': ' + (e && e.message || e)),
            h('div.row.gap-s.wrap', h('button.btn', { type: 'button', on: { click: function () { SB.ui.flow.toTitle(); } } }, 'Back to title'),
              SB.ui.flow && SB.ui.flow.run ? h('button.btn.alt', { type: 'button', on: { click: function () { SB.ui.flow.toMap(); } } }, 'Try the map') : null)))));
        }
      },
      unmount: function () { try { if (def.unmount) def.unmount(); } catch (e) { if (window.console) console.warn('[unmount ' + name + ']', e); } }
    };
    SB.ui.screens[name] = wrapped;
    return wrapped;
  };
  // standard scroller scaffold: returns the .inner element inside root
  K.scaffold = function (root, cls) {
    K.clear(root);
    var inner = h('div.inner' + (cls ? '.' + cls.split(' ').join('.') : ''));
    root.appendChild(h('div.sc', inner));
    return inner;
  };

  K.vibrate = function (ms) { try { if (navigator.vibrate && !K.reduced()) navigator.vibrate(ms); } catch (e) { /* ignore */ } };
})();
