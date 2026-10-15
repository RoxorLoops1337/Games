// Character Studio outfits: 13 tops, 14 bottoms, 6 one-pieces (dress, sundress, jumpsuit, dungarees and the animal onesie), 9 shoes, 5 sock
// lengths and 12 fabric patterns. CC.outfit(K) returns what the figure needs: {torso, over, arm, legs, hood}. All shapes are in the kit's torso
// rest space for the default body (shoulders at +-26, y -131; hips at y -78); the figure stretches them for the build and torso sliders.
// No animal products anywhere: knit and cotton, canvas and plush, never leather, fur, wool or silk (the art bible, rule 12).
(function () {
  'use strict';
  const CC = window.CC, RJ = ART.rj, tk = ART.tk, C = RJ.C, LINE = RJ.LINE;
  const { clamp, lerp, TAU } = CC.u, col = CC.col;
  const PI = Math.PI;

  const mirror = (p) => [-p[0], p[1]].concat(p.slice(2));
  // a symmetric garment: neck curve (left to right), the right side top to hem, then the mirrored left side back up
  const sym = (neck, right, hemMid) => neck.concat(right, hemMid ? [hemMid] : [], right.slice().reverse().map(mirror));
  const NECK = {
    crew: [[-15, -155, 1], [-11, -148], [0, -144.5], [11, -148], [15, -155, 1]],
    vneck: [[-14, -155, 1], [-5, -141], [0, -136, 1], [5, -141], [14, -155, 1]],
    scoop: [[-17, -155, 1], [-13, -145.5], [0, -139.5], [13, -145.5], [17, -155, 1]],
    high: [[-13, -158, 1], [-13, -154], [0, -151], [13, -154], [13, -158, 1]],
    boat: [[-26, -148, 1], [-14, -146], [0, -145], [14, -146], [26, -148, 1]],
  };
  const TEE_R = [[30, -147], [34, -130], [33, -106], [36, -77, 1]];

  // ---- fabric patterns, drawn inside a clipped garment (decor) ----
  function pattern(g, id, box, c1, c2, o) {
    if (!id || id === 'none') return;
    o = o || {};
    const x0 = box[0], y0 = box[1], x1 = box[2], y1 = box[3], w = x1 - x0, h = y1 - y0, ink = '#4d2c10', cx = o.cx === undefined ? (x0 + x1) / 2 + 3 : o.cx, cy = o.cy === undefined ? y0 + h * 0.42 : o.cy;
    g.save();
    if (id === 'stripes') { g.fillStyle = c2; for (let y = y0 + 4; y < y1; y += 13) g.fillRect(x0 - 2, y, w + 4, 5.5); }
    else if (id === 'vstripe') { g.fillStyle = c2; g.fillRect(x0 + w * 0.08, y0 - 2, 4.5, h + 4); g.fillRect(x1 - w * 0.08 - 4.5, y0 - 2, 4.5, h + 4); }
    else if (id === 'polka') { g.fillStyle = c2; for (let r = 0, y = y0 + 6; y < y1 + 6; y += 11, r++) for (let x = x0 + (r % 2 ? 11 : 5); x < x1 + 6; x += 14) { g.beginPath(); g.arc(x, y, 2.7, 0, TAU); g.fill(); } }
    else if (id === 'checks') { g.fillStyle = c2; g.globalAlpha = 0.85; for (let r = 0, y = y0 - 2; y < y1; y += 10, r++) for (let x = x0 - 2 + (r % 2 ? 10 : 0); x < x1; x += 20) g.fillRect(x, y, 10, 10); }
    else if (id === 'stars') { for (let r = 0, y = y0 + 8; y < y1 + 8; y += 17, r++) for (let x = x0 + (r % 2 ? 15 : 5); x < x1 + 6; x += 22) tk.sparkle(g, x, y, 5, { color: c2, glow: 0, thin: 0.3 }); }
    else if (id === 'hearts') { g.fillStyle = c2; for (let r = 0, y = y0 + 8; y < y1 + 8; y += 17, r++) for (let x = x0 + (r % 2 ? 14 : 4); x < x1 + 6; x += 20) { g.beginPath(); g.moveTo(x, y + 4.4); g.bezierCurveTo(x - 7, y - 0.5, x - 4, y - 6, x, y - 2.4); g.bezierCurveTo(x + 4, y - 6, x + 7, y - 0.5, x, y + 4.4); g.fill(); } }
    else if (id === 'sakura') { for (let r = 0, y = y0 + 8; y < y1 + 8; y += 19, r++) for (let x = x0 + (r % 2 ? 16 : 4); x < x1 + 8; x += 24) { g.fillStyle = c2; for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; g.beginPath(); g.ellipse(x + Math.cos(a) * 3.2, y + Math.sin(a) * 3.2, 2.7, 2, a, 0, TAU); g.fill(); } g.fillStyle = col.tint(c2, 0.6); g.beginPath(); g.arc(x, y, 1.3, 0, TAU); g.fill(); } }
    else if (id === 'fade') { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, col.rgba(c2, 0)); gr.addColorStop(1, col.rgba(c2, 1)); g.fillStyle = gr; g.fillRect(x0 - 2, y0 - 2, w + 4, h + 4); }
    else if (id === 'smiley') {
      const r = Math.min(17, w * 0.26), f = r / 13;
      RJ.cel(g, tk.circlePts(cx, cy, r, 18), c2, { shadow: col.shade(c2, 0.02), line: LINE.mid, depth: 5, hi: col.tint(c2, 0.4), hiW: 1.5 });
      RJ.ink(g, [[cx - 5.5 * f, cy - 5 * f], [cx - 5.5 * f, cy - 1.8 * f]], { w: 1.9, color: ink, taper: 0.3, wobble: 0 });
      RJ.ink(g, [[cx + 4.5 * f, cy - 5 * f], [cx + 4.5 * f, cy - 1.8 * f]], { w: 1.9, color: ink, taper: 0.3, wobble: 0 });
      RJ.ink(g, [[cx - 8.5 * f, cy + 1.2 * f], [cx - 4 * f, cy + 6.4 * f], [cx + 2 * f, cy + 7.6 * f], [cx + 7.5 * f, cy + 4.6 * f], [cx + 9 * f, cy + 1 * f]], { w: 2, color: ink, taper: 0.3, wobble: 0 });
    } else if (id === 'noteP') tk.note(g, cx, cy + 2, Math.min(34, w * 0.5), { kind: 'beamed', color: c2 });
    else if (id === 'bolt') RJ.cel(g, [[cx + 8, cy - 18, 1], [cx - 8, cy + 2], [cx + 1, cy + 3], [cx - 7, cy + 20, 1], [cx + 12, cy - 4], [cx + 3, cy - 5]], c2, { shadow: col.shade(c2, 0.05), line: LINE.mid, depth: 3, tension: 0 });
    g.restore();
  }
  CC.pattern = pattern;

  // ---- drawing one garment ----
  function cloth(g, pts, c1, o) {
    o = o || {};
    const box = tk.shapeBox(pts);
    RJ.cel(g, pts, c1, { shadow: col.shade(c1), line: LINE.main, depth: o.depth === undefined ? 8 : o.depth, hi: o.noHi ? false : col.tint(c1, 0.3), hiW: 1.6, hiAlpha: 0.7, tension: o.tension === undefined ? 0.55 : o.tension, rim: o.rim, rimW: 1.6, rimSide: 'light', rimAlpha: 0.75, decor: (gg) => {
      if (o.pattern) pattern(gg, o.pattern, box, c1, o.c2 || '#ffffff', o);
      if (o.decor) o.decor(gg, box);
    } });
  }
  const seam = (g, pts, c, w) => RJ.ink(g, pts, { w: w || 1.3, color: c, taper: 0.5, wobble: 0.02, alpha: 0.85 });
  const neckSkin = (g, K) => RJ.neck(g, 2, -160, { w: 21 * K.c.neckW, h: 24, skin: K.skin, shade: K.skinSh });
  // bare torso under every top (so a crop top or a tank shows skin)
  function bareTorso(g, K) {
    RJ.cel(g, sym([[-13, -150, 1], [13, -150, 1]], [[24, -140], [29, -122], [26, -100], [27, -86], [30, -77, 1]]), K.skin, { shadow: K.skinSh, line: LINE.main, depth: 5, tension: 0.6 });
  }
  // the neckline's rim: a thin darker band along a neck curve
  function rim(g, neck, c, w) { RJ.ink(g, neck, { w: w || 2, color: c, taper: 0.2, wobble: 0.02 }); }

  // ---- tops ----
  // each returns {sleeve: 'none'|'short'|'three'|'long', arm: colour of a long sleeve, cuff}, and draws the garment
  const TOPS = {};
  TOPS.tee = (g, K, c) => {
    const neck = NECK.crew;
    cloth(g, sym(neck, TEE_R, [0, -71.5]), c.c1, { pattern: c.pat, c2: c.c2, decor: (gg) => { seam(gg, [[-30, -130], [-22, -118], [-24, -104]], col.tint(c.c1, 0.3)); seam(gg, [[26, -134], [20, -120], [24, -106]], col.tint(c.c1, 0.3)); } });
    rim(g, neck.slice(1, 4), col.shade(c.c1, 0.12), 2.4);
    return { sleeve: 'short', len: 0.62 };
  };
  TOPS.vneck = (g, K, c) => {
    cloth(g, sym(NECK.vneck, TEE_R, [0, -71.5]), c.c1, { pattern: c.pat, c2: c.c2 });
    rim(g, NECK.vneck.slice(0, 5), col.shade(c.c1, 0.12), 2.2);
    return { sleeve: 'short', len: 0.62 };
  };
  TOPS.tank = (g, K, c) => {
    const neck = [[-20, -156, 1], [-12, -156, 1], [-11, -147], [0, -140], [11, -147], [12, -156, 1], [20, -156, 1]];
    const right = [[24, -142], [27, -132], [30, -124], [31, -106], [33, -77, 1]];
    bareTorso(g, K);
    cloth(g, neck.concat(right, [[0, -72]], right.slice().reverse().map(mirror)), c.c1, { pattern: c.pat, c2: c.c2 });
    return { sleeve: 'none' };
  };
  TOPS.crop = (g, K, c) => {
    bareTorso(g, K);
    const right = [[30, -147], [34, -130], [33, -116], [34, -106, 1]];
    const pts = sym(NECK.crew, right, [0, -103]);
    cloth(g, pts, c.c1, { pattern: c.pat, c2: c.c2 });
    rim(g, NECK.crew.slice(1, 4), col.shade(c.c1, 0.12), 2.2);
    return { sleeve: 'short', len: 0.55, crop: true };
  };
  TOPS.long = (g, K, c) => {
    cloth(g, sym(NECK.crew, TEE_R, [0, -71.5]), c.c1, { pattern: c.pat, c2: c.c2 });
    rim(g, NECK.crew.slice(1, 4), col.shade(c.c1, 0.12), 2.4);
    return { sleeve: 'long', arm: c.c1, cuff: c.c2 };
  };
  TOPS.baseball = (g, K, c) => {
    cloth(g, sym(NECK.crew, TEE_R, [0, -71.5]), c.c1, { pattern: c.pat, c2: c.c2, decor: (gg) => { RJ.ink(gg, [[-14, -150], [-30, -128], [-33, -112]], { w: 1.6, color: col.shade(c.c1, 0.2), taper: 0.2, wobble: 0 }); RJ.ink(gg, [[14, -150], [30, -128], [33, -112]], { w: 1.6, color: col.shade(c.c1, 0.2), taper: 0.2, wobble: 0 }); } });
    rim(g, NECK.crew.slice(1, 4), c.c2, 3);
    return { sleeve: 'short', len: 0.7, sleeveColor: c.c2 };
  };
  TOPS.hoodie = (g, K, c) => {
    // the hood lies behind the neck: a soft collar ring, then the body, the pouch and the strings
    const right = [[32, -147], [37, -130], [38, -104], [40, -74, 1]];
    cloth(g, sym(NECK.scoop.map((p) => [p[0] * 0.75, p[1] + 0.5].concat(p.slice(2))), right, [0, -70]), c.c1, { pattern: c.pat, c2: c.c2, decor: (gg) => {
      cloth(gg, [[-24, -98], [24, -98], [28, -76], [-28, -76]], col.shade(c.c1, -0.02), { depth: 3, tension: 0.2, noHi: true });
      RJ.ink(gg, [[-24, -98], [-14, -86], [-8, -76]], { w: 1.2, color: col.shade(c.c1, 0.2), taper: 0.2, wobble: 0 });
      RJ.ink(gg, [[24, -98], [14, -86], [8, -76]], { w: 1.2, color: col.shade(c.c1, 0.2), taper: 0.2, wobble: 0 });
    } });
    // hood collar over the neckline
    RJ.cel(g, [[-20, -156, 1], [-12, -148], [0, -143], [12, -148], [20, -156, 1], [26, -150], [14, -138], [0, -134], [-14, -138], [-26, -150]], c.c1, { shadow: col.shade(c.c1), line: LINE.main, depth: 4, hi: col.tint(c.c1, 0.3), tension: 0.8 });
    RJ.cel(g, [[-14, -148, 1], [0, -142], [14, -148, 1], [11, -150], [0, -146], [-11, -150]], K.skin, { shadow: K.skinSh, line: false, depth: 2 });
    [[-9, -140, -11, -118], [9, -140, 11, -118]].forEach((s) => { RJ.ink(g, [[s[0], s[1]], [s[2], s[3]]], { w: 2, color: col.tint(c.c1, 0.6), taper: 0, wobble: 0 }); RJ.ink(g, [[s[2], s[3] - 1], [s[2], s[3] + 4]], { w: 3, color: col.tint(c.c1, 0.6), taper: 0, wobble: 0 }); });
    return { sleeve: 'long', arm: c.c1, cuff: col.shade(c.c1, -0.02) };
  };
  TOPS.jumper = (g, K, c) => {
    const right = [[31, -147], [36, -130], [35, -106], [36, -78, 1]];
    cloth(g, sym(NECK.crew, right, [0, -73]), c.c1, { pattern: c.pat, c2: c.c2, decor: (gg) => { gg.save(); gg.globalAlpha = 0.18; gg.strokeStyle = '#000'; gg.lineWidth = 1; for (let x = -34; x < 36; x += 5) { gg.beginPath(); gg.moveTo(x, -150); gg.lineTo(x, -70); gg.stroke(); } gg.restore(); RJ.fillPts(gg, [[-40, -84], [40, -84], [40, -70], [-40, -70]], c.c2, 0.0); } });
    cloth(g, [[-37, -84], [37, -84], [37, -76, 1], [-37, -76, 1]].concat([]), col.shade(c.c1, -0.02), { depth: 2, tension: 0.2, noHi: true });
    rim(g, NECK.crew.slice(1, 4), col.shade(c.c1, 0.2), 3.2);
    return { sleeve: 'long', arm: c.c1, cuff: col.shade(c.c1, -0.02) };
  };
  TOPS.turtle = (g, K, c) => {
    cloth(g, sym(NECK.high, [[31, -147], [35, -130], [34, -106], [36, -77, 1]], [0, -71.5]), c.c1, { pattern: c.pat, c2: c.c2 });
    cloth(g, [[-13, -166], [13, -166], [14, -146], [-14, -146]], c.c1, { depth: 4, tension: 0.3, decor: (gg) => { for (let y = -162; y < -148; y += 4) seam(gg, [[-14, y], [14, y]], col.shade(c.c1, 0.14), 1); } });
    return { sleeve: 'long', arm: c.c1, cuff: col.shade(c.c1, -0.02) };
  };
  TOPS.jacket = (g, K, c) => openJacket(g, K, c, { zip: true });
  TOPS.bomber = (g, K, c) => {
    const right = [[32, -147], [37, -130], [37, -104], [38, -78, 1]];
    cloth(g, sym(NECK.high.map((p) => [p[0], p[1] + 3].concat(p.slice(2))), right, [0, -72]), c.c1, { pattern: c.pat, c2: c.c2 });
    cloth(g, [[-38, -86], [38, -86], [39, -76, 1], [-39, -76, 1]], c.c2, { depth: 2, tension: 0.2, noHi: true, decor: (gg) => { for (let x = -34; x < 36; x += 6) seam(gg, [[x, -86], [x, -76]], col.shade(c.c2, 0.2), 1); } });
    RJ.cel(g, [[-14, -157, 1], [14, -157, 1], [14, -148], [0, -146], [-14, -148]], c.c2, { shadow: col.shade(c.c2), line: LINE.main, depth: 2, tension: 0.4 });
    RJ.ink(g, [[0, -146], [0, -78]], { w: 1.8, color: col.shade(c.c1, 0.3), taper: 0, wobble: 0 });
    RJ.cel(g, tk.circlePts(0, -114, 2.6, 8), '#cfd5de', { shadow: false, line: LINE.fine });
    return { sleeve: 'long', arm: c.c1, cuff: c.c2 };
  };
  TOPS.blazer = (g, K, c) => openJacket(g, K, c, { lapel: true });
  TOPS.vest = (g, K, c) => {
    // a plain tee in the second colour under a waistcoat
    cloth(g, sym(NECK.crew, TEE_R, [0, -71.5]), c.c2, {});
    const right = [[26, -146], [29, -132], [30, -106], [32, -78, 1]];
    const pts = [[-20, -154, 1], [-8, -154, 1], [0, -134, 1], [8, -154, 1], [20, -154, 1]].concat(right, [[0, -72]], right.slice().reverse().map(mirror));
    cloth(g, pts, c.c1, { pattern: c.pat, c2: c.c2, decor: (gg) => { [-112, -98, -84].forEach((y) => { gg.beginPath(); gg.arc(-3, y, 2.1, 0, TAU); gg.fillStyle = col.tint(c.c1, 0.5); gg.fill(); }); } });
    return { sleeve: 'short', len: 0.62, sleeveColor: c.c2 };
  };
  TOPS.shirt = (g, K, c) => {
    const neck = [[-13, -158, 1], [-9, -150], [0, -144], [9, -150], [13, -158, 1]];
    cloth(g, sym(neck, TEE_R, [0, -71.5]), c.c1, { pattern: c.pat, c2: c.c2, decor: (gg) => { RJ.ink(gg, [[0, -142], [0, -74]], { w: 1.2, color: col.shade(c.c1, 0.2), taper: 0, wobble: 0 }); [-128, -112, -96, -80].forEach((y) => { gg.beginPath(); gg.arc(0, y, 2, 0, TAU); gg.fillStyle = col.tint(c.c1, 0.5); gg.fill(); gg.lineWidth = 0.8; gg.strokeStyle = C.inkSoft; gg.stroke(); }); RJ.cel(gg, [[-30, -128], [-22, -126], [-20, -118], [-30, -117]], c.c1, { shadow: col.shade(c.c1), line: LINE.fine + 0.2, depth: 1.5, tension: 0.2 }); } });
    // the collar: two points folded over the shoulders
    [-1, 1].forEach((sd) => cloth(g, [[sd * 2, -144, 1], [sd * 12, -158, 1], [sd * 24, -152], [sd * 18, -138, 1]], c.c2, { depth: 2, tension: 0.2, noHi: true }));
    return { sleeve: 'short', len: 0.66 };
  };
  TOPS.polo = (g, K, c) => {
    const neck = [[-13, -157, 1], [-10, -150], [-3, -140], [0, -138, 1], [3, -140], [10, -150], [13, -157, 1]];
    cloth(g, sym(neck, TEE_R, [0, -71.5]), c.c1, { pattern: c.pat, c2: c.c2, decor: (gg) => { RJ.ink(gg, [[0, -138], [0, -118]], { w: 1.2, color: col.shade(c.c1, 0.2), taper: 0, wobble: 0 }); [-130, -122].forEach((y) => { gg.beginPath(); gg.arc(-2, y, 1.8, 0, TAU); gg.fillStyle = col.tint(c.c1, 0.5); gg.fill(); }); } });
    [-1, 1].forEach((sd) => cloth(g, [[sd * 2, -142, 1], [sd * 11, -157, 1], [sd * 22, -152], [sd * 16, -140, 1]], c.c2, { depth: 2, tension: 0.2, noHi: true }));
    return { sleeve: 'short', len: 0.62 };
  };
  TOPS.track = (g, K, c) => {
    const right = [[32, -147], [37, -130], [37, -104], [38, -76, 1]];
    cloth(g, sym(NECK.high.map((p) => [p[0], p[1] + 2].concat(p.slice(2))), right, [0, -72]), c.c1, { pattern: c.pat, c2: c.c2, decor: (gg) => { [-1, 1].forEach((sd) => { RJ.ink(gg, [[sd * 30, -144], [sd * 35, -110], [sd * 35, -76]], { w: 3.2, color: c.c2, taper: 0, wobble: 0, pressure: 'flat' }); RJ.ink(gg, [[sd * 25, -146], [sd * 30, -110], [sd * 30, -76]], { w: 3.2, color: c.c2, taper: 0, wobble: 0, pressure: 'flat' }); }); } });
    cloth(g, [[-14, -164], [14, -164], [15, -146], [-15, -146]], c.c1, { depth: 3, tension: 0.3, decor: (gg) => { RJ.ink(gg, [[-15, -156], [15, -156]], { w: 2.4, color: c.c2, taper: 0, wobble: 0 }); } });
    RJ.ink(g, [[0, -160], [0, -76]], { w: 2.6, color: C.ink, taper: 0, wobble: 0 }); RJ.ink(g, [[0, -160], [0, -76]], { w: 1.2, color: '#cfd5de', taper: 0, wobble: 0 });
    cloth(g, [[-38, -84], [38, -84], [38, -76, 1], [-38, -76, 1]], c.c2, { depth: 1.5, tension: 0.2, noHi: true });
    return { sleeve: 'long', arm: c.c1, cuff: c.c2 };
  };
  TOPS.jersey = (g, K, c) => {
    const neck = [[-15, -156, 1], [-9, -148], [-3, -138], [0, -136, 1], [3, -138], [9, -148], [15, -156, 1]];
    const right = [[24, -146], [30, -136], [33, -120], [34, -100], [36, -74, 1]];
    bareTorso(g, K);
    cloth(g, neck.concat(right, [[0, -70]], right.slice().reverse().map(mirror)), c.c1, { pattern: c.pat, c2: c.c2, decor: (gg) => { [-1, 1].forEach((sd) => RJ.ink(gg, [[sd * 24, -146], [sd * 33, -120], [sd * 36, -74]], { w: 4, color: c.c2, taper: 0, wobble: 0, pressure: 'flat' })); RJ.fillPts(gg, [[-14, -124], [14, -124], [14, -100], [-14, -100]], c.c2, 0.0); gg.save(); gg.strokeStyle = c.c2; gg.lineWidth = 4.5; gg.lineCap = 'round'; gg.beginPath(); gg.moveTo(-8, -118); gg.lineTo(6, -118); gg.lineTo(-2, -96); gg.stroke(); gg.restore(); } });
    rim(g, neck, c.c2, 3);
    return { sleeve: 'none' };
  };
  TOPS.cardigan = (g, K, c) => {
    const under = c.c2;
    cloth(g, sym(NECK.crew, TEE_R, [0, -71.5]), under, { pattern: c.pat, c2: c.c1 });
    rim(g, NECK.crew.slice(1, 4), col.shade(under, 0.12), 2);
    [-1, 1].forEach((sd) => {
      const pts = [[sd * 15, -157, 1], [sd * 30, -148], [sd * 35, -130], [sd * 38, -104], [sd * 40, -75, 1], [sd * 7, -73, 1], [sd * 6, -100], [sd * 7, -130], [sd * 9, -150]];
      cloth(g, pts, c.c1, { depth: 6, tension: 0.45, decor: (gg) => { gg.save(); gg.globalAlpha = 0.16; gg.strokeStyle = '#000'; gg.lineWidth = 1; for (let x = 8; x < 40; x += 4) { gg.beginPath(); gg.moveTo(sd * x, -156); gg.lineTo(sd * x, -70); gg.stroke(); } gg.restore(); } });
    });
    [-120, -104, -88].forEach((y) => { g.beginPath(); g.arc(-3, y, 2.4, 0, TAU); g.fillStyle = col.tint(c.c1, 0.5); g.fill(); g.lineWidth = 0.9; g.strokeStyle = C.inkSoft; g.stroke(); });
    return { sleeve: 'long', arm: c.c1, cuff: col.shade(c.c1, -0.02), under };
  };
  function openJacket(g, K, c, o) {
    const under = c.c2;
    cloth(g, sym(NECK.crew, TEE_R, [0, -71.5]), under, { pattern: c.pat, c2: c.c1 });
    rim(g, NECK.crew.slice(1, 4), col.shade(under, 0.12), 2);
    const gap = o.lapel ? 5 : 4;
    [-1, 1].forEach((s) => {
      const pts = [[s * 15, -157, 1], [s * 30, -148], [s * 35, -130], [s * 38, -104], [s * 40, -75, 1], [s * (gap + 1), -73, 1], [s * gap, -100], [s * (gap + 3), -128], [s * 9, -146], [s * 10, -157, 1]];
      cloth(g, pts, c.c1, { depth: 7, tension: 0.45 });
    });
    if (o.lapel) [-1, 1].forEach((s) => cloth(g, [[s * 15, -157, 1], [s * 4, -126, 1], [s * 12, -118], [s * 21, -140]], col.tint(c.c1, 0.2), { depth: 2, tension: 0.3, noHi: true }));
    else { RJ.ink(g, [[-gap - 0.5, -132], [-gap - 0.5, -76]], { w: 1.4, color: col.shade(c.c1, 0.3), taper: 0, wobble: 0 }); RJ.cel(g, tk.circlePts(gap + 1.5, -128, 2, 8), '#cfd5de', { shadow: false, line: LINE.fine }); }
    if (o.lapel) [-100, -86].forEach((y) => { g.beginPath(); g.arc(-2, y, 2.3, 0, TAU); g.fillStyle = '#ffd84d'; g.fill(); });
    return { sleeve: 'long', arm: c.c1, cuff: col.shade(c.c1, -0.02), under };
  }

  // ---- skirts and dresses (torso layer) ----
  function skirtShape(kind, sway) {
    const s = sway || 0;
    if (kind === 'pleat') { const w = 43, y = -49; return [[-23, -91, 1], [23, -91, 1], [w * 0.6, -70], [w, y - 2 + s], [w * 0.8, y + 2.2], [w * 0.4, y - 0.6], [0, y + 2.4], [-w * 0.4, y - 0.6], [-w * 0.8, y + 2.2], [-w, y - 2 - s], [-w * 0.6, -70]]; }
    if (kind === 'aline') return [[-23, -91, 1], [23, -91, 1], [31, -74], [40, -56 + s, 1], [20, -53], [0, -52], [-20, -53], [-40, -56 - s, 1], [-31, -74]];
    if (kind === 'mini') return [[-24, -91, 1], [24, -91, 1], [31, -78], [36, -66 + s, 1], [18, -64], [0, -63], [-18, -64], [-36, -66 - s, 1], [-31, -78]];
    if (kind === 'tutu') { const y = -62; return [[-24, -91, 1], [24, -91, 1], [34, -80], [56, y - 4, 1], [50, y + 5], [42, y - 1], [33, y + 6], [22, y], [12, y + 6], [0, y], [-12, y + 6], [-22, y], [-33, y + 6], [-42, y - 1], [-50, y + 5], [-56, y - 4, 1], [-34, -80]]; }
    return [[-23, -91, 1], [23, -91, 1], [30, -64], [46, -24 + s, 1], [24, -20], [0, -19], [-24, -20], [-46, -24 - s, 1], [-30, -64]];   // maxi
  }
  function drawSkirt(g, K, kind, c1, c2, pat, S) {
    const sway = S && S.P ? clamp(S.P.hairSwing * 1.5, -3, 3) : 0, pts = skirtShape(kind, sway);
    cloth(g, pts, c1, { pattern: pat, c2, depth: 5, tension: kind === 'tutu' ? 0.45 : 0.6, decor: (gg, box) => {
      if (kind === 'pleat') for (let i = -2; i <= 2; i++) { const hx = i * 9, tx = i * 15.5; if (i % 2) RJ.fillPts(gg, [[hx - 3.2, -91], [hx + 3.2, -91], [tx + 7, -44], [tx - 7, -44]], col.shade(c1, -0.02), 0.5); RJ.ink(gg, [[hx, -90], [tx * 0.55 + hx * 0.45, -70], [tx * 1.02, -48]], { w: 1.2, color: col.shade(c1, 0.12), taper: 0.45, wobble: 0, alpha: 0.9 }); }
      else if (kind === 'aline' || kind === 'maxi' || kind === 'mini') for (let i = -2; i <= 2; i++) RJ.ink(gg, [[i * 8, -90], [i * (kind === 'maxi' ? 15 : kind === 'aline' ? 14 : 12), box[3] - 2]], { w: 1.1, color: col.shade(c1, 0.1), taper: 0.5, wobble: 0, alpha: 0.7 });
      else if (kind === 'tutu') { RJ.fillPts(gg, [[-60, -70], [60, -70], [60, -50], [-60, -50]], col.tint(c1, 0.35), 0.45); for (let x = -44; x <= 44; x += 14) RJ.ink(gg, [[x * 0.5, -88], [x, -60]], { w: 1.1, color: col.shade(c1, 0.1), taper: 0.5, wobble: 0, alpha: 0.7 }); }
    } });
    // waistband
    cloth(g, [[-23.5, -96], [23.5, -96], [24.5, -89], [-24.5, -89]], c2, { depth: 2, tension: 0.2, noHi: true });
  }
  // hips block drawn under a short top for pants and shorts
  function hipBlock(g, c1, hem) {
    cloth(g, [[-27, -97], [27, -97], [34, -82], [36, hem || -70], [-36, hem || -70], [-34, -82]], c1, { depth: 4, tension: 0.4, noHi: true });
  }

  // ---- bottoms: legs spec (+ a hip block / skirt in the torso layer) ----
  const FLARE = (u) => (0.62 - 0.1 * u + 0.62 * Math.pow(Math.max(0, u - 0.5) * 2, 2) * 0.7);
  function bottomDef(K) {
    const c = K.c, c1 = c.botC1, c2 = c.botC2, sh = col.shade(c1), kind = c.bottom, legW = K.legT;
    const base = { color: c1, shade: sh, pantsOver: true, bow: 2 };
    const W = (a, b) => [a * legW, b * legW];
    const pantCuff = (hem) => (g, hip, an) => {
      const dx = an[0] - hip[0], dy = an[1] - hip[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux, qx = an[0] - ux * 8, qy = an[1] - uy * 8;
      RJ.ink(g, [[qx - nx * hem, qy - ny * hem], [qx + nx * hem, qy + ny * hem]], { w: 1.6, color: C.ink, taper: 0.2, wobble: 0 });
    };
    const kneeCrease = (g, hip, an) => {
      const dx = an[0] - hip[0], dy = an[1] - hip[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux, mx = (hip[0] + an[0]) / 2 - ux, my = (hip[1] + an[1]) / 2;
      RJ.ink(g, [[mx - nx * 4, my - ny * 4], [mx - nx * 11 + ux * 2, my - ny * 11 + uy * 2]], { w: 1.4, color: sh, taper: 0.5, wobble: 0 });
    };
    const side = (g, hip, an, wd) => { if (c.botPattern === 'vstripe' || c.botPattern === 'stripes') { const dx = an[0] - hip[0], dy = an[1] - hip[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux, o = wd * 0.4; RJ.ink(g, [[hip[0] + nx * o + ux * 6, hip[1] + ny * o + uy * 6], [an[0] + nx * o * 0.7 - ux * 6, an[1] + ny * o * 0.7 - uy * 6]], { w: 3.2, color: c2, taper: 0, wobble: 0, pressure: 'flat' }); } };
    if (kind === 'jeans') return { legs: Object.assign({ w: W(37, 26), profile: (u) => 1 - 0.28 * u + 0.1 * Math.sin(Math.PI * Math.min(1, u * 1.15)), decor(g, hip, an) { pantCuff(10)(g, hip, an); kneeCrease(g, hip, an); side(g, hip, an, 30); } }, base), hip: c1 };
    if (kind === 'skinny') return { legs: Object.assign({ w: W(31, 19), bow: 1.5, decor(g, hip, an) { pantCuff(7)(g, hip, an); kneeCrease(g, hip, an); side(g, hip, an, 24); } }, base), hip: c1 };
    if (kind === 'baggy') return { legs: Object.assign({ w: W(46, 38), bow: 3, decor(g, hip, an) { pantCuff(15)(g, hip, an); kneeCrease(g, hip, an); side(g, hip, an, 38); } }, base), hip: c1, hipW: 1.1 };
    if (kind === 'flared') return { legs: Object.assign({ w: W(36, 36), profile: FLARE, decor(g, hip, an) { pantCuff(15)(g, hip, an); side(g, hip, an, 30); } }, base), hip: c1 };
    if (kind === 'joggers') return { legs: Object.assign({ w: W(40, 28), bow: 3, profile: (u) => 1 - 0.1 * u - 0.22 * Math.pow(u, 3), decor(g, hip, an) { const dx = an[0] - hip[0], dy = an[1] - hip[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux; for (let k = 0; k < 2; k++) { const qx = an[0] - ux * (5 + k * 5), qy = an[1] - uy * (5 + k * 5); RJ.ink(g, [[qx - nx * 9, qy - ny * 9], [qx + nx * 9, qy + ny * 9]], { w: 3, color: c2, taper: 0, wobble: 0, pressure: 'flat' }); } side(g, hip, an, 30); } }, base), hip: c1 };
    if (kind === 'cargo') return { legs: Object.assign({ w: W(41, 31), bow: 2.5, decor(g, hip, an) { pantCuff(12)(g, hip, an); const dx = an[0] - hip[0], dy = an[1] - hip[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux, mx = lerp(hip[0], an[0], 0.4), my = lerp(hip[1], an[1], 0.4); const q = (a, b) => [mx + nx * a + ux * b, my + ny * a + uy * b]; RJ.cel(g, [q(-9, -7), q(9, -7), q(9, 8), q(-9, 8)], col.shade(c1, -0.03), { shadow: sh, line: LINE.mid, depth: 2, tension: 0.2 }); RJ.ink(g, [q(-9, -3), q(9, -3)], { w: 1.2, color: sh, taper: 0, wobble: 0 }); } }, base), hip: c1 };
    if (kind === 'leggings') return { legs: Object.assign({ w: W(30, 19), bow: 1.5, decor(g, hip, an) { side(g, hip, an, 24); } }, base), hip: c1 };
    if (kind === 'shorts' || kind === 'bermuda') {
      const frac = kind === 'shorts' ? 0.42 : 0.7, wA = kind === 'shorts' ? 40 : 38;
      return { legs: { w: W(27, 21), color: K.skin, shade: K.skinSh, bow: 1.5, decor(g, hip, an, mid) {
        const e = [lerp(hip[0], an[0], frac), lerp(hip[1], an[1], frac)], m = [(hip[0] + e[0]) / 2 + 1.5, (hip[1] + e[1]) / 2];
        tk.ribbon(g, [hip, m, e], c1, { light: RJ.lightAngle(), wMax: wA * legW, w0: wA * legW, w1: (wA - 2) * legW, profile: () => 1, cap: 'flat', gloss: false, strands: 0, shadow: sh, shadowW: 0.4, line: LINE.main, lineColor: C.ink, wobble: 0.04, weightVar: 0.4 });
        if (c.botPattern === 'vstripe' || c.botPattern === 'stripes') { const dx = e[0] - hip[0], dy = e[1] - hip[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d; RJ.ink(g, [[hip[0] + ux * 6 - uy * 12, hip[1] + uy * 6 + ux * 12], [e[0] - ux * 3 - uy * 12, e[1] - uy * 3 + ux * 12]], { w: 3, color: c2, taper: 0, wobble: 0, pressure: 'flat' }); }
      } }, hip: c1, skinLegs: true };
    }
    // skirts and the skirt half of a dress: bare legs
    return { legs: { w: W(27, 21), color: K.skin, shade: K.skinSh, bow: 1.5 }, skirt: kind, skinLegs: true, hip: null };
  }

  // ---- socks (own drawing, so stripes and heights work) and shoes ----
  const SOCK_LEN = { ankle: 10, crew: 19, knee: 40, striped: 42 };
  function sockDraw(g, K, hip, an) {
    const kind = K.c.sock;
    if (kind === 'none') return;
    const c = K.c.sockC, len = SOCK_LEN[kind], d = Math.hypot(hip[0] - an[0], hip[1] - an[1]), u = clamp(1 - len / Math.max(1, d), 0, 0.98);
    const a = [lerp(hip[0], an[0], u), lerp(hip[1], an[1], u)], w = 24 * K.legT;
    tk.ribbon(g, [a, [(a[0] + an[0]) / 2, (a[1] + an[1]) / 2 + 1], [an[0], an[1] + 2]], c, { light: RJ.lightAngle(), wMax: w, w0: w, w1: w - 1, profile: () => 1, cap: 'flat', gloss: false, strands: 0, shadow: col.shade(c), shadowW: 0.4, line: LINE.main, lineColor: C.ink, wobble: 0.03, weightVar: 0.3 });
    if (kind === 'striped') {
      const dx = an[0] - a[0], dy = an[1] - a[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, nx = -uy, ny = ux, c2 = K.c.shoeC2;
      for (let k = 0; k < 3; k++) { const q = [a[0] + ux * (5 + k * 9), a[1] + uy * (5 + k * 9)]; RJ.ink(g, [[q[0] - nx * w * 0.46, q[1] - ny * w * 0.46], [q[0] + nx * w * 0.46, q[1] + ny * w * 0.46]], { w: 3, color: c2, taper: 0, wobble: 0, pressure: 'flat' }); }
    } else if (kind === 'knee' || kind === 'crew') {
      const dx = an[0] - a[0], dy = an[1] - a[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, nx = -uy, ny = ux, q = [a[0] + ux * 3, a[1] + uy * 3];
      RJ.ink(g, [[q[0] - nx * w * 0.46, q[1] - ny * w * 0.46], [q[0] + nx * w * 0.46, q[1] + ny * w * 0.46]], { w: 1.2, color: col.shade(c, 0.2), taper: 0.2, wobble: 0 });
    }
  }
  // the shaft of a boot or high-top: a ribbon up the shin from the ankle
  function shaft(g, K, an, hip, h, c1, c2, laces) {
    const d = Math.hypot(hip[0] - an[0], hip[1] - an[1]) || 1, ux = (hip[0] - an[0]) / d, uy = (hip[1] - an[1]) / d, nx = -uy, ny = ux, w = 25 * K.legT;
    const b = [an[0] + ux * 1, an[1] + uy * 1], t = [an[0] + ux * h, an[1] + uy * h];
    RJ.cel(g, [[b[0] - nx * (w * 0.5 + 1), b[1] - ny * (w * 0.5 + 1)], [b[0] + nx * (w * 0.5 + 1), b[1] + ny * (w * 0.5 + 1)], [t[0] + nx * w * 0.5, t[1] + ny * w * 0.5], [t[0] - nx * w * 0.5, t[1] - ny * w * 0.5]], c1, { shadow: col.shade(c1), line: LINE.main, depth: 4, hi: col.tint(c1, 0.3), hiW: 1.4, tension: 0.2 });
    RJ.ink(g, [[t[0] - nx * w * 0.5, t[1] - ny * w * 0.5], [t[0] + nx * w * 0.5, t[1] + ny * w * 0.5]], { w: 3, color: c2, taper: 0, wobble: 0, pressure: 'flat' });
    if (laces) for (let k = 1; k < 4; k++) { const q = [an[0] + ux * (h * k / 4.5), an[1] + uy * (h * k / 4.5)]; RJ.ink(g, [[q[0] - nx * 5, q[1] - ny * 5], [q[0] + nx * 5, q[1] + ny * 5]], { w: 1.2, color: C.inkSoft, taper: 0, wobble: 0 }); }
  }
  // a sandal: a sole, a bare foot, two straps and an ankle strap (the toe points along the leg's forward direction)
  function footFrame(g, an, hip) { const d = Math.hypot(hip[0] - an[0], hip[1] - an[1]) || 1, ux = (an[0] - hip[0]) / d, uy = (an[1] - hip[1]) / d; g.translate(an[0], an[1]); g.rotate(Math.atan2(uy, ux) - Math.PI / 2); g.scale(1.2, 1.2); }
  function sandal(g, K, an, hip, c1, c2) {
    g.save(); footFrame(g, an, hip);
    RJ.cel(g, [[-10, 6], [-11, 11], [22, 12, 1], [26, 8], [22, 5]], c1, { shadow: col.shade(c1, 0.15), line: LINE.main, depth: 2.5, tension: 0.4 });
    RJ.cel(g, [[-9, -4], [-10, 6], [21, 6], [24, 2], [16, -2], [6, -6], [-2, -7]], K.skin, { shadow: K.skinSh, line: LINE.main, depth: 3, hi: false, tension: 0.6, decor: (gg) => { [[14, 4], [18, 4], [22, 5]].forEach((t) => RJ.ink(gg, [[t[0], t[1]], [t[0] + 0.5, t[1] - 4]], { w: 1.1, color: C.inkSoft, taper: 0.5, wobble: 0 })); } });
    [[4, -7, 11, 6], [-2, -7, 2, 6]].forEach((st) => RJ.ink(g, [[st[0], st[1]], [st[2], st[3]]], { w: 3.2, color: c2, taper: 0, wobble: 0, pressure: 'flat' }));
    RJ.ink(g, [[-11, -4], [-9, -6], [-4, -6]], { w: 2.6, color: c2, taper: 0, wobble: 0, pressure: 'flat' });
    g.restore();
  }
  // a heeled shoe: a pointed pump with a block heel and a small ankle strap
  function heel(g, K, an, hip, c1, c2) {
    g.save(); footFrame(g, an, hip);
    RJ.cel(g, [[-11, 2], [-12, 13, 1], [-6, 13, 1], [-5, 7]], c2, { shadow: col.shade(c2), line: LINE.main, depth: 2, tension: 0.1 });
    RJ.cel(g, [[-10, -5], [-12, 4], [-6, 7], [6, 8], [18, 7], [28, 4, 1], [20, -1], [10, -5], [-1, -8]], c1, { shadow: col.shade(c1, 0.15), line: LINE.main, depth: 4, hi: col.tint(c1, 0.4), hiW: 1.5, tension: 0.6, decor: (gg) => { RJ.fillPts(gg, [[-12, 4], [28, 4], [28, 8], [-12, 8]], col.shade(c1, 0.3), 0.5); } });
    RJ.cel(g, [[-4, -6], [10, -5], [6, 0], [-4, 0]], K.skin, { shadow: K.skinSh, line: LINE.fine + 0.2, depth: 1.5, hi: false, tension: 0.5 });
    RJ.ink(g, [[-9, -8], [-2, -8], [5, -7]], { w: 2.2, color: c2, taper: 0, wobble: 0, pressure: 'flat' });
    g.restore();
  }
  function shoeDef(K, bd) {
    const c = K.c, c1 = c.shoeC1, c2 = c.shoeC2, st = c.shoe;
    const shoe = { color: c1, sole: col.mix(c1, '#ffffff', 0.55), shade: col.shade(c1, 0.1), k: 1.25 };
    let decor = null;
    if (st === 'sneaker') { shoe.toeCap = c2; shoe.heel = col.mix(c2, '#ffffff', 0.3); }
    else if (st === 'chunky') { shoe.k = 1.5; shoe.sole = c2; shoe.toeCap = col.mix(c1, c2, 0.4); shoe.accent = col.shade(c2); }
    else if (st === 'hightop') { shoe.toeCap = c2; decor = (g, hip, an) => shaft(g, K, an, hip, 17, c1, c2, true); }
    else if (st === 'boot') { shoe.k = 1.3; shoe.sole = col.shade(c1, 0.2); shoe.heel = col.shade(c1, 0.2); decor = (g, hip, an) => shaft(g, K, an, hip, 28, c1, c2, false); }
    else if (st === 'slipon') { shoe.k = 1.2; shoe.accent = c2; shoe.sole = c2; }
    else if (st === 'sandal') { shoe.k = 0.001; decor = (g, hip, an) => sandal(g, K, an, hip, c1, c2); }
    else if (st === 'heel') { shoe.k = 0.001; decor = (g, hip, an) => heel(g, K, an, hip, c1, c2); }
    else if (st === 'socks') { shoe.color = c.sockC; shoe.sole = col.shade(c.sockC, 0.1); shoe.shade = col.shade(c.sockC); shoe.k = 1.2; }
    else if (st === 'paws') { shoe.paw = true; shoe.color = c1; shoe.shade = col.shade(c1); shoe.hi = col.tint(c1, 0.3); shoe.pawLine = c2; shoe.k = 1.35; }
    return { shoe, decor };
  }

  // ---- the outfit ----
  CC.outfit = function (K) {
    const c = K.c, out = { sleeve: null, cuff: null, armColor: null };
    const one = c.onepiece;
    let bd = bottomDef(K);
    const sd = shoeDef(K, bd);
    const legDecor = bd.legs.decor, hasSock = bd.skinLegs;
    // the legs spec: bottom decor, then socks (bare legs only), then boot shafts
    const legs = Object.assign({}, bd.legs);
    legs.shoe = sd.shoe;
    // whether the garment hides the legs (long skirts, onesie)
    let skirt = bd.skirt, topFn = null, topC = { c1: c.topC1, c2: c.topC2, pat: c.topPattern };
    let onesie = null;

    if (one === 'dress' || one === 'sundress') { skirt = one === 'dress' ? 'pleat' : 'aline'; bd = { legs: Object.assign({ w: [27 * K.legT, 21 * K.legT], color: K.skin, shade: K.skinSh, bow: 1.5 }), skinLegs: true }; Object.assign(legs, bd.legs, { decor: null }); delete legs.profile; legs.pantsOver = false; }
    if (one === 'jumpsuit') { bd = bottomDef(Object.assign({}, K, { c: Object.assign({}, c, { bottom: 'jeans', botC1: c.opC1, botC2: c.opC2, botPattern: 'none' }) })); Object.assign(legs, bd.legs); legs.shoe = sd.shoe; skirt = null; }
    if (one === 'overalls') { bd = bottomDef(Object.assign({}, K, { c: Object.assign({}, c, { bottom: 'jeans', botC1: c.opC1, botC2: c.opC2, botPattern: 'none' }) })); Object.assign(legs, bd.legs); legs.shoe = sd.shoe; skirt = null; }
    if (one === 'onesie') { const fc = c.opC1; Object.assign(legs, { w: [38 * K.legT, 30 * K.legT], color: fc, shade: col.shade(fc), pantsOver: true, bow: 2, decor: null }); delete legs.profile; skirt = null; legs.shoe = shoeDef(Object.assign({}, K, { c: Object.assign({}, c, { shoe: c.shoe === 'paws' ? 'paws' : 'paws', shoeC1: fc, shoeC2: c.opC2 }) }), bd).shoe; sd.decor = null; }

    // sock and boot decor wrap the bottom's own decor
    const sockOk = (hasSock || one === 'dress' || one === 'sundress') && one !== 'onesie' && one !== 'jumpsuit' && one !== 'overalls' && skirt !== 'maxi';
    const inner = legs.decor;
    legs.decor = function (g, hip, an, mid) {
      if (inner) inner(g, hip, an, mid);
      if (sockOk) sockDraw(g, K, hip, an);
      if (sd.decor && one !== 'onesie') sd.decor(g, hip, an);
    };
    if (skirt === 'maxi') legs.decor = function () {};

    // --- the torso layer ---
    out.torso = function (g, S) {
      neckSkin(g, K);
      if (one === 'dress' || one === 'sundress') {
        bareTorso(g, K);
        const c1 = c.opC1, c2 = c.opC2;
        drawSkirt(g, K, skirt, c1, c2, c.topPattern, S);
        if (one === 'dress') {
          const bodice = [[-14, -142], [-30, -136], [-27, -120], [-23, -104], [-22, -93, 1], [22, -93, 1], [23, -104], [27, -120], [30, -136], [14, -142], [10, -133], [5, -126], [0, -123], [-5, -126], [-10, -133]];
          RJ.cel(g, [[-16, -142], [16, -142], [8, -128], [0, -122], [-8, -128]], K.skin, { shadow: K.skinSh, line: false, depth: 3 });
          cloth(g, bodice, c1, { depth: 6, tension: 0.8, pattern: c.topPattern, c2: c2 });
        } else {
          const bodice = [[-17, -150, 1], [-11, -150, 1], [-9, -138], [0, -132], [9, -138], [11, -150, 1], [17, -150, 1], [19, -134], [24, -122], [24, -104], [23, -93, 1], [-23, -93, 1], [-24, -104], [-24, -122], [-19, -134]];
          cloth(g, bodice, c1, { depth: 6, tension: 0.6, pattern: c.topPattern, c2: c2 });
        }
        cloth(g, [[-23.5, -96], [23.5, -96], [24.5, -89], [-24.5, -89]], c2, { depth: 2, tension: 0.2, noHi: true });
        out.sleeve = 'none';
      } else if (one === 'jumpsuit') {
        bareTorso(g, K);
        const right = [[30, -147], [34, -130], [33, -106], [35, -90], [38, -76, 1]];
        hipBlock(g, c.opC1, -68);
        cloth(g, sym(NECK.vneck, right, [0, -70]), c.opC1, { pattern: c.topPattern, c2: c.opC2 });
        cloth(g, [[-26, -98], [26, -98], [26, -90], [-26, -90]], c.opC2, { depth: 2, tension: 0.2, noHi: true });
        cloth(g, [[-4, -97], [4, -97], [4, -91], [-4, -91]], '#ffd84d', { depth: 1, tension: 0.2, noHi: true });
        rim(g, NECK.vneck, col.shade(c.opC1, 0.12), 2.2);
      } else if (one === 'overalls') {
        bareTorso(g, K);
        hipBlock(g, c.opC1, -68);
        const tc = { c1: c.opC2, c2: c.opC1, pat: 'none' };
        cloth(g, sym(NECK.crew, TEE_R, [0, -71.5]), tc.c1, {});
        rim(g, NECK.crew.slice(1, 4), col.shade(tc.c1, 0.12), 2.2);
        const bib = [[-17, -122, 1], [17, -122, 1], [19, -96], [28, -86], [30, -72, 1], [-30, -72, 1], [-28, -86], [-19, -96]];
        cloth(g, bib, c.opC1, { depth: 5, pattern: c.topPattern, c2: c.opC2, decor: (gg) => { RJ.cel(gg, [[-10, -112], [10, -112], [10, -98], [-10, -98]], col.shade(c.opC1, -0.03), { depth: 2, tension: 0.2, noHi: true }); } });
        [-1, 1].forEach((s) => { cloth(g, [[s * 9, -122], [s * 17, -122], [s * 20, -146], [s * 12, -148]], c.opC1, { depth: 2, tension: 0.2, noHi: true }); g.beginPath(); g.arc(s * 15, -123, 2.4, 0, TAU); g.fillStyle = '#ffd84d'; g.fill(); g.lineWidth = 0.9; g.strokeStyle = C.ink; g.stroke(); });
        out.sleeve = 'short'; out.len = 0.62; out.sleeveColor = tc.c1;
      } else if (one === 'onesie') {
        const fc = c.opC1, cc2 = c.opC2, ONE = [[-30, -148], [30, -148], [40, -134], [42, -108], [40, -84], [38, -60], [36, -42], [8, -38], [0, -45], [-8, -38], [-36, -42], [-38, -60], [-40, -84], [-42, -108], [-40, -134]];
        cloth(g, ONE, fc, { depth: 9, tension: 0.9, decor: (gg) => { RJ.ink(gg, [[0, -148], [0, -60]], { w: 1.4, color: col.shade(fc, 0.2), taper: 0, wobble: 0, alpha: 0.6 }); } });
        RJ.cel(g, tk.ellipsePts(2, -92, 20, 24, 14, 0), cc2, { shadow: col.shade(cc2), line: LINE.mid, depth: 4, hi: col.tint(cc2, 0.3) });
        furMarks(g, [[-28, -120], [28, -122], [-30, -80], [32, -76], [-18, -58], [20, -56], [-6, -134]], col.shade(fc, 0.25));
        out.sleeve = 'long'; out.armColor = fc; out.cuff = col.shade(fc, -0.02);
      } else {
        // separates: skin base, the bottom's hip block or skirt, then the top
        bareTorso(g, K);
        if (!skirt && bd.hip) hipBlock(g, bd.hip, -68);
        const r = TOPS[c.top](g, K, topC) || {};
        if (skirt) drawSkirt(g, K, skirt, c.botC1, c.botC2, c.botPattern, S);
        out.sleeve = r.sleeve; out.len = r.len; out.armColor = r.arm; out.cuff = r.cuff; out.sleeveColor = r.sleeveColor; out.crop = r.crop;
      }
      neckAcc && neckAcc(g, S);
    };
    let neckAcc = null;
    out.setNeck = (f) => { neckAcc = f; };
    // the sleeve info has to be known before the arms draw, so it is computed from the catalog, not by drawing
    out.arm = armInfo(K, one);
    out.legs = legs;
    out.skirt = skirt;
    out.onesie = one === 'onesie';
    return out;
  };
  function furMarks(g, pts, c) { RJ.hatch(g, pts.map((p) => [[p[0] - 3.5, p[1] - 2], [p[0] - 2, p[1] + 1.6], [p[0], p[1] - 0.6], [p[0] + 1.6, p[1] + 1.8], [p[0] + 3.4, p[1] - 1.6]]), { w: 1.3, color: c, alpha: 0.9 }); }

  // what a top does to the arms, known without drawing: {kind, len, color, cuff}
  const SLEEVE_OF = { tee: 'short', vneck: 'short', tank: 'none', crop: 'short', long: 'long', baseball: 'short', hoodie: 'long', jumper: 'long', turtle: 'long', jacket: 'long', bomber: 'long', blazer: 'long', vest: 'short', shirt: 'short', track: 'long', jersey: 'none', cardigan: 'long', polo: 'short' };
  function armInfo(K, one) {
    const c = K.c;
    let kind, len = 0.62, color = null, cuff = null, sleeveColor = null;
    if (one === 'dress' || one === 'sundress') kind = 'none';
    else if (one === 'jumpsuit') { kind = 'short'; sleeveColor = c.opC1; }
    else if (one === 'overalls') { kind = 'short'; sleeveColor = c.opC2; }
    else if (one === 'onesie') { kind = 'long'; color = c.opC1; cuff = col.shade(c.opC1, -0.02); }
    else {
      kind = SLEEVE_OF[c.top];
      const t = c.top, c1 = c.topC1, c2 = c.topC2;
      if (t === 'crop') len = 0.55;
      if (t === 'baseball') { len = 0.7; sleeveColor = c2; }
      if (t === 'vest') sleeveColor = c2;
      if (t === 'long') { color = c1; cuff = c2; }
      if (t === 'hoodie' || t === 'jumper' || t === 'turtle') { color = c1; cuff = col.shade(c1, -0.02); }
      if (t === 'jacket' || t === 'bomber' || t === 'blazer' || t === 'cardigan' || t === 'track') { color = c1; cuff = t === 'bomber' || t === 'track' ? c2 : col.shade(c1, -0.02); }
      if (t === 'shirt' || t === 'polo') { len = 0.66; sleeveColor = c1; }
      if (t === 'tee' || t === 'vneck') sleeveColor = c1;
      if (t === 'crop') sleeveColor = c1;
    }
    // the player's own choice
    if (c.sleeve !== 'auto' && one === 'none') {
      const want = c.sleeve === 'three' ? 'elbow' : c.sleeve, base = color || sleeveColor || c.topC1;
      if (want === 'none') { kind = 'none'; color = null; cuff = null; }
      else if (want === 'short') { kind = 'short'; len = 0.62; color = null; sleeveColor = sleeveColor || base; }
      else if (want === 'elbow') { kind = 'short'; len = 0.97; color = null; sleeveColor = sleeveColor || base; }
      else if (want === 'long') { kind = 'long'; color = color || base; cuff = cuff || col.shade(base, -0.02); }
    }
    return { kind, len, color, cuff, sleeveColor: sleeveColor || c.topC1 };
  }
  CC.armInfo = armInfo;
})();
