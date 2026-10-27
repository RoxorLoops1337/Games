/* SUNBEAM SIEGE ui-core.js (agent C3). Defines SB.ui: screen router, DOM helpers, icons, card renderer,
 * tooltip, toast, modal, settings, responsive layout. Classic script, no deps. API documented in design/C3-ui-notes.md.
 * No em dashes anywhere. */
(function () {
  'use strict';
  window.SB = window.SB || {};
  var ui = SB.ui = SB.ui || {};

  // ------------------------------------------------------------------ tiny helpers
  function isNode(x) { return x && typeof x === 'object' && typeof x.nodeType === 'number'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hashStr(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function tryf(fn, dflt) { try { return fn(); } catch (e) { return dflt; } }
  ui.esc = esc; ui.clamp = clamp; ui.hash = hashStr;

  /** h('div.card#id', {class:'x', style:{}, onclick:fn, dataset:{}, attrs}, child, child...) -> element */
  function h(tag, props) {
    var m = String(tag || 'div').match(/^([a-zA-Z0-9]*)((?:[.#][\w-]+)*)$/) || [0, 'div', ''];
    var el = document.createElement(m[1] || 'div');
    (m[2].match(/[.#][\w-]+/g) || []).forEach(function (t) { if (t[0] === '.') el.classList.add(t.slice(1)); else el.id = t.slice(1); });
    var start = 1;
    if (props && typeof props === 'object' && !isNode(props) && !Array.isArray(props)) {
      start = 2;
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v == null || v === false) return;
        if (k === 'class' || k === 'className') String(v).split(/\s+/).forEach(function (c) { if (c) el.classList.add(c); });
        else if (k === 'style') { if (typeof v === 'string') el.style.cssText += v; else Object.keys(v).forEach(function (s) { if (s.indexOf('--') === 0) el.style.setProperty(s, v[s]); else el.style[s] = v[s]; }); }
        else if (k === 'dataset') Object.keys(v).forEach(function (d) { el.dataset[d] = v[d]; });
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      });
    }
    function add(c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) c.forEach(add);
      else if (isNode(c)) el.appendChild(c);
      else el.appendChild(document.createTextNode(String(c)));
    }
    for (var i = start; i < arguments.length; i++) add(arguments[i]);
    return el;
  }
  ui.h = h;
  ui.clear = function (el) { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  ui.$ = function (sel, root) { return (root || document).querySelector(sel); };
  ui.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  // ------------------------------------------------------------------ settings
  var SKEY = 'nl_settings';
  var DEFAULTS = { textSize: 'm', reduceMotion: null, highContrast: false, cbIcons: false, shake: 1, dmgNumbers: true, fast: 1,
    confirmEndTurn: true, autoEnd: false, leftHanded: false, showKeys: true };
  var settings = {}, listeners = [];
  function loadSettings() {
    var saved = {};
    tryf(function () { saved = JSON.parse(localStorage.getItem(SKEY) || '{}') || {}; });
    settings = {};
    Object.keys(DEFAULTS).forEach(function (k) { settings[k] = saved[k] !== undefined ? saved[k] : DEFAULTS[k]; });
    if (settings.reduceMotion === null) settings.reduceMotion = !!tryf(function () { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }, false);
  }
  function applySettings() {
    var c = document.documentElement.classList;
    ['text-xs', 'text-s', 'text-m', 'text-l', 'text-xl'].forEach(function (k) { c.remove(k); });
    c.add('text-' + settings.textSize);
    c.toggle('reduce-motion', !!settings.reduceMotion);
    c.toggle('motion-ok', !settings.reduceMotion);
    c.toggle('high-contrast', !!settings.highContrast);
    c.toggle('cb-icons', !!settings.cbIcons);
    c.toggle('left-handed', !!settings.leftHanded);
  }
  ui.settings = {
    get: function (k) { return settings[k]; },
    all: function () { return Object.assign({}, settings); },
    set: function (k, v) {
      settings[k] = v;
      tryf(function () { localStorage.setItem(SKEY, JSON.stringify(settings)); });
      applySettings();
      listeners.forEach(function (fn) { tryf(function () { fn(k, v, settings); }); });
    },
    onChange: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; },
    defaults: DEFAULTS,
    reset: function () { tryf(function () { localStorage.removeItem(SKEY); }); loadSettings(); applySettings(); listeners.forEach(function (fn) { tryf(function () { fn(null, null, settings); }); }); }
  };
  /** Animation speed multiplier (1, 2, 3). Reduce motion also shortens everything. */
  ui.speed = function () { return Math.max(1, +settings.fast || 1) * (settings.reduceMotion ? 1.5 : 1); };
  ui.reduced = function () { return !!settings.reduceMotion; };
  /** Promise that resolves after ms scaled by the speed setting. */
  ui.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, Math.max(0, ms / ui.speed())); }); };

  // ------------------------------------------------------------------ layout / responsive
  var resizeFns = [];
  ui.layout = function () {
    var w = window.innerWidth, hh = window.innerHeight;
    var phone = (w <= 720 && hh > w * 0.9) || (w <= 900 && hh > w * 1.15); // portrait-ish narrow
    return { w: w, h: hh, mode: phone ? 'phone' : 'desktop', touch: document.documentElement.classList.contains('touch'), short: hh < 560 };
  };
  ui.onResize = function (fn) { resizeFns.push(fn); return function () { resizeFns = resizeFns.filter(function (f) { return f !== fn; }); }; };
  function applyLayout() {
    var L = ui.layout(), c = document.documentElement.classList;
    c.toggle('phone', L.mode === 'phone'); c.toggle('desktop', L.mode === 'desktop'); c.toggle('short', L.short);
    document.documentElement.style.setProperty('--vh', (window.innerHeight * 0.01) + 'px');
    resizeFns.forEach(function (fn) { tryf(function () { fn(L); }); });
  }
  var rzTimer = 0;
  window.addEventListener('resize', function () { clearTimeout(rzTimer); rzTimer = setTimeout(applyLayout, 60); });
  window.addEventListener('orientationchange', function () { setTimeout(applyLayout, 120); });

  // ------------------------------------------------------------------ icons
  // 24x24 viewBox. Inner markup strings, drawn with currentColor. Unknown names fall back to a lettered glyph.
  var P = function (d, extra) { return '<path d="' + d + '"' + (extra || '') + '/>'; };
  var ICONS = {
    heart: P('M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z'),
    sword: P('M19.5 3.5l1 1-1 5.5-9 9-2.5-2.5 9-9zM6.5 14l3.5 3.5-1.6 1.6-.9-.9-2.3 2.3-1.7-1.7 2.3-2.3-.9-.9z'),
    shield: P('M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z'),
    paw: '<circle cx="6.5" cy="10" r="2.2"/><circle cx="10.5" cy="6" r="2.3"/><circle cx="15.5" cy="6" r="2.3"/><circle cx="19" cy="10" r="2.2"/>' + P('M12.7 11c-3.6 0-6.4 3.1-6.4 5.6 0 1.9 1.7 2.5 3 2.2 1-.2 2-.6 3.4-.6s2.4.4 3.4.6c1.3.3 3-.3 3-2.2 0-2.5-2.8-5.6-6.4-5.6z'),
    claw: P('M5 3c2.4 5 3.2 11 2 18C4 15 3 8 5 3zM11.5 3c2.4 5 3.2 11 2 18-3-6-4-13-2-18zM18 3c2.4 5 3.2 11 2 18-3-6-4-13-2-18z'),
    flame: P('M12 2c.9 4 5.2 6 5.2 11a5.2 5.2 0 0 1-10.4 0c0-2.2 1-3.6 2.2-4.6.1 2 .9 3 2 3.2C10.3 7 10.4 4.8 12 2z'),
    moon: P('M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z'),
    box: P('M3 7.5L12 3.5l9 4v9.5l-9 4-9-4z') + '<path d="M3 7.5l9 4 9-4M12 11.5V21" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="1.4"/>',
    spiral: '<path d="M12 12m0 0a1.5 1.5 0 1 1 3 0 3.5 3.5 0 1 1-7 0 5.5 5.5 0 1 1 11 0 7.5 7.5 0 1 1-15 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    bolt: P('M13.5 2L4.5 14h6l-1.5 8 10.5-13h-6.5z'),
    fish: P('M2 12c3-5 8-6.5 12-4.5L18.5 5v14L14 16.5C10 18.5 5 17 2 12z') + '<circle cx="8" cy="11" r="1" fill="rgba(0,0,0,.6)"/>',
    crown: P('M3 18.5L2 7l5 4 5-7 5 7 5-4-1 11.5z'),
    skull: P('M12 2a8 8 0 0 0-8 8c0 3 1.5 4.5 3 5.5V20h10v-4.5c1.5-1 3-2.5 3-5.5a8 8 0 0 0-8-8zM9 9.4a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8zm6 0a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8z', ' fill-rule="evenodd"'),
    up: P('M12 3l8.5 9.5H15V21H9v-8.5H3.5z'),
    down: P('M12 21l-8.5-9.5H9V3h6v8.5h5.5z'),
    plus: P('M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z'),
    leaf: P('M20.5 3.5C10 3.5 4 9 4 15.5c0 2.8 1.9 4.8 4.6 4.8C15 20.3 20.5 14 20.5 3.5z') + '<path d="M4 20.5L13 11" fill="none" stroke="rgba(0,0,0,.4)" stroke-width="1.4"/>',
    sun: '<circle cx="12" cy="12" r="5"/>' + P('M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1', ' stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"'),
    umbrella: P('M12 3a9.5 9.5 0 0 1 9.5 9.5h-19A9.5 9.5 0 0 1 12 3z') + P('M11 12.5h2V18a2.2 2.2 0 1 1-4.4 0h1.6a.6.6 0 0 0 1.2 0z'),
    zzz: P('M4 5h8L4 13h8M14 12h6.5L14 18.5h6.5', ' fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"'),
    cloud: '<circle cx="8" cy="14" r="4.5"/><circle cx="14" cy="11.5" r="5.5"/><circle cx="18" cy="15" r="3.5"/><rect x="6" y="14" width="13" height="4.5"/>',
    clock: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.4"/>' + P('M12 6.5V12l3.5 2', ' fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"'),
    star: P('M12 2l3 6.8 7.2.7-5.4 4.8 1.6 7.2L12 17.8 5.6 21.5l1.6-7.2L1.8 9.5 9 8.8z'),
    eye: P('M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z') + '<circle cx="12" cy="12" r="3" fill="rgba(0,0,0,.6)"/>',
    lock: P('M6 10V8a6 6 0 0 1 12 0v2h1.5v11h-15V10zm2.5 0h7V8a3.5 3.5 0 0 0-7 0z', ' fill-rule="evenodd"'),
    menu: P('M3 6h18M3 12h18M3 18h18', ' stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"'),
    x: P('M5 5l14 14M19 5L5 19', ' stroke="currentColor" stroke-width="3.2" stroke-linecap="round" fill="none"'),
    check: P('M4 12.5l5 5L20 6.5', ' stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" fill="none"'),
    book: P('M3 5h2.5M8 5h13M3 12h2.5M8 12h13M3 19h2.5M8 19h13', ' stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"'),
    cards: P('M7 3h10a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 17 21H7a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 7 3z') + '<path d="M2.5 6v13M21.5 6v13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    gear: P('M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM10.5 2h3l.6 2.6 2.1 1 2.3-1.4 2.1 2.1-1.4 2.3 1 2.1 2.6.6v3l-2.6.6-1 2.1 1.4 2.3-2.1 2.1-2.3-1.4-2.1 1-.6 2.6h-3l-.6-2.6-2.1-1-2.3 1.4-2.1-2.1 1.4-2.3-1-2.1L2 13.5v-3l2.6-.6 1-2.1-1.4-2.3 2.1-2.1 2.3 1.4 2.1-1 .6-2.6z', ' fill-rule="evenodd"'),
    flag: P('M5 21V3h2v2h12l-2.5 4.5L19 14H7v7z'),
    stairs: P('M3 21v-4h4v-4h4V9h4V5h6v16z'),
    chevron: P('M5 15l7-7 7 7', ' fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"'),
    drip: P('M12 2.5c3 4.5 6 8 6 11.5a6 6 0 0 1-12 0c0-3.5 3-7 6-11.5z'),
    ghost: P('M12 2.5a7.5 7.5 0 0 0-7.5 7.5V21l2.6-2 2.4 2 2.5-2 2.5 2 2.4-2 2.6 2V10A7.5 7.5 0 0 0 12 2.5zM9.3 8.6a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm5.4 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z', ' fill-rule="evenodd"'),
    target: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="12" r="3.2"/>' + P('M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5', ' stroke="currentColor" stroke-width="2.2" fill="none"'),
    swirl: P('M12 4a8 8 0 1 0 8 8 5 5 0 1 0-5 5 3 3 0 1 0-3-3', ' fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"'),
    yarn: '<circle cx="12" cy="12" r="9"/>' + P('M4 9c5 2 11 2 16 0M3.5 13c6 2.5 11 2.5 17 0M6 18c4 1.5 8 1.5 12 0M8 5c2 4 2 10 0 14', ' fill="none" stroke="rgba(0,0,0,.4)" stroke-width="1.3"'),
    hook: P('M8 3v10a4 4 0 1 0 8 0v-2', ' fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"'),
    bell: P('M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6zM10 19a2 2 0 0 0 4 0z'),
    dice: P('M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 7.5a1.5 1.5 0 1 0 0 .01zM16 16.5a1.5 1.5 0 1 0 0 .01zM12 12a1.5 1.5 0 1 0 0 .01z', ' fill-rule="evenodd"'),
    toy: '<circle cx="12" cy="12" r="8"/>' + P('M5 9c4 2 10 2 14 0M5 15c4-2 10-2 14 0', ' fill="none" stroke="rgba(0,0,0,.4)" stroke-width="1.3"'),
    help: '<circle cx="12" cy="12" r="10"/><text x="12" y="17.2" text-anchor="middle" font-size="14" font-weight="900" fill="#140f26" font-family="Arial Black,Arial,sans-serif">?</text>'
  };
  // glossary icon id -> primitive above (icons from SB.data.glossary use many bespoke ids)
  var ALIAS = {
    'sword': 'sword', 'up-arrow': 'up', 'down-arrow': 'down', 'question': 'help', 'sun-heart': 'sun', 'clock-moon': 'moon', 'z-toggle': 'zzz', 'closed-eye': 'zzz', 'moon-z': 'zzz',
    'purr-heart': 'heart', 'warm-heart': 'heart', 'heart-house': 'heart', 'triple-claw': 'claw', 'double-claw': 'claw', 'gouge': 'claw', 'gouge-slot': 'claw',
    'stairs': 'stairs', 'chevron-up': 'chevron', 'drip-skull': 'drip', 'plus-ring': 'plus', 'frown-drop': 'drip', 'puddle': 'drip', 'yarn-ball': 'yarn', 'swirl': 'swirl',
    'crosshair': 'target', 'target-paw': 'target', 'peek-box': 'box', 'flat-box': 'box', 'swap-box': 'box', 'ghost-fur': 'ghost', 'ghost': 'ghost', 'dot-glow': 'target',
    'leaf-burst': 'leaf', 'cloud': 'cloud', 'umbrella': 'umbrella', 'tumbleweed': 'yarn', 'big-pile': 'paw', 'cat-pile': 'paw', 'twin-cat': 'paw', 'small-cat': 'paw', 'big-cat': 'paw', 'flat-cat': 'paw',
    'stretch-cat': 'paw', 'nine-pips': 'paw', 'paw-minus': 'paw', 'paw-stamp': 'paw', 'bait-fish': 'fish', 'whisker': 'paw', 'spiky-tail': 'flame', 'spark-eye': 'bolt', 'angry-brow': 'flame',
    'fang-mouth': 'skull', 'wisp': 'ghost', 'ash-card': 'flame', 'phoenix-paw': 'flame', 'leap': 'up', 'kneading-paws': 'paw', 'falling-vase': 'down', 'broken-vase': 'down',
    'alarm-bang': 'bell', 'bell': 'bell', 'collar': 'bell', 'crown': 'crown', 'streak': 'bolt', 'moon-wave': 'moon', 'tick-clock': 'clock', 'sunset': 'sun', 'sun-ray': 'sun',
    'wall-paws': 'shield', 'wall-climb': 'up', 'sneak-feet': 'paw', 'anchor': 'shield', 'anvil': 'shield', 'feather': 'leaf', 'lamp': 'sun', 'sparkle': 'star', 'broom': 'x', 'pin': 'star',
    'lock': 'lock', 'echo-rings': 'target', 'ambush-eye': 'eye', 'owl-eye': 'eye', 'nose': 'eye', 'red-eyes': 'eye', 'dying-star': 'star', 'star': 'star', 'flap-door': 'box', 'garden-gate': 'stairs',
    'static-hair': 'bolt', 'bad-hair': 'bolt', 'leash': 'hook', 'hook': 'hook', 'zzz': 'zzz', 'fork-arrow': 'up', 'grow-arrow': 'up', 'tick-bug': 'skull', 'cracked-pot': 'shield', 'bloody-paw': 'paw',
    'soap': 'drip', 'wings': 'up', 'flame': 'flame', 'shield': 'shield', 'claw': 'claw', 'heart': 'heart', 'bolt': 'bolt', 'fish': 'fish', 'skull': 'skull', 'plus': 'plus', 'paw': 'paw', 'box': 'box',
    'spiral': 'spiral', 'crescent': 'moon', 'leaf': 'leaf', 'door': 'stairs', 'hand': 'paw', 'attack': 'claw', 'flee': 'stairs'
  };
  ui.icons = ICONS; ui.iconAlias = ALIAS;
  var STATUS_TONE = { buff: 'good', debuff: 'bad', neutral: 'neutral' };
  /** icon markup string (svg). name may be a glossary icon id, a primitive, or free text (fallback letter). */
  ui.iconSvg = function (name, fallbackLetter) {
    var key = ICONS[name] ? name : (ALIAS[name] || null);
    var inner = key ? ICONS[key] : null;
    if (!inner) {
      var L = (fallbackLetter || String(name || '?').replace(/[^a-zA-Z0-9]/g, '').charAt(0) || '?').toUpperCase();
      inner = '<circle cx="12" cy="12" r="10.5" fill="currentColor" opacity=".35"/><text x="12" y="16.6" text-anchor="middle" font-size="13" font-weight="900" fill="currentColor" font-family="Arial Black,Arial,sans-serif">' + esc(L) + '</text>';
    }
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + inner + '</svg>';
  };
  // pixel icon set from SB.gfx.icons (B20) is preferred when it has the name; vector set above is the fallback
  var PXMAP = { sword: 'atk', heart: 'hp', bolt: 'zoomies', sun: 'warmth', leaf: 'nip', claw: 'attack', flame: 'sunbeam', moon: 'witching', stairs: 'climb', up: 'up_arrow', down: 'down_arrow',
    intent_attack: 'attack', intent_multi: 'multi_attack', intent_climb: 'climb', intent_defend: 'defend', intent_buff: 'buff', intent_debuff: 'debuff', intent_summon: 'summon', intent_sleep: 'sleep', intent_sunbeam: 'sunbeam', intent_unknown: 'unknown', intent_special: 'unknown' };
  ui.pxName = function (name) {
    var gi = SB.gfx && SB.gfx.icons; if (!gi || !gi.names || !name) return null;
    if (gi.names.indexOf(name) >= 0) return name;
    var m = PXMAP[name]; return m && gi.names.indexOf(m) >= 0 ? m : null;
  };
  /** icon element: ui.icon('claw', {size:14|'1.2em', cls:'bad', letter:'X', title:'', vec:true to force vector}) */
  ui.icon = function (name, o) {
    o = o || {};
    var el = h('span.ico', { 'aria-hidden': 'true' });
    if (o.size) el.style.setProperty('--s', typeof o.size === 'number' ? o.size + 'px' : o.size);
    if (o.cls) String(o.cls).split(' ').forEach(function (c) { if (c) el.classList.add(c); });
    var px = o.vec ? null : ui.pxName(name);
    if (px) { el.classList.add('px'); el.innerHTML = tryf(function () { return SB.gfx.icons.svg(px, 1, { cb: !!settings.cbIcons && /^(claws|purr|fluff|rested|hidden|bristle|frenzy|rage|wet|scared|dizzy|frazzled|hiss|yarn|marked|hairball)/.test(px) }); }, '') || ui.iconSvg(name, o.letter); }
    else el.innerHTML = ui.iconSvg(name, o.letter);
    if (o.title) { el.title = o.title; el.removeAttribute('aria-hidden'); el.setAttribute('role', 'img'); el.setAttribute('aria-label', o.title); }
    return el;
  };

  // ------------------------------------------------------------------ glossary and keyword formatting
  ui.gl = function (ref) {
    if (!ref) return null;
    var idx = SB.data && SB.data.glossaryIndex;
    if (!idx) return null;
    return idx[String(ref).toLowerCase()] || idx[String(ref).toLowerCase().replace(/[\s-]+/g, '_')] || null;
  };
  ui.statusTone = function (ref) { var g = ui.gl(ref); return (g && g.tone) || 'neutral'; };
  ui.statusIcon = function (ref) { var g = ui.gl(ref); return g ? g.icon : ref; };
  var kwRe = null, kwMap = null;
  function buildKw() {
    kwMap = {}; var names = [];
    ((SB.data && SB.data.glossary) || []).forEach(function (e) {
      if (['keyword', 'status', 'twist', 'resource'].indexOf(e.category) < 0) return;
      if (['fish', 'mischief_rank', 'whisker_xp', 'lives_pips', 'dusk'].indexOf(e.ref) >= 0) return;
      kwMap[e.name] = e; names.push(e.name);
    });
    names.sort(function (a, b) { return b.length - a.length; });
    kwRe = names.length ? new RegExp('\\b(' + names.map(function (n) { return n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')\\b', 'g') : null;
  }
  /** Escape rules text and wrap glossary terms in <b class="kw" data-gl="ref">. Returns an HTML string. */
  ui.fmt = function (text) {
    if (kwRe === null && kwMap === null) buildKw();
    var s = esc(text);
    if (!kwRe) return s;
    return s.replace(kwRe, function (m) {
      var e = kwMap[m]; if (!e) return m;
      return '<b class="kw t-' + (e.tone === 'buff' ? 'buff' : e.tone === 'debuff' ? 'debuff' : 'neutral') + '" data-gl="' + e.ref + '" tabindex="0">' + m + '</b>';
    });
  };

  // ------------------------------------------------------------------ tooltip
  var tipEl = null, tipFor = null, tipTimer = 0;
  function ensureTip() { if (!tipEl) { tipEl = h('div#sb-tooltip', { role: 'tooltip' }); document.body.appendChild(tipEl); } return tipEl; }
  function tipContent(c) {
    if (isNode(c)) return c;
    if (typeof c === 'string') {
      var g = ui.gl(c);
      if (g && c.indexOf(' ') < 0) c = g; else return h('div.tt-s', c);
    }
    if (c && c.ref !== undefined && c.tooltip !== undefined) { // glossary entry
      return h('div', {},
        h('div.tt-h', {}, ui.icon(ui.pxName(c.ref) ? c.ref : c.icon, { size: '1.1em', cls: STATUS_TONE[c.tone] || '' }), c.name, h('span.tt-cat', {}, c.category)),
        h('div.tt-s', {}, c.tooltip), c.text ? h('div.tt-t', {}, c.text) : null, c.aside ? h('div.tt-a', {}, c.aside) : null);
    }
    if (c && typeof c === 'object') { // {title, icon, text, sub, aside, tone}
      return h('div', {}, c.title ? h('div.tt-h', {}, c.icon ? ui.icon(c.icon, { size: '1.1em', cls: STATUS_TONE[c.tone] || '' }) : null, c.title, c.cat ? h('span.tt-cat', {}, c.cat) : null) : null,
        c.text ? h('div.tt-s', {}, c.text) : null, c.sub ? h('div.tt-t', {}, c.sub) : null, c.aside ? h('div.tt-a', {}, c.aside) : null);
    }
    return h('div.tt-s', String(c));
  }
  /** ui.tooltip('claws', anchorEl) shows a glossary tooltip. ui.tooltip({title,text,sub,icon}, anchorEl) shows custom. */
  ui.tooltip = function (content, anchor) {
    var t = ensureTip(); clearTimeout(tipTimer);
    ui.clear(t).appendChild(tipContent(content));
    tipFor = anchor || null;
    t.style.left = '0px'; t.style.top = '0px';
    t.classList.add('on');
    var r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: window.innerWidth / 2, right: window.innerWidth / 2, top: 60, bottom: 60, width: 0, height: 0 };
    var tw = t.offsetWidth, th = t.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    var x = r.left + r.width / 2 - tw / 2, y = r.top - th - 8;
    if (y < 6) y = r.bottom + 8;
    if (y + th > vh - 6) y = Math.max(6, vh - th - 6);
    x = clamp(x, 6, vw - tw - 6);
    t.style.left = Math.round(x) + 'px'; t.style.top = Math.round(y) + 'px';
  };
  ui.tooltip.hide = function (anchor) {
    if (anchor && tipFor && anchor !== tipFor) return;
    if (tipEl) tipEl.classList.remove('on'); tipFor = null;
  };
  /** bind a tooltip to an element. content may be a function returning content. Hover, focus, and tap (touch) supported. */
  ui.tooltip.bind = function (el, content) {
    function show() { var c = typeof content === 'function' ? content() : content; if (c) ui.tooltip(c, el); }
    el.addEventListener('mouseenter', show);
    el.addEventListener('mouseleave', function () { ui.tooltip.hide(el); });
    el.addEventListener('focus', show);
    el.addEventListener('blur', function () { ui.tooltip.hide(el); });
    el.__tip = true;
    return el;
  };
  // delegated tooltips for [data-gl] (glossary) and [data-tip] (plain text)
  document.addEventListener('mouseover', function (e) {
    var t = e.target.closest && e.target.closest('[data-gl],[data-tip]');
    if (!t || t.__tip) return;
    if (t.dataset.gl) ui.tooltip(t.dataset.gl, t); else ui.tooltip(t.dataset.tip, t);
  });
  document.addEventListener('mouseout', function (e) {
    var t = e.target.closest && e.target.closest('[data-gl],[data-tip]');
    if (t && !t.__tip) ui.tooltip.hide(t);
  });
  document.addEventListener('focusin', function (e) { var t = e.target.closest && e.target.closest('[data-gl]'); if (t && !t.__tip) ui.tooltip(t.dataset.gl, t); });
  document.addEventListener('focusout', function (e) { var t = e.target.closest && e.target.closest('[data-gl]'); if (t && !t.__tip) ui.tooltip.hide(t); });
  document.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse') { return; }
    var t = e.target.closest && e.target.closest('[data-gl],[data-tip]');
    if (t && !t.__tip) { if (t.dataset.gl) ui.tooltip(t.dataset.gl, t); else ui.tooltip(t.dataset.tip, t); clearTimeout(tipTimer); tipTimer = setTimeout(function () { ui.tooltip.hide(); }, 3200); }
    else if (!(e.target.closest && e.target.closest('#sb-tooltip'))) ui.tooltip.hide();
  }, true);

  // ------------------------------------------------------------------ toast
  var toastBox = null;
  /** ui.toast('text', {tone:'bad'|'good', ms:2200}) */
  ui.toast = function (msg, o) {
    o = o || {};
    if (!toastBox) { toastBox = h('div#sb-toasts', { 'aria-live': 'polite' }); document.body.appendChild(toastBox); }
    var t = h('div.sb-toast' + (o.tone ? '.' + o.tone : ''), {}, msg);
    toastBox.appendChild(t);
    while (toastBox.children.length > 3) toastBox.removeChild(toastBox.firstChild);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 260); }, (o.ms || 2200));
    return t;
  };

  // ------------------------------------------------------------------ modal
  var modals = [];
  /** ui.modal(contentNode|html, {title, wide, sheet, buttons:[{label, cls, onClick, close:true}], closable:true, onClose}) -> {el, body, close()} */
  ui.modal = function (content, o) {
    o = o || {};
    var closed = false, prevFocus = document.activeElement;
    var body = h('div.modal-b', {}, typeof content === 'string' ? h('div', { html: content }) : content);
    var head = (o.title || o.closable !== false) ? h('div.modal-h', {}, h('h2', {}, o.title || ''),
      o.closable === false ? null : h('button.btn.alt.sm.icon', { 'aria-label': 'Close', onclick: function () { api.close(); } }, ui.icon('x', { size: 16 }))) : null;
    var foot = null;
    if (o.buttons && o.buttons.length) {
      foot = h('div.modal-f', {}, o.buttons.map(function (b) {
        return h('button.btn' + (b.cls ? '.' + b.cls.split(' ').join('.') : ''), { onclick: function () { if (b.onClick) b.onClick(api); if (b.close !== false) api.close(b.value); } }, b.label);
      }));
    }
    var box = h('div.modal' + (o.wide ? '.wide' : '') + (o.sheet ? '.sheet' : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title || 'Dialog' }, head, body, foot);
    var back = h('div.modal-back' + (o.sheet ? '.sheet-back' : ''), { onpointerdown: function (e) { if (e.target === back && o.closable !== false) api.close(); } }, box);
    var api = {
      el: back, body: body, box: box,
      close: function (val) {
        if (closed) return; closed = true;
        modals = modals.filter(function (m) { return m !== api; });
        if (back.parentNode) back.parentNode.removeChild(back);
        if (prevFocus && prevFocus.focus && document.contains(prevFocus)) tryf(function () { prevFocus.focus({ preventScroll: true }); });
        if (o.onClose) tryf(function () { o.onClose(val); });
      },
      closable: o.closable !== false
    };
    modals.push(api);
    document.body.appendChild(back);
    var first = box.querySelector('[autofocus],.btn:not(.icon)') || box.querySelector('button');
    if (first && !o.noFocus) tryf(function () { first.focus({ preventScroll: true }); });
    return api;
  };
  ui.modal.top = function () { return modals[modals.length - 1] || null; };
  ui.modal.closeAll = function () { modals.slice().forEach(function (m) { m.close(); }); };
  ui.modal.count = function () { return modals.length; };
  /** ui.confirm({title, text, yes:'Do it', no:'Cancel', danger:true}) -> Promise<boolean> */
  ui.confirm = function (o) {
    return new Promise(function (res) {
      var done = false;
      function fin(v) { if (!done) { done = true; res(v); } }
      ui.modal(h('p', { style: 'margin:0;font-size:1.05em' }, o.text || ''), {
        title: o.title || 'Sure?', onClose: function () { fin(false); },
        buttons: [{ label: o.no || 'Cancel', cls: 'alt', onClick: function () { fin(false); } }, { label: o.yes || 'Yes', cls: o.danger ? 'danger' : '', onClick: function () { fin(true); } }]
      });
    });
  };
  // Escape closes the top closable modal. Capture phase so screens do not also react.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modals.length) {
      var m = modals[modals.length - 1];
      if (m.closable) { m.close(); e.stopPropagation(); e.preventDefault(); }
    }
  }, true);

  // ------------------------------------------------------------------ live region
  var live = null;
  /** Screen reader announcement (aria-live polite). */
  ui.announce = function (text) {
    if (!live) { live = h('div.vh#sb-live', { 'aria-live': 'polite', role: 'log' }); document.body.appendChild(live); }
    var d = h('div', {}, text); live.appendChild(d);
    while (live.children.length > 6) live.removeChild(live.firstChild);
  };

  // ------------------------------------------------------------------ press helper (tap / long press)
  /** ui.press(el, {tap:fn, long:fn, ms:350}) calls long() after a hold without moving, else tap() on release. */
  ui.press = function (el, o) {
    var timer = 0, sx = 0, sy = 0, fired = false, down = false;
    el.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      down = true; fired = false; sx = e.clientX; sy = e.clientY;
      if (o.long) timer = setTimeout(function () { fired = true; o.long(e); }, o.ms || 350);
    });
    el.addEventListener('pointermove', function (e) { if (down && Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 10) { clearTimeout(timer); down = false; } });
    el.addEventListener('pointerup', function (e) { clearTimeout(timer); if (down && !fired && o.tap) o.tap(e); down = false; });
    el.addEventListener('pointercancel', function () { clearTimeout(timer); down = false; });
    el.addEventListener('contextmenu', function (e) { if (o.long) e.preventDefault(); });
    return el;
  };

  // ------------------------------------------------------------------ screens
  ui.screens = ui.screens || {};
  ui.current = null;
  ui.history = [];
  var goHooks = [];
  ui.onGo = function (fn) { goHooks.push(fn); };
  ui.root = null;
  function ensureRoot() {
    if (ui.root && document.body.contains(ui.root)) return ui.root;
    ui.root = document.getElementById('app');
    if (!ui.root) { ui.root = h('div#app'); document.body.appendChild(ui.root); }
    return ui.root;
  }
  /** Switch screen. Unmounts the current, mounts screens[name] into a fresh <section class="screen" id="screen-NAME">. */
  ui.go = function (name, params) {
    var def = ui.screens[name];
    if (!def) { console.error('SB.ui.go: unknown screen ' + name); ui.toast('Missing screen: ' + name, { tone: 'bad' }); return null; }
    var root = ensureRoot();
    var prev = ui.current;
    ui.modal.closeAll(); ui.tooltip.hide();
    if (prev) {
      tryf(function () { prev.def.unmount && prev.def.unmount(); });
      if (prev.el.parentNode) prev.el.parentNode.removeChild(prev.el);
    }
    var el = h('section.screen#screen-' + name);
    root.appendChild(el);
    ui.current = { name: name, def: def, el: el, params: params || {} };
    ui.history.push(name); if (ui.history.length > 20) ui.history.shift();
    goHooks.forEach(function (fn) { tryf(function () { fn(name, params); }); });
    try { def.mount(el, params || {}); } catch (e) { console.error('mount ' + name, e); ui.toast('Screen error: ' + name, { tone: 'bad' }); }
    return el;
  };
  ui.register = function (name, def) { ui.screens[name] = def; return def; };

  // ------------------------------------------------------------------ card model + renderer
  var cardIndex = null;
  function findCardDef(id) {
    if (SB.content && SB.content.card) { var c = tryf(function () { return SB.content.card(id); }); if (c) return c; }
    if (!cardIndex) {
      cardIndex = {};
      Object.keys(SB.data || {}).forEach(function (k) {
        var arr = SB.data[k];
        if (Array.isArray(arr) && /^(cards|champions)/.test(k)) arr.forEach(function (c) { if (c && c.id) cardIndex[c.id] = c; });
      });
    }
    return cardIndex[id] || null;
  }
  ui.cardDef = findCardDef;
  /** Normalize anything card-like (id string, def, instance, hand entry {uid,card}, effective display card) into a flat model. */
  ui.cardModel = function (x, opts) {
    opts = opts || {};
    if (!x) return { id: '?', name: '???', type: 'spell', clan: 'neutral', rarity: 'common', cost: 0, text: '' };
    var inst = null, d = x;
    if (typeof x === 'string') d = findCardDef(x) || { id: x, name: x, text: '' };
    else if (x.card && typeof x.card === 'object' && !x.name) { inst = x; d = x.card; }
    else if (x.id && !x.name && (x.scratches !== undefined || x.knead !== undefined || x.lives !== undefined || x.uid !== undefined)) {
      inst = x;
      d = tryf(function () { return SB.cardInst && SB.cardInst.effective ? SB.cardInst.effective(x) : null; }) || findCardDef(x.id) || { id: x.id, name: x.id };
    } else if (x.id && x.name && x.scratches !== undefined && SB.cardInst && SB.cardInst.effective && !(x.champion && (x.champion.tiers || []).some(function (t) { return t && typeof t === 'object'; }))) {
      inst = x; d = tryf(function () { return SB.cardInst.effective(x); }) || x;
    }
    var st = d.stats || {};
    var lives = d.lives != null ? d.lives : (inst && inst.lives != null ? inst.lives : st.lives);
    var maxLives = d.maxLives != null ? d.maxLives : (inst && inst.maxLives != null ? inst.maxLives : (st.lives != null ? st.lives : lives));
    var base = findCardDef(d.id) || {};
    var m = {
      id: d.id, uid: (inst && inst.uid) || d.uid || (x && x.uid) || null, name: d.name || base.name || d.id,
      type: d.type || base.type || 'spell', clan: d.clan || base.clan || 'neutral', rarity: d.rarity || base.rarity || 'common',
      cost: d.cost != null ? d.cost : (base.cost != null ? base.cost : 0), baseCost: base.cost,
      power: d.power != null ? d.power : st.power, health: d.health != null ? d.health : st.health,
      lives: lives, maxLives: maxLives,
      text: d.text != null ? d.text : (base.text || ''), flavor: d.flavor || base.flavor || '', keywords: d.keywords || base.keywords || {},
      art: d.art || base.art || null, tags: d.tags || base.tags || [], size: d.size || st.size || 1,
      upgraded: !!(d.upgraded || (inst && inst.scratches && inst.scratches.length) || /\+$/.test(d.name || '')),
      xCost: d.cost === 'X' || d.xCost
    };
    if (m.rarity === 'basic' || m.rarity === 'starter') m.rarity = 'common';
    if (m.rarity === 'legendary') m.rarity = 'champion';
    if (m.type === 'champion') m.rarity = 'champion';
    if (m.clan === 'lap') m.clan = 'hearth';
    return m;
  };

  var TYPE_LABEL = { unit: 'Cat', champion: 'Champion', spell: 'Spell', toy: 'Toy', room: 'Room', box: 'Box', curse: 'Curse', treat: 'Treat' };
  var TYPE_ICON = { unit: 'paw', champion: 'crown', spell: 'star', toy: 'toy', room: 'box', box: 'box', curse: 'skull', treat: 'fish' };
  ui.cardTypeLabel = function (t) { return TYPE_LABEL[t] || t; };

  // genome resolution for cats
  ui.genome = function (art, id) {
    var pp = SB.gfx && SB.gfx.pawprint;
    if (!pp) return null;
    return tryf(function () {
      if (art && typeof art === 'object' && (art.body || art.fur || art.pattern) && !art.hint) return pp.normalize(art);
      if (art && art.genome) return typeof art.genome === 'string' ? pp.fromId(art.genome) : pp.normalize(art.genome);
      if (id && pp.registry && pp.registry[id]) return pp.registry[id];
      var hint = typeof art === 'string' ? art : (art && (art.hint || art.desc));
      if (hint) return pp.fromDescriptor(hint, hashStr(String(id || hint)));
      return pp.fromId(id || 'cat');
    }, null);
  };
  var CLAN_BG = { alley: '#5a2c1c', hearth: '#5a4220', moon: '#2a2f6a', mischief: '#17504f', neutral: '#3f3a52', pest: '#2f382f', curse: '#2f382f' };
  function paintArt(canvas, m) {
    var ctx = canvas.getContext('2d'); if (!ctx) return;
    var W = canvas.width, H = canvas.height;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = CLAN_BG[m.clan] || CLAN_BG.neutral; ctx.fillRect(0, 0, W, H);
    // dithered horizon band
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    for (var y = 0; y < H; y += 2) for (var x = (y / 2) % 2; x < W; x += 2) if (y > H * 0.55) ctx.fillRect(x, y, 1, 1);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, Math.floor(H * 0.78), W, H);
    var pp = SB.gfx && SB.gfx.pawprint;
    if ((m.type === 'unit' || m.type === 'champion') && pp) {
      var g = ui.genome(m.art, m.id);
      if (g) { tryf(function () { var fr = pp.frame(g, 'idle0'); var sc = Math.max(1, Math.floor(H / 36)); var w = 32 * sc * (g.scale || 1), hh = 32 * sc * (g.scale || 1); ctx.drawImage(fr, Math.round((W - w) / 2), Math.round(H * 0.95 - hh * 0.94), w, hh); }); return; }
    }
    // icon art for spells, toys, rooms
    var ik = TYPE_ICON[m.type] || 'star';
    if (m.type === 'spell') { var kws = Object.keys(m.keywords || {}); var tg = (m.tags || []); ik = tg.indexOf('attack') >= 0 ? 'claw' : tg.indexOf('heal') >= 0 ? 'heart' : tg.indexOf('draw') >= 0 ? 'cards' : tg.indexOf('block') >= 0 ? 'shield' : kws.indexOf('knock') >= 0 ? 'down' : 'star'; }
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48" fill="#fff">' + (ICONS[ik] || ICONS.star) + '</svg>';
    var img = new Image();
    img.onload = function () { ctx.globalAlpha = 0.9; var s = Math.floor(H * 0.8); ctx.drawImage(img, Math.round((W - s) / 2), Math.round((H - s) / 2), s, s); ctx.globalAlpha = 1; };
    img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg.replace(/fill="#fff"/, 'fill="' + ((ui.clanColors[m.clan] || ui.clanColors.neutral).light) + '"'));
  }
  ui.clanColors = {
    alley: { main: '#ff8a3d', dark: '#a8431a', light: '#ffc08a' }, hearth: { main: '#ffc65a', dark: '#a86a1a', light: '#ffe6a8' },
    moon: { main: '#7a8cff', dark: '#3a3f9e', light: '#c3ccff' }, mischief: { main: '#3fd6c0', dark: '#1f7a8a', light: '#ffa0dc' },
    neutral: { main: '#cfc8d8', dark: '#6e6680', light: '#ece8f2' }, pest: { main: '#8c9a8a', dark: '#3f4a40', light: '#c4cec2' }, curse: { main: '#8c9a8a', dark: '#3f4a40', light: '#c4cec2' }
  };
  ui.rarityColors = { common: '#b8b0c8', uncommon: '#5fb4ff', rare: '#ffcf4a', epic: '#d46bff', champion: '#ff5d6c', curse: '#6b7a68' };

  /**
   * ui.card(cardLike, opts) -> div.card
   * opts: size 'hand'|'mini'|'detail'|'reward'|'' ; playable, unaffordable, selected, flavor (bool), back (bool), compact, onClick, costTint
   */
  ui.card = function (x, opts) {
    opts = opts || {};
    var m = ui.cardModel(x, opts);
    var cls = 'card clan-' + m.clan + ' rar-' + (m.type === 'curse' ? 'curse' : m.rarity) + ' type-' + m.type +
      (opts.size ? ' sz-' + opts.size : '') + (m.upgraded ? ' upgraded' : '') + (opts.playable ? ' playable' : '') +
      (opts.unaffordable ? ' unaff' : '') + (opts.selected ? ' selected' : '') + (opts.back ? ' back' : '') + (opts.compact ? ' compact' : '');
    var el = h('div', { class: cls, role: 'button', tabindex: opts.noFocus ? null : '0', 'data-uid': m.uid || null, 'data-id': m.id || null });
    var name = m.name || '';
    var cost = m.xCost ? 'X' : (m.type === 'curse' && m.cost === 0 && /unplay/i.test(m.text) ? '' : m.cost);
    var costCls = 'c-cost' + (m.baseCost != null && typeof m.cost === 'number' && m.cost < m.baseCost ? ' less' : m.baseCost != null && typeof m.cost === 'number' && m.cost > m.baseCost ? ' more' : '');
    el.appendChild(h('div', { class: costCls, 'aria-label': 'Cost ' + cost }, String(cost)));
    el.appendChild(h('div.c-head', {}, h('div.c-name' + (name.length > 22 ? '.xlong' : name.length > 15 ? '.long' : ''), {}, name)));
    var art = h('div.c-art'); var cv = h('canvas', { width: 64, height: 40 }); art.appendChild(cv); el.appendChild(art);
    tryf(function () { paintArt(cv, m); });
    var rib = h('div.c-ribbon', {}, ui.icon(TYPE_ICON[m.type] || 'star', { size: '1em' }), TYPE_LABEL[m.type] || m.type);
    if (m.power != null || m.health != null) {
      rib.appendChild(h('span.sp'));
      if (m.power != null) rib.appendChild(h('span.c-stat.atk', { 'aria-label': 'Attack ' + m.power }, ui.icon('sword', { size: '.9em' }), String(m.power)));
      if (m.health != null) rib.appendChild(h('span.c-stat.hp', { 'aria-label': 'Health ' + m.health }, ui.icon('heart', { size: '.9em' }), String(m.health)));
    }
    el.appendChild(rib);
    var txt = h('div.c-text' + ((m.text || '').length > 95 ? '.t-xs' : (m.text || '').length > 62 ? '.t-sm' : ''));
    txt.innerHTML = ui.fmt(m.text || '');
    if ((opts.flavor || opts.size === 'detail') && m.flavor) txt.appendChild(h('span.c-flavor', {}, '“' + m.flavor + '”'));
    el.appendChild(txt);
    var foot = h('div.c-foot');
    if (m.lives != null && (m.type === 'unit' || m.type === 'champion')) {
      var ml = m.maxLives || m.lives, lv = h('span.c-lives', { 'aria-label': m.lives + ' of ' + ml + ' lives', title: 'Lives' });
      if (ml <= 5) for (var i = 0; i < ml; i++) lv.appendChild(h('i' + (i < m.lives ? '' : '.off')));
      else lv.appendChild(h('span', {}, '♥ ' + m.lives + '/' + ml));
      foot.appendChild(lv);
    } else foot.appendChild(h('span'));
    foot.appendChild(h('span.c-clan', {}, ui.icon(m.clan === 'alley' ? 'claw' : m.clan === 'hearth' ? 'flame' : m.clan === 'moon' ? 'moon' : m.clan === 'mischief' ? 'bolt' : 'paw', { size: '1em' }), m.clan));
    el.appendChild(foot);
    if (opts.onClick) el.addEventListener('click', function (e) { opts.onClick(e, m); });
    el.__model = m;
    return el;
  };
  /** card back element */
  ui.cardBack = function (o) { return ui.card({ id: 'back', name: '', type: 'spell', clan: 'neutral', rarity: 'common', cost: 0, text: '' }, Object.assign({ back: true, noFocus: true }, o || {})); };
  /** Full-size detail view of a card in a modal. */
  ui.cardDetail = function (x, o) {
    o = o || {};
    var big = ui.card(x, { size: 'detail', flavor: true, noFocus: true });
    var m = big.__model, extras = h('div', { style: 'display:flex;flex-direction:column;gap:6px;max-width:260px;min-width:150px;flex:1' });
    var seen = {};
    Object.keys(m.keywords || {}).forEach(function (k) {
      var g = ui.gl(k); if (!g || seen[g.ref]) return; seen[g.ref] = 1;
      extras.appendChild(h('div.panel', { style: 'padding:6px 8px' }, h('div.tt-h', { style: 'display:flex;gap:.4em;align-items:center;font-weight:700;color:var(--sunbeam)' }, ui.icon(g.icon, { size: '1.1em' }), g.name), h('div', { style: 'font-size:.9em;color:var(--ui-text-dim)' }, g.tooltip)));
    });
    var body = h('div', { style: 'display:flex;gap:14px;flex-wrap:wrap;justify-content:center;align-items:flex-start' }, big, extras);
    return ui.modal(body, { title: m.name, buttons: o.buttons || [{ label: 'Close', cls: 'alt' }] });
  };

  // ------------------------------------------------------------------ status helpers shared by UIs
  /** Normalize a statuses object ({id: n} or {id:{n|stacks|amount|duration}}) into [{id, n, name, icon, tone}] */
  ui.statusList = function (obj) {
    var out = [];
    Object.keys(obj || {}).forEach(function (k) {
      var v = obj[k], n = v;
      if (v && typeof v === 'object') n = v.n != null ? v.n : v.stacks != null ? v.stacks : v.amount != null ? v.amount : v.duration != null ? v.duration : v.value != null ? v.value : 1;
      if (!n && n !== true) return;
      var g = ui.gl(k);
      out.push({ id: k, n: n === true ? 1 : n, name: g ? g.name : k.replace(/_/g, ' '), icon: g ? g.icon : k, tone: g ? (g.tone || 'neutral') : 'neutral', gl: g });
    });
    return out;
  };
  ui.statusChip = function (s) {
    var tone = s.tone === 'buff' ? 'good' : s.tone === 'debuff' ? 'bad' : 'neutral';
    var el = h('span.st-chip.' + tone, { tabindex: '0', 'data-gl': s.gl ? s.gl.ref : null, 'data-tip': s.gl ? null : s.name, 'aria-label': s.name + ' ' + s.n },
      ui.icon(ui.pxName(s.id) ? s.id : s.icon, { size: '1.1em', letter: s.name.charAt(0) }), s.n > 1 || s.n === 0 ? h('b', {}, String(s.n)) : null);
    return el;
  };

  // ------------------------------------------------------------------ init
  loadSettings();
  tryf(function () { if (window.matchMedia('(pointer: coarse)').matches) document.documentElement.classList.add('touch'); });
  function init() { applySettings(); applyLayout(); ensureRoot(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  applySettings();
  ui.version = 1;
})();
