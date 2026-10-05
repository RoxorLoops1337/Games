// Hocus Vocus -- ART.card: the card illustrator. Paints the illustration window of every card and the 59 motifs. Extends ART (art.js); these
// members REPLACE the placeholders of art.js by plain assignment.
//
// PUBLIC API (DESIGN 5.6, HV_ART_AUDIO 5)
//   ART.card.draw(ctx, cardIdOrInst, w, h, t?)
//        Paints the card's illustration window at (0, 0) of the current transform, w x h (about 170 x 116 at hand size; any size, any aspect
//        ratio: the scene is composed in a virtual window 116 high and as wide as the ratio says, so a wide window shows more scene and a
//        card looks the same at every size). cardIdOrInst is a DATA.cards id or a deck instance / DATA.resolveCard result ({id, up}); an
//        unknown id or hostile argument draws a fallback (a plain card ground), never throws.
//        WITHOUT t it is one cached blit (ART.sprite, one sprite per id + upgrade + size + quality). WITH t (absolute seconds, the hover state)
//        the background and the hero sticker stay cached and the motif breathes and animates, sparkles twinkle, glitter drifts, foreground
//        blossom sprigs sway and a rare card gets a slow shimmer. ART.tk.opt.reduceMotion turns the live draw into the still one.
//        Upgraded cards (inst.up): a warm golden aura hugging the window edges, gold corner ticks and more glints.
//   ART.card.motif(ctx, motifId, x, y, size, palette, t?)
//        One of the 59 LISTS.motifs, centred on (x, y) in a size x size box. palette is a LISTS.palettes name, an ART.tk.fam object or {name}
//        (unknown = ash). Detail follows the pixel size (24 px icons get chunky outlines and no fine detail), so ART.icon can reuse it for the
//        ids LISTS.motifs and LISTS.relicIcons share. Uncached: icon callers cache with ART.sprite. t (seconds) animates; without it the drawing is still.
//   Extras beyond DESIGN
//   ART.card.motifIds() -> the 59 ids       ART.card.warm(ids, w, h, budgetMs?) -> n   pre-bakes card sprites (call while a screen loads)
//   ART.card._spec(id, up) -> the composition decisions of a card (background, side, pose, scenery...), for tests and tools
//   ART.card._motif(ctx, id, x, y, size, palette, t, opts)   opts {detail 0..2, rot, flip, seed, variant, pxk}: what the card composition calls
//   ART.sprite.maxCount is raised to at least 640: a deck view bakes a sprite per card on top of the hero part sprites (pixel cap unchanged).
//   Gallery sheets: motifs (all 59; params ids=a,b size=N pal=name variants=3 seed=N anim=1 t=s nosmall=1; hero=1 or hero=hanae,kuro shows the 31 cards
//   that draw their hero as full card illustrations), cards_hanae cards_kuro cards_suzu
//   cards_raiga (every card of the hero with its name and cost, 12 per page: ?page=N per=N cols=N up=1 anim=1 t=s cw=120 for an exact window
//   width) and cards_junk (curses and status cards).
//
// THE LOOK (HV_ART_AUDIO 1 and 5): the owners' chibi house style, a sticker on a stage. A chunky, confident warm-brown line (LN, the cast's own
// ink) of even width, flat cel colour with ONE hard warm shadow, one thin lit-side highlight and a glossy shine, round bouncy shapes, small
// sparkles and music notes as the magic. No halftone, no grain, no tapered calligraphy, no gold leaf. The light comes from the upper right.
//
// HOW A CARD IS COMPOSED (everything is seeded from the card id, so the set is stable and no two cards match)
//   1. A ground, one of six layouts weighted by card type, palette and motif: dusk (a stage at golden hour: warm sky, a sun, puffy clouds, a
//      stage lip and one spotlight), wash (a pastel gig-poster wash with a ring of sparkles), burst (comic focus rays), split (the duo card's hard
//      diagonal between two tones of the palette), night (a starry night with a big moon), ring (a spotlight circle on a stage floor). Pale palette
//      families (moon, gold) are pulled into a deep ground so the light motifs read. Optional pattern (dots, checker stage floor, tiny stars) and
//      scenery (bunting, gulls, a fairy-light string, a far stage arch), a soft streamer swash, a soft dark spot behind the motif.
//   2. A tone-on-tone silhouette stamp of a secondary motif from the palette's family, in the corner away from the hero.
//   3. When art.hero is true the owning hero as a die-cut sticker (ART.hero.draw, always skin 'stage', pose attack, block or cast at its key moment)
//      cut into the scene, on the side away from the motif: a soft halo in the hero's own colour behind, a soft dark drop shadow, a cream sticker
//      edge (the silhouette blitted at eight offsets), a fade into the ground at the bottom. It bakes at the card's own pixel size, so it stays crisp.
//   4. The motif, big, rotated, scaled and mirrored per card, with its own per-card variant (S.variant) where a motif has several designs.
//   5. Foreground framing (blossom sprigs, drifting petals, bokeh discs, falling notes or warm sparkles) in a corner, glitter, a soft vignette.
//   Curses are a grumpy grey-violet jinx (the colour drained to lilac grey, a pastel Gloss smear, a little frowny sticker); status cards are
//   cards buffed too smooth by the Gloss (pastel sheen bands, a polite smile sparkle, a little static of glitter).
//
// THE MOTIFS. Each is fn(S) drawing in a 100 x 100 design space centred on (0, 0), y down, light from the upper right. S (makeS) carries the palette
// (S.f: base light dark glow plus the derived body, bodyS, bodyL, bodyD, alt, altS, altL, shade, pale, hot, mid, dim), the detail level S.d (0 icon, 1 small,
// 2 card), seeded rng S.rng(salt), S.variant(n), S.pulse and S.wave (0 when still), and the sticker toolkit: S.cel (flat cel, hard shadow, outline),
// S.fillU (one outline round a union of shapes), S.tube (a fat outlined cable or ribbon), S.note, S.spark, S.heart, S.rings, S.arc and thin wrappers
// (S.ink, S.line, S.fill, S.glow, S.circle, S.ring, S.dash, S.at). Outlines never fall under a readable pixel width. Determinism: no clock, no banned
// random call; everything derives from the card id.
(() => {
  'use strict';
  const tk = ART.tk, pal = tk.pal;
  const TAU = Math.PI * 2, PI = Math.PI;
  const clamp = tk.clamp, lerp = tk.lerp, num = tk.num;
  const atan2 = Math.atan2, sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max, floor = Math.floor, asin = Math.asin, sqrt = Math.sqrt;
  const cA = (a) => (a >= 0 ? (a <= 1 ? a : 1) : 0);
  const INK = pal.ink;
  const arcPts = tk.arcPts;
  const LIGHT = tk.light;

  // the shared sticker colours (HV_ART_AUDIO 1): the cast's warm brown line, cream, gold, the duo's pink and green
  const LN = '#2d170f', LN2 = '#6b3a28';
  const CREAM = '#fff8ec', GOLD = '#ffd84d', GOLD2 = '#fff1a8', PINK = '#ff7eb6', PINK2 = '#ffc2dc', GREEN = '#3fcf6a', LIME = '#c6ff3d', ORANGE = '#ff9a2e', RED = '#ff5a5f', SKY = '#8fd8ff', STEEL = '#c9cbd6';

  // ---------------------------------------------------------------------------------------------------------------
  // colour: the warm cel shadow, lightness fitting and the second hue of a family
  // ---------------------------------------------------------------------------------------------------------------
  const hslM = new Map();
  function toHsl(hex) {
    let v = hslM.get(hex);
    if (v) return v;
    const c = U.color.rgb(hex), r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    const mx = max(r, g, b), mn = min(r, g, b), l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    v = [h, s, l];
    if (hslM.size > 800) hslM.clear();
    hslM.set(hex, v);
    return v;
  }
  const hsl = (h, s, l) => U.color.hsl(h, s, l);
  const warm = (hex, dl) => { const v = toHsl(hex); return hsl(v[0] - 5, clamp(v[1] * 1.06, 0, 1), clamp(v[2] - (dl === undefined ? 0.13 : dl), 0, 1)); };
  const fitL = (hex, lo, hi) => { const v = toHsl(hex); return hsl(v[0], v[1], clamp(v[2], lo, hi)); };
  const hueTo = (hex, deg) => { const v = toHsl(hex); return hsl(v[0] + deg, v[1], v[2]); };
  const lit = (hex, k) => tk.mix(hex, '#ffffff', k === undefined ? 0.45 : k);

  // ---------------------------------------------------------------------------------------------------------------
  // palettes: the art.js family plus the derived tones every motif needs. body is the family's base fitted to a lightness that reads on any
  // ground (ink and ash are lifted, moon is eased down); alt is its second hue (pink beside green), so every motif can use two colours
  // ---------------------------------------------------------------------------------------------------------------
  const EXT = new Map();
  function famOf(p) {
    if (p && typeof p === 'object' && p.base) return p;
    return tk.fam(typeof p === 'string' ? p : (p && p.name) || 'ash');
  }
  function ext(fin) {
    const key = fin.base + fin.light + fin.dark + fin.glow;
    let e = EXT.get(key);
    if (!e) {
      const dull = toHsl(fin.base)[1] < 0.3;
      const body = fitL(tk.mix(fin.base, fin.light, 0.16), 0.52, 0.78);
      const alt = fitL(dull ? PINK : hueTo(fin.base, 150), 0.52, 0.72);
      e = {
        base: fin.base, light: fin.light, dark: fin.dark, glow: fin.glow,
        shade: tk.shade(fin.base), deep: tk.deep(fin.base, 0.5), pale: tk.tint(fin.light, 0.55), hot: tk.tint(fin.glow, 0.72),
        mid: tk.mix(fin.base, fin.dark, 0.5), shadeL: tk.shade(fin.light), dim: tk.mix(fin.dark, INK, 0.55),
        body, bodyS: warm(body, 0.16), bodyL: lit(body, 0.5), bodyD: tk.mix(body, LN, 0.55),
        alt, altS: warm(alt, 0.16), altL: lit(alt, 0.5),
      };
      EXT.set(key, e);
    }
    return e;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // geometry helpers
  // ---------------------------------------------------------------------------------------------------------------
  const bez2 = (p0, c, p1, n) => {
    const o = [];
    for (let i = 0; i <= n; i++) { const u = i / n, v = 1 - u; o.push([v * v * p0[0] + 2 * v * u * c[0] + u * u * p1[0], v * v * p0[1] + 2 * v * u * c[1] + u * u * p1[1]]); }
    return o;
  };
  const bez3 = (p0, c0, c1, p1, n) => {
    const o = [];
    for (let i = 0; i <= n; i++) { const u = i / n, v = 1 - u; o.push([v * v * v * p0[0] + 3 * v * v * u * c0[0] + 3 * v * u * u * c1[0] + u * u * u * p1[0], v * v * v * p0[1] + 3 * v * v * u * c0[1] + 3 * v * u * u * c1[1] + u * u * u * p1[1]]); }
    return o;
  };
  // crescent between A and B: the outer edge bulges by bo, the inner by bi (both toward -normal for positive values)
  function crescent(A, B, bo, bi, n) {
    const dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy) || 1, nx = dy / l, ny = -dx / l;
    const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2;
    const outer = bez2(A, [mx + nx * bo * 2, my + ny * bo * 2], B, n || 14);
    const inner = bez2(B, [mx + nx * bi * 2, my + ny * bi * 2], A, n || 14);
    return { poly: outer.concat(inner.slice(1, -1)), outer, inner: inner.slice().reverse() };
  }
  const rayLen = (cx, cy, a, r, lim) => { const c = cos(a), sn = sin(a); let k = r; if (c > 1e-4) k = min(k, (lim - cx) / c); else if (c < -1e-4) k = min(k, (-lim - cx) / c); if (sn > 1e-4) k = min(k, (lim - cy) / sn); else if (sn < -1e-4) k = min(k, (-lim - cy) / sn); return max(0, k); };
  const rot2 = (x, y, a) => [x * cos(a) - y * sin(a), x * sin(a) + y * cos(a)];
  const polar = (cx, cy, r, a) => [cx + cos(a) * r, cy + sin(a) * r];
  function starPts(cx, cy, n, r0, r1, rot) {
    const o = [];
    for (let i = 0; i < n * 2; i++) { const a = (rot || 0) + i * PI / n - PI / 2, r = i % 2 ? r0 : r1; o.push([cx + cos(a) * r, cy + sin(a) * r]); }
    return o;
  }
  // lightning polyline from a to b with seeded wander
  function boltPts(x0, y0, x1, y1, jag, n, rr) {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, pts = [[x0, y0]];
    for (let i = 1; i < n; i++) { const u = i / n, off = (rr() - 0.5) * 2 * jag * (0.35 + 0.65 * sin(u * PI)); pts.push([x0 + dx * u + nx * off, y0 + dy * u + ny * off]); }
    pts.push([x1, y1]);
    return pts;
  }
  // cherry petal pointing up from the origin: a smooth teardrop that widens toward a notched tip (tip at (0, -len))
  function petalShape(len, wid, notch) {
    const n = notch === undefined ? 0.12 : notch;
    const half = (sd) => bez3([0, 0], [sd * wid * 0.1, -len * 0.16], [sd * wid * 0.78, -len * 0.24], [sd * wid * 0.62, -len * 0.64], 8).slice(1)
      .concat(bez3([sd * wid * 0.62, -len * 0.64], [sd * wid * 0.5, -len * 0.88], [sd * wid * 0.3, -len * 1.03], [sd * wid * 0.1, -len * 0.99], 6).slice(1), [[sd * wid * 0.03, -len * (1 - n)]]);
    return { poly: [[0, 0]].concat(half(1), half(-1).reverse()) };
  }
  const petalPts = petalShape;
  // position and unit tangent at fraction u along a polyline of [x, y] points
  function polyAt(pts, u) {
    let tot = 0; const L = [0];
    for (let i = 1; i < pts.length; i++) { tot += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); L.push(tot); }
    const target = clamp(u, 0, 1) * tot;
    let i = 1; while (i < pts.length - 1 && L[i] < target) i++;
    const a = pts[i - 1], b = pts[i], seg = L[i] - L[i - 1] || 1, k = clamp((target - L[i - 1]) / seg, 0, 1), dx = b[0] - a[0], dy = b[1] - a[1], dl = Math.hypot(dx, dy) || 1;
    return { x: a[0] + dx * k, y: a[1] + dy * k, tx: dx / dl, ty: dy / dl };
  }
  const leafPts = (len, wid) => [[0, 0, 1], [wid * 0.5, -len * 0.32], [wid * 0.34, -len * 0.74], [0, -len, 1], [-wid * 0.34, -len * 0.74], [-wid * 0.5, -len * 0.32]];
  const ellN = (rx, ry) => clamp(Math.round(max(rx, ry) / 2.2) + 8, 10, 22);
  // a spiral from radius r0 to r1, a0 to a0 + turns turns
  function spiralPts(cx, cy, r0, r1, a0, turns, n) {
    const o = [];
    for (let i = 0; i <= n; i++) { const u = i / n, a = a0 + u * turns * TAU, r = lerp(r0, r1, u); o.push([cx + cos(a) * r, cy + sin(a) * r]); }
    return o;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // the motif context S: everything a motif needs, in a 100 x 100 design space centred on (0, 0)
  // ---------------------------------------------------------------------------------------------------------------
  function makeS(g, id, f, size, t, o) {
    o = o || {};
    const pxk = o.pxk > 0 ? o.pxk : 1;
    const real = size * pxk;
    let d = o.detail !== undefined ? o.detail : (real >= 76 ? 2 : real >= 34 ? 1 : 0);
    if (tk.lowQ() && d > 1) d = 1;
    const live = t !== undefined && t !== null && !(tk.opt && tk.opt.reduceMotion);
    const S = { g, id, f, t: live ? t : 0, anim: live, d, seed: o.seed | 0, sc: size / 100 * pxk, size };
    const minLine = d === 0 ? 1.7 : d === 1 ? 1.3 : 1.05, minThin = d === 0 ? 1.0 : 0.75;
    S.L = (w) => max(w, minLine / S.sc);                        // outline widths never fall under a readable pixel width
    S.T = (w) => max(w, minThin / S.sc);                        // thin detail strokes
    S.rng = (salt) => tk.rng('cm', id, S.seed, salt === undefined ? '' : salt);
    S.variant = (n) => (o.variant !== undefined ? floor(num(o.variant, 0)) % n : floor(tk.rng('cmv', id, S.seed)() * n) % n);
    S.pulse = (period, phase) => (S.anim ? 0.5 + 0.5 * sin(TAU * (S.t / (period || 2) + (phase || 0))) : 0.5);
    S.wave = (period, phase) => (S.anim ? sin(TAU * (S.t / (period || 2) + (phase || 0))) : 0);
    S.tw = (i, rate) => (S.anim ? 0.6 + 0.4 * sin(S.t * (rate || 3.2) + i * 1.9) : 1);       // a twinkle factor per sparkle
    S.fr = (period, phase) => { const v = S.t / (period || 2) + (phase || 0); return S.anim ? v - floor(v) : 0.5; };   // a 0..1 saw for loops (rises, rings)
    // flat cel: base, ONE hard warm shadow, a thin lit-side highlight, the brown outline. oo as tk.celFill; hi true = the base lifted toward white
    S.cel = (shape, base, oo) => {
      const o2 = Object.assign({ line: S.L(2.5), lineColor: LN, shadow: warm(base), hi: d ? true : false, hiW: S.L(1.6), hiAlpha: 0.85, seed: S.seed, wobble: 0.03, weightVar: 0.4 }, oo);
      if (o2.hi === true || o2.hi === 'auto') o2.hi = lit(base, 0.5);
      if (o2.shadow === true) o2.shadow = warm(base);
      tk.celFill(g, shape, base, o2);
    };
    S.ell = (cx, cy, rx, ry, base, oo, rot) => S.cel(tk.ellipsePts(cx, cy, max(0.2, rx), max(0.2, ry), ellN(rx, ry), rot || 0), base, oo);
    S.circ = (cx, cy, r, base, oo) => S.ell(cx, cy, r, r, base, oo);
    S.ink = (pts, oo) => tk.inkPath(g, pts, Object.assign({ color: LN, wobble: 0.04, seed: S.seed, taper: 0.3 }, oo, { w: S.T((oo && oo.w) || 1.5) }));
    S.line = (pts, oo) => tk.inkPath(g, pts, Object.assign({ color: LN, wobble: 0.04, seed: S.seed, taper: 0.15 }, oo, { w: S.L((oo && oo.w) || 2.5) }));
    S.fill = (shape, color, alpha) => {
      g.save(); if (alpha !== undefined) g.globalAlpha *= cA(alpha);
      g.beginPath(); tk.trace(g, shape); g.fillStyle = color; g.fill(); g.restore();
    };
    S.glow = (x, y, r, color, a) => tk.glow(g, x, y, r, color || f.glow, a === undefined ? 0.5 : a);
    S.spark = (x, y, r, oo) => { if (d === 0 && r < 5) return; tk.sparkle(g, x, y, r, Object.assign({ color: CREAM, glow: d ? 0.4 : 0, thin: 0.2 }, oo)); };
    S.circle = (x, y, r, color, alpha) => { g.save(); if (alpha !== undefined) g.globalAlpha *= cA(alpha); g.beginPath(); g.arc(x, y, max(0.1, r), 0, TAU); g.fillStyle = color; g.fill(); g.restore(); };
    S.ring = (x, y, r, w, color, alpha) => { g.save(); if (alpha !== undefined) g.globalAlpha *= cA(alpha); g.beginPath(); g.arc(x, y, max(0.1, r), 0, TAU); g.strokeStyle = color; g.lineWidth = S.T(w); g.stroke(); g.restore(); };
    S.dash = (x, y, rx, ry, w, color, alpha, dash, off) => {
      g.save(); if (alpha !== undefined) g.globalAlpha *= cA(alpha);
      g.beginPath(); g.ellipse(x, y, max(0.1, rx), max(0.1, ry), 0, 0, TAU); g.strokeStyle = color; g.lineWidth = S.T(w); g.setLineDash(dash || [4, 3]); g.lineDashOffset = off || 0; g.stroke(); g.setLineDash([]); g.restore();
    };
    S.at = (x, y, a, sx, sy, fn) => { g.save(); g.translate(x, y); if (a) g.rotate(a); if (sx !== undefined) g.scale(sx, sy === undefined ? sx : sy); fn(); g.restore(); };
    // a plain round-ended stroke along pts (smoothed), for glints, strings and soft bands
    S.path = (pts, w, color, alpha, tension) => {
      g.save(); if (alpha !== undefined) g.globalAlpha *= cA(alpha);
      g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = max(0.2, w); g.strokeStyle = color; g.beginPath(); tk.trace(g, pts, 0, 0, tension === undefined ? 0.6 : tension, false); g.stroke(); g.restore();
    };
    // a fat outlined tube along pts (cables, strings, sound ribbons): brown underlay, body, a warm shade edge below left, a lit edge above right
    S.tube = (pts, w, col, oo) => {
      oo = oo || {};
      const ol = S.L(oo.ol || 2.3), tn = oo.tension === undefined ? 0.6 : oo.tension;
      S.path(pts, w + ol * 2, LN, oo.alpha, tn);
      S.path(pts, w, col, oo.alpha, tn);
      if (d && w > 4.5 && oo.flat !== true) {
        g.save(); if (oo.alpha !== undefined) g.globalAlpha *= cA(oo.alpha);
        g.lineCap = 'round'; g.lineJoin = 'round';
        const sx = -cos(LIGHT) * w * 0.24, sy = -sin(LIGHT) * w * 0.24;
        g.lineWidth = w * 0.34; g.strokeStyle = oo.shade || warm(col, 0.14); g.beginPath(); tk.trace(g, pts, sx, sy, tn, false); g.stroke();
        g.lineWidth = w * 0.18; g.strokeStyle = oo.hi || lit(col, 0.55); g.beginPath(); tk.trace(g, pts, -sx * 0.8, -sy * 0.8, tn, false); g.stroke();
        g.restore();
      }
    };
    // one outline round a UNION of shapes (a cloud, a note, a boombox): path(g) adds every sub-shape to the current path. Sub-shapes must not overlap
    // (the shade is cut with an even-odd clip): for overlapping puffs build one polygon with unionPoly and use S.cel. Flat colour, one hard shadow
    // on the lower left, a thin lit edge on the upper right, the brown outline outside. o: {ol, shade, hi, depth, hiW, decor(g) drawn inside, clip}
    S.fillU = (path, col, oo) => {
      oo = oo || {};
      const ol = S.L(oo.ol || 2.5), depth = oo.depth === undefined ? 3 : oo.depth, sdx = -cos(LIGHT), sdy = -sin(LIGHT);
      g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath(); path(g); g.strokeStyle = LN; g.lineWidth = ol * 2; g.stroke(); g.fillStyle = LN; g.fill();
      g.beginPath(); path(g); g.fillStyle = col; g.fill();
      const region = (dx, dy) => { g.beginPath(); g.rect(-300, -300, 600, 600); g.save(); g.translate(dx, dy); path(g); g.restore(); g.clip('evenodd'); };
      if (oo.shade !== false) { g.save(); g.beginPath(); path(g); g.clip(); region(-sdx * depth, -sdy * depth); g.fillStyle = oo.shade || warm(col); g.fillRect(-300, -300, 600, 600); g.restore(); }
      if (oo.decor) { g.save(); g.beginPath(); path(g); g.clip(); oo.decor(g); g.restore(); }
      if (d && oo.hi !== false) { g.save(); g.beginPath(); path(g); g.clip(); region(sdx * (oo.hiW || S.L(1.5)), sdy * (oo.hiW || S.L(1.5))); g.globalAlpha *= 0.85; g.fillStyle = oo.hi && oo.hi !== true ? oo.hi : lit(col, 0.5); g.fillRect(-300, -300, 600, 600); g.restore(); }
      g.restore();
    };
    // a chunky outlined music note (kind eighth, quarter, beamed or double): brown ink pass round the whole glyph, then the colour
    S.note = (x, y, sz, oo) => {
      oo = oo || {};
      const kind = oo.kind || 'eighth', col = oo.color || CREAM, hw = sz * 0.5, hh = sz * 0.37, sh = sz * 1.55, sw = sz * 0.17, rot = oo.rot || 0, ol = S.L(oo.ol || max(1.8, sz * 0.14));
      const glyph = (gg) => {
        const head = (hx, hy) => { gg.moveTo(hx + hw, hy); gg.ellipse(hx, hy, hw, hh, -0.38, 0, TAU); };
        const stem = (hx, hy, top) => { const sx = hx + hw * 0.72; gg.rect(sx - sw / 2, hy - top, sw, top); };
        if (kind === 'beamed' || kind === 'double') {
          const ax = -hw * 1.25, bx = hw * 1.25, by = -sz * 0.34;
          const yL = -sh * 0.96, yR = by - sh * 0.96, xL = ax + hw * 0.72 - sw / 2, xR = bx + hw * 0.72 + sw / 2;
          head(ax, 0); head(bx, by); stem(ax, 0, sh * 0.96); stem(bx, by, sh * 0.96);
          gg.moveTo(xL, yL); gg.lineTo(xR, yR); gg.lineTo(xR, yR + sz * 0.3); gg.lineTo(xL, yL + sz * 0.3); gg.closePath();
        } else {
          head(0, 0); stem(0, 0, sh);
          if (kind === 'eighth') { const sx = hw * 0.72 + sw / 2, ty = -sh; gg.moveTo(sx - sw, ty); gg.bezierCurveTo(sx + sz * 0.1, ty + sz * 0.2, sx + sz * 0.65, ty + sz * 0.5, sx + sz * 0.42, ty + sz * 1.05); gg.bezierCurveTo(sx + sz * 0.5, ty + sz * 0.62, sx + sz * 0.1, ty + sz * 0.55, sx - sw, ty + sz * 0.62); gg.closePath(); }
        }
      };
      g.save(); g.translate(x, y); if (rot) g.rotate(rot); if (oo.alpha !== undefined) g.globalAlpha *= cA(oo.alpha);
      g.lineJoin = 'round';
      g.beginPath(); glyph(g); g.strokeStyle = LN; g.lineWidth = ol * 2; g.stroke(); g.fillStyle = LN; g.fill();
      g.beginPath(); glyph(g); g.fillStyle = col; g.fill();
      if (d) { g.beginPath(); g.ellipse(-hw * 0.28, -hh * 0.3, hw * 0.3, hh * 0.22, -0.5, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fill(); }
      g.restore();
    };
    // a plump little heart, centred on (x, y), width about 2 s
    S.heart = (x, y, s, col, oo) => {
      const pts = [[x, y + s * 1.05, 1], [x - s * 1.12, y - s * 0.02], [x - s * 0.62, y - s * 0.86], [x, y - s * 0.38], [x + s * 0.62, y - s * 0.86], [x + s * 1.12, y - s * 0.02]];
      S.cel(pts, col, Object.assign({ line: S.L(max(1.8, s * 0.2)), depth: s * 0.32, hiW: S.L(1.2), tension: 0.9 }, oo));
    };
    // concentric sound arcs that open toward angle a (width span), n of them, growing from r: brown under, colour over. fade makes the outer ones softer
    S.arc = (x, y, r, a0, a1, w, col, alpha) => {
      g.save(); if (alpha !== undefined) g.globalAlpha *= cA(alpha); g.lineCap = 'round';
      g.beginPath(); g.arc(x, y, max(0.3, r), a0, a1); g.strokeStyle = LN; g.lineWidth = S.L(w + 2.4); g.stroke();
      g.beginPath(); g.arc(x, y, max(0.3, r), a0, a1); g.strokeStyle = col; g.lineWidth = S.T(w); g.stroke();
      g.restore();
    };
    S.rings = (x, y, r, n, gap, w, col, a0, a1, alpha) => { for (let i = 0; i < n; i++) S.arc(x, y, r + i * gap, a0, a1, w * (1 - i * 0.14), col, (alpha === undefined ? 1 : alpha) * (1 - i * 0.2)); };
    // a small glossy shine mark (an oval that catches the light)
    S.shine = (x, y, rx, ry, rot, alpha) => { g.save(); g.globalAlpha *= cA(alpha === undefined ? 0.85 : alpha); g.beginPath(); g.ellipse(x, y, max(0.2, rx), max(0.2, ry), rot || 0, 0, TAU); g.fillStyle = '#ffffff'; g.fill(); g.restore(); };
    return S;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // THE MOTIFS. Each is fn(S) drawing centred on (0, 0) within about +-46 design units (y down, light from the upper right).
  // ---------------------------------------------------------------------------------------------------------------
  const M = {};

  // ---- shared shapes ----
  // a cherry blossom: five notched petals round a cream centre with stamens, centred on (x, y), radius r (the petal tips)
  function blossom(S, x, y, r, rot, col, o) {
    o = o || {};
    const f = S.f, n = 5, pl = r * 0.95, pw = r * 0.62;
    for (let i = 0; i < n; i++) {
      const a = (rot || 0) + i * TAU / n;
      S.at(x, y, a, 1, 1, () => S.cel(petalShape(pl, pw, 0.16), col || PINK, { line: S.L(max(1.6, r * 0.075)), shadow: o.shade || warm(col || PINK, 0.1), depth: max(1.2, r * 0.12), hiW: S.L(1.1), tension: 0.7, hi: S.d ? lit(col || PINK, 0.5) : false }));
    }
    S.circ(x, y, r * 0.22, o.centre || GOLD2, { line: S.L(max(1.4, r * 0.06)), depth: r * 0.05, hi: false });
    if (S.d) for (let i = 0; i < 5; i++) { const a = (rot || 0) + i * TAU / 5 + 0.3; S.circle(x + cos(a) * r * 0.13, y + sin(a) * r * 0.13, max(0.8, r * 0.035), '#e0518f'); }
  }
  M._blossom = blossom;


  // ===============================================================================================================
  // GROUP 1: sung arcs, beams and petals (slash cross_slash thrust crescent iai petals bloom petal_storm)
  // ===============================================================================================================
  // a loose cherry petal at (x, y), length len, rotated, in a colour (the hand-painted sticker petal)
  function loosePetal(S, x, y, len, rot, col, sx) {
    S.at(x, y, rot, sx === undefined ? 1 : sx, 1, () => S.cel(petalShape(len, len * 0.62, 0.16), col, { line: S.L(max(1.5, len * 0.1)), depth: max(1, len * 0.14), hiW: S.L(1), tension: 0.7, hi: S.d ? lit(col, 0.5) : false }));
  }
  M._loosePetal = loosePetal;

  M.slash = (S) => {
    const { f } = S, R = S.rng('s');
    S.glow(0, 0, 60, f.glow, 0.26 + 0.1 * S.pulse(2.4));
    const A = [-46, 30], B = [46, -32];
    // a thin echo of the arc behind it, in the family's second colour
    S.tube(bez2([-36, 6], [-6, -34], [30, -36], 14), 5.5, f.alt, { ol: 2 });
    // the sung arc: a crescent ribbon of sound, thick in the middle and pointed at both ends
    const c = crescent(A, B, 24, 7, 20);
    S.cel(c, f.body, { depth: 5.5, hiW: S.L(2.2) });
    S.path(bez2([-34, 20], [-6, -2], [28, -22], 12), 3.2, '#ffffff', 0.8);
    // one eighth note rides it
    const o = polyAt(c.outer, 0.5 + 0.06 * S.wave(2.6)), i = polyAt(c.inner, 0.5 + 0.06 * S.wave(2.6));
    S.note((o.x + i.x) / 2 - 2, (o.y + i.y) / 2 + 1, S.d ? 15 : 17, { kind: 'eighth', color: CREAM, rot: -0.12 + 0.08 * S.wave(2.6) });
    // a cherry petal at the tip, fluttering
    loosePetal(S, B[0] - 7, B[1] + 8, 13, 0.85 + 0.25 * S.wave(1.7), f.light);
    S.spark(30, -40, S.d ? 9 : 7, { color: '#ffffff', rot: 0.3, alpha: S.tw(0) });
    if (S.d) {
      S.spark(-30, 20, 5, { color: GOLD2, alpha: S.tw(1) });
      for (let k = 0; k < 6; k++) { const u = 0.1 + R() * 0.8, p = polyAt(c.inner, u); S.circle(p.x + (R() - 0.2) * 9 + 6, p.y + 6 + R() * 9, 1 + R() * 1.4, k % 2 ? CREAM : f.altL, 0.9); }
    }
  };

  M.cross_slash = (S) => {
    const { f } = S, R = S.rng('x');
    S.glow(0, 0, 58, f.glow, 0.28 + 0.1 * S.pulse(2.2));
    S.fill({ poly: starPts(0, 0, 9, 11, 34 + 2.5 * S.wave(2), 0.3) }, f.altL, 0.35);
    const arc = (A, B, bo, bi, col, sh, hw) => {
      const c = crescent(A, B, bo, bi, 18);
      S.cel(c, col, { depth: 5, shadow: sh, hiW: S.L(2) });
      S.path(bez2([A[0] * 0.72 + B[0] * 0.28, A[1] * 0.72 + B[1] * 0.28 + 3], [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2 + bo * 0.3], [A[0] * 0.28 + B[0] * 0.72, A[1] * 0.28 + B[1] * 0.72], 8), hw, '#ffffff', 0.75);
      return c;
    };
    arc([-45, -36], [46, 38], 13, 2, f.body, f.bodyS, 3);
    arc([45, -34], [-46, 38], -15, -2, f.alt, f.altS, 3);
    S.spark(0, 0, S.d ? 19 : 14, { color: '#ffffff', rot: 0.2 + 0.1 * S.wave(3), glow: 0.8, alpha: 0.7 + 0.3 * S.tw(0) });
    if (S.d) {
      S.note(-34, -26, 9, { kind: 'eighth', color: CREAM, rot: -0.3 }); S.note(35, 30, 9, { kind: 'eighth', color: CREAM, rot: 0.3 });
      S.spark(30, -20, 6, { color: GOLD2, alpha: S.tw(1) }); S.spark(-30, 20, 6, { color: f.bodyL, alpha: S.tw(2) });
      for (let i = 0; i < 8; i++) { const a = R() * TAU, r = 31 + R() * 13; S.circle(cos(a) * r, sin(a) * r, 0.9 + R() * 1.2, i % 2 ? CREAM : f.altL, 0.9); }
    }
  };

  // a hand mic (a grille ball on a handle) with its head at (x, y), pointing along ang (the direction the sound leaves)
  function micHead(S, x, y, ang, sc, o) {
    o = o || {};
    S.at(x, y, ang, sc, sc, () => {
      // the handle trails behind (negative x)
      S.cel([[-6, -5.5], [-30, -4.6], [-34, 0, 1], [-30, 4.6], [-6, 5.5]], o.handle || '#59566a', { line: S.L(2.4), shadow: '#3a3942', depth: 2.4, tension: 0.4, hi: S.d ? '#8d8aa0' : false });
      S.cel([[-14, -6.4], [-9, -7.2], [-9, 7.2], [-14, 6.4]], o.ring || STEEL, { line: S.L(2), shadow: '#8f93a8', depth: 1.8, tension: 0.2, hi: false });
      S.circ(7, 0, 14.5, o.grille || '#7a778c', { line: S.L(2.8), shadow: '#4a4860', depth: 4.5, hi: S.d ? '#b9b6cc' : false, hiW: S.L(2.2) });
      if (S.d) {
        g_hatch(S, 7, 0, 12.4);
      }
      S.shine(2.6, -5.4, 3.2, 1.7, -0.5, 0.8);
    });
  }
  function g_hatch(S, cx, cy, r) {
    const g = S.g;
    g.save(); g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.clip(); g.strokeStyle = 'rgba(33,30,48,0.55)'; g.lineWidth = S.T(1); g.beginPath();
    for (let k = -3; k <= 3; k++) { g.moveTo(cx + k * 4 - r, cy - r); g.lineTo(cx + k * 4 + r, cy + r); g.moveTo(cx + k * 4 + r, cy - r); g.lineTo(cx + k * 4 - r, cy + r); }
    g.stroke(); g.restore();
  }
  M._micHead = micHead;

  M.thrust = (S) => {
    const { f } = S, R = S.rng('t');
    const ang = -0.62, mx = -24, my = 21;
    S.glow(14, -12, 52, f.glow, 0.3 + 0.1 * S.pulse(1.8));
    // the beam: a soft cone and three rings of sound leaving the grille
    S.at(mx, my, ang, 1, 1, () => {
      const g = S.g;
      g.save(); g.beginPath(); g.moveTo(8, -5); g.lineTo(52, -22); g.lineTo(52, 22); g.lineTo(8, 5); g.closePath();
      g.fillStyle = tk.rad(g, 8, 0, 4, 52, 0, 56, [[0, tk.rgba(f.glow, 0.55)], [1, tk.rgba(f.glow, 0)]]); g.fill(); g.restore();
    });
    const k = S.fr(1.6);
    for (let i = 0; i < 3; i++) { const u = S.anim ? (k + i / 3) % 1 : i / 3 + 0.1, r = 20 + u * 24, a = 0.5 - u * 0.12; S.arc(mx, my, r, ang - a, ang + a, 5.2 - u * 2, i % 2 ? f.alt : f.body, S.anim ? sin(PI * min(1, u * 1.1)) : 1); }
    micHead(S, mx, my, ang, 0.92);
    // the bright note at the end of the beam
    S.note(28, -18, S.d ? 15 : 17, { kind: 'eighth', color: GOLD, rot: 0.1 + 0.1 * S.wave(1.8) });
    S.spark(40, -36, S.d ? 10 : 9, { color: '#ffffff', rot: 0.2, glow: 0.8, alpha: S.tw(0) });
    if (S.d) { S.spark(10, -28, 5, { color: GOLD2, alpha: S.tw(1) }); S.spark(24, 10, 4, { color: f.bodyL, alpha: S.tw(2) }); }
  };

  M.crescent = (S) => {
    const { f } = S, R = S.rng('c');
    S.glow(0, 0, 60, f.glow, 0.24 + 0.1 * S.pulse(3));
    // a filter curve (flat, then sweeping down) in cream with a petal and sparkle crescent following the arc above it
    const cx = -2, cy = 8, a0 = PI * 0.68, a1 = PI * 2.12;
    const arcAt = (u, r) => polar(cx, cy, r, lerp(a0, a1, u));
    S.tube(Array.from({ length: 14 }, (_, k) => arcAt(k / 13, 33)), 5, f.bodyL, { ol: 2.1 });
    const n = S.d ? 11 : 7;
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n, s = sin(PI * u), a = lerp(a0, a1, u), p = arcAt(u, 44 + 3 * s + (k % 2 ? 3 : 0) + 1.2 * S.wave(2.4, u));
      loosePetal(S, p[0], p[1], 8 + 8 * s, a + PI / 2 + (k % 2 ? 0.35 : -0.3), k % 3 === 0 ? f.alt : k % 3 === 1 ? f.body : f.light);
    }
    const mid = arcAt(0.5, 22);
    S.circ(mid[0], mid[1], 13, f.bodyL, { line: S.L(2.2), depth: 3 });
    S.ring(mid[0], mid[1], 18, 1.4, f.glow, 0.7);
    S.spark(mid[0], mid[1], S.d ? 11 : 9, { color: '#ffffff', rot: 0.3, alpha: S.tw(0) });
    if (S.d) { const e = arcAt(0.06, 40), e2 = arcAt(0.96, 40); S.spark(e[0], e[1] - 4, 6, { color: GOLD2, alpha: S.tw(1) }); S.spark(e2[0], e2[1] - 2, 5, { color: '#ffffff', alpha: S.tw(2) }); }
  };

  M.iai = (S) => {
    const { f } = S, R = S.rng('i'), g = S.g;
    // a single spotlight beam drops from the top onto one bright note; everything else is dark
    const sway = 1.5 * S.wave(4);
    g.save(); g.beginPath(); g.moveTo(-8 + sway, -52); g.lineTo(8 + sway, -52); g.lineTo(40, 34); g.lineTo(-40, 34); g.closePath();
    g.fillStyle = tk.lin(g, 0, -52, 0, 34, [[0, tk.rgba(CREAM, 0.1)], [0.6, tk.rgba(CREAM, 0.34)], [1, tk.rgba(CREAM, 0.5)]]); g.fill(); g.restore();
    // a pool of light on the floor
    S.ell(0, 34, 40, 10, '#fff1c8', { line: S.L(2.2), shadow: '#f0d080', depth: 3, hi: false });
    S.ell(0, 34, 26, 6, '#fffbe8', { line: false, shadow: false, hi: false });
    // one big bright note standing in the light
    const bob = 1.4 * S.wave(1.8);
    S.note(-4, 18 + bob, S.d ? 30 : 34, { kind: 'eighth', color: GOLD, rot: 0 });
    S.glow(0, 0, 30, GOLD2, 0.35 + 0.15 * S.pulse(1.8));
    // the dark: a few dim notes watching from the shadows
    if (S.d) { [[-32, 14, -0.3], [32, 6, 0.4], [-20, -26, 0.2]].forEach((p, k) => S.note(p[0], p[1], 8, { kind: k % 2 ? 'quarter' : 'eighth', color: f.dim, rot: p[2], alpha: 0.55 })); }
    S.spark(16, -14, S.d ? 10 : 8, { color: '#ffffff', rot: 0.2, alpha: S.tw(0) });
    if (S.d) S.spark(-18, -2, 5, { color: GOLD2, alpha: S.tw(1) });
  };

  M.petals = (S) => {
    const { f } = S, R = S.rng('p');
    S.glow(0, 0, 58, f.glow, 0.24 + 0.08 * S.pulse(2.8));
    // a swirl of loose cherry petals along two curling arms
    const n = S.d ? 12 : 8, spin = S.anim ? S.t * 0.35 : 0;
    const list = [];
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), a = -1.2 + u * 5.6 + spin, r = 40 - u * 26 + (R() - 0.5) * 6;
      list.push({ p: polar(0, 2, r, a), a, len: 17 - u * 5 + R() * 3, z: R(), col: i % 3 === 0 ? f.alt : i % 3 === 1 ? f.body : f.light });
    }
    list.sort((a, b) => a.z - b.z);
    list.forEach((q, i) => loosePetal(S, q.p[0], q.p[1], q.len, q.a + PI / 2 + 0.6 + 0.25 * S.wave(2.2, i / n), q.col));
    S.spark(-30, -30, S.d ? 10 : 8, { color: '#ffffff', alpha: S.tw(0) });
    S.spark(32, 26, S.d ? 8 : 6, { color: GOLD2, rot: 0.3, alpha: S.tw(1) });
  };

  M.bloom = (S) => {
    const { f } = S;
    const k = 1 + 0.03 * S.wave(2.6);
    S.glow(0, 0, 60, f.glow, 0.3 + 0.1 * S.pulse(2.6));
    S.at(0, 0, S.anim ? 0.04 * S.wave(5) : 0, k, k, () => {
      // a back ring of paler petals, then the big open blossom
      for (let i = 0; i < 5; i++) { const a = 0.63 + i * TAU / 5; S.at(0, 0, a, 1, 1, () => S.cel(petalShape(44, 29, 0.14), f.light, { line: S.L(2.2), depth: 3, tension: 0.7, hi: false, shadow: f.altL })); }
      blossom(S, 0, 0, 38, 0, f.body, { shade: f.bodyS, centre: GOLD });
      if (S.d) {
        // petal veins and a glossy shine on each petal
        for (let i = 0; i < 5; i++) { const a = i * TAU / 5; S.ink([polar(0, 0, 11, a), polar(0, 0, 25, a + 0.04)], { w: 0.9, color: f.bodyD, alpha: 0.5, taper: 0.4 }); }
      }
    });
    S.spark(34, -34, S.d ? 11 : 8, { color: '#ffffff', rot: 0.2, alpha: S.tw(0) });
    if (S.d) { S.spark(-36, -26, 6, { color: GOLD2, alpha: S.tw(1) }); S.spark(-30, 34, 5, { color: '#ffffff', alpha: S.tw(2) }); S.spark(36, 30, 6, { color: f.altL, alpha: S.tw(3) }); }
  };

  M.petal_storm = (S) => {
    const { f } = S, R = S.rng('ps');
    S.glow(0, 0, 60, f.glow, 0.3 + 0.1 * S.pulse(2.2));
    // a spiral blizzard of petals round one high note
    const arms = 2, per = S.d ? 7 : 5, spin = S.anim ? S.t * 0.6 : 0, list = [];
    for (let a = 0; a < arms; a++) for (let i = 0; i < per; i++) {
      const u = i / (per - 1), ang = spin + a * PI + u * 4.4 - 0.6, r = 16 + u * 30;
      list.push({ p: polar(0, 0, r, ang), ang, len: 8 + u * 9, col: (i + a) % 3 === 0 ? f.alt : (i + a) % 3 === 1 ? f.body : f.light, z: u });
    }
    list.sort((p, q) => p.z - q.z);
    list.forEach((q, i) => loosePetal(S, q.p[0], q.p[1], q.len, q.ang + PI / 2 + 0.9, q.col));
    S.circ(0, 0, 19, f.bodyL, { line: S.L(2.4), depth: 4 });
    S.note(-1, 4, S.d ? 21 : 23, { kind: 'eighth', color: GOLD, rot: 0.05 * S.wave(2) });
    S.spark(30, -34, S.d ? 10 : 8, { color: '#ffffff', alpha: S.tw(0) });
    if (S.d) S.spark(-34, 30, 6, { color: GOLD2, alpha: S.tw(1) });
  };

  // ===============================================================================================================
  // GROUP 2: guards and lights (wind shield barrier talisman lotus moon sun star)
  // ===============================================================================================================
  // sparkles in one line: [x, y, r, colour, detailOnly]
  const sprk = (S, list) => list.forEach((p, i) => { if (!p[4] || S.d) S.spark(p[0], p[1], S.d ? p[2] : p[2] * 1.1, { color: p[3] || '#ffffff', rot: 0.25 * i, alpha: S.tw(i + (S.seed % 3)) }); });
  // a tiny dust of dots (seeded) in two colours inside a box, away from the centre
  const dust = (S, R, n, x0, y0, x1, y1, c1, c2) => { if (!S.d) return; for (let i = 0; i < n; i++) S.circle(lerp(x0, x1, R()), lerp(y0, y1, R()), 0.9 + R() * 1.3, i % 2 ? c1 : c2, 0.9); };

  M.wind = (S) => {
    const { f } = S;
    S.glow(0, 0, 60, f.glow, 0.22 + 0.08 * S.pulse(2.6));
    // three curling sound-wave ribbons, each ending in a curl
    const ribbon = (y, amp, ph, w, col, curlR, len) => {
      const pts = [];
      for (let i = 0; i <= 10; i++) { const u = i / 10; pts.push([-42 + u * len, y + amp * sin(u * 5 + ph + (S.anim ? S.t * 1.6 : 0)) * (0.35 + u * 0.65)]); }
      const e = pts[pts.length - 1], cy = e[1] - curlR;
      for (let k = 1; k <= 12; k++) { const u = k / 12, a = PI / 2 - u * 4.1, r = curlR * (1 - u * 0.5); pts.push([e[0] + curlR * 0.0 + cos(a) * r, cy + sin(a) * r]); }
      S.tube(pts, w, col, { ol: 2.2 });
    };
    ribbon(-24, 5, 0.3, 8, f.body, 9, 52);
    ribbon(2, 6, 2.0, 9, f.alt, 11, 56);
    ribbon(27, 5, 4.1, 7, f.altL, 8, 48);
    if (S.d) { S.note(-28, -6, 9, { kind: 'eighth', color: CREAM, rot: -0.2 }); S.note(14, 16, 8, { kind: 'quarter', color: CREAM, rot: 0.2 }); }
    sprk(S, [[-34, -38, 8], [36, 38, 7, GOLD2, 1], [38, -6, 6, f.bodyL, 1]]);
  };

  M.shield = (S) => {
    const { f } = S, g = S.g;
    S.glow(0, 0, 58, f.glow, 0.2 + 0.08 * S.pulse(2.4));
    // a round shield: a bright rim, a speaker grille face and a heart boss
    S.circ(0, 0, 39, f.body, { line: S.L(3), depth: 6, hiW: S.L(2.4) });
    S.circ(0, 0, 31, '#3b3856', { line: S.L(2.4), depth: 4, shadow: '#26233c', hi: S.d ? '#6a678a' : false });
    if (S.d) {
      g.save(); g.beginPath(); g.arc(0, 0, 29, 0, TAU); g.clip();
      for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) { const x = i * 5.2 + (j % 2 ? 2.6 : 0), y = j * 4.6; if (x * x + y * y < 29 * 29 && x * x + y * y > 11 * 11) S.circle(x, y, 1.15, '#8f8cb0', 0.85); }
      g.restore();
    }
    S.ring(0, 0, 22, 1.4, '#8f8cb0', 0.7); S.ring(0, 0, 15, 1.2, '#8f8cb0', 0.55);
    const k = 1 + 0.07 * S.pulse(1.3);
    S.at(0, 1, 0, k, k, () => S.heart(0, 0, 10, PINK, { line: S.L(2.2) }));
    S.shine(-3.5, -5, 3, 1.7, -0.6, 0.9);
    if (S.d) { for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + 0.5; S.circle(cos(a) * 35, sin(a) * 35, 1.9, CREAM, 1); S.ring(cos(a) * 35, sin(a) * 35, 1.9, 0.9, LN, 0.9); } }
    S.shine(20, -27, 8, 2.1, 0.9, 0.7);
    sprk(S, [[32, -36, 8], [-34, 30, 6, GOLD2, 1]]);
  };

  M.barrier = (S) => {
    const { f } = S, g = S.g, R = S.rng('b');
    S.glow(0, 6, 56, f.glow, 0.22 + 0.08 * S.pulse(2.8));
    const yb = 24;
    // the stage disc it stands on
    S.ell(0, yb + 3, 46, 11, CREAM, { line: S.L(2.4), shadow: '#f0d9b0', depth: 3, hi: false });
    // a soft dome like a soap bubble: nested sound arcs under a pale skin
    const dome = (r) => (gg) => { gg.moveTo(-r, yb); gg.arc(0, yb, r, PI, TAU); gg.closePath(); };
    S.fill(dome(40), f.bodyL, 0.5);
    g.save(); g.beginPath(); dome(40)(g); g.clip(); g.fillStyle = tk.rad(g, -14, yb - 30, 2, -8, yb - 18, 46, [[0, tk.rgba('#ffffff', 0.55)], [0.5, tk.rgba(f.bodyL, 0.15)], [1, tk.rgba(f.alt, 0.25)]]); g.fillRect(-50, -40, 100, 80); g.restore();
    g.save(); g.beginPath(); dome(40)(g); g.lineJoin = 'round'; g.strokeStyle = LN; g.lineWidth = S.L(2.4); g.stroke(); g.restore();
    for (let i = 0; i < 3; i++) {
      const r = 33 - i * 9.5 + (S.anim ? 1.4 * sin(S.t * 2 + i) : 0), pts = [];
      for (let k = 0; k <= 16; k++) { const a = lerp(PI + 0.14, TAU - 0.14, k / 16); pts.push([cos(a) * r, yb + sin(a) * r]); }
      S.path(pts, 5.2 - i * 0.9, LN, 0.85, 0.5);
      S.path(pts, 3.4 - i * 0.7, i === 0 ? f.alt : i === 1 ? '#ffffff' : f.bodyL, 1, 0.5);
    }
    S.heart(0, yb - 7, S.d ? 5.5 : 6.5, PINK, { line: S.L(1.8) });
    S.shine(-24, -12, 7, 2.6, -0.95, 0.9); S.shine(-14, -23, 3, 1.4, -0.6, 0.8);
    if (S.d) for (let i = 0; i < 4; i++) { const a = PI + 0.5 + R() * 2.1, rr = 43 + R() * 4; S.circle(cos(a) * rr * 0.9, yb + sin(a) * rr, 1.6 + R() * 1.5, CREAM, 0.9); }
    sprk(S, [[30, -30, 8], [-38, 6, 5, GOLD2, 1]]);
  };

  M.talisman = (S) => {
    const { f } = S, g = S.g;
    S.glow(0, 0, 58, f.glow, 0.3 + 0.12 * S.pulse(2));
    const rot = S.anim ? 0.05 * S.wave(3.4) : 0, tip = 2;
    S.at(0, 2, rot - 0.1, 1, 1, () => {
      // a die-cut star sticker: a thick cream rim round the colour star; the lower right point is peeling up
      const outer = starPts(0, 0, 5, 26, 45, 0), inner = starPts(0, 0, 5, 19, 35, 0);
      const noTip = (pts) => pts.filter((p, i) => i !== tip * 2).map((p) => [p[0], p[1], 1]);
      const ia = outer[tip * 2 - 1], ib = outer[tip * 2 + 1], t0 = outer[tip * 2];
      S.cel(noTip(outer), CREAM, { line: S.L(2.8), shadow: '#f0d9b0', depth: 3.2, tension: 0.34, hi: false });
      S.cel(noTip(inner), f.body, { line: S.L(2), depth: 4, shadow: f.bodyS, tension: 0.34, hiW: S.L(1.8), hi: S.d ? f.bodyL : false });
      S.shine(-6, -17, 7, 2.2, -1.05, 0.85);
      S.note(-2, 6, S.d ? 15 : 17, { kind: 'eighth', color: CREAM, rot: 0.1 });
      // the peeled tip, folded back over the sticker: its plain back side, a soft shadow under it
      const mx = (ia[0] + ib[0]) / 2, my = (ia[1] + ib[1]) / 2, dxm = ib[0] - ia[0], dym = ib[1] - ia[1], ll = Math.hypot(dxm, dym) || 1, nx = -dym / ll, ny = dxm / ll;
      const sd = (t0[0] - mx) * nx + (t0[1] - my) * ny, fx = t0[0] - 2 * sd * nx * 0.78, fy = t0[1] - 2 * sd * ny * 0.78, bulge = [mx + (fx - mx) * 0.55 + nx * 3.5 * Math.sign(sd), my + (fy - my) * 0.55 + ny * 3.5 * Math.sign(sd)];
      S.fill([[ia[0] + 2.5, ia[1] + 3.5, 1], [bulge[0] + 3.5, bulge[1] + 3.5], [fx + 2.5, fy + 3.5, 1], [ib[0] + 2.5, ib[1] + 3.5, 1]], 'rgba(20,10,40,0.3)');
      S.cel([[ia[0], ia[1], 1], [bulge[0], bulge[1]], [fx, fy, 1], [ib[0], ib[1], 1]], '#fffdf6', { line: S.L(2.2), shadow: '#e6d8c0', depth: 2.4, tension: 0.5, hi: false });
    });
    sprk(S, [[34, -38, 9], [-40, 14, 6, GOLD2, 1], [-30, -34, 5, f.bodyL, 1]]);
  };

  M.lotus = (S) => {
    const { f } = S, g = S.g, R = S.rng('l');
    S.glow(0, 0, 60, f.glow, 0.28 + 0.1 * S.pulse(3));
    const spin = S.anim ? S.t * 1.1 : 0, cx = -2, cy = 3;
    // a spinning vinyl record with a soft halo
    S.circ(cx, cy, 37, '#2d2842', { line: S.L(3), depth: 5, shadow: '#1c1830', hi: S.d ? '#6a6590' : false });
    for (let i = 0; i < 4; i++) S.ring(cx, cy, 31 - i * 5, 1, '#5b567e', 0.55);
    g.save(); g.translate(cx, cy); g.rotate(spin);
    [[0.3, 0.75], [PI + 0.3, 0.75]].forEach((w) => { g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 35, w[0], w[0] + w[1]); g.closePath(); g.fillStyle = 'rgba(255,255,255,0.17)'; g.fill(); });
    g.restore();
    S.circ(cx, cy, 13, f.body, { line: S.L(2.2), depth: 3, shadow: f.bodyS, hi: S.d ? f.bodyL : false, hiW: S.L(1.4) });
    S.circ(cx, cy, 4.2, CREAM, { line: S.L(1.6), shadow: false, hi: false });
    S.circle(cx, cy, 1.6, '#2d2842');
    if (S.d) { g.save(); g.translate(cx, cy); g.rotate(spin); S.heart(0, -8.4, 2.1, CREAM, { line: S.L(0.9), shadow: false, hi: false }); g.restore(); }
    // two calm notes drifting up
    const b = 1.6 * S.wave(3.2);
    S.note(32, -16 + b, S.d ? 13 : 15, { kind: 'eighth', color: CREAM, rot: 0.15 });
    S.note(-36, -22 - b, S.d ? 11 : 13, { kind: 'quarter', color: f.altL, rot: -0.2 });
    sprk(S, [[24, 34, 6, GOLD2, 1], [-30, 36, 5, '#ffffff', 1], [34, -38, 7]]);
  };

  M.moon = (S) => {
    const { f } = S, g = S.g;
    S.glow(-6, 0, 58, f.glow, 0.3 + 0.1 * S.pulse(3.4));
    // a plain crescent moon (open toward the right) with a sound ring round it
    const cx = -9, cy = 2, Ro = 33, d = 17, ri = 28, pts = [];
    const xi = (d * d + Ro * Ro - ri * ri) / (2 * d), th = Math.atan2(Math.sqrt(Math.max(0, Ro * Ro - xi * xi)), xi), ti = Math.atan2(Math.sqrt(Math.max(0, Ro * Ro - xi * xi)), xi - d);
    for (let i = 0; i <= 22; i++) { const a = lerp(th, TAU - th, i / 22); pts.push([cx + cos(a) * Ro, cy + sin(a) * Ro]); }
    for (let i = 0; i <= 22; i++) { const a = lerp(TAU - ti, ti, i / 22); pts.push([cx + d + cos(a) * ri, cy + sin(a) * ri]); }
    S.at(0, 0, -0.35, 1, 1, () => {
      S.cel({ poly: pts }, '#ffe9a8', { line: S.L(3), depth: 5, shadow: '#f0c870', hiW: S.L(2.2), hi: S.d ? '#fffbe6' : false });
      if (S.d) { S.ell(cx - 18, cy - 8, 3.4, 2.4, '#f6d98a', { line: false, shadow: false, hi: false }, 0.4); S.ell(cx - 22, cy + 10, 2.6, 2, '#f6d98a', { line: false, shadow: false, hi: false }); S.ell(cx - 9, cy + 22, 2.2, 1.7, '#f6d98a', { line: false, shadow: false, hi: false }); }
    });
    // the sound ring: two arcs round the open side
    const k = S.fr(2.4);
    S.arc(cx + 14, cy - 3, 25 + 2.5 * k, -0.9, 0.9, 4.4, f.body, S.anim ? 1 - 0.4 * k : 1);
    S.arc(cx + 14, cy - 3, 34 + 2.5 * k, -0.75, 0.75, 3.6, f.alt, S.anim ? 0.9 - 0.5 * k : 0.85);
    sprk(S, [[34, -28, 9], [28, 30, 7, GOLD2], [-38, -34, 6, f.bodyL, 1], [-34, 34, 5, '#ffffff', 1]]);
  };

  M.sun = (S) => {
    const { f } = S, g = S.g;
    S.glow(0, -4, 62, GOLD2, 0.32 + 0.1 * S.pulse(2));
    // a round stage light: chunky rays round a bright lens, and three beat dots under it
    const spin = S.anim ? S.t * 0.25 : 0;
    const rays = starPts(0, -4, 12, 25, 40, spin);
    S.cel(rays.map((p) => [p[0], p[1], 1]), GOLD, { line: S.L(2.6), depth: 4, shadow: '#f0a830', tension: 0.3, hiW: S.L(1.8), hi: S.d ? GOLD2 : false });
    S.circ(0, -4, 22, '#fff4d0', { line: S.L(2.8), depth: 4.5, shadow: '#ffd98a', hiW: S.L(2), hi: false });
    S.circ(0, -4, 14, '#ffffff', { line: false, shadow: false, hi: false });
    S.ring(0, -4, 17.5, 1.3, '#f0b040', 0.8);
    S.shine(-6, -11, 4, 2.2, -0.6, 0.9);
    const on = S.anim ? floor(S.fr(1.5) * 3) : 1;
    [[-16, 4], [0, 5.5], [16, 4]].forEach((d, i) => { const r = d[1] + (on === i ? 1.4 : 0); S.circ(d[0], 38, r, on === i ? f.body : f.bodyL, { line: S.L(2), depth: 1.8, shadow: f.bodyS, hi: false }); });
    sprk(S, [[-36, -36, 7], [36, 28, 6, '#ffffff', 1]]);
  };

  M.star = (S) => {
    const { f } = S, g = S.g;
    S.glow(0, 0, 62, f.glow, 0.3 + 0.1 * S.pulse(2.4));
    const w = S.anim ? 0.06 * S.wave(3) : 0, k = 1 + 0.03 * S.wave(2.1);
    S.at(0, 2, w, k, k, () => {
      // a chunky five-point star with a cream rim
      S.cel(starPts(0, 0, 5, 24, 47, 0).map((p) => [p[0], p[1], 1]), CREAM, { line: S.L(3), depth: 4, shadow: '#f0d9b0', tension: 0.34, hi: false });
      S.cel(starPts(0, 0, 5, 19, 37, 0).map((p) => [p[0], p[1], 1]), f.body, { line: S.L(2.2), depth: 4.4, shadow: f.bodyS, tension: 0.34, hiW: S.L(2), hi: S.d ? f.bodyL : false });
      S.shine(-5, -13, 7, 2.3, -1.15, 0.85);
      if (S.d) { S.circle(9, 3, 1.5, '#ffffff', 0.9); S.circle(-12, 10, 1.1, '#ffffff', 0.8); }
    });
    // two tiny stars orbiting
    const a = S.anim ? S.t * 0.8 : 0.6;
    S.at(cos(a) * 44, sin(a) * 36 - 2, 0, 1, 1, () => S.cel(starPts(0, 0, 5, 3.4, 7, 0.2).map((p) => [p[0], p[1], 1]), GOLD2, { line: S.L(1.6), depth: 1.4, tension: 0.3, hi: false }));
    sprk(S, [[-38, -36, 8], [38, 34, 7, GOLD2], [-40, 30, 5, f.bodyL, 1]]);
  };


  // ===============================================================================================================
  // GROUP 3: energy (lightning thunder_fist chain_lightning fire flame_orb ice ink_splash ink_wave)
  // ===============================================================================================================
  const SKIN = '#ffd3b0', SKINS = '#f0a485';
  // a comic hit word from the bible's list, drawn big at card detail only (never at icon size)
  const hitWord = (S, text, x, y, size, rot, fill, stroke) => { if (S.d < 2) return; tk.inkText(S.g, text, x, y, size, { rot: rot || 0, fill: fill || CREAM, stroke: stroke || LN, strokeW: max(2.2, size * 0.2), skew: -0.12, family: tk.font.display }); };
  // a flame silhouette standing on (cx, by): width w, height h, tip leaning by lean (control points, tip is a corner)
  const flamePts = (cx, by, w, h, lean) => [[cx, by + h * 0.02], [cx - w * 0.5, by - h * 0.26], [cx - w * 0.4, by - h * 0.62], [cx + lean * 0.5 - w * 0.05, by - h * 0.82], [cx + lean, by - h, 1], [cx + w * 0.3 + lean * 0.4, by - h * 0.6], [cx + w * 0.5, by - h * 0.26]];
  const WARM = (S, a, k) => tk.mix(a, S.f.body, k === undefined ? 0.18 : k);

  M.lightning = (S) => {
    const { f } = S, g = S.g;
    S.glow(0, -4, 62, f.glow, 0.26 + 0.1 * S.pulse(1.4));
    // a plucked bass string, pulled up where the bolt leaves it
    const ph = S.anim ? S.t * 18 : 0, vib = S.anim ? 1 + 0.5 * sin(ph) : 1;
    const str = (dy, a, w, col) => { const pts = [[-46, 36 + dy], [-26, 34 + dy], [-14, 28 + dy * 0.5], [2, 34 + dy], [22, 35 + dy], [46, 36 + dy]]; S.path(pts, w, col, a, 0.6); };
    if (S.d) { str(-4 * vib, 0.35, 3, f.bodyL); str(4 * vib, 0.35, 3, f.bodyL); }
    S.tube([[-46, 36], [-26, 34], [-14, 28], [2, 34], [22, 35], [46, 36]], 5.2, STEEL, { ol: 2 });
    const bolt = [[5, -46, 1], [30, -46, 1], [15, -17, 1], [31, -17, 1], [-14, 30, 1], [-3, -4, 1], [-21, -4, 1]];
    const col = WARM(S, ORANGE, 0.12);
    S.cel(bolt, col, { line: S.L(3), depth: 6, shadow: warm(col, 0.18), tension: 0.28, hiW: S.L(2.2), hi: S.d ? '#ffe9a0' : false });
    S.path([[24, -41], [12, -19]], 2.4, '#ffffff', 0.8, 0);
    S.ring(-14, 29, 4 + 2 * S.fr(0.9), 1.6, '#ffffff', 0.85 - 0.6 * S.fr(0.9));
    sprk(S, [[-30, -22, 8], [38, 10, 7, GOLD2], [-34, 14, 5, f.bodyL, 1], [38, -30, 5, '#ffffff', 1]]);
  };

  M.thunder_fist = (S) => {
    const { f } = S, g = S.g;
    S.glow(0, 12, 60, ORANGE, 0.22 + 0.1 * S.pulse(1.2));
    const hit = S.anim ? max(0, sin(S.t * 5)) : 0.4, dy = 2 * hit;
    // the fat bass string, pushed down by the thumb
    S.tube([[-46, 18], [-28, 24], [0, 28 + dy * 2], [28, 24], [46, 18]], 8, STEEL, { ol: 2.4 });
    // the shockwave
    S.cel(starPts(0, 25 + dy, 10, 11, 21, 0.1).map((p) => [p[0], p[1], 1]), WARM(S, ORANGE, 0.1), { line: S.L(2.2), depth: 2.2, tension: 0.3, shadow: '#e8761e', hi: false });
    S.arc(0, 28 + dy, 30, PI + 0.5, PI + 2.64, 4, ORANGE, 0.9); S.arc(0, 28 + dy, 38, PI + 0.7, PI + 2.44, 3, GOLD, 0.8);
    // a chibi hand seen from the front, thumb out and pressing the string: the back of the hand, the thumb with its nail, four curled fingers
    const hy = -4 + dy;
    S.cel(tk.rrectPts(-6, hy - 42, 36, 46, 10), SKIN, { line: S.L(2.8), depth: 4.4, shadow: SKINS, tension: 0.5, hi: S.d ? '#fff0e0' : false });
    S.at(15, hy - 6, 0.32, 1, 1, () => {
      S.cel([[-8, -2, 1], [8, -2, 1], [9, 16], [6, 28], [0, 31], [-6, 28], [-9, 16]], SKIN, { line: S.L(2.8), depth: 4, shadow: SKINS, tension: 0.7, hi: S.d ? '#fff0e0' : false });
      S.ell(0, 25, 5.4, 4.8, '#ffe9e0', { line: S.L(1.7), depth: 1, shadow: '#f8c8b8', hi: false });
    });
    for (let i = 0; i < 4; i++) {
      S.cel(tk.rrectPts(-37, hy - 41 + i * 11.4, 40, 11.2, 5.6), SKIN, { line: S.L(2.4), depth: 2.4, shadow: SKINS, tension: 0.4, hi: false });
      if (S.d) S.ink([[-34, hy - 39 + i * 11.4], [-26, hy - 38.5 + i * 11.4]], { w: 1.2, color: '#ffffff', alpha: 0.8, taper: 0.4 });
    }
    sprk(S, [[-36, -34, 8], [36, -32, 6, GOLD2, 1], [38, 38, 5, '#ffffff', 1]]);
  };

  M.chain_lightning = (S) => {
    const { f } = S, g = S.g;
    S.glow(0, 0, 60, f.glow, 0.22 + 0.08 * S.pulse(1.6));
    // three beat dots on the floor and an orange line hopping over them, a note riding it
    const dots = [[-30, 27], [0, 27], [30, 27]], hop = (a, b, h) => bez2(a, [(a[0] + b[0]) / 2, a[1] - h * 2], b, 16);
    const arcs = hop([-46, 18], dots[0], 18).concat(hop(dots[0], dots[1], 36).slice(1), hop(dots[1], dots[2], 36).slice(1), hop(dots[2], [46, 18], 18).slice(1));
    S.tube(arcs, 5.4, WARM(S, ORANGE, 0.1), { ol: 2.1 });
    dots.forEach((d, i) => S.circ(d[0], d[1], 7.5, i === 1 ? f.body : f.bodyL, { line: S.L(2.4), depth: 2.2, shadow: f.bodyS, hi: false }));
    const u = S.anim ? S.fr(2.2) : 0.28, p = polyAt(arcs, 0.2 + 0.6 * u);
    S.glow(p.x, p.y - 6, 20, ORANGE, 0.5);
    S.note(p.x - 2, p.y - 2, S.d ? 14 : 16, { kind: 'eighth', color: GOLD, rot: 0.1 });
    if (S.d) for (let i = 1; i <= 4; i++) { const q = polyAt(arcs, max(0, 0.2 + 0.6 * u - i * 0.03)); S.circle(q.x - 2, q.y - 6, 2.8 - i * 0.5, GOLD2, 0.9 - i * 0.17); }
    sprk(S, [[-34, -34, 8], [36, -30, 6, '#ffffff'], [-6, -40, 5, GOLD2, 1]]);
  };

  M.fire = (S) => {
    const { f } = S, g = S.g, R = S.rng('f');
    S.glow(0, -2, 62, '#ffb060', 0.34 + 0.12 * S.pulse(0.9));
    const sw = (k) => (S.anim ? 3 * sin(S.t * 3.1 + k) : 0), pu = (k) => (S.anim ? 1 + 0.05 * sin(S.t * 4.3 + k) : 1);
    const outer = WARM(S, '#ff4f3f', 0.1), mid = WARM(S, ORANGE, 0.1), core = GOLD2;
    // three round cartoon flames in three tones with a hot core
    [[-24, 36, 26, 46, -6, 1.3], [24, 36, 28, 52, 7, 2.2], [0, 40, 44, 82, 2, 0.4]].forEach((fl, i) => {
      const sh = flamePts(fl[0], fl[1], fl[2], fl[3] * pu(fl[5]), fl[4] + sw(fl[5]));
      S.cel(sh, outer, { line: S.L(2.8), depth: 4.5, shadow: warm(outer, 0.16), tension: 0.9, hiW: S.L(1.8), hi: S.d ? '#ff9a78' : false });
      S.fill(flamePts(fl[0] + 0.5, fl[1] - 2, fl[2] * 0.66, fl[3] * 0.7 * pu(fl[5]), fl[4] * 0.7 + sw(fl[5]) * 0.8), mid);
      S.fill(flamePts(fl[0] + 0.5, fl[1] - 3, fl[2] * 0.34, fl[3] * 0.4 * pu(fl[5]), fl[4] * 0.4 + sw(fl[5]) * 0.6), core);
    });
    if (S.d) for (let i = 0; i < 6; i++) { const x = (R() - 0.5) * 64, y = -20 - R() * 24 - (S.anim ? ((S.t * 14 + i * 9) % 22) : 0); S.circle(x, y, 1.1 + R() * 1.5, i % 2 ? GOLD2 : '#ffb060', 0.9); }
    sprk(S, [[-36, -30, 7, GOLD2], [38, -22, 6, '#ffffff', 1]]);
  };

  M.flame_orb = (S) => {
    const { f } = S, g = S.g, R = S.rng('fo');
    S.glow(0, 4, 60, '#ffb060', 0.32 + 0.1 * S.pulse(1));
    // the snare-head ring behind: a steel rim with lugs, a cream head and the snare wires
    S.circ(0, 4, 40, STEEL, { line: S.L(3), depth: 5, shadow: '#8f93a8', hi: S.d ? '#f4f5fb' : false });
    for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + 0.2; S.at(cos(a) * 40, 4 + sin(a) * 40, a, 1, 1, () => S.cel({ poly: [[-3, -4], [4, -4], [4, 4], [-3, 4]] }, '#8f93a8', { line: S.L(1.6), depth: 1, shadow: false, hi: false, tension: 0.3 })); }
    S.circ(0, 4, 34, '#fff8ec', { line: S.L(2), depth: 4, shadow: '#f0d9b0', hi: false });
    if (S.d) for (let i = -3; i <= 3; i++) S.path([[-33 * cos(asin(clamp(i / 3.4, -1, 1))), 4 + i * 8.6], [33 * cos(asin(clamp(i / 3.4, -1, 1))), 4 + i * 8.6]], 0.9, '#c9b896', 0.5, 0);
    // the orb with flame tips, bright in the middle
    const sw = (k) => (S.anim ? 2.5 * sin(S.t * 3 + k) : 0), outer = WARM(S, '#ff4f3f', 0.1), mid = WARM(S, ORANGE, 0.1);
    [[-17, -12, 1.2], [0, -17, 2.1], [17, -12, 0.3]].forEach((q, i) => { const sh = flamePts(q[0], q[1] + 10, 17, 30 - (i === 1 ? 0 : 6), (i - 1) * 4 + sw(q[2])); S.cel(sh, outer, { line: S.L(2.4), depth: 3, shadow: warm(outer, 0.16), tension: 0.9, hi: false }); S.fill(flamePts(q[0], q[1] + 9, 10, 18, (i - 1) * 3 + sw(q[2])), mid); });
    S.circ(0, 8, 22, mid, { line: S.L(3), depth: 5, shadow: warm(mid, 0.18), hiW: S.L(2), hi: S.d ? '#ffe9a0' : false });
    S.circ(0, 9, 12, GOLD2, { line: false, shadow: false, hi: false });
    S.circ(1, 10, 6, '#ffffff', { line: false, shadow: false, hi: false });
    S.shine(-9, 0, 4.2, 2.2, -0.8, 0.9);
    sprk(S, [[-38, -32, 7, GOLD2], [38, 34, 6, '#ffffff', 1]]);
  };

  M.ice = (S) => {
    const { f } = S, g = S.g;
    S.glow(0, 0, 58, '#bfe9ff', 0.28 + 0.1 * S.pulse(2.2));
    const base = tk.mix(f.body, '#bfe9ff', 0.55), lt = '#e9f8ff';
    // a glassy bell-shaped crystal with facets, and a tiny crystal clapper
    const prof = [[0, -42], [8, -40], [14, -32], [16, -20], [18, -8], [24, 6], [34, 19], [43, 28]];
    const bell = prof.map((p) => [p[0], p[1], p[0] === 0 ? 1 : undefined]).map((p) => (p[2] ? [p[0], p[1], 1] : [p[0], p[1]])).concat([[43, 32, 1], [-43, 32, 1]], prof.slice(1).reverse().map((p) => [-p[0], p[1]]));
    S.cel(bell, base, { line: S.L(3), depth: 6, shadow: warm(base, 0.12), tension: 0.55, hiW: S.L(2.4), hi: S.d ? lt : false });
    // facets: light and shade panels
    S.fill({ poly: [[0, -38], [12, -30], [15, -14], [26, 8], [14, 29], [0, 29]] }, lt, 0.5);
    S.fill({ poly: [[-16, -18], [-18, -8], [-24, 6], [-34, 19], [-42, 29], [-26, 29]] }, warm(base, 0.18), 0.55);
    if (S.d) { S.ink([[0, -38], [0, 25]], { w: 1.3, color: '#ffffff', alpha: 0.75, taper: 0.4 }); S.ink([[-14, -26], [-8, 26]], { w: 1.1, color: '#ffffff', alpha: 0.5, taper: 0.4 }); S.ink([[14, -22], [22, 24]], { w: 1.1, color: warm(base, 0.25), alpha: 0.6, taper: 0.4 }); }
    S.cel(starPts(0, 38, 4, 3, 7, 0.4).map((p) => [p[0], p[1], 1]), lt, { line: S.L(2), depth: 1.4, shadow: false, tension: 0.3, hi: false });
    S.shine(-9, -24, 3.6, 1.6, -1.2, 0.9);
    // ting!
    const k = S.fr(1.6);
    S.arc(26, -26, 12 + 4 * k, -1.2, 0.2, 3, '#ffffff', S.anim ? 1 - k : 0.9); S.arc(26, -26, 20 + 4 * k, -1.1, 0.1, 2.4, f.bodyL, S.anim ? 0.8 - k * 0.6 : 0.7);
    S.spark(28, -34, S.d ? 11 : 9, { color: '#ffffff', glow: 0.9, alpha: 0.75 + 0.25 * S.tw(0) });
    hitWord(S, 'TING!', -2, -2, 13, -0.15, '#ffffff', '#2d4a8a');
    sprk(S, [[-36, -30, 7], [-36, 30, 5, GOLD2, 1], [38, 34, 5, '#ffffff', 1]]);
  };

  M.ink_splash = (S) => {
    const { f } = S, g = S.g, R = S.rng('is');
    S.glow(0, 0, 60, f.glow, 0.3 + 0.12 * S.pulse(1.3));
    // PKAH! a green beat burst: a spiky starburst, sound rings and two note heads flying off
    const k = 1 + (S.anim ? 0.05 * max(0, sin(S.t * 5)) : 0.02), pts = [];
    const n = 13; for (let i = 0; i < n * 2; i++) { const a = i * PI / n - PI / 2 + 0.1, r = i % 2 ? 19 + 2 * R() : 36 + 7 * R(); pts.push([cos(a) * r * k, sin(a) * r * k, 1]); }
    S.cel(pts, f.body, { line: S.L(3), depth: 6, shadow: f.bodyS, tension: 0.28, hiW: S.L(2.2), hi: S.d ? f.bodyL : false });
    S.circ(0, 0, 21, f.altL, { line: S.L(2.2), depth: 4, shadow: f.altS, hi: false });
    S.circ(0, 0, 14, '#ffffff', { line: false, shadow: false, hi: false });
    S.shine(-8, -9, 4, 1.8, -0.7, 0.9);
    const o = S.anim ? 3 * S.fr(1.3) : 0;
    S.note(31 + o, -22 - o, S.d ? 11 : 12, { kind: 'eighth', color: CREAM, rot: 0.3 });
    S.note(-36 - o, 24 + o, S.d ? 10 : 11, { kind: 'quarter', color: GOLD, rot: -0.3 });
    hitWord(S, 'PKAH!', 0, 0, 15, -0.14, CREAM, LN);
    sprk(S, [[-34, -34, 8], [36, 32, 6, GOLD2, 1], [4, -42, 5, '#ffffff', 1]]);
  };

  M.ink_wave = (S) => {
    const { f } = S, g = S.g, R = S.rng('iw');
    S.glow(0, 4, 60, f.glow, 0.26 + 0.1 * S.pulse(2.4));
    const sh = S.anim ? 3 * sin(S.t * 1.7) : 0, cx = 20, cy = -14 + sh * 0.3, r0 = 20;
    // one big rolling low wave: the swell rises from the left and the crest curls over, deep
    const rise = bez3([-46, 24], [-16, 24], [-12, cy - r0 - 8], [cx, cy - r0], 14);
    const spiral = []; for (let i = 1; i <= 14; i++) { const u = i / 14, a = -PI / 2 + u * 4.1, r = lerp(r0, 8.5, u * u * 0.9 + u * 0.1); spiral.push([cx + cos(a) * r, cy + sin(a) * r]); }
    const outerEdge = rise.concat(spiral.slice(0, 5));
    S.cel(outerEdge.concat([[46, 20], [46, 36, 1], [-46, 36, 1]]).map((p, i, a) => (i >= a.length - 2 ? [p[0], p[1], 1] : p)), f.bodyD === undefined ? f.body : tk.mix(f.body, f.dark, 0.3), { line: S.L(3), depth: 5, shadow: tk.mix(f.body, f.dark, 0.55), tension: 0.6, hi: false });
    S.tube(rise.concat(spiral), 11, f.body, { ol: 2.4, shade: f.bodyS, hi: f.bodyL });
    // foam
    if (S.d) for (let i = 0; i < 7; i++) { const q = polyAt(rise.concat(spiral), 0.5 + i * 0.07); S.circle(q.x + (R() - 0.5) * 6 - 1, q.y - 8 + R() * 3, 1.4 + R() * 1.6, CREAM, 0.95); }
    // sound lines of the low end under the swell, and a note in the curl
    for (let i = 0; i < 3; i++) S.path([[-38, 26 + i * 4.2], [-10, 29 + i * 4.2 + 2 * sin(S.t * 2 + i)], [14, 26 + i * 4.2]], 2.2, i % 2 ? f.altL : '#ffffff', 0.55, 0.6);
    S.note(cx + 2, cy + 3, S.d ? 9 : 10, { kind: 'quarter', color: CREAM, rot: 0.1 });
    hitWord(S, 'WOMP!', -14, 14, 12, -0.2, CREAM, LN);
    sprk(S, [[-34, -30, 8], [38, 34, 6, GOLD2, 1], [38, -36, 5, '#ffffff', 1]]);
  };


  // ===============================================================================================================
  // GROUP 4: stage things (brush_stroke calligraphy scroll eye mask fan bell lantern)
  // ===============================================================================================================
  const WOOD = '#d99a5b', WOODS = '#b27238', DARKGREY = '#3b3856', DARKGREY2 = '#26233c';
  // a stroked ellipse ring with the brown underlay (a flat sound ring seen in perspective)
  const ringE = (S, x, y, rx, ry, w, col, a0, a1, alpha) => {
    const g = S.g; g.save(); if (alpha !== undefined) g.globalAlpha *= cA(alpha); g.lineCap = 'round';
    g.beginPath(); g.ellipse(x, y, max(0.3, rx), max(0.3, ry), 0, a0 || 0, a1 === undefined ? TAU : a1); g.strokeStyle = LN; g.lineWidth = S.L(w + 2.4); g.stroke();
    g.beginPath(); g.ellipse(x, y, max(0.3, rx), max(0.3, ry), 0, a0 || 0, a1 === undefined ? TAU : a1); g.strokeStyle = col; g.lineWidth = S.T(w); g.stroke(); g.restore();
  };

  M.brush_stroke = (S) => {
    const { f } = S, g = S.g;
    S.glow(0, 10, 60, f.glow, 0.26 + 0.1 * S.pulse(1.2));
    const fl = 33;
    // the stage floor, and the drop landing on it in a burst
    S.ell(0, fl, 46, 10, CREAM, { line: S.L(2.4), shadow: '#f0d9b0', depth: 3, hi: false });
    const k = S.anim ? S.fr(1.2) : 0.35;
    ringE(S, 0, fl, 28 + 14 * k, 6 + 3 * k, 3, f.alt, 0, TAU, S.anim ? 1 - k : 0.9);
    // the drop: stacked sound rings that narrow into a down arrow
    const rows = [[-36, 30], [-24, 26], [-12, 21], [0, 16]];
    rows.forEach((r, i) => { const y = r[0] + (S.anim ? 3 * sin(S.t * 3 + i * 0.7) : 0); ringE(S, 0, y, r[1], 6.5, 5.5 - i * 0.5, i % 2 ? f.alt : f.body); });
    S.cel([[-17, 10, 1], [17, 10, 1], [0, 33, 1]], f.body, { line: S.L(2.8), depth: 4, shadow: f.bodyS, tension: 0.3, hi: S.d ? f.bodyL : false });
    S.cel(starPts(0, fl - 1, 9, 9, 21, 0.2).map((p) => [p[0], p[1] * 0.55 + fl * 0.45, 1]), GOLD, { line: S.L(2.2), depth: 2, shadow: '#f0a830', tension: 0.3, hi: false });
    hitWord(S, 'BOOM!', 2, -37, 12, -0.08, CREAM, LN);
    sprk(S, [[-36, -22, 7, '#ffffff', 1], [38, 8, 7, GOLD2], [-38, 14, 5, f.bodyL, 1]]);
  };

  M.calligraphy = (S) => {
    const { f } = S, g = S.g;
    S.glow(0, 0, 58, f.glow, 0.24 + 0.08 * S.pulse(2));
    // a rising stack of equaliser bars, a crescendo
    const n = 7, w = 9.6, base = 40;
    for (let i = 0; i < n; i++) {
      const h = 16 + i * 10.5 + (S.anim ? 4 * sin(S.t * 2.6 + i * 0.9) : 0), x = -36 + i * 12, col = tk.mix(f.altL, f.body, i / (n - 1) * 0.9 + 0.05), sh = warm(col, 0.14);
      S.cel(tk.rrectPts(x - w / 2, base - h, w, h, 4), col, { line: S.L(2.4), depth: 3, shadow: sh, tension: 0.4, hiW: S.L(1.6), hi: S.d ? lit(col, 0.55) : false,
        decor: S.d ? (gg) => { gg.save(); gg.strokeStyle = tk.rgba(LN, 0.55); gg.lineWidth = S.T(1.2); gg.beginPath(); for (let y = base - 7; y > base - h; y -= 7.5) { gg.moveTo(x - w, y); gg.lineTo(x + w, y); } gg.stroke(); gg.restore(); } : undefined });
    }
    S.note(30, -34, S.d ? 11 : 13, { kind: 'eighth', color: CREAM, rot: 0.2 });
    S.heart(-34, -34, 4.5, PINK, { line: S.L(1.8) });
    sprk(S, [[-12, -30, 6, '#ffffff', 1], [38, -10, 7, GOLD2], [-40, -8, 5, f.bodyL, 1]]);
  };

  M.scroll = (S) => {
    const { f } = S, g = S.g;
    S.glow(0, -6, 58, f.glow, 0.24 + 0.08 * S.pulse(2.6));
    // three records fanned out of a crate
    const labels = [f.alt, GOLD, f.body], sway = S.anim ? 0.03 * S.wave(2.8) : 0;
    [[-0.5, 0], [0.5, 2], [0, 1]].forEach((r, i) => {
      const a = r[0] + sway * (i ? -1 : 1);
      S.at(0, 14, a, 1, 1, () => {
        S.circ(0, -30, 24, '#2d2842', { line: S.L(2.8), depth: 3.6, shadow: '#1c1830', hi: S.d ? '#6a6590' : false });
        for (let k = 0; k < 2; k++) S.ring(0, -30, 19 - k * 5, 0.9, '#5b567e', 0.55);
        S.circ(0, -30, 8.5, labels[r[1]], { line: S.L(1.9), depth: 2, shadow: warm(labels[r[1]], 0.16), hi: false });
        S.circle(0, -30, 1.7, '#2d2842');
        S.shine(8, -42, 6, 1.8, 0.7, 0.6);
      });
    });
    // the crate
    S.cel([[-37, 2, 1], [37, 2, 1], [37, 42, 1], [-37, 42, 1]], WOOD, { line: S.L(3), depth: 5, shadow: WOODS, tension: 0.3, hiW: S.L(2), hi: S.d ? '#f2c08a' : false });
    S.path([[-37, 14], [37, 14]], 1.6, WOODS, 0.8, 0); S.path([[-37, 28], [37, 28]], 1.6, WOODS, 0.8, 0);
    S.cel(tk.rrectPts(-12, 9, 24, 8, 4), '#8c5426', { line: S.L(1.8), depth: 1.4, shadow: false, tension: 0.4, hi: false });
    if (S.d) { [[-31, 8], [31, 8], [-31, 36], [31, 36]].forEach((p) => S.circle(p[0], p[1], 1.5, WOODS)); }
    sprk(S, [[-36, -36, 7], [38, -16, 6, GOLD2], [36, 30, 5, '#ffffff', 1]]);
  };

  M.eye = (S) => {
    const { f } = S, g = S.g;
    S.glow(0, 0, 58, f.glow, 0.26 + 0.1 * S.pulse(2.6));
    const look = S.anim ? 3 * S.wave(3.4) : 0, blink = S.anim ? max(0, 1 - 6 * abs(((S.t % 4.2) - 3.0))) : 0, ry = 28 * (1 - 0.82 * blink);
    // a big chibi eye: a round white, an iris of sound rings, a pupil and two catchlights
    S.ell(0, 0, 40, ry, '#ffffff', { line: S.L(3.2), depth: 4, shadow: '#dfe3f5', hi: false });
    g.save(); g.beginPath(); g.ellipse(0, 0, 38, max(0.5, ry - 1.5), 0, 0, TAU); g.clip();
    const ix = look, iy = 1;
    S.circ(ix, iy, 24, f.body, { line: S.L(2.4), depth: 6, shadow: f.bodyS, hi: false });
    S.ring(ix, iy, 19, 3, f.alt, 0.9); S.ring(ix, iy, 14, 2, f.bodyL, 0.95);
    S.circ(ix, iy + 1, 9, '#2b2540', { line: false, shadow: false, hi: false });
    g.restore();
    if (blink < 0.5) {
      S.spark(ix + 8, iy - 9, S.d ? 11 : 10, { color: '#ffffff', glow: 0.5, alpha: 0.85 + 0.15 * S.tw(0) });
      S.circle(ix - 9, iy + 9, 3.6, '#ffffff', 0.9); S.circle(ix + 2, iy + 14, 1.6, '#ffffff', 0.7);
    }
    // the upper lid and the lashes
    S.path(tk.arcPts(0, 0, 40, ry, PI * 1.02, PI * 1.98, 14), 3.8, LN, 1, 0.6);
    [[-40, -6, -48, -16], [-30, -20, -37, -31], [-17, -26, -21, -38]].forEach((l) => S.line([[l[0], l[1] * ry / 28], [l[2], l[3] * ry / 28 - 1]], { w: 3.2, taper: 0.5 }));
    S.path(bez2([-34, -40], [0, -50], [34, -40], 10), 3.2, f.altL, 0.9, 0.6);
    sprk(S, [[38, -34, 7], [-40, 34, 5, GOLD2, 1], [40, 32, 6, '#ffffff', 1]]);
  };

  // a theatre mask: a rounded face with a pointed chin, kind 'grin' or 'sing'
  function theatreMask(S, cx, cy, sc, rot, col, kind) {
    const sh = warm(col, 0.15);
    S.at(cx, cy, rot, sc, sc, () => {
      S.cel([[0, -32], [18, -29], [28, -14], [27, 6], [17, 24], [0, 34], [-17, 24], [-27, 6], [-28, -14], [-18, -29]], col, { line: S.L(3), depth: 5, shadow: sh, tension: 0.8, hiW: S.L(2), hi: S.d ? lit(col, 0.5) : false });
      if (kind === 'grin') {
        [-1, 1].forEach((s) => S.path(bez2([s * 7, -8], [s * 12, -17], [s * 18, -8], 8), 3.4, LN, 1, 0.5));
        S.fillU((gg) => { gg.moveTo(-15, 8); gg.quadraticCurveTo(0, 28, 15, 8); gg.quadraticCurveTo(0, 13, -15, 8); gg.closePath(); }, '#3a1830', { ol: 2, shade: false, hi: false });
        S.path(bez2([-12, 10], [0, 14], [12, 10], 6), 2, CREAM, 1, 0.5);
        [-1, 1].forEach((s) => S.circle(s * 17, 3, 3.6, '#ff8fb0', 0.75));
      } else {
        [-1, 1].forEach((s) => S.path(bez2([s * 7, -12], [s * 12, -5], [s * 18, -12], 8), 3.4, LN, 1, 0.5));
        S.ell(0, 14, 6.5, 8.5, '#3a1830', { line: S.L(2.2), depth: 0, shadow: false, hi: false });
        S.ell(0, 17, 3.6, 3.4, '#ff8fb0', { line: false, shadow: false, hi: false });
        [-1, 1].forEach((s) => S.circle(s * 17, 1, 3.4, '#ff8fb0', 0.75));
      }
    });
  }
  M.mask = (S) => {
    const { f } = S;
    S.glow(0, 0, 58, f.glow, 0.22 + 0.08 * S.pulse(2.4));
    const bob = S.anim ? 1.6 * S.wave(2.2) : 0;
    // two theatre masks: a grinning one and a singing one, tied with a ribbon
    S.path(bez2([-30, -34], [-4, -48], [30, -30], 10), 3.6, LN, 1, 0.6); S.path(bez2([-30, -34], [-4, -48], [30, -30], 10), 1.8, f.altL, 1, 0.6);
    theatreMask(S, 15, 7 - bob, 0.95, 0.22, f.alt, 'sing');
    theatreMask(S, -15, 2 + bob, 1.05, -0.2, f.body, 'grin');
    S.note(30, -20, S.d ? 10 : 12, { kind: 'eighth', color: CREAM, rot: 0.3 });
    sprk(S, [[-40, -30, 7], [38, 36, 6, GOLD2], [-6, 40, 5, '#ffffff', 1]]);
  };

  M.fan = (S) => {
    const { f } = S, g = S.g;
    S.glow(0, 10, 60, f.glow, 0.24 + 0.08 * S.pulse(2.4));
    // three sound waves (three colours) spreading like an open fan from one pivot
    const px = 0, py = 34, cols = [f.body, f.alt, hueTo(f.body, 75)], open = S.anim ? 0.04 * S.wave(2.6) : 0;
    [-1, 0, 1].forEach((k, i) => {
      const a = -PI / 2 + k * (0.62 + open), hw = 0.29, pts = [];
      for (let u = 0; u <= 8; u++) pts.push(polar(px, py, 15, a - hw + (u / 8) * hw * 2));
      for (let u = 8; u >= 0; u--) pts.push(polar(px, py, 60 + (S.anim ? 2 * sin(S.t * 3 + u * 0.8 + i) : 0) + 2.4 * sin(u * 1.4 + i), a - hw + (u / 8) * hw * 2));
      const col = fitL(cols[i], 0.52, 0.72);
      S.cel(pts, col, { line: S.L(2.8), depth: 4, shadow: warm(col, 0.15), tension: 0.5, hiW: S.L(1.8), hi: S.d ? lit(col, 0.5) : false });
      for (let r = 0; r < 2; r++) { const ar = []; for (let u = 0; u <= 8; u++) ar.push(polar(px, py, 28 + r * 14, a - hw * 0.72 + (u / 8) * hw * 1.44)); S.path(ar, 2, '#ffffff', 0.6, 0.6); }
    });
    S.circ(px, py + 2, 8, CREAM, { line: S.L(2.6), depth: 2, shadow: '#f0d9b0', hi: false });
    S.circle(px, py + 2, 2.4, LN2);
    sprk(S, [[-38, -30, 7], [38, -34, 7, GOLD2], [0, -44, 5, '#ffffff', 1]]);
  };

  M.bell = (S) => {
    const { f } = S, g = S.g;
    S.glow(0, 0, 60, f.glow, 0.24 + 0.1 * S.pulse(1.1));
    const p = S.anim ? S.fr(1.1) : 0.3, bump = 1 + (S.anim ? 0.045 * max(0, sin(S.t * 5.7)) : 0.02);
    // pulsing rings out of a big speaker cone
    [-1, 1].forEach((s) => { for (let i = 0; i < 2; i++) { const u = S.anim ? (p + i * 0.5) % 1 : 0.2 + i * 0.4, r = 36 + u * 9; S.arc(0, 4, r + 4 * i, s < 0 ? PI - 0.55 : -0.55, s < 0 ? PI + 0.55 : 0.55, 3.6 - u * 1.5, i ? f.alt : f.body, S.anim ? 1 - u : 0.9 - i * 0.3); } });
    // the cabinet, a small tweeter and the woofer
    S.cel(tk.rrectPts(-31, -41, 62, 84, 8), DARKGREY, { line: S.L(3), depth: 5, shadow: DARKGREY2, tension: 0.4, hiW: S.L(2), hi: S.d ? '#6a678a' : false });
    S.circ(0, -26, 9, '#59566a', { line: S.L(2), depth: 2, shadow: '#3a3942', hi: false }); S.circ(0, -26, 4.2, f.body, { line: S.L(1.6), depth: 1, shadow: f.bodyS, hi: false });
    S.at(0, 12, 0, bump, bump, () => {
      S.circ(0, 0, 25, '#59566a', { line: S.L(2.6), depth: 4, shadow: '#3a3942', hi: S.d ? '#9a97b0' : false });
      S.circ(0, 0, 19, f.bodyL, { line: S.L(2), depth: 3.4, shadow: f.bodyS, hi: false });
      S.ring(0, 0, 14, 1.2, f.bodyS, 0.8);
      S.circ(0, 0, 8, f.body, { line: S.L(2), depth: 2, shadow: f.bodyS, hi: false });
      S.shine(-3, -3.5, 3, 1.6, -0.7, 0.85);
    });
    if (S.d) [[-26, -36], [26, -36], [-26, 38], [26, 38]].forEach((q) => S.circle(q[0], q[1], 1.5, '#9a97b0'));
    hitWord(S, 'TING!', 0, 40, 10, 0, CREAM, LN);
    sprk(S, [[-40, -36, 7], [40, 30, 6, GOLD2, 1]]);
  };

  M.lantern = (S) => {
    const { f } = S, g = S.g;
    const pu = S.anim ? 0.5 + 0.5 * sin(S.t * 3.1) : 0.7;
    S.glow(0, 4, 62, '#ffd870', 0.34 + 0.18 * pu);
    // a warm fairy-light bulb hanging on its string, a heart for a filament
    S.tube([[-46, -34], [-22, -26], [0, -26], [22, -26], [46, -34]], 3.4, '#4a4664', { ol: 1.8, flat: true });
    S.cel(tk.rrectPts(-8, -30, 16, 14, 3), STEEL, { line: S.L(2.2), depth: 2, shadow: '#8f93a8', tension: 0.4, hi: false });
    S.path([[-7, -22], [7, -22]], 1.2, '#8f93a8', 0.9, 0); S.path([[-7, -26], [7, -26]], 1.2, '#8f93a8', 0.9, 0);
    S.cel([[-8, -17, 1], [8, -17, 1], [20, -6], [25, 8], [20, 24], [8, 33], [0, 35], [-8, 33], [-20, 24], [-25, 8], [-20, -6]], tk.mix('#fff2b8', f.bodyL, 0.12), { line: S.L(3), depth: 5, shadow: '#ffd86a', tension: 0.7, hiW: S.L(2), hi: S.d ? '#ffffff' : false });
    S.fill([[0, 18], [-6, 12], [-7, 6], [-3, 3], [0, 6], [3, 3], [7, 6], [6, 12]], '#fff', 0.0);
    S.heart(0, 10, 9, tk.mix('#ffb23a', '#ff7a3a', 0.2), { line: S.L(1.8), shadow: '#e8761e', hi: false });
    S.heart(0, 9.5, 5, '#fff6c8', { line: false, shadow: false, hi: false });
    S.shine(-12, -2, 3, 5.5, 0.2, 0.9);
    sprk(S, [[-34, -8, 7], [38, 14, 8, GOLD2], [30, -30, 5, '#ffffff', 1], [-30, 30, 5, GOLD2, 1]]);
  };


  // ===============================================================================================================
  // GROUP 5: gear and gadgets (koi dragon tiger crane fox web thorns poison_bloom)
  // ===============================================================================================================
  // a soap bubble: a thin outlined disc with a shine
  const bubble = (S, x, y, r, col, a) => { S.circle(x, y, r, col || '#ffffff', 0.22 * (a === undefined ? 1 : a)); S.ring(x, y, r, 1.3, LN, 0.9 * (a === undefined ? 1 : a)); S.ring(x, y, r - 1.2, 0.9, col || '#ffffff', 0.9 * (a === undefined ? 1 : a)); S.shine(x - r * 0.35, y - r * 0.4, r * 0.28, r * 0.15, -0.7, 0.9 * (a === undefined ? 1 : a)); };

  // the outline of a union of circles seen from the first one's centre (a polar profile): one clean polygon, so cel shading never meets overlaps
  function unionPoly(circles, n) {
    const c0 = circles[0], o = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU, ux = cos(a), uy = sin(a); let best = 0;
      circles.forEach((c) => { const dx = c0[0] - c[0], dy = c0[1] - c[1], b = dx * ux + dy * uy, cc = dx * dx + dy * dy - c[2] * c[2], disc = b * b - cc; if (disc >= 0) best = max(best, -b + sqrt(disc)); });
      o.push([c0[0] + ux * best, c0[1] + uy * best]);
    }
    return o;
  }

  M.koi = (S) => {
    const { f } = S, g = S.g, R = S.rng('k');
    S.glow(0, 0, 60, f.glow, 0.24 + 0.08 * S.pulse(2.8));
    const k = 1 + 0.035 * S.wave(2.6);
    // a puffy breath cloud swirling, with small bubbles rising from it
    S.at(0, 4, 0, k, k, () => {
      const blobs = [[2, 4, 20], [-26, 8, 14], [-10, -6, 19], [12, -8, 18], [28, 8, 14], [-14, 16, 13], [18, 17, 12], [4, 14, 17]];
      S.cel({ poly: unionPoly(blobs, 120) }, f.bodyL, { line: S.L(2.8), depth: 5, shadow: tk.mix(f.body, f.bodyL, 0.35), hiW: S.L(2), hi: S.d ? lit(f.bodyL, 0.5) : false });
      // the breath swirl inside
      const sp = spiralPts(2, 4, 3, 17, S.anim ? S.t * 0.5 : 0, 1.6, 22);
      S.path(sp, 3, f.body, 0.95, 0.6);
      S.shine(-20, -2, 5, 2.2, -0.9, 0.9);
    });
    [[-34, -22, 7, 0], [-18, -36, 5, 1], [30, -28, 8, 2], [38, 26, 5, 3], [-38, 30, 4, 4]].forEach((b, i) => bubble(S, b[0], b[1] - (S.anim ? 4 * S.fr(2.4 + i * 0.3, i * 0.3) : 0), b[2], f.altL, S.d || i < 3 ? 1 : 0));
    sprk(S, [[34, 2, 6, GOLD2, 1], [-4, -38, 6]]);
  };

  M.dragon = (S) => {
    const { f } = S, g = S.g;
    S.glow(0, 4, 60, f.glow, 0.24 + 0.1 * S.pulse(1.2));
    const b1 = 1 + (S.anim ? 0.07 * max(0, sin(S.t * 6)) : 0.03), b2 = 1 + (S.anim ? 0.07 * max(0, sin(S.t * 6 + PI)) : 0.03);
    // a chunky boombox: a carry handle, an aerial, two bouncing cones, a tape window
    S.tube([[-30, -16], [-26, -34], [0, -38], [26, -34], [30, -16]], 6, STEEL, { ol: 2.3 });
    S.tube([[34, -16], [42, -40]], 3.4, STEEL, { ol: 1.8, flat: true }); S.circ(42, -41, 3.2, f.alt, { line: S.L(1.8), shadow: false, hi: false });
    S.cel(tk.rrectPts(-41, -17, 82, 52, 9), f.body, { line: S.L(3), depth: 5.4, shadow: f.bodyS, tension: 0.4, hiW: S.L(2.2), hi: S.d ? f.bodyL : false });
    [[-22, 11, b1], [22, 11, b2]].forEach((c) => S.at(c[0], c[1], 0, c[2], c[2], () => {
      S.circ(0, 0, 15, '#59566a', { line: S.L(2.4), depth: 3, shadow: '#3a3942', hi: S.d ? '#9a97b0' : false });
      S.circ(0, 0, 10.5, f.bodyL, { line: S.L(1.8), depth: 2.4, shadow: f.bodyS, hi: false });
      S.circ(0, 0, 4.4, '#59566a', { line: S.L(1.6), depth: 1, shadow: false, hi: false });
    }));
    S.cel(tk.rrectPts(-12, -12, 24, 15, 3), '#2d2842', { line: S.L(2), depth: 0, shadow: false, tension: 0.4, hi: false });
    S.circ(-5, -4.5, 3.6, CREAM, { line: S.L(1.3), shadow: false, hi: false }); S.circ(5, -4.5, 3.6, CREAM, { line: S.L(1.3), shadow: false, hi: false });
    if (S.d) { [-9, -3, 3, 9].forEach((x) => S.cel(tk.rrectPts(x - 2.3, 21, 4.6, 6, 1.4), x === 3 ? f.alt : STEEL, { line: S.L(1.3), depth: 0, shadow: false, tension: 0.4, hi: false })); }
    [-1, 1].forEach((s) => { const k = S.fr(1.2); S.arc(s * 41, 8, 5 + k * 4, s < 0 ? PI - 0.8 : -0.8, s < 0 ? PI + 0.8 : 0.8, 3, f.alt, S.anim ? 1 - k : 0.8); });
    sprk(S, [[-38, -36, 7], [-4, -42, 5, GOLD2, 1], [36, 38, 6, '#ffffff', 1]]);
  };

  M.tiger = (S) => {
    const { f } = S, g = S.g;
    S.glow(-6, 0, 60, f.glow, 0.22 + 0.08 * S.pulse(1.4));
    // a stage wedge monitor on the floor: the slanted face has the driver, and sound lines leave it
    S.ell(0, 36, 48, 7, 'rgba(20,10,40,0.28)', { line: false, shadow: false, hi: false });
    const hw = 42, pts = [[-hw, 32, 1], [hw, 32, 1], [hw, -4, 1], [-hw, 17, 1]];
    S.cel(pts, DARKGREY, { line: S.L(3), depth: 5, shadow: DARKGREY2, tension: 0.3, hiW: S.L(2), hi: S.d ? '#6a678a' : false });
    // the lit slanted face
    S.cel([[-hw + 5, 20, 1], [hw - 5, 1, 1], [hw - 5, -4, 1], [-hw + 5, 15, 1]], STEEL, { line: S.L(1.6), depth: 0, shadow: false, tension: 0.3, hi: false });
    S.at(0, 8, -0.46, 1, 1, () => {
      S.ell(0, 0, 27, 12, '#59566a', { line: S.L(2.4), depth: 3, shadow: '#3a3942', hi: false });
      S.ell(0, 0, 20, 8.6, f.bodyL, { line: S.L(1.8), depth: 2.4, shadow: f.bodyS, hi: false });
      S.ell(0, 0, 8, 3.8, f.body, { line: S.L(1.6), depth: 1.2, shadow: f.bodyS, hi: false });
    });
    [[-hw + 3, 30], [hw - 3, 30]].forEach((p) => S.circ(p[0], p[1], 3.4, STEEL, { line: S.L(1.7), depth: 1, shadow: '#8f93a8', hi: false }));
    const k = S.fr(1.3);
    for (let i = 0; i < 3; i++) { const u = S.anim ? (k + i / 3) % 1 : 0.15 + i * 0.28, r = 22 + u * 22; S.arc(-6, -2, r, -PI / 2 - 0.62, -PI / 2 + 0.28, 3.6 - u * 1.6, i % 2 ? f.alt : f.body, S.anim ? 1 - u : 0.95 - i * 0.2); }
    S.note(26, -26, S.d ? 11 : 13, { kind: 'eighth', color: CREAM, rot: 0.2 });
    sprk(S, [[-40, -30, 7], [40, -10, 6, GOLD2, 1]]);
  };

  // a dancing shoe pointing right, its heel at (0, 0)-ish: body colour, sole, strap and bow
  function danceShoe(S, x, y, rot, col) {
    S.at(x, y, rot, 1, 1, () => {
      const sh = warm(col, 0.14);
      S.cel({ poly: [[-22, 6], [26, 6], [24, 12], [-21, 12]] }, '#fff1d6', { line: S.L(2.2), depth: 1.8, shadow: '#e0c89a', tension: 0.3, hi: false });
      S.cel([[-23, 6], [-22, -6], [-19, -14], [-11, -17], [-6, -11], [2, -9], [12, -9], [21, -6], [27, 0], [28, 7], [24, 10], [-18, 10]], col, { line: S.L(2.8), depth: 4, shadow: sh, tension: 0.78, hiW: S.L(1.8), hi: S.d ? lit(col, 0.5) : false });
      S.cel({ poly: [[-22, 12], [-11, 12], [-12, 22], [-19, 22]] }, '#8c5a3a', { line: S.L(2), depth: 1.2, shadow: false, tension: 0.3, hi: false });
      S.path([[-6, -9], [-1, -1], [0, 6]], 3.2, LN, 1, 0.5); S.path([[-6, -9], [-1, -1], [0, 6]], 1.6, CREAM, 1, 0.5);
      [-1, 1].forEach((s) => S.cel([[8, -7], [8 + s * 6, -13], [8 + s * 7, -4]], CREAM, { line: S.L(1.5), depth: 0, shadow: false, tension: 0.7, hi: false }));
      S.circ(8, -7, 2.3, CREAM, { line: S.L(1.4), shadow: false, hi: false });
      S.shine(12, -4, 3.5, 1.3, -0.3, 0.85);
    });
  }
  M.crane = (S) => {
    const { f } = S, g = S.g;
    S.glow(0, 0, 60, f.glow, 0.22 + 0.08 * S.pulse(1.6));
    const step = S.anim ? S.wave(1.5) : 0;
    // a pair of dancing shoes mid-step, with motion arcs
    S.ell(-6, 38, 44, 6, 'rgba(20,10,40,0.26)', { line: false, shadow: false, hi: false });
    danceShoe(S, -26, 20 - 1 * step, -0.04, f.body);
    danceShoe(S, 4, -4 - 3 * step, -0.4, f.alt);
    S.arc(-6, 22, 34, -PI * 0.88, -PI * 0.34, 3.6, '#ffffff', 0.75); S.arc(-6, 22, 41, -PI * 0.8, -PI * 0.4, 2.6, f.bodyL, 0.7);
    if (S.d) { S.note(-30, -22, 10, { kind: 'eighth', color: CREAM, rot: -0.2 }); S.heart(32, 14, 4, PINK, { line: S.L(1.7) }); }
    sprk(S, [[36, -24, 8], [-40, 0, 6, GOLD2, 1], [32, 36, 5, '#ffffff', 1]]);
  };

  M.fox = (S) => {
    const { f } = S, g = S.g;
    S.glow(0, 2, 60, f.glow, 0.22 + 0.08 * S.pulse(2));
    // a circular undo arrow made of a tape loop: the tape goes round, the arrowhead points back
    const cx = 0, cy = 3, r = 28, a0 = 2.5, a1 = a0 - 4.9, pts = [];
    for (let i = 0; i <= 26; i++) { const a = lerp(a0, a1, i / 26); pts.push([cx + cos(a) * r, cy + sin(a) * r]); }
    const tape = '#8a5a3a';
    S.tube(pts, 13, tape, { ol: 2.6, shade: '#6a3f26', hi: '#c28a5c' });
    // the arrowhead at the end of the tape
    const e = polyAt(pts, 1), ang = Math.atan2(e.ty, e.tx);
    S.at(e.x, e.y, ang, 1, 1, () => S.cel([[-4, -17, 1], [19, 0, 1], [-4, 17, 1]], f.body, { line: S.L(3), depth: 4, shadow: f.bodyS, tension: 0.3, hiW: S.L(1.8), hi: S.d ? f.bodyL : false }));
    // the reels in the middle
    const sp = S.anim ? S.t * 1.6 : 0;
    S.circ(cx, cy, 13, CREAM, { line: S.L(2.4), depth: 3, shadow: '#f0d9b0', hi: false });
    g.save(); g.translate(cx, cy); g.rotate(sp);
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3; S.cel({ poly: [[cos(a) * 3 - sin(a) * 2, sin(a) * 3 + cos(a) * 2], [cos(a) * 10 - sin(a) * 2, sin(a) * 10 + cos(a) * 2], [cos(a) * 10 + sin(a) * 2, sin(a) * 10 - cos(a) * 2], [cos(a) * 3 + sin(a) * 2, sin(a) * 3 - cos(a) * 2]] }, '#59566a', { line: false, depth: 0, shadow: false, hi: false, tension: 0.3 }); }
    g.restore();
    S.circ(cx, cy, 3.6, '#59566a', { line: S.L(1.4), shadow: false, hi: false });
    sprk(S, [[-34, -30, 7], [38, 34, 6, GOLD2, 1], [38, -34, 5, '#ffffff', 1]]);
  };

  M.web = (S) => {
    const { f } = S, g = S.g;
    S.glow(0, 0, 58, f.glow, 0.24 + 0.08 * S.pulse(2.2));
    // a friendly knot of glowing mic cables with three plug ends
    const ph = S.anim ? S.t * 0.35 : 0, knot = [];
    for (let i = 0; i <= 60; i++) { const t = i / 60 * TAU; knot.push([(sin(t) + 2 * sin(2 * t)) * 10.2, (cos(t) - 2 * cos(2 * t)) * 10.2 + 2]); }
    const tails = [[[-14, 22], [-30, 30], [-40, 24]], [[22, 14], [34, 26], [40, 24]], [[0, -29], [-2, -38], [8, -42]]];
    const cols = [f.alt, f.altL, CREAM];
    tails.forEach((tl, i) => {
      const pts = bez2(tl[0], tl[1], tl[2], 10);
      S.tube(pts, 5, cols[i], { ol: 2 });
      const e = polyAt(pts, 1), ang = Math.atan2(e.ty, e.tx);
      S.at(e.x, e.y, ang, 1, 1, () => {
        S.cel(tk.rrectPts(-1, -5.5, 13, 11, 2.4), STEEL, { line: S.L(2), depth: 1.6, shadow: '#8f93a8', tension: 0.4, hi: false });
        S.cel(tk.rrectPts(11, -3.6, 5, 7.2, 1.4), GOLD, { line: S.L(1.5), depth: 0, shadow: false, tension: 0.4, hi: false });
        if (S.d) { S.circle(14, -1.4, 0.9, LN); S.circle(14, 1.4, 0.9, LN); S.path([[3, -5], [3, 5]], 1.2, '#8f93a8', 1, 0); }
      });
    });
    S.tube(knot, 8, f.body, { ol: 2.4, shade: f.bodyS, hi: f.bodyL });
    if (S.d) S.path(knot.slice(8, 30), 2, '#ffffff', 0.6, 0.6);
    sprk(S, [[-38, -32, 7], [38, 36, 6, GOLD2, 1], [36, -22, 6, '#ffffff', 1]]);
  };

  M.thorns = (S) => {
    const { f } = S, g = S.g, R = S.rng('th');
    S.glow(0, 0, 60, f.glow, 0.2 + 0.1 * S.pulse(0.8));
    const lime = tk.mix(LIME, f.alt, 0.12), lime2 = tk.mix('#7fd01a', f.body, 0.12);
    // a mic with jagged lime feedback squiggles radiating from its grille
    const cx = 10, cy = -2, spikes = [[-2.4, 1.2], [-1.9, 0.7], [-1.35, 1], [-0.7, 0.9], [-0.1, 1.1], [0.55, 0.9], [1.1, 1.15]];
    const j = S.anim ? S.t * 14 : 0;
    spikes.forEach((sp, i) => {
      const a = sp[0] - 0.3, pts = [[cx + cos(a) * 17, cy + sin(a) * 17]], n = 5, len = 24 * sp[1] + 6;
      for (let k = 1; k <= n; k++) { const r = 17 + len * k / n, off = (k % 2 ? 1 : -1) * (4 + 1.5 * sin(j + i * 2 + k)) * (1 - k / (n + 2)); pts.push([cx + cos(a) * r - sin(a) * off, cy + sin(a) * r + cos(a) * off]); }
      S.tube(pts, 4.6, i % 2 ? lime : lime2, { ol: 2, flat: true, tension: 0 });
    });
    micHead(S, cx - 6, cy + 6, -0.62, 1.05, { grille: '#7a778c' });
    sprk(S, [[-36, -34, 7], [38, 30, 6, GOLD2, 1], [-34, 34, 5, '#ffffff', 1]]);
  };

  M.poison_bloom = (S) => {
    const { f } = S, g = S.g;
    S.glow(0, 0, 58, f.glow, 0.22 + 0.08 * S.pulse(2.6));
    // a cute earworm: a little worm of notes curling round an ear
    const earPts = [[6, -38], [24, -34], [35, -16], [34, 6], [26, 24], [10, 36], [-4, 30], [-1, 14], [-8, -2], [-8, -22], [-2, -34]];
    S.cel(earPts, SKIN, { line: S.L(3), depth: 5, shadow: SKINS, tension: 0.8, hiW: S.L(2), hi: S.d ? '#fff0e0' : false });
    S.path([[8, -28], [24, -22], [27, -2], [20, 18], [10, 28]], 2.2, SKINS, 1, 0.6);
    S.path([[12, -16], [18, -8], [14, 4]], 2, SKINS, 1, 0.6);
    S.ell(8, 2, 5, 9, '#7a3a28', { line: S.L(1.6), depth: 0, shadow: false, hi: false });
    // the worm: segments along a curl from the ear canal round to a happy face
    const path = bez3([8, 2], [-8, 40], [-52, 22], [-34, -10], 22).concat(bez2([-34, -10], [-32, -22], [-17, -19], 8).slice(1));
    const segs = 11, cols = [f.body, f.alt];
    for (let i = 0; i < segs; i++) {
      const u = i / (segs - 1), p = polyAt(path, u * 0.98), r = lerp(5, 11.5, u * u * 0.6 + u * 0.4) + (S.anim ? 0.6 * sin(S.t * 4 - i * 0.7) : 0);
      S.circ(p.x, p.y, r, cols[i % 2], { line: S.L(2.4), depth: r * 0.34, shadow: warm(cols[i % 2], 0.15), hi: false });
      if (i === segs - 1) {
        S.circle(p.x - 4.2, p.y - 2, 3.4, '#ffffff'); S.circle(p.x + 4.2, p.y - 2, 3.4, '#ffffff'); S.circle(p.x - 3.6 + 0.4 * S.wave(3), p.y - 1.6, 1.7, LN); S.circle(p.x + 4.8 + 0.4 * S.wave(3), p.y - 1.6, 1.7, LN);
        S.path(bez2([p.x - 4, p.y + 4], [p.x, p.y + 8], [p.x + 4, p.y + 4], 6), 1.8, LN, 1, 0.5);
        S.note(p.x + 3, p.y - 11, S.d ? 8 : 9, { kind: 'eighth', color: CREAM, rot: 0.2 });
      }
    }
    sprk(S, [[-40, 30, 6, GOLD2, 1], [36, 38, 5, '#ffffff', 1], [-8, -44, 5, f.bodyL, 1]]);
  };


  // ===============================================================================================================
  // GROUP 6: stage magic (skull heal_light spirit_orb torii mirror sword_rain meteor wave)
  // ===============================================================================================================
  // a crescent polygon (open toward +x): outer circle Ro at (cx, cy), inner circle ri shifted by d
  function moonPoly(cx, cy, Ro, d, ri) {
    const xi = (d * d + Ro * Ro - ri * ri) / (2 * d), yi = sqrt(max(0, Ro * Ro - xi * xi)), th = Math.atan2(yi, xi), ti = Math.atan2(yi, xi - d), pts = [];
    for (let i = 0; i <= 20; i++) { const a = lerp(th, TAU - th, i / 20); pts.push([cx + cos(a) * Ro, cy + sin(a) * Ro]); }
    for (let i = 0; i <= 20; i++) { const a = lerp(TAU - ti, ti, i / 20); pts.push([cx + d + cos(a) * ri, cy + sin(a) * ri]); }
    return { poly: pts };
  }

  // a closed polygon round a spine with a width per point (the spine's normals), shifted by off down the page
  function ribbonPoly(sp, wd, off) {
    const L = [], Rr = [];
    sp.forEach((p, i) => { const q = sp[min(i + 1, sp.length - 1)], q0 = sp[max(i - 1, 0)], tx = q[0] - q0[0], ty = q[1] - q0[1], l = Math.hypot(tx, ty) || 1, nx = -ty / l, ny = tx / l; L.push([p[0] + nx * wd[i], p[1] + ny * wd[i] + off]); Rr.push([p[0] - nx * wd[i], p[1] - ny * wd[i] + off]); });
    return L.concat(Rr.reverse());
  }

  M.skull = (S) => {
    const { f } = S, g = S.g;
    S.glow(0, 0, 58, f.glow, 0.24 + 0.08 * S.pulse(2.6));
    // a music note shaped like a fishing hook: the stem runs down and curls into a barbed hook, the note head sits in the bend
    const sw = S.anim ? 2 * S.wave(2.6) : 0;
    const stem = [[12, -34]].concat(bez3([12, -30], [12, 12], [12 + 0, 22], [4, 32], 8), bez3([4, 32], [-8, 44], [-30, 36], [-32, 14], 10).slice(1), [[-31, 6]]);
    S.tube(stem, 7, f.bodyL, { ol: 2.5 });
    // the barb at the tip of the hook
    S.cel([[-39, 8, 1], [-24, 8, 1], [-31, -6, 1]], f.bodyL, { line: S.L(2.4), depth: 2.4, shadow: f.bodyS, tension: 0.3, hi: false });
    // the flag of the note, at the top of the stem
    S.cel([[8.5, -35, 1], [18, -31], [32, -22], [34, -8], [28, 2], [30, -10], [22, -20], [8.5, -24, 1]], f.alt, { line: S.L(2.6), depth: 3, shadow: f.altS, tension: 0.6, hi: S.d ? f.altL : false });
    // the note head in the bend, a little bait
    S.at(-8 + sw * 0.3, 22, -0.4, 1, 1, () => S.ell(0, 0, 15, 11, f.body, { line: S.L(2.8), depth: 4, shadow: f.bodyS, hiW: S.L(2), hi: S.d ? f.bodyL : false }));
    S.shine(-12, 17, 4, 1.8, -0.7, 0.85);
    // a catchy sparkle
    S.spark(30, 26, S.d ? 9 : 8, { color: '#ffffff', glow: 0.7, alpha: 0.7 + 0.3 * S.tw(0) });
    sprk(S, [[-36, -30, 7], [-8, -42, 5, GOLD2, 1], [40, -34, 5, '#ffffff', 1]]);
  };

  M.heal_light = (S) => {
    const { f } = S, g = S.g;
    S.glow(0, 4, 58, '#ffd09a', 0.26 + 0.08 * S.pulse(3));
    // a steaming mug of warm tea, a heart in the steam
    const sway = (k) => (S.anim ? 3 * sin(S.t * 2 + k) : 0);
    S.ell(0, 40, 36, 5, 'rgba(20,10,40,0.26)', { line: false, shadow: false, hi: false });
    S.tube(bez3([22, 2], [44, 0], [44, 30], [20, 28], 10), 6, f.bodyL, { ol: 2.3 });
    S.cel([[-27, -6, 1], [25, -6, 1], [22, 30], [14, 40], [-16, 40], [-24, 30]], f.body, { line: S.L(3), depth: 5.4, shadow: f.bodyS, tension: 0.45, hiW: S.L(2.2), hi: S.d ? f.bodyL : false });
    S.cel({ poly: [[-26, 14], [24, 14], [23, 22], [-25, 22]] }, CREAM, { line: S.L(1.8), depth: 0, shadow: false, tension: 0.3, hi: false });
    S.heart(0, 18, 3.4, PINK, { line: S.L(1.4), shadow: false, hi: false });
    S.ell(0, -6, 26, 6.5, '#c9803f', { line: S.L(2.6), depth: 2, shadow: '#9a5a26', hi: false });
    S.ell(-5, -6, 11, 2.4, '#e0a063', { line: false, shadow: false, hi: false });
    // the tea bag tag hanging over the edge
    S.path([[-24, -8], [-34, -2], [-34, 10]], 1.6, LN, 1, 0.5); S.cel({ poly: [[-39, 10], [-29, 10], [-29, 20], [-39, 20]] }, CREAM, { line: S.L(1.6), depth: 0, shadow: false, tension: 0.3, hi: false });
    // the steam: two wisps rising into a heart
    [-1, 1].forEach((s, i) => S.path(bez3([s * 10, -14], [s * 18 + sway(i), -22], [s * 2 + sway(i + 1), -26], [s * 6, -32], 8), 4, LN, 0.6, 0.6));
    [-1, 1].forEach((s, i) => S.path(bez3([s * 10, -14], [s * 18 + sway(i), -22], [s * 2 + sway(i + 1), -26], [s * 6, -32], 8), 2.4, '#ffffff', 0.95, 0.6));
    const hk = 1 + (S.anim ? 0.05 * S.wave(1.6) : 0);
    S.at(0, -36, 0, hk, hk, () => S.heart(0, 0, 9.5, '#ffffff', { line: S.L(2.2), shadow: '#ffd9e6', hi: false }));
    sprk(S, [[-38, -28, 7], [38, -22, 6, GOLD2], [36, 36, 5, '#ffffff', 1]]);
  };

  M.spirit_orb = (S) => {
    const { f } = S, g = S.g;
    S.glow(0, 0, 60, f.glow, 0.3 + 0.12 * S.pulse(2.4));
    const br = 1 + (S.anim ? 0.025 * S.wave(2.8) : 0);
    // a glowing bubble with a tiny sound wave inside, a voice memo
    S.at(0, 0, 0, br, br, () => {
      g.save(); g.beginPath(); g.arc(0, 0, 36, 0, TAU); g.fillStyle = tk.rad(g, -10, -12, 3, 0, 0, 38, [[0, tk.rgba('#ffffff', 0.9)], [0.45, tk.rgba(f.bodyL, 0.7)], [0.85, tk.rgba(f.alt, 0.55)], [1, tk.rgba(f.body, 0.85)]]); g.fill(); g.restore();
      g.save(); g.beginPath(); g.arc(0, 0, 36, 0, TAU); g.lineWidth = S.L(3); g.strokeStyle = LN; g.stroke(); g.restore();
      // the waveform
      const n = 9, hs = [5, 10, 17, 11, 22, 13, 18, 8, 5];
      for (let i = 0; i < n; i++) { const h = hs[i] * (S.anim ? 0.75 + 0.35 * sin(S.t * 4 + i * 0.9) : 1); S.cel(tk.rrectPts(-26 + i * 6.5 - 2.3, -h, 4.6, h * 2, 2.3), i % 2 ? CREAM : '#ffffff', { line: S.L(1.8), depth: 0, shadow: false, tension: 0.4, hi: false }); }
      S.circle(0, 28, 3.4, '#ff5a5f'); S.ring(0, 28, 3.4, 1.2, LN, 1);
      S.shine(-17, -23, 9, 3, -0.85, 0.9); S.shine(-5, -31, 3, 1.4, -0.4, 0.7);
      g.save(); g.beginPath(); g.arc(0, 0, 33, 0.3, 1.4); g.lineWidth = S.T(2); g.strokeStyle = tk.rgba('#ffffff', 0.7); g.stroke(); g.restore();
    });
    bubble(S, 33, -30 - (S.anim ? 3 * S.fr(2.2) : 0), 5.5, f.altL); bubble(S, -36, 28, 4, f.altL, S.d ? 1 : 0);
    sprk(S, [[38, 22, 7], [-38, -26, 6, GOLD2, 1], [0, -44, 5, '#ffffff', 1]]);
  };

  M.torii = (S) => {
    const { f } = S, g = S.g, R = S.rng('to');
    S.glow(0, -4, 60, f.glow, 0.22 + 0.08 * S.pulse(2.6));
    const CURT = '#c8264f', CURT2 = '#8f1838', cy = -8;
    // the stage floor
    S.ell(0, 39, 46, 7, CREAM, { line: S.L(2.4), shadow: '#f0d9b0', depth: 2.4, hi: false });
    // the night behind the arch, with the moon inside it
    g.save(); g.beginPath(); g.moveTo(-28, 38); g.lineTo(-28, cy); g.arc(0, cy, 28, PI, TAU); g.lineTo(28, 38); g.closePath(); g.fillStyle = tk.lin(g, 0, -36, 0, 38, [[0, '#2a2a7a'], [1, '#14103a']]); g.fill(); g.restore();
    S.cel(moonPoly(-1, -2, 14, 7, 12), '#ffe9a8', { line: S.L(2), depth: 2.4, shadow: '#f0c870', tension: 0.3, hi: false });
    S.spark(12, -16, 4.5, { color: '#ffffff', alpha: S.tw(0) }); S.spark(-14, 14, 3.5, { color: GOLD2, alpha: S.tw(1) });
    // the proscenium arch: two pillars and a curved beam, curtain red with a gold trim
    const outer = [], inner = []; for (let i = 0; i <= 18; i++) { const a = PI + i / 18 * PI; outer.push([cos(a) * 41, cy + sin(a) * 41, 1]); inner.push([cos(a) * 28, cy + sin(a) * 28, 1]); }
    S.cel([[-41, 40, 1]].concat(outer, [[41, 40, 1], [28, 40, 1]], inner.slice().reverse(), [[-28, 40, 1]]), CURT, { line: S.L(3), depth: 4.5, shadow: CURT2, tension: 0.3, hiW: S.L(2), hi: S.d ? '#e8587a' : false });
    S.path(inner.map((p) => [p[0], p[1]]), 1.6, GOLD, 0.95, 0.5);
    // fairy lights along the arch
    const nb = 7, cols = [GOLD, PINK, SKY, LIME, ORANGE];
    const bulbs = []; for (let i = 0; i < nb; i++) { const a = PI + (i + 0.5) / nb * PI; bulbs.push([cos(a) * 34.5, cy + sin(a) * 34.5]); }
    S.path(bulbs.map((p) => [p[0], p[1] + 1]), 1.4, LN, 0.9, 0.5);
    bulbs.forEach((p, i) => { const on = S.anim ? 0.6 + 0.4 * sin(S.t * 3 + i * 1.3) : 1; S.glow(p[0], p[1], 9, cols[i % 5], 0.5 * on); S.circ(p[0], p[1], 3.6, cols[i % 5], { line: S.L(1.7), depth: 1, shadow: warm(cols[i % 5], 0.14), hi: false }); });
    sprk(S, [[-40, -36, 7], [40, -34, 6, GOLD2]]);
  };

  M.mirror = (S) => {
    const { f } = S, g = S.g, R = S.rng('mi');
    S.glow(0, 4, 60, f.glow, 0.3 + 0.1 * S.pulse(1.8));
    const cx = 0, cy = 4, r = 28, spin = S.anim ? S.t * 0.8 : 0.4;
    // the cord and cap
    S.path([[0, -24], [0, -42]], 3.4, LN, 1, 0); S.path([[0, -24], [0, -42]], 1.4, STEEL, 1, 0);
    S.ring(0, -43, 3.4, 1.8, STEEL, 1);
    S.circ(cx, cy, r, STEEL, { line: S.L(3), depth: 5.4, shadow: '#8f93a8', hi: false });
    // the mirror tiles: curved bands, the latitudes straight and the longitudes turning
    g.save(); g.beginPath(); g.arc(cx, cy, r - 1, 0, TAU); g.clip();
    for (let j = -3; j <= 3; j++) { const yy = cy + j * r / 3.6, w = sqrt(max(0, r * r - (j * r / 3.6) ** 2)); for (let i = -6; i < 6; i++) { const a0 = spin + i * 0.52, a1 = a0 + 0.52; if (cos(a0) < -0.1 && cos(a1) < -0.1) continue; const x0 = cx + sin(a0) * w, x1 = cx + sin(a1) * w, ch = (i + j) & 1; if (cos((a0 + a1) / 2) < 0) continue; g.fillStyle = ch ? tk.rgba('#ffffff', 0.55) : tk.rgba(f.bodyL, 0.5); g.fillRect(min(x0, x1), yy - r / 7.2, abs(x1 - x0), r / 3.6); } }
    g.strokeStyle = tk.rgba(LN2, 0.6); g.lineWidth = S.T(1.1);
    for (let j = -4; j <= 4; j++) { const yy = cy + j * r / 3.6; g.beginPath(); g.moveTo(cx - r, yy - r / 7.2); g.lineTo(cx + r, yy - r / 7.2); g.stroke(); }
    for (let i = -6; i < 6; i++) { const a = spin + i * 0.52; if (cos(a) < 0) continue; g.beginPath(); g.ellipse(cx, cy, abs(sin(a)) * r, r, 0, a >= 0 ? -PI / 2 : PI / 2, a >= 0 ? PI / 2 : PI * 1.5, false); g.stroke(); }
    g.restore();
    S.shine(-10, -9, 6, 2.6, -0.8, 0.9);
    // light spots thrown round the room
    [[-40, -14, 5], [-30, 26, 4], [38, -26, 6], [40, 14, 4], [24, 40, 5], [-26, -38, 4]].forEach((p, i) => { const tw = S.tw(i); S.spark(p[0], p[1], p[2] * (S.d ? 1.3 : 1.5), { color: i % 2 ? '#ffffff' : GOLD2, alpha: tw, glow: 0.5 }); });
    if (S.d) [[-38, 2, 2], [34, -4, 2.6], [10, -38, 2], [-14, 40, 2.2]].forEach((p, i) => S.circle(p[0], p[1], p[2], i % 2 ? CREAM : f.altL, 0.9));
  };

  M.sword_rain = (S) => {
    const { f } = S, g = S.g, R = S.rng('sr');
    S.glow(0, 0, 60, f.glow, 0.22 + 0.08 * S.pulse(2.2));
    // a diagonal rain of tiny notes, each with a streak behind it
    const dir = 1.05, dx = cos(dir), dy = sin(dir), span = 118, kinds = ['eighth', 'quarter', 'beamed', 'eighth', 'quarter'], cols = [CREAM, GOLD, f.altL, f.bodyL, '#ffffff'];
    const n = S.d ? 15 : 10, slide = S.anim ? S.fr(2.4) * span / 5 : 0;
    const list = [];
    for (let i = 0; i < n; i++) {
      const lane = (i * 0.618) % 1, along = ((i * span / n + slide) % span) - span / 2, across = (lane - 0.5) * 96;
      list.push({ x: along * dx - across * dy, y: along * dy + across * dx, i });
    }
    list.forEach((q) => {
      const x = q.x * 0.9, y = q.y * 0.9;
      if (abs(x) > 41 || y < -24 || y > 42) return;
      const sz = 8 + (q.i % 3) * 2.6;
      S.path([[x - dx * 20, y - dy * 20], [x - dx * 5, y - dy * 5]], 2.2, cols[q.i % 5], 0.5, 0);
      S.note(x, y, sz, { kind: kinds[q.i % 5], color: cols[q.i % 5], rot: -0.2 + (q.i % 3) * 0.2 });
    });
    sprk(S, [[-36, -32, 7], [38, 34, 6, GOLD2], [34, -34, 5, '#ffffff', 1]]);
  };

  M.meteor = (S) => {
    const { f } = S, g = S.g, R = S.rng('me');
    S.glow(-8, 8, 62, f.glow, 0.3 + 0.1 * S.pulse(1.3));
    const wob = S.anim ? 2 * S.wave(1.4) : 0, hx = -12, hy = 14;
    // the tail: three tapering ribbons of colour streaming up and to the right, a little wavy
    const tail = (len, w, ang, col, sh, hi, ph) => {
      const sp = [], wd = [], N = 22;
      for (let i = 0; i <= N; i++) { const u = i / N; sp.push([hx + cos(ang) * len * u - sin(ang) * 2.2 * sin(u * 5 + ph + wob), hy + sin(ang) * len * u + cos(ang) * 2.2 * sin(u * 5 + ph + wob)]); wd.push(w * Math.pow(1 - u, 0.85) + 0.4); }
      S.cel({ poly: ribbonPoly(sp, wd, 0) }, col, { line: S.L(2.6), depth: 3.2, shadow: sh, tension: 0.6, hi: hi || false });
    };
    tail(88, 21, -0.74, f.body, f.bodyS, S.d ? f.bodyL : false, 0.5);
    tail(66, 12, -0.74, f.bodyL, tk.mix(f.body, f.bodyL, 0.45), false, 2.1);
    // two thin streaks of the second colour running alongside
    [-1, 1].forEach((sd, i) => { const ox = -sin(-0.74) * sd * 19 * 0 + sd * 12 * 0.74, oy = sd * 12 * 0.67; S.tube([[hx + sd * 11 * 0.67 + 8, hy - sd * 11 * 0.74 - 6], [hx + sd * 11 * 0.67 + 30, hy - sd * 11 * 0.74 - 27], [hx + sd * 11 * 0.67 + 52 + 3 * wob, hy - sd * 11 * 0.74 - 46]], 3.6, f.alt, { ol: 1.8, flat: true }); });
    // the head: a big glowing sound blast, rings of colour, a white core
    S.circ(hx, hy, 22, f.body, { line: S.L(3.2), depth: 5, shadow: f.bodyS, hiW: S.L(2.2), hi: S.d ? f.bodyL : false });
    S.circ(hx, hy, 14.5, f.bodyL, { line: S.L(2), depth: 3, shadow: f.altL, hi: false });
    S.circ(hx - 1, hy - 1, 7.5, '#ffffff', { line: false, shadow: false, hi: false });
    S.shine(hx - 8, hy - 9, 4, 1.8, -0.7, 0.9);
    const k = S.fr(1.2);
    S.arc(hx, hy, 32 + 3 * k, 0.6, 2.2, 4, f.alt, S.anim ? 1 - k * 0.6 : 0.95); S.arc(hx, hy, 40 + 3 * k, 0.8, 2.0, 3, f.bodyL, S.anim ? 0.9 - k * 0.6 : 0.8);
    // the sparkle tail
    [[8, -2, 8], [22, -14, 6], [34, -24, 5], [40, -38, 4]].forEach((p, i) => S.spark(p[0] + 4, p[1] - 4, S.d ? p[2] : p[2] + 1, { color: i % 2 ? GOLD2 : '#ffffff', rot: 0.3 * i, alpha: S.tw(i) }));
    sprk(S, [[-38, -22, 6, '#ffffff', 1], [30, 34, 5, GOLD2, 1]]);
  };

  M.wave = (S) => {
    const { f } = S, g = S.g;
    S.glow(0, 0, 60, f.glow, 0.22 + 0.08 * S.pulse(2));
    // a smooth sine ribbon, thin at the tail and fat at the bright head
    const ph = S.anim ? S.t * 2.2 : 0.4, N = 36, spine = [], wd = [];
    for (let i = 0; i <= N; i++) { const u = i / N, x = -44 + u * 80, y = 6 * (u - 0.5) * -1 + 20 * sin(u * 8.2 + ph) * (0.35 + 0.65 * u); spine.push([x, y]); wd.push(1.5 + 9 * pow2(u)); }
    const ribbon = (sp, off, w2) => { const L = [], Rr = []; sp.forEach((p, i) => { const q = sp[min(i + 1, sp.length - 1)], q0 = sp[max(i - 1, 0)], tx = q[0] - q0[0], ty = q[1] - q0[1], l = Math.hypot(tx, ty) || 1, nx = -ty / l, ny = tx / l, w = wd[i] * w2; L.push([p[0] + nx * w, p[1] + ny * w + off]); Rr.push([p[0] - nx * w, p[1] - ny * w + off]); }); return L.concat(Rr.reverse()); };
    S.cel({ poly: ribbon(spine, 7, 0.7) }, f.alt, { line: S.L(2.4), depth: 2.4, shadow: f.altS, hi: false });
    S.cel({ poly: ribbon(spine, 0, 1) }, f.body, { line: S.L(3), depth: 3.6, shadow: f.bodyS, hiW: S.L(2), hi: S.d ? f.bodyL : false });
    S.path(spine.slice(4, N - 4).map((p) => [p[0], p[1] - 1.4]), 2, '#ffffff', 0.7, 0.6);
    const h = spine[N];
    S.glow(h[0], h[1], 26, '#ffe9a8', 0.6);
    S.circ(h[0], h[1], 11.5, '#fff6c8', { line: S.L(2.8), depth: 3, shadow: '#ffd86a', hi: false });
    S.circ(h[0] + 0.5, h[1] + 0.5, 6, '#ffffff', { line: false, shadow: false, hi: false });
    S.spark(h[0] + 12, h[1] - 12, S.d ? 9 : 8, { color: '#ffffff', glow: 0.8, alpha: 0.75 + 0.25 * S.tw(0) });
    sprk(S, [[-36, -30, 7], [-20, 36, 5, GOLD2, 1], [30, 36, 6, '#ffffff', 1]]);
  };
  const pow2 = (u) => u * u;


  // ===============================================================================================================
  // GROUP 7: moves and magic (tornado quake fist kick arrow coin key book quill void sigil)
  // ===============================================================================================================
  M.tornado = (S) => {
    const { f } = S, g = S.g;
    S.glow(0, 0, 60, f.glow, 0.22 + 0.08 * S.pulse(2));
    const spin = S.anim ? S.t * 1.1 : 0.3;
    // a whirl: a funnel of swirling bands, notes and petals spiralling up round it
    const prof = [[-36, 34], [-30, 28], [-22, 23], [-14, 16], [-6, 9], [4, 4]];
    const left = prof.map((p) => [-p[1] * 0.95, p[0] + 2]), right = prof.map((p) => [p[1] * 0.95, p[0] + 2]);
    S.cel(left.concat([[4, 40, 1]], right.reverse()).map((p, i, a) => (i === 6 ? [p[0], p[1], 1] : p)), f.body, { line: S.L(3), depth: 5, shadow: f.bodyS, tension: 0.6, hiW: S.L(2), hi: S.d ? f.bodyL : false });
    [[-26, 28], [-12, 20], [2, 12], [16, 7], [28, 4]].forEach((b, i) => { const sh = (S.anim ? 3 * sin(spin * 2 + i) : 0); ringE(S, 2 + sh, b[0] + 4, b[1] * 0.9, 4.6, 3.4 - i * 0.3, i % 2 ? f.altL : '#ffffff', 0, PI, 0.85); });
    const orbit = (n, rad0, rad1, y0, y1, build) => { const items = []; for (let i = 0; i < n; i++) { const a = spin + i * TAU / n, u = i / n; items.push({ a, z: sin(a), x: cos(a) * lerp(rad0, rad1, (i % 3) / 3), y: lerp(y0, y1, ((u * 2.3) % 1)), i }); } return items; };
    const items = orbit(7, 42, 30, -34, 30).sort((p, q) => p.z - q.z);
    items.forEach((q) => { const sc = 0.8 + 0.25 * q.z, x = max(-40, min(40, q.x)), y = q.y; if (q.i % 2) loosePetal(S, x, y + 6, 12 * sc, q.a + 1, q.i % 4 === 1 ? PINK : f.altL); else S.note(x, y + 8, (S.d ? 11 : 12) * sc, { kind: q.i % 4 === 0 ? 'eighth' : 'quarter', color: q.i % 4 === 0 ? CREAM : GOLD, rot: sin(q.a) * 0.3 }); });
    sprk(S, [[-38, -30, 7], [38, -34, 6, GOLD2], [36, 36, 5, '#ffffff', 1]]);
  };

  M.quake = (S) => {
    const { f } = S, g = S.g, R = S.rng('qk');
    S.glow(0, 14, 60, f.glow, 0.24 + 0.1 * S.pulse(1));
    const fy = 20, hit = S.anim ? S.fr(1.1) : 0.35;
    // the stage floor, cracking, with a big low shock ring spreading over it
    S.ell(0, fy + 4, 46, 17, '#d9a85f', { line: S.L(3), depth: 5, shadow: '#b27238', hi: false });
    S.ell(0, fy + 1, 40, 13, '#efc687', { line: false, shadow: false, hi: false });
    [[[0, fy], [-9, fy + 4], [-14, fy + 2], [-24, fy + 8], [-34, fy + 6]], [[0, fy], [7, fy + 7], [4, fy + 12], [13, fy + 17], [10, fy + 22]], [[0, fy], [10, fy - 2], [14, fy + 3], [26, fy + 2], [36, fy + 8]], [[-9, fy + 4], [-8, fy + 12], [-14, fy + 17]]].forEach((c, i) => {
      S.path(c, i === 3 ? 3 : 4.4, LN, 1, 0); S.path(c, i === 3 ? 1 : 1.8, '#5a3a22', 1, 0);
    });
    ringE(S, 0, fy + 3, 22 + 20 * hit, 8 + 7 * hit, 4.4, f.alt, 0, TAU, 1 - 0.7 * hit);
    ringE(S, 0, fy + 3, 13 + 14 * hit, 5 + 4.5 * hit, 4.4, f.body, 0, TAU, 1 - 0.5 * hit);
    // chunks flying up, and low notes riding the shock
    const up = S.anim ? sin(PI * hit) * 8 : 4;
    [[-20, fy - 8, 7, 0.3], [18, fy - 12, 8, -0.4], [2, fy - 22, 6, 0.2]].forEach((c, i) => S.at(c[0], c[1] - up * (1 + i * 0.4), c[3] + (S.anim ? 0.3 * S.wave(1.1, i / 3) : 0), 1, 1, () => S.cel([[-c[2], 0, 1], [-c[2] * 0.4, -c[2], 1], [c[2], -c[2] * 0.5, 1], [c[2] * 0.8, c[2] * 0.6, 1], [-c[2] * 0.3, c[2] * 0.8, 1]], '#d9a85f', { line: S.L(2.2), depth: 2, shadow: '#b27238', tension: 0.3, hi: false })));
    S.note(-4, fy - 24 - up * 0.5, S.d ? 13 : 15, { kind: 'quarter', color: CREAM, rot: 0.1 });
    hitWord(S, 'BOOM!', 0, -40, 11, 0, CREAM, LN);
    sprk(S, [[-38, -22, 7], [38, -20, 6, GOLD2]]);
  };

  M.fist = (S) => {
    const { f } = S, g = S.g;
    S.glow(0, 4, 58, f.glow, 0.26 + 0.1 * S.pulse(1.3));
    const bump = S.anim ? 3 * max(0, sin(S.t * 4)) : 1;
    // a chibi fist bump: two round fists meeting, an impact star between them
    const fistShape = (sx, col) => {
      S.at(sx * (20 - bump), 6, 0, sx, 1, () => {
        S.cel([[-6, -20], [12, -23], [26, -14], [28, 4], [20, 19], [2, 22], [-8, 14], [-10, -4]], SKIN, { line: S.L(3), depth: 5, shadow: SKINS, tension: 0.8, hiW: S.L(1.9), hi: S.d ? '#fff0e0' : false });
        for (let i = 0; i < 3; i++) S.ink([[-1 + i * 0.5, -14 + i * 9], [12, -16 + i * 9.5]], { w: 1.8, color: LN2, alpha: 0.8, taper: 0.4 });
        S.cel([[-6, 4], [4, -2], [14, 7], [8, 20], [-3, 19], [-9, 12]], '#ffe4cc', { line: S.L(2.2), depth: 2, shadow: '#f0b898', tension: 0.8, hi: false });
        S.cel(tk.rrectPts(-32, -6, 24, 26, 5), col, { line: S.L(2.8), depth: 3.4, shadow: warm(col, 0.15), tension: 0.4, hi: false });
      });
    };
    fistShape(1, f.alt); fistShape(-1, f.body);
    // the impact
    const k = 1 + (S.anim ? 0.12 * max(0, sin(S.t * 4)) : 0.05);
    S.cel(starPts(0, 2, 8, 12 * k, 25 * k, 0.2).map((p) => [p[0], p[1], 1]), GOLD, { line: S.L(2.6), depth: 3, shadow: '#f0a830', tension: 0.3, hi: false });
    S.cel(starPts(0, 2, 8, 6, 13 * k, 0.6).map((p) => [p[0], p[1], 1]), '#fff6c8', { line: false, depth: 0, shadow: false, tension: 0.3, hi: false });
    [[-1, -1], [1, -1], [0, -1.4]].forEach((d, i) => S.path([[d[0] * 14, -22 + (i === 2 ? -4 : 0)], [d[0] * 20, -34]], 2.6, '#ffffff', 0.8, 0));
    sprk(S, [[-36, -34, 7], [38, -32, 6, GOLD2], [-38, 38, 5, '#ffffff', 1], [38, 38, 5, f.bodyL, 1]]);
  };

  M.kick = (S) => {
    const { f } = S, g = S.g;
    S.glow(-4, 4, 60, f.glow, 0.22 + 0.08 * S.pulse(1.4));
    const sw = S.anim ? 0.08 * S.wave(1.5) : 0, LM = '#b6f23a', LM2 = '#82c41c';
    // motion arcs behind the kick
    S.arc(-6, 14, 40, PI * 0.9, PI * 1.38, 4, '#ffffff', 0.75); S.arc(-6, 14, 46, PI * 0.95, PI * 1.32, 3, f.bodyL, 0.7);
    // a lime trainer mid-kick, toe up
    S.at(-2, 4, -0.38 + sw, 1, 1, () => {
      S.cel([[-32, -26, 1], [-9, -30, 1], [-5, -15], [14, -9], [31, -2], [38, 10, 1], [-32, 10, 1]], LM, { line: S.L(3), depth: 5, shadow: LM2, tension: 0.7, hiW: S.L(2), hi: S.d ? '#e6ff9a' : false });
      S.cel([[-24, -20], [-10, -22], [-8, -12], [-20, -8]], f.alt, { line: S.L(1.8), depth: 0, shadow: false, tension: 0.7, hi: false });
      S.cel([[22, -3], [38, 10, 1], [14, 10, 1]], '#ffffff', { line: S.L(2), depth: 2, shadow: '#dcd6c8', tension: 0.5, hi: false });
      [[-1, -16], [6, -13], [13, -10]].forEach((p) => { S.path([[p[0] - 3, p[1] - 3], [p[0] + 4, p[1] + 3]], 1.8, CREAM, 1, 0); S.path([[p[0] + 4, p[1] - 4], [p[0] - 3, p[1] + 3]], 1.8, CREAM, 1, 0); });
      S.cel([[-34, 10, 1], [40, 10, 1], [42, 20, 1], [-34, 20, 1]], '#fff8ec', { line: S.L(2.8), depth: 3, shadow: '#e0d4b8', tension: 0.3, hi: false });
      S.path([[-30, 15], [36, 15]], 1.8, f.alt, 1, 0);
      if (S.d) S.spark(-24, -4, 5, { color: '#ffffff', alpha: 0.9 });
    });
    sprk(S, [[36, -28, 8], [-34, -30, 6, GOLD2], [30, 34, 5, '#ffffff', 1], [-38, 30, 5, f.bodyL, 1]]);
  };

  M.arrow = (S) => {
    const { f } = S, g = S.g;
    S.glow(6, -6, 62, f.glow, 0.3 + 0.12 * S.pulse(0.9));
    const a0 = [-30, 26], a1 = [30, -26], pu = S.anim ? 1 + 0.1 * sin(S.t * 8) : 1;
    // a laser beam: a hot white core in a coloured sheath, a starry tip
    const beam = [a0, [0, 0], a1];
    S.path(beam, 17 * pu + 4.4, LN, 1, 0); S.path(beam, 17 * pu, f.body, 1, 0); S.path(beam, 9 * pu, f.bodyL, 1, 0); S.path(beam, 4 * pu, '#ffffff', 1, 0);
    // the emitter: a chunky little pen with a lens
    S.at(a0[0] - 2, a0[1] + 2, -0.73, 1, 1, () => {
      S.cel(tk.rrectPts(-22, -9, 26, 18, 5), '#59566a', { line: S.L(2.8), depth: 3, shadow: '#3a3942', tension: 0.4, hi: S.d ? '#9a97b0' : false });
      S.cel(tk.rrectPts(-8, -9, 8, 18, 2), f.alt, { line: S.L(2), depth: 0, shadow: false, tension: 0.4, hi: false });
      S.circ(5, 0, 8, '#ffffff', { line: S.L(2.4), depth: 1.5, shadow: f.bodyL, hi: false });
    });
    S.ring(a0[0] + 8, a0[1] - 8, 9 + 4 * S.fr(0.8), 1.6, '#ffffff', 0.8 - 0.6 * S.fr(0.8));
    // the starry tip
    const k = 1 + 0.08 * S.wave(0.9);
    S.cel(starPts(a1[0] + 2, a1[1] - 2, 4, 5 * k, 20 * k, 0.1).map((p) => [p[0], p[1], 1]), '#ffffff', { line: S.L(2.6), depth: 2.4, shadow: f.bodyL, tension: 0.3, hi: false });
    S.cel(starPts(a1[0] + 2, a1[1] - 2, 4, 3, 10 * k, PI / 4).map((p) => [p[0], p[1], 1]), GOLD2, { line: false, depth: 0, shadow: false, tension: 0.3, hi: false });
    sprk(S, [[-34, -30, 7], [38, 22, 7, GOLD2], [-12, 36, 5, '#ffffff', 1], [14, -40, 5, f.bodyL, 1]]);
  };

  M.coin = (S) => {
    const { f } = S, g = S.g;
    S.glow(0, 6, 58, f.glow, 0.26 + 0.1 * S.pulse(2.4));
    const cx = 0, cy = 5, n = 11, a0 = PI * 0.75, sweep = PI * 1.5, cur = S.anim ? 5 + 3.4 * S.wave(4.2) : 7;
    // a big knob and a ring of numbered dots, lit up to the pointer
    for (let i = 0; i < n; i++) {
      const a = a0 + sweep * i / (n - 1), r = 3.3 + i * 0.28, on = i <= cur;
      S.circ(cx + cos(a) * 38, cy + sin(a) * 38, r, on ? GOLD : '#4a4664', { line: S.L(1.8), depth: r * 0.4, shadow: on ? '#f0a830' : '#2d2842', hi: false });
    }
    S.circ(cx, cy, 28, STEEL, { line: S.L(3), depth: 5.4, shadow: '#8f93a8', hi: S.d ? '#f4f5fb' : false });
    if (S.d) for (let i = 0; i < 20; i++) { const a = i * TAU / 20; S.path([[cx + cos(a) * 25, cy + sin(a) * 25], [cx + cos(a) * 28, cy + sin(a) * 28]], 1.5, '#8f93a8', 0.9, 0); }
    S.circ(cx, cy, 19, f.body, { line: S.L(2.6), depth: 4, shadow: f.bodyS, hiW: S.L(1.8), hi: S.d ? f.bodyL : false });
    const pa = a0 + sweep * clamp(cur, 0, n - 1) / (n - 1);
    S.line([[cx + cos(pa) * 5, cy + sin(pa) * 5], [cx + cos(pa) * 17, cy + sin(pa) * 17]], { w: 4, color: LN, taper: 0 });
    S.path([[cx + cos(pa) * 5, cy + sin(pa) * 5], [cx + cos(pa) * 17, cy + sin(pa) * 17]], 2, CREAM, 1, 0);
    S.shine(-8, -7, 5, 2.4, -0.8, 0.85);
    sprk(S, [[-38, -36, 7], [38, -34, 6, GOLD2], [0, 44, 4, '#ffffff', 1]]);
  };

  M.key = (S) => {
    const { f } = S, g = S.g;
    S.glow(0, 0, 58, f.glow, 0.24 + 0.08 * S.pulse(2.4));
    const sw = S.anim ? 0.06 * S.wave(2.8) : 0;
    // a star key ring (a tag and a ring) with a backstage key hanging from it
    S.ring(-4, -14, 17, 4, LN, 1); S.ring(-4, -14, 17, 2.4, STEEL, 1);
    S.at(-24, 10, -0.25 + sw, 1, 1, () => {
      S.cel(starPts(0, 0, 5, 11, 22, 0).map((p) => [p[0], p[1], 1]), f.body, { line: S.L(2.8), depth: 3.6, shadow: f.bodyS, tension: 0.34, hiW: S.L(1.8), hi: S.d ? f.bodyL : false });
      S.circ(0, -17, 3, STEEL, { line: S.L(1.6), shadow: false, hi: false });
      S.shine(-3, -6, 3, 1.4, -0.9, 0.85);
    });
    S.at(10, -2, 0.62 + sw, 1, 1, () => {
      S.cel([[-6, 0, 1], [6, 0, 1], [6, 40, 1], [3, 44, 1], [-3, 44, 1], [-6, 40, 1]], GOLD, { line: S.L(2.8), depth: 3.4, shadow: '#f0a830', tension: 0.3, hi: S.d ? '#fff6c8' : false });
      [[22, 7], [30, 9], [37, 6]].forEach((t) => S.cel({ poly: [[5, t[0]], [5 + t[1] * 0.7, t[0]], [5 + t[1] * 0.7, t[0] + 5], [5, t[0] + 5]] }, GOLD, { line: S.L(2), depth: 0, shadow: false, tension: 0.3, hi: false }));
      S.circ(0, -8, 15, GOLD, { line: S.L(3), depth: 4, shadow: '#f0a830', hiW: S.L(2), hi: S.d ? '#fff6c8' : false });
      S.circ(0, -8, 5.6, '#59566a', { line: S.L(2), shadow: false, hi: false });
      S.shine(-5, -14, 4, 1.8, -0.7, 0.85);
    });
    S.path(tk.arcPts(-4, -14, 17, 17, -1.1, 0.5, 8), 4.6, LN, 1, 0.5); S.path(tk.arcPts(-4, -14, 17, 17, -1.1, 0.5, 8), 2.6, STEEL, 1, 0.5);
    sprk(S, [[34, -34, 7], [-38, -36, 6, GOLD2, 1], [34, 36, 6, '#ffffff', 1]]);
  };

  M.book = (S) => {
    const { f } = S, g = S.g;
    S.glow(0, 4, 58, f.glow, 0.24 + 0.08 * S.pulse(2.2));
    const cx = 0, cy = 8, r = 28, ph = S.anim ? S.t * 0.7 : 0;
    // a looping arrow, two arrowheads chasing round, with a mic riding the loop
    const arcA = [], arcB = []; for (let i = 0; i <= 18; i++) { arcA.push(polar(cx, cy, r, -2.7 + i / 18 * 2.5)); arcB.push(polar(cx, cy, r, 0.45 + i / 18 * 2.5)); }
    S.tube(arcA, 9, f.body, { ol: 2.4 }); S.tube(arcB, 9, f.alt, { ol: 2.4 });
    [[arcA, f.body], [arcB, f.alt]].forEach((p) => { const e = polyAt(p[0], 1), ang = Math.atan2(e.ty, e.tx); S.at(e.x, e.y, ang, 1, 1, () => S.cel([[-3, -13, 1], [15, 0, 1], [-3, 13, 1]], p[1], { line: S.L(2.8), depth: 3, shadow: warm(p[1], 0.15), tension: 0.3, hi: false })); });
    const my = -26 + (S.anim ? 1.5 * S.wave(1.6) : 0);
    micHead(S, 12, my, -0.5, 0.6, { grille: '#7a778c' });
    S.path([[-30, -34], [-18, -38]], 2.4, '#ffffff', 0.6, 0); S.path([[-34, -26], [-22, -30]], 2.4, f.bodyL, 0.6, 0);
    S.note(-4, 18, S.d ? 11 : 12, { kind: 'eighth', color: CREAM, rot: 0 });
    sprk(S, [[38, -28, 7], [-40, 36, 5, GOLD2, 1], [38, 38, 5, '#ffffff', 1]]);
  };

  M.quill = (S) => {
    const { f } = S, g = S.g;
    S.glow(0, 8, 58, f.glow, 0.24 + 0.1 * S.pulse(1.1));
    const hit = S.anim ? max(0, sin(S.t * 5)) : 0.2, ang = -0.95 + 0.14 * hit;
    // a snare drum seen from a little above: a cream head, steel hoops, lugs
    S.ell(0, 38, 40, 6, 'rgba(20,10,40,0.26)', { line: false, shadow: false, hi: false });
    S.cel([[-38, 14, 1], [38, 14, 1], [38, 36, 1], [-38, 36, 1]], f.body, { line: S.L(3), depth: 5, shadow: f.bodyS, tension: 0.3, hi: S.d ? f.bodyL : false, decor: (gg) => { gg.save(); gg.fillStyle = tk.rgba('#ffffff', 0.5); for (let x = -34; x < 38; x += 8) { gg.beginPath(); gg.moveTo(x, 15); gg.lineTo(x + 4, 35); gg.lineTo(x + 6, 35); gg.lineTo(x + 2, 15); gg.fill(); } gg.restore(); } });
    S.ell(0, 36, 38, 7, f.body, { line: S.L(3), depth: 0, shadow: false, hi: false });
    S.cel([[-38, 33, 1], [38, 33, 1], [38, 38, 1], [-38, 38, 1]], STEEL, { line: S.L(2), depth: 0, shadow: false, tension: 0.3, hi: false });
    [-27, -9, 9, 27].forEach((x) => S.cel(tk.rrectPts(x - 3, 17, 6, 14, 2), STEEL, { line: S.L(1.8), depth: 1, shadow: '#8f93a8', tension: 0.4, hi: false }));
    S.ell(0, 13, 40, 12.5, STEEL, { line: S.L(3), depth: 3.2, shadow: '#8f93a8', hi: S.d ? '#ffffff' : false });
    S.ell(0, 13, 35, 10, '#fff8ec', { line: S.L(1.8), depth: 3, shadow: '#f0d9b0', hi: false });
    // the stick, coming down from the upper right to tap the rim
    const tip = [-14, 6];
    S.at(tip[0], tip[1], ang, 1, 1, () => {
      S.cel([[0, -3, 1], [58, -6, 1], [58, 6, 1], [0, 3, 1]].map((p) => p), '#e8b070', { line: S.L(2.8), depth: 2.2, shadow: '#b27238', tension: 0.3, hi: S.d ? '#f8d6a8' : false });
      S.circ(1, 0, 5.4, '#f2c690', { line: S.L(2.6), depth: 1.6, shadow: '#b27238', hi: false });
    });
    // the spark and the ring from the tap
    const sp = 1 + 0.25 * hit;
    S.cel(starPts(tip[0] - 2, tip[1] + 2, 6, 5 * sp, 13 * sp, 0.3).map((p) => [p[0], p[1], 1]), GOLD, { line: S.L(2.2), depth: 1.6, shadow: false, tension: 0.3, hi: false });
    S.arc(tip[0] - 2, tip[1] + 2, 20 + 4 * hit, PI * 0.9, PI * 1.5, 3, '#ffffff', 0.8);
    S.note(26, -30, S.d ? 11 : 12, { kind: 'eighth', color: CREAM, rot: 0.3 });
    sprk(S, [[-36, -24, 7], [38, -8, 6, GOLD2, 1]]);
  };

  M.void = (S) => {
    const { f } = S, g = S.g;
    const br = 1 + (S.anim ? 0.03 * S.wave(3) : 0), sh = S.anim ? S.fr(4) : 0.3;
    const P1 = tk.mix('#f4f1fb', f.glow, 0.08), P2 = '#e6d9ff', P3 = '#d9fff4', P4 = '#ffe3f1';
    // the Gloss: a polite opalescent blob, airbrushed, with a diagonal sheen and one small closed smile
    g.save(); g.globalAlpha *= 0.3; S.ell(2, 36, 34, 6, '#6c5fa0', { line: false, shadow: false, hi: false }); g.restore();
    tk.glow(g, 0, 0, 56, '#e6d9ff', 0.55, false);
    S.at(0, 0, 0, br, br, () => {
      const blob = [[0, -36], [22, -32], [37, -14], [38, 8], [28, 28], [10, 37], [-10, 37], [-28, 28], [-38, 8], [-37, -14], [-22, -32]];
      g.save(); g.beginPath(); tk.trace(g, blob, 0, 0, 0.9); g.fillStyle = tk.lin(g, -34, -34, 34, 38, [[0, P1], [0.3, P2], [0.62, P3], [1, P4]]); g.fill();
      g.clip();
      g.fillStyle = tk.rad(g, -12, -16, 2, -6, -6, 46, [[0, tk.rgba('#ffffff', 0.85)], [0.6, tk.rgba('#ffffff', 0.12)], [1, tk.rgba('#ffffff', 0)]]); g.fillRect(-46, -46, 92, 92);
      // the sheen sweeps across like a phone screen catching light
      g.translate(-60 + 120 * sh, 0); g.transform(1, 0, -0.5, 1, 0, 0); g.fillStyle = tk.lin(g, -9, 0, 9, 0, [[0, 'rgba(255,255,255,0)'], [0.5, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(-9, -44, 18, 88);
      g.restore();
      g.save(); g.beginPath(); tk.trace(g, blob, 0, 0, 0.9); g.lineWidth = S.L(3.4); g.strokeStyle = tk.rgba('#ffffff', 0.85); g.stroke(); g.lineWidth = S.L(1.5); g.strokeStyle = tk.rgba('#9a86d8', 0.95); g.stroke(); g.restore();
      // the polite Gloss smile
      S.path(bez2([-8, 6], [0, 13], [8, 6], 8), 2.6, '#9a8fc0', 1, 0.5);
    });
    S.shine(-18, -20, 8, 2.8, -0.85, 0.85);
    sprk(S, [[-38, -30, 6, '#ffffff'], [38, -26, 6, '#fff3fb'], [34, 34, 5, '#e6ffff', 1], [-34, 36, 4, '#ffffff', 1]]);
  };

  M.sigil = (S) => {
    const { f } = S, g = S.g;
    S.glow(0, 0, 60, f.glow, 0.3 + 0.12 * S.pulse(2));
    const spin = S.anim ? S.t * 0.4 : 0;
    // a magic circle of music: a sparkly double ring, a looping flourish and three stars (hocus vocus)
    S.circle(0, 0, 36, f.bodyL, 0.18);
    S.ring(0, 0, 36, 6.6, LN, 1); S.ring(0, 0, 36, 4.2, f.body, 1);
    S.ring(0, 0, 27, 3.4, LN, 1); S.ring(0, 0, 27, 1.6, f.altL, 1);
    S.dash(0, 0, 31.5, 31.5, 1.4, '#ffffff', 0.9, [1.2, 5], spin * 20);
    // the looping flourish (an infinity loop on a slant)
    const lp = []; for (let i = 0; i <= 40; i++) { const t = i / 40 * TAU; lp.push([cos(-0.45) * 22 * sin(t) - sin(-0.45) * 12 * sin(2 * t), sin(-0.45) * 22 * sin(t) + cos(-0.45) * 12 * sin(2 * t)]); }
    S.tube(lp, 5, f.alt, { ol: 2, tension: 0.5 });
    // three stars on the ring
    for (let i = 0; i < 3; i++) { const a = -PI / 2 + i * TAU / 3 + spin * 0.0, x = cos(a) * 36, y = sin(a) * 36; S.cel(starPts(x, y, 5, 4.6, 10.5, 0).map((p) => [p[0], p[1], 1]), i === 0 ? GOLD : i === 1 ? PINK : LIME, { line: S.L(2), depth: 1.6, shadow: false, tension: 0.34, hi: false }); }
    S.note(0, 5, S.d ? 9 : 10, { kind: 'eighth', color: CREAM, rot: 0.15 });
    sprk(S, [[-40, -36, 7], [40, 34, 6, GOLD2], [-38, 30, 5, '#ffffff', 1]]);
  };

  // ---------------------------------------------------------------------------------------------------------------
  // public: ART.card.motif (any size: 24 px icons and 300 px card art alike; detail follows the pixel size)
  // ---------------------------------------------------------------------------------------------------------------
  function drawMotif(ctx, motifId, x, y, size, palette, t, o) {
    size = size > 0 && isFinite(size) ? size : 40;
    x = num(x, 0); y = num(y, 0);
    const key = String(motifId);
    const fn = M[key] && key.charAt(0) !== '_' ? M[key] : null;
    const fam = famOf(palette), f = ext(fam);
    ctx.save();
    ctx.translate(x, y);
    const sc = size / 100;
    ctx.scale(sc, sc);
    if (o && o.rot) ctx.rotate(o.rot);
    if (o && o.flip) ctx.scale(-1, 1);
    const S = makeS(ctx, key, f, size, (typeof t === 'number' && isFinite(t)) ? t : undefined, o);
    if (S.anim && !(tk.opt && tk.opt.reduceMotion)) { const k = 1 + 0.014 * sin(S.t * 2.3 + 0.7); ctx.translate(0, 1.3 * sin(S.t * 1.7)); ctx.scale(k, k); }   // every motif breathes a little
    if (fn) fn(S);
    else { S.cel(tk.ellipsePts(0, 0, 30, 30, 14), f.base, {}); S.spark(0, 0, 12, {}); }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // BACKGROUNDS. Everything below paints in the card's VIRTUAL window: height VH, width VW = h to w ratio, so a card looks the same at any size.
  // The grounds are soft: gradients, glows and flat shapes with no outline of their own, so the sticker motif and the hero stay the crisp thing.
  // ---------------------------------------------------------------------------------------------------------------
  const VH = 116;
  const grad = (g, x0, y0, x1, y1, stops) => tk.lin(g, x0, y0, x1, y1, stops);
  const SUN = '#fff6d8', LIPC = '#fff1d6';

  // the ground palette: motifs are bright cartoon shapes with a dark brown line, so the scene behind them sits in the mid and dark tones. Pale
  // families (moon, gold, and the like) are pulled down into a usable ground, and near-white lights are eased.
  const lumOf = (hex) => { const c = U.color.rgb(hex); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; };
  const GROUND = new Map();
  function groundOf(fam, pname) {
    const key = pname + fam.base;
    let G = GROUND.get(key);
    if (G) return G;
    const pale = lumOf(fam.base) > 0.72;
    const base = pale ? tk.mix(fam.dark, INK, 0.32) : fam.base;
    const dark = pale ? tk.mix(fam.dark, INK, 0.72) : fam.dark;
    const light = pale ? tk.mix(fam.dark, fam.base, 0.34) : tk.mix(fam.light, fam.base, 0.22);
    G = ext({ base, light, dark, glow: pale ? tk.mix(fam.dark, fam.glow, 0.5) : fam.glow });
    G = Object.assign({}, G, { pale });
    GROUND.set(key, G);
    return G;
  }

  // a puffy cloud at (x, y), scale s: white with a tinted underside, no outline
  function cloud(g, x, y, s, a, tint) {
    const cs = [[0, 0, 13], [-14, 4, 9.5], [14, 3.5, 10.5], [-5, -7, 10], [7, -6, 9], [-22, 8, 6], [23, 8, 6]].map((c) => [x + c[0] * s, y + c[1] * s, c[2] * s]);
    const poly = unionPoly(cs, 40);
    g.save(); g.globalAlpha *= cA(a);
    g.beginPath(); tk.trace(g, { poly }); g.fillStyle = '#ffffff'; g.fill();
    g.clip(); g.fillStyle = grad(g, 0, y - 4 * s, 0, y + 14 * s, [[0, tk.rgba(tint, 0)], [1, tk.rgba(tint, 0.5)]]); g.fillRect(x - 40 * s, y - 20 * s, 80 * s, 40 * s);
    g.restore();
  }
  // the stage in the foreground: a curved floor with a cream lip, one spotlight cone landing in a pool of light
  function stageFront(g, sp, VW, F, v) {
    const cx = VW / 2, top = 91 + 3 * v('st');
    g.save();
    g.beginPath(); g.ellipse(cx, VH + 36, VW * 0.74, VH + 36 - top, 0, 0, TAU); g.fillStyle = grad(g, 0, top, 0, VH, [[0, tk.mix(F.dark, '#7a4a3a', 0.4)], [1, tk.mix(F.dark, INK, 0.5)]]); g.fill();
    g.lineWidth = 3.4; g.strokeStyle = LIPC; g.stroke(); g.lineWidth = 1; g.strokeStyle = tk.rgba('#2d170f', 0.45); g.beginPath(); g.ellipse(cx, VH + 36 + 1.6, VW * 0.74, VH + 36 - top, 0, 0, TAU); g.stroke();
    const lx = v('lx') < 0.5 ? VW * 0.12 : VW * 0.88, px = VW * (0.32 + 0.36 * v('px'));
    g.fillStyle = grad(g, 0, -4, 0, top + 6, [[0, tk.rgba('#fff4cf', 0)], [0.6, tk.rgba('#fff4cf', 0.12)], [1, tk.rgba('#fff4cf', 0.3)]]);
    g.beginPath(); g.moveTo(lx - 3, -4); g.lineTo(lx + 3, -4); g.lineTo(px + 32, top + 8); g.lineTo(px - 32, top + 8); g.closePath(); g.fill();
    g.beginPath(); g.ellipse(px, top + 9, 32, 6.4, 0, 0, TAU); g.fillStyle = tk.rgba('#fff4cf', 0.55); g.fill();
    g.beginPath(); g.ellipse(px, top + 9, 20, 3.8, 0, 0, TAU); g.fillStyle = tk.rgba('#ffffff', 0.55); g.fill();
    g.restore();
  }

  // patterns laid over a ground: polka dots, a checker stage floor, a field of tiny stars (no screen-tone)
  function patternOver(g, kind, VW, col, a) {
    g.save(); g.globalAlpha *= cA(a); g.fillStyle = col;
    if (kind === 'dots') {
      const r = 3.2, sp = 13; for (let y = 4, j = 0; y < VH + sp; y += sp * 0.5, j++) for (let x = (j % 2 ? sp / 2 : 0); x < VW + sp; x += sp) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
    } else if (kind === 'checker') {
      const s = 11, y0 = VH - 38; for (let j = 0; y0 + j * s < VH; j++) for (let i = 0; i * s < VW + s; i++) if ((i + j) & 1) g.fillRect(i * s, y0 + j * s, s, s);
    } else {
      const rr = tk.rng('tinystars', Math.round(VW)); for (let i = 0; i < 26; i++) { const x = rr() * VW, y = rr() * VH, s = 1.4 + rr() * 2; g.beginPath(); g.moveTo(x, y - s * 1.6); g.lineTo(x + s * 0.4, y - s * 0.4); g.lineTo(x + s * 1.6, y); g.lineTo(x + s * 0.4, y + s * 0.4); g.lineTo(x, y + s * 1.6); g.lineTo(x - s * 0.4, y + s * 0.4); g.lineTo(x - s * 1.6, y); g.lineTo(x - s * 0.4, y - s * 0.4); g.closePath(); g.fill(); }
    }
    g.restore();
  }

  // scenery: bunting, gulls, a fairy-light string, a far stage arch (kinds of sp.scenery)
  const FLAGC = [PINK, GOLD, SKY, LIME, ORANGE];
  function sceneryOver(g, sp, VW, F, v, t) {
    const kind = sp.scenery, rr = tk.rng('scn', sp.id);
    if (kind === 'bunting' || kind === 'lights') {
      const sag = 7 + 5 * v('sg'), y0 = 4 + 4 * v('sy'), sw = t !== undefined ? sin(t * 1.2) * 0.8 : 0;
      const at = (u) => [u * (VW + 8) - 4, y0 + sag * sin(PI * u) + sw * sin(PI * u)];
      const pts = []; for (let i = 0; i <= 14; i++) pts.push(at(i / 14));
      g.save(); g.lineCap = 'round'; g.beginPath(); tk.trace(g, pts, 0, 0, 0.5, false); g.strokeStyle = tk.rgba('#2d170f', 0.8); g.lineWidth = 1.4; g.stroke(); g.restore();
      const n = kind === 'bunting' ? Math.round(VW / 13) : Math.round(VW / 15);
      for (let i = 1; i < n; i++) {
        const u = i / n, p = at(u), col = FLAGC[(i + (sp.seed & 3)) % 5];
        if (kind === 'bunting') { g.save(); g.beginPath(); g.moveTo(p[0] - 5, p[1]); g.lineTo(p[0] + 5, p[1]); g.lineTo(p[0], p[1] + 10); g.closePath(); g.fillStyle = col; g.fill(); g.lineWidth = 1.1; g.lineJoin = 'round'; g.strokeStyle = tk.rgba('#2d170f', 0.75); g.stroke(); g.restore(); }
        else { const on = t !== undefined ? 0.65 + 0.35 * sin(t * 3 + i * 1.4) : 1; tk.glow(g, p[0], p[1] + 3, 8, col, 0.5 * on); g.beginPath(); g.arc(p[0], p[1] + 3, 2.6, 0, TAU); g.fillStyle = col; g.fill(); g.lineWidth = 1; g.strokeStyle = tk.rgba('#2d170f', 0.8); g.stroke(); }
      }
    } else if (kind === 'gulls') {
      const bx = VW * (0.15 + 0.4 * v('bx')), by = 13 + 14 * v('by');
      for (let i = 0; i < 4; i++) {
        const x = bx + i * 12 + (rr() - 0.5) * 6, y = by + (i % 2) * 6 - i * 2 + (rr() - 0.5) * 3, s = 5 + rr() * 3, flap = t !== undefined ? sin(t * 5 + i) * 1.2 : 0;
        const pts = [[x - s, y - s * 0.3 + flap], [x - s * 0.3, y - s * 0.1], [x, y + s * 0.2], [x + s * 0.3, y - s * 0.1], [x + s, y - s * 0.4 + flap]];
        tk.inkPath(g, pts, { w: 2.8, color: '#2d170f', taper: 0.3, wobble: 0.04, alpha: 0.85 }); tk.inkPath(g, pts, { w: 1.4, color: '#ffffff', taper: 0.3, wobble: 0.04 });
      }
    } else if (kind === 'arch') {
      const tx = VW * (0.15 + 0.7 * v('tx')), ty = 86, c = tk.mix(F.dark, INK, 0.5);
      g.save(); g.globalAlpha *= 0.62; g.strokeStyle = c; g.lineWidth = 3.4; g.lineCap = 'round'; g.beginPath(); g.moveTo(tx - 13, ty); g.lineTo(tx - 13, ty - 20); g.arc(tx, ty - 20, 13, PI, TAU); g.lineTo(tx + 13, ty); g.stroke(); g.restore();
      for (let i = 0; i < 5; i++) { const a = PI + (i + 0.5) / 5 * PI; tk.glow(g, tx + cos(a) * 13, ty - 20 + sin(a) * 13, 5, FLAGC[i], 0.5); g.beginPath(); g.arc(tx + cos(a) * 13, ty - 20 + sin(a) * 13, 1.5, 0, TAU); g.fillStyle = FLAGC[i]; g.fill(); }
    }
  }

  // a broad soft streamer across the ground (a ribbon of party colour with a thin sheen)
  function streamer(g, sp, VW, light) {
    const v = sp.v, ang = (v('sw') - 0.5) * 1.1, cx = VW * (0.3 + 0.4 * v('swx')), cy = VH * (0.3 + 0.4 * v('swy'));
    const len = VW * 0.62, dx = cos(ang) * len, dy = sin(ang) * len;
    const path = bez3([cx - dx, cy - dy + 8], [cx - dx * 0.4, cy - dy * 0.4 - 16 * (v('swb') - 0.5) * 2], [cx + dx * 0.3, cy + dy * 0.3 + 14], [cx + dx, cy + dy - 6], 26);
    const wd = path.map((p, i) => 2 + 11 * sin(PI * clamp(i / (path.length - 1) * 1.05, 0, 1)));
    const col = light ? sp.G.base : sp.f.alt;
    g.save(); g.globalAlpha *= light ? 0.26 : 0.3; g.beginPath(); tk.trace(g, { poly: ribbonPoly(path, wd, 0) }); g.fillStyle = col; g.fill(); g.restore();
    g.save(); g.globalAlpha *= 0.4; g.lineCap = 'round'; g.lineWidth = 1.6; g.strokeStyle = '#ffffff'; g.beginPath(); tk.trace(g, path.map((p, i) => [p[0], p[1] - wd[i] * 0.45]), 0, 0, 0.6, false); g.stroke(); g.restore();
  }

  const BG = {};
  // dusk: a stage at golden hour: a warm sky, a sun, puffy clouds, the stage lip and one spotlight
  BG.dusk = (g, sp, VW, ctx) => {
    const F = sp.G, v = sp.v;
    g.fillStyle = grad(g, 0, 0, 0, VH, [[0, tk.mix(F.light, '#ffe6b8', 0.4 + 0.2 * v('a'))], [0.5, tk.mix(F.light, '#ffb690', 0.45)], [0.85, tk.mix(F.base, '#ff9a72', 0.28)], [1, F.base]]); g.fillRect(0, 0, VW, VH);
    const dx = VW * (0.22 + 0.56 * v('dx')), dy = 24 + 20 * v('dy'), dr = 12 + 8 * v('dr');
    for (let i = 0; i < 3; i++) { const a = PI / 2 + (i - 1) * 0.42 + (v('ga') - 0.5) * 0.3, R1 = 150; g.fillStyle = tk.rgba('#ffffff', 0.1); g.beginPath(); g.moveTo(dx, dy); g.lineTo(dx + cos(a - 0.09) * R1, dy + sin(a - 0.09) * R1); g.lineTo(dx + cos(a + 0.09) * R1, dy + sin(a + 0.09) * R1); g.closePath(); g.fill(); }
    tk.glow(g, dx, dy, dr * 3.6, '#fff0c0', 0.65);
    g.beginPath(); g.arc(dx, dy, dr, 0, TAU); g.fillStyle = SUN; g.fill(); g.lineWidth = 1.6; g.strokeStyle = tk.rgba('#ffd98a', 0.9); g.stroke();
    if (sp.pattern) patternOver(g, sp.pattern, VW, '#ffffff', 0.14);
    cloud(g, VW * (0.12 + 0.3 * v('cx0')), 22 + 10 * v('c0'), 0.9 + 0.35 * v('cs0'), 0.9, F.base);
    cloud(g, VW * (0.55 + 0.35 * v('cx1')), 38 + 10 * v('c1'), 0.7 + 0.3 * v('cs1'), 0.8, F.base);
    stageFront(g, sp, VW, F, v);
  };
  // wash: a pastel gig-poster wash with a ring of sparkles
  BG.wash = (g, sp, VW) => {
    const F = sp.G, v = sp.v;
    g.fillStyle = grad(g, 0, 0, VW * 0.3, VH, [[0, tk.mix('#fff4ea', F.light, 0.4)], [0.55, tk.mix('#ffe9f3', F.light, 0.6)], [1, tk.mix('#ffd9ec', F.base, 0.5)]]); g.fillRect(0, 0, VW, VH);
    if (sp.pattern) patternOver(g, sp.pattern, VW, F.base, 0.16);
    const cx = VW * (0.3 + 0.4 * v('ex')), cy = 46 + 14 * v('ey'), r = 34 + 8 * v('er');
    const rr = tk.rng('wsh', sp.id);
    for (let i = 0; i < 4; i++) { const x = rr() * VW, y = rr() * VH, rad = 22 + rr() * 22; g.fillStyle = tk.rad(g, x, y, 0, x, y, rad, [[0, tk.rgba(i % 2 ? sp.f.alt : F.light, 0.5)], [1, tk.rgba(F.light, 0)]]); g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    tk.glow(g, cx, cy, r * 1.3, F.glow, 0.5);
    g.save(); g.setLineDash([2.2, 5]); g.lineCap = 'round'; g.beginPath(); g.arc(cx, cy, r + 8, 0, TAU); g.lineWidth = 1.6; g.strokeStyle = tk.rgba(F.base, 0.55); g.stroke(); g.restore();
    const n = 12, a0 = v('ea') * TAU;
    for (let i = 0; i < n; i++) { const a = a0 + i / n * TAU, big = i % 3 === 0; tk.sparkle(g, cx + cos(a) * r, cy + sin(a) * r, big ? 5.4 : 3.2, { color: big ? '#ffffff' : i % 2 ? F.base : GOLD, alpha: 0.95, glow: big ? 0.5 : 0, rot: a }); }
    g.fillStyle = tk.rgba(F.base, 0.26); g.beginPath(); g.moveTo(-2, VH + 2); for (let x = -2; x <= VW + 4; x += 4) g.lineTo(x, 100 + 6 * sin(x * 0.06 + sp.seed % 7)); g.lineTo(VW + 4, VH + 2); g.closePath(); g.fill();
    g.fillStyle = tk.rgba(F.dark, 0.2); g.beginPath(); g.moveTo(-2, VH + 2); for (let x = -2; x <= VW + 4; x += 4) g.lineTo(x, 110 + 4 * sin(x * 0.09 + 2 + sp.seed % 5)); g.lineTo(VW + 4, VH + 2); g.closePath(); g.fill();
  };
  // burst: comic focus rays converging on the motif
  BG.burst = (g, sp, VW, ctx) => {
    const F = sp.G, v = sp.v, fx = ctx.mx, fy = ctx.my;
    g.fillStyle = tk.rad(g, fx, fy, 0, fx, fy, Math.hypot(VW, VH) * 0.65, [[0, tk.mix(F.light, F.glow, 0.35)], [0.3, F.light], [0.7, F.base], [1, F.dark]]); g.fillRect(0, 0, VW, VH);
    const n = 22, off = v('ro') * TAU, R1 = Math.hypot(VW, VH);
    g.save(); g.fillStyle = tk.rgba('#ffffff', 0.2);
    for (let i = 0; i < n; i += 2) { const a = off + i / n * TAU, da = TAU / n * (0.7 + 0.5 * v('rw' + i)); g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + cos(a) * R1, fy + sin(a) * R1); g.lineTo(fx + cos(a + da) * R1, fy + sin(a + da) * R1); g.closePath(); g.fill(); }
    g.restore();
    g.save(); g.fillStyle = tk.rgba(F.dark, 0.26);
    for (let i = 1; i < n; i += 2) { const a = off + i / n * TAU, da = TAU / n * 0.6; g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + cos(a) * R1, fy + sin(a) * R1); g.lineTo(fx + cos(a + da) * R1, fy + sin(a + da) * R1); g.closePath(); g.fill(); }
    g.restore();
    if (sp.pattern) patternOver(g, sp.pattern, VW, '#ffffff', 0.1);
    tk.speedLines(g, fx, fy, { n: 40, seed: sp.seed % 1000, r0: 34, r1: R1, w: 3.4, alpha: 0.5, color: '#ffffff' });
  };
  // split: the duo card's hard diagonal between two tones of the palette, a cream stripe on the cut
  BG.split = (g, sp, VW) => {
    const F = sp.G, v = sp.v, sl = 0.2 + 0.18 * v('sl'), x0 = VW * (0.38 + 0.24 * v('sx')), dxs = (v('sd') < 0.5 ? 1 : -1) * VW * sl;
    g.fillStyle = grad(g, 0, 0, VW, VH, [[0, tk.mix(F.light, F.base, 0.2)], [1, F.base]]); g.fillRect(0, 0, VW, VH);
    g.save(); g.beginPath(); g.moveTo(x0 + dxs, -2); g.lineTo(VW + 2, -2); g.lineTo(VW + 2, VH + 2); g.lineTo(x0 - dxs, VH + 2); g.closePath(); g.clip();
    g.fillStyle = grad(g, 0, 0, VW, VH, [[0, tk.mix(F.alt, F.dark, 0.25)], [1, tk.mix(F.alt, F.dark, 0.6)]]); g.fillRect(0, 0, VW, VH);
    if (sp.pattern) patternOver(g, sp.pattern, VW, '#ffffff', 0.12);
    g.restore();
    const cut = (o, w, col, a) => { g.save(); g.globalAlpha *= a; g.lineWidth = w; g.lineCap = 'butt'; g.strokeStyle = col; g.beginPath(); g.moveTo(x0 + dxs + o, -4); g.lineTo(x0 - dxs + o, VH + 4); g.stroke(); g.restore(); };
    cut(0, 7.6, '#2d170f', 0.7); cut(0, 4.8, LIPC, 1);
    for (let i = 0; i < 3; i++) { const u = 0.2 + 0.3 * i + 0.1 * v('st' + i); tk.sparkle(g, lerp(x0 + dxs, x0 - dxs, u), VH * u, 3.4, { color: '#ffffff', alpha: 0.95, glow: 0.3 }); }
    g.fillStyle = tk.rgba(INK, 0.22); g.beginPath(); g.moveTo(-2, VH + 2); for (let x = -2; x <= VW + 4; x += 4) g.lineTo(x, 108 + 4 * sin(x * 0.07 + sp.seed % 9)); g.lineTo(VW + 4, VH + 2); g.closePath(); g.fill();
  };
  // night: a deep starry night with a big moon, a glow round the motif and a crowd of round heads along the bottom
  BG.night = (g, sp, VW, ctx) => {
    const F = sp.G, v = sp.v;
    g.fillStyle = grad(g, 0, 0, 0, VH, [[0, tk.mix(F.dim, INK, 0.4)], [0.6, tk.mix(F.dark, INK, 0.2)], [1, tk.mix(F.dark, F.base, 0.35)]]); g.fillRect(0, 0, VW, VH);
    tk.stars(g, 0, 0, VW, VH * 0.85, 0, { n: 46, seed: sp.seed % 997, color: F.hot });
    const mx = VW * (v('mx') < 0.5 ? 0.18 + 0.2 * v('mx2') : 0.62 + 0.2 * v('mx2')), my = 22 + 12 * v('my'), mr = 13 + 6 * v('mr');
    tk.glow(g, mx, my, mr * 3, '#fff0c0', 0.5);
    g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fillStyle = '#fff6d8'; g.fill();
    g.save(); g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.clip(); g.fillStyle = tk.rgba('#e8c880', 0.6); [[-0.3, -0.2, 0.22], [0.35, 0.3, 0.17], [-0.15, 0.45, 0.12]].forEach((c) => { g.beginPath(); g.arc(mx + c[0] * mr, my + c[1] * mr, c[2] * mr, 0, TAU); g.fill(); }); g.restore();
    const ax = ctx.mx, ay = ctx.my;
    tk.glow(g, ax, ay, 72, F.glow, 0.45); tk.glow(g, ax, ay, 40, F.hot, 0.3);
    g.save(); g.setLineDash([2.4, 5]); g.lineCap = 'round'; g.beginPath(); g.arc(ax, ay, 40 + 6 * v('ar'), 0, TAU); g.lineWidth = 1.6; g.strokeStyle = tk.rgba(F.glow, 0.6); g.stroke(); g.restore();
    if (sp.pattern) patternOver(g, sp.pattern, VW, F.glow, 0.11);
    const rr = tk.rng('crowd', sp.id), heads = [];
    for (let x = -4; x < VW + 8; x += 7 + rr() * 5) heads.push([x, 108 + rr() * 5 - 3, 5.2 + rr() * 2.4]);
    g.fillStyle = tk.mix(F.dark, INK, 0.8); g.fillRect(0, 110, VW, VH);
    heads.forEach((h) => { g.beginPath(); g.arc(h[0], h[1] + 4, h[2], 0, TAU); g.fill(); });
    heads.forEach((h, i) => { if (i % 3 === 0) { g.beginPath(); g.arc(h[0] + 1, h[1] - h[2] - 1.5, 1.5, 0, TAU); g.fillStyle = tk.rgba(FLAGC[i % 5], 0.9); g.fill(); } });
  };
  // ring: a spotlight circle on a stage floor, with soft rings of light round the motif
  BG.ring = (g, sp, VW, ctx) => {
    const F = sp.G, v = sp.v, cx = ctx.mx, cy = ctx.my;
    g.fillStyle = tk.rad(g, cx, cy, 0, cx, cy, Math.hypot(VW, VH) * 0.62, [[0, tk.mix(F.light, F.glow, 0.3)], [0.35, F.light], [0.8, F.base], [1, F.dark]]); g.fillRect(0, 0, VW, VH);
    g.save(); g.strokeStyle = tk.rgba(F.dark, 0.18); g.lineWidth = 1; g.beginPath(); for (let y = 8 + (sp.seed % 5); y < VH; y += 10) { g.moveTo(0, y); g.lineTo(VW, y); } g.stroke(); g.restore();
    const R = 46 + 4 * v('rr');
    g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fillStyle = tk.rad(g, cx, cy, 0, cx, cy, R, [[0, tk.rgba('#fff4cf', 0.4)], [0.8, tk.rgba('#fff4cf', 0.16)], [1, tk.rgba('#fff4cf', 0.34)]]); g.fill();
    g.lineWidth = 2.6; g.strokeStyle = tk.rgba(LIPC, 0.9); g.stroke();
    g.beginPath(); g.arc(cx, cy, R + 7, 0, TAU); g.lineWidth = 1.2; g.strokeStyle = tk.rgba(LIPC, 0.45); g.stroke();
    const n = 14, a0 = v('ro') * TAU; for (let i = 0; i < n; i++) { const a = a0 + i / n * TAU; g.beginPath(); g.arc(cx + cos(a) * (R + 14), cy + sin(a) * (R + 14), 1.5 + (i % 2), 0, TAU); g.fillStyle = tk.rgba(i % 2 ? '#ffffff' : GOLD, 0.7); g.fill(); }
    if (sp.pattern) patternOver(g, sp.pattern, VW, '#ffffff', 0.1);
    g.fillStyle = tk.rgba(INK, 0.3); g.beginPath(); g.moveTo(-2, VH + 2); for (let x = -2; x <= VW + 4; x += 4) g.lineTo(x, 110 + 3 * sin(x * 0.08 + sp.seed % 6)); g.lineTo(VW + 4, VH + 2); g.closePath(); g.fill();
  };

  // ---------------------------------------------------------------------------------------------------------------
  // the card spec: everything the composition decides, all seeded from the card id
  // ---------------------------------------------------------------------------------------------------------------
  const pick = (list, r) => list[floor(r * list.length) % list.length];
  const SEC = { rose: ['petals', 'star', 'crescent'], crimson: ['fire', 'slash', 'lantern'], amber: ['lantern', 'fire', 'sun'], gold: ['coin', 'star', 'sun'], jade: ['wind', 'thorns', 'petals'], teal: ['wave', 'koi', 'star'], azure: ['wave', 'ice', 'crane'], indigo: ['moon', 'star', 'sigil'], violet: ['sigil', 'spirit_orb', 'ink_splash'], ink: ['ink_splash', 'brush_stroke', 'skull'], moon: ['moon', 'star', 'crane'], ash: ['void', 'web', 'mask'] };
  const ATTACKISH = new Set(['slash', 'cross_slash', 'thrust', 'crescent', 'iai', 'sword_rain', 'fist', 'kick', 'thunder_fist', 'arrow', 'quake', 'meteor', 'lightning', 'chain_lightning']);
  // motifs that sit well on a pale, poster-like wash
  const POSTER = new Set(['calligraphy', 'scroll', 'dragon', 'tiger', 'crane', 'kick', 'key', 'book', 'quill', 'coin', 'koi', 'heal_light', 'mask', 'bell', 'lantern', 'fist', 'eye']);
  // motifs with a lot of cream or pale colour: they want a deep ground
  const PALE = new Set(['void', 'iai', 'spirit_orb', 'ice', 'barrier', 'moon', 'crescent', 'talisman', 'sword_rain', 'cross_slash', 'wind', 'sigil', 'mirror', 'lotus', 'star']);
  const GUARDISH = new Set(['shield', 'barrier', 'mirror', 'fan', 'torii']);
  const UPRIGHT = new Set(['torii', 'lantern', 'fox', 'tiger', 'mask', 'skull', 'eye', 'shield', 'bell', 'lotus', 'mirror', 'scroll', 'book', 'coin', 'moon', 'sun', 'sigil', 'wave', 'web', 'void', 'barrier']);
  const JUNK_PAL = { ink_splash: 'ink', web: 'ash', fire: 'crimson', void: 'ink', lightning: 'azure', petals: 'rose', mirror: 'violet', eye: 'violet', sigil: 'violet', poison_bloom: 'violet' };
  const HERO_PAL = { hanae: 'rose', kuro: 'violet', suzu: 'moon', raiga: 'amber' };
  const CURSE_FAM = { base: '#8a84a8', light: '#d8d2ee', dark: '#3d3856', glow: '#e6d9ff' };

  function specFor(id, def, up) {
    const v = (salt) => tk.vary(id, salt);
    const art = (def && def.art) || {};
    const type = def && def.type ? def.type : 'skill';
    const junk = type === 'curse' || type === 'status';
    const motif = M[art.m] && String(art.m).charAt(0) !== '_' ? art.m : 'ink_splash';
    let pname = art.c && tk.fams[art.c] ? art.c : (junk ? (type === 'curse' ? 'ink' : (JUNK_PAL[art.m] || 'ash')) : (HERO_PAL[def && def.hero] || 'ash'));      // hero tokens carry no art.c: wear their hero's colour
    const fam = junk && type === 'curse' ? CURSE_FAM : tk.fam(pname);
    const sp = { id, def, up: up ? 1 : 0, type, junk, rarity: def && def.rarity, motif, pname, fam, f: ext(fam), G: groundOf(fam, pname), v, seed: tk.seed(id, 'card') };
    sp.hero = !junk && art.hero && def && def.hero ? def.hero : null;
    sp.mirror = v('mir') < 0.5;
    sp.side = sp.mirror ? 1 : -1;                                                // which side the hero stands on (-1 left, 1 right)
    sp.pose = type === 'attack' || ATTACKISH.has(motif) ? 'attack' : GUARDISH.has(motif) ? 'block' : 'cast';
    // background kind, weighted by card type and palette
    const wts = type === 'attack' ? { burst: 3, split: 3, dusk: 2, night: 1, wash: 1.4, ring: 0.3 } : type === 'power' ? { night: 3, ring: 3, dusk: 1, wash: 0.8, burst: 0.3, split: 0.3 } : { dusk: 2.4, wash: 2.4, ring: 2, night: 1.5, split: 0.6, burst: 0.5 };
    const pm = { ink: { night: 2.2, wash: 1.5 }, ash: { night: 1.6, wash: 1.4 }, moon: { night: 2.5 }, gold: { ring: 1.6 }, indigo: { night: 1.8 }, violet: { night: 1.4 }, rose: { wash: 1.4, dusk: 1.2 }, jade: { dusk: 1.3 }, crimson: { burst: 1.5 } }[pname] || {};
    if (POSTER.has(motif)) { wts.wash *= 3.2; wts.dusk *= 1.5; wts.night *= 0.45; wts.burst *= 0.6; }
    else if (PALE.has(motif)) { wts.wash *= 0.12; wts.night *= 1.6; wts.ring *= 0.9; }
    if (sp.G.pale) wts.wash *= 0.3;
    let tot = 0; const keys = Object.keys(wts); keys.forEach((k) => { wts[k] *= (pm[k] || 1); tot += wts[k]; });
    let r = v('bg') * tot; sp.bg = keys[keys.length - 1]; for (const k of keys) { r -= wts[k]; if (r < 0) { sp.bg = k; break; } }
    sp.fg = v('fgon') < 0.62 ? pick(FG_BY_PAL[pname] || FG_BY_PAL.ash, v('fgk')) : 'none';
    sp.swash = v('swon') < 0.6;
    sp.pattern = v('pt') < 0.5 ? null : ['dots', 'checker', 'stars'][floor(v('pk') * 3) % 3];
    if (motif === 'wave' || motif === 'ink_wave' || motif === 'koi') sp.pattern = v('pt') < 0.75 ? 'dots' : sp.pattern;
    sp.scenery = ['none', 'bunting', 'gulls', 'lights', 'arch', 'none'][floor(v('sc') * 6) % 6];
    sp.scale = 0.9 + 0.16 * v('scale');
    sp.ox = (v('ox') - 0.5) * 12; sp.oy = (v('oy') - 0.5) * 8;
    sp.rot = UPRIGHT.has(motif) ? (v('rot') - 0.5) * 0.14 : (v('rot') - 0.5) * 0.7;
    sp.flip = v('flip') < 0.5;
    const pool = (SEC[pname] || SEC.ash).filter((m) => m !== motif);
    sp.sec = pool[floor(v('sec') * pool.length) % pool.length];
    sp.secOn = v('so') < 0.75;
    sp.nSpark = 6 + floor(v('ns') * 4) + (sp.rarity === 'rare' ? 4 : 0) + (up ? 5 : 0);
    return sp;
  }

  // where everything sits in the virtual window
  function layoutFor(sp, VW) {
    const L = { VW };
    if (sp.hero) {
      L.hs = 0.45 + 0.11 * sp.v('hs');
      L.hx = VW / 2 + sp.side * VW * (0.27 + 0.03 * sp.v('hx'));
      L.hy = 38 + 6 * sp.v('hy') + 186 * L.hs;
      L.hflip = sp.side > 0;
      L.mx = VW / 2 - sp.side * VW * 0.2 + sp.ox * 0.4;
    } else L.mx = VW / 2 + sp.ox;
    L.my = VH / 2 + 1 + sp.oy;
    L.msize = VH * (sp.hero ? 0.86 : 1.04) * sp.scale;
    return L;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // the layers
  // ---------------------------------------------------------------------------------------------------------------
  function paintBack(g, sp, VW, L) {
    (BG[sp.bg] || BG.dusk)(g, sp, VW, { mx: L.mx, my: L.my });
    if (sp.scenery !== 'none' && sp.bg !== 'burst' && sp.bg !== 'ring') sceneryOver(g, sp, VW, sp.G, sp.v, undefined);
    if (sp.swash) streamer(g, sp, VW, sp.bg === 'wash');
    // a soft dark spot behind the motif keeps light shapes readable on any ground (a soft tint on the pale wash), then action lines for attacks
    g.save(); g.fillStyle = tk.rad(g, L.mx, L.my, 8, L.mx, L.my, 62, [[0, tk.rgba(sp.bg === 'wash' ? sp.G.base : sp.G.dark, sp.bg === 'wash' ? 0.3 : 0.3)], [1, tk.rgba(sp.G.dark, 0)]]); g.fillRect(0, 0, VW, VH); g.restore();
    if (sp.hero) { const hx = sp.side < 0 ? 0 : VW; g.save(); g.fillStyle = grad(g, hx, 0, hx - sp.side * VW * 0.62, 0, [[0, tk.rgba(sp.G.dark, 0.42)], [1, tk.rgba(sp.G.dark, 0)]]); g.fillRect(0, 0, VW, VH); g.restore(); }
    if (sp.type === 'attack' && sp.bg !== 'burst') tk.speedLines(g, L.mx, L.my, { n: 26, seed: sp.seed % 777, r0: 40, r1: 110, w: 2.6, alpha: 0.2, color: '#ffffff' });
    // a small secondary motif in the corner opposite the hero, as a tone-on-tone silhouette stamp so it reads as texture, never as clutter
    if (sp.secOn && !sp.junk) {
      const sx = sp.hero ? (sp.side < 0 ? VW - 22 : 22) : (sp.mirror ? 24 : VW - 24), sy = sp.v('sy') < 0.5 ? 25 : VH - 27, dark = sp.bg === 'wash' || (sp.bg === 'dusk' && sy < 40);
      const tilt = floor(sp.v('sr') * 3), silKey = ['sec', sp.id, Math.round(L.pxk * 10)].join('|');
      const sil = ART.sprite(silKey, 44, 44, (sg) => {
        drawMotif(sg, sp.sec, 22, 22, 36, sp.pname, undefined, { detail: 1, pxk: L.pxk, rot: (tilt - 1) * 0.3, seed: 7 });
        sg.globalCompositeOperation = 'source-in'; sg.fillStyle = dark ? LN : sp.G.hot; sg.fillRect(0, 0, 44, 44);
      });
      g.save(); g.translate(sx, sy);
      g.globalAlpha *= dark ? 0.2 : 0.3;
      if (sp.v('rg') < 0.6) { g.beginPath(); g.arc(0, 0, 21, 0, TAU); g.lineWidth = 1.3; g.strokeStyle = dark ? LN : sp.G.hot; g.stroke(); g.beginPath(); g.arc(0, 0, 18.4, 0, TAU); g.lineWidth = 0.7; g.stroke(); }
      g.drawImage(sil, -22, -22, 44, 44);
      g.restore();
      ART.sprite.drop(silKey);                                  // an intermediate: the card sprite keeps the result
    }
  }

  // foreground framing in the corners, in front of the motif for depth: blossom sprigs (kind 'leaves'), drifting petals, bokeh discs, falling
  // notes ('drips') and warm sparkles ('embers')
  const FG_BY_PAL = { jade: ['leaves', 'leaves', 'bokeh'], teal: ['leaves', 'bokeh', 'drips'], amber: ['leaves', 'embers', 'bokeh'], gold: ['leaves', 'bokeh', 'embers'], rose: ['petals', 'petals', 'leaves', 'bokeh'], crimson: ['embers', 'petals', 'bokeh'], azure: ['bokeh', 'leaves', 'drips'], indigo: ['drips', 'bokeh', 'embers'], violet: ['drips', 'bokeh', 'embers'], ink: ['drips', 'embers', 'leaves'], moon: ['bokeh', 'embers', 'leaves'], ash: ['drips', 'leaves', 'bokeh'] };
  // a cherry blossom for the foreground: five round petals round a gold eye, one brown outline round the whole flower
  function fgBlossom(g, x, y, r, rot, col) {
    const pts = []; for (let i = 0; i < 5; i++) { const a = rot + i * TAU / 5; pts.push([x + cos(a) * r * 0.55, y + sin(a) * r * 0.55]); }
    g.save(); g.fillStyle = LN; pts.forEach((p) => { g.beginPath(); g.arc(p[0], p[1], r * 0.52 + 1.3, 0, TAU); g.fill(); });
    g.fillStyle = col; pts.forEach((p) => { g.beginPath(); g.arc(p[0], p[1], r * 0.52, 0, TAU); g.fill(); });
    g.fillStyle = tk.rgba('#ffffff', 0.5); pts.forEach((p) => { g.beginPath(); g.arc(p[0] + r * 0.12, p[1] - r * 0.14, r * 0.17, 0, TAU); g.fill(); });
    g.beginPath(); g.arc(x, y, r * 0.2, 0, TAU); g.fillStyle = GOLD2; g.fill(); g.lineWidth = 1; g.strokeStyle = LN; g.stroke();
    g.restore();
  }
  function paintFG(g, sp, VW, L, t) {
    const kind = sp.fg;
    if (!kind || kind === 'none') return;
    const G = sp.G, rr = tk.rng('fg', sp.id), sway = t !== undefined ? sin(t * 1.3) : 0, corner = sp.hero ? (sp.side < 0 ? 1 : -1) : (sp.v('fc') < 0.5 ? -1 : 1);     // -1 = left corner, 1 = right; on hero cards the far side, away from the face
    const x0 = corner < 0 ? 0 : VW, y0 = sp.v('fy') < 0.55 ? VH : 0, dy = y0 ? -1 : 1;
    if (kind === 'leaves') {
      // a blossom sprig reaching in from the corner: a brown twig, green leaves, three blossoms that sway
      const inward = -corner, bx = (i) => x0 + inward * i, th = (u) => [bx(u * 46), y0 + dy * (4 + 26 * Math.sin(u * 1.9) + sway * u * 2)];
      const twig = []; for (let i = 0; i <= 8; i++) twig.push(th(i / 8));
      tk.inkPath(g, twig, { w: 3.4, color: LN, taper: 0.5, wobble: 0.03, seed: sp.seed % 9 });
      for (let i = 0; i < 4; i++) { const p = th(0.2 + i * 0.22), a = (inward > 0 ? 0 : PI) + dy * (-0.9 - 0.2 * i) + sway * 0.06; g.save(); g.translate(p[0], p[1]); g.rotate(a); tk.celFill(g, leafPts(14 + rr() * 5, 7), '#5fcf6a', { line: 1.3, lineColor: LN, shadow: '#3aa04a', hi: false, depth: 2 }); g.restore(); }
      [[0.34, 8.4], [0.62, 7], [0.9, 8.6]].forEach((q, i) => { const p = th(q[0]); fgBlossom(g, p[0] + sway * (i + 1) * 0.8, p[1] - dy * 5, q[1], rr() * TAU, i % 2 ? PINK2 : PINK); });
    } else if (kind === 'petals') {
      for (let i = 0; i < 7; i++) tk.petal(g, x0 - corner * (8 + rr() * 46) + sway * 2, y0 + dy * (8 + rr() * 40) + sway, 6 + rr() * 5, rr() * TAU + sway * 0.3 * (i % 2 ? 1 : -1), 0.95, i % 2 ? PINK : PINK2);
    } else if (kind === 'bokeh') {
      for (let i = 0; i < 8; i++) { const x = x0 - corner * (rr() * 60), y = y0 + dy * (rr() * 46), r = 3 + rr() * 8 + 1.2 * sway * (i % 2 ? 1 : -1); g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = tk.rad(g, x, y, 0, x, y, r, [[0, tk.rgba(G.hot, 0.34)], [0.8, tk.rgba(G.glow, 0.24)], [1, tk.rgba(G.glow, 0)]]); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); g.beginPath(); g.arc(x, y, r * 0.86, 0, TAU); g.lineWidth = 0.6; g.strokeStyle = tk.rgba('#ffffff', 0.4); g.stroke(); }
    } else if (kind === 'drips') {
      // falling notes (the key stays 'drips'): 3 to 5 note glyphs drifting down from the top edge, a brown under-note for contrast on pale grounds
      const nn = 3 + floor(rr() * 3);
      for (let i = 0; i < nn; i++) {
        const x = 8 + rr() * (VW - 16), y0n = 4 + rr() * 30, sz = 7 + rr() * 4, kd = ['eighth', 'quarter', 'beamed', 'eighth', 'quarter'][i % 5], rot = (rr() - 0.5) * 0.7, spd = 5 + rr() * 5;
        const y = t !== undefined ? ((y0n + t * spd) % (VH * 0.7)) : y0n, sw = t !== undefined ? sin(t * 1.1 + i) * 2 : 0;
        tk.note(g, x + sw + 1, y + 1, sz, { kind: kd, color: LN, alpha: 0.55, rot, line: max(1.2, sz * 0.14) });
        tk.note(g, x + sw, y, sz, { kind: kd, color: [CREAM, GOLD, sp.f.bodyL][i % 3], alpha: 0.95, rot, line: max(1.2, sz * 0.14) });
      }
    } else if (kind === 'embers') {
      // warm sparkles drifting up
      for (let i = 0; i < 9; i++) { const x = rr() * VW, y0e = VH - rr() * VH * 0.7, y = t !== undefined ? ((y0e - t * (6 + rr() * 8)) % VH + VH) % VH : y0e, sz = 1.4 + rr() * 2.2; tk.sparkle(g, x + sway * 2, y, sz, { color: i % 3 ? GOLD2 : '#ffffff', alpha: 0.9, glow: 0, rot: rr() }); }
    }
  }

  // the hero, cut into the scene as a die-cut sticker (HV_ART_AUDIO 2.9): always in stage clothes, a soft halo in the hero's own colour behind,
  // a dark drop shadow, a cream sticker edge (the silhouette blitted at eight offsets), then the figure, faded into the ground at the bottom.
  // It bakes at the card's own pixel size (the key says which) so the figure stays crisp on a big card.
  const HERO_FALLBACK = { hanae: '#ff7eb6', kuro: '#3fcf6a', suzu: '#a77bff', raiga: '#ff9a2e' };
  const heroColour = (id) => { const h = DATA.heroes && DATA.heroes[id]; return h && typeof h.color === 'string' && h.color.charAt(0) === '#' && h.color.length === 7 ? h.color : (HERO_FALLBACK[id] || '#ff7eb6'); };
  function heroSprite(sp, VW, L, pxk, live) {
    const key = ['cardhero', sp.id, sp.hero, sp.pose, L.hs.toFixed(2), Math.round(VW), Math.round(pxk * 10)].join('|');
    const W = VW * pxk, HH = VH * pxk;
    return ART.sprite(key, W, HH, (g) => {
      g.scale(pxk, pxk);
      const hc = heroColour(sp.hero);
      const opts = { x: L.hx, y: L.hy, s: L.hs, pose: sp.pose, t: 0.3, pt: ART.hero.keyPt ? ART.hero.keyPt(sp.pose) * (0.9 + 0.3 * sp.v('kp')) : 0.2, flip: L.hflip, shadow: false, skin: 'stage' };
      // silhouette pass: the hero in one flat cream, then the same shape in a dark shadow colour
      const sil = ART.sprite(key + '|sil', W, HH, (sg) => {
        sg.scale(pxk, pxk);
        ART.hero.draw(sg, sp.hero, opts);
        sg.globalCompositeOperation = 'source-in'; sg.fillStyle = '#fff8ec'; sg.fillRect(0, 0, VW, VH);
      });
      const shd = ART.sprite(key + '|shd', W, HH, (sg) => {
        sg.drawImage(sil, 0, 0, W, HH);
        sg.globalCompositeOperation = 'source-in'; sg.fillStyle = '#140a28'; sg.fillRect(0, 0, W, HH);
      });
      // the halo in the hero's colour, behind the chest
      const hx = L.hx + sp.side * -4, hy = L.hy - 186 * L.hs * 0.7, hr = 70 * L.hs + 18;
      tk.glow(g, hx, hy, hr * 1.35, hc, 0.4); tk.glow(g, hx, hy, hr, hc, 0.7); tk.glow(g, hx, hy, hr * 0.55, tk.mix(hc, '#ffffff', 0.55), 0.3);
      g.save(); g.globalAlpha *= 0.35; g.drawImage(shd, 2, 3, VW, VH); g.restore();
      const r = 2.4;
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.drawImage(sil, cos(a) * r, sin(a) * r, VW, VH); }
      ART.hero.draw(g, sp.hero, opts);
      ART.sprite.drop(key + '|sil'); ART.sprite.drop(key + '|shd');
      // fade the lower body into the ground and dim it a touch so the motif leads
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = grad(g, 0, VH * 0.5, 0, VH, [[0, tk.rgba(sp.f.dim, 0)], [1, tk.rgba(sp.f.dim, 0.45)]]); g.fillRect(0, 0, VW, VH);
      g.globalCompositeOperation = 'destination-out';
      g.fillStyle = grad(g, 0, VH * 0.74, 0, VH, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.85)']]); g.fillRect(0, 0, VW, VH);
      g.globalCompositeOperation = 'source-over';
    });
  }

  function paintMotif(g, sp, VW, L, t) {
    const bob = t !== undefined ? sin(t * 1.7) * 1.2 : 0;
    drawMotif(g, sp.motif, L.mx, L.my + bob, L.msize, sp.pname, t, { detail: 2, pxk: L.pxk, rot: sp.rot, flip: sp.flip && !NOFLIP.has(sp.motif), seed: sp.seed & 1023, fam: sp.fam });
  }
  // motifs with lettering or a handed design never mirror
  const NOFLIP = new Set(['calligraphy', 'talisman', 'scroll', 'book', 'quill', 'eye', 'mask', 'coin', 'torii', 'sigil', 'mirror', 'lantern', 'bell', 'sun', 'ink_splash', 'ink_wave', 'brush_stroke', 'ice', 'quake', 'key', 'kick', 'crane', 'fox', 'skull']);

  function paintFront(g, sp, VW, L, t) {
    const F = sp.f, rr = tk.rng('spk', sp.id), live = t !== undefined;
    // glitter: sparkles in cream and gold, kept away from the motif centre
    const nSp = sp.junk ? (sp.type === 'curse' ? 4 : 3) : sp.nSpark;
    for (let i = 0; i < nSp; i++) {
      const x = 4 + rr() * (VW - 8), y = 4 + rr() * (VH - 8), sz = 1.6 + rr() * 3.4, rot = rr() * 1.2, ph = rr() * TAU, gold = rr() < 0.6;
      if (Math.hypot(x - L.mx, y - L.my) < 26 && rr() < 0.7) continue;
      const tw = live ? 0.35 + 0.65 * (0.5 + 0.5 * sin(t * (1.6 + rr() * 2) + ph)) : 1;
      tk.sparkle(g, x, y, sz * (live ? 0.6 + 0.4 * tw : 1), { color: sp.type === 'curse' ? '#cfc4ee' : sp.type === 'status' ? '#ffffff' : (gold ? GOLD2 : '#ffffff'), alpha: (sp.junk ? 0.7 : gold ? 0.9 : 0.75) * tw, rot, glow: sz > 3 && !sp.junk ? 0.4 : 0 });
    }
    if (live) tk.kirakira(g, 0, 0, VW, VH, t, { n: 10, seed: sp.seed & 255, size: 2.2 });
    // upgraded: a warm golden aura hugging the edges, gold corner ticks and extra glints
    if (sp.up) {
      g.save(); g.globalCompositeOperation = 'lighter';
      const cx = VW / 2, cy = VH / 2, pulse = live ? 0.85 + 0.15 * sin(t * 2.2) : 1;
      const gr = tk.rad(g, cx, cy, VH * 0.34, cx, cy, Math.hypot(VW, VH) * 0.56, [[0, 'rgba(255,201,106,0)'], [1, tk.rgba(pal.gold, 0.5 * pulse)]]);
      g.fillStyle = gr; g.fillRect(0, 0, VW, VH); g.restore();
      [[0, 0, 1, 1], [VW, 0, -1, 1], [0, VH, 1, -1], [VW, VH, -1, -1]].forEach((c) => { tk.inkPath(g, { poly: [[c[0] + c[2] * 14, c[1] + c[3] * 2.4], [c[0] + c[2] * 2.4, c[1] + c[3] * 2.4], [c[0] + c[2] * 2.4, c[1] + c[3] * 14]] }, { w: 2, color: pal.gold, taper: 0.1, pressure: 'flat', wobble: 0, alpha: 0.95 }); });
    }
    // rare: a slow diagonal shimmer in the live state
    if (live && sp.rarity === 'rare') {
      const k = ((t * 0.35) % 1.6) - 0.3; g.save(); g.globalCompositeOperation = 'lighter'; g.translate(VW * k, 0); g.transform(1, 0, -0.4, 1, 0, 0);
      g.fillStyle = grad(g, -14, 0, 14, 0, [[0, 'rgba(255,233,168,0)'], [0.5, 'rgba(255,233,168,0.32)'], [1, 'rgba(255,233,168,0)']]); g.fillRect(-14, 0, 28, VH); g.restore();
    }
    tk.vignette(g, VW, VH, { color: '#2d170f', alpha: 0.3, inner: 0.6 });
    // a hairline of warm brown inside the window edge so the art sits in its frame
    g.save(); g.lineWidth = 2; g.strokeStyle = tk.rgba('#2d170f', 0.55); g.strokeRect(1, 1, VW - 2, VH - 2); g.restore();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // junk: curses (a grumpy grey-violet jinx under a pastel Gloss smear, a frowny sticker) and status cards (a card buffed too smooth by the Gloss)
  // ---------------------------------------------------------------------------------------------------------------
  const OPAL = ['#f4f1fb', '#e6d9ff', '#d9fff4', '#ffe3f1'];
  const opalGrad = (g, x0, y0, x1, y1, a) => grad(g, x0, y0, x1, y1, [[0, tk.rgba(OPAL[0], a)], [0.33, tk.rgba(OPAL[1], a)], [0.66, tk.rgba(OPAL[2], a)], [1, tk.rgba(OPAL[3], a)]]);
  // a soft airbrushed oval of the Gloss
  function glossBlob(g, x, y, rx, ry, a) {
    g.save(); g.translate(x, y); g.scale(1, ry / rx);
    g.fillStyle = tk.rad(g, 0, 0, 0, 0, 0, rx, [[0, tk.rgba('#ffffff', a)], [0.55, tk.rgba(OPAL[1], a * 0.8)], [0.85, tk.rgba(OPAL[2], a * 0.5)], [1, tk.rgba(OPAL[3], 0)]]);
    g.fillRect(-rx, -rx, rx * 2, rx * 2); g.restore();
  }
  // a frowny die-cut sticker: a cream rim and drop shadow, a lilac face, two dot eyes, cross brows and a frown
  function frownSticker(g, x, y, r, rot) {
    g.save(); g.translate(x, y); g.rotate(rot);
    g.beginPath(); g.arc(1.6, 2.4, r + 2.2, 0, TAU); g.fillStyle = 'rgba(20,10,40,0.3)'; g.fill();
    g.beginPath(); g.arc(0, 0, r + 2.2, 0, TAU); g.fillStyle = CREAM; g.fill(); g.lineWidth = 1.5; g.strokeStyle = LN; g.stroke();
    g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fillStyle = '#c9bfe6'; g.fill();
    g.fillStyle = LN; [-1, 1].forEach((s) => { g.beginPath(); g.arc(s * r * 0.36, -r * 0.1, r * 0.1, 0, TAU); g.fill(); });
    g.lineCap = 'round'; g.lineWidth = Math.max(1.2, r * 0.1); g.strokeStyle = LN;
    [-1, 1].forEach((s) => { g.beginPath(); g.moveTo(s * r * 0.58, -r * 0.46); g.lineTo(s * r * 0.16, -r * 0.3); g.stroke(); });
    g.beginPath(); g.arc(0, r * 0.62, r * 0.36, PI * 1.15, PI * 1.85); g.stroke();
    g.restore();
  }
  // the polite Gloss smile under a sparkle
  function smileSparkle(g, x, y, r, a) {
    tk.sparkle(g, x, y, r, { color: '#ffffff', alpha: a, glow: 0.6 });
    g.save(); g.globalAlpha *= a; g.lineCap = 'round'; g.lineWidth = Math.max(1.2, r * 0.18); g.strokeStyle = '#9a8fc0'; g.beginPath(); g.arc(x, y + r * 0.5, r * 0.62, PI * 0.18, PI * 0.82); g.stroke(); g.restore();
  }

  function paintJunk(g, sp, VW, L, t) {
    const f = sp.f, rr = tk.rng('junk', sp.id), v = sp.v, curse = sp.type === 'curse';
    if (curse) {
      g.fillStyle = grad(g, 0, 0, VW * 0.4, VH, [[0, '#8f8aa8'], [0.55, '#6c6788'], [1, '#443f60']]); g.fillRect(0, 0, VW, VH);
      tk.glow(g, L.mx, L.my, 64, '#e6d9ff', 0.22);
      // heavy, drooping lilac clouds along the top: a mood, not a mess
      g.fillStyle = tk.rgba('#2d2a48', 0.4); for (let i = 0; i < 5; i++) { const x = (i + 0.3 + 0.4 * rr()) * VW / 5, r = 16 + rr() * 12; g.beginPath(); g.arc(x, -6, r, 0, TAU); g.fill(); }
      g.fillStyle = tk.rgba('#2d2a48', 0.34); g.beginPath(); g.moveTo(-2, VH + 2); for (let x = -2; x <= VW + 4; x += 4) g.lineTo(x, 104 + 5 * sin(x * 0.07 + sp.seed % 7)); g.lineTo(VW + 4, VH + 2); g.closePath(); g.fill();
    } else {
      g.fillStyle = grad(g, 0, 0, VW, VH, [[0, '#d7cbf3'], [0.4, '#c3b2ee'], [0.72, '#b4e6d6'], [1, '#f4c0d8']]); g.fillRect(0, 0, VW, VH);
      glossBlob(g, VW * 0.3, VH * 0.35, 46, 34, 0.45); glossBlob(g, VW * 0.78, VH * 0.75, 40, 28, 0.4);
    }
    // the motif itself, drawn at a slight tilt
    g.save();
    if (!curse) g.globalAlpha *= 0.94;
    paintMotif(g, sp, VW, L, t);
    g.restore();
    if (curse) {
      g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgba(170,150,220,0.5)'; g.fillRect(0, 0, VW, VH); g.restore();
      // the colour drained to lilac grey
      g.save(); g.globalCompositeOperation = 'saturation'; g.globalAlpha *= 0.62; g.fillStyle = '#808080'; g.fillRect(0, 0, VW, VH); g.restore();
      // a pastel Gloss smear across it
      const sx = VW * (0.2 + 0.2 * v('sm')), ang = -0.35 + 0.2 * v('sa');
      g.save(); g.translate(sx, VH * (0.45 + 0.2 * v('sy'))); g.rotate(ang);
      g.fillStyle = opalGrad(g, -10, 0, VW * 0.9, 0, 0.5); g.beginPath(); g.moveTo(-14, -5); g.quadraticCurveTo(VW * 0.4, -16, VW * 0.9, -4); g.quadraticCurveTo(VW * 0.5, 14, -14, 7); g.closePath(); g.fill();
      g.strokeStyle = tk.rgba('#ffffff', 0.7); g.lineWidth = 1.3; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, -4); g.quadraticCurveTo(VW * 0.4, -12, VW * 0.8, -3); g.stroke();
      g.restore();
    }
    JUNK_EXTRA(g, sp, VW, L, rr);
    if (curse) {
      // a little frowny sticker in a corner
      const left = v('fs') < 0.5;
      frownSticker(g, left ? 17 : VW - 17, v('fy2') < 0.5 ? 17 : VH - 18, 10.5, (left ? -1 : 1) * (0.15 + 0.15 * v('fr')));
    } else {
      // pastel sheen bands, a polite smile sparkle and a little static of glitter
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let b = 0; b < 2; b++) {
        const bx = VW * (0.18 + 0.5 * b + 0.12 * v('b' + b)), bw = 12 + 8 * v('w' + b);
        g.save(); g.translate(bx, 0); g.transform(1, 0, -0.45, 1, 0, 0); g.fillStyle = grad(g, -bw, 0, bw, 0, [[0, 'rgba(255,255,255,0)'], [0.5, 'rgba(255,255,255,0.24)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(-bw, -4, bw * 2, VH + 8); g.restore();
      }
      g.restore();
      smileSparkle(g, v('ss') < 0.5 ? VW * 0.2 : VW * 0.8, v('sy2') < 0.5 ? 20 : VH - 22, 8, t !== undefined ? 0.75 + 0.25 * sin(t * 2.2) : 1);
      for (let i = 0; i < 26; i++) { const c = OPAL[i % 4], x = rr() * VW, y = rr() * VH, s = 0.8 + rr() * 1.6; g.fillStyle = tk.rgba(i % 3 ? '#ffffff' : '#b9a8e8', 0.8); g.fillRect(x, y, s, s); }
    }
  }
  // per-card scars: what makes this particular junk card look like itself
  function JUNK_EXTRA(g, sp, VW, L, rr) {
    const id = sp.id;
    if (id === 'status_redacted') {
      // airbrushed pastel blocks smoothing over parts of the picture, each with the polite smile
      [[10, 20, 96, 14], [30, 48, 120, 14], [16, 74, 80, 14]].forEach((b, i) => { const w = b[2] * VW / 170; glossBlob(g, b[0] + w / 2, b[1] + b[3] / 2, w * 0.62, b[3] * 1.3, 0.92); g.fillStyle = tk.rgba(OPAL[(i + 1) % 4], 0.9); g.beginPath(); g.moveTo(b[0] + 3, b[1]); g.lineTo(b[0] + w - 3, b[1]); g.quadraticCurveTo(b[0] + w, b[1] + b[3] / 2, b[0] + w - 3, b[1] + b[3]); g.lineTo(b[0] + 3, b[1] + b[3]); g.quadraticCurveTo(b[0], b[1] + b[3] / 2, b[0] + 3, b[1]); g.fill(); g.save(); g.lineCap = 'round'; g.lineWidth = 1.4; g.strokeStyle = '#9a8fc0'; g.beginPath(); g.arc(b[0] + w * 0.5, b[1] + b[3] * 0.25, 4, PI * 0.2, PI * 0.8); g.stroke(); g.restore(); });
    } else if (id === 'status_static') {
      for (let i = 0; i < 9; i++) { const y = rr() * VH; g.fillStyle = tk.rgba(i % 2 ? '#a9ecff' : '#ffb3d4', 0.6); g.fillRect(rr() * VW * 0.3, y, VW * (0.3 + rr() * 0.5), 1.4 + rr() * 2.4); }
    } else if (id === 'status_tangle') {
      for (let i = 0; i < 9; i++) { const pts = []; const x0 = rr() * VW, y0 = rr() * VH; for (let k = 0; k < 5; k++) pts.push([x0 + k * 22 - 20 + (rr() - 0.5) * 24, y0 + (rr() - 0.5) * 60]); tk.inkPath(g, pts, { w: 2.6, color: '#b9a8e8', alpha: 0.45, taper: 0.2, wobble: 0.06 }); tk.inkPath(g, pts, { w: 1.3, color: '#ffffff', alpha: 0.9, taper: 0.2, wobble: 0.06 }); }
    } else if (id === 'status_scorch') {
      // overheated: warm airbrushed blushes where the Gloss got too hot
      for (let i = 0; i < 6; i++) { const x = rr() * VW, y = rr() * VH, r = 8 + rr() * 11; g.fillStyle = tk.rad(g, x, y, 0, x, y, r, [[0, 'rgba(255,170,130,0.6)'], [1, 'rgba(255,170,130,0)']]); g.fillRect(x - r, y - r, r * 2, r * 2); tk.glow(g, x, y, 10, '#ffd0a0', 0.5); }
    } else if (id === 'status_wilt') {
      for (let i = 0; i < 7; i++) tk.petal(g, 8 + rr() * (VW - 16), 8 + rr() * (VH - 16), 4 + rr() * 3, rr() * TAU, 0.9, '#e6d0c0');
    } else if (id === 'status_blot') {
      // opal bubbles of the Gloss
      for (let i = 0; i < 6; i++) { const x = rr() * VW, y = rr() * VH, r = 5 + rr() * 8; glossBlob(g, x, y, r * 1.5, r * 1.5, 0.9); g.beginPath(); g.arc(x, y, r, 0, TAU); g.lineWidth = 1.2; g.strokeStyle = tk.rgba('#b9a8e8', 0.8); g.stroke(); g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.22, 0, TAU); g.fillStyle = '#ffffff'; g.fill(); }
    } else if (sp.type === 'curse') {
      for (let i = 0; i < 5; i++) tk.sparkle(g, rr() * VW, rr() * VH, 2 + rr() * 3, { color: '#cfc4ee', alpha: 0.7, glow: 0 });
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // assembling a card
  // ---------------------------------------------------------------------------------------------------------------
  function paintStatic(g, sp, VW, pxk) {
    const L = layoutFor(sp, VW); L.pxk = pxk;
    g.save(); g.beginPath(); g.rect(0, 0, VW, VH); g.clip();
    if (sp.junk) paintJunk(g, sp, VW, L, undefined);
    else {
      paintBack(g, sp, VW, L);
      if (sp.hero) { const hs = heroSprite(sp, VW, L, pxk); ART.blit(g, hs, 0, 0, VW, VH); }
      paintMotif(g, sp, VW, L, undefined);
      paintFG(g, sp, VW, L, undefined);
    }
    paintFront(g, sp, VW, L, undefined);
    g.restore();
  }
  const cardKey = (sp, w, h) => ['card', sp.id, sp.up, Math.round(w), Math.round(h), tk.lowQ() ? 'L' : 'H'].join('|');

  function cardRef(cardOrId) {
    let id = '?', up = 0;
    if (typeof cardOrId === 'string') id = cardOrId;
    else if (cardOrId && typeof cardOrId === 'object') { id = String(cardOrId.id || (cardOrId.def && cardOrId.def.id) || '?'); up = cardOrId.up ? 1 : 0; }
    return { id, up, def: (DATA.cards && DATA.cards[id]) || null };
  }
  const specCache = new Map();
  function specOf(ref) {
    const k = ref.id + '|' + ref.up;
    let sp = specCache.get(k);
    if (!sp || sp.def !== ref.def) { sp = specFor(ref.id, ref.def, ref.up); if (specCache.size > 600) specCache.clear(); specCache.set(k, sp); }
    return sp;
  }

  // ART.card.draw(ctx, cardOrId, w, h, t?): paints the illustration window at (0, 0). Without t it is one cached blit; with t (seconds,
  // the hover state) the background and hero stay cached and the motif, sparkles and shimmer move.
  function drawCard(ctx, cardOrId, w, h, t) {
    w = w > 0 && isFinite(w) ? w : 170; h = h > 0 && isFinite(h) ? h : 116;
    w = clamp(w, 4, 2400); h = clamp(h, 4, 2400);
    const sp = specOf(cardRef(cardOrId)), pxk = h / VH, VW = clamp(w, h * 0.5, h * 3.5) / pxk;     // absurd aspect ratios are composed sanely and stretched
    const live = typeof t === 'number' && isFinite(t) && !(tk.opt && tk.opt.reduceMotion);
    if (!live) {
      const spr = ART.sprite(cardKey(sp, w, h), w, h, (g) => { g.scale(w / (VW * pxk), 1); g.scale(pxk, pxk); paintStatic(g, sp, VW, pxk); });
      ART.blit(ctx, spr, 0, 0, w, h);
      return;
    }
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip(); ctx.scale(w / VW / pxk, 1); ctx.scale(pxk, pxk);
    const L = layoutFor(sp, VW); L.pxk = pxk;
    if (sp.junk) {
      const spr = ART.sprite(cardKey(sp, w, h) + '|junk', w, h, (g) => { g.scale(w / (VW * pxk), 1); g.scale(pxk, pxk); paintJunk(g, sp, VW, L, undefined); });
      ART.blit(ctx, spr, 0, 0, VW, VH);
      paintFront(ctx, sp, VW, L, t);
    } else {
      const back = ART.sprite(cardKey(sp, w, h) + '|back', w, h, (g) => { g.scale(w / (VW * pxk), 1); g.scale(pxk, pxk); paintBack(g, sp, VW, L); });
      ART.blit(ctx, back, 0, 0, VW, VH);
      if (sp.hero) ART.blit(ctx, heroSprite(sp, VW, L, pxk), 0, sin(t * 1.3) * 0.8, VW, VH);
      paintMotif(ctx, sp, VW, L, t);
      paintFG(ctx, sp, VW, L, t);
      paintFront(ctx, sp, VW, L, t);
    }
    ctx.restore();
  }
  ART.card.draw = drawCard;
  // a full deck view bakes a sprite per card on top of the hero part sprites: give the LRU room (the 48e6 pixel cap still bounds memory)
  if (ART.sprite && ART.sprite.maxCount < 640) ART.sprite.maxCount = 640;
  ART.card.motif = (ctx, motifId, x, y, size, palette, t) => drawMotif(ctx, motifId, x, y, size, palette, t);
  ART.card.warm = (ids, w, h, budgetMs) => {
    const t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : 0; let n = 0;
    for (const id of ids || []) {
      if (budgetMs && typeof performance !== 'undefined' && performance.now() - t0 > budgetMs) break;
      const sp = specOf(cardRef(id)), pxk = (h || 116) / VH, VW = (w || 170) / pxk;
      ART.sprite(cardKey(sp, w || 170, h || 116), w || 170, h || 116, (g) => { g.scale(pxk, pxk); paintStatic(g, sp, VW, pxk); }); n++;
    }
    return n;
  };
  ART.card.motifIds = () => Object.keys(M).filter((k) => k.charAt(0) !== '_');
  ART.card._M = M; ART.card._motif = drawMotif; ART.card._spec = (id, up) => specOf(cardRef({ id, up }));
  ART.declare('motif', ART.card.motifIds());
  ART.declare('card', Object.keys(DATA.cards || {}));

  // ---------------------------------------------------------------------------------------------------------------
  // gallery sheets
  // ---------------------------------------------------------------------------------------------------------------
  const MOTIF_PAL = { slash: 'rose', cross_slash: 'crimson', thrust: 'amber', crescent: 'moon', iai: 'ink', petals: 'rose', bloom: 'rose', petal_storm: 'rose', wind: 'jade', shield: 'azure', barrier: 'indigo', talisman: 'moon', lotus: 'jade', moon: 'moon', sun: 'crimson', star: 'gold', lightning: 'gold', thunder_fist: 'amber', chain_lightning: 'azure', fire: 'crimson', flame_orb: 'amber', ice: 'azure', ink_splash: 'violet', ink_wave: 'indigo', brush_stroke: 'ink', calligraphy: 'gold', scroll: 'amber', eye: 'violet', mask: 'ink', fan: 'rose', bell: 'gold', lantern: 'amber', koi: 'teal', dragon: 'jade', tiger: 'amber', crane: 'azure', fox: 'crimson', web: 'ash', thorns: 'jade', poison_bloom: 'violet', skull: 'ash', heal_light: 'jade', spirit_orb: 'moon', torii: 'crimson', mirror: 'gold', sword_rain: 'azure', meteor: 'crimson', wave: 'teal', tornado: 'jade', quake: 'amber', fist: 'crimson', kick: 'amber', arrow: 'crimson', coin: 'gold', key: 'jade', book: 'teal', quill: 'moon', void: 'ink', sigil: 'violet' };
  ART.sheet('motifs', (canvas, params) => {
    if (params.hero) {
      // ?hero=1: the cards that draw their hero as a sticker, as full card illustrations (HV_ART_AUDIO 2.9 acceptance)
      const all = Object.values(DATA.cards).filter((c) => c.art && c.art.hero && c.hero && DATA.LISTS.heroIds.indexOf(c.hero) >= 0);
      const only = params.hero === '1' || params.hero === 1 || params.hero === true ? null : String(params.hero).split(',');
      const list = only ? all.filter((c) => only.indexOf(c.hero) >= 0) : all, tt = params.anim ? num(params.t, 0) : undefined;
      const cells = list.map((c) => ({ c, label: c.name + '  (' + c.hero + ', ' + ART.card._spec(c.id, 0).pose + ')' }));
      ART.sheetGrid(canvas, params, cells, (g, cell, w, h) => { ART.card.draw(g, cell.c.id, w, h, tt); },
        { title: 'motifs with the hero: ' + list.length + ' cards in stage clothes (?hero=1, or hero=hanae,kuro)', gap: 8, labelH: 18, aspect: 170 / 116, cols: params.cols ? +params.cols : 6, cellBg: false });
      return;
    }
    const ids = params.ids ? String(params.ids).split(',') : DATA.LISTS.motifs;
    const t = params.anim ? num(params.t, 0) : undefined;
    const cells = ids.map((id) => ({ id, label: id }));
    ART.sheetGrid(canvas, params, cells, (g, cell, w, h, i) => {
      const pn = params.pal || MOTIF_PAL[cell.id] || 'ash', fam = ext(famOf(pn));
      g.fillStyle = grad(g, 0, 0, 0, h, [[0, fam.light], [1, fam.dark]]); g.fillRect(0, 0, w, h);
      const sz = params.size ? +params.size : Math.min(w, h) * (params.small ? 0.7 : 0.94);
      drawMotif(g, cell.id, w / 2, h / 2, sz, pn, t, params.variants ? { variant: i % +params.variants, seed: 0 } : { seed: params.seed === undefined ? 0 : +params.seed + i });
      if (!params.nosmall) { g.fillStyle = 'rgba(13,11,30,0.55)'; g.fillRect(w - 66, h - 30, 66, 30); drawMotif(g, cell.id, w - 50, h - 15, 24, pn, t, {}); drawMotif(g, cell.id, w - 18, h - 15, 22, pn, t, {}); }
    }, { title: 'ART.card.motif: all ' + ids.length + ' motifs (big, then 24 px and 22 px icons)', gap: 6, labelH: 16 });
  });
  function cardSheet(name, filter, title) {
    ART.sheet(name, (canvas, params) => {
      const all = Object.values(DATA.cards).filter(filter);
      const per = params.per ? max(1, +params.per) : 12, lastPage = max(0, Math.ceil(all.length / per) - 1), page = clamp(floor(num(params.page, 0)), 0, lastPage);
      const list = all.slice(page * per, page * per + per);
      const t = params.anim ? num(params.t, 0) : undefined, up = params.up ? 1 : 0;
      const cells = list.map((c) => ({ c, label: c.name + (up ? '+' : '') + '  [' + (c.cost === undefined ? '-' : c.cost) + ']  ' + c.type + ' ' + String(c.rarity).charAt(0) }));
      ART.sheetGrid(canvas, params, cells, (g, cell, w, h) => {
        const cw = params.cw ? +params.cw : w, ch = params.cw ? cw * 116 / 170 : h;          // ?cw=120 draws at an exact window width
        ART.card.draw(g, up ? { id: cell.c.id, up: 1 } : cell.c.id, cw, ch, t);
      }, { title: title + ': page ' + page + ' of ' + (lastPage + 1) + ' (' + all.length + ' cards, ?page=N&per=' + per + ')', gap: 8, labelH: 18, aspect: 170 / 116, cols: params.cols ? +params.cols : 4, cellBg: false });
    });
  }
  DATA.LISTS.heroIds.forEach((hid) => cardSheet('cards_' + hid, (c) => c.hero === hid, hid));
  cardSheet('cards_junk', (c) => c.hero === 'curse' || c.hero === 'status', 'curses and status cards');
})();
