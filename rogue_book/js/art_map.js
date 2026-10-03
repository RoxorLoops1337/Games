// Inkwoven -- ART.map: the hand-painted map page (extends ART from art.js; DESIGN 4.8 geometry, 5.6 signatures, ART_BIBLE 6 look).
//
// The look: a storybook page being coloured in. Unpainted hexes are blank parchment with stitched dotted edges and faint pencil sketches; landmarks
// (boss shop camp forge elite chest) are known from the start and show a ghost silhouette of their stamp. Painted hexes are watercolour washes
// (a pigment per tile type, wet edge, granulation, a hard cel shadow with screen-tone, a wobbly ink outline varied by seed) with the tile's ink
// stamp on top (ART.icon kind 'tile' when real art exists, otherwise a built-in hanko + glyph, so the page is complete either way).
//
// API (all safe with the headless no-op context, never throw for bad input, deterministic, no Math.random). Hex geometry: pointy-top, `size` is the
// centre-to-corner radius (46 at zoom 1), (x, y) is the hex CENTRE. Everything below is in the caller's current transform.
//   ART.map.hex(ctx, kind, x, y, size, opts)       kind in DATA.LISTS.mapKinds: fog known ground block painted edge path hover target.
//        opts {tile, seed, done, t}: tile = LISTS.tiles id (wash and stamp; 'known' needs a landmark id), seed = U.hash(q, r), done fades the stamp,
//        t = seconds (drives the live touches: camp and forge glow, chest glint, well ripple, boss and elite pulse, edge and target marching dashes).
//        Cached per (kind, tile, done, seed % 8, size rung): sprites are baked on a ladder of sizes 12 percent apart and scaled, at most 8 new bakes per
//        frame (neighbour rung is scaled meanwhile), so a smooth zoom 0.6..2.0 never stalls. 'path' 'hover' 'target' are translucent overlays drawn
//        over the hex that is already there; 'edge' is a fog hex touching painted ground (lit, gold stitches: it can be painted); 'block' is the Void.
//   ART.map.paintBloom(ctx, x, y, size, p, opts?)  the reveal, p 0..1. opts {tile, seed, fromX, fromY, ox, oy}. With opts.tile the wash is revealed
//        inside a growing wet blot (draw the fog hex first); without it a neutral wet wash fades out over a hex already painted. fromX/fromY = where the
//        brush arrives from. Droplets, a pale back-run ring, a gleam streak and a final sparkle; p >= 1 draws the settled painted hex.
//   ART.map.token(ctx, heroIds, x, y, t, moving, opts?)  the two chibi tokens (ART.hero.draw scaled down, leader larger in front, second behind),
//        soft shadows, a gold ink ring, idle bob or walk cycle. opts {size, dir (1 or -1 faces right or left), alpha, ring}.
//   ART.map.frame(ctx, w, h, t)                    the open book: leather cover, page stack, gutter with sewing, bookmark ribbon, gilt corners, ink-blot
//        vignette, page curls. Draw LAST; the window is transparent. ART.map.frameInner(w, h) -> {x, y, w, h} (1280 x 720 gives 1192 x 648, at least
//        the contractual 1180 x 640).
//   ART.map.paper(ctx, w, h, camX, camY, zoom, opts?)  the parchment ground in WORLD space ((camX, camY) = the world point at the view centre, hex size
//        46 at zoom 1): fibre, mottling and stains in seamless cached chunks (about 6 opaque blits), sea-monster, compass, boat and koi doodles in the
//        margins and faintly under the fog. opts {doodles:false, world:{x0,y0,x1,y1}, t}. ART.map.worldBox(opts) is the box the doodles are placed in.
//   ART.map.route(ctx, pts, t, opts?)              the dotted brush-stroke path preview: pts = [[x, y]] or [{x, y}] in screen px, wet underlay, marching
//        ink dabs, a destination ring and the ink cost pill. opts {size, cost | label, affordable (false = red, shaking pill), pill:false, alpha}.
//   ART.map.brushPreview(ctx, hexes, size, valid, t)  the cells a brush would paint (hexes = centres) as one wet shape with a marching outline,
//        sparkles, a wet sheen; valid === false shows a red shape with an X. ART.map.brushEdges(hexes, size) -> {inner, outer} side segments.
//   ART.map.fogEdge(ctx, cells, size, t, opts?)    the soft ink-wash boundary where painted ground meets blank paper (and the torn rim where it meets the
//        Void): cells = [{x, y, mask, voidMask}] for PAINTED hexes, bit d of mask = the neighbour across side d (MAP.DIRS order) is fog, of voidMask is
//        the Void. ART.map.edgeMasks(q, r, kindAt) builds both masks from a predicate returning 'fog' | 'void' | anything else. Draw it after the hexes.
// Extras for screens and tests: ART.map.warm(size, {tiles, done, ms}) pre-bakes the sprites of a size (call on screen load), ART.map.bakedSize(size),
// ART.map.info(), ART.map.corners(x, y, size), ART.map.washOf(tile), ART.map.geom.
//
// Gallery sheets: map_kinds (every kind and tile wash), map_page (a MAP.generate page, part painted, with fog edge, token, route, brush preview and
// hover; params zoom t cx cy moving), map_frame (guides=1 outlines the window and the 1180 x 640 minimum), map_bloom (film strip), map_token, map_paper,
// map_doodles. Draw order for a screen: paper, hexes (row by row), fogEdge, path/target/hover overlays, route, brushPreview, token, frame.
(() => {
  'use strict';
  const tk = ART.tk, pal = tk.pal;
  const TAU = Math.PI * 2, PI = Math.PI, SQ3 = Math.sqrt(3);
  const clamp = tk.clamp, lerp = tk.lerp, num = tk.num;
  const cA = (a) => (a >= 0 ? (a <= 1 ? a : 1) : 0);
  const pos = (v, d) => (v > 0 && isFinite(v) ? v : d);
  const A = (hex, a) => tk.rgba(hex, a);
  const mixc = (a, b, k) => tk.mix(a, b, k);
  const R = (...k) => tk.rng('map', ...k);
  const L = DATA.LISTS;

  // ---------------------------------------------------------------------------------------------------------------
  // geometry (DESIGN 4.8): pointy-top hex, size = centre to corner, corner i at 60 * i - 30 degrees, side d faces MAP.DIRS[d]
  // ---------------------------------------------------------------------------------------------------------------
  const SIDE_ANG = [0, -PI / 3, -2 * PI / 3, PI, 2 * PI / 3, PI / 3];         // direction to the neighbour across side d (E NE NW W SW SE)
  const SIDE_CORNERS = [[0, 1], [5, 0], [4, 5], [3, 4], [2, 3], [1, 2]];       // the two corner indices that bound side d
  const cornerAng = (i) => i * PI / 3 - PI / 6;
  function corners(x, y, size) {
    const s = pos(size, 46), out = [];
    for (let i = 0; i < 6; i++) out.push({ x: x + Math.cos(cornerAng(i)) * s, y: y + Math.sin(cornerAng(i)) * s });
    return out;
  }
  function hexPath(g, x, y, s) {
    for (let i = 0; i < 6; i++) { const a = cornerAng(i), px = x + Math.cos(a) * s, py = y + Math.sin(a) * s; if (i === 0) g.moveTo(px, py); else g.lineTo(px, py); }
    g.closePath();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // sprite ladder: hex sprites are baked at a handful of sizes (12 percent apart) and scaled to the real size, so a smooth zoom does not bake a
  // new set of 100 sprites every frame. BAKES_PER_FRAME limits how many missing sprites one frame may bake while a neighbouring size exists.
  // ---------------------------------------------------------------------------------------------------------------
  const BASE = 46, STEP = 1.12, KMIN = -8, KMAX = 9, LOGSTEP = Math.log(STEP);
  const rungOf = (size) => clamp(Math.round(Math.log(pos(size, BASE) / BASE) / LOGSTEP), KMIN, KMAX);
  const rungSize = (k) => Math.round(BASE * Math.pow(STEP, k) * 100) / 100;
  let bakeBudget = 8, lastT = NaN, bakedTotal = 0;
  const BAKES_PER_FRAME = 8;
  const newFrame = (t) => { if (t !== lastT) { lastT = t; bakeBudget = BAKES_PER_FRAME; } };
  const variant = (seed) => { const n = Math.floor(num(seed, 0)) % 8; return n < 0 ? n + 8 : n; };

  // ---------------------------------------------------------------------------------------------------------------
  // wash table: the colour of every tile type. c = the pigment, d = a darker pool colour, l = the light bloom
  // ---------------------------------------------------------------------------------------------------------------
  const WASH = {
    empty: { c: '#cfdcaa', glyph: 'tufts' },
    start: { c: '#f6cf7c', glyph: 'star' },
    enemy: { c: '#e8605a', glyph: 'splat' },
    elite: { c: '#a3204c', glyph: 'gilt' },
    boss: { c: '#2c1c58', glyph: 'crown' },
    chest: { c: '#f2bc45', glyph: 'rays' },
    shop: { c: '#e9a13a', glyph: 'noren' },
    camp: { c: '#ff8a55', glyph: 'glowwarm' },
    event: { c: '#9b6be4', glyph: 'wisps' },
    well: { c: '#4aa4ee', glyph: 'ripples' },
    brush: { c: '#2fbdb5', glyph: 'swash' },
    gemcache: { c: '#4bcf78', glyph: 'glints' },
    forge: { c: '#c9452b', glyph: 'embers' },
    block: { c: '#241a3a', glyph: 'void' },
  };
  const washOf = (tile) => WASH[tile] || WASH.empty;

  // ---------------------------------------------------------------------------------------------------------------
  // shape helpers
  // ---------------------------------------------------------------------------------------------------------------
  // A crisp hex outline with a hand-drawn edge: dense control points, each side bowed a little (amp is the bow as a share of s), corners
  // nudged and cut so they read as soft. r is a seeded stream. spiky (the boss) turns every corner into a torn spike.
  function hexRing(cx, cy, s, r, amp, spiky) {
    const C = [];
    for (let i = 0; i < 6; i++) { const a = cornerAng(i), jr = 1 + (r() - 0.5) * amp * 1.2; C.push([cx + Math.cos(a) * s * jr, cy + Math.sin(a) * s * jr]); }
    const pts = [], cut = spiky ? 0.16 : 0.07;
    for (let i = 0; i < 6; i++) {
      const P = C[i], N = C[(i + 1) % 6], am = (cornerAng(i) + cornerAng(i + 1)) / 2, nx = Math.cos(am), ny = Math.sin(am);
      const bow = (r() - 0.5) * 2 * amp * s, wob = (r() - 0.5) * amp * s * 0.6;
      if (spiky) {
        const a0 = cornerAng(i), sp = 1.08 + r() * 0.05;
        pts.push([cx + Math.cos(a0) * s * sp, cy + Math.sin(a0) * s * sp, 1]);
      }
      const n = 5;
      for (let j = 0; j <= n; j++) {
        const u = lerp(cut, 1 - cut, j / n), off = bow * Math.sin(PI * u) + wob * Math.sin(TAU * u + i) - (spiky ? s * 0.09 * Math.sin(PI * u) : 0);
        pts.push([lerp(P[0], N[0], u) + nx * off, lerp(P[1], N[1], u) + ny * off]);
      }
    }
    return pts;
  }
  const TENS = 0.55;
  const traceRing = (g, ring, dx, dy) => tk.trace(g, ring, dx || 0, dy || 0, TENS);
  const fillRing = (g, ring, fill) => { g.beginPath(); traceRing(g, ring); g.fillStyle = fill; g.fill(); };
  const clipRing = (g, ring) => { g.beginPath(); traceRing(g, ring); g.clip(); };
  // clip to the part of the ring NOT covered by the ring shifted by (dx, dy): a hard crescent on the far side of the shift
  function clipCrescent(g, ring, box, dx, dy) {
    g.beginPath(); g.rect(box[0], box[1], box[2] - box[0], box[3] - box[1]); traceRing(g, ring, dx, dy); g.clip('evenodd');
  }
  const LIGHT = tk.light;                          // direction TO the key light (upper right)
  const LX = Math.cos(LIGHT), LY = Math.sin(LIGHT);
  const blobPts = (cx, cy, rx, ry, r, jag, n) => {
    const pts = [];
    for (let i = 0; i < (n || 9); i++) { const a = i / (n || 9) * TAU, k = 1 + (r() - 0.5) * 2 * jag; pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]); }
    return pts;
  };
  const softDisc = (g, x, y, rad, col, a) => { g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fillStyle = A(col, a); g.fill(); };

  // ---------------------------------------------------------------------------------------------------------------
  // fog: blank paper with a fibre texture and a running stitch around the edge
  // ---------------------------------------------------------------------------------------------------------------
  function stitches(g, cx, cy, s, r, col, a, k) {
    const inset = s * 0.8, n = 5;
    for (let d = 0; d < 6; d++) {
      const c0 = SIDE_CORNERS[d][0], c1 = SIDE_CORNERS[d][1];
      const ax = cx + Math.cos(cornerAng(c0)) * inset, ay = cy + Math.sin(cornerAng(c0)) * inset;
      const bx = cx + Math.cos(cornerAng(c1)) * inset, by = cy + Math.sin(cornerAng(c1)) * inset;
      for (let i = 0; i < n; i++) {
        const u0 = (i + 0.14) / n, u1 = (i + 0.72) / n, j = (r() - 0.5) * 0.9 * k;
        const x0 = lerp(ax, bx, u0), y0 = lerp(ay, by, u0) + j, x1 = lerp(ax, bx, u1), y1 = lerp(ay, by, u1) + j;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1);
        g.lineWidth = 1.5 * k; g.lineCap = 'round'; g.strokeStyle = A('#f8efd8', a * 0.7); g.stroke();       // the thread's light edge
        g.beginPath(); g.moveTo(x0, y0 + 0.5 * k); g.lineTo(x1, y1 + 0.5 * k);
        g.lineWidth = 1.1 * k; g.strokeStyle = A(col, a); g.stroke();
      }
    }
  }
  // faint pencil sketches of the lands nobody has painted yet (by variant), so the blank page is not quite blank
  function sketch(g, cx, cy, s, kind, k) {
    const col = '#6b5238', P = (pts) => pts.map((q) => [cx + q[0] * s / 46, cy + q[1] * s / 46]), ln = (pts, w) => tk.inkPath(g, P(pts), { w: w * k, color: col, alpha: 0.2, taper: 0.35, wobble: 0.1, seed: kind });
    if (kind === 1) { ln([[0, 10], [0, -2]], 1.3); [[-9, 2, 0, -14], [-7, -4, 0, -18]].forEach((t2) => ln([[t2[0], t2[1]], [t2[2], t2[3]], [-t2[0], t2[1]]], 1.1)); }
    else if (kind === 2) { ln([[-16, 10], [-7, -6], [0, 4], [8, -10], [18, 10]], 1.3); ln([[8, -10], [5, -4], [9, -3]], 0.9); }
    else if (kind === 4) { ln([[-14, -2], [-8, -8], [-2, -2], [4, -8], [10, -2]], 1.2); ln([[-8, 6], [-2, 0], [4, 6], [10, 0], [16, 6]], 1.2); }
    else if (kind === 5) { ln([[0, 0], [5, -3], [8, 2], [1, 7], [-8, 3], [-8, -6], [1, -12], [13, -8]], 1.1); }
    else if (kind === 7) { for (let j = -2; j <= 2; j++) ln([[j * 4, 10], [j * 5, 2], [j * 7, -6 + Math.abs(j) * 2]], 1); }
  }
  function fogSprite(g, w, h, s, v, lit, noSketch) {
    const cx = w / 2, cy = h / 2, k = s / BASE, r = R('fog', v);
    const ring = hexRing(cx, cy, s * 0.995, R('ring', v), 0.014);
    g.save(); clipRing(g, ring);
    g.fillStyle = A('#fbf3dc', 0.34); g.fillRect(0, 0, w, h);
    // faint fibres: short strokes along the grain, and a few darker specks
    g.lineCap = 'round';
    const nf = tk.lowQ() ? 8 : 22;
    for (let i = 0; i < nf; i++) {
      const x = cx + (r() - 0.5) * s * 1.7, y = cy + (r() - 0.5) * s * 1.9, a = r() * TAU, l = (3 + r() * 6) * k;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (r() - 0.5) * 2 * k, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.lineWidth = (0.5 + r() * 0.5) * k; g.strokeStyle = r() < 0.5 ? A('#7a5a3a', 0.09 + r() * 0.08) : A('#ffffff', 0.25 + r() * 0.2); g.stroke();
    }
    for (let i = 0; i < 6; i++) { g.fillStyle = A('#8a6a3a', 0.05 + r() * 0.05); g.fillRect(cx + (r() - 0.5) * s * 1.5, cy + (r() - 0.5) * s * 1.7, (0.6 + r()) * k, (0.6 + r()) * k); }
    if (!noSketch && !tk.lowQ() && v !== 0 && v !== 3 && v !== 6) sketch(g, cx + (r() - 0.5) * s * 0.25, cy + (r() - 0.5) * s * 0.2, s, v, k);
    if (lit) { const gr = g.createRadialGradient(cx, cy, 0, cx, cy, s); gr.addColorStop(0, A('#ffe9a8', 0.34)); gr.addColorStop(1, A('#ffe9a8', 0.04)); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    g.restore();
    stitches(g, cx, cy, s, r, '#8a6f55', 0.62, k);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // the ink stamp on a hex: the tile icon (ART.icon) once real icon art exists, else a small vermilion hanko with a black-ink glyph of
  // our own, so the page is readable and beautiful before (and without) art_icons.js
  // ---------------------------------------------------------------------------------------------------------------
  const GLYPH = {
    enemy(S, F) { S([[-24, -26], [-4, -2], [22, 26]], 8); S([[-6, -30], [10, -6], [30, 12]], 6); S([[-30, -8], [-16, 10], [0, 30]], 6); },
    elite(S, F) { S([[-28, -28], [0, 0], [28, 28]], 8); S([[28, -28], [0, 0], [-28, 28]], 8); F([[0, -38], [4, -30], [12, -30], [6, -25], [8, -17], [0, -22], [-8, -17], [-6, -25], [-12, -30], [-4, -30]]); },
    boss(S, F) { S([[-26, -6], [-30, -26], [-16, -36]], 7); S([[26, -6], [30, -26], [16, -36]], 7); F([[-22, -8], [0, -14], [22, -8], [18, 14], [8, 28], [-8, 28], [-18, 14]]); S([[-16, 8], [-8, 4], [-4, 12]], 4, '#e8383d'); S([[16, 8], [8, 4], [4, 12]], 4, '#e8383d'); },
    chest(S, F) { F([[-28, -8], [-24, -22], [0, -28], [24, -22], [28, -8]]); F([[-28, -4], [28, -4], [26, 24], [-26, 24]]); S([[-28, -5], [28, -5]], 3.4, '#e8383d'); F([[-5, -10], [5, -10], [5, 4], [-5, 4]], '#f5c96a'); },
    shop(S, F) { S([[0, -30], [24, -14], [24, 14], [0, 30], [-24, 14], [-24, -14], [0, -30]], 6); F([[-8, -8], [8, -8], [8, 8], [-8, 8]], '#e8383d'); },
    camp(S, F) { F([[0, -34], [14, -14], [22, 4], [14, 20], [0, 26], [-14, 20], [-22, 4], [-12, -8], [-4, -18]]); F([[0, -8], [8, 6], [4, 18], [-4, 18], [-8, 6]], '#f5c96a'); S([[-26, 30], [26, 22]], 5); S([[-26, 22], [26, 30]], 5); },
    event(S, F) { S([[-14, -18], [-10, -30], [4, -32], [16, -22], [12, -8], [0, 2], [0, 12]], 8); F([[-5, 20], [5, 20], [5, 30], [-5, 30]]); },
    well(S, F) { F([[0, -34], [16, -8], [20, 8], [10, 22], [-10, 22], [-20, 8], [-16, -8]]); S([[-28, 32], [-12, 28], [12, 28], [28, 32]], 4, '#f5c96a'); },
    brush(S, F) { S([[24, -32], [8, -8], [-8, 12]], 6); F([[-6, 8], [4, 2], [8, 6], [-12, 34], [-24, 30], [-16, 18]]); },
    gemcache(S, F) { S([[0, -30], [26, -8], [0, 30], [-26, -8], [0, -30]], 6); S([[-26, -8], [26, -8]], 4); S([[-10, -8], [0, 30], [10, -8], [0, -30]], 3.4, '#f5c96a'); },
    forge(S, F) { F([[-30, -8], [26, -8], [14, 4], [12, 14], [24, 24], [-24, 24], [-12, 14], [-10, 4], [-30, 0]]); S([[8, -34], [26, -20]], 7); S([[-4, -14], [14, -28]], 4, '#f5c96a'); },
    start(S, F) { F([[-14, -32], [14, -32], [14, 30], [0, 16], [-14, 30]]); S([[-6, -20], [6, -20]], 3, '#f3e6c8'); },
  };
  function fallbackStamp(g, tile, cx, cy, size, done) {
    const u = size / 100, r = R('stamp', tile), rr = 43 * u;
    g.save();
    if (done) g.globalAlpha = g.globalAlpha * 0.42;
    tk.celFill(g, tk.ellipsePts(cx, cy, rr, rr, 14, 0).map((p) => [p[0] + (r() - 0.5) * 2.2 * u, p[1] + (r() - 0.5) * 2.2 * u]), '#e8383d', { line: Math.max(1.2, 3.6 * u), depth: 6 * u, rim: '#ffb0a0', rimW: 2 * u, seed: 3 });
    const glyph = GLYPH[tile];
    if (glyph) {
      const P = (pts) => pts.map((q) => [cx + q[0] * u * 0.98, cy + q[1] * u * 0.98]);
      const S = (pts, w, col) => tk.inkPath(g, P(pts), { w: w * u, color: col || pal.ink, taper: 0.22, wobble: 0.08, seed: 2 });
      const F = (pts, col) => { g.beginPath(); tk.trace(g, P(pts), 0, 0, 0.5); g.fillStyle = col || pal.ink; g.fill(); };
      glyph(S, F);
    }
    g.restore();
  }
  function stamp(g, tile, cx, cy, size, done, alpha) {
    g.save();
    if (alpha !== undefined) g.globalAlpha = g.globalAlpha * cA(alpha);
    if (ART.has('tile', tile)) {
      try { ART.icon.draw(g, 'tile', tile, cx, cy, size, { done: !!done }); } catch (e) { fallbackStamp(g, tile, cx, cy, size, done); }
    } else fallbackStamp(g, tile, cx, cy, size, done);
    g.restore();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // painted: a watercolour wash with a wet edge, granulation, a hard cel shadow with screen-tone, an ink outline and the stamp
  // ---------------------------------------------------------------------------------------------------------------
  const DECOR = {
    tufts(g, s, r, c, k, cx, cy) {                                     // dry-brush grass tufts
      for (let i = 0; i < 4; i++) {
        const x = cx + (r() - 0.5) * s * 1.1, y = cy + (r() - 0.3) * s * 1.0;
        for (let j = -1; j <= 1; j++) tk.inkPath(g, [[x + j * 3 * k, y], [x + j * 4.5 * k, y - 4 * k], [x + j * 6 * k, y - (8 + r() * 3) * k]], { w: 1.3 * k, color: c.d, alpha: 0.5, taper: 0.4, wobble: 0.1, seed: i * 3 + j });
      }
    },
    star(g, s, r, c, k, cx, cy) { for (let i = 0; i < 5; i++) tk.sparkle(g, cx + (r() - 0.5) * s * 1.3, cy + (r() - 0.5) * s * 1.3, (2 + r() * 3) * k, { color: pal.gold2, glow: 0, alpha: 0.9 }); },
    splat(g, s, r, c, k, cx, cy) { for (let i = 0; i < 6; i++) softDisc(g, cx + (r() - 0.5) * s * 1.4, cy + (r() - 0.5) * s * 1.5, (1.2 + r() * 2.6) * k, c.d, 0.55); },
    gilt(g, s, r, c, k, cx, cy) { for (let i = 0; i < 6; i++) { const a = cornerAng(i); tk.sparkle(g, cx + Math.cos(a) * s * 0.78, cy + Math.sin(a) * s * 0.78, 3.4 * k, { color: pal.gold, glow: 0, alpha: 0.95 }); } },
    crown(g, s, r, c, k, cx, cy) { for (let i = 0; i < 5; i++) { const x = cx + (r() - 0.5) * s * 1.3; tk.inkPath(g, [[x, cy - s * 0.9], [x + (r() - 0.5) * 3 * k, cy - s * 0.4], [x, cy - s * 0.4 + r() * s * 0.5]], { w: 2 * k, color: '#8f5fe8', alpha: 0.55, taper: 0.6, seed: i }); } },
    rays(g, s, r, c, k, cx, cy) { g.fillStyle = A('#fff2c8', 0.35); for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + 0.2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a - 0.11) * s, cy + Math.sin(a - 0.11) * s); g.lineTo(cx + Math.cos(a + 0.11) * s, cy + Math.sin(a + 0.11) * s); g.fill(); } },
    noren(g, s, r, c, k, cx, cy) { for (let i = 0; i < 4; i++) { const x = cx + (i - 1.5) * s * 0.3; g.fillStyle = i % 2 ? A('#fff4d8', 0.7) : A('#c8321f', 0.6); g.fillRect(x - s * 0.13, cy - s * 0.86, s * 0.26, s * 0.34); } },
    glowwarm(g, s, r, c, k, cx, cy) { const gr = g.createRadialGradient(cx, cy + s * 0.1, 0, cx, cy + s * 0.1, s * 0.85); gr.addColorStop(0, A('#ffe0a0', 0.8)); gr.addColorStop(1, A('#ffe0a0', 0)); g.fillStyle = gr; g.fillRect(cx - s, cy - s, s * 2, s * 2); },
    wisps(g, s, r, c, k, cx, cy) { for (let i = 0; i < 3; i++) { const a = r() * TAU; tk.inkPath(g, [[cx + Math.cos(a) * s * 0.3, cy + Math.sin(a) * s * 0.3], [cx + Math.cos(a + 1) * s * 0.55, cy + Math.sin(a + 1) * s * 0.55], [cx + Math.cos(a + 2) * s * 0.75, cy + Math.sin(a + 2) * s * 0.75]], { w: 1.6 * k, color: '#e2d0ff', alpha: 0.6, taper: 0.4, seed: i }); } },
    ripples(g, s, r, c, k, cx, cy) { for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(cx, cy + s * 0.05, s * (0.42 + i * 0.16), s * (0.24 + i * 0.09), 0, 0, TAU); g.lineWidth = 1.2 * k; g.strokeStyle = A('#e8f6ff', 0.5 - i * 0.12); g.stroke(); } },
    swash(g, s, r, c, k, cx, cy) { tk.inkPath(g, [[cx - s * 0.7, cy + s * 0.4], [cx - s * 0.1, cy + s * 0.15], [cx + s * 0.7, cy + s * 0.35]], { w: 7 * k, color: '#8ff0e8', alpha: 0.5, taper: 0.3, seed: 2 }); },
    glints(g, s, r, c, k, cx, cy) { for (let i = 0; i < 4; i++) tk.sparkle(g, cx + (r() - 0.5) * s * 1.3, cy + (r() - 0.5) * s * 1.3, (2.5 + r() * 3) * k, { color: '#d8ffe6', glow: 0, alpha: 0.9 }); },
    embers(g, s, r, c, k, cx, cy) { for (let i = 0; i < 8; i++) softDisc(g, cx + (r() - 0.5) * s * 1.4, cy + (r() - 0.4) * s * 1.4, (0.9 + r() * 1.6) * k, i % 2 ? '#ffd27a' : '#ff9a2e', 0.85); },
    void() {},
  };

  function paintedSprite(g, w, h, s, tile, done, v) {
    const spec = washOf(tile), cx = w / 2, cy = h / 2, k = s / BASE, r = R('wash', tile, v);
    const spiky = tile === 'boss';
    // the colour is put on a hair off the pencil line, like a child colouring in: it spills over on one side and leaves a sliver of paper on the other
    const ro = R('spill', v), ox = (ro() - 0.5) * s * 0.06, oy = (ro() - 0.5) * s * 0.06;
    const ring = hexRing(cx + ox, cy + oy, s * 0.995, R('washring', v), 0.03, spiky), lineRing = hexRing(cx, cy, s * 0.98, R('ring', v), 0.022, spiky);
    const box = [0, 0, w, h];
    const hue = spec.c;
    const paleK = done ? 0.62 : (tile === 'boss' ? 0.02 : 0.2);
    const base = mixc(hue, '#f3e6c8', paleK), deep = tk.shade(hue, 0.3), wet = mixc(hue, pal.ink, done ? 0.15 : 0.3), light = mixc(hue, '#fff6dc', 0.55);
    // 1. the flat wash
    fillRing(g, ring, A(base, done ? 0.82 : 0.95));
    g.save(); clipRing(g, ring);
    // 2. a light bloom where the brush lifted the pigment, 3. the wet edge where it pooled
    const gr = g.createRadialGradient(cx - s * 0.12, cy - s * 0.18, 0, cx - s * 0.12, cy - s * 0.18, s * 0.95);
    gr.addColorStop(0, A(light, tile === 'boss' ? 0.16 : 0.6)); gr.addColorStop(1, A(light, 0));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.lineJoin = 'round';
    [[0.34, 0.09], [0.22, 0.13], [0.11, 0.2]].forEach((p) => { g.beginPath(); traceRing(g, ring); g.lineWidth = p[0] * s; g.strokeStyle = A(wet, p[1] * (done ? 0.6 : 1)); g.stroke(); });
    // 4. cloudy blotches and granulation
    if (!done) for (let i = 0; i < 6; i++) softDisc(g, cx + (r() - 0.5) * s * 1.3, cy + (r() - 0.5) * s * 1.5, s * (0.16 + r() * 0.22), r() < 0.5 ? deep : light, 0.07 + r() * 0.07);
    for (let i = 0; i < 26; i++) { g.fillStyle = r() < 0.6 ? A(deep, 0.12 + r() * 0.1) : A('#ffffff', 0.16 + r() * 0.12); g.fillRect(cx + (r() - 0.5) * s * 1.6, cy + (r() - 0.5) * s * 1.8, (0.6 + r() * 1.1) * k, (0.6 + r() * 1.1) * k); }
    // 5. tile decoration behind the stamp
    if (!done && DECOR[spec.glyph]) DECOR[spec.glyph](g, s, r, { c: hue, d: deep }, k, cx, cy);
    // 6. the hard cel shadow with screen-tone dots, lower left
    g.save(); clipCrescent(g, ring, box, LX * s * 0.13, LY * s * 0.13);
    g.fillStyle = A(tk.shade(hue, 0.42), done ? 0.32 : 0.5); g.fillRect(0, 0, w, h);
    if (!done) tk.halftone(g, 0, 0, w, h, { d: Math.max(3, 4.6 * k), r: 1.1 * k, color: tk.deep(hue, 0.4), alpha: 0.42, force: true });
    g.restore();
    // 7. the stamp
    if (tile !== 'empty') { g.beginPath(); g.ellipse(cx, cy + s * 0.02, s * 0.5, s * 0.5, 0, 0, TAU); g.fillStyle = A('#fff6dc', done ? 0.3 : 0.4); g.fill(); }
    g.restore();
    if (tile !== 'empty') stamp(g, tile, cx, cy + s * 0.02, s * 1.0, done);
    // 8. rim light on the lit edge, ink outline
    g.save(); clipRing(g, lineRing); clipCrescent(g, lineRing, box, -LX * s * 0.05, -LY * s * 0.05);
    g.fillStyle = A('#fff8f0', 0.5); g.fillRect(0, 0, w, h); g.restore();
    tk.inkPath(g, lineRing, { closed: true, w: (spiky ? 2.9 : 2.1) * k, color: pal.ink, align: 0.15, wobble: 0.16, weightVar: 0.55, seed: v * 7 + 1, tension: TENS, alpha: done ? 0.7 : 0.92 });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // void (Unwritten Void): a hole torn in the page
  // ---------------------------------------------------------------------------------------------------------------
  function voidSprite(g, w, h, s, v) {
    const cx = w / 2, cy = h / 2, k = s / BASE, r = R('void', v);
    const ring = hexRing(cx, cy, s * 1.02, R('ring', v), 0.05);
    fillRing(g, ring, '#150f2a');
    g.save(); clipRing(g, ring);
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, s);
    gr.addColorStop(0, '#1a1236'); gr.addColorStop(1, '#0a0716'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5; i++) tk.inkPath(g, [[cx + (r() - 0.5) * s, cy + (r() - 0.5) * s], [cx + (r() - 0.5) * s * 1.4, cy + (r() - 0.5) * s * 1.4], [cx + (r() - 0.5) * s * 1.6, cy + (r() - 0.5) * s * 1.6]], { w: (3 + r() * 5) * k, color: '#3b2a7a', alpha: 0.4, taper: 0.4, seed: i });
    tk.halftone(g, 0, 0, w, h, { d: Math.max(3, 5 * k), r: 1 * k, color: '#8f5fe8', alpha: 0.22, force: true });
    for (let i = 0; i < 9; i++) softDisc(g, cx + (r() - 0.5) * s * 1.5, cy + (r() - 0.5) * s * 1.7, (0.8 + r() * 1.2) * k, '#f3e6c8', 0.5);
    g.restore();
    tk.inkPath(g, ring, { closed: true, w: 2.2 * k, color: '#3b2a7a', align: -0.2, wobble: 0.2, seed: v, tension: TENS, alpha: 0.9 });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // overlays: path, hover, target (translucent, drawn over the hex that is already there)
  // ---------------------------------------------------------------------------------------------------------------
  function pathSprite(g, w, h, s, v) {
    const cx = w / 2, cy = h / 2, k = s / BASE, ring = hexRing(cx, cy, s * 0.97, R('ring', v), 0.02);
    fillRing(g, ring, A('#ffd889', 0.42));
    g.save(); clipRing(g, ring); g.beginPath(); traceRing(g, ring); g.lineWidth = 0.3 * s; g.strokeStyle = A('#ffb640', 0.22); g.stroke(); g.restore();
    g.beginPath(); traceRing(g, ring); g.setLineDash([3.4 * k, 4.6 * k]); g.lineWidth = 1.7 * k; g.lineCap = 'round'; g.strokeStyle = A('#7a4a12', 0.75); g.stroke(); g.setLineDash([]);
  }
  function hoverSprite(g, w, h, s, v) {
    const cx = w / 2, cy = h / 2, k = s / BASE, ring = hexRing(cx, cy, s * 0.985, R('ring', v), 0.02);
    fillRing(g, ring, A('#fff4c8', 0.3));
    g.beginPath(); traceRing(g, ring); g.lineJoin = 'round'; g.lineWidth = 6 * k; g.strokeStyle = A(pal.gold, 0.5); g.stroke();
    tk.inkPath(g, ring, { closed: true, w: 2.6 * k, color: pal.ink, align: 0, wobble: 0.14, seed: 3, tension: TENS });
    g.beginPath(); traceRing(g, ring); g.lineWidth = 1 * k; g.strokeStyle = A('#fff8f0', 0.9); g.stroke();
  }
  function targetSprite(g, w, h, s, v) {
    const cx = w / 2, cy = h / 2, k = s / BASE, ring = hexRing(cx, cy, s * 0.985, R('ring', v), 0.02);
    fillRing(g, ring, A(pal.sakura, 0.2));
    g.beginPath(); traceRing(g, ring); g.lineWidth = 6 * k; g.lineJoin = 'round'; g.strokeStyle = A(pal.sakura, 0.5); g.stroke();
    tk.inkPath(g, ring, { closed: true, w: 2.8 * k, color: pal.ink, align: 0, wobble: 0.14, seed: 5, tension: TENS });
    for (let i = 0; i < 4; i++) { const a = i * PI / 2; tk.inkPath(g, [[cx + Math.cos(a) * s * 0.52, cy + Math.sin(a) * s * 0.52], [cx + Math.cos(a) * s * 0.7, cy + Math.sin(a) * s * 0.7]], { w: 2.4 * k, color: pal.vermilion, taper: 0.2 }); }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // silhouettes of landmarks in the fog: our own glyph drawn as dim ghost ink (never the hanko disc), so a landmark is recognisable by shape
  // whatever the icon artist does
  // ---------------------------------------------------------------------------------------------------------------
  function silSprite(g, w, h, s, tile) {
    const cx = w / 2, cy = h / 2, boss = tile === 'boss', u = s * (boss ? 1.5 : 1.16) / 100, col = boss ? '#2a1a4a' : '#5a4636';
    if (ART.has('tile', tile)) {                                       // the real stamp, washed out to a ghost so it still matches the painted one
      stamp(g, tile, cx, cy, s * (boss ? 1.3 : 1.02), false);
      g.globalCompositeOperation = 'source-atop'; g.fillStyle = boss ? A('#2a1a4a', 0.66) : A('#8a7660', 0.7); g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over';
      return;
    }
    const glyph = GLYPH[tile];
    softDisc(g, cx, cy, s * (boss ? 0.62 : 0.5), col, boss ? 0.16 : 0.09);
    if (!glyph) return;
    const P = (pts) => pts.map((q) => [cx + q[0] * u, cy + q[1] * u]);
    const S = (pts, wd) => tk.inkPath(g, P(pts), { w: wd * u, color: col, taper: 0.25, wobble: 0.1, seed: 4 });
    const F = (pts) => { g.beginPath(); tk.trace(g, P(pts), 0, 0, 0.5); g.fillStyle = col; g.fill(); };
    glyph(S, F);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // ART.map.hex
  // ---------------------------------------------------------------------------------------------------------------
  const KIND_OK = {};
  L.mapKinds.forEach((kd) => { KIND_OK[kd] = true; });
  function box(s, tile) { const pad = s * (tile === 'boss' ? 0.24 : 0.12); return { w: SQ3 * s + pad * 2, h: 2 * s + pad * 2 }; }
  function getSprite(kindKey, tile, done, v, k, drawFn) {
    const key = `map|${kindKey}|${tile}|${done ? 1 : 0}|${v}|${k}`;
    let kk = k;
    if (bakeBudget <= 0 && !ART.sprite.has(key)) {
      for (const d of [1, -1, 2, -2, 3, -3]) {
        const k2 = k + d, key2 = `map|${kindKey}|${tile}|${done ? 1 : 0}|${v}|${k2}`;
        if (k2 >= KMIN && k2 <= KMAX && ART.sprite.has(key2)) { kk = k2; break; }
      }
    }
    const kkey = `map|${kindKey}|${tile}|${done ? 1 : 0}|${v}|${kk}`;
    if (!ART.sprite.has(kkey)) { bakeBudget--; bakedTotal++; }
    const s = rungSize(kk), b = box(s, tile);
    const spr = ART.sprite(kkey, b.w, b.h, (g, w, h) => drawFn(g, w, h, s));
    return { spr, w: b.w, h: b.h, s };
  }
  function hex(ctx, kind, x, y, size, opts) {
    opts = opts || {};
    size = pos(size, BASE); x = num(x, 0); y = num(y, 0);
    newFrame(opts.t);
    if (!KIND_OK[kind]) kind = 'fog';
    const k = rungOf(size), v = variant(opts.seed), done = !!opts.done;
    let tile = typeof opts.tile === 'string' ? opts.tile : 'empty';
    if (kind === 'ground') { kind = 'painted'; tile = 'empty'; }
    let sp;
    if (kind === 'painted') { if (tile === 'block') { kind = 'block'; } else if (!WASH[tile]) tile = 'empty'; }
    if (kind === 'fog') sp = getSprite('fog', '', false, v, k, (g, w, h, s) => fogSprite(g, w, h, s, v, false));
    else if (kind === 'known') {
      if (!WASH[tile] || tile === 'empty' || tile === 'block') sp = getSprite('fog', '', false, v, k, (g, w, h, s) => fogSprite(g, w, h, s, v, false));
      else sp = getSprite('known', tile, false, v, k, (g, w, h, s) => { fogSprite(g, w, h, s, v, false, true); const sl = ART.sprite(`map|sil|${tile}|${rungOf(s)}`, w, h, (g2) => silSprite(g2, w, h, s, tile)); ART.blit(g, sl, 0, 0, w, h, tile === 'boss' ? 0.85 : 0.62); });
    } else if (kind === 'edge') sp = getSprite('edge', '', false, v, k, (g, w, h, s) => fogSprite(g, w, h, s, v, true));
    else if (kind === 'block') sp = getSprite('block', '', false, v, k, (g, w, h, s) => voidSprite(g, w, h, s, v));
    else if (kind === 'path') sp = getSprite('path', '', false, v & 1, k, (g, w, h, s) => pathSprite(g, w, h, s, v & 1));
    else if (kind === 'hover') sp = getSprite('hover', '', false, 0, k, (g, w, h, s) => hoverSprite(g, w, h, s, 0));
    else if (kind === 'target') sp = getSprite('target', '', false, 0, k, (g, w, h, s) => targetSprite(g, w, h, s, 0));
    else sp = getSprite('painted', tile, done, v, k, (g, w, h, s) => paintedSprite(g, w, h, s, tile, done, v));
    if (opts.bakeOnly) return;
    const f = size / sp.s, tt = num(opts.t, 0), mo = tk.motion();
    const pulse = 0.5 + 0.5 * Math.sin(tt * 3.1);
    if (kind === 'hover') { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * (0.78 + 0.22 * pulse * mo + 0.22 * (1 - mo)); ART.blit(ctx, sp.spr, x - sp.w * f / 2, y - sp.h * f / 2, sp.w * f, sp.h * f); ctx.globalAlpha = ga; }
    else ART.blit(ctx, sp.spr, x - sp.w * f / 2, y - sp.h * f / 2, sp.w * f, sp.h * f);
    if (kind === 'edge') liveEdge(ctx, x, y, size, tt, v, mo);
    else if (kind === 'target') liveTarget(ctx, x, y, size, tt, mo);
    else if (kind === 'painted' && !done) liveTile(ctx, tile, x, y, size, tt, v, mo);
  }
  // live touches over the cached sprites: cheap and never baked
  function liveEdge(ctx, x, y, size, t, v, mo) {
    const k = size / BASE, pulse = 0.5 + 0.5 * Math.sin(t * 2.6 + v);
    ctx.save();
    ctx.beginPath(); hexPath(ctx, x, y, size * 0.9);
    ctx.setLineDash([size * 0.15, size * 0.12]); ctx.lineDashOffset = -t * size * 0.32 * mo; ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.4, 2.6 * k); ctx.strokeStyle = A('#f0a52a', 0.5 + 0.4 * pulse); ctx.stroke();
    ctx.lineWidth = Math.max(0.8, 1.1 * k); ctx.strokeStyle = A('#fff2b8', 0.8); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    tk.glow(ctx, x, y, size * 0.85, '#ffd070', 0.06 + 0.06 * pulse * mo);
  }
  function liveTarget(ctx, x, y, size, t, mo) {
    const k = size / BASE;
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.7 * mo);
    ctx.beginPath(); ctx.arc(0, 0, size * 0.74, 0, TAU); ctx.setLineDash([size * 0.14, size * 0.1]); ctx.lineWidth = Math.max(1, 1.8 * k); ctx.strokeStyle = A(pal.vermilion, 0.85); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    const a = t * 1.6 * mo; tk.sparkle(ctx, x + Math.cos(a) * size * 0.74, y + Math.sin(a) * size * 0.74, 4.2 * k, { color: pal.gold2, glow: 0.4 });
  }
  // a little life on landmarks: chest glint, camp and forge glow, well ripple, boss and elite pulse
  function liveTile(ctx, tile, x, y, size, t, v, mo) {
    const k = size / BASE, ph = t + v * 0.9;
    if (tile === 'camp') tk.glow(ctx, x, y + size * 0.05, size * (0.75 + 0.05 * Math.sin(ph * 7.3)), '#ffb060', 0.2 + 0.1 * Math.sin(ph * 5.1) * mo);
    else if (tile === 'forge') tk.glow(ctx, x, y + size * 0.05, size * 0.7, '#ff7a30', 0.16 + 0.1 * (0.5 + 0.5 * Math.sin(ph * 2.2)) * mo);
    else if (tile === 'chest') { const a = (ph * 0.55) % 1; if (a < 0.35) tk.sparkle(ctx, x + size * (0.35 - a * 1.2), y - size * (0.5 - a * 0.9), (2 + 5 * Math.sin(a / 0.35 * PI)) * k, { color: '#ffffff', alpha: Math.sin(a / 0.35 * PI), glow: 0.5 }); }
    else if (tile === 'well') { const a = (ph * 0.45) % 1; ctx.beginPath(); ctx.ellipse(x, y + size * 0.05, size * (0.3 + 0.45 * a), size * (0.18 + 0.26 * a), 0, 0, TAU); ctx.lineWidth = 1.6 * k; ctx.strokeStyle = A('#e8f6ff', 0.6 * (1 - a) * (mo > 0.5 ? 1 : 0.5)); ctx.stroke(); }
    else if (tile === 'boss') tk.glow(ctx, x, y, size * 0.95, '#8f5fe8', 0.14 + 0.12 * (0.5 + 0.5 * Math.sin(ph * 1.7)) * mo);
    else if (tile === 'elite') { const a = ph * 0.9; tk.sparkle(ctx, x + Math.cos(a) * size * 0.66, y + Math.sin(a) * size * 0.66, 3.4 * k, { color: pal.gold2, alpha: 0.85, glow: 0.4 }); }
  }

  const M = ART.map;

  // ---------------------------------------------------------------------------------------------------------------
  // PAPER: the parchment ground. World space, so it scrolls and zooms with the map: a seamless fibre tile, big stains placed by a hash of the
  // world cell (so nothing repeats), and sea-monster doodles in the margins and, faintly, under the fog
  // ---------------------------------------------------------------------------------------------------------------
  const PAPER_BASE = '#f0e0b8', DOODLE_INK = '#5c4530';
  // The fibre tile is TILE world px and repeats. A CHUNK is 2 x 2 of it plus up to two stains kept clear of the chunk border, so chunks of any
  // variant join with no seam, and a page is ~6 opaque blits instead of a pattern fill plus a dozen rotated alpha blits.
  const TILE = 150, CHUNK = TILE * 2, NVAR = 5, CELL = 540;     // CELL: the grid the margin doodles are placed on
  function wrapAt(x, y, rad, fn) {
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const px = x + i * TILE, py = y + j * TILE;
      if (px > -rad && px < TILE + rad && py > -rad && py < TILE + rad) fn(px, py);
    }
  }
  function paperTile(g) {
    const r = R('paper', 'tile');
    g.lineCap = 'round';
    for (let i = 0; i < 200; i++) {                                    // fibres
      const x = r() * TILE, y = r() * TILE, a = r() * TAU, l = 4 + r() * 12, dark = r() < 0.5, bend = (r() - 0.5) * 6;
      wrapAt(x, y, l + 3, (px, py) => {
        g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + Math.cos(a) * l * 0.5 - Math.sin(a) * bend, py + Math.sin(a) * l * 0.5 + Math.cos(a) * bend, px + Math.cos(a) * l, py + Math.sin(a) * l);
        g.lineWidth = 0.4 + r() * 0.6; g.strokeStyle = dark ? A('#7a5a34', 0.1 + r() * 0.12) : A('#ffffff', 0.2 + r() * 0.22); g.stroke();
      });
    }
    for (let i = 0; i < 150; i++) { const x = r() * TILE, y = r() * TILE, sz = 0.5 + r() * 1.2; g.fillStyle = r() < 0.55 ? A('#5a3c1c', 0.06 + r() * 0.14) : A('#ffffff', 0.12 + r() * 0.18); wrapAt(x, y, 2, (px, py) => g.fillRect(px, py, sz, sz)); }
  }
  // stains: a pool of soft blotches
  const STAIN_N = 6, STAIN_S = 340;
  function stainSprite(g, i) {
    const r = R('stain', i), c = STAIN_S / 2;
    if (i === 0 || i === 1) {                                          // a tea or water ring: pale inside, a darker rim
      const rad = 96 + r() * 40, ring = blobPts(c, c, rad, rad * (0.8 + r() * 0.2), r, 0.12, 12);
      g.beginPath(); tk.trace(g, ring); g.fillStyle = A('#b58a4a', i === 0 ? 0.07 : 0.1); g.fill();
      g.beginPath(); tk.trace(g, ring); g.lineWidth = 3 + r() * 2; g.strokeStyle = A('#8a5a2a', 0.12 + r() * 0.06); g.stroke();
      g.beginPath(); tk.trace(g, tk.xf(ring, { s: 0.86, cx: c, cy: c })); g.lineWidth = 1.2; g.strokeStyle = A('#8a5a2a', 0.08); g.stroke();
    } else if (i === 2) {                                              // foxing: rust freckles
      for (let n = 0; n < 34; n++) { const a = r() * TAU, d = Math.sqrt(r()) * 120; softDisc(g, c + Math.cos(a) * d, c + Math.sin(a) * d, 1 + r() * 4, '#9a5a24', 0.06 + r() * 0.1); }
    } else if (i === 3) {                                              // sun-bleached patch
      const gr = g.createRadialGradient(c, c, 0, c, c, 150); gr.addColorStop(0, A('#fff8e0', 0.3)); gr.addColorStop(1, A('#fff8e0', 0)); g.fillStyle = gr; g.fillRect(0, 0, STAIN_S, STAIN_S);
    } else if (i === 4) {                                              // a soft fold line
      g.lineCap = 'round';
      tk.inkPath(g, [[20, c + 30], [c, c - 10], [STAIN_S - 20, c + 20]], { w: 4, color: '#6a4a24', alpha: 0.07, taper: 0.4, wobble: 0.3 });
      tk.inkPath(g, [[20, c + 34], [c, c - 6], [STAIN_S - 20, c + 24]], { w: 3, color: '#ffffff', alpha: 0.2, taper: 0.4, wobble: 0.3 });
    } else {                                                           // a wash of tea with a soft edge
      const gr = g.createRadialGradient(c, c, 10, c, c, 140); gr.addColorStop(0, A('#a87a3a', 0.09)); gr.addColorStop(0.75, A('#a87a3a', 0.05)); gr.addColorStop(1, A('#a87a3a', 0)); g.fillStyle = gr; g.fillRect(0, 0, STAIN_S, STAIN_S);
    }
  }

  function chunkSprite(g, v) {
    const tile = ART.sprite('map|paper|tile', TILE, TILE, paperTile);
    ART.blit(g, tile, 0, 0, TILE, TILE); ART.blit(g, tile, TILE, 0, TILE, TILE); ART.blit(g, tile, 0, TILE, TILE, TILE); ART.blit(g, tile, TILE, TILE, TILE, TILE);
    const r = R('chunk', v);
    for (let i = 0; i < 4; i++) {                                      // soft mottling, fully inside the chunk so it never meets a seam
      const rad = 40 + r() * 70, x = rad + r() * (CHUNK - 2 * rad), y = rad + r() * (CHUNK - 2 * rad), dark = r() < 0.5, c = dark ? '#8a6a3a' : '#fff8e4';
      const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, A(c, dark ? 0.08 : 0.13)); gr.addColorStop(1, A(c, 0)); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    const idx = [0, 2, 5, 4, -1][v % 5];
    if (idx >= 0) {
      const sc = 0.5 + r() * 0.3, half = STAIN_S * sc / 2, rot = r() * TAU;
      const sx = half + r() * (CHUNK - 2 * half), sy = half + r() * (CHUNK - 2 * half), al = 0.6 + r() * 0.4;
      const spr = ART.sprite('map|paper|stain' + idx, STAIN_S, STAIN_S, (g2) => stainSprite(g2, idx));
      g.save(); g.translate(sx, sy); g.rotate(rot); ART.blit(g, spr, -half, -half, half * 2, half * 2, al); g.restore();
    }
  }

  // ---- doodles (drawn once as opaque ink, blitted at low alpha)
  const pen = (g, pts, w, o) => tk.inkPath(g, pts, Object.assign({ w, color: DOODLE_INK, taper: 0.28, wobble: 0.12 }, o));
  const DOODLES = {
    compass: { w: 236, h: 236, draw(g) {
      const c = 118, R0 = 64;
      [R0, R0 - 8].forEach((rr, i) => pen(g, tk.ellipsePts(c, c, rr, rr, 22), 2 - i * 0.6, { closed: true, taper: 0 }));
      for (let i = 0; i < 32; i++) { const a = i * TAU / 32; pen(g, [[c + Math.cos(a) * (R0 + 1), c + Math.sin(a) * (R0 + 1)], [c + Math.cos(a) * (R0 + (i % 4 ? 5 : 10)), c + Math.sin(a) * (R0 + (i % 4 ? 5 : 10))]], 1.4, { taper: 0.1 }); }
      for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8 - PI / 2, len = i % 2 ? 40 : 84, wd = i % 2 ? 7 : 10;
        const tip = [c + Math.cos(a) * len, c + Math.sin(a) * len], l = [c + Math.cos(a - 1.5) * wd, c + Math.sin(a - 1.5) * wd], rr = [c + Math.cos(a + 1.5) * wd, c + Math.sin(a + 1.5) * wd];
        g.beginPath(); g.moveTo(c, c); g.lineTo(l[0], l[1]); g.lineTo(tip[0], tip[1]); g.lineTo(rr[0], rr[1]); g.closePath();
        g.fillStyle = i % 4 === 0 ? DOODLE_INK : A(DOODLE_INK, 0.38); g.fill();
        pen(g, [l, tip, rr], 1.5, { taper: 0.05 });
      }
      softDisc(g, c, c, 5, DOODLE_INK, 1);
      g.font = 'italic 700 24px Georgia,serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = DOODLE_INK; g.fillText('N', c, c - 98);
    } },
    kraken: { w: 300, h: 230, draw(g) {
      const cx = 150;
      g.beginPath(); tk.trace(g, [[cx - 62, 96], [cx - 66, 50], [cx - 30, 14], [cx + 18, 10], [cx + 56, 36], [cx + 66, 84], [cx + 40, 108], [cx - 40, 108]]); g.fillStyle = A(DOODLE_INK, 0.13); g.fill();
      pen(g, [[cx - 62, 100], [cx - 68, 50], [cx - 30, 14], [cx + 18, 10], [cx + 56, 36], [cx + 68, 88]], 3.4, { taper: 0.05 });
      [-1, 1].forEach((sd) => { const ex = cx + sd * 26; pen(g, tk.ellipsePts(ex, 62, 12, 15, 10), 2.2, { closed: true, taper: 0 }); softDisc(g, ex + sd * 2, 65, 6, DOODLE_INK, 1); softDisc(g, ex + sd * 5, 60, 2.2, '#ffffff', 1); });
      pen(g, [[cx - 24, 34], [cx - 6, 24], [cx + 12, 26]], 2, {});
      for (let i = 0; i < 7; i++) {
        const sx = cx - 54 + i * 18, dir = i % 2 ? 1 : -1, len = 96 + (i % 3) * 16;
        const sp = [[sx, 104], [sx + dir * 14, 104 + len * 0.3], [sx - dir * 8, 104 + len * 0.6], [sx + dir * 20, 104 + len * 0.82], [sx + dir * 30, 104 + len * 0.7], [sx + dir * 22, 104 + len * 0.6]];
        pen(g, sp, 7.5, { taper: 0.5, wobble: 0.1 });
        for (let d = 1; d < 4; d++) { const q = sp[d]; softDisc(g, q[0] - dir * 3, q[1] + 2, 1.7, DOODLE_INK, 0.8); }
      }
      for (let i = 0; i < 3; i++) pen(g, [[cx - 120 + i * 30, 200 + i * 6], [cx - 108 + i * 30, 192 + i * 6], [cx - 96 + i * 30, 200 + i * 6]], 2, {});
    } },
    serpent: { w: 360, h: 150, draw(g) {
      for (let i = 0; i < 3; i++) {
        const x0 = 70 + i * 96;
        pen(g, [[x0, 112], [x0 + 12, 70], [x0 + 46, 56], [x0 + 74, 82], [x0 + 82, 112]], 5, { taper: 0.1, wobble: 0.08 });
        for (let d = 0; d < 5; d++) pen(g, [[x0 + 16 + d * 11, 64 + Math.abs(d - 2) * 5], [x0 + 22 + d * 11, 76 + Math.abs(d - 2) * 4]], 1.5, { taper: 0.4 });
      }
      pen(g, [[20, 112], [26, 78], [44, 50], [40, 30]], 6, { taper: 0.1 });
      g.beginPath(); tk.trace(g, [[26, 26], [44, 12], [72, 18], [66, 36], [44, 40]]); g.fillStyle = A(DOODLE_INK, 0.13); g.fill();
      pen(g, [[26, 26], [44, 12], [72, 18], [66, 36], [44, 40], [26, 30]], 3, { taper: 0.05 });
      softDisc(g, 52, 24, 3.4, DOODLE_INK, 1); pen(g, [[40, 12], [30, 0], [36, 12]], 2, {}); pen(g, [[72, 24], [88, 26], [72, 30]], 1.8, {});
      for (let i = 0; i < 5; i++) pen(g, [[10 + i * 70, 128 + (i % 2) * 6], [30 + i * 70, 118 + (i % 2) * 6], [50 + i * 70, 128 + (i % 2) * 6], [70 + i * 70, 118 + (i % 2) * 6]], 2, { taper: 0.4 });
    } },
    boat: { w: 150, h: 140, draw(g) {
      pen(g, [[20, 92], [40, 108], [110, 108], [132, 88]], 4, { taper: 0.05 });
      pen(g, [[20, 92], [132, 88]], 3, { taper: 0.05 });
      pen(g, [[74, 90], [74, 14]], 3, { taper: 0.05 });
      g.beginPath(); g.moveTo(78, 18); g.lineTo(122, 78); g.lineTo(78, 82); g.closePath(); g.fillStyle = A(DOODLE_INK, 0.14); g.fill();
      pen(g, [[78, 18], [122, 78], [78, 82]], 2.6, { taper: 0.05, closed: false });
      for (let i = 0; i < 3; i++) pen(g, [[78, 34 + i * 16], [104 - i * 4, 48 + i * 14]], 1.2, { taper: 0.3 });
      g.beginPath(); g.moveTo(70, 20); g.lineTo(46, 34); g.lineTo(70, 44); g.closePath(); g.fillStyle = A(DOODLE_INK, 0.24); g.fill();
      for (let i = 0; i < 3; i++) pen(g, [[8 + i * 46, 124], [24 + i * 46, 116], [40 + i * 46, 124], [56 + i * 46, 116]], 2, { taper: 0.4 });
    } },
    waves: { w: 170, h: 44, draw(g) {
      for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) { const x = 6 + i * 40 + (row % 2) * 18, y = 12 + row * 12; pen(g, [[x, y + 4], [x + 8, y - 6], [x + 18, y - 4], [x + 24, y + 4], [x + 32, y - 2]], 2, { taper: 0.4 }); }
    } },
    koi: { w: 170, h: 90, draw(g) {
      g.beginPath(); tk.trace(g, [[26, 44], [56, 22], [104, 26], [128, 44], [104, 62], [56, 66]]); g.fillStyle = A(DOODLE_INK, 0.12); g.fill();
      pen(g, [[26, 44], [56, 22], [104, 26], [128, 44]], 3, { taper: 0.05 }); pen(g, [[26, 44], [56, 66], [104, 62], [128, 44]], 3, { taper: 0.05 });
      pen(g, [[128, 44], [154, 24], [162, 40], [150, 46], [164, 56], [154, 66], [128, 44]], 2.6, { taper: 0.05 });
      softDisc(g, 44, 40, 3, DOODLE_INK, 1); pen(g, [[60, 24], [66, 8], [86, 20]], 2, {}); pen(g, [[70, 64], [80, 80], [92, 62]], 2, {});
      for (let i = 0; i < 9; i++) pen(g, [[62 + (i % 3) * 16, 36 + Math.floor(i / 3) * 10], [68 + (i % 3) * 16, 42 + Math.floor(i / 3) * 10], [74 + (i % 3) * 16, 36 + Math.floor(i / 3) * 10]], 1.2, { taper: 0.3 });
    } },
    stars: { w: 190, h: 130, draw(g) {
      const pts = [[20, 90], [60, 60], [100, 74], [140, 34], [172, 50], [120, 108]];
      pen(g, pts, 1.6, { taper: 0.05, wobble: 0.05 });
      pts.forEach((q, i) => tk.sparkle(g, q[0], q[1], 6 + (i % 3) * 3, { color: DOODLE_INK, glow: 0, thin: 0.22 }));
    } },
    tuft: { w: 80, h: 60, draw(g) {
      for (let j = 0; j < 7; j++) pen(g, [[16 + j * 8, 52], [14 + j * 8 + (j - 3) * 2, 34], [12 + j * 8 + (j - 3) * 5, 14 + Math.abs(j - 3) * 4]], 2, { taper: 0.5, wobble: 0.06 });
    } },
  };
  const DOODLE_MARGIN = ['waves', 'koi', 'stars', 'tuft', 'waves', 'boat'];
  function doodleSprite(id) { const d = DOODLES[id]; return { spr: ART.sprite('map|doodle|' + id, d.w, d.h, (g) => d.draw(g)), w: d.w, h: d.h }; }

  function worldBox(o) {
    const em = (DATA.ECONOMY && DATA.ECONOMY.map) || { cols: 21, rows: 13, hexSize: 46 }, s = em.hexSize, w = SQ3 * s;
    return o && o.world ? o.world : { x0: -w / 2, y0: -s, x1: w * em.cols, y1: 1.5 * s * (em.rows - 1) + s };
  }
  // fixed doodles, placed relative to the world box: {id, fx, fy (0..1 across the box), dx, dy (px), sc, rot, a}
  const PLACED = [
    { id: 'compass', fx: 0.15, fy: 0.9, sc: 1.0, a: 0.34 }, { id: 'kraken', fx: 0.66, fy: 0.12, sc: 1.05, a: 0.3 },
    { id: 'serpent', fx: 0.5, fy: 0.9, sc: 1.0, a: 0.3 }, { id: 'boat', fx: 0.3, fy: 0.07, sc: 0.9, a: 0.32, rot: -0.08 },
    { id: 'koi', fx: 0.88, fy: 0.88, sc: 1.0, a: 0.3, rot: 0.12 }, { id: 'stars', fx: 0.84, fy: 0.5, sc: 1.1, a: 0.24 },
    { id: 'waves', fx: 0.42, fy: 0.5, sc: 1.1, a: 0.24 }, { id: 'waves', fx: 0.06, fy: 0.12, sc: 1.0, a: 0.26 },
    { id: 'tuft', fx: 0.24, fy: 0.72, sc: 1.2, a: 0.22 }, { id: 'waves', fx: 0.75, fy: 0.72, sc: 1.0, a: 0.24 },
  ];
  function drawDoodle(ctx, id, x, y, z, sc, rot, a) {
    const d = doodleSprite(id), k = z * sc;
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot);
    ART.blit(ctx, d.spr, -d.w * k / 2, -d.h * k / 2, d.w * k, d.h * k, a);
    ctx.restore();
  }

  // Paints the parchment over (0, 0, w, h). (camX, camY) is the WORLD point at the centre of the view, zoom scales world to screen (hex size 46 at zoom 1).
  function paper(ctx, w, h, camX, camY, zoom, opts) {
    opts = opts || {};
    w = pos(w, 1280); h = pos(h, 720); camX = num(camX, 0); camY = num(camY, 0);
    const z = clamp(pos(zoom, 1), 0.2, 6);
    bakeBudget = BAKES_PER_FRAME;
    const ox = w / 2 - camX * z, oy = h / 2 - camY * z;
    const wx0 = -ox / z, wy0 = -oy / z, wx1 = (w - ox) / z, wy1 = (h - oy) / z;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    ctx.fillStyle = PAPER_BASE; ctx.fillRect(0, 0, w, h);
    // the page chunks (fibre tile, mottling and stains baked together), each variant picked by a hash of its world cell
    const px0 = Math.floor(wx0 / CHUNK), px1 = Math.floor(wx1 / CHUNK), py0 = Math.floor(wy0 / CHUNK), py1 = Math.floor(wy1 / CHUNK), cz = CHUNK * z;
    for (let gx = px0; gx <= px1; gx++) for (let gy = py0; gy <= py1; gy++) {
      const v = U.hash(gx, gy, 77) % NVAR;
      const X0 = Math.floor(ox + gx * cz) - 1, Y0 = Math.floor(oy + gy * cz) - 1, X1 = Math.ceil(ox + (gx + 1) * cz) + 1, Y1 = Math.ceil(oy + (gy + 1) * cz) + 1;
      const spr = ART.sprite('map|paper|chunk' + v, CHUNK, CHUNK, (g) => chunkSprite(g, v));
      ART.blit(ctx, spr, X0, Y0, X1 - X0, Y1 - Y0);
    }
    const cx0 = Math.floor(wx0 / CELL) - 1, cx1 = Math.floor(wx1 / CELL), cy0 = Math.floor(wy0 / CELL) - 1, cy1 = Math.floor(wy1 / CELL);
    // doodles
    if (opts.doodles !== false) {
      const wb = worldBox(opts), bw = wb.x1 - wb.x0, bh = wb.y1 - wb.y0;
      PLACED.forEach((pl) => {
        const px = wb.x0 + pl.fx * bw + (pl.dx || 0), py = wb.y0 + pl.fy * bh + (pl.dy || 0), d = DOODLES[pl.id], hw = d.w * pl.sc / 2, hh = d.h * pl.sc / 2;
        if (px + hw < wx0 || px - hw > wx1 || py + hh < wy0 || py - hh > wy1) return;
        drawDoodle(ctx, pl.id, ox + px * z, oy + py * z, z, pl.sc, pl.rot || 0, pl.a);
      });
      // margin doodles: any cell wholly outside the world box gets one, chosen by hash
      for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
        const cxw = cx * CELL, cyw = cy * CELL;
        if (cxw + CELL > wb.x0 - 20 && cxw < wb.x1 + 20 && cyw + CELL > wb.y0 - 20 && cyw < wb.y1 + 20) continue;
        const r = R('dcell', cx, cy);
        if (r() < 0.25) continue;
        const id = DOODLE_MARGIN[Math.floor(r() * DOODLE_MARGIN.length)], px = cxw + (0.2 + r() * 0.6) * CELL, py = cyw + (0.2 + r() * 0.6) * CELL;
        drawDoodle(ctx, id, ox + px * z, oy + py * z, z, 0.9 + r() * 0.4, (r() - 0.5) * 0.3, 0.2 + r() * 0.08);
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // FRAME: the open book. Leather cover, page stack, gutter with sewing, gilt corners, ink-blot vignette. Drawn LAST: the window is transparent.
  // ---------------------------------------------------------------------------------------------------------------
  function frameMetrics(w, h) {
    const mx = Math.round(w * 0.0344), my = Math.round(h * 0.05), cb = Math.max(4, Math.round(Math.min(w, h) * 0.03));
    return { mx, my, cb, inner: { x: mx, y: my, w: w - 2 * mx, h: h - 2 * my } };
  }
  const GOLD = '#f5c96a';
  function cornerCap(g, k) {                                          // a gilt corner guard for the top-left corner, scaled by k
    g.save(); g.scale(k, k);
    const shape = [[0, 0, 1], [70, 0, 1], [56, 9], [36, 16], [22, 28], [14, 44], [9, 58], [0, 70, 1]];
    tk.celFill(g, shape, GOLD, { line: 2.2, depth: 6, rim: '#fff2c8', rimW: 1.6, hi: true, hiW: 2, seed: 9, tension: 0.6 });
    tk.inkPath(g, [[12, 12], [30, 10], [40, 20], [32, 30], [22, 26], [24, 18]], { w: 1.6, color: '#7a4a12', taper: 0.2, wobble: 0.05 });
    tk.inkPath(g, [[12, 12], [10, 30], [20, 40], [30, 34], [26, 24]], { w: 1.4, color: '#7a4a12', taper: 0.2, wobble: 0.05, alpha: 0.7 });
    tk.celCircle(g, 13, 13, 6, pal.vermilion, { line: 1.8, rim: '#ffd0c0', rimW: 1.2, depth: 3 });
    g.restore();
  }
  function frameSprite(g, w, h) {
    const fm = frameMetrics(w, h), mx = fm.mx, my = fm.my, cb = fm.cb, r = R('frame', w, h);
    // 1. leather
    const lg = g.createLinearGradient(0, 0, w, h); lg.addColorStop(0, '#48264a'); lg.addColorStop(0.5, '#2c1734'); lg.addColorStop(1, '#1b0e26');
    g.fillStyle = lg; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { const x = r() * w, y = r() * h, dark = r() < 0.6; g.fillStyle = dark ? A('#0d0616', 0.1 + r() * 0.14) : A('#8a5a8a', 0.05 + r() * 0.08); g.fillRect(x, y, 0.8 + r() * 2, 0.8 + r() * 2); }
    g.lineCap = 'round';
    for (let i = 0; i < 90; i++) { const x = r() * w, y = r() * h, a = r() * TAU, l = 6 + r() * 16; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (r() - 0.5) * 6, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.lineWidth = 0.6 + r() * 0.8; g.strokeStyle = A(r() < 0.5 ? '#0d0616' : '#9a6a9a', 0.12 + r() * 0.1); g.stroke(); }
    // blind-tooled gold border lines on the cover
    [[0.34, 0.6, 1.6], [0.66, 0.28, 1]].forEach((p) => { g.strokeStyle = A(GOLD, p[1]); g.lineWidth = p[2]; g.strokeRect(cb * p[0], cb * p[0], w - cb * p[0] * 2, h - cb * p[0] * 2); });
    g.strokeStyle = A('#ffffff', 0.12); g.lineWidth = 1; g.beginPath(); g.moveTo(1, h - 1); g.lineTo(1, 1); g.lineTo(w - 1, 1); g.stroke();
    g.strokeStyle = A('#000000', 0.4); g.beginPath(); g.moveTo(w - 1, 1); g.lineTo(w - 1, h - 1); g.lineTo(1, h - 1); g.stroke();
    // 2. the page block: stacked page edges on every side
    g.fillStyle = '#c9b184'; g.fillRect(cb, cb, w - 2 * cb, h - 2 * cb);
    g.save(); g.beginPath(); g.rect(cb, cb, w - 2 * cb, h - 2 * cb); g.clip();
    const sideN = Math.floor((mx - cb) / 2.2), tbN = Math.floor((my - cb) / 2.2);
    for (let i = 0; i < sideN; i++) {
      const dx = cb + i * 2.2, light = r() < 0.55, ins = r() * 5;
      [dx, w - dx - 1].forEach((x, sd) => { g.fillStyle = light ? A('#f6ead0', 0.9) : A('#b89a68', 0.7); g.fillRect(x, cb + ins + i * 0.6, 1.3, h - 2 * cb - 2 * ins - i * 1.2); });
    }
    for (let i = 0; i < tbN; i++) {
      const dy = cb + i * 2.2, light = r() < 0.55, ins = r() * 5;
      [dy, h - dy - 1].forEach((y) => { g.fillStyle = light ? A('#f6ead0', 0.9) : A('#b89a68', 0.7); g.fillRect(cb + ins + i * 0.6, y, w - 2 * cb - 2 * ins - i * 1.2, 1.3); });
    }
    const sh = g.createLinearGradient(cb, 0, mx, 0); sh.addColorStop(0, A('#1a0e22', 0.55)); sh.addColorStop(0.35, A('#1a0e22', 0)); g.fillStyle = sh; g.fillRect(cb, cb, mx - cb, h - 2 * cb);
    const sh2 = g.createLinearGradient(w - cb, 0, w - mx, 0); sh2.addColorStop(0, A('#1a0e22', 0.55)); sh2.addColorStop(0.35, A('#1a0e22', 0)); g.fillStyle = sh2; g.fillRect(w - mx, cb, mx - cb, h - 2 * cb);
    const sh3 = g.createLinearGradient(0, cb, 0, my); sh3.addColorStop(0, A('#1a0e22', 0.5)); sh3.addColorStop(0.4, A('#1a0e22', 0)); g.fillStyle = sh3; g.fillRect(cb, cb, w - 2 * cb, my - cb);
    const sh4 = g.createLinearGradient(0, h - cb, 0, h - my); sh4.addColorStop(0, A('#1a0e22', 0.5)); sh4.addColorStop(0.4, A('#1a0e22', 0)); g.fillStyle = sh4; g.fillRect(cb, h - my, w - 2 * cb, my - cb);
    g.restore();
    // 3. the window
    g.clearRect(mx, my, w - 2 * mx, h - 2 * my);
    const iw = w - 2 * mx, ih = h - 2 * my;
    g.save(); g.beginPath(); g.rect(mx, my, iw, ih); g.clip();
    // 4. paper curling into the stack: an inner shadow on every side
    [[mx, my, mx + 16, my, 'x'], [w - mx, my, w - mx - 16, my, 'x']].forEach((p) => { const gr = g.createLinearGradient(p[0], 0, p[2], 0); gr.addColorStop(0, A('#2a1a10', 0.32)); gr.addColorStop(1, A('#2a1a10', 0)); g.fillStyle = gr; g.fillRect(Math.min(p[0], p[2]), my, 16, ih); });
    [[my, my + 14], [h - my, h - my - 14]].forEach((p) => { const gr = g.createLinearGradient(0, p[0], 0, p[1]); gr.addColorStop(0, A('#2a1a10', 0.3)); gr.addColorStop(1, A('#2a1a10', 0)); g.fillStyle = gr; g.fillRect(mx, Math.min(p[0], p[1]), iw, 14); });
    // 5. the gutter
    const gx = w / 2;
    const gg = g.createLinearGradient(gx - 90, 0, gx + 90, 0);
    gg.addColorStop(0, A('#2a1a10', 0)); gg.addColorStop(0.36, A('#2a1a10', 0.05)); gg.addColorStop(0.47, A('#2a1a10', 0.2)); gg.addColorStop(0.5, A('#1a0e08', 0.42)); gg.addColorStop(0.53, A('#2a1a10', 0.2)); gg.addColorStop(0.64, A('#2a1a10', 0.05)); gg.addColorStop(1, A('#2a1a10', 0));
    g.fillStyle = gg; g.fillRect(gx - 90, my, 180, ih);
    [-1, 1].forEach((sd) => { const gr = g.createLinearGradient(gx + sd * 70, 0, gx + sd * 118, 0); gr.addColorStop(0, A('#fff8e4', 0)); gr.addColorStop(0.5, A('#fff8e4', 0.13)); gr.addColorStop(1, A('#fff8e4', 0)); g.fillStyle = gr; g.fillRect(Math.min(gx + sd * 70, gx + sd * 118), my, 48, ih); });
    g.beginPath(); g.moveTo(gx, my); g.lineTo(gx, my + ih); g.lineWidth = 1.4; g.strokeStyle = A('#1a0e08', 0.5); g.stroke();
    for (let y = my + 14, i = 0; y < my + ih - 20; y += 34, i++) {                                    // the binding thread
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(gx, y); g.lineTo(gx, y + 17); g.lineWidth = 2.6; g.strokeStyle = A('#3a2410', 0.35); g.stroke();
      g.beginPath(); g.moveTo(gx - 0.5, y); g.lineTo(gx - 0.5, y + 17); g.lineWidth = 1.8; g.strokeStyle = A('#e6c98a', 0.7); g.stroke();
      g.beginPath(); g.moveTo(gx - 7, y + 8.5); g.lineTo(gx + 7, y + 8.5); g.lineWidth = 2.2; g.strokeStyle = A('#3a2410', 0.3); g.stroke();
      g.beginPath(); g.moveTo(gx - 7, y + 8); g.lineTo(gx + 7, y + 8); g.lineWidth = 1.5; g.strokeStyle = A('#e6c98a', 0.6); g.stroke();
    }
    // 6. ink-blot vignette: soft shade plus organic blots that creep in from the corners
    const vg = g.createRadialGradient(gx, h / 2, Math.min(iw, ih) * 0.42, gx, h / 2, Math.hypot(iw, ih) * 0.56);
    vg.addColorStop(0, A('#1a1340', 0)); vg.addColorStop(1, A('#1a1340', 0.34)); g.fillStyle = vg; g.fillRect(mx, my, iw, ih);
    const rb = R('blots', w, h);
    for (let i = 0; i < 46; i++) {
      const edge = Math.floor(rb() * 4), u = rb(), rad = 10 + rb() * 22;
      let x = mx + u * iw, y = my + u * ih;
      if (edge === 0) y = my - rad * 0.2; else if (edge === 1) y = my + ih + rad * 0.2; else if (edge === 2) x = mx - rad * 0.2; else x = mx + iw + rad * 0.2;
      g.globalAlpha = 0.08 + rb() * 0.1; tk.inkBlot(g, x, y, rad, { color: '#1a1340', seed: i, jag: 0.4, n: 9 }); g.globalAlpha = 1;
    }
    [[mx, my, 1, 1], [mx + iw, my, -1, 1], [mx, my + ih, 1, -1], [mx + iw, my + ih, -1, -1]].forEach((c, i) => {
      g.globalAlpha = 0.3; tk.inkBlot(g, c[0], c[1], 42 + i * 3, { color: '#1a1340', seed: 20 + i, jag: 0.42, n: 12 }); g.globalAlpha = 0.2; tk.inkBlot(g, c[0] + c[2] * 34, c[1] + c[3] * 18, 20, { color: '#241a3a', seed: 30 + i, jag: 0.4 }); g.globalAlpha = 1;
    });
    // 7. page curls, bottom corners
    [[mx + iw, my + ih, -1], [mx, my + ih, 1]].forEach((c) => {
      const x = c[0], y = c[1], d = c[2], sz = 40;
      g.save(); g.beginPath(); g.moveTo(x, y - sz); g.lineTo(x, y); g.lineTo(x + d * sz, y); g.closePath(); g.clip();
      g.fillStyle = A('#2a1a10', 0.35); g.fillRect(x - sz, y - sz, sz * 2, sz * 2); g.restore();
      const cg = g.createLinearGradient(x, y, x + d * sz * 0.5, y - sz * 0.5); cg.addColorStop(0, '#d8c08a'); cg.addColorStop(1, '#fbf1d6');
      g.beginPath(); g.moveTo(x, y - sz * 0.92); g.quadraticCurveTo(x + d * sz * 0.34, y - sz * 0.34, x + d * sz * 0.92, y); g.lineTo(x, y); g.closePath(); g.fillStyle = cg; g.fill();
      g.lineWidth = 1.2; g.strokeStyle = A('#5a4028', 0.6); g.beginPath(); g.moveTo(x, y - sz * 0.92); g.quadraticCurveTo(x + d * sz * 0.34, y - sz * 0.34, x + d * sz * 0.92, y); g.stroke();
    });
    g.restore();
    // 8. gilt corners and clasps
    [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]].forEach((c) => { g.save(); g.translate(c[0], c[1]); g.scale(c[2], c[3]); cornerCap(g, Math.min(1, cb * 3.2 / 70) * 0.9 + 0.1); g.restore(); });
    [[gx, cb * 0.5], [gx, h - cb * 0.5]].forEach((c) => { tk.celFill(g, [[c[0] - 12, c[1], 1], [c[0], c[1] - cb * 0.42, 1], [c[0] + 12, c[1], 1], [c[0], c[1] + cb * 0.42, 1]], GOLD, { line: 1.6, depth: 3, hi: true, hiW: 1.5, tension: 0.2 }); });
  }
  function frame(ctx, w, h, t) {
    w = pos(w, 1280); h = pos(h, 720); t = num(t, 0);
    const spr = ART.sprite('map|frame|' + Math.round(w) + 'x' + Math.round(h), w, h, (g) => frameSprite(g, w, h));
    ART.blit(ctx, spr, 0, 0, w, h);
    const fm = frameMetrics(w, h), mo = tk.motion(), gx = w / 2;
    // the bookmark ribbon sways a hair; gilt corners twinkle
    const sw = Math.sin(t * 1.3) * 1.6 * mo;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(gx + 10, fm.cb * 0.4); ctx.lineTo(gx + 20, fm.cb * 0.4); ctx.lineTo(gx + 20 + sw * 0.5, fm.my + 2); ctx.lineTo(gx + 15 + sw * 0.6, fm.my - 5); ctx.lineTo(gx + 10 + sw * 0.5, fm.my + 2); ctx.closePath();
    ctx.fillStyle = pal.vermilion; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = pal.ink; ctx.stroke();
    ctx.restore();
    [[fm.cb * 0.55, fm.cb * 0.55], [w - fm.cb * 0.55, fm.cb * 0.55], [fm.cb * 0.55, h - fm.cb * 0.55], [w - fm.cb * 0.55, h - fm.cb * 0.55]].forEach((c, i) => {
      const a = 0.5 + 0.5 * Math.sin(t * 2 + i * 1.7);
      if (a > 0.35) tk.sparkle(ctx, c[0], c[1], 5 + 3 * a, { color: '#fff8e0', alpha: a, glow: 0.4 });
    });
  }
  // ---------------------------------------------------------------------------------------------------------------
  // FOG EDGE: the soft ink-wash boundary where painted ground meets blank paper (and the torn rim where it meets the Void). One cached strip per
  // boundary side, drawn rotated: cells = [{x, y, mask, voidMask}], bit d of mask = the neighbour across side d (MAP.DIRS order) is fog
  // ---------------------------------------------------------------------------------------------------------------
  const FE_W = 1.5, FE_H = 0.72, FE_OY = 0.2;                         // strip box in units of s, and where the edge line sits inside it
  function noisePoly(x0, x1, y, amp, sd, step) { const pts = []; for (let x = x0; x <= x1 + 0.1; x += step) pts.push([x, y + (U.noise.n1(x * 0.06 + sd * 9.1, sd) * 2 - 1) * amp]); return pts; }
  function featherSprite(g, w, h, s, v, kind) {
    const k = s / BASE, r = R('feather', kind, v), oy = s * FE_OY, x0 = s * (FE_W - 1) / 2, x1 = x0 + s;
    g.save(); g.beginPath(); g.rect(0, oy - s * 0.08, w, h); g.clip();
    if (kind === 'void') {
      const line = noisePoly(x0 - s * 0.1, x1 + s * 0.1, oy + s * 0.01, s * 0.03, v + 3, s * 0.06);
      const top = line.map((q) => [q[0], q[1] - s * 0.1]);
      const gr = g.createLinearGradient(0, oy - s * 0.24, 0, oy - s * 0.02); gr.addColorStop(0, A('#1a0e22', 0)); gr.addColorStop(1, A('#1a0e22', 0.28));
      g.fillStyle = gr; g.fillRect(x0 - s * 0.1, oy - s * 0.24, s * 1.2, s * 0.22);
      g.beginPath(); g.moveTo(top[0][0], top[0][1]); top.forEach((q) => g.lineTo(q[0], q[1])); for (let i = line.length - 1; i >= 0; i--) g.lineTo(line[i][0], line[i][1]); g.closePath();
      g.fillStyle = A('#fbf3dc', 0.96); g.fill();
      g.lineWidth = 1 * k; g.strokeStyle = A('#8a6a4a', 0.55); g.beginPath(); line.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.stroke();
      g.lineCap = 'round';
      for (let i = 0; i < 20; i++) { const x = lerp(x0, x1, r()), y = oy + s * 0.01 + (U.noise.n1(x * 0.06 + (v + 3) * 9.1, v + 3) * 2 - 1) * s * 0.03, a = PI / 2 + (r() - 0.5) * 1.1, l = (2 + r() * 4) * k; g.beginPath(); g.moveTo(x, y - 1); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.lineWidth = 0.7 * k; g.strokeStyle = A('#fffdf2', 0.85); g.stroke(); }
    } else {
      g.lineCap = 'round'; g.lineJoin = 'round';
      const line = noisePoly(x0 - s * 0.06, x1 + s * 0.06, oy + s * 0.03, s * 0.03, v + 1, s * 0.09);
      [0.56, 0.5, 0.44, 0.38, 0.32, 0.26, 0.2, 0.14, 0.08].map((wd, i) => [wd, 0.03 + i * 0.004]).forEach((p2) => { g.beginPath(); line.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.lineWidth = p2[0] * s; g.strokeStyle = A('#5a4570', p2[1]); g.stroke(); });
      tk.inkPath(g, line.map((q) => [q[0], q[1] + s * 0.02]), { w: 1.5 * k, color: '#2a1f3a', alpha: 0.45, taper: 0.3, wobble: 0.3, seed: v });
      const nT = 1 + (r() < 0.6 ? 1 : 0);
      for (let i = 0; i < nT; i++) {
        const x = lerp(x0 + s * 0.15, x1 - s * 0.15, r()), j1 = (r() - 0.5) * s * 0.12, j2 = (r() - 0.5) * s * 0.2;
        tk.inkPath(g, [[x, oy + s * 0.04], [x + j1, oy + s * 0.15], [x + j2, oy + s * 0.27], [x + j2 * 1.4, oy + s * (0.34 + r() * 0.08)]], { w: 1.1 * k, color: '#3a2a4a', alpha: 0.3, taper: 0.5, wobble: 0.2, seed: v * 3 + i });
        if (r() < 0.6) tk.inkPath(g, [[x + j1 * 0.6, oy + s * 0.12], [x + j1 + s * 0.06, oy + s * 0.2], [x + j1 + s * 0.1, oy + s * 0.25]], { w: 0.8 * k, color: '#3a2a4a', alpha: 0.24, taper: 0.5, seed: v * 5 + i });
      }
      for (let i = 0; i < 3; i++) softDisc(g, lerp(x0, x1, r()), oy + s * (0.14 + r() * 0.24), (0.6 + r() * 1.1) * k, '#3a2a4a', 0.24);
    }
    g.restore();
  }
  function fogEdge(ctx, cells, size, t, opts) {
    if (!Array.isArray(cells) || !cells.length) return;
    size = pos(size, BASE); opts = opts || {};
    const k = rungOf(size), s = rungSize(k), f = size / s, ap = size * SQ3 / 2, w = s * FE_W, h = s * FE_H, tt = num(t, 0), sh = opts.shimmer === false ? 0 : 0.1 * tk.motion();
    const ga = ctx.globalAlpha;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (!c) continue;
      const cx = num(c.x, 0), cy = num(c.y, 0), m = c.mask | 0, vm = c.voidMask | 0;
      if (!(m | vm)) continue;
      for (let d = 0; d < 6; d++) {
        const bit = 1 << d, isF = (m & bit) !== 0, isV = (vm & bit) !== 0;
        if (!isF && !isV) continue;
        const v = (Math.imul(Math.round(cx) * 31 + Math.round(cy) * 17 + d * 7, 0x9e3779b1) >>> 28) & 3;
        const kind = isV ? 'void' : 'fog';
        const spr = ART.sprite(`map|fe|${kind}|${v}|${k}`, w, h, (g) => featherSprite(g, w, h, s, v, kind));
        const th = SIDE_ANG[d];
        ctx.save();
        ctx.translate(cx + Math.cos(th) * ap, cy + Math.sin(th) * ap); ctx.rotate(th - PI / 2); ctx.scale(f, f);
        if (sh) ctx.globalAlpha = ga * (1 - sh + sh * Math.sin(tt * 1.4 + (cx + cy) * 0.02));
        ART.blit(ctx, spr, -w / 2, -s * FE_OY, w, h);
        ctx.restore();
      }
    }
    ctx.globalAlpha = ga;
  }
  // helper for screens: the two masks of a hex, from a predicate over MAP.DIRS-ordered neighbours: (dq, dr) -> 'fog' | 'void' | other
  M.edgeMasks = (q, r, kindAt) => {
    const D = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    let mask = 0, vm = 0;
    for (let d = 0; d < 6; d++) { const kd = kindAt(q + D[d][0], r + D[d][1]); if (kd === 'fog') mask |= 1 << d; else if (kd === 'void') vm |= 1 << d; }
    return { mask, voidMask: vm };
  };

  // ---------------------------------------------------------------------------------------------------------------
  // TOKEN: the party on the hex. ids[0] is the leader (larger, in front), ids[1] the second hero (smaller, behind)
  // ---------------------------------------------------------------------------------------------------------------
  function inkDrop(g, x, y, r, fill, line) {
    g.beginPath(); g.moveTo(x, y - r * 1.25); g.bezierCurveTo(x + r * 0.5, y - r * 0.45, x + r * 0.95, y + r * 0.1, x + r * 0.62, y + r * 0.72); g.bezierCurveTo(x + r * 0.3, y + r * 1.15, x - r * 0.3, y + r * 1.15, x - r * 0.62, y + r * 0.72);
    g.bezierCurveTo(x - r * 0.95, y + r * 0.1, x - r * 0.5, y - r * 0.45, x, y - r * 1.25); g.closePath();
    g.fillStyle = fill; g.fill(); if (line) { g.lineWidth = Math.max(1, r * 0.22); g.strokeStyle = line; g.stroke(); }
  }
  function token(ctx, heroIds, x, y, t, moving, opts) {
    opts = opts || {};
    const ids = (Array.isArray(heroIds) ? heroIds : [heroIds]).filter((id) => typeof id === 'string').slice(0, 2);
    if (!ids.length) return;
    x = num(x, 0); y = num(y, 0); t = num(t, 0);
    const size = pos(opts.size, BASE), k = size / BASE, dir = opts.dir === -1 ? -1 : 1, mo = tk.motion(), mv = !!moving;
    const bob = mv ? Math.abs(Math.sin(t * 8)) * 3.2 * k * mo : (0.5 + 0.5 * Math.sin(t * 1.9)) * 1.6 * k * mo;
    const ga = ctx.globalAlpha;
    if (opts.alpha !== undefined) ctx.globalAlpha = ga * cA(opts.alpha);
    // a gold ink ring on the hex and two soft ink shadows, pulsing a little
    if (opts.ring !== false) {
      ctx.save(); ctx.translate(x, y + 0.36 * size); ctx.scale(1, 0.34);
      ctx.beginPath(); ctx.arc(0, 0, size * (0.66 + 0.02 * Math.sin(t * 2.4) * mo), 0, TAU); ctx.setLineDash([size * 0.16, size * 0.1]); ctx.lineDashOffset = -t * size * 0.2 * mo;
      ctx.lineWidth = 2.2 * k * 2.6; ctx.strokeStyle = A(pal.gold, mv ? 0.35 : 0.7); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
    }
    const shadow = (sx, sy, rx, a) => { ctx.save(); ctx.translate(sx, sy); ctx.scale(1, 0.3); ctx.beginPath(); ctx.arc(0, 0, rx * (1 - bob * 0.02), 0, TAU); ctx.fillStyle = A(pal.ink, a); ctx.fill(); ctx.restore(); };
    const scF = 0.28 * k, scB = 0.225 * k;
    const fx = x + dir * 0.18 * size, fy = y + 0.4 * size, bx = x - dir * 0.34 * size, by = y + 0.28 * size;
    if (ids.length > 1) { shadow(bx, by + 1, 0.3 * size, 0.28); shadow(fx, fy + 1, 0.4 * size, 0.32); } else shadow(x, fy + 1, 0.4 * size, 0.32);
    const pose = mv ? 'walk' : 'idle';
    if (ids.length > 1) ART.hero.draw(ctx, ids[1], { x: bx, y: by - bob * 0.7, s: scB, pose, t: t + 0.37, flip: dir < 0, shadow: false });
    ART.hero.draw(ctx, ids[0], { x: ids.length > 1 ? fx : x, y: fy - bob, s: scF, pose, t, flip: dir < 0, shadow: false });
    ctx.globalAlpha = ga;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // ROUTE: the dotted brush-stroke path preview with an ink cost pill
  // ---------------------------------------------------------------------------------------------------------------
  const asPts = (pts) => (Array.isArray(pts) ? pts : []).map((q) => (Array.isArray(q) ? [num(q[0], 0), num(q[1], 0)] : [num(q && q.x, 0), num(q && q.y, 0)]));
  function dabSprite(g, w, h, v) {
    const r = R('dab', v), pts = [];
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, kk = 1 + (r() - 0.5) * 0.5; pts.push([w / 2 + Math.cos(a) * w * 0.4 * kk * (v === 1 ? 1.15 : 1), h / 2 + Math.sin(a) * h * 0.4 * kk]); }
    g.beginPath(); tk.trace(g, pts); g.fillStyle = '#3a2a1a'; g.fill();
    g.beginPath(); g.ellipse(w * 0.4, h * 0.38, w * 0.12, h * 0.1, 0, 0, TAU); g.fillStyle = A('#fff2c8', 0.5); g.fill();
  }
  function pill(ctx, x, y, k, text, ok, t) {
    const w = (text.length > 2 ? 64 : 54) * k, h = 28 * k, mo = tk.motion();
    const shake = ok ? 0 : Math.sin(t * 34) * 1.4 * k * mo * (Math.sin(t * 3) > 0.6 ? 1 : 0);
    ctx.save(); ctx.translate(x + shake, y);
    const capsule = () => { ctx.beginPath(); ctx.moveTo(-w / 2 + h / 2, -h / 2); ctx.lineTo(w / 2 - h / 2, -h / 2); ctx.arc(w / 2 - h / 2, 0, h / 2, -PI / 2, PI / 2); ctx.lineTo(-w / 2 + h / 2, h / 2); ctx.arc(-w / 2 + h / 2, 0, h / 2, PI / 2, PI * 1.5); ctx.closePath(); };
    ctx.save(); ctx.translate(2 * k, 3 * k); capsule(); ctx.fillStyle = A(pal.ink, 0.28); ctx.fill(); ctx.restore();
    capsule(); ctx.fillStyle = ok ? '#fbf1d6' : '#e8383d'; ctx.fill();
    ctx.save(); capsule(); ctx.clip(); ctx.translate(-2.4 * k, 3.4 * k); capsule(); ctx.fillStyle = A(ok ? '#b8965a' : '#7d1230', 0.4); ctx.fill('evenodd'); ctx.restore();
    ctx.save(); capsule(); ctx.clip(); ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h * 0.42); ctx.fillStyle = A('#ffffff', ok ? 0.5 : 0.22); ctx.fill(); ctx.restore();
    capsule(); ctx.lineJoin = 'round'; ctx.lineWidth = 2.4 * k; ctx.strokeStyle = pal.ink; ctx.stroke();
    inkDrop(ctx, -w / 2 + 15 * k, 0.5 * k, 6.4 * k, ok ? '#2a1a6a' : '#fff0f0', pal.ink);
    ctx.font = '900 ' + Math.round(17 * k) + 'px ' + tk.font.num; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = 3.4 * k; ctx.strokeStyle = ok ? '#fffaf0' : pal.ink; ctx.strokeText(text, 8 * k, 1 * k); ctx.fillStyle = ok ? pal.ink : '#ffffff'; ctx.fillText(text, 8 * k, 1 * k);
    ctx.restore();
  }
  function route(ctx, pts, t, opts) {
    opts = opts || {};
    const P = asPts(pts);
    if (!P.length) return;
    t = num(t, 0);
    const size = pos(opts.size, BASE), k = size / BASE, ok = opts.affordable !== false, mo = tk.motion();
    const col = opts.color || (ok ? '#7a4a12' : '#8a1a2a'), wash = ok ? '#ffb640' : '#e8383d';
    const ga = ctx.globalAlpha;
    if (opts.alpha !== undefined) ctx.globalAlpha = ga * cA(opts.alpha);
    const dense = P.length > 1 ? tk.flatten(P, { step: 5 }) : P[0].slice();
    const n = dense.length >> 1, cum = [0];
    for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(dense[2 * i] - dense[2 * i - 2], dense[2 * i + 1] - dense[2 * i - 1]));
    const total = cum[n - 1] || 0;
    if (n > 1) {
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';                       // the wet underlay of the brush
      ctx.beginPath(); ctx.moveTo(dense[0], dense[1]); for (let i = 1; i < n; i++) ctx.lineTo(dense[2 * i], dense[2 * i + 1]);
      ctx.lineWidth = size * 0.5; ctx.strokeStyle = A(wash, 0.12); ctx.stroke();
      ctx.lineWidth = size * 0.26; ctx.strokeStyle = A(wash, 0.14); ctx.stroke();
      ctx.restore();
      // ink dabs marching toward the destination
      const sp = size * 0.27, phase = (t * size * 0.55 * mo) % sp, dw = 7.4 * k, dh = 6.4 * k;
      let j = 1;
      for (let i = 0, d = phase; d < total; i++, d += sp) {
        while (j < n - 1 && cum[j] < d) j++;
        const a = cum[j - 1], b = cum[j], u = b > a ? (d - a) / (b - a) : 0;
        const px = lerp(dense[2 * j - 2], dense[2 * j], u), py = lerp(dense[2 * j - 1], dense[2 * j + 1], u);
        const wv = 0.55 + 0.45 * Math.max(0, Math.sin(TAU * ((d / total) * 2.2 - t * 0.9 * mo)));
        const v = (i + Math.floor((t * size * 0.55 * mo) / sp)) % 3, sc = 0.72 + 0.4 * wv;
        const spr = ART.sprite('map|dab|' + v + '|' + Math.round(k * 4), dw, dh, (g, ww, hh) => dabSprite(g, ww, hh, v));
        ART.blit(ctx, spr, px - dw * sc / 2, py - dh * sc / 2, dw * sc, dh * sc, (ok ? 0.95 : 0.85) * Math.min(1, d / (size * 0.4) + 0.2));
      }
      if (col !== '#7a4a12') { /* custom colour: a thin line under the dabs so it shows */ }
    }
    // the destination: a small ink ring and the cost pill
    const e = P[P.length - 1], ex = e[0], ey = e[1];
    ctx.save(); ctx.translate(ex, ey); ctx.scale(1, 1);
    ctx.beginPath(); ctx.arc(0, 0, size * (0.3 + 0.03 * Math.sin(t * 3.2) * mo), 0, TAU); ctx.lineWidth = 2.4 * k; ctx.strokeStyle = A(ok ? pal.ink : '#7d1230', 0.85); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, size * 0.3 + 3.2 * k, 0, TAU); ctx.lineWidth = 1.3 * k; ctx.strokeStyle = A(ok ? pal.gold : '#ff8a7a', 0.9); ctx.stroke();
    ctx.restore();
    const text = opts.label !== undefined ? String(opts.label) : (typeof opts.cost === 'number' && isFinite(opts.cost) ? String(Math.round(opts.cost)) : '');
    if (text && opts.pill !== false) pill(ctx, ex + size * 0.5, ey - size * 0.86, Math.max(0.8, k), text, ok, t);
    ctx.globalAlpha = ga;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // BRUSH PREVIEW: the cells a brush would paint, as one wet shape with a marching ink outline
  // ---------------------------------------------------------------------------------------------------------------
  // the sides of a set of hexes (centres in px): inner = shared by two hexes of the set, outer = the boundary of the union
  function brushEdges(hexes, size) {
    const P = asPts(hexes), s = pos(size, BASE), step = s * SQ3, inner = [], outer = [];
    const has = (x, y) => { for (let i = 0; i < P.length; i++) if (Math.hypot(P[i][0] - x, P[i][1] - y) < s * 0.3) return true; return false; };
    P.forEach((c) => {
      const cs = corners(c[0], c[1], s * 0.985);
      for (let d = 0; d < 6; d++) {
        const th = SIDE_ANG[d], nb = has(c[0] + Math.cos(th) * step, c[1] + Math.sin(th) * step), a = cs[SIDE_CORNERS[d][0]], b = cs[SIDE_CORNERS[d][1]];
        (nb ? inner : outer).push([a.x, a.y, b.x, b.y]);
      }
    });
    return { inner, outer };
  }
  function brushPreview(ctx, hexes, size, valid, t) {
    const P = asPts(hexes);
    if (!P.length) return;
    size = pos(size, BASE); t = num(t, 0);
    const k = size / BASE, ok = valid !== false, mo = tk.motion(), pulse = 0.5 + 0.5 * Math.sin(t * 3.4);
    const fill = ok ? '#2fbdb5' : '#e8383d', lineCol = ok ? '#0c5058' : '#6a0f26';
    const ga = ctx.globalAlpha;
    ctx.save();
    ctx.beginPath(); P.forEach((c) => hexPath(ctx, c[0], c[1], size * 0.985));
    ctx.fillStyle = A(fill, (ok ? 0.24 : 0.2) + 0.1 * pulse); ctx.fill();
    // wet sheen sweeping across
    ctx.save(); ctx.clip();
    const bx = P.reduce((m, c) => Math.min(m, c[0]), Infinity) - size, bw = P.reduce((m, c) => Math.max(m, c[0]), -Infinity) + size - bx;
    const sx = bx + ((t * 0.5 * mo) % 1.4 - 0.2) * bw, gr = ctx.createLinearGradient(sx - size * 0.5, 0, sx + size * 0.5, 0);
    gr.addColorStop(0, A('#ffffff', 0)); gr.addColorStop(0.5, A('#ffffff', ok ? 0.34 : 0.2)); gr.addColorStop(1, A('#ffffff', 0));
    ctx.fillStyle = gr; ctx.fillRect(bx, P.reduce((m, c) => Math.min(m, c[1]), Infinity) - size, bw, P.length * size * 2);
    ctx.restore();
    // inner seams, then the boundary of the union
    const be = brushEdges(P, size), inner = be.inner, outer = be.outer;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); inner.forEach((e) => { ctx.moveTo(e[0], e[1]); ctx.lineTo(e[2], e[3]); });
    ctx.setLineDash([2.4 * k, 4.2 * k]); ctx.lineWidth = 1.4 * k; ctx.strokeStyle = A(lineCol, 0.45); ctx.stroke();
    ctx.beginPath(); outer.forEach((e) => { ctx.moveTo(e[0], e[1]); ctx.lineTo(e[2], e[3]); });
    ctx.setLineDash([]); ctx.lineWidth = 6 * k; ctx.strokeStyle = A(fill, 0.3); ctx.stroke();
    ctx.setLineDash([9 * k, 5 * k]); ctx.lineDashOffset = -t * 22 * k * mo; ctx.lineWidth = 2.6 * k; ctx.strokeStyle = A(lineCol, 0.95); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    // sparkles on the wet paint, or an X on an impossible brush
    P.forEach((c, i) => {
      const a = 0.5 + 0.5 * Math.sin(t * 2.6 + i * 1.9);
      if (ok && a > 0.4) tk.sparkle(ctx, c[0] + Math.sin(i * 2.3) * size * 0.25, c[1] + Math.cos(i * 1.7) * size * 0.22, (3 + 3 * a) * k, { color: '#eaffff', alpha: a, glow: 0.3 });
    });
    if (!ok) {
      const c0 = P[0];
      ctx.lineCap = 'round'; ctx.lineWidth = 4 * k; ctx.strokeStyle = A(pal.ink, 0.85);
      ctx.beginPath(); ctx.moveTo(c0[0] - size * 0.2, c0[1] - size * 0.2); ctx.lineTo(c0[0] + size * 0.2, c0[1] + size * 0.2); ctx.moveTo(c0[0] + size * 0.2, c0[1] - size * 0.2); ctx.lineTo(c0[0] - size * 0.2, c0[1] + size * 0.2); ctx.stroke();
      ctx.lineWidth = 2 * k; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    }
    ctx.globalAlpha = ga;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // PAINT BLOOM: the reveal. A watercolour wash spreading from the brush touch point with a wet edge, flung droplets and a fading gleam.
  //   ART.map.paintBloom(ctx, x, y, size, p, opts?)   p = 0..1;  opts {tile, seed, ox, oy, fromX, fromY}
  //   With opts.tile the bloom PAINTS the hex (the wash is revealed inside the growing blot, over whatever is under it: draw the fog hex first);
  //   without it, it is a neutral wet-paper wash that fades out over a hex that is already painted underneath.
  // ---------------------------------------------------------------------------------------------------------------
  function blobClip(ctx, tx, ty, rr, sd, p) {
    const n = 24;
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i % n) / n * TAU, kk = 1 + 0.2 * (U.noise.n1(a * 2.1 + sd * 3.3 + p * 1.6, sd) * 2 - 1) + 0.08 * Math.sin(a * 5 + sd);
      const px = tx + Math.cos(a) * rr * kk, py = ty + Math.sin(a) * rr * kk;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  function paintBloom(ctx, x, y, size, p, opts) {
    opts = opts || {};
    size = pos(size, BASE); x = num(x, 0); y = num(y, 0); p = clamp(num(p, 0), 0, 1);
    const tile = typeof opts.tile === 'string' ? (WASH[opts.tile] ? opts.tile : 'empty') : null;
    const sd = Math.floor(num(opts.seed, U.hash(Math.round(x), Math.round(y)) & 1023));
    if (p <= 0) return;
    if (p >= 1) { if (tile) hex(ctx, 'painted', x, y, size, { tile, seed: sd }); return; }
    const k = size / BASE, r = R('bloom', sd), hue = tile ? washOf(tile).c : '#c99a5a', deepHue = tk.shade(hue, 0.25);
    let ox = num(opts.ox, 0), oy = num(opts.oy, 0);
    if (opts.fromX !== undefined && opts.fromY !== undefined) {                       // touch the hex where the brush arrives from
      const a = Math.atan2(num(opts.fromY, y) - y, num(opts.fromX, x) - x); ox = Math.cos(a) * size * 0.7; oy = Math.sin(a) * size * 0.7;
    }
    const tx = x + ox, ty = y + oy, e = U.ease.outCubic(clamp(p / 0.72, 0, 1)), rr = size * (0.06 + (1.15 + Math.hypot(ox, oy) / size) * e);
    const ga = ctx.globalAlpha;
    ctx.save();
    ctx.beginPath(); hexPath(ctx, x, y, size * 1.02); ctx.clip();                                     // everything stays on the hex
    if (tile) {
      ctx.save(); blobClip(ctx, tx, ty, rr, sd, p); ctx.clip();
      hex(ctx, 'painted', x, y, size, { tile, seed: sd });
      ctx.restore();
    } else {
      blobClip(ctx, tx, ty, rr, sd, p); ctx.fillStyle = A(hue, 0.34 * (1 - p * p)); ctx.fill();
    }
    // the wet edge: a darker line where the pigment is still moving, a paler backrun inside it
    if (p < 0.9) {
      const fade = 1 - p * 0.9;
      blobClip(ctx, tx, ty, rr, sd, p); ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.1; ctx.strokeStyle = A(deepHue, 0.22 * fade); ctx.stroke();
      ctx.lineWidth = size * 0.035; ctx.strokeStyle = A(tk.shade(hue, 0.5), 0.5 * fade); ctx.stroke();
      blobClip(ctx, tx, ty, rr * 0.86, sd + 1, p); ctx.lineWidth = size * 0.05; ctx.strokeStyle = A('#fff6dc', 0.34 * fade); ctx.stroke();
    }
    // the gleam: a light streak crossing the wet paint
    const q = clamp((p - 0.4) / 0.55, 0, 1);
    if (q > 0 && q < 1) {
      const gx = x - size * 1.2 + q * size * 2.4, gr = ctx.createLinearGradient(gx - size * 0.3, y + size * 0.3, gx + size * 0.3, y - size * 0.3);
      gr.addColorStop(0, A('#ffffff', 0)); gr.addColorStop(0.5, A('#ffffff', 0.5 * Math.sin(PI * q))); gr.addColorStop(1, A('#ffffff', 0));
      ctx.fillStyle = gr; ctx.fillRect(x - size, y - size, size * 2, size * 2);
    }
    ctx.restore();
    // droplets thrown from the touch point (they may leave the hex), and ink creeping into the fibres
    const nD = tk.lowQ() ? 4 : 8;
    for (let i = 0; i < nD; i++) {
      const a = r() * TAU, sp = size * (0.7 + r() * 0.9), st = r() * 0.18, rad = size * (0.045 + r() * 0.05), qd = clamp((p - st) / 0.62, 0, 1);
      const bias = Math.atan2(y - ty, x - tx);
      if (qd <= 0 || qd >= 1) continue;
      const ang = (Math.hypot(ox, oy) > 1 ? bias + (a - PI) * 0.5 : a), dd = sp * U.ease.outCubic(qd);
      const dx = tx + Math.cos(ang) * dd, dy = ty + Math.sin(ang) * dd + size * 0.45 * qd * qd;
      ctx.globalAlpha = ga * Math.pow(1 - qd, 0.7);
      softDisc(ctx, dx, dy, rad * (1 - qd * 0.5), deepHue, 0.9);
      softDisc(ctx, dx - rad * 0.3, dy - rad * 0.3, rad * 0.32, '#ffffff', 0.7);
    }
    ctx.globalAlpha = ga;
    if (q > 0.25 && q < 1) { const sa = Math.sin(PI * clamp((q - 0.25) / 0.75, 0, 1)); tk.sparkle(ctx, x + size * 0.46, y - size * 0.5, size * 0.24 * sa, { color: '#fff8e0', alpha: sa, glow: 0.5 }); }
  }

  M.paper = paper;
  M.fogEdge = fogEdge;
  M.token = token;
  M.route = route;
  M.brushPreview = brushPreview;
  M.paintBloom = paintBloom;
  M.frame = frame;
  M.frameInner = (w, h) => frameMetrics(pos(w, 1280), pos(h, 720)).inner;
  M.worldBox = worldBox;


  M.hex = hex;
  M.brushEdges = brushEdges;
  M.geom = { sideAngle: SIDE_ANG.slice(), sideCorners: SIDE_CORNERS.map((c) => c.slice()), cornerAngle: cornerAng };
  M.bakedSize = (size) => rungSize(rungOf(size));
  // bake the sprites a screen will need at `size` ahead of time (call while the screen loads). opts {tiles, done, ms}: returns how many were baked
  M.warm = (size, opts) => {
    opts = opts || {};
    const before = bakedTotal, until = typeof performance !== 'undefined' && opts.ms > 0 ? performance.now() + opts.ms : Infinity;
    const c = null;
    const sz = pos(size, BASE), tiles = opts.tiles || L.tiles.filter((x) => x !== 'block');
    const step = (kind, tile, done, v) => { if (typeof performance !== 'undefined' && performance.now() > until) return; bakeBudget = 1e9; hex(c, kind, 0, 0, sz, { tile, done, seed: v, bakeOnly: true }); };
    for (let v = 0; v < 8; v++) { step('fog', null, false, v); step('edge', null, false, v); step('block', null, false, v); }
    step('path', null, false, 0); step('path', null, false, 1); step('hover', null, false, 0); step('target', null, false, 0);
    tiles.forEach((tl) => { for (let v = 0; v < 8; v++) step('painted', tl, false, v); });
    ['boss', 'shop', 'camp', 'forge', 'elite', 'chest'].forEach((tl) => { for (let v = 0; v < 8; v++) step('known', tl, false, v); });
    if (opts.done) tiles.forEach((tl) => { for (let v = 0; v < 8; v++) step('painted', tl, true, v); });
    return bakedTotal - before;
  };
  M.info = () => ({ baked: bakedTotal, kinds: L.mapKinds.slice(), tiles: Object.keys(WASH), ladder: [KMIN, KMAX].map(rungSize), bakesPerFrame: BAKES_PER_FRAME });
  M.corners = corners;
  M.washOf = washOf;
  ART.declare('map', L.mapKinds.concat(['paintBloom', 'token', 'frame', 'paper', 'route', 'brushPreview', 'fogEdge']));

  // ---------------------------------------------------------------------------------------------------------------
  // a sample page for the gallery: built with MAP.generate when MAP exists (it loads after this file; the gallery loads it on demand), else a
  // small private page of the same shape so the sheets still draw headless
  // ---------------------------------------------------------------------------------------------------------------
  // hygiene-allow(layers): gallery sheets run long after every script loaded; MAP is later in the load order and absent from the gallery page
  const mapNow = () => (typeof MAP !== 'undefined' ? MAP : null);
  function loadMapModule() {
    return new Promise((resolve) => {
      if (mapNow() || typeof document === 'undefined' || !document.head || (typeof window !== 'undefined' && window.__HEADLESS)) { resolve(mapNow()); return; }
      const el = document.createElement('script');
      el.src = 'js/map.js'; el.onload = () => resolve(mapNow()); el.onerror = () => resolve(null);
      document.head.appendChild(el);
    });
  }
  const pxOf = (q, r, size) => ({ x: size * SQ3 * (q + r / 2), y: size * 1.5 * r });
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const hexDist = (aq, ar, bq, br) => (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs(aq + ar - bq - br)) / 2;
  // page = {tiles:[T], at(q, r), pos:{q, r}, path:[[q, r]] (a route), brush:[[q, r]] (brush cells), hover:{q, r}}
  function fallbackPage() {
    const cols = 21, rows = 13, r = R('samplepage'), tiles = {}, list = [];
    const key = (q, rr) => q + ',' + rr;
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) { const q = col - (row >> 1), T = { q, r: row, type: 'empty', painted: false, known: false, done: false }; tiles[key(q, row)] = T; list.push(T); }
    const at = (q, rr) => tiles[key(q, rr)] || null;
    const start = { q: 1 - 3, r: 6 }, boss = { q: 19 - 3, r: 6 };
    const cnt = { enemy: 0.22, elite: 0.03, chest: 0.03, shop: 0.02, camp: 0.03, event: 0.09, well: 0.05, brush: 0.03, gemcache: 0.02, forge: 0.02, block: 0.12 };
    list.forEach((T) => { let roll = r(), acc = 0; for (const kk of Object.keys(cnt)) { acc += cnt[kk]; if (roll < acc) { T.type = kk; break; } } if (hexDist(T.q, T.r, start.q, start.r) <= 3) T.type = 'empty'; });
    at(start.q, start.r).type = 'start'; at(boss.q, boss.r).type = 'boss';
    list.forEach((T) => { if (['boss', 'shop', 'camp', 'forge', 'elite', 'chest'].includes(T.type)) T.known = true; });
    const paint = (q, rr) => { const T = at(q, rr); if (T && T.type !== 'block') { T.painted = true; T.known = true; } };
    list.forEach((T) => { if (hexDist(T.q, T.r, start.q, start.r) <= 2) paint(T.q, T.r); });
    const path = []; let cq = start.q + 2, cr = start.r;
    for (let i = 0; i < 12; i++) { const d = i % 3 === 1 ? DIRS[5] : (i % 3 === 2 ? DIRS[1] : DIRS[0]); cq += d[0]; cr += d[1]; if (at(cq, cr) && at(cq, cr).type !== 'block') { paint(cq, cr); path.push([cq, cr]); } }
    return { tiles: list, at, cols, rows, pos: { q: cq, r: cr }, start, boss, path: [[cq + 1, cr], [cq + 2, cr], [cq + 3, cr - 1]], brush: [[cq + 1, cr - 2], [cq + 2, cr - 2], [cq + 1, cr - 1]], hover: { q: cq, r: cr - 1 } };
  }
  function samplePage(m) {
    if (!m) return fallbackPage();
    const Mp = m.generate({ chapter: 1, seed: 20260101 });
    const sol = m.solve(Mp);
    (sol.path || []).slice(0, 9).forEach((c) => m.paint(Mp, c[0], c[1]));
    const fr = m.frontier(Mp);
    if (fr.length) { const o = fr[Math.floor(fr.length * 0.35)]; try { m.applyBrush(Mp, 'splash', o.q, o.r, 0); } catch (e) { /* the sheet still draws */ } }
    let n = 0; m.painted(Mp).forEach((T) => { if (T.type !== 'empty' && T.type !== 'start' && n < 2) { T.done = true; n++; } });
    const lastP = (sol.path || [])[Math.min(8, (sol.path || []).length - 1)];
    if (lastP) Mp.pos = { q: lastP[0], r: lastP[1] };
    const nxt = m.solve(Mp);
    const fr2 = m.frontier(Mp);
    // a line brush ('stroke') starts on a painted hex near the party and runs into the fog (DESIGN 4.8), away from the previewed route
    let brush = [], bestScore = -1e9;
    const onRoute = (q, r) => (nxt.path || []).slice(0, 4).some((c) => c[0] === q && c[1] === r);
    m.painted(Mp).forEach((T) => {
      const d0 = m.dist(T.q, T.r, Mp.pos.q, Mp.pos.r);
      if (d0 > 4) return;
      for (let d = 0; d < 6; d++) {
        let cells = [];
        try { cells = m.brushCells(Mp, 'stroke', T.q, T.r, d) || []; } catch (e) { cells = []; }
        if (cells.length < 3 || cells.some((c) => onRoute(c[0], c[1]))) continue;
        const score = cells.length * 3 - d0 + (DIRS[d][1] < 0 ? 2 : 0);
        if (score > bestScore) { bestScore = score; brush = cells; }
      }
    });
    const tilesL = Object.keys(Mp.tiles).map((k) => Mp.tiles[k]);
    return { tiles: tilesL, at: (q, r) => m.tile(Mp, q, r), cols: Mp.cols, rows: Mp.rows, pos: Mp.pos, start: Mp.start, boss: Mp.boss, path: (nxt.path || []).slice(0, 4), brush, hover: fr2.length ? { q: fr2[1 % fr2.length].q, r: fr2[1 % fr2.length].r } : null };
  }
  // draws the whole map screen the way screen_map should: paper, hexes, fog edge, overlays, token, then the frame
  function drawPage(g, W, H, page, o) {
    o = o || {};
    const z = pos(o.zoom, 1), size = BASE * z, t = num(o.t, 0), inner = M.frameInner(W, H);
    const cp = pxOf(page.pos.q, page.pos.r, BASE);
    // frame the painted area, the party and what is previewed: the middle of their bounding box
    let x0 = cp.x, x1 = cp.x, y0 = cp.y, y1 = cp.y;
    const grow = (q, r) => { const p2 = pxOf(q, r, BASE); x0 = Math.min(x0, p2.x); x1 = Math.max(x1, p2.x); y0 = Math.min(y0, p2.y); y1 = Math.max(y1, p2.y); };
    page.tiles.forEach((T) => { if (T.painted) grow(T.q, T.r); });
    (page.path || []).forEach((c) => grow(c[0], c[1]));
    (page.brush || []).forEach((c) => grow(c[0], c[1]));
    const camX = o.cx !== undefined ? o.cx : (x0 + x1) / 2, camY = o.cy !== undefined ? o.cy : (y0 + y1) / 2;
    const sx = (wx) => W / 2 + (wx - camX) * z, sy = (wy) => H / 2 + (wy - camY) * z;
    const scr = (q, r) => { const p2 = pxOf(q, r, BASE); return { x: sx(p2.x), y: sy(p2.y) }; };
    paper(g, W, H, camX, camY, z, { t });
    g.save(); g.beginPath(); g.rect(inner.x, inner.y, inner.w, inner.h); g.clip();
    const painted = (q, r) => { const T = page.at(q, r); return !!(T && T.painted); };
    const kindAt = (q, r) => { const T = page.at(q, r); if (!T) return 'off'; if (T.painted) return 'painted'; return T.type === 'block' ? 'void' : 'fog'; };
    const vis = page.tiles.filter((T) => { const c = scr(T.q, T.r); return c.x > inner.x - size * 1.2 && c.x < inner.x + inner.w + size * 1.2 && c.y > inner.y - size * 1.2 && c.y < inner.y + inner.h + size * 1.2; });
    vis.sort((a, b) => a.r - b.r || a.q - b.q);
    const cells = [];
    vis.forEach((T) => {
      const c = scr(T.q, T.r), seed = U.hash(T.q, T.r);
      let touch = false;
      for (let d = 0; d < 6; d++) if (painted(T.q + DIRS[d][0], T.r + DIRS[d][1])) touch = true;
      if (T.painted) {
        hex(g, 'painted', c.x, c.y, size, { tile: T.type, seed, done: T.done, t });
        const m = M.edgeMasks(T.q, T.r, kindAt);
        if (m.mask | m.voidMask) cells.push({ x: c.x, y: c.y, mask: m.mask, voidMask: m.voidMask });
      } else if (T.type === 'block') { if (touch) hex(g, 'block', c.x, c.y, size, { seed, t }); else hex(g, 'fog', c.x, c.y, size, { seed, t }); }
      else if (T.known) hex(g, 'known', c.x, c.y, size, { tile: T.type, seed, t });
      else if (touch) hex(g, 'edge', c.x, c.y, size, { seed, t });
      else hex(g, 'fog', c.x, c.y, size, { seed, t });
    });
    fogEdge(g, cells, size, t);
    if (page.path && page.path.length) {
      page.path.forEach((c) => { const q2 = scr(c[0], c[1]); hex(g, 'path', q2.x, q2.y, size, { t }); });
      const pts = [scr(page.pos.q, page.pos.r)].concat(page.path.map((c) => scr(c[0], c[1])));
      route(g, pts, t, { size, cost: page.path.length, affordable: true });
      const e = page.path[page.path.length - 1], ec = scr(e[0], e[1]); hex(g, 'target', ec.x, ec.y, size, { t });
    }
    if (page.hover) { const hc = scr(page.hover.q, page.hover.r); hex(g, 'hover', hc.x, hc.y, size, { t }); }
    if (page.brush && page.brush.length) brushPreview(g, page.brush.map((c) => scr(c[0], c[1])), size, o.brushValid !== false, t);
    const pc = scr(page.pos.q, page.pos.r);
    token(g, o.heroes || ['hanae', 'kuro'], pc.x, pc.y, t, !!o.moving, { size });
    g.restore();
    frame(g, W, H, t);
  }
  // fit a 1280 x 720 design into any sheet size
  function fitDesign(ctx, W, H, fn) {
    const k = Math.min(W / 1280, H / 720);
    ctx.save(); ctx.translate((W - 1280 * k) / 2, (H - 720 * k) / 2); ctx.scale(k, k); ctx.beginPath(); ctx.rect(0, 0, 1280, 720); ctx.clip(); fn(1280, 720); ctx.restore();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // gallery sheets
  // ---------------------------------------------------------------------------------------------------------------
  ART.sheet('map_kinds', (canvas, params) => {
    const t = num(params.t, 0);
    const cells = [];
    ['fog', 'edge', 'block', 'hover', 'target', 'path'].forEach((kd) => cells.push({ label: kd, kind: kd }));
    ['boss', 'shop', 'camp', 'forge', 'elite', 'chest'].forEach((tl) => cells.push({ label: 'known ' + tl, kind: 'known', tile: tl }));
    L.tiles.filter((x) => x !== 'block').forEach((tl) => { cells.push({ label: tl, kind: 'painted', tile: tl }); });
    ['enemy', 'chest', 'camp'].forEach((tl) => cells.push({ label: tl + ' done', kind: 'painted', tile: tl, done: true }));
    ART.sheetGrid(canvas, params, cells, (g, c, w, h, i) => {
      g.fillStyle = PAPER_BASE; g.fillRect(0, 0, w, h);
      const s = Math.min(w / 2.05, h / 2.2);
      if (c.kind === 'hover' || c.kind === 'target' || c.kind === 'path') hex(g, 'painted', w / 2, h / 2, s, { tile: 'empty', seed: i });
      hex(g, c.kind, w / 2, h / 2, s, { tile: c.tile, done: c.done, seed: i, t });
    }, { bg: 'paper', title: 'ART.map.hex: every kind and every tile wash (overlays hover, target, path shown over ground)', cols: 8 });
  });
  ART.sheet('map_page', (canvas, params) => {
    const g = canvas.getContext('2d'), W = num(params.w, 1600), H = num(params.h, 900);
    return loadMapModule().then((m) => {
      const page = samplePage(m);
      g.fillStyle = pal.night; g.fillRect(0, 0, W, H);
      fitDesign(g, W, H, (dw, dh) => drawPage(g, dw, dh, page, { zoom: num(params.zoom, 0.8), t: num(params.t, 0), moving: !!params.moving, cx: params.cx, cy: params.cy }));
    });
  });
  ART.sheet('map_frame', (canvas, params) => {
    const g = canvas.getContext('2d'), W = num(params.w, 1600), H = num(params.h, 900), t = num(params.t, 0);
    g.fillStyle = pal.night; g.fillRect(0, 0, W, H);
    fitDesign(g, W, H, (dw, dh) => {
      paper(g, dw, dh, 700, 400, 1, { t });
      frame(g, dw, dh, t);
      if (params.guides) {
        const i = M.frameInner(dw, dh);
        g.strokeStyle = 'rgba(0,255,200,0.9)'; g.lineWidth = 2; g.strokeRect(i.x, i.y, i.w, i.h);
        g.strokeStyle = 'rgba(255,60,120,0.9)'; g.strokeRect((dw - 1180) / 2, (dh - 640) / 2, 1180, 640);
      }
    });
  });
  ART.sheet('map_bloom', (canvas, params) => {
    const frames = [0.04, 0.14, 0.26, 0.4, 0.55, 0.7, 0.85, 1];
    const rows = [['enemy', 1], ['chest', 2], ['well', 3], ['boss', 4], [null, 5]];
    const cells = [];
    rows.forEach((rw) => frames.forEach((p) => cells.push({ label: (rw[0] || 'neutral') + ' p=' + p, tile: rw[0], p, seed: rw[1] })));
    ART.sheetGrid(canvas, params, cells, (g, c, w, h) => {
      g.fillStyle = PAPER_BASE; g.fillRect(0, 0, w, h);
      const s = Math.min(w / 2.3, h / 2.3);
      if (c.tile) { hex(g, 'fog', w / 2, h / 2, s, { seed: c.seed }); paintBloom(g, w / 2, h / 2, s, c.p, { tile: c.tile, seed: c.seed, fromX: w / 2 - s * 2, fromY: h / 2 - s * 0.4 }); }
      else { hex(g, 'painted', w / 2, h / 2, s, { tile: 'event', seed: c.seed }); paintBloom(g, w / 2, h / 2, s, c.p, { seed: c.seed }); }
    }, { bg: 'paper', cols: 8, title: 'ART.map.paintBloom film strip (touch point at the left edge; last row is the neutral overlay)' });
  });
  ART.sheet('map_token', (canvas, params) => {
    const pairs = [['hanae', 'kuro'], ['kuro', 'suzu'], ['suzu', 'raiga'], ['raiga', 'hanae']];
    const cells = [];
    pairs.forEach((pr) => [false, true].forEach((mv) => [1, 1.8].forEach((z) => cells.push({ label: pr.join('+') + (mv ? ' walk' : ' idle') + ' x' + z, pr, mv, z }))));
    const t = num(params.t, 0);
    ART.sheetGrid(canvas, params, cells, (g, c, w, h, i) => {
      g.fillStyle = PAPER_BASE; g.fillRect(0, 0, w, h);
      const s = Math.min(w / 2.1, h / 2.0);
      hex(g, 'painted', w / 2, h / 2, s, { tile: 'empty', seed: i });
      token(g, c.pr, w / 2, h / 2, t + i * 0.13, c.mv, { size: s, dir: i % 4 === 3 ? -1 : 1 });
    }, { bg: 'paper', cols: 8, title: 'ART.map.token: leader in front, second hero behind; idle bob and walk' });
  });
  ART.sheet('map_paper', (canvas, params) => {
    const g = canvas.getContext('2d'), W = num(params.w, 1600), H = num(params.h, 900), t = num(params.t, 0);
    const views = [[420, 700, 0.5], [420, 700, 1], [1500, 780, 0.6], [-300, 300, 0.8]];
    const cw = W / 2, ch = H / 2;
    views.forEach((v, i) => { g.save(); g.translate((i % 2) * cw, Math.floor(i / 2) * ch); g.beginPath(); g.rect(0, 0, cw - 2, ch - 2); g.clip(); paper(g, cw, ch, v[0], v[1], v[2] * Math.min(cw / 1280, ch / 720) * 1.6, { t }); g.restore(); });
  });
  ART.sheet('map_doodles', (canvas, params) => {
    const names = Object.keys(DOODLES);
    ART.sheetGrid(canvas, params, names, (g, id, w, h) => {
      g.fillStyle = PAPER_BASE; g.fillRect(0, 0, w, h);
      const d = DOODLES[id], k = Math.min(w / d.w, h / d.h) * 0.9;
      drawDoodle(g, id, w / 2, h / 2, k, 1, 0, 0.9);
    }, { bg: 'paper', cols: 4, title: 'ART.map.paper doodles (drawn at 0.9 alpha here; the page uses 0.2 to 0.34)' });
  });
})();
