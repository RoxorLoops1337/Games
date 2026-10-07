// Hocus Vocus: ART.icon: the icon artist. Every small pictogram of the game, drawn in the chibi sticker style of the owners' cast: a chunky, even
// warm-brown outline, flat candy colours, ONE hard cel shadow, one thin highlight, a cream die-cut rim where an icon is a sticker, and the odd
// sparkle. Extends ART (art.js): REPLACES the ART.icon placeholder by plain assignment.
//
// PUBLIC API (DESIGN 5.6, ART_BIBLE 5)
//   ART.icon.draw(ctx, kind, id, x, y, size, opts)
//        (x, y) is the CENTRE, size the edge of the box in px. Never throws, for any kind or id (an unknown id draws a sealed "?" token).
//        kind / id:  status  a DATA.statuses id                    relic  a relic id (art.m + art.c come from DATA.relics) OR any LISTS.relicIcons id
//                    gem     a DATA.gems id, or 'slot:red|blue|green|gold|any' (an empty socket)              tile   a LISTS.tiles id
//                    intent  a LISTS.intents id                    stat   a LISTS.statIcons id              brush  a DATA.brushes id (a Spell)
//                    type    a card type                           row    'front' | 'back'                  motif  a LISTS.motifs id
//        opts (all optional)
//                    n      a number (or short string) painted in heavy comic lettering at the lower right: the intent's damage, a stack count.
//                           For status icons n = 0 draws nothing (SCENE passes {n: 0}).
//                    t      seconds (drives the live parts only: the tier 3 gem's orbiting sparkle, glow pulses, a rare Charm's glint). The body is a
//                           cached sprite, so animation costs one drawImage plus a few sparkles. ART.tk.opt.reduceMotion slows it to 0.3x (ART.tk.motion()).
//                    dim    greyed and darkened (locked, unaffordable, spent)              glow   true | 0..1: an additive halo behind the icon
//                    on     lit / filled (stat icons: a full Vox orb, Breath orb or heart, false draws the empty outline; a socket: glowing rim)
//                    done   tiles: the sticker fades into the ground (a resolved tile)     color  hex or a LISTS.palettes name: recolours the icon
//                                                                                          (status disc, Charm palette, tile sticker, intent, stat, Spell cells, type/row glyph, motif)
//                    pattern  true: statuses draw a pattern on the disc (buff stripes, debuff hatch, resource dots) and gems draw their glyph at
//                           1.4x. Also switched on by ART.tk.opt.colorblind (UI may set it; DESIGN 5.8 says colorblind adds patterns and bigger glyphs).
//        The body of every icon is one cached sprite per (kind, id, size, flags) through ART.sprite. The drawing box is the size x size square
//        (glows and sparkles may overshoot it: DOM callers that clip to their canvas simply lose the halo, never the icon).
//   Extras beyond DESIGN
//   ART.icon.ids(kind) -> [ids]           every id of a kind this file draws (relic: the 58 icons plus every DATA.relics id)
//   ART.icon.kinds -> the ten kinds       ART.icon.glyphOf(color) -> 'sword' | 'shield' | 'leaf' | 'star' | 'ring'  (red blue green gold any;
//                                         the id 'sword' is now drawn as an eighth note: pink, a sung hit)
//   ART.icon.glyph(ctx, name, x, y, size, opts)   just the engraved gem glyph (opts.color, opts.engrave)
//   ART.icon.palettes(id) -> the palette name a relic icon id uses when no relic def says otherwise
//   Gallery sheets: icons_status icons_relics icons_gems icons_tiles icons_ui, plus icons_motifs and icons_zoom (true pixel sizes, magnified)
//        params: size=N big size, bg=paper, part=0|1 (relic motifs | real Charms), ids=a,b, cols=N, flags=dim,glow,on,pattern,done, n=12, color=name or xRRGGBB, t=s
//
// LEVELS OF DETAIL. Every icon is authored in a 100 x 100 design box centred on (0, 0) (y down, key light from the upper right, so shadows fall to
// the lower left) and its detail follows the PHYSICAL pixel size (size * ART.res): d0 under 40 px (chunky, one idea per icon, outlines never under
// 1.3 px), d1 up to 76 px (secondary marks, highlights), d2 above (extra glints and stitches). UI draws statuses at 22..48, Charms at 20..84,
// gems at 16..118, card type glyphs at 14..28: all of those must read. Reduce motion and low quality only remove calls, never add them.
//
// DETERMINISM. Nothing here reads a clock or the banned random call. Variation is seeded from the icon id; animation reads the t you pass.
(() => {
  'use strict';
  const tk = ART.tk, pal = tk.pal;
  const L = DATA.LISTS;
  const TAU = Math.PI * 2, PI = Math.PI;
  const clamp = tk.clamp, lerp = tk.lerp, num = tk.num;
  const sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max, floor = Math.floor, round = Math.round, atan2 = Math.atan2, sqrt = Math.sqrt;
  const INK = '#2d170f';                                     // the cast's warm near-black brown line: never pure black, never indigo
  const CREAM = '#fff8ec', WHITE = '#fffaf1', GOLD = '#ffd84d', GOLD2 = '#fff1a8', PAPER = pal.paper;
  const cA = (a) => (a >= 0 ? (a <= 1 ? a : 1) : 0);
  const isHex = (c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
  const REG = {};                                            // kind -> {ids, resolve(id, opts) -> spec | null}

  // ---------------------------------------------------------------------------------------------------------------
  // colour: the warm cel shadow, derived tones of a base hex (memoised), palette names, and the shared neutrals
  // ---------------------------------------------------------------------------------------------------------------
  const HSL = new Map();
  function toHsl(hex) {
    let v = HSL.get(hex);
    if (v) return v;
    const c = U.color.rgb(hex), r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    const mx = max(r, g, b), mn = min(r, g, b), l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    v = [h, s, l];
    if (HSL.size > 800) HSL.clear();
    HSL.set(hex, v);
    return v;
  }
  // the warm cel shadow of the cast kit: a little darker, a little more saturated, the hue nudged toward red
  const wshade = (hex, dl) => { const v = toHsl(hex); return U.color.hsl(v[0] - 5, clamp(v[1] * 1.06, 0, 1), clamp(v[2] - (dl === undefined ? 0.13 : dl), 0, 1)); };
  const TONES = new Map();
  function tone(base) {
    let t = TONES.get(base);
    if (!t) {
      t = { base, shade: wshade(base), light: tk.tint(base, 0.42), pale: tk.tint(base, 0.72), deep: wshade(base, 0.32), glow: tk.tint(base, 0.55), mid: tk.mix(base, INK, 0.3), dark: wshade(base, 0.26) };
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
    cream: CREAM, creamD: '#f1d9d2', white: WHITE, whiteD: '#e6d6ea', gold: GOLD, gold2: GOLD2, goldD: '#e0a21e', goldM: '#f5be32',
    pink: '#ff7eb6', pinkD: '#d44a86', pinkL: '#ffc2dc', green: '#3fcf6a', greenD: '#238a45', greenL: '#b9f0c4', teal: '#2ec4b6', tealD: '#1b8279',
    steel: '#e8eef9', steelM: '#b8c4de', steelD: '#8a96c0', chrome: '#c9cbd6', chromeD: '#8d90a8', black: '#34294a', blackD: '#1f1830', blackL: '#5a5078',
    wood: '#c98a52', woodD: '#8a5530', woodL: '#e8b27a', paper: PAPER, paperD: '#cdb98e', ink: INK, inkL: '#6b3a28',
    red: '#ff5a5a', redD: '#b8283c', orange: '#ff9a2e', orangeD: '#d4631a', skin: '#fdd3b6', skinD: '#f2a98a',
    blue: '#5fb4ff', blueD: '#2f6fd0', violet: '#a77bff', violetD: '#6a45c4', lime: '#c6ff3d', limeD: '#7fb81c', cyan: '#5ff5ff', jade: pal.jade, azure: pal.azure,
  };
  const SKY = 'rgba(20,10,40,0.34)';                        // the soft sticker drop shadow

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
  // a quadratic and a cubic bezier sampled into points
  function bez2(p0, c, p1, n) { const o = []; n = n || 8; for (let i = 0; i <= n; i++) { const u = i / n, v = 1 - u; o.push([v * v * p0[0] + 2 * v * u * c[0] + u * u * p1[0], v * v * p0[1] + 2 * v * u * c[1] + u * u * p1[1]]); } return o; }
  function bez3(p0, c1, c2, p1, n) { const o = []; n = n || 10; for (let i = 0; i <= n; i++) { const u = i / n, v = 1 - u; o.push([v * v * v * p0[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * p1[0], v * v * v * p0[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * p1[1]]); } return o; }
  const xf = tk.xf;
  // a five-point star (rounded tips read as sticker stars) and a true heart (two lobes, a deep cleft, a pointed tip) as unit shapes
  const star5 = (cx, cy, R, rot) => starPts(cx, cy, R, R * 0.5, 5, rot === undefined ? -PI / 2 : rot);
  const HEART = (() => {
    const half = bez3([0, 0.98], [-0.42, 0.62], [-1.08, 0.3], [-1.06, -0.3], 10).concat(bez3([-1.06, -0.3], [-1.06, -0.86], [-0.42, -1.04], [-0.2, -0.78], 8), bez3([-0.2, -0.78], [-0.1, -0.68], [-0.04, -0.56], [0, -0.42], 4));
    return half.concat(half.slice(1, -1).reverse().map((p) => [-p[0], p[1]]));
  })();
  const DROP = [[0, -1, 1], [0.3, -0.55], [0.72, 0.0], [0.8, 0.48], [0.46, 0.9], [0, 1], [-0.46, 0.9], [-0.8, 0.48], [-0.72, 0.0], [-0.3, -0.55]];
  const unit = (pts, cx, cy, sx, sy) => pts.map((p) => (p[2] ? [cx + p[0] * sx, cy + p[1] * (sy === undefined ? sx : sy), 1] : [cx + p[0] * sx, cy + p[1] * (sy === undefined ? sx : sy)]));
  const heart = (cx, cy, s) => poly(unit(HEART, cx, cy, s, s * 0.95));

  // ---------------------------------------------------------------------------------------------------------------
  // S: the painter handed to every icon. Design space is 100 x 100 centred on (0, 0). Outline widths never fall under a readable pixel width.
  // ---------------------------------------------------------------------------------------------------------------
  function makeS(g, size, o) {
    o = o || {};
    const res = ART.res > 0 ? ART.res : 1;
    const kp = size * res / 100;                              // physical pixels per design unit
    const d = kp >= 0.76 ? 2 : kp >= 0.4 ? 1 : 0;
    const S = { g, size, kp, d, res, seed: o.seed | 0, id: o.id || '', opts: o.opts || {}, pattern: !!o.pattern, on: !!o.on };
    const minL = d === 0 ? 1.3 : d === 1 ? 1.15 : 1.05, minT = d === 0 ? 0.9 : d === 1 ? 0.8 : 0.7;
    S.L = (w) => max(w, minL / kp);                           // outlines
    S.T = (w) => max(w, minT / kp);                           // thin detail strokes
    S.rng = (salt) => tk.rng('ic', S.id, S.seed, salt === undefined ? '' : salt);
    S.pulse = (period, phase) => (S.opts.t !== undefined ? 0.5 + 0.5 * sin(TAU * (num(S.opts.t, 0) / (period || 2) + (phase || 0))) : 0.5);
    // cel fill with the house defaults: warm brown outline, ONE hard warm shadow, no halftone
    S.cel = (shape, base, oo) => {
      const o2 = Object.assign({ line: S.L(2.4), lineColor: INK, hi: false, seed: S.seed, wobble: 0.04, weightVar: 0.4, rimW: S.L(1.2), rimAlpha: 0.9 }, oo);
      if (o2.shadow === undefined) o2.shadow = wshade(base);
      if (o2.hi === true) o2.hi = tk.tint(base, 0.4);
      tk.celFill(g, shape, base, o2);
    };
    // a cream object (glyph on a coloured disc): cream with a warm pink shadow, or a shadow tinted by the disc tone
    S.pale = (shape, oo) => S.cel(shape, CREAM, Object.assign({ shadow: N.creamD, line: S.L(2.4) }, oo));
    S.line = (pts, oo) => tk.inkPath(g, pts, Object.assign({ color: INK, wobble: 0.04, seed: S.seed }, oo, { w: S.L((oo && oo.w) || 2.2) }));
    S.ink = (pts, oo) => tk.inkPath(g, pts, Object.assign({ color: INK, wobble: 0.04, seed: S.seed }, oo, { w: S.T((oo && oo.w) || 1.4) }));
    // an outlined stroke: an ink stroke underneath, the colour on top (flat pressure: a sausage with round ends and an even line)
    S.stroke = (pts, w, color, oo) => {
      oo = oo || {};
      const ow0 = oo.ow === undefined ? 2 : oo.ow, ow = ow0 > 0 ? S.L(ow0) : 0, ts = oo.taperStart === undefined ? 0 : oo.taperStart, te = oo.taperEnd === undefined ? 0 : oo.taperEnd;
      const shape = oo.poly ? poly(pts) : pts;
      if (ow > 0) tk.inkPath(g, shape, { w: w + ow * 2, color: INK, taperStart: ts, taperEnd: te, pressure: 'flat', wobble: 0.02, seed: S.seed, step: oo.step || 4 });
      tk.inkPath(g, shape, { w, color, taperStart: ts, taperEnd: te, pressure: 'flat', wobble: 0.015, seed: S.seed + 1, step: oo.step || 4, alpha: oo.alpha });
    };
    S.fill = (shape, color, alpha) => {
      g.save(); if (alpha !== undefined) g.globalAlpha *= cA(alpha);
      g.beginPath(); tk.trace(g, shape); g.fillStyle = color; g.fill(); g.restore();
    };
    S.circle = (x, y, r, color, alpha) => { g.save(); if (alpha !== undefined) g.globalAlpha *= cA(alpha); g.beginPath(); g.arc(x, y, max(0.1, r), 0, TAU); g.fillStyle = color; g.fill(); g.restore(); };
    S.ring = (x, y, r, w, color, alpha) => { g.save(); if (alpha !== undefined) g.globalAlpha *= cA(alpha); g.beginPath(); g.arc(x, y, max(0.1, r), 0, TAU); g.strokeStyle = color; g.lineWidth = S.T(w); g.stroke(); g.restore(); };
    // an outlined dot: the little round things every sticker carries (eyes, rivets, bulbs, buttons)
    S.dot = (x, y, r, color, lw) => { g.save(); g.beginPath(); g.arc(x, y, max(0.1, r), 0, TAU); g.fillStyle = color; g.fill(); g.lineWidth = S.L(lw === undefined ? 1.8 : lw); g.strokeStyle = INK; g.stroke(); g.restore(); };
    S.glow = (x, y, r, color, a) => tk.glow(g, x, y, r, isHex(color) ? color : GOLD, a === undefined ? 0.5 : a);
    S.spark = (x, y, r, oo) => { if (d === 0 && r < 5) return; tk.sparkle(g, x, y, r, Object.assign({ color: CREAM, glow: d ? 0.4 : 0 }, oo)); };
    S.at = (x, y, a, sx, sy, fn) => { g.save(); g.translate(x, y); if (a) g.rotate(a); if (sx !== undefined) g.scale(sx, sy === undefined ? sx : sy); fn(); g.restore(); };
    S.clip = (shape, fn) => { g.save(); g.beginPath(); tk.trace(g, shape); g.clip(); fn(); g.restore(); };
    // the sticker edge: a soft drop shadow, then the shape grown by w and filled cream (a die-cut rim). Paint it BEFORE the object.
    S.die = (shape, w, noShadow) => {
      g.save(); g.lineJoin = 'round';
      if (!noShadow) { g.translate(-1.3, 2.6); g.beginPath(); tk.trace(g, shape); g.lineWidth = w * 2; g.strokeStyle = SKY; g.fillStyle = SKY; g.stroke(); g.fill(); g.translate(1.3, -2.6); }
      g.beginPath(); tk.trace(g, shape); g.lineWidth = w * 2; g.strokeStyle = CREAM; g.fillStyle = CREAM; g.stroke(); g.fill();
      g.restore();
    };
    // a small highlight: a white rounded dash with a tapered tail
    S.hl = (pts, w, alpha) => tk.inkPath(g, pts, { w: S.T(w || 2.4), color: '#ffffff', alpha: alpha === undefined ? 0.75 : alpha, taper: 0.45, wobble: 0, pressure: 'mid' });
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
  // an unknown id: a sealed warm-grey sticker with a "?" (never a coloured debug box: it must look like the game)
  function unknownSpec(kind, id) {
    return {
      key: 'unknown|' + kind,
      render(S) {
        S.die(circ(0, 0, 42), 4);
        S.cel(circ(0, 0, 42), N.chromeD, { line: S.L(3.2), depth: 8 });
        S.text('?', 0, 3, 56, { fill: N.cream });
      },
    };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // shared drawn objects: the mic, the wand, notes, arcs of sound
  // ---------------------------------------------------------------------------------------------------------------
  // an outlined round-capped arc (sound arcs, wave marks)
  function arcLine(S, x, y, r, a0, a1, w, color, ow) {
    const g = S.g;
    g.save(); g.lineCap = 'round';
    if (ow !== 0) { g.beginPath(); g.arc(x, y, r, a0, a1); g.strokeStyle = INK; g.lineWidth = S.L(w + (ow === undefined ? 3 : ow)); g.stroke(); }
    g.beginPath(); g.arc(x, y, r, a0, a1); g.strokeStyle = color; g.lineWidth = S.T(w); g.stroke();
    g.restore();
  }
  // n sound arcs fanned from (x, y) between two angles, nearest first
  function soundArcs(S, x, y, r0, n, a0, a1, color, w, gap) {
    for (let i = 0; i < n; i++) arcLine(S, x, y, r0 + i * (gap || 9), a0, a1, w || 4, color);
  }
  // a note head: a tilted filled ellipse with the house outline
  function noteHead(S, x, y, rx, ry, rot, color, outline) {
    const g = S.g;
    g.save(); g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); g.fillStyle = color; g.fill();
    if (outline) { g.lineWidth = S.L(outline); g.strokeStyle = INK; g.stroke(); }
    g.restore();
  }
  // a handheld mic drawn at (x, y) = the centre of its grille ball, pointing along `ang` (0 = up, the handle runs the other way). k scales it.
  // o: ball, handle, band (colours), len (handle length), r (ball radius), grid (a mesh pattern on the ball at d >= 1)
  function mic(S, x, y, ang, k, o) {
    o = o || {};
    S.at(x, y, ang || 0, k || 1, k || 1, () => {
      const r = o.r || 13, len = o.len || 34, ball = o.ball || N.chrome, handle = o.handle || N.black, band = o.band || N.pink;
      S.cel(poly([[-6.4, r * 0.55], [6.4, r * 0.55], [5, r + len], [-5, r + len]]), handle, { line: S.L(2.4), depth: 2.6, shadow: tk.mix(handle, '#000000', 0.3), tension: 0.3 });
      S.cel(circ(0, r + len, 5.4), handle, { line: S.L(2.2), depth: 1.8, shadow: tk.mix(handle, '#000000', 0.3) });
      S.stroke([[-6.4, r + 6], [6.4, r + 6]], 4.6, band, { ow: 1.2 });
      S.cel(circ(0, 0, r), ball, { line: S.L(2.6), depth: 4, shadow: tk.mix(ball, N.chromeD, 0.55) });
      if (S.d) {
        const gcol = tk.mix(ball, INK, 0.35);
        S.g.save(); S.g.beginPath(); S.g.arc(0, 0, r - 1, 0, TAU); S.g.clip();
        for (let i = -2; i <= 2; i++) { S.ink([[i * r * 0.46, -r], [i * r * 0.46, r]], { w: 1, color: gcol, alpha: 0.5, taper: 0, wobble: 0 }); S.ink([[-r, i * r * 0.46], [r, i * r * 0.46]], { w: 1, color: gcol, alpha: 0.5, taper: 0, wobble: 0 }); }
        S.g.restore();
        S.hl([[-r * 0.55, -r * 0.3], [-r * 0.3, -r * 0.62]], 2.6, 0.85);
      }
    });
  }
  // a wand lying along `ang` from its handle end (x, y), a gold star on its tip. len = stick length.
  function wand(S, x, y, ang, k, o) {
    o = o || {};
    S.at(x, y, ang || 0, k || 1, k || 1, () => {
      const len = o.len || 56;
      S.stroke([[0, 0], [0, -len]], 7, o.stick || N.cream, { ow: 2 });
      S.stroke([[0, -4], [0, -13]], 7.4, o.band || N.pink, { ow: 0 });
      S.stroke([[0, -len * 0.5], [0, -len * 0.5 - 7]], 7.4, o.band || N.pink, { ow: 0 });
      S.cel(poly(star5(0, -len - 8, o.star || 17)), o.starCol || GOLD, { line: S.L(2.6), depth: 4, shadow: N.goldD, tension: 0.2 });
    });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // STATUS: 20 sticker discs. Buffs warm or blue, resources in the hero colours with a gold medal ring, debuffs on the cooler discs with a
  // stitched inner ring. Every glyph is a cream or candy object with the warm outline, so the picture (never the colour) says what it is.
  // ---------------------------------------------------------------------------------------------------------------
  const STATUS_LOOK = {
    might: ['#ff7a3a', 'buff'], bulwark: ['#5fb4ff', 'buff'], regen: ['#7dffb0', 'buff'], thorns: ['#c6ff3d', 'buff'], dodge: ['#5ff5ff', 'buff'], taunt: ['#ffd84d', 'buff'],
    ritual: ['#c49bff', 'buff'], plating: ['#d9d4ff', 'buff'],
    bloom: ['#ff7eb6', 'resource'], sumi: ['#3fcf6a', 'resource'], ward: ['#a77bff', 'resource'], charge: ['#ff9a2e', 'resource'],
    vulnerable: ['#ff5a7a', 'debuff'], weak: ['#9a96b8', 'debuff'], frail: ['#c4a0ff', 'debuff'], poison: ['#7cf2c8', 'debuff'], burn: ['#ff8a3d', 'debuff'],
    stun: ['#ffd84d', 'debuff'], bind: ['#b9a6ff', 'debuff'], mark: ['#ffd84d', 'debuff'],
  };
  const GLYPH = {};                                          // status id -> fn(S, tone)

  function statusDisc(S, base, kind) {
    const f = tone(base), r = 43, g = S.g;
    S.die(circ(0, 0, r), S.d ? 4.6 : 3.4);
    S.cel(circ(0, 0, r), base, { line: S.L(3.2), depth: 8.5, shadow: f.shade });
    if (kind === 'resource') {
      // a medal: a gold ring inside the rim, the hero colour in the middle
      S.ring(0, 0, r - 4.6, 3.4, pal.gold);
    } else if (kind === 'debuff') {
      // stitched: a dashed darker ring, the look of something wrong with the sticker
      g.save(); g.setLineDash([S.T(5.4), S.T(4)]); g.lineCap = 'round'; g.beginPath(); g.arc(0, 0, r - 5.6, 0, TAU); g.strokeStyle = f.deep; g.lineWidth = S.T(2.2); g.globalAlpha *= 0.85; g.stroke(); g.restore();
    } else {
      S.ring(0, 0, r - 5.4, 1.8, f.pale, 0.7);
    }
    if (S.d) S.gloss(0, 0, r - 10, -PI * 0.42, -PI * 0.1, 3.2, 0.55);
  }
  function patternOn(S, kind, base) {
    if (!S.pattern) return;
    const g = S.g, f = tone(base);
    S.clip(circ(0, 0, 41), () => {
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
      },
    };
  }
  REG.status = { ids: Object.keys(STATUS_LOOK), resolve: (id) => statusSpec(id) };

  // a cream glyph piece shadowed with the disc's own tone, so the glyph belongs to its disc
  const cream = (S, f, shape, oo) => S.cel(shape, CREAM, Object.assign({ shadow: tk.mix(CREAM, f.base, 0.34), line: S.L(2.4) }, oo));

  // ---- the 20 pictograms (design box, glyph radius about 30)
  GLYPH.might = (S, f) => {
    // Volume: a knob turned to the top, three sound arcs
    const kx = -7, ky = 8;
    soundArcs(S, kx, ky, 27, S.d ? 3 : 2, -1.3, -0.12, CREAM, S.d ? 3.6 : 4.4, S.d ? 6.8 : 8.5);
    cream(S, f, circ(kx, ky, 19), { depth: 5, line: S.L(2.8) });
    if (S.d) for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + 0.2; S.ink([[kx + cos(a) * 15, ky + sin(a) * 15], [kx + cos(a) * 18, ky + sin(a) * 18]], { w: 1.6, color: INK, alpha: 0.5, taper: 0, wobble: 0 }); }
    S.stroke([[kx, ky], [kx + 2, ky - 14]], 5.6, N.orangeD, { ow: 1.6 });
    S.circle(kx, ky, 3, N.orangeD);
    S.hl([[kx - 11, ky - 4], [kx - 8, ky - 10]], 2.4, 0.9);
  };
  GLYPH.bulwark = (S, f) => {
    // Soundproof: a panel of acoustic foam wedges (rows of little pyramids, lit on the left, shaded on the right)
    const panel = rr(-28, -28, 56, 56, 7);
    S.cel(panel, tk.mix(f.base, INK, 0.5), { depth: 4, line: S.L(2.8), shadow: tk.mix(f.base, INK, 0.7), tension: 0.7 });
    const rows = S.d ? 3 : 2, cols = S.d ? 4 : 3, tw = 48 / cols, rh = 46 / rows;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const cx = -24 + (i + 0.5) * tw, yT = -23 + j * rh + 1, yB = yT + rh - 2;
      S.fill(poly([[cx, yT], [cx - tw / 2 + 0.6, yB], [cx, yB]]), f.pale);
      S.fill(poly([[cx, yT], [cx, yB], [cx + tw / 2 - 0.6, yB]]), f.base);
      S.ink([[cx - tw / 2 + 0.6, yB], [cx, yT], [cx + tw / 2 - 0.6, yB]], { w: 1.8, color: INK, alpha: 0.85, taper: 0, pressure: 'flat', wobble: 0 });
    }
  };
  GLYPH.regen = (S, f) => {
    // Warm Tea: a mug, a heart in its steam
    S.stroke([[14, 6], [24, 6], [24, 20], [12, 22]], 6, CREAM, { ow: 2, poly: true, step: 3 });
    S.cel(poly([[-21, -2], [17, -2], [15, 24], [11, 31], [-15, 31], [-19, 24]]), CREAM, { shadow: tk.mix(CREAM, f.base, 0.34), line: S.L(2.6), depth: 5, tension: 0.4 });
    S.fill(ell(-2, -2, 19, 4.6, 0, 16), '#c98a52'); S.g.save(); S.g.beginPath(); S.g.ellipse(-2, -2, 19, 4.6, 0, 0, TAU); S.g.lineWidth = S.L(2.2); S.g.strokeStyle = INK; S.g.stroke(); S.g.restore();
    S.stroke([[-19, 12], [15, 12]], 4, N.pink, { ow: 0 });
    S.cel(heart(-2, -22, 9.5), N.pink, { line: S.L(2.2), depth: 2.4, shadow: N.pinkD });
    if (S.d) { S.stroke([[-12, -9], [-16, -15], [-11, -20]], 3, CREAM, { ow: 0, alpha: 0.9 }); S.stroke([[8, -9], [12, -15], [9, -22]], 3, CREAM, { ow: 0, alpha: 0.9 }); }
  };
  GLYPH.thorns = (S, f) => {
    // Feedback: a mic and the squeal lines
    mic(S, -8, 6, -0.62, 0.95, { ball: N.chrome, handle: N.black, band: N.pink, r: 13, len: 30 });
    const zig = (pts) => S.stroke(pts, 4.2, N.cream, { ow: 1.7, poly: true, step: 3 });
    zig([[8, -26], [14, -20], [10, -15], [18, -9]]);
    zig([[18, -28], [26, -20], [21, -15], [30, -8]]);
    if (S.d) zig([[2, -32], [4, -26], [0, -22]]);
  };
  GLYPH.dodge = (S, f) => {
    // Shimmy: a small figure mid-shimmy, a motion arc each side
    arcLine(S, 0, 2, 31, PI - 0.6, PI + 0.55, 4, CREAM); arcLine(S, 0, 2, 31, -0.55, 0.6, 4, CREAM);
    if (S.d) { arcLine(S, 0, 2, 38, PI - 0.5, PI + 0.45, 3.2, CREAM); arcLine(S, 0, 2, 38, -0.45, 0.5, 3.2, CREAM); }
    S.at(0, 3, 0.2, 1, 1, () => {
      S.stroke([[-5, 15], [-6, 28]], 5, N.skin, { ow: 1.6 }); S.stroke([[5, 15], [7, 28]], 5, N.skin, { ow: 1.6 });
      S.cel(poly([[-7, -6], [7, -6], [15, 16], [-15, 16]]), N.pink, { line: S.L(2.4), depth: 4, shadow: N.pinkD, tension: 0.2 });
      S.cel(circ(0, -15, 9.5), N.skin, { line: S.L(2.4), depth: 3, shadow: N.skinD });
      S.cel([[-9.6, -17], [-6, -26], [3, -27], [9.6, -19], [5, -19], [-2, -21]], '#7a4630', { line: S.L(2), depth: 2, shadow: '#4e2a1c', tension: 0.5 });
      if (S.d) { S.circle(3, -14, 1.4, INK); S.circle(-3, -14, 1.4, INK); }
    });
  };
  GLYPH.taunt = (S, f) => {
    // Spotlight: a cone from the top onto a dot
    S.cel(poly([[-7, -24], [7, -24], [27, 22], [-27, 22]]), CREAM, { shadow: tk.mix(CREAM, f.base, 0.3), line: S.L(2.4), depth: 6, tension: 0.2 });
    S.cel(ell(0, 23, 28, 7, 0, 18), N.cream, { line: S.L(2.2), depth: 2, shadow: tk.mix(CREAM, f.base, 0.45) });
    S.cel(rr(-13, -35, 26, 14, 4), N.blackL, { line: S.L(2.4), depth: 3, shadow: N.black, tension: 0.6 });
    S.stroke([[-8, -21], [8, -21]], 3.6, N.gold, { ow: 0 });
    S.cel(circ(0, 15, 7.5), N.red, { line: S.L(2.4), depth: 2.6, shadow: N.redD });
    if (S.d) S.hl([[-3, 12], [-1, 9]], 2, 0.9);
  };
  GLYPH.ritual = (S, f) => {
    // Crescendo: an opening hairpin over rising bars
    S.stroke([[27, -33], [-27, -22], [27, -11]], 5.6, CREAM, { ow: 1.8, poly: true, step: 3 });
    const hs = S.d ? [10, 17, 24, 31] : [12, 22, 31];
    const bw = S.d ? 9.4 : 12, gap = S.d ? 4.2 : 5, x0 = -((hs.length * bw + (hs.length - 1) * gap) / 2);
    hs.forEach((h, i) => S.cel(rr(x0 + i * (bw + gap), 33 - h, bw, h, 2.6), i === hs.length - 1 ? N.pink : CREAM, { line: S.L(2.2), depth: 2.6, shadow: i === hs.length - 1 ? N.pinkD : tk.mix(CREAM, f.base, 0.34), tension: 0.5 }));
  };
  GLYPH.plating = (S, f) => {
    // Sequins: a cluster of round sequins and a glint
    const sq = (x, y, r, col) => { S.cel(circ(x, y, r), col, { line: S.L(2.2), depth: r * 0.32, shadow: tk.mix(col, f.base, 0.4) }); if (S.d) { S.ring(x, y, r * 0.52, 1.4, tk.mix(col, INK, 0.3), 0.7); S.circle(x + r * 0.05, y, r * 0.17, INK, 0.6); } };
    sq(-12, 14, 12, CREAM); sq(12, 14, 12, '#e8d4ff');
    sq(-21, -2, 12, '#e8d4ff'); sq(1, -3, 12.5, CREAM); sq(22, -2, 11.5, '#ffd9ec');
    sq(-9, -19, 11.5, '#ffd9ec'); sq(12, -21, 11, CREAM);
    S.spark(23, -26, 8, { color: '#ffffff' });
  };
  GLYPH.bloom = (S, f) => {
    // Bloom: a five-petal cherry blossom with a notched tip
    const petal = (a) => S.at(0, 0, a, 1, 1, () => S.cel([[0, -2], [-12, -13], [-11, -28], [-4.5, -33], [0, -27, 1], [4.5, -33], [11, -28], [12, -13]], '#fff2f7', { line: S.L(2.4), depth: 4, shadow: '#ffbdd8', tension: 0.8 }));
    for (let i = 0; i < 5; i++) petal(i * TAU / 5);
    S.dot(0, 0, 6.4, GOLD, 2);
    if (S.d) for (let i = 0; i < 5; i++) { const a = i * TAU / 5 + 0.3; S.circle(cos(a) * 11, sin(a) * 11, 1.3, N.pinkD, 0.8); }
  };
  GLYPH.sumi = (S, f) => {
    // Groove: three stacked sound rings (layers of groove) with a beat dot on the top one
    const g = S.g, lay = (cy) => {
      g.save(); g.beginPath(); g.ellipse(0, cy, 29, 11.5, 0, 0, TAU); g.fillStyle = f.base; g.fill();
      g.lineWidth = S.L(4.6) + S.L(2) * 2; g.strokeStyle = INK; g.stroke();
      g.lineWidth = S.T(4.6); g.strokeStyle = CREAM; g.stroke(); g.restore();
    };
    lay(19); lay(1); lay(-17);
    S.cel(circ(0, -17, 6.4), N.pink, { line: S.L(2.4), depth: 2.2, shadow: N.pinkD });
  };
  GLYPH.ward = (S, f) => {
    // Reverb: a small room with rings bouncing inside
    const room = rr(-29, -26, 58, 52, 6);
    cream(S, f, room, { depth: 4, line: S.L(2.8), tension: 0.6 });
    S.clip(rr(-26, -23, 52, 46, 4), () => {
      arcLine(S, -9, 7, 10, 0, TAU, 3.2, f.base, 0); arcLine(S, -9, 7, 19, 0, TAU, 3, f.base, 0);
      if (S.d) arcLine(S, -9, 7, 28, 0, TAU, 2.6, f.base, 0);
    });
    S.stroke([[-9, 7], [15, -23], [26, 4]], 3.2, N.violetD, { ow: 0, poly: true, step: 3, alpha: 0.9 });
    S.dot(-9, 7, 4.2, N.pink, 1.8);
  };
  GLYPH.charge = (S, f) => {
    // Rumble: a low wave under a floor line, a few tremor ticks above it
    const wv = []; for (let i = 0; i <= 16; i++) { const x = -31 + i * 62 / 16; wv.push([x, 21 + sin(i / 16 * TAU * 2) * 9]); }
    S.stroke(wv, 7, CREAM, { ow: 2 });
    S.stroke([[-33, 4], [33, 4]], 6, N.orangeD, { ow: 1.8 });
    [[-21, -4, -28, -16], [0, -5, 0, -19], [21, -4, 28, -16]].forEach((l) => S.stroke([[l[0], l[1]], [l[2], l[3]]], 4.8, CREAM, { ow: 1.6 }));
    if (S.d) S.spark(24, -22, 5, { color: '#ffffff' });
  };
  GLYPH.vulnerable = (S, f) => {
    // Exposed: a target ring with a crack through it
    S.cel(circ(0, 0, 31), CREAM, { shadow: tk.mix(CREAM, f.base, 0.34), line: S.L(2.8), depth: 6 });
    S.cel(circ(0, 0, 20), N.red, { line: S.L(2.4), depth: 4, shadow: N.redD });
    S.cel(circ(0, 0, 9.5), CREAM, { line: S.L(2.2), depth: 2, shadow: N.creamD });
    S.stroke([[18, -32], [8, -14], [20, -4], [3, 8], [12, 20], [-6, 34]], 5.2, INK, { ow: 0, poly: true, step: 3 });
    S.stroke([[18, -32], [8, -14], [20, -4], [3, 8], [12, 20], [-6, 34]], 2, '#ffffff', { ow: 0, poly: true, step: 3, alpha: 0.9 });
  };
  GLYPH.weak = (S, f) => {
    // Muffled: a mic with a soft cushion pressed over its grille
    mic(S, -9, -8, -0.55, 1, { ball: N.chrome, handle: N.black, band: N.pink, r: 13, len: 34 });
    const pad = [[-16, -26], [4, -30], [20, -22], [24, -6], [14, 6], [-4, 8], [-20, 0], [-24, -14]];
    S.cel(pad, '#fff1f6', { line: S.L(2.6), depth: 5, shadow: '#f4bfd6', tension: 1 });
    S.stroke([[-8, -19], [8, -5]], 3, N.pinkD, { ow: 0 }); S.stroke([[8, -19], [-8, -5]], 3, N.pinkD, { ow: 0 });
    if (S.d) { S.circle(-14, -21, 1.6, N.pinkD); S.circle(18, -10, 1.6, N.pinkD); }
  };
  GLYPH.frail = (S, f) => {
    // Wobbly: a shield drawn in wobbly jelly lines
    const pts = [];
    const base = [[-24, -26], [0, -33], [24, -26], [25, -2], [16, 17], [0, 32], [-16, 17], [-25, -2]];
    for (let i = 0; i < base.length; i++) pts.push([base[i][0] + sin(i * 2.3) * 2.4, base[i][1] + cos(i * 1.7) * 2.4]);
    S.cel(pts, '#efe3ff', { shadow: tk.mix('#efe3ff', f.base, 0.4), line: S.L(3), depth: 6, tension: 1 });
    S.stroke([[0, -22], [3, -8], [-3, 6], [0, 20]], 3.4, f.deep, { ow: 0, alpha: 0.85 });
    S.stroke([[-15, -4], [-6, 1], [6, -3], [15, 2]], 3.4, f.deep, { ow: 0, alpha: 0.85 });
    arcLine(S, 0, 0, 38, PI - 0.4, PI + 0.4, 3, CREAM, 1.4); arcLine(S, 0, 0, 38, -0.4, 0.4, 3, CREAM, 1.4);
  };
  GLYPH.poison = (S, f) => {
    // Earworm: a note-worm curled round an ear
    S.cel([[-24, -6], [-22, -20], [-12, -28], [-1, -26], [4, -16], [0, -6], [-4, 4], [-4, 14], [-11, 21], [-20, 15], [-18, 9], [-14, 12]], N.skin, { line: S.L(2.6), depth: 4, shadow: N.skinD, tension: 0.9 });
    S.stroke([[-14, -14], [-10, -18], [-6, -12], [-9, -6]], 2.4, N.skinD, { ow: 0 });
    const worm = [[28, 22], [18, 28], [8, 22], [6, 10], [14, 0], [24, -10], [20, -22], [8, -26]];
    S.stroke(worm, 11, '#3fcf8a', { ow: 2.2 });
    S.stroke(worm.slice(1, 6), 4, '#9af5c0', { ow: 0, alpha: 0.9 });
    S.cel(circ(8, -26, 10), '#3fcf8a', { line: S.L(2.4), depth: 3, shadow: '#1f9a5c' });
    S.circle(5, -28, 2, INK); S.circle(12, -28, 2, INK);
    if (S.d) { S.circle(5.6, -28.6, 0.8, '#ffffff'); S.ink([[5, -22], [8.5, -20], [12, -22]], { w: 1.6, color: INK, taper: 0.2, wobble: 0 }); }
    S.stroke([[27, 21], [27, 5]], 3.6, INK, { ow: 0 });
    S.stroke([[27, 5], [34, 9]], 3.4, INK, { ow: 0 });
  };
  GLYPH.burn = (S, f) => {
    // Sizzle: a chilli with a flame on top
    S.at(3, 10, 0.3, 1, 1, () => {
      S.cel([[-14, -14], [8, -16], [20, -6], [17, 12], [4, 28], [-6, 34], [-6, 24], [-12, 8], [-18, -4]], '#e8383d', { line: S.L(2.8), depth: 5, shadow: '#a8182c', tension: 0.85 });
      S.stroke([[-8, -12], [1, -22]], 7, N.green, { ow: 2 });
      S.hl([[8, -8], [12, 2]], 2.8, 0.75);
    });
    S.cel([[-6, -42, 1], [4, -29], [11, -17], [6, -8], [-4, -4], [-14, -8], [-17, -19], [-10, -29]], '#ffb02a', { line: S.L(2.6), depth: 5, shadow: '#ee6a1c', tension: 0.9 });
    S.cel([[-5, -28, 1], [0, -20], [-1, -12], [-8, -14], [-9, -21]], '#fff1a8', { line: false, depth: 0, shadow: false, tension: 0.9 });
  };
  GLYPH.stun = (S, f) => {
    // Starstruck: three dizzy stars circling a dot
    S.g.save(); S.g.beginPath(); S.g.ellipse(0, 4, 28, 13, -0.15, 0, TAU); S.g.lineCap = 'round'; S.g.strokeStyle = INK; S.g.lineWidth = S.L(7.2); S.g.stroke(); S.g.strokeStyle = CREAM; S.g.lineWidth = S.T(3.4); S.g.stroke(); S.g.restore();
    S.cel(circ(0, 3, 7), N.pink, { line: S.L(2.4), depth: 2.4, shadow: N.pinkD });
    [[-25, 3, 0], [9, -9, 0.3], [21, 15, -0.2]].forEach((p, i) => S.cel(poly(star5(p[0], p[1], 12.5, -PI / 2 + p[2])), i === 1 ? '#fff1a8' : N.cream, { line: S.L(2.2), depth: 3, shadow: i === 1 ? N.goldM : N.creamD, tension: 0.2 }));
    if (S.d) S.spark(-9, -24, 5.5, { color: '#ffffff' });
  };
  GLYPH.bind = (S, f) => {
    // Tangled: a knot of cable with a plug end
    const a = [[-31, 20], [-14, 24], [4, 14], [8, -4], [-4, -20]];
    const b = [[-4, -20], [-20, -16], [-18, 2], [0, 10], [20, 4]];
    const c = [[8, -4], [20, -8], [29, 0]];
    S.stroke(a, 7.4, CREAM, { ow: 2 });
    S.stroke(b, 7.4, CREAM, { ow: 2 });
    S.stroke(c, 7.4, CREAM, { ow: 2 });
    S.stroke([[18, 4], [26, 0]], 7.4, CREAM, { ow: 2 });
    S.cel(rr(-36, 12, 11, 16, 2.5), N.blackL, { line: S.L(2.2), depth: 2.4, shadow: N.black, tension: 0.4 });
    S.stroke([[-37, 17], [-43, 17]], 3, N.chrome, { ow: 1.2 }); S.stroke([[-37, 24], [-43, 24]], 3, N.chrome, { ow: 1.2 });
    S.cel(rr(25, -10, 11, 16, 2.5), N.blackL, { line: S.L(2.2), depth: 2.4, shadow: N.black, tension: 0.4 });
    S.stroke([[36, -5], [41, -5]], 3, N.chrome, { ow: 1.2 }); S.stroke([[36, 2], [41, 2]], 3, N.chrome, { ow: 1.2 });
  };
  GLYPH.mark = (S, f) => {
    // Tag: a sticker tag with a star punched through it
    S.at(0, 1, -0.28, 1, 1, () => {
      const tag = [[-17, -26], [10, -26], [26, -10], [26, 28], [-17, 28]];
      S.cel(tag, CREAM, { shadow: tk.mix(CREAM, f.base, 0.34), line: S.L(2.8), depth: 5, tension: 0.25 });
      S.cel(poly(star5(2, 4, 14, -PI / 2)), f.base, { line: S.L(2.2), depth: 3, shadow: f.shade, tension: 0.2 });
      S.dot(-8, -17, 4, f.base, 2);
      S.stroke([[-8, -17], [-8, -34], [6, -37]], 2.6, INK, { ow: 0, poly: true, step: 3 });
    });
  };

  // ---------------------------------------------------------------------------------------------------------------
  // STAT: the gold coin, the Vox orb, the heart, the Breath orb, the mic-wand (Spell), the clapping hands (Cheers), the round shield
  // ---------------------------------------------------------------------------------------------------------------
  const STAT_LOOK = { gold: N.gold, ink: '#ff7eb6', hp: '#ff4d6a', energy: '#7fd6ff', brush: '#3fcf6a', inkstone: '#ffb347', block: '#5fb4ff' };
  const STATF = {};
  // the empty (off) look of a lit shape: the outline only, dashed, over a faint dark fill
  function emptyShape(S, shape, w) {
    const g = S.g;
    S.fill(shape, N.blackL, 0.34);
    g.save(); g.setLineDash([S.T(7), S.T(5)]); g.lineCap = 'round'; g.beginPath(); tk.trace(g, shape); g.strokeStyle = '#b4aed2'; g.lineWidth = S.L(w || 3); g.stroke(); g.restore();
  }
  STATF.gold = (S) => {
    // a gold coin with a star pressed in it
    S.die(circ(0, 0, 36), 4.4);
    S.cel(circ(0, 0, 36), GOLD, { line: S.L(3.2), depth: 8, shadow: N.goldD });
    S.g.save(); S.g.beginPath(); S.g.arc(0, 0, 28.5, 0, TAU); S.g.strokeStyle = N.goldD; S.g.lineWidth = S.T(2.6); S.g.stroke(); S.g.restore();
    S.cel(poly(star5(0, 2, 19, -PI / 2)), '#fff1a8', { line: S.L(2.4), depth: 3.4, shadow: N.goldM, tension: 0.2 });
    if (S.d) S.gloss(0, 0, 31, -PI * 0.46, -PI * 0.16, 3, 0.8);
    S.spark(24, -26, 7, { color: '#ffffff' });
  };
  STATF.ink = (S) => {
    // Vox: a round voice orb, pink to mint, with a white waveform across it
    const orb = circ(0, 0, 35), bars = [8, 15, 24, 31, 20, 27, 12, 6];
    if (S.on) {
      S.glow(0, 0, 48, '#ff7eb6', 0.4);
      S.die(orb, 4.4);
      S.cel(orb, '#ff7eb6', { line: S.L(3.2), depth: 7.5, shadow: N.pinkD });
      S.clip(circ(0, 0, 33.4), () => {
        S.fill(poly([[40, -40], [40, 40], [-6, 40], [8, 14], [-10, -10], [4, -40]]), '#7cf2c8');
      });
      S.g.save(); S.g.beginPath(); tk.trace(S.g, orb); S.g.lineWidth = S.L(3.2); S.g.strokeStyle = INK; S.g.stroke(); S.g.restore();
      bars.forEach((h, i) => { const x = -26 + i * 7.4; S.stroke([[x, -h * 0.55], [x, h * 0.55]], 4.2, '#ffffff', { ow: 1.2 }); });
      if (S.d) S.gloss(0, 0, 28, -PI * 0.5, -PI * 0.2, 3, 0.7);
      S.spark(24, -26, 6.5, { color: '#ffffff' });
    } else {
      emptyShape(S, orb, 3);
      S.g.save(); S.g.globalAlpha *= 0.5;
      bars.forEach((h, i) => { const x = -26 + i * 7.4; S.ink([[x, -h * 0.4], [x, h * 0.4]], { w: 3.4, color: '#b4aed2', taper: 0, pressure: 'flat', wobble: 0 }); });
      S.g.restore();
    }
  };
  STATF.hp = (S) => {
    const hs = heart(0, 2, 38);
    if (S.on) {
      S.glow(0, 0, 46, '#ff4d6a', 0.3);
      S.die(hs, 4.2);
      S.cel(hs, '#ff4d6a', { line: S.L(3.2), depth: 8, shadow: '#c2203f' });
      S.hl([[-24, -14], [-20, -22], [-12, -26]], 4.6, 0.85);
      S.spark(23, -22, 6, { color: '#ffffff' });
    } else emptyShape(S, hs, 3.2);
  };
  STATF.energy = (S) => {
    // Breath: a puff of breath curling in a sky-blue orb
    const lit = S.on, base = lit ? '#7fd6ff' : '#46557a', orb = circ(0, 0, 34);
    if (lit) S.glow(0, 0, 50, '#7fd6ff', 0.5);
    S.die(orb, 4.4);
    S.cel(orb, base, { line: S.L(3.2), depth: 8.5, shadow: lit ? '#3c9bd8' : '#2d3858' });
    S.g.save(); S.g.globalAlpha *= lit ? 1 : 0.4;
    // the puff: a curl of breath drawn as one fat spiral with a trailing wisp
    const sp = [];
    for (let i = 0; i <= 18; i++) { const u = i / 18, a = -PI * 0.3 + u * PI * 2.5, rad = 4 + u * 20; sp.push([cos(a) * rad - 1, sin(a) * rad * 0.92 + 1]); }
    S.stroke(sp, 7.4, '#ffffff', { ow: 1.8, taperStart: 0.5 });
    S.g.restore();
    if (lit) { S.gloss(0, 0, 28, -PI * 0.5, -PI * 0.2, 3, 0.7); S.spark(23, -25, 6, { color: '#ffffff' }); }
  };
  STATF.brush = (S) => {
    // Spell: a mic-wand with a star on top
    S.glow(0, 0, 42, '#3fcf6a', 0.16);
    mic(S, 8, -6, 0.62, 1.12, { ball: N.chrome, handle: '#f3ecff', band: N.pink, r: 15, len: 40 });
    S.cel(poly(star5(22, -28, 16, -PI / 2 + 0.25)), GOLD, { line: S.L(2.6), depth: 4, shadow: N.goldD, tension: 0.2 });
    S.spark(-26, -22, 6.5, { color: '#ffffff' }); S.spark(32, 8, 5, { color: GOLD2 });
  };
  STATF.inkstone = (S) => {
    // Cheers: two clapping hands, palms meeting at the top, with three spark lines
    const hand = (sx) => S.at(sx * 11, 12, -sx * 0.3, 1, 1, () => {
      // a cuff, a mitten palm, a thumb nub on the outer edge, the finger tips as a slight scallop
      S.cel(rr(-9, 16, 18, 16, 4), sx < 0 ? N.pink : N.green, { line: S.L(2.6), depth: 3, shadow: sx < 0 ? N.pinkD : N.greenD, tension: 0.5 });
      S.cel([[-10, 20], [-11, -10], [-9, -24], [-3, -29], [3, -29], [9, -24], [11, -10], [10, 20]], N.skin, { line: S.L(2.8), depth: 4.4, shadow: N.skinD, tension: 0.8 });
      S.cel(ell(sx * 11, 4, 5.4, 9, sx * 0.4, 14), N.skin, { line: S.L(2.4), depth: 2.2, shadow: N.skinD });
      if (S.d) { S.stroke([[-3.5, -26], [-3.5, -12]], 1.6, N.skinD, { ow: 0 }); S.stroke([[3.5, -26], [3.5, -12]], 1.6, N.skinD, { ow: 0 }); }
    });
    hand(-1); hand(1);
    [-0.78, 0, 0.78].forEach((u) => { const a = -PI / 2 + u * 0.75; S.stroke([[cos(a) * 29, -13 + sin(a) * 29], [cos(a) * 40, -13 + sin(a) * 40]], 4.6, GOLD, { ow: 1.6 }); });
    S.spark(0, -14, S.d ? 6 : 0, { color: '#ffffff', glow: 0 });
  };
  STATF.block = (S) => {
    // a round shield: a blue disc with a cream rim ring, four rivets and a gold boss in the middle
    S.die(circ(0, 0, 35), 4.4);
    S.cel(circ(0, 0, 35), '#5fb4ff', { line: S.L(3.2), depth: 8, shadow: '#2f6fd0' });
    S.ring(0, 0, 26.5, 4, N.cream);
    if (S.d) [0, 1, 2, 3].forEach((i) => { const a = PI / 4 + i * PI / 2; S.dot(cos(a) * 26.5, sin(a) * 26.5, 2.8, GOLD, 1.5); });
    S.cel(circ(0, 0, 12.5), GOLD, { line: S.L(2.6), depth: 3.4, shadow: N.goldD });
    S.hl([[-6, -4], [-3, -8]], 2.6, 0.9);
    if (S.d) S.gloss(0, 0, 31, -PI * 0.5, -PI * 0.18, 3, 0.75);
    S.spark(23, -25, 6, { color: '#ffffff' });
  };
  REG.stat = {
    ids: L.statIcons.slice(),
    resolve: (id) => (STATF[id] ? { key: 'stat|' + id, glow: STAT_LOOK[id], render: (S, o) => STATF[id](S, o) } : null),
  };

  // ---------------------------------------------------------------------------------------------------------------
  // TYPE: card type glyphs, read down to 14 px: bold silhouettes, thick line (crossed mics, a wand, a rising star, a frowny sticker, a Gloss smudge)
  // ---------------------------------------------------------------------------------------------------------------
  const TYPEF = {};
  TYPEF.attack = (S, c) => {
    // two crossed mics, one pink and one green (the duo)
    const a = c || N.pink, b = c ? tk.mix(c, '#ffffff', 0.3) : N.green;
    mic(S, -24, -25, -0.62, 1.1, { ball: N.chrome, handle: '#ede4ff', band: a, r: 14, len: 38 });
    mic(S, 24, -25, 0.62, 1.1, { ball: N.chrome, handle: '#ede4ff', band: b, r: 14, len: 38 });
  };
  TYPEF.skill = (S, c) => {
    // a magic wand with a star
    wand(S, -22, 38, 0.72, 1.18, { len: 62, star: 21, band: c || N.pink, starCol: c ? tk.mix(c, '#ffffff', 0.25) : GOLD });
    S.spark(-24, -22, 7, { color: GOLD }); S.spark(30, 20, 5.5, { color: GOLD2 });
  };
  TYPEF.power = (S, c) => {
    // a rising star with a trail
    const base = c || GOLD;
    S.stroke(bez3([-36, 34], [-22, 28], [-14, 12], [6, -10], 10), 12, tk.mix(base, '#ffffff', 0.5), { ow: 2.2, taperStart: 0.7, taperEnd: 0.05 });
    S.cel(poly(star5(16, -14, 32, -PI / 2 + 0.2)), base, { line: S.L(3), depth: 6, shadow: wshade(base, 0.2), tension: 0.2 });
    S.spark(-30, 6, 6, { color: base }); S.spark(33, 30, 5, { color: GOLD2 });
  };
  TYPEF.curse = (S, c) => {
    // a frowny sticker
    const base = c || '#a77bff';
    S.die(circ(0, 0, 40), 4.6);
    S.cel(circ(0, 0, 40), base, { line: S.L(3.2), depth: 8, shadow: wshade(base, 0.2) });
    S.cel(ell(-13, -8, 6.4, 8.8, 0, 12), CREAM, { line: S.L(2.2), depth: 2, shadow: N.creamD });
    S.cel(ell(13, -8, 6.4, 8.8, 0, 12), CREAM, { line: S.L(2.2), depth: 2, shadow: N.creamD });
    S.circle(-11.5, -6, 3.6, INK); S.circle(14.5, -6, 3.6, INK);
    S.stroke([[-20, -22], [-8, -17]], 3.6, INK, { ow: 0 }); S.stroke([[20, -22], [8, -17]], 3.6, INK, { ow: 0 });
    S.stroke([[-15, 24], [-6, 15], [6, 15], [15, 24]], 4.4, INK, { ow: 0 });
    if (S.d) S.hl([[-26, -22], [-18, -31]], 3.4, 0.7);
  };
  TYPEF.status = (S, c) => {
    // a pastel Gloss smudge: an airbrushed opal blob with a diagonal highlight sweep and the one small closed-mouth smile
    const g = S.g, base = c || '#e6d9ff';
    const blob = [[-38, 4], [-30, -20], [-6, -34], [20, -28], [38, -6], [32, 20], [8, 32], [-20, 28]];
    S.g.save();
    S.g.beginPath(); tk.trace(g, blob); g.fillStyle = tk.lin(g, -34, -30, 34, 30, [[0, '#ffe3f1'], [0.36, '#f4f1fb'], [0.62, base], [1, '#d9fff4']]); g.fill();
    g.lineWidth = S.L(2.8); g.strokeStyle = tk.mix('#b3a8d8', base, 0.45); g.stroke();
    g.restore();
    S.clip(blob, () => { S.fill(poly([[-40, 0], [-18, -40], [-2, -40], [-24, 4]]), '#ffffff', 0.55); S.fill(poly([[-14, 20], [10, -30], [16, -30], [-8, 22]]), '#ffffff', 0.25); });
    S.stroke([[-10, 8], [0, 13], [10, 8]], 3, '#9f93c9', { ow: 0 });
    S.spark(24, -20, 6, { color: '#ffffff' });
  };
  REG.type = {
    ids: L.cardTypes.slice(),
    resolve: (id, o) => (TYPEF[id] ? { key: 'type|' + id, glow: { attack: '#ff4d6a', skill: '#3fcf6a', power: GOLD, curse: '#a77bff', status: '#e6d9ff' }[id], render: (S) => TYPEF[id](S, colorOpt(o && o.color)) } : null),
  };

  // ---------------------------------------------------------------------------------------------------------------
  // ROW: front and back. Lead: a mic stand in front of a small speaker; Backing: a speaker in front of a small mic stand. The row you mean is lit.
  // ---------------------------------------------------------------------------------------------------------------
  function speaker(S, x, y, k, col) {
    S.at(x, y, 0, k, k, () => {
      S.cel(rr(-19, -26, 38, 52, 6), col, { line: S.L(2.8), depth: 5, shadow: tk.mix(col, '#000000', 0.3), tension: 0.5 });
      S.cel(circ(0, -10, 7.5), N.chromeD, { line: S.L(2.2), depth: 2, shadow: N.blackL });
      S.cel(circ(0, 9, 11.5), N.chrome, { line: S.L(2.4), depth: 3, shadow: N.chromeD });
      S.circle(0, 9, 4.4, N.blackL);
    });
  }
  function micStand(S, x, y, k, col) {
    S.at(x, y, 0, k, k, () => {
      S.stroke([[0, 30], [-14, 40]], 4.4, N.blackL, { ow: 1.4 }); S.stroke([[0, 30], [14, 40]], 4.4, N.blackL, { ow: 1.4 }); S.stroke([[0, 30], [0, 42]], 4.4, N.blackL, { ow: 1.4 });
      S.stroke([[0, 32], [0, -16]], 5.4, N.blackL, { ow: 1.8 });
      S.stroke([[0, -16], [8, -28]], 4, N.blackL, { ow: 1.6 });
      mic(S, 10, -34, 0.45, 0.82, { ball: N.chrome, handle: N.black, band: col, r: 13, len: 22 });
    });
  }
  const ROWF = {};
  ROWF.front = (S, c) => {
    const col = c || N.pink;
    S.g.save(); S.g.beginPath(); S.g.ellipse(-6, 40, 30, 7.5, 0, 0, TAU); S.g.fillStyle = tk.rgba(GOLD, 0.7); S.g.fill(); S.g.restore();
    speaker(S, 20, 6, 0.7, N.blackL);
    micStand(S, -14, 0, 0.96, col);
    if (S.d) { S.spark(-36, -30, 5.5, { color: GOLD }); S.spark(34, -32, 4.5, { color: GOLD2 }); }
  };
  ROWF.back = (S, c) => {
    const col = c || N.green;
    S.g.save(); S.g.beginPath(); S.g.ellipse(6, 40, 30, 7.5, 0, 0, TAU); S.g.fillStyle = tk.rgba(GOLD, 0.7); S.g.fill(); S.g.restore();
    micStand(S, 22, 2, 0.7, N.blackL);
    speaker(S, -10, 4, 0.98, col === N.green ? '#2fa25a' : col);
    if (S.d) { S.spark(34, -34, 5.5, { color: GOLD }); S.spark(-34, -32, 4.5, { color: GOLD2 }); }
  };
  REG.row = {
    ids: ['front', 'back'],
    resolve: (id, o) => (ROWF[id] ? { key: 'row|' + id, glow: id === 'front' ? '#ff7eb6' : '#3fcf6a', render: (S) => ROWF[id](S, colorOpt(o && o.color)) } : null),
  };

  // ---------------------------------------------------------------------------------------------------------------
  // `brush` (a Spell): a picture of the shape the Spell unmutes, on a mini pointy-top hex grid (the map's own geometry, DESIGN 4.8)
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
  // the badge in the top-left corner: strokes, arcs and ellipses only (never closePath, so the hexagon count stays the cell count).
  // boots and cats: a kick-drum circle with two beat ticks; vocal run: a rising wavy line with two dot heads; air horn: a horn cone with two arcs;
  // abracadabass: a wand star over a low wave; surround sound: six small arcs round a dot; hocus focus: a four-point sparkle round a dot
  function brushBadge(S, id) {
    const g = S.g, cx = -30, cy = -30;
    const line = (pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(cx + p[0], cy + p[1]) : g.moveTo(cx + p[0], cy + p[1]))); g.stroke(); };
    const dot = (x, y, r) => { g.beginPath(); g.arc(cx + x, cy + y, r, 0, TAU); g.fill(); };
    g.save();
    g.beginPath(); g.arc(cx, cy, 14, 0, TAU); g.fillStyle = tk.rgba('#2b2060', 0.96); g.fill();
    g.lineWidth = S.L(2.2); g.strokeStyle = CREAM; g.stroke();
    g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = GOLD; g.fillStyle = GOLD; g.lineWidth = S.T(2.2);
    if (id === 'stroke') { g.beginPath(); g.arc(cx - 1, cy + 1, 6.5, 0, TAU); g.stroke(); line([[7, -9], [11, -12]]); line([[9, -5], [13, -7]]); dot(-1, 1, 1.8); }
    else if (id === 'wave') { g.beginPath(); g.moveTo(cx - 9, cy + 6); g.quadraticCurveTo(cx - 5, cy - 2, cx - 1, cy + 3); g.quadraticCurveTo(cx + 3, cy + 8, cx + 8, cy - 5); g.stroke(); dot(-9, 6, 2); dot(8, -5, 2); }
    else if (id === 'fan') { g.beginPath(); g.moveTo(cx - 9, cy - 2); g.lineTo(cx - 2, cy - 2); g.lineTo(cx + 5, cy - 8); g.moveTo(cx - 9, cy + 3); g.lineTo(cx - 2, cy + 3); g.lineTo(cx + 5, cy + 9); g.moveTo(cx + 5, cy - 8); g.lineTo(cx + 5, cy + 9); g.stroke(); g.beginPath(); g.arc(cx + 5, cy, 5, -0.9, 0.9); g.stroke(); g.beginPath(); g.arc(cx + 5, cy, 9, -0.7, 0.7); g.stroke(); }
    else if (id === 'splash') { line([[-9, 8], [-4, 4], [0, 8], [5, 4], [9, 8]]); line([[0, -10], [0, -2]]); line([[-5, -6], [5, -6]]); line([[-3.5, -9], [3.5, -3]]); line([[3.5, -9], [-3.5, -3]]); }
    else if (id === 'halo') { for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(cx, cy, 9, i * PI / 3 - 0.3, i * PI / 3 + 0.3); g.stroke(); } dot(0, 0, 2.4); }
    else { line([[0, -10], [0, -5]]); line([[0, 10], [0, 5]]); line([[-10, 0], [-5, 0]]); line([[10, 0], [5, 0]]); dot(0, 0, 2.4); }
    g.restore();
  }
  function brushSpec(id, o) {
    const lay = brushLayout(id);
    if (!lay) return null;
    return {
      key: 'brush|' + id, glow: '#ff7eb6',
      render(S, oo) {
        const ink = colorOpt(oo && oo.color) || '#ff7eb6', f = tone(ink);
        // the sticker plaque the picture sits on: deep indigo with a cream rim
        S.die(rr(-44, -44, 88, 88, 14), 3.6);
        S.cel(rr(-44, -44, 88, 88, 14), '#2b2060', { line: S.L(3), depth: 6, shadow: '#1a1340', tension: 0.7 });
        const xy = lay.cells.map((c) => hexXY(c[0], c[1], lay.s));
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        xy.forEach((p) => { x0 = min(x0, p[0] - lay.s * 0.87); x1 = max(x1, p[0] + lay.s * 0.87); y0 = min(y0, p[1] - lay.s); y1 = max(y1, p[1] + lay.s); });
        const ox = -(x0 + x1) / 2, oy = -(y0 + y1) / 2;
        // faint unpainted neighbours: the stage the magic lands on
        if (S.d >= 1) {
          const used = new Set(lay.cells.map((c) => c[0] + ',' + c[1]));
          for (let q = -8; q <= 8; q++) for (let r = -8; r <= 8; r++) {
            if (used.has(q + ',' + r)) continue;
            const p = hexXY(q, r, lay.s), px = p[0] + ox, py = p[1] + oy;
            if (abs(px) > 38 - lay.s * 0.5 || abs(py) > 38 - lay.s * 0.5) continue;
            S.g.save(); S.g.setLineDash([S.T(3), S.T(3)]); S.g.beginPath(); tk.trace(S.g, poly(hexPts(px, py, lay.s * 0.92))); S.g.strokeStyle = tk.rgba('#8f86d0', 0.6); S.g.lineWidth = S.T(1.3); S.g.stroke(); S.g.restore();
          }
        }
        // origin first (cream), then the magic
        [['o'], ['n', 'c']].forEach((roles) => lay.cells.forEach((c, i) => {
          if (roles.indexOf(c[2]) < 0) return;
          const px = xy[i][0] + ox, py = xy[i][1] + oy, hp = poly(hexPts(px, py, lay.s * 0.96));
          if (c[2] === 'o') {
            S.cel(hp, '#efe8ff', { line: S.L(2.2), depth: lay.s * 0.22, shadow: '#b4aad8' });
            S.circle(px, py, lay.s * 0.22, '#7a70b0');
          } else {
            S.cel(hp, ink, { line: S.L(2.4), depth: lay.s * 0.26, shadow: f.shade });
            if (c[2] === 'c') S.spark(px + lay.s * 0.2, py - lay.s * 0.25, lay.s * 0.45, { color: '#ffffff', glow: 0 });
          }
        }));
        if (id === 'blot' || (DATA.brushes[id] && DATA.brushes[id].kind === 'dot')) {
          S.g.save(); S.g.setLineDash([S.T(4), S.T(4)]); S.g.beginPath(); S.g.arc(0, 0, 37, 0, TAU); S.g.strokeStyle = tk.rgba(f.light, 0.6); S.g.lineWidth = S.T(1.8); S.g.stroke(); S.g.restore();
        }
        brushBadge(S, id);
      },
    };
  }
  REG.brush = { ids: Object.keys(DATA.brushes || {}), resolve: (id, o) => brushSpec(id, o) };

  // ---------------------------------------------------------------------------------------------------------------
  // INTENT: chunky sticker pictograms, one colour and one idea each, with a cream die-cut rim so they read on cream bubbles and on dark.
  // ---------------------------------------------------------------------------------------------------------------
  const INTENT_LOOK = { attack: '#ff4d5a', multi: '#ff6a3a', heavy: '#ff9a2e', defend: '#5fb4ff', buff: '#ffd84d', debuff: '#a77bff', summon: '#7a6bff', heal: '#3fcf6a', special: '#ff7eb6', flee: '#9be83a', none: '#a8a2c4' };
  const INTENTF = {};
  const burst = (cx, cy, R, r, n, rot) => starPts(cx, cy, R, r, n, rot === undefined ? -PI / 2 : rot);
  // the chunky sticker body of an intent: a die-cut rim, then the cel fill
  const sticker = (S, shape, base, oo) => { S.die(shape, 3.8); S.cel(shape, base, Object.assign({ line: S.L(3), depth: 6.5, tension: 0.5 }, oo)); };
  INTENTF.attack = (S, f) => {
    // a red sound burst with an arrow head through it
    sticker(S, poly(burst(-2, -2, 43, 27, 9, -PI / 2 + 0.2)), f.base, { tension: 0.25, depth: 7 });
    S.cel(poly(burst(-2, -2, 24, 14, 9, -PI / 2 + 0.2)), '#fff1a8', { line: S.L(2.2), depth: 3, shadow: N.goldM, tension: 0.25 });
    S.cel(poly([[-34, -2], [-12, -22], [-12, -9], [22, -9], [22, 5], [-12, 5], [-12, 18]]), CREAM, { line: S.L(2.6), depth: 4, shadow: N.creamD, tension: 0.2 });
  };
  INTENTF.multi = (S, f) => {
    // three small bursts in a row
    [-29, 0, 29].forEach((x, i) => {
      sticker(S, poly(burst(x, i === 1 ? -4 : 2, i === 1 ? 22 : 18, i === 1 ? 14 : 11.5, 8, -PI / 2 + i * 0.3)), f.base, { depth: 4.4, tension: 0.25, line: S.L(2.6) });
      S.cel(poly(burst(x, i === 1 ? -4 : 2, 9, 5, 8, -PI / 2 + i * 0.3)), '#fff1a8', { line: S.L(1.6), depth: 1.5, shadow: N.goldM, tension: 0.25 });
    });
  };
  INTENTF.heavy = (S, f) => {
    // one big burst with a heavy downward arrow
    sticker(S, poly(burst(0, -2, 44, 29, 10, -PI / 2 + 0.2)), f.base, { tension: 0.25, depth: 7 });
    S.cel(poly([[-11, -26], [11, -26], [11, 0], [24, 0], [0, 30], [-24, 0], [-11, 0]]), N.blackL, { line: S.L(3), depth: 5, shadow: N.black, tension: 0.2 });
    S.hl([[-6, -21], [-6, -6]], 3, 0.5);
  };
  INTENTF.defend = (S, f) => {
    // a blue bubble shield
    const sh = [[-31, -27], [0, -37], [31, -27], [32, 0], [21, 24], [0, 39], [-21, 24], [-32, 0]];
    sticker(S, sh, f.base, { depth: 8, tension: 0.95 });
    S.g.save(); S.g.beginPath(); tk.trace(S.g, xf(sh, { s: 0.74 }), 0, 0, 0.95); S.g.strokeStyle = tk.rgba(CREAM, 0.9); S.g.lineWidth = S.T(3); S.g.stroke(); S.g.restore();
    S.hl([[-22, -12], [-20, -22], [-10, -28]], 5, 0.85);
    S.spark(16, 10, 6, { color: '#ffffff' });
  };
  INTENTF.buff = (S, f) => {
    // an up arrow with sparkles (Hype up)
    sticker(S, poly([[-12, 38], [-12, 4], [-30, 4], [0, -36], [30, 4], [12, 4], [12, 38]]), f.base, { tension: 0.2, depth: 7 });
    S.spark(-33, -22, 8, { color: '#ffffff' }); S.spark(33, 22, 7, { color: GOLD2 });
    if (S.d) S.spark(-30, 26, 5, { color: GOLD2 });
  };
  INTENTF.debuff = (S, f) => {
    // a violet swirl with a down arrow (Jinx)
    S.stroke(tk.arcPts(-6, -6, 21, 21, -PI * 0.2, PI * 1.45, 14), 10, f.base, { ow: 2.4, taperStart: 0.4, taperEnd: 0.05 });
    sticker(S, poly([[-11, -4], [11, -4], [11, 8], [24, 8], [0, 38], [-24, 8], [-11, 8]]), '#7a4fe0', { tension: 0.2, depth: 6 });
    S.spark(30, -26, 6, { color: '#e2d0ff' });
  };
  INTENTF.summon = (S, f) => {
    // a plus sign with a tiny creature popping out of it
    sticker(S, poly([[-10, -8], [-10, -26], [10, -26], [10, -8], [28, -8], [28, 12], [10, 12], [10, 30], [-10, 30], [-10, 12], [-28, 12], [-28, -8]]), f.base, { tension: 0.2, depth: 6.5 });
    S.stroke([[-4, -12], [-28, -34]], 3.2, CREAM, { ow: 0, alpha: 0.9 });
    S.cel([[22, -34], [30, -28], [32, -16], [24, -10], [14, -12], [10, -22], [14, -32]], '#fff1c8', { line: S.L(2.6), depth: 4, shadow: '#f5cf8a', tension: 0.9 });
    S.circle(19, -23, 2.2, INK); S.circle(26, -23, 2.2, INK);
    S.stroke([[14, -35], [11, -41]], 3, INK, { ow: 0 }); S.stroke([[27, -35], [30, -41]], 3, INK, { ow: 0 });
    S.spark(-30, -24, 6, { color: '#ffffff' });
  };
  INTENTF.heal = (S, f) => {
    // a heart with a plus
    sticker(S, heart(0, 2, 38), f.base, { depth: 8, tension: 1 });
    S.cel(poly([[-5.5, -12], [5.5, -12], [5.5, -2.5], [15, -2.5], [15, 8.5], [5.5, 8.5], [5.5, 18], [-5.5, 18], [-5.5, 8.5], [-15, 8.5], [-15, -2.5], [-5.5, -2.5]]), CREAM, { line: S.L(2.4), depth: 2.6, shadow: N.greenL, tension: 0.2 });
    S.hl([[-26, -14], [-22, -22], [-14, -26]], 4.4, 0.75);
    S.spark(28, -26, 6, { color: '#ffffff' });
  };
  INTENTF.special = (S, f) => {
    // a big sparkle star with a question curl
    sticker(S, poly(starPts(0, 0, 44, 13, 4, -PI / 2)), f.base, { tension: 0.2, depth: 7 });
    S.stroke(bez3([-8, -10], [-8, -22], [12, -22], [10, -10], 8).concat(bez3([10, -10], [8, -2], [0, 0], [0, 7], 6)), 5.6, CREAM, { ow: 2, poly: true, step: 3 });
    S.dot(0, 17, 3.6, CREAM, 2);
    S.spark(-32, 28, 6, { color: '#ffffff' });
  };
  INTENTF.flee = (S, f) => {
    // running trainers with dash lines
    [[-38, -14, 14], [-42, 2, 22], [-36, 18, 12]].forEach((l) => S.stroke([[l[0], l[1]], [l[0] + l[2], l[1]]], 4.6, CREAM, { ow: 1.8 }));
    S.die(poly([[-6, 12], [-6, -18], [4, -28], [18, -22], [22, -8], [40, 0], [42, 12], [-6, 12]]), 3.4);
    S.cel([[-6, 14], [-6, -16], [2, -27], [14, -26], [18, -14], [20, -6], [40, 0], [42, 14]], f.base, { line: S.L(3), depth: 5, shadow: N.limeD, tension: 0.45 });
    S.cel(rr(-8, 8, 52, 14, 6), CREAM, { line: S.L(2.8), depth: 3, shadow: N.creamD, tension: 0.6 });
    [[8, -6, 16, -2], [14, -14, 22, -10]].forEach((l) => S.stroke([[l[0], l[1]], [l[2], l[3]]], 3.2, CREAM, { ow: 0 }));
    S.stroke([[-6, 12], [-6, 20]], 3, INK, { ow: 0 });
  };
  INTENTF.none = (S, f) => {
    // a grey speech bubble with three dots
    sticker(S, ell(0, -3, 41, 31, 0, 22), f.base, { depth: 7, tension: 1 });
    S.cel(poly([[-14, 22], [-24, 40], [4, 26]]), f.base, { line: S.L(3), depth: 2, shadow: f.shade, tension: 0.2 });
    S.fill(poly([[-12, 23], [-16, 28], [-3, 24.5]]), f.base);
    [-18, 0, 18].forEach((x) => S.dot(x, -3, 5.4, CREAM, 2));
  };
  REG.intent = {
    ids: L.intents.slice(),
    resolve: (id, o) => (INTENTF[id] ? { key: 'intent|' + id, glow: INTENT_LOOK[id], render: (S, oo) => { const c = colorOpt(oo && oo.color) || INTENT_LOOK[id]; INTENTF[id](S, tone(c)); } } : null),
  };

  // ---------------------------------------------------------------------------------------------------------------
  // GEM: five cuts x four colours x three tiers, and the empty sockets. Every gem, socket and prism carries an ENGRAVED glyph that does not
  // depend on colour: the id 'sword' (pink, an eighth note: a sung hit), shield (blue), leaf (green), star (gold), ring (the rainbow prism).
  // Stones read as rose quartz, aquamarine, jade and citrine; every gem is a little sticker with a cream die-cut rim.
  // ---------------------------------------------------------------------------------------------------------------
  const GEM_COL = {
    red: { base: '#ff5fa2', light: '#ffb4d4', dark: '#a3205f', glow: '#ffd0e6' },
    blue: { base: '#5fb4ff', light: '#c0e2ff', dark: '#2459b8', glow: '#d8eeff' },
    green: { base: '#3fcf6a', light: '#b4f5c6', dark: '#177a3a', glow: '#c8fbd8' },
    gold: { base: '#ffd84d', light: '#fff4b0', dark: '#c27e0e', glow: '#fff2c8' },
    any: { base: '#e6dcff', light: '#ffffff', dark: '#7a6cb8', glow: '#ffffff' },
  };
  const GEM_GLYPH = { red: 'sword', blue: 'shield', green: 'leaf', gold: 'star', any: 'ring' };
  // the glyph as filled shapes in a unit box (about +-1), tilted where that helps it read; fn(g, r) fills the current colour
  const GLYPHS = {
    sword(g, r) {
      // an eighth note: a tilted head, a stem and a flag
      g.save(); g.beginPath();
      g.ellipse(-0.32 * r, 0.58 * r, 0.56 * r, 0.4 * r, -0.4, 0, TAU);
      g.rect(0.12 * r, -0.96 * r, 0.22 * r, 1.58 * r);
      g.moveTo(0.34 * r, -0.96 * r); g.quadraticCurveTo(1.0 * r, -0.66 * r, 0.86 * r, -0.06 * r); g.lineTo(0.66 * r, -0.12 * r); g.quadraticCurveTo(0.76 * r, -0.5 * r, 0.34 * r, -0.58 * r); g.closePath();
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
    // the cream die-cut rim, then the body: the filled outline first (so no seam shows), then the facets
    S.die(poly(O), cut === 'star' ? 2.4 : 3, tier < 2);
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
        // a cream sticker bezel, then the recess: deep indigo, with an inner shadow on the upper-right wall and a lit lip at the lower left
        S.die(circ(0, 0, 41), 3.6);
        S.cel(circ(0, 0, 41), '#efe6ff', { line: S.L(3.2), shadow: '#b9aedc', depth: 6.5 });
        S.cel(circ(0, 0, 34), '#2b2060', { line: S.L(2.4), shadow: '#150f38', depth: 8, rim: lit ? gc.glow : '#6a5cb0', rimW: S.L(1.8), rimSide: 'light', hi: false });
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
          g.save(); g.translate(0.8, 0.9); g.fillStyle = '#0a0620'; g.globalAlpha *= 0.55; GLYPHS[GEM_GLYPH[color]](g, r); g.restore();
          g.fillStyle = lit ? gc.light : tk.mix(gc.base, '#2b2060', 0.3); GLYPHS[GEM_GLYPH[color]](g, r);
          g.restore();
        });
        if (lit) { S.glow(0, 0, 44, gc.glow, 0.35); S.spark(15, -16, 6, { color: '#ffffff' }); }
        if (S.d && !lit) S.gloss(0, 0, 38, PI * 0.15, PI * 0.42, 2.4, 0.4);
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
  // TILE: map tile stamps. A round sticker with a cream die-cut rim and a little coloured drawing on it. opts.done fades the sticker into the ground.
  // ---------------------------------------------------------------------------------------------------------------
  const TILE_COL = { start: '#ffd84d', empty: '#fff3dc', block: '#e6d9ff', enemy: '#e8553f', elite: '#ff4fa0', boss: '#2b2060', chest: '#ff7eb6', shop: '#2ec4b6', camp: '#3fcf6a', event: '#a77bff', well: '#8fe3c0', brush: '#7cc6ff', gemcache: '#c49bff', forge: '#ff9a2e' };
  const TILEF = {};
  function stampBase(S, id, o) {
    const col = o.color || TILE_COL[id] || N.red, f = tone(col);
    S.die(circ(0, 0, 41), 4.4);
    S.cel(circ(0, 0, 41), col, { line: S.L(3.2), depth: 7.5, shadow: id === 'boss' && !o.color ? '#150f38' : f.shade });
    // the inner stitch ring of the sticker
    if (S.d) { S.g.save(); S.g.setLineDash([S.T(4), S.T(3.4)]); S.g.lineCap = 'round'; S.g.beginPath(); S.g.arc(0, 0, 35, 0, TAU); S.g.strokeStyle = id === 'empty' ? '#d9c3a0' : tk.rgba(CREAM, 0.7); S.g.lineWidth = S.T(1.5); S.g.stroke(); S.g.restore(); }
  }
  // a tiny gem (used on the Sparkle Booth and the Rival's crown-less cousins): a faceted kite
  const miniGem = (S, x, y, k, col) => S.at(x, y, 0, k, k, () => {
    S.cel(poly([[0, -14], [11, -5], [0, 14], [-11, -5]]), col, { line: S.L(2.4 / k), depth: 3, shadow: wshade(col, 0.2), tension: 0.2 });
    if (S.d) S.ink([[-11, -5], [11, -5]], { w: 1.2, color: INK, alpha: 0.6, taper: 0, wobble: 0 });
  });
  TILEF.start = (S) => {
    // Soundcheck: the little tour van with a mic stand beside it
    S.stroke([[24, 18], [24, -16]], 3.4, N.blackL, { ow: 1.2 });
    mic(S, 24, -22, 0.25, 0.5, { ball: N.chrome, handle: N.black, band: N.pink, r: 12, len: 14 });
    S.cel([[-34, 2], [-30, -14], [-14, -18], [4, -18], [12, -8], [16, -4], [16, 14], [-34, 14]], CREAM, { line: S.L(2.6), depth: 4, shadow: N.creamD, tension: 0.4 });
    S.fill(poly([[-34, 5], [16, 5], [16, 10], [-34, 10]]), N.pink);
    S.cel(poly([[2, -15], [10, -7], [2, -7]]), '#a9dcff', { line: S.L(1.8), depth: 1, shadow: '#6aaee8', tension: 0.2 });
    S.cel(rr(-26, -13, 22, 9, 2), '#a9dcff', { line: S.L(1.8), depth: 1.6, shadow: '#6aaee8', tension: 0.5 });
    S.dot(-22, 16, 6.4, N.blackL, 2.2); S.dot(8, 16, 6.4, N.blackL, 2.2);
    S.circle(-22, 16, 2.2, CREAM); S.circle(8, 16, 2.2, CREAM);
  };
  TILEF.empty = (S) => {
    // Path: a trail of three small footprints in dots
    const print = (x, y, a) => S.at(x, y, a, 1, 1, () => {
      S.cel(ell(0, -4, 6.6, 9, 0, 14), '#b69a86', { line: S.L(2.2), depth: 2.6, shadow: '#8f735f' });
      S.cel(ell(0, 9, 5, 5.6, 0, 12), '#b69a86', { line: S.L(2.2), depth: 1.8, shadow: '#8f735f' });
    });
    print(-15, 15, -0.3); print(7, 2, 0.25); print(-8, -17, -0.25);
  };
  TILEF.block = () => null;                                  // Blur is drawn by tileSpec itself (it is not a recolourable sticker)
  TILEF.enemy = (S) => {
    // Face-Off: two crossed mics
    mic(S, -17, -17, -0.62, 0.92, { ball: N.chrome, handle: '#ede4ff', band: N.orange, r: 13, len: 32 });
    mic(S, 17, -17, 0.62, 0.92, { ball: N.chrome, handle: '#ede4ff', band: N.pink, r: 13, len: 32 });
    S.spark(0, 22, S.d ? 6 : 0, { color: '#ffffff', glow: 0 });
  };
  TILEF.elite = (S) => {
    // Rival: a star with a frown
    S.cel(poly(star5(0, 1, 33, -PI / 2)), '#fff1a8', { line: S.L(2.8), depth: 5, shadow: N.goldM, tension: 0.2 });
    S.circle(-7, -2, 3.2, INK); S.circle(7, -2, 3.2, INK);
    S.stroke([[-12, -9], [-4, -6]], 3, INK, { ow: 0 }); S.stroke([[12, -9], [4, -6]], 3, INK, { ow: 0 });
    S.stroke([[-8, 13], [0, 8], [8, 13]], 3.4, INK, { ow: 0 });
  };
  TILEF.boss = (S) => {
    // Headliner: a big marquee star ringed with light bulbs
    S.cel(poly(star5(0, 2, 34, -PI / 2)), GOLD, { line: S.L(3), depth: 6, shadow: N.goldD, tension: 0.2 });
    S.cel(poly(star5(0, 3, 18, -PI / 2)), '#fff1a8', { line: S.L(2), depth: 2.4, shadow: N.goldM, tension: 0.2 });
    const tips = star5(0, 2, 34, -PI / 2);
    tips.forEach((p, i) => { if (i % 2 === 0) S.dot(p[0] * 1.02, p[1] * 1.02 - 1, S.d ? 3.4 : 4, CREAM, 1.8); });
    for (let i = 0; i < 10; i++) { const a = -PI / 2 + i * TAU / 10 + PI / 10, bx = cos(a) * 24.5, by = 2 + sin(a) * 24.5; if (i % 2) S.dot(bx, by, 2.2, '#ffffff', 1.2); }
  };
  TILEF.chest = (S) => {
    // Gift Box: a ribboned box with a heart tag
    S.cel(rr(-27, -6, 54, 33, 4), CREAM, { line: S.L(2.8), depth: 5, shadow: N.creamD, tension: 0.4 });
    S.cel(rr(-30, -14, 60, 13, 3.5), '#fff1f6', { line: S.L(2.8), depth: 3, shadow: '#f4bfd6', tension: 0.4 });
    S.cel(rr(-6, -14, 12, 41, 1.5), N.teal, { line: S.L(2.2), depth: 2, shadow: N.tealD, tension: 0.3 });
    S.cel([[0, -14], [-9, -26], [-19, -25], [-17, -15]], N.teal, { line: S.L(2.2), depth: 2, shadow: N.tealD, tension: 0.8 });
    S.cel([[0, -14], [9, -26], [19, -25], [17, -15]], N.teal, { line: S.L(2.2), depth: 2, shadow: N.tealD, tension: 0.8 });
    S.dot(0, -14, 4.2, N.teal, 2);
    S.stroke([[12, -1], [14, 10]], 2, INK, { ow: 0 });
    S.cel(heart(15, 16, 8), N.pink, { line: S.L(2.2), depth: 2, shadow: N.pinkD });
  };
  TILEF.shop = (S) => {
    // Merch Stall: a stall with a striped awning, a tote bag and a T-shirt
    S.stroke([[-24, -8], [-24, 26]], 3.6, N.woodD, { ow: 1.2 }); S.stroke([[24, -8], [24, 26]], 3.6, N.woodD, { ow: 1.2 });
    S.cel(rr(-30, 14, 60, 14, 3), N.woodL, { line: S.L(2.6), depth: 3, shadow: N.wood, tension: 0.4 });
    S.cel(poly([[-34, -8], [-26, -26], [26, -26], [34, -8]]), CREAM, { line: S.L(2.8), depth: 4, shadow: N.creamD, tension: 0.2 });
    S.clip(poly([[-34, -8], [-26, -26], [26, -26], [34, -8]]), () => { [-28, -14, 0, 14, 28].forEach((x, i) => { if (i % 2 === 0) S.fill(poly([[x - 8, -28], [x + 6, -28], [x + 6, -6], [x - 8, -6]]), N.pink); }); });
    S.g.save(); S.g.beginPath(); tk.trace(S.g, poly([[-34, -8], [-26, -26], [26, -26], [34, -8]])); S.g.lineWidth = S.L(2.8); S.g.strokeStyle = INK; S.g.stroke(); S.g.restore();
    S.cel(rr(-19, 1, 16, 15, 3), '#fff1c8', { line: S.L(2.2), depth: 2.4, shadow: '#f0cf86', tension: 0.5 });
    S.stroke([[-16, 1], [-16, -4], [-6, -4], [-6, 1]], 2.2, INK, { ow: 0, poly: true, step: 2 });
    S.cel(poly([[6, 2], [11, -1], [16, 2], [22, 1], [24, 7], [20, 9], [19, 16], [8, 16], [7, 9], [3, 7], [4, 1]]), '#8fd0ff', { line: S.L(2.2), depth: 2.4, shadow: '#5aa0e0', tension: 0.3 });
  };
  TILEF.camp = (S) => {
    // Green Room: a backstage tent with a star on its door
    S.cel(poly([[0, -30], [30, 18], [-30, 18]]), CREAM, { line: S.L(2.8), depth: 6, shadow: N.creamD, tension: 0.2 });
    S.cel(poly([[0, -4], [11, 18], [-11, 18]]), N.greenD, { line: S.L(2.4), depth: 2.4, shadow: '#14572b', tension: 0.2 });
    S.cel(poly(star5(0, 10, 7.4, -PI / 2)), GOLD, { line: S.L(1.8), depth: 1.4, shadow: N.goldD, tension: 0.2 });
    S.stroke([[-34, 20], [34, 20]], 4, N.woodD, { ow: 1.2 });
    S.stroke([[0, -30], [0, -37]], 2.4, INK, { ow: 0 });
    S.cel(poly([[0, -37], [10, -34], [0, -31]]), N.pink, { line: S.L(1.8), depth: 1, shadow: N.pinkD, tension: 0.2 });
  };
  TILEF.event = (S) => {
    // Detour: a bent arrow sign with a question mark
    S.stroke([[-2, 34], [-2, -22]], 5, N.woodD, { ow: 1.6 });
    S.cel(poly([[-22, -34], [14, -34], [26, -22], [14, -10], [-22, -10]]), CREAM, { line: S.L(2.8), depth: 4.4, shadow: N.creamD, tension: 0.2 });
    S.stroke(bez3([-14, -26], [-14, -33], [0, -33], [0, -26], 6).concat(bez3([0, -26], [0, -21], [-7, -20], [-7, -15], 5)), 3.4, N.violetD, { ow: 0, poly: true, step: 3 });
    S.dot(-7, -11.4, 1.8, N.violetD, 0.1);
    S.cel(poly([[-4, 6], [20, 6], [30, 15], [20, 24], [-4, 24]]), N.cream, { line: S.L(2.4), depth: 3.4, shadow: N.creamD, tension: 0.2 });
    S.stroke([[2, 15], [18, 15]], 3, N.violetD, { ow: 0 });
    S.stroke([[13, 9.4], [19, 15], [13, 20.6]], 3, N.violetD, { ow: 0, poly: true, step: 3 });
  };
  TILEF.well = (S) => {
    // Tea Stall: a steaming cup on a little cart
    S.cel(rr(-30, 6, 60, 16, 4), N.woodL, { line: S.L(2.6), depth: 3.4, shadow: N.wood, tension: 0.4 });
    S.dot(-16, 26, 6.4, N.blackL, 2.2); S.dot(16, 26, 6.4, N.blackL, 2.2);
    S.circle(-16, 26, 2.2, CREAM); S.circle(16, 26, 2.2, CREAM);
    S.stroke([[10, -6], [19, -6], [19, 2], [8, 4]], 3.8, CREAM, { ow: 1.6, poly: true, step: 3 });
    S.cel(poly([[-14, -10], [14, -10], [11, 6], [-11, 6]]), CREAM, { line: S.L(2.6), depth: 3.4, shadow: N.creamD, tension: 0.3 });
    S.stroke([[-12, -2], [12, -2]], 3.4, N.pink, { ow: 0 });
    [[-7, -14], [3, -14]].forEach((p, i) => S.stroke(bez3([p[0], p[1] + 3], [p[0] + 6, p[1] - 4], [p[0] - 6, p[1] - 10], [p[0] + 1, p[1] - 17], 8), 3.2, CREAM, { ow: 1.4, taperEnd: 0.5 }));
  };
  TILEF.brush = (S) => {
    // Busker: an open hat with a sparkle
    S.cel(ell(0, 12, 33, 9.5, 0, 22), '#e8b27a', { line: S.L(2.8), depth: 3.4, shadow: '#b9773a' });
    S.cel([[-20, 11], [-18, -4], [-10, -9], [10, -9], [18, -4], [20, 11]], '#f3cd94', { line: S.L(2.6), depth: 4, shadow: '#c98a52', tension: 0.7 });
    S.fill(ell(0, 11, 20, 5.6, 0, 18), '#8a5530');
    S.g.save(); S.g.beginPath(); S.g.ellipse(0, 11, 20, 5.6, 0, 0, TAU); S.g.lineWidth = S.L(2.2); S.g.strokeStyle = INK; S.g.stroke(); S.g.restore();
    S.stroke([[-20, 0], [20, 0]], 4.4, N.pink, { ow: 0, alpha: 0.95 });
    S.dot(-5, 10, 4.4, GOLD, 1.8); S.dot(6, 11.5, 4, GOLD, 1.8);
    S.spark(12, -24, 9, { color: '#ffffff' }); S.spark(-18, -18, 5.5, { color: GOLD2 });
  };
  TILEF.gemcache = (S) => {
    // Sparkle Booth: a booth of glittering stones
    S.cel(rr(-30, 8, 60, 20, 4), CREAM, { line: S.L(2.8), depth: 4, shadow: N.creamD, tension: 0.4 });
    S.cel(poly([[-30, 8], [-24, -4], [24, -4], [30, 8]]), N.violet, { line: S.L(2.6), depth: 3.4, shadow: N.violetD, tension: 0.2 });
    miniGem(S, -16, -10, 1, '#ff5fa2'); miniGem(S, 16, -10, 1, '#5fb4ff'); miniGem(S, 0, -17, 1.15, '#3fcf6a');
    S.spark(-26, -26, 6, { color: '#ffffff' }); S.spark(27, -22, 5.5, { color: GOLD2 });
    if (S.d) S.stroke([[-20, 18], [20, 18]], 3, N.violetD, { ow: 0, alpha: 0.6 });
  };
  TILEF.forge = (S) => {
    // Studio: a door with an ON AIR light
    S.cel(rr(-19, -8, 38, 40, 3), '#9a3a52', { line: S.L(2.8), depth: 5, shadow: '#6a2038', tension: 0.35 });
    S.dot(11, 14, 2.6, GOLD, 1.6);
    if (S.d) S.stroke([[-8, -2], [-8, 24]], 1.6, '#6a2038', { ow: 0 });
    S.cel(rr(-27, -29, 54, 17, 4), N.red, { line: S.L(2.8), depth: 3.4, shadow: N.redD, tension: 0.5 });
    S.glow(0, -20, 30, '#ff5a5a', 0.4);
    S.text('ON AIR', 0, -19.5, S.d ? 12 : 13, { fill: CREAM });
  };
  // Blur: a soft opalescent hole in the map, airbrushed, never scary (the one tile that is not a recolourable sticker)
  function blurSpec() {
    return {
      key: 'tile|block', glow: '#e6d9ff',
      render(S) {
        const g = S.g;
        S.glow(0, 0, 50, '#e6d9ff', 0.55);
        g.save();
        g.beginPath(); tk.trace(g, circ(0, 0, 39));
        g.fillStyle = tk.rad(g, -6, -8, 4, 0, 0, 42, [[0, '#ffffff'], [0.35, '#f4f1fb'], [0.62, '#e6d9ff'], [0.85, '#ffe3f1'], [1, 'rgba(217,255,244,0.55)']]);
        g.fill();
        g.restore();
        S.clip(circ(0, 0, 36), () => { S.fill(poly([[-40, 2], [-14, -40], [4, -40], [-24, 6]]), '#ffffff', 0.5); S.fill(poly([[-8, 22], [18, -36], [24, -36], [-2, 24]]), '#ffffff', 0.22); });
        if (S.d) { g.save(); g.setLineDash([S.T(3), S.T(4)]); g.lineCap = 'round'; g.beginPath(); g.arc(0, 0, 39, 0, TAU); g.strokeStyle = tk.rgba('#b3a8d8', 0.8); g.lineWidth = S.T(1.6); g.stroke(); g.restore(); }
        S.stroke([[-9, 6], [0, 11], [9, 6]], 3, '#9f93c9', { ow: 0, alpha: 0.85 });
      },
    };
  }
  REG.tile = {
    ids: L.tiles.slice(),
    resolve: (id, o) => {
      if (id === 'block') return blurSpec();
      if (!TILEF[id]) return null;
      return { key: 'tile|' + id, glow: TILE_COL[id], render: (S, oo) => { stampBase(S, id, { color: colorOpt(oo && oo.color) }); TILEF[id](S); } };
    },
  };

  // ---------------------------------------------------------------------------------------------------------------
  // CHARM (kind 'relic'): a sticker plate with a rarity rim and ONE little drawn object on it, the Charm's own picture (HV_WORLD_DATA 2). A Charm whose
  // icon id is shared with an earlier Charm has its own drawing in RELIC_OWN. The object keeps the warm outline and a cel shadow, takes its accent from
  // the Charm's palette (art.c) and never borrows the card motif of the same id (ART.card.motif now means something else on a card).
  // ---------------------------------------------------------------------------------------------------------------
  const RELICF = {};                                         // icon id -> fn(S, p)
  const RELIC_OWN = {};                                      // Charm id -> fn(S, p): the second Charm of a shared icon id
  const luma = (hex) => { const c = U.color.rgb(hex); return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; };
  // the object palette of a family: base light dark glow shade deep pale mid. Very dark families (ink) are lifted so the object shows on the plate
  const OPAL = new Map();
  function objPal(name, colorHex) {
    const key = colorHex || name;
    let p = OPAL.get(key);
    if (p) return p;
    const f = colorHex ? { base: colorHex, light: tk.tint(colorHex, 0.45), dark: wshade(colorHex, 0.3), glow: tk.tint(colorHex, 0.7) } : famOf(name);
    const lift = clamp((0.4 - luma(f.base)) / 0.26, 0, 1) * 0.72;
    const base = lift > 0.02 ? tk.mix(f.base, f.light, lift) : f.base, t = tone(base);
    p = { base, light: lift > 0.02 ? tk.mix(f.light, '#ffffff', 0.35) : f.light, dark: f.dark, glow: f.glow, shade: t.shade, deep: t.deep, pale: tk.tint(f.light, 0.55), mid: t.mid, name: name || 'ash', plate: tk.mix(tk.mix(f.dark, '#2b2060', 0.5), '#150f38', 0.22) };
    if (OPAL.size > 200) OPAL.clear();
    OPAL.set(key, p);
    return p;
  }
  const RELIC_RIM = { common: '#f3dfae', uncommon: '#cfe3ff', rare: '#ffd84d', boss: '#ff9a2e', shop: '#5fe8cf' };
  function relicPlate(S, p, rarity) {
    const rim = RELIC_RIM[rarity] || RELIC_RIM.common, g = S.g;
    const shape = rr(-42, -42, 84, 84, 20);
    S.die(shape, 3.8);
    S.cel(shape, p.plate, { line: S.L(3), depth: 8, shadow: tk.mix(p.plate, '#0a0620', 0.5), tension: 0.72 });
    S.clip(shape, () => { S.glow(0, -2, 50, p.base, 0.42); if (S.d) S.glow(14, -16, 28, p.glow, 0.2); });
    // the rarity rim: an inset rounded line, heavier for rare and boss, a pink inner line for a Headliner, studs for Merch
    g.save(); g.beginPath(); tk.trace(g, rr(-37.5, -37.5, 75, 75, 16), 0, 0, 0.72); g.strokeStyle = rim; g.lineWidth = S.T(rarity === 'rare' || rarity === 'boss' ? 2.8 : 2); g.globalAlpha *= 0.95; g.stroke(); g.restore();
    if (rarity === 'boss') { g.save(); g.beginPath(); tk.trace(g, rr(-33, -33, 66, 66, 13), 0, 0, 0.72); g.strokeStyle = N.pink; g.lineWidth = S.T(1.6); g.globalAlpha *= 0.85; g.stroke(); g.restore(); }
    if (rarity === 'uncommon' && S.d) { g.save(); g.setLineDash([S.T(4), S.T(3.4)]); g.beginPath(); tk.trace(g, rr(-33, -33, 66, 66, 13), 0, 0, 0.72); g.strokeStyle = rim; g.lineWidth = S.T(1.2); g.globalAlpha *= 0.6; g.stroke(); g.restore(); }
    if (rarity === 'shop') { S.circle(-37.5, 0, 2.8, rim); S.circle(37.5, 0, 2.8, rim); S.circle(0, -37.5, 2.8, rim); S.circle(0, 37.5, 2.8, rim); }
    if (S.d && (rarity === 'rare' || rarity === 'boss')) { S.spark(-35, -35, 4.4, { color: rim, glow: 0 }); S.spark(35, 35, 3.6, { color: '#ffffff', glow: 0 }); }
  }
  // an object with the usual defaults (warm line, one hard shadow)
  const rc = (S, shape, base, oo) => S.cel(shape, base, Object.assign({ line: S.L(2.4), depth: 3.8 }, oo));
  const bar = (S, pts, w, col, ow, oo) => S.stroke(pts, w, col, Object.assign({ ow: ow === undefined ? 1.6 : ow }, oo));
  // a curl of steam rising from (x, y)
  const curl = (S, x, y, h, col, w) => bar(S, bez3([x, y], [x + 7, y - h * 0.3], [x - 7, y - h * 0.65], [x + 1, y - h], 8), w || 3.4, col || CREAM, 1.3, { taperEnd: 0.6 });
  // a small outlined blossom, a smiley and a goat face: the stickers the Merch is covered in
  const miniBlossom = (S, x, y, r, col) => { for (let i = 0; i < 5; i++) { const a = -PI / 2 + i * TAU / 5; S.dot(x + cos(a) * r * 0.62, y + sin(a) * r * 0.62, r * 0.46, col || N.pink, 1.2); } S.dot(x, y, r * 0.34, GOLD, 1); };
  const smiley = (S, x, y, r, face, line) => { S.cel(circ(x, y, r), face, { line: S.L(2), depth: r * 0.2, shadow: wshade(face) }); S.circle(x - r * 0.34, y - r * 0.2, r * 0.12, line || INK); S.circle(x + r * 0.34, y - r * 0.2, r * 0.12, line || INK); S.ink(bez2([x - r * 0.46, y + r * 0.18], [x, y + r * 0.78], [x + r * 0.46, y + r * 0.18], 6), { w: max(1.4, r * 0.14), color: line || INK, taper: 0.2, wobble: 0 }); };
  // a cassette-style reel, a speaker cone: concentric dots
  const cone = (S, x, y, r, col) => { S.cel(circ(x, y, r), col || N.blackL, { line: S.L(2.4), depth: r * 0.2, shadow: N.black }); S.ring(x, y, r * 0.62, max(1.4, r * 0.1), N.chromeD); S.cel(circ(x, y, r * 0.3), N.chrome, { line: S.L(1.8), depth: r * 0.1, shadow: N.chromeD }); };

  // ---------------------------------------------------------------------------------------------------------------
  // the 22 common Charms
  // ---------------------------------------------------------------------------------------------------------------
  RELICF.lantern = (S, p) => {
    // Tour Poster: a rolled poster, half open, a star and a dotted route on it
    S.at(0, 3, -0.1, 1, 1, () => {
      rc(S, rr(-21, -24, 42, 56, 3), '#fff3dc', { depth: 5, shadow: '#ecd2a6', tension: 0.3 });
      S.stroke([[-21, 29], [21, 29]], 5, p.base, { ow: 0 });
      rc(S, poly(star5(0, -9, 12, -PI / 2)), GOLD, { line: S.L(2), depth: 2.4, shadow: N.goldD, tension: 0.2 });
      const route = bez3([-13, 22], [-16, 8], [14, 14], [12, 1], 14);
      route.forEach((q, i) => { if (i % 2 === 0 || !S.d) S.circle(q[0], q[1], S.d ? 1.9 : 2.6, p.dark); });
      bar(S, [[8, 4], [16, -3]], 3, N.red, 0); bar(S, [[16, 4], [8, -3]], 3, N.red, 0);
      rc(S, rr(-26, -34, 52, 13, 6.5), '#f6dca6', { depth: 3, shadow: '#d9b678', tension: 0.9 });
      bar(S, [[10, -35], [10, -20]], 5, N.pink, 0);
      S.hl([[-20, -30], [-8, -30]], 2.4, 0.8);
    });
  };
  RELICF.umbrella = (S, p) => {
    // Pop Filter: a round mesh disc on a bendy gooseneck clip
    bar(S, bez3([0, 24], [-18, 14], [16, 4], [0, -6], 12), 4.6, N.chrome, 1.6);
    rc(S, rr(-9, 22, 18, 12, 3), N.chromeD, { depth: 2.6, shadow: N.blackL, tension: 0.5 });
    S.dot(0, 28, 2, N.cream, 1);
    S.cel(circ(0, -14, 25), N.black, { line: S.L(2.8), depth: 5, shadow: N.blackD });
    S.clip(circ(0, -14, 22), () => { for (let i = -3; i <= 3; i++) { S.ink([[i * 7, -40], [i * 7, 12]], { w: 1.2, color: N.chrome, alpha: 0.85, taper: 0, wobble: 0 }); S.ink([[-30, -14 + i * 7], [30, -14 + i * 7]], { w: 1.2, color: N.chrome, alpha: 0.85, taper: 0, wobble: 0 }); } });
    S.ring(0, -14, 25, 4, p.light); S.ring(0, -14, 25, 1.2, INK, 0.5);
    S.hl([[-17, -22], [-12, -30]], 3, 0.8);
  };
  RELICF.coin = (S, p) => {
    // Busking Hat: an upturned straw boater with three gold coins inside
    const coin = (x, y, r) => { S.cel(circ(x, y, r), GOLD, { line: S.L(2.2), depth: r * 0.3, shadow: N.goldD }); S.ring(x, y, r * 0.58, 1.3, N.goldD, 0.8); };
    const straw = '#ecc66e', strawD = '#b9822e';
    S.cel(ell(0, 25, 35, 9, 0, 22), '#f3d58a', { line: S.L(2.6), depth: 3, shadow: strawD });
    rc(S, [[-21, 24], [-25, -6], [25, -6], [21, 24]], straw, { depth: 4.6, shadow: strawD, tension: 0.35 });
    if (S.d) for (let i = -3; i <= 3; i++) S.ink([[i * 7 - 4, 24], [i * 7 - 8, -4]], { w: 1.2, color: strawD, alpha: 0.55, taper: 0, wobble: 0 });
    bar(S, [[-22.4, 13], [22.4, 13]], 6.4, N.red, 1.4);
    S.cel(ell(0, -6, 25, 7.6, 0, 20), '#4a2a1a', { line: S.L(2.4), depth: 1, shadow: false });
    coin(-10, -12, 8.4); coin(10, -14, 8.4); coin(0, -22, 9);
    S.g.save(); S.g.beginPath(); S.g.ellipse(0, -6, 25, 7.6, 0, 0, PI); S.g.lineCap = 'round'; S.g.strokeStyle = INK; S.g.lineWidth = S.L(2.4) + S.L(4); S.g.stroke(); S.g.strokeStyle = straw; S.g.lineWidth = S.T(4); S.g.stroke(); S.g.restore();
    S.spark(25, -26, 6, { color: '#ffffff' });
  };
  RELICF.teacup = (S, p) => {
    // Travel Mug: a lidded travel mug covered in little stickers, a curl of steam
    curl(S, -2, -22, 16, CREAM, 3.4);
    bar(S, [[16, -4], [26, -2], [26, 16], [16, 20]], 5.6, N.chrome, 1.6, { poly: true, step: 3 });
    rc(S, [[-17, -14], [17, -14], [14, 32], [-14, 32]], N.teal, { depth: 5, shadow: N.tealD, tension: 0.3 });
    rc(S, rr(-19.5, -23, 39, 11, 4), N.blackL, { depth: 2.4, shadow: N.black, tension: 0.6 });
    S.stroke([[-6, -17.5], [6, -17.5]], 3, N.chrome, { ow: 0 });
    miniBlossom(S, -5, 2, 7); S.cel(poly(star5(7, 12, 6.4, -PI / 2)), GOLD, { line: S.L(1.6), depth: 1.4, shadow: N.goldD, tension: 0.2 }); S.cel(heart(-3, 22, 5), N.red, { line: S.L(1.6), depth: 1.4, shadow: N.redD });
    S.hl([[-12, -8], [-12, 8]], 2.6, 0.55);
  };
  RELICF.riceball = (S, p) => {
    // Warm Oat Bar: a light golden oat bar tilted across the plate with oat flecks on it, half wrapped in a torn teal wrapper with a star on it
    S.glow(0, 2, 40, '#ffe08a', 0.3);
    S.at(0, 3, -0.3, 1, 1, () => {
      rc(S, rr(-33, -15, 66, 30, 8), '#f6d37a', { depth: 5, shadow: '#e2a94a', tension: 0.5, hi: '#fff0b8', hiW: 2.4 });
      [[8, -7, 0.4], [14, 6, -0.5], [20, -3, 0.9], [24, 9, 0.1], [26, -9, -0.3], [6, 8, 0.7], [-0.5, -10, 0.2]].forEach((q) => { S.fill(ell(q[0], q[1], 3.1, 1.6, q[2], 8), '#fff6dc'); });
      if (S.d) [[12, -11, 0.3], [18, 11, -0.2], [27, 1, 0.8], [3, 2, 0.5]].forEach((q) => { S.fill(ell(q[0], q[1], 2.4, 1.3, q[2], 8), '#c98a3a'); });
      // the wrapper covers the left half: crimped at the far end, torn in a zigzag where the bar comes out
      rc(S, poly([[-37, -17], [-34, -18], [-1, -17], [2, -12], [-2, -8], [2, -3], [-2, 2], [2, 7], [-2, 12], [2, 16], [-34, 18], [-37, 17]]), N.teal, { depth: 4, shadow: N.tealD, tension: 0.2, hi: '#a8f0e8', hiW: 1.8 });
      if (S.d) { S.ink([[-33, -14], [-33, 14]], { w: 1.2, color: N.tealD }); S.ink([[-28, -14], [-28, 14]], { w: 1.2, color: N.tealD }); }
      S.cel(star5(-17, 0, 7), '#fff6dc', { line: S.L(1.3), depth: 1, shadow: '#f1d9b0', tension: 0.2 });
    });
    S.spark(24, -22, 5, { color: GOLD2 }); S.spark(-26, 24, 4, { color: '#ffffff' });
  };
  RELICF.comb = (S, p) => {
    // Mixtape: a cassette with a hand-written label and two spinning reels
    rc(S, rr(-32, -22, 64, 44, 5), p.base, { depth: 5, shadow: p.shade, tension: 0.4 });
    rc(S, rr(-26, -17, 52, 20, 3), '#fff3dc', { depth: 2.4, shadow: '#ecd2a6', tension: 0.4 });
    S.ink(bez3([-20, -9], [-14, -14], [-10, -4], [-3, -9], 8).concat(bez3([-3, -9], [3, -13], [8, -5], [18, -10], 8)), { w: 1.8, color: N.inkL, taper: 0.1, wobble: 0 });
    rc(S, [[-18, 22], [-14, 8], [14, 8], [18, 22]], N.blackL, { depth: 2.6, shadow: N.black, tension: 0.2 });
    [-12, 12].forEach((x) => { S.cel(circ(x, 14, 6.4), CREAM, { line: S.L(2), depth: 1.8, shadow: N.creamD }); S.circle(x, 14, 2.2, INK); });
    if (S.d) { S.dot(-28, -18, 1.6, N.chrome, 1); S.dot(28, -18, 1.6, N.chrome, 1); S.dot(-28, 18, 1.6, N.chrome, 1); S.dot(28, 18, 1.6, N.chrome, 1); }
  };
  RELICF.compass = (S, p) => {
    // Pitch Pipe: a round chrome pitch pipe with a ring of little holes
    rc(S, rr(24, -6, 12, 12, 3), N.chromeD, { depth: 2.2, shadow: N.blackL, tension: 0.5 });
    S.cel(circ(-3, 0, 30), N.chrome, { line: S.L(3), depth: 6, shadow: N.chromeD });
    S.ring(-3, 0, 25, 3.2, p.base);
    for (let i = 0; i < 9; i++) { const a = -PI / 2 + i * TAU / 9; S.dot(-3 + cos(a) * 17, sin(a) * 17, S.d ? 3 : 3.6, N.blackL, 1.2); }
    S.cel(circ(-3, 0, 6), p.base, { line: S.L(2), depth: 1.6, shadow: p.shade });
    S.hl([[-22, -14], [-14, -22]], 3, 0.8);
  };
  RELICF.scroll = (S, p) => {
    // Battle Trophy: a small gold cup topped with a mic
    rc(S, rr(-17, 22, 34, 12, 3), N.blackL, { depth: 2.6, shadow: N.black, tension: 0.4 });
    S.stroke([[-8, 28], [8, 28]], 3, GOLD, { ow: 0 });
    bar(S, [[0, 14], [0, 22]], 7, N.goldM, 1.6);
    S.stroke(bez3([-19, -8], [-33, -8], [-33, 8], [-17, 8], 8), 4.6, GOLD, { ow: 1.6 }); S.stroke(bez3([19, -8], [33, -8], [33, 8], [17, 8], 8), 4.6, GOLD, { ow: 1.6 });
    rc(S, [[-20, -10], [20, -10], [17, 6], [8, 15], [-8, 15], [-17, 6]], GOLD, { depth: 5, shadow: N.goldD, tension: 0.7 });
    S.hl([[-14, -4], [-11, 5]], 2.6, 0.8);
    bar(S, [[0, -10], [0, -17]], 5, N.chromeD, 1.4);
    S.cel(circ(0, -25, 10), N.chrome, { line: S.L(2.4), depth: 3, shadow: N.chromeD });
    if (S.d) S.stroke([[-6, -25], [6, -25]], 1.4, N.chromeD, { ow: 0, alpha: 0.7 });
  };
  RELICF.jar = (S, p) => {
    // Jar of Giggles: a corked jar of bouncing pink and green sparkles
    rc(S, [[-14, -18], [-24, -10], [-26, 8], [-20, 28], [20, 28], [26, 8], [24, -10], [14, -18]], '#e2f3ff', { depth: 6, shadow: '#a9d2f0', tension: 0.8 });
    rc(S, rr(-12, -30, 24, 14, 3), '#c98a52', { depth: 2.6, shadow: '#8a5530', tension: 0.5 });
    S.spark(-10, -2, 8, { color: N.pink, glow: 0 }); S.spark(9, 10, 9, { color: N.green, glow: 0 }); S.spark(8, -10, 5.5, { color: GOLD, glow: 0 }); S.spark(-9, 15, 5, { color: GOLD2, glow: 0 });
    S.circle(-16, 8, 2.2, N.pink); S.circle(17, -2, 2, N.green); S.circle(0, 20, 2, N.pink);
    S.hl([[-20, -6], [-21, 12]], 3, 0.7);
  };
  RELICF.inkstone = (S, p) => {
    // Giant Water Bottle: a tall bottle with a flip straw and a column of stickers
    bar(S, [[4, -32], [4, -24]], 4.4, '#ffffff', 1.4); bar(S, [[4, -32], [12, -36]], 4.4, '#ffffff', 1.4);
    rc(S, rr(-10, -28, 20, 9, 3), p.base, { depth: 2.2, shadow: p.shade, tension: 0.5 });
    rc(S, [[-9, -20], [9, -20], [15, -8], [15, 30], [10, 36], [-10, 36], [-15, 30], [-15, -8]], '#7fd6ff', { depth: 5, shadow: '#3c9bd8', tension: 0.45 });
    S.stroke([[-8, -2], [8, -2]], 1.6, '#3c9bd8', { ow: 0, alpha: 0.7 }); S.stroke([[-8, 10], [8, 10]], 1.6, '#3c9bd8', { ow: 0, alpha: 0.7 });
    S.cel(poly(star5(0, -8, 5.6, -PI / 2)), GOLD, { line: S.L(1.6), depth: 1, shadow: N.goldD, tension: 0.2 });
    S.cel(heart(0, 5, 5), N.pink, { line: S.L(1.6), depth: 1, shadow: N.pinkD });
    S.dot(0, 17, 4.2, N.green, 1.4); S.dot(0, 28, 3.6, GOLD, 1.4);
    S.hl([[-10, -14], [-11, 18]], 2.6, 0.6);
  };
  RELICF.heart = (S, p) => {
    // Cosy Onesie: a folded green onesie, a black smiley on the front
    rc(S, [[-34, -8], [-20, -22], [-12, -14], [-14, 8], [-28, 10]], '#4fd878', { depth: 3.4, shadow: '#2a9a50', tension: 0.4 });
    rc(S, [[34, -8], [20, -22], [12, -14], [14, 8], [28, 10]], '#4fd878', { depth: 3.4, shadow: '#2a9a50', tension: 0.4 });
    rc(S, [[-18, -22], [18, -22], [20, 4], [16, 34], [-16, 34], [-20, 4]], '#5be884', { depth: 6, shadow: '#2a9a50', tension: 0.4 });
    S.cel(ell(0, -22, 14, 5.4, 0, 14), '#3fbf68', { line: S.L(2.2), depth: 1.8, shadow: '#2a9a50' });
    S.g.save(); S.g.beginPath(); S.g.arc(0, 6, 11.5, 0, TAU); S.g.lineWidth = S.L(3.4); S.g.strokeStyle = INK; S.g.stroke(); S.g.restore();
    S.circle(-4.4, 3, 1.8, INK); S.circle(4.4, 3, 1.8, INK); S.ink(bez2([-5.6, 9], [0, 14], [5.6, 9], 6), { w: 2.2, color: INK, taper: 0.2, wobble: 0 });
    if (S.d) S.stroke([[0, -17], [0, -8]], 1.6, '#2a9a50', { ow: 0 });
  };
  RELICF.tooth = (S, p) => {
    // Foam Finger: a big lime foam hand pointing up, a little star
    const lime = '#b6f03a';
    [[4, 0], [12.4, 2], [20.6, 5]].forEach((q) => rc(S, rr(q[0] - 4.6, q[1], 9.2, 18, 4.6), lime, { depth: 2.6, shadow: N.limeD, tension: 0.9 }));
    rc(S, ell(-19, 14, 6.4, 10.4, 0.5, 12), lime, { depth: 2.6, shadow: N.limeD });
    rc(S, rr(-17, 4, 41, 30, 9), lime, { depth: 5, shadow: N.limeD, tension: 0.7 });
    rc(S, rr(-14, -37, 15, 44, 7.5), lime, { depth: 4, shadow: N.limeD, tension: 0.9 });
    S.stroke([[8, 8], [8, 14]], 1.8, N.limeD, { ow: 0, alpha: 0.9 }); S.stroke([[16.4, 10], [16.4, 16]], 1.8, N.limeD, { ow: 0, alpha: 0.9 });
    rc(S, rr(-17, 26, 41, 11, 4), CREAM, { depth: 2.2, shadow: N.creamD, tension: 0.5 });
    S.cel(poly(star5(3, 14, 7.6, -PI / 2)), GOLD, { line: S.L(1.8), depth: 1.6, shadow: N.goldD, tension: 0.2 });
    S.hl([[-9, -31], [-9, -16]], 2.8, 0.7);
  };
  RELICF.shell = (S, p) => {
    // Gig Bag: a padded soft case with a patched corner and a zip
    bar(S, bez3([-12, -20], [-12, -34], [12, -34], [12, -20], 8), 4.6, N.blackL, 1.6);
    rc(S, rr(-28, -22, 56, 52, 9), N.teal, { depth: 6, shadow: N.tealD, tension: 0.6 });
    [-8, 6, 20].forEach((y) => { S.stroke([[-24, y], [24, y]], 1.6, N.tealD, { ow: 0, alpha: 0.7 }); });
    S.stroke([[-26, -14], [26, -14]], 3, N.blackL, { ow: 1.2 });
    if (S.d) for (let i = -5; i <= 5; i++) S.ink([[i * 4.6, -17], [i * 4.6, -11]], { w: 1.1, color: N.chrome, taper: 0, wobble: 0 });
    S.cel(poly([[10, 12], [28, 12], [28, 30], [10, 30]]), '#fff3dc', { line: S.L(2), depth: 2, shadow: '#ecd2a6', tension: 0.2 });
    S.ink([[12, 14], [26, 14], [26, 28], [12, 28], [12, 14]], { w: 1.2, color: N.inkL, alpha: 0.8, taper: 0, pressure: 'flat', wobble: 0 });
  };
  RELICF.flame = (S, p) => {
    // Spark Fountain: a little stage cone spraying a fan of gold sparks
    [[-0.9, 30], [-0.45, 36], [0, 40], [0.45, 36], [0.9, 30]].forEach((l, i) => { const a = -PI / 2 + l[0], x0 = cos(a) * 10, y0 = 12 + sin(a) * 10; S.stroke([[x0, y0], [cos(a) * l[1], 12 + sin(a) * l[1] * 1.2]], 3.6, i % 2 ? GOLD2 : GOLD, { ow: 1.2, taperEnd: 0.4 }); });
    rc(S, [[-9, 14], [9, 14], [16, 34], [-16, 34]], N.red, { depth: 4, shadow: N.redD, tension: 0.2 });
    S.stroke([[-12, 26], [12, 26]], 3.4, CREAM, { ow: 0 });
    rc(S, rr(-10, 9, 20, 7, 2), N.blackL, { depth: 1.6, shadow: N.black, tension: 0.5 });
    S.spark(-22, -4, 6, { color: GOLD }); S.spark(22, -8, 7.5, { color: '#ffffff' }); S.spark(0, -26, 8, { color: GOLD2 });
    S.circle(-14, -18, 2.2, GOLD); S.circle(14, -22, 2, GOLD2); S.circle(28, 2, 2, GOLD);
  };
  RELICF.crane = (S, p) => {
    // Trumpet Mute: a cone-shaped brass mute with a cork band
    rc(S, [[-6, -32], [6, -32], [26, 18], [-26, 18]], '#f2c24a', { depth: 7, shadow: '#b9801a', tension: 0.2 });
    S.clip(poly([[-6, -32], [6, -32], [26, 18], [-26, 18]]), () => { S.fill(poly([[-30, 3], [30, 3], [30, 11], [-30, 11]]), '#c98a52'); S.stroke([[-30, 3], [30, 3]], 1.4, INK, { ow: 0, alpha: 0.6 }); S.stroke([[-30, 11], [30, 11]], 1.4, INK, { ow: 0, alpha: 0.6 }); });
    S.cel(ell(0, 22, 28, 7, 0, 18), '#d99a2c', { line: S.L(2.6), depth: 2.4, shadow: '#a8681a' });
    S.hl([[-6, -22], [-17, 10]], 3, 0.75);
    S.circle(0, -33, 3, N.chromeD);
  };
  RELICF.bamboo = (S, p) => {
    // Smoke Machine: a small box with a nozzle puffing a soft cloud
    [[8, -16, 10], [20, -26, 12], [2, -29, 9], [-9, -22, 8]].forEach((c, i) => { S.cel(circ(c[0], c[1], c[2]), i % 2 ? '#f1ecff' : CREAM, { line: S.L(2.2), depth: 3, shadow: '#cdc3e6' }); });
    rc(S, rr(-30, -2, 60, 30, 5), N.blackL, { depth: 4.6, shadow: N.black, tension: 0.5 });
    rc(S, poly([[8, -2], [24, -8], [26, -2]]), N.chromeD, { depth: 1.4, shadow: N.blackL, tension: 0.2 });
    for (let i = 0; i < 4; i++) S.stroke([[-24, 6 + i * 4.6], [-6, 6 + i * 4.6]], 1.8, N.black, { ow: 0 });
    S.dot(16, 14, 3.2, p.base, 1.5); S.dot(22, 14, 3.2, N.red, 1.5);
  };
  RELICF.flute = (S, p) => {
    // Wireless Mic: a handheld mic with a tiny aerial and motion lines
    soundArcs(S, -2, 2, 30, 2, -2.3, -1.0, CREAM, 3.2, 8); soundArcs(S, -2, 2, 30, 2, PI + 1.0 - 0.0, PI + 2.3 - 0.0, CREAM, 3.2, 8);
    mic(S, 8, -12, 0.55, 1.05, { ball: N.chrome, handle: p.base, band: N.pink, r: 13, len: 36 });
    bar(S, [[-18, 30], [-26, 40]], 2.6, N.chromeD, 1.2); S.circle(-26, 40, 2.4, N.red);
    S.spark(-24, -14, 5, { color: '#ffffff' });
  };
  RELICF.incense = (S, p) => {
    // Glow Stick: a straight, bright lime glow stick (a fat cylinder with a pale glowing core, two cream end caps and a lanyard loop) with a soft halo
    S.glow(0, 0, 46, N.lime, 0.65); S.glow(0, 0, 28, '#f4ffd0', 0.35);
    S.at(0, 0, -0.72, 1, 1, () => {
      S.ring(40, 0, 4.4, 2.6, INK); S.ring(40, 0, 4.4, 1.3, N.cream);
      rc(S, rr(-34, -11, 68, 22, 10), N.lime, { depth: 4.6, shadow: N.limeD, tension: 0.4, hi: '#f4ffd0', hiW: 2.2 });
      S.stroke([[-24, -1], [22, -1]], 6.6, '#f4ffd0', { ow: 0, alpha: 0.95 });
      rc(S, rr(-38, -12, 12, 24, 4), N.cream, { depth: 3, shadow: N.creamD, tension: 0.4 });
      rc(S, rr(24, -12, 12, 24, 4), N.cream, { depth: 3, shadow: N.creamD, tension: 0.4 });
      if (S.d) { S.ink([[-12, -9], [-12, 9]], { w: 1.2, color: N.limeD }); S.ink([[8, -9], [8, 9]], { w: 1.2, color: N.limeD }); }
    });
    S.spark(-22, -24, 6, { color: '#ffffff' }); S.spark(26, 22, 5, { color: N.lime }); S.spark(-28, 18, 3.6, { color: '#f4ffd0' });
  };
  RELICF.petal = (S, p) => {
    // Pink Scrunchie: a gathered pink ring with a blossom tucked in it
    for (let i = 0; i < 12; i++) { const a = i * TAU / 12; S.cel(circ(cos(a) * 20, sin(a) * 20 + 2, 9.6), i % 2 ? '#ff9cc6' : '#ff7eb6', { line: S.L(2.2), depth: 3, shadow: N.pinkD }); }
    S.cel(circ(0, 2, 11), p.plate, { line: S.L(2.4), depth: 3, shadow: tk.mix(p.plate, '#0a0620', 0.5) });
    miniBlossom(S, 18, -17, 11, '#fff2f7');
    if (S.d) { S.stroke([[-22, -4], [-14, -14]], 1.6, '#ffd0e6', { ow: 0, alpha: 0.9 }); }
  };
  RELICF.ink_drop = (S, p) => {
    // Lime Shoes: a pair of lime trainers, one mid-tap
    const shoe = (x, y, a, k) => S.at(x, y, a, k, k, () => {
      rc(S, rr(-22, 6, 46, 9, 4.5), CREAM, { depth: 2, shadow: N.creamD, tension: 0.6 });
      rc(S, [[-21, 8], [-21, -10], [-12, -14], [-4, -8], [4, -6], [14, 0], [24, 4], [24, 9], [-21, 9]], '#b6f03a', { depth: 4, shadow: N.limeD, tension: 0.45 });
      [[-2, -4, 6, -1], [4, 0, 11, 3]].forEach((l) => S.stroke([[l[0], l[1]], [l[2], l[3]]], 2.4, CREAM, { ow: 0 }));
      S.stroke([[-20, -4], [-12, -4]], 2.6, N.pink, { ow: 0 });
    });
    shoe(-8, 22, 0, 0.92);
    shoe(6, -8, -0.42, 0.92);
    S.spark(-24, -16, 5, { color: GOLD2 });
  };
  RELICF.charm = (S, p) => {
    // Spare Headphones: violet over-ear headphones looped on a hook
    bar(S, [[0, -36], [0, -30]], 3.6, GOLD, 1.4); S.stroke(tk.arcPts(0, -36, 6, 6, PI * 0.2, PI * 1.9, 8), 3.6, GOLD, { ow: 1.4 });
    S.stroke(tk.arcPts(0, 2, 24, 28, PI * 1.05, PI * 1.95, 12), 8, p.base, { ow: 2.2 });
    [-1, 1].forEach((sx) => {
      S.cel(ell(sx * 24, 12, 9, 15, 0, 14), p.base, { line: S.L(2.6), depth: 4, shadow: p.shade });
      S.cel(ell(sx * 24 + sx * 2, 12, 5.4, 10.4, 0, 12), p.dark, { line: S.L(2), depth: 2, shadow: tk.mix(p.dark, '#000000', 0.3) });
    });
    S.hl([[-24, 3], [-24, 9]], 2.4, 0.7);
    S.spark(8, 18, 5, { color: p.glow });
  };
  RELICF.beads = (S, p) => {
    // Heavy Strings: a coiled set of four bass strings in an orange packet
    rc(S, rr(-26, -22, 52, 48, 4), N.orange, { depth: 5, shadow: N.orangeD, tension: 0.4 });
    rc(S, rr(-26, -22, 52, 12, 3), CREAM, { depth: 1.8, shadow: N.creamD, tension: 0.4 });
    S.stroke([[-18, -16], [8, -16]], 2.4, N.orangeD, { ow: 0 });
    const coil = []; for (let i = 0; i <= 56; i++) { const u = i / 56, a = u * TAU * 3.6 - 1.2, r = 6 + u * 19; coil.push([cos(a) * r, 8 + sin(a) * r * 0.74]); }
    S.stroke(coil, 3.4, N.chrome, { ow: 1.4 });
    const e = coil[coil.length - 1];
    S.dot(e[0], e[1], 3.4, GOLD, 1.4);
    S.dot(0, 8, 2.6, N.chromeD, 1.2);
  };

  // ---------------------------------------------------------------------------------------------------------------
  // the 22 uncommon Charms
  // ---------------------------------------------------------------------------------------------------------------
  RELICF.mask = (S, p) => {
    // Goat Mask: a cream goat mask with curled ears and a beard tassel
    [-1, 1].forEach((sx) => {
      S.stroke(bez3([sx * 17, -12], [sx * 32, -22], [sx * 36, -4], [sx * 28, -2], 8), 7, CREAM, { ow: 2 });
      S.stroke(tk.arcPts(sx * 29, -5, 4.4, 4.4, 0, TAU * 0.8, 8), 2.2, p.dark, { ow: 0 });
    });
    rc(S, [[-18, -22], [0, -26], [18, -22], [21, -2], [14, 14], [4, 22], [-4, 22], [-14, 14], [-21, -2]], CREAM, { depth: 6, shadow: N.creamD, tension: 0.9 });
    S.stroke([[-16, -13], [-6, -11]], 3.2, p.base, { ow: 0 }); S.stroke([[16, -13], [6, -11]], 3.2, p.base, { ow: 0 });
    S.cel(ell(-9, -3, 5, 4.4, 0.15, 10), N.blackD, { line: S.L(1.8), depth: 1, shadow: false }); S.cel(ell(9, -3, 5, 4.4, -0.15, 10), N.blackD, { line: S.L(1.8), depth: 1, shadow: false });
    S.circle(-10.4, -4.4, 1.5, '#ffffff'); S.circle(7.6, -4.4, 1.5, '#ffffff');
    S.cel(ell(0, 8, 4.6, 3.2, 0, 10), N.pink, { line: S.L(1.8), depth: 1, shadow: N.pinkD });
    S.ink(bez2([-5, 14], [0, 18], [5, 14], 6), { w: 1.8, color: INK, taper: 0.2, wobble: 0 });
    S.circle(-15, 5, 2.6, N.pinkL, 0.8); S.circle(15, 5, 2.6, N.pinkL, 0.8);
    S.stroke([[0, 22], [0, 28]], 2.2, p.base, { ow: 1 });
    rc(S, [[-6, 27], [6, 27], [4, 39], [0, 36], [-4, 39]], p.base, { depth: 1.8, shadow: p.shade, tension: 0.2 });
  };
  RELICF.fan = (S, p) => {
    // Hoop Earring: a single gold hoop swinging, two petals in its arc
    S.stroke(tk.arcPts(0, 4, 31, 31, -PI * 0.78, -PI * 0.22, 8), 2.4, CREAM, { ow: 0, alpha: 0.7 });
    S.stroke(tk.arcPts(0, 6, 25, 25, 0, TAU, 20), 8, GOLD, { ow: 2.2 });
    S.g.save(); S.g.beginPath(); S.g.arc(0, 6, 25, PI * 0.75, PI * 1.2); S.g.lineWidth = S.T(3); S.g.strokeStyle = N.goldD; S.g.stroke(); S.g.restore();
    S.hl([[14, -14], [20, -8]], 2.6, 0.9);
    S.cel(circ(0, -22, 5), N.goldM, { line: S.L(2), depth: 1.4, shadow: N.goldD });
    [[-8, 8, 0.7], [9, 12, -0.8]].forEach((q) => S.at(q[0], q[1], q[2], 1, 1, () => S.cel([[0, 9], [-8, 3], [-8, -7], [-3, -11], [0, -6, 1], [3, -11], [8, -7], [8, 3]], '#ffc2dc', { line: S.L(2), depth: 2.4, shadow: N.pink, tension: 0.8 })));
  };
  RELICF.bell = (S, p) => {
    // Triangle: a silver triangle with its beater and a ring of ting lines
    S.stroke([[0, -34], [0, -26]], 2.4, CREAM, { ow: 1 });
    const tri = [[-26, 22], [0, -22], [26, 22], [-26, 22]];
    S.stroke(tri, 7, '#e8eef9', { ow: 2.2, poly: true, step: 3 });
    S.stroke([[-18, 18], [0, -14]], 2, '#ffffff', { ow: 0, alpha: 0.9 });
    S.at(22, -16, 0.75, 1, 1, () => { S.stroke([[0, -8], [0, 22]], 3.6, N.wood, { ow: 1.4 }); S.cel(circ(0, -10, 4.4), N.chrome, { line: S.L(2), depth: 1.4, shadow: N.chromeD }); });
    [[-30, -14, -22, -8], [-32, 2, -22, 2], [30, 14, 22, 8]].forEach((l) => S.stroke([[l[0], l[1]], [l[2], l[3]]], 3, GOLD, { ow: 1.2 }));
    S.spark(0, 6, S.d ? 5 : 0, { color: '#ffffff', glow: 0 });
  };
  RELICF.kasa = (S, p) => {
    // Tour Kettle: a round kettle with a sticker on it, steam curling
    curl(S, 24, -4, 18, CREAM, 3.2);
    S.stroke(tk.arcPts(0, -6, 18, 20, PI * 1.05, PI * 1.95, 10), 4, N.chromeD, { ow: 1.6 });
    rc(S, [[22, 6], [32, -4], [34, -2], [26, 14]], p.base, { depth: 2, shadow: p.shade, tension: 0.3 });
    S.cel(circ(-2, 12, 25), p.base, { line: S.L(3), depth: 6, shadow: p.shade });
    rc(S, rr(-14, -16, 24, 8, 4), N.chromeD, { depth: 1.6, shadow: N.blackL, tension: 0.8 });
    S.circle(-2, -19, 3, N.chrome);
    S.cel(poly(star5(-8, 12, 9, -PI / 2)), GOLD, { line: S.L(1.8), depth: 1.8, shadow: N.goldD, tension: 0.2 });
    S.hl([[-20, 2], [-15, -4]], 3, 0.75);
  };
  RELICF.dice = (S, p) => {
    // Lucky Plectrum: a gold plectrum with a four-leaf sparkle
    S.at(0, 2, -0.2, 1, 1, () => {
      rc(S, [[-24, -18], [0, -28], [24, -18], [22, 8], [0, 34], [-22, 8]], GOLD, { depth: 6, shadow: N.goldD, tension: 0.95 });
      S.cel(poly(starPts(0, -2, 15, 5, 4, -PI / 2)), '#fffbe0', { line: S.L(2), depth: 2.4, shadow: '#f0d070', tension: 0.2 });
      S.hl([[-17, -16], [-9, -22]], 3.2, 0.85);
    });
    S.spark(22, -26, 6, { color: N.pinkL }); S.spark(-26, 14, 5, { color: GOLD2 });
  };
  RELICF.brush = (S, p) => {
    // Mic-Wand Keyring: a key ring with a little mic-wand, a star and sparkles
    S.stroke(tk.arcPts(0, -22, 11, 11, 0, TAU, 14), 4.2, N.chrome, { ow: 1.6 });
    bar(S, [[0, -11], [0, -5]], 3, N.chromeD, 1.2);
    S.at(2, 28, 0.2, 1, 1, () => {
      S.stroke([[0, 0], [0, -34]], 7, CREAM, { ow: 2 });
      S.stroke([[0, -7], [0, -15]], 7.4, N.pink, { ow: 0 });
      S.cel(circ(0, -38, 10), N.chrome, { line: S.L(2.4), depth: 2.6, shadow: N.chromeD });
    });
    S.cel(poly(star5(14, -4, 11, -PI / 2 + 0.2)), GOLD, { line: S.L(2.2), depth: 2.4, shadow: N.goldD, tension: 0.2 });
    S.spark(-18, -6, 6, { color: '#ffffff' }); S.spark(26, 24, 5, { color: GOLD2 });
  };
  RELICF.plum = (S, p) => {
    // Blossom Badge: a round pin badge with a pink five-petal blossom
    S.cel(circ(0, 0, 31), N.chrome, { line: S.L(3), depth: 5, shadow: N.chromeD });
    S.cel(circ(0, 0, 25), '#ffe9f2', { line: S.L(2.4), depth: 4, shadow: N.pinkL });
    for (let i = 0; i < 5; i++) S.at(0, 0, i * TAU / 5, 1, 1, () => S.cel([[0, -2], [-9, -9], [-8, -19], [-3, -22], [0, -18, 1], [3, -22], [8, -19], [9, -9]], N.pink, { line: S.L(2), depth: 2.6, shadow: N.pinkD, tension: 0.8 }));
    S.dot(0, 0, 5, GOLD, 1.8);
    S.hl([[-18, -16], [-11, -22]], 3, 0.85);
  };
  RELICF.shrine = (S, p) => {
    // Fruit Bowl: a bowl of grapes, two clementines and a banana
    S.stroke(bez3([-18, -8], [-26, -26], [-6, -32], [4, -12], 10), 8, '#f2d24a', { ow: 2.2 });
    [[-6, -2], [4, -10], [12, -2], [-14, 4], [6, 4]].forEach((q, i) => S.cel(circ(q[0] + 4, q[1] - 4, 7.4), i % 2 ? '#8a5fd0' : '#a77bff', { line: S.L(2), depth: 2.2, shadow: '#5a3a9a' }));
    S.cel(circ(-6, 2, 10.5), '#ff9a2e', { line: S.L(2.4), depth: 3, shadow: N.orangeD }); S.cel(circ(15, 4, 9.6), '#ffab45', { line: S.L(2.4), depth: 3, shadow: N.orangeD });
    S.circle(-6, -7.6, 2, N.green); S.circle(15, -4, 2, N.green);
    rc(S, [[-32, 6], [32, 6], [26, 22], [14, 31], [-14, 31], [-26, 22]], '#fff3dc', { depth: 5, shadow: '#e2c394', tension: 0.7 });
    S.stroke([[-24, 16], [24, 16]], 4, p.base, { ow: 0 });
  };
  RELICF.sword = (S, p) => {
    // Practice Pad: a small round practice pad under two crossed wooden drumsticks (a thick butt, a shaft, a small egg-shaped bead on the tip: never a blade)
    S.cel(ell(0, 17, 30, 12.5, 0, 24), N.blackL, { line: S.L(2.6), depth: 3, shadow: N.black });
    S.cel(ell(0, 15, 25, 9.4, 0, 22), '#dcd6ec', { line: S.L(2), depth: 2.2, shadow: '#b4aad8' });
    const stick = (ang, wood) => S.at(0, 2, ang, 1, 1, () => {
      rc(S, poly([[-36, -5], [-36, 5], [20, 3.4], [20, -3.4]]), wood, { line: S.L(2.2), depth: 2.6, shadow: N.woodD, tension: 0.2 });
      S.cel(ell(-36, 0, 2.8, 5, 0, 10), wood, { line: S.L(2), depth: 1, shadow: N.woodD });
      S.cel(ell(27, 0, 9, 5.6, 0, 16), N.woodL, { line: S.L(2.2), depth: 2.2, shadow: N.woodD, hi: true });
      if (S.d) { S.ink([[-28, -1.4], [8, -0.6]], { w: 1, color: N.woodD }); S.ink([[-22, 2.2], [2, 1.6]], { w: 0.9, color: N.woodD, alpha: 0.7 }); }
    });
    stick(-2.34, N.wood);
    stick(-0.8, '#d99a5e');
  };
  RELICF.koi = (S, p) => {
    // Tote Bag: a teal tote bag printed with a tiny tote bag, a gem peeking out
    miniGem(S, -4, -22, 0.7, '#ff5fa2');
    S.stroke(tk.arcPts(0, -8, 14, 17, PI * 1.05, PI * 1.95, 10), 4.4, CREAM, { ow: 1.6 });
    rc(S, [[-27, -8], [27, -8], [31, 32], [-31, 32]], N.teal, { depth: 6, shadow: N.tealD, tension: 0.3 });
    S.cel(rr(-13, 6, 26, 21, 3), '#fff3dc', { line: S.L(1.8), depth: 1.8, shadow: '#ecd2a6', tension: 0.4 });
    S.stroke(tk.arcPts(0, 10, 5, 6, PI * 1.05, PI * 1.95, 6), 1.8, N.teal, { ow: 0 });
    S.cel(rr(-8, 11, 16, 12, 2), N.teal, { line: S.L(1.4), depth: 1.2, shadow: N.tealD, tension: 0.4 });
    S.hl([[-24, -2], [-25, 22]], 2.6, 0.5);
  };
  RELICF.mirror = (S, p) => {
    // Rhinestone Mic: a mic studded with coloured stones, coins bouncing off
    mic(S, -6, -10, 0.5, 1.12, { ball: N.chrome, handle: N.blackL, band: GOLD, r: 15, len: 36 });
    const stones = ['#ff5fa2', '#5fb4ff', '#3fcf6a', '#ffd84d', '#a77bff'];
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + 0.3, rr0 = i % 2 ? 8 : 4; S.dot(-6 + cos(a) * rr0 + 0, -10 + sin(a) * rr0, 2.7, stones[i % 5], 1); }
    [[22, -22, 7], [28, 6, 6]].forEach((c) => { S.cel(circ(c[0], c[1], c[2]), GOLD, { line: S.L(2), depth: 2, shadow: N.goldD }); S.ring(c[0], c[1], c[2] * 0.55, 1.2, N.goldD, 0.8); });
    S.spark(8, -30, 5.5, { color: '#ffffff' });
  };
  RELICF.star = (S, p) => {
    // Glitter Glasses: heart-shaped sunglasses with glittery frames
    S.stroke([[-6, -4], [0, -8], [6, -4]], 3.4, GOLD, { ow: 1.6, poly: true, step: 3 });
    [-1, 1].forEach((sx) => {
      const h = heart(sx * 17, -2, 17);
      S.die(h, 2, true);
      S.cel(h, '#5a2a7a', { line: S.L(3), depth: 5, shadow: '#2e1448', tension: 1 });
      S.g.save(); S.g.beginPath(); tk.trace(S.g, heart(sx * 17, -2, 17)); S.g.lineWidth = S.L(4); S.g.strokeStyle = N.pink; S.g.globalAlpha *= 0.9; S.g.stroke(); S.g.restore();
      S.hl([[sx * 17 - 9, -8], [sx * 17 - 5, -14]], 3, 0.8);
    });
    if (S.d) { [[-30, 2], [-24, 18], [24, 18], [30, 2], [-8, 14], [8, 14]].forEach((q, i) => S.circle(q[0], q[1], 1.6, i % 2 ? GOLD2 : '#ffffff')); }
    S.stroke([[-31, -6], [-38, -8]], 2.6, N.pink, { ow: 1 }); S.stroke([[31, -6], [38, -8]], 2.6, N.pink, { ow: 1 });
    S.spark(0, 28, 7, { color: GOLD }); S.spark(-30, -22, 5, { color: '#ffffff' }); S.spark(30, -24, 6, { color: GOLD2 });
  };
  RELICF.sun = (S, p) => {
    // Stage Light: a stage can light throwing a warm cone downward
    S.cel(poly([[-12, 4], [12, 4], [34, 38], [-34, 38]]), '#fff1b0', { line: false, depth: 0, shadow: false, tension: 0.2 });
    S.g.save(); S.g.globalAlpha *= 0.7; S.fill(poly([[-12, 4], [12, 4], [34, 38], [-34, 38]]), '#fff6c8'); S.g.restore();
    S.stroke([[-12, 4], [-34, 38]], 1.6, GOLD2, { ow: 0, alpha: 0.9 }); S.stroke([[12, 4], [34, 38]], 1.6, GOLD2, { ow: 0, alpha: 0.9 });
    S.at(0, -14, 0, 1, 1, () => {
      bar(S, [[0, -22], [0, -12]], 4.4, N.chromeD, 1.4);
      rc(S, [[-14, -10], [14, -10], [18, 12], [-18, 12]], N.blackL, { depth: 4.6, shadow: N.black, tension: 0.3 });
      S.cel(ell(0, 12, 18, 4.4, 0, 14), '#fff1a8', { line: S.L(2.2), depth: 1.2, shadow: N.goldM });
      S.stroke([[-10, -2], [10, -2]], 2.4, p.base, { ow: 0 });
    });
    S.circle(-16, 28, 1.8, '#ffffff'); S.circle(10, 22, 1.6, GOLD2); S.circle(22, 33, 1.6, '#ffffff');
  };
  RELICF.geta = (S, p) => {
    // Roller Skates: one pastel roller skate with spinning wheels
    rc(S, rr(-26, 12, 56, 6, 3), N.chromeD, { depth: 1.6, shadow: N.blackL, tension: 0.5 });
    rc(S, [[-24, 12], [-26, -14], [-14, -26], [-2, -22], [0, -8], [12, -2], [28, 4], [30, 12]], '#ffb8dc', { depth: 5, shadow: '#e07bb0', tension: 0.5 });
    rc(S, [[-26, -4], [-4, -4], [-4, 12], [-24, 12]], '#e6d9ff', { depth: 2.2, shadow: '#b9a6e8', tension: 0.3 });
    [[-1, -12, 7, -8], [3, -8, 11, -4], [7, -4, 15, 0]].forEach((l) => S.stroke([[l[0], l[1]], [l[2], l[3]]], 2.4, CREAM, { ow: 0 }));
    [[-18, 24], [-4, 24], [14, 24], [26, 24]].forEach((w, i) => { if (i === 1 || i === 2) return; S.cel(circ(w[0], w[1], 7), CREAM, { line: S.L(2.4), depth: 2, shadow: N.creamD }); S.circle(w[0], w[1], 2.4, N.pink); });
    [[-6, 24], [12, 24]].forEach((w) => { S.cel(circ(w[0], w[1], 7), CREAM, { line: S.L(2.4), depth: 2, shadow: N.creamD }); S.circle(w[0], w[1], 2.4, N.pink); });
    bar(S, [[-30, 20], [-36, 20]], 2.6, '#ffffff', 1); bar(S, [[-30, 27], [-37, 27]], 2.6, '#ffffff', 1);
    rc(S, circ(31, 14, 3), N.pink, { depth: 1, shadow: N.pinkD });
  };
  RELICF.candle = (S, p) => {
    // Fairy Lights: a mic stand wrapped in a string of warm bulbs
    S.stroke([[0, 22], [-16, 36]], 4, N.blackL, { ow: 1.4 }); S.stroke([[0, 22], [16, 36]], 4, N.blackL, { ow: 1.4 }); S.stroke([[0, 22], [0, 38]], 4, N.blackL, { ow: 1.4 });
    S.stroke([[0, 24], [0, -14]], 5, N.blackL, { ow: 1.8 });
    mic(S, 0, -24, 0, 0.78, { ball: N.chrome, handle: N.black, band: N.pink, r: 13, len: 12 });
    const wire = []; for (let i = 0; i <= 16; i++) { const u = i / 16; wire.push([sin(u * TAU * 2.2) * 14, 22 - u * 46]); }
    S.stroke(wire, 2, '#3a3a50', { ow: 0.6 });
    [0.12, 0.3, 0.46, 0.62, 0.78, 0.92].forEach((u, i) => { const x = sin(u * TAU * 2.2) * 14, y = 22 - u * 46; S.glow(x, y, 9, '#ffd070', 0.6); S.dot(x, y, 3.4, i % 2 ? '#fff1a8' : '#ffd84d', 1.4); });
  };
  RELICF.drum = (S, p) => {
    // Floor Tom: a deep floor tom on three legs, a stick mid-hit
    [-22, 0, 22].forEach((x, i) => S.stroke([[x * 0.8, 10], [x * 1.3, 36]], 4.4, N.chrome, { ow: 1.6 }));
    rc(S, [[-26, -2], [26, -2], [26, 24], [-26, 24]], p.base, { depth: 5, shadow: p.shade, tension: 0.2 });
    [-14, 0, 14].forEach((x) => S.stroke([[x, 3], [x, 19]], 2.2, p.dark, { ow: 0, alpha: 0.9 }));
    [-22, 22].forEach((x) => { rc(S, rr(x - 3, 6, 6, 10, 2), N.chrome, { line: S.L(1.8), depth: 1, shadow: N.chromeD, tension: 0.5 }); });
    S.cel(ell(0, -2, 27, 9, 0, 20), CREAM, { line: S.L(2.6), depth: 2.6, shadow: N.creamD });
    S.ring(0, -2, 27, 2.2, N.chrome);
    S.at(14, -22, 0.9, 1, 1, () => { S.stroke([[0, -2], [0, -26]], 4.4, '#f1e2c4', { ow: 1.6 }); S.cel(circ(0, 0, 3.2), '#f1e2c4', { line: S.L(1.8), depth: 1, shadow: '#c9a56a' }); });
    S.spark(-4, -12, S.d ? 5 : 0, { color: GOLD2, glow: 0 });
    soundArcs(S, 4, -4, 8, 1, -2.4, -0.8, GOLD, 3, 7);
  };
  RELICF.skull = (S, p) => {
    // Bag of Grapes: a paper bag spilling a bunch of purple grapes
    [[-4, -2], [8, 4], [-2, 10], [12, 16], [4, 22], [-8, 16], [18, 6]].forEach((q, i) => S.cel(circ(q[0] + 8, q[1] - 6, 7.2), i % 2 ? '#8a5fd0' : '#a77bff', { line: S.L(2), depth: 2.2, shadow: '#5a3a9a' }));
    S.cel([[10, -22], [20, -30], [26, -22], [18, -16]], N.green, { line: S.L(2), depth: 2, shadow: N.greenD, tension: 0.8 });
    S.stroke([[8, -14], [10, -22]], 3, N.woodD, { ow: 1.2 });
    rc(S, [[-30, -4], [-18, -12], [-6, -4], [-8, 32], [-28, 32]], '#e8c88a', { depth: 4.4, shadow: '#b9945a', tension: 0.3 });
    S.stroke([[-30, -4], [-22, 0], [-14, -6], [-6, -4]], 2, '#b9945a', { ow: 0 });
    S.stroke([[-24, 8], [-14, 8]], 1.6, '#b9945a', { ow: 0 });
    S.spark(26, 26, 5, { color: '#ffffff' });
  };
  RELICF.bow = (S, p) => {
    // Megaphone: a white and orange megaphone with three sound arcs
    soundArcs(S, 4, -2, 17, 3, -0.7, 0.7, CREAM, 3.2, 8);
    S.at(-12, 6, -0.2, 1, 1, () => {
      rc(S, [[-24, -7], [-8, -10], [16, -22], [16, 22], [-8, 10], [-24, 7]], CREAM, { depth: 5, shadow: N.creamD, tension: 0.25 });
      rc(S, rr(10, -24, 9, 48, 3), N.orange, { depth: 2.4, shadow: N.orangeD, tension: 0.5 });
      rc(S, rr(-30, -9, 9, 18, 3), N.blackL, { depth: 2, shadow: N.black, tension: 0.5 });
      rc(S, rr(-14, 8, 8, 17, 3), N.orange, { depth: 2, shadow: N.orangeD, tension: 0.4 });
    });
  };
  RELICF.snowflake = (S, p) => {
    // Instant Camera: a chunky instant camera with a photo sliding out, a flash star
    S.at(8, -24, 0.12, 1, 1, () => { rc(S, rr(-12, -8, 24, 28, 2), '#ffffff', { line: S.L(2), depth: 2, shadow: '#d8dce8', tension: 0.3 }); S.fill(rect(-9, -5, 18, 16), '#7fd6ff'); S.fill(poly([[-9, 11], [-3, 2], [3, 8], [9, 1], [9, 11]]), '#3fcf6a'); S.circle(5, -1, 2.4, GOLD); });
    rc(S, rr(-30, -12, 60, 42, 8), '#f4e9ff', { depth: 5.6, shadow: '#c3b0e6', tension: 0.55 });
    S.stroke([[-30, 6], [30, 6]], 4.4, p.base, { ow: 0 });
    S.cel(circ(2, 12, 14.5), N.blackL, { line: S.L(3), depth: 3, shadow: N.black }); S.cel(circ(2, 12, 8.6), '#5fb4ff', { line: S.L(2), depth: 2, shadow: '#2f6fd0' }); S.spark(-1, 9, S.d ? 4.4 : 0, { color: '#ffffff', glow: 0 });
    rc(S, rr(-26, -8, 14, 8, 2), N.chrome, { depth: 1.4, shadow: N.chromeD, tension: 0.5 });
    S.spark(-30, -20, 7, { color: GOLD }); S.spark(-22, -2, 3.4, { color: '#ffffff', glow: 0 });
  };
  RELICF.katana_guard = (S, p) => {
    // Heart Necklace: a fine chain with a small gold heart, a pink glow
    S.glow(0, 12, 34, N.pink, 0.5);
    S.stroke(bez3([-30, -30], [-26, 10], [-10, 2], [0, -4], 12), 2.6, '#f0e8f8', { ow: 1.2, step: 3 }); S.stroke(bez3([30, -30], [26, 10], [10, 2], [0, -4], 12), 2.6, '#f0e8f8', { ow: 1.2, step: 3 });
    bar(S, [[0, -6], [0, 0]], 3, GOLD, 1.2);
    S.cel(heart(0, 17, 21), GOLD, { line: S.L(3), depth: 5, shadow: N.goldD });
    S.hl([[-11, 8], [-7, 3]], 3.2, 0.9);
    S.spark(20, 0, 6, { color: N.pinkL }); S.spark(-22, 28, 5, { color: '#ffffff' });
  };
  RELICF.eye = (S, p) => {
    // Smiley Tee: a folded black tee with a big orange smiley
    rc(S, [[-36, -14], [-18, -26], [-8, -22], [0, -16], [8, -22], [18, -26], [36, -14], [28, 2], [20, -2], [20, 32], [-20, 32], [-20, -2], [-28, 2]], '#3a3050', { depth: 5, shadow: '#1f1830', tension: 0.3 });
    S.stroke([[-8, -22], [0, -15], [8, -22]], 3, '#5a5078', { ow: 0 });
    S.cel(circ(0, 9, 14), N.orange, { line: S.L(2.4), depth: 3.4, shadow: N.orangeD });
    S.circle(-5, 5, 2, INK); S.circle(5, 5, 2, INK); S.ink(bez2([-7, 12], [0, 20], [7, 12], 6), { w: 2.4, color: INK, taper: 0.2, wobble: 0 });
    if (S.d) S.stroke([[-32, -10], [-24, -4]], 1.6, '#5a5078', { ow: 0 });
  };
  RELICF.moon = (S, p) => {
    // Sampler Pad: a square drum pad with nine pads, one lit blue
    rc(S, rr(-32, -32, 64, 64, 8), N.blackL, { depth: 6, shadow: N.black, tension: 0.6 });
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      const lit = i === 2 && j === 0, x = -22 + i * 15.6, y = -22 + j * 15.6;
      if (lit) S.glow(x + 7, y + 7, 17, '#5fb4ff', 0.7);
      rc(S, rr(x, y, 14, 14, 3.4), lit ? '#5fb4ff' : '#8a80b0', { line: S.L(2), depth: 2, shadow: lit ? '#2f6fd0' : '#5a5078', tension: 0.55 });
    }
    S.hl([[10, -20], [16, -20]], 2.2, 0.9);
  };
  RELICF.bolt = (S, p) => {
    // Subwoofer: a boxy speaker with one huge cone and orange ripples
    rc(S, rr(-27, -30, 54, 62, 6), N.blackL, { depth: 5, shadow: N.black, tension: 0.5 });
    S.dot(-19, -22, 2.4, N.chrome, 1.2); S.dot(19, -22, 2.4, N.chrome, 1.2); S.dot(-19, 24, 2.4, N.chrome, 1.2); S.dot(19, 24, 2.4, N.chrome, 1.2);
    S.cel(circ(0, 0, 22), N.black, { line: S.L(2.6), depth: 4, shadow: N.blackD });
    S.ring(0, 0, 17, 3.4, N.chromeD); S.cel(circ(0, 0, 8.6), N.chrome, { line: S.L(2.2), depth: 2, shadow: N.chromeD });
    soundArcs(S, 0, 0, 30, 1, -0.5, 0.5, N.orange, 3.6); soundArcs(S, 0, 0, 30, 1, PI - 0.5, PI + 0.5, N.orange, 3.6);
    if (S.d) { soundArcs(S, 0, 0, 37, 1, -0.4, 0.4, N.orange, 3); soundArcs(S, 0, 0, 37, 1, PI - 0.4, PI + 0.4, N.orange, 3); }
  };

  // ---------------------------------------------------------------------------------------------------------------
  // the 12 rare Charms (the shared icon ids come first; the second Charm of a shared id is in RELIC_OWN below)
  // ---------------------------------------------------------------------------------------------------------------
  // a lanyard: two teal straps meeting in a clip
  const lanyard = (S, col) => { bar(S, [[-19, -38], [-3, -13]], 7, col, 1.6); bar(S, [[19, -38], [3, -13]], 7, col, 1.6); rc(S, rr(-6, -17, 12, 8, 2.4), N.chrome, { line: S.L(2), depth: 1.6, shadow: N.chromeD, tension: 0.5 }); };
  RELICF.key = (S, p) => {
    // Backstage Pass: a laminated pass on a teal lanyard, a big star and the words ALL AREAS
    lanyard(S, N.teal);
    rc(S, rr(-22, -10, 44, 48, 5), '#ffffff', { depth: 4.4, shadow: '#d3dae8', tension: 0.5 });
    rc(S, rr(-22, -10, 44, 11, 4), N.teal, { depth: 1.6, shadow: N.tealD, tension: 0.5 });
    rc(S, rr(-5, -7, 10, 4, 2), N.blackL, { line: S.L(1.4), depth: 0, shadow: false, tension: 0.5 });
    S.cel(poly(star5(0, 10, 10.6, -PI / 2)), GOLD, { line: S.L(2), depth: 2.2, shadow: N.goldD, tension: 0.2 });
    S.text('ALL', 0, 23.4, S.d ? 8 : 9, { fill: N.blackL, stroke: '#ffffff', strokeW: 1.4 });
    S.text('AREAS', 0, 32.4, S.d ? 8 : 9, { fill: N.blackL, stroke: '#ffffff', strokeW: 1.4 });
    S.hl([[-18, -1], [-10, -1]], 2, 0.7);
  };
  RELICF.ribbon = (S, p) => {
    // The Viral Clip: a phone showing a play button, little hearts floating up (no numbers, no logo)
    rc(S, rr(-18, -22, 36, 60, 7), N.blackL, { depth: 4.6, shadow: N.black, tension: 0.6 });
    rc(S, rr(-14, -17, 28, 47, 3.4), '#8a5fe8', { line: S.L(1.8), depth: 3, shadow: '#5a3a9a', tension: 0.4 });
    S.cel(circ(0, 6, 10.4), CREAM, { line: S.L(2), depth: 2, shadow: N.creamD });
    S.cel(poly([[-3.4, 0.4], [-3.4, 11.6], [6, 6]]), '#8a5fe8', { line: S.L(1.4), depth: 0, shadow: false, tension: 0.2 });
    S.stroke([[-9, 26], [9, 26]], 2.6, '#cdb0ff', { ow: 0 });
    S.stroke([[-4, 36], [4, 36]], 2, N.chromeD, { ow: 0 });
    S.cel(heart(24, -18, 6.4), N.pink, { line: S.L(1.8), depth: 1.4, shadow: N.pinkD }); S.cel(heart(14, -33, 5), N.red, { line: S.L(1.6), depth: 1.2, shadow: N.redD }); S.cel(heart(-22, -30, 4.6), N.pinkL, { line: S.L(1.6), depth: 1, shadow: N.pink });
  };
  RELICF.feather = (S, p) => {
    // Spare Mic: a second mic with a heart sticker, a small sparkle
    mic(S, 6, -12, 0.58, 1.1, { ball: N.chrome, handle: N.blackL, band: p.base, r: 14, len: 36 });
    S.at(-16, 22, 0.58, 1, 1, () => S.cel(heart(0, 0, 7), N.pink, { line: S.L(1.8), depth: 1.4, shadow: N.pinkD }));
    S.spark(-24, -18, 7, { color: '#ffffff' }); S.spark(26, 18, 5, { color: p.glow });
  };
  RELICF.crown = (S, p) => {
    // Unicorn Headband: a pastel headband with a rainbow mane and a little gold cone on top
    S.stroke(tk.arcPts(0, 22, 32, 30, PI * 1.08, PI * 1.92, 12), 7.4, '#ffc2dc', { ow: 2.2 });
    const mane = ['#ff7eb6', '#ffb347', '#ffe56a', '#7be39a', '#7fd6ff', '#b794ff'];
    mane.forEach((c, i) => { const a = PI * 1.2 + i * 0.1 * PI * 1.1; const x = cos(a) * 30, y = 22 + sin(a) * 28; S.cel([[x, y - 2], [x - 5, y + 8], [x - 3, y + 21], [x + 1, y + 13], [x + 5, y + 7]], c, { line: S.L(2), depth: 2, shadow: wshade(c), tension: 0.8 }); });
    rc(S, poly([[-7, -8], [7, -8], [1, -35]]), GOLD, { depth: 3, shadow: N.goldD, tension: 0.2 });
    S.stroke([[-5, -14], [5, -18]], 1.8, N.goldD, { ow: 0 }); S.stroke([[-3, -23], [3, -26]], 1.6, N.goldD, { ow: 0 });
    S.spark(22, -22, 6, { color: '#ffffff' }); S.spark(-24, -14, 5, { color: GOLD2 });
  };
  RELICF.hourglass = (S, p) => {
    // Three-Bar Loop: a small pedal with one big footswitch and a three-dot loop ring
    rc(S, rr(-26, -32, 52, 68, 6), p.base, { depth: 6, shadow: p.shade, tension: 0.5 });
    S.stroke(tk.arcPts(0, -14, 14, 14, 0, TAU, 16), 2.4, N.cream, { ow: 0, alpha: 0.9 });
    [-PI * 0.85, -PI * 0.5, -PI * 0.15].forEach((a, i) => S.dot(cos(a) * 14, -14 + sin(a) * 14, 3.6, i === 0 ? N.red : '#fff1a8', 1.4));
    S.cel(circ(0, 18, 12.4), N.chrome, { line: S.L(2.8), depth: 3.6, shadow: N.chromeD });
    S.cel(circ(0, 18, 7.4), N.chromeD, { line: S.L(2), depth: 1.6, shadow: N.blackL });
    S.dot(-19, 4, 1.8, N.blackL, 1); S.dot(19, 4, 1.8, N.blackL, 1);
    S.hl([[-8, 12], [-5, 8]], 2.4, 0.8);
  };
  RELICF.lotus = (S, p) => {
    // Spring Reverb: a long violet tank with a coiled spring inside, wavy lines
    rc(S, rr(-34, -8, 68, 30, 5), p.base, { depth: 5, shadow: p.shade, tension: 0.5 });
    rc(S, rr(-28, -3, 56, 20, 3), N.black, { line: S.L(2), depth: 2, shadow: N.blackD, tension: 0.5 });
    const coil = []; for (let i = 0; i <= 22; i++) { const u = i / 22; coil.push([-25 + u * 50, 7 + sin(u * TAU * 5) * 6]); }
    S.stroke(coil, 3.2, N.chrome, { ow: 1 });
    S.stroke(bez3([-26, -18], [-18, -26], [-8, -10], [0, -18], 8).concat(bez3([0, -18], [8, -26], [18, -10], [26, -18], 8)), 3.2, CREAM, { ow: 1.2 });
    if (S.d) S.stroke(bez3([-26, -30], [-18, -37], [-8, -23], [0, -30], 8).concat(bez3([0, -30], [8, -37], [18, -23], [26, -30], 8)), 2.4, p.glow, { ow: 0, alpha: 0.8 });
    S.dot(-26, 28, 3.2, N.chrome, 1.4); S.dot(26, 28, 3.2, N.chrome, 1.4);
  };
  RELICF.dragon = (S, p) => {
    // Gold Record: a gold disc in a frame with a little star label
    rc(S, rr(-33, -33, 66, 66, 5), p.base, { depth: 6, shadow: p.shade, tension: 0.4 });
    rc(S, rr(-27, -27, 54, 54, 3), '#fff3dc', { line: S.L(2), depth: 3, shadow: '#e2c394', tension: 0.4 });
    S.cel(circ(0, 0, 22), GOLD, { line: S.L(2.6), depth: 4.4, shadow: N.goldD });
    [17, 13, 9.4].forEach((r) => S.ring(0, 0, r, 1, N.goldD, 0.8));
    S.cel(circ(0, 0, 7.6), CREAM, { line: S.L(1.8), depth: 1.4, shadow: N.creamD });
    S.cel(poly(star5(0, 0.6, 4.6, -PI / 2)), N.pink, { line: S.L(1.2), depth: 0.6, shadow: N.pinkD, tension: 0.2 });
    S.hl([[-15, -10], [-8, -17]], 3, 0.9);
    S.spark(25, -24, 5, { color: GOLD2, glow: 0 });
  };
  RELICF.tiger = (S, p) => {
    // Bass Cabinet: a tall cabinet of eight speaker cones, orange rumble lines on the floor
    S.stroke([[-34, 36], [34, 36]], 3, N.orange, { ow: 1 });
    rc(S, rr(-22, -36, 44, 70, 4), N.blackL, { depth: 5, shadow: N.black, tension: 0.4 });
    for (let j = 0; j < 4; j++) for (let i = 0; i < 2; i++) cone(S, -9.6 + i * 19.2, -25 + j * 16.6, 7.4, N.black);
    S.stroke([[-30, 30], [-30, 22]], 3, N.orange, { ow: 1 }); S.stroke([[30, 30], [30, 20]], 3, N.orange, { ow: 1 }); S.stroke([[-36, 30], [-36, 26]], 2.6, N.orange, { ow: 0.8 }); S.stroke([[36, 30], [36, 24]], 2.6, N.orange, { ow: 0.8 });
    S.dot(-17, 30, 1.8, N.chrome, 1); S.dot(17, 30, 1.8, N.chrome, 1);
  };
  RELICF.fox = (S, p) => {
    // Crew Lanyard: a teal lanyard with a card reading CREW and a tiny star
    lanyard(S, N.teal);
    rc(S, rr(-22, -8, 44, 44, 5), '#ffffff', { depth: 4, shadow: '#d3dae8', tension: 0.5 });
    rc(S, rr(-22, 10, 44, 16, 2), N.teal, { depth: 1.4, shadow: N.tealD, tension: 0.3 });
    S.text('CREW', 0, 18.4, S.d ? 11 : 12, { fill: CREAM, stroke: N.blackL, strokeW: 2 });
    S.cel(circ(0, -1, 7), N.orange, { line: S.L(1.8), depth: 1.4, shadow: N.orangeD });
    S.cel(poly(star5(14, 30, 4.4, -PI / 2)), GOLD, { line: S.L(1.4), depth: 0.6, shadow: N.goldD, tension: 0.2 });
  };
  RELICF.seal = (S, p) => {
    // Sticker Sheet: a sheet of stickers (blossom, smiley, goat, star), one peeling
    S.at(0, 0, -0.1, 1, 1, () => {
      rc(S, rr(-30, -32, 60, 66, 4), '#f3efff', { depth: 4, shadow: '#cfc6ea', tension: 0.4 });
      S.die(circ(-12, -14, 10.4), 1.6, true); miniBlossom(S, -12, -14, 11, N.pink);
      S.die(circ(13, -14, 10), 1.6, true); smiley(S, 13, -14, 9.6, '#ffe45e');
      // a goat sticker: a cream round face with two little horns and a beard
      S.die(circ(-12, 12, 10), 1.6, true);
      S.cel([[-17, 2], [-20, -4], [-13, 1]], CREAM, { line: S.L(1.6), depth: 0, shadow: false, tension: 0.3 }); S.cel([[-7, 2], [-4, -4], [-11, 1]], CREAM, { line: S.L(1.6), depth: 0, shadow: false, tension: 0.3 });
      S.cel(circ(-12, 12, 9), CREAM, { line: S.L(1.8), depth: 1.6, shadow: N.creamD });
      S.circle(-15.4, 10, 1.4, INK); S.circle(-8.6, 10, 1.4, INK); S.cel(poly([[-14, 18], [-10, 18], [-12, 25]]), CREAM, { line: S.L(1.4), depth: 0, shadow: false, tension: 0.2 });
      // the peeling star: a curl of backing shows under it
      S.cel(poly([[22, 14], [32, 24], [20, 26]]), '#cfc6ea', { line: S.L(1.6), depth: 0, shadow: false, tension: 0.2 });
      S.cel(poly(star5(14, 13, 11, -PI / 2)), GOLD, { line: S.L(2), depth: 2, shadow: N.goldD, tension: 0.2 });
    });
  };
  RELICF.bridge = (S, p) => {
    // Golden Ticket: a shiny gold ticket stub with a star punched through
    S.at(0, 2, -0.18, 1, 1, () => {
      const t = [[-33, -20], [33, -20], [33, -8], [29, -4], [33, 0], [33, 20], [-33, 20], [-33, 0], [-29, -4], [-33, -8]];
      rc(S, poly(t), GOLD, { depth: 6, shadow: N.goldD, tension: 0.2 });
      S.stroke([[18, -17], [18, 17]], 1.8, N.goldD, { ow: 0, alpha: 0.7 });
      if (S.d) for (let y = -14; y <= 14; y += 7) S.circle(18, y, 1.3, N.goldD);
      S.cel(poly(star5(-6, 0, 13, -PI / 2)), p.plate, { line: S.L(2.2), depth: 0, shadow: false, tension: 0.2 });
      S.hl([[-28, -14], [-14, -14]], 3, 0.9);
      S.stroke([[24, -10], [29, -10]], 2, N.goldD, { ow: 0 }); S.stroke([[24, 10], [29, 10]], 2, N.goldD, { ow: 0 });
    });
    S.spark(26, -22, 7, { color: '#ffffff' }); S.spark(-28, 22, 5, { color: GOLD2 });
  };
  RELICF.maple = (S, p) => {
    // Glowing Phone: a phone glowing blue, a feed of little cards sliding up
    S.glow(0, 0, 44, '#5fb4ff', 0.55);
    rc(S, rr(-19, -34, 38, 68, 7), N.blackL, { depth: 4.6, shadow: N.black, tension: 0.6 });
    rc(S, rr(-15, -28, 30, 56, 3.4), '#3a8be8', { line: S.L(1.8), depth: 2, shadow: '#2459b8', tension: 0.4 });
    [[-22, '#fff3dc', 1], [-8, '#ffe3f1', 1], [6, '#d9fff4', 1]].forEach((c, i) => { rc(S, rr(-12, c[0] + 1, 24, 11.4, 2.4), c[1], { line: S.L(1.6), depth: 1.2, shadow: wshade(c[1], 0.1), tension: 0.4 }); S.circle(-7, c[0] + 6.6, 2.4, i === 1 ? N.pink : i === 2 ? N.green : p.base); S.stroke([[-2, c[0] + 5], [8, c[0] + 5]], 1.6, N.inkL, { ow: 0, alpha: 0.7 }); });
    S.stroke([[14, 26], [14, 12]], 2.4, '#ffffff', { ow: 0, alpha: 0.9 }); S.stroke([[10, 16], [14, 11], [18, 16]], 2.4, '#ffffff', { ow: 0, alpha: 0.9, poly: true, step: 3 });
    S.hl([[-14, -24], [-14, -12]], 2.4, 0.5);
  };
  RELICF.gourd = (S, p) => {
    // Extra Spicy Noodles: a steaming red noodle bowl with chopsticks and three little flames
    [[-14, -26, 7], [2, -34, 9], [17, -27, 7]].forEach((f, i) => S.cel([[f[0], f[1] - f[2] * 1.6, 1], [f[0] + f[2] * 0.8, f[1] - f[2] * 0.4], [f[0] + f[2] * 0.5, f[1] + f[2] * 0.7], [f[0] - f[2] * 0.5, f[1] + f[2] * 0.7], [f[0] - f[2] * 0.8, f[1] - f[2] * 0.4]], i === 1 ? '#ffb02a' : '#ff8a3d', { line: S.L(2), depth: 2, shadow: '#e8552a', tension: 0.9 }));
    S.fill(ell(0, 2, 24, 8.6, 0, 18), '#f2d28a');
    for (let i = -3; i <= 3; i++) S.stroke(bez3([i * 6, -14], [i * 6 + 6, -8], [i * 6 - 6, -2], [i * 6, 6], 8), 3, '#f2d28a', { ow: 1.2 });
    S.at(0, 0, 0, 1, 1, () => { S.stroke([[8, -34], [24, 8]], 3.4, '#f1e2c4', { ow: 1.4 }); S.stroke([[17, -36], [27, 6]], 3.4, '#e8c88a', { ow: 1.4 }); });
    rc(S, [[-30, 6], [30, 6], [24, 24], [12, 34], [-12, 34], [-24, 24]], N.red, { depth: 5, shadow: N.redD, tension: 0.6 });
    S.cel(ell(0, 6, 30, 7, 0, 22), CREAM, { line: S.L(2.4), depth: 1.6, shadow: N.creamD });
    S.stroke([[-18, 22], [18, 22]], 3, GOLD, { ow: 0 });
    curl(S, -2, -12, 12, CREAM, 2.4);
  };

  // ---------------------------------------------------------------------------------------------------------------
  // the 6 Headliner (boss) Charms that share an icon id with an earlier Charm, and the shared ids of Merch: the second Charm of a shared icon id
  // gets its own drawing here, so all 66 Charms look different
  // ---------------------------------------------------------------------------------------------------------------
  RELIC_OWN.formation_scroll = (S, p) => {
    // Stage Markers: two crosses of coloured tape on the floor, one pink, one green
    S.g.save(); S.g.globalAlpha *= 0.55; S.cel(ell(0, 6, 36, 28, 0, 22), '#3a3060', { line: false, depth: 0, shadow: false }); S.g.restore();
    const cross = (x, y, a, col, sh) => S.at(x, y, a, 1, 1, () => {
      S.stroke([[-17, 0], [17, 0]], 8.4, col, { ow: 2 });
      S.stroke([[0, -17], [0, 17]], 8.4, col, { ow: 2 });
      S.stroke([[-17, 0], [17, 0]], 8.4, col, { ow: 0 });
      S.stroke([[-14, -2.4], [14, -2.4]], 1.6, '#ffffff', { ow: 0, alpha: 0.5 });
    });
    cross(-12, -10, 0.2, N.pink); cross(13, 14, -0.15, N.green);
    S.spark(24, -22, 5, { color: '#ffffff' });
  };
  RELIC_OWN.apothecary_jar = (S, p) => {
    // Post-Show Smoothie: a tall orange smoothie with a stripy straw
    S.at(5, -2, 0.12, 1, 1, () => { S.stroke([[0, -4], [0, -38]], 5.6, '#ffffff', { ow: 1.8 }); [[-30, -24], [-20, -14], [-10, -4]].forEach((l) => S.stroke([[-1.6, l[0]], [1.6, l[0] + 4]], 5.6, N.pink, { ow: 0 })); });
    rc(S, [[-17, -12], [17, -12], [13, 32], [-13, 32]], '#ff9a2e', { depth: 5, shadow: N.orangeD, tension: 0.2 });
    S.clip(poly([[-17, -12], [17, -12], [13, 32], [-13, 32]]), () => { S.fill(poly([[-20, -12], [20, -12], [20, -2], [-20, -2]]), '#ffe6b8', 1); });
    S.cel(ell(0, -12, 17, 4.6, 0, 14), '#ffd08a', { line: S.L(2.2), depth: 1, shadow: false });
    S.cel(circ(15, -12, 7.6), N.orange, { line: S.L(2), depth: 1.8, shadow: N.orangeD }); S.ring(15, -12, 4.4, 1.2, '#ffe6b8');
    S.hl([[-12, -2], [-10, 24]], 3, 0.7);
    if (S.d) { S.circle(-4, 10, 1.4, '#ffe6b8'); S.circle(4, 18, 1.2, '#ffe6b8'); }
  };
  RELIC_OWN.mirror_of_two_faces = (S, p) => {
    // Twin Mic Stand: one stand with a pink mic and a green mic on a Y bar
    S.stroke([[0, 26], [-16, 38]], 4.2, N.blackL, { ow: 1.4 }); S.stroke([[0, 26], [16, 38]], 4.2, N.blackL, { ow: 1.4 }); S.stroke([[0, 26], [0, 40]], 4.2, N.blackL, { ow: 1.4 });
    S.stroke([[0, 28], [0, 2]], 5, N.blackL, { ow: 1.8 });
    S.stroke([[0, 2], [-16, -8]], 4.6, N.blackL, { ow: 1.6 }); S.stroke([[0, 2], [16, -8]], 4.6, N.blackL, { ow: 1.6 });
    mic(S, -20, -22, -0.45, 0.7, { ball: N.chrome, handle: N.black, band: N.pink, r: 13, len: 14, grid: true });
    mic(S, 20, -22, 0.45, 0.7, { ball: N.chrome, handle: N.black, band: N.green, r: 13, len: 14, grid: true });
    S.spark(0, -32, 6, { color: GOLD });
  };
  RELIC_OWN.nightlong_inkwell = (S, p) => {
    // Green Mic: a round green mic in two cupped hands, sound rings popping out
    soundArcs(S, 0, -8, 25, 2, -2.35, -0.8, CREAM, 3.4, 8);
    S.cel(circ(0, -8, 17), N.green, { line: S.L(2.8), depth: 4.4, shadow: N.greenD });
    if (S.d) { S.clip(circ(0, -8, 16), () => { for (let i = -2; i <= 2; i++) { S.ink([[i * 7, -30], [i * 7, 16]], { w: 1.1, color: N.greenD, alpha: 0.6, taper: 0, wobble: 0 }); S.ink([[-20, -8 + i * 7], [20, -8 + i * 7]], { w: 1.1, color: N.greenD, alpha: 0.6, taper: 0, wobble: 0 }); } }); }
    S.hl([[-9, -16], [-4, -22]], 3, 0.8);
    [-1, 1].forEach((sx) => { S.cel([[sx * 3, 10], [sx * 24, 6], [sx * 31, 16], [sx * 22, 30], [sx * 6, 32], [sx * 2, 24]], N.skin, { line: S.L(2.6), depth: 3.4, shadow: N.skinD, tension: 0.85 }); S.stroke([[sx * 20, 12], [sx * 12, 14]], 1.6, N.skinD, { ow: 0 }); });
  };
  RELIC_OWN.tyrants_crown = (S, p) => {
    // Pitch Fixer: an opalescent pastel box with one perfect sine wave on its screen
    const g = S.g, box = rr(-33, -26, 66, 54, 8);
    S.die(box, 2.4, true);
    g.save(); g.beginPath(); tk.trace(g, box, 0, 0, 0.6); g.fillStyle = tk.lin(g, -33, -26, 33, 28, [[0, '#ffe3f1'], [0.35, '#f4f1fb'], [0.65, '#e6d9ff'], [1, '#d9fff4']]); g.fill(); g.lineWidth = S.L(2.8); g.strokeStyle = '#b3a8d8'; g.stroke(); g.restore();
    rc(S, rr(-26, -19, 52, 26, 4), '#1f1840', { line: S.L(2), depth: 2, shadow: '#0f0a28', tension: 0.5 });
    const wave = []; for (let i = 0; i <= 24; i++) { const u = i / 24; wave.push([-22 + u * 44, -6 + sin(u * TAU * 2) * 7]); }
    S.stroke(wave, 3.2, '#9ffbe0', { ow: 0 });
    S.stroke([[-22, -6], [22, -6]], 1, '#7a6cb8', { ow: 0, alpha: 0.6 });
    [-18, 0, 18].forEach((x, i) => S.cel(circ(x, 19, 4.6), i === 1 ? '#ffffff' : '#e6d9ff', { line: S.L(1.8), depth: 1, shadow: '#b3a8d8' }));
    S.clip(box, () => { S.fill(poly([[-36, 0], [-14, -30], [-4, -30], [-26, 4]]), '#ffffff', 0.5); });
  };
  RELIC_OWN.ironclad_tsuba = (S, p) => {
    // Flight Case: a black flight case with silver corners and sticker patches
    bar(S, tk.arcPts(0, -20, 10, 8, PI, TAU, 8), 4, N.chrome, 1.4);
    rc(S, rr(-33, -22, 66, 52, 4), '#45395e', { depth: 6, shadow: '#241c34', tension: 0.35 });
    [-22, 14].forEach((y) => S.stroke([[-31, y], [31, y]], 2.2, '#5f527c', { ow: 0 }));
    [[-33, -22, 1, 1], [33, -22, -1, 1], [-33, 30, 1, -1], [33, 30, -1, -1]].forEach((c) => S.cel(poly([[c[0], c[1]], [c[0] + c[2] * 13, c[1]], [c[0] + c[2] * 13, c[1] + c[3] * 4], [c[0] + c[2] * 4, c[1] + c[3] * 4], [c[0] + c[2] * 4, c[1] + c[3] * 13], [c[0], c[1] + c[3] * 13]]), N.chrome, { line: S.L(1.8), depth: 1.2, shadow: N.chromeD, tension: 0.2 }));
    [-12, 12].forEach((x) => rc(S, rr(x - 4, -6, 8, 9, 1.6), N.chrome, { line: S.L(1.8), depth: 1, shadow: N.chromeD, tension: 0.4 }));
    miniBlossom(S, -18, 20, 7); S.cel(poly(star5(2, 20, 6.6, -PI / 2)), GOLD, { line: S.L(1.6), depth: 1, shadow: N.goldD, tension: 0.2 }); smiley(S, 20, 18, 6.4, '#ffe45e');
    S.hl([[-26, -17], [-14, -17]], 2.2, 0.6);
  };
  RELIC_OWN.blood_moon_vow = (S, p) => {
    // Stage Pyro: two stage flame jets in orange and gold
    [[-15, 30, 1], [16, 30, 0.84]].forEach((f, i) => {
      const x = f[0], k = f[2];
      S.cel([[x, 28 - 58 * k, 1], [x + 10 * k, 28 - 40 * k], [x + 15 * k, 28 - 22 * k], [x + 9 * k, 28 - 6 * k], [x, 28 - 2], [x - 9 * k, 28 - 6 * k], [x - 15 * k, 28 - 22 * k], [x - 9 * k, 28 - 40 * k]], '#ff8a3d', { line: S.L(2.6), depth: 5, shadow: '#e8452a', tension: 0.85 });
      S.cel([[x, 28 - 44 * k, 1], [x + 6 * k, 28 - 28 * k], [x + 8 * k, 28 - 12 * k], [x, 28 - 6], [x - 8 * k, 28 - 12 * k], [x - 6 * k, 28 - 28 * k]], '#ffd84d', { line: S.L(2), depth: 3, shadow: '#f0a020', tension: 0.9 });
      S.cel([[x, 28 - 22 * k, 1], [x + 3 * k, 28 - 12 * k], [x, 28 - 7], [x - 3 * k, 28 - 12 * k]], '#fff8d8', { line: false, depth: 0, shadow: false, tension: 0.9 });
      rc(S, rr(x - 9, 27, 18, 9, 2.4), N.blackL, { depth: 1.8, shadow: N.black, tension: 0.5 });
      S.stroke([[x - 5, 31.5], [x + 5, 31.5]], 1.8, N.chromeD, { ow: 0 });
    });
    S.spark(0, -30, 6, { color: GOLD2 }); S.circle(-27, -2, 2, GOLD); S.circle(30, -8, 2.2, '#ff8a3d');
  };
  RELIC_OWN.pearl_satchel = (S, p) => {
    // Mystery Pin: a little paper envelope with a question mark and a sparkle
    S.at(0, 4, -0.1, 1, 1, () => {
      rc(S, rr(-28, -18, 56, 42, 3), '#fff3dc', { depth: 5, shadow: '#e2c394', tension: 0.3 });
      rc(S, poly([[-28, -18], [28, -18], [0, 6]]), '#f4e3c0', { depth: 3, shadow: '#d9b678', tension: 0.2 });
      S.cel(circ(0, 4, 9), p.base, { line: S.L(2.2), depth: 2.4, shadow: p.shade });
      S.stroke(bez3([-3, 1], [-3, -3], [3, -3], [3, 1], 6).concat(bez3([3, 1], [3, 4], [0, 4], [0, 6.4], 4)), 2.4, CREAM, { ow: 0, poly: true, step: 3 });
      S.circle(0, 9.4, 1.2, CREAM);
    });
    S.spark(24, -22, 8, { color: '#ffffff' }); S.spark(-26, -20, 5, { color: GOLD2 });
  };

  // Charm spec: a Charm id (def.art gives the icon id and the palette) or a bare LISTS.relicIcons id (the palette of the first Charm that uses it)
  let ICON_PAL = null;
  function iconPalette(motif) {
    if (!ICON_PAL) { ICON_PAL = {}; Object.keys(DATA.relics || {}).forEach((rid) => { const a = DATA.relics[rid].art; if (a && a.m && !ICON_PAL[a.m]) ICON_PAL[a.m] = a.c; }); }
    return ICON_PAL[motif] || 'gold';
  }
  function relicSpec(id, o) {
    const def = DATA.relics && DATA.relics[id];
    let motif, pname, rarity, own = null;
    if (def) { motif = def.art && def.art.m; pname = def.art && def.art.c; rarity = def.rarity; own = RELIC_OWN[id] || null; }
    else if (L.relicIcons.indexOf(id) >= 0) { motif = id; pname = iconPalette(id); rarity = 'common'; }
    else return null;
    if (!own && !RELICF[motif]) motif = 'seal';
    const drawObject = own || RELICF[motif];
    const cHex = colorOpt(o && o.color);
    const pl = cHex ? objPal(pname, cHex) : objPal(pname || 'gold');
    const rare = rarity === 'rare' || rarity === 'boss' || rarity === 'shop';
    return {
      key: 'relic|' + (own ? id : motif) + '|' + (pname || 'gold') + '|' + (rarity || 'common'), glow: pl.base,
      render(S, oo) { const pp = colorOpt(oo && oo.color) ? objPal(pname, colorOpt(oo.color)) : pl; relicPlate(S, pp, rarity); S.at(0, 1, 0, 1, 1, () => drawObject(S, pp)); },
      live: rare ? (ctx, x, y, size, t) => {
        // a slow glint crawling across the top-right corner of a rare plate
        const w = 0.5 + 0.5 * sin(t * 1.6 + (tk.seed('rg', own ? id : motif) & 255) / 30);
        if (w > 0.4) tk.sparkle(ctx, x + size * 0.32, y - size * 0.32, max(1.6, size * 0.07 * w), { color: '#ffffff', alpha: w, glow: 0.35 });
      } : undefined,
    };
  }
  REG.relic = { ids: L.relicIcons.concat(Object.keys(DATA.relics || {}).filter((k) => L.relicIcons.indexOf(k) < 0)), resolve: relicSpec };
  ART.icon.palettes = (motif) => iconPalette(motif);

  // ---------------------------------------------------------------------------------------------------------------
  // MOTIF: any LISTS.motifs id as a standalone round sticker: the card illustrator's own drawing (ART.card.motif) on a candy disc with a cream rim
  // ---------------------------------------------------------------------------------------------------------------
  const MOTIF_PAL = { slash: 'rose', cross_slash: 'crimson', thrust: 'amber', crescent: 'moon', iai: 'ink', petals: 'rose', bloom: 'rose', petal_storm: 'rose', wind: 'jade', shield: 'azure', barrier: 'indigo', talisman: 'moon', lotus: 'jade', moon: 'moon', sun: 'crimson', star: 'gold', lightning: 'gold', thunder_fist: 'amber', chain_lightning: 'azure', fire: 'crimson', flame_orb: 'amber', ice: 'azure', ink_splash: 'violet', ink_wave: 'indigo', brush_stroke: 'ink', calligraphy: 'gold', scroll: 'amber', eye: 'violet', mask: 'ink', fan: 'rose', bell: 'gold', lantern: 'amber', koi: 'teal', dragon: 'jade', tiger: 'amber', crane: 'azure', fox: 'crimson', web: 'ash', thorns: 'jade', poison_bloom: 'violet', skull: 'ash', heal_light: 'jade', spirit_orb: 'moon', torii: 'crimson', mirror: 'gold', sword_rain: 'azure', meteor: 'crimson', wave: 'teal', tornado: 'jade', quake: 'amber', fist: 'crimson', kick: 'amber', arrow: 'crimson', coin: 'gold', key: 'jade', book: 'teal', quill: 'moon', void: 'ink', sigil: 'violet' };
  function motifSpec(id, o) {
    if (L.motifs.indexOf(id) < 0) return null;
    const named = o && typeof o.color === 'string' && tk.fams[o.color] ? o.color : null;
    const pn = named || MOTIF_PAL[id] || 'ash', f = famOf(pn), t = tone(f.base);
    return {
      key: 'motif|' + id + '|' + pn, glow: f.base,
      render(S) {
        const g = S.g;
        S.die(circ(0, 0, 43), 4.4);
        S.cel(circ(0, 0, 43), f.base, { line: S.L(3.2), depth: 8.5, shadow: t.shade });
        S.clip(circ(0, 0, 38), () => {
          S.fill(circ(0, 0, 38), t.pale);
          S.fill(circ(0, 0, 38), f.light, 0.5);
          if (S.d) S.glow(4, -8, 36, t.glow, 0.3);
          if (ART.card && typeof ART.card.motif === 'function' && ART.has('motif', id)) {
            g.save(); g.scale(100 / S.size, 100 / S.size);
            ART.card.motif(g, id, 0, 1, S.size * 0.92, pn, undefined);
            g.restore();
          } else S.spark(0, 0, 20, { color: CREAM });
        });
        S.g.save(); S.g.beginPath(); S.g.arc(0, 0, 38.5, 0, TAU); S.g.strokeStyle = tk.rgba(CREAM, 0.95); S.g.lineWidth = S.T(2.2); S.g.stroke(); S.g.restore();
        if (S.d) S.gloss(0, 0, 33, -PI * 0.5, -PI * 0.2, 2.6, 0.5);
        // a glint on the rim at an angle seeded from the id: every sticker is its own little thing
        const ga = -PI * 0.15 - ((tk.seed('motif', id) & 1023) / 1023) * PI * 0.9;
        S.spark(cos(ga) * 37, sin(ga) * 37, 6, { color: '#ffffff', glow: 0 });
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
    if (params.on === '0' || params.on === 0 || params.on === false) o.on = false;
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
  iconSheet('icons_status', 'status', () => REG.status.ids, { title: 'ART.icon status: 8 buffs (warm and blue), 4 resources (hero colours, gold medal ring), 8 debuffs (stitched discs)', cols: 5, big: 150 });

  iconSheet('icons_motifs', 'motif', () => REG.motif.ids, { title: 'ART.icon motif: every LISTS.motifs id as a round sticker (ART.card.motif on a candy disc)', cols: 10, big: 110, aspect: 1.2 });

  // icons_relics: the LISTS.relicIcons motifs (default palettes) and, below them, every relic of DATA.relics with its real palette and rarity rim.
  // params: part=0 (motifs only) or part=1 (relics only), size (big icon edge), bg=paper, cols, ids=a,b, t
  ART.sheet('icons_relics', (canvas, params) => {
    const g = canvas.getContext('2d');
    const W = num(params.w, 1600), H = num(params.h, 900);
    const only = typeof params.ids === 'string' ? params.ids.split(',') : null;
    const motifs = L.relicIcons.filter((id) => !only || only.indexOf(id) >= 0).map((id) => ({ label: id, id }));
    const relics = Object.keys(DATA.relics || {}).filter((id) => !only || only.indexOf(id) >= 0).map((id) => ({ label: id, id }));
    const part = params.part === undefined ? -1 : num(params.part, 0);
    const parts = part < 0 ? [[motifs, 'the ' + L.relicIcons.length + ' LISTS.relicIcons motifs (default palettes)'], [relics, 'every Charm of DATA.relics with its real palette and rarity rim (' + relics.length + ')']] : [part === 1 ? [relics, 'every Charm of DATA.relics with its real palette (' + relics.length + ')'] : [motifs, 'the ' + motifs.length + ' LISTS.relicIcons motifs (default palettes)']];
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
      }, { title: 'ART.icon Charm: ' + pt[1], cols, aspect: 1.25, pad: 6, gap: 4, labelH: 14, bg: paper ? 'paper' : 'night' });
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
    }, { title: 'ART.icon tiles: round stickers with cream rims (opts.done fades them into the ground)', cols: params.cols || 7, aspect: 1.3, pad: 8, gap: 6, labelH: 16, bg: paper ? 'paper' : 'night' });
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
    }, { title: 'ART.icon gems: 5 cuts x 4 colours x 3 tiers, and empty sockets (note pink, shield blue, leaf green, star gold, ring rainbow)', cols: params.cols || 8, aspect: 1.35, pad: 8, gap: 6, labelH: 16, bg: paper ? 'paper' : 'night' });
  });

  // icons_ui: intents, stats, Spells, card types and rows on one sheet (params: cols, size, bg=paper, kinds=intent,stat)
  ART.sheet('icons_ui', (canvas, params) => {
    const kinds = typeof params.kinds === 'string' ? params.kinds.split(',') : ['intent', 'stat', 'brush', 'type', 'row'];
    const cells = [];
    kinds.forEach((k) => ART.icon.ids(k).forEach((id) => cells.push({ label: k + ' ' + id, kind: k, id, n: k === 'intent' && /attack|multi|heavy/.test(id) ? 12 : undefined })));
    const paper = params.bg === 'paper';
    ART.sheetGrid(canvas, params, cells, (g, cell, w, h) => {
      multi(g, cell.kind, cell.id, w, h, { big: num(params.size, 0) || 120, sizes: [40, 32, 24, 16], opts: Object.assign(flagOpts(params), cell.n !== undefined && params.n === undefined ? { n: cell.n } : {}) });
    }, { title: 'ART.icon intents, stats, Spells (mini hex grids), card types, rows', cols: params.cols || 7, aspect: 1.35, pad: 8, gap: 6, labelH: 16, bg: paper ? 'paper' : 'night' });
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
})();

