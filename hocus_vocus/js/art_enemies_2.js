// Hocus Vocus: ART.enemy art for ACT II, Scrollopolis, the city of screens where it is always 2 am and nobody has looked up in years (the feed
// as a zoo). Extends ART (art.js) and paints with the shared foe kit ART.rj.foe (art_cast_kit.js), so every creature shares the chibi cast's
// style. This file draws exactly the 17 ids of DATA.ROSTER[2] and registers each with ART.enemy.register(id, {draw, bounds}).
//
//   creatures  chochin Flamebait, karakuri_puppet Clickbait Goblin, nopperabo Filter Fairy, drowned_samurai Unskippable Ad, koi_spirit Hug Emoji,
//              tsukumogami Notification Imp, silk_weaver Algo Rhythm, nure_onna Autoplay Snake, rokurokubi Selfie Stick, ittan_momen Phone Charger
//   rivals     drowned_general Comment Troll, puppet_master Trendsetter, umibozu Doomscroll Moth
//   sidekicks  spiderling Botling, paper_puppet Copycat Cutout, lantern_wisp Grumble Cloud
//   headliner  boss_jorogumo Scrollspinner, Queen of the Feed: phase 0 the Avatar (a glittering bell gown, a filtered face in a ring-light halo, a
//              selfie phone, four spider feet under the hem), phase 1 the Spinner (the gown split on a spider body, eight phone-screen eyes,
//              eight legs, a web of glowing cables)
//
// CONTRACT (DESIGN 5.6). draw(ctx, o) receives the context ALREADY translated to the feet centre and scaled; it paints around (0, 0), y negative up,
// facing LEFT. o = {s, pose, t, pt, hpPct, phase, glow, flip}. t is absolute seconds (loops), pt seconds since the pose began (one-shot poses).
// Poses are LISTS.enemyPoses: idle attack hurt block buff die telegraph. Elite ornament, the aura ring and the ground shadow are drawn by
// ART.enemy.draw: nothing here duplicates them. Every id is deterministic (no clock, no banned random call), never throws for odd input, and
// keeps save and restore balanced.
//
// THE ACT II LOOK (HV_ENEMIES 3.4, HV_ART_AUDIO 4). Always 2 am in blue light: midnight, screen blue, cyan, notification red, heart pink, neon
// green, and one warm colour kept back for hope, moon cream. The chibi house style: an even navy outline (the foe kit's Act II line, its width by
// size class), flat cel colour with one hard shadow and one highlight, big flat-cel eyes with two catchlights, small blush marks, round bouncy
// shapes, big heads and stubby limbs. The shapes are the shapes of the phone: rounded rectangles, speech bubbles, generic icons (hearts, thumbs,
// play triangles, red dots, spinners; never a real platform's look) and long glowing cables. The signature gag: every creature carries a small
// screen playing a tiny loop that lights its face from BELOW in blue, and every one of them looks DOWN. The die pose is the win-over
// (foe.winOver): the screen goes dark, the creature looks up at the moon for the first time and smiles, hops once and pops into hearts and
// dimming pixels. The only words painted here are the art word SKIP (the Unskippable Ad) and the Notification Imp's number.
//
// HOW THEY ARE BUILT (the cutout puppet of the rigs this Act was built on: bones, chains, pose timings and phases are kept).
//   A creature is a handful of PARTS (a head, a body, a limb, a bezel), each drawn ONCE at rest into a cached sprite per raster scale
//   q = ceil(2 * s) / 2, then composited every frame under its own transform (a pivot, a rotation, a squash). Things that bend (necks, tails,
//   legs) are ART.tk.chain parts: one baked drawing sliced into slabs that bend at joints. Everything that must change every frame is drawn LIVE
//   and cheaply: eyes (blink, look), mouths, flames, screen loops, cables, strings, hearts. Poses are a small shared state (poseState: lunge,
//   wind-up, recoil, guard, buff pulse) that each creature reads in its own rig(). A hurt pose flashes a baked white silhouette of every part.
//   A part that changes when the creature is won over (the blue under-light goes out, a grumpy cloud turns pink) says won: true and is baked
//   in a second variant.
//
// THE FEED HELPER SET (HV_ART_AUDIO 4.3, used by every creature of the Act)
//   FEED.screen(g, x, y, w, h, o)       a rounded glass screen centred on (x, y) playing a tiny loop. o.kind heart thumb play spinner dot feed
//                                       thread face, o.on 0..1 (0 is dark), o.t, o.case (bezel colour), o.lw, o.round, o.seed
//   FEED.icon(g, kind, x, y, s, o)      generic icons: heart thumb play dot bell spinner bubble (o.down turns the thumb down, o.ink 0 drops the line)
//   FEED.cable(g, pts, o)               a glowing charging cable along control points with plug ends (o.w, o.col, o.plug 'end' or 'both', o.t pulse)
//   FEED.look(st, lx)                   where every eye looks: down at the screen, or up at the moon once won over (st.won)
//   FEED.glitter(g, box, t, n, seed)    twinkling glitter         FEED.balloons(g, x, y, t, n, seed, o) notification bubbles drifting up
//
// EXTRAS beyond DESIGN 5.6
//   ART.enemy.warm2(id, s) -> parts baked      pre-bake every sprite of an Act II creature at the raster scale for s (avoids a first-frame hitch)
//   ART.enemy.ids2() -> the 17 ids drawn here
//   Gallery sheets: enemies2 (every creature, rival and sidekick, several poses each), boss2 (Scrollspinner, both forms, every pose),
//   enemies2_anim (film strips of two creatures), enemies2_dev (params id[,id]|all pose|all zoom t pt phase hp: the workbench).
(() => {
  'use strict';
  const tk = ART.tk;
  const clamp = tk.clamp, lerp = tk.lerp, num = tk.num, ease = tk.ease;
  const TAU = Math.PI * 2, PI = Math.PI;
  const cA = (a) => (a >= 0 ? (a <= 1 ? a : 1) : 0);
  const sm = tk.smoothstep;
  const fr = (v) => v - Math.floor(v);
  const hv = (id, salt) => tk.vary(id, salt);
  const SPECS = {};
  const PAD = 8;
  const POSES = ['idle', 'attack', 'hurt', 'block', 'buff', 'die', 'telegraph'];
  const POSE_MS = { attack: 420, hurt: 260, block: 300, buff: 400, die: 700, telegraph: 0, idle: 0 };
  // the Act II palette (HV_ENEMIES 3.4) and the navy line that Acts I and II share (E-D5)
  const C = {
    line: '#22264a', night: '#141a3a', glassD: '#101845', glass: '#2a55d8', blue: '#3d7bff', cyan: '#3ff0ff', red: '#ff3b5c', pink: '#ff6fb5',
    green: '#6dff8a', moon: '#fff2c4', white: '#fffaf1', gold: '#ffd84d', blush: '#ff8d98', silver: '#c9cfe0', grey: '#9aa0b8',
  };
  const IRIS = ['#22306e', '#3d7bff'];          // screen-lit irises: deep blue above, screen blue below the hard edge

  // ---------------------------------------------------------------------------------------------------------------
  // the shared foe kit. The game and the gallery load art_cast_kit.js first; a headless suite that boots this file alone gets this small
  // stand-in with the same signatures, so every draw still works. The real kit always wins when it is there.
  // ---------------------------------------------------------------------------------------------------------------
  const heartPath = (g, x, y, s) => {
    g.beginPath(); g.moveTo(x, y + s * 0.8);
    g.bezierCurveTo(x - s * 1.3, y - s * 0.1, x - s * 0.6, y - s * 1.05, x, y - s * 0.35);
    g.bezierCurveTo(x + s * 0.6, y - s * 1.05, x + s * 1.3, y - s * 0.1, x, y + s * 0.8); g.closePath();
  };
  const FOE = ART.rj && ART.rj.foe ? ART.rj.foe : (() => {
    const W = { s: 2.0, m: 2.4, l: 2.8, xl: 3.2 }, f = {};
    f.ink = (act, size) => { const w = W[size] || W.m; return { color: C.line, main: w, mid: w * 0.8, fine: w * 0.575 }; };
    f.cel = (g, pts, base, o) => {
      o = o || {};
      const opt = Object.assign({ line: f.ink(2, o.size).main, lineColor: C.line, wobble: 0.05, weightVar: 0.45 }, o);
      if (opt.hi === true) opt.hi = tk.tint(base, 0.4);
      tk.celFill(g, pts, base, opt);
    };
    f.limb = (g, a, b, w, col, o) => {
      if (!g || !a || !b) return;
      const ww = Math.max(1, num(w, 12)), L = f.ink(2, (o || {}).size).main;
      g.save(); g.lineCap = 'round';
      g.beginPath(); g.moveTo(num(a[0]), num(a[1])); g.lineTo(num(b[0]), num(b[1]));
      g.strokeStyle = C.line; g.lineWidth = ww + L * 2; g.stroke(); g.strokeStyle = col || '#ffcf8a'; g.lineWidth = ww; g.stroke();
      g.restore();
    };
    f.eyes = (g, x, y, w, o) => {
      if (!g) return;
      o = o || {};
      w = Math.max(1, num(w, 14));
      const n = o.n === 1 ? 1 : 2, gap = num(o.gap, w * 1.3), open = clamp(num(o.open, 1), 0, 1), look = o.look || [0, 0], kind = o.kind || 'round';
      for (let i = 0; i < n; i++) {
        const ex = num(x) + (n === 1 ? 0 : (i ? gap / 2 : -gap / 2)), ey = num(y), a = w / 2, b = w * 0.56 * Math.max(0.15, open);
        g.save(); g.lineWidth = Math.max(1, w * 0.09); g.strokeStyle = C.line;
        if (kind === 'screen') {
          g.beginPath(); g.rect(ex - a, ey - b, w, b * 2); g.fillStyle = '#132050'; g.fill(); g.stroke();
          g.beginPath(); g.rect(ex - a * 0.3, ey - b * 0.45, a * 0.6, b * 0.9); g.fillStyle = o.glow || C.cyan; g.fill();
        } else {
          g.beginPath(); g.ellipse(ex, ey, a, b, 0, 0, TAU); g.fillStyle = kind === 'dot' ? C.line : '#fffdfa'; g.fill(); g.stroke();
          if (kind !== 'dot') {
            g.beginPath(); g.ellipse(ex + clamp(num(look[0]), -1, 1) * a * 0.2, ey + clamp(num(look[1]), -1, 1) * b * 0.2, a * 0.6, Math.min(b, a * 0.66), 0, 0, TAU);
            g.fillStyle = kind === 'heart' ? (o.heart || C.pink) : (o.iris ? o.iris[0] : IRIS[0]); g.fill();
            g.beginPath(); g.arc(ex - a * 0.2, ey - b * 0.3, a * 0.22, 0, TAU); g.fillStyle = '#ffffff'; g.fill();
          }
        }
        g.restore();
      }
    };
    f.mouth = (g, x, y, w, kind) => {
      if (!g) return;
      w = Math.max(2, num(w, 14)); x = num(x); y = num(y);
      const open = ['happyOpen', 'grin', 'ow', 'sing', 'beat', 'squeal', 'O', 'grit', 'smirkTeeth'].indexOf(kind) >= 0;
      g.save(); g.lineWidth = Math.max(1.2, w * 0.11); g.strokeStyle = C.line; g.lineCap = 'round'; g.beginPath();
      if (open) { g.ellipse(x, y + w * 0.12, w * (kind === 'O' ? 0.22 : 0.4), w * 0.24, 0, 0, TAU); g.fillStyle = '#9c2f45'; g.fill(); g.stroke(); }
      else { const d = kind === 'frown' || kind === 'grumble' ? -0.22 : kind === 'flat' ? 0 : 0.25; g.moveTo(x - w / 2, y); g.quadraticCurveTo(x, y + w * d, x + w / 2, y); g.stroke(); }
      g.restore();
    };
    f.glossSmile = (g, x, y, w) => f.mouth(g, x, y, w, 'smile');
    f.glossSheen = (g, box, k, o) => {
      if (!g || !box) return;
      o = o || {};
      k = clamp(num(k, 1), 0, 1);
      if (k <= 0.01) return;
      g.save();
      if (o.shape) { g.beginPath(); tk.trace(g, o.shape); g.clip(); }
      g.fillStyle = 'rgba(244,241,251,' + (0.4 * k).toFixed(3) + ')';
      g.fillRect(num(box[0]), num(box[1]), Math.max(1, num(box[2], 10)), Math.max(1, num(box[3], 10)));
      g.restore();
    };
    f.winOver = (g, S, p, o) => {
      if (!g) return;
      o = o || {};
      p = clamp(num(p), 0, 1);
      const B = Array.isArray(o.box) && o.box.length === 4 ? o.box.map((v) => num(v)) : [-50, -120, 50, 0];
      const cx = (B[0] + B[2]) / 2, cy = (B[1] + B[3]) / 2, Rr = Math.max(B[2] - B[0], B[3] - B[1]) * 0.9, hop = num(o.hop, 18);
      const body = (dy, s) => {
        if (typeof o.draw !== 'function') return;
        g.save();
        try { g.translate(cx, B[3] + dy); g.scale(s, s); g.translate(-cx, -B[3]); o.draw(g, S); } finally { g.restore(); }
      };
      if (p < 0.35) { body(0, 1); if (typeof o.gloss === 'function') { g.save(); try { o.gloss(g, S, 1 - p / 0.35); } finally { g.restore(); } } }
      else if (p < 0.6) body(-hop * Math.sin(PI * (p - 0.35) / 0.25), 1);
      else if (p < 0.62) body(0, Math.max(0.001, 1 - (p - 0.6) / 0.02));
      if (p >= 0.6) {
        const q = (p - 0.6) / 0.4, a = q < 0.75 ? 1 : 1 - (q - 0.75) / 0.25;
        if (a > 0.02) {
          const rr = tk.rng('en2conf', num(o.seed));
          g.save(); g.globalAlpha *= a;
          for (let i = 0; i < 16; i++) {
            const an = rr() * TAU, sp = 0.45 + rr() * 0.55;
            heartPath(g, cx + Math.cos(an) * Rr * sp * Math.sqrt(q), cy + Math.sin(an) * Rr * sp * 0.7 * Math.sqrt(q) + q * q * 50, 5);
            g.fillStyle = i % 2 ? C.pink : C.cyan; g.fill();
          }
          g.restore();
        }
      }
    };
    return f;
  })();
  const shadeOf = ART.rj && typeof ART.rj.shade === 'function' ? ART.rj.shade : (hex) => tk.shade(hex);

  // ---------------------------------------------------------------------------------------------------------------
  // shape helpers (control-point arrays for celFill and inkPath; [x, y, 1] is a sharp corner)
  // ---------------------------------------------------------------------------------------------------------------
  const E = (cx, cy, rx, ry, n, rot) => tk.ellipsePts(cx, cy, rx, ry, n || Math.max(10, Math.round(Math.max(rx, ry) / 3) + 8), rot || 0);
  const RR = (x, y, w, h, r) => tk.rrectPts(x, y, w, h, r);
  // a rounded capsule between two points with end widths wa and wb
  function cap(ax, ay, bx, by, wa, wb) {
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, nx = -uy, ny = ux;
    const ra = wa / 2, rb = wb / 2, mx = (ax + bx) / 2, my = (ay + by) / 2, rm = (ra + rb) / 2 * 1.04;
    return [[ax + nx * ra, ay + ny * ra], [mx + nx * rm, my + ny * rm], [bx + nx * rb, by + ny * rb], [bx + ux * rb * 1.05, by + uy * rb * 1.05],
      [bx - nx * rb, by - ny * rb], [mx - nx * rm, my - ny * rm], [ax - nx * ra, ay - ny * ra], [ax - ux * ra * 1.05, ay - uy * ra * 1.05]];
  }
  // a star burst (price stickers, flashes): n points between radii r0 and r1
  function burstPts(cx, cy, r0, r1, n, rot) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) { const a = (rot || 0) + i / (n * 2) * TAU, r = i % 2 ? r0 : r1; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1]); }
    return pts;
  }
  // a puffy cloud outline: lobes of radius r along an ellipse rx x ry
  function cloudPts(cx, cy, rx, ry, n, seed) {
    const pts = [], r = tk.rng('en2cloud', seed || 0);
    for (let i = 0; i < n; i++) {
      const a0 = i / n * TAU, a1 = (i + 1) / n * TAU, am = (a0 + a1) / 2, bulge = 1.16 + r() * 0.1;
      pts.push([cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry, 1], [cx + Math.cos(am) * rx * bulge, cy + Math.sin(am) * ry * bulge]);
    }
    return pts;
  }
  // a rounded-rectangle path for live drawing (the radius is clamped, so the canvas never sees a negative one)
  function rrPath(g, x, y, w, h, r) {
    w = Math.max(0.5, num(w, 1)); h = Math.max(0.5, num(h, 1)); x = num(x); y = num(y);
    r = clamp(num(r), 0, Math.min(w, h) / 2);
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  // an open polyline through the smoothed control points
  function strokePts(g, pts, tension) {
    const d = tk.flatten(pts, { step: 5, tension, closed: false }), n = d.length >> 1;
    if (n < 2) return;
    g.beginPath(); g.moveTo(d[0], d[1]);
    for (let i = 1; i < n; i++) g.lineTo(d[2 * i], d[2 * i + 1]);
  }
  // point and unit tangent at fraction u (0..1) along a control-point spine
  function along(spine, u) {
    const d = tk.flatten(spine, { step: 2 }), n = d.length / 2 - 1, L = [0];
    for (let i = 1; i <= n; i++) L.push(L[i - 1] + Math.hypot(d[2 * i] - d[2 * i - 2], d[2 * i + 1] - d[2 * i - 1]));
    const s = clamp(u, 0, 1) * L[n];
    let i = 1;
    while (i < n && L[i] < s) i++;
    const f = clamp((s - L[i - 1]) / ((L[i] - L[i - 1]) || 1), 0, 1);
    let tx = d[2 * i] - d[2 * i - 2], ty = d[2 * i + 1] - d[2 * i - 1];
    const tl = Math.hypot(tx, ty) || 1;
    return { x: lerp(d[2 * i - 2], d[2 * i], f), y: lerp(d[2 * i - 1], d[2 * i + 1], f), tx: tx / tl, ty: ty / tl };
  }
  const rotAbout = (px, py, x, y, r) => { const c = Math.cos(r), s = Math.sin(r), dx = x - px, dy = y - py; return [px + dx * c - dy * s, py + dx * s + dy * c]; };
  // move, rotate and scale the context about a pivot (px, py): the way every creature body is posed
  function xform(ctx, px, py, dx, dy, rot, sx, sy) {
    ctx.translate(px + dx, py + dy);
    if (rot) ctx.rotate(rot);
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    ctx.translate(-px, -py);
  }
  const blink = (t, id, per) => {
    per = per || 3.6 + 1.6 * hv(id, 'bp');
    const ph = ((t + hv(id, 'bo') * per) % per + per) % per;
    return ph < 0.16 ? Math.abs(ph - 0.08) / 0.08 : 1;                      // 1 open, dips to 0 for a moment
  };

  // ---------------------------------------------------------------------------------------------------------------
  // THE FEED HELPER SET
  // ---------------------------------------------------------------------------------------------------------------
  const FEED = {};
  // generic icons, never a real platform's look. (x, y) is the centre, s about half the size.
  FEED.icon = function (g, kind, x, y, s, o) {
    if (!g) return;
    o = o || {};
    x = num(x); y = num(y); s = Math.max(0.5, num(s, 8));
    const lw = o.ink === undefined ? Math.max(0.8, s * 0.17) : num(o.ink), line = () => { if (lw > 0) { g.lineWidth = lw; g.strokeStyle = o.lineColor || C.line; g.lineJoin = 'round'; g.stroke(); } };
    g.save();
    if (kind === 'heart') { heartPath(g, x, y, s); g.fillStyle = o.col || C.pink; g.fill(); line(); if (o.glint !== false) { g.beginPath(); g.ellipse(x - s * 0.42, y - s * 0.32, s * 0.16, s * 0.1, -0.6, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fill(); } }
    else if (kind === 'thumb') {
      g.translate(x, y); if (o.down) g.scale(1, -1);
      const col = o.col || C.gold;
      g.beginPath(); rrPath(g, -s * 0.95, -s * 0.18, s * 0.42, s * 1.0, s * 0.12); g.fillStyle = o.cuff || C.blue; g.fill(); line();
      g.beginPath(); g.moveTo(-s * 0.48, -s * 0.12); g.lineTo(-s * 0.2, -s * 0.2); g.quadraticCurveTo(-s * 0.08, -s * 0.95, s * 0.12, -s * 0.92); g.quadraticCurveTo(s * 0.32, -s * 0.85, s * 0.18, -s * 0.24);
      g.lineTo(s * 0.62, -s * 0.24); g.quadraticCurveTo(s * 0.86, -s * 0.2, s * 0.78, s * 0.06); g.quadraticCurveTo(s * 0.86, s * 0.3, s * 0.7, s * 0.42); g.quadraticCurveTo(s * 0.76, s * 0.66, s * 0.5, s * 0.8);
      g.lineTo(-s * 0.48, s * 0.8); g.closePath(); g.fillStyle = col; g.fill(); line();
    } else if (kind === 'play') {
      g.beginPath(); g.moveTo(x - s * 0.42, y - s * 0.55); g.quadraticCurveTo(x - s * 0.52, y - s * 0.62, x - s * 0.48, y - s * 0.4); g.lineTo(x - s * 0.48, y + s * 0.4); g.quadraticCurveTo(x - s * 0.52, y + s * 0.62, x - s * 0.42, y + s * 0.55);
      g.lineTo(x + s * 0.58, y + s * 0.08); g.quadraticCurveTo(x + s * 0.7, y, x + s * 0.58, y - s * 0.08); g.closePath(); g.fillStyle = o.col || C.white; g.fill(); line();
    } else if (kind === 'dot') { g.beginPath(); g.arc(x, y, s * 0.62, 0, TAU); g.fillStyle = o.col || C.red; g.fill(); line(); g.beginPath(); g.arc(x - s * 0.2, y - s * 0.22, s * 0.16, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fill(); }
    else if (kind === 'bell') {
      g.beginPath(); g.moveTo(x - s * 0.7, y + s * 0.5); g.quadraticCurveTo(x - s * 0.5, y + s * 0.3, x - s * 0.5, y - s * 0.1); g.quadraticCurveTo(x - s * 0.48, y - s * 0.72, x, y - s * 0.74); g.quadraticCurveTo(x + s * 0.48, y - s * 0.72, x + s * 0.5, y - s * 0.1);
      g.quadraticCurveTo(x + s * 0.5, y + s * 0.3, x + s * 0.7, y + s * 0.5); g.closePath(); g.fillStyle = o.col || C.gold; g.fill(); line();
      g.beginPath(); g.arc(x, y + s * 0.62, s * 0.16, 0, TAU); g.fillStyle = o.col || C.gold; g.fill(); line();
    } else if (kind === 'spinner') {
      const a0 = num(o.t) * 5 * tk.motion();
      for (let i = 0; i < 8; i++) { const a = a0 + i / 8 * TAU; g.globalAlpha = 0.25 + 0.75 * i / 7; g.beginPath(); g.arc(x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.6, s * 0.15, 0, TAU); g.fillStyle = o.col || C.white; g.fill(); }
    } else if (kind === 'bubble') {
      g.beginPath(); rrPath(g, x - s, y - s * 0.66, s * 2, s * 1.24, s * 0.55); g.fillStyle = o.col || C.white; g.fill(); line();
      g.beginPath(); g.moveTo(x - s * 0.55, y + s * 0.5); g.lineTo(x - s * 0.82, y + s * 0.98); g.lineTo(x - s * 0.12, y + s * 0.56); g.fillStyle = o.col || C.white; g.fill(); line();
      g.beginPath(); g.moveTo(x - s * 0.5, y + s * 0.52); g.lineTo(x - s * 0.18, y + s * 0.52); g.lineWidth = lw * 1.4; g.strokeStyle = o.col || C.white; g.stroke();
      if (o.dots !== false) { g.fillStyle = o.dotCol || C.line; for (let i = -1; i <= 1; i++) { g.beginPath(); g.arc(x + i * s * 0.48, y - s * 0.04 + (o.t !== undefined ? Math.sin(num(o.t) * 8 - i) * s * 0.08 * tk.motion() : 0), s * 0.15, 0, TAU); g.fill(); } }
    }
    g.restore();
  };
  // the tiny loop a screen plays inside its glass (cx, cy, w, h), a = how lit it is
  function screenLoop(g, kind, cx, cy, w, h, t, seed) {
    const s = Math.min(w, h), m = tk.motion();
    if (kind === 'heart') {
      const pop = Math.pow(Math.sin(PI * fr(t * 1.1 + hv(seed, 'h'))), 2) * m;
      FEED.icon(g, 'heart', cx, cy + s * 0.04, s * (0.26 + 0.07 * pop), { ink: 0 });
      if (pop > 0.6) { g.globalAlpha *= (pop - 0.6) / 0.4; for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.6; tk.sparkle(g, cx + Math.cos(a) * s * 0.4, cy + Math.sin(a) * s * 0.36, s * 0.08, { color: '#ffffff', alpha: 0.9 }); } }
    } else if (kind === 'thumb') FEED.icon(g, 'thumb', cx, cy - Math.abs(Math.sin(t * 3.4 + seed)) * s * 0.08 * m, s * 0.3, { ink: 0, col: C.white, cuff: C.cyan });
    else if (kind === 'play') {
      FEED.icon(g, 'play', cx, cy - s * 0.06, s * 0.28, { ink: 0 });
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(cx - w * 0.38, cy + h * 0.3, w * 0.76, Math.max(1, h * 0.06));
      g.fillStyle = C.red; g.fillRect(cx - w * 0.38, cy + h * 0.3, w * 0.76 * fr(t * 0.21 + hv(seed, 'p')), Math.max(1, h * 0.06));
    } else if (kind === 'spinner') FEED.icon(g, 'spinner', cx, cy, s * 0.36, { t });
    else if (kind === 'dot') {
      const pu = fr(t * 0.9 + hv(seed, 'd'));
      g.save(); g.globalAlpha *= 1 - pu; g.beginPath(); g.arc(cx, cy, s * (0.2 + 0.3 * pu), 0, TAU); g.lineWidth = Math.max(1, s * 0.05); g.strokeStyle = C.red; g.stroke(); g.restore();
      FEED.icon(g, 'dot', cx, cy, s * 0.3, { ink: 0 });
    } else if (kind === 'feed' || kind === 'thread') {
      // posts scrolling up for ever: a picture (or an avatar) and two lines of text bars per row
      const rowH = Math.max(4, h * (kind === 'feed' ? 0.34 : 0.26)), off = fr(t * 0.45 * m + hv(seed, 'f')) * rowH, x0 = cx - w / 2;
      const pics = [C.pink, C.gold, C.green, C.cyan, C.red];
      for (let i = -1; i < h / rowH + 1; i++) {
        const y = cy - h / 2 + i * rowH - off + rowH * 0.12, k = (i + Math.floor(t * 0.45 * m + hv(seed, 'f')) + 99) % 5;
        if (kind === 'feed') {
          g.fillStyle = pics[k]; g.fillRect(x0 + w * 0.1, y, w * 0.3, rowH * 0.72);
          g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(x0 + w * 0.48, y + rowH * 0.08, w * 0.42, rowH * 0.14); g.fillRect(x0 + w * 0.48, y + rowH * 0.36, w * 0.3, rowH * 0.14);
          if (k === 1 || k === 3) FEED.icon(g, 'heart', x0 + w * 0.8, y + rowH * 0.6, rowH * 0.16, { ink: 0, glint: false });
        } else {
          g.beginPath(); g.arc(x0 + w * 0.16, y + rowH * 0.3, rowH * 0.24, 0, TAU); g.fillStyle = pics[k]; g.fill();
          g.fillStyle = 'rgba(255,255,255,0.72)'; g.fillRect(x0 + w * 0.32, y + rowH * 0.12, w * (0.36 + 0.2 * hv(k, 'l')), rowH * 0.16); g.fillRect(x0 + w * 0.32, y + rowH * 0.42, w * 0.3, rowH * 0.14);
          if (k === 2) FEED.icon(g, 'thumb', x0 + w * 0.86, y + rowH * 0.32, rowH * 0.24, { ink: 0, down: true, col: C.red, cuff: C.red });
        }
      }
    }
  }
  // a rounded glass screen centred on (x, y), w x h, playing a tiny loop (live: the loop and the light change every frame)
  FEED.screen = function (g, x, y, w, h, o) {
    if (!g) return;
    o = o || {};
    x = num(x); y = num(y); w = Math.max(3, num(w, 20)); h = Math.max(3, num(h, 30));
    const on = clamp(num(o.on, 1), 0, 1), t = num(o.t), lw = Math.max(0.8, num(o.lw, 2)), r = Math.min(w, h) * num(o.round, 0.22);
    const bz = Math.max(1.2, Math.min(w, h) * num(o.bezel, 0.1)), gw = w - bz * 2, gh = h - bz * 2, gr = Math.max(0, r - bz * 0.7);
    g.save();
    g.beginPath(); rrPath(g, x - w / 2, y - h / 2, w, h, r); g.fillStyle = o.case || C.night; g.fill(); g.lineWidth = lw; g.strokeStyle = C.line; g.lineJoin = 'round'; g.stroke();
    g.beginPath(); rrPath(g, x - gw / 2, y - gh / 2, gw, gh, gr); g.fillStyle = C.glassD; g.fill();
    g.save(); g.clip();
    if (on > 0.02) {
      g.globalAlpha *= on;
      g.fillStyle = o.glass || C.glass; g.fillRect(x - gw / 2, y - gh / 2, gw, gh);
      tk.glow(g, x, y, Math.max(gw, gh) * 0.6, o.light || C.cyan, 0.35);
      if (o.kind && o.kind !== 'face') screenLoop(g, o.kind, x, y, gw, gh, t, num(o.seed));
      g.globalAlpha = 1;
    }
    // one diagonal glint across the glass
    g.globalAlpha = 0.16 + 0.1 * on;
    g.beginPath(); g.moveTo(x - gw / 2, y - gh * 0.1); g.lineTo(x - gw * 0.1, y - gh / 2); g.lineTo(x + gw * 0.12, y - gh / 2); g.lineTo(x - gw / 2, y + gh * 0.16); g.closePath();
    g.fillStyle = '#ffffff'; g.fill();
    g.restore();
    g.restore();
  };
  // a glowing charging cable along control points (live)
  FEED.cable = function (g, pts, o) {
    if (!g || !Array.isArray(pts) || pts.length < 2) return;
    o = o || {};
    const w = Math.max(0.8, num(o.w, 4)), col = o.col || C.cyan, d = tk.flatten(pts, { step: 6, closed: false }), n = d.length >> 1;
    if (n < 2) return;
    const path = () => { g.beginPath(); g.moveTo(d[0], d[1]); for (let i = 1; i < n; i++) g.lineTo(d[2 * i], d[2 * i + 1]); };
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    if (o.glow !== false) { g.save(); g.globalAlpha *= 0.26; path(); g.strokeStyle = col; g.lineWidth = w * 3.4; g.stroke(); g.restore(); }
    path(); g.strokeStyle = C.line; g.lineWidth = w + num(o.lw, 2.2) * 2; g.stroke();
    g.strokeStyle = col; g.lineWidth = w; g.stroke();
    g.save(); g.globalAlpha *= 0.6; g.translate(-w * 0.18, -w * 0.18); g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(0.6, w * 0.28); g.stroke(); g.restore();
    if (o.t !== undefined && n > 2) {
      const u = fr(num(o.t) * num(o.speed, 0.5)), i = Math.min(n - 1, Math.floor(u * (n - 1)));
      tk.glow(g, d[2 * i], d[2 * i + 1], w * 3, col, 0.8);
    }
    const plug = (i, j) => {
      const x = d[2 * i], y = d[2 * i + 1], a = Math.atan2(y - d[2 * j + 1], x - d[2 * j]), pw = w * 2.2;
      g.save(); g.translate(x, y); g.rotate(a);
      g.beginPath(); rrPath(g, -pw * 0.8, -pw * 0.55, pw * 1.3, pw * 1.1, pw * 0.25); g.fillStyle = o.plugCol || C.white; g.fill(); g.lineWidth = num(o.lw, 2.2); g.strokeStyle = C.line; g.stroke();
      g.beginPath(); g.rect(pw * 0.5, -pw * 0.34, pw * 0.5, pw * 0.68); g.fillStyle = C.silver; g.fill(); g.stroke();
      g.restore();
    };
    if (o.plug === 'end' || o.plug === 'both') plug(n - 1, n - 2);
    if (o.plug === 'both') plug(0, 1);
    g.restore();
  };
  // every eye looks DOWN at its screen; won over, it looks up at the moon for the first time
  FEED.look = (st, lx) => { const w = st && st.won ? st.won : 0; return [lerp(num(lx, -0.35), 0.15, w), lerp(1, -1, w)]; };
  // twinkling glitter in a box [x, y, w, h]
  FEED.glitter = function (g, box, t, n, seed, col) {
    if (!g || !box) return;
    const m = tk.motion();
    for (let i = 0; i < n; i++) {
      const px = num(box[0]) + hv(seed, 'gx' + i) * num(box[2]), py = num(box[1]) + hv(seed, 'gy' + i) * num(box[3]), tw = Math.pow(0.5 + 0.5 * Math.sin(t * (2 + hv(seed, 'gs' + i) * 3) * m + i * 1.7), 3);
      if (tw > 0.15) tk.sparkle(g, px, py, 2 + 3.5 * tw, { color: col || '#fffbe8', alpha: tw });
    }
  };
  // notification bubbles drifting up like balloons from (x, y): a white bubble with a heart, a thumb or a red dot in it
  FEED.balloons = function (g, x, y, t, n, seed, o) {
    if (!g) return;
    o = o || {};
    const rise = num(o.rise, 60), spread = num(o.spread, 30), size = num(o.size, 7), kinds = o.kinds || ['heart', 'dot', 'thumb'], alpha = num(o.alpha, 1);
    for (let i = 0; i < n; i++) {
      const per = 1.6 + 0.8 * hv(seed, 'bp' + i), u = fr(t / per + hv(seed, 'bo' + i)), a = Math.sin(PI * u) * alpha;
      if (a < 0.05) continue;
      const bx = x + (hv(seed, 'bx' + i) - 0.5) * spread * 2 + Math.sin(u * 5 + i) * 4 * tk.motion() + num(o.drift) * u, by = y - u * rise, s = size * (0.7 + 0.5 * hv(seed, 'bs' + i));
      g.save(); g.globalAlpha *= cA(a);
      const k = kinds[i % kinds.length];
      FEED.icon(g, 'bubble', bx, by, s, { dots: k === 'dots', t, ink: Math.max(1, s * 0.16), col: o.col });
      if (k === 'thumb') FEED.icon(g, 'thumb', bx, by - s * 0.05, s * 0.42, { ink: 0, col: o.down ? C.red : C.blue, cuff: o.down ? C.red : C.blue, down: !!o.down });
      else if (k !== 'dots') FEED.icon(g, k === 'dot' ? 'dot' : 'heart', bx, by - s * 0.04, s * 0.42, { ink: 0, glint: false });
      g.restore();
    }
  };
  // drifting motes rising from (x, y): n particles, deterministic in t. o: col, size, rise (px/s), spread, life (s), alpha
  function motes(ctx, x, y, t, n, seed, o) {
    o = o || {};
    const col = o.col || C.cyan, size = o.size || 2.4, rise = num(o.rise, 30), spread = num(o.spread, 16), life = num(o.life, 1.6), m = tk.motion();
    ctx.save();
    for (let i = 0; i < n; i++) {
      const per = life * (0.7 + 0.6 * hv(seed, 'l' + i)), u = fr((t + hv(seed, 'p' + i) * per) / per);
      const a = Math.sin(u * PI) * (o.alpha === undefined ? 0.9 : o.alpha);
      if (a < 0.05) continue;
      const px = x + (hv(seed, 'x' + i) - 0.5) * spread * 2 + Math.sin(u * 5 + i) * 5 * m, py = y - u * rise * per;
      ctx.globalAlpha = cA(a);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, size * (0.5 + hv(seed, 's' + i)) * (1 - u * 0.5), 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  // a cartoon flame (live): an orange tongue with the navy line, a yellow middle and a cream core, three licks whose tips wander.
  // (x, y) is the centre of the round base, w the half width, h the height. o: lean (px), lw, glow (false to skip), glowK, line (false)
  function flame(g, x, y, w, h, t, seed, o) {
    o = o || {};
    const m = tk.motion(), nz = tk.noise1(t * 3.1 + seed * 5.3, seed) - 0.5, fl = 0.5 + 0.5 * Math.sin(t * 9 + seed) * m;
    const lean = num(o.lean) + nz * w * 1.3 * m, hh = Math.max(2, num(h, 20) * (0.9 + 0.18 * fl)), ww = Math.max(1, num(w, 8));
    if (o.glow !== false) tk.glow(g, x, y - hh * 0.35, hh + ww, '#ff9a3a', cA(num(o.glowK, 0.42)));
    const s1 = Math.sin(t * 11 + seed) * m, s2 = Math.sin(t * 13 + seed * 2) * m;
    const shape = (k) => {
      const lw = ww * k, lh = hh * (0.32 + 0.68 * k), lx = lean * k, by = y + ww * 0.12 * (1 - k);
      return [[x, by + lw * 0.85], [x - lw, by + lw * 0.15], [x - lw * 0.92, by - lh * 0.34], [x - lw * 0.7 + lx * 0.4, by - lh * (0.64 + 0.06 * s1), 1], [x - lw * 0.3 + lx * 0.6, by - lh * 0.5],
        [x + lx, by - lh, 1], [x + lw * 0.32 + lx * 0.6, by - lh * 0.52], [x + lw * 0.7 + lx * 0.4, by - lh * (0.68 + 0.06 * s2), 1], [x + lw * 0.92, by - lh * 0.3], [x + lw, by + lw * 0.15]];
    };
    g.save();
    [[1, '#ff8a2a'], [0.66, '#ffd84d'], [0.36, '#fff8ec']].forEach((L, i) => {
      g.beginPath(); tk.trace(g, shape(L[0]), 0, 0, 0.5); g.fillStyle = L[1]; g.fill();
      if (i === 0 && o.line !== false) { g.lineWidth = num(o.lw, 2.2); g.strokeStyle = C.line; g.lineJoin = 'round'; g.stroke(); }
    });
    g.restore();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // faces (live): eyes from the foe kit looking down (or up, once won over), mouths, brows
  // ---------------------------------------------------------------------------------------------------------------
  function eyes(g, st, x, y, w, o) {
    o = o || {};
    const won = st.won || 0, kind = o.kind || 'round';
    const opt = Object.assign({ act: 2, size: st.spec.size, iris: IRIS }, o);
    opt.kind = won > 0.5 && (kind === 'screen' || kind === 'glare' || kind === 'sleepy' || kind === 'dot') ? 'round' : kind;
    opt.look = FEED.look(st, o.lx);
    opt.open = clamp(num(o.open, 1) * (1 - num(o.lid, 0.18) * (1 - won)), 0, 1);
    FOE.eyes(g, x, y, w, opt);
  }
  function mouth(g, st, x, y, w, kind) {
    FOE.mouth(g, x, y, w, (st.won || 0) > 0.5 ? 'happyOpen' : kind, { act: 2, size: st.spec.size });
  }
  // a thick brow stroke; tilt > 0 lowers the inner end (grumpy), < 0 raises it (smug, worried); side -1 is the near (left) brow
  function brow(g, x, y, w, tilt, side, o) {
    o = o || {};
    const a = num(tilt) * 0.5 * (side < 0 ? 1 : -1), c = Math.cos(a), s = Math.sin(a);
    const raw = [[-w / 2, w * 0.04], [-w * 0.15, -w * 0.12], [w * 0.2, -w * 0.1], [w / 2, w * 0.06]];
    tk.inkPath(g, raw.map((p) => [x + p[0] * c - p[1] * s, y + p[0] * s + p[1] * c]), { w: num(o.w, Math.max(2, w * 0.2)), color: o.color || C.line, pressure: 'mid', taper: 0.5, wobble: 0.02 });
  }
  // the cast's blush: a soft pink oval and three tiny hatch strokes
  function blush(g, x, y, w, a) {
    g.save(); g.globalAlpha *= cA(num(a, 0.75));
    g.beginPath(); g.ellipse(x, y, w * 0.5, w * 0.3, 0, 0, TAU); g.fillStyle = C.blush; g.globalAlpha *= 0.6; g.fill(); g.globalAlpha /= 0.6;
    g.strokeStyle = '#ff5f7e'; g.lineWidth = Math.max(0.7, w * 0.08); g.lineCap = 'round'; g.beginPath();
    for (let i = -1; i <= 1; i++) { g.moveTo(x + i * w * 0.24 - w * 0.06, y + w * 0.12); g.lineTo(x + i * w * 0.24 + w * 0.06, y - w * 0.12); }
    g.stroke(); g.restore();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // the paint helper handed to every part
  // ---------------------------------------------------------------------------------------------------------------
  function makeS(g, spec, won) {
    const size = spec.size || 'm', ink = FOE.ink(2, size);
    const S = { g, spec, won: !!won, ink, lw: ink.main };
    S.cel = (pts, base, o) => FOE.cel(g, pts, base, Object.assign({ act: 2, size }, o));
    S.ell = (cx, cy, rx, ry, base, o) => S.cel(E(cx, cy, rx, ry), base, o);
    S.limb = (a, b, w, col, o) => FOE.limb(g, a, b, w, col, Object.assign({ act: 2, size }, o));
    S.line = (pts, o) => tk.inkPath(g, pts, Object.assign({ w: ink.mid, color: C.line, taper: 0.3, wobble: 0.03 }, o));
    S.fill = (pts, col, alpha, tension) => { g.save(); if (alpha !== undefined) g.globalAlpha *= cA(alpha); g.beginPath(); tk.trace(g, pts, 0, 0, tension); g.fillStyle = col; g.fill(); g.restore(); };
    S.rib = (spine, base, o) => tk.ribbon(g, spine, base, Object.assign({ line: ink.main, lineColor: C.line, gloss: false, strands: 0, rim: null, shadow: shadeOf(base), shadowW: 0.4 }, o));
    // the blue light of a screen held below, painted inside a decor callback (so it is clipped to the shape): gone once won over
    S.under = (x0, y0, x1, y1, a) => {
      if (S.won) return;
      const gr = g.createLinearGradient(0, y1, 0, lerp(y1, y0, 0.62));
      gr.addColorStop(0, 'rgba(63,200,255,' + (0.62 * num(a, 1)).toFixed(3) + ')'); gr.addColorStop(0.45, 'rgba(61,123,255,' + (0.3 * num(a, 1)).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(61,123,255,0)');
      g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    };
    S.blush = (x, y, w, a) => blush(g, x, y, w, a);
    return S;
  }
  const qOf = (s) => Math.max(0.5, Math.ceil(clamp(num(s, 1), 0.25, 2.5) * 2) / 2);

  // ---------------------------------------------------------------------------------------------------------------
  // spec registry and baking
  // ---------------------------------------------------------------------------------------------------------------
  function define(id, spec) {
    spec.id = id;
    spec.lw = FOE.ink(2, spec.size).main;
    spec.parts = spec.parts || {};
    spec.chains = spec.chains || {};
    spec._chain = {};
    SPECS[id] = spec;
    return spec;
  }
  function boxOf(p) { const b = p.box; return [b[0] - PAD, b[1] - PAD, b[2] + PAD, b[3] + PAD]; }
  function partSpr(spec, name, q, white, won) {
    const p = spec.parts[name], b = boxOf(p), w = b[2] - b[0], h = b[3] - b[1];
    return ART.sprite('en2|' + spec.id + '|' + name + '|' + q + (won ? '|u' : '') + (white ? '|w' : ''), w * q, h * q, (g) => {
      g.scale(q, q); g.translate(-b[0], -b[1]);
      p.draw(makeS(g, spec, won));
      if (white) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#ffffff'; g.fillRect(b[0], b[1], w, h); }
    });
  }
  function chainOf(spec, name, white, won) {
    const key = name + (won ? '|u' : '') + (white ? '|w' : '');
    let c = spec._chain[key];
    if (c) return c;
    const d = spec.chains[name];
    c = tk.chain('en2|' + spec.id + '|' + key, {
      spine: d.spine, cuts: d.cuts, reach: d.reach, overlap: d.overlap,
      draw: (g) => {
        d.draw(makeS(g, spec, won));
        if (white) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#ffffff'; g.fillRect(-600, -600, 1200, 1200); }
      },
    });
    spec._chain[key] = c;
    return c;
  }
  // draw the baked part `name` at its rest place, under an extra transform about its pivot. T = {x, y, r, sx, sy, a, kids, pre, noFlash}.
  // `kids(ctx)` runs inside the transform (after the sprite), `pre(ctx)` before it, both in REST coordinates, so children with their own pivots nest.
  function put(ctx, st, name, T) {
    T = T || {};
    const spec = st.spec, p = spec.parts[name];
    if (!p) return;
    const b = boxOf(p), pv = p.pivot || [0, 0], w = b[2] - b[0], h = b[3] - b[1], won = !!p.won && st.won > 0.5;
    ctx.save();
    ctx.translate(pv[0] + num(T.x, 0), pv[1] + num(T.y, 0));
    if (T.r) ctx.rotate(T.r);
    if (T.sx !== undefined || T.sy !== undefined) ctx.scale(T.sx === undefined ? 1 : T.sx, T.sy === undefined ? 1 : T.sy);
    const ga = ctx.globalAlpha;
    if (T.a !== undefined) ctx.globalAlpha = ga * cA(T.a);
    const ox = b[0] - pv[0], oy = b[1] - pv[1];
    if (T.pre) { ctx.save(); ctx.translate(-pv[0], -pv[1]); T.pre(ctx); ctx.restore(); }
    ctx.drawImage(partSpr(spec, name, st.q, false, won), ox, oy, w, h);
    if (st.flash > 0.02 && !T.noFlash) {
      const ga2 = ctx.globalAlpha;
      ctx.globalAlpha = ga2 * cA(st.flash);
      ctx.drawImage(partSpr(spec, name, st.q, true, won), ox, oy, w, h);
      ctx.globalAlpha = ga2;
    }
    ctx.globalAlpha = ga;
    if (T.kids) { ctx.translate(-pv[0], -pv[1]); T.kids(ctx); }
    ctx.restore();
  }
  // a chain part (a neck, a tail, a leg) drawn with per-joint bends (radians, see ART.tk.chain), under an optional transform
  function putChain(ctx, st, name, bends, T) {
    T = T || {};
    const spec = st.spec, d = spec.chains[name];
    if (!d) return;
    const won = !!d.won && st.won > 0.5;
    ctx.save();
    if (T.x || T.y) ctx.translate(num(T.x, 0), num(T.y, 0));
    if (T.r || T.sx !== undefined || T.sy !== undefined) {
      const o = d.spine[0];
      ctx.translate(o[0], o[1]);
      if (T.r) ctx.rotate(T.r);
      if (T.sx !== undefined || T.sy !== undefined) ctx.scale(T.sx === undefined ? 1 : T.sx, T.sy === undefined ? 1 : T.sy);
      ctx.translate(-o[0], -o[1]);
    }
    const ga = ctx.globalAlpha;
    if (T.a !== undefined) ctx.globalAlpha = ga * cA(T.a);
    chainOf(spec, name, false, won).draw(ctx, bends, st.q);
    if (st.flash > 0.02 && !T.noFlash) {
      ctx.globalAlpha = ctx.globalAlpha * cA(st.flash);
      chainOf(spec, name, true, won).draw(ctx, bends, st.q);
    }
    ctx.globalAlpha = ga;
    ctx.restore();
  }
  // where the tip of a chain part ends up for a set of bends (the same accumulation ART.tk.chain.draw does), and the total turn there
  function chainTip(spec, name, bends) {
    const c = chainOf(spec, name), d = spec.chains[name], end = d.spine[d.spine.length - 1];
    let M = tk.mat.I(), ang = 0;
    for (let j = 0; j < c.segs.length; j++) {
      const b = bends && bends[j] ? bends[j] : 0;
      if (b) M = tk.mat.mul(M, tk.mat.local(c.segs[j].pivot[0], c.segs[j].pivot[1], 0, 0, b, 1, 1));
      ang += b;
    }
    const p = tk.mat.pt(M, end[0], end[1]);
    return { x: p[0], y: p[1], r: ang, dx: p[0] - end[0], dy: p[1] - end[1] };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // the shared pose state (kept from the rigs this Act was built on)
  // attack: 0..0.3 anticipation (swing dips to -0.5), 0.3..0.5 strike (swing reaches 1 at p = 0.5), then recovery
  // hurt: recoil spike then settle;  block: guard rises fast and holds;  buff: a pulse;  die: 0..1 (the win-over);  telegraph: wind-up ramps to 1 and holds
  // ---------------------------------------------------------------------------------------------------------------
  function poseState(pose, t, pt) {
    const m = tk.motion();
    const P = { pose, t, pt, m, p: 0, swing: 0, hit: 0, hurt: 0, flash: 0, guard: 0, buff: 0, buffP: 0, die: 0, tele: 0, shake: 0 };
    if (pose === 'attack') {
      const p = clamp(pt / 0.42, 0, 1);
      P.p = p;
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
      P.p = p; P.buffP = p; P.buff = Math.sin(PI * p);
    } else if (pose === 'die') {
      P.p = clamp(pt / 0.7, 0, 1); P.die = P.p;
    } else if (pose === 'telegraph') {
      P.tele = sm(pt / 0.36);
      P.shake = P.tele * (0.6 + 0.4 * Math.sin(t * 47));
    }
    return P;
  }
  function makeState(spec, o) {
    o = o || {};
    const s = num(o.s, 1) > 0 ? num(o.s, 1) : 1, t = num(o.t, 0), pt = Math.max(0, num(o.pt, 0));
    const pose = POSES.indexOf(o.pose) >= 0 ? o.pose : 'idle';
    const E0 = poseState(pose, t, pt), hp = o.hpPct === undefined ? 1 : clamp(num(o.hpPct, 1), 0, 1);
    return { spec, E: E0, s, q: qOf(s), t, pt, pose, hp, phase: o.phase | 0, glow: num(o.glow, 0), flash: E0.flash, m: E0.m, won: 0 };
  }
  // the die pose: the win-over of the foe kit, drawn on the creature's idle rig with st.won rising (the screen dims, the eyes look up, a smile)
  function winOver(ctx, spec, st) {
    const p = st.E.die;
    if (p >= 1) return;
    const w = makeState(spec, { s: st.s, t: st.t, phase: st.phase, hpPct: st.hp });
    w.won = clamp(p / 0.3, 0, 1);
    FOE.winOver(ctx, w, p, {
      act: 2, box: spec.box, seed: spec.seed, hop: spec.hop || 18, confetti: 'hearts',
      draw: (g) => spec.rig(g, w),
      gloss: (g, S, k) => {
        // the last of the blue light: the screen's glare fading off the creature (and its filter, where it wore one)
        const sc = spec.scr;
        if (sc) tk.glow(g, sc[0], sc[1], sc[2] * 1.6, C.blue, cA(0.55 * k));
        if (typeof spec.gloss === 'function') spec.gloss(g, w, k);
      },
    });
  }
  function register(spec) {
    const B = spec.bounds, k = spec.k || 1;
    spec.box = spec.box || [-B.w / 2 / k, -B.h / k, B.w / 2 / k, 0];
    spec.seed = Math.round(hv(spec.id, 'seed') * 9999);
    ART.enemy.register(spec.id, {
      bounds: spec.bounds,
      draw(ctx, o) {
        const st = makeState(spec, o);
        ctx.save();
        try {
          if (spec.k) ctx.scale(spec.k, spec.k);
          if (st.E.die > 0) winOver(ctx, spec, st); else spec.rig(ctx, st);
        } finally { ctx.restore(); }
      },
    });
  }
  function warm(id, s) {
    const spec = Object.prototype.hasOwnProperty.call(SPECS, id) ? SPECS[id] : null;
    if (!spec) return 0;
    const q = qOf(s);
    let n = 0;
    Object.keys(spec.parts).forEach((k) => { partSpr(spec, k, q); n++; });
    Object.keys(spec.chains).forEach((k) => { n += chainOf(spec, k).warm(q); });
    return n;
  }

  // ===============================================================================================================
  // THE CREATURES
  // ===============================================================================================================
  // Common rig locals: E0 the pose state, sw the swing (-0.5 wind-up .. 1 strike), sl its strike half, tele the held wind-up, hurt, guard,
  // bp the buff pulse, won (0..1, only inside the win-over) and m the motion scale (0.3 with reduced motion).

  // ---------------------------------------------------------------------------------------------------------------
  // FLAMEBAIT (chochin, creature, m): a tall cartoon matchstick hopping on its end, its round match head crackling with a live flame, one
  // eyebrow raised and a smug little mouth, stubby arms, and a phone in one hand whose blue light comes up under its chin. Kept from its rig:
  // the live flame on top and the bob (now a hop). Matchwood tan, flame orange, red, screen blue.
  // ---------------------------------------------------------------------------------------------------------------
  const FB = { wood: '#f2c483', woodD: '#c98f4f', head: '#e8553f' };
  define('chochin', {
    size: 'm',
    bounds: { w: 118, h: 201, head: { x: 0, y: -176 }, body: { x: 0, y: -104 }, feet: { x: 0, y: 0 } },
    scr: [-31, -84, 22],
    parts: {
      stick: {
        box: [-14, -116, 14, 0], pivot: [0, -4],
        draw(S) {
          S.cel(RR(-11, -112, 22, 110, 10), FB.wood, { hi: true });
          S.line([[-3, -94], [-2, -60], [-4, -24]], { w: S.ink.fine, color: FB.woodD });
          S.line([[5, -80], [4, -52]], { w: S.ink.fine, color: FB.woodD });
          S.line([[2, -36], [3, -16]], { w: S.ink.fine, color: FB.woodD });
        },
      },
      head: {
        box: [-42, -176, 42, -98], pivot: [0, -106], won: true,
        draw(S) {
          S.cel(E(0, -136, 37, 34, 24), FB.head, {
            hi: true,
            decor(g) {
              g.fillStyle = 'rgba(90,24,40,0.28)'; g.beginPath(); g.ellipse(8, -172, 30, 10, 0, 0, TAU); g.fill();   // a sooty crown under the flame
              S.under(-42, -176, 42, -100);
            },
          });
          S.blush(-35, -121, 11); S.blush(8, -121, 11);
        },
      },
      armN: { box: [-40, -90, -2, -58], pivot: [-6, -84], draw(S) { S.limb([-6, -84], [-27, -70], 8, FB.wood); S.ell(-29, -68, 6.2, 5.8, FB.wood); } },
      armF: { box: [2, -90, 40, -56], pivot: [6, -84], draw(S) { S.limb([6, -84], [26, -70], 8, FB.woodD); S.ell(28, -68, 6, 5.6, FB.woodD); } },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, sl = Math.max(0, sw), tele = E0.tele, hurt = E0.hurt, guard = E0.guard, won = st.won, bp = Math.sin(PI * E0.buffP);
      // the hop: up on the beat and a squash on every landing (crouched and still on guard)
      const ph = fr(t / 0.64 + 0.2), up = Math.sin(PI * ph), land = Math.pow(1 - up, 8);
      const hop = (8 * up * m + 12 * bp) * (1 - 0.85 * guard) + 2 * tele * Math.abs(Math.sin(t * 20));
      const dx = -sw * 26 + hurt * 18 + tele * 5;
      const rot = -0.14 * sw + 0.16 * hurt + 0.07 * tele + 0.03 * Math.sin(TAU * t / 2.4) * m;
      const sy = 1 - 0.07 * land * m * (1 - guard) - 0.1 * guard + 0.05 * tele + 0.05 * bp, sx = 1 + (1 - sy) * 0.7;
      ctx.save();
      xform(ctx, 0, -4, dx, -hop, rot, sx, sy);
      put(ctx, st, 'armF', { r: -0.35 * Math.sin(TAU * t / 1.3) * m - 1.3 * bp - 0.4 * tele + 0.5 * guard + 0.3 * hurt });
      put(ctx, st, 'stick');
      // the flame crackles on top of the match head: taller wound up or cheering the others on, small when hit or on guard
      const fh = 50 + 26 * bp + 20 * tele + 14 * sl - 14 * hurt - 16 * guard;
      put(ctx, st, 'head', {
        r: lerp(-0.08, 0.16, won) + 0.03 * Math.sin(TAU * t / 2.1) * m - 0.08 * sw + 0.1 * hurt,
        pre(c) { flame(c, 4, -156, 21 + 4 * bp + 3 * tele, Math.max(14, fh), t, 1, { lean: 5 + 10 * hurt - 8 * sw, glowK: 0.32 + 0.2 * tele + 0.2 * bp, lw: st.spec.lw }); },
        kids(c) {
          const ang = clamp(tele + sl, 0, 1);
          eyes(c, st, -10, -138, 15, { open: blink(t, 'chochin') * (1 - 0.5 * hurt) * (1 + 0.1 * ang), gap: 21, lx: -0.5 });
          // one eyebrow up and one down: smug. Both come down on the wind-up
          brow(c, -21, -152 + 2 * ang, 12, 0.35 + 0.5 * ang, -1, { w: 3.4 });
          brow(c, 1, -157 + 5 * ang, 12, -0.55 + 1.0 * ang, 1, { w: 3.4 });
          mouth(c, st, -11, -117, 14, hurt > 0.3 ? 'ow' : sl > 0.2 ? 'grin' : tele > 0.3 ? 'smirkTeeth' : bp > 0.3 ? 'happyOpen' : 'smirk');
        },
      });
      // the near arm holds the phone up to its face (and in front of it on guard)
      put(ctx, st, 'armN', {
        r: 0.08 * Math.sin(TAU * t / 1.9) * m - 0.9 * sl + 0.3 * Math.max(0, -sw) - 0.6 * tele - 1.0 * guard + 0.2 * hurt,
        kids(c) {
          FEED.screen(c, -31, -80, 17, 27, { kind: 'heart', t, on: 1 - won, seed: 3, lw: 1.8 });
          if (won < 1) tk.glow(c, -31, -90, 34, C.blue, 0.26 * (1 - won));
        },
      });
      // Spicy Opinion: a jet of cartoon fire from the flame toward the heroes
      if (E0.pose === 'attack' && E0.p > 0.3 && E0.p < 0.8) {
        const jet = Math.sin(PI * (E0.p - 0.3) / 0.5);
        for (let i = 5; i >= 0; i--) {
          const u = i / 5;
          ctx.save(); ctx.translate(-30 - u * 100 * jet, -168 + u * 22 + Math.sin(t * 20 + i) * 4 * m); ctx.rotate(-1.3);
          flame(ctx, 0, 0, 6 + u * 9, 14 + u * 14, t + i * 0.3, 20 + i, { glowK: 0.22 * jet, lw: 2 });
          ctx.restore();
        }
      }
      ctx.restore();
      motes(ctx, dx + 4, -212 - hop, t, 4, 11, { col: '#ffb040', rise: 26, spread: 10, life: 1.4, alpha: 0.8 * (1 - won) });
      // Pile On: the whole thread gets louder (notification bubbles pop up around it)
      if (bp > 0.05) FEED.balloons(ctx, dx, -170 - hop, t, 4, 7, { alpha: bp, rise: 50, spread: 44, size: 8, kinds: ['dot', 'heart'] });
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // CLICKBAIT GOBLIN (karakuri_puppet, creature, m): a jerky wind-up goblin built from glossy cardboard thumbnails, a big red arrow on its back
  // where a wind-up key would be, a shocked open mouth and circled eyes, and a yellow highlighter glow round its outline. Its belly is a video
  // thumbnail playing on loop. Kept from its rig: the stop-motion tick timing and the key slot (now the arrow). Neon green, arrow red, yellow.
  // ---------------------------------------------------------------------------------------------------------------
  const CG = { skin: '#8be07a', skinD: '#5fb556', ear: '#ffa3b8', card: '#f6ead0', cardD: '#d9c59c', shoe: '#ff3b5c', glow: 'rgba(255,225,77,0.9)' };
  // the clickbait outline glow: a wide yellow stroke round a shape, painted under it
  function halo(S, pts, w) {
    const g = S.g;
    g.save(); g.beginPath(); tk.trace(g, pts); g.lineJoin = 'round'; g.lineWidth = w; g.strokeStyle = CG.glow; g.stroke(); g.restore();
  }
  const CG_EAR_N = [[-32, -150], [-62, -172, 1], [-38, -134]], CG_EAR_F = [[18, -156], [48, -178, 1], [26, -140]];
  const CG_TUFT = [[-18, -170], [-14, -190, 1], [-7, -174], [0, -194, 1], [5, -174], [13, -186, 1], [15, -168]];
  define('karakuri_puppet', {
    size: 'm',
    bounds: { w: 108, h: 194, head: { x: -2, y: -190 }, body: { x: 0, y: -100 }, feet: { x: 0, y: 0 } },
    scr: [0, -86, 24],
    parts: {
      legF: { box: [2, -70, 32, 2], pivot: [10, -64], draw(S) { S.cel(RR(5, -66, 10, 56, 3), CG.cardD, {}); S.cel(E(14, -8, 12, 7), shadeOf(CG.shoe), {}); } },
      legN: { box: [-34, -70, -2, 2], pivot: [-10, -64], draw(S) { S.cel(RR(-15, -66, 10, 56, 3), CG.card, { hi: true }); S.line([[-10, -50], [-10, -30]], { w: S.ink.fine, color: CG.cardD }); S.cel(E(-16, -8, 13, 7.5), CG.shoe, { hi: true }); } },
      armF: { box: [10, -108, 50, -64], pivot: [24, -102], draw(S) { S.limb([24, -102], [38, -80], 7, CG.cardD); S.ell(40, -76, 6.5, 6, '#e6e0d6'); } },
      torso: {
        box: [-32, -114, 32, -56], pivot: [0, -64],
        draw(S) {
          const card = RR(-28, -110, 56, 50, 9);
          halo(S, card, S.lw * 3.4);
          S.cel(card, CG.card, { hi: true });
          // a starburst sticker on the corner of the thumbnail
          S.cel(burstPts(20, -106, 6, 11, 9, 0.2), C.gold, {});
          S.ell(20, -106, 3.4, 3.4, C.red, { shadow: false });
        },
      },
      head: {
        box: [-66, -196, 54, -108], pivot: [-2, -114], won: true,
        draw(S) {
          [CG_EAR_F, CG_TUFT, E(-6, -146, 34, 29, 22), CG_EAR_N].forEach((p) => halo(S, p, S.lw * 3.4));
          S.cel(CG_EAR_F, CG.skinD, {});
          S.fill([[22, -152], [42, -170], [27, -144]], CG.ear, 0.9, 0.3);
          S.cel(CG_TUFT, '#4fae4a', {});
          S.cel(E(-6, -146, 34, 29, 22), CG.skin, { hi: true, decor(g) { S.under(-40, -176, 30, -116); } });
          S.cel(CG_EAR_N, CG.skin, {});
          S.fill([[-38, -150], [-56, -166], [-42, -140]], CG.ear, 0.9, 0.3);
          S.ell(-36, -138, 7, 6, CG.skin, { hi: true });                                          // a round goblin nose
          S.blush(-30, -128, 10); S.blush(10, -130, 10);
        },
      },
      arrow: {
        box: [10, -176, 84, -80], pivot: [20, -96],
        draw(S) {
          // the big red arrow where a wind-up key would be: a shaft and a fat head, pointing up and back
          const a = -1.0, c = Math.cos(a), s = Math.sin(a), at = (x, y, k) => (k ? [20 + x * c - y * s, -96 + x * s + y * c, 1] : [20 + x * c - y * s, -96 + x * s + y * c]);
          S.cel([at(0, -6.5), at(46, -6.5), at(44, -19, 1), at(76, 0, 1), at(44, 19, 1), at(46, 6.5), at(0, 6.5)], C.red, { hi: true, tension: 0.15 });
        },
      },
      armN: { box: [-52, -108, -14, -62], pivot: [-24, -102], draw(S) { S.limb([-24, -102], [-40, -80], 7, CG.card); S.ell(-42, -76, 7, 6.5, '#fffaf1', { hi: true }); } },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, sl = Math.max(0, sw), back = Math.max(0, -sw), tele = E0.tele, hurt = E0.hurt, guard = E0.guard, won = st.won, bp = Math.sin(PI * E0.buffP);
      // stop motion: the idle moves in ticks of a sixth of a second, like a wind-up toy filmed a frame at a time
      const tick = (v, r) => Math.floor(v * r) / r, ti = tick(t, 6);
      const step = Math.sin(TAU * ti / 0.66) * m, jerk = (Math.floor(t * 6) % 2 ? 1 : -1) * 0.025 * m;
      const dx = -sw * 30 + hurt * 18 + tele * 4, rot = jerk - 0.12 * sw + 0.16 * hurt + 0.05 * tele;
      const bob = Math.abs(step) * 4 + 8 * bp;
      ctx.save();
      xform(ctx, 0, -64, dx, -bob + 3 * guard, rot, 1, 1 - 0.05 * guard + 0.03 * tele);
      // the arrow turns like a key: a tick at a time at rest, spinning on All Caps and on the wind-up
      put(ctx, st, 'arrow', { r: 0.18 * Math.sin(TAU * ti / 1.3) * m + (tele > 0.05 ? tick(t * 0.8, 6) * 1.6 : 0) * m + bp * TAU * E0.buffP * 0.5 - 0.2 * hurt, sx: 1, sy: 1 - 0.4 * Math.abs(Math.sin(TAU * ti * 0.9)) * m });
      put(ctx, st, 'legF', { r: -0.22 * step - 0.1 * sw + 0.1 * hurt + 0.1 * guard });
      put(ctx, st, 'armF', { r: 0.25 * step - 0.6 * bp - 0.9 * tele + 0.6 * guard - 0.6 * sl });
      put(ctx, st, 'legN', { r: 0.22 * step + 0.35 * sl - 0.1 * hurt - 0.08 * tele });
      put(ctx, st, 'torso', { kids(c) { FEED.screen(c, 0, -84, 42, 34, { kind: 'play', t, on: 1 - won, seed: 5, lw: st.spec.lw * 0.8 }); } });
      tk.glow(ctx, -6, -146, 62, C.gold, (0.1 + 0.08 * Math.abs(Math.sin(ti * 3))) * (1 - won));
      put(ctx, st, 'head', {
        r: lerp(-0.07, 0.15, won) + 0.05 * Math.sin(TAU * tick(t, 4) / 3.1) * m + 0.22 * hurt - 0.05 * sw + 0.05 * tele * Math.sin(t * 40),
        kids(c) {
          const shock = clamp(tele + sl + bp, 0, 1);
          const open = blink(t, 'karakuri', 3.4) * (1 - 0.6 * hurt) * (1 + 0.15 * shock);
          eyes(c, st, -13, -150, 15 + 3 * shock, { open, gap: 21, lx: -0.4 });
          // the clickbait circles round both eyes, hand-drawn and jittering a frame at a time
          if (won < 0.5) [-23.5, -2.5].forEach((ex, i) => tk.inkPath(c, E(ex, -150, 13 + 2 * shock, 14 + 2 * shock, 14, i * 0.5), { closed: true, w: 2.4, color: C.red, wobble: 0.14, seed: Math.floor(t * 6) % 3 + i * 5, taper: 0 }));
          brow(c, -24, -167 - 4 * shock, 10, -0.3, -1);
          brow(c, -2, -168 - 4 * shock, 10, -0.3, 1);
          FOE.mouth(c, -21, -126, 16 + 6 * shock, won > 0.5 ? 'happyOpen' : hurt > 0.3 ? 'ow' : 'O', { act: 2, size: 'm' });
        },
      });
      put(ctx, st, 'armN', { r: -0.25 * step - 1.1 * sl + 0.5 * back - 1.0 * tele - 0.7 * bp + 1.1 * guard + 0.3 * hurt });
      ctx.restore();
      // Shock Reveal: a burst of yellow and red sticker stars where the thumbnail flashes
      if (E0.pose === 'attack' && E0.p > 0.4 && E0.p < 0.85) {
        const u = (E0.p - 0.4) / 0.45;
        ctx.save(); ctx.globalAlpha = cA(1 - u);
        for (let i = 0; i < 7; i++) { const a = -PI + (i - 3) * 0.32, r = 30 + 70 * u; tk.sparkle(ctx, dx - 20 + Math.cos(a) * r, -110 + Math.sin(a) * r * 0.7, 6 + 4 * (1 - u), { color: i % 2 ? C.gold : C.red, glow: 0.4 }); }
        ctx.restore();
      }
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // FILTER FAIRY (nopperabo, creature, m): a hovering fairy with a perfectly smooth, featureless oval face that shines like a screen, a ring-light
  // halo, wings of clear phone glass and a wand that is a tiny slider. Kept from its rig: the smooth glowing face and its ripple. Its screen is
  // its own face, under a filter; won over, the filter slides off and for the first time it has a little face of its own, looking up.
  // Blush pink, lilac, white glow.
  // ---------------------------------------------------------------------------------------------------------------
  const FF = { dress: '#ffb3cf', hair: '#b693ff', limb: '#c9b2ff', face: '#f6f2ff', glass: '#d8fbff', shoe: '#ff6fb5' };
  const FF_FACE = E(-4, -152, 25, 29, 22);
  function fairyWing(S, a, len, wid) {
    const g = S.g;
    g.save(); g.translate(10, -124); g.rotate(a);
    const pane = RR(-wid / 2, -len, wid, len, 9);
    S.cel(pane, FF.glass, { shadow: '#9feeff', hi: false });
    g.save(); g.beginPath(); tk.trace(g, pane); g.clip();
    g.fillStyle = 'rgba(63,240,255,0.4)'; g.fillRect(-wid, -len, wid * 2, len * 0.45);
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2; g.beginPath(); rrPath(g, -wid / 2 + 3.5, -len + 3.5, wid - 7, len - 7, 6); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.moveTo(-wid / 2, -len * 0.55); g.lineTo(-wid * 0.1, -len); g.lineTo(wid * 0.15, -len); g.lineTo(-wid / 2, -len * 0.38); g.closePath(); g.fill();
    g.restore();
    g.restore();
  }
  define('nopperabo', {
    size: 'm', k: 0.9,
    bounds: { w: 122, h: 204, head: { x: 0, y: -180 }, body: { x: 0, y: -92 }, feet: { x: 0, y: 0 } },
    scr: [-4, -152, 30],
    gloss(g, st, k) { FOE.glossSheen(g, [-30, -182, 52, 60], k, { shape: FF_FACE, t: st.t, seed: 2 }); },
    parts: {
      halo: {
        box: [-52, -214, 60, -100], pivot: [4, -157],
        draw(S) {
          const ring = E(4, -157, 53, 53, 34).concat(E(4, -157, 44, 44, 30).reverse());
          S.cel(ring, '#ffffff', { shadow: '#e4dcff', hi: false, tension: 0.5 });
          for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; S.g.beginPath(); S.g.arc(4 + Math.cos(a) * 48.5, -157 + Math.sin(a) * 48.5, 1.5, 0, TAU); S.g.fillStyle = '#fff6c8'; S.g.fill(); }
        },
      },
      wingF: { box: [-6, -206, 84, -108], pivot: [10, -124], draw(S) { fairyWing(S, 0.6, 68, 36); } },
      wingN: { box: [-6, -176, 74, -102], pivot: [10, -124], draw(S) { fairyWing(S, 1.12, 52, 28); } },
      legs: {
        box: [-20, -98, 20, -40], pivot: [0, -92],
        draw(S) {
          S.limb([5, -92], [7, -64], 7, shadeOf(FF.limb)); S.ell(8, -58, 7.5, 5.5, shadeOf(FF.shoe), {});
          S.limb([-6, -92], [-8, -62], 7, FF.limb); S.ell(-10, -56, 8, 6, FF.shoe, { hi: true });
        },
      },
      dress: {
        box: [-34, -134, 34, -84], pivot: [0, -112],
        draw(S) {
          const hem = [[-12, -128], [12, -128]];
          for (let i = 0; i <= 6; i++) { const x = 28 - i * 56 / 6; hem.push([x, -90 + (i % 2 ? 4 : 0)]); }
          S.cel(hem, FF.dress, { hi: true, tension: 0.45 });
          S.cel([[-9, -129], [0, -121], [9, -129], [4, -132], [-4, -132]], C.white, { shadow: false });
          FEED.glitter(S.g, [-22, -122, 44, 28], 0, 6, 9, '#ffffff');
        },
      },
      armF: { box: [6, -130, 44, -96], pivot: [12, -124], draw(S) { S.limb([12, -124], [28, -108], 6.5, shadeOf(FF.limb)); S.ell(30, -106, 5.5, 5, shadeOf(FF.face), {}); } },
      head: {
        box: [-44, -204, 46, -122], pivot: [0, -128],
        draw(S) {
          S.cel(E(3, -158, 35, 36, 24), FF.hair, { hi: true });                                       // the hair behind
          S.cel(FF_FACE, FF.face, {
            shadow: false,
            decor(g) {
              const gr = g.createRadialGradient(-10, -160, 2, -4, -152, 32);
              gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.6, 'rgba(240,232,255,0.6)'); gr.addColorStop(1, 'rgba(200,178,255,0.75)');
              g.fillStyle = gr; g.fillRect(-32, -184, 56, 64);
            },
          });
          // the fringe and two side locks framing the blank face, and a star clip
          S.cel([[-31, -160], [-27, -180], [-8, -191], [16, -188], [30, -170], [22, -166], [11, -173], [0, -166], [-11, -173], [-22, -163]], FF.hair, { hi: true });
          S.cel([[-30, -164], [-35, -140], [-31, -124], [-25, -132], [-24, -152]], FF.hair, {});
          S.cel([[22, -166], [28, -142], [24, -126], [18, -134], [18, -154]], shadeOf(FF.hair), {});
          S.cel(burstPts(20, -182, 3.2, 7.5, 5, -PI / 2), C.gold, { shadow: false });
        },
      },
      armN: {
        box: [-64, -150, -6, -94], pivot: [-12, -124],
        draw(S) {
          // the wand: a little stick with a slider track on top (the knob is live)
          S.limb([-34, -104], [-46, -128], 3.2, C.white);
          S.cel(RR(-56, -146, 9, 26, 4.5), '#e9e2ff', { hi: true });
          S.line([[-51.5, -141], [-51.5, -125]], { w: 1.6, color: '#9d8ac9', taper: 0 });
          S.limb([-12, -124], [-30, -106], 6.5, FF.limb); S.ell(-33, -104, 6, 5.6, FF.face, { hi: true });
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, sl = Math.max(0, sw), tele = E0.tele, hurt = E0.hurt, guard = E0.guard, won = st.won, bp = Math.sin(PI * E0.buffP);
      const lift = 12 + 4 * Math.sin(TAU * t / 2.2) * m + 6 * tele + 8 * bp - 4 * guard;
      const dx = -sw * 30 + hurt * 18 + tele * 4, rot = -0.1 * sw + 0.14 * hurt + 0.04 * Math.sin(TAU * t / 3.1) * m;
      const flap = Math.abs(Math.sin(t * (7 + 6 * bp))) * m;
      ctx.save();
      xform(ctx, 0, -110, dx, -lift, rot, 1, 1 - 0.04 * guard);
      tk.glow(ctx, 4, -157, 84, '#ffffff', (0.3 + 0.2 * tele + 0.2 * bp) * (1 - 0.5 * won));
      put(ctx, st, 'halo', { r: 0.1 * Math.sin(TAU * t / 4) * m, sx: 1 + 0.04 * tele, sy: 1 + 0.04 * tele });
      put(ctx, st, 'wingF', { r: -0.25 * flap - 0.5 * guard, sx: 1 - 0.3 * flap });
      put(ctx, st, 'wingN', { r: 0.2 * flap - 0.7 * guard, sx: 1 - 0.3 * flap });
      put(ctx, st, 'legs', { r: 0.06 * Math.sin(TAU * t / 1.6) * m + 0.2 * hurt });
      put(ctx, st, 'armF', { r: 0.2 * Math.sin(TAU * t / 1.8) * m - 0.8 * bp + 0.5 * guard });
      put(ctx, st, 'dress', { sx: 1 + 0.03 * Math.sin(TAU * t / 1.1) * m });
      put(ctx, st, 'head', {
        r: lerp(-0.12, 0.16, won) + 0.04 * Math.sin(TAU * t / 2.7) * m - 0.08 * sw + 0.12 * hurt,
        kids(c) {
          // the filter: an opalescent sheen sliding across the blank face; it ripples when the fairy acts or is hit
          FOE.glossSheen(c, [-30, -182, 52, 60], (0.75 + 0.25 * tele) * (1 - won), { shape: FF_FACE, t, seed: 2 });
          const rip = clamp(tele + sl + hurt + bp, 0, 1);
          if (rip > 0.02 && won < 0.5) {
            c.save(); c.beginPath(); tk.trace(c, FF_FACE); c.clip();
            for (let i = 0; i < 3; i++) { const u = fr(t * 1.4 + i / 3); c.globalAlpha = cA((1 - u) * rip * 0.8); c.strokeStyle = '#b693ff'; c.lineWidth = 2; c.beginPath(); c.ellipse(-6, -150, 4 + u * 26, 3 + u * 30, 0, 0, TAU); c.stroke(); }
            c.restore();
          }
          if (won > 0.3) { c.save(); c.globalAlpha *= cA((won - 0.3) / 0.4); eyes(c, st, -8, -152, 9, { gap: 13 }); mouth(c, st, -8, -138, 9, 'smile'); blush(c, -22, -142, 7); blush(c, 6, -142, 7); c.restore(); }
        },
      });
      // the slider wand: the knob slides up as the filter goes on
      const slide = clamp(0.2 + 0.8 * sl + 0.6 * tele + 0.3 * Math.sin(TAU * t / 3) * m, 0, 1);
      put(ctx, st, 'armN', {
        r: 0.1 * Math.sin(TAU * t / 1.8) * m - 0.5 * sl + 0.3 * Math.max(0, -sw) - 0.4 * tele + 0.8 * guard,
        kids(c) {
          FEED.icon(c, 'dot', -51.5, lerp(-126, -141, slide), 4.2, { col: C.pink, ink: 1.6 });
          tk.glow(c, -51.5, -134, 16, C.pink, 0.3 + 0.4 * tele);
        },
      });
      ctx.restore();
      // Beauty Filter: a sparkling beam from the wand toward the heroes
      if (E0.pose === 'attack' && E0.p > 0.32) {
        const u = clamp((E0.p - 0.32) / 0.5, 0, 1);
        for (let i = 0; i < 8; i++) { const v = i / 7, a = (1 - u) * Math.sin(PI * clamp(u * 1.4 - v * 0.4, 0, 1)); if (a > 0.05) tk.sparkle(ctx, dx - 60 - v * 150 * u, -150 - lift + Math.sin(i * 2.3) * 12, 5 + 3 * (1 - v), { color: i % 2 ? '#ffffff' : C.pink, alpha: a, glow: 0.5 }); }
      }
      if (bp > 0.05) FEED.glitter(ctx, [dx - 50, -220 - lift, 100, 90], t, 7, 4, '#ffffff');
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // NOTIFICATION IMP (tsukumogami, creature, m): a round alert-red dot with a little gold bell for a hat, skinny arms and legs, one wide glaring
  // eye, and a screen on its belly where a white number keeps counting up (the only number painted in the Act). Kept from its rig: the skinny
  // limbs and the one eye. Alert red, white, bell gold.
  // ---------------------------------------------------------------------------------------------------------------
  const NI = { body: '#ff3b5c', limb: '#2e335c', glove: '#fffaf1', shoe: '#ff6f8a' };
  define('tsukumogami', {
    size: 'm',
    bounds: { w: 124, h: 200, head: { x: 0, y: -196 }, body: { x: 0, y: -88 }, feet: { x: 0, y: 0 } },
    scr: [0, -86, 24],
    parts: {
      legF: { box: [6, -80, 34, 2], pivot: [14, -74], draw(S) { S.limb([14, -74], [16, -12], 4.6, NI.limb); S.ell(19, -8, 10, 6.5, shadeOf(NI.shoe), {}); } },
      legN: { box: [-36, -80, -4, 2], pivot: [-14, -74], draw(S) { S.limb([-14, -74], [-16, -12], 4.6, NI.limb); S.ell(-20, -8, 11, 7, NI.shoe, { hi: true }); } },
      armF: { box: [28, -124, 68, -86], pivot: [34, -116], draw(S) { S.limb([34, -116], [53, -100], 4.2, NI.limb); S.ell(56, -98, 6.6, 6.2, '#e8e2f2', {}); } },
      body: {
        box: [-50, -166, 50, -66], pivot: [0, -72], won: true,
        draw(S) {
          S.cel(E(0, -116, 47, 46, 28), NI.body, { hi: true, decor(g) { S.under(-50, -166, 50, -72, 0.85); } });
          S.blush(-32, -110, 11); S.blush(24, -112, 11);
        },
      },
      bell: {
        box: [-16, -32, 16, 6], pivot: [0, 0],
        draw(S) {
          S.cel([[-15, 0], [-11, -5], [-10, -15], [-6, -23], [0, -26], [6, -23], [10, -15], [11, -5], [15, 0], [0, 2]], C.gold, { hi: true, tension: 0.4 });
          S.line([[-12, -4], [12, -4]], { w: S.ink.fine, color: '#c99a2a' });
          S.ell(0, -28, 3.4, 3, C.gold, {});
          S.ell(0, 3, 3.6, 3.4, '#e0a92e', {});
        },
      },
      armN: { box: [-68, -124, -28, -86], pivot: [-34, -116], draw(S) { S.limb([-34, -116], [-53, -100], 4.2, NI.limb); S.ell(-56, -98, 7, 6.6, NI.glove, { hi: true }); } },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, sl = Math.max(0, sw), tele = E0.tele, hurt = E0.hurt, guard = E0.guard, won = st.won, bp = Math.sin(PI * E0.buffP);
      const step = Math.sin(TAU * t / 0.9) * m;
      // Pocket Buzz: on the wind-up it vibrates like a phone in a pocket
      const buzz = tele * Math.sin(t * 60) * 1.6;
      const dx = -sw * 28 + hurt * 18 + tele * 4 + buzz, rot = -0.1 * sw + 0.16 * hurt + 0.03 * Math.sin(TAU * t / 1.8) * m;
      const bob = Math.abs(step) * 4 + 8 * bp;
      ctx.save();
      xform(ctx, 0, -72, dx, -bob + 3 * guard, rot, 1 + 0.03 * guard, 1 - 0.06 * guard + 0.04 * tele);
      put(ctx, st, 'legF', { r: -0.2 * step - 0.1 * sw + 0.12 * hurt });
      put(ctx, st, 'armF', { r: 0.3 * Math.sin(TAU * t / 1.4) * m - 1.0 * bp - 0.6 * tele + 0.8 * guard });
      put(ctx, st, 'legN', { r: 0.2 * step + 0.3 * sl - 0.1 * hurt });
      put(ctx, st, 'body', {
        kids(c) {
          const ang = clamp(tele + sl + 0.6 * hurt, 0, 1);
          eyes(c, st, -4, -131, 30, { n: 1, kind: 'glare', lid: 0.12, open: blink(t, 'tsuku', 3.2) * (1 - 0.5 * hurt) * (1 + 0.1 * ang), lx: -0.5 });
          brow(c, -4, -153 + 2 * ang, 24, 0.45 + 0.4 * ang, 1, { w: 4.2 });
          mouth(c, st, -6, -107, 11, hurt > 0.3 || sl > 0.3 ? 'ow' : 'grumble');
          // the belly screen and its number: it keeps counting up, and shows 99+ when it means business
          FEED.screen(c, 0, -86, 40, 25, { kind: 'face', on: 1 - won, lw: st.spec.lw * 0.8 });
          if (won < 0.5) {
            const N = tele > 0.5 || bp > 0.4 ? '99+' : String(1 + (Math.floor(t * 1.4 + 3) % 98));
            c.save(); c.font = '900 ' + (N.length > 2 ? 14 : 16) + 'px ' + tk.font.num; c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillStyle = '#ffffff'; c.fillText(N, 0, -85); c.restore();
          }
        },
      });
      // the bell hat rings: a wobble at rest, a proper ding on every ping
      const ding = (E0.pose === 'attack' ? Math.sin(E0.p * 30) * (1 - E0.p) : 0) + tele * 0.25 * Math.sin(t * 24) + bp * 0.4 * Math.sin(t * 20);
      put(ctx, st, 'bell', { x: 8, y: -158, r: 0.32 + 0.08 * Math.sin(TAU * t / 1.4) * m + 0.6 * ding - 0.2 * hurt });
      put(ctx, st, 'armN', { r: -0.3 * Math.sin(TAU * t / 1.4 + 1) * m - 1.2 * sl + 0.4 * Math.max(0, -sw) - 0.5 * tele - 0.8 * bp + 1.0 * guard + 0.3 * hurt });
      ctx.restore();
      // sound rings off the bell, buzz marks either side, and on Ping Storm a spray of red dots at the heroes
      const ring = clamp(Math.abs(ding) * 2 + 0.6 * tele, 0, 1) * (1 - won);
      if (ring > 0.05) {
        ctx.save(); ctx.lineCap = 'round';
        for (let i = 0; i < 2; i++) { const u = fr(t * 1.6 + i * 0.5), r = 18 + u * 26; ctx.globalAlpha = cA((1 - u) * ring); ctx.strokeStyle = C.gold; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(dx + 8, -180 - bob, r, -PI * 0.85, -PI * 0.15); ctx.stroke(); }
        ctx.restore();
      }
      if (tele > 0.05) {
        ctx.save(); ctx.globalAlpha = cA(tele); ctx.strokeStyle = C.line; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
        [-1, 1].forEach((sd) => { for (let k = 0; k < 2; k++) { ctx.beginPath(); ctx.arc(dx, -116 - bob, 56 + k * 9, sd < 0 ? PI - 0.3 : -0.3, sd < 0 ? PI + 0.3 : 0.3); ctx.stroke(); } });
        ctx.restore();
      }
      if (E0.pose === 'attack' && E0.p > 0.36) {
        const u = clamp((E0.p - 0.36) / 0.55, 0, 1);
        for (let i = 0; i < 6; i++) { const a = (1 - u) * 1.2; if (a > 0.05) { ctx.save(); ctx.globalAlpha = cA(a); FEED.icon(ctx, 'dot', dx - 40 - u * (120 + 30 * i), -120 - bob + (i - 2.5) * 18 * u - 30 * Math.sin(PI * u), 7, { ink: 1.8 }); ctx.restore(); } }
      }
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // GRUMBLE CLOUD (lantern_wisp, sidekick, s): a little grey puff of cloud with a pout, two zigzag lightning eyebrows, a tiny speech bubble over
  // its head and a tiny phone in its stubby hands; won over, it turns pink and rains a little rainbow. Kept from its rig: the bob and the big
  // eyes. Storm grey, cyan, rainbow.
  // ---------------------------------------------------------------------------------------------------------------
  const GCL = { grey: '#c0c6da', pink: '#ffc8de' };
  define('lantern_wisp', {
    size: 's', k: 1.15,
    bounds: { w: 70, h: 131, head: { x: 0, y: -100 }, body: { x: 0, y: -50 }, feet: { x: 0, y: 0 } },
    scr: [-2, -42, 12],
    hop: 12,
    parts: {
      cloud: {
        box: [-34, -82, 34, -36], pivot: [0, -50], won: true,
        draw(S) {
          S.cel(cloudPts(0, -59, 25, 15, 7, 3), S.won ? GCL.pink : GCL.grey, { hi: true, decor(g) { S.under(-34, -82, 34, -40); } });
          S.blush(-17, -52, 8); S.blush(10, -53, 8);
        },
      },
      bubble: { box: [0, -104, 30, -82], pivot: [8, -86], draw(S) { FEED.icon(S.g, 'bubble', 15, -95, 9, { ink: S.ink.mid }); } },
      arms: { box: [-22, -54, 18, -30], pivot: [0, -48], draw(S) { S.limb([-14, -48], [-8, -38], 6, S.won ? GCL.pink : GCL.grey); S.limb([12, -48], [6, -38], 6, shadeOf(GCL.grey)); } },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, sl = Math.max(0, sw), tele = E0.tele, hurt = E0.hurt, guard = E0.guard, won = st.won, bp = Math.sin(PI * E0.buffP);
      const bob = 8 + Math.sin(TAU * t / 1.8) * 4 * m + Math.sin(TAU * t / 0.7) * 1.2 * m - 3 * tele + 5 * bp;
      const dx = -sw * 34 + hurt * 14, size = 1 + 0.25 * sl + 0.12 * tele + 0.18 * bp - 0.15 * hurt;
      ctx.save();
      ctx.translate(dx, -bob);
      // drizzle under it (a rainbow once it is won over)
      ctx.save(); ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const u = fr(t * 1.5 + i * 0.37), x = -10 + i * 9;
        ctx.globalAlpha = cA(Math.sin(PI * u) * 0.8); ctx.strokeStyle = won > 0.5 ? ['#ff6f6f', '#ffd84d', '#6dd5ff'][i] : '#8fd0ff'; ctx.lineWidth = won > 0.5 ? 3 : 1.8;
        ctx.beginPath(); ctx.moveTo(x, -34 + u * 24); ctx.lineTo(x - 2, -28 + u * 24); ctx.stroke();
      }
      ctx.restore();
      if (won > 0.5) {
        ctx.save(); ctx.globalAlpha = cA((won - 0.5) * 2); ctx.lineWidth = 2.6;
        ['#ff6f6f', '#ffb347', '#ffd84d', '#6dff8a', '#6dd5ff', '#b693ff'].forEach((col, i) => { ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(0, -20, 22 - i * 2.6, PI * 1.08, PI * 1.92); ctx.stroke(); });
        ctx.restore();
      }
      ctx.save(); ctx.translate(0, -50); ctx.scale(size, size); ctx.translate(0, 50);
      put(ctx, st, 'bubble', { r: 0.08 * Math.sin(TAU * t / 1.5) * m + 0.2 * hurt, sx: 1 + 0.2 * bp, sy: 1 + 0.2 * bp });
      put(ctx, st, 'cloud', {
        sx: 1 + 0.04 * Math.sin(TAU * t / 1.3) * m, sy: 1 - 0.04 * Math.sin(TAU * t / 1.3) * m,
        kids(c) {
          const ang = clamp(0.6 + tele + sl, 0, 1.4) * (1 - won);
          eyes(c, st, -4, -61, 12, { open: blink(t, 'wisp', 3.0) * (1 - 0.5 * hurt), gap: 15, lx: -0.5 });
          // two zigzag lightning eyebrows (gone once it cheers up)
          if (won < 0.5) [-11.5, 3.5].forEach((bx, i) => {
            const d = i ? -1 : 1, pts = [[bx - 6, -72 - d * 2 * ang], [bx - 2, -75], [bx + 1, -71], [bx + 5, -74 + d * 2 * ang]];
            tk.inkPath(c, pts, { w: 4.4, color: C.line, taper: 0.1, wobble: 0 }); tk.inkPath(c, pts, { w: 2, color: C.gold, taper: 0.1, wobble: 0 });
          });
          mouth(c, st, -4, -51, 7, hurt > 0.3 || sl > 0.3 ? 'O' : 'frown');
        },
      });
      put(ctx, st, 'arms', { r: 0.1 * Math.sin(TAU * t / 1.6) * m + 0.4 * guard, kids(c) { FEED.screen(c, -1, -40, 11, 15, { kind: 'thumb', t, on: 1 - won, seed: 8, lw: 1.4 }); } });
      ctx.restore();
      // Snarky Reply: a tiny lightning bolt at the heroes; Agree Loudly: a ring of cover
      if (E0.pose === 'attack' && E0.p > 0.35 && E0.p < 0.8) {
        const u = (E0.p - 0.35) / 0.45;
        ctx.save(); ctx.globalAlpha = cA(Math.sin(PI * u));
        const pts = [[-24, -56], [-40, -50], [-36, -44], [-58, -38], [-52, -32], [-80, -24]];
        tk.inkPath(ctx, pts, { w: 5, color: C.line, taper: 0.2, wobble: 0 }); tk.inkPath(ctx, pts, { w: 2.6, color: C.gold, taper: 0.2, wobble: 0 });
        ctx.restore();
      }
      if (guard > 0.05 || bp > 0.05) { const a = Math.max(guard, bp); ctx.save(); ctx.globalAlpha = cA(a * 0.7); ctx.strokeStyle = C.cyan; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(0, -56, 34 + 8 * a, 0, TAU); ctx.stroke(); ctx.restore(); }
      ctx.restore();
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // UNSKIPPABLE AD (drowned_samurai, creature, l): a tall walking billboard screen on two thin legs with a looping cartoon mascot inside, a
  // greyed-out SKIP button in one corner that never lights up (until it is won over), and starburst price stickers making a sparkly frame
  // (its Sequins). Kept from its rig: the stance, the telegraphed heavy timing, and the plate layers (now the sticker frame).
  // Screen blue, sale yellow, red. The art word SKIP is painted on the button.
  // ---------------------------------------------------------------------------------------------------------------
  const UA = { frame: '#ff4d6d', limb: '#2e335c', glove: '#fffaf1', mascot: '#ffb347' };
  const UA_GLASS = [-60, -282, 120, 146];
  const UA_STICKERS = [[-70, -292, 15, C.gold], [68, -286, 12, C.gold], [-80, -214, 11, '#ff9f1c'], [-68, -128, 13, C.gold], [78, -158, 12, '#ff9f1c'], [4, -302, 10, C.gold], [76, -236, 9, C.gold]];
  define('drowned_samurai', {
    size: 'l',
    bounds: { w: 170, h: 321, head: { x: 0, y: -262 }, body: { x: 0, y: -140 }, feet: { x: 0, y: 0 } },
    scr: [0, -210, 70],
    hop: 14,
    parts: {
      legF: { box: [12, -132, 52, 4], pivot: [24, -126], draw(S) { S.limb([24, -126], [28, -16], 7, shadeOf(UA.limb)); S.ell(33, -9, 16, 8.5, '#dfe2f0', {}); } },
      armF: { box: [60, -228, 104, -158], pivot: [72, -220], draw(S) { S.limb([72, -220], [86, -178], 6, shadeOf(UA.limb)); S.ell(89, -172, 9, 8.5, '#e2e0ec', {}); } },
      legN: { box: [-54, -132, -12, 4], pivot: [-24, -126], draw(S) { S.limb([-24, -126], [-28, -16], 7, UA.limb); S.ell(-35, -9, 17, 9, '#f6f6ff', { hi: true }); S.line([[-46, -10], [-26, -12]], { w: 2.4, color: C.red, taper: 0 }); } },
      frame: {
        box: [-96, -318, 96, -112], pivot: [0, -126],
        draw(S) {
          // two little lamps on top, the red frame, the dark bezel round the glass (the glass and its loop are live)
          [[-40, -1], [40, 1]].forEach((L) => { S.limb([L[0], -296], [L[0] + L[1] * 6, -310], 4, '#3a3f66'); S.cel(cap(L[0] - 9, -310, L[0] + 9, -312, 12, 10), '#4a5080', { hi: true }); });
          S.cel(RR(-76, -298, 152, 178, 18), UA.frame, { hi: true });
          S.cel(RR(-66, -288, 132, 158, 11), C.night, { shadow: false });
          UA_STICKERS.forEach((k, i) => { S.cel(burstPts(k[0], k[1], k[2] * 0.62, k[2], 10, i * 0.3), k[3], { hi: true }); S.ell(k[0], k[1], k[2] * 0.32, k[2] * 0.32, i % 2 ? C.red : C.white, { shadow: false }); });
        },
      },
      skip: {
        box: [12, -162, 62, -140], pivot: [37, -151],
        draw(S) {
          const g = S.g;
          S.cel(RR(14, -160, 46, 18, 8), '#7d8299', { shadow: false, line: S.ink.fine * 2 });
          g.save(); g.font = '800 10px ' + tk.font.num; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#c3c7da'; g.fillText('SKIP', 32, -150.5); g.restore();
          g.beginPath(); g.moveTo(47, -156); g.lineTo(54, -151); g.lineTo(47, -146); g.closePath(); g.fillStyle = '#c3c7da'; g.fill();
          g.fillRect(54.5, -156, 2, 10);
        },
      },
      armN: { box: [-110, -230, -60, -158], pivot: [-72, -222], draw(S) { S.limb([-72, -222], [-90, -180], 6.5, UA.limb); S.ell(-93, -173, 10, 9.5, UA.glove, { hi: true }); S.line([[-101, -180], [-86, -182]], { w: 2.2, color: '#c9c4d8', taper: 0 }); } },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, sl = Math.max(0, sw), back = Math.max(0, -sw), tele = E0.tele, hurt = E0.hurt, guard = E0.guard, won = st.won, bp = Math.sin(PI * E0.buffP);
      const step = Math.sin(TAU * t / 1.4) * m;
      // the stance: legs wide and the board crouched low, holding still for its Final Offer
      const crouch = 10 * tele + 4 * guard + 6 * back, dx = -sw * 34 + hurt * 20 + tele * 6;
      const rot = -0.09 * sw + 0.1 * hurt + 0.04 * tele - 0.04 * guard + 0.015 * step;
      ctx.save();
      put(ctx, st, 'legF', { x: dx * 0.4, r: -0.08 * step - 0.18 * tele - 0.1 * sw + 0.06 * hurt });
      put(ctx, st, 'legN', { x: dx * 0.4, r: 0.08 * step + 0.2 * tele + 0.2 * sl - 0.06 * hurt });
      xform(ctx, 0, -126, dx, crouch - Math.abs(step) * 3, rot, 1, 1 - 0.03 * tele);
      put(ctx, st, 'armF', { r: 0.25 * Math.sin(TAU * t / 1.4 + 1) * m - 0.8 * tele - 0.6 * bp + 1.0 * guard });
      put(ctx, st, 'frame', {
        kids(c) {
          // the glass: sale rays, the bouncing mascot (its face is the ad's face), a progress bar that never ends
          const on = 1 - won, gx = UA_GLASS[0], gy = UA_GLASS[1], gw = UA_GLASS[2], gh = UA_GLASS[3];
          c.save(); c.beginPath(); rrPath(c, gx, gy, gw, gh, 8); c.clip();
          c.fillStyle = C.glassD; c.fillRect(gx, gy, gw, gh);
          if (on > 0.02) {
            c.globalAlpha = on;
            c.fillStyle = C.glass; c.fillRect(gx, gy, gw, gh);
            const spin = t * (0.4 + 1.6 * bp) * m;
            c.fillStyle = 'rgba(255,255,255,0.12)';
            for (let i = 0; i < 8; i++) { const a = spin + i / 8 * TAU; c.beginPath(); c.moveTo(-6, -214); c.lineTo(-6 + Math.cos(a) * 160, -214 + Math.sin(a) * 160); c.lineTo(-6 + Math.cos(a + 0.28) * 160, -214 + Math.sin(a + 0.28) * 160); c.closePath(); c.fill(); }
            tk.glow(c, -6, -214, 80, C.cyan, 0.35);
            c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(gx + 10, gy + gh - 12, gw - 20, 4);
            c.fillStyle = C.red; c.fillRect(gx + 10, gy + gh - 12, (gw - 20) * (0.88 + 0.1 * fr(t * 0.13)), 4);
            c.globalAlpha = 1;
          }
          // the mascot: a round sunny fellow who waves and bounces, on loop, for ever
          const mb = Math.abs(Math.sin(TAU * t / 1.2)) * 7 * m * on + 6 * bp, my = -212 - mb, mx = -8;
          c.save(); c.globalAlpha *= 0.75 + 0.25 * on;
          FOE.limb(c, [mx + 26, my - 6], [mx + 40, my - 24 - 6 * Math.sin(t * 6) * m * on], 7, UA.mascot, { act: 2, size: 'l' });
          FOE.cel(c, E(mx, my, 33, 31, 22), UA.mascot, { act: 2, size: 'l', hi: true });
          blush(c, mx - 22, my + 8, 11); blush(c, mx + 12, my + 8, 11);
          const hot = clamp(tele + sl, 0, 1);
          eyes(c, st, mx - 6, my - 6, 13, { gap: 18, open: blink(t, 'ad', 3.3) * (1 - 0.5 * hurt), lx: -0.4 });
          mouth(c, st, mx - 6, my + 12, 18 + 4 * hot, hurt > 0.3 ? 'ow' : 'grin');
          c.restore();
          // Final Offer: the whole screen flashes a sale burst
          const fl = E0.pose === 'attack' ? Math.sin(PI * clamp((E0.p - 0.42) / 0.36, 0, 1)) : 0;
          if (fl > 0.02) { c.globalAlpha = cA(fl * 0.9); FOE.cel(c, burstPts(-6, -214, 40, 64, 14, t), C.gold, { act: 2, size: 'l', shadow: false }); c.globalAlpha = 1; }
          c.restore();
          // the glint across the glass
          c.save(); c.globalAlpha = 0.16; c.beginPath(); c.moveTo(gx, gy + 30); c.lineTo(gx + 40, gy); c.lineTo(gx + 66, gy); c.lineTo(gx, gy + 58); c.closePath(); c.fillStyle = '#ffffff'; c.fill(); c.restore();
        },
      });
      put(ctx, st, 'skip', {
        kids(c) {
          // Skip in Five: a countdown ring creeps round the button, and the button stays grey. Won over, it finally lights up
          if (tele > 0.05) { c.save(); c.globalAlpha = cA(tele); c.strokeStyle = '#ffffff'; c.lineWidth = 2.4; c.beginPath(); c.arc(37, -151, 30, -PI / 2, -PI / 2 + TAU * clamp(0.2 + 0.75 * tele, 0, 0.95)); c.stroke(); c.restore(); }
          if (won > 0.5) { c.save(); c.globalAlpha = cA((won - 0.5) * 2); c.beginPath(); rrPath(c, 14, -160, 46, 18, 8); c.fillStyle = C.moon; c.fill(); c.font = '800 10px ' + tk.font.num; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = C.line; c.fillText('SKIP', 32, -150.5); c.restore(); }
        },
      });
      put(ctx, st, 'armN', { r: 0.2 * Math.sin(TAU * t / 1.4) * m - 1.5 * sl + 0.5 * back - 0.4 * tele - 0.8 * bp + 1.3 * guard + 0.3 * hurt });
      ctx.restore();
      if (bp > 0.05) FEED.glitter(ctx, [dx - 90, -320, 180, 200], t, 9, 6, C.gold);
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // HUG EMOJI (koi_spirit, creature, m): a bouncy round yellow face with rosy cheeks and two little arms flung wide, leaping in an arc out of a
  // phone lying on the ground, over a swirl of pink hearts. Kept from its rig: the leap arc and the swirl. Sunny yellow, heart pink, white.
  // ---------------------------------------------------------------------------------------------------------------
  const HE = { face: '#ffd84d', hand: '#ffcf3a' };
  // the swirl of hearts from the phone up to the emoji, at fraction u
  const heSwirl = (u, t, m) => [lerp(18, -12, u) + Math.sin(u * TAU * 1.2 + t * 2.2 * m) * 15 * (1 - 0.4 * u), lerp(-18, -84, u)];
  define('koi_spirit', {
    size: 'm',
    bounds: { w: 132, h: 187, head: { x: -30, y: -164 }, body: { x: 0, y: -100 }, feet: { x: 0, y: 0 } },
    scr: [20, -10, 30],
    parts: {
      phone: {
        box: [-20, -24, 60, 4], pivot: [20, -10],
        draw(S) {
          S.cel([[-14, -2], [-3, -19], [45, -19], [55, -2]], C.night, { shadow: false, tension: 0.1 });
          S.fill([[-6, -5], [1, -16], [41, -16], [47, -5]], C.glassD, 1, 0.1);
        },
      },
      armF: { box: [8, -158, 52, -104], pivot: [16, -114], draw(S) { S.limb([16, -114], [37, -141], 9, shadeOf(HE.hand)); S.ell(40, -146, 8, 7.5, shadeOf(HE.hand), {}); } },
      ball: {
        box: [-60, -166, 24, -82], pivot: [-18, -88], won: true,
        draw(S) {
          S.cel(E(-18, -124, 40, 39, 28), HE.face, { hi: true, decor(g) { S.under(-60, -166, 24, -84, 0.85); } });
          S.blush(-47, -111, 17); S.blush(-7, -111, 17);
        },
      },
      armN: { box: [-90, -160, -42, -104], pivot: [-50, -114], draw(S) { S.limb([-50, -114], [-73, -141], 9.5, HE.hand); S.ell(-77, -146, 8.5, 8, HE.hand, { hi: true }); } },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, sl = Math.max(0, sw), back = Math.max(0, -sw), tele = E0.tele, hurt = E0.hurt, guard = E0.guard, won = st.won, bp = Math.sin(PI * E0.buffP);
      // the leap: the face rides a small arc out of the phone, tilting as it goes
      const ph = TAU * t / 2.4, arcX = Math.sin(ph) * 6 * m, arcY = Math.abs(Math.sin(ph)) * 9 * m;
      const dx = -sw * 34 + hurt * 18 + arcX, dy = -arcY - 10 * bp + 8 * guard + 6 * tele;
      const rot = 0.08 * Math.sin(ph) * m - 0.14 * sw + 0.16 * hurt - 0.05 * tele;
      // the swirl of hearts, drawn first so the emoji leaps over it
      const on = 1 - won;
      ctx.save(); ctx.lineCap = 'round';
      ctx.globalAlpha = 0.28 * on; ctx.strokeStyle = C.pink; ctx.lineWidth = 9;
      strokePts(ctx, [0, 0.25, 0.5, 0.75, 1].map((u) => heSwirl(u, t, m)), 0.5); ctx.stroke();
      ctx.globalAlpha = 1;
      for (let i = 0; i < 7; i++) {
        const u = fr(i / 7 + t * 0.45 * m + 0.05), p = heSwirl(u, t, m), a = Math.sin(PI * u) * on;
        if (a > 0.05) { ctx.save(); ctx.globalAlpha = cA(a); FEED.icon(ctx, 'heart', p[0], p[1], 3.5 + 4 * u, { ink: 1.4 }); ctx.restore(); }
      }
      ctx.restore();
      put(ctx, st, 'phone', { kids(c) { if (on > 0.02) { c.save(); c.globalAlpha = on; tk.glow(c, 20, -12, 40, C.blue, 0.5); FEED.icon(c, 'heart', 21, -10.5, 4, { ink: 0 }); c.restore(); } } });
      ctx.save();
      xform(ctx, -18, -88, dx, dy, rot, 1 + 0.05 * guard, 1 - 0.06 * guard + 0.03 * Math.sin(ph * 2) * m);
      // arms flung wide; they close into a hug on Big Hug and on guard
      const hug = clamp(bp + guard, 0, 1);
      put(ctx, st, 'armF', { r: 0.18 * Math.sin(TAU * t / 1.2) * m + 1.3 * hug + 0.3 * hurt });
      put(ctx, st, 'ball', {
        kids(c) {
          const hot = clamp(tele + sl, 0, 1);
          eyes(c, st, -30, -129, 15, { gap: 21, open: blink(t, 'hug', 3.1) * (1 - 0.6 * hurt) * (1 - 0.3 * hug), lx: -0.4 });
          mouth(c, st, -30, -106, 20, hurt > 0.3 ? 'ow' : hot > 0.3 ? 'grin' : 'happyOpen');
        },
      });
      put(ctx, st, 'armN', {
        r: -0.18 * Math.sin(TAU * t / 1.2) * m - 1.4 * hug - 0.9 * sl + 0.6 * back + 0.5 * tele - 0.3 * hurt,
        kids(c) { if (sl > 0.2) { c.save(); c.globalAlpha = cA((sl - 0.2) * 1.6); FEED.icon(c, 'thumb', -80, -150, 13, { down: true, col: HE.hand, cuff: C.blue }); c.restore(); } },
      });
      ctx.restore();
      // Heart Splash: hearts burst toward both heroes; Big Hug: hearts rise round its friends
      if (E0.pose === 'attack' && E0.p > 0.35) {
        const u = clamp((E0.p - 0.35) / 0.6, 0, 1);
        for (let i = 0; i < 7; i++) { const a = 1 - u; if (a > 0.05) { ctx.save(); ctx.globalAlpha = cA(a); FEED.icon(ctx, 'heart', dx - 60 - u * (80 + 22 * i), -120 + (i - 3) * 16 * u - 40 * Math.sin(PI * u), 5 + i % 3, { ink: 1.4 }); ctx.restore(); } }
      }
      if (bp > 0.05) FEED.balloons(ctx, dx - 18, -150, t, 5, 9, { alpha: bp, rise: 70, spread: 50, kinds: ['heart'] });
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // SELFIE STICK (rokurokubi, creature, m): by day a quiet phone on a cafe table; by night a sweet-faced phone in a pink case on top of a long
  // telescoping silver stick that bends like a neck, standing on a little cafe stool. A camera flash pops on every hit. Kept from its rig: the
  // neck chain that reaches right over the lead to get the backing hero in the shot. Silver, case pink, flash white.
  // ---------------------------------------------------------------------------------------------------------------
  const SS = { case: '#ff8fc0', seat: '#ff6fb5', chrome: '#cdd3e6', grip: '#2e335c' };
  const SS_NECK = [[0, -96], [2, -128], [-3, -160], [2, -190], [0, -212]];
  define('rokurokubi', {
    size: 'm', k: 0.82,
    bounds: { w: 128, h: 222, head: { x: 0, y: -186 }, body: { x: 0, y: -80 }, feet: { x: 0, y: 0 } },
    scr: [-2, -224, 40],
    parts: {
      body: {
        box: [-44, -104, 44, 4], pivot: [0, -4],
        draw(S) {
          // the cafe stool: three chrome legs, a foot ring, a round pink seat, and the stick's rubber grip standing on it
          [[-24, -62, -36, -2], [24, -62, 34, -2], [0, -60, 2, 0]].forEach((L, i) => S.limb([L[0], L[1]], [L[2], L[3]], 4.4, i === 2 ? shadeOf(SS.chrome) : SS.chrome));
          S.line([[-31, -24], [0, -20], [29, -24]], { w: 3, color: '#9aa0bd', taper: 0 });
          S.cel(E(0, -66, 38, 11, 18), SS.chrome, {});
          S.cel(E(0, -71, 35, 10, 18), SS.seat, { hi: true });
          S.cel(RR(-7, -102, 14, 34, 5), SS.grip, { hi: true });
        },
      },
      head: {
        box: [-38, -268, 34, -200], pivot: [0, -212],
        draw(S) {
          // the holder clamp, the pink case, the screen (the face is live) and the little camera on top
          S.cel(RR(-8, -212, 16, 10, 3), SS.chrome, {});
          S.cel(RR(-31, -264, 58, 56, 13), SS.case, { hi: true });
          S.cel(RR(-26, -258, 48, 45, 8), C.glassD, { shadow: false, line: S.ink.fine });
          S.ell(-2, -261, 2.6, 2.6, C.line, { shadow: false, line: false });
        },
      },
    },
    chains: {
      neck: {
        spine: SS_NECK, cuts: [0.14, 0.28, 0.42, 0.56, 0.7, 0.84], overlap: 10, reach: 16,
        draw(S) {
          // a telescoping stick: wider below, a collar at every join
          S.rib(SS_NECK, SS.chrome, { wMax: 12, w0: 12, w1: 8, profile: (u) => 1 - 0.35 * u, cap: 'round', shadow: '#9aa0bd', shadowW: 0.4 });
          [0.22, 0.46, 0.7].forEach((u) => { const p = along(SS_NECK, u), w = 8 * (1 - 0.3 * u); S.g.save(); S.g.translate(p.x, p.y); S.g.rotate(Math.atan2(p.ty, p.tx)); S.cel(RR(-3, -w, 6, w * 2, 2), '#e9ecf6', { line: S.ink.fine }); S.g.restore(); });
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, tele = E0.tele, hurt = E0.hurt, guard = E0.guard, won = st.won, bp = Math.sin(PI * E0.buffP);
      const br = Math.sin(TAU * t / 3.1) * m;
      // the neck: an idle sway, a coil back on the wind-up, a long reach over the lead on the strike, a fold away on guard
      const idle = (i) => m * 0.07 * Math.sin(TAU * (t / 2.6) - i * 0.6);
      const reach = Math.max(0, sw), back = Math.max(0, -sw);
      const ACC = [0, 1.4, -2.5, 2.5, -2.5, 1.4, 0], acc = clamp(guard + 0.55 * tele + 0.35 * back, 0, 1);
      const bends = [0, 1, 2, 3, 4, 5, 6].map((i) => {
        let b = idle(i);
        if (i === 0) b += -1.4 * reach + 0.5 * back + 0.55 * tele + 0.6 * hurt - 0.12 * bp;
        else b += -0.08 * reach * (i === 6 ? 0.2 : 1) + 0.5 * hurt * (i % 2 ? -1 : 1) + 0.05 * Math.sin(t * 40 + i) * tele + bp * 0.1 * Math.sin(t * 10 + i);
        return b + ACC[i] * acc;
      });
      const tip = chainTip(SPECS.rokurokubi, 'neck', bends);
      ctx.save();
      xform(ctx, 0, -4, hurt * 10 - 6 * reach, 0, 0.02 * br - 0.03 * sw + 0.04 * hurt, 1 + 0.01 * br, 1 + 0.015 * br);
      put(ctx, st, 'body');
      putChain(ctx, st, 'neck', bends);
      // the phone rides the tip of the stick
      put(ctx, st, 'head', {
        x: tip.dx, y: tip.dy, r: tip.r * 0.3 + lerp(-0.12, 0.14, won) + 0.05 * Math.sin(TAU * t / 2.2) * m - 0.1 * sw + 0.06 * tele,
        kids(c) {
          const on = 1 - won, hot = clamp(tele + reach + bp, 0, 1);
          FEED.screen(c, -2, -235.5, 48, 45, { kind: 'face', on, round: 0.2, bezel: 0.02, lw: 1.2, case: 'rgba(0,0,0,0)' });
          blush(c, -20, -226, 9); blush(c, 12, -226, 9);
          eyes(c, st, -4, -240, 13, { gap: 18, open: blink(t, 'selfie', 4.0) * (1 - 0.6 * hurt), lx: -0.4 });
          mouth(c, st, -4, -224, 11, hurt > 0.3 ? 'ow' : hot > 0.3 ? 'grin' : 'smile');
          // the camera flash pops on the strike (and on Photobomb), and blinks when it is hit
          const fl = (E0.pose === 'attack' ? Math.max(0, 1 - Math.abs(E0.p - 0.5) / 0.14) : 0) + 0.7 * E0.flash;
          if (fl > 0.02) { tk.glow(c, -2, -261, 40, '#ffffff', cA(fl)); tk.sparkle(c, -2, -261, 12 * fl, { color: '#ffffff', glow: 0.6 }); }
          if (on > 0.02) tk.glow(c, -4, -232, 46, C.blue, 0.22 * on);
        },
      });
      ctx.restore();
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // PHONE CHARGER (ittan_momen, creature, m): a long white charging cable fluttering in the night air like a ribbon, a plug head with two metal
  // prongs and a sweet little face, and a battery screen on its side that fills as it squeezes. Kept from its rig: the ribbon chain's flutter
  // and wrap (drawn live as one continuous cable, a wave running up its spine). White, screen blue, battery green.
  // ---------------------------------------------------------------------------------------------------------------
  const PC = { cable: '#f2f4ff', shade: '#c4c8e6' };
  // the spine of the cable (tail to plug) for a pose: a travelling wave, bent forward on a strike, coiled on a guard
  function chargerSpine(st) {
    const E0 = st.E, t = st.t, m = st.m, N = 9, reach = Math.max(0, E0.swing), back = Math.max(0, -E0.swing), tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard;
    const gA = 1 + 1.2 * guard, pts = [];
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1), amp = (5 + 15 * u) * m * (1 + 0.5 * tele + 0.6 * buff) * gA + 3 * tele;
      pts.push([amp * Math.sin(TAU * t / 1.5 - u * 4.6) + 7 * Math.sin(TAU * t / 2.7 + 1) * u * m, -4 - u * 140]);
    }
    return tk.bendPts(pts, { ang: -0.95 * reach + 0.3 * back + 0.28 * tele + 0.45 * hurt, pow: 1.15, ox: pts[0][0], oy: pts[0][1] });
  }
  define('ittan_momen', {
    size: 'm', k: 0.96,
    bounds: { w: 118, h: 198, head: { x: -6, y: -184 }, body: { x: 0, y: -96 }, feet: { x: 0, y: 0 } },
    parts: {
      plug: {
        box: [-28, -62, 28, 8], pivot: [0, 0], won: true,
        draw(S) {
          S.cel(RR(-15, -58, 8, 22, 2), '#d9dded', { hi: true }); S.cel(RR(7, -58, 8, 22, 2), '#c3c8dc', {});
          S.cel(RR(-24, -42, 48, 42, 12), PC.cable, { hi: true, decor(g) { S.under(-26, -44, 26, 2, 0.9); } });
          S.cel(RR(-11, -4, 22, 9, 3), PC.shade, {});
          S.blush(-16, -14, 9); S.blush(12, -14, 9);
        },
      },
      batt: { box: [-14, -22, 14, 22], pivot: [0, 0], draw(S) { S.cel(RR(-11, -19, 22, 38, 7), C.night, { shadow: false }); } },
    },
    scr: [0, -96, 30],
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, reach = Math.max(0, sw), tele = E0.tele, hurt = E0.hurt, guard = E0.guard, won = st.won, bp = Math.sin(PI * E0.buffP);
      const hover = -18 - Math.sin(TAU * t / 2.4) * 5 * m - 6 * tele - 6 * bp;
      const sp = chargerSpine(st);
      const rib = (col, o) => tk.ribbon(ctx, sp, col, Object.assign({
        wMax: 24, w0: 15, w1: 20, cap: 'round', profile: (u) => 0.62 + 0.38 * Math.pow(clamp(u * 1.06, 0, 1), 0.8), gloss: true, glossAlpha: 0.6, glossColor: '#ffffff', rim: null,
        shadow: PC.shade, shadowW: 0.42, line: st.spec.lw, lineColor: C.line, strands: 0,
      }, o));
      ctx.save();
      ctx.translate(hurt * 16 - 30 * reach, hover);
      // the little connector at the tail end, then the cable, a light pulse running up it while it charges
      const tl = sp[0], tl2 = sp[1], ta = Math.atan2(tl[1] - tl2[1], tl[0] - tl2[0]);
      ctx.save(); ctx.translate(tl[0], tl[1]); ctx.rotate(ta);
      FOE.cel(ctx, RR(-2, -8, 16, 16, 4), PC.cable, { act: 2, size: 'm' }); FOE.cel(ctx, RR(13, -5, 7, 10, 2), C.silver, { act: 2, size: 'm' });
      ctx.restore();
      rib(PC.cable);
      if (st.flash > 0.02) { ctx.save(); ctx.globalAlpha = cA(st.flash); rib('#ffffff', { shadow: false, gloss: false, line: 0 }); ctx.restore(); }
      if (won < 1) { const u = fr(t * 0.7), p = along(sp, u); tk.glow(ctx, p.x, p.y, 16, C.cyan, 0.7 * (1 - won) * Math.sin(PI * u)); }
      // the battery screen on its side: it fills as the cable squeezes
      const bq = along(sp, 0.42), ba = Math.atan2(bq.ty, bq.tx) + PI / 2;
      put(ctx, st, 'batt', {
        x: bq.x, y: bq.y, r: ba * 0.85,
        kids(c) {
          const lvl = clamp(0.35 + 0.15 * Math.sin(t * 0.8) * m + 0.5 * guard + 0.4 * bp + 0.3 * tele, 0, 1);
          FEED.screen(c, 0, 0, 22, 38, { kind: 'face', on: 1 - won, round: 0.32, lw: 1.2, case: 'rgba(0,0,0,0)', bezel: 0.12 });
          c.save(); c.lineWidth = 1.6; c.strokeStyle = '#ffffff'; c.beginPath(); rrPath(c, -5.5, -11, 11, 22, 2.5); c.stroke(); c.fillStyle = '#ffffff'; c.fillRect(-2.5, -13.5, 5, 2.5);
          c.fillStyle = won > 0.5 ? '#4a5080' : C.green; c.fillRect(-3.5, 9 - 18 * lvl, 7, 18 * lvl); c.restore();
        },
      });
      // the plug head, its prongs up and its face turned down to the battery
      const head = sp[sp.length - 1], neck = sp[sp.length - 2], ang = Math.atan2(head[1] - neck[1], head[0] - neck[0]) + PI / 2;
      put(ctx, st, 'plug', {
        x: head[0], y: head[1] + 4, r: ang * 0.8 + lerp(-0.18, 0.2, won),
        kids(c) {
          const hot = clamp(tele + reach + bp, 0, 1);
          eyes(c, st, -2, -26, 11, { gap: 16, open: blink(t, 'charger', 4.2) * (1 - 0.6 * hurt), h: 15, lx: -0.4 });
          mouth(c, st, -2, -13, 9, hurt > 0.3 ? 'ow' : hot > 0.3 ? 'grin' : 'smile');
          c.beginPath(); c.arc(16, -34, 2.4, 0, TAU); c.fillStyle = won > 0.5 ? C.moon : C.green; c.fill();
          tk.glow(c, 16, -34, 8, C.green, 0.6 * (1 - won));
        },
      });
      ctx.restore();
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // BOTLING (spiderling, sidekick, s): a coin-sized round bot on eight wire legs, two heart-shaped eyes glowing pink in its face screen, a short
  // antenna. It likes everything instantly and without looking. Kept from its rig: almost everything (the legs, the hop, the big eyes).
  // Silver, lilac, heart pink.
  // ---------------------------------------------------------------------------------------------------------------
  const BT = { body: '#dfe3f2', leg: '#b9b0dc', legF: '#9c92c4' };
  function botLeg(S, far) {
    S.rib([[0, 0], [14, -22, 1], [36, 34]], far ? BT.legF : BT.leg, { wMax: 5.4, w0: 5, w1: 2.6, cap: 'round', profile: (u) => 1 - 0.5 * u });
    S.ell(14, -22, 3.4, 3.4, far ? BT.legF : BT.body, { shadow: false });
    S.ell(36, 35, 3.6, 3.2, far ? BT.legF : C.pink, { shadow: false });
  }
  define('spiderling', {
    size: 's', k: 1.3,
    bounds: { w: 100, h: 92, head: { x: -8, y: -88 }, body: { x: 4, y: -44 }, feet: { x: 0, y: 0 } },
    scr: [-6, -42, 16],
    hop: 12,
    parts: {
      body: {
        box: [-26, -66, 30, -16], pivot: [2, -36], won: true,
        draw(S) {
          S.cel(E(2, -41, 23, 21, 22), BT.body, { hi: true, decor(g) { S.under(-24, -62, 28, -20, 0.7); } });
          S.cel(RR(-20, -50, 29, 18, 7), C.glassD, { shadow: false, line: S.ink.fine * 1.6 });
          S.ell(17, -36, 2.4, 2.4, '#a6aac8', { shadow: false, line: false });
        },
      },
      legN: { box: [-4, -30, 44, 42], pivot: [0, 0], draw(S) { botLeg(S, false); } },
      legF: { box: [-4, -30, 44, 42], pivot: [0, 0], draw(S) { botLeg(S, true); } },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, sl = Math.max(0, sw), tele = E0.tele, hurt = E0.hurt, guard = E0.guard, won = st.won, bp = Math.sin(PI * E0.buffP);
      const hot = clamp(tele + sl, 0, 1);
      const hop = Math.abs(Math.sin(TAU * t / 0.95)) * 5 * m + 16 * Math.max(0, Math.sin(PI * clamp((E0.p - 0.15) / 0.5, 0, 1))) * (E0.pose === 'attack' ? 1 : 0) + 6 * tele + 8 * bp;
      const dx = -sw * 34 + hurt * 14 + Math.sin(t * 50) * 1.2 * tele;
      const rot = -0.2 * sw + 0.2 * hurt - 0.15 * tele + 0.03 * Math.sin(TAU * t / 1.9) * m;
      const tap = (i) => m * 0.18 * Math.sin(TAU * t / 0.95 + i * 1.3);
      const LEGS = [[-14, -36, -1, 0.9, 0.05, true], [-4, -34, -1, 0.8, 0.3, true], [12, -34, 1, 0.8, 0.05, true], [22, -36, 1, 0.7, 0.35, true], [-18, -34, -1, 1, 0.0, false], [-8, -32, -1, 0.9, 0.28, false], [10, -32, 1, 0.9, 0.0, false], [20, -34, 1, 0.8, 0.3, false]];
      const legR = (L, i) => (L[4] + tap(i) - (L[2] < 0 ? (0.7 * sl + 0.55 * tele) : 0) + 0.3 * hurt + 0.6 * guard * (L[2] < 0 ? -1 : 1)) * L[2];
      ctx.save();
      // Skitter: a couple of fading after-images
      if (bp > 0.1) { for (let k = 1; k <= 2; k++) { ctx.save(); ctx.globalAlpha = cA(0.22 * bp / k); ctx.translate(-10 * k * bp, 0); tk.glow(ctx, 2, -42, 40, C.pink, 0.5); ctx.restore(); } }
      xform(ctx, 0, -20, dx, -hop, rot, 1 + 0.04 * hurt - 0.06 * guard, 1 - 0.06 * hurt + 0.05 * tele - 0.12 * guard);
      LEGS.filter((L) => L[5]).forEach((L, i) => put(ctx, st, 'legF', { x: L[0], y: L[1], r: legR(L, i), sx: L[2] * L[3], sy: L[3] }));
      // the antenna, with a little heart on top
      const aw = 0.2 * Math.sin(TAU * t / 1.1) * m - 0.3 * sl + 0.3 * hurt, ax = 6 + Math.sin(aw) * 14, ay = -62 - Math.cos(aw) * 13;
      ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = C.line; ctx.lineWidth = 4.4; ctx.beginPath(); ctx.moveTo(6, -60); ctx.quadraticCurveTo(6, -68, ax, ay); ctx.stroke(); ctx.strokeStyle = BT.leg; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
      FEED.icon(ctx, 'heart', ax, ay - 2, 4.4, { ink: 1.5 });
      put(ctx, st, 'body', {
        sx: 1 + 0.03 * Math.sin(TAU * t / 1.4) * m, sy: 1 - 0.03 * Math.sin(TAU * t / 1.4) * m,
        kids(c) {
          // heart eyes glowing in its face screen, looking down; won over, real round eyes that look up
          const on = 1 - won, look = FEED.look(st, -0.4), open = blink(t, 'botling', 3.4) * (1 - 0.6 * hurt);
          if (won < 0.5) {
            tk.glow(c, -6, -41, 18, C.pink, 0.4 + 0.4 * hot);
            [-12, 0].forEach((ex) => FEED.icon(c, 'heart', ex + look[0] * 1.5, -41 + look[1] * 2, 4.6 * (0.4 + 0.6 * open) * (1 + 0.15 * hot), { ink: 0, col: '#ff8fcf' }));
          } else eyes(c, st, -6, -41, 8.5, { gap: 12 });
          if (on > 0.02) tk.glow(c, -6, -34, 20, C.blue, 0.2 * on);
        },
      });
      LEGS.filter((L) => !L[5]).forEach((L, i) => put(ctx, st, 'legN', { x: L[0], y: L[1], r: legR(L, i + 4), sx: L[2] * L[3], sy: L[3] }));
      ctx.restore();
      // Auto Like: a heart pops off it on the nip
      if (E0.pose === 'attack' && E0.p > 0.4) { const u = clamp((E0.p - 0.4) / 0.5, 0, 1); ctx.save(); ctx.globalAlpha = cA(1 - u); FEED.icon(ctx, 'heart', dx - 30 - 30 * u, -60 - 26 * u, 6 + 3 * u, { ink: 1.6 }); ctx.restore(); }
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // COPYCAT CUTOUT (paper_puppet, sidekick, s): a flat cut-out dancer with cat ears and a phone-shaped head showing the same smile as all the
  // others, dangling on glowing strings. Cut out of last week's trend: hot pink card with a white die-cut edge. Kept from its rig: the
  // string sway. Hot pink, white.
  // ---------------------------------------------------------------------------------------------------------------
  const CC = { pink: '#ff5fa8', pinkD: '#e04790' };
  // a die-cut card shape: a white edge round the cut, a navy line outside it, the card colour inside
  function cutout(S, pts, col, o) {
    const g = S.g, e = 5;
    g.save(); g.beginPath(); tk.trace(g, pts, 0, 0, o && o.tension); g.lineJoin = 'round';
    g.lineWidth = e + S.lw * 2; g.strokeStyle = C.line; g.stroke(); g.lineWidth = e; g.strokeStyle = C.white; g.stroke();
    g.restore();
    S.cel(pts, col, Object.assign({ line: false, hi: true }, o));
  }
  // THE smile of the trend: wide, white and perfect, the same on every face that copies it (Trendsetter and its cutouts)
  function trendSmile(g, x, y, w, lw) {
    g.save(); g.beginPath(); g.moveTo(x - w / 2, y); g.quadraticCurveTo(x, y + w * 0.62, x + w / 2, y); g.closePath();
    g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = num(lw, 1.4); g.strokeStyle = C.line; g.lineJoin = 'round'; g.stroke();
    g.beginPath(); g.moveTo(x - w * 0.36, y + w * 0.1); g.quadraticCurveTo(x, y + w * 0.2, x + w * 0.36, y + w * 0.1); g.lineWidth = Math.max(0.6, num(lw, 1.4) * 0.5); g.strokeStyle = '#c8cde6'; g.stroke();
    g.restore();
  }
  define('paper_puppet', {
    size: 's', k: 1.2,
    bounds: { w: 80, h: 153, head: { x: 0, y: -108 }, body: { x: 0, y: -58 }, feet: { x: 0, y: 0 } },
    scr: [0, -104, 18],
    hop: 12,
    parts: {
      armF: { box: [4, -90, 40, -56], pivot: [9, -84], draw(S) { cutout(S, cap(9, -84, 30, -64, 6, 5), CC.pinkD); } },
      legF: { box: [-4, -60, 22, -16], pivot: [6, -56], draw(S) { cutout(S, cap(6, -56, 10, -26, 6, 5), CC.pinkD); cutout(S, E(13, -24, 6, 4), C.white); } },
      body: { box: [-22, -96, 22, -50], pivot: [0, -88], draw(S) { cutout(S, [[-8, -92], [8, -92], [17, -54], [0, -50], [-17, -54]], CC.pink, { tension: 0.2 }); } },
      head: {
        box: [-24, -136, 24, -86], pivot: [0, -92], won: true,
        draw(S) {
          const shape = [[-15, -126], [-15, -134, 1], [-7, -128], [7, -128], [15, -134, 1], [15, -126], [15, -98], [11, -93], [-11, -93], [-15, -98]];
          cutout(S, shape, CC.pink, { tension: 0.3 });
          S.cel(RR(-11, -123, 22, 27, 5), C.glassD, { shadow: false, line: S.ink.fine * 1.4, decor(g) { S.under(-11, -123, 11, -96, 0.7); } });
        },
      },
      legN: { box: [-24, -60, 4, -14], pivot: [-6, -56], draw(S) { cutout(S, cap(-6, -56, -10, -26, 6, 5), CC.pink); cutout(S, E(-14, -24, 6.5, 4.4), C.white); } },
      armN: { box: [-42, -90, -4, -56], pivot: [-9, -84], draw(S) { cutout(S, cap(-9, -84, -30, -64, 6, 5), CC.pink); } },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, tele = E0.tele, hurt = E0.hurt, guard = E0.guard, won = st.won, bp = Math.sin(PI * E0.buffP);
      const swing = Math.sin(TAU * t / 2.1) * 0.06 * m, jerk = (Math.floor(t * 5) % 2 ? 1 : -1) * 0.02 * m;
      const hover = 8 + Math.sin(TAU * t / 1.7) * 3 * m - 5 * tele + 6 * bp;
      const dx = -sw * 22 + hurt * 12, rot = swing + jerk - 0.16 * sw + 0.2 * hurt;
      const fl = (ph) => m * 0.32 * Math.sin(TAU * t / 1.3 + ph);
      // Copy Clap: the arms fly together on the strike
      const clap = E0.pose === 'attack' ? Math.max(0, sw) : 0;
      const aN = 0.1 + fl(0) + 1.3 * clap + 0.6 * hurt + 1.4 * guard - 0.8 * bp, aF = -0.1 + fl(2) - 1.3 * clap - 0.6 * hurt - 1.4 * guard + 0.8 * bp;
      const strings = [[0, -136, 0], [-30, -62, -1], [30, -62, 1], [-10, -24, -0.4], [12, -24, 0.4]];
      ctx.save();
      xform(ctx, 0, -88, dx, -hover, rot, 1, 1);
      put(ctx, st, 'armF', { r: aF });
      put(ctx, st, 'legF', { r: -fl(1) * 0.8 + 0.3 * hurt + 0.2 * clap });
      put(ctx, st, 'body');
      put(ctx, st, 'legN', { r: fl(3) * 0.8 - 0.3 * hurt - 0.2 * clap });
      put(ctx, st, 'head', {
        r: lerp(-0.08, 0.14, won) + 0.05 * Math.sin(TAU * t / 1.7 + 1) * m - 0.12 * sw + 0.2 * hurt,
        kids(cc) {
          // the screen face: dot eyes looking down, and the same smile as everyone else's
          const on = 1 - won;
          if (on > 0.02) { cc.save(); cc.globalAlpha = on; cc.beginPath(); rrPath(cc, -11, -123, 22, 27, 5); cc.fillStyle = 'rgba(61,123,255,0.55)'; cc.fill(); cc.restore(); }
          eyes(cc, st, 0, -113, 5.5, { kind: 'dot', gap: 10, open: blink(t, 'cutout', 3.2) * (1 - 0.6 * hurt) });
          if (won > 0.5) mouth(cc, st, 0, -104, 9, 'smile'); else trendSmile(cc, 0, -105, 14, 1.3);
        },
      });
      put(ctx, st, 'armN', { r: aN });
      ctx.restore();
      // the glowing strings from the head, the hands and the knees, up out of sight
      ctx.save(); ctx.lineCap = 'round';
      strings.forEach((sp, i) => {
        const top = -240, ax = sp[2] * 12 + Math.sin(t * 1.8 + i) * 3 * m;
        const p = rotAbout(0, -88, sp[0], sp[1], rot), x0 = p[0] + dx, y0 = p[1] - hover;
        const g = ctx.createLinearGradient(0, y0, 0, top);
        g.addColorStop(0, 'rgba(255,111,181,0.95)'); g.addColorStop(0.7, 'rgba(255,111,181,0.4)'); g.addColorStop(1, 'rgba(255,111,181,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.6 + tele * 0.8;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0 + ax * 0.5, (y0 + top) / 2, ax, top); ctx.stroke();
      });
      ctx.restore();
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // ALGO RHYTHM (silk_weaver, creature, m): a clicking little machine that learns what you like. A ticking brass metronome head on a teal glass
  // body with a screen belly showing hearts and thumbs, a pendulum swinging in time, eight thin glowing cable legs, and a cable trailing off to
  // join the Feed. Kept from its rig: the eight-leg chains and the hatch pose (Spawn a Bot). Teal glass, brass, screen blue.
  // ---------------------------------------------------------------------------------------------------------------
  const AR = { glass: '#43d3c9', brass: '#f0b84a', brassD: '#c98b26', leg: '#7fefff', legF: '#3fa9c9' };
  function algoLeg(S, far) {
    const col = far ? AR.legF : AR.leg;
    S.rib([[0, 0], [34, -60, 1], [84, 58]], col, { wMax: 8, w0: 8, w1: 5.4, cap: 'round', profile: (u) => 1 - 0.3 * u, line: S.ink.mid, shadow: far ? '#2f7f9c' : '#45c6e0' });
    S.ell(34, -60, 4.6, 4.6, far ? '#9aa0bd' : C.silver, { shadow: false });
    S.cel(RR(78, 52, 12, 10, 3), far ? '#c6cadb' : C.white, { line: S.ink.fine * 1.6 });
  }
  define('silk_weaver', {
    size: 'm', k: 0.94,
    bounds: { w: 150, h: 186, head: { x: -10, y: -184 }, body: { x: 6, y: -84 }, feet: { x: 0, y: 0 } },
    scr: [8, -74, 26],
    parts: {
      body: {
        box: [-36, -110, 66, -38], pivot: [14, -60],
        draw(S) {
          S.cel(E(14, -74, 48, 33, 26), AR.glass, { hi: true, decor(g) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(34, -92, 16, 6, -0.3, 0, TAU); g.fill(); } });
          S.cel(RR(-13, -86, 42, 26, 7), C.night, { shadow: false });
        },
      },
      head: {
        box: [-50, -200, 36, -98], pivot: [-8, -104], won: true,
        draw(S) {
          S.cel([[-44, -104], [28, -104], [14, -178], [0, -188], [-16, -188], [-30, -178]], AR.brass, { hi: true, tension: 0.25, decor(g) { S.under(-48, -192, 32, -104, 0.8); } });
          S.ell(-8, -192, 6.5, 6, AR.brassD, {});
          for (let i = -3; i <= 3; i++) S.line([[-8 + i * 5, -110], [-8 + i * 5.4, -114 + Math.abs(i) * 0.6]], { w: S.ink.fine, color: AR.brassD, taper: 0 });
          S.blush(-30, -134, 10); S.blush(12, -134, 10);
        },
      },
      pendulum: { box: [-18, -146, 4, -104], pivot: [-8, -108], draw(S) { S.limb([-8, -108], [-8, -140], 3.2, '#fff2c4'); S.cel(RR(-15, -134, 14, 11, 3), C.red, { hi: true }); } },
    },
    chains: {
      legN: { spine: [[0, 0], [34, -60, 1], [84, 58]], cuts: [0.5], reach: 16, draw(S) { algoLeg(S, false); } },
      legF: { spine: [[0, 0], [34, -60, 1], [84, 58]], cuts: [0.5], reach: 16, draw(S) { algoLeg(S, true); } },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, sl = Math.max(0, sw), tele = E0.tele, hurt = E0.hurt, guard = E0.guard, won = st.won, bp = Math.sin(PI * E0.buffP);
      const skit = (i) => m * 0.09 * Math.sin(TAU * (t / 1.3) + i * 1.7);
      const dx = -sw * 30 + hurt * 18 + tele * 6;
      const rot = -0.07 * sw + 0.1 * hurt + 0.03 * Math.sin(TAU * t / 3.2) * m - 0.06 * tele;
      const bounce = -Math.abs(Math.sin(TAU * t / 1.3)) * 2 * m - 6 * tele + 3 * guard;
      // legs: [rootX, rootY, dir, scale, r0, far]
      const LEGS = [
        [-8, -66, -1, 0.86, -0.1, true], [2, -64, -1, 0.72, 0.18, true], [24, -62, 1, 0.8, -0.12, true], [40, -58, 1, 0.7, 0.16, true],
        [-14, -62, -1, 1, 0.02, false], [-5, -58, -1, 0.9, 0.26, false], [14, -58, 1, 0.94, 0.02, false], [30, -54, 1, 0.84, 0.28, false],
      ];
      const legBends = (i, L) => {
        const front = L[2] < 0;
        const raise = L[4] + skit(i) * 1.2 + (front ? (-0.8 * sl - 0.5 * tele + 0.15 * Math.min(0, sw)) : 0.1 * sl) * (i % 4 < 2 ? 1 : 0.7) - 0.3 * hurt - 0.15 * bp * Math.sin(t * 10 + i);
        const knee = skit(i + 3) * 1.4 + (front ? 0.6 * sl + 0.5 * tele : 0) + 0.5 * guard;
        return [raise, knee];
      };
      // the cable it trails off to the Feed, swaying
      FEED.cable(ctx, [[50 + dx, -66 + bounce], [92 + dx * 0.5, -60 + 5 * Math.sin(t * 1.6) * m], [124, -92 + 8 * Math.sin(t * 1.2 + 1) * m], [150, -150]], { w: 2.6, t, speed: 0.6, plug: 'none', lw: 1.8 });
      ctx.save();
      xform(ctx, 0, -60, dx, bounce, rot, 1, 1 - 0.04 * hurt);
      LEGS.filter((L) => L[5]).forEach((L, k) => putChain(ctx, st, 'legF', legBends(k, L), { x: L[0], y: L[1], sx: L[2] * L[3], sy: L[3] }));
      const throb = 1 + 0.03 * Math.sin(TAU * t / 1.8) * m + 0.1 * bp + 0.04 * tele;
      put(ctx, st, 'body', {
        sx: throb, sy: throb,
        kids(c) {
          // the screen belly: a heart, then a thumb, then a heart... whatever you liked last
          FEED.screen(c, 8, -73, 42, 26, { kind: Math.floor(t / 1.6) % 2 ? 'thumb' : 'heart', t, on: 1 - won, case: 'rgba(0,0,0,0)', bezel: 0.12, lw: 1.4, seed: 4 });
          if (won < 1) tk.glow(c, 8, -90, 40, C.blue, 0.24 * (1 - won));
          // Spawn a Bot: a little Botling pops out of the hatch on top
          if (bp > 0.05) {
            const u = E0.buffP, by = -100 - 40 * Math.sin(PI * u * 0.8);
            c.save(); c.globalAlpha = cA(bp * 1.6);
            FOE.cel(c, E(22, by, 9, 8.5, 14), '#dfe3f2', { act: 2, size: 's', hi: true });
            FEED.icon(c, 'heart', 18, by, 2.6, { ink: 0 }); FEED.icon(c, 'heart', 25, by, 2.6, { ink: 0 });
            c.restore();
          }
        },
      });
      // the metronome head ticks: its pendulum swings in time (faster when it wants something)
      const tickRate = 1.1 + 2.2 * (tele + sl) + 1.5 * bp, sway = Math.sin(TAU * t * tickRate * 0.5) * (0.42 + 0.2 * tele) * (0.4 + 0.6 * m);
      put(ctx, st, 'head', {
        r: lerp(-0.1, 0.14, won) + 0.03 * Math.sin(TAU * t / 2.7) * m - 0.1 * sw + 0.14 * hurt,
        kids(c) {
          eyes(c, st, -9, -152, 15, { gap: 21, open: blink(t, 'algo', 3.8) * (1 - 0.6 * hurt), lx: -0.3 });
          mouth(c, st, -9, -136, 10, hurt > 0.3 || sl > 0.3 ? 'ow' : 'smile');
          put(c, st, 'pendulum', { r: won > 0.5 ? 0 : sway });
        },
      });
      LEGS.filter((L) => !L[5]).forEach((L, k) => putChain(ctx, st, 'legN', legBends(k + 4, L), { x: L[0], y: L[1], sx: L[2] * L[3], sy: L[3] }));
      ctx.restore();
      // Keep Watching and Suggested Post: a cable lashes out toward a hero
      if (E0.pose === 'attack' && E0.p > 0.3) {
        const u = clamp((E0.p - 0.3) / 0.4, 0, 1), back = clamp((E0.p - 0.7) / 0.3, 0, 1), L = 150 * u * (1 - back);
        if (L > 4) FEED.cable(ctx, [[-20 + dx, -72], [-20 + dx - L * 0.5, -96], [-20 + dx - L, -84]], { w: 3.2, plug: 'end' });
      }
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // AUTOPLAY SNAKE (nure_onna, creature, l): a long glossy snake made of stacked phone screens, each segment playing its own tiny loop, a
  // play-button head with sleepy spiral eyes. The more you look, the longer it gets. Kept from its rig: the tail chain and the coil.
  // Screen blue, violet, white play triangle.
  // ---------------------------------------------------------------------------------------------------------------
  const AS = { body: '#7a5cff', bodyD: '#5a3fd6', belly: '#c9b8ff', head: '#4f7bff' };
  const AS_NECK = [[6, -96], [0, -130], [-8, -160], [-12, -186]];
  const AS_TAIL = [[60, -24], [96, -28], [122, -46], [126, -78], [108, -98]];
  // a little screen panel on a body segment, baked: dark glass and one generic icon
  function asPanel(S, x, y, w, h, rot, k) {
    const g = S.g;
    g.save(); g.translate(x, y); g.rotate(rot || 0);
    S.cel(RR(-w / 2, -h / 2, w, h, Math.min(w, h) * 0.25), C.glassD, { shadow: false, line: S.ink.fine * 1.4 });
    g.globalAlpha = 0.9; g.fillStyle = C.glass; g.fillRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4); g.globalAlpha = 1;
    FEED.icon(g, ['heart', 'thumb', 'play', 'dot'][k % 4], 0, 0, Math.min(w, h) * 0.3, { ink: 0, col: k % 4 === 1 ? C.white : undefined, cuff: C.cyan });
    g.restore();
  }
  function asCoil(S, cx, cy, rx, ry, n, seed) {
    S.cel(E(cx, cy, rx, ry, 26), AS.body, { hi: true });
    S.cel(E(cx, cy + ry * 0.45, rx * 0.86, ry * 0.42, 20), AS.belly, { shadow: false, line: S.ink.fine });
    for (let i = 0; i < n; i++) { const u = (i + 0.5) / n, a = PI * (1 - u), x = cx + Math.cos(a) * rx * 0.72, y = cy + Math.sin(a) * ry * 0.18 - ry * 0.12; asPanel(S, x, y, 17, 13, (u - 0.5) * 0.3, i + seed); }
  }
  define('nure_onna', {
    size: 'l',
    bounds: { w: 190, h: 246, head: { x: 0, y: -234 }, body: { x: 0, y: -120 }, feet: { x: 0, y: 0 } },
    scr: [-4, -150, 40],
    parts: {
      coilA: { box: [-74, -54, 84, 4], pivot: [4, -24], draw(S) { asCoil(S, 4, -24, 74, 22, 5, 0); } },
      coilB: { box: [-56, -82, 72, -36], pivot: [8, -56], draw(S) { asCoil(S, 8, -56, 60, 19, 4, 1); } },
      coilC: { box: [-40, -106, 60, -68], pivot: [10, -84], draw(S) { asCoil(S, 10, -84, 46, 16, 3, 2); } },
      head: {
        box: [-58, -246, 22, -180], pivot: [-12, -188], won: true,
        draw(S) {
          S.cel([[-50, -206], [-48, -226], [-34, -240], [-8, -242], [12, -232], [16, -212], [10, -194], [-12, -186], [-36, -188], [-50, -196]], AS.head, { hi: true, decor(g) { S.under(-56, -246, 20, -186, 0.7); } });
          FEED.icon(S.g, 'play', -12, -228, 9, { ink: S.ink.fine * 1.4 });
          S.blush(-42, -202, 10); S.blush(-2, -202, 10);
        },
      },
    },
    chains: {
      tail: {
        spine: AS_TAIL, cuts: [0.28, 0.52, 0.76], reach: 22,
        draw(S) {
          S.rib(AS_TAIL, AS.body, { wMax: 26, w0: 26, w1: 6, cap: 'round', profile: (u) => 1 - 0.8 * Math.pow(u, 1.2) });
          [0.15, 0.4, 0.62].forEach((u, i) => { const p = along(AS_TAIL, u); asPanel(S, p.x, p.y, 15 - i * 3, 11 - i * 2, Math.atan2(p.ty, p.tx), i + 3); });
        },
      },
      neck: {
        spine: AS_NECK, cuts: [0.33, 0.66], reach: 28, overlap: 8,
        draw(S) {
          S.rib(AS_NECK, AS.body, { wMax: 36, w0: 36, w1: 28, cap: 'round', profile: (u) => 1 - 0.2 * u });
          [0.12, 0.42, 0.72].forEach((u, i) => { const p = along(AS_NECK, u); asPanel(S, p.x - 3, p.y, 22, 17, Math.atan2(p.ty, p.tx) + PI / 2, i + 1); });
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, sl = Math.max(0, sw), back = Math.max(0, -sw), tele = E0.tele, hurt = E0.hurt, guard = E0.guard, won = st.won, bp = Math.sin(PI * E0.buffP);
      const br = Math.sin(TAU * t / 2.8) * m, wag = (j, a, ph) => m * 0.12 * a * Math.sin(TAU * (t / 1.8) - j * 0.9 + ph);
      const dx = -sw * 24 + hurt * 14, rise = 6 * tele + 8 * bp;
      ctx.save();
      // Swipe Lash: the tail whips round on the strike
      putChain(ctx, st, 'tail', [0, 1, 2, 3].map((j) => wag(j, 1.2, 1.4) - 0.5 * sw * (1 + j * 0.4) - tele * 0.18 * (j + 1) + 0.3 * hurt), { x: dx * 0.4 });
      // Endless Coil: the coils tighten on guard and breathe at rest
      put(ctx, st, 'coilA', { x: dx * 0.3, sy: 1 + 0.02 * br - 0.08 * guard, sx: 1 + 0.04 * guard });
      put(ctx, st, 'coilB', { x: dx * 0.6, y: -rise * 0.3, sy: 1 + 0.025 * br - 0.1 * guard, sx: 1 + 0.02 * tele, r: -0.012 * br });
      put(ctx, st, 'coilC', { x: dx * 0.8, y: -rise * 0.6, sy: 1 + 0.03 * br - 0.12 * guard, r: 0.015 * br });
      // Autoplay Bite: the neck rears on the wind-up and lunges at the backing hero on the strike
      const nb = [0, 1, 2].map((j) => wag(j, 0.6, 0.3) + (j === 0 ? -0.55 * sl + 0.3 * back + 0.25 * tele + 0.2 * hurt : -0.25 * sl * j + 0.12 * tele - 0.1 * guard));
      const ox = dx * 0.9, oy = -rise;
      putChain(ctx, st, 'neck', nb, { x: ox, y: oy });
      const tip = chainTip(SPECS.nure_onna, 'neck', nb);
      put(ctx, st, 'head', {
        x: tip.dx + ox, y: tip.dy + oy, r: tip.r * 0.5 + lerp(-0.12, 0.16, won) + 0.04 * Math.sin(TAU * t / 2.3) * m - 0.1 * sl + 0.1 * hurt,
        kids(c) {
          // sleepy spiral eyes that turn as it watches (round eyes, looking up, once it is won over)
          if (won > 0.5) eyes(c, st, -20, -208, 13, { gap: 22 });
          else [-31, -9].forEach((ex, i) => {
            c.save(); c.translate(ex, -208);
            c.beginPath(); c.ellipse(0, 0, 8.5, 8, 0, 0, TAU); c.fillStyle = '#fffdfa'; c.fill(); c.lineWidth = 1.8; c.strokeStyle = C.line; c.stroke();
            c.rotate(t * 2.2 * m * (i ? 1 : -1)); c.beginPath();
            for (let k = 0; k <= 26; k++) { const a = k / 26 * TAU * 2.2, r = 0.6 + k / 26 * 6.4; if (k) c.lineTo(Math.cos(a) * r, Math.sin(a) * r); else c.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
            c.lineWidth = 1.6; c.strokeStyle = AS.bodyD; c.stroke();
            c.restore();
            c.save(); c.beginPath(); c.ellipse(ex, -213, 9.5, 4.5, 0, PI, TAU); c.fillStyle = AS.head; c.fill(); c.lineWidth = 2; c.strokeStyle = C.line; c.beginPath(); c.moveTo(ex - 9, -212); c.quadraticCurveTo(ex, -216, ex + 9, -212); c.stroke(); c.restore();
          });
          mouth(c, st, -22, -195, 14, hurt > 0.3 ? 'ow' : sl > 0.3 ? 'grin' : 'smile');
          // a little forked tongue flicks out now and then
          const fl = Math.max(Math.pow(Math.max(0, Math.sin(t * 3.1)), 12) * m, sl, tele * 0.6) * (1 - won);
          if (fl > 0.05) { const L = 6 + 14 * fl; c.save(); c.lineCap = 'round'; c.strokeStyle = C.line; c.lineWidth = 3.6; c.beginPath(); c.moveTo(-34, -194); c.lineTo(-34 - L, -192); c.moveTo(-34 - L, -192); c.lineTo(-40 - L, -196); c.moveTo(-34 - L, -192); c.lineTo(-40 - L, -188); c.stroke(); c.strokeStyle = C.pink; c.lineWidth = 1.6; c.stroke(); c.restore(); }
          if (won < 1) tk.glow(c, -18, -186, 36, C.blue, 0.22 * (1 - won));
        },
      });
      ctx.restore();
      // the screens along it glow and pulse, each on its own loop
      if (won < 1) for (let i = 0; i < 4; i++) { const p = fr(t * 0.5 + i * 0.25); tk.glow(ctx, dx * 0.5 - 50 + i * 34, -30 - i * 16, 22, i % 2 ? C.cyan : C.blue, 0.3 * Math.sin(PI * p) * (1 - won)); }
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // COMMENT TROLL (drowned_general, rival, l): a big grumbling storm cloud with a deep frown and stubby arms typing furiously on a glowing
  // laptop, speech bubbles and thumbs-down icons drifting off it. When it is won over it turns pink and fluffy and drifts off smiling, raining
  // a tiny rainbow. Kept from its rig: the trailing props (now speech bubbles) and the summon gesture. Slate blue, storm grey, screen cyan,
  // then blush pink.
  // ---------------------------------------------------------------------------------------------------------------
  const CT = { cloud: '#a3abc8', back: '#7f88aa', pink: '#ffc6de', pinkD: '#f1a1c4', laptop: '#3a4170' };
  const CT_BODY = cloudPts(-4, -232, 84, 60, 9, 2);
  define('drowned_general', {
    size: 'l', k: 0.95,
    bounds: { w: 200, h: 335, head: { x: 0, y: -284 }, body: { x: 0, y: -150 }, feet: { x: 0, y: 0 } },
    scr: [-70, -180, 50],
    hop: 24,
    parts: {
      back: { box: [-40, -320, 136, -170], pivot: [40, -200], won: true, draw(S) { S.cel(cloudPts(48, -254, 66, 48, 8, 5), S.won ? CT.pinkD : CT.back, {}); } },
      bubble: { box: [-24, -18, 24, 18], pivot: [0, 0], draw(S) { FEED.icon(S.g, 'bubble', 0, -2, 16, { ink: S.lw, dots: true }); } },
      thumb: { box: [-20, -20, 20, 20], pivot: [0, 0], draw(S) { FEED.icon(S.g, 'bubble', 0, -2, 14, { ink: S.lw, dots: false }); FEED.icon(S.g, 'thumb', 0, -3, 7, { down: true, col: C.red, cuff: C.red, ink: S.ink.fine * 1.4 }); } },
      armF: { box: [-40, -200, 24, -128], pivot: [6, -186], won: true, draw(S) { S.limb([6, -186], [-22, -146], 17, S.won ? CT.pinkD : CT.back); } },
      body: {
        box: [-108, -322, 100, -150], pivot: [0, -170], won: true,
        draw(S) {
          S.cel(CT_BODY, S.won ? CT.pink : CT.cloud, { hi: true, decor(g) { S.under(-110, -320, 100, -160, 0.9); } });
          S.blush(-56, -214, 16); S.blush(4, -214, 16);
        },
      },
      laptop: {
        box: [-106, -150, -2, -122], pivot: [-54, -134],
        draw(S) {
          S.cel([[-100, -144], [-18, -144], [-6, -128], [-90, -128]], CT.laptop, { hi: true, tension: 0.1 });
          const g = S.g;
          g.fillStyle = 'rgba(63,240,255,0.85)';
          for (let r = 0; r < 3; r++) for (let k = 0; k < 9; k++) g.fillRect(-92 + k * 8.4 + r * 3, -142 + r * 4.4, 6, 2.6);
        },
      },
      armN: { box: [-84, -206, -24, -126], pivot: [-44, -192], won: true, draw(S) { S.limb([-44, -192], [-54, -146], 18, S.won ? CT.pink : CT.cloud); } },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, sl = Math.max(0, sw), back = Math.max(0, -sw), tele = E0.tele, hurt = E0.hurt, guard = E0.guard, won = st.won, bp = Math.sin(PI * E0.buffP);
      const br = Math.sin(TAU * t / 3.2) * m, rise = 8 * tele + 10 * bp - 4 * guard;
      const dx = -sw * 30 + hurt * 18 + tele * 5;
      // drizzle under the cloud (a tiny rainbow once it cheers up)
      ctx.save(); ctx.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const u = fr(t * 1.2 + hv(i, 'rain')), x = dx - 70 + i * 17, y0 = -160 + u * 150;
        ctx.globalAlpha = cA(Math.sin(PI * u) * 0.65 * (1 - won)); ctx.strokeStyle = '#8fd0ff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x - 3, y0 + 9); ctx.stroke();
      }
      if (won > 0.5) {
        ctx.globalAlpha = cA((won - 0.5) * 2); ctx.lineWidth = 4;
        ['#ff6f6f', '#ffb347', '#ffd84d', '#6dff8a', '#6dd5ff', '#b693ff'].forEach((col, i) => { ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(dx, -100, 56 - i * 4, PI * 1.1, PI * 1.9); ctx.stroke(); });
      }
      ctx.restore();
      ctx.save();
      xform(ctx, 0, -170, dx, -rise + 2 * br, -0.05 * sw + 0.08 * hurt + 0.03 * tele, 1 + 0.015 * br + 0.04 * bp, 1 - 0.015 * br + 0.03 * bp);
      put(ctx, st, 'back', { sx: 1 + 0.02 * Math.sin(TAU * t / 2.6) * m });
      // the trailing props: a typing bubble and a thumbs down, bobbing behind it
      put(ctx, st, 'bubble', { x: 88 + 4 * Math.sin(t * 1.3) * m, y: -296 + 6 * Math.sin(t * 1.7) * m, r: 0.1 * Math.sin(t * 1.1) * m + 0.2 * hurt, a: 1 - won });
      put(ctx, st, 'thumb', { x: 104 + 4 * Math.sin(t * 1.5 + 2) * m, y: -226 + 6 * Math.sin(t * 1.4 + 1) * m, r: 0.12 * Math.sin(t * 1.2 + 1) * m - 0.2 * hurt, a: 1 - won });
      // typing: the stubby arms take turns, furiously (both slam down on Reply All)
      const ty = (ph) => Math.max(0, Math.sin(t * 22 + ph)) * 0.16 * m * (1 - won);
      put(ctx, st, 'armF', { r: -ty(1.6) - 0.6 * tele - 1.2 * bp + 0.3 * sl + 0.7 * guard });
      put(ctx, st, 'body', {
        kids(c) {
          const ang = clamp(0.5 + tele + sl + 0.5 * hurt, 0, 1.4) * (1 - won);
          eyes(c, st, -26, -240, 23, { gap: 34, open: blink(t, 'troll', 4.4) * (1 - 0.5 * hurt), lid: 0.28, lx: -0.6 });
          // the deep frown: heavy brows down at the middle, a pout (a soft smile once won over)
          if (won < 0.5) { brow(c, -44, -264 + 3 * ang, 24, 0.55 + 0.35 * ang, -1, { w: 5.4 }); brow(c, -8, -266 + 3 * ang, 24, 0.55 + 0.35 * ang, 1, { w: 5.4 }); }
          mouth(c, st, -26, -212, 18 + 4 * sl, hurt > 0.3 || sl > 0.3 ? 'ow' : 'frown');
        },
      });
      put(ctx, st, 'laptop', {
        kids(c) {
          // the lid, turned toward the troll so we see its screen at an angle: the thread, scrolling for ever
          c.save(); c.translate(-84, -180); c.transform(0.62, -0.22, 0, 1, 0, 0);
          FEED.screen(c, 0, 0, 74, 54, { kind: 'thread', t, on: 1 - won, case: '#4a5288', lw: st.spec.lw * 1.2, seed: 6 });
          c.restore();
          if (won < 1) tk.glow(c, -64, -180, 70, C.cyan, 0.3 * (1 - won));
        },
      });
      put(ctx, st, 'armN', { r: ty(0) + 0.5 * tele + 1.1 * bp - 0.9 * sl + 0.4 * back - 0.9 * guard - 0.2 * hurt });
      ctx.restore();
      // Start a Thread and More Replies: bubbles burst out of it; at rest a few drift up and away
      FEED.balloons(ctx, dx + 40, -300 - rise, t, 3, 21, { alpha: 0.8 * (1 - won), rise: 60, spread: 50, size: 9, kinds: ['dots', 'thumb'], down: true, drift: 30 });
      if (bp > 0.05) FEED.balloons(ctx, dx - 20, -250, t * 1.6, 6, 22, { alpha: bp, rise: 90, spread: 90, size: 10, kinds: ['dots', 'thumb', 'dots'], down: true });
      // Who Asked? and Ratio: a volley of thumbs down and a crackle of lightning at the heroes
      if (E0.pose === 'attack' && E0.p > 0.36) {
        const u = clamp((E0.p - 0.36) / 0.55, 0, 1);
        for (let i = 0; i < 5; i++) { const a = 1 - u; if (a > 0.05) { ctx.save(); ctx.globalAlpha = cA(a); FEED.icon(ctx, 'bubble', dx - 90 - u * (90 + 30 * i), -240 + (i - 2) * 26 * u, 11, { dots: false, ink: 2 }); FEED.icon(ctx, 'thumb', dx - 90 - u * (90 + 30 * i), -242 + (i - 2) * 26 * u, 5.5, { down: true, col: C.red, cuff: C.red, ink: 1.4 }); ctx.restore(); } }
      }
      if (tele > 0.3) {
        ctx.save(); ctx.globalAlpha = cA((tele - 0.3) * 1.4 * (0.6 + 0.4 * Math.sin(t * 30)));
        [[-60, -168], [20, -166]].forEach((b, i) => { const pts = [[dx + b[0], b[1]], [dx + b[0] - 8, b[1] + 16], [dx + b[0] + 2, b[1] + 22], [dx + b[0] - 10, b[1] + 42]]; tk.inkPath(ctx, pts, { w: 6, color: C.line, taper: 0.2, wobble: 0 }); tk.inkPath(ctx, pts, { w: 3, color: C.gold, taper: 0.2, wobble: 0, seed: i }); });
        ctx.restore();
      }
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // TRENDSETTER (puppet_master, rival, l): a tall glossy figure in a sparkly gold jacket on a high stool, a phone for a face showing one perfect
  // smile under a glossy quiff, and glowing strings from every finger to a crowd of Copycat Cutouts and phones. Kept from its rig: the stool,
  // the live strings and the finger work. Gold glitter, hot pink, screen blue.
  // ---------------------------------------------------------------------------------------------------------------
  const TS = { jacket: '#ffcf4d', jacketD: '#e0a92e', pink: '#ff4fa3', glove: '#fffaf1', case: '#efeaff', chrome: '#cdd3e6' };
  const TS_TIPS = [[-15, -20], [-7, -25], [1, -26], [9, -24], [16, -18]];      // fingertip offsets from the wrist, at rest (near hand; the far one is mirrored)
  function trendHand(S, far) {
    const base = far ? '#e2deec' : TS.glove;
    FOE.limb(S.g, [0, 0], [0, -8], 16, base, { act: 2, size: 'l' });
    TS_TIPS.forEach((tp, i) => S.limb([(i - 2) * 3.6, -10], [tp[0], tp[1]], 6, base));
    S.ell(0, -6, 11, 9.5, base, { hi: !far });
    S.line([[-6, 2], [6, 2]], { w: 2.4, color: TS.pink, taper: 0 });
  }
  define('puppet_master', {
    size: 'l', k: 0.9,
    bounds: { w: 190, h: 296, head: { x: 0, y: -280 }, body: { x: 0, y: -140 }, feet: { x: 0, y: 0 } },
    scr: [-4, -250, 44],
    parts: {
      stool: {
        box: [-56, -126, 58, 4], pivot: [0, 0],
        draw(S) {
          [[-30, -104, -46, -2], [30, -104, 48, -2], [0, -102, 2, 0]].forEach((L, i) => S.limb([L[0], L[1]], [L[2], L[3]], 5, i === 2 ? shadeOf(TS.chrome) : TS.chrome));
          S.line([[-40, -42], [0, -36], [42, -42]], { w: 3.2, color: '#9aa0bd', taper: 0 });
          S.cel(E(0, -106, 42, 11, 18), TS.chrome, {});
          S.cel(E(0, -112, 39, 10, 18), TS.pink, { hi: true });
        },
      },
      legF: { box: [-2, -122, 34, -52], pivot: [12, -116], draw(S) { S.limb([12, -116], [16, -70], 13, shadeOf(TS.pink)); S.ell(20, -62, 12, 7, '#dcdcea', {}); } },
      armF: { box: [26, -204, 100, -150], pivot: [34, -192], draw(S) { S.limb([34, -192], [80, -168], 15, TS.jacketD); S.ell(84, -166, 7, 9, TS.pink, {}); } },
      handF: { box: [-36, -46, 36, 12], pivot: [0, 0], draw(S) { trendHand(S, true); } },
      jacket: {
        box: [-46, -214, 46, -108], pivot: [0, -118],
        draw(S) {
          S.cel([[-34, -204], [-40, -170], [-30, -118], [30, -118], [40, -170], [34, -204], [0, -210]], TS.jacket, { hi: true, decor(g) { FEED.glitter(g, [-38, -206, 76, 86], 0.7, 14, 3, '#ffffff'); } });
          S.cel([[-12, -206], [0, -150], [12, -206], [6, -208], [-6, -208]], TS.pink, { shadow: false });
          S.cel([[-20, -206], [-6, -168], [-16, -164], [-28, -198]], TS.jacketD, {});
          S.cel([[20, -206], [6, -168], [16, -164], [28, -198]], TS.jacketD, {});
          S.ell(-3, -138, 3.4, 3.4, C.white, {});
        },
      },
      head: {
        box: [-38, -330, 38, -200], pivot: [0, -208], won: true,
        draw(S) {
          S.cel(RR(-10, -214, 20, 12, 3), TS.chrome, {});
          // a glossy pink quiff on top of the phone, then the phone itself (the face on its screen is live)
          S.cel([[-26, -290], [-30, -306], [-12, -324], [16, -324], [34, -306], [24, -300], [6, -310], [-10, -298]], TS.pink, { hi: true });
          S.cel(RR(-30, -296, 60, 86, 15), TS.case, { hi: true, decor(g) { S.under(-30, -296, 30, -210, 0.5); } });
          S.cel(RR(-25, -290, 50, 70, 10), C.glassD, { shadow: false, line: S.ink.fine * 1.4 });
          S.ell(0, -292, 2, 2, C.line, { shadow: false, line: false });
        },
      },
      armN: { box: [-100, -204, -26, -150], pivot: [-34, -192], draw(S) { S.limb([-34, -192], [-80, -168], 16, TS.jacket); S.ell(-84, -166, 7.5, 9.5, TS.pink, { hi: true }); } },
      handN: { box: [-36, -46, 36, 12], pivot: [0, 0], draw(S) { trendHand(S, false); } },
      legN: { box: [-36, -122, 2, -50], pivot: [-14, -116], draw(S) { S.limb([-14, -116], [-18, -68], 14, TS.pink); S.ell(-22, -60, 13, 7.5, '#f8f8ff', { hi: true }); } },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, sl = Math.max(0, sw), tele = E0.tele, hurt = E0.hurt, guard = E0.guard, won = st.won, bp = Math.sin(PI * E0.buffP);
      const br = Math.sin(TAU * t / 3.0) * m, dx = -sw * 22 + hurt * 14 + tele * 6, hot = clamp(tele + sl + bp, 0, 1);
      // arm and hand angles: the hands wiggle (the finger work), the arms rise on the wind-up and whip on the strike
      const fw = (ph) => m * (0.12 + 0.2 * bp) * Math.sin(t * (4.2 + 4 * bp) + ph);
      const nA = 0.15 * Math.sin(TAU * t / 2.6) * m + 0.85 * tele - 0.55 * sl + 0.45 * Math.max(0, -sw) + 0.7 * guard + 0.35 * hurt - 0.3;
      const fA = 0.12 * Math.sin(TAU * t / 2.6 + 1) * m - 0.7 * tele + 0.5 * sl - 0.55 * guard - 0.25 * hurt + 0.3;
      const nH = fw(0.4) - 0.3 * sl + 0.3 * guard, fH = fw(2.1) - 0.3 * sl - 0.3 * guard;
      const wristN = [-88, -170], wristF = [88, -170];
      const tips = (arm, wx, wy, shX, shY, mir, rotH) => TS_TIPS.map((tp) => { const a = rotAbout(0, 0, tp[0] * mir, tp[1], rotH); return rotAbout(shX, shY, a[0] + wx, a[1] + wy, arm); });
      const tn = tips(nA, wristN[0], wristN[1], -34, -192, 1, nH), tf = tips(fA, wristF[0], wristF[1], 34, -192, -1, fH);
      ctx.save();
      put(ctx, st, 'stool');
      ctx.save();
      xform(ctx, 0, -112, dx, 0, 0.02 * br - 0.03 * sw + 0.06 * hurt, 1 + 0.01 * br, 1 - 0.01 * br);
      put(ctx, st, 'legF', { r: 0.1 * Math.sin(TAU * t / 2.2 + 1) * m + 0.2 * hurt + 0.1 * tele });
      put(ctx, st, 'armF', { r: fA, kids(c) { put(c, st, 'handF', { x: wristF[0], y: wristF[1], r: fH, sx: -1 }); } });
      put(ctx, st, 'jacket', {
        r: 0.01 * br,
        kids(c) {
          put(c, st, 'head', {
            r: lerp(-0.1, 0.14, won) + 0.04 * Math.sin(TAU * t / 3.1) * m - 0.1 * sw + 0.14 * hurt + 0.05 * tele,
            kids(cc) {
              // the screen face: eyes looking down, THE perfect smile, and a filter sliding over it all
              const on = 1 - won;
              if (on > 0.02) { cc.save(); cc.globalAlpha = on * 0.8; cc.beginPath(); rrPath(cc, -25, -290, 50, 70, 10); cc.fillStyle = C.glass; cc.fill(); cc.restore(); }
              eyes(cc, st, -6, -266, 13, { gap: 19, open: blink(t, 'trend', 4.4) * (1 - 0.5 * hurt), lx: -0.4 });
              if (won > 0.5) mouth(cc, st, -6, -244, 16, 'smile'); else trendSmile(cc, -6, -247, 26 + 4 * hot, 1.8);
              blush(cc, -20, -250, 9); blush(cc, 10, -250, 9);
              FOE.glossSheen(cc, [-25, -290, 50, 70], 0.7 * on, { shape: RR(-25, -290, 50, 70, 10), t, seed: 4 });
            },
          });
        },
      });
      put(ctx, st, 'legN', { r: -0.1 * Math.sin(TAU * t / 2.2) * m - 0.15 * hurt - 0.1 * tele + 0.2 * sw });
      put(ctx, st, 'armN', { r: nA, kids(c) { put(c, st, 'handN', { x: wristN[0], y: wristN[1], r: nH }); } });
      ctx.restore();
      // the strings: one from every fingertip, glowing pink, rising out of sight and swaying like harp strings
      ctx.save(); ctx.lineCap = 'round';
      const taut = clamp(tele + 0.5 * bp, 0, 1), slack = 1 - 0.8 * won;
      [tn, tf].forEach((set, hi) => set.forEach((tp0, i) => {
        const tp = [tp0[0] + dx, tp0[1]], k = hi * 5 + i, ph = k * 0.9, topY = -320, whipX = sl * (-150 - 20 * i) * (hi ? 0.8 : 1);
        const midX = tp[0] + (hi ? 1 : -1) * (6 + 5 * (i - 2)) + Math.sin(t * 2.4 + ph) * 8 * m * (1 - taut) + whipX * 0.5;
        const endX = tp[0] + (hi ? 1 : -1) * (20 + 10 * i) * (1 + taut * 0.3) + Math.sin(t * 1.7 + ph) * 12 * m * (1 - taut) + whipX;
        const midY = (tp[1] + topY) / 2 + Math.sin(t * 3 + ph) * 6 * m;
        const g = ctx.createLinearGradient(0, tp[1], 0, topY);
        g.addColorStop(0, 'rgba(255,111,181,0.95)'); g.addColorStop(0.6, 'rgba(255,111,181,0.5)'); g.addColorStop(1, 'rgba(255,111,181,0)');
        ctx.globalAlpha = slack; ctx.strokeStyle = g; ctx.lineWidth = 1.7 + taut * 0.8;
        ctx.beginPath(); ctx.moveTo(tp[0], tp[1]); ctx.quadraticCurveTo(midX, midY, endX, topY); ctx.stroke();
        const u = fr(t * (0.7 + 0.6 * bp + 0.6 * taut) + k * 0.13);
        tk.glow(ctx, lerp(lerp(tp[0], midX, u), lerp(midX, endX, u), u), lerp(lerp(tp[1], midY, u), lerp(midY, topY, u), u), 6 + 3 * taut, C.pink, cA(0.8 * (1 - u) * slack));
      }));
      ctx.restore();
      if (bp > 0.05) FEED.glitter(ctx, [dx - 80, -330, 160, 200], t, 10, 7, C.gold);
      ctx.restore();
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // DOOMSCROLL MOTH (umibozu, rival, l): a huge soft lavender moth with heavy-lidded eyes and fluffy antennae, rising from below the frame; its
  // two wings are giant glowing phone screens with posts scrolling up them for ever, and its body is striped like pyjamas. Won over, it
  // finally flutters toward the moon instead of a screen. Kept from its rig: the rise from below and the huge scale. Lavender, midnight
  // blue, screen glow.
  // ---------------------------------------------------------------------------------------------------------------
  const DM = { body: '#c7b3ff', bodyD: '#a58fe8', ruff: '#f1eaff', stripe: '#6f78d8', case: '#262d63' };
  function mothWing(S, w, h) { S.cel(RR(-w / 2, -h, w, h, 16), DM.case, { hi: true }); }
  function mothAntenna(S, x0, y0, x1, y1, bend) {
    const g = S.g, mx = (x0 + x1) / 2 + bend, my = (y0 + y1) / 2;
    const spine = [[x0, y0], [mx, my], [x1, y1]];
    // a soft plume: a fat feathery leaf on a curved stem, its edge scalloped, comb lines across it
    const pts = [], n = 9;
    for (let i = 0; i <= n; i++) { const p = along(spine, 0.12 + 0.88 * i / n), w = 11 * Math.sin(PI * (0.08 + 0.88 * i / n)) * (i % 2 ? 1.18 : 1); pts.push([p.x - p.ty * w, p.y + p.tx * w]); }
    for (let i = n; i >= 0; i--) { const p = along(spine, 0.12 + 0.88 * i / n), w = 11 * Math.sin(PI * (0.08 + 0.88 * i / n)) * (i % 2 ? 1.18 : 1); pts.push([p.x + p.ty * w, p.y - p.tx * w]); }
    S.limb(spine[0], along(spine, 0.16), 3.2, DM.bodyD);
    S.cel(pts, DM.ruff, { hi: true });
    for (let i = 1; i < 8; i++) { const p = along(spine, 0.18 + i * 0.09), w = 8 * Math.sin(PI * (0.18 + i * 0.09)); g.save(); g.strokeStyle = DM.bodyD; g.lineWidth = 1.1; g.beginPath(); g.moveTo(p.x - p.ty * w, p.y + p.tx * w); g.lineTo(p.x + p.ty * w, p.y - p.tx * w); g.stroke(); g.restore(); }
  }
  define('umibozu', {
    size: 'l',
    bounds: { w: 250, h: 313, head: { x: 0, y: -256 }, body: { x: 0, y: -130 }, feet: { x: 0, y: 0 }, right: 189 },
    scr: [0, -150, 80],
    hop: 26,
    parts: {
      wingF: { box: [-48, -168, 48, 4], pivot: [0, 0], draw(S) { mothWing(S, 84, 158); } },
      abdomen: {
        box: [-50, -150, 56, 2], pivot: [2, -140],
        draw(S) {
          const shape = E(2, -76, 40, 66, 26);
          S.cel(shape, DM.body, { hi: true, decor(g) { g.fillStyle = DM.stripe; for (let i = -3; i <= 3; i++) g.fillRect(-4 + i * 14, -160, 6, 170); S.under(-48, -150, 52, 0, 0.6); } });
        },
      },
      armF: { box: [8, -150, 48, -100], pivot: [20, -140], draw(S) { S.limb([20, -140], [34, -114], 11, DM.bodyD); } },
      head: {
        box: [-66, -286, 62, -128], pivot: [0, -140], won: true,
        draw(S) {
          mothAntenna(S, -24, -236, -58, -272, -14); mothAntenna(S, 18, -238, 48, -276, 14);
          S.cel(cloudPts(0, -148, 48, 15, 9, 4), DM.ruff, {});
          S.cel(E(-2, -194, 58, 52, 30), DM.body, { hi: true, decor(g) { S.under(-62, -248, 58, -146, 0.75); } });
          S.blush(-44, -176, 16); S.blush(18, -176, 16);
        },
      },
      armN: { box: [-60, -152, -10, -100], pivot: [-24, -142], draw(S) { S.limb([-24, -142], [-42, -116], 12, DM.body); } },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, sl = Math.max(0, sw), back = Math.max(0, -sw), tele = E0.tele, hurt = E0.hurt, guard = E0.guard, won = st.won, bp = Math.sin(PI * E0.buffP);
      const br = Math.sin(TAU * t / 3.6) * m, dx = -sw * 18 + hurt * 12 + tele * 4;
      // the rise: it bobs up out of the glow below, higher on the wind-up
      const rise = 6 + 4 * br + 12 * tele + 6 * bp - 4 * guard + 10 * won;
      const on = 1 - won;
      // the glow pool of the screens it rose out of
      ctx.save(); ctx.translate(dx * 0.4, -6); ctx.scale(1, 0.22); tk.glow(ctx, 0, 0, 130, C.blue, 0.45 * on + 0.1); ctx.restore();
      ctx.save();
      xform(ctx, 0, -140, dx, -rise, -0.04 * sw + 0.06 * hurt + 0.012 * br, 1 + 0.01 * br, 1 - 0.01 * br);
      // the wings: two giant phones scrolling for ever. They rise on the wind-up and come down like a wave on the strike
      const A = E0.pose === 'attack' ? tk.track([[0, 0], [0.3, 0.5], [0.5, -0.5], [1, 0]], E0.p, 'inOutSine') : 0;
      const flap = 0.06 * Math.sin(TAU * t / (won > 0.5 ? 0.4 : 2.4)) * m + 0.2 * bp * Math.sin(t * 14) + (won > 0.5 ? 0.18 : 0);
      const wingDraw = (name, x, y, rot, sx) => put(ctx, st, name, {
        x, y, r: rot, sx,
        kids(c) { FEED.screen(c, 0, -79, 72, 146, { kind: 'feed', t: t * (1 + 2 * bp), on, case: 'rgba(0,0,0,0)', bezel: 0.06, lw: 1.2, round: 0.14, seed: name === 'wingF' ? 3 : 8 }); },
      });
      wingDraw('wingF', 36, -150, 0.5 + flap + 0.35 * tele - A - 0.6 * guard, 0.92);
      wingDraw('wingF', -40, -150, -0.55 - flap - 0.35 * tele + A + 0.7 * guard, -1);
      put(ctx, st, 'abdomen', { r: 0.03 * Math.sin(TAU * t / 2.8) * m + 0.05 * hurt, sx: 1 + 0.02 * br });
      put(ctx, st, 'armF', { r: -0.2 * Math.sin(TAU * t / 2.2) * m - 0.8 * bp + 0.4 * guard });
      put(ctx, st, 'head', {
        r: lerp(-0.08, 0.14, won) + 0.02 * Math.sin(TAU * t / 4.2) * m - 0.07 * sw + 0.1 * hurt,
        kids(c) {
          eyes(c, st, -16, -198, 26, { kind: 'sleepy', gap: 38, open: blink(t, 'moth', 6) * (1 - 0.5 * hurt) * (1 + 0.15 * tele), lid: 0.1, lx: -0.3 });
          mouth(c, st, -12, -168, 14 + 6 * sl, hurt > 0.3 || sl > 0.3 ? 'ow' : 'smile');
          if (on > 0.02) tk.glow(c, -6, -150, 80, C.blue, 0.26 * on);
        },
      });
      put(ctx, st, 'armN', { r: 0.2 * Math.sin(TAU * t / 2.2) * m + 0.8 * bp - 0.6 * sl + 0.3 * back - 0.4 * guard });
      ctx.restore();
      // Screen Glare: a white flare over its head on the wind-up; Blue Light: the glow swells
      if (tele > 0.02) { tk.glow(ctx, dx, -250 - rise, 70 + 30 * tele, '#ffffff', 0.45 * tele); tk.sparkle(ctx, dx, -250 - rise, 16 * tele, { color: '#ffffff', glow: 0.6, rot: t }); }
      if (E0.pose === 'attack' && E0.p > 0.42) {
        const a = (E0.p - 0.42) / 0.58;
        ctx.save(); ctx.globalAlpha = cA((1 - a) * 0.9); ctx.strokeStyle = C.cyan; ctx.lineWidth = 4; ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(dx - 60, -40, 60 + i * 30 + a * 160, PI * 0.95, PI * 1.35); ctx.stroke(); }
        ctx.restore();
      }
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // SCROLLSPINNER, QUEEN OF THE FEED (boss_jorogumo, headliner, xl): a glamorous giant spider who spins the endless feed over Scrollopolis, so
  // that nobody in the city is ever lonely or bored. Glitter, glass and light only (no robes, no pins, nothing spun by an animal).
  //   phase 0  THE AVATAR: a towering bell silhouette in a glittering gown, a perfect filtered face in a ring-light halo, a phone held up for a
  //            selfie, only four slender spider feet peeking out under the hem, and the Feed's glowing cables strung behind her with little
  //            notification balloons hanging off them.
  //   phase 1  THE SPINNER: the gown splits open on a spider's body, eight long legs skitter, eight bright phone-screen eyes glow (each with a
  //            tiny heart or thumb), her hair is loose, and a great web of glowing cables fills the sky behind. She blazes below 20 percent.
  // Won over, the screens in her eyes switch off one by one and her real eyes look up. Kept from her rig: the whole two-phase structure, the
  // bell silhouette, the four peeking feet, the phase 1 legs and the web. Midnight violet, glitter gold, ring-light white, screen cyan.
  // ---------------------------------------------------------------------------------------------------------------
  const SQ = { gown: '#3b2c96', gownL: '#5a44c8', gownD: '#2a1f6e', gold: '#ffd84d', goldD: '#e0a92e', white: '#fffaf1', skin: '#fdd3b6', hair: '#4a33a6', hairL: '#a08cff', leg: '#4a39b0', legF: '#33287e', pink: '#ff6fb5' };
  const SQ_SPINE = [[0, 0], [74, -146, 1], [236, 118]];
  const SQ_LEG_ROOT = [
    // [x, y, dir, spread, far, phase offset]
    [-40, -124, -1, 0.74, true, 0.2], [-22, -118, -1, 0.48, true, 1.4], [34, -120, 1, 0.7, true, 2.2], [60, -122, 1, 0.44, true, 3.1],
    [-50, -120, -1, 0.86, false, 0.0], [-34, -112, -1, 0.6, false, 0.9], [24, -116, 1, 0.8, false, 1.8], [50, -118, 1, 0.55, false, 2.7],
  ];
  const SQ_GOWN = [[-46, -198], [-58, -170], [-78, -120], [-108, -52], [-126, -18], [-98, -8], [0, -4], [98, -8], [126, -18], [108, -52], [78, -120], [58, -170], [46, -198], [0, -206]];
  const SQ_FACE = E(-6, -258, 31, 34, 24);
  // The eight phase 1 legs: chunky chibi limbs, a warm brown line and a lighter violet fill so they read on the dark gown body and on the navy
  // Act II night (P11 D10). The bake is wider than it looks: the leg is squashed sideways by its spread (0.44 to 0.86) when it is placed, so
  // the line weight and the width are drawn for the thinnest case. A round knee ball and a round pink foot give it rounded joints.
  const SQ_LEGC = { n: '#8f7bf5', f: '#7a66e2', nHi: '#cabdff', fHi: '#a99bf6', line: '#2d170f', pink: '#ff8fc4', pinkF: '#e56aa6' };
  function sqLeg(S, far) {
    const base = far ? SQ_LEGC.f : SQ_LEGC.n;
    S.rib(SQ_SPINE, base, { wMax: 36, w0: 34, w1: 15, cap: 'round', profile: (u) => 1 - 0.6 * Math.pow(u, 0.9), line: far ? 4.4 : 5, lineColor: SQ_LEGC.line, shadow: shadeOf(base), shadowW: 0.34, gloss: true, glossColor: far ? SQ_LEGC.fHi : SQ_LEGC.nHi, glossAlpha: 0.6 });
    S.ell(0, 0, 17, 15, base, { line: 4.6, lineColor: SQ_LEGC.line, hi: true });
    S.ell(74, -146, 15, 15, far ? SQ.goldD : SQ.gold, { line: 4.6, lineColor: SQ_LEGC.line, hi: true });
    [0.2, 0.55, 0.8].forEach((u) => { const p = along(SQ_SPINE, u); S.g.save(); S.g.fillStyle = far ? 'rgba(255,216,77,0.6)' : 'rgba(255,216,77,0.95)'; S.g.beginPath(); S.g.arc(p.x, p.y, 3, 0, TAU); S.g.fill(); S.g.restore(); });
    S.ell(238, 116, 13, 10, far ? SQ_LEGC.pinkF : SQ_LEGC.pink, { line: 4.6, lineColor: SQ_LEGC.line, shadow: false });
  }
  // a glittering scalloped flounce at the hem of the gown
  function sqTier(S, hw, col, seed) {
    const pts = [[-hw, -24]];
    for (let i = 0; i <= 12; i++) { const x = -hw + i / 12 * hw * 2; pts.push([x, -6 + (i % 2 ? 8 : 1) + (seed % 3)]); }
    pts.push([hw, -24]);
    S.cel(pts, col, { hi: true, tension: 0.6 });
    FEED.glitter(S.g, [-hw, -24, hw * 2, 18], seed * 0.7, 9, seed, '#ffffff');
  }
  define('boss_jorogumo', {
    size: 'xl', k: 1.1,
    bounds: { w: 560, h: 418, head: { x: -6, y: -372 }, body: { x: 0, y: -170 }, feet: { x: 0, y: 0 }, right: 328 },
    scr: [-80, -290, 60],
    hop: 26,
    gloss(g, st, k) { if (st.phase < 1) FOE.glossSheen(g, [-38, -294, 64, 72], k, { shape: SQ_FACE, t: st.t, seed: 5 }); },
    parts: {
      // ------------------------------------------------ phase 0: the Avatar
      tip: { box: [-6, -36, 74, 12], pivot: [0, 0], draw(S) { S.rib([[0, -22], [36, -32, 1], [70, 4]], SQ.leg, { wMax: 12, w0: 11, w1: 3, cap: 'round', profile: (u) => 1 - 0.7 * u }); S.ell(36, -32, 5, 5, SQ.gold, {}); } },
      balloon: { box: [-18, -20, 18, 34], pivot: [0, 30], draw(S) { S.line([[0, 30], [0, 12]], { w: 1.4, color: '#c9d6ff', taper: 0 }); FEED.icon(S.g, 'bubble', 0, -2, 14, { dots: false, ink: S.ink.mid }); FEED.icon(S.g, 'heart', 0, -3, 6, { ink: 0 }); } },
      tierV: { box: [-150, -46, 150, 14], pivot: [0, -6], draw(S) { sqTier(S, 140, SQ.gownL, 0); } },
      tierW: { box: [-140, -40, 140, 12], pivot: [0, -6], draw(S) { sqTier(S, 128, SQ.gold, 2); } },
      tierG: { box: [-130, -34, 130, 10], pivot: [0, -6], draw(S) { sqTier(S, 116, '#f4f1fb', 4); } },
      gown: {
        box: [-140, -214, 140, 4], pivot: [0, -6],
        draw(S) {
          S.cel(SQ_GOWN, SQ.gown, {
            hi: true,
            decor(g) {
              const gr = g.createLinearGradient(-60, -200, 60, 0);
              gr.addColorStop(0, 'rgba(123,92,255,0.45)'); gr.addColorStop(0.5, 'rgba(255,111,181,0.12)'); gr.addColorStop(1, 'rgba(63,240,255,0.2)');
              g.fillStyle = gr; g.fillRect(-130, -210, 260, 210);
              const r = tk.rng('sqglit', 1);
              for (let i = 0; i < 70; i++) { const x = -120 + r() * 240, y = -200 + r() * 196; g.fillStyle = i % 3 ? 'rgba(255,216,77,0.85)' : 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(x, y, 1 + r() * 1.4, 0, TAU); g.fill(); }
            },
          });
          S.line([[-46, -196], [-20, -120], [-30, -10]], { w: S.ink.fine, color: SQ.gownD });
          S.line([[40, -196], [26, -110], [40, -10]], { w: S.ink.fine, color: SQ.gownD });
        },
      },
      halo: {
        box: [-70, -340, 74, -196], pivot: [2, -268],
        draw(S) {
          S.cel(E(2, -268, 66, 66, 40).concat(E(2, -268, 56, 56, 36).reverse()), SQ.white, { shadow: '#e4dcff', tension: 0.5 });
          for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; S.g.beginPath(); S.g.arc(2 + Math.cos(a) * 61, -268 + Math.sin(a) * 61, 1.8, 0, TAU); S.g.fillStyle = '#fff2c4'; S.g.fill(); }
        },
      },
      armF: { box: [18, -230, 64, -156], pivot: [28, -216], draw(S) { S.limb([28, -216], [50, -186], 11, SQ.gownL); S.limb([50, -186], [36, -168], 10, SQ.gownL); S.ell(33, -166, 7, 6.5, SQ.skin, {}); } },
      torsoA: {
        box: [-44, -236, 44, -150], pivot: [0, -160],
        draw(S) {
          S.cel([[-22, -230], [-30, -222], [-26, -208], [26, -208], [30, -222], [22, -230], [0, -232]], SQ.skin, { hi: true });
          S.cel([[-26, -212], [-10, -204], [0, -210], [10, -204], [26, -212], [27, -192], [19, -172], [22, -158], [-22, -158], [-19, -172], [-27, -192]], SQ.gold, { hi: true, decor(g) { FEED.glitter(g, [-30, -212, 60, 54], 1.3, 9, 5, '#ffffff'); } });
          S.cel(E(0, -160, 25, 6, 16), SQ.pink, { hi: true });
        },
      },
      headA: {
        box: [-60, -340, 66, -216], pivot: [0, -226],
        draw(S) {
          // a sleek glossy updo (the bun on top swings a ponytail behind), side-swept bangs, gold hoops
          S.cel(E(0, -264, 42, 42, 28), SQ.hair, { hi: true });
          S.cel(E(6, -312, 18, 15, 16), SQ.hair, { hi: true });
          S.cel(RR(-2, -302, 16, 8, 3), SQ.gold, {});
          S.cel(cap(-6, -238, -6, -224, 15, 15), SQ.skin, {});
          S.cel(SQ_FACE, SQ.skin, { hi: true });
          S.cel([[-40, -268], [-36, -290], [-16, -302], [12, -300], [30, -284], [36, -262], [22, -280], [4, -286], [-14, -282], [-30, -272]], SQ.hair, { hi: true });
          S.cel([[30, -282], [40, -260], [36, -236], [28, -246]], SQ.hair, {});
          S.g.save(); S.g.lineWidth = 2.4; S.g.strokeStyle = C.line; S.g.beginPath(); S.g.arc(22, -230, 6, 0, TAU); S.g.stroke(); S.g.lineWidth = 1.4; S.g.strokeStyle = SQ.gold; S.g.stroke(); S.g.restore();
          S.blush(-26, -244, 12); S.blush(8, -244, 12);
        },
      },
      phone: {
        box: [-20, -34, 20, 30], pivot: [0, 0],
        draw(S) {
          S.cel(RR(-14, -30, 28, 50, 8), SQ.gold, { hi: true, decor(g) { FEED.glitter(g, [-14, -30, 28, 50], 2.1, 6, 7, '#ffffff'); } });
          S.ell(-6, -22, 4, 4, C.night, { line: S.ink.fine * 1.4 });
          FEED.icon(S.g, 'heart', 4, 6, 5, { ink: S.ink.fine * 1.4 });
        },
      },
      armN: { box: [-84, -276, -16, -206], pivot: [-28, -216], draw(S) { S.limb([-28, -216], [-56, -232], 11, SQ.gownL); S.limb([-56, -232], [-72, -262], 10, SQ.gownL); S.ell(-74, -266, 7, 7, SQ.skin, { hi: true }); } },
      // ------------------------------------------------ phase 1: the Spinner
      abdomen: {
        box: [0, -210, 196, -36], pivot: [98, -124],
        draw(S) {
          S.cel(E(98, -124, 92, 72, 30, -0.16), SQ.gown, {
            hi: true,
            decor(g) {
              const r = tk.rng('sqabd', 2);
              for (let i = 0; i < 60; i++) { const a = r() * TAU, rr = r() * 84; g.fillStyle = i % 3 ? 'rgba(255,216,77,0.8)' : 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(98 + Math.cos(a) * rr, -124 + Math.sin(a) * rr * 0.78, 1 + r() * 1.4, 0, TAU); g.fill(); }
              g.strokeStyle = 'rgba(63,240,255,0.35)'; g.lineWidth = 1.6;
              for (let rr = 26; rr <= 80; rr += 18) { g.beginPath(); g.ellipse(98, -124, rr, rr * 0.78, -0.16, 0, TAU); g.stroke(); }
            },
          });
          // the sigil of the Feed: one big glowing heart screen
          S.cel(RR(70, -152, 56, 46, 12), C.glassD, { shadow: false });
          FEED.icon(S.g, 'heart', 98, -128, 16, { ink: S.ink.mid });
        },
      },
      thorax: { box: [-64, -180, 60, -80], pivot: [-4, -130], draw(S) { S.cel(E(-4, -128, 52, 42, 24), SQ.leg, { hi: true }); } },
      torsoB: {
        box: [-44, -236, 44, -110], pivot: [-6, -150],
        draw(S) {
          S.cel([[-22, -230], [-30, -222], [-26, -208], [26, -208], [30, -222], [22, -230], [0, -232]], SQ.skin, { hi: true });
          S.cel([[-26, -212], [-10, -204], [0, -210], [10, -204], [26, -212], [27, -192], [18, -166], [24, -134], [-24, -134], [-18, -166], [-27, -192]], SQ.gold, { hi: true, decor(g) { FEED.glitter(g, [-34, -212, 68, 78], 0.4, 12, 8, '#ffffff'); } });
          S.cel(E(0, -136, 32, 7, 16), SQ.pink, { hi: true });
        },
      },
      headB: {
        box: [-74, -348, 76, -216], pivot: [0, -226],
        draw(S) {
          // her hair loose and wild, glossy violet with a cyan glint
          S.cel([[-52, -262], [-60, -296], [-42, -330], [-6, -348], [34, -342], [60, -322], [86, -302, 1], [68, -292], [84, -268, 1], [62, -262], [70, -238, 1], [46, -240], [36, -220, 1], [20, -234], [-30, -234], [-54, -222, 1], [-48, -244]], SQ.hair, { hi: true, tension: 0.45 });
          [[[-40, -312], [-20, -334], [8, -340]], [[20, -334], [46, -318], [66, -298]], [[38, -296], [56, -276], [60, -258]]].forEach((L) => S.line(L, { w: 3, color: SQ.hairL, taper: 0.4 }));
          S.cel(cap(-6, -238, -6, -224, 15, 15), SQ.skin, {});
          S.cel(SQ_FACE, SQ.skin, { hi: true });
          S.cel([[-42, -266], [-40, -292], [-18, -306], [12, -304], [32, -288], [38, -262], [22, -280], [6, -272], [-12, -284], [-28, -268]], SQ.hair, { hi: true });
          S.cel([[-40, -270], [-52, -246], [-50, -222], [-40, -236]], SQ.hair, {});
          S.line([[-18, -300], [-4, -290], [8, -278]], { w: 3, color: SQ.hairL, taper: 0.3 });
          S.blush(-26, -244, 12); S.blush(8, -244, 12);
        },
      },
      clawN: { box: [-104, -276, -20, -170], pivot: [-28, -206], draw(S) { S.limb([-28, -206], [-60, -218], 11, SQ.gownL); S.limb([-60, -218], [-80, -246], 10, SQ.gownL); S.ell(-84, -252, 8, 7.5, SQ.skin, { hi: true }); [-1, 0, 1].forEach((k) => S.limb([-86, -256], [-92 + k * 7, -270 + Math.abs(k) * 3], 4, SQ.skin)); } },
      clawF: { box: [16, -280, 112, -170], pivot: [30, -206], draw(S) { S.limb([30, -206], [62, -220], 10, SQ.gownD); S.limb([62, -220], [86, -250], 9, SQ.gownD); S.ell(90, -256, 7.5, 7, '#f0cdbd', {}); [-1, 0, 1].forEach((k) => S.limb([92, -260], [98 + k * 7, -274 + Math.abs(k) * 3], 4, '#f0cdbd')); } },
    },
    chains: {
      legN: { spine: SQ_SPINE, cuts: [0.34, 0.68], overlap: 12, reach: 30, draw(S) { sqLeg(S, false); } },
      legF: { spine: SQ_SPINE, cuts: [0.34, 0.68], overlap: 12, reach: 30, draw(S) { sqLeg(S, true); } },
      pony: {
        spine: [[6, -314], [40, -318], [64, -290], [74, -248]], cuts: [0.45], overlap: 8, reach: 22,
        draw(S) { S.rib([[6, -314], [40, -318], [64, -290], [74, -248]], SQ.hair, { wMax: 26, w0: 20, w1: 4, cap: 'round', gloss: true, glossColor: SQ.hairL, glossAlpha: 0.6 }); },
      },
      hairW: {
        spine: [[16, -300], [56, -306], [96, -292], [136, -304], [170, -290]], cuts: [0.3, 0.6], overlap: 8, reach: 24,
        draw(S) { S.rib([[16, -300], [56, -306], [96, -292], [136, -304], [170, -290]], SQ.hair, { wMax: 30, w0: 24, w1: 3, gloss: true, glossColor: SQ.hairL, glossAlpha: 0.55 }); },
      },
      hairW2: {
        spine: [[10, -270], [50, -262], [90, -246], [128, -256], [156, -236]], cuts: [0.3, 0.6], overlap: 8, reach: 22,
        draw(S) { S.rib([[10, -270], [50, -262], [90, -246], [128, -256], [156, -236]], SQ.hair, { wMax: 24, w0: 20, w1: 3, gloss: true, glossColor: SQ.hairL, glossAlpha: 0.5 }); },
      },
      drapeA: {
        spine: [[-20, -138], [-50, -120], [-74, -92], [-102, -70]], cuts: [0.34, 0.68], overlap: 8, reach: 26,
        draw(S) { S.rib([[-20, -138], [-50, -120], [-74, -92], [-102, -70]], SQ.gown, { wMax: 34, w0: 22, w1: 30, cap: 'round', profile: (u) => 0.65 + 0.35 * u, gloss: true, glossColor: SQ.gownL, glossAlpha: 0.6, decor(g) { FEED.glitter(g, [-120, -146, 110, 90], 0.3, 9, 11, '#ffd84d'); } }); },
      },
      drapeB: {
        spine: [[14, -136], [42, -116], [62, -88], [88, -66]], cuts: [0.34, 0.68], overlap: 8, reach: 26,
        draw(S) { S.rib([[14, -136], [42, -116], [62, -88], [88, -66]], SQ.gownD, { wMax: 32, w0: 20, w1: 28, cap: 'round', profile: (u) => 0.65 + 0.35 * u, gloss: true, glossColor: SQ.gown, glossAlpha: 0.6 }); },
      },
    },
    rig(ctx, st) {
      if (st.phase >= 1) sqSpinner(ctx, st); else sqAvatar(ctx, st);
    },
  });
  // the Feed's glowing cables strung across the sky behind her like stage rigging
  function sqCables(ctx, t, m, a, n) {
    if (a <= 0.01) return;
    ctx.save(); ctx.globalAlpha *= cA(a);
    const lines = [[-270, -300, 270, -326, -246], [-270, -196, 270, -222, -150], [-270, -360, 120, -380, -330]];
    for (let i = 0; i < Math.min(n, lines.length); i++) {
      const L = lines[i], sag = Math.sin(t * 0.9 + i) * 6 * m;
      FEED.cable(ctx, [[L[0], L[1]], [(L[0] + L[2]) / 2, L[4] + sag], [L[2], L[3]]], { w: 2.6, t: t + i * 0.4, speed: 0.4, lw: 1.6 });
    }
    ctx.restore();
  }
  // the great web of glowing cables behind the Spinner
  function sqWeb(ctx, t, m, a, cx, cy, R) {
    if (a <= 0.01) return;
    ctx.save(); ctx.lineCap = 'round';
    const spokes = 13, sw = (i) => Math.sin(t * 0.9 + i) * 4 * m;
    const pass = (w, col, al) => {
      ctx.globalAlpha = cA(a * al); ctx.lineWidth = w; ctx.strokeStyle = col;
      for (let i = 0; i < spokes; i++) { const an = i / spokes * TAU; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(an) * R + sw(i), cy + Math.sin(an) * R * 0.86 + sw(i + 3)); ctx.stroke(); }
      for (let r = R * 0.22; r <= R; r += R * 0.17) {
        ctx.beginPath();
        for (let i = 0; i <= spokes; i++) {
          const an = i / spokes * TAU, an2 = (i - 0.5) / spokes * TAU, x = cx + Math.cos(an) * r + sw(i) * r / R, y = cy + Math.sin(an) * r * 0.86 + sw(i + 3) * r / R;
          if (i === 0) ctx.moveTo(x, y); else ctx.quadraticCurveTo(cx + Math.cos(an2) * r * 0.9, cy + Math.sin(an2) * r * 0.86 * 0.9, x, y);
        }
        ctx.stroke();
      }
    };
    pass(5, C.blue, 0.35); pass(1.8, C.cyan, 0.9);
    ctx.restore();
  }
  // selfie hearts and air kisses flying at the heroes: n of them from (ox, oy), u = 0..1 progress
  function sqVolley(ctx, ox, oy, u, alpha, n, seed) {
    if (u <= 0 || alpha <= 0.01) return;
    for (let i = 0; i < n; i++) {
      const v = hv(seed, 'v' + i), ex = ox - (240 + 120 * v) * u, ey = oy + (i - (n - 1) / 2) * 30 * u + 60 * u * u * (0.5 + v);
      ctx.save(); ctx.globalAlpha = cA(alpha * (1 - u * 0.6)); FEED.icon(ctx, 'heart', ex, ey - 20 * Math.sin(PI * u), 7 + 3 * v, { ink: 1.8 }); ctx.restore();
    }
  }
  function sqAvatar(ctx, st) {
    const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, sl = Math.max(0, sw), back = Math.max(0, -sw), tele = E0.tele, hurt = E0.hurt, guard = E0.guard, won = st.won, bp = Math.sin(PI * E0.buffP);
    const br = Math.sin(TAU * t / 3.4) * m, hot = clamp(tele + sl + bp, 0, 1), on = 1 - won;
    const dx = -sw * 30 + hurt * 20 + tele * 8, lean = -0.05 * sw + 0.07 * hurt + 0.02 * tele + 0.008 * br, rise = 8 * tele + 5 * bp;
    ctx.save();
    // the Feed behind her: cables across the sky and the notification balloons hanging off them
    sqCables(ctx, t, m, (0.7 + 0.3 * tele) * (0.4 + 0.6 * on), 3);
    [[-180, -268, 0], [190, -290, 1], [-110, -170, 2]].forEach((L, i) => put(ctx, st, 'balloon', { x: L[0], y: L[1] - 30, r: m * 0.14 * Math.sin(TAU * t / 2.3 + i * 1.9) + 0.12 * hurt - 0.06 * sw, a: 0.4 + 0.6 * on, noFlash: true }));
    // four slender spider feet peek out from under the hem
    [[-96, -26, -1, 1], [-118, -22, -1, 0.8], [96, -26, 1, 1], [120, -22, 1, 0.8]].forEach((f, i) => put(ctx, st, 'tip', { x: f[0], y: f[1] + 22, sx: f[2] * f[3], sy: f[3], r: (Math.max(0, Math.sin(t * 1.9 + i * 1.7)) > 0.94 ? 0.12 : 0) * m - 0.15 * tele + 0.2 * hurt * f[2] }));
    xform(ctx, 0, -6, dx, -rise, lean, 1, 1 + 0.008 * br);
    const tw = (ph) => m * 4 * Math.sin(TAU * t / 2.4 + ph) + 8 * sl + 10 * hurt;
    put(ctx, st, 'tierV', { x: tw(0), sx: 1 + 0.04 * tele });
    put(ctx, st, 'tierW', { x: tw(1.2), sx: 1 + 0.03 * tele });
    put(ctx, st, 'tierG', { x: tw(2.4), sx: 1 + 0.02 * tele });
    // the ponytail swings behind, the ring light glows round her head
    ctx.save(); xform(ctx, 0, -226, 0, 0, 0, 1.2, 1.2);
    putChain(ctx, st, 'pony', [0, 1].map((j) => m * 0.12 * Math.sin(TAU * (t / 2.4) - j * 0.9) + 0.18 * hurt - 0.1 * sl));
    ctx.restore();
    tk.glow(ctx, -4, -274, 130, '#ffffff', (0.28 + 0.2 * hot) * (0.5 + 0.5 * on));
    put(ctx, st, 'halo', { x: -6, y: -8, r: 0.05 * Math.sin(TAU * t / 5) * m, sx: 1.18 + 0.03 * tele, sy: 1.18 + 0.03 * tele });
    put(ctx, st, 'armF', { r: 0.04 * Math.sin(TAU * t / 2.6 + 1) * m - 0.6 * tele - 0.6 * bp + 0.3 * hurt + 0.4 * guard });
    put(ctx, st, 'gown', { sx: 1 + 0.01 * br, sy: 1 + 0.008 * br, x: 2 * hurt * 6, kids(c) { FEED.glitter(c, [-110, -190, 220, 180], t, 12, 3, '#ffffff'); } });
    // the selfie arm: the phone held up at arm's length; it flashes on Selfie Flurry and rises on the wind-up
    const nR = 0.05 * Math.sin(TAU * t / 2.6) * m - 0.5 * sl + 0.3 * back - 0.35 * tele + 0.6 * guard + 0.25 * hurt - 0.3 * bp;
    put(ctx, st, 'torsoA', {
      r: 0.01 * br - 0.02 * sw, sy: 1 + 0.006 * br,
      kids(c) {
        put(c, st, 'headA', {
          sx: 1.2, sy: 1.2,
          r: lerp(-0.08, 0.12, won) + 0.03 * Math.sin(TAU * t / 3.1) * m - 0.08 * sw + 0.09 * hurt - 0.05 * guard + 0.03 * tele * Math.sin(t * 40),
          kids(cc) {
            // big glamorous eyes looking down at her phone, lashes, THE Gloss smile, and the filter over her face
            const open = blink(t, 'scrollspinner', 4.4) * (1 - 0.6 * hurt) * (1 - 0.3 * guard);
            eyes(cc, st, -14, -262, 17, { gap: 27, open, lx: -0.7, iris: ['#3a2a8f', '#7b5cff'] });
            if (open > 0.3) [[-27.5, -1], [-0.5, 1]].forEach((e) => { const x0 = e[0] + e[1] * 8.5; tk.inkPath(cc, [[x0, -268], [x0 + e[1] * 5, -272], [x0 + e[1] * 7, -276]], { w: 2.2, color: C.line, taper: 0.5, wobble: 0 }); });
            if (won > 0.5 || sl > 0.3 || hurt > 0.3) mouth(cc, st, -12, -238, 14, hurt > 0.3 ? 'ow' : 'happyOpen');
            else FOE.glossSmile(cc, -12, -238, 14, { color: '#c03a6a' });
            FOE.glossSheen(cc, [-38, -294, 64, 72], 0.35 * on, { shape: SQ_FACE, t, seed: 5 });
          },
        });
      },
    });
    put(ctx, st, 'armN', {
      r: nR,
      kids(c) {
        put(c, st, 'phone', { x: -76, y: -284, r: -0.25 + 0.1 * Math.sin(TAU * t / 3) * m });
        const fl = E0.pose === 'attack' ? Math.max(0, 1 - Math.abs(E0.p - 0.48) / 0.16) : 0;
        if (fl > 0.02) { tk.glow(c, -82, -304, 50, '#ffffff', cA(fl)); tk.sparkle(c, -82, -304, 16 * fl, { color: '#ffffff', glow: 0.6 }); }
        if (on > 0.02) tk.glow(c, -60, -276, 50, C.blue, 0.3 * on);
      },
    });
    ctx.restore();
    // hearts fly at the heroes on the strike; the cables swirl on the wind-up; Botlings hatch on the buff
    if (E0.pose === 'attack') sqVolley(ctx, -90 + dx, -290, clamp((E0.p - 0.4) / 0.5, 0, 1), on, 5, 3);
    if (tele > 0.05) { ctx.save(); ctx.globalAlpha = cA(tele * 0.8); FEED.cable(ctx, [[-60 + dx, -300], [-150, -330 + Math.sin(t * 3) * 10 * m], [-240, -250]], { w: 2.4, t, plug: 'end' }); FEED.cable(ctx, [[-60 + dx, -300], [-170, -220 + Math.sin(t * 2.6) * 10 * m], [-250, -150]], { w: 2.4, t: t + 0.5, plug: 'end' }); ctx.restore(); }
    if (bp > 0.05) {
      ctx.save(); ctx.globalAlpha = cA(bp * 0.7); ctx.strokeStyle = C.cyan; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, -6, 60 + 130 * E0.buffP, (60 + 130 * E0.buffP) * 0.16, 0, 0, TAU); ctx.stroke(); ctx.restore();
      FEED.balloons(ctx, dx, -60, t, 6, 31, { alpha: bp, rise: 120, spread: 120, size: 10 });
    }
  }
  function sqSpinner(ctx, st) {
    const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, sl = Math.max(0, sw), back = Math.max(0, -sw), tele = E0.tele, hurt = E0.hurt, guard = E0.guard, won = st.won, bp = Math.sin(PI * E0.buffP);
    const blaze = st.hp < 0.2 && won < 0.5 ? 1 : 0, hot = clamp(tele + sl + bp + 0.5 * blaze, 0, 1.4), on = 1 - won;
    const bob = Math.sin(TAU * t / 1.7) * 5 * m, lift = 8 + bob + 34 * tele + 12 * bp - 6 * hurt - 10 * back;
    const dx = -sw * 38 + hurt * 22 + tele * 10 - 6 * blaze * Math.sin(t * 30) * m;
    const rot = -0.06 * sw + 0.08 * hurt + 0.1 * tele + 0.012 * Math.sin(TAU * t / 3);
    ctx.save();
    // the great web behind, brighter when she is about to strike (and slack once she is won over)
    sqWeb(ctx, t, m, (0.3 + 0.35 * tele + 0.25 * blaze) * (0.35 + 0.65 * on), 20, -170, 330);
    const legB = (i, L) => {
      const front = L[2] < 0, off = L[5], sk = m * (0.07 + 0.03 * blaze);
      const root = -(sk * Math.sin(TAU * t / 1.3 + off)) - (front ? 0.55 * back + 0.62 * tele : 0.2 * tele) + (front ? 0.2 * sl : 0.06 * sl) - 0.32 * guard + 0.22 * hurt * Math.sin(t * 46 + i) + 0.1 * bp * Math.sin(t * 14 + i) - 0.06 * blaze * Math.sin(t * 22 + i);
      const knee = sk * 0.7 * Math.sin(TAU * t / 1.3 + off + 1) + (front ? 0.5 * back - 0.5 * sl + 0.3 * tele : 0.12 * tele) + 1.0 * guard + 0.2 * hurt;
      return [root, knee, 0.1 * guard];
    };
    const drawLegs = (far) => SQ_LEG_ROOT.filter((L) => L[4] === far).forEach((L, k) => {
      const ry = L[1] - lift * 0.55, sy = clamp(-ry / 118, 0.4, 1.6);
      putChain(ctx, st, far ? 'legF' : 'legN', legB(k + (far ? 0 : 4), L), { x: L[0] + dx * 0.8, y: ry, sx: L[2] * L[3], sy });
    });
    drawLegs(true);
    ctx.save();
    xform(ctx, 0, -100, dx, -lift * 0.55, rot, 1 + 0.01 * Math.sin(TAU * t / 2.1) * m, 1 - 0.01 * Math.sin(TAU * t / 2.1) * m);
    const throb = 1 + 0.03 * Math.sin(TAU * t / 1.9) * m + 0.05 * tele + 0.05 * bp;
    put(ctx, st, 'abdomen', {
      sx: throb, sy: throb, r: 0.02 * Math.sin(TAU * t / 2.6) * m - 0.05 * tele,
      kids(c) {
        const gl = (0.5 + 0.2 * Math.sin(t * 2.4) * m + 0.55 * hot) * on;
        tk.glow(c, 98, -128, 90, C.pink, cA(gl * 0.5));
        // a glowing cable runs from her spinnerets into the web
        FEED.cable(c, [[188, -76], [200 + Math.sin(t * 2) * 4 * m, -40], [192 + Math.sin(t * 1.6 + 1) * 6 * m, -6], [198, 20]], { w: 2.4, glow: on > 0.5, lw: 1.6 });
      },
    });
    ctx.restore();
    drawLegs(false);
    ctx.save();
    xform(ctx, 0, -100, dx, -lift * 0.55, rot, 1 + 0.01 * Math.sin(TAU * t / 2.1) * m, 1 - 0.01 * Math.sin(TAU * t / 2.1) * m);
    put(ctx, st, 'thorax', { sx: 1 + 0.02 * Math.sin(TAU * t / 1.7) * m, sy: 1 + 0.03 * Math.sin(TAU * t / 1.7) * m });
    putChain(ctx, st, 'drapeB', [0, 1, 2].map((j) => m * 0.13 * Math.sin(TAU * (t / 2.2) - j * 0.9 + 1.2) + 0.3 * hurt - 0.1 * sl));
    put(ctx, st, 'torsoB', {
      r: 0.012 * Math.sin(TAU * t / 3) * m - 0.06 * sw + 0.08 * hurt + 0.06 * tele, sx: 1.2, sy: 1.2 + 0.008 * Math.sin(TAU * t / 3) * m, y: -8,
      kids(c) {
        put(c, st, 'headB', {
          r: lerp(-0.06, 0.14, won) + 0.03 * Math.sin(TAU * t / 2.9) * m - 0.1 * sw + 0.1 * hurt + 0.04 * tele + 0.03 * Math.sin(t * 40) * blaze, y: 3 * tele - 5 * sl,
          pre(cc) {
            putChain(cc, st, 'hairW', [0, 1, 2].map((j) => m * (0.16 + 0.05 * blaze) * Math.sin(TAU * (t / 1.9) - j * 0.9) + 0.25 * sl + 0.1 * hurt - 0.15 * tele));
            putChain(cc, st, 'hairW2', [0, 1, 2].map((j) => m * (0.15 + 0.05 * blaze) * Math.sin(TAU * (t / 2.1) - j * 0.9 + 1.4) + 0.2 * sl + 0.1 * hurt - 0.12 * tele));
          },
          kids(cc) {
            // eight phone-screen eyes: her two big ones and six small ones in a crown, each with a tiny heart or thumb (red dots when she blazes).
            // Won over, they switch off one by one and her real eyes look up
            const small = [[-40, -284], [-30, -292], [-18, -297], [-5, -298], [8, -295], [19, -288]];
            small.forEach((p, i) => { const off = won > (i + 1) / 8 ? 0 : 1; FEED.screen(cc, p[0], p[1], 10, 9, { kind: blaze ? 'dot' : i % 2 ? 'thumb' : 'heart', t: t + i * 0.3, on: off, round: 0.3, lw: 1.4, seed: i }); });
            if (won > 0.85) eyes(cc, st, -14, -262, 17, { gap: 27, iris: ['#3a2a8f', '#7b5cff'] });
            else [[-27.5, 6], [-0.5, 7]].forEach((e, i) => { const off = won > e[1] / 8 ? 0 : 1; FEED.screen(cc, e[0], -262, 20, 17, { kind: blaze ? 'dot' : i ? 'thumb' : 'heart', t: t + i, on: off * (1 - 0.6 * hurt), round: 0.3, lw: 2, seed: 9 + i, light: blaze ? C.red : C.cyan }); });
            mouth(cc, st, -12, -238, 15 + 5 * sl, hurt > 0.3 ? 'ow' : sl > 0.3 || tele > 0.3 ? 'grin' : 'smile');
            if (on > 0.02) tk.glow(cc, -12, -262, 70, blaze ? C.red : C.cyan, cA((0.16 + 0.24 * hot) * on));
          },
        });
        putChain(c, st, 'drapeA', [0, 1, 2].map((j) => m * 0.13 * Math.sin(TAU * (t / 2.2) - j * 0.9) + 0.3 * hurt - 0.1 * sl));
      },
    });
    ctx.restore();
    // her arms, raised in front of everything so they read
    ctx.save();
    xform(ctx, 0, -100, dx, -lift * 0.55, rot, 1 + 0.01 * Math.sin(TAU * t / 2.1) * m, 1 - 0.01 * Math.sin(TAU * t / 2.1) * m);
    put(ctx, st, 'clawF', { sx: 1.2, sy: 1.2, r: -0.15 + 0.14 * Math.sin(TAU * t / 2.3 + 1) * m + 0.5 * sl - 0.6 * tele + 0.3 * hurt - 0.4 * bp + 0.8 * guard });
    put(ctx, st, 'clawN', { sx: 1.2, sy: 1.2, r: 0.14 * Math.sin(TAU * t / 2.3) * m - 0.9 * sl + 0.6 * back + 0.5 * tele + 0.4 * hurt + 0.8 * guard - 0.4 * bp });
    ctx.restore();
    ctx.restore();
    // hearts spray from her hands on the strike; a ring of light and new Botlings on the buff
    if (E0.pose === 'attack') sqVolley(ctx, -110 + dx, -290 - lift * 0.55, clamp((E0.p - 0.4) / 0.5, 0, 1), on, 6, 7);
    if (bp > 0.05) { ctx.save(); ctx.globalAlpha = cA(bp * 0.7); ctx.strokeStyle = C.cyan; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.ellipse(0, -8, 70 + 180 * E0.buffP, (70 + 180 * E0.buffP) * 0.16, 0, 0, TAU); ctx.stroke(); ctx.restore(); motes(ctx, 90 + dx, -120, t, 10, 43, { col: C.cyan, rise: 110, spread: 80, life: 1.1, size: 3, alpha: bp }); }
    motes(ctx, dx, -220, t, 6, 53, { col: C.moon, rise: 46, spread: 110, life: 2.2, size: 2.2, alpha: 0.6 * on });
  }

  // ===============================================================================================================
  // public API and gallery sheets
  // ===============================================================================================================
  Object.keys(SPECS).forEach((id) => register(SPECS[id]));
  ART.enemy.warm2 = warm;
  ART.enemy.ids2 = () => Object.keys(SPECS);

  const KEYPT = { idle: 0, attack: 0.21, hurt: 0.07, block: 0.2, buff: 0.16, die: 0.3, telegraph: 0.6 };
  const nameOf = (id) => (DATA.enemies && DATA.enemies[id] && DATA.enemies[id].name ? DATA.enemies[id].name : id);
  // Scrollopolis at 2 am: a midnight sky, the moon, rooftops with lit windows and the glow of a hundred screens
  function backdrop(ctx, W, H, t, gy) {
    tk.sky(ctx, 0, 0, W, H, 'night');
    tk.stars(ctx, 0, 0, W, gy * 0.6, t, { n: 40, seed: 12 });
    tk.moon(ctx, W * 0.84, H * 0.13, Math.min(W, H) * 0.05, { phase: 0.18, color: C.moon });
    ctx.fillStyle = '#10153a';
    for (let i = 0; i < 9; i++) {
      const bw = W * (0.08 + 0.05 * hv(i, 'bw')), bx = W * (i / 8) - bw / 2, bh = H * (0.18 + 0.22 * hv(i, 'bh'));
      ctx.fillRect(bx, gy - bh, bw, bh);
      for (let j = 0; j < 6; j++) { if (hv(i * 7 + j, 'win') > 0.55) { tk.glow(ctx, bx + bw * (0.2 + 0.6 * hv(j, 'wx' + i)), gy - bh * (0.2 + 0.7 * hv(j, 'wy' + i)), H * 0.035, j % 3 ? C.blue : C.cyan, 0.4); } }
    }
    ctx.fillStyle = C.night; ctx.fillRect(0, gy, W, H - gy);
    const gg = ctx.createLinearGradient(0, gy - 20, 0, gy + 12);
    gg.addColorStop(0, 'rgba(61,123,255,0)'); gg.addColorStop(1, 'rgba(61,123,255,0.35)');
    ctx.fillStyle = gg; ctx.fillRect(0, gy - 20, W, 32);
  }
  ART.sheet('enemies2_dev', (canvas, params) => {
    const ctx = canvas.getContext('2d'), W = params.w, H = params.h, t = num(params.t, 0);
    const all = params.id === 'all' || params.id === undefined;
    const ids = all ? Object.keys(SPECS) : String(params.id).split(',');
    const zoom = num(params.zoom, 1.6), gy = H * 0.9;
    backdrop(ctx, W, H, t, gy);
    if (params.pose === 'all') {
      POSES.forEach((pose, i) => {
        ART.enemy.draw(ctx, ids[0], { x: W * (i + 0.5) / POSES.length, y: gy, s: zoom, pose, t, pt: params.pt !== undefined ? params.pt : KEYPT[pose], phase: params.phase | 0, hpPct: params.hp });
        ctx.font = '600 13px system-ui'; ctx.fillStyle = '#c9d6ff'; ctx.textAlign = 'center'; ctx.fillText(pose, W * (i + 0.5) / POSES.length, H - 8);
      });
    } else {
      const pose = params.pose || 'idle';
      ids.forEach((id, i) => ART.enemy.draw(ctx, id, { x: W * (i + 0.5) / ids.length, y: gy, s: zoom, pose, t, pt: params.pt !== undefined ? params.pt : KEYPT[pose], phase: params.phase | 0, hpPct: params.hp }));
    }
  });

  const NORMALS = ['chochin', 'karakuri_puppet', 'nopperabo', 'drowned_samurai', 'koi_spirit', 'tsukumogami', 'silk_weaver', 'nure_onna', 'rokurokubi', 'ittan_momen'];
  const ELITES = ['drowned_general', 'puppet_master', 'umibozu'];
  const MINIONS = ['spiderling', 'paper_puppet', 'lantern_wisp'];
  const cellBg = (g, w, h, t, seed) => {
    tk.sky(g, 0, 0, w, h, 'night');
    tk.stars(g, 0, 0, w, h * 0.6, t, { n: 12, seed: seed || 3 });
    tk.glow(g, w * 0.2, h * 0.55, h * 0.4, C.blue, 0.14);
    tk.glow(g, w * 0.85, h * 0.4, h * 0.36, C.pink, 0.08);
    g.fillStyle = 'rgba(16,21,58,0.85)'; g.fillRect(0, h * 0.88, w, h * 0.12);
  };
  const fitScale = (id, w, h, capS) => { const b = ART.enemy.bounds(id); return Math.min(h * 0.86 / (b.h + 14), w * 0.96 / (b.w + 10), capS || 2); };
  const TIER = { normal: 'creature', elite: 'rival', minion: 'sidekick', boss: 'headliner' };

  // every creature, rival and sidekick, each in three poses (params.poses = "idle,attack,telegraph" by default), fitted to its cell
  ART.sheet('enemies2', (canvas, params) => {
    const t = num(params.t, 0), poses = String(params.poses || 'idle,attack,telegraph').split(',').filter((p) => POSES.indexOf(p) >= 0);
    const ids = NORMALS.concat(ELITES, MINIONS), np = poses.length || 1;
    const cells = ids.map((id) => ({ id, label: nameOf(id) + '  (' + id + ', ' + (TIER[DATA.enemies && DATA.enemies[id] ? DATA.enemies[id].tier : 'normal'] || '') + ')' }));
    ART.sheetGrid(canvas, params, cells, (g, cell, w, h, i) => {
      cellBg(g, w, h, t, i);
      const gy = h * 0.9, sc = fitScale(cell.id, w / np, h, 1.7);
      (poses.length ? poses : ['idle']).forEach((pose, k) => ART.enemy.draw(g, cell.id, { x: w * (k + 0.5) / np, y: gy, s: sc, pose, t: t + i * 0.37, pt: params.pt !== undefined ? params.pt : KEYPT[pose], phase: 0 }));
    }, { cols: 4, title: 'Act II, Scrollopolis: creatures, rivals, sidekicks (' + poses.join(', ') + ')', gap: 6, labelH: 16 });
  });

  // the Headliner: both forms large in idle, then every pose of each form underneath
  ART.sheet('boss2', (canvas, params) => {
    const g = canvas.getContext('2d'), W = params.w, H = params.h, t = num(params.t, 0), id = 'boss_jorogumo';
    tk.sky(g, 0, 0, W, H, 'night');
    tk.stars(g, 0, 0, W, H * 0.6, t, { n: 60, seed: 5 });
    tk.moon(g, W * 0.5, H * 0.08, H * 0.04, { phase: 0.2, color: C.moon });
    const topH = H * 0.6, gy = topH * 0.94, sc = Math.min(topH * 0.9 / 420, W * 0.46 / 600);
    [0, 1].forEach((ph) => {
      const cx = W * (0.25 + 0.5 * ph);
      g.fillStyle = 'rgba(16,21,58,0.7)'; g.fillRect(W * 0.5 * ph, gy, W * 0.5, topH - gy);
      ART.enemy.draw(g, id, { x: cx, y: gy, s: sc, pose: 'idle', t, pt: 0, phase: ph, hpPct: ph ? 0.4 : 1 });
      g.font = '700 15px system-ui'; g.fillStyle = C.moon; g.textAlign = 'center'; g.fillText(ph ? 'phase 1: the Spinner' : 'phase 0: the Avatar', cx, topH - 6);
    });
    const poses = ['attack', 'hurt', 'block', 'buff', 'die', 'telegraph'], rowH = (H - topH) / 2, cw = W / poses.length, s2 = Math.min(rowH * 0.8 / 420, cw * 0.92 / 600);
    [0, 1].forEach((ph) => poses.forEach((pose, k) => {
      const x = cw * (k + 0.5), y = topH + rowH * ph + rowH * 0.88;
      g.fillStyle = 'rgba(16,21,58,0.5)'; g.fillRect(cw * k, topH + rowH * ph + rowH * 0.88, cw, rowH * 0.12);
      ART.enemy.draw(g, id, { x, y, s: s2, pose, t, pt: KEYPT[pose], phase: ph });
      g.font = '600 12px system-ui'; g.fillStyle = '#c9d6ff'; g.textAlign = 'center'; g.fillText('phase ' + ph + ' ' + pose, x, topH + rowH * (ph + 1) - 3);
    }));
    g.font = '700 16px system-ui'; g.fillStyle = C.moon; g.textAlign = 'left'; g.fillText('Scrollspinner, both forms', 12, 22);
  });

  // film strips: two creatures (params.ids), each with an idle loop, an attack and a win-over across the pose (8 frames each)
  ART.sheet('enemies2_anim', (canvas, params) => {
    const ids = String(params.ids || 'drowned_samurai,koi_spirit').split(',').filter((id) => Object.prototype.hasOwnProperty.call(SPECS, id)).slice(0, 2), n = 8, t0 = num(params.t, 0), cells = [];
    ids.forEach((id) => {
      for (let i = 0; i < n; i++) cells.push({ id, kind: 'idle', i, label: nameOf(id) + ' idle ' + (i * 0.3).toFixed(1) + 's' });
      for (let i = 0; i < n; i++) cells.push({ id, kind: 'attack', i, label: 'attack ' + Math.round(i / (n - 1) * POSE_MS.attack) + 'ms' });
      for (let i = 0; i < n; i++) cells.push({ id, kind: 'die', i, label: 'won over ' + Math.round(i / (n - 1) * POSE_MS.die) + 'ms' });
    });
    ART.sheetGrid(canvas, params, cells, (g, cell, w, h) => {
      cellBg(g, w, h, t0, 2);
      const sc = fitScale(cell.id, w, h, 1.6), u = cell.i / (n - 1);
      const o = { x: w * 0.5, y: h * 0.9, s: sc, t: t0 + cell.i * (cell.kind === 'idle' ? 0.3 : 0.033) };
      if (cell.kind === 'idle') ART.enemy.draw(g, cell.id, Object.assign(o, { pose: 'idle', pt: 0 }));
      else ART.enemy.draw(g, cell.id, Object.assign(o, { pose: cell.kind, pt: u * POSE_MS[cell.kind] / 1000 }));
    }, { cols: n, title: 'Act II film strips: ' + ids.map(nameOf).join(' and ') + ' (idle loop, attack, win-over)', gap: 4, labelH: 14 });
  });
})();
