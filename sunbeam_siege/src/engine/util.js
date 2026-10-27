/* SUNBEAM SIEGE engine utilities (agent C1).
 * Classic script. Attaches SB.util. No Math.random anywhere in combat code: use SB.util.rng.
 */
(function () {
  'use strict';
  var root = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
  root.SB = root.SB || {};
  var SB = root.SB;
  var U = SB.util = SB.util || {};

  // ---- hashing and rng ----------------------------------------------------
  // xmur3 style string hash to a uint32.
  U.hash = function () {
    var str = Array.prototype.slice.call(arguments).map(function (x) { return String(x); }).join('|');
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
  };

  // mulberry32 returning a function; the raw state is readable and writable through getState / setState.
  U.mulberry32 = function (seed) {
    var s = (seed >>> 0);
    var f = function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.getState = function () { return s; };
    f.setState = function (v) { s = (v >>> 0); };
    return f;
  };

  // Rng object: next() in [0,1), int(n) in [0,n), pick(list) (draws only when n >= 2), shuffle(list) in place.
  U.makeRng = function (seed) {
    if (typeof seed !== 'number') seed = U.hash(seed);
    var m = U.mulberry32(seed);
    var r = {
      draws: 0,
      next: function () { r.draws++; return m(); },
      int: function (n) { if (n < 2) return 0; return Math.floor(r.next() * n); },
      pick: function (list) { if (!list || !list.length) return undefined; if (list.length === 1) return list[0]; return list[Math.floor(r.next() * list.length)]; },
      shuffle: function (list) {
        for (var i = list.length - 1; i > 0; i--) {
          var j = Math.floor(r.next() * (i + 1));
          var t = list[i]; list[i] = list[j]; list[j] = t;
        }
        return list;
      },
      getState: function () { return { s: m.getState(), draws: r.draws }; },
      setState: function (st) { m.setState(st.s); r.draws = st.draws || 0; }
    };
    return r;
  };

  // ---- generic helpers ----------------------------------------------------
  U.deepClone = function (o) {
    if (o === undefined) return undefined;
    return JSON.parse(JSON.stringify(o));
  };
  U.clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
  U.isObj = function (o) { return o !== null && typeof o === 'object' && !Array.isArray(o); };
  U.isNum = function (o) { return typeof o === 'number' && isFinite(o); };
  U.sum = function (arr, fn) { var t = 0; for (var i = 0; i < arr.length; i++) t += fn ? fn(arr[i], i) : arr[i]; return t; };
  U.uniq = function (arr) { var seen = {}, out = []; arr.forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } }); return out; };
  U.last = function (arr) { return arr[arr.length - 1]; };
  U.toArray = function (x) { return x === undefined || x === null ? [] : (Array.isArray(x) ? x : [x]); };
  U.cmp = function (a, op, b) {
    switch (op) {
      case '==': case '===': case undefined: return a === b || (typeof a !== 'object' && a == b);
      case '!=': case '!==': return !(a === b || (typeof a !== 'object' && a == b));
      case '<': return a < b;
      case '<=': return a <= b;
      case '>': return a > b;
      case '>=': return a >= b;
      default: return false;
    }
  };
  // Integer division that rounds down (also for negatives).
  U.floorDiv = function (a, b) { return Math.floor(a / b); };

  // Warn once per key. Collected into U.warnings so tests and validate can read them.
  U.warnings = U.warnings || {};
  U.warnOnce = function (key, msg) {
    if (U.warnings[key]) return false;
    U.warnings[key] = msg || key;
    if (U.quiet !== true && typeof console !== 'undefined' && console.warn) console.warn('[SB] ' + (msg || key));
    return true;
  };
  U.resetWarnings = function () { U.warnings = {}; };

  // Compact Title Case from snake_case, used for fallback names.
  U.titleCase = function (id) {
    return String(id || '').replace(/^(alley|hearth|moon|mischief|neutral|curse|token|pest)_/, '').split('_').map(function (w) {
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
  };
})();
