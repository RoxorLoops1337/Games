/* SUNBEAM SIEGE procedural scenes (C4): title screen house, keyword-driven vignettes for story panels, events,
 * interstitials and summary art. Everything is drawn with canvas rects at a low logical resolution and upscaled
 * with image-rendering: pixelated. Sprites come from SB.gfx.pawprint / SB.gfx.pestprint. No images, no em dashes.
 *   SB.ui.scene.vignette(art, {w,h,scale,seed,mood}) -> canvas   (animated, cleans up when removed from DOM)
 *   SB.ui.scene.title(opts) -> canvas                              (full bleed animated house)
 */
(function () {
  'use strict';
  var K = SB.ui.kit;
  var S = SB.ui.scene = {};

  var C = {
    skyTop: '#0f0b24', skyMid: '#1d1745', skyLow: '#3a2a5e', moon: '#fff1c9', star: '#ffe9a8', roofs: '#2a2147', garden: '#1b2a3a', grass: '#2f5a4a',
    wall: '#5a3a4a', trim: '#8a5a5a', papA: '#6b4558', papB: '#5f3d50', stone: '#3d3a4f', stoneHi: '#4d4a62', wood: '#6a4a3a', woodHi: '#7e5a46',
    floor: '#3b2530', glow: '#ffc766', sun: '#ffd95a', sunHi: '#fff3b0', ink: '#140f26'
  };
  var BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

  function R(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function mix(a, b, t) {
    function p(h) { h = h.replace('#', ''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
    var x = p(a), y = p(b); return 'rgb(' + Math.round(x[0] + (y[0] - x[0]) * t) + ',' + Math.round(x[1] + (y[1] - x[1]) * t) + ',' + Math.round(x[2] + (y[2] - x[2]) * t) + ')';
  }
  // dithered vertical gradient between colors
  function dither(ctx, x, y, w, h, stops) {
    // stops: array of colors, evenly spaced, 2x2 Bayer-ish blend between neighbours
    var n = stops.length - 1;
    for (var j = 0; j < h; j++) {
      var f = (j / Math.max(1, h - 1)) * n, i = Math.min(n - 1, Math.floor(f)), t = f - i;
      for (var k = 0; k < w; k++) {
        var th = BAYER[j & 3][k & 3] / 16;
        ctx.fillStyle = t > th ? stops[i + 1] : stops[i];
        ctx.fillRect(x + k, y + j, 1, 1);
      }
    }
  }
  function rngOf(seed) { return K.rngFor(String(seed)); }

  // ------------------------------------------------------------------ backdrops. each returns {floor: y of the floor line}
  var BG = {};
  BG.exterior = function (ctx, W, H, o) {
    var dawn = o.dawn, r = o.rng;
    dither(ctx, 0, 0, W, Math.round(H * 0.8), dawn ? ['#2a2147', '#6b4a7a', '#d98a6a', '#ffcf8a'] : [C.skyTop, C.skyMid, C.skyLow]);
    if (!o.noMoon) { var mx = Math.round(W * 0.78), my = Math.round(H * 0.2), mr = Math.max(4, Math.round(H * 0.09)); disc(ctx, mx, my, mr, dawn ? '#ffe2b0' : C.moon); disc(ctx, mx - 2, my - 1, 1, '#e8d6a8'); }
    for (var i = 0; i < Math.round(W / 6); i++) { var sx = Math.floor(r() * W), sy = Math.floor(r() * H * 0.55); o.stars.push([sx, sy, r()]); }
    // far roofs silhouette
    var base = Math.round(H * 0.74), x = 0;
    while (x < W) { var bw = 14 + Math.floor(r() * 22), bh = 6 + Math.floor(r() * 12); R(ctx, x, base - bh, bw, bh + 20, C.roofs); if (r() < 0.6) { for (var k = 0; k < bw / 2; k++) R(ctx, x + k, base - bh - (k < bw / 4 ? k : bw / 2 - k) / 2, 1, 1, C.roofs); } x += bw; }
    // ground
    var gy = Math.round(H * 0.8); R(ctx, 0, gy, W, H - gy, o.snow ? '#6a7a96' : C.garden);
    for (var g = 0; g < W; g += 3) { var gh = 1 + Math.floor(r() * 2); R(ctx, g, gy - gh + 1, 1, gh, o.snow ? '#aab8d0' : C.grass); }
    if (o.house) house(ctx, Math.round(W * 0.5) - 40, gy, 80, Math.round(H * 0.55), o);
    return { floor: gy + 3, outdoor: true };
  };
  function disc(ctx, cx, cy, r, c) { for (var y = -r; y <= r; y++) for (var x = -r; x <= r; x++) if (x * x + y * y <= r * r + 1) R(ctx, cx + x, cy + y, 1, 1, c); }
  function house(ctx, x, gy, w, h, o) {
    var top = gy - h;
    R(ctx, x, top + 14, w, h - 14, C.wall);
    for (var i = 0; i < 3; i++) R(ctx, x, top + 14 + i * Math.round((h - 14) / 3), w, 1, C.trim);
    // roof
    for (var k = 0; k < 14; k++) R(ctx, x - 3 + k, top + 14 - k, w + 6 - 2 * k, 1, k % 2 ? '#3b2a52' : '#2f2145');
    R(ctx, x + w - 14, top - 2, 6, 14, '#3b2a52');
    // windows
    var rows = 3, wy = top + 18;
    for (var r = 0; r < rows; r++) for (var c = 0; c < 3; c++) {
      var wx = x + 10 + c * 24, lit = !(r === 1 && c === 0) || o.lit; var yy = wy + r * Math.round((h - 20) / 3);
      R(ctx, wx - 1, yy - 1, 12, 12, C.ink); R(ctx, wx, yy, 10, 10, lit ? C.glow : '#241a40');
      if (lit) { R(ctx, wx, yy, 10, 2, C.sunHi); R(ctx, wx + 4, yy, 1, 10, C.ink); R(ctx, wx, yy + 4, 10, 1, C.ink); }
    }
    R(ctx, x + w / 2 - 4, gy - 10, 8, 10, '#2b1a2a'); R(ctx, x + w / 2 + 2, gy - 6, 1, 1, C.glow);
  }
  BG.attic = function (ctx, W, H, o) {
    R(ctx, 0, 0, W, H, C.wood);
    for (var x = 0; x < W; x += 6) R(ctx, x, 0, 1, H, '#5a3c2e');
    for (var y = 0; y < H; y += 9) R(ctx, 0, y, W, 1, '#5a3c2e');
    // rafters
    for (var k = 0; k < 4; k++) { var bx = Math.round(W * (0.1 + 0.27 * k)); for (var j = 0; j < H * 0.5; j++) R(ctx, bx + Math.round(j * 0.6), j, 3, 1, '#3e2a20'); }
    R(ctx, 0, 0, W, 4, '#3e2a20');
    var fy = Math.round(H * 0.78); R(ctx, 0, fy, W, H - fy, C.floor); for (var f = 0; f < W; f += 14) R(ctx, f, fy, 1, H - fy, '#2c1a24'); R(ctx, 0, fy, W, 1, C.woodHi);
    if (o.trunk) { trunk(ctx, Math.round(W * 0.12), fy, 22); trunk(ctx, Math.round(W * 0.84), fy, 18); }
    return { floor: fy + 4 };
  };
  function trunk(ctx, x, fy, w) { R(ctx, x, fy - 12, w, 12, '#6a4326'); R(ctx, x, fy - 12, w, 2, '#8a5b34'); R(ctx, x, fy - 7, w, 1, '#3b2414'); R(ctx, x + 1, fy - 12, 2, 12, '#b08a4a'); R(ctx, x + w - 3, fy - 12, 2, 12, '#b08a4a'); R(ctx, x + w / 2 - 1, fy - 8, 3, 3, '#e8c06a'); }
  BG.cellar = function (ctx, W, H, o) {
    R(ctx, 0, 0, W, H, C.stone);
    var r = o.rng;
    for (var y = 0; y < H; y += 6) { var off = (y / 6) % 2 ? 6 : 0; R(ctx, 0, y, W, 1, '#2f2d3e'); for (var x = -off; x < W; x += 12) R(ctx, x, y, 1, 6, '#2f2d3e'); }
    for (var i = 0; i < 40; i++) R(ctx, Math.floor(r() * W), Math.floor(r() * H * 0.8), 5, 1, C.stoneHi);
    var fy = Math.round(H * 0.8); R(ctx, 0, fy, W, H - fy, '#2a2838'); R(ctx, 0, fy, W, 1, '#4d4a62');
    if (o.barrel) { R(ctx, Math.round(W * 0.2), fy - 14, 16, 14, '#7a5326'); R(ctx, Math.round(W * 0.2), fy - 11, 16, 1, '#3b2414'); R(ctx, Math.round(W * 0.2), fy - 4, 16, 1, '#3b2414'); R(ctx, Math.round(W * 0.2), fy - 14, 16, 2, '#9a6c34'); }
    if (o.shelf) { R(ctx, Math.round(W * 0.55), Math.round(H * 0.3), 34, 2, '#7a5326'); R(ctx, Math.round(W * 0.6), Math.round(H * 0.3) - 7, 4, 7, '#cfe6ff'); R(ctx, Math.round(W * 0.6) + 1, Math.round(H * 0.3) - 5, 2, 4, '#ff6fae'); }
    if (o.wine) { for (var w = 0; w < 5; w++) { R(ctx, Math.round(W * 0.62) + w * 6, fy - 22, 4, 22, '#2d1b2a'); R(ctx, Math.round(W * 0.62) + w * 6 + 1, fy - 22, 2, 4, '#7be495'); } }
    return { floor: fy + 4 };
  };
  BG.parlor = function (ctx, W, H, o) {
    R(ctx, 0, 0, W, H, C.papA);
    for (var x = 0; x < W; x += 8) R(ctx, x, 0, 4, H, C.papB);
    var r = o.rng; for (var i = 0; i < 24; i++) { var rx = Math.floor(r() * W), ry = Math.floor(r() * H * 0.6); R(ctx, rx, ry, 2, 2, '#8a5a6a'); }
    var fy = Math.round(H * 0.76); R(ctx, 0, fy - 5, W, 5, C.trim); R(ctx, 0, fy, W, H - fy, '#3b2530');
    R(ctx, Math.round(W * 0.25), fy + 3, Math.round(W * 0.5), Math.round(H * 0.16), '#7a3a4a'); R(ctx, Math.round(W * 0.25), fy + 3, Math.round(W * 0.5), 1, '#a85a68');
    if (o.sofa) { R(ctx, Math.round(W * 0.05), fy - 14, 36, 14, '#3a2a4a'); R(ctx, Math.round(W * 0.05), fy - 14, 36, 3, '#4a3a5a'); R(ctx, Math.round(W * 0.05) - 3, fy - 10, 4, 10, '#4a3a5a'); }
    if (o.lamp) { R(ctx, Math.round(W * 0.9), fy - 22, 2, 22, '#2b1a2a'); R(ctx, Math.round(W * 0.9) - 4, fy - 28, 10, 7, '#ffc766'); }
    if (o.piano) { R(ctx, Math.round(W * 0.58), fy - 18, 36, 18, '#1c1630'); R(ctx, Math.round(W * 0.58), fy - 18, 36, 2, '#3a2c52'); for (var k = 0; k < 10; k++) R(ctx, Math.round(W * 0.58) + 2 + k * 3, fy - 16, 2, 3, '#f6ecd8'); }
    return { floor: fy + 5 };
  };
  BG.kitchen = function (ctx, W, H, o) {
    R(ctx, 0, 0, W, H, '#cdbfa8');
    for (var y = 0; y < H; y += 8) R(ctx, 0, y, W, 1, '#a89878'); for (var x = 0; x < W; x += 8) R(ctx, x, 0, 1, H, '#a89878');
    var fy = Math.round(H * 0.78); R(ctx, 0, fy, W, H - fy, '#6a5a52');
    for (var f = 0; f < W; f += 10) R(ctx, f, fy, 1, H - fy, '#554640');
    R(ctx, Math.round(W * 0.55), fy - 20, Math.round(W * 0.45), 20, '#8a6a4a'); R(ctx, Math.round(W * 0.55), fy - 20, Math.round(W * 0.45), 2, '#b08a5a');
    return { floor: fy + 4 };
  };
  BG.stairs = function (ctx, W, H, o) {
    R(ctx, 0, 0, W, H, '#1c1630');
    for (var k = 0; k < 8; k++) { var sx = Math.round(W * 0.25 + k * W * 0.07), sy = Math.round(H * 0.85 - k * H * 0.08); R(ctx, sx, sy, Math.round(W * 0.55 - k * W * 0.06), 4, '#3b2530'); R(ctx, sx, sy, Math.round(W * 0.55 - k * W * 0.06), 1, '#5a3a4a'); }
    return { floor: Math.round(H * 0.88) };
  };
  BG.bath = function (ctx, W, H) {
    R(ctx, 0, 0, W, H, '#7ab8c8'); for (var y = 0; y < H; y += 8) R(ctx, 0, y, W, 1, '#5a98a8'); for (var x = 0; x < W; x += 8) R(ctx, x, 0, 1, H, '#5a98a8');
    var fy = Math.round(H * 0.8); R(ctx, 0, fy, W, H - fy, '#4a7888'); return { floor: fy + 3 };
  };

  // ------------------------------------------------------------------ parse text -> scene spec
  var PEST_WORDS = [
    ['mice', 'mouse'], ['mouse', 'mouse'], ['rat', 'rat'], ['dog', 'dog_large'], ['crow', 'crow'], ['pigeon', 'crow'], ['raccoon', 'raccoon'], ['spider', 'spider'], ['snake', 'snake'],
    ['hose', 'hose'], ['vacuum', 'vacuum'], ['spray bottle', 'spray_bottle'], ['cucumber', 'cucumber'], ['carrier', 'carrier_crate'], ['red laser dot', 'red_dot'], ['red dot', 'red_dot'],
    ['mop', 'mop'], ['goblin', 'rat'], ['fox', 'fox'], ['goose', 'goose'], ['hamster', 'hamster'], ['squirrel', 'squirrel'], ['hair dryer', 'hair_dryer'], ['balloon', 'balloon'], ['bath', 'bathtub']
  ];
  function parse(art) {
    var t = String(art || '').toLowerCase();
    var spec = { t: t, bg: 'parlor', cats: 0, pests: [], human: false, dawn: false, sun: false, dark: false, snow: false, props: {} };
    function has(w) { return t.indexOf(w) >= 0; }
    if (has('night street') || has('terraced house')) spec.bg = 'exterior';
    else if (has('attic') || has('beam') || has('rafter')) spec.bg = 'attic';
    else if (has('cellar') || has('basement') || has('boiler') || has('drain grate')) spec.bg = 'cellar';
    else if (has('kitchen')) spec.bg = 'kitchen';
    else if (has('bath') && !has('bathing')) spec.bg = 'bath';
    else if (has('staircase') || (has('stairs') && !has('cellar stairs'))) spec.bg = 'stairs';
    else if (has('street') || has('garden') || has('lawn') || has('roof ') || has('rooftop') || has('ridge') || has('gutter') || has('outside') || has('slate roof')) spec.bg = 'exterior';
    else if (has('parlor') || has('piano') || has('sofa') || has('rug') || has('wallpaper') || has('curtain') || has('mirror') || has('sideboard')) spec.bg = 'parlor';
    if (has('cellar stairs')) spec.bg = 'cellar';
    spec.dawn = has('dawn') || has('morning') || has('sunrise');
    spec.sun = has('sunbeam') || has('sunlight') || has('shaft') || has('golden') || has('light spilling') || has('patch of golden') || has('warm air');
    spec.dark = has('dark') || has('night') || has('shadow');
    spec.snow = has('snow') || has('frost');
    spec.props.house = has('terraced house') || has('night street');
    spec.props.cushion = has('cushion');
    spec.props.trunk = has('trunk');
    spec.props.barrel = has('barrel');
    spec.props.shelf = has('shelf');
    spec.props.wine = has('wine rack');
    spec.props.lamp = has('lamp') || has('lantern') || has('candle');
    spec.props.sofa = has('sofa');
    spec.props.piano = has('piano');
    spec.props.window = has('window') || has('blind');
    spec.props.blind = has('blind');
    spec.props.door = has('door') || has('doorway');
    spec.props.box = has('box') || has('crate');
    spec.props.yarn = has('yarn');
    spec.props.moon = has('moon');
    spec.props.clock = has('alarm clock') || has('clock');
    spec.props.mirror = has('mirror');
    spec.props.fish = has('fish tank');
    spec.props.gnome = has('gnome');
    spec.props.vase = has('vase');
    spec.props.saucer = has('saucer');
    spec.props.coin = has('coin');
    spec.props.letter = has('postcard');
    // actors
    var elder = has('elder cat') || has('old grey cat') || has('elderly grey cat') || has('very old grey cat') || has('tiny ancient grey cat');
    spec.elder = elder;
    if (has('clowder') || has('cats in a pile') || has('ring of cats') || has('crowd of cats') || has('every cat') || has('row') && has('cats')) spec.cats = 5;
    else if (/\bcats\b/.test(t)) spec.cats = 3;
    else if (/\b(cat|tabby|kitten|champion)\b/.test(t)) spec.cats = 1;
    if (elder && spec.cats === 0) spec.cats = 1;
    var used = {};
    PEST_WORDS.forEach(function (pw) { if (has(pw[0]) && !used[pw[1]]) { used[pw[1]] = 1; spec.pests.push(pw[1]); } });
    if (has('raccoon') && !used.raccoon) spec.pests.push('raccoon');
    spec.gerald = has('raccoon') && (has('trench coat') || has('coat'));
    spec.human = has('human') || has('staff') || has('silhouette in doorway') || has('slipper');
    spec.pests = spec.pests.slice(0, 4);
    return spec;
  }

  // ------------------------------------------------------------------ props
  function window_(ctx, x, y, w, h, o) {
    R(ctx, x - 2, y - 2, w + 4, h + 4, '#3b2530'); R(ctx, x, y, w, h, o.blind ? '#9a7a5a' : (o.dawn ? '#ffcf8a' : (o.dark ? '#2a2060' : C.glow)));
    if (o.blind) { for (var i = 2; i < h; i += 3) R(ctx, x, y + i, w, 1, '#7a5a3a'); }
    else { R(ctx, x + w / 2, y, 1, h, '#3b2530'); R(ctx, x, y + h / 2, w, 1, '#3b2530'); }
  }
  function door_(ctx, x, y, w, h) { R(ctx, x - 2, y - 2, w + 4, h + 2, '#2b1a2a'); R(ctx, x, y, w, h, '#e8dfd0'); R(ctx, x + 2, y + 3, w - 4, h / 2 - 4, '#d4c9b8'); R(ctx, x + 2, y + h / 2 + 1, w - 4, h / 2 - 4, '#d4c9b8'); R(ctx, x + w - 4, y + h / 2, 2, 2, '#c9962a'); }
  function cushion_(ctx, x, y, w) { R(ctx, x, y - 6, w, 6, '#ff8fb0'); R(ctx, x + 2, y - 7, w - 4, 1, '#ffc0d4'); R(ctx, x, y - 1, w, 1, '#b13445'); R(ctx, x + w / 2 - 1, y - 8, 3, 2, '#ffd95a'); }
  function box_(ctx, x, y, w, h) { R(ctx, x, y - h, w, h, '#c99a62'); R(ctx, x, y - h, w, 2, '#e8c28a'); R(ctx, x + w / 2 - 1, y - h, 2, h, '#a87a42'); R(ctx, x, y - 2, w, 2, '#7a5326'); }
  function shaft(ctx, W, H, fx, tick, o) {
    // diagonal golden shaft from the upper left window to the floor
    ctx.save(); ctx.globalAlpha = 0.20 + Math.sin(tick / 40) * 0.02;
    ctx.fillStyle = C.sun; ctx.beginPath();
    var x0 = o.sx != null ? o.sx : W * 0.18; ctx.moveTo(x0, 0); ctx.lineTo(x0 + W * 0.18, 0); ctx.lineTo(W * 0.7, fx); ctx.lineTo(W * 0.38, fx); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.12; ctx.fillStyle = C.sunHi; ctx.beginPath(); ctx.moveTo(x0 + W * 0.05, 0); ctx.lineTo(x0 + W * 0.12, 0); ctx.lineTo(W * 0.6, fx); ctx.lineTo(W * 0.46, fx); ctx.closePath(); ctx.fill();
    ctx.restore();
    // floor pool
    ctx.save(); ctx.globalAlpha = 0.35; R(ctx, W * 0.36, fx - 2, W * 0.34, 4, C.sunHi); ctx.restore();
  }
  function human_(ctx, x, fy, s, tick) {
    var sway = Math.round(Math.sin(tick / 60)); x = Math.round(x);
    R(ctx, x - 5, fy - 38 * s, 10, 24 * s, '#2a2040'); R(ctx, x - 4, fy - 44 * s, 8, 8 * s, '#3a3050'); R(ctx, x - 4, fy - 46 * s, 8, 3, '#2a2040');
    R(ctx, x - 5 + sway, fy - 14 * s, 4, 14 * s, '#1c1630'); R(ctx, x + 1 - sway, fy - 14 * s, 4, 14 * s, '#1c1630'); R(ctx, x + 5, fy - 30 * s, 3, 12 * s, '#2a2040');
    R(ctx, x - 2, fy - 41 * s, 1, 1, '#ffc766'); R(ctx, x + 1, fy - 41 * s, 1, 1, '#ffc766');
  }

  // ------------------------------------------------------------------ vignette
  S.vignette = function (art, o) {
    o = o || {};
    var W = o.w || 160, H = o.h || 90, sc = o.scale || 4;
    var cv = K.h('canvas.spr.vignette', { width: W, height: H, role: 'img', 'aria-label': o.label || 'Illustration', style: 'width:' + (W * sc) + 'px;height:' + (H * sc) + 'px;max-width:100%;height:auto;aspect-ratio:' + W + '/' + H });
    var ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    var spec = parse(art), seed = o.seed || art || 'x';
    var rng = rngOf(seed), stars = [];
    // backdrop cached on an offscreen
    var back = document.createElement('canvas'); back.width = W; back.height = H; var bx = back.getContext('2d');
    var geo = (BG[spec.bg] || BG.parlor)(bx, W, H, { rng: rng, dawn: spec.dawn, stars: stars, snow: spec.snow, house: spec.props.house, lit: true, trunk: spec.props.trunk, barrel: spec.props.barrel, shelf: spec.props.shelf, wine: spec.props.wine, sofa: spec.props.sofa, lamp: spec.props.lamp, piano: spec.props.piano, noMoon: spec.bg !== 'exterior' });
    var fy = geo.floor;
    if (spec.props.window && spec.bg !== 'exterior') window_(bx, Math.round(W * 0.14), Math.round(H * 0.16), 22, 30, { blind: spec.props.blind, dawn: spec.dawn, dark: spec.dark && !spec.sun });
    if (spec.props.door && !spec.human) door_(bx, Math.round(W * 0.8), fy - 38, 18, 38);
    if (spec.props.door && spec.human) door_(bx, Math.round(W * 0.78), fy - 44, 22, 44);
    if (spec.props.cushion) cushion_(bx, Math.round(W * 0.38), fy + 1, 30);
    if (spec.props.box && spec.pests.length === 0) box_(bx, Math.round(W * 0.64), fy + 1, 22, 16);
    if (spec.props.mirror) { R(bx, Math.round(W * 0.82), Math.round(H * 0.12), 16, 40, '#8a6a3a'); R(bx, Math.round(W * 0.82) + 2, Math.round(H * 0.12) + 2, 12, 36, '#9ac0d8'); }
    if (spec.props.fish) { R(bx, Math.round(W * 0.55), fy - 20, 30, 18, '#3a6a8a'); R(bx, Math.round(W * 0.55) + 2, fy - 18, 26, 14, '#5aa8c8'); R(bx, Math.round(W * 0.55) + 10, fy - 13, 5, 3, '#ff8a3d'); }
    if (spec.props.gnome) { R(bx, Math.round(W * 0.7), fy - 14, 8, 14, '#e8dfd0'); R(bx, Math.round(W * 0.7), fy - 18, 8, 5, '#ff5d6c'); }
    if (spec.props.coin) { R(bx, Math.round(W * 0.5), fy - 1, 3, 2, '#ffd95a'); }
    // actors setup
    var cats = [], pests = [];
    var genome = null;
    if (spec.elder) genome = 'elder_cat';
    else genome = art;
    var P = SB.gfx && SB.gfx.pawprint;
    var nCats = spec.cats;
    for (var i = 0; i < nCats; i++) {
      var gx = i === 0 && spec.elder ? 'elder_cat' : (i === 0 ? art : (art + '#' + i));
      var g = K.genomeFor(i === 0 && spec.elder ? 'elder_cat' : gx.indexOf(' ') > 0 ? gx : 'cat' + i + seed);
      if (g && i > 0) { g = Object.assign({}, g, { seed: K.hash(seed + i) }); try { g = P.randomGenome(K.hash(seed + ':' + i), {}); } catch (e) { /* ignore */ } }
      cats.push(g);
    }
    var tickBase = (rng() * 100) | 0;
    var motes = []; for (var m = 0; m < 14; m++) motes.push([rng() * W, rng() * H * 0.8, 0.1 + rng() * 0.2]);
    var flakes = []; if (spec.snow) for (var f = 0; f < 30; f++) flakes.push([rng() * W, rng() * H, 0.2 + rng() * 0.4]);
    var catScale = o.catScale || (H >= 100 ? 3 : 2), pestScale = o.pestScale || (H >= 100 ? 2 : 1.5);
    function draw(t) {
      ctx.clearRect(0, 0, W, H); ctx.drawImage(back, 0, 0);
      stars.forEach(function (s) { if (spec.bg === 'exterior' && !spec.dawn) R(ctx, s[0], s[1], 1, 1, ((t / 20 + s[2] * 9) | 0) % 5 ? C.star : C.skyLow); });
      if (spec.sun) shaft(ctx, W, fy, fy, t, {});
      if (spec.props.lamp) { ctx.save(); ctx.globalAlpha = 0.12 + Math.sin(t / 15) * 0.02; ctx.fillStyle = C.glow; ctx.fillRect(0, 0, W, H); ctx.restore(); }
      // actors
      var gl = Math.round(fy), n = cats.length;
      for (var i = 0; i < n; i++) {
        var cx = n === 1 ? W * (spec.elder ? 0.42 : 0.3) : W * (0.12 + 0.46 * (i / Math.max(1, n - 1)));
        var sleeping = spec.t.indexOf('asleep') >= 0 || spec.t.indexOf('sleep') >= 0 && i % 2 === 0;
        var cy = gl - 30 * catScale + 2 + ((i % 2) ? -3 : 0);
        if (cats[i]) { try { P.drawCat(ctx, cats[i], { name: sleeping ? 'sleep' : 'idle', flip: false }, Math.round(cx - 16 * catScale / 1), Math.round(cy), catScale, t + i * 17); } catch (e) { /* ignore */ } }
      }
      var pn = spec.pests.length;
      spec.pests.forEach(function (sp, i) {
        var px = W * (0.86 - (pn > 1 ? 0.26 * i : 0)) , sprDesc = { species: sp, seed: K.hash(sp) };
        if (spec.gerald && sp === 'raccoon') sprDesc.accessory = 'hat_top';
        try { K.drawPestAt(ctx, sprDesc, 'idle', Math.round(px), gl + 1, pestScale, t, { flip: true }); } catch (e) { /* ignore */ }
      });
      if (spec.human) human_(ctx, W * (spec.props.door ? 0.88 : 0.82), gl, 1.2, t);
      // motes in light
      if (spec.sun || spec.props.lamp) motes.forEach(function (mm) { var yy = (mm[1] + t * mm[2]) % (fy), xx = mm[0] + Math.sin(t / 30 + mm[1]) * 2; R(ctx, xx, yy, 1, 1, C.sunHi); });
      flakes.forEach(function (fk) { var yy = (fk[1] + t * fk[2]) % H, xx = fk[0] + Math.sin(t / 25 + fk[1]) * 2; R(ctx, xx, yy, 1, 1, '#e8f0ff'); });
      if (spec.dark && !spec.sun && spec.bg !== 'exterior') { ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = '#0a0716'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
      // vignette edges
      ctx.save(); ctx.globalAlpha = 0.25; ctx.fillStyle = '#0a0716'; ctx.fillRect(0, 0, W, 2); ctx.fillRect(0, H - 2, W, 2); ctx.restore();
    }
    if (o.animate === false) draw(tickBase); else K.registerAnim(cv, draw);
    return cv;
  };

  // ------------------------------------------------------------------ title scene
  S.title = function (o) {
    o = o || {};
    var cv = K.h('canvas.spr.title-scene', { 'aria-hidden': 'true' });
    var ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    var W = 0, H = 0, back = null, stars = [], clouds = [], rng = rngOf('title'), portrait = false;
    var layout = null;
    function setup() {
      var vw = cv.parentNode ? cv.parentNode.clientWidth || window.innerWidth : window.innerWidth, vh = cv.parentNode ? cv.parentNode.clientHeight || window.innerHeight : window.innerHeight;
      var aspect = vw / Math.max(1, vh);
      var sc = Math.max(2, Math.min(6, Math.round(Math.min(vh / 190, vw / 120))));
      W = Math.max(100, Math.round(vw / sc)); H = Math.max(120, Math.round(vh / sc));
      portrait = aspect < 0.8;
      cv.width = W; cv.height = H; ctx.imageSmoothingEnabled = false;
      rng = rngOf('title'); stars = [];
      back = document.createElement('canvas'); back.width = W; back.height = H; var b = back.getContext('2d');
      dither(b, 0, 0, W, Math.round(H * 0.8), [C.skyTop, C.skyMid, C.skyLow, '#5a3a6e']);
      for (var i = 0; i < Math.round(W / 4); i++) stars.push([Math.floor(rng() * W), Math.floor(rng() * H * 0.6), rng()]);
      // far roofs
      var base = Math.round(H * (portrait ? 0.66 : 0.78)) - 4, x = 0;
      while (x < W) { var bw = 12 + Math.floor(rng() * 24), bh = 8 + Math.floor(rng() * 18); R(b, x, base - bh, bw, bh + 30, C.roofs); for (var k = 0; k < Math.floor(bw / 2); k++) R(b, x + k, base - bh - (k < bw / 4 ? k : bw / 2 - k) / 2, 1, 1, C.roofs); if (rng() < 0.5) R(b, x + 3, base - bh + 4, 2, 2, '#ffc76688'); x += bw; }
      // ground
      var gy = Math.round(H * (portrait ? 0.66 : 0.86));
      R(b, 0, gy, W, H - gy, C.garden);
      for (var g = 0; g < W; g += 2) { var gh = 1 + Math.floor(rng() * 3); R(b, g, gy - gh + 1, 1, gh, rng() < 0.3 ? '#3e7a5a' : C.grass); }
      // the house, scaled by height
      var hw = Math.min(W - 24, portrait ? 84 : 112), hh = Math.min(Math.round(H * 0.5), Math.round(hw * 1.1));
      var hx = Math.round(W * 0.5 - hw / 2) + (!portrait && W > 260 ? Math.round(W * 0.14) : 0);
      layout = { hx: hx, hw: hw, hh: hh, gy: gy, top: gy - hh };
      drawHouse(b, hx, gy, hw, hh);
      // moon
      var mx = Math.round(W * (portrait ? 0.82 : 0.2)), my = Math.round(H * (portrait ? 0.3 : 0.16)); disc(b, mx, my, 9, C.moon); disc(b, mx - 3, my - 2, 2, '#e8d6a8'); disc(b, mx + 3, my + 3, 1, '#e8d6a8');
      clouds = []; for (var c = 0; c < 5; c++) clouds.push({ x: rng() * W, y: H * (0.1 + rng() * 0.4), w: 24 + rng() * 40, sp: 0.04 + rng() * 0.08 });
    }
    function drawHouse(b, x, gy, w, h) {
      var top = gy - h, floorH = Math.round((h - 24) / 3);
      // body: attic (top), parlor, cellar
      var ay = top + 20;
      R(b, x, ay, w, floorH, C.wood); R(b, x, ay + floorH, w, floorH, C.papA); R(b, x, ay + floorH * 2, w, floorH, C.stone);
      for (var i = 0; i < w; i += 6) { R(b, x + i, ay, 1, floorH, '#5a3c2e'); R(b, x + i, ay + floorH, 3, floorH, C.papB); }
      for (var j = 0; j < w; j += 10) { R(b, x + j, ay + floorH * 2, 1, floorH, '#2f2d3e'); }
      R(b, x, ay + floorH - 1, w, 2, C.floor); R(b, x, ay + floorH * 2 - 1, w, 2, C.floor); R(b, x, gy - 2, w, 2, C.floor);
      R(b, x - 1, ay, 1, floorH * 3, C.ink); R(b, x + w, ay, 1, floorH * 3, C.ink);
      // roof
      for (var k = 0; k < 20; k++) R(b, x - 4 + k, top + 20 - k, w + 8 - 2 * k, 1, k % 2 ? '#3b2a52' : '#34254a');
      R(b, x + w - 22, top - 4, 7, 16, '#3b2a52'); R(b, x + w - 23, top - 5, 9, 2, '#2f2145');
      layout.chimney = [x + w - 19, top - 6];
      // windows: attic big round-ish glowing, parlor x2, cellar x2 (cellar dim)
      var ww = 14;
      function win(wx, wy, lit, big) { R(b, wx - 1, wy - 1, ww + 2, (big ? 16 : 12) + 2, C.ink); R(b, wx, wy, ww, big ? 16 : 12, lit ? C.glow : '#241a40'); if (lit) { R(b, wx, wy, ww, 2, C.sunHi); R(b, wx + ww / 2, wy, 1, big ? 16 : 12, C.ink); R(b, wx, wy + (big ? 8 : 6), ww, 1, C.ink); } }
      win(x + Math.round(w / 2 - ww / 2), ay + 5, true, true);
      win(x + 10, ay + floorH + 8, true); win(x + w - 10 - ww, ay + floorH + 8, true);
      win(x + 12, ay + floorH * 2 + 8, false); win(x + w - 12 - ww, ay + floorH * 2 + 8, true);
      // door
      R(b, x + Math.round(w / 2) - 5, gy - 14, 10, 14, '#2b1a2a'); R(b, x + Math.round(w / 2) + 2, gy - 8, 1, 1, C.glow);
      // cat flap
      R(b, x + Math.round(w / 2) + 12, gy - 6, 5, 5, '#140f26');
      layout.attic = [x + Math.round(w / 2 - ww / 2), ay + 5];
      layout.ridge = [x + Math.round(w * 0.3), top + 20 - Math.round(w * 0.15)];
    }
    var walkers = [{ sp: 'mouse', x: -10, v: 0.18, y: 0 }, { sp: 'rat', x: -60, v: 0.13, y: 0 }, { sp: 'dog_small', x: -130, v: 0.1, y: 0 }];
    function draw(t) {
      if (!back) setup();
      ctx.clearRect(0, 0, W, H); ctx.drawImage(back, 0, 0);
      var red = K.reduced();
      stars.forEach(function (s) { var tw = ((t / 24 + s[2] * 11) | 0) % 6; R(ctx, s[0], s[1], 1, 1, tw === 0 && !red ? C.skyLow : tw === 1 ? '#fff' : C.star); });
      // clouds
      ctx.save(); ctx.globalAlpha = 0.5;
      clouds.forEach(function (c) { var cx = ((c.x + (red ? 0 : t * c.sp)) % (W + c.w)) - c.w * 0.5; R(ctx, cx, c.y, c.w, 3, '#3a2a5e'); R(ctx, cx + 4, c.y - 2, c.w - 10, 2, '#4a3a70'); R(ctx, cx + 8, c.y + 3, c.w - 16, 2, '#2a2147'); });
      ctx.restore();
      // sunbeam through the attic window
      var a = layout.attic;
      ctx.save(); ctx.globalAlpha = 0.18 + (red ? 0 : Math.sin(t / 30) * 0.04); ctx.fillStyle = C.sun; ctx.beginPath(); ctx.moveTo(a[0] + 2, a[1]); ctx.lineTo(a[0] + 12, a[1]); ctx.lineTo(a[0] + 12 + 40, 0); ctx.lineTo(a[0] - 20, 0); ctx.closePath(); ctx.fill(); ctx.restore();
      // window flicker
      if (!red && (t % 90) < 4) R(ctx, layout.hx + 10, layout.top + 20 + Math.round((layout.hh - 24) / 3) + 8, 14, 12, '#d8a050');
      // chimney smoke
      var cm = layout.chimney;
      if (!red) for (var s = 0; s < 4; s++) { var st = ((t / 3 + s * 20) % 80) / 80; ctx.save(); ctx.globalAlpha = (1 - st) * 0.5; R(ctx, cm[0] + Math.sin(st * 6 + s) * 3 + st * 6, cm[1] - st * 28, 3 + st * 3, 3, '#8a7aa8'); ctx.restore(); }
      // cat on the roof ridge
      try { K.drawCatAt(ctx, 'title_roof_cat', 'idle', layout.ridge[0] - 4, layout.ridge[1] - 24, 1, t, { flip: false }); } catch (e) { /* ignore */ }
      // garden walkers
      walkers.forEach(function (wk) {
        if (!red) wk.x += wk.v; if (wk.x > W * 0.42) wk.x = -40 - Math.random() * 30;
        try { K.drawPestAt(ctx, { species: wk.sp }, (t >> 3) % 2 ? 'idle1' : 'idle0', Math.round(wk.x), layout.gy + 4, 1, t, { flip: false }); } catch (e) { /* ignore */ }
      });
      // motes
      if (!red) for (var m = 0; m < 10; m++) { var my = (layout.top + 10 + ((t * 0.15 + m * 17) % 40)), mx = a[0] + 6 + Math.sin(t / 30 + m) * 6; R(ctx, mx, my, 1, 1, C.sunHi); }
    }
    try { if (SB.gfx && SB.gfx.pawprint && !SB.gfx.pawprint.registry.title_roof_cat) SB.gfx.pawprint.register('title_roof_cat', { seed: 11, body: 'tabby', fur: 'black', pattern: 'solid', ears: 'point', eyes: 'slit', eyeColor: 'amber', tail: 'long', accessory: 'none' }); } catch (e) { /* ignore */ }
    K.registerAnim(cv, draw);
    cv.__redo = function () { back = null; };
    return cv;
  };
})();
