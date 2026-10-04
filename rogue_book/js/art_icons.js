// Inkwoven -- ART.icon: the icon artist. Every small pictogram of the game, drawn in the house style (calligraphic ink line, hard cel shading,
// rim light, gloss, washi grain where it helps). Extends ART (art.js): REPLACES the ART.icon placeholder by plain assignment.
//
// PUBLIC API (DESIGN 5.6, ART_BIBLE 5)
//   ART.icon.draw(ctx, kind, id, x, y, size, opts)
//        (x, y) is the CENTRE, size the edge of the box in px. Never throws, for any kind or id (an unknown id draws a sealed "?" token).
//        kind / id:  status  a DATA.statuses id                    relic  a relic id (art.m + art.c come from DATA.relics) OR any LISTS.relicIcons id
//                    gem     a DATA.gems id, or 'slot:red|blue|green|gold|any' (an empty socket)              tile   a LISTS.tiles id
//                    intent  a LISTS.intents id                    stat   a LISTS.statIcons id              brush  a DATA.brushes id
//                    type    a card type                           row    'front' | 'back'                  motif  a LISTS.motifs id
//        opts (all optional)
//                    n      a number (or short string) painted in heavy comic lettering at the lower right: the intent's damage, a stack count.
//                           For status icons n = 0 draws nothing (SCENE passes {n: 0}).
//                    t      seconds (drives the live parts only: the tier 3 gem's orbiting sparkle, glow pulses, a rare relic's glint). The body is a
//                           cached sprite, so animation costs one drawImage plus a few sparkles. ART.tk.opt.reduceMotion slows it to 0.3x (ART.tk.motion()).
//                    dim    greyed and darkened (locked, unaffordable, spent)              glow   true | 0..1: an additive halo behind the icon
//                    on     lit / filled (stat icons: a full ink drop or energy orb, false draws the empty outline; a socket: glowing rim)
//                    done   tiles: the stamp fades into the ground (a resolved tile)      color  hex or a LISTS.palettes name: recolours the icon
//                                                                                          (status disc, relic palette, tile stamp, intent wash, stat, brush cells, type/row glyph, motif)
//                    pattern  true: statuses draw a pattern on the disc (buff stripes, debuff hatch, resource dots) and gems draw their glyph at
//                           1.4x. Also switched on by ART.tk.opt.colorblind (UI may set it; DESIGN 5.8 says colorblind adds patterns and bigger glyphs).
//        The body of every icon is one cached sprite per (kind, id, size, flags) through ART.sprite. The drawing box is the size x size square
//        (glows and sparkles may overshoot it: DOM callers that clip to their canvas simply lose the halo, never the icon).
//   Extras beyond DESIGN
//   ART.icon.ids(kind) -> [ids]           every id of a kind this file draws (relic: the 58 icons plus every DATA.relics id)
//   ART.icon.kinds -> the ten kinds       ART.icon.glyphOf(color) -> 'sword' | 'shield' | 'leaf' | 'star' | 'ring'  (red blue green gold any)
//   ART.icon.glyph(ctx, name, x, y, size, opts)   just the engraved gem glyph (opts.color, opts.engrave)
//   ART.icon.palettes(id) -> the palette name a relic icon id uses when no relic def says otherwise
//   Gallery sheets: icons_status icons_relics icons_gems icons_tiles icons_ui, plus icons_motifs and icons_zoom (true pixel sizes, magnified)
//        params: size=N big size, bg=paper, part=0|1 (relic motifs | real relics), ids=a,b, cols=N, flags=dim,glow,on,pattern,done, n=12, color=name or xRRGGBB, t=s
//
// LEVELS OF DETAIL. Every icon is authored in a 100 x 100 design box centred on (0, 0) (y down, key light from the upper right, so shadows fall to
// the lower left) and its detail follows the PHYSICAL pixel size (size * ART.res): d0 under 40 px (chunky, one idea per icon, outlines never under
// 1.5 px), d1 up to 76 px (facets, secondary marks), d2 above (screen-tone, paper grain, gloss bands, extra glints). UI draws statuses at 22..48,
// relics at 20..84, gems at 16..118, card type glyphs at 14..28: all of those must read.
//
// DETERMINISM. Nothing here reads a clock or the banned random call. Variation is seeded from the icon id; animation reads the t you pass.
(() => {
  'use strict';
  const tk = ART.tk, pal = tk.pal;
  const L = DATA.LISTS;
  const TAU = Math.PI * 2, PI = Math.PI;
  const clamp = tk.clamp, lerp = tk.lerp, num = tk.num;
  const sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max, floor = Math.floor, round = Math.round, atan2 = Math.atan2, sqrt = Math.sqrt;
  const INK = pal.ink, WHITE = '#fff8f0', GOLD = pal.gold, GOLD2 = pal.gold2, PAPER = pal.paper;
  const cA = (a) => (a >= 0 ? (a <= 1 ? a : 1) : 0);
  const isHex = (c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
  const REG = {};                                            // kind -> {ids, resolve(id, opts) -> spec | null}

  // ---------------------------------------------------------------------------------------------------------------
  // colour: derived tones of a base hex (memoised), palette names, and the shared neutrals
  // ---------------------------------------------------------------------------------------------------------------
  const TONES = new Map();
  function tone(base) {
    let t = TONES.get(base);
    if (!t) {
      t = { base, shade: tk.shade(base), light: tk.tint(base, 0.42), pale: tk.tint(base, 0.72), deep: tk.deep(base, 0.5), glow: tk.tint(base, 0.55), mid: tk.mix(base, INK, 0.3), dark: tk.mix(tk.shade(base), INK, 0.35) };
      if (TONES.size > 600) TONES.clear();
      TONES.set(base, t);
    }
    return t;
  }
  // a colour option: a hex, a palette name (LISTS.palettes) or nothing. Returns a hex or undefined
  function colorOpt(c) {
    if (isHex(c)) return c;
    if (typeof c === 'string' && tk.fams[c]) return tk.fams[c].base;
    return undefined;
  }
  const famOf = (name) => tk.fam(typeof name === 'string' ? name : 'ash');
  const N = {                                                // neutrals every icon shares
    white: WHITE, whiteD: '#c9b9de', steel: '#e8eef9', steelM: '#b8c4de', steelD: '#8a96c0', gold: GOLD, gold2: GOLD2, goldD: '#a8782a', goldM: '#d9a548',
    wood: '#b9773a', woodD: '#7a4420', woodL: '#e0a466', paper: PAPER, paperD: '#c9b58a', ink: INK, inkL: '#3a2f5a', red: pal.vermilion, redD: '#8d1a2c',
    cream: '#fff0cf', black: '#241a3a', bone: '#f3ead6', boneD: '#bfae8e', jade: pal.jade, azure: pal.azure, cyan: pal.cyan,
  };

  // ---------------------------------------------------------------------------------------------------------------
  // geometry helpers (shapes are control-point arrays smoothed by Catmull-Rom, {poly} is straight-edged)
  // ---------------------------------------------------------------------------------------------------------------
  const circ = (cx, cy, r, n) => tk.ellipsePts(cx, cy, r, r, n || clamp(round(r / 2) + 8, 10, 24), 0);
  const ell = (cx, cy, rx, ry, rot, n) => tk.ellipsePts(cx, cy, rx, ry, n || clamp(round(max(rx, ry) / 2) + 8, 10, 24), rot || 0);
  const poly = (pts) => ({ poly: pts });
  const rect = (x, y, w, h) => poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
  const rr = (x, y, w, h, r) => tk.rrectPts(x, y, w, h, r);   // smooth rounded rectangle (control points)
  // points of a regular star / polygon: n tips, outer radius R, inner radius r (r = R for a plain polygon), first tip at angle rot (radians, canvas orientation)
  function starPts(cx, cy, R, r, n, rot) {
    const out = [];
    rot = rot === undefined ? -PI / 2 : rot;
    for (let i = 0; i < n * 2; i++) { const a = rot + i * PI / n, rad = i % 2 ? r : R; out.push([cx + cos(a) * rad, cy + sin(a) * rad]); }
    return out;
  }
  const ngon = (cx, cy, R, n, rot) => { const out = []; rot = rot === undefined ? -PI / 2 : rot; for (let i = 0; i < n; i++) { const a = rot + i * TAU / n; out.push([cx + cos(a) * R, cy + sin(a) * R]); } return out; };
  // a quadratic and a cubic bezier sampled into points
  function bez2(p0, c, p1, n) { const o = []; n = n || 8; for (let i = 0; i <= n; i++) { const u = i / n, v = 1 - u; o.push([v * v * p0[0] + 2 * v * u * c[0] + u * u * p1[0], v * v * p0[1] + 2 * v * u * c[1] + u * u * p1[1]]); } return o; }
  function bez3(p0, c1, c2, p1, n) { const o = []; n = n || 10; for (let i = 0; i <= n; i++) { const u = i / n, v = 1 - u; o.push([v * v * v * p0[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * p1[0], v * v * v * p0[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * p1[1]]); } return o; }
  const xf = tk.xf;
  const mirrorX = (pts) => pts.map((p) => (p[2] ? [-p[0], p[1], 1] : [-p[0], p[1]]));
  // heart, teardrop and flame silhouettes as unit shapes scaled by s about (cx, cy)
  // a true heart (two lobes, a deep cleft, a pointed tip) as a dense polygon in the unit box, built once from beziers
  const HEART = (() => {
    const half = bez3([0, 0.98], [-0.42, 0.62], [-1.08, 0.3], [-1.06, -0.3], 10).concat(bez3([-1.06, -0.3], [-1.06, -0.86], [-0.42, -1.04], [-0.2, -0.78], 8), bez3([-0.2, -0.78], [-0.1, -0.68], [-0.04, -0.56], [0, -0.42], 4));
    return half.concat(half.slice(1, -1).reverse().map((p) => [-p[0], p[1]]));
  })();
  const DROP = [[0, -1, 1], [0.3, -0.55], [0.72, 0.0], [0.8, 0.48], [0.46, 0.9], [0, 1], [-0.46, 0.9], [-0.8, 0.48], [-0.72, 0.0], [-0.3, -0.55]];
  const unit = (pts, cx, cy, sx, sy) => pts.map((p) => (p[2] ? [cx + p[0] * sx, cy + p[1] * (sy === undefined ? sx : sy), 1] : [cx + p[0] * sx, cy + p[1] * (sy === undefined ? sx : sy)]));

  // ---------------------------------------------------------------------------------------------------------------
  // S: the painter handed to every icon. Design space is 100 x 100 centred on (0, 0). Outline widths never fall under a readable pixel width.
  // ---------------------------------------------------------------------------------------------------------------
  function makeS(g, size, o) {
    o = o || {};
    const res = ART.res > 0 ? ART.res : 1;
    const kp = size * res / 100;                              // physical pixels per design unit
    const d = kp >= 0.76 ? 2 : kp >= 0.4 ? 1 : 0;
    const S = { g, size, kp, d, res, seed: o.seed | 0, id: o.id || '', opts: o.opts || {}, pattern: !!o.pattern, on: !!o.on };
    const minL = d === 0 ? 1.5 : d === 1 ? 1.2 : 1.05, minT = d === 0 ? 1.0 : d === 1 ? 0.85 : 0.7;
    S.L = (w) => max(w, minL / kp);                           // outlines
    S.T = (w) => max(w, minT / kp);                           // thin detail strokes
    S.rng = (salt) => tk.rng('ic', S.id, S.seed, salt === undefined ? '' : salt);
    S.pulse = (period, phase) => (S.opts.t !== undefined ? 0.5 + 0.5 * sin(TAU * (num(S.opts.t, 0) / (period || 2) + (phase || 0))) : 0.5);
    // cel fill with the house defaults: ink outline, hard shadow, rim light, a lit edge when there is room for it
    S.cel = (shape, base, oo) => {
      const o2 = Object.assign({ line: S.L(2.6), hi: d ? 'auto' : undefined, hiW: S.L(1.8), seed: S.seed, shadowT: 0.3, rimW: S.L(1.3), rimAlpha: 0.9 }, oo);
      if (o2.halftone) o2.halftone = Object.assign({ color: INK }, o2.halftone === true ? {} : o2.halftone);
      if (d < 2) o2.halftone = undefined;
      tk.celFill(g, shape, base, o2);
    };
    // pale glyph fill on a coloured disc: white with a lavender shadow
    S.pale = (shape, base, oo) => S.cel(shape, base || WHITE, Object.assign({ shadow: N.whiteD, hi: false, line: S.L(2.4), shadowT: 0.2 }, oo));
    S.line = (pts, oo) => tk.inkPath(g, pts, Object.assign({ color: INK, wobble: 0.05, seed: S.seed }, oo, { w: S.L((oo && oo.w) || 2.2) }));
    S.ink = (pts, oo) => tk.inkPath(g, pts, Object.assign({ color: INK, wobble: 0.05, seed: S.seed }, oo, { w: S.T((oo && oo.w) || 1.4) }));
    // an outlined stroke: an ink stroke underneath, the colour on top (flat pressure so it reads as a brush-drawn bar)
    S.stroke = (pts, w, color, oo) => {
      oo = oo || {};
      const ow = S.L(oo.ow === undefined ? 2 : oo.ow), ts = oo.taperStart === undefined ? 0 : oo.taperStart, te = oo.taperEnd === undefined ? 0 : oo.taperEnd;
      const shape = oo.poly ? poly(pts) : pts;
      tk.inkPath(g, shape, { w: w + ow * 2, color: INK, taperStart: ts, taperEnd: te, pressure: 'flat', wobble: 0.03, seed: S.seed, step: oo.step || 4 });
      tk.inkPath(g, shape, { w, color, taperStart: ts, taperEnd: te, pressure: 'flat', wobble: 0.02, seed: S.seed + 1, step: oo.step || 4, alpha: oo.alpha });
    };
    S.fill = (shape, color, alpha) => {
      g.save(); if (alpha !== undefined) g.globalAlpha *= cA(alpha);
      g.beginPath(); tk.trace(g, shape); g.fillStyle = color; g.fill(); g.restore();
    };
    S.circle = (x, y, r, color, alpha) => { g.save(); if (alpha !== undefined) g.globalAlpha *= cA(alpha); g.beginPath(); g.arc(x, y, max(0.1, r), 0, TAU); g.fillStyle = color; g.fill(); g.restore(); };
    S.ring = (x, y, r, w, color, alpha) => { g.save(); if (alpha !== undefined) g.globalAlpha *= cA(alpha); g.beginPath(); g.arc(x, y, max(0.1, r), 0, TAU); g.strokeStyle = color; g.lineWidth = S.T(w); g.stroke(); g.restore(); };
    S.glow = (x, y, r, color, a) => tk.glow(g, x, y, r, isHex(color) ? color : pal.gold2, a === undefined ? 0.5 : a);
    S.spark = (x, y, r, oo) => { if (d === 0 && r < 5) return; tk.sparkle(g, x, y, r, Object.assign({ color: WHITE, glow: d ? 0.4 : 0 }, oo)); };
    S.at = (x, y, a, sx, sy, fn) => { g.save(); g.translate(x, y); if (a) g.rotate(a); if (sx !== undefined) g.scale(sx, sy === undefined ? sx : sy); fn(); g.restore(); };
    S.clip = (shape, fn) => { g.save(); g.beginPath(); tk.trace(g, shape); g.clip(); fn(); g.restore(); };
    // a small anime gloss arc (white, tapered) hugging a circle of radius r between two angles
    S.gloss = (cx, cy, r, a0, a1, w, alpha) => { g.save(); g.globalAlpha *= cA(alpha === undefined ? 0.6 : alpha); tk.inkPath(g, tk.arcPts(cx, cy, r, r, a0, a1, 8), { w: S.T(w || 3), color: '#ffffff', taper: 0.4, wobble: 0, pressure: 'mid' }); g.restore(); };
    S.text = (str, x, y, sz, oo) => tk.inkText(g, str, x, y, sz, Object.assign({ skew: 0, fill: WHITE, stroke: INK, strokeW: sz * 0.2 }, oo));
    return S;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // the draw pipeline: resolve a spec, blit its cached sprite, then the cheap live parts (glow, number, sparkles)
  // ---------------------------------------------------------------------------------------------------------------
  const PAD = 0.08;
  function flagsOf(o, kind) {
    return (o.dim ? 'd' : '') + (o.done ? 'x' : '') + litOf(kind, o) + (o.pattern || (tk.opt && tk.opt.colorblind) ? 'p' : '') + (colorOpt(o.color) ? 'c' + colorOpt(o.color).slice(1) : '');
  }
  // lit / filled: stat icons are lit unless on is exactly false; everything else is lit only when on is truthy
  function litOf(kind, o) { return kind === 'stat' ? (o.on === false ? '' : 'o') : (o.on ? 'o' : ''); }
  function bodySprite(kind, spec, size, o) {
    const qs = max(4, round(size * 2) / 2);
    const flags = flagsOf(o, kind);
    const pad = Math.ceil(qs * PAD), W = qs + pad * 2;
    const key = 'ic|' + kind + '|' + spec.key + '|' + qs + '|' + flags;
    const spr = ART.sprite(key, W, W, (g) => {
      g.translate(W / 2, W / 2);
      const S = makeS(g, qs, { id: spec.key, opts: o, pattern: flags.indexOf('p') >= 0, on: litOf(kind, o) === 'o' });
      g.scale(qs / 100, qs / 100);
      spec.render(S, o);
      if (o.dim || o.done) {
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = o.done ? tk.rgba(PAPER, 0.62) : tk.rgba(pal.indigo, 0.52);
        g.fillRect(-60, -60, 120, 120);
        g.globalCompositeOperation = 'source-over';
      }
    });
    return { spr, W, qs };
  }
  function liveNumber(ctx, x, y, size, n, kind) {
    const s = String(n);
    const fs = clamp(size * (s.length > 2 ? 0.28 : 0.38), 9, 56);
    ctx.save();
    ctx.font = '900 ' + fs + 'px ' + tk.font.num;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.miterLimit = 2;
    const tx = x + size * 0.5 + (kind === 'intent' ? size * 0.02 : 0), ty = y + size * 0.5 - fs * 0.32;
    ctx.lineWidth = max(2.4, fs * 0.28); ctx.strokeStyle = INK; ctx.strokeText(s, tx, ty, size * 1.1);
    ctx.fillStyle = WHITE; ctx.fillText(s, tx, ty, size * 1.1);
    ctx.restore();
  }
  function draw(ctx, kind, id, x, y, size, opts) {
    try {
      size = size > 0 && isFinite(size) ? size : 24;
      x = num(x, 0); y = num(y, 0);
      const o = opts && typeof opts === 'object' ? opts : {};
      const R = REG[kind];
      const sid = String(id);
      const spec = (R && R.resolve(sid, o)) || unknownSpec(kind, sid);
      const t = num(o.t, 0) * tk.motion();
      const alpha = o.dim ? 0.72 : o.done ? 0.5 : 1;
      if (o.glow && spec.glow) {
        const gk = o.glow === true ? 1 : clamp(num(o.glow, 1), 0, 1);
        const pulse = o.t === undefined ? 0.85 : 0.75 + 0.25 * sin(t * 3.2);
        tk.glow(ctx, x, y, size * 0.85, spec.glow, gk * 0.7 * pulse * (o.dim ? 0.4 : 1));
      }
      const b = bodySprite(kind, spec, size, o);
      const sc = size / b.qs, Ws = b.W * sc;
      ART.blit(ctx, b.spr, x - Ws / 2, y - Ws / 2, Ws, Ws, alpha);
      if (spec.live) spec.live(ctx, x, y, size, t, o);
      if (o.n !== undefined && o.n !== null && o.n !== '' && !(kind === 'status' && (o.n === 0 || o.n === '0'))) liveNumber(ctx, x, y, size, o.n, kind);
    } catch (e) {
      try { fallbackDot(ctx, num(x, 0), num(y, 0), size); } catch (e2) { /* nothing left to do */ }
    }
  }
  function fallbackDot(ctx, x, y, size) {
    const r = (size > 0 ? size : 24) * 0.4;
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = N.steelD; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
  }
  // an unknown id: a sealed ink-grey token with a "?" (never a coloured debug box: it must look like the game)
  function unknownSpec(kind, id) {
    return {
      key: 'unknown|' + kind,
      render(S) {
        S.cel(circ(0, 0, 42), N.steelD, { line: S.L(3.2), depth: 8, rim: N.steel });
        S.text('?', 0, 3, 56, { fill: N.paper });
      },
    };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // shared drawn objects
  // ---------------------------------------------------------------------------------------------------------------
  // a straight sword centred on the origin, tip at (0, -len / 2): blade, guard, grip, pommel. o: len w blade guard grip broken
  function sword(S, o) {
    o = o || {};
    const len = o.len || 66, w = o.w || 11, top = -len / 2, gy = top + len * 0.62, hw = w / 2;
    const blade = o.broken
      ? [[-hw, gy], [-hw * 1.03, top + len * 0.42], [-hw * 0.4, top + len * 0.36], [hw * 0.1, top + len * 0.46], [hw * 0.7, top + len * 0.38], [hw * 1.03, top + len * 0.44], [hw, gy]]
      : [[-hw, gy], [-hw * 1.03, top + len * 0.3], [0, top, 1], [hw * 1.03, top + len * 0.3], [hw, gy]];
    S.cel(poly(blade), o.blade || N.steel, { line: S.L(2.2), shadow: N.steelD, depth: max(2, w * 0.4), hi: S.d ? '#ffffff' : undefined, rim: S.d ? '#ffffff' : undefined, rimW: S.L(0.9) });
    if (S.d) S.ink([[0, gy - 2], [0, top + len * (o.broken ? 0.5 : 0.12)]], { w: 0.9, color: N.steelD, alpha: 0.7, taper: 0.3 });
    S.cel(rr(-w * 1.15, gy, w * 2.3, w * 0.5, w * 0.2), o.guard || N.gold, { line: S.L(2), shadow: N.goldD, hi: false, tension: 0.5 });
    S.cel(rect(-hw * 0.7, gy + w * 0.5, hw * 1.4, len * 0.24), o.grip || N.redD, { line: S.L(2), hi: false, shadow: '#4a0e22' });
    S.cel(circ(0, gy + w * 0.5 + len * 0.27, hw * 0.75, 10), o.guard || N.gold, { line: S.L(1.8), hi: false, shadow: N.goldD });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // STATUS: 20 discs. buffs on warm and blue, debuffs on red-violet, resources on hero-coloured discs with a gold rim
  // ---------------------------------------------------------------------------------------------------------------
  const STATUS_LOOK = {
    might: ['#f5b83c', 'buff'], bulwark: ['#4f8fe8', 'buff'], regen: ['#ff8a78', 'buff'], thorns: ['#2f9fbf', 'buff'], dodge: ['#7cc8ff', 'buff'], taunt: ['#f2683c', 'buff'],
    ritual: ['#6a5be8', 'buff'], plating: ['#6a86d8', 'buff'],
    bloom: ['#ff7eb6', 'resource'], sumi: ['#7a6bff', 'resource'], ward: ['#a9c4ff', 'resource'], charge: ['#ff9a2e', 'resource'],
    vulnerable: ['#c22f5a', 'debuff'], weak: ['#a83c8a', 'debuff'], frail: ['#8f4ab0', 'debuff'], poison: ['#6a3a9a', 'debuff'], burn: ['#c8303c', 'debuff'],
    stun: ['#7a45c8', 'debuff'], bind: ['#8a3a78', 'debuff'], mark: ['#b0245c', 'debuff'],
  };
  const GLYPH = {};                                          // status id -> fn(S, tone)

  function statusDisc(S, base, kind) {
    const f = tone(base), r = 44;
    if (kind === 'resource') {
      // a medal: gold outer ring, the hero colour inside
      S.cel(circ(0, 0, r), N.gold, { line: S.L(3.2), shadow: N.goldD, depth: 7, rim: N.gold2, rimW: S.L(1.4), hi: S.d ? N.gold2 : undefined });
      S.cel(circ(0, 0, r - 6.5), base, { line: S.L(2.2), depth: 7, rim: f.glow, rimW: S.L(1.4), hi: S.d ? 'auto' : undefined, halftone: { d: 5.5, alpha: 0.34 } });
    } else {
      S.cel(circ(0, 0, r), base, { line: S.L(3.4), depth: 9, rim: f.glow, rimW: S.L(1.8), hi: S.d ? 'auto' : undefined, hiW: S.L(3), halftone: { d: 5.5, alpha: kind === 'debuff' ? 0.5 : 0.34 } });
      if (kind === 'debuff') {
        // a dark inner bezel with tiny crack ticks: the sick, torn look
        S.ring(0, 0, r - 5.5, 2.2, tone(base).dark, 0.85);
        if (S.d) for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + 0.4; S.ink([[cos(a) * (r - 1), sin(a) * (r - 1)], [cos(a + 0.06) * (r - 7), sin(a + 0.06) * (r - 7)]], { w: 1.4, color: INK, alpha: 0.6, taper: 0.5, wobble: 0 }); }
      } else {
        S.ring(0, 0, r - 5, 1.7, f.pale, 0.55);
      }
    }
    if (S.d) S.gloss(0, 0, r - 11, -PI * 0.42, -PI * 0.08, 3.2, 0.5);
  }
  function patternOn(S, kind, base) {
    if (!S.pattern) return;
    const g = S.g, f = tone(base);
    S.clip(circ(0, 0, 43), () => {
      g.globalAlpha = 0.38;
      if (kind === 'buff') { for (let i = -6; i <= 6; i++) S.ink([[i * 8, -46], [i * 8, 46]], { w: 2.2, color: f.pale, taper: 0, pressure: 'flat', wobble: 0 }); }
      else if (kind === 'debuff') { for (let i = -8; i <= 8; i++) S.ink([[i * 9 - 46, 46], [i * 9 + 46, -46]], { w: 2.4, color: INK, taper: 0, pressure: 'flat', wobble: 0 }); }
      else { for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) S.circle(i * 9 + (j % 2 ? 4.5 : 0), j * 9, 1.7, f.pale); }
      g.globalAlpha = 1;
    });
  }
  function statusSpec(id) {
    const look = STATUS_LOOK[id];
    if (!look) return null;
    return {
      key: 'status|' + id, glow: look[0],
      render(S, o) {
        const base = colorOpt(o.color) || look[0];
        statusDisc(S, base, look[1]);
        patternOn(S, look[1], base);
        if (GLYPH[id]) GLYPH[id](S, tone(base));
        if (S.d >= 2) tk.paperGrain(S.g, -50, -50, 100, 100, { alpha: 0.16 });
      },
    };
  }
  REG.status = { ids: Object.keys(STATUS_LOOK), resolve: (id) => statusSpec(id) };

  // ---- the 20 pictograms (design box, glyph radius about 30)
  GLYPH.might = (S) => {
    S.spark(-24, -22, 8, { color: N.gold2 }); S.spark(26, 20, 5.5, { color: N.gold2, rot: 0.4 });
    S.at(2, 1, 0.6, 1, 1, () => sword(S, { len: S.d ? 68 : 72, w: S.d ? 11 : 15 }));
  };
  GLYPH.bulwark = (S) => {
    const shield = [[-25, -26], [0, -32, 1], [25, -26], [25, -2], [17, 17], [0, 33, 1], [-17, 17], [-25, -2]];
    S.pale(poly(shield.map((p) => [p[0], p[1]])), WHITE, { line: S.L(2.6), depth: 6, tension: 0.4 });
    S.fill(poly([[-3.5, -18], [3.5, -18], [3.5, -4], [17, -4], [17, 3], [3.5, 3], [3.5, 18], [-3.5, 18], [-3.5, 3], [-17, 3], [-17, -4], [-3.5, -4]]), '#3a72d0');
    S.ink([[-3.5, -18], [3.5, -18], [3.5, -4], [17, -4], [17, 3], [3.5, 3], [3.5, 18], [-3.5, 18], [-3.5, 3], [-17, 3], [-17, -4], [-3.5, -4], [-3.5, -18]], { w: 1.6, color: '#1e3f8a', taper: 0, pressure: 'flat', wobble: 0 });
  };
  GLYPH.regen = (S) => {
    S.pale(poly(unit(HEART, 0, 4, 30, 28)), WHITE, { line: S.L(2.6), depth: 6, shadow: '#ffc2c8' });
    const plus = (x, y, r, col) => S.fill(poly([[x - r * 0.32, y - r], [x + r * 0.32, y - r], [x + r * 0.32, y - r * 0.32], [x + r, y - r * 0.32], [x + r, y + r * 0.32], [x + r * 0.32, y + r * 0.32], [x + r * 0.32, y + r], [x - r * 0.32, y + r], [x - r * 0.32, y + r * 0.32], [x - r, y + r * 0.32], [x - r, y - r * 0.32], [x - r * 0.32, y - r * 0.32]]), col);
    plus(0, 2, 12, '#33c26a');
    if (S.d) S.spark(24, -26, 6, { color: WHITE });
    S.spark(-25, -24, 5, { color: '#c8ffd8' });
  };
  GLYPH.thorns = (S, f) => {
    // a wreath of thorns: eight hooked spikes, every one leaning the same way like rose thorns on a vine
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const a = -PI / 2 + i * PI / 4;
      pts.push([cos(a) * 33, sin(a) * 33]);
      pts.push([cos(a + 0.5) * 18, sin(a + 0.5) * 18]);
    }
    S.pale(poly(pts), WHITE, { line: S.L(2.4), depth: 5 });
    S.circle(0, 0, 11, f.deep); S.ring(0, 0, 11, 2.4, INK);
    S.gloss(0, 0, 14.5, -PI * 0.85, -PI * 0.3, 2, 0.45);
  };
  GLYPH.dodge = (S, f) => {
    S.stroke([[-30, -12], [-12, -18], [10, -18], [22, -10], [19, 0], [10, -4]], 6, WHITE, { ow: 2, taperStart: 0.1, taperEnd: 0.25 });
    S.stroke([[-30, 4], [-6, 0], [16, 2], [28, 10], [22, 20], [13, 15]], 6, WHITE, { ow: 2, taperStart: 0.1, taperEnd: 0.25 });
    S.stroke([[-22, 20], [-6, 18], [4, 20]], 4.4, WHITE, { ow: 1.8, taperStart: 0.1, taperEnd: 0.3 });
    if (S.d) S.spark(-24, -22, 6, { color: WHITE });
  };
  GLYPH.taunt = (S) => {
    const burst = starPts(0, 0, 33, 21, 9, -PI / 2);
    S.pale(poly(burst), WHITE, { line: S.L(2.4), depth: 5 });
    S.stroke([[0, -19], [0, 5]], 8, N.red, { ow: 2, taperStart: 0, taperEnd: 0.12 });
    S.circle(0, 15.5, 5, N.red); S.ring(0, 15.5, 5, 2.2, INK);
  };
  GLYPH.ritual = (S, f) => {
    S.ring(0, 0, 31, 3.6, N.gold2); S.ring(0, 0, 31, 1.4, INK, 0.7);
    S.pale(poly(starPts(0, 0, 27, 15.6, 6, -PI / 2)), N.gold2, { shadow: N.goldM, line: S.L(2.3), depth: 4 });
    S.circle(0, 0, 5, N.red); S.ring(0, 0, 5, 1.8, INK);
  };
  GLYPH.plating = (S) => {
    // a lacquered cuirass: shoulder straps, a neck notch, horizontal steel plates and a red lacing down the middle
    const body = [[-9, -31], [-27, -29], [-33, -17], [-25, -8], [-22, 3], [-27, 21], [-25, 32], [25, 32], [27, 21], [22, 3], [25, -8], [33, -17], [27, -29], [9, -31], [6, -23], [-6, -23]];
    S.pale(poly(body), '#eaf0fb', { line: S.L(2.5), depth: 6, shadow: '#a9b4dc' });
    S.clip(poly(body), () => {
      [-5, 9, 23].forEach((y) => S.stroke([[-34, y], [34, y]], 3.4, '#a9b4dc', { ow: 0, alpha: 0.9 }));
    });
    S.stroke([[0, -21], [0, 31]], 3.6, N.red, { ow: 1.2 });
    if (S.d) [-5, 9, 23].forEach((y) => { S.circle(-14, y - 5, 1.9, N.gold); S.circle(14, y - 5, 1.9, N.gold); });
  };
  GLYPH.bloom = (S, f) => {
    const petal = (a) => S.at(0, 0, a, 1, 1, () => S.pale([[0, -3], [-11, -14], [-9, -28], [-3, -31, 1], [0, -26], [3, -31, 1], [9, -28], [11, -14]], '#fff4f8', { line: S.L(2.2), depth: 3.5, shadow: '#ffc2dc', tension: 0.8 }));
    for (let i = 0; i < 5; i++) petal(i * TAU / 5);
    S.circle(0, 0, 6.5, N.gold); S.ring(0, 0, 6.5, 2, INK);
  };
  GLYPH.sumi = (S, f) => {
    // Breath: a white breath curl (three stacked wind spirals) rising from a short flute mouthpiece, two cyan dots
    const curl = (y, k) => S.stroke([[-20 * k, y + 3], [-6 * k, y - 3], [10 * k, y - 3], [18 * k, y + 2], [15 * k, y + 8], [8 * k, y + 5], [9 * k, y + 1]], 4.2, '#ffffff', { ow: 1.4, taperStart: 0.15, taperEnd: 0.2 });
    curl(-24, 0.9); curl(-8, 1); curl(8, 0.8);
    S.cel(rr(-15, 22, 30, 10, 4), N.black, { line: S.L(2.2), shadow: '#100a24', depth: 2, hi: false, tension: 0.5 });
    S.stroke([[-8, 27], [8, 27]], 2.6, N.gold, { ow: 0 });
    S.circle(-3, 18, 2.2, pal.cyan); S.circle(5, 15, 1.8, pal.cyan);
    S.spark(22, -26, 5, { color: pal.cyan });
  };
  GLYPH.ward = (S) => {
    S.at(0, 0, -0.14, 1, 1, () => {
      S.pale([[-13, -32], [13, -32], [13, 32], [-13, 32]].map((p) => p), '#fffdf6', { line: S.L(2.4), depth: 4, tension: 0.2, shadow: '#dcd3c0' });
      S.fill(poly([[-13, -32], [13, -32], [13, -22], [0, -15], [-13, -22]]), N.red, 0.95);
      S.ink([[-13, -32], [13, -32], [13, -22], [0, -15], [-13, -22], [-13, -32]], { w: 1.6, taper: 0, pressure: 'flat', wobble: 0 });
      S.stroke([[0, -9], [0, 22]], 4.4, N.red, { ow: 0, taperStart: 0, taperEnd: 0.4 });
      S.stroke([[-7, 1], [7, 1]], 3.4, N.red, { ow: 0 }); S.stroke([[-6, 12], [6, 12]], 3.4, N.red, { ow: 0 });
    });
  };
  GLYPH.charge = (S) => {
    const bolt = [[12, -34], [-16, 4], [-3, 4], [-11, 34], [18, -6], [4, -6], [16, -34]];
    S.glow(0, 0, 40, N.gold2, 0.5);
    S.cel(poly(bolt), '#fff2a0', { line: S.L(2.6), shadow: '#f3b830', depth: 5, rim: '#ffffff', hi: false });
  };
  GLYPH.vulnerable = (S) => {
    const shield = [[-25, -26], [0, -32], [25, -26], [25, -2], [17, 17], [0, 33], [-17, 17], [-25, -2]];
    S.pale(poly(shield), WHITE, { line: S.L(2.6), depth: 6, tension: 0.4 });
    S.stroke([[2, -31], [-6, -14], [7, -6], [-5, 8], [5, 18], [0, 32]], 5.5, INK, { ow: 0, poly: true, step: 3 });
    S.stroke([[2, -31], [-6, -14], [7, -6], [-5, 8], [5, 18], [0, 32]], 2.2, '#ff5a6e', { ow: 0, poly: true, step: 3 });
  };
  GLYPH.weak = (S) => {
    S.at(-4, 3, 0.5, 1, 1, () => sword(S, { len: S.d ? 70 : 72, w: S.d ? 11.5 : 15, broken: true, blade: '#dcd6ea' }));
    // the snapped-off tip tumbling away
    S.at(21, -19, 1.05, 1, 1, () => S.cel(poly([[-5.2, 11], [-2, 7], [1.2, 12], [5.2, 8], [5.2, -3], [0, -16], [-5.2, -3]]), '#dcd6ea', { line: S.L(2), shadow: N.steelD, depth: 3, hi: false }));
    if (S.d) { S.spark(-24, -22, 5, { color: WHITE }); S.circle(29, -3, 1.6, WHITE); S.circle(24, 6, 1.4, WHITE); }
  };
  GLYPH.frail = (S) => {
    // a bone snapped in two: both halves keep a knuckle end and a jagged break, tilted away from each other
    const half = (dx, dy, rot, flip) => S.at(dx, dy, rot, flip ? -1 : 1, 1, () => {
      S.pale(poly([[-33, -4], [-31, -11], [-23, -12], [-19, -6], [-16, -4], [-7, -4], [-5, -1], [-1, -3], [1, 3], [-4, 4], [-7, 5], [-16, 4], [-19, 6], [-23, 12], [-31, 11], [-33, 4]]), N.bone, { line: S.L(2.3), depth: 3.5, shadow: N.boneD });
    });
    S.at(0, 0, -0.62, 1, 1, () => { half(-5, -1, -0.16, false); half(5, 1, -0.16, true); });
    if (S.d) { S.spark(22, -22, 5, { color: WHITE }); }
  };
  GLYPH.poison = (S) => {
    S.cel(unit(DROP, -3, 4, 21, 27), '#8de24a', { line: S.L(2.6), shadow: '#3f9a2a', depth: 6, rim: '#e6ff9a', rimW: S.L(1.6), hi: false });
    S.stroke([[-11, 6], [-11, 16]], 4.5, '#ffffff', { ow: 0, taperStart: 0.2, taperEnd: 0.4, alpha: 0.85 });
    S.circle(21, -14, 6, '#d6ffb0'); S.ring(21, -14, 6, 2, INK);
    S.circle(15, -27, 3.6, '#d6ffb0'); S.ring(15, -27, 3.6, 1.8, INK);
    if (S.d) { S.circle(26, 0, 2.6, '#d6ffb0'); }
  };
  GLYPH.burn = (S) => {
    const outer = [[0, -33, 1], [9, -19], [21, -8], [24, 8], [15, 24], [0, 32], [-15, 24], [-24, 8], [-19, -5], [-10, -14], [-8, -24]];
    S.cel(outer, '#ff8a2a', { line: S.L(2.6), shadow: '#d0451a', depth: 6, rim: '#ffd06a', hi: false });
    S.cel([[0, -12, 1], [9, 0], [13, 13], [6, 24], [0, 26], [-8, 22], [-13, 12], [-7, 0]], '#ffd83a', { line: S.L(2), shadow: '#f0a020', depth: 4, hi: false });
    S.cel([[0, 4, 1], [5, 13], [3, 21], [0, 22], [-4, 20], [-5, 12]], '#fff8d8', { line: S.L(1.6), shadow: '#ffe89a', depth: 2, hi: false });
  };
  GLYPH.stun = (S) => {
    S.g.save(); S.g.beginPath(); S.g.ellipse(0, 4, 27, 12, -0.15, 0, TAU); S.g.strokeStyle = INK; S.g.lineWidth = S.L(7); S.g.stroke(); S.g.strokeStyle = WHITE; S.g.lineWidth = S.L(3.2); S.g.stroke(); S.g.restore();
    [[-24, 0], [10, -8], [22, 15]].forEach((p, i) => S.cel(poly(starPts(p[0], p[1] - (i === 0 ? 2 : 0), 11, 5, 5, -PI / 2 + i * 0.3)), i === 1 ? N.gold2 : N.gold, { line: S.L(2), depth: 2.5, shadow: N.goldM, hi: false }));
    S.spark(0, -24, 5.5, { color: WHITE });
  };
  GLYPH.bind = (S) => {
    const link = (x, y, a, w, h, edge) => S.at(x, y, a, 1, 1, () => {
      if (edge) { S.pale(rr(-h / 2, -w / 2 + 2, h, w - 4, 4), WHITE, { line: S.L(2.3), depth: 3, tension: 0.6 }); return; }
      S.g.beginPath(); S.g.ellipse(0, 0, w / 2, h / 2, 0, 0, TAU); S.g.strokeStyle = INK; S.g.lineWidth = S.L(9.4); S.g.stroke();
      S.g.strokeStyle = WHITE; S.g.lineWidth = S.L(5); S.g.stroke();
    });
    link(-16, 14, -0.75, 26, 16, false); link(0, 0, -0.75, 20, 10, true); link(16, -14, -0.75, 26, 16, false);
  };
  GLYPH.mark = (S) => {
    S.g.save(); S.g.beginPath(); S.g.arc(0, 0, 21, 0, TAU); S.g.strokeStyle = INK; S.g.lineWidth = S.L(8.6); S.g.stroke(); S.g.strokeStyle = WHITE; S.g.lineWidth = S.L(4.2); S.g.stroke(); S.g.restore();
    [[0, -34, 0, -12], [0, 34, 0, 12], [-34, 0, -12, 0], [34, 0, 12, 0]].forEach((l) => S.stroke([[l[0], l[1]], [l[2], l[3]]], 4.2, WHITE, { ow: 1.8 }));
    S.circle(0, 0, 7.5, N.gold); S.ring(0, 0, 7.5, 2.2, INK);
  };

  // ---------------------------------------------------------------------------------------------------------------
  // STAT: gold koban, ink drop, heart with a brush stroke, energy tama orb, fude brush, inkstone, block shield
  // ---------------------------------------------------------------------------------------------------------------
  const STAT_LOOK = { gold: N.gold, ink: '#7a6bff', hp: '#e8383d', energy: '#5ff5ff', brush: '#3fd6b0', inkstone: '#6a5be8', block: '#5fb4ff' };
  const STATF = {};
  // Echo sound helpers: an outlined round-capped arc, a beamed-note head (tilted ellipse), a filled ellipse
  function arcLine(S, x, y, r, a0, a1, w, color, ow) {
    const g = S.g;
    g.save(); g.lineCap = 'round';
    if (ow !== 0) { g.beginPath(); g.arc(x, y, r, a0, a1); g.strokeStyle = INK; g.lineWidth = S.L(w + (ow === undefined ? 3 : ow)); g.stroke(); }
    g.beginPath(); g.arc(x, y, r, a0, a1); g.strokeStyle = color; g.lineWidth = S.T(w); g.stroke();
    g.restore();
  }
  function noteHead(S, x, y, rx, ry, rot, color, outline) {
    const g = S.g;
    g.save(); g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); g.fillStyle = color; g.fill();
    if (outline) { g.lineWidth = S.L(outline); g.strokeStyle = INK; g.stroke(); }
    g.restore();
  }
  STATF.gold = (S) => {
    S.at(0, 0, -0.2, 1, 1, () => {
      S.glow(0, 0, 46, N.gold2, 0.22);
      S.cel(ell(0, 0, 27, 40, 0, 22), N.gold, { line: S.L(3), shadow: N.goldD, depth: 7, rim: N.gold2, rimW: S.L(1.6), hi: S.d ? N.gold2 : undefined, hiW: S.L(2.6) });
      S.g.save(); S.g.beginPath(); tk.trace(S.g, ell(0, 0, 20.5, 33.5, 0, 22)); S.g.strokeStyle = N.goldD; S.g.lineWidth = S.T(2.4); S.g.stroke(); S.g.restore();
      // the hammered koban marks: a crest on top, three bars in the middle, a maker's dot below
      S.circle(0, -22, 5, N.goldD); S.circle(0, -22, 2.3, N.gold2);
      [-7, 2, 11].forEach((y, i) => S.stroke([[-10 + i * 0.5, y], [10 - i * 0.5, y]], 3.2, N.goldD, { ow: 0 }));
      S.circle(0, 24, 2.6, N.goldD);
      if (S.d) { S.ink([[-14, -8], [-14, 12]], { w: 1.3, color: N.goldM, alpha: 0.9 }); S.ink([[14, -8], [14, 12]], { w: 1.3, color: N.goldM, alpha: 0.9 }); }
    });
    S.spark(20, -30, 7, { color: WHITE });
  };
  STATF.ink = (S) => {
    // the Echo ping: a solid centre, one full ring, an outer ring broken into left and right arcs
    if (S.on) {
      S.glow(0, 0, 46, '#7a6bff', 0.4);
      S.cel(circ(0, 0, 13), '#5a4ae0', { line: S.L(2.6), shadow: '#1e1670', depth: 5, rim: pal.cyan, rimW: S.L(1.6), hi: S.d ? '#8a7bff' : undefined, hiW: S.L(2) });
      arcLine(S, 0, 0, 24, 0, TAU, 6, '#7a6bff', 3);
      arcLine(S, 0, 0, 36, -0.75, 0.75, 5, pal.cyan, 2.6);
      arcLine(S, 0, 0, 36, PI - 0.75, PI + 0.75, 5, pal.cyan, 2.6);
      S.spark(22, -22, 6.5, { color: pal.cyan });
    } else {
      // the spent ping: the same three shapes as a dashed outline, so an Echo meter reads full versus empty
      const g = S.g;
      S.fill(circ(0, 0, 13), '#3a2f5a', 0.4);
      g.save(); g.setLineDash([S.T(6), S.T(5)]); g.strokeStyle = '#8a86a8'; g.lineWidth = S.L(2.6);
      g.beginPath(); g.arc(0, 0, 13, 0, TAU); g.stroke();
      g.beginPath(); g.arc(0, 0, 24, 0, TAU); g.stroke();
      g.beginPath(); g.arc(0, 0, 36, -0.75, 0.75); g.stroke();
      g.beginPath(); g.arc(0, 0, 36, PI - 0.75, PI + 0.75); g.stroke();
      g.restore();
    }
  };
  STATF.hp = (S) => {
    // the brush swash under the heart, then the heart
    S.g.save(); S.g.globalAlpha *= S.on ? 1 : 0.6;
    S.stroke([[-46, 22], [-22, 33], [6, 36], [30, 30], [46, 14]], 8, N.paper, { ow: 2.4, taperStart: 0.3, taperEnd: 0.4 });
    S.g.restore();
    if (S.on) {
      S.glow(0, 0, 44, '#e8383d', 0.28);
      S.cel(poly(unit(HEART, 0, 0, 38, 36)), '#e8383d', { line: S.L(3), shadow: '#8d1a2c', depth: 8, rim: '#ff8a7a', rimW: S.L(1.8), hi: S.d ? '#ff8a7a' : undefined, hiW: S.L(2.4) });
      S.gloss(-14, -12, 15, PI * 1.15, PI * 1.6, 4, 0.7);
      S.spark(21, -20, 5.5, { color: WHITE });
    } else {
      S.fill(poly(unit(HEART, 0, 0, 38, 36)), '#3a2f5a', 0.45);
      S.g.save(); S.g.setLineDash([S.T(7), S.T(5)]); S.g.beginPath(); tk.trace(S.g, poly(unit(HEART, 0, 0, 38, 36))); S.g.strokeStyle = '#8a86a8'; S.g.lineWidth = S.L(3); S.g.stroke(); S.g.restore();
    }
  };
  STATF.energy = (S) => {
    const lit = S.on, base = lit ? '#7af7ff' : '#3a4a6a';
    if (lit) { S.glow(0, 0, 50, '#5ff5ff', 0.55); }
    S.cel(circ(0, 0, 33), base, { line: S.L(3), shadow: lit ? '#2a9fc0' : '#1a2440', depth: 9, rim: lit ? '#e6ffff' : '#5a6a8a', rimW: S.L(2), hi: S.d && lit ? '#ffffff' : undefined, hiW: S.L(3) });
    // the tomoe comma inside the orb
    S.g.save(); S.g.globalAlpha *= lit ? 0.95 : 0.35;
    tk.inkPath(S.g, tk.arcPts(0, 0, 15, 15, -PI * 0.75, PI * 0.92, 9), { w: S.T(11), color: '#ffffff', taperStart: 0.55, taperEnd: 0.05, pressure: 'flat', wobble: 0, minW: 0.3 });
    S.g.beginPath(); S.g.arc(cos(-PI * 0.75) * 15, sin(-PI * 0.75) * 15, S.T(6.4), 0, TAU); S.g.fillStyle = '#ffffff'; S.g.fill();
    S.g.restore();
    if (lit) { S.gloss(0, 0, 25, -PI * 0.42, -PI * 0.1, 3.4, 0.7); S.spark(20, -22, 7, { color: WHITE }); }
  };
  STATF.brush = (S) => {
    // Song: two beamed eighth notes, teal heads with an ink outline, a small sound swash under them
    const hx1 = -16, hy1 = 22, hx2 = 16, hy2 = 14;
    const sx1 = hx1 + 8.6, sx2 = hx2 + 8.6;
    S.glow(0, 0, 42, '#3fd6b0', 0.2);
    S.stroke([[sx1, hy1 - 2], [sx1, -26]], 5, N.black, { ow: 1.4 });
    S.stroke([[sx2, hy2 - 2], [sx2, -34]], 5, N.black, { ow: 1.4 });
    S.cel(poly([[sx1 - 2.5, -26], [sx2 + 2.5, -34], [sx2 + 2.5, -22], [sx1 - 2.5, -14]]), N.black, { line: S.L(2.4), shadow: '#100a24', depth: 2, hi: false });
    S.stroke([[sx1 + 1, -22], [sx2 - 1, -30]], 2, '#3fd6b0', { ow: 0, alpha: 0.85 });
    noteHead(S, hx1, hy1, 11, 8, -0.35, '#3fd6b0', 2.6);
    noteHead(S, hx2, hy2, 11, 8, -0.35, '#3fd6b0', 2.6);
    S.ink([[hx1 - 6, hy1 - 3], [hx1 - 2, hy1 - 5]], { w: 2.2, color: '#d8fff2', alpha: 0.9, taper: 0.4, wobble: 0 });
    S.ink([[hx2 - 6, hy2 - 3], [hx2 - 2, hy2 - 5]], { w: 2.2, color: '#d8fff2', alpha: 0.9, taper: 0.4, wobble: 0 });
    arcLine(S, 0, 6, 36, 0.6, 2.54, 3.4, '#5ff5ff', 2);
    S.spark(-30, -24, 5, { color: WHITE });
  };
  STATF.inkstone = (S) => {
    // Chimes (the meta currency): three hanging tubular chimes from a lacquer bar, a round striker between them, two sound arcs
    S.glow(0, 0, 44, '#c9893a', 0.18);
    const tube = (x, len) => {
      S.stroke([[x, -26], [x, -26 + 10]], 2.6, N.goldD, { ow: 1 });
      S.cel(rr(x - 5.5, -18, 11, len, 3), pal.bronze, { line: S.L(2.4), shadow: '#7a4a1c', depth: 3.4, rim: '#f0c27a', rimW: S.L(1.2), hi: S.d ? '#f0c27a' : undefined, tension: 0.4 });
      S.cel(rr(x - 6.5, -20, 13, 5, 2), N.gold, { line: S.L(2), shadow: N.goldD, hi: false, tension: 0.5 });
    };
    tube(-26, 54); tube(-2, 70); tube(22, 42);
    S.cel(rr(-40, -40, 76, 13, 5), '#5a4ae0', { line: S.L(2.8), shadow: '#1e1670', depth: 4, rim: '#9a8bff', rimW: S.L(1.3), hi: false, tension: 0.5 });
    S.stroke([[-14, -27], [-14, 14]], 1.8, N.goldD, { ow: 0.8 });
    S.cel(circ(-14, 20, 6), N.gold, { line: S.L(2.2), shadow: N.goldD, depth: 2, hi: false });
    arcLine(S, 26, 8, 20, -0.7, 0.7, 3.2, '#f5c96a', 2);
    arcLine(S, 26, 8, 30, -0.7, 0.7, 3.2, '#f5c96a', 2);
  };
  STATF.block = (S) => {
    const shield = [[-30, -30], [0, -37], [30, -30], [30, -2], [21, 20], [0, 39], [-21, 20], [-30, -2]];
    S.glow(0, 0, 48, '#5fb4ff', 0.3);
    S.cel(poly(shield), N.gold, { line: S.L(3.2), shadow: N.goldD, depth: 6, rim: N.gold2, hi: false, tension: 0.4 });
    const inner = [[-23, -23], [0, -29], [23, -23], [23, -2], [16, 15], [0, 31], [-16, 15], [-23, -2]];
    S.cel(poly(inner), '#5fb4ff', { line: S.L(2.2), shadow: '#2559a8', depth: 6, rim: '#d8eeff', rimW: S.L(1.6), hi: S.d ? '#b5dcff' : undefined, tension: 0.4 });
    S.stroke([[0, -20], [0, 26]], 3.2, '#d8eeff', { ow: 0, alpha: 0.85 });
    S.stroke([[-17, -2], [17, -2]], 3.2, '#d8eeff', { ow: 0, alpha: 0.85 });
    S.circle(0, -2, 6, N.gold); S.ring(0, -2, 6, 2, INK);
  };
  REG.stat = {
    ids: L.statIcons.slice(),
    resolve: (id) => (STATF[id] ? { key: 'stat|' + id, glow: STAT_LOOK[id], render: (S, o) => STATF[id](S, o) } : null),
  };

  // ---------------------------------------------------------------------------------------------------------------
  // TYPE: card type glyphs, read down to 14 px on a parchment frame: bold silhouettes, thick ink
  // ---------------------------------------------------------------------------------------------------------------
  const TYPEF = {};
  TYPEF.attack = (S, c) => {
    const blade = c || N.steel, w = S.d ? 15 : 20;
    S.at(0, 0, -0.74, 1, 1, () => sword(S, { len: 100, w, blade }));
    S.at(0, 0, 0.74, 1, 1, () => sword(S, { len: 100, w, blade }));
    if (S.d) S.spark(0, 0, 9, { color: WHITE });
  };
  TYPEF.skill = (S, c) => {
    // a folding fan: five ribbed panels alternating two blues, a gold pin at the pivot
    const cx = 0, cy = 28, R = 56, a0 = -PI * 0.85, a1 = -PI * 0.15, n = 5;
    const cols = [c || '#5fb4ff', '#e6f3ff'];
    for (let i = 0; i < n; i++) {
      const u0 = a0 + (a1 - a0) * i / n, u1 = a0 + (a1 - a0) * (i + 1) / n;
      const pts = [[cx, cy]].concat(tk.arcPts(cx, cy, R, R, u0, u1, 4));
      S.cel(poly(pts), cols[i % 2], { line: S.L(2.4), shadow: i % 2 ? '#a9c4e8' : '#2559a8', depth: 4, hi: false, rimW: S.L(1) });
    }
    S.g.save(); S.g.beginPath(); S.g.arc(cx, cy, R * 0.98, a0, a1); S.g.strokeStyle = N.gold; S.g.lineWidth = S.T(3.6); S.g.stroke(); S.g.restore();
    for (let i = 0; i <= n; i += n) { const a = a0 + (a1 - a0) * i / n; S.stroke([[cx, cy], [cx + cos(a) * R, cy + sin(a) * R]], 4.4, N.woodL, { ow: 1.6 }); }
    S.circle(cx, cy, 5.4, N.gold); S.ring(cx, cy, 5.4, 2, INK);
  };
  TYPEF.power = (S, c) => {
    const base = c || N.gold, f = tone(base);
    // a lotus on its pad: two low side petals, two tall ones, one crowning petal
    S.cel(ell(0, 36, 40, 9, 0, 16), '#3fd6a0', { line: S.L(2.6), shadow: '#12775f', depth: 3, hi: false });
    const petal = (a, len, w, col, sh) => S.at(0, 32, a, 1, 1, () => S.cel([[0, 0], [-w, -len * 0.4], [-w * 0.6, -len * 0.82], [0, -len, 1], [w * 0.6, -len * 0.82], [w, -len * 0.4]], col, { line: S.L(2.7), shadow: sh, depth: 4, hi: false, rim: f.pale, rimW: S.L(1) }));
    petal(-1.2, 52, 14, N.goldM, N.goldD); petal(1.2, 52, 14, N.goldM, N.goldD);
    petal(-0.6, 68, 17, '#ffb0cc', '#d0648a'); petal(0.6, 68, 17, '#ffb0cc', '#d0648a');
    petal(0, 80, 18, '#fff0d0', N.goldM);
    if (S.d) S.spark(0, -40, 7, { color: WHITE });
  };
  TYPEF.curse = (S, c) => {
    S.cel(circ(0, 0, 42), c || '#4a2a8a', { line: S.L(3.2), depth: 8, shadow: '#1e1040', rim: '#b9a0ff', rimW: S.L(1.6), hi: false });
    S.ring(0, 0, 35, 1.8, '#b9a0ff', 0.7);
    const skull = [[-19, -4], [-18, -18], [-9, -27], [0, -29], [9, -27], [18, -18], [19, -4], [13, 3], [12, 12], [-12, 12], [-13, 3]];
    S.cel(skull, N.bone, { line: S.L(2.4), shadow: N.boneD, depth: 4, hi: false, tension: 0.7 });
    S.g.save(); S.g.fillStyle = INK;
    S.g.beginPath(); S.g.ellipse(-8, -8, 5.4, 6.2, 0, 0, TAU); S.g.ellipse(8, -8, 5.4, 6.2, 0, 0, TAU); S.g.fill();
    S.g.beginPath(); S.g.moveTo(0, -1); S.g.lineTo(-3.2, 5); S.g.lineTo(3.2, 5); S.g.closePath(); S.g.fill(); S.g.restore();
    if (S.d) { S.stroke([[-6, 8], [-6, 13]], 1.6, INK, { ow: 0 }); S.stroke([[0, 8], [0, 13]], 1.6, INK, { ow: 0 }); S.stroke([[6, 8], [6, 13]], 1.6, INK, { ow: 0 }); }
    S.circle(-8, -9, 1.5, '#ff5a8a'); S.circle(8, -9, 1.5, '#ff5a8a');
  };
  TYPEF.status = (S, c) => {
    // a card with three static bands, a jagged crack, no text lines and no blot
    const card = [[-26, -38], [26, -38], [30, -34], [30, 34], [26, 38], [-26, 38], [-30, 34], [-30, -34]];
    S.cel(poly(card), c || N.paper, { line: S.L(2.8), shadow: N.paperD, depth: 5, hi: false });
    [-22, -6, 10].forEach((y, i) => {
      S.stroke([[-22, y], [22, y]], S.d ? 6 : 8, '#fff8f0', { ow: 1.2 });
      S.g.save(); S.g.setLineDash([S.T(5), S.T(4)]); S.g.beginPath(); S.g.moveTo(-22, y); S.g.lineTo(22, y); S.g.strokeStyle = '#8a86a8'; S.g.lineWidth = S.T(S.d ? 3 : 4); S.g.stroke(); S.g.restore();
    });
    S.stroke([[8, -38], [-2, -22], [10, -10], [-4, 4], [8, 18], [0, 38]], 4.4, INK, { ow: 0, poly: true, step: 3 });
    S.stroke([[8, -38], [-2, -22], [10, -10], [-4, 4], [8, 18], [0, 38]], 1.8, '#ff5a6e', { ow: 0, poly: true, step: 3 });
  };
  REG.type = {
    ids: L.cardTypes.slice(),
    resolve: (id, o) => (TYPEF[id] ? { key: 'type|' + id, glow: { attack: '#e8383d', skill: '#5fb4ff', power: '#f5c96a', curse: '#7a6bff', status: '#c9b58a' }[id], render: (S) => TYPEF[id](S, colorOpt(o && o.color)) } : null),
  };

  // ---------------------------------------------------------------------------------------------------------------
  // ROW: front and back. Two little heroes in formation, the row you mean lit under a spotlight
  // ---------------------------------------------------------------------------------------------------------------
  function pawn(S, x, y, sc, col, lit) {
    const f = tone(col);
    S.at(x, y, 0, sc, sc, () => {
      const body = lit ? col : '#8a86a8';
      S.cel([[-17, 30], [-15, 8], [-8, 0], [8, 0], [15, 8], [17, 30]], body, { line: S.L(2.8 / sc), shadow: lit ? f.shade : '#4a4664', depth: 5, hi: false, tension: 0.55 });
      S.cel(circ(0, -14, 15), lit ? '#ffe3d0' : '#c4c0d8', { line: S.L(2.8 / sc), shadow: lit ? '#e8a890' : '#8a86a8', depth: 4, hi: false });
      // hair fringe in the hero colour, two eyes
      S.cel([[-15, -16], [-10, -28], [0, -31], [10, -28], [15, -16], [8, -20], [0, -17], [-8, -20]], lit ? f.deep : '#5a5678', { line: S.L(2.4 / sc), shadow: lit ? INK : '#2e2a44', depth: 3, hi: false });
      S.circle(-5.5, -10, 2.2, INK); S.circle(5.5, -10, 2.2, INK);
    });
  }
  const ROWF = {};
  ROWF.front = (S, c) => {
    const col = c || '#ee4a52';
    S.g.save(); S.g.beginPath(); S.g.ellipse(12, 40, 32, 8, 0, 0, TAU); S.g.fillStyle = tk.rgba(N.gold, 0.6); S.g.fill(); S.g.restore();
    pawn(S, -24, 6, 0.74, '#5fb4ff', false);
    pawn(S, 14, 3, 1.12, col, true);
    S.at(41, 12, 0.32, 1, 1, () => sword(S, { len: 50, w: 8.5 }));     // the vanguard carries a blade
    if (S.d) { S.stroke([[36, -34], [43, -27], [36, -20]], 4.6, N.gold, { ow: 1.6 }); S.stroke([[27, -34], [34, -27], [27, -20]], 4.6, N.gold, { ow: 1.6 }); }
  };
  ROWF.back = (S, c) => {
    const col = c || '#5fb4ff';
    S.g.save(); S.g.beginPath(); S.g.ellipse(-14, 40, 32, 8, 0, 0, TAU); S.g.fillStyle = tk.rgba(N.gold, 0.6); S.g.fill(); S.g.restore();
    pawn(S, 24, 3, 0.98, '#ee4a52', false);
    pawn(S, -14, 5, 0.9, col, true);
    S.stroke([[-38, -8], [-38, 36]], 3.6, N.woodL, { ow: 1.5 });                    // the caster keeps a staff with a glowing tip
    S.cel(circ(-38, -13, 6.4), '#bff4ff', { line: S.L(2), shadow: '#5fb4ff', depth: 2, hi: false, rim: '#ffffff' });
    if (S.d) { S.stroke([[-36, -34], [-43, -27], [-36, -20]], 4.6, N.gold, { ow: 1.6 }); S.stroke([[-27, -34], [-34, -27], [-27, -20]], 4.6, N.gold, { ow: 1.6 }); }
  };
  REG.row = {
    ids: ['front', 'back'],
    resolve: (id, o) => (ROWF[id] ? { key: 'row|' + id, glow: id === 'front' ? '#ee4a52' : '#5fb4ff', render: (S) => ROWF[id](S, colorOpt(o && o.color)) } : null),
  };

  // ---------------------------------------------------------------------------------------------------------------
  // BRUSH: a picture of the shape the brush paints, on a mini pointy-top hex grid (the map's own geometry, DESIGN 4.8)
  // ---------------------------------------------------------------------------------------------------------------
  const SQ3 = sqrt(3);
  const hexPts = (cx, cy, s) => { const o = []; for (let i = 0; i < 6; i++) { const a = PI / 6 + i * PI / 3; o.push([cx + cos(a) * s, cy + sin(a) * s]); } return o; };
  const hexXY = (q, r, s) => [s * SQ3 * (q + r / 2), s * 1.5 * r];
  // layouts: s is the hex radius, cells are [q, r, role] with role 'o' origin (already painted), 'n' newly painted, 'c' the clicked hex that also paints
  const BRUSH_LAYOUT = {
    line3: { s: 13.5, cells: [[0, 0, 'o'], [1, -1, 'n'], [2, -2, 'n'], [3, -3, 'n']] },
    line5: { s: 9.6, cells: [[0, 0, 'o'], [1, -1, 'n'], [2, -2, 'n'], [3, -3, 'n'], [4, -4, 'n'], [5, -5, 'n']] },
    fan: { s: 20, cells: [[0, 0, 'o'], [1, 0, 'n'], [1, -1, 'n'], [0, -1, 'n']] },
    blob: { s: 16.5, cells: [[0, 0, 'c'], [1, 0, 'n'], [1, -1, 'n'], [0, -1, 'n'], [-1, 0, 'n'], [-1, 1, 'n'], [0, 1, 'n']] },
    ring: { s: 16.5, cells: [[0, 0, 'o'], [1, 0, 'n'], [1, -1, 'n'], [0, -1, 'n'], [-1, 0, 'n'], [-1, 1, 'n'], [0, 1, 'n']] },
    dot: { s: 30, cells: [[0, 0, 'c']] },
  };
  function brushLayout(id) {
    const def = DATA.brushes && DATA.brushes[id];
    if (!def) return null;
    if (def.kind === 'line') return def.len >= 5 ? BRUSH_LAYOUT.line5 : BRUSH_LAYOUT.line3;
    return BRUSH_LAYOUT[def.kind] || null;
  }
  // the badge in the top-left corner: strokes, arcs and ellipses only (never closePath, so the hexagon count stays the cell count)
  function brushBadge(S, id) {
    const g = S.g, cx = -30, cy = -30;
    const line = (pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(cx + p[0], cy + p[1]) : g.moveTo(cx + p[0], cy + p[1]))); g.stroke(); };
    const dot = (x, y, r) => { g.beginPath(); g.arc(cx + x, cy + y, r, 0, TAU); g.fill(); };
    g.save();
    g.beginPath(); g.arc(cx, cy, 13, 0, TAU); g.fillStyle = tk.rgba('#241a3a', 0.92); g.fill();
    g.lineWidth = S.T(1.4); g.strokeStyle = tk.rgba(N.gold, 0.9); g.stroke();
    g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#f5c96a'; g.fillStyle = '#f5c96a'; g.lineWidth = S.T(2.2);
    if (id === 'stroke') { line([[-7, -7], [7, 7]]); line([[7, -7], [-7, 7]]); dot(-7, -7, 2.2); dot(7, -7, 2.2); }
    else if (id === 'wave') { [5, 9.5, 14].forEach((r) => { g.beginPath(); g.arc(cx - 7, cy + 7, r, -PI / 2, 0); g.stroke(); }); }
    else if (id === 'fan') { [-2.3, -1.57, -0.84].forEach((a) => line([[0, 8], [cos(a) * 15, 8 + sin(a) * 15]])); }
    else if (id === 'splash') { line([[-8, 8], [8, 8]]); line([[0, -8], [0, 5]]); line([[-4, 1], [0, 5], [4, 1]]); line([[-10, 3], [-7, 5]]); line([[10, 3], [7, 5]]); line([[-9, -3], [-6, -1]]); line([[9, -3], [6, -1]]); }
    else if (id === 'halo') { for (let i = 0; i < 6; i++) dot(cos(i * TAU / 6) * 8.5, sin(i * TAU / 6) * 8.5, 1.8); dot(0, 0, 2.2); }
    else { g.beginPath(); g.ellipse(cx - 2, cy + 4, 4.4, 3.2, -0.35, 0, TAU); g.fill(); line([[2, 3], [2, -8]]); g.beginPath(); g.moveTo(cx - 8, cy - 5); g.quadraticCurveTo(cx - 5, cy - 9, cx - 2, cy - 5); g.quadraticCurveTo(cx + 1, cy - 1, cx + 4, cy - 5); g.stroke(); }
    g.restore();
  }
  function brushSpec(id, o) {
    const lay = brushLayout(id);
    if (!lay) return null;
    return {
      key: 'brush|' + id, glow: '#3fd6b0',
      render(S, oo) {
        const ink = colorOpt(oo && oo.color) || '#3fd6b0', f = tone(ink);
        // the lacquer plaque the picture sits on
        S.cel(rr(-44, -44, 88, 88, 14), '#241a3a', { line: S.L(3), shadow: '#100a24', depth: 6, rim: N.gold, rimW: S.L(1.6), hi: false, tension: 0.7 });
        const xy = lay.cells.map((c) => hexXY(c[0], c[1], lay.s));
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        xy.forEach((p) => { x0 = min(x0, p[0] - lay.s * 0.87); x1 = max(x1, p[0] + lay.s * 0.87); y0 = min(y0, p[1] - lay.s); y1 = max(y1, p[1] + lay.s); });
        const ox = -(x0 + x1) / 2, oy = -(y0 + y1) / 2;
        // faint unpainted neighbours: the page the paint lands on
        if (S.d >= 1) {
          const used = new Set(lay.cells.map((c) => c[0] + ',' + c[1]));
          for (let q = -8; q <= 8; q++) for (let r = -8; r <= 8; r++) {
            if (used.has(q + ',' + r)) continue;
            const p = hexXY(q, r, lay.s), px = p[0] + ox, py = p[1] + oy;
            if (abs(px) > 38 - lay.s * 0.5 || abs(py) > 38 - lay.s * 0.5) continue;
            S.g.save(); S.g.setLineDash([S.T(3), S.T(3)]); S.g.beginPath(); tk.trace(S.g, poly(hexPts(px, py, lay.s * 0.92))); S.g.strokeStyle = tk.rgba('#5a5678', 0.6); S.g.lineWidth = S.T(1.3); S.g.stroke(); S.g.restore();
          }
        }
        // origin first (paper), then the paint
        [['o'], ['n', 'c']].forEach((roles) => lay.cells.forEach((c, i) => {
          if (roles.indexOf(c[2]) < 0) return;
          const px = xy[i][0] + ox, py = xy[i][1] + oy, hp = poly(hexPts(px, py, lay.s * 0.96));
          if (c[2] === 'o') {
            S.cel(hp, '#e8e6f0', { line: S.L(2.2), shadow: '#b4b0cc', depth: lay.s * 0.22, hi: false });
            S.circle(px, py, lay.s * 0.22, '#5a5678');
          } else {
            S.cel(hp, ink, { line: S.L(2.4), shadow: f.shade, depth: lay.s * 0.26, rim: f.pale, rimW: S.L(1.1), hi: S.d ? f.light : undefined, hiW: S.L(1.6) });
            if (c[2] === 'c') S.spark(px + lay.s * 0.2, py - lay.s * 0.25, lay.s * 0.45, { color: WHITE, glow: 0 });
          }
        }));
        if (id === 'blot' || (DATA.brushes[id] && DATA.brushes[id].kind === 'dot')) {
          S.g.save(); S.g.setLineDash([S.T(4), S.T(4)]); S.g.beginPath(); S.g.arc(0, 0, 37, 0, TAU); S.g.strokeStyle = tk.rgba(f.deep, 0.5); S.g.lineWidth = S.T(1.8); S.g.stroke(); S.g.restore();
        }
        brushBadge(S, id);
      },
    };
  }
  REG.brush = { ids: Object.keys(DATA.brushes || {}), resolve: (id, o) => brushSpec(id, o) };

  // ---------------------------------------------------------------------------------------------------------------
  // INTENT: sumi-e brush pictograms on a pale wash blot, black ink line, one colour per idea. They sit on cream bubbles (and read on dark).
  // ---------------------------------------------------------------------------------------------------------------
  const INTENT_LOOK = { attack: '#e8383d', multi: '#ff6a3a', heavy: '#ff9a2e', defend: '#5fb4ff', buff: '#f5c96a', debuff: '#8f5fe8', summon: '#7a6bff', heal: '#3fd6b0', special: '#d63a9a', flee: '#8a86a8', none: '#8a86a8' };
  const INTENTF = {};
  function wash(S, color, seed) {
    const f = tone(color);
    S.g.save(); S.g.globalAlpha *= 0.92;
    tk.inkBlot(S.g, 1, 2, 42, { seed: 11 + seed, color: f.pale, jag: 0.13, n: 14 });
    S.g.globalAlpha *= 0.9;
    tk.inkBlot(S.g, -1, 0, 36, { seed: 21 + seed, color: f.light, jag: 0.1, n: 12 });
    S.g.restore();
  }
  INTENTF.attack = (S, f) => {
    S.stroke([[-34, 30], [-14, 18], [10, -2], [34, -32]], 10, f.base, { ow: 2, taperStart: 0.05, taperEnd: 0.4 });
    S.at(2, 0, 0.78, 1, 1, () => sword(S, { len: 92, w: 13 }));
    S.circle(-20, -22, 2.6, f.base); S.circle(28, 24, 2.2, f.base); S.circle(-30, 4, 1.8, f.base);
  };
  INTENTF.multi = (S, f) => {
    [-19, 0, 19].forEach((o, i) => {
      const pts = [[-24 + o, -36], [-10 + o, -12], [4 + o, 12], [16 + o, 36]];
      tk.inkPath(S.g, pts, { w: S.L(15), color: INK, taper: 0.3, pressure: 'mid', wobble: 0.05, seed: 3 + i });
      tk.inkPath(S.g, pts, { w: S.L(7), color: f.base, taper: 0.4, pressure: 'mid', wobble: 0.04, seed: 5 + i });
    });
    S.spark(-30, 26, 6, { color: WHITE }); S.spark(31, -28, 5, { color: WHITE });
  };
  INTENTF.heavy = (S, f) => {
    S.cel(poly(starPts(0, 2, 44, 27, 10, -PI / 2 + 0.2)), '#ffd24a', { line: S.L(2.6), shadow: '#ff8a2a', depth: 6, hi: false });
    S.at(2, 2, 0.5, 1, 1, () => {
      S.cel([[-6, 34], [-9, 12], [-15, -8], [-20, -28], [-11, -42], [11, -42], [20, -28], [15, -8], [9, 12], [6, 34]], '#5a5678', { line: S.L(2.8), shadow: '#2e2a44', depth: 6, rim: '#a49fc4', rimW: S.L(1.4), hi: false, tension: 0.5 });
      [[-9, -30], [9, -30], [0, -22], [-11, -16], [11, -16], [0, -8]].forEach((p) => { S.circle(p[0], p[1], 2.6, '#c9c4e4'); S.ring(p[0], p[1], 2.6, 1, INK, 0.8); });
      S.cel(rr(-5.5, 18, 11, 20, 3), N.woodD, { line: S.L(2.2), hi: false, shadow: '#3a1a08', tension: 0.5 });
    });
  };
  INTENTF.defend = (S, f) => {
    const sh = [[-30, -30], [0, -38], [30, -30], [30, -2], [21, 20], [0, 40], [-21, 20], [-30, -2]];
    S.cel(poly(sh), '#5fb4ff', { line: S.L(3.2), shadow: '#2559a8', depth: 8, rim: '#d8eeff', rimW: S.L(1.8), hi: S.d ? '#b5dcff' : undefined, tension: 0.4 });
    S.clip(poly(sh), () => S.fill(poly([[0, -40], [40, -40], [40, 45], [0, 45]]), '#e8f4ff', 0.85));
    S.ink([[0, -37], [0, 39]], { w: 3, color: INK, taper: 0.1, pressure: 'flat', wobble: 0.03 });
    S.ink([[-30, -2], [30, -2]], { w: 3, color: INK, taper: 0.1, pressure: 'flat', wobble: 0.03 });
    S.cel(poly(sh), 'rgba(0,0,0,0)', { line: S.L(3.2), shadow: false, hi: false, tension: 0.4 });
    S.circle(0, -2, 7, N.gold); S.ring(0, -2, 7, 2.2, INK);
  };
  INTENTF.buff = (S, f) => {
    const arrow = [[-9, 38], [-9, 0], [-27, 0], [0, -38, 1], [27, 0], [9, 0], [9, 38]];
    S.cel(poly(arrow), '#f5c96a', { line: S.L(3), shadow: '#c8892a', depth: 7, rim: '#fff2c8', rimW: S.L(1.5), hi: S.d ? '#ffe9a8' : undefined });
    S.spark(-30, -22, 7, { color: WHITE }); S.spark(31, 16, 6, { color: '#fff2c8' });
    if (S.d) S.spark(-28, 22, 4, { color: '#fff2c8' });
  };
  INTENTF.debuff = (S, f) => {
    const arrow = [[-9, -38], [-9, 0], [-27, 0], [0, 32, 1], [27, 0], [9, 0], [9, -38]];
    S.cel(poly(arrow), '#8f5fe8', { line: S.L(3), shadow: '#43208f', depth: 7, rim: '#cdb0ff', rimW: S.L(1.5), hi: S.d ? '#cdb0ff' : undefined });
    S.cel(unit(DROP, 0, 39, 5.5, 7), '#8f5fe8', { line: S.L(2), shadow: '#43208f', depth: 2, hi: false });
    S.cel(unit(DROP, -19, 36, 4, 5), '#8f5fe8', { line: S.L(1.8), hi: false, shadow: '#43208f', depth: 1.5 });
    S.spark(30, -26, 5.5, { color: '#e2d0ff' });
  };
  INTENTF.summon = (S, f) => {
    tk.inkPath(S.g, tk.arcPts(0, 4, 31, 31, -PI * 0.42, PI * 1.72, 16), { w: S.L(8), color: INK, taperStart: 0.02, taperEnd: 0.28, pressure: 'mid', wobble: 0.08, seed: 4 });
    S.cel([[0, -26, 1], [11, -10], [15, 6], [8, 20], [0, 26], [-8, 20], [-15, 6], [-11, -10]], '#dff3ff', { line: S.L(2.6), shadow: '#8fb4e8', depth: 6, rim: '#ffffff', hi: false });
    S.circle(-5, 6, S.d ? 2.6 : 2.2, INK); S.circle(5, 6, S.d ? 2.6 : 2.2, INK);
    S.spark(-27, -22, 5.5, { color: WHITE }); S.spark(27, -20, 4.5, { color: '#dff3ff' });
  };
  INTENTF.heal = (S, f) => {
    const cross = [[-10, -34], [10, -34], [10, -10], [34, -10], [34, 10], [10, 10], [10, 34], [-10, 34], [-10, 10], [-34, 10], [-34, -10], [-10, -10]];
    S.cel(poly(cross), '#3fd6b0', { line: S.L(3.2), shadow: '#12775f', depth: 7, rim: '#c8fff0', rimW: S.L(1.6), hi: S.d ? '#a5f5dc' : undefined });
    S.cel([[24, 30], [34, 18], [42, 26], [36, 38]], '#5be08a', { line: S.L(2), shadow: '#2a8a52', depth: 2.5, hi: false });
    S.spark(-30, -28, 6.5, { color: WHITE }); S.spark(30, -30, 4.5, { color: '#c8fff0' });
  };
  INTENTF.special = (S, f) => {
    const eye = [[-38, 2], [-20, -14], [2, -20], [26, -12], [40, 2], [24, 14], [2, 20], [-20, 14]];
    S.cel(eye, '#fff0cf', { line: S.L(3), shadow: '#e6c9a0', depth: 5, hi: false, tension: 0.9 });
    S.clip(eye, () => {
      S.g.beginPath(); S.g.arc(2, 0, 16.5, 0, TAU); S.g.fillStyle = '#d63a9a'; S.g.fill();
      S.g.beginPath(); S.g.arc(2, 5, 16.5, 0, PI); S.g.fillStyle = '#ff8ac8'; S.g.globalAlpha *= 0.55; S.g.fill(); S.g.globalAlpha /= 0.55;
    });
    S.g.save(); S.g.beginPath(); S.g.arc(2, 0, 16.5, 0, TAU); S.g.strokeStyle = INK; S.g.lineWidth = S.L(2.6); S.g.stroke(); S.g.restore();
    S.g.save(); S.g.beginPath(); S.g.ellipse(2, 0, 4.4, 14, 0, 0, TAU); S.g.fillStyle = INK; S.g.fill(); S.g.restore();
    S.circle(-3, -7, 3, '#ffffff'); S.circle(8, 6, 1.6, '#ffffff');
    tk.inkPath(S.g, [[-40, -12], [-16, -26], [10, -30], [34, -22], [44, -8]], { w: S.L(7), color: INK, taperStart: 0.02, taperEnd: 0.5, pressure: 'head', wobble: 0.06, seed: 9 });
    S.spark(30, -34, 5, { color: '#ffd0ec' });
  };
  INTENTF.flee = (S, f) => {
    [[-34, -18, -8], [-30, 20, -6], [-38, 2, -4]].forEach((l, i) => S.stroke([[l[0], l[1]], [l[0] + 24 + i * 3, l[1]]], 4.2, '#ffffff', { ow: 1.6, taperStart: 0.6, taperEnd: 0 }));
    S.cel(poly([[-8, -13], [10, -13], [10, -30], [40, 0, 1], [10, 30], [10, 13], [-8, 13]]), '#c4c0d8', { line: S.L(3), shadow: '#7a7698', depth: 6, rim: '#ffffff', hi: false });
    S.circle(-32, 30, 7, '#ffffff'); S.ring(-32, 30, 7, 2, INK); S.circle(-22, 36, 5, '#ffffff'); S.ring(-22, 36, 5, 2, INK);
  };
  INTENTF.none = (S, f) => {
    tk.inkPath(S.g, tk.arcPts(0, 0, 30, 30, -PI * 0.3, PI * 1.62, 16), { w: S.L(8), color: '#5a5678', taperStart: 0.02, taperEnd: 0.32, pressure: 'mid', wobble: 0.08, seed: 6 });
    [-13, 0, 13].forEach((x) => { S.circle(x, 2, 4.6, '#5a5678'); S.ring(x, 2, 4.6, 1.6, INK, 0.8); });
  };
  REG.intent = {
    ids: L.intents.slice(),
    resolve: (id, o) => (INTENTF[id] ? { key: 'intent|' + id, glow: INTENT_LOOK[id], render: (S, oo) => { const c = colorOpt(oo && oo.color) || INTENT_LOOK[id]; wash(S, c, tk.seed(id) & 255); INTENTF[id](S, tone(c)); } } : null),
  };

  // ---------------------------------------------------------------------------------------------------------------
  // GEM: five cuts x four colours x three tiers, and the empty sockets. Every gem, socket and prism carries an ENGRAVED glyph that does not
  // depend on colour: red sword, blue shield, green leaf, gold star, prism ring (DESIGN 5.6).
  // ---------------------------------------------------------------------------------------------------------------
  const GEM_COL = {
    red: { base: '#e8383d', light: '#ff9a86', dark: '#7d1230', glow: '#ffb0a0' },
    blue: { base: '#4f9bff', light: '#b5dcff', dark: '#1f4fb0', glow: '#d8eeff' },
    green: { base: '#3fd68a', light: '#b0ffd6', dark: '#12774a', glow: '#c8fff0' },
    gold: { base: '#ffc94a', light: '#fff0b0', dark: '#b06a10', glow: '#fff2c8' },
    any: { base: '#d9d4f0', light: '#ffffff', dark: '#6a62a0', glow: '#ffffff' },
  };
  const GEM_GLYPH = { red: 'sword', blue: 'shield', green: 'leaf', gold: 'star', any: 'ring' };
  // the glyph as filled shapes in a unit box (about +-1), tilted where that helps it read; fn(g, r) fills the current colour
  const GLYPHS = {
    sword(g, r) {
      g.save(); g.rotate(0.62); g.beginPath();
      g.moveTo(-0.15 * r, 0.02 * r); g.lineTo(-0.15 * r, -0.66 * r); g.lineTo(0, -1.02 * r); g.lineTo(0.15 * r, -0.66 * r); g.lineTo(0.15 * r, 0.02 * r); g.closePath();
      g.rect(-0.56 * r, 0.02 * r, 1.12 * r, 0.2 * r);
      g.rect(-0.1 * r, 0.2 * r, 0.2 * r, 0.6 * r);
      g.moveTo(0.17 * r, 0.9 * r); g.arc(0, 0.9 * r, 0.17 * r, 0, TAU);
      g.fill(); g.restore();
    },
    shield(g, r) {
      g.beginPath();
      g.moveTo(-0.82 * r, -0.72 * r); g.lineTo(0, -0.98 * r); g.lineTo(0.82 * r, -0.72 * r); g.lineTo(0.82 * r, -0.08 * r); g.quadraticCurveTo(0.7 * r, 0.6 * r, 0, 1.02 * r); g.quadraticCurveTo(-0.7 * r, 0.6 * r, -0.82 * r, -0.08 * r); g.closePath();
      g.fill();
    },
    leaf(g, r) {
      g.save(); g.rotate(0.72); g.beginPath();
      g.moveTo(0, -1.02 * r); g.quadraticCurveTo(0.95 * r, -0.28 * r, 0.06 * r, 0.82 * r); g.quadraticCurveTo(-0.95 * r, -0.28 * r, 0, -1.02 * r); g.closePath();
      g.rect(-0.06 * r, 0.7 * r, 0.12 * r, 0.44 * r);
      g.fill(); g.restore();
    },
    star(g, r) {
      g.beginPath();
      for (let i = 0; i < 10; i++) { const a = -PI / 2 + i * PI / 5, rad = i % 2 ? 0.46 * r : 1.06 * r; const px = cos(a) * rad, py = sin(a) * rad + 0.06 * r; if (i === 0) g.moveTo(px, py); else g.lineTo(px, py); }
      g.closePath(); g.fill();
    },
    ring(g, r) {
      g.beginPath(); g.arc(0, 0, 1.0 * r, 0, TAU); g.moveTo(0.6 * r, 0); g.arc(0, 0, 0.6 * r, 0, TAU, true); g.fill('evenodd');
      g.beginPath(); g.moveTo(0, -0.3 * r); g.lineTo(0.22 * r, 0); g.lineTo(0, 0.3 * r); g.lineTo(-0.22 * r, 0); g.closePath(); g.fill();
    },
  };
  // engrave a glyph at (0, 0) of the current transform: a pale lit lip on the lower left, the dark cut on top
  function engrave(S, name, r, base, strength) {
    const f = tone(base), g = S.g, fn = GLYPHS[name] || GLYPHS.ring;
    const off = max(0.7, r * 0.09) * (S.d ? 1 : 1.3);
    g.save();
    g.globalAlpha *= 0.85 * (strength === undefined ? 1 : strength);
    g.save(); g.translate(-off, off); g.fillStyle = f.pale; fn(g, r); g.restore();
    g.globalAlpha /= 0.85;
    g.fillStyle = f.deep; fn(g, r);
    g.restore();
  }
  // the outline of a cut as a closed polyline, resampled to n equal steps (the start point is kept, so a tip stays a vertex)
  function resample(pts, n) {
    const m = pts.length, L = [0];
    for (let i = 1; i <= m; i++) { const a = pts[i - 1], b = pts[i % m]; L.push(L[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    const total = L[m], out = [];
    for (let k = 0; k < n; k++) {
      const s = total * k / n;
      let i = 1; while (i < m && L[i] < s) i++;
      const a = pts[i - 1], b = pts[i % m], u = (s - L[i - 1]) / ((L[i] - L[i - 1]) || 1);
      out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
    }
    return out;
  }
  const denseOf = (shape) => { const f = tk.flatten(shape, { closed: true, step: 3 }); const o = []; for (let i = 0; i < f.length; i += 2) o.push([f[i], f[i + 1]]); return o; };
  const CUT = {
    round: () => resample(ell(0, 0, 38, 38, 0, 40), 48),
    oval: () => resample(ell(0, 0, 30, 40, -0.42, 44), 48),
    square: () => [[-25, -36], [25, -36], [36, -25], [36, 25], [25, 36], [-25, 36], [-36, 25], [-36, -25]],
    drop: () => denseOf(unit(DROP, 0, 3, 32, 41)),
    star: () => starPts(0, 0, 43, 28, 8, -PI / 2 + PI / 8),
  };
  const GEM_N = { round: [8, 10, 12], oval: [8, 10, 12], square: [8, 8, 8], drop: [8, 10, 12], star: [16, 16, 16] };
  const scaleAbout = (pts, k, cx, cy) => pts.map((p) => [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k]);
  const LIGHT_V = [cos(-1.05), sin(-1.05)];
  // the flat tone of a facet from how squarely it faces the key light: hard bands, never a gradient
  function facetTone(f, lit) {
    return lit > 0.62 ? tk.tint(f.base, 0.66) : lit > 0.22 ? f.light : lit > -0.22 ? f.base : lit > -0.62 ? f.shade : tk.mix(f.shade, f.dark, 0.5);
  }
  function drawGem(S, color, tier, cut, id, opts) {
    const gc = GEM_COL[color] || GEM_COL.any, f = tone(gc.base), g = S.g;
    const sd = tk.seed('gem', id) & 1023;
    const nBase = (GEM_N[cut] || GEM_N.round)[clamp(tier, 1, 3) - 1];
    const N0 = S.d === 0 ? (cut === 'star' ? 16 : 8) : nBase;
    const rot = S.d ? ((sd % 7) - 3) * 0.02 : 0;
    let O = (CUT[cut] || CUT.round)();
    if (cut !== 'square' && cut !== 'star') O = resample(O, N0);
    if (rot) O = xf(O, { rot });
    const n = O.length;
    const cy0 = cut === 'drop' ? 4 : 0;
    const table = scaleAbout(O, S.d === 0 ? 0.56 : cut === 'star' ? 0.5 : 0.52, 0, cy0);
    if (tier >= 2) S.glow(0, 0, 51, gc.glow, tier >= 3 ? 0.42 : 0.2);
    // body: the filled outline first (so no seam shows), then the facets
    S.fill(poly(O), gc.base);
    const brilliant = tier >= 2 && S.d >= 1;
    const centre = [0, cy0];
    const facet = (pts, bias) => {
      const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      const dx = cx - centre[0], dy = cy - centre[1], dl = Math.hypot(dx, dy) || 1;
      S.fill(poly(pts), facetTone(f, (dx / dl) * LIGHT_V[0] + (dy / dl) * LIGHT_V[1] + (bias || 0)));
    };
    const lineW = S.d >= 2 ? 1.1 : S.d ? 1.4 : 0;
    const mids = [];
    if (brilliant) {
      const rM = 0.74;
      for (let i = 0; i < n; i++) { const a = O[i], b = O[(i + 1) % n]; mids.push([centre[0] + ((a[0] + b[0]) / 2 - centre[0]) * rM, centre[1] + ((a[1] + b[1]) / 2 - centre[1]) * rM]); }
      for (let i = 0; i < n; i++) {
        const i1 = (i + 1) % n, pm = (i + n - 1) % n;
        facet([O[i], O[i1], mids[i]], -0.12);                     // girdle triangle
        facet([table[i], mids[pm], O[i], mids[i]], 0.02);         // kite
        facet([table[i], table[i1], mids[i]], 0.14);              // star triangle
      }
    } else {
      for (let i = 0; i < n; i++) { const i1 = (i + 1) % n; facet([O[i], O[i1], table[i1], table[i]], 0); }
    }
    // facet lines
    if (lineW) {
      g.save(); g.globalAlpha *= S.d >= 2 ? 0.42 : 0.3; g.strokeStyle = f.deep; g.lineWidth = lineW; g.lineJoin = 'round';
      g.beginPath();
      for (let i = 0; i < n; i++) {
        g.moveTo(O[i][0], O[i][1]); g.lineTo(table[i][0], table[i][1]);
        if (brilliant) { const pm = (i + n - 1) % n; g.moveTo(O[i][0], O[i][1]); g.lineTo(mids[pm][0], mids[pm][1]); g.moveTo(O[i][0], O[i][1]); g.lineTo(mids[i][0], mids[i][1]); g.moveTo(mids[i][0], mids[i][1]); g.lineTo(table[i][0], table[i][1]); g.moveTo(mids[i][0], mids[i][1]); g.lineTo(table[(i + 1) % n][0], table[(i + 1) % n][1]); }
      }
      g.stroke(); g.restore();
    }
    // the table: a lifted, clean face for the glyph
    S.fill(poly(table), tk.mix(gc.base, gc.light, 0.32));
    S.clip(poly(table), () => { S.fill(poly([[-60, 6], [60, -30], [60, -60], [-60, -60]]), '#ffffff', 0.16); });
    if (S.d >= 2) S.glow(0, cy0 - 2, 26, gc.glow, 0.32);
    // engraved glyph, 1.4x for the colour-blind aids
    const cbk = S.pattern ? 1.4 : 1;
    const gr = (S.d === 0 ? 17 : 14.5) * cbk * (cut === 'star' ? 0.9 : 1);
    S.at(0, cy0 - (cut === 'drop' ? 0 : 0), 0, 1, 1, () => engrave(S, GEM_GLYPH[color] || 'ring', min(gr, cut === 'square' ? 21 : 20), gc.base));
    // outline: heavy ink, a thin second line on the table edge
    tk.inkPath(g, poly(O), { closed: true, w: S.L(3.2), color: INK, align: 0.35, wobble: 0.04, weightVar: 0.5, seed: sd });
    if (S.d) { g.save(); g.globalAlpha *= 0.55; tk.inkPath(g, poly(table), { closed: true, w: S.T(1.3), color: f.deep, align: 0, wobble: 0, weightVar: 0 }); g.restore(); }
    if (tier >= 3 && S.d) { g.save(); g.globalAlpha *= 0.9; tk.inkPath(g, poly(scaleAbout(O, 0.9, 0, cy0)), { closed: true, w: S.T(1.3), color: N.gold2, align: 0, wobble: 0, weightVar: 0 }); g.restore(); }
    // rim light on the shadow side and a big anime glint
    S.gloss(0, cy0, cut === 'round' ? 31 : 29, -PI * 0.62, -PI * 0.25, tier >= 2 ? 3.6 : 3, 0.85);
    S.spark(cut === 'drop' ? 10 : 15, cy0 - 17, S.d ? 8.5 : 7, { color: '#ffffff', glow: S.d ? 0.5 : 0 });
    if (S.d >= 2) { S.spark(-17, cy0 + 18, 4, { color: '#ffffff', glow: 0 }); }
  }
  function slotSpec(color) {
    const gc = GEM_COL[color];
    return {
      key: 'slot|' + color, glow: gc.base,
      render(S) {
        const g = S.g, f = tone(gc.base), lit = S.on, cbk = S.pattern ? 1.4 : 1;
        // metal bezel, then the recess: dark, with an inner shadow on the upper-left wall and a lit lip at the lower right
        S.cel(circ(0, 0, 43), '#8a6a3a', { line: S.L(3.2), shadow: '#4a3218', depth: 7, rim: N.gold2, rimW: S.L(1.4), hi: S.d ? '#c9a05a' : undefined, hiW: S.L(2) });
        S.cel(circ(0, 0, 35), '#1a1233', { line: S.L(2.4), shadow: '#07051a', depth: 8, rim: lit ? gc.glow : '#5a4a8a', rimW: S.L(1.8), rimSide: 'light', hi: false });
        // a thin ring of the socket colour: colour is the second signal, the glyph the first
        if (color === 'any') {
          [['red', 0], ['blue', 1], ['green', 2], ['gold', 3]].forEach((c) => { const a0 = -PI / 2 + c[1] * PI / 2 + 0.12; g.save(); g.beginPath(); g.arc(0, 0, 29.5, a0, a0 + PI / 2 - 0.24); g.strokeStyle = GEM_COL[c[0]].base; g.lineWidth = S.T(3.6); g.lineCap = 'round'; g.globalAlpha *= lit ? 1 : 0.7; g.stroke(); g.restore(); });
        } else {
          g.save(); g.beginPath(); g.arc(0, 0, 29.5, 0, TAU); g.strokeStyle = gc.base; g.lineWidth = S.T(3.4); g.globalAlpha *= lit ? 1 : 0.62; g.stroke(); g.restore();
        }
        // the engraved glyph, faint when empty and bright when lit
        S.at(0, 0, 0, 1, 1, () => {
          g.save(); g.globalAlpha *= lit ? 1 : 0.8;
          const r = (S.d === 0 ? 17 : 15) * cbk;
          g.save(); g.translate(0.8, 0.9); g.fillStyle = '#000000'; g.globalAlpha *= 0.55; GLYPHS[GEM_GLYPH[color]](g, r); g.restore();
          g.fillStyle = lit ? gc.light : tk.mix(gc.base, '#1a1233', 0.28); GLYPHS[GEM_GLYPH[color]](g, r);
          g.restore();
        });
        if (lit) { S.glow(0, 0, 44, gc.glow, 0.35); S.spark(15, -16, 6, { color: '#ffffff' }); }
        if (S.d && !lit) S.gloss(0, 0, 40.5, PI * 0.15, PI * 0.42, 2.4, 0.4);
      },
    };
  }
  function gemSpec(id, def) {
    const color = GEM_COL[def.color] ? def.color : 'red', tier = clamp(def.tier | 0 || 1, 1, 3), cut = CUT[def.art && def.art.cut] ? def.art.cut : 'round';
    return {
      key: 'gem|' + id, glow: GEM_COL[color].base,
      render: (S, o) => drawGem(S, color, tier, cut, id, o),
      live(ctx, x, y, size, t, o) {
        if (tier < 2 || (o && o.dim)) return;
        const gc = GEM_COL[color];
        if (tier >= 3) {
          // one bright star orbiting the gem on a tilted ellipse, with a short fading trail
          const a = t * 1.7 + (tk.seed('orb', id) & 255) / 40;
          for (let k = 3; k >= 0; k--) {
            const aa = a - k * 0.16, px = x + cos(aa) * size * 0.54, py = y + sin(aa) * size * 0.3 - sin(aa) * 0 + cos(aa) * size * -0.12;
            tk.sparkle(ctx, px, py, max(1.6, size * (k ? 0.045 - k * 0.008 : 0.1)), { color: k ? gc.glow : '#ffffff', alpha: k ? 0.45 - k * 0.1 : 1, glow: k ? 0 : 0.7, rot: aa });
          }
        } else {
          const tw = 0.5 + 0.5 * sin(t * 2.3 + (tk.seed('tw', id) & 255) / 30);
          if (tw > 0.35) tk.sparkle(ctx, x + size * 0.2, y - size * 0.22, max(1.6, size * 0.08 * tw), { color: '#ffffff', alpha: tw, glow: 0.4 });
        }
      },
    };
  }
  const GEM_IDS = () => Object.keys(DATA.gems || {}).concat(['red', 'blue', 'green', 'gold', 'any'].map((c) => 'slot:' + c));
  REG.gem = {
    ids: GEM_IDS(),
    resolve: (id) => {
      if (id.indexOf('slot:') === 0) { const c = id.slice(5); return GEM_COL[c] ? slotSpec(c) : null; }
      const def = DATA.gems && DATA.gems[id];
      return def ? gemSpec(id, def) : null;
    },
  };
  ART.icon.glyphOf = (color) => GEM_GLYPH[color] || GEM_GLYPH.any;
  ART.icon.gemGlyphs = () => Object.assign({}, GEM_GLYPH);
  // just the engraved glyph: opts.color (a gem colour, picks the tone), opts.engrave false for a flat fill
  ART.icon.glyph = (ctx, name, x, y, size, opts) => {
    try {
      opts = opts || {};
      const S = makeS(ctx, size > 0 ? size : 24, { id: 'glyph|' + name, opts });
      ctx.save(); ctx.translate(num(x, 0), num(y, 0));
      const base = (GEM_COL[opts.color] || GEM_COL.any).base, r = (size > 0 ? size : 24) / 2;
      if (opts.engrave === false) { ctx.fillStyle = base; (GLYPHS[name] || GLYPHS.ring)(ctx, r); } else engrave(S, name, r, base);
      ctx.restore();
    } catch (e) { /* a glyph must never throw */ }
  };

  // ---------------------------------------------------------------------------------------------------------------
  // TILE: hanko stamps. A vermilion seal, uneven like real ink, with a black-ink drawing on it. opts.done fades the stamp into the paper.
  // ---------------------------------------------------------------------------------------------------------------
  const STAMP = '#e8383d';
  const TILE_SQUARE = { chest: 1, shop: 1, forge: 1, gemcache: 1 };
  const TILEF = {};
  // a circle whose radius breathes a little, like a stamp pressed by hand
  function wobbleRing(r, seed, n) {
    const R = tk.rng('stamp', seed), out = [];
    n = n || 26;
    for (let i = 0; i < n; i++) { const a = i * TAU / n; const k = 1 + (R() - 0.5) * 0.035; out.push([cos(a) * r * k, sin(a) * r * k]); }
    return out;
  }
  function stampBase(S, id, o) {
    const col = o.color || STAMP, f = tone(col);
    const sq = TILE_SQUARE[id];
    const shape = sq ? rr(-41, -41, 82, 82, 13) : (id === 'boss' ? serrated(45, 40, 28, id) : wobbleRing(43, id));
    S.cel(shape, col, { line: S.L(3), shadow: f.dark, depth: 7, rim: f.pale, rimW: S.L(1.3), rimAlpha: 0.6, hi: false, tension: sq ? 0.6 : id === 'boss' ? 0.2 : 1, halftone: { d: 5, alpha: 0.25 } });
    // the inner border of the seal
    S.g.save(); S.g.globalAlpha *= 0.55;
    if (sq) { S.g.beginPath(); tk.trace(S.g, rr(-35, -35, 70, 70, 9), 0, 0, 0.6); S.g.strokeStyle = PAPER; S.g.lineWidth = S.T(1.7); S.g.stroke(); }
    else { S.g.beginPath(); S.g.arc(0, 0, id === 'boss' ? 36 : 37, 0, TAU); S.g.strokeStyle = PAPER; S.g.lineWidth = S.T(1.7); S.g.stroke(); if (id === 'elite' || id === 'boss') { S.g.beginPath(); S.g.arc(0, 0, id === 'boss' ? 31.5 : 33, 0, TAU); S.g.lineWidth = S.T(1.2); S.g.stroke(); } }
    S.g.restore();
    // uneven ink: a scatter of paper-coloured pinholes
    if (S.d) { const R = tk.rng('stampsp', id); S.g.save(); S.g.globalAlpha *= 0.34; for (let i = 0; i < (S.d >= 2 ? 26 : 12); i++) { const a = R() * TAU, rad = 8 + R() * 32; S.circle(cos(a) * rad, sin(a) * rad, 0.6 + R() * 1.1, PAPER); } S.g.restore(); }
  }
  function serrated(R, r, n, seed) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) { const a = -PI / 2 + i * PI / n; const rad = i % 2 ? r : R; pts.push([cos(a) * rad, sin(a) * rad]); }
    return pts.length ? pts : wobbleRing(43, seed);
  }
  // black ink drawing helpers
  const blk = (S, shape, oo) => { S.fill(shape, INK, 1); if (oo && oo.hi) S.ink(oo.hi, { w: 1.5, color: PAPER, alpha: 0.8, taper: 0.4, wobble: 0 }); };
  const paperBar = (S, pts, w, a) => S.ink(pts, { w, color: PAPER, alpha: a === undefined ? 0.9 : a, taper: 0, pressure: 'flat', wobble: 0 });
  function inkBlade(S, ang, len, w) {
    S.at(0, 0, ang, 1, 1, () => {
      const top = -len / 2, hw = w / 2;
      blk(S, poly([[-hw, 6], [-hw * 1.05, top + len * 0.3], [0, top, 1], [hw * 1.05, top + len * 0.3], [hw, 6]]));
      S.ink([[-hw * 0.35, 4], [-hw * 0.3, top + len * 0.32]], { w: 1.6, color: PAPER, alpha: 0.85, taper: 0.4, wobble: 0 });
      blk(S, ell(0, 9, hw * 2.4, 3.4, 0, 12));
      blk(S, rect(-hw * 0.62, 11, hw * 1.24, len * 0.24));
      S.circle(0, 11 + len * 0.26, hw * 0.75, INK);
      if (S.d) [0.06, 0.13, 0.2].forEach((u) => S.ink([[-hw * 0.6, 12 + len * u], [hw * 0.6, 12 + len * (u + 0.03)]], { w: 1.1, color: PAPER, alpha: 0.6, taper: 0, wobble: 0 }));
    });
  }
  TILEF.start = (S) => {
    // hyoshigi: two wooden clappers crossed at the top, joined by a cord loop, impact sparks at the meeting point
    [-0.42, 0.42].forEach((a) => S.at(0, -16, a, 1, 1, () => { blk(S, rr(-5.5, -6, 11, 50, 3)); paperBar(S, [[-2, 0], [-2, 38]], 1.4, 0.6); }));
    S.stroke([[-5, -22], [0, -30], [5, -22], [0, -16]], 2.2, INK, { ow: 0, poly: true, step: 3 });
    S.spark(0, -14, 6.5, { color: PAPER, glow: 0 }); S.spark(14, -24, 4.5, { color: PAPER, glow: 0 });
  };
  TILEF.empty = (S) => {
    const print = (x, y, a) => S.at(x, y, a, 1, 1, () => {
      blk(S, rr(-6.5, -12, 13, 24, 5));
      paperBar(S, [[-5, -4], [5, -4]], 1.6, 0.8); paperBar(S, [[-5, 6], [5, 6]], 1.6, 0.8);
    });
    print(-11, 9, -0.2); print(12, -8, 0.2);
  };
  TILEF.block = () => null;                                  // the Void is drawn by tileSpec itself (it is not a stamp)
  TILEF.enemy = (S) => { inkBlade(S, -0.8, 82, 11); inkBlade(S, 0.8, 82, 11); S.spark(0, -1, S.d ? 8 : 0, { color: PAPER, glow: 0 }); };
  function oniFace(S, o) {
    o = o || {};
    const k = o.k || 1;
    S.at(0, o.dy || 0, 0, k, k, () => {
      // horns, then the face, then the paper-white eyes and fangs knocked out of the black
      blk(S, poly([[-14, -14], [-27, -37], [-8, -20]])); blk(S, poly([[14, -14], [27, -37], [8, -20]]));
      if (o.three) blk(S, poly([[-6, -20], [0, -40], [6, -20]]));
      blk(S, [[-23, -8], [-25, 8], [-16, 24], [0, 30], [16, 24], [25, 8], [23, -8], [14, -18], [0, -20], [-14, -18]]);
      S.fill(poly([[-18, -3], [-5, 0], [-7, 6], [-19, 3]]), o.eye || PAPER); S.fill(poly([[18, -3], [5, 0], [7, 6], [19, 3]]), o.eye || PAPER);
      S.circle(-9.5, 2.3, 1.9, INK); S.circle(9.5, 2.3, 1.9, INK);
      S.stroke([[-21, -9], [-6, -3]], 3.4, INK, { ow: 0 }); S.stroke([[21, -9], [6, -3]], 3.4, INK, { ow: 0 });
      S.fill(poly([[-14, 15], [14, 15], [10, 24], [0, 26], [-10, 24]]), PAPER);
      [[-10, 15, -6, 22, -14, 22], [10, 15, 14, 22, 6, 22]].forEach((f) => S.fill(poly([[f[0], f[1]], [f[2], f[3]], [f[4], f[5]]]), INK));
      S.fill(poly([[-8, 25], [-5, 17], [-2, 25]]), INK); S.fill(poly([[2, 25], [5, 17], [8, 25]]), INK);
    });
  }
  TILEF.elite = (S) => oniFace(S, { k: 0.98, dy: 3 });
  TILEF.boss = (S) => {
    // flames licking up behind a three-horned demon
    const fl = [];
    for (let i = 0; i < 9; i++) { const a = -PI + (i + 0.5) * PI / 9; fl.push([cos(a) * 36, sin(a) * 30 + 4], [cos(a + PI / 18) * (23 + (i % 2) * 9), sin(a + PI / 18) * (18 + (i % 2) * 10) + 4]); }
    blk(S, poly([[-36, 34]].concat(fl, [[36, 34]])));
    S.fill(circ(0, 6, 27), tk.mix(STAMP, PAPER, 0.15));
    oniFace(S, { k: 0.82, dy: 5, three: true, eye: '#ffe45e' });
  };
  TILEF.chest = (S) => {
    blk(S, poly([[-27, -3], [27, -3], [27, 27], [-27, 27]]));
    blk(S, [[-27, -3], [-24, -17], [-12, -26], [12, -26], [24, -17], [27, -3]]);
    paperBar(S, [[-27, -3], [27, -3]], 2.4, 0.9);
    paperBar(S, [[-15, -24], [-15, 26]], 3, 0.85); paperBar(S, [[15, -24], [15, 26]], 3, 0.85);
    S.fill(rr(-7, -10, 14, 16, 3), PAPER); S.fill(poly([[-2, -5], [2, -5], [3, 3], [-3, 3]]), INK); S.circle(0, -5, 2.4, INK);
    if (S.d) { S.circle(-21, 10, 1.6, PAPER); S.circle(21, 10, 1.6, PAPER); S.circle(-21, 20, 1.6, PAPER); S.circle(21, 20, 1.6, PAPER); }
    S.spark(23, -27, 6.5, { color: PAPER, glow: 0 });
  };
  TILEF.shop = (S) => {
    // a drawstring purse spilling a koban: no ears on top, the tie ends fall to the sides
    blk(S, [[-23, 12], [-21, 0], [-12, -8], [12, -8], [21, 0], [23, 12], [17, 27], [0, 31], [-17, 27]]);
    blk(S, poly([[-9, -8], [9, -8], [7, -15], [-7, -15]]));
    S.g.save(); S.g.beginPath(); S.g.ellipse(0, -9, 11, 3.6, 0, 0, TAU); S.g.strokeStyle = PAPER; S.g.lineWidth = S.T(2.4); S.g.stroke(); S.g.restore();
    S.stroke([[-11, -9], [-20, -12], [-24, -5]], 3.2, INK, { ow: 0, taperEnd: 0.5 }); S.stroke([[11, -9], [20, -13], [25, -7]], 3.2, INK, { ow: 0, taperEnd: 0.5 });
    paperBar(S, [[-13, 8], [-4, 12], [4, 12], [13, 8]], 1.8, 0.65);
    S.cel(ell(0, -22, 10, 13, 0.15, 16), N.gold, { line: S.L(2.4), shadow: N.goldD, depth: 3, hi: false });
    S.stroke([[-5, -27], [5, -26]], 2.2, N.goldD, { ow: 0 }); S.stroke([[-5, -20], [5, -19]], 2.2, N.goldD, { ow: 0 });
  };
  TILEF.camp = (S) => {
    blk(S, [[0, -33, 1], [11, -18], [17, -1], [11, 15], [0, 20], [-11, 15], [-17, -1], [-9, -16]]);
    S.fill([[0, -13, 1], [6.5, -2], [8.5, 8], [0, 13], [-8.5, 8], [-6.5, -2]], PAPER);
    S.at(0, 25, 0.26, 1, 1, () => { blk(S, rr(-25, -4.5, 50, 9, 3)); S.circle(-25, 0, 3.6, PAPER); S.circle(25, 0, 3.6, PAPER); });
    S.at(0, 25, -0.26, 1, 1, () => { blk(S, rr(-25, -4.5, 50, 9, 3)); S.circle(-25, 0, 3.6, PAPER); S.circle(25, 0, 3.6, PAPER); });
    S.circle(-21, -12, 2, PAPER); S.circle(22, -6, 1.6, PAPER);
  };
  TILEF.event = (S) => {
    tk.inkPath(S.g, [[-14, -14], [-12, -25], [0, -31], [12, -26], [14, -15], [8, -6], [0, -1], [0, 8]], { w: S.L(10), color: INK, taperStart: 0.14, taperEnd: 0.12, pressure: 'mid', wobble: 0.06, seed: 4 });
    S.circle(0, 21, 5.4, INK);
    S.spark(22, -22, 7, { color: PAPER, glow: 0 }); S.spark(-22, 14, 5, { color: PAPER, glow: 0 }); S.spark(23, 10, 4, { color: PAPER, glow: 0 });
  };
  TILEF.well = (S) => {
    // a wishing well: a little gabled roof on two posts over a stone drum, and the drop falling in
    blk(S, poly([[-30, -14], [0, -34], [30, -14], [25, -14], [0, -29], [-25, -14]]));
    blk(S, rect(-22, -15, 4.4, 24)); blk(S, rect(17.6, -15, 4.4, 24));
    // the temple bell: a hung bell with a flared lip, two bands, a striker log on two ropes and sound arcs
    S.stroke([[0, -27], [0, -15]], 2.4, INK, { ow: 0 });
    blk(S, poly([[-6, -15], [6, -15], [10, -11], [12, 2], [15, 15], [18, 26], [-18, 26], [-15, 15], [-12, 2], [-10, -11]]));
    blk(S, ell(0, 26, 18, 3, 0, 14));
    paperBar(S, [[-12, 3], [12, 3]], 2, 0.85); paperBar(S, [[-15.5, 15], [15.5, 15]], 2, 0.85);
    S.ink([[-7, -9], [-8, 1]], { w: 1.4, color: PAPER, alpha: 0.7, taper: 0.4, wobble: 0 });
    paperBar(S, [[25, -13], [25, 19]], 1.4, 0.9); paperBar(S, [[31, -13], [31, 19]], 1.4, 0.9);
    S.fill(rr(21, 19, 14, 6, 2), PAPER);
    [-26, -34].forEach((rx, i) => { S.g.save(); S.g.beginPath(); S.g.arc(-17, 18, 8 + i * 7, PI - 0.7, PI + 0.7); S.g.strokeStyle = PAPER; S.g.lineWidth = S.T(1.8); S.g.lineCap = 'round'; S.g.globalAlpha *= 0.85 - i * 0.2; S.g.stroke(); S.g.restore(); });
  };
  TILEF.brush = (S) => {
    // the Songbird: a round uguisu silhouette on a branch, an open beak, two sound arcs and an eighth note in front of it
    S.stroke([[-30, 22], [-8, 24], [14, 20], [24, 14]], 3.4, INK, { ow: 0, taperEnd: 0.3 });
    blk(S, ell(-6, 6, 13, 9, -0.1, 18));
    blk(S, ell(8, -2, 7.5, 7, 0, 14));
    blk(S, poly([[-17, 5], [-32, 12], [-30, 17], [-15, 11]]));
    blk(S, poly([[14, -4], [24, -1], [14, 1]]));
    S.circle(10, -4, 1.7, PAPER);
    paperBar(S, [[-9, 6], [-1, 9]], 1.4, 0.6);
    S.stroke([[-8, 15], [-8, 22]], 2.4, INK, { ow: 0 }); S.stroke([[-1, 15], [-1, 22]], 2.4, INK, { ow: 0 });
    [0, 1].forEach((i) => { S.g.save(); S.g.beginPath(); S.g.arc(14, -2, 15 + i * 7, -0.55, 0.55); S.g.strokeStyle = PAPER; S.g.lineWidth = S.T(1.8); S.g.lineCap = 'round'; S.g.globalAlpha *= 0.9 - i * 0.25; S.g.stroke(); S.g.restore(); });
    S.g.save(); S.g.beginPath(); S.g.ellipse(22, -14, 4.4, 3.2, -0.35, 0, TAU); S.g.fillStyle = PAPER; S.g.fill(); S.g.restore();
    paperBar(S, [[25.8, -15], [25.8, -27]], 1.6, 0.95); paperBar(S, [[25.8, -27], [31, -22]], 1.6, 0.95);
  };
  TILEF.gemcache = (S) => {
    const gem = (x, y, k) => S.at(x, y, 0, k, k, () => {
      blk(S, poly([[0, -27], [17, -10], [17, 5], [0, 28], [-17, 5], [-17, -10]]));
      paperBar(S, [[-17, -10], [0, -6], [17, -10]], 1.8 / k, 0.85); paperBar(S, [[0, -27], [-5, -8], [0, 26]], 1.4 / k, 0.7); paperBar(S, [[0, -27], [5, -8], [0, 26]], 1.4 / k, 0.7);
    });
    gem(-22, 12, 0.6); gem(22, 12, 0.6); gem(0, -1, 1);
    S.spark(22, -24, 6.5, { color: PAPER, glow: 0 });
  };
  TILEF.forge = (S) => {
    blk(S, poly([[-29, -4], [-21, -12], [22, -12], [30, -9], [21, -3], [16, 0], [14, 11], [23, 20], [23, 28], [-23, 28], [-23, 20], [-14, 11], [-16, 0], [-22, -2]]));
    paperBar(S, [[-19, -9.5], [20, -9.5]], 2, 0.8);
    S.at(12, -19, 0.7, 1, 1, () => { blk(S, rr(-3.5, -4, 7, 40, 2)); blk(S, rr(-12, -16, 24, 13, 3)); paperBar(S, [[-9, -13], [9, -13]], 1.6, 0.7); });
    S.spark(-15, -24, 7, { color: PAPER, glow: 0 }); S.spark(-4, -33, 4.5, { color: PAPER, glow: 0 });
  };
  // the Unwritten Void: not a stamp but a tear in the page, black-violet with pale torn fibres and a few lost stars
  function voidSpec() {
    return {
      key: 'tile|block', glow: '#3b2a7a',
      render(S) {
        const R = tk.rng('void'), pts = [];
        for (let i = 0; i < 22; i++) { const a = i * TAU / 22, k = 0.72 + R() * 0.34 + (i % 2 ? 0 : 0.1); pts.push([cos(a) * 42 * k, sin(a) * 40 * k]); }
        // Dead Silence: a dark hole with a cold grey rim and a grain of still ash dashes inside, no stars
        S.cel(poly(pts), '#0d0b1e', { line: S.L(2.6), shadow: '#1a1340', depth: 8, rim: '#4a465e', rimW: S.L(1.8), hi: false, halftone: { d: 5, alpha: 0.3 } });
        const nd = S.d ? 26 : 12;
        for (let i = 0; i < nd; i++) {
          const ang = R() * TAU, rad = R() * 20, dx = cos(ang) * rad, dy = sin(ang) * rad, len = 2.5 + R() * 4, lean = (R() - 0.5) * 0.8;
          S.ink([[dx - len, dy - lean * len], [dx + len, dy + lean * len]], { w: 1.2, color: i % 2 ? '#ffffff' : '#8e8aa3', alpha: 0.5, taper: 0, pressure: 'flat', wobble: 0 });
        }
      },
    };
  }
  REG.tile = {
    ids: L.tiles.slice(),
    resolve: (id, o) => {
      if (id === 'block') return voidSpec();
      if (!TILEF[id]) return null;
      return { key: 'tile|' + id, glow: STAMP, render: (S, oo) => { stampBase(S, id, { color: colorOpt(oo && oo.color) }); TILEF[id](S); if (S.d >= 2) tk.paperGrain(S.g, -46, -46, 92, 92, { alpha: 0.14 }); } };
    },
  };

  // ---------------------------------------------------------------------------------------------------------------
  // RELIC: a lacquered plate with a gold-leaf rim and a chunky object on it, coloured by the relic's palette (art.c)
  // ---------------------------------------------------------------------------------------------------------------
  const RELICF = {};                                         // motif id -> fn(S, p)
  const luma = (hex) => { const c = U.color.rgb(hex); return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; };
  // the object palette of a family: base light dark glow shade deep pale mid. Very dark families (ink) are lifted so the object shows on the plate
  const OPAL = new Map();
  function objPal(name, colorHex) {
    const key = colorHex || name;
    let p = OPAL.get(key);
    if (p) return p;
    const f = colorHex ? { base: colorHex, light: tk.tint(colorHex, 0.45), dark: tk.shade(colorHex, 0.45), glow: tk.tint(colorHex, 0.7) } : famOf(name);
    const lift = clamp((0.4 - luma(f.base)) / 0.26, 0, 1) * 0.72;
    const base = lift > 0.02 ? tk.mix(f.base, f.light, lift) : f.base, t = tone(base);
    p = { base, light: lift > 0.02 ? tk.mix(f.light, '#ffffff', 0.35) : f.light, dark: f.dark, glow: f.glow, shade: t.shade, deep: t.deep, pale: tk.tint(f.light, 0.55), mid: t.mid, name: name || 'ash', plate: tk.mix(tk.mix(f.dark, pal.indigo, 0.5), pal.night, 0.28) };
    if (OPAL.size > 200) OPAL.clear();
    OPAL.set(key, p);
    return p;
  }
  const RELIC_RIM = { common: '#e0b75a', uncommon: '#dfe6f4', rare: '#ffd75e', boss: '#ffb04a', shop: '#8ff0d8' };
  function relicPlate(S, p, rarity) {
    const rim = RELIC_RIM[rarity] || RELIC_RIM.common, g = S.g;
    const shape = rr(-44, -44, 88, 88, 21);
    S.cel(shape, p.plate, { line: S.L(3.2), shadow: tk.mix(p.plate, INK, 0.5), depth: 9, rim: tk.mix(p.plate, p.light, 0.55), rimW: S.L(1.6), hi: false, tension: 0.72, halftone: { d: 5.5, alpha: 0.28 } });
    S.clip(shape, () => { S.glow(0, -2, 50, p.base, 0.34); if (S.d) S.glow(14, -16, 28, p.glow, 0.18); });
    // gold leaf: an inset rim line, a lit corner and a few flecks
    g.save(); g.beginPath(); tk.trace(g, rr(-39.5, -39.5, 79, 79, 17), 0, 0, 0.72); g.strokeStyle = rim; g.lineWidth = S.T(rarity === 'rare' || rarity === 'boss' ? 2.6 : 2); g.globalAlpha *= 0.92; g.stroke(); g.restore();
    if (rarity === 'boss') { g.save(); g.beginPath(); tk.trace(g, rr(-34.5, -34.5, 69, 69, 14), 0, 0, 0.72); g.strokeStyle = pal.vermilion; g.lineWidth = S.T(1.6); g.globalAlpha *= 0.8; g.stroke(); g.restore(); }
    if (rarity === 'shop') { S.circle(-39, 0, 2.6, rim); S.circle(39, 0, 2.6, rim); }
    if (S.d) {
      const R = tk.rng('leaf', rarity);
      for (let i = 0; i < (S.d >= 2 ? 9 : 5); i++) { const a = R() * TAU, side = R() < 0.5; const px = side ? (R() < 0.5 ? -39.5 : 39.5) : (R() - 0.5) * 70, py = side ? (R() - 0.5) * 70 : (R() < 0.5 ? -39.5 : 39.5); S.fill(poly([[px - 1.6, py - 0.6], [px + 1.6, py - 1.1], [px + 1.3, py + 1.3], [px - 1.4, py + 0.9]]), R() < 0.4 ? '#ffffff' : rim, 0.95); }
    }
  }
  // an object drawn with the usual defaults (ink line, hard shadow, a pale rim on the object's edge)
  const oc = (S, shape, base, oo) => S.cel(shape, base, Object.assign({ line: S.L(2.4), depth: 4.5, hi: false, rim: undefined }, oo));
  const dark = (p) => tk.mix(p.dark, INK, 0.35);

  RELICF.lantern = (S, p) => {
    S.stroke([[0, -38], [0, -30]], 2.4, N.black, { ow: 0.6 });
    S.glow(0, 2, 38, p.glow, 0.55);
    const body = [[-15, -22], [-22, -8], [-23, 8], [-16, 24], [16, 24], [23, 8], [22, -8], [15, -22]];
    oc(S, body, tk.mix(p.base, '#fff0b8', 0.42), { depth: 7, shadow: tk.mix(p.base, p.dark, 0.35), rim: '#fff6d0', rimW: S.L(1.6) });
    S.fill(ell(0, 1, 12, 17, 0, 14), '#fffbe0', 0.55);
    if (S.d) [-12, -2, 8, 18].forEach((y) => S.ink(bez2([-21.5, y], [0, y + 5.5], [21.5, y], 8), { w: 1.4, color: p.deep, alpha: 0.65, taper: 0.1, wobble: 0 }));
    else [-8, 6].forEach((y) => S.ink(bez2([-21.5, y], [0, y + 5.5], [21.5, y], 8), { w: 1.6, color: p.deep, alpha: 0.7, taper: 0.1, wobble: 0 }));
    oc(S, rr(-15, -29, 30, 9, 2.5), N.black, { depth: 2.5, tension: 0.5, shadow: '#100a24' });
    oc(S, rr(-15, 21, 30, 9, 2.5), N.black, { depth: 2.5, tension: 0.5, shadow: '#100a24' });
    S.stroke([[0, 30], [0, 37]], 2.2, N.gold, { ow: 0.8 }); S.circle(0, 39, 3, N.gold); S.ring(0, 39, 3, 1.4, INK);
    S.spark(19, -20, 5, { color: '#fffbe0' });
  };
  RELICF.mask = (S, p) => {
    // a kitsune mask: white face, pointed ears, red markings, slit eyes
    const face = [[-25, -30, 1], [-17, -13], [-23, 3], [-13, 21], [0, 33, 1], [13, 21], [23, 3], [17, -13], [25, -30, 1], [10, -18], [0, -15], [-10, -18]];
    oc(S, face, '#fff8f0', { depth: 6, shadow: '#cfc0e0', tension: 0.7 });
    S.fill(poly([[-22, -27], [-16, -14], [-12, -20]]), p.base, 0.9); S.fill(poly([[22, -27], [16, -14], [12, -20]]), p.base, 0.9);
    S.stroke([[-21, 2], [-14, 6], [-8, 14]], 3.4, p.base, { ow: 0, taperEnd: 0.6 }); S.stroke([[21, 2], [14, 6], [8, 14]], 3.4, p.base, { ow: 0, taperEnd: 0.6 });
    S.stroke([[-19, -8], [-10, -3], [-4, -1]], 4, p.base, { ow: 0, taperStart: 0.1 }); S.stroke([[19, -8], [10, -3], [4, -1]], 4, p.base, { ow: 0, taperStart: 0.1 });
    S.fill(poly([[-16, -7], [-4, -3], [-7, 1], [-17, -3]]), INK); S.fill(poly([[16, -7], [4, -3], [7, 1], [17, -3]]), INK);
    S.circle(0, 10, 3, INK);
    S.stroke([[0, -13], [0, -6]], 3.2, p.base, { ow: 0, taperEnd: 0.5 });
    if (S.d) { S.spark(-16, -6, 3, { color: '#ffffff', glow: 0 }); S.spark(16, -6, 3, { color: '#ffffff', glow: 0 }); }
  };
  function foldFan(S, p, o) {
    o = o || {};
    const cx = 0, cy = 28, R = o.R || 56, a0 = -PI * 0.88, a1 = -PI * 0.12, n = 6;
    const cols = [p.base, tk.mix(p.pale, '#ffffff', 0.4)];
    for (let i = 0; i < n; i++) {
      const u0 = a0 + (a1 - a0) * i / n, u1 = a0 + (a1 - a0) * (i + 1) / n;
      oc(S, poly([[cx, cy]].concat(tk.arcPts(cx, cy, R, R, u0, u1, 4))), cols[i % 2], { line: S.L(2.3), depth: 4, shadow: i % 2 ? p.pale : p.shade, shadowT: 0.2 });
      if (S.d && i % 2 === 0) { const a = (u0 + u1) / 2; S.circle(cx + cos(a) * R * 0.66, cy + sin(a) * R * 0.66, 2.1, p.pale, 0.9); }
    }
    S.g.save(); S.g.beginPath(); S.g.arc(cx, cy, R * 0.985, a0, a1); S.g.strokeStyle = N.gold; S.g.lineWidth = S.T(3.4); S.g.stroke(); S.g.restore();
    [a0, a1].forEach((a) => S.stroke([[cx, cy], [cx + cos(a) * R, cy + sin(a) * R]], 4.4, N.woodL, { ow: 1.6 }));
    S.circle(cx, cy, 5, N.gold); S.ring(cx, cy, 5, 1.8, INK);
    S.stroke([[cx, cy + 4], [cx + 3, cy + 12]], 2, p.dark, { ow: 0.8 }); S.circle(cx + 3.5, cy + 14, 2.8, N.gold);
  }
  RELICF.fan = (S, p) => S.at(0, 3, 0, 0.82, 0.82, () => foldFan(S, p));
  RELICF.bell = (S, p) => {
    const body = [[-7, -25], [7, -25], [12, -18], [15, -3], [19, 12], [25, 21], [-25, 21], [-19, 12], [-15, -3], [-12, -18]];
    S.stroke([[0, -34], [0, -26]], 3, p.dark, { ow: 1 }); S.g.save(); S.g.beginPath(); S.g.arc(0, -35, 4.6, 0, TAU); S.g.strokeStyle = INK; S.g.lineWidth = S.L(5.2); S.g.stroke(); S.g.strokeStyle = N.gold; S.g.lineWidth = S.T(2.4); S.g.stroke(); S.g.restore();
    oc(S, body, p.base, { depth: 7, shadow: p.shade, rim: p.glow, rimW: S.L(1.5), tension: 0.8 });
    S.stroke([[-24, 15], [24, 15]], 4, p.dark, { ow: 0, alpha: 0.85 }); S.stroke([[-22, 10], [22, 10]], 1.6, p.pale, { ow: 0, alpha: 0.7 });
    S.stroke([[-8, -19], [-11, -2], [-15, 12]], 4, '#ffffff', { ow: 0, taperStart: 0.2, taperEnd: 0.4, alpha: 0.6 });
    S.cel(circ(0, 26, 5.2), N.gold, { line: S.L(2), shadow: N.goldD, depth: 2, hi: false });
    S.spark(22, -16, 5, { color: '#ffffff' });
  };
  RELICF.key = (S, p) => {
    S.at(-1, 1, 0.78, 1, 1, () => {
      // shaft, then teeth, then the ornate bow with a gem inlay
      S.cel(rr(-4, -10, 8, 50, 2), N.gold, { line: S.L(2.4), shadow: N.goldD, depth: 3, tension: 0.5, hi: false });
      S.cel(poly([[4, 26], [13, 26], [13, 32], [4, 32]]), N.gold, { line: S.L(2.2), shadow: N.goldD, depth: 2, hi: false });
      S.cel(poly([[4, 35], [11, 35], [11, 40], [4, 40]]), N.gold, { line: S.L(2.2), shadow: N.goldD, depth: 2, hi: false });
      S.cel(circ(0, -18, 14), N.gold, { line: S.L(2.8), shadow: N.goldD, depth: 4, rim: N.gold2, rimW: S.L(1.4), hi: S.d ? N.gold2 : undefined });
      S.circle(0, -18, 8, p.plate); S.ring(0, -18, 8, 1.6, INK);
      S.cel(circ(0, -18, 6), p.base, { line: S.L(1.8), shadow: p.shade, depth: 2.4, rim: p.glow, hi: false });
      S.spark(2, -20, 3.4, { color: '#ffffff', glow: 0 });
      S.cel(rr(-7, -6, 14, 5, 1.5), N.gold, { line: S.L(2), shadow: N.goldD, depth: 1.5, tension: 0.5, hi: false });
    });
  };
  RELICF.scroll = (S, p) => {
    oc(S, rr(-27, -17, 54, 34, 2), '#f6ead0', { depth: 5, shadow: '#cdb98e', tension: 0.3 });
    S.fill(rect(-27, -17, 54, 5), p.base); S.fill(rect(-27, 12, 54, 5), p.base);
    (S.d ? [-8, -1, 6] : [-6, 3]).forEach((y, i) => S.stroke([[-19, y], [i === 0 ? 14 : 19 - i * 4, y]], S.d ? 2 : 3, N.inkL, { ow: 0, alpha: 0.75 }));
    [-1, 1].forEach((sd) => { oc(S, rr(sd * 27 - 4.5, -24, 9, 48, 3), N.woodL, { depth: 3, shadow: N.woodD, tension: 0.5 }); S.circle(sd * 27, -25, 4.2, N.gold); S.ring(sd * 27, -25, 4.2, 1.5, INK); S.circle(sd * 27, 25, 4.2, N.gold); S.ring(sd * 27, 25, 4.2, 1.5, INK); });
    S.stroke([[0, -17], [0, 17]], 5, N.red, { ow: 1.4 }); S.cel(circ(0, 0, 5), N.red, { line: S.L(1.8), depth: 1.6, hi: false, shadow: N.redD });
    if (S.d) S.spark(24, -20, 4, { color: '#fff6d0', glow: 0 });
  };
  RELICF.coin = (S, p) => {
    S.glow(0, 0, 40, N.gold2, 0.4);
    S.cel(circ(0, 0, 29), N.gold, { line: S.L(3), shadow: N.goldD, depth: 7, rim: N.gold2, rimW: S.L(1.8), hi: S.d ? N.gold2 : undefined, hiW: S.L(2.6) });
    S.g.save(); S.g.beginPath(); S.g.arc(0, 0, 23.5, 0, TAU); S.g.strokeStyle = N.goldD; S.g.lineWidth = S.T(2.2); S.g.stroke(); S.g.restore();
    S.cel(rect(-8.5, -8.5, 17, 17), p.plate, { line: S.L(2.4), shadow: '#07051a', depth: 3, hi: false, tension: 0.2 });
    [[0, -17], [0, 17], [-17, 0], [17, 0]].forEach((m, i) => S.stroke(i < 2 ? [[m[0] - 4, m[1]], [m[0] + 4, m[1]]] : [[m[0], m[1] - 4], [m[0], m[1] + 4]], 2.6, N.goldD, { ow: 0 }));
    S.spark(19, -22, 6.5, { color: '#ffffff' });
  };
  RELICF.jar = (S, p) => {
    const body = [[-11, -14], [-22, -6], [-26, 8], [-20, 24], [0, 30], [20, 24], [26, 8], [22, -6], [11, -14]];
    oc(S, body, p.base, { depth: 8, shadow: p.shade, rim: p.glow, rimW: S.L(1.6), tension: 0.9 });
    S.stroke([[-14, -3], [-19, 8], [-14, 19]], 4, '#ffffff', { ow: 0, taperStart: 0.2, taperEnd: 0.4, alpha: 0.5 });
    oc(S, rr(-12, -22, 24, 9, 3), tk.mix(p.dark, p.base, 0.4), { depth: 3, shadow: p.dark, tension: 0.5 });
    oc(S, rr(-8, -30, 16, 9, 3), N.paper, { depth: 2.5, shadow: N.paperD, tension: 0.5 });
    S.stroke([[-12, -15], [12, -15]], 2.4, N.red, { ow: 0.8 });
    S.cel(rr(-11, -1, 22, 16, 2), '#f6ead0', { line: S.L(2), shadow: '#cdb98e', depth: 2.5, hi: false, tension: 0.3 });
    S.stroke([[-6, 4], [6, 4]], 2.2, N.inkL, { ow: 0, alpha: 0.8 }); S.stroke([[-5, 10], [5, 10]], 2.2, N.inkL, { ow: 0, alpha: 0.8 });
  };
  RELICF.geta = (S, p) => {
    // one clog from above and in front: the oval board, the two teeth peeking under its edge, the V strap in the palette colour
    oc(S, rr(-27, 12, 9, 15, 2), N.wood, { depth: 3, shadow: N.woodD, tension: 0.4 }); oc(S, rr(17, 12, 9, 15, 2), N.wood, { depth: 3, shadow: N.woodD, tension: 0.4 });
    oc(S, rr(-34, -2, 68, 18, 8), N.wood, { depth: 4, shadow: N.woodD, tension: 0.7 });
    oc(S, ell(0, -6, 34, 15, 0, 22), N.woodL, { depth: 6, shadow: N.woodD, tension: 0.9, rim: '#ffe0a8' });
    S.g.save(); S.g.lineCap = 'round'; S.g.lineJoin = 'round';
    S.g.beginPath(); S.g.moveTo(-16, -9); S.g.lineTo(14, -6); S.g.lineTo(-13, 3); S.g.strokeStyle = INK; S.g.lineWidth = S.L(11); S.g.stroke(); S.g.strokeStyle = p.base; S.g.lineWidth = S.L(6.4); S.g.stroke();
    S.g.restore();
    S.circle(14, -6, 3.6, p.dark); S.ring(14, -6, 3.6, 1.4, INK);
    S.stroke([[-6, -12], [8, -10]], 1.8, '#ffffff', { ow: 0, alpha: 0.55 });
  };
  RELICF.kasa = (S, p) => {
    const hat = [[0, -32, 1], [12, -10], [34, 14], [22, 24], [0, 20], [-22, 24], [-34, 14], [-12, -10]];
    oc(S, hat, '#e8c47a', { depth: 8, shadow: '#a8782a', rim: '#fff0c0', rimW: S.L(1.6), tension: 0.8 });
    S.clip(poly(hat), () => {
      for (let i = -3; i <= 3; i++) S.ink([[0, -32], [i * 11, 24]], { w: 1.1, color: '#a8782a', alpha: 0.65, taper: 0.1, wobble: 0 });
      [-2, 6, 14].forEach((y) => S.ink(bez2([-34, y + 8], [0, y + 12], [34, y + 8], 8), { w: 1.1, color: '#a8782a', alpha: 0.5, taper: 0.05, wobble: 0 }));
    });
    S.stroke([[-22, 21], [-16, 31], [-10, 34]], 3.2, p.base, { ow: 0.8 }); S.stroke([[22, 21], [16, 31], [10, 34]], 3.2, p.base, { ow: 0.8 });
    S.circle(0, -31, 3, p.base); S.ring(0, -31, 3, 1.5, INK);
  };
  RELICF.incense = (S, p) => {
    oc(S, [[-24, 6], [-18, 26], [18, 26], [24, 6]], '#8a6a4a', { depth: 6, shadow: '#4a3218', tension: 0.5 });
    [-15, 0, 15].forEach((x) => S.cel(circ(x, 29, 3.6), '#4a3218', { line: S.L(2), depth: 1.6, hi: false }));
    S.fill(ell(0, 6, 24, 7, 0, 18), '#c9c4b8'); S.g.save(); S.g.beginPath(); S.g.ellipse(0, 6, 24, 7, 0, 0, TAU); S.g.strokeStyle = INK; S.g.lineWidth = S.L(2.4); S.g.stroke(); S.g.restore();
    S.stroke([[-13, 5], [-17, -14]], 2.6, '#8a4a2a', { ow: 0.8 }); S.stroke([[0, 5], [0, -18]], 2.6, '#8a4a2a', { ow: 0.8 }); S.stroke([[13, 5], [17, -12]], 2.6, '#8a4a2a', { ow: 0.8 });
    [[-17, -15], [0, -19], [17, -13]].forEach((t) => { S.circle(t[0], t[1], 2.6, '#ff9a2e'); S.circle(t[0], t[1], 1.2, '#fff0a0'); });
    [[-17, -18, -8], [0, -22, 4], [17, -16, 10]].forEach((sm, i) => S.stroke(bez3([sm[0], sm[1]], [sm[0] + 9, sm[1] - 8], [sm[0] - 9, sm[1] - 14], [sm[0] + sm[2] * 0.3, sm[1] - 22], 8), 3.2, p.glow, { ow: 0.8, taperStart: 0.1, taperEnd: 0.6, alpha: 0.85 }));
  };
  RELICF.mirror = (S, p) => {
    oc(S, rr(-5, 16, 10, 20, 3), N.woodL, { depth: 3, shadow: N.woodD, tension: 0.5 }); S.stroke([[-5, 20], [5, 20]], 2.4, N.gold, { ow: 0.6 });
    S.cel(circ(0, -8, 26), N.gold, { line: S.L(3), shadow: N.goldD, depth: 6, rim: N.gold2, hi: false });
    S.cel(circ(0, -8, 20.5), tk.mix(p.pale, '#ffffff', 0.35), { line: S.L(2.2), shadow: p.pale, depth: 6, hi: false, rim: '#ffffff', rimW: S.L(1.4) });
    S.clip(circ(0, -8, 20), () => { S.fill(poly([[-30, 8], [-6, -36], [4, -36], [-20, 8]]), '#ffffff', 0.55); S.fill(poly([[-8, 12], [8, -30], [12, -30], [-4, 12]]), '#ffffff', 0.3); });
    S.spark(9, -14, 6, { color: '#ffffff' });
  };
  RELICF.comb = (S, p) => {
    const bar = [[-31, -2], [-27, -18], [-12, -27], [12, -27], [27, -18], [31, -2]];
    oc(S, bar, p.base, { depth: 5, shadow: p.shade, tension: 0.75, rim: p.glow });
    S.g.save(); S.g.beginPath(); tk.trace(S.g, bar, 0, 0, 0.75); S.g.clip();
    S.ink([[-25, -12], [25, -12]], { w: 1.6, color: N.gold, alpha: 0.9, taper: 0.1, wobble: 0 });
    S.g.restore();
    for (let i = 0; i < 9; i++) { const x = -27 + i * 6.75; oc(S, poly([[x - 2.3, -3], [x + 2.3, -3], [x + 1.4, 26], [x - 1.4, 26]]), tk.mix(p.base, p.pale, 0.15), { line: S.L(1.7), depth: 1.6, shadow: p.shade, hi: false }); }
    S.cel(poly(starPts(0, -15, 6.5, 3, 5, -PI / 2)), N.gold, { line: S.L(1.8), shadow: N.goldD, depth: 1.5, hi: false });
  };
  RELICF.dice = (S, p) => {
    const pip = (x, y) => { S.circle(x, y, 2.7, INK); };
    S.at(-9, -8, -0.3, 1, 1, () => { oc(S, rr(-15, -15, 30, 30, 6), tk.mix(p.pale, '#ffffff', 0.4), { depth: 5, shadow: p.pale, tension: 0.6 }); [[-7, -7], [7, 7]].forEach((q) => pip(q[0], q[1])); pip(0, 0); pip(-7, 7); pip(7, -7); });
    S.at(13, 12, 0.32, 1, 1, () => { oc(S, rr(-14, -14, 28, 28, 6), p.base, { depth: 5, shadow: p.shade, tension: 0.6, rim: p.glow }); S.circle(0, 0, 4.6, '#ffffff'); S.ring(0, 0, 4.6, 1.6, INK); [[-7, -7], [7, 7]].forEach((q) => S.circle(q[0], q[1], 2.7, '#ffffff')); });
  };
  RELICF.drum = (S, p) => {
    // a taiko seen face on: the sticks lie crossed behind it, the rim is studded, the skin carries a swirling tomoe
    S.stroke([[-33, 33], [24, -24]], 4.6, N.woodL, { ow: 1.6 }); S.stroke([[33, 33], [-24, -24]], 4.6, N.woodL, { ow: 1.6 });
    S.circle(24, -24, 4.2, '#fff6e0'); S.ring(24, -24, 4.2, 1.6, INK); S.circle(-24, -24, 4.2, '#fff6e0'); S.ring(-24, -24, 4.2, 1.6, INK);
    S.cel(circ(0, 2, 29), N.woodL, { line: S.L(3), shadow: N.woodD, depth: 7, rim: '#ffe0a8', hi: false });
    for (let i = 0; i < 14; i++) { const a = i * TAU / 14; S.circle(cos(a) * 25, 2 + sin(a) * 25, S.d ? 1.7 : 2.2, N.gold); }
    S.cel(circ(0, 2, 20.5), tk.mix(p.pale, '#fff6e0', 0.5), { line: S.L(2.4), shadow: p.pale, depth: 6, hi: false, rim: '#ffffff', rimW: S.L(1.2) });
    tk.inkPath(S.g, tk.arcPts(0, 2, 9, 9, -PI * 0.7, PI * 0.95, 8), { w: S.T(9), color: p.base, taperStart: 0.5, taperEnd: 0.05, pressure: 'flat', wobble: 0 });
    S.circle(cos(-PI * 0.7) * 9, 2 + sin(-PI * 0.7) * 9, S.T(5.4), p.base);
  };
  RELICF.brush = (S, p) => {
    // a pair of taiko bachi drumsticks crossed, gold end caps, two sound arcs
    [0.8, -0.8].forEach((a, i) => S.at(0, 4, a, 1, 1, () => {
      oc(S, [[-3.5, -40], [3.5, -40], [5.5, 38], [-5.5, 38]].map((q) => q), p.base, { depth: 3, shadow: p.shade, rim: p.glow, rimW: S.L(1.1) });
      S.stroke([[-4.6, -14], [4.6, -14]], 2, p.dark, { ow: 0 });
      oc(S, ell(0, -41, 5.4, 4.6, 0, 12), N.gold, { depth: 2, shadow: N.goldD });
      oc(S, rr(-6.4, 33, 12.8, 9, 3.5), N.gold, { depth: 2, shadow: N.goldD, tension: 0.5 });
    }));
    [11, 19].forEach((r, i) => { S.g.save(); S.g.lineCap = 'round'; S.g.beginPath(); S.g.arc(0, -12, r, -2.3, -0.84); S.g.strokeStyle = INK; S.g.lineWidth = S.T(4.2); S.g.stroke(); S.g.strokeStyle = p.glow; S.g.lineWidth = S.T(2.2); S.g.globalAlpha *= 1 - i * 0.2; S.g.stroke(); S.g.restore(); });
    S.spark(24, 22, 5, { color: p.glow });
  };
  RELICF.inkstone = (S, p) => {
    // a rin singing bowl: a bronze bowl on a small cushion, a striker resting on the rim, two rising sound arcs
    oc(S, rr(-26, 22, 52, 12, 5), p.base, { depth: 3, shadow: p.shade, tension: 0.6, rim: p.glow, rimW: S.L(1.1) });
    oc(S, [[-30, -4], [30, -4], [29, 6], [21, 17], [0, 23], [-21, 17], [-29, 6]], pal.bronze, { depth: 6, shadow: '#7a4a1c', rim: '#f0c27a', rimW: S.L(1.3), tension: 0.6 });
    S.g.save(); S.g.beginPath(); S.g.ellipse(0, -4, 30, 7, 0, 0, TAU); S.g.fillStyle = '#5a3a14'; S.g.fill(); S.g.lineWidth = S.L(2.4); S.g.strokeStyle = INK; S.g.stroke(); S.g.restore();
    S.ink([[-22, -4], [0, -1], [22, -4]], { w: 1.8, color: '#f0c27a', alpha: 0.8, taper: 0.5, wobble: 0 });
    S.at(14, -8, 0.7, 1, 1, () => { oc(S, rr(-3, -22, 6, 30, 2.5), N.woodL, { depth: 2, shadow: N.woodD, tension: 0.5 }); oc(S, circ(0, -23, 4.4), N.gold, { depth: 2, shadow: N.goldD }); });
    [14, 22].forEach((r, i) => { S.g.save(); S.g.lineCap = 'round'; S.g.beginPath(); S.g.arc(-8, -10, r + 6, -2.3, -0.9); S.g.strokeStyle = INK; S.g.lineWidth = S.T(4.2); S.g.stroke(); S.g.strokeStyle = p.glow; S.g.lineWidth = S.T(2.2); S.g.globalAlpha *= 1 - i * 0.2; S.g.stroke(); S.g.restore(); });
  };
  RELICF.seal = (S, p) => {
    // a chop: a lacquered handle with a gold collar, a stone block and the red imprint it leaves
    oc(S, rr(-9.5, -34, 19, 30, 5), p.base, { depth: 4, shadow: p.shade, tension: 0.6, rim: p.glow });
    S.stroke([[-9.5, -22], [9.5, -22]], 2.6, N.gold, { ow: 0.8 }); S.stroke([[-9.5, -10], [9.5, -10]], 2.6, N.gold, { ow: 0.8 });
    oc(S, rr(-17, -6, 34, 16, 3), '#e8dcc0', { depth: 4, shadow: '#b9ab86', tension: 0.4 });
    oc(S, rr(-19, 14, 38, 20, 3), N.red, { depth: 4, shadow: N.redD, tension: 0.35, rim: '#ff8a7a' });
    S.stroke([[-11, 20], [11, 20]], 2.6, '#fff8f0', { ow: 0, alpha: 0.9 }); S.stroke([[-11, 27], [4, 27]], 2.6, '#fff8f0', { ow: 0, alpha: 0.9 }); S.stroke([[8, 22], [8, 29]], 2.6, '#fff8f0', { ow: 0, alpha: 0.9 });
  };
  RELICF.umbrella = (S, p) => {
    // an oil-paper parasol tilted a little: ribbed canopy in two tones, the pole, a hooked handle
    S.at(2, 0, 0.16, 1, 1, () => {
      S.stroke([[0, -26], [0, 26], [5, 33], [11, 32]], 3.4, N.woodD, { ow: 1 });
      const canopy = [[-34, 8], [-30, -8], [-14, -22], [0, -27, 1], [14, -22], [30, -8], [34, 8], [24, 3], [12, 8], [0, 3], [-12, 8], [-24, 3]];
      oc(S, canopy, p.base, { depth: 7, shadow: p.shade, rim: p.glow, rimW: S.L(1.5), tension: 0.55 });
      S.clip(canopy, () => {
        [[-30, 8, -14, 12], [-14, 12, 0, 12], [0, 12, 14, 12], [14, 12, 30, 8]].forEach((q, i) => { if (i % 2 === 0) S.fill(poly([[0, -27], [q[0], q[1] + 6], [q[2], q[3] + 6]]), p.pale, 0.8); });
        [-24, -12, 0, 12, 24].forEach((x) => S.ink([[0, -27], [x * 1.3, 8]], { w: 1.3, color: p.deep, alpha: 0.6, taper: 0.1, wobble: 0 }));
      });
      S.circle(0, -28, 2.8, N.gold); S.ring(0, -28, 2.8, 1.4, INK);
    });
  };
  RELICF.charm = (S, p) => {
    // an omamori: a brocade pouch with a folded flap, a gold tag, a tied cord
    S.stroke([[-8, -30], [0, -37], [8, -30]], 2.4, N.red, { ow: 0.8 });
    oc(S, rr(-19, -30, 38, 60, 7), p.base, { depth: 6, shadow: p.shade, tension: 0.55, rim: p.glow });
    oc(S, poly([[-19, -30], [19, -30], [19, -14], [0, -6], [-19, -14]]), tk.mix(p.dark, p.base, 0.45), { depth: 3, shadow: p.dark, tension: 0.2, hi: false });
    S.stroke([[-19, -14], [0, -6], [19, -14]], 1.8, N.gold, { ow: 0 });
    S.cel(rr(-9, 2, 18, 20, 2.5), N.gold, { line: S.L(2), shadow: N.goldD, depth: 2.4, tension: 0.4, hi: false });
    S.stroke([[-4, 8], [4, 8]], 2, N.goldD, { ow: 0 }); S.stroke([[-4, 15], [4, 15]], 2, N.goldD, { ow: 0 });
    S.stroke([[-13, 30], [-14, 39]], 2.6, N.red, { ow: 0.7 }); S.stroke([[0, 30], [0, 40]], 2.6, N.red, { ow: 0.7 }); S.stroke([[13, 30], [14, 39]], 2.6, N.red, { ow: 0.7 });
    S.circle(0, -13, 3.6, N.red); S.ring(0, -13, 3.6, 1.4, INK);
  };
  RELICF.riceball = (S, p) => {
    const tri = [[0, -30], [12, -20], [30, 16], [30, 24], [22, 30], [-22, 30], [-30, 24], [-30, 16], [-12, -20]];
    oc(S, tri, '#fff8f0', { depth: 8, shadow: '#cfc6e4', tension: 0.9, rim: '#ffffff' });
    S.clip(poly(tri), () => { S.fill(poly([[-12, 30], [12, 30], [14, 6], [-14, 6]]), '#241a3a'); });
    S.stroke([[-11, 12], [11, 12]], 1.4, '#4a3a6a', { ow: 0, alpha: 0.8 });
    if (S.d) [[-8, -6], [6, -12], [12, -2], [-16, 4], [0, 0], [-4, -16]].forEach((q) => S.fill(ell(q[0], q[1], 1.6, 1, 0.6, 8), '#e6dcc8'));
    S.circle(0, -12, 4, p.base); S.ring(0, -12, 4, 1.6, INK);
  };
  RELICF.teacup = (S, p) => {
    [[-9, -22, -4], [1, -25, 3], [11, -21, 8]].forEach((sm) => S.stroke(bez3([sm[0], sm[1] + 12], [sm[0] + 7, sm[1] + 6], [sm[0] - 7, sm[1] - 2], [sm[0] + sm[2] * 0.4, sm[1] - 9], 8), 3.2, '#ffffff', { ow: 0.6, taperStart: 0.1, taperEnd: 0.7, alpha: 0.9 }));
    oc(S, [[-26, -6], [-24, 10], [-12, 24], [12, 24], [24, 10], [26, -6]], p.base, { depth: 7, shadow: p.shade, tension: 0.85, rim: p.glow });
    S.fill(ell(0, -6, 26, 7, 0, 20), p.dark); S.fill(ell(0, -6, 21, 5, 0, 20), '#9adf6a');
    S.g.save(); S.g.beginPath(); S.g.ellipse(0, -6, 26, 7, 0, 0, TAU); S.g.strokeStyle = INK; S.g.lineWidth = S.L(2.4); S.g.stroke(); S.g.restore();
    oc(S, rr(-10, 22, 20, 7, 2), p.dark, { depth: 2, shadow: dark(p), tension: 0.4 });
    S.stroke([[-18, 6], [-9, 15]], 3, '#ffffff', { ow: 0, alpha: 0.45, taperEnd: 0.5 });
  };
  RELICF.koi = (S, p) => {
    // a koi in a curve: white body, a big patch of the palette colour, a fanned tail, a bright eye
    S.at(0, 0, -0.2, 1, 1, () => {
      const tail = [[-22, 2], [-32, -10], [-40, -6], [-36, 2], [-40, 10], [-32, 12]];
      oc(S, tail, p.light, { depth: 4, shadow: p.shade, tension: 0.8 });
      const body = [[-24, 2], [-14, -10], [4, -13], [22, -8], [33, 1], [26, 10], [8, 14], [-12, 11]];
      oc(S, body, '#fff8f0', { depth: 6, shadow: '#cfc6e4', tension: 0.9, rim: '#ffffff' });
      S.clip(body, () => { S.fill([[-10, -14], [10, -16], [16, -2], [2, 6], [-10, 0]], p.base); S.fill(circ(-16, 8, 5), p.base); S.fill(circ(26, -8, 3.5), p.base); });
      oc(S, [[4, -12], [0, -24], [12, -18], [14, -10]], p.light, { depth: 3, shadow: p.shade, tension: 0.6 });
      oc(S, [[0, 12], [-4, 22], [10, 18], [10, 12]], p.light, { depth: 3, shadow: p.shade, tension: 0.6 });
      S.circle(26, -2, 3, INK); S.circle(27, -3, 1, '#ffffff');
    });
    S.g.save(); S.g.globalAlpha *= 0.6; S.g.beginPath(); S.g.ellipse(0, 31, 19, 4, 0, 0, TAU); S.g.strokeStyle = p.glow; S.g.lineWidth = S.T(1.4); S.g.stroke(); S.g.restore();
  };
  RELICF.feather = (S, p) => {
    S.glow(0, 0, 40, p.glow, 0.32);
    S.at(0, 0, 0.62, 1, 1, () => {
      const vane = [[0, 40], [-11, 22], [-16, 0], [-14, -22], [-6, -36], [0, -42, 1], [6, -36], [14, -22], [16, 0], [11, 22]];
      oc(S, vane, p.base, { depth: 7, shadow: p.shade, tension: 0.9, rim: p.glow });
      S.clip(vane, () => { S.fill(poly([[-30, -50], [30, -50], [30, -14], [0, -6], [-30, -14]]), tk.mix(p.base, '#ffd84a', 0.55)); S.fill(poly([[-30, -50], [30, -50], [30, -30], [0, -22], [-30, -30]]), '#fff3a0'); });
      S.stroke([[0, 44], [0, -38]], 2.6, N.paper, { ow: 1 });
      if (S.d) [-24, -10, 4, 18].forEach((y, i) => { S.ink([[0, y + 4], [-13 + i, y - 8]], { w: 1.2, color: p.deep, alpha: 0.6, taper: 0.2, wobble: 0 }); S.ink([[0, y + 4], [13 - i, y - 8]], { w: 1.2, color: p.deep, alpha: 0.6, taper: 0.2, wobble: 0 }); });
    });
    S.spark(-24, -20, 5, { color: '#fff3a0' }); S.spark(24, 24, 4, { color: '#ffd84a' });
  };
  RELICF.crown = (S, p) => {
    const crown = [[-27, 12], [-30, -14], [-15, -2], [-8, -25], [0, -5], [8, -25], [15, -2], [30, -14], [27, 12]];
    S.glow(0, -6, 40, N.gold2, 0.3);
    oc(S, poly(crown), N.gold, { depth: 6, shadow: N.goldD, rim: N.gold2, rimW: S.L(1.6), hi: S.d ? N.gold2 : undefined });
    oc(S, rr(-28, 10, 56, 14, 3), N.gold, { depth: 4, shadow: N.goldD, tension: 0.4, rim: N.gold2 });
    [[-8, -25], [8, -25], [-30, -14], [30, -14], [0, -5]].forEach((t) => { S.cel(circ(t[0], t[1] - 1, 3.6), i2c(t), { line: S.L(1.8), depth: 1.6, hi: false, shadow: p.shade }); });
    function i2c(t) { return t[0] === 0 ? p.base : '#fff8f0'; }
    [-17, 0, 17].forEach((x, i) => S.cel(poly([[x, 12.5], [x + 5.4, 17], [x, 22.5], [x - 5.4, 17]]), i === 1 ? p.base : p.light, { line: S.L(1.8), depth: 1.8, hi: false, shadow: p.shade }));
    S.spark(22, -26, 5.5, { color: '#ffffff' });
  };
  RELICF.hourglass = (S, p) => {
    oc(S, rr(-24, -34, 48, 7, 2), N.woodL, { depth: 2.5, shadow: N.woodD, tension: 0.4 }); oc(S, rr(-24, 27, 48, 7, 2), N.woodL, { depth: 2.5, shadow: N.woodD, tension: 0.4 });
    [-20, 20].forEach((x) => S.stroke([[x, -28], [x, 28]], 3.6, N.wood, { ow: 1.2 }));
    const top = [[-16, -27], [16, -27], [16, -20], [2.5, -2], [-2.5, -2], [-16, -20]], bot = [[-2.5, 2], [2.5, 2], [16, 20], [16, 27], [-16, 27], [-16, 20]];
    oc(S, poly(top), tk.mix(p.pale, '#ffffff', 0.4), { depth: 4, shadow: p.pale, hi: false, shadowT: 0.15 }); oc(S, poly(bot), tk.mix(p.pale, '#ffffff', 0.4), { depth: 4, shadow: p.pale, hi: false, shadowT: 0.15 });
    S.clip(poly(top), () => S.fill(poly([[-20, -14], [20, -14], [20, 0], [-20, 0]]), p.base)); S.clip(poly(bot), () => S.fill(poly([[-2, 8], [2, 8], [20, 28], [-20, 28]]), p.base));
    S.stroke([[0, -3], [0, 12]], 1.8, p.base, { ow: 0 });
    S.spark(11, -20, 4, { color: '#ffffff', glow: 0 });
  };
  RELICF.compass = (S, p) => {
    S.cel(circ(0, 0, 32), N.gold, { line: S.L(3), shadow: N.goldD, depth: 7, rim: N.gold2, hi: S.d ? N.gold2 : undefined });
    S.cel(circ(0, 0, 26), '#f6ead0', { line: S.L(2.4), shadow: '#cdb98e', depth: 6, hi: false });
    for (let i = 0; i < 8; i++) { const a = i * PI / 4 - PI / 2, r0 = i % 2 ? 21 : 18.5; S.ink([[cos(a) * r0, sin(a) * r0], [cos(a) * 25, sin(a) * 25]], { w: i % 2 ? 1.4 : 2.4, color: INK, taper: 0, pressure: 'flat', wobble: 0 }); }
    S.at(0, 0, 0.72, 1, 1, () => { S.cel(poly([[0, -20], [5, 0], [-5, 0]]), p.base, { line: S.L(2), shadow: p.shade, depth: 2, hi: false }); S.cel(poly([[0, 20], [5, 0], [-5, 0]]), '#fff8f0', { line: S.L(2), shadow: '#cfc6e4', depth: 2, hi: false }); });
    S.circle(0, 0, 3, N.gold); S.ring(0, 0, 3, 1.4, INK);
    S.gloss(0, 0, 21, -PI * 0.8, -PI * 0.45, 2.4, 0.6);
  };
  RELICF.candle = (S, p) => {
    S.glow(0, -18, 30, '#ffd070', 0.5);
    oc(S, rr(-9, -8, 18, 36, 2.5), tk.mix(p.pale, '#fff6e0', 0.5), { depth: 4, shadow: p.pale, tension: 0.35, rim: '#ffffff' });
    S.fill(poly([[-9, -8], [9, -8], [9, -3], [5, 2], [3, -2], [-2, 6], [-5, -1], [-9, 1]]), p.base, 0.85);
    S.stroke([[0, -8], [0, -13]], 1.8, INK, { ow: 0 });
    S.cel([[0, -34, 1], [6, -24], [6, -17], [0, -12], [-6, -17], [-6, -24]], '#ff9a2e', { line: S.L(2.2), shadow: '#d0451a', depth: 3, hi: false });
    S.cel([[0, -26, 1], [3, -20], [0, -15], [-3, -20]], '#fff0a0', { line: false, shadow: '#ffe060', depth: 1.4, hi: false });
    oc(S, poly([[-20, 25], [20, 25], [24, 32], [-24, 32]]), N.gold, { depth: 2.4, shadow: N.goldD, hi: false });
    oc(S, poly([[-14, 20], [14, 20], [20, 25], [-20, 25]]), N.goldM, { depth: 2, shadow: N.goldD, hi: false });
  };
  RELICF.ribbon = (S, p) => {
    S.cel([[-3, 4], [-14, 12], [-22, 32], [-13, 27], [-8, 36], [-2, 14]], p.dark, { line: S.L(2.2), shadow: dark(p), depth: 3, hi: false, tension: 0.4 });
    S.cel([[3, 4], [14, 12], [22, 32], [13, 27], [8, 36], [2, 14]], p.shade, { line: S.L(2.2), shadow: dark(p), depth: 3, hi: false, tension: 0.4 });
    oc(S, [[-3, -2], [-14, -16], [-30, -20], [-32, -4], [-30, 10], [-14, 6]], p.base, { depth: 6, shadow: p.shade, rim: p.glow, tension: 0.9 });
    oc(S, [[3, -2], [14, -16], [30, -20], [32, -4], [30, 10], [14, 6]], p.base, { depth: 6, shadow: p.shade, rim: p.glow, tension: 0.9 });
    S.stroke([[-8, -6], [-22, -14]], 2.6, '#ffffff', { ow: 0, alpha: 0.55, taperEnd: 0.6 }); S.stroke([[8, -6], [22, -14]], 2.6, '#ffffff', { ow: 0, alpha: 0.4, taperEnd: 0.6 });
    oc(S, rr(-8, -10, 16, 20, 5), p.base, { depth: 4, shadow: p.shade, tension: 0.6, rim: p.glow });
    S.spark(0, -14, 4, { color: '#ffffff', glow: 0 });
  };
  RELICF.sword = (S, p) => {
    S.glow(0, 0, 36, p.glow, 0.28);
    S.at(0, 0, 0.78, 1, 1, () => sword(S, { len: 84, w: 12, blade: '#e8eef9', guard: N.gold, grip: p.dark }));
    S.spark(-20, -22, 6, { color: '#ffffff' }); S.spark(24, 22, 4.5, { color: p.glow });
    if (S.d) { S.ink([[-30, 28], [-20, 24]], { w: 1.6, color: p.glow, taper: 0.5 }); S.ink([[-28, 22], [-20, 18]], { w: 1.4, color: p.glow, taper: 0.5 }); }
  };

  RELICF.flute = (S, p) => {
    // a lacquered transverse flute lying on the diagonal: gold bindings, finger holes, a red tassel, two floating notes
    S.at(0, 3, -0.62, 1, 1, () => {
      oc(S, rr(-40, -6.5, 80, 13, 6), p.base, { depth: 4, shadow: p.shade, tension: 0.5, rim: p.glow, rimW: S.L(1.2) });
      S.stroke([[-30, -3], [34, -3]], 2, '#ffffff', { ow: 0, alpha: 0.5, taperEnd: 0.5 });
      [-36, -22, 30, 36].forEach((x) => { S.cel(rect(x - 2.2, -7.5, 4.4, 15), N.gold, { line: S.L(1.8), shadow: N.goldD, depth: 1.4, hi: false }); });
      [-12, -3, 6, 15, 23].forEach((x) => { S.circle(x, 1, 2.9, INK); S.circle(x - 0.7, 0.3, 0.9, p.glow, 0.8); });
      S.circle(-6, -2.8, 2.2, N.gold);   // the mouth hole
    });
    S.stroke(bez3([-35, 20], [-36, 28], [-42, 31], [-40, 38], 8), 2.6, N.red, { ow: 0.8, taperEnd: 0.4 });
    S.cel(circ(-40, 38, 3.6), N.red, { line: S.L(1.8), shadow: N.redD, depth: 1.6, hi: false });
    S.circle(21, -27, 4, N.paper); S.ring(21, -27, 4, 1.9, INK); S.stroke([[24.5, -27], [24.5, -37]], 2, INK, { ow: 0 });
    if (S.d) { S.circle(31, -16, 3, p.glow); S.ring(31, -16, 3, 1.5, INK); S.stroke([[33.5, -16], [33.5, -25]], 1.8, INK, { ow: 0 }); }
  };
  RELICF.katana_guard = (S, p) => {
    // a tsuba: a pale iron disc with a four-lobed mokko edge, a gold inlay ring, four leaf-shaped openwork cut-outs round a narrow blade slot
    const iron = '#8f8bb0', ironD = '#4a4664';
    const lobes = []; for (let i = 0; i < 36; i++) { const a = i * TAU / 36; lobes.push([cos(a) * (30 + 3.4 * cos(a * 4)), sin(a) * (30 + 3.4 * cos(a * 4))]); }
    oc(S, lobes, iron, { depth: 7, shadow: ironD, rim: '#d8d4f0', rimW: S.L(1.6), tension: 0.9, line: S.L(3), hi: S.d ? '#b4b0d0' : undefined });
    S.g.save(); S.g.beginPath(); S.g.arc(0, 0, 27, 0, TAU); S.g.strokeStyle = N.gold; S.g.lineWidth = S.T(2.4); S.g.stroke(); S.g.restore();
    for (let i = 0; i < 4; i++) {
      S.at(0, 0, i * PI / 2, 1, 1, () => {
        S.cel([[0, -11], [5.4, -17], [4.4, -24], [0, -25.5, 1], [-4.4, -24], [-5.4, -17]], '#0c0820', { line: S.L(1.9), depth: 1, hi: false, shadow: '#07051a', tension: 0.7 });
        S.circle(0, -17.5, S.d ? 1.5 : 1.8, p.base);
      });
    }
    S.cel(rr(-3.6, -8.5, 7.2, 17, 3), '#0c0820', { line: S.L(2), depth: 1, hi: false, shadow: '#07051a', tension: 0.6 });
    S.gloss(0, 0, 22, -PI * 0.9, -PI * 0.55, 2.6, 0.55);
    S.spark(21, -22, 4.6, { color: '#ffffff' });
  };
  RELICF.bow = (S, p) => {
    // a long yumi: the stave bows out to the left, the string is drawn tight, an arrow lies across the grip
    const stave = bez3([14, -40], [-30, -22], [-30, 22], [14, 40], 14);
    S.stroke(stave, 7, p.base, { ow: 2.1, taperStart: 0.04, taperEnd: 0.04, step: 3, poly: true });
    S.stroke(stave.slice(2, 12).map((q) => [q[0] + 1.6, q[1]]), 2, p.glow, { ow: 0, alpha: 0.7, poly: true });
    S.stroke([[14, -40], [14, 40]], 1.7, '#fff6e0', { ow: 1.1 });
    S.cel(rr(-27, -9, 10, 18, 3), N.woodL, { line: S.L(2), shadow: N.woodD, depth: 2.4, hi: false, tension: 0.5 });
    [-5, 0, 5].forEach((y) => S.stroke([[-27, y], [-17, y]], 1.4, N.woodD, { ow: 0, alpha: 0.9 }));
    S.at(0, 0, 0, 1, 1, () => {
      S.stroke([[-36, 0], [34, 0]], 3, N.paper, { ow: 1.4 });
      S.cel(poly([[-40, 0], [-31, -5.5], [-31, 5.5]]), N.steel, { line: S.L(2), shadow: N.steelD, depth: 1.8, hi: false });
      S.cel(poly([[22, 0], [30, -6], [38, -6], [34, 0], [38, 6], [30, 6]]), N.red, { line: S.L(1.8), shadow: N.redD, depth: 1.6, hi: false });
    });
    S.spark(-12, -30, 4.5, { color: p.glow });
  };
  RELICF.beads = (S, p) => {
    // a juzu: a loop of prayer beads with a big gold master bead and a tassel
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = -PI / 2 + (i + 0.5) * TAU / n + 0.0, c = [cos(a) * 27, -4 + sin(a) * 25];
      if (i === 0) continue;
      S.cel(circ(c[0], c[1], 8.2), i % 3 === 0 ? tk.mix(p.base, '#ffffff', 0.15) : p.base, { line: S.L(2.3), shadow: p.shade, depth: 3.2, hi: false, rim: p.glow, rimW: S.L(1) });
      S.circle(c[0] - 2.4, c[1] - 2.6, 1.7, '#ffffff', 0.85);
    }
    const m = [cos(-PI / 2 + 0.5 * TAU / n) * 27, -4 + sin(-PI / 2 + 0.5 * TAU / n) * 25];
    S.cel(circ(0, -29, 9.6), N.gold, { line: S.L(2.5), shadow: N.goldD, depth: 3.6, hi: false, rim: N.gold2 });
    S.circle(-2.4, -31.5, 2, '#ffffff', 0.9);
    S.stroke([[0, 21], [0, 30]], 2.6, N.red, { ow: 0.8 });
    S.cel(circ(0, 33, 5), N.gold, { line: S.L(2), shadow: N.goldD, depth: 2, hi: false });
    [-5, 0, 5].forEach((x) => S.stroke([[x, 37], [x * 1.4, 45]], 2.4, N.red, { ow: 0.7, taperEnd: 0.3 }));
  };
  RELICF.gourd = (S, p) => {
    // a hyotan: two lobes pinched at the waist, a wooden stopper, a red cord tied round the neck, a curl of vine
    const body = [[-7, -30], [-14, -26], [-16, -14], [-11, -4], [-17, 6], [-22, 18], [-16, 31], [0, 36], [16, 31], [22, 18], [17, 6], [11, -4], [16, -14], [14, -26], [7, -30]];
    oc(S, body, p.base, { depth: 8, shadow: p.shade, rim: p.glow, rimW: S.L(1.6), tension: 0.9, hi: S.d ? p.light : undefined });
    S.stroke([[-8, -22], [-11, -12]], 3.6, '#ffffff', { ow: 0, alpha: 0.6, taperStart: 0.2, taperEnd: 0.5 });
    S.stroke([[-15, 12], [-16, 22]], 4, '#ffffff', { ow: 0, alpha: 0.55, taperStart: 0.2, taperEnd: 0.5 });
    oc(S, rr(-6, -38, 12, 11, 3), N.woodL, { depth: 2.5, shadow: N.woodD, tension: 0.5 });
    S.stroke([[-12, -4], [12, -4]], 4, N.red, { ow: 1.2 });
    S.stroke([[8, -4], [14, 6], [11, 14]], 2.8, N.red, { ow: 0.8, taperEnd: 0.3 });
    S.stroke(bez3([6, -37], [14, -42], [22, -38], [22, -30], 8), 2.4, '#3fb870', { ow: 0.8 });
    S.cel([[22, -30], [30, -34], [30, -26], [24, -24]], '#3fb870', { line: S.L(1.8), shadow: '#17794a', depth: 1.8, hi: false });
  };
  RELICF.heart = (S, p) => {
    // a heartwood charm: a lacquered heart with a carved grain, a gold bail and a red tassel
    S.stroke([[0, -34], [0, -27]], 2.4, N.gold, { ow: 0.8 });
    S.g.save(); S.g.beginPath(); S.g.arc(0, -35.5, 4.4, 0, TAU); S.g.strokeStyle = INK; S.g.lineWidth = S.L(5.4); S.g.stroke(); S.g.strokeStyle = N.gold; S.g.lineWidth = S.T(2.4); S.g.stroke(); S.g.restore();
    const H = poly(unit(HEART, 0, 2, 31, 30));
    oc(S, H, p.base, { depth: 8, shadow: p.shade, rim: p.glow, rimW: S.L(1.6), line: S.L(3), hi: S.d ? p.light : undefined });
    S.gloss(-12, -9, 14, PI * 1.12, PI * 1.58, 4, 0.7);
    S.clip(H, () => {
      [[-8, 14], [4, 20], [-2, 8]].forEach((q, i) => S.ink(bez2([q[0] - 14, q[1] + 4], [q[0], q[1] - 5 - i], [q[0] + 16, q[1] + 3]), { w: 1.4, color: p.deep, alpha: 0.55, taper: 0.4, wobble: 0 }));
      S.ink(bez2([-20, -2], [0, 6], [20, -2]), { w: 1.2, color: p.deep, alpha: 0.4, taper: 0.4, wobble: 0 });
    });
    S.stroke([[0, 31], [-3, 38]], 2.4, N.red, { ow: 0.7 }); [-4, 0, 4].forEach((x) => S.stroke([[x * 0.4, 36], [x * 1.5, 44]], 2.2, N.red, { ow: 0.6, taperEnd: 0.3 }));
    S.spark(15, -14, 4.6, { color: '#ffffff' });
  };
  RELICF.tooth = (S, p) => {
    // a wolf fang capped in gold and hung on a cord with two beads: wide root at the top, the curve sweeping down to a point
    const fang = [[-14, -22], [-2, -26], [12, -22], [15, -8], [11, 8], [3, 22], [-8, 34], [-19, 41, 1], [-19, 26], [-18, 10], [-17, -6]];
    S.stroke(bez3([-33, -36], [-30, -44], [-10, -46], [0, -33], 9), 3, p.base, { ow: 1.1 });
    S.stroke(bez3([33, -36], [30, -44], [10, -46], [0, -33], 9), 3, p.base, { ow: 1.1 });
    [[-31, -37], [31, -37]].forEach((b) => S.cel(circ(b[0], b[1], 4.6), N.gold, { line: S.L(1.9), shadow: N.goldD, depth: 1.8, hi: false }));
    oc(S, fang, '#f3ead6', { depth: 6, shadow: N.boneD, rim: '#ffffff', rimW: S.L(1.4), tension: 0.8, hi: S.d ? '#ffffff' : undefined });
    S.stroke([[-6, -12], [-3, 6], [-10, 24]], 3.8, '#ffffff', { ow: 0, alpha: 0.75, taperStart: 0.2, taperEnd: 0.6 });
    oc(S, rr(-17, -29, 32, 11, 4), N.gold, { depth: 3, shadow: N.goldD, tension: 0.5, rim: N.gold2 });
    S.cel(circ(-1, -33, 4), N.gold, { line: S.L(1.8), shadow: N.goldD, depth: 1.4, hi: false });
    S.circle(-1, -33, 1.6, '#0c0820');
    S.spark(17, -2, 4.2, { color: '#ffffff' });
  };
  RELICF.shell = (S, p) => {
    // a scallop: fanned ribs, hinge ears, a pearl resting at its lip
    const sh = [[-34, 8], [-30, -10], [-18, -26], [0, -31, 1], [18, -26], [30, -10], [34, 8], [24, 20], [0, 26, 1], [-24, 20]];
    oc(S, sh, p.base, { depth: 8, shadow: p.shade, rim: p.glow, rimW: S.L(1.6), tension: 0.7, hi: S.d ? p.light : undefined });
    S.clip(poly(sh), () => {
      for (let i = -4; i <= 4; i++) S.ink([[0, 26], [i * 9.4, -33 + abs(i) * 2.2]], { w: i % 2 ? 1.6 : 2.4, color: p.deep, alpha: 0.7, taper: 0.1, wobble: 0 });
      for (let i = -3; i <= 3; i++) S.ink([[0, 26], [i * 9.4 + 4.7, -33 + abs(i) * 2.2]], { w: 1.2, color: p.pale, alpha: 0.5, taper: 0.1, wobble: 0 });
      S.g.save(); S.g.beginPath(); S.g.arc(0, 26, 38, PI * 1.12, PI * 1.88); S.g.strokeStyle = p.pale; S.g.lineWidth = S.T(2.4); S.g.globalAlpha *= 0.55; S.g.stroke(); S.g.restore();
    });
    oc(S, poly([[-13, 22], [-8, 32], [8, 32], [13, 22], [0, 26]]), tk.mix(p.base, p.dark, 0.5), { depth: 2.4, shadow: p.dark, hi: false, tension: 0.4 });
    S.cel(circ(0, 12, 8.6), '#fff8f0', { line: S.L(2.2), shadow: '#cfc6e4', depth: 3.4, hi: false, rim: '#ffffff' });
    S.circle(-2.4, 9.6, 2.3, '#ffffff'); S.spark(14, 4, 4.4, { color: '#ffffff' });
  };
  RELICF.bamboo = (S, p) => {
    // three jointed stalks of different heights, leaves splayed from the nodes
    const stalk = (x, top, bot, w, lean) => {
      const sp = [[x - lean, bot], [x, (top + bot) / 2], [x + lean, top]];
      S.stroke(sp, w, p.base, { ow: 2, step: 3 });
      S.stroke([[x - lean - w * 0.2, bot - 3], [x + lean - w * 0.2, top + 4]], max(1.3, w * 0.22), p.glow, { ow: 0, alpha: 0.8 });
      for (let y = bot - 12; y > top + 4; y -= 17) { const xx = x + lean * (bot - y) / (bot - top) * 2 - lean; S.stroke([[xx - w * 0.62, y], [xx + w * 0.62, y]], 2.4, p.deep, { ow: 0.6 }); }
    };
    stalk(-17, -12, 36, 8, 1.5); stalk(1, -34, 38, 10, -1); stalk(19, -2, 36, 8, 2);
    const leaf = (x, y, a, l) => S.at(x, y, a, 1, 1, () => S.cel([[0, 0], [l * 0.3, -4.6], [l * 0.75, -3.4], [l, 0, 1], [l * 0.75, 3.4], [l * 0.3, 4.6]], '#4fd27a', { line: S.L(1.8), shadow: '#17794a', depth: 1.8, hi: false, tension: 0.7 }));
    leaf(2, -24, -0.9, 22); leaf(2, -24, -2.3, 20); leaf(-15, 0, -2.5, 18); leaf(-15, -4, -0.3, 17); leaf(20, 10, -0.8, 17);
    S.spark(-26, -26, 4.5, { color: '#d8ffe0' });
  };
  RELICF.plum = (S, p) => {
    // a plum blossom pendant: five round petals with a notch, gold stamens, a gold bail on a short chain
    S.stroke([[0, -43], [0, -36]], 2, N.gold, { ow: 0.7 });
    S.cel(circ(0, -34, 3.6), N.gold, { line: S.L(1.8), shadow: N.goldD, depth: 1.5, hi: false });
    for (let i = 0; i < 5; i++) {
      const a = -PI / 2 + i * TAU / 5;
      S.at(cos(a) * 14.5, 2 + sin(a) * 14.5, a + PI / 2, 1, 1, () => S.cel(circ(0, 0, 12.6), i % 2 ? tk.mix(p.base, '#ffffff', 0.35) : p.base, { line: S.L(2.4), shadow: p.shade, depth: 4, hi: false, rim: p.glow, rimW: S.L(1) }));
    }
    S.cel(circ(0, 2, 8), N.gold, { line: S.L(2.2), shadow: N.goldD, depth: 2.6, hi: false, rim: N.gold2 });
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + 0.3; S.stroke([[0, 2], [cos(a) * 11, 2 + sin(a) * 11]], 1.3, N.goldD, { ow: 0 }); S.circle(cos(a) * 11, 2 + sin(a) * 11, 1.6, N.gold2); }
    S.spark(22, -24, 4.4, { color: '#ffffff' });
  };
  RELICF.maple = (S, p) => {
    // a five-lobed maple leaf with a stem and a heart of veins, a second leaf drifting
    const L5 = [[0, -36, 1], [6, -22], [14, -26], [12, -12, 1], [26, -14], [20, -2], [32, 4, 1], [18, 12], [22, 22], [8, 18], [3, 30], [0, 36, 1], [-3, 30], [-8, 18], [-22, 22], [-18, 12], [-32, 4, 1], [-20, -2], [-26, -14], [-12, -12, 1], [-14, -26], [-6, -22]];
    S.at(0, -1, -0.08, 1, 1, () => {
      oc(S, L5, p.base, { depth: 7, shadow: p.shade, rim: p.glow, rimW: S.L(1.5), tension: 0.35, hi: S.d ? p.light : undefined });
      S.clip(poly(L5.map((q) => [q[0], q[1]])), () => { S.fill(poly([[-40, 40], [40, 40], [40, 14], [0, 8], [-40, 14]]), p.shade, 0.35); });
      [[0, 34, 0, -28], [0, 12, -22, -2], [0, 12, 22, -2], [0, -6, -12, -20], [0, -6, 12, -20]].forEach((q) => S.ink([[q[0], q[1]], [q[2], q[3]]], { w: 1.6, color: p.deep, alpha: 0.7, taper: 0.5, wobble: 0 }));
      S.stroke([[0, 34], [1, 42]], 3, N.woodD, { ow: 0.9, taperEnd: 0.2 });
    });
    S.spark(-24, -28, 4.4, { color: '#fff6d0' });
  };
  RELICF.shrine = (S, p) => {
    // a saisen-bako offering box: slatted lid, a wooden body with gold bands and a red tie, a coin dropping in
    oc(S, poly([[-32, -6], [-24, -20], [24, -20], [32, -6]]), N.woodL, { depth: 4, shadow: N.woodD, hi: false, tension: 0.2 });
    [-14, -4, 6, 16].forEach((x) => S.ink([[x * 0.9, -19.5], [x * 1.18, -6.5]], { w: 2.2, color: N.woodD, taper: 0, pressure: 'flat', wobble: 0 }));
    oc(S, rr(-32, -6, 64, 38, 3), N.wood, { depth: 6, shadow: N.woodD, tension: 0.3, rim: '#ffe0a8' });
    S.fill(rect(-32, 2, 64, 6), p.base); S.fill(rect(-32, 22, 64, 5), p.base);
    S.ink([[-32, 2], [32, 2]], { w: 1.5, taper: 0, pressure: 'flat', wobble: 0 }); S.ink([[-32, 8], [32, 8]], { w: 1.5, taper: 0, pressure: 'flat', wobble: 0 });
    S.cel(circ(0, 15, 7.4), N.gold, { line: S.L(2.2), shadow: N.goldD, depth: 2.6, hi: false, rim: N.gold2 });
    S.cel(rect(-2.6, 12.4, 5.2, 5.2), p.plate, { line: S.L(1.4), depth: 1, hi: false });
    [-30, 30].forEach((x) => S.cel(circ(x, 27, 2.6), N.gold, { line: S.L(1.6), depth: 1, hi: false, shadow: N.goldD }));
    S.at(21, -33, 0.3, 1, 0.6, () => S.cel(circ(0, 0, 8), N.gold, { line: S.L(2.2), shadow: N.goldD, depth: 2.4, hi: false, rim: N.gold2 }));
    S.spark(30, -40, 5, { color: '#ffffff' });
  };
  RELICF.bridge = (S, p) => {
    // a red taiko-bashi over water: a stone body with a dark arch opening, the curved deck, railing posts with gilt caps
    const arch = bez3([-40, 6], [-24, -30], [24, -30], [40, 6], 16);
    const body = arch.map((q) => [q[0], q[1] + 1]).concat([[40, 30], [-40, 30]]);
    S.cel(poly(body), '#8f8bb0', { line: S.L(2.4), depth: 4, shadow: '#4a4664', hi: false, tension: 0.3 });
    S.g.save(); S.g.beginPath(); S.g.ellipse(0, 30, 21, 21, 0, PI, TAU); S.g.closePath(); S.g.fillStyle = '#0c0820'; S.g.fill(); S.g.lineWidth = S.L(2.2); S.g.strokeStyle = INK; S.g.stroke(); S.g.restore();
    S.stroke(arch.map((q) => [q[0], q[1] + 1]), 9, p.base, { ow: 2.4, poly: true, step: 3 });
    S.stroke(arch.map((q) => [q[0], q[1] + 4]), 2.2, p.dark, { ow: 0, alpha: 0.8, poly: true, step: 3 });
    [0.1, 0.3, 0.5, 0.7, 0.9].forEach((u) => { const q = arch[Math.round(u * 16)]; S.stroke([[q[0], q[1] - 2], [q[0], q[1] - 13]], 3.8, N.red, { ow: 1.3 }); });
    S.stroke(arch.map((q) => [q[0], q[1] - 12]), 2.6, N.red, { ow: 1, poly: true, step: 3 });
    [0.1, 0.9].forEach((u) => { const q = arch[Math.round(u * 16)]; S.cel(circ(q[0], q[1] - 15, 3.2), N.gold, { line: S.L(1.6), shadow: N.goldD, depth: 1.2, hi: false }); });
    S.clip(rr(-39, -39, 78, 78, 15), () => S.fill(poly([[-44, 30], [44, 30], [44, 44], [-44, 44]]), tk.mix(p.dark, '#2a60a8', 0.6), 0.95));
    for (let i = 0; i < 2; i++) S.ink(bez3([-38, 34 + i * 4], [-26, 30 + i * 4], [-14, 38 + i * 4], [0, 34 + i * 4]).concat(bez3([0, 34 + i * 4], [14, 30 + i * 4], [26, 38 + i * 4], [38, 34 + i * 4])), { w: 1.9, color: '#bfe4ff', alpha: 0.85 - i * 0.25, taper: 0.3, wobble: 0 });
    S.spark(26, -28, 4.4, { color: '#fff6d0' });
  };
  RELICF.petal = (S, p) => {
    // a pressed sakura petal on a slip of washi: notched tip, veins, a second petal fallen beside
    S.at(-3, 0, -0.18, 1, 1, () => {
      oc(S, rr(-24, -34, 48, 68, 3), '#f6ead0', { depth: 5, shadow: '#cdb98e', tension: 0.25, rim: '#ffffff' });
      S.fill(rect(-24, -34, 48, 8), p.base, 0.9); S.ink([[-24, -26], [24, -26]], { w: 1.4, taper: 0, pressure: 'flat', wobble: 0 });
      const pet = [[0, 26], [-10, 14], [-16, -2], [-12, -16], [-4, -20], [0, -13, 1], [4, -20], [12, -16], [16, -2], [10, 14]];
      S.at(0, 5, 0, 1, 1, () => {
        oc(S, pet, p.base, { depth: 5.5, shadow: p.shade, rim: p.glow, rimW: S.L(1.3), tension: 0.85, hi: S.d ? p.light : undefined });
        [[0, 24, 0, -8], [0, 22, -8, -10], [0, 22, 8, -10]].forEach((q) => S.ink([[q[0], q[1]], [q[2], q[3]]], { w: 1.3, color: p.deep, alpha: 0.6, taper: 0.5, wobble: 0 }));
      });
    });
    S.at(27, 24, 0.9, 0.55, 0.55, () => S.cel([[0, 26], [-10, 14], [-16, -2], [-12, -16], [-4, -20], [0, -13, 1], [4, -20], [12, -16], [16, -2], [10, 14]], tk.mix(p.base, '#ffffff', 0.25), { line: S.L(2.8), shadow: p.shade, depth: 4, hi: false, tension: 0.85 }));
  };
  RELICF.flame = (S, p) => {
    // an ember charm: a fat three-tone flame on a charm ring and cord, sparks lifting off
    S.glow(0, 6, 40, '#ff9a2e', 0.5);
    oc(S, [[0, -38, 1], [9, -24], [22, -10], [24, 8], [16, 24], [0, 32], [-16, 24], [-24, 8], [-19, -6], [-10, -16], [-8, -28]], p.base, { depth: 8, shadow: p.dark, rim: '#ffd06a', rimW: S.L(1.5), tension: 0.8, hi: false });
    oc(S, [[0, -14, 1], [9, -2], [14, 12], [7, 25], [0, 28], [-8, 24], [-14, 12], [-8, -2]], '#ff9a2e', { depth: 5, shadow: '#d0451a', hi: false, tension: 0.8, line: S.L(2) });
    oc(S, [[0, 2, 1], [6, 12], [4, 22], [0, 24], [-5, 21], [-6, 12]], '#ffe27a', { depth: 3, shadow: '#f0a020', hi: false, tension: 0.8, line: S.L(1.8) });
    S.cel(circ(0, 14, 4.4), '#fff8d8', { line: false, depth: 1, hi: false });
    [[-24, -22, 2.6], [24, -26, 2.2], [19, -4, 1.8]].forEach((q) => { S.circle(q[0], q[1], q[2], '#ffd06a'); });
    S.g.save(); S.g.beginPath(); S.g.arc(0, 38, 5, 0, TAU); S.g.strokeStyle = INK; S.g.lineWidth = S.L(5.6); S.g.stroke(); S.g.strokeStyle = N.gold; S.g.lineWidth = S.T(2.4); S.g.stroke(); S.g.restore();
  };
  RELICF.snowflake = (S, p) => {
    // six arms, each with two side branches, and a hexagonal gem heart
    S.glow(0, 0, 40, p.glow, 0.35);
    for (let i = 0; i < 6; i++) {
      const a = -PI / 2 + i * PI / 3;
      S.at(0, 0, a + PI / 2, 1, 1, () => {
        S.stroke([[0, 0], [0, -35]], 6, '#eaf6ff', { ow: 2, taperEnd: 0.12 });
        S.stroke([[0, -14], [-10, -26]], 4, '#eaf6ff', { ow: 1.7 }); S.stroke([[0, -14], [10, -26]], 4, '#eaf6ff', { ow: 1.7 });
        S.stroke([[0, -26], [-7, -33]], 3.4, '#eaf6ff', { ow: 1.5 }); S.stroke([[0, -26], [7, -33]], 3.4, '#eaf6ff', { ow: 1.5 });
        S.stroke([[0, -4], [0, -33]], 1.8, p.base, { ow: 0, alpha: 0.9 });
      });
    }
    S.cel(poly(ngon(0, 0, 10, 6, -PI / 2)), p.base, { line: S.L(2.4), shadow: p.shade, depth: 3, hi: false, rim: '#ffffff' });
    S.circle(-2, -3, 2.2, '#ffffff', 0.9);
    S.spark(25, -26, 5, { color: '#ffffff' });
  };
  RELICF.bolt = (S, p) => {
    // a thunder wheel: a gold-studded ring in the colour of the palette, a fat bolt through the middle
    S.glow(0, 0, 44, p.glow, 0.45);
    S.cel(circ(0, 0, 33), p.base, { line: S.L(3), shadow: p.shade, depth: 7, rim: p.glow, rimW: S.L(1.6), hi: false });
    S.cel(circ(0, 0, 23.5), p.plate, { line: S.L(2.4), depth: 4, hi: false, shadow: tk.mix(p.plate, INK, 0.5) });
    for (let i = 0; i < 8; i++) { const a = i * PI / 4 + PI / 8; S.circle(cos(a) * 28.2, sin(a) * 28.2, 2.4, N.gold); }
    S.cel(poly([[11, -30], [-14, 3], [-2, 3], [-10, 31], [15, -4], [3, -4], [14, -30]]), '#fff2a0', { line: S.L(2.6), shadow: '#f3b830', depth: 5, rim: '#ffffff', hi: false });
    S.spark(-20, -22, 4.4, { color: '#fff6c0' });
  };
  RELICF.ink_drop = (S, p) => {
    // a stoppered vial of spare ink: a round glass flask, the ink inside shining cyan at the rim, a fat drop on its label
    S.cel(rr(-6, -36, 12, 10, 3), N.woodL, { line: S.L(2.2), shadow: N.woodD, depth: 2, hi: false, tension: 0.5 });
    S.cel(rr(-7.5, -28, 15, 11, 3), '#dcecff', { line: S.L(2.2), shadow: '#a9c4e8', depth: 2, hi: false, tension: 0.5 });
    S.cel(circ(0, 7, 27), '#dcecff', { line: S.L(3), shadow: '#a9c4e8', depth: 5, hi: false, rim: '#ffffff', rimW: S.L(1.4) });
    S.clip(circ(0, 7, 24.5), () => {
      S.fill(poly([[-30, -4], [-12, -7], [0, -3], [12, -7], [30, -4], [30, 40], [-30, 40]]), '#2a1470');
      S.fill(poly([[-30, 24], [30, 24], [30, 40], [-30, 40]]), '#1a0c52');
      S.ink(bez2([-24, -4], [-12, -9], [0, -3]).concat(bez2([0, -3], [12, -9], [24, -4])), { w: 2, color: pal.cyan, alpha: 0.85, taper: 0.3, wobble: 0 });
      // the echo ping inside the glass: a dot, a ring and a broken outer ring
      S.circle(0, 20, 3.4, pal.cyan);
      S.ring(0, 20, 8.5, 1.8, pal.cyan, 0.85);
      S.g.save(); S.g.lineCap = 'round'; S.g.strokeStyle = pal.cyan; S.g.lineWidth = S.T(1.6); S.g.globalAlpha *= 0.6;
      S.g.beginPath(); S.g.arc(0, 20, 15, -0.7, 0.7); S.g.stroke(); S.g.beginPath(); S.g.arc(0, 20, 15, PI - 0.7, PI + 0.7); S.g.stroke(); S.g.restore();
    });
    // the label: a small eighth note
    S.g.save(); S.g.beginPath(); S.g.ellipse(-2, 9, 4.4, 3.2, -0.35, 0, TAU); S.g.fillStyle = p.base; S.g.fill(); S.g.lineWidth = S.L(1.5); S.g.strokeStyle = INK; S.g.stroke(); S.g.restore();
    S.stroke([[1.6, 8], [1.6, -3], [6, 0]], 2, p.base, { ow: 1, poly: true, step: 2 });
    S.stroke([[-17, -6], [-21, 6], [-17, 18]], 4, '#ffffff', { ow: 0, alpha: 0.85, taperStart: 0.2, taperEnd: 0.4 });
    S.spark(20, -10, 4.4, { color: pal.cyan });
  };

  // the ten motifs the card illustrator already paints as large objects (lotus moon sun star dragon tiger crane fox skull eye): reused on the plate
  // so the whole game shares ONE drawing of each, with a chunky hand-drawn stand-in when ART.card.motif is missing
  const SHARED = ['lotus', 'moon', 'sun', 'star', 'dragon', 'tiger', 'crane', 'fox', 'skull', 'eye'];
  SHARED.forEach((m) => {
    RELICF[m] = (S, p) => {
      if (ART.card && typeof ART.card.motif === 'function' && ART.has('motif', m)) {
        const g = S.g;
        g.save();
        g.beginPath(); tk.trace(g, rr(-39, -39, 78, 78, 15), 0, 0, 0.72); g.clip();   // the card art overshoots a little: keep it inside the plate
        g.scale(100 / S.size, 100 / S.size);                // back to physical CSS px so the motif picks the right level of detail
        ART.card.motif(g, m, 0, 0, S.size * 0.74, p.name || 'gold', undefined);
        g.restore();
      } else {
        S.cel(circ(0, 0, 26), p.base, { line: S.L(3), shadow: p.shade, depth: 6, rim: p.glow, hi: false });
        S.spark(0, 0, 18, { color: '#ffffff' });
      }
    };
  });

  // relic spec: a relic id (def.art gives motif and palette) or a bare LISTS.relicIcons id (the palette of the first relic that uses it)
  let ICON_PAL = null;
  function iconPalette(motif) {
    if (!ICON_PAL) { ICON_PAL = {}; Object.keys(DATA.relics || {}).forEach((rid) => { const a = DATA.relics[rid].art; if (a && a.m && !ICON_PAL[a.m]) ICON_PAL[a.m] = a.c; }); }
    return ICON_PAL[motif] || 'gold';
  }
  function relicSpec(id, o) {
    const def = DATA.relics && DATA.relics[id];
    let motif, pname, rarity;
    if (def) { motif = def.art && def.art.m; pname = def.art && def.art.c; rarity = def.rarity; }
    else if (L.relicIcons.indexOf(id) >= 0) { motif = id; pname = iconPalette(id); rarity = 'common'; }
    else return null;
    if (!RELICF[motif]) motif = RELICF.seal ? 'seal' : 'lantern';
    const cHex = colorOpt(o && o.color);
    const pl = cHex ? objPal(pname, cHex) : objPal(pname || 'gold');
    const rare = rarity === 'rare' || rarity === 'boss' || rarity === 'shop';
    return {
      key: 'relic|' + motif + '|' + (pname || 'gold') + '|' + (rarity || 'common'), glow: pl.base,
      render(S, oo) { const pp = colorOpt(oo && oo.color) ? objPal(pname, colorOpt(oo.color)) : pl; relicPlate(S, pp, rarity); S.at(0, 1, 0, 1, 1, () => RELICF[motif](S, pp)); if (S.d >= 2) tk.paperGrain(S.g, -46, -46, 92, 92, { alpha: 0.12 }); },
      live: rare ? (ctx, x, y, size, t) => {
        // a slow glint crawling across the top-right corner of a rare plate
        const w = 0.5 + 0.5 * sin(t * 1.6 + (tk.seed('rg', motif) & 255) / 30);
        if (w > 0.4) tk.sparkle(ctx, x + size * 0.32, y - size * 0.32, max(1.6, size * 0.07 * w), { color: '#ffffff', alpha: w, glow: 0.35 });
      } : undefined,
    };
  }
  REG.relic = { ids: L.relicIcons.concat(Object.keys(DATA.relics || {}).filter((k) => L.relicIcons.indexOf(k) < 0)), resolve: relicSpec };
  ART.icon.palettes = (motif) => iconPalette(motif);
  // @@RELICS@@

  // ---------------------------------------------------------------------------------------------------------------
  // MOTIF: any LISTS.motifs id as a standalone round icon: the card illustrator's own drawing (ART.card.motif) on a lacquered wash disc
  // ---------------------------------------------------------------------------------------------------------------
  const MOTIF_PAL = { slash: 'rose', cross_slash: 'crimson', thrust: 'amber', crescent: 'moon', iai: 'ink', petals: 'rose', bloom: 'rose', petal_storm: 'rose', wind: 'jade', shield: 'azure', barrier: 'indigo', talisman: 'moon', lotus: 'jade', moon: 'moon', sun: 'crimson', star: 'gold', lightning: 'gold', thunder_fist: 'amber', chain_lightning: 'azure', fire: 'crimson', flame_orb: 'amber', ice: 'azure', ink_splash: 'violet', ink_wave: 'indigo', brush_stroke: 'ink', calligraphy: 'gold', scroll: 'amber', eye: 'violet', mask: 'ink', fan: 'rose', bell: 'gold', lantern: 'amber', koi: 'teal', dragon: 'jade', tiger: 'amber', crane: 'azure', fox: 'crimson', web: 'ash', thorns: 'jade', poison_bloom: 'violet', skull: 'ash', heal_light: 'jade', spirit_orb: 'moon', torii: 'crimson', mirror: 'gold', sword_rain: 'azure', meteor: 'crimson', wave: 'teal', tornado: 'jade', quake: 'amber', fist: 'crimson', kick: 'amber', arrow: 'crimson', coin: 'gold', key: 'jade', book: 'teal', quill: 'moon', void: 'ink', sigil: 'violet' };
  function motifSpec(id, o) {
    if (L.motifs.indexOf(id) < 0) return null;
    const named = o && typeof o.color === 'string' && tk.fams[o.color] ? o.color : null;
    const pn = named || MOTIF_PAL[id] || 'ash', f = famOf(pn), t = tone(f.base);
    return {
      key: 'motif|' + id + '|' + pn, glow: f.base,
      render(S) {
        const g = S.g, disc = circ(0, 0, 44);
        S.cel(disc, f.dark, { line: S.L(3.4), depth: 9, shadow: tk.mix(f.dark, INK, 0.5), rim: f.light, rimW: S.L(1.6), hi: false, halftone: { d: 5.5, alpha: 0.3 } });
        S.clip(circ(0, 0, 41), () => {
          g.fillStyle = tk.lin(g, 0, -42, 0, 42, [[0, f.light], [0.55, f.base], [1, f.dark]]); g.fillRect(-45, -45, 90, 90);
          if (S.d) S.glow(0, -6, 38, t.glow, 0.28);
          if (ART.card && typeof ART.card.motif === 'function' && ART.has('motif', id)) {
            g.save(); g.scale(100 / S.size, 100 / S.size);
            ART.card.motif(g, id, 0, 1, S.size * 0.92, pn, undefined);
            g.restore();
          } else S.spark(0, 0, 20, { color: WHITE });
        });
        g.save(); g.beginPath(); g.arc(0, 0, 41.5, 0, TAU); g.strokeStyle = tk.rgba(N.gold, 0.9); g.lineWidth = S.T(1.8); g.stroke(); g.restore();
        S.ring(0, 0, 44, 3.2, INK, 0.0);
        if (S.d >= 2) tk.paperGrain(g, -44, -44, 88, 88, { alpha: 0.12 });
      },
    };
  }
  REG.motif = { ids: L.motifs.slice(), resolve: motifSpec };

  // ---------------------------------------------------------------------------------------------------------------
  // gallery: contact sheets. A cell shows the icon big, then the sizes the game really uses side by side.
  // ---------------------------------------------------------------------------------------------------------------
  // gallery params to opts: flags=dim,glow,on,pattern,done (comma list), n=12, color=azure or a hex
  function flagOpts(params) {
    const o = { t: num(params.t, 0) };
    String(params.flags || '').split(',').forEach((f) => { if (f) o[f] = true; });
    if (params.on === '0') o.on = false;
    if (params.n !== undefined) o.n = params.n;
    if (params.color) o.color = String(params.color).charAt(0) === 'x' ? '#' + String(params.color).slice(1) : params.color;
    return o;
  }
  function multi(g, kind, id, w, h, o) {
    o = o || {};
    const sizes = o.sizes || [48, 32, 24, 16];
    const big = min(o.big || 9999, h * 0.92, w * 0.52);
    ART.icon.draw(g, kind, id, big / 2 + 4, h / 2, big, o.opts || {});
    let x = big + 14;
    const rowY = h * 0.33;
    sizes.forEach((s, i) => { ART.icon.draw(g, kind, id, x + s / 2, i < 2 ? rowY : h * 0.72, s, o.opts || {}); x += s + 6; if (i === 1) x = big + 14; });
  }
  function iconSheet(name, kind, ids, o) {
    o = o || {};
    ART.sheet(name, (canvas, params) => {
      const list = typeof params.ids === 'string' ? params.ids.split(',') : (typeof ids === 'function' ? ids() : ids);
      const paper = params.bg === 'paper';
      ART.sheetGrid(canvas, params, list.map((id) => ({ label: id, id })), (g, cell, w, h) => {
        multi(g, kind, cell.id, w, h, { big: num(params.size, 0) || o.big, sizes: o.sizes, opts: o.opts ? o.opts(cell.id, params) : flagOpts(params) });
      }, { title: o.title || name, cols: params.cols || o.cols, aspect: o.aspect || 1.5, pad: 8, gap: 6, labelH: 16, bg: paper ? 'paper' : 'night' });
    });
  }
  iconSheet('icons_status', 'status', () => REG.status.ids, { title: 'ART.icon status: 8 buffs (warm and blue), 4 resources (hero colours, gold rim), 8 debuffs (red-violet)', cols: 5, big: 150 });

  iconSheet('icons_motifs', 'motif', () => REG.motif.ids, { title: 'ART.icon motif: every LISTS.motifs id as a round standalone icon (ART.card.motif on a wash disc)', cols: 10, big: 110, aspect: 1.2 });

  // icons_relics: the LISTS.relicIcons motifs (default palettes) and, below them, every relic of DATA.relics with its real palette and rarity rim.
  // params: part=0 (motifs only) or part=1 (relics only), size (big icon edge), bg=paper, cols, ids=a,b, t
  ART.sheet('icons_relics', (canvas, params) => {
    const g = canvas.getContext('2d');
    const W = num(params.w, 1600), H = num(params.h, 900);
    const only = typeof params.ids === 'string' ? params.ids.split(',') : null;
    const motifs = L.relicIcons.filter((id) => !only || only.indexOf(id) >= 0).map((id) => ({ label: id, id }));
    const relics = Object.keys(DATA.relics || {}).filter((id) => !only || only.indexOf(id) >= 0).map((id) => ({ label: id, id }));
    const part = params.part === undefined ? -1 : num(params.part, 0);
    const parts = part < 0 ? [[motifs, 'the ' + L.relicIcons.length + ' LISTS.relicIcons motifs (default palettes)'], [relics, 'every DATA.relics id with its real palette and rarity rim (' + relics.length + ')']] : [part === 1 ? [relics, 'every DATA.relics id with its real palette (' + relics.length + ')'] : [motifs, 'the ' + motifs.length + ' LISTS.relicIcons motifs (default palettes)']];
    const paper = params.bg === 'paper';
    let y0 = 0;
    parts.forEach((pt, k) => {
      const h = H * (parts.length === 1 ? 1 : (k === 0 ? 0.47 : 0.53));
      const cells = pt[0], cols = num(params.cols, 0) || (parts.length === 1 ? 10 : (k === 0 ? 15 : 17));
      g.save(); g.translate(0, y0);
      ART.sheetGrid({ getContext: () => g }, { w: W, h }, cells, (gg, cell, w, hh) => {
        const big = min(num(params.size, 0) || 9999, hh * 0.9, w * 0.64);
        ART.icon.draw(gg, 'relic', cell.id, big / 2 + 3, hh / 2, big, flagOpts(params));
        let x = big + 10;
        [[32, hh * 0.3], [24, hh * 0.72]].forEach((q) => { if (x + q[0] < w) ART.icon.draw(gg, 'relic', cell.id, x + q[0] / 2, q[1], q[0], flagOpts(params)); });
      }, { title: 'ART.icon relic: ' + pt[1], cols, aspect: 1.25, pad: 6, gap: 4, labelH: 14, bg: paper ? 'paper' : 'night' });
      g.restore();
      y0 += h;
    });
  });

  // icons_tiles: every map tile stamp, fresh and done (params: size, bg=paper, cols)
  ART.sheet('icons_tiles', (canvas, params) => {
    const cells = [];
    ART.icon.ids('tile').forEach((id) => { cells.push({ label: id, id, done: false }); cells.push({ label: id + ' (done)', id, done: true }); });
    const paper = params.bg !== 'dark';
    ART.sheetGrid(canvas, params, cells, (g, cell, w, h) => {
      multi(g, 'tile', cell.id, w, h, { big: num(params.size, 0) || 120, sizes: [52, 40, 30, 20], opts: Object.assign(flagOpts(params), { done: cell.done }) });
    }, { title: 'ART.icon tiles: hanko stamps with black-ink drawings (opts.done fades them into the page)', cols: params.cols || 7, aspect: 1.3, pad: 8, gap: 6, labelH: 16, bg: paper ? 'paper' : 'night' });
  });

  // icons_gems: every gem and every empty socket at four sizes (params: size, bg=paper, gray=1 draws in greyscale to prove the glyphs carry the colour,
  // pattern=1 the colour-blind glyph size, cols)
  ART.sheet('icons_gems', (canvas, params) => {
    const only = typeof params.ids === 'string' ? params.ids.split(',') : null;
    const cells = ART.icon.ids('gem').filter((id) => !only || only.indexOf(id) >= 0).map((id) => ({ label: id, id }));
    const paper = params.bg === 'paper';
    ART.sheetGrid(canvas, params, cells, (g, cell, w, h) => {
      if (params.gray) g.filter = 'grayscale(1)';
      multi(g, 'gem', cell.id, w, h, { big: num(params.size, 0) || 110, sizes: [46, 32, 24, 16], opts: Object.assign(flagOpts(params), params.pattern ? { pattern: true } : {}) });
      if (params.gray) g.filter = 'none';
    }, { title: 'ART.icon gems: 5 cuts x 4 colours x 3 tiers, and empty sockets (sword red, shield blue, leaf green, star gold, ring prism)', cols: params.cols || 8, aspect: 1.35, pad: 8, gap: 6, labelH: 16, bg: paper ? 'paper' : 'night' });
  });

  // icons_ui: intents, stats, brushes, card types and rows on one sheet (params: cols, size, bg=paper, kinds=intent,stat)
  ART.sheet('icons_ui', (canvas, params) => {
    const kinds = typeof params.kinds === 'string' ? params.kinds.split(',') : ['intent', 'stat', 'brush', 'type', 'row'];
    const cells = [];
    kinds.forEach((k) => ART.icon.ids(k).forEach((id) => cells.push({ label: k + ' ' + id, kind: k, id, n: k === 'intent' && /attack|multi|heavy/.test(id) ? 12 : undefined })));
    const paper = params.bg === 'paper';
    ART.sheetGrid(canvas, params, cells, (g, cell, w, h) => {
      multi(g, cell.kind, cell.id, w, h, { big: num(params.size, 0) || 120, sizes: [40, 32, 24, 16], opts: Object.assign(flagOpts(params), cell.n !== undefined && params.n === undefined ? { n: cell.n } : {}) });
    }, { title: 'ART.icon intents (sumi-e), stats, songs (mini hex grids), card types, rows', cols: params.cols || 7, aspect: 1.35, pad: 8, gap: 6, labelH: 16, bg: paper ? 'paper' : 'night' });
  });

  // the pixel-true view: every icon at the sizes the game really draws it (ART.res 1), magnified with nearest-neighbour so a blurry line or a lost detail
  // is obvious. params: kind (default status) ids=a,b sizes=16,24,32 zoom=4 res=1 bg=paper
  ART.sheet('icons_zoom', (canvas, params) => {
    const kind = typeof params.kind === 'string' ? params.kind : 'status';
    const list = typeof params.ids === 'string' ? params.ids.split(',') : ART.icon.ids(kind);
    const sizes = String(params.sizes || '16,24,32').split(',').map(Number).filter((n) => n > 0);
    const zoom = num(params.zoom, 4), res = num(params.res, 1);
    const paper = params.bg === 'paper';
    ART.sheetGrid(canvas, params, list.map((id) => ({ label: id, id })), (g, cell, w, h) => {
      let x = 6;
      const prev = ART.res;
      sizes.forEach((s) => {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(s * res)); c.height = c.width;
        const cg = c.getContext('2d');
        cg.setTransform(res, 0, 0, res, 0, 0);
        ART.res = res;
        ART.icon.draw(cg, kind, cell.id, s / 2, s / 2, s, { t: 0 });
        ART.res = prev;
        g.imageSmoothingEnabled = false;
        const zz = min(zoom, floor((h - 8) / s), floor((w - 12 - sizes.length * 6) / sizes.reduce((a, b) => a + b, 0)));
        g.drawImage(c, x, 4, s * zz, s * zz);
        x += s * zz + 6;
      });
    }, { title: 'icons at true pixel sizes ' + sizes.join(', ') + ' (res ' + res + ', x' + zoom + ')', cols: params.cols || min(list.length, 6), aspect: 2.2, pad: 8, gap: 6, labelH: 16, bg: paper ? 'paper' : 'night' });
  });

  // ---------------------------------------------------------------------------------------------------------------
  // publish
  // ---------------------------------------------------------------------------------------------------------------
  ART.icon.draw = draw;
  ART.icon.kinds = L.iconKinds.slice();
  ART.icon.ids = (kind) => (REG[kind] ? REG[kind].ids.slice() : []);
  Object.keys(REG).forEach((k) => ART.declare(k, REG[k].ids));
  // @@APPEND@@
})();
