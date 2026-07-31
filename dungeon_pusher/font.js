/* ============================================================================
   GRIMCUT — the Dungeon Pusher typeface.

   A display face drawn for this game and nothing else: carved-stone bowls with
   flattened sides, heavy flared stems, wedge slab serifs, and the three spurs
   the logo lives on (the D's flag, the P's foot spike, the R's kicked leg).
   Lowercase is TRUE SMALL CAPS — drawn from the same builders with a second,
   heavier metric bundle, so a mixed-case string keeps one even colour instead
   of going pale where the lowercase is.

   The outlines are polygons in a 1000-unit em (y-up, baseline 0, cap 700).
   Every glyph is composed of OVERLAPPING positive shapes plus, where a letter
   genuinely encloses white, explicit counters; the fill rule unions the first
   and punches the second, so no boolean geometry is needed to author a letter.

   Rendering is a single path per string — one beginPath, one fill — so a
   headline costs what fillText cost, and the metal treatments (gold, silver,
   stone) add a clip + gradient + two bevel strokes on top of that.

   It installs itself over a 2D context:

       Grimcut.install(ctx);
       ctx.font = '900 44px Grimcut Gold, Georgia, serif';
       ctx.fillText('DUNGEON PUSHER', x, y);

   Any character the face does not cover — every emoji in the game — is split
   out into its own run and handed back to the browser with the rest of the
   font string, so the art keeps working untouched. That fallback is the whole
   safety story: a missing glyph is never a missing word.
   ========================================================================== */
'use strict';
(function (root) {

  // ------------------------------------------------------------ design space
  const EM = 1000;                      // units per em
  const D2R = Math.PI / 180;

  // Two metric bundles feed the SAME glyph builders. Small caps are not the
  // caps scaled down — they are redrawn shorter, wider and proportionally
  // fatter, which is the only way small caps hold their colour next to caps.
  // Measured off the logo: the stem runs about 21% of the cap height and the
  // thins about 15%, which is a LOW contrast, heavy face — closer to carved
  // masonry than to anything with a pen in its ancestry. Every earlier draft
  // that felt wrong was simply too light.
  // `wide` condenses the whole face without touching a stem: measured off
  // the logo, its small caps run about four fifths as wide as they are
  // tall, and every draft that felt slack was simply too roomy.
  const MC = { cap: 700, stem: 150, thin: 104, sf: 74, sh: 80, fl: 13, side: 32, wide: 0.90 };
  const MS = { cap: 530, stem: 128, thin: 92,  sf: 55, sh: 70, fl: 11, side: 23, wide: 0.87 };

  const CAP = MC.cap;                   // the face's reference height
  const DESC = 190;                     // how far the deepest tail drops

  // ------------------------------------------------------------- geometry kit
  function rect(x0, y0, x1, y1) { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }
  function tri(a, b, c) { return [a, b, c]; }

  // A superelliptic arc. The exponent squares the curve off toward its
  // extremes, which is what gives every bowl in this face its cut-stone
  // flats instead of a drawing-compass roundness.
  // One bias over every bowl in the face. Nudging this alone takes the whole
  // alphabet from "drawn with a compass" to "cut with a chisel", which is
  // most of the distance between a generic serif and this game.
  const CUT = 0.855;

  function sarc(cx, cy, rx, ry, a0, a1, n, e) {
    e = ((e == null) ? 0.80 : e) * CUT;
    const p = [];
    for (let i = 0; i <= n; i++) {
      const a = (a0 + (a1 - a0) * i / n) * D2R, c = Math.cos(a), s = Math.sin(a);
      p.push([cx + rx * Math.sign(c) * Math.pow(Math.abs(c), e),
              cy + ry * Math.sign(s) * Math.pow(Math.abs(s), e)]);
    }
    return p;
  }

  // A closed band between two superelliptic arcs — the workhorse for every
  // bowl, hook and shoulder. Returns ONE positive contour, so a C or a D
  // needs no counter at all.
  function sband(cx, cy, rox, roy, rix, riy, a0, a1, n, e) {
    return sarc(cx, cy, rox, roy, a0, a1, n, e)
      .concat(sarc(cx, cy, rix, riy, a1, a0, n, e));
  }

  // A stem whose sides bow OUT toward whichever ends are open, the entasis
  // that keeps a heavy vertical from reading as a printed slab.
  function stem(cx, hw, y0, y1, M, flTop, flBot) {
    const h = y1 - y0, tf = 0.27, n = 7, out = [];
    const off = (y) => {
      let d = 0;
      if (flBot !== false) { const a = (y - y0) / (h * tf); if (a < 1) d = Math.max(d, M.fl * (1 - a) * (1 - a)); }
      if (flTop !== false) { const b = (y1 - y) / (h * tf); if (b < 1) d = Math.max(d, M.fl * (1 - b) * (1 - b)); }
      return d;
    };
    for (let i = 0; i <= n; i++) { const y = y0 + h * i / n; out.push([cx + hw + off(y), y]); }
    for (let i = n; i >= 0; i--) { const y = y0 + h * i / n; out.push([cx - hw - off(y), y]); }
    return out;
  }

  // WEDGE serifs, not slabs. The outer tip is cut down to a sixth of the
  // serif's depth and the underside runs back into the stem on a slight
  // hollow, so what the eye gets is a chisel mark. Blunter versions of this
  // one helper are the single biggest reason a draft reads "bookish serif"
  // instead of "carved into a dungeon wall".
  const TIP = 0.17, KNEE = 0.30, KNEEY = 0.62;
  function serT(cx, hw, y, M, l, r) {
    l = (l == null ? 1 : l) * M.sf; r = (r == null ? 1 : r) * M.sf;
    const h = M.sh;
    return [[cx - hw - l, y], [cx - hw - l, y - h * TIP], [cx - hw - l * KNEE, y - h * KNEEY],
            [cx - hw, y - h], [cx + hw, y - h],
            [cx + hw + r * KNEE, y - h * KNEEY], [cx + hw + r, y - h * TIP], [cx + hw + r, y]];
  }
  function serB(cx, hw, y, M, l, r) {
    l = (l == null ? 1 : l) * M.sf; r = (r == null ? 1 : r) * M.sf;
    const h = M.sh;
    return [[cx - hw - l, y], [cx + hw + r, y], [cx + hw + r, y + h * TIP],
            [cx + hw + r * KNEE, y + h * KNEEY], [cx + hw, y + h], [cx - hw, y + h],
            [cx - hw - l * KNEE, y + h * KNEEY], [cx - hw - l, y + h * TIP]];
  }

  // The end of a horizontal arm — E, F, L, T, Z. A spike that hangs off the
  // arm's far corner and comes to a point on the outer edge. The first cut
  // used a rectangle here and every arm ended in a visible STEP.
  function spike(x, y, dx, dy) { return [[x - dx, y], [x, y], [x, y + dy]]; }

  // A beaked terminal for an arc — the way this face signs off a C, G or S.
  // Built FROM the arc's own end point so the beak continues the stroke
  // instead of being a triangle parked near it.
  function beak(cx, cy, rx, ry, ang, sw, tw, e, dir) {
    e = ((e == null) ? 0.80 : e) * CUT;
    const at = (r1, r2, a) => {
      const A = a * D2R, c = Math.cos(A), s = Math.sin(A);
      return [cx + r1 * Math.sign(c) * Math.pow(Math.abs(c), e),
              cy + r2 * Math.sign(s) * Math.pow(Math.abs(s), e)];
    };
    return [at(rx, ry, ang), at(rx * 1.03, ry * 1.03, ang - dir * 17), at(rx - sw, ry - tw, ang)];
  }

  // A diagonal bar of a given HORIZONTAL thickness — measuring across rather
  // than perpendicular keeps the joins with vertical stems clean.
  function diag(x0, y0, x1, y1, w0, w1) {
    if (w1 == null) w1 = w0;
    return [[x0 - w0 / 2, y0], [x0 + w0 / 2, y0], [x1 + w1 / 2, y1], [x1 - w1 / 2, y1]];
  }

  // ------------------------------------------------------------- the alphabet
  // Each builder takes a metric bundle and returns the ink width plus its
  // shapes and counters. Advance = w + 2 * side.
  const G = {};

  G.A = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = 690 * M.wide;
    const ax = w / 2;
    return { w, s: [
      diag(ax - S * 0.10, C, S * 0.62, 0, T * 1.10, T * 1.10),
      diag(ax + S * 0.10, C, w - S * 0.62, 0, S * 1.02, S * 1.02),
      rect(w * 0.20, C * 0.255 - T * 0.46, w * 0.80, C * 0.255 + T * 0.46),
      [[ax - S * 0.58, C - M.sh * 0.72], [ax + S * 0.62, C - M.sh * 0.72],
       [ax + S * 0.30, C + 10], [ax - S * 0.26, C + 10]],
      serB(S * 0.62, T * 0.55, 0, M, 1.5, 0.5),
      serB(w - S * 0.62, S * 0.51, 0, M, 0.4, 1.3),
    ], h: [] };
  };

  G.B = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = 630 * M.wide, hs = S / 2;
    const mid = C * 0.485, uy = (C + mid) / 2, ly = mid / 2;
    return { w, s: [
      stem(hs, hs, 0, C, M),
      sband(hs * 1.1, uy, w * 0.86 - hs, (C - mid) / 2, w * 0.86 - hs - S * 0.86, (C - mid) / 2 - T * 0.92, -90, 90, 9, 0.72),
      sband(hs * 1.1, ly, w - hs, mid / 2, w - hs - S * 0.92, mid / 2 - T * 0.98, -90, 90, 9, 0.72),
      rect(-M.sf * 0.62, C - T, w * 0.52, C),
      rect(-M.sf * 0.20, mid - T * 0.48, w * 0.56, mid + T * 0.48),
      rect(-M.sf * 0.62, 0, w * 0.56, T),
      serT(hs, hs, C, M, 1.0, 0), serB(hs, hs, 0, M, 1.0, 0),
    ], h: [] };
  };

  G.C = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = 655 * M.wide, r = C / 2;
    const a0 = 62, a1 = 298;
    return { w, s: [
      sband(w / 2, r, w / 2, r, w / 2 - S, r - T * 1.02, a0, a1, 15, 0.78),
      beak(w / 2, r, w / 2, r, a0, S, T * 1.02, 0.78, 1),
      beak(w / 2, r, w / 2, r, a1, S, T * 1.02, 0.78, -1),
    ], h: [] };
  };

  G.D = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = 675 * M.wide, hs = S / 2;
    return { w, s: [
      stem(hs, hs, 0, C, M),
      sband(hs * 1.05, C / 2, w - hs * 1.05, C / 2, w - hs * 1.05 - S * 0.92, C / 2 - T * 1.02, -90, 90, 11, 0.70),
      rect(-M.sf * 0.62, C - T, w * 0.50, C),
      rect(-M.sf * 0.62, 0, w * 0.50, T),
      serT(hs, hs, C, M, 1.0, 0), serB(hs, hs, 0, M, 1.0, 0),
      // the flag: the logo's D throws a spur up and to the left off its shoulder
      tri([-M.sf * 1.05, C - M.sh * 0.30], [hs, C - M.sh * 0.10], [-M.sf * 0.30, C + M.sh * 0.62]),
    ], h: [] };
  };

  G.E = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = 575 * M.wide, hs = S / 2;
    return { w, s: [
      stem(hs, hs, 0, C, M),
      rect(-M.sf * 0.62, C - T, w, C), spike(w, C - T, T * 1.15, -T * 1.05),
      rect(-M.sf * 0.20, C * 0.475 - T * 0.46, w * 0.74, C * 0.475 + T * 0.46),
      spike(w * 0.74, C * 0.475 - T * 0.46, T * 1.00, -T * 0.80),
      rect(-M.sf * 0.62, 0, w, T), spike(w, T, T * 1.15, T * 1.05),
      serT(hs, hs, C, M, 1.0, 0), serB(hs, hs, 0, M, 1.0, 0),
    ], h: [] };
  };

  G.F = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = 550 * M.wide, hs = S / 2;
    return { w, s: [
      stem(hs, hs, 0, C, M),
      rect(-M.sf * 0.62, C - T, w, C), spike(w, C - T, T * 1.15, -T * 1.05),
      rect(-M.sf * 0.20, C * 0.475 - T * 0.46, w * 0.72, C * 0.475 + T * 0.46),
      spike(w * 0.72, C * 0.475 - T * 0.46, T * 1.00, -T * 0.80),
      serT(hs, hs, C, M, 1.0, 0), serB(hs, hs, 0, M, 1.2, 1.2),
    ], h: [] };
  };

  G.G = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = 700 * M.wide, r = C / 2;
    const bar = C * 0.40, a0 = 62, a1 = 318;
    return { w, s: [
      // the bowl has to run FAR enough round to land inside the spur, or the
      // G ends with its jaw hanging open next to a floating post — which is
      // exactly what the first cut of this glyph did
      sband(w / 2, r, w / 2, r, w / 2 - S, r - T * 1.02, a0, a1, 15, 0.78),
      beak(w / 2, r, w / 2, r, a0, S, T * 1.02, 0.78, 1),
      rect(w * 0.50, bar - T * 0.46, w, bar + T * 0.46),
      rect(w - S, C * 0.09, w, bar + T * 0.46),
    ], h: [] };
  };

  G.H = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = 660 * M.wide, hs = S / 2;
    return { w, s: [
      stem(hs, hs, 0, C, M), stem(w - hs, hs, 0, C, M),
      rect(hs, C * 0.475 - T * 0.48, w - hs, C * 0.475 + T * 0.48),
      serT(hs, hs, C, M), serB(hs, hs, 0, M), serT(w - hs, hs, C, M), serB(w - hs, hs, 0, M),
    ], h: [] };
  };

  G.I = (M) => {
    const C = M.cap, S = M.stem, w = 200 * M.wide, hs = S / 2;
    return { w, s: [stem(w / 2, hs, 0, C, M), serT(w / 2, hs, C, M, 1.5, 1.5), serB(w / 2, hs, 0, M, 1.5, 1.5)], h: [] };
  };

  G.J = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = 470 * M.wide, hs = S / 2;
    const hy = C * 0.235, hw = (w - hs) / 2;
    return { w, s: [
      stem(w - hs, hs, hy, C, M, true, false),
      // a shallow hook that stops well short of the left edge: any deeper and
      // the J starts reading as a U with a missing stem
      sband(w - hs - hw, hy, hw, hy, hw - S * 0.94, hy - T * 1.02, 180, 360, 9, 0.74),
      serT(w - hs, hs, C, M, 1.7, 0.9),
    ], h: [] };
  };

  G.K = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = 665 * M.wide, hs = S / 2;
    const j = C * 0.50;
    return { w, s: [
      stem(hs, hs, 0, C, M),
      // arm and leg meet ON the stem's right flank, one junction, not two
      diag(w - T * 0.55, C, S * 0.92, j, T * 1.06, T * 1.34),
      diag(S * 0.86, j, w - S * 0.46, 0, S * 0.86, S * 1.02),
      serT(hs, hs, C, M), serB(hs, hs, 0, M),
      serT(w - T * 0.55, T * 0.53, C, M, 0.9, 0.9),
      tri([w - S * 0.98, 0], [w, 0], [w + M.sf * 0.62, M.sh * 0.60]),
      serB(w - S * 0.46, S * 0.51, 0, M, 0.2, 1.0),
    ], h: [] };
  };

  G.L = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = 560 * M.wide, hs = S / 2;
    return { w, s: [
      stem(hs, hs, 0, C, M),
      rect(-M.sf * 0.62, 0, w, T), spike(w, T, T * 1.20, T * 1.15),
      serT(hs, hs, C, M),
    ], h: [] };
  };

  G.M = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = 840 * M.wide;
    const hv = T * 0.52, v = C * 0.06;
    return { w, s: [
      stem(hv, hv, 0, C, M), stem(w - hv, hv, 0, C, M),
      // the vertex comes almost all the way down — a shallow M reads as a
      // rounded blob at UI sizes, a deep one keeps its teeth
      diag(hv * 1.5, C, w / 2, v, S * 0.96, S * 0.54),
      diag(w - hv * 1.5, C, w / 2, v, T * 1.02, S * 0.54),
      tri([w / 2 - S * 0.40, v + C * 0.09], [w / 2 + S * 0.40, v + C * 0.09], [w / 2, v - C * 0.05]),
      serT(hv, hv, C, M, 1.3, 0.7), serB(hv, hv, 0, M, 1.3, 0.9),
      serT(w - hv, hv, C, M, 0.7, 1.3), serB(w - hv, hv, 0, M, 0.9, 1.3),
    ], h: [] };
  };

  G.N = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = 680 * M.wide, hv = T * 0.56;
    return { w, s: [
      stem(hv, hv, 0, C, M), stem(w - hv, hv, 0, C, M),
      diag(hv * 1.5, C, w - hv * 1.5, 0, S * 1.02),
      serT(hv, hv, C, M, 1.3, 0.7), serB(hv, hv, 0, M, 1.3, 0.7),
      serT(w - hv, hv, C, M, 0.7, 1.3), serB(w - hv, hv, 0, M, 0.7, 1.3),
    ], h: [] };
  };

  G.O = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = 705 * M.wide * 1.07;
    return { w,
      s: [sarc(w / 2, C / 2, w / 2, C / 2, 0, 360, 26, 0.78)],
      h: [sarc(w / 2, C / 2, w / 2 - S, C / 2 - T * 1.02, 0, 360, 26, 0.78)] };
  };

  G.P = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = 615 * M.wide, hs = S / 2;
    const bt = C * 0.455, by = (C + bt) / 2;
    return { w, s: [
      stem(hs, hs, 0, C, M),
      sband(hs * 1.05, by, w - hs * 1.05, (C - bt) / 2, w - hs * 1.05 - S * 0.90, (C - bt) / 2 - T * 0.95, -90, 90, 9, 0.72),
      rect(-M.sf * 0.62, C - T, w * 0.50, C),
      rect(-M.sf * 0.20, bt - T * 0.48, w * 0.52, bt + T * 0.48),
      serT(hs, hs, C, M, 1.0, 0),
      serB(hs, hs, 0, M, 1.25, 1.0),
      // the foot spike: the logo's P drives a point down and out to the left.
      // It has to stay INSIDE the left sidebearing — the first cut reached a
      // tenth of an em past the origin and speared whatever letter came before.
      tri([-M.sf * 1.15, M.sh * 0.16], [hs, 0], [-M.sf * 0.30, M.sh * 1.05]),
    ], h: [] };
  };

  G.Q = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = 705 * M.wide * 1.07;
    return { w,
      s: [sarc(w / 2, C / 2, w / 2, C / 2, 0, 360, 26, 0.78),
          diag(w * 0.50, C * 0.28, w * 0.99, -C * 0.15, T * 1.20, T * 0.86),
          tri([w * 0.82, -C * 0.06], [w * 1.06, C * 0.02], [w * 1.02, -C * 0.20])],
      h: [sarc(w / 2, C / 2, w / 2 - S, C / 2 - T * 1.02, 0, 360, 26, 0.78)] };
  };

  G.R = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = 665 * M.wide, hs = S / 2;
    const bt = C * 0.47, by = (C + bt) / 2, bw = w * 0.86;
    return { w, s: [
      stem(hs, hs, 0, C, M),
      sband(hs * 1.05, by, bw - hs * 1.05, (C - bt) / 2, bw - hs * 1.05 - S * 0.88, (C - bt) / 2 - T * 0.95, -90, 90, 9, 0.72),
      rect(-M.sf * 0.62, C - T, w * 0.48, C),
      rect(-M.sf * 0.20, bt - T * 0.48, w * 0.50, bt + T * 0.48),
      // the leg kicks out and finishes on a point
      diag(w * 0.46, bt + T * 0.30, w - S * 0.42, 0, S * 0.80, S * 0.92),
      tri([w - S * 0.92, 0], [w, 0], [w + M.sf * 0.80, M.sh * 0.62]),
      serT(hs, hs, C, M, 1.0, 0), serB(hs, hs, 0, M, 1.0, 0),
      serB(w - S * 0.44, S * 0.46, 0, M, 0.2, 0.9),
    ], h: [] };
  };

  G.S = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = 590 * M.wide;
    const uy = C * 0.715, ur = C * 0.285, ly = C * 0.265, lr = C * 0.265;
    const ux = w * 0.50, lx = w * 0.50;
    return { w, s: [
      sband(ux, uy, w * 0.50, ur, w * 0.50 - S * 0.92, ur - T * 0.98, 34, 272, 12, 0.76),
      sband(lx, ly, w * 0.50, lr, w * 0.50 - S * 0.92, lr - T * 0.98, -172, 96, 12, 0.76),
      // the spine: the two bowls are drawn apart and joined by hand so the
      // waist stays thick instead of pinching where the arcs cross
      diag(w * 0.30, C * 0.62, w * 0.62, C * 0.36, S * 1.02),
      beak(ux, uy, w * 0.50, ur, 34, S * 0.92, T * 0.98, 0.76, 1),
      beak(lx, ly, w * 0.50, lr, -172, S * 0.92, T * 0.98, 0.76, -1),
    ], h: [] };
  };

  G.T = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = 630 * M.wide, hs = S / 2;
    return { w, s: [
      rect(0, C - T, w, C),
      [[0, C - T], [T * 1.20, C - T], [0, C - T * 2.15]],
      spike(w, C - T, T * 1.20, -T * 1.15),
      stem(w / 2, hs, 0, C, M, false, true),
      serB(w / 2, hs, 0, M, 1.4, 1.4),
    ], h: [] };
  };

  G.U = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = 665 * M.wide, hs = S / 2;
    const by = C * 0.29;
    return { w, s: [
      stem(hs, hs, by * 0.6, C, M, true, false), stem(w - hs, hs, by * 0.6, C, M, true, false),
      sband(w / 2, by, w / 2, by, w / 2 - S, by - T * 1.02, 180, 360, 11, 0.74),
      serT(hs, hs, C, M), serT(w - hs, hs, C, M),
    ], h: [] };
  };

  G.V = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = 685 * M.wide;
    return { w, s: [
      diag(S * 0.56, C, w / 2 - S * 0.06, C * 0.03, S * 1.02, S * 0.62),
      diag(w - T * 0.60, C, w / 2 + S * 0.06, C * 0.03, T * 1.06, T * 0.70),
      tri([w / 2 - S * 0.52, C * 0.10], [w / 2 + S * 0.52, C * 0.10], [w / 2, -C * 0.025]),
      serT(S * 0.56, S * 0.51, C, M, 1.2, 0.9), serT(w - T * 0.60, T * 0.53, C, M, 0.9, 1.2),
    ], h: [] };
  };

  G.W = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = 960 * M.wide;
    const a = w * 0.27, b = w * 0.50, c = w * 0.73;
    return { w, s: [
      diag(S * 0.54, C, a, C * 0.05, S * 0.96, S * 0.56),
      diag(b - S * 0.06, C * 0.90, a, C * 0.05, T * 1.00, T * 0.62),
      diag(b + S * 0.06, C * 0.90, c, C * 0.05, S * 0.92, S * 0.54),
      diag(w - T * 0.58, C, c, C * 0.05, T * 1.02, T * 0.62),
      tri([a - S * 0.46, C * 0.12], [a + S * 0.46, C * 0.12], [a, -C * 0.02]),
      tri([c - S * 0.44, C * 0.12], [c + S * 0.44, C * 0.12], [c, -C * 0.02]),
      // the middle peak stops SHORT of the cap line; running it to full
      // height put a slab on top of the W and killed the rhythm
      tri([b - S * 0.46, C * 0.74], [b + S * 0.46, C * 0.74], [b, C * 0.99]),
      serT(S * 0.54, S * 0.48, C, M, 1.2, 0.8), serT(w - T * 0.58, T * 0.51, C, M, 0.8, 1.2),
    ], h: [] };
  };

  G.X = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = 670 * M.wide;
    return { w, s: [
      diag(S * 0.56, C, w - S * 0.56, 0, S * 0.98),
      diag(w - T * 0.60, C, T * 0.60, 0, T * 1.08),
      serT(S * 0.56, S * 0.49, C, M, 1.1, 0.7), serT(w - T * 0.60, T * 0.54, C, M, 0.7, 1.1),
      serB(w - S * 0.56, S * 0.49, 0, M, 0.7, 1.1), serB(T * 0.60, T * 0.54, 0, M, 1.1, 0.7),
    ], h: [] };
  };

  G.Y = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = 650 * M.wide, hs = S / 2;
    const j = C * 0.40;
    return { w, s: [
      diag(S * 0.56, C, w / 2 - S * 0.04, j, S * 0.96, S * 0.70),
      diag(w - T * 0.60, C, w / 2 + S * 0.04, j, T * 1.06, T * 0.80),
      stem(w / 2, hs, 0, j + C * 0.06, M, false, true),
      serT(S * 0.56, S * 0.48, C, M, 1.1, 0.8), serT(w - T * 0.60, T * 0.53, C, M, 0.8, 1.1),
      serB(w / 2, hs, 0, M, 1.4, 1.4),
    ], h: [] };
  };

  G.Z = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = 600 * M.wide;
    return { w, s: [
      rect(0, C - T, w, C), spike(w, C - T, T * 1.20, -T * 1.15),
      diag(w - S * 0.50, C - T * 0.4, S * 0.50, T * 0.4, S * 1.02),
      rect(0, 0, w, T), [[0, T], [T * 1.20, T], [0, T * 2.15]],
    ], h: [] };
  };

  // ------------------------------------------------------------------ digits
  // Tabular by design — every figure carries the same advance, so a gold
  // counter ticking up never makes the panel next to it twitch.
  const FIGW = 560;

  G['0'] = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = FIGW * M.wide;
    return { w,
      s: [sarc(w / 2, C / 2, w / 2, C / 2, 0, 360, 24, 0.78),
          diag(w * 0.70, C * 0.74, w * 0.30, C * 0.26, T * 0.78)],
      h: [sarc(w / 2, C / 2, w / 2 - S * 0.92, C / 2 - T * 1.02, 0, 360, 24, 0.78)] };
  };

  G['1'] = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = FIGW * M.wide, hs = S / 2;
    return { w, s: [
      stem(w / 2, hs, 0, C, M, false, true),
      diag(w / 2 - S * 0.30, C, w * 0.16, C * 0.74, T * 1.00, T * 0.80),
      serB(w / 2, hs, 0, M, 1.7, 1.7),
    ], h: [] };
  };

  G['2'] = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = FIGW * M.wide;
    return { w, s: [
      sband(w / 2, C * 0.71, w / 2, C * 0.29, w / 2 - S * 0.92, C * 0.29 - T * 0.98, -12, 200, 11, 0.76),
      diag(w * 0.82, C * 0.52, w * 0.20, T * 0.9, S * 0.92),
      rect(0, 0, w, T), rect(w - T * 0.82, 0, w, T * 1.85),
    ], h: [] };
  };

  G['3'] = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = FIGW * M.wide;
    return { w, s: [
      sband(w * 0.46, C * 0.735, w * 0.50, C * 0.265, w * 0.50 - S * 0.90, C * 0.265 - T * 0.96, -100, 190, 11, 0.76),
      sband(w * 0.46, C * 0.255, w * 0.52, C * 0.255, w * 0.52 - S * 0.90, C * 0.255 - T * 0.96, -190, 100, 11, 0.76),
      rect(w * 0.28, C * 0.44, w * 0.66, C * 0.44 + T * 0.86),
    ], h: [] };
  };

  G['4'] = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = FIGW * M.wide;
    return { w, s: [
      diag(w * 0.70, C, w * 0.10, C * 0.30, T * 1.10),
      rect(0, C * 0.30, w * 0.96, C * 0.30 + T * 0.94),
      stem(w * 0.66, S * 0.50, 0, C, M, false, true),
      serB(w * 0.66, S * 0.50, 0, M, 1.2, 1.2),
    ], h: [] };
  };

  G['5'] = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = FIGW * M.wide;
    return { w, s: [
      rect(0, C - T, w * 0.96, C), rect(w * 0.96 - T * 0.82, C - T * 1.85, w * 0.96, C),
      stem(S * 0.50, S * 0.50, C * 0.50, C, M, false, false),
      rect(0, C * 0.50, w * 0.58, C * 0.50 + T * 0.92),
      sband(w * 0.44, C * 0.275, w * 0.56, C * 0.275, w * 0.56 - S * 0.92, C * 0.275 - T * 0.98, -190, 84, 12, 0.76),
    ], h: [] };
  };

  G['6'] = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = FIGW * M.wide;
    return { w,
      s: [sarc(w / 2, C * 0.29, w / 2, C * 0.29, 0, 360, 22, 0.78),
          sband(w * 0.56, C * 0.62, w * 0.52, C * 0.38, w * 0.52 - S * 0.90, C * 0.38 - T * 0.96, 92, 214, 9, 0.76),
          tri([w * 0.10, C * 0.86], [w * 0.40, C * 1.02], [w * 0.30, C * 0.70])],
      h: [sarc(w / 2, C * 0.29, w / 2 - S * 0.92, C * 0.29 - T * 1.00, 0, 360, 22, 0.78)] };
  };

  G['7'] = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = FIGW * M.wide;
    return { w, s: [
      rect(0, C - T, w, C), rect(0, C - T * 1.95, T * 0.82, C),
      diag(w * 0.92, C - T * 0.3, w * 0.30, 0, S * 1.00),
      rect(w * 0.16, C * 0.48 - T * 0.40, w * 0.74, C * 0.48 + T * 0.40),
      serB(w * 0.34, S * 0.50, 0, M, 1.0, 1.0),
    ], h: [] };
  };

  G['8'] = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = FIGW * M.wide;
    return { w,
      s: [sarc(w / 2, C * 0.735, w * 0.44, C * 0.265, 0, 360, 20, 0.78),
          sarc(w / 2, C * 0.265, w * 0.50, C * 0.265, 0, 360, 20, 0.78)],
      h: [sarc(w / 2, C * 0.735, w * 0.44 - S * 0.86, C * 0.265 - T * 0.94, 0, 360, 20, 0.78),
          sarc(w / 2, C * 0.265, w * 0.50 - S * 0.90, C * 0.265 - T * 0.96, 0, 360, 20, 0.78)] };
  };

  G['9'] = (M) => {
    const C = M.cap, S = M.stem, T = M.thin, w = FIGW * M.wide;
    return { w,
      s: [sarc(w / 2, C * 0.71, w / 2, C * 0.29, 0, 360, 22, 0.78),
          sband(w * 0.44, C * 0.38, w * 0.52, C * 0.38, w * 0.52 - S * 0.90, C * 0.38 - T * 0.96, -88, 34, 9, 0.76),
          tri([w * 0.90, C * 0.14], [w * 0.60, -C * 0.02], [w * 0.70, C * 0.30])],
      h: [sarc(w / 2, C * 0.71, w / 2 - S * 0.92, C * 0.29 - T * 1.00, 0, 360, 22, 0.78)] };
  };

  // -------------------------------------------------------------- punctuation
  const dot = (M, cx, cy, r) => [[cx - r, cy - r * 1.06], [cx + r, cy - r * 1.06],
                                 [cx + r * 1.06, cy - r * 0.30], [cx + r * 0.72, cy + r],
                                 [cx - r * 0.72, cy + r], [cx - r * 1.06, cy - r * 0.30]];

  G['.'] = (M) => { const r = M.thin * 0.62, w = r * 2.2; return { w, s: [dot(M, w / 2, r, r)], h: [] }; };
  G[','] = (M) => { const r = M.thin * 0.62, w = r * 2.2;
    return { w, s: [dot(M, w / 2, r, r), tri([w / 2 - r * 0.75, r * 0.2], [w / 2 + r * 0.55, r * 0.2], [w / 2 - r * 0.55, -r * 2.3])], h: [] }; };
  G[':'] = (M) => { const r = M.thin * 0.62, w = r * 2.2, C = M.cap;
    return { w, s: [dot(M, w / 2, r, r), dot(M, w / 2, C * 0.62, r)], h: [] }; };
  G[';'] = (M) => { const r = M.thin * 0.62, w = r * 2.2, C = M.cap;
    return { w, s: [dot(M, w / 2, r, r), tri([w / 2 - r * 0.75, r * 0.2], [w / 2 + r * 0.55, r * 0.2], [w / 2 - r * 0.55, -r * 2.3]), dot(M, w / 2, C * 0.62, r)], h: [] }; };
  G['!'] = (M) => { const C = M.cap, S = M.stem, r = M.thin * 0.60, w = S * 1.05;
    return { w, s: [dot(M, w / 2, r, r),
                    [[w / 2 - S * 0.46, C], [w / 2 + S * 0.46, C], [w / 2 + S * 0.24, C * 0.24], [w / 2 - S * 0.24, C * 0.24]],
                    serT(w / 2, S * 0.46, C, M, 0.5, 0.5)], h: [] }; };
  G['?'] = (M) => { const C = M.cap, S = M.stem, T = M.thin, w = 480 * M.wide, r = T * 0.60;
    return { w, s: [
      sband(w / 2, C * 0.735, w * 0.46, C * 0.265, w * 0.46 - S * 0.88, C * 0.265 - T * 0.94, -24, 200, 11, 0.76),
      diag(w * 0.86, C * 0.60, w * 0.54, C * 0.30, S * 0.88),
      rect(w / 2 - S * 0.44, C * 0.24, w / 2 + S * 0.44, C * 0.34),
      dot(M, w / 2, r, r),
    ], h: [] }; };
  // Quote marks are WEDGES — broad at the cap line, cut to a point below.
  // Drawn as bars they were four identical ticks and the reader could not
  // tell an apostrophe from an open double.
  const quill = (M, cx, lean) => { const C = M.cap, S = M.stem;
    return [[cx - S * 0.38, C], [cx + S * 0.38, C], [cx + S * 0.38 * lean, C * 0.60]]; };
  G["'"] = (M) => { const S = M.stem, w = S * 1.05; return { w, s: [quill(M, w / 2, 0.30)], h: [] }; };
  G['"'] = (M) => { const S = M.stem, w = S * 1.90, d = S * 0.46;
    return { w, s: [quill(M, w / 2 - d, 0.30), quill(M, w / 2 + d, 0.30)], h: [] }; };
  G['‛'] = (M) => { const S = M.stem, w = S * 1.05; return { w, s: [quill(M, w / 2, -0.30)], h: [] }; };
  G['('] = (M) => { const C = M.cap, T = M.thin, w = 320 * M.wide;
    return { w, s: [sband(w * 1.06, C * 0.46, w * 1.00, C * 0.72, w * 1.00 - T * 1.25, C * 0.72 - T * 1.25, 138, 222, 11, 0.90)], h: [] }; };
  G[')'] = (M) => { const C = M.cap, T = M.thin, w = 320 * M.wide;
    return { w, s: [sband(-w * 0.06, C * 0.46, w * 1.00, C * 0.72, w * 1.00 - T * 1.25, C * 0.72 - T * 1.25, -42, 42, 11, 0.90)], h: [] }; };
  G['['] = (M) => { const C = M.cap, T = M.thin, w = 290 * M.wide, y1 = C * 1.06, y0 = -C * 0.12;
    return { w, s: [rect(w * 0.20, y0, w * 0.20 + T * 1.02, y1), rect(w * 0.20, y1 - T * 0.92, w * 0.88, y1), rect(w * 0.20, y0, w * 0.88, y0 + T * 0.92)], h: [] }; };
  G[']'] = (M) => { const C = M.cap, T = M.thin, w = 290 * M.wide, y1 = C * 1.06, y0 = -C * 0.12;
    return { w, s: [rect(w * 0.80 - T * 1.02, y0, w * 0.80, y1), rect(w * 0.12, y1 - T * 0.92, w * 0.80, y1), rect(w * 0.12, y0, w * 0.80, y0 + T * 0.92)], h: [] }; };
  G['-'] = (M) => { const C = M.cap, T = M.thin, w = 360 * M.wide;
    return { w, s: [rect(w * 0.12, C * 0.42 - T * 0.44, w * 0.88, C * 0.42 + T * 0.44)], h: [] }; };
  G['–'] = (M) => { const C = M.cap, T = M.thin, w = 500 * M.wide;
    return { w, s: [rect(w * 0.06, C * 0.42 - T * 0.42, w * 0.94, C * 0.42 + T * 0.42)], h: [] }; };
  G['—'] = (M) => { const C = M.cap, T = M.thin, w = 780 * M.wide;
    return { w, s: [rect(0, C * 0.42 - T * 0.42, w, C * 0.42 + T * 0.42)], h: [] }; };
  G['_'] = (M) => { const T = M.thin, w = 560 * M.wide;
    return { w, s: [rect(0, -M.cap * 0.16, w, -M.cap * 0.16 + T * 0.80)], h: [] }; };
  G['/'] = (M) => { const C = M.cap, T = M.thin, w = 460 * M.wide;
    return { w, s: [diag(w * 0.86, C * 1.02, w * 0.14, -C * 0.10, T * 1.02)], h: [] }; };
  G['\\'] = (M) => { const C = M.cap, T = M.thin, w = 460 * M.wide;
    return { w, s: [diag(w * 0.14, C * 1.02, w * 0.86, -C * 0.10, T * 1.02)], h: [] }; };
  G['|'] = (M) => { const C = M.cap, T = M.thin, w = 240 * M.wide;
    return { w, s: [rect(w / 2 - T * 0.40, -C * 0.12, w / 2 + T * 0.40, C * 1.06)], h: [] }; };
  G['+'] = (M) => { const C = M.cap, T = M.thin, w = 560 * M.wide, m = C * 0.44;
    return { w, s: [rect(w * 0.10, m - T * 0.46, w * 0.90, m + T * 0.46), rect(w / 2 - T * 0.46, m - C * 0.34, w / 2 + T * 0.46, m + C * 0.34)], h: [] }; };
  G['='] = (M) => { const C = M.cap, T = M.thin, w = 560 * M.wide, m = C * 0.44;
    return { w, s: [rect(w * 0.08, m + T * 0.24, w * 0.92, m + T * 1.08), rect(w * 0.08, m - T * 1.08, w * 0.92, m - T * 0.24)], h: [] }; };
  G['<'] = (M) => { const C = M.cap, T = M.thin, w = 520 * M.wide, m = C * 0.44;
    return { w, s: [diag(w * 0.92, m + C * 0.32, w * 0.16, m, T * 1.00), diag(w * 0.16, m, w * 0.92, m - C * 0.32, T * 1.00)], h: [] }; };
  G['>'] = (M) => { const C = M.cap, T = M.thin, w = 520 * M.wide, m = C * 0.44;
    return { w, s: [diag(w * 0.08, m + C * 0.32, w * 0.84, m, T * 1.00), diag(w * 0.84, m, w * 0.08, m - C * 0.32, T * 1.00)], h: [] }; };
  G['*'] = (M) => { const C = M.cap, T = M.thin, w = 420 * M.wide, m = C * 0.74, r = C * 0.24;
    const s = [];
    for (let i = 0; i < 3; i++) {
      const a = (i * 60 + 90) * D2R, dx = Math.cos(a) * r, dy = Math.sin(a) * r;
      s.push(diag(w / 2 - dx, m - dy, w / 2 + dx, m + dy, T * 0.74));
    }
    return { w, s, h: [] }; };
  G['#'] = (M) => { const C = M.cap, T = M.thin, w = 640 * M.wide;
    return { w, s: [rect(w * 0.06, C * 0.28, w * 0.94, C * 0.28 + T * 0.74), rect(w * 0.06, C * 0.58, w * 0.94, C * 0.58 + T * 0.74),
                    diag(w * 0.42, C * 0.96, w * 0.30, -C * 0.02, T * 0.80), diag(w * 0.76, C * 0.96, w * 0.64, -C * 0.02, T * 0.80)], h: [] }; };
  G['%'] = (M) => { const C = M.cap, T = M.thin, w = 760 * M.wide, r = C * 0.20;
    return { w,
      s: [diag(w * 0.84, C * 1.00, w * 0.16, -C * 0.02, T * 0.92),
          sarc(w * 0.22, C - r, r, r, 0, 360, 14, 0.80), sarc(w * 0.78, r, r, r, 0, 360, 14, 0.80)],
      h: [sarc(w * 0.22, C - r, r - T * 0.80, r - T * 0.80, 0, 360, 14, 0.80),
          sarc(w * 0.78, r, r - T * 0.80, r - T * 0.80, 0, 360, 14, 0.80)] }; };
  // Two rings and a stroke through them, rather than the four loose arcs the
  // first attempt used — those never closed and the glyph read as a bird.
  G['&'] = (M) => { const C = M.cap, S = M.stem, T = M.thin, w = 730 * M.wide;
    const ux = w * 0.32, uy = C * 0.80, urx = w * 0.24, ury = C * 0.20;
    const lx = w * 0.40, ly = C * 0.26, lrx = w * 0.40, lry = C * 0.26;
    return { w, s: [
      sband(ux, uy, urx, ury, urx - S * 0.78, ury - T * 0.80, 0, 360, 18, 0.80),
      sband(lx, ly, lrx, lry, lrx - S * 0.86, lry - T * 0.90, 22, 302, 13, 0.78),
      // the crossing stroke must start BELOW the top loop's counter; run it
      // any higher and the thick diagonal fills the loop in and the glyph
      // turns into a solid lump
      diag(w * 0.26, C * 0.57, w * 0.78, C * 0.03, S * 0.84),
      diag(w * 0.56, C * 0.38, w * 1.00, C * 0.06, T * 0.90),
    ], h: [] }; };
  G['@'] = (M) => { const C = M.cap, T = M.thin, w = 800 * M.wide, r = C * 0.50;
    return { w,
      s: [sband(w / 2, r, w / 2, r, w / 2 - T * 0.94, r - T * 0.94, -50, 280, 18, 0.80),
          sarc(w / 2, r, r * 0.46, r * 0.46, 0, 360, 14, 0.80),
          rect(w / 2 + r * 0.36, r * 0.62, w / 2 + r * 0.50, r * 1.26)],
      h: [sarc(w / 2, r, r * 0.46 - T * 0.82, r * 0.46 - T * 0.82, 0, 360, 14, 0.80)] }; };
  G['$'] = (M) => { const C = M.cap, T = M.thin;
    const s = G.S(M), w = s.w;
    return { w, s: s.s.concat([rect(w / 2 - T * 0.34, -C * 0.10, w / 2 + T * 0.34, C * 1.10)]), h: [] }; };
  G['~'] = (M) => { const C = M.cap, T = M.thin, w = 600 * M.wide, m = C * 0.44;
    return { w, s: [diag(w * 0.04, m, w * 0.34, m + C * 0.14, T * 0.82), diag(w * 0.34, m + C * 0.14, w * 0.66, m - C * 0.14, T * 0.82), diag(w * 0.66, m - C * 0.14, w * 0.96, m, T * 0.82)], h: [] }; };
  G['°'] = (M) => { const C = M.cap, T = M.thin, w = 340 * M.wide, r = C * 0.15;
    return { w, s: [sarc(w / 2, C - r * 1.2, r, r, 0, 360, 14, 0.80)], h: [sarc(w / 2, C - r * 1.2, r - T * 0.64, r - T * 0.64, 0, 360, 14, 0.80)] }; };
  G['×'] = (M) => { const C = M.cap, T = M.thin, w = 520 * M.wide, m = C * 0.44, r = C * 0.22;
    return { w, s: [diag(w / 2 - r, m + r, w / 2 + r, m - r, T * 0.90), diag(w / 2 + r, m + r, w / 2 - r, m - r, T * 0.90)], h: [] }; };
  G['•'] = (M) => { const C = M.cap, w = 340 * M.wide, r = M.thin * 0.72;
    return { w, s: [sarc(w / 2, C * 0.44, r, r, 0, 360, 12, 0.80)], h: [] }; };
  G['…'] = (M) => { const r = M.thin * 0.62, w = r * 6.6;
    return { w, s: [dot(M, r * 1.1, r, r), dot(M, r * 3.3, r, r), dot(M, r * 5.5, r, r)], h: [] }; };
  // openers lean the other way from closers, which is the only thing that
  // makes a quoted phrase read as quoted
  G['‘'] = (M) => { const S = M.stem, w = S * 1.05; return { w, s: [quill(M, w / 2, -0.30)], h: [] }; };
  G['’'] = (M) => G["'"](M);
  G['“'] = (M) => { const S = M.stem, w = S * 1.90, d = S * 0.46;
    return { w, s: [quill(M, w / 2 - d, -0.30), quill(M, w / 2 + d, -0.30)], h: [] }; };
  G['”'] = (M) => G['"'](M);

  // ------------------------------------------------- built glyphs + fallbacks
  // A glyph is built once per (character, case) and then cached forever; the
  // outlines are pure geometry, so nothing about a draw can invalidate them.
  const SPACE = { adv: 300, s: [], h: [], space: true };
  const built = { cap: {}, small: {} };

  // A shape's winding decides whether it ADDS ink or removes it, and hand
  // authoring made both directions inevitable. Rather than police that in 90
  // glyphs, every contour is re-wound here: positives anticlockwise, counters
  // clockwise. It is why an overlapping stem can never punch a hole.
  function area(p) {
    let a = 0;
    for (let i = 0, n = p.length; i < n; i++) { const q = p[(i + 1) % n]; a += p[i][0] * q[1] - q[0] * p[i][1]; }
    return a / 2;
  }
  function wind(p, positive) {
    const a = area(p);
    return ((a < 0) === positive) ? p.slice().reverse() : p;
  }

  function build(ch, small) {
    const store = small ? built.small : built.cap;
    if (store[ch] !== undefined) return store[ch];
    let g = null;
    if (ch === ' ' || ch === ' ') {
      g = { adv: (small ? MS : MC).cap * 0.46, s: [], h: [], space: true };
    } else {
      const key = (small && /[a-z]/.test(ch)) ? ch.toUpperCase() : ch;
      const fn = G[key];
      if (fn) {
        const M = small ? MS : MC;
        const r = fn(M);
        g = {
          adv: r.w + 2 * M.side,
          s: r.s.map((c) => wind(c, true).map((p) => [p[0] + M.side, p[1]])),
          h: (r.h || []).map((c) => wind(c, false).map((p) => [p[0] + M.side, p[1]])),
        };
      }
    }
    store[ch] = g;
    return g;
  }

  // A character belongs to Grimcut only if it has an outline. Everything else
  // — emoji above all — must reach the browser untouched.
  function covers(ch) {
    if (ch === ' ' || ch === ' ') return true;
    if (/[a-z]/.test(ch)) return !!G[ch.toUpperCase()];
    return !!G[ch];
  }

  // Lowercase is small caps, so a-z and A-Z share an outline at two sizes.
  function glyphFor(ch) {
    if (/[a-z]/.test(ch)) return build(ch, true);
    return build(ch, false);
  }

  // ------------------------------------------------------------------ kerning
  // Only the pairs that actually collide in this face. Values are 1/1000 em,
  // negative pulls together.
  const KERN = {
    'AV': -46, 'AT': -52, 'AW': -40, 'AY': -50, 'VA': -46, 'TA': -52, 'WA': -40, 'YA': -50,
    'LT': -58, 'LY': -54, 'LV': -48, 'LW': -42, 'PA': -48, 'FA': -46, 'RT': -22, 'RV': -18,
    'TO': -22, 'TY': -14, 'VO': -20, 'YO': -24, 'AC': -18, 'AG': -18, 'AO': -16, 'AQ': -16,
    'P.': -70, 'F.': -62, 'T.': -62, 'V.': -54, 'W.': -46, 'Y.': -62, 'L.': -14,
    'P,': -70, 'F,': -62, 'T,': -62, 'V,': -54, 'W,': -46, 'Y,': -62,
    'r.': -20, 'y.': -30, 'v.': -28, 'w.': -22, 'f.': -26, 't.': -26,
    'D.': -18, 'O.': -16, 'B.': -14, 'DA': -20, 'OA': -18, 'LA': -12,
  };
  function kern(a, b) {
    const k = KERN[a + b];
    if (k != null) return k;
    // small caps inherit their capitals' pairs, scaled to their height
    const K2 = KERN[a.toUpperCase() + b.toUpperCase()];
    return K2 != null ? K2 * (MS.cap / MC.cap) : 0;
  }

  // ------------------------------------------------------------------- styles
  // The metal treatments are the logo's own two finishes plus the three the
  // game's panels needed. `plain` is deliberately naked: it fills with
  // whatever colour the caller already set, so swapping a font string never
  // changes what colour a label is.
  const STYLES = {
    plain:  {},
    ink:    { outline: '#0b0709', ow: 0.045 },
    // The metal finishes carry a HEAVY outline. Held against the logo, a
    // thin one was the single thing still giving the face away: the dark
    // keyline is what lifts carved metal off a stone wall, and the gradient
    // under it has to fall away fast rather than fade politely.
    gold:   { outline: '#251103', ow: 0.155, bevel: 1,
              grad: [[0, '#fffbe6'], [0.20, '#ffd94c'], [0.52, '#e89a10'], [0.86, '#a85c05'], [1, '#713801']] },
    silver: { outline: '#161014', ow: 0.155, bevel: 1,
              grad: [[0, '#ffffff'], [0.24, '#f3f1eb'], [0.56, '#c2bcb3'], [0.88, '#8a8178'], [1, '#655d55']] },
    stone:  { outline: '#0f0b0f', ow: 0.135, bevel: 0.7,
              grad: [[0, '#c4bdb4'], [0.40, '#948c83'], [0.86, '#6a625b'], [1, '#4c4540']] },
    blood:  { outline: '#1c0604', ow: 0.155, bevel: 1,
              grad: [[0, '#ffc4b6'], [0.26, '#ef5a42'], [0.62, '#a52318'], [0.9, '#6a120c'], [1, '#480805']] },
    ember:  { outline: '#210a01', ow: 0.155, bevel: 1,
              grad: [[0, '#fff0c0'], [0.26, '#ffa233'], [0.62, '#e0470d'], [0.9, '#8d2205'], [1, '#5c1303']] },
  };

  const FAMILY = {
    'grimcut': 'plain', 'grimcut ink': 'ink', 'grimcut gold': 'gold',
    'grimcut silver': 'silver', 'grimcut stone': 'stone', 'grimcut blood': 'blood',
    'grimcut ember': 'ember',
  };

  // ------------------------------------------------------------------- layout
  // A run is a maximal stretch of one kind: ours, or the browser's.
  function runs(str) {
    const out = [];
    let cur = null;
    for (const ch of String(str)) {
      const mine = covers(ch);
      if (!cur || cur.mine !== mine) { cur = { mine, text: ch }; out.push(cur); }
      else cur.text += ch;
    }
    return out;
  }

  // Width of one of OUR runs, in em units.
  function runWidth(text, track) {
    let x = 0, prev = null;
    for (const ch of text) {
      const g = glyphFor(ch);
      if (!g) continue;
      if (prev) x += kern(prev, ch);
      x += g.adv + track;
      prev = ch;
    }
    return x;
  }

  // ------------------------------------------------------------------ drawing
  // Everything about a string becomes ONE path. That is the whole performance
  // story: a headline costs a beginPath and a fill, exactly like fillText did.
  function emit(ctx, text, x, y, sz, track, bold) {
    let pen = x, prev = null;
    const push = (c) => {
      ctx.moveTo(pen + c[0][0] * sz, y - c[0][1] * sz);
      for (let i = 1; i < c.length; i++) ctx.lineTo(pen + c[i][0] * sz, y - c[i][1] * sz);
      ctx.closePath();
    };
    for (const ch of text) {
      const g = glyphFor(ch);
      if (!g) continue;
      if (prev) pen += kern(prev, ch) * sz;
      if (!g.space) { for (const c of g.s) push(c); for (const c of g.h) push(c); }
      pen += (g.adv + track) * sz;
      prev = ch;
    }
    return pen - x;
  }

  function baselineShift(base, sz) {
    switch (base) {
      case 'top': case 'hanging': return CAP * sz;
      case 'middle': return CAP * 0.5 * sz;
      case 'bottom': return -DESC * 0.34 * sz;
      default: return 0;                     // alphabetic / ideographic
    }
  }

  // ---------------------------------------------------------------- public API
  const Grimcut = {
    EM, CAP, DESC, STYLES, FAMILY,
    metrics: { cap: MC, small: MS },
    covers, glyph: glyphFor, kern,

    /** Width of `str` at `px` em size, in px. Emoji fall back to `ctx`. */
    measure(ctx, str, px, opts) {
      opts = opts || {};
      const track = opts.track || 0;
      const sz = px / EM;
      let w = 0;
      for (const r of runs(str)) {
        if (r.mine) w += runWidth(r.text, track) * sz;
        else if (ctx) {
          const save = ctx.font;
          ctx.font = opts.fallback || ctx.font;
          w += ctx.measureText(r.text).width;
          ctx.font = save;
        }
      }
      return w;
    },

    /**
     * Draw `str` with the face. `opts`:
     *   style     one of STYLES (default 'plain')
     *   align     left | center | right | start | end
     *   baseline  alphabetic | top | middle | bottom | hanging
     *   track     letter spacing, 1/1000 em
     *   bold      extra weight, 1/1000 em of dilation
     *   fallback  font string for characters the face does not cover
     */
    draw(ctx, str, x, y, px, opts) {
      opts = opts || {};
      const st = STYLES[opts.style] || STYLES.plain;
      const track = opts.track || 0;
      const bold = opts.bold || 0;
      const sz = px / EM;
      const parts = runs(str);
      if (!parts.length) return 0;

      // measure first: alignment needs the whole width, fallback runs included
      const widths = parts.map((r) => {
        if (r.mine) return runWidth(r.text, track) * sz;
        const save = ctx.font;
        if (opts.fallback) ctx.font = opts.fallback;
        const w = ctx.measureText(r.text).width;
        ctx.font = save;
        return w;
      });
      const total = widths.reduce((a, b) => a + b, 0);

      const al = opts.align || 'left';
      let pen = x;
      if (al === 'center') pen = x - total / 2;
      else if (al === 'right' || al === 'end') pen = x - total;
      const base = y + baselineShift(opts.baseline || 'alphabetic', sz);

      // A metal style paints itself and never reads the caller's fill, so it
      // caches no matter what the context is holding. Only a PLAIN run over a
      // caller's gradient has to go the slow way, because that gradient is
      // pinned to the game's coordinates, not to the run.
      const cacheable = HAS_P2D && (!!st.grad || typeof ctx.fillStyle === 'string');
      const col = st.grad ? '' : ctx.fillStyle;
      const dev = cacheable ? devScale(ctx) : 1;

      for (let i = 0; i < parts.length; i++) {
        const r = parts[i];
        if (r.mine) {
          const bmp = cacheable ? raster(r.text, track, px, st, opts.style || 'plain', col, bold, dev) : null;
          if (bmp) ctx.drawImage(bmp.cv, pen + bmp.ox, base + bmp.oy, bmp.w, bmp.h);
          else drawRun(ctx, r.text, pen, base, sz, track, bold, st, px);
        } else {
          const sf = ctx.font, sa = ctx.textAlign, sb = ctx.textBaseline;
          if (opts.fallback) ctx.font = opts.fallback;
          ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
          ctx.fillText(r.text, pen, base);
          ctx.font = sf; ctx.textAlign = sa; ctx.textBaseline = sb;
        }
        pen += widths[i];
      }
      return total;
    },

    /** Stroke-only variant, for the game's own outlined labels. */
    stroke(ctx, str, x, y, px, opts) {
      opts = Object.assign({}, opts, { strokeOnly: true });
      return this.draw(ctx, str, x, y, px, opts);
    },
  };

  // ---------------------------------------------------------------- caching
  // Rebuilding a string's outline every frame is what a first cut does, and
  // on the battle screen it cost about five milliseconds a frame. The shapes
  // never change, so each string is tessellated ONCE into a Path2D in design
  // units and afterwards only stamped into place with a matrix — which the
  // browser does natively instead of us walking a few thousand points in JS.
  //
  // The stamp is a matrix on the PATH, never a transform on the context. A
  // caller who set a gradient fillStyle picked its coordinates in the
  // context's space, and scaling the context would drag the gradient off the
  // letters it was aimed at.
  const HAS_P2D = (typeof Path2D !== 'undefined' && typeof DOMMatrix !== 'undefined');
  const PATHS = new Map();
  const PATH_CAP = 600;

  function runPath(text, track) {
    const key = text + '\u0000' + track;
    let p = PATHS.get(key);
    if (p !== undefined) return p;
    p = new Path2D();
    let pen = 0, prev = null;
    const add = (c) => {
      p.moveTo(pen + c[0][0], -c[0][1]);
      for (let i = 1; i < c.length; i++) p.lineTo(pen + c[i][0], -c[i][1]);
      p.closePath();
    };
    for (const ch of text) {
      const g = glyphFor(ch);
      if (!g) continue;
      if (prev) pen += kern(prev, ch);
      if (!g.space) { for (const c of g.s) add(c); for (const c of g.h) add(c); }
      pen += g.adv + track;
      prev = ch;
    }
    // the working set is a few hundred labels; when it stops being that,
    // start over rather than grow without bound
    if (PATHS.size >= PATH_CAP) PATHS.clear();
    PATHS.set(key, p);
    return p;
  }

  function placed(text, track, x, y, sz) {
    const p = new Path2D();
    p.addPath(runPath(text, track), new DOMMatrix([sz, 0, 0, sz, x, y]));
    return p;
  }

  // Ink bounds of a run, in design units — what a raster has to be big
  // enough to hold.
  const BOXES = new Map();
  function inkBox(text, track) {
    const key = text + '\u0000' + track;
    let b = BOXES.get(key);
    if (b) return b;
    b = { x0: 0, y0: 0, x1: 0, y1: 0, empty: true };
    let pen = 0, prev = null;
    for (const ch of text) {
      const g = glyphFor(ch);
      if (!g) continue;
      if (prev) pen += kern(prev, ch);
      if (!g.space) {
        for (const list of [g.s, g.h]) for (const c of list) for (const p of c) {
          const X = pen + p[0], Y = p[1];
          if (b.empty) { b.x0 = b.x1 = X; b.y0 = b.y1 = Y; b.empty = false; }
          else {
            if (X < b.x0) b.x0 = X; if (X > b.x1) b.x1 = X;
            if (Y < b.y0) b.y0 = Y; if (Y > b.y1) b.y1 = Y;
          }
        }
      }
      pen += g.adv + track;
      prev = ch;
    }
    if (BOXES.size >= PATH_CAP) BOXES.clear();
    BOXES.set(key, b);
    return b;
  }

  // ------------------------------------------------------------ run rasters
  // Filling a few hundred polygons a frame costs real milliseconds — about
  // five of them on the battle screen — because a polygon fill is not what a
  // browser optimises text into. So a run that has been drawn once at a
  // given size, style and colour is kept as a bitmap and afterwards blitted,
  // which is the same trick fillText plays with its own glyph atlas.
  //
  // Only flat colours are cached: a caller who set a GRADIENT fillStyle
  // chose its coordinates in the context's space, and a bitmap pinned to the
  // run would slide out from under it.
  const RAST = new Map();
  const RAST_CAP = 320;
  const mkCanvas = (w, h) => {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    if (typeof document === 'undefined' || !document.createElement) return null;
    const c = document.createElement('canvas');
    if (!c || typeof c.getContext !== 'function') return null;
    c.width = w; c.height = h;
    return c;
  };

  function raster(text, track, px, st, styleKey, col, bold, dev) {
    const key = text + '\u0000' + track + '|' + px + '|' + styleKey + '|' + col + '|' + bold + '|' + dev;
    let r = RAST.get(key);
    if (r !== undefined) return r;
    const sz = px / EM, capPx = CAP * sz;
    const b = inkBox(text, track);
    if (b.empty) { r = null; }
    else {
      const pad = Math.ceil((st.outline ? st.ow * capPx * 2 : 0) + (bold ? bold * px / EM : 0) + 3);
      const x0 = Math.floor(b.x0 * sz) - pad, x1 = Math.ceil(b.x1 * sz) + pad;
      const yT = Math.floor(-b.y1 * sz) - pad, yB = Math.ceil(-b.y0 * sz) + pad;
      const w = Math.max(1, Math.round((x1 - x0) * dev)), h = Math.max(1, Math.round((yB - yT) * dev));
      const cv = (w * h > 3e6) ? null : mkCanvas(w, h);
      const g2 = cv && cv.getContext ? cv.getContext('2d') : null;
      if (!g2) r = null;
      else {
        g2.setTransform(dev, 0, 0, dev, -x0 * dev, -yT * dev);
        g2.fillStyle = col;
        drawRun(g2, text, 0, 0, sz, track, bold, st, px);
        r = { cv, ox: x0, oy: yT, w: x1 - x0, h: yB - yT };
      }
    }
    if (RAST.size >= RAST_CAP) RAST.clear();
    RAST.set(key, r);
    return r;
  }

  // The device scale the context is currently drawing at, so a raster is
  // built at the resolution it will actually be shown at rather than blown
  // up from CSS pixels.
  function devScale(ctx) {
    let d = 1;
    try {
      if (typeof ctx.getTransform === 'function') {
        const m = ctx.getTransform();
        d = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
      }
    } catch (e) { d = 1; }
    return Math.min(4, Math.max(0.5, Math.round(d * 8) / 8));
  }

  function path(ctx, text, x, y, sz, track) {
    ctx.beginPath();
    emit(ctx, text, x, y, sz, track);
  }

  function drawRun(ctx, text, x, y, sz, track, bold, st, px) {
    const capPx = CAP * sz;

    // Small text loses everything a bevel would say and keeps only the mud,
    // so below this the face renders flat. It is the one optical size rule
    // the whole thing needs.
    const tiny = capPx < 11;

    // With Path2D the geometry comes from the cache and only gets stamped;
    // without it (the headless suites' stub context) fall back to walking
    // the outline straight onto the context, which behaves identically.
    const P = HAS_P2D ? placed(text, track, x, y, sz) : null;
    const mark = () => { if (!P) path(ctx, text, x, y, sz, track); };
    const fill = () => { P ? ctx.fill(P) : ctx.fill(); };
    const line = () => { P ? ctx.stroke(P) : ctx.stroke(); };
    mark();

    // outline first, fill over it: the inner half of the stroke lands on the
    // seams between overlapping shapes and is then covered by the fill, which
    // is why composing a letter from loose parts leaves no scar
    if (st.outline && !tiny) {
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      // Measured against the CAP, not the em: an outline pinned to the em
      // swallows a 12px label whole while barely showing on a headline. And
      // it eases OFF below twenty pixels of cap — the heavy keyline the
      // metal finishes want at headline size closes their counters up into
      // solid blobs when the same proportion is asked of a chip label.
      const ease = capPx < 20 ? 0.55 + 0.45 * (capPx - 11) / 9 : 1;
      ctx.lineWidth = Math.max(1.1, st.ow * capPx * 2 * ease);
      ctx.strokeStyle = st.outline;
      line();
      ctx.restore();
    }

    // weight: the game says 900 to mean louder, and this face has one cut,
    // so louder becomes a hair of dilation
    if (bold && !st.grad) {
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.lineWidth = bold * px / EM * 2;
      ctx.strokeStyle = ctx.fillStyle;
      line();
      ctx.restore();
    }

    if (!st.grad) { fill(); return; }

    const g = ctx.createLinearGradient(0, y - capPx, 0, y + capPx * 0.06);
    for (const s of st.grad) g.addColorStop(s[0], s[1]);

    if (!st.bevel || capPx < 15) { ctx.save(); ctx.fillStyle = g; fill(); ctx.restore(); return; }

    // The bevel is TWO FILLS, never a stroke. Flood the letter with the lit
    // colour, then lay the body back over it shifted down by the bevel
    // depth: what survives is a bright edge along every upward-facing face,
    // which is what a torch does to carved metal. Stroking an offset copy
    // instead — the obvious way — traces the seams BETWEEN the overlapping
    // shapes a glyph is built from, and stripes every letter.
    const d = Math.max(1, capPx * 0.062) * st.bevel;
    const wRun = runWidth(text, track) * sz;
    ctx.save();
    if (P) ctx.clip(P); else ctx.clip();
    ctx.fillStyle = st.hi || 'rgba(255,251,240,0.92)';
    ctx.fillRect(x - capPx, y - capPx * 1.5, wRun + capPx * 2, capPx * 2.2);
    ctx.fillStyle = g;
    if (P) ctx.fill(placed(text, track, x, y + d, sz));
    else { path(ctx, text, x, y + d, sz, track); ctx.fill(); }
    ctx.restore();
  }

  // ------------------------------------------------------- the drop-in shim
  // Installing rewrites fillText/strokeText/measureText on ONE context. The
  // game keeps calling exactly what it called before; only the family in its
  // font string decides who draws.
  const FONT_RE = /(\d*\.?\d+)px\s+(.+)$/;

  function parseFont(f) {
    if (!f) return null;
    const m = FONT_RE.exec(f);
    if (!m) return null;
    const fams = m[2].split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
    const style = FAMILY[fams[0].toLowerCase()];
    if (!style) return null;
    const rest = fams.slice(1);
    const prefix = f.slice(0, m.index);
    return {
      px: parseFloat(m[1]),
      style,
      // whatever the caller listed after us is what the emoji get
      fallback: prefix + m[1] + 'px ' + (rest.length ? rest.join(', ') : 'sans-serif'),
      weight: /\b([1-9]00)\b/.test(prefix) ? parseInt(RegExp.$1, 10) : 400,
    };
  }

  Grimcut.parseFont = parseFont;

  Grimcut.install = function (ctx) {
    if (!ctx || ctx.__grimcut) return ctx;
    ctx.__grimcut = true;
    const oFill = ctx.fillText.bind(ctx);
    const oStroke = ctx.strokeText.bind(ctx);
    const oMeasure = ctx.measureText.bind(ctx);

    const opts = (f) => ({
      style: f.style,
      align: ctx.textAlign,
      baseline: ctx.textBaseline,
      fallback: f.fallback,
      // the game leans on 800/900 to mean "louder"; the face has one weight,
      // so loudness becomes a hair of dilation instead of a second cut
      bold: f.weight >= 800 ? 9 : 0,
      track: f.style === 'plain' || f.style === 'ink' ? 0 : 4,
    });

    ctx.fillText = function (s, x, y, maxW) {
      const f = parseFont(this.font);
      if (!f) return oFill(s, x, y, maxW);
      let px = f.px;
      if (maxW) {
        const w = Grimcut.measure(this, s, px, opts(f));
        if (w > maxW && w > 0) px = px * maxW / w;
      }
      Grimcut.draw(this, s, x, y, px, opts(f));
    };

    ctx.strokeText = function (s, x, y, maxW) {
      const f = parseFont(this.font);
      if (!f) return oStroke(s, x, y, maxW);
      const o = opts(f);
      o.style = 'plain';
      const sz = f.px / EM;
      const parts = runs(s);
      let total = Grimcut.measure(this, s, f.px, o);
      let pen = x;
      if (o.align === 'center') pen = x - total / 2;
      else if (o.align === 'right' || o.align === 'end') pen = x - total;
      const base = y + baselineShift(o.baseline || 'alphabetic', sz);
      for (const r of parts) {
        if (r.mine) {
          this.save();
          this.lineJoin = 'round'; this.lineCap = 'round';
          if (HAS_P2D) this.stroke(placed(r.text, o.track, pen, base, sz));
          else { path(this, r.text, pen, base, sz, o.track); this.stroke(); }
          this.restore();
          pen += runWidth(r.text, o.track) * sz;
        } else {
          const sf = this.font; this.font = f.fallback;
          const sa = this.textAlign, sb = this.textBaseline;
          this.textAlign = 'left'; this.textBaseline = 'alphabetic';
          oStroke(r.text, pen, base);
          pen += this.measureText(r.text).width;
          this.font = sf; this.textAlign = sa; this.textBaseline = sb;
        }
      }
    };

    ctx.measureText = function (s) {
      const f = parseFont(this.font);
      if (!f) return oMeasure(s);
      const o = opts(f);
      const w = Grimcut.measure(this, s, f.px, o);
      const sz = f.px / EM;
      return {
        width: w,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: w,
        actualBoundingBoxAscent: CAP * sz,
        actualBoundingBoxDescent: DESC * 0.34 * sz,
        fontBoundingBoxAscent: CAP * sz,
        fontBoundingBoxDescent: DESC * 0.34 * sz,
        emHeightAscent: CAP * sz,
        emHeightDescent: DESC * 0.34 * sz,
      };
    };

    ctx.__grimcutRestore = function () {
      ctx.fillText = oFill; ctx.strokeText = oStroke; ctx.measureText = oMeasure;
      ctx.__grimcut = false;
    };
    return ctx;
  };

  // a window into the caches, so a perf question can be answered with a
  // number instead of a guess
  Grimcut.debug = () => ({ rast: RAST.size, paths: PATHS.size, boxes: BOXES.size });
  root.Grimcut = Grimcut;
  if (typeof module !== 'undefined' && module.exports) module.exports = Grimcut;

})(typeof globalThis !== 'undefined' ? globalThis : this);
