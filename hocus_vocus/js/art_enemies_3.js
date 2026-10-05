// Hocus Vocus: ART.enemy art for Act III, the Perfect Stage: the biggest talent show in the world with the life polished out of it (every act perfect
// and identical, blinding opal white and pastel chrome, mirror floors, ring lights like halos, an APPLAUSE sign that never switches off). Extends ART
// (art.js) and builds on the chibi cast kit's foe kit ART.rj.foe (art_cast_kit.js). This file draws exactly the 17 ids of DATA.ROSTER[3] and
// registers each with ART.enemy.register(id, {draw, bounds}). The ids stay (bible H1); the names below are the player's names (HV_ENEMIES 4.1).
//
//   creatures (E3a)  storm_drone Tuner Drone, komainu_guardian VIP Bouncer, redaction_knight Clapperboard Knight, void_scribe Chrome Siren,
//                    blank_soldier Synchro Dancer, sky_serpent Streamer Dragon, eraser_wraith Airbrush Wraith, thunder_crow Ring Light Sentinel,
//                    paper_golem Sequin Golem, margin_imp Glitch Gremlin
//   rivals (E3b)     censor_golem Big Mute Button, storm_whelp Applause Sign (art word APPLAUSE), black_bar_inquisitor Mannequin Judge (generic)
//   sidekicks (E3b)  blank_page Lip-Sync Clone, spark_mote Confetti Popper, typo_sprite Pitch Glitch
//   headliner (E3c)  boss_editor Flawless, Star of the Perfect Stage: phase 0 Flawless (the idol with the mirror mic), phase 1 the Filter (a ring-light
//                    lens head, selfie-stick arms, the art word FLAWLESS! on the chest band), phase 2 the Gloss (a sky-filling mirror face)
//
// CONTRACT (DESIGN 5.6, unchanged). draw(ctx, o) receives the context ALREADY translated to the feet centre and scaled; it paints around (0, 0), y
// negative up, facing LEFT. o = {s, pose, t, pt, hpPct, phase, glow, flip}. t is absolute seconds (loops), pt seconds since the pose began (one-shot
// poses). Poses are LISTS.enemyPoses: idle attack hurt block buff die telegraph, with the Echowake timings (POSE_MS below). Elite ornament, the aura
// ring and the ground shadow are drawn by ART.enemy.draw: nothing here duplicates them. Every id is deterministic (no clock, never the banned random
// call), never throws for odd input, and keeps save and restore balanced.
//
// THE LOOK (HV_ART_AUDIO 1 and 4, HV_ENEMIES 4.4 and 6). The owners' chibi cast is the style authority: an even outline (the foe kit's Act III slate
// #5a5f7a, its width by size class), flat cel colour with one hard shadow and one highlight, big flat-cel eyes, round bouncy shapes, stubby limbs,
// cute faces. The Act III palette is the Gloss (opal #f4f1fb, lilac #e6d9ff, mint #d9fff4, blush #ffe3f1), chrome #c9cbd6 and one mirror gradient;
// nothing saturated except ONE small accent per creature. Every creature is symmetric until hurt, and every face wears the one shared Gloss smile.
// Two gags carry the Act: a hurt pose cracks a hairline of REAL colour (warm, saturated, a little messy) through the polish for a moment; the win-over
// (the die pose, HV_ENEMIES 6.4) flakes the Gloss off, gives the creature its real colours, a warm line and a lopsided real smile with one eyebrow
// up, one happy hop, then a pop into confetti that breaks the grid, leaving a small sparkle of real colour on the floor. Nothing is dark or scary.
//
// HOW THEY ARE BUILT (cutout puppets).
//   A creature is a handful of PARTS (a head, an arm, a lens), each drawn ONCE at rest into a cached sprite per raster scale q = ceil(2 * s) / 2 and
//   composited every frame under its own transform (a pivot, a rotation, a squash). Things that flow (streamers, a ponytail, a gown hem) are
//   ART.tk.chain parts: one baked drawing sliced into slabs that bend at joints. Every part has three baked variants: the polished one (the paint
//   with the Gloss film baked over it: an opalescent wash and a diagonal highlight sweep in creature space, so every part of a creature shares one
//   sweep), 'w' (the white silhouette of the hurt flash) and 'r' (the real colours of the win-over: spec.real overrides spec.col, the line turns
//   warm, no film). Whatever changes every frame is drawn LIVE and cheaply: eyes (blink, look), the Gloss smile, propellers, pitch lines, mist,
//   sparkles, the hurt crack. One shared pose state (wind-up, strike, recoil, guard, buff pulse, telegraph) is read by each creature's rig().
//
// THE POLISH HELPER SET (HV_ART_AUDIO 4.3, used by every creature): chrome(S, shape, o) two-band chrome with one mirror streak; mirror(S, shape, o)
// a reflective panel in the one mirror gradient; sequins(g, x, y, w, h, o) aligned sequin discs that flick off as o.k rises; ringLight(S, x, y, r, o)
// a ring light torus with its LEDs; crack(c, x, y, s, seed, k) the hurt gag; confettiGrid(c, box, p, broken, seed) square confetti that falls in a
// grid (or breaks it); reflection(c, fn, floorY, alpha) the cheap mirror-floor copy (the gallery cells use it). The Gloss smile, the eyes, the
// sheen and the win-over come from the foe kit.
//
// EXTRAS beyond DESIGN 5.6
//   ART.enemy.warm3(id, s) -> parts baked      pre-bake every sprite of an Act III creature at the raster scale for s (avoids a first-frame hitch)
//   ART.enemy.ids3() -> the 17 ids drawn here
//   boss_editor is ONE spec holding the parts of all three forms (prefixes p0_ p1_ p2_) and one rig per form, chosen by o.phase (later values keep
//   the last form). Each form has its own win-over, and every one ends the same way: left floating is a tiny shy round lens with a nervous smile
//   that wobbles one crooked note (HV_ENEMIES 5.3).
//   Gallery sheets: enemies3 (Act III, the Perfect Stage: every creature, rival and sidekick in several poses), boss3 (Flawless, all three forms:
//   each form large, then every pose), enemies3_anim (film strips of two creatures), enemies3_dev (params id[,id]|all pose|all zoom t pt phase hp).
//
// RIG MAP (HV_ENEMIES 4.5): each creature keeps the motion of the Echowake rig it started from, named in its header below.
(() => {
  'use strict';
  const tk = ART.tk, RJ = ART.rj, foe = RJ && RJ.foe;
  if (!foe) return;                                     // the cast kit loads first (index.html); without it there is nothing to draw with
  const clamp = tk.clamp, lerp = tk.lerp, num = tk.num, ease = tk.ease;
  const TAU = Math.PI * 2, PI = Math.PI;
  const sin = Math.sin, cos = Math.cos;
  const cA = (a) => (a >= 0 ? (a <= 1 ? a : 1) : 0);
  const sm = tk.smoothstep;
  const SPECS = {};
  const PAD = 8;
  const POSES = ['idle', 'attack', 'hurt', 'block', 'buff', 'die', 'telegraph'];
  const POSE_MS = { attack: 420, hurt: 260, block: 300, buff: 400, die: 700, telegraph: 0, idle: 0 };

  // ---------------------------------------------------------------------------------------------------------------
  // the Act III palette: the Gloss tokens, chrome, the slate line, the one accent, and the REAL colours the win-over and the hurt crack reveal
  // ---------------------------------------------------------------------------------------------------------------
  const G = {
    opal: '#f4f1fb', lilac: '#e6d9ff', mint: '#d9fff4', blush: '#ffe3f1', chrome: '#c9cbd6', chromeL: '#dfe0ea', chromeD: '#a4a8bc',
    line: '#5a5f7a', white: '#ffffff', porcelain: '#fbf8ff', accent: '#ff4d6d', lemon: '#fff3b8', mist: '#f7f5ff', slateD: '#474b63',
  };
  const REAL_LINE = '#2d2747';                         // the warm line a won-over creature gets back
  const REAL = ['#ff5a3d', '#ffd84d', '#ff6fb5', '#3fcf6a', '#7cc6ff', '#8b4dff'];   // the hurt crack and the floor sparkle: real, warm, a little messy
  const LW = { s: 2.0, m: 2.4, l: 2.8, xl: 3.2 };      // the foe kit's main line by size class (foe.ink)

  // ---------------------------------------------------------------------------------------------------------------
  // shape helpers (control-point arrays for RJ.cel / tk.celFill)
  // ---------------------------------------------------------------------------------------------------------------
  const E = (cx, cy, rx, ry, n, rot) => tk.ellipsePts(cx, cy, rx, ry, n || Math.max(12, Math.round(Math.max(rx, ry) / 3) + 10), rot || 0);
  // a rounded rectangle with true quarter-arc corners (three points each), so the spline smoothing never overshoots into spikes at the ends of
  // thin bars; r up to half the short side gives a stadium
  function RR(x, y, w, h, r) {
    w = Math.abs(num(w, 1)); h = Math.abs(num(h, 1));
    r = clamp(r === undefined ? Math.min(w, h) * 0.25 : num(r, 0), 0, Math.min(w, h) / 2);
    if (r < 0.5) return [[x, y, 1], [x + w, y, 1], [x + w, y + h, 1], [x, y + h, 1]];
    const pts = [];
    const corner = (cx, cy, a0) => { for (let i = 0; i <= 2; i++) { const a = a0 + i * PI / 4, p = [cx + cos(a) * r, cy + sin(a) * r], q = pts[pts.length - 1]; if (!q || Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.4) pts.push(p); } };
    corner(x + w - r, y + r, -PI / 2); corner(x + w - r, y + h - r, 0); corner(x + r, y + h - r, PI / 2); corner(x + r, y + r, PI);
    const a = pts[0], b = pts[pts.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) <= 0.4) pts.pop();
    return pts;
  }
  // a closed shape symmetric about x = 0 from its LEFT half listed top to bottom (x <= 0); points on the axis are not doubled, corners keep their flag.
  // Act III is perfectly symmetric, so most bodies are drawn this way.
  function sym(half) {
    const back = half.filter((p) => Math.abs(p[0]) > 0.001).reverse().map((p) => (p[2] ? [-p[0], p[1], 1] : [-p[0], p[1]]));
    return half.concat(back);
  }
  // deterministic tiny helpers for live animation
  const hv = (id, salt) => tk.vary(id, salt);
  const fr = (v) => v - Math.floor(v);
  const blink = (t, id, per) => {
    per = per || 3.6 + 1.6 * hv(id, 'bp');
    const ph = ((t + hv(id, 'bo') * per) % per + per) % per;
    return ph < 0.16 ? Math.abs(ph - 0.08) / 0.08 : 1;                    // 1 open, dips to 0 for a moment
  };
  // move, rotate and scale the context about a pivot (px, py): the way every creature body is posed
  function xform(ctx, px, py, dx, dy, rot, sx, sy) {
    ctx.translate(px + dx, py + dy);
    if (rot) ctx.rotate(rot);
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    ctx.translate(-px, -py);
  }
  // point and unit tangent at fraction u (0..1) along a control-point spine
  function along(spine, u) {
    const d = tk.flatten(spine, { step: 2 }), n = d.length / 2 - 1, L = [0];
    for (let i = 1; i <= n; i++) L.push(L[i - 1] + Math.hypot(d[2 * i] - d[2 * i - 2], d[2 * i + 1] - d[2 * i - 1]));
    const s = clamp(u, 0, 1) * L[n];
    let i = 1;
    while (i < n && L[i] < s) i++;
    const f = clamp((s - L[i - 1]) / ((L[i] - L[i - 1]) || 1), 0, 1);
    const x = lerp(d[2 * i - 2], d[2 * i], f), y = lerp(d[2 * i - 1], d[2 * i + 1], f);
    let tx = d[2 * i] - d[2 * i - 2], ty = d[2 * i + 1] - d[2 * i - 1];
    const tl = Math.hypot(tx, ty) || 1;
    return { x, y, tx: tx / tl, ty: ty / tl };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // the paint helper handed to every part: the house cel in the Act line (or the warm real line), limbs, and the POLISH set
  // ---------------------------------------------------------------------------------------------------------------
  function makeS(g, spec, v) {
    const real = v === 'r';
    const c = real ? Object.assign({}, spec.col, spec.real || {}) : spec.col;
    const L = LW[spec.size] || 2.4, lc = real ? REAL_LINE : G.line;
    const S = { g, c, L, lc, real, spec };
    S.cel = (pts, base, o) => RJ.cel(g, pts, base, Object.assign({ line: L, lineColor: lc, wobble: 0 }, o));
    S.ell = (cx, cy, rx, ry, base, o) => S.cel(E(cx, cy, rx, ry), base, o);
    S.line = (pts, o) => RJ.ink(g, pts, Object.assign({ w: L * 0.75, color: lc, taper: 0.25, wobble: 0 }, o));
    S.limb = (a, b, w, col, o) => RJ.blob(g, [{ a, b, w }], Object.assign({ fill: col, shade: RJ.shade(col, 0.1), ink: lc, L, lit: 1.3 }, o));
    S.blob = (items, col, o) => RJ.blob(g, items, Object.assign({ fill: col, shade: RJ.shade(col, 0.1), ink: lc, L, lit: 1.3 }, o));
    S.fill = (pts, col, alpha) => RJ.fillPts(g, pts, col, alpha === undefined ? 1 : alpha);
    S.chrome = (pts, o) => chrome(S, pts, o);
    S.mirror = (pts, o) => mirror(S, pts, o);
    S.glove = (x, y, ang, k, col) => glove(S, x, y, ang, k, col);
    return S;
  }

  // two-band chrome: a pale upper band, a darker reflected lower band with a hard horizon, one mirror streak. o: base, horizon (0..1 of the
  // height), streak (false to skip), tension, hi
  function chrome(S, pts, o) {
    o = o || {};
    const base = o.base || (S.real ? S.c.chromeReal || '#9fb4ff' : G.chromeL), box = tk.shapeBox(pts) || [0, 0, 1, 1];
    const bw = box[2] - box[0], bh = box[3] - box[1], hz = box[1] + bh * num(o.horizon, 0.56);
    S.cel(pts, base, {
      tension: o.tension, shadow: o.shadow || RJ.shade(base, 0.16), hi: o.hi === false ? false : '#ffffff', hiW: 2,
      decor(g) {
        g.fillStyle = S.real ? 'rgba(40,30,90,0.16)' : 'rgba(120,124,156,0.22)'; g.fillRect(box[0] - 2, hz, bw + 4, box[3] - hz + 2);
        g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(box[0] - 2, hz - Math.max(1, bh * 0.025), bw + 4, Math.max(1, bh * 0.025));
        if (o.streak !== false) {
          const sx = box[0] + bw * 0.16, sw = Math.max(2, bw * 0.07);
          g.fillStyle = 'rgba(255,255,255,0.8)';
          g.beginPath(); g.moveTo(sx, box[1] - 2); g.lineTo(sx + sw, box[1] - 2); g.lineTo(sx + sw + bh * 0.3, box[3] + 2); g.lineTo(sx + bh * 0.3, box[3] + 2); g.closePath(); g.fill();
          g.globalAlpha = 0.5; g.beginPath(); g.moveTo(sx + sw * 1.8, box[1] - 2); g.lineTo(sx + sw * 2.3, box[1] - 2); g.lineTo(sx + sw * 2.3 + bh * 0.3, box[3] + 2); g.lineTo(sx + sw * 1.8 + bh * 0.3, box[3] + 2); g.closePath(); g.fill();
        }
      },
    });
  }
  // a reflective panel in THE mirror gradient (lilac to mint to blush on the diagonal) with two white streaks. o: base, tension, streaks (2)
  function mirror(S, pts, o) {
    o = o || {};
    const box = tk.shapeBox(pts) || [0, 0, 1, 1], bw = box[2] - box[0], bh = box[3] - box[1];
    S.cel(pts, o.base || (S.real ? '#bfe9ff' : G.opal), {
      tension: o.tension, shadow: false, hi: false,
      decor(g) {
        const gr = g.createLinearGradient(box[0], box[1], box[2], box[3]);
        if (S.real) { gr.addColorStop(0, '#9fd8ff'); gr.addColorStop(0.5, '#ffd6f0'); gr.addColorStop(1, '#fff0a0'); } else { gr.addColorStop(0, G.lilac); gr.addColorStop(0.5, G.mint); gr.addColorStop(1, G.blush); }
        g.fillStyle = gr; g.fillRect(box[0] - 2, box[1] - 2, bw + 4, bh + 4);
        const n = o.streaks === undefined ? 2 : o.streaks;
        g.fillStyle = 'rgba(255,255,255,0.75)';
        for (let i = 0; i < n; i++) {
          const sx = box[0] + bw * (0.18 + i * 0.2), sw = Math.max(2, bw * (i ? 0.05 : 0.1));
          g.beginPath(); g.moveTo(sx - bh * 0.25, box[1] - 2); g.lineTo(sx + sw - bh * 0.25, box[1] - 2); g.lineTo(sx + sw + bh * 0.25, box[3] + 2); g.lineTo(sx + bh * 0.25, box[3] + 2); g.closePath(); g.fill();
        }
        if (o.decor) o.decor(g, box);
      },
    });
  }
  // aligned sequin discs over [x, y, w, h] (call inside a clip): rows of small discs with a gradient through o.cols, each with a catch of light.
  // o.k 0..1 drops sequins (deterministic per index) so a hurt or bare patch shows; o.d spacing, o.r radius, o.seed
  function sequins(g, x, y, w, h, o) {
    o = o || {};
    const d = num(o.d, 7), r = num(o.r, d * 0.42), cols = o.cols || [G.lilac, G.blush, G.opal], k = clamp(num(o.k, 0), 0, 1), seed = o.seed || 1;
    const rows = Math.ceil(h / (d * 0.86)) + 1, n = Math.ceil(w / d) + 1;
    g.save();
    g.lineWidth = Math.max(0.6, r * 0.26);
    for (let j = 0; j < rows; j++) {
      const yy = y + j * d * 0.86, col = cols[Math.min(cols.length - 1, Math.floor(j / rows * cols.length))];
      for (let i = 0; i < n; i++) {
        if (k > 0 && hv(seed, 'q' + i + '_' + j) < k) continue;
        const xx = x + i * d + (j % 2 ? d / 2 : 0);
        g.beginPath(); g.arc(xx, yy, r, 0, TAU); g.fillStyle = col; g.fill();
        g.strokeStyle = 'rgba(90,95,122,0.35)'; g.stroke();
        g.beginPath(); g.arc(xx - r * 0.3, yy - r * 0.32, r * 0.32, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fill();
      }
    }
    g.restore();
  }
  // a ring light: a white diffuser torus (outer r, inner r * o.inner) with an even ring of LEDs, a chrome outer lip. o: inner (0.62), leds (16), lit (0..1)
  function ringLight(S, x, y, r, o) {
    o = o || {};
    const ri = r * num(o.inner, 0.62), n = o.leds || 16, g = S.g;
    const ring = (gg) => { gg.beginPath(); gg.arc(x, y, r, 0, TAU); gg.moveTo(x + ri, y); gg.arc(x, y, ri, 0, TAU, true); };
    g.save();
    ring(g); g.fillStyle = S.real ? '#fff4c2' : '#fbfaff'; g.fill('evenodd');
    // the soft lower half shading of the torus, clipped to the ring
    ring(g); g.clip('evenodd');
    g.beginPath(); g.arc(x - r * 0.12, y + r * 0.14, r, 0, TAU); g.moveTo(x + ri * 0.9, y); g.arc(x, y, ri * 1.04, 0, TAU, true);
    g.fillStyle = S.real ? 'rgba(255,170,90,0.35)' : 'rgba(201,203,214,0.55)'; g.fill('evenodd');
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU, rr = (r + ri) / 2;
      g.beginPath(); g.arc(x + cos(a) * rr, y + sin(a) * rr, Math.max(0.8, (r - ri) * 0.12), 0, TAU); g.fillStyle = S.real ? '#ffd84d' : '#fffbe6'; g.fill();
    }
    g.restore();
    g.save(); g.lineWidth = S.L; g.strokeStyle = S.lc;
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
    g.lineWidth = S.L * 0.8; g.beginPath(); g.arc(x, y, ri, 0, TAU); g.stroke();
    g.restore();
  }
  // a cartoon white glove (the Applause Sign, the judge's hand): a fat mitten with three finger bumps and a cuff, at (x, y) pointing along ang
  function glove(S, x, y, ang, k, col) {
    const g = S.g;
    k = k || 1;
    g.save(); g.translate(x, y); g.rotate(ang || 0); g.scale(k, k);
    S.blob([{ e: [9, 0, 10, 9] }, { a: [12, -6], b: [20, -6], w: 6 }, { a: [12, 0], b: [21, 0], w: 6 }, { a: [12, 6], b: [19, 6], w: 6 }, { a: [4, -8], b: [9, -13], w: 6 }], col || '#ffffff', { L: S.L * 0.85 / Math.sqrt(k) });
    S.cel(RR(-6, -8, 7, 16, 3), col || '#ffffff', { line: S.L * 0.8 / k });
    RJ.ink(g, [[13, -3], [20, -3]], { w: 0.9, color: S.lc, taper: 0.4, alpha: 0.6 });
    RJ.ink(g, [[13, 3], [20, 3]], { w: 0.9, color: S.lc, taper: 0.4, alpha: 0.6 });
    g.restore();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // live helpers (drawn every frame, cheap): the hurt crack, square confetti, the mirror-floor copy, pitch lines, mist, the face
  // ---------------------------------------------------------------------------------------------------------------
  // THE hurt gag: a hairline of REAL colour cracking through the polish at (x, y), s long, k 0..1. Three messy warm strands and a tiny glow.
  function crack(c, x, y, s, seed, k) {
    k = cA(k);
    if (k < 0.04) return;
    const pts = [[x, y]];
    let px = x, py = y;
    const a0 = (hv(seed, 'a') - 0.5) * 1.2 + PI * 0.5;
    for (let i = 1; i <= 5; i++) { const a = a0 + (i % 2 ? 0.7 : -0.7) * (0.6 + hv(seed, 'j' + i)); px += cos(a) * s / 5; py += sin(a) * s / 5; pts.push([px, py]); }
    c.save();
    c.globalAlpha = c.globalAlpha * k;
    tk.glow(c, x, y + s * 0.4, s * 0.9, '#ff9a4a', 0.35 * k);
    c.lineCap = 'round'; c.lineJoin = 'round';
    const strand = (w, col, ox) => { c.lineWidth = w; c.strokeStyle = col; c.beginPath(); pts.forEach((p, i) => { if (i) c.lineTo(p[0] + ox, p[1]); else c.moveTo(p[0] + ox, p[1]); }); c.stroke(); };
    strand(4.2, G.line, 0);
    strand(2.8, REAL[0], 0);
    strand(1.2, REAL[1], -0.6);
    c.lineWidth = 1.6; c.strokeStyle = REAL[2];
    const b = pts[2];
    c.beginPath(); c.moveTo(b[0], b[1]); c.lineTo(b[0] + s * 0.22 * (hv(seed, 'b') > 0.5 ? 1 : -1), b[1] + s * 0.12); c.stroke();
    c.restore();
  }
  // square confetti in a grid over box [x0, y0, x1, y1] falling with p 0..1; broken scatters it (the Gloss losing), else it falls in perfect rows
  function confettiGrid(c, box, p, broken, seed) {
    const x0 = box[0], y0 = box[1], w = box[2] - box[0], h = box[3] - box[1], cols = 7, rows = 4, cl = [G.lilac, G.mint, G.blush, G.lemon, G.chrome];
    p = clamp(p, 0, 1);
    c.save();
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const k = j * cols + i, sp = broken ? (hv(seed, 'c' + k) - 0.5) : 0, fall = fr(p + j / rows);
      const x = x0 + (i + 0.5) / cols * w + sp * 40 * fall + (broken ? sin(fall * 9 + k) * 6 : 0), y = y0 + fall * h;
      const a = sin(PI * fall);
      if (a < 0.05) continue;
      c.globalAlpha = a; c.save(); c.translate(x, y); c.rotate(broken ? fall * 6 * sp : 0);
      c.fillStyle = cl[k % cl.length]; c.fillRect(-3, -3, 6, 6); c.strokeStyle = 'rgba(90,95,122,0.5)'; c.lineWidth = 0.8; c.strokeRect(-3, -3, 6, 6);
      c.restore();
    }
    c.restore();
  }
  // the cheap mirror-floor copy: fn(c) drawn upside down about floorY at a low alpha (HV_ENEMIES 4.4: mirror floors double every creature)
  function reflection(c, fn, floorY, alpha) {
    c.save();
    c.translate(0, 2 * floorY); c.scale(1, -1);
    c.globalAlpha = c.globalAlpha * cA(alpha === undefined ? 0.18 : alpha);
    try { fn(c); } finally { c.restore(); }
  }
  // perfectly regular pitch lines (the Act's "lightning"): a sine wave from (x0, y0) to (x1, y1), amp px, waves n, an outline then a pastel core
  function pitchLine(c, x0, y0, x1, y1, amp, n, col, w, alpha) {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, steps = Math.max(8, Math.round(n * 8));
    c.save();
    c.globalAlpha = c.globalAlpha * cA(alpha === undefined ? 1 : alpha);
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      c.beginPath();
      for (let i = 0; i <= steps; i++) { const u = i / steps, o = sin(u * n * TAU) * amp * sin(PI * u); const px = x0 + dx * u + nx * o, py = y0 + dy * u + ny * o; if (i) c.lineTo(px, py); else c.moveTo(px, py); }
      c.lineWidth = pass ? w : w + 2.4; c.strokeStyle = pass ? col : G.line; c.stroke();
    }
    c.restore();
  }
  // soft pastel mist puffs drifting from (x, y) along dir (radians): the airbrush, the confetti smoke. o: n, spread, size, life, alpha, cols
  function mist(c, x, y, t, dir, o) {
    o = o || {};
    const n = o.n || 6, life = num(o.life, 1), cols = o.cols || [G.blush, G.lilac, G.mint], m = tk.motion();
    c.save();
    for (let i = 0; i < n; i++) {
      const per = life * (0.8 + 0.4 * hv(o.seed || 1, 'l' + i)), u = fr((t * m + hv(o.seed || 1, 'p' + i) * per) / per);
      const a = sin(u * PI) * num(o.alpha, 0.6);
      if (a < 0.03) continue;
      const d = u * num(o.reach, 60), sp = (hv(o.seed || 1, 's' + i) - 0.5) * num(o.spread, 0.6);
      c.globalAlpha = cA(a); c.fillStyle = cols[i % cols.length];
      c.beginPath(); c.arc(x + cos(dir + sp) * d, y + sin(dir + sp) * d, num(o.size, 7) * (0.5 + u * 1.2), 0, TAU); c.fill();
    }
    c.restore();
  }
  // THE face of an Act III creature (live): eyes from the foe kit and the one shared Gloss smile. Hurt squeezes the eyes and pops a little O; the
  // win-over (st.won) gives real round eyes, one eyebrow up and a lopsided, real smile. o: kind (foe eye kind), w (eye width), gap, my (mouth
  // offset below the eyes), sw (smile width), iris, look, open, noMouth, noEyes (only the mouth, at y + my), brow (the brow height above the eyes when won)
  function face(c, st, x, y, o) {
    o = o || {};
    const E0 = st.E, hurt = E0.hurt, won = !!st.won, w = num(o.w, 14), lc = won ? REAL_LINE : G.line;
    const kind = won && o.kind !== 'needle' ? (o.kind === 'dot' ? 'dot' : 'round') : (o.kind || 'lens');
    const open = won ? 1 : num(o.open, 1) * (kind === 'lens' || kind === 'needle' ? 1 : blink(st.t, st.spec.id, o.per)) * (1 - 0.75 * hurt);
    const look = o.look || [0, 0];
    if (!o.noEyes) foe.eyes(c, x, y, w, { kind: hurt > 0.45 && !won && kind !== 'needle' ? 'round' : kind, open: hurt > 0.45 && !won ? 0.05 : open, look, gap: o.gap, act: 3, lineColor: lc, iris: won ? ['#3a2f6b', '#6f8cff'] : o.iris, h: o.h });
    if (o.noMouth) return;
    const my = y + num(o.my, w * 1.1), sw = num(o.sw, w * 0.95);
    if (won) {
      // one eyebrow lifts, the smile goes lopsided and real
      const gap = num(o.gap, w * 1.3), by = y - num(o.brow, w * 0.9);
      if (!o.noEyes) {
        RJ.ink(c, [[x - gap / 2 - w * 0.4, by + 1], [x - gap / 2 + w * 0.35, by - 1]], { w: Math.max(1.2, w * 0.13), color: lc, taper: 0.3, wobble: 0 });
        RJ.ink(c, [[x + gap / 2 - w * 0.4, by - w * 0.32], [x + gap / 2, by - w * 0.48], [x + gap / 2 + w * 0.4, by - w * 0.3]], { w: Math.max(1.2, w * 0.13), color: lc, taper: 0.3, wobble: 0 });
      }
      c.save(); c.translate(x, my); c.rotate(-0.16);
      RJ.mouth(c, sw * 0.12, 0, sw * 1.15, 'happyOpen', { ink: lc });
      c.restore();
      if (!o.noEyes) {
        c.save(); c.globalAlpha = c.globalAlpha * 0.6; c.fillStyle = '#ff8d98';
        c.beginPath(); c.ellipse(x - gap * 0.75, my - w * 0.15, w * 0.32, w * 0.16, 0, 0, TAU); c.fill();
        c.beginPath(); c.ellipse(x + gap * 0.75, my - w * 0.15, w * 0.32, w * 0.16, 0, 0, TAU); c.fill();
        c.restore();
      }
    } else if (hurt > 0.45) foe.mouth(c, x, my - sw * 0.1, sw * 0.8, 'O', { ink: lc });
    else foe.glossSmile(c, x, my, sw, { color: lc });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // spec registry and baking: three variants per part ('' polished with the Gloss film, 'w' the white hurt flash, 'r' the real colours)
  // ---------------------------------------------------------------------------------------------------------------
  const qOf = (s) => Math.max(0.5, Math.ceil(clamp(num(s, 1), 0.25, 2.5) * 2) / 2);
  function define(id, spec) {
    spec.id = id;
    spec.parts = spec.parts || {};
    spec.chains = spec.chains || {};
    spec.col = spec.col || {};
    spec._chain = {};
    SPECS[id] = spec;
    return spec;
  }
  function boxOf(p) { const b = p.box; return [b[0] - PAD, b[1] - PAD, b[2] + PAD, b[3] + PAD]; }
  // the Gloss film baked over a polished part (source-atop keeps it on the paint): an opalescent wash on the creature's diagonal and one soft
  // highlight sweep, both in CREATURE space so every part of a creature shares them (a phone screen catching the light). spec.film scales it.
  function filmOver(g, spec, b) {
    const k = num(spec.film, 1);
    if (k <= 0) return;
    const B = spec.bounds, x0 = -B.w / 2, y0 = -B.h, x1 = B.w / 2, w = b[2] - b[0], h = b[3] - b[1];
    g.save();
    g.globalCompositeOperation = 'source-atop';
    const gr = g.createLinearGradient(x0, y0, x1, 0);
    gr.addColorStop(0, tk.rgba(G.lilac, 0.2 * k)); gr.addColorStop(0.5, tk.rgba(G.mint, 0.12 * k)); gr.addColorStop(1, tk.rgba(G.blush, 0.2 * k));
    g.fillStyle = gr; g.fillRect(b[0], b[1], w, h);
    const sw = spec.sweep || [x0 + B.w * 0.3, y0 + B.h * 0.3], bw = Math.max(6, B.w * 0.07), lean = B.h * 0.32;
    g.fillStyle = tk.rgba('#ffffff', 0.24 * k);
    g.beginPath(); g.moveTo(sw[0] - bw - lean, sw[1] - B.h); g.lineTo(sw[0] - lean, sw[1] - B.h); g.lineTo(sw[0] + lean, sw[1] + B.h); g.lineTo(sw[0] - bw + lean, sw[1] + B.h); g.closePath(); g.fill();
    g.fillStyle = tk.rgba('#ffffff', 0.14 * k);
    g.beginPath(); g.moveTo(sw[0] + bw * 0.5 - lean, sw[1] - B.h); g.lineTo(sw[0] + bw * 0.9 - lean, sw[1] - B.h); g.lineTo(sw[0] + bw * 0.9 + lean, sw[1] + B.h); g.lineTo(sw[0] + bw * 0.5 + lean, sw[1] + B.h); g.closePath(); g.fill();
    g.restore();
  }
  function partSpr(spec, name, q, v) {
    const p = spec.parts[name], b = boxOf(p), w = b[2] - b[0], h = b[3] - b[1];
    return ART.sprite('en3|' + spec.id + '|' + name + '|' + q + '|' + (v || ''), w * q, h * q, (g) => {
      g.scale(q, q); g.translate(-b[0], -b[1]);
      p.draw(makeS(g, spec, v === 'r' ? 'r' : ''));
      if (v === 'w') { g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#ffffff'; g.fillRect(b[0], b[1], w, h); } else if (v !== 'r' && p.film !== false) filmOver(g, spec, b);
    });
  }
  function chainOf(spec, name, v) {
    const key = name + '|' + (v || '');
    let c = spec._chain[key];
    if (c) return c;
    const d = spec.chains[name];
    c = tk.chain('en3|' + spec.id + '|' + key, {
      spine: d.spine, cuts: d.cuts, reach: d.reach, overlap: d.overlap,
      draw: (g) => {
        d.draw(makeS(g, spec, v === 'r' ? 'r' : ''));
        if (v === 'w') { g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#ffffff'; g.fillRect(-700, -700, 1400, 1400); } else if (v !== 'r' && d.film !== false) filmOver(g, spec, [-700, -700, 700, 700]);
      },
    });
    spec._chain[key] = c;
    return c;
  }

  // draw the baked part `name` at its rest place, under an extra transform about its pivot. T = {x, y, r, sx, sy, a, kids, pre, noFlash}.
  // kids(ctx) runs inside the transform (after the sprite), pre(ctx) before it, both in REST coordinates, so children with their own pivots nest.
  function put(ctx, st, name, T) {
    T = T || {};
    const spec = st.spec, p = spec.parts[name];
    if (!p) return;
    const b = boxOf(p), pv = p.pivot || [0, 0], w = b[2] - b[0], h = b[3] - b[1];
    ctx.save();
    ctx.translate(pv[0] + num(T.x, 0), pv[1] + num(T.y, 0));
    if (T.r) ctx.rotate(T.r);
    if (T.sx !== undefined || T.sy !== undefined) ctx.scale(T.sx === undefined ? 1 : T.sx, T.sy === undefined ? 1 : T.sy);
    const ga = ctx.globalAlpha;
    if (T.a !== undefined) ctx.globalAlpha = ga * cA(T.a);
    const ox = b[0] - pv[0], oy = b[1] - pv[1];
    if (T.pre) { ctx.save(); ctx.translate(-pv[0], -pv[1]); T.pre(ctx); ctx.restore(); }
    ctx.drawImage(partSpr(spec, name, st.q, st.v), ox, oy, w, h);
    if (st.flash > 0.02 && !T.noFlash) {
      const ga2 = ctx.globalAlpha;
      ctx.globalAlpha = ga2 * cA(st.flash);
      ctx.drawImage(partSpr(spec, name, st.q, 'w'), ox, oy, w, h);
      ctx.globalAlpha = ga2;
    }
    ctx.globalAlpha = ga;
    if (T.kids) { ctx.translate(-pv[0], -pv[1]); T.kids(ctx); }
    ctx.restore();
  }
  // a chain part (streamer, ponytail, hem) drawn with per-joint bends (radians, see ART.tk.chain), under an optional transform about its root
  function putChain(ctx, st, name, bends, T) {
    T = T || {};
    const spec = st.spec;
    if (!spec.chains[name]) return;
    ctx.save();
    if (T.x || T.y) ctx.translate(num(T.x, 0), num(T.y, 0));
    if (T.r || T.sx !== undefined || T.sy !== undefined) {
      const o = spec.chains[name].spine[0];
      ctx.translate(o[0], o[1]);
      if (T.r) ctx.rotate(T.r);
      if (T.sx !== undefined || T.sy !== undefined) ctx.scale(T.sx === undefined ? 1 : T.sx, T.sy === undefined ? 1 : T.sy);
      ctx.translate(-o[0], -o[1]);
    }
    const ga = ctx.globalAlpha;
    if (T.a !== undefined) ctx.globalAlpha = ga * cA(T.a);
    chainOf(spec, name, st.v).draw(ctx, bends, st.q);
    if (st.flash > 0.02) {
      ctx.globalAlpha = ctx.globalAlpha * cA(st.flash);
      chainOf(spec, name, 'w').draw(ctx, bends, st.q);
    }
    ctx.globalAlpha = ga;
    if (T.kids) T.kids(ctx);
    ctx.restore();
  }
  // where the tip of a chain part ends up for a set of bends (the same accumulation ART.tk.chain.draw does), and the total turn there
  function chainTip(spec, name, bends) {
    const c = chainOf(spec, name, ''), d = spec.chains[name], end = d.spine[d.spine.length - 1];
    let M = tk.mat.I(), ang = 0;
    for (let j = 0; j < c.segs.length; j++) {
      const b = bends && bends[j] ? bends[j] : 0;
      if (b) M = tk.mat.mul(M, tk.mat.local(c.segs[j].pivot[0], c.segs[j].pivot[1], 0, 0, b, 1, 1));
      ang += b;
    }
    const p = tk.mat.pt(M, end[0], end[1]);
    return { x: p[0], y: p[1], r: ang };
  }
  // the polite sparkle of the Gloss (live): a small white four-point star that breathes, gone once the creature is won over
  function polite(c, st, x, y, r) {
    if (st.won) return;
    const k = 0.55 + 0.45 * sin(st.t * 2.6 + hv(st.spec.id, 'tw') * 6) * st.m;
    tk.sparkle(c, x, y, r * (0.8 + 0.2 * k), { color: '#ffffff', alpha: 0.9 * k, glow: 0.35 });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // the shared pose state (the Echowake timings, unchanged)
  // ---------------------------------------------------------------------------------------------------------------
  // attack: 0..0.3 anticipation (wind rises, swing dips to -0.5), 0.3..0.5 strike (swing reaches 1 at p = 0.5), then recovery
  // hurt: recoil spike then settle;  block: guard rises fast and holds;  buff: a pulse;  die: 0..1 win-over;  telegraph: wind-up ramps to 1 and holds
  function poseState(pose, t, pt) {
    const m = tk.motion();
    const P = { pose, t, pt, m, p: 0, wind: 0, strike: 0, swing: 0, hit: 0, hurt: 0, flash: 0, guard: 0, buff: 0, buffP: 0, die: 0, tele: 0, shake: 0 };
    if (pose === 'attack') {
      const p = clamp(pt / 0.42, 0, 1);
      P.p = p;
      P.wind = p < 0.3 ? ease.outQuad(p / 0.3) : 1 - sm((p - 0.3) / 0.12);
      P.strike = p < 0.3 ? 0 : p < 0.5 ? ease.inCubic((p - 0.3) / 0.2) : 1 - ease.outCubic((p - 0.5) / 0.5);
      P.swing = p < 0.3 ? -0.5 * ease.outQuad(p / 0.3) : p < 0.5 ? lerp(-0.5, 1, ease.inCubic((p - 0.3) / 0.2)) : lerp(1, 0, ease.outCubic((p - 0.5) / 0.5));
      P.hit = p > 0.46 && p < 0.7 ? 1 - (p - 0.46) / 0.24 : 0;
    } else if (pose === 'hurt') {
      const p = clamp(pt / 0.26, 0, 1);
      P.p = p;
      P.hurt = p < 0.22 ? ease.outQuad(p / 0.22) : 1 - ease.inOutQuad((p - 0.22) / 0.78);
      P.flash = Math.pow(1 - p, 1.6) * 0.85;
    } else if (pose === 'block') {
      P.p = clamp(pt / 0.3, 0, 1);
      P.guard = sm(pt / 0.11);
    } else if (pose === 'buff') {
      const p = clamp(pt / 0.4, 0, 1);
      P.p = p; P.buffP = p; P.buff = sin(PI * p);
    } else if (pose === 'die') {
      P.p = clamp(pt / 0.7, 0, 1); P.die = P.p;
    } else if (pose === 'telegraph') {
      P.tele = sm(pt / 0.36);
      P.wind = P.tele;
      P.shake = P.tele * (0.6 + 0.4 * sin(t * 47));
    }
    return P;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // registration: the rig for every pose but die; the win-over for die
  // ---------------------------------------------------------------------------------------------------------------
  function makeState(spec, o) {
    o = o || {};
    const s = num(o.s, 1) > 0 ? num(o.s, 1) : 1, t = num(o.t, 0), pt = Math.max(0, num(o.pt, 0));
    const pose = POSES.indexOf(o.pose) >= 0 ? o.pose : 'idle';
    const E0 = poseState(pose, t, pt);
    const hp = o.hpPct === undefined ? 1 : clamp(num(o.hpPct, 1), 0, 1);
    return {
      spec, E: E0, s, q: qOf(s), t, pt, pose, hp, phase: clamp(num(o.phase, 0) | 0, 0, 9), glow: num(o.glow, 0),
      flash: E0.flash, m: E0.m, wound: sm((0.5 - hp) / 0.5), v: '', won: false,
    };
  }
  // the default win-over (HV_ENEMIES 6.4 on the foe kit): the polished creature fades out over its real-colour self while the Gloss flakes off as
  // sparkles, one happy hop with the real colours and the lopsided smile, the pop into confetti that breaks the grid, and a little sparkle of real
  // colour left on the floor. The body is the creature's own rig in its idle pose.
  function winOverDefault(ctx, spec, st) {
    const p = st.E.die, B = spec.dieBox || [-spec.bounds.w / 2, -spec.bounds.h, spec.bounds.w / 2, 0];
    const base = Object.assign({}, st, { E: poseState('idle', st.t, 0), flash: 0, v: '', won: false });
    const real = Object.assign({}, base, { v: 'r', won: true });
    foe.winOver(ctx, null, p, {
      act: 3, box: B, seed: Math.floor(hv(spec.id, 'wo') * 997), hop: spec.hop || 18, confetti: 'broken',
      draw: (g) => spec.rig(g, real),
      gloss: (g, S, k) => { g.globalAlpha = g.globalAlpha * cA(k); spec.rig(g, base); },
    });
    floorSparkle(ctx, spec, p);
  }
  // the small sparkle of real colour a won-over creature leaves on the mirror floor
  function floorSparkle(ctx, spec, p) {
    if (p < 0.62) return;
    const q = (p - 0.62) / 0.38, a = sin(PI * Math.min(1, q * 1.3));
    if (a < 0.03) return;
    const x = (hv(spec.id, 'fs') - 0.5) * spec.bounds.w * 0.3, col = REAL[Math.floor(hv(spec.id, 'fc') * REAL.length) % REAL.length];
    tk.sparkle(ctx, x, -5, 4 + 5 * a, { color: col, alpha: a, glow: 0.6 });
    tk.sparkle(ctx, x + 10, -12, 2 + 2.5 * a, { color: REAL[1], alpha: a * 0.8, glow: 0.3 });
  }
  function register(spec) {
    ART.enemy.register(spec.id, {
      bounds: spec.bounds,
      draw(ctx, o) {
        const st = makeState(spec, o);
        if (st.E.die >= 1) return;
        ctx.save();
        try {
          if (spec.k) ctx.scale(spec.k, spec.k);
          if (st.E.die > 0) (spec.winOver || winOverDefault)(ctx, spec, st);
          else spec.rig(ctx, st);
        } finally { ctx.restore(); }
      },
    });
  }
  function warm(id, s) {
    const spec = Object.prototype.hasOwnProperty.call(SPECS, id) ? SPECS[id] : null;
    if (!spec) return 0;
    const q = qOf(s);
    let n = 0;
    Object.keys(spec.parts).forEach((k) => { partSpr(spec, k, q, ''); n++; });
    Object.keys(spec.chains).forEach((k) => { n += chainOf(spec, k, '').warm(q); });
    return n;
  }

  // ===============================================================================================================
  // CREATURES (E3a)
  // ===============================================================================================================
  // a propeller seen nearly edge on, drawn live: a soft white blur disc, one blade line, a hub
  function rotor(c, x, y, r, spin, lc) {
    c.save();
    c.globalAlpha = c.globalAlpha * 0.4; c.fillStyle = '#ffffff';
    c.beginPath(); c.ellipse(x, y, r, r * 0.26, 0, 0, TAU); c.fill();
    c.globalAlpha = c.globalAlpha / 0.4 * 0.9;
    c.strokeStyle = lc; c.lineCap = 'round'; c.lineWidth = 2.2;
    const bx = cos(spin) * r, by = sin(spin) * r * 0.26;
    c.beginPath(); c.moveTo(x - bx, y - by); c.lineTo(x + bx, y + by); c.stroke();
    c.fillStyle = lc; c.beginPath(); c.arc(x, y, 2, 0, TAU); c.fill();
    c.restore();
  }
  // a wobbly ring of perfectly regular pitch (block shields, the siren's croon): a circle of radius r with n sine wobbles of amp px
  function pitchRing(c, x, y, rx, ry, amp, n, col, alpha, ph) {
    if (!(alpha > 0.02)) return;
    c.save(); c.globalAlpha = c.globalAlpha * cA(alpha); c.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      c.beginPath();
      for (let i = 0; i <= 64; i++) { const a = i / 64 * TAU, o = sin(a * n + (ph || 0)) * amp; const px = x + cos(a) * (rx + o), py = y + sin(a) * (ry + o); if (i) c.lineTo(px, py); else c.moveTo(px, py); }
      c.lineWidth = pass ? 2 : 4.4; c.strokeStyle = pass ? col : G.line; c.stroke();
    }
    c.restore();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // TUNER DRONE (storm_drone, normal, m). Echowake rig: STORM DRONE (keeps the hover bob, the rotors and the triple jab timing). A hovering
  // chrome disc whose face is a tuner: a needle that always swings to the exact centre, two little eyes either side of its pivot and the Gloss
  // smile under it, four little propellers, tuning pegs for ears, a tuning fork hanging under it and a mint status light on top. Its lightning
  // became perfectly regular pitch lines. Accent: the red needle.
  // ---------------------------------------------------------------------------------------------------------------
  const DRN = { cy: -100, R: 44, face: 30, pv: [0, -94] };
  define('storm_drone', {
    size: 'm',
    col: { face: G.porcelain, peg: G.lilac, pod: G.lilac, light: '#aef3df', fork: G.chromeL, tick: '#9ea2bb', tune: '#bdf5e4' },
    real: { face: '#fff4d8', peg: '#ffd84d', pod: '#ff8a5a', light: '#3fcf6a', fork: '#ffc94d', chromeReal: '#6fb8ff', tick: '#6b5a8a', tune: '#3fcf6a' },
    bounds: { w: 180, h: 168, head: { x: 0, y: -150 }, body: { x: 0, y: -100 }, feet: { x: 0, y: 0 } },
    dieBox: [-70, -160, 70, -30],
    sweep: [-40, -120],
    parts: {
      fork: {
        box: [-14, -64, 14, -24], pivot: [0, -58],
        draw(S) { S.blob([{ a: [0, -60], b: [0, -46], w: 7 }, { a: [-6, -46], b: [6, -46], w: 6 }, { a: [-6, -46], b: [-6, -30], w: 5 }, { a: [6, -46], b: [6, -30], w: 5 }], S.c.fork); },
      },
      armL: {
        box: [-80, -162, -20, -100], pivot: [-28, -122],
        draw(S) {
          S.limb([-26, -126], [-46, -144], 7, S.c.fork);
          S.limb([-36, -112], [-62, -116], 7, S.c.fork);
          S.ell(-46, -147, 10, 6.5, S.c.pod, { hi: true });
          S.ell(-64, -117, 9, 6, S.c.pod, { hi: true });
        },
      },
      armR: {
        box: [20, -162, 80, -100], pivot: [28, -122],
        draw(S) {
          S.limb([26, -126], [46, -144], 7, S.c.fork);
          S.limb([36, -112], [62, -116], 7, S.c.fork);
          S.ell(46, -147, 10, 6.5, S.c.pod, { hi: true });
          S.ell(64, -117, 9, 6, S.c.pod, { hi: true });
        },
      },
      light: {
        box: [-12, -162, 12, -138], pivot: [0, -142],
        draw(S) {
          S.cel(RR(-9, -146, 18, 6, 2), G.chromeL, { tension: 0 });
          S.cel(tk.arcPts(0, -146, 7.5, 8, PI, TAU, 9), S.c.light, { hi: true, tension: 0.4 });
        },
      },
      body: {
        box: [-64, -148, 64, -52], pivot: [0, -100],
        draw(S) {
          const cy = DRN.cy, R = DRN.R, pv = DRN.pv;
          // the tuning pegs (ears), then the chrome disc and the tuner face
          [-1, 1].forEach((sd) => { S.limb([sd * 40, cy], [sd * 52, cy], 6, S.c.fork); S.ell(sd * 57, cy, 4.5, 9, S.c.peg, { hi: true }); });
          S.chrome(E(0, cy, R, R, 26));
          S.cel(E(0, cy, DRN.face, DRN.face, 22), S.c.face, { shadow: RJ.shade(S.c.face, 0.06) });
          const g = S.g;
          g.save(); g.lineCap = 'round';
          // the in-tune zone, then the ticks of the scale
          g.strokeStyle = S.c.tune; g.lineWidth = 5; g.beginPath(); g.arc(pv[0], pv[1], 24, -PI / 2 - 0.2, -PI / 2 + 0.2); g.stroke();
          g.strokeStyle = S.c.tick; g.lineWidth = 1.6;
          for (let i = 0; i <= 8; i++) { const a = -PI * 0.86 + i * PI * 0.72 / 8, r0 = i === 4 ? 17 : 20; g.beginPath(); g.moveTo(pv[0] + cos(a) * r0, pv[1] + sin(a) * r0); g.lineTo(pv[0] + cos(a) * 26, pv[1] + sin(a) * 26); g.stroke(); }
          g.restore();
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, atk = E0.pose === 'attack';
      let jab = 0, jabN = -1;
      if (atk) { const q = clamp((E0.p - 0.08) / 0.84, 0, 0.999) * 3; jabN = Math.floor(q); jab = sin(PI * (q % 1)); }
      const hot = clamp(tele + buff + jab * 0.8, 0, 1);
      const shake = (tele * 1.4 + buff * 1.8) * sin(t * 61) * m;
      const bob = sin(t * 2.3) * 5 * m;
      const dx = -jab * 16 + hurt * 22 + tele * 6 + shake, dy = bob - hurt * 8 + guard * 5 - tele * 6;
      const rot = hurt * 0.3 - jab * 0.1 - tele * 0.12;
      const spin = t * (30 + 30 * hot) * m + 0.6;
      const lc = st.won ? REAL_LINE : G.line;
      // the soft hover glow under it
      tk.glow(ctx, dx * 0.4, -18, 36, st.won ? '#ffd84d' : G.mint, 0.3 + 0.1 * sin(t * 3));
      ctx.save();
      xform(ctx, 0, DRN.cy, dx, dy, rot, 1, 1);
      put(ctx, st, 'fork', { r: 0.08 * sin(t * 2.3 + 1) * m - 0.2 * hurt + 0.1 * jab });
      const fold = guard * 0.55;
      const pods = (sd) => (c) => { rotor(c, sd * 46, -155, 16, spin + (sd > 0 ? 1.3 : 0), lc); rotor(c, sd * 64, -124, 14, -spin * 1.1 + (sd > 0 ? 0.4 : 2), lc); };
      put(ctx, st, 'armL', { r: fold, kids: pods(-1) });
      put(ctx, st, 'armR', { r: -fold, kids: pods(1) });
      put(ctx, st, 'light', { sy: 1 + 0.06 * buff });
      tk.glow(ctx, 0, -150, 16 + 8 * hot, hot > 0.4 && !st.won ? G.accent : st.won ? '#3fcf6a' : '#8ff5d8', 0.55 + 0.25 * sin(t * 4));
      put(ctx, st, 'body', {
        kids(c) {
          const pv = DRN.pv;
          // the needle: dead centre with a tiny settling tremble; it swings off on a hit and spins when it retunes
          let na = 0.025 * sin(t * 9) * m;
          if (tele > 0) na += sin(t * 21) * 0.65 * tele;
          na += 0.95 * hurt - 0.35 * jab * (jabN === 1 ? -1 : 1);
          if (buff > 0) na += E0.buffP * TAU;
          if (st.won) na = 0.3;
          const tip = [pv[0] + sin(na) * 22, pv[1] - cos(na) * 22];
          c.save(); c.lineCap = 'round';
          c.strokeStyle = lc; c.lineWidth = 4.4; c.beginPath(); c.moveTo(pv[0], pv[1]); c.lineTo(tip[0], tip[1]); c.stroke();
          c.strokeStyle = st.won ? '#ff5a3d' : G.accent; c.lineWidth = 2.2; c.beginPath(); c.moveTo(pv[0], pv[1]); c.lineTo(tip[0], tip[1]); c.stroke();
          c.fillStyle = lc; c.beginPath(); c.arc(pv[0], pv[1], 3.4, 0, TAU); c.fill();
          c.restore();
          face(c, st, 0, -92, { kind: 'round', w: 10, gap: 30, my: 14, sw: 13, iris: ['#6d7196', '#b9bde0'], look: [-0.4 * tele - 0.5 * jab, 0] });
          crack(c, -16, -126, 34, 'drone', hurt * 1.4);
          polite(c, st, 26, -126, 5);
        },
      });
      // a perfectly regular pitch ring for a guard
      pitchRing(ctx, 0, DRN.cy, 70, 64, 3, 12, G.lilac, guard, t * 6);
      ctx.restore();
      // every jab beeps a regular pitch line at the heroes
      if (atk && jab > 0.25) {
        const y0 = DRN.cy + dy - 4, ty = [-118, -96, -110][jabN] || -110;
        pitchLine(ctx, -50 + dx, y0, -190, ty, 6, 3.5, G.mint, 2.4, jab);
        tk.glow(ctx, -190, ty, 26, '#ffffff', 0.5 * jab);
      }
      if (tele > 0.2) for (let i = 0; i < 2; i++) { const u = fr(t * 1.4 + i * 0.5); ctx.save(); ctx.globalAlpha = (1 - u) * tele * 0.8; ctx.strokeStyle = G.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(-46 + dx, DRN.cy + dy, 8 + 26 * u, PI * 0.7, PI * 1.3); ctx.stroke(); ctx.restore(); }
      if (buff > 0.03) pitchRing(ctx, dx, DRN.cy + dy, 50 + 70 * E0.buffP, 44 + 60 * E0.buffP, 2.5, 10, G.mint, buff, 0);
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // VIP BOUNCER (komainu_guardian, normal, l). Echowake rig: KOMAINU GUARDIAN (keeps the plinth, the braced stance and the pounce arc). A stocky
  // polished brass rope post come alive on a round podium: a big brass ball finial for a head in chrome sunglasses with an earpiece coil, the
  // Gloss smile, a plum rope looped round the post as its two arms with brass snap clips for hands. It folds its arms on the guard, leaps off
  // the podium on the pounce, and slides its shades down for the VIP Glare. Accent: the plum rope.
  // ---------------------------------------------------------------------------------------------------------------
  const BNC = { headY: -196, R: 46 };
  const ropeArm = (sd) => ({
    spine: [[sd * 30, -142], [sd * 50, -124], [sd * 56, -98], [sd * 52, -74]], cuts: [0.36, 0.7], reach: 40, overlap: 4,
    draw(S) {
      tk.ribbon(S.g, [[sd * 30, -142], [sd * 50, -124], [sd * 56, -98], [sd * 52, -76]], S.c.rope, { wMax: 13, w0: 13, w1: 12, profile: () => 1, cap: 'round', shadow: RJ.shade(S.c.rope, 0.12), shadowW: 0.4, gloss: true, glossColor: RJ.tint(S.c.rope, 0.45), glossAlpha: 0.7, strands: 0, line: S.L, lineColor: S.lc, light: RJ.lightAngle(),
        decor(g) { for (let i = 0; i < 6; i++) { const p = along([[sd * 30, -142], [sd * 50, -124], [sd * 56, -98], [sd * 52, -76]], 0.08 + i * 0.16); RJ.ink(g, [[p.x - 4, p.y - 3], [p.x + 4, p.y + 3]], { w: 1.2, color: RJ.shade(S.c.rope, 0.22), taper: 0.2, wobble: 0 }); } } });
      // the brass snap clip at the end (its hand) and the hook at the shoulder
      S.cel(RR(sd * 52 - 7, -78, 14, 12, 4), S.c.brass, { hi: true });
      S.cel([[sd * 52 - 5, -66], [sd * 52 + 5, -66], [sd * 52 + 6, -56, 1], [sd * 52, -50], [sd * 52 - 6, -56, 1]], S.c.brass, { hi: true, tension: 0.3 });
      S.ell(sd * 30, -142, 7, 7, S.c.brass, { hi: true });
    },
  });
  define('komainu_guardian', {
    size: 'l',
    col: { brass: '#f1dda4', post: '#efd896', podium: G.lilac, podiumTop: '#f1ebff', rope: '#a23d8c', shades: '#4a4f6e', coil: G.lilac },
    real: { brass: '#ffc94d', post: '#ffb83d', podium: '#8b4dff', podiumTop: '#b48cff', rope: '#e8335a', shades: '#2b2645', coil: '#3fcf6a' },
    bounds: { w: 220, h: 250, head: { x: 0, y: -236 }, body: { x: 0, y: -120 }, feet: { x: 0, y: 0 } },
    dieBox: [-80, -250, 80, -20],
    sweep: [-52, -170],
    parts: {
      podium: {
        box: [-96, -38, 96, 4], pivot: [0, -10],
        draw(S) {
          const side = [[-92, -22, 1]].concat(tk.arcPts(0, -8, 92, 9, PI, 0, 14).map((p) => [p[0], p[1]]).reverse()).concat([[92, -22, 1]]);
          S.chrome(side.map((p) => [p[0], p[1] + (p[1] > -10 ? 0 : 0)]), { horizon: 0.5, streak: false });
          S.cel(E(0, -22, 92, 13, 30), S.c.podiumTop, { shadow: RJ.shade(S.c.podiumTop, 0.08), hi: '#ffffff' });
          S.cel(E(0, -24, 60, 7, 24), S.c.podium, { shadow: false, line: S.L * 0.6 });
        },
      },
      post: {
        box: [-40, -160, 40, -22], pivot: [0, -30],
        draw(S) {
          S.cel(E(0, -32, 36, 9, 20), S.c.brass, { hi: true });
          S.cel(sym([[0, -150], [-24, -148], [-26, -130], [-28, -60], [-34, -40], [-34, -34], [0, -32]]), S.c.post, { hi: '#fff6d8', hiW: 3,
            decor(g) { g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(-16, -146, 6, 108); } });
          [[-56, 31], [-130, 27]].forEach((b) => S.cel(RR(-b[1], b[0] - 6, b[1] * 2, 11, 5), S.c.brass, { hi: true }));
          S.cel(E(0, -150, 24, 6, 16), S.c.brass, { hi: true });
        },
      },
      head: {
        box: [-60, -250, 62, -142], pivot: [0, -150],
        draw(S) {
          const cy = BNC.headY, R = BNC.R;
          S.cel(RR(-14, -158, 28, 14, 5), S.c.brass, { hi: true });
          S.cel(E(0, cy, R, R * 0.96, 28), S.c.brass, { hi: '#fff8e0', hiW: 3.4 });
          // the earpiece: a little lilac bud at the side of the ball and its curly coil running down to the collar
          S.ell(R - 3, cy + 8, 6, 7, S.c.coil, { hi: true });
          const coil = [];
          for (let i = 0; i <= 24; i++) { const u = i / 24; coil.push([R - 2 + sin(u * TAU * 4) * 4, cy + 14 + u * 36]); }
          S.line(coil, { w: 1.8, color: S.lc, taper: 0 });
          RJ.ink(S.g, coil, { w: 0.9, color: S.c.coil, taper: 0, wobble: 0 });
          S.cel(E(0, cy - R + 6, 8, 5, 12), S.c.brass, { hi: true });
        },
      },
      shades: {
        box: [-48, -222, 48, -186], pivot: [0, -204],
        draw(S) {
          const y = -205;
          S.cel([[-44, y - 8], [-6, y - 8], [-4, y - 4], [4, y - 4], [6, y - 8], [44, y - 8], [42, y + 2], [30, y + 12], [12, y + 12], [4, y + 2], [-4, y + 2], [-12, y + 12], [-30, y + 12], [-42, y + 2]], S.c.shades, { shadow: false, tension: 0.25,
            decor(g) {
              const gr = g.createLinearGradient(-44, y - 8, 44, y + 12);
              gr.addColorStop(0, S.real ? '#3b2a6a' : '#7d7fae'); gr.addColorStop(0.5, S.real ? '#2b2645' : '#c9c3ea'); gr.addColorStop(1, S.real ? '#3b2a6a' : '#8f8bbd');
              g.fillStyle = gr; g.fillRect(-46, y - 10, 92, 24);
              g.fillStyle = 'rgba(255,255,255,0.7)';
              [-34, 16].forEach((x) => { g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x + 6, y - 7); g.lineTo(x + 14, y + 10); g.lineTo(x + 8, y + 10); g.closePath(); g.fill(); });
            } });
        },
      },
    },
    chains: { armL: ropeArm(-1), armR: ropeArm(1) },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, atk = E0.pose === 'attack';
      const p = atk ? E0.p : 0;
      const leap = atk ? sm((p - 0.27) / 0.16) * (1 - sm((p - 0.6) / 0.32)) : 0;
      const crouch = 14 * tele + (atk ? 22 * Math.max(0, -E0.swing) : 0) + 6 * guard;
      const br = sin(TAU * t / 3.2) * m;
      const dx = -leap * 92 + hurt * 15 + E0.shake * 1.4 + (buff > 0 ? 3 * sin(t * 30) * buff : 0);
      const dy = crouch - leap * 44 + 0.6 * br;
      const rot = -0.06 * tele - leap * 0.12 + 0.08 * hurt;
      put(ctx, st, 'podium', {});
      if (leap > 0.2) { ctx.save(); ctx.globalAlpha = leap; tk.sparkle(ctx, -60, -20, 6, { color: '#ffffff' }); tk.sparkle(ctx, 54, -26, 4, { color: '#ffffff' }); ctx.restore(); }
      ctx.save();
      xform(ctx, 0, -30, dx, dy, rot, 1 + crouch * 0.003, 1 - crouch * 0.006);
      put(ctx, st, 'post', { sy: 1 + 0.01 * br });
      // the rope arms: hanging and swaying, folded across the post on the guard, flung back on the leap, pulled in on the glare
      const fold = guard, sw = 0.05 * sin(t * 1.9) * m, back = 0.45 * tele + 0.5 * leap;
      const arm = (sd) => [sd * fold * 0.55 - sd * back * 0.6 - sd * 0.12 * buff + sw, sd * fold * 1.25 - sd * back * 0.3 + sd * 0.12 * hurt, sd * fold * 0.9 + 0.06 * sin(t * 1.9 - 0.8 + sd) * m];
      const nod = (buff > 0 ? 0.12 * sin(t * 22) * buff : 0) + 0.05 * hurt - 0.06 * tele;
      ctx.save(); xform(ctx, 0, -150, 0, -2 * br, nod, 1, 1);
      put(ctx, st, 'head', {
        kids(c) {
          // the eyes behind the shades: only seen when the shades slide down for the glare, or once it is won over
          const slide = st.won ? -22 : 15 * buff + 4 * hurt;
          if (slide > 3 || st.won) face(c, st, 0, -206, { kind: buff > 0.3 ? 'glare' : 'round', w: 14, gap: 36, noMouth: true, iris: ['#6d7196', '#b9bde0'] });
          put(c, st, 'shades', { y: slide, r: 0.12 * hurt });
          face(c, st, 0, -176, { kind: 'lens', w: 1, noEyes: true, sw: 22, my: 0, open: 0 });
          crack(c, -26, -230, 38, 'bouncer', hurt * 1.4);
          if (tele > 0.3 && !st.won) tk.sparkle(c, 30, -212, 6 * tele, { color: '#ffffff', glow: 0.6 });
          polite(c, st, 24, -228, 6);
        },
      });
      ctx.restore();
      putChain(ctx, st, 'armL', arm(-1));
      putChain(ctx, st, 'armR', arm(1));
      ctx.restore();
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // CLAPPERBOARD KNIGHT (redaction_knight, normal, m). Echowake rig: REDACTION KNIGHT (keeps the knight body and the cleave swings; the black bars
  // became clapperboard stripes, the face bar a snapping clapper visor). A chibi knight in pastel chrome: a round helmet whose visor is a striped
  // clapper stick that snaps shut over the eyes on every take, a little slate board under the face window with the Gloss smile chalked on it,
  // striped pauldrons, a clapper-stick blade and a lilac megaphone for a shield. Accent: the red recording light on the helmet.
  // ---------------------------------------------------------------------------------------------------------------
  const KNT = { slate: '#43475f', chalk: '#f4f1fb' };
  // the black and white diagonal clapper stripes over a box (call inside a clip)
  function clapStripes(g, x, y, w, h, dark, light) {
    g.fillStyle = light; g.fillRect(x, y, w, h);
    g.fillStyle = dark;
    const st = Math.max(5, h * 1.1);
    for (let i = -2; i < w / st + 2; i++) { const x0 = x + i * st * 2; g.beginPath(); g.moveTo(x0, y + h); g.lineTo(x0 + st, y + h); g.lineTo(x0 + st + h * 0.8, y); g.lineTo(x0 + h * 0.8, y); g.closePath(); g.fill(); }
  }
  define('redaction_knight', {
    size: 'm',
    col: { plate: G.chromeL, boot: G.lilac, belt: G.lilac, megaphone: G.lilac, bell: '#f4efff', dark: '#4f5470', light: '#fbfaff', face: G.porcelain, plume: G.blush },
    real: { plate: '#9fd8ff', boot: '#8b4dff', belt: '#ff8a1f', megaphone: '#ff7eb6', bell: '#ffd84d', dark: '#22264a', light: '#fff8ec', face: '#ffe1c8', plume: '#ff5a8a' },
    bounds: { w: 190, h: 196, head: { x: 0, y: -180 }, body: { x: 0, y: -96 }, feet: { x: 0, y: 0 } },
    dieBox: [-70, -196, 70, 0],
    sweep: [-30, -140],
    parts: {
      legL: { box: [-34, -60, 4, 2], pivot: [-14, -54], draw(S) { S.limb([-14, -56], [-15, -18], 18, S.c.plate); S.cel(RR(-32, -18, 30, 17, 7), S.c.boot, { hi: true }); } },
      legR: { box: [-4, -60, 34, 2], pivot: [14, -54], draw(S) { S.limb([14, -56], [15, -18], 18, S.c.plate); S.cel(RR(2, -18, 30, 17, 7), S.c.boot, { hi: true }); } },
      torso: {
        box: [-42, -120, 42, -44], pivot: [0, -56],
        draw(S) {
          S.chrome(sym([[0, -116], [-30, -114], [-36, -100], [-30, -64], [-24, -50], [0, -48]]), { horizon: 0.62 });
          S.cel(RR(-31, -100, 62, 14, 4), S.c.light, { shadow: false, decor(g) { clapStripes(g, -32, -100, 64, 14, S.c.dark, S.c.light); } });
          S.cel(RR(-28, -62, 56, 9, 4), S.c.belt, { hi: true });
          S.ell(0, -57.5, 6, 6, S.c.plate, { hi: true });
        },
      },
      paulL: { box: [-52, -124, -16, -92], pivot: [-28, -108], draw(S) { S.cel(E(-32, -108, 17, 13, 18), S.c.light, { decor(g) { clapStripes(g, -50, -122, 36, 14, S.c.dark, S.c.light); } }); } },
      paulR: { box: [16, -124, 52, -92], pivot: [28, -108], draw(S) { S.cel(E(32, -108, 17, 13, 18), S.c.light, { decor(g) { clapStripes(g, 14, -122, 36, 14, S.c.dark, S.c.light); } }); } },
      armF: {
        box: [-12, -118, 52, -66], pivot: [30, -104],
        draw(S) { S.limb([30, -104], [24, -80], 15, S.c.plate); S.blob([{ e: [22, -76, 9, 8] }], S.c.boot); },
      },
      blade: {
        box: [-12, -116, 12, 16], pivot: [0, 0],
        draw(S) {
          S.cel(RR(-4, -2, 8, 16, 3), S.c.boot, { hi: true });
          S.cel(RR(-12, -6, 24, 7, 3), S.c.plate, { hi: true });
          S.cel([[-8, -6, 1], [8, -6, 1], [9, -100, 1], [0, -112, 1], [-9, -100, 1]], S.c.light, { shadow: false, tension: 0,
            decor(g) { g.save(); g.translate(0, -60); g.rotate(-PI / 2); clapStripes(g, -56, -10, 112, 20, S.c.dark, S.c.light); g.restore(); } });
        },
      },
      armN: {
        box: [-60, -118, -14, -66], pivot: [-30, -104],
        draw(S) { S.limb([-30, -104], [-38, -82], 15, S.c.plate); S.blob([{ e: [-40, -78, 9, 8] }], S.c.boot); },
      },
      megaphone: {
        box: [-44, -34, 30, 34], pivot: [0, 0],
        draw(S) {
          S.cel([[22, -8], [22, 8], [-26, 26], [-30, 0], [-26, -26]], S.c.megaphone, { hi: true, tension: 0.2 });
          S.cel(E(-28, 0, 9, 27, 20), S.c.bell, { shadow: RJ.shade(S.c.bell, 0.1) });
          S.cel(E(-29, 0, 4, 16, 14), RJ.shade(S.c.bell, 0.2), { shadow: false, line: S.L * 0.6 });
          S.cel(RR(18, -9, 10, 18, 3), S.c.plate, { hi: true });
        },
      },
      head: {
        box: [-46, -190, 46, -102], pivot: [0, -112],
        draw(S) {
          S.chrome(E(0, -144, 38, 36, 24), { horizon: 0.7 });
          S.cel(RR(-25, -160, 50, 30, 13), S.c.face, { shadow: RJ.shade(S.c.face, 0.05) });
          S.cel(RR(-22, -128, 44, 18, 5), S.c.dark, { shadow: false,
            decor(g) { g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-22, -119); g.lineTo(22, -119); g.moveTo(0, -128); g.lineTo(0, -119); g.stroke(); } });
          S.cel(E(0, -181, 6, 8, 12), S.c.plume, { hi: true });
          S.ell(26, -170, 4, 4, S.real ? '#ff5a3d' : G.accent, { shadow: false, line: S.L * 0.6 });
        },
      },
      clapper: {
        box: [-34, -176, 34, -158], pivot: [-29, -166],
        draw(S) {
          S.cel(RR(-31, -172, 62, 11, 3), S.c.light, { shadow: false, decor(g) { clapStripes(g, -32, -172, 64, 11, S.c.dark, S.c.light); } });
          S.ell(-29, -166, 3.5, 3.5, S.c.plate, { shadow: false, line: S.L * 0.6 });
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, atk = E0.pose === 'attack', p = atk ? E0.p : 0;
      const br = sin(TAU * t / 2.6) * m;
      const strike = atk ? E0.strike : 0;
      const dx = -strike * 24 + hurt * 16 + E0.shake * 1.2 + 3 * tele;
      const rot = 0.06 * tele - 0.08 * strike + 0.12 * hurt;
      // the blade arm: raise on the wind-up, chop on the strike (the Echowake cleave timing)
      let A = 0.04 * br, W = 0.25;
      if (atk) {
        if (p < 0.3) { const k = sm(p / 0.3); A = -1.8 * k; W = lerp(0.25, -0.9, k); } else if (p < 0.5) { const k = ease.inCubic((p - 0.3) / 0.2); A = lerp(-1.8, 0.5, k); W = lerp(-0.9, -2.0, k); } else { const k = sm((p - 0.5) / 0.5); A = lerp(0.5, 0.04, k); W = lerp(-2.0, 0.25, k); }
      } else if (E0.pose === 'telegraph') { A = -1.8 * tele + 0.03 * E0.shake; W = lerp(0.25, -0.9, tele); } else if (E0.pose === 'block') { A = -0.4 * guard; W = lerp(0.25, -0.6, guard); } else if (E0.pose === 'hurt') { A = -0.3 * hurt; W = 0.25 + 0.4 * hurt; } else if (E0.pose === 'buff') { A = -1.2 * buff; W = 0.25 - 0.8 * buff; }
      // the clapper visor: half open at rest, wide open on the wind-up, SNAP shut on the strike, open on a hit
      let vis = -0.32 + 0.04 * sin(t * 1.3) * m;
      if (atk) vis = p < 0.3 ? lerp(-0.32, -1.1, sm(p / 0.3)) : p < 0.42 ? lerp(-1.1, 0.02, ease.inCubic((p - 0.3) / 0.12)) : lerp(0.02, -0.32, sm((p - 0.62) / 0.38));
      else if (tele > 0) vis = lerp(-0.32, -1.1, tele);
      else if (guard > 0) vis = lerp(-0.32, 0.02, guard);
      else if (buff > 0) vis = -0.32 - 0.9 * buff;
      vis += -0.5 * hurt;
      if (st.won) vis = -1.3;
      ctx.save();
      xform(ctx, 0, -56, dx, 2 * tele, rot, 1, 1);
      put(ctx, st, 'legL', { r: 0.04 * br * 0 - 0.06 * tele + 0.08 * strike });
      put(ctx, st, 'legR', { r: 0.06 * tele - 0.04 * strike });
      put(ctx, st, 'armF', { r: A, kids(c) { put(c, st, 'blade', { x: 22, y: -76, r: W }); } });
      put(ctx, st, 'torso', { sy: 1 + 0.012 * br });
      put(ctx, st, 'paulR', { r: 0.05 * br });
      put(ctx, st, 'head', {
        r: 0.02 * br - 0.04 * strike + 0.12 * hurt - 0.03 * tele, y: -1.5 * br,
        kids(c) {
          face(c, st, 0, -146, { kind: 'round', w: 12, gap: 24, noMouth: true, iris: ['#6d7196', '#b9bde0'], look: [-0.5 * tele, 0] });
          // the Gloss smile chalked on the slate board
          if (st.won) face(c, st, 0, -146, { kind: 'round', w: 12, gap: 24, my: 26, sw: 16, noEyes: true });
          else if (hurt > 0.45) foe.mouth(c, 0, -122, 12, 'O', { ink: KNT.chalk });
          else foe.glossSmile(c, 0, -121, 16, { color: KNT.chalk });
          put(c, st, 'clapper', { r: vis });
          if (atk && p > 0.38 && p < 0.55) { const u = (p - 0.38) / 0.17; c.save(); c.globalAlpha = c.globalAlpha * (1 - u); tk.sparkle(c, 30, -166, 6 + 10 * u, { color: '#ffffff', glow: 0.6 }); c.restore(); }
          crack(c, 18, -176, 30, 'knight', hurt * 1.4);
          polite(c, st, -22, -168, 5);
        },
      });
      put(ctx, st, 'paulL', { r: -0.05 * br });
      // the megaphone shield: held out at the side, brought up in front on a guard
      put(ctx, st, 'armN', { r: 0.05 * br - 0.5 * guard + 0.15 * hurt, kids(c) { put(c, st, 'megaphone', { x: -46 - 4 * guard, y: -80 - 22 * guard, r: -0.1 - 0.4 * guard + 0.05 * br, sx: 0.8 + 0.2 * guard + 0.08 * buff, sy: 0.8 + 0.2 * guard + 0.08 * buff }); } });
      ctx.restore();
      if (atk && p > 0.42 && p < 0.72) {
        const u = sm((p - 0.42) / 0.12) * (1 - sm((p - 0.62) / 0.1));
        ctx.save(); ctx.globalAlpha = u * 0.85; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 10; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(10 + dx, -100, 96, -2.1, -3.6, true); ctx.stroke();
        ctx.strokeStyle = G.lilac; ctx.lineWidth = 4; ctx.stroke(); ctx.restore();
      }
      if (buff > 0.05) for (let i = 0; i < 3; i++) { const u = fr(E0.buffP + i / 3); ctx.save(); ctx.globalAlpha = (1 - u) * buff; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(-70 + dx, -100, 10 + 40 * u, PI * 0.75, PI * 1.25); ctx.stroke(); ctx.restore(); }
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // CHROME SIREN (void_scribe, normal, m). Echowake rig: VOID SCRIBE (keeps the float and the robe hem). A floating chrome singer in a long lilac
  // gown whose hem ends in a flat, perfectly regular soundwave, a perfectly smooth face with serene closed eyes, a sleek mint-chrome bob, both
  // hands holding a mirror-ball mic to its lips and a halo of little tuning sliders that it keeps perfectly level. It croons in flat, evenly
  // spaced rings. Accent: the one pink slider knob in the middle.
  // ---------------------------------------------------------------------------------------------------------------
  const SRN = { hy: -152, halo: 46, sl: [-2.62, -2.09, -1.57, -1.05, -0.52] };
  define('void_scribe', {
    size: 'm',
    col: { gown: G.lilac, bodice: G.mint, skin: G.porcelain, hair: '#d6f5ec', glove: G.opal, track: '#8f93ad', ball: G.opal },
    real: { gown: '#8b4dff', bodice: '#3fcf6a', skin: '#ffd8bd', hair: '#2f8f6a', glove: '#ffe8d8', track: '#5a3f8a', ball: '#ffd84d' },
    bounds: { w: 170, h: 204, head: { x: 0, y: -194 }, body: { x: 0, y: -100 }, feet: { x: 0, y: 0 } },
    dieBox: [-64, -204, 64, -20],
    sweep: [-36, -130],
    hop: 14,
    parts: {
      halo: {
        box: [-58, -210, 58, -150], pivot: [0, SRN.hy],
        draw(S) {
          SRN.sl.forEach((a) => {
            const x0 = cos(a) * (SRN.halo - 8), y0 = SRN.hy + sin(a) * (SRN.halo - 8), x1 = cos(a) * (SRN.halo + 8), y1 = SRN.hy + sin(a) * (SRN.halo + 8);
            S.limb([x0, y0], [x1, y1], 5, S.c.track, { L: S.L * 0.7 });
          });
        },
      },
      head: {
        box: [-40, -194, 40, -116], pivot: [0, -124],
        draw(S) {
          const y = SRN.hy;
          S.cel(sym([[0, y - 32], [-24, y - 28], [-34, y - 10], [-34, y + 14], [-28, y + 22], [-18, y + 16], [-20, y - 4], [-10, y - 14], [0, y - 15]]), S.c.hair, { hi: '#ffffff', hiW: 2.6 });
          S.cel(E(0, y + 2, 21, 23, 22), S.c.skin, { shadow: RJ.shade(S.c.skin, 0.05) });
          S.cel(sym([[0, y - 30], [-22, y - 26], [-27, y - 12], [-14, y - 18], [-4, y - 12], [0, y - 14]]), S.c.hair, { hi: '#ffffff', hiW: 2.2 });
          S.line([[0, y - 30], [0, y - 15]], { w: 1.2, alpha: 0.5 });
        },
      },
      arms: {
        box: [-40, -126, 40, -88], pivot: [0, -106],
        draw(S) {
          [-1, 1].forEach((sd) => { S.limb([sd * 21, -106], [sd * 30, -96], 10, S.c.skin); S.limb([sd * 30, -96], [sd * 10, -114], 9, S.c.skin); S.blob([{ e: [sd * 8, -116, 7, 6.5] }], S.c.glove); });
        },
      },
      mic: {
        box: [-12, -140, 12, -96], pivot: [0, -112],
        draw(S) {
          S.cel(RR(-3.5, -118, 7, 20, 3), G.chromeL, { hi: true });
          S.cel(E(0, -124, 8.5, 8.5, 18), S.c.ball, { decor(g) { g.strokeStyle = 'rgba(120,124,156,0.55)'; g.lineWidth = 0.8; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(-10, -124 + i * 3.4); g.lineTo(10, -124 + i * 3.4); g.stroke(); g.beginPath(); g.moveTo(i * 3.4, -134); g.lineTo(i * 3.4, -114); g.stroke(); } } });
        },
      },
    },
    chains: {
      gown: {
        spine: [[0, -118], [0, -86], [0, -56], [0, -26]], cuts: [0.42, 0.74], reach: 70, overlap: 4,
        draw(S) {
          const hem = [];
          for (let i = 0; i <= 14; i++) hem.push([-56 + i * 8, -28 + (i % 2 ? -4 : 0), 1]);
          const gown = [[-20, -116], [20, -116], [24, -96], [34, -64], [56, -28, 1]].concat(hem.slice().reverse().slice(1, -1)).concat([[-56, -28, 1], [-34, -64], [-24, -96]]);
          S.cel(gown, S.c.gown, { hi: true, hiW: 3, tension: 0.4,
            decor(g) {
              g.strokeStyle = tk.rgba(RJ.shade(S.c.gown, 0.12), 0.7); g.lineWidth = 1.4;
              [-26, -10, 10, 26].forEach((x) => { g.beginPath(); g.moveTo(x * 0.4, -96); g.lineTo(x * 1.25, -34); g.stroke(); });
            } });
          S.cel(sym([[0, -118], [-20, -117], [-24, -98], [-16, -90], [0, -88]]), S.c.bodice, { hi: '#ffffff', tension: 0.3 });
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, atk = E0.pose === 'attack';
      const fl = sin(t * 1.8) * 6 * m;
      const lean = atk ? -0.16 * E0.strike + 0.06 * E0.wind : 0;
      const dx = (atk ? -14 * E0.strike : 0) + hurt * 18 + E0.shake;
      const dy = fl - 6 * tele - 4 * buff + 4 * hurt;
      const rot = lean + 0.12 * hurt;
      tk.glow(ctx, 0, -10, 46, st.won ? '#ffd84d' : G.lilac, 0.35);
      ctx.save();
      xform(ctx, 0, -100, dx, dy, rot, 1 - 0.08 * guard, 1);
      const sway = 0.05 * sin(t * 1.6) * m;
      putChain(ctx, st, 'gown', [sway * 0.4 + 0.1 * hurt, -sway + 0.08 * E0.strike, -sway * 1.4 + 0.06 * sin(t * 2.3) * m]);
      // the halo of sliders: knobs perfectly level, all slammed up on the wind-up, a ripple on the croon, a jumble when hit
      put(ctx, st, 'halo', { r: 0.04 * hurt, kids(c) {
        SRN.sl.forEach((a, i) => {
          let u = 0.5 + 0.03 * sin(t * 1.2) * m;
          u += 0.45 * tele + 0.4 * buff;
          if (atk) u += 0.4 * sin(PI * clamp(E0.p * 2 - i * 0.15, 0, 1));
          u += (hv('srn', 'h' + i) - 0.5) * 1.4 * hurt;
          if (st.won) u = 0.2 + 0.15 * i;
          u = clamp(u, 0, 1);
          const r = SRN.halo - 8 + 16 * u, x = cos(a) * r, y = SRN.hy + sin(a) * r;
          c.save(); c.translate(x, y); c.rotate(a + PI / 2);
          c.fillStyle = i === 2 ? (st.won ? '#ff5a3d' : G.accent) : (st.won ? '#ffd84d' : G.opal); c.strokeStyle = st.won ? REAL_LINE : G.line; c.lineWidth = 1.6;
          c.beginPath(); c.rect(-5, -3, 10, 6); c.fill(); c.stroke();
          c.restore();
        });
      } });
      put(ctx, st, 'head', {
        r: 0.03 * sin(t * 1.1) * m - 0.08 * E0.strike + 0.1 * hurt, y: -tele * 2,
        kids(c) {
          face(c, st, 0, SRN.hy + 2, { kind: 'round', w: 11, gap: 22, open: st.won ? 1 : 0, my: 13, sw: 11, per: 99 });
          crack(c, 10, SRN.hy - 18, 30, 'siren', hurt * 1.4);
          polite(c, st, -16, SRN.hy - 16, 5);
        },
      });
      // both hands hold the mirror mic: lifted high on the wind-up, held out on the croon
      const lift = -8 * tele - 6 * (atk ? E0.wind : 0) - 6 * buff;
      put(ctx, st, 'arms', { y: lift * 0.5, sy: 1 + 0.04 * tele });
      put(ctx, st, 'mic', { y: lift, x: -4 * (atk ? E0.strike : 0), r: -0.25 * (atk ? E0.strike : 0) });
      tk.sparkle(ctx, -4, -127 + lift, 3 + 2 * sin(t * 3), { color: '#ffffff', alpha: 0.8, glow: 0.4 });
      pitchRing(ctx, 0, -100, 64, 92, 2.5, 14, G.mint, guard, t * 5);
      ctx.restore();
      // the croon: flat, evenly spaced rings rolling off the mic toward the heroes
      if (atk || tele > 0.2 || buff > 0.1) {
        const k = atk ? Math.max(E0.strike, E0.wind * 0.3) : Math.max(tele * 0.6, buff * 0.5);
        for (let i = 0; i < 4; i++) {
          const u = fr(t * 1.6 + i / 4), x = -12 + dx - 26 - u * 110, y = -130 + dy + lift;
          ctx.save(); ctx.globalAlpha = sin(PI * u) * k; ctx.lineCap = 'round';
          ctx.strokeStyle = G.line; ctx.lineWidth = 4.4; ctx.beginPath(); ctx.arc(x + 30, y, 30, PI * 0.82, PI * 1.18); ctx.stroke();
          ctx.strokeStyle = i % 2 ? G.mint : G.lilac; ctx.lineWidth = 2.2; ctx.stroke();
          ctx.restore();
        }
      }
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // SYNCHRO DANCER (blank_soldier, normal, m). Echowake rig: BLANK SOLDIER (keeps the in-step march, now a synchronised dance step on the shared
  // clock so every dancer on stage moves as one, and the rank spacing). A smooth porcelain mannequin dancer with ball joints, a glossy lilac bob,
  // a blush sequin leotard and jazz hands, the fixed Gloss smile. Accent: a tiny red heart sequin on the leotard.
  // ---------------------------------------------------------------------------------------------------------------
  const DNC = { hy: -176 };
  const dncLeg = (sd) => ({
    box: [sd < 0 ? -28 : -2, -110, sd < 0 ? 2 : 28, 2], pivot: [sd * 11, -104],
    draw(S) {
      S.limb([sd * 11, -104], [sd * 12, -58], 13, S.c.skin);
      S.limb([sd * 12, -58], [sd * 13, -16], 11, S.c.skin);
      S.ell(sd * 12, -58, 5, 5, S.c.joint, { line: S.L * 0.6 });
      S.cel(RR(sd * 13 - 10, -16, 20, 13, 6), S.c.shoe, { hi: true });
    },
  });
  const dncArm = (sd) => ({
    box: [sd < 0 ? -66 : 14, -180, sd < 0 ? -14 : 66, -118], pivot: [sd * 22, -140],
    draw(S) {
      S.limb([sd * 22, -140], [sd * 40, -126], 10, S.c.skin);
      S.limb([sd * 40, -126], [sd * 46, -152], 9, S.c.skin);
      S.ell(sd * 40, -126, 4.5, 4.5, S.c.joint, { line: S.L * 0.6 });
      RJ.hand(S.g, 'open', sd * 46, -154, -PI / 2 + sd * 0.25, { skin: S.c.skin, shade: RJ.shade(S.c.skin, 0.08), k: 1.05 });
    },
  });
  define('blank_soldier', {
    size: 'm',
    col: { skin: G.porcelain, joint: G.lilac, hair: '#d9c8ff', leo: G.blush, shoe: G.lilac },
    real: { skin: '#ffd2b4', joint: '#ff8a5a', hair: '#5a2f8a', leo: '#ff3f8e', shoe: '#ffd84d' },
    bounds: { w: 160, h: 212, head: { x: 0, y: -202 }, body: { x: 0, y: -110 }, feet: { x: 0, y: 0 } },
    dieBox: [-60, -212, 60, 0],
    sweep: [-30, -150],
    parts: {
      legL: dncLeg(-1), legR: dncLeg(1), armL: dncArm(-1), armR: dncArm(1),
      torso: {
        box: [-30, -152, 30, -96], pivot: [0, -104],
        draw(S) {
          const body = sym([[0, -148], [-20, -146], [-22, -132], [-17, -116], [-20, -104], [-8, -98], [0, -102]]);
          S.cel(body, S.c.leo, { hi: true, decor(g) { sequins(g, -24, -150, 48, 56, { d: 6, cols: [S.c.leo, RJ.tint(S.c.leo, 0.4), S.c.leo], seed: 5 }); } });
          S.cel(sym([[0, -149], [-12, -149], [-8, -142], [0, -140]]), S.c.skin, { shadow: false, line: S.L * 0.7 });
          const hx = 9, hy = -128;
          S.g.save(); S.g.fillStyle = S.real ? '#ff2a4a' : G.accent; S.g.beginPath(); S.g.moveTo(hx, hy + 3); S.g.bezierCurveTo(hx - 5, hy - 1, hx - 2, hy - 5, hx, hy - 2); S.g.bezierCurveTo(hx + 2, hy - 5, hx + 5, hy - 1, hx, hy + 3); S.g.fill(); S.g.restore();
        },
      },
      head: {
        box: [-38, -212, 38, -142], pivot: [0, -150],
        draw(S) {
          const y = DNC.hy;
          S.limb([0, -150], [0, -142], 9, S.c.skin);
          S.cel(sym([[0, y - 30], [-26, y - 26], [-34, y - 6], [-33, y + 18], [-24, y + 20], [-22, y + 2], [0, y - 4]]), S.c.hair, { hi: '#ffffff', hiW: 3 });
          S.cel(E(0, y + 4, 23, 24, 22), S.c.skin, { shadow: RJ.shade(S.c.skin, 0.05) });
          S.cel(sym([[0, y - 30], [-26, y - 26], [-30, y - 8], [-27, y - 6], [0, y - 8]]), S.c.hair, { hi: '#ffffff', hiW: 2.6, tension: 0.35 });
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, atk = E0.pose === 'attack', p = atk ? E0.p : 0;
      // the shared beat: every Synchro Dancer reads the same absolute clock, so a rank moves as one
      const beat = t * 1.6, ph = fr(beat), side = Math.floor(beat) % 2 ? 1 : -1, step = sin(PI * ph) * m;
      const bounce = -Math.abs(sin(PI * beat)) * 6 * m;
      const kick = atk ? sin(PI * clamp((p - 0.25) / 0.5, 0, 1)) : 0;
      const dx = -kick * 18 + hurt * 18 + E0.shake;
      const dy = bounce - 8 * tele + 2 * guard + 4 * hurt;
      const rot = 0.1 * kick + 0.12 * hurt;
      ctx.save();
      xform(ctx, 0, -104, dx, dy, rot, 1, 1);
      // the legs: step-touch on the beat, a high kick on the attack, together on the guard
      const lStep = (st2) => (atk || tele > 0 || guard > 0 || buff > 0 ? 0 : st2);
      put(ctx, st, 'legL', { r: lStep(side < 0 ? 0.28 * step : 0) + 1.2 * kick + 0.08 * guard - 0.06 * tele });
      put(ctx, st, 'legR', { r: lStep(side > 0 ? -0.28 * step : 0) - 0.12 * kick - 0.08 * guard + 0.06 * tele });
      // jazz hands: a shimmy at rest, up in a V on the wind-up, crossed on the guard, flung on the kick
      const shim = 0.08 * sin(t * 26) * m;
      const up = 0.5 * tele + 0.3 * buff;
      put(ctx, st, 'armR', { r: shim + up * 0.6 - 0.62 * guard - 0.3 * kick + 0.4 * hurt });
      put(ctx, st, 'torso', { sy: 1 + 0.02 * sin(PI * beat) * m });
      put(ctx, st, 'head', {
        r: 0.06 * sin(beat * PI) * m * 0.4 + 0.15 * hurt - 0.05 * kick, y: bounce * 0.2,
        kids(c) {
          face(c, st, 0, DNC.hy + 4, { kind: 'round', w: 12, gap: 20, my: 12, sw: 11, iris: ['#7d6fb0', '#c9b8ff'], look: [-0.3 * kick, 0] });
          crack(c, 8, DNC.hy - 20, 32, 'dancer', hurt * 1.4);
          polite(c, st, -18, DNC.hy - 18, 5);
        },
      });
      put(ctx, st, 'armL', { r: -shim - up * 0.6 + 0.62 * guard + 0.5 * kick - 0.2 * hurt });
      ctx.restore();
      if (buff > 0.05) foe.sparkles(ctx, 0, -120, [[-50, -40, 6, 0], [46, -60, 5, 0.3], [-30, 20, 4, 0.6]], 3, E0.buffP * 2);
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // STREAMER DRAGON (sky_serpent, normal, l). Echowake rig: SKY SERPENT (keeps the coil chain and the back-row strike). A long dragon of pastel
  // party streamers in a perfectly repeating mint, blush, lilac and lemon pattern, coiled on the stage and rising in an S; its head is a confetti
  // cannon with a big Gloss grin along the barrel, curly ribbon whiskers and a tiny party hat. Accent: the red ring round the muzzle.
  // ---------------------------------------------------------------------------------------------------------------
  const STR = { band: ['#d9fff4', '#ffe3f1', '#e6d9ff', '#fff3b8'], bandR: ['#3fcf6a', '#ff6fb5', '#8b4dff', '#ffd84d'] };
  // a streamer ribbon along a spine with perpendicular bands in the repeating pattern
  function streamer(S, spine, w, o) {
    o = o || {};
    const bands = S.real ? STR.bandR : STR.band;
    tk.ribbon(S.g, spine, bands[0], { wMax: w, w0: num(o.w0, w), w1: num(o.w1, w), profile: o.profile || (() => 1), cap: 'round', shadow: false, gloss: true, glossColor: '#ffffff', glossAlpha: 0.55, strands: 0, line: S.L, lineColor: S.lc, light: RJ.lightAngle(),
      decor(g) {
        const n = o.n || 12;
        for (let i = 0; i < n; i++) {
          const a = along(spine, i / n), b = along(spine, (i + 1) / n), col = bands[(i + (o.off || 0)) % bands.length];
          g.fillStyle = col;
          g.beginPath(); g.moveTo(a.x - a.ty * w, a.y + a.tx * w); g.lineTo(b.x - b.ty * w, b.y + b.tx * w); g.lineTo(b.x + b.ty * w, b.y - b.tx * w); g.lineTo(a.x + a.ty * w, a.y - a.tx * w); g.closePath(); g.fill();
          g.strokeStyle = 'rgba(90,95,122,0.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(a.x - a.ty * w, a.y + a.tx * w); g.lineTo(a.x + a.ty * w, a.y - a.tx * w); g.stroke();
        }
        g.fillStyle = 'rgba(160,150,200,0.22)';
        for (let i = 0; i < 24; i++) { const a = along(spine, i / 24); g.beginPath(); g.arc(a.x + a.ty * w * 0.3, a.y - a.tx * w * 0.3 + w * 0.25, w * 0.32, 0, TAU); g.fill(); }
      } });
  }
  const NECK = [[34, -54], [64, -100], [44, -150], [0, -186], [-34, -204]];
  define('sky_serpent', {
    size: 'l',
    col: { barrel: G.lemon, cap: G.lilac, hat: G.mint, pom: G.blush, whisker: G.blush, skin: '#fff6dc' },
    real: { barrel: '#ffd84d', cap: '#8b4dff', hat: '#3fcf6a', pom: '#ff6fb5', whisker: '#ff6fb5', skin: '#ffe9a8' },
    bounds: { w: 300, h: 276, head: { x: -66, y: -250 }, body: { x: 10, y: -90 }, feet: { x: 0, y: 0 }, right: 167 },
    dieBox: [-130, -268, 140, 0],
    sweep: [-40, -170],
    hop: 14,
    parts: {
      coilB: {
        box: [-92, -76, 128, -6], pivot: [20, -40],
        draw(S) { streamer(S, tk.arcPts(20, -40, 92, 24, PI * 1.02, PI * 1.98, 12), 22, { n: 10, off: 1 }); },
      },
      coilF: {
        box: [-96, -50, 136, 8], pivot: [20, -20],
        draw(S) { streamer(S, tk.arcPts(20, -26, 100, 22, PI * 0.06, PI * 0.94, 12).reverse(), 24, { n: 10, off: 2 }); },
      },
      head: {
        box: [-138, -270, 0, -180], pivot: [-34, -204],
        draw(S) {
          // curly ribbon whiskers, the barrel snout with its red ring, the round head, the little party hat
          [[-70, -206, -1], [-60, -204, 1]].forEach((w, i) => {
            const pts = [];
            for (let k = 0; k <= 16; k++) { const u = k / 16, a = u * TAU * 1.4; pts.push([w[0] - u * 18 + cos(a) * 5 * (1 - u * 0.4), w[1] + u * 22 + sin(a) * 5 * w[2]]); }
            S.line(pts, { w: 5, taper: 0.45 }); RJ.ink(S.g, pts, { w: 3, color: i ? S.c.hat : S.c.whisker, taper: 0.45, wobble: 0 });
          });
          S.cel(tk.xf(sym([[0, -258], [-22, -254], [-34, -236], [-34, -214], [-24, -198], [0, -194]]), { dx: -40 }), S.c.cap, { hi: true });
          S.cel([[-46, -238], [-104, -236], [-110, -232], [-112, -212], [-106, -206], [-46, -204]], S.c.barrel, { hi: '#ffffff', hiW: 3, tension: 0.15,
            decor(g) { g.fillStyle = S.real ? '#ff8a1f' : G.mint; [-62, -80].forEach((x) => g.fillRect(x, -240, 7, 40)); g.fillStyle = S.real ? '#ff2a4a' : G.accent; g.fillRect(-102, -240, 6, 40); } });
          S.cel(E(-113, -221, 6, 15, 16), S.c.cap, { shadow: false });
          S.cel(E(-114, -221, 3.4, 10, 12), '#5a5f7a', { shadow: false, line: false });
          S.cel([[-36, -252, 1], [-24, -282, 1], [-14, -250, 1]], S.c.hat, { hi: true, tension: 0, decor(g) { g.fillStyle = S.c.pom; g.fillRect(-40, -268, 30, 5); } });
          S.ell(-24, -283, 5, 5, S.c.pom, { hi: true });
        },
      },
    },
    chains: {
      neck: {
        spine: NECK, cuts: [0.3, 0.58, 0.82], reach: 60, overlap: 5,
        draw(S) { streamer(S, NECK, 28, { n: 9, w0: 30, w1: 22, profile: (u) => 1 - 0.25 * u }); },
      },
      tail: {
        spine: [[112, -24], [138, -40], [150, -64], [138, -86]], cuts: [0.5], reach: 40, overlap: 4,
        draw(S) { streamer(S, [[112, -24], [138, -40], [150, -64], [138, -86]], 14, { n: 5, w0: 16, w1: 6, profile: (u) => 1 - 0.6 * u, off: 3 }); },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, atk = E0.pose === 'attack';
      const sw = sin(t * 1.3) * m, sw2 = sin(t * 1.3 - 0.9) * m;
      const strike = atk ? E0.strike : 0, wind = atk ? E0.wind : tele;
      const bends = [
        0.04 * sw + 0.16 * wind - 0.32 * strike + 0.18 * hurt + 0.1 * guard,
        0.06 * sw2 + 0.12 * wind - 0.22 * strike + 0.1 * hurt + 0.25 * guard,
        0.06 * sw + 0.1 * wind - 0.2 * strike - 0.05 * hurt + 0.2 * guard,
        0.05 * sw2 - 0.1 * strike + 0.1 * buff * sin(t * 12),
      ];
      const twirl = buff > 0 ? sin(PI * E0.buffP) : 0;
      ctx.save();
      xform(ctx, 20, -20, hurt * 12 + E0.shake, 0, 0, 1 + 0.03 * twirl, 1 - 0.03 * twirl);
      put(ctx, st, 'coilB', { sy: 1 + 0.03 * sin(t * 2) * m });
      putChain(ctx, st, 'tail', [0.1 * sw2 + 0.2 * buff, 0.2 * sw + 0.3 * tele]);
      putChain(ctx, st, 'neck', bends);
      const tip = chainTip(st.spec, 'neck', bends);
      put(ctx, st, 'head', {
        x: tip.x - NECK[4][0], y: tip.y - NECK[4][1], r: tip.r * 0.6 - 0.1 * wind + 0.12 * strike + 0.2 * hurt,
        kids(c) {
          face(c, st, -42, -242, { kind: 'round', w: 16, gap: 22, noMouth: true, iris: ['#6d7196', '#b9bde0'], look: [-0.6, 0] });
          if (st.won) face(c, st, -76, -236, { noEyes: true, my: 24, sw: 22 });
          else if (hurt > 0.45) foe.mouth(c, -80, -214, 14, 'O', {});
          else foe.glossSmile(c, -76, -212, 30, { color: G.line });
          crack(c, -40, -250, 28, 'dragon', hurt * 1.4);
          // the muzzle: it glows on the wind-up and fires square confetti on the strike
          if (wind > 0.1 && !st.won) tk.glow(c, -118, -221, 22 + 14 * wind, '#ffffff', 0.6 * wind);
          polite(c, st, -86, -230, 5);
        },
      });
      put(ctx, st, 'coilF', {});
      ctx.restore();
      if (atk && E0.p > 0.42 && E0.p < 0.95) {
        const u = clamp((E0.p - 0.42) / 0.5, 0, 1), mx = tip.x - 84 + hurt * 12, my = tip.y - 18;
        tk.glow(ctx, mx - 30 * u, my, 40, '#ffffff', 0.7 * (1 - u));
        for (let i = 0; i < 14; i++) {
          const a = PI + (hv('strc', 'a' + i) - 0.5) * 0.9, d = 30 + 170 * u * (0.5 + hv('strc', 'd' + i) * 0.6), x = mx + cos(a) * d, y = my + sin(a) * d + u * u * 30;
          ctx.save(); ctx.globalAlpha = 1 - u * u; ctx.translate(x, y); ctx.rotate(u * 4 * (hv('strc', 'r' + i) - 0.5));
          ctx.fillStyle = STR.band[i % 4]; ctx.fillRect(-4, -4, 8, 8); ctx.strokeStyle = G.line; ctx.lineWidth = 1.2; ctx.strokeRect(-4, -4, 8, 8); ctx.restore();
        }
      }
      if (buff > 0.05) foe.sparkles(ctx, 0, -140, [[-60, -60, 6, 0], [70, -20, 5, 0.3], [0, -110, 7, 0.6]], 3, E0.buffP * 2);
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // AIRBRUSH WRAITH (eraser_wraith, normal, m). Echowake rig: ERASER WRAITH (keeps the soft half-there edge and the pressing hand). A hovering
  // soft-focus figure with an airbrushed halo for an edge, a smooth porcelain face with sleepy eyes and the Gloss smile, one hand an airbrush
  // nozzle puffing pastel mist, the other a soft open palm that smooths. Accent: the red ring on the nozzle.
  // ---------------------------------------------------------------------------------------------------------------
  const WRT = { body: sym([[0, -174], [-24, -170], [-38, -150], [-42, -118], [-48, -84], [-44, -58], [-36, -40, 1], [-26, -52], [-16, -38, 1], [-6, -50], [0, -40, 1]]) };
  define('eraser_wraith', {
    size: 'm',
    col: { body: G.mist, low: G.blush, face: G.porcelain, nozzle: G.chromeL, cup: G.lilac, palm: G.opal, halo: G.lilac },
    real: { body: '#9fd8ff', low: '#ff8fc8', face: '#ffd8bd', nozzle: '#ffc94d', cup: '#8b4dff', palm: '#ffe1c8', halo: '#ff9fd0' },
    bounds: { w: 190, h: 184, head: { x: 0, y: -176 }, body: { x: 0, y: -100 }, feet: { x: 0, y: 0 } },
    dieBox: [-60, -184, 60, -30],
    sweep: [-20, -140],
    parts: {
      body: {
        box: [-60, -186, 60, -28], pivot: [0, -100],
        draw(S) {
          const g = S.g;
          // the airbrushed edge: wide soft strokes of the halo colour under a lighter, thinner line
          g.save(); g.lineJoin = 'round';
          [[16, 0.1], [10, 0.16], [5, 0.24]].forEach((w) => { g.beginPath(); tk.trace(g, WRT.body); g.closePath(); g.lineWidth = w[0]; g.strokeStyle = tk.rgba(S.c.halo, w[1]); g.stroke(); });
          g.restore();
          S.cel(WRT.body, S.c.body, { lineColor: S.real ? S.lc : '#8a8fae', line: S.L * 0.8, hi: '#ffffff', hiW: 3,
            decor(gg) { const gr = gg.createLinearGradient(0, -120, 0, -40); gr.addColorStop(0, tk.rgba(S.c.low, 0)); gr.addColorStop(1, tk.rgba(S.c.low, 0.85)); gg.fillStyle = gr; gg.fillRect(-60, -120, 120, 90); } });
          S.cel(E(0, -138, 23, 20, 22), S.c.face, { lineColor: S.real ? S.lc : '#8a8fae', line: S.L * 0.7, shadow: RJ.shade(S.c.face, 0.04) });
        },
      },
      palm: {
        box: [22, -128, 70, -76], pivot: [34, -108],
        draw(S) {
          S.limb([34, -108], [52, -96], 13, S.c.body, { ink: S.real ? S.lc : '#8a8fae' });
          RJ.hand(S.g, 'open', 54, -96, -0.5, { skin: S.c.palm, shade: RJ.shade(S.c.palm, 0.06), k: 1.1 });
        },
      },
      nozzle: {
        box: [-108, -122, -24, -80], pivot: [-34, -106],
        draw(S) {
          S.limb([-34, -106], [-56, -98], 13, S.c.body, { ink: S.real ? S.lc : '#8a8fae' });
          S.cel(RR(-64, -96, 10, 16, 3), S.c.nozzle, { hi: true });
          S.cel(RR(-88, -106, 32, 13, 6), S.c.nozzle, { hi: '#ffffff' });
          S.cel([[-88, -104], [-102, -100], [-102, -98], [-88, -94]], S.c.nozzle, { tension: 0, hi: true });
          S.cel(RR(-92, -106, 5, 13, 2), S.real ? '#ff2a4a' : G.accent, { shadow: false, line: S.L * 0.6 });
          S.cel([[-78, -106], [-76, -116], [-66, -116], [-64, -106]], S.c.cup, { tension: 0.3, hi: true });
          S.blob([{ e: [-58, -98, 8, 8] }], S.c.palm);
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, atk = E0.pose === 'attack';
      const fl = sin(t * 1.5) * 6 * m;
      const press = atk ? E0.strike : 0;
      const dx = -press * 26 + hurt * 18 + E0.shake + 4 * tele;
      const dy = fl + 2 * hurt - 4 * tele;
      const rot = -0.1 * press + 0.04 * tele + 0.12 * hurt;
      tk.glow(ctx, 0, -14, 40, st.won ? '#ff9fd0' : G.blush, 0.32);
      ctx.save();
      xform(ctx, 0, -100, dx, dy, rot, 1 - 0.06 * guard, 1 + 0.02 * sin(t * 1.5) * m);
      put(ctx, st, 'palm', { r: 0.05 * sin(t * 1.7) * m - 0.4 * guard + 0.2 * hurt });
      put(ctx, st, 'body', {
        kids(c) {
          face(c, st, 0, -142, { kind: 'sleepy', w: 12, gap: 20, my: 13, sw: 11, iris: ['#7d6fb0', '#c9b8ff'], look: [-0.4, 0.2] });
          crack(c, 12, -160, 30, 'wraith', hurt * 1.4);
          polite(c, st, -18, -160, 5);
        },
      });
      // the nozzle: aimed at the heroes; raised and charging on the wind-up, a spray on the press
      const aim = -0.3 * tele - 0.25 * (atk ? E0.wind : 0) + 0.2 * press + 0.5 * guard;
      put(ctx, st, 'nozzle', { r: aim + 0.03 * sin(t * 2) * m });
      const nz = [-34 + cos(PI + aim + 0.32) * 70, -106 + sin(PI + aim + 0.32) * 70];
      mist(ctx, nz[0], nz[1], t, PI + aim * 0.6, { n: 5 + Math.round(8 * (press + tele + buff)), reach: 36 + 90 * press + 30 * tele, size: 5 + 4 * press, alpha: 0.45 + 0.4 * (press + tele), seed: 3, cols: st.won ? ['#ff9fd0', '#ffd84d', '#9fd8ff'] : undefined });
      if (guard > 0.05) mist(ctx, 0, -100, t, -PI / 2, { n: 10, reach: 70, spread: 6, size: 12, alpha: 0.45 * guard, seed: 7 });
      ctx.restore();
      // the smoothing swipe: a soft pastel band wiped across the heroes on the press
      if (atk && E0.p > 0.4 && E0.p < 0.85) {
        const u = clamp((E0.p - 0.4) / 0.45, 0, 1);
        ctx.save(); ctx.globalAlpha = sin(PI * u) * 0.6; ctx.lineCap = 'round';
        ctx.strokeStyle = G.blush; ctx.lineWidth = 26; ctx.beginPath(); ctx.moveTo(-120 - 60 * u, -140); ctx.quadraticCurveTo(-150, -100, -120 - 60 * u, -60); ctx.stroke();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 10; ctx.stroke(); ctx.restore();
      }
      if (buff > 0.05) foe.sparkles(ctx, 0, -110, [[-40, -40, 6, 0], [40, -30, 5, 0.4]], 3, E0.buffP * 2);
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // RING LIGHT SENTINEL (thunder_crow, normal, m). Echowake rig: THUNDER CROW (keeps the dive and the perch timing). A big white ring light with a
  // tiny pair of stern eyes and the Gloss smile floating in its hollow middle, on a folding chrome tripod that tucks up when it dives; lens
  // flares on every flash. Accent: the lemon flare.
  // ---------------------------------------------------------------------------------------------------------------
  const RLS = { cy: -124, R: 54 };
  const rlsLeg = (sd, back) => ({
    box: back ? [-10, -60, 10, 0] : (sd < 0 ? [-56, -60, 6, 4] : [-6, -60, 56, 4]), pivot: [0, -54],
    draw(S) {
      const end = back ? [0, -8] : [sd * 44, -4];
      S.limb([0, -54], end, back ? 6 : 7, back ? RJ.shade(S.c.leg, 0.1) : S.c.leg);
      S.ell(end[0], end[1] + 1, back ? 5 : 7, 3.5, S.c.foot, { shadow: false });
    },
  });
  define('thunder_crow', {
    size: 'm',
    col: { leg: G.chromeL, foot: G.lilac, clamp: G.chromeL, hole: G.opal },
    real: { leg: '#ffb83d', foot: '#ff6fb5', clamp: '#7cc6ff', hole: '#fff4d8' },
    bounds: { w: 180, h: 186, head: { x: 0, y: -176 }, body: { x: 0, y: -120 }, feet: { x: 0, y: 0 } },
    dieBox: [-64, -184, 64, 0],
    sweep: [-40, -150],
    parts: {
      legL: rlsLeg(-1), legR: rlsLeg(1), legB: rlsLeg(0, true),
      stem: {
        box: [-12, -76, 12, -48], pivot: [0, -54],
        draw(S) { S.cel(RR(-3.5, -74, 7, 22, 3), S.c.clamp, { hi: true }); S.ell(0, -54, 7, 6, S.c.clamp, { hi: true }); },
      },
      ring: {
        box: [-62, -186, 62, -64], pivot: [0, RLS.cy],
        draw(S) {
          S.g.save(); S.g.globalAlpha = 0.6; S.g.fillStyle = S.c.hole; S.g.beginPath(); S.g.arc(0, RLS.cy, RLS.R * 0.62, 0, TAU); S.g.fill(); S.g.restore();
          ringLight(S, 0, RLS.cy, RLS.R, { inner: 0.62, leds: 18 });
          S.cel(RR(-10, RLS.cy + RLS.R - 4, 20, 12, 4), S.c.clamp, { hi: true });
          S.cel(RR(-6, RLS.cy - RLS.R - 8, 12, 9, 3), S.c.clamp, { hi: true });
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, atk = E0.pose === 'attack', p = atk ? E0.p : 0;
      // the dive: tripod tucks on the wind-up, the ring tilts and drops toward the lead hero, then perches again
      const tuck = clamp((atk ? sm(p / 0.3) * (1 - sm((p - 0.7) / 0.3)) : 0) + 0.6 * tele, 0, 1);
      const dive = atk ? sin(PI * clamp((p - 0.3) / 0.5, 0, 1)) : 0;
      const dx = -dive * 70 + hurt * 18 + E0.shake;
      const dy = dive * 26 - tuck * 22 + sin(t * 2) * 1.5 * m + 3 * guard;
      const rot = -0.45 * dive - 0.12 * tele + 0.14 * hurt;
      const dim = clamp(buff, 0, 1);
      ctx.save();
      xform(ctx, 0, -54, dx, dy, rot, 1, 1);
      put(ctx, st, 'legB', { sy: 1 - 0.5 * tuck });
      put(ctx, st, 'legL', { r: -0.8 * tuck + 0.15 * guard });
      put(ctx, st, 'legR', { r: 0.8 * tuck - 0.15 * guard });
      put(ctx, st, 'stem', {});
      const lit = st.won ? 0.5 : clamp(0.55 + 0.15 * sin(t * 2.2) * m + 0.45 * tele + 0.6 * dive - 0.5 * dim, 0, 1.2);
      tk.glow(ctx, 0, RLS.cy, RLS.R * 1.5, st.won ? '#ffd84d' : '#ffffff', 0.32 * Math.min(1, lit));
      put(ctx, st, 'ring', {
        r: 0.04 * hurt, sx: 1 + 0.04 * guard, sy: 1 + 0.04 * guard,
        kids(c) {
          face(c, st, 0, RLS.cy - 4, { kind: st.won ? 'round' : 'glare', w: 11, gap: 17, my: 14, sw: 10, iris: ['#6d7196', '#b9bde0'], open: 1 - 0.55 * dim, look: [-0.5 * tele - 0.6 * dive, 0.2 * dive] });
          crack(c, -30, RLS.cy - 44, 30, 'ring', hurt * 1.4);
          polite(c, st, 34, RLS.cy - 36, 5);
        },
      });
      ctx.restore();
      // the flash: a burst of white, a lemon flare and a string of lens flares across the stage
      const fk = st.won ? 0 : Math.max(atk ? sin(PI * clamp((p - 0.42) / 0.3, 0, 1)) : 0, tele > 0.9 ? 0.25 + 0.25 * sin(t * 18) : 0);
      if (fk > 0.03) {
        const cx = dx, cy = RLS.cy + dy;
        tk.glow(ctx, cx, cy, 78, '#ffffff', 0.55 * fk);
        tk.glow(ctx, cx, cy, 40, '#fff3a0', 0.6 * fk);
        ctx.save(); ctx.globalAlpha = fk; ctx.fillStyle = '#fffbe0';
        ctx.beginPath(); ctx.moveTo(cx - 120, cy); ctx.lineTo(cx, cy - 2.5); ctx.lineTo(cx + 80, cy); ctx.lineTo(cx, cy + 2.5); ctx.closePath(); ctx.fill();
        [[0.35, 8, '#fff3a0'], [0.6, 14, '#e6d9ff'], [0.85, 6, '#d9fff4'], [1.15, 18, '#ffe3f1']].forEach((f) => {
          ctx.globalAlpha = fk * 0.5; ctx.fillStyle = f[2]; ctx.beginPath(); ctx.arc(cx - 150 * f[0], cy + 40 * f[0], f[1], 0, TAU); ctx.fill();
        });
        ctx.restore();
      }
      if (guard > 0.05) pitchRing(ctx, dx, RLS.cy + dy, 72, 72, 2.5, 16, G.lemon, guard, t * 4);
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // SEQUIN GOLEM (paper_golem, normal, l). Echowake rig: PAPER GOLEM (keeps the giant body, the pad-up and the slam; the paper facets became sequin
  // panels). A huge round giant stitched from stage costumes, every sequin perfectly in line in a lilac to blush to silver gradient, a sequinned
  // mask of a face with the Gloss smile, big mitten fists and stubby legs. Sequins flick off when it is hurt and pile back on when it sequins up
  // (its Sequins status, drawn literally). Accent: one red sequin heart on the chest.
  // ---------------------------------------------------------------------------------------------------------------
  const GLM = { cy: -118, rx: 84, ry: 80, hy: -210 };
  const glmArm = (sd) => ({
    box: [sd < 0 ? -128 : 50, -170, sd < 0 ? -50 : 128, -40], pivot: [sd * 68, -150],
    draw(S) {
      S.limb([sd * 68, -150], [sd * 98, -112], 30, S.c.arm);
      S.limb([sd * 98, -112], [sd * 100, -74], 28, S.c.arm);
      S.blob([{ e: [sd * 100, -62, 21, 19] }, { a: [sd * 88, -70], b: [sd * 84, -58], w: 12 }], S.c.fist);
    },
  });
  define('paper_golem', {
    size: 'l',
    col: { arm: G.lilac, fist: G.opal, leg: G.lilac, foot: G.chromeL, mask: '#e8e6f2', seqA: G.lilac, seqB: G.blush, seqC: '#e4e5ee' },
    real: { arm: '#8b4dff', fist: '#ffd84d', leg: '#5a2f8a', foot: '#ff6fb5', mask: '#ffd8bd', seqA: '#8b4dff', seqB: '#ff3f8e', seqC: '#ffd84d' },
    bounds: { w: 250, h: 250, head: { x: 0, y: -240 }, body: { x: 0, y: -120 }, feet: { x: 0, y: 0 } },
    dieBox: [-110, -248, 110, 0],
    sweep: [-50, -170],
    hop: 12,
    parts: {
      legL: { box: [-56, -60, -12, 4], pivot: [-34, -46], draw(S) { S.limb([-34, -50], [-36, -16], 30, S.c.leg); S.cel(RR(-58, -18, 44, 18, 9), S.c.foot, { hi: true }); } },
      legR: { box: [12, -60, 56, 4], pivot: [34, -46], draw(S) { S.limb([34, -50], [36, -16], 30, S.c.leg); S.cel(RR(14, -18, 44, 18, 9), S.c.foot, { hi: true }); } },
      armL: glmArm(-1), armR: glmArm(1),
      body: {
        box: [-92, -204, 92, -34], pivot: [0, GLM.cy],
        draw(S) {
          const shape = E(0, GLM.cy, GLM.rx, GLM.ry, 36);
          S.cel(shape, S.c.seqA, { hi: '#ffffff', hiW: 3,
            decor(g) {
              sequins(g, -92, GLM.cy - GLM.ry - 6, 184, GLM.ry * 2 + 10, { d: 9, cols: [S.c.seqA, S.c.seqA, S.c.seqB, S.c.seqB, S.c.seqC], seed: 9 });
              g.save(); g.setLineDash([5, 4]); g.lineWidth = 1.6; g.strokeStyle = tk.rgba(S.lc, 0.55);
              [-1, 1].forEach((sd) => { g.beginPath(); g.moveTo(sd * 34, GLM.cy - 76); g.quadraticCurveTo(sd * 50, GLM.cy, sd * 34, GLM.cy + 76); g.stroke(); });
              g.beginPath(); g.moveTo(-80, GLM.cy + 10); g.quadraticCurveTo(0, GLM.cy + 26, 80, GLM.cy + 10); g.stroke();
              g.restore();
              const hx = -14, hy = GLM.cy - 30;
              g.fillStyle = S.real ? '#ff2a4a' : G.accent; g.beginPath(); g.moveTo(hx, hy + 7); g.bezierCurveTo(hx - 11, hy - 2, hx - 5, hy - 11, hx, hy - 5); g.bezierCurveTo(hx + 5, hy - 11, hx + 11, hy - 2, hx, hy + 7); g.fill();
            } });
        },
      },
      head: {
        box: [-44, -252, 44, -168], pivot: [0, -180],
        draw(S) {
          S.cel(E(0, GLM.hy, 36, 34, 26), S.c.mask, { hi: '#ffffff',
            decor(g) { sequins(g, -40, GLM.hy - 36, 80, 40, { d: 7, cols: [S.c.seqC, S.c.seqA], seed: 4 }); } });
          S.cel(sym([[0, GLM.hy - 12], [-30, GLM.hy - 16], [-34, GLM.hy - 2], [-20, GLM.hy + 4], [-6, GLM.hy - 2], [0, GLM.hy - 4]]), S.c.seqB, { hi: true, tension: 0.3,
            decor(g) { sequins(g, -36, GLM.hy - 18, 72, 24, { d: 6, cols: [S.c.seqB, RJ.tint(S.c.seqB, 0.4)], seed: 6 }); } });
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, atk = E0.pose === 'attack', p = atk ? E0.p : 0;
      const sway = sin(t * 1.2) * m;
      const raise = clamp((atk ? E0.wind : 0) + tele, 0, 1), slam = atk ? E0.strike : 0;
      const dx = -slam * 18 + hurt * 14 + E0.shake;
      const dy = -6 * raise + 10 * slam + 4 * guard + 2 * Math.abs(sway);
      ctx.save();
      xform(ctx, 0, -40, dx, 0, 0.12 * hurt - 0.06 * slam, 1, 1);
      put(ctx, st, 'legL', { r: 0.04 * sway });
      put(ctx, st, 'legR', { r: 0.04 * sway });
      ctx.save();
      xform(ctx, 0, -40, 0, dy, 0.03 * sway, 1 + 0.04 * guard, 1 - 0.03 * guard + 0.02 * sin(t * 2) * m);
      // the arms: up over the head on the wind-up, down in a slam, hugging in on the guard
      const armR = (sd) => -sd * (2.3 * raise) + sd * 1.4 * slam * (1 - raise) + sd * 0.55 * guard - 0.04 * sway + sd * 0.2 * hurt;
      put(ctx, st, 'armR', { r: armR(1) });
      put(ctx, st, 'body', {});
      put(ctx, st, 'head', {
        r: 0.04 * sway + 0.12 * hurt, y: -2 * raise,
        kids(c) {
          face(c, st, 0, GLM.hy - 4, { kind: 'lens', w: 13, gap: 26, my: 22, sw: 14, look: [-0.4, 0.1] });
          crack(c, -16, GLM.hy - 28, 30, 'golem', hurt * 1.4);
          polite(c, st, 22, GLM.hy - 22, 5);
        },
      });
      put(ctx, st, 'armL', { r: armR(-1) });
      crack(ctx, 30, GLM.cy - 50, 44, 'golem2', hurt * 1.4);
      polite(ctx, st, -46, GLM.cy - 42, 7);
      ctx.restore();
      ctx.restore();
      // sequins: flicking off when hurt, flying in and piling on when it sequins up, a ring of them on the slam
      const flick = (k, inward, n, seed) => {
        for (let i = 0; i < n; i++) {
          const a = hv(seed, 'a' + i) * TAU, d0 = 40 + 40 * hv(seed, 'd' + i), d = inward ? d0 + 120 * (1 - k) : d0 + 110 * k;
          const x = dx + cos(a) * d, y = GLM.cy + sin(a) * d * 0.8 + (inward ? 0 : 60 * k * k), al = inward ? sin(PI * k) : 1 - k;
          if (al < 0.05) continue;
          ctx.save(); ctx.globalAlpha = al; ctx.fillStyle = [G.lilac, G.blush, '#e4e5ee'][i % 3]; ctx.strokeStyle = G.line; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.ellipse(x, y, 4.5, 4.5 * Math.abs(cos(k * 9 + i)) + 0.8, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
        }
      };
      if (E0.pose === 'hurt') flick(E0.p, false, 12, 'gh');
      if (buff > 0.02) flick(E0.buffP, true, 14, 'gb');
      if (atk && p > 0.45 && p < 0.9) { const u = (p - 0.45) / 0.45; ctx.save(); ctx.globalAlpha = 1 - u; ctx.strokeStyle = G.lilac; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(-60 + dx, -6, 40 + 90 * u, 10 + 16 * u, 0, 0, TAU); ctx.stroke(); ctx.restore(); flick(u, false, 10, 'gs'); }
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // GLITCH GREMLIN (margin_imp, normal, m). Echowake rig: MARGIN IMP (keeps the shaky line idea, now a pixel jitter, and the summon pose; the
  // horns became headphone cups). A small magenta gremlin drawn in a jittery line with cyan and lime fringes that keeps slipping a pixel
  // sideways, big chrome headphone cups with lime cushions, a clipboard of wobbles held in both hands, little glitch blocks fizzing off its
  // edges. Accent: the gremlin's magenta itself.
  // ---------------------------------------------------------------------------------------------------------------
  const GRM = { hy: -122 };
  // the jittery line: the outline drawn twice, slipped a little in cyan and in lime, under the real cel
  function fringe(S, pts, d) {
    if (S.real) return;
    const g = S.g;
    g.save(); g.lineJoin = 'round'; g.lineWidth = S.L;
    g.globalAlpha = 0.75; g.strokeStyle = '#4fe3ff'; g.save(); g.translate(-d, 0); g.beginPath(); tk.trace(g, pts); g.closePath(); g.stroke(); g.restore();
    g.strokeStyle = '#b6ff4f'; g.save(); g.translate(d, 0.5); g.beginPath(); tk.trace(g, pts); g.closePath(); g.stroke(); g.restore();
    g.restore();
  }
  define('margin_imp', {
    size: 'm',
    col: { skin: '#e45bc9', belly: '#f4a6e2', cup: G.chromeL, cushion: '#d6ff9a', paper: '#f7ffe8', clip: G.chromeL, wob: '#7a8fd0' },
    real: { skin: '#ff3fa8', belly: '#ffd0ec', cup: '#7cc6ff', cushion: '#7dff3f', paper: '#fff8ec', clip: '#ffc94d', wob: '#3a2f8a' },
    bounds: { w: 180, h: 186, head: { x: 0, y: -172 }, body: { x: 0, y: -90 }, feet: { x: 0, y: 0 } },
    dieBox: [-66, -176, 66, 0],
    sweep: [-30, -140],
    film: 0.6,
    parts: {
      legs: {
        box: [-30, -50, 30, 2], pivot: [0, -40],
        draw(S) { [-1, 1].forEach((sd) => { S.limb([sd * 11, -44], [sd * 13, -14], 12, S.c.skin); S.cel(E(sd * 15, -9, 12, 7, 14), S.c.skin, { hi: true }); }); },
      },
      body: {
        box: [-34, -92, 34, -30], pivot: [0, -40],
        draw(S) {
          const b = E(0, -62, 26, 28, 20);
          fringe(S, b, 1.8);
          S.cel(b, S.c.skin, { hi: true });
          S.cel(E(0, -56, 15, 16, 16), S.c.belly, { shadow: false, line: S.L * 0.6 });
        },
      },
      head: {
        box: [-66, -172, 66, -74], pivot: [0, -84],
        draw(S) {
          const y = GRM.hy, h = E(0, y, 42, 38, 28);
          // the headband over the top, the cups with their lime cushions
          RJ.ink(S.g, tk.arcPts(0, y + 2, 48, 48, PI * 1.08, PI * 1.92, 10), { w: S.L * 3.4, color: S.lc, taper: 0, wobble: 0 });
          RJ.ink(S.g, tk.arcPts(0, y + 2, 48, 48, PI * 1.08, PI * 1.92, 10), { w: S.L * 2, color: S.c.cup, taper: 0, wobble: 0 });
          fringe(S, h, 2);
          S.cel(h, S.c.skin, { hi: true, hiW: 3 });
          [-1, 1].forEach((sd) => {
            S.cel(E(sd * 46, y + 2, 13, 19, 18), S.c.cup, { hi: '#ffffff' });
            S.cel(E(sd * 40, y + 2, 6, 14, 14), S.c.cushion, { shadow: false, line: S.L * 0.6 });
          });
        },
      },
      board: {
        box: [-30, -96, 30, -34], pivot: [0, -64],
        draw(S) {
          S.cel(RR(-24, -88, 48, 50, 5), S.c.paper, { hi: false });
          [-74, -64, -54, -46].forEach((y, i) => { const pts = []; for (let k = 0; k <= 10; k++) pts.push([-16 + k * 3.2, y + sin(k * 1.3 + i) * 2.2]); RJ.ink(S.g, pts, { w: 1.3, color: S.c.wob, taper: 0.2, wobble: 0 }); });
          S.cel(RR(-10, -94, 20, 10, 3), S.c.clip, { hi: true });
          [-1, 1].forEach((sd) => S.blob([{ e: [sd * 25, -62, 7, 8] }], S.c.skin));
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, atk = E0.pose === 'attack', p = atk ? E0.p : 0;
      // the glitch: every so often the whole gremlin slips a pixel or three sideways for a moment (always on the wind-up)
      const gph = fr(t / 1.1 + hv('grm', 'g')), glitching = !st.won && (gph < 0.12 || tele > 0.3 || (atk && p > 0.3 && p < 0.6));
      const slip = glitching ? (Math.floor(t * 30) % 2 ? 3 : -2) : 0;
      const hop = Math.abs(sin(t * 3.2)) * 4 * m;
      const thrust = atk ? E0.strike : 0, lift = clamp((atk ? E0.wind : 0) + tele + buff * 0.8, 0, 1);
      const dx = -thrust * 22 + hurt * 18 + slip + E0.shake;
      const dy = -hop + 3 * guard;
      ctx.save();
      xform(ctx, 0, -40, dx, dy, 0.12 * hurt - 0.08 * thrust, 1, 1);
      put(ctx, st, 'legs', { sy: 1 - 0.05 * hop / 4 });
      put(ctx, st, 'body', {});
      put(ctx, st, 'head', {
        r: 0.05 * sin(t * 2.1) * m + 0.12 * hurt - 0.06 * thrust, y: -lift * 3,
        kids(c) {
          face(c, st, 0, GRM.hy - 2, { kind: 'round', w: 17, gap: 28, my: 18, sw: 14, iris: ['#3d7d2a', '#b6ff4f'], look: [-0.4 - 0.4 * thrust, 0.1] });
          crack(c, 18, GRM.hy - 30, 30, 'gremlin', hurt * 1.4);
          polite(c, st, -26, GRM.hy - 26, 5);
        },
      });
      // the clipboard: held up high to summon, thrust at the heroes, up in front of the face on a guard
      put(ctx, st, 'board', { y: -34 * lift - 40 * guard, x: -10 * thrust, r: -0.2 * thrust + 0.1 * lift, sx: 1 + 0.15 * guard, sy: 1 + 0.15 * guard });
      ctx.restore();
      // glitch blocks fizzing off its edges (more while glitching), a burst at the heroes on the thrust
      const nb = glitching ? 7 : 3;
      for (let i = 0; i < nb; i++) {
        const u = fr(t * 0.9 + hv('grmb', 'p' + i)), sd = i % 2 ? 1 : -1, x = dx + sd * (40 + 30 * u) + (hv('grmb', 'x' + i) - 0.5) * 20, y = -150 + 110 * hv('grmb', 'y' + i) - 30 * u;
        const a = sin(PI * u);
        if (a < 0.1 || st.won) continue;
        ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = ['#4fe3ff', '#b6ff4f', '#e45bc9'][i % 3]; ctx.fillRect(Math.round(x), Math.round(y), 6, 6); ctx.restore();
      }
      if (atk && p > 0.4 && p < 0.9) {
        const u = (p - 0.4) / 0.5;
        for (let i = 0; i < 9; i++) { const x = dx - 40 - 140 * u * (0.5 + hv('grma', 'd' + i)), y = -100 + (hv('grma', 'y' + i) - 0.5) * 80; ctx.save(); ctx.globalAlpha = 1 - u; ctx.fillStyle = ['#4fe3ff', '#b6ff4f', '#e45bc9'][i % 3]; ctx.fillRect(Math.round(x), Math.round(y), 7, 7); ctx.restore(); }
      }
      if (buff > 0.05) foe.sparkles(ctx, 0, -120, [[-50, -30, 6, 0], [50, -40, 5, 0.4]], 3, E0.buffP * 2);
    },
  });

  // ===============================================================================================================
  // RIVALS (E3b)
  // ===============================================================================================================
  // ---------------------------------------------------------------------------------------------------------------
  // BIG MUTE BUTTON (censor_golem, elite, l). Echowake rig: CENSOR GOLEM (keeps the stamp arm and its raise-then-press timing; the cabinet became a
  // round button). A giant blush push button on a chrome rim with stubby legs: its face is a big crossed-out speaker icon with two little eyes
  // above it and the Gloss smile under it; one arm is a chrome piston ending in a padded plunger that rises on the quiet turn and presses down on
  // the heavy one; a soft click light on the rim. Accent: the red slash across the speaker.
  // ---------------------------------------------------------------------------------------------------------------
  const MUT = { capY: -150 };
  define('censor_golem', {
    size: 'l',
    col: { cap: G.blush, rim: G.chromeL, ring: '#e9e3f6', leg: G.chromeL, foot: '#d9d4ea', icon: '#7d81a0', pad: '#e3dcf3', piston: G.chromeL, mitt: G.opal },
    real: { cap: '#ff4f8e', rim: '#7cc6ff', ring: '#ffd84d', leg: '#5a8aff', foot: '#3fcf6a', icon: '#2d2747', pad: '#ffd84d', piston: '#ffb83d', mitt: '#ffe1c8' },
    bounds: { w: 236, h: 236, head: { x: 0, y: -226 }, body: { x: 0, y: -126 }, feet: { x: 0, y: 0 }, right: 120 },
    dieBox: [-110, -236, 110, 0],
    sweep: [-50, -170],
    hop: 12,
    parts: {
      legs: {
        box: [-66, -70, 66, 2], pivot: [0, -60],
        draw(S) { [-1, 1].forEach((sd) => { S.limb([sd * 40, -64], [sd * 44, -16], 22, S.c.leg); S.cel(RR(sd * 44 - 20, -18, 40, 17, 8), S.c.foot, { hi: true }); }); },
      },
      base: {
        box: [-100, -106, 100, -40], pivot: [0, -60],
        draw(S) {
          const side = [[-96, -88, 1]].concat(tk.arcPts(0, -60, 96, 20, PI, 0, 14).reverse()).concat([[96, -88, 1]]);
          S.chrome(side, { horizon: 0.45 });
          S.cel(E(0, -88, 96, 16, 30), S.c.ring, { hi: '#ffffff' });
          S.ell(0, -62, 7, 5, S.real ? '#ff2a4a' : G.accent, { shadow: false, line: S.L * 0.7 });
        },
      },
      cap: {
        box: [-92, -230, 92, -80], pivot: [0, -90],
        draw(S) {
          const cap = sym([[0, -226], [-50, -220], [-78, -192], [-86, -150], [-84, -106], [-74, -90], [0, -86]]);
          S.cel(cap, S.c.cap, { hi: '#ffffff', hiW: 4 });
          // the crossed-out speaker icon
          const ic = S.c.icon, y = MUT.capY + 6;
          S.cel(RR(-30, y - 10, 14, 20, 3), ic, { shadow: false, line: S.L * 0.7 });
          S.cel([[-17, y - 10], [2, y - 26], [2, y + 26], [-17, y + 10]], ic, { shadow: false, tension: 0, line: S.L * 0.7 });
          S.g.save(); S.g.strokeStyle = ic; S.g.lineWidth = 4; S.g.lineCap = 'round';
          [12, 22].forEach((r) => { S.g.beginPath(); S.g.arc(4, y, r, -0.7, 0.7); S.g.stroke(); });
          S.g.restore();
          RJ.ink(S.g, [[-38, y + 30], [38, y - 30]], { w: 9, color: S.lc, taper: 0, wobble: 0 });
          RJ.ink(S.g, [[-38, y + 30], [38, y - 30]], { w: 5.4, color: S.real ? '#ff2a4a' : G.accent, taper: 0, wobble: 0 });
        },
      },
      mitt: {
        box: [60, -150, 116, -96], pivot: [74, -128],
        draw(S) { S.limb([74, -128], [98, -114], 14, S.c.piston); S.blob([{ e: [102, -110, 11, 10] }], S.c.mitt); },
      },
      plunger: {
        box: [-150, -232, -52, -126], pivot: [-70, -150],
        draw(S) {
          S.limb([-70, -150], [-96, -180], 15, S.c.piston);
          S.limb([-96, -180], [-112, -196], 11, RJ.shade(S.c.piston, 0.06));
          S.ell(-96, -180, 8, 8, S.c.piston, { hi: true });
          S.cel(RR(-124, -206, 26, 10, 4), S.c.piston, { hi: true });
          S.cel(E(-111, -216, 34, 13, 24), S.c.pad, { hi: '#ffffff', hiW: 3 });
          S.g.save(); S.g.strokeStyle = tk.rgba(S.lc, 0.35); S.g.lineWidth = 1.2; S.g.setLineDash([3, 3]);
          S.g.beginPath(); S.g.ellipse(-111, -216, 26, 8, 0, 0, TAU); S.g.stroke(); S.g.restore();
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, atk = E0.pose === 'attack', p = atk ? E0.p : 0;
      const br = sin(t * 1.6) * m;
      // the press: raised high on the wind-up (Hover Over), down on the heroes on the strike (MUTED)
      const raise = clamp((atk ? E0.wind : 0) + tele, 0, 1), press = atk ? E0.strike : 0;
      const armA = 0.5 * raise * (1 - press) - 1.3 * press + 0.06 * br + 0.2 * hurt + 0.25 * buff;
      const squash = 0.08 * guard + 0.05 * press;               // pressed in like a button on the guard
      const dx = -10 * press + hurt * 14 + E0.shake, dy = 3 * guard;
      ctx.save();
      xform(ctx, 0, -60, dx, dy, 0.1 * hurt - 0.04 * press, 1, 1);
      put(ctx, st, 'legs', {});
      put(ctx, st, 'base', {});
      put(ctx, st, 'mitt', { r: 0.1 * br + 0.4 * buff - 0.2 * guard });
      put(ctx, st, 'cap', {
        sy: 1 - squash + 0.03 * buff + 0.01 * br, sx: 1 + squash * 0.5,
        kids(c) {
          face(c, st, 0, -196, { kind: 'round', w: 14, gap: 30, noMouth: true, iris: ['#6d7196', '#b9bde0'], look: [-0.5 * raise, 0.4 * press] });
          face(c, st, 0, -196, { noEyes: true, my: 92, sw: 22 });
          crack(c, 30, -212, 40, 'mute', hurt * 1.4);
          polite(c, st, -44, -200, 7);
        },
      });
      put(ctx, st, 'plunger', { r: armA });
      // the click light blinks; a soft mute wave rolls out when it presses
      const blinkL = fr(t * 0.8) < 0.15 ? 1 : 0.3;
      if (!st.won) tk.glow(ctx, 0, -62, 18, G.accent, 0.4 * blinkL + 0.4 * raise);
      ctx.restore();
      if (press > 0.3) for (let i = 0; i < 3; i++) { const u = fr(p * 2 + i / 3); ctx.save(); ctx.globalAlpha = (1 - u) * press; ctx.strokeStyle = i % 2 ? G.lilac : G.blush; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(-150 + dx, -40, 30 + 60 * u, 8 + 16 * u, 0, 0, TAU); ctx.stroke(); ctx.restore(); }
      if (buff > 0.05) pitchRing(ctx, 0, -140, 100, 100, 2, 18, G.lilac, buff, t * 4);
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // APPLAUSE SIGN (storm_whelp, elite, l). Echowake rig: STORM DRAGON WHELP (keeps the charge glow that grows with each stack and the clap that spends
  // it). A big marquee box on chrome scaffold legs with the word APPLAUSE (one of the four art words) across its cream panel in bulb-white
  // letters, a ring of light bulbs round the frame, a little face under the word, and two noodle arms in cartoon white gloves for slow claps.
  // The bulbs chase and brighten as it charges. Accent: the marquee red.
  // ---------------------------------------------------------------------------------------------------------------
  const APL = { x0: -112, x1: 112, y0: -252, y1: -142 };
  const aplBulbs = (() => {
    const out = [], ins = 7, w = APL.x1 - APL.x0 - ins * 2, h = APL.y1 - APL.y0 - ins * 2, per = 2 * (w + h), n = 30;
    for (let i = 0; i < n; i++) {
      let d = i / n * per, x, y;
      if (d < w) { x = APL.x0 + ins + d; y = APL.y0 + ins; } else if ((d -= w) < h) { x = APL.x1 - ins; y = APL.y0 + ins + d; } else if ((d -= h) < w) { x = APL.x1 - ins - d; y = APL.y1 - ins; } else { d -= w; x = APL.x0 + ins; y = APL.y1 - ins - d; }
      out.push([x, y]);
    }
    return out;
  })();
  const aplArm = (sd) => ({
    box: [sd < 0 ? -150 : 70, -200, sd < 0 ? -70 : 150, -40], pivot: [sd * 104, -176],
    draw(S) {
      const pts = [[sd * 104, -176], [sd * 122, -150], [sd * 124, -112], [sd * 116, -86]];
      tk.ribbon(S.g, pts, S.c.sleeve, { wMax: 11, w0: 11, w1: 10, profile: () => 1, cap: 'round', shadow: RJ.shade(S.c.sleeve, 0.1), shadowW: 0.4, gloss: false, strands: 0, line: S.L, lineColor: S.lc, light: RJ.lightAngle() });
      glove(S, sd * 116, -84, PI / 2 - sd * 0.25, 1.15, S.c.glove);
    },
  });
  define('storm_whelp', {
    size: 'l',
    col: { frame: '#ff8fa6', panel: '#fff8ec', bulb: '#fff6d0', letter: '#fff6d0', leg: G.chromeL, sleeve: G.lilac, glove: '#ffffff', foot: '#d9d4ea' },
    real: { frame: '#e8335a', panel: '#ffe9a8', bulb: '#ffd84d', letter: '#ff8a1f', leg: '#ffc94d', sleeve: '#8b4dff', glove: '#ffffff', foot: '#3fcf6a' },
    bounds: { w: 280, h: 255, head: { x: 0, y: -236 }, body: { x: 0, y: -150 }, feet: { x: 0, y: 0 }, right: 171 },
    dieBox: [-130, -258, 130, 0],
    sweep: [-60, -200],
    hop: 12,
    parts: {
      legs: {
        box: [-100, -150, 100, 4], pivot: [0, -142],
        draw(S) {
          [-1, 1].forEach((sd) => {
            const xa = sd * 62, xb = sd * 86;
            S.limb([xa, -146], [xa + sd * 6, -10], 7, S.c.leg); S.limb([xb, -146], [xb + sd * 6, -10], 7, S.c.leg);
            for (let k = 0; k < 4; k++) { const y0 = -138 + k * 32; RJ.ink(S.g, [[xa + sd * k * 1.5, y0], [xb + sd * (k + 1) * 1.5, y0 + 28]], { w: S.L * 0.9, color: S.lc, taper: 0, wobble: 0 }); RJ.ink(S.g, [[xa + sd * k * 1.5, y0], [xb + sd * (k + 1) * 1.5, y0 + 28]], { w: S.L * 0.45, color: S.c.leg, taper: 0, wobble: 0 }); }
            S.cel(RR(sd * 74 - 22, -12, 44, 12, 5), S.c.foot, { hi: true });
          });
        },
      },
      armL: aplArm(-1), armR: aplArm(1),
      sign: {
        box: [-118, -258, 118, -136], pivot: [0, -142],
        draw(S) {
          S.cel(RR(APL.x0, APL.y0, APL.x1 - APL.x0, APL.y1 - APL.y0, 14), S.c.frame, { hi: '#ffffff', hiW: 3 });
          S.cel(RR(APL.x0 + 16, APL.y0 + 16, APL.x1 - APL.x0 - 32, APL.y1 - APL.y0 - 32, 8), S.c.panel, { shadow: RJ.shade(S.c.panel, 0.05) });
          aplBulbs.forEach((b) => { S.g.beginPath(); S.g.arc(b[0], b[1], 4.2, 0, TAU); S.g.fillStyle = S.c.bulb; S.g.fill(); S.g.lineWidth = 1.2; S.g.strokeStyle = S.lc; S.g.stroke(); });
          // the art word APPLAUSE
          const g = S.g;
          g.save(); g.font = '900 27px ' + tk.font.num; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
          g.lineWidth = 6; g.strokeStyle = S.lc; g.strokeText('APPLAUSE', 0, -215);
          g.fillStyle = S.c.letter; g.fillText('APPLAUSE', 0, -215);
          g.restore();
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, atk = E0.pose === 'attack', p = atk ? E0.p : 0;
      const br = sin(t * 1.4) * m;
      const charge = clamp(0.25 + 0.75 * tele + 0.8 * buff + (atk ? E0.wind * 0.8 : 0), 0, 1);
      // the slow clap: hands apart, together, apart (always going at rest; one big clap on the attack)
      const slow = 0.5 - 0.5 * cos(t * TAU / 1.8);
      const clap = atk ? clamp(E0.strike * 1.3, 0, 1) : (tele > 0 ? 0 : guard > 0 ? 0.2 : slow * 0.85);
      const dx = -10 * (atk ? E0.strike : 0) + hurt * 14 + E0.shake, dy = 2 * guard - 3 * tele;
      ctx.save();
      xform(ctx, 0, -142, dx, dy, 0.08 * hurt, 1, 1);
      put(ctx, st, 'legs', { sx: 1 + 0.02 * guard });
      const lift = 0.5 * tele;
      put(ctx, st, 'armL', { r: -1.15 * clap + 0.6 * lift - 0.2 * guard + 0.04 * br });
      put(ctx, st, 'armR', { r: 1.15 * clap - 0.6 * lift + 0.2 * guard - 0.04 * br });
      put(ctx, st, 'sign', {
        r: 0.02 * br + 0.06 * hurt, sy: 1 + 0.02 * buff,
        kids(c) {
          // the bulbs: a polite chase at rest, brighter with every bit of charge, all blazing on the wind-up
          const won = st.won;
          aplBulbs.forEach((b, i) => {
            const chase = 0.5 + 0.5 * sin(t * 5 - i * 0.7), lit = won ? 0.6 : clamp(0.25 + 0.55 * chase * (1 - tele) + charge * 0.7, 0, 1);
            tk.glow(c, b[0], b[1], 8 + 8 * lit, won ? '#ffd84d' : '#fff3c0', 0.6 * lit);
          });
          if (charge > 0.3 && !won) tk.glow(c, 0, -215, 110, '#fff3c0', 0.35 * charge);
          face(c, st, 0, -180, { kind: 'round', w: 13, gap: 34, my: 16, sw: 16, iris: ['#6d7196', '#b9bde0'] });
          crack(c, 64, -246, 34, 'sign', hurt * 1.4);
          polite(c, st, -86, -236, 6);
        },
      });
      // the clap: a burst between the gloves
      if (clap > 0.92) tk.glow(ctx, 0, -116, 40, '#ffffff', 0.7 * (clap - 0.92) * 12);
      ctx.restore();
      if (atk && p > 0.42 && p < 0.9) {
        const u = (p - 0.42) / 0.48;
        for (let i = 0; i < 3; i++) { const k = clamp(u * 1.4 - i * 0.15, 0, 1); if (k <= 0) continue; ctx.save(); ctx.globalAlpha = 1 - k; ctx.lineCap = 'round'; ctx.strokeStyle = G.line; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(dx - 20, -120, 30 + 150 * k, PI * 0.8, PI * 1.2); ctx.stroke(); ctx.strokeStyle = '#fff3c0'; ctx.lineWidth = 4; ctx.stroke(); ctx.restore(); }
        confettiGrid(ctx, [dx - 230, -260, dx - 40, -20], u, true, 'apl');
      }
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // MANNEQUIN JUDGE (black_bar_inquisitor, elite, l). Echowake rig: BLACK-BAR INQUISITOR (keeps the seated presence and the gavel strike, now the
  // buzzer). A smiling porcelain mannequin with a perfect side parting and a pastel suit, seated in a tall judge's chair on chrome wheels behind a
  // pastel desk, three blank score cards fanned in one hand (stars, never numbers) and a big red buzzer under the other; it never stops smiling.
  // Always generic: no real judge. Accent: the buzzer red.
  // ---------------------------------------------------------------------------------------------------------------
  const JDG = { hy: -224 };
  define('black_bar_inquisitor', {
    size: 'l',
    col: { skin: G.porcelain, hair: '#efe9fb', suit: G.lilac, shirt: '#ffffff', tie: G.mint, chair: '#ddd2f6', desk: G.mint, trim: G.chromeL, card: '#ffffff', star: G.blush, wheel: '#c9c3df' },
    real: { skin: '#ffd2b4', hair: '#5a3a2a', suit: '#8b4dff', shirt: '#fff8ec', tie: '#3fcf6a', chair: '#ff7eb6', desk: '#2ec4b6', trim: '#ffc94d', card: '#fff8ec', star: '#ff8a1f', wheel: '#5a2f8a' },
    bounds: { w: 230, h: 258, head: { x: 0, y: -250 }, body: { x: 0, y: -140 }, feet: { x: 0, y: 0 } },
    dieBox: [-104, -258, 104, 0],
    sweep: [-50, -200],
    hop: 12,
    parts: {
      chair: {
        box: [-60, -262, 60, 4], pivot: [0, -90],
        draw(S) {
          // the star base on wheels, the stem, the tall back
          [[-44, -6], [44, -6], [0, -2]].forEach((w) => { S.limb([0, -22], [w[0], w[1] - 6], 7, S.c.trim); S.ell(w[0], w[1], 7, 6, S.c.wheel, { hi: true }); });
          S.cel(RR(-5, -92, 10, 72, 4), S.c.trim, { hi: true });
          S.cel(RR(-50, -258, 100, 150, 30), S.c.chair, { hi: '#ffffff', hiW: 3 });
          [[-22, -226], [22, -226], [0, -196], [-22, -166], [22, -166]].forEach((b) => S.ell(b[0], b[1], 3, 3, RJ.shade(S.c.chair, 0.12), { shadow: false, line: S.L * 0.5 }));
        },
      },
      body: {
        box: [-44, -206, 44, -100], pivot: [0, -110],
        draw(S) {
          S.cel(sym([[0, -200], [-26, -198], [-38, -186], [-40, -140], [-36, -110], [0, -106]]), S.c.suit, { hi: true });
          S.cel(sym([[0, -200], [-12, -200], [-6, -160], [0, -150]]), S.c.shirt, { shadow: false, line: S.L * 0.7 });
          S.cel([[-4, -196], [4, -196], [6, -164], [0, -154], [-6, -164]], S.c.tie, { hi: true, tension: 0.2 });
          [-1, 1].forEach((sd) => S.cel([[sd * 12, -200], [sd * 26, -196], [sd * 14, -170], [sd * 6, -160]], RJ.shade(S.c.suit, 0.05), { shadow: false, tension: 0.2, line: S.L * 0.7 }));
        },
      },
      head: {
        box: [-38, -262, 38, -192], pivot: [0, -198],
        draw(S) {
          S.limb([0, -202], [0, -194], 12, S.c.skin);
          S.cel(E(0, JDG.hy, 25, 27, 22), S.c.skin, { shadow: RJ.shade(S.c.skin, 0.05) });
          // the sculpted hair with its perfect side parting
          S.cel([[-28, -224], [-30, -242], [-18, -254], [6, -256], [26, -246], [30, -228], [26, -224], [20, -238], [4, -244], [-10, -240], [-14, -236], [-22, -232]], S.c.hair, { hi: '#ffffff', hiW: 3, tension: 0.4 });
          RJ.ink(S.g, [[-12, -252], [-14, -238]], { w: 1.4, color: S.lc, taper: 0.3, wobble: 0, alpha: 0.7 });
        },
      },
      desk: {
        box: [-96, -134, 96, 2], pivot: [0, -110],
        draw(S) {
          [-1, 1].forEach((sd) => S.limb([sd * 72, -60], [sd * 74, -4], 8, S.c.trim));
          S.cel(RR(-88, -112, 176, 60, 10), S.c.desk, { hi: '#ffffff', hiW: 3, decor(g) { g.strokeStyle = tk.rgba('#ffffff', 0.7); g.lineWidth = 2; g.strokeRect(-74, -100, 148, 36); } });
          S.cel(RR(-94, -122, 188, 12, 5), S.c.trim, { hi: '#ffffff' });
        },
      },
      buzzer: {
        box: [-58, -152, -14, -112], pivot: [-36, -120],
        draw(S) {
          S.cel(RR(-54, -126, 36, 8, 3), S.c.trim, { hi: true });
          S.cel(tk.arcPts(-36, -126, 15, 18, PI, TAU, 12), S.real ? '#ff2a4a' : G.accent, { hi: '#ffb3c0', hiW: 3, tension: 0.4 });
        },
      },
      handB: {
        box: [-64, -170, -6, -118], pivot: [-28, -170],
        draw(S) { S.limb([-30, -184], [-36, -146], 14, S.c.suit); RJ.hand(S.g, 'open', -36, -144, PI / 2 + 0.1, { skin: S.c.skin, shade: RJ.shade(S.c.skin, 0.06) }); },
      },
      cards: {
        box: [6, -226, 84, -126], pivot: [30, -180],
        draw(S) {
          S.limb([30, -184], [40, -150], 14, S.c.suit);
          [-0.4, 0, 0.4].forEach((a, i) => {
            S.g.save(); S.g.translate(46, -150); S.g.rotate(a);
            S.cel(RR(-13, -62, 26, 40, 4), S.c.card, { shadow: RJ.shade(S.c.card, 0.06) });
            const sx = 0, sy = -42, r = 7;
            const star = []; for (let k = 0; k < 10; k++) { const aa = -PI / 2 + k * PI / 5, rr = k % 2 ? r * 0.45 : r; star.push([sx + cos(aa) * rr, sy + sin(aa) * rr, 1]); }
            S.cel(star, i === 1 ? S.c.star : RJ.tint(S.c.star, 0.3), { shadow: false, tension: 0, line: S.L * 0.6 });
            S.g.restore();
          });
          RJ.hand(S.g, 'fist', 46, -150, -PI / 2, { skin: S.c.skin, shade: RJ.shade(S.c.skin, 0.06) });
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, atk = E0.pose === 'attack', p = atk ? E0.p : 0;
      const br = sin(t * 1.3) * m;
      const raise = clamp((atk ? E0.wind : 0) + tele, 0, 1), slam = atk ? E0.strike : 0;
      // the chair rolls back on a hit and swivels a touch while it thinks
      const roll = hurt * 16 + E0.shake * 0.6;
      ctx.save();
      xform(ctx, 0, 0, roll, 0, 0, 1, 1);
      put(ctx, st, 'chair', { r: 0.01 * br });
      ctx.save();
      xform(ctx, 0, -110, 0, -2 * br * 0.5 - 2 * raise + 2 * slam, 0.03 * hurt - 0.04 * slam, 1, 1);
      put(ctx, st, 'body', { sy: 1 + 0.01 * br });
      put(ctx, st, 'head', {
        r: 0.03 * br - 0.06 * slam + 0.14 * hurt + 0.04 * tele, y: -1 * br,
        kids(c) {
          face(c, st, 0, JDG.hy + 2, { kind: 'round', w: 12, gap: 20, my: 14, sw: 13, iris: ['#7d6fb0', '#c9b8ff'], look: [-0.5 * raise - 0.3, 0.2] });
          crack(c, 14, JDG.hy - 22, 30, 'judge', hurt * 1.4);
          polite(c, st, -18, JDG.hy - 24, 5);
        },
      });
      // the score cards: lifted high for the Final Score (the buff), fanned in front for the guard
      put(ctx, st, 'cards', { r: -0.9 * buff - 0.5 * guard + 0.05 * br, y: -10 * buff, x: -20 * guard });
      ctx.restore();
      put(ctx, st, 'desk', {});
      const press = slam > 0.5 ? (slam - 0.5) * 2 : 0;
      put(ctx, st, 'buzzer', { sy: 1 - 0.3 * press });
      // the buzzer hand: hovering, lifted on the wind-up, SLAM on the strike
      put(ctx, st, 'handB', { r: -1.1 * raise + 0.25 * slam * (1 - raise) + 0.05 * br, y: -6 * raise + 6 * slam });
      ctx.restore();
      // the buzz: a red flash and buzz rings (the one place this Act turns properly saturated)
      if (!st.won && (press > 0.05 || (atk && p > 0.5 && p < 0.9))) {
        const u = atk ? clamp((p - 0.45) / 0.45, 0, 1) : 0;
        tk.glow(ctx, -36 + roll, -136, 50, G.accent, 0.6 * (1 - u));
        for (let i = 0; i < 3; i++) { const k = clamp(u * 1.3 - i * 0.15, 0, 1); if (k <= 0 || k >= 1) continue; ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = G.accent; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(-36 + roll, -136, 20 + 120 * k, 12 + 60 * k, 0, 0, TAU); ctx.stroke(); ctx.restore(); }
      }
      if (buff > 0.05) foe.sparkles(ctx, 40, -230, [[-20, -20, 7, 0], [30, 0, 6, 0.3], [0, 30, 5, 0.6]], 3, E0.buffP * 2);
    },
  });

  // ===============================================================================================================
  // SIDEKICKS (E3b)
  // ===============================================================================================================
  // the idol's hair, shared by Flawless and every Lip-Sync Clone (they are copies of her): a glossy silver-lilac fringe and cap, at scale k
  function idolHair(S, x, y, k, front) {
    const P = (pts) => pts.map((p) => [x + p[0] * k, y + p[1] * k].concat(p[2] ? [1] : []));
    if (!front) S.cel(P(sym([[0, -30], [-24, -26], [-30, -8], [-30, 14], [-22, 22], [-18, 4], [0, -4]])), S.c.hair, { hi: '#ffffff', hiW: 3 * k });
    else S.cel(P(sym([[0, -31], [-24, -26], [-30, -10], [-24, -6], [-16, -14], [-8, -8], [0, -12]])), S.c.hair, { hi: '#ffffff', hiW: 2.6 * k, tension: 0.4 });
  }
  // a mirror-ball mic (Flawless and her clones lip-sync into mirrors), head at (x, y), k scale
  function mirrorMic(S, x, y, k) {
    S.cel(RR(x - 3 * k, y + 4 * k, 6 * k, 20 * k, 3 * k), G.chromeL, { hi: true });
    S.cel(E(x, y, 8 * k, 8 * k, 16), S.c.ball || G.opal, { decor(g) { g.strokeStyle = 'rgba(120,124,156,0.5)'; g.lineWidth = 0.8; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(x - 9 * k, y + i * 3.2 * k); g.lineTo(x + 9 * k, y + i * 3.2 * k); g.stroke(); g.beginPath(); g.moveTo(x + i * 3.2 * k, y - 9 * k); g.lineTo(x + i * 3.2 * k, y + 9 * k); g.stroke(); } } });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // LIP-SYNC CLONE (blank_page, minion, s). Echowake rig: BLANK PAGE (keeps the small float). A tiny glossy copy of Flawless, exactly like the
  // one next to it: the same silver-lilac hair and high ponytail, a pastel chrome dress, a mirror mic held under the Gloss smile, hovering in
  // perfect time. Accent: the little red star on the dress.
  // ---------------------------------------------------------------------------------------------------------------
  define('blank_page', {
    size: 's',
    col: { skin: G.porcelain, hair: '#d6c9f6', dress: '#ffd6ea', boot: '#f6f2ff', ball: G.opal },
    real: { skin: '#ffd2b4', hair: '#6a3a8a', dress: '#ff4f8e', boot: '#ffd84d', ball: '#ffd84d' },
    bounds: { w: 92, h: 127, head: { x: 0, y: -108 }, body: { x: 0, y: -62 }, feet: { x: 0, y: 0 } },
    dieBox: [-40, -112, 40, -10],
    sweep: [-16, -80],
    hop: 10,
    parts: {
      tail: {
        box: [6, -118, 44, -64], pivot: [14, -104],
        draw(S) { RJ.lock(S.g, [[14, -104], [30, -112], [38, -94], [32, -72]], S.c.hair, { wMax: 13, w0: 9, w1: 3, line: S.L, lineColor: S.lc }); S.ell(16, -104, 5, 5, S.c.dress, { hi: true }); },
      },
      body: {
        box: [-26, -62, 26, -8], pivot: [0, -40],
        draw(S) {
          [-1, 1].forEach((sd) => { S.limb([sd * 6, -30], [sd * 7, -16], 7, S.c.skin); S.cel(RR(sd * 7 - 5, -18, 10, 9, 4), S.c.boot, { hi: true }); });
          S.cel(sym([[0, -58], [-10, -57], [-12, -46], [-20, -28], [0, -26]]), S.c.dress, { hi: '#ffffff', decor(g) { sequins(g, -20, -58, 40, 14, { d: 5, cols: [RJ.tint(S.c.dress, 0.4)], seed: 2 }); } });
          const sx = 7, sy = -36, star = [];
          for (let k = 0; k < 10; k++) { const a = -PI / 2 + k * PI / 5, r = k % 2 ? 1.6 : 3.6; star.push([sx + cos(a) * r, sy + sin(a) * r, 1]); }
          S.fill(star, S.real ? '#ff2a4a' : G.accent);
        },
      },
      head: {
        box: [-30, -110, 30, -54], pivot: [0, -58],
        draw(S) {
          idolHair(S, 0, -82, 0.82, false);
          S.cel(E(0, -80, 19, 20, 20), S.c.skin, { shadow: RJ.shade(S.c.skin, 0.05) });
          idolHair(S, 0, -82, 0.82, true);
        },
      },
      mic: {
        box: [-16, -70, 16, -36], pivot: [0, -46],
        draw(S) { [-1, 1].forEach((sd) => S.limb([sd * 10, -47], [sd * 4, -48], 6, S.c.skin)); mirrorMic(S, 0, -54, 0.75); S.blob([{ e: [0, -44, 6, 5] }], S.c.skin); },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, atk = E0.pose === 'attack';
      const fl = sin(t * 2.4) * 4 * m;
      const lunge = atk ? E0.strike : 0;
      const dx = -lunge * 20 + hurt * 12 + E0.shake, dy = fl - 6 - 3 * tele + 2 * guard;
      tk.glow(ctx, 0, -6, 22, st.won ? '#ffd84d' : G.blush, 0.4);
      ctx.save();
      xform(ctx, 0, -40, dx, dy, -0.12 * lunge + 0.14 * hurt + 0.05 * sin(t * 2.4) * m * 0, 1, 1);
      put(ctx, st, 'tail', { r: 0.12 * sin(t * 2.4 + 0.6) * m + 0.4 * tele - 0.3 * lunge });
      put(ctx, st, 'body', { sy: 1 + 0.02 * sin(t * 2.4) * m });
      put(ctx, st, 'head', {
        r: -0.08 * lunge + 0.15 * hurt - 0.06 * tele,
        kids(c) {
          face(c, st, 0, -80, { kind: 'round', w: 10, gap: 16, my: 11, sw: 9, iris: ['#7d6fb0', '#c9b8ff'], look: [-0.5, 0] });
          crack(c, 6, -96, 20, 'clone', hurt * 1.4);
          polite(c, st, -12, -96, 4);
        },
      });
      // Copy Your Moves: the mic swings out for the slap, up to the face on the wind-up
      put(ctx, st, 'mic', { r: -0.9 * lunge + 0.3 * guard, y: -4 * tele, x: -6 * lunge });
      ctx.restore();
      if (buff > 0.05) foe.sparkles(ctx, 0, -70, [[-26, -20, 4, 0], [24, -26, 4, 0.4]], 3, E0.buffP * 2);
      if (guard > 0.05) pitchRing(ctx, dx, -60, 40, 48, 2, 10, G.blush, guard, t * 6);
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // CONFETTI POPPER (spark_mote, minion, s). Echowake rig: SPARK MOTE (keeps the big eyes and the one-shot burst). A little striped party-popper
  // cone in lemon, mint and blush with big shiny eyes and the Gloss smile, a frill round its open top with confetti peeking out, and a pull
  // string with a ring. It has exactly one thing to say, and it says it with perfectly square confetti. Accent: the red pull ring.
  // ---------------------------------------------------------------------------------------------------------------
  define('spark_mote', {
    size: 's',
    col: { a: G.lemon, b: G.mint, c: G.blush, frill: '#ffffff', string: '#c9cbd6' },
    real: { a: '#ffd84d', b: '#3fcf6a', c: '#ff6fb5', frill: '#7cc6ff', string: '#8b4dff' },
    bounds: { w: 92, h: 104, head: { x: 0, y: -100 }, body: { x: 0, y: -60 }, feet: { x: 0, y: 0 } },
    dieBox: [-40, -100, 40, -10],
    sweep: [-14, -80],
    hop: 10,
    parts: {
      string: {
        box: [-8, -30, 8, 2], pivot: [0, -26],
        draw(S) { S.line([[0, -28], [1, -18], [0, -11]], { w: 1.8, taper: 0 }); S.g.save(); S.g.lineWidth = 2.6; S.g.strokeStyle = S.lc; S.g.beginPath(); S.g.arc(0, -6, 5, 0, TAU); S.g.stroke(); S.g.lineWidth = 1.4; S.g.strokeStyle = S.real ? '#ff2a4a' : G.accent; S.g.stroke(); S.g.restore(); },
      },
      cone: {
        box: [-38, -100, 38, -20], pivot: [0, -24],
        draw(S) {
          const cone = [[0, -24, 1], [-30, -86], [-26, -92], [26, -92], [30, -86]];
          S.cel(cone, S.c.a, { tension: 0.12, hi: '#ffffff', hiW: 3,
            decor(g) { [S.c.b, S.c.c].forEach((col, i) => { g.fillStyle = col; for (let k = -1; k < 4; k++) { const y0 = -92 + k * 24 + i * 12; g.beginPath(); g.moveTo(-40, y0 + 14); g.lineTo(40, y0 - 4); g.lineTo(40, y0 + 2); g.lineTo(-40, y0 + 20); g.closePath(); g.fill(); } }); } });
          // confetti peeking out of the top, and the frill
          [[-14, -98, G.mint], [0, -101, G.blush], [13, -98, G.lilac], [-6, -95, G.lemon], [7, -96, G.mint]].forEach((q, i) => { S.g.save(); S.g.translate(q[0], q[1]); S.g.rotate(0); S.g.fillStyle = S.real ? REAL[i % REAL.length] : q[2]; S.g.fillRect(-3.5, -3.5, 7, 7); S.g.strokeStyle = S.lc; S.g.lineWidth = 1; S.g.strokeRect(-3.5, -3.5, 7, 7); S.g.restore(); });
          const fr2 = [];
          for (let i = 0; i <= 12; i++) fr2.push([-30 + i * 5, -90 + (i % 2 ? -5 : 0), 1]);
          S.cel(fr2.concat([[30, -86, 1], [-30, -86, 1]]), S.c.frill, { shadow: false, tension: 0 });
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, atk = E0.pose === 'attack', p = atk ? E0.p : 0;
      const bob = Math.abs(sin(t * 3)) * 5 * m;
      const squash = 0.12 * tele + (atk ? 0.15 * E0.wind : 0), pop = atk ? E0.strike : 0;
      const dx = hurt * 12 + E0.shake + 6 * pop, dy = -bob + 3 * squash * 20 / 3 + 2 * guard;
      ctx.save();
      xform(ctx, 0, -24, dx, dy, 0.25 * pop + 0.18 * hurt - 0.1 * tele, 1 + squash * 0.6 - 0.06 * guard, 1 - squash + 0.04 * pop);
      put(ctx, st, 'string', { r: 0.2 * sin(t * 3 + 1) * m - 0.3 * pop });
      put(ctx, st, 'cone', {
        kids(c) {
          face(c, st, 0, -66, { kind: 'round', w: 15, gap: 22, my: 16, sw: 12, iris: ['#6d7196', '#b9bde0'], look: [-0.4, 0] });
          crack(c, 10, -84, 22, 'popper', hurt * 1.4);
          polite(c, st, -16, -80, 4);
        },
      });
      ctx.restore();
      // the one-shot burst: perfectly square confetti fanning at the heroes
      if (atk && p > 0.3) {
        const u = clamp((p - 0.3) / 0.6, 0, 1);
        tk.glow(ctx, -20 + dx, -96, 30, '#ffffff', 0.7 * (1 - u));
        for (let i = 0; i < 16; i++) {
          const a = PI * 1.15 + (hv('pop', 'a' + i) - 0.5) * 1.1, d = 20 + 120 * u * (0.5 + hv('pop', 'd' + i)), x = -10 + dx + cos(a) * d, y = -96 + sin(a) * d + 50 * u * u;
          ctx.save(); ctx.globalAlpha = 1 - u * u; ctx.translate(x, y); ctx.rotate((hv('pop', 'r' + i) - 0.5) * 6 * u);
          ctx.fillStyle = [G.lemon, G.mint, G.blush, G.lilac][i % 4]; ctx.fillRect(-3.5, -3.5, 7, 7); ctx.strokeStyle = G.line; ctx.lineWidth = 1; ctx.strokeRect(-3.5, -3.5, 7, 7); ctx.restore();
        }
      }
      if (buff > 0.05) foe.sparkles(ctx, 0, -60, [[-26, -20, 4, 0], [24, -26, 4, 0.4]], 3, E0.buffP * 2);
      if (guard > 0.05) pitchRing(ctx, dx, -58, 40, 44, 2, 10, G.lemon, guard, t * 6);
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // PITCH GLITCH (typo_sprite, minion, s). Echowake rig: TYPO SPRITE (keeps the small square body and the glitchy face; the keycap became a pixel
  // block). A small square pixel block that jitters between two positions, magenta and cyan colour fringing on its edges, square pixel eyes,
  // the Gloss smile drawn in pixel steps, little pixel feet. Accent: the magenta fringe.
  // ---------------------------------------------------------------------------------------------------------------
  define('typo_sprite', {
    size: 's',
    col: { block: G.opal, shade: G.lilac, foot: '#d9d4ea', eye: '#5a5f7a' },
    real: { block: '#7cc6ff', shade: '#3d7bff', foot: '#ffd84d', eye: '#22264a' },
    bounds: { w: 92, h: 104, head: { x: 0, y: -100 }, body: { x: 0, y: -60 }, feet: { x: 0, y: 0 } },
    dieBox: [-40, -100, 40, 0],
    sweep: [-14, -80],
    hop: 10,
    film: 0.7,
    parts: {
      block: {
        box: [-38, -98, 38, -12], pivot: [0, -40],
        draw(S) {
          [-1, 1].forEach((sd) => S.cel(RR(sd * 13 - 7, -30, 14, 12, 2), S.c.foot, { hi: true, tension: 0 }));
          const box = RR(-29, -94, 58, 58, 10);
          if (!S.real) { S.g.save(); S.g.globalAlpha = 0.7; S.g.fillStyle = '#ff4fd8'; S.g.beginPath(); tk.trace(S.g, tk.xf(box, { dx: -4 })); S.g.fill(); S.g.fillStyle = '#4fe3ff'; S.g.beginPath(); tk.trace(S.g, tk.xf(box, { dx: 4 })); S.g.fill(); S.g.restore(); }
          S.cel(box, S.c.block, { hi: '#ffffff', hiW: 3, decor(g) { g.fillStyle = tk.rgba(S.c.shade, 0.6); g.fillRect(-29, -48, 58, 12); g.fillRect(17, -94, 12, 58); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillRect(-23, -88, 8, 8); } });
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, atk = E0.pose === 'attack', p = atk ? E0.p : 0;
      // the jitter between two positions (faster on the wind-up), a hop in pixel steps
      const jt = st.won ? 0 : (Math.floor(t * (4 + 10 * tele)) % 2 ? 3 : -3) * (m > 0.5 ? 1 : 0.4);
      const hop = Math.round(Math.abs(sin(t * 2.6)) * 3 * m) * 2;
      const poke = atk ? E0.strike : 0;
      const dx = jt - poke * 22 + hurt * 12 + E0.shake, dy = -hop + 2 * guard - 4 * tele;
      ctx.save();
      xform(ctx, 0, -40, dx, dy, 0.18 * hurt - 0.12 * poke, 1 - 0.06 * guard, 1 + 0.04 * buff);
      put(ctx, st, 'block', {
        kids(c) {
          const lc = st.won ? REAL_LINE : G.line;
          if (st.won) face(c, st, 0, -70, { kind: 'dot', w: 10, gap: 20, my: 16, sw: 14 });
          else {
            const open = hurt > 0.45 ? 0.25 : blink(t, 'pitch', 2.8);
            c.fillStyle = lc;
            [-1, 1].forEach((sd) => c.fillRect(sd * 10 - 3.5, -74 + (1 - open) * 4, 7, Math.max(1.5, 9 * open)));
            // the Gloss smile in pixel steps
            const px = [[-9, -58], [-6, -55], [-3, -54], [0, -54], [3, -54], [6, -55], [9, -58]];
            px.forEach((q) => c.fillRect(q[0] - 1.6, q[1] - 1.6, 3.2, 3.2));
          }
          crack(c, 12, -88, 22, 'glitch', hurt * 1.4);
          polite(c, st, -16, -84, 4);
        },
      });
      ctx.restore();
      if ((atk && p > 0.35 && p < 0.9) || tele > 0.3) {
        const u = atk ? (p - 0.35) / 0.55 : fr(t * 1.5);
        for (let i = 0; i < 7; i++) { const x = dx - 30 - 90 * u * (0.5 + hv('ptg', 'd' + i)), y = -66 + (hv('ptg', 'y' + i) - 0.5) * 50; ctx.save(); ctx.globalAlpha = (1 - u) * (atk ? 1 : tele); ctx.fillStyle = ['#ff4fd8', '#4fe3ff', '#b6ff4f'][i % 3]; ctx.fillRect(Math.round(x), Math.round(y), 6, 6); ctx.restore(); }
      }
      if (buff > 0.05) foe.sparkles(ctx, 0, -60, [[-26, -20, 4, 0], [24, -26, 4, 0.4]], 3, E0.buffP * 2);
      if (guard > 0.05) pitchRing(ctx, dx, -62, 40, 44, 2, 10, G.lilac, guard, t * 6);
    },
  });

  // ===============================================================================================================
  // FLAWLESS, STAR OF THE PERFECT STAGE (boss_editor, Headliner, xl): E3c. Echowake rig: THE CONDUCTOR (keeps the three-form structure, prefixes p0
  // p1 p2 with one rig per phase, the slender stance of phase 0, the bulk of phase 1 and the sky-filling face of phase 2). One spec holds the
  // parts of all three forms; the registered rig dispatches on st.phase (HV_ENEMIES 5.3, bible 2.4 and 2.5).
  //   phase 0, FLAWLESS: a slender pop idol in pastel chrome, perfectly symmetrical, lip-syncing into a mirror mic held in both hands, a high
  //     silver-lilac ponytail, a sequin bodice and a flared chrome skirt, white boots, the Gloss smile, a ring of backing light bulbs behind her.
  //     The telegraph is a hair flip; the attack a perfect pose. Accent: one red star on the bodice.
  //   phase 1, THE FILTER: the idol's face has folded back into a huge ring-light lens with a soft-focus glow (calm closed eyes and the Gloss smile
  //     only a faint reflection in the glass), two long selfie-stick arms with phone hands, the body a column of chrome on a flared base, the art
  //     word FLAWLESS! across a blush band on the chest, little filter chips orbiting. Low on HP, real colour cracks through the chrome.
  //   phase 2, THE GLOSS: the force itself, a sky-filling smooth oval mirror face in a chrome frame, eyes and an open mouth as calm slits of light
  //     (no sound), the mirror showing the two heroes as perfect pastel copies with no motion lines, opal drapes and mirror shards drifting round
  //     it. No darkness, no menace: too clean. Low on HP, the mirror cracks with real colour.
  //   The win-over of every form ends the same way: left floating is a tiny shy round lens with a nervous smile, the very first little filter,
  //   and it wobbles a single crooked note before the curtain. Phase 2's win-over first crazes the mirror into soft sparkles.
  // ===============================================================================================================
  const BE_P = {}, BE_C = {}, BE_RIG = [];
  const BEC = { cy0: -205, R0: 128, hy: -290 };
  // ---- phase 0: Flawless
  BE_P.p0_track = {
    box: [-136, -341, 136, -69], pivot: [0, BEC.cy0], film: false,
    draw(S) { S.g.save(); S.g.lineWidth = 7; S.g.strokeStyle = tk.rgba(S.lc, 0.55); S.g.beginPath(); S.g.arc(0, BEC.cy0, BEC.R0, 0, TAU); S.g.stroke(); S.g.lineWidth = 3.5; S.g.strokeStyle = S.real ? '#ffc94d' : G.chromeL; S.g.stroke(); S.g.restore(); },
  };
  BE_P.p0_bulb = {
    box: [-10, -10, 10, 10], pivot: [0, 0],
    draw(S) { S.cel(E(0, 0, 8, 8, 14), S.real ? '#ffd84d' : '#fffbe6', { hi: '#ffffff', line: S.L * 0.7 }); },
  };
  const p0Leg = (sd) => ({
    box: [sd < 0 ? -40 : -4, -158, sd < 0 ? 4 : 40, 4], pivot: [sd * 14, -150],
    draw(S) {
      S.limb([sd * 14, -152], [sd * 16, -96], 17, S.c.skin);
      S.cel(sym([[0, -100], [-11, -99], [-12, -60], [-12, -16], [-20, -10], [-21, -2], [0, -1]]).map((p) => [p[0] + sd * 17, p[1]].concat(p[2] ? [1] : [])), S.c.boot, { hi: '#ffffff', hiW: 3 });
      S.cel(RR(sd * 17 - 12, -104, 24, 8, 4), S.c.chromeT, { hi: true });
    },
  });
  BE_P.p0_legL = p0Leg(-1);
  BE_P.p0_legR = p0Leg(1);
  BE_P.p0_torso = {
    box: [-40, -240, 40, -168], pivot: [0, -176],
    draw(S) {
      S.cel(sym([[0, -234], [-26, -232], [-32, -220], [-26, -196], [-22, -176], [0, -174]]), S.c.bodice, { hi: '#ffffff', hiW: 3, decor(g) { sequins(g, -34, -236, 68, 64, { d: 6.5, cols: [S.c.bodice, RJ.tint(S.c.bodice, 0.4), S.c.bodice2], seed: 12 }); } });
      S.cel(sym([[0, -236], [-16, -236], [-12, -228], [0, -224]]), S.c.skin, { shadow: false, line: S.L * 0.7 });
      S.cel(RR(-24, -182, 48, 8, 4), S.c.chromeT, { hi: true });
      const sx = 12, sy = -206, star = [];
      for (let k = 0; k < 10; k++) { const a = -PI / 2 + k * PI / 5, r = k % 2 ? 2.6 : 6; star.push([sx + cos(a) * r, sy + sin(a) * r, 1]); }
      S.cel(star, S.real ? '#ff2a4a' : G.accent, { shadow: false, tension: 0, line: S.L * 0.5 });
    },
  };
  const p0Arm = (sd) => ({
    box: [sd < 0 ? -58 : -10, -248, sd < 0 ? 10 : 58, -184], pivot: [sd * 28, -226],
    draw(S) {
      S.limb([sd * 28, -226], [sd * 42, -196], 12, S.c.skin);
      S.limb([sd * 42, -196], [sd * 12, -240], 11, S.c.skin);
      S.cel(RR(sd * 30 - 7, -224, 14, 9, 4), S.c.chromeT, { hi: true });
      S.blob([{ e: [sd * 9, -242, 8, 7.5] }], S.c.skin);
    },
  });
  BE_P.p0_armL = p0Arm(-1);
  BE_P.p0_armR = p0Arm(1);
  BE_P.p0_mic = {
    box: [-14, -262, 14, -216], pivot: [0, -236],
    draw(S) { mirrorMic(S, 0, -250, 1.15); },
  };
  BE_P.p0_head = {
    box: [-52, -342, 52, -240], pivot: [0, -246],
    draw(S) {
      S.limb([0, -254], [0, -240], 13, S.c.skin);
      idolHair(S, 0, BEC.hy - 2, 1.45, false);
      S.cel(E(0, BEC.hy, 31, 33, 26), S.c.skin, { shadow: RJ.shade(S.c.skin, 0.05) });
      idolHair(S, 0, BEC.hy - 2, 1.45, true);
      S.ell(26, BEC.hy + 10, 4, 4, S.c.bodice2, { hi: true, line: S.L * 0.6 });
    },
  };
  BE_C.p0_tail = {
    spine: [[14, -328], [42, -344], [70, -334], [86, -306], [88, -270]], cuts: [0.28, 0.55, 0.8], reach: 50, overlap: 5,
    draw(S) {
      RJ.lock(S.g, [[14, -328], [42, -344], [70, -334], [86, -306], [88, -270]], S.c.hair, { wMax: 30, w0: 18, w1: 6, line: S.L, lineColor: S.lc, glossColor: '#ffffff' });
      S.ell(16, -328, 9, 8, S.c.bodice, { hi: true });
    },
  };
  BE_C.p0_skirt = {
    spine: [[0, -180], [0, -160], [0, -136]], cuts: [0.5], reach: 70, overlap: 4,
    draw(S) {
      const hem = [];
      for (let i = 0; i <= 10; i++) hem.push([-62 + i * 12.4, -134 + (i % 2 ? -5 : 2)]);
      const shape = [[-24, -180], [24, -180], [44, -160], [62, -136]].concat(hem.slice().reverse().slice(1, -1)).concat([[-62, -136], [-44, -160]]);
      S.chrome(shape, { base: S.real ? '#8b4dff' : G.lilac, horizon: 0.65, tension: 0.3 });
      S.g.save(); S.g.strokeStyle = tk.rgba(S.lc, 0.35); S.g.lineWidth = 1.2;
      [-36, -12, 12, 36].forEach((x) => { S.g.beginPath(); S.g.moveTo(x * 0.5, -176); S.g.lineTo(x * 1.4, -138); S.g.stroke(); });
      S.g.restore();
    },
  };
  BE_RIG[0] = function (ctx, st) {
    const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, atk = E0.pose === 'attack', p = atk ? E0.p : 0;
    const br = sin(t * 1.5) * m, beat = Math.abs(sin(t * PI * 1.2)) * m;
    const pose = atk ? E0.strike : 0, wind = atk ? E0.wind : 0;
    const dx = -12 * pose + hurt * 16 + E0.shake, dy = -beat * 3 + 2 * guard;
    // the ring of backing light: a perfect chase
    put(ctx, st, 'p0_track', { a: 0.9 });
    for (let i = 0; i < 12; i++) {
      const a = -PI / 2 + i * TAU / 12, x = cos(a) * BEC.R0, y = BEC.cy0 + sin(a) * BEC.R0, lit = st.won ? 0.7 : 0.45 + 0.55 * (0.5 + 0.5 * sin(t * 4 - i * 0.9)) * (1 - tele) + tele;
      tk.glow(ctx, x, y, 16 + 10 * lit, st.won ? '#ffd84d' : '#fff6d0', 0.55 * lit);
      put(ctx, st, 'p0_bulb', { x, y });
    }
    ctx.save();
    xform(ctx, 0, -150, dx, dy, 0.1 * pose + 0.06 * wind + 0.1 * hurt, 1, 1);
    put(ctx, st, 'p0_legL', { r: 0.04 * beat - 0.1 * pose + 0.05 * guard });
    put(ctx, st, 'p0_legR', { r: -0.04 * beat + 0.08 * pose - 0.05 * guard });
    // the hair flip (the telegraph): the ponytail whips up and over
    const flip = tele + 0.6 * buff;
    const tb = [0.04 * br - 0.5 * flip + 0.15 * hurt + 0.1 * pose, 0.08 * sin(t * 1.5 - 0.7) * m - 0.4 * flip, 0.1 * sin(t * 1.5 - 1.4) * m - 0.3 * flip + 0.15 * wind];
    putChain(ctx, st, 'p0_tail', tb);
    putChain(ctx, st, 'p0_skirt', [0.03 * br + 0.06 * hurt - 0.05 * pose, 0.06 * sin(t * 1.5 - 0.6) * m + 0.08 * pose]);
    put(ctx, st, 'p0_torso', { sy: 1 + 0.01 * br });
    // the arms: both hands at the mirror mic (symmetric); the perfect pose flings the near arm out at the heroes
    put(ctx, st, 'p0_armR', { r: 0.03 * br + 0.3 * guard - 0.1 * buff });
    put(ctx, st, 'p0_mic', { y: -2 * beat, r: 0.04 * hurt, x: 2 * pose });
    put(ctx, st, 'p0_head', {
      r: 0.03 * br + 0.12 * hurt - 0.06 * pose + 0.08 * flip * sin(t * 9), y: -1.5 * beat,
      kids(c) {
        face(c, st, 0, BEC.hy + 2, { kind: 'round', w: 15, gap: 26, my: 19, sw: 13, iris: ['#7d6fb0', '#c9b8ff'], look: [-0.4 * pose - 0.3 * tele, 0] });
        crack(c, 12, BEC.hy - 28, 34, 'flawless0', hurt * 1.4);
        polite(c, st, -22, BEC.hy - 24, 6);
      },
    });
    put(ctx, st, 'p0_armL', { r: -0.03 * br - 2.6 * pose + 0.6 * wind - 0.3 * guard + 0.1 * buff });
    ctx.restore();
    // the camera flash of a perfect pose
    if (atk && p > 0.42 && p < 0.85) {
      const u = (p - 0.42) / 0.43, hx = -90 + dx, hy = -232;
      tk.glow(ctx, hx, hy, 70, '#ffffff', 0.8 * (1 - u));
      ctx.save(); ctx.globalAlpha = 1 - u; ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(hx - 200 * (0.3 + u), hy); ctx.lineTo(hx, hy - 4); ctx.lineTo(hx + 10, hy); ctx.lineTo(hx, hy + 4); ctx.closePath(); ctx.fill(); ctx.restore();
      foe.sparkles(ctx, hx - 60, hy, [[-30, -30, 8, 0], [-60, 20, 6, 0.3], [-10, 30, 5, 0.6]], 3, u * 2);
    }
    if (buff > 0.05) foe.sparkles(ctx, 0, -230, [[-80, -60, 8, 0], [80, -40, 7, 0.3], [-40, 60, 6, 0.6], [60, 70, 6, 0.8]], 3, E0.buffP * 2);
    if (guard > 0.05) pitchRing(ctx, dx, -190, 90, 150, 3, 18, G.blush, guard, t * 5);
  };

  // ---- phase 1: the Filter
  const BF = { ly: -292, lr: 60 };
  BE_P.p1_base = {
    box: [-116, -76, 116, 4], pivot: [0, -40],
    draw(S) { S.chrome(sym([[0, -70], [-66, -70], [-80, -48], [-104, -18], [-112, -4], [-104, 0], [0, 0]]), { horizon: 0.5, base: S.real ? '#8b4dff' : '#e9e3fb' }); S.cel(E(0, -70, 66, 10, 24), S.real ? '#ffc94d' : G.blush, { hi: true }); },
  };
  BE_P.p1_column = {
    box: [-84, -262, 84, -60], pivot: [0, -70],
    draw(S) {
      S.chrome(sym([[0, -250], [-54, -248], [-62, -236], [-56, -150], [-62, -76], [0, -70]]), { horizon: 0.72, base: S.real ? '#6fb8ff' : '#e4dcfa' });
      S.g.save(); S.g.strokeStyle = tk.rgba(S.lc, 0.28); S.g.lineWidth = 1.6;
      [-36, -18, 0, 18, 36].forEach((x) => { S.g.beginPath(); S.g.moveTo(x, -170); S.g.lineTo(x * 1.06, -82); S.g.stroke(); });
      S.g.restore();
      [-1, 1].forEach((sd) => S.ell(sd * 62, -234, 17, 16, S.real ? '#7cc6ff' : G.chromeL, { hi: '#ffffff' }));
      S.cel(E(0, -250, 34, 10, 22), S.real ? '#ffc94d' : G.chromeL, { hi: '#ffffff' });
    },
  };
  BE_P.p1_band = {
    box: [-76, -220, 76, -176], pivot: [0, -198],
    draw(S) {
      S.cel(RR(-72, -214, 144, 32, 8), S.real ? '#ff4f8e' : G.blush, { hi: '#ffffff', hiW: 2.4 });
      const g = S.g;
      g.save(); g.font = '900 23px ' + tk.font.num; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      g.lineWidth = 5; g.strokeStyle = S.lc; g.strokeText('FLAWLESS!', 0, -197);
      g.fillStyle = S.real ? '#fff6d0' : '#ffffff'; g.fillText('FLAWLESS!', 0, -197);
      g.restore();
    },
  };
  BE_P.p1_ring = {
    box: [-66, -358, 66, -226], pivot: [0, BF.ly],
    draw(S) { ringLight(S, 0, BF.ly, BF.lr, { inner: 0.64, leds: 20 }); },
  };
  BE_P.p1_lens = {
    box: [-42, -334, 42, -250], pivot: [0, BF.ly],
    draw(S) {
      const g = S.g, r = BF.lr * 0.64;
      S.cel(E(0, BF.ly, r, r, 26), S.real ? '#7cc6ff' : G.chromeL, { hi: '#ffffff' });
      S.cel(E(0, BF.ly, r * 0.8, r * 0.8, 24), S.real ? '#2d6fd8' : '#d5ccf2', { shadow: false,
        decor(gg) {
          const gr = gg.createRadialGradient(-6, BF.ly - 8, 2, 0, BF.ly, r * 0.8);
          gr.addColorStop(0, S.real ? '#bfe9ff' : '#ffffff'); gr.addColorStop(0.5, S.real ? '#6fb8ff' : G.lilac); gr.addColorStop(1, S.real ? '#2d4fb0' : '#bfb3e6');
          gg.fillStyle = gr; gg.fillRect(-r, BF.ly - r, r * 2, r * 2);
          gg.strokeStyle = 'rgba(255,255,255,0.5)'; gg.lineWidth = 1.2;
          for (let i = 0; i < 6; i++) { const a = i * TAU / 6; gg.beginPath(); gg.moveTo(cos(a) * r * 0.32, BF.ly + sin(a) * r * 0.32); gg.lineTo(cos(a + 1.2) * r * 0.78, BF.ly + sin(a + 1.2) * r * 0.78); gg.stroke(); }
        } });
      g.save(); g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(-10, BF.ly - 12, 7, 4, -0.6, 0, TAU); g.fill(); g.restore();
    },
  };
  const p1Arm = (sd) => ({
    box: [sd < 0 ? -168 : 40, -290, sd < 0 ? -40 : 168, -196], pivot: [sd * 62, -234],
    draw(S) {
      S.limb([sd * 62, -234], [sd * 98, -212], 20, S.real ? '#7cc6ff' : G.chromeL);
      S.ell(sd * 98, -212, 11, 11, S.real ? '#ffc94d' : G.chromeL, { hi: true });
      S.limb([sd * 98, -212], [sd * 124, -244], 9, S.real ? '#ffc94d' : '#d9dae6');
      S.limb([sd * 124, -244], [sd * 146, -272], 6, S.real ? '#ffc94d' : '#d9dae6');
      S.ell(sd * 124, -244, 5, 5, S.real ? '#ff8a1f' : G.chromeL, { line: S.L * 0.6 });
    },
  });
  BE_P.p1_armL = p1Arm(-1);
  BE_P.p1_armR = p1Arm(1);
  const p1Phone = (sd) => ({
    box: [sd * 150 - 20, -304, sd * 150 + 20, -252], pivot: [sd * 148, -274],
    draw(S) {
      S.g.save(); S.g.translate(sd * 150, -280); S.g.rotate(sd * 0.5);
      S.cel(RR(-12, -20, 24, 40, 6), S.real ? '#2d2747' : '#9ea2bb', { hi: true });
      S.cel(RR(-9, -16, 18, 30, 3), S.real ? '#ffd84d' : G.mint, { shadow: false, line: S.L * 0.5,
        decor(g) { const gr = g.createLinearGradient(-9, -16, 9, 14); gr.addColorStop(0, S.real ? '#ff8a1f' : G.lilac); gr.addColorStop(1, S.real ? '#ffd84d' : G.blush); g.fillStyle = gr; g.fillRect(-9, -16, 18, 30); } });
      S.g.restore();
    },
  });
  BE_P.p1_phoneL = p1Phone(-1);
  BE_P.p1_phoneR = p1Phone(1);
  BE_P.p1_chip = {
    box: [-9, -9, 9, 9], pivot: [0, 0],
    draw(S) { S.cel(RR(-7, -7, 14, 14, 4), S.real ? '#ff6fb5' : G.opal, { shadow: false, line: S.L * 0.6, decor(g) { const gr = g.createLinearGradient(-7, -7, 7, 7); gr.addColorStop(0, S.real ? '#ffd84d' : G.lilac); gr.addColorStop(1, S.real ? '#ff6fb5' : G.mint); g.fillStyle = gr; g.fillRect(-7, -7, 14, 14); } }); },
  };
  // the real colour leaking through the Filter's chrome as it loses (hpPct): fixed spots, more of them as the wound grows
  const WOUND1 = [[-30, -150, 30], [34, -110, 26], [-20, -96, 22], [40, -170, 24], [-44, -230, 20], [20, -320, 24]];
  BE_RIG[1] = function (ctx, st) {
    const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, atk = E0.pose === 'attack', p = atk ? E0.p : 0;
    const br = sin(t * 1.2) * m;
    const swipe = atk ? E0.swing : 0, wind = atk ? E0.wind : 0;
    const dx = -10 * (atk ? E0.strike : 0) + hurt * 14 + E0.shake, dy = 2 * guard;
    // the soft-focus glow round the lens
    const soft = st.won ? 0.3 : 0.5 + 0.2 * sin(t * 2) * m + 0.4 * tele + 0.3 * (atk ? E0.strike : 0);
    ctx.save();
    xform(ctx, 0, -40, dx, dy, 0.06 * hurt, 1, 1);
    put(ctx, st, 'p1_base', {});
    // the selfie sticks: phones held up, swiping on the attack, both high for the telegraph, folded in for a guard
    const armL = 0.06 * br - 0.5 * tele + 1.1 * swipe - 0.4 * wind + 0.7 * guard + 0.2 * hurt;
    const armR = -0.06 * br + 0.5 * tele - 0.2 * swipe - 0.7 * guard - 0.15 * hurt;
    put(ctx, st, 'p1_armR', { r: armR, kids(c) { put(c, st, 'p1_phoneR', { r: 0.1 * sin(t * 2) * m }); } });
    put(ctx, st, 'p1_column', { sy: 1 + 0.012 * br, kids(c) {
      // real colour cracks: the Filter is losing its polish
      WOUND1.forEach((w, i) => { if (st.wound > i / WOUND1.length * 0.9) crack(c, w[0], w[1], w[2], 'bw1' + i, 0.85); });
      crack(c, -20, -160, 40, 'filterhit', hurt * 1.4);
    } });
    put(ctx, st, 'p1_band', { sy: 1 + 0.03 * buff });
    tk.glow(ctx, 0, BF.ly - 2 * br, 110, '#ffffff', 0.5 * soft);
    put(ctx, st, 'p1_ring', { y: -2 * br, r: 0.04 * hurt, sx: 1 + 0.04 * tele, sy: 1 + 0.04 * tele });
    put(ctx, st, 'p1_lens', {
      y: -2 * br, r: 0.25 * sin(t * 0.7) * m,
      kids(c) {
        c.save(); c.globalAlpha = st.won ? 1 : 0.55;
        face(c, st, 0, BF.ly - 4, { kind: 'round', w: 10, gap: 20, open: st.won ? 1 : 0, per: 99, my: 14, sw: 12 });
        c.restore();
        if (st.wound > 0.6) crack(c, 10, BF.ly - 30, 30, 'bw1lens', 0.9);
      },
    });
    tk.glow(ctx, 0, BF.ly - 2 * br, 46, '#ffffff', 0.35 * soft);
    put(ctx, st, 'p1_armL', { r: armL, kids(c) { put(c, st, 'p1_phoneL', { r: -0.1 * sin(t * 2) * m }); } });
    // the filter chips orbit the lens like thumbnails
    for (let i = 0; i < 8; i++) {
      const a = t * (0.5 + 0.8 * buff) * m + i * TAU / 8, x = cos(a) * 92, y = BF.ly + sin(a) * 30;
      put(ctx, st, 'p1_chip', { x, y: y - 2 * br, a: 0.5 + 0.5 * (sin(a) > 0 ? 1 : 0.6) });
    }
    polite(ctx, st, 40, BF.ly - 40, 8);
    ctx.restore();
    // the swipe: an airbrush arc wiped across the heroes; the lens flashes
    if (atk && p > 0.36 && p < 0.8) {
      const u = (p - 0.36) / 0.44;
      ctx.save(); ctx.globalAlpha = sin(PI * u) * 0.75; ctx.lineCap = 'round';
      ctx.strokeStyle = G.blush; ctx.lineWidth = 30; ctx.beginPath(); ctx.arc(-60 + dx, -230, 150, PI * (0.9 + 0.3 * u), PI * (1.25 + 0.3 * u)); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 12; ctx.stroke(); ctx.restore();
    }
    if (buff > 0.05) foe.sparkles(ctx, 0, -260, [[-90, -40, 8, 0], [90, -30, 7, 0.3], [0, -90, 8, 0.6]], 3, E0.buffP * 2);
    if (guard > 0.05) pitchRing(ctx, dx, -200, 120, 150, 3, 20, G.lilac, guard, t * 5);
  };

  // ---- phase 2: the Gloss
  const BG2 = { cy: -186, rx: 150, ry: 160 };
  BE_P.p2_frame = {
    box: [-158, -354, 158, -18], pivot: [0, BG2.cy],
    draw(S) {
      const g = S.g;
      g.save(); g.beginPath(); g.ellipse(0, BG2.cy, BG2.rx, BG2.ry, 0, 0, TAU); g.moveTo(BG2.rx - 16, BG2.cy); g.ellipse(0, BG2.cy, BG2.rx - 16, BG2.ry - 16, 0, 0, TAU, true);
      const gr = g.createLinearGradient(0, BG2.cy - BG2.ry, 0, BG2.cy + BG2.ry);
      gr.addColorStop(0, S.real ? '#ffe9a8' : '#ffffff'); gr.addColorStop(0.5, S.real ? '#ffc94d' : G.chrome); gr.addColorStop(0.52, S.real ? '#ff9a3a' : '#eceef5'); gr.addColorStop(1, S.real ? '#ffc94d' : '#b9bccd');
      g.fillStyle = gr; g.fill('evenodd');
      g.lineWidth = S.L; g.strokeStyle = S.lc; g.beginPath(); g.ellipse(0, BG2.cy, BG2.rx, BG2.ry, 0, 0, TAU); g.stroke();
      g.beginPath(); g.ellipse(0, BG2.cy, BG2.rx - 16, BG2.ry - 16, 0, 0, TAU); g.stroke();
      g.restore();
      [[0, BG2.cy - BG2.ry + 8], [0, BG2.cy + BG2.ry - 8], [-BG2.rx + 8, BG2.cy], [BG2.rx - 8, BG2.cy]].forEach((q) => S.ell(q[0], q[1], 8, 8, S.real ? '#ff6fb5' : G.blush, { hi: true, line: S.L * 0.7 }));
    },
  };
  BE_P.p2_mirror = {
    box: [-136, -332, 136, -40], pivot: [0, BG2.cy],
    draw(S) { S.mirror(E(0, BG2.cy, BG2.rx - 15, BG2.ry - 15, 40), { streaks: 3 }); },
  };
  // the two heroes as perfect pastel copies in the mirror: no outline wobble, no motion lines, the same smile
  BE_P.p2_copies = {
    box: [-120, -150, 120, -36], pivot: [0, -90],
    draw(S) {
      const g = S.g;
      const fig = (x, col, hair) => {
        g.save(); g.globalAlpha = 0.85;
        RJ.blob(g, [{ a: [x - 7, -66], b: [x - 8, -44], w: 9 }, { a: [x + 7, -66], b: [x + 8, -44], w: 9 }, { e: [x, -80, 16, 20] }, { a: [x - 14, -88], b: [x - 22, -70], w: 8 }, { a: [x + 14, -88], b: [x + 22, -70], w: 8 }], { fill: col, shade: RJ.shade(col, 0.06), ink: '#ffffff', L: 2, lit: 1 });
        if (hair === 'tail') RJ.blob(g, [{ e: [x, -114, 17, 16] }, { a: [x + 12, -124], b: [x + 26, -106], w: 9 }], { fill: col, shade: RJ.shade(col, 0.06), ink: '#ffffff', L: 2, lit: 1 });
        else RJ.blob(g, [{ e: [x, -114, 17, 16] }, { a: [x - 4, -130], b: [x + 4, -136], w: 8 }, { a: [x - 10, -128], b: [x - 6, -136], w: 6 }], { fill: col, shade: RJ.shade(col, 0.06), ink: '#ffffff', L: 2, lit: 1 });
        g.restore();
        foe.glossSmile(g, x, -110, 8, { color: '#ffffff' });
      };
      fig(-84, S.real ? '#ff7fb2' : '#ffd3e6', 'tail');
      fig(84, S.real ? '#78bd35' : '#d4f2c8', 'mohawk');
    },
  };
  BE_P.p2_shard = {
    box: [-12, -16, 12, 16], pivot: [0, 0],
    draw(S) { S.mirror([[0, -14, 1], [10, 0, 1], [0, 14, 1], [-10, 0, 1]], { streaks: 1 }); },
  };
  const DRAPE = (sd) => [[sd * 40, -344], [sd * 120, -330], [sd * 168, -270], [sd * 150, -190], [sd * 172, -110], [sd * 158, -36]];
  const p2Drape = (sd) => ({
    spine: DRAPE(sd), cuts: [0.32, 0.62], reach: 70, overlap: 5,
    draw(S) {
      tk.ribbon(S.g, DRAPE(sd), S.real ? '#ff9fd0' : G.lilac, { wMax: 34, w0: 10, w1: 30, tipPow: 0.7, profile: (u) => 0.3 + 0.7 * Math.pow(u, 0.6), cap: 'round', shadow: S.real ? '#e86fb0' : '#d2c4f2', shadowW: 0.35, gloss: true, glossColor: '#ffffff', glossAlpha: 0.75, strands: 1, line: S.L, lineColor: S.lc, light: RJ.lightAngle(),
        decor(g) { const gr = g.createLinearGradient(0, -340, 0, -40); gr.addColorStop(0, tk.rgba(S.real ? '#ffd84d' : G.mint, 0.7)); gr.addColorStop(0.5, tk.rgba(S.real ? '#ff6fb5' : G.lilac, 0.3)); gr.addColorStop(1, tk.rgba(S.real ? '#8b4dff' : G.blush, 0.8)); g.fillStyle = gr; g.fillRect(-200, -350, 400, 330); } });
    },
  });
  BE_C.p2_drapeL = p2Drape(-1);
  BE_C.p2_drapeR = p2Drape(1);
  // where the mirror cracks with real colour as the Gloss loses (hpPct): more lines the lower it goes
  const WOUND2 = [[-60, -280, 50], [70, -250, 44], [-90, -170, 40], [40, -140, 46], [-20, -320, 36], [100, -200, 34], [-110, -230, 30], [10, -220, 40]];
  // a calm slit of light (the Gloss's eyes and its open, silent mouth)
  function slit(c, x, y, rx, ry, k, col) {
    tk.glow(c, x, y, rx * 2, col || G.lilac, 0.55 * k);
    c.save(); c.globalAlpha = c.globalAlpha * cA(0.7 + 0.3 * k);
    c.beginPath(); c.moveTo(x - rx, y); c.quadraticCurveTo(x, y - ry * 2, x + rx, y); c.quadraticCurveTo(x, y + ry * 2, x - rx, y); c.closePath();
    c.lineWidth = 5; c.strokeStyle = tk.rgba(G.line, 0.75); c.stroke();
    c.fillStyle = '#ffffff'; c.fill();
    c.restore();
    tk.glow(c, x, y, rx * 0.9, '#ffffff', 0.5 * k);
  }
  BE_RIG[2] = function (ctx, st) {
    const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, atk = E0.pose === 'attack', p = atk ? E0.p : 0;
    const fl = sin(t * 0.9) * 5 * m, breathe = 1 + 0.012 * sin(t * 1.3) * m;
    const lean = atk ? E0.strike : 0, wind = atk ? E0.wind : 0;
    const dx = -16 * lean + hurt * 14 + E0.shake, dy = fl - 6 * tele;
    const sc = breathe + 0.05 * lean + 0.03 * tele - 0.04 * guard;
    tk.glow(ctx, 0, -40, 180, st.won ? '#ffd84d' : G.lilac, 0.35);
    ctx.save();
    xform(ctx, 0, BG2.cy, dx, dy, 0.05 * hurt - 0.03 * lean, sc, sc);
    const sw = sin(t * 0.8) * m;
    putChain(ctx, st, 'p2_drapeL', [0.04 * sw + 0.1 * tele, 0.08 * sin(t * 0.8 - 0.7) * m, 0.1 * sin(t * 0.8 - 1.4) * m]);
    putChain(ctx, st, 'p2_drapeR', [-0.04 * sw - 0.1 * tele, -0.08 * sin(t * 0.8 - 0.7) * m, -0.1 * sin(t * 0.8 - 1.4) * m]);
    put(ctx, st, 'p2_mirror', { kids(c) {
      // the perfect copies, a little brighter when it offers them
      put(c, st, 'p2_copies', { a: 0.75 + 0.25 * (tele + lean) });
      WOUND2.forEach((w, i) => { if (st.wound > i / WOUND2.length * 0.95) crack(c, w[0], w[1], w[2], 'bw2' + i, 0.9); });
      crack(c, 30, -300, 50, 'glosshit', hurt * 1.4);
      // the face: calm slits of light for eyes, an open slit of a mouth that makes no sound
      const k = st.won ? 0.6 : 0.6 + 0.2 * sin(t * 1.6) * m + 0.4 * tele + 0.5 * lean;
      const open = 1 + 0.4 * wind + 0.3 * lean;
      slit(c, -54, -244, 30, 4 + 2 * tele, k);
      slit(c, 54, -244, 30, 4 + 2 * tele, k);
      slit(c, 0, -146, 32, 9 * open, k, G.blush);
    } });
    put(ctx, st, 'p2_frame', { kids(c) { polite(c, st, 96, -300, 10); } });
    // mirror shards drifting round it
    for (let i = 0; i < 8; i++) {
      const a = t * (0.3 + 0.6 * buff) * m + i * TAU / 8, x = cos(a) * 190, y = BG2.cy + sin(a) * 120;
      put(ctx, st, 'p2_shard', { x, y, r: a + t * 0.5 * m, a: 0.7 });
    }
    ctx.restore();
    // the silent wave: pastel ovals rolling out of the open mouth toward the heroes (Mute the World), gathering in on the telegraph
    const wk = atk ? Math.max(E0.strike, wind * 0.4) : tele * 0.6;
    if (wk > 0.03) {
      for (let i = 0; i < 4; i++) {
        let u = fr(t * 0.9 + i / 4);
        if (tele > 0 && !atk) u = 1 - u;
        ctx.save(); ctx.globalAlpha = sin(PI * u) * wk; ctx.strokeStyle = [G.lilac, G.mint, G.blush, '#ffffff'][i]; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.ellipse(-40 - 160 * u + dx, -150 + dy, 20 + 40 * u, 40 + 80 * u, 0, PI * 0.5, PI * 1.5); ctx.stroke(); ctx.restore();
      }
    }
    if (buff > 0.05) foe.sparkles(ctx, 0, -200, [[-120, -100, 9, 0], [120, -80, 8, 0.3], [0, -170, 9, 0.6], [-60, 80, 7, 0.8]], 3, E0.buffP * 2);
    if (guard > 0.05) pitchRing(ctx, dx, BG2.cy + dy, 176, 186, 3, 24, G.mint, guard, t * 4);
  };

  // ---- the win-overs: each form its own way, every one ending with the shy little lens and its one crooked note
  function shyLens(ctx, q, x, y) {
    if (q <= 0 || q >= 1) return;
    const a = q < 0.15 ? q / 0.15 : q > 0.85 ? (1 - q) / 0.15 : 1, wob = sin(q * 40) * 1.2;
    ctx.save(); ctx.globalAlpha = ctx.globalAlpha * cA(a); ctx.translate(x + wob, y - q * 10);
    tk.glow(ctx, 0, 0, 44, '#ffd6ea', 0.6);
    RJ.cel(ctx, E(0, 0, 22, 22, 20), '#e6d9ff', { line: 2.4, lineColor: REAL_LINE, shadow: '#c9b8ff', hi: '#ffffff', wobble: 0 });
    RJ.cel(ctx, E(0, 0, 14, 14, 18), '#9fd8ff', { line: 1.6, lineColor: REAL_LINE, shadow: '#6fb8ff', wobble: 0 });
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(-5, -6, 4, 2.5, -0.6, 0, TAU); ctx.fill();
    // two tiny eyes looking up shyly and a small, nervous, wobbly smile; a blush
    ctx.fillStyle = REAL_LINE;
    [-6, 6].forEach((ex) => { ctx.beginPath(); ctx.arc(ex, -1, 1.9, 0, TAU); ctx.fill(); });
    RJ.ink(ctx, [[-5, 5], [-2.5, 6.5], [0, 5.2], [2.5, 6.6], [5, 5]], { w: 1.4, color: REAL_LINE, taper: 0.3, wobble: 0 });
    ctx.globalAlpha = ctx.globalAlpha * 0.6; ctx.fillStyle = '#ff8d98';
    [-11, 11].forEach((bx) => { ctx.beginPath(); ctx.ellipse(bx, 4, 3.5, 1.8, 0, 0, TAU); ctx.fill(); });
    ctx.restore();
    // the one crooked note, wobbling up
    if (q > 0.2) {
      const nq = (q - 0.2) / 0.8;
      tk.note(ctx, x + 30 + sin(nq * 12) * 4, y - 24 - nq * 40, 15, { kind: 'eighth', color: '#ff6fb5', alpha: a * sin(PI * Math.min(1, nq * 1.15)), rot: 0.42 + 0.18 * sin(nq * 16), line: 1.8 });
    }
  }
  const BE_BOX = [[-140, -340, 140, 0], [-170, -356, 170, 0], [-170, -350, 170, -20]];
  function bossWinOver(ctx, spec, st) {
    const ph = clamp(st.phase, 0, 2), p = st.E.die, B = BE_BOX[ph];
    const base = Object.assign({}, st, { E: poseState('idle', st.t, 0), flash: 0, v: '', won: false });
    const real = Object.assign({}, base, { v: 'r', won: true });
    if (ph < 2) {
      foe.winOver(ctx, null, p, {
        act: 3, box: B, seed: 41 + ph * 7, hop: ph ? 10 : 16, confetti: 'broken',
        draw: (g) => BE_RIG[ph](g, real),
        gloss: (g, S, k) => { g.globalAlpha = g.globalAlpha * cA(k); BE_RIG[ph](g, base); },
      });
      if (ph === 1 && p < 0.6) { tk.glow(ctx, 0, BF.ly, 120, '#ffffff', 0.5 * sin(PI * p / 0.6)); }
    } else {
      // the mirror crazes (a growing net of real colour), then breaks into soft sparkles and drifts away
      if (p < 0.62) {
        const k = clamp(p / 0.4, 0, 1), fade = 1 - clamp((p - 0.35) / 0.27, 0, 1);
        ctx.save(); ctx.globalAlpha = ctx.globalAlpha * fade;
        BE_RIG[2](ctx, k > 0.5 ? real : base);
        ctx.save(); xform(ctx, 0, BG2.cy, 0, 0, 0, 1, 1);
        WOUND2.forEach((w, i) => crack(ctx, w[0], w[1], w[2] * (0.4 + 0.8 * k), 'craze' + i, clamp(k * 2 - i * 0.15, 0, 1)));
        ctx.restore();
        ctx.restore();
      }
      if (p > 0.25) {
        const u = clamp((p - 0.25) / 0.6, 0, 1), rr = tk.rng('bossc', 2);
        for (let i = 0; i < 26; i++) {
          const a = rr() * TAU, d = 30 + rr() * 150, sp = 0.5 + rr() * 0.8, x = cos(a) * d * (1 + u * sp), y = BG2.cy + sin(a) * d * 0.9 * (1 + u * sp) - u * 40;
          tk.sparkle(ctx, x, y, (3 + rr() * 6) * sin(PI * u), { color: [G.lilac, G.mint, G.blush, '#ffffff', REAL[i % REAL.length]][i % 5], alpha: sin(PI * u), glow: 0.4, rot: u * 2 });
        }
      }
    }
    floorSparkle(ctx, spec, p);
    if (p > 0.55) shyLens(ctx, (p - 0.55) / 0.45, 0, -190);
  }
  define('boss_editor', {
    size: 'xl',
    col: { skin: G.porcelain, hair: '#d6c9f6', boot: '#f6f2ff', bodice: '#ffd6ea', bodice2: '#dccdfb', chromeT: '#d9d6ea', ball: G.opal },
    real: { skin: '#ffd2b4', hair: '#6a3a8a', boot: '#ffd84d', bodice: '#ff4f8e', bodice2: '#8b4dff', chromeT: '#7cc6ff', ball: '#ffd84d' },
    bounds: { w: 340, h: 364, head: { x: 0, y: -334 }, body: { x: 0, y: -176 }, feet: { x: 0, y: 0 }, right: 170 },
    sweep: [-60, -240],
    parts: BE_P,
    chains: BE_C,
    winOver: bossWinOver,
    rig(ctx, st) { const ph = clamp(st.phase, 0, 2); (BE_RIG[ph] || BE_RIG[0])(ctx, st); },
  });

  // ===============================================================================================================
  // registration of every spec and the gallery
  // ===============================================================================================================
  Object.keys(SPECS).forEach((id) => register(SPECS[id]));
  ART.enemy.warm3 = warm;
  ART.enemy.ids3 = () => Object.keys(SPECS);

  const KEYPT = { idle: 0, attack: 0.21, hurt: 0.07, block: 0.2, buff: 0.16, die: 0.3, telegraph: 0.6 };
  // the Perfect Stage for swatches: an opal hall with ring lights hanging like halos, a mirror floor with a cheap reflection of the creature, and
  // confetti that falls in a perfect grid. Pale on purpose: the slate line carries every creature.
  function stage(ctx, W, H, t, gy, seed) {
    const sk = ctx.createLinearGradient(0, 0, 0, gy);
    sk.addColorStop(0, '#d9d1f2'); sk.addColorStop(0.6, '#ece6fa'); sk.addColorStop(1, '#f7f2fc');
    ctx.fillStyle = sk; ctx.fillRect(0, 0, W, gy);
    const u = Math.max(0.4, H / 600);
    // ring lights like halos, in a perfect row
    const n = Math.max(2, Math.round(W / (220 * u)));
    for (let i = 0; i < n; i++) {
      const x = W * (i + 0.5) / n, y = gy * 0.2, r = 18 * u;
      tk.glow(ctx, x, y, r * 2.2, '#ffffff', 0.22);
      ctx.save(); ctx.lineWidth = 4 * u; ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
      ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(90,95,122,0.35)'; ctx.beginPath(); ctx.arc(x, y, r + 3 * u, 0, TAU); ctx.stroke(); ctx.restore();
    }
    confettiGrid(ctx, [0, 0, W, gy * 0.9], fr(t * 0.08 + (seed || 0) * 0.13), false, seed || 1);
    // the mirror floor
    const fl = ctx.createLinearGradient(0, gy, 0, H);
    fl.addColorStop(0, '#e4def4'); fl.addColorStop(1, '#f6f3fc');
    ctx.fillStyle = fl; ctx.fillRect(0, gy, W, H - gy);
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(0, gy, W, Math.max(1, 2 * u));
    ctx.strokeStyle = 'rgba(90,95,122,0.12)'; ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) { const y = gy + (H - gy) * (i / 4) * (i / 4); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  }
  const drawWithFloor = (ctx, id, o, gy) => {
    reflection(ctx, (c) => ART.enemy.draw(c, id, o), gy, 0.16);
    ART.enemy.draw(ctx, id, o);
  };
  ART.sheet('enemies3_dev', (canvas, params) => {
    const ctx = canvas.getContext('2d'), W = num(params.w, 1600), H = num(params.h, 900), t = num(+params.t, 0);
    const all = params.id === 'all' || params.id === undefined;
    const ids = (all ? Object.keys(SPECS) : String(params.id).split(',')).filter((id) => SPECS[id]);
    const zoom = num(+params.zoom, 1.6), gy = H * 0.86, pt = params.pt !== undefined ? num(+params.pt, 0) : undefined, hp = params.hp !== undefined ? num(+params.hp, 1) : undefined;
    stage(ctx, W, H, t, gy, 3);
    if (!ids.length) return;
    if (params.pose === 'all') {
      POSES.forEach((pose, i) => {
        drawWithFloor(ctx, ids[0], { x: W * (i + 0.5) / POSES.length, y: gy, s: zoom, pose, t, pt: pt !== undefined ? pt : KEYPT[pose], phase: num(+params.phase, 0) | 0, hpPct: hp }, gy);
        ctx.font = '600 13px system-ui'; ctx.fillStyle = '#5a5f7a'; ctx.textAlign = 'center'; ctx.fillText(pose, W * (i + 0.5) / POSES.length, H - 8);
      });
    } else {
      const pose = POSES.indexOf(params.pose) >= 0 ? params.pose : 'idle';
      ids.forEach((id, i) => drawWithFloor(ctx, id, { x: W * (i + 0.5) / ids.length, y: gy, s: zoom, pose, t, pt: pt !== undefined ? pt : KEYPT[pose], phase: num(+params.phase, 0) | 0, hpPct: hp }, gy));
    }
  });
  // ---------------------------------------------------------------------------------------------------------------
  // gallery sheets
  // ---------------------------------------------------------------------------------------------------------------
  const NORMALS = ['storm_drone', 'komainu_guardian', 'redaction_knight', 'void_scribe', 'blank_soldier', 'sky_serpent', 'eraser_wraith', 'thunder_crow', 'paper_golem', 'margin_imp'];
  const ELITES = ['censor_golem', 'storm_whelp', 'black_bar_inquisitor'];
  const MINIONS = ['blank_page', 'spark_mote', 'typo_sprite'];
  const NAMES = {
    storm_drone: 'Tuner Drone', komainu_guardian: 'VIP Bouncer', redaction_knight: 'Clapperboard Knight', void_scribe: 'Chrome Siren', blank_soldier: 'Synchro Dancer',
    sky_serpent: 'Streamer Dragon', eraser_wraith: 'Airbrush Wraith', thunder_crow: 'Ring Light Sentinel', paper_golem: 'Sequin Golem', margin_imp: 'Glitch Gremlin',
    censor_golem: 'Big Mute Button', storm_whelp: 'Applause Sign', black_bar_inquisitor: 'Mannequin Judge', blank_page: 'Lip-Sync Clone', spark_mote: 'Confetti Popper',
    typo_sprite: 'Pitch Glitch', boss_editor: 'Flawless',
  };
  const cellBg = (g, w, h, t, seed) => stage(g, w, h, t, h * 0.88, seed);
  const fitScale = (id, w, h, cap) => { const b = ART.enemy.bounds(id); return Math.min(h * 0.84 / (b.h + 14), w * 0.96 / (b.w + 10), cap || 2); };
  const tierOf = (id) => (DATA.enemies && DATA.enemies[id] ? DATA.enemies[id].tier : '');

  // every creature, rival and sidekick, each in three poses (params.poses = "idle,attack,telegraph" by default), fitted to its cell
  ART.sheet('enemies3', (canvas, params) => {
    const t = num(+params.t, 0), poses = String(params.poses || 'idle,attack,telegraph').split(',').filter((p) => POSES.indexOf(p) >= 0);
    const ids = NORMALS.concat(ELITES, MINIONS).filter((id) => SPECS[id]), np = poses.length || 1;
    const cells = ids.map((id) => ({ id, label: (NAMES[id] || id) + '  (' + id + ', ' + tierOf(id) + ')' }));
    ART.sheetGrid(canvas, params, cells, (g, cell, w, h, i) => {
      cellBg(g, w, h, t, i);
      const gy = h * 0.88, sc = fitScale(cell.id, w / np, h, 1.7);
      (poses.length ? poses : ['idle']).forEach((pose, k) => drawWithFloor(g, cell.id, { x: w * (k + 0.5) / np, y: gy, s: sc, pose, t: t + i * 0.37, pt: params.pt !== undefined ? num(+params.pt, 0) : KEYPT[pose], phase: 0 }, gy));
    }, { cols: 4, title: 'Act III, the Perfect Stage: creatures, rivals, sidekicks (' + poses.join(', ') + ')', gap: 6, labelH: 16 });
  });

  // the Headliner: all three forms large in idle, then every pose of each form underneath
  ART.sheet('boss3', (canvas, params) => {
    const g = canvas.getContext('2d'), W = num(params.w, 1600), H = num(params.h, 900), t = num(+params.t, 0), id = 'boss_editor';
    const topH = H * 0.56, gy = topH * 0.93, names = ['phase 0: Flawless', 'phase 1: the Filter', 'phase 2: the Gloss'];
    stage(g, W, H, t, gy, 2);
    g.font = '700 16px system-ui'; g.fillStyle = '#5a5f7a'; g.textAlign = 'left'; g.fillText('Flawless, all three forms', 10, 20);
    if (!SPECS[id]) return;
    const sc = Math.min(topH * 0.86 / 360, W / 3 * 0.9 / 340);
    [0, 1, 2].forEach((ph) => {
      const cx = W * (ph + 0.5) / 3;
      drawWithFloor(g, id, { x: cx, y: gy, s: sc, pose: 'idle', t, pt: 0, phase: ph, hpPct: ph === 2 ? 0.25 : ph === 1 ? 0.5 : 1 }, gy);
      g.font = '700 15px system-ui'; g.fillStyle = '#5a5f7a'; g.textAlign = 'center'; g.fillText(names[ph], cx, topH - 4);
    });
    const poses = ['attack', 'hurt', 'block', 'buff', 'die', 'telegraph'], bandH = (H - topH) / 3, cw = W / poses.length, s2 = Math.min(bandH * 0.84 / 360, cw * 0.96 / 340);
    [0, 1, 2].forEach((ph) => poses.forEach((pose, k) => {
      const x = cw * (k + 0.5), y = topH + bandH * ph + bandH * 0.9;
      g.fillStyle = 'rgba(228,222,244,0.92)'; g.fillRect(cw * k, topH + bandH * ph, cw - 2, bandH - 2);
      ART.enemy.draw(g, id, { x, y, s: s2, pose, t, pt: KEYPT[pose], phase: ph });
      g.font = '600 12px system-ui'; g.fillStyle = '#5a5f7a'; g.textAlign = 'center'; g.fillText('phase ' + ph + ' ' + pose, x, topH + bandH * (ph + 1) - 4);
    }));
  });

  // film strips: two creatures (params.ids), each with an idle loop, an attack and a win-over across the pose (8 frames each)
  ART.sheet('enemies3_anim', (canvas, params) => {
    const ids = String(params.ids || 'black_bar_inquisitor,spark_mote').split(',').filter((id) => SPECS[id]).slice(0, 2), n = 8, t0 = num(+params.t, 0), cells = [];
    ids.forEach((id) => {
      for (let i = 0; i < n; i++) cells.push({ id, kind: 'idle', i, label: (NAMES[id] || id) + ' idle ' + (i * 0.3).toFixed(1) + 's' });
      for (let i = 0; i < n; i++) cells.push({ id, kind: 'attack', i, label: 'attack ' + Math.round(i / (n - 1) * POSE_MS.attack) + 'ms' });
      for (let i = 0; i < n; i++) cells.push({ id, kind: 'die', i, label: 'win-over ' + Math.round(i / (n - 1) * POSE_MS.die) + 'ms' });
    });
    ART.sheetGrid(canvas, params, cells, (g, cell, w, h) => {
      cellBg(g, w, h, t0, 2);
      const sc = fitScale(cell.id, w, h, 1.6), u = cell.i / (n - 1);
      const o = { x: w * 0.5, y: h * 0.88, s: sc, t: t0 + cell.i * (cell.kind === 'idle' ? 0.3 : 0.033) };
      if (cell.kind === 'idle') ART.enemy.draw(g, cell.id, Object.assign(o, { pose: 'idle', pt: 0 }));
      else ART.enemy.draw(g, cell.id, Object.assign(o, { pose: cell.kind, pt: u * POSE_MS[cell.kind] / 1000 }));
    }, { cols: n, title: 'Act III film strips: ' + ids.map((id) => NAMES[id] || id).join(' and ') + ' (idle loop, attack, win-over)', gap: 4, labelH: 14 });
  });
})();
