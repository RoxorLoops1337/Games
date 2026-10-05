// Hocus Vocus: ART.enemy, Act I: Blossom Bay (seaside things and Snack Pier produce that caught a little Gloss, candy harbour colours at golden
// hour). Extends ART (art.js) and draws in the owners' chibi style with the shared foe kit ART.rj.foe (art_cast_kit.js).
//
// PUBLIC API. Nothing new is exported beyond DESIGN 5.6: this file calls ART.enemy.register(id, {draw, bounds}) once for each of the 17 ids of
// Act I (10 Creatures, 3 Rivals, 3 Sidekicks, the Headliner) and registers gallery sheets. Extras a reader may want:
//   ART.enemy.ch1 = { ids, audit(id), pointAt(id, name, o), warm(id, s), spec(id) }   dev helpers (audit reads pixels: never call it per frame)
//   Gallery sheets: enemies1 (every Creature, Rival and Sidekick, several poses), boss1 (Kraki in both forms and every pose),
//   enemies1_anim (film strips of two enemies, params a= b=), enemy1_dev (params id=kappa[,..]|all pose= zoom= t= pt= phase= grove=0|1).
//
// HOW IT IS BUILT (read this before touching a creature)
//   Every creature is a 2D cutout puppet. Each PART (a bell, an arm, a pod, a roof) is drawn ONCE at rest by a function that uses the helpers
//   below, cached as a sprite per raster scale (ART.sprite) and composited every frame under a matrix built from the pose. Bending things (the
//   kraken's arms, a mic cable, a chilli stalk, a tailcoat) are ART.tk.chain parts. Faces are baked per state (eyes x mouth) and blink by swapping states. Only glows,
//   sparkles, notes, sound rings and other effects are drawn live, and they are cheap (cached glow sprites).
//   A part is {id, box:[x0,y0,x1,y1] (rest space, PAD is added), parent, pivot:[x,y], xf(K, t, st) -> {dx,dy,rot,sx,sy}, draw(S, variant)}, or
//   {chain:{spine, cuts, reach}, bends(K, t, st)}, or {states, draw(S, state)} for faces, or {live(ctx, st)}. A part flagged gloss: true is the
//   creature's ONE Gloss patch (see THE LOOK). Rest space: feet at the origin, y negative is up, the creature faces LEFT. K is the pose channel
//   dictionary (poseK): body offset, lean and squash plus the semantic channels wind (anticipation), strike (the blow), guard, buff, flash, hurt,
//   alert, die, and the face (eyes, mouth). Parts read the channels, so every creature answers every pose. Arms swing with rot = A * wind -
//   B * strike (wind raises the prop, strike brings it down), which reads as a wind-up and a blow on every creature.
//   Poses: one-shots (attack hurt block buff die) derive from pt and hold their end pose; telegraph ramps up over 0.34 s and then holds with a
//   tremble; idle is a loop of t. The die pose is the WIN-OVER (HV_ENEMIES 6.4): the Gloss patch flakes off as pastel sparkles (p 0 to 0.35),
//   one happy hop in real colours (0.35 to 0.6), a pop into Act I confetti, petals and bunting flags (0.6 to 1); nothing of the body is drawn
//   after p 0.62, with the same 700 ms timing as before so SCENE and the tests are unaffected.
//   Determinism: no clock and no banned random call; every draw is a pure function of (id, pose, t, pt, phase) plus the sprite cache.
//
// THE LOOK (HV_ART_AUDIO 1 and 4, HV_ENEMIES 2.4 and 6; the owners' chibi cast is the style authority)
//   An outline of almost even width in the Act I deep navy #22264a (size class s 2.0, m 2.4, l 2.8, xl 3.2), flat cel colour with ONE warm hard
//   shadow and one thin highlight, the key light on the upper right of the screen, big flat-cel eyes with a big and a small catchlight, small
//   blush hatch marks, round bouncy shapes, stubby limbs, cute even when grumpy. No halftone, no paper grain, no tapered calligraphy, no gold leaf
//   on bodies. Materials are seaside and street-market: painted brass, walnut and chrome, striped canvas, bunting cloth, glossy produce skins,
//   plastic kazoos, cardboard fruit crates (never leather, fur, felt, silk, pearl, shell, bone or horn). Every creature carries exactly ONE Gloss
//   patch (SEA.glossPatch): a panel of itself gone smooth, airbrushed and pastel with the polite Gloss smile on it; the win-over flakes it off.
(() => {
  'use strict';
  const tk = ART.tk, pal = tk.pal, mat = tk.mat, RJ = ART.rj, FOE = RJ.foe;
  const clamp = tk.clamp, lerp = tk.lerp, num = tk.num, track = tk.track;
  const TAU = Math.PI * 2, PI = Math.PI;
  const SPECS = {};
  const POSE_MS = { attack: 420, hurt: 260, block: 300, buff: 400, die: 700, telegraph: 0, idle: 0 };
  const LIGHT = tk.light;                         // key light: up and to the right of the screen, as for the cast
  const NAVY = '#22264a';                         // the Act I line (HV_ART_AUDIO E-D5)
  const LINE_W = { s: 2.0, m: 2.4, l: 2.8, xl: 3.2 };
  const PAD = 10;                                 // every part box grows by this so outlines and highlights never clip
  const cA = (a) => (a >= 0 ? (a <= 1 ? a : 1) : 0);
  const smooth = tk.smoothstep;
  const sin = Math.sin, cos = Math.cos;
  // the Act I palette (HV_ENEMIES 2.4): candy harbour colours at golden hour
  const C1 = {
    tomato: '#e8553f', mint: '#8fe3c0', lemon: '#ffd84d', sky: '#7cc6ff', cherry: '#ff9fc6', teal: '#2bb3b1', warm: '#ffcf8a',
    cream: '#fff6e4', white: '#fffdf8', brass: '#f2b63c', navy: NAVY, mouth: '#9c2f45', tongue: '#ff8fa3', blush: '#ff8d98',
  };

  // ---------------------------------------------------------------------------------------------------------------
  // small shape helpers (rest space)
  // ---------------------------------------------------------------------------------------------------------------
  const ell = (cx, cy, rx, ry, n, rot) => tk.ellipsePts(cx, cy, rx, ry, n || 14, rot || 0);
  const rrectPts = tk.rrectPts;
  // a soft blob: an ellipse whose radius wobbles a little per point (deterministic per seed)
  function blob(cx, cy, rx, ry, seed, amt, n, rot) {
    n = n || 14; amt = amt === undefined ? 0.04 : amt;
    const r = tk.rng('en1blob', seed || 0), out = [], c = cos(rot || 0), s = sin(rot || 0);
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU, k = 1 + (r() * 2 - 1) * amt, x = cos(a) * rx * k, y = sin(a) * ry * k;
      out.push([cx + x * c - y * s, cy + x * s + y * c]);
    }
    return out;
  }
  const rgba = tk.rgba;
  const shade = (hex, d) => RJ.shade(hex, d);
  const tint = (hex, k) => RJ.tint(hex, k);
  const boxOfPts = (pts) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; pts.forEach((p) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }); return [x0, y0, x1, y1]; };
  // a point and tangent at fraction u along a spine (control points), for stripes, suckers and coils that follow an arm or a cable
  function spineAt(spine, u) {
    const d = tk.flatten(spine, { step: 3 }), m = d.length >> 1, L = [0];
    for (let i = 1; i < m; i++) L.push(L[i - 1] + Math.hypot(d[2 * i] - d[2 * i - 2], d[2 * i + 1] - d[2 * i - 1]));
    const tot = L[m - 1] || 1, sd = clamp(u, 0, 1) * tot;
    let i = 1;
    while (i < m - 1 && L[i] < sd) i++;
    const i0 = i - 1, f = clamp((sd - L[i0]) / ((L[i] - L[i0]) || 1), 0, 1);
    let tx = d[2 * i] - d[2 * i0], ty = d[2 * i + 1] - d[2 * i0 + 1];
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    return { x: lerp(d[2 * i0], d[2 * i], f), y: lerp(d[2 * i0 + 1], d[2 * i + 1], f), tx, ty };
  }
  // a stable table of seeded numbers per (spec, key): particle systems read it instead of hashing strings every frame
  const TABLES = new Map();
  function table(key, n, k) {
    const id = key + '|' + n + '|' + k;
    let t = TABLES.get(id);
    if (!t) { const r = tk.rng('en1tab', key); t = []; for (let i = 0; i < n; i++) { const row = []; for (let j = 0; j < k; j++) row.push(r()); t.push(row); } TABLES.set(id, t); }
    return t;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // the drawing helper handed to every part
  // ---------------------------------------------------------------------------------------------------------------
  function makeS(g, spec, variant) {
    const c = spec.col, lw = spec.lw;
    const S = { g, c, spec, v: variant, lw };
    // the house cel: flat base, ONE warm hard shadow on the lower left, a thin highlight on the lit side, the even navy line of the size class
    S.cel = (pts, base, o) => {
      o = o || {};
      const opt = Object.assign({ light: LIGHT, line: lw, lineColor: NAVY, wobble: 0.02, weightVar: 0.28, hiW: 1.8, hiAlpha: 0.75 }, o);
      opt.halftone = false; opt.rim = null;
      if (opt.shadow === undefined) opt.shadow = shade(base, o.shadowD);
      if (opt.hi === undefined || opt.hi === true || opt.hi === 'auto') opt.hi = tint(base, 0.45);
      tk.celFill(g, pts, base, opt);
    };
    S.blob = (cx, cy, rx, ry, base, o) => S.cel(ell(cx, cy, rx, ry, clamp(Math.round(Math.max(rx, ry) / 3) + 8, 10, 24)), base, o);
    // a smooth stubby limb along a spine (w0 at the root, w1 at the tip, round caps), shaded as ONE shape so joints never step
    S.tube = (spine, w0, w1, base, o) => {
      o = o || {};
      const d = tk.flatten(spine, { step: 4 }), m = d.length >> 1, L = [0];
      for (let i = 1; i < m; i++) L.push(L[i - 1] + Math.hypot(d[2 * i] - d[2 * i - 2], d[2 * i + 1] - d[2 * i - 1]));
      const total = L[m - 1] || 1, left = [], right = [], bulge = o.bulge || 0;
      let tx0 = 0, ty0 = 0, tx1 = 0, ty1 = 0;
      for (let i = 0; i < m; i++) {
        const a = i > 0 ? i - 1 : 0, b = i < m - 1 ? i + 1 : m - 1;
        let tx = d[2 * b] - d[2 * a], ty = d[2 * b + 1] - d[2 * a + 1];
        const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        if (i === 0) { tx0 = tx; ty0 = ty; } if (i === m - 1) { tx1 = tx; ty1 = ty; }
        const u = L[i] / total, w = lerp(w0, w1, u) * (1 + bulge * sin(PI * u)) * (o.profile ? o.profile(u) : 1) / 2;
        left.push([d[2 * i] - ty * w, d[2 * i + 1] + tx * w]); right.push([d[2 * i] + ty * w, d[2 * i + 1] - tx * w]);
      }
      const poly = left.slice();
      for (let k = 1; k <= 3; k++) { const th = k / 4 * PI, w = w1 / 2; poly.push([d[2 * m - 2] + w * (-ty1 * cos(th) + tx1 * sin(th)), d[2 * m - 1] + w * (tx1 * cos(th) + ty1 * sin(th))]); }
      for (let i = m - 1; i >= 0; i--) poly.push(right[i]);
      for (let k = 1; k <= 3; k++) { const th = k / 4 * PI, w = w0 / 2; poly.push([d[0] + w * (ty0 * cos(th) - tx0 * sin(th)), d[1] + w * (-tx0 * cos(th) - ty0 * sin(th))]); }
      S.cel(poly, base, Object.assign({ depth: clamp(Math.min(w0, w1) * 0.3, 1.5, 7), line: lw * 0.92, tension: 0.85 }, o));
    };
    S.limb = (spine, base, w0, w1, o) => S.tube(spine, w0, w1, base, o);
    S.ln = (pts, o) => tk.inkPath(g, pts, Object.assign({ w: Math.max(1, lw * 0.7), color: NAVY, taper: 0.2, wobble: 0.02 }, o));
    S.fill = (pts, color, alpha) => { g.save(); if (alpha !== undefined) g.globalAlpha *= cA(alpha); g.beginPath(); tk.trace(g, pts); g.fillStyle = color; g.fill(); g.restore(); };
    S.dot = (x, y, r, color, alpha) => { g.save(); if (alpha !== undefined) g.globalAlpha *= cA(alpha); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = color; g.fill(); g.restore(); };
    S.clip = (pts) => { g.beginPath(); tk.trace(g, pts); g.clip(); };
    S.blush = (x, y, w, a) => tk.blush(g, x, y, w, { color: C1.blush, alpha: a === undefined ? 0.5 : a });
    // a shine stroke: the one thin highlight a glossy thing catches (produce skins, brass, glass)
    S.shine = (pts, w, a) => tk.inkPath(g, pts, { w: w || 3, color: '#ffffff', alpha: a === undefined ? 0.8 : a, taper: 0.5, wobble: 0 });
    // one chibi eye, w wide, for a face state: open wide half closed angry hurt happy. o: kind (round sleepy dot heart), h, iris, look, side
    // (-1 is the eye on the left of the screen), lid (lid colour for sleepy and glare)
    S.eye = (x, y, w, state, o) => {
      o = o || {};
      const side = o.side < 0 ? -1 : 1, a = w * 0.42, lwE = Math.max(1.3, w * 0.12);
      if (state === 'hurt') { S.ln(side < 0 ? [[x - a, y - a * 0.8], [x + a * 0.7, y], [x - a, y + a * 0.8]] : [[x + a, y - a * 0.8], [x - a * 0.7, y], [x + a, y + a * 0.8]], { w: lwE, taper: 0.1 }); return; }
      if (state === 'happy') { S.ln([[x - a, y + a * 0.3], [x, y - a * 0.55], [x + a, y + a * 0.3]], { w: lwE, taper: 0.15 }); return; }
      const kind = state === 'angry' ? 'glare' : (o.kind || 'round');
      const open = state === 'closed' ? 0 : state === 'half' ? 0.45 : 1;
      const h = (o.h || w * (kind === 'dot' ? 1 : 1.16)) * (state === 'wide' ? 1.12 : 1);
      FOE.eyes(g, x, y, w, { n: 1, kind: kind === 'glare' && o.kind === 'dot' ? 'dot' : kind, open, h, act: 1, iris: o.iris, look: o.look, lidColor: o.lid, heart: o.heart });
      if (state === 'angry' && o.kind === 'dot') S.ln([[x - a, y - a * (side < 0 ? 1.3 : 0.7)], [x + a, y - a * (side < 0 ? 0.7 : 1.3)]], { w: lwE, taper: 0.1 });
    };
    // a brow: a short navy stroke; tilt > 0 brings the inner end down (cross), < 0 lifts it (worried); side as S.eye
    S.brow = (x, y, w, tilt, side, o) => {
      const d = (side < 0 ? 1 : -1) * tilt * w * 0.3;
      S.ln([[x - w / 2, y - d], [x, y - w * 0.1 * (o && o.arch !== undefined ? o.arch : 1)], [x + w / 2, y + d]], Object.assign({ w: Math.max(1.6, w * 0.16), taper: 0.35 }, o));
    };
    S.mouth = (x, y, w, kind, o) => FOE.mouth(g, x, y, w, kind, Object.assign({ act: 1, size: spec.size }, o));
    return S;
  }
  // the eyes and mouth of a face state 'eyes|mouth'
  const faceOf = (state) => { const p = String(state || 'open|closed').split('|'); return { ey: p[0] || 'open', mo: p[1] || 'closed' }; };

  // a two-segment arm as two parts (upper arm, forearm with hand) so a wind-up, a blow and a guard bend at the elbow.
  // o: id, parent, sh (shoulder), el (elbow), wrist (the end point), w [shoulder, elbow, wrist] widths, bend (px the elbow bows), color (hex),
  // hr (hand radius, sizes the box), a1(K, t, st) and a2 -> {rot,...} for the two joints, hand(S, x, y), decorU(S), decorF(S), tubeOpts
  function arm2(o) {
    const w = o.w || [15, 12, 11], hr = o.hr || 14, bend = o.bend === undefined ? 0 : o.bend;
    const sh = o.sh, el = o.el, hd = o.wrist, colorOf = (v) => (typeof o.color === 'function' ? o.color(v) : o.color);
    const mid = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [(a[0] + b[0]) / 2 - dy / l * bend, (a[1] + b[1]) / 2 + dx / l * bend]; };
    const bx = (pts, m) => [Math.min(...pts.map((p) => p[0])) - m, Math.min(...pts.map((p) => p[1])) - m, Math.max(...pts.map((p) => p[0])) + m, Math.max(...pts.map((p) => p[1])) + m];
    const upper = {
      id: o.id + '1', box: o.boxU || bx([sh, el], w[0] * 0.8 + 4), parent: o.parent, pivot: sh, xf: o.a1, when: o.when, v: o.v,
      draw(S, variant) { S.tube([sh, mid(sh, el), el], w[0], w[1], colorOf(variant), o.tubeOpts); if (o.decorU) o.decorU(S, variant); },
    };
    const fore = {
      id: o.id + '2', box: o.boxF || bx([el, hd], hr + 8), parent: o.id + '1', pivot: el, xf: o.a2, when: o.when, v: o.v,
      draw(S, variant) { S.tube([el, mid(el, hd), hd], w[1], w[2], colorOf(variant), o.tubeOpts); if (o.hand) o.hand(S, hd[0], hd[1], variant); if (o.decorF) o.decorF(S, variant); },
    };
    return [upper, fore];
  }

  // ---------------------------------------------------------------------------------------------------------------
  // SEA: the Act I helper set (HV_ART_AUDIO 4.3): seaside things that caught a little Gloss. Every function takes the part helper S (or a
  // context g) first and paints in the caller's space.
  // ---------------------------------------------------------------------------------------------------------------
  const SEA = {
    // THE Gloss patch: the shape filled with the opalescent pastel film, the airbrushed sheen sweep and a soft pale rim, the polite Gloss smile
    // on it. o.clip (the body shape it sits on), o.smile [x, y, w], o.alpha (glass that shows what is behind), o.chrome (the Gloss as a chrome
    // sheen, for a patch on something already white), o.seed
    glossPatch(S, shape, o) {
      o = o || {};
      const g = S.g, b = boxOfPts(shape), w = b[2] - b[0], h = b[3] - b[1], GL = o.chrome ? ['#f4f1fb', '#b9bdd0', '#e6d9ff', '#c9cbd6'] : FOE.GLOSS;
      g.save();
      if (o.alpha !== undefined) g.globalAlpha *= cA(o.alpha);
      if (o.clip) S.clip(o.clip);
      g.save(); S.clip(shape);
      const gr = g.createLinearGradient(b[0], b[1], b[2], b[3]);
      gr.addColorStop(0, GL[1]); gr.addColorStop(0.5, GL[2]); gr.addColorStop(1, GL[3]);
      g.fillStyle = gr; g.fillRect(b[0] - 2, b[1] - 2, w + 4, h + 4);
      g.restore();
      FOE.glossSheen(g, [b[0], b[1], w, h], 0.6, { shape, t: 0, seed: num(o.seed), phase: 0.35 });
      tk.inkPath(g, shape, { closed: true, w: Math.max(1, S.lw * 0.6), color: '#ffffff', alpha: 0.75, taper: 0, wobble: 0 });
      if (o.smile) FOE.glossSmile(g, o.smile[0], o.smile[1], o.smile[2], { color: '#6d6a9a' });
      g.restore();
    },
    // a brass bell seen from the front (the foghorn's face, a horn): outer flare, a darker throat ring, one shine. Returns nothing.
    brassBell(S, cx, cy, rx, ry, o) {
      o = o || {};
      const base = o.base || C1.brass;
      S.cel(ell(cx, cy, rx, ry, 22), base, { depth: Math.min(rx, ry) * 0.16 });
      S.cel(ell(cx + rx * 0.04, cy + ry * 0.04, rx * 0.72, ry * 0.72, 18), shade(base, 0.08), { line: S.lw * 0.6, depth: rx * 0.1, hi: false });
      S.shine([[cx + rx * 0.35, cy - ry * 0.72], [cx + rx * 0.66, cy - ry * 0.48], [cx + rx * 0.8, cy - ry * 0.18]], Math.max(2, rx * 0.08), 0.85);
    },
    // a sagging string of triangle flags between the points (baked or live); cols cycles, t sways them a little
    bunting(g, pts, cols, t, o) {
      o = o || {};
      if (!pts || pts.length < 2) return;
      const n = o.n || 7, size = o.size || 9, sway = num(t) * (o.speed || 2), lw = o.lw || 1.6;
      g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
      for (let s = 0; s < pts.length - 1; s++) {
        const a = pts[s], b = pts[s + 1], sag = o.sag === undefined ? 10 : o.sag;
        g.strokeStyle = NAVY; g.lineWidth = lw; g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + sag * 2, b[0], b[1]); g.stroke();
        for (let i = 0; i < n; i++) {
          const u = (i + 0.5) / n, x = lerp(a[0], b[0], u), y = lerp(a[1], b[1], u) + sag * 4 * u * (1 - u), r = 0.12 * sin(sway + i * 1.3 + s);
          g.save(); g.translate(x, y); g.rotate(r);
          g.beginPath(); g.moveTo(-size * 0.55, 0); g.lineTo(size * 0.55, 0); g.lineTo(0, size * 1.05); g.closePath();
          g.fillStyle = cols[(i + s) % cols.length]; g.fill(); g.strokeStyle = NAVY; g.lineWidth = lw * 0.8; g.stroke();
          g.restore();
        }
      }
      g.restore();
    },
    // a cardboard fruit crate (x, y top left, w x h): slats and a printed fruit dot (no text)
    crate(S, x, y, w, h, o) {
      o = o || {};
      S.cel(rrectPts(x, y, w, h, 3), o.base || '#d9a66a', { tension: 0.3, depth: 3 });
      const g = S.g;
      g.save(); g.strokeStyle = rgba(NAVY, 0.55); g.lineWidth = 1.4;
      for (let i = 1; i < 3; i++) { g.beginPath(); g.moveTo(x + 2, y + h * i / 3); g.lineTo(x + w - 2, y + h * i / 3); g.stroke(); }
      g.restore();
      S.blob(x + w / 2, y + h / 2, Math.min(w, h) * 0.18, Math.min(w, h) * 0.18, o.fruit || C1.tomato, { line: 1.2, depth: 1 });
    },
    // glossy produce skin: the cel, one long shine stroke on the lit side and a few freckles (chilli, peas, melon)
    produce(S, shape, base, o) {
      o = o || {};
      S.cel(shape, base, Object.assign({}, o.cel, { decor: (g) => {
        if (o.decor) o.decor(g);
        const b = boxOfPts(shape), r = tk.rng('en1freckle', num(o.seed));
        g.fillStyle = rgba(shade(base, 0.2), 0.55);
        for (let i = 0; i < (o.freckles === undefined ? 5 : o.freckles); i++) { g.beginPath(); g.arc(lerp(b[0], b[2], 0.2 + r() * 0.6), lerp(b[1], b[3], 0.25 + r() * 0.6), 1 + r() * 1.2, 0, TAU); g.fill(); }
      } }));
      if (o.shine) S.shine(o.shine, o.shineW || 3.2, 0.85);
    },
    // stripes inside a shape: bands of cols following direction ang (melon rind, awning, bandstand roof), clipped to the shape
    stripes(g, shape, cols, o) {
      o = o || {};
      const b = boxOfPts(shape), w = o.w || 10, ang = num(o.ang, 0), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, R = Math.hypot(b[2] - b[0], b[3] - b[1]);
      g.save(); g.beginPath(); tk.trace(g, shape); g.clip();
      g.translate(cx, cy); g.rotate(ang);
      for (let i = -Math.ceil(R / w); i < Math.ceil(R / w); i++) { g.fillStyle = cols[((i % cols.length) + cols.length) % cols.length]; g.fillRect(i * w, -R, w, R * 2); }
      g.restore();
    },
    // a rope-coil limb: a tube with coil marks across it
    rope(S, pts, w, o) {
      o = o || {};
      S.tube(pts, w, w * 0.9, o.base || '#efcf8f', { decor: (g) => {
        g.save(); g.strokeStyle = rgba(shade(o.base || '#efcf8f', 0.25), 0.9); g.lineWidth = Math.max(1, w * 0.12); g.lineCap = 'round';
        for (let u = 0.08; u < 0.98; u += 0.16) { const p = spineAt(pts, u); g.beginPath(); g.moveTo(p.x - p.ty * w * 0.5 + p.tx * 2, p.y + p.tx * w * 0.5 + p.ty * 2); g.lineTo(p.x + p.ty * w * 0.5 - p.tx * 2, p.y - p.tx * w * 0.5 - p.ty * 2); g.stroke(); }
        g.restore();
      } });
    },
    // a string of fairy bulbs along pts (live): k 0..1 brightness, t twinkles them
    fairyBulbs(g, pts, t, k, o) {
      o = o || {};
      const cols = o.cols || [C1.lemon, C1.cherry, C1.sky, C1.mint], m = tk.motion();
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], tw = 0.65 + 0.35 * sin(t * 3.1 + i * 1.7) * m, a = clamp(k, 0, 1) * tw;
        if (a > 0.04) tk.glow(g, p[0], p[1], (o.r || 7) * 2.2, cols[i % cols.length], 0.55 * a);
        g.beginPath(); g.arc(p[0], p[1], o.r || 3.2, 0, TAU); g.fillStyle = cols[i % cols.length]; g.fill();
        g.lineWidth = 1.2; g.strokeStyle = NAVY; g.stroke();
      }
    },
  };

  // ---------------------------------------------------------------------------------------------------------------
  // pose channels: one dictionary every part reads. One-shots hold their end pose (which is neutral) for any larger pt.
  // ---------------------------------------------------------------------------------------------------------------
  function baseK() {
    return { bx: 0, by: 0, brot: 0, bsx: 1, bsy: 1, shx: 0, wind: 0, strike: 0, guard: 0, buff: 0, flash: 0, hurt: 0, alert: 0, die: 0, eyes: 'open', mouth: 'closed', pose: 'idle' };
  }
  function poseK(spec, pose, t, pt) {
    const K = baseK(), u = pt * 1000, m = tk.motion(), lunge = spec.lunge === undefined ? 42 : spec.lunge;
    K.pose = pose;
    if (pose === 'attack') {
      K.wind = track([[0, 0], [100, 1], [135, 0.55], [175, 0]], u, 'outQuad');
      K.strike = track([[0, 0], [100, 0], [172, 1], [250, 0.9], [420, 0]], u, 'outCubic');
      K.bx = -lunge * K.strike + lunge * 0.24 * K.wind * (1 - K.strike);
      K.bsx = 1 + 0.07 * K.strike - 0.05 * K.wind; K.bsy = 1 - 0.05 * K.strike + 0.05 * K.wind;
      K.brot = -0.06 * K.strike + 0.05 * K.wind;
      K.eyes = 'angry'; K.mouth = K.strike > 0.25 ? 'open' : 'closed';
    } else if (pose === 'telegraph') {
      const a = clamp(pt / 0.34, 0, 1);
      K.wind = Math.min(1.12, tk.ease.outBack(a));
      K.alert = smooth(clamp(pt / 0.22, 0, 1));
      K.shx = sin(t * 47) * 1.5 * K.alert * m;
      K.bsy = 1 - 0.05 * K.wind; K.bsx = 1 + 0.03 * K.wind; K.brot = 0.05 * K.wind;
      K.eyes = 'angry'; K.mouth = 'grit';
    } else if (pose === 'hurt') {
      const a = clamp(u / 260, 0, 1);
      K.flash = clamp(1 - a * 3.4, 0, 1);
      K.hurt = a < 0.22 ? a / 0.22 : 1 - (a - 0.22) / 0.78;
      K.bx = 20 * K.hurt; K.brot = 0.15 * K.hurt; K.bsx = 1 - 0.09 * K.hurt; K.bsy = 1 + 0.06 * K.hurt;
      K.eyes = a < 0.85 ? 'hurt' : 'open'; K.mouth = a < 0.85 ? 'open' : 'closed';
    } else if (pose === 'block') {
      K.guard = track([[0, 0], [85, 1], [190, 1], [300, 0.15]], u, 'outQuad');
      K.bsy = 1 - 0.05 * K.guard; K.bsx = 1 + 0.04 * K.guard;
      K.eyes = 'half'; K.mouth = 'closed';
    } else if (pose === 'buff') {
      K.buff = track([[0, 0], [140, 1], [260, 0.85], [400, 0]], u, 'outQuad');
      K.bsy = 1 + 0.06 * K.buff - 0.05 * track([[0, 0], [60, 1], [140, 0]], u, 'outQuad'); K.bsx = 1 - 0.03 * K.buff;
      K.eyes = 'angry'; K.mouth = K.buff > 0.4 ? 'open' : 'closed';
    } else if (pose === 'die') {
      // the win-over: a startled blink as the Gloss lets go, then joy (happy eyes, an open smile, arms up during the hop)
      const p = clamp(u / 700, 0, 1);
      K.die = p; K.flash = clamp(1 - p * 4.5, 0, 1);
      const hop = p > 0.35 && p < 0.6 ? sin(PI * (p - 0.35) / 0.25) : 0;
      K.buff = 0.7 * hop;
      K.bsy = 1 + 0.03 * clamp(p / 0.2, 0, 1); K.bsx = 1 - 0.03 * clamp(p / 0.2, 0, 1);
      K.eyes = p < 0.3 ? 'wide' : 'happy'; K.mouth = 'open';
    }
    return K;
  }
  function blinkState(spec, t) {
    const per = 3.4 + 1.9 * tk.vary(spec.id, 'blinkp'), ph = ((t + 0.3 + tk.vary(spec.id, 'blinko') * (per - 0.6)) % per + per) % per;
    if (ph > 0.17) return 0;
    return ph < 0.05 || ph > 0.12 ? 1 : 2;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // baking: part sprites, flash silhouettes and chains
  // ---------------------------------------------------------------------------------------------------------------
  const qOf = (s) => Math.max(0.5, Math.ceil(clamp(s, 0.25, 2.5) * 2) / 2);
  const boxOf = (p) => { const b = p.box; return [b[0] - PAD, b[1] - PAD, b[2] + PAD, b[3] + PAD]; };
  function partSprite(spec, part, q, variant, state, flash) {
    const b = boxOf(part), w = b[2] - b[0], h = b[3] - b[1];
    const key = 'en1|' + spec.id + '|' + (part.share || part.id) + '|' + (variant || '') + '|' + (state || '') + (flash ? '|f' : '') + '|' + q;
    return ART.sprite(key, w * q, h * q, (g) => {
      g.scale(q, q); g.translate(-b[0], -b[1]);
      part.draw(makeS(g, spec, variant), state || variant);
      if (flash) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#fffaf2'; g.fillRect(b[0] - 4, b[1] - 4, w + 8, h + 8); }
    });
  }
  function partChain(spec, part, variant, flash) {
    const ck = (variant || '') + (flash ? '|f' : '');
    part._chains = part._chains || {};
    let c = part._chains[ck];
    if (c) return c;
    c = tk.chain('en1|' + spec.id + '|' + (part.share || part.id) + '|' + ck, {
      spine: part.chain.spine, cuts: part.chain.cuts, reach: part.chain.reach, overlap: part.chain.overlap,
      draw: (g) => {
        part.draw(makeS(g, spec, variant), variant);
        if (flash) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#fffaf2'; g.fillRect(-900, -900, 1800, 1800); }
      },
    });
    part._chains[ck] = c;
    return c;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // effects shared by every creature (all drawn live, all cheap)
  // ---------------------------------------------------------------------------------------------------------------
  const FX = {};
  // a small themed bit centred on (x, y): a petal, a drop, a spark, a leaf, a coin, a puff or a note
  FX.bit = (ctx, kind, x, y, sz, rot, a, c1, c2) => {
    if (!(a > 0.02) || !(sz > 0.3)) return;
    if (kind === 'petal') { tk.petal(ctx, x, y, sz, rot, a, c1 || '#ffc2dc'); return; }
    if (kind === 'spark') { tk.sparkle(ctx, x, y, sz * 1.3, { color: c1 || '#ffffff', alpha: a, rot, glow: 0.35 }); return; }
    if (kind === 'note') { tk.note(ctx, x, y, sz * 1.6, { kind: c2 === 'beamed' ? 'beamed' : 'eighth', color: c1 || NAVY, alpha: a, rot: rot * 0.15, line: Math.max(1.1, sz * 0.24) }); return; }
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha *= cA(a);
    if (kind === 'leaf') {
      ctx.beginPath(); ctx.moveTo(-sz, 0); ctx.quadraticCurveTo(0, -sz * 0.7, sz, 0); ctx.quadraticCurveTo(0, sz * 0.7, -sz, 0);
      ctx.fillStyle = c1 || '#79c24f'; ctx.fill(); ctx.lineWidth = Math.max(0.8, sz * 0.14); ctx.strokeStyle = NAVY; ctx.stroke();
    } else if (kind === 'drop') {
      ctx.beginPath(); ctx.moveTo(0, -sz * 1.3); ctx.bezierCurveTo(sz * 0.9, -sz * 0.2, sz * 0.8, sz * 0.9, 0, sz * 0.9); ctx.bezierCurveTo(-sz * 0.8, sz * 0.9, -sz * 0.9, -sz * 0.2, 0, -sz * 1.3);
      ctx.fillStyle = c1 || '#bff5ee'; ctx.fill(); ctx.lineWidth = Math.max(0.8, sz * 0.16); ctx.strokeStyle = NAVY; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(-sz * 0.25, sz * 0.1, sz * 0.16, sz * 0.32, 0.2, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
    } else if (kind === 'coin') {
      ctx.scale(Math.max(0.15, Math.abs(cos(rot * 2))), 1);
      ctx.beginPath(); ctx.arc(0, 0, sz, 0, TAU); ctx.fillStyle = c1 || C1.lemon; ctx.fill(); ctx.lineWidth = Math.max(0.8, sz * 0.22); ctx.strokeStyle = NAVY; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, sz * 0.55, 0, TAU); ctx.lineWidth = Math.max(0.6, sz * 0.12); ctx.strokeStyle = '#e0a020'; ctx.stroke();
    } else {                                                                     // a soft puff of air, steam or dust
      ctx.beginPath(); ctx.arc(0, 0, sz, 0, TAU); ctx.fillStyle = c1 || '#fffaf2'; ctx.fill(); ctx.lineWidth = Math.max(0.8, sz * 0.12); ctx.strokeStyle = rgba(NAVY, 0.45); ctx.stroke();
      ctx.beginPath(); ctx.arc(-sz * 0.3, -sz * 0.3, sz * 0.4, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
    }
    ctx.restore();
  };
  // a swoosh crescent: the mark a blow leaves in the air. Angles in radians (canvas orientation), sweeping a0 to a1.
  FX.arc = (ctx, cx, cy, r, a0, a1, w, color, a) => {
    if (!(a > 0.02)) return;
    const n = 9, outer = [], inner = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, ang = lerp(a0, a1, u), k = sin(u * PI) * w + 0.6;
      outer.push([cx + cos(ang) * (r + k * 0.5), cy + sin(ang) * (r + k * 0.5)]);
      inner.push([cx + cos(ang) * (r - k * 0.5), cy + sin(ang) * (r - k * 0.5)]);
    }
    ctx.save(); ctx.globalAlpha *= cA(a);
    ctx.beginPath(); tk.trace(ctx, { poly: outer.concat(inner.reverse()) }); ctx.fillStyle = color; ctx.fill();
    ctx.restore();
  };
  // tension ticks: short navy-edged dashes radiating from (x, y), the shiver of a wind-up
  FX.ticks = (ctx, x, y, r0, r1, n, t, color, a) => {
    if (!(a > 0.02)) return;
    ctx.save(); ctx.globalAlpha *= cA(a); ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const ang = i / n * TAU + 0.4 + 0.06 * sin(t * 30 + i), on = sin(t * 19 + i * 2.3) > -0.35;
      if (!on) continue;
      const c = cos(ang), s2 = sin(ang);
      ctx.strokeStyle = NAVY; ctx.lineWidth = 4.6;
      ctx.beginPath(); ctx.moveTo(x + c * r0, y + s2 * r0); ctx.lineTo(x + c * r1, y + s2 * r1); ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(x + c * r0, y + s2 * r0); ctx.lineTo(x + c * r1, y + s2 * r1); ctx.stroke();
    }
    ctx.restore();
  };
  // an impact dust ring at (x, y) growing with u 0..1 (a heavy blow landing on the boards)
  FX.dust = (ctx, x, y, u, s, color) => {
    if (!(u > 0.02) || u >= 1) return;
    const a = (1 - u) * 0.75;
    for (let i = 0; i < 7; i++) {
      const side = i % 2 ? 1 : -1, d = (14 + (i >> 1) * 20) * u * s, r = (6 + (i >> 1) * 3) * (0.5 + u) * s;
      ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = color || '#fff3dc';
      ctx.beginPath(); ctx.arc(x + side * d, y - r * 0.6 - u * 8 * s, r, 0, TAU); ctx.fill();
      ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(NAVY, 0.45); ctx.stroke(); ctx.restore();
    }
  };
  // sound rings out of a mouth or a speaker: n arcs opening toward ang, travelling with u (0..1 loop), alpha a
  FX.honk = (ctx, x, y, ang, r, u, a, color) => {
    if (!(a > 0.02)) return;
    ctx.save(); ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const q = (u + i / 3) % 1, rr = r * (0.5 + q * 1.6), al = a * sin(PI * q);
      if (al < 0.03) continue;
      ctx.globalAlpha = cA(al);
      ctx.beginPath(); ctx.arc(x, y, rr, ang - 0.7, ang + 0.7); ctx.strokeStyle = NAVY; ctx.lineWidth = 5; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, rr, ang - 0.7, ang + 0.7); ctx.strokeStyle = color || C1.lemon; ctx.lineWidth = 2.6; ctx.stroke();
    }
    ctx.restore();
  };
  // a jagged squeal line (Mic Squeals and the old bandstand speakers): a short zigzag from (x, y) along ang, in pink (or col: Kraki's teal)
  FX.squeal = (ctx, x, y, ang, len, a, col) => {
    if (!(a > 0.02)) return;
    const n = 5, c = cos(ang), s2 = sin(ang), pts = [];
    for (let i = 0; i <= n; i++) { const u = i / n, off = (i % 2 ? 1 : -1) * len * 0.12 * (i === 0 || i === n ? 0 : 1); pts.push([x + c * len * u - s2 * off, y + s2 * len * u + c * off]); }
    ctx.save(); ctx.globalAlpha *= cA(a); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.strokeStyle = NAVY; ctx.lineWidth = 4.4; ctx.stroke();
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.strokeStyle = typeof col === 'string' ? col : C1.cherry; ctx.lineWidth = 2.2; ctx.stroke();
    ctx.restore();
  };

  // ---------------------------------------------------------------------------------------------------------------
  // defining and drawing a creature
  // ---------------------------------------------------------------------------------------------------------------
  function define(spec) {
    const H = DATA.LISTS.sizeHeight[spec.size] || 170;
    spec.h = spec.h || H;
    spec.lw = spec.lw || LINE_W[spec.size] || 2.4;
    spec.col = Object.assign({}, spec.col);
    spec.acc = spec.acc || C1.lemon;
    spec.byId = {};
    spec.parts.forEach((p) => { spec.byId[p.id] = p; });
    SPECS[spec.id] = spec;
    return spec;
  }
  function evalMats(spec, K, t, st) {
    const M = {}, byId = spec.byId;
    M.root = mat.local(0, 0, K.bx + K.shx + (spec.ox || 0), K.by, K.brot, K.bsx, K.bsy);
    const resolve = (id) => {
      if (M[id]) return M[id];
      const p = byId[id];
      if (!p) return M.root;
      const par = p.parent ? resolve(p.parent) : M.root;
      const x = p.xf ? p.xf(K, t, st) : null, pv = p.pivot || [0, 0];
      const loc = x ? mat.local(pv[0], pv[1], x.dx || 0, x.dy || 0, x.rot || 0, x.sx === undefined ? 1 : x.sx, x.sy === undefined ? 1 : x.sy) : mat.I();
      M[id] = mat.mul(par, loc);
      return M[id];
    };
    spec.parts.forEach((p) => resolve(p.id));
    return M;
  }
  function faceState(spec, K, t) {
    let eyes = K.eyes;
    if (eyes === 'open' || eyes === 'wide') { const b = blinkState(spec, t); if (b === 2) eyes = 'closed'; else if (b === 1) eyes = 'half'; }
    return eyes + '|' + K.mouth;
  }
  // draw the whole creature body (underlays, parts, overlays) for one pose state. st.gloss (0..1) fades the Gloss patch parts.
  function drawBody(ctx, st) {
    const spec = st.spec, K = st.K, M = st.M, q = st.q, t = st.t, gk = st.gloss === undefined ? 1 : st.gloss;
    if (spec.under) spec.under(ctx, st);
    const parts = spec.parts;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.when && !part.when(st)) continue;
      if (part.gloss && gk <= 0.01) continue;
      const bm = M[part.id];
      ctx.save();
      if (part.gloss) ctx.globalAlpha *= cA(gk);
      if (!part.raw) ctx.transform(bm[0], bm[1], bm[2], bm[3], bm[4], bm[5]);
      if (part.live) part.live(ctx, st);
      else {
        const variant = part.v ? part.v(st) : '';
        if (part.chain) {
          const ch = partChain(spec, part, variant, false), bends = part.bends ? part.bends(K, t, st) : [0, 0, 0];
          ch.draw(ctx, bends, q);
          if (K.flash > 0.03) { ctx.globalAlpha *= cA(K.flash * 0.9); partChain(spec, part, variant, true).draw(ctx, bends, q); }
        } else {
          const b = boxOf(part);
          const state = part.face ? (part.stateOf ? part.stateOf(st) : st.face) : '';
          ctx.drawImage(partSprite(spec, part, q, variant, state, false), b[0], b[1], b[2] - b[0], b[3] - b[1]);
          if (K.flash > 0.03 && !part.face) {
            ctx.globalAlpha *= cA(K.flash * 0.9);
            ctx.drawImage(partSprite(spec, part, q, variant, state, true), b[0], b[1], b[2] - b[0], b[3] - b[1]);
          }
        }
      }
      ctx.restore();
    }
    if (spec.over) spec.over(ctx, st);
  }
  // THE WIN-OVER (the die pose, p = K.die 0..1). The Gloss patch fades and flakes off as pastel sparkles (0 to 0.35), the creature does one happy
  // hop with its real colours (0.35 to 0.6, a little squash on take-off and landing), shrinks to nothing in a blink (0.6 to 0.62) and pops into
  // Act I confetti: petals and bunting flags (0.6 to 1). Nothing of the body is drawn after 0.62.
  function drawDie(ctx, st) {
    const spec = st.spec, K = st.K, p = K.die, m = st.m, box = spec.dieBox || [-60, -spec.h, 60, 0];
    const cx = (box[0] + box[2]) / 2, bw = box[2] - box[0], bh = box[3] - box[1], cy = box[1] + bh * 0.52;
    const hopH = (spec.hop || clamp(bh * 0.12, 8, 30)) * (0.4 + 0.6 * m);
    if (p < 0.35) {
      st.gloss = 1 - smooth(p / 0.35);
      drawBody(ctx, st);
      const ga = spec.glossAt || [cx, cy], gp = st.at(spec.glossBone, ga[0], ga[1]), R = spec.glossR || 20, rr = table(spec.id + 'flake', 10, 4), u0 = p / 0.35;
      for (let i = 0; i < 10; i++) {
        const u = clamp(u0 * (0.75 + rr[i][0] * 0.5) - rr[i][1] * 0.2, 0, 1);
        if (u <= 0 || u >= 1) continue;
        tk.sparkle(ctx, gp[0] + (rr[i][2] - 0.5) * R * 2 + sin(i + u * 4) * 5 * m, gp[1] + (rr[i][3] - 0.5) * R - u * 46 * (0.5 + 0.5 * m), (3 + rr[i][3] * 4.5) * sin(PI * u), { color: FOE.GLOSS[i % 4], alpha: sin(PI * u), glow: 0.45, rot: u * 2 });
      }
    } else if (p < 0.62) {
      st.gloss = 0;
      const u = clamp((p - 0.35) / 0.25, 0, 1), j = sin(PI * u), sq = p < 0.6 ? 1 - 0.1 * Math.pow(cos(PI * u), 8) : 1, shrink = p >= 0.6 ? 1 - (p - 0.6) / 0.02 : 1;
      ctx.save();
      ctx.translate(cx, -hopH * j); ctx.scale((1 + (1 - sq) * 0.6) * shrink, sq * shrink); ctx.translate(-cx, 0);
      drawBody(ctx, st);
      ctx.restore();
      if (p < 0.6 && u > 0.25) {
        tk.sparkle(ctx, box[0] + bw * 0.12, box[1] + bh * 0.15 - hopH * j, 7 * j, { color: C1.lemon, alpha: j, glow: 0.4, rot: u });
        tk.sparkle(ctx, box[2] - bw * 0.1, box[1] + bh * 0.05 - hopH * j, 9 * j, { color: '#ffffff', alpha: j, glow: 0.4, rot: -u });
        tk.note(ctx, box[2] - bw * 0.25, box[1] + bh * 0.2 - hopH * j - 12 * u, 9, { kind: 'eighth', color: C1.cherry, alpha: j, rot: 0.2 * sin(u * 6), line: 1.6 });
      }
    }
    if (p >= 0.6) {
      const q = (p - 0.6) / 0.4;
      if (q < 0.25) tk.glow(ctx, cx, cy, Math.max(bw, bh) * (0.35 + q * 1.6), C1.cherry, 0.55 * (1 - q * 4));
      FOE.confetti(ctx, cx, cy, q, 1, { seed: spec.confettiSeed || 1, r: Math.max(bw, bh) * 0.85, size: clamp(Math.max(bw, bh) * 0.05, 4, 11), n: spec.confettiN || 22 });
    }
    if (spec.dieExtra) spec.dieExtra(ctx, st, p);
  }
  // the overlays every pose shares: hit spark, buff ring and notes, telegraph flare, strike speed lines, guard glint
  function poseFx(ctx, st) {
    const spec = st.spec, K = st.K, t = st.t, pt = st.pt, acc = spec.acc, hp = spec.hitAt || [0, -spec.h * 0.55], m = tk.motion();
    const at = (id, x, y) => (id ? st.at(id, x, y) : [x, y]);
    if (K.alert > 0.02) {
      const c = at(spec.alertBone, spec.alertAt ? spec.alertAt[0] : 0, spec.alertAt ? spec.alertAt[1] : -spec.h * 0.6), pl = 0.6 + 0.4 * sin(t * 14), ac = spec.alertColor || C1.lemon;
      tk.glow(ctx, c[0], c[1], spec.h * (0.4 + 0.3 * K.wind) * (0.9 + 0.1 * pl), acc, 0.4 * K.alert * pl);
      FX.ticks(ctx, c[0], c[1], spec.h * 0.3, spec.h * 0.4, 8, t, ac, 0.95 * K.alert * m);
      // a ground ring that keeps swelling: something heavy is coming
      const rw = spec.bounds.w * 0.5;
      for (let k = 0; k < 2; k++) {
        const u = (t * 1.6 + k * 0.5) % 1;
        ctx.save(); ctx.scale(1, 0.18); ctx.globalAlpha *= 0.85 * K.alert * (1 - u) * (0.5 + 0.5 * m); ctx.lineWidth = 4.5 * (1 - u * 0.5); ctx.strokeStyle = ac;
        ctx.beginPath(); ctx.arc((spec.ox || 0), 0, rw * (0.45 + 0.55 * u), 0, TAU); ctx.stroke(); ctx.restore();
      }
    }
    if (K.pose === 'attack' && spec.arc) {
      const A = spec.arc, ms = pt * 1000, u = clamp((ms - 95) / 85, 0, 1), fade = 1 - clamp((ms - 170) / 240, 0, 1);
      if (u > 0 && fade > 0) {
        const c = at(A.bone, A.x, A.y), e = tk.ease.outCubic(u), a1 = lerp(A.a0, A.a1, e), a0 = lerp(A.a0, A.a1, Math.max(0, e - 0.6));
        FX.arc(ctx, c[0], c[1], A.r + 5, a0, a1, (A.w || 12) * 1.5, A.color || acc, 0.55 * fade);
        FX.arc(ctx, c[0], c[1], A.r, a0, a1, A.w || 12, '#fffaf2', 0.95 * fade);
      }
    }
    if (K.pose === 'attack' && K.strike > 0.15) {
      ctx.save(); ctx.globalAlpha *= 0.55 * K.strike;
      tk.speedLines(ctx, 0, 0, { mode: 'dir', rect: [spec.h * 0.05, -spec.h * 0.95, spec.h * 0.5, spec.h * 0.9], angle: PI, len: spec.h * 0.55, n: 12, seed: Math.floor(pt * 40), w: 2.6, alpha: 0.55, color: pal.white });
      ctx.restore();
    }
    if (K.pose === 'hurt' && pt < 0.22) {
      const u = 1 - pt / 0.22, c = at(spec.hitBone, hp[0], hp[1]);
      tk.glow(ctx, c[0], c[1], 42 * u + 14, '#ffffff', 0.75 * u);
      tk.sparkle(ctx, c[0], c[1], 30 * u + 6, { color: '#ffffff', rot: 0.4, glow: 0 });
      tk.sparkle(ctx, c[0], c[1], 20 * u + 4, { color: acc, rot: 0.4 + PI / 4, glow: 0 });
    }
    if (K.buff > 0.02) {
      const c = at(spec.buffBone, 0, -spec.h * 0.5), u = pt / 0.4;
      tk.glow(ctx, c[0], c[1], spec.h * 0.7, acc, 0.45 * K.buff);
      ctx.save(); ctx.globalAlpha *= 0.9 * (1 - u); ctx.strokeStyle = acc; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(c[0], c[1] + spec.h * 0.42, spec.h * (0.15 + 0.32 * u), spec.h * (0.04 + 0.08 * u), 0, 0, TAU); ctx.stroke(); ctx.restore();
      for (let i = 0; i < 6; i++) {
        const ph = (u * 1.2 + i * 0.17) % 1, x = c[0] + (i - 2.5) * spec.h * 0.07, y = c[1] + spec.h * 0.3 - ph * spec.h * 0.75;
        if (i % 3 === 1) tk.note(ctx, x, y, 7 + spec.h * 0.02, { kind: i % 2 ? 'eighth' : 'beamed', color: i % 2 ? C1.cherry : C1.sky, alpha: sin(ph * PI) * K.buff, rot: 0.2 * sin(ph * 5 + i), line: 1.5 });
        else tk.sparkle(ctx, x, y, 4 + (i % 2) * 2, { color: i % 2 ? '#ffffff' : acc, alpha: sin(ph * PI), glow: 0.3 });
      }
    }
    if (K.guard > 0.05) {
      const c = at(spec.guardBone, -spec.h * 0.32, -spec.h * 0.5);
      ctx.save(); ctx.globalAlpha *= 0.85 * K.guard; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(c[0] + 12, c[1], spec.h * (0.32 + i * 0.06), PI * (0.78 + i * 0.03), PI * (1.22 - i * 0.03));
        ctx.strokeStyle = NAVY; ctx.lineWidth = 5; ctx.stroke(); ctx.strokeStyle = i % 2 ? C1.sky : C1.cream; ctx.lineWidth = 2.6; ctx.stroke();
      }
      ctx.restore();
      tk.sparkle(ctx, c[0] - spec.h * 0.2, c[1] - spec.h * 0.14, 8 * K.guard, { color: '#ffffff', glow: 0.4 });
    }
  }

  function drawEnemy(spec, ctx, o) {
    o = o || {};
    const pose = POSE_MS[o.pose] !== undefined ? o.pose : 'idle';
    const t = num(o.t, 0), pt = Math.max(0, num(o.pt, 0)), s = num(o.s, 1) > 0 ? num(o.s, 1) : 1;
    if (pose === 'die' && pt >= 0.7) return;
    const K = poseK(spec, pose, t, pt);
    if (spec.tweak) spec.tweak(K, pose, t, pt, o);
    const st = { spec, K, t, pt, pose, s, q: qOf(s), m: tk.motion(), phase: o.phase | 0, hpPct: o.hpPct === undefined ? 1 : num(o.hpPct, 1), face: '', M: null };
    st.face = faceState(spec, K, t);
    st.M = evalMats(spec, K, t, st);
    st.at = (id, x, y) => { const p = mat.pt(st.M[id] || st.M.root, x, y); return p; };
    ctx.save();
    if (pose === 'die') drawDie(ctx, st); else drawBody(ctx, st);
    if (pose !== 'die') poseFx(ctx, st);
    ctx.restore();
  }

  // ===============================================================================================================
  // THE CREATURES (one block each; the Echowake rig each one keeps is named in its header, HV_ENEMIES 2.5)
  // ===============================================================================================================
  // ---------------------------------------------------------------------------------------------------------------
  // kappa: the FUSSY FOGHORN (Creature, m). A squat brass foghorn on two stubby legs: the flared bell is its face with a perfect round O of a
  // mouth, a navy sailor cap, mint paint flaking off the brass, rope-coil arms, the coiled horn pipe on its back. Gloss patch: the tank's left
  // side, airbrushed flat. Keeps the KAPPA rig: the squat biped, the slap and guard arm swings, the dish glow now the "puff back up" rings.
  // ---------------------------------------------------------------------------------------------------------------
  const FH = { brass: '#f2b63c', mint: '#8fe3c0', rope: '#efcf8f', cap: '#34407e', capDk: '#262f63', boot: '#34407e', throat: '#5a2638' };
  const FH_TANK = [[-22, -100], [24, -100], [33, -88], [34, -46], [26, -32], [-24, -32], [-32, -46], [-31, -88]];
  // coil marks across a rope segment a to b
  function coilMarks(S, a, b, w, base) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    [0.22, 0.5, 0.78].forEach((u) => { const x = lerp(a[0], b[0], u), y = lerp(a[1], b[1], u); S.ln([[x - nx * w * 0.42 - dx / l * 1.5, y - ny * w * 0.42 - dy / l * 1.5], [x, y + 0.8], [x + nx * w * 0.42 + dx / l * 1.5, y + ny * w * 0.42 + dy / l * 1.5]], { w: 1.3, color: shade(base, 0.24), taper: 0.3 }); });
  }
  const ropeKnot = (S, x, y, base) => { S.blob(x, y + 3, 7.5, 7, base, { depth: 2.5, line: S.lw * 0.85 }); S.ln([[x - 4, y + 1], [x + 1, y + 5], [x + 4, y + 2]], { w: 1.2, color: shade(base, 0.25) }); };
  define({
    id: 'kappa', size: 'm', acc: '#bff5ee', lunge: 46, alertColor: C1.lemon,
    col: {},
    hitAt: [-14, -128], alertAt: [-14, -150], hitBone: 'head', alertBone: 'head', buffBone: 'body', guardBone: 'body',
    arc: { bone: 'body', x: -22, y: -92, r: 54, a0: -1.2, a1: -4.4, w: 11, color: '#bff5ee' },
    bounds: { w: 150, h: 182, head: { x: -14, y: -150 }, body: { x: 2, y: -66 }, feet: { x: 0, y: 0 } },
    dieBox: [-60, -186, 64, 0], glossAt: [-21, -62], glossBone: 'body', glossR: 16,
    parts: [
      { id: 'shell', box: [14, -124, 66, -44], parent: 'body', pivot: [26, -78],
        xf: (K, t) => ({ rot: 0.03 * sin(t * 1.9) - 0.12 * K.guard, dy: -6 * K.guard }),
        draw(S) {
          // the coiled horn pipe on its back and the little exhaust bell on top
          const g = S.g;
          g.save(); g.lineCap = 'round';
          g.beginPath(); g.ellipse(40, -76, 17, 21, 0.15, 0, TAU); g.strokeStyle = NAVY; g.lineWidth = 11 + S.lw * 2; g.stroke();
          g.beginPath(); g.ellipse(40, -76, 17, 21, 0.15, 0, TAU); g.strokeStyle = FH.brass; g.lineWidth = 11; g.stroke();
          g.beginPath(); g.ellipse(40, -76, 17, 21, 0.15, 0.6, 2.4); g.strokeStyle = shade(FH.brass, 0.14); g.lineWidth = 5; g.stroke();
          g.beginPath(); g.ellipse(40, -76, 19, 23, 0.15, 4.2, 5.6); g.strokeStyle = '#fff4cc'; g.lineWidth = 2.2; g.stroke();
          g.restore();
          S.tube([[48, -94], [52, -104], [55, -110]], 9, 11, FH.brass, { depth: 2 });
          S.cel(ell(56, -113, 10, 4.5, 14), shade(FH.brass, 0.1), { depth: 1.5, line: S.lw * 0.85 });
          S.fill(ell(56, -113, 6, 2.4, 10), FH.throat);
        } },
      ...arm2({
        id: 'armB', parent: 'body', sh: [14, -84], el: [4, -70], wrist: [-6, -58], w: [11, 10, 10], hr: 12, bend: -2, color: shade(FH.rope, 0.12),
        a1: (K, t) => ({ rot: 0.05 * sin(t * 1.6 + 1) + 0.9 * K.wind + 0.3 * K.strike + 0.6 * K.guard - 0.5 * K.buff }),
        a2: (K, t) => ({ rot: 0.08 * sin(t * 1.9 + 1) + 0.6 * K.wind + 0.4 * K.strike + 1.6 * K.guard }),
        decorU: (S) => coilMarks(S, [14, -84], [4, -70], 11, shade(FH.rope, 0.12)),
        decorF: (S) => coilMarks(S, [4, -70], [-6, -58], 10, shade(FH.rope, 0.12)),
        hand: (S, x, y) => ropeKnot(S, x, y, shade(FH.rope, 0.12)),
      }),
      { id: 'legB', box: [-4, -40, 30, 4], parent: 'root', pivot: [14, -36],
        xf: (K, t) => ({ rot: 0.03 * sin(t * 3.2 + 2) }),
        draw(S) {
          S.limb([[14, -36], [15, -22], [14, -10]], shade(FH.mint, 0.12), 15, 13);
          S.cel([[24, -11], [6, -11], [0, -5], [1, 1], [26, 1], [28, -5]], shade(FH.boot, 0.06), { depth: 2.5, tension: 0.6 });
        } },
      { id: 'body', box: [-36, -104, 38, -28], parent: 'root', pivot: [0, -36],
        xf: (K, t, st) => ({ sy: 1 + 0.022 * sin(t * 2.2) * st.m - 0.02 * K.guard, sx: 1 - 0.012 * sin(t * 2.2) * st.m }),
        draw(S) {
          S.cel(FH_TANK, FH.mint, { depth: 9, tension: 0.6,
            decor: (g) => {
              // brass showing where the mint paint has flaked off, and the riveted hoop round the middle
              [[22, -90, 8, 5, 1], [-2, -40, 10, 4, 2], [28, -54, 5, 8, 3]].forEach((f) => { g.beginPath(); tk.trace(g, blob(f[0], f[1], f[2], f[3], f[4], 0.3, 9)); g.fillStyle = FH.brass; g.fill(); g.lineWidth = 1.2; g.strokeStyle = shade(FH.mint, 0.25); g.stroke(); });
              g.fillStyle = FH.brass; g.fillRect(-40, -70, 80, 9);
              g.fillStyle = shade(FH.brass, 0.15); g.fillRect(-40, -63, 80, 2.5);
              g.fillStyle = '#fff4cc'; g.fillRect(-40, -70, 80, 1.6);
              for (let x = -26; x <= 28; x += 9) { g.beginPath(); g.arc(x, -65.5, 1.7, 0, TAU); g.fillStyle = shade(FH.brass, 0.25); g.fill(); }
            } });
        } },
      { id: 'gloss', gloss: true, box: [-36, -104, -6, -28], parent: 'body', pivot: [-20, -60],
        draw(S) { SEA.glossPatch(S, [[-31, -88], [-22, -100], [-12, -100], [-10, -80], [-11, -50], [-13, -32], [-24, -32], [-32, -46]], { clip: FH_TANK, smile: [-21, -60, 9], seed: 1 }); } },
      { id: 'legF', box: [-34, -40, 4, 4], parent: 'root', pivot: [-10, -36],
        xf: (K, t) => ({ rot: -0.03 * sin(t * 3.2) }),
        draw(S) {
          S.limb([[-10, -36], [-12, -22], [-14, -10]], FH.mint, 16, 14);
          S.cel([[-2, -11], [-22, -11], [-29, -5], [-28, 1], [-1, 1], [1, -5]], FH.boot, { depth: 2.5, tension: 0.6 });
        } },
      { id: 'head', box: [-56, -188, 32, -92], parent: 'body', pivot: [-6, -100],
        xf: (K, t, st) => ({ rot: 0.03 * sin(t * 1.7) + 0.16 * K.wind - 0.16 * K.strike - 0.1 * K.guard + 0.08 * K.hurt - 0.08 * K.buff, dy: 1.2 * sin(t * 2.2 + 0.5) * st.m + 6 * K.guard, dx: -8 * K.strike + 4 * K.wind }),
        draw(S) {
          const g = S.g;
          // the brass collar where the bell meets the tank, then the bell: a big brass flare with a rim lip and one shine
          S.cel(ell(-4, -100, 20, 7, 16), shade(FH.brass, 0.1), { depth: 2 });
          S.cel(ell(-14, -132, 38, 36, 24), FH.brass, { depth: 6 });
          g.save(); g.beginPath(); g.ellipse(-14, -132, 32.5, 30.5, 0, 0, TAU); g.strokeStyle = shade(FH.brass, 0.12); g.lineWidth = 2; g.stroke(); g.restore();
          S.shine([[2, -163], [14, -154], [20, -140]], 3.2, 0.85);
          S.blush(-40, -122, 9); S.blush(10, -124, 8);
          // the navy sailor cap, cocked a little, with a cream band and a cherry pompom
          g.save(); g.translate(-12, -166); g.rotate(-0.14); g.translate(12, 166);
          S.cel(ell(-12, -170, 24, 9, 16), FH.cap, { depth: 3 });
          S.cel(rrectPts(-34, -169, 44, 8, 3.5), C1.cream, { depth: 2, tension: 0.4, hi: false });
          S.cel([[-34, -163], [-48, -160], [-42, -155], [-30, -160]], FH.capDk, { depth: 1.5, tension: 0.5, hi: false });
          S.blob(-10, -182, 5.5, 5.5, '#ff6f8f', { depth: 1.5 });
          g.restore();
        } },
      { id: 'face', box: [-46, -158, 18, -100], parent: 'head', pivot: [-14, -132], face: true,
        draw(S, state) {
          const f = faceOf(state), lid = shade(FH.brass, 0.06), iris = ['#2b2f55', '#4f8fd0'];
          // prim: half-lidded and haughty unless startled, cross or delighted
          const ey = f.ey === 'open' ? 'open' : f.ey, kind = f.ey === 'open' ? 'sleepy' : 'round';
          S.eye(-30, -142, 14, ey, { kind, lid, iris, side: -1, look: [-0.3, 0] });
          S.eye(-3, -144, 12.5, ey, { kind, lid, iris, side: 1, look: [-0.3, 0] });
          const cross = f.ey === 'angry' || f.ey === 'hurt';
          S.brow(-31, -155, 12, cross ? 0.8 : -0.5, -1); S.brow(-3, -157, 11, cross ? 0.8 : -0.5, 1);
          // the round O of the mouth: the throat of the bell, with a brass lip
          const r = f.mo === 'open' ? [11, 12.5] : f.mo === 'grit' ? [10, 4.5] : [6.5, 7.5];
          S.cel(ell(-16, -119, r[0] + 3, r[1] + 3, 16), shade(FH.brass, 0.1), { depth: 1.5, line: S.lw * 0.75, hi: false });
          S.cel(ell(-16, -119, r[0], r[1], 14), FH.throat, { shadow: false, hi: false, line: S.lw * 0.6 });
          if (f.mo === 'open') S.fill(ell(-16, -113, r[0] * 0.55, r[1] * 0.3, 10), C1.tongue);
        } },
      ...arm2({
        id: 'armF', parent: 'body', sh: [-26, -84], el: [-40, -72], wrist: [-46, -56], w: [12, 11, 11], hr: 13, bend: 2, color: FH.rope,
        a1: (K, t) => ({ rot: 0.05 * sin(t * 1.6) + 1.5 * K.wind + 0.6 * K.strike + 0.9 * K.guard - 0.2 * K.hurt + 0.9 * K.buff }),
        a2: (K, t) => ({ rot: 0.08 * sin(t * 1.9) + 0.6 * K.wind + 0.7 * K.strike + 1.9 * K.guard }),
        decorU: (S) => coilMarks(S, [-26, -84], [-40, -72], 12, FH.rope),
        decorF: (S) => coilMarks(S, [-40, -72], [-46, -56], 11, FH.rope),
        hand: (S, x, y) => ropeKnot(S, x, y, FH.rope),
      }),
      { id: 'puff', parent: 'head', live(ctx, st) {
        const K = st.K, t = st.t, m = st.m;
        // Prim Honk: rings out of the bell; Puff Back Up: the bell swells with sound rings; idle: now and then one smug little note
        if (K.pose === 'attack') FX.honk(ctx, -34, -119, PI, 26, t * 2.2 * m, 0.95 * K.strike, C1.lemon);
        if (K.alert > 0.02) FX.honk(ctx, -34, -119, PI, 18, t * 1.6 * m, 0.6 * K.alert, C1.mint);
        if (K.pose === 'buff' && K.buff > 0.02) { ctx.save(); ctx.globalAlpha *= K.buff; FOE.rings(ctx, -16, -120, 12 + 6 * K.buff, 1, t); ctx.restore(); tk.glow(ctx, -14, -130, 46, '#fff0b8', 0.35 * K.buff); }
        const ph = (t * 0.3) % 1;
        if (K.pose === 'idle' && ph < 0.4) { const u = ph / 0.4; tk.note(ctx, -40 - u * 14, -128 - u * 26, 8, { kind: 'eighth', color: C1.tomato, alpha: sin(PI * u) * m, rot: -0.2, line: 1.5 }); }
        if (K.pose === 'hurt') { const u = clamp(st.pt / 0.26, 0, 1); FX.bit(ctx, 'puff', -36 - u * 20, -118 - u * 10, 4 + u * 6, 0, 1 - u, '#fffaf2'); }
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // tanuki_bandit: the COIN CRAB (Creature, m). A wide orange crab with eyes on stalks and a smug grin, a stolen busker's cap jammed on sideways,
  // coins spilling from a cloth pouch it hugs in one pincer, six quick sideways legs. Gloss patch: a smooth pastel panel on the shell. Keeps the
  // TANUKI BANDIT rig: the coin sack prop and its spill, the swing arm (now the big pincer) and the dash.
  // ---------------------------------------------------------------------------------------------------------------
  const CC = { body: '#ff8a3d', belly: '#ffe2b0', cap: '#2bb3b1', capDk: '#1d8a88', pouch: '#f3dcae', coin: C1.lemon };
  const CC_SHELL = [[-52, -66], [-44, -88], [-20, -100], [10, -102], [36, -94], [52, -74], [50, -50], [36, -36], [0, -32], [-36, -36], [-52, -50]];
  function crabLegs(S, side, base) {
    for (let i = 0; i < 3; i++) {
      const hip = [side * (26 + i * 8), -42 + i * 3], knee = [side * (52 + i * 9), -58 + i * 9], tip = [side * (58 + i * 10), -2];
      S.tube([hip, [lerp(hip[0], knee[0], 0.5), lerp(hip[1], knee[1], 0.5) - 3], knee], 11, 9, base, { depth: 2.5 });
      S.tube([knee, [lerp(knee[0], tip[0], 0.5) + side * 3, lerp(knee[1], tip[1], 0.5)], tip], 9, 3.5, base, { depth: 2 });
    }
  }
  define({
    id: 'tanuki_bandit', size: 'm', acc: C1.lemon, lunge: 44, alertColor: C1.lemon,
    col: {},
    hitAt: [-10, -80], alertAt: [-20, -112], hitBone: 'body', alertBone: 'head', buffBone: 'body', guardBone: 'body',
    arc: { bone: 'body', x: -26, y: -90, r: 74, a0: -1.0, a1: -4.1, w: 13, color: '#ffe9a8' },
    bounds: { w: 196, h: 151, head: { x: -16, y: -124 }, body: { x: 0, y: -60 }, feet: { x: 0, y: 0 } },
    dieBox: [-76, -172, 82, 0], glossAt: [30, -87], glossBone: 'body', glossR: 14,
    parts: [
      { id: 'legB', box: [16, -82, 92, 4], parent: 'root', pivot: [30, -50],
        xf: (K, t, st) => ({ rot: 0.07 * sin(t * 7.5) * st.m + 0.15 * K.strike - 0.1 * K.guard }),
        draw(S) { crabLegs(S, 1, shade(CC.body, 0.14)); } },
      { id: 'sack', box: [24, -108, 76, -34], parent: 'body', pivot: [50, -70],
        xf: (K, t, st) => ({ rot: 0.04 * sin(t * 2.3 + 1) * st.m + 0.1 * K.wind - 0.12 * K.strike }),
        draw(S) {
          // the busker's coins peeking out of a cloth pouch with a teal drawstring and a stitched patch
          [[42, -94, 6.5], [53, -98, 7], [62, -92, 6]].forEach((c, i) => { S.blob(c[0], c[1], c[2], c[2], i % 2 ? '#ffe680' : CC.coin, { depth: 1.5, line: S.lw * 0.7 }); S.ln(ell(c[0], c[1], c[2] * 0.55, c[2] * 0.55, 10).concat([ell(c[0], c[1], c[2] * 0.55, c[2] * 0.55, 10)[0]]), { w: 1.1, color: '#d89a1a', taper: 0 }); });
          S.cel([[36, -88], [48, -91], [62, -88], [70, -70], [68, -48], [52, -40], [34, -46], [30, -66]], CC.pouch, { depth: 6,
            decor: (g) => { g.fillStyle = rgba(C1.sky, 0.9); g.beginPath(); tk.trace(g, rrectPts(48, -64, 13, 11, 2)); g.fill(); g.setLineDash([2, 2]); g.strokeStyle = NAVY; g.lineWidth = 1; g.beginPath(); tk.trace(g, rrectPts(48, -64, 13, 11, 2)); g.stroke(); g.setLineDash([]); } });
          S.ln([[35, -86], [48, -83], [64, -86]], { w: 3.2, color: CC.cap, taper: 0.05 });
          S.ln([[48, -83], [44, -74]], { w: 2, color: CC.cap, taper: 0.2 }); S.ln([[48, -83], [52, -73]], { w: 2, color: CC.cap, taper: 0.2 });
        } },
      { id: 'body', box: [-56, -106, 56, -28], parent: 'root', pivot: [0, -36],
        xf: (K, t, st) => ({ sy: 1 + 0.024 * sin(t * 2.1) * st.m - 0.03 * K.guard, sx: 1 - 0.014 * sin(t * 2.1) * st.m + 0.02 * K.guard }),
        draw(S) {
          S.cel(CC_SHELL, CC.body, { depth: 9, tension: 0.8,
            decor: (g) => {
              g.beginPath(); g.ellipse(-6, -36, 44, 11, 0, 0, TAU); g.fillStyle = CC.belly; g.fill();
              g.fillStyle = rgba(shade(CC.body, 0.18), 0.7);
              [[-30, -82, 2.4], [-14, -90, 2], [6, -92, 2.6], [-38, -72, 1.8], [14, -84, 1.6]].forEach((p) => { g.beginPath(); g.arc(p[0], p[1], p[2], 0, TAU); g.fill(); });
            } });
        } },
      { id: 'gloss', gloss: true, box: [12, -102, 48, -74], parent: 'body', pivot: [30, -87],
        draw(S) { SEA.glossPatch(S, [[16, -92], [30, -99], [44, -90], [42, -80], [26, -77], [16, -84]], { clip: CC_SHELL, smile: [30, -86, 8], seed: 2 }); } },
      ...arm2({
        id: 'armB', parent: 'body', sh: [30, -64], el: [44, -54], wrist: [40, -66], w: [9, 8, 8], hr: 14, bend: -2, color: shade(CC.body, 0.08),
        a1: (K, t) => ({ rot: 0.04 * sin(t * 2.3 + 1) + 0.1 * K.wind - 0.1 * K.strike }),
        a2: (K, t) => ({ rot: 0.05 * sin(t * 2.6 + 1) }),
        hand: (S, x, y) => {
          // the pincer hugging the pouch shut
          S.cel([[x + 4, y + 6], [x - 6, y - 2], [x - 4, y - 12], [x + 8, y - 16, 1], [x + 4, y - 8], [x + 12, y - 4]], shade(CC.body, 0.08), { depth: 2, tension: 0.5 });
        },
      }),
      { id: 'grin', box: [-34, -80, 8, -44], parent: 'body', pivot: [-12, -62], face: true, stateOf: (st) => st.face.split('|')[1],
        draw(S, mo) {
          S.blush(-28, -68, 9); S.blush(4, -70, 8);
          S.mouth(-12, -64, 18, mo === 'open' ? 'happyOpen' : mo === 'grit' ? 'grit' : 'smirk');
        } },
      { id: 'legF', box: [-92, -82, -16, 4], parent: 'root', pivot: [-30, -50],
        xf: (K, t, st) => ({ rot: -0.07 * sin(t * 7.5 + 1.3) * st.m - 0.15 * K.strike + 0.1 * K.guard }),
        draw(S) { crabLegs(S, -1, CC.body); } },
      { id: 'head', box: [-46, -136, 52, -88], parent: 'body', pivot: [-14, -96],
        xf: (K, t, st) => ({ rot: 0.04 * sin(t * 1.8) + 0.14 * K.wind - 0.14 * K.strike + 0.08 * K.hurt - 0.06 * K.guard, dy: 1.2 * sin(t * 2.1 + 0.5) * st.m + 4 * K.guard, dx: -7 * K.strike }),
        draw(S) {
          const g = S.g;
          // the stolen busker's cap jammed on sideways, peak out to the side
          g.save(); g.translate(10, -104); g.rotate(0.22); g.translate(-10, 104);
          S.cel([[-12, -98], [-8, -112], [10, -118], [28, -112], [32, -100], [10, -96]], CC.cap, { depth: 4 });
          S.cel([[28, -106], [46, -103], [44, -96], [28, -98]], CC.capDk, { depth: 1.5, tension: 0.5, hi: false });
          S.ln([[-4, -106], [12, -112], [26, -108]], { w: 1.1, color: shade(CC.cap, 0.2), taper: 0.3 });
          S.blob(10, -118, 3.4, 3.4, C1.lemon, { depth: 1, line: 1.2 });
          g.restore();
          // the eye stalks
          S.tube([[-30, -92], [-33, -104], [-31, -114]], 7, 6, CC.body, { depth: 1.5 });
          S.tube([[-6, -96], [-4, -108], [-2, -118]], 7, 6, CC.body, { depth: 1.5 });
        } },
      { id: 'face', box: [-44, -136, 12, -108], parent: 'head', pivot: [-16, -120], face: true, stateOf: (st) => st.face.split('|')[0],
        draw(S, ey) {
          // smug: half-lidded eyes looking sideways, unless startled, cross or delighted
          const kind = ey === 'open' ? 'sleepy' : 'round', lid = tint(CC.body, 0.15);
          S.eye(-31, -121, 15, ey, { kind, lid, side: -1, look: [-0.7, 0] });
          S.eye(-2, -125, 14, ey, { kind, lid, side: 1, look: [-0.7, 0] });
        } },
      ...arm2({
        id: 'armF', parent: 'body', sh: [-40, -64], el: [-58, -58], wrist: [-70, -48], w: [12, 11, 10], hr: 14, bend: 2, color: CC.body,
        a1: (K, t) => ({ rot: 0.05 * sin(t * 1.7) + 1.9 * K.wind + 0.5 * K.strike + 0.9 * K.guard - 0.2 * K.hurt + 0.8 * K.buff }),
        a2: (K, t) => ({ rot: 0.08 * sin(t * 2) + 0.5 * K.wind + 0.6 * K.strike + 1.4 * K.guard }),
      }),
      { id: 'pincer', parent: 'armF2', pivot: [-70, -48], box: [-116, -74, -62, -26],
        xf: (K, t, st) => ({ rot: -0.35 * K.wind + 0.3 * K.strike + 0.06 * sin(t * 2.4) * st.m }),
        draw(S) {
          // the big thumping pincer: a round palm with two jaws and a lighter tip
          S.cel([[-66, -58], [-84, -68], [-102, -64], [-112, -54, 1], [-96, -54], [-88, -49], [-98, -44], [-112, -41, 1], [-100, -32], [-82, -32], [-66, -40]], CC.body, { depth: 4, tension: 0.6,
            decor: (g) => { g.fillStyle = tint(CC.body, 0.35); g.beginPath(); g.ellipse(-104, -58, 8, 5, -0.3, 0, TAU); g.fill(); g.beginPath(); g.ellipse(-104, -38, 8, 4, 0.3, 0, TAU); g.fill(); } });
        } },
      { id: 'glint', parent: 'body', live(ctx, st) {
        const t = st.t, m = st.m, K = st.K;
        // coins glinting in the pouch, and now and then one tumbles out and rolls away (faster when it scuttles off)
        for (let i = 0; i < 2; i++) { const ph = (t * 0.55 + i * 0.5) % 1, u = sin(ph * PI); tk.sparkle(ctx, 44 + i * 14, -100 - ph * 8, (3 + i) * (0.5 + u * 0.7), { color: i % 2 ? '#ffffff' : '#fff2a8', alpha: u * m, glow: 0.4, rot: ph }); }
        for (let i = 0; i < 2; i++) {
          const ph = (t * (0.38 + 0.4 * K.strike) + i * 0.5) % 1;
          if (ph > 0.6) continue;
          const u = ph / 0.6;
          FX.bit(ctx, 'coin', 64 + u * 22 * (i ? 1 : -0.4), -92 + u * u * 88, 5, u * 9 + i, (u < 0.85 ? 1 : (1 - u) / 0.15) * m, CC.coin);
        }
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // kodama: the TUNING FORKLING (Creature, s). A silver tuning fork no taller than a teacup, standing on its stem: the two prongs are its ears, a
  // round face sits on the knob between them, stubby feet, vibration lines shimmering off it while it hums. Gloss patch: on the stem. Keeps the
  // KODAMA rig: the small size, the rattle shake (now a hum) and the summon pose.
  // ---------------------------------------------------------------------------------------------------------------
  const TF = { silver: '#e3e9f4', steel: '#9fb3d6', shoe: C1.sky };
  define({
    id: 'kodama', size: 's', acc: '#fff3a8', lunge: 26, alertColor: C1.lemon,
    col: {},
    hitAt: [0, -70], alertAt: [0, -90], hitBone: 'head', alertBone: 'head', buffBone: 'body', guardBone: 'body',
    bounds: { w: 96, h: 130, head: { x: 0, y: -86 }, body: { x: 0, y: -34 }, feet: { x: 0, y: 0 } },
    dieBox: [-40, -130, 40, 0], glossAt: [0, -31], glossBone: 'body', glossR: 10,
    tweak(K, pose, t) { if (pose === 'idle') K.by = -1.5 * Math.abs(sin(t * 2.2)); },
    parts: [
      { id: 'legB', box: [-2, -22, 18, 2], parent: 'body', pivot: [6, -16], xf: (K, t) => ({ rot: 0.05 * sin(t * 2.2 + 1) }),
        draw(S) { S.limb([[6, -18], [7, -8]], shade(TF.silver, 0.1), 8, 7); S.cel(ell(7, -3, 8, 4.5, 12), shade(TF.shoe, 0.08), { depth: 1.5 }); } },
      { id: 'body', box: [-12, -54, 12, -2], parent: 'root', pivot: [0, -14],
        xf: (K, t, st) => ({ sy: 1 + 0.03 * sin(t * 2.2) * st.m, sx: 1 - 0.015 * sin(t * 2.2) * st.m }),
        draw(S) {
          S.tube([[0, -10], [0, -30], [0, -50]], 15, 13, TF.silver, { depth: 4 });
          S.shine([[4, -44], [4.5, -30], [4, -18]], 2, 0.9);
        } },
      { id: 'gloss', gloss: true, box: [-9, -44, 9, -18], parent: 'body', pivot: [0, -31],
        draw(S) { SEA.glossPatch(S, rrectPts(-7.5, -42, 15, 22, 5), { smile: [0, -30, 7], seed: 3 }); } },
      { id: 'legF', box: [-20, -22, 2, 2], parent: 'body', pivot: [-6, -16], xf: (K, t) => ({ rot: -0.05 * sin(t * 2.2) }),
        draw(S) { S.limb([[-6, -18], [-7, -8]], TF.silver, 8.5, 7.5); S.cel(ell(-8, -3, 8.5, 4.5, 12), TF.shoe, { depth: 1.5 }); } },
      { id: 'head', box: [-36, -132, 36, -42], parent: 'body', pivot: [0, -50],
        xf: (K, t, st) => {
          const hum = Math.max(0, sin(t * 0.9 + 0.5) - 0.86) * 7;                    // an occasional hum that shivers the prongs
          return { rot: 0.08 * sin(t * 1.3) * st.m + sin(t * 46) * (0.04 * hum + 0.08 * K.strike + 0.05 * K.alert) + 0.18 * K.wind - 0.14 * K.strike + 0.12 * K.hurt, dx: -5 * K.strike, dy: 1.5 * sin(t * 2.2 + 0.4) * st.m - 3 * K.guard,
            sx: 1 + 0.1 * K.wind + 0.06 * K.buff, sy: 1 + 0.1 * K.wind - 0.08 * K.guard + 0.06 * K.buff }; },
        draw(S) {
          // the fork itself: one silver U, up one prong (its ear), round under the knob and up the other, square-ended like a real fork
          const U = [[-23, -122], [-23, -96], [-23, -72], [-17, -55], [0, -50], [17, -55], [23, -72], [23, -96], [23, -122]], g = S.g;
          g.save(); g.lineJoin = 'round'; g.lineCap = 'butt';
          const path = () => { g.beginPath(); tk.trace(g, U, 0, 0, 0.8, false); };
          path(); g.strokeStyle = NAVY; g.lineWidth = 10 + S.lw * 2; g.stroke();
          path(); g.strokeStyle = TF.silver; g.lineWidth = 10; g.stroke();
          g.save(); g.translate(-2, 2); path(); g.restore(); g.strokeStyle = shade(TF.silver, 0.12); g.lineWidth = 3; g.globalAlpha = 0.9; g.stroke(); g.globalAlpha = 1;
          g.restore();
          S.shine([[25, -118], [25, -84]], 2.2, 0.9); S.shine([[-21, -118], [-21, -98]], 2, 0.8);
          [[-23, -122], [23, -122]].forEach((p) => S.cel(rrectPts(p[0] - 6.5, p[1] - 4, 13, 6, 2), C1.lemon, { depth: 1, line: S.lw * 0.8, tension: 0.3, hi: false }));
          // the round knob nestled in the bottom of the U: its face
          S.cel(ell(0, -68, 19, 18, 20), TF.silver, { depth: 4 });
          S.shine([[8, -82], [14, -76], [17, -68]], 2.4, 0.9);
        } },
      { id: 'face', box: [-20, -86, 20, -50], parent: 'head', pivot: [0, -68], face: true,
        draw(S, state) {
          const f = faceOf(state), iris = ['#2b2f55', '#6f8fd8'];
          S.eye(-7.5, -71, 10, f.ey, { iris, side: -1 }); S.eye(7.5, -71, 10, f.ey, { iris, side: 1 });
          S.blush(-12, -62, 6); S.blush(12, -62, 6);
          S.mouth(0, -60, f.mo === 'open' ? 9 : 7, f.mo === 'open' ? 'O' : f.mo === 'grit' ? 'grit' : 'smile');
        } },
      ...arm2({
        id: 'armF', parent: 'body', sh: [-7, -42], el: [-15, -36], wrist: [-19, -26], w: [6, 5.5, 5], hr: 8, bend: 1, color: TF.silver,
        a1: (K, t) => ({ rot: 0.1 * sin(t * 2.2) + 2.4 * K.wind + 0.5 * K.strike + 0.9 * K.guard + 1.6 * K.buff }),
        a2: (K, t) => ({ rot: 0.12 * sin(t * 2.6) + 0.5 * K.wind + 0.7 * K.strike + 1.9 * K.guard }),
        hand: (S, x, y) => { S.blob(x, y + 1, 4.6, 4.6, TF.silver, { depth: 1.2, line: S.lw * 0.8 }); },
      }),
      { id: 'hum', parent: 'head', live(ctx, st) {
        const K = st.K, t = st.t, m = st.m;
        // vibration lines beside the prong tips: always a faint shimmer, strong while it rings, plus rings out when it calls a friend
        const hum = clamp(0.3 + 0.25 * sin(t * 2.1) + 0.8 * K.alert + K.strike + 0.6 * K.buff, 0, 1), jit = sin(t * 40) * 1.2 * m;
        ctx.save(); ctx.lineCap = 'round';
        [[-23, -114, -1], [23, -114, 1]].forEach((p) => {
          for (let k = 0; k < 2; k++) {
            const r = 8 + k * 6 + jit;
            ctx.globalAlpha = cA(hum * (0.85 - k * 0.25));
            ctx.beginPath(); ctx.arc(p[0], p[1], r, p[2] < 0 ? PI * 0.75 : -PI * 0.25, p[2] < 0 ? PI * 1.25 : PI * 0.25); ctx.strokeStyle = NAVY; ctx.lineWidth = 4; ctx.stroke();
            ctx.beginPath(); ctx.arc(p[0], p[1], r, p[2] < 0 ? PI * 0.75 : -PI * 0.25, p[2] < 0 ? PI * 1.25 : PI * 0.25); ctx.strokeStyle = C1.lemon; ctx.lineWidth = 2; ctx.stroke();
          }
        });
        ctx.restore();
        if (K.pose === 'attack') FX.honk(ctx, -24, -70, PI, 20, t * 2.4 * m, K.strike, C1.lemon);
        if (K.pose === 'buff' && K.buff > 0.02) { ctx.save(); ctx.globalAlpha *= K.buff; FOE.rings(ctx, 0, -100, 10, 1, t); ctx.restore(); }
        for (let i = 0; i < 3; i++) { const ph = (t * 0.3 + i / 3) % 1, a = ph * TAU + i; tk.sparkle(ctx, cos(a) * 34, -78 + sin(a * 1.3) * 22 - ph * 10, 2 + (i % 2), { color: i % 2 ? '#ffffff' : '#fff3a8', alpha: sin(ph * PI) * 0.85 * m, glow: 0.4 }); }
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // karakasa: the SQUEEZEBOX (Creature, m). A tomato-red accordion on one stocky leg in a rubber-soled boot: the pleated bellows are its body, a
  // grin of piano keys, two strap arms, gold buttons round its eyes; the bellows stretch on the hop and slam shut on the guard. Gloss patch: the
  // end of the top board. Keeps the KARAKASA rig: the one-leg hop and the snap-shut guard (the umbrella closing is now the bellows squeezing).
  // ---------------------------------------------------------------------------------------------------------------
  const SQ = { red: '#e8553f', pleat: '#b9392b', cream: '#fff1d6', gold: C1.lemon, strap: '#3b5bb5', boot: C1.sky, sole: '#34407e' };
  const SQ_BOARD = rrectPts(-46, -176, 96, 58, 16);
  const sqAir = (t) => { const c = (t / 1.15) % 1; return c < 0.72 ? sin(PI * c / 0.72) : 0; };
  const sqHop = (K) => (K.pose === 'idle' || K.pose === 'block' || K.pose === 'buff' ? 1 : 0);
  const sqBel = (K, t) => 1 + 0.16 * sqAir(t) * sqHop(K) + 0.14 * K.wind - 0.42 * K.guard + 0.08 * K.strike - 0.06 * K.hurt + 0.1 * K.buff;
  // the piano-key grin: a crescent of white keys with black keys between, open (a mouth below the keys) or clenched
  function keysGrin(S, x, y, w, mo) {
    const g = S.g, h = w * 0.2, sag = mo === 'grit' ? w * 0.04 : w * 0.16;
    const top = [], bot = [];
    for (let i = 0; i <= 8; i++) { const u = i / 8, xx = x - w / 2 + u * w, s = 4 * u * (1 - u); top.push([xx, y + s * sag]); bot.push([xx, y + s * sag + h * (0.55 + 0.45 * s)]); }
    if (mo === 'open') {
      const low = []; for (let i = 0; i <= 8; i++) { const u = i / 8, s = 4 * u * (1 - u); low.push([x - w / 2 + u * w, y + s * sag + h + s * w * 0.32]); }
      S.cel(top.concat(low.reverse()), C1.mouth, { shadow: false, hi: false, line: S.lw * 0.8, tension: 0.5 });
      S.fill(ell(x, y + sag + h + w * 0.18, w * 0.18, w * 0.08, 10), C1.tongue);
    }
    const band = top.concat(bot.slice().reverse());
    S.cel(band, '#fffdf8', { shadow: false, hi: false, line: S.lw * 0.8, tension: 0.5, decor: (gg) => {
      gg.strokeStyle = rgba(NAVY, 0.7); gg.lineWidth = 1;
      for (let i = 1; i < 8; i++) { gg.beginPath(); gg.moveTo(top[i][0], top[i][1]); gg.lineTo(bot[i][0], bot[i][1]); gg.stroke(); }
      gg.fillStyle = NAVY;
      for (let i = 1; i < 8; i++) if (i !== 3 && i !== 7) { const xx = top[i][0], yy = top[i][1]; gg.fillRect(xx - w * 0.025, yy, w * 0.05, (bot[i][1] - yy) * 0.58); }
    } });
    void g;
  }
  define({
    id: 'karakasa', size: 'm', acc: '#ffe6a0', lunge: 40, alertColor: C1.lemon,
    col: {},
    hitAt: [-4, -146], alertAt: [-4, -150], hitBone: 'canopy', alertBone: 'canopy', buffBone: 'bellows', guardBone: 'bellows',
    arc: { bone: 'bellows', x: -4, y: -92, r: 62, a0: -1.2, a1: -4.4, w: 12, color: '#ffe9a8' },
    bounds: { w: 160, h: 208, head: { x: -6, y: -150 }, body: { x: 2, y: -94 }, feet: { x: 0, y: 0 } },
    dieBox: [-70, -190, 72, 0], glossAt: [37, -145], glossBone: 'canopy', glossR: 12,
    tweak(K, pose, t) {
      if (pose === 'idle' || pose === 'block' || pose === 'buff') {
        const c = (t / 1.15) % 1, air = c < 0.72 ? sin(PI * c / 0.72) : 0;
        K.by = -18 * air;
        K.bsy *= 1 + 0.03 * air - (c >= 0.72 ? 0.08 * sin((c - 0.72) / 0.28 * PI) : 0);
        K.bsx *= 1 - 0.02 * air + (c >= 0.72 ? 0.05 * sin((c - 0.72) / 0.28 * PI) : 0);
      }
    },
    parts: [
      { id: 'leg', box: [-26, -62, 24, 4], parent: 'root', pivot: [2, -56],
        xf: (K, t) => ({ rot: 0.12 * sqAir(t) * sqHop(K) * (sin(t * 2.7) > 0 ? 1 : -1) * 0.5 - 0.04 }),
        draw(S) {
          S.limb([[2, -60], [3, -40], [2, -22]], SQ.cream, 18, 16, { bulge: 0.05 });
          S.cel([[16, -26], [-10, -26], [-18, -14], [-20, -5], [20, -5], [18, -14]], SQ.boot, { depth: 3, tension: 0.6 });
          S.cel(rrectPts(-24, -7, 46, 7, 3), SQ.sole, { depth: 1.5, tension: 0.3, hi: false });
        } },
      { id: 'shaft', box: [-44, -76, 48, -52], parent: 'root', pivot: [2, -58],
        xf: (K, t, st) => ({ rot: 0.02 * sin(t * 1.9) * st.m }),
        draw(S) {
          S.cel(rrectPts(-40, -74, 86, 18, 7), SQ.red, { depth: 4, tension: 0.4 });
          [[-34, -65], [40, -65]].forEach((p) => S.blob(p[0], p[1], 3, 3, SQ.gold, { depth: 1, line: 1.2 }));
        } },
      { id: 'bellows', box: [-42, -124, 46, -66], parent: 'shaft', pivot: [2, -70],
        xf: (K, t) => ({ sy: sqBel(K, t), sx: 1 + 0.06 * K.guard }),
        draw(S) {
          // the pleats: a zigzag edge on both sides, folds in two reds, a gold rivet at each corner fold
          const n = 6, y0 = -72, y1 = -120, L = [], R = [];
          for (let i = 0; i <= n * 2; i++) { const y = lerp(y0, y1, i / (n * 2)), k = i % 2 ? 1 : 0; L.push([-38 + k * 6, y, 1]); R.push([42 - k * 6, y, 1]); }
          S.cel(L.concat(R.reverse()), SQ.red, { depth: 6, tension: 0, decor: (g) => {
            for (let i = 0; i < n * 2; i++) { if (i % 2) continue; const ya = lerp(y0, y1, i / (n * 2)), yb = lerp(y0, y1, (i + 1) / (n * 2)); g.fillStyle = SQ.pleat; g.fillRect(-44, Math.min(ya, yb), 92, Math.abs(yb - ya)); }
            g.strokeStyle = rgba(NAVY, 0.55); g.lineWidth = 1.2;
            for (let i = 1; i < n * 2; i++) { const y = lerp(y0, y1, i / (n * 2)); g.beginPath(); g.moveTo(-40, y); g.lineTo(44, y); g.stroke(); }
          } });
          for (let i = 1; i < n * 2; i += 2) { const y = lerp(y0, y1, i / (n * 2)); S.dot(-31, y, 1.8, SQ.gold); S.dot(35, y, 1.8, SQ.gold); }
        } },
      ...arm2({
        id: 'armB', parent: 'canopy', sh: [34, -128], el: [46, -116], wrist: [52, -100], w: [8, 7.5, 7], hr: 10, bend: -1, color: shade(SQ.strap, 0.1),
        a1: (K, t) => ({ rot: 0.1 * sin(t * 2.2 + 1) - 0.4 * K.wind + 0.3 * K.strike - 0.3 * K.guard - 0.8 * K.buff }),
        a2: (K, t) => ({ rot: 0.14 * sin(t * 2.6 + 1) - 0.3 * K.wind + 0.3 * K.strike - 1.2 * K.guard }),
        hand: (S, x, y) => S.blob(x, y + 2, 6.5, 6.5, shade(SQ.cream, 0.08), { depth: 1.5, line: S.lw * 0.8 }),
      }),
      { id: 'canopy', box: [-50, -182, 54, -112], parent: 'bellows', pivot: [2, -120],
        xf: (K, t, st) => ({ sy: 1 / sqBel(K, t), sx: 1 / (1 + 0.06 * K.guard), rot: 0.04 * sin(t * 1.5) * st.m - 0.18 * K.strike + 0.1 * K.wind + 0.06 * K.hurt, dy: -3 * K.strike }),
        draw(S) {
          S.cel(SQ_BOARD, SQ.red, { depth: 8, tension: 0.6, decor: (g) => {
            g.strokeStyle = SQ.gold; g.lineWidth = 2.2; g.beginPath(); tk.trace(g, rrectPts(-40, -170, 84, 46, 12)); g.stroke();
          } });
          // a cream crest on top of the board, like the maker's plate (no lettering)
          S.cel([[-14, -176], [-8, -184], [12, -184], [18, -176]], SQ.cream, { depth: 1.5, tension: 0.4, line: S.lw * 0.8 });
        } },
      { id: 'gloss', gloss: true, box: [22, -178, 52, -116], parent: 'canopy', pivot: [37, -145],
        draw(S) { SEA.glossPatch(S, [[26, -176], [50, -176], [50, -118], [26, -118]], { clip: SQ_BOARD, smile: [38, -143, 9], seed: 4 }); } },
      { id: 'face', box: [-40, -168, 22, -110], parent: 'canopy', pivot: [-6, -146], face: true,
        draw(S, state) {
          const f = faceOf(state), iris = ['#2b2f55', '#c8901a'];
          // gold buttons round its eyes, then the eyes, then the grin of piano keys
          [[-21, -152, 9], [7, -154, 8.4]].forEach((b) => { S.blob(b[0], b[1], b[2] + 2.5, b[2] + 2.5, SQ.gold, { depth: 1.5, line: S.lw * 0.8 }); });
          S.eye(-21, -152, 13, f.ey, { iris, side: -1, lid: SQ.red }); S.eye(7, -154, 12, f.ey, { iris, side: 1, lid: SQ.red });
          S.blush(-34, -138, 9); S.blush(18, -140, 8);
          keysGrin(S, -7, -136, 36, f.mo);
        } },
      ...arm2({
        id: 'armF', parent: 'canopy', sh: [-40, -128], el: [-56, -116], wrist: [-64, -98], w: [9, 8, 7.5], hr: 10, bend: 1, color: SQ.strap,
        a1: (K, t) => ({ rot: 0.1 * sin(t * 2.2) + 2.4 * K.wind + 0.5 * K.strike + 0.8 * K.guard + 1.2 * K.buff }),
        a2: (K, t) => ({ rot: 0.14 * sin(t * 2.6) + 0.6 * K.wind + 0.7 * K.strike + 1.7 * K.guard }),
        decorU: (S) => S.ln([[-42, -126], [-54, -116]], { w: 1, color: '#c8d6ff', taper: 0 }),
        hand: (S, x, y) => S.blob(x, y + 2, 7, 7, SQ.cream, { depth: 1.5, line: S.lw * 0.8 }),
      }),
      { id: 'wheeze', parent: 'bellows', live(ctx, st) {
        const K = st.K, t = st.t, m = st.m;
        // Wheezy Blast: puffs of air out of the bellows; on the guard a little squeeze puff; a note now and then as it hops
        if (K.pose === 'attack' && K.strike > 0.05) for (let i = 0; i < 4; i++) { const u = (t * 2 + i / 4) % 1; FX.bit(ctx, 'puff', -44 - u * 46, -96 + (i - 1.5) * 9 - u * 6, 4 + u * 8, 0, K.strike * (1 - u), '#fffaf2'); }
        if (K.guard > 0.05) FX.bit(ctx, 'puff', -48, -94, 6 + 4 * K.guard, 0, 0.8 * K.guard, '#fffaf2');
        const ph = (t / 1.15) % 1;
        if (K.pose === 'idle' && ph > 0.72) { const u = (ph - 0.72) / 0.28; tk.note(ctx, 52 + u * 10, -112 - u * 24, 8, { kind: 'eighth', color: C1.tomato, alpha: sin(PI * u) * m, rot: 0.2, line: 1.5 }); }
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // hitodama: the HOT CHILLI (Creature, s). A glossy red chilli from the noodle cart standing on its tip, a curly green stalk like a cowlick, big
  // shiny eyes, tiny hopping feet, a wobbling cartoon heat haze above it. Gloss patch: a smooth pastel panel low on its skin. Keeps the HITODAMA
  // rig: the six-frame flip-book (now the heat haze over the stalk at 9 fps) and the flicking tail chain (now the curly stalk).
  // ---------------------------------------------------------------------------------------------------------------
  const HC = { red: '#ec3b2f', foot: '#b8322a', leaf: '#4caf50', stalk: '#3f8f3a' };
  const HC_BODY = [[2, -96], [18, -92], [27, -78], [26, -58], [20, -38], [11, -22], [1, -11, 1], [-7, -20], [-17, -36], [-24, -56], [-25, -76], [-16, -91]];
  define({
    id: 'hitodama', size: 's', acc: '#ffcf8a', lunge: 36, alertColor: '#ffb340',
    col: {},
    hitAt: [0, -60], alertAt: [0, -76], hitBone: 'flame', alertBone: 'flame', buffBone: 'flame', guardBone: 'flame',
    bounds: { w: 90, h: 144, head: { x: -2, y: -84 }, body: { x: 0, y: -52 }, feet: { x: 0, y: 0 } },
    dieBox: [-38, -128, 38, 0], glossAt: [13, -35], glossBone: 'flame', glossR: 9,
    tweak(K, pose, t) { const m = tk.motion(); K.by += -(pose === 'idle' ? 9 : 3) * Math.abs(sin(t * 3.4)) * m; },
    parts: [
      { id: 'feet', box: [-20, -18, 20, 2], parent: 'root', pivot: [0, -12],
        xf: (K, t, st) => ({ rot: 0.08 * sin(t * 6.8) * st.m }),
        draw(S) {
          S.limb([[-6, -14], [-9, -5]], HC.foot, 5, 4.5); S.limb([[6, -14], [9, -5]], HC.foot, 5, 4.5);
          S.cel(ell(-11, -3, 6.5, 3.5, 12), HC.foot, { depth: 1.2 }); S.cel(ell(11, -3, 6.5, 3.5, 12), HC.foot, { depth: 1.2 });
        } },
      { id: 'flame', box: [-28, -100, 30, -8], parent: 'root', pivot: [0, -14],
        xf: (K, t, st) => ({ sx: 1 + 0.12 * K.buff + 0.12 * K.wind + 0.08 * K.strike - 0.12 * K.guard + 0.03 * sin(t * 6.8) * st.m, sy: 1 - 0.03 * sin(t * 6.8) * st.m + 0.1 * K.buff + 0.08 * K.wind - 0.14 * K.guard, rot: 0.05 * sin(t * 2.3) * st.m + 0.1 * K.wind - 0.16 * K.strike }),
        draw(S) { SEA.produce(S, HC_BODY, HC.red, { seed: 5, freckles: 4, shine: [[13, -86], [20, -74], [21, -60]], shineW: 3.4, cel: { depth: 7 } }); } },
      { id: 'gloss', gloss: true, box: [2, -48, 24, -22], parent: 'flame', pivot: [13, -35],
        draw(S) { SEA.glossPatch(S, [[9, -44], [20, -42], [18, -30], [11, -25], [6, -33]], { clip: HC_BODY, smile: [13, -35, 6], seed: 5 }); } },
      { id: 'stalk', parent: 'flame',
        chain: { spine: [[2, -94], [4, -106], [-2, -116], [-10, -114]], cuts: [0.34, 0.68], reach: 18 },
        bends: (K, t, st) => { const a = 0.24 * sin(t * 3.1) * st.m + 0.35 * K.strike - 0.2 * K.wind; return [a * 0.25, a, a * 1.3]; },
        draw(S) {
          S.cel([[-15, -92], [-8, -101], [0, -97], [8, -102], [17, -93], [8, -89], [-6, -88]], HC.leaf, { depth: 2, tension: 0.6 });
          S.tube([[2, -96], [4, -106], [-2, -116], [-9, -115]], 6, 4.5, HC.stalk, { depth: 1.5 });
          S.ln([[-9, -115], [-13, -111], [-10, -107]], { w: 2.4, color: HC.stalk, taper: 0.3 });
        } },
      { id: 'face', box: [-26, -80, 22, -40], parent: 'flame', pivot: [-3, -62], face: true,
        draw(S, state) {
          const f = faceOf(state), iris = ['#2b2f55', '#5a6fb0'];
          S.eye(-12, -66, 14, f.ey, { iris, side: -1 }); S.eye(6, -67, 12.5, f.ey, { iris, side: 1 });
          S.blush(-19, -53, 8); S.blush(13, -54, 7);
          S.mouth(-3, -50, 10, f.mo === 'open' ? 'happyOpen' : f.mo === 'grit' ? 'grit' : 'smile');
        } },
      { id: 'haze', box: [-26, -146, 26, -112], parent: 'flame', pivot: [0, -114], v: (st) => 'f' + (Math.floor(st.t * 9) % 6),
        xf: (K, t, st) => ({ sy: 1 + 0.3 * K.alert + 0.35 * K.strike + 0.25 * K.buff, sx: 1 + 0.1 * K.alert, rot: -0.1 * st.K.strike }),
        draw(S, variant) {
          // one frame of the boiling heat haze: three wobbling squiggles, each a navy edge round an orange core
          const k = +String(variant).slice(1) || 0, g = S.g;
          [-13, 0, 13].forEach((x0, i) => {
            const pts = [];
            for (let j = 0; j <= 6; j++) { const u = j / 6; pts.push([x0 + 3.2 * sin(u * TAU * 1.2 + k / 6 * TAU + i * 1.7), -116 - u * (22 - Math.abs(i - 1) * 6)]); }
            g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
            g.beginPath(); pts.forEach((p, j) => (j ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.strokeStyle = NAVY; g.lineWidth = 5; g.stroke();
            g.beginPath(); pts.forEach((p, j) => (j ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.strokeStyle = i === 1 ? C1.lemon : '#ff9a3d'; g.lineWidth = 2.6; g.stroke();
            g.restore();
          });
        } },
      { id: 'aura', parent: 'flame', live(ctx, st) {
        const K = st.K, t = st.t, m = st.m, k = 1 + 0.6 * K.alert + 0.6 * K.buff + 0.5 * K.strike;
        tk.glow(ctx, 0, -58, 52, '#ff9a3d', 0.22 * k);
        for (let i = 0; i < 3; i++) { const ph = (t * 0.6 + i / 3) % 1, a = i * 2.4 + t * 0.6; FX.bit(ctx, 'spark', cos(a) * (16 + 6 * ph) + 2, -96 - ph * 40, 2.4 + (i % 2), ph * 3, sin(ph * PI) * 0.9 * m, i % 2 ? C1.lemon : '#ffb37a'); }
        if (K.pose === 'attack' && K.strike > 0.1) for (let i = 0; i < 4; i++) FX.bit(ctx, 'spark', -28 - i * 12 * K.strike, -60 + (i - 1.5) * 10, 3 + i % 2, i, K.strike, i % 2 ? C1.lemon : C1.tomato);
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // oni_cub: the JITTERBUG (Creature, m). A wobbly lilac jelly-bug of stage fright with knocking knees, two trembling antennae, a too-big bow tie,
  // one sweat drop and a crumpled song sheet clutched in both hands. Gloss patch: a smooth pastel panel on its back. Keeps the ONI CUB rig: the
  // small biped, the pulse (now the sweat drop) and the tantrum shake (now the jitters).
  // ---------------------------------------------------------------------------------------------------------------
  const JB = { lilac: '#c9a8ff', light: '#e6d8ff', bow: '#ff5c93', sheet: '#fff8ec', tip: C1.lemon, sweat: C1.mint };
  const JB_BODY = [[0, -104], [18, -98], [28, -80], [30, -60], [22, -46], [0, -42], [-22, -46], [-30, -60], [-28, -80], [-18, -98]];
  const jbLeg = (S, hip, knee, foot, base, side) => {
    S.tube([hip, [lerp(hip[0], knee[0], 0.5), lerp(hip[1], knee[1], 0.5)], knee], 12, 10, base, { depth: 2.5 });
    S.tube([knee, [lerp(knee[0], foot[0], 0.5), lerp(knee[1], foot[1], 0.5)], foot], 10, 9, base, { depth: 2.5 });
    S.cel(ell(foot[0] + side * 4, -3.5, 10, 5, 12), shade(base, 0.06), { depth: 1.5 });
  };
  define({
    id: 'oni_cub', size: 'm', acc: '#e6d8ff', lunge: 52, alertColor: C1.lemon,
    col: {},
    hitAt: [-8, -124], alertAt: [-8, -150], hitBone: 'head', alertBone: 'head', buffBone: 'body', guardBone: 'body',
    arc: { bone: 'body', x: -26, y: -92, r: 52, a0: -1.2, a1: -4.4, w: 12, color: '#e6d8ff' },
    bounds: { w: 140, h: 194, head: { x: -6, y: -138 }, body: { x: 0, y: -66 }, feet: { x: 0, y: 0 } },
    dieBox: [-58, -192, 58, 0], glossAt: [20, -74], glossBone: 'body', glossR: 12,
    tweak(K, pose, t) { const m = tk.motion(); K.shx += sin(t * 31) * 0.7 * m * (pose === 'idle' ? 1 : 0.4) + sin(t * 43) * 3 * K.buff * m; },
    parts: [
      ...arm2({
        id: 'armB', parent: 'body', sh: [16, -92], el: [8, -80], wrist: [-2, -76], w: [10, 9, 8], hr: 10, bend: -2, color: shade(JB.lilac, 0.08),
        a1: (K, t) => ({ rot: 0.06 * sin(t * 2.2 + 1) + 0.5 * K.wind + 0.2 * K.strike + 0.4 * K.guard }),
        a2: (K, t) => ({ rot: 0.1 * sin(t * 2.6 + 1) + 0.3 * K.wind + 0.2 * K.strike + 0.8 * K.guard }),
        hand: (S, x, y) => S.blob(x, y + 1, 5.5, 5.5, shade(JB.lilac, 0.08), { depth: 1.2, line: S.lw * 0.8 }),
      }),
      { id: 'legB', box: [-6, -54, 30, 4], parent: 'root', pivot: [10, -50], xf: (K, t, st) => ({ rot: 0.06 * sin(t * 15 + 1) * st.m * (K.pose === 'idle' ? 1 : 0.3) }),
        draw(S) { jbLeg(S, [10, -50], [3, -28], [11, -7], shade(JB.lilac, 0.1), 1); } },
      { id: 'body', box: [-34, -108, 34, -38], parent: 'root', pivot: [0, -44],
        xf: (K, t, st) => ({ sy: 1 + 0.03 * sin(t * 2.6) * st.m - 0.02 * K.guard + 0.05 * K.buff, sx: 1 - 0.016 * sin(t * 2.6) * st.m + 0.05 * K.buff }),
        draw(S) {
          S.cel(JB_BODY, JB.lilac, { depth: 9, decor: (g) => {
            g.beginPath(); g.ellipse(-6, -66, 17, 18, 0, 0, TAU); g.fillStyle = JB.light; g.fill();
            g.fillStyle = 'rgba(255,255,255,0.55)'; [[12, -66, 3], [8, -56, 2], [-18, -84, 2.2]].forEach((b) => { g.beginPath(); g.arc(b[0], b[1], b[2], 0, TAU); g.fill(); });
          } });
        } },
      { id: 'gloss', gloss: true, box: [8, -96, 32, -54], parent: 'body', pivot: [20, -74],
        draw(S) { SEA.glossPatch(S, [[14, -92], [26, -84], [29, -64], [21, -57], [12, -70]], { clip: JB_BODY, smile: [21, -74, 7], seed: 6 }); } },
      { id: 'sheet', box: [-40, -94, 8, -54], parent: 'body', pivot: [-14, -72],
        xf: (K, t, st) => ({ rot: 0.04 * sin(t * 15) * st.m - 0.2 * K.wind + 0.15 * K.strike - 0.3 * K.guard, dy: -6 * K.guard }),
        draw(S) {
          // the crumpled song sheet: jagged edges, creases, three staff lines and two little notes
          const pts = [[-34, -86, 1], [-22, -90, 1], [-12, -86, 1], [0, -89, 1], [4, -76, 1], [1, -60, 1], [-12, -63, 1], [-25, -58, 1], [-36, -64, 1], [-31, -75, 1]];
          S.cel(pts, JB.sheet, { depth: 3, tension: 0.2, decor: (g) => {
            g.strokeStyle = rgba(NAVY, 0.45); g.lineWidth = 1;
            [-80, -75, -70].forEach((y) => { g.beginPath(); g.moveTo(-31, y); g.lineTo(-2, y - 1); g.stroke(); });
            g.strokeStyle = rgba('#b7a98a', 0.8); g.beginPath(); g.moveTo(-20, -89); g.lineTo(-16, -60); g.moveTo(-34, -70); g.lineTo(2, -66); g.stroke();
          } });
          tk.note(S.g, -24, -73, 5, { kind: 'eighth', color: NAVY, line: 1 }); tk.note(S.g, -10, -76, 5, { kind: 'quarter', color: NAVY, line: 1 });
        } },
      { id: 'legF', box: [-30, -54, 6, 4], parent: 'root', pivot: [-10, -50], xf: (K, t, st) => ({ rot: -0.06 * sin(t * 15) * st.m * (K.pose === 'idle' ? 1 : 0.3) }),
        draw(S) { jbLeg(S, [-10, -50], [-2, -28], [-12, -7], JB.lilac, -1); } },
      ...arm2({
        id: 'armF', parent: 'body', sh: [-22, -92], el: [-34, -80], wrist: [-32, -70], w: [10, 9, 8], hr: 10, bend: 2, color: JB.lilac,
        a1: (K, t) => ({ rot: 0.05 * sin(t * 2.2) + 1.0 * K.wind + 0.3 * K.strike + 0.6 * K.guard - 0.2 * K.hurt + 0.8 * K.buff }),
        a2: (K, t) => ({ rot: 0.1 * sin(t * 2.6) + 0.3 * K.wind + 0.4 * K.strike + 0.8 * K.guard }),
        hand: (S, x, y) => S.blob(x, y + 1, 6, 6, JB.lilac, { depth: 1.2, line: S.lw * 0.8 }),
      }),
      { id: 'head', box: [-46, -168, 34, -94], parent: 'body', pivot: [-6, -98],
        xf: (K, t, st) => ({ rot: 0.03 * sin(t * 2) + 0.18 * K.wind - 0.28 * K.strike + 0.1 * K.hurt - 0.08 * K.guard, dy: 1.3 * sin(t * 2.6 + 0.5) * st.m + 4 * K.guard, dx: -16 * K.strike + 5 * K.wind, sx: 1 + 0.04 * K.buff, sy: 1 + 0.04 * K.buff }),
        draw(S) { S.cel(blob(-6, -131, 37, 33, 9, 0.02, 20), JB.lilac, { depth: 9 }); S.shine([[10, -158], [22, -150], [28, -136]], 3.2, 0.8); } },
      { id: 'antennae', box: [-40, -196, 26, -150], parent: 'head', pivot: [-6, -156],
        xf: (K, t, st) => ({ rot: sin(t * 23) * 0.05 * st.m + 0.25 * K.alert * sin(t * 30) * st.m - 0.2 * K.strike }),
        draw(S) {
          S.tube([[-20, -158], [-27, -172], [-31, -184]], 4, 3.5, shade(JB.lilac, 0.15), { depth: 1 }); S.blob(-31, -186, 5, 5, JB.tip, { depth: 1.2, line: S.lw * 0.8 });
          S.tube([[6, -160], [11, -174], [13, -186]], 4, 3.5, shade(JB.lilac, 0.15), { depth: 1 }); S.blob(13, -188, 5, 5, JB.tip, { depth: 1.2, line: S.lw * 0.8 });
        } },
      { id: 'face', box: [-44, -150, 26, -96], parent: 'head', pivot: [-8, -126], face: true,
        draw(S, state) {
          const f = faceOf(state), iris = ['#3a2a6a', '#8f6ad8'];
          S.eye(-22, -128, 17, f.ey, { iris, side: -1, lid: JB.lilac, look: [0.2, 0.3] }); S.eye(6, -130, 15, f.ey, { iris, side: 1, lid: JB.lilac, look: [0.2, 0.3] });
          // worried brows, unless it is cross
          const cross = f.ey === 'angry';
          S.brow(-23, -146, 13, cross ? 0.7 : -0.7, -1); S.brow(6, -148, 12, cross ? 0.7 : -0.7, 1);
          S.blush(-32, -112, 10); S.blush(16, -114, 9);
          S.mouth(-8, -110, 14, f.mo === 'open' ? 'ow' : f.mo === 'grit' ? 'grit' : 'grumble');
        } },
      { id: 'bow', box: [-28, -112, 20, -88], parent: 'body', pivot: [-4, -100],
        xf: (K, t, st) => ({ rot: 0.06 * sin(t * 10) * st.m + 0.1 * K.hurt }),
        draw(S) {
          // the too-big bow tie: two cherry wings with lemon polka dots and a knot
          const dots = (g, cx) => { g.fillStyle = C1.lemon; [[cx - 4, -104], [cx + 3, -97], [cx - 1, -101]].forEach((p) => { g.beginPath(); g.arc(p[0], p[1], 1.6, 0, TAU); g.fill(); }); };
          S.cel([[-6, -101], [-24, -110, 1], [-25, -91, 1]], JB.bow, { depth: 3, tension: 0.4, decor: (g) => dots(g, -17) });
          S.cel([[-2, -101], [16, -110, 1], [17, -91, 1]], JB.bow, { depth: 3, tension: 0.4, decor: (g) => dots(g, 9) });
          S.cel(rrectPts(-8, -106, 10, 10, 3), shade(JB.bow, 0.1), { depth: 1.5, tension: 0.4 });
        } },
      { id: 'nerves', parent: 'head', live(ctx, st) {
        const K = st.K, t = st.t, m = st.m, nerv = 0.5 + 0.5 * K.buff + 0.4 * K.alert + 0.3 * K.hurt;
        // the one sweat drop, swelling and shrinking, and little tremble marks either side of the head
        const pl = 0.85 + 0.15 * sin(t * 5.5) * m;
        ctx.save(); ctx.translate(22, -150); ctx.scale(pl, pl); FX.bit(ctx, 'drop', 0, 0, 5.5, 0.3, 1, JB.sweat); ctx.restore();
        ctx.save(); ctx.lineCap = 'round'; ctx.globalAlpha *= cA(nerv * (0.6 + 0.4 * sin(t * 9)) * m);
        [[-52, -138, -1], [36, -140, 1]].forEach((p) => { for (let k = 0; k < 2; k++) { ctx.beginPath(); ctx.moveTo(p[0], p[1] + k * 12); ctx.lineTo(p[0] + p[2] * 6, p[1] + k * 12 - 3); ctx.lineTo(p[0] + p[2] * 3, p[1] + k * 12 + 2); ctx.lineTo(p[0] + p[2] * 9, p[1] + k * 12 - 1); ctx.strokeStyle = NAVY; ctx.lineWidth = 2; ctx.stroke(); } });
        ctx.restore();
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // crow_tengu: the PITCH-PERFECT GULL (Creature, m). A sleek white harbour gull with a chrome Gloss sheen on its head, a tiny headset mic, its beak
  // open mid-note in a perfectly round O, wings flung wide for the dive. Gloss patch: the chrome crown. Keeps the CROW TENGU rig: the two wings,
  // the peck (beak and jaw), the dive and the swap.
  // ---------------------------------------------------------------------------------------------------------------
  const GU = { white: '#fbfaf6', slate: '#8f9cc0', slateDk: '#6b789e', tip: '#3a4366', beak: '#ffa53d', leg: '#ff9a6b', set: '#3b4fa0' };
  const GU_HEAD = blob(-10, -136, 28, 26, 5, 0.02, 18);
  // a gull feather: a slate blade with a dark tip and a white spot (bodies, not material)
  function gullFeather(S, x, y, ang, len, w, base, tip) {
    const c = cos(ang), s2 = sin(ang), nx = -s2, ny = c;
    const pts = [[x, y], [x + c * len * 0.5 + nx * w * 0.5, y + s2 * len * 0.5 + ny * w * 0.5], [x + c * len, y + s2 * len, 1], [x + c * len * 0.5 - nx * w * 0.5, y + s2 * len * 0.5 - ny * w * 0.5]];
    S.cel(pts, base, { depth: 2.5, line: S.lw * 0.85, tension: 0.7, hi: false, decor: tip ? (g) => {
      g.fillStyle = tip; g.beginPath(); g.arc(x + c * len, y + s2 * len, len * 0.36, 0, TAU); g.fill();
      g.fillStyle = GU.white; g.beginPath(); g.arc(x + c * len * 0.8, y + s2 * len * 0.8, w * 0.16, 0, TAU); g.fill();
    } : undefined });
  }
  define({
    id: 'crow_tengu', size: 'm', acc: '#ffe9a8', lunge: 54, alertColor: C1.lemon,
    col: {},
    hitAt: [-8, -100], alertAt: [-8, -132], hitBone: 'body', alertBone: 'head', buffBone: 'body', guardBone: 'body',
    arc: { bone: 'body', x: -10, y: -108, r: 66, a0: -0.8, a1: -3.8, w: 12, color: '#e8eeff' },
    bounds: { w: 200, h: 184, head: { x: -14, y: -140 }, body: { x: 6, y: -88 }, feet: { x: 0, y: 0 } },
    dieBox: [-76, -184, 100, 0], glossAt: [-20, -154], glossBone: 'head', glossR: 14,
    tweak(K, pose, t) { K.by += -6 - 3 * sin(t * 2.6) * tk.motion(); },
    parts: [
      { id: 'wingBi', box: [8, -168, 70, -100], parent: 'body', pivot: [14, -112],
        xf: (K, t, st) => ({ rot: 0.45 - 0.12 * sin(t * 2.6 + 0.6) * st.m + 0.3 * K.strike - 0.8 * K.wind - 0.3 * K.guard - 0.9 * K.buff }),
        draw(S) { S.cel([[14, -108], [26, -134], [46, -154], [62, -160], [58, -142], [48, -124], [34, -108]], GU.slateDk, { depth: 5, tension: 0.7 }); } },
      { id: 'wingBo', box: [30, -210, 130, -120], parent: 'wingBi', pivot: [58, -152],
        xf: (K, t, st) => ({ rot: -0.3 * sin(t * 2.6 - 0.4) * st.m + 0.5 * K.strike - 0.3 * K.wind - 0.2 * K.guard - 0.3 * K.buff }),
        draw(S) { [-0.7, -0.38, -0.06, 0.26].forEach((a, i) => gullFeather(S, 58, -152, a - 0.55, 60 - i * 4, 15, i % 2 ? GU.slateDk : GU.slate, GU.tip)); } },
      { id: 'tail', box: [8, -76, 74, -34], parent: 'body', pivot: [14, -60],
        xf: (K, t, st) => ({ rot: 0.1 * sin(t * 2.2) * st.m + 0.3 * K.strike }),
        draw(S) { [0.15, 0.45, 0.75].forEach((a, i) => gullFeather(S, 14, -62, a - 0.2, 46 - i * 6, 14, i === 1 ? GU.slate : GU.white, i === 1 ? GU.slateDk : null)); } },
      { id: 'legB', box: [-6, -58, 30, 4], parent: 'root', pivot: [8, -50], xf: (K, t) => ({ rot: 0.04 * sin(t * 2.6 + 1) - 0.1 * K.wind }),
        draw(S) { S.tube([[8, -52], [14, -32], [10, -14]], 5.5, 5, shade(GU.leg, 0.1), { depth: 1.2 }); S.cel([[10, -15], [22, -4, 1], [14, -2], [6, -4, 1]], shade(GU.leg, 0.1), { depth: 1.5, tension: 0.3 }); } },
      { id: 'body', box: [-32, -134, 34, -44], parent: 'root', pivot: [0, -50],
        xf: (K, t, st) => ({ sy: 1 + 0.022 * sin(t * 2.6) * st.m - 0.03 * K.guard, sx: 1 - 0.012 * sin(t * 2.6) * st.m, rot: 0.03 * sin(t * 1.9) }),
        draw(S) {
          const body = [[-4, -128], [16, -120], [28, -98], [26, -70], [12, -52], [-10, -50], [-24, -66], [-26, -96], [-18, -120]];
          S.cel(body, GU.white, { depth: 9, decor: (g) => { g.beginPath(); g.ellipse(26, -96, 15, 30, 0.2, 0, TAU); g.fillStyle = GU.slate; g.fill(); } });
        } },
      { id: 'legF', box: [-26, -58, 14, 4], parent: 'root', pivot: [-8, -50], xf: (K, t) => ({ rot: -0.04 * sin(t * 2.6) + 0.2 * K.wind }),
        draw(S) { S.tube([[-8, -52], [-2, -32], [-6, -14]], 6, 5.5, GU.leg, { depth: 1.2 }); S.cel([[-6, -15], [-20, -4, 1], [-12, -2], [-2, -4, 1]], GU.leg, { depth: 1.5, tension: 0.3 }); } },
      { id: 'head', box: [-42, -166, 22, -104], parent: 'body', pivot: [-6, -114],
        xf: (K, t, st) => ({ rot: 0.03 * sin(t * 2.4) + 0.12 * K.wind - 0.2 * K.strike + 0.08 * K.hurt, dy: 1.5 * sin(t * 2.6 + 0.5) * st.m + 3 * K.guard, dx: -18 * K.strike + 4 * K.wind }),
        draw(S) {
          // the dark O of its singing mouth sits behind the beak, then the round white head and the tiny headset
          S.cel(ell(-36, -128, 8, 8.5, 12), '#7a2438', { shadow: false, hi: false, line: S.lw * 0.7 });
          S.cel(GU_HEAD, GU.white, { depth: 7 });
          const g = S.g;
          g.save(); g.lineCap = 'round';
          g.beginPath(); g.moveTo(2, -161); g.quadraticCurveTo(16, -152, 12, -134); g.strokeStyle = NAVY; g.lineWidth = 5; g.stroke(); g.strokeStyle = GU.set; g.lineWidth = 3; g.stroke();
          g.beginPath(); g.moveTo(10, -128); g.quadraticCurveTo(-2, -116, -24, -120); g.strokeStyle = NAVY; g.lineWidth = 3; g.stroke(); g.strokeStyle = GU.set; g.lineWidth = 1.4; g.stroke();
          g.restore();
          S.blob(11, -131, 6, 7, GU.set, { depth: 1.5, line: S.lw * 0.8 });
          S.blob(-25, -120, 3.2, 3.2, '#2a2f52', { depth: 0.8, line: 1.2, hi: false });
        } },
      { id: 'gloss', gloss: true, box: [-40, -168, 0, -138], parent: 'head', pivot: [-20, -154],
        draw(S) { SEA.glossPatch(S, [[-36, -142], [-30, -158], [-16, -165], [-3, -163], [-4, -150], [-20, -147], [-32, -139]], { clip: GU_HEAD, smile: [-19, -155, 8], seed: 7, chrome: true }); } },
      { id: 'jaw', box: [-66, -132, -26, -112], parent: 'head', pivot: [-32, -126], xf: (K) => ({ rot: K.mouth === 'open' ? -0.55 : K.mouth === 'grit' ? -0.12 : -0.3 }),
        draw(S) { S.cel([[-31, -128], [-48, -126], [-62, -122], [-52, -116], [-38, -116], [-30, -120]], shade(GU.beak, 0.08), { depth: 2, tension: 0.6, decor: (g) => { g.fillStyle = C1.tomato; g.beginPath(); g.arc(-50, -120, 2.4, 0, TAU); g.fill(); } }); } },
      { id: 'beak', box: [-76, -146, -26, -122], parent: 'head', pivot: [-32, -128], xf: (K) => ({ rot: K.mouth === 'open' ? 0.08 : 0.04 }),
        draw(S) { S.cel([[-30, -142], [-48, -140], [-64, -134], [-72, -127, 1], [-60, -128], [-44, -129], [-30, -130]], GU.beak, { depth: 3, tension: 0.65 }); } },
      { id: 'face', box: [-38, -156, 8, -124], parent: 'head', pivot: [-12, -140], face: true,
        draw(S, state) {
          const f = faceOf(state), iris = ['#2b2f55', '#c08a1a'];
          S.eye(-22, -140, 13, f.ey, { iris, side: -1, look: [-0.5, 0], lid: GU.white }); S.eye(-3, -141, 11, f.ey, { iris, side: 1, look: [-0.5, 0], lid: GU.white });
          const cross = f.ey === 'angry' || f.ey === 'hurt';
          S.brow(-23, -153, 11, cross ? 0.7 : -0.3, -1); S.brow(-3, -154, 9, cross ? 0.7 : -0.3, 1);
          S.blush(-14, -127, 7);
        } },
      ...arm2({
        id: 'armF', parent: 'body', sh: [-8, -112], el: [4, -100], wrist: [12, -88], w: [17, 15, 12], hr: 32, boxF: [-6, -112, 80, -20], bend: -2, color: GU.slate,
        a1: (K, t) => ({ rot: 0.06 * sin(t * 2) + 2.9 * K.wind + 0.5 * K.strike + 1.6 * K.guard - 0.2 * K.hurt + 2.2 * K.buff }),
        a2: (K, t) => ({ rot: 0.08 * sin(t * 2.4) + 0.4 * K.wind + 0.6 * K.strike + 0.6 * K.guard }),
        hand: (S, x, y) => { [-0.35, -0.05, 0.25, 0.55].forEach((a, i) => gullFeather(S, x, y, 0.95 + a, 52 - Math.abs(a) * 14, 15, i % 2 ? GU.slateDk : GU.slate, GU.tip)); S.blob(x, y, 8, 8, GU.slate, { depth: 2, line: S.lw * 0.8 }); },
      }),
      { id: 'song', parent: 'root', live(ctx, st) {
        const K = st.K, t = st.t, m = st.m;
        if (K.pose === 'attack' || K.pose === 'telegraph') {
          const a = K.pose === 'attack' ? K.strike : K.alert * 0.6;
          ctx.save(); ctx.globalAlpha *= 0.75 * a; ctx.lineCap = 'round';
          for (let i = 0; i < 5; i++) { const y = -60 - i * 20, x0 = 40 + ((t * 300 + i * 40) % 60); ctx.beginPath(); ctx.moveTo(x0, y); ctx.quadraticCurveTo(x0 + 20, y - 5, x0 + 46, y + 2); ctx.strokeStyle = NAVY; ctx.lineWidth = 4; ctx.stroke(); ctx.strokeStyle = '#e8eeff'; ctx.lineWidth = 2; ctx.stroke(); }
          ctx.restore();
        }
        // the one perfect note it will not stop singing
        for (let i = 0; i < 2; i++) { const ph = (t * 0.45 + i * 0.5) % 1; tk.note(ctx, -82 - ph * 22, -128 - ph * 40, 8 + i, { kind: i ? 'beamed' : 'eighth', color: i ? C1.sky : NAVY, alpha: sin(PI * ph) * 0.9 * m, rot: 0.2 * sin(ph * 6), line: 1.5 }); }
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // bamboo_sprite: the PEA POD (Creature, s). A curved green pod standing on two stubby stalk legs, split open along the top to show three round
  // pea faces singing in close harmony; they pop peas out like tiny cannons. Gloss patch: on the front lip of the pod. Keeps the BAMBOO SPRITE
  // rig: the small pack-friendly body, the two swinging arms (now curly tendrils) and the flurry (now the pea volley).
  // ---------------------------------------------------------------------------------------------------------------
  const PP = { pod: '#4fb34a', podDk: '#3d9440', inner: '#c9f29a', pea: '#8fdc4f', leg: '#3d9440' };
  const PP_LIP = [[-56, -60, 1], [-46, -43], [-24, -32], [6, -29], [32, -34], [50, -46], [58, -62, 1], [40, -52], [16, -48], [-10, -48], [-34, -50]];
  const curl = (S, x, y, r, col) => { const pts = []; for (let i = 0; i <= 10; i++) { const a = i / 10 * TAU * 1.2, rr = r * (1 - i / 14); pts.push([x + cos(a) * rr, y + sin(a) * rr]); } S.ln(pts, { w: 2.6, color: col, taper: 0.3 }); };
  define({
    id: 'bamboo_sprite', size: 's', acc: '#d8ffa8', lunge: 34, alertColor: C1.lemon,
    col: {},
    hitAt: [0, -60], alertAt: [0, -76], hitBone: 'body', alertBone: 'body', buffBone: 'body', guardBone: 'body',
    arc: { bone: 'body', x: -20, y: -66, r: 48, a0: -1.3, a1: -4.2, w: 10, color: '#e8ffb0' },
    bounds: { w: 124, h: 85, head: { x: -2, y: -76 }, body: { x: 0, y: -48 }, feet: { x: 0, y: 0 } },
    dieBox: [-62, -112, 66, 0], glossAt: [37, -45], glossBone: 'lip', glossR: 10,
    tweak(K, pose, t) { if (pose === 'idle') K.by = -3.5 * Math.abs(sin(t * 4.1)); },
    parts: [
      ...arm2({
        id: 'armB', parent: 'body', sh: [36, -50], el: [46, -46], wrist: [52, -36], w: [5, 4.5, 4], hr: 9, bend: -1, color: PP.podDk,
        a1: (K, t) => ({ rot: 0.12 * sin(t * 3.1 + 1) + 0.9 * K.wind + 0.3 * K.strike + 0.6 * K.guard - 0.6 * K.buff }),
        a2: (K, t) => ({ rot: 0.14 * sin(t * 3.4 + 1) + 0.6 * K.wind + 0.4 * K.strike + 1.4 * K.guard }),
        hand: (S, x, y) => curl(S, x + 2, y + 2, 4.5, PP.podDk),
      }),
      { id: 'legB', box: [2, -34, 26, 2], parent: 'body', pivot: [12, -30], xf: (K, t) => ({ rot: 0.1 * sin(t * 4.1 + 2) }),
        draw(S) { S.limb([[12, -32], [13, -16], [12, -6]], shade(PP.leg, 0.08), 7, 6.5); S.cel(ell(14, -3, 7, 4, 12), shade(PP.leg, 0.12), { depth: 1.2 }); } },
      { id: 'body', box: [-60, -70, 62, -26], parent: 'root', pivot: [0, -30],
        xf: (K, t, st) => ({ sy: 1 + 0.03 * sin(t * 3.2) * st.m - 0.04 * K.guard, sx: 1 - 0.018 * sin(t * 3.2) * st.m }),
        draw(S) {
          S.cel([[-56, -60, 1], [-46, -43], [-24, -32], [6, -29], [32, -34], [50, -46], [58, -62, 1], [44, -64], [20, -66], [-10, -66], [-36, -65]], PP.podDk, { depth: 5 });
          S.fill(ell(1, -58, 50, 6, 18), PP.inner);
        } },
      { id: 'face', box: [-42, -84, 44, -44], parent: 'body', pivot: [0, -60], face: true,
        draw(S, state) {
          // three peas singing in close harmony: the middle one a little higher, every mouth open on the note
          const f = faceOf(state), iris = ['#2b2f55', '#3f8a2a'];
          [[-26, -58, 0], [1, -63, 1], [28, -58, 2]].forEach((p) => {
            S.cel(ell(p[0], p[1], 13, 13, 16), PP.pea, { depth: 3.5 });
            S.shine([[p[0] + 4, p[1] - 10], [p[0] + 9, p[1] - 6]], 2.2, 0.85);
            S.eye(p[0] - 5, p[1] - 3, 6.5, f.ey, { iris, side: -1, kind: f.ey === 'open' && p[2] === 1 ? 'sleepy' : 'round', lid: PP.pea });
            S.eye(p[0] + 4, p[1] - 3.5, 6, f.ey, { iris, side: 1, kind: f.ey === 'open' && p[2] === 1 ? 'sleepy' : 'round', lid: PP.pea });
            S.mouth(p[0], p[1] + 5, 6, f.mo === 'open' ? 'O' : f.mo === 'grit' ? 'grit' : p[2] === 1 ? 'O' : 'sing');
          });
        } },
      { id: 'lip', box: [-60, -66, 62, -24], parent: 'body', pivot: [0, -40],
        draw(S) { S.cel(PP_LIP, PP.pod, { depth: 5, decor: (g) => { g.strokeStyle = rgba(shade(PP.pod, 0.25), 0.8); g.lineWidth = 1.4; g.beginPath(); g.moveTo(-44, -46); g.quadraticCurveTo(4, -36, 48, -50); g.stroke(); } }); S.shine([[-30, -44], [-4, -38], [20, -40]], 2.6, 0.75); } },
      { id: 'gloss', gloss: true, box: [22, -58, 54, -32], parent: 'lip', pivot: [37, -45],
        draw(S) { SEA.glossPatch(S, [[26, -50], [44, -54], [52, -48], [40, -37], [27, -39]], { clip: PP_LIP, smile: [37, -45, 7], seed: 8 }); } },
      { id: 'legF', box: [-26, -34, 0, 2], parent: 'body', pivot: [-12, -30], xf: (K, t) => ({ rot: -0.1 * sin(t * 4.1) }),
        draw(S) { S.limb([[-12, -32], [-13, -16], [-12, -6]], PP.leg, 7.5, 7); S.cel(ell(-14, -3, 7.5, 4, 12), shade(PP.leg, 0.06), { depth: 1.2 }); } },
      { id: 'crown', box: [44, -104, 82, -54], parent: 'body', pivot: [56, -60],
        xf: (K, t, st) => ({ rot: 0.08 * sin(t * 3.3) * st.m + 0.16 * K.wind - 0.16 * K.strike }),
        draw(S) {
          // the stem end: a little calyx, a leaf and a curly tendril
          S.cel([[50, -56], [60, -66], [70, -60], [62, -54]], PP.podDk, { depth: 1.5, tension: 0.5 });
          S.tube([[60, -64], [64, -78], [60, -88]], 5, 4, PP.podDk, { depth: 1 });
          curl(S, 57, -92, 6, PP.podDk);
          S.cel([[64, -76], [76, -86], [80, -74], [70, -70]], PP.pea, { depth: 1.5, tension: 0.6 });
        } },
      ...arm2({
        id: 'armF', parent: 'body', sh: [-34, -50], el: [-46, -46], wrist: [-52, -34], w: [5.5, 5, 4.5], hr: 9, bend: 1, color: PP.pod,
        a1: (K, t) => ({ rot: 0.12 * sin(t * 3.1) + 2.7 * K.wind + 0.6 * K.strike + 0.9 * K.guard + 1.2 * K.buff }),
        a2: (K, t) => ({ rot: 0.14 * sin(t * 3.4) + 0.4 * K.wind + 0.7 * K.strike + 1.7 * K.guard }),
        hand: (S, x, y) => curl(S, x - 2, y + 2, 5, PP.pod),
      }),
      { id: 'volley', parent: 'body', live(ctx, st) {
        const K = st.K, t = st.t, m = st.m;
        // Pea Volley: three peas popped out of the singing mouths; idle: the harmony drifting up as little notes
        if (K.pose === 'attack' && K.strike > 0.02) {
          const u = clamp((st.pt * 1000 - 100) / 250, 0, 1);
          [[-26, -53], [1, -58], [28, -53]].forEach((p, i) => { const x = p[0] - u * (90 + i * 22), y = p[1] - sin(PI * u) * (26 + i * 6); if (u > 0 && u < 1) { ctx.save(); ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fillStyle = PP.pea; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = NAVY; ctx.stroke(); ctx.restore(); FX.bit(ctx, 'puff', p[0] - 10, p[1], 4 * (1 - u), 0, 0.8 * (1 - u)); } });
        }
        for (let i = 0; i < 3; i++) { const ph = (t * 0.4 + i / 3) % 1; tk.note(ctx, -26 + i * 27 + sin(ph * 6 + i) * 4, -74 - ph * 34, 6, { kind: i === 1 ? 'beamed' : 'eighth', color: i === 1 ? C1.cherry : NAVY, alpha: sin(PI * ph) * 0.85 * m, rot: 0.2 * sin(ph * 5), line: 1.3 }); }
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // mushroom_folk: the JINGLE MACHINE (Creature, m). A lemon-yellow seaside vending machine on stubby legs, a glowing window full of fruit cans
  // and smoothie bottles, a coin-slot mouth, a speaker grille puffing out little floating jingle notes; a layer of bubble wrap appears on its
  // guard and buff. Gloss patch: the lower side panel. Keeps the MUSHROOM FOLK rig: the swaying cap (now the sign header with the face), the live
  // spore puffs (now jingle notes) and the thickening cap (now the bubble wrap).
  // ---------------------------------------------------------------------------------------------------------------
  const JM = { body: C1.lemon, panel: C1.sky, button: '#ff4d6d', glass: '#fff1c4', leg: '#34407e', mitt: C1.sky };
  const JM_CAB = rrectPts(-42, -128, 84, 100, 14);
  define({
    id: 'mushroom_folk', size: 'm', acc: '#fff1c4', lunge: 26, alertColor: C1.lemon,
    col: {},
    hitAt: [0, -96], alertAt: [0, -158], hitBone: 'body', alertBone: 'cap', buffBone: 'body', guardBone: 'body',
    arc: { bone: 'body', x: 4, y: -140, r: 70, a0: -0.9, a1: -4.0, w: 14, color: '#fff1c4' },
    bounds: { w: 156, h: 186, head: { x: 0, y: -150 }, body: { x: 0, y: -80 }, feet: { x: 0, y: 0 } },
    dieBox: [-64, -190, 64, 0], glossAt: [28, -37], glossBone: 'body', glossR: 12,
    parts: [
      { id: 'legB', box: [2, -36, 30, 2], parent: 'root', pivot: [14, -30], xf: (K, t) => ({ rot: 0.03 * sin(t * 2.4 + 2) }),
        draw(S) { S.limb([[14, -32], [15, -12]], shade(JM.leg, 0.06), 11, 10); S.cel(ell(17, -5, 11, 5.5, 12), shade(JM.mitt, 0.1), { depth: 1.5 }); } },
      ...arm2({
        id: 'armB', parent: 'body', sh: [38, -102], el: [50, -92], wrist: [54, -76], w: [9, 8.5, 8], hr: 10, bend: -1.5, color: shade(JM.body, 0.1),
        a1: (K, t) => ({ rot: 0.04 * sin(t * 1.8 + 1) - 0.2 * K.strike + 0.1 * K.guard - 0.7 * K.buff }),
        a2: (K, t) => ({ rot: 0.06 * sin(t * 2.1 + 1) - 0.3 * K.buff }),
        hand: (S, x, y) => S.blob(x, y + 2, 7, 6.5, shade(JM.mitt, 0.08), { depth: 1.5, line: S.lw * 0.8 }),
      }),
      { id: 'body', box: [-46, -132, 46, -24], parent: 'root', pivot: [0, -30],
        xf: (K, t, st) => ({ sy: 1 + 0.02 * sin(t * 2) * st.m - 0.03 * K.guard, sx: 1 - 0.01 * sin(t * 2) * st.m, rot: 0.03 * sin(t * 1.4) * st.m - 0.12 * K.strike + 0.06 * K.wind + 0.05 * K.hurt }),
        draw(S) {
          S.cel(JM_CAB, JM.body, { depth: 8, tension: 0.5, decor: (g) => {
            // the glowing window and its two shelves of fruit cans and smoothie bottles
            const gr = g.createLinearGradient(0, -118, 0, -56); gr.addColorStop(0, '#fffaf0'); gr.addColorStop(1, JM.glass);
            g.fillStyle = gr; g.beginPath(); tk.trace(g, rrectPts(-34, -118, 50, 64, 6)); g.fill();
            g.fillStyle = rgba(NAVY, 0.35); g.fillRect(-34, -88, 50, 2); g.fillRect(-34, -60, 50, 2);
            const cans = [C1.tomato, C1.mint, C1.sky, C1.cherry], bott = [C1.cherry, '#ffb84d', C1.mint, '#b48cff'];
            cans.forEach((c, i) => { const x = -30 + i * 11.5; g.fillStyle = c; g.fillRect(x, -102, 8, 13); g.fillStyle = '#ffffff'; g.fillRect(x + 1.5, -98, 2, 7); g.strokeStyle = NAVY; g.lineWidth = 1; g.strokeRect(x, -102, 8, 13); });
            bott.forEach((c, i) => { const x = -29 + i * 11.5; g.fillStyle = c; g.beginPath(); tk.trace(g, rrectPts(x, -80, 8, 19, 3)); g.fill(); g.strokeStyle = NAVY; g.lineWidth = 1; g.stroke(); g.fillStyle = '#ffffff'; g.fillRect(x + 2, -85, 4, 5); g.strokeRect(x + 2, -85, 4, 5); });
            g.strokeStyle = NAVY; g.lineWidth = 2; g.beginPath(); tk.trace(g, rrectPts(-34, -118, 50, 64, 6)); g.stroke();
            g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.moveTo(6, -116); g.lineTo(14, -116); g.lineTo(-10, -56); g.lineTo(-18, -56); g.closePath(); g.fill();
            // the dispenser flap
            g.fillStyle = '#4a3a5a'; g.beginPath(); tk.trace(g, rrectPts(-32, -48, 46, 11, 4)); g.fill();
          } });
          [-112, -102, -92, -82].forEach((y, i) => S.blob(29, y, 4, 4, i === 1 ? C1.mint : JM.button, { depth: 1, line: S.lw * 0.7 }));
          S.cel(ell(28, -60, 10, 10, 14), JM.panel, { depth: 2, decor: (g) => { g.fillStyle = rgba(NAVY, 0.7); [[-4, -4], [4, -4], [0, 0], [-4, 4], [4, 4], [0, -7], [0, 7], [-7, 0], [7, 0]].forEach((d) => { g.beginPath(); g.arc(28 + d[0], -60 + d[1], 1.2, 0, TAU); g.fill(); }); } });
        } },
      { id: 'gloss', gloss: true, box: [14, -50, 44, -26], parent: 'body', pivot: [28, -37],
        draw(S) { SEA.glossPatch(S, [[18, -47], [40, -47], [42, -30], [18, -30]], { clip: JM_CAB, smile: [29, -38, 8], seed: 9 }); } },
      { id: 'legF', box: [-30, -36, -2, 2], parent: 'root', pivot: [-14, -30], xf: (K, t) => ({ rot: -0.03 * sin(t * 2.4) }),
        draw(S) { S.limb([[-14, -32], [-15, -12]], JM.leg, 11.5, 10.5); S.cel(ell(-17, -5, 11, 5.5, 12), JM.mitt, { depth: 1.5 }); } },
      ...arm2({
        id: 'armF', parent: 'body', sh: [-38, -102], el: [-52, -92], wrist: [-58, -76], w: [9.5, 9, 8.5], hr: 10, bend: 1.5, color: JM.body,
        a1: (K, t) => ({ rot: 0.06 * sin(t * 1.8) + 2.5 * K.wind + 0.6 * K.strike + 0.9 * K.guard + 1.4 * K.buff }),
        a2: (K, t) => ({ rot: 0.1 * sin(t * 2.1) + 0.4 * K.wind + 0.7 * K.strike + 1.8 * K.guard }),
        hand: (S, x, y) => S.blob(x, y + 2, 7.5, 7, JM.mitt, { depth: 1.5, line: S.lw * 0.8 }),
      }),
      { id: 'cap', box: [-50, -178, 50, -118], parent: 'body', pivot: [0, -126],
        xf: (K, t, st) => ({ rot: 0.05 * sin(t * 1.6 + 0.4) * st.m - 0.2 * K.strike + 0.08 * K.wind, dy: -3 * K.wind + 2 * K.guard, dx: -10 * K.strike, sy: 1 - 0.06 * K.guard, sx: 1 + 0.06 * K.guard }),
        draw(S) {
          S.cel(rrectPts(-46, -174, 92, 50, 16), JM.panel, { depth: 6, decor: (g) => { g.strokeStyle = C1.lemon; g.lineWidth = 3; g.beginPath(); tk.trace(g, rrectPts(-40, -168, 80, 38, 11)); g.stroke(); } });
        } },
      { id: 'face', box: [-34, -168, 32, -126], parent: 'cap', pivot: [0, -150], face: true,
        draw(S, state) {
          const f = faceOf(state), iris = ['#2b2f55', '#e0a020'];
          S.eye(-15, -155, 14, f.ey, { iris, side: -1, lid: JM.panel }); S.eye(14, -155, 14, f.ey, { iris, side: 1, lid: JM.panel });
          S.blush(-26, -142, 8); S.blush(25, -142, 8);
          // the coin-slot mouth: a smiling slot, wide open for the jingle, clenched on the wind-up
          if (f.mo === 'open') { S.cel(rrectPts(-11, -142, 22, 12, 5), C1.mouth, { shadow: false, hi: false, line: S.lw * 0.8 }); S.fill(ell(0, -132, 6, 2.6, 10), C1.tongue); }
          else if (f.mo === 'grit') { S.cel(rrectPts(-11, -140, 22, 6, 2.5), '#ffffff', { shadow: false, hi: false, line: S.lw * 0.8, decor: (g) => { g.strokeStyle = NAVY; g.lineWidth = 1; [-4, 0, 4].forEach((x) => { g.beginPath(); g.moveTo(x, -140); g.lineTo(x, -134); g.stroke(); }); } }); }
          else { const g = S.g; g.save(); g.beginPath(); g.moveTo(-11, -141); g.quadraticCurveTo(0, -133, 11, -141); g.lineCap = 'round'; g.strokeStyle = NAVY; g.lineWidth = 5.4; g.stroke(); g.strokeStyle = '#3a2a3a'; g.lineWidth = 2.6; g.stroke(); g.restore(); }
        } },
      { id: 'wrap', parent: 'body', live(ctx, st) {
        const K = st.K, a = Math.max(K.buff, K.guard * 0.9, K.alert * 0.35);
        if (a < 0.03) return;
        // Bubble Wrap: a layer of air bubbles over the cabinet
        ctx.save(); ctx.globalAlpha *= cA(a);
        for (let y = -122; y <= -34; y += 13) for (let x = -36 + ((y / 13) & 1) * 6; x <= 36; x += 12) {
          ctx.beginPath(); ctx.arc(x, y, 5.2, 0, TAU); ctx.fillStyle = 'rgba(240,250,255,0.42)'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = rgba(NAVY, 0.4); ctx.stroke();
          ctx.beginPath(); ctx.arc(x - 1.6, y - 1.8, 1.4, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
        }
        ctx.restore();
      } },
      { id: 'jingle', parent: 'body', live(ctx, st) {
        const K = st.K, t = st.t, m = st.m, burst = K.pose === 'attack' ? K.strike : K.alert * 0.6;
        // the jingle puffing out of the speaker grille, and a burst of it on Catchy Jingle
        for (let i = 0; i < 3; i++) { const ph = (t * 0.42 + i / 3) % 1; tk.note(ctx, 34 + ph * 30 + sin(ph * 6 + i) * 5, -64 - ph * 64, 7 + (i % 2), { kind: i === 1 ? 'beamed' : 'eighth', color: [C1.tomato, C1.sky, NAVY][i], alpha: sin(PI * ph) * 0.9 * m, rot: 0.25 * sin(ph * 5 + i), line: 1.5 }); }
        if (burst > 0.05) for (let i = 0; i < 5; i++) { const u = (t * 1.6 + i / 5) % 1; tk.note(ctx, -44 - u * 70, -120 + i * 16 - u * 10, 9, { kind: i % 2 ? 'beamed' : 'eighth', color: [C1.tomato, C1.sky, C1.cherry][i % 3], alpha: burst * sin(PI * u), rot: -0.3, line: 1.7 }); }
      } },
      { id: 'bulbs', parent: 'cap', live(ctx, st) {
        const K = st.K, t = st.t, pts = [];
        for (let i = 0; i < 7; i++) pts.push([-36 + i * 12, -174]);
        SEA.fairyBulbs(ctx, pts, t * (1 + K.alert), 0.55 + 0.45 * Math.max(K.buff, K.alert, K.strike), { r: 3 });
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // bamboo_boar: the RUNAWAY MELON (Creature, l). A prize watermelon off the Snack Pier on stubby legs, with a determined frown, a blue first-prize
  // rosette pinned on and grass stains; its rind turns glossy and sparkly as Sequins stack, and it tips forward and rolls on the heavy. Gloss
  // patch: a smooth pastel panel high on its back. Keeps the BAMBOO BOAR rig: the charger's wind-up and the plate layers (now the rind sparkle).
  // ---------------------------------------------------------------------------------------------------------------
  const RM = { rind: '#2f8f4e', stripe: '#9be060', legN: '#3fa05a', legF: '#2a6a3e', shoe: C1.cream, rosette: '#3d7bff', stem: '#6a8a2a' };
  const RM_SHAPE = ell(0, -108, 116, 96, 32);
  function melonLeg(id, x, near) {
    return { id, box: [x - 22, -48, x + 24, 4], parent: 'root', pivot: [x, -40],
      xf: (K, t, st) => ({ rot: 0.03 * sin(t * 2 + x) + (near ? 0.25 : -0.2) * K.strike * (x < 0 ? 1 : -1) + 0.15 * sin(t * 12 + x) * K.alert * st.m }),
      draw(S) { const c = near ? RM.legN : RM.legF; S.limb([[x, -44], [x + 1, -24], [x, -10]], c, 18, 16); S.cel(ell(x - 4, -5, 14, 6, 14), near ? RM.shoe : shade(RM.shoe, 0.12), { depth: 2 }); } };
  }
  define({
    id: 'bamboo_boar', size: 'l', acc: '#d8ffb0', lunge: 86, alertColor: '#ffb340', ox: 26,
    col: {},
    hitAt: [-60, -120], alertAt: [-60, -150], hitBone: 'body', alertBone: 'body', buffBone: 'body', guardBone: 'body',
    tweak(K) { K.bsy *= 1 - 0.05 * K.wind; K.brot -= 0.04 * K.wind; K.bsx *= 1 + 0.03 * K.wind; },
    arc: { bone: 'body', x: -130, y: -96, r: 44, a0: 1.7, a1: 4.4, w: 14, color: '#e8ffb0' },
    bounds: { w: 300, h: 294, head: { x: -34, y: -140 }, body: { x: 26, y: -108 }, feet: { x: 0, y: 0 } },
    dieBox: [-96, -296, 150, 0], glossAt: [80, -156], glossBone: 'body', glossR: 18,
    parts: [
      melonLeg('legBB', 62, false),
      melonLeg('legBF', -54, false),
      { id: 'body', box: [-120, -208, 120, -8], parent: 'root', pivot: [0, -108],
        xf: (K, t, st) => ({ sy: 1 + 0.02 * sin(t * 1.9) * st.m - 0.04 * K.guard, sx: 1 - 0.01 * sin(t * 1.9) * st.m + 0.03 * K.guard, rot: 0.12 * K.wind - 1.25 * K.strike + 0.05 * sin(t * 9) * K.alert * st.m }),
        draw(S) {
          S.cel(RM_SHAPE, RM.rind, { depth: 14, decor: (g) => {
            // lime stripes following the round of the melon, each with a wavy edge
            [-0.78, -0.48, -0.17, 0.14, 0.44, 0.74].forEach((sk, k) => {
              const L = [], R = [];
              for (let i = 0; i <= 16; i++) {
                const u = i / 16, y = -204 + 192 * u, hw = 116 * Math.sqrt(Math.max(0, 1 - Math.pow((y + 108) / 96, 2))), cx = hw * sk, w = hw * 0.1 + 2;
                const wv = 2.5 * sin(u * 18 + k);
                L.push([cx - w + wv, y]); R.push([cx + w + wv, y]);
              }
              g.beginPath(); tk.trace(g, { poly: L.concat(R.reverse()) }); g.fillStyle = RM.stripe; g.fill();
            });
            // grass stains low on the rind
            g.fillStyle = 'rgba(122,138,58,0.45)'; [[-60, -34, 16, 6], [10, -20, 20, 5]].forEach((s) => { g.beginPath(); g.ellipse(s[0], s[1], s[2], s[3], -0.2, 0, TAU); g.fill(); });
          } });
          S.shine([[44, -186], [76, -166], [96, -136]], 6, 0.75);
        } },
      { id: 'gloss', gloss: true, box: [54, -184, 104, -136], parent: 'body', pivot: [80, -156],
        draw(S) { SEA.glossPatch(S, [[58, -176], [84, -170], [100, -150], [88, -140], [64, -150]], { clip: RM_SHAPE, smile: [79, -157, 10], seed: 10 }); } },
      { id: 'stem', box: [-12, -300, 80, -192], parent: 'body', pivot: [8, -200],
        xf: (K, t, st) => ({ rot: 0.05 * sin(t * 1.3) * st.m + 0.06 * K.wind - 0.05 * K.strike }),
        draw(S) {
          // the prize melon's tall curly stem, a big lobed leaf and a tendril
          S.tube([[6, -200], [8, -224], [18, -246]], 11, 8, RM.stem, { depth: 2 });
          S.cel([[18, -244], [24, -268], [40, -286], [58, -292], [72, -282], [70, -262], [76, -252], [60, -246], [40, -244]], '#5fbf4a', { depth: 4, tension: 0.6, decor: (g) => { g.strokeStyle = rgba('#2f6a2a', 0.8); g.lineWidth = 1.4; g.beginPath(); g.moveTo(20, -246); g.quadraticCurveTo(44, -262, 62, -282); g.moveTo(42, -262); g.lineTo(58, -256); g.moveTo(34, -256); g.lineTo(38, -276); g.stroke(); } });
          curl(S, -2, -236, 8, RM.stem);
        } },
      { id: 'rosette', box: [36, -138, 92, -66], parent: 'body', pivot: [62, -112],
        xf: (K, t, st) => ({ rot: 0.06 * sin(t * 2.2) * st.m + 0.2 * K.strike }),
        draw(S) {
          // the blue first-prize rosette: two ribbon tails, a scalloped disc and a lemon centre (no lettering)
          S.cel([[54, -108], [62, -108], [58, -74], [54, -80, 1], [48, -76, 1]], shade(RM.rosette, 0.1), { depth: 1.5, tension: 0.2 });
          S.cel([[62, -108], [70, -108], [76, -76, 1], [70, -80, 1], [66, -74]], RM.rosette, { depth: 1.5, tension: 0.2 });
          const sc = []; for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, r = i % 2 ? 17 : 21; sc.push([62 + cos(a) * r, -112 + sin(a) * r]); }
          S.cel(sc, RM.rosette, { depth: 3, tension: 0.6 });
          S.blob(62, -112, 10, 10, C1.lemon, { depth: 2 });
          S.shine([[58, -118], [62, -120]], 2, 0.9);
        } },
      melonLeg('legNB', 40, true),
      melonLeg('legNF', -38, true),
      { id: 'face', box: [-100, -156, -18, -78], parent: 'body', pivot: [-58, -120], face: true,
        draw(S, state) {
          const f = faceOf(state), iris = ['#2b2f55', '#4f8a3a'];
          S.eye(-76, -124, 22, f.ey, { iris, side: -1, lid: RM.rind, look: [-0.5, 0] }); S.eye(-40, -128, 20, f.ey, { iris, side: 1, lid: RM.rind, look: [-0.5, 0] });
          // the determined frown: brows down hard even when it is calm
          const soft = f.ey === 'happy' || f.ey === 'wide';
          S.brow(-76, -144, 20, soft ? -0.2 : 0.8, -1, { color: '#173f24' }); S.brow(-40, -149, 18, soft ? -0.2 : 0.8, 1, { color: '#173f24' });
          S.blush(-92, -104, 12); S.blush(-28, -110, 11);
          S.mouth(-60, -98, 20, f.mo === 'open' ? 'happyOpen' : f.mo === 'grit' ? 'grit' : 'frown');
        } },
      { id: 'sparkle', parent: 'body', live(ctx, st) {
        const K = st.K, t = st.t, m = st.m, k = clamp(Math.max(K.guard, K.buff) + 0.25, 0, 1.2);
        // Toughen Up: the rind goes glossy and sparkly
        if (K.guard > 0.05 || K.buff > 0.05) { ctx.save(); ctx.globalAlpha *= cA(0.5 * Math.max(K.guard, K.buff)); ctx.beginPath(); ctx.ellipse(10, -140, 80, 34, -0.2, PI * 1.05, PI * 1.9); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.stroke(); ctx.restore(); }
        for (let i = 0; i < 4; i++) { const ph = (t * 0.5 + i / 4) % 1; tk.sparkle(ctx, -70 + i * 50 + sin(i * 3) * 10, -170 + (i % 2) * 70 - ph * 10, (4 + 3 * (i % 2)) * k, { color: i % 2 ? '#ffffff' : '#eaffc8', alpha: sin(PI * ph) * m, glow: 0.4, rot: ph }); }
      } },
      { id: 'dust', parent: 'root', live(ctx, st) {
        const K = st.K, t = st.t, m = st.m, k = K.alert * 0.8 + (K.pose === 'attack' ? K.strike : 0);
        if (k < 0.03) return;
        // a wobble at the top of the hill, then the roll: dust puffs kick up behind it
        for (let i = 0; i < 5; i++) { const ph = (t * 1.8 + i / 5) % 1; FX.bit(ctx, 'puff', 92 + ph * 22 + (i % 2) * 4, -10 - ph * 24, 5 + ph * 7, 0, k * (1 - ph) * m, '#fff3dc'); }
        if (K.pose === 'attack') FX.dust(ctx, -96, -4, clamp((st.pt * 1000 - 150) / 270, 0, 1), 1.4);
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // oni_brute: the ONE-HIT JUKEBOX (Rival, l). A big chrome-and-walnut jukebox on short sturdy legs, swinging a mic stand like a club, glowing tube
  // lights in sunset colours, the tone arm as a frowning eyebrow and a coin slot for a nose. Below half HP (phase 1) its tubes flash red and its
  // record spins faster. Gloss patch: the front glass over the record. Keeps the ONI BRUTE rig: the big body, the two club swings, the rage phase.
  // ---------------------------------------------------------------------------------------------------------------
  const JK = { wood: '#b0693c', woodDk: '#8a4a2a', chrome: '#dfe4ee', glove: '#fff8ec', vinyl: '#2a2440', label: '#ff6f8f', gold: C1.lemon };
  const jkTube = (v) => (v === 'r' ? ['#ff8a3d', '#ff3b4a', '#d81e4a'] : ['#ffd84d', '#ff9a3d', '#ff6fa3']);
  const JK_ARCH = [[-60, -172], [-62, -220], [-50, -252], [-26, -272], [0, -278], [26, -272], [50, -252], [62, -220], [60, -172]];
  const JK_GLASS = [[-36, -214], [-38, -238], [-28, -256], [-4, -263], [20, -256], [30, -238], [28, -214]];
  // a vertical light tube filled with the sunset ramp (or the red of the rage)
  function jkTubeRect(g, x, y0, w, y1, v) {
    const c = jkTube(v), gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, c[0]); gr.addColorStop(0.5, c[1]); gr.addColorStop(1, c[2]);
    g.fillStyle = gr; g.beginPath(); tk.trace(g, rrectPts(x, y0, w, y1 - y0, w / 2)); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(x + w * 0.25, y0 + 4, w * 0.18, y1 - y0 - 8);
    g.strokeStyle = NAVY; g.lineWidth = 2; g.beginPath(); tk.trace(g, rrectPts(x, y0, w, y1 - y0, w / 2)); g.stroke();
  }
  const jkGlove = (S, x, y, dark) => {
    const c = dark ? shade(JK.glove, 0.1) : JK.glove;
    S.cel(rrectPts(x - 12, y - 12, 18, 9, 3), JK.chrome, { depth: 1.5, tension: 0.3, hi: false });
    S.blob(x - 2, y + 6, 17, 15, c, { depth: 4 });
    [-1, 0, 1].forEach((k) => S.ln([[x + k * 8 - 3, y - 2], [x + k * 9, y + 14]], { w: 1.5, color: shade(c, 0.2), taper: 0.4 }));
  };
  define({
    id: 'oni_brute', size: 'l', acc: '#ffd6a0', lunge: 74, alertColor: '#ffb340', ox: 12,
    col: {},
    hitAt: [-8, -150], alertAt: [-6, -232], hitBone: 'body', alertBone: 'head', buffBone: 'body', guardBone: 'body',
    arc: { bone: 'body', x: -56, y: -166, r: 92, a0: -1.0, a1: -3.9, w: 20, color: '#ffd6a0' },
    bounds: { w: 252, h: 282, head: { x: 6, y: -226 }, body: { x: 12, y: -128 }, feet: { x: 0, y: 0 } },
    dieBox: [-118, -284, 142, 0], glossAt: [-4, -238], glossBone: 'head', glossR: 24,
    parts: [
      ...arm2({
        id: 'armB', parent: 'body', sh: [56, -164], el: [80, -138], wrist: [70, -104], w: [28, 24, 22], hr: 22, bend: -2, color: JK.woodDk,
        a1: (K, t) => ({ rot: 0.04 * sin(t * 1.6 + 1) - 0.3 * K.wind + 0.2 * K.strike - 0.3 * K.guard - 0.8 * K.buff }),
        a2: (K, t) => ({ rot: 0.06 * sin(t * 1.9 + 1) - 0.2 * K.wind + 0.3 * K.strike - 0.9 * K.guard }),
        hand: (S, x, y) => jkGlove(S, x, y, true),
      }),
      { id: 'legB', box: [6, -90, 60, 4], parent: 'body', pivot: [28, -64], xf: (K, t) => ({ rot: 0.02 * sin(t * 2.2 + 2) }),
        draw(S) { S.limb([[28, -68], [30, -40], [32, -18]], JK.woodDk, 34, 30); S.cel(rrectPts(10, -18, 46, 16, 7), shade(JK.chrome, 0.12), { depth: 3, tension: 0.4 }); } },
      { id: 'legF', box: [-52, -90, 2, 4], parent: 'root', pivot: [-24, -64], xf: (K, t) => ({ rot: -0.02 * sin(t * 2.2) }),
        draw(S) { S.limb([[-24, -68], [-26, -40], [-28, -18]], JK.wood, 36, 32); S.cel(rrectPts(-54, -18, 50, 16, 7), JK.chrome, { depth: 3, tension: 0.4 }); } },
      { id: 'body', box: [-72, -184, 72, -54], parent: 'root', pivot: [0, -66], v: (st) => (st.phase >= 1 ? 'r' : ''),
        xf: (K, t, st) => ({ sy: 1 + 0.018 * sin(t * 1.7) * st.m - 0.03 * K.guard, sx: 1 - 0.01 * sin(t * 1.7) * st.m + 0.03 * K.buff }),
        draw(S, v) {
          S.cel([[-62, -178], [62, -178], [66, -160], [65, -84], [54, -60], [-54, -60], [-65, -84], [-66, -160]], JK.wood, { depth: 12, tension: 0.4, decor: (g) => {
            // the walnut grain, the chrome trim, the row of selector keys and the big lower speaker grille
            g.strokeStyle = rgba(JK.woodDk, 0.55); g.lineWidth = 1.4;
            [[-40, -170, -44, -90], [36, -172, 40, -92]].forEach((l) => { g.beginPath(); g.moveTo(l[0], l[1]); g.quadraticCurveTo(l[0] + 6, (l[1] + l[3]) / 2, l[2], l[3]); g.stroke(); });
            g.fillStyle = JK.chrome; g.fillRect(-70, -178, 140, 7);
            g.fillStyle = '#ffffff'; g.fillRect(-70, -178, 140, 2);
            for (let i = 0; i < 6; i++) { g.fillStyle = i === 2 ? '#ff6fa3' : '#fff6e4'; g.beginPath(); tk.trace(g, rrectPts(-34 + i * 12, -160, 9, 12, 2)); g.fill(); g.strokeStyle = NAVY; g.lineWidth = 1.2; g.stroke(); }
            g.fillStyle = JK.chrome; g.beginPath(); tk.trace(g, rrectPts(-42, -138, 84, 62, 14)); g.fill(); g.strokeStyle = NAVY; g.lineWidth = 2; g.stroke();
            g.strokeStyle = rgba(NAVY, 0.6); g.lineWidth = 2.2; for (let x = -30; x <= 30; x += 10) { g.beginPath(); g.moveTo(x, -130); g.lineTo(x, -84); g.stroke(); }
            jkTubeRect(g, -60, -172, 9, -72, v); jkTubeRect(g, 51, -172, 9, -72, v);
          } });
        } },
      { id: 'head', box: [-66, -282, 66, -166], parent: 'body', pivot: [-6, -176], v: (st) => (st.phase >= 1 ? 'r' : ''),
        xf: (K, t, st) => ({ rot: 0.02 * sin(t * 1.7) + 0.12 * K.wind - 0.16 * K.strike + 0.07 * K.hurt, dy: 1.6 * sin(t * 1.7 + 0.5) * st.m + 3 * K.guard, dx: -12 * K.strike }),
        draw(S, v) {
          // the arched walnut top, its sunset tube arcs, a chrome rim, and the dark recess behind the glass where the record spins
          S.cel(JK_ARCH, JK.wood, { depth: 10, tension: 0.8 });
          const g = S.g, c = jkTube(v);
          g.save(); g.lineCap = 'round';
          [[54, c[2], 9], [46, c[1], 7], [39, c[0], 5]].forEach((a) => { g.beginPath(); g.arc(-2, -212, a[0], PI * 1.02, PI * 1.98); g.strokeStyle = NAVY; g.lineWidth = a[2] + 3.4; g.stroke(); g.strokeStyle = a[1]; g.lineWidth = a[2]; g.stroke(); });
          g.restore();
          S.cel(JK_GLASS, '#3a3456', { depth: 3, hi: false, line: S.lw * 0.8 });
          S.cel(rrectPts(-50, -212, 96, 40, 14), shade(JK.wood, 0.04), { depth: 4, tension: 0.6, line: S.lw * 0.8 });
          S.shine([[-52, -232], [-50, -248], [-42, -260]], 3, 0.7);
        } },
      { id: 'record', parent: 'head', live(ctx, st) {
        // the record behind the glass: a label stripe turning, faster when it is cross
        const t = st.t, m = st.m, sp = (st.phase >= 1 ? 7 : 2.4) * m, a = t * sp;
        ctx.save(); ctx.beginPath(); ctx.arc(-4, -236, 20, 0, TAU); ctx.fillStyle = JK.vinyl; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; [16, 12].forEach((r) => { ctx.beginPath(); ctx.arc(-4, -236, r, a, a + 2.2); ctx.stroke(); });
        ctx.beginPath(); ctx.arc(-4, -236, 7, 0, TAU); ctx.fillStyle = JK.label; ctx.fill();
        ctx.beginPath(); ctx.moveTo(-4 + cos(a) * 7, -236 + sin(a) * 7); ctx.lineTo(-4 - cos(a) * 7, -236 - sin(a) * 7); ctx.strokeStyle = '#fff6e4'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(-4, -236, 1.6, 0, TAU); ctx.fillStyle = NAVY; ctx.fill();
        ctx.restore();
      } },
      { id: 'gloss', gloss: true, box: [-40, -266, 32, -210], parent: 'head', pivot: [-4, -238],
        draw(S) { SEA.glossPatch(S, JK_GLASS, { smile: [-4, -222, 12], seed: 11, alpha: 0.72 }); } },
      { id: 'face', box: [-50, -232, 40, -168], parent: 'head', pivot: [-6, -196], face: true,
        draw(S, state) {
          const f = faceOf(state), iris = ['#2b2f55', '#e0702a'];
          // furious that nobody picks its record: glaring unless startled or delighted
          const ey = f.ey === 'open' ? 'angry' : f.ey;
          S.eye(-26, -198, 18, ey, { iris, side: -1, lid: JK.wood }); S.eye(12, -200, 16, ey, { iris, side: 1, lid: JK.wood });
          // the tone arm as a frowning eyebrow, pivoting on its chrome base
          const soft = f.ey === 'happy' || f.ey === 'wide';
          const tip = soft ? [-40, -222] : [-38, -212];
          S.blob(30, -222, 6, 6, JK.chrome, { depth: 1.5, line: S.lw * 0.8 });
          S.ln([[30, -222], [0, soft ? -222 : -218], [tip[0] + 6, tip[1]]], { w: 6.5, color: NAVY, taper: 0 }); S.ln([[30, -222], [0, soft ? -222 : -218], [tip[0] + 6, tip[1]]], { w: 3.6, color: JK.chrome, taper: 0 });
          S.cel(rrectPts(tip[0] - 4, tip[1] - 4, 12, 9, 2), JK.chrome, { depth: 1, line: S.lw * 0.7, tension: 0.3, hi: false });
          // the coin-slot nose and the grille of a mouth
          S.cel(rrectPts(-13, -195, 12, 14, 3), JK.chrome, { depth: 1.5, line: S.lw * 0.75, tension: 0.4, hi: false }); S.fill(rrectPts(-8.2, -192, 2.4, 8, 1), NAVY);
          S.blush(-40, -186, 10); S.blush(26, -188, 9);
          if (f.mo === 'open') { S.cel(rrectPts(-26, -182, 38, 16, 7), C1.mouth, { shadow: false, hi: false, line: S.lw * 0.8 }); S.fill(ell(-7, -170, 9, 3.4, 10), C1.tongue); S.cel(rrectPts(-24, -182, 34, 5, 2), JK.chrome, { shadow: false, hi: false, line: S.lw * 0.6, tension: 0.3 }); }
          else S.cel(rrectPts(-22, f.mo === 'grit' ? -180 : -178, 30, f.mo === 'grit' ? 8 : 7, 3), JK.chrome, { shadow: false, hi: false, line: S.lw * 0.75, tension: 0.3, decor: (g) => { g.strokeStyle = NAVY; g.lineWidth = 1.2; for (let x = -17; x < 8; x += 5) { g.beginPath(); g.moveTo(x, -181); g.lineTo(x, -170); g.stroke(); } } });
        } },
      { id: 'club', parent: 'armF2', pivot: [-94, -102], box: [-140, -150, -60, 8], xf: (K) => ({ rot: -0.85 * K.strike }),
        draw(S) {
          // the mic stand swung like a club: a gold mic in the fist, a chrome pole, the heavy round base as the club head
          const d = [cos(1.75), sin(1.75)], w = [-94, -102], b = [w[0] + 98 * d[0], w[1] + 98 * d[1]];
          S.tube([[w[0] - 6 * d[0], w[1] - 6 * d[1]], [lerp(w[0], b[0], 0.5), lerp(w[1], b[1], 0.5)], b], 7, 7, JK.chrome, { depth: 2, tension: 0.9 });
          S.cel(ell(b[0], b[1] + 2, 24, 8, 18), shade(JK.chrome, 0.1), { depth: 2.5 });
          S.tube([[w[0] + 2, w[1] - 6], [w[0] + 4, w[1] - 26]], 7, 9, '#2a2f52', { depth: 1.5 });
          S.blob(w[0] + 5, w[1] - 32, 9, 10, JK.gold, { depth: 2.5, decor: (g) => { g.strokeStyle = rgba(NAVY, 0.5); g.lineWidth = 1; [-4, 0, 4].forEach((o) => { g.beginPath(); g.moveTo(w[0] + 5 + o, w[1] - 41); g.lineTo(w[0] + 5 + o, w[1] - 23); g.stroke(); }); } });
        } },
      ...arm2({
        id: 'armF', parent: 'body', sh: [-56, -164], el: [-86, -134], wrist: [-94, -102], w: [30, 26, 24], hr: 22, bend: 3, color: JK.wood, tubeOpts: { bulge: 0.08 },
        a1: (K, t) => ({ rot: 0.04 * sin(t * 1.7) + 2.7 * K.wind + 0.6 * K.strike + 0.9 * K.guard - 0.15 * K.hurt + 0.6 * K.buff }),
        a2: (K, t) => ({ rot: 0.06 * sin(t * 2) + 0.4 * K.wind + 0.7 * K.strike + 1.9 * K.guard }),
        hand: (S, x, y) => jkGlove(S, x, y, false),
      }),
      { id: 'pauldron', parent: 'body', box: [-88, -194, -36, -142], xf: () => ({}),
        draw(S) {
          // an old chrome speaker on the shoulder
          S.cel(ell(-62, -168, 22, 22, 20), JK.chrome, { depth: 4 });
          S.cel(ell(-62, -168, 15, 15, 16), '#4a4466', { depth: 2, line: S.lw * 0.7, hi: false });
          S.blob(-62, -168, 6, 6, shade(JK.chrome, 0.1), { depth: 1, line: S.lw * 0.6 });
          S.shine([[-52, -184], [-46, -176]], 2.4, 0.9);
        } },
      { id: 'rage', parent: 'body', live(ctx, st) {
        const K = st.K, t = st.t, m = st.m, p1 = st.phase >= 1, pl = 0.6 + 0.4 * sin(t * (p1 ? 9 : 2.2)) * m;
        // the tube lights glow (sunset, or flashing red below half), and it sulks into a red-hot rage
        const col = p1 ? '#ff3b4a' : '#ff9a3d';
        [[-56, -150], [-56, -100], [56, -150], [56, -100]].forEach((p) => tk.glow(ctx, p[0], p[1], 26, col, (0.22 + 0.18 * K.alert) * pl));
        if (p1) {
          tk.glow(ctx, 0, -150, 130, '#ff3b4a', 0.14 * pl);
          for (let i = 0; i < 3; i++) { const ph = (t * 0.7 + i / 3) % 1; tk.note(ctx, -70 + i * 70 + sin(ph * 6) * 6, -200 - ph * 60, 10, { kind: i % 2 ? 'beamed' : 'eighth', color: '#ff3b4a', alpha: sin(PI * ph) * m, rot: 0.3 * sin(ph * 9 + i), line: 1.8 }); }
        }
        if (K.pose === 'attack') FX.dust(ctx, -118, -4, clamp((st.pt * 1000 - 150) / 270, 0, 1), 1.4);
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // tengu_duelist: the DANCE-OFF HERON (Rival, l). A tall slate-blue heron in a small top hat and a bow tie, wings folded like a tailcoat, very long
  // legs ending in shiny tap shoes, a silver-tipped cane instead of a sword, a pink carnation; he bows on the telegraph and taps on the strike.
  // Gloss patch: one side of the top hat gone smooth and pastel. Keeps the TENGU DUELIST rig: the bow, the lunge with the long reach, the tailcoat
  // chains, the swaying crest and the blade glow (now the cane tip, flaring below half HP).
  // ---------------------------------------------------------------------------------------------------------------
  const HR = { slate: '#7a90c4', slateDk: '#5f73a6', white: '#fbfaf6', beak: '#ffb84d', leg: '#e0b45a', shoe: '#2a2f52', tap: '#dfe4ee', hat: '#2f3a7a', band: '#ff7eb6', bow: C1.tomato, cane: '#34407e', glove: '#fff8ec' };
  const HR_HAT = [[-52, -270], [-48, -276], [-44, -300], [-18, -304], [-14, -278], [-8, -272], [-26, -268]];
  const HR_BODY = ell(8, -158, 46, 32, 22, -0.3);
  function tapShoe(S, x, y, dir, dark) {
    S.cel([[x + dir * 14, y - 10], [x - dir * 6, y - 12], [x - dir * 14, y - 6], [x - dir * 14, y], [x + dir * 16, y], [x + dir * 18, y - 5]], dark ? shade(HR.shoe, 0.06) : HR.shoe, { depth: 2.5, tension: 0.6 });
    S.cel(rrectPts(x - 14 + (dir < 0 ? 0 : 14), y - 1.5, 14, 4, 1.5), HR.tap, { depth: 1, tension: 0.3, hi: false, line: S.lw * 0.6 });
    S.cel(rrectPts(x - 6, y - 16, 13, 8, 3), HR.white, { depth: 1.5, tension: 0.4, hi: false, line: S.lw * 0.8 });
    S.shine([[x + dir * 8, y - 9], [x + dir * 13, y - 7]], 2, 0.9);
  }
  define({
    id: 'tengu_duelist', size: 'l', acc: '#e8eeff', lunge: 96, alertColor: '#ff9fc6', ox: 38,
    col: {},
    hitAt: [-6, -160], alertAt: [-40, -200], hitBone: 'body', alertBone: 'body', buffBone: 'body', guardBone: 'body',
    arc: { bone: 'body', x: -24, y: -166, r: 150, a0: 2.75, a1: 3.65, w: 12, color: '#e8eeff' },
    bounds: { w: 300, h: 305, head: { x: 6, y: -246 }, body: { x: 46, y: -156 }, feet: { x: 0, y: 0 }, right: 158 },
    dieBox: [-150, -308, 132, 0], glossAt: [40, -160], glossBone: 'body', glossR: 12,
    tweak(K, pose, t) { K.brot += -0.03; },
    parts: [
      { id: 'wingBi', box: [10, -176, 92, -70], parent: 'body', pivot: [26, -160],
        xf: (K, t, st) => ({ rot: -0.04 * sin(t * 1.5 + 0.6) * st.m + 0.25 * K.strike - 0.15 * K.wind }),
        draw(S) { S.cel([[20, -168], [40, -160], [62, -130], [80, -90], [86, -74, 1], [70, -84], [52, -110], [30, -138]], HR.slateDk, { depth: 5, tension: 0.6 }); } },
      ...arm2({
        id: 'armB', parent: 'body', sh: [24, -176], el: [46, -196], wrist: [58, -218], w: [12, 11, 9], hr: 14, bend: -2, color: HR.slateDk,
        a1: (K, t) => ({ rot: 0.05 * sin(t * 1.8 + 1) + 0.5 * K.wind - 0.5 * K.strike + 0.3 * K.guard - 0.3 * K.buff }),
        a2: (K, t) => ({ rot: 0.08 * sin(t * 2.1 + 1) + 0.4 * K.wind - 0.4 * K.strike }),
        hand: (S, x, y) => { S.blob(x, y - 3, 7.5, 7.5, shade(HR.glove, 0.08), { depth: 1.5, line: S.lw * 0.8 }); [-1, 0, 1].forEach((k) => S.tube([[x + k * 4, y - 6], [x + k * 6, y - 16]], 4, 3.5, shade(HR.glove, 0.08), { depth: 0.8, line: S.lw * 0.7 })); },
      }),
      { id: 'getaB', box: [2, -30, 50, 6], parent: 'root', pivot: [24, -14], xf: (K, t) => ({ rot: 0.02 * sin(t * 2) }), draw(S) { tapShoe(S, 26, -2, -1, true); } },
      { id: 'hakama', box: [-36, -150, 40, -6], parent: 'root', pivot: [0, -140],
        xf: (K, t, st) => ({ sx: 1 + 0.01 * sin(t * 1.8) * st.m, rot: 0.01 * sin(t * 1.6) * st.m }),
        draw(S) {
          // the very long legs, each with the heron's backward-bending ankle
          S.tube([[12, -142], [16, -98], [10, -70]], 9.5, 8.5, shade(HR.leg, 0.1), { depth: 2 }); S.tube([[10, -70], [18, -40], [24, -14]], 8.5, 8, shade(HR.leg, 0.1), { depth: 2 });
          S.tube([[-8, -142], [-4, -98], [-12, -70]], 10, 9, HR.leg, { depth: 2 }); S.tube([[-12, -70], [-8, -40], [-18, -14]], 9, 8.5, HR.leg, { depth: 2 });
          S.blob(10, -70, 6, 6, shade(HR.leg, 0.1), { depth: 1, line: S.lw * 0.7 }); S.blob(-12, -70, 6.5, 6.5, HR.leg, { depth: 1, line: S.lw * 0.7 });
        } },
      { id: 'getaF', box: [-50, -30, 4, 6], parent: 'root', pivot: [-18, -14],
        xf: (K, t) => ({ rot: -0.02 * sin(t * 2) - 0.35 * K.wind + 0.42 * K.strike - 0.25 * K.alert * Math.max(0, sin(t * 9)) }),
        draw(S) { tapShoe(S, -22, -2, -1, false); } },
      { id: 'haoriB', box: [16, -168, 104, -60], parent: 'body',
        chain: { spine: [[30, -152], [52, -120], [70, -84]], cuts: [0.4, 0.75], reach: 26 },
        bends: (K, t, st) => { const a = 0.1 * sin(t * 2 + 1) * st.m - 0.4 * K.strike + 0.15 * K.wind; return [a * 0.5, a, a * 1.2]; },
        draw(S) { S.cel([[26, -160], [44, -150], [62, -118], [74, -86], [76, -66, 1], [62, -78], [46, -104], [28, -132]], HR.slate, { depth: 5, tension: 0.6 }); } },
      { id: 'body', box: [-46, -198, 60, -118], parent: 'root', pivot: [0, -140],
        xf: (K, t, st) => ({ sy: 1 + 0.014 * sin(t * 1.7) * st.m, rot: 0.02 * sin(t * 1.3) * st.m - 0.05 * K.strike + 0.03 * K.wind - 0.3 * K.alert }),
        draw(S) {
          // the slate body in its tailcoat, a white shirt front, a pink carnation on the lapel
          S.cel(HR_BODY, HR.slate, { depth: 10, decor: (g) => { g.beginPath(); g.ellipse(-18, -158, 20, 28, -0.25, 0, TAU); g.fillStyle = HR.white; g.fill(); } });
          const pet = []; for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, r = i % 2 ? 5 : 7; pet.push([4 + cos(a) * r, -168 + sin(a) * r]); }
          S.cel(pet, HR.band, { depth: 1.5, tension: 0.6, line: S.lw * 0.75 }); S.dot(4, -168, 2, '#ffd0e4');
          S.ln([[2, -162], [0, -154]], { w: 2.2, color: '#4caf50', taper: 0.2 });
        } },
      { id: 'gloss', gloss: true, box: [24, -184, 58, -138], parent: 'body', pivot: [40, -160],
        draw(S) { SEA.glossPatch(S, [[28, -176], [46, -170], [54, -152], [44, -142], [30, -152]], { clip: HR_BODY, smile: [41, -158, 9], seed: 12 }); } },
      { id: 'head', box: [-104, -310, 0, -170], parent: 'body', pivot: [-20, -178],
        xf: (K, t, st) => ({ rot: 0.02 * sin(t * 1.6) + 0.06 * K.wind - 0.1 * K.strike + 0.06 * K.hurt - 0.25 * K.alert, dy: 1.3 * sin(t * 1.6 + 0.5) * st.m, dx: -10 * K.strike }),
        draw(S) {
          // the long S of the neck, the small round head, the long beak, the little top hat with a pink band, and the bow tie at the throat
          S.tube([[-18, -176], [-12, -200], [-24, -222], [-30, -236]], 15, 12, HR.slate, { depth: 3 });
          S.ln([[-22, -180], [-18, -200], [-28, -220]], { w: 3, color: HR.white, taper: 0.3 });
          S.cel([[-50, -244], [-72, -242], [-98, -236, 1], [-72, -234], [-50, -236]], HR.beak, { depth: 2.5, tension: 0.5 });
          S.cel(blob(-30, -246, 25, 23, 4, 0.02, 18), HR.white, { depth: 5, decor: (g) => { g.beginPath(); g.ellipse(-16, -264, 24, 14, 0.4, 0, TAU); g.fillStyle = HR.slate; g.fill(); } });
          S.cel(HR_HAT, HR.hat, { depth: 3, tension: 0.2, decor: (g) => { g.fillStyle = HR.band; g.beginPath(); tk.trace(g, { poly: [[-47, -281], [-15, -284], [-14, -277], [-47, -275]] }); g.fill(); } });
          S.cel([[-60, -270], [-4, -272], [-2, -266], [-58, -264]], shade(HR.hat, 0.08), { depth: 1, tension: 0.3, hi: false });
          S.cel([[-26, -188], [-40, -196, 1], [-40, -180, 1]], HR.bow, { depth: 1.5, tension: 0.3, line: S.lw * 0.8 }); S.cel([[-22, -188], [-8, -196, 1], [-8, -180, 1]], HR.bow, { depth: 1.5, tension: 0.3, line: S.lw * 0.8 }); S.blob(-24, -188, 4, 4, shade(HR.bow, 0.1), { depth: 1, line: S.lw * 0.7 });
        } },
      { id: 'jaw', box: [-98, -246, -44, -224], parent: 'head', pivot: [-50, -236], xf: (K) => ({ rot: K.mouth === 'open' ? -0.3 : K.mouth === 'grit' ? -0.06 : 0 }),
        draw(S) { S.cel([[-50, -238], [-70, -235], [-92, -234, 1], [-70, -230], [-50, -232]], shade(HR.beak, 0.08), { depth: 1.5, tension: 0.5, hi: false }); } },
      { id: 'face', box: [-60, -272, -2, -224], parent: 'head', pivot: [-32, -248], face: true,
        draw(S, state) {
          const f = faceOf(state), iris = ['#2b2f55', '#e0a020'];
          // a gentleman's look: big bright eyes under one raised brow, a bow ready in every glance
          S.eye(-41, -248, 16, f.ey, { iris, side: -1, lid: HR.white, look: [-0.4, 0] }); S.eye(-20, -250, 13, f.ey, { iris, side: 1, lid: HR.white, look: [-0.4, 0] });
          S.brow(-41, -263, 12, f.ey === 'angry' ? 0.6 : -0.5, -1); S.brow(-20, -264, 10, f.ey === 'angry' ? 0.6 : 0.1, 1);
          S.blush(-30, -234, 9);
        } },
      { id: 'beard', box: [-30, -272, 44, -230], parent: 'head',
        chain: { spine: [[-14, -252], [6, -254], [30, -248]], cuts: [0.4, 0.75], reach: 12 },
        bends: (K, t, st) => { const a = 0.14 * sin(t * 2.4) * st.m + 0.3 * K.strike; return [a * 0.4, a, a * 1.3]; },
        draw(S) { S.tube([[-14, -254], [6, -258], [30, -250]], 5, 2, HR.slateDk, { depth: 1 }); S.tube([[-14, -250], [6, -250], [26, -240]], 4.5, 2, HR.slateDk, { depth: 1 }); } },
      { id: 'blade', parent: 'armF2', pivot: [-74, -170], box: [-200, -206, -60, -150], xf: (K) => ({ rot: -0.85 * (1 - clamp(K.wind + K.strike + K.alert, 0, 1)) - 0.1 * K.strike + 0.2 * K.wind }),
        draw(S) {
          // the cane held like a fencing foil: a navy shaft, a silver knob at the hand and a silver tip
          const d = [cos(3.35), sin(3.35)], w = [-74, -170], pt = (u) => [w[0] + d[0] * u, w[1] + d[1] * u];
          S.tube([pt(-8), pt(60), pt(118)], 6, 5, HR.cane, { depth: 1.5 });
          S.cel(rrectPts(pt(118)[0] - 7, pt(118)[1] - 4, 12, 8, 3), HR.tap, { depth: 1, tension: 0.3, line: S.lw * 0.8 });
          S.blob(pt(-10)[0], pt(-10)[1], 6, 6, HR.tap, { depth: 1.5, line: S.lw * 0.8 });
          S.shine([pt(20), pt(90)], 1.4, 0.8);
        } },
      ...arm2({
        id: 'armF', parent: 'body', sh: [-10, -172], el: [-42, -164], wrist: [-74, -170], w: [14, 12, 10], hr: 14, bend: 3, boxF: [-90, -190, -30, -150], color: HR.slate,
        a1: (K, t) => ({ rot: 0.03 * sin(t * 1.7) + 1.1 * K.wind - 0.1 * K.strike + 0.5 * K.guard - 0.1 * K.hurt + 0.3 * K.alert }),
        a2: (K, t) => ({ rot: 0.05 * sin(t * 2) + 0.6 * K.wind - 0.05 * K.strike + 1.3 * K.guard }),
        hand: (S, x, y) => S.blob(x + 2, y, 8.5, 8, HR.glove, { depth: 2, line: S.lw * 0.85 }),
      }),
      { id: 'bladeGlow', parent: 'blade', live(ctx, st) {
        const K = st.K, t = st.t, m = st.m, low = st.hpPct < 0.5 ? 1 : 0;
        const k = 0.6 + 1.2 * K.alert + 0.9 * K.strike + 0.4 * K.wind + 0.9 * low + 0.25 * K.buff, pl = 0.75 + 0.25 * sin(t * 4);
        const d = [cos(3.35), sin(3.35)], tp = [-74 + d[0] * 120, -170 + d[1] * 120];
        tk.glow(ctx, tp[0], tp[1], 22 + 14 * low, '#e8eeff', 0.3 * k * pl);
        tk.sparkle(ctx, tp[0], tp[1], 7 * (0.6 + 0.4 * pl) * (0.8 + 0.4 * K.strike + 0.5 * low), { color: '#ffffff', rot: t * 0.4, glow: 0.5 });
        if (low || K.pose === 'attack') {
          ctx.save(); ctx.globalAlpha *= 0.5 * (K.pose === 'attack' ? Math.max(K.strike, low) : 1) * m; ctx.lineCap = 'round';
          [-10, -20, -30].forEach((o, i) => { ctx.beginPath(); ctx.moveTo(-74 + d[0] * 40 + 12 * (i + 1), -170 + d[1] * 40 + o + 6); ctx.lineTo(-74 + d[0] * (118 - i * 10) + 20 * (i + 1), -170 + d[1] * (118 - i * 10) + o + 4); ctx.strokeStyle = NAVY; ctx.lineWidth = 4; ctx.stroke(); ctx.strokeStyle = '#e8eeff'; ctx.lineWidth = 2; ctx.stroke(); });
          ctx.restore();
        }
      } },
      { id: 'taps', parent: 'root', live(ctx, st) {
        const K = st.K, t = st.t, m = st.m;
        // the tap: a little burst of sparks under the front shoe on the strike, and a note on the bow
        if (K.pose === 'attack' && K.strike > 0.3) for (let i = 0; i < 3; i++) tk.sparkle(ctx, -40 - i * 8, -4 - i * 6, (4 + i) * K.strike, { color: i % 2 ? C1.lemon : '#ffffff', glow: 0.3, rot: i });
        if (K.alert > 0.05) tk.note(ctx, -60, -280 - 8 * sin(t * 3) * m, 10, { kind: 'beamed', color: C1.cherry, alpha: K.alert, rot: -0.2, line: 1.8 });
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // moss_guardian: the OLD BANDSTAND (Rival, l). The harbour's oldest bandstand, walking on four column legs: a striped roof like a hat with a gull
  // weathervane, bunting draped in loops, ivy and blossom vines, fairy lights that brighten as its Sequins grow, kazoos peeking out of the rafters,
  // old speakers for fists that squeal when hit. Gloss patch: a panel of the deck front. Keeps the MOSS GUARDIAN rig: the slow two-fist slam, the
  // streamers (now bunting) and the shake-loose summon (kazoos out of the rafters).
  // ---------------------------------------------------------------------------------------------------------------
  const BS = { green: '#2f8a5f', greenDk: '#22694a', cream: '#fff1d6', roof: '#2f8a5f', ivy: '#5fbf4a', bloom: '#ff9fc6', spk: '#b0693c', cone: '#4a4466' };
  const BS_DECK = rrectPts(-90, -128, 180, 52, 14);
  function bsColumn(S, x, yTop, yBot, dark) {
    const c = dark ? shade(BS.cream, 0.1) : BS.cream;
    S.cel(rrectPts(x - 8, yTop, 16, yBot - yTop, 4), c, { depth: 3, tension: 0.3, decor: (g) => { g.strokeStyle = rgba(NAVY, 0.25); g.lineWidth = 1; [-3, 3].forEach((dx) => { g.beginPath(); g.moveTo(x + dx, yTop + 6); g.lineTo(x + dx, yBot - 6); g.stroke(); }); } });
    S.cel(rrectPts(x - 12, yBot - 10, 24, 12, 3), dark ? BS.greenDk : BS.green, { depth: 2, tension: 0.3 });
    S.cel(rrectPts(x - 11, yTop - 4, 22, 8, 3), dark ? BS.greenDk : BS.green, { depth: 1.5, tension: 0.3, hi: false });
    // ivy winding up, with a blossom or two
    const leaves = [[x - 7, yTop + 14], [x + 6, yTop + 26], [x - 6, yTop + 40], [x + 7, yBot - 22]];
    S.ln(leaves.map((p) => [p[0], p[1]]), { w: 1.6, color: '#2f6a2a', taper: 0.2 });
    leaves.forEach((p, i) => { S.cel(ell(p[0], p[1], 5, 3.2, 8, i % 2 ? 0.6 : -0.6), BS.ivy, { depth: 1, line: S.lw * 0.55, hi: false }); });
    S.blob(x + 5, yTop + 12, 3.4, 3.4, BS.bloom, { depth: 0.8, line: S.lw * 0.5, hi: false });
  }
  const speakerFist = (S, x, y, dark) => {
    S.cel(rrectPts(x - 22, y - 12, 44, 44, 9), dark ? shade(BS.spk, 0.1) : BS.spk, { depth: 6, tension: 0.4 });
    S.cel(ell(x, y + 10, 14, 14, 16), BS.cone, { depth: 2, line: S.lw * 0.7, hi: false });
    S.blob(x, y + 10, 5, 5, shade(BS.cream, 0.1), { depth: 1, line: S.lw * 0.6 });
    S.shine([[x + 10, y - 6], [x + 16, y + 2]], 2.4, 0.8);
  };
  define({
    id: 'moss_guardian', size: 'l', acc: '#fff1c4', lunge: 40, alertColor: C1.lemon, ox: 0,
    col: {},
    hitAt: [0, -150], alertAt: [0, -236], hitBone: 'body', alertBone: 'head', buffBone: 'body', guardBone: 'body',
    arc: { bone: 'body', x: -64, y: -172, r: 100, a0: -1.2, a1: -3.6, w: 22, color: '#fff1c4' },
    bounds: { w: 252, h: 324, head: { x: -4, y: -232 }, body: { x: 0, y: -128 }, feet: { x: 0, y: 0 } },
    dieBox: [-130, -322, 130, 0], glossAt: [62, -102], glossBone: 'body', glossR: 20,
    parts: [
      ...arm2({
        id: 'armB', parent: 'body', sh: [80, -136], el: [104, -112], wrist: [108, -82], w: [22, 20, 18], hr: 30, bend: -2, color: BS.greenDk,
        a1: (K, t) => ({ rot: 0.02 * sin(t * 1.3 + 1) - 2.6 * K.wind - 0.3 * K.strike - 0.3 * K.guard - 1.2 * K.buff }),
        a2: (K, t) => ({ rot: 0.03 * sin(t * 1.5 + 1) - 0.5 * K.wind - 0.3 * K.strike - 1.3 * K.guard }),
        decorU: (S) => S.ln([[84, -128], [96, -120]], { w: 2, color: BS.cream, taper: 0 }),
        hand: (S, x, y) => speakerFist(S, x, y, true),
      }),
      { id: 'legB', box: [-46, -86, 68, 6], parent: 'body', pivot: [10, -80], xf: (K, t) => ({ rot: 0.01 * sin(t * 1.5) }),
        draw(S) { bsColumn(S, -28, -80, -2, true); bsColumn(S, 52, -80, -2, true); } },
      { id: 'body', box: [-96, -196, 96, -72], parent: 'root', pivot: [0, -90],
        xf: (K, t, st) => ({ sy: 1 + 0.012 * sin(t * 1.3) * st.m - 0.02 * K.guard, sx: 1 + 0.02 * K.buff }),
        draw(S) {
          // the upper posts behind the rail, then the round green deck with its cream railing of balusters
          bsColumn(S, -70, -190, -128, true); bsColumn(S, 70, -190, -128, true); bsColumn(S, -24, -192, -128, true); bsColumn(S, 24, -192, -128, true);
          S.cel(BS_DECK, BS.green, { depth: 9, tension: 0.4, decor: (g) => { g.strokeStyle = rgba('#ffffff', 0.3); g.lineWidth = 2; g.beginPath(); g.moveTo(-80, -112); g.lineTo(80, -112); g.stroke(); g.strokeStyle = rgba(NAVY, 0.35); g.beginPath(); g.moveTo(-84, -90); g.lineTo(84, -90); g.stroke(); } });
          for (let x = -80; x <= 80; x += 16) S.cel(rrectPts(x - 3, -150, 6, 24, 2), BS.cream, { depth: 1, tension: 0.3, hi: false, line: S.lw * 0.6 });
          S.cel(rrectPts(-90, -156, 180, 8, 4), BS.cream, { depth: 2, tension: 0.3 });
        } },
      { id: 'gloss', gloss: true, box: [36, -126, 92, -78], parent: 'body', pivot: [62, -102],
        draw(S) { SEA.glossPatch(S, [[40, -124], [90, -124], [90, -80], [40, -80]], { clip: BS_DECK, smile: [64, -102, 11], seed: 13 }); } },
      { id: 'legF', box: [-74, -86, 46, 6], parent: 'body', pivot: [-10, -80], xf: (K, t) => ({ rot: -0.01 * sin(t * 1.5) }),
        draw(S) { bsColumn(S, -52, -80, -2, false); bsColumn(S, 30, -80, -2, false); } },
      { id: 'fronds', parent: 'body', box: [-100, -160, 100, -120], xf: (K, t, st) => ({ rot: 0.01 * sin(t * 1.4) * st.m, sy: 1 + 0.1 * K.alert }),
        draw(S) { SEA.bunting(S.g, [[-92, -152], [0, -150], [92, -152]], [C1.tomato, C1.lemon, C1.sky], 0, { n: 6, size: 9, sag: 6, lw: 1.6 }); } },
      { id: 'head', box: [-112, -330, 112, -164], parent: 'body', pivot: [0, -192],
        xf: (K, t, st) => ({ rot: 0.015 * sin(t * 1.2) + 0.08 * K.wind - 0.08 * K.strike + 0.05 * K.hurt, dy: 1.4 * sin(t * 1.3 + 0.5) * st.m + 3 * K.guard - 6 * K.buff * sin(t * 30) * st.m, dx: -8 * K.strike }),
        draw(S) {
          // the cream frieze (its face band), kazoos peeking out of the rafters, the striped roof like a hat, the gull weathervane
          S.cel(rrectPts(-86, -214, 172, 46, 10), BS.cream, { depth: 5, tension: 0.4, decor: (g) => { g.fillStyle = BS.green; g.fillRect(-90, -176, 180, 6); } });
          [[-62, -214, -0.5], [56, -214, 0.6]].forEach((k) => { S.g.save(); S.g.translate(k[0], k[1]); S.g.rotate(k[2]); S.cel(rrectPts(-12, -5, 24, 9, 4), C1.lemon, { depth: 1.5, tension: 0.4, line: S.lw * 0.7 }); S.blob(2, -6, 3.6, 2.6, C1.tomato, { depth: 0.8, line: S.lw * 0.6 }); S.g.restore(); });
          const roof = [[-110, -212, 1], [-80, -232], [-40, -262], [0, -284, 1], [40, -262], [80, -232], [110, -212, 1], [60, -218], [0, -220], [-60, -218]];
          S.cel(roof, BS.roof, { depth: 8, tension: 0.6, decor: (g) => {
            for (let i = -5; i <= 5; i += 2) { g.beginPath(); g.moveTo(0, -284); g.lineTo(i * 20 - 10, -214); g.lineTo(i * 20 + 10, -214); g.closePath(); g.fillStyle = BS.cream; g.fill(); }
          } });
          S.tube([[0, -284], [0, -316]], 3, 3, NAVY, { depth: 0.5 });
          S.ln([[-12, -300], [12, -300]], { w: 2, taper: 0 }); S.cel([[12, -303], [18, -300, 1], [12, -297]], C1.tomato, { depth: 0.5, line: S.lw * 0.6, hi: false, tension: 0 });
          S.cel([[-16, -316], [0, -322], [12, -318], [22, -326, 1], [18, -314], [0, -310], [-12, -308]], '#fffdf8', { depth: 1, tension: 0.5, line: S.lw * 0.7, hi: false });
          S.blob(0, -285, 4, 4, C1.lemon, { depth: 0.8, line: S.lw * 0.6 });
        } },
      { id: 'face', box: [-60, -214, 52, -164], parent: 'head', pivot: [-4, -196], face: true,
        draw(S, state) {
          // eyes peeking from under the brim of its roof, as old as the harbour and just as patient
          const f = faceOf(state), iris = ['#2b2f55', '#3f8a5f'];
          S.eye(-30, -196, 20, f.ey, { iris, side: -1, kind: f.ey === 'open' ? 'sleepy' : 'round', lid: BS.cream }); S.eye(20, -196, 20, f.ey, { iris, side: 1, kind: f.ey === 'open' ? 'sleepy' : 'round', lid: BS.cream });
          S.blush(-48, -182, 11); S.blush(38, -182, 11);
          S.mouth(-4, -183, 18, f.mo === 'open' ? 'happyOpen' : f.mo === 'grit' ? 'grit' : 'smile');
        } },
      ...arm2({
        id: 'armF', parent: 'body', sh: [-80, -136], el: [-104, -112], wrist: [-108, -82], w: [23, 21, 19], hr: 30, bend: 2, color: BS.green,
        a1: (K, t) => ({ rot: 0.02 * sin(t * 1.3) + 2.6 * K.wind + 0.3 * K.strike + 0.9 * K.guard - 0.1 * K.hurt + 1.2 * K.buff }),
        a2: (K, t) => ({ rot: 0.03 * sin(t * 1.5) + 0.5 * K.wind + 0.3 * K.strike + 1.5 * K.guard }),
        decorU: (S) => S.ln([[-84, -128], [-96, -120]], { w: 2, color: BS.cream, taper: 0 }),
        hand: (S, x, y) => speakerFist(S, x, y, false),
      }),
      { id: 'glow', parent: 'body', live(ctx, st) {
        const K = st.K, t = st.t, m = st.m;
        // blossom petals drifting off the vines, the speakers squealing when hit, the stomp
        for (let i = 0; i < 3; i++) { const ph = (t * 0.22 + i / 3) % 1, a = i * 1.7 + ph * 5; FX.bit(ctx, 'petal', -80 + i * 70 + sin(a) * 12, -150 + ph * 120, 4.5, a * 1.3, sin(ph * PI) * 0.8 * m, BS.bloom); }
        if (K.pose === 'hurt') { const a = clamp(1 - st.pt / 0.26, 0, 1); FX.squeal(ctx, -130, -60, PI * 1.1, 26, a); FX.squeal(ctx, -134, -76, PI * 0.9, 22, a); FX.squeal(ctx, 128, -60, -0.1, 24, a); }
        if (K.pose === 'attack') { const u = clamp((st.pt * 1000 - 160) / 260, 0, 1); FX.dust(ctx, -108, -6, u, 1.7); FX.dust(ctx, 110, -6, u, 1.7); }
      } },
      { id: 'headglow', parent: 'head', live(ctx, st) {
        const K = st.K, t = st.t, pts = [];
        for (let i = 0; i <= 10; i++) { const u = i / 10, x = lerp(-104, 104, u); pts.push([x, -214 + 5 * sin(u * PI * 5)]); }
        SEA.fairyBulbs(ctx, pts, t, 0.45 + 0.55 * Math.max(K.buff, K.guard, K.alert), { r: 3.4 });
        if (K.buff > 0.05) for (let i = 0; i < 2; i++) { const u = clamp(K.buff * 1.4 - i * 0.2, 0, 1); tk.note(ctx, -60 + i * 110, -214 - u * 40, 9, { kind: 'eighth', color: C1.lemon, alpha: sin(PI * u), rot: 0.2, line: 1.6 }); }
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // ember_wisp: the CHILLI FLAKE (Sidekick, s). A tiny red flake that jumped off a hot chilli to see the show: two dot eyes and a flicker of
  // cartoon flame on top, bouncing. Gloss patch: one smooth pastel corner. Keeps the EMBER WISP rig: the six-frame flame flip-book (recoloured
  // and small, now on top of the flake) and the airborne bounce.
  // ---------------------------------------------------------------------------------------------------------------
  const CF = { red: '#ec3b2f', seed: '#fff1c4' };
  const CF_BODY = [[-16, -52], [6, -58], [18, -44], [14, -24], [-4, -18], [-18, -30]];
  // one frame of a small cartoon flame (k 0..5): a navy-lined orange tongue with a lemon core
  function flameFrame(S, k, x, y0, hw, h) {
    const ph = k / 6 * TAU, tipx = x + 4 * sin(ph), tipy = y0 - h - 3 * cos(ph * 2 + 1);
    const outer = [[x - hw, y0], [x - hw * 1.05, y0 - h * 0.35], [x - hw * 0.5 + 2 * sin(ph + 2), y0 - h * 0.62], [tipx, tipy, 1], [x + hw * 0.55 + 2 * sin(ph + 1), y0 - h * 0.55], [x + hw * 0.9 + 2 * sin(ph), y0 - h * 0.75, 1], [x + hw * 1.05, y0 - h * 0.3], [x + hw, y0]];
    S.cel(outer, '#ff8a3d', { depth: 2, tension: 0.7, line: S.lw * 0.85 });
    S.cel(tk.xf(outer, { s: 0.55, cx: x, cy: y0, dy: -1 }), C1.lemon, { shadow: false, hi: false, line: false, tension: 0.7 });
  }
  define({
    id: 'ember_wisp', size: 's', acc: '#ffcf8a', lunge: 40, alertColor: '#ffb340',
    col: {},
    hitAt: [0, -40], alertAt: [0, -50], hitBone: 'body', alertBone: 'body', buffBone: 'body', guardBone: 'body',
    bounds: { w: 64, h: 90, head: { x: 0, y: -62 }, body: { x: 0, y: -40 }, feet: { x: 0, y: 0 } },
    dieBox: [-30, -92, 30, -6], glossAt: [11, -31], glossBone: 'body', glossR: 8,
    tweak(K, pose, t) { K.by += -10 - 12 * Math.abs(sin(t * 3.6)) * tk.motion(); },
    parts: [
      { id: 'body', box: [-22, -62, 22, -14], parent: 'root', pivot: [0, -20],
        xf: (K, t, st) => ({ sx: 1 + 0.12 * K.buff + 0.12 * K.wind + 0.1 * K.strike - 0.15 * K.guard + 0.05 * Math.abs(cos(t * 3.6)) * st.m, sy: 1 - 0.05 * Math.abs(cos(t * 3.6)) * st.m + 0.1 * K.buff + 0.08 * K.wind - 0.15 * K.guard, rot: 0.08 * sin(t * 2.7) * st.m - 0.12 * K.strike }),
        draw(S) { SEA.produce(S, CF_BODY, CF.red, { seed: 14, freckles: 0, shine: [[8, -52], [14, -44]], shineW: 2.4, cel: { depth: 4, tension: 0.6, decor: (g) => { g.fillStyle = CF.seed; [[-8, -30], [8, -48], [-12, -44]].forEach((p) => { g.beginPath(); g.ellipse(p[0], p[1], 2.2, 1.4, 0.5, 0, TAU); g.fill(); }); } } }); } },
      { id: 'gloss', gloss: true, box: [2, -42, 20, -18], parent: 'body', pivot: [11, -31],
        draw(S) { SEA.glossPatch(S, [[7, -35], [15, -37], [14, -27], [8, -25]], { clip: CF_BODY, smile: [11, -31, 4.5], seed: 14 }); } },
      { id: 'flame', box: [-16, -88, 16, -50], parent: 'body', pivot: [0, -54], v: (st) => 'f' + (Math.floor(st.t * 10) % 6),
        xf: (K, t, st) => ({ sy: 1 + 0.06 * sin(t * 9) * st.m + 0.3 * K.buff + 0.3 * K.alert + 0.3 * K.strike, sx: 1 + 0.1 * K.buff }),
        draw(S, variant) { flameFrame(S, +String(variant).slice(1) || 0, 0, -52, 9, 26); } },
      { id: 'face', box: [-16, -50, 14, -24], parent: 'body', pivot: [-1, -38], face: true,
        draw(S, state) {
          const f = faceOf(state);
          S.eye(-7, -40, 5.5, f.ey, { kind: 'dot', side: -1 }); S.eye(5, -41, 5.5, f.ey, { kind: 'dot', side: 1 });
          S.blush(-11, -33, 5, 0.6); S.blush(9, -34, 5, 0.6);
          S.mouth(-1, -33, 6, f.mo === 'open' ? 'O' : f.mo === 'grit' ? 'grit' : 'smile');
        } },
      { id: 'sparks', parent: 'body', live(ctx, st) {
        const K = st.K, t = st.t, m = st.m, k = 1 + 0.6 * K.alert + 0.6 * K.strike + 0.4 * K.buff;
        tk.glow(ctx, 0, -50, 26, '#ff9a3d', 0.32 * k);
        for (let i = 0; i < 3; i++) { const ph = (t * 0.8 + i / 3) % 1; FX.bit(ctx, 'spark', sin(ph * 5 + i * 2) * 10, -70 - ph * 34, 2 + (i % 2), ph * 3, sin(ph * PI) * 0.9 * m, i % 2 ? C1.lemon : '#ffb37a'); }
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // leaf_imp: the KAZOO IMP (Sidekick, s). A little lemon-yellow plastic kazoo on stick legs, the buzzing end as a mouth, a red cap, forever running
  // in place. Gloss patch: the narrow end of the tube. Keeps the LEAF IMP rig: the run cycle and the poke.
  // ---------------------------------------------------------------------------------------------------------------
  const KZ = { body: C1.lemon, cap: '#e8553f', leg: NAVY, shoe: '#ff6f8f' };
  const KZ_TUBE = [[-36, -60, 1], [-36, -34, 1], [-12, -37], [26, -42], [34, -46], [26, -52], [-12, -57]];
  define({
    id: 'leaf_imp', size: 's', acc: '#fff3a8', lunge: 44, alertColor: C1.lemon,
    col: {},
    hitAt: [-6, -48], alertAt: [-8, -62], hitBone: 'body', alertBone: 'body', buffBone: 'body', guardBone: 'body',
    arc: { bone: 'body', x: -14, y: -44, r: 34, a0: -1.2, a1: -4.0, w: 8, color: '#fff3a8' },
    bounds: { w: 92, h: 84, head: { x: -14, y: -62 }, body: { x: 0, y: -44 }, feet: { x: 0, y: 0 } },
    dieBox: [-40, -86, 40, 0], glossAt: [24, -47], glossBone: 'body', glossR: 8,
    tweak(K, pose, t) { if (pose === 'idle') { K.by = -2.5 * Math.abs(sin(t * 8)); K.brot -= 0.06; } },
    parts: [
      { id: 'legB', box: [-2, -42, 26, 4], parent: 'body', pivot: [10, -38], xf: (K, t, st) => ({ rot: 0.55 * sin(t * 8 + PI) * st.m }),
        draw(S) { S.tube([[10, -40], [12, -22], [10, -6]], 3.4, 3, shade(KZ.leg, 0.1), { depth: 0.8, line: S.lw * 0.6 }); S.cel(ell(8, -4, 7, 4, 12), shade(KZ.shoe, 0.1), { depth: 1.2 }); } },
      { id: 'body', box: [-42, -72, 38, -30], parent: 'root', pivot: [0, -34],
        xf: (K, t, st) => ({ sy: 1 + 0.03 * sin(t * 8) * st.m, rot: 0.04 * sin(t * 4) * st.m + 0.1 * K.wind - 0.14 * K.strike, dx: -6 * K.strike }),
        draw(S) {
          S.cel(KZ_TUBE, KZ.body, { depth: 5, tension: 0.5 });
          S.shine([[-24, -55], [0, -52], [18, -49]], 2.4, 0.85);
          // the red cap on top of the kazoo, its round turret
          S.cel(rrectPts(-10, -66, 18, 10, 3), KZ.cap, { depth: 2, tension: 0.4 });
          S.cel(ell(-1, -66, 9, 3.4, 12), shade(KZ.cap, -0.06), { depth: 1, hi: false, line: S.lw * 0.8 });
        } },
      { id: 'gloss', gloss: true, box: [12, -56, 36, -38], parent: 'body', pivot: [24, -47],
        draw(S) { SEA.glossPatch(S, [[14, -54], [28, -52], [35, -46], [28, -42], [14, -40]], { clip: KZ_TUBE, smile: [23, -47, 6], seed: 15 }); } },
      { id: 'face', box: [-44, -64, 0, -30], parent: 'body', pivot: [-20, -48], face: true,
        draw(S, state) {
          const f = faceOf(state);
          S.eye(-22, -50, 9, f.ey, { side: -1, lid: KZ.body }); S.eye(-10, -51, 8, f.ey, { side: 1, lid: KZ.body });
          S.blush(-16, -41, 6);
          // the buzzing end is its mouth: an oval opening, wider for the poke, buzzing teeth for the wind-up
          const r = f.mo === 'open' ? [6, 12] : f.mo === 'grit' ? [4, 10] : [3.8, 9.5];
          S.cel(ell(-37, -47, r[0], r[1], 14), C1.mouth, { shadow: false, hi: false, line: S.lw * 0.8 });
          if (f.mo === 'open') S.fill(ell(-37, -40, r[0] * 0.6, r[1] * 0.3, 10), C1.tongue);
          if (f.mo === 'grit') S.ln([[-38, -55], [-35, -51], [-38, -47], [-35, -43], [-38, -39]], { w: 1.4, color: '#ffffff', taper: 0 });
        } },
      { id: 'legF', box: [-26, -42, 4, 4], parent: 'body', pivot: [-8, -38], xf: (K, t, st) => ({ rot: 0.55 * sin(t * 8) * st.m }),
        draw(S) { S.tube([[-8, -40], [-10, -22], [-8, -6]], 3.6, 3.2, KZ.leg, { depth: 0.8, line: S.lw * 0.6 }); S.cel(ell(-11, -4, 7.5, 4, 12), KZ.shoe, { depth: 1.2 }); } },
      ...arm2({
        id: 'armF', parent: 'body', sh: [-14, -40], el: [-22, -32], wrist: [-28, -24], w: [3.4, 3.2, 3], hr: 7, bend: 1, color: KZ.leg,
        a1: (K, t, st) => ({ rot: 0.3 * sin(t * 8) * (st ? st.m : 1) + 2.4 * K.wind + 0.8 * K.strike + 1.2 * K.buff }),
        a2: (K, t, st) => ({ rot: 0.2 * sin(t * 8 + 1) * (st ? st.m : 1) + 0.5 * K.wind + 0.8 * K.strike }),
        tubeOpts: { line: 1.4 },
        hand: (S, x, y) => S.blob(x, y + 1, 4.2, 4.2, KZ.shoe, { depth: 1, line: S.lw * 0.7 }),
      }),
      { id: 'buzz', parent: 'body', live(ctx, st) {
        const K = st.K, t = st.t, m = st.m, a = 0.35 + 0.65 * Math.max(K.strike, K.alert, K.buff);
        // the buzz: two little zigzags out of the mouth end, and puffs of dust where its feet run
        const j = sin(t * 30) * 1.2 * m;
        ctx.save(); ctx.globalAlpha *= cA(a * (0.6 + 0.4 * sin(t * 12)));
        [-6, 6].forEach((dy, i) => { const pts = [[-46, -47 + dy], [-50, -50 + dy + j], [-54, -45 + dy], [-58, -49 + dy - j], [-62, -46 + dy]]; ctx.beginPath(); pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.strokeStyle = NAVY; ctx.lineWidth = 3.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); ctx.strokeStyle = i ? C1.lemon : C1.cherry; ctx.lineWidth = 1.6; ctx.stroke(); });
        ctx.restore();
        for (let i = 0; i < 2; i++) { const ph = (t * 1.1 + i * 0.5) % 1; FX.bit(ctx, 'puff', 24 + ph * 16, -6 - ph * 8, 2.5 + ph * 4, 0, sin(ph * PI) * 0.6 * m, '#fff3dc'); }
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // paper_kodama: the MIC SQUEAL (Sidekick, s). A tiny shrieking creature born where Kraki's stolen mics touch the speakers: a round teal mic grille
  // with bug eyes and a mouth stretched wide in a squeal, a coiled cable tail, jagged pink squeal lines and a pastel Gloss sheen leaking from its
  // grille. Gloss patch: the top of the grille. Keeps the PAPER KODAMA rig: the floating hollow doll (now a mic) and the leaking-mist effect (now
  // squeal lines and pastel Gloss wisps).
  // ---------------------------------------------------------------------------------------------------------------
  const MS = { grille: '#2bb3b1', mesh: '#7fe0d8', handle: '#3b3f5c', ring: '#dfe4ee', cable: '#3b3f5c' };
  const MS_BALL = ell(0, -70, 25, 24, 24);
  define({
    id: 'paper_kodama', size: 's', acc: '#ffc2dc', lunge: 30, alertColor: C1.cherry,
    col: {},
    hitAt: [0, -66], alertAt: [0, -76], hitBone: 'head', alertBone: 'head', buffBone: 'body', guardBone: 'body',
    bounds: { w: 88, h: 104, head: { x: 0, y: -76 }, body: { x: 0, y: -42 }, feet: { x: 0, y: 0 } },
    dieBox: [-42, -108, 42, -4], glossAt: [0, -88], glossBone: 'head', glossR: 12,
    tweak(K, pose, t) { K.by += -6 - 3 * sin(t * 1.8) * tk.motion(); },
    parts: [
      { id: 'cable', parent: 'body',
        chain: { spine: [[0, -26], [6, -14], [18, -10], [26, -18]], cuts: [0.34, 0.68], reach: 14 },
        bends: (K, t, st) => { const a = 0.3 * sin(t * 2.4) * st.m + 0.3 * K.strike; return [a * 0.3, a, a * 1.2]; },
        draw(S) {
          // the coiled cable tail: a navy-grey lead with springy loops and a little plug at the end
          const sp = [[0, -26], [6, -14], [18, -10], [26, -18]];
          S.tube(sp, 4, 3.5, MS.cable, { depth: 0.8, line: S.lw * 0.7 });
          [0.25, 0.5, 0.75].forEach((u) => { const p = spineAt(sp, u); S.g.save(); S.g.beginPath(); S.g.ellipse(p.x, p.y, 4, 5.5, Math.atan2(p.ty, p.tx), 0, TAU); S.g.lineWidth = 3.2; S.g.strokeStyle = NAVY; S.g.stroke(); S.g.lineWidth = 1.6; S.g.strokeStyle = '#6a7090'; S.g.stroke(); S.g.restore(); });
          S.cel(rrectPts(23, -26, 8, 10, 2), MS.ring, { depth: 1, tension: 0.3, line: S.lw * 0.7, hi: false });
        } },
      { id: 'body', box: [-14, -54, 14, -18], parent: 'root', pivot: [0, -22],
        xf: (K, t, st) => ({ sy: 1 + 0.03 * sin(t * 2) * st.m - 0.04 * K.guard, rot: 0.04 * sin(t * 1.5) * st.m }),
        draw(S) {
          S.cel([[-9, -50], [9, -50], [6, -24], [-6, -24]], MS.handle, { depth: 2.5, tension: 0.4 });
          S.cel(rrectPts(-3, -40, 6, 8, 2), C1.cherry, { depth: 1, tension: 0.3, line: S.lw * 0.6, hi: false });
          S.shine([[4, -46], [3, -30]], 1.6, 0.6);
        } },
      ...arm2({
        id: 'armF', parent: 'head', sh: [-16, -62], el: [-26, -56], wrist: [-32, -46], w: [5, 4.6, 4.2], hr: 8, bend: 1, color: shade(MS.grille, 0.06),
        a1: (K, t) => ({ rot: 0.1 * sin(t * 2.4) + 2.6 * K.wind + 0.5 * K.strike + 0.9 * K.guard + 1.4 * K.buff }),
        a2: (K, t) => ({ rot: 0.14 * sin(t * 2.8) + 0.5 * K.wind + 0.6 * K.strike + 1.7 * K.guard }),
        hand: (S, x, y) => S.blob(x, y + 1, 4, 4, shade(MS.grille, 0.06), { depth: 1, line: S.lw * 0.7 }),
      }),
      { id: 'head', box: [-30, -98, 30, -42], parent: 'body', pivot: [0, -52],
        xf: (K, t, st) => ({ rot: 0.1 * sin(t * 1.4) * st.m + 0.16 * K.wind - 0.16 * K.strike + 0.12 * K.hurt + sin(t * 44) * 0.05 * K.alert, dx: -6 * K.strike, dy: 1.3 * sin(t * 2 + 0.4) * st.m }),
        draw(S) {
          // the round teal grille with its mesh and a silver rim at the bottom
          S.cel(MS_BALL, MS.grille, { depth: 6, decor: (g) => {
            g.strokeStyle = rgba(MS.mesh, 0.75); g.lineWidth = 1.2;
            for (let k = -40; k <= 40; k += 7) { g.beginPath(); g.moveTo(k - 30, -100); g.lineTo(k + 30, -40); g.stroke(); g.beginPath(); g.moveTo(k + 30, -100); g.lineTo(k - 30, -40); g.stroke(); }
          } });
          S.cel([[-20, -54], [20, -54], [17, -47], [-17, -47]], MS.ring, { depth: 1.5, tension: 0.4, line: S.lw * 0.8 });
        } },
      { id: 'gloss', gloss: true, box: [-18, -98, 18, -80], parent: 'head', pivot: [0, -88],
        draw(S) { SEA.glossPatch(S, [[-14, -88], [-4, -95], [6, -95], [15, -88], [8, -82], [-8, -82]], { clip: MS_BALL, smile: [0, -87, 7], seed: 16 }); } },
      { id: 'face', box: [-26, -84, 26, -48], parent: 'head', pivot: [0, -66], face: true,
        draw(S, state) {
          // bug eyes and a mouth stretched wide in a squeal (it squeals even at rest)
          const f = faceOf(state);
          S.eye(-10, -71, 13, f.ey, { side: -1, lid: MS.grille, iris: ['#2b2f55', '#ff6fa3'] }); S.eye(10, -71, 13, f.ey, { side: 1, lid: MS.grille, iris: ['#2b2f55', '#ff6fa3'] });
          S.mouth(0, -59, f.mo === 'open' ? 18 : 14, f.mo === 'grit' ? 'grit' : 'squeal');
        } },
      { id: 'ink', parent: 'head', live(ctx, st) {
        const K = st.K, t = st.t, m = st.m, k = 0.4 + 0.6 * Math.max(K.alert, K.strike, K.buff) + 0.2 * sin(t * 6) * m;
        // jagged pink squeal lines either side of the mouth, and pastel Gloss wisps leaking from the grille
        FX.squeal(ctx, -24, -60, PI + 0.3 * sin(t * 3), 16 + 8 * K.strike, k); FX.squeal(ctx, 24, -60, -0.3 * sin(t * 3), 16 + 8 * K.strike, k, C1.teal);
        for (let i = 0; i < 3; i++) {
          const ph = (t * 0.3 + i / 3) % 1, x = -8 + i * 8 + sin(ph * 5 + i) * 4 * m, y = -94 - ph * 26 * (0.6 + 0.4 * m), r = 3 + 6 * ph;
          ctx.save(); ctx.globalAlpha *= 0.7 * sin(PI * ph); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = FOE.GLOSS[i + 1]; ctx.fill(); ctx.restore();
        }
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // boss_kuzunoha: KRAKI, THE KARAOKE KRAKEN (Headliner, xl; HV_ENEMIES 5.1). A huge, friendly, round pink-and-teal kraken rising from the harbour
  // beside the end-of-pier stage: big kind eyes behind the glossy smiling mask the Gloss gave her, eight curling arms each holding a gold mic on a
  // cable, sparkly sound bubbles (a note inside each) drifting round her. The mask is her Gloss patch.
  //   phase 0, Masked: seated low in the water like a big friendly teapot, the eight arms bundled behind her in a loose fan, the mask whole.
  //   phase 1, Unmasked: the mask split into two halves drifting apart with warm light between, the arms opened into a peacock wheel of mics with
  //   three turning sound rings behind, her real colours brighter, her eyes shining (excited and a little scared, never angry).
  // Poses: telegraph lifts the biggest mic arm like a conductor's hand; attack swings it down; block curls every arm into a dome; buff flares the
  // mics outward; the win-over drops the mask into the water as sparkles and she waves every arm. Keeps the KUZUNOHA rig: the tail chains (now the
  // eight arm chains), the floating mask and its phase 1 split, the captured-sound bubbles, the phase 1 wheel and its sound rings.
  // ---------------------------------------------------------------------------------------------------------------
  const KR = { pink: '#ff8fc8', pinkP1: '#ff79bd', belly: '#ffd0e6', teal: '#2bb3b1', tealP1: '#35d0c4', sucker: '#fff0f6', mic: C1.lemon, micDk: '#2a2f52', cable: '#34407e', water: '#2bb3b1', foam: '#e8fffb' };
  const KR_HUE = [C1.cherry, C1.lemon, C1.mint, C1.sky, '#c9a8ff', C1.tomato];
  const ARM_SP = [[0, 0], [12, -86], [-10, -176], [10, -246], [2, -268]];
  const ARM_R = [8, -48];                           // where the arms root, low behind her, just above the water (seat space)
  const CONDUCTOR = 3;                              // the biggest mic arm: it conducts on the telegraph and comes down on the attack
  const MIC_TIP = 318;                              // the mic head along an arm at rest
  const armBase = (i, ph) => (ph >= 1 ? -0.1 + (i - 3.5) * 0.37 : 0.02 + (i - 3.5) * 0.235);
  const KR_BODY = ell(10, -176, 132, 140, 32);
  const KR_MASK = [[-140, -200, 1], [-118, -214], [-82, -222], [-44, -206], [-6, -224], [34, -216], [62, -204, 1], [48, -172], [32, -136], [4, -112], [-40, -102], [-88, -112], [-118, -140], [-132, -172]];
  const KR_EYES = [[-80, -160, 25, 28], [-6, -166, 23, 26]];
  // one arm: thick at the root, a teal underside with pale suckers, the tip curled round a gold mic, a cable looping back down
  function krakiArmArt(S, v) {
    const p1 = String(v).charAt(1) === '1', far = String(v).split('|')[1] === '1';
    const base = p1 ? KR.pinkP1 : KR.pink, col = far ? shade(base, 0.08) : base, teal = p1 ? KR.tealP1 : KR.teal;
    const cab = [[-8, -276], [-30, -250], [-22, -216], [-36, -186], [-28, -160]];
    S.ln(cab, { w: 5, color: NAVY, taper: 0 }); S.ln(cab, { w: 2.6, color: KR.cable, taper: 0 });
    S.tube(ARM_SP, 60, 17, col, { depth: 9, decor: (g) => {
      g.save(); g.lineCap = 'round'; g.strokeStyle = teal; g.globalAlpha = 0.9;
      for (let u = 0.04; u < 0.96; u += 0.04) { const a = spineAt(ARM_SP, u), b = spineAt(ARM_SP, u + 0.04), w = lerp(60, 17, u) * 0.36; g.lineWidth = lerp(60, 17, u) * 0.34; g.beginPath(); g.moveTo(a.x + a.ty * w, a.y - a.tx * w); g.lineTo(b.x + b.ty * w, b.y - b.tx * w); g.stroke(); }
      g.restore();
      for (let u = 0.08; u < 0.9; u += 0.09) { const p = spineAt(ARM_SP, u), w = lerp(60, 17, u), r = w * 0.12; g.beginPath(); g.arc(p.x + p.ty * w * 0.34, p.y - p.tx * w * 0.34, r, 0, TAU); g.fillStyle = KR.sucker; g.fill(); g.lineWidth = 1; g.strokeStyle = rgba(NAVY, 0.6); g.stroke(); }
    } });
    // the curled tip wrapped round the mic handle, the navy handle with a gold band, the gold grille ball
    S.cel([[-9, -306], [-6, -276], [0, -276], [2, -306]], KR.micDk, { depth: 1.5, tension: 0.2, line: S.lw * 0.8 });
    S.cel(rrectPts(-11, -306, 15, 6, 2), shade(KR.mic, 0.1), { depth: 1, tension: 0.3, line: S.lw * 0.7, hi: false });
    S.blob(-4, -318, 13, 13, KR.mic, { depth: 3, decor: (g) => {
      g.strokeStyle = rgba(shade(KR.mic, 0.3), 0.8); g.lineWidth = 1.1;
      for (let k = -24; k <= 24; k += 6) { g.beginPath(); g.moveTo(-4 + k - 14, -332); g.lineTo(-4 + k + 14, -304); g.stroke(); g.beginPath(); g.moveTo(-4 + k + 14, -332); g.lineTo(-4 + k - 14, -304); g.stroke(); }
    } });
    S.shine([[2, -328], [6, -322]], 2.4, 0.9);
    S.tube([[2, -266], [-12, -278], [-16, -292], [-6, -298]], 15, 11, col, { depth: 2.5 });
  }
  function krakiArm(i) {
    const d = i - 3.5, big = i === CONDUCTOR ? 0.04 : 0;
    return {
      id: 'arm' + i, share: 'arm', parent: 'seat', pivot: [0, 0], v: (st) => (st.phase >= 1 ? 'p1' : 'p0') + '|' + (Math.abs(d) > 2 ? 1 : 0),
      chain: { spine: [[0, 0], [12, -86], [-10, -176], [10, -246], [0, -336]], cuts: [0.34, 0.68], reach: 54 },
      xf: (K, t, st) => {
        let th = armBase(i, st.phase) + 0.05 * sin(t * 1.3 + i * 0.7) * st.m;
        th += 0.24 * d / 4 * K.wind + 0.45 * d / 4 * K.buff + 0.16 * K.hurt;
        if (i === CONDUCTOR) th += -0.35 * K.wind - 1.3 * K.strike; else th += -0.25 * sin(i * 2.1) * K.strike;
        th = lerp(th, -0.5 + d * 0.15, clamp(K.guard, 0, 1));
        const sh = st.phase >= 1 ? 0.035 : 0.05;
        return { dx: ARM_R[0], dy: ARM_R[1], rot: th, sx: 1 - sh * Math.abs(d) + big + 0.06 * K.buff, sy: 1 - sh * Math.abs(d) + big + (i === CONDUCTOR ? 0.2 * K.wind : 0) + 0.06 * K.buff - 0.22 * K.guard };
      },
      bends: (K, t, st) => [0, 1, 2].map((j) => (0.15 * sin(t * 1.5 + i * 0.9 - j * 0.8) * st.m + (i === CONDUCTOR ? -0.25 * K.strike : 0.1 * K.strike) + 0.14 * K.guard * j) * (0.55 + 0.45 * j)),
      draw(S, v) { krakiArmArt(S, v); },
    };
  }
  // the glossy smiling mask: the Gloss film with its painted smile, a navy edge, the eye holes cut through. half 'L' or 'R' clips it down a crack.
  function krakiMask(S, half) {
    const g = S.g, zig = [[-40, -240], [-34, -214], [-46, -190], [-34, -166], [-46, -142], [-36, -118], [-42, -90]];
    if (half) {
      g.save(); g.beginPath();
      if (half === 'L') { g.moveTo(-160, -240); zig.forEach((p) => g.lineTo(p[0], p[1])); g.lineTo(-160, -90); } else { g.moveTo(80, -240); zig.forEach((p) => g.lineTo(p[0], p[1])); g.lineTo(80, -90); }
      g.closePath(); g.clip();
    }
    SEA.glossPatch(S, KR_MASK, { smile: [-42, -124, 34], seed: 17 });
    tk.inkPath(g, KR_MASK, { closed: true, w: S.lw, color: NAVY, taper: 0, wobble: 0.01 });
    g.save(); g.globalCompositeOperation = 'destination-out';
    KR_EYES.forEach((e) => { g.beginPath(); g.ellipse(e[0], e[1], e[2], e[3], 0, 0, TAU); g.fill(); });
    g.restore();
    KR_EYES.forEach((e) => tk.inkPath(g, ell(e[0], e[1], e[2], e[3], 18), { closed: true, w: S.lw * 0.8, color: NAVY, taper: 0, wobble: 0 }));
    tk.sparkle(g, 30, -206, 7, { color: '#ffffff', glow: 0.3 }); tk.sparkle(g, -118, -196, 5, { color: '#ffffff', glow: 0.3 });
    if (half) { g.restore(); S.ln(zig.map((p) => [p[0] + (half === 'L' ? -0.5 : 0.5), p[1]]).filter((p) => p[1] > -228 && p[1] < -100), { w: S.lw, taper: 0.1 }); }
  }
  // a sound bubble: a clear bubble with a navy rim, a shine and a note inside
  FX.bubble = (ctx, x, y, sz, a, col) => {
    if (!(a > 0.02)) return;
    ctx.save(); ctx.globalAlpha *= cA(a);
    ctx.beginPath(); ctx.arc(x, y, sz, 0, TAU); ctx.fillStyle = 'rgba(225,250,255,0.4)'; ctx.fill(); ctx.lineWidth = Math.max(1.2, sz * 0.12); ctx.strokeStyle = NAVY; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, sz * 0.78, 3.6, 4.7); ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = Math.max(1, sz * 0.12); ctx.lineCap = 'round'; ctx.stroke();
    tk.note(ctx, x - sz * 0.12, y + sz * 0.22, sz * 0.62, { kind: 'eighth', color: col || C1.cherry, line: Math.max(1, sz * 0.11) });
    ctx.restore();
  };
  // sound bubbles drifting about her: back ones behind her, front ones over her; a hit pops a few into free notes
  function krakiBubbles(ctx, st, front) {
    const t = st.t, m = st.m, p1 = st.phase >= 1, n = p1 ? 12 : 7, rr = table('kraki-bubbles', 14, 4), hurt = st.K ? st.K.hurt : 0;
    for (let i = 0; i < n; i++) {
      const a = t * (0.32 + rr[i][0] * 0.1) * m + i * TAU / n + rr[i][1] * 2, sn = sin(a);
      if ((sn > 0) !== front) continue;
      const rx = (p1 ? 205 : 180) + rr[i][2] * 24, ry = 60 + rr[i][3] * 40, x = 10 + cos(a) * rx, y = -190 + sn * ry - 40 * sin(t * 0.7 + i) * m;
      if (i % 4 === 0 && hurt > 0.04) {
        const u = 1 - hurt;
        ctx.save(); ctx.globalAlpha *= hurt; ctx.beginPath(); ctx.arc(x, y, 10 + 22 * u, 0, TAU); ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.stroke(); ctx.restore();
        tk.note(ctx, x + 8 * u, y - 36 * u, 12, { kind: i % 8 === 0 ? 'beamed' : 'eighth', color: KR_HUE[i % KR_HUE.length], alpha: hurt, rot: 0.25 * sin(t * 9 + i), line: 1.8 });
        continue;
      }
      FX.bubble(ctx, x, y, 10 + rr[i][2] * 5, 0.95, KR_HUE[i % KR_HUE.length]);
    }
  }
  define({
    id: 'boss_kuzunoha', size: 'xl', acc: '#ffc2dc', lunge: 34, alertColor: C1.lemon, ox: 4,
    col: {},
    hitAt: [-40, -170], alertAt: [10, -300], hitBone: 'body', alertBone: 'body', buffBone: 'body', guardBone: 'body',
    arc: { bone: 'arm3', x: 0, y: 0, r: 220, a0: -1.5, a1: -3.95, w: 40, color: '#ff9fc6' },
    bounds: { w: 460, h: 396, head: { x: -36, y: -262 }, body: { x: 14, y: -176 }, feet: { x: 0, y: 0 }, right: 316 },
    dieBox: [-226, -392, 254, 0], glossAt: [-40, -160], glossBone: 'body', glossR: 70, confettiN: 40, hop: 26,
    tweak(K, pose, t, pt, o) { K.by += -1.2 * sin(t * 1.4) * tk.motion() - ((o && (o.phase | 0) >= 1) ? 8 : 0); },
    dieExtra(ctx, st, p) {
      // the mask drops into the water as sparkles, then the voices she held float up as notes
      const rr = table('kraki-die', 16, 4);
      for (let i = 0; i < rr.length; i++) {
        if (i < 8) { const u = clamp((p - rr[i][0] * 0.12) / 0.4, 0, 1); if (u > 0 && u < 1) tk.sparkle(ctx, -120 + rr[i][1] * 170, -170 + u * u * 150, (4 + rr[i][2] * 5) * sin(PI * u), { color: FOE.GLOSS[i % 4], alpha: sin(PI * u), glow: 0.4, rot: u * 3 }); continue; }
        const life = clamp((p - 0.3 - rr[i][0] * 0.25) / 0.6, 0, 1);
        if (life <= 0 || life >= 1) continue;
        tk.note(ctx, -160 + rr[i][1] * 380 + sin(life * 7 + i) * 22, -80 - life * (140 + rr[i][2] * 200), 10 + rr[i][3] * 4, { kind: i % 2 ? 'eighth' : 'beamed', color: KR_HUE[i % KR_HUE.length], alpha: sin(life * PI), rot: sin(life * 5 + i) * 0.25, line: 1.7 });
      }
    },
    parts: [
      { id: 'halo', parent: 'root', live(ctx, st) {
        if (st.phase < 1) return;
        const t = st.t, m = st.m, pl = 0.7 + 0.3 * sin(t * 2);
        ctx.save(); ctx.beginPath(); ctx.rect(-400, -700, 800, 690); ctx.clip();          // the wheel stands on the water, never below it
        tk.glow(ctx, 10, -190, 260, '#ff9fc6', 0.22 * pl);
        // three sound rings turning slowly behind the wheel of mics (the outer one broken)
        const spr = ART.sprite('en1|kraki-rings', 560, 560, (g) => {
          tk.soundRings(g, 280, 280, 196, { n: 3, gap: 0.085, color: NAVY, lw: 15, broken: true });
          tk.soundRings(g, 280, 280, 196, { n: 3, gap: 0.085, color: C1.cherry, lw: 8, broken: true });
          tk.soundRings(g, 280, 280, 196, { n: 3, gap: 0.085, color: '#ffffff', lw: 2, broken: true, alpha: 0.6 });
        });
        ctx.save(); ctx.translate(10, -190); ctx.rotate(t * 0.12 * m); ctx.globalAlpha *= 0.6; ctx.drawImage(spr, -280, -280, 560, 560); ctx.restore();
        ctx.save(); ctx.lineCap = 'round';
        for (let k = 0; k < 2; k++) {
          const R = 250 + k * 16, a0 = -t * (0.3 + 0.1 * k) * m + k * 2.1;
          for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.arc(10, -190, R, a0 + j * 2.1, a0 + j * 2.1 + 1.1); ctx.strokeStyle = NAVY; ctx.lineWidth = k ? 4 : 6; ctx.stroke(); ctx.strokeStyle = k ? C1.mint : C1.lemon; ctx.lineWidth = k ? 2 : 3; ctx.stroke(); }
        }
        ctx.restore();
        ctx.restore();
      } },
      { id: 'pool', parent: 'root', live(ctx, st) {
        const t = st.t, ph = st.phase >= 1 ? 1 : 0, R = ph ? 250 : 200, m = st.m;
        ctx.save(); ctx.scale(1, 0.13);
        ctx.beginPath(); ctx.arc(10, -40, R, 0, TAU); ctx.fillStyle = rgba('#1d8a88', 0.55); ctx.fill();
        for (let k = 0; k < 2; k++) { const u = (t * 0.3 + k * 0.5) % 1; ctx.beginPath(); ctx.arc(-30, -40, 40 + u * (R - 50), 0, TAU); ctx.strokeStyle = rgba(KR.foam, 0.6 * (1 - u) * m); ctx.lineWidth = 4; ctx.stroke(); }
        ctx.restore();
      } },
      { id: 'bubblesBack', parent: 'root', live(ctx, st) { krakiBubbles(ctx, st, false); } },
      ...[0, 7, 1, 6, 2, 5, 4, 3].map(krakiArm),
      { id: 'seat', parent: 'root', pivot: [20, -30], live() {},
        xf: (K, t, st) => ({ sy: 1 + 0.014 * sin(t * 1.5) * st.m - 0.03 * K.guard, sx: 1 - 0.008 * sin(t * 1.5) * st.m, rot: 0.01 * sin(t * 0.9) * st.m - 0.04 * K.strike + 0.03 * K.wind }) },
      { id: 'body', box: [-156, -320, 178, -26], parent: 'seat', pivot: [20, -30], v: (st) => (st.phase >= 1 ? 'p1' : 'p0'),
        draw(S, v) {
          const p1 = v === 'p1', base = p1 ? KR.pinkP1 : KR.pink, spot = p1 ? KR.tealP1 : KR.teal;
          S.cel(KR_BODY, base, { depth: 18, decor: (g) => {
            g.beginPath(); g.ellipse(-40, -146, 94, 76, 0, 0, TAU); g.fillStyle = KR.belly; g.fill();
            g.fillStyle = spot; [[40, -282, 15], [84, -250, 11], [-18, -296, 9], [100, -206, 13], [62, -304, 7], [116, -160, 8], [-62, -262, 7], [10, -262, 6]].forEach((p) => { g.beginPath(); g.arc(p[0], p[1], p[2], 0, TAU); g.fill(); });
            g.fillStyle = rgba(tint(spot, 0.4), 0.8); [[36, -286, 5], [80, -254, 4], [96, -210, 4]].forEach((p) => { g.beginPath(); g.arc(p[0], p[1], p[2], 0, TAU); g.fill(); });
          } });
          S.shine([[56, -298], [98, -272], [124, -228]], 7, 0.75);
          // the bases of two arms curling up out of the water at her front, so she reads as a kraken sitting in the harbour
          [[-1, [[-70, -40], [-112, -46], [-140, -66], [-132, -88], [-116, -84]]], [1, [[96, -40], [138, -48], [164, -70], [156, -92], [140, -86]]]].forEach((c) => {
            S.tube(c[1], 30, 10, base, { depth: 5, decor: (g) => { for (let u = 0.15; u < 0.85; u += 0.17) { const p = spineAt(c[1], u), w = lerp(30, 10, u); g.beginPath(); g.arc(p.x - p.ty * w * 0.3 * c[0], p.y + p.tx * w * 0.3 * c[0], w * 0.13, 0, TAU); g.fillStyle = KR.sucker; g.fill(); g.lineWidth = 1; g.strokeStyle = rgba(NAVY, 0.55); g.stroke(); } } });
          });
        } },
      { id: 'face', box: [-130, -222, 44, -86], parent: 'body', pivot: [-40, -150], face: true, v: (st) => (st.phase >= 1 ? 'p1' : 'p0'),
        draw(S, state) {
          const f = faceOf(state), p1 = S.v === 'p1', iris = ['#1d4f6a', '#2bb3b1'];
          const ey = p1 && f.ey === 'open' ? 'wide' : f.ey;
          S.eye(-80, -160, 40, ey, { iris, side: -1, lid: KR.belly, look: [-0.25, 0.1] });
          S.eye(-6, -166, 36, ey, { iris, side: 1, lid: KR.belly, look: [-0.25, 0.1] });
          if (p1 && (ey === 'wide' || ey === 'open')) { tk.sparkle(S.g, -74, -172, 7, { color: '#ffffff', glow: 0 }); tk.sparkle(S.g, -1, -177, 6, { color: '#ffffff', glow: 0 }); }
          // real brows only show once the mask is off: excited and a little scared
          if (p1) { const cross = ey === 'angry'; S.brow(-80, -198, 28, cross ? 0.5 : -0.5, -1); S.brow(-6, -203, 24, cross ? 0.5 : -0.5, 1); }
          S.blush(-120, -128, 20); S.blush(26, -136, 18);
          S.mouth(-44, -112, 34, f.mo === 'open' ? 'happyOpen' : f.mo === 'grit' ? 'O' : p1 ? 'sing' : 'smile');
        } },
      { id: 'maskW', gloss: true, box: [-144, -236, 66, -94], parent: 'body', pivot: [-40, -160], when: (st) => st.phase < 1,
        xf: (K, t, st) => ({ dy: 1.5 * sin(t * 1.5) * st.m - 3 * K.wind, rot: 0.015 * sin(t * 1.1) * st.m + 0.04 * K.hurt }),
        draw(S) { krakiMask(S, null); } },
      { id: 'maskL', gloss: true, box: [-144, -236, -28, -94], parent: 'seat', pivot: [-40, -160], when: (st) => st.phase >= 1,
        xf: (K, t, st) => ({ dx: -136 + 4 * K.wind, dy: -150 + 7 * sin(t * 1.5) * st.m, rot: -0.7 + 0.1 * sin(t * 1.3) * st.m, sx: 0.7, sy: 0.7 }),
        draw(S) { krakiMask(S, 'L'); } },
      { id: 'maskR', gloss: true, box: [-52, -236, 66, -94], parent: 'seat', pivot: [-40, -160], when: (st) => st.phase >= 1,
        xf: (K, t, st) => ({ dx: 148 + 4 * K.wind, dy: -166 + 7 * sin(t * 1.5 + 1.2) * st.m, rot: 0.7 + 0.1 * sin(t * 1.3 + 1) * st.m, sx: 0.7, sy: 0.7 }),
        draw(S) { krakiMask(S, 'R'); } },
      { id: 'fxMask', parent: 'root', raw: true, live(ctx, st) {
        const t = st.t, p1 = st.phase >= 1, pl = 0.7 + 0.3 * sin(t * 3.4), M = st.M;
        if (!p1) { const c = mat.pt(M.body, 30, -206); tk.sparkle(ctx, c[0], c[1], 6 + 4 * pl, { color: '#ffffff', rot: t * 0.5, glow: 0.5 }); return; }
        // warm light between the drifting halves
        const a = mat.pt(M.maskL, -80, -160), b = mat.pt(M.maskR, 0, -160), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        tk.glow(ctx, mx, my, 110, '#ffcf8a', 0.5 * pl); tk.sparkle(ctx, mx, my, 12 + 4 * pl, { color: '#fff6e4', rot: t * 0.6, glow: 0.6 });
        [0.3, 0.7].forEach((u, i) => tk.sparkle(ctx, lerp(a[0], b[0], u), lerp(a[1], b[1], u) - 10 + 8 * sin(t * 2 + i) * st.m, 6, { color: '#ffe9a8', rot: -t * 0.5, glow: 0.4 }));
      } },
      { id: 'fxMics', parent: 'root', raw: true, live(ctx, st) {
        const K = st.K, t = st.t, M = st.M, p1 = st.phase >= 1, k = 0.35 + 0.65 * K.alert + 0.5 * K.buff + (K.pose === 'attack' ? 0.6 * K.strike : 0);
        // the gold mics glint at the ends of her arms; the conductor mic flares on the telegraph
        for (let i = 0; i < 8; i++) {
          const part = st.spec.byId['arm' + i], bs = part.bends(K, t, st), bend = (bs[0] + bs[1] + bs[2]) * 0.42;
          const tip = mat.pt(M['arm' + i], -4 * cos(bend) + MIC_TIP * sin(bend), -MIC_TIP * cos(bend) - 4 * sin(bend));
          tk.glow(ctx, tip[0], tip[1], (p1 ? 30 : 22) * (i === CONDUCTOR ? 1 + 0.6 * K.wind : 1), '#ffe9a8', (0.2 + 0.3 * k) * (p1 ? 1.2 : 1));
          if (p1 && i % 2 === 0) tk.sparkle(ctx, tip[0] + 10, tip[1] - 10, 5 + 2 * sin(t * 3 + i), { color: '#ffffff', glow: 0.3, rot: t + i });
        }
        if (K.wind > 0.2) { const pp = st.spec.byId['arm' + CONDUCTOR], bs = pp.bends(K, t, st), bend = (bs[0] + bs[1] + bs[2]) * 0.42, c = mat.pt(M['arm' + CONDUCTOR], MIC_TIP * sin(bend), -MIC_TIP * cos(bend)); tk.glow(ctx, c[0], c[1], 64 * K.wind, '#fff0b8', 0.6 * K.alert); tk.sparkle(ctx, c[0], c[1], 18 * K.wind, { color: '#ffffff', rot: t * 2, glow: 0.7 }); }
      } },
      { id: 'waterFront', parent: 'root', live(ctx, st) {
        // the harbour lapping round her: a round pool of teal water with a wavy foam edge in front of her base
        const t = st.t, m = st.m, pts = [];
        for (let i = 0; i <= 24; i++) { const x = -220 + i * 20; pts.push([x, -30 + 4 * sin(x * 0.045 + t * 2 * m) + 3 * sin(x * 0.11 - t * 1.3 * m)]); }
        ctx.save();
        ctx.beginPath(); ctx.ellipse(16, -12, 238, 36, 0, 0, TAU); ctx.clip();
        ctx.beginPath(); ctx.moveTo(pts[0][0], 6); pts.forEach((p) => ctx.lineTo(p[0], p[1])); ctx.lineTo(pts[pts.length - 1][0], 6); ctx.closePath();
        const gr = ctx.createLinearGradient(0, -36, 0, 6); gr.addColorStop(0, rgba('#5fd3c8', 0.92)); gr.addColorStop(1, rgba(KR.water, 0.92));
        ctx.fillStyle = gr; ctx.fill();
        ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.lineJoin = 'round'; ctx.strokeStyle = NAVY; ctx.lineWidth = 4; ctx.stroke(); ctx.strokeStyle = KR.foam; ctx.lineWidth = 2.2; ctx.stroke();
        for (let i = 0; i < 6; i++) { const x = -190 + i * 76 + 10 * sin(t * 0.8 + i) * m; ctx.beginPath(); ctx.moveTo(x, -14 + (i % 2) * 8); ctx.quadraticCurveTo(x + 8, -17 + (i % 2) * 8, x + 16, -14 + (i % 2) * 8); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.8; ctx.stroke(); }
        ctx.restore();
      } },
      { id: 'bubblesFront', parent: 'root', live(ctx, st) {
        krakiBubbles(ctx, st, true);
        const t = st.t, m = st.m, p1 = st.phase >= 1, rr = table('kraki-motes', 22, 3);
        for (let i = 0; i < (p1 ? 16 : 9); i++) { const ph = (t * 0.16 + rr[i][0]) % 1; tk.sparkle(ctx, -190 + rr[i][1] * 380 + sin(ph * 6 + i) * 10, -40 - ph * 320, 2.4 + rr[i][2] * 3, { color: rr[i][2] > 0.5 ? '#ffe0ef' : '#ffffff', alpha: sin(ph * PI) * 0.85 * m, glow: 0.4 }); }
      } },
    ],
  });


  // ===============================================================================================================
  // registration
  // ===============================================================================================================
  const IDS = Object.keys(SPECS);
  IDS.forEach((id) => {
    const spec = SPECS[id];
    ART.enemy.register(id, { draw: (ctx, o) => drawEnemy(spec, ctx, o), bounds: spec.bounds });
  });
  // Dev tool: bake every part (each variant, each face state) at 2x and report the ones whose art touches the edge of the sprite box, i.e. is
  // clipped. Reads pixels, so it needs a real canvas and must never run per frame.
  function audit(id) {
    const spec = SPECS[id], bad = [];
    if (!spec) return bad;
    spec.parts.forEach((part) => {
      if (part.live || part.chain || !part.box) return;
      const variants = part.v ? [part.v({ phase: 0, t: 0 }), part.v({ phase: 1, t: 0.2 }), part.v({ phase: 1, t: 0.5 })] : [''];
      const states = part.face ? ['open|closed', 'angry|open', 'hurt|open', 'closed|closed', 'half|grit', 'wide|open', 'happy|open'] : [''];
      const seen = {};
      variants.forEach((v) => states.forEach((stt) => {
        const key = v + '~' + stt;
        if (seen[key]) return;
        seen[key] = 1;
        const cv = partSprite(spec, part, 2, v, part.stateOf ? part.stateOf({ face: stt }) : stt, false), w = cv.width, h = cv.height;
        let d = null;
        try { d = cv.getContext('2d').getImageData(0, 0, w, h).data; } catch (e) { return; }
        const edges = [], hit = (x, y) => d[(y * w + x) * 4 + 3] > 24;
        for (let x = 0; x < w && edges.indexOf('top') < 0; x++) if (hit(x, 0)) edges.push('top');
        for (let x = 0; x < w && edges.indexOf('bottom') < 0; x++) if (hit(x, h - 1)) edges.push('bottom');
        for (let y = 0; y < h && edges.indexOf('left') < 0; y++) if (hit(0, y)) edges.push('left');
        for (let y = 0; y < h && edges.indexOf('right') < 0; y++) if (hit(w - 1, y)) edges.push('right');
        if (edges.length) bad.push({ part: part.id, variant: v, state: stt, edges });
      }));
    });
    return bad;
  }
  // where a named point of a creature is on the stage for a pose: 'head' 'body' 'feet' or any part id (its rest pivot moved by the pose)
  function pointAt(id, name, o) {
    const spec = SPECS[id];
    o = o || {};
    if (!spec) return { x: num(o.x, 0), y: num(o.y, 0) };
    const s = num(o.s, 1) > 0 ? num(o.s, 1) : 1, pose = POSE_MS[o.pose] !== undefined ? o.pose : 'idle', t = num(o.t, 0), pt = Math.max(0, num(o.pt, 0));
    const K = poseK(spec, pose, t, pt);
    if (spec.tweak) spec.tweak(K, pose, t, pt, o);
    const st = { spec, K, t, pt, pose, s, q: 1, m: tk.motion(), phase: o.phase | 0, hpPct: 1, face: '', M: null };
    st.M = evalMats(spec, K, t, st);
    const b = spec.bounds, part = spec.byId[name];
    let p;
    if (part) p = mat.pt(st.M[name], (part.pivot || [0, 0])[0], (part.pivot || [0, 0])[1]);
    else p = mat.pt(st.M.root, name === 'head' ? b.head.x : name === 'feet' ? 0 : b.body.x, name === 'head' ? b.head.y : name === 'feet' ? 0 : b.body.y);
    return { x: num(o.x, 0) + (o.flip ? -1 : 1) * p[0] * s, y: num(o.y, 0) + p[1] * s };
  }
  ART.enemy.ch1 = { ids: IDS.slice(), spec: (id) => SPECS[id], audit, pointAt, warm: (id, s) => { const sp = SPECS[id]; if (!sp) return 0; let n = 0; ['idle', 'attack'].forEach((pose) => { drawEnemyProbe(sp, pose, s); n++; }); return n; } };
  function drawEnemyProbe(spec, pose, s) {
    const noop = { save() {}, restore() {}, transform() {}, drawImage() {}, translate() {}, scale() {}, rotate() {}, setTransform() {}, beginPath() {}, moveTo() {}, lineTo() {}, arc() {}, ellipse() {}, fill() {}, stroke() {}, clip() {}, fillRect() {}, rect() {}, quadraticCurveTo() {}, bezierCurveTo() {}, closePath() {}, createLinearGradient() { return { addColorStop() {} }; }, createRadialGradient() { return { addColorStop() {} }; }, setLineDash() {}, globalAlpha: 1 };
    try { drawEnemy(spec, noop, { s, pose, t: 0.3, pt: 0.15, phase: 0 }); if (spec.id === 'boss_kuzunoha') drawEnemy(spec, noop, { s, pose, t: 0.3, pt: 0.15, phase: 1 }); } catch (e) { /* warming is best effort */ }
  }
  // ===============================================================================================================
  // gallery: Blossom Bay at golden hour (sky, sea, a pier, bunting, the boardwalk) behind the sheets
  // ===============================================================================================================
  function bay(ctx, W, H, t, gy) {
    ART.blit(ctx, ART.sprite('en1|bay|' + Math.round(W) + 'x' + Math.round(H) + '|' + Math.round(gy), W, H, (g) => {
      tk.sky(g, 0, 0, W, gy, 'golden');
      tk.glow(g, W * 0.72, gy * 0.5, gy * 0.8, '#fff0b8', 0.8);
      // the sea: a teal band with a warm path of light and little wave dashes
      const sea = gy * 0.62, gs = g.createLinearGradient(0, sea, 0, gy);
      gs.addColorStop(0, '#5fd3c8'); gs.addColorStop(1, '#2bb3b1');
      g.fillStyle = gs; g.fillRect(0, sea, W, gy - sea);
      g.fillStyle = rgba('#ffe7a8', 0.45); g.beginPath(); g.moveTo(W * 0.66, sea); g.lineTo(W * 0.78, sea); g.lineTo(W * 0.9, gy); g.lineTo(W * 0.56, gy); g.closePath(); g.fill();
      const r = tk.rng('en1bay', 1);
      g.strokeStyle = rgba('#ffffff', 0.55); g.lineWidth = 1.6; g.lineCap = 'round';
      for (let i = 0; i < 28; i++) { const x = r() * W, y = sea + 4 + r() * (gy - sea - 8), w = 6 + r() * 12; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - 2, x + w, y); g.stroke(); }
      // two little sailboats and a far pier on the horizon
      [[0.18, 0.9], [0.42, 0.7]].forEach((b) => { const x = W * b[0], y = sea - 2, s = gy * 0.05 * b[1]; g.fillStyle = '#f7e0c8'; g.beginPath(); g.moveTo(x, y - s * 2.2); g.lineTo(x + s * 1.2, y - s * 0.3); g.lineTo(x, y - s * 0.3); g.closePath(); g.fill(); g.fillStyle = '#c86a5a'; g.fillRect(x - s * 0.8, y - s * 0.3, s * 2.2, s * 0.35); });
      g.fillStyle = rgba('#8a5a6a', 0.55); g.fillRect(W * 0.82, sea - gy * 0.035, W * 0.2, gy * 0.02);
      for (let i = 0; i < 6; i++) g.fillRect(W * 0.83 + i * W * 0.03, sea - gy * 0.03, 3, gy * 0.05);
      // the boardwalk
      const gb = g.createLinearGradient(0, gy, 0, H);
      gb.addColorStop(0, '#c98a5a'); gb.addColorStop(1, '#6a3f4a');
      g.fillStyle = gb; g.fillRect(0, gy, W, H - gy);
      g.strokeStyle = rgba(NAVY, 0.35); g.lineWidth = 1.4;
      for (let y = gy + 7; y < H; y += 9) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      g.fillStyle = rgba('#ffe7a8', 0.4); g.fillRect(0, gy - 1, W, 3);
      // a string of bunting across the top
      SEA.bunting(g, [[-10, gy * 0.08], [W * 0.5, gy * 0.12], [W + 10, gy * 0.06]], [C1.tomato, C1.lemon, C1.sky, C1.mint, C1.cherry], 0, { n: Math.max(4, Math.round(W / 70)), size: clamp(gy * 0.04, 5, 12), sag: gy * 0.02, lw: 1.3 });
    }), 0, 0, W, H);
    tk.kirakira(ctx, 0, gy * 0.6, W, gy * 0.4, t, { n: 14, seed: 6, size: 2.4, rise: 2, color: '#ffffff' });
  }
  const KEYPT = { idle: 0, telegraph: 0.5, attack: 0.19, hurt: 0.05, block: 0.14, buff: 0.16, die: 0.3 };
  const POSES = ['idle', 'telegraph', 'attack', 'hurt', 'block', 'buff', 'die'];
  // combat mock: the heroes at the SCENE layout and the enemies in their lanes (1280 x 720, ground at 520), the size they are really seen at
  function combatMock(ctx, params, ids) {
    const W = params.w, H = params.h, t = num(params.t, 0), k = Math.min(W / 1280, H / 720), lanes = [560, 705, 850, 995, 1120];
    ctx.save(); ctx.scale(k, k);
    bay(ctx, 1280, 720, t, 520);
    const poses = String(params.pose || 'idle').split(','), n = Math.min(5, ids.length);
    // SCENE's stage fit (scene.js lineFit): the whole line slides left by the worst overhang past the right edge (bounds.right) plus 10 px
    const fit = Math.min(240, Math.max(0, ...ids.slice(0, 5).map((id, i) => (ART.enemy.bounds(id).right ? lanes[5 - n + i] + ART.enemy.bounds(id).right + 10 - 1280 : 0))));
    ART.hero.draw(ctx, 'hanae', { x: 330, y: 520, s: 1, pose: 'idle', t });
    ART.hero.draw(ctx, 'kuro', { x: 170, y: 508, s: 0.94, pose: 'idle', t: t + 0.7 });
    ids.slice(0, 5).forEach((id, i) => {
      const pose = poses[i % poses.length], sp = SPECS[id];
      if (!sp) return;
      ART.enemy.draw(ctx, id, { x: lanes[5 - n + i] - fit, y: 520, s: 1, pose, t: t + i * 0.4, pt: params.pt !== undefined ? num(params.pt, 0) : KEYPT[pose] || 0, phase: params.phase | 0, hpPct: params.hp === undefined ? 1 : params.hp });
    });
    ctx.restore();
  }
  ART.sheet('enemy1_dev', (canvas, params) => {
    const ctx = canvas.getContext('2d'), W = params.w, H = params.h, t = num(params.t, 0);
    if (params.combat) { combatMock(ctx, params, String(params.id || 'kappa').split(',').filter((id) => SPECS[id])); return; }
    const ids = !params.id || params.id === 'all' ? IDS : String(params.id).split(',').filter((id) => SPECS[id]);
    const pts = params.pts !== undefined ? String(params.pts).split(',').map(Number) : null;               // pts=0.1,0.2,..: one pose across several pt values
    const poses = pts ? pts.map(() => String(params.pose || 'idle').split(',')[0]) : params.pose === 'all' ? POSES : String(params.pose || 'idle').split(',');
    const cols = poses.length, rows = ids.length, cw = W / cols, ch = H / rows;
    const gy = H * (rows === 1 ? 0.9 : 0.86);
    if (params.grove === 0 || params.grove === false) { ctx.fillStyle = '#3a2f52'; ctx.fillRect(0, 0, W, H); } else bay(ctx, W, H, t, gy);
    ids.forEach((id, r) => poses.forEach((pose, c) => {
      const sp = SPECS[id], b = sp.bounds;
      const s = params.zoom ? num(params.zoom, 1) : Math.min(cw * 0.92 / b.w, (ch * (rows === 1 ? 0.9 : 0.86)) / (b.h * 1.04));
      const pt = pts ? pts[c] : params.pt !== undefined ? num(params.pt, 0) : KEYPT[pose] || 0;
      const y = rows === 1 ? gy : r * ch + ch * 0.9;
      ART.enemy.draw(ctx, id, { x: c * cw + cw / 2, y, s, pose, t: t + c * 0.31, pt, phase: params.phase | 0, hpPct: params.hp === undefined ? 1 : params.hp });
      ctx.font = '600 12px system-ui'; ctx.fillStyle = 'rgba(255,248,240,0.9)'; ctx.textAlign = 'left';
      ctx.fillText(id + ' / ' + pose + (pts ? ' pt ' + pts[c] : ''), c * cw + 8, r * ch + 16);
    }));
  });

  // the roster order for the sheets: Creatures, Rivals, Sidekicks (the Headliner has its own sheet)
  function chapterIds() {
    const r = (DATA.ROSTER && DATA.ROSTER[1]) || [], ord = { normal: 0, elite: 1, minion: 2 };
    return r.filter((x) => SPECS[x.id] && x.tier !== 'boss').sort((a, b) => ord[a.tier] - ord[b.tier]).map((x) => x.id);
  }
  ART.sheet('enemies1', (canvas, params) => {
    const ids = chapterIds(), poses = String(params.poses || 'idle,telegraph,attack').split(','), t = num(params.t, 0);
    const cells = ids.map((id) => ({ id, label: id + '  (' + ((DATA.enemies[id] || {}).tier || '?') + ', ' + ((DATA.enemies[id] || {}).size || '?') + ')' }));
    ART.sheetGrid(canvas, params, cells, (g, cell, w, h) => {
      bay(g, w, h, t, h * 0.9);
      const n = poses.length, slot = w / n, b = ART.enemy.bounds(cell.id);
      poses.forEach((pose, k) => {
        const s = Math.min(slot * 0.98 / b.w, h * 0.9 / b.h);
        ART.enemy.draw(g, cell.id, { x: slot * (k + 0.5), y: h * 0.9, s, pose, t: t + k * 0.31, pt: params.pt !== undefined ? num(params.pt, 0) : KEYPT[pose] || 0 });
      });
    }, { cols: 4, title: 'Act I, Blossom Bay: ' + poses.join(', ') + ' (params poses=a,b,c  t=)', gap: 6, labelH: 16, cellBg: false });
  });
  ART.sheet('boss1', (canvas, params) => {
    const ctx = canvas.getContext('2d'), W = params.w, H = params.h, t = num(params.t, 0), id = 'boss_kuzunoha';
    const poses = ['telegraph', 'attack', 'hurt', 'block', 'buff', 'die'], phases = params.phase !== undefined ? [params.phase | 0] : [0, 1];
    ctx.fillStyle = pal.night; ctx.fillRect(0, 0, W, H);
    const rowH = H / phases.length, big = Math.min(W * 0.34, 560), small = (W - big) / poses.length, b = ART.enemy.bounds(id);
    phases.forEach((ph, r) => {
      const y0 = r * rowH;
      ctx.save(); ctx.beginPath(); ctx.rect(0, y0, W, rowH); ctx.clip(); ctx.translate(0, y0);
      bay(ctx, W, rowH, t, rowH * 0.9);
      ART.enemy.draw(ctx, id, { x: big * 0.58, y: rowH * 0.9, s: Math.min(big * 0.98 / b.w, rowH * 0.92 / b.h), pose: 'idle', t, pt: 0, phase: ph });
      poses.forEach((pose, k) => {
        const s = Math.min(small * 0.98 / b.w, rowH * 0.7 / b.h);
        ART.enemy.draw(ctx, id, { x: big + small * (k + 0.5), y: rowH * 0.9, s, pose, t: t + k * 0.3, pt: KEYPT[pose] || 0, phase: ph });
        ctx.font = '600 12px system-ui'; ctx.fillStyle = 'rgba(255,248,240,0.9)'; ctx.textAlign = 'center'; ctx.fillText(pose, big + small * (k + 0.5), rowH - 6);
      });
      ctx.font = '700 15px system-ui'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff8f0'; ctx.fillText('Kraki, both forms: ' + (ph ? 'phase 1, Unmasked (wheel of mics, mask halves, sound rings)' : 'phase 0, Masked (loose fan, the glossy mask)') + '  idle', 12, 22);
      ctx.restore();
    });
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(0, rowH - 1, W, 2);
  });
  ART.sheet('enemies1_anim', (canvas, params) => {
    const ctx = canvas.getContext('2d'), W = params.w, H = params.h, t = num(params.t, 0);
    const pair = [SPECS[params.a] ? params.a : 'kappa', SPECS[params.b] ? params.b : 'bamboo_boar'], N = num(params.n, 10);
    const rows = [];
    pair.forEach((id) => { rows.push({ id, pose: 'telegraph', label: 'telegraph wind-up (0 to 340 ms, then it holds)', span: 0.5 }); rows.push({ id, pose: 'attack', label: 'attack (0 to 420 ms)', span: 0.42 }); rows.push({ id, pose: 'die', label: 'win-over (0 to 700 ms)', span: 0.7 }); });
    const rh = H / rows.length, cw = W / N;
    ctx.fillStyle = pal.night; ctx.fillRect(0, 0, W, H);
    rows.forEach((row, r) => {
      const y0 = r * rh;
      ctx.save(); ctx.beginPath(); ctx.rect(0, y0, W, rh); ctx.clip(); ctx.translate(0, y0);
      bay(ctx, W, rh, t, rh * 0.86);
      const b = ART.enemy.bounds(row.id), s = Math.min(cw * 1.02 / b.w, rh * 0.84 / b.h);
      for (let i = 0; i < N; i++) {
        const pt = row.span * i / (N - 1);
        ART.enemy.draw(ctx, row.id, { x: cw * (i + 0.5), y: rh * 0.86, s, pose: row.pose, t: t + pt, pt });
        ctx.font = '500 10px system-ui'; ctx.fillStyle = 'rgba(255,248,240,0.85)'; ctx.textAlign = 'center'; ctx.fillText(Math.round(pt * 1000) + 'ms', cw * (i + 0.5), rh - 3);
        if (i) { ctx.fillStyle = 'rgba(20,15,46,0.35)'; ctx.fillRect(cw * i - 0.5, 0, 1, rh); }
      }
      ctx.font = '700 13px system-ui'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff8f0'; ctx.fillText(row.id + ' / ' + row.label, 8, 16);
      ctx.restore();
    });
  });
})();
