'use strict';
// owned by the cast_scrap agent (see WORLD_DESIGN.md)
//
// THE SCRAP KINGS (crew colour orange #ff8a2a): junkyard rig-builders in patched orange overalls, welding goggles, tape reels, cassette crowns,
// machines and sparks. Cheerful grease-and-glitter energy. Five ART.rj figures in the Hocus Vocus chibi-candy style (warm brown line, one hard cel
// shadow, a thin highlight, huge flat glossy eyes with catchlights, blush), built on js/hv/art_cast_kit.js (RJ.rig):
//   npc_scrap_cassette  King Cassette (boss)       crown of three reel-to-reel spools on a gold band, banner-patchwork cape, royal-blue sleeves under
//                                                  patched orange overalls with gold trim, a handlebar moustache, a chrome sceptre topped by a spinning spool
//   npc_scrap_hammer    Jack Hammer (enforcer)     broad flat-top welder, amber goggles pushed up, tank top, one strap down, a rubber-capped sledge and an
//                                                  anvil he plays like a drum
//   npc_scrap_weld      Weld (grunt)               short and stocky, welding helmet DOWN (the big eyes show through the tinted visor), canvas gloves, a
//                                                  hissing torch with a blue flame and tiny sparks, ginger tufts out the back
//   npc_scrap_sparks    Sparks (grunt)             wiry, tall, electric-blond spikes with live cables poking out whose bare tips spark, a spring-reverb
//                                                  tank backpack with boinging springs, a note-shaped tuning wrench
//   npc_scrap_carla     Cog Carla (merchant/fixer) polka-dot headscarf over a big curly bun with a pencil, a brass loupe on one eye, washer earrings, a
//                                                  teal work shirt under an orange apron stuffed with cogs, and a mechanical right arm with a cog elbow and a claw
// Props are drawn in figure space from the 'top' layer (so the busts have them) and the gripping fist is drawn again over the prop. Custom pose keys
// (propAng = the prop's direction in figure space, flame, claw, twoHand, ...) ride along in the pose tables: RJ.resolve copies them and RJ.blend lerps them.
// Fx names drawn here (layers.fx): tapelash reelnotes clang anvil weldjet torchsparks zap cogs fizz confetti; the kit adds stars sparkles rings mute.
(function () {
  if (typeof ART === 'undefined' || !ART.rj || typeof ART.rj.rig !== 'function' || !ART.tk) return;
  const RJ = ART.rj, tk = ART.tk, C = RJ.C, LINE = RJ.LINE, mat = tk.mat;
  const TAU = Math.PI * 2, PI = Math.PI;
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : (d === undefined ? 0 : d));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const fr = (v) => v - Math.floor(v);
  const hash = (i, s) => fr(Math.sin(i * 127.1 + (s || 0) * 311.7) * 43758.5453);

  RJ.ACCENT.scrap_kings = { main: '#ff8a2a', dark: '#b5530a', light: '#ffd0a0', glow: '#ffb45e' };

  // ------------------------------------------------------------------------------------------------------------------------------------
  // crew palette
  // ------------------------------------------------------------------------------------------------------------------------------------
  const K = {
    or: '#ff8a2a', orSh: '#dc6618', orHi: '#ffc08a', orDk: '#a84a0e',
    stitch: '#fff3dc', cream: '#fff0d4', creamSh: '#ead0a2',
    metal: '#d3d7e2', metalSh: '#9095aa', metalHi: '#f7f8fc', steel: '#8a90a6', steelSh: '#5f6479', steelHi: '#b9bed0',
    rubber: '#3b3640', rubberSh: '#24202a', rubberHi: '#5f5868',
    tape: '#5a3320', tapeHi: '#a8704a',
    gold: '#ffc94d', goldSh: '#e0962a', goldHi: '#fff0a8', brass: '#e8b24e', brassSh: '#b47c24',
    yellow: '#ffd23a', teal: '#3fb8c8', pink: '#f06aa0', lav: '#b79ae8', sky: '#7fd0e8', lime: '#8fd14f', red: '#ff5a4a', blue: '#4d7cf0',
    boot: '#4a4350', bootSh: '#2f2a35', bootHi: '#6d6676', sole: '#2a252e',
    spark: '#fff6b0', sparkMid: '#ffb347', sparkLine: '#7a2a0a',
  };

  // ------------------------------------------------------------------------------------------------------------------------------------
  // shared helpers
  // ------------------------------------------------------------------------------------------------------------------------------------
  function rbox(x, y, w, h, r, n) {
    r = Math.min(r, w / 2, h / 2); n = n || 3;
    const pts = [], cs = [[x + w - r, y + r, -0.5], [x + w - r, y + h - r, 0], [x + r, y + h - r, 0.5], [x + r, y + r, 1]];
    for (let c = 0; c < 4; c++) for (let i = 0; i <= n; i++) { const a = (cs[c][2] + i / n * 0.5) * PI; pts.push([cs[c][0] + Math.cos(a) * r, cs[c][1] + Math.sin(a) * r]); }
    return pts;
  }
  // leave the space of matrix M (back to figure space) / enter it
  function toFig(g, M) { const i = mat.inv(M); g.transform(i[0], i[1], i[2], i[3], i[4], i[5]); }
  function into(g, M) { g.transform(M[0], M[1], M[2], M[3], M[4], M[5]); }
  const tPt = (S, x, y) => mat.pt(S.M.torso, x, y);
  const litIn = (ang) => RJ.lightAngle() - ang;           // the key light seen from a frame rotated by ang
  const L0 = { w: 0, taper: 0, wobble: 0, weightVar: 0 };
  const line = (g, pts, w, col, o) => tk.inkPath(g, pts, Object.assign({}, L0, { w, color: col }, o));
  // a stroke with an ink edge (straps, cables, hoses)
  function cable(g, pts, w, col, o) {
    o = o || {};
    line(g, pts, w + 2.6, o.ink || C.ink, { taper: o.taper || 0 });
    line(g, pts, w, col, { taper: o.taper || 0 });
    if (o.hi) line(g, pts.map((p) => [p[0] + RJ.lx(0.6) * w * 0.25, p[1] - w * 0.22]), Math.max(0.7, w * 0.28), o.hi, { alpha: 0.85, taper: 0.3 });
  }
  // the wrist of an arm, solved the way the rig solves it
  function wristOf(S, front) {
    const P = S.P, pt = S.pt, ar = S.spec.arm || {}, l = ar.l || [23, 21];
    const sh = front ? pt.shF : pt.shB, tg = front ? pt.hand : [pt.shB[0] + P.bHand[0], pt.shB[1] + P.bHand[1]];
    const r = RJ.ik2(sh, tg, l[0], l[1], front ? P.fBend : P.bBend);
    return { w: r.w, e: r.e, ang: Math.atan2(r.w[1] - r.e[1], r.w[0] - r.e[0]) };
  }
  // the centre of the front fist (where a prop's handle passes)
  function gripOf(S) { const w = wristOf(S, true); return { w, x: w.w[0] + Math.cos(w.ang) * 6.5, y: w.w[1] + Math.sin(w.ang) * 6.5 }; }
  // the same from the layout (spec.tip)
  function gripLay(spec, P, Lay) {
    const ar = spec.arm || {}, l = ar.l || [23, 21], r = RJ.ik2(Lay.pt.shF, Lay.pt.hand, l[0], l[1], P.fBend), a = Math.atan2(r.w[1] - r.e[1], r.w[0] - r.e[0]);
    return [r.w[0] + Math.cos(a) * 6.5, r.w[1] + Math.sin(a) * 6.5];
  }
  function handOver(g, S, front, kind) {
    const P = S.P, k = wristOf(S, front), hs = (S.spec.arm && S.spec.arm.hand) || {};
    RJ.hand(g, kind || (front ? P.fKind : P.bKind), k.w[0], k.w[1], k.ang + (front ? P.fRot : P.bRot), Object.assign({ spread: front ? P.fSpread : P.bSpread }, hs));
  }
  // a bHand (relative to the back shoulder) that puts the back fist on the prop shaft at distance d from the front grip (rest skeleton, close enough)
  function backOnShaft(spec, P, d) {
    const sk = spec.skel, f = sk.shF, b = sk.shB, gx = f[0] + P.fHand[0], gy = f[1] + P.fHand[1], a = num(P.propAng);
    return [gx + Math.cos(a) * d - b[0] - 4, gy + Math.sin(a) * d - b[1]];
  }
  // skull, soft skin shadow, optional hair cast shadow and an 'under' pass, then the face and the outline (as the HV crew does)
  function headBase(g, S, o) {
    const skull = o.skull || RJ.SKULL;
    g.save();
    g.beginPath(); tk.trace(g, skull); g.clip();
    g.fillStyle = o.skin || C.skin; g.fillRect(-130, -130, 260, 260);
    g.fillStyle = o.shade || C.skinSh;
    g.beginPath(); g.rect(-130, -130, 260, 260); tk.trace(g, skull, RJ.lx(4.5), -8); g.fill('evenodd');
    if (o.cast) { g.beginPath(); tk.trace(g, o.cast, 0, o.castDy === undefined ? 7 : o.castDy); g.fill(); }
    if (o.under) o.under(g);
    g.restore();
    RJ.drawFace(g, S);
    RJ.ink(g, skull, { closed: true, w: LINE.main + 0.2, color: C.ink, align: 0.2, weightVar: 0.5 });
  }
  // a stitched cloth patch (rounded rectangle, dashed stitch inside)
  function patch(g, x, y, w, h, rot, col, o) {
    o = o || {};
    g.save(); g.translate(x, y); g.rotate(rot || 0);
    RJ.cel(g, rbox(-w / 2, -h / 2, w, h, Math.min(3.5, w * 0.22), 2), col, { shadow: RJ.shade(col, 0.1), line: LINE.fine + 0.3, tension: 0, depth: 2, light: litIn(rot || 0), decor: (gg) => {
      gg.setLineDash([2.2, 1.9]); gg.lineWidth = 0.95; gg.strokeStyle = o.stitch || 'rgba(255,248,230,0.95)';
      gg.beginPath(); tk.trace(gg, rbox(-w / 2 + 2.4, -h / 2 + 2.4, w - 4.8, h - 4.8, 2, 2), 0, 0, 0); gg.stroke(); gg.setLineDash([]);
      if (o.decor) o.decor(gg);
    } });
    g.restore();
  }
  function bolt(g, x, y, r, col) {
    RJ.cel(g, tk.circlePts(x, y, r, 8), col || K.metal, { shadow: K.metalSh, line: LINE.fine, depth: r * 0.4, hi: false });
    line(g, [[x - r * 0.5, y + r * 0.25], [x + r * 0.5, y - r * 0.25]], 0.8, C.inkSoft);
  }
  // a five-point star polygon (stickers, emblems)
  function starPts(x, y, r, rot) {
    const pts = [];
    for (let i = 0; i < 10; i++) { const a = (rot || 0) - PI / 2 + i * PI / 5, rr = i % 2 ? r * 0.46 : r; pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr, 1]); }
    return pts;
  }
  // a reel-to-reel spool: a flange with three windows onto the brown tape, a cream hub with teeth
  function reel(g, x, y, r, rot, o) {
    o = o || {};
    const col = o.col || K.metal, sh = o.sh || RJ.shade(col, 0.16);
    g.save(); g.translate(x, y);
    RJ.cel(g, tk.circlePts(0, 0, r, 20), col, { shadow: sh, line: LINE.mid + 0.2, depth: r * 0.16, hi: o.hi || RJ.tint(col, 0.5), hiW: 1.4, decor: (gg) => {
      gg.rotate(rot);
      for (let i = 0; i < 3; i++) {
        const a0 = i * TAU / 3 + 0.32, a1 = a0 + TAU / 3 - 0.64;
        gg.beginPath(); gg.arc(0, 0, r * 0.8, a0, a1); gg.arc(0, 0, r * 0.42, a1, a0, true); gg.closePath();
        gg.fillStyle = K.tape; gg.fill(); gg.lineWidth = 1.15; gg.strokeStyle = C.ink; gg.stroke();
        gg.beginPath(); gg.arc(0, 0, r * 0.64, a0 + 0.18, a0 + 0.62); gg.lineWidth = 1.2; gg.strokeStyle = K.tapeHi; gg.stroke();
      }
    } });
    RJ.cel(g, tk.circlePts(0, 0, r * 0.3, 10), o.hub || K.cream, { shadow: K.creamSh, line: LINE.fine + 0.2, depth: 1.2, hi: false });
    g.save(); g.rotate(rot); g.fillStyle = C.ink;
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6; g.beginPath(); g.arc(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2, Math.max(0.5, r * 0.035), 0, TAU); g.fill(); }
    g.restore();
    g.beginPath(); g.arc(0, 0, Math.max(0.8, r * 0.09), 0, TAU); g.fillStyle = C.ink; g.fill();
    g.restore();
  }
  function cogPts(r, n, rot) {
    const pts = [], ri = r * 0.76, h = TAU / n;
    for (let i = 0; i < n; i++) {
      const a = rot + i * h;
      [[a - h * 0.27, ri], [a - h * 0.15, r], [a + h * 0.15, r], [a + h * 0.27, ri]].forEach((q) => pts.push([Math.cos(q[0]) * q[1], Math.sin(q[0]) * q[1], 1]));
    }
    return pts;
  }
  function cog(g, x, y, r, n, rot, col, o) {
    o = o || {};
    g.save(); g.translate(x, y);
    RJ.cel(g, cogPts(r, n, rot), col, { shadow: o.sh || RJ.shade(col, 0.14), line: o.line || LINE.fine + 0.45, tension: 0, depth: r * 0.22, hi: RJ.tint(col, 0.45), hiW: 1.1 });
    RJ.ink(g, tk.circlePts(0, 0, r * 0.52, 12), { closed: true, w: 0.9, color: RJ.shade(col, 0.25), taper: 0, wobble: 0 });
    g.beginPath(); g.arc(0, 0, r * 0.24, 0, TAU); g.fillStyle = o.hole || '#3a2a30'; g.fill();
    g.lineWidth = 1.1; g.strokeStyle = C.ink; g.stroke();
    g.restore();
  }
  // flying welding sparks: short glowing streaks thrown from (x, y) toward ang that arc down and fade
  function sparkSpray(g, x, y, ang, t, o) {
    o = o || {};
    const n = o.n || 7, len = o.len || 30, spread = o.spread === undefined ? 1.2 : o.spread, seed = o.seed || 1, k = o.k || 1, grav = o.grav === undefined ? 1 : o.grav;
    g.save(); g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const u = fr(num(t) * (o.rate || 2.4) + hash(i, seed));
      const a = ang + (hash(i + 7, seed) - 0.5) * spread, sp = len * (0.6 + 0.6 * hash(i + 3, seed));
      const px = x + Math.cos(a) * sp * u, py = y + Math.sin(a) * sp * u + 16 * u * u * grav;
      const vx = Math.cos(a) * sp, vy = Math.sin(a) * sp + 32 * u * grav, vl = Math.hypot(vx, vy) || 1, sl = (3 + 5 * (1 - u)) * k;
      const qx = px - vx / vl * sl, qy = py - vy / vl * sl;
      g.globalAlpha = clamp(1.15 - u, 0, 1);
      g.strokeStyle = K.sparkLine; g.lineWidth = 3.3 * k; g.beginPath(); g.moveTo(px, py); g.lineTo(qx, qy); g.stroke();
      g.strokeStyle = u < 0.45 ? K.spark : K.sparkMid; g.lineWidth = 1.9 * k; g.beginPath(); g.moveTo(px, py); g.lineTo(qx, qy); g.stroke();
      if (u < 0.35) { g.strokeStyle = '#ffffff'; g.lineWidth = 0.8 * k; g.beginPath(); g.moveTo(px, py); g.lineTo((px + qx) / 2, (py + qy) / 2); g.stroke(); }
    }
    g.restore();
  }
  // a little twinkle (four-point sparkle) that blinks with t
  function twinkle(g, x, y, r, t, seed, col) {
    const a = Math.pow(Math.max(0, Math.sin(num(t) * 7 + seed * 2.3)), 2);
    if (a < 0.05) return;
    tk.sparkle(g, x, y, r * (0.6 + 0.4 * a), { color: col || K.spark, glow: 0.35 * a, thin: 0.2, rot: seed });
  }
  // a jagged electric arc between two points
  function zap(g, a, b, t, o) {
    o = o || {};
    const n = o.n || 7, amp = o.amp || 7, pts = [];
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d, ph = Math.floor(num(t) * 14);
    for (let i = 0; i <= n; i++) { const u = i / n, off = i === 0 || i === n ? 0 : (hash(i + ph * 13, o.seed || 2) - 0.5) * 2 * amp; pts.push([a[0] + dx * u + nx * off, a[1] + dy * u + ny * off]); }
    line(g, pts, (o.w || 3) + 3, K.sparkLine, { alpha: 0.85 });
    line(g, pts, o.w || 3, o.col || K.yellow);
    line(g, pts, Math.max(0.8, (o.w || 3) * 0.35), '#ffffff');
  }
  // the orange comic hit burst at (x, y)
  const burst = (g, S, x, y, r) => RJ.fx.burst(g, x, y, r + 7 * S.beat, K.or, K.cream, S.t);

  // ---- clothes ----
  // the shirt or tank block in torso rest space: k widens, top is the collar line, bot the hem, belly pushes the lower sides out
  function shirtPts(k, top, bot, belly) {
    const b = belly || 0, m = (top + bot) / 2 + 6;
    return [[-14 * k, top], [14 * k, top], [31 * k, top + 5], [37 * k, top + 20], [37 * k + b * 0.6, m], [40 * k + b, bot, 1], [-40 * k - b, bot, 1], [-37 * k - b * 0.6, m], [-37 * k, top + 20], [-31 * k, top + 5]];
  }
  // patched orange overalls: the bib, the straps over the shoulders (or one strap down), buckle bolts, a bib pocket, side buttons and patches.
  // o: {k, top (bib top), waist, bot, belly, strapTop, strapDown (-1 back strap hangs, 1 front), trim (a colour piping round the bib), pocket (fn(g) or true), patches: [[x, y, w, h, rot, col], ...]}
  function overalls(g, S, o) {
    const k = o.k || 1, top = o.top, waist = o.waist, bot = o.bot, b = o.belly || 0;
    const BIB = [[-20 * k, top], [20 * k, top], [21 * k, waist - 6], [34 * k + b * 0.5, waist + 2], [41 * k + b, bot, 1], [-41 * k - b, bot, 1], [-34 * k - b * 0.5, waist + 2], [-21 * k, waist - 6]];
    RJ.cel(g, BIB, K.or, { shadow: K.orSh, line: LINE.main, depth: 7, tension: 0.35, hi: K.orHi, hiW: 1.5, hiAlpha: 0.7, decor: (gg) => {
      // the waist seam and fly stitching
      gg.setLineDash([2.4, 2]); gg.lineWidth = 1; gg.strokeStyle = K.stitch;
      gg.beginPath(); gg.moveTo(-40 * k - b, waist + 4); gg.lineTo(40 * k + b, waist + 4); gg.stroke();
      gg.beginPath(); tk.trace(gg, [[-17 * k, top + 3], [17 * k, top + 3], [18 * k, waist - 7], [-18 * k, waist - 7]], 0, 0, 0); gg.closePath(); gg.stroke();
      gg.setLineDash([]);
      RJ.ink(gg, [[-40 * k - b, waist + 1.5], [40 * k + b, waist + 1.5]], { w: 1.2, color: K.orDk, taper: 0, wobble: 0 });
      RJ.ink(gg, [[6, waist + 4], [6, bot - 2]], { w: 1.1, color: K.orDk, taper: 0.2, wobble: 0, alpha: 0.8 });
      (o.patches || []).forEach((p) => patch(gg, p[0], p[1], p[2], p[3], p[4], p[5]));
      if (o.trim) { RJ.ink(gg, BIB.slice(0, 3), { w: 2.2, color: o.trim, taper: 0, wobble: 0 }); RJ.ink(gg, [BIB[7], BIB[0]], { w: 2.2, color: o.trim, taper: 0, wobble: 0 }); }
    } });
    if (o.pocket) {
      const py = top + (waist - top) * 0.28, pw = 22 * k, ph = (waist - top) * 0.5;
      RJ.cel(g, rbox(-pw / 2 + 2, py, pw, ph, 3, 2), K.or, { shadow: K.orSh, line: LINE.fine + 0.4, tension: 0, depth: 2.5, decor: (gg) => {
        gg.setLineDash([2.2, 1.9]); gg.lineWidth = 0.9; gg.strokeStyle = K.stitch; gg.beginPath(); gg.moveTo(-pw / 2 + 4, py + 3); gg.lineTo(pw / 2, py + 3); gg.stroke(); gg.setLineDash([]);
      } });
      if (typeof o.pocket === 'function') o.pocket(g, 2, py, pw, ph);
    }
    // straps
    [-1, 1].forEach((sd) => {
      const ax = sd * 17 * k, ay = top + 2;
      if (o.strapDown === sd) {
        const sw = S.sway * 2;
        const pts = [[ax + sd * 2, ay + 1], [ax + sd * 12, ay + 14], [sd * 34 * k + sw, waist + 8], [sd * 36 * k + sw, waist + 22]];
        cable(g, pts, 7, K.or, { hi: K.orHi });
        bolt(g, pts[3][0], pts[3][1], 3.2, K.metal);
        bolt(g, ax, ay + 4, 3.4, K.metal);
        return;
      }
      const pts = [[ax, ay + 6], [ax + sd * 3 * k, ay - 8], [sd * 23 * k, o.strapTop]];
      cable(g, pts, 7.6, K.or, { hi: K.orHi });
      line(g, pts.map((p) => [p[0] - sd * 1.8, p[1]]), 0.9, K.stitch, { alpha: 0.9 });
      RJ.cel(g, rbox(ax - 5.5, ay + 1, 11, 9, 2, 2), K.metal, { shadow: K.metalSh, line: LINE.fine + 0.2, tension: 0, depth: 1.6, hi: K.metalHi, hiW: 1 });
      bolt(g, ax, ay + 5.5, 2.4, K.gold);
    });
    // side buttons at the hips
    [-1, 1].forEach((sd) => bolt(g, sd * (35 * k + b * 0.5), waist + 8, 3, K.metal));
  }
  // the overall legs: a stitched seam, a knee patch and a rolled cuff
  function overallLegs(o) {
    o = o || {};
    return function (g, hip, an) {
      const dx = an[0] - hip[0], dy = an[1] - hip[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux, ang = Math.atan2(dy, dx);
      const hw = (o.cuffW || 17);
      const sx = (hip[0] + an[0]) / 2, sy = (hip[1] + an[1]) / 2;
      if (o.patch) patch(g, sx + nx * 2 + ux * 2, sy + ny * 2 + uy * 2, o.patchW || 13, o.patchH || 12, ang - PI / 2 + 0.12, o.patch);
      g.save(); g.setLineDash([2.4, 2]); g.lineWidth = 1; g.strokeStyle = K.stitch; g.globalAlpha = 0.8;
      g.beginPath(); g.moveTo(hip[0] + ux * 8 - nx * 6, hip[1] + uy * 8 - ny * 6); g.lineTo(an[0] - ux * 14 - nx * 7, an[1] - uy * 14 - ny * 7); g.stroke(); g.restore();
      // the rolled cuff
      const c0 = [an[0] - ux * 12, an[1] - uy * 12], c1 = [an[0] - ux * 3, an[1] - uy * 3];
      RJ.cel(g, [[c0[0] - nx * hw, c0[1] - ny * hw], [c0[0] + nx * hw, c0[1] + ny * hw], [c1[0] + nx * (hw + 1.5), c1[1] + ny * (hw + 1.5)], [c1[0] - nx * (hw + 1.5), c1[1] - ny * (hw + 1.5)]], o.cuff || K.orHi,
        { shadow: o.cuffSh || K.or, line: LINE.main, tension: 0.2, depth: 3 });
    };
  }
  const BOOT = { color: K.boot, sole: K.sole, shade: K.bootSh, toeCap: K.metal, hi: K.bootHi, k: 1.28 };

  // a cel capsule from a to b (widths w0, w1): props, mech limbs
  function capsule(g, a, b, w0, w1, col, o) {
    o = o || {};
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, nx = -uy, ny = ux, h0 = w0 / 2, h1 = w1 / 2;
    const pts = [];
    for (let i = 0; i <= 4; i++) { const t = PI / 2 + i * PI / 4; pts.push([a[0] + nx * h0 * Math.sin(t) + ux * h0 * Math.cos(t), a[1] + ny * h0 * Math.sin(t) + uy * h0 * Math.cos(t)]); }
    for (let i = 0; i <= 4; i++) { const t = -PI / 2 + i * PI / 4; pts.push([b[0] + nx * h1 * Math.sin(t) + ux * h1 * Math.cos(t), b[1] + ny * h1 * Math.sin(t) + uy * h1 * Math.cos(t)]); }
    RJ.cel(g, pts, col, Object.assign({ shadow: RJ.shade(col, 0.15), line: LINE.main, tension: 0.4, depth: Math.min(w0, w1) * 0.3, hi: RJ.tint(col, 0.45), hiW: 1.2 }, o));
  }

  // PORTRAIT FRAMING (the same fix the HV crew uses): the crop offset is worked out after the zoom is shrunk to fit the face
  function scrapRig(spec) {
    const impl = RJ.rig(spec), kitBust = impl.bust;
    impl.bust = function (ctx, w, h, o) {
      const bs = spec.bust, R = bs && bs.rect, F = bs && bs.face;
      if (!(typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0 && w < 1e5 && h < 1e5 && R && F)) return kitBust.call(impl, ctx, w, h, o);
      const rw = R[2] - R[0], rh = R[3] - R[1], fw = F[2] - F[0], fh = F[3] - F[1];
      const k = Math.min(Math.max(w / rw, h / rh), Math.min(w / fw, h / fh) / 1.1);
      const fcx = (F[0] + F[2]) / 2, fcy = (F[1] + F[3]) / 2, hx = fw / 2 * k * 1.05, hy = fh / 2 * k * 1.05;
      const x0 = hx - fcx * k, x1 = w - hx - fcx * k, y0 = hy - fcy * k, y1 = h - hy - fcy * k;
      let tx = w / 2 - (R[0] + R[2]) / 2 * k, ty = -R[1] * k;
      tx = clamp(tx, Math.min(x0, x1), Math.max(x0, x1));
      if (h < rh * k - 0.5) ty = h * 0.46 - fcy * k;
      ty = clamp(ty, Math.min(y0, y1), Math.max(y0, y1));
      const kept = spec.bust;
      spec.bust = Object.assign({}, bs, { rect: [-tx / k, -ty / k, (w - tx) / k, (h - ty) / k], face: undefined });
      try { return kitBust.call(impl, ctx, w, h, o); } finally { spec.bust = kept; }
    };
    return impl;
  }
  // friendly expression overrides shared by the crew (never scary: 'angry' is a cheeky scowl with gritted teeth)
  const EXPRS = { angry: { eyes: 'determined', mouth: 'grit', brow: 0.55 }, smirk: { eyes: 'open', mouth: 'smirkTeeth', brow: 0.3 }, happy: { eyes: 'happy', mouth: 'grin', brow: -0.15 } };

  // =====================================================================================================================================
  // KING CASSETTE (boss): taller and broader, chest out, chin up. Crown of three spools on a gold band with a mini cassette, loose tape streamers,
  // a banner-patchwork cape, royal-blue sleeves and a cream ruff under gold-trimmed patched overalls with bottle-cap medals, a handlebar
  // moustache, and a chrome sceptre with a spring and a spinning gold spool on top.
  // =====================================================================================================================================
  const KC = {
    skin: '#f3c39c', skinSh: '#dc9b72', hair: '#8a4524', hairSh: '#5c2a13', hairHi: '#c47442',
    shirt: '#3f63c8', shirtSh: '#2c479c', shirtHi: '#7898ea', ruff: '#fff6e2', ruffSh: '#e8cfa6',
    iris: ['#4a1f08', '#c47a2e'],
  };
  const KING_SKULL = RJ.skullPts({ w: 1.04, chin: 3 });
  const KING_HAIR = [[-64, 6], [-67, -18], [-62, -40], [-46, -55], [-18, -62], [14, -61], [40, -53], [57, -38], [50, -34], [30, -38], [8, -40], [-14, -38], [-32, -30], [-42, -14], [-44, 8], [-40, 30, 1], [-50, 26], [-58, 18]];
  function kingCrown(g, S) {
    const t = S.t, sw = S.P.hairSwing, spin = S.P.spin === undefined ? 1 : S.P.spin;
    // loose tape streamers off the back spool, flowing behind
    [[[-34, -76], [-58, -84], [-80, -74], [-96, -84]], [[-34, -72], [-56, -66], [-74, -52], [-92, -54]]].forEach((sp, i) => {
      RJ.lock(g, sp, K.tape, { wMax: 5.4, w0: 5, w1: 3.6, profile: () => 1, cap: 'flat', bend: sw * 0.3 * (i ? -1 : 1) + Math.sin(t * 3 + i) * 0.06, gloss: true, glossColor: K.tapeHi, glossAlpha: 0.8, strands: 0, shadow: '#3a1e10' });
    });
    // prongs
    [[-30, -54, -32, -70], [6, -60, 6, -76], [40, -52, 42, -66]].forEach((p) => capsule(g, [p[0], p[1]], [p[2], p[3]], 6, 5, K.gold, { shadow: K.goldSh, hi: K.goldHi, line: LINE.mid }));
    // the tape looping between the spools
    cable(g, [[-24, -70], [-12, -60], [0, -70]], 3, K.tape, { hi: K.tapeHi });
    cable(g, [[13, -72], [26, -62], [36, -70]], 3, K.tape, { hi: K.tapeHi });
    reel(g, -32, -76, 13, t * 1.6 * spin + 0.4, { col: K.gold, sh: K.goldSh, hi: K.goldHi });
    reel(g, 42, -72, 12, t * 1.6 * spin + 1.4, { col: K.gold, sh: K.goldSh, hi: K.goldHi });
    reel(g, 6, -88, 18, -t * 1.3 * spin, { col: K.or, sh: K.orSh, hi: K.orHi });
    // the band: a gold strip that wraps the head in 3/4
    const BAND = [[-62, -44], [-40, -56], [-10, -63], [22, -62], [48, -54], [63, -42], [64, -26, 1], [46, -38], [20, -46], [-10, -46], [-38, -40], [-62, -26, 1]];
    RJ.cel(g, BAND, K.gold, { shadow: K.goldSh, line: LINE.main, tension: 0.6, depth: 4, hi: K.goldHi, hiW: 1.6, decor: (gg) => {
      // zig-zag engraving along the band
      const zz = []; for (let i = 0; i <= 14; i++) { const u = i / 14, x = lerp(-56, 58, u); zz.push([x, -45 - 6 * Math.sin(PI * u) + (i % 2 ? -3 : 2)]); }
      RJ.ink(gg, zz, { w: 1, color: K.goldSh, taper: 0, wobble: 0 });
    } });
    // the mini cassette jewel in front
    g.save(); g.translate(14, -52); g.rotate(-0.04);
    RJ.cel(g, rbox(-13, -8, 26, 16, 2.5, 2), K.cream, { shadow: K.creamSh, line: LINE.mid, tension: 0, depth: 2.2, decor: (gg) => {
      gg.fillStyle = K.or; gg.fillRect(-13, -8, 26, 5);
      gg.fillStyle = '#3a2a30'; gg.beginPath(); tk.trace(gg, rbox(-8, -2, 16, 6.5, 2, 2), 0, 0, 0); gg.fill();
    } });
    [-4.5, 4.5].forEach((x, i) => { g.save(); g.translate(x, 1.2); g.rotate(t * 3 * spin + i); g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 2.3, 0, TAU); g.fill(); g.fillStyle = C.ink; for (let j = 0; j < 3; j++) { const a = j * TAU / 3; g.fillRect(Math.cos(a) * 1.2 - 0.4, Math.sin(a) * 1.2 - 0.4, 0.8, 0.8); } g.restore(); });
    g.restore();
    // two LED gems
    [[-38, -44, K.red], [50, -42, K.lime]].forEach((p, i) => { g.beginPath(); g.arc(p[0], p[1], 3.4, 0, TAU); g.fillStyle = p[2]; g.fill(); g.lineWidth = 1.2; g.strokeStyle = C.ink; g.stroke(); g.beginPath(); g.arc(p[0] - 1, p[1] - 1.2, 1.1, 0, TAU); g.fillStyle = '#fff'; g.fill(); twinkle(g, p[0] + 2, p[1] - 2, 5, t, i + 1, '#ffffff'); });
  }
  function kingMoustache(g, S) {
    const sw = S.P.hairSwing * 0.1, m = S.face.mouth === 'sing' || S.face.mouth === 'ow' ? -2.5 : 0;
    RJ.lock(g, [[18, 34 + m], [30, 35 + m], [42, 33 + m], [50, 26 + m], [47, 19 + m]], KC.hair, { wMax: 8.4, w0: 8, w1: 1.6, tipPow: 1.3, bend: -sw, gloss: true, glossColor: KC.hairHi, glossAlpha: 0.7, strands: 1, shadow: KC.hairSh });
    RJ.lock(g, [[18, 35 + m], [6, 37 + m], [-6, 35 + m], [-13, 28 + m], [-10, 21 + m]], KC.hair, { wMax: 7.6, w0: 7.4, w1: 1.6, tipPow: 1.3, bend: sw, gloss: true, glossColor: KC.hairHi, glossAlpha: 0.7, strands: 1, shadow: KC.hairSh });
    RJ.cel(g, tk.ellipsePts(18, 34 + m, 4.4, 3.8, 10), KC.hair, { shadow: KC.hairSh, line: LINE.mid, depth: 1.2 });
  }
  function kingHead(g, S) {
    headBase(g, S, { skull: KING_SKULL, skin: KC.skin, shade: KC.skinSh, cast: [[-60, -34], [-30, -46], [0, -48], [30, -46], [56, -34], [50, -22], [20, -36], [-10, -36], [-40, -18]], castDy: 4 });
    RJ.cel(g, KING_HAIR, KC.hair, { shadow: KC.hairSh, line: LINE.main, tension: 0.7, depth: 6, hi: KC.hairHi, hiW: 1.5, hiAlpha: 0.6, decor: (gg) => {
      RJ.hatch(gg, [[[-52, -20], [-48, -6], [-50, 8]], [[-58, -30], [-54, -16]], [[-42, -38], [-36, -30]]], { color: KC.hairSh, w: 1.3, alpha: 0.9 });
    } });
    RJ.ear(g, -52, 22, { r: 14, side: -1, skin: KC.skin, shade: KC.skinSh });
    kingMoustache(g, S);
    kingCrown(g, S);
  }
  // the cape of old banners hangs from the shoulders behind everything (drawn from backHair, moved into torso space)
  function kingCape(g, S) {
    g.save(); toFig(g, S.M.head); into(g, S.M.torso); g.translate(0, -8);
    const sw = (S.P.hairSwing * 5 + S.sway * 3) * (S.P.capeK === undefined ? 1 : S.P.capeK), top = -160, hem = S.P.capeHem === undefined ? -16 : S.P.capeHem;
    const pts = [[-30, top], [30, top], [46, top + 16], [58, -96], [66 + sw * 0.5, hem]];
    const n = 5, x0 = 66 + sw, x1 = -70 + sw;
    for (let i = 1; i < n * 2; i++) { const u = i / (n * 2), x = lerp(x0, x1, u); pts.push([x, hem + (i % 2 ? 15 : 0) + 4 * Math.sin(PI * u), 1]); }
    pts.push([-70 + sw * 0.5, hem], [-60, -96], [-46, top + 16]);
    const cols = [K.or, K.yellow, K.teal, K.cream, K.pink, K.or, K.sky, K.yellow, K.lav];
    RJ.cel(g, pts, K.or, { shadow: false, line: LINE.main + 0.2, tension: 0.25, decor: (gg) => {
      for (let i = 0; i < cols.length; i++) { const x = -78 + i * 18 + sw * 0.4; gg.fillStyle = cols[i]; gg.beginPath(); gg.moveTo(x, -170); gg.lineTo(x + 18, -170); gg.lineTo(x + 18 + sw * 0.6, 20); gg.lineTo(x + sw * 0.6, 20); gg.closePath(); gg.fill(); }
      gg.setLineDash([2.4, 2]); gg.lineWidth = 1; gg.strokeStyle = 'rgba(90,40,20,0.55)';
      for (let i = 1; i < cols.length; i++) { const x = -78 + i * 18 + sw * 0.4; gg.beginPath(); gg.moveTo(x, -170); gg.lineTo(x + sw * 0.6, 20); gg.stroke(); }
      gg.setLineDash([]);
      // painted stars and notes on a few banners
      RJ.cel(gg, starPts(-50 + sw * 0.5, -46, 6, 0.1), K.cream, { shadow: false, line: LINE.fine, tension: 0 });
      RJ.cel(gg, starPts(50 + sw * 0.5, -40, 6, -0.2), K.or, { shadow: false, line: LINE.fine, tension: 0 });
      // the inside of the cape reads a step darker, with the hard shadow on the lower left
      gg.fillStyle = 'rgba(70,25,40,0.28)'; gg.fillRect(-100, -180, 200, 220);
      gg.fillStyle = 'rgba(70,25,40,0.22)'; gg.beginPath(); gg.rect(-120, -200, 240, 260); tk.trace(gg, pts, RJ.lx(9), -10, 0.25); gg.fill('evenodd');
    } });
    g.restore();
  }
  function kingTorso(g, S) {
    g.translate(0, -8);
    RJ.neck(g, 2, -170, { w: 26, h: 20, skin: KC.skin, shade: KC.skinSh });
    RJ.cel(g, shirtPts(1.26, -157, -66, 8), KC.shirt, { shadow: KC.shirtSh, line: LINE.main, depth: 8, hi: KC.shirtHi, hiW: 1.6, hiAlpha: 0.7, tension: 0.5 });
    overalls(g, S, { k: 1.26, top: -134, waist: -100, bot: -64, belly: 8, strapTop: -156, trim: K.gold,
      patches: [[-28, -82, 14, 12, -0.15, KC.shirt], [30, -78, 12, 11, 0.2, K.yellow]],
      pocket: (gg, x, y) => {                                 // the crew emblem: a cassette on the bib pocket
        gg.save(); gg.translate(x, y + 8);
        RJ.cel(gg, rbox(-10, -6, 20, 12, 2, 2), K.cream, { shadow: K.creamSh, line: LINE.fine + 0.3, tension: 0, depth: 1.5, decor: (q) => { q.fillStyle = K.teal; q.fillRect(-10, -6, 20, 4); q.fillStyle = '#3a2a30'; q.beginPath(); tk.trace(q, rbox(-6, -1, 12, 4.6, 1.6, 2), 0, 0, 0); q.fill(); } });
        gg.restore();
      } });
    // the ruff collar: a scalloped cream ring under the chin
    const R = [];
    for (let i = 0; i < 12; i++) for (let j = 0; j < 3; j++) { const u = (i + j / 3) / 12, a = PI * 0.02 + u * TAU, k = 1 + 0.12 * Math.sin(PI * j / 3); R.push(j === 0 ? [2 + Math.cos(a) * 30, -156 + Math.sin(a) * 9, 1] : [2 + Math.cos(a) * 30 * k, -156 + Math.sin(a) * 9 * k]); }
    RJ.cel(g, R, KC.ruff, { shadow: KC.ruffSh, line: LINE.mid, depth: 3, tension: 0.8, decor: (gg) => { for (let i = 0; i < 12; i++) { const a = PI * 0.02 + i / 12 * TAU; RJ.ink(gg, [[2 + Math.cos(a) * 18, -156 + Math.sin(a) * 5], [2 + Math.cos(a) * 31, -156 + Math.sin(a) * 9.5]], { w: 0.9, color: KC.ruffSh, taper: 0.3, wobble: 0 }); } } });
    // gold clasps holding the cape, and two bottle-cap medals on a striped ribbon
    [[-34, -150], [36, -150]].forEach((p) => { RJ.cel(g, tk.circlePts(p[0], p[1], 5.2, 10), K.gold, { shadow: K.goldSh, line: LINE.mid, depth: 1.6, hi: K.goldHi }); g.beginPath(); g.arc(p[0], p[1], 1.6, 0, TAU); g.fillStyle = K.red; g.fill(); });
    [[-36, -134, K.red], [-34, -118, K.teal]].forEach((m, i) => {
      RJ.cel(g, [[m[0] - 4, m[1] - 10], [m[0] + 4, m[1] - 10], [m[0] + 3, m[1] - 3], [m[0] - 3, m[1] - 3]], i ? K.yellow : K.cream, { shadow: false, line: LINE.fine + 0.2, tension: 0 });
      const cap = []; for (let j = 0; j < 20; j++) { const a = j / 20 * TAU, r = j % 2 ? 5.2 : 6.2; cap.push([m[0] + Math.cos(a) * r, m[1] + 1 + Math.sin(a) * r, 1]); }
      RJ.cel(g, cap, m[2], { shadow: RJ.shade(m[2], 0.12), line: LINE.fine + 0.3, tension: 0, depth: 1.6 });
      RJ.cel(g, starPts(m[0], m[1] + 1, 3, 0), K.gold, { shadow: false, line: false, tension: 0 });
    });
  }
  // the sceptre: a chrome pipe with orange tape wraps, a gold pommel, a spring and a fork holding a spinning gold spool
  const KING_REACH = 98;
  function kingSceptre(g, S) {
    g.save(); toFig(g, S.M.head);
    const P = S.P, gp = gripOf(S), a = num(P.propAng, -1.4), li = litIn(a), spin = P.spin === undefined ? 1 : P.spin;
    g.save(); g.translate(gp.x, gp.y); g.rotate(a);
    RJ.cel(g, [[-36, -3.6], [66, -3.1], [66, 3.1], [-36, 3.6]], K.metal, { shadow: K.metalSh, line: LINE.main, tension: 0, depth: 2.4, light: li, hi: K.metalHi, hiW: 1.1 });
    [[-14, 26], [36, 7], [50, 7]].forEach((w) => RJ.cel(g, [[w[0], -4.4], [w[0] + w[1], -4.2], [w[0] + w[1], 4.2], [w[0], 4.4]], K.or, { shadow: K.orSh, line: LINE.fine + 0.3, tension: 0, depth: 2, light: li, decor: (gg) => { for (let x = w[0] + 3; x < w[0] + w[1]; x += 4) RJ.ink(gg, [[x, -4], [x + 2, 4]], { w: 0.8, color: K.orDk, taper: 0, wobble: 0, alpha: 0.7 }); } }));
    RJ.cel(g, tk.circlePts(-40, 0, 5.8, 10), K.gold, { shadow: K.goldSh, line: LINE.mid, depth: 1.8, light: li, hi: K.goldHi });
    const coil = []; for (let i = 0; i <= 12; i++) coil.push([66 + i * 1.25, (i % 2 ? -5 : 5)]);
    line(g, coil, 3.6, C.ink); line(g, coil, 1.8, K.metalHi);
    RJ.cel(g, [[80, -4], [84, -4], [86, -14], [92, -18], [88, -10], [86, 0], [88, 10], [92, 18], [86, 14], [84, 4], [80, 4]], K.gold, { shadow: K.goldSh, line: LINE.mid, tension: 0.3, depth: 1.6, light: li });
    g.restore();
    reel(g, gp.x + Math.cos(a) * KING_REACH, gp.y + Math.sin(a) * KING_REACH, 17, S.t * 2.4 * spin, { col: K.gold, sh: K.goldSh, hi: K.goldHi });
    twinkle(g, gp.x + Math.cos(a) * KING_REACH + 12, gp.y + Math.sin(a) * KING_REACH - 14, 6, S.t, 3);
    handOver(g, S, true, 'fist');
    if (P.twoHand) handOver(g, S, false, 'fist');
    g.restore();
  }
  // a brown tape ribbon lashing out from (x, y) toward ang
  function tapeLash(g, x, y, ang, t, len) {
    const pts = [], ph = num(t) * 11;
    for (let i = 0; i <= 22; i++) { const u = i / 22, d = u * len, off = 11 * Math.sin(PI * Math.min(1, u * 1.3)) * Math.sin(u * 2.6 * TAU - ph); pts.push([x + Math.cos(ang) * d - Math.sin(ang) * off, y + Math.sin(ang) * d + Math.cos(ang) * off]); }
    line(g, pts, 9.5, C.ink, { taper: 0.45 }); line(g, pts, 6.4, K.tape, { taper: 0.45 }); line(g, pts.map((p) => [p[0], p[1] - 1.4]), 1.6, K.tapeHi, { taper: 0.5 });
    return pts[pts.length - 1];
  }
  function kingTip(P, Lay) { const gp = gripLay(KING, P, Lay), a = num(P.propAng, -1.4); return [gp[0] + Math.cos(a) * KING_REACH, gp[1] + Math.sin(a) * KING_REACH]; }
  function kingFx(g, S, name) {
    const tp = S.pt.tip, t = S.t, a = num(S.P.propAng);
    if (name === 'muteHi') RJ.fx.mute(g, S.pt.head[0] + 38, S.pt.head[1] - 126, t);
    else if (name === 'tapelash') { const e = tapeLash(g, tp[0] + Math.cos(a) * 14, tp[1] + Math.sin(a) * 14, a, t, 120); burst(g, S, e[0], e[1], 16); RJ.fx.notes(g, e[0] - 40, e[1] - 10, t, K.or, 2); }
    else if (name === 'reelnotes') { RJ.fx.notes(g, tp[0] - 30, tp[1] - 8, t, K.or, 3); RJ.fx.sparkles(g, tp[0], tp[1], [[24, -14, 6, 0.2], [-22, -20, 5, 0], [10, 24, 4, 0.4]], K.yellow, t); }
    else if (name === 'confetti') confetti(g, S.pt.head[0], S.pt.head[1] - 90, t);
  }
  // little paper scraps and stars thrown up (cheer)
  function confetti(g, x, y, t) {
    const cols = [K.or, K.yellow, K.teal, K.pink, K.cream];
    for (let i = 0; i < 9; i++) {
      const u = fr(num(t) * 0.7 + hash(i, 5)), px = x + (hash(i, 9) - 0.5) * 170 + Math.sin(u * 7 + i) * 8, py = y - 20 + u * 90 - 30 * Math.sin(PI * u);
      g.save(); g.globalAlpha = Math.sin(PI * u); g.translate(px, py); g.rotate(u * 8 + i);
      if (i % 3 === 0) RJ.cel(g, starPts(0, 0, 5, 0), cols[i % 5], { shadow: false, line: LINE.fine, tension: 0 });
      else RJ.cel(g, [[-4, -2.4], [4, -2.4], [4, 2.4], [-4, 2.4]], cols[i % 5], { shadow: false, line: LINE.fine, tension: 0 });
      g.restore();
    }
  }
  function kingPoses() {
    const proud = { eyes: 'open', mouth: 'grin', brow: 0.12 };
    return {
      idle: Object.assign({ mic: 'none', fHand: [30, 30], fBend: 1, fKind: 'fist', propAng: -1.3, bHand: [-12, 38], bBend: -1, bKind: 'fist', bRot: 0.4, torsoRot: -0.035, headRot: -0.06, fx: [] }, proud),
      sing: { mic: 'none', fHand: [26, -34], fBend: 1, fKind: 'fist', propAng: -1.45, spin: 2.2, bHand: [-42, -6], bBend: -1, bKind: 'open', bSpread: 1.2, bRot: -0.3, torsoRot: -0.05, headRot: -0.1, eyes: 'half', mouth: 'sing', brow: -0.1, fx: ['reelnotes'], look: [0.4, -0.3] },
      attack: { mic: 'none', fHand: [44, -4], fBend: 1, fKind: 'fist', propAng: -0.22, spin: 3, lean: 0.08, torsoRot: 0.05, headRot: 0.05, bHand: [-30, 20], bBend: -1, bKind: 'fist', bRot: 0.2,
        fFoot: [36, -12], bFoot: [-30, -12], eyes: 'determined', mouth: 'grin', brow: 0.45, fx: ['tapelash'], look: [0.6, 0] },
      windup: { mic: 'none', fHand: [40, -16], fBend: 1, fKind: 'fist', propAng: -1.5, spin: 3, lean: -0.07, torsoRot: -0.06, headRot: -0.08, squash: 0.98, bHand: [-36, 8], bBend: -1, bKind: 'fist',
        fFoot: [28, -12], bFoot: [-30, -12], eyes: 'determined', mouth: 'grit', brow: 0.45, fx: [], look: [0.5, -0.2] },
      strike: { mic: 'none', fHand: [46, -2], fBend: 1, fKind: 'fist', propAng: -0.1, spin: 4, lean: 0.14, bx: 6, torsoRot: 0.07, headRot: 0.06, headDx: 3, bHand: [-30, 22], bBend: -1, bKind: 'fist',
        fFoot: [40, -12], bFoot: [-30, -12], eyes: 'determined', mouth: 'grin', brow: 0.5, fx: ['tapelash'], look: [0.6, 0] },
      hurt: { mic: 'none', fHand: [22, 34], fBend: 1, fKind: 'fist', propAng: 0.55, spin: -1, lean: -0.13, torsoRot: -0.08, headRot: -0.16, headDx: -3, bHand: [-36, -10], bBend: -1, bKind: 'open', bSpread: 1.3, bFront: 1,
        fFoot: [14, -12], bFoot: [-22, -12], eyes: 'hurt', mouth: 'ow', brow: -0.7, sweat: 1, blush: 0.6, fx: ['stars'] },
      cheer: { mic: 'none', fHand: [24, -42], fBend: 1, fKind: 'fist', propAng: -1.42, spin: 3, bHand: [-38, -36], bBend: -1, bKind: 'open', bSpread: 1.4, bRot: 0.2, headRot: -0.04,
        fFoot: [22, -12], bFoot: [-20, -12], eyes: 'happy', mouth: 'happyOpen', brow: -0.2, fx: ['sparkles', 'confetti'] },
      block: { mic: 'none', fHand: [40, 14], fBend: 1, fKind: 'fist', propAng: -1.55, spin: 0.4, twoHand: 1, bHand: [42, 54], bBend: 1, bKind: 'fist', bFront: 1, headRot: -0.08, torsoRot: -0.02,
        fFoot: [30, -12], bFoot: [-32, -12], eyes: 'open', mouth: 'smirkTeeth', brow: 0.35, fx: ['rings'] },
      down: { mic: 'none', fHand: [26, 40], fBend: 1, fKind: 'relaxed', propAng: 0.12, spin: 0.2, by: 52, torsoDy: 4, torsoRot: 0.08, lean: 0.02, headRot: 0.26, headDy: 2, bHand: [-4, 50], bBend: -1, bKind: 'relaxed', bRot: 0.3,
        capeHem: -86, capeK: 0.4, fFoot: [-12, -60], bFoot: [16, -60], fBow: 24, bBow: -22, fFootRot: -0.5, bFootRot: 0.4, eyes: 'closed', mouth: 'frown', brow: -0.25, blush: 0.6, fx: ['muteHi'] },
      walk: Object.assign({ mic: 'none', fHand: [30, 30], fBend: 1, fKind: 'fist', propAng: -1.3, bHand: [-24, 34], bBend: -1, bKind: 'fist', torsoRot: -0.03, headRot: -0.05, fx: [] }, proud),
      bust: Object.assign({ mic: 'none', fHand: [16, 52], fBend: 1, fKind: 'fist', propAng: -1.22, bHand: [-12, 54], bBend: 1, bKind: 'relaxed', torsoRot: -0.03, headRot: -0.05, fx: [] }, proud),
    };
  }
  const KING = {
    id: 'npc_scrap_cassette', accent: 'scrap_kings',
    skel: { neck: [0, -166], headC: [2, -224], shF: [33, -151], shB: [-33, -151], hip: [0, -80], hipF: [18, -76], hipB: [-18, -76] },
    base: {},
    poses: kingPoses(),
    life: { idle: { bob: 1.2, per: 3.6, sway: 0.01, head: 0.014 }, walk: { bob: 2.2, per: 0.55, head: 0.01, step: { hz: 1.8, stride: 9, lift: 4 } } },
    face: {
      eyes: [{ x: -14, y: 13, w: 31, h: 29 }, { x: 39, y: 11, w: 26, h: 27 }],
      brows: [[-14, -12, 30], [44, -12, 26]], browStyle: { thick: 7.2, arch: 0.5, tilt: 0.1, color: KC.hairSh },
      nose: [28, 26, 64], mouth: [17, 47, 22], mouthStyle: { lineW: 1.6, teeth: true },
      blush: [[-22, 30, 20], [42, 28, 16]], sweat: [58, -14, 5],
      eye: { iris: KC.iris, ring: '#2a1206', sclera: '#fffbf4', expr: 'neutral', irisW: 0.72, irisH: 0.95, lid: 2.1, wing: 0.55, lash: 1.1, crease: true, lashes: 0, tilt: 0.06, drop: 0.1, hl: [[-0.4, -0.5, 0.28], [-0.34, -0.12, 0.13]] },
    },
    exprs: EXPRS,
    arm: { l: [28, 26], w: [23, 18], skin: KC.skin, skinSh: KC.skinSh, sleeve: { color: KC.shirt, shade: KC.shirtSh, len: 0.94, w0: 26, w1: 25 }, cuff: { color: K.gold, light: K.goldSh }, hand: { skin: KC.skin, shade: KC.skinSh } },
    legs: { w: [44, 37], color: K.or, shade: K.orSh, pantsOver: true, bow: 2, profile: (u) => 1 - 0.12 * u, shoe: Object.assign({}, BOOT, { toeCap: K.gold, k: 1.42 }), decor: overallLegs({ patch: KC.shirt, cuff: K.gold, cuffSh: K.goldSh, cuffW: 19 }) },
    bounds: { x0: -116, x1: 132, h: 344 },
    bust: { rect: [-106, -342, 106, -110], face: [-82, -336, 78, -156], pose: 'bust' },
    tip: kingTip,
    tweak(P, t) {
      if (P.pose === 'walk') P.propAng += 0.12 * Math.sin(PI * t * 1.8) * tk.motion();
      else if (P.pose === 'idle') P.propAng += 0.03 * Math.sin(t * 1.3);
      if (P.twoHand) { const b = backOnShaft(KING, P, 34); P.bHand = b; }
    },
    layers: { backHair: kingCape, torso: kingTorso, head: kingHead, top: kingSceptre, fx: kingFx },
  };
  RJ.register('npc_scrap_cassette', scrapRig(KING));

  // =====================================================================================================================================
  // JACK HAMMER (enforcer): broad shoulders, thick arms, flat-top hair, amber goggles pushed up, a cream tank top, one strap down, stubble,
  // a gap-tooth grin; a sledge with a taped handle and rubber-capped steel head, and an anvil-drum to slam it on.
  // =====================================================================================================================================
  const JK = {
    skin: '#c98a5e', skinSh: '#a8683f', hair: '#2b1d17', hairSh: '#140c09', hairHi: '#5e4638', stub: '#8e5a3a',
    tank: '#f6eedd', tankSh: '#dccfb2', lens: '#ffb347', lensDk: '#e07a1e', rubber: K.rubber,
    wood: '#e2b071', woodSh: '#b97f42', iris: ['#2a1408', '#7a4a24'],
  };
  const JACK_SKULL = RJ.skullPts({ w: 1.08, h: 0.98, chin: 5 });
  const JACK_HAIR = [[-62, -6], [-65, -30], [-60, -52], [-50, -70, 1], [-20, -73], [12, -73], [40, -70], [55, -64, 1], [61, -46], [58, -36], [40, -42], [12, -44], [-18, -42], [-38, -32], [-47, -12], [-48, 12, 1], [-57, 8]];
  function jackHead(g, S) {
    headBase(g, S, { skull: JACK_SKULL, skin: JK.skin, shade: JK.skinSh, cast: [[-58, -36], [-30, -48], [0, -50], [30, -48], [58, -38], [52, -24], [20, -38], [-10, -38], [-40, -20]], castDy: 6, under: (gg) => {
      gg.beginPath(); tk.trace(gg, [[-48, 26], [-34, 44], [-12, 54], [6, 56], [26, 54], [46, 42], [58, 24], [64, 50], [30, 74], [-10, 74], [-44, 64]], 0, 0, 0.5); gg.fillStyle = JK.stub; gg.globalAlpha = 0.42; gg.fill(); gg.globalAlpha = 1;
      RJ.hatch(gg, [[-30, 46, -29, 49], [-20, 51, -19, 54], [-8, 55, -7, 58], [6, 57, 7, 60], [20, 56, 21, 59], [34, 50, 35, 53], [-38, 40, -37, 43]], { w: 0.9, color: '#6e4128', alpha: 0.6 });
    } });
    RJ.cel(g, JACK_HAIR, JK.hair, { shadow: JK.hairSh, line: LINE.main + 0.1, tension: 0.55, depth: 6, hi: JK.hairHi, hiW: 1.6, hiAlpha: 0.75, decor: (gg) => {
      RJ.hatch(gg, [[-40, -66, -38, -58], [-24, -70, -22, -62], [-8, -70, -6, -62], [8, -70, 10, -62], [24, -69, 26, -61], [40, -66, 41, -58], [-56, -30, -50, -24], [-54, -10, -50, -4]], { color: JK.hairHi, w: 1.2, alpha: 0.7 });
    } });
    RJ.ear(g, -56, 22, { r: 14.5, side: -1, skin: JK.skin, shade: JK.skinSh });
    // the goggles pushed up on the forehead
    const sw = S.P.goggleDy || 0;
    cable(g, [[-64, -26 + sw], [-40, -34 + sw], [-10, -38 + sw], [20, -38 + sw], [50, -34 + sw], [64, -28 + sw]], 7, JK.rubber, { hi: K.rubberHi });
    [[2, -42 + sw, 15], [42, -40 + sw, 12.5]].forEach((l, i) => {
      RJ.cel(g, tk.circlePts(l[0], l[1], l[2], 16), K.brass, { shadow: K.brassSh, line: LINE.main, depth: 2.4, hi: K.goldHi, hiW: 1.2 });
      RJ.cel(g, tk.circlePts(l[0], l[1], l[2] - 4, 14), JK.lens, { shadow: JK.lensDk, line: LINE.fine + 0.3, depth: l[2] * 0.3, decor: (gg) => {
        gg.save(); gg.globalAlpha = 0.85; gg.fillStyle = '#ffffff';
        gg.beginPath(); gg.ellipse(l[0] + 3, l[1] - 4, l[2] * 0.22, l[2] * 0.12, -0.6, 0, TAU); gg.fill();
        gg.beginPath(); gg.arc(l[0] - 3, l[1] + 3, l[2] * 0.08, 0, TAU); gg.fill(); gg.restore();
      } });
      if (!i) bolt(g, l[0] - l[2] + 1, l[1], 2.2, K.metal);
    });
    cable(g, [[17, -42 + sw], [24, -44 + sw], [30, -42 + sw]], 3.4, K.brass);
  }
  function jackTorso(g, S) {
    RJ.neck(g, 2, -160, { w: 32, h: 20, skin: JK.skin, shade: JK.skinSh });
    // the skin of the chest and shoulders, then the tank top over it
    RJ.cel(g, shirtPts(1.4, -152, -68, 6), JK.skin, { shadow: JK.skinSh, line: LINE.main, depth: 7, tension: 0.5 });
    const T = [[-26, -151], [-15, -151], [-8, -138], [10, -138], [17, -151], [28, -151], [36, -132], [50, -116], [56, -68, 1], [-56, -68, 1], [-50, -116], [-36, -132]];
    RJ.cel(g, T, JK.tank, { shadow: JK.tankSh, line: LINE.main, depth: 7, tension: 0.4, hi: '#ffffff', hiW: 1.4, decor: (gg) => {
      for (let x = -48; x <= 50; x += 6) RJ.ink(gg, [[x, -128], [x + 1, -70]], { w: 0.8, color: JK.tankSh, taper: 0, wobble: 0, alpha: 0.7 });
    } });
    RJ.ink(g, [[-8, -138], [1, -134], [10, -138]], { w: 1.2, color: JK.tankSh, taper: 0.2, wobble: 0 });
    overalls(g, S, { k: 1.36, top: -128, waist: -98, bot: -66, belly: 4, strapTop: -152, strapDown: -1,
      patches: [[-30, -80, 13, 12, -0.2, K.teal], [24, -106, 12, 10, 0.12, K.yellow]],
      pocket: (gg, x, y) => {                                 // a little hammer badge
        gg.save(); gg.translate(x, y + 8); gg.rotate(-0.5);
        RJ.cel(gg, [[-1.2, -2], [1.2, -2], [1.2, 8], [-1.2, 8]], JK.wood, { shadow: false, line: LINE.fine, tension: 0 });
        RJ.cel(gg, rbox(-6, -6, 12, 5, 1.4, 2), K.steel, { shadow: false, line: LINE.fine, tension: 0 });
        gg.restore();
      } });
    // a rag hanging from the hip pocket
    const sw = S.sway * 3;
    RJ.cel(g, [[-42, -92], [-30, -94], [-28 + sw, -76], [-30 + sw, -62, 1], [-35 + sw, -68], [-40 + sw, -60, 1], [-44 + sw, -74]], K.red, { shadow: RJ.shade(K.red, 0.12), line: LINE.mid, tension: 0.4, depth: 3, decor: (gg) => { gg.fillStyle = '#fff'; [[-36, -84], [-33, -74], [-40, -72]].forEach((p) => { gg.beginPath(); gg.arc(p[0], p[1], 1.3, 0, TAU); gg.fill(); }); } });
  }
  // the sledge in its own frame: grip at the origin, +x along the handle toward the head
  const JACK_REACH = 100;
  function jackSledge(g, S) {
    g.save(); toFig(g, S.M.head);
    const P = S.P, gp = gripOf(S), a = num(P.propAng, 1.1), li = litIn(a);
    g.save(); g.translate(gp.x, gp.y); g.rotate(a);
    RJ.cel(g, [[-44, -4.8], [86, -4.2], [86, 4.2], [-44, 4.8]], JK.wood, { shadow: JK.woodSh, line: LINE.main, tension: 0, depth: 2.6, light: li, hi: '#f6d6a2', hiW: 1.1, decor: (gg) => {
      RJ.ink(gg, [[10, -1], [40, 0.6], [62, -0.8]], { w: 0.8, color: JK.woodSh, taper: 0.4, wobble: 0, alpha: 0.8 });
    } });
    RJ.cel(g, [[-46, -5.2], [14, -5], [14, 5], [-46, 5.2]], K.or, { shadow: K.orSh, line: LINE.mid, tension: 0, depth: 2.4, light: li, decor: (gg) => { for (let x = -42; x < 14; x += 5) RJ.ink(gg, [[x, -5], [x + 3, 5]], { w: 0.9, color: K.orDk, taper: 0, wobble: 0, alpha: 0.7 }); } });
    // the head: a steel block with an orange band and black rubber caps
    g.save(); g.translate(JACK_REACH, 0);
    RJ.cel(g, rbox(-16, -27, 32, 54, 5, 2), K.steel, { shadow: K.steelSh, line: LINE.main + 0.2, tension: 0, depth: 4, light: li, hi: K.steelHi, hiW: 1.4, decor: (gg) => {
      gg.fillStyle = K.or; gg.fillRect(-17, -6, 34, 12); RJ.ink(gg, [[-17, -6], [17, -6]], { w: 1, color: K.orDk, taper: 0, wobble: 0 }); RJ.ink(gg, [[-17, 6], [17, 6]], { w: 1, color: K.orDk, taper: 0, wobble: 0 });
    } });
    [-1, 1].forEach((sd) => RJ.cel(g, rbox(-18, sd < 0 ? -38 : 26, 36, 12, 5, 2), K.rubber, { shadow: K.rubberSh, line: LINE.main, tension: 0, depth: 2.6, light: li, hi: K.rubberHi, hiW: 1 }));
    [[-9, -17], [9, -17], [-9, 17], [9, 17]].forEach((p) => bolt(g, p[0], p[1], 2.4, K.metal));
    g.restore();
    g.restore();
    handOver(g, S, true, 'fist');
    if (P.twoHand) handOver(g, S, false, 'fist');
    g.restore();
  }
  function jackTip(P, Lay) { const gp = gripLay(JACK, P, Lay), a = num(P.propAng, 1.1); return [gp[0] + Math.cos(a) * JACK_REACH, gp[1] + Math.sin(a) * JACK_REACH]; }
  // the anvil-drum: a stubby orange-striped anvil with drum lugs and a cymbal on a spring, sitting on the ground at x
  function anvil(g, x, t, hit) {
    const y = 0, sq = 1 - 0.05 * hit;
    g.save(); g.fillStyle = 'rgba(20,6,40,0.26)'; g.beginPath(); g.ellipse(x, y + 1.5, 34, 6, 0, 0, TAU); g.fill(); g.restore();
    g.save(); g.translate(x, y); g.scale(1, sq);
    RJ.cel(g, [[-16, 0, 1], [-12, -12], [-8, -20], [8, -20], [12, -12], [16, 0, 1]], K.steelSh, { shadow: '#43475a', line: LINE.main, tension: 0.4, depth: 4 });
    RJ.cel(g, [[-34, -32, 1], [-20, -36], [26, -36], [36, -32, 1], [24, -24], [-18, -22], [-28, -26]], K.steel, { shadow: K.steelSh, line: LINE.main, tension: 0.3, depth: 3, hi: K.steelHi, hiW: 1.5, decor: (gg) => { gg.fillStyle = K.or; gg.fillRect(-40, -30, 80, 3.2); } });
    RJ.cel(g, [[-26, -36], [-48, -40, 1], [-28, -28]], K.steel, { shadow: K.steelSh, line: LINE.main, tension: 0.2, depth: 2 });
    [[-10, -12], [10, -12]].forEach((p) => bolt(g, p[0], p[1], 2.4, K.gold));
    g.restore();
  }
  function jackFx(g, S, name) {
    const t = S.t, tp = S.pt.tip, b = S.beat;
    if (name === 'anvil') anvil(g, S.P.anvilX || 112, t, S.P.pose === 'strike' || S.P.pose === 'attack' ? b : 0);
    else if (name === 'clang') {
      const x = tp[0], y = tp[1] + 22;
      g.save(); g.lineCap = 'round';
      for (let k = 0; k < 2; k++) {
        const u = fr(t * 2.6 + k * 0.5), r = 14 + u * 46, al = 1 - u;
        g.globalAlpha = al; g.strokeStyle = C.ink; g.lineWidth = 6; g.beginPath(); g.ellipse(x, y, r, r * 0.42, 0, PI * 1.05, PI * 1.95); g.stroke();
        g.strokeStyle = k ? K.yellow : K.or; g.lineWidth = 3.4; g.beginPath(); g.ellipse(x, y, r, r * 0.42, 0, PI * 1.05, PI * 1.95); g.stroke();
      }
      g.restore();
      if (b > 0.3) burst(g, S, x + 6, y - 24, 14);
      sparkSpray(g, x, y - 6, -PI / 2, t, { n: 9, len: 46, spread: 2.6, seed: 4, rate: 2.6 });
      RJ.fx.notes(g, x - 40, y - 46, t, K.or, 2);
    } else if (name === 'tnotes') RJ.fx.notes(g, tp[0] - 34, tp[1] - 4, t, K.or, 3);
  }
  function jackPoses() {
    const cheeky = { eyes: 'open', mouth: 'grin', brow: 0.15 };
    return {
      idle: Object.assign({ mic: 'none', fHand: [24, 30], fBend: 1, fKind: 'fist', propAng: 0.98, bHand: [-10, 38], bBend: -1, bKind: 'fist', bRot: 0.4, headRot: 0.03, torsoRot: -0.02,
        fFoot: [28, -12], bFoot: [-28, -12], fx: [] }, cheeky),
      sing: { mic: 'none', fHand: [34, -30], fBend: 1, fKind: 'fist', propAng: -1.22, bHand: [-40, -10], bBend: -1, bKind: 'fist', bRot: -0.2, headRot: -0.08, torsoRot: -0.04,
        fFoot: [30, -12], bFoot: [-30, -12], eyes: 'happy', mouth: 'happyOpen', brow: -0.1, fx: ['tnotes'] },
      attack: { mic: 'none', fHand: [40, 22], fBend: 1, fKind: 'fist', propAng: 0.6, anvilX: 168, bHand: [-32, 12], bBend: -1, bKind: 'fist', bRot: 0.3, lean: 0.1, torsoRot: 0.1, headRot: 0.08, headDx: 3,
        fFoot: [34, -12], bFoot: [-32, -12], eyes: 'determined', mouth: 'grit', brow: 0.5, fx: ['anvil', 'clang'], look: [0.6, 0.3] },
      windup: { mic: 'none', fHand: [30, -38], fBend: 1, fKind: 'fist', propAng: -1.5, anvilX: 168, twoHand: 1, bHand: [40, -40], bBend: 1, bKind: 'fist', bFront: 1, lean: -0.1, torsoRot: -0.06, headRot: -0.1, squash: 0.98, goggleDy: -2,
        fFoot: [30, -12], bFoot: [-32, -12], eyes: 'determined', mouth: 'grin', brow: 0.45, fx: ['anvil'], look: [0.5, -0.3] },
      strike: { mic: 'none', fHand: [44, 26], fBend: 1, fKind: 'fist', propAng: 0.66, anvilX: 178, bHand: [-34, 6], bBend: -1, bKind: 'fist', bRot: 0.3, lean: 0.16, bx: 6, torsoRot: 0.12, headRot: 0.1, headDx: 4, squash: 0.98,
        fFoot: [38, -12], bFoot: [-32, -12], eyes: 'determined', mouth: 'grit', brow: 0.55, fx: ['anvil', 'clang'], look: [0.6, 0.4] },
      hurt: { mic: 'none', fHand: [14, 40], fBend: 1, fKind: 'fist', propAng: 1.9, lean: -0.12, torsoRot: -0.08, headRot: -0.15, headDx: -3, bHand: [-36, -8], bBend: -1, bKind: 'open', bSpread: 1.3, bFront: 1, goggleDy: 3,
        fFoot: [16, -12], bFoot: [-24, -12], eyes: 'hurt', mouth: 'ow', brow: -0.7, sweat: 1, blush: 0.6, fx: ['stars'] },
      cheer: { mic: 'none', fHand: [26, -44], fBend: 1, fKind: 'fist', propAng: -1.35, bHand: [-36, -36], bBend: -1, bKind: 'fist', bRot: -0.2, headRot: 0.03,
        fFoot: [24, -12], bFoot: [-22, -12], eyes: 'happy', mouth: 'grin', brow: -0.2, fx: ['sparkles'] },
      block: { mic: 'none', fHand: [34, 26], fBend: 1, fKind: 'fist', propAng: 3.02, twoHand: 1, bHand: [10, 40], bBend: 1, bKind: 'fist', bFront: 1, headRot: -0.06, torsoRot: -0.02,
        fFoot: [34, -12], bFoot: [-34, -12], eyes: 'determined', mouth: 'smirkTeeth', brow: 0.4, fx: ['rings'] },
      down: { mic: 'none', fHand: [26, 40], fBend: 1, fKind: 'relaxed', propAng: 0.18, by: 52, torsoDy: 4, torsoRot: 0.08, lean: 0.02, headRot: 0.24, headDy: 2, bHand: [-6, 48], bBend: -1, bKind: 'relaxed', bRot: 0.3, goggleDy: 6,
        fFoot: [-12, -60], bFoot: [16, -60], fBow: 24, bBow: -22, fFootRot: -0.5, bFootRot: 0.4, eyes: 'closed', mouth: 'flat', brow: -0.25, blush: 0.6, fx: ['mute'] },
      walk: Object.assign({ mic: 'none', fHand: [26, 30], fBend: 1, fKind: 'fist', propAng: 0.75, bHand: [-24, 34], bBend: -1, bKind: 'fist', headRot: 0.03, fx: [] }, cheeky),
      bust: Object.assign({ mic: 'none', fHand: [18, 50], fBend: 1, fKind: 'fist', propAng: 1.2, bHand: [-10, 52], bBend: 1, bKind: 'relaxed', headRot: 0.03, fx: [] }, cheeky),
    };
  }
  const JACK = {
    id: 'npc_scrap_hammer', accent: 'scrap_kings',
    skel: { neck: [0, -148], headC: [2, -206], shF: [39, -133], shB: [-39, -133], hipF: [18, -72], hipB: [-18, -72] },
    base: {},
    poses: jackPoses(),
    life: { idle: { bob: 1.4, per: 2.8, sway: 0.012, head: 0.016 }, walk: { bob: 3, per: 0.5, head: 0.012, step: { hz: 1.8, stride: 10, lift: 4 } } },
    face: {
      eyes: [{ x: -12, y: 15, w: 29, h: 27 }, { x: 40, y: 13, w: 24, h: 25 }],
      brows: [[-13, -9, 30], [44, -9, 26]], browStyle: { thick: 7.4, arch: 0.3, tilt: 0.14, color: JK.hair },
      nose: [28, 31, 70], mouth: [11, 46, 28], mouthStyle: { lineW: 1.7, teeth: true },
      blush: [[-20, 34, 20], [42, 32, 16]], blushColor: '#ff7d7d', sweat: [58, -18, 5],
      eye: { iris: JK.iris, ring: '#1e0e06', sclera: '#fffbf4', expr: 'neutral', irisW: 0.7, irisH: 0.95, lid: 2.2, wing: 0.45, lash: 1.1, crease: true, lashes: 0, tilt: 0.1, drop: 0.08, hl: [[-0.4, -0.5, 0.28], [-0.34, -0.12, 0.12]] },
    },
    exprs: EXPRS,
    arm: { l: [27, 25], w: [31, 24], skin: JK.skin, skinSh: JK.skinSh, sleeve: null, cuff: { color: K.or, light: K.orSh }, hand: { skin: JK.skin, shade: JK.skinSh, k: 1.15 } },
    legs: { w: [46, 40], color: K.or, shade: K.orSh, pantsOver: true, bow: 2, profile: (u) => 1 - 0.1 * u, shoe: Object.assign({}, BOOT, { k: 1.45 }), decor: overallLegs({ patch: K.teal, cuffW: 22 }) },
    bounds: { x0: -104, x1: 156, h: 292 },
    bust: { rect: [-104, -292, 104, -86], face: [-78, -284, 78, -142], pose: 'bust' },
    tip: jackTip,
    tweak(P, t) {
      if (P.pose === 'attack' || P.pose === 'strike') { const b = P.beat, u = 1 - b; P.propAng -= 1.5 * u; P.fHand = [P.fHand[0] - 10 * u, P.fHand[1] - 34 * u]; P.lean -= 0.06 * u; }
      else if (P.pose === 'walk') P.propAng += 0.1 * Math.sin(PI * t * 1.8) * tk.motion();
      else if (P.pose === 'sing') P.propAng += 0.08 * Math.sin(PI * t * 2);
      if (P.twoHand) P.bHand = backOnShaft(JACK, P, P.pose === 'block' ? 48 : -26);
    },
    layers: { torso: jackTorso, head: jackHead, top: jackSledge, fx: jackFx },
  };
  RJ.register('npc_scrap_hammer', scrapRig(JACK));

  // =====================================================================================================================================
  // WELD (grunt): short and stocky, welding helmet down with a wide tinted visor (the big eyes shine through), an orange flame stripe and
  // stickers, canvas gloves with gauntlets, a blue-grey work shirt under full overalls, a hissing torch with a blue flame and tiny sparks.
  // =====================================================================================================================================
  const WD = {
    skin: '#ffd9bd', skinSh: '#f2b08c', tuft: '#e8803a', tuftSh: '#b85520', tuftHi: '#ffb070',
    shirt: '#6f8bb8', shirtSh: '#4f6896', shirtHi: '#9fb6dc', mask: '#4f4c60', maskSh: '#353246', maskHi: '#7a7690',
    glove: '#efcf86', gloveSh: '#cfa258', glass: 'rgba(32,70,86,0.36)', frame: '#2e2c3a', hose: '#3a6fd0',
    iris: ['#153a4a', '#3fa2c0'],
  };
  const WELD_SKULL = RJ.skullPts({ w: 1.06, h: 1.0, chin: 1 });
  const WELD_SHELL = [[-62, 16], [-66, -12], [-60, -38], [-42, -58], [-10, -68], [24, -65], [48, -52], [63, -30], [68, -4], [66, 20], [60, 34, 1], [30, 37], [2, 38], [-22, 35], [-42, 30], [-56, 26]];
  const WELD_VIS = rbox(-30, -6, 92, 37, 11, 3);
  function weldHead(g, S) {
    const sw = S.P.hairSwing;
    // ginger tufts out the back under the helmet
    [[[-56, 18], [-74, 22], [-84, 14]], [[-52, 26], [-68, 36], [-76, 32]], [[-58, 8], [-76, 4], [-82, -6]]].forEach((sp, i) => RJ.lock(g, sp, WD.tuft, { wMax: 12, w0: 11, w1: 0, tipPow: 1.3, bend: sw * 0.2 * (i + 1), gloss: true, glossColor: WD.tuftHi, glossAlpha: 0.7, strands: 1, shadow: WD.tuftSh }));
    headBase(g, S, { skull: WELD_SKULL, skin: WD.skin, shade: WD.skinSh });
    // the helmet shell
    RJ.cel(g, WELD_SHELL, WD.mask, { shadow: WD.maskSh, line: LINE.main + 0.3, tension: 0.7, depth: 9, hi: WD.maskHi, hiW: 2, decor: (gg) => {
      // an orange flame stripe over the top
      gg.beginPath(); tk.trace(gg, [[-66, -10], [-60, -34], [-40, -54], [-8, -64], [26, -60], [44, -48], [36, -44, 1], [30, -52], [16, -46, 1], [6, -54], [-8, -44, 1], [-18, -50], [-30, -38, 1], [-40, -42], [-50, -26, 1], [-56, -24], [-62, -4]], 0, 0, 0.5);
      gg.fillStyle = K.or; gg.fill(); gg.lineWidth = 1.4; gg.strokeStyle = K.orDk; gg.stroke();
      // the chin guard's ridge
      RJ.ink(gg, [[-40, 26], [0, 33], [52, 30]], { w: 1.2, color: WD.maskHi, taper: 0.3, wobble: 0, alpha: 0.7 });
    } });
    // stickers: a yellow star and a pink note
    RJ.cel(g, starPts(-40, -16, 7.5, 0.2), K.yellow, { shadow: K.goldSh, line: LINE.fine + 0.3, tension: 0, depth: 1.4 });
    g.save(); g.translate(-26, 20); g.rotate(-0.2);
    RJ.cel(g, tk.circlePts(0, 0, 6.5, 12), K.pink, { shadow: RJ.shade(K.pink, 0.1), line: LINE.fine + 0.3, depth: 1.2 });
    tk.note(g, 0.4, 0.6, 8, { kind: 'eighth', color: '#ffffff' });
    g.restore();
    // the visor window: the face shows through tinted glass
    g.save();
    g.beginPath(); tk.trace(g, WELD_VIS, 0, 0, 0); g.clip();
    g.fillStyle = WD.skin; g.fillRect(-40, -12, 110, 50);
    g.fillStyle = WD.skinSh; g.beginPath(); g.rect(-40, -12, 110, 50); tk.trace(g, WELD_VIS, RJ.lx(3), 4, 0); g.fill('evenodd');
    RJ.drawFace(g, S);
    g.fillStyle = WD.glass; g.fillRect(-40, -12, 110, 50);
    g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(-40, -12, 110, 9);
    g.globalAlpha = 0.55; line(g, [[30, -6], [16, 31]], 6, '#ffffff'); line(g, [[44, -6], [34, 31]], 2.4, '#ffffff'); g.globalAlpha = 1;
    g.restore();
    tk.inkPath(g, WELD_VIS, { closed: true, w: 5.6, color: C.ink, wobble: 0, weightVar: 0, tension: 0 });
    tk.inkPath(g, WELD_VIS, { closed: true, w: 3, color: WD.frame, wobble: 0, weightVar: 0, tension: 0 });
    // the hinge bolt
    RJ.cel(g, tk.circlePts(-48, 6, 7, 12), K.metal, { shadow: K.metalSh, line: LINE.mid, depth: 2, hi: K.metalHi });
    bolt(g, -48, 6, 3, K.gold);
  }
  function weldTorso(g, S) {
    RJ.neck(g, 2, -150, { w: 24, h: 16, skin: WD.skin, shade: WD.skinSh });
    RJ.cel(g, shirtPts(1.04, -141, -60, 5), WD.shirt, { shadow: WD.shirtSh, line: LINE.main, depth: 7, hi: WD.shirtHi, hiW: 1.5, hiAlpha: 0.7, tension: 0.5 });
    RJ.cel(g, [[-14, -142, 1], [-4, -132], [2, -128, 1], [8, -132], [16, -142, 1], [8, -140], [2, -134], [-4, -140]], WD.shirtHi, { shadow: false, line: LINE.mid, tension: 0.3 });
    overalls(g, S, { k: 1.06, top: -122, waist: -94, bot: -58, belly: 6, strapTop: -140,
      patches: [[-26, -76, 13, 11, 0.15, K.sky], [22, -110, 11, 10, -0.1, K.pink]],
      pocket: (gg, x, y) => { cable(gg, [[x - 5, y + 2], [x - 6, y - 8]], 2.6, K.yellow); cable(gg, [[x + 4, y + 2], [x + 6, y - 7]], 2.6, K.red); } });
    // a fat round gas canister on the belt at the back hip with the hose port
    RJ.cel(g, rbox(-50, -96, 13, 26, 6, 3), K.red, { shadow: RJ.shade(K.red, 0.14), line: LINE.main, tension: 0.2, depth: 3, hi: '#ff9a8a', hiW: 1.2 });
    RJ.cel(g, rbox(-47, -101, 7, 6, 2, 2), K.metal, { shadow: K.metalSh, line: LINE.fine + 0.3, tension: 0, depth: 1 });
  }
  const WELD_REACH = 66;
  function weldTorch(g, S) {
    g.save(); toFig(g, S.M.head);
    const P = S.P, gp = gripOf(S), a = num(P.propAng, -0.5), li = litIn(a), t = S.t, f = num(P.flame, 0.8);
    // the hose from the torch back to the canister
    const hp = tPt(S, -44, -101), bk = [gp.x - Math.cos(a) * 14, gp.y - Math.sin(a) * 14];
    cable(g, [bk, [bk[0] - Math.cos(a) * 14, bk[1] + 18], [(bk[0] + hp[0]) / 2, Math.max(bk[1], hp[1]) + 26], [hp[0], hp[1]]], 3.4, WD.hose, { hi: '#8fb4ff' });
    g.save(); g.translate(gp.x, gp.y); g.rotate(a);
    RJ.cel(g, rbox(-16, -5.5, 30, 11, 4, 2), K.rubber, { shadow: K.rubberSh, line: LINE.main, tension: 0, depth: 2.4, light: li, hi: K.rubberHi, hiW: 1, decor: (gg) => { for (let x = -12; x < 12; x += 4) RJ.ink(gg, [[x, -5], [x, 5]], { w: 0.8, color: K.rubberHi, taper: 0, wobble: 0, alpha: 0.6 }); } });
    RJ.cel(g, [[13, -4], [46, -3.2], [46, 3.2], [13, 4]], K.brass, { shadow: K.brassSh, line: LINE.main, tension: 0, depth: 2, light: li, hi: K.goldHi, hiW: 1 });
    [[20, K.blue], [30, K.red]].forEach((v) => { RJ.cel(g, [[v[0] - 3, -4], [v[0] + 3, -4], [v[0] + 3, -9], [v[0] - 3, -9]], K.metal, { shadow: K.metalSh, line: LINE.fine + 0.2, tension: 0, depth: 1, light: li }); RJ.cel(g, tk.ellipsePts(v[0], -11, 5, 3, 10), v[1], { shadow: RJ.shade(v[1], 0.15), line: LINE.fine + 0.3, depth: 1.2, light: li }); });
    RJ.cel(g, [[45, -2.6], [58, -1.6], [62, 1.2], [62, 3.4], [58, 2], [45, 2.6]], K.metal, { shadow: K.metalSh, line: LINE.mid, tension: 0.2, depth: 1.4, light: li });
    RJ.cel(g, [[60, -0.6], [66, 1.4], [66, 4.6], [60, 4.2]], '#d98a4a', { shadow: '#a85a2a', line: LINE.fine + 0.3, tension: 0, depth: 1, light: li });
    // the flame: a blue cone with a white core that flickers
    if (f > 0.05) {
      const fl = 1 + 0.12 * Math.sin(t * 31) + 0.08 * Math.sin(t * 17), L1 = 20 * f * fl, L2 = 10 * f * fl;
      tk.glow(g, 70 + L1 * 0.4, 3, 10 + 10 * f, '#7fd0ff', 0.45, false);
      RJ.cel(g, [[66, -1.2], [66 + L1 * 0.5, -3.6 * f - 1], [67 + L1, 3, 1], [66 + L1 * 0.5, 9.6 * f + 1], [66, 7.4]], '#5ab8ff', { shadow: false, line: LINE.fine + 0.2, lineColor: '#1d4f8f', tension: 0.7 });
      RJ.cel(g, [[66, 1], [66 + L2 * 0.5, 0], [67 + L2, 3, 1], [66 + L2 * 0.5, 6], [66, 5]], '#f2fdff', { shadow: false, line: false, tension: 0.7 });
    }
    g.restore();
    if (f > 0.3) { const tx = gp.x + Math.cos(a) * (WELD_REACH + 6), ty = gp.y + Math.sin(a) * (WELD_REACH + 6); sparkSpray(g, tx, ty, a + 0.6, t, { n: 4 + Math.round(2 * f), len: 16 + 8 * f, spread: 1.6, seed: 2, k: 0.7, rate: 3 }); }
    handOver(g, S, true, 'fist');
    g.restore();
  }
  function weldTip(P, Lay) { const gp = gripLay(WELD, P, Lay), a = num(P.propAng, -0.5); return [gp[0] + Math.cos(a) * (WELD_REACH + 4), gp[1] + Math.sin(a) * (WELD_REACH + 4)]; }
  function weldFx(g, S, name) {
    const t = S.t, tp = S.pt.tip, a = num(S.P.propAng);
    if (name === 'weldjet') {
      const L = 60 + 20 * S.beat, ex = tp[0] + Math.cos(a) * L, ey = tp[1] + Math.sin(a) * L;
      tk.glow(g, (tp[0] + ex) / 2, (tp[1] + ey) / 2, 46, '#7fd0ff', 0.4, false);
      line(g, [[tp[0], tp[1]], [ex, ey]], 15, '#1d4f8f', { taper: 0.6, alpha: 0.85 }); line(g, [[tp[0], tp[1]], [ex, ey]], 11, '#5ab8ff', { taper: 0.6 }); line(g, [[tp[0], tp[1]], [ex, ey]], 4, '#f2fdff', { taper: 0.6 });
      sparkSpray(g, ex, ey, a, t, { n: 12, len: 52, spread: 2.2, seed: 6, rate: 2.8 });
      burst(g, S, ex + 10, ey, 13);
    } else if (name === 'torchsparks') sparkSpray(g, tp[0], tp[1], -PI / 2 + 0.3, t, { n: 10, len: 40, spread: 1.8, seed: 8, rate: 2 });
    else if (name === 'tnotes') RJ.fx.notes(g, tp[0] - 30, tp[1] - 10, t, K.or, 3);
  }
  function weldPoses() {
    const cheeky = { eyes: 'open', mouth: 'smirkTeeth', brow: 0.2 };
    return {
      idle: Object.assign({ mic: 'none', fHand: [26, 22], fBend: 1, fKind: 'fist', propAng: -0.55, flame: 0.7, bHand: [-10, 34], bBend: -1, bKind: 'fist', bRot: 0.4, headRot: 0.03, fx: [] }, cheeky),
      sing: { mic: 'none', fHand: [30, -32], fBend: 1, fKind: 'fist', propAng: -1.35, flame: 1.3, bHand: [-36, -14], bBend: -1, bKind: 'open', bSpread: 1.3, bRot: -0.2, headRot: -0.08, eyes: 'happy', mouth: 'sing', brow: -0.2, fx: ['tnotes', 'torchsparks'] },
      attack: { mic: 'none', fHand: [40, -4], fBend: 1, fKind: 'fist', propAng: -0.05, flame: 1.4, lean: 0.08, torsoRot: 0.05, headRot: 0.05, bHand: [-30, -16], bBend: -1, bKind: 'fist', bRot: -0.3,
        fFoot: [32, -12], bFoot: [-26, -12], eyes: 'determined', mouth: 'grin', brow: 0.5, fx: ['weldjet'], look: [0.6, 0] },
      windup: { mic: 'none', fHand: [8, 30], fBend: 1, fKind: 'fist', propAng: -0.25, flame: 1, squash: 0.96, torsoDy: 4, lean: -0.04, bHand: [30, 26], bBend: 1, bKind: 'open', bRot: -1.3, bFront: 1,
        fFoot: [26, -12], bFoot: [-26, -12], eyes: 'determined', mouth: 'grit', brow: 0.4, fx: [], look: [0.5, 0] },
      strike: { mic: 'none', fHand: [42, -2], fBend: 1, fKind: 'fist', propAng: 0.02, flame: 1.6, lean: 0.14, bx: 6, torsoRot: 0.07, headRot: 0.06, headDx: 3, bHand: [-30, -16], bBend: -1, bKind: 'fist',
        fFoot: [36, -12], bFoot: [-26, -12], eyes: 'determined', mouth: 'grin', brow: 0.55, fx: ['weldjet'], look: [0.6, 0] },
      hurt: { mic: 'none', fHand: [22, 30], fBend: 1, fKind: 'fist', propAng: 0.9, flame: 0.4, lean: -0.13, torsoRot: -0.08, headRot: -0.15, headDx: -3, bHand: [-34, -8], bBend: -1, bKind: 'open', bSpread: 1.3, bFront: 1,
        fFoot: [14, -12], bFoot: [-20, -12], eyes: 'hurt', mouth: 'ow', brow: -0.7, sweat: 1, blush: 0.6, fx: ['stars'] },
      cheer: { mic: 'none', fHand: [24, -40], fBend: 1, fKind: 'fist', propAng: -1.5, flame: 1.4, bHand: [-32, -38], bBend: -1, bKind: 'fist', bRot: -0.2, eyes: 'happy', mouth: 'grin', brow: -0.2,
        fFoot: [20, -12], bFoot: [-18, -12], fx: ['sparkles', 'torchsparks'] },
      block: { mic: 'none', fHand: [12, 30], fBend: 1, fKind: 'fist', propAng: -0.9, flame: 0.4, bHand: [52, -14], bBend: 1, bKind: 'open', bSpread: 1.1, bRot: -1.2, bFront: 1, headRot: -0.06,
        fFoot: [26, -12], bFoot: [-28, -12], eyes: 'determined', mouth: 'flat', brow: 0.4, fx: ['rings'] },
      down: { mic: 'none', fHand: [24, 34], fBend: 1, fKind: 'relaxed', propAng: 0.25, flame: 0, by: 46, torsoDy: 4, torsoRot: 0.07, headRot: 0.24, headDy: 2, bHand: [-4, 40], bBend: -1, bKind: 'relaxed', bRot: 0.3,
        fFoot: [-12, -54], bFoot: [14, -54], fBow: 22, bBow: -20, fFootRot: -0.5, bFootRot: 0.4, eyes: 'closed', mouth: 'flat', brow: -0.25, blush: 0.6, fx: ['mute'] },
      walk: Object.assign({ mic: 'none', fHand: [24, 24], fBend: 1, fKind: 'fist', propAng: -0.5, flame: 0.5, bHand: [-20, 30], bBend: -1, bKind: 'fist', fx: [] }, cheeky),
      bust: Object.assign({ mic: 'none', fHand: [18, 44], fBend: 1, fKind: 'fist', propAng: -0.85, flame: 0.7, bHand: [-10, 46], bBend: 1, bKind: 'relaxed', fx: [] }, cheeky),
    };
  }
  const WELD = {
    id: 'npc_scrap_weld', accent: 'scrap_kings',
    skel: { neck: [0, -138], headC: [2, -196], shF: [26, -123], shB: [-26, -123], hip: [0, -72], hipF: [15, -66], hipB: [-15, -66] },
    base: {},
    poses: weldPoses(),
    life: { idle: { bob: 1.3, per: 2.6, sway: 0.015, head: 0.02 } },
    face: {
      eyes: [{ x: -10, y: 13, w: 33, h: 31 }, { x: 40, y: 12, w: 28, h: 29 }],
      brows: [[-10, -2, 26], [44, -2, 22]], browStyle: { thick: 5.6, arch: 0.45, tilt: 0.05, color: WD.tuftSh },
      nose: [26, 36, 56], mouth: [14, 47, 22], mouthStyle: { lineW: 1.5 },
      blush: [[-18, 44, 18], [42, 42, 15]], sweat: [62, -20, 5],
      eye: { iris: WD.iris, ring: '#0e2630', sclera: '#fffdf8', expr: 'neutral', irisW: 0.74, irisH: 0.96, lid: 2.0, wing: 0.5, lash: 1.0, crease: false, lashes: 0, tilt: 0, drop: 0.04, hl: [[-0.38, -0.48, 0.3], [-0.32, -0.08, 0.14]] },
    },
    exprs: EXPRS,
    arm: { l: [22, 20], w: [17, 13], skin: WD.skin, skinSh: WD.skinSh, sleeve: { color: WD.shirt, shade: WD.shirtSh, len: 0.66, w0: 22, w1: 23 }, cuff: { color: WD.glove, light: WD.gloveSh }, hand: { skin: WD.glove, shade: WD.gloveSh, k: 1.2 } },
    legs: { w: [36, 32], color: K.or, shade: K.orSh, pantsOver: true, bow: 2, profile: (u) => 1 - 0.1 * u, shoe: Object.assign({}, BOOT, { k: 1.3 }), decor: overallLegs({ patch: K.yellow, cuffW: 18 }) },
    bounds: { x0: -96, x1: 132, h: 274 },
    bust: { rect: [-100, -276, 100, -82], face: [-88, -268, 76, -132], pose: 'bust' },
    tip: weldTip,
    tweak(P, t) { if (P.pose === 'walk') P.propAng += 0.08 * Math.sin(PI * t * 2) * tk.motion(); },
    layers: { torso: weldTorso, head: weldHead, top: weldTorch, fx: weldFx },
  };
  RJ.register('npc_scrap_weld', scrapRig(WELD));

  // =====================================================================================================================================
  // SPARKS (grunt): wiry and tall, electric-blond spikes with five cables poking out of them (bare copper tips that spark, now and then an
  // arc jumps between two), freckles, a plaster on the cheek, an orange jumpsuit open over a bolt tee, a canvas tool belt, a spring-reverb
  // tank backpack with boinging springs, and a tuning wrench shaped like a music note.
  // =====================================================================================================================================
  const SP = {
    skin: '#fdd6ba', skinSh: '#f2ad88', hair: '#ffd85a', hairSh: '#e3a42a', hairHi: '#fff4b0',
    tee: '#2e2a3a', teeSh: '#1c1924', belt: '#8a7a4a', beltSh: '#665830', tank: '#7fd0e8', tankSh: '#4fa6c4', tankHi: '#c4f0fb',
    strap: '#5a5068', strapSh: '#3c3448', freck: '#e0906a', plaster: '#ffd0a8', iris: ['#123a1e', '#3fae58'],
  };
  const SPARKS_SKULL = RJ.skullPts({ w: 0.98, h: 1.02, chin: 4 });
  const SPARKS_HAIR = [[-60, 10], [-74, -2, 1], [-62, -18], [-84, -30, 1], [-62, -40], [-70, -64, 1], [-44, -58], [-38, -86, 1], [-18, -66], [-4, -96, 1], [10, -70], [30, -92, 1], [34, -64], [58, -76, 1], [52, -50], [74, -46, 1], [58, -34], [62, -16, 1], [46, -28], [34, -34], [26, -24, 1], [16, -36], [2, -38], [-6, -28, 1], [-16, -38], [-32, -32], [-42, -18], [-46, 0], [-46, 18, 1]];
  const WIRES = [
    { sp: [[-30, -58], [-48, -82], [-32, -98], [-44, -114], [-58, -110]], col: K.red },
    { sp: [[8, -64], [2, -94], [20, -106], [12, -124], [0, -124]], col: K.blue },
    { sp: [[40, -50], [64, -64], [80, -56], [88, -72], [102, -70]], col: '#4ccf5a' },
    { sp: [[-48, -30], [-76, -40], [-88, -26], [-104, -32], [-110, -46]], col: '#f4f4f8' },
    { sp: [[26, -60], [44, -84], [36, -100], [54, -112], [64, -102]], col: K.pink },
  ];
  function wireTip(W, sw, i) { const sp = W.sp, n = sp.length - 1, r = sp[0], a = sw * 0.22 * (i % 2 ? -1 : 1) * (1 + i * 0.15), c = Math.cos(a), s = Math.sin(a), p = sp[n]; return [r[0] + (p[0] - r[0]) * c - (p[1] - r[1]) * s, r[1] + (p[0] - r[0]) * s + (p[1] - r[1]) * c]; }
  function sparksHead(g, S) {
    const sw = S.P.hairSwing + Math.sin(S.t * 5) * 0.04, t = S.t, up = num(S.P.hairUp);
    headBase(g, S, { skull: SPARKS_SKULL, skin: SP.skin, shade: SP.skinSh, cast: [[-58, -30], [-30, -42], [0, -44], [30, -40], [56, -30], [50, -18], [20, -32], [-10, -32], [-40, -14]], castDy: 6, under: (gg) => {
      gg.fillStyle = SP.freck; [[-20, 32], [-14, 36], [-26, 37], [36, 30], [42, 34], [48, 30]].forEach((p) => { gg.beginPath(); gg.arc(p[0], p[1], 1.4, 0, TAU); gg.fill(); });
    } });
    // a plaster on the cheek
    g.save(); g.translate(-28, 30); g.rotate(-0.5);
    RJ.cel(g, rbox(-8, -3.4, 16, 6.8, 3, 2), SP.plaster, { shadow: RJ.shade(SP.plaster, 0.08), line: LINE.fine + 0.2, tension: 0, depth: 1 });
    g.fillStyle = '#e8a87c'; [[-2, -1], [2, -1], [-2, 1.4], [2, 1.4]].forEach((p) => g.fillRect(p[0] - 0.5, p[1] - 0.5, 1, 1));
    g.restore();
    // a grease smudge
    g.save(); g.globalAlpha = 0.35; g.fillStyle = '#5a4a5a'; g.beginPath(); g.ellipse(46, 40, 6, 2.4, -0.3, 0, TAU); g.fill(); g.restore();
    // the cables (behind the spikes, so their roots hide in the hair)
    WIRES.forEach((W, i) => {
      RJ.lock(g, W.sp.map((p, j) => (j ? [p[0], p[1] - up * j * 4] : p)), W.col, { wMax: 5.2, w0: 5.2, w1: 4.8, profile: () => 1, cap: 'round', bend: sw * 0.22 * (i % 2 ? -1 : 1) * (1 + i * 0.15), gloss: true, glossColor: '#ffffff', glossAlpha: 0.5, strands: 0, shadow: RJ.shade(W.col, 0.2) });
    });
    g.save(); g.translate(0, -up * 3); g.scale(1, 1 + up * 0.06);
    RJ.cel(g, SPARKS_HAIR, SP.hair, { shadow: SP.hairSh, line: LINE.main + 0.1, tension: 0.45, depth: 8, hi: SP.hairHi, hiW: 1.8, hiAlpha: 0.8, decor: (gg) => {
      RJ.hatch(gg, [[[-4, -86], [-2, -70], [2, -56]], [[30, -84], [28, -68], [22, -54]], [[-36, -78], [-30, -62], [-26, -52]], [[-62, -36], [-50, -32], [-46, -24]], [[54, -66], [44, -56], [38, -46]]], { color: SP.hairSh, w: 1.4, alpha: 0.9 });
    } });
    g.restore();
    RJ.ear(g, -50, 22, { r: 13.5, side: -1, skin: SP.skin, shade: SP.skinSh });
    // bare copper tips that spark (each on its own clock), and now and then an arc between two of them
    WIRES.forEach((W, i) => {
      const p = W.sp[W.sp.length - 1], q = W.sp[W.sp.length - 2], a = Math.atan2(p[1] - q[1], p[0] - q[0]), tip = wireTip({ sp: W.sp.map((pp, j) => (j ? [pp[0], pp[1] - up * j * 4] : pp)) }, sw, i);
      g.save(); g.translate(tip[0], tip[1]); g.rotate(a + sw * 0.22 * (i % 2 ? -1 : 1) * (1 + i * 0.15));
      RJ.cel(g, [[-2, -3], [4, -2.4], [4, 2.4], [-2, 3]], K.metal, { shadow: K.metalSh, line: LINE.fine + 0.2, tension: 0, depth: 1 });
      line(g, [[4, -1.6], [9, -3.4]], 1.3, '#d98a4a'); line(g, [[4, 0], [10, 0.4]], 1.3, '#e8a060'); line(g, [[4, 1.6], [9, 3.6]], 1.3, '#d98a4a');
      g.restore();
      twinkle(g, tip[0] + Math.cos(a) * 11, tip[1] + Math.sin(a) * 11, 7 + 3 * up, t * (1 + i * 0.13), i * 1.7 + 1, K.spark);
    });
    if (fr(t * 0.45) < 0.22 || up > 0.5) {
      const W0 = WIRES[0], W1 = WIRES[1];
      const a0 = wireTip({ sp: W0.sp.map((pp, j) => (j ? [pp[0], pp[1] - up * j * 4] : pp)) }, sw, 0), a1 = wireTip({ sp: W1.sp.map((pp, j) => (j ? [pp[0], pp[1] - up * j * 4] : pp)) }, sw, 1);
      zap(g, [a0[0] + 6, a0[1] - 4], [a1[0] - 2, a1[1] - 8], t, { n: 6, amp: 6, w: 2.2, seed: 3 });
    }
  }
  // the spring-reverb tank on the back (backHair, moved into torso space)
  function sparksTank(g, S) {
    g.save(); toFig(g, S.M.head); into(g, S.M.torso);
    const t = S.t, boing = Math.sin(t * 7) * (S.P.pose === 'attack' || S.P.pose === 'strike' || S.P.pose === 'hurt' ? 4 : 1.6);
    g.translate(-30, -124); g.rotate(-0.16);
    RJ.cel(g, rbox(-15, -52, 30, 98, 6, 3), SP.tank, { shadow: SP.tankSh, line: LINE.main + 0.2, tension: 0, depth: 6, light: litIn(-0.16), hi: SP.tankHi, hiW: 1.6, decor: (gg) => {
      gg.fillStyle = K.or; gg.fillRect(-16, 30, 32, 8);
    } });
    // the window with two springs
    RJ.cel(g, rbox(-10, -42, 20, 66, 4, 2), '#2b3646', { shadow: false, line: LINE.mid, tension: 0, light: litIn(-0.16) });
    [-4.5, 4.5].forEach((x, i) => {
      const top = -38, bot = 20 + (i ? -boing : boing), n = 13, pts = [];
      for (let j = 0; j <= n; j++) pts.push([x + (j % 2 ? 3.2 : -3.2), lerp(top, bot, j / n)]);
      line(g, pts, 2.2, '#9da3b8'); line(g, pts, 1, '#f0f2f8');
      [top, bot].forEach((y) => { g.beginPath(); g.arc(x, y, 1.8, 0, TAU); g.fillStyle = K.gold; g.fill(); });
    });
    // two RCA jacks on the top
    [[-7, K.red], [7, '#f4f4f8']].forEach((j) => { RJ.cel(g, rbox(j[0] - 3.5, -60, 7, 9, 2, 2), j[1], { shadow: RJ.shade(j[1], 0.15), line: LINE.fine + 0.3, tension: 0, depth: 1.2 }); bolt(g, j[0], -50, 2.2, K.gold); });
    g.restore();
  }
  function sparksTorso(g, S) {
    RJ.neck(g, 2, -164, { w: 19, h: 20, skin: SP.skin, shade: SP.skinSh });
    const T = shirtPts(0.9, -150, -74, 0);
    RJ.cel(g, T, K.or, { shadow: K.orSh, line: LINE.main, depth: 6, hi: K.orHi, hiW: 1.4, hiAlpha: 0.7, tension: 0.45 });
    // the open V showing the bolt tee
    RJ.cel(g, [[-11, -150], [12, -150], [5, -116], [2, -104, 1], [-2, -116]], SP.tee, { shadow: SP.teeSh, line: LINE.mid, tension: 0.2, depth: 2, decor: (gg) => {
      RJ.cel(gg, [[2, -142, 1], [-4, -130, 1], [1, -130, 1], [-3, -118, 1], [6, -134, 1], [1, -134, 1], [5, -142, 1]], K.yellow, { shadow: false, line: LINE.fine, tension: 0 });
    } });
    // the collar flaps and zipper
    [-1, 1].forEach((sd) => RJ.cel(g, [[sd * 12, -151], [sd * 24, -150], [sd * 15, -136, 1], [sd * 8, -140]], K.orHi, { shadow: false, line: LINE.mid, tension: 0.2 }));
    line(g, [[2, -104], [2, -78]], 2.4, K.metalSh); line(g, [[2, -104], [2, -78]], 1, K.metalHi);
    // the chest pocket with two screwdrivers
    cable(g, [[19, -126], [18, -142]], 2.4, K.yellow); cable(g, [[24, -126], [26, -140]], 2.4, K.teal);
    patch(g, 21, -120, 14, 13, 0.04, K.or);
    patch(g, -20, -110, 12, 9, -0.12, K.sky);
    // backpack straps
    [-1, 1].forEach((sd) => cable(g, [[sd * 18, -151], [sd * 20, -132], [sd * 22, -104]], 5, SP.strap, { hi: '#857a96' }));
    // the tool belt
    RJ.cel(g, [[-37, -90], [38, -90], [39, -80], [-38, -80]], SP.belt, { shadow: SP.beltSh, line: LINE.main, tension: 0, depth: 2.4, decor: (gg) => { gg.setLineDash([2, 1.8]); gg.lineWidth = 0.9; gg.strokeStyle = K.cream; gg.beginPath(); gg.moveTo(-38, -88); gg.lineTo(38, -88); gg.moveTo(-38, -82); gg.lineTo(38, -82); gg.stroke(); gg.setLineDash([]); } });
    RJ.cel(g, rbox(-6, -92, 12, 14, 2, 2), K.metal, { shadow: K.metalSh, line: LINE.mid, tension: 0, depth: 1.4, hi: K.metalHi });
    RJ.cel(g, rbox(-34, -86, 15, 18, 3, 2), SP.belt, { shadow: SP.beltSh, line: LINE.mid, tension: 0, depth: 2.4 });
    RJ.cel(g, rbox(18, -86, 14, 16, 3, 2), SP.belt, { shadow: SP.beltSh, line: LINE.mid, tension: 0, depth: 2.4 });
    cable(g, [[22, -86], [20, -96]], 2.4, K.red);
  }
  // the tuning wrench: a steel stem with a round note head on the grip end and an open wrench jaw (the note's flag) at the far end
  const SPARKS_REACH = 64;
  function sparksWrench(g, S) {
    g.save(); toFig(g, S.M.head);
    const P = S.P, gp = gripOf(S), a = num(P.propAng, -1), li = litIn(a);
    g.save(); g.translate(gp.x, gp.y); g.rotate(a);
    RJ.cel(g, [[-14, -3.6], [56, -3.2], [56, 3.2], [-14, 3.6]], K.metal, { shadow: K.metalSh, line: LINE.main, tension: 0, depth: 2.2, light: li, hi: K.metalHi, hiW: 1 });
    RJ.cel(g, tk.ellipsePts(-18, 4, 10, 7.4, 14, -0.45), K.or, { shadow: K.orSh, line: LINE.main, depth: 2.6, light: li, hi: K.orHi, hiW: 1.2 });
    RJ.cel(g, [[52, -6], [62, -14], [74, -14], [80, -8, 1], [70, -6], [68, 0], [72, 5], [80, 6, 1], [72, 12], [60, 10], [52, 6]], K.metal, { shadow: K.metalSh, line: LINE.main, tension: 0.35, depth: 2.6, light: li, hi: K.metalHi, hiW: 1.1 });
    g.restore();
    handOver(g, S, true, 'fist');
    g.restore();
  }
  function sparksTip(P, Lay) { const gp = gripLay(SPARKS, P, Lay), a = num(P.propAng, -1); return [gp[0] + Math.cos(a) * (SPARKS_REACH + 12), gp[1] + Math.sin(a) * (SPARKS_REACH + 12)]; }
  function sparksFx(g, S, name) {
    const t = S.t, tp = S.pt.tip, a = num(S.P.propAng);
    if (name === 'zap') {
      const L = 96, e = [tp[0] + Math.cos(a) * L, tp[1] + Math.sin(a) * L + 6];
      tk.glow(g, e[0], e[1], 40, K.yellow, 0.4, false);
      zap(g, tp, e, t, { n: 9, amp: 11, w: 4, seed: 7 });
      zap(g, tp, [e[0] - 10, e[1] - 22], t + 0.3, { n: 7, amp: 7, w: 2.2, seed: 9, col: K.sky });
      burst(g, S, e[0] + 8, e[1], 15);
      sparkSpray(g, e[0], e[1], a, t, { n: 8, len: 34, spread: 2.4, seed: 5 });
    } else if (name === 'muteHi') RJ.fx.mute(g, S.pt.head[0] + 40, S.pt.head[1] - 122, t);
    else if (name === 'fizz') sparkSpray(g, S.pt.head[0], S.pt.head[1] - 90, -PI / 2, t, { n: 8, len: 30, spread: 2.6, seed: 11, rate: 1.6 });
    else if (name === 'tnotes') RJ.fx.notes(g, tp[0] - 34, tp[1] - 6, t, K.or, 3);
  }
  function sparksPoses() {
    const cheeky = { eyes: 'open', mouth: 'grin', brow: -0.05 };
    return {
      idle: Object.assign({ mic: 'none', fHand: [18, 32], fBend: 1, fKind: 'fist', propAng: -1.0, bHand: [-18, -44], bBend: -1, bKind: 'relaxed', bRot: 0.6, headRot: -0.04, torsoRot: 0.02, lean: -0.02, fx: [], look: [0.3, -0.1] }, cheeky),
      sing: { mic: 'none', fHand: [38, -14], fBend: 1, fKind: 'fist', propAng: -1.25, bHand: [-36, -10], bBend: -1, bKind: 'point', bRot: -0.1, headRot: -0.06, eyes: 'happy', mouth: 'sing', brow: -0.2, fx: ['tnotes'], look: [0.4, -0.2] },
      attack: { mic: 'none', fHand: [42, -8], fBend: 1, fKind: 'fist', propAng: -0.18, lean: 0.08, torsoRot: 0.06, headRot: 0.06, bHand: [-34, -18], bBend: -1, bKind: 'open', bSpread: 1.4, bRot: -0.4, hairUp: 0.6,
        fFoot: [32, -12], bFoot: [-24, -12], eyes: 'wide', mouth: 'grin', brow: 0.3, fx: ['zap'], look: [0.6, 0] },
      windup: { mic: 'none', fHand: [-6, 36], fBend: -1, fKind: 'fist', propAng: -2.5, squash: 0.97, torsoDy: 5, lean: -0.05, torsoRot: -0.06, bHand: [30, 14], bBend: 1, bKind: 'open', bRot: -1.2, bFront: 1, hairUp: 0.3,
        fFoot: [24, -12], bFoot: [-26, -12], eyes: 'determined', mouth: 'smirkTeeth', brow: 0.35, fx: [], look: [0.5, 0] },
      strike: { mic: 'none', fHand: [44, -6], fBend: 1, fKind: 'fist', propAng: -0.1, lean: 0.15, bx: 6, torsoRot: 0.08, headRot: 0.06, headDx: 3, bHand: [-34, -20], bBend: -1, bKind: 'open', bSpread: 1.4, hairUp: 1,
        fFoot: [36, -12], bFoot: [-24, -12], eyes: 'wide', mouth: 'grin', brow: 0.35, fx: ['zap'], look: [0.6, 0] },
      hurt: { mic: 'none', fHand: [20, 30], fBend: 1, fKind: 'fist', propAng: 0.8, lean: -0.13, torsoRot: -0.08, headRot: -0.15, headDx: -3, bHand: [-32, -10], bBend: -1, bKind: 'open', bSpread: 1.3, bFront: 1, hairUp: 1,
        fFoot: [14, -12], bFoot: [-20, -12], eyes: 'hurt', mouth: 'ow', brow: -0.7, sweat: 1, blush: 0.6, fx: ['stars', 'fizz'] },
      cheer: { mic: 'none', fHand: [22, -42], fBend: 1, fKind: 'fist', propAng: -1.3, bHand: [-34, -38], bBend: -1, bKind: 'open', bSpread: 1.4, bRot: 0.2, hairUp: 0.5,
        fFoot: [20, -12], bFoot: [-18, -12], eyes: 'happy', mouth: 'happyOpen', brow: -0.2, fx: ['sparkles'] },
      block: { mic: 'none', fHand: [34, 4], fBend: 1, fKind: 'fist', propAng: -1.15, bHand: [44, 10], bBend: 1, bKind: 'open', bRot: -1.2, bFront: 1, headRot: -0.06, torsoRot: -0.02,
        fFoot: [26, -12], bFoot: [-28, -12], eyes: 'determined', mouth: 'flat', brow: 0.35, fx: ['rings'] },
      down: { mic: 'none', fHand: [22, 40], fBend: 1, fKind: 'relaxed', propAng: 0.3, by: 56, torsoDy: 4, torsoRot: 0.08, headRot: 0.26, headDy: 2, bHand: [-4, 48], bBend: -1, bKind: 'relaxed', bRot: 0.3, hairUp: -0.4,
        fFoot: [-12, -64], bFoot: [14, -64], fBow: 26, bBow: -24, fFootRot: -0.5, bFootRot: 0.4, eyes: 'closed', mouth: 'flat', brow: -0.25, blush: 0.6, fx: ['muteHi'] },
      walk: Object.assign({ mic: 'none', fHand: [18, 30], fBend: 1, fKind: 'fist', propAng: -0.9, bHand: [-22, 32], bBend: -1, bKind: 'relaxed', bRot: 0.3, fx: [] }, cheeky),
      bust: Object.assign({ mic: 'none', fHand: [14, 50], fBend: 1, fKind: 'fist', propAng: -0.7, bHand: [-10, 50], bBend: 1, bKind: 'relaxed', fx: [] }, cheeky),
    };
  }
  const SPARKS = {
    id: 'npc_scrap_sparks', accent: 'scrap_kings',
    skel: { neck: [0, -154], headC: [2, -212], shF: [22, -139], shB: [-22, -139], hip: [0, -84], hipF: [12, -80], hipB: [-12, -80] },
    base: {},
    poses: sparksPoses(),
    life: { idle: { bob: 1.2, per: 2.2, sway: 0.02, head: 0.03 }, walk: { bob: 3, per: 0.45, head: 0.015, step: { hz: 2.2, stride: 10, lift: 6 } } },
    face: {
      eyes: [{ x: -12, y: 15, w: 31, h: 30 }, { x: 39, y: 13, w: 26, h: 27 }],
      brows: [[-13, -8, 26], [44, -8, 22]], browStyle: { thick: 5, arch: 0.55, tilt: -0.05, color: SP.hairSh },
      nose: [26, 32, 58], mouth: [11, 45, 24], mouthStyle: { lineW: 1.5, teeth: true },
      blush: [[-18, 34, 19], [40, 32, 15]], sweat: [58, -14, 5],
      eye: { iris: SP.iris, ring: '#0a2412', sclera: '#fffdf8', expr: 'neutral', irisW: 0.72, irisH: 0.96, lid: 2.0, wing: 0.55, lash: 1.0, crease: true, lashes: 0, tilt: -0.04, drop: 0, hl: [[-0.4, -0.5, 0.28], [-0.32, -0.1, 0.13]] },
    },
    exprs: EXPRS,
    arm: { l: [26, 25], w: [13, 10], skin: SP.skin, skinSh: SP.skinSh, sleeve: { color: K.or, shade: K.orSh, len: 0.56, w0: 18, w1: 19 }, hand: { skin: SP.skin, shade: SP.skinSh } },
    legs: { w: [26, 22], color: K.or, shade: K.orSh, pantsOver: true, bow: 2, profile: (u) => 1 - 0.1 * u, shoe: Object.assign({}, BOOT, { color: '#e8e2d4', sole: '#5a4e5a', shade: '#bdb4a2', hi: '#ffffff', toeCap: K.or, k: 1.22 }), decor: overallLegs({ patch: K.pink, patchW: 10, patchH: 10, cuffW: 13 }) },
    bounds: { x0: -118, x1: 120, h: 344 },
    bust: { rect: [-104, -336, 104, -118], face: [-78, -312, 78, -150], pose: 'bust' },
    tip: sparksTip,
    tweak(P, t) {
      if (P.pose === 'idle') { const k = Math.max(0, Math.sin(t * 6)); P.bHand = [P.bHand[0] + 2 * k, P.bHand[1] - 2 * k]; }
      else if (P.pose === 'walk') P.propAng += 0.15 * Math.sin(PI * t * 2.2) * tk.motion();
      else if (P.pose === 'sing') P.propAng += 0.1 * Math.sin(t * 4);
    },
    layers: { backHair: sparksTank, torso: sparksTorso, head: sparksHead, top: sparksWrench, fx: sparksFx },
  };
  RJ.register('npc_scrap_sparks', scrapRig(SPARKS));

  // =====================================================================================================================================
  // COG CARLA (merchant / fixer): a polka-dot headscarf with a bow over a big curly bun with a pencil through it, a brass loupe on one eye,
  // washer earrings, a teal work shirt under an orange apron stuffed with cogs (and a tape measure), canvas trousers with orange turn-ups,
  // and a mechanical right arm: an orange pauldron, a steel upper arm, a spinning cog elbow, a piston forearm and a three-finger claw that
  // holds out a cog. Shrewd and friendly: the half-lidded knowing look and a smirk.
  // =====================================================================================================================================
  const CA = {
    skin: '#a8714b', skinSh: '#8a5534', hair: '#2a1a14', hairSh: '#120a07', hairHi: '#5e3e30',
    scarf: '#ffd23a', scarfSh: '#e3a42a', dot: '#ff8a2a', shirt: '#2fa39a', shirtSh: '#1f7a74', shirtHi: '#78d6ca',
    pants: '#5a4e66', pantsSh: '#3c3348', iris: ['#2a1408', '#9a6430'], lip: '#7a3a2a',
  };
  const CARLA_SKULL = RJ.skullPts({ w: 1.0, h: 1.0, chin: 2 });
  function carlaHead(g, S) {
    const t = S.t, sw = S.P.hairSwing;
    // the big curly bun on top (behind the scarf)
    const BUN = []; for (let i = 0; i < 11; i++) { const a = -PI * 1.05 + i / 10 * PI * 1.1, r = 30 + 2 * Math.sin(i * 2.1); BUN.push([-6 + Math.cos(a) * r * 1.15, -70 + Math.sin(a) * r * 0.95]); }
    const bunPts = []; BUN.forEach((p, i) => { bunPts.push([p[0], p[1], 1]); if (i < BUN.length - 1) { const q = BUN[i + 1], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, dx = mx + 6, dy = my + 70, d = Math.hypot(dx, dy) || 1; bunPts.push([mx + dx / d * 6, my + dy / d * 6]); } });
    bunPts.push([30, -48], [-40, -46]);
    // the pencil through the bun
    capsule(g, [-40, -96], [24, -78], 5.4, 5.4, K.yellow, { shadow: K.goldSh, line: LINE.mid });
    RJ.cel(g, [[24, -80.6], [33, -77], [24, -75.4]], '#f6d6a2', { shadow: false, line: LINE.fine + 0.2, tension: 0 });
    RJ.cel(g, bunPts, CA.hair, { shadow: CA.hairSh, line: LINE.main, tension: 0.5, depth: 7, hi: CA.hairHi, hiW: 1.8, hiAlpha: 0.7, decor: (gg) => {
      RJ.hatch(gg, [[[-28, -84], [-24, -88], [-20, -84]], [[-6, -92], [-2, -96], [2, -92]], [[14, -84], [18, -88], [22, -84]], [[-20, -70], [-16, -74], [-12, -70]], [[4, -72], [8, -76], [12, -72]]], { color: CA.hairHi, w: 1.3, alpha: 0.8 });
    } });
    headBase(g, S, { skull: CARLA_SKULL, skin: CA.skin, shade: CA.skinSh, cast: [[-58, -30], [-30, -44], [0, -46], [30, -42], [56, -30], [50, -18], [20, -32], [-10, -32], [-40, -14]], castDy: 6 });
    // curls framing the face at the back and the temple
    const curls = [[-56, -18, 9], [-62, 0, 9], [-60, 18, 8.5], [-52, 32, 7.5], [50, -28, 7], [56, -16, 6]];
    RJ.blob(g, curls.map((c) => ({ e: [c[0], c[1], c[2], c[2] * 0.95, 0] })), { fill: CA.hair, shade: CA.hairSh, L: LINE.main * 0.9, lit: 1.4 });
    RJ.ear(g, -46, 24, { r: 13, side: -1, skin: CA.skin, shade: CA.skinSh });
    // a washer earring
    const ex = -48, ey = 42 + Math.sin(t * 2.2) * 0.8;
    g.beginPath(); g.arc(ex, ey, 7, 0, TAU); g.arc(ex, ey, 3.2, 0, TAU, true); g.fillStyle = K.metal; g.fill('evenodd');
    g.lineWidth = 1.2; g.strokeStyle = C.ink; g.beginPath(); g.arc(ex, ey, 7, 0, TAU); g.stroke(); g.beginPath(); g.arc(ex, ey, 3.2, 0, TAU); g.stroke();
    // the headscarf band with polka dots and the bow on top
    const BAND = [[-62, -14], [-56, -36], [-36, -54], [-4, -60], [28, -56], [50, -44], [60, -28], [58, -18, 1], [44, -30], [20, -40], [-8, -42], [-34, -34], [-50, -18], [-54, 0, 1]];
    RJ.cel(g, BAND, CA.scarf, { shadow: CA.scarfSh, line: LINE.main, tension: 0.6, depth: 4, hi: '#fff0a0', hiW: 1.4, decor: (gg) => {
      gg.fillStyle = CA.dot; [[-50, -24], [-36, -40], [-18, -48], [2, -50], [22, -48], [40, -40], [52, -30], [-28, -46], [12, -44]].forEach((p) => { gg.beginPath(); gg.arc(p[0], p[1], 2.6, 0, TAU); gg.fill(); });
    } });
    g.save(); g.translate(18, -56); g.rotate(0.2 + sw * 0.05);
    [[-1, [[0, 0], [-10, -12], [-20, -14, 1], [-18, -2], [-8, 4]]], [1, [[0, 0], [10, -14], [20, -16, 1], [19, -4], [8, 4]]]].forEach((b) => RJ.cel(g, b[1], CA.scarf, { shadow: CA.scarfSh, line: LINE.main, tension: 0.6, depth: 3, decor: (gg) => { gg.fillStyle = CA.dot; gg.beginPath(); gg.arc(b[0] * 12, -7, 2.4, 0, TAU); gg.fill(); } }));
    RJ.cel(g, tk.ellipsePts(0, -1, 5, 4.4, 10), CA.scarf, { shadow: CA.scarfSh, line: LINE.main, depth: 1.5 });
    g.restore();
    // the brass loupe over the far eye, on a thin strap into the scarf
    const F = S.spec.face.eyes[1], lx = F.x + 1, ly = F.y + 1;
    line(g, [[lx - 6, ly - 15], [20, -36]], 2.6, C.ink); line(g, [[lx - 6, ly - 15], [20, -36]], 1.3, K.brass);
    g.save(); g.beginPath(); g.arc(lx, ly, 15, 0, TAU); g.fillStyle = 'rgba(160,220,230,0.18)'; g.fill(); g.restore();
    g.beginPath(); g.arc(lx, ly, 17, 0, TAU); g.arc(lx, ly, 13.4, 0, TAU, true); g.fillStyle = K.brass; g.fill('evenodd');
    g.lineWidth = 1.4; g.strokeStyle = C.ink; g.beginPath(); g.arc(lx, ly, 17, 0, TAU); g.stroke(); g.beginPath(); g.arc(lx, ly, 13.4, 0, TAU); g.stroke();
    g.beginPath(); g.arc(lx, ly, 15.2, -2.4, -1.2); g.lineWidth = 1.2; g.strokeStyle = K.goldHi; g.stroke();
    g.save(); g.globalAlpha = 0.7; line(g, [[lx + 4, ly - 10], [lx + 9, ly - 5]], 2, '#ffffff'); g.restore();
  }
  function carlaTorso(g, S) {
    RJ.neck(g, 2, -156, { w: 22, h: 22, skin: CA.skin, shade: CA.skinSh });
    RJ.cel(g, shirtPts(1.0, -151, -70, 2), CA.shirt, { shadow: CA.shirtSh, line: LINE.main, depth: 7, hi: CA.shirtHi, hiW: 1.5, hiAlpha: 0.7, tension: 0.5 });
    [-1, 1].forEach((sd) => RJ.cel(g, [[sd * 2, -144], [sd * 14, -152], [sd * 22, -149, 1], [sd * 13, -138, 1]], CA.shirtHi, { shadow: false, line: LINE.mid, tension: 0.2 }));
    // the apron: bib, waist and a long skirt to the knees, pockets full of cogs, a hanging tape measure
    const sw = S.sway * 3;
    const AP = [[-17, -136], [17, -136], [19, -104], [36, -96], [40 + sw * 0.4, -46], [42 + sw, -32, 1], [-40 + sw, -32, 1], [-38 + sw * 0.4, -46], [-34, -96], [-19, -104]];
    RJ.cel(g, AP, K.or, { shadow: K.orSh, line: LINE.main, depth: 7, tension: 0.4, hi: K.orHi, hiW: 1.5, hiAlpha: 0.7, decor: (gg) => {
      gg.setLineDash([2.4, 2]); gg.lineWidth = 1; gg.strokeStyle = K.stitch;
      gg.beginPath(); tk.trace(gg, [[-14, -133], [14, -133], [16, -105], [33, -97], [38, -36], [-37, -36], [-31, -97], [-16, -105]], 0, 0, 0); gg.closePath(); gg.stroke(); gg.setLineDash([]);
      patch(gg, 24, -52, 12, 10, 0.2, K.teal);
    } });
    // neck strap and the waist ties
    cable(g, [[-15, -135], [-18, -146], [-12, -152]], 4, K.or); cable(g, [[15, -135], [17, -146], [12, -152]], 4, K.or);
    cable(g, [[-36, -98], [-48, -92 + sw], [-52, -78 + sw]], 4.4, K.or, { hi: K.orHi });
    // cogs peeking out of the pockets (they turn slowly)
    const t = S.t;
    cog(g, -18, -74, 9, 8, t * 0.6, K.brass, { sh: K.brassSh });
    cog(g, -6, -70, 6.5, 7, -t * 0.8, K.metal, { sh: K.metalSh });
    cog(g, 20, -76, 8, 8, t * 0.5 + 1, K.steelHi, { sh: K.steel });
    [[-27, -76, 26], [7, -78, 26]].forEach((p) => RJ.cel(g, rbox(p[0], p[1], p[2], 18, 3, 2), K.or, { shadow: K.orSh, line: LINE.mid, tension: 0, depth: 3, decor: (gg) => { gg.setLineDash([2.2, 1.9]); gg.lineWidth = 0.9; gg.strokeStyle = K.stitch; gg.beginPath(); gg.moveTo(p[0] + 2, p[1] + 3); gg.lineTo(p[0] + p[2] - 2, p[1] + 3); gg.stroke(); gg.setLineDash([]); } }));
    // the bib pocket: a pen and a tiny cog badge
    cable(g, [[-6, -116], [-7, -128]], 2.4, K.red);
    RJ.cel(g, rbox(-12, -118, 22, 14, 3, 2), K.or, { shadow: K.orSh, line: LINE.mid, tension: 0, depth: 2.4 });
    cog(g, 2, -111, 4.2, 7, 0.2, K.yellow);
    // the tape measure on its clip at the hip
    g.save(); g.translate(-44, -66);
    RJ.cel(g, rbox(-9, -9, 18, 18, 6, 3), K.yellow, { shadow: K.goldSh, line: LINE.main, tension: 0.2, depth: 2.4, hi: K.goldHi });
    g.beginPath(); g.arc(0, 0, 3, 0, TAU); g.fillStyle = C.ink; g.fill();
    line(g, [[8, 6], [10, 14 + sw], [7, 18 + sw]], 3.2, C.ink); line(g, [[8, 6], [10, 14 + sw], [7, 18 + sw]], 1.8, '#fff4a8');
    g.restore();
  }
  // the mechanical arm, drawn over the kit's flesh arm with the same IK (the 'over' layer, moved into figure space)
  function carlaArm(g, S) {
    g.save(); toFig(g, S.M.torso);
    const P = S.P, pt = S.pt, sh = pt.shF, w = wristOf(S, true), e = w.e, t = S.t, open = clamp(num(P.claw, 0.3), 0, 1);
    // upper arm: steel with an orange plate
    capsule(g, sh, e, 19, 16, K.metal, { shadow: K.metalSh, hi: K.metalHi });
    const ux = e[0] - sh[0], uy = e[1] - sh[1], ul = Math.hypot(ux, uy) || 1;
    line(g, [[sh[0] + ux * 0.3 - uy / ul * 4, sh[1] + uy * 0.3 + ux / ul * 4], [sh[0] + ux * 0.75 - uy / ul * 4, sh[1] + uy * 0.75 + ux / ul * 4]], 1, K.metalSh);
    // forearm: an orange housing and a chrome piston
    const fx = w.w[0] - e[0], fy = w.w[1] - e[1];
    capsule(g, e, [e[0] + fx * 0.62, e[1] + fy * 0.62], 19, 16, K.or, { shadow: K.orSh, hi: K.orHi });
    capsule(g, [e[0] + fx * 0.55, e[1] + fy * 0.55], w.w, 10, 9, K.metal, { shadow: K.metalSh, hi: K.metalHi, line: LINE.mid });
    bolt(g, e[0] + fx * 0.3, e[1] + fy * 0.3, 2.2, K.metal);
    // the elbow cog
    cog(g, e[0], e[1], 12, 9, t * 1.4 * (1 + num(P.cogSpin)), K.brass, { sh: K.brassSh, line: LINE.mid });
    // the shoulder pauldron
    g.save(); g.translate(sh[0], sh[1]); g.rotate(Math.atan2(uy, ux) - PI / 2);
    RJ.cel(g, [[-13, -6], [-10, -14], [0, -17], [10, -14], [13, -6], [12, 6, 1], [-12, 6, 1]], K.or, { shadow: K.orSh, line: LINE.main, tension: 0.6, depth: 3, hi: K.orHi, hiW: 1.4, light: litIn(Math.atan2(uy, ux) - PI / 2) });
    [[-7, -2], [7, -2]].forEach((p) => bolt(g, p[0], p[1], 2, K.metal));
    g.restore();
    // the claw: a palm block, a thumb under and two fingers over, the held cog between them
    const a = w.ang, ca = Math.cos(a), sa = Math.sin(a), fy2 = Math.cos(a) < 0 ? -1 : 1;
    const CK = 1.4, L = (x, y) => [w.w[0] + (x * ca - y * fy2 * sa) * CK, w.w[1] + (x * sa + y * fy2 * ca) * CK];
    if (P.holdCog) cog(g, L(17, 0)[0], L(17, 0)[1], 14, 10, t * 2 * (1 + num(P.cogSpin)), K.brass, { sh: K.brassSh, line: LINE.mid });
    RJ.cel(g, [L(-2, -7), L(8, -8), L(10, 0), L(8, 8), L(-2, 7)], K.steel, { shadow: K.steelSh, line: LINE.main, tension: 0.3, depth: 2.4, hi: K.steelHi, hiW: 1 });
    const fing = (base, sd, len) => {
      const o = sd * (0.25 + 0.75 * open), j = [base[0] + Math.cos(o) * 10, base[1] + Math.sin(o) * 10], tip = [j[0] + Math.cos(o - sd * 1.1) * len, j[1] + Math.sin(o - sd * 1.1) * len];
      return [L(base[0], base[1]), L(j[0], j[1]), L(tip[0], tip[1])];
    };
    [fing([9, -5], -1, 9), fing([9, 5], 1, 9), fing([8, -1], -0.4, 8)].forEach((f, i) => { cable(g, f, 5.8, i === 2 ? K.metal : K.steelHi); bolt(g, f[1][0], f[1][1], 1.7, K.metal); });
    g.restore();
  }
  function carlaTip(P, Lay) { const gp = gripLay(CARLA, P, Lay); return [gp[0] + 10, gp[1]]; }
  function carlaFx(g, S, name) {
    const t = S.t, tp = S.pt.tip;
    if (name === 'cogs') {
      for (let i = 0; i < 4; i++) {
        const u = fr(t * 1.4 + i / 4), x = tp[0] + 14 + u * 120, y = tp[1] - 6 - 40 * Math.sin(PI * u) + (i - 1.5) * 10 + u * 20;
        g.save(); g.globalAlpha = clamp(1.3 - u, 0, 1); cog(g, x, y, 7 + (i % 2) * 3, 8, t * 9 + i, i % 2 ? K.brass : K.metal, { line: LINE.mid }); g.restore();
      }
      if (S.beat > 0.4) burst(g, S, tp[0] + 120, tp[1] + 4, 13);
    } else if (name === 'coinsparkle') RJ.fx.sparkles(g, tp[0] + 16, tp[1], [[16, -18, 6, 0.2], [26, 8, 4, 0], [-4, -24, 4, 0.4]], K.goldHi, t);
    else if (name === 'tnotes') RJ.fx.notes(g, tp[0] - 34, tp[1] - 10, t, K.or, 3);
  }
  function carlaPoses() {
    const shrewd = { eyes: 'open', mouth: 'smirkTeeth', brow: 0.18 };
    return {
      idle: Object.assign({ mic: 'none', fHand: [32, 20], fBend: 1, fKind: 'fist', claw: 0.35, holdCog: 1, bHand: [-10, 36], bBend: -1, bKind: 'fist', bRot: 0.4, headRot: 0.05, torsoRot: -0.02, lean: -0.01, fx: ['coinsparkle'], look: [0.4, 0.1] }, shrewd),
      sing: { mic: 'none', fHand: [38, -20], fBend: 1, fKind: 'fist', claw: 0.4, holdCog: 1, cogSpin: 2, bHand: [-38, -6], bBend: -1, bKind: 'open', bSpread: 1.2, bRot: -0.3, headRot: -0.06, eyes: 'happy', mouth: 'happyOpen', brow: -0.15, fx: ['tnotes', 'coinsparkle'] },
      attack: { mic: 'none', fHand: [42, -6], fBend: 1, fKind: 'fist', claw: 1, holdCog: 0, cogSpin: 4, lean: 0.08, torsoRot: 0.05, headRot: 0.05, bHand: [-30, 22], bBend: -1, bKind: 'fist', bRot: 0.3,
        fFoot: [32, -12], bFoot: [-26, -12], eyes: 'determined', mouth: 'grin', brow: 0.4, fx: ['cogs'], look: [0.6, 0] },
      windup: { mic: 'none', fHand: [6, 26], fBend: -1, fKind: 'fist', claw: 0.2, holdCog: 1, cogSpin: 4, squash: 0.97, torsoDy: 4, lean: -0.05, torsoRot: -0.07, bHand: [-34, 10], bBend: -1, bKind: 'fist',
        fFoot: [26, -12], bFoot: [-26, -12], eyes: 'determined', mouth: 'smirkTeeth', brow: 0.4, fx: [], look: [0.5, 0] },
      strike: { mic: 'none', fHand: [44, -4], fBend: 1, fKind: 'fist', claw: 1, holdCog: 0, cogSpin: 6, lean: 0.14, bx: 6, torsoRot: 0.07, headRot: 0.06, headDx: 3, bHand: [-30, 22], bBend: -1, bKind: 'fist',
        fFoot: [36, -12], bFoot: [-26, -12], eyes: 'determined', mouth: 'grin', brow: 0.45, fx: ['cogs'], look: [0.6, 0] },
      hurt: { mic: 'none', fHand: [16, 26], fBend: 1, fKind: 'fist', claw: 0.9, holdCog: 0, cogSpin: -2, lean: -0.13, torsoRot: -0.08, headRot: -0.15, headDx: -3, bHand: [-34, -8], bBend: -1, bKind: 'open', bSpread: 1.3, bFront: 1,
        fFoot: [14, -12], bFoot: [-20, -12], eyes: 'hurt', mouth: 'ow', brow: -0.7, sweat: 1, blush: 0.6, fx: ['stars'] },
      cheer: { mic: 'none', fHand: [36, -34], fBend: 1, fKind: 'fist', claw: 0.4, holdCog: 1, cogSpin: 3, bHand: [-34, -36], bBend: -1, bKind: 'open', bSpread: 1.4, bRot: 0.2,
        fFoot: [20, -12], bFoot: [-18, -12], eyes: 'happy', mouth: 'grin', brow: -0.2, fx: ['sparkles', 'coinsparkle'] },
      block: { mic: 'none', fHand: [34, -18], fBend: 1, fKind: 'fist', claw: 1, holdCog: 0, bHand: [-14, 34], bBend: -1, bKind: 'fist', headRot: -0.06, torsoRot: -0.03,
        fFoot: [26, -12], bFoot: [-28, -12], eyes: 'determined', mouth: 'smirkTeeth', brow: 0.4, fx: ['rings'] },
      down: { mic: 'none', fHand: [22, 40], fBend: 1, fKind: 'relaxed', claw: 0.6, holdCog: 0, cogSpin: -0.9, by: 52, torsoDy: 4, torsoRot: 0.08, headRot: 0.24, headDy: 2, bHand: [-4, 48], bBend: -1, bKind: 'relaxed', bRot: 0.3,
        fFoot: [-12, -60], bFoot: [14, -60], fBow: 24, bBow: -22, fFootRot: -0.5, bFootRot: 0.4, eyes: 'closed', mouth: 'flat', brow: -0.25, blush: 0.6, fx: ['mute'] },
      walk: Object.assign({ mic: 'none', fHand: [26, 28], fBend: 1, fKind: 'fist', claw: 0.35, holdCog: 1, bHand: [-22, 32], bBend: -1, bKind: 'relaxed', bRot: 0.3, fx: [] }, shrewd),
      bust: Object.assign({ mic: 'none', fHand: [22, 44], fBend: 1, fKind: 'fist', claw: 0.35, holdCog: 1, bHand: [-10, 50], bBend: 1, bKind: 'relaxed', headRot: 0.05, fx: [] }, shrewd),
    };
  }
  const CARLA = {
    id: 'npc_scrap_carla', accent: 'scrap_kings',
    skel: {},
    base: {},
    poses: carlaPoses(),
    life: { idle: { bob: 1.1, per: 3.0, sway: 0.014, head: 0.022 } },
    face: {
      eyes: [{ x: -12, y: 15, w: 31, h: 28 }, { x: 39, y: 13, w: 26, h: 26 }],
      brows: [[-12, -8, 27], [44, -10, 23]], browStyle: { thick: 4.6, arch: 0.7, tilt: 0.02, color: CA.hairSh },
      nose: [26, 32, 58], mouth: [11, 45, 22], mouthStyle: { lineW: 1.5, teeth: true, inner: '#8a2a3a' },
      blush: [[-20, 34, 19], [40, 32, 15]], blushColor: '#ff7a8a', sweat: [58, -20, 5],
      eye: { iris: CA.iris, ring: '#1e0e06', sclera: '#fffbf4', expr: 'neutral', irisW: 0.72, irisH: 0.95, lid: 2.1, wing: 0.75, lash: 1.2, crease: true, lashes: 2, tilt: 0.05, drop: 0.2, hl: [[-0.4, -0.5, 0.28], [-0.32, -0.1, 0.13]] },
    },
    exprs: EXPRS,
    arm: { l: [24, 22], w: [16, 12], skin: CA.skin, skinSh: CA.skinSh, sleeve: { color: CA.shirt, shade: CA.shirtSh, len: 0.6, w0: 21, w1: 22 }, hand: { skin: CA.skin, shade: CA.skinSh } },
    legs: { w: [32, 28], color: CA.pants, shade: CA.pantsSh, pantsOver: true, bow: 2, profile: (u) => 1 - 0.1 * u, shoe: Object.assign({}, BOOT, { color: K.or, shade: K.orSh, hi: K.orHi, toeCap: K.cream, sole: K.boot, k: 1.2 }), decor: overallLegs({ cuff: K.or, cuffSh: K.orSh, cuffW: 15 }) },
    bounds: { x0: -100, x1: 116, h: 314 },
    bust: { rect: [-104, -320, 104, -100], face: [-80, -316, 76, -140], pose: 'bust' },
    tip: carlaTip,
    tweak(P, t) { if (P.pose === 'idle') P.fHand = [P.fHand[0], P.fHand[1] + 2 * Math.sin(t * 1.6)]; else if (P.pose === 'sing') P.claw = 0.4 + 0.3 * Math.max(0, Math.sin(t * 5)); },
    layers: { torso: carlaTorso, head: carlaHead, over: carlaArm, fx: carlaFx },
  };
  RJ.register('npc_scrap_carla', scrapRig(CARLA));

  window.RGCAST = window.RGCAST || {};
  window.RGCAST.scrap_kings = {
    ids: ['npc_scrap_cassette', 'npc_scrap_hammer', 'npc_scrap_weld', 'npc_scrap_sparks', 'npc_scrap_carla'],
    note: [
      'npc_scrap_cassette: King Cassette (boss), taller and broader, crown of three spinning spools on a gold band, banner-patchwork cape, gold-trimmed patched overalls over royal-blue sleeves, handlebar moustache, chrome sceptre topped by a gold spool (tape-lash attack).',
      'npc_scrap_hammer: Jack Hammer (enforcer), broad flat-top welder, amber goggles pushed up, tank top with one strap down, rubber-capped sledge he slams on an anvil-drum (clang attack).',
      'npc_scrap_weld: Weld (grunt), short and stocky, welding helmet down with big eyes behind a tinted visor, canvas gloves, hissing blue-flame torch with tiny sparks (weld-jet attack).',
      'npc_scrap_sparks: Sparks (grunt), wiry tall mechanic, blond spikes with live sparking cables, spring-reverb tank backpack, note-shaped tuning wrench (zap attack).',
      'npc_scrap_carla: Cog Carla (merchant/fixer), polka-dot headscarf and curly bun with a pencil, brass loupe, apron full of cogs, mechanical arm with cog elbow and claw (thrown-cogs attack).',
    ].join('\n'),
  };
})();
