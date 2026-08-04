/* ============================================================================
   alphabet.mjs — one parametric skeleton, two typefaces.

   Every letter below is drawn ONCE, from a metric bundle. Feed it Beastcut's
   numbers (cap 720, stem 150, superellipse 0.64, corners chamfered) and you get
   a condensed display face cut out of plate; feed it Beakwork's (cap 700, stem
   86, superellipse 0.80, wider sidebearings) and the same skeleton comes out as
   a text face that holds at 11px. That is the whole reason the two
   fonts look related without looking the same — they are literally the same
   bones under different flesh.

   Capitals, figures and punctuation are shared. Lowercase is only ever built
   for Beakwork; Beastcut maps a→z to TRUE SMALL CAPS, redrawn from a second,
   fatter metric bundle rather than scaled down, because a scaled cap goes pale
   next to a full one and a headline loses its colour.

   Coordinates are y-up with the baseline at 0, and each glyph is authored from
   x = 0; `put()` adds the sidebearing.
   ========================================================================== */
import {
  rect, band, ring, stem, diagCutH, diagCutV, shift, cutX, cutY, sePt, seg,
} from './pen.mjs';

export function buildFace(M) {
  const H = M.cap;                       // cap height
  const s = M.st;                        // stem
  const t = M.th;                        // horizontal / thin
  const E = M.e;                         // superellipse exponent
  const N = M.N || 14;                   // arc segments per quarter
  const CH = M.ch || 0;                  // corner chamfer
  const ov = M.ov;                       // round overshoot
  const g = {};

  const w = (n) => n * M.wf;
  const put = (ch, ink, pos, cut) => {
    const dx = M.side;
    g[ch] = {
      pos: (pos || []).filter(Boolean).map((p) => shift(p, dx, 0)),
      cut: (cut || []).filter(Boolean).map((p) => shift(p, dx, 0)),
      adv: Math.round(ink + M.side * 2),
    };
  };

  /* A vertical stem with the face's chamfer applied. */
  const vs = (x0, x1, y0, y1, which) => stem(x0, x1, y0, y1, CH, which);
  /* A horizontal bar. Beastcut clips the outer corner so arms read as cut. */
  const hb = (x0, x1, y0, y1, which) => stem(x0, x1, y0, y1, CH * 0.72, which || '');
  /* The right half of a bowl, hung off a stem at x = xj. */
  const bowlR = (xj, cy, rox, roy, tt) =>
    band(xj, cy, rox, roy, rox - (tt || s), roy - t, -90, 90, N * 2, E);

  /* ---------------------------------------------------------------- S/s ---
     Two bowls that overlap through the middle. Extending each arc past its
     own extreme is what welds them into one spine — no join geometry, no
     boolean, and the crossing lands diagonal because the superellipse is
     already flattening there. */
  function sForm(x0, y0, x1, y1, tt) {
    const W = x1 - x0, Hh = y1 - y0, cx = (x0 + x1) / 2;
    const hT = Hh * M.sT, hB = Hh * M.sB;
    const royT = hT / 2, royB = hB / 2;
    const cyT = y1 - royT, cyB = y0 + royB;
    const rox = W / 2;
    const th = tt * 0.88;
    return [
      band(cx, cyT, rox, royT, rox - tt, royT - th, M.sA0, 272, N * 3, E),
      band(cx, cyB, rox, royB, rox - tt, royB - th, 92, -M.sA0 - 180, N * 3, E),
    ];
  }

  /* ============================================================== CAPITALS */
  {
    // A — a solid wedge with a triangular counter, crossbar laid back over it.
    const aw = w(560), acx = aw / 2, tip = s * 0.46;
    const legIn = s * (Math.hypot(acx, H) / H);
    put('A', aw, [
      [[0, 0], [acx - tip, H], [acx + tip, H], [aw, 0]],
      rect(aw * 0.17, H * 0.175, aw * 0.83, H * 0.175 + t * 0.92),
    ], [
      [[legIn * 1.0, 0], [acx, H - t * 1.62], [aw - legIn * 1.0, 0]],
    ]);

    // B
    const bw = w(525), bxj = s * 0.92;
    const bhT = H * 0.505, bhB = H - bhT;
    put('B', bw, [
      vs(0, s, 0, H, 'tl bl'),
      bowlR(bxj, H - bhT / 2, bw - bxj, bhT / 2, s * 0.94),
      bowlR(bxj, bhB / 2, bw - bxj + w(14), bhB / 2, s),
      hb(0, bxj + w(40), H - t, H, ''),
      hb(0, bxj + w(40), 0, t, ''),
      hb(0, bxj + w(30), H - bhT - t * 0.47, H - bhT + t * 0.47, ''),
    ]);

    // C — the terminals are the band's own radial ends, which read as cut.
    const cw = w(545), ccx = cw / 2, crx = cw / 2, cry = H / 2 + ov;
    put('C', cw, [
      band(ccx, H / 2, crx, cry, crx - s, cry - t, M.cA, 360 - M.cA, N * 4, E),
    ]);

    // D
    const dw = w(555), dxj = s * 0.92;
    put('D', dw, [
      vs(0, s, 0, H, 'tl bl'),
      bowlR(dxj, H / 2, dw - dxj, H / 2, s),
      hb(0, dxj + w(40), H - t, H, ''),
      hb(0, dxj + w(40), 0, t, ''),
    ]);

    // E F
    const ew = w(470);
    const arms = (ww) => [
      vs(0, s, 0, H, 'tl bl'),
      hb(0, ww, H - t, H, 'tr'),
      hb(0, ww * 0.86, H * 0.53 - t * 0.47, H * 0.53 + t * 0.47, ''),
    ];
    put('E', ew, [...arms(ew), hb(0, ew, 0, t, 'br')]);
    put('F', w(455), arms(w(455)));

    // G
    const gw = w(565), gcx = gw / 2, gbar = H * 0.40;
    put('G', gw, [
      band(gcx, H / 2, gw / 2, H / 2 + ov, gw / 2 - s, H / 2 + ov - t, M.cA, 352 - M.cA, N * 4, E),
      rect(gw - s, 0, gw, gbar),
      rect(gw * 0.50, gbar - t, gw, gbar),
    ]);

    // H I J
    const hw = w(555);
    put('H', hw, [
      vs(0, s, 0, H, 'tl bl'), vs(hw - s, hw, 0, H, 'tr br'),
      rect(0, H * 0.53 - t * 0.47, hw, H * 0.53 + t * 0.47),
    ]);
    put('I', s, [vs(0, s, 0, H, 'tl br')]);
    const jw = w(430), jry = H * 0.31;
    put('J', jw, [
      rect(jw - s, jry, jw, H),
      band(jw / 2, jry, jw / 2, jry, jw / 2 - s, jry - t, 180, 360, N * 2, E),
    ]);

    // K
    const kw = w(545), kj = H * 0.505;
    put('K', kw, [
      vs(0, s, 0, H, 'tl bl'),
      cutY(diagCutV(s * 0.7, kj - t * 0.2, kw, H, s * 0.94), H, true),
      cutY(diagCutV(s * 0.7, kj + t * 0.2, kw, 0, s * 0.94), 0, false),
    ]);

    // L
    const lw = w(455);
    put('L', lw, [vs(0, s, 0, H, 'tl bl'), hb(0, lw, 0, t, 'br')]);

    // M — the inner V drops nearly to the baseline; the legs are trimmed to
    // the sidebearings so the apexes sit exactly on the edge of the em.
    const mw = w(710), mcx = mw / 2, mv = H * 0.075;
    put('M', mw, [
      vs(0, s, 0, H, 'bl'), vs(mw - s, mw, 0, H, 'br'),
      cutX(diagCutH(s * 0.5, H, mcx, mv, s * 0.92), 0, false),
      cutX(diagCutH(mcx, mv, mw - s * 0.5, H, s * 0.92), mw, true),
    ]);

    // N
    const nw = w(560);
    put('N', nw, [
      vs(0, s, 0, H, 'tl'), vs(nw - s, nw, 0, H, 'br'),
      cutX(cutX(diagCutH(s * 0.5, H, nw - s * 0.5, 0, s * 0.96), 0, false), nw, true),
    ]);

    // O Q
    const owd = w(585), orx = owd / 2, ory = H / 2 + ov;
    const oRing = ring(orx, H / 2, orx, ory, orx - s, ory - t, N, E);
    put('O', owd, [oRing.pos], [oRing.cut]);
    put('Q', owd, [oRing.pos, diagCutH(owd * 0.60, H * 0.34, owd * 1.00, -H * 0.045, s * 0.92)], [oRing.cut]);

    // P R
    const pw = w(505), pxj = s * 0.92, phT = H * 0.555;
    const pTop = [
      vs(0, s, 0, H, 'tl bl'),
      bowlR(pxj, H - phT / 2, pw - pxj, phT / 2, s),
      hb(0, pxj + w(40), H - t, H, ''),
      hb(0, pxj + w(30), H - phT - t * 0.5, H - phT + t * 0.5, ''),
    ];
    put('P', pw, pTop);
    const rw = w(535), rhT = H * 0.545;
    put('R', rw, [
      vs(0, s, 0, H, 'tl bl'),
      bowlR(s * 0.92, H - rhT / 2, rw * 0.88 - s * 0.92, rhT / 2, s),
      hb(0, s * 0.92 + w(40), H - t, H, ''),
      hb(0, s * 0.92 + w(30), H - rhT - t * 0.5, H - rhT + t * 0.5, ''),
      diagCutH(rw * 0.46, H - rhT + t * 0.3, rw - s * 0.42, 0, s * 0.94),
    ]);

    // S
    const sw = w(510);
    put('S', sw, sForm(0, 0, sw, H, s));

    // T
    const tw = w(510);
    put('T', tw, [hb(0, tw, H - t, H, 'tl tr'), vs(tw / 2 - s / 2, tw / 2 + s / 2, 0, H, 'br')]);

    // U
    const uw = w(555), ury = H * 0.34;
    put('U', uw, [
      rect(0, ury, s, H), rect(uw - s, ury, uw, H),
      band(uw / 2, ury, uw / 2, ury + ov, uw / 2 - s, ury + ov - t, 180, 360, N * 2, E),
    ]);

    // V W — single outlines, so the apexes stay genuinely sharp.
    const vw = w(560), vcx = vw / 2, vtip = s * 0.46;
    const vlw = s * (Math.hypot(vcx, H) / H);
    put('V', vw, [[
      [0, H], [vcx - vtip, 0], [vcx + vtip, 0], [vw, H],
      [vw - vlw, H], [vcx, t * 1.5], [vlw, H],
    ]]);
    const ww = w(815), a1 = ww * 0.25, a2 = ww * 0.75, wtip = s * 0.40;
    const wlw = s * (Math.hypot(a1, H) / H);
    put('W', ww, [[
      [0, H], [a1 - wtip, 0], [a1 + wtip, 0], [ww / 2 - wtip * 0.7, H], [ww / 2 + wtip * 0.7, H],
      [a2 - wtip, 0], [a2 + wtip, 0], [ww, H],
      [ww - wlw, H], [a2, t * 1.55], [ww / 2, H - t * 2.9], [a1, t * 1.55], [wlw, H],
    ]]);

    // X Y Z
    const xw = w(555);
    const clipBox = (p) => cutX(cutX(p, 0, false), xw, true);
    put('X', xw, [
      clipBox(diagCutH(s * 0.5, H, xw - s * 0.5, 0, s * 0.94)),
      clipBox(diagCutH(xw - s * 0.5, H, s * 0.5, 0, s * 0.94)),
    ]);
    const yw = w(545), yj = H * 0.43;
    put('Y', yw, [
      cutX(diagCutH(s * 0.5, H, yw / 2, yj, s * 0.94), 0, false),
      cutX(diagCutH(yw - s * 0.5, H, yw / 2, yj, s * 0.94), yw, true),
      vs(yw / 2 - s / 2, yw / 2 + s / 2, 0, yj + t, 'br'),
    ]);
    const zw = w(500);
    put('Z', zw, [
      hb(0, zw, H - t, H, 'tl'),
      hb(0, zw, 0, t, 'br'),
      cutY(cutY(diagCutV(zw - s * 0.35, H - t * 0.4, s * 0.35, t * 0.4, s * 0.94), H, true), 0, false),
    ]);
  }

  /* ================================================================ FIGURES
     Tabular by construction: every figure carries the same advance, so a
     column of numbers in a stat block never shifts under itself. */
  {
    const fw = w(520);                       // the figure box
    const fig = (ch, pos, cut) => {
      g[ch] = {
        pos: (pos || []).filter(Boolean).map((p) => shift(p, M.side, 0)),
        cut: (cut || []).filter(Boolean).map((p) => shift(p, M.side, 0)),
        adv: Math.round(fw + M.side * 2),
      };
    };
    const cx = fw / 2;

    const zr = ring(cx, H / 2, cx, H / 2 + ov, cx - s, H / 2 + ov - t, N, E);
    fig('0', [zr.pos], [zr.cut]);

    fig('1', [
      vs(cx - s / 2, cx + s / 2, 0, H, ''),
      [[cx - s / 2, H], [cx - s / 2, H - t * 1.15], [fw * 0.10, H * 0.755], [fw * 0.10, H * 0.90]],
      rect(fw * 0.10, 0, fw - fw * 0.10, t),
    ]);

    // 2 — top bowl, then a straight diagonal onto the base bar.
    const twoH = H * 0.62;
    fig('2', [
      band(cx, H - twoH / 2, cx, twoH / 2, cx - s, twoH / 2 - t, 200, -22, N * 3, E),
      cutY(diagCutV(fw - s * 0.55, H * 0.46, s * 0.30, t * 1.05, s * 0.96), 0, false),
      rect(0, 0, fw, t),
    ]);

    // 3
    const t3 = H * 0.535, b3 = H * 0.565;
    fig('3', [
      band(cx * 0.86, H - t3 / 2, fw - cx * 0.86, t3 / 2, fw - cx * 0.86 - s, t3 / 2 - t, -95, 168, N * 3, E),
      band(cx * 0.86, b3 / 2, fw - cx * 0.86, b3 / 2, fw - cx * 0.86 - s, b3 / 2 - t, 95, -168, N * 3, E),
      rect(cx * 0.55, H * 0.5 - t * 0.5, fw - s, H * 0.5 + t * 0.5),
    ]);

    fig('4', [
      diagCutV(fw * 0.74, H, fw * 0.045, H * 0.245, s * 0.92),
      rect(0, H * 0.245 - t, fw, H * 0.245),
      vs(fw * 0.62, fw * 0.62 + s, 0, H, ''),
    ]);

    // 5
    const b5 = H * 0.60, b5y = H - b5 * 0.72;
    fig('5', [
      rect(0, H - t, fw * 0.94, H),
      rect(0, b5y - t * 0.4, s, H),
      band(cx, b5 / 2, cx, b5 / 2, cx - s, b5 / 2 - t, 118, -190, N * 3, E),
      rect(0, b5y - t * 0.4, fw * 0.46, b5y + t * 0.75),
    ]);

    // 6 and 9 — one shape, turned through 180°. The upper sweep shares the
    // bowl's centre, so its left end lands exactly on the bowl's left extreme
    // and the two weld with no join to draw.
    const lowR = H * 0.60, bCy = lowR / 2;
    const r6 = ring(cx, bCy, cx, bCy + ov, cx - s, bCy + ov - t, N, E);
    const up6 = band(cx, bCy, cx, H - bCy, cx - s, H - bCy - t, 102, 180, N * 3, E);
    const turn = (p) => p.map(([x, y]) => [fw - x, H - y]);
    fig('6', [r6.pos, up6], [r6.cut]);
    fig('9', [turn(r6.pos), turn(up6)], [turn(r6.cut)]);

    fig('7', [
      rect(0, H - t, fw, H),
      diagCutH(fw * 0.86, H - t * 0.2, fw * 0.30, 0, s * 0.98),
    ]);

    const e8T = H * 0.525, e8B = H * 0.545;
    const r8t = ring(cx, H - e8T / 2, cx * 0.90, e8T / 2, cx * 0.90 - s, e8T / 2 - t * 0.94, N, E);
    const r8b = ring(cx, e8B / 2, cx, e8B / 2 + ov, cx - s, e8B / 2 + ov - t, N, E);
    fig('8', [r8t.pos, r8b.pos], [r8t.cut, r8b.cut]);
  }

  /* ============================================================ PUNCTUATION */
  {
    const dotW = Math.max(s * 0.92, t);
    const dot = (x, y) => rect(x, y, x + dotW, y + dotW);
    const p = (ch, ink, pos, cut) => put(ch, ink, pos, cut);

    put(' ', w(220), []);

    p('.', w(150), [dot(w(150) / 2 - dotW / 2, 0)]);
    p(',', w(155), [[
      [w(155) / 2 - dotW / 2, dotW], [w(155) / 2 + dotW / 2, dotW],
      [w(155) / 2 + dotW / 2, -dotW * 0.10], [w(155) / 2 - dotW * 0.35, -dotW * 0.85],
      [w(155) / 2 - dotW / 2, 0],
    ]]);
    p(':', w(155), [dot(w(155) / 2 - dotW / 2, 0), dot(w(155) / 2 - dotW / 2, H * 0.44)]);
    p(';', w(160), [
      dot(w(160) / 2 - dotW / 2, H * 0.44),
      [[w(160) / 2 - dotW / 2, dotW], [w(160) / 2 + dotW / 2, dotW],
       [w(160) / 2 + dotW / 2, -dotW * 0.10], [w(160) / 2 - dotW * 0.35, -dotW * 0.85],
       [w(160) / 2 - dotW / 2, 0]],
    ]);
    p('!', w(180), [
      [[w(180) / 2 - s * 0.50, H], [w(180) / 2 + s * 0.50, H],
       [w(180) / 2 + s * 0.30, dotW * 1.5], [w(180) / 2 - s * 0.30, dotW * 1.5]],
      dot(w(180) / 2 - dotW / 2, 0),
    ]);

    // ? — the tail starts exactly where the bowl's stroke ended, so the join
    // is a continuation rather than a bar laid across the counter.
    const qw = w(440), qr = qw / 2, qry = H * 0.235, qcy = H - qry;
    const qEnd = sePt(qw / 2, qcy, qr - s / 2, qry - t / 2, -34, E);
    p('?', qw, [
      band(qw / 2, qcy, qr, qry, qr - s, qry - t, 196, -34, N * 3, E),
      diagCutH(qEnd[0], qEnd[1], qw / 2, H * 0.285, s * 0.96),
      dot(qw / 2 - dotW / 2, 0),
    ]);

    const apW = w(185);
    const tick = (x) => [[x, H], [x + s * 0.86, H], [x + s * 0.70, H - t * 1.55], [x + s * 0.10, H - t * 1.55]];
    p("'", apW, [tick(apW / 2 - s * 0.43)]);
    p('"', w(320), [tick(w(320) * 0.5 - s * 1.05), tick(w(320) * 0.5 + s * 0.20)]);
    p('’', apW, [tick(apW / 2 - s * 0.43)]);

    // brackets. `dir` is which way the mouth opens: +1 for an opener, whose
    // arc therefore has to be the LEFT flank of an ellipse centred off the
    // right edge of its own em.
    const brH = [-H * 0.115, H * 0.775];
    const brCy = (brH[0] + brH[1]) / 2, brRy = (brH[1] - brH[0]) / 2;
    const paren = (ww, dir) => {
      const rx = ww * 0.86, cx0 = dir > 0 ? ww * 0.95 : ww * 0.05;
      const a0 = dir > 0 ? 112 : -68, a1 = dir > 0 ? 248 : 68;
      return [band(cx0, brCy, rx, brRy, rx - s * 0.86, brRy - t * 0.86, a0, a1, N * 3, Math.min(0.94, E + 0.18))];
    };
    p('(', w(250), paren(w(250), 1));
    p(')', w(250), paren(w(250), -1));
    const sq = (ww, dir) => {
      const x0 = dir > 0 ? ww * 0.18 : ww * 0.82 - s * 0.86;
      const x1 = x0 + s * 0.86;
      const armL = dir > 0 ? x0 : ww * 0.14, armR = dir > 0 ? ww * 0.86 : x1;
      return [rect(x0, brH[0], x1, brH[1]),
              rect(armL, brH[1] - t * 0.92, armR, brH[1]),
              rect(armL, brH[0], armR, brH[0] + t * 0.92)];
    };
    p('[', w(250), sq(w(250), 1));
    p(']', w(250), sq(w(250), -1));
    // braces: the bracket's arcs, pinched to a spur at the middle
    const brace = (ww, dir) => {
      const rx = ww * 0.70, ry = brRy / 2, cx0 = dir > 0 ? ww * 0.92 : ww * 0.08;
      const sp = dir > 0 ? ww * 0.02 : ww * 0.98;
      return [
        band(cx0, brCy + ry, rx, ry, rx - s * 0.86, ry - t * 0.86, dir > 0 ? 118 : -62, dir > 0 ? 242 : 62, N * 2, 0.9),
        band(cx0, brCy - ry, rx, ry, rx - s * 0.86, ry - t * 0.86, dir > 0 ? 118 : -62, dir > 0 ? 242 : 62, N * 2, 0.9),
        [[sp, brCy], [cx0 - (rx - s) * dir, brCy + t * 0.55], [cx0 - (rx - s) * dir, brCy - t * 0.55]],
      ];
    };
    p('{', w(275), brace(w(275), 1));
    p('}', w(275), brace(w(275), -1));

    // slashes and dashes
    p('/', w(340), [diagCutH(w(340) * 0.06, -H * 0.09, w(340) * 0.94, H * 0.94, s * 0.90)]);
    p('\\', w(340), [diagCutH(w(340) * 0.94, -H * 0.09, w(340) * 0.06, H * 0.94, s * 0.90)]);
    p('|', w(200), [rect(w(200) / 2 - s * 0.36, -H * 0.12, w(200) / 2 + s * 0.36, H * 0.98)]);

    const dash = (ww, len) => [rect((ww - len) / 2, H * 0.38 - t * 0.46, (ww + len) / 2, H * 0.38 + t * 0.46)];
    p('-', w(300), dash(w(300), w(190)));
    p('–', w(500), dash(w(500), w(420)));
    p('—', w(760), dash(w(760), w(700)));
    p('−', w(520), dash(w(520), w(330)));
    p('_', w(520), [rect(0, -H * 0.15, w(520), -H * 0.15 + t * 0.9)]);

    // maths
    const opY = H * 0.40, opL = w(340);
    p('+', w(520), [
      rect((w(520) - opL) / 2, opY - t * 0.46, (w(520) + opL) / 2, opY + t * 0.46),
      rect(w(520) / 2 - t * 0.46, opY - opL / 2, w(520) / 2 + t * 0.46, opY + opL / 2),
    ]);
    p('=', w(520), [
      rect((w(520) - opL) / 2, opY - t * 1.30, (w(520) + opL) / 2, opY - t * 0.38),
      rect((w(520) - opL) / 2, opY + t * 0.38, (w(520) + opL) / 2, opY + t * 1.30),
    ]);
    p('<', w(480), [
      diagCutV(w(480) * 0.88, H * 0.66, w(480) * 0.12, opY, t * 0.94),
      diagCutV(w(480) * 0.88, H * 0.14, w(480) * 0.12, opY, t * 0.94),
    ]);
    p('>', w(480), [
      diagCutV(w(480) * 0.12, H * 0.66, w(480) * 0.88, opY, t * 0.94),
      diagCutV(w(480) * 0.12, H * 0.14, w(480) * 0.88, opY, t * 0.94),
    ]);
    p('×', w(460), [
      diagCutH(w(460) * 0.16, H * 0.66, w(460) * 0.84, H * 0.14, t * 0.94),
      diagCutH(w(460) * 0.84, H * 0.66, w(460) * 0.16, H * 0.14, t * 0.94),
    ]);
    const tw3 = w(540), tlx = [0.06, 0.28, 0.50, 0.72, 0.94], tly = [0.42, 0.68, 0.52, 0.36, 0.62];
    p('~', tw3, [[
      ...tlx.map((x, i) => [tw3 * x, H * tly[i]]),
      ...tlx.slice().reverse().map((x, i) => [tw3 * x, H * tly[tlx.length - 1 - i] + t * 0.92]),
    ]]);
    p('^', w(440), [
      diagCutH(w(440) * 0.10, H * 0.52, w(440) * 0.50, H * 0.90, t * 0.9),
      diagCutH(w(440) * 0.90, H * 0.52, w(440) * 0.50, H * 0.90, t * 0.9),
    ]);
    p('`', w(240), [diagCutH(w(240) * 0.18, H * 0.98, w(240) * 0.82, H * 0.72, t * 0.86)]);

    // the odds and ends a UI actually uses
    const hw2 = w(560);
    p('#', hw2, [
      diagCutH(hw2 * 0.30, 0, hw2 * 0.40, H * 0.78, t * 0.80),
      diagCutH(hw2 * 0.62, 0, hw2 * 0.72, H * 0.78, t * 0.80),
      rect(hw2 * 0.06, H * 0.24, hw2 * 0.94, H * 0.24 + t * 0.80),
      rect(hw2 * 0.06, H * 0.52, hw2 * 0.94, H * 0.52 + t * 0.80),
    ]);
    const pcw = w(640), pr = H * 0.165;
    const pcRing = (cx2, cy2) => ring(cx2, cy2, pr, pr, pr - t * 0.86, pr - t * 0.86, N, E);
    const pcA = pcRing(pr + t * 0.2, H - pr), pcB = pcRing(pcw - pr - t * 0.2, pr);
    p('%', pcw, [pcA.pos, pcB.pos, diagCutH(pcw * 0.82, H, pcw * 0.18, 0, t * 0.92)], [pcA.cut, pcB.cut]);

    const dw2 = w(520);
    p('$', dw2, [...sForm(0, H * 0.06, dw2, H * 0.94, s * 0.94),
      rect(dw2 / 2 - t * 0.42, -H * 0.05, dw2 / 2 + t * 0.42, H * 1.05)]);

    // & — one continuous stroke: a small top loop, a diagonal down its left
    // into a big bottom bowl, and a leg kicked out to the right. Both joins are
    // drawn from where the arcs actually END, so nothing has to be eyeballed.
    const amw = w(640), amS = s * 0.90, amT = t * 0.90;
    const aTc = [amw * 0.44, H * 0.775], aTr = [amw * 0.30, H * 0.225];
    const aBc = [amw * 0.42, H * 0.285], aBr = [amw * 0.42, H * 0.285];
    const aTop = band(aTc[0], aTc[1], aTr[0], aTr[1], aTr[0] - amS, aTr[1] - amT, -34, 250, N * 3, E);
    const aBot = band(aBc[0], aBc[1], aBr[0], aBr[1], aBr[0] - amS, aBr[1] - amT, 128, 356, N * 3, E);
    const aJoin = seg(sePt(aTc[0], aTc[1], aTr[0] - amS / 2, aTr[1] - amT / 2, 250, E),
                      sePt(aBc[0], aBc[1], aBr[0] - amS / 2, aBr[1] - amT / 2, 128, E), amS);
    const aLeg = seg(sePt(aBc[0], aBc[1], aBr[0] - amS / 2, aBr[1] - amT / 2, 356, E),
                     [amw * 0.99, H * 0.44], amS);
    p('&', amw, [aTop, aBot, aJoin, aLeg]);

    // @ — an outer ring left open at the lower right, wrapped round a small
    // bowl with a stem: an 'a' in a circle, which is what the mark is.
    const atw = w(800), atR = atw * 0.47, atRy = H * 0.50, atCy = H * 0.44, atT = t * 0.80;
    const atIn = atR * 0.40, atInY = atRy * 0.36;
    const aIr = ring(atw * 0.52, atCy, atIn, atInY, atIn - atT, atInY - atT, N, E);
    p('@', atw, [
      band(atw / 2, atCy, atR, atRy, atR - atT, atRy - atT, -52, 262, N * 4, E),
      aIr.pos,
      rect(atw * 0.52 + atIn - atT, atCy - atInY, atw * 0.52 + atIn, atCy + atRy * 0.20),
    ], [aIr.cut]);

    const stw = w(440);
    p('*', stw, [
      rect(stw / 2 - t * 0.42, H * 0.50, stw / 2 + t * 0.42, H * 1.00),
      diagCutH(stw * 0.10, H * 0.62, stw * 0.90, H * 0.88, t * 0.80),
      diagCutH(stw * 0.90, H * 0.62, stw * 0.10, H * 0.88, t * 0.80),
    ]);

    const degw = w(320), degr = H * 0.135;
    const dg = ring(degw / 2, H - degr, degr, degr, degr - t * 0.82, degr - t * 0.82, N, E);
    p('°', degw, [dg.pos], [dg.cut]);

    p('…', w(680), [dot(w(680) * 0.11, 0), dot(w(680) * 0.5 - dotW / 2, 0), dot(w(680) * 0.89 - dotW, 0)]);

    // → ▲ ▼ : the game draws its own arrows and deltas in text
    const arw = w(700), ay = H * 0.40, ah = t * 0.86;
    p('→', arw, [
      rect(arw * 0.04, ay - ah / 2, arw * 0.80, ay + ah / 2),
      [[arw * 0.60, ay + H * 0.20], [arw * 0.96, ay], [arw * 0.60, ay - H * 0.20]],
    ]);
    const trw = w(520);
    p('▲', trw, [[[trw * 0.06, H * 0.06], [trw * 0.5, H * 0.72], [trw * 0.94, H * 0.06]]]);
    p('▼', trw, [[[trw * 0.06, H * 0.72], [trw * 0.5, H * 0.06], [trw * 0.94, H * 0.72]]]);
  }

  /* =============================================================== LOWERCASE
     Only Beakwork asks for these. Beastcut hands a→z to a second pass over the
     capitals with small-cap metrics instead. */
  if (M.xh) {
    const X = M.xh, A = M.asc, D = M.desc, ovx = M.ov;

    // o — the shape every other round lowercase is measured against
    const ow = w(500), orx = ow / 2, ory = X / 2 + ovx;
    const oR = ring(orx, X / 2, orx, ory, orx - s, ory - t, N, E);
    put('o', ow, [oR.pos], [oR.cut]);

    // c e — cut terminals, wide aperture
    const cwl = w(470);
    put('c', cwl, [band(cwl / 2, X / 2, cwl / 2, X / 2 + ovx, cwl / 2 - s, X / 2 + ovx - t, M.cAl, 360 - M.cAl, N * 4, E)]);
    // e — the bar IS the start of the stroke: the bowl runs from the bar's
    // right end all the way round and stops short of it again, so the aperture
    // is the gap between the two rather than a slot cut in a closed ring.
    const ewl = w(495), ebar = X * 0.545;
    put('e', ewl, [
      band(ewl / 2, X / 2, ewl / 2, X / 2 + ovx, ewl / 2 - s, X / 2 + ovx - t, 6, 306, N * 4, E),
      rect(0, ebar - t * 0.5, ewl, ebar + t * 0.5),
    ]);

    // n m h r — the shoulder family. `arch` reports the height its own ends
    // sit at, so the stem it hangs off stops exactly there instead of poking a
    // corner out past the curve.
    const arch = (x0, x1, top) => {
      const cx2 = (x0 + x1) / 2, rx = (x1 - x0) / 2, ry = Math.min(rx * 1.15, top * 0.50);
      return { p: band(cx2, top - ry, rx, ry, rx - s, ry - t, 0, 180, N * 2, E), y: top - ry };
    };
    const nw2 = w(520);
    const nA = arch(0, nw2, X);
    put('n', nw2, [rect(0, 0, s, X), nA.p, rect(nw2 - s, 0, nw2, nA.y)]);
    const mw2 = w(800), half = mw2 * 0.5 + s * 0.5;
    const mA = arch(0, half, X), mB = arch(half - s, mw2, X);
    put('m', mw2, [
      rect(0, 0, s, X),
      mA.p, rect(half - s, 0, half, mA.y),
      mB.p, rect(mw2 - s, 0, mw2, mB.y),
    ]);
    put('h', nw2, [rect(0, 0, s, A), nA.p, rect(nw2 - s, 0, nw2, nA.y)]);
    const uw2 = w(520), ury2 = X * 0.34;
    put('u', uw2, [
      rect(0, ury2, s, X), rect(uw2 - s, 0, uw2, X),
      band(uw2 / 2, ury2, uw2 / 2, ury2 + ovx, uw2 / 2 - s, ury2 + ovx - t, 180, 360, N * 2, E),
    ]);
    const rw2 = w(390);
    put('r', rw2, [rect(0, 0, s, X), arch(0, rw2, X).p]);

    // b d p q — stem + bowl
    const bw2 = w(520);
    const bowl = (ww, side2, y0) => {
      const cx2 = ww / 2, rx = ww / 2, ry = X / 2 + ovx;
      const r2 = ring(cx2, y0 + X / 2, rx, ry, rx - s, ry - t, N, E);
      return r2;
    };
    const bb = bowl(bw2, 1, 0);
    put('b', bw2, [rect(0, 0, s, A), bb.pos], [bb.cut]);
    put('d', bw2, [rect(bw2 - s, 0, bw2, A), bb.pos], [bb.cut]);
    put('p', bw2, [rect(0, D, s, X), bb.pos], [bb.cut]);
    put('q', bw2, [rect(bw2 - s, D, bw2, X), bb.pos], [bb.cut]);

    // a — double storey
    const aw2 = w(500), abH = X * 0.575;
    const ab = ring(aw2 / 2, abH / 2, aw2 / 2, abH / 2 + ovx, aw2 / 2 - s, abH / 2 + ovx - t, N, E);
    put('a', aw2, [
      ab.pos,
      rect(aw2 - s, 0, aw2, X),
      band(aw2 / 2, X - (X - abH) * 0.85, aw2 / 2, (X - abH) * 0.85 + ovx, aw2 / 2 - s, (X - abH) * 0.85 + ovx - t, 24, 176, N * 2, E),
    ], [ab.cut]);

    // g — single storey, straight tail
    const gw2 = w(510);
    const gb = ring(gw2 / 2, X / 2, gw2 / 2, X / 2 + ovx, gw2 / 2 - s, X / 2 + ovx - t, N, E);
    const gR = gw2 * 0.46, gRy = Math.abs(D) * 0.74, gCy = D + gRy;
    put('g', gw2, [
      gb.pos,
      rect(gw2 - s, gCy - t * 0.4, gw2, X),
      band(gw2 - gR, gCy, gR, gRy, gR - s, gRy - t, 194, 360, N * 2, E),
    ], [gb.cut]);

    // i j l — square dots, because the face has no round corners to spare
    const dotS = Math.max(s * 1.02, t);
    const dotY = X + (A - X) * 0.30;
    put('i', s + w(70), [rect(w(35), 0, w(35) + s, X), rect(w(35) - (dotS - s) / 2, dotY, w(35) + s + (dotS - s) / 2, dotY + dotS)]);
    const jw2 = w(320), jSt = jw2 - w(35), jR = jw2 * 0.32, jRy = Math.abs(D) * 0.76, jCy = D + jRy;
    put('j', jw2, [
      rect(jSt - s, jCy - t * 0.4, jSt, X),
      band(jSt - jR, jCy, jR, jRy, jR - s, jRy - t, 180, 360, N * 2, E),
      rect(jSt - s - (dotS - s) / 2, dotY, jSt + (dotS - s) / 2, dotY + dotS),
    ]);
    put('l', s + w(80), [rect(w(40), 0, w(40) + s, A)]);

    // f t — the two with crossbars
    const fw2 = w(330), fr = w(210);
    put('f', fw2, [
      rect(w(30), 0, w(30) + s, A - fr * 0.55),
      band(w(30) + s / 2 + fr * 0.55, A - fr * 0.55, fr * 0.55 + s / 2, fr * 0.55, fr * 0.55 + s / 2 - s, fr * 0.55 - t, 90, 186, N * 2, E),
      rect(0, X - t * 0.5, fw2, X + t * 0.5),
    ]);
    const tw2 = w(360);
    put('t', tw2, [
      rect(w(30), X * 0.22, w(30) + s, X * 1.42),
      band(w(30) + s / 2 + X * 0.20, X * 0.22, X * 0.20 + s / 2, X * 0.22, X * 0.20 + s / 2 - s, X * 0.22 - t, 180, 292, N * 2, E),
      rect(0, X - t * 0.5, tw2 * 0.88, X + t * 0.5),
    ]);

    // s
    const sw2 = w(455);
    put('s', sw2, sForm(0, 0, sw2, X, s * 0.98));

    // v w x y z k — the diagonals, at x-height
    const vw2 = w(470), vcx2 = vw2 / 2, vtip2 = s * 0.46;
    const vlw2 = s * (Math.hypot(vcx2, X) / X);
    put('v', vw2, [[
      [0, X], [vcx2 - vtip2, 0], [vcx2 + vtip2, 0], [vw2, X],
      [vw2 - vlw2, X], [vcx2, t * 1.35], [vlw2, X],
    ]]);
    const ww2 = w(700), b1 = ww2 * 0.25, b2 = ww2 * 0.75, wtip2 = s * 0.40;
    const wlw2 = s * (Math.hypot(b1, X) / X);
    put('w', ww2, [[
      [0, X], [b1 - wtip2, 0], [b1 + wtip2, 0], [ww2 / 2 - wtip2 * 0.7, X], [ww2 / 2 + wtip2 * 0.7, X],
      [b2 - wtip2, 0], [b2 + wtip2, 0], [ww2, X],
      [ww2 - wlw2, X], [b2, t * 1.35], [ww2 / 2, X - t * 2.6], [b1, t * 1.35], [wlw2, X],
    ]]);
    const xw2 = w(470);
    const clipX = (p2) => cutX(cutX(p2, 0, false), xw2, true);
    put('x', xw2, [
      clipX(diagCutH(s * 0.5, X, xw2 - s * 0.5, 0, s * 0.96)),
      clipX(diagCutH(xw2 - s * 0.5, X, s * 0.5, 0, s * 0.96)),
    ]);
    // y — the left arm stops ON the descending stroke, not on the baseline,
    // so the tail reads as one diagonal instead of a leg with a step in it.
    const yw2 = w(470), yTail = [yw2 * 0.20, D], yTop = [yw2 - s * 0.5, X];
    const yMeet = (yy) => [yTop[0] + (yTail[0] - yTop[0]) * (yy - X) / (D - X), yy];
    put('y', yw2, [
      cutX(cutY(diagCutH(yTop[0], yTop[1], yTail[0], yTail[1], s * 0.96), D, false), yw2, true),
      cutX(seg([s * 0.5, X], yMeet(X * 0.26), s * 0.96), 0, false),
    ]);
    const zw2 = w(440);
    put('z', zw2, [
      rect(0, X - t, zw2, X),
      rect(0, 0, zw2, t),
      cutY(cutY(diagCutV(zw2 - s * 0.35, X - t * 0.4, s * 0.35, t * 0.4, s * 0.96), X, true), 0, false),
    ]);
    const kw2 = w(475), kj2 = X * 0.46;
    put('k', kw2, [
      rect(0, 0, s, A),
      diagCutV(s * 0.7, kj2 - t * 0.16, kw2, X, s * 0.94),
      diagCutV(s * 0.7, kj2 + t * 0.16, kw2, 0, s * 0.94),
    ]);
  }

  return g;
}

/* Small caps: the capitals, redrawn from a second metric bundle — shorter,
   wider and proportionally fatter — and filed under a-z. A cap merely scaled
   down goes pale beside a full one; this keeps a mixed-case headline one even
   colour. */
export function smallCaps(M) {
  const big = buildFace(M);
  const out = {};
  for (let i = 0; i < 26; i++) {
    const up = String.fromCharCode(65 + i), lo = String.fromCharCode(97 + i);
    if (big[up]) out[lo] = big[up];
  }
  return out;
}
