// Echowake -- ART.card: the card illustrator. Paints the illustration window of every card and the 59 motifs. Extends ART (art.js); these
// members REPLACE the placeholders of art.js by plain assignment.
//
// PUBLIC API (DESIGN 5.6, ART_BIBLE 4)
//   ART.card.draw(ctx, cardIdOrInst, w, h, t?)
//        Paints the card's illustration window at (0, 0) of the current transform, w x h (about 170 x 116 at hand size; any size, any aspect
//        ratio: the scene is composed in a virtual window 116 high and as wide as the ratio says, so a wide window shows more scene and a
//        card looks the same at every size). cardIdOrInst is a DATA.cards id or a deck instance / DATA.resolveCard result ({id, up}); an
//        unknown id or hostile argument draws a fallback (a plain inked card ground), never throws.
//        WITHOUT t it is one cached blit (ART.sprite, one sprite per id + upgrade + size + quality). WITH t (absolute seconds, the hover state)
//        the background and the hero silhouette stay cached and the motif breathes and animates, sparkles twinkle, gold-leaf drifts, foreground
//        leaves sway and a rare card gets a slow gold shimmer. ART.tk.opt.reduceMotion turns the live draw into the still one.
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
//   Gallery sheets: motifs (all 59; params ids=a,b size=N pal=name variants=3 seed=N anim=1 t=s nosmall=1), cards_hanae cards_kuro cards_suzu
//   cards_raiga (every card of the hero with its name and cost, 12 per page: ?page=N per=N cols=N up=1 anim=1 t=s cw=120 for an exact window
//   width) and cards_junk (curses and status cards).
//
// HOW A CARD IS COMPOSED (everything is seeded from the card id, so the set is stable and no two cards match)
//   1. A ground, one of six layouts weighted by card type, palette and motif: dusk (sky, sun or moon, three ink-wash ridges, mist, god rays),
//      wash (a pale tint with an enso ring), burst (manga focus rays), split (a hard diagonal panel cut with screen-tone), night (stars, a huge aura),
//      ring (a shrine mandala). Pale palette families (moon, gold) are pulled into a deep ground so the light motifs read. Optional seigaiha, asanoha or
//      shippo pattern, scenery (bamboo, birds, a pine bough, a far torii), a sumi swash, a soft dark spot behind the motif, screen-tone gathered in a corner.
//   2. A tone-on-tone silhouette stamp of a secondary motif from the palette's family, in the corner away from the hero.
//   3. When art.hero is true the owning hero's action silhouette (ART.hero.draw, pose attack, block or cast at its key moment) cut into the scene: a
//      palette-coloured rim halo behind, a fade into the ground at the bottom, on the side away from the motif.
//   4. The motif, big, rotated, scaled and mirrored per card, with its own per-card variant (S.variant) where a motif has several designs.
//   5. Foreground framing (dark leaves, drifting petals, bokeh discs, falling notes or embers) in a corner, gold-leaf sparkle, washi grain, a vignette.
//   Curses are torn, blotched and black-violet; a grey hush pass drains them; status cards are worn cards (stains, folds, burnt corners, a punched hole, two bands of grey ash) with a scar per card.
//
// THE MOTIFS. Each is fn(S) drawing in a 100 x 100 design space centred on (0, 0), y down, light from the upper right. S (makeS) carries the palette
// (S.f: base light dark glow plus derived shade pale hot mid dim), the detail level S.d (0 icon, 1 small, 2 card), seeded rng S.rng(salt), S.variant(n),
// S.pulse and S.wave (0 when still), and thin wrappers over the toolkit (S.cel, S.ink, S.line, S.fill, S.glow, S.spark, S.circle, S.ring, S.dash, S.at).
// Outlines never fall under a readable pixel width. Determinism: no clock, no banned random call; everything derives from the card id.
(() => {
  'use strict';
  const tk = ART.tk, pal = tk.pal;
  const TAU = Math.PI * 2, PI = Math.PI;
  const clamp = tk.clamp, lerp = tk.lerp, num = tk.num;
  const atan2 = Math.atan2, sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max, floor = Math.floor;
  const cA = (a) => (a >= 0 ? (a <= 1 ? a : 1) : 0);
  const INK = pal.ink;
  const arcPts = tk.arcPts;

  // ---------------------------------------------------------------------------------------------------------------
  // palettes: the art.js family plus the derived tones every motif needs
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
      e = {
        base: fin.base, light: fin.light, dark: fin.dark, glow: fin.glow,
        shade: tk.shade(fin.base), deep: tk.deep(fin.base, 0.5), pale: tk.tint(fin.light, 0.55), hot: tk.tint(fin.glow, 0.72),
        mid: tk.mix(fin.base, fin.dark, 0.5), shadeL: tk.shade(fin.light), dim: tk.mix(fin.dark, INK, 0.55),
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
  // sakura petal pointing up from the origin: a smooth teardrop that widens toward a notched tip (tip at (0, -len))
  function petalShape(len, wid, notch) {
    const n = notch === undefined ? 0.12 : notch;
    const half = (sd) => bez3([0, 0], [sd * wid * 0.1, -len * 0.16], [sd * wid * 0.78, -len * 0.24], [sd * wid * 0.62, -len * 0.64], 8).slice(1)
      .concat(bez3([sd * wid * 0.62, -len * 0.64], [sd * wid * 0.5, -len * 0.88], [sd * wid * 0.3, -len * 1.03], [sd * wid * 0.1, -len * 0.99], 6).slice(1), [[sd * wid * 0.03, -len * (1 - n)]]);
    return { poly: [[0, 0]].concat(half(1), half(-1).reverse()) };
  }
  const petalPts = petalShape;

  // ---------------------------------------------------------------------------------------------------------------
  // the motif context S: everything a motif needs, in a 100 x 100 design space centred on (0, 0)
  // ---------------------------------------------------------------------------------------------------------------
  function makeS(g, id, f, size, t, o) {
    o = o || {};
    const pxk = o.pxk > 0 ? o.pxk : 1;
    const real = size * pxk;
    const d = o.detail !== undefined ? o.detail : (real >= 76 ? 2 : real >= 34 ? 1 : 0);
    const S = { g, id, f, t: t || 0, anim: t !== undefined && t !== null, d, seed: o.seed | 0, sc: size / 100 * pxk, size };
    const minLine = d === 0 ? 1.7 : d === 1 ? 1.3 : 1.05, minThin = d === 0 ? 1.0 : 0.75;
    S.L = (w) => max(w, minLine / S.sc);                        // outline widths never fall under a readable pixel width
    S.T = (w) => max(w, minThin / S.sc);                        // thin detail strokes
    S.rng = (salt) => tk.rng('cm', id, S.seed, salt === undefined ? '' : salt);
    S.variant = (n) => (o.variant !== undefined ? floor(num(o.variant, 0)) % n : floor(tk.rng('cmv', id, S.seed)() * n) % n);
    S.pulse = (period, phase) => (S.anim ? 0.5 + 0.5 * sin(TAU * (S.t / (period || 2) + (phase || 0))) : 0.5);
    S.wave = (period, phase) => (S.anim ? sin(TAU * (S.t / (period || 2) + (phase || 0))) : 0);
    S.ht = (dd, a) => (d >= 2 ? { d: dd || 4.6, alpha: a === undefined ? 0.4 : a } : undefined);
    // screen-tone dots are always ink: one shared tile per spacing, instead of one cached tile per fill colour (which floods the sprite cache)
    S.cel = (shape, base, oo) => {
      const o2 = Object.assign({ line: S.L(2.6), rim: f.glow, rimW: S.L(1.5), rimAlpha: 0.9, hi: d ? 'auto' : undefined, hiW: S.L(2), seed: S.seed, shadowT: 0.3 }, oo);
      if (o2.halftone) o2.halftone = Object.assign({ color: INK }, o2.halftone === true ? {} : o2.halftone);
      tk.celFill(g, shape, base, o2);
    };
    S.ink = (pts, oo) => tk.inkPath(g, pts, Object.assign({ w: S.T(1.6), color: INK, wobble: 0.08, seed: S.seed }, oo, { w: S.T((oo && oo.w) || 1.6) }));
    S.line = (pts, oo) => tk.inkPath(g, pts, Object.assign({ color: INK, wobble: 0.08, seed: S.seed }, oo, { w: S.L((oo && oo.w) || 2.2) }));
    S.fill = (shape, color, alpha) => {
      g.save(); if (alpha !== undefined) g.globalAlpha *= cA(alpha);
      g.beginPath(); tk.trace(g, shape); g.fillStyle = color; g.fill(); g.restore();
    };
    S.glow = (x, y, r, color, a) => tk.glow(g, x, y, r, color || f.glow, a === undefined ? 0.5 : a);
    S.spark = (x, y, r, oo) => { if (d === 0 && r < 5) return; tk.sparkle(g, x, y, r, Object.assign({ color: pal.white, glow: d ? 0.4 : 0 }, oo)); };
    S.circle = (x, y, r, color, alpha) => { g.save(); if (alpha !== undefined) g.globalAlpha *= cA(alpha); g.beginPath(); g.arc(x, y, max(0.1, r), 0, TAU); g.fillStyle = color; g.fill(); g.restore(); };
    S.ring = (x, y, r, w, color, alpha) => { g.save(); if (alpha !== undefined) g.globalAlpha *= cA(alpha); g.beginPath(); g.arc(x, y, max(0.1, r), 0, TAU); g.strokeStyle = color; g.lineWidth = S.T(w); g.stroke(); g.restore(); };
    S.dash = (x, y, rx, ry, w, color, alpha, dash, off) => {
      g.save(); if (alpha !== undefined) g.globalAlpha *= cA(alpha);
      g.beginPath(); g.ellipse(x, y, max(0.1, rx), max(0.1, ry), 0, 0, TAU); g.strokeStyle = color; g.lineWidth = S.T(w); g.setLineDash(dash || [4, 3]); g.lineDashOffset = off || 0; g.stroke(); g.setLineDash([]); g.restore();
    };
    S.at = (x, y, a, sx, sy, fn) => { g.save(); g.translate(x, y); if (a) g.rotate(a); if (sx !== undefined) g.scale(sx, sy === undefined ? sx : sy); fn(); g.restore(); };
    return S;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // THE MOTIFS. Each is fn(S) drawing centred on (0, 0) within about +-46 design units (y down, light from the upper right).
  // ---------------------------------------------------------------------------------------------------------------
  const M = {};

  // a katana pointing up with the tip at (0, -len) and the guard at the origin; ang 0 = up. shine adds a flash on the blade
  function sword(S, x, y, ang, len, w, o) {
    o = o || {};
    const f = S.f, g = S.g;
    S.at(x, y, ang, 1, 1, () => {
      const hw = w / 2;
      const blade = [[-hw * 0.9, 0, 1], [-hw, -len * 0.5], [-hw * 0.9, -len * 0.9], [hw * 0.1, -len, 1], [hw, -len * 0.9], [hw, -len * 0.5], [hw * 0.9, 0, 1]];
      tk.celFill(g, { poly: blade }, o.steel || '#e4ecf8', { line: S.L(o.lw || 1.8), shadow: o.steelD || '#8a96c0', rim: o.rim || f.glow, rimW: S.L(1), hi: S.d ? '#ffffff' : undefined, hiW: S.L(1.2), depth: max(1.2, w * 0.36), light: o.light });
      if (S.d) { S.ink([[hw * 0.05, -len * 0.05], [hw * 0.05, -len * 0.92]], { w: 0.7, color: '#8a96c0', taper: 0.3, alpha: 0.8 }); S.ink([[-hw * 0.2, -len * 0.08], [-hw * 0.1, -len * 0.4], [hw * 0.1, -len * 0.6], [hw * 0.3, -len * 0.82]], { w: 0.8, color: '#ffffff', taper: 0.4, alpha: 0.7 }); }
      // tsuba (a flower guard), grip wrap and pommel
      S.cel(tk.ellipsePts(0, w * 0.05, w * 1.05, w * 0.42, 12), o.guard || pal.gold, { line: S.L(1.6), shadow: '#a8782a', hi: S.d ? pal.gold2 : undefined });
      S.cel([[-hw * 0.7, w * 0.3], [hw * 0.7, w * 0.3], [hw * 0.75, w * 2.6], [-hw * 0.75, w * 2.6]], o.grip || f.dark, { line: S.L(1.6), tension: 0.25, hi: false, rim: f.glow, rimW: S.L(0.8) });
      if (S.d) for (let i = 0; i < 3; i++) S.ink([[-hw * 0.7, w * (0.75 + i * 0.6)], [hw * 0.7, w * (1.05 + i * 0.6)]], { w: 0.9, color: f.glow, alpha: 0.55, taper: 0.1 });
      S.cel(tk.ellipsePts(0, w * 2.75, hw * 0.9, hw * 0.55, 8), pal.gold, { line: S.L(1.4), hi: false });
    });
  }
  M._sword = sword;

  M.slash = (S) => {
    const { g, f } = S, R = S.rng('s');
    const P = S.pulse(2.4);
    S.glow(0, 0, 60, f.glow, 0.28 + 0.1 * P);
    const ux = 0.822, uy = -0.566, nx = 0.566, ny = 0.822;
    // motion streaks trailing the tail of the cut
    const ns = S.d ? 9 : 4;
    for (let i = 0; i < ns; i++) {
      const off = -14 + R() * 46 - i * 0.5, s0 = -58 - R() * 6, len = 22 + R() * 38, sx = nx * off + ux * s0, sy = ny * off + uy * s0;
      S.ink([[sx, sy], [sx + ux * len, sy + uy * len]], { w: 0.9 + R() * 1.6, color: R() < 0.3 ? pal.white : f.glow, alpha: 0.5 + R() * 0.4, taper: 0.5, wobble: 0 });
    }
    // the cut itself: a crescent whose concave side faces the lower right
    const A = [-46, 30 + 2 * S.wave(3, 0)], B = [46, -34];
    const c2 = crescent(A, B, 17, 3, 16);
    // soft outer echo
    const c3 = crescent([A[0] + 5, A[1] - 3], [B[0] - 3, B[1] + 3], 22, 9, 14);
    S.fill(c3, f.base, 0.4);
    S.cel(c2, f.hot, { line: false, shadow: f.base, shadowT: 0.05, depth: 5, rim: f.glow, rimW: S.L(1.2), hi: '#ffffff', hiW: S.L(3), hiAlpha: 0.95 });
    S.line(c2.outer, { w: 3.4, taper: 0.22, pressure: 'mid', wobble: 0.06 });
    S.line(c2.inner, { w: 2, taper: 0.3, pressure: 'mid', wobble: 0.06, alpha: 0.9 });
    // white-hot core
    S.ink(bez2([-36, 22], [-3, -4], [36, -26], 10), { w: 4.6, color: '#ffffff', taper: 0.4, wobble: 0.03, alpha: 0.95 });
    // impact star and debris
    S.spark(12, -12, S.d ? 14 : 11, { color: '#ffffff', rot: 0.4, glow: 0.7 });
    if (S.d) { S.spark(-24, 14, 5, { color: f.hot }); S.spark(30, -30, 6, { color: pal.gold2, rot: 0.5 }); for (let i = 0; i < 6; i++) S.circle(-30 + R() * 70, 30 - R() * 60, 0.9 + R() * 1.4, i % 2 ? pal.white : f.glow, 0.85); }
  };

  M.cross_slash = (S) => {
    const { g, f } = S, R = S.rng('x');
    const P = S.pulse(2.2);
    S.glow(0, 0, 58, f.glow, 0.3 + 0.1 * P);
    // burst star at the crossing
    const burst = starPts(0, 0, 10, 8, 30 + 3 * S.wave(2), 0.3);
    S.fill({ poly: burst }, f.base, 0.55);
    const cut = (A, B, bo, bi, w) => {
      const c = crescent(A, B, bo, bi, 16), c3 = crescent([A[0] + (B[0] - A[0]) * 0.03, A[1] + (B[1] - A[1]) * 0.03], [B[0] - (B[0] - A[0]) * 0.03, B[1] - (B[1] - A[1]) * 0.03], bo + 5, bi + 3, 12);
      S.fill(c3, f.base, 0.42);
      S.cel(c, f.hot, { line: false, shadow: f.base, shadowT: 0.05, depth: 4, rim: f.glow, rimW: S.L(1.1), hi: '#ffffff', hiW: S.L(2.6), hiAlpha: 0.95 });
      S.line(c.outer, { w: w, taper: 0.2, wobble: 0.05 });
      S.line(c.inner, { w: w * 0.6, taper: 0.28, wobble: 0.05, alpha: 0.9 });
      return c;
    };
    cut([-44, -38], [46, 40], 12, 2, 3.2);
    cut([44, -36], [-46, 38], -14, -2, 3.6);
    S.ink(bez2([-32, -28], [-2, 0], [34, 30], 8), { w: 3.6, color: '#ffffff', taper: 0.4, wobble: 0.03 });
    S.ink(bez2([34, -26], [4, 2], [-34, 28], 8), { w: 3.6, color: '#ffffff', taper: 0.4, wobble: 0.03 });
    S.spark(0, 0, S.d ? 18 : 13, { color: '#ffffff', rot: 0.2, glow: 0.8 });
    if (S.d) { S.spark(30, 16, 6, { color: pal.gold2 }); S.spark(-30, -16, 6, { color: f.hot, rot: 0.5 }); for (let i = 0; i < 8; i++) { const a = R() * TAU, r = 30 + R() * 14; S.circle(cos(a) * r, sin(a) * r, 0.9 + R() * 1.3, i % 2 ? pal.white : f.glow, 0.85); } }
  };

  M.thrust = (S) => {
    const { g, f } = S, R = S.rng('t');
    const P = S.pulse(1.8);
    // converging speed lines from the edges toward the tip
    const tipx = 30, tipy = -22;
    S.glow(tipx, tipy, 52, f.glow, 0.32 + 0.1 * P);
    const nl = S.d ? 16 : 7;
    for (let i = 0; i < nl; i++) {
      const a = (i + R() * 0.8) / nl * TAU, r0 = 26 + R() * 22, r1 = rayLen(tipx, tipy, a, 60 + R() * 18, 50);
      if (r1 < r0 + 6) continue;
      S.ink([[tipx + cos(a) * r1, tipy + sin(a) * r1], [tipx + cos(a) * r0, tipy + sin(a) * r0]], { w: 1 + R() * 2.2, color: R() < 0.35 ? pal.white : f.glow, alpha: 0.55 + R() * 0.35, taper: 0.5, wobble: 0 });
    }
    // shock rings at the tip
    S.ring(tipx, tipy, 12 + 2 * P, 1.6, f.hot, 0.9);
    S.ring(tipx, tipy, 22 + 3 * P, 1.2, f.glow, 0.6);
    // the blade, thrust toward the upper right, flat lit and long
    S.at(-28, 30, 0.93, 1, 1, () => { sword(S, 0, 0, 0, 74, 12, {}); });
    S.spark(tipx + 1, tipy - 1, S.d ? 15 : 11, { color: '#ffffff', rot: 0.15, glow: 0.85 });
    if (S.d) { S.spark(tipx - 20, tipy + 17, 5, { color: pal.gold2 }); }
  };

  M.crescent = (S) => {
    const { g, f } = S, R = S.rng('c');
    const P = S.pulse(3);
    S.glow(0, 0, 58, f.glow, 0.25 + 0.1 * P);
    // a big lunar sweep: nearly a half ring, thick in the middle and pointed at both ends
    const rot = 0.5, cx = -4, cy = 6;
    const mk = (r0, r1, a0, a1, n) => {
      const outer = [], inner = [];
      for (let i = 0; i <= n; i++) { const u = i / n, a = lerp(a0, a1, u), k = sin(PI * u); outer.push(polar(cx, cy, r0 + 3 * k, a)); inner.push(polar(cx + 8 * k, cy - 5 * k, r1, a)); }
      return { poly: outer.concat(inner.reverse().slice(1, -1)), outer, inner: inner.slice().reverse() };
    };
    const a0 = PI * 0.62 + rot, a1 = PI * 2.05 + rot;
    const echo = mk(50, 34, a0 + 0.1, a1 - 0.25, 22);
    S.fill(echo, f.base, 0.32);
    const c = mk(45, 27, a0, a1, 26);
    S.cel(c, f.hot, { line: false, shadow: f.base, shadowT: 0.05, depth: 5, rim: f.glow, rimW: S.L(1.3), hi: '#ffffff', hiW: S.L(3.2), hiAlpha: 0.95 });
    S.line(c.outer, { w: 3.4, taper: 0.18, wobble: 0.05 });
    S.line(c.inner, { w: 2, taper: 0.25, wobble: 0.05, alpha: 0.9 });
    // motes in the hollow, the "moon" behind the cut
    S.circle(-2, 4, 14, f.base, 0.18);
    S.ring(-2, 4, 14, 1.2, f.hot, 0.5);
    if (S.d) { for (let i = 0; i < 9; i++) { const a = a0 + (a1 - a0) * R(), r = 47 + R() * 10; S.circle(cx + cos(a) * r, cy + sin(a) * r, 0.8 + R() * 1.4, R() < 0.5 ? pal.white : pal.gold2, 0.9); } }
    S.spark(polar(cx, cy, 44, a0 + (a1 - a0) * 0.5)[0], polar(cx, cy, 44, a0 + (a1 - a0) * 0.5)[1], S.d ? 10 : 8, { color: '#ffffff', rot: 0.4 });
  };

  M.iai = (S) => {
    const { g, f } = S, R = S.rng('i');
    S.glow(0, 4, 58, f.glow, 0.24);
    // the single flash line cutting right across the scene
    S.fill({ poly: [[-50, -0.6], [-8, -4.4], [50, -0.4], [-8, 4.2]] }, f.glow, 0.5);
    S.fill({ poly: [[-50, 0], [-8, -2.4], [52, 0], [-8, 2.2]] }, '#ffffff', 0.95);
    const y0 = 12;
    // exposed blade between the hand and the scabbard mouth, with a hamon line
    tk.celFill(g, { poly: [[-26, y0 - 4.6], [4, y0 - 5.6], [10, y0 - 5], [10, y0 + 3.4], [4, y0 + 3.8], [-26, y0 + 4.6]] }, '#eef3fb', { line: S.L(1.9), shadow: '#8a96c0', depth: 3, rim: f.glow, rimW: S.L(0.9), hi: S.d ? '#ffffff' : undefined, tension: 0.3 });
    if (S.d) S.ink([[-24, y0 + 1.6], [-6, y0 + 0.8], [8, y0 + 0.4]], { w: 0.8, color: '#8a96c0', taper: 0.3, alpha: 0.85 });
    // saya (scabbard) to the right: black lacquer with a gold mouth
    tk.celFill(g, { poly: [[10, y0 - 7.4], [46, y0 - 8], [50, y0 - 4], [50, y0 + 4], [46, y0 + 8], [10, y0 + 7.4]] }, f.dark, { line: S.L(2.4), shadow: tk.shade(f.dark), depth: 3.4, rim: f.glow, rimW: S.L(1.1), hi: S.d ? tk.tint(f.dark, 0.3) : undefined, tension: 0.3 });
    S.ink([[14, y0 - 3.4], [44, y0 - 4.2]], { w: 1, color: f.light, alpha: 0.5, taper: 0.4 });
    S.cel([[6, y0 - 8.4, 1], [12, y0 - 8.4, 1], [12, y0 + 8.4, 1], [6, y0 + 8.4, 1]], pal.gold, { line: S.L(1.5), hi: false, tension: 0.2, shadow: '#a8782a' });
    // tsuba and the wrapped grip of the drawing hand
    S.cel(tk.ellipsePts(-28, y0, 3.4, 11, 10), pal.gold, { line: S.L(1.8), hi: S.d ? pal.gold2 : undefined, shadow: '#a8782a' });
    S.cel([[-46, y0 - 5, 1], [-31, y0 - 5.6, 1], [-31, y0 + 5.6, 1], [-46, y0 + 5, 1]], f.base, { line: S.L(2), tension: 0.2, shadow: f.shade, depth: 2.4, rim: f.hot, rimW: S.L(0.8), hi: false });
    if (S.d) for (let i = 0; i < 4; i++) S.ink([[-44 + i * 4, y0 - 5], [-41 + i * 4, y0 + 5]], { w: 1.1, color: f.dark, alpha: 0.8, taper: 0.1, wobble: 0 });
    S.cel(tk.ellipsePts(-47, y0, 2.4, 5.4, 8), pal.gold, { line: S.L(1.5), hi: false, shadow: '#a8782a', depth: 1 });
    // petals cut in two along the line, and sparks
    for (let i = 0; i < (S.d ? 7 : 3); i++) { const x = -34 + R() * 80, y = -30 + R() * 40; if (abs(y) < 6) continue; S.at(x, y, R() * TAU, 1, 0.7, () => S.cel(petalShape(5 + R() * 3, 5, 0.12), f.light, { line: S.L(1.2), shadow: f.base, depth: 1.4, hi: false, rim: false })); }
    S.spark(38, -1, S.d ? 12 : 9, { color: '#ffffff', rot: 0.6, glow: 0.8 });
    if (S.d) { S.spark(-6, 2, 6, { color: f.hot }); S.spark(16, -16, 4, { color: pal.gold2 }); }
  };

  M.sword_rain = (S) => {
    const { g, f } = S, R = S.rng('r');
    const n = S.d ? 7 : 4, list = [];
    for (let i = 0; i < n; i++) list.push({ x: -34 + (i / (n - 1)) * 68 + (R() - 0.5) * 10, y: -6 + R() * 26, a: PI + (R() - 0.5) * 0.7 + (i - (n - 1) / 2) * 0.05, len: 42 + R() * 26, w: 7 + R() * 2.5, z: R() });
    list.sort((a, b) => a.z - b.z);
    S.glow(0, 4, 56, f.glow, 0.26 + 0.08 * S.pulse(2.6));
    // ground impact ring
    S.dash(0, 30, 44, 9, 1.4, f.hot, 0.55, [5, 3], -S.t * 8);
    list.forEach((s, i) => {
      // falling trail above the sword
      const drop = S.anim ? (S.t * 26 + i * 9) % 60 : 0;
      const yy = s.y - drop * 0.1;
      S.ink([[s.x, max(-46, yy - s.len * 0.95)], [s.x, yy - s.len * 0.1]], { w: 2.6, color: f.glow, alpha: 0.4, taper: 0.5, wobble: 0 });
      // blades point DOWN: rotate the up-pointing sword by PI
      sword(S, s.x, yy + 4, s.a, s.len * 0.62, s.w, { light: -1.05 });
    });
    if (S.d) for (let i = 0; i < 5; i++) S.spark(-38 + R() * 76, -30 + R() * 56, 3 + R() * 3, { color: R() < 0.5 ? '#ffffff' : pal.gold2 });
  };


  // ---- shared shapes for the nature motifs ----
  const leafPts = (len, wid) => [[0, 0, 1], [wid * 0.5, -len * 0.32], [wid * 0.34, -len * 0.74], [0, -len, 1], [-wid * 0.34, -len * 0.74], [-wid * 0.5, -len * 0.32]];
  // position and unit tangent at fraction u along a polyline of [x, y] points
  function polyAt(pts, u) {
    let tot = 0; const L = [0];
    for (let i = 1; i < pts.length; i++) { tot += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); L.push(tot); }
    const s = clamp(u, 0, 1) * tot; let i = 1;
    while (i < pts.length - 1 && L[i] < s) i++;
    const a = pts[i - 1], b = pts[i], sp = L[i] - L[i - 1] || 1, k = clamp((s - L[i - 1]) / sp, 0, 1);
    const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
    return { x: lerp(a[0], b[0], k), y: lerp(a[1], b[1], k), tx: tx / tl, ty: ty / tl };
  }
  // spiral polyline: centre, start radius, end radius, start angle, turns (signed)
  function spiralPts(cx, cy, r0, r1, a0, turns, n) {
    const o = [];
    for (let i = 0; i <= n; i++) { const u = i / n; o.push(polar(cx, cy, lerp(r0, r1, u), a0 + turns * TAU * u)); }
    return o;
  }

  M.petals = (S) => {
    const { g, f } = S, R = S.rng('p');
    S.glow(0, 0, 56, f.glow, 0.2 + 0.08 * S.pulse(3));
    const path = bez3([-44, 26], [-36, -32], [18, 40], [44, -26], 30);
    S.ink(path, { w: 2.6, color: '#ffffff', alpha: 0.7, taper: 0.4, wobble: 0.04 });
    S.ink(bez3([-40, 34], [-20, 6], [10, 14], [40, -6], 20), { w: 1.4, color: f.hot, alpha: 0.6, taper: 0.4, wobble: 0.04 });
    const plan = S.d ? [[0.05, 9], [0.15, 14], [0.29, 21], [0.46, 28], [0.62, 22], [0.76, 16], [0.9, 10]] : [[0.12, 14], [0.32, 24], [0.52, 28], [0.75, 17]];
    const items = plan.map((p, i) => {
      const q = polyAt(path, p[0]), side = i % 2 ? 1 : -1, off = side * (5 + R() * 9);
      return { x: q.x - q.ty * off, y: q.y + q.tx * off, a: Math.atan2(q.ty, q.tx) + PI / 2 + (R() - 0.5) * 2.4 + S.wave(4, i * 0.17) * 0.16, len: p[1], sy: 0.62 + 0.38 * R() };
    });
    items.sort((a, b) => a.len - b.len);
    items.forEach((it) => S.at(it.x, it.y, it.a, 1, it.sy, () => {
      S.cel(petalShape(it.len, it.len * 0.86, 0.13), f.light, { line: S.L(it.len > 16 ? 2.3 : 1.7), shadow: f.base, shadowT: 0, depth: it.len * 0.26, rim: f.hot, rimW: S.L(1), hi: S.d ? '#ffffff' : undefined, hiW: S.L(1.6),
        decor: (gg) => { const gr = gg.createRadialGradient(0, 0, 0, 0, 0, it.len * 0.7); gr.addColorStop(0, tk.rgba(f.base, 0.55)); gr.addColorStop(1, tk.rgba(f.base, 0)); gg.fillStyle = gr; gg.fillRect(-it.len, -it.len * 1.1, it.len * 2, it.len * 1.3); } });
      if (S.d && it.len > 14) { S.ink([[0, -it.len * 0.12], [-it.len * 0.08, -it.len * 0.58]], { w: 0.9, color: f.base, alpha: 0.75, taper: 0.5 }); S.ink([[0, -it.len * 0.12], [it.len * 0.14, -it.len * 0.56]], { w: 0.9, color: f.base, alpha: 0.6, taper: 0.5 }); }
    }));
    S.spark(30, -32, S.d ? 8 : 6, { color: '#ffffff' });
    if (S.d) S.spark(-34, 18, 5, { color: pal.gold2 });
  };

  M.bloom = (S) => {
    const { g, f } = S, R = S.rng('b');
    S.glow(0, 0, 58, f.glow, 0.3 + 0.1 * S.pulse(3));
    const r0 = -0.1 + (S.seed % 5) * 0.03;
    for (let i = 0; i < 5; i++) S.at(0, 2, r0 + PI / 5 + i * TAU / 5, 1, 1, () => S.cel(petalPts(44, 33, 0.12), f.base, { line: S.L(2.2), shadow: f.shade, depth: 7, rim: f.glow, hi: false }));
    for (let i = 0; i < 5; i++) S.at(0, 2, r0 + i * TAU / 5, 1, 1, () => {
      S.cel(petalPts(41, 32, 0.12), f.light, { line: S.L(2.4), shadow: f.base, shadowT: 0, depth: 9, rim: f.hot, rimW: S.L(1.2), hi: S.d ? '#ffffff' : undefined, hiW: S.L(1.8), halftone: S.d ? { d: 3.6, alpha: 0.25 } : undefined });
      if (S.d) { S.ink([[0, -8], [-3, -22], [-2, -34]], { w: 0.9, color: f.base, alpha: 0.7, taper: 0.5 }); S.ink([[0, -8], [4, -22], [6, -32]], { w: 0.9, color: f.base, alpha: 0.6, taper: 0.5 }); }
    });
    S.circle(0, 2, 9, f.dark);
    S.circle(0, 2, 6.5, f.shade);
    const ns = S.d ? 11 : 6;
    for (let i = 0; i < ns; i++) {
      const a = i / ns * TAU + 0.2, l = 15 + R() * 6 + 1.2 * S.wave(3, i * 0.09), ex = cos(a) * l, ey = 2 + sin(a) * l;
      S.ink([[cos(a) * 5, 2 + sin(a) * 5], [cos(a + 0.2) * l * 0.6, 2 + sin(a + 0.2) * l * 0.6], [ex, ey]], { w: 1.2, color: f.dark, taper: 0.1, wobble: 0 });
      S.circle(ex, ey, 2.3, pal.gold); S.circle(ex - 0.6, ey - 0.6, 0.9, pal.gold2);
    }
    if (S.d) { tk.petal(g, 40, -30, 6, 0.6, 0.9, f.light); tk.petal(g, -42, 26, 5, -0.5, 0.85, f.light); S.spark(-30, -34, 6, { color: '#ffffff' }); S.spark(36, 30, 5, { color: pal.gold2 }); }
  };

  M.petal_storm = (S) => {
    const { g, f } = S, R = S.rng('ps');
    S.glow(0, 0, 58, f.glow, 0.28 + 0.1 * S.pulse(2.4));
    const spin = S.anim ? S.t * 0.35 : 0;
    const arms = 2 + (S.seed % 3), turn = 0.5 + 0.06 * (S.seed % 4), sgn = S.seed % 2 ? 1 : -1;
    for (let arm = 0; arm < arms; arm++) S.ink(spiralPts(0, 0, 4, 46, spin + arm * TAU / arms, sgn * turn, 26), { w: 3.6, color: '#ffffff', alpha: 0.5, taper: 0.4, wobble: 0.03 });
    const list = [], per = S.d ? Math.round(18 / arms) : Math.round(10 / arms);
    for (let arm = 0; arm < arms; arm++) for (let i = 0; i < per; i++) {
      const u = (i + 0.5 + R() * 0.3) / per, r = lerp(9, 44, u), a = spin + arm * TAU / arms + sgn * u * turn * TAU + (R() - 0.5) * 0.3;
      list.push({ x: cos(a) * r, y: sin(a) * r * 0.94, a: a + PI / 2 + (R() - 0.5) * 0.8, len: 8 + u * 12 + R() * 3, sy: 0.65 + 0.35 * R() });
    }
    list.sort((p, q) => p.len - q.len);
    list.forEach((it) => S.at(it.x, it.y, it.a, 1, it.sy, () => S.cel(petalShape(it.len, it.len * 0.86, 0.13), f.light, { line: S.L(1.9), shadow: f.base, shadowT: 0, depth: it.len * 0.28, rim: f.hot, rimW: S.L(0.9), hi: false })));
    S.circle(0, 0, 8, '#ffffff', 0.92); S.ring(0, 0, 12, 1.6, f.hot, 0.8);
    S.spark(0, 0, S.d ? 15 : 11, { color: '#ffffff', rot: spin, glow: 0.8 });
  };

  M.wind = (S) => {
    const { g, f } = S, R = S.rng('w'), V = S.variant(3);
    S.glow(0, 0, 54, f.glow, 0.18);
    const gust = (y, x0, len, amp, curlR, w, tone, shift) => {
      const pts = [], n = 16;
      for (let i = 0; i <= n; i++) { const u = i / n; pts.push([x0 + u * len, y + sin(u * PI * 1.6 + shift) * amp * (1 - u * 0.3) - u * 4]); }
      const last = pts[pts.length - 1];
      for (let i = 1; i <= 12; i++) { const u = i / 12, a = -PI / 2 + u * PI * 1.75, r = curlR * (1 - u * 0.78); pts.push([last[0] + cos(a) * r, last[1] + curlR + sin(a) * r - curlR]); }
      S.line(pts, { w: w + 3.4, taper: 0.06, taperStart: 0.3, pressure: 'mid', wobble: 0.03, color: INK });
      S.ink(pts, { w: w, color: tone, taperStart: 0.34, taperEnd: 0.08, pressure: 'mid', wobble: 0.02 });
      S.ink(pts.slice(2, 14), { w: w * 0.4, color: '#ffffff', alpha: 0.85, taper: 0.4, wobble: 0 });
    };
    const leaves = (n) => { for (let i = 0; i < n; i++) { const x = -30 + R() * 74, y = -40 + R() * 80, a = R() * TAU, dr = S.anim ? (S.t * 10 + i * 13) % 20 : 0; S.at(x + dr * 0.4, y - dr * 0.1, a, 1, 1, () => S.cel(leafPts(9 + R() * 4, 6), R() < 0.5 ? pal.jade : f.pale, { line: S.L(1.6), shadow: tk.shade(pal.jade), depth: 2, hi: false, rim: false })); } };
    if (V === 0) {
      const off = S.anim ? S.wave(3, 0) * 2 : 0;
      gust(-24, -46, 60, 5, 11, 5.2, f.light, off * 0.2); gust(2, -40, 66, 6, 13, 6.4, f.hot, 1.2); gust(26, -46, 58, 5, 10, 5, f.light, 2.2);
      leaves(S.d ? 6 : 3);
    } else if (V === 1) {
      gust(-14, -46, 78, 7, 14, 7, f.hot, 0.6); gust(22, -44, 70, 6, 12, 6, f.light, 1.8);
      S.ink(spiralPts(-18, -34, 2, 15, S.t * 0.8, 1.6, 22), { w: 3.6, color: INK, taper: 0.2, wobble: 0 }); S.ink(spiralPts(-18, -34, 2, 15, S.t * 0.8, 1.6, 22), { w: 1.8, color: '#ffffff', taper: 0.2, wobble: 0 });
      leaves(S.d ? 7 : 3);
    } else {
      // a pinwheel (kazaguruma) spinning in the wind
      const spin = S.anim ? S.t * 3 : 0.3;
      S.ink([[0, 0], [2, 46]], { w: 4, color: INK, taper: 0.05, pressure: 'flat', wobble: 0 }); S.ink([[0, 0], [2, 46]], { w: 2, color: pal.paper2, taper: 0.05, pressure: 'flat', wobble: 0 });
      for (let i = 0; i < 4; i++) S.at(0, 0, spin + i * PI / 2, 1, 1, () => S.cel([[0, 0, 1], [28, -6], [30, -30, 1], [10, -18]], i % 2 ? f.light : f.hot, { line: S.L(2.4), shadow: f.base, shadowT: 0, depth: 4, rim: f.glow, rimW: S.L(1), hi: false, tension: 0.3 }));
      S.cel(tk.ellipsePts(0, 0, 5, 5, 8), pal.gold, { line: S.L(1.8), shadow: '#a8782a', depth: 1.4, hi: false, rim: false });
      for (let i = 0; i < 3; i++) S.ink(arcPts(0, 0, 40 + i * 4, 40 + i * 4, spin * 1.4 + i * 1.2, spin * 1.4 + i * 1.2 + 0.9, 6), { w: 2, color: '#ffffff', alpha: 0.7 - i * 0.15, taper: 0.4, wobble: 0 });
      leaves(S.d ? 4 : 2);
    }
  };

  M.tornado = (S) => {
    const { g, f } = S, R = S.rng('tn');
    S.glow(0, 0, 54, f.glow, 0.2);
    const ph = S.anim ? S.t * 1.4 : 0;
    // dust base
    S.at(0, 42, 0, 1, 0.24, () => S.glow(0, 0, 44, f.mid, 0.7)); S.dash(0, 41, 36, 7, 1.6, f.hot, 0.6, [6, 4], -ph * 8);
    // funnel body: wide at the top, tight at the bottom, bending a little
    const L = [], Rr = [];
    const n = 9;
    for (let i = 0; i <= n; i++) { const u = i / n, cx = sin(u * 3 + 0.6) * 6 * (0.4 + u), hw = lerp(42, 5, Math.pow(u, 0.85)); L.push([cx - hw, -40 + u * 80]); Rr.push([cx + hw, -40 + u * 80]); }
    const body = L.concat(Rr.reverse());
    S.cel(body, f.mid, { line: S.L(2.8), shadow: f.dim, shadowT: 0.05, depth: 12, rim: f.glow, rimW: S.L(1.4), hi: false, halftone: S.ht(4, 0.35) });
    // swirl bands: alternating light and dark arcs that wrap the funnel
    for (let i = 0; i < 8; i++) {
      const u = (i + 0.5 + (ph % 1)) / 8.4, y = -40 + u * 80, cx = sin(u * 3 + 0.6) * 6 * (0.4 + u), hw = lerp(42, 5, Math.pow(u, 0.85));
      if (u > 0.98 || u < 0) continue;
      const pts = []; for (let k = 0; k <= 10; k++) { const a = PI * 0.06 + PI * 0.88 * k / 10; pts.push([cx - cos(a) * hw * 0.98, y + sin(a) * hw * 0.22]); }
      S.ink(pts, { w: lerp(6.5, 2.4, u), color: i % 2 ? f.light : f.hot, taper: 0.28, wobble: 0.05, alpha: 0.95 });
      S.ink(pts, { w: lerp(2.4, 1, u), color: INK, taper: 0.3, wobble: 0.05, alpha: 0.6 });
    }
    // orbiting debris
    for (let i = 0; i < (S.d ? 7 : 3); i++) {
      const a = ph * 1.6 + i * 1.7, u = (i + 1) / 8, hw = lerp(48, 12, u) + 5, x = cos(a) * hw, y = -34 + u * 66 + sin(a) * 4;
      S.at(x, y, a * 2, 1, 1, () => S.cel(leafPts(8, 5), i % 2 ? pal.jade : pal.paper, { line: S.L(1.4), depth: 1.5, hi: false, rim: false, shadow: i % 2 ? tk.shade(pal.jade) : pal.paper2 }));
    }
  };

  M.thorns = (S) => {
    const { g, f } = S, R = S.rng('th'), V = S.variant(3);
    S.glow(0, 0, 54, f.glow, 0.16);
    const vine = (spine, w, col, thorns) => {
      tk.ribbon(g, spine, col, { wMax: w, w0: w * 0.6, w1: w * 0.4, profile: (u) => 0.7 + 0.3 * sin(u * PI), cap: 'round', gloss: false, strands: 0, line: S.L(2.2), rim: f.hot, rimW: S.L(0.9), shadowW: 0.5 });
      const dense = tk.flatten(spine, { step: 4 });
      const pts = []; for (let i = 0; i < dense.length; i += 2) pts.push([dense[i], dense[i + 1]]);
      for (let i = 0; i < thorns; i++) {
        const u = (i + 0.6) / (thorns + 0.2), p = polyAt(pts, u), side = i % 2 ? 1 : -1, nx = -p.ty * side, ny = p.tx * side, ln = 8 + R() * 6, bw = 3.4;
        const bx = p.x, by = p.y, tip = [bx + nx * ln + p.tx * 3, by + ny * ln + p.ty * 3];
        S.cel({ poly: [[bx - p.tx * bw, by - p.ty * bw], tip, [bx + p.tx * bw, by + p.ty * bw]] }, f.pale, { line: S.L(1.7), shadow: f.mid, depth: 1.6, hi: false, rim: false });
      }
    };
    const leaf = (x, y, a) => S.at(x, y, a, 1, 1, () => S.cel(leafPts(13, 9), pal.jade, { line: S.L(1.8), shadow: tk.shade(pal.jade), depth: 3, hi: false, rim: '#c8fff0', rimW: S.L(0.7) }));
    const blossom = (x, y, sc) => S.at(x, y, 0.3, sc, sc, () => { for (let i = 0; i < 5; i++) S.at(0, 0, i * TAU / 5, 1, 1, () => S.cel(petalPts(11, 10, 0.12), f.light, { line: S.L(1.6), shadow: f.base, shadowT: 0, depth: 2.4, hi: false, rim: false })); S.circle(0, 0, 2.6, pal.gold); });
    if (V === 0) {
      vine(bez3([-42, 36], [-46, -10], [-14, -44], [22, -30], 22), 7, f.base, S.d ? 6 : 4);
      vine(bez3([40, 36], [44, -6], [30, 30], [-6, 6], 22), 6, f.mid, S.d ? 5 : 3);
      vine(bez3([-30, 12], [-6, -8], [10, 34], [38, -32], 22), 6, f.shade, S.d ? 6 : 3);
      [[-32, -20, -0.9], [26, -34, 0.6], [30, 24, 2.2], [-8, 30, -2.5]].forEach((l, i) => { if (S.d || i < 2) leaf(l[0], l[1], l[2]); });
      if (S.d) blossom(20, -30, 0.8);
    } else if (V === 1) {
      const ring = (r0, r1, a0, turns) => spiralPts(0, 0, r0, r1, a0, turns, 34);
      vine(ring(31, 27, -2.4, 1.12), 7, f.base, S.d ? 9 : 5);
      vine(ring(25, 31, 0.9, 1.05), 6, f.mid, S.d ? 8 : 4);
      leaf(-30, -14, -1.2); leaf(32, 10, 2); if (S.d) { leaf(6, -34, 0.2); leaf(-12, 32, 3.4); }
      blossom(-6, -31, 1); if (S.d) blossom(31, 4, 0.75);
    } else {
      vine(bez3([-44, 36], [-30, -10], [4, 30], [34, -26], 24), 8, f.base, S.d ? 8 : 5);
      vine(bez3([-8, 14], [14, 18], [30, 36], [44, 24], 16), 5, f.mid, S.d ? 3 : 2);
      leaf(-28, 6, -1.7); leaf(-2, 22, 2.4); leaf(18, -6, 0.9); if (S.d) leaf(-36, 24, -2.2);
      blossom(34, -28, 1.35);
    }
    S.spark(-6, -8, S.d ? 7 : 5, { color: '#ffffff' });
  };

  M.poison_bloom = (S) => {
    const { g, f } = S, R = S.rng('pb');
    S.glow(0, -4, 54, f.glow, 0.2 + 0.08 * S.pulse(2.6));
    const cx = 0, cy = 12, n = S.d ? 7 : 5;
    // vapour behind
    for (let i = 0; i < 3; i++) S.circle(-24 + i * 24 + S.wave(3, i * 0.3) * 3, -28 + (i % 2) * 8, 13 - i * 1.4, f.glow, 0.13);
    // petals: long curling ribbons radiating upward, tips curling outward
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), a = lerp(-2.5, -0.64, u), side = a < -PI / 2 ? -1 : 1;
      const L = 42 - abs(u - 0.5) * 14 + R() * 4;
      const tipA = a + side * 0.9;
      const p0 = [cx, cy], p1 = polar(cx, cy, L * 0.6, a - side * 0.1), p2 = polar(cx, cy, L, a + side * 0.28), tip = polar(p2[0], p2[1], 8, tipA);
      tk.ribbon(g, [p0, p1, p2, tip], i % 2 ? f.base : f.light, { wMax: 6, w0: 3.5, w1: 0.2, tipPow: 1.6, line: S.L(1.8), rim: f.hot, rimW: S.L(0.8), gloss: false, strands: 0, shadowW: 0.55 });
    }
    // long stamens
    const ns = S.d ? 8 : 4;
    for (let i = 0; i < ns; i++) {
      const u = i / (ns - 1), a = lerp(-2.4, -0.74, u), L = 50 - abs(u - 0.5) * 12 + R() * 4, tip = polar(cx, cy, L, a + (a < -PI / 2 ? -0.2 : 0.2));
      S.ink([[cx, cy], polar(cx, cy, L * 0.55, a), tip], { w: 1.5, color: INK, taper: 0.05, wobble: 0 });
      S.circle(tip[0], tip[1], 2.4, i % 2 ? pal.gold : f.hot); S.ring(tip[0], tip[1], 2.4, 0.9, INK, 0.9);
    }
    S.circle(cx, cy, 5.5, f.dark); S.circle(cx - 1, cy - 1, 2.4, f.base);
    // venom drops
    const drop = (x, y, r) => { const sh = [[x, y - r * 1.6, 1], [x + r * 0.9, y - r * 0.1], [x + r * 0.6, y + r * 0.8], [x, y + r * 1.05], [x - r * 0.6, y + r * 0.8], [x - r * 0.9, y - r * 0.1]]; S.cel(sh, pal.jade, { line: S.L(1.7), shadow: '#12775f', depth: r * 0.5, hi: '#c8fff0', hiW: S.L(1.1), rim: false }); };
    drop(-24, 38, 4.6); drop(2, 42, 3.6); drop(26, 36, 4.2);
    if (S.d) { for (let i = 0; i < 5; i++) { const y = -8 - i * 8 - (S.anim ? (S.t * 8) % 8 : 0); S.ring(-40 + R() * 80, y, 1.6 + R() * 1.8, 0.9, '#c8fff0', 0.7); } }
  };

  M.lotus = (S) => {
    const { g, f } = S, R = S.rng('lo'), V = S.variant(3);
    S.glow(0, -6, 56, f.glow, 0.3 + 0.1 * S.pulse(3));
    const pad = (x, y, rx, ry) => S.cel(tk.ellipsePts(x, y, rx, ry, 14), pal.jade, { line: S.L(1.8), shadow: '#12775f', depth: 3, hi: false, rim: false });
    const bloom = (x, y, sc, tiers) => S.at(x, y, 0, sc, sc, () => {
      const pet = (a, len, wid, col, k) => S.at(0, 26, a, 1, 1, () => S.cel([[0, 0, 1], [wid * 0.5, -len * 0.3], [wid * 0.45, -len * 0.72], [0, -len, 1], [-wid * 0.45, -len * 0.72], [-wid * 0.5, -len * 0.3]], col, { line: S.L(2.2), shadow: k === 0 ? f.mid : f.base, shadowT: 0.05, depth: wid * 0.32, rim: f.hot, rimW: S.L(1), hi: S.d ? '#ffffff' : undefined, hiW: S.L(1.4), halftone: S.d && k === 0 ? { d: 3.6, alpha: 0.3 } : undefined }));
      if (tiers > 2) { pet(-1.15, 44, 20, f.base, 0); pet(1.15, 44, 20, f.base, 0); }
      pet(-0.7, 54, 22, f.light, 1); pet(0.7, 54, 22, f.light, 1); pet(0, 62, 24, f.pale, 1);
      if (S.d) [-0.7, 0, 0.7].forEach((a) => S.at(0, 26, a, 1, 1, () => S.ink([[0, -8], [0, -34]], { w: 0.9, color: f.base, alpha: 0.6, taper: 0.5 })));
    });
    if (V === 0) {
      S.dash(0, 34, 44, 8, 1.4, f.hot, 0.55, [6, 4], -S.t * 6); pad(-22, 36, 22, 6.5); pad(26, 38, 16, 5); bloom(0, 0, 1, 3);
      S.circle(0, -38, 5, pal.gold2, 0.9); S.spark(0, -38, S.d ? 12 : 8, { color: '#ffffff', glow: 0.7 });
    } else if (V === 1) {
      S.dash(0, 36, 46, 8, 1.4, f.hot, 0.55, [6, 4], -S.t * 6); pad(-28, 38, 20, 6); pad(28, 40, 16, 5);
      bloom(-16, 10, 0.62, 2); bloom(14, 2, 0.86, 3);
      S.spark(14, -32, S.d ? 11 : 8, { color: '#ffffff', glow: 0.7 });
    } else {
      // seen from above: two rings of petals around a golden seedpod
      S.circle(0, 0, 44, pal.jade, 0.5); S.ring(0, 0, 44, 1.6, '#12775f', 0.9);
      for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 8; i++) S.at(0, 0, i * TAU / 8 + ring * PI / 8 + (S.anim ? S.t * 0.05 * (ring ? -1 : 1) : 0), 1, 1, () => S.cel(petalShape(ring ? 30 : 40, ring ? 18 : 22, 0.08), ring ? f.light : f.base, { line: S.L(2.2), shadow: ring ? f.base : f.mid, shadowT: 0.05, depth: 5, rim: f.hot, rimW: S.L(1), hi: false }));
      S.cel(tk.ellipsePts(0, 0, 11, 11, 14), pal.gold2, { line: S.L(2.2), shadow: pal.gold, depth: 3, hi: '#ffffff', hiW: S.L(1.2), rim: false });
      for (let i = 0; i < 6; i++) { const q = polar(0, 0, 5.4, i / 6 * TAU); S.circle(q[0], q[1], 1.5, '#a8782a'); }
      S.spark(0, 0, S.d ? 10 : 7, { color: '#ffffff', glow: 0.6 });
    }
    if (S.d) for (let i = 0; i < 6; i++) S.circle(-36 + R() * 72, -30 + R() * 50, 0.9 + R() * 1.1, R() < 0.5 ? '#ffffff' : pal.gold2, 0.85);
  };

  M.koi = (S) => {
    const { g, f } = S, R = S.rng('ko');
    S.glow(0, 2, 56, f.glow, 0.18);
    const sw = S.wave(2.6, 0) * 4;
    S.dash(0, 6, 46, 34, 1.4, f.hot, 0.35, [6, 5], -S.t * 5); S.dash(0, 6, 36, 26, 1.2, f.hot, 0.25, [5, 5], S.t * 4);
    S.g.save(); S.g.translate(14, -8); S.g.scale(0.84, 0.84);
    // body spine: an S curve from the tail (bottom left) to the head (top right)
    const spine = bez3([-36, 30], [-30 + sw, -14], [8, 42], [30, -20 + sw * 0.4], 30);
    // tail fin
    const tp = polyAt(spine, 0.02);
    const tailBase = [spine[0][0], spine[0][1]];
    { const fl = sw * 0.6, tb = tailBase;
      const lobe = (spine, wMax) => tk.ribbon(g, spine, f.hot, { wMax, w0: 4, w1: 1, profile: (u) => 0.25 + 0.75 * Math.sin(u * PI * 0.8 + 0.2), gloss: false, strands: 0, line: S.L(1.8), rim: f.glow, rimW: S.L(0.8), shadow: f.light, shadowW: 0.5, cap: 'round' });
      lobe([[tb[0], tb[1]], [tb[0] - 6, tb[1] + 6], [tb[0] - 15, tb[1] + 10 + fl], [tb[0] - 26, tb[1] + 16 + fl * 1.4]], 14);
      lobe([[tb[0], tb[1]], [tb[0] - 2, tb[1] + 9], [tb[0] - 8, tb[1] + 20], [tb[0] - 11, tb[1] + 30 - fl]], 12);
      lobe([[tb[0], tb[1]], [tb[0] - 9, tb[1] + 2], [tb[0] - 20, tb[1] - 2 - fl], [tb[0] - 28, tb[1] + 3 - fl]], 9);
    }
    // fins
    const pf = polyAt(spine, 0.66);
    S.at(pf.x, pf.y, atan2(pf.ty, pf.tx) + 1.6, 1, 1, () => S.cel([[0, 0, 1], [8, 8], [12, 20], [2, 16], [-6, 8]], f.hot, { line: S.L(1.5), shadow: f.light, depth: 2.5, hi: false, rim: false }));
    // body
    tk.ribbon(g, spine, '#fff8f0', { wMax: 22, w0: 5, w1: 6, profile: (u) => u < 0.55 ? 0.28 + 0.72 * sin(u / 0.55 * PI / 2) : 1 - 0.32 * ((u - 0.55) / 0.45) ** 1.6, cap: 'round', gloss: false, strands: 0, line: S.L(2.6), rim: f.hot, rimW: S.L(1.1), shadow: '#d8cdb8', shadowW: 0.55,
      decor: (gg) => {
        // kohaku patches in the palette colour
        [[0.22, 8, 7], [0.5, -6, 9], [0.7, 6, 8]].forEach((p, i) => { const q = polyAt(spine, p[0]); gg.beginPath(); tk.trace(gg, tk.ellipsePts(q.x + p[1], q.y + p[1] * 0.3, p[2] * 1.4, p[2], 9, R() * 3)); gg.fillStyle = i % 2 ? f.base : f.shade; gg.fill(); });
        S.circle(polyAt(spine, 0.9).x - 2, polyAt(spine, 0.9).y + 3, 4, f.base);
      } });
    // head details: eye and barbels
    const hd = polyAt(spine, 0.93), ea = atan2(hd.ty, hd.tx);
    S.circle(hd.x - hd.ty * 3.5, hd.y + hd.tx * 3.5, 2.6, '#ffffff'); S.circle(hd.x - hd.ty * 3.5 + hd.tx * 0.5, hd.y + hd.tx * 3.5 + hd.ty * 0.5, 1.5, INK);
    const hp = polyAt(spine, 1);
    S.ink([[hp.x, hp.y], [hp.x + hp.tx * 6 - hp.ty * 4, hp.y + hp.ty * 6 + hp.tx * 4], [hp.x + hp.tx * 9 - hp.ty * 9, hp.y + hp.ty * 9 + hp.tx * 9]], { w: 1.2, color: INK, taper: 0.2 });
    S.g.restore();
    // ripples in front
    S.ring(24 + sw, -26, 7, 1.3, '#ffffff', 0.8); S.ring(24 + sw, -26, 12, 1, '#ffffff', 0.45);
    S.spark(-4, -8, S.d ? 6 : 5, { color: '#ffffff' });
  };


  // ---- shared bits for the heavenly and eerie motifs ----
  // a puffy cloud: circles outlined together so the outline follows the union
  function cloud(S, x, y, w, col, shadow) {
    const g = S.g, cs = [[-0.3, 0.02, 0.2], [-0.05, -0.1, 0.27], [0.24, -0.02, 0.22], [0.45, 0.06, 0.15], [-0.5, 0.08, 0.13]];
    g.save(); g.translate(x, y);
    g.lineJoin = 'round';
    g.strokeStyle = INK; g.lineWidth = S.L(2.4) * 2;
    const path = () => { g.beginPath(); cs.forEach((c) => { g.moveTo(c[0] * w + c[2] * w, c[1] * w); g.arc(c[0] * w, c[1] * w, c[2] * w, 0, TAU); }); g.rect(-0.5 * w, 0.06 * w, 0.98 * w, 0.13 * w); };
    path(); g.stroke();
    path(); g.fillStyle = col; g.fill();
    g.save(); path(); g.clip(); g.fillStyle = shadow || tk.shade(col, 0.15); g.beginPath(); g.ellipse(-0.05 * w, 0.22 * w, 0.62 * w, 0.14 * w, 0, 0, TAU); g.fill(); g.restore();
    g.restore();
  }
  M._cloud = cloud;

  M.moon = (S) => {
    const { g, f } = S, R = S.rng('mo');
    const P = S.pulse(4), cx = -4, cy = -8, r = 28;
    S.glow(cx, cy, 62, f.glow, 0.42 + 0.1 * P);
    S.ring(cx, cy, r + 9, 1.5, f.hot, 0.75);
    S.dash(cx, cy, r + 16, r + 16, 1.2, f.glow, 0.55, [2.5, 5], -S.t * 4);
    const base = tk.mix('#fff8e6', f.hot, 0.3), sh = tk.mix(f.light, f.base, 0.35);
    S.cel(tk.ellipsePts(cx, cy, r, r, 26), base, { line: S.L(3), shadow: sh, shadowT: 0, depth: 8, rim: f.glow, rimW: S.L(2), hi: '#ffffff', hiW: S.L(2.4), halftone: S.ht(3.6, 0.3),
      decor: (gg) => { [[-10, -6, 6], [6, 8, 8], [12, -14, 4], [-6, 14, 4.5]].forEach((c) => { gg.beginPath(); gg.arc(cx + c[0], cy + c[1], c[2], 0, TAU); gg.fillStyle = tk.rgba(sh, 0.5); gg.fill(); }); } });
    if (S.d) {
      // the moon rabbit, pounding mochi
      S.at(cx - 6, cy + 8, 0, 1, 1, () => {
        S.fill(tk.ellipsePts(0, 4, 9, 6.5, 10), INK, 0.66); S.fill(tk.ellipsePts(8, -2, 5, 5, 8), INK, 0.66);
        S.fill(tk.ellipsePts(10, -11, 1.8, 6.5, 8, 0.25), INK, 0.66); S.fill(tk.ellipsePts(6.4, -10.5, 1.6, 6, 8, -0.15), INK, 0.66);
        S.circle(-9, 4, 2.4, INK, 0.66);
        S.ink([[-2, 0], [-8, -14]], { w: 1.8, color: INK, alpha: 0.66, taper: 0.1, wobble: 0 }); S.circle(-8.5, -15, 3, INK, 0.66);
      });
    }
    cloud(S, 16, 32, 64, f.pale, f.light);
    if (S.d) cloud(S, -30, 42, 38, f.hot, f.pale);
    // pine or bamboo branch entering from the right
    if (S.d) {
      const br = bez2([48, 4], [34, -6], [22, -20], 12);
      S.line(br, { w: 2.6, taper: 0.1, color: f.dim, wobble: 0.05 });
      [[38, -1, 0.9], [30, -8, 1.5], [24, -16, 2.2], [40, 4, 0.2], [32, -2, -0.5]].forEach((l) => S.at(l[0], l[1], l[2], 1, 1, () => S.cel(leafPts(13, 4.6), f.dim, { line: S.L(1.3), depth: 1.5, hi: false, rim: f.glow, rimW: S.L(0.6), shadow: false })));
    }
    S.spark(30, -34, S.d ? 8 : 6, { color: '#ffffff' });
    if (S.d) { S.spark(-40, 8, 5, { color: pal.gold2 }); S.spark(-34, -34, 4, { color: '#ffffff' }); }
  };

  M.sun = (S) => {
    const { g, f } = S, R = S.rng('su');
    const spin = S.anim ? S.t * 0.12 : 0;
    S.glow(0, 0, 64, f.glow, 0.42 + 0.1 * S.pulse(3));
    // rays: long and short, alternating
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = spin + i / n * TAU, long = i % 2 === 0, r0 = 27, r1 = long ? 48 : 38, hw = long ? 0.13 : 0.1;
      S.cel({ poly: [polar(0, 0, r0, a - hw), polar(0, 0, r1, a), polar(0, 0, r0, a + hw)] }, long ? f.light : f.hot, { line: S.L(1.9), shadow: long ? f.base : f.light, depth: 2.2, hi: false, rim: false });
    }
    S.circle(0, 0, 31, f.dark, 0.5);
    S.cel(tk.ellipsePts(0, 0, 25, 25, 24), f.base, { line: S.L(3), shadow: f.shade, shadowT: 0, depth: 7, rim: f.hot, rimW: S.L(1.8), hi: f.light, hiW: S.L(3), halftone: S.ht(3.8, 0.3) });
    S.ring(0, 0, 19, 1.6, f.hot, 0.8);
    if (S.d) {
      // three tomoe comma swirls, like a taiko face
      for (let i = 0; i < 3; i++) S.at(0, 0, spin * 0.8 + i * TAU / 3, 1, 1, () => {
        const sh = [[0, -15, 1], [8, -13], [10, -6], [5, -2], [2, -5], [5, -8], [0, -10]];
        S.fill(sh, f.glow, 0.95); S.ink(sh.concat([sh[0]]), { w: 1.2, color: INK, alpha: 0.7, taper: 0.1, wobble: 0 });
      });
    }
    S.spark(-10, -12, S.d ? 8 : 6, { color: '#ffffff' });
  };

  M.star = (S) => {
    const { g, f } = S, R = S.rng('st');
    S.glow(0, 0, 60, f.glow, 0.38 + 0.12 * S.pulse(2.4));
    const rot = S.anim ? S.t * 0.12 : 0;
    const tipA = (i) => rot + i * PI / 4 - PI / 2, tipR = (i) => (i % 2 ? 29 : 47);
    const tip = (i) => polar(0, 0, tipR(i), tipA(i)), val = (i) => polar(0, 0, 11.5, rot + (i + 0.5) * PI / 4 - PI / 2);
    const ring = []; for (let i = 0; i < 8; i++) { ring.push(tip(i)); ring.push(val(i)); }
    S.fill({ poly: ring.map((p) => [p[0] * 1.1, p[1] * 1.1]) }, f.glow, 0.4);
    for (let i = 0; i < 8; i++) {
      const T = tip(i), Lv = val((i + 7) % 8), Rv = val(i), big = i % 2 === 0;
      S.fill({ poly: [[0, 0], Lv, T] }, big ? f.hot : f.light);
      S.fill({ poly: [[0, 0], T, Rv] }, big ? '#ffffff' : f.hot);
    }
    S.line(ring.concat([ring[0]]), { w: 2.8, wobble: 0.02, pressure: 'flat', taper: 0 });
    for (let i = 0; i < 8; i++) { const T = tip(i); S.ink([[0, 0], [T[0] * 0.92, T[1] * 0.92]], { w: 1.2, color: INK, alpha: 0.7, taper: 0.1, pressure: 'flat', wobble: 0 }); }
    S.cel(tk.ellipsePts(0, 0, 9, 9, 12), pal.gold2, { line: S.L(2), shadow: pal.gold, depth: 2.5, hi: '#ffffff' });
    S.spark(0, 0, 8, { color: '#ffffff', glow: 0.8 });
    if (S.d) {
      [[-38, -32, 6], [38, 32, 5], [40, -28, 4.4], [-36, 32, 3.4]].forEach((p, i) => S.spark(p[0], p[1], p[2], { color: i % 2 ? pal.gold2 : '#ffffff', rot: 0.4 }));
      for (let i = 0; i < 10; i++) { const a = R() * TAU, r = 32 + R() * 16; S.circle(cos(a) * r, sin(a) * r, 0.8 + R() * 1.2, '#ffffff', 0.85); }
    }
  };

  M.meteor = (S) => {
    const { g, f } = S, R = S.rng('me');
    const fl = S.wave(0.5, 0) * 1.5;
    S.glow(18, -14, 60, f.glow, 0.32);
    // the tail: nested flame tongues sweeping down-left
    const tail = (w, col, len, alpha) => {
      const spine = [[16, -14], [-2, 0], [-22, 14 + fl], [-len, 28 + fl * 2]];
      tk.ribbon(g, spine, col, { wMax: w, w0: w * 0.9, w1: 0, tipPow: 1.2, gloss: false, strands: 0, line: alpha ? S.L(2) : false, shadow: false, rim: false });
    };
    tail(34, f.base, 50, true); tail(24, f.light, 44, false); tail(13, f.hot, 36, false);
    for (let i = 0; i < 7; i++) S.ink([[10 - R() * 10, -6 + R() * 16], [-24 - R() * 20, 6 + R() * 30]], { w: 1 + R() * 1.6, color: R() < 0.5 ? '#ffffff' : f.glow, alpha: 0.7, taper: 0.5, wobble: 0 });
    // the rock: a faceted boulder with a hot rim
    const rock = [[8, -30, 1], [26, -34], [40, -22], [42, -6], [30, 6], [14, 4], [6, -12]];
    S.cel(rock, f.dim, { line: S.L(3), shadow: INK, shadowT: 0, depth: 8, rim: f.glow, rimW: S.L(2.2), rimSide: 'light', hi: f.mid, hiW: S.L(2.4), halftone: S.ht(3.4, 0.4),
      decor: (gg) => { gg.strokeStyle = tk.rgba(f.glow, 0.5); gg.lineWidth = S.T(1.1); [[[14, -26], [22, -16], [16, -6]], [[30, -30], [28, -18], [38, -12]], [[24, -14], [34, -2]]].forEach((c) => { gg.beginPath(); gg.moveTo(c[0][0], c[0][1]); c.slice(1).forEach((p) => gg.lineTo(p[0], p[1])); gg.stroke(); }); } });
    S.circle(20, -18, 9, f.hot, 0.22);
    // crater flame licks curling off the top of the rock
    S.ink([[22, -34], [26, -46], [20, -50]], { w: 3.2, color: f.light, taper: 0.4 });
    for (let i = 0; i < (S.d ? 9 : 4); i++) S.circle(-8 - R() * 34, 4 + R() * 38, 0.9 + R() * 1.7, i % 2 ? '#ffffff' : pal.gold2, 0.9);
    S.spark(38, -26, S.d ? 9 : 7, { color: '#ffffff' });
    if (S.d) { S.cel([[-20, -20, 1], [-14, -24], [-9, -19], [-13, -14]], f.dim, { line: S.L(1.4), depth: 1.5, hi: false, rim: f.glow, rimW: S.L(0.6), shadow: false }); S.cel([[-34, -6, 1], [-28, -9], [-24, -4], [-29, -1]], f.dim, { line: S.L(1.2), depth: 1, hi: false, rim: false, shadow: false }); }
  };

  M.spirit_orb = (S) => {
    const { g, f } = S, R = S.rng('so'), V = S.variant(3);
    const P = S.pulse(2.4), w = S.wave(1.8, 0) * 4;
    const orb = (cx, cy, r) => {
      S.cel(tk.ellipsePts(cx, cy, r, r, 22), f.light, { line: S.L(3), shadow: f.base, shadowT: 0, depth: r * 0.32, rim: f.hot, rimW: S.L(2), hi: '#ffffff', hiW: S.L(3), halftone: S.ht(3.6, 0.3) });
      S.circle(cx + 2, cy - 2, r * 0.6, f.hot, 0.9); S.circle(cx + 3, cy - 3, r * 0.32, '#ffffff', 0.95);
      if (S.d) S.ink(spiralPts(cx, cy, 3, r * 0.78, S.t * 0.6, 1.4, 22), { w: 1.4, color: f.base, taper: 0.3, alpha: 0.7, wobble: 0 });
    };
    const tail = (cx, cy, a, len, wid) => S.at(cx, cy, a, 1, 1, () => {
      tk.ribbon(g, [[0, 0], [len * 0.4, 6 + w], [len * 0.72 + w * 0.5, -4], [len, 4 + w]], f.light, { wMax: wid, w0: wid * 0.92, w1: 0, tipPow: 1.1, gloss: false, strands: 0, line: S.L(2.4), rim: f.hot, rimW: S.L(1), shadowW: 0.5, shadow: f.base, halftone: S.d ? { d: 3.6, alpha: 0.3 } : undefined });
      tk.ribbon(g, [[0, 0], [len * 0.3, 4 + w * 0.6], [len * 0.5, -2]], f.hot, { wMax: wid * 0.5, w0: wid * 0.46, w1: 0, gloss: false, strands: 0, line: false, shadow: false, rim: false });
    });
    if (V === 0) {
      const cx = 8, cy = -6; S.glow(cx, cy, 58, f.glow, 0.38 + 0.12 * P);
      tail(cx - 6, cy + 8, PI * 0.72, 46, 24); orb(cx, cy, 22); S.ring(cx, cy, 30 + 2 * P, 1.4, f.hot, 0.6);
      for (let i = 0; i < (S.d ? 3 : 2); i++) { const a = (S.anim ? S.t * 0.7 : 0) + i * 2.1 + 0.6, x = cx + cos(a) * 34, y = cy + sin(a) * 30, r = 4.5 - i * 0.7; S.circle(x, y, r * 2.2, f.glow, 0.35); S.cel(tk.ellipsePts(x, y, r, r, 9), f.hot, { line: S.L(1.6), shadow: f.light, depth: 1.5, hi: false, rim: false }); }
    } else if (V === 1) {
      S.glow(0, 0, 58, f.glow, 0.38 + 0.12 * P);
      const sp = S.anim ? S.t * 0.5 : 0; for (let i = 0; i < 3; i++) tail(0, 0, sp + i * TAU / 3 + 0.4, 40, 17);
      orb(0, 0, 17); S.ring(0, 0, 26 + 2 * P, 1.4, f.hot, 0.6);
    } else {
      S.glow(6, -6, 56, f.glow, 0.38 + 0.12 * P);
      tail(-4, 6, PI * 0.8, 30, 14); orb(-24, 22, 10);
      tail(12, 2, PI * 0.74, 40, 22); orb(10, -6, 20); S.ring(10, -6, 28 + 2 * P, 1.4, f.hot, 0.6);
    }
    S.spark(-8, -12, S.d ? 7 : 5, { color: '#ffffff' });
  };

  M.heal_light = (S) => {
    const { g, f } = S, R = S.rng('hl');
    const P = S.pulse(2.6);
    // a fan of soft beams rising from the orb
    for (let i = -2; i <= 2; i++) {
      const a = -PI / 2 + i * 0.3, hw = 0.11;
      S.fill({ poly: [[0, 4], polar(0, 4, 62, a - hw), polar(0, 4, 62, a + hw)] }, f.glow, 0.22 + 0.08 * P);
    }
    S.glow(0, 4, 56, f.glow, 0.42 + 0.1 * P);
    S.cel(tk.ellipsePts(0, 4, 20, 20, 20), f.light, { line: S.L(3), shadow: f.base, shadowT: 0, depth: 6, rim: f.hot, rimW: S.L(2), hi: '#ffffff', hiW: S.L(2.6), halftone: S.ht(3.6, 0.28) });
    S.circle(2, 2, 11, '#ffffff', 0.95);
    // rising plus signs
    const plus = (x, y, s, col) => { const t = s * 0.34; S.cel({ poly: [[x - t, y - s], [x + t, y - s], [x + t, y - t], [x + s, y - t], [x + s, y + t], [x + t, y + t], [x + t, y + s], [x - t, y + s], [x - t, y + t], [x - s, y + t], [x - s, y - t], [x - t, y - t]] }, col, { line: S.L(1.8), shadow: f.light, depth: 1.6, hi: false, rim: false }); };
    const rise = S.anim ? (S.t * 8) % 12 : 0;
    plus(-24, -20 - rise * 0.4, 8, '#ffffff'); plus(24, -30 - rise * 0.5, 6.4, '#ffffff'); plus(2, -36 - rise * 0.6, 5.2, f.hot);
    if (S.d) { plus(-36, -4 - rise * 0.3, 4.2, f.hot); plus(36, -8 - rise * 0.35, 4.6, f.hot); }
    // leaves circling below
    for (let i = 0; i < (S.d ? 5 : 3); i++) { const a = PI * (0.15 + i * 0.18), r = 34; S.at(cos(a) * r, 8 + sin(a) * 22, a + PI / 2 + 0.3, 1, 1, () => S.cel(leafPts(11, 7), pal.jade, { line: S.L(1.7), shadow: tk.shade(pal.jade), depth: 2, hi: false, rim: '#c8fff0', rimW: S.L(0.6) })); }
    S.spark(-8, -6, S.d ? 9 : 7, { color: '#ffffff', glow: 0.7 });
    if (S.d) for (let i = 0; i < 8; i++) S.circle(-36 + R() * 72, -40 + R() * 70, 0.9 + R() * 1.2, R() < 0.5 ? '#ffffff' : pal.gold2, 0.85);
  };

  M.void = (S) => {
    // Hush Hole: the torn hole and spiral, its rim frayed with grey ash and frost dashes, broken notes being pulled in
    const { g, f } = S, R = S.rng('vo');
    const spin = S.anim ? S.t * 0.4 : 0;
    S.glow(0, 0, 60, f.glow, 0.26);
    const hole = [];
    const n = 20;
    for (let i = 0; i < n; i++) { const a = i / n * TAU, r = 29 * (0.8 + 0.4 * R() + (i % 2 ? 0.16 : -0.06)); hole.push([cos(a) * r, sin(a) * r * 0.94, 1]); }
    S.fill({ poly: hole.map((p) => [p[0] * 1.14, p[1] * 1.14]) }, f.glow, 0.42);
    S.cel({ poly: hole }, INK, { line: S.L(2.4), lineColor: f.hot, shadow: false, hi: false, rim: false, decor: (gg) => {
      for (let k = 0; k < 4; k++) { gg.beginPath(); const sp = spiralPts(0, 0, 3, 34, spin + k * TAU / 4, 0.5, 20); gg.moveTo(sp[0][0], sp[0][1]); sp.slice(1).forEach((p) => gg.lineTo(p[0], p[1])); gg.strokeStyle = tk.rgba(f.base, 0.75); gg.lineWidth = S.T(3 - k * 0.3); gg.stroke(); }
      const gr = gg.createRadialGradient(0, 0, 0, 0, 0, 22); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.15, tk.rgba(f.glow, 0.5)); gr.addColorStop(1, 'rgba(0,0,0,0)'); gg.fillStyle = gr; gg.fillRect(-30, -30, 60, 60);
    } });
    S.circle(0, 0, 3, '#ffffff', 1);
    // the rim: short grey ash and frost dashes, frayed outward
    const nd = S.d ? 30 : 14;
    for (let i = 0; i < nd; i++) {
      const a = i / nd * TAU + R() * 0.2, r = 30 + R() * 9, ln = 3 + R() * 4, ta = a + PI / 2 + (R() - 0.5) * 1.4;
      const x = cos(a) * r, y = sin(a) * r * 0.94;
      S.ink([[x - cos(ta) * ln / 2, y - sin(ta) * ln / 2], [x + cos(ta) * ln / 2, y + sin(ta) * ln / 2]], { w: 1.8, color: i % 2 ? pal.hush2 : '#f2f0f6', taper: 0.2, pressure: 'flat', wobble: 0, alpha: 0.9 });
    }
    // broken note glyphs being pulled in: a head, a stem in two pieces with a gap, a flag scrap
    const ns = S.d ? 8 : 4;
    for (let i = 0; i < ns; i++) {
      const a = spin * 1.6 + i * TAU / ns + R() * 0.4, rr = 40 + R() * 8, x = cos(a) * rr, y = sin(a) * rr * 0.9, ang = a + PI / 2 + (R() - 0.5);
      S.ink([[cos(a) * (rr + 11), sin(a) * (rr + 11) * 0.9], [cos(a - 0.3) * (rr + 2), sin(a - 0.3) * (rr + 2) * 0.9]], { w: 1.4, color: f.hot, alpha: 0.6, taper: 0.5, wobble: 0 });
      S.at(x, y, ang, 1, 1, () => {
        const col = i % 2 ? f.hot : pal.hush;
        g.beginPath(); g.ellipse(0, 3, 3.8, 2.8, -0.35, 0, TAU); g.fillStyle = col; g.fill();
        S.ink([[3.2, 2], [3.2, -2.5]], { w: 1.5, color: col, taper: 0, pressure: 'flat', wobble: 0 });
        S.ink([[3.2, -5.6], [3.2, -9]], { w: 1.5, color: col, taper: 0, pressure: 'flat', wobble: 0 });
        if (i % 2) S.ink([[4.2, -9], [7.4, -6.4]], { w: 1.4, color: col, taper: 0.3, pressure: 'flat', wobble: 0 });
      });
    }
    if (S.d) for (let i = 0; i < 5; i++) S.circle(-40 + R() * 80, -40 + R() * 80, 0.8 + R() * 1.2, '#ffffff', 0.8);
  };

  M.sigil = (S) => {
    const { g, f } = S, R = S.rng('sg'), V = S.variant(3);
    const spin = S.anim ? S.t * 0.25 : 0;
    S.glow(0, 0, 60, f.glow, 0.34 + 0.08 * S.pulse(3));
    const both = (pts, w, col) => { S.ink(pts, { w: w + 2.2, color: INK, taper: 0.02, pressure: 'flat', wobble: 0, alpha: 0.85 }); S.ink(pts, { w, color: col || f.hot, taper: 0.02, pressure: 'flat', wobble: 0 }); };
    const circ = (r, w, col) => { const pts = []; for (let i = 0; i <= 40; i++) pts.push(polar(0, 0, r, i / 40 * TAU)); both(pts, w, col); };
    circ(46, 2.6); circ(38, 1.6, f.glow);
    const runes = (S.d ? 14 : 8) + V * 2;
    for (let i = 0; i < runes; i++) {
      const a = spin + i / runes * TAU, kind = floor(R() * 4), p = (r, da) => polar(0, 0, r, a + da);
      if (kind === 0) S.ink([p(39.4, -0.05), p(44.6, -0.05)], { w: 1.8, color: '#ffffff', taper: 0.1, wobble: 0 });
      else if (kind === 1) S.ink([p(39.6, -0.06), p(42, 0.02), p(44.4, -0.06)], { w: 1.6, color: '#ffffff', taper: 0.1, wobble: 0 });
      else if (kind === 2) { S.ink([p(39.4, 0), p(44.6, 0)], { w: 1.6, color: '#ffffff', taper: 0.1, wobble: 0 }); S.ink([p(42, -0.06), p(42, 0.06)], { w: 1.6, color: '#ffffff', taper: 0.1, wobble: 0 }); }
      else { S.circle(p(42, 0)[0], p(42, 0)[1], 1.6, '#ffffff', 1); S.ink([p(39.6, 0.04), p(44.4, 0.04)], { w: 1.2, color: '#ffffff', taper: 0.1, wobble: 0 }); }
    }
    const ang = -spin * 0.7;
    if (V === 0) { const hx = (rot) => { const pts = []; for (let i = 0; i < 3; i++) pts.push(polar(0, 0, 31, rot + i * TAU / 3 - PI / 2)); pts.push(pts[0]); both(pts, 2.2); }; hx(ang); hx(ang + PI); }
    else if (V === 1) { const pts = []; for (let i = 0; i < 5; i++) pts.push(polar(0, 0, 32, ang + i * 2 * TAU / 5 - PI / 2)); pts.push(pts[0]); both(pts, 2.4); circ(20, 1.6, f.glow); }
    else { const sq = (rot) => { const pts = []; for (let i = 0; i < 4; i++) pts.push(polar(0, 0, 31, rot + i * TAU / 4)); pts.push(pts[0]); both(pts, 2.2); }; sq(ang); sq(ang + PI / 4); circ(24, 1.4, f.glow); }
    circ(V === 1 ? 10 : 15, 2, f.glow);
    const nP = V === 0 ? 6 : V === 1 ? 5 : 8;
    for (let i = 0; i < nP; i++) S.at(0, 0, ang + i * TAU / nP, 1, 1, () => S.cel(petalPts(V === 1 ? 8 : 11, V === 1 ? 6 : 8, 0.1), i % 2 ? f.light : f.hot, { line: S.L(1.3), shadow: f.base, depth: 2, hi: false, rim: false }));
    S.circle(0, 0, 3, pal.gold2);
    if (S.d) { const vn = V === 0 ? 6 : V === 1 ? 5 : 8; for (let i = 0; i < vn; i++) { const q = polar(0, 0, V === 1 ? 32 : 31, ang + i * (V === 1 ? 2 * TAU / 5 : TAU / vn) - PI / 2); S.circle(q[0], q[1], 2.2, '#ffffff'); S.ring(q[0], q[1], 2.2, 0.8, INK, 0.9); } }
    S.spark(0, 0, S.d ? 9 : 6, { color: '#ffffff', glow: 0.6 });
  };

  M.mirror = (S) => {
    const { g, f } = S, R = S.rng('mi'), V = S.variant(3);
    S.glow(0, -6, 60, f.glow, 0.3 + 0.1 * S.pulse(3));
    const cy = V === 1 ? 2 : -10;
    if (V === 0) {
      S.cel([[-5, 18, 1], [5, 18, 1], [4, 40, 1], [-4, 40, 1]], f.dark, { line: S.L(2.2), tension: 0.25, shadow: tk.shade(f.dark), depth: 2.2, rim: f.glow, rimW: S.L(0.8), hi: false });
      S.cel(tk.ellipsePts(0, 40, 6, 3.4, 10), pal.gold, { line: S.L(1.8), shadow: '#a8782a', depth: 1.4, hi: false, rim: false });
      S.ink([[0, 41], [-5, 47]], { w: 2.4, color: pal.vermilion, taper: 0.2 }); S.ink([[0, 41], [5, 47]], { w: 2.4, color: pal.vermilion, taper: 0.2 });
    } else if (V === 1) {
      // hung from a cord with a knotted tassel, swinging a little
      const sw = S.wave(2.6, 0) * 2;
      S.ink([[0, -46], [0, -34]], { w: 3, color: INK, taper: 0.05, pressure: 'flat', wobble: 0 }); S.ink([[0, -46], [0, -34]], { w: 1.4, color: pal.vermilion, taper: 0.05, pressure: 'flat', wobble: 0 });
      S.ink([[0, 34], [sw, 42], [0, 50]], { w: 3.2, color: pal.vermilion, taper: 0.3 }); S.ink([[0, 36], [sw - 4, 46]], { w: 2, color: pal.vermilion, taper: 0.4 }); S.ink([[0, 36], [sw + 4, 46]], { w: 2, color: pal.vermilion, taper: 0.4 });
    } else {
      S.cel([[-4, 20, 1], [4, 20, 1], [3, 42, 1], [-3, 42, 1]], f.dark, { line: S.L(2), tension: 0.25, shadow: tk.shade(f.dark), depth: 2, rim: f.glow, rimW: S.L(0.7), hi: false });
      S.cel([[-9, 40, 1], [9, 40, 1], [7, 46, 1], [-7, 46, 1]], pal.gold, { line: S.L(1.8), tension: 0.25, shadow: '#a8782a', depth: 1.4, hi: false, rim: false });
    }
    const rimN = V === 2 ? 24 : 0;
    if (V === 2) { const rim = []; for (let i = 0; i < 48; i++) { const a = i / 48 * TAU; rim.push([cos(a) * (i % 2 ? 31 : 37), cy + sin(a) * (i % 2 ? 31 : 37)]); } S.cel({ poly: rim }, pal.gold, { line: S.L(2.6), shadow: '#a8782a', shadowT: 0, depth: 6, rim: pal.gold2, rimW: S.L(1.4), hi: false }); }
    else S.cel(tk.ellipsePts(0, cy, 33, 33, 28), pal.gold, { line: S.L(3), shadow: '#a8782a', shadowT: 0, depth: 6, rim: pal.gold2, rimW: S.L(1.6), hi: pal.gold2, hiW: S.L(2.4) });
    if (S.d && V !== 2) for (let i = 0; i < 20; i++) { const q = polar(0, cy, 30, i / 20 * TAU); S.circle(q[0], q[1], 1.5, i % 2 ? '#a8782a' : pal.gold2); }
    S.cel(tk.ellipsePts(0, cy, V === 2 ? 27 : 25, V === 2 ? 27 : 25, 24), f.light, { line: S.L(2.4), shadow: f.base, shadowT: 0, depth: 8, rim: false, hi: false, halftone: S.ht(3.6, 0.3),
      decor: (gg) => {
        const sk = gg.createLinearGradient(0, cy - 30, 0, cy + 24); sk.addColorStop(0, f.pale); sk.addColorStop(0.7, f.light); sk.addColorStop(1, f.base); gg.fillStyle = sk; gg.fillRect(-32, cy - 34, 64, 62);
        gg.fillStyle = tk.rgba('#ffffff', 0.9); gg.beginPath(); gg.arc(-8 + 6 * R(), cy - 12, 6, 0, TAU); gg.fill();
        gg.fillStyle = tk.rgba(f.dark, 0.55); gg.beginPath(); gg.moveTo(-32, cy + 8); gg.lineTo(-18, cy - 2); gg.lineTo(-8, cy + 5); gg.lineTo(6, cy - 6); gg.lineTo(18, cy + 4); gg.lineTo(32, cy - 1); gg.lineTo(32, cy + 28); gg.lineTo(-32, cy + 28); gg.closePath(); gg.fill();
        const gr = gg.createLinearGradient(-20, cy - 30, 20, cy + 18); gr.addColorStop(0, tk.rgba('#ffffff', 0.55)); gr.addColorStop(0.5, tk.rgba(f.hot, 0.18)); gr.addColorStop(1, tk.rgba(f.base, 0.0)); gg.fillStyle = gr; gg.fillRect(-32, cy - 34, 64, 62);
        gg.fillStyle = tk.rgba('#ffffff', 0.85); gg.beginPath(); gg.moveTo(-18, cy - 4); gg.lineTo(-8, cy - 18); gg.lineTo(-1, cy - 18); gg.lineTo(-13, cy + 4); gg.closePath(); gg.fill();
        gg.beginPath(); gg.moveTo(0, cy - 4); gg.lineTo(6, cy - 12); gg.lineTo(9, cy - 12); gg.lineTo(3, cy); gg.closePath(); gg.fill();
      } });
    S.spark(8, cy, S.d ? 12 : 9, { color: '#ffffff', glow: 0.8 });
    if (S.d) { S.spark(-30, -34, 5, { color: pal.gold2 }); S.spark(36, 8, 4, { color: '#ffffff' }); }
  };

  M.eye = (S) => {
    const { g, f } = S, R = S.rng('ey'), V = S.variant(3);
    const P = S.pulse(3);
    S.glow(0, 0, 62, f.glow, 0.34 + 0.1 * P);
    g.save();
    if (V === 2) g.rotate(-PI / 2);                                           // the upright third eye
    const nr = S.d ? 20 : 10;
    for (let i = 0; i < nr; i++) { const a = i / nr * TAU + 0.07, r0 = 32 + 4 * (i % 2), r1 = 44 + 5 * (i % 3); if (abs(sin(a)) < 0.18) continue; S.ink([polar(0, 0, r0, a), polar(0, 0, r1, a)], { w: 1.4 + (i % 2), color: i % 3 ? f.hot : '#ffffff', taper: 0.4, wobble: 0, alpha: 0.85 }); }
    S.dash(0, 0, 45, 45, 1.1, f.hot, 0.55, [3, 5], S.t * 4);
    const look = S.anim ? S.wave(5, 0) * 2.4 : 0;
    const upper = bez3([-42, 2], [-28, -22], [22, -26], [43, -1], 12), lower = bez3([43, -1], [26, 20], [-24, 22], [-42, 2], 12);
    const shape = { poly: upper.concat(lower.slice(1, -1)) };
    S.cel(shape, '#fff8f0', { line: false, shadow: '#cfc4dc', shadowT: 0, depth: 6, rim: false, hi: false, decor: (gg) => {
      const ix = 2 + look, iy = 0, ir = 17;
      const gr = gg.createRadialGradient(ix, iy, 2, ix, iy, ir); gr.addColorStop(0, f.hot); gr.addColorStop(0.45, f.light); gr.addColorStop(0.85, f.base); gr.addColorStop(1, f.dark);
      gg.beginPath(); gg.arc(ix, iy, ir, 0, TAU); gg.fillStyle = gr; gg.fill();
      gg.strokeStyle = tk.rgba(f.dark, 0.9); gg.lineWidth = S.T(1.5); gg.stroke();
      if (S.d) for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; gg.beginPath(); gg.moveTo(ix + cos(a) * 7, iy + sin(a) * 7); gg.lineTo(ix + cos(a) * 15, iy + sin(a) * 15); gg.strokeStyle = tk.rgba(f.dark, 0.32); gg.lineWidth = S.T(0.9); gg.stroke(); }
      gg.fillStyle = INK; gg.beginPath();
      if (V === 1) { gg.arc(ix, iy, 6.4, 0, TAU); gg.fill(); gg.beginPath(); gg.arc(ix, iy, 11, 0, TAU); gg.strokeStyle = tk.rgba(INK, 0.7); gg.lineWidth = S.T(1.2); gg.stroke(); if (S.d) for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.3; gg.beginPath(); gg.arc(ix + cos(a) * 13.6, iy + sin(a) * 13.6, 1.3, 0, TAU); gg.fillStyle = INK; gg.fill(); } }
      else if (V === 2) { const st = starPts(ix, iy, 4, 3.4, 13, 0); gg.moveTo(st[0][0], st[0][1]); st.slice(1).forEach((p) => gg.lineTo(p[0], p[1])); gg.closePath(); gg.fill(); }
      else { gg.ellipse(ix, iy, 4.6, 12, 0, 0, TAU); gg.fill(); }
      gg.beginPath(); gg.ellipse(ix + 7, iy - 8, 4.4, 3.2, -0.6, 0, TAU); gg.fillStyle = '#ffffff'; gg.fill();
      gg.beginPath(); gg.arc(ix - 8, iy + 8, 1.9, 0, TAU); gg.fill();
      gg.fillStyle = tk.rgba(INK, 0.32); gg.beginPath(); gg.moveTo(-44, -30); gg.lineTo(44, -30); gg.lineTo(44, -6); gg.quadraticCurveTo(0, -30, -44, -6); gg.closePath(); gg.fill();
    } });
    S.line(upper.concat([[46, -6], [52, -12]]), { w: 4.6, taperStart: 0.06, taperEnd: 0.14, pressure: (u) => 0.5 + 0.7 * sin(PI * clamp(u * 1.05, 0, 1)) * 0.8 + 0.2, wobble: 0.03 });
    S.line(lower, { w: 2, taper: 0.3, alpha: 0.9, wobble: 0.03 });
    if (S.d) { S.line([[-30, -26], [-8, -36], [16, -36], [38, -26]], { w: 2.6, taper: 0.4, alpha: 0.85, wobble: 0.05 }); for (let i = 0; i < 4; i++) S.ink([[10 + i * 9, -22 - i * 1.2], [14 + i * 10, -30 - i * 1.6]], { w: 1.2, color: INK, taper: 0.6 }); }
    g.restore();
    S.spark(30, -30, S.d ? 6 : 5, { color: '#ffffff' });
  };

  M.mask = (S) => {
    const { g, f } = S, R = S.rng('mk'), V = S.variant(3);
    S.glow(0, 0, 58, f.glow, 0.24);
    const sw = S.wave(2.4, 0) * 3;
    tk.ribbon(g, [[-19, 0], [-34, 4 + sw], [-46, 2], [-52, 14 + sw]], f.base, { wMax: 6, w0: 5, w1: 1.5, gloss: false, strands: 0, line: S.L(1.7), rim: f.glow, rimW: S.L(0.7), shadowW: 0.5 });
    tk.ribbon(g, [[19, 0], [34, 4 - sw], [46, 2], [52, 14 - sw]], f.base, { wMax: 6, w0: 5, w1: 1.5, gloss: false, strands: 0, line: S.L(1.7), rim: f.glow, rimW: S.L(0.7), shadowW: 0.5 });
    if (V === 0) {
      S.cel([[-24, -6, 1], [-22, -30], [-8, -42], [10, -42], [24, -30], [24, -6, 1], [14, -22], [0, -28], [-14, -22]], '#2a2244', { line: S.L(2.4), shadow: INK, depth: 4, rim: f.glow, rimW: S.L(1), hi: false });
    } else if (V === 1) {
      [-1, 1].forEach((sd) => S.cel({ poly: [[sd * 10, -30], [sd * 20, -50], [sd * 26, -26]] }, pal.gold2, { line: S.L(2.4), shadow: pal.gold, shadowT: 0, depth: 3, rim: '#fff2c8', rimW: S.L(0.9), hi: false, tension: 0.5 }));
      S.cel([[-24, -6, 1], [-22, -30], [-8, -40], [10, -40], [24, -30], [24, -6, 1], [12, -22], [0, -26], [-14, -22]], '#2a2244', { line: S.L(2.4), shadow: INK, depth: 4, rim: f.glow, rimW: S.L(1), hi: false });
    } else {
      [-1, 1].forEach((sd) => { S.cel({ poly: [[sd * 24, -22], [sd * 30, -50], [sd * 8, -34]] }, '#fff8f0', { line: S.L(2.6), shadow: '#d8cdb8', depth: 4, rim: f.glow, rimW: S.L(1), hi: false, tension: 0.4 }); S.cel({ poly: [[sd * 23, -28], [sd * 27, -44], [sd * 13, -33]] }, f.base, { line: false, shadow: false, hi: false, rim: false, tension: 0.4 }); });
    }
    const faceCol = V === 1 ? f.light : '#fff8f0', faceSh = V === 1 ? f.base : '#d8cdb8';
    const face = V === 2 ? [[0, -32, 1], [14, -26], [22, -8], [16, 12], [8, 24], [0, 40, 1], [-8, 24], [-16, 12], [-22, -8], [-14, -26]] : [[0, -36, 1], [17, -30], [22, -10], [19, 12], [10, 28], [0, 34, 1], [-10, 28], [-19, 12], [-22, -10], [-17, -30]];
    S.cel(face, faceCol, { line: S.L(2.8), shadow: faceSh, shadowT: 0, depth: 8, rim: f.glow, rimW: S.L(1.4), hi: '#ffffff', hiW: S.L(2.2), halftone: S.ht(3.6, 0.25),
      decor: (gg) => {
        gg.strokeStyle = V === 1 ? f.dark : f.base; gg.lineWidth = S.T(2.4); gg.lineCap = 'round';
        [[[-16, -2], [-20, -14], [-15, -26]], [[16, -2], [20, -14], [15, -26]]].forEach((c) => { gg.beginPath(); gg.moveTo(c[0][0], c[0][1]); gg.quadraticCurveTo(c[1][0], c[1][1], c[2][0], c[2][1]); gg.stroke(); });
        gg.lineWidth = S.T(1.6); [[[-12, 12], [-17, 4]], [[12, 12], [17, 4]]].forEach((c) => { gg.beginPath(); gg.moveTo(c[0][0], c[0][1]); gg.lineTo(c[1][0], c[1][1]); gg.stroke(); });
        if (V === 2) { gg.lineWidth = S.T(2); [[-6, 14, -20, 20], [6, 14, 20, 20], [-4, 20, -18, 30], [4, 20, 18, 30]].forEach((c) => { gg.beginPath(); gg.moveTo(c[0], c[1]); gg.lineTo(c[2], c[3]); gg.stroke(); }); }
      } });
    if (V === 1) {
      // hannya: brows knitted, gold glaring eyes, a wide fanged mouth
      S.ink([[-17, -14], [-8, -20], [-2, -12]], { w: 3.4, taper: 0.3 }); S.ink([[17, -14], [8, -20], [2, -12]], { w: 3.4, taper: 0.3 });
      [-1, 1].forEach((sd) => { S.circle(sd * 9.5, -5, 5, pal.gold2); S.ring(sd * 9.5, -5, 5, 1.3, INK, 0.95); S.circle(sd * 9.5, -5, 2, INK); });
      S.cel([[-12, 18, 1], [0, 15], [12, 18, 1], [8, 28], [0, 30], [-8, 28]], '#3a0d1e', { line: S.L(1.8), shadow: false, hi: false, rim: false, tension: 0.5 });
      [-8, 8].forEach((x) => S.cel({ poly: [[x - 2, 17], [x + 2, 17], [x, 25]] }, '#ffffff', { line: S.L(1), shadow: false, hi: false, rim: false, tension: 0.2 }));
    } else {
      S.ink([[-15, -16], [-9, -20], [-3, -18]], { w: 2.8, taper: 0.35 }); S.ink([[15, -16], [9, -20], [3, -18]], { w: 2.8, taper: 0.35 });
      S.ink([[-16, -6], [-10, -3], [-3, -5]], { w: 3.4, taper: 0.28 }); S.ink([[16, -6], [10, -3], [3, -5]], { w: 3.4, taper: 0.28 });
      S.ink([[0, 0], [1.4, 8], [-0.4, 13]], { w: 1.4, taper: 0.4, alpha: 0.8 });
      S.cel([[-5, 21, 1], [0, 19.5], [5, 21, 1], [0, 24.5]], '#d83a4a', { line: S.L(1.4), shadow: '#a0243a', depth: 1, hi: false, rim: false });
      S.circle(0, -30, 1.8, f.base);
    }
    S.spark(-14, -30, S.d ? 6 : 5, { color: '#ffffff' });
  };


  // ---- lettering-ish helpers: pretend calligraphy from short brush strokes ----
  // a column of fake characters inside the box (x, y, w, h): each cell gets 3 to 5 seeded strokes
  function glyphs(S, x, y, w, h, n, rr, col, lw, alpha) {
    const ch = h / n;
    for (let i = 0; i < n; i++) {
      const y0 = y + i * ch + ch * 0.12, hh = ch * 0.74, k = 3 + floor(rr() * 3);
      for (let j = 0; j < k; j++) {
        const kind = floor(rr() * 4);
        let a, b;
        if (kind === 0) { a = [x + w * 0.05, y0 + hh * (0.15 + 0.7 * rr())]; b = [x + w * 0.95, a[1] + (rr() - 0.5) * hh * 0.1]; }
        else if (kind === 1) { a = [x + w * (0.2 + 0.6 * rr()), y0]; b = [a[0] + (rr() - 0.5) * w * 0.15, y0 + hh]; }
        else if (kind === 2) { a = [x + w * (0.4 + 0.5 * rr()), y0 + hh * 0.05]; b = [x + w * (0.05 + 0.3 * rr()), y0 + hh * (0.6 + 0.4 * rr())]; }
        else { a = [x + w * (0.2 + 0.3 * rr()), y0 + hh * (0.3 + 0.3 * rr())]; b = [x + w * (0.6 + 0.35 * rr()), y0 + hh * (0.7 + 0.3 * rr())]; }
        S.ink([a, [(a[0] + b[0]) / 2 + (rr() - 0.5) * 2, (a[1] + b[1]) / 2 + (rr() - 0.5) * 2], b], { w: lw, color: col, alpha: alpha === undefined ? 1 : alpha, taper: 0.3, wobble: 0.05 });
      }
    }
  }
  M._glyphs = glyphs;

  M.shield = (S) => {
    const { g, f } = S, R = S.rng('sh'), V = S.variant(3);
    S.glow(0, 0, 60, f.glow, 0.3 + 0.08 * S.pulse(2.6));
    const kite = [[-33, -38, 1], [0, -44], [33, -38, 1], [34, -8], [24, 20], [0, 46, 1], [-24, 20], [-34, -8]];
    const crestAt = (cx, cy, kind, sc) => S.at(cx, cy, 0, sc, sc, () => {
      if (kind === 0) { S.cel(tk.ellipsePts(0, 0, 15, 15, 16), pal.paper, { line: S.L(2), shadow: pal.paper2, depth: 4, hi: false, rim: false }); for (let i = 0; i < 5; i++) S.at(0, 0, i * TAU / 5, 1, 1, () => S.cel(petalPts(10.5, 8.6, 0.12), f.dark, { line: S.L(1.3), shadow: f.dim, depth: 2, hi: false, rim: false })); S.circle(0, 0, 2.4, pal.gold); }
      else if (kind === 1) { S.cel(tk.ellipsePts(0, 0, 15, 15, 16), pal.paper, { line: S.L(2), shadow: pal.paper2, depth: 4, hi: false, rim: false }); for (let i = 0; i < 3; i++) S.at(0, 0, i * TAU / 3, 1, 1, () => { const sh = [[0, -13, 1], [8, -11], [10, -4], [5, 0], [2, -3], [5, -6], [0, -8]]; S.fill(sh, f.dark); S.ink(sh.concat([sh[0]]), { w: 1, color: INK, alpha: 0.8, taper: 0.1, wobble: 0 }); }); }
      else { S.cel(tk.ellipsePts(0, 0, 15, 15, 16), f.dark, { line: S.L(2), shadow: f.dim, depth: 4, hi: false, rim: pal.gold, rimW: S.L(0.9) }); const cr = crescent([-8, -10], [-8, 10], 9, 3, 10); S.cel(cr, pal.gold2, { line: S.L(1.4), shadow: pal.gold, depth: 2, hi: false, rim: false }); S.spark(7, -2, 5, { color: pal.gold2, glow: 0 }); }
    });
    if (V === 1) {
      S.cel(tk.ellipsePts(0, 0, 42, 42, 28), pal.gold, { line: S.L(3.2), shadow: '#a8782a', shadowT: 0, depth: 7, rim: pal.gold2, rimW: S.L(1.6), hi: pal.gold2, hiW: S.L(2.4) });
      S.cel(tk.ellipsePts(0, 0, 35, 35, 26), f.base, { line: S.L(2), shadow: f.shade, shadowT: 0, depth: 10, rim: f.hot, rimW: S.L(1.4), hi: f.light, hiW: S.L(2.4), halftone: S.ht(3.8, 0.32),
        decor: (gg) => { gg.fillStyle = f.light; gg.beginPath(); gg.rect(-40, -40, 40, 80); gg.fill(); for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; gg.beginPath(); gg.arc(cos(a) * 29, sin(a) * 29, 1.7, 0, TAU); gg.fillStyle = pal.gold2; gg.fill(); } } });
      crestAt(0, 0, 1, 1.5);
    } else {
      S.cel(kite, pal.gold, { line: S.L(3.2), shadow: '#a8782a', shadowT: 0, depth: 6, rim: pal.gold2, rimW: S.L(1.6), hi: pal.gold2, hiW: S.L(2.4) });
      S.cel(tk.xf(kite, { s: 0.83, cy: 0, dy: 1 }), f.base, { line: S.L(2), shadow: f.shade, shadowT: 0, depth: 9, rim: f.hot, rimW: S.L(1.4), hi: f.light, hiW: S.L(2.4), halftone: S.ht(3.8, 0.32),
        decor: (gg) => { gg.fillStyle = f.light; gg.beginPath(); gg.rect(-40, -50, 40, 100); gg.fill(); gg.fillStyle = tk.rgba('#ffffff', 0.4); gg.beginPath(); gg.moveTo(-30, -40); gg.lineTo(-14, -40); gg.lineTo(-30, 8); gg.closePath(); gg.fill(); } });
      crestAt(0, -6, V === 2 ? 2 : 0, 1);
      if (S.d) [[-24, -30], [24, -30], [-16, 20], [16, 20]].forEach((p) => { S.circle(p[0], p[1], 2.2, pal.gold2); S.ring(p[0], p[1], 2.2, 0.9, INK, 0.9); });
    }
    S.ring(30, -30, 9 + 2 * S.pulse(1.4), 1.6, f.hot, 0.8); S.ring(30, -30, 16 + 3 * S.pulse(1.4), 1.2, f.glow, 0.5);
    S.spark(30, -30, S.d ? 9 : 7, { color: '#ffffff', glow: 0.8 });
  };

  M.barrier = (S) => {
    const { g, f } = S, R = S.rng('ba');
    const P = S.pulse(2.4);
    S.glow(0, 4, 60, f.glow, 0.34);
    // ground disc
    S.fill(tk.ellipsePts(0, 32, 46, 9, 20), f.glow, 0.4); S.dash(0, 32, 46, 9, 1.4, f.hot, 0.8, [5, 4], -S.t * 6);
    // the dome
    const dome = []; for (let i = 0; i <= 24; i++) { const a = PI + i / 24 * PI; dome.push([cos(a) * 42, 32 + sin(a) * 68 * 0.94]); }
    S.cel({ poly: dome.concat([[42, 32]]) }, f.glow, { line: false, shadow: f.base, shadowT: 0, depth: 6, rim: false, hi: false,
      decor: (gg) => {
        gg.globalAlpha = 0.55; gg.fillStyle = f.base; gg.fillRect(-50, -40, 100, 90); gg.globalAlpha = 1;
        // hex lattice
        const r = 10, w = Math.sqrt(3) * r;
        gg.strokeStyle = tk.rgba('#ffffff', 0.85); gg.lineWidth = S.T(1.5);
        for (let row = -7; row < 4; row++) for (let col = -5; col < 6; col++) {
          const cx = col * w + (row % 2 ? w / 2 : 0), cy = row * 1.5 * r;
          gg.beginPath(); for (let k = 0; k < 6; k++) { const a = PI / 6 + k * PI / 3; const px = cx + cos(a) * r, py = cy + sin(a) * r; if (k) gg.lineTo(px, py); else gg.moveTo(px, py); } gg.closePath();
          const dd = Math.hypot(cx - 22, cy + 22);
          if (dd < 15 + 8 * P) { gg.fillStyle = tk.rgba('#ffffff', 0.7); gg.fill(); }
          gg.stroke();
        }
      } });
    S.line(dome, { w: 3.2, taper: 0.06, wobble: 0.02, pressure: 'flat', color: INK });
    S.ink(dome.slice(1, -1), { w: 1.6, color: f.hot, taper: 0.05, pressure: 'flat', wobble: 0 });
    // impact ripple
    S.ring(22, -22, 8 + 5 * P, 1.8, '#ffffff', 0.95); S.ring(22, -22, 16 + 6 * P, 1.2, f.hot, 0.55);
    S.spark(22, -22, S.d ? 12 : 9, { color: '#ffffff', glow: 0.9 });
    if (S.d) { S.spark(-22, -8, 5, { color: '#ffffff' }); S.spark(-12, 20, 4, { color: pal.gold2 }); }
  };

  M.talisman = (S) => {
    const { g, f } = S, R = S.rng('ta');
    S.glow(0, 0, 60, f.glow, 0.34 + 0.08 * S.pulse(2.6));
    const slip = (x, y, a, sc, main) => S.at(x, y, a + (S.anim ? S.wave(3, x * 0.01) * 0.03 : 0), sc, sc, () => {
      const body = [[-13, -34, 1], [-13, 34, 1], [0, 30, 1], [13, 34, 1], [13, -34, 1]];
      S.cel({ poly: body }, pal.paper, { line: S.L(2.4), shadow: pal.paper2, shadowT: 0, depth: 5, rim: f.glow, rimW: S.L(1.2), hi: '#ffffff', hiW: S.L(1.6), halftone: S.d && main ? { d: 3.4, alpha: 0.18 } : undefined });
      // red seal and glyph column
      S.circle(0, -24, 5.2, pal.vermilion); S.ring(0, -24, 5.2, 1, INK, 0.85); S.ink([[-2.4, -24], [0, -27], [2.4, -24], [0, -21]], { w: 1.2, color: '#fff8f0', taper: 0.1, wobble: 0 });
      S.ink([[-10.5, -32], [-10.5, 30]], { w: 1.2, color: pal.vermilion, taper: 0.05, pressure: 'flat', wobble: 0 }); S.ink([[10.5, -32], [10.5, 28]], { w: 1.2, color: pal.vermilion, taper: 0.05, pressure: 'flat', wobble: 0 });
      glyphs(S, -7, -14, 14, 42, main ? 4 : 3, S.rng('g' + x), INK, 1.8, 0.92);
    });
    slip(-24, 8, -0.42, 0.86, false); slip(24, 8, 0.42, 0.86, false); slip(0, -2, 0, 1.1, true);
    // paper tails and a few motes
    const sw = S.wave(2, 0) * 3;
    S.ink([[-6, 40], [-10, 46 + sw], [-6, 50]], { w: 2.4, color: pal.paper, taper: 0.4 });
    S.spark(-30, -30, S.d ? 8 : 6, { color: '#ffffff' });
    if (S.d) { S.spark(32, -34, 6, { color: pal.gold2 }); S.spark(0, 42, 5, { color: '#ffffff' }); for (let i = 0; i < 6; i++) S.circle(-40 + R() * 80, -40 + R() * 80, 0.9 + R(), i % 2 ? '#ffffff' : f.hot, 0.85); }
  };

  M.scroll = (S) => {
    const { g, f } = S, R = S.rng('sc');
    S.glow(0, 0, 58, f.glow, 0.26);
    S.at(0, 4, -0.1, 1, 1, () => {
      // sheet: curling top and bottom edges
      const top = bez3([-32, -19], [-14, -25], [14, -14], [32, -21], 10), bot = bez3([32, 21], [14, 27], [-14, 16], [-32, 23], 10);
      const sheet = { poly: top.concat(bot) };
      S.cel(sheet, pal.paper, { line: S.L(2.6), shadow: pal.paper2, shadowT: 0, depth: 8, rim: false, hi: '#ffffff', hiW: S.L(1.8), tension: 0.3,
        decor: (gg) => { gg.fillStyle = tk.rgba(pal.paper2, 0.9); gg.fillRect(-36, -30, 10, 60); gg.fillRect(26, -30, 10, 60); } });
      // rows of notation: dots and short dashes, as a shakuhachi score is written
      for (let i = 0; i < 4; i++) {
        const y = -12 + i * 8.5; let x = -24 + R() * 2;
        while (x < 22) {
          if (R() < 0.45) { S.circle(x + 1.4, y + (R() - 0.5) * 2, 1.7, INK, 0.9); x += 6 + R() * 2; }
          else { const l = 4 + R() * 5; S.ink([[x, y + (R() - 0.5) * 1.6], [x + l, y + (R() - 0.5) * 1.6]], { w: 2, color: INK, taper: 0.3, alpha: 0.9 }); x += l + 3.6; }
        }
      }
      S.ink([[-22, -18], [22, -20]], { w: 2.2, color: pal.vermilion, taper: 0.2 });
      // wooden rollers with gold caps
      [-34, 34].forEach((x, i) => {
        S.cel([[x - 7, -27, 1], [x + 7, -27, 1], [x + 7, 29, 1], [x - 7, 29, 1]], f.dark, { line: S.L(2.2), tension: 0.2, shadow: tk.shade(f.dark), depth: 3, rim: f.glow, rimW: S.L(0.9), hi: false });
        S.cel(tk.ellipsePts(x, -28, 8.6, 3.4, 10), pal.gold, { line: S.L(1.8), shadow: '#a8782a', depth: 1.6, hi: false, rim: false });
        S.cel(tk.ellipsePts(x, 30, 8.6, 3.4, 10), pal.gold, { line: S.L(1.8), shadow: '#a8782a', depth: 1.6, hi: false, rim: false });
      });
      // tie ribbon
      S.ink([[-34, 6], [-40, 22 + S.wave(2.4, 0) * 2], [-38, 38]], { w: 3, color: pal.vermilion, taper: 0.25 });
    });
    S.spark(22, -32, S.d ? 8 : 6, { color: '#ffffff' });
    if (S.d) { S.spark(-30, -36, 5, { color: pal.gold2 }); for (let i = 0; i < 5; i++) S.circle(-30 + R() * 60, -46 + R() * 10 - (S.anim ? (S.t * 6 + i * 3) % 10 : 0), 1 + R(), f.hot, 0.85); }
  };

  M.book = (S) => {
    // Biwa: a pear-shaped lute (dark body, crescent sound holes), a bent neck with four pegs, four strings and a bachi plectrum; notes rise from it
    const { g, f } = S, R = S.rng('bk');
    S.glow(0, -4, 58, f.glow, 0.32 + 0.08 * S.pulse(2.6));
    S.at(-4, 6, 0.62, 1, 1, () => {
      // neck, then the backward-bent peg box
      S.cel([[-4, 4, 1], [4, 4, 1], [3.6, -46, 1], [-3.6, -46, 1]], '#a8743c', { line: S.L(2), tension: 0.1, shadow: '#7a4a1c', depth: 2, rim: f.glow, rimW: S.L(0.9), hi: false });
      S.cel([[-3.8, -44, 1], [3.8, -44, 1], [2, -53], [-9, -64, 1], [-14, -60, 1], [-5.5, -50]], f.dark, { line: S.L(2), tension: 0.2, shadow: tk.shade(f.dark), depth: 2, rim: f.glow, rimW: S.L(0.9), hi: false });
      // pegs
      [[-6, -49, -1], [-9.4, -54, -1], [4.6, -47, 1], [2.4, -52, 1]].forEach((p, i) => { S.ink([[p[0], p[1]], [p[0] + p[2] * 4.2, p[1] + 1.4]], { w: 3, color: pal.gold, taper: 0.1, pressure: 'flat', wobble: 0 }); });
      // the pear body
      const body = [[-6, 0, 1], [-11, 8], [-18, 18], [-24, 30], [-22, 41], [-12, 49], [0, 51], [12, 49], [22, 41], [24, 30], [18, 18], [11, 8], [6, 0, 1]];
      S.cel({ poly: body }, f.dark, { line: S.L(2.6), tension: 0.32, shadow: tk.shade(f.dark), depth: 5, rim: f.glow, rimW: S.L(1.3), hi: false, halftone: S.ht(3.6, 0.28) });
      S.cel({ poly: [[-5, 6, 1], [-9, 13], [-15, 22], [-19, 31], [-17, 40], [-9, 46], [0, 47.5], [9, 46], [17, 40], [19, 31], [15, 22], [9, 13], [5, 6, 1]] }, f.mid, { line: S.L(1.4), tension: 0.32, shadow: false, hi: false, rim: false });
      // crescent sound holes
      [-1, 1].forEach((sd) => {
        const c = crescent([sd * 15, 20], [sd * 12, 36], sd * 5, sd * 1.2, 10);
        S.cel({ poly: c.poly }, INK, { line: S.L(1.1), lineColor: f.hot, shadow: false, hi: false, rim: false });
      });
      // bridge and four strings
      S.cel([[-9, 41, 1], [9, 41, 1], [8, 44, 1], [-8, 44, 1]], pal.gold, { line: S.L(1.3), shadow: '#a8782a', depth: 1, hi: false, rim: false });
      for (let i = 0; i < 4; i++) { const k = i - 1.5; S.ink([[k * 2.2, -46], [k * 4.8, 42]], { w: 0.95, color: f.pale, taper: 0, pressure: 'flat', wobble: S.anim && i === 1 ? 0.02 : 0, alpha: 0.95 }); }
      // the bachi plectrum resting across the strings
      S.at(11, 27, -0.5, 0.62, 0.62, () => S.cel({ poly: [[-3, -10, 1], [3, -10, 1], [14, 4], [9, 13], [0, 15], [-9, 13], [-14, 4]] }, '#e8cf94', { line: S.L(1.6), tension: 0.3, shadow: '#b09a68', depth: 1.8, rim: false, hi: false }));
    });
    // notes rising from the sound holes
    const rise = S.anim ? (S.t * 10) % 14 : 0;
    for (let i = 0; i < (S.d ? 4 : 3); i++) {
      const x = -34 + i * 9 + R() * 3, y = -14 - i * 7 - (rise * (0.3 + i * 0.1)) % 14;
      tk.note(g, x, y, S.d ? 6 : 7, { kind: i % 2 ? 'eighth' : 'quarter', color: f.hot, alpha: 0.95, line: S.L(1.2), rot: -0.1 + i * 0.06 });
    }
    S.spark(-30, -34, S.d ? 8 : 6, { color: '#ffffff' });
    if (S.d) S.spark(36, -32, 5, { color: pal.gold2 });
  };

  M.quill = (S) => {
    // Tuning Fork: a struck silver fork angled like the old quill, three vibration arcs either side of the tines, a wavy sound line under it
    const { g, f } = S, R = S.rng('qu');
    S.glow(6, -8, 56, f.glow, 0.22);
    // the wavy sound line (the old flourish)
    const wv = []; for (let i = 0; i <= 24; i++) { const x = -42 + i * 3.4, e = sin(PI * i / 24); wv.push([x, 35 + sin(i * 0.9 + (S.anim ? S.t * 3 : 0)) * 4.2 * (0.35 + 0.65 * e)]); }
    S.line(wv, { w: 4, color: INK, taper: 0.3, wobble: 0.05, pressure: 'mid' });
    S.ink(wv.slice(1, -1), { w: 1.4, color: f.hot, taper: 0.3, alpha: 0.75, wobble: 0 });
    S.at(-24, 28, 0.86, 1, 1, () => {
      const st = '#e4ecf8', sd = '#8a96c0';
      // vibration arcs: three either side of the tines, fading outward, trembling when animated
      [0, 1, 2].forEach((i) => {
        const r = 15 + i * 8 + S.wave(0.5, i * 0.2) * 0.8, a = 0.9 - i * 0.2;
        [PI, 0].forEach((c) => { g.beginPath(); g.arc(0, -63, r, c - 0.55, c + 0.55); g.strokeStyle = tk.rgba(f.hot, a); g.lineWidth = S.T(2.2 - i * 0.3); g.lineCap = 'round'; g.stroke(); });
      });
      // handle stem with a ball foot, the U bend and the two tines
      S.cel([[-2.8, 2, 1], [2.8, 2, 1], [2.4, -30, 1], [-2.4, -30, 1]], st, { line: S.L(1.9), tension: 0.1, shadow: sd, depth: 1.8, rim: f.hot, rimW: S.L(0.9), hi: S.d ? '#ffffff' : undefined, hiW: S.L(1.2) });
      S.cel(tk.ellipsePts(0, 4, 4.4, 4.4, 10), st, { line: S.L(1.8), shadow: sd, depth: 1.4, hi: false, rim: false });
      const fork = [[-2.6, -30, 1], [-2.6, -36], [-9, -40], [-9.4, -78, 1], [-4.4, -78, 1], [-4.2, -46], [0, -42], [4.2, -46], [4.4, -78, 1], [9.4, -78, 1], [9, -40], [2.6, -36], [2.6, -30, 1]];
      S.cel(fork, st, { line: S.L(2.1), tension: 0.18, shadow: sd, shadowT: 0.1, depth: 3, rim: f.hot, rimW: S.L(1), hi: S.d ? '#ffffff' : undefined, hiW: S.L(1.4) });
      S.ink([[-7, -48], [-7, -74]], { w: 1, color: '#ffffff', taper: 0.3, wobble: 0, alpha: 0.9 });
      S.ink([[7, -48], [7, -74]], { w: 1, color: '#ffffff', taper: 0.3, wobble: 0, alpha: 0.7 });
      S.ink([[0, 0], [0, -34]], { w: 0.9, color: sd, taper: 0.3, wobble: 0, alpha: 0.7 });
    });
    S.circle(-38, 42, 1.8, INK); S.circle(-30, 44, 1.3, INK);
    S.spark(33, -24, S.d ? 9 : 7, { color: '#ffffff' });
    if (S.d) S.spark(-10, -30, 5, { color: pal.gold2 });
  };

  M.calligraphy = (S) => {
    // Crescendo: a big hairpin opening to the right, three beamed notes bursting out of its open end, a gold mitsudomoe (taiko crest)
    const { g, f } = S, R = S.rng('ca');
    S.glow(0, 0, 58, f.glow, 0.32);
    S.circle(0, 0, 40, pal.paper, 0.32);
    const st = (pts, w, o) => { S.ink(pts, { w: w + 4, color: f.glow, alpha: 0.55, taper: 0.06, wobble: 0.02 }); S.ink(pts, Object.assign({ w, color: INK, taper: 0.08, wobble: 0.04, pressure: (u) => 0.12 + 0.88 * Math.pow(clamp(u, 0, 1), 0.8) }, o)); };
    const open = S.pulse(2.4) * 1.6;
    st([[-36, 0], [-4, -14 - open * 0.3], [30, -30 - open]], 8.6, { taperStart: 0.02, taperEnd: 0.12 });
    st([[-36, 0], [-4, 14 + open * 0.3], [30, 30 + open]], 8.6, { taperStart: 0.02, taperEnd: 0.12 });
    // three beamed notes bursting out of the open end, growing as they go
    [[10, 2, 6.2, -0.1], [25, -2, 7.6, 0.08], [39, 3, 9, -0.06]].forEach((n, i) => {
      const bob = S.wave(1.8, i * 0.22) * 1.3;
      tk.note(g, n[0], n[1] + bob, n[2], { kind: 'beamed', color: INK, rot: n[3], line: S.L(1.5) });
    });
    // sound dots
    for (let i = 0; i < 9; i++) S.circle(-40 + R() * 80, -40 + R() * 80, 0.8 + R() * 1.5, INK, 0.8);
    // the seal: a gold mitsudomoe, three commas chasing each other in a circle
    S.at(-26, 31, 0, 1, 1, () => {
      S.cel(tk.ellipsePts(0, 0, 10, 10, 14), pal.gold, { line: S.L(1.6), shadow: '#a8782a', depth: 1.8, hi: false, rim: false });
      for (let k = 0; k < 3; k++) {
        const a = k * TAU / 3 - PI / 2;
        S.circle(cos(a) * 5, sin(a) * 5, 2.5, INK);
        const tail = []; for (let i = 0; i <= 8; i++) tail.push(polar(0, 0, 5.2 - i * 0.12, a + i * 0.2));
        S.ink(tail, { w: 3.4, color: INK, taperStart: 0, taperEnd: 1, pressure: 'flat', wobble: 0 });
      }
    });
    S.spark(-34, -34, S.d ? 7 : 5, { color: '#ffffff' });
  };

  M.brush_stroke = (S) => {
    // Melody Ribbon: a fat ribbon of sound (colour with an ink edge), five notes riding it, ending at a flute mouthpiece
    const { g, f } = S, R = S.rng('bs');
    S.glow(0, 0, 58, f.glow, 0.26);
    const path = bez3([-44, 30], [-40, -30], [12, 40], [40, -22], 32);
    S.ink(path, { w: 32, color: f.glow, alpha: 0.35, taper: 0.06, wobble: 0.03 });
    const prs = (u) => 0.55 + 0.45 * sin(PI * clamp(u, 0, 1));
    S.ink(path, { w: 25, color: INK, taperStart: 0.02, taperEnd: 0.35, pressure: prs, wobble: 0.08, freq: 0.05 });
    S.ink(path, { w: 19, color: f.base, taperStart: 0.04, taperEnd: 0.4, pressure: prs, wobble: 0.08, freq: 0.05 });
    const nb = S.d ? 6 : 3;
    for (let i = 0; i < nb; i++) { const off = (i / (nb - 1) - 0.5) * 12; const pts = path.map((p, k) => { const q = polyAt(path, k / (path.length - 1)); return [p[0] - q.ty * off, p[1] + q.tx * off]; }).slice(3 + (i % 3) * 2, 26 + (i % 2) * 4); S.ink(pts, { w: 0.9, color: i % 2 ? f.light : '#ffffff', alpha: 0.55, taper: 0.4, wobble: 0.05 }); }
    S.ink(path.slice(6, 24), { w: 2, color: f.hot, alpha: 0.7, taper: 0.4, wobble: 0.03 });
    // five notes riding the ribbon, bobbing a little when animated
    [0.1, 0.28, 0.47, 0.66, 0.84].forEach((u, i) => {
      const q = polyAt(path, u), bob = S.wave(2.2, i * 0.18) * 1.4;
      tk.note(g, q.x - 1, q.y + 1 + bob, S.d ? 6.4 : 7.4, { kind: i % 2 ? 'quarter' : 'eighth', color: INK, line: S.L(1.3), alpha: 0.95 });
      tk.note(g, q.x - 1.8, q.y + 0.4 + bob, S.d ? 5.2 : 6.2, { kind: i % 2 ? 'quarter' : 'eighth', color: '#ffffff', line: S.L(1), alpha: 0.95 });
    });
    // the flute mouthpiece finishing the ribbon: a bamboo tube with an angled cut and a horn inlay
    S.at(36, -18, -0.62, 1, 1, () => {
      S.cel([[-5, 0, 1], [5.2, -7, 1], [5.4, 34, 1], [-5.4, 34, 1]], '#a8743c', { line: S.L(1.9), tension: 0.1, shadow: '#7a4a1c', depth: 2.2, hi: false, rim: f.glow, rimW: S.L(0.8) });
      S.ink([[-5.4, 15], [5.5, 15]], { w: 1.8, color: '#7a4a1c', taper: 0, pressure: 'flat', wobble: 0 });
      S.ink([[-5.4, 26], [5.5, 26]], { w: 1.8, color: '#7a4a1c', taper: 0, pressure: 'flat', wobble: 0 });
      S.cel([[-5, 0, 1], [5.2, -7, 1], [5.2, -2, 1], [-5, 6, 1]], '#f2ead8', { line: S.L(1.4), shadow: false, hi: false, rim: false, tension: 0 });
      S.circle(0, 21, 1.6, f.glow, 0.95);
      S.circle(0, 31, 1.6, f.glow, 0.95);
    });
    for (let i = 0; i < 8; i++) S.circle(-38 + R() * 70, -30 + R() * 66, 0.8 + R() * 1.5, INK, 0.85);
    S.spark(-30, -8, S.d ? 6 : 5, { color: '#ffffff' });
  };

  M.ink_splash = (S) => {
    // Beat Burst: a dark core with a jagged waveform rim, three sound rings and tapered spikes; note heads orbit as satellites
    const { g, f } = S, R = S.rng('is');
    const P = S.pulse(2.6);
    S.glow(0, 0, 56, f.glow, 0.2 + 0.06 * P);
    // three concentric sound rings, pulsing outward when animated
    [[34, 0.7], [42, 0.45], [50, 0.25]].forEach((rg, i) => S.ring(0, 0, rg[0] + S.wave(2.4, i * 0.16) * 1.6, 2.6 - i * 0.5, f.base, rg[1]));
    // the waveform rim: 22 points alternating r 21 and 30
    const n = 22, pts = [];
    for (let i = 0; i < n; i++) { const a = i / n * TAU, r = (i % 2 ? 21 : 30) * (0.94 + R() * 0.12); pts.push([cos(a) * r, sin(a) * r, 1]); }
    S.fill({ poly: pts.map((p) => [p[0] * 1.1, p[1] * 1.1]) }, f.base, 0.5);
    S.cel({ poly: pts }, INK, { line: false, shadow: false, hi: false, rim: f.base, rimW: S.L(2), rimAlpha: 0.9, rimSide: 'shadow' });
    S.circle(0, 0, 20, INK);
    S.ring(0, 0, 13, 1.4, f.hot, 0.55 + 0.25 * P);
    // six short tapered sound spikes between the rings
    for (let i = 0; i < 6; i++) {
      const a = 0.3 + i * TAU / 6 + (R() - 0.5) * 0.12, r0 = 31, r1 = 40 + R() * 7 + P * 1.5;
      S.ink([[cos(a) * r0, sin(a) * r0], [cos(a) * r1, sin(a) * r1]], { w: 4.2, color: i % 2 ? f.glow : INK, taperStart: 0.02, taperEnd: 0.85, pressure: 'flat', wobble: 0 });
    }
    // satellites: small note heads with a short stem
    const ns = S.d ? 4 : 3;
    for (let i = 0; i < ns; i++) { const a = 1.0 + i * (TAU / ns) + R() * 0.3, r = 38 + R() * 6; tk.note(g, cos(a) * r, sin(a) * r, S.d ? 6.5 : 7.5, { kind: i % 2 ? 'quarter' : 'eighth', color: INK, rot: (R() - 0.5) * 0.5, line: S.L(1.2) }); }
    // gloss on the core and a coloured sheen
    S.ink(bez2([-14, -10], [-8, -18], [2, -18], 6), { w: 3.4, color: '#ffffff', alpha: 0.85, taper: 0.4, wobble: 0.03 });
    S.ink(bez2([8, 10], [14, 6], [16, 0], 5), { w: 2, color: f.light, alpha: 0.85, taper: 0.4, wobble: 0.03 });
    S.circle(-16, -4, 1.8, '#ffffff', 0.9);
    if (S.d) for (let i = 0; i < 12; i++) S.circle(-46 + R() * 92, -42 + R() * 84, 0.7 + R() * 1.3, R() < 0.3 ? f.base : INK, 0.85);
  };

  M.ink_wave = (S) => {
    // Sound Wave: the great crest, striated with five sine lines of sound; the spray is note heads and dots
    const { g, f } = S, R = S.rng('iw');
    S.glow(0, 0, 58, f.glow, 0.2);
    const sw = S.wave(3, 0) * 2;
    const swellTop = bez3([-48, 14], [-30, -6 + sw], [-10, 4], [12, 10], 10).concat(bez3([12, 10], [30, 14], [42, 4], [50, 10], 8).slice(1));
    const swell = swellTop.concat(bez3([50, 10], [52, 40], [24, 52], [0, 52], 8).slice(1), bez3([0, 52], [-24, 52], [-52, 40], [-48, 14], 8).slice(1));
    S.cel({ poly: swell }, f.base, { line: S.L(2.2), shadow: f.shade, depth: 6, rim: f.hot, rimW: S.L(1.2), hi: false });
    const ph = S.anim ? S.t * 2.2 : 0;
    const crest = [[-48, 40, 1], [-40, 16], [-24, -6], [-4, -28], [18, -42], [38, -40], [46, -26], [40, -14], [30, -18], [22, -12], [14, -22], [10, -6], [12, 14], [24, 34], [44, 44, 1], [10, 50, 1], [-24, 50, 1]];
    S.cel(crest, f.dim, { line: S.L(3), shadow: INK, shadowT: 0, depth: 9, rim: f.glow, rimW: S.L(1.6), hi: false, halftone: S.ht(3.6, 0.4),
      decor: (gg) => {
        // five parallel sine striations following the crest
        gg.strokeStyle = tk.rgba(f.hot, 0.8); gg.lineWidth = S.T(1.2); gg.lineCap = 'round';
        for (let i = 0; i < 5; i++) {
          const p0 = [-40 + i * 4.4, 34 - i * 5], c = [-4 + i * 4, -6 - i * 2.4], p1 = [22 - i * 5, -20 + i * 3.2];
          gg.beginPath();
          for (let k = 0; k <= 22; k++) {
            const u = k / 22, v = 1 - u, bx = v * v * p0[0] + 2 * v * u * c[0] + u * u * p1[0], by = v * v * p0[1] + 2 * v * u * c[1] + u * u * p1[1];
            const tx = 2 * v * (c[0] - p0[0]) + 2 * u * (p1[0] - c[0]), ty = 2 * v * (c[1] - p0[1]) + 2 * u * (p1[1] - c[1]), tl = Math.hypot(tx, ty) || 1;
            const off = sin(u * TAU * 2.5 + i * 0.9 - ph) * 1.7;
            const x = bx - ty / tl * off, y = by + tx / tl * off;
            if (k) gg.lineTo(x, y); else gg.moveTo(x, y);
          }
          gg.stroke();
        }
      } });
    S.ink([[-22, -8], [-4, -28], [18, -42], [38, -40], [46, -26]], { w: 5, color: '#ffffff', taper: 0.25, wobble: 0.08 });
    // the spray: small note heads and dots
    [[46, -26], [40, -14], [30, -18]].forEach((p, i) => tk.note(g, p[0] + 2, p[1] - 4 - i * 2, S.d ? 6.5 : 7.5, { kind: i === 1 ? 'quarter' : 'eighth', color: '#ffffff', rot: -0.2 + i * 0.25, line: S.L(1.2) }));
    for (let i = 0; i < (S.d ? 14 : 6); i++) { const a = R() * TAU, r = R() * 12; S.circle(30 + cos(a) * (r + 14), -30 + sin(a) * (r + 12), 0.9 + R() * 2, '#ffffff', 0.9); }
    for (let i = 0; i < 5; i++) S.ink([[-40 + i * 19, 38 + (i % 2) * 3], [-30 + i * 19, 35 + (i % 2) * 3], [-20 + i * 19, 38 + (i % 2) * 3]], { w: 2, color: f.hot, taper: 0.4, alpha: 0.8 });
  };

  M.wave = (S) => {
    const { g, f } = S, R = S.rng('wa');
    S.glow(0, 0, 58, f.glow, 0.22);
    // seigaiha medallion: rows of overlapping scale arcs, topped with a curling wave line
    const disc = tk.ellipsePts(0, 0, 40, 40, 26);
    S.cel(disc, f.light, { line: S.L(3), shadow: f.base, shadowT: 0, depth: 8, rim: f.hot, rimW: S.L(1.6), hi: false,
      decor: (gg) => {
        const r = 13;
        for (let row = 3; row >= -1; row--) for (let col = -4; col <= 4; col++) {
          const cx = col * r * 2 + (row % 2 ? r : 0), cy = row * r * 0.55 + 6;
          for (let k = 3; k >= 1; k--) {
            gg.beginPath(); gg.arc(cx, cy, r * k / 3, PI, TAU); gg.closePath();
            gg.fillStyle = k % 2 ? tk.rgba('#ffffff', row % 2 ? 0.55 : 0.75) : (row % 2 ? f.base : f.mid); gg.fill();
            gg.strokeStyle = tk.rgba(INK, 0.55); gg.lineWidth = S.T(0.9); gg.stroke();
          }
        }
        // sun disc reflecting on the sky part
        gg.fillStyle = tk.rgba('#ffffff', 0.9); gg.beginPath(); gg.arc(14, -18, 9, 0, TAU); gg.fill();
      } });
    // a bold curling wave crest across the top of the medallion
    const cr = [[-46, -4], [-30, -22], [-8, -34], [14, -30], [22, -18], [14, -10], [6, -16]];
    S.line(cr, { w: 6, color: INK, taperStart: 0.1, taperEnd: 0.2, wobble: 0.05 });
    S.ink(cr, { w: 3, color: '#ffffff', taperStart: 0.15, taperEnd: 0.25, wobble: 0.05 });
    if (S.d) for (let i = 0; i < 8; i++) S.circle(-2 + R() * 34, -38 + R() * 20, 0.9 + R() * 1.6, '#ffffff', 0.9);
    S.spark(-24, -30, S.d ? 6 : 5, { color: '#ffffff' });
  };

  M.fan = (S) => {
    const { g, f } = S, R = S.rng('fa'), V = S.variant(3);
    S.glow(0, 0, 58, f.glow, 0.26);
    const px = 0, py = 36, a0 = -PI * 0.845, a1 = -PI * 0.155, R1 = 56, R0 = 9, ribs = 7 + V * 2;
    const arcPts2 = []; for (let i = 0; i <= 20; i++) arcPts2.push(polar(px, py, R1, lerp(a0, a1, i / 20)));
    const body = [polar(px, py, R0, a0)].concat(arcPts2, [polar(px, py, R0, a1)]);
    const paper = V === 2 ? tk.mix('#fff8f0', pal.gold2, 0.5) : '#fff8f0';
    S.cel({ poly: body }, paper, { line: S.L(2.8), shadow: V === 2 ? '#c8a860' : '#d8cdb8', shadowT: 0, depth: 8, rim: f.glow, rimW: S.L(1.4), hi: '#ffffff', hiW: S.L(2), halftone: S.ht(3.6, 0.2),
      decor: (gg) => {
        for (let i = 0; i < ribs - 1; i++) { if (i % 2) continue; const aa = lerp(a0, a1, i / (ribs - 1)), ab = lerp(a0, a1, (i + 1) / (ribs - 1)); gg.beginPath(); gg.moveTo(px, py); gg.arc(px, py, R1 + 4, aa, ab); gg.closePath(); gg.fillStyle = tk.rgba(f.light, 0.72); gg.fill(); }
        if (V === 1) {
          // waves: rows of scale arcs across the paper
          gg.strokeStyle = f.base; gg.lineWidth = S.T(1.4);
          for (let row = 0; row < 4; row++) for (let c = -4; c < 5; c++) { const cx = c * 12 + (row % 2 ? 6 : 0), cy = -10 + row * 8; gg.beginPath(); gg.arc(cx, cy, 6, PI, TAU); gg.stroke(); gg.beginPath(); gg.arc(cx, cy, 3.6, PI, TAU); gg.stroke(); }
        } else if (V === 2) {
          // gold leaf: a big sun and cloud bars
          gg.fillStyle = pal.gold; gg.beginPath(); gg.arc(8, -4, 12, 0, TAU); gg.fill(); gg.fillStyle = tk.rgba(pal.gold, 0.8); gg.fillRect(-30, 8, 34, 4); gg.fillRect(-18, 16, 40, 3);
        } else {
          gg.beginPath(); gg.arc(px, py, 38, a0, a1); gg.lineWidth = S.T(3); gg.strokeStyle = f.base; gg.stroke();
          gg.beginPath(); gg.arc(px, py, 31, a0, a1); gg.lineWidth = S.T(1); gg.strokeStyle = tk.rgba(f.dark, 0.7); gg.stroke();
        }
      } });
    for (let i = 0; i < ribs; i++) { const a = lerp(a0, a1, i / (ribs - 1)); S.ink([polar(px, py, R0, a), polar(px, py, R1, a)], { w: i === 0 || i === ribs - 1 ? 5 : 1.3, color: i === 0 || i === ribs - 1 ? f.dark : INK, taper: 0.02, pressure: 'flat', wobble: 0, alpha: i === 0 || i === ribs - 1 ? 1 : 0.65 }); }
    if (V === 0) for (let i = 0; i < 5; i++) { const a = lerp(a0 + 0.2, a1 - 0.2, i / 4), p = polar(px, py, 46, a); S.at(p[0], p[1], a + PI / 2, 0.8, 0.8, () => { for (let k = 0; k < 5; k++) S.at(0, 0, k * TAU / 5, 1, 1, () => S.fill(petalPts(5.4, 4.6, 0.1), f.base)); S.circle(0, 0, 1.2, pal.gold); }); }
    S.cel(tk.ellipsePts(px, py, 5, 5, 8), pal.gold, { line: S.L(1.8), shadow: '#a8782a', depth: 1.4, hi: false, rim: false });
    S.ink([[px, py + 3], [px - 4, py + 12 + S.wave(2, 0) * 1.5], [px + 1, py + 18]], { w: 2.4, color: pal.vermilion, taper: 0.3 });
    S.spark(30, -30, S.d ? 8 : 6, { color: '#ffffff' });
  };

  M.bell = (S) => {
    const { g, f } = S, R = S.rng('be'), V = S.variant(3);
    const P = S.pulse(1.6), bronze = tk.mix(pal.gold, f.base, 0.28), bronzeD = tk.mix('#a8782a', f.dark, 0.35);
    S.glow(0, 4, 56, f.glow, 0.26);
    const arcs = (cy, r0, sp) => { for (let i = 0; i < 3; i++) { const r = r0 + i * sp + 3 * P; S.ink(arcPts(0, cy, r, r * 0.86, -0.7, 0.7), { w: 2.4 - i * 0.5, color: f.hot, alpha: 0.85 - i * 0.2, taper: 0.4, wobble: 0.03 }); S.ink(arcPts(0, cy, r, r * 0.86, PI - 0.7, PI + 0.7), { w: 2.4 - i * 0.5, color: f.hot, alpha: 0.85 - i * 0.2, taper: 0.4, wobble: 0.03 }); } };
    if (V === 0) {
      arcs(4, 36, 7);
      S.line(bez2([-7, -30], [0, -50], [7, -30], 8), { w: 3.4, taper: 0.05, pressure: 'flat', color: INK });
      S.ink(bez2([-7, -30], [0, -48], [7, -30], 8), { w: 1.6, color: pal.gold2, taper: 0.05, pressure: 'flat', wobble: 0 });
      const body = [[-11, -30, 1], [11, -30, 1], [17, -12], [20, 8], [27, 28, 1], [-27, 28, 1], [-20, 8], [-17, -12]];
      S.cel(body, bronze, { line: S.L(3), shadow: bronzeD, shadowT: 0, depth: 8, rim: pal.gold2, rimW: S.L(1.6), hi: pal.gold2, hiW: S.L(2.4), halftone: S.ht(3.6, 0.3),
        decor: (gg) => {
          gg.strokeStyle = tk.rgba(INK, 0.6); gg.lineWidth = S.T(1.4);
          [-16, 6, 22].forEach((y) => { gg.beginPath(); gg.moveTo(-32, y); gg.quadraticCurveTo(0, y + 4, 32, y); gg.stroke(); });
          for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) { const x = -9 + c * 9, y = -8 + r * 12; gg.beginPath(); gg.arc(x, y, 2.1, 0, TAU); gg.fillStyle = pal.gold2; gg.fill(); gg.stroke(); }
        } });
      S.at(28 + 4 * P, 6, 0, 1, 1, () => { S.cel([[-2, -5, 1], [16, -6, 1], [16, 6, 1], [-2, 5, 1]], f.dark, { line: S.L(2.2), tension: 0.2, shadow: tk.shade(f.dark), depth: 2.4, rim: f.glow, rimW: S.L(0.8), hi: false }); S.cel(tk.ellipsePts(-2, 0, 4, 5.2, 8), pal.paper2, { line: S.L(1.6), hi: false, rim: false, depth: 1.2, shadow: '#b09a68' }); });
      S.spark(22, 6, S.d ? 11 : 8, { color: '#ffffff', glow: 0.8 });
    } else if (V === 1) {
      // kagura suzu: a bar of three round bells on a rope, swinging
      const sw = S.wave(1.4, 0) * 0.08;
      S.cel([[-36, -38, 1], [36, -38, 1], [36, -32, 1], [-36, -32, 1]], f.dark, { line: S.L(2.4), tension: 0.2, shadow: tk.shade(f.dark), depth: 2.4, rim: f.glow, rimW: S.L(0.8), hi: false });
      [[-24, 18, 11], [0, 26, 13], [24, 18, 11]].forEach((b, i) => {
        S.at(b[0], -32, sw * (i - 1) * 2, 1, 1, () => {
          S.ink([[0, 0], [0, b[1] + 2]], { w: 2, color: INK, taper: 0.05, pressure: 'flat', wobble: 0 }); S.ink([[0, 2], [0, b[1] + 1]], { w: 1, color: pal.vermilion, taper: 0.05, pressure: 'flat', wobble: 0 });
          S.cel(tk.ellipsePts(0, b[1] + b[2], b[2], b[2], 14), bronze, { line: S.L(2.6), shadow: bronzeD, shadowT: 0, depth: 4.4, rim: pal.gold2, rimW: S.L(1.3), hi: pal.gold2, hiW: S.L(1.8), halftone: S.ht(3.2, 0.25) });
          S.ink([[-b[2] * 0.8, b[1] + b[2] + 1], [b[2] * 0.8, b[1] + b[2] + 1]], { w: 1.6, color: INK, taper: 0.3, wobble: 0 }); S.circle(0, b[1] + b[2] + 3.6, 1.6, INK);
          S.ink([[0, b[1] + 2], [-b[2] * 0.4, b[1] + b[2] - 2]], { w: 1.4, color: '#ffffff', alpha: 0.8, taper: 0.4, wobble: 0 });
        });
      });
      arcs(6, 40, 7); S.spark(0, 8, S.d ? 9 : 7, { color: '#ffffff' });
    } else {
      // a hanging gong with a swinging mallet
      arcs(4, 34, 7);
      [-1, 1].forEach((sd) => S.cel([[sd * 40 - 3, -44, 1], [sd * 40 + 3, -44, 1], [sd * 42 + 3, 46, 1], [sd * 42 - 3, 46, 1]], f.dark, { line: S.L(2.2), tension: 0.2, shadow: tk.shade(f.dark), depth: 2, rim: f.glow, rimW: S.L(0.7), hi: false }));
      S.cel([[-44, -44, 1], [44, -44, 1], [44, -38, 1], [-44, -38, 1]], f.dark, { line: S.L(2.2), tension: 0.2, shadow: tk.shade(f.dark), depth: 2, rim: f.glow, rimW: S.L(0.7), hi: false });
      S.ink([[-18, -38], [-10, -16]], { w: 1.8, color: INK, taper: 0.05, pressure: 'flat', wobble: 0 }); S.ink([[18, -38], [10, -16]], { w: 1.8, color: INK, taper: 0.05, pressure: 'flat', wobble: 0 });
      S.cel(tk.ellipsePts(0, 4, 30, 30, 20), bronze, { line: S.L(3), shadow: bronzeD, shadowT: 0, depth: 8, rim: pal.gold2, rimW: S.L(1.6), hi: pal.gold2, hiW: S.L(2.4), halftone: S.ht(3.6, 0.28) });
      S.ring(0, 4, 24, 1.3, bronzeD, 0.9); S.ring(0, 4, 17, 1, bronzeD, 0.8);
      S.cel(tk.ellipsePts(0, 4, 8, 8, 12), pal.gold2, { line: S.L(2), shadow: pal.gold, depth: 2.4, hi: false, rim: false });
      S.at(38 + 4 * P, -4, -0.6 * P, 1, 1, () => S.cel(tk.ellipsePts(0, 0, 6, 6, 10), pal.paper2, { line: S.L(1.8), shadow: '#b09a68', depth: 2, hi: false, rim: false }));
      S.spark(14, 4, S.d ? 10 : 8, { color: '#ffffff', glow: 0.8 });
    }
    if (S.d) { S.spark(-30, -28, 5, { color: pal.gold2 }); S.spark(-34, 30, 4, { color: '#ffffff' }); }
  };

  M.lantern = (S) => {
    const { g, f } = S, R = S.rng('la');
    const fl = 0.5 + 0.5 * (S.anim ? sin(S.t * 9) * 0.4 + sin(S.t * 5.3) * 0.3 : 0.3);
    S.glow(0, 0, 60, pal.gold2, 0.4 + 0.2 * fl);
    const one = (cx, cy, sc, a) => S.at(cx, cy, 0, sc, sc, () => {
      g.globalAlpha *= a;
      S.ink([[0, -44], [0, -30]], { w: 1.6, color: INK, taper: 0.05, pressure: 'flat', wobble: 0 });
      const body = tk.ellipsePts(0, 0, 22, 27, 18);
      S.cel(body, f.base, { line: S.L(3), shadow: f.shade, shadowT: 0, depth: 9, rim: f.hot, rimW: S.L(1.5), hi: false, halftone: S.ht(3.8, 0.28),
        decor: (gg) => {
          const gr = gg.createRadialGradient(0, 2, 2, 0, 2, 26); gr.addColorStop(0, tk.rgba(pal.gold2, 0.95)); gr.addColorStop(0.55, tk.rgba(pal.gold, 0.5)); gr.addColorStop(1, tk.rgba(f.base, 0));
          gg.fillStyle = gr; gg.fillRect(-30, -34, 60, 70);
          gg.strokeStyle = tk.rgba(INK, 0.6); gg.lineWidth = S.T(1.5);
          for (let i = -3; i <= 3; i++) { gg.beginPath(); gg.moveTo(-26, i * 8); gg.quadraticCurveTo(0, i * 8 + 5, 26, i * 8); gg.stroke(); }
        } });
      // caps top and bottom
      S.cel([[-13, -30, 1], [13, -30, 1], [15, -25, 1], [-15, -25, 1]], INK, { line: S.L(1.8), tension: 0.2, shadow: false, hi: false, rim: pal.gold, rimW: S.L(0.9) });
      S.cel([[-13, 25, 1], [13, 25, 1], [15, 30, 1], [-15, 30, 1]], INK, { line: S.L(1.8), tension: 0.2, shadow: false, hi: false, rim: pal.gold, rimW: S.L(0.9) });
      // family crest
      S.circle(0, 0, 7.4, '#fff8f0'); for (let i = 0; i < 5; i++) S.at(0, 0, i * TAU / 5, 1, 1, () => S.fill(petalPts(5.4, 4.6, 0.1), f.dark)); S.circle(0, 0, 1.4, pal.gold);
      // tassel
      S.ink([[0, 31], [0, 38]], { w: 1.6, color: INK, taper: 0.05, wobble: 0 }); S.ink([[-2.5, 37], [0, 47 + S.wave(2, 0) * 1], [2.5, 37]], { w: 3.6, color: pal.gold, taper: 0.4 });
    });
    if (S.d) one(-30, 8, 0.6, 0.9);
    one(S.d ? 8 : 0, -2, 1, 1);
    // rising sparks
    for (let i = 0; i < (S.d ? 8 : 3); i++) { const y = 20 - (S.anim ? (S.t * 10 + i * 9) % 60 : i * 8 + 4), x = -6 + R() * 24 + sin(S.t * 1.2 + i) * 2; S.circle(x, max(-44, y - 26), 0.9 + R() * 1.2, i % 2 ? pal.gold2 : '#ffffff', 0.85); }
    S.spark(26, -24, S.d ? 7 : 5, { color: '#ffffff' });
  };

  M.torii = (S) => {
    const { g, f } = S, R = S.rng('to');
    S.glow(0, -4, 58, f.glow, 0.3);
    // sun or moon rising behind the gate
    S.circle(0, -4, 27, f.hot, 0.6); S.ring(0, -4, 27, 1.4, f.glow, 0.7);
    S.at(0, 40, 0, 1, 0.16, () => S.glow(0, 0, 54, '#ffffff', 0.5));
    const post = (x) => S.cel([[x - 6, -8, 1], [x + 6, -8, 1], [x + 7, 44, 1], [x - 7, 44, 1]], f.base, { line: S.L(2.6), tension: 0.2, shadow: f.shade, shadowT: 0, depth: 4, rim: f.hot, rimW: S.L(1.2), hi: S.d ? f.light : undefined, hiW: S.L(1.6) });
    post(-25); post(25);
    [-25, 25].forEach((x) => S.cel([[x - 7.6, 30, 1], [x + 7.6, 30, 1], [x + 8, 44, 1], [x - 8, 44, 1]], INK, { line: S.L(2), tension: 0.2, shadow: false, hi: false, rim: f.glow, rimW: S.L(0.8) }));
    // lower tie beam (nuki)
    S.cel([[-37, 2, 1], [37, 2, 1], [37, 12, 1], [-37, 12, 1]], f.base, { line: S.L(2.4), tension: 0.2, shadow: f.shade, depth: 3, rim: f.hot, rimW: S.L(1), hi: false });
    // plaque
    S.cel([[-6, -18, 1], [6, -18, 1], [6, -6, 1], [-6, -6, 1]], INK, { line: S.L(1.8), tension: 0.2, shadow: false, hi: false, rim: pal.gold, rimW: S.L(0.8) });
    S.ink([[-3, -14], [3, -14]], { w: 1.4, color: pal.gold2, taper: 0.1, wobble: 0 }); S.ink([[0, -16], [0, -8]], { w: 1.4, color: pal.gold2, taper: 0.1, wobble: 0 });
    // shimaki and the upswept kasagi
    S.cel([[-36, -20, 1], [36, -20, 1], [36, -14, 1], [-36, -14, 1]], f.base, { line: S.L(2.2), tension: 0.2, shadow: f.shade, depth: 2.4, rim: f.hot, rimW: S.L(0.9), hi: false });
    const kas = [[-48, -32, 1], [-30, -26], [0, -24], [30, -26], [48, -32, 1], [42, -20, 1], [0, -18], [-42, -20, 1]];
    S.cel(kas, INK, { line: S.L(2.6), shadow: false, hi: false, rim: f.glow, rimW: S.L(1.2), rimSide: 'light', tension: 0.7 });
    S.ink([[-44, -31], [-28, -25.4], [0, -23.4], [28, -25.4], [44, -31]], { w: 1.4, color: pal.gold, taper: 0.15, alpha: 0.8, wobble: 0 });
    S.spark(-34, -40, S.d ? 7 : 5, { color: '#ffffff' });
    if (S.d) { for (let i = 0; i < 6; i++) tk.petal(g, -40 + R() * 80, -10 + R() * 50, 3 + R() * 2, R() * TAU, 0.85, f.light); }
  };

  M.web = (S) => {
    const { g, f } = S, R = S.rng('we');
    S.glow(0, 0, 56, f.glow, 0.2);
    const n = 9, rings = 6, rot = -0.2;
    const spoke = (i) => rot + i / n * TAU;
    const strand = (pts, w, col, a) => { S.ink(pts, { w: w + 1.6, color: INK, alpha: 0.6 * a, taper: 0.05, pressure: 'flat', wobble: 0 }); S.ink(pts, { w, color: col, alpha: a, taper: 0.05, pressure: 'flat', wobble: 0 }); };
    for (let i = 0; i < n; i++) strand([[0, 0], polar(0, 0, 47, spoke(i))], 1.3, '#ffffff', 0.95);
    for (let k = 1; k <= rings; k++) {
      const r = k * 7.4 + 1;
      for (let i = 0; i < n; i++) {
        const a = spoke(i), b = spoke(i + 1), p = polar(0, 0, r, a), q = polar(0, 0, r, b), m = polar(0, 0, r * (0.88 - 0.02 * k), (a + b) / 2);
        strand([p, m, q], 1, '#ffffff', 0.9);
      }
    }
    // dew drops
    for (let i = 0; i < (S.d ? 9 : 4); i++) { const a = spoke(floor(R() * n)) + 0.16, r = 9 + R() * 34, p = polar(0, 0, r * 0.94, a); S.circle(p[0], p[1], 2.2, f.hot, 0.95); S.circle(p[0] - 0.6, p[1] - 0.7, 0.8, '#ffffff'); }
    // the spider on a thread
    if (S.d) {
      const sy = -24 + S.wave(3, 0) * 3; S.ink([[24, -48], [24, sy]], { w: 1, color: '#ffffff', taper: 0.05, pressure: 'flat', wobble: 0 });
      S.at(24, sy + 6, 0, 1, 1, () => { for (let k = 0; k < 4; k++) { S.ink([[0, 0], [-8 - k, -4 + k * 3.4], [-11 - k, 3 + k * 4]], { w: 1.1, color: INK, taper: 0.1, wobble: 0 }); S.ink([[0, 0], [8 + k, -4 + k * 3.4], [11 + k, 3 + k * 4]], { w: 1.1, color: INK, taper: 0.1, wobble: 0 }); } S.cel(tk.ellipsePts(0, 3, 4.6, 5.6, 8), INK, { line: S.L(1), shadow: false, hi: false, rim: f.glow, rimW: S.L(0.7) }); S.circle(0, -3, 3, INK); S.circle(-1, 3, 1.4, pal.vermilion); });
    }
    S.spark(-30, -34, S.d ? 6 : 5, { color: '#ffffff' });
  };

  M.skull = (S) => {
    const { g, f } = S, R = S.rng('sk');
    const fl = S.wave(1.3, 0);
    S.glow(0, -2, 58, f.glow, 0.32);
    // ghost fire licking up behind
    for (let i = 0; i < 5; i++) { const x = -24 + i * 12, h = 22 + (i % 2) * 12 + 4 * S.wave(1.6, i * 0.2); S.cel([[x - 7, -8, 1], [x - 5, -8 - h * 0.5], [x + (i % 2 ? 3 : -3), -8 - h, 1], [x + 5, -8 - h * 0.45], [x + 7, -8, 1]], i % 2 ? f.base : f.light, { line: S.L(1.8), shadow: f.shade, depth: 2.2, hi: false, rim: false }); }
    // cranium, cheekbones and jaw
    const skull = [[0, -40, 1], [24, -32], [30, -12], [24, 6], [18, 14], [16, 30, 1], [-16, 30, 1], [-18, 14], [-24, 6], [-30, -12], [-24, -32]];
    S.cel(skull, '#f3e6c8', { line: S.L(3), shadow: '#b5a27a', shadowT: 0, depth: 8, rim: f.glow, rimW: S.L(1.6), hi: '#fffaf0', hiW: S.L(2.4), halftone: S.ht(3.6, 0.32) });
    // sockets with glowing pupils
    [-13, 13].forEach((x) => { S.cel([[x - 9, -8, 1], [x, -16], [x + 9, -9, 1], [x + 7, 4], [x, 8], [x - 7, 3]], INK, { line: S.L(1.6), shadow: false, hi: false, rim: false }); S.circle(x, -3, 3.6 + 0.6 * fl, f.glow); S.circle(x, -3, 1.8, '#ffffff'); S.glow(x, -3, 12, f.glow, 0.55); });
    S.cel([[0, 8, 1], [-4, 16], [4, 16]], INK, { line: S.L(1.2), shadow: false, hi: false, rim: false, tension: 0.2 });
    // teeth
    S.cel([[-15, 20, 1], [15, 20, 1], [15, 30, 1], [-15, 30, 1]], '#f3e6c8', { line: S.L(1.8), tension: 0.2, shadow: '#b5a27a', depth: 2, hi: false, rim: false });
    for (let i = -2; i <= 2; i++) S.ink([[i * 6 - 3, 20], [i * 6 - 3, 30]], { w: 1.3, color: INK, taper: 0, pressure: 'flat', wobble: 0 });
    S.ink([[-15, 25], [15, 25]], { w: 1, color: INK, taper: 0, pressure: 'flat', wobble: 0, alpha: 0.7 });
    // crack and venom drip
    S.ink([[10, -38], [6, -28], [12, -22], [8, -12]], { w: 1.6, color: INK, taper: 0.2, wobble: 0.03 });
    if (S.d) { S.ink([[-22, 6], [-22, 22]], { w: 2.4, color: pal.jade, taperStart: 0, taperEnd: 0.4, pressure: 'flat', wobble: 0 }); S.circle(-22, 24, 2.2, pal.jade); }
    S.spark(-24, -34, S.d ? 6 : 5, { color: '#ffffff' });
  };

  M.coin = (S) => {
    const { g, f } = S, R = S.rng('co');
    S.glow(0, 0, 58, pal.gold2, 0.32);
    const goldShade = '#a8782a';
    // a mon coin (round with a square hole), behind
    S.at(-22, 16, -0.3, 1, 1, () => {
      S.cel(tk.ellipsePts(0, 0, 17, 17, 18), pal.gold, { line: S.L(2.6), shadow: goldShade, shadowT: 0, depth: 4, rim: pal.gold2, rimW: S.L(1.2), hi: pal.gold2, hiW: S.L(1.8) });
      S.ring(0, 0, 13, 1, goldShade, 0.9);
      S.cel({ poly: [[-5, -5], [5, -5], [5, 5], [-5, 5]] }, f.dark, { line: S.L(1.6), shadow: false, hi: false, rim: false, tension: 0.2 });
    });
    // the koban: a big oval with stamped rows
    S.at(8, -4, 0.28, 1, 1, () => {
      S.cel(tk.ellipsePts(0, 0, 25, 34, 22), pal.gold, { line: S.L(3), shadow: goldShade, shadowT: 0, depth: 8, rim: pal.gold2, rimW: S.L(1.6), hi: pal.gold2, hiW: S.L(2.4), halftone: S.ht(3.6, 0.25),
        decor: (gg) => { gg.strokeStyle = tk.rgba(goldShade, 0.85); gg.lineWidth = S.T(1.3); for (let i = 0; i < 6; i++) { gg.beginPath(); gg.moveTo(-20, -18 + i * 3.2); gg.lineTo(20, -18 + i * 3.2); gg.stroke(); }
          gg.fillStyle = tk.rgba(goldShade, 0.9); gg.beginPath(); gg.rect(-8, -1, 16, 12); gg.fill();
          gg.fillStyle = pal.gold2; [[-14, 20], [0, 22], [14, 20]].forEach((p) => { gg.beginPath(); gg.arc(p[0], p[1], 2.2, 0, TAU); gg.fill(); }); } });
      S.ring(0, 0, 29, 1, goldShade, 0.7);
      S.ink([[-6, 3], [6, 3]], { w: 1.2, color: pal.gold2, taper: 0.1, wobble: 0 }); S.ink([[0, 1], [0, 9]], { w: 1.2, color: pal.gold2, taper: 0.1, wobble: 0 });
    });
    // small coins below
    S.cel(tk.ellipsePts(24, 32, 12, 5, 12), pal.gold, { line: S.L(2), shadow: goldShade, depth: 2, rim: false, hi: false });
    S.cel(tk.ellipsePts(24, 28, 12, 5, 12), pal.gold, { line: S.L(2), shadow: goldShade, depth: 2, rim: pal.gold2, rimW: S.L(0.8), hi: false });
    S.spark(22, -32, S.d ? 11 : 8, { color: '#ffffff', glow: 0.7 }); S.spark(-34, -20, S.d ? 7 : 5, { color: pal.gold2 });
    if (S.d) { S.spark(36, 6, 5, { color: '#ffffff' }); S.spark(-6, 38, 4, { color: pal.gold2 }); }
  };

  M.key = (S) => {
    const { g, f } = S, R = S.rng('ke');
    S.glow(0, 0, 58, f.glow, 0.28 + 0.08 * S.pulse(2.6));
    S.dash(-6, 4, 38, 38, 1.2, f.hot, 0.5, [3, 5], S.t * 4);
    S.at(0, 0, -0.62, 1, 1, () => {
      const goldShade = '#a8782a';
      // shaft, collars and the bit (teeth)
      S.cel([[-3.6, -14, 1], [3.6, -14, 1], [3.6, 40, 1], [-3.6, 40, 1]], pal.gold, { line: S.L(2.4), tension: 0.2, shadow: goldShade, depth: 2.4, rim: pal.gold2, rimW: S.L(0.9), hi: false });
      [[-6, -3], [-6, 10]].forEach((c) => S.cel(tk.ellipsePts(0, c[1], 6.6, 2.8, 10), pal.gold2, { line: S.L(1.6), shadow: goldShade, depth: 1.2, hi: false, rim: false }));
      S.cel({ poly: [[3.6, 26], [13, 26], [13, 31], [8, 31], [8, 34], [13, 34], [13, 39], [3.6, 39]] }, pal.gold, { line: S.L(2.2), shadow: goldShade, depth: 2, hi: false, rim: false });
      // the bow: a blossom ring with a gem
      for (let i = 0; i < 5; i++) S.at(0, -26, i * TAU / 5, 1, 1, () => S.cel(tk.ellipsePts(0, -13, 8.6, 12, 10), pal.gold, { line: S.L(2.4), shadow: goldShade, depth: 3, rim: pal.gold2, rimW: S.L(0.9), hi: false }));
      S.cel(tk.ellipsePts(0, -26, 12, 12, 14), pal.gold2, { line: S.L(2.4), shadow: pal.gold, depth: 3, hi: false, rim: false });
      S.cel(tk.ellipsePts(0, -26, 7.4, 7.4, 12), f.base, { line: S.L(1.8), shadow: f.shade, depth: 2.6, hi: f.light, hiW: S.L(1.2), rim: f.hot, rimW: S.L(0.7) });
      S.circle(-2, -28, 1.6, '#ffffff');
      // tassel cord
      S.ink([[0, -40], [8, -50], [4, -58]], { w: 2.6, color: pal.vermilion, taper: 0.3 });
    });
    S.spark(28, -22, S.d ? 9 : 7, { color: '#ffffff', glow: 0.8 });
    if (S.d) { S.spark(-30, 20, 5, { color: pal.gold2 }); S.spark(-4, 36, 4, { color: '#ffffff' }); }
  };

  M.ice = (S) => {
    const { g, f } = S, R = S.rng('ic');
    S.glow(0, 0, 58, f.glow, 0.32);
    // snowflake behind
    const arm = (a) => { S.ink([[0, 0], polar(0, 0, 44, a)], { w: 2, color: f.hot, alpha: 0.75, taper: 0.1, pressure: 'flat', wobble: 0 }); [16, 28].forEach((r) => { const p = polar(0, 0, r, a); S.ink([polar(p[0], p[1], 8, a - 0.7), p, polar(p[0], p[1], 8, a + 0.7)], { w: 1.6, color: f.hot, alpha: 0.75, taper: 0.1, pressure: 'flat', wobble: 0 }); }); };
    for (let i = 0; i < 6; i++) arm(i * PI / 3 + (S.anim ? S.t * 0.1 : 0));
    // crystal prisms: two faces and a tip each
    const crystal = (x, y, w, h, tilt) => S.at(x, y, tilt, 1, 1, () => {
      const tip = [0, -h], L = [-w, -h * 0.72], Rr = [w, -h * 0.72], bl = [-w * 0.9, 0], br = [w * 0.9, 0];
      S.fill({ poly: [tip, L, [-w * 0.05, -h * 0.66]] }, f.hot);
      S.fill({ poly: [tip, [-w * 0.05, -h * 0.66], Rr] }, f.light);
      S.fill({ poly: [L, [-w * 0.05, -h * 0.66], [-w * 0.05, 0], bl] }, f.light);
      S.fill({ poly: [[-w * 0.05, -h * 0.66], Rr, br, [-w * 0.05, 0]] }, f.base);
      S.fill({ poly: [[w * 0.55, -h * 0.5], [w * 0.9, -h * 0.66], br, [w * 0.55, 0]] }, f.shade, 0.6);
      S.line([tip, L, bl, br, Rr, tip], { w: 2.6, pressure: 'flat', taper: 0, wobble: 0.02 });
      S.ink([[L[0], L[1]], [-w * 0.05, -h * 0.66], [Rr[0], Rr[1]]], { w: 1.4, color: INK, alpha: 0.85, taper: 0.05, pressure: 'flat', wobble: 0 });
      S.ink([[-w * 0.05, -h * 0.66], [-w * 0.05, 0]], { w: 1.4, color: INK, alpha: 0.85, taper: 0.05, pressure: 'flat', wobble: 0 });
      S.ink([[-w * 0.6, -h * 0.55], [-w * 0.55, -h * 0.15]], { w: 1.8, color: '#ffffff', alpha: 0.85, taper: 0.4, wobble: 0 });
    });
    crystal(-22, 38, 11, 34, -0.35); crystal(24, 40, 12, 38, 0.32); crystal(2, 44, 16, 66, 0);
    if (S.d) { crystal(-38, 42, 6, 18, -0.7); crystal(40, 44, 6, 20, 0.7); }
    // frost mist and glints
    S.at(0, 46, 0, 1, 0.22, () => S.glow(0, 0, 52, '#ffffff', 0.55));
    S.spark(14, -34, S.d ? 10 : 7, { color: '#ffffff', glow: 0.8 }); if (S.d) { S.spark(-30, -24, 6, { color: '#ffffff' }); S.spark(36, 6, 5, { color: '#ffffff' }); for (let i = 0; i < 9; i++) S.circle(-40 + R() * 80, -40 + R() * 60, 0.8 + R() * 1.2, '#ffffff', 0.85); }
  };


  // ---- energy: lightning, fire, fists and feet ----
  const SKIN = '#d9a06c', SKIN_D = '#a86c3c', SKIN_L = '#f0c090';

  M.lightning = (S) => {
    const { g, f } = S, R = S.rng('lt'), V = S.variant(3);
    const q = S.anim ? floor(S.t * 10) : 0, P = S.pulse(0.5);
    S.glow(0, 0, 62, f.glow, 0.4 + 0.15 * P);
    S.fill({ poly: starPts(V === 2 ? 26 : 0, V === 2 ? 22 : 0, 12, 18, 46, 0.2) }, f.base, 0.4);
    const fork = (x0, y0, x1, y1, sd) => { const rr = tk.rng('fk', S.seed, sd, q), pts = boltPts(x0, y0, x1, y1, 8, 5, rr); S.ink(pts, { w: 5, color: f.glow, alpha: 0.5, taper: 0.2, wobble: 0, pressure: 'flat' }); S.ink(pts, { w: 2, color: '#ffffff', taper: 0.25, wobble: 0, pressure: 'flat' }); };
    if (V === 0) {
      fork(-8, 0, -44, 20, 1); fork(4, -10, 44, -22, 2); if (S.d) { fork(-12, 30, -36, 46, 3); fork(12, 8, 42, 26, 4); }
      const bolt = [[14, -50, 1], [-20, -4, 1], [-3, -4, 1], [-16, 50, 1], [26, -14, 1], [8, -14, 1], [28, -50, 1]];
      S.cel({ poly: bolt }, f.hot, { line: S.L(3.2), shadow: f.light, shadowT: 0, depth: 4.5, rim: '#ffffff', rimW: S.L(1.4), hi: '#ffffff', hiW: S.L(2.2), halftone: S.ht(3.4, 0.22) });
      S.fill({ poly: [[17, -44], [-12, -6], [2, -6], [-10, 40], [20, -12], [6, -12], [22, -44]] }, '#ffffff', 0.9);
      S.spark(6, -6, S.d ? 12 : 9, { color: '#ffffff', glow: 0.9 });
    } else if (V === 1) {
      // a long forked bolt: a jagged trunk with thick ink under a white core, and two branches
      const rr = tk.rng('tr', S.seed, q), trunk = boltPts(12, -50, -8, 50, 16, 8, rr);
      S.ink(trunk, { w: 11, color: INK, taper: 0.1, wobble: 0, pressure: 'flat' }); S.ink(trunk, { w: 8, color: f.glow, alpha: 0.85, taper: 0.1, wobble: 0, pressure: 'flat' }); S.ink(trunk, { w: 3.6, color: '#ffffff', taper: 0.15, wobble: 0, pressure: 'flat' });
      const a = polyAt(trunk, 0.4), b = polyAt(trunk, 0.66);
      fork(a.x, a.y, a.x + 34, a.y + 14, 5); fork(b.x, b.y, b.x - 36, b.y + 12, 6); if (S.d) fork(a.x, a.y, a.x - 26, a.y - 4, 7);
      S.spark(trunk[trunk.length - 1][0], 44, S.d ? 11 : 8, { color: '#ffffff', glow: 0.9 });
    } else {
      // a diagonal strike that lands in a ring of sparks
      const rr = tk.rng('dg', S.seed, q), tr = boltPts(-42, -44, 26, 22, 14, 7, rr);
      S.ink(tr, { w: 12, color: INK, taper: 0.1, wobble: 0, pressure: 'flat' }); S.ink(tr, { w: 8.4, color: f.glow, alpha: 0.9, taper: 0.1, wobble: 0, pressure: 'flat' }); S.ink(tr, { w: 4, color: '#ffffff', taper: 0.1, wobble: 0, pressure: 'flat' });
      S.dash(26, 24, 24, 8, 1.6, f.hot, 0.9, [5, 3], -S.t * 8); S.dash(26, 24, 36, 12, 1.2, '#ffffff', 0.5, [4, 4], S.t * 8);
      fork(0, -20, 24, -34, 5); fork(-10, -30, -40, -12, 6); S.spark(26, 22, S.d ? 14 : 10, { color: '#ffffff', glow: 0.9 });
    }
    for (let i = 0; i < (S.d ? 12 : 5); i++) { const a = R() * TAU, r = 26 + R() * 24; S.circle(cos(a) * r, sin(a) * r, 0.9 + R() * 1.6, i % 2 ? '#ffffff' : f.hot, 0.9); }
    if (S.d) { S.spark(-30, -30, 5, { color: pal.gold2 }); S.spark(36, 30, 5, { color: '#ffffff' }); }
  };

  M.chain_lightning = (S) => {
    const { g, f } = S, R = S.rng('cl');
    const q = S.anim ? floor(S.t * 10) : 0;
    S.glow(0, 0, 60, f.glow, 0.3);
    const nodes = [[-34, 24], [-10, -14], [18, 12], [38, -26]];
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i], b = nodes[i + 1];
      for (let k = 0; k < (S.d ? 2 : 1); k++) {
        const rr = tk.rng('cl', S.seed, i, k, q), pts = boltPts(a[0], a[1], b[0], b[1], k ? 8 : 12, 6, rr);
        S.ink(pts, { w: k ? 4 : 8, color: f.glow, alpha: 0.45, taper: 0.1, wobble: 0, pressure: 'flat' });
        S.ink(pts, { w: k ? 1.2 : 3, color: '#ffffff', taper: 0.15, wobble: 0, pressure: 'flat' });
      }
    }
    // stray zaps off the last orb
    { const rr = tk.rng('cz', S.seed, q), pts = boltPts(38, -26, 48, -6, 6, 4, rr); S.ink(pts, { w: 2, color: '#ffffff', taper: 0.3, wobble: 0 }); }
    nodes.forEach((n, i) => {
      const r = 8.5 - i * 0.5;
      S.glow(n[0], n[1], r * 3.2, f.glow, 0.7);
      S.cel(tk.ellipsePts(n[0], n[1], r, r, 12), f.light, { line: S.L(2.4), shadow: f.base, shadowT: 0, depth: 3, rim: f.hot, rimW: S.L(1.1), hi: '#ffffff', hiW: S.L(1.4) });
      S.circle(n[0] + 1, n[1] - 1, r * 0.5, '#ffffff', 0.95);
      S.ring(n[0], n[1], r + 3 + 1.5 * S.pulse(0.7, i * 0.25), 1.2, f.hot, 0.8);
    });
    S.spark(-10, -14, S.d ? 8 : 6, { color: '#ffffff', glow: 0.8 });
    if (S.d) for (let i = 0; i < 10; i++) S.circle(-44 + R() * 88, -40 + R() * 80, 0.8 + R() * 1.3, R() < 0.5 ? '#ffffff' : f.hot, 0.85);
  };

  // a flame tongue shape pointing up with the tip at (0, -h)
  const flamePts = (w, h, lean, kink) => [[0, 0, 1], [w * 0.7, -h * 0.12], [w * 0.62, -h * 0.4], [w * 0.28 + (kink || 0), -h * 0.62], [lean, -h, 1], [-w * 0.18 + (kink || 0) * 0.4, -h * 0.66], [-w * 0.6, -h * 0.4], [-w * 0.7, -h * 0.12]];

  // a three-tipped stylised flame: tall centre lick, a right lick and a left lick. Base at the origin, height h up.
  function flame3(w, h, lean, sway) {
    const X = (x) => x * w, Y = (y) => -y * h, sw = sway || 0;
    const p = (x, y, c) => (c ? [X(x) + sw * (-y) * 0.5, Y(y), 1] : [X(x) + sw * (-y) * 0.5, Y(y)]);
    return [p(0, 0, 1), p(0.85, 0.08), p(1.0, 0.3), p(0.86, 0.5), p(0.66, 0.62), p(0.98, 0.8, 1), p(0.54, 0.7), p(0.36, 0.8), [X(0.24) + lean, Y(1), 1], p(-0.08, 0.8), p(-0.34, 0.68), p(-0.6, 0.86, 1), p(-0.7, 0.56), p(-0.98, 0.42), p(-0.9, 0.2), p(-0.52, 0.06)];
  }
  M.fire = (S) => {
    const { g, f } = S, R = S.rng('fi'), V = S.variant(3);
    const w1 = S.wave(0.9, 0), w2 = S.wave(0.7, 0.3);
    S.glow(0, -4, 62, f.glow, 0.44 + 0.1 * S.pulse(0.6));
    const flame = (x, base, w, h, lean, cols, wob) => {
      S.at(x, base, 0, 1, 1, () => {
        S.cel(flame3(w, h, lean + wob * 3, w2 * 0.06), cols[0], { line: S.L(w > 20 ? 3 : 2.4), shadow: f.shade, shadowT: 0, depth: w * 0.3, rim: f.hot, rimW: S.L(1.2), hi: false, halftone: w > 20 ? S.ht(3.8, 0.3) : undefined, tension: 0.6 });
        S.cel(flame3(w * 0.7, h * 0.74, lean * 0.6 - w2 * 2, w1 * 0.05), cols[1], { line: S.L(2.2), shadow: f.base, shadowT: 0, depth: w * 0.2, rim: f.hot, rimW: S.L(1), hi: false, tension: 0.6 });
        S.cel(flame3(w * 0.42, h * 0.45, lean * 0.3 + w1, w2 * 0.04), cols[2], { line: S.L(1.6), shadow: f.light, shadowT: 0, depth: w * 0.14, rim: false, hi: false, tension: 0.6 });
        S.fill(flame3(w * 0.2, h * 0.2, 0, 0), '#ffffff', 0.95);
      });
    };
    const cols = [f.base, f.light, f.hot];
    if (V === 0) {
      flame(-22, 40, 15, 48, -5, cols, w2); flame(24, 40, 15, 42, 5, cols, w1); flame(0, 46, 31, 92, 3, cols, w1);
    } else if (V === 1) {
      // a single tall candle flame with a glowing wick
      S.cel({ poly: [[-3, 46], [3, 46], [2.6, 34], [-2.6, 34]] }, INK, { line: S.L(1.4), shadow: false, hi: false, rim: false, tension: 0.2 });
      flame(0, 40, 22, 100, 7 + w1 * 3, cols, w2);
      flame(-24, 46, 9, 34, -4, cols, w1); flame(24, 46, 9, 30, 4, cols, w2);
    } else {
      // a wide bonfire: three flames of different heights over crossed logs
      flame(-24, 32, 20, 66, -4, cols, w1); flame(24, 34, 19, 56, 5, cols, w2); flame(0, 38, 28, 88, 2, cols, w2);
      [[-22, 41, -0.3], [22, 42, 0.3]].forEach((l) => S.at(l[0], l[1], l[2], 1, 1, () => { S.cel([[-24, -4, 1], [24, -4, 1], [24, 4, 1], [-24, 4, 1]], f.dim, { line: S.L(2.2), tension: 0.25, shadow: INK, depth: 2, rim: f.glow, rimW: S.L(0.8), hi: false }); S.cel(tk.ellipsePts(24, 0, 3.4, 4.4, 8), f.mid, { line: S.L(1.4), hi: false, rim: false, shadow: false }); }));
    }
    for (let i = 0; i < (S.d ? 10 : 4); i++) { const x = -30 + R() * 60, y = 40 - R() * 84 - (S.anim ? (S.t * 14 + i * 7) % 20 : 0); S.circle(x, y, 0.9 + R() * 1.6, i % 3 ? pal.gold2 : '#ffffff', 0.9); }
    S.spark(-22, -32, S.d ? 6 : 5, { color: pal.gold2 });
  };

  M.flame_orb = (S) => {
    const { g, f } = S, R = S.rng('fo');
    const cx = 10, cy = -6, w = S.wave(0.8, 0) * 3;
    S.glow(cx, cy, 60, f.glow, 0.44 + 0.1 * S.pulse(0.7));
    // a trailing comet of flame tongues
    S.at(cx - 8, cy + 8, -2.05, 1, 1, () => { S.cel(flame3(20, 62 + w, 3, 0), f.base, { line: S.L(2.6), shadow: f.shade, shadowT: 0, depth: 5, rim: f.hot, rimW: S.L(1), hi: false, tension: 0.6 }); S.cel(flame3(12, 44 - w, -2, 0), f.light, { line: S.L(1.8), shadow: f.base, shadowT: 0, depth: 3, rim: false, hi: false, tension: 0.6 }); });
    // the orb with a spiky flame corona
    const cor = []; for (let i = 0; i < 18; i++) { const a = i / 18 * TAU + (S.anim ? S.t * 0.4 : 0), r = i % 2 ? 22 : 30 + (i % 4) * 1.4; cor.push([cx + cos(a) * r, cy + sin(a) * r, 1]); }
    S.cel({ poly: cor }, f.base, { line: S.L(2.4), shadow: f.shade, shadowT: 0, depth: 5, rim: f.hot, rimW: S.L(1.2), hi: false });
    S.cel(tk.ellipsePts(cx, cy, 20, 20, 18), f.light, { line: S.L(2.4), shadow: f.base, shadowT: 0, depth: 6, rim: f.hot, rimW: S.L(1.4), hi: false, halftone: S.ht(3.4, 0.25) });
    S.circle(cx + 1, cy - 1, 13, f.hot); S.circle(cx + 2, cy - 2, 7.4, '#ffffff', 0.95);
    if (S.d) S.ink(spiralPts(cx, cy, 3, 17, S.t * 0.8, 1.3, 20), { w: 1.4, color: f.base, taper: 0.3, alpha: 0.6, wobble: 0 });
    for (let i = 0; i < (S.d ? 9 : 4); i++) S.circle(-40 + R() * 84, -30 + R() * 70, 0.9 + R() * 1.4, i % 2 ? pal.gold2 : '#ffffff', 0.9);
    S.spark(cx - 8, cy - 8, S.d ? 7 : 5, { color: '#ffffff' });
  };

  // a fist seen from the side, knuckles to the right, forearm entering from the left
  function sideFist(S, x, y, sc, f, o) {
    S.at(x, y, o && o.rot || 0, sc, sc, () => {
      // wrist and forearm
      S.cel([[-46, -13, 1], [-6, -14, 1], [-4, 14, 1], [-46, 17, 1]], SKIN, { line: S.L(2.8), tension: 0.2, shadow: SKIN_D, shadowT: 0, depth: 6, rim: SKIN_L, rimW: S.L(1), hi: false });
      // knuckles: four bumps down the front, then the folded fingers
      S.cel([[-6, -18, 1], [14, -20], [30, -14], [34, 2], [30, 16], [12, 20], [-6, 16, 1]], SKIN, { line: S.L(3), shadow: SKIN_D, shadowT: 0, depth: 7, rim: SKIN_L, rimW: S.L(1.4), hi: S.d ? SKIN_L : undefined, hiW: S.L(1.8) });
      [-12, -3, 6, 14].forEach((yy, i) => { S.cel(tk.ellipsePts(30, yy, 6, 5.2, 9), SKIN, { line: S.L(1.9), shadow: SKIN_D, depth: 1.8, hi: false, rim: false }); S.ink([[12, yy + 2], [26, yy + 1.5]], { w: 1.2, color: SKIN_D, taper: 0.4, alpha: 0.9, wobble: 0 }); });
      // thumb folded across
      S.cel([[2, 12, 1], [20, 10], [26, 16], [16, 24], [-2, 22]], SKIN, { line: S.L(2.2), shadow: SKIN_D, depth: 2.4, hi: false, rim: SKIN_L, rimW: S.L(0.8) });
      // wraps
      [-20, -12, -4].forEach((xx, i) => S.cel([[xx - 3, -14, 1], [xx + 3, -14.5, 1], [xx + 3.6, 16, 1], [xx - 2.4, 15.6, 1]], pal.paper, { line: S.L(1.6), tension: 0.2, shadow: pal.paper2, depth: 1.6, hi: false, rim: false }));
      S.ink([[-26, -12], [-40, -28 + S.wave(1.6, 0) * 3], [-52, -30]], { w: 3.6, color: pal.paper, taper: 0.3 });
    });
  }

  M.thunder_fist = (S) => {
    const { g, f } = S, R = S.rng('tf');
    const q = S.anim ? floor(S.t * 10) : 0;
    S.glow(16, 0, 60, f.glow, 0.4 + 0.12 * S.pulse(0.6));
    S.fill({ poly: starPts(24, 0, 11, 14, 36, 0.3) }, f.base, 0.4);
    sideFist(S, -4, 4, 0.94, f);
    // lightning coiling around the arm and bursting off the knuckles
    const arc = (pts, sd, w) => { const rr = tk.rng('tfa', S.seed, sd, q); const b = []; for (let i = 0; i < pts.length - 1; i++) { const seg = boltPts(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 5, 3, rr); b.push(...(i ? seg.slice(1) : seg)); } S.ink(b, { w: w * 2.4, color: f.glow, alpha: 0.5, taper: 0.1, wobble: 0, pressure: 'flat' }); S.ink(b, { w, color: '#ffffff', taper: 0.15, wobble: 0, pressure: 'flat' }); };
    arc([[-44, -12], [-30, 8], [-16, -14], [-2, 8], [12, -8]], 1, 1.8);
    arc([[-44, 10], [-28, -8], [-12, 12], [6, -12]], 2, 1.4);
    arc([[32, -8], [42, -18], [46, -28]], 3, 1.8); arc([[34, 6], [44, 10], [48, 20]], 4, 1.6);
    if (S.d) arc([[28, -18], [34, -30], [42, -38]], 5, 1.4);
    S.spark(40, 0, S.d ? 13 : 9, { color: '#ffffff', glow: 0.9 });
    if (S.d) { S.spark(-34, -32, 5, { color: pal.gold2 }); for (let i = 0; i < 8; i++) S.circle(-30 + R() * 80, -38 + R() * 76, 0.8 + R() * 1.4, R() < 0.5 ? '#ffffff' : f.hot, 0.9); }
  };

  M.fist = (S) => {
    const { g, f } = S, R = S.rng('fs');
    const P = S.pulse(1.2);
    // impact burst behind the fist, rings, and converging speed lines
    S.glow(0, -2, 60, f.glow, 0.36);
    S.fill({ poly: starPts(0, -2, 14, 22, 50, 0.1) }, f.base, 0.5);
    S.fill({ poly: starPts(0, -2, 14, 17, 38, 0.3) }, f.light, 0.5);
    S.ring(0, -4, 42 + 3 * P, 1.6, f.hot, 0.6); S.ring(0, -4, 48 + 3 * P, 1.2, '#ffffff', 0.4);
    // wrist
    S.cel([[-17, 18, 1], [17, 18, 1], [22, 48, 1], [-22, 48, 1]], SKIN, { line: S.L(2.8), tension: 0.2, shadow: SKIN_D, shadowT: 0, depth: 6, rim: SKIN_L, rimW: S.L(1), hi: false });
    [26, 33, 40].forEach((y) => S.cel([[-20 - (y - 26) * 0.1, y - 3, 1], [20 + (y - 26) * 0.1, y - 3, 1], [20.6 + (y - 26) * 0.1, y + 3, 1], [-20.6 - (y - 26) * 0.1, y + 3, 1]], pal.paper, { line: S.L(1.7), tension: 0.2, shadow: pal.paper2, depth: 1.6, hi: false, rim: false }));
    // the fist: a rounded block with four knuckle bumps on top
    S.cel([[-28, -14, 1], [-22, -26], [0, -30], [22, -26], [28, -14, 1], [30, 8], [22, 20, 1], [-22, 20, 1], [-30, 8]], SKIN, { line: S.L(3.2), shadow: SKIN_D, shadowT: 0, depth: 8, rim: SKIN_L, rimW: S.L(1.6), hi: S.d ? SKIN_L : undefined, hiW: S.L(2), halftone: S.ht(3.6, 0.22) });
    [-21, -7, 7, 21].forEach((x, i) => { S.cel(tk.ellipsePts(x, -18, 7.2, 8.4, 10), SKIN, { line: S.L(2), shadow: SKIN_D, depth: 2.6, hi: S.d ? SKIN_L : undefined, hiW: S.L(1), rim: false }); S.ink([[x - 0.5, -8], [x, 10]], { w: 1.4, color: SKIN_D, taper: 0.3, alpha: 0.85, wobble: 0 }); });
    S.ink([[-26, 6], [-6, 9], [14, 7], [26, 4]], { w: 1.6, color: SKIN_D, taper: 0.3, alpha: 0.8, wobble: 0.02 });
    S.cel([[-30, 4, 1], [-8, 14], [4, 22], [-6, 28], [-26, 22]], SKIN, { line: S.L(2.2), shadow: SKIN_D, depth: 2.6, hi: false, rim: SKIN_L, rimW: S.L(0.8) });
    S.spark(-30, -34, S.d ? 9 : 7, { color: '#ffffff' });
    if (S.d) { S.spark(34, -34, 6, { color: pal.gold2 }); S.spark(0, -38, 5, { color: '#ffffff' }); }
  };

  M.kick = (S) => {
    const { g, f } = S, R = S.rng('ki');
    const P = S.pulse(1.2);
    S.glow(0, -4, 60, f.glow, 0.36);
    // impact burst behind the foot, shock rings, and converging speed lines
    S.fill({ poly: starPts(2, -10, 14, 20, 50, 0.15) }, f.base, 0.5); S.fill({ poly: starPts(2, -10, 14, 15, 38, 0.35) }, f.light, 0.5);
    S.ring(2, -10, 44 + 3 * P, 1.6, f.hot, 0.6); S.ring(2, -10, 50 + 3 * P, 1.2, '#ffffff', 0.4);
    for (let i = 0; i < (S.d ? 10 : 4); i++) { const a = R() * TAU, r0 = 30 + R() * 10; S.ink([[2 + cos(a) * (r0 + 22), -10 + sin(a) * (r0 + 22)], [2 + cos(a) * r0, -10 + sin(a) * r0]], { w: 1 + R() * 1.6, color: '#ffffff', alpha: 0.6, taper: 0.5, wobble: 0 }); }
    S.at(2, 0, 0.22, 0.94, 0.94, () => {
      // the leg thrusting in from the lower left: a wrapped shin and a fluttering hakama cuff
      S.cel([[-13, 12, 1], [14, 12, 1], [17, 38, 1], [-17, 38, 1]], SKIN, { line: S.L(2.8), tension: 0.2, shadow: SKIN_D, shadowT: 0, depth: 6, rim: SKIN_L, rimW: S.L(1), hi: false });
      [16, 22, 28].forEach((y, i) => S.cel([[-14 - i * 0.6, y - 2.6, 1], [14 + i * 0.6, y - 2.6, 1], [14.6 + i * 0.6, y + 2.6, 1], [-14.6 - i * 0.6, y + 2.6, 1]], pal.paper, { line: S.L(1.6), tension: 0.2, shadow: pal.paper2, depth: 1.5, hi: false, rim: false }));
      S.cel([[-16, 32, 1], [16, 32, 1], [20, 46, 1], [-20, 46, 1]], f.base, { line: S.L(2.6), tension: 0.2, shadow: f.shade, shadowT: 0, depth: 5, rim: f.hot, rimW: S.L(1), hi: false });
      S.ink([[-8, 34], [-9, 45]], { w: 1.4, color: f.dark, alpha: 0.7, taper: 0.4, wobble: 0 }); S.ink([[4, 34], [5, 45]], { w: 1.4, color: f.dark, alpha: 0.7, taper: 0.4, wobble: 0 });
      S.ink([[18, 40], [30, 38 + S.wave(1.6, 0) * 3], [38, 44]], { w: 4.4, color: f.base, taper: 0.3 }); S.ink([[18, 40], [30, 38 + S.wave(1.6, 0) * 3], [38, 44]], { w: 1.6, color: f.hot, taper: 0.3, alpha: 0.8 });
      // the sandalled sole, filling the frame: straw weave, red hanao straps, toes peeking over the front
      const sole = [[-9, 18], [-10, 6], [-14, -6], [-16, -18], [-10, -28], [4, -30], [15, -24], [17, -8], [13, 8], [10, 20], [0, 25]];
      S.cel(sole, '#d9b26a', { line: S.L(3.2), shadow: '#9a7440', shadowT: 0, depth: 7, rim: '#f3d9a0', rimW: S.L(1.4), hi: S.d ? '#f3d9a0' : undefined, hiW: S.L(1.6), halftone: S.ht(3.4, 0.2),
        decor: (gg) => { gg.strokeStyle = tk.rgba('#7a5a2a', 0.55); gg.lineWidth = S.T(1); for (let i = -6; i < 8; i++) { gg.beginPath(); gg.moveTo(-20, i * 5); gg.lineTo(20, i * 5 - 10); gg.stroke(); gg.beginPath(); gg.moveTo(-20, i * 5 - 10); gg.lineTo(20, i * 5); gg.stroke(); } } });
      S.ink([[0, -26], [-14, 6]], { w: 3.8, color: INK, taper: 0.05, pressure: 'flat', wobble: 0 }); S.ink([[0, -26], [-14, 6]], { w: 2.2, color: pal.vermilion, taper: 0.05, pressure: 'flat', wobble: 0 });
      S.ink([[0, -26], [14, 4]], { w: 3.8, color: INK, taper: 0.05, pressure: 'flat', wobble: 0 }); S.ink([[0, -26], [14, 4]], { w: 2.2, color: pal.vermilion, taper: 0.05, pressure: 'flat', wobble: 0 });
      S.ink([[0, -26], [0, -34]], { w: 3.4, color: pal.vermilion, taper: 0.05, pressure: 'flat', wobble: 0 });
      [[-13, -30, 5.6], [-5, -36, 4], [3, -36, 3.6], [10, -33, 3.2], [15, -28, 2.8]].forEach((t) => S.cel(tk.ellipsePts(t[0], t[1], t[2], t[2] * 0.9, 8), SKIN, { line: S.L(1.6), shadow: SKIN_D, depth: 1.2, hi: false, rim: false }));
    });
    S.spark(-30, -34, S.d ? 9 : 7, { color: '#ffffff' });
    if (S.d) { S.spark(34, -36, 6, { color: pal.gold2 }); S.spark(0, -42, 5, { color: '#ffffff' }); }
  };

  M.arrow = (S) => {
    const { g, f } = S, R = S.rng('ar');
    const P = S.pulse(1.4);
    S.glow(22, -20, 54, f.glow, 0.34);
    // the yumi bow at the left; the string is straight after the release
    const bow = bez3([-32, -44], [-52, -14], [-52, 14], [-32, 44], 16);
    S.ink(bow, { w: 5.6, color: INK, taper: 0.1, wobble: 0.03, pressure: (u) => 0.5 + 0.5 * sin(PI * u) });
    S.ink(bow, { w: 2.6, color: f.dark, taper: 0.1, wobble: 0, pressure: (u) => 0.5 + 0.5 * sin(PI * u) });
    S.ink([[-32, -44], [-32, 44]], { w: 1, color: '#ffffff', taper: 0.05, pressure: 'flat', wobble: 0, alpha: 0.8 });
    S.cel([[-53, -5, 1], [-47, -5, 1], [-47, 5, 1], [-53, 5, 1]], f.base, { line: S.L(1.5), tension: 0.2, shadow: f.shade, depth: 1.6, hi: false, rim: false });
    // speed streaks
    for (let i = 0; i < (S.d ? 9 : 4); i++) { const y = -30 + R() * 60, x = -22 + R() * 20; S.ink([[x, y + 10], [x + 24 + R() * 24, y - 2]], { w: 1 + R() * 1.6, color: R() < 0.4 ? '#ffffff' : f.hot, alpha: 0.7, taper: 0.5, wobble: 0 }); }
    // the arrow, drawn horizontally then tilted up and to the right
    S.at(-4, 10, -0.5, 0.92, 0.92, () => {
      const wob = S.wave(0.8, 0) * 0.4;
      // shaft, bands and nock
      S.cel([[-44, -1.6, 1], [40, -1.6, 1], [40, 1.6, 1], [-44, 1.6, 1]], pal.paper2, { line: S.L(2), tension: 0.2, shadow: '#b09a68', depth: 1.4, hi: false, rim: false });
      [4, 30].forEach((x) => S.ink([[x, -2], [x, 2]], { w: 2.6, color: pal.vermilion, taper: 0, pressure: 'flat', wobble: 0 }));
      S.cel([[-46, -3, 1], [-42, -3, 1], [-42, 3, 1], [-46, 3, 1]], f.dark, { line: S.L(1.4), tension: 0.2, shadow: false, hi: false, rim: false });
      // fletching: vanes slanting back toward the nock, one red-striped, one white
      S.cel({ poly: [[-14, -1.8], [-32, -1.8], [-42, -10.5], [-25, -10.5]] }, '#ffffff', { line: S.L(1.7), shadow: '#cfd8ec', depth: 2, hi: false, rim: false });
      S.ink([[-22, -2], [-33, -10]], { w: 1.6, color: pal.vermilion, taper: 0.1, wobble: 0 });
      S.cel({ poly: [[-14, 1.8], [-32, 1.8], [-40, 9], [-25, 9]] }, pal.vermilion, { line: S.L(1.7), shadow: '#a01818', depth: 1.6, hi: false, rim: false });
      // the leaf-shaped head, with a hot glint
      S.cel({ poly: [[38, 0], [43, -6.2], [60, 0], [43, 6.2]] }, '#e4ecf8', { line: S.L(2.2), shadow: '#8a96c0', depth: 2, rim: f.glow, rimW: S.L(0.8), hi: '#ffffff', hiW: S.L(1), tension: 0.3 });
      S.cel({ poly: [[34, -3], [40, -3], [40, 3], [34, 3]] }, pal.gold, { line: S.L(1.5), shadow: '#a8782a', depth: 1, hi: false, rim: false, tension: 0.2 });
      // paper prayer streamers (the hamaya charm) fluttering off the shaft
      S.ink([[16, 2], [12, 12 + wob * 6], [4, 20 + wob * 8]], { w: 3.4, color: '#ffffff', taper: 0.3, wobble: 0.03 }); S.ink([[18, 2], [18, 12 + wob * 6], [14, 22]], { w: 2.4, color: pal.vermilion, taper: 0.3, wobble: 0.03 });
    });
    // impact at the tip
    const tip = rot2(60 * 0.92, 0, -0.5);
    S.ring(tip[0] - 4, tip[1] + 10, 8 + 2 * P, 1.6, f.hot, 0.9); S.ring(tip[0] - 4, tip[1] + 10, 15 + 3 * P, 1.2, '#ffffff', 0.5);
    S.spark(tip[0] - 3, tip[1] + 9, S.d ? 11 : 8, { color: '#ffffff', glow: 0.9 });
    if (S.d) S.spark(-6, -30, 5, { color: pal.gold2 });
  };


  // ---- earth and creatures ----
  M.quake = (S) => {
    const { g, f } = S, R = S.rng('qk'), V = S.variant(3);
    const P = S.pulse(1.2);
    S.glow(0, 12, 60, f.glow, 0.3);
    if (V === 1) {
      // stone pillars thrust up out of the ground
      S.cel(tk.ellipsePts(0, 30, 48, 14, 22), f.mid, { line: S.L(3), shadow: f.dim, shadowT: 0, depth: 5, rim: f.glow, rimW: S.L(1.2), hi: false });
      [[-32, 10, 12, 44], [-16, 4, 13, 58], [0, -6, 15, 74], [17, 2, 13, 60], [33, 12, 12, 46]].forEach((p, i) => {
        const bob = S.anim ? S.wave(1.6, i * 0.17) * 1.5 : 0, x = p[0], top = 32 - p[3] + bob, w = p[2];
        S.cel([[x - w / 2, 34, 1], [x - w / 2 - 1, top + 6, 1], [x - w / 4, top - 2, 1], [x + w / 4, top + 1, 1], [x + w / 2, top + 7, 1], [x + w / 2 + 1, 34, 1]], f.mid, { line: S.L(2.6), shadow: f.dim, shadowT: 0, depth: w * 0.36, rim: f.glow, rimW: S.L(1.1), hi: f.light, hiW: S.L(1.2), tension: 0.2, halftone: S.ht(3.4, 0.3) });
        S.ink([[x - w * 0.1, top + 8], [x + w * 0.1, top + 22], [x - w * 0.15, top + 34]], { w: 1.3, color: INK, alpha: 0.7, taper: 0.4, wobble: 0.05 });
      });
      S.dash(0, 34, 50, 14, 1.6, f.hot, 0.8, [6, 4], -S.t * 8);
    } else if (V === 2) {
      // a crater: a raised rim, a glowing floor, debris thrown out around it
      S.cel(tk.ellipsePts(0, 20, 46, 20, 24), f.mid, { line: S.L(3), shadow: f.dim, shadowT: 0, depth: 7, rim: f.glow, rimW: S.L(1.4), hi: false, halftone: S.ht(3.6, 0.3) });
      S.cel(tk.ellipsePts(0, 22, 32, 12, 20), f.dim, { line: S.L(2.4), shadow: INK, shadowT: 0, depth: 6, rim: false, hi: false });
      S.fill(tk.ellipsePts(0, 22, 20, 7, 16), f.hot, 0.8); S.fill(tk.ellipsePts(0, 22, 11, 4, 12), '#ffffff', 0.9);
      for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + 0.3, rx = 46 + 4 * sin(i), x = cos(a) * rx, y = 20 + sin(a) * 20; S.at(x, y, a, 1, 1, () => S.cel(leafPts(9, 8), f.mid, { line: S.L(1.8), shadow: f.dim, depth: 2.4, hi: false, rim: false, tension: 0.4 })); }
      const bob = S.anim ? S.wave(1.4, 0) * 2 : 0; [[-14, -18, 9], [16, -26, 11], [0, -38, 8]].forEach((r, i) => S.at(r[0], r[1] + bob * (i % 2 ? 1 : -1), i * 0.6, 1, 1, () => S.cel([[-r[2], 0, 1], [-r[2] * 0.6, -r[2] * 0.8], [r[2] * 0.4, -r[2]], [r[2], -r[2] * 0.2, 1], [r[2] * 0.7, r[2] * 0.7], [-r[2] * 0.3, r[2] * 0.8]], f.mid, { line: S.L(2.4), shadow: f.dim, shadowT: 0, depth: r[2] * 0.45, rim: f.glow, rimW: S.L(1.1), hi: f.light, hiW: S.L(1.2), tension: 0.35 })));
      S.dash(0, 22, 52, 22, 1.6, f.hot, 0.75, [6, 4], -S.t * 8);
      cloud(S, -34, 38, 20, f.pale, f.light); cloud(S, 34, 40, 22, f.pale, f.light);
    } else {
      const slab = tk.ellipsePts(0, 22, 48, 18, 22);
      S.cel(slab, f.mid, { line: S.L(3), shadow: f.dim, shadowT: 0, depth: 7, rim: f.glow, rimW: S.L(1.4), hi: false, halftone: S.ht(3.6, 0.3),
        decor: (gg) => {
          gg.beginPath(); gg.moveTo(-6, 42); gg.lineTo(-10, 30); gg.lineTo(-4, 24); gg.lineTo(-12, 14); gg.lineTo(-2, 8); gg.lineTo(4, 14); gg.lineTo(0, 24); gg.lineTo(10, 30); gg.lineTo(6, 42); gg.closePath();
          const gr = gg.createLinearGradient(0, 8, 0, 42); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, f.hot); gr.addColorStop(1, f.base); gg.fillStyle = gr; gg.fill();
          gg.strokeStyle = INK; gg.lineWidth = S.T(2.2); gg.lineJoin = 'round'; gg.stroke();
          gg.lineWidth = S.T(1.7); gg.beginPath();
          [[[-10, 30], [-24, 26], [-30, 30], [-42, 24]], [[10, 30], [24, 32], [32, 28], [44, 32]], [[-4, 24], [-16, 18], [-24, 20], [-34, 14]], [[4, 14], [16, 16], [24, 12], [36, 16]]].forEach((c) => { gg.moveTo(c[0][0], c[0][1]); c.slice(1).forEach((p) => gg.lineTo(p[0], p[1])); });
          gg.stroke();
        } });
      S.dash(0, 22, 52, 21, 1.6, f.hot, 0.75, [6, 4], -S.t * 8);
      const rocks = [[-22, -6, 10, -0.4], [22, -16, 12, 0.5], [2, -30, 14, 0.1], [-34, 8, 6, 0.9], [36, 2, 7, -0.6]];
      rocks.forEach((r, i) => { if (!S.d && i > 2) return; const bob = S.anim ? S.wave(1.4, i * 0.2) * 2 : 0; S.at(r[0], r[1] + bob, r[3], 1, 1, () => S.cel([[-r[2], 0, 1], [-r[2] * 0.6, -r[2] * 0.8], [r[2] * 0.4, -r[2]], [r[2], -r[2] * 0.2, 1], [r[2] * 0.7, r[2] * 0.7], [-r[2] * 0.3, r[2] * 0.8]], f.mid, { line: S.L(2.4), shadow: f.dim, shadowT: 0, depth: r[2] * 0.45, rim: f.glow, rimW: S.L(1.1), hi: f.light, hiW: S.L(1.2), tension: 0.35 })); });
      [[-32, 36, 22], [34, 38, 24], [-6, 50, 20]].forEach((d) => cloud(S, d[0], d[1], d[2], f.pale, f.light));
    }
    S.spark(0, 12, S.d ? 10 : 8, { color: '#ffffff', glow: 0.8 });
    if (S.d) for (let i = 0; i < 9; i++) S.circle(-40 + R() * 80, -36 + R() * 60, 0.8 + R() * 1.4, R() < 0.5 ? f.pale : '#ffffff', 0.85);
  };

  M.crane = (S) => {
    const { g, f } = S, R = S.rng('cr');
    S.glow(0, -6, 58, f.glow, 0.28);
    const flap = S.wave(2.2, 0) * 0.06, WHITE = '#fff8f0', WH_D = '#c9cfe4';
    // a fan of long primary feathers rooted at (x, y), black at the tips
    const fan = (x, y, a0, a1, n, len0, len1, wid, base, dark, rimOn) => {
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1), a = lerp(a0, a1, u) + flap, len = lerp(len0, len1, Math.sin(u * PI * 0.5 + 0.15)), tipFrac = 0.3;
        S.at(x, y, a + PI / 2, 1, 1, () => S.cel(leafPts(len, wid), i % 2 ? base : tk.mix(base, dark, 0.18), { line: S.L(1.8), shadow: dark, shadowT: 0, depth: 2.2, rim: rimOn ? f.glow : false, rimW: S.L(0.7), hi: false, tension: 0.6,
          decor: (gg) => { gg.fillStyle = INK; gg.beginPath(); gg.moveTo(-wid, -len * (1 - tipFrac)); gg.quadraticCurveTo(0, -len * (1 - tipFrac) + wid * 0.9, wid, -len * (1 - tipFrac)); gg.lineTo(wid, -len - 2); gg.lineTo(-wid, -len - 2); gg.closePath(); gg.fill(); } }));
      }
    };
    const bird = (bx, by, sc, br) => S.at(bx, by, br, sc, sc, () => {
      // far wing first: up and forward, in shadow
      fan(8, -6, -1.55, -0.55, 8, 40, 30, 7.4, WH_D, '#8a96c0', false);
      // legs trailing behind
      S.ink([[-16, 6], [-34, 12], [-50, 10]], { w: 2.2, color: INK, taper: 0.1, wobble: 0.02 }); S.ink([[-14, 9], [-32, 19], [-48, 22]], { w: 2.2, color: INK, taper: 0.1, wobble: 0.02 });
      // short black tail feathers
      [[-2.95, 30], [-3.12, 34], [-3.3, 27]].forEach((tf, i) => S.at(-20, 4, tf[0] + PI / 2, 1, 1, () => S.cel(leafPts(tf[1], 6.4), INK, { line: S.L(1.4), shadow: false, hi: false, rim: f.glow, rimW: S.L(0.6), tension: 0.6 })));
      // body
      S.cel([[-24, 5, 1], [-16, -6], [0, -11], [16, -6], [22, 2, 1], [8, 11], [-12, 11]], WHITE, { line: S.L(2.8), shadow: WH_D, shadowT: 0, depth: 6, rim: f.glow, rimW: S.L(1.2), hi: '#ffffff', hiW: S.L(1.6), tension: 0.6 });
      // neck sweeping forward and up, then the head
      tk.ribbon(g, [[14, -3], [26, -8], [30, -22], [40, -30]], WHITE, { wMax: 7.4, w0: 9, w1: 5, gloss: false, strands: 0, line: S.L(2.4), rim: f.glow, rimW: S.L(0.8), shadow: WH_D, shadowW: 0.5, cap: 'round' });
      S.cel(tk.ellipsePts(43, -31, 6.6, 5, 10), WHITE, { line: S.L(2.2), shadow: WH_D, depth: 1.8, hi: false, rim: false });
      S.fill(tk.ellipsePts(41.6, -35, 3.6, 2.1, 8), pal.vermilion);
      S.cel({ poly: [[47, -32], [64, -28], [47, -28]] }, '#e8c070', { line: S.L(1.6), shadow: '#a8782a', depth: 1, hi: false, rim: false, tension: 0.3 });
      S.ink([[36, -27], [42, -24]], { w: 3, color: INK, taper: 0.2 });
      S.circle(44, -32, 1.2, INK);
      // near wing over the body: up and back
      fan(2, -8, -2.55, -1.65, 9, 46, 36, 8.4, WHITE, WH_D, true);
      S.cel(tk.ellipsePts(-1, -6, 13, 8, 10, -0.5), WHITE, { line: S.L(2), shadow: WH_D, depth: 3, hi: false, rim: f.glow, rimW: S.L(0.7) });
    });
    const V = S.variant(3);
    if (V === 2 && S.d) { g.save(); g.globalAlpha *= 0.85; bird(-26, -24, 0.46, -0.2); g.restore(); }
    if (V === 1) bird(-4, 10, 0.98, 0.06); else bird(0, 6, 0.9, -0.05);
    S.spark(34, -34, S.d ? 8 : 6, { color: '#ffffff' });
    if (S.d) { for (let i = 0; i < 7; i++) tk.petal(g, -40 + R() * 80, -20 + R() * 60, 2.4 + R() * 1.6, R() * TAU, 0.85, f.light); S.spark(-38, -30, 5, { color: pal.gold2 }); }
  };

  M.fox = (S) => {
    const { g, f } = S, R = S.rng('fx');
    const w = S.wave(1.6, 0);
    S.glow(0, 0, 58, f.glow, 0.28);
    // foxfire wisps flanking the face
    const wisp = (x, y, sc, ph) => S.at(x, y, 0, sc, sc, () => { S.glow(0, -4, 16, f.glow, 0.7); S.cel(flamePts(8, 22 + 3 * S.wave(1.1, ph), 1, 2), f.hot, { line: S.L(1.8), shadow: f.light, shadowT: 0, depth: 2, rim: false, hi: false }); S.fill(flamePts(3.6, 11, 0, 0), '#ffffff', 0.95); });
    wisp(-40, -8, 1, 0); wisp(42, -14, 0.9, 0.5); if (S.d) wisp(38, 24, 0.6, 0.2);
    // ears
    [-1, 1].forEach((sd) => { S.cel([[sd * 30, -10, 1], [sd * 26, -46], [sd * 8, -22, 1]], f.base, { line: S.L(2.8), shadow: f.shade, depth: 4, rim: f.hot, rimW: S.L(1.2), hi: false, tension: 0.4 }); S.cel([[sd * 26, -14, 1], [sd * 24, -37], [sd * 13, -21, 1]], INK, { line: false, shadow: false, hi: false, rim: false, tension: 0.4 }); });
    // head with cheek ruffs
    const head = [[0, -26, 1], [16, -24], [34, -10], [44, 6, 1], [30, 8], [40, 24, 1], [22, 22], [14, 36], [0, 42, 1], [-14, 36], [-22, 22], [-40, 24, 1], [-30, 8], [-44, 6, 1], [-34, -10], [-16, -24]];
    S.cel(head, f.base, { line: S.L(3), shadow: f.shade, shadowT: 0, depth: 8, rim: f.hot, rimW: S.L(1.6), hi: S.d ? f.light : undefined, hiW: S.L(2), halftone: S.ht(3.8, 0.28), tension: 0.5,
      decor: (gg) => {
        // white muzzle and cheeks
        gg.fillStyle = '#fff8f0'; gg.beginPath(); gg.moveTo(-40, 24); gg.lineTo(-30, 8); gg.lineTo(-14, 2); gg.lineTo(0, 10); gg.lineTo(14, 2); gg.lineTo(30, 8); gg.lineTo(40, 24); gg.lineTo(22, 22); gg.lineTo(14, 36); gg.lineTo(0, 44); gg.lineTo(-14, 36); gg.lineTo(-22, 22); gg.closePath(); gg.fill();
        gg.fillStyle = tk.rgba('#b5a27a', 0.35); gg.beginPath(); gg.moveTo(-2, 42); gg.lineTo(-14, 36); gg.lineTo(-22, 22); gg.lineTo(-10, 30); gg.closePath(); gg.fill();
        // forehead diamond and cheek stripes in the dark palette tone
        gg.fillStyle = f.dark; gg.beginPath(); gg.moveTo(0, -22); gg.lineTo(5, -14); gg.lineTo(0, -6); gg.lineTo(-5, -14); gg.closePath(); gg.fill();
      } });
    // eyes: slanted slits with a glowing iris and swept liner
    [-1, 1].forEach((sd) => {
      S.cel([[sd * 8, 0, 1], [sd * 18, -6], [sd * 30, -9, 1], [sd * 20, 3], [sd * 10, 4]], '#fff8f0', { line: S.L(2), shadow: false, hi: false, rim: false, tension: 0.5 });
      S.circle(sd * 18, -2, 3.8, f.dark); S.circle(sd * 18, -2, 2.2, INK); S.circle(sd * 16.6, -3.4, 1, '#ffffff');
      S.ink([[sd * 6, 2], [sd * 18, -6], [sd * 34, -14]], { w: 3.2, color: INK, taper: 0.25, wobble: 0.03 });
      S.ink([[sd * 20, -14], [sd * 28, -22], [sd * 36, -26]], { w: 2.2, color: pal.vermilion, taper: 0.3, wobble: 0.03 });
    });
    S.cel({ poly: [[-5, 12], [5, 12], [0, 18]] }, INK, { line: S.L(1.4), shadow: false, hi: false, rim: false, tension: 0.3 });
    S.ink([[0, 18], [0, 22], [-6, 26]], { w: 1.6, color: INK, taper: 0.3, wobble: 0 }); S.ink([[0, 22], [6, 26]], { w: 1.6, color: INK, taper: 0.3, wobble: 0 });
    if (S.d) [-1, 1].forEach((sd) => [0, 1, 2].forEach((k) => S.ink([[sd * 20, 16 + k * 3], [sd * 36, 12 + k * 6]], { w: 0.9, color: INK, alpha: 0.7, taper: 0.5, wobble: 0 })));
    S.spark(-30, -34, S.d ? 6 : 5, { color: '#ffffff' });
  };

  M.tiger = (S) => {
    const { g, f } = S, R = S.rng('tg');
    S.glow(0, 0, 58, f.glow, 0.28);
    // three claw slashes behind the head
    [[-40, -34, 18, 10], [-30, -40, 30, 8], [-20, -46, 44, 6]].forEach((c, i) => S.ink([[c[0], c[1]], [c[0] + 30, c[1] + 50 + i * 3]], { w: 6 - i, color: f.hot, alpha: 0.7, taper: 0.4, wobble: 0.03 }));
    // round ears
    [-1, 1].forEach((sd) => { S.cel(tk.ellipsePts(sd * 28, -28, 10, 9.5, 10), f.base, { line: S.L(2.6), shadow: f.shade, depth: 3, rim: f.hot, rimW: S.L(1), hi: false }); S.cel(tk.ellipsePts(sd * 28, -27, 5, 4.6, 8), '#fff8f0', { line: false, shadow: false, hi: false, rim: false }); });
    const head = [[0, -34, 1], [20, -32], [36, -18], [44, 2, 1], [36, 8], [40, 22, 1], [24, 24], [14, 36], [0, 42, 1], [-14, 36], [-24, 24], [-40, 22, 1], [-36, 8], [-44, 2, 1], [-36, -18], [-20, -32]];
    S.cel(head, f.base, { line: S.L(3.2), shadow: f.shade, shadowT: 0, depth: 8, rim: f.hot, rimW: S.L(1.6), hi: S.d ? f.light : undefined, hiW: S.L(2), halftone: S.ht(3.8, 0.26), tension: 0.5,
      decor: (gg) => {
        gg.fillStyle = '#fff8f0';
        gg.beginPath(); gg.moveTo(-36, 22); gg.lineTo(-30, 8); gg.lineTo(-14, 4); gg.lineTo(0, 10); gg.lineTo(14, 4); gg.lineTo(30, 8); gg.lineTo(36, 22); gg.lineTo(20, 26); gg.lineTo(12, 38); gg.lineTo(0, 44); gg.lineTo(-12, 38); gg.lineTo(-20, 26); gg.closePath(); gg.fill();
        gg.beginPath(); gg.ellipse(-16, -10, 7, 4, 0.5, 0, TAU); gg.ellipse(16, -10, 7, 4, -0.5, 0, TAU); gg.fill();
        gg.fillStyle = tk.rgba('#b5a27a', 0.3); gg.beginPath(); gg.moveTo(0, 44); gg.lineTo(-12, 38); gg.lineTo(-20, 26); gg.lineTo(-8, 34); gg.closePath(); gg.fill();
      } });
    // the 王 mark on the brow and cheek stripes
    [[[-6, -30], [-5, -20]], [[6, -30], [5, -20]], [[0, -32], [0, -14]]].forEach((c) => S.ink(c, { w: 3.6, color: INK, taper: 0.2, wobble: 0.03 }));
    S.ink([[-9, -25], [9, -25]], { w: 3, color: INK, taper: 0.2, wobble: 0.03 });
    [-1, 1].forEach((sd) => { [[-8, 30], [-1, 36], [6, 42]].forEach((c, i) => S.ink([[sd * (38 - i * 1), 2 + i * 3 + c[0] * 0], [sd * (28 - i * 1), 6 + i * 3.5]], { w: 3 - i * 0.4, color: INK, taper: 0.3, wobble: 0.03 })); [[-30, -20, -22, -8], [-38, -8, -28, 0]].forEach((c) => S.ink([[sd * -c[0], c[1]], [sd * -c[2], c[3]]], { w: 2.8, color: INK, taper: 0.3, wobble: 0.03 })); });
    // fierce eyes with glow and slit pupils
    [-1, 1].forEach((sd) => {
      S.cel([[sd * 8, -2, 1], [sd * 16, -8], [sd * 27, -8, 1], [sd * 20, 2], [sd * 11, 3]], '#fff8f0', { line: S.L(2), shadow: false, hi: false, rim: false, tension: 0.5 });
      S.circle(sd * 18, -3, 4.2, f.glow); S.circle(sd * 18, -3, 4.2, pal.gold, 0.6); S.ink([[sd * 18, -6.6], [sd * 18, 0.6]], { w: 2, color: INK, taper: 0.1, pressure: 'flat', wobble: 0 }); S.circle(sd * 16.6, -4, 0.9, '#ffffff');
      S.ink([[sd * 6, -8], [sd * 16, -14], [sd * 30, -14]], { w: 3.6, color: INK, taper: 0.2, wobble: 0.03 });
    });
    // nose, snarl and fangs
    S.cel({ poly: [[-6, 12], [6, 12], [0, 20]] }, '#e88aa0', { line: S.L(1.8), shadow: '#a04860', depth: 1.2, hi: false, rim: false, tension: 0.3 });
    S.cel([[-14, 26, 1], [0, 22], [14, 26, 1], [10, 38], [0, 42], [-10, 38]], '#7a1638', { line: S.L(2), shadow: false, hi: false, rim: false, tension: 0.6 });
    S.cel({ poly: [[-11, 26], [-6, 26], [-8.5, 34]] }, '#ffffff', { line: S.L(1.2), shadow: false, hi: false, rim: false, tension: 0.2 }); S.cel({ poly: [[11, 26], [6, 26], [8.5, 34]] }, '#ffffff', { line: S.L(1.2), shadow: false, hi: false, rim: false, tension: 0.2 });
    S.cel(tk.ellipsePts(0, 37, 5, 3.2, 8), '#ff7fa0', { line: S.L(1), shadow: false, hi: false, rim: false });
    if (S.d) [-1, 1].forEach((sd) => [0, 1, 2].forEach((k) => S.ink([[sd * 18, 18 + k * 3], [sd * 40, 12 + k * 7]], { w: 0.9, color: INK, alpha: 0.7, taper: 0.5, wobble: 0 })));
    S.spark(-34, -36, S.d ? 6 : 5, { color: '#ffffff' });
  };

  M.dragon = (S) => {
    const { g, f } = S, R = S.rng('dr'), V = S.variant(2);
    const w = S.wave(2.6, 0), sx = V === 1 ? -1 : 1;                                   // variant 1 is the mirror-image coil
    S.glow(0, 0, 60, f.glow, 0.28);
    S.at(6 * sx, 2, 0, 0.92 * sx, 0.92, () => {
      // the pearl it chases, top right
      S.glow(32, -30, 20, pal.gold2, 0.85);
      S.cel(tk.ellipsePts(32, -30, 9, 9, 12), '#fff8f0', { line: S.L(2), shadow: f.light, depth: 3, hi: '#ffffff', hiW: S.L(1.2), rim: pal.gold2, rimW: S.L(0.8) });
      S.spark(30, -32, S.d ? 6 : 5, { color: '#ffffff', glow: 0.5 });
      // the coiling body: tail at the lower right, up through two loops, neck curving to the head at the upper left
      const spine = [[46, 34], [46, 12], [32, -2], [12, 4], [-4, 22], [-24, 32], [-42, 18], [-42, -6], [-30, -22]];
      const wOf = (u) => (u < 0.1 ? 0.12 + u * 4 : u > 0.86 ? 0.82 - (u - 0.86) * 1.2 : 0.55 + 0.45 * sin((u - 0.1) / 0.76 * PI * 0.92));
      tk.ribbon(g, spine, f.base, { wMax: 21, profile: wOf, cap: 'round', gloss: false, strands: 0, line: S.L(3), rim: f.hot, rimW: S.L(1.4), shadow: f.shade, shadowW: 0.5, halftone: S.ht(3.6, 0.3), tipColor: f.light, tipFrac: 0.14, tipShadow: f.base,
        decor: (gg) => {
          const d = tk.flatten(spine, { step: 4 });
          for (let i = 3; i < d.length / 2 - 3; i += 2) { const x = d[2 * i], y = d[2 * i + 1], dx = d[2 * i + 2] - d[2 * i - 2], dy = d[2 * i + 3] - d[2 * i - 1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
            gg.strokeStyle = tk.rgba(INK, 0.4); gg.lineWidth = S.T(1.2); gg.beginPath(); gg.moveTo(x + nx * 10, y + ny * 10); gg.quadraticCurveTo(x + dx / l * 4, y + dy / l * 4, x - nx * 10, y - ny * 10); gg.stroke();
            gg.fillStyle = tk.rgba(f.pale, 0.55); gg.beginPath(); gg.moveTo(x - nx * 10, y - ny * 10); gg.quadraticCurveTo(x + dx / l * 3, y + dy / l * 3, x - nx * 4, y - ny * 4); gg.lineTo(x - nx * 4 + dx / l * 2, y - ny * 4 + dy / l * 2); gg.closePath(); gg.fill(); }
        } });
      const dense = tk.flatten(spine, { step: 4 }), pts = []; for (let i = 0; i < dense.length; i += 2) pts.push([dense[i], dense[i + 1]]);
      for (let i = 0; i < (S.d ? 11 : 6); i++) { const u = 0.1 + i * (S.d ? 0.075 : 0.14), p = polyAt(pts, u), nx = p.ty, ny = -p.tx, ww = 10.5 * wOf(u) + 2; const bx = p.x + nx * ww * 0.9, by = p.y + ny * ww * 0.9; S.cel({ poly: [[bx - p.tx * 3.6, by - p.ty * 3.6], [bx + nx * 9 - p.tx * 3, by + ny * 9 - p.ty * 3], [bx + p.tx * 3.6, by + p.ty * 3.6]] }, i % 2 ? f.hot : f.light, { line: S.L(1.6), shadow: f.base, depth: 1.4, hi: false, rim: false, tension: 0.3 }); }
      // hind and fore legs with claws
      [[8, 8, -0.5], [-30, 26, 0.5], [-34, -14, 2.5]].forEach((c, i) => { if (i === 2 && !S.d) return; S.at(c[0], c[1], c[2], 1, 1, () => { S.ink([[0, 0], [-6, 10], [-2, 16]], { w: 4.6, color: INK, taper: 0.2, wobble: 0 }); S.ink([[0, 0], [-6, 10], [-2, 16]], { w: 2.6, color: f.base, taper: 0.2, wobble: 0 }); for (let k = -1; k <= 1; k++) S.ink([[-2, 16], [-2 + k * 4, 22]], { w: 1.7, color: '#fff8f0', taper: 0.2, wobble: 0 }); }); });
      // the head: big, in profile, facing right toward the pearl
      const hp = spine[spine.length - 1];
      S.at(hp[0] + 2, hp[1] - 4, -0.28 + 0.05 * w, 0.96, 0.96, () => {
        // mane flames streaming back behind the skull
        for (let i = 0; i < 5; i++) S.at(-6, -12 + i * 5, -PI / 2 - 0.25 - 0.15 * i + 0.08 * S.wave(1.2, i * 0.2), 1, 1, () => S.cel(flame3(5, 26 - i * 2, 0, 0), i % 2 ? f.light : f.hot, { line: S.L(1.6), shadow: f.base, depth: 1.6, hi: false, rim: false, tension: 0.6 }));
        // two branching antlers
        tk.ribbon(g, [[-2, -13], [-10, -24], [-22, -28], [-30, -38]], pal.gold2, { wMax: 5.6, w0: 5.4, w1: 0.6, gloss: false, strands: 0, line: S.L(1.6), rim: false, shadow: pal.gold, shadowW: 0.5 });
        tk.ribbon(g, [[-12, -26], [-14, -36], [-10, -44]], pal.gold2, { wMax: 3.6, w0: 3.4, w1: 0.5, gloss: false, strands: 0, line: S.L(1.3), rim: false, shadow: pal.gold, shadowW: 0.5 });
        tk.ribbon(g, [[3, -13], [-4, -28], [-10, -34]], pal.gold2, { wMax: 4.4, w0: 4.2, w1: 0.5, gloss: false, strands: 0, line: S.L(1.4), rim: false, shadow: pal.gold, shadowW: 0.5 });
        // the skull, brow ridge and upper jaw
        S.cel([[-12, -6, 1], [-8, -15], [6, -18], [18, -14], [30, -10], [40, -6, 1], [40, 0, 1], [30, 2], [12, 4], [-6, 8], [-13, 2]], f.light, { line: S.L(2.8), shadow: f.base, shadowT: 0, depth: 5, rim: f.hot, rimW: S.L(1.2), hi: false, tension: 0.5 });
        // lower jaw, open
        S.cel([[6, 4, 1], [26, 4], [40, 12, 1], [32, 19], [12, 19], [2, 13]], f.base, { line: S.L(2.4), shadow: f.shade, depth: 3, hi: false, rim: false, tension: 0.4 });
        S.cel({ poly: [[10, 6], [32, 8], [30, 14], [12, 15]] }, '#c8324a', { line: false, shadow: false, hi: false, rim: false });
        S.cel({ poly: [[16, 12], [30, 11], [26, 15], [18, 15]] }, '#ff7fa0', { line: false, shadow: false, hi: false, rim: false });
        [[18, 2], [26, 1], [34, -1]].forEach((t) => S.cel({ poly: [[t[0] - 2.4, t[1]], [t[0], t[1] + 8], [t[0] + 2.4, t[1]]] }, '#ffffff', { line: S.L(1), shadow: false, hi: false, rim: false, tension: 0.2 }));
        [[22, 9], [31, 10]].forEach((t) => S.cel({ poly: [[t[0] - 2, t[1]], [t[0], t[1] - 6], [t[0] + 2, t[1]]] }, '#ffffff', { line: S.L(1), shadow: false, hi: false, rim: false, tension: 0.2 }));
        // ear fin, cheek scales, eye and nostril
        S.cel([[0, -8, 1], [-10, -12], [-16, -6, 1], [-8, -2]], f.hot, { line: S.L(1.6), shadow: f.light, depth: 1.6, hi: false, rim: false, tension: 0.4 });
        S.circle(12, -8, 4.6, '#fff8f0'); S.circle(12.8, -7.6, 3, pal.gold2); S.circle(12.8, -7.6, 1.8, INK); S.circle(11.6, -8.8, 1, '#ffffff');
        S.ink([[3, -12], [12, -14], [22, -10]], { w: 2.6, color: INK, taper: 0.3, wobble: 0 });
        S.circle(34, -5, 1.8, INK); S.ink([[26, -3], [30, -1]], { w: 1.2, color: INK, taper: 0.3, wobble: 0 });
        // long whiskers and a little beard
        S.ink([[38, -2], [46, -12 + w * 2], [40, -22 + w * 3], [30, -20]], { w: 1.7, color: INK, taper: 0.1, wobble: 0.03 }); S.ink([[38, 1], [48, 8 - w * 2], [52, -2 + w * 3]], { w: 1.7, color: INK, taper: 0.1, wobble: 0.03 });
        tk.ribbon(g, [[24, 18], [22, 26], [18, 30 + w]], pal.gold2, { wMax: 4, w0: 4, w1: 0.4, gloss: false, strands: 0, line: S.L(1.2), rim: false, shadow: false });
      });
    });
    S.spark(-34, -8, S.d ? 6 : 5, { color: '#ffffff' });
    if (S.d) for (let i = 0; i < 8; i++) S.circle(-44 + R() * 90, -40 + R() * 80, 0.8 + R() * 1.3, R() < 0.5 ? '#ffffff' : pal.gold2, 0.85);
  };

  // @@MOTIFS-END

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
  // ---------------------------------------------------------------------------------------------------------------
  const VH = 116;
  const grad = (g, x0, y0, x1, y1, stops) => tk.lin(g, x0, y0, x1, y1, stops);

  // ink-wash mountain ridge: base line y, amplitude, noise seed, fill. peaks makes the tops pointier
  function ridge(g, VW, base, amp, seed, col, alpha, peaks) {
    g.save(); g.globalAlpha *= cA(alpha === undefined ? 1 : alpha);
    g.beginPath(); g.moveTo(-2, VH + 2);
    const step = 4;
    for (let x = -2; x <= VW + 4; x += step) {
      const n = tk.noise1(x * 0.028 + seed * 1.7, seed) * 0.7 + tk.noise1(x * 0.07 + seed, seed + 9) * 0.3;
      const pk = peaks ? Math.pow(abs(sin(x * 0.045 + seed)), 0.7) * 0.4 : 0;
      g.lineTo(x, base - amp * (n * 0.85 + pk));
    }
    g.lineTo(VW + 4, VH + 2); g.closePath(); g.fillStyle = col; g.fill(); g.restore();
  }
  function ridgeLine(g, VW, base, amp, seed, col, w, alpha, peaks) {
    const pts = [];
    for (let x = -2; x <= VW + 4; x += 6) { const n = tk.noise1(x * 0.028 + seed * 1.7, seed) * 0.7 + tk.noise1(x * 0.07 + seed, seed + 9) * 0.3; const pk = peaks ? Math.pow(abs(sin(x * 0.045 + seed)), 0.7) * 0.4 : 0; pts.push([x, base - amp * (n * 0.85 + pk)]); }
    tk.inkPath(g, pts, { w, color: col, alpha, taper: 0.1, wobble: 0.1, pressure: 'flat' });
  }
  function mistBand(g, x, y, w, h, col, a) {
    g.save(); g.globalAlpha *= cA(a);
    const gr = grad(g, 0, y - h / 2, 0, y + h / 2, [[0, tk.rgba(col, 0)], [0.5, tk.rgba(col, 1)], [1, tk.rgba(col, 0)]]);
    g.fillStyle = gr; g.fillRect(x, y - h / 2, w, h); g.restore();
  }
  function bambooStalk(g, x, y0, y1, w, col, hi, seed) {
    // a jointed stalk with two short leaf tufts
    g.save();
    tk.inkPath(g, [[x, y0], [x + 0.6, (y0 + y1) / 2], [x, y1]], { w: w + 1.8, color: INK, taper: 0, pressure: 'flat', wobble: 0 });
    tk.inkPath(g, [[x, y0], [x + 0.6, (y0 + y1) / 2], [x, y1]], { w, color: col, taper: 0, pressure: 'flat', wobble: 0 });
    tk.inkPath(g, [[x - w * 0.25, y0], [x - w * 0.25, y1]], { w: max(0.6, w * 0.22), color: hi, alpha: 0.7, taper: 0.1, pressure: 'flat', wobble: 0 });
    for (let yy = y1 + 16; yy < y0; yy += 22 + (seed % 3) * 4) tk.inkPath(g, [[x - w * 0.7, yy], [x + w * 0.7, yy]], { w: 1.4, color: INK, taper: 0, pressure: 'flat', wobble: 0 });
    const rr = tk.rng('bam', seed);
    for (let k = 0; k < 3; k++) { const yy = y1 + 6 + k * 12 + rr() * 6, sd = k % 2 ? 1 : -1; g.save(); g.translate(x, yy); g.rotate(sd * (1.1 + rr() * 0.4)); tk.celFill(g, leafPts(18 + rr() * 8, 6), col, { line: 1.3, shadow: false, hi: false, rim: false }); g.restore(); }
    g.restore();
  }
  // faint traditional patterns laid over a ground: seigaiha waves, asanoha star lattice, shippo rings
  function patternOver(g, kind, VW, col, a) {
    g.save(); g.globalAlpha *= cA(a); g.strokeStyle = col; g.lineWidth = 0.9;
    if (kind === 'seigaiha') {
      const r = 11; for (let row = 0; row < 12; row++) for (let c = -1; c < VW / (r * 2) + 2; c++) { const cx = c * r * 2 + (row % 2 ? r : 0), cy = row * r * 0.5 + 6; for (let k = 3; k >= 1; k--) { g.beginPath(); g.arc(cx, cy, r * k / 3, PI, TAU); g.stroke(); } }
    } else if (kind === 'asanoha') {
      const s = 14; g.beginPath();
      for (let y = 0; y < VH + s; y += s) for (let x = 0; x < VW + s; x += s) { g.moveTo(x, y); g.lineTo(x + s, y + s); g.moveTo(x + s, y); g.lineTo(x, y + s); g.moveTo(x + s / 2, y); g.lineTo(x + s / 2, y + s); g.moveTo(x, y + s / 2); g.lineTo(x + s, y + s / 2); }
      g.stroke();
    } else {
      const r = 10; for (let y = 0; y < VH + r; y += r) for (let x = -r; x < VW + r; x += r * 2) { g.beginPath(); g.arc(x + ((y / r) % 2 ? r : 0), y, r, 0, TAU); g.stroke(); }
    }
    g.restore();
  }
  // a run of small V-shaped birds
  function birds(g, x, y, n, sc, col, rr) { for (let i = 0; i < n; i++) { const bx = x + i * 11 * sc + (rr() - 0.5) * 6, by = y + (i % 2) * 6 * sc - i * 2 + (rr() - 0.5) * 3, s = (5 + rr() * 3) * sc; tk.inkPath(g, [[bx - s, by - s * 0.3], [bx - s * 0.3, by - s * 0.1], [bx, by + s * 0.2], [bx + s * 0.3, by - s * 0.1], [bx + s, by - s * 0.4]], { w: 1.5 * sc + 0.4, color: col, taper: 0.4, wobble: 0.05 }); } }


  // screen-tone: dots that grow from nothing to r1 along direction dir, so the tone gathers in a corner instead of covering everything
  function tone(g, x, y, w, h, o) {
    const d = o.d || 5, r1 = o.r1 || 1.8, dir = o.dir || 0, from = o.from === undefined ? 0.4 : o.from, to = o.to === undefined ? 1 : o.to, pw = o.pw || 1.4;
    const c = cos(dir), s = sin(dir), cx = x + w / 2, cy = y + h / 2, span = abs(w * c) + abs(h * s) || 1;
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = tk.rgba(o.color || INK, o.alpha === undefined ? 0.4 : o.alpha);
    g.beginPath();
    for (let j = 0, gy = y - d; gy < y + h + d; gy += d / 2, j++) for (let gx = x - d + (j % 2 ? d / 2 : 0); gx < x + w + d; gx += d) {
      const k = 0.5 + ((gx - cx) * c + (gy - cy) * s) / span, kk = clamp((k - from) / (to - from), 0, 1), r = r1 * Math.pow(kk, pw);
      if (r > 0.3) { g.moveTo(gx + r, gy); g.arc(gx, gy, r, 0, TAU); }
    }
    g.fill(); g.restore();
  }
  // the ground palette: motifs are mostly light shapes with dark ink, so the scene behind them must sit in the mid and dark tones. Pale families
  // (moon, gold, and the like) are pulled down into a usable ground, and near-white lights are eased.
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

  // a broad dry-brush swash of sumi under the scene: the game's signature underpainting
  function inkSwash(g, sp, VW, light) {
    const v = sp.v, ang = (v('sw') - 0.5) * 1.1, cx = VW * (0.3 + 0.4 * v('swx')), cy = VH * (0.3 + 0.4 * v('swy'));
    const len = VW * 0.62, dx = cos(ang) * len, dy = sin(ang) * len;
    const path = bez3([cx - dx, cy - dy + 8], [cx - dx * 0.4, cy - dy * 0.4 - 16 * (v('swb') - 0.5) * 2], [cx + dx * 0.3, cy + dy * 0.3 + 14], [cx + dx, cy + dy - 6], 26);
    const col = light ? INK : sp.G.dark, a = light ? 0.24 : 0.4;
    tk.inkPath(g, path, { w: 30, color: col, alpha: a, taperStart: 0.03, taperEnd: 0.4, pressure: (u) => 0.6 + 0.4 * sin(PI * clamp(u * 1.1, 0, 1)), wobble: 0.16, freq: 0.05, seed: sp.seed % 13 });
    for (let i = 0; i < 9; i++) {
      const off = (i / 8 - 0.5) * 24, pts = path.map((p, k) => { const q = polyAt(path, k / (path.length - 1)); return [p[0] - q.ty * off, p[1] + q.tx * off]; }).slice(2 + (i % 3) * 2, 25 - (i % 2) * 4);
      tk.inkPath(g, pts, { w: 0.9, color: light ? INK : sp.G.glow, alpha: light ? 0.2 : 0.16, taper: 0.4, wobble: 0.05, seed: i });
    }
    const rr = tk.rng('swd', sp.id);
    for (let i = 0; i < 7; i++) { const p = polyAt(path, rr()), off = (rr() - 0.5) * 44; g.beginPath(); g.arc(p.x - p.ty * off, p.y + p.tx * off, 0.7 + rr() * 1.6, 0, TAU); g.fillStyle = tk.rgba(col, a * 2.2); g.fill(); }
  }

  const BG = {};
  // dusk: warm gradient sky, a sun or moon disc, three ink-wash ridges, mist and a bit of scenery
  BG.dusk = (g, sp, VW, ctx) => {
    const F = sp.G, v = sp.v;
    g.fillStyle = grad(g, 0, 0, 0, VH, [[0, tk.mix(F.light, '#fff1d0', 0.12 + 0.18 * v('a'))], [0.45, tk.mix(F.light, F.base, 0.6)], [0.8, F.base], [1, F.dark]]); g.fillRect(0, 0, VW, VH);
    const dx = VW * (0.2 + 0.6 * v('dx')), dy = 24 + 26 * v('dy'), dr = 14 + 12 * v('dr');
    tk.glow(g, dx, dy, dr * 3.4, F.glow, 0.6);
    g.beginPath(); g.arc(dx, dy, dr, 0, TAU); g.fillStyle = tk.mix('#fff8e6', F.hot, 0.35); g.fill();
    g.beginPath(); g.arc(dx, dy, dr, 0, TAU); g.lineWidth = 1.6; g.strokeStyle = tk.rgba(INK, 0.55); g.stroke();
    for (let i = 0; i < 3; i++) { const a = PI / 2 + (i - 1) * 0.42 + (v('ga') - 0.5) * 0.3, R1 = 150; g.fillStyle = tk.rgba('#ffffff', 0.09); g.beginPath(); g.moveTo(dx, dy); g.lineTo(dx + cos(a - 0.09) * R1, dy + sin(a - 0.09) * R1); g.lineTo(dx + cos(a + 0.09) * R1, dy + sin(a + 0.09) * R1); g.closePath(); g.fill(); }
    if (sp.pattern) patternOver(g, sp.pattern, VW, F.hot, 0.16);
    // flat Japanese cloud bars
    for (let i = 0; i < 2; i++) { const cy = 26 + i * 22 + 10 * v('c' + i), cx = VW * v('cx' + i); tk.glow(g, cx, cy, 30, '#ffffff', 0.4, false); g.save(); g.translate(cx, cy); g.scale(2.4, 0.22); tk.glow(g, 0, 0, 30, '#ffffff', 0.7, false); g.restore(); }
    ridge(g, VW, 78, 22, sp.seed % 97, tk.rgba(tk.mix(F.dark, F.light, 0.45), 0.75), 1, true);
    mistBand(g, 0, 74, VW, 16, '#ffffff', 0.35);
    ridge(g, VW, 92, 20, (sp.seed >> 3) % 89, tk.mix(F.dark, INK, 0.25), 0.95, true);
    ridgeLine(g, VW, 92, 20, (sp.seed >> 3) % 89, INK, 1.4, 0.55, true);
    mistBand(g, 0, 96, VW, 14, F.hot, 0.28);
    ridge(g, VW, 110, 14, (sp.seed >> 5) % 83, tk.mix(F.dim, INK, 0.3), 1, false);
    ridgeLine(g, VW, 110, 14, (sp.seed >> 5) % 83, INK, 1.8, 0.7, false);
    const sc = sp.scenery;
    if (sc === 'bamboo') { const side = v('bs') < 0.5 ? 0 : VW; [0, 1, 2].forEach((i) => bambooStalk(g, side + (side ? -1 : 1) * (8 + i * 12), VH + 6, -6 - i * 5, 4.4 - i * 0.6, tk.mix(F.dark, INK, 0.45 + i * 0.1), F.glow, sp.seed + i)); }
    else if (sc === 'birds') birds(g, VW * (0.15 + 0.4 * v('bx')), 14 + 14 * v('by'), 4, 1, tk.rgba(INK, 0.75), tk.rng('bd', sp.id));
    else if (sc === 'pine') { const bx = v('bs') < 0.5 ? -4 : VW + 4, sd = bx < 0 ? 1 : -1; tk.inkPath(g, [[bx, 40], [bx + sd * 22, 30], [bx + sd * 46, 34]], { w: 3.4, color: INK, taper: 0.2, wobble: 0.1 }); for (let k = 0; k < 5; k++) { const px = bx + sd * (12 + k * 8), py = 33 - (k % 2) * 3; for (let n = 0; n < 5; n++) { const a = -PI / 2 + (n - 2) * 0.55; tk.inkPath(g, [[px, py], [px + cos(a) * 10, py + sin(a) * 10]], { w: 1.5, color: INK, taper: 0.4, wobble: 0 }); } } }
    else if (sc === 'torii') { const tx = VW * (0.15 + 0.7 * v('tx')), ty = 84; g.save(); g.globalAlpha *= 0.75; g.fillStyle = tk.mix(F.dark, INK, 0.5); g.fillRect(tx - 8, ty - 22, 2.6, 24); g.fillRect(tx + 6, ty - 22, 2.6, 24); g.fillRect(tx - 11, ty - 25, 30, 3); g.fillRect(tx - 9, ty - 19, 26, 2); g.restore(); }
  };
  // wash: a pale tinted ground with a big enso ring, drifting sound dots and a halftone corner
  BG.wash = (g, sp, VW) => {
    const F = sp.G, v = sp.v;
    g.fillStyle = grad(g, 0, 0, VW * 0.3, VH, [[0, tk.mix(pal.paper, '#ffffff', 0.3)], [0.6, tk.mix(pal.paper, F.light, 0.35)], [1, tk.mix(pal.paper2, F.base, 0.45)]]); g.fillRect(0, 0, VW, VH);
    if (sp.pattern) patternOver(g, sp.pattern, VW, F.base, 0.16);
    const cx = VW * (0.3 + 0.4 * v('ex')), cy = 46 + 14 * v('ey'), r = 34 + 8 * v('er'), a0 = v('ea') * TAU;
    // the enso: several dry-brush passes around a broken circle
    for (let k = 0; k < 4; k++) { const pts = []; for (let i = 0; i <= 26; i++) pts.push(polar(cx, cy, r + (k - 1.5) * 2.2 + sin(i * 0.5 + k) * 0.8, a0 + i / 26 * 5.5)); tk.inkPath(g, pts, { w: 9 - k * 1.2, color: k % 2 ? F.base : F.light, alpha: 0.55, taperStart: 0.02, taperEnd: 0.3, wobble: 0.16, seed: k + sp.seed % 9 }); }
    tk.glow(g, cx, cy, r * 1.3, F.glow, 0.5);
    ridge(g, VW, 104, 24, sp.seed % 79, tk.rgba(F.dark, 0.3), 1, true);
    ridge(g, VW, 114, 12, (sp.seed >> 4) % 79, tk.rgba(INK, 0.28), 1, false);
    tone(g, 0, 0, VW, VH, { d: 5, dir: 0.75, r1: 1.9, color: F.dark, alpha: 0.4, from: 0.45 });
    // drifting sound dots instead of splatter: ash and ink flecks
    const rr = tk.rng('spl', sp.id);
    for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(rr() * VW, rr() * VH, 0.7 + rr() * 1.7, 0, TAU); g.fillStyle = tk.rgba(i % 3 ? INK : pal.hush2, 0.5); g.fill(); }
  };
  // burst: manga focus rays converging on the motif
  BG.burst = (g, sp, VW, ctx) => {
    const F = sp.G, v = sp.v, fx = ctx.mx, fy = ctx.my;
    g.fillStyle = tk.rad(g, fx, fy, 0, fx, fy, Math.hypot(VW, VH) * 0.65, [[0, tk.mix(F.light, F.glow, 0.35)], [0.3, F.light], [0.7, F.base], [1, F.dark]]); g.fillRect(0, 0, VW, VH);
    const n = 22, off = v('ro') * TAU, R1 = Math.hypot(VW, VH);
    g.save(); g.fillStyle = tk.rgba('#ffffff', 0.2);
    for (let i = 0; i < n; i += 2) { const a = off + i / n * TAU, da = TAU / n * (0.7 + 0.5 * v('rw' + i)); g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + cos(a) * R1, fy + sin(a) * R1); g.lineTo(fx + cos(a + da) * R1, fy + sin(a + da) * R1); g.closePath(); g.fill(); }
    g.restore();
    g.save(); g.fillStyle = tk.rgba(F.dark, 0.3);
    for (let i = 1; i < n; i += 2) { const a = off + i / n * TAU, da = TAU / n * 0.6; g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + cos(a) * R1, fy + sin(a) * R1); g.lineTo(fx + cos(a + da) * R1, fy + sin(a + da) * R1); g.closePath(); g.fill(); }
    g.restore();
    if (sp.pattern) patternOver(g, sp.pattern, VW, F.hot, 0.1);
    tone(g, 0, 0, VW, VH, { d: 5.5, dir: PI / 2, r1: 1.8, color: F.dark, alpha: 0.4, from: 0.55 });
    tk.speedLines(g, fx, fy, { n: 40, seed: sp.seed % 1000, r0: 34, r1: R1, w: 3.4, alpha: 0.55, color: '#ffffff' });
  };
  // split: a hard diagonal panel cut, light gradient on one side, dark screen-tone on the other
  BG.split = (g, sp, VW) => {
    const F = sp.G, v = sp.v, sl = 0.22 + 0.2 * v('sl'), x0 = VW * (0.36 + 0.28 * v('sx')), dxs = (v('sd') < 0.5 ? 1 : -1) * VW * sl;
    g.fillStyle = grad(g, 0, 0, VW, VH, [[0, F.light], [0.55, F.base], [1, F.mid]]); g.fillRect(0, 0, VW, VH);
    g.save(); g.beginPath(); g.moveTo(x0 + dxs, -2); g.lineTo(VW + 2, -2); g.lineTo(VW + 2, VH + 2); g.lineTo(x0 - dxs, VH + 2); g.closePath(); g.clip();
    g.fillStyle = grad(g, 0, 0, VW, VH, [[0, F.mid], [1, F.dim]]); g.fillRect(0, 0, VW, VH);
    tk.halftone(g, 0, 0, VW, VH, { d: 4.4, r: 1.35, color: INK, alpha: 0.4, force: true });
    tk.speedLines(g, 0, 0, { mode: 'dir', rect: [0, 0, VW, VH], angle: v('sd') < 0.5 ? -0.5 : PI + 0.5, len: 90, n: 26, seed: sp.seed % 500, w: 2.4, alpha: 0.4, color: F.hot });
    g.restore();
    tk.inkPath(g, { poly: [[x0 + dxs, -4], [x0 - dxs, VH + 4]] }, { w: 5, color: INK, taper: 0, pressure: 'flat', wobble: 0 });
    tk.inkPath(g, { poly: [[x0 + dxs + 4, -4], [x0 - dxs + 4, VH + 4]] }, { w: 1.6, color: '#ffffff', alpha: 0.8, taper: 0, pressure: 'flat', wobble: 0 });
    if (sp.pattern) patternOver(g, sp.pattern, VW, '#ffffff', 0.1);
    ridge(g, VW, 112, 14, sp.seed % 71, tk.rgba(INK, 0.35), 1, true);
  };
  // night: deep gradient, stars, a huge aura, ink ridges, fireflies (the power look)
  BG.night = (g, sp, VW, ctx, t) => {
    const F = sp.G, v = sp.v;
    g.fillStyle = grad(g, 0, 0, 0, VH, [[0, tk.mix(F.dim, INK, 0.4)], [0.6, tk.mix(F.dark, INK, 0.2)], [1, tk.mix(F.dark, F.base, 0.35)]]); g.fillRect(0, 0, VW, VH);
    tk.stars(g, 0, 0, VW, VH * 0.85, 0, { n: 46, seed: sp.seed % 997, color: F.hot });
    const ax = ctx.mx, ay = ctx.my;
    tk.glow(g, ax, ay, 72, F.glow, 0.5); tk.glow(g, ax, ay, 40, F.hot, 0.35);
    g.beginPath(); g.arc(ax, ay, 40 + 6 * v('ar'), 0, TAU); g.lineWidth = 1.4; g.strokeStyle = tk.rgba(F.glow, 0.55); g.stroke();
    if (sp.pattern) patternOver(g, sp.pattern, VW, F.glow, 0.11);
    ridge(g, VW, 96, 24, sp.seed % 61, tk.mix(F.dim, INK, 0.35), 0.9, true);
    mistBand(g, 0, 90, VW, 18, F.glow, 0.2);
    ridge(g, VW, 112, 14, (sp.seed >> 4) % 61, INK, 0.95, false);
    ridgeLine(g, VW, 112, 14, (sp.seed >> 4) % 61, F.glow, 1.1, 0.45, false);
  };
  // ring: a shrine mandala of concentric bands and alternating rays, with gold-leaf lines
  BG.ring = (g, sp, VW, ctx) => {
    const F = sp.G, v = sp.v, cx = ctx.mx, cy = ctx.my;
    g.fillStyle = tk.rad(g, cx, cy, 0, cx, cy, Math.hypot(VW, VH) * 0.62, [[0, tk.mix(F.light, F.glow, 0.3)], [0.35, F.light], [0.8, F.base], [1, F.dark]]); g.fillRect(0, 0, VW, VH);
    const n = 28, off = v('ro') * TAU, R1 = Math.hypot(VW, VH);
    g.fillStyle = tk.rgba(F.dark, 0.16);
    for (let i = 0; i < n; i += 2) { const a = off + i / n * TAU, da = TAU / n; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + cos(a) * R1, cy + sin(a) * R1); g.lineTo(cx + cos(a + da) * R1, cy + sin(a + da) * R1); g.closePath(); g.fill(); }
    for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(cx, cy, 26 + k * 15 + 3 * v('rr' + k), 0, TAU); g.lineWidth = k % 2 ? 1 : 2.4; g.strokeStyle = k % 2 ? tk.rgba(pal.gold2, 0.85) : tk.rgba(INK, 0.4); g.stroke(); }
    g.save(); g.setLineDash([2.4, 4]); g.beginPath(); g.arc(cx, cy, 72, 0, TAU); g.lineWidth = 1.2; g.strokeStyle = tk.rgba(pal.gold, 0.8); g.stroke(); g.restore();
    if (sp.pattern) patternOver(g, sp.pattern, VW, '#ffffff', 0.1);
    tone(g, 0, 0, VW, VH, { d: 5.5, dir: -PI / 2, r1: 1.7, color: F.dark, alpha: 0.32, from: 0.5 });
    ridge(g, VW, 114, 12, sp.seed % 43, tk.rgba(INK, 0.4), 1, false);
  };

  // ---------------------------------------------------------------------------------------------------------------
  // the card spec: everything the composition decides, all seeded from the card id
  // ---------------------------------------------------------------------------------------------------------------
  const pick = (list, r) => list[floor(r * list.length) % list.length];
  const SEC = { rose: ['petals', 'star', 'crescent'], crimson: ['fire', 'slash', 'lantern'], amber: ['lantern', 'fire', 'sun'], gold: ['coin', 'star', 'sun'], jade: ['wind', 'thorns', 'petals'], teal: ['wave', 'koi', 'star'], azure: ['wave', 'ice', 'crane'], indigo: ['moon', 'star', 'sigil'], violet: ['sigil', 'spirit_orb', 'ink_splash'], ink: ['ink_splash', 'brush_stroke', 'skull'], moon: ['moon', 'star', 'crane'], ash: ['void', 'web', 'mask'] };
  const ATTACKISH = new Set(['slash', 'cross_slash', 'thrust', 'crescent', 'iai', 'sword_rain', 'fist', 'kick', 'thunder_fist', 'arrow', 'quake', 'meteor', 'lightning', 'chain_lightning']);
  const INKY = new Set(['ink_splash', 'brush_stroke', 'calligraphy', 'ink_wave', 'scroll', 'mask', 'skull', 'poison_bloom', 'thorns']);
  const PALE = new Set(['slash', 'cross_slash', 'crescent', 'thrust', 'iai', 'wind', 'petal_storm', 'lightning', 'chain_lightning', 'star', 'ice', 'moon', 'barrier', 'spirit_orb', 'heal_light', 'sigil', 'web', 'tornado', 'meteor', 'sword_rain', 'talisman', 'crane', 'quill', 'book', 'mirror', 'void']);
  const GUARDISH = new Set(['shield', 'barrier', 'mirror', 'fan', 'torii']);
  const UPRIGHT = new Set(['torii', 'lantern', 'fox', 'tiger', 'mask', 'skull', 'eye', 'shield', 'bell', 'lotus', 'mirror', 'scroll', 'book', 'coin', 'moon', 'sun', 'sigil', 'wave', 'web', 'void', 'barrier']);
  const JUNK_PAL = { ink_splash: 'ink', web: 'ash', fire: 'crimson', void: 'ink', lightning: 'azure', petals: 'rose', mirror: 'violet', eye: 'violet', sigil: 'violet', poison_bloom: 'violet' };
  const HERO_PAL = { hanae: 'rose', kuro: 'violet', suzu: 'moon', raiga: 'amber' };
  const CURSE_FAM = { base: '#5b3fa8', light: '#cdb0ff', dark: '#1a1340', glow: '#b08cff' };

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
    if (INKY.has(motif)) { wts.wash *= 4.5; wts.dusk *= 1.6; wts.night *= 0.35; wts.burst *= 0.5; }
    else if (PALE.has(motif)) { wts.wash *= 0.12; wts.night *= 1.6; wts.ring *= 0.9; }
    if (sp.G.pale) wts.wash *= 0.3;
    let tot = 0; const keys = Object.keys(wts); keys.forEach((k) => { wts[k] *= (pm[k] || 1); tot += wts[k]; });
    let r = v('bg') * tot; sp.bg = keys[keys.length - 1]; for (const k of keys) { r -= wts[k]; if (r < 0) { sp.bg = k; break; } }
    sp.fg = v('fgon') < 0.62 ? pick(FG_BY_PAL[pname] || FG_BY_PAL.ash, v('fgk')) : 'none';
    sp.swash = v('swon') < 0.6;
    sp.pattern = v('pt') < 0.5 ? null : ['seigaiha', 'asanoha', 'shippo'][floor(v('pk') * 3) % 3];
    if (motif === 'wave' || motif === 'ink_wave' || motif === 'koi') sp.pattern = v('pt') < 0.75 ? 'seigaiha' : sp.pattern;
    sp.scenery = ['none', 'bamboo', 'birds', 'pine', 'torii', 'none'][floor(v('sc') * 6) % 6];
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
    if (sp.swash) inkSwash(g, sp, VW, sp.bg === 'wash');
    // a soft dark spot behind the motif keeps light shapes readable on any ground, then action lines for attacks
    g.save(); g.fillStyle = tk.rad(g, L.mx, L.my, 8, L.mx, L.my, 62, [[0, tk.rgba(sp.G.dark, 0.34)], [1, tk.rgba(sp.G.dark, 0)]]); g.fillRect(0, 0, VW, VH); g.restore();
    if (sp.hero) { const hx = sp.side < 0 ? 0 : VW; g.save(); g.fillStyle = grad(g, hx, 0, hx - sp.side * VW * 0.62, 0, [[0, tk.rgba(sp.G.dark, 0.62)], [1, tk.rgba(sp.G.dark, 0)]]); g.fillRect(0, 0, VW, VH); g.restore(); }
    if (sp.type === 'attack' && sp.bg !== 'burst') tk.speedLines(g, L.mx, L.my, { n: 26, seed: sp.seed % 777, r0: 40, r1: 110, w: 2.6, alpha: 0.26, color: '#ffffff' });
    // a small secondary motif in the corner opposite the hero, as a tone-on-tone silhouette stamp so it reads as texture, never as clutter
    if (sp.secOn && !sp.junk) {
      const sx = sp.hero ? (sp.side < 0 ? VW - 22 : 22) : (sp.mirror ? 24 : VW - 24), sy = sp.v('sy') < 0.5 ? 25 : VH - 27, dark = sp.bg === 'wash' || (sp.bg === 'dusk' && sy < 40);
      const tilt = floor(sp.v('sr') * 3), silKey = ['sec', sp.id, Math.round(L.pxk * 10)].join('|');
      const sil = ART.sprite(silKey, 44, 44, (sg) => {
        drawMotif(sg, sp.sec, 22, 22, 36, sp.pname, undefined, { detail: 1, pxk: L.pxk, rot: (tilt - 1) * 0.3, seed: 7 });
        sg.globalCompositeOperation = 'source-in'; sg.fillStyle = dark ? INK : sp.G.hot; sg.fillRect(0, 0, 44, 44);
      });
      g.save(); g.translate(sx, sy);
      g.globalAlpha *= dark ? 0.2 : 0.3;
      if (sp.v('rg') < 0.6) { g.beginPath(); g.arc(0, 0, 21, 0, TAU); g.lineWidth = 1.3; g.strokeStyle = dark ? INK : sp.G.hot; g.stroke(); g.beginPath(); g.arc(0, 0, 18.4, 0, TAU); g.lineWidth = 0.7; g.stroke(); }
      g.drawImage(sil, -22, -22, 44, 44);
      g.restore();
      ART.sprite.drop(silKey);                                  // an intermediate: the card sprite keeps the result
    }
    // halftone in the lowest corner for depth
    tone(g, 0, 0, VW, VH, { d: 5, dir: sp.mirror ? 2.4 : 0.75, r1: 2, color: INK, alpha: 0.42, from: 0.5, to: 1.05 });
  }

  // foreground framing: big dark leaves, drifting petals, falling notes or embers hugging the corners, in front of the motif for depth
  const FG_BY_PAL = { jade: ['leaves', 'leaves', 'bokeh'], teal: ['leaves', 'bokeh', 'drips'], amber: ['leaves', 'embers', 'bokeh'], gold: ['leaves', 'bokeh', 'bokeh'], rose: ['petals', 'petals', 'leaves', 'bokeh'], crimson: ['embers', 'petals', 'bokeh'], azure: ['bokeh', 'leaves', 'bokeh'], indigo: ['drips', 'bokeh'], violet: ['drips', 'bokeh', 'bokeh'], ink: ['drips', 'drips', 'leaves'], moon: ['bokeh', 'bokeh', 'leaves'], ash: ['drips', 'leaves', 'bokeh'] };
  function paintFG(g, sp, VW, L, t) {
    const kind = sp.fg;
    if (!kind || kind === 'none') return;
    const G = sp.G, rr = tk.rng('fg', sp.id), sway = t !== undefined ? sin(t * 1.3) : 0, corner = sp.hero ? (sp.side < 0 ? 1 : -1) : (sp.v('fc') < 0.5 ? -1 : 1);     // -1 = left corner, 1 = right; on hero cards the far side, away from the face
    const x0 = corner < 0 ? 0 : VW, y0 = sp.v('fy') < 0.55 ? VH : 0, dy = y0 ? -1 : 1;
    if (kind === 'leaves') {
      const col = tk.mix(G.dark, INK, 0.62);
      const inward = -corner;
      for (let i = 0; i < 6; i++) {
        const phi = 0.25 + i * 0.27 + (rr() - 0.5) * 0.18 + sway * 0.03 * (i + 1), len = 34 + rr() * 22 - i * 1.5, th = dy < 0 ? inward * phi : PI - inward * phi;
        g.save(); g.translate(x0 - corner * 2, y0 + dy * 2); g.rotate(th);
        tk.celFill(g, leafPts(len, 9 + rr() * 4), col, { line: 1.5, lineColor: INK, shadow: false, hi: false, rim: G.glow, rimW: 0.9, rimAlpha: 0.6, tension: 0.6 });
        g.restore();
      }
    } else if (kind === 'petals') {
      for (let i = 0; i < 7; i++) tk.petal(g, x0 - corner * (8 + rr() * 46) + sway * 2, y0 + dy * (8 + rr() * 40) + sway, 6 + rr() * 5, rr() * TAU + sway * 0.3 * (i % 2 ? 1 : -1), 0.95, sp.f.light);
    } else if (kind === 'bokeh') {
      for (let i = 0; i < 8; i++) { const x = x0 - corner * (rr() * 60), y = y0 + dy * (rr() * 46), r = 3 + rr() * 8 + 1.2 * sway * (i % 2 ? 1 : -1); g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = tk.rad(g, x, y, 0, x, y, r, [[0, tk.rgba(G.hot, 0.34)], [0.8, tk.rgba(G.glow, 0.24)], [1, tk.rgba(G.glow, 0)]]); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); g.beginPath(); g.arc(x, y, r * 0.86, 0, TAU); g.lineWidth = 0.6; g.strokeStyle = tk.rgba('#ffffff', 0.35); g.stroke(); }
    } else if (kind === 'drips') {
      // falling notes (the key stays 'drips'): 3 to 5 note glyphs drifting down from the top edge, a dark under-note for contrast on pale grounds
      const nn = 3 + floor(rr() * 3);
      for (let i = 0; i < nn; i++) {
        const x = 8 + rr() * (VW - 16), y0n = 4 + rr() * 30, sz = 7 + rr() * 4, kd = ['eighth', 'quarter', 'beamed', 'eighth', 'quarter'][i % 5], rot = (rr() - 0.5) * 0.7, spd = 5 + rr() * 5;
        const y = t !== undefined ? ((y0n + t * spd) % (VH * 0.7)) : y0n, sw = t !== undefined ? sin(t * 1.1 + i) * 2 : 0;
        tk.note(g, x + sw + 1, y + 1, sz, { kind: kd, color: INK, alpha: 0.55, rot, line: max(1.2, sz * 0.14) });
        tk.note(g, x + sw, y, sz, { kind: kd, color: sp.f.light, alpha: 0.95, rot, line: max(1.2, sz * 0.14) });
      }
    } else if (kind === 'embers') {
      for (let i = 0; i < 14; i++) { const x = rr() * VW, y0e = VH - rr() * VH * 0.7, y = t !== undefined ? ((y0e - t * (6 + rr() * 8)) % VH + VH) % VH : y0e, sz = 0.8 + rr() * 1.8; g.beginPath(); g.arc(x + sway * 2, y, sz, 0, TAU); g.fillStyle = tk.rgba(i % 3 ? pal.gold2 : '#ffffff', 0.85); g.fill(); }
    }
  }

  // the hero, cut into the scene: a palette-coloured rim halo behind, a soft fade into the ground at the bottom edge
  function heroSprite(sp, VW, L, pxk, live) {
    const key = ['cardhero', sp.id, sp.hero, sp.pose, L.hs.toFixed(2), Math.round(VW), Math.round(pxk * 10)].join('|');
    return ART.sprite(key, VW, VH, (g) => {
      const F = sp.f;
      const opts = { x: L.hx, y: L.hy, s: L.hs, pose: sp.pose, t: 0.3, pt: ART.hero.keyPt ? ART.hero.keyPt(sp.pose) * (0.9 + 0.3 * sp.v('kp')) : 0.2, flip: L.hflip, shadow: false };
      // silhouette pass: the hero in one flat colour, offset in a ring to make a glow-coloured outline
      const sil = ART.sprite(key + '|sil', VW, VH, (sg) => {
        ART.hero.draw(sg, sp.hero, opts);
        sg.globalCompositeOperation = 'source-in'; sg.fillStyle = tk.mix(F.glow, '#ffffff', 0.25); sg.fillRect(0, 0, VW, VH);
      });
      tk.glow(g, L.hx + sp.side * -4, L.hy - 186 * L.hs * 0.7, 70 * L.hs + 18, F.glow, 0.4);
      const r = 1.3;
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.drawImage(sil, cos(a) * r, sin(a) * r, VW, VH); }
      ART.hero.draw(g, sp.hero, opts);
      ART.sprite.drop(key + '|sil');
      // fade the lower body into the ground and dim it a touch so the motif leads
      g.globalCompositeOperation = 'source-atop';
      const dk = grad(g, 0, VH * 0.5, 0, VH, [[0, tk.rgba(F.dim, 0)], [1, tk.rgba(F.dim, 0.5)]]); g.fillStyle = dk; g.fillRect(0, 0, VW, VH);
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
  const NOFLIP = new Set(['calligraphy', 'talisman', 'scroll', 'book', 'quill', 'eye', 'mask', 'coin', 'torii', 'sigil', 'mirror', 'lantern', 'bell', 'sun']);

  function paintFront(g, sp, VW, L, t) {
    const F = sp.f, rr = tk.rng('spk', sp.id), live = t !== undefined;
    // gold-leaf sparkles, kept away from the motif centre
    const nSp = sp.junk ? (sp.type === 'curse' ? 4 : 3) : sp.nSpark;
    for (let i = 0; i < nSp; i++) {
      const x = 4 + rr() * (VW - 8), y = 4 + rr() * (VH - 8), sz = 1.6 + rr() * 3.4, rot = rr() * 1.2, ph = rr() * TAU, gold = rr() < 0.6;
      if (Math.hypot(x - L.mx, y - L.my) < 26 && rr() < 0.7) continue;
      const tw = live ? 0.35 + 0.65 * (0.5 + 0.5 * sin(t * (1.6 + rr() * 2) + ph)) : 1;
      tk.sparkle(g, x, y, sz * (live ? 0.6 + 0.4 * tw : 1), { color: sp.type === 'curse' ? '#b08cff' : sp.type === 'status' ? '#fff2c8' : (gold ? pal.gold2 : '#ffffff'), alpha: (sp.junk ? 0.6 : gold ? 0.9 : 0.75) * tw, rot, glow: sz > 3 && !sp.junk ? 0.4 : 0 });
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
    // rare: a slow diagonal gold shimmer in the live state
    if (live && sp.rarity === 'rare') {
      const k = ((t * 0.35) % 1.6) - 0.3; g.save(); g.globalCompositeOperation = 'lighter'; g.translate(VW * k, 0); g.transform(1, 0, -0.4, 1, 0, 0);
      g.fillStyle = grad(g, -14, 0, 14, 0, [[0, 'rgba(255,233,168,0)'], [0.5, 'rgba(255,233,168,0.32)'], [1, 'rgba(255,233,168,0)']]); g.fillRect(-14, 0, 28, VH); g.restore();
    }
    tk.paperGrain(g, 0, 0, VW, VH, { alpha: 0.32 });
    tk.vignette(g, VW, VH, { color: INK, alpha: 0.4, inner: 0.55 });
    // a hairline of ink inside the window edge so the art sits in its frame
    g.save(); g.lineWidth = 2; g.strokeStyle = tk.rgba(INK, 0.55); g.strokeRect(1, 1, VW - 2, VH - 2); g.restore();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // junk: curses (torn, blotched, black-violet) and status cards (damaged pages)
  // ---------------------------------------------------------------------------------------------------------------
  function tornEdge(g, VW, y, dir, seed, col, depth) {
    // a ragged strip along the top (dir 1) or bottom (dir -1) edge: the page torn away
    const rr = tk.rng('torn', seed); g.beginPath(); g.moveTo(-2, dir > 0 ? -2 : VH + 2);
    for (let x = -2; x <= VW + 4; x += 5 + rr() * 4) g.lineTo(x, y + dir * (rr() * depth));
    g.lineTo(VW + 4, dir > 0 ? -2 : VH + 2); g.closePath(); g.fillStyle = col; g.fill();
  }
  function paintJunk(g, sp, VW, L, t) {
    const f = sp.f, rr = tk.rng('junk', sp.id), v = sp.v;
    if (sp.type === 'curse') {
      g.fillStyle = grad(g, 0, 0, 0, VH, [[0, '#120c26'], [0.55, '#241448'], [1, '#0a0716']]); g.fillRect(0, 0, VW, VH);
      tk.glow(g, L.mx, L.my, 64, f.glow, 0.32); tk.glow(g, L.mx, L.my, 34, '#ffffff', 0.12);
      tone(g, 0, 0, VW, VH, { d: 4.6, dir: PI / 2, r1: 2.4, color: '#7a4fd0', alpha: 0.4, from: 0.3 });
      // creeping blotches from the edges
      for (let i = 0; i < 9; i++) { const side = floor(rr() * 4), x = side === 0 ? rr() * VW : side === 1 ? VW + 4 : side === 2 ? rr() * VW : -4, y = side === 0 ? -4 : side === 1 ? rr() * VH : side === 2 ? VH + 4 : rr() * VH; tk.inkBlot(g, x, y, 12 + rr() * 16, { seed: i + (sp.seed % 50), color: '#05030d', drips: 1, jag: 0.4 }); }
      // sickly cracks
      for (let i = 0; i < 4; i++) { const x0 = rr() * VW, y0 = rr() * VH, pts = [[x0, y0]]; for (let k = 1; k < 5; k++) pts.push([pts[k - 1][0] + (rr() - 0.5) * 30, pts[k - 1][1] + (rr() - 0.5) * 24]); tk.inkPath(g, pts, { w: 1.4, color: f.glow, alpha: 0.4, taper: 0.5, wobble: 0.08 }); }
      tornEdge(g, VW, 6, 1, sp.seed, '#05030d', 10); tornEdge(g, VW, VH - 6, -1, sp.seed + 1, '#05030d', 9);
    } else {
      g.fillStyle = grad(g, 0, 0, VW, VH, [[0, '#f0e2bd'], [0.5, '#e6d3a3'], [1, '#c9b07a']]); g.fillRect(0, 0, VW, VH);
      // stains: coffee-ring circles and a faint foxing
      for (let i = 0; i < 3; i++) { const x = rr() * VW, y = rr() * VH, r = 12 + rr() * 16; g.beginPath(); g.arc(x, y, r, 0, TAU); g.strokeStyle = tk.rgba('#8a6a3a', 0.28); g.lineWidth = 2.4; g.stroke(); g.fillStyle = tk.rgba('#8a6a3a', 0.08); g.fill(); }
      for (let i = 0; i < 26; i++) { g.beginPath(); g.arc(rr() * VW, rr() * VH, 0.6 + rr() * 1.6, 0, TAU); g.fillStyle = tk.rgba('#8a5a2a', 0.3); g.fill(); }
      // fold creases
      [[0.33, 0], [0.67, 0]].forEach((c, i) => { const x = VW * c[0] + (rr() - 0.5) * 4; tk.inkPath(g, { poly: [[x, -2], [x + 3, VH + 2]] }, { w: 1.2, color: '#8a6a3a', alpha: 0.35, taper: 0, pressure: 'flat', wobble: 0 }); tk.inkPath(g, { poly: [[x + 1.6, -2], [x + 4.6, VH + 2]] }, { w: 1, color: '#ffffff', alpha: 0.4, taper: 0, pressure: 'flat', wobble: 0 }); });
      tone(g, 0, 0, VW, VH, { d: 5.4, dir: -PI / 2, r1: 1.7, color: '#8a6a3a', alpha: 0.26, from: 0.5 });
    }
    // the motif itself, drawn at a slight tilt
    g.save();
    if (sp.type === 'status') g.globalAlpha *= 0.94;
    paintMotif(g, sp, VW, L, t);
    g.restore();
    if (sp.type === 'curse') {
      g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgba(110,70,190,0.55)'; g.fillRect(0, 0, VW, VH); g.restore();
      // hushed: drain the colour with a grey saturation pass
      g.save(); g.globalCompositeOperation = 'saturation'; g.globalAlpha *= 0.6; g.fillStyle = '#808080'; g.fillRect(0, 0, VW, VH); g.restore();
    }
    JUNK_EXTRA(g, sp, VW, L, rr);
    if (sp.type === 'status') {
      // burnt and torn corners, a punched hole, and erosion specks
      const burn = (cx, cy) => { g.save(); g.globalAlpha *= 0.85; g.fillStyle = tk.rad(g, cx, cy, 0, cx, cy, 34, [[0, 'rgba(30,14,6,0.95)'], [0.5, 'rgba(60,30,12,0.55)'], [1, 'rgba(60,30,12,0)']]); g.fillRect(cx - 34, cy - 34, 68, 68); g.restore(); };
      burn(v('b1') < 0.5 ? 0 : VW, 0); burn(v('b2') < 0.5 ? 0 : VW, VH);
      g.save(); g.fillStyle = INK; g.beginPath(); g.moveTo(VW - 30 * v('tc'), VH + 2); g.lineTo(VW + 2, VH - 26 * v('tc') - 4); g.lineTo(VW + 2, VH + 2); g.closePath(); g.fill(); g.restore();
      g.save(); g.beginPath(); g.arc(10 + rr() * 8, 16 + rr() * 8, 3.4, 0, TAU); g.fillStyle = '#1a0f0a'; g.fill(); g.lineWidth = 1.4; g.strokeStyle = tk.rgba('#8a6a3a', 0.8); g.stroke(); g.restore();
      for (let i = 0; i < 46; i++) { g.beginPath(); g.arc(rr() * VW, rr() * VH, 0.5 + rr() * 1.4, 0, TAU); g.fillStyle = tk.rgba('#e6d3a3', 0.75); g.fill(); }
      // two bands of grey ash and frost flecks, the Hush creeping over the card
      for (let b = 0; b < 2; b++) {
        const by = VH * (0.28 + b * 0.38) + (rr() - 0.5) * 8, bh = 7 + rr() * 4;
        g.fillStyle = tk.rgba(pal.hush2, 0.3); g.fillRect(0, by, VW, bh);
        for (let i = 0; i < 26; i++) { const x = rr() * VW, y = by + rr() * bh; g.fillStyle = tk.rgba(i % 2 ? pal.hush2 : '#f2f0f6', 0.85); g.fillRect(x, y, 2 + rr() * 4, 1); }
      }
    } else {
      tornEdge(g, VW, 4, 1, sp.seed + 7, '#05030d', 5); tornEdge(g, VW, VH - 4, -1, sp.seed + 9, '#05030d', 5);
      for (let i = 0; i < 4; i++) tk.sparkle(g, rr() * VW, rr() * VH, 2 + rr() * 2, { color: '#b08cff', alpha: 0.7, glow: 0 });
    }
  }
  // per-card scars: what makes this particular junk card look like itself
  function JUNK_EXTRA(g, sp, VW, L, rr) {
    const id = sp.id;
    if (id === 'status_redacted') { [[10, 20, 96, 14], [30, 46, 120, 14], [16, 72, 80, 14]].forEach((b) => { const w = b[2] * VW / 170; g.fillStyle = pal.felt; g.beginPath(); g.moveTo(b[0], b[1]); for (let x = 0; x <= w; x += 6) g.lineTo(b[0] + x, b[1] + (rr() - 0.5) * 1.6); for (let x = w; x >= 0; x -= 6) g.lineTo(b[0] + x, b[1] + b[3] + (rr() - 0.5) * 1.6); g.closePath(); g.fill(); g.strokeStyle = '#46425a'; g.lineWidth = 1.6; for (let x = 5; x < w; x += 11) { g.beginPath(); g.moveTo(b[0] + x, b[1] - 1); g.lineTo(b[0] + x + 3, b[1] + b[3] + 1); g.stroke(); } }); }
    else if (id === 'status_static') { for (let i = 0; i < 9; i++) { const y = rr() * VH; g.fillStyle = tk.rgba(i % 2 ? '#5ff5ff' : '#e8383d', 0.5); g.fillRect(rr() * VW * 0.3, y, VW * (0.3 + rr() * 0.5), 1.4 + rr() * 2.4); } }
    else if (id === 'status_tangle') { for (let i = 0; i < 9; i++) { const pts = []; const x0 = rr() * VW, y0 = rr() * VH; for (let k = 0; k < 5; k++) pts.push([x0 + k * 22 - 20 + (rr() - 0.5) * 24, y0 + (rr() - 0.5) * 60]); tk.inkPath(g, pts, { w: 1.1, color: '#ffffff', alpha: 0.75, taper: 0.2, wobble: 0.06 }); tk.inkPath(g, pts, { w: 2.2, color: INK, alpha: 0.35, taper: 0.2, wobble: 0.06 }); } }
    else if (id === 'status_scorch') { for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(rr() * VW, rr() * VH, 5 + rr() * 9, 0, TAU); g.fillStyle = tk.rgba('#1a0a06', 0.55); g.fill(); tk.glow(g, rr() * VW, rr() * VH, 12, '#ff9a2e', 0.5); } }
    else if (id === 'status_wilt') { for (let i = 0; i < 7; i++) tk.petal(g, 8 + rr() * (VW - 16), 8 + rr() * (VH - 16), 4 + rr() * 3, rr() * TAU, 0.9, '#a58a5a'); }
    else if (id === 'status_blot') {
      // six soft grey ash blobs with white frost dashes
      for (let i = 0; i < 6; i++) {
        const x = rr() * VW, y = rr() * VH, r = 6 + rr() * 8;
        g.fillStyle = tk.rad(g, x, y, 0, x, y, r, [[0, tk.rgba(pal.hush2, 0.95)], [0.65, tk.rgba(pal.hush2, 0.8)], [1, tk.rgba(pal.hush2, 0)]]); g.fillRect(x - r, y - r, r * 2, r * 2);
        for (let k = 0; k < 3; k++) { const dx = (rr() - 0.5) * r * 1.2, dy = (rr() - 0.5) * r * 1.2; tk.inkPath(g, [[x + dx - 2, y + dy], [x + dx + 2, y + dy + (rr() - 0.5)]], { w: 1.2, color: '#f2f0f6', alpha: 0.9, taper: 0.2, pressure: 'flat', wobble: 0 }); }
      }
    }
    else if (sp.type === 'curse') { for (let i = 0; i < 5; i++) tk.sparkle(g, rr() * VW, rr() * VH, 2 + rr() * 3, { color: '#b08cff', alpha: 0.6, glow: 0 }); }
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
