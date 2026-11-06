/* SUNBEAM SIEGE gfx: pixel icon set. Defines window.SB.gfx.icons.
 * Every icon is a 10x10 glyph, auto outlined to 12x12. Shape carries meaning, color backs it up.
 * With opts.cb (colorblind mode) a corner badge is added: buff = up triangle, debuff = down triangle,
 * neutral = square. opts.frame outlines with the A04 kind color (green buff, red debuff, amber neutral).
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  root.SB = root.SB || {}; SB.gfx = SB.gfx || {};

  var PAL = {
    w: '#f6ecd8', W: '#c9c0d6', r: '#ff5d6c', R: '#b13445', y: '#ffd95a', Y: '#c9962a', g: '#7be495', G: '#2f8a55',
    b: '#5fb4ff', B: '#2f66b0', p: '#ff8fb0', P: '#c04a78', v: '#b88cff', V: '#6a45b8', n: '#c99a62', N: '#7a5326',
    s: '#b7b0c8', S: '#6e6680', c: '#f0d3a3', m: '#ff8a3d', M: '#b5521c', t: '#4fd1c5', T: '#1f8078', k: '#1c1630', z: '#fff3b0'
  };
  var KIND = { buff: '#7be495', debuff: '#ff5d6c', neutral: '#ffb347' };

  // ---- glyph builder ----
  function Grid() { this.a = []; for (var i = 0; i < 100; i++) this.a.push('.'); }
  var G = Grid.prototype;
  G.p = function (x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < 10 && y < 10) this.a[y * 10 + x] = c; return this; };
  G.r = function (x, y, w, h, c) { for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) this.p(x + i, y + j, c); return this; };
  G.l = function (x0, y0, x1, y1, c) {
    var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx + dy;
    for (var n = 0; n < 40; n++) { this.p(x0, y0, c); if (x0 === x1 && y0 === y1) break; var e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
    return this;
  };
  G.d = function (cx, cy, rx, c, ry) {
    ry = ry || rx;
    for (var y = 0; y < 10; y++) for (var x = 0; x < 10; x++) { var dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; if (dx * dx + dy * dy <= 1) this.a[y * 10 + x] = c; }
    return this;
  };
  G.ring = function (cx, cy, rx, c, th) {
    th = th || 1;
    for (var y = 0; y < 10; y++) for (var x = 0; x < 10; x++) { var d = Math.sqrt((x + 0.5 - cx) * (x + 0.5 - cx) + (y + 0.5 - cy) * (y + 0.5 - cy)); if (d <= rx && d > rx - th) this.a[y * 10 + x] = c; }
    return this;
  };
  G.s = function (rows, ox, oy) {
    ox = ox || 0; oy = oy || 0;
    for (var j = 0; j < rows.length; j++) for (var i = 0; i < rows[j].length; i++) { var ch = rows[j][i]; if (ch !== '.' && ch !== ' ') this.p(ox + i, oy + j, ch); }
    return this;
  };
  function S(rows, ox, oy) { return function (g) { g.s(rows, ox, oy); }; }

  var HEART = ['.pp..pp.', 'pppppppp', 'pppppppp', 'pppppppp', '.pppppp.', '..pppp..', '...pp...'];
  var CLAW = function (c, hi, x) { return function (g) { g.l(1 + x, 0, 3 + x, 9, c).l(2 + x, 0, 4 + x, 9, c).l(4 + x, 0, 6 + x, 9, c).l(5 + x, 0, 7 + x, 9, c).l(7 + x, 0, 9 + x, 8, c).l(8 + x, 0, 9 + x, 6, c); g.p(1 + x, 0, hi); g.p(4 + x, 0, hi); g.p(7 + x, 0, hi); }; };
  var PAWS = function (c, d, ox) { return function (g) { g.d(ox + 3, 6.6, 2.4, c, 2); g.d(ox + 0.7, 3.6, 0.9, c, 1.2).d(ox + 2.2, 2.2, 0.9, c, 1.3).d(ox + 4, 2.2, 0.9, c, 1.3).d(ox + 5.4, 3.6, 0.9, c, 1.2); g.p(ox + 3, 7, d); }; };
  var PAW = function (c, d) { return function (g) { g.d(5, 6.4, 3, c, 2.6).d(1.6, 3.4, 1.2, c, 1.5).d(4, 1.8, 1.2, c, 1.6).d(6.4, 1.8, 1.2, c, 1.6).d(8.4, 3.4, 1.2, c, 1.5); g.r(4, 7, 2, 1, d || c); }; };

  // name: [kind, group, label, draw]
  var DEFS = {
    // ---- currency ----
    fish: ['neutral', 'currency', 'Fish', S(['..bbbb..b.', '.bbbbbbbbb', 'bwobbbbbbb', 'bbbbbbbbbb', '.bbbbbbbbb', '..bbbb..b.', '..........'].map(function (r) { return r; }), 0, 1)],
    warmth: ['buff', 'currency', 'Warmth', function (g) { g.d(5, 5, 3.3, 'y'); g.p(4, 3, 'z'); g.p(3, 4, 'z'); g.p(4, 4, 'z'); g.r(5, 6, 3, 1, 'Y'); g.r(4, 0, 2, 2, 'y'); g.r(4, 8, 2, 2, 'y'); g.r(0, 4, 2, 2, 'y'); g.r(8, 4, 2, 2, 'y'); g.p(1, 1, 'y'); g.p(8, 1, 'y'); g.p(1, 8, 'y'); g.p(8, 8, 'y'); }],
    zoomies: ['buff', 'currency', 'Zoomies', S(['....yyyy..', '...yyyy...', '..yyyy....', '.yyyyyyy..', '....yyy...', '...yyy....', '..yy......', '..y.......'], 0, 1)],
    lives: ['buff', 'currency', 'Lives', S(['m.m....m.m', 'mmm....mmm', 'mmmmmmmmmm', 'mmmmmmmmmm', 'mkwmmmmkwm', 'mmmmmmmmmm', 'mmmmppmmmm', '.mmmmmmmm.', '..mmmmmm..'], 0, 0)],
    nip: ['buff', 'currency', 'Nip', S(['.......gg.', '.....ggggg', '...gggggGg', '..ggggGgg.', '.gggGggg..', '.ggGgg....', 'gGgg......', 'Gg........'], 0, 1)],
    // ---- intents ----
    attack: ['debuff', 'intent', 'Attack', function (g) { for (var i = 0; i < 3; i++) { g.l(4 + 3 * i, 0, 1 + 3 * i - 1, 9, 'r'); g.l(5 + 3 * i, 0, 2 + 3 * i - 1, 9, 'r'); g.p(4 + 3 * i, 0, 'w'); g.p(0 + 3 * i, 9, 'R'); } }],
    multi_attack: ['debuff', 'intent', 'Multi Attack', function (g) { for (var i = 0; i < 3; i++) { g.l(3 + 3 * i, 0, 1 + 3 * i, 3, 'r'); g.l(4 + 3 * i, 0, 2 + 3 * i, 3, 'r'); g.p(4 + 3 * i, 0, 'w'); g.l(3 + 3 * i, 6, 1 + 3 * i, 9, 'm'); g.l(4 + 3 * i, 6, 2 + 3 * i, 9, 'm'); g.p(4 + 3 * i, 6, 'z'); } }],
    climb: ['neutral', 'intent', 'Climb', function (g) { g.r(7, 3, 3, 7, 'S'); g.r(5, 5, 3, 5, 's'); g.r(3, 7, 3, 3, 'S'); g.r(0, 9, 4, 1, 's'); g.r(7, 3, 3, 1, 'w'); g.r(5, 5, 3, 1, 'w'); g.r(3, 7, 3, 1, 'w'); g.l(0, 4, 3, 1, 'y'); g.l(3, 1, 5, 1, 'y'); g.p(4, 0, 'y'); g.p(4, 2, 'y'); }],
    buff: ['buff', 'intent', 'Buff', S(['....gg....', '...gggg...', '..gggggg..', '.gggggggg.', 'gggggggggg', '...gGGg...', '...gGGg...', '...gGGg...'], 0, 1)],
    debuff: ['debuff', 'intent', 'Debuff', S(['...rRRr...', '...rRRr...', '...rRRr...', 'rrrrrrrrrr', '.rrrrrrrr.', '..rrrrrr..', '...rrrr...', '....rr....'], 0, 1)],
    summon: ['neutral', 'intent', 'Summon', function (g) { g.d(5, 5.4, 3.5, 'c', 4.5); g.d(4, 3.4, 1.2, 'w', 1.6); g.l(3, 6, 4, 5, 'k').l(4, 5, 5, 7, 'k').l(5, 7, 6, 5, 'k').l(6, 5, 7, 7, 'k'); g.p(4, 8, 'n'); g.p(7, 3, 'n'); g.p(3, 4, 'n'); }],
    scare: ['debuff', 'intent', 'Scare', S(['..wwwwww..', '.wwwwwwww.', 'wwwwwwwwww', 'wwkkwwkkww', 'wwkkwwkkww', 'wwwwkkwwww', 'wwwkwwkwww', 'wwwwwwwwww', 'ww.ww.ww.w'], 0, 0)],
    defend: ['buff', 'intent', 'Defend', S(['bbbbbbbbbb', 'bwwbbbbbbB', 'bwbbbbbbbB', 'bbbbbbbbbB', '.bbbbbbbB.', '.bbbbbbBB.', '..bbbbBB..', '...bbBB...', '....BB....'], 0, 0)],
    sleep: ['neutral', 'intent', 'Dazed', S(['vvvvvv....', '...vv.....', '..vv......', '.vvvvvv...', '.......vvv', '........v.', '.......vvv'], 0, 1)],
    sunbeam: ['debuff', 'intent', 'Hits Sunbeam', function (g) { g.d(5, 2.4, 2, 'y'); g.p(5, 0, 'y'); g.p(1, 2, 'y'); g.p(8, 2, 'y'); g.p(2, 0, 'Y'); g.p(7, 0, 'Y'); g.r(4, 5, 2, 2, 'r'); g.r(3, 7, 4, 1, 'r'); g.r(4, 8, 2, 1, 'r'); g.p(5, 9, 'r'); g.r(2, 6, 1, 1, 'r'); g.r(7, 6, 1, 1, 'r'); }],
    unknown: ['neutral', 'intent', 'Hidden Intent', S(['..vvvvvv..', '.vvVVVVvv.', '.vv....vv.', '......vvv.', '....vvvv..', '...vvv....', '...vv.....', '..........', '...vv.....'], 0, 0)],
    // ---- statuses (A04) ----
    claws: ['buff', 'status', 'Claws', S(['yyyyyyyyyy', 'm..m..m..m', 'mm.mm.mm.m', 'mm.mm.mm.m', 'mm.mm.mm.m', 'mM.mM.mM.m', '.M..M..M..'].map(function (r) { return r; }), 0, 1)],
    purr: ['buff', 'status', 'Purr', function (g) { g.s(HEART, 1, 1); g.p(3, 3, 'w'); g.p(4, 4, 'w'); g.p(5, 3, 'w'); g.p(6, 4, 'w'); g.p(2, 2, 'P'); }],
    fluff: ['buff', 'status', 'Fluff', S(['.w......w.', 'ww.wwww.ww', '.wwwwwwww.', 'wwwwwwwwww', 'wwwWwwwwww', 'wwwwwwwwWw', '.wwwwwwww.'], 0, 1)],
    rested: ['buff', 'status', 'Rested', function (g) { g.l(0, 6, 2, 4, 'v').l(2, 4, 5, 4, 'v').l(5, 4, 7, 6, 'v'); g.p(1, 7, 'V'); g.p(3, 6, 'V'); g.p(5, 6, 'V'); g.p(7, 7, 'V'); g.r(5, 0, 4, 1, 'b'); g.l(8, 1, 5, 3, 'b'); g.r(5, 3, 4, 1, 'b'); }],
    hidden: ['buff', 'status', 'Hidden', S(['nnnnnnnnnn', 'nNNNNNNNNn', 'nNwkNwkNNn', 'nNNNNNNNNn', 'nnnnnnnnnn', 'nnnnnnnnnn', 'nNnnnnnnNn', 'nnnnnnnnnn'], 0, 1)],
    bristle: ['buff', 'status', 'Bristle', function (g) { g.l(0, 9, 2, 4, 'm').l(2, 4, 3, 9, 'm'); g.l(3, 9, 4, 1, 'm').l(4, 1, 5, 9, 'm'); g.l(5, 9, 7, 3, 'm').l(7, 3, 8, 9, 'm'); g.r(0, 8, 9, 2, 'M'); g.r(3, 6, 1, 1, 'M'); g.r(1, 6, 1, 3, 'm'); g.r(6, 6, 1, 3, 'm'); g.r(4, 4, 1, 4, 'm'); }],
    cozy: ['buff', 'status', 'Cozy', S(['..yyyyyy..', '.yzzyyyyY.', '.yyyyyyyY.', 'YYYYYYYYYY', 'yyyyyyyyyy', 'yzzyyyyyyY', 'yyyyyyyyyY', 'YYYYYYYYYY'], 0, 1)],
    frenzy: ['neutral', 'status', 'Frenzy', function (g) { g.d(5, 5, 3.6, 'w'); g.l(5, 5, 5, 3, 'r').l(5, 3, 7, 3, 'r').l(7, 3, 7, 7, 'r').l(7, 7, 3, 7, 'r').l(3, 7, 3, 3, 'r'); g.p(5, 5, 'k'); g.p(0, 1, 'y'); g.p(9, 0, 'y'); g.p(9, 9, 'y'); g.p(0, 9, 'y'); g.p(1, 0, 'y'); }],
    catnip: ['neutral', 'status', 'Catnip', function (g) { g.s(['......gg..', '....ggggg.', '..gggggGg.', '.ggggGgg..', '.gggGgg...', 'ggGgg.....'], 0, 2); g.ring(5, 5, 4.6, 'y'); g.p(2, 0, 'y'); }],
    crash: ['debuff', 'status', 'Crash', function (g) { g.d(5, 6, 4.4, 'm', 2.8); g.d(5, 5, 4.4, 'm', 2.4); g.p(0, 3, 'm'); g.p(9, 3, 'm'); g.p(1, 2, 'm'); g.p(8, 2, 'm'); g.ring(3, 5, 1.5, 'k'); g.ring(7, 5, 1.5, 'k'); g.p(5, 7, 'p'); g.r(2, 9, 6, 1, 'M'); }],
    rage: ['debuff', 'status', 'Rage', function (g) { g.d(5, 5.6, 4.4, 'r', 3.8); g.l(1, 3, 4, 5, 'k'); g.l(8, 3, 5, 5, 'k'); g.r(2, 5, 2, 2, 'w'); g.r(6, 5, 2, 2, 'w'); g.p(3, 6, 'k'); g.p(6, 6, 'k'); g.l(3, 8, 6, 8, 'k'); g.p(2, 0, 'W'); g.p(3, 1, 'W'); g.p(7, 0, 'W'); g.p(6, 1, 'W'); }],
    wet: ['debuff', 'status', 'Wet', S(['....bb....', '....bb....', '...bbbb...', '..bbbbbb..', '.bbwbbbbb.', '.bwbkbkbb.', '.bbbbbbbb.', '.bbbkkbbb.', '..bbbbbb..', '...bbbb...'], 0, 0)],
    scared: ['debuff', 'status', 'Scared', S(['w.w.ww.w.w', 'wwwwwwwwww', 'wwwwwwwwww', 'wwkkwwkkww', 'wwkkwwkkww', 'wwwwkkwwww', 'wwwkkkkwww', 'wwwwwwwwww', '.w.w..w.w.'], 0, 0)],
    dizzy: ['debuff', 'status', 'Dizzy', function (g) { g.l(5, 5, 5, 3, 'y').l(5, 3, 7, 3, 'y').l(7, 3, 7, 7, 'y').l(7, 7, 2, 7, 'y').l(2, 7, 2, 1, 'y').l(2, 1, 8, 1, 'y').l(8, 1, 8, 9, 'y').l(8, 9, 0, 9, 'y'); g.p(5, 5, 'Y'); }],
    hiss: ['buff', 'status', 'Hiss', function (g) { g.d(4.6, 5, 4.4, 'r', 3.8); g.d(4.6, 5.8, 3.4, 'R', 2.4); g.r(2, 2, 1, 2, 'w'); g.r(7, 2, 1, 2, 'w'); g.r(3, 7, 1, 1, 'w'); g.r(6, 7, 1, 1, 'w'); g.r(4, 6, 2, 1, 'p'); g.p(9, 3, 's'); g.p(9, 5, 's'); g.p(9, 7, 's'); }],
    yarn: ['debuff', 'status', 'Yarn', function (g) { g.d(4, 4.4, 4, 'p'); g.l(1, 3, 6, 1, 'P').l(0, 5, 7, 2, 'P').l(1, 7, 8, 4, 'P').l(3, 8, 8, 6, 'P'); g.p(2, 2, 'w'); g.l(5, 8, 7, 9, 'p').l(7, 9, 9, 8, 'p'); }],
    marked: ['debuff', 'status', 'Marked', function (g) { PAW('s', 'S')(g); g.ring(5, 5, 4.6, 'r'); g.l(5, 0, 5, 3, 'r').l(5, 7, 5, 9, 'r').l(0, 5, 3, 5, 'r').l(7, 5, 9, 5, 'r'); }],
    shatter: ['debuff', 'status', 'Shatter', S(['..bbbbbb..', '...bBBb...', '..bbbBbb..', '.bbb.bbbb.', '.bb...bbB.', '.bbb.bbbb.', '..bbbbbb..', '...bbbb...', '..b.bb.b..'], 0, 0)],
    hairball: ['debuff', 'status', 'Hairball', function (g) { g.d(5, 5, 4, 'S'); g.ring(5, 5, 3.4, 's'); g.l(1, 4, 8, 6, 's').l(2, 7, 7, 2, 'W').l(3, 2, 6, 8, 's'); g.ring(5, 5, 2, 'S'); g.p(2, 8, 'S'); g.p(7, 1, 's'); }],
    // ---- floor statuses ----
    puddle: ['debuff', 'floor', 'Puddle', S(['..........', '..bbbbbb..', '.bwbbbbbbb', 'bbbbbBbbbb', '.bbbbbbbb.', '..bbbbbb..'], 0, 2)],
    clutter: ['debuff', 'floor', 'Clutter', function (g) { g.d(2.5, 7, 2.2, 'p'); g.p(1, 6, 'w'); g.r(5, 6, 5, 3, 'n'); g.r(5, 6, 5, 1, 'c'); g.r(6, 1, 3, 3, 'b'); g.p(5, 3, 'b'); g.p(4, 4, 'b'); g.p(9, 4, 'w'); g.p(2, 3, 'y'); g.p(1, 2, 'y'); }],
    box: ['neutral', 'floor', 'Box', S(['nnnnnnnnnn', 'nNNNNNNNNn', 'nnnnnnnnnn', 'nnnnwwnnnn', 'nnnnnnnnnn', 'nnnnnnnnnn', 'nnnnnnnnnn'], 0, 1)],
    heatlamp: ['buff', 'floor', 'Heat Lamp', S(['...SS.....', '..mmmm....', '.mmmmmm...', 'mmmzzmmm..', '.y.y.y.y..', '..y.y.y...', '.y.y.y.y..', '..y.y.y...'], 0, 1)],
    exhaust: ['neutral', 'keyword', 'Exhaust', function (g) { g.r(1, 0, 8, 9, 's'); g.r(2, 1, 6, 7, 'W'); g.s(['.m.m.', 'mmmmm', 'mymym', '.mmm.'], 2, 5); g.l(3, 2, 6, 4, 'S').l(6, 2, 3, 4, 'S'); }],
    fleeting: ['debuff', 'keyword', 'Fleeting', S(['yyyyyyyyyy', '.bbbbbbbb.', '..bbbbbb..', '...bbbb...', '....bb....', '....bY....', '...bYYb...', '..bbYYbb..', '.bbbbbbbb.', 'yyyyyyyyyy'], 0, 0)],
    retain: ['buff', 'keyword', 'Retain', S(['..yyyyyy..', '..yzzyyY..', '..yzyyyY..', '..yyyyyY..', '..yyyyyY..', '..yyyyyY..', '..yy.yyY..', '..y...yY..'], 0, 1)],
    innate: ['buff', 'keyword', 'Innate', S(['....yy....', '....yy....', '...yyyy...', 'yyyyyyyyyy', '.yyyzyyyy.', '..yyyyyy..', '..yyy.yyy.', '.yy.....yy'], 0, 1)],
    unplayable: ['debuff', 'keyword', 'Unplayable', function (g) { g.ring(5, 5, 4.8, 'r', 2); g.l(1, 8, 8, 1, 'r').l(2, 8, 8, 2, 'r'); }],
    reborn: ['buff', 'keyword', 'Reborn', function (g) { g.ring(5, 5, 4.8, 'g', 1.6); g.s(['..w..', '.www.', 'wwwww', '..w..', '..w..'], 2.5 | 0, 2); }],
    pounce: ['buff', 'keyword', 'Pounce', function (g) { PAWS('m', 'M', 3)(g); g.l(0, 2, 2, 2, 'w'); g.l(0, 4, 1, 4, 'w'); g.l(0, 6, 2, 6, 'w'); }],
    knock: ['neutral', 'keyword', 'Knock', function (g) { PAWS('m', 'M', 0)(g); g.r(8, 1, 2, 5, 'c'); g.r(7, 6, 4, 1, 'c'); g.r(8, 7, 2, 1, 'c'); g.p(8, 8, 'c'); g.p(9, 8, 'c'); }],
    nap: ['buff', 'keyword', 'Nap', function (g) { g.d(4.6, 5, 4.2, 'v'); g.d(6.4, 4, 3.4, '.'); g.r(7, 5, 3, 1, 'b'); g.r(8, 6, 1, 1, 'b'); g.r(7, 7, 3, 1, 'b'); g.p(2, 3, 'w'); }],
    nine_lives: ['buff', 'keyword', 'Nine Lives', function (g) { g.s(HEART, 1, 1); g.s(['www', 'wkw', 'www', '..w', '..w'], 3, 1); g.rr = 0; g.r(3, 1, 3, 5, '.'); g.s(['www', 'w.w', 'www', '..w', 'www'], 3, 2); g.p(4, 3, 'p'); }],
    witching: ['neutral', 'keyword', 'Witching Hour', function (g) { g.d(5, 5, 4.6, 'V'); g.d(5, 5, 3.8, 'v'); g.d(6.2, 4.4, 3, 'V'); g.l(5, 5, 5, 2, 'w'); g.l(5, 5, 7, 6, 'w'); g.p(1, 1, 'y'); g.p(8, 8, 'y'); }],
    // ---- stats / ui ----
    hp: ['buff', 'stat', 'Health', function (g) { g.s(['.rr..rr.', 'rwrrrrrr', 'rrrrrrrr', 'rrrrrrrR', '.rrrrrR.', '..rrrR..', '...rR...'], 1, 1); }],
    atk: ['debuff', 'stat', 'Power', function (g) { g.l(8, 1, 3, 6, 'W').l(7, 1, 2, 6, 's').l(9, 2, 4, 7, 's'); g.r(1, 6, 4, 1, 'n').l(1, 8, 3, 6, 'n'); g.l(0, 9, 2, 7, 'N'); g.p(9, 0, 'w'); }],
    plus: ['neutral', 'ui', 'Plus', function (g) { g.r(4, 1, 2, 8, 'w'); g.r(1, 4, 8, 2, 'w'); }],
    up_arrow: ['buff', 'ui', 'Up', S(['....gg....', '...gggg...', '..gggggg..', '.gggggggg.', '...gggg...', '...gggg...', '...gggg...'], 0, 1)],
    down_arrow: ['debuff', 'ui', 'Down', S(['...rrrr...', '...rrrr...', '...rrrr...', '.rrrrrrrr.', '..rrrrrr..', '...rrrr...', '....rr....'], 0, 1)],
    paw: ['neutral', 'ui', 'Paw', PAW('c', 'n')],
    star: ['neutral', 'ui', 'Star', S(['....yy....', '....yy....', 'yyyyyyyyyy', '.yyyzyyyy.', '..yyyyyy..', '..yyyyyy..', '.yyy..yyy.', '.yy....yy.'], 0, 1)],
    crown: ['neutral', 'ui', 'Crown', S(['y...yy...y', 'yy..yy..yy', 'yyy.yy.yyy', 'yyyyyyyyyy', 'yyrYyyYryy', 'yyyyyyyyyy', 'YYYYYYYYYY'], 0, 1)],
    skull: ['debuff', 'ui', 'Skull', S(['.wwwwwwww.', 'wwwwwwwwww', 'wkkwwwwkkw', 'wkkwwwwkkw', 'wwwwkkwwww', '.wwwwwwww.', '..wkwkwk..', '..wwwwww..'], 0, 1)],
    // gem shapes (rarity): circle, diamond, star, hexagon, crown, skull
    gem_common: ['neutral', 'gem', 'Common', function (g) { g.d(5, 5, 3.2, 's'); g.p(3, 3, 'w'); }],
    gem_uncommon: ['neutral', 'gem', 'Uncommon', function (g) { g.l(5, 0, 9, 5, 'b').l(9, 5, 5, 9, 'b').l(5, 9, 0, 5, 'b').l(0, 5, 5, 0, 'b'); for (var y = 1; y < 9; y++) for (var x = 0; x < 10; x++) { if (Math.abs(x + 0.5 - 5) + Math.abs(y + 0.5 - 5) <= 4.4) g.p(x, y, 'b'); } g.p(4, 3, 'w'); }],
    gem_rare: ['neutral', 'gem', 'Rare', S(['....yy....', '....yy....', 'yyyyyyyyyy', '.yyyzyyyy.', '..yyyyyy..', '..yyyyyy..', '.yyy..yyy.', '.yy....yy.'], 0, 1)],
    gem_epic: ['neutral', 'gem', 'Epic', S(['..vvvv..', '.vzvvvv.', 'vvvvvvvV', 'vvvvvvVV', '.vvvvVV.', '..VVVV..'], 0, 2)],
    gem_champion: ['neutral', 'gem', 'Champion', S(['r...rr...r', 'rr..rr..rr', 'rrr.rr.rrr', 'rrrrrrrrrr', 'rryrrrryrr', 'RRRRRRRRRR'], 0, 2)],
    gem_curse: ['debuff', 'gem', 'Curse', S(['.vvvvvvvv.', 'vvvvvvvvvv', 'vkkvvvvkkv', 'vkkvvvvkkv', 'vvvvkkvvvv', '.vvvvvvvv.', '..vkvkvk..'], 0, 1)],
    // clan emblems (alley claw, hearth flame, moon crescent, mischief yarn ball)
    clan_alley: ['neutral', 'clan', 'Alley Tabbies', function (g) { for (var i = 0; i < 3; i++) { g.l(4 + 3 * i, 0, 3 * i, 9, 'm'); g.l(5 + 3 * i, 0, 1 + 3 * i, 9, 'm'); g.p(4 + 3 * i, 0, 'y'); } }],
    clan_hearth: ['neutral', 'clan', 'Hearthpaws', S(['....yy....', '...yyy....', '..yyymm...', '.yyymmmm..', '.yymmmmmm.', 'yymmrrmmmm', 'yymmrrrmmm', '.ymmrrrmm.', '..mmmmmm..'], 0, 0)],
    clan_moon: ['neutral', 'clan', 'Moonwhiskers', function (g) { g.d(4.6, 5, 4.4, 'v'); g.d(6.8, 4, 3.8, '.'); g.p(8, 1, 'y'); g.p(9, 5, 'y'); g.p(7, 8, 'y'); g.p(2, 3, 'w'); }],
    clan_mischief: ['neutral', 'clan', 'Mischief', function (g) { g.d(4.6, 4.6, 4.2, 't'); g.l(1, 3, 7, 1, 'p').l(0, 5, 8, 3, 'p').l(1, 7, 8, 5, 'p').l(3, 8, 6, 8, 'p'); g.p(2, 2, 'w'); g.l(6, 8, 8, 9, 'p').l(8, 9, 9, 8, 'p'); }]
  };

  // ---- redrawn for 24px legibility ----
  DEFS.pounce[3] = function (g) {
    g.l(0, 0, 6, 6, 'm').l(1, 0, 7, 6, 'm').l(0, 1, 6, 7, 'm'); g.r(5, 8, 5, 2, 'm'); g.r(8, 5, 2, 5, 'm'); g.r(6, 6, 3, 3, 'm');
    g.p(9, 9, 'z'); g.r(0, 4, 2, 1, 'w'); g.r(0, 7, 3, 1, 'w'); g.r(3, 9, 2, 1, 'w');
  };
  DEFS.knock[3] = function (g) {
    g.s(['mm..bbbb..', 'mmm.bwbbb.', 'mmmm.bbbb.', 'mMmm..bb..', 'mmm..w..w.', 'mm......w.'], 0, 1);
    g.r(0, 8, 6, 2, 'S'); g.r(0, 8, 6, 1, 's');
  };
  DEFS.summon[3] = function (g) { g.ring(5, 5, 4.8, 'c', 1.6); g.r(4, 2, 2, 6, 'y'); g.r(2, 4, 6, 2, 'y'); };
  DEFS.clutter[3] = function (g) {
    g.d(2.8, 6.8, 2.8, 'p'); g.p(1, 5, 'w'); g.l(1, 8, 4, 5, 'P');
    g.r(5, 5, 5, 5, 'n'); g.r(5, 5, 5, 1, 'c'); g.r(7, 7, 1, 1, 'N');
    g.r(5, 1, 3, 3, 'b'); g.p(5, 1, 'w'); g.r(9, 2, 1, 2, 'y');
  };

  // ---- glossary glyphs (new) ----
  function face(c, d, x, y, r, e) { return function (g) { var cx = x, cy = y; g.d(cx, cy, r, c, r * 0.85); var u = Math.max(1, Math.round(r / 2.2)); g.r(Math.round(cx - r), Math.round(cy - r * 0.85) - 1, u, 2, c); g.r(Math.round(cx + r) - u, Math.round(cy - r * 0.85) - 1, u, 2, c); g.p(cx - r / 2, cy - 0.2, e || 'k'); g.p(cx + r / 2 - 1, cy - 0.2, e || 'k'); g.p(cx - 0.5, cy + r * 0.4, 'p'); }; }
  var N = function (k, kind, label, fn) { DEFS[k] = [kind, 'glyph', label, fn]; };
  N('lock', 'debuff', 'Locked', S(['..wwww..', '.w....w.', '.w....w.', 'yyyyyyyy', 'yyyykyyy', 'yyyykyyy', 'yyyyyyyy', 'YYYYYYYY'], 1, 1));
  N('frazzled', 'debuff', 'Frazzled', S(['y.y.yy.y.y', '.y.yyyy.y.', '..wwwwww..', '.wwwwwwww.', '.wkwwwwkw.', '.wwwwwwww.', '..wwppww..', '...wwww...'], 0, 1));
  N('leash', 'debuff', 'Leash', function (g) { g.ring(3.2, 3.2, 3.2, 'r', 1.6); g.l(5, 5, 8, 8, 'n'); g.l(6, 5, 9, 8, 'n'); g.r(7, 8, 3, 2, 'N'); });
  N('bad_hair', 'debuff', 'Ruined Hair', S(['cccccccccc', 'c.cc.cc.cc', 'c.cc.cc.cc', 'c.cc.cc..c', 'c.cc.c....', 'c.c.......'], 0, 2));
  N('knead', 'buff', 'Knead', function (g) { g.d(5, 6, 4.6, 'c', 3.4); g.r(2, 4, 2, 2, 'n'); g.r(6, 5, 2, 2, 'n'); g.p(3, 3, 'N'); g.p(7, 4, 'N'); g.p(4, 7, 'W'); });
  N('bait_fish', 'neutral', 'Bait', function (g) { g.l(8, 0, 8, 4, 's'); g.p(7, 5, 's'); g.p(6, 4, 's'); g.s(['.bbbb.b', 'bwkbbbb', '.bbbb.b'], 0, 5); });
  N('ambush_eye', 'buff', 'Ambush', function (g) { g.d(5, 5.6, 4.8, 'y', 2.8); g.r(4, 3, 2, 5, 'k'); g.r(0, 2, 10, 2, 'S'); g.r(1, 1, 8, 1, 'S'); });
  N('decoy', 'neutral', 'Decoy', function (g) { g.ring(5, 5, 4.8, 'r', 1.4); g.d(5, 5.4, 1.8, 'c', 1.4); g.p(2, 5, 'r'); g.p(7, 5, 'r'); });
  N('cleanse', 'buff', 'Cleanse', function (g) { g.r(3, 0, 2, 9, 'w'); g.r(0, 3, 8, 2, 'w'); g.r(2, 2, 4, 4, 'w'); g.p(8, 0, 'y'); g.p(7, 1, 'y'); g.p(9, 1, 'y'); g.p(8, 2, 'y'); g.p(8, 7, 'y'); g.p(7, 8, 'y'); g.p(9, 8, 'y'); g.p(8, 9, 'y'); });
  N('purge', 'buff', 'Purge', function (g) { g.l(8, 0, 3, 5, 'n'); g.l(9, 1, 4, 6, 'n'); g.s(['yyyy', 'yyyyy', '.yyyyy', 'Y.Y.Y'], 0, 5); g.p(0, 9, 'Y'); });
  N('echo', 'buff', 'Echo', function (g) { g.d(2, 5, 1.2, 't'); g.ring(2, 5, 3.4, 't', 1); g.ring(2, 5, 5.8, 't', 1); g.ring(2, 5, 8.2, 't', 1); });
  N('multistrike', 'buff', 'Multistrike', function (g) { g.l(1, 0, 5, 9, 'r'); g.l(2, 0, 6, 9, 'r'); g.l(5, 0, 9, 9, 'm'); g.l(6, 0, 9, 7, 'm'); g.p(1, 0, 'w'); g.p(5, 0, 'w'); });
  N('nine_pips', 'buff', 'Nine Pips', function (g) { for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) g.r(i * 4, j * 4, 2, 2, 'p'); });
  N('spend_life', 'debuff', 'Spend a Life', function (g) { PAW('c', 'n')(g); g.r(5, 8, 5, 2, 'r'); });
  N('cornered', 'debuff', 'Cornered', function (g) { g.l(0, 1, 3, 3, 'R'); g.l(9, 1, 6, 3, 'R'); g.r(0, 4, 4, 3, 'r'); g.r(6, 4, 4, 3, 'r'); g.r(1, 4, 2, 3, 'w'); g.r(7, 4, 2, 3, 'w'); g.r(2, 4, 1, 3, 'k'); g.r(7, 4, 1, 3, 'k'); });
  N('last_gasp', 'neutral', 'Last Gasp', function (g) { g.s(['..y..', '.yyy.', 'yyzyy', '.yyy.', '.y.y.'], 5, 0); g.l(4, 5, 0, 9, 'Y'); g.l(5, 6, 2, 9, 'Y'); g.l(3, 4, 0, 7, 'y'); });
  N('empty_collar', 'neutral', 'Empty Collar', function (g) { g.ring(5, 4, 4, 'r', 1.6); g.d(5, 8.4, 1.3, 'y'); });
  N('bell', 'neutral', 'Bell', S(['...yy...', '..yyyy..', '.yyyyyy.', '.yyzyyy.', '.yyzyyy.', 'yyyyyyyy', 'yyyyyyyy', '...kk...'], 1, 1));
  N('falling_vase', 'neutral', 'Knock it Off', function (g) { g.l(1, 0, 1, 2, 'w'); g.l(4, 0, 4, 1, 'w'); g.l(7, 0, 7, 2, 'w'); g.s(['..bbbb..', '...bb...', '..bbbb..', '.bwbbbb.', '.bbbbbb.', '.bbbbbb.', '..bbbb..'], 1, 3); });
  N('broken_vase', 'debuff', 'Shatter', function (g) { g.s(['bb....bb..', 'bbb...bbb.', 'bwbb..bbbb', 'bbbb..bbbb', 'bbbb...bbb', '.bbb...bb.'], 0, 2); g.p(4, 1, 'w'); g.p(5, 8, 'w'); g.p(9, 9, 'b'); });
  N('flap_door', 'neutral', 'Cat Flap', function (g) { g.r(0, 0, 10, 10, 'n'); g.r(2, 2, 6, 6, 'k'); g.s(['cccc', 'cccc', 'ccc', 'cc'], 2, 4); g.r(2, 2, 6, 1, 'N'); });
  N('stretch', 'buff', 'Stretch', function (g) { g.l(1, 7, 3, 2, 'm').l(2, 7, 4, 2, 'm').l(3, 2, 7, 2, 'm').l(7, 2, 9, 7, 'm').l(6, 2, 8, 7, 'm'); g.r(0, 8, 2, 2, 'm'); g.r(8, 8, 2, 2, 'm'); g.p(1, 8, 'M'); });
  N('alarm', 'debuff', 'Rude Awakening', function (g) { g.d(5, 5.8, 3.8, 'r', 3.8); g.d(5, 5.8, 2.8, 'w', 2.8); g.l(5, 6, 5, 4, 'k'); g.l(5, 6, 7, 6, 'k'); g.r(0, 1, 3, 2, 'y'); g.r(7, 1, 3, 2, 'y'); g.r(2, 9, 2, 1, 'R'); g.r(6, 9, 2, 1, 'R'); });
  N('zoom', 'buff', 'Zoom', function (g) { g.r(0, 2, 5, 1, 'w'); g.r(1, 5, 6, 1, 'w'); g.r(0, 8, 4, 1, 'w'); g.d(7.4, 5.2, 2.5, 'm'); g.p(7, 4, 'z'); });
  N('night_visitors', 'neutral', 'Night Visitors', function (g) { g.d(3.5, 3.4, 3.2, 'v'); g.d(5, 2.6, 2.7, '.'); g.s(['t..t..t..t', '.tt.tt.tt.'], 0, 7); g.p(8, 1, 'y'); });
  N('flat_pack', 'neutral', 'Flat Pack', function (g) { g.r(0, 3, 10, 5, 'n'); g.r(3, 3, 1, 5, 'N'); g.r(6, 3, 1, 5, 'N'); g.r(0, 3, 10, 1, 'c'); g.r(2, 5, 6, 1, 'w'); });
  N('cat_pile', 'buff', 'Cuddle Pile', function (g) { g.d(2.8, 7, 2.8, 'm'); g.d(7.2, 7, 2.8, 's'); g.d(5, 3.8, 2.8, 'c'); g.p(3, 0, 'c'); g.p(7, 0, 'c'); g.p(4, 4, 'k'); g.p(6, 4, 'k'); });
  N('snug', 'buff', 'Snug', function (g) { g.s(HEART, 1, 1); g.d(5, 4.5, 1.6, 'y'); g.r(1, 1, 8, 7, '.'); g.s(['.mm..mm.', 'mmmmmmmm', 'mmyyyymm', 'mmyyyymm', '.mmyymm.', '..mmmm..', '...mm...'], 1, 1); });
  N('heap', 'buff', 'Heap', function (g) { g.d(1.8, 8, 1.8, 'm'); g.d(5, 8, 1.8, 's'); g.d(8.2, 8, 1.8, 'c'); g.d(3.4, 5, 1.8, 'c'); g.d(6.6, 5, 1.8, 'm'); g.d(5, 2.2, 1.8, 's'); });
  N('surge', 'buff', 'Surge', function (g) { g.s(['.gg', 'ggGg', 'gGg.', 'g..'], 3, 3); g.p(5, 0, 'y'); g.p(5, 9, 'y'); g.p(0, 5, 'y'); g.p(9, 5, 'y'); g.p(1, 1, 'y'); g.p(8, 1, 'y'); g.p(1, 8, 'y'); g.p(8, 8, 'y'); });
  N('flat_cat', 'debuff', 'Crashed Flat', function (g) { g.d(5, 6.4, 4.8, 'm', 2.4); g.p(3, 6, 'k'); g.p(7, 6, 'k'); g.p(2, 5, 'M'); g.p(8, 5, 'M'); g.r(4, 7, 2, 1, 'p'); g.p(8, 3, 'm'); g.p(1, 3, 'm'); });
  N('hold_rule', 'neutral', 'Hold', function (g) { g.r(0, 0, 10, 10, 'S'); g.r(0, 3, 10, 1, 's'); g.r(0, 6, 10, 1, 's'); g.r(5, 0, 1, 3, 's'); g.r(2, 3, 1, 3, 's'); g.r(7, 6, 1, 4, 's'); PAW('c', 'n')(g); });
  N('garden_gate', 'neutral', 'Garden Gate', S(['.n..n..n..', 'nnnnnnnnnn'.slice(0, 0) + 'nn.nn.nn..', 'nn.nn.nn..', 'NNNNNNNNN.', 'nn.nn.nn..', 'nn.nn.nn..', 'NNNNNNNNN.', 'nn.nn.nn..', 'gggggggggg'], 0, 0));
  N('tick_clock', 'debuff', 'Impatience', function (g) { g.ring(5, 5, 4.8, 'w', 1.6); g.d(5, 5, 3.2, 'W'); g.l(5, 5, 5, 2, 'k'); g.l(5, 5, 7, 6, 'r'); });
  N('sunset', 'neutral', 'Dusk', function (g) { g.d(5, 7, 3.8, 'm', 3.8); g.r(0, 7, 10, 3, '.'); g.r(0, 7, 10, 1, 'v'); g.r(1, 9, 8, 1, 'V'); g.p(5, 1, 'y'); g.p(1, 3, 'y'); g.p(8, 3, 'y'); g.p(5, 7, 'y'); });
  N('wall_climb', 'neutral', 'Climber', function (g) { g.r(6, 0, 4, 10, 'S'); g.r(6, 3, 4, 1, 's'); g.r(6, 7, 4, 1, 's'); g.d(3, 4, 2, 'm'); g.p(5, 4, 'w'); g.p(5, 5, 'w'); g.r(2, 7, 2, 3, 'g'); g.p(1, 8, 'g'); g.p(4, 8, 'g'); });
  N('sneak', 'neutral', 'Sneaky', function (g) { function pr(cx, cy, c) { g.d(cx, cy + 0.7, 1.7, c, 1.4); g.p(cx - 1.5, cy - 1, c); g.p(cx, cy - 1.8, c); g.p(cx + 1.5, cy - 1, c); } pr(3, 7, 'W'); pr(7, 3, 'c'); });
  N('soap', 'neutral', 'Slippery', function (g) { g.r(1, 4, 7, 5, 'b'); g.r(1, 4, 7, 1, 'w'); g.p(2, 6, 'w'); g.ring(7, 1.8, 1.7, 'w'); g.ring(2.5, 2, 1.2, 'w'); g.p(9, 6, 'w'); });
  N('ghost', 'neutral', 'Spectral', S(['..wwwwww..', '.wwwwwwww.', 'wwwkwwkwww', 'wwwkwwkwww', 'wwwwwwwwww', 'wwwwkkwwww', 'wwwwwwwwww', 'ww.ww.ww.w'], 0, 1));
  N('nose', 'neutral', 'Tracker', function (g) { g.d(4.4, 5.6, 3.8, 'p', 3); g.r(2, 5, 2, 2, 'P'); g.r(5, 5, 2, 2, 'P'); g.p(3, 3, 'w'); g.p(9, 3, 'w'); g.p(9, 5, 'w'); g.p(8, 7, 'w'); });
  N('wings', 'neutral', 'Glider', S(['.ww....ww.', 'wwww..wwww', 'wwwwwwwwww', 'wsswwwwssw', '.ssswwsss.', '...ssss...'], 0, 2));
  N('dot_glow', 'neutral', 'Untargetable', function (g) { g.ring(5, 5, 4.8, 'p', 1); g.d(5, 5, 2.6, 'r'); g.p(4, 4, 'z'); });
  N('tick_bug', 'debuff', 'Parasite', function (g) { g.l(0, 4, 3, 6, 'N'); g.l(9, 4, 6, 6, 'N'); g.l(0, 8, 3, 7, 'N'); g.l(9, 8, 6, 7, 'N'); g.d(5, 6.4, 3, 'R', 2.8); g.d(5, 2.6, 1.5, 'N'); g.p(4, 6, 'r'); });
  N('feather', 'neutral', 'Light', function (g) { g.l(1, 9, 8, 1, 'S'); g.s(['..wwww', '.wwwww', 'wwwww', 'wwww'], 2, 1); g.l(0, 9, 4, 5, 'S'); g.l(2, 3, 7, 3, 'W'); });
  N('anvil', 'neutral', 'Heavy', S(['SSSSSSSSSS', 'sssSSSSSSS', '..SSSSSS..', '...SSSS...', '...SSSS...', '..SSSSSS..', '.SSSSSSSS.'], 0, 2));
  N('anchor', 'neutral', 'Anchored', S(['...ss...', '..s..s..', '...ss...', '.ssssss.', '...ss...', 's..ss..s', 'ss.ss.ss', '.ssssss.'], 1, 1));
  N('costly', 'debuff', 'Costly', function (g) { PAW('r', 'R')(g); g.p(1, 9, 'r'); g.p(8, 9, 'r'); });
  N('owl_eye', 'neutral', 'Nocturnal', function (g) { g.r(0, 2, 10, 1, 'V'); g.d(2.6, 5.8, 2.6, 'y'); g.d(7.4, 5.8, 2.6, 'y'); g.r(2, 5, 1, 2, 'k'); g.r(7, 5, 1, 2, 'k'); });
  N('big_cat', 'neutral', 'Large', function (g) { g.d(5, 6, 4.8, 'm', 3.6); g.s(['m...mm...m', 'mm.mmmm.mm'.slice(0, 0) + 'mm......mm', 'mmmmmmmmmm'.slice(0, 0)], 0, 0); g.p(3, 5, 'k'); g.p(6, 5, 'k'); g.r(4, 7, 2, 1, 'p'); g.p(0, 1, 'm'); g.p(1, 1, 'm'); g.p(8, 1, 'm'); g.p(9, 1, 'm'); g.r(0, 2, 2, 2, 'm'); g.r(8, 2, 2, 2, 'm'); });
  N('small_cat', 'neutral', 'Kitten', function (g) { g.d(5, 6.4, 2.8, 'c', 2.4); g.r(2, 3, 2, 2, 'c'); g.r(6, 3, 2, 2, 'c'); g.p(4, 6, 'k'); g.p(6, 6, 'k'); g.p(5, 7, 'p'); g.p(2, 3, 'p'); g.p(7, 3, 'p'); });
  N('cracked_pot', 'debuff', 'Fragile', function (g) { g.s(['.nnnnnn.', 'nnnnnnnn', '.nnnnnn.', 'nnnnnnnn', 'nnnnnnnn', '.nnnnnn.', '..nnnn..'], 1, 1); g.l(5, 2, 4, 4, 'k'); g.l(4, 4, 6, 6, 'k'); g.l(6, 6, 5, 8, 'k'); g.p(2, 3, 'c'); });
  N('special', 'neutral', 'Special', function (g) { g.l(5, 0, 5, 6, 's'); g.l(6, 0, 6, 6, 's'); g.ring(5.5, 6.6, 3, 's', 1.6); g.r(0, 6, 3, 2, '.'); g.p(2, 6, 's'); g.p(1, 5, 's'); g.p(0, 4, 's'); });
  N('shade', 'buff', 'Shade', function (g) { g.d(5, 4.6, 4.8, 'b', 3.6); g.r(0, 4, 10, 6, '.'); g.s(['bbbbbbbbbb', 'bwbbBbbBbb', 'b.bb.bb.bb'], 0, 4); g.r(5, 6, 1, 4, 'n'); g.p(4, 9, 'n'); g.p(5, 0, 'B'); });
  N('whisker', 'neutral', 'Whisker', function (g) { g.d(5, 5, 1.3, 'p'); g.l(4, 4, 0, 2, 'w'); g.l(4, 5, 0, 5, 'w'); g.l(4, 6, 0, 8, 'w'); g.l(6, 4, 9, 2, 'w'); g.l(6, 5, 9, 5, 'w'); g.l(6, 6, 9, 8, 'w'); });
  N('gouge', 'neutral', 'Scratch', function (g) { g.r(0, 0, 10, 10, 'c'); g.r(0, 0, 10, 1, 'n'); g.l(2, 1, 4, 9, 'r'); g.l(5, 1, 7, 9, 'r'); g.l(8, 1, 9, 6, 'r'); });
  N('gouge_slot', 'neutral', 'Scratch Slot', function (g) { g.r(0, 0, 10, 10, 'S'); g.r(1, 1, 8, 8, 'k'); g.l(2, 8, 7, 1, 'r'); g.l(3, 8, 8, 1, 'r'); });
  N('fork', 'neutral', 'Fork', function (g) { g.r(4, 5, 2, 5, 'g'); g.l(4, 5, 1, 2, 'g'); g.l(5, 5, 8, 2, 'g'); g.s(['ggg', 'gg', 'g'], 0, 0); g.s(['ggg', '.gg', '..g'], 7, 0); });
  N('mastery', 'buff', 'Mastery', function (g) { PAW('y', 'Y')(g); g.p(4, 5, 'z'); g.r(1, 9, 8, 1, 'Y'); });
  N('evolve', 'buff', 'Evolve', S(['.gg..gg...', 'gggg.ggg..', '.gggggg...', '...gG.....', '...gG.....', '...gG.....', '.nnnnnn...'], 0, 2));
  N('adopt_out', 'neutral', 'Adopt Out', function (g) { g.s(['....rr....', '..rrrrrr..', '.rrrrrrrr.', 'rrrrrrrrrr'], 0, 0); g.r(1, 4, 8, 6, 'c'); g.s(['.pp.pp.', 'ppppppp', '.ppppp.', '..ppp..'], 1.5 | 0, 5); g.p(5, 9, 'p'); });
  N('swap_box', 'neutral', 'Swap', function (g) { g.r(0, 0, 4, 4, 'n'); g.r(6, 6, 4, 4, 'n'); g.r(0, 0, 4, 1, 'c'); g.r(6, 6, 4, 1, 'c'); g.l(5, 1, 8, 1, 'y'); g.l(8, 1, 8, 4, 'y'); g.l(5, 8, 2, 8, 'y'); g.l(2, 8, 2, 5, 'y'); });
  N('litter', 'neutral', 'Litter', function (g) { g.d(2.8, 6, 2.8, 'm'); g.d(7.2, 6, 2.8, 's'); g.r(0, 2, 2, 2, 'm'); g.r(4, 2, 1, 2, 'm'); g.r(5, 2, 1, 2, 's'); g.r(8, 2, 2, 2, 's'); g.p(2, 6, 'k'); g.p(4, 6, 'k'); g.p(6, 6, 'k'); g.p(8, 6, 'k'); });

  // glossary icon ids (and glossary refs) that reuse a glyph
  var ALIAS = {
    claw: 'attack', cloud: 'fluff', 'purr-heart': 'purr', 'closed-eye': 'rested', 'peek-box': 'hidden', 'spiky-tail': 'bristle', 'spark-eye': 'frenzy', 'angry-brow': 'rage',
    'frown-drop': 'wet', 'ghost-fur': 'scared', swirl: 'dizzy', 'static-hair': 'frazzled', 'fang-mouth': 'hiss', 'yarn-ball': 'yarn', crosshair: 'marked', tumbleweed: 'hairball',
    'bad-hair': 'bad_hair', lamp: 'heatlamp', 'ash-card': 'exhaust', wisp: 'fleeting', pin: 'retain', 'phoenix-paw': 'reborn', leap: 'pounce', 'down-arrow': 'down_arrow',
    'kneading-paws': 'knead', 'bait-fish': 'bait_fish', 'ambush-eye': 'ambush_eye', 'target-paw': 'decoy', sparkle: 'cleanse', broom: 'purge', 'echo-rings': 'echo', 'double-claw': 'multistrike',
    'nine-pips': 'nine_pips', 'paw-minus': 'spend_life', 'red-eyes': 'cornered', 'dying-star': 'last_gasp', collar: 'empty_collar', 'moon-z': 'nap', 'falling-vase': 'falling_vase',
    'broken-vase': 'broken_vase', 'flap-door': 'flap_door', 'z-toggle': 'nap', 'stretch-cat': 'stretch', 'alarm-bang': 'alarm', 'clock-moon': 'witching', streak: 'zoom', 'moon-wave': 'night_visitors',
    'flat-box': 'flat_pack', 'cat-pile': 'cat_pile', 'warm-heart': 'snug', 'big-pile': 'heap', leaf: 'nip', 'leaf-burst': 'surge', 'flat-cat': 'flat_cat', 'wall-paws': 'hold_rule',
    'up-arrow': 'up_arrow', 'garden-gate': 'garden_gate', 'tick-clock': 'tick_clock', 'wall-climb': 'wall_climb', 'sneak-feet': 'sneak', 'sun-ray': 'sunbeam', 'dot-glow': 'dot_glow', 'tick-bug': 'tick_bug',
    'bloody-paw': 'costly', 'owl-eye': 'owl_eye', 'big-cat': 'big_cat', 'small-cat': 'small_cat', 'cracked-pot': 'cracked_pot', 'triple-claw': 'multi_attack', stairs: 'climb', shield: 'defend',
    'chevron-up': 'buff', 'drip-skull': 'debuff', 'plus-ring': 'summon', zzz: 'sleep', flame: 'sunbeam', question: 'unknown', hook: 'special', bolt: 'zoomies', 'sun-heart': 'warmth',
    umbrella: 'shade', 'gouge-slot': 'gouge_slot', 'fork-arrow': 'fork', 'paw-stamp': 'mastery', 'grow-arrow': 'evolve', 'heart-house': 'adopt_out', 'swap-box': 'swap_box', 'twin-cat': 'litter',
    heart: 'hp', sword: 'atk', crescent: 'clan_moon', spiral: 'dizzy'
  };
  // resolve any name (glyph, alias, glossary icon id or glossary ref) to a glyph key
  function glossEntry(n) { var gi = root.SB && SB.data && SB.data.glossaryIndex; return gi ? (gi[String(n).toLowerCase()] || null) : null; }
  function resolve(name, depth) {
    if (DEFS[name]) return name;
    if (ALIAS[name]) return resolve(ALIAS[name], 1);
    depth = depth || 0; if (depth > 3) return null;
    var e = glossEntry(name);
    if (e && e.icon && e.icon !== name) return resolve(e.icon, depth + 1);
    var u = String(name).replace(/-/g, '_'); if (u !== name && (DEFS[u] || ALIAS[u])) return resolve(u, depth + 1);
    return null;
  }
  var NAMES = Object.keys(DEFS);
  Object.keys(ALIAS).forEach(function (a) { if (NAMES.indexOf(a) < 0) NAMES.push(a); });
  (function () { var gl = root.SB && SB.data && SB.data.glossary; if (!gl) return; gl.forEach(function (e) { [e.ref, e.icon].forEach(function (k) { if (k && NAMES.indexOf(k) < 0 && resolve(k)) NAMES.push(k); }); }); })();
  function meta(name) {
    var k = resolve(name); if (!k) return null; var d = DEFS[k], e = glossEntry(name), kind = d[0];
    if (e && e.ref === name && (e.tone === 'buff' || e.tone === 'debuff' || e.tone === 'neutral')) kind = e.tone;
    return { name: name, kind: kind, group: d[1], label: (e && e.ref === name && e.name) || d[2] };
  }

  // ---- rendering ----
  function toPixels(name) {
    var d = DEFS[resolve(name) || 'unknown'];
    var g = new Grid(); d[3](g);
    // crop to bbox and center inside 10x10
    var minx = 10, maxx = -1, miny = 10, maxy = -1, x, y;
    for (y = 0; y < 10; y++) for (x = 0; x < 10; x++) if (g.a[y * 10 + x] !== '.') { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
    var out = new Array(144); for (var i = 0; i < 144; i++) out[i] = '.';
    if (maxx < 0) return out;
    var ox = 1 + Math.floor((10 - (maxx - minx + 1)) / 2) - minx, oy = 1 + Math.floor((10 - (maxy - miny + 1)) / 2) - miny;
    for (y = 0; y < 10; y++) for (x = 0; x < 10; x++) { var ch = g.a[y * 10 + x]; if (ch !== '.') { var nx = x + ox, ny = y + oy; if (nx >= 0 && ny >= 0 && nx < 12 && ny < 12) out[ny * 12 + nx] = ch; } }
    // outline
    var res = out.slice(), oc = 'k';
    for (y = 0; y < 12; y++) for (x = 0; x < 12; x++) {
      if (out[y * 12 + x] !== '.') continue;
      var nb = (x > 0 && out[y * 12 + x - 1] !== '.') || (x < 11 && out[y * 12 + x + 1] !== '.') || (y > 0 && out[(y - 1) * 12 + x] !== '.') || (y < 11 && out[(y + 1) * 12 + x] !== '.');
      if (nb) res[y * 12 + x] = oc;
    }
    return res;
  }
  function badge(px, kind) { // 4x4 corner badge at top right, returns list of [x,y,color]
    var col = KIND[kind] || KIND.neutral, d = '#1c1630', out = [], x, y;
    for (y = 0; y < 5; y++) for (x = 0; x < 5; x++) out.push([x, y, d]);
    if (kind === 'buff') { out = []; var t = ['..d..', '.dcd.', 'dcccd', 'ddddd']; for (y = 0; y < 4; y++) for (x = 0; x < 5; x++) if (t[y][x] !== '.') out.push([x, y, t[y][x] === 'c' ? col : d]); }
    else if (kind === 'debuff') { out = []; var t2 = ['ddddd', 'dcccd', '.dcd.', '..d..']; for (y = 0; y < 4; y++) for (x = 0; x < 5; x++) if (t2[y][x] !== '.') out.push([x, y, t2[y][x] === 'c' ? col : d]); }
    else { out = []; for (y = 0; y < 4; y++) for (x = 0; x < 4; x++) out.push([x, y, (x === 0 || y === 0 || x === 3 || y === 3) ? d : col]); }
    return out;
  }
  var cache = {};
  function hasDoc() { return typeof document !== 'undefined'; }
  function canvas(name, scale, opts) {
    opts = opts || {}; scale = scale || 2;
    var key = [name, scale, opts.cb ? 1 : 0, opts.frame ? 1 : 0, opts.tint || ''].join('|');
    if (cache[key]) return cache[key];
    var px = toPixels(name), m = meta(name) || { kind: 'neutral' };
    var W = 12 + (opts.cb ? 3 : 0), H = 12;
    var cv = SB.gfx.createCanvas ? SB.gfx.createCanvas(W * scale, H * scale) : (function () { var c = document.createElement('canvas'); c.width = W * scale; c.height = H * scale; return c; })();
    var ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    var frameCol = opts.frame ? KIND[m.kind] : null;
    for (var y = 0; y < 12; y++) for (var x = 0; x < 12; x++) {
      var ch = px[y * 12 + x]; if (ch === '.') continue;
      var col = ch === 'k' && frameCol ? frameCol : (opts.tint && ch !== 'k' ? opts.tint : PAL[ch]);
      ctx.fillStyle = col; ctx.fillRect(x * scale, y * scale, scale, scale);
    }
    if (opts.cb) {
      var b = badge(scale, m.kind);
      for (var i = 0; i < b.length; i++) { ctx.fillStyle = b[i][2]; ctx.fillRect((11 + b[i][0] - 1) * scale + 0, b[i][1] * scale, scale, scale); }
    }
    return (cache[key] = cv);
  }
  function draw(ctx, name, x, y, opts) {
    opts = opts || {}; var s = opts.scale || 2, cv = canvas(name, s, opts);
    ctx.save(); ctx.imageSmoothingEnabled = false; if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
    ctx.drawImage(cv, Math.round(x), Math.round(y)); ctx.restore();
    return { w: cv.width, h: cv.height };
  }
  function dataURL(name, scale, opts) { return canvas(name, scale, opts).toDataURL('image/png'); }
  function svg(name, scale, opts) { // inline SVG string (run-length rects) for DOM use, crisp edges
    opts = opts || {}; scale = scale || 2; var px = toPixels(name), m = meta(name) || { kind: 'neutral' }, fc = opts.frame ? KIND[m.kind] : null, parts = [];
    for (var y = 0; y < 12; y++) { var x = 0; while (x < 12) { var ch = px[y * 12 + x]; if (ch === '.') { x++; continue; } var x2 = x; while (x2 + 1 < 12 && px[y * 12 + x2 + 1] === ch) x2++; var col = ch === 'k' && fc ? fc : PAL[ch]; parts.push('<rect x="' + x + '" y="' + y + '" width="' + (x2 - x + 1) + '" height="1" fill="' + col + '"/>'); x = x2 + 1; } }
    if (opts.cb) { var b = badge(1, m.kind); for (var i = 0; i < b.length; i++) parts.push('<rect x="' + (10 + b[i][0]) + '" y="' + b[i][1] + '" width="1" height="1" fill="' + b[i][2] + '"/>'); }
    var W = 12 + (opts.cb ? 3 : 0);
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + (W * scale) + '" height="' + (12 * scale) + '" viewBox="0 0 ' + W + ' 12" shape-rendering="crispEdges" role="img" aria-label="' + (m.label || name) + '">' + parts.join('') + '</svg>';
  }
  // statuses whose icons carry a stack number get a pixel digit drawn by fx.drawText; helper returns kind color
  SB.gfx.icons = { names: NAMES, meta: meta, draw: draw, canvas: canvas, dataURL: dataURL, svg: svg, kindColor: KIND, palette: PAL, has: function (n) { return !!resolve(n); }, resolve: resolve, groups: function (g) { return Object.keys(DEFS).filter(function (n) { return DEFS[n][1] === g; }); } };
})();
