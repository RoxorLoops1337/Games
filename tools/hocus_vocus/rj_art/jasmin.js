// jasmin.js: Jasmin (id 'jasmin', accent PINK) and her unicorn onesie skin ('jasmin_unicorn'). The attack hero, an angelic soft singer (not a belter).
// Built on kit.js (RJ.rig). Both skins share ONE face, built on an explicit grid (see FG below) and drawn by this file's own face code (jFace).
// Identity: glossy brown hair in a HIGH PONYTAIL with a pink scrunchie and a pink hair clip, big warm brown eyes with a pink flower sparkle in each iris, long
// lashes, a hoop earring, a pearl necklace with a pink heart, a pink sleeveless dress with a fitted waist and pleated flared skirt, white socks, white
// and pink sneakers, a black mic with a pink band, a happy open smile. Faces slightly to the viewer's right (the card is mirrored).
(function () {
  'use strict';
  const tk = ART.tk, C = RJ.C, LINE = RJ.LINE;
  const TAU = Math.PI * 2, PI = Math.PI;
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : (d === undefined ? 0 : d));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };

  const J = {
    hair: '#5c321b', hairSh: '#3a1d0f', hairLt: '#85502d', streak: '#bd7246',
    dress: '#fd9bb4', dressSh: '#ea7897', dressLt: '#ffbccb', pleat: '#f58aa6',
    pink: '#ff7fb2', pinkDk: '#d9457f', scrunchie: '#ff9bc0',
    white: '#fffaf4', whiteSh: '#ead9d6', pearl: '#fffdf8', pearlSh: '#d9cfd0',
    flower: '#ff8fb9', flowerCore: '#ffd9e6',
    silver: '#cfd5de',
    brow: '#5a3321', lash: '#2d170f',
  };

  // ==================================================================================================================================
  // THE FACE GRID (head space: origin = head centre, y up is negative, the face turned to +x by the card's slight 3/4 view)
  // ==================================================================================================================================
  //   face width     the skull is x -62 .. 59.5 (121.5 wide, about 4.2 mean eye widths) and y -58 .. 60.3 (a soft rounded jaw that tapers to a small round chin whose lowest point is ON the centre line)
  //   centre line    x = cx = 9: nose, mouth and chin sit exactly on it. The 3/4 turn moves it about +10 from the skull centre (x -1).
  //   eye line       y = eyeY = 7: the vertical middle of the face oval (hairline about -50 at the centre line, chin 60.3, middle 5; the iris sits on the line)
  //   eyes           both 31 high on the same line. Near eye 31 wide, far eye 27.3 (88%, the card's only 3/4 concession). One eye width (29, the mean of the two)
  //                  between the inner corners, split evenly by the centre line: inner corners at cx -+ 14.5, outer corners at cx - 45.5 and cx + 41.7.
  //   brows          mirrored arches 31 above the eye line (lifted), inner ends at cx -+ 15.5, 84% of their eye's width
  //   nose           tip y = eyeY + 17, mouth line y = eyeY + 30 (23.5 wide), blushes y = eyeY + 21 centred under each eye
  //   ears           near ear centre y = 8, r 15.5: the top level with the upper lid line (y -9), the lobe level with the nose tip (y 23); the far ear mirrors it, smaller
  const FG = (() => {
    const cx = 9, eyeY = 7, eyeH = 31, wN = 31, wF = 27.3, gap = 29;
    const nearX = cx - gap / 2 - wN / 2, farX = cx + gap / 2 + wF / 2;
    return {
      cx, eyeY, eyeH, wN, wF, gap,
      near: { x: nearX, y: eyeY, w: wN, h: eyeH }, far: { x: farX, y: eyeY, w: wF, h: eyeH },
      browWn: 26, browWf: 23, browY: eyeY - 31, noseY: eyeY + 17, mouthY: eyeY + 30, mouthW: 23.5, blushY: eyeY + 21,
      earY: 8, earR: 15.5,
    };
  })();

  // ---- the skull: a smooth outline, soft rounded jaw with a gentle taper, the small chin at x = cx ----
  const SKULL = [[-2, -58], [30, -54], [51, -36], [59.5, -8], [59, 11], [53.5, 28], [42, 43], [27, 55.2], [9, 60.4], [-9, 56.4], [-24, 51.5], [-38, 41], [-52, 25], [-60.5, 6], [-62, -10], [-58, -33], [-40, -52]];

  // ---- hair in head space ----
  // Measured on the owners' card, which draws her facing LEFT: MX mirrors card coordinates (card x, y in head units) to our right-facing figure.
  const MX = (list) => list.map((p) => [-p[0] - 4, p[1]]);
  // the hair cap: a ring around the forehead dome. Outer edge = the glossy crown, inner edge = the hairline: a smooth arc with a tiny part and a downward
  // hair tip at x = 4 (a little right of the centre line toward the near side, "centre-ish"), the side bangs sweeping down to the near ear; on the far side the
  // hair ends high at the temple.
  const CAP_OUTER = [[59, -10], [60, -24], [57, -38], [52, -50], [44, -60], [34, -67], [22, -72], [8, -76], [-7, -77], [-22, -76], [-36, -70], [-52, -60], [-64, -44], [-69, -24], [-69.5, -4], [-67.5, 12], [-61, 24]];
  const HAIRLINE = [[-45.5, 12], [-44.5, 3], [-42, -6], [-38, -14], [-32.5, -22.5], [-26, -29.5], [-18.5, -35.5], [-11, -40], [-4, -43.6], [1, -45.6], [3, -47.2], [4.4, -43.6, 1], [6.4, -48.4], [11, -50.6], [20, -52], [30, -50.6], [40, -46.8], [48.5, -40], [54.5, -29.5], [58, -17], [59, -8]];
  const CAP = CAP_OUTER.concat(HAIRLINE);
  const CAP_SOFT = CAP_OUTER.concat(HAIRLINE.filter((p, i) => i < 10 || i > 12));            // the same ring without the part tip, for the cast shadow on the forehead

  function capDecor(g) {
    // lit band along the crown from the part toward the ponytail, then long dark flow lines and light hatch streaks
    RJ.fillPts(g, [[34, -66], [14, -74], [-8, -75], [-30, -70], [-40, -62], [-28, -62], [-8, -67], [14, -65], [30, -58]], J.hairLt, 0.8);
    const lines = [[[-3, -44], [10, -58], [30, -69], [48, -72]], [[12, -47], [28, -58], [46, -63]], [[28, -50], [42, -56], [54, -52]], [[-50, -46], [-42, -62], [-28, -72]], [[-36, -52], [-26, -66]], [[-20, -50], [-12, -64], [0, -72]], [[40, -30], [52, -34], [60, -24]]];
    lines.forEach((l, i) => RJ.ink(g, MX(l), { w: 1.4, color: J.hairSh, taper: 0.5, wobble: 0.02, alpha: 0.95, seed: i }));
    const hatch = [[[-14, -70], [-8, -62]], [[-10, -72], [-4, -64]], [[-4, -73], [2, -66]], [[4, -70], [9, -62]], [[10, -66], [14, -59]], [[28, -62], [33, -54]], [[32, -58], [37, -50]], [[-42, -64], [-37, -56]], [[-50, -56], [-46, -48]], [[40, -50], [43, -44]]];
    hatch.forEach((h, i) => RJ.ink(g, MX(h), { w: 1.2, color: J.streak, taper: 0.5, wobble: 0, alpha: 0.95, seed: i }));
  }

  // the ponytail: one chunky mass that rises from the scrunchie on the crown (card (36,-72)), arches up and back, then cascades down behind her and ends in
  // an S-curl. Silhouette measured on the card; the inner edge runs behind the head. Card coordinates, mirrored by MX.
  const TAIL_UNM = [[20, -78], [28, -85], [38, -92], [50, -96], [63, -95], [75, -90], [86, -80], [93, -66], [97, -48], [99, -28], [98, -6], [96, 16], [93, 34], [89, 44], [84, 53, 1], [79, 59], [74, 69], [70, 78], [68, 86], [71, 90], [77, 89], [82, 84, 1],
    [80, 92], [75, 97], [67, 99], [58, 96], [49, 91], [40, 83], [33, 72], [30, 60], [33, 47], [42, 35], [52, 22], [58, 6], [63, -14], [56, -36], [44, -56], [34, -64]];
  const TAIL_OUTLINE = MX(TAIL_UNM);
  // the one hard shadow: a band along the side that faces the head (where the hair tucks behind the skull)
  const TAIL_SHADOW = MX([[46, -62], [58, -38], [66, -14], [64, 8], [58, 24], [48, 38], [38, 50], [33, 62], [35, 74], [42, 85], [52, 93], [64, 99], [68, 92], [56, 84], [47, 74], [46, 62], [52, 50], [60, 38], [68, 22], [76, 2], [78, -22], [72, -46], [62, -68], [50, -78]]);
  const TAIL_LINES = [[[34, -86], [48, -90], [63, -85], [76, -70]], [[40, -74], [54, -82], [68, -74], [76, -54]], [[78, -62], [86, -42], [88, -12], [85, 18], [79, 40], [75, 52]], [[72, -34], [78, -6], [76, 26], [68, 50], [58, 70], [52, 86]], [[90, -14], [91, 12], [88, 32]], [[64, 70], [63, 82], [66, 92], [72, 95]]];
  const TAIL_HATCH = [[[52, -92], [58, -87]], [[58, -93], [64, -88]], [[64, -91], [70, -85]], [[86, -44], [88, -32]], [[88, -30], [90, -16]], [[80, 28], [81, 40]], [[84, 22], [85, 32]], [[66, 58], [67, 70]], [[71, 60], [72, 72]], [[72, -66], [76, -58]]];
  // two light bands: along the crown of the arc and on the curl at the tip (the lit side, upper right)
  const TAIL_LIGHT = [[[40, -86], [54, -92], [68, -89], [80, -79], [87, -66], [83, -66], [75, -76], [64, -82], [52, -85], [42, -81]], [[88, 38], [84, 52], [78, 66], [74, 80], [73, 87], [76, 84], [80, 70], [86, 56], [90, 42]]];
  function ponytail(g, S) {
    g.save();
    g.translate(-39, -72); g.rotate(0.09 + S.P.hairSwing * 0.05); g.translate(39, 72);        // a gentle sway of the whole tail about the scrunchie
    RJ.cel(g, TAIL_OUTLINE, J.hair, { shadow: false, line: LINE.main + 0.2, tension: 0.85, weightVar: 0.3, decor: (gg) => {
      RJ.fillPts(gg, TAIL_SHADOW, J.hairSh, 0.55);
      TAIL_LIGHT.forEach((l) => RJ.fillPts(gg, MX(l), J.hairLt, 0.75));
      TAIL_LINES.forEach((l, i) => RJ.ink(gg, MX(l), { w: 1.5, color: J.hairSh, taper: 0.45, wobble: 0.03, alpha: 0.95, seed: i }));
      TAIL_HATCH.forEach((h, i) => RJ.ink(gg, MX(h), { w: 1.3, color: J.streak, taper: 0.5, wobble: 0, alpha: 0.95, seed: i }));
    } });
    g.restore();
  }

  function scrunchie(g, pal) {
    // one smooth band wrapped round the root of the tail, as on the card: a curved strip across the root (about (22,-82) to (49,-67) in card coordinates), fuller
    // in the middle, with one outline, a lighter sheen along its top and a single darker fold line
    const P = pal || { base: J.scrunchie, shade: J.pink, hi: '#ffd3e2', fold: J.pinkDk };
    const cx = 35.5, cy = -75, an = 0.46, ca = Math.cos(an), sa = Math.sin(an), top = [], bot = [];
    for (let i = 0; i <= 8; i++) {
      const s = -1 + i / 4, lx = s * 16, ly = -3 * (1 - s * s), hw = 5.5 - 1.7 * s * s;
      top.push([cx + lx * ca - (ly - hw) * sa, cy + lx * sa + (ly - hw) * ca]);
      bot.push([cx + lx * ca - (ly + hw) * sa, cy + lx * sa + (ly + hw) * ca]);
    }
    RJ.cel(g, MX(top.concat(bot.reverse())), P.base, { shadow: P.shade, line: LINE.main, depth: 3, hi: P.hi, hiW: 1.4, tension: 0.9 });
    RJ.ink(g, MX([[cx + 4.2 * ca + 4.5 * sa, cy + 4.2 * sa - 4.4 * ca], [cx + 5.2 * ca - 4 * sa, cy + 5.2 * sa + 4.1 * ca]]), { w: 1.3, color: P.fold, taper: 0.4, wobble: 0, alpha: 0.75 });
  }
  function hairClip(g) {
    // a snap clip: solid pink with a lighter pink core and a thin darker slit
    g.save(); g.translate(-57, -25); g.rotate(0.38);
    RJ.cel(g, [[0, -14.5], [4.6, -12], [5.8, -4], [4.2, 6], [1.6, 14], [-1.6, 14], [-4.2, 6], [-5.8, -4], [-4.6, -12]], J.pink, { shadow: J.pinkDk, line: LINE.mid, depth: 3, hi: '#ffc2d9', hiW: 1.3, tension: 0.9 });
    RJ.cel(g, [[0, -10], [2.8, -7], [3.4, -1], [2.2, 5], [0.6, 9.5], [-0.6, 9.5], [-2.2, 5], [-3.4, -1], [-2.8, -7]], '#ffb3cd', { shadow: false, line: LINE.fine, lineColor: J.pinkDk, tension: 0.9 });
    RJ.ink(g, [[0, -6.5], [0.2, 0], [0, 6.5]], { w: 1.0, color: J.pinkDk, taper: 0.5, wobble: 0, alpha: 0.85 });
    g.restore();
  }
  // the hoop hangs from the near ear lobe (ear centre x, y)
  function hoop(g, ex, ey) {
    const x = ex + 1, y = ey + 27;
    g.save(); g.lineWidth = 3.6; g.strokeStyle = C.ink; g.beginPath(); g.ellipse(x, y, 6.2, 8.8, 0.1, 0, TAU); g.stroke();
    g.lineWidth = 1.9; g.strokeStyle = J.silver; g.beginPath(); g.ellipse(x, y, 6.2, 8.8, 0.1, 0, TAU); g.stroke();
    g.lineWidth = 0.9; g.strokeStyle = '#ffffff'; g.beginPath(); g.ellipse(x, y, 6.2, 8.8, 0.1, 3.6, 4.6); g.stroke();
    g.restore();
  }

  // ==================================================================================================================================
  // THE FACE (jFace): blush, nose, eyes, brows, mouth, all from the grid above, mirrored about x = FG.cx
  // ==================================================================================================================================
  const bezP = (P, t) => {
    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [a * P[0][0] + b * P[1][0] + c * P[2][0] + d * P[3][0], a * P[0][1] + b * P[1][1] + c * P[2][1] + d * P[3][1]];
  };
  const bezT = (P, t) => {                                              // the unit tangent
    const u = 1 - t;
    const dx = 3 * u * u * (P[1][0] - P[0][0]) + 6 * u * t * (P[2][0] - P[1][0]) + 3 * t * t * (P[3][0] - P[2][0]);
    const dy = 3 * u * u * (P[1][1] - P[0][1]) + 6 * u * t * (P[2][1] - P[1][1]) + 3 * t * t * (P[3][1] - P[2][1]);
    const l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  };
  const bezPts = (P, a, b, n) => { const o = []; for (let i = 0; i <= n; i++) o.push(bezP(P, lerp(a, b, i / n))); return o; };
  const rgba = (hex, a) => U.color.rgba(hex, clamp(num(a), 0, 1).toFixed(3));
  const canGrad = (g) => typeof g.createLinearGradient === 'function' && typeof g.createRadialGradient === 'function';

  // eye presets for the open eye: o = how far the lids open (1 full), tilt = inner corner drop (+ angry, - sad), wide = size multiplier
  const EYE_PRE = {
    open: { o: 1 }, neutral: { o: 1 }, half: { o: 0.56, tilt: 0.1 }, sleepy: { o: 0.36, tilt: -0.16 }, wide: { o: 1, wide: 1.1 },
    determined: { o: 0.86, tilt: 0.45 }, angry: { o: 0.78, tilt: 0.85 }, sad: { o: 0.92, tilt: -0.6 }, smirk: { o: 0.74, tilt: 0.26 },
  };

  // The two lid curves of an eye in its local frame (inner corner at -a, outer corner at +a, up is -y). k.open blends the upper lid toward the lower one.
  function eyeCurves(a, b, k) {
    const o = clamp(num(k.open, 1), 0, 1), tl = num(k.tilt);
    const I = [-a, 0.2 * b + tl * b * 0.22], O = [a, -0.08 * b - tl * b * 0.16];
    const chord = (x) => I[1] + ((x + a) / (2 * a)) * (O[1] - I[1]);
    const yc = (x) => chord(x) + 0.5 * b * (1 - (x / a) * (x / a));            // where both lids meet when the eye is shut: a soft downward bow, like the closed eye
    const ux1 = -0.72 * a, ux2 = 0.62 * a, lx1 = 0.66 * a, lx2 = -0.5 * a, lo = Math.sqrt(o);
    const U1 = [ux1, lerp(yc(ux1), -1.4 * b + tl * b * 0.5 * 0.72, o)], U2 = [ux2, lerp(yc(ux2), -1.32 * b - tl * b * 0.5 * 0.62, o)];
    const L1 = [lx1, lerp(yc(lx1), 1.12 * b, lo)], L2 = [lx2, lerp(yc(lx2), 1.2 * b, lo)];
    return { I, O, up: [I, U1, U2, O], lo: [O, L1, L2, I] };
  }
  function lash(g, p, dir, len, w, col, alpha) {
    tk.inkPath(g, [[p[0], p[1]], [p[0] + dir[0] * len * 0.55 + dir[1] * len * 0.06, p[1] + dir[1] * len * 0.55 - dir[0] * len * 0.06], [p[0] + dir[0] * len, p[1] + dir[1] * len]],
      { w, color: col, taper: 0.55, wobble: 0, weightVar: 0, alpha });
  }

  // the open eye: sclera, a graduated brown iris, two catchlights, the pink flower sparkle, lid shade, a refined upper lash line with a wing, a floating crease, lashes
  function openEye(g, e, side, st, pre) {
    const wide = pre.wide || 1, a = e.w / 2 * wide, b = e.h / 2 * wide, sx = side < 0 ? -1 : 1;   // sx: local x -> figure x
    const ss = sx * (RJ._flip ? -1 : 1);                                                         // ss: local x -> screen x (a flipped figure keeps the card's light sides on screen)
    const open = clamp(num(st.open, 1), 0, 1) * clamp(pre.o, 0, 1);
    const cv = eyeCurves(a, b, { open, tilt: pre.tilt });
    const look = st.look || [0, 0];
    const rx = a * 0.74, ry = b * 0.9, icx = (num(look[0]) * 0.06 * sx - 0.07) * a, icy = b * 0.03 + num(look[1]) * b * 0.14;
    const W = a * 0.22, lashCol = J.lash;
    g.save();
    g.translate(e.x, e.y); if (side < 0) g.scale(-1, 1);
    const shape = () => { g.beginPath(); g.moveTo(cv.up[0][0], cv.up[0][1]); g.bezierCurveTo(cv.up[1][0], cv.up[1][1], cv.up[2][0], cv.up[2][1], cv.up[3][0], cv.up[3][1]); g.bezierCurveTo(cv.lo[1][0], cv.lo[1][1], cv.lo[2][0], cv.lo[2][1], cv.lo[3][0], cv.lo[3][1]); g.closePath(); };
    g.save();
    shape(); g.clip();
    g.fillStyle = '#fffdfa'; g.fillRect(-a * 1.4, -b * 1.5, a * 2.8, b * 3);
    // the lid's soft shade across the top of the white
    g.fillStyle = 'rgba(214,166,158,0.34)'; g.fillRect(-a * 1.4, -b * 1.5, a * 2.8, b * 1.5 + b * lerp(0.2, -0.46, clamp(open, 0, 1)) );
    // iris: a vertical oval, graduated from a deep brown top to a warm amber bottom
    g.save();
    g.beginPath(); g.ellipse(icx, icy, rx, ry, 0, 0, TAU); g.clip();
    if (canGrad(g)) {
      const gr = g.createLinearGradient(0, icy - ry, 0, icy + ry);
      gr.addColorStop(0, '#26130a'); gr.addColorStop(0.34, '#3d2210'); gr.addColorStop(0.62, '#62401c'); gr.addColorStop(1, '#8e5b2b');
      g.fillStyle = gr;
    } else g.fillStyle = '#4c2b14';
    g.fillRect(icx - rx - 1, icy - ry - 1, rx * 2 + 2, ry * 2 + 2);
    g.fillStyle = 'rgba(214,150,84,0.34)'; g.beginPath(); g.ellipse(icx, icy + ry * 0.66, rx * 0.8, ry * 0.36, 0, 0, TAU); g.fill();       // the lower glow
    g.strokeStyle = 'rgba(255,222,168,0.42)'; g.lineWidth = Math.max(0.7, a * 0.06); g.beginPath(); g.ellipse(icx, icy, rx * 0.86, ry * 0.88, 0, 0.18 * PI, 0.78 * PI); g.stroke();   // reflected light low in the iris
    g.fillStyle = 'rgba(24,10,4,0.38)'; g.beginPath(); g.ellipse(icx, icy - ry * 0.02, rx * 0.4, ry * 0.42, 0, 0, TAU); g.fill();             // the pupil
    g.restore();
    g.lineWidth = Math.max(0.8, a * 0.05); g.strokeStyle = '#2a1408'; g.beginPath(); g.ellipse(icx, icy, rx, ry, 0, 0, TAU); g.stroke();
    // two catchlights, on the viewer's left of the iris on screen (as on the card, flipped or not): a big round one and a small one under it
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(icx + ss * -0.4 * rx, icy - 0.42 * ry, Math.max(1.3, 0.25 * rx), 0, TAU); g.fill();
    g.beginPath(); g.arc(icx + ss * -0.22 * rx, icy - 0.05 * ry, Math.max(0.8, 0.11 * rx), 0, TAU); g.fill();
    g.restore();
    // the pink flower sparkle (upper right of the iris on screen) and two small pink dashes low left
    if (open > 0.45) {
      const fr = Math.max(2.2, rx * 0.33), fx = icx + ss * 0.34 * rx, fy = icy - 0.3 * ry;
      g.save();
      for (let i = 0; i < 5; i++) { const an = -PI / 2 + (i / 5) * TAU; g.beginPath(); g.ellipse(fx + Math.cos(an) * fr * 0.62, fy + Math.sin(an) * fr * 0.62, fr * 0.6, fr * 0.45, an, 0, TAU); g.fillStyle = J.flower; g.fill(); }
      g.beginPath(); g.arc(fx, fy, fr * 0.3, 0, TAU); g.fillStyle = J.flowerCore; g.fill();
      tk.inkPath(g, [[icx + ss * -0.5 * rx, icy + ry * 0.4], [icx + ss * -0.34 * rx, icy + ry * 0.52]], { w: 1.4, color: J.flower, taper: 0.4, wobble: 0, weightVar: 0 });
      tk.inkPath(g, [[icx + ss * -0.44 * rx, icy + ry * 0.6], [icx + ss * -0.28 * rx, icy + ry * 0.72]], { w: 1.1, color: J.flower, taper: 0.4, wobble: 0, weightVar: 0 });
      g.restore();
    }
    // the sclera's thin lower outline
    tk.inkPath(g, bezPts(cv.lo, 0, 1, 12), { w: 1.0, color: '#4a2a1c', alpha: 0.85 * smooth(open / 0.4), taper: 0.4, wobble: 0, weightVar: 0, step: 1.5 });
    // the upper lash line: thin at the inner corner, fullest across the outer half, ending in a small wing; one even stroke
    const up = bezPts(cv.up, 0, 1, 16);
    const wing = [[a * 1.1, cv.O[1] + b * 0.05], [a * 1.25, cv.O[1] - b * 0.1 * (0.4 + 0.6 * open)]];
    const stroke = up.concat(wing);
    tk.inkPath(g, stroke, { w: W, color: lashCol, taper: 0, pressure: (u) => (u < 0.55 ? 0.2 + 0.8 * Math.pow(smooth(u / 0.55), 1.2) : u < 0.8 ? 1 : 1 - 0.88 * smooth((u - 0.8) / 0.2)), wobble: 0, weightVar: 0, step: 1.5 });
    if (open > 0.5) {
      // three small lashes fanning out of the outer end, each a little shorter, and a floating crease line above the lid
      [[0.7, a * 0.2, 1.5], [0.83, a * 0.18, 1.3], [0.95, a * 0.15, 1.1]].forEach((l) => {
        const p = bezP(cv.up, l[0]), tg = bezT(cv.up, l[0]), nrm = [tg[1], -tg[0]];
        lash(g, p, [nrm[0] * 0.8 + tg[0] * 0.6, nrm[1] * 0.8 + tg[1] * 0.6], l[1], l[2], lashCol, 1);
      });
      const cr = []; for (let i = 0; i <= 8; i++) { const t = lerp(0.24, 0.74, i / 8), p = bezP(cv.up, t); cr.push([p[0] + a * 0.02, p[1] - b * 0.3 - b * 0.05 * Math.sin(PI * i / 8)]); }
      tk.inkPath(g, cr, { w: 0.95, color: J.hair, alpha: 0.62 * smooth((open - 0.5) / 0.4), taper: 0.5, wobble: 0, weightVar: 0, step: 1.5 });
    }
    // a thin lower lash hint at the outer end
    { const p = bezP(cv.lo, 0.04), tg = bezT(cv.lo, 0.04); lash(g, p, [tg[1] * 0.7 - tg[0] * 0.7, -tg[0] * 0.7 - tg[1] * 0.7], a * 0.2, 0.9, lashCol, 0.7); }
    g.restore();
  }

  // a closed eye: an arc with the same even lash line. happy = bowed up (smiling eyes), otherwise bowed down (a soft closed eye for singing)
  function closedEye(g, e, side, happy) {
    const a = e.w / 2, b = e.h / 2, W = a * 0.22;
    const P = happy ? [[-a, 0.3 * b], [-0.5 * a, -0.92 * b], [0.46 * a, -0.96 * b], [a, 0.24 * b]] : [[-a, -0.1 * b], [-0.46 * a, 0.7 * b], [0.5 * a, 0.7 * b], [a, -0.2 * b]];
    g.save();
    g.translate(e.x, e.y + (happy ? 0 : b * 0.12)); if (side < 0) g.scale(-1, 1);
    tk.inkPath(g, bezPts(P, 0, 1, 16), { w: W * 0.98, color: J.lash, taper: 0, pressure: (u) => (u < 0.5 ? 0.35 + 0.65 * smooth(u / 0.5) : 1 - 0.8 * smooth((u - 0.62) / 0.38)), wobble: 0, weightVar: 0, step: 1.5 });
    [[0.66, a * 0.2, 1.4], [0.8, a * 0.18, 1.25], [0.93, a * 0.15, 1.1]].forEach((l) => {
      const p = bezP(P, l[0]), tg = bezT(P, l[0]), nrm = happy ? [tg[1], -tg[0]] : [-tg[1], tg[0]];
      lash(g, p, [nrm[0] * 0.78 + tg[0] * 0.62, nrm[1] * 0.78 + tg[1] * 0.62], l[1], l[2], J.lash, 1);
    });
    g.restore();
  }

  function jEye(g, e, side, st) {
    const nm = st.eyes === 'open' || !st.eyes ? 'open' : st.eyes;
    if (nm === 'hurt') { RJ.hurtEye(g, e, side, { ink: J.lash, hurtLine: 2.3 }); return; }
    if (nm === 'closed' || nm === 'happy') { closedEye(g, e, side, nm === 'happy'); return; }
    openEye(g, e, side, st, Object.prototype.hasOwnProperty.call(EYE_PRE, nm) ? EYE_PRE[nm] : EYE_PRE.open);
  }

  // a soft arched brow: the arch peaks about 46% along from the inner end, the outer tail dips a little, thin and evenly tapered. side -1 near, +1 far.
  function jBrow(g, x, y, w, side, tilt, th) {
    const sx = side < 0 ? -1 : 1, arch = w * 0.17, pts = [];
    for (let i = 0; i <= 12; i++) {
      const u = i / 12, lx = (u - 0.5) * w, ly = -arch * Math.sin(PI * Math.pow(u, 0.9)) + w * 0.075 * u * u + tilt * w * 0.3 * (0.5 - u);
      pts.push([x + sx * lx, y + ly]);
    }
    tk.inkPath(g, pts, { w: th, color: J.brow, pressure: (u) => (u < 0.25 ? 0.55 + 0.45 * smooth(u / 0.25) : 1 - 0.8 * smooth((u - 0.45) / 0.55)), taperStart: 0.02, taperEnd: 0, wobble: 0, weightVar: 0, step: 1.5 });
  }

  // a small nose hint exactly on the centre line: a tiny curved tick whose middle is on x = cx, and a soft shade dab under it
  function jNose(g) {
    const x = FG.cx, y = FG.noseY;
    g.save(); g.globalAlpha *= 0.28; g.fillStyle = C.skinDeep; g.beginPath(); g.ellipse(x, y + 2.4, 2.3, 1.1, 0, 0, TAU); g.fill(); g.restore();
    tk.inkPath(g, [[x - 0.9, y - 2.4], [x + 0.7, y - 0.1], [x + 0.2, y + 1.9]], { w: 1.25, color: J.hair, alpha: 0.7, taper: 0.5, wobble: 0, weightVar: 0, step: 1 });
  }

  // blush: a soft rose glow with three short slanting marks, mirrored about the centre line (the far one a little smaller)
  function jBlush(g, x, y, w, side, k) {
    const al = clamp(0.28 * k + 0.14, 0.08, 0.6), ww = w * clamp(k, 0.4, 1.7) ** 0.5, sx = side < 0 ? -1 : 1;
    g.save(); g.translate(x, y); g.scale(1, 0.6);
    if (canGrad(g)) {
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, ww * 0.58);
      gr.addColorStop(0, rgba(C.blush, al)); gr.addColorStop(0.5, rgba(C.blush, al * 0.8)); gr.addColorStop(1, rgba(C.blush, 0));
      g.fillStyle = gr;
    } else g.fillStyle = rgba(C.blush, al * 0.6);
    g.beginPath(); g.arc(0, 0, ww * 0.58, 0, TAU); g.fill();
    g.restore();
    g.save(); g.strokeStyle = '#e8707e'; g.globalAlpha *= clamp(0.16 + 0.26 * k, 0.12, 0.6); g.lineWidth = 0.85; g.lineCap = 'round';
    g.beginPath();
    for (let i = 0; i < 3; i++) { const bx = x + sx * (i - 1) * ww * 0.16, by = y + 0.5; g.moveTo(bx - sx * ww * 0.045, by + ww * 0.13); g.lineTo(bx + sx * ww * 0.045, by - ww * 0.13); }
    g.stroke(); g.restore();
  }

  // ---- mouths: symmetric about the centre line, a defined upper lip with a cupid's bow dip, a rose inner mouth and a pink tongue ----
  const MOUTH_HAPPY = [[-0.5, 0.0], [-0.34, -0.045], [-0.17, -0.05], [0, -0.015], [0.17, -0.05], [0.34, -0.045], [0.5, 0.0], [0.48, 0.2], [0.41, 0.4], [0.27, 0.55], [0.1, 0.6], [0, 0.605], [-0.1, 0.6], [-0.27, 0.55], [-0.41, 0.4], [-0.48, 0.2]].map((p) => [p[0] * 1.1, p[1]]);       // a touch wider than tall, like the card's big D
  const MOUTH_SING = [[0, -0.045], [0.14, -0.06], [0.27, 0.02], [0.32, 0.19], [0.28, 0.39], [0.15, 0.53], [0, 0.57], [-0.15, 0.53], [-0.28, 0.39], [-0.32, 0.19], [-0.27, 0.02], [-0.14, -0.06]];
  const MOUTH_OW = [[-0.4, 0.0, 1], [-0.2, -0.05], [0, -0.015], [0.2, -0.05], [0.4, 0.0, 1], [0.38, 0.2], [0.2, 0.4], [0, 0.46], [-0.2, 0.4], [-0.38, 0.2]];
  function openMouth(g, x, y, w, shape, nTop, tongueY, tongueW) {
    const pts = shape.map((p) => [x + p[0] * w, y + p[1] * w, p[2]]);
    g.save();
    g.beginPath(); tk.trace(g, pts); g.clip();
    if (canGrad(g)) { const gr = g.createLinearGradient(0, y, 0, y + w * 0.6); gr.addColorStop(0, '#b94456'); gr.addColorStop(0.45, '#d9626f'); gr.addColorStop(1, '#e8737f'); g.fillStyle = gr; } else g.fillStyle = '#d9626f';
    g.fillRect(x - w, y - w * 0.3, w * 2, w * 1.2);
    g.fillStyle = '#f59aa6'; g.beginPath(); g.ellipse(x, y + w * tongueY, w * tongueW, w * 0.15, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,214,222,0.6)'; g.beginPath(); g.ellipse(x - w * 0.04, y + w * (tongueY - 0.03), w * tongueW * 0.5, w * 0.04, 0, 0, TAU); g.fill();
    g.restore();
    tk.inkPath(g, pts, { closed: true, w: 1.15, color: C.ink, align: 0, wobble: 0, weightVar: 0.2, step: 1 });
    // the upper lip line a little bolder, tapering at the corners
    if (nTop) { const top = pts.slice(0, nTop); tk.inkPath(g, top, { w: 1.75, color: C.ink, taper: 0.3, wobble: 0, weightVar: 0, step: 1.5 }); }
  }
  function jMouth(g, kind, x, y, w) {
    if (kind === 'happyOpen') openMouth(g, x, y, w * 1.2, MOUTH_HAPPY, 7, 0.4, 0.26);
    else if (kind === 'sing') openMouth(g, x, y, w * 0.96, MOUTH_SING, 0, 0.4, 0.2);
    else if (kind === 'ow') openMouth(g, x, y, w, MOUTH_OW, 5, 0.34, 0.22);
    else if (kind === 'smile' || !kind) {
      // a small closed smile: the line dips at the middle, a cupid's bow hint above it, a soft lower lip below
      tk.inkPath(g, [[x - w * 0.5, y - w * 0.04], [x - w * 0.27, y + w * 0.09], [x, y + w * 0.13], [x + w * 0.27, y + w * 0.09], [x + w * 0.5, y - w * 0.04]], { w: 1.5, color: C.ink, taper: 0.4, wobble: 0, weightVar: 0, step: 1.5 });
      tk.inkPath(g, [[x - w * 0.14, y + w * 0.27], [x, y + w * 0.3], [x + w * 0.14, y + w * 0.27]], { w: 0.95, color: C.inkSoft, alpha: 0.55, taper: 0.5, wobble: 0, weightVar: 0 });
      tk.inkPath(g, [[x - w * 0.51, y - w * 0.04], [x - w * 0.55, y - w * 0.09], [x - w * 0.575, y - w * 0.15]], { w: 0.9, color: C.ink, alpha: 0.5, taper: 0.5, wobble: 0, weightVar: 0, step: 1 });
      tk.inkPath(g, [[x + w * 0.51, y - w * 0.04], [x + w * 0.55, y - w * 0.09], [x + w * 0.575, y - w * 0.15]], { w: 0.9, color: C.ink, alpha: 0.5, taper: 0.5, wobble: 0, weightVar: 0, step: 1 });
    } else RJ.mouth(g, x, y, w, kind, { lineW: 1.4, inner: '#d9626f', tongue: '#f29aa0' });
  }

  // the whole face for one frame. S.face = {eyes, mouth, brow, browY, blush, look, open, sweat}
  function jFace(g, S) {
    const st = S.face, F = S.spec.face;
    if (!F) return;
    const k = clamp(num(st.blush, 1), 0.2, 1.8);
    jBlush(g, F.blush[0][0], F.blush[0][1], F.blush[0][2], -1, k);
    jBlush(g, F.blush[1][0], F.blush[1][1], F.blush[1][2], 1, k);
    jNose(g);
    jEye(g, F.eyes[0], -1, st);
    jEye(g, F.eyes[1], 1, st);
    const tl = num(st.brow), by = num(st.browY);
    jBrow(g, F.brows[0][0] + 1.5, F.brows[0][1] + by + 1.5, F.brows[0][2] - 2, -1, tl, 5.2);
    jBrow(g, F.brows[1][0], F.brows[1][1] + by + 1.5, F.brows[1][2], 1, tl, 4.8);
    jMouth(g, st.mouth, F.mouth[0], F.mouth[1], F.mouth[2]);
    if (num(st.sweat) > 0.3 && F.sweat) RJ.fxSweat(g, F.sweat[0], F.sweat[1], F.sweat[2] || 5);
  }

  function faceSpec() {
    const nx = FG.near.x, fx = FG.far.x;
    return {
      eyes: [FG.near, FG.far],
      brows: [[FG.cx - FG.gap / 2 - 1 - FG.browWn / 2, FG.browY, FG.browWn], [FG.cx + FG.gap / 2 + 1 + FG.browWf / 2, FG.browY, FG.browWf]],
      browStyle: { thick: 3.2, arch: 0.62, tilt: 0.0, color: J.brow },
      nose: [FG.cx, FG.noseY, 60],
      mouth: [FG.cx, FG.mouthY, FG.mouthW],
      mouthStyle: { lineW: 1.4, inner: '#d9626f', tongue: '#f29aa0' },
      blush: [[nx, FG.blushY, 19], [fx, FG.blushY, 17]],
      sweat: [57, -12, 5],
      eye: { iris: ['#3a2010', '#744820'], ring: '#2a1408', sclera: '#fffdfa', expr: 'neutral' },
    };
  }

  // ==================================================================================================================================
  // the head
  // ==================================================================================================================================
  // skin skull with its soft shadow, the face and the outline: shared by both skins
  function faceBase(g, S, hairShadow) {
    g.save();
    g.beginPath(); tk.trace(g, SKULL); g.clip();
    g.fillStyle = C.skin; g.fillRect(-90, -100, 180, 200);
    g.fillStyle = C.skinSh;
    g.beginPath(); g.rect(-100, -100, 200, 200); tk.trace(g, SKULL, RJ.lx(2.6), -4.4); g.fill('evenodd');
    if (hairShadow) { g.beginPath(); tk.trace(g, CAP_SOFT, 0, 6.5); g.fill(); }          // the hair's cast shadow on the forehead
    g.restore();
    jFace(g, S);
    RJ.ink(g, SKULL, { closed: true, w: LINE.main + 0.2, color: C.ink, align: 0.2, weightVar: 0.5 });
  }
  function drawHead(g, S) {
    const ey = FG.earY;
    RJ.ear(g, 58, ey - 1, { r: 9, side: 1 });                              // the far ear peeks out behind the cheek
    faceBase(g, S, true);
    // hair cap over it
    RJ.cel(g, CAP, J.hair, { shadow: false, line: LINE.main + 0.2, decor: capDecor, tension: 0.9, weightVar: 0.35 });
    RJ.ink(g, HAIRLINE, { w: LINE.mid, color: C.ink, taper: 0.12, pressure: 'flat', wobble: 0.02 });
    RJ.ear(g, -54, ey, { r: FG.earR, side: -1 });
    hoop(g, -54, ey);
    hairClip(g);
    scrunchie(g);
  }

  function poses() {
    const happy = { eyes: 'open', mouth: 'happyOpen', brow: -0.15 };
    return {
      idle: Object.assign({
        mic: 'hand', fHand: [22, -4], fBend: 1, micAng: 1.0, micGrip: 22,
        bHand: [-38, 14], bBend: -1, bKind: 'open', bSpread: 0.85, bRot: 0.12, flare: 0, fx: [], headRot: -0.04,
      }, happy),
      sing: { mic: 'mouth', micDx: 18, micDy: 11, micAng: 1.1, fBend: 1, bHand: [-36, 8], bBend: -1, bKind: 'open', bSpread: 0.8, bRot: 0.1, eyes: 'closed', mouth: 'sing', brow: -0.5, headRot: 0.05, flare: 0.3, fx: ['notes'] },
      attack: { mic: 'hand', fHand: [46, -6], fBend: 1, micAng: 0.2, micGrip: 24, bHand: [-34, 20], bBend: -1, bKind: 'open', bRot: 0.2, lean: 0.05, torsoRot: 0.04, headRot: 0.05, headDx: 2,
        eyes: 'determined', mouth: 'sing', brow: 0.5, browY: -1, flare: 0.7, fFoot: [22, -12], bFoot: [-14, -12], fx: ['arcs', 'sparkleMic'] },
      hurt: { mic: 'hand', fHand: [8, 12], fBend: 1, micAng: 1.3, micGrip: 22, lean: -0.1, torsoRot: -0.06, headRot: -0.12, headDx: -3, bHand: [-34, -10], bBend: -1, bKind: 'open', bSpread: 1.3, flare: -0.2,
        eyes: 'hurt', mouth: 'ow', brow: -0.8, sweat: 1, blush: 0.5, fFoot: [12, -12], bFoot: [-18, -12], fx: ['stars'] },
      cheer: { mic: 'hand', fHand: [22, -4], fBend: 1, micAng: 1.0, micGrip: 22, bHand: [-40, -34], bBend: -1, bKind: 'open', bRot: 0.3, bSpread: 1.4, eyes: 'happy', mouth: 'happyOpen', brow: -0.2, headRot: 0.05, flare: 0.8,
        fFoot: [18, -12], bFoot: [-14, -12], fx: ['hearts'] },
    };
  }

  // ---- the dress ----
  const BODICE = [[-14, -142], [-30, -136], [-27, -120], [-23, -104], [-22, -93, 1], [22, -93, 1], [23, -104], [27, -120], [30, -136], [14, -142], [10, -133], [5, -126], [0, -123], [-5, -126], [-10, -133]];
  function skirtPts(P) {
    const f = 1 + P.flare * 0.12, w = 43 * f, y = -49 + P.flare * 1.5;
    // five soft scallops along the hem, one per pleat
    return [[-23, -91, 1], [23, -91, 1], [w * 0.6, -70], [w * 1.0, y - 2], [w * 0.8, y + 2.2], [w * 0.4, y - 0.6], [0, y + 2.4], [-w * 0.4, y - 0.6], [-w * 0.8, y + 2.2], [-w * 1.0, y - 2], [-w * 0.6, -70]];
  }
  function dress(g, S) {
    const P = S.P;
    RJ.neck(g, 2, -152, { w: 20, h: 22 });
    // chest skin inside the scoop neckline
    RJ.cel(g, [[-16, -142], [16, -142], [8, -128], [0, -122], [-8, -128]], C.skin, { shadow: C.skinSh, line: false, depth: 3 });
    // skirt first (the bodice and waistband overlap its top)
    const sk = skirtPts(P);
    RJ.cel(g, sk, J.dressLt, { shadow: J.dress, line: LINE.main, depth: 5, tension: 0.6, decor: (gg) => {
      const w = 43 * (1 + P.flare * 0.12);
      for (let i = -2; i <= 2; i++) {                                                // five pleats fanning from the waist; every other one is a darker fold
        const hx = i * 9, tx = i * (w / 2.7);
        if (i % 2) RJ.fillPts(gg, [[hx - 3.2, -91], [hx + 3.2, -91], [tx + 7, -44], [tx - 7, -44]], J.pleat, 0.5);
        RJ.ink(gg, [[hx, -90], [tx * 0.55 + hx * 0.45, -70], [tx * 1.02, -48]], { w: 1.2, color: J.dressSh, taper: 0.45, wobble: 0, alpha: 0.9 });
      }
    } });
    RJ.cel(g, BODICE, J.dress, { shadow: J.dressSh, line: LINE.main, depth: 6, hi: '#ffc3d7', hiW: 1.5, tension: 0.8 });
    // waistband
    RJ.cel(g, [[-23.5, -96], [23.5, -96], [24.5, -89], [-24.5, -89]], J.pleat, { shadow: J.dressSh, line: LINE.mid, tension: 0.2, depth: 2 });
    necklace(g);
  }
  // the near arm's round shoulder cap lies over the dress, so the strap and the armhole edge are drawn again on top of it (clipped to the strap region)
  function strapOver(g, S) {
    if (S.P.mic === 'mouth') return;                              // the mic at the mouth: the raised forearm crosses the strap, so the shoulder must stay on top
    g.save();
    g.beginPath(); g.rect(15, -150, 30, 21); g.clip();
    RJ.cel(g, BODICE, J.dress, { shadow: J.dressSh, line: LINE.main, depth: 6, hi: '#ffc3d7', hiW: 1.5, tension: 0.8 });
    g.restore();
  }
  function necklace(g) {
    const pts = [];
    for (let i = 0; i <= 11; i++) {                                                  // a sagging string of pearls from strap to strap
      const u = i / 11, x = -13 + u * 26, y = -141 + Math.sin(u * Math.PI) * 13 + (Math.abs(u - 0.5) < 0.1 ? 1 : 0);
      pts.push([x, y]);
    }
    RJ.ink(g, pts, { w: 1, color: C.inkSoft, taper: 0, wobble: 0, alpha: 0.5 });
    pts.forEach((p, i) => { if (i === 5 || i === 6) return; g.beginPath(); g.arc(p[0], p[1], 2.1, 0, TAU); g.fillStyle = J.pearl; g.fill(); g.lineWidth = 0.9; g.strokeStyle = C.ink; g.stroke(); });
    // heart pendant
    RJ.cel(g, [[0, -112, 1], [-6, -118], [-3.4, -123], [0, -120.5], [3.4, -123], [6, -118]], J.pink, { shadow: J.pinkDk, line: LINE.mid, depth: 2, hi: '#ffc2d9', hiW: 1 });
  }

  // ==================================================================================================================================
  // THE UNICORN ONESIE SKIN ('jasmin_unicorn'): the same face (same grid, same face code), a fluffy pink and white hood with small ears and a strip of her brown
  // fringe under the trim, a cream spiral horn with a gold tip, a pastel rainbow mane tail (pink, lilac, mint, yellow) in place of the ponytail running down the
  // back of the hood, a pink and white onesie, hoof boots, the same mic with a pink band.
  // ==================================================================================================================================
  const UN = {
    pink: '#ffb9d6', pinkSh: '#f594bd', pinkLt: '#ffdbea', pinkDk: '#e86fa5',
    white: '#fffafd', whiteSh: '#e9dcf2', whiteLn: '#cdbce0',
    rose: '#ff9fc6', lilac: '#c9a8f4', mint: '#9fe8cf', yellow: '#ffe888',
    horn: '#fff1d8', hornSh: '#efd2a6', gold: '#ffcb4f', goldSh: '#e19d1c',
    hoof: '#d9c2f5', hoofSh: '#b99ce6', hoofLn: '#8d6cc4',
  };

  // dense closed polylines: a Catmull-Rom control ring flattened, offset along its normals and scalloped (fluffy edges)
  const denseOf = (ctrl) => { const f = tk.flatten(ctrl, { closed: true, step: 3 }), o = []; for (let i = 0; i + 1 < f.length; i += 2) o.push([f[i], f[i + 1]]); return o; };
  const polyDir = (P) => { let a = 0; for (let i = 0; i < P.length; i++) { const j = (i + 1) % P.length; a += P[i][0] * P[j][1] - P[j][0] * P[i][1]; } return a > 0 ? 1 : -1; };
  const normalsOf = (P) => {
    const sg = polyDir(P);
    return P.map((p, i) => { const a = P[(i + P.length - 1) % P.length], b = P[(i + 1) % P.length]; let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l; return [ty * sg, -tx * sg]; });
  };
  const offsetPoly = (P, d) => { const N = normalsOf(P); return P.map((p, i) => [p[0] + N[i][0] * d, p[1] + N[i][1] * d]); };
  function scallop(P, seg, amp) {
    const n = P.length, N = normalsOf(P), L = [0];
    for (let i = 1; i <= n; i++) L.push(L[i - 1] + Math.hypot(P[i % n][0] - P[i - 1][0], P[i % n][1] - P[i - 1][1]));
    const total = L[n] || 1, m = Math.max(3, Math.round(total / seg)), out = [];
    for (let i = 0; i < n; i++) { const u = (L[i] / total) * m, t = u - Math.floor(u), off = amp * Math.pow(Math.sin(PI * t), 0.8); out.push([P[i][0] + N[i][0] * off, P[i][1] + N[i][1] * off]); }
    return out;
  }
  // the face window of the hood (hairline moved up 6 so a strip of her brown fringe shows under the trim), the pink hood body, the white trim ring
  const WIN_CTRL = [[-47, 14], [-46, 1], [-43.5, -9], [-39, -18], [-33.5, -27], [-27, -35], [-19, -41.5], [-10, -46.5], [-1, -50], [9, -54], [20, -56.5], [31, -55.5], [41, -51.5], [50, -44], [55, -33], [57.8, -21], [58.6, -8],
    [58, 10], [52.6, 27.4], [41.2, 42.2], [26.6, 54], [9, 59.3], [-8.8, 55.3], [-23.6, 50.5], [-37.6, 40], [-50, 26]];           // the lower half hugs the skull, a hair inside it, so no gap shows between face and trim
  const HOOD_CTRL = [[2, -83], [26, -81], [46, -72], [62, -52], [72, -26], [75, 2], [74, 28], [68, 50], [54, 68], [34, 77], [10, 80], [-14, 78], [-36, 70], [-54, 56], [-67, 38], [-74, 14], [-76, -12], [-72, -40], [-58, -64], [-36, -79], [-14, -84]];
  const WIN = { poly: denseOf(WIN_CTRL) };
  const HOOD_OUT = { poly: scallop(denseOf(HOOD_CTRL), 21, 3.4) };
  const TRIM_OUT = { poly: scallop(offsetPoly(WIN.poly, 6.4), 12.5, 2.5) };

  // little curly fur marks, the cartoon's fluff
  function fluffMarks(g, pts, col, alpha) {
    g.save(); g.strokeStyle = col; g.globalAlpha *= alpha === undefined ? 0.9 : alpha; g.lineWidth = 1.25; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    pts.forEach((p, i) => { const r = ((i * 37) % 7 - 3) * 0.12; g.moveTo(p[0] - 3 * Math.cos(r), p[1] + 1.4 - 3 * Math.sin(r)); g.quadraticCurveTo(p[0], p[1] - 3.2, p[0] + 3 * Math.cos(r), p[1] + 1.4 + 3 * Math.sin(r)); });
    g.stroke(); g.restore();
  }
  // a pointed unicorn ear (pink outside, soft white inside) at base (x, y), leaning by rot, scaled k
  function unicornEar(g, x, y, rot, k) {
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(k, k);
    RJ.cel(g, [[-10, 2], [-10, -10], [-6.5, -23], [0, -35, 1], [6.5, -22], [10, -9], [10, 2]], UN.pink, { shadow: UN.pinkSh, line: LINE.main, depth: 4, hi: UN.pinkLt, hiW: 1.4, tension: 0.8 });
    RJ.cel(g, [[-5.2, 0], [-5.2, -9], [-3, -19], [0, -26, 1], [3, -18], [5.2, -8], [5.2, 0]], '#ffeaf3', { shadow: UN.whiteSh, line: false, depth: 2, tension: 0.8 });
    g.restore();
  }
  // the cream spiral horn with a gold tip: base (x, y) on the crown, leaning forward by rot
  function unicornHorn(g, x, y, rot) {
    g.save(); g.translate(x, y); g.rotate(rot);
    const pts = [[-8.5, 3], [-6.3, -11], [-3.2, -26], [0.6, -39, 1], [4.6, -25], [7.2, -11], [9, 3]];
    RJ.cel(g, pts, UN.horn, { shadow: UN.hornSh, line: LINE.main, depth: 4, hi: '#ffffff', hiW: 1.2, tension: 0.8, decor: (gg) => {
      for (let i = 0; i < 5; i++) { const yy = 2 - i * 9; RJ.ink(gg, [[-10, yy + 6], [0, yy - 1.5], [10, yy - 8]], { w: 2.1, color: UN.hornSh, taper: 0.1, wobble: 0, pressure: 'flat' }); }
      gg.beginPath(); gg.moveTo(-10, -27); gg.lineTo(10, -34); gg.lineTo(10, -50); gg.lineTo(-10, -50); gg.closePath(); gg.fillStyle = UN.gold; gg.fill();     // the gold tip
      RJ.ink(gg, [[-10, -27], [0, -30.5], [10, -34]], { w: 1.3, color: UN.goldSh, taper: 0.1, wobble: 0, pressure: 'flat' });
      RJ.ink(gg, [[-1.4, -36], [0.2, -30]], { w: 1.3, color: '#fff3b8', taper: 0.5, wobble: 0 });
    } });
    // a fluffy collar where the horn leaves the hood
    [-5.5, 0, 5.5].forEach((dx, i) => RJ.cel(g, tk.circlePts(dx, 2.6, 4.9 - (i === 1 ? 0 : 0.5), 10), UN.white, { shadow: UN.whiteSh, line: LINE.fine + 0.3, depth: 1.5 }));
    g.restore();
  }
  function hoodHead(g, S) {
    // the ears first, a little higher, so the scalloped fur edge of the hood overlaps their bases
    unicornEar(g, 49, -68, 0.4, 0.92);
    unicornEar(g, -9, -81, -0.3, 1);
    // the strip of brown fringe under the trim (the classic hair cap clipped to the window)
    g.save();
    g.beginPath(); tk.trace(g, WIN); g.clip();
    RJ.cel(g, CAP, J.hair, { shadow: false, line: LINE.main + 0.2, decor: capDecor, tension: 0.9, weightVar: 0.35 });
    RJ.ink(g, HAIRLINE, { w: LINE.mid, color: C.ink, taper: 0.12, pressure: 'flat', wobble: 0.02 });
    g.restore();
    // the pink hood: scalloped outer edge, window cut out, one hard shadow band on the lower left
    g.save();
    g.beginPath(); tk.trace(g, HOOD_OUT); tk.trace(g, WIN); g.fillStyle = UN.pink; g.fill('evenodd');
    g.save(); g.beginPath(); tk.trace(g, HOOD_OUT); tk.trace(g, WIN); g.clip('evenodd');
    g.fillStyle = UN.pinkSh; g.beginPath(); g.rect(-120, -120, 240, 240); tk.trace(g, HOOD_OUT, RJ.lx(6), -9); g.fill('evenodd');
    g.restore();
    g.restore();
    RJ.ink(g, HOOD_OUT, { closed: true, w: LINE.main + 0.2, color: C.ink, align: 0.3 });
    fluffMarks(g, [[-62, -30], [-66, 0], [-58, 36], [-40, 62], [66, -34], [70, -2], [66, 34], [40, -70], [-24, -72], [-50, -52], [22, 70], [-12, 72], [52, 58]], UN.pinkDk, 0.85);
    // the white fluffy trim round the face window
    g.save();
    g.beginPath(); tk.trace(g, TRIM_OUT); tk.trace(g, WIN); g.fillStyle = UN.white; g.fill('evenodd');
    g.save(); g.beginPath(); tk.trace(g, TRIM_OUT); tk.trace(g, WIN); g.clip('evenodd');
    g.fillStyle = UN.whiteSh; g.beginPath(); g.rect(-120, -120, 240, 240); tk.trace(g, TRIM_OUT, RJ.lx(3.4), -5.2); g.fill('evenodd');
    g.restore();
    g.restore();
    RJ.ink(g, TRIM_OUT, { closed: true, w: LINE.main, color: C.ink, align: 0.3 });
    RJ.ink(g, WIN, { closed: true, w: LINE.main, color: C.ink, align: -0.3 });
    fluffMarks(g, [[-52, -2], [-50, 30], [-30, 52], [52, -42], [62, 8], [52, 40], [-4, 68]], UN.whiteLn, 0.9);
    // the horn and the scrunchie where the mane tail leaves the hood
    unicornHorn(g, 21, -76, 0.12);
    scrunchie(g, { base: UN.white, shade: UN.whiteSh, hi: '#ffffff', fold: UN.whiteLn });                     // a fluffy white scrunchie ties the mane tail
  }

  // the mane tail replaces the ponytail: the same silhouette in four pastel bands (pink at the root, then lilac, mint and yellow at the curl)
  const cutPoly = (a, b, far) => {                                         // the half plane on one side of the (softly waving) line a-b, in card coordinates
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, k = 10, nx = -dy / len, ny = dx / len, n = 48, pts = [];
    for (let i = 0; i <= n; i++) {
      const t = -k + (i / n) * (2 * k + 1), w = 2.8 * Math.sin(t * len / 5.5);
      pts.push([a[0] + dx * t + nx * w, a[1] + dy * t + ny * w]);
    }
    const f0 = pts[0], f1 = pts[n];
    pts.push([f1[0] + far[0], f1[1] + far[1]], [f0[0] + far[0], f0[1] + far[1]]);
    return pts.map((p) => [-p[0] - 4, p[1], 1]);                           // sharp corners everywhere: a plain polygon
  };
  const MANE_CUTS = [[[130, -66], [60, -38], [0, 900], UN.lilac], [[130, -8], [58, 10], [0, 900], UN.mint], [[130, 36], [60, 48], [0, 900], UN.yellow]];
  function maneTail(g, S) {
    g.save();
    g.translate(-39, -72); g.rotate(0.09 + S.P.hairSwing * 0.05); g.translate(39, 72);
    RJ.cel(g, TAIL_OUTLINE, UN.rose, { shadow: false, line: LINE.main + 0.2, tension: 0.85, weightVar: 0.3, decor: (gg) => {
      MANE_CUTS.forEach((c) => RJ.fillPts(gg, cutPoly(c[0], c[1], c[2]), c[3], 1));
      gg.save(); gg.globalCompositeOperation = 'multiply'; RJ.fillPts(gg, TAIL_SHADOW, '#f3e2fb', 0.6); gg.restore();                // the one hard shadow, tinted by the band under it
      TAIL_LIGHT.forEach((l) => RJ.fillPts(gg, MX(l), '#ffffff', 0.5));
      TAIL_LINES.forEach((l, i) => RJ.ink(gg, MX(l), { w: 1.5, color: '#9a63b8', taper: 0.45, wobble: 0.03, alpha: 0.5, seed: i }));
      TAIL_HATCH.forEach((h, i) => RJ.ink(gg, MX(h), { w: 1.3, color: '#ffffff', taper: 0.5, wobble: 0, alpha: 0.7, seed: i }));
    } });
    g.restore();
  }

  // ---- the onesie ----
  const ONESIE = [[-17, -146], [-30, -141], [-35, -128], [-35, -106], [-33, -88], [-35, -70], [-31, -60], [-15, -54], [0, -59], [15, -54], [31, -60], [35, -70], [33, -88], [35, -106], [35, -128], [30, -141], [17, -146]];
  function onesie(g, S) {
    RJ.neck(g, 2, -152, { w: 20, h: 22 });
    RJ.cel(g, ONESIE, UN.pink, { shadow: UN.pinkSh, line: LINE.main, depth: 8, hi: UN.pinkLt, hiW: 1.6, hiAlpha: 0.8, tension: 0.9 });
    // the white fluffy tummy panel with the zip running down the front (a little right of centre, the 3/4 view)
    RJ.cel(g, tk.ellipsePts(6, -92, 16, 21, 16), UN.white, { shadow: UN.whiteSh, line: LINE.mid, depth: 5, hi: '#ffffff', hiW: 1.3 });
    RJ.ink(g, [[6, -128], [6.4, -108], [6, -88], [6.4, -66]], { w: 3.2, color: C.ink, taper: 0, wobble: 0 });
    RJ.ink(g, [[6, -128], [6.4, -108], [6, -88], [6.4, -66]], { w: 1.5, color: '#f3dbe8', taper: 0, wobble: 0 });
    RJ.cel(g, [[6, -121], [10.4, -117], [9, -110.5], [6, -108.5], [3, -110.5], [1.6, -117]], UN.gold, { shadow: UN.goldSh, line: LINE.fine + 0.3, depth: 1.5, tension: 0.7 });       // the zip pull
    fluffMarks(g, [[-24, -122], [-26, -96], [24, -118], [27, -92], [-22, -70], [24, -68]], UN.pinkDk, 0.8);
    fluffMarks(g, [[-4, -82], [14, -100]], UN.whiteLn, 0.9);
    // a little gold star patch on the chest, on the near side
    tk.sparkle(g, -17, -112, 5.5, { color: UN.gold, glow: 0.15, thin: 0.35 });
  }
  // a hoof boot at the ankle (drawn over the leg): a cream fluffy boot with a lilac hoof and its cleft, and a scalloped white cuff
  function hoofBoot(g, hip, an) {
    g.save(); g.translate(an[0], an[1]);
    RJ.cel(g, [[-11, -4], [-13.5, 4], [-11, 12.4, 1], [22, 12.4, 1], [28.4, 7], [25.4, -1], [14, -4], [2, -8]], UN.white, { shadow: UN.whiteSh, line: LINE.main, depth: 5, hi: '#ffffff', hiW: 1.4, tension: 0.9 });
    // the hoof: a rounded lilac cap over the toe with a darker lower wall, a lighter rim and the cleft
    RJ.cel(g, [[7, -2.5], [16, -3.5], [25, -1.2], [28.6, 6], [27, 12.4, 1], [7, 12.4, 1]], UN.hoof, { shadow: UN.hoofSh, line: LINE.main, depth: 4.5, hi: '#efe2ff', hiW: 1.3, tension: 0.7, decor: (gg) => {
      RJ.ink(gg, [[7, 1.5], [16, 0.2], [27, 2.4]], { w: 1.2, color: UN.hoofLn, taper: 0.3, wobble: 0, alpha: 0.8 });                      // where the hoof wall meets the pastern
      RJ.ink(gg, [[19.4, 1.4], [19.9, 12.4]], { w: 1.4, color: UN.hoofLn, taper: 0.45, wobble: 0 });                                       // the cleft
    } });
    // the fluffy cuff round the ankle, scalloped
    RJ.cel(g, [[-14, -17], [-9, -20], [-4, -17], [1, -20], [6, -17], [11, -20], [14, -16], [15, -7], [11, -4], [6, -7], [1, -4], [-4, -7], [-9, -4], [-14, -7]], UN.white, { shadow: UN.whiteSh, line: LINE.main, depth: 3, hi: '#ffffff', hiW: 1.2, tension: 0.7 });
    g.restore();
  }

  function makeJasmin(uni) {
    const base = poses();
    const spec = {
      id: uni ? 'jasmin_unicorn' : 'jasmin',
      accent: 'jasmin',
      skel: { shF: [21, -122], shB: [-24, -124], hipF: [12, -58], hipB: [-12, -58] },
      base: {},
      poses: Object.assign(base, { bust: Object.assign({}, base.idle, { bHand: [-22, 44], bBend: 1, bKind: 'relaxed', bRot: 0.1, bSpread: 1 }) }),
      face: faceSpec(),
      exprs: { smirk: { eyes: 'open', mouth: 'smirk', brow: 0.2 }, angry: { eyes: 'determined', mouth: 'frown', brow: 0.8 } },
      arm: uni ? { l: [26, 24], w: [19, 15], skin: UN.pink, skinSh: UN.pinkSh, cuff: { color: UN.white, light: UN.whiteSh }, hand: { skin: C.skin, shade: C.skinSh } }
        : { l: [26, 24], w: [17, 13], skin: C.skin, skinSh: C.skinSh, hand: { skin: C.skin, shade: C.skinSh } },
      legs: uni ? {
        w: [29, 23], color: UN.pink, shade: UN.pinkSh, bow: 1.5, pantsOver: true,
        shoe: { color: UN.white, shade: UN.whiteSh, k: 0.001 },                                  // hidden: the hoof boot in decor replaces the sneaker
        decor: hoofBoot,
      } : {
        w: [27, 21], color: C.skin, shade: C.skinSh, bow: 1.5,
        sock: { color: J.white, shade: J.whiteSh, len: 17 },
        shoe: { color: J.white, sole: '#ffe1ea', shade: J.whiteSh, toeCap: '#ffcadb', heel: '#c4e4ff', hi: '#ffffff' },
      },
      mic: { accent: J.pink, headR: 11.5, len: 40, bands: 2 },
      bounds: uni ? { w: 256, h: 336, x0: -164, x1: 92 } : { w: 238, h: 322, x0: -158, x1: 80 },   // the tail swings far to the back: the box is lopsided, hair (the unicorn hood and horn too) and the widest pose reach (not effects)
      bust: uni ? { rect: [-112, -344, 104, -92], face: [-76, -322, 90, -132], pose: 'bust' } : { rect: [-112, -306, 96, -92], face: [-68, -286, 80, -140], pose: 'bust' },
      layers: uni ? {
        backHair: (g, S) => maneTail(g, S),
        torso: (g, S) => onesie(g, S),
        head: (g, S) => { faceBase(g, S, false); hoodHead(g, S); },
      } : {
        backHair: (g, S) => ponytail(g, S),
        torso: (g, S) => dress(g, S),
        head: (g, S) => drawHead(g, S),
        over: (g, S) => strapOver(g, S),
      },
    };
    return spec;
  }
  // The kit fits the portrait crop to the bust pose only. A pose that moves the head (attack leans in about 23 units, hurt recoils about 37) would lose part of
  // the face, so for any other pose the same crop is shifted by that pose's head offset (one rig per pose, built on first use; the offset is the middle of the
  // head's travel over a few seconds, so the crop holds still while the head bobs). Anything odd falls back to the kit's own crop.
  function followHead(spec) {
    const impl = RJ.rig(spec), base = impl.bust, bp = spec.bust.pose, rigs = {};
    const mid = (pose) => {                                              // the centre of the head's range of travel in this pose
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (let i = 0; i < 9; i++) { const h = impl.points({ pose, t: i * 0.35 }).head; x0 = Math.min(x0, h[0]); x1 = Math.max(x1, h[0]); y0 = Math.min(y0, h[1]); y1 = Math.max(y1, h[1]); }
      return [(x0 + x1) / 2, (y0 + y1) / 2];
    };
    const shifted = (pose) => {
      const a = mid(bp), b = mid(pose);
      const dx = num(b[0]) - num(a[0]), dy = num(b[1]) - num(a[1]), mv = (r) => [r[0] + dx, r[1] + dy, r[2] + dx, r[3] + dy];
      return RJ.rig(Object.assign({}, spec, { bust: Object.assign({}, spec.bust, { rect: mv(spec.bust.rect), face: mv(spec.bust.face) }) }));
    };
    impl.bust = function (ctx, w, h, o) {
      const pose = o && typeof o.pose === 'string' ? o.pose : bp;
      if (pose === bp || !Object.prototype.hasOwnProperty.call(spec.poses, pose)) return base.call(impl, ctx, w, h, o);
      let r = rigs[pose];
      if (!r) { try { r = shifted(pose); } catch (e) { r = impl; } rigs[pose] = r; }
      return r === impl ? base.call(impl, ctx, w, h, o) : r.bust(ctx, w, h, o);
    };
    return impl;
  }
  RJ.register('jasmin', followHead(makeJasmin(false)));
  RJ.register('jasmin_unicorn', followHead(makeJasmin(true)));
})();
