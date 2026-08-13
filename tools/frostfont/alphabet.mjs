/* ============================================================================
   alphabet.mjs — the letterforms of FROSTCUT and FROSTWORK.

   Frostfell is a game about ice, so the type is cut rather than drawn: every
   round shape here is a SUPERELLIPSE sampled at a deliberately low number of
   segments, which leaves visible facets on the bowls the way a chisel leaves
   them on a block. Frostcut takes that all the way down (four segments to the
   quarter — an O is a sixteen-sided stone), Frostwork keeps seven so it still
   reads as a circle at 11px.

   One parametric skeleton feeds both families, but the two are NOT the same
   drawing at two weights. The bundle carries switches, not just numbers:

     ic     the icicle — how far a horizontal terminal drips at its far end.
            Frostcut's E, F, T, Z and 7 hang a little wedge; Frostwork's are
            cut dead flat (ic = 0), because a drip is noise at 13px.
     spur   the opposite move: a short horizontal flat added to a curved
            terminal so C, G, S, c, e, s and a stop on a vertical cut instead
            of a radial one. Frostwork only — it is what keeps the apertures
            reading open at text sizes.
     ap     the aperture angle those terminals stop at. 46° is Frostcut's
            clenched display C; 30° is Frostwork's open one.
     dia    dots are diamonds (Frostcut) or squares (Frostwork).
     wedge  apostrophes and quotes taper to a point rather than sitting square.
     oneA   a single-storey 'a'. Frostcut is geometric and cartoon; Frostwork
            keeps the double-storey 'a' and a tailed 'l', because a card full
            of body text needs the extra difference between letters.

   Coordinates are y-up, baseline at 0, each glyph authored from x = 0; put()
   adds the sidebearing and reports the advance.
   ========================================================================== */
import {
  rect, arc, band, ring, stem, diagCutH, diagCutV, shift, cutX, cutY, sePt, seg,
} from '../beastfont/pen.mjs';

export function buildFace(M) {
  const H = M.cap, X = M.xh, A = M.asc, D = M.desc;
  const s = M.st;                       // stem
  const t = M.th;                       // horizontal / thin
  const E = M.e;                        // superellipse exponent
  const N = M.N;                        // arc segments per quarter
  const CH = M.ch || 0;                 // facet chamfer on stem corners
  const ov = M.ov;                      // round overshoot
  const ic = M.ic || 0;                 // icicle drip
  const AP = M.ap;                      // aperture angle
  const SP = M.spur || 0;               // flat-cut terminal spur
  const g = {};
  const w = (n) => n * M.wf;

  const put = (ch, ink, pos, cut) => {
    g[ch] = {
      pos: (pos || []).filter(Boolean).map((p) => shift(p, M.side, 0)),
      cut: (cut || []).filter(Boolean).map((p) => shift(p, M.side, 0)),
      adv: Math.round(ink + M.side * 2),
    };
  };

  /* A stem with every corner knocked off — the cut-block look. */
  const vs = (x0, x1, y0, y1, which) =>
    stem(x0, x1, y0, y1, CH, which === undefined ? 'tl tr bl br' : which);
  /* A horizontal bar; only its free end is chamfered. */
  const hb = (x0, x1, y0, y1, which) =>
    stem(x0, x1, y0, y1, CH * 0.62, which === undefined ? 'tr br' : which);

  /* An arm whose underside dips into a wedge at one or both ends. `ends` is
     any of 'l' / 'r' / 'lr'; with ic = 0 it degrades to a plain bar, which is
     exactly what the text face wants. */
  const iceBar = (x0, x1, y0, y1, ends) => {
    if (!ic || !ends) return rect(x0, y0, x1, y1);
    const k = Math.min(t * 1.25, (x1 - x0) * 0.40);
    const p = [];
    p.push(ends.includes('l') ? [x0, y0 - ic] : [x0, y0]);
    if (ends.includes('l')) p.push([x0 + k, y0]);
    if (ends.includes('r')) p.push([x1 - k, y0]);
    p.push(ends.includes('r') ? [x1, y0 - ic] : [x1, y0]);
    p.push([x1, y1], [x0, y1]);
    return p;
  };

  /* The right half of a bowl hung off a stem at x = xj. */
  const bowlR = (xj, cy, rox, roy, tt) =>
    band(xj, cy, rox, roy, rox - (tt || s), roy - t, -90, 90, N * 2, E);

  /* The flat cut on a curved terminal: a short horizontal stub laid on the
     stroke's own midline, so the stroke ends on a vertical face. */
  const spur = (cx, cy, rx, ry, ang, dir, tt) => {
    if (!SP) return null;
    const p = sePt(cx, cy, rx - s / 2, ry - t / 2, ang, E);
    return seg(p, [p[0] + SP * dir, p[1]], tt || t * 1.04);
  };

  /* -------------------------------------------------------------- S / s ---
     Two bowls stacked with their ellipses overlapping through the waist. The
     overlap is what welds them: the top bowl's floor and the bottom bowl's
     ceiling are less than a stroke apart, so the two strokes meet without any
     join being drawn. Keep (sT + sB - 1) * height under twice the stroke or
     the spine breaks in half. */
  function sForm(x0, y0, x1, y1, tt) {
    const Wd = x1 - x0, Ht = y1 - y0, cx = (x0 + x1) / 2;
    const ryT = Ht * M.sT / 2, ryB = Ht * M.sB / 2;
    const cyT = y1 - ryT, cyB = y0 + ryB;
    const rx = Wd / 2, th = tt * 0.90;
    const a0 = M.sA;
    const flat = (cy, ry, ang, dir) => {
      if (!SP) return null;
      const q = sePt(cx, cy, rx - tt / 2, ry - th / 2, ang, E);
      return seg(q, [q[0] + SP * dir, q[1]], th);
    };
    return [
      band(cx, cyT, rx, ryT, rx - tt, ryT - th, a0, 276, N * 3, E),
      band(cx, cyB, rx, ryB, rx - tt, ryB - th, 96, a0 - 180, N * 3, E),
      flat(cyT, ryT, a0, 1),
      flat(cyB, ryB, a0 - 180, -1),
    ].filter(Boolean);
  }

  /* ============================================================== CAPITALS */
  {
    // A — a blunt, flat-cut apex and a crossbar set low, so the letter reads
    // as a wedge of ice rather than as a triangle.
    const aw = w(630), acx = aw / 2, aTip = s * 0.60, aBar = H * 0.245;
    put('A', aw, [
      [[0, 0], [acx - aTip, H], [acx + aTip, H], [aw, 0]],
      rect(aw * 0.15, aBar, aw * 0.85, aBar + t * 0.95),
    ], [
      [[s * 1.00, 0], [acx, H - t * 1.05], [aw - s * 1.00, 0]],
    ]);

    // B — the lower bowl carries more width than the upper, which is what
    // stops a black B from looking top-heavy.
    const bw = w(560), bxj = s * 0.88, bhT = H * 0.475, bhB = H - bhT;
    put('B', bw, [
      vs(0, s, 0, H, 'tl bl'),
      bowlR(bxj, H - bhT / 2, bw - bxj - w(22), bhT / 2, s * 0.92),
      bowlR(bxj, bhB / 2, bw - bxj, bhB / 2, s),
      hb(0, bxj + w(45), H - t, H, ''),
      hb(0, bxj + w(45), 0, t, ''),
      hb(0, bxj + w(34), H - bhT - t * 0.48, H - bhT + t * 0.48, ''),
    ]);

    // C
    const cw = w(570), ccx = cw / 2, cry = H / 2 + ov;
    put('C', cw, [
      band(ccx, H / 2, cw / 2, cry, cw / 2 - s, cry - t, AP, 360 - AP, N * 4, E),
      spur(ccx, H / 2, cw / 2, cry, AP, 1),
      spur(ccx, H / 2, cw / 2, cry, -AP, 1),
    ]);

    // D
    const dw = w(585), dxj = s * 0.88;
    put('D', dw, [
      vs(0, s, 0, H, 'tl bl'),
      bowlR(dxj, H / 2, dw - dxj, H / 2, s),
      hb(0, dxj + w(45), H - t, H, ''),
      hb(0, dxj + w(45), 0, t, ''),
    ]);

    // E F — the arms drip.
    const ew = w(505), fw = w(490), mid = H * M.bar;
    put('E', ew, [
      vs(0, s, 0, H, 'tl bl'),
      iceBar(0, ew, H - t, H, 'r'),
      iceBar(0, ew * 0.845, mid - t * 0.48, mid + t * 0.48, 'r'),
      rect(0, 0, ew, t),
    ]);
    put('F', fw, [
      vs(0, s, 0, H, 'tl bl'),
      iceBar(0, fw, H - t, H, 'r'),
      iceBar(0, fw * 0.855, mid - t * 0.48, mid + t * 0.48, 'r'),
    ]);

    // G — a proper jaw: the vertical drops from the bar onto the band's own
    // lower terminal, so the two are flush instead of eyeballed.
    const gw = w(595), gcx = gw / 2, gry = H / 2 + ov, gbar = H * 0.415;
    const gOx = gcx + gcx * Math.pow(Math.cos(AP * Math.PI / 180), E);
    const gOy = H / 2 - gry * Math.pow(Math.sin(AP * Math.PI / 180), E);
    put('G', gw, [
      band(gcx, H / 2, gcx, gry, gcx - s, gry - t, AP, 360 - AP, N * 4, E),
      rect(gOx - s, gOy, gOx, gbar),
      rect(gw * 0.47, gbar - t, gOx, gbar),
      spur(gcx, H / 2, gcx, gry, AP, 1),
    ]);

    // H I J
    const hw = w(590);
    put('H', hw, [
      vs(0, s, 0, H, 'tl bl'), vs(hw - s, hw, 0, H, 'tr br'),
      rect(0, mid - t * 0.48, hw, mid + t * 0.48),
    ]);
    put('I', s, [vs(0, s, 0, H)]);
    const jw = w(465), jry = H * 0.30;
    put('J', jw, [
      vs(jw - s, jw, jry, H, 'tl tr'),
      band(jw / 2, jry, jw / 2, jry + ov, jw / 2 - s, jry + ov - t, 180, 360, N * 2, E),
    ]);

    // K — the arms meet the stem at one point and leave it as one wedge.
    const kw = w(575), kj = H * 0.47;
    put('K', kw, [
      vs(0, s, 0, H, 'tl bl'),
      cutY(diagCutV(s * 0.62, kj - t * 0.18, kw, H, s * 0.90), H, true),
      cutY(diagCutV(s * 0.62, kj + t * 0.18, kw, 0, s * 0.90), 0, false),
    ]);

    const lw = w(490);
    put('L', lw, [vs(0, s, 0, H, 'tl bl'), hb(0, lw, 0, t)]);

    // M — vertical sides, and the middle V stops well clear of the baseline:
    // a black M with the vee driven to the floor closes up at small sizes.
    const mw = w(745), mcx = mw / 2, mv = H * 0.215;
    put('M', mw, [
      vs(0, s, 0, H, 'bl'), vs(mw - s, mw, 0, H, 'br'),
      cutX(diagCutH(s * 0.45, H, mcx, mv, s * 0.86), 0, false),
      cutX(diagCutH(mcx, mv, mw - s * 0.45, H, s * 0.86), mw, true),
    ]);

    const nw = w(595);
    put('N', nw, [
      vs(0, s, 0, H, 'tl'), vs(nw - s, nw, 0, H, 'br'),
      cutX(cutX(diagCutH(s * 0.45, H, nw - s * 0.45, 0, s * 0.94), 0, false), nw, true),
    ]);

    // O Q
    const ow = w(620), orx = ow / 2, ory = H / 2 + ov;
    const oR = ring(orx, H / 2, orx, ory, orx - s, ory - t, N, E);
    put('O', ow, [oR.pos], [oR.cut]);
    put('Q', ow, [
      oR.pos,
      seg([ow * 0.60, H * 0.30], [ow * 0.95, -H * 0.055], s * 0.88),
    ], [oR.cut]);

    // P R
    const pw = w(540), pxj = s * 0.88, phT = H * 0.545;
    put('P', pw, [
      vs(0, s, 0, H, 'tl bl'),
      bowlR(pxj, H - phT / 2, pw - pxj, phT / 2, s),
      hb(0, pxj + w(45), H - t, H, ''),
      hb(0, pxj + w(34), H - phT - t * 0.5, H - phT + t * 0.5, ''),
    ]);
    const rw = w(565), rhT = H * 0.525;
    put('R', rw, [
      vs(0, s, 0, H, 'tl bl'),
      bowlR(s * 0.88, H - rhT / 2, rw * 0.875 - s * 0.88, rhT / 2, s),
      hb(0, s * 0.88 + w(45), H - t, H, ''),
      hb(0, s * 0.88 + w(34), H - rhT - t * 0.5, H - rhT + t * 0.5, ''),
      cutY(diagCutH(rw * 0.44, H - rhT + t * 0.35, rw - s * 0.34, 0, s * 0.92), 0, false),
    ]);

    const sw = w(545);
    put('S', sw, sForm(0, 0, sw, H, s));

    // T — the one letter that hangs an icicle at both ends.
    const tw = w(545);
    put('T', tw, [
      iceBar(0, tw, H - t, H, 'lr'),
      vs(tw / 2 - s / 2, tw / 2 + s / 2, 0, H, 'bl br'),
    ]);

    const uw = w(590), ury = H * 0.335;
    put('U', uw, [
      vs(0, s, ury, H, 'tl tr'), vs(uw - s, uw, ury, H, 'tl tr'),
      band(uw / 2, ury, uw / 2, ury + ov, uw / 2 - s, ury + ov - t, 180, 360, N * 2, E),
    ]);

    // V W — one outline each, with the vertices cut blunt to match the A.
    const vw = w(600), vcx = vw / 2, vtip = s * 0.55;
    const vlw = s * (Math.hypot(vcx, H) / H);
    put('V', vw, [[
      [0, H], [vcx - vtip, 0], [vcx + vtip, 0], [vw, H],
      [vw - vlw, H], [vcx, t * 1.45], [vlw, H],
    ]]);
    // The middle apex of the W stops short of the cap line — it keeps the two
    // vees legible instead of letting them fuse into a zigzag.
    const wwd = w(855), p1 = wwd * 0.255, p2 = wwd * 0.745, wtip = s * 0.44, wtop = H * 0.885;
    const wlw = s * (Math.hypot(p1, H) / H);
    put('W', wwd, [[
      [0, H], [p1 - wtip, 0], [p1 + wtip, 0], [wwd / 2 - wtip * 0.75, wtop],
      [wwd / 2 + wtip * 0.75, wtop], [p2 - wtip, 0], [p2 + wtip, 0], [wwd, H],
      [wwd - wlw, H], [p2, t * 1.5], [wwd / 2, wtop - t * 2.6], [p1, t * 1.5], [wlw, H],
    ]]);

    const xw = w(585);
    const clipX = (p) => cutX(cutX(p, 0, false), xw, true);
    put('X', xw, [
      clipX(diagCutH(s * 0.45, H, xw - s * 0.45, 0, s * 0.92)),
      clipX(diagCutH(xw - s * 0.45, H, s * 0.45, 0, s * 0.92)),
    ]);
    const yw = w(570), yj = H * 0.415;
    put('Y', yw, [
      cutX(diagCutH(s * 0.45, H, yw / 2, yj, s * 0.92), 0, false),
      cutX(diagCutH(yw - s * 0.45, H, yw / 2, yj, s * 0.92), yw, true),
      vs(yw / 2 - s / 2, yw / 2 + s / 2, 0, yj + t, 'bl br'),
    ]);
    const zw = w(535);
    put('Z', zw, [
      iceBar(0, zw, H - t, H, 'r'),
      hb(0, zw, 0, t, ''),
      cutY(cutY(diagCutV(zw - s * 0.30, H - t * 0.4, s * 0.30, t * 0.4, s * 0.92), H, true), 0, false),
    ]);
  }

  /* ================================================================ FIGURES
     One advance for all ten, so a stat column never shifts under itself. */
  {
    const fw = w(545), cx = fw / 2;
    const fig = (ch, pos, cut) => {
      g[ch] = {
        pos: (pos || []).filter(Boolean).map((p) => shift(p, M.side, 0)),
        cut: (cut || []).filter(Boolean).map((p) => shift(p, M.side, 0)),
        adv: Math.round(fw + M.side * 2),
      };
    };

    const zr = ring(cx, H / 2, cx * 0.94, H / 2 + ov, cx * 0.94 - s, H / 2 + ov - t, N, E);
    fig('0', [zr.pos], [zr.cut]);

    // 1 — flagged, and footed, because tabular figures need the width filled.
    fig('1', [
      vs(cx - s / 2, cx + s / 2, 0, H, 'tl tr'),
      [[cx - s / 2, H], [cx - s / 2, H - t * 1.20], [fw * 0.13, H * 0.735], [fw * 0.13, H * 0.885]],
      rect(fw * 0.11, 0, fw - fw * 0.11, t),
    ]);

    const twoH = H * 0.615;
    fig('2', [
      band(cx, H - twoH / 2, cx, twoH / 2, cx - s, twoH / 2 - t, 205, -26, N * 3, E),
      cutY(diagCutV(fw - s * 0.50, H * 0.445, s * 0.26, t * 1.05, s * 0.94), 0, false),
      rect(0, 0, fw, t),
    ]);

    // 3 — flat-topped. The straight arm across the top is the family's own
    // move; the round-topped 3 belongs to somebody else's typeface.
    const b3 = H * 0.585, b3cy = b3 / 2;
    const b3top = sePt(cx, b3cy, cx - s / 2, b3cy + ov - t / 2, 118, E);
    fig('3', [
      rect(fw * 0.06, H - t, fw * 0.92, H),
      seg([fw * 0.88, H - t * 0.35], b3top, s * 0.92),
      band(cx, b3cy, cx, b3cy + ov, cx - s, b3cy + ov - t, 118, -168, N * 3, E),
    ]);

    fig('4', [
      diagCutV(fw * 0.63, H, fw * 0.03, H * 0.275, s * 0.88),
      rect(0, H * 0.275 - t, fw, H * 0.275),
      vs(fw * 0.56, fw * 0.56 + s, 0, H, ''),
    ]);

    const b5 = H * 0.605, b5y = H - b5 * 0.70;
    fig('5', [
      rect(0, H - t, fw * 0.93, H),
      rect(0, b5y - t * 0.4, s, H),
      band(cx, b5 / 2, cx, b5 / 2 + ov, cx - s, b5 / 2 + ov - t, 122, -186, N * 3, E),
      rect(0, b5y - t * 0.4, fw * 0.44, b5y + t * 0.78),
    ]);

    // 6 / 9 — one drawing, turned through 180°.
    const lowR = H * 0.585, bCy = lowR / 2;
    const r6 = ring(cx, bCy, cx, bCy + ov, cx - s, bCy + ov - t, N, E);
    const up6 = band(cx, bCy, cx, H - bCy, cx - s, H - bCy - t, 104, 180, N * 3, E);
    const turn = (p) => p.map(([x, y]) => [fw - x, H - y]);
    fig('6', [r6.pos, up6], [r6.cut]);
    fig('9', [turn(r6.pos), turn(up6)], [turn(r6.cut)]);

    fig('7', [
      iceBar(0, fw, H - t, H, 'r'),
      diagCutH(fw * 0.84, H - t * 0.2, fw * 0.26, 0, s * 0.96),
    ]);

    const e8T = H * 0.515, e8B = H * 0.555;
    const r8t = ring(cx, H - e8T / 2, cx * 0.87, e8T / 2, cx * 0.87 - s, e8T / 2 - t * 0.94, N, E);
    const r8b = ring(cx, e8B / 2, cx, e8B / 2 + ov, cx - s, e8B / 2 + ov - t, N, E);
    fig('8', [r8t.pos, r8b.pos], [r8t.cut, r8b.cut]);
  }

  /* ============================================================ PUNCTUATION */
  {
    const dr = Math.max(s * 0.54, t * 0.58);          // dot half-size
    const dot = (cx, cy) => (M.dia
      ? [[cx, cy - dr * 1.34], [cx + dr * 1.34, cy], [cx, cy + dr * 1.34], [cx - dr * 1.34, cy]]
      : rect(cx - dr, cy - dr, cx + dr, cy + dr));
    const base = (cx) => dot(cx, dr);
    const p = put;

    put(' ', w(240), []);

    p('.', w(230), [base(w(230) / 2)]);
    // comma: the dot pulled into a tail that leaves the baseline.
    const commaAt = (cx) => [
      [cx - dr, dr * 1.2], [cx + dr, dr * 1.2], [cx + dr * 0.58, -dr * 0.70],
      [cx - dr * 0.88, -dr * 2.30], [cx - dr * 0.98, -dr * 1.05], [cx - dr, dr * 0.10],
    ];
    p(',', w(235), [commaAt(w(235) / 2)]);
    p(':', w(235), [base(w(235) / 2), dot(w(235) / 2, H * 0.44 + dr)]);
    p(';', w(240), [commaAt(w(240) / 2), dot(w(240) / 2, H * 0.44 + dr)]);
    p('!', w(255), [
      [[w(255) / 2 - s * 0.52, H], [w(255) / 2 + s * 0.52, H],
        [w(255) / 2 + s * 0.26, dr * 2.6], [w(255) / 2 - s * 0.26, dr * 2.6]],
      base(w(255) / 2),
    ]);

    // ? — the tail carries on from where the bowl's stroke stopped, so the
    // join is a continuation and not a bar dropped across the counter.
    const qw = w(470), qr = qw / 2, qry = H * 0.245, qcy = H - qry;
    const qEnd = sePt(qw / 2, qcy, qr - s / 2, qry - t / 2, -38, E);
    p('?', qw, [
      band(qw / 2, qcy, qr, qry, qr - s, qry - t, 200, -38, N * 3, E),
      seg(qEnd, [qw / 2, H * 0.275], s * 0.94),
      base(qw / 2),
    ]);

    // quotes — icicles in the display face, flat ticks in the text face.
    const tick = (x) => (M.wedge
      ? [[x, H], [x + s * 0.95, H], [x + s * 0.475, H - t * 2.05]]
      : [[x, H], [x + s * 0.98, H], [x + s * 0.74, H - t * 1.85], [x + s * 0.24, H - t * 1.85]]);
    const apW = w(255);
    p("'", apW, [tick(apW / 2 - s * 0.48)]);
    p('’', apW, [tick(apW / 2 - s * 0.48)]);
    const dqW = w(415);
    const pair = (ww) => [tick(ww * 0.5 - s * 1.12), tick(ww * 0.5 + s * 0.16)];
    p('"', dqW, pair(dqW));
    p('“', dqW, pair(dqW));
    p('”', dqW, pair(dqW));

    // brackets
    const brY0 = -H * 0.135, brY1 = H * 0.79;
    const brCy = (brY0 + brY1) / 2, brRy = (brY1 - brY0) / 2;
    const paren = (ww, dir) => {
      const rx = ww * 0.86, cx0 = dir > 0 ? ww * 0.95 : ww * 0.05;
      const a0 = dir > 0 ? 108 : -72, a1 = dir > 0 ? 252 : 72;
      return [band(cx0, brCy, rx, brRy, rx - s * 0.78, brRy - t * 0.78, a0, a1,
        N * 3, Math.min(0.95, E + 0.14))];
    };
    p('(', w(310), paren(w(310), 1));
    p(')', w(310), paren(w(310), -1));
    // square brackets: a lighter stem than the letters carry, or a display
    // face closes the counter up entirely
    const sq = (ww, dir) => {
      const st2 = s * 0.70, arm = t * 0.82;
      const x0 = dir > 0 ? ww * 0.19 : ww * 0.81 - st2, x1 = x0 + st2;
      const aL = dir > 0 ? x0 : ww * 0.15, aR = dir > 0 ? ww * 0.85 : x1;
      return [rect(x0, brY0, x1, brY1), rect(aL, brY1 - arm, aR, brY1), rect(aL, brY0, aR, brY0 + arm)];
    };
    p('[', w(310), sq(w(310), 1));
    p(']', w(310), sq(w(310), -1));

    // rules and dashes
    const dash = (ww, len, y) => [rect((ww - len) / 2, y - t * 0.46, (ww + len) / 2, y + t * 0.46)];
    p('-', w(330), dash(w(330), w(210), H * 0.385));
    p('–', w(520), dash(w(520), w(430), H * 0.385));
    p('—', w(800), dash(w(800), w(740), H * 0.385));
    p('−', w(545), dash(w(545), w(340), H * 0.385));
    p('_', w(545), [rect(0, -H * 0.155, w(545), -H * 0.155 + t * 0.92)]);
    p('|', w(230), [rect(w(230) / 2 - s * 0.34, -H * 0.13, w(230) / 2 + s * 0.34, H * 1.0)]);
    p('/', w(370), [diagCutH(w(370) * 0.05, -H * 0.10, w(370) * 0.95, H * 0.98, s * 0.88)]);
    p('\\', w(370), [diagCutH(w(370) * 0.95, -H * 0.10, w(370) * 0.05, H * 0.98, s * 0.88)]);

    // maths and signs
    const opY = H * 0.395, opL = w(360), ow2 = w(545);
    p('+', ow2, [
      rect((ow2 - opL) / 2, opY - t * 0.46, (ow2 + opL) / 2, opY + t * 0.46),
      rect(ow2 / 2 - t * 0.46, opY - opL / 2, ow2 / 2 + t * 0.46, opY + opL / 2),
    ]);
    p('=', ow2, [
      rect((ow2 - opL) / 2, opY - t * 1.32, (ow2 + opL) / 2, opY - t * 0.40),
      rect((ow2 - opL) / 2, opY + t * 0.40, (ow2 + opL) / 2, opY + t * 1.32),
    ]);
    const chev = (ww, dir) => [
      diagCutV(dir > 0 ? ww * 0.86 : ww * 0.14, H * 0.665, dir > 0 ? ww * 0.14 : ww * 0.86, opY, t * 0.96),
      diagCutV(dir > 0 ? ww * 0.86 : ww * 0.14, H * 0.125, dir > 0 ? ww * 0.14 : ww * 0.86, opY, t * 0.96),
    ];
    p('<', w(510), chev(w(510), 1));
    p('>', w(510), chev(w(510), -1));
    p('×', w(480), [
      diagCutH(w(480) * 0.15, H * 0.655, w(480) * 0.85, H * 0.135, t * 0.96),
      diagCutH(w(480) * 0.85, H * 0.655, w(480) * 0.15, H * 0.135, t * 0.96),
    ]);
    p('^', w(470), [
      diagCutH(w(470) * 0.08, H * 0.50, w(470) * 0.50, H * 0.92, t * 0.92),
      diagCutH(w(470) * 0.92, H * 0.50, w(470) * 0.50, H * 0.92, t * 0.92),
    ]);
    // ~ — a faceted zigzag rather than a wave: this family has no smooth curves
    // to spare, and a hard chevron survives 11px where a sine wave smears.
    const twd = w(560), ty = H * 0.42, tam = H * 0.135, tt2 = t * 0.90;
    p('~', twd, [[
      [twd * 0.03, ty - tam * 0.35], [twd * 0.29, ty + tam], [twd * 0.53, ty - tam * 0.30],
      [twd * 0.75, ty + tam * 0.42], [twd * 0.97, ty - tam * 0.55],
      [twd * 0.97, ty - tam * 0.55 + tt2], [twd * 0.75, ty + tam * 0.42 + tt2],
      [twd * 0.53, ty - tam * 0.30 + tt2], [twd * 0.29, ty + tam + tt2],
      [twd * 0.03, ty - tam * 0.35 + tt2],
    ]]);

    // the odds and ends a card game actually sets
    const hs = w(600), hbT = t * 0.72;
    p('#', hs, [
      rect(hs * 0.245, 0, hs * 0.245 + hbT, H * 0.80),
      rect(hs * 0.605, 0, hs * 0.605 + hbT, H * 0.80),
      rect(hs * 0.03, H * 0.215, hs * 0.97, H * 0.215 + hbT),
      rect(hs * 0.03, H * 0.495, hs * 0.97, H * 0.495 + hbT),
    ]);

    const pcw = w(680), pcr = H * 0.185, pct = t * 0.62;
    const pcRing = (cx2, cy2) => ring(cx2, cy2, pcr, pcr, pcr - pct, pcr - pct, Math.max(3, N - 1), E);
    const pcA = pcRing(pcr + t * 0.1, H - pcr), pcB = pcRing(pcw - pcr - t * 0.1, pcr);
    p('%', pcw, [pcA.pos, pcB.pos,
      diagCutH(pcw * 0.84, H, pcw * 0.16, 0, t * 0.92)], [pcA.cut, pcB.cut]);

    const dw2 = w(545);
    p('$', dw2, [...sForm(0, H * 0.05, dw2, H * 0.95, s * 0.94),
      rect(dw2 / 2 - t * 0.40, -H * 0.05, dw2 / 2 + t * 0.40, H * 1.05)]);

    // & — a small upper loop over a large lower bowl, welded by a short link
    // between the two open ends on the left, with the leg kicked out of the
    // bowl's right terminal. Both joins are drawn from where the arcs actually
    // END, so nothing has to be eyeballed.
    const amw = w(760), amS = s * 0.72, amT = t * 0.74;
    const tC = [amw * 0.400, H * 0.735], tR = [amw * 0.330, H * 0.255];
    const bC = [amw * 0.410, H * 0.295], bR = [amw * 0.410, H * 0.295];
    const tIn = [tR[0] - amS / 2, tR[1] - amT / 2];
    const bIn = [bR[0] - amS / 2, bR[1] - amT / 2];
    p('&', amw, [
      band(tC[0], tC[1], tR[0], tR[1], tR[0] - amS, tR[1] - amT, -34, 252, N * 3, E),
      band(bC[0], bC[1], bR[0], bR[1], bR[0] - amS, bR[1] - amT, 126, 356, N * 3, E),
      seg(sePt(tC[0], tC[1], tIn[0], tIn[1], 252, E),
        sePt(bC[0], bC[1], bIn[0], bIn[1], 126, E), amS * 1.10),
      seg(sePt(bC[0], bC[1], bIn[0], bIn[1], 344, E), [amw * 0.97, H * 0.44], amS * 0.92),
    ]);

    // @ — an 'a' inside a ring left open at the lower right, which is what the
    // mark literally is.
    const atw = w(850), atR = atw * 0.46, atRy = H * 0.505, atCy = H * 0.435;
    const atT = t * 0.58, atIn = atR * 0.50, atInY = atRy * 0.44, atCx = atw * 0.525;
    const aIr = ring(atCx, atCy, atIn, atInY, atIn - atT, atInY - atT, Math.max(3, N - 1), E);
    p('@', atw, [
      band(atw / 2, atCy, atR, atRy, atR - atT, atRy - atT, -56, 266, N * 4, E),
      aIr.pos,
      rect(atCx + atIn - atT, atCy - atInY, atCx + atIn, atCy + atRy * 0.22),
    ], [aIr.cut]);

    const stw = w(470);
    p('*', stw, [
      rect(stw / 2 - t * 0.40, H * 0.50, stw / 2 + t * 0.40, H * 1.0),
      diagCutH(stw * 0.08, H * 0.615, stw * 0.92, H * 0.885, t * 0.80),
      diagCutH(stw * 0.92, H * 0.615, stw * 0.08, H * 0.885, t * 0.80),
    ]);

    const degw = w(360), degr = H * 0.17, degt = t * 0.58;
    const dg = ring(degw / 2, H - degr, degr, degr, degr - degt, degr - degt, Math.max(3, N - 1), E);
    p('°', degw, [dg.pos], [dg.cut]);

    p('…', w(700), [base(w(700) * 0.175), base(w(700) * 0.5), base(w(700) * 0.825)]);
    p('·', w(260), [dot(w(260) / 2, H * 0.36)]);
    const bul = w(360), bulr = Math.max(t * 0.86, s * 0.72);
    p('•', bul, [arc(bul / 2, H * 0.375, bulr, bulr, 0, 360, Math.max(3, N - 1) * 4, E)]);

    // arrows — solid heads, because a hairline chevron disappears in a tooltip
    const arw = w(720), ay = H * 0.40, ah = t * 0.86, hh = H * 0.215;
    p('→', arw, [
      rect(arw * 0.03, ay - ah / 2, arw * 0.72, ay + ah / 2),
      [[arw * 0.58, ay + hh], [arw * 0.97, ay], [arw * 0.58, ay - hh]],
    ]);
    p('←', arw, [
      rect(arw * 0.28, ay - ah / 2, arw * 0.97, ay + ah / 2),
      [[arw * 0.42, ay + hh], [arw * 0.03, ay], [arw * 0.42, ay - hh]],
    ]);
    const avw = w(560), ax = avw / 2, aw3 = avw * 0.30;
    p('↑', avw, [
      rect(ax - ah / 2, -H * 0.03, ax + ah / 2, H * 0.68),
      [[ax - aw3, H * 0.56], [ax, H * 0.97], [ax + aw3, H * 0.56]],
    ]);
    p('↓', avw, [
      rect(ax - ah / 2, H * 0.26, ax + ah / 2, H * 0.97),
      [[ax - aw3, H * 0.38], [ax, -H * 0.03], [ax + aw3, H * 0.38]],
    ]);

    // ♥ — two lobes and a wedge; the non-zero rule welds them.
    const hw3 = w(700), hr = H * 0.215, hcy = H * 0.595, hcx = hw3 / 2;
    p('♥', hw3, [
      arc(hcx - hr * 0.92, hcy, hr, hr * 1.02, 0, 360, Math.max(4, N) * 4, E),
      arc(hcx + hr * 0.92, hcy, hr, hr * 1.02, 0, 360, Math.max(4, N) * 4, E),
      [[hcx - hr * 1.90, hcy + hr * 0.14], [hcx, H * 0.045], [hcx + hr * 1.90, hcy + hr * 0.14]],
    ]);

    // ✦ — a four-point sparkle: eight vertices, long and short about the centre
    const spw = w(620), spx = spw / 2, spy = H * 0.46;
    const Rx = spw * 0.47, Ry = H * 0.45, rx2 = Rx * 0.26, ry2 = Ry * 0.26;
    const star = [];
    for (let i = 0; i < 8; i++) {
      const a = (90 - i * 45) * Math.PI / 180;
      const long = i % 2 === 0;
      star.push([spx + (long ? Rx : rx2) * Math.cos(a), spy + (long ? Ry : ry2) * Math.sin(a)]);
    }
    p('✦', spw, [star]);
  }

  /* =============================================================== LOWERCASE */
  {
    // o — every other round lowercase is measured off this one
    const ow = w(525), orx = ow / 2, ory = X / 2 + ov;
    const oR = ring(orx, X / 2, orx, ory, orx - s, ory - t, N, E);
    put('o', ow, [oR.pos], [oR.cut]);

    // c — same aperture and terminal treatment as the cap C
    const cw = w(490), cry = X / 2 + ov;
    put('c', cw, [
      band(cw / 2, X / 2, cw / 2, cry, cw / 2 - s, cry - t, AP, 360 - AP, N * 4, E),
      spur(cw / 2, X / 2, cw / 2, cry, AP, 1),
      spur(cw / 2, X / 2, cw / 2, cry, -AP, 1),
    ]);

    // e — the bar is the start of the stroke, not a slot cut into a ring
    const ew = w(515), ebar = X * 0.545, ery = X / 2 + ov;
    put('e', ew, [
      band(ew / 2, X / 2, ew / 2, ery, ew / 2 - s, ery - t, 4, 302, N * 4, E),
      rect(0, ebar - t * 0.5, ew, ebar + t * 0.5),
      spur(ew / 2, X / 2, ew / 2, ery, -58, 1),
    ]);

    // n m h r u — the shoulder family. `arch` reports where its own ends sit,
    // so the stem it hangs off stops exactly there.
    const arch = (x0, x1, top) => {
      const cx2 = (x0 + x1) / 2, rx = (x1 - x0) / 2;
      const ry = Math.min(rx * 1.10, top * 0.48);
      return { p: band(cx2, top - ry, rx, ry, rx - s, ry - t, 0, 180, N * 2, E), y: top - ry };
    };
    const nw = w(540);
    const nA = arch(0, nw, X);
    put('n', nw, [rect(0, 0, s, X), nA.p, rect(nw - s, 0, nw, nA.y)]);
    const mw = w(830), half = mw * 0.5 + s * 0.5;
    const mA = arch(0, half, X), mB = arch(half - s, mw, X);
    put('m', mw, [
      rect(0, 0, s, X), mA.p, rect(half - s, 0, half, mA.y),
      mB.p, rect(mw - s, 0, mw, mB.y),
    ]);
    put('h', nw, [rect(0, 0, s, A), nA.p, rect(nw - s, 0, nw, nA.y)]);
    const uw = w(540), ury = X * 0.335;
    put('u', uw, [
      rect(0, ury, s, X), rect(uw - s, 0, uw, X),
      band(uw / 2, ury, uw / 2, ury + ov, uw / 2 - s, ury + ov - t, 180, 360, N * 2, E),
    ]);
    const rw = w(400);
    put('r', rw, [rect(0, 0, s, X), arch(0, rw, X).p]);

    // b d p q — one bowl, four positions
    const bw = w(540);
    const bR = ring(bw / 2, X / 2, bw / 2, X / 2 + ov, bw / 2 - s, X / 2 + ov - t, N, E);
    put('b', bw, [rect(0, 0, s, A), bR.pos], [bR.cut]);
    put('d', bw, [rect(bw - s, 0, bw, A), bR.pos], [bR.cut]);
    put('p', bw, [rect(0, D, s, X), bR.pos], [bR.cut]);
    put('q', bw, [rect(bw - s, D, bw, X), bR.pos], [bR.cut]);

    // a — single storey in the display face (geometric, cartoon), double
    // storey in the text face, where the extra difference earns its keep.
    const aw = w(520);
    if (M.oneA) {
      const aR = ring(aw / 2, X / 2, aw / 2, X / 2 + ov, aw / 2 - s, X / 2 + ov - t, N, E);
      put('a', aw, [aR.pos, rect(aw - s, 0, aw, X)], [aR.cut]);
    } else {
      const abH = X * 0.55, ary = abH / 2 + ov;
      const ab = ring(aw / 2, abH / 2, aw / 2, ary, aw / 2 - s, ary - t, N, E);
      const topRy = (X - abH) * 0.92 + ov;
      put('a', aw, [
        ab.pos, rect(aw - s, 0, aw, X),
        band(aw / 2, X - topRy, aw / 2, topRy, aw / 2 - s, topRy - t, 20, 176, N * 2, E),
      ], [ab.cut]);
    }

    // g — single storey, and the tail is cut straight: an ice pick, not a curl
    const gw = w(535);
    const gb = ring(gw / 2, X / 2, gw / 2, X / 2 + ov, gw / 2 - s, X / 2 + ov - t, N, E);
    const gR = gw * 0.46, gRy = Math.abs(D) * 0.72, gCy = D + gRy;
    put('g', gw, [
      gb.pos,
      rect(gw - s, gCy - t * 0.4, gw, X),
      band(gw - gR, gCy, gR, gRy, gR - s, gRy - t, 196, 360, N * 2, E),
    ], [gb.cut]);

    // i j l — the dots follow the family's dot shape
    const dS = Math.max(s * 1.06, t);
    const dY = X + (A - X) * 0.28;
    const dotHi = (cx) => (M.dia
      ? [[cx, dY], [cx + dS * 0.72, dY + dS * 0.60], [cx, dY + dS * 1.20], [cx - dS * 0.72, dY + dS * 0.60]]
      : rect(cx - dS / 2, dY, cx + dS / 2, dY + dS));
    put('i', s + w(80), [rect(w(40), 0, w(40) + s, X), dotHi(w(40) + s / 2)]);
    const jw = w(340), jSt = jw - w(40), jR = jw * 0.34, jRy = Math.abs(D) * 0.74, jCy = D + jRy;
    put('j', jw, [
      rect(jSt - s, jCy - t * 0.4, jSt, X),
      band(jSt - jR, jCy, jR, jRy, jR - s, jRy - t, 180, 360, N * 2, E),
      dotHi(jSt - s / 2),
    ]);
    // l — the text face gives it a tail, because a bare l is an I is a 1
    const lw = M.tailL ? w(330) : s + w(90);
    if (M.tailL) {
      const lR = lw * 0.52, lRy = X * 0.30;
      put('l', lw, [
        rect(w(40), lRy, w(40) + s, A),
        band(w(40) + s / 2 + lR, lRy, lR + s / 2, lRy, lR + s / 2 - s, lRy - t, 180, 292, N * 2, E),
      ]);
    } else {
      put('l', lw, [rect(w(45), 0, w(45) + s, A)]);
    }

    // f t — the two with crossbars; t's ascender is cut on the slant
    const fw = w(360), fr = w(215);
    put('f', fw, [
      rect(w(35), 0, w(35) + s, A - fr * 0.55),
      band(w(35) + s / 2 + fr * 0.55, A - fr * 0.55, fr * 0.55 + s / 2, fr * 0.55,
        fr * 0.55 + s / 2 - s, fr * 0.55 - t, 90, 188, N * 2, E),
      rect(0, X - t * 0.5, fw, X + t * 0.5),
    ]);
    const tw = w(385), tAsc = X * 1.44;
    put('t', tw, [
      [[w(30), X * 0.24], [w(30), tAsc - t * 0.55], [w(30) + s, tAsc], [w(30) + s, X * 0.24]],
      band(w(30) + s / 2 + X * 0.21, X * 0.24, X * 0.21 + s / 2, X * 0.24,
        X * 0.21 + s / 2 - s, X * 0.24 - t, 180, 294, N * 2, E),
      rect(0, X - t * 0.5, tw * 0.90, X + t * 0.5),
    ]);

    const sw = w(470);
    put('s', sw, sForm(0, 0, sw, X, s * 0.98));

    // v w x y z k — the diagonals, at x-height
    const vw = w(490), vcx = vw / 2, vtip = s * 0.52;
    const vlw = s * (Math.hypot(vcx, X) / X);
    put('v', vw, [[
      [0, X], [vcx - vtip, 0], [vcx + vtip, 0], [vw, X],
      [vw - vlw, X], [vcx, t * 1.3], [vlw, X],
    ]]);
    const wwd = w(730), q1 = wwd * 0.255, q2 = wwd * 0.745, wtip = s * 0.42, wtop = X * 0.90;
    const wlw = s * (Math.hypot(q1, X) / X);
    put('w', wwd, [[
      [0, X], [q1 - wtip, 0], [q1 + wtip, 0], [wwd / 2 - wtip * 0.75, wtop],
      [wwd / 2 + wtip * 0.75, wtop], [q2 - wtip, 0], [q2 + wtip, 0], [wwd, X],
      [wwd - wlw, X], [q2, t * 1.3], [wwd / 2, wtop - t * 2.3], [q1, t * 1.3], [wlw, X],
    ]]);
    const xw = w(495);
    const clipx = (p2) => cutX(cutX(p2, 0, false), xw, true);
    put('x', xw, [
      clipx(diagCutH(s * 0.45, X, xw - s * 0.45, 0, s * 0.94)),
      clipx(diagCutH(xw - s * 0.45, X, s * 0.45, 0, s * 0.94)),
    ]);
    // y — the left arm stops ON the descending stroke, so the tail is one
    // diagonal rather than a leg with a step in it
    const yw = w(490), yTail = [yw * 0.19, D], yTop = [yw - s * 0.5, X];
    const yMeet = (yy) => [yTop[0] + (yTail[0] - yTop[0]) * (yy - X) / (D - X), yy];
    put('y', yw, [
      cutX(cutY(diagCutH(yTop[0], yTop[1], yTail[0], yTail[1], s * 0.94), D, false), yw, true),
      cutX(seg([s * 0.5, X], yMeet(X * 0.24), s * 0.94), 0, false),
    ]);
    const zw = w(460);
    put('z', zw, [
      rect(0, X - t, zw, X), rect(0, 0, zw, t),
      cutY(cutY(diagCutV(zw - s * 0.30, X - t * 0.4, s * 0.30, t * 0.4, s * 0.94), X, true), 0, false),
    ]);
    const kw = w(500), kj = X * 0.45;
    put('k', kw, [
      rect(0, 0, s, A),
      cutY(diagCutV(s * 0.62, kj - t * 0.14, kw, X, s * 0.92), X, true),
      cutY(diagCutV(s * 0.62, kj + t * 0.14, kw, 0, s * 0.92), 0, false),
    ]);
  }

  return g;
}
