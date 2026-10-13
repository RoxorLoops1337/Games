// Character Studio hair: 21 styles. A style is a function (K) -> {back, mid, front, over, pre, fshadow, ties, top}:
//   back   behind the body (long hair, tails, buns)     mid    over the shoulders, before the head (hanging locks, braids)
//   front  the cap over the face (after the skull and face)   over  locks that hang IN FRONT of the near ear (after the ear)
//   pre    drawn on the skull before the face (a shaved side)   fshadow  the cap's cast shadow on the forehead (a polygon)
//   ties   where a scrunchie, ribbon or band goes   top  true when the style stands above the crown (buns, quiff), so a full hat hides it
// All the numbers are for the default head, in head space, and go through K.T. The ponytail and the mohawk are the owners' own shapes.
(function () {
  'use strict';
  const CC = window.CC, RJ = ART.rj, tk = ART.tk, C = RJ.C, LINE = RJ.LINE;
  const { clamp, lerp, TAU } = CC.u, col = CC.col;

  // ---- hairlines: near ear, up over the forehead, to the far temple ----
  const HL = {
    part: [[-45.5, 12], [-44.5, 3], [-42, -6], [-38, -14], [-32.5, -22.5], [-26, -29.5], [-18.5, -35.5], [-11, -40], [-4, -43.6], [1, -45.6], [3, -47.2], [4.4, -43.6, 1], [6.4, -48.4], [11, -50.6], [20, -52], [30, -50.6], [40, -46.8], [48.5, -40], [54.5, -29.5], [58, -17], [59, -8]],
    bangs: [[-45.5, 12], [-44.5, 2], [-41, -8], [-36, -16], [-26, -22], [-12, -25], [4, -27], [20, -27], [34, -26], [46, -22], [54, -16], [58, -10], [59, -8]],
    sweep: [[-45.5, 12], [-44, 0], [-39, -12], [-30, -20], [-18, -24], [-4, -28], [10, -34], [24, -42], [38, -46], [49, -40], [55, -28], [58, -16], [59, -8]],
    high: [[-45.5, 12], [-44.5, 2], [-41, -10], [-34, -24], [-22, -37], [-8, -45], [8, -49], [24, -49], [38, -45], [48, -38], [54, -28], [58, -16], [59, -8]],
    center: [[-45.5, 12], [-44.5, 3], [-41, -8], [-34, -18], [-24, -28], [-12, -37], [0, -45], [9, -52, 1], [20, -42], [33, -32], [45, -22], [54, -14], [59, -8]],
  };
  HL.auto = HL.part;
  // a ragged fringe: n sharp tips hanging below a hairline
  function jag(line, n, h) {
    const out = [line[0]];
    for (let i = 1; i <= n; i++) {
      const a = CC.along(line, (i - 1) / n), b = CC.along(line, i / n), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      out.push([m[0], m[1] + h * (0.8 + 0.4 * ((i * 7) % 3) / 2), 1]);
      if (i < n) out.push([b[0], b[1] - 1, 1]);
    }
    out.push(line[line.length - 1]);
    return out;
  }
  // soft bumps along a polyline: crisp cusps between rounded curls
  function bumps(pts, n, h) {
    const out = [pts[0]];
    for (let i = 1; i <= n; i++) {
      const a = CC.along(pts, (i - 1) / n), b = CC.along(pts, i / n), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const dx = m[0] + 1, dy = m[1] + 4, l = Math.hypot(dx, dy) || 1;
      out.push([m[0] + dx / l * h, m[1] + dy / l * h]);
      if (i < n) out.push([b[0], b[1], 1]);
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  // grow or shrink the volume of a ring about the dome centre
  const vol = (pts, v) => pts.map((p) => [-4 + (p[0] + 4) * v, -8 + (p[1] + 8) * v].concat(p.slice(2)));

  // ---- shared drawing ----
  function dyeOverlay(g, K, box) {
    const H = K.hair, w = box[2] - box[0], h = box[3] - box[1];
    if (H.dye === 'solid') return;
    g.save();
    if (H.dye === 'ombre') {
      const gr = g.createLinearGradient(0, box[1], 0, box[3]);
      gr.addColorStop(0, col.rgba(H.c2, 0)); gr.addColorStop(0.45, col.rgba(H.c2, 0)); gr.addColorStop(1, col.rgba(H.c2, 0.95));
      g.fillStyle = gr; g.fillRect(box[0] - 4, box[1] - 4, w + 8, h + 8);
    } else if (H.dye === 'roots') {
      const gr = g.createLinearGradient(0, box[1], 0, box[3]);
      gr.addColorStop(0, col.rgba('#1c0e08', 0.8)); gr.addColorStop(0.4, col.rgba('#1c0e08', 0)); gr.addColorStop(1, col.rgba('#1c0e08', 0));
      g.fillStyle = gr; g.fillRect(box[0] - 4, box[1] - 4, w + 8, h + 8);
    } else if (H.dye === 'split') {
      g.fillStyle = H.c2; g.globalAlpha = 0.97; g.fillRect(box[0] - 4, box[1] - 4, (4 - box[0]) + 4, h + 8);
      g.globalAlpha = 1; g.fillStyle = H.c2sh; g.globalAlpha = 0.5; g.fillRect(4, box[1] - 4, 0.0001, h + 8);
    }
    g.restore();
  }
  // flow lines: curves from the root edge toward the tip edge, so a cap reads as strands
  function flow(g, K, root, tip, n, o) {
    o = o || {};
    const H = K.hair, lines = [];
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, a = CC.along(root, u), b = CC.along(tip, clamp(u + (o.shift || 0), 0, 1)), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, bow = (o.bow === undefined ? 0.16 : o.bow) * l * (i % 2 ? 1 : -0.6);
      lines.push([a, [m[0] - dy / l * bow, m[1] + dx / l * bow], b]);
    }
    lines.forEach((l, i) => RJ.ink(g, l, { w: 1.4, color: H.sh, taper: 0.5, wobble: 0.02, alpha: 0.9, seed: i }));
    const short = lines.map((l) => { const a = l[0], b = l[2], t = 0.55, p = [lerp(a[0], b[0], t), lerp(a[1], b[1], t)], q = [lerp(a[0], b[0], t + 0.14), lerp(a[1], b[1], t + 0.14)]; return [p, q]; });
    RJ.hatch(g, short, { w: 1.1, color: H.streak, alpha: 0.9 });
    if (H.dye === 'streaks') {
      g.save(); g.lineCap = 'round'; g.strokeStyle = H.c2; g.lineWidth = 3.4; g.globalAlpha = 0.95;
      lines.forEach((l, i) => { if (i % 3 !== 1) return; g.beginPath(); g.moveTo(l[0][0], l[0][1]); g.quadraticCurveTo(l[1][0], l[1][1], l[2][0], l[2][1]); g.stroke(); });
      g.restore();
    }
  }
  // fill a hair shape with the house look: base colour, one hard shadow, a thin highlight, dye, strands, one brown outline
  function fill(g, K, pts, o) {
    o = o || {};
    const H = K.hair, box = tk.shapeBox(pts);
    RJ.cel(g, pts, H.base, { shadow: H.sh, line: LINE.main + 0.2, depth: o.depth === undefined ? 8 : o.depth, hi: o.noHi ? false : H.hi, hiW: 2, hiAlpha: 0.7, tension: o.tension === undefined ? 0.9 : o.tension, weightVar: 0.35, decor: (gg) => {
      dyeOverlay(gg, K, box);
      if (o.flow) flow(gg, K, o.flow[0], o.flow[1], o.flow[2] || 7, o.flowO);
      if (o.stubble) RJ.hatch(gg, o.stubble, { w: 1, color: H.streak, alpha: 0.7 });
      if (o.decor) o.decor(gg);
    } });
  }
  // a lock: a ribbon along a spine
  function lock(g, K, spine, wMax, o) {
    const H = K.hair;
    RJ.lock(g, spine, H.base, Object.assign({ wMax, w0: wMax * 0.8, w1: 0, tipPow: 1.6, shadow: H.sh, glossColor: H.hi, glossAlpha: 0.6, line: LINE.main, strands: 1 }, o));
  }

  // ---- ties: scrunchie, ribbon, band (head space, at x, y with an angle) ----
  CC.hairTie = function (g, K, t) {
    const c = K.c, kind = c.hairAcc === 'auto' ? 'scrunchie' : c.hairAcc;
    if (kind === 'none') return;
    const base = c.hairAccC, sh = col.shade(base, 0.04), hi = col.tint(base, 0.4), r = t.r || 16;
    g.save(); g.translate(t.x, t.y); g.rotate(t.a || 0);
    if (kind === 'scrunchie') {
      const top = [], bot = [];
      for (let i = 0; i <= 8; i++) { const s = -1 + i / 4, lx = s * r, ly = -3 * (1 - s * s), hw = 5.5 - 1.7 * s * s; top.push([lx, ly - hw]); bot.push([lx, ly + hw]); }
      RJ.cel(g, top.concat(bot.reverse()), base, { shadow: sh, line: LINE.main, depth: 3, hi, hiW: 1.4, tension: 0.9 });
      RJ.ink(g, [[r * 0.26, -4.4], [r * 0.33, 4]], { w: 1.3, color: sh, taper: 0.4, wobble: 0, alpha: 0.75 });
    } else if (kind === 'band') {
      RJ.cel(g, [[-r * 0.8, -3], [r * 0.8, -3], [r * 0.8, 3], [-r * 0.8, 3]], base, { shadow: sh, line: LINE.mid, depth: 1.5, tension: 0.3 });
    } else {                                                                   // ribbon bow
      const wing = (sx) => [[0, 0, 1], [sx * r * 0.9, -r * 0.7], [sx * r * 1.15, -r * 0.1], [sx * r * 0.95, r * 0.7], [0, 0, 1]];
      [1, -1].forEach((sx) => RJ.cel(g, wing(sx), base, { shadow: sh, line: LINE.main, depth: 3, hi, hiW: 1.3, tension: 0.7 }));
      RJ.cel(g, tk.circlePts(0, 0, r * 0.28, 10), sh, { shadow: false, line: LINE.mid });
    }
    g.restore();
  };

  // ---- the owners' mohawk (RoxorLoops): the crest, its flames, the shaved side and the mullet locks ----
  const MH = {
    HAIRLINE: [[-17, -50], [-22.5, -45], [-27.5, -39], [-31.5, -32], [-35, -25], [-38, -15], [-40.2, -6], [-41.3, 3], [-41.5, 12], [-40.5, 22]],
    MASS_LOW: [[47, -46], [44, -43.5], [40, -42.5], [36, -40.5], [32.5, -38.5], [31.2, -34], [30, -32.5], [28.5, -31.8, 1], [24, -31.8], [20, -32.7], [16.5, -34.2], [12, -35.4], [8, -37], [4, -40], [0, -43.5], [-3, -45.5], [-6, -48], [-10, -47.8], [-14, -48.4], [-17, -50], [-20, -51.2], [-26, -52.4], [-35, -51.6], [-44.5, -48.8], [-54, -41]],
    CREST_TOP: [[-56.5, -38.5], [-55.5, -45], [-52, -52], [-46, -58.5], [-39.5, -63.5], [-33, -67.5], [-28.5, -71.5], [-26.8, -76.5], [-27.2, -80.8], [-29.2, -83.4, 1], [-25.2, -83.6], [-22, -80.5], [-19.5, -76.5], [-17.3, -72.5, 1], [-18.6, -79], [-19.6, -85], [-18.8, -88.6, 1],
      [-14.3, -91.4], [-10.4, -92.5], [-6.3, -92.1], [-2.7, -89.6], [0.2, -86, 1], [1.8, -90.5], [0.6, -94.5], [-1.4, -97.8, 1], [3.7, -96.9], [8.9, -93.7], [14.8, -89], [19, -84], [20.8, -82, 1], [21.2, -91], [19.2, -95.5], [17.2, -98.5, 1],
      [24.3, -96.4], [29.5, -90.5], [33.3, -85], [35.6, -79.5], [36, -77, 1], [36.2, -83], [36.4, -88], [36.6, -89.8, 1], [41, -89.2], [45.6, -84.6], [49.2, -76], [50.8, -66], [50.2, -57], [48.5, -51]],
    SHADOW: [
      [[-56.5, -38.5], [-55.5, -45], [-52, -52], [-46, -58.5], [-39.5, -63.5], [-33, -67.5], [-28.5, -71.5], [-26, -62], [-32, -56], [-43, -50], [-52, -43]],
      [[-19.6, -85], [-18.8, -88.6], [-14.3, -91.4], [-16.5, -80], [-17.3, -72.5], [-18.6, -79]],
      [[0.2, -86], [1.8, -90.5], [0.6, -94.5], [-1.4, -97.8], [3.7, -96.9], [2, -88], [-2, -76], [-5, -64], [-3, -52], [-6, -58], [-8, -70], [-4, -80]],
      [[20.8, -82], [21.2, -91], [19.2, -95.5], [17.2, -98.5], [22, -96], [24, -86], [21, -72], [17, -60], [14, -68], [18, -78]],
      [[36, -77], [36.2, -83], [36.6, -89.8], [39, -88], [40, -80], [36, -66], [30, -58], [33, -70]]],
    LIGHT: [
      [[-14.3, -91.4], [-10.4, -92.5], [-6.3, -92.1], [-2.7, -89.6], [-5, -87.5], [-9.5, -89.5], [-14, -88.5]],
      [[3.7, -96.9], [8.9, -93.7], [14.8, -89], [13, -86], [8, -90], [3, -93.5]],
      [[24.3, -96.4], [29.5, -90.5], [33.3, -85], [31, -83], [27.5, -88], [23, -93.5]],
      [[41, -89.2], [45.6, -84.6], [49.2, -76], [47, -76], [44, -83], [40, -86]]],
    VALLEYS: [[[-17.3, -72.5], [-19.5, -65], [-20, -57], [-17.5, -51]], [[0.2, -86], [-2.5, -77], [-6.5, -68], [-8.5, -60], [-5.5, -53], [-3, -47.5]], [[20.8, -82], [14.5, -77], [9, -69], [6, -60], [7, -51], [11, -43], [14, -37.5]],
      [[36, -77], [30, -70], [25.5, -62], [22, -53], [20, -45], [21, -39]], [[-9, -75], [-12.5, -66], [-13, -58]], [[27, -86], [24, -72], [20, -62], [16, -56]], [[-1, -66], [3, -58], [4, -49]]],
    HAT: [[-9, -80, -8, -75], [-7, -82, -6, -77], [-5, -80, -4, -74], [3, -75, 5, -69], [6, -77, 8, -70], [9, -79, 11, -72], [17, -74, 18, -67], [20, -76, 22, -69], [24, -72, 25, -65], [31, -72, 32, -65], [34, -70, 35, -63], [46, -66, 47, -58], [-8, -66, -7, -60], [1, -60, 2, -54], [13, -60, 14, -54], [-38, -60, -33, -56]],
    MULLET: [{ sp: [[-44, 20], [-54, 31], [-55, 43], [-61, 53], [-69, 56]], w: 17 }, { sp: [[-40, 25], [-49, 37], [-46, 51], [-53, 63], [-61, 68]], w: 16 }, { sp: [[-34, 28], [-41, 40], [-36, 53], [-41, 64], [-49, 68]], w: 15 }, { sp: [[-27, 31], [-34, 42], [-28, 52], [-25, 60], [-18, 60]], w: 13 }],
  };
  const STRETCH = (p) => (p[1] < -62 ? [p[0], -62 + (p[1] + 62) * 1.06].concat(p.slice(2)) : p);
  function mohawkFront(g, K) {
    const H = K.hair, T = K.TT, st = (a) => T(a.map(STRETCH)), outline = st(MH.CREST_TOP.concat(MH.MASS_LOW));
    RJ.cel(g, outline, H.base, { shadow: false, line: LINE.main, tension: 0.7, weightVar: 0.4, decor: (gg) => {
      dyeOverlay(gg, K, tk.shapeBox(outline));
      MH.SHADOW.forEach((f, i) => RJ.fillPts(gg, st(f), H.sh, i === 0 ? 0.95 : 0.55));
      MH.LIGHT.forEach((f) => RJ.fillPts(gg, st(f), H.hi, 0.7));
      MH.VALLEYS.forEach((v, i) => RJ.ink(gg, st(v), { w: LINE.main * (i < 4 ? 1.2 : 0.85), color: C.ink, taper: 0.4, pressure: 'head', wobble: 0.03, seed: i }));
      RJ.hatch(gg, MH.HAT.map((h) => T([STRETCH([h[0], h[1]]), STRETCH([h[2], h[3]])])), { w: 1.15, color: H.streak, alpha: 0.85 });
    } });
    RJ.ink(g, T(MH.MASS_LOW), { w: LINE.main + 0.2, color: C.ink, taper: 0.1, pressure: 'flat', wobble: 0.03 });
  }

  // ---- the owners' high ponytail (Jasmin), in her card coordinates mirrored to our facing ----
  const MX = (list) => list.map((p) => [-p[0] - 4, p[1]].concat(p.slice(2)));
  const TAIL = MX([[20, -78], [28, -85], [38, -92], [50, -96], [63, -95], [75, -90], [86, -80], [93, -66], [97, -48], [99, -28], [98, -6], [96, 16], [93, 34], [89, 44], [84, 53, 1], [79, 59], [74, 69], [70, 78], [68, 86], [71, 90], [77, 89], [82, 84, 1],
    [80, 92], [75, 97], [67, 99], [58, 96], [49, 91], [40, 83], [33, 72], [30, 60], [33, 47], [42, 35], [52, 22], [58, 6], [63, -14], [56, -36], [44, -56], [34, -64]]);
  const TAIL_SH = MX([[46, -62], [58, -38], [66, -14], [64, 8], [58, 24], [48, 38], [38, 50], [33, 62], [35, 74], [42, 85], [52, 93], [64, 99], [68, 92], [56, 84], [47, 74], [46, 62], [52, 50], [60, 38], [68, 22], [76, 2], [78, -22], [72, -46], [62, -68], [50, -78]]);
  const TAIL_LINES = [[[34, -86], [48, -90], [63, -85], [76, -70]], [[40, -74], [54, -82], [68, -74], [76, -54]], [[78, -62], [86, -42], [88, -12], [85, 18], [79, 40], [75, 52]], [[72, -34], [78, -6], [76, 26], [68, 50], [58, 70], [52, 86]], [[90, -14], [91, 12], [88, 32]], [[64, 70], [63, 82], [66, 92], [72, 95]]];
  const TAIL_LIGHT = [[[40, -86], [54, -92], [68, -89], [80, -79], [87, -66], [83, -66], [75, -76], [64, -82], [52, -85], [42, -81]], [[88, 38], [84, 52], [78, 66], [74, 80], [73, 87], [76, 84], [80, 70], [86, 56], [90, 42]]];
  const TAIL_HATCH = [[[52, -92], [58, -87]], [[58, -93], [64, -88]], [[64, -91], [70, -85]], [[86, -44], [88, -32]], [[88, -30], [90, -16]], [[80, 28], [81, 40]], [[84, 22], [85, 32]], [[66, 58], [67, 70]], [[71, 60], [72, 72]], [[72, -66], [76, -58]]];
  function tailHigh(g, K, S) {
    const H = K.hair, T = K.TT;
    g.save();
    g.translate(-39, -72); g.rotate(0.09 + S.P.hairSwing * 0.05); g.translate(39, 72);
    const outline = T(TAIL);
    RJ.cel(g, outline, H.base, { shadow: false, line: LINE.main + 0.2, tension: 0.85, weightVar: 0.3, decor: (gg) => {
      dyeOverlay(gg, K, tk.shapeBox(outline));
      RJ.fillPts(gg, T(TAIL_SH), H.sh, 0.55);
      TAIL_LIGHT.forEach((l) => RJ.fillPts(gg, T(MX(l)), H.hi, 0.75));
      TAIL_LINES.forEach((l, i) => RJ.ink(gg, T(MX(l)), { w: 1.5, color: H.sh, taper: 0.45, wobble: 0.03, alpha: 0.95, seed: i }));
      RJ.hatch(gg, TAIL_HATCH.map((h) => T(MX(h))), { w: 1.15, color: H.streak, alpha: 0.95 });
      if (H.dye === 'streaks') { gg.save(); gg.lineCap = 'round'; gg.strokeStyle = H.c2; gg.lineWidth = 3.6; TAIL_LINES.forEach((l, i) => { if (i % 2) return; const p = T(MX(l)); gg.beginPath(); p.forEach((q, j) => (j ? gg.lineTo(q[0], q[1]) : gg.moveTo(q[0], q[1]))); gg.stroke(); }); gg.restore(); }
    } });
    g.restore();
  }

  // ---- generic builders ----
  // a cap: the ring over the crown and a hairline, drawn with strands
  function capDef(K, ringD, hlName, o) {
    o = o || {};
    const hn = K.c.hairline !== 'auto' ? K.c.hairline : hlName, outer = vol(o.outer || CC.ring(ringD, o.up), K.c.hairVol), hl = HL[hn] || HL.part, sh = outer.concat(hl.filter((p) => !(o.noNotch && p[2])));
    const poly = K.TT(outer.concat(hl));
    return {
      fshadow: K.TT(sh),
      front(g) { fill(g, K, poly, { flow: [K.TT(hl), K.TT(outer), o.strands || 8], flowO: o.flowO, depth: o.depth, stubble: o.stubble, noHi: o.noHi }); if (o.after) o.after(g); },
      outer, hl,
    };
  }
  // hair that hangs behind the head: a mass with a rounded hem; len = bottom y (head space), wav = wave amplitude, wd = width
  function hangMass(K, len, wav, wd) {
    const w = (wd || 150) / 2, top = -34, pts = [], n = 8;
    const wv = (u) => (wav ? Math.sin(u * Math.PI * 3.2) * wav : 0);
    for (let i = 0; i <= n; i++) { const u = i / n, y = lerp(top, len - 14, u), e = w * (0.86 + 0.14 * Math.min(1, u * 4)); pts.push([-4 - e + wv(u), y]); }
    pts.push([-4 - w + 6, len + 2], [-4 - w * 0.55, len + 8], [-4, len + 10], [-4 + w * 0.55, len + 8], [-4 + w - 6, len + 2]);
    for (let i = n; i >= 0; i--) { const u = i / n, y = lerp(top, len - 14, u), e = w * (0.86 + 0.14 * Math.min(1, u * 4)); pts.push([-4 + e + wv(u + 0.15), y]); }
    return K.TT(pts);
  }
  // locks that fall over the shoulders in front: ribbons, near and far side
  function shoulderLocks(g, K, S, len, wav, w) {
    const sw = S.P.hairSwing * 4;
    [[-52, 4, -1], [54, 8, 1]].forEach((s, i) => {
      const x = s[0], dir = s[2], end = [x + dir * (i ? -4 : -2), len];
      const sp = wav ? CC.waveSpine([x, s[1]], end, 3, wav * dir, 10) : [[x, s[1]], [x + dir * 8, (s[1] + len) / 2], end];
      lock(g, K, K.TT(sp.map((p, j) => [p[0] + sw * (j / sp.length) * dir * 0.3, p[1]])), w * (i ? 0.8 : 1), { w1: w * 0.25, tipPow: 3, bend: 0 });
    });
  }

  const STY = {};

  STY.bald = (K) => ({ fshadow: null, front() {}, outer: CC.ring(0), hl: HL.high });
  STY.buzz = (K) => {
    const d = capDef(K, 2.6, 'high', { depth: 3, strands: 0, noHi: true, stubble: stubbleTicks(K) });
    return d;
  };
  function stubbleTicks() { const a = []; for (let i = 0; i < 30; i++) { const x = -50 + ((i * 37) % 100), y = -64 + ((i * 53) % 34); a.push([x, y, x + 2, y + 2.5]); } return a; }
  STY.crop = (K) => {
    const ring = CC.ring(9, 0), outer = CC.teeth(ring, 8, 9, 0.2), hl = jag(HL.bangs, 6, 9);
    const poly = K.TT(outer.concat(hl));
    return { outer, hl, fshadow: K.TT(ring.concat(HL.bangs)), front(g) { fill(g, K, poly, { flow: [K.TT(HL.bangs), K.TT(ring), 7] }); } };
  };
  STY.sidepart = (K) => capDef(K, 13, 'sweep', { up: 10, strands: 9, flowO: { shift: -0.08 }, after(g) { RJ.ink(g, K.TT([[40, -46], [30, -62], [14, -74]]), { w: 1.6, color: C.ink, taper: 0.5, wobble: 0.02 }); } });
  STY.quiff = (K) => {
    const ring = CC.ring(10, 18).map((p) => [p[0] + (p[1] < -40 ? (-p[1] - 40) * 0.4 : 0), p[1]]);
    const d = capDef(K, 0, 'sweep', { outer: ring, strands: 9, flowO: { shift: 0.1, bow: 0.22 } });
    d.top = true; return d;
  };
  STY.mohawk = (K) => ({
    top: true, fshadow: null,
    pre(g, S) {                                                                  // the shaved stubble side on the skull
      const f = tk.flatten(MH.HAIRLINE, { closed: false, step: 2.5 }), pts = [];
      for (let i = 0; i < f.length; i += 2) pts.push([f[i], f[i + 1]]);
      const stub = col.mix(K.skin, '#7a4e38', 0.38), stubDk = col.mix(K.skin, '#5a3626', 0.5);
      g.save(); g.fillStyle = stub; g.beginPath(); tk.trace(g, K.TT(pts.concat([[-72, 30], [-72, -84], [-17, -84]]))); g.fill();
      g.globalAlpha = 0.7; g.fillStyle = stubDk; g.beginPath(); g.rect(-100, -100, 200, 200); tk.trace(g, K.skull, RJ.lx(4), -7); g.fill('evenodd'); g.globalAlpha = 1;
      RJ.hatch(g, K.TT([[-52, -18], [-50, -4], [-53, 8], [-47, -28], [-55, -30], [-47, 12], [-52, 17], [-45, 2]].map((p) => p)).map((p, i) => [p[0], p[1], p[0] + 3, p[1] + 3]), { w: 0.8, color: stubDk, alpha: 0.5 });
      g.restore();
    },
    front(g) { mohawkFront(g, K); RJ.ink(g, K.TT(MH.HAIRLINE), { w: LINE.main, color: C.ink, taper: 0.15, pressure: 'flat', wobble: 0.03 }); },
    mid(g, S) { MH.MULLET.forEach((m, i) => lock(g, K, K.TT(m.sp), m.w, { w0: m.w * 0.7, w1: 0, tipPow: 1.5, bend: S.P.hairSwing * 0.5 * (1 + i * 0.3), shadow: col.shade(K.hair.sh, 0.02) })); },
  });
  STY.spiky = (K) => {
    const ring = CC.ring(8, 4), outer = CC.teeth(ring, 6, 24, 0.35), hl = jag(HL.bangs, 5, 11);
    return { top: true, outer, hl, fshadow: K.TT(ring.concat(HL.bangs)), front(g) { fill(g, K, K.TT(outer.concat(hl)), { flow: [K.TT(HL.bangs), K.TT(ring), 8], flowO: { bow: 0.05 } }); } };
  };
  STY.pixie = (K) => {
    const ring = CC.ring(8, 2), outer = CC.teeth(ring, 5, 7, 0.2), hl = jag(HL.sweep, 4, 8), poly = K.TT(outer.concat(hl));
    const tuft = K.TT([[-46, 2], [-56, 6], [-62, 22, 1], [-52, 20], [-44, 12]]);
    return { outer, hl, fshadow: K.TT(ring.concat(HL.sweep)), front(g) { fill(g, K, poly, { flow: [K.TT(HL.sweep), K.TT(ring), 8], flowO: { shift: -0.1 } }); }, over(g) { fill(g, K, tuft, { depth: 3, noHi: true }); } };
  };
  STY.bob = (K) => {
    const d = capDef(K, 13, 'bangs', { strands: 8 });
    const back = hangMass(K, 68, 0, 138);
    const near = K.TT([[-47, -6], [-60, -2], [-68, 20], [-66, 50], [-58, 66], [-46, 68], [-38, 58], [-40, 40], [-43, 20]]);
    const far = K.TT([[52, -8], [62, 4], [66, 26], [62, 52], [52, 62], [44, 56], [50, 36], [54, 14]]);
    return Object.assign(d, {
      back(g) { fill(g, K, back, { flow: [K.TT([[-60, -30], [60, -30]]), K.TT([[-60, 70], [60, 70]]), 8], flowO: { bow: 0.03 } }); },
      over(g) { fill(g, K, near, { depth: 5, noHi: true }); fill(g, K, far, { depth: 5, noHi: true }); },
    });
  };
  STY.long = (K) => {
    const d = capDef(K, 14, 'part', { strands: 9 });
    const back = hangMass(K, 150, 0, 140);
    return Object.assign(d, {
      back(g) { fill(g, K, back, { flow: [K.TT([[-66, -30], [60, -30]]), K.TT([[-70, 150], [66, 150]]), 9], flowO: { bow: 0.02 } }); },
      mid(g, S) { shoulderLocks(g, K, S, 96, 0, 22); },
    });
  };
  STY.wavy = (K) => {
    const d = capDef(K, 15, 'center', { strands: 9 });
    const back = hangMass(K, 150, 9, 142);
    return Object.assign(d, {
      back(g) { fill(g, K, back, { flow: [K.TT([[-66, -30], [60, -30]]), K.TT([[-70, 150], [66, 150]]), 9], flowO: { bow: 0.06 } }); },
      mid(g, S) { shoulderLocks(g, K, S, 104, 7, 24); },
    });
  };
  STY.emo = (K) => {
    const d = capDef(K, 13, 'sweep', { strands: 8 });
    const fr = K.TT([[56, -46], [36, -44], [14, -36], [-6, -24], [-24, -8], [-40, 12], [-48, 22], [-54, 16], [-52, 0], [-50, -20], [-40, -44], [-10, -58], [30, -62]]);
    const back = hangMass(K, 76, 0, 138);
    return Object.assign(d, {
      back(g) { fill(g, K, back, { flow: [K.TT([[-60, -30], [60, -30]]), K.TT([[-60, 80], [60, 80]]), 8], flowO: { bow: 0.03 } }); },
      over(g) { fill(g, K, fr, { flow: [K.TT([[48, -44], [20, -36], [-10, -20]]), K.TT([[-48, 30], [-30, 20], [-10, 0]]), 6], depth: 6 }); },
    });
  };
  STY.pony_high = (K) => {
    const ring = [[59, -10], [60, -24], [57, -38], [52, -50], [44, -60], [34, -67], [22, -72], [8, -76], [-7, -77], [-22, -76], [-36, -70], [-52, -60], [-64, -44], [-69, -24], [-69.5, -4], [-67.5, 12], [-61, 24]].map((p) => p);
    const outer = vol(ring, K.c.hairVol), hl = HL.part, poly = K.TT(outer.concat(hl));
    return {
      outer, hl, fshadow: K.TT(outer.concat(hl.filter((p) => !p[2]))),
      ties: [{ x: -39, y: -73, a: 0.46 - 3.05, r: 17 }],
      back(g, S) { tailHigh(g, K, S); },
      front(g) { fill(g, K, poly, { depth: 0, noHi: false, flow: [K.TT(hl), K.TT(outer), 8], flowO: { shift: 0.1 } }); },
    };
  };
  STY.pony_low = (K) => {
    const d = capDef(K, 13, 'part', { strands: 8 });
    return Object.assign(d, {
      ties: [{ x: -60, y: 22, a: 1.1, r: 13 }],
      back(g, S) {
        g.save(); g.translate(-58, 22); g.rotate(S.P.hairSwing * 0.06); g.translate(58, -22);
        const sp = CC.waveSpine([-58, 22], [-72, 128], 2.4, 7, 12), poly = K.TT(CC.strip(sp, 28, 10, 14));
        fill(g, K, poly, { flow: [K.TT(sp.slice(0, 5)), K.TT(sp.slice(5)), 5], flowO: { bow: 0.02 } });
        g.restore();
      },
    });
  };
  STY.twin = (K) => {
    const d = capDef(K, 13, 'center', { strands: 8 });
    return Object.assign(d, {
      ties: [{ x: -58, y: -6, a: 1.9, r: 12 }, { x: 58, y: -4, a: -1.9, r: 11 }],
      back(g, S) {
        [[[-58, -6], [-86, 22], [-92, 70], [-84, 124], 1], [[58, -4], [84, 24], [92, 70], [84, 124], -1]].forEach((t, i) => {
          const dir = t[4], sw = S.P.hairSwing * 5 * dir;
          const sp = [t[0], [t[1][0] + sw * 0.3, t[1][1]], [t[2][0] + sw * 0.6, t[2][1]], [t[3][0] + sw, t[3][1]]];
          lock(g, K, K.TT(sp), i ? 26 : 30, { w0: i ? 22 : 26, w1: 0, tipPow: 2.2 });
        });
      },
    });
  };
  STY.buns = (K) => {
    const d = capDef(K, 13, 'center', { strands: 8 });
    const bun = (x, y, r) => K.TT(CC.cloud(x, y, r, r * 0.96, 9, 0.1, 0.3));
    return Object.assign(d, {
      top: true,
      ties: [{ x: -30, y: -62, a: -0.5, r: 13 }, { x: 40, y: -60, a: 0.5, r: 12 }],
      back(g) { fill(g, K, bun(-34, -80, 21), { depth: 5, tension: 0.9 }); fill(g, K, bun(44, -78, 19), { depth: 5, tension: 0.9 }); },
    });
  };
  STY.topknot = (K) => {
    const d = capDef(K, 8, 'high', { strands: 8 });
    return Object.assign(d, {
      top: true, ties: [{ x: 3, y: -70, a: 0, r: 14 }],
      back(g) { fill(g, K, K.TT(CC.cloud(3, -92, 22, 21, 9, 0.1, 0.1)), { depth: 5, tension: 0.9 }); },
    });
  };
  STY.braids = (K) => {
    const d = capDef(K, 13, 'center', { strands: 8 });
    function braid(g, sp, w) {
      const H = K.hair, n = 9;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1), p = CC.along(sp, u), q = CC.along(sp, Math.min(1, u + 0.04)), a = Math.atan2(q[1] - p[1], q[0] - p[0]) + (i % 2 ? 0.5 : -0.5), r = w * (1 - u * 0.4) / 2;
        const e = K.T(p);
        RJ.cel(g, tk.ellipsePts(e[0], e[1], r * 1.25, r * 0.95, 12, a), i % 2 ? H.base : col.shade(H.base, -0.02), { shadow: H.sh, line: LINE.main, depth: 3, hi: H.hi, hiW: 1.4, tension: 0.9 });
      }
    }
    return Object.assign(d, {
      ties: [{ x: -62, y: 60, a: 0.2, r: 10 }, { x: 62, y: 62, a: -0.2, r: 10 }],
      mid(g, S) { const sw = S.P.hairSwing * 4; braid(g, [[-56, 6], [-70, 40], [-64 + sw, 84], [-70 + sw, 124]], 24); braid(g, [[56, 10], [68, 46], [62 + sw, 88], [68 + sw, 124]], 22); },
    });
  };
  STY.curls = (K) => {
    const ring = CC.ring(8, 0), outer = bumps(ring, 8, 12), hl = HL.bangs, poly = K.TT(outer.concat(hl));
    return { outer, hl, fshadow: K.TT(ring.concat(hl)), front(g) { fill(g, K, poly, { flow: [K.TT(hl), K.TT(ring), 7], flowO: { bow: 0.3 }, depth: 6 }); },
      back(g) { fill(g, K, K.TT(CC.cloud(-4, -22, 74, 64, 12, 0.13, 0.2)), { depth: 6, tension: 0.9 }); } };
  };
  STY.afro = (K) => {
    const ring = CC.ring(12, 0), outer = bumps(ring, 7, 12), hl = HL.high, poly = K.TT(outer.concat(hl));
    return { outer, hl, fshadow: K.TT(ring.concat(hl)), front(g) { fill(g, K, poly, { flow: [K.TT(hl), K.TT(ring), 7], flowO: { bow: 0.3 }, depth: 6 }); },
      back(g) { fill(g, K, K.TT(CC.cloud(-4, -22, 96, 88, 13, 0.1, 0.1)), { depth: 7, tension: 0.9 }); } };
  };
  STY.mullet = (K) => {
    const ring = CC.ring(8, 4), outer = CC.teeth(ring, 6, 11, 0.25), hl = jag(HL.bangs, 5, 8);
    return { outer, hl, fshadow: K.TT(ring.concat(HL.bangs)), front(g) { fill(g, K, K.TT(outer.concat(hl)), { flow: [K.TT(HL.bangs), K.TT(ring), 7], flowO: { bow: 0.05 } }); },
      mid(g, S) { MH.MULLET.forEach((m, i) => lock(g, K, K.TT(m.sp), m.w, { w0: m.w * 0.7, w1: 0, tipPow: 1.5, bend: S.P.hairSwing * 0.5 * (1 + i * 0.3), shadow: col.shade(K.hair.sh, 0.02) })); } };
  };

  CC.hairStyle = function (K) {
    const f = STY[K.c.hair] || STY.bald, d = f(K);
    // the chosen hairline replaces the style's own when it is not 'auto' and the style is a plain cap
    return d;
  };
  CC.HAIRLINES = HL;
  // a cap for a hat to hide the volume: the plain fringe under a brim
  CC.hairUnderHat = function (K) {
    const name = K.c.hairline === 'auto' ? 'bangs' : K.c.hairline, d = capDef(K, 9, name, { strands: 6 });
    return d;
  };
})();
