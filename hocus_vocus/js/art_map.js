// Hocus Vocus: ART.map, the muted Gloss and the live hexes (extends ART from art.js; DESIGN 4.8 geometry, 5.6 signatures, HV_ART_AUDIO 7 look).
//
// The look: the Soundlands start muted. MUTED ground is the Gloss: an opalescent film, smooth, airbrushed, perfectly still, with a dotted outline
// (a rest), a diagonal glint like a phone screen catching the light and faint smoothed-over sketches of what lies underneath. Landmarks (boss shop
// camp forge elite chest) are spotted from the start and show their sticker as a pastel ghost under the film. LIVE ground is loud candy colour: the
// tile pigment filled flat, an even warm outline, one hard shadow on the lower left, a thin bounce highlight top right, the tile sticker on top and a
// faint sound ring. Live hexes near the party move a little (liveNear: Act I bunting and petals, Act II a tiny screen, Act III fairy bulbs, plus a
// sound ring every 4 to 6 s). The reveal is the Gloss film peeling away from a circular wavefront, pink and green sparkles riding the front, three
// sound rings escaping and a note rising.
//
// API (all safe with the headless no-op context, never throw for bad input, deterministic, no unseeded random). Hex geometry: pointy-top, `size` is the
// centre-to-corner radius (46 at zoom 1), (x, y) is the hex CENTRE. Everything below is in the caller's current transform.
//   ART.map.hex(ctx, kind, x, y, size, opts)       kind in DATA.LISTS.mapKinds: fog known ground block painted edge path hover target.
//        opts {tile, seed, done, t, near, chapter}: tile = LISTS.tiles id (colour and stamp; 'known' needs a landmark id), seed = U.hash(q, r), done fades
//        the stamp, near = true for a live hex within 3 of the party (liveNear: sway, flicker and a faint sound ring), the screen passes it for at most 19
//        hexes, chapter = 1 to 3 (default 1: the Act picks the live ground tone of bare Path hexes and the touches liveNear adds).
//        t = seconds (drives the live touches: camp and studio glow, gift glint, tea steam, headliner bulbs, edge and target marching dashes).
//        Cached per (kind, tile, done, seed % 8, size rung): sprites are baked on a ladder of sizes 12 percent apart and scaled, at most 8 new bakes per
//        frame (neighbour rung is scaled meanwhile), so a smooth zoom 0.6..2.0 never stalls. 'path' 'hover' 'target' are translucent overlays drawn
//        over the hex that is already there; 'edge' is a muted hex touching live ground (lit, pink to lime dashes: it can be unmuted); 'block' is the Blur.
//   ART.map.paintBloom(ctx, x, y, size, p, opts?)  the reveal, p 0..1. opts {tile, seed, fromX, fromY, ox, oy, note}. With opts.tile the live hex is revealed
//        inside a growing wavefront circle (draw the muted hex first) and the film curls back at the front; without it a neutral wash fades out over a hex
//        already live. fromX/fromY = where the wave starts from. Three rings escape the hex and a note rises (opts.note 0..6 tints it); p >= 1 draws the
//        settled live hex.
//   ART.map.token(ctx, heroIds, x, y, t, moving, opts?)  the two chibi tokens (ART.hero.draw scaled down, leader larger in front, second behind, each in
//        the outfit its owner chose), soft shadows, a sticker ring in the leader's colour, idle bob or walk cycle. opts {size, dir (1 or -1 faces right or
//        left), alpha, ring}.
//   ART.map.frame(ctx, w, h, t)                    the tour poster frame: indigo enamel, a pink to green pinstripe, a row of marquee bulbs chasing along the
//        top, four corner stickers and a pastel Gloss haze creeping in from the edges. Draw LAST; the window is transparent. ART.map.frameInner(w, h) ->
//        {x, y, w, h} (1280 x 720 gives 1192 x 648, at least the contractual 1180 x 640).
//   ART.map.paper(ctx, w, h, camX, camY, zoom, opts?)  the world ground in WORLD space ((camX, camY) = the world point at the view centre, hex size 46 at
//        zoom 1): the live ground tone of the Act in seamless cached chunks (about 6 opaque blits) and a sketchy pastel world in the margins and, faintly,
//        under the film (a tour van, a sleeping mic stand and gulls in Act I; phone screens in Act II; ring lights in Act III; loose notes everywhere).
//        opts {doodles:false, world:{x0,y0,x1,y1}, t, chapter 1..3}. ART.map.worldBox(opts) is the box the doodles are placed in.
//   ART.map.route(ctx, pts, t, opts?)              the dotted path preview: pts = [[x, y]] or [{x, y}] in screen px, a soft underlay, marching note heads
//        in cream with a pink outline, a destination ring and the Vox cost pill. opts {size, cost | label, affordable (false = red, shaking pill), pill:false, alpha}.
//   ART.map.brushPreview(ctx, hexes, size, valid, t)  the cells a Spell would unmute (hexes = centres) as one shape with marching sparkle dashes, ring
//        pulses, a sine sheen; valid is mint, invalid is soft red with an X. ART.map.brushEdges(hexes, size) -> {inner, outer} side segments.
//   ART.map.fogEdge(ctx, cells, size, t, opts?)    the seam where live ground meets muted ground (a glowing seam of sparkles under the curled edge of the
//        Gloss film, and a darker opalescent rim where it meets the Blur): cells = [{x, y, mask, voidMask}] for LIVE hexes, bit d of mask = the neighbour
//        across side d (MAP.DIRS order) is muted, of voidMask is the Blur. ART.map.edgeMasks(q, r, kindAt) builds both masks from a predicate returning
//        'fog' | 'void' | anything else. Draw it after the hexes.
// Extras for screens and tests: ART.map.warm(size, {tiles, done, ms, chapter}) pre-bakes the sprites of a size (call on screen load), ART.map.bakedSize(size),
// ART.map.info(), ART.map.corners(x, y, size), ART.map.washOf(tile), ART.map.geom.
//
// Gallery sheets: map_kinds (every kind and tile colour, muted versus live, the Path hex in all three Acts), map_page (a MAP.generate page, part live,
// with fog edge, token, route, brush preview and hover; params zoom t cx cy moving chapter), map_frame (guides=1 outlines the window and the 1180 x 640
// minimum), map_bloom (film strip), map_token, map_paper (all three Acts), map_doodles. Draw order for a screen: paper, hexes (row by row), fogEdge,
// path/target/hover overlays, route, brushPreview, token, frame.
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
  const chapterOf = (c) => { const n = Math.round(num(c, 1)); return n < 1 ? 1 : n > 3 ? 3 : n; };

  // the house colours of the map: the warm outline of the cast, the sticker cream, the Gloss tokens (bible 3.6) and the candy accents
  const LINE = '#2d170f', CREAM = '#fff8ec';
  const OPAL = '#ece9f4', OPAL_HI = '#fbf9ff', LILAC = '#e6d9ff', MINT_SHEEN = '#d9fff4', BLUSH_SHEEN = '#ffe3f1', CHROME = '#c9cbd6';
  const REST = '#b9b3cc', SMUDGE = '#cfc9e2';
  const PINK = '#ff7eb6', HOT = '#ff4fa0', GREEN = '#3fcf6a', LIME = '#c6ff3d', GOLD = '#ffd84d';

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
  // colour table: the candy pigment of every tile type (HV_ART_AUDIO 7). c = the pigment; glyph = the id of the decoration drawn behind the sticker
  // ---------------------------------------------------------------------------------------------------------------
  const WASH = {
    empty: { c: '#f6d9a6', glyph: 'tufts' },
    start: { c: '#ffd84d', glyph: 'star' },
    enemy: { c: '#e8553f', glyph: 'splat' },
    elite: { c: '#ff4fa0', glyph: 'gilt' },
    boss: { c: '#ffd84d', glyph: 'crown' },
    chest: { c: '#ff7eb6', glyph: 'rays' },
    shop: { c: '#2ec4b6', glyph: 'noren' },
    camp: { c: '#3fcf6a', glyph: 'glowwarm' },
    event: { c: '#a77bff', glyph: 'wisps' },
    well: { c: '#8fe3c0', glyph: 'rings' },
    brush: { c: '#7cc6ff', glyph: 'notes' },
    gemcache: { c: '#c49bff', glyph: 'glints' },
    forge: { c: '#ff9a2e', glyph: 'embers' },
    block: { c: '#e6d9ff', glyph: 'void' },
  };
  const washOf = (tile) => WASH[tile] || WASH.empty;
  // bare Path ground by Act (the live ground tone of paper): Act I sand and cobbles, Act II midnight asphalt with neon, Act III mirror-white stage tiles
  const GROUND = { 1: '#f6d9a6', 2: '#33377a', 3: '#fdf0f7' };

  // ---------------------------------------------------------------------------------------------------------------
  // shape helpers
  // ---------------------------------------------------------------------------------------------------------------
  // A crisp hex outline with a hand-drawn edge: dense control points, each side bowed a little (amp is the bow as a share of s), corners
  // nudged and cut so they read as soft. r is a seeded stream.
  function hexRing(cx, cy, s, r, amp) {
    const C = [];
    for (let i = 0; i < 6; i++) { const a = cornerAng(i), jr = 1 + (r() - 0.5) * amp * 1.2; C.push([cx + Math.cos(a) * s * jr, cy + Math.sin(a) * s * jr]); }
    const pts = [], cut = 0.07;
    for (let i = 0; i < 6; i++) {
      const P = C[i], N = C[(i + 1) % 6], am = (cornerAng(i) + cornerAng(i + 1)) / 2, nx = Math.cos(am), ny = Math.sin(am);
      const bow = (r() - 0.5) * 2 * amp * s, wob = (r() - 0.5) * amp * s * 0.6;
      const n = 5;
      for (let j = 0; j <= n; j++) {
        const u = lerp(cut, 1 - cut, j / n), off = bow * Math.sin(PI * u) + wob * Math.sin(TAU * u + i);
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
  const softDisc = (g, x, y, rad, col, a) => { g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fillStyle = A(col, a); g.fill(); };
  // an airbrushed spot: a radial fade from col at alpha a to nothing
  function airbrush(g, x, y, rad, col, a) {
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, A(col, a)); gr.addColorStop(1, A(col, 0));
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // a diagonal glint like a phone screen catching the light: a soft white band and a thin bright line beside it (off in units of s across the band)
  function glint(g, cx, cy, s, off, a) {
    g.save(); g.translate(cx, cy); g.rotate(0.62);
    const lw = s * 0.3, x0 = off * s;
    let gr = g.createLinearGradient(x0 - lw, 0, x0 + lw, 0);
    gr.addColorStop(0, A('#ffffff', 0)); gr.addColorStop(0.5, A('#ffffff', a)); gr.addColorStop(1, A('#ffffff', 0));
    g.fillStyle = gr; g.fillRect(x0 - lw, -s * 2.4, lw * 2, s * 4.8);
    g.fillStyle = A('#ffffff', a * 0.9); g.fillRect(x0 + lw * 0.95, -s * 2.4, Math.max(1, s * 0.035), s * 4.8);
    g.restore();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // muted: the Gloss. A baked opal film, still: nothing here depends on t
  // ---------------------------------------------------------------------------------------------------------------
  function stitches(g, cx, cy, s, r, col, a, k) {
    const inset = s * 0.8, n = 5;
    for (let d = 0; d < 6; d++) {
      const c0 = SIDE_CORNERS[d][0], c1 = SIDE_CORNERS[d][1];
      const ax = cx + Math.cos(cornerAng(c0)) * inset, ay = cy + Math.sin(cornerAng(c0)) * inset;
      const bx = cx + Math.cos(cornerAng(c1)) * inset, by = cy + Math.sin(cornerAng(c1)) * inset;
      for (let i = 0; i < n; i++) {
        const u0 = (i + 0.14) / n, u1 = (i + 0.5) / n, j = (r() - 0.5) * 0.7 * k;
        const x0 = lerp(ax, bx, u0), y0 = lerp(ay, by, u0) + j, x1 = lerp(ax, bx, u1), y1 = lerp(ay, by, u1) + j;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1);
        g.lineWidth = 1.8 * k; g.lineCap = 'round'; g.strokeStyle = A('#ffffff', a * 0.85); g.stroke();       // the dotted rest's light edge
        g.beginPath(); g.moveTo(x0, y0 + 0.5 * k); g.lineTo(x1, y1 + 0.5 * k);
        g.lineWidth = 1.2 * k; g.strokeStyle = A(col, a); g.stroke();
      }
    }
  }
  // faint smoothed-over sketches of what is underneath, in a lilac smudge: a sleeping mic stand, rooftops, notes, a phone, sound waves, the Gloss smile
  function sketch(g, cx, cy, s, kind, k) {
    const P = (pts) => pts.map((q) => [cx + q[0] * s / 46, cy + q[1] * s / 46]), ln = (pts, w, o) => tk.inkPath(g, P(pts), Object.assign({ w: w * k, color: SMUDGE, alpha: 0.9, taper: 0.35, wobble: 0.08, seed: kind }, o));
    if (kind === 1) {
      ln([[-2, 14], [-2, -6]], 1.6); ln([[-10, 14], [6, 14]], 1.6);
      tk.inkPath(g, P(tk.ellipsePts(-2, -12, 6, 7, 10)), { closed: true, w: 1.5 * k, color: SMUDGE, alpha: 0.9, wobble: 0.05, tension: 0.6 });
      ln([[-5, -12], [-3.4, -10.6], [-1.6, -12]], 1.1); ln([[1, -12], [2.6, -10.6], [4.4, -12]], 1.1);
    } else if (kind === 2) {
      [[-14, 6, 10], [0, 4, 12], [14, 7, 9]].forEach((hh) => ln([[hh[0] - 7, 14], [hh[0] - 7, hh[1]], [hh[0], hh[1] - hh[2] * 0.6], [hh[0] + 7, hh[1]], [hh[0] + 7, 14]], 1.4, { taper: 0.1 }));
      ln([[-24, 14], [24, 14]], 1.2, { taper: 0.1 });
    } else if (kind === 4) {
      tk.note(g, cx - 6 * s / 46, cy + 4 * s / 46, 8 * k, { kind: 'eighth', color: SMUDGE, alpha: 0.9 }); tk.note(g, cx + 9 * s / 46, cy + 8 * s / 46, 6 * k, { kind: 'quarter', color: SMUDGE, alpha: 0.9 });
    } else if (kind === 5) {
      tk.inkPath(g, P(tk.rrectPts(-8, -14, 16, 28, 4)), { closed: true, w: 1.5 * k, color: SMUDGE, alpha: 0.9, wobble: 0.05, tension: 0.5 });
      ln([[-3, 9], [3, 9]], 1.1);
      tk.inkPath(g, P(tk.ellipsePts(0, -2, 3.2, 3, 8)), { closed: true, w: 1.1 * k, color: SMUDGE, alpha: 0.9, wobble: 0.04, tension: 0.6 });
    } else if (kind === 7) {
      [7, 13, 19].forEach((rr, i) => { g.beginPath(); g.arc(cx - 8 * s / 46, cy + 6 * s / 46, rr * s / 46, -0.9, 0.5); g.lineWidth = (1.5 - i * 0.2) * k; g.lineCap = 'round'; g.strokeStyle = A(SMUDGE, 0.9); g.stroke(); });
    } else if (kind === 3) {                                          // the one shared Gloss smile
      g.beginPath(); g.arc(cx, cy - 3 * s / 46, 9 * s / 46, 0.18 * PI, 0.82 * PI); g.lineWidth = 1.9 * k; g.lineCap = 'round'; g.strokeStyle = A(SMUDGE, 0.95); g.stroke();
    }
  }
  function fogSprite(g, w, h, s, v, lit, noSketch, under) {
    const cx = w / 2, cy = h / 2, k = s / BASE, r = R('fog', v);
    const ring = hexRing(cx, cy, s * 0.995, R('ring', v), 0.012);
    g.save(); clipRing(g, ring);
    g.fillStyle = A(OPAL, 0.93); g.fillRect(0, 0, w, h);
    if (under) under(g);
    // airbrushed inner shadow, deepest at the lower left (away from the light)
    const gr = g.createRadialGradient(cx + s * 0.34, cy - s * 0.4, s * 0.25, cx + s * 0.34, cy - s * 0.4, s * 1.55);
    gr.addColorStop(0, A('#b9b0dc', 0)); gr.addColorStop(0.6, A('#b9b0dc', 0.1)); gr.addColorStop(1, A('#a79dd0', 0.4));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // the opal sheen: blush and lilac and mint, airbrushed, a different mix per variant
    airbrush(g, cx - s * (0.35 + 0.08 * (v % 3)), cy - s * 0.3, s * 0.62, BLUSH_SHEEN, 0.7);
    airbrush(g, cx + s * 0.4, cy + s * (0.3 + 0.06 * (v % 2)), s * 0.6, MINT_SHEEN, 0.7);
    airbrush(g, cx + s * 0.05, cy - s * 0.1, s * 0.5, LILAC, 0.35);
    if (!noSketch && !tk.lowQ() && v !== 0 && v !== 6) sketch(g, cx + (r() - 0.5) * s * 0.2, cy + (r() - 0.5) * s * 0.16, s, v, k);
    glint(g, cx, cy, s, ((v % 4) - 1.5) * 0.2, 0.55);
    if (lit) {                                                        // the next hex you can unmute: warmed pink at the middle, lime at the rim
      airbrush(g, cx, cy, s * 0.95, '#ffd0e6', 0.5);
      g.beginPath(); traceRing(g, ring); g.lineWidth = s * 0.2; g.lineJoin = 'round'; g.strokeStyle = A(LIME, 0.14); g.stroke();
    }
    g.restore();
    stitches(g, cx, cy, s, r, lit ? '#d58fb4' : REST, lit ? 0.8 : 0.7, k);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // the sticker on a hex: the tile icon (ART.icon) once real icon art exists, else a round sticker of our own (cream rim, warm line, a simple drawing),
  // so the map is readable and beautiful before (and without) art_icons.js. The painters draw in a 100 unit box centred on the sticker.
  // ---------------------------------------------------------------------------------------------------------------
  const STICKER = { start: '#ffd84d', enemy: '#e8553f', elite: '#ff4fa0', boss: '#2d2a78', chest: '#ff7eb6', shop: '#2ec4b6', camp: '#3fcf6a', event: '#a77bff', well: '#8fe3c0', brush: '#7cc6ff', gemcache: '#c49bff', forge: '#ff9a2e' };
  const STAR = (cx, cy, ro, ri, n, rot) => { const pts = []; for (let i = 0; i < n * 2; i++) { const a = rot + i * PI / n, rr = i % 2 ? ri : ro; pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 1]); } return pts; };
  const GLYPH = {
    start(S, F, C) {                                                   // the little tour van with a mic stand beside it
      S([[-31, 27], [-31, -12]], 3); S([[-39, 27], [-23, 27]], 3.2); C(-31, -18, 6, CREAM, 1.8);
      F([[-21, 8], [-21, -10], [-13, -21], [17, -21], [27, -5], [32, -3], [32, 16], [-21, 16]], '#ff7eb6', 2.4, true);
      F([[-17, -8], [-11, -17], [2, -17], [2, -5], [-17, -5]], '#cdeeff', 1.5, true); F([[7, -17], [15, -17], [22, -6], [7, -6]], '#cdeeff', 1.5, true);
      S([[-21, 7], [32, 7]], 3.4, '#3fcf6a'); C(-10, 18, 6, LINE); C(-10, 18, 2.4, CREAM); C(21, 18, 6, LINE); C(21, 18, 2.4, CREAM);
    },
    enemy(S, F, C) {                                                   // two crossed mics
      [[1, 1], [-1, 1]].forEach((d) => { S([[d[0] * 26, 26], [-d[0] * 12, -12]], 10, LINE); S([[d[0] * 26, 26], [-d[0] * 12, -12]], 5.4, CREAM); C(-d[0] * 19, -19, 10, '#dfe3ef', 2.4); S([[-d[0] * 25, -19], [-d[0] * 13, -19]], 1.2, '#9a9fb8'); S([[-d[0] * 19, -26], [-d[0] * 19, -12]], 1.2, '#9a9fb8'); });
    },
    elite(S, F, C) {                                                   // a star with a frown
      F(STAR(0, 2, 36, 17, 5, -PI / 2), '#ffd84d', 2.6, true); C(-9, -3, 3.6, LINE); C(9, -3, 3.6, LINE); S([[-10, 16], [0, 8], [10, 16]], 3);
      S([[-14, -11], [-6, -8]], 2.4); S([[14, -11], [6, -8]], 2.4);
    },
    boss(S, F, C) {                                                    // a big marquee star with light bulbs
      for (let i = 0; i < 10; i++) { const a = i * TAU / 10 + 0.15; C(Math.cos(a) * 36, Math.sin(a) * 36, 3.2, CREAM, 1); }
      F(STAR(0, 1, 30, 14, 5, -PI / 2), '#ffd84d', 2.8, true); F(STAR(0, 1, 15, 7, 5, -PI / 2), '#fff3a8', 0, true);
    },
    chest(S, F, C) {                                                   // a ribboned box with a heart tag
      F([[-26, -6], [26, -6], [26, 26], [-26, 26]], '#fff8ec', 2.6, true); F([[-30, -18], [30, -18], [30, -6], [-30, -6]], '#ffe3f1', 2.4, true);
      S([[0, -18], [0, 26]], 8, '#ffd84d');
      F([[0, -18], [-14, -34], [-22, -26], [-10, -18]], '#ffd84d', 2, true); F([[0, -18], [14, -34], [22, -26], [10, -18]], '#ffd84d', 2, true);
      F([[14, 26], [5, 17], [5, 10], [10, 8], [14, 12], [18, 8], [23, 10], [23, 17]], '#e8383d', 2, false);
    },
    shop(S, F, C) {                                                    // a teal stall with a tote bag and a T-shirt
      for (let i = 0; i < 5; i++) F([[-30 + i * 12, -26], [-18 + i * 12, -26], [-18 + i * 12, -14], [-30 + i * 12, -14]], i % 2 ? '#2ec4b6' : CREAM, 1.6, true);
      F([[-28, -14], [28, -14], [28, 26], [-28, 26]], '#17948a', 2.4, true); S([[-28, 8], [28, 8]], 2.6, CREAM);
      F([[-20, -4], [-8, -4], [-8, 6], [-20, 6]], '#ffd84d', 1.6, true); S([[-17, -4], [-17, -9], [-11, -9], [-11, -4]], 1.6);
      F([[6, -8], [11, -4], [16, -4], [21, -8], [24, 0], [19, 2], [19, 6], [8, 6], [8, 2], [3, 0]], '#ff7eb6', 1.6, true);
    },
    camp(S, F, C) {                                                    // a green backstage tent with a star on the door
      F([[-34, 26], [0, -30], [34, 26]], '#fff8ec', 2.8, true); F([[-12, 26], [0, -2], [12, 26]], '#17642e', 2, true);
      F(STAR(0, 12, 6, 2.6, 5, -PI / 2), '#ffd84d', 0, true); S([[-38, 27], [38, 27]], 3); S([[0, -30], [0, -38]], 2.4); F([[0, -38], [10, -35], [0, -32]], '#ff7eb6', 1.4, true);
    },
    event(S, F, C) {                                                   // a bent arrow sign with a question mark
      S([[-4, 30], [-4, -2]], 5, LINE); S([[-4, 30], [-4, -2]], 2.4, '#d8c9ff');
      F([[-28, -30], [14, -30], [30, -17], [14, -4], [-28, -4]], '#fff8ec', 2.6, true);
      S([[-12, -24], [-6, -28], [2, -25], [-1, -18], [-5, -14]], 2.6); C(-5, -8, 1.8, LINE);
    },
    well(S, F, C) {                                                    // a steaming cup on a little cart
      S([[-34, 14], [34, 14]], 3.4); F([[-24, 14], [24, 14], [24, 24], [-24, 24]], '#fff8ec', 2.4, true); C(-14, 28, 5.6, LINE); C(-14, 28, 2.2, CREAM); C(14, 28, 5.6, LINE); C(14, 28, 2.2, CREAM);
      F([[-14, -8], [14, -8], [11, 14], [-11, 14]], '#fff8ec', 2.6, true); S([[14, -4], [24, -2], [22, 8], [12, 8]], 2.4);
      S([[-6, -14], [-10, -22], [-4, -28]], 2, '#ffffff'); S([[4, -14], [0, -22], [6, -30]], 2, '#ffffff');
    },
    brush(S, F, C) {                                                   // an open hat with a sparkle
      F([[-28, 4], [28, 4], [20, 24], [-20, 24]], '#ff9a2e', 2.6, true); F([[-28, 4], [28, 4], [24, 12], [-24, 12]], '#ffd84d', 0, true);
      S([[-24, 4], [-12, 0], [0, -1], [12, 0], [24, 4]], 2.4);              // the open lip of the hat
      F(STAR(0, -20, 14, 4.4, 4, -PI / 2), '#fff3a8', 2, true); F(STAR(-18, -8, 7, 2.4, 4, -PI / 2), '#ffffff', 1.4, true);
    },
    gemcache(S, F, C) {                                                // a booth of glittering stones
      F([[-32, -10], [-24, -28], [24, -28], [32, -10]], '#fff8ec', 2.6, true); S([[-22, -10], [-22, 26]], 2.6); S([[22, -10], [22, 26]], 2.6);
      F([[-14, 6], [-7, -2], [0, 6], [-7, 16]], '#ff7eb6', 1.8, true); F([[2, 8], [9, 0], [16, 8], [9, 18]], '#7cc6ff', 1.8, true); F([[-6, 22], [0, 16], [6, 22], [0, 28]], '#fff8ec', 1.6, true);
      F(STAR(0, -14, 8, 2.6, 4, -PI / 2), '#fff3a8', 1.4, true);
    },
    forge(S, F, C) {                                                   // a door with an ON AIR light
      F([[-20, -4], [20, -4], [20, 30], [-20, 30]], '#fff8ec', 2.8, true); C(12, 14, 2.4, '#ffd84d', 1.2);
      F([[-26, -26], [26, -26], [26, -10], [-26, -10]], '#e8383d', 2.8, true); C(-14, -18, 3.2, CREAM); C(0, -18, 3.2, CREAM); C(14, -18, 3.2, CREAM);
      S([[-34, -30], [-30, -34]], 2, '#ffffff'); S([[34, -30], [30, -34]], 2, '#ffffff');
    },
  };
  // the painters get three tools: S (an ink stroke), F (a filled shape, outline width w, sharp corners), C (a circle, outline width w); ghost = one flat colour
  function glyphTools(g, cx, cy, u, ghost) {
    const P = (pts) => pts.map((q) => (q[2] ? [cx + q[0] * u, cy + q[1] * u, 1] : [cx + q[0] * u, cy + q[1] * u]));
    return [
      (pts, w, col) => tk.inkPath(g, P(pts), { w: w * u, color: ghost || col || LINE, taper: 0.2, wobble: 0.06, seed: 2 }),
      (pts, col, w, sharp) => {
        const shape = sharp ? { poly: P(pts) } : P(pts);
        g.beginPath(); tk.trace(g, shape, 0, 0, 0.5); g.fillStyle = ghost || col || LINE; g.fill();
        if (w && !ghost) tk.inkPath(g, shape, { closed: true, w: w * u, color: LINE, wobble: 0.04, weightVar: 0.15, tension: 0.5, align: 0 });
      },
      (x, y, r, col, w) => {
        g.beginPath(); g.arc(cx + x * u, cy + y * u, Math.max(0.1, r * u), 0, TAU); g.fillStyle = ghost || col || LINE; g.fill();
        if (w && !ghost) { g.lineWidth = w * u; g.strokeStyle = LINE; g.stroke(); }
      },
    ];
  }
  function stickerDisc(g, cx, cy, rr, col, u) {
    g.beginPath(); g.arc(cx + 1.4 * u, cy + 3 * u, rr, 0, TAU); g.fillStyle = 'rgba(20,10,40,0.3)'; g.fill();
    g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.fillStyle = CREAM; g.fill();
    tk.celCircle(g, cx, cy, rr - 3.6 * u, col, { line: 1.9 * u, lineColor: LINE, depth: 5 * u, hi: true, hiW: 1.6 * u, seed: 5 });
  }
  function fallbackStamp(g, tile, cx, cy, size, done) {
    const u = size / 100, rr = 43 * u;
    g.save();
    if (done) g.globalAlpha = g.globalAlpha * 0.42;
    stickerDisc(g, cx, cy, rr, STICKER[tile] || '#cfcdd8', u);
    const glyph = GLYPH[tile];
    if (glyph) { const T = glyphTools(g, cx, cy, u * 0.9); glyph(T[0], T[1], T[2]); }
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
  // live: candy colour. Decorations sit behind the sticker (baked, still), then the hard shadow, the bounce highlight, the sound ring and the outline
  // ---------------------------------------------------------------------------------------------------------------
  const DECOR = {
    tufts(g, s, r, c, k, cx, cy, ch) {                                 // bare Path ground: cobbles (Act I), asphalt and neon (Act II), mirror tiles (Act III)
      if (ch === 2) {                                                  // neon reflections: short slanted streaks in pink and cyan, a broken lane line, specks of light
        g.lineCap = 'round';
        const ang = -0.9 + r() * 0.5;
        [['#ff4fa0', 0.5], ['#4fe8ff', 0.42], ['#a77bff', 0.35]].forEach((p, i) => {
          const x = cx + (r() - 0.5) * s * 1.1, y = cy + (r() - 0.5) * s * 1.1, len = s * (0.3 + r() * 0.3);
          tk.inkPath(g, [[x - Math.cos(ang) * len, y - Math.sin(ang) * len], [x + Math.cos(ang) * len, y + Math.sin(ang) * len]], { w: s * (0.07 + r() * 0.05), color: p[0], alpha: p[1], taper: 0.45, wobble: 0.05, seed: i });
        });
        const la = r() * PI, lx = cx + (r() - 0.5) * s * 0.3, ly = cy + (r() - 0.5) * s * 0.3;
        for (let i = -1; i <= 1; i++) tk.inkPath(g, [[lx + Math.cos(la) * (i * s * 0.42 - s * 0.1), ly + Math.sin(la) * (i * s * 0.42 - s * 0.1)], [lx + Math.cos(la) * (i * s * 0.42 + s * 0.1), ly + Math.sin(la) * (i * s * 0.42 + s * 0.1)]], { w: Math.max(1.2, 2.4 * k), color: '#ffd84d', alpha: 0.6, taper: 0.1, wobble: 0 });
        for (let i = 0; i < 12; i++) softDisc(g, cx + (r() - 0.5) * s * 1.5, cy + (r() - 0.5) * s * 1.6, (0.6 + r() * 0.9) * k, '#bfc4ff', 0.5);
      } else if (ch === 3) {
        g.lineWidth = Math.max(1.2, 1.6 * k); g.strokeStyle = A('#ff7eb6', 0.38);
        g.beginPath(); g.moveTo(cx - s, cy); g.lineTo(cx + s, cy); g.moveTo(cx, cy - s); g.lineTo(cx, cy + s); g.stroke();
        glint(g, cx, cy, s, (r() - 0.5) * 0.9, 0.5);
        for (let i = 0; i < 2; i++) tk.sparkle(g, cx + (r() - 0.5) * s * 1.2, cy + (r() - 0.5) * s * 1.2, (2.4 + r() * 2.2) * k, { color: '#ffffff', glow: 0, alpha: 0.95 });
      } else {
        for (let i = 0; i < 8; i++) {                                    // cobbles
          const x = cx + (r() - 0.5) * s * 1.35, y = cy + (r() - 0.5) * s * 1.5, rx = (4.4 + r() * 3) * k, ry = rx * (0.62 + r() * 0.18);
          g.beginPath(); g.ellipse(x, y, rx, ry, (r() - 0.5) * 0.5, 0, TAU); g.fillStyle = A('#e6bd80', 0.55); g.fill();
          g.lineWidth = 1 * k; g.strokeStyle = A('#c9965a', 0.5); g.stroke();
          g.beginPath(); g.ellipse(x - rx * 0.25, y - ry * 0.3, rx * 0.4, ry * 0.25, 0, 0, TAU); g.fillStyle = A('#fff6dc', 0.5); g.fill();
        }
        for (let i = 0; i < 3; i++) { const fx = cx + (i - 1) * s * 0.34, fy = cy + (1 - i) * s * 0.24; softDisc(g, fx, fy, 2.3 * k, CREAM, 0.85); softDisc(g, fx + 3.8 * k, fy + 1.5 * k, 1.7 * k, CREAM, 0.75); }   // a trail of footprints
      }
    },
    star(g, s, r, c, k, cx, cy) { for (let i = 0; i < 6; i++) tk.sparkle(g, cx + (r() - 0.5) * s * 1.4, cy + (r() - 0.5) * s * 1.4, (2 + r() * 3) * k, { color: CREAM, glow: 0, alpha: 0.9 }); },
    splat(g, s, r, c, k, cx, cy) { for (let i = 0; i < 9; i++) softDisc(g, cx + (r() - 0.5) * s * 1.5, cy + (r() - 0.5) * s * 1.6, (1.4 + r() * 2.2) * k, '#ff8f7c', 0.7); },
    gilt(g, s, r, c, k, cx, cy) { for (let i = 0; i < 6; i++) { const a = cornerAng(i); tk.sparkle(g, cx + Math.cos(a) * s * 0.76, cy + Math.sin(a) * s * 0.76, 3.6 * k, { color: GOLD, glow: 0, alpha: 1 }); } },
    crown(g, s, r, c, k, cx, cy) {                                     // a sunburst behind the marquee star
      g.fillStyle = A('#fff3a8', 0.7);
      for (let i = 0; i < 12; i++) { const a = i * TAU / 12; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a - 0.1) * s * 1.1, cy + Math.sin(a - 0.1) * s * 1.1); g.lineTo(cx + Math.cos(a + 0.1) * s * 1.1, cy + Math.sin(a + 0.1) * s * 1.1); g.closePath(); g.fill(); }
    },
    rays(g, s, r, c, k, cx, cy) { g.fillStyle = A('#ffe3f1', 0.55); for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + 0.2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a - 0.11) * s, cy + Math.sin(a - 0.11) * s); g.lineTo(cx + Math.cos(a + 0.11) * s, cy + Math.sin(a + 0.11) * s); g.fill(); } },
    noren(g, s, r, c, k, cx, cy) {                                     // a string of cream and gold pennants across the top of the stall
      g.beginPath(); g.moveTo(cx - s * 0.78, cy - s * 0.6); g.quadraticCurveTo(cx, cy - s * 0.3, cx + s * 0.78, cy - s * 0.6); g.lineWidth = 1 * k; g.strokeStyle = A('#0e6a62', 0.8); g.stroke();
      for (let i = 0; i < 6; i++) {
        const u = (i + 0.5) / 6, x = lerp(cx - s * 0.78, cx + s * 0.78, u), y = lerp(cy - s * 0.6, cy - s * 0.6, u) + Math.sin(PI * u) * s * 0.15;
        g.beginPath(); g.moveTo(x - 3.6 * k, y); g.lineTo(x + 3.6 * k, y); g.lineTo(x, y + 8 * k); g.closePath(); g.fillStyle = A(i % 2 ? '#ffd84d' : CREAM, 0.95); g.fill();
      }
    },
    glowwarm(g, s, r, c, k, cx, cy) {                                  // fairy lights strung across the top, and a warm glow
      airbrush(g, cx, cy + s * 0.1, s * 0.9, '#fff0b0', 0.8);
      g.beginPath(); g.moveTo(cx - s * 0.8, cy - s * 0.62); g.quadraticCurveTo(cx, cy - s * 0.32, cx + s * 0.8, cy - s * 0.62); g.lineWidth = 1 * k; g.strokeStyle = A('#17642e', 0.7); g.stroke();
      for (let i = 0; i < 5; i++) { const u = (i + 0.5) / 5, x = lerp(cx - s * 0.8, cx + s * 0.8, u), y = lerp(cy - s * 0.62, cy - s * 0.62, u) + Math.sin(PI * u) * s * 0.15; softDisc(g, x, y, 2.4 * k, i % 2 ? '#ffd84d' : '#ff7eb6', 1); }
    },
    wisps(g, s, r, c, k, cx, cy) { for (let i = 0; i < 3; i++) { const a = r() * TAU; tk.inkPath(g, [[cx + Math.cos(a) * s * 0.3, cy + Math.sin(a) * s * 0.3], [cx + Math.cos(a + 1) * s * 0.55, cy + Math.sin(a + 1) * s * 0.55], [cx + Math.cos(a + 2) * s * 0.75, cy + Math.sin(a + 2) * s * 0.75]], { w: 1.6 * k, color: '#efe6ff', alpha: 0.7, taper: 0.4, seed: i }); } },
    rings(g, s, r, c, k, cx, cy) { [0.56, 0.70, 0.84].forEach((m, i) => { g.beginPath(); g.arc(cx, cy + s * 0.02, s * m, 0, TAU); g.lineWidth = 1.5 * k; g.strokeStyle = A('#ffffff', [0.7, 0.5, 0.32][i]); g.stroke(); }); },
    notes(g, s, r, c, k, cx, cy) { for (let i = 0; i < 3; i++) tk.note(g, cx + (r() - 0.5) * s * 1.1, cy + (r() - 0.3) * s * 0.9, (7 + r() * 3) * k, { kind: i === 1 ? 'quarter' : 'eighth', color: CREAM, alpha: 0.85 }); },
    glints(g, s, r, c, k, cx, cy) { for (let i = 0; i < 5; i++) tk.sparkle(g, cx + (r() - 0.5) * s * 1.3, cy + (r() - 0.5) * s * 1.3, (2.5 + r() * 3) * k, { color: '#ffffff', glow: 0, alpha: 0.95 }); },
    embers(g, s, r, c, k, cx, cy) { for (let i = 0; i < 9; i++) softDisc(g, cx + (r() - 0.5) * s * 1.4, cy + (r() - 0.4) * s * 1.4, (0.9 + r() * 1.6) * k, i % 2 ? '#ffe28a' : '#ff4fa0', 0.85); },
    void() {},
  };

  const BULB_R = 0.83;                                                // the Headliner's marquee bulbs sit on a ring this far out (in hex radii)
  function paintedSprite(g, w, h, s, tile, done, v, ch) {
    const spec = washOf(tile), cx = w / 2, cy = h / 2, k = s / BASE, r = R('wash', tile, v, ch);
    const boss = tile === 'boss', hue = tile === 'empty' ? (GROUND[ch] || GROUND[1]) : spec.c;
    const base = done ? mixc(hue, '#fff6ea', 0.58) : hue, dark = tk.shade(base, 0.32);
    const ring = hexRing(cx, cy, s * 0.985, R('ring', v), 0.014), box = [0, 0, w, h];
    // 1. the flat colour
    fillRing(g, ring, base);
    g.save(); clipRing(g, ring);
    // 2. what is going on behind the sticker
    if (!done && DECOR[spec.glyph]) DECOR[spec.glyph](g, s, r, { c: hue, d: dark }, k, cx, cy, ch);
    // 3. one hard shadow on the lower left edge (the key light is upper right)
    g.save(); clipCrescent(g, ring, box, LX * s * 0.14, LY * s * 0.14);
    g.fillStyle = A(dark, done ? 0.55 : 0.9); g.fillRect(0, 0, w, h);
    g.restore();
    // 4. a thin bounce highlight on the upper right edge
    g.save(); clipCrescent(g, ring, box, -LX * s * 0.07, -LY * s * 0.07);
    g.fillStyle = A(tk.tint(base, 0.55), done ? 0.5 : 0.85); g.fillRect(0, 0, w, h);
    g.restore();
    // 5. a faint sound ring round the sticker (one fainter ring on bare ground)
    g.lineWidth = 1.5 * k;
    if (tile !== 'empty') [[0.62, 0.45], [0.78, 0.26]].forEach((p) => { g.beginPath(); g.arc(cx, cy + s * 0.02, s * p[0], 0, TAU); g.strokeStyle = A('#ffffff', p[1] * (done ? 0.6 : 1)); g.stroke(); });
    else { g.beginPath(); g.arc(cx, cy + s * 0.02, s * 0.7, 0, TAU); g.strokeStyle = A('#ffffff', ch === 2 ? 0.12 : 0.2); g.stroke(); }
    g.restore();
    // 6. the sticker on top
    if (tile !== 'empty') stamp(g, tile, cx, cy + s * 0.02, s * 1.0, done);
    // 7. the marquee bulbs round the Headliner's hex
    if (boss && !done) for (let i = 0; i < 12; i++) {
      const a = i * PI / 6 + PI / 12, bx = cx + Math.cos(a) * s * BULB_R, by = cy + Math.sin(a) * s * BULB_R;
      g.beginPath(); g.arc(bx, by, 3 * k, 0, TAU); g.fillStyle = CREAM; g.fill(); g.lineWidth = 1 * k; g.strokeStyle = LINE; g.stroke();
      softDisc(g, bx - 0.8 * k, by - 0.8 * k, 0.9 * k, '#ffffff', 0.9);
    }
    // 8. the even warm outline
    tk.inkPath(g, ring, { closed: true, w: (boss ? 2.8 : 2.4) * k, color: LINE, align: 0.1, wobble: 0.05, weightVar: 0.18, seed: v * 7 + 1, tension: TENS, alpha: done ? 0.7 : 1 });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // the Blur: an opalescent blurred-out hole with soft edges, no outline, one polite sparkle
  // ---------------------------------------------------------------------------------------------------------------
  function voidSprite(g, w, h, s, v) {
    const cx = w / 2, cy = h / 2, k = s / BASE;
    const ring = hexRing(cx, cy, s * 1.0, R('ring', v), 0.03);
    g.save(); clipRing(g, ring);
    let gr = g.createRadialGradient(cx, cy, 0, cx, cy, s * 1.02);
    gr.addColorStop(0, A('#c9c0e6', 0.98)); gr.addColorStop(0.45, A('#d9d2ef', 0.9)); gr.addColorStop(0.8, A(OPAL, 0.6)); gr.addColorStop(1, A(OPAL, 0));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    [0.3, 0.5, 0.7, 0.88].forEach((m, i) => { g.beginPath(); g.arc(cx, cy, s * m, 0, TAU); g.lineWidth = s * (0.1 - i * 0.012); g.strokeStyle = A(i % 2 ? '#ffffff' : '#b5abd8', 0.16); g.stroke(); });
    airbrush(g, cx - s * 0.35, cy - s * 0.35, s * 0.55, BLUSH_SHEEN, 0.7); airbrush(g, cx + s * 0.4, cy + s * 0.32, s * 0.55, MINT_SHEEN, 0.7);
    g.restore();
    tk.sparkle(g, cx + s * (0.3 + 0.05 * (v % 3)), cy - s * 0.32, 4.4 * k, { color: '#ffffff', glow: 0, alpha: 0.95 });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // overlays: path, hover, target (translucent, drawn over the hex that is already there)
  // ---------------------------------------------------------------------------------------------------------------
  function pathSprite(g, w, h, s, v) {
    const cx = w / 2, cy = h / 2, k = s / BASE, ring = hexRing(cx, cy, s * 0.97, R('ring', v), 0.02);
    fillRing(g, ring, A('#fff8ec', 0.42));
    g.save(); clipRing(g, ring); g.beginPath(); traceRing(g, ring); g.lineWidth = 0.3 * s; g.strokeStyle = A(PINK, 0.24); g.stroke(); g.restore();
    g.beginPath(); traceRing(g, ring); g.setLineDash([3.4 * k, 4.6 * k]); g.lineWidth = 1.9 * k; g.lineCap = 'round'; g.strokeStyle = A('#b0245c', 0.8); g.stroke(); g.setLineDash([]);
  }
  function hoverSprite(g, w, h, s, v) {
    const cx = w / 2, cy = h / 2, k = s / BASE, ring = hexRing(cx, cy, s * 0.985, R('ring', v), 0.02);
    fillRing(g, ring, A('#fff8ec', 0.3));
    g.beginPath(); traceRing(g, ring); g.lineJoin = 'round'; g.lineWidth = 6 * k; g.strokeStyle = A(PINK, 0.5); g.stroke();
    tk.inkPath(g, ring, { closed: true, w: 2.6 * k, color: LINE, align: 0, wobble: 0.1, seed: 3, tension: TENS });
    g.beginPath(); traceRing(g, ring); g.lineWidth = 1 * k; g.strokeStyle = A('#ffffff', 0.95); g.stroke();
  }
  function targetSprite(g, w, h, s, v) {
    const cx = w / 2, cy = h / 2, k = s / BASE, ring = hexRing(cx, cy, s * 0.985, R('ring', v), 0.02);
    fillRing(g, ring, A(GREEN, 0.2));
    g.beginPath(); traceRing(g, ring); g.lineWidth = 6 * k; g.lineJoin = 'round'; g.strokeStyle = A('#3fd6b0', 0.5); g.stroke();
    tk.inkPath(g, ring, { closed: true, w: 2.8 * k, color: LINE, align: 0, wobble: 0.1, seed: 5, tension: TENS });
    for (let i = 0; i < 4; i++) { const a = i * PI / 2; tk.inkPath(g, [[cx + Math.cos(a) * s * 0.52, cy + Math.sin(a) * s * 0.52], [cx + Math.cos(a) * s * 0.7, cy + Math.sin(a) * s * 0.7]], { w: 2.6 * k, color: HOT, taper: 0.2 }); }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // landmarks spotted from afar: their sticker as a pastel ghost under the film (the real sticker washed out, or our own drawing in one flat colour)
  // ---------------------------------------------------------------------------------------------------------------
  function silSprite(g, w, h, s, tile) {
    const cx = w / 2, cy = h / 2, boss = tile === 'boss', u = s * (boss ? 1.4 : 1.1) / 100, ghost = boss ? '#c4b3f2' : '#cfc3ee';
    if (ART.has('tile', tile)) {                                       // the real sticker, washed out to a ghost so it still matches the live one
      stamp(g, tile, cx, cy, s * (boss ? 1.3 : 1.02), false);
      g.globalCompositeOperation = 'source-atop'; g.fillStyle = A(ghost, 0.78); g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over';
      return;
    }
    softDisc(g, cx, cy, 43 * u, ghost, 0.5);
    const glyph = GLYPH[tile];
    if (glyph) { const T = glyphTools(g, cx, cy, u * 0.9, A('#a99bd8', 0.85)); glyph(T[0], T[1], T[2]); }
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
    const k = rungOf(size), v = variant(opts.seed), done = !!opts.done, ch = chapterOf(opts.chapter);
    let tile = typeof opts.tile === 'string' ? opts.tile : 'empty';
    if (kind === 'ground') { kind = 'painted'; tile = 'empty'; }
    let sp;
    if (kind === 'painted') { if (tile === 'block') { kind = 'block'; } else if (!WASH[tile]) tile = 'empty'; }
    if (kind === 'fog') sp = getSprite('fog', '', false, v, k, (g, w, h, s) => fogSprite(g, w, h, s, v, false));
    else if (kind === 'known') {
      if (!WASH[tile] || tile === 'empty' || tile === 'block') sp = getSprite('fog', '', false, v, k, (g, w, h, s) => fogSprite(g, w, h, s, v, false));
      else sp = getSprite('known', tile, false, v, k, (g, w, h, s) => fogSprite(g, w, h, s, v, false, true, (g2) => { const sl = ART.sprite(`map|sil|${tile}|${rungOf(s)}`, w, h, (g3) => silSprite(g3, w, h, s, tile)); ART.blit(g2, sl, 0, 0, w, h, tile === 'boss' ? 0.95 : 0.85); }));
    } else if (kind === 'edge') sp = getSprite('edge', '', false, v, k, (g, w, h, s) => fogSprite(g, w, h, s, v, true));
    else if (kind === 'block') sp = getSprite('block', '', false, v, k, (g, w, h, s) => voidSprite(g, w, h, s, v));
    else if (kind === 'path') sp = getSprite('path', '', false, v & 1, k, (g, w, h, s) => pathSprite(g, w, h, s, v & 1));
    else if (kind === 'hover') sp = getSprite('hover', '', false, 0, k, (g, w, h, s) => hoverSprite(g, w, h, s, 0));
    else if (kind === 'target') sp = getSprite('target', '', false, 0, k, (g, w, h, s) => targetSprite(g, w, h, s, 0));
    else {
      const gk = tile === 'empty' && ch > 1 ? 'empty' + ch : tile;     // only bare ground looks different from Act to Act
      sp = getSprite('painted', gk, done, v, k, (g, w, h, s) => paintedSprite(g, w, h, s, tile, done, v, tile === 'empty' ? ch : 1));
    }
    if (opts.bakeOnly) return;
    const f = size / sp.s, tt = num(opts.t, 0), mo = tk.motion();
    const pulse = 0.5 + 0.5 * Math.sin(tt * 3.1);
    if (kind === 'hover') { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * (0.78 + 0.22 * pulse * mo + 0.22 * (1 - mo)); ART.blit(ctx, sp.spr, x - sp.w * f / 2, y - sp.h * f / 2, sp.w * f, sp.h * f); ctx.globalAlpha = ga; }
    else ART.blit(ctx, sp.spr, x - sp.w * f / 2, y - sp.h * f / 2, sp.w * f, sp.h * f);
    if (kind === 'edge') liveEdge(ctx, x, y, size, tt, v, mo);
    else if (kind === 'target') liveTarget(ctx, x, y, size, tt, mo);
    else if (kind === 'painted' && !done) { liveTile(ctx, tile, x, y, size, tt, v, mo); if (opts.near) liveNear(ctx, tile, x, y, size, tt, num(opts.seed, 0), mo, ch); }
  }
  // live touches over the cached sprites: cheap and never baked
  function liveEdge(ctx, x, y, size, t, v, mo) {
    const k = size / BASE, pulse = 0.5 + 0.5 * Math.sin(t * 2.6 + v);
    ctx.save();
    ctx.beginPath(); hexPath(ctx, x, y, size * 0.9);
    ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.4, 2.8 * k);                                  // a lit seam of pink to lime dashes, marching
    ctx.setLineDash([size * 0.15, size * 0.15]); ctx.lineDashOffset = -t * size * 0.32 * mo; ctx.strokeStyle = A(HOT, 0.6 + 0.35 * pulse); ctx.stroke();
    ctx.lineDashOffset = -t * size * 0.32 * mo - size * 0.15; ctx.strokeStyle = A(LIME, 0.75 + 0.2 * pulse); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    tk.glow(ctx, x, y, size * 0.85, '#ffb0d4', 0.06 + 0.06 * pulse * mo);
    if (mo > 0.5) {                                                   // a listening ring: the next hex to unmute
      const a = (t / 2.6) % 1;
      ctx.beginPath(); ctx.arc(x, y, lerp(size * 0.2, size * 0.8, a), 0, TAU); ctx.lineWidth = Math.max(0.8, 1.3 * k); ctx.strokeStyle = A('#ffffff', 0.6 * (1 - a)); ctx.stroke();
    }
  }
  function liveTarget(ctx, x, y, size, t, mo) {
    const k = size / BASE;
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.7 * mo);
    ctx.beginPath(); ctx.arc(0, 0, size * 0.74, 0, TAU); ctx.setLineDash([size * 0.14, size * 0.1]); ctx.lineWidth = Math.max(1, 2 * k); ctx.strokeStyle = A(HOT, 0.9); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    const a = t * 1.6 * mo; tk.sparkle(ctx, x + Math.cos(a) * size * 0.74, y + Math.sin(a) * size * 0.74, 4.2 * k, { color: GOLD, glow: 0.4 });
  }
  // a little life on landmarks: gift glint, camp and studio glow, tea steam, the Headliner's chasing bulbs, the rival's orbiting star
  function liveTile(ctx, tile, x, y, size, t, v, mo) {
    const k = size / BASE, ph = t + v * 0.9;
    if (tile === 'camp') tk.glow(ctx, x, y + size * 0.05, size * (0.75 + 0.05 * Math.sin(ph * 7.3)), '#ffe38a', 0.2 + 0.1 * Math.sin(ph * 5.1) * mo);
    else if (tile === 'forge') {                                       // the ON AIR light breathes
      tk.glow(ctx, x, y + size * 0.05, size * 0.7, '#ff7a30', 0.14 + 0.08 * (0.5 + 0.5 * Math.sin(ph * 2.2)) * mo);
      tk.glow(ctx, x + size * 0.34, y - size * 0.5, size * 0.2, '#ff3f4f', 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(ph * 3.4)) * mo);
    }
    else if (tile === 'chest') { const a = (ph * 0.55) % 1; if (a < 0.35) tk.sparkle(ctx, x + size * (0.35 - a * 1.2), y - size * (0.5 - a * 0.9), (2 + 5 * Math.sin(a / 0.35 * PI)) * k, { color: '#ffffff', alpha: Math.sin(a / 0.35 * PI), glow: 0.5 }); }
    else if (tile === 'well') {                                        // the tea stall: a steam curl rises and a sound ring goes out every 2.2 s
      const a = (ph / 2.2) % 1; ctx.beginPath(); ctx.arc(x, y, size * (0.3 + 0.55 * a), 0, TAU); ctx.lineWidth = 1.6 * k; ctx.strokeStyle = A('#ffffff', 0.6 * (1 - a) * (mo > 0.5 ? 1 : 0.5)); ctx.stroke();
      if (mo > 0.5) for (let i = 0; i < 2; i++) {
        const b = ((ph * 0.45 + i * 0.5) % 1), sx = x + size * (0.05 + i * 0.1), sy = y - size * (0.1 + 0.55 * b);
        ctx.beginPath(); ctx.moveTo(sx, sy + size * 0.14); ctx.quadraticCurveTo(sx + Math.sin(b * 9 + i) * size * 0.1, sy + size * 0.07, sx, sy); ctx.lineWidth = Math.max(1, 1.8 * k); ctx.lineCap = 'round'; ctx.strokeStyle = A('#ffffff', 0.75 * Math.sin(PI * b)); ctx.stroke();
      }
    }
    else if (tile === 'boss') {                                        // marquee bulbs chase round the rim
      tk.glow(ctx, x, y, size * 0.95, '#ffd84d', 0.14 + 0.1 * (0.5 + 0.5 * Math.sin(ph * 1.7)) * mo);
      const sh = mo > 0.5 ? Math.floor(ph * 4) : 0;
      for (let i = 0; i < 12; i++) if ((i + sh) % 3 === 0) { const a = i * PI / 6 + PI / 12; tk.glow(ctx, x + Math.cos(a) * size * BULB_R, y + Math.sin(a) * size * BULB_R, size * 0.2, '#fff0a0', 0.85); }
    }
    else if (tile === 'elite') { const a = ph * 0.9; tk.sparkle(ctx, x + Math.cos(a) * size * 0.66, y + Math.sin(a) * size * 0.66, 3.4 * k, { color: GOLD, alpha: 0.9, glow: 0.4 }); }
  }

  // Motion is the live signal. Only for a live hex near the party (opts.near); skipped under reduced motion and low quality. Per Act a seeded touch
  // (Act I bunting sways and a petal tumbles, Act II a tiny screen flickers, Act III fairy bulbs twinkle) plus one faint sound ring every 4 to 6 s.
  // About a dozen draw calls each.
  const LAMPS = { camp: 1, forge: 1, boss: 1, elite: 1, well: 1 };
  function liveNear(ctx, tile, x, y, size, t, seed, mo, ch) {
    if (!(mo > 0.5) || tk.lowQ()) return;
    const k = size / BASE, h1 = U.hash(seed, 11), h2 = U.hash(seed, 29), per = 4 + 2 * ((h1 % 100) / 100), ph = (h2 % 1000) / 1000 * per;
    if (LAMPS[tile]) tk.glow(ctx, x, y, size * 0.5, '#fff0b0', 0.1 + 0.1 * Math.sin(t * 6.3 + h1) * 0.5);       // stage lamps and stalls flicker
    else if (tile !== 'block') {
      const sw = Math.sin(t * TAU / (3 + 2 * ((h1 >> 3) % 10) / 10) + h2);
      if (ch === 2) {                                                 // a tiny screen in the corner, flickering between two channels
        const sx = x + size * 0.34, sy = y - size * 0.62, fl = Math.sin(t * 9 + h1) > 0.3 ? '#4fe8ff' : '#ff4fa0';
        ctx.beginPath(); ctx.rect(sx - 5.2 * k, sy - 7.5 * k, 10.4 * k, 15 * k); ctx.fillStyle = A(fl, 0.85); ctx.fill(); ctx.lineWidth = Math.max(0.8, 1.3 * k); ctx.strokeStyle = A(LINE, 0.9); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx - 3.8 * k, sy - 1.5 * k + sw * 1.4 * k); ctx.lineTo(sx + 3.8 * k, sy - 1.5 * k + sw * 1.4 * k); ctx.strokeStyle = A('#ffffff', 0.8); ctx.stroke();
      } else if (ch === 3) {                                          // fairy bulbs twinkling on a string
        for (let i = 0; i < 4; i++) {
          const tw = 0.5 + 0.5 * Math.sin(t * 3.1 + i * 1.9 + h1), bx = x + (i - 1.5) * size * 0.3, by = y - size * 0.7 + Math.sin(PI * (i + 0.5) / 4) * size * 0.1;
          ctx.beginPath(); ctx.arc(bx, by, (1.6 + 1.2 * tw) * k, 0, TAU); ctx.fillStyle = A(i % 2 ? '#fff0a0' : '#ffc2dc', 0.55 + 0.45 * tw); ctx.fill();
        }
      } else {                                                        // Act I: bunting along the top swaying a little, and a petal tumbling past
        const by = y - size * 0.72;
        ctx.beginPath(); ctx.moveTo(x - size * 0.5, by); ctx.quadraticCurveTo(x + sw * k, by + size * 0.16, x + size * 0.5, by); ctx.lineWidth = Math.max(0.8, 1 * k); ctx.strokeStyle = A(LINE, 0.55); ctx.stroke();
        for (let i = 0; i < 3; i++) {
          const u = (i + 0.5) / 3, fx = lerp(x - size * 0.5, x + size * 0.5, u), fy = by + Math.sin(PI * u) * size * 0.12 + sw * k * 0.4 * Math.sin(PI * u);
          ctx.beginPath(); ctx.moveTo(fx - 3.4 * k, fy); ctx.lineTo(fx + 3.4 * k, fy); ctx.lineTo(fx + sw * 0.8 * k, fy + 6.4 * k); ctx.closePath(); ctx.fillStyle = A(['#ff7eb6', '#ffd84d', '#8fe3c0'][i], 0.95); ctx.fill();
        }
        const pu = ((t + ph) % 5) / 5;
        tk.petal(ctx, x - size * 0.5 + pu * size, y - size * 0.55 + pu * size * 1.1, 3.4 * k, pu * 7 + h1, 0.9 * Math.sin(PI * pu), '#ffc2dc');
      }
    }
    const a = ((t + ph) % per) / 2.4;
    if (a < 1) tk.soundRings(ctx, x, y, size * (0.5 + 0.38 * a), { n: 1, color: '#ffffff', alpha: 0.4 * (1 - a), lw: Math.max(0.8, 1.2 * k) });
  }

  const M = ART.map;

  // ---------------------------------------------------------------------------------------------------------------
  // PAPER: the world ground. World space, so it scrolls and zooms with the map: the live ground tone of the Act as a seamless cached tile (Act I sand
  // and cobbles, Act II midnight asphalt with neon, Act III mirror-white stage tiles), big soft stains placed by a hash of the world cell (so nothing
  // repeats), and a sketchy pastel world in the margins and, faintly, under the film (a tour van, a sleeping mic stand and gulls in Act I; phone screens
  // in Act II; ring lights in Act III; loose notes everywhere)
  // ---------------------------------------------------------------------------------------------------------------
  const PAPER = { 1: '#f3e6cd', 2: '#262a5a', 3: '#f2f0f9' };
  const PAPER_BASE = PAPER[1], DOODLE_INK = '#8b7fb8';
  const TONE = {
    1: { a: '#ff9cc6', b: '#9fd2f0', c: '#ffe28a', dark: '#c9a979', light: '#fff9e8' },
    2: { a: '#ff4fa0', b: '#4fe8ff', c: '#a77bff', dark: '#10112e', light: '#6f78d8' },
    3: { a: '#d9c2ff', b: '#bff5e3', c: '#ffd0e6', dark: '#c9c2e0', light: '#ffffff' },
  };
  // The grain tile is TILE world px and repeats. A CHUNK is 2 x 2 of it plus up to two stains kept clear of the chunk border, so chunks of any
  // variant join with no seam, and a page is ~6 opaque blits instead of a pattern fill plus a dozen rotated alpha blits.
  const TILE = 150, CHUNK = TILE * 2, NVAR = 5, CELL = 540;     // CELL: the grid the margin doodles are placed on
  function wrapAt(x, y, rad, fn) {
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const px = x + i * TILE, py = y + j * TILE;
      if (px > -rad && px < TILE + rad && py > -rad && py < TILE + rad) fn(px, py);
    }
  }
  function paperTile(g, ch) {
    const r = R('paper', 'tile', ch), T = TONE[ch];
    if (ch === 2) {                                                    // asphalt: light and dark speckle
      for (let i = 0; i < 260; i++) { const x = r() * TILE, y = r() * TILE, sz = 0.6 + r() * 1.3; g.fillStyle = r() < 0.55 ? A(T.light, 0.08 + r() * 0.2) : A(T.dark, 0.2 + r() * 0.3); wrapAt(x, y, 2, (px, py) => g.fillRect(px, py, sz, sz)); }
    } else if (ch === 3) {                                             // mirror tiles: 75 px squares with seams and a glint across each
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        const x0 = i * 75, y0 = j * 75;
        g.fillStyle = A((i + j) % 2 ? '#e4def4' : '#ffffff', 0.35); g.fillRect(x0, y0, 75, 75);
        g.beginPath(); g.moveTo(x0 + 6, y0 + 6); g.lineTo(x0 + 46, y0 + 6); g.lineTo(x0 + 6, y0 + 46); g.closePath(); g.fillStyle = A('#ffffff', 0.5); g.fill();
        g.beginPath(); g.moveTo(x0 + 69, y0 + 69); g.lineTo(x0 + 39, y0 + 69); g.lineTo(x0 + 69, y0 + 39); g.closePath(); g.fillStyle = A('#d9d0f0', 0.28); g.fill();
      }
      g.strokeStyle = A(T.dark, 0.7); g.lineWidth = 1.6;
      [0, 75, 150].forEach((p) => { g.beginPath(); g.moveTo(p, 0); g.lineTo(p, TILE); g.stroke(); g.beginPath(); g.moveTo(0, p); g.lineTo(TILE, p); g.stroke(); });
    } else {                                                           // cobbles: rows of 37 x 30 stones, every other row shifted half a stone, no two alike
      for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) {
        const x = j * 37.5 + (i % 2) * 18.75 + 18.75 + (r() - 0.5) * 6, y = i * 30 + 15 + (r() - 0.5) * 5, rx = 13.4 + r() * 4.4, ry = 10 + r() * 3.2, rot = (r() - 0.5) * 0.9;
        const tone = r() < 0.5 ? '#e9d3a8' : '#fff6e2', a = 0.45 + r() * 0.25;
        wrapAt(x, y, 16, (px, py) => {
          g.beginPath(); g.ellipse(px, py, rx, ry, rot, 0, TAU); g.fillStyle = A(tone, a); g.fill(); g.lineWidth = 1.2; g.strokeStyle = A(T.dark, 0.3); g.stroke();
          g.beginPath(); g.ellipse(px - rx * 0.28, py - ry * 0.32, rx * 0.34, ry * 0.18, rot, 0, TAU); g.fillStyle = A('#ffffff', 0.35); g.fill();
        });
      }
    }
  }
  // stains: soft pools of the Act's colours (ripples, flecks, glow, dashes, a wash)
  const STAIN_N = 6, STAIN_S = 340;
  function stainSprite(g, i, ch) {
    const r = R('stain', i, ch), c = STAIN_S / 2, T = TONE[ch], cols = [T.a, T.b, T.c];
    if (i === 0 || i === 1) {                                          // sound ripples: three thin concentric circles, no fill
      const rad = 96 + r() * 40;
      [1, 0.8, 0.62].forEach((m, n) => { g.beginPath(); g.arc(c, c, rad * m, 0, TAU); g.lineWidth = 2.6 - n * 0.5; g.strokeStyle = A(cols[(i + n) % 3], [0.22, 0.17, 0.12][n]); g.stroke(); });
    } else if (i === 2) {                                              // a scatter of confetti flecks
      for (let n = 0; n < 30; n++) { const a = r() * TAU, d = Math.sqrt(r()) * 120; g.beginPath(); g.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, 1.4 + r() * 2, 0, TAU); g.fillStyle = A(cols[n % 3], 0.2 + r() * 0.2); g.fill(); }
    } else if (i === 3) {                                              // a glow patch
      const gr = g.createRadialGradient(c, c, 0, c, c, 150); gr.addColorStop(0, A(T.c, ch === 2 ? 0.22 : 0.32)); gr.addColorStop(1, A(T.c, 0)); g.fillStyle = gr; g.fillRect(0, 0, STAIN_S, STAIN_S);
    } else if (i === 4) {                                              // three dashes, like a lane marking or a tile seam
      g.lineCap = 'round';
      for (let n = 0; n < 3; n++) tk.inkPath(g, [[c - 90 + n * 66, c], [c - 50 + n * 66, c]], { w: 5, color: ch === 2 ? '#ffd84d' : A(T.dark, 0.9), alpha: ch === 2 ? 0.18 : 0.16, taper: 0.2, wobble: 0 });
    } else {                                                           // a soft wash
      const gr = g.createRadialGradient(c, c, 10, c, c, 140); gr.addColorStop(0, A(T.a, 0.14)); gr.addColorStop(0.75, A(T.a, 0.07)); gr.addColorStop(1, A(T.a, 0)); g.fillStyle = gr; g.fillRect(0, 0, STAIN_S, STAIN_S);
    }
  }
  function chunkSprite(g, v, ch) {
    const tile = ART.sprite(`map|paper|c${ch}|tile`, TILE, TILE, (g2) => paperTile(g2, ch)), T = TONE[ch];
    ART.blit(g, tile, 0, 0, TILE, TILE); ART.blit(g, tile, TILE, 0, TILE, TILE); ART.blit(g, tile, 0, TILE, TILE, TILE); ART.blit(g, tile, TILE, TILE, TILE, TILE);
    const r = R('chunk', v, ch);
    for (let i = 0; i < 4; i++) {                                      // soft mottling, fully inside the chunk so it never meets a seam
      const rad = 40 + r() * 70, x = rad + r() * (CHUNK - 2 * rad), y = rad + r() * (CHUNK - 2 * rad), dark = r() < 0.5, c = dark ? T.dark : T.light;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, A(c, dark ? 0.1 : 0.14)); gr.addColorStop(1, A(c, 0)); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    const idx = [0, 2, 3, 4, -1][v % 5];
    if (idx >= 0) {
      const sc = 0.5 + r() * 0.3, half = STAIN_S * sc / 2, rot = r() * TAU;
      const sx = half + r() * (CHUNK - 2 * half), sy = half + r() * (CHUNK - 2 * half), al = 0.6 + r() * 0.4;
      const spr = ART.sprite(`map|paper|c${ch}|stain${idx}`, STAIN_S, STAIN_S, (g2) => stainSprite(g2, idx, ch));
      g.save(); g.translate(sx, sy); g.rotate(rot); ART.blit(g, spr, -half, -half, half * 2, half * 2, al); g.restore();
    }
  }

  // ---- doodles: a sketchy pastel world (drawn once with soft fills and a dusty violet line, blitted at low alpha)
  const PK = '#ffc2dc', MT = '#bff5e3', SK = '#cfe9ff', LV = '#e6d9ff', YL = '#fff0a8', OR = '#ffd9a8';
  const dline = (g, pts, w, o) => tk.inkPath(g, pts, Object.assign({ w, color: DOODLE_INK, taper: 0.25, wobble: 0.1 }, o));
  const dpoly = (g, pts, fill, w, o) => {
    if (fill) { g.beginPath(); tk.trace(g, pts, 0, 0, 0.45); g.fillStyle = fill; g.fill(); }
    tk.inkPath(g, pts, Object.assign({ closed: true, w: w || 2.4, color: DOODLE_INK, wobble: 0.1, weightVar: 0.2, tension: 0.45 }, o));
  };
  const dcirc = (g, x, y, rad, fill, w) => { g.beginPath(); g.arc(x, y, rad, 0, TAU); if (fill) { g.fillStyle = fill; g.fill(); } if (w) { g.lineWidth = w; g.strokeStyle = DOODLE_INK; g.stroke(); } };
  const dheart = (g, x, y, sz, fill) => dpoly(g, [[x, y + sz * 0.9], [x - sz * 0.85, y + sz * 0.1], [x - sz * 0.8, y - sz * 0.5], [x - sz * 0.35, y - sz * 0.75], [x, y - sz * 0.35], [x + sz * 0.35, y - sz * 0.75], [x + sz * 0.8, y - sz * 0.5], [x + sz * 0.85, y + sz * 0.1]], fill, 2.2);
  const dflower = (g, x, y, rad) => { for (let i = 0; i < 5; i++) { const a = i * TAU / 5 - PI / 2; dcirc(g, x + Math.cos(a) * rad * 0.62, y + Math.sin(a) * rad * 0.62, rad * 0.46, PK, 1.8); } dcirc(g, x, y, rad * 0.32, YL, 1.6); };
  const DOODLES = {
    van: { w: 330, h: 200, draw(g) {                                   // the little tour van, with bunting
      dline(g, [[18, 20], [90, 44], [170, 24], [250, 46], [312, 22]], 1.7);
      [[54, 32, PK], [128, 36, YL], [206, 32, MT], [278, 34, SK]].forEach((f) => dpoly(g, [[f[0] - 10, f[1] - 4, 1], [f[0] + 10, f[1] - 4, 1], [f[0], f[1] + 15, 1]], f[2], 1.6, { tension: 0 }));
      dpoly(g, [[40, 156, 1], [40, 92], [58, 78], [212, 78], [252, 82], [290, 114], [304, 122], [304, 156, 1]], PK, 3, { tension: 0.35 });
      dpoly(g, tk.rrectPts(58, 90, 72, 34, 7), SK, 2); dpoly(g, tk.rrectPts(140, 90, 62, 34, 7), SK, 2); dpoly(g, [[216, 90], [246, 92], [272, 118], [216, 118]], SK, 2, { tension: 0.2 });
      dline(g, [[40, 140], [304, 140]], 9, { color: MT, taper: 0.04, wobble: 0 }); dline(g, [[134, 82], [134, 154]], 1.6, { taper: 0.1 });
      dline(g, [[92, 78], [92, 64], [196, 64], [196, 78]], 2.2, { taper: 0.05 }); dpoly(g, tk.rrectPts(112, 40, 62, 24, 6), LV, 2); dcirc(g, 133, 52, 7, CREAM, 1.8); dcirc(g, 153, 52, 7, CREAM, 1.8);
      dcirc(g, 102, 160, 25, '#8e84b8', 3); dcirc(g, 102, 160, 9, CREAM, 2); dcirc(g, 258, 160, 25, '#8e84b8', 3); dcirc(g, 258, 160, 9, CREAM, 2); dcirc(g, 302, 130, 6, YL, 2);
    } },
    micstand: { w: 140, h: 240, draw(g) {                              // a sleeping mic stand
      dline(g, [[70, 140], [70, 214]], 3, { taper: 0.05 }); dline(g, [[70, 206], [32, 230]], 3, { taper: 0.1 }); dline(g, [[70, 206], [108, 230]], 3, { taper: 0.1 }); dline(g, [[70, 206], [70, 232]], 3, { taper: 0.1 });
      dcirc(g, 70, 104, 36, LV, 3); [[-18, 0.35], [0, 0.45], [18, 0.35]].forEach((p) => dline(g, [[70 + p[0], 76], [70 + p[0] * 1.2, 104], [70 + p[0], 132]], 1.1, { taper: 0.3, alpha: 0.7 }));
      dline(g, [[49, 98], [56, 104], [64, 98]], 2.2, { taper: 0.1 }); dline(g, [[76, 98], [83, 104], [91, 98]], 2.2, { taper: 0.1 }); dline(g, [[63, 116], [70, 121], [77, 116]], 2, { taper: 0.2 });
      dcirc(g, 52, 112, 5, PK, 0); dcirc(g, 88, 112, 5, PK, 0); dcirc(g, 108, 58, 6, SK, 1.6); dcirc(g, 118, 40, 9, SK, 1.6);
    } },
    gulls: { w: 320, h: 140, draw(g) {                                 // three gulls who think they can sing
      [[70, 86, 1], [160, 58, -1], [250, 92, 1]].forEach((b, i) => {
        const x = b[0], y = b[1], d = b[2];
        dpoly(g, [[x - 26 * d, y + 6], [x - 8 * d, y - 12], [x + 18 * d, y - 8], [x + 30 * d, y + 8], [x + 8 * d, y + 22], [x - 16 * d, y + 18]], '#f4faff', 2.4);
        dline(g, [[x - 6 * d, y - 6], [x - 30 * d, y - 22], [x - 38 * d, y - 12], [x - 14 * d, y + 6]], 2.4, { taper: 0.1 });
        dpoly(g, [[x + 28 * d, y + 2, 1], [x + 44 * d, y + 6, 1], [x + 29 * d, y + 12, 1]], OR, 1.8, { tension: 0 }); dcirc(g, x + 20 * d, y + 1, 2.2, DOODLE_INK, 0);
        dline(g, [[x - 2 * d, y + 22], [x - 2 * d, y + 36]], 2, { taper: 0.1 }); dline(g, [[x + 8 * d, y + 22], [x + 8 * d, y + 36]], 2, { taper: 0.1 });
        tk.note(g, x + 28 * d, y - 28, 10, { kind: i % 2 ? 'quarter' : 'eighth', color: '#ff9cc6' });
      });
    } },
    blossom: { w: 270, h: 160, draw(g) {                               // a cherry blossom branch
      dline(g, [[10, 140], [70, 110], [120, 100], [180, 62], [250, 40]], 6, { color: '#c6a9b8', taper: 0.1 }); dline(g, [[120, 100], [140, 126], [176, 138]], 4, { color: '#c6a9b8', taper: 0.3 }); dline(g, [[180, 62], [196, 90], [226, 100]], 3.4, { color: '#c6a9b8', taper: 0.3 });
      [[70, 92, 16], [124, 82, 18], [160, 124, 14], [182, 44, 17], [224, 86, 14], [250, 28, 12], [96, 120, 10]].forEach((f) => dflower(g, f[0], f[1], f[2]));
    } },
    waves: { w: 170, h: 54, draw(g) {                                  // little sound waves
      for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) { const x = 6 + i * 40 + (row % 2) * 18, y = 14 + row * 14; dline(g, [[x, y + 4], [x + 8, y - 8], [x + 18, y - 5], [x + 24, y + 5], [x + 32, y - 2]], 2.2, { taper: 0.4 }); }
    } },
    notes: { w: 210, h: 130, draw(g) {                                 // loose notes drifting about
      tk.note(g, 40, 90, 26, { kind: 'beamed', color: '#b9a8ee' }); tk.note(g, 120, 70, 22, { kind: 'quarter', color: '#ff9cc6' }); tk.note(g, 176, 98, 24, { kind: 'eighth', color: '#8fe3c0' });
      tk.sparkle(g, 80, 28, 9, { color: '#d8c8ff', glow: 0 }); tk.sparkle(g, 150, 30, 6, { color: '#ffd84d', glow: 0 });
    } },
    stars: { w: 200, h: 140, draw(g) {                                 // a little constellation of sparkles
      const pts = [[20, 100], [64, 66], [104, 82], [146, 36], [180, 54], [126, 118]];
      dline(g, pts, 1.6, { taper: 0.05, wobble: 0.05 });
      pts.forEach((q, i) => tk.sparkle(g, q[0], q[1], 7 + (i % 3) * 3, { color: i % 2 ? '#c8b8f0' : '#ffd84d', glow: 0, thin: 0.22 }));
    } },
    phones: { w: 280, h: 210, draw(g) {                                // two phone screens: a heart, a smile, and a notification bubble
      g.save(); g.translate(86, 108); g.rotate(-0.16);
      dpoly(g, tk.rrectPts(-44, -84, 88, 168, 14), LV, 3); dpoly(g, tk.rrectPts(-37, -70, 74, 132, 6), SK, 1.8); dline(g, [[-12, 74], [12, 74]], 2.4, { taper: 0.1 }); dheart(g, 0, -10, 22, PK);
      dpoly(g, tk.rrectPts(-30, -62, 60, 18, 8), CREAM, 1.6); dcirc(g, -20, -53, 4, '#ff4fa0', 0); g.restore();
      g.save(); g.translate(204, 98); g.rotate(0.2);
      dpoly(g, tk.rrectPts(-40, -76, 80, 152, 13), MT, 3); dpoly(g, tk.rrectPts(-33, -63, 66, 120, 6), YL, 1.8); dline(g, [[-10, 66], [10, 66]], 2.4, { taper: 0.1 });
      dcirc(g, 0, -12, 22, CREAM, 2); dcirc(g, -8, -18, 2.6, DOODLE_INK, 0); dcirc(g, 8, -18, 2.6, DOODLE_INK, 0); dline(g, [[-10, -4], [0, 4], [10, -4]], 2.2, { taper: 0.1 }); g.restore();
    } },
    hearts: { w: 220, h: 150, draw(g) {                                // hearts and thumbs falling like snow
      dheart(g, 50, 52, 24, PK); dheart(g, 130, 90, 18, LV); dheart(g, 186, 40, 13, MT);
      dpoly(g, [[88, 58, 1], [88, 36], [100, 22], [104, 10], [112, 12], [112, 28], [108, 36], [128, 36], [132, 44], [128, 58, 1]], YL, 2.2); dpoly(g, tk.rrectPts(72, 36, 14, 24, 3), PK, 2);
      tk.sparkle(g, 36, 110, 8, { color: '#d8c8ff', glow: 0 });
    } },
    ringlight: { w: 200, h: 280, draw(g) {                             // a ring light on a tripod, with a phone clamped in the middle
      dline(g, [[100, 150], [100, 238]], 3.4, { taper: 0.05 }); dline(g, [[100, 232], [58, 268]], 3.4, { taper: 0.1 }); dline(g, [[100, 232], [142, 268]], 3.4, { taper: 0.1 }); dline(g, [[100, 232], [100, 270]], 3.4, { taper: 0.1 });
      g.beginPath(); g.arc(100, 90, 74, 0, TAU); g.arc(100, 90, 50, 0, TAU, true); g.fillStyle = YL; g.fill('evenodd');
      dcirc(g, 100, 90, 74, null, 3); dcirc(g, 100, 90, 50, null, 2.4);
      dpoly(g, tk.rrectPts(86, 62, 28, 56, 5), LV, 2.2); dcirc(g, 100, 74, 3, DOODLE_INK, 0);
      for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + 0.3; tk.sparkle(g, 100 + Math.cos(a) * 62, 90 + Math.sin(a) * 62, 4.4, { color: '#ffffff', glow: 0 }); }
    } },
    speaker: { w: 160, h: 200, draw(g) {                               // a speaker with its sound rings
      dpoly(g, tk.rrectPts(30, 40, 100, 150, 12), LV, 3); dcirc(g, 80, 80, 20, CREAM, 2.4); dcirc(g, 80, 80, 7, PK, 1.8); dcirc(g, 80, 140, 30, CREAM, 2.4); dcirc(g, 80, 140, 13, MT, 1.8);
      [0, 1].forEach((i) => { g.beginPath(); g.arc(80, 20, 14 + i * 12, PI * 1.2, PI * 1.8); g.lineWidth = 2.2; g.lineCap = 'round'; g.strokeStyle = DOODLE_INK; g.stroke(); });
    } },
  };
  const DOODLE_MARGIN = { 1: ['waves', 'gulls', 'stars', 'blossom', 'notes', 'van'], 2: ['phones', 'hearts', 'speaker', 'stars', 'notes', 'waves'], 3: ['ringlight', 'speaker', 'stars', 'notes', 'hearts', 'waves'] };
  function doodleSprite(id) { const d = DOODLES[id]; return { spr: ART.sprite('map|doodle|' + id, d.w, d.h, (g) => d.draw(g)), w: d.w, h: d.h }; }

  function worldBox(o) {
    const em = (DATA.ECONOMY && DATA.ECONOMY.map) || { cols: 21, rows: 13, hexSize: 46 }, s = em.hexSize, w = SQ3 * s;
    return o && o.world ? o.world : { x0: -w / 2, y0: -s, x1: w * em.cols, y1: 1.5 * s * (em.rows - 1) + s };
  }
  // fixed doodles per Act, placed relative to the world box: {id, fx, fy (0..1 across the box), dx, dy (px), sc, rot, a}
  const PLACED = {
    1: [{ id: 'van', fx: 0.15, fy: 0.9, sc: 1.0, a: 0.8 }, { id: 'micstand', fx: 0.68, fy: 0.1, sc: 0.95, a: 0.72 }, { id: 'gulls', fx: 0.5, fy: 0.9, sc: 1.0, a: 0.72 }, { id: 'blossom', fx: 0.3, fy: 0.07, sc: 1.0, a: 0.72, rot: -0.06 },
      { id: 'notes', fx: 0.88, fy: 0.5, sc: 1.1, a: 0.62 }, { id: 'waves', fx: 0.42, fy: 0.5, sc: 1.1, a: 0.5 }, { id: 'waves', fx: 0.06, fy: 0.12, sc: 1.0, a: 0.5 }, { id: 'stars', fx: 0.86, fy: 0.9, sc: 1.0, a: 0.55 },
      { id: 'notes', fx: 0.24, fy: 0.72, sc: 0.9, a: 0.55 }, { id: 'waves', fx: 0.75, fy: 0.72, sc: 1.0, a: 0.5 }],
    2: [{ id: 'phones', fx: 0.14, fy: 0.86, sc: 1.0, a: 0.6 }, { id: 'hearts', fx: 0.68, fy: 0.1, sc: 1.0, a: 0.6 }, { id: 'speaker', fx: 0.5, fy: 0.9, sc: 1.0, a: 0.6 }, { id: 'stars', fx: 0.3, fy: 0.07, sc: 1.0, a: 0.5 },
      { id: 'notes', fx: 0.88, fy: 0.5, sc: 1.1, a: 0.55 }, { id: 'hearts', fx: 0.42, fy: 0.5, sc: 0.8, a: 0.5 }, { id: 'waves', fx: 0.06, fy: 0.12, sc: 1.0, a: 0.45 }, { id: 'phones', fx: 0.88, fy: 0.88, sc: 0.9, a: 0.55, rot: 0.1 },
      { id: 'notes', fx: 0.24, fy: 0.72, sc: 0.9, a: 0.5 }, { id: 'waves', fx: 0.75, fy: 0.72, sc: 1.0, a: 0.45 }],
    3: [{ id: 'ringlight', fx: 0.14, fy: 0.8, sc: 1.0, a: 0.7 }, { id: 'ringlight', fx: 0.7, fy: 0.14, sc: 0.9, a: 0.7 }, { id: 'speaker', fx: 0.5, fy: 0.9, sc: 1.0, a: 0.6 }, { id: 'stars', fx: 0.3, fy: 0.07, sc: 1.0, a: 0.6 },
      { id: 'notes', fx: 0.88, fy: 0.5, sc: 1.1, a: 0.6 }, { id: 'stars', fx: 0.42, fy: 0.5, sc: 0.9, a: 0.5 }, { id: 'waves', fx: 0.06, fy: 0.12, sc: 1.0, a: 0.5 }, { id: 'hearts', fx: 0.88, fy: 0.86, sc: 0.9, a: 0.6 },
      { id: 'notes', fx: 0.24, fy: 0.72, sc: 0.9, a: 0.55 }, { id: 'waves', fx: 0.75, fy: 0.72, sc: 1.0, a: 0.5 }],
  };
  function drawDoodle(ctx, id, x, y, z, sc, rot, a) {
    const d = doodleSprite(id), k = z * sc;
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot);
    ART.blit(ctx, d.spr, -d.w * k / 2, -d.h * k / 2, d.w * k, d.h * k, a);
    ctx.restore();
  }

  // Paints the ground over (0, 0, w, h). (camX, camY) is the WORLD point at the centre of the view, zoom scales world to screen (hex size 46 at zoom 1).
  function paper(ctx, w, h, camX, camY, zoom, opts) {
    opts = opts || {};
    w = pos(w, 1280); h = pos(h, 720); camX = num(camX, 0); camY = num(camY, 0);
    const z = clamp(pos(zoom, 1), 0.2, 6), ch = chapterOf(opts.chapter);
    bakeBudget = BAKES_PER_FRAME;
    const ox = w / 2 - camX * z, oy = h / 2 - camY * z;
    const wx0 = -ox / z, wy0 = -oy / z, wx1 = (w - ox) / z, wy1 = (h - oy) / z;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    ctx.fillStyle = PAPER[ch]; ctx.fillRect(0, 0, w, h);
    // the ground chunks (tile, mottling and stains baked together), each variant picked by a hash of its world cell
    const px0 = Math.floor(wx0 / CHUNK), px1 = Math.floor(wx1 / CHUNK), py0 = Math.floor(wy0 / CHUNK), py1 = Math.floor(wy1 / CHUNK), cz = CHUNK * z;
    for (let gx = px0; gx <= px1; gx++) for (let gy = py0; gy <= py1; gy++) {
      const v = U.hash(gx, gy, 77) % NVAR;
      const X0 = Math.floor(ox + gx * cz) - 1, Y0 = Math.floor(oy + gy * cz) - 1, X1 = Math.ceil(ox + (gx + 1) * cz) + 1, Y1 = Math.ceil(oy + (gy + 1) * cz) + 1;
      const spr = ART.sprite(`map|paper|c${ch}|chunk${v}`, CHUNK, CHUNK, (g) => chunkSprite(g, v, ch));
      ART.blit(ctx, spr, X0, Y0, X1 - X0, Y1 - Y0);
    }
    const cx0 = Math.floor(wx0 / CELL) - 1, cx1 = Math.floor(wx1 / CELL), cy0 = Math.floor(wy0 / CELL) - 1, cy1 = Math.floor(wy1 / CELL);
    // doodles
    if (opts.doodles !== false) {
      const wb = worldBox(opts), bw = wb.x1 - wb.x0, bh = wb.y1 - wb.y0, margin = DOODLE_MARGIN[ch];
      PLACED[ch].forEach((pl) => {
        const px = wb.x0 + pl.fx * bw + (pl.dx || 0), py = wb.y0 + pl.fy * bh + (pl.dy || 0), d = DOODLES[pl.id], hw = d.w * pl.sc / 2, hh = d.h * pl.sc / 2;
        if (px + hw < wx0 || px - hw > wx1 || py + hh < wy0 || py - hh > wy1) return;
        drawDoodle(ctx, pl.id, ox + px * z, oy + py * z, z, pl.sc, pl.rot || 0, pl.a);
      });
      // margin doodles: any cell wholly outside the world box gets one, chosen by hash
      for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
        const cxw = cx * CELL, cyw = cy * CELL;
        if (cxw + CELL > wb.x0 - 20 && cxw < wb.x1 + 20 && cyw + CELL > wb.y0 - 20 && cyw < wb.y1 + 20) continue;
        const r = R('dcell', cx, cy, ch);
        if (r() < 0.25) continue;
        const id = margin[Math.floor(r() * margin.length)], px = cxw + (0.2 + r() * 0.6) * CELL, py = cyw + (0.2 + r() * 0.6) * CELL;
        drawDoodle(ctx, id, ox + px * z, oy + py * z, z, 0.9 + r() * 0.4, (r() - 0.5) * 0.3, 0.45 + r() * 0.15);
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // FRAME: a tour poster frame. Indigo enamel with a pink to green pinstripe, a row of marquee bulbs chasing along the top, four corner stickers
  // (blossom, smiley, star, music note) and a pastel Gloss haze creeping in from the edges. Drawn LAST: the window is transparent.
  // ---------------------------------------------------------------------------------------------------------------
  function frameMetrics(w, h) {
    const mx = Math.round(w * 0.0344), my = Math.round(h * 0.05), cb = Math.max(4, Math.round(Math.min(w, h) * 0.03));
    return { mx, my, cb, inner: { x: mx, y: my, w: w - 2 * mx, h: h - 2 * my } };
  }
  const ENAMEL = '#171233';
  const BULBS = 30;
  const bulbX = (w, mx, i) => mx + (w - 2 * mx) * (i + 0.5) / BULBS;
  function stickerBase(g, x, y, rad, fill) {
    g.beginPath(); g.arc(x + rad * 0.08, y + rad * 0.18, rad, 0, TAU); g.fillStyle = 'rgba(8,4,24,0.45)'; g.fill();
    g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fillStyle = CREAM; g.fill();
    tk.celCircle(g, x, y, rad * 0.84, fill, { line: Math.max(1.2, rad * 0.08), lineColor: LINE, depth: rad * 0.16, hi: true, hiW: Math.max(1, rad * 0.07), seed: 3 });
  }
  function cornerSticker(g, kind, x, y, rad) {
    const k = rad / 18;
    if (kind === 'blossom') {
      stickerBase(g, x, y, rad, '#ffe3f1');
      for (let i = 0; i < 5; i++) { const a = i * TAU / 5 - PI / 2; tk.celCircle(g, x + Math.cos(a) * rad * 0.34, y + Math.sin(a) * rad * 0.34, rad * 0.26, PINK, { line: Math.max(1, 1.2 * k), lineColor: LINE, depth: 1.2 * k }); }
      tk.celCircle(g, x, y, rad * 0.18, GOLD, { line: Math.max(1, 1 * k), lineColor: LINE, depth: 0.8 * k });
    } else if (kind === 'smiley') {
      stickerBase(g, x, y, rad, GOLD);
      g.beginPath(); g.arc(x - rad * 0.28, y - rad * 0.15, rad * 0.09, 0, TAU); g.arc(x + rad * 0.28, y - rad * 0.15, rad * 0.09, 0, TAU); g.fillStyle = LINE; g.fill();
      g.beginPath(); g.arc(x, y + rad * 0.02, rad * 0.4, 0.2 * PI, 0.8 * PI); g.lineWidth = Math.max(1.2, rad * 0.1); g.lineCap = 'round'; g.strokeStyle = LINE; g.stroke();
      softDisc(g, x - rad * 0.5, y + rad * 0.16, rad * 0.12, '#ff7eb6', 0.8); softDisc(g, x + rad * 0.5, y + rad * 0.16, rad * 0.12, '#ff7eb6', 0.8);
    } else if (kind === 'star') {
      stickerBase(g, x, y, rad, '#a77bff');
      tk.celFill(g, STAR(x, y + rad * 0.04, rad * 0.58, rad * 0.26, 5, -PI / 2).map((p) => [p[0], p[1], 1]), GOLD, { line: Math.max(1.1, 1.3 * k), lineColor: LINE, depth: 1.6 * k });
    } else {
      stickerBase(g, x, y, rad, '#8fe3c0');
      tk.note(g, x - rad * 0.12, y + rad * 0.26, rad * 0.62, { kind: 'beamed', color: CREAM, line: Math.max(1.2, rad * 0.1) });
    }
  }
  function roundRectPath(g, x, y, w, h, r) {
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arc(x + w - r, y + r, r, -PI / 2, 0); g.lineTo(x + w, y + h - r); g.arc(x + w - r, y + h - r, r, 0, PI / 2);
    g.lineTo(x + r, y + h); g.arc(x + r, y + h - r, r, PI / 2, PI); g.lineTo(x, y + r); g.arc(x + r, y + r, r, PI, PI * 1.5); g.closePath();
  }
  function frameSprite(g, w, h) {
    const fm = frameMetrics(w, h), mx = fm.mx, my = fm.my, cb = fm.cb, r = R('frame', w, h), iw = w - 2 * mx, ih = h - 2 * my;
    // 1. the enamel: deep indigo with a glossy sweep and a few soft sparkles of reflected light
    const lg = g.createLinearGradient(0, 0, w, h); lg.addColorStop(0, '#2a1f66'); lg.addColorStop(0.5, '#1b1446'); lg.addColorStop(1, '#100b2a');
    g.fillStyle = lg; g.fillRect(0, 0, w, h);
    g.save(); g.translate(w * 0.5, h * 0.5); g.rotate(0.5);
    const sg = g.createLinearGradient(-w * 0.1, 0, w * 0.1, 0); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.07)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sg; g.fillRect(-w * 0.1, -h * 2, w * 0.2, h * 4); g.restore();
    g.strokeStyle = A('#ffffff', 0.16); g.lineWidth = 1.2; g.beginPath(); g.moveTo(1.5, h - 1.5); g.lineTo(1.5, 1.5); g.lineTo(w - 1.5, 1.5); g.stroke();
    g.strokeStyle = A('#000000', 0.45); g.beginPath(); g.moveTo(w - 1.5, 1.5); g.lineTo(w - 1.5, h - 1.5); g.lineTo(1.5, h - 1.5); g.stroke();
    // 2. the pink to green pinstripe, twice: round the outer edge and hugging the window
    const stripe = (ins, lw) => {
      const sg2 = g.createLinearGradient(0, 0, w, h); sg2.addColorStop(0, PINK); sg2.addColorStop(0.5, '#ffd0a0'); sg2.addColorStop(1, GREEN);
      g.beginPath(); roundRectPath(g, ins, ins, w - ins * 2, h - ins * 2, Math.max(4, cb * 0.7)); g.lineWidth = lw; g.strokeStyle = sg2; g.stroke();
      g.beginPath(); roundRectPath(g, ins - lw * 0.9, ins - lw * 0.9, w - (ins - lw * 0.9) * 2, h - (ins - lw * 0.9) * 2, Math.max(4, cb * 0.7) + 1); g.lineWidth = 0.9; g.strokeStyle = A(CREAM, 0.55); g.stroke();
    };
    stripe(cb * 0.45, 2.6);
    // 3. the socket row for the marquee bulbs along the top margin (the live glow is drawn by frame())
    for (let i = 0; i < BULBS; i++) { const bx = bulbX(w, mx, i), by = my * 0.5; g.beginPath(); g.arc(bx, by, Math.max(2.6, my * 0.125), 0, TAU); g.fillStyle = '#6a5a3a'; g.fill(); g.beginPath(); g.arc(bx, by, Math.max(2.1, my * 0.095), 0, TAU); g.fillStyle = '#ffe9a8'; g.fill(); g.lineWidth = 1; g.strokeStyle = A(LINE, 0.9); g.stroke(); }
    // 4. the window
    g.clearRect(mx, my, iw, ih);
    // rounded window corners: the enamel fills the gap between the square window and a rounded one
    const rc = Math.max(6, Math.min(mx, my) * 0.42);
    [[mx, my, 1, 1], [mx + iw, my, -1, 1], [mx, my + ih, 1, -1], [mx + iw, my + ih, -1, -1]].forEach((c) => {
      g.save(); g.translate(c[0], c[1]); g.scale(c[2], c[3]);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(rc, 0); g.arc(rc, rc, rc, -PI / 2, PI, true); g.closePath(); g.fillStyle = ENAMEL; g.fill();
      g.restore();
    });
    g.beginPath(); roundRectPath(g, mx + 0.5, my + 0.5, iw - 1, ih - 1, rc); g.lineWidth = 2; g.strokeStyle = A(CREAM, 0.7); g.stroke();
    g.save(); g.beginPath(); roundRectPath(g, mx, my, iw, ih, rc); g.clip();
    // 5. inner bevel shadows
    [[mx, 'x'], [mx + iw, 'x']].forEach((p, i) => { const x0 = p[0], x1 = i ? x0 - 16 : x0 + 16, gr = g.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, A('#100b2a', 0.3)); gr.addColorStop(1, A('#100b2a', 0)); g.fillStyle = gr; g.fillRect(Math.min(x0, x1), my, 16, ih); });
    [[my, my + 14], [my + ih, my + ih - 14]].forEach((p) => { const gr = g.createLinearGradient(0, p[0], 0, p[1]); gr.addColorStop(0, A('#100b2a', 0.3)); gr.addColorStop(1, A('#100b2a', 0)); g.fillStyle = gr; g.fillRect(mx, Math.min(p[0], p[1]), iw, 14); });
    // 6. the Gloss haze creeping in from the edges: an opal vignette and airbrushed film blobs
    const gx = w / 2, vg = g.createRadialGradient(gx, h / 2, Math.min(iw, ih) * 0.4, gx, h / 2, Math.hypot(iw, ih) * 0.56);
    vg.addColorStop(0, A(OPAL, 0)); vg.addColorStop(1, A(OPAL, 0.5)); g.fillStyle = vg; g.fillRect(mx, my, iw, ih);
    const rb = R('mist', w, h), mist = [BLUSH_SHEEN, MINT_SHEEN, LILAC, OPAL_HI];
    for (let i = 0; i < 30; i++) {
      const edge = Math.floor(rb() * 4), u = rb(), rad = 28 + rb() * 44, a = 0.22 + rb() * 0.2, col = mist[Math.floor(rb() * mist.length)];
      let x = mx + u * iw, y = my + u * ih;
      if (edge === 0) y = my - rad * 0.1; else if (edge === 1) y = my + ih + rad * 0.1; else if (edge === 2) x = mx - rad * 0.1; else x = mx + iw + rad * 0.1;
      airbrush(g, x, y, rad, col, a);
    }
    g.restore();
    // 7. four corner stickers
    const cr = Math.max(8, Math.min(mx, my) * 0.56);
    [['blossom', cr * 1.08, cr * 1.0], ['smiley', w - cr * 1.08, cr * 1.0], ['star', cr * 1.08, h - cr * 1.0], ['note', w - cr * 1.08, h - cr * 1.0]].forEach((c) => cornerSticker(g, c[0], c[1], c[2], cr));
  }
  function frame(ctx, w, h, t) {
    w = pos(w, 1280); h = pos(h, 720); t = num(t, 0);
    const spr = ART.sprite('map|frame|' + Math.round(w) + 'x' + Math.round(h), w, h, (g) => frameSprite(g, w, h));
    ART.blit(ctx, spr, 0, 0, w, h);
    const fm = frameMetrics(w, h), mo = tk.motion();
    // the marquee bulbs chase along the top edge: every fifth bulb is lit and the lit ones move along (a still pattern under reduced motion)
    const step = mo > 0.5 ? Math.floor(t * 3.2) : 0, by = fm.my * 0.5, br = Math.max(5, fm.my * 0.34);
    for (let i = 0; i < BULBS; i++) if ((i + step) % 5 === 0) tk.glow(ctx, bulbX(w, fm.mx, i), by, br, '#ffd84d', 0.9);
    // a slow pink to lime shimmer along the window edge; the corner stickers twinkle
    ctx.save();
    ctx.lineWidth = 1; ctx.strokeStyle = A(LIME, clamp(0.12 + 0.12 * Math.sin(t * 1.3) * mo, 0, 1));
    ctx.strokeRect(fm.mx + 1.5, fm.my + 1.5, w - 2 * fm.mx - 3, h - 2 * fm.my - 3);
    ctx.restore();
    const cr = Math.max(8, Math.min(fm.mx, fm.my) * 0.56);
    [[cr * 1.08 + cr * 0.55, cr * 1.0 - cr * 0.55], [w - cr * 1.08 + cr * 0.55, cr * 1.0 - cr * 0.55], [cr * 1.08 + cr * 0.55, h - cr * 1.0 - cr * 0.55], [w - cr * 1.08 + cr * 0.55, h - cr * 1.0 - cr * 0.55]].forEach((c, i) => {
      const a = 0.5 + 0.5 * Math.sin(t * 2 + i * 1.7);
      if (a > 0.35) tk.sparkle(ctx, c[0], c[1], 4 + 3 * a, { color: '#fff8e0', alpha: a, glow: 0.4 });
    });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // FOG EDGE: the seam where live ground meets muted ground: a glowing seam of sparkles under the curled edge of the Gloss film (and a darker opalescent
  // rim where it meets the Blur). One cached strip per boundary side, drawn rotated: cells = [{x, y, mask, voidMask}], bit d of mask = the neighbour
  // across side d (MAP.DIRS order) is muted
  // ---------------------------------------------------------------------------------------------------------------
  const FE_W = 1.5, FE_H = 0.72, FE_OY = 0.2;                         // strip box in units of s, and where the edge line sits inside it
  function noisePoly(x0, x1, y, amp, sd, step) { const pts = []; for (let x = x0; x <= x1 + 0.1; x += step) pts.push([x, y + (U.noise.n1(x * 0.06 + sd * 9.1, sd) * 2 - 1) * amp]); return pts; }
  const strokeLine = (g, line, dy, lw, col) => { g.beginPath(); line.forEach((q, i) => (i ? g.lineTo(q[0], q[1] + dy) : g.moveTo(q[0], q[1] + dy))); g.lineWidth = lw; g.strokeStyle = col; g.stroke(); };
  function featherSprite(g, w, h, s, v, kind) {
    const k = s / BASE, r = R('feather', kind, v), oy = s * FE_OY, x0 = s * (FE_W - 1) / 2, x1 = x0 + s;
    g.save(); g.beginPath(); g.rect(0, oy - s * 0.08, w, h); g.clip();
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (kind === 'void') {                                             // a darker opalescent rim at the Blur: lilac airbrush, a chrome line, mint and blush glints
      const line = noisePoly(x0 - s * 0.1, x1 + s * 0.1, oy + s * 0.01, s * 0.025, v + 3, s * 0.07);
      [0.46, 0.38, 0.3, 0.22, 0.14, 0.08].forEach((wd, i) => strokeLine(g, line, s * 0.04 + wd * s * 0.4, wd * s, A('#a99bd4', 0.05 + i * 0.045)));
      strokeLine(g, line, s * 0.012, 1.6 * k, A(CHROME, 0.85)); strokeLine(g, line, s * 0.045, 1.2 * k, A(MINT_SHEEN, 0.8)); strokeLine(g, line, -s * 0.02, 1 * k, A(BLUSH_SHEEN, 0.7));
    } else {
      const line = noisePoly(x0 - s * 0.06, x1 + s * 0.06, oy + s * 0.03, s * 0.025, v + 1, s * 0.09);
      // a glowing seam on the live side: pink under lime, a bright white core
      strokeLine(g, line, -s * 0.02, 8 * k, A(HOT, 0.14)); strokeLine(g, line, -s * 0.02, 4.4 * k, A(PINK, 0.3)); strokeLine(g, line, 0, 2.4 * k, A(LIME, 0.5)); strokeLine(g, line, 0, 1.2 * k, A('#ffffff', 0.95));
      // the curled edge of the Gloss film, a little way into the muted side: lilac shade, opal body, a white highlight on the roll
      strokeLine(g, line, s * 0.12, s * 0.12, A('#a79dd0', 0.4)); strokeLine(g, line, s * 0.1, s * 0.1, A(OPAL, 0.97)); strokeLine(g, line, s * 0.078, s * 0.03, A('#ffffff', 0.95)); strokeLine(g, line, s * 0.15, 1.1 * k, A(CHROME, 0.9));
      for (let i = 0; i < 2; i++) { const x = lerp(x0 + s * 0.15, x1 - s * 0.15, r()), yy = oy + s * (0.01 + r() * 0.03); tk.sparkle(g, x, yy, (2.8 + r() * 2) * k, { color: i ? '#ffffff' : LIME, glow: 0, alpha: 0.95 }); }
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
  // TOKEN: the party on the hex. ids[0] is the leader (larger, in front), ids[1] the second hero (smaller, behind). Each wears the outfit its owner
  // chose (ART.hero reads the outfit map); the ring under them is a sticker ring in the leader's colour
  // ---------------------------------------------------------------------------------------------------------------
  function token(ctx, heroIds, x, y, t, moving, opts) {
    opts = opts || {};
    const ids = (Array.isArray(heroIds) ? heroIds : [heroIds]).filter((id) => typeof id === 'string').slice(0, 2);
    if (!ids.length) return;
    x = num(x, 0); y = num(y, 0); t = num(t, 0);
    const size = pos(opts.size, BASE), k = size / BASE, dir = opts.dir === -1 ? -1 : 1, mo = tk.motion(), mv = !!moving;
    const bob = mv ? Math.abs(Math.sin(t * 8)) * 3.2 * k * mo : (0.5 + 0.5 * Math.sin(t * 1.9)) * 1.6 * k * mo;
    const ga = ctx.globalAlpha;
    if (opts.alpha !== undefined) ctx.globalAlpha = ga * cA(opts.alpha);
    const lead = DATA.heroes && DATA.heroes[ids[0]], col = lead && typeof lead.color === 'string' && lead.color.charAt(0) === '#' ? lead.color : GOLD;
    // a sticker ring on the hex in the leader's colour (a cream rim, marching dashes inside it), and a faint sound ring breathing out of it
    if (opts.ring !== false) {
      ctx.save(); ctx.translate(x, y + 0.36 * size); ctx.scale(1, 0.34);
      const rr = size * (0.66 + 0.02 * Math.sin(t * 2.4) * mo);
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.lineWidth = 2.2 * k * 3.2; ctx.strokeStyle = A(CREAM, mv ? 0.5 : 0.85); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.setLineDash([size * 0.16, size * 0.1]); ctx.lineDashOffset = -t * size * 0.2 * mo;
      ctx.lineWidth = 2.2 * k * 1.7; ctx.strokeStyle = A(col, mv ? 0.65 : 1); ctx.stroke(); ctx.setLineDash([]);
      if (mo > 0.5) { const a = (t / 2.6) % 1; ctx.beginPath(); ctx.arc(0, 0, rr * (1.02 + 0.45 * a), 0, TAU); ctx.lineWidth = 1.6 * k * 2; ctx.strokeStyle = A(col, 0.5 * (1 - a)); ctx.stroke(); }
      ctx.restore();
    }
    const shadow = (sx, sy, rx, a) => { ctx.save(); ctx.translate(sx, sy); ctx.scale(1, 0.3); ctx.beginPath(); ctx.arc(0, 0, rx * (1 - bob * 0.02), 0, TAU); ctx.fillStyle = A('#1a0a2e', a); ctx.fill(); ctx.restore(); };
    const scF = 0.28 * k, scB = 0.225 * k;
    const fx = x + dir * 0.18 * size, fy = y + 0.4 * size, bx = x - dir * 0.34 * size, by = y + 0.28 * size;
    if (ids.length > 1) { shadow(bx, by + 1, 0.3 * size, 0.28); shadow(fx, fy + 1, 0.4 * size, 0.32); } else shadow(x, fy + 1, 0.4 * size, 0.32);
    const pose = mv ? 'walk' : 'idle';
    if (ids.length > 1) ART.hero.draw(ctx, ids[1], { x: bx, y: by - bob * 0.7, s: scB, pose, t: t + 0.37, flip: dir < 0, shadow: false });
    ART.hero.draw(ctx, ids[0], { x: ids.length > 1 ? fx : x, y: fy - bob, s: scF, pose, t, flip: dir < 0, shadow: false });
    ctx.globalAlpha = ga;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // ROUTE: the dotted path preview: note heads in cream with a pink outline, and the Vox cost pill
  // ---------------------------------------------------------------------------------------------------------------
  const asPts = (pts) => (Array.isArray(pts) ? pts : []).map((q) => (Array.isArray(q) ? [num(q[0], 0), num(q[1], 0)] : [num(q && q.x, 0), num(q && q.y, 0)]));
  // a note head on the path: v0 head only, v1 head and stem, v2 head, stem and flag (drawn to fit the small dab sprite), cream with a pink outline
  function dabSprite(g, w, h, v) {
    const hx = w * 0.38, hy = h * 0.74, rx = w * 0.23, ry = h * 0.17, o = Math.max(0.7, w * 0.07);
    g.lineCap = 'round';
    const pass = (col, grow) => {
      g.fillStyle = col; g.strokeStyle = col;
      if (v > 0) {
        const sx = hx + rx * 0.8; g.beginPath(); g.moveTo(sx, hy - ry * 0.2); g.lineTo(sx, h * 0.12); g.lineWidth = Math.max(0.7, w * 0.1) + grow * 2; g.stroke();
        if (v > 1) { g.beginPath(); g.moveTo(sx, h * 0.12); g.quadraticCurveTo(sx + w * 0.26, h * 0.22, sx + w * 0.16, h * 0.44); g.stroke(); }
      }
      g.beginPath(); g.ellipse(hx, hy, rx + grow, ry + grow, -0.35, 0, TAU); g.fill();
    };
    pass(HOT, o); pass(CREAM, 0);
  }
  // the Vox orb: a round voice orb, pink to mint, with a white waveform across it
  function voxOrb(ctx, x, y, rad, k) {
    const gr = ctx.createLinearGradient(x - rad, y - rad, x + rad, y + rad); gr.addColorStop(0, HOT); gr.addColorStop(0.46, '#ff9acb'); gr.addColorStop(0.54, '#7fe8c4'); gr.addColorStop(1, '#22c397');
    ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fillStyle = gr; ctx.fill(); ctx.lineWidth = Math.max(1, 1.8 * k); ctx.strokeStyle = LINE; ctx.stroke();
    const wv = [0, -0.4, 0.55, -0.7, 0.4, -0.25, 0];
    ctx.beginPath(); wv.forEach((a, i) => { const px = x + (i / (wv.length - 1) - 0.5) * rad * 1.5, py = y + a * rad * 0.6; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1, rad * 0.24) + Math.max(1, rad * 0.2); ctx.strokeStyle = A(LINE, 0.55); ctx.stroke();
    ctx.lineWidth = Math.max(1, rad * 0.24); ctx.strokeStyle = '#ffffff'; ctx.stroke();
  }
  function pill(ctx, x, y, k, text, ok, t) {
    const w = (text.length > 2 ? 64 : 54) * k, h = 28 * k, mo = tk.motion();
    const shake = ok ? 0 : Math.sin(t * 34) * 1.4 * k * mo * (Math.sin(t * 3) > 0.6 ? 1 : 0);
    ctx.save(); ctx.translate(x + shake, y);
    const capsule = (keep) => { if (!keep) ctx.beginPath(); ctx.moveTo(-w / 2 + h / 2, -h / 2); ctx.lineTo(w / 2 - h / 2, -h / 2); ctx.arc(w / 2 - h / 2, 0, h / 2, -PI / 2, PI / 2); ctx.lineTo(-w / 2 + h / 2, h / 2); ctx.arc(-w / 2 + h / 2, 0, h / 2, PI / 2, PI * 1.5); ctx.closePath(); };
    ctx.save(); ctx.translate(2 * k, 3 * k); capsule(); ctx.fillStyle = 'rgba(20,10,40,0.32)'; ctx.fill(); ctx.restore();
    if (ok) { const gr = ctx.createLinearGradient(-w / 2, 0, w / 2, 0); gr.addColorStop(0, PINK); gr.addColorStop(0.38, '#ffd3e6'); gr.addColorStop(0.62, '#d3fff0'); gr.addColorStop(1, '#7fe3b8'); capsule(); ctx.fillStyle = gr; ctx.fill(); }
    else { capsule(); ctx.fillStyle = '#e8383d'; ctx.fill(); }
    ctx.save(); capsule(); ctx.clip(); ctx.beginPath(); ctx.rect(-w, -h, w * 2, h * 2); ctx.translate(2.6 * k, -3.6 * k); capsule(true); ctx.fillStyle = A(ok ? '#7a3f78' : '#7d1230', 0.34); ctx.fill('evenodd'); ctx.restore();
    ctx.save(); capsule(); ctx.clip(); ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h * 0.42); ctx.fillStyle = A('#ffffff', ok ? 0.4 : 0.22); ctx.fill(); ctx.restore();
    capsule(); ctx.lineJoin = 'round'; ctx.lineWidth = 2.4 * k; ctx.strokeStyle = LINE; ctx.stroke();
    voxOrb(ctx, -w / 2 + 15 * k, 0.5 * k, 7.4 * k, k);
    ctx.font = '900 ' + Math.round(17 * k) + 'px ' + tk.font.num; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = 3.6 * k; ctx.strokeStyle = LINE; ctx.strokeText(text, 8 * k, 1 * k); ctx.fillStyle = CREAM; ctx.fillText(text, 8 * k, 1 * k);
    ctx.restore();
  }
  function route(ctx, pts, t, opts) {
    opts = opts || {};
    const P = asPts(pts);
    if (!P.length) return;
    t = num(t, 0);
    const size = pos(opts.size, BASE), k = size / BASE, ok = opts.affordable !== false, mo = tk.motion();
    const wash = ok ? PINK : '#e8383d';
    const ga = ctx.globalAlpha;
    if (opts.alpha !== undefined) ctx.globalAlpha = ga * cA(opts.alpha);
    const dense = P.length > 1 ? tk.flatten(P, { step: 5 }) : P[0].slice();
    const n = dense.length >> 1, cum = [0];
    for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(dense[2 * i] - dense[2 * i - 2], dense[2 * i + 1] - dense[2 * i - 1]));
    const total = cum[n - 1] || 0;
    if (n > 1) {
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';                       // the soft underlay of the path
      ctx.beginPath(); ctx.moveTo(dense[0], dense[1]); for (let i = 1; i < n; i++) ctx.lineTo(dense[2 * i], dense[2 * i + 1]);
      ctx.lineWidth = size * 0.5; ctx.strokeStyle = A(wash, 0.12); ctx.stroke();
      ctx.lineWidth = size * 0.26; ctx.strokeStyle = A(wash, 0.16); ctx.stroke();
      ctx.restore();
      // note heads marching toward the destination
      const sp = size * 0.27, phase = (t * size * 0.55 * mo) % sp, dw = 9.6 * k, dh = 8.4 * k;
      let j = 1;
      for (let i = 0, d = phase; d < total; i++, d += sp) {
        while (j < n - 1 && cum[j] < d) j++;
        const a = cum[j - 1], b = cum[j], u = b > a ? (d - a) / (b - a) : 0;
        const px = lerp(dense[2 * j - 2], dense[2 * j], u), py = lerp(dense[2 * j - 1], dense[2 * j + 1], u);
        const wv = 0.55 + 0.45 * Math.max(0, Math.sin(TAU * ((d / total) * 2.2 - t * 0.9 * mo)));
        const v = (i + Math.floor((t * size * 0.55 * mo) / sp)) % 3, sc = 0.72 + 0.4 * wv;
        const spr = ART.sprite('map|dab|' + v + '|' + Math.round(k * 4) + '|' + (ok ? 1 : 0), dw, dh, (g, ww, hh) => { dabSprite(g, ww, hh, v); if (!ok) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, 0, ww, hh); g.globalCompositeOperation = 'source-over'; } });
        ART.blit(ctx, spr, px - dw * sc / 2, py - dh * sc / 2, dw * sc, dh * sc, (ok ? 0.97 : 0.88) * Math.min(1, d / (size * 0.4) + 0.2));
      }
    }
    // the destination: a cream ring with a pink outline, and the cost pill
    const e = P[P.length - 1], ex = e[0], ey = e[1], rr = size * (0.3 + 0.03 * Math.sin(t * 3.2) * mo);
    ctx.save(); ctx.translate(ex, ey);
    ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.lineWidth = 4.6 * k; ctx.strokeStyle = A(ok ? HOT : '#b0245c', 0.95); ctx.stroke();
    ctx.lineWidth = 2 * k; ctx.strokeStyle = CREAM; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, size * 0.3 + 4.2 * k, 0, TAU); ctx.lineWidth = 1.3 * k; ctx.strokeStyle = A(ok ? PINK : '#ff8a7a', 0.9); ctx.stroke();
    ctx.restore();
    const text = opts.label !== undefined ? String(opts.label) : (typeof opts.cost === 'number' && isFinite(opts.cost) ? String(Math.round(opts.cost)) : '');
    if (text && opts.pill !== false) pill(ctx, ex + size * 0.5, ey - size * 0.86, Math.max(0.8, k), text, ok, t);
    ctx.globalAlpha = ga;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // BRUSH PREVIEW: the cells a Spell would unmute, as one shape with marching sparkle dashes and a sine sheen
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
    const fill = ok ? '#3fd6b0' : '#ff6f6f', lineCol = ok ? '#0f7d63' : '#b0245c';
    const ga = ctx.globalAlpha;
    ctx.save();
    ctx.beginPath(); P.forEach((c) => hexPath(ctx, c[0], c[1], size * 0.985));
    ctx.fillStyle = A(fill, (ok ? 0.26 : 0.2) + 0.1 * pulse); ctx.fill();
    // a sheen sweeping across along a sine path
    ctx.save(); ctx.clip();
    const bx = P.reduce((m, c) => Math.min(m, c[0]), Infinity) - size, bw = P.reduce((m, c) => Math.max(m, c[0]), -Infinity) + size - bx;
    const sx = bx + ((t * 0.5 * mo) % 1.4 - 0.2) * bw, by0 = P.reduce((m, c) => Math.min(m, c[1]), Infinity) - size, strip = size * 0.25, nS = Math.min(48, Math.ceil(P.length * size * 2 / strip));
    for (let i = 0; i < nS; i++) {
      const yy = by0 + i * strip, cx2 = sx + Math.sin(yy * 0.045 + t * 1.2 * mo) * size * 0.22, gr = ctx.createLinearGradient(cx2 - size * 0.5, 0, cx2 + size * 0.5, 0);
      gr.addColorStop(0, A('#ffffff', 0)); gr.addColorStop(0.5, A('#ffffff', ok ? 0.36 : 0.2)); gr.addColorStop(1, A('#ffffff', 0));
      ctx.fillStyle = gr; ctx.fillRect(bx, yy, bw, strip + 0.5);
    }
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
    // marching sparkles along the outline (pink and cream when valid, cream and gold when not), a ring pulse on the cells, or an X on an impossible Spell
    if (outer.length) {
      const nSp = Math.min(16, outer.length), run = (t * 1.4 * mo) % 1;
      for (let i = 0; i < nSp; i++) {
        const q = (i / nSp * outer.length + run * outer.length / nSp * 3) % outer.length, e = outer[Math.floor(q)], u = q - Math.floor(q);
        tk.sparkle(ctx, lerp(e[0], e[2], u), lerp(e[1], e[3], u), (2.6 + 1.6 * ((i * 7) % 3) / 2) * k, { color: i % 2 ? CREAM : (ok ? PINK : GOLD), glow: 0, alpha: 0.95 });
      }
    }
    P.forEach((c, i) => {
      const a = 0.5 + 0.5 * Math.sin(t * 2.6 + i * 1.9);
      if (ok && a > 0.4) { ctx.beginPath(); ctx.arc(c[0] + Math.sin(i * 2.3) * size * 0.25, c[1] + Math.cos(i * 1.7) * size * 0.22, (2.5 + 4 * a) * k, 0, TAU); ctx.lineWidth = Math.max(0.8, 1.2 * k); ctx.strokeStyle = A('#ffffff', a); ctx.stroke(); }
    });
    if (!ok) {
      const c0 = P[0];
      ctx.lineCap = 'round'; ctx.lineWidth = 4.6 * k; ctx.strokeStyle = A(LINE, 0.9);
      ctx.beginPath(); ctx.moveTo(c0[0] - size * 0.2, c0[1] - size * 0.2); ctx.lineTo(c0[0] + size * 0.2, c0[1] + size * 0.2); ctx.moveTo(c0[0] + size * 0.2, c0[1] - size * 0.2); ctx.lineTo(c0[0] - size * 0.2, c0[1] + size * 0.2); ctx.stroke();
      ctx.lineWidth = 2.2 * k; ctx.strokeStyle = CREAM; ctx.stroke();
    }
    ctx.globalAlpha = ga;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // PAINT BLOOM: the reveal (the name stays). The Gloss film peels away from a circular wavefront that spreads from the touch point: inside it the live hex
  // is revealed, the film curls back at the front like the film off a new phone, pink and green sparkles ride the front, three sound rings escape past
  // the hex and a note rises.
  //   ART.map.paintBloom(ctx, x, y, size, p, opts?)   p = 0..1;  opts {tile, seed, ox, oy, fromX, fromY, note}
  //   With opts.tile the bloom UNMUTES the hex (revealed inside the growing circle, over whatever is under it: draw the muted hex first);
  //   without it, it is a neutral wash that fades out over a hex that is already live underneath. opts.note (0..6) tints the rising note.
  // ---------------------------------------------------------------------------------------------------------------
  const NOTE_RAMP = ['#ff7eb6', '#ff9a2e', '#f5c96a', '#3fd6b0', '#5fb4ff', '#7a6bff', '#c49bff'];
  // a circle polygon of 28 points with a gentle six-lobe ripple (wavePath adds it to the current path, waveClip starts a new one)
  function wavePath(ctx, tx, ty, rr, sd, p) {
    const n = 28;
    for (let i = 0; i <= n; i++) {
      const a = (i % n) / n * TAU, kk = 1 + 0.035 * Math.sin(6 * a + sd + 9 * p);
      const px = tx + Math.cos(a) * rr * kk, py = ty + Math.sin(a) * rr * kk;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }
  function waveClip(ctx, tx, ty, rr, sd, p) { ctx.beginPath(); wavePath(ctx, tx, ty, rr, sd, p); }
  function paintBloom(ctx, x, y, size, p, opts) {
    opts = opts || {};
    size = pos(size, BASE); x = num(x, 0); y = num(y, 0); p = clamp(num(p, 0), 0, 1);
    const tile = typeof opts.tile === 'string' ? (WASH[opts.tile] ? opts.tile : 'empty') : null;
    const sd = Math.floor(num(opts.seed, U.hash(Math.round(x), Math.round(y)) & 1023));
    if (p <= 0) return;
    if (p >= 1) { if (tile) hex(ctx, 'painted', x, y, size, { tile, seed: sd }); return; }
    const hue = tile ? washOf(tile).c : '#fff8ec';
    let ox = num(opts.ox, 0), oy = num(opts.oy, 0);
    if (opts.fromX !== undefined && opts.fromY !== undefined) {                       // the wave starts where it arrives from
      const a = Math.atan2(num(opts.fromY, y) - y, num(opts.fromX, x) - x); ox = Math.cos(a) * size * 0.7; oy = Math.sin(a) * size * 0.7;
    }
    const tx = x + ox, ty = y + oy, e = U.ease.outCubic(clamp(p / 0.72, 0, 1)), rr = size * (0.06 + (1.15 + Math.hypot(ox, oy) / size) * e);
    const ga = ctx.globalAlpha, k = size / BASE;
    ctx.save();
    ctx.beginPath(); hexPath(ctx, x, y, size * 1.02); ctx.clip();                                     // the wave itself stays on the hex
    if (tile) {
      ctx.save(); waveClip(ctx, tx, ty, rr, sd, p); ctx.clip();
      hex(ctx, 'painted', x, y, size, { tile, seed: sd });
      ctx.restore();
    } else {
      waveClip(ctx, tx, ty, rr, sd, p); ctx.fillStyle = A(hue, 0.4 * (1 - p * p)); ctx.fill();
    }
    // the film curling back at the front: an opal lip on the muted side with a lilac shade, a chrome edge and a bright highlight
    if (p < 0.9) {
      const fade = 1 - p * 0.9, lw = size * 0.17;
      ctx.save();
      ctx.beginPath(); ctx.rect(x - size * 3, y - size * 3, size * 6, size * 6); wavePath(ctx, tx, ty, rr, sd, p); ctx.clip('evenodd');
      ctx.lineJoin = 'round';
      waveClip(ctx, tx, ty, rr, sd, p);
      ctx.lineWidth = lw * 1.9; ctx.strokeStyle = A('#a79dd0', 0.34 * fade); ctx.stroke();
      ctx.lineWidth = lw * 1.3; ctx.strokeStyle = A(OPAL_HI, 0.97 * fade); ctx.stroke();
      ctx.lineWidth = lw * 0.5; ctx.strokeStyle = A(CHROME, 0.9 * fade); ctx.stroke();
      ctx.restore();
      waveClip(ctx, tx, ty, rr, sd, p); ctx.lineWidth = Math.max(1, size * 0.03); ctx.strokeStyle = A('#ffffff', 0.95 * fade); ctx.stroke();
      waveClip(ctx, tx, ty, rr * 0.72, sd + 1, p); ctx.lineWidth = size * 0.025; ctx.strokeStyle = A('#ffffff', 0.32 * fade); ctx.stroke();
      // pink and green sparkles ride the wavefront
      for (let j = 0; j < 9; j++) {
        const a = j * TAU / 9 + sd * 0.7 + p * 3.2, tw = 0.55 + 0.45 * Math.sin(p * 17 + j * 2.1);
        tk.sparkle(ctx, tx + Math.cos(a) * rr * 1.02, ty + Math.sin(a) * rr * 1.02, size * 0.1 * tw + 1.2 * k, { color: j % 2 ? '#7dffa0' : PINK, glow: 0, alpha: fade * (0.6 + 0.4 * tw) });
      }
    }
    ctx.restore();
    // three sound rings escape the hex (they may leave it), flakes of the film drift off, then a note rises from the corner
    const ringCols = [PINK, '#fff8ec', GREEN];
    for (let i = 0; i < 3; i++) {
      const qd = clamp((p - 0.08 * i) / 0.7, 0, 1);
      if (qd <= 0 || qd >= 1) continue;
      ctx.beginPath(); ctx.arc(tx, ty, rr + size * (0.15 + 0.35 * i) * qd, 0, TAU);
      ctx.globalAlpha = ga * (1 - qd) * 0.7; ctx.lineWidth = Math.max(0.8, size * 0.04); ctx.strokeStyle = ringCols[i]; ctx.stroke();
    }
    for (let j = 0; j < 3; j++) {
      const q2 = clamp((p - 0.1 - 0.07 * j) / 0.6, 0, 1);
      if (q2 <= 0 || q2 >= 1) continue;
      const a = sd * 0.37 + j * 2.1, d = rr + size * (0.1 + 0.45 * q2), fs = size * 0.085;
      ctx.save(); ctx.translate(tx + Math.cos(a) * d, ty + Math.sin(a) * d); ctx.rotate(a + q2 * 4 + j); ctx.globalAlpha = ga * (1 - q2) * 0.9;
      ctx.beginPath(); ctx.moveTo(-fs, -fs * 0.6); ctx.lineTo(fs, -fs * 0.4); ctx.lineTo(fs * 0.6, fs * 0.7); ctx.lineTo(-fs * 0.8, fs * 0.5); ctx.closePath();
      ctx.fillStyle = OPAL_HI; ctx.fill(); ctx.lineWidth = Math.max(0.8, size * 0.02); ctx.strokeStyle = CHROME; ctx.stroke(); ctx.restore();
    }
    ctx.globalAlpha = ga;
    const q = clamp((p - 0.4) / 0.55, 0, 1);
    if (q > 0 && q < 1) {
      const deg = opts.note === undefined ? -1 : Math.floor(num(opts.note, -1)), col = deg >= 0 && deg <= 6 ? NOTE_RAMP[deg] : pal.gold;
      tk.note(ctx, x + size * 0.3, y - size * 0.3 - size * 0.5 * q, size * 0.34, { kind: 'eighth', color: col, alpha: Math.sin(PI * q) });
    }
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
  // bake the sprites a screen will need at `size` ahead of time (call while the screen loads). opts {tiles, done, ms, chapter}: returns how many were baked
  M.warm = (size, opts) => {
    opts = opts || {};
    const before = bakedTotal, until = typeof performance !== 'undefined' && opts.ms > 0 ? performance.now() + opts.ms : Infinity;
    const c = null, ch = chapterOf(opts.chapter);
    const sz = pos(size, BASE), tiles = opts.tiles || L.tiles.filter((x) => x !== 'block');
    const step = (kind, tile, done, v) => { if (typeof performance !== 'undefined' && performance.now() > until) return; bakeBudget = 1e9; hex(c, kind, 0, 0, sz, { tile, done, seed: v, chapter: ch, bakeOnly: true }); };
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
  // page = {tiles:[T], at(q, r), pos:{q, r}, path:[[q, r]] (a route), brush:[[q, r]] (Spell cells), hover:{q, r}}
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
  function samplePage(m, ch) {
    if (!m) return fallbackPage();
    const Mp = m.generate({ chapter: chapterOf(ch), seed: 20260101 });
    const sol = m.solve(Mp);
    (sol.path || []).slice(0, 9).forEach((c) => m.paint(Mp, c[0], c[1]));
    const fr = m.frontier(Mp);
    if (fr.length) { const o = fr[Math.floor(fr.length * 0.35)]; try { m.applyBrush(Mp, 'splash', o.q, o.r, 0); } catch (e) { /* the sheet still draws */ } }
    let n = 0; m.painted(Mp).forEach((T) => { if (T.type !== 'empty' && T.type !== 'start' && n < 2) { T.done = true; n++; } });
    const lastP = (sol.path || [])[Math.min(8, (sol.path || []).length - 1)];
    if (lastP) Mp.pos = { q: lastP[0], r: lastP[1] };
    const nxt = m.solve(Mp);
    const fr2 = m.frontier(Mp);
    // a line Spell ('stroke') starts on a live hex near the party and runs into the fog (DESIGN 4.8), away from the previewed route
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
    const ch = chapterOf(o.chapter);
    paper(g, W, H, camX, camY, z, { t, chapter: ch });
    g.save(); g.beginPath(); g.rect(inner.x, inner.y, inner.w, inner.h); g.clip();
    const painted = (q, r) => { const T = page.at(q, r); return !!(T && T.painted); };
    const kindAt = (q, r) => { const T = page.at(q, r); if (!T) return 'off'; if (T.painted) return 'painted'; return T.type === 'block' ? 'void' : 'fog'; };
    const vis = page.tiles.filter((T) => { const c = scr(T.q, T.r); return c.x > inner.x - size * 1.2 && c.x < inner.x + inner.w + size * 1.2 && c.y > inner.y - size * 1.2 && c.y < inner.y + inner.h + size * 1.2; });
    vis.sort((a, b) => a.r - b.r || a.q - b.q);
    const cells = [];
    const nearSet = {};                                                // the 19 live hexes nearest the party, within 3
    vis.filter((T) => T.painted && !T.done && hexDist(T.q, T.r, page.pos.q, page.pos.r) <= 3).sort((a, b) => hexDist(a.q, a.r, page.pos.q, page.pos.r) - hexDist(b.q, b.r, page.pos.q, page.pos.r)).slice(0, 19).forEach((T) => { nearSet[T.q + ',' + T.r] = true; });
    vis.forEach((T) => {
      const c = scr(T.q, T.r), seed = U.hash(T.q, T.r);
      let touch = false;
      for (let d = 0; d < 6; d++) if (painted(T.q + DIRS[d][0], T.r + DIRS[d][1])) touch = true;
      if (T.painted) {
        hex(g, 'painted', c.x, c.y, size, { tile: T.type, seed, done: T.done, t, near: !!nearSet[T.q + ',' + T.r], chapter: ch });
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
    [2, 3].forEach((ch) => cells.push({ label: 'empty, Act ' + (ch === 2 ? 'II' : 'III'), kind: 'painted', tile: 'empty', chapter: ch }));
    ART.sheetGrid(canvas, params, cells, (g, c, w, h, i) => {
      g.fillStyle = PAPER_BASE; g.fillRect(0, 0, w, h);
      const s = Math.min(w / 2.05, h / 2.2);
      if (c.kind === 'hover' || c.kind === 'target' || c.kind === 'path') hex(g, 'painted', w / 2, h / 2, s, { tile: 'empty', seed: i });
      hex(g, c.kind, w / 2, h / 2, s, { tile: c.tile, done: c.done, seed: i, t, chapter: c.chapter });
    }, { bg: 'paper', title: 'ART.map.hex: every kind and every tile colour, muted Gloss versus live candy (overlays hover, target, path shown over ground; bare Path ground in Acts II and III)', cols: 8 });
  });
  ART.sheet('map_page', (canvas, params) => {
    const g = canvas.getContext('2d'), W = num(params.w, 1600), H = num(params.h, 900);
    return loadMapModule().then((m) => {
      const page = samplePage(m, params.chapter);
      g.fillStyle = pal.night; g.fillRect(0, 0, W, H);
      fitDesign(g, W, H, (dw, dh) => drawPage(g, dw, dh, page, { zoom: num(params.zoom, 0.8), t: num(params.t, 0), moving: !!params.moving, cx: params.cx, cy: params.cy, chapter: params.chapter }));
    });
  });
  ART.sheet('map_frame', (canvas, params) => {
    const g = canvas.getContext('2d'), W = num(params.w, 1600), H = num(params.h, 900), t = num(params.t, 0);
    g.fillStyle = pal.night; g.fillRect(0, 0, W, H);
    fitDesign(g, W, H, (dw, dh) => {
      paper(g, dw, dh, 700, 400, 1, { t, chapter: params.chapter });
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
      if (c.tile) { hex(g, 'fog', w / 2, h / 2, s, { seed: c.seed }); paintBloom(g, w / 2, h / 2, s, c.p, { tile: c.tile, seed: c.seed, note: c.seed % 7, fromX: w / 2 - s * 2, fromY: h / 2 - s * 0.4 }); }
      else { hex(g, 'painted', w / 2, h / 2, s, { tile: 'event', seed: c.seed }); paintBloom(g, w / 2, h / 2, s, c.p, { seed: c.seed }); }
    }, { bg: 'paper', cols: 8, title: 'ART.map.paintBloom film strip (the Gloss film peels back from a wavefront that starts at the left edge; last row is the neutral overlay)' });
  });
  ART.sheet('map_token', (canvas, params) => {
    const pairs = [['hanae', 'kuro'], ['kuro', 'suzu'], ['suzu', 'raiga'], ['raiga', 'hanae']];
    const cells = [];
    pairs.forEach((pr) => [false, true].forEach((mv) => [1, 1.8].forEach((z) => cells.push({ label: pr.join('+') + (mv ? ' walk' : ' idle') + ' x' + z, pr, mv, z }))));
    const t = num(params.t, 0);
    ART.sheetGrid(canvas, params, cells, (g, c, w, h, i) => {
      g.fillStyle = PAPER_BASE; g.fillRect(0, 0, w, h);
      const s = Math.min(w / 2.1, h / 2.0);
      hex(g, 'painted', w / 2, h / 2, s, { tile: 'empty', seed: i, chapter: 1 + (i % 3) });
      token(g, c.pr, w / 2, h / 2, t + i * 0.13, c.mv, { size: s, dir: i % 4 === 3 ? -1 : 1 });
    }, { bg: 'paper', cols: 8, title: 'ART.map.token: leader in front, second hero behind, a sticker ring in the leader\'s colour; idle bob and walk' });
  });
  ART.sheet('map_paper', (canvas, params) => {
    const g = canvas.getContext('2d'), W = num(params.w, 1600), H = num(params.h, 900), t = num(params.t, 0);
    const views = [[420, 700, 0.5, 1], [420, 700, 0.5, 2], [420, 700, 0.5, 3], [-300, 300, 0.8, chapterOf(params.chapter)]];
    const cw = W / 2, ch = H / 2;
    views.forEach((v, i) => { g.save(); g.translate((i % 2) * cw, Math.floor(i / 2) * ch); g.beginPath(); g.rect(0, 0, cw - 2, ch - 2); g.clip(); paper(g, cw, ch, v[0], v[1], v[2] * Math.min(cw / 1280, ch / 720) * 1.6, { t, chapter: v[3] }); g.restore(); });
  });
  ART.sheet('map_doodles', (canvas, params) => {
    const names = Object.keys(DOODLES);
    ART.sheetGrid(canvas, params, names, (g, id, w, h) => {
      g.fillStyle = PAPER_BASE; g.fillRect(0, 0, w, h);
      const d = DOODLES[id], k = Math.min(w / d.w, h / d.h) * 0.9;
      drawDoodle(g, id, w / 2, h / 2, k, 1, 0, 0.9);
    }, { bg: 'paper', cols: 4, title: 'ART.map.paper doodles: van, mic stand, gulls, blossom, phones, hearts, ring light, speaker, notes, waves, stars (drawn at 0.9 alpha here; the game uses 0.45 to 0.8)' });
  });
})();
