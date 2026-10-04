// Echowake (was Inkwoven) -- ART.fx: the combat VFX (24 effects, DATA.LISTS.fx). Extends ART (art.js); every member REPLACES the art.js placeholder by plain assignment.
//
// CONTRACT (DESIGN 5.6, ART_BIBLE 7)
//   ART.fx.NAME(ctx, o, t)     t is PROGRESS 0..1 (clamped; NaN is 0). SCENE owns the timing (ART.fx.ms[NAME] ms by default). A pure function of (o, t) and the
//                              ART.tk.opt settings: no state, no clock, no banned random call. Particles are closed-form functions of o.seed and t, so any t can be drawn in
//                              any order (the gallery relies on it). Unknown keys are ignored, a missing or non-finite number falls back to its default, nothing throws.
//   o = { x, y, x2?, y2?, s?:1, color?, color2?, dir?:1|-1, ang?, seed?, text?, kind?, w?, h? }   stage px, radians
//        x y      origin: the impact point, the caster centre or the line start. s scales EVERYTHING (sizes, line weights, travel) about it.
//        color    the main hex colour (any '#rgb' or '#rrggbb'; other strings fall back to the effect default). color2 the accent. SCENE fills color2 with color
//                 when it has no accent, so an accent equal to the main colour is treated as missing and a matching accent is derived from it.
//        dir      -1 mirrors the effect horizontally about its origin (an attacker facing left), then ang rotates it on screen (radians, clockwise positive).
//        seed     any integer: all the variation (jitter, particle layout, flicker frames) derives from it.
//   Each effect has a default duration in ART.fx.ms (retuned below; the values are close to the DESIGN 5.6 table). Unlisted extras beyond DESIGN are at the end.
//
// THE EFFECTS (default colours in brackets; "local" means drawn around the origin at s = 1 and scaled)
//   slash        a calligraphic crescent: a fat tapered blade of light swept along an arc (the head snaps across in 0.3 of the time, the tail catches up), an ink
//                underlay, an accent rim, a white core, a gleam at the tip, two echo streaks and ink flecks flung off the head. ang tilts it; default chord is "\".
//   cross        two slashes making an X (the second one lags 0.2) with a star flash where they cross.
//   thrust       a piercing needle of light from (x, y) to (x2, y2) that snaps to its end in a quarter of the time, a bow wake, speed streaks and shock rings at the tip.
//                Without x2, y2 it thrusts 240 px along dir and ang.
//   burst        a comic starburst impact: ink outline, colour body, halftone screen-tone, inner star, white core, radial speed lines, anime "boil" (new jitter every frame).
//   ring         an expanding shock ring: an inked annulus that thins as it grows, a highlight, tick marks and a trailing second ring.
//   inkSplash    the Sound Burst: a dark core pops with a waveform rim and nine tapered sound spikes, three rings expand outward, note heads fly off and settle,
//                a white flash ring leaves at the start, then it fades. (The id stays from the old splat; Kuro's element and every summon and death use it.)
//   petals       a swirling sakura storm: baked petals tumble on tilted orbits that widen and climb, with wind ribbons and a soft pink glow.
//   lightning    a branching bolt from (x, y) to (x2, y2) that flickers on twos (a new bolt every frame), with an afterimage, an impact flare and sparks. Without
//                x2, y2 it strikes down onto (x, y) from 360 px above.
//   chain        chain lightning between (x, y) and (x2, y2): three braided arcs, a pulse running along them, beads, node flares. Without x2, y2 it reaches 260 px along dir.
//   flame        licking flame tongues in four cel layers (ink outline, body, inner, white core) that flicker on twos, rising embers, a heat glow and a scorch smear.
//   frost        radial ice crystals (two-tone facets, ink outline) that thrust out with an overshoot, a snowflake star, floating gems, a frost ring, then shatter.
//   poison       bubbling green-violet clouds (cel puffs with an ink outline), rising bubbles that pop, curling wisps and a toxic underglow.
//   shield       a hex-ripple barrier over o.w x o.h: a honeycomb whose cells light up along an expanding ripple from where the hit landed, a glass rim, a sheen.
//   heal         rising light motes, chunky plus signs, four-point stars, a soft light column and a healing ring on the ground.
//   buff         an aura of upward glyph streams: chevrons and diamonds climbing three columns, a magic ring that sweeps feet to head, a light column.
//   debuff       the same falling: downward chevrons, a ring that sinks head to feet, dark mist and falling grey ash and frost flecks.
//   sparkle      twinkling four-point stars around a big lens-flare star, drifting gold-leaf flecks.
//   speedLines   manga speed lines: 'radial' focus lines converging on (x, y) (default), or kind 'dir' parallel lines along ang. With o.w and o.h it covers that
//                whole box (SCENE always passes them); without, a local burst of lines around (x, y). New line set every frame ("boil").
//   impactFrame  the anime impact frame: an inverted flash ('difference'), then black and white rays converging on (x, y) over the whole o.w x o.h (default
//                1280 x 720). Never reads pixels. ART.tk.opt.reduceMotion draws a soft tint instead of any flash.
//   sfxText      onomatopoeia (o.text, default 'ZAN!'): heavy skewed letters, each its own sprite with a thick ink outline, an accent sticker edge and a block
//                shadow; pops in with overshoot, shakes, then drops away. Letters are baked once per (character, colours), then placed with one drawImage each.
//   vignette     hard dramatic edges over o.w x o.h: a torn ink-drawn frame plus a colour bleed from the edges that beats once (default red). Baked once.
//   chromatic    RGB split: the canvas redrawn onto itself with the red and blue channels shifted (multiply masks and 'lighter'), over the o.w x o.h box in the
//                current transform. Half resolution scratch canvases; draws nothing when the canvas cannot be copied (stub, zero size) or under reduceMotion.
//   brushDrag    the Sound Sweep from (x, y) to (x2, y2): a ribbon whose two edges are sine waves (the swing falls toward the tail), three inner sine lines,
//                a bright head bead and notes thrown off the head. Without x2, y2 it sweeps 420 px along dir and ang.
//   numberPop    comic damage digits (o.text, o.kind dmg | crit | heal | block | poison | burn): heavy digits each baked once with a thick ink outline; they pop in
//                one after the other with overshoot, wobble, float a little (SCENE adds the main rise) and fade. crit is hot red-gold and shakes, heal green,
//                block blue, poison purple, burn orange, dmg white.
//   Every effect honours ART.tk.opt.reduceMotion (particle counts x0.3, no strobing) and quality 'low' (x0.55, no halftone or extra passes).
//
// EXTRAS beyond DESIGN 5.6
//   ART.fx.demo(name, w, h, extra?) -> the `o` the gallery uses for a name in a w x h box (handy for tests and tooling)
//   ART.fx.nominal(name) -> {r} the approximate radius in px an effect reaches at s = 1 (0 for full-screen effects); SCENE may use it to cull
//   Gallery sheets: fx (every name at t = 0 .25 .5 .75 1), fx_anim (film strips: params page=0..3, per, n, names=a,b), fx_dev (one effect big: params name,
//   zoom, seed, light=1, color; use --param frames=6 for a strip), fx_combat (the effects in a combat frame: params t)
//
// HOW IT IS BUILT
//   The house look is one recipe: a hot white core, a coloured body, a deep indigo ink line or underlay so the shape survives any backdrop, additive
//   glow only for light, hard shapes for everything else, and anime timing (snap in, hold, dissolve; loops and jitter "on twos" through a quantised t).
//   Everything is polygons, arcs and cached sprites (glows come from ART.tk.glow, letters and petals from ART.sprite), so the whole set sits under 0.4 ms per
//   effect at its busiest on a mid laptop (chromatic is GPU bound: a few full-canvas blits). Scratch arrays are module level and never escape a call.
(() => {
  'use strict';
  const tk = ART.tk, pal = tk.pal;
  const PI = Math.PI, TAU = PI * 2;
  const sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max, floor = Math.floor, sqrt = Math.sqrt, pow = Math.pow, hypot = Math.hypot, atan2 = Math.atan2, exp = Math.exp;
  const INK = pal.ink;

  // ---------------------------------------------------------------------------------------------------------------
  // small numeric helpers (all NaN safe: comparisons with NaN are false, so the positive case is tested first)
  // ---------------------------------------------------------------------------------------------------------------
  const c01 = (v) => (v > 0 ? (v < 1 ? v : 1) : 0);
  const fin = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const lerp = (a, b, k) => a + (b - a) * k;
  const ramp = (t, a, b) => c01((t - a) / (b - a));                 // 0 before a, 1 after b
  const sm = (k) => k * k * (3 - 2 * k);                           // smoothstep of an already clamped k
  const eo2 = (k) => 1 - (1 - k) * (1 - k);
  const eo3 = (k) => { const u = 1 - k; return 1 - u * u * u; };
  const eoBack = (k) => { const u = k - 1; return 1 + 2.9 * u * u * u + 1.9 * u * u; };
  const eoExpo = (k) => (k >= 1 ? 1 : 1 - pow(2, -10 * k));
  const inv2 = (k) => k * k;
  // fade in over 0..a, hold, fade out over b..c (c defaults to 1)
  const env = (t, a, b, c) => ramp(t, 0, a) * (1 - ramp(t, b, c === undefined ? 1 : c));
  const cnt = (n) => max(1, Math.round(n * tk.motion() * (tk.lowQ() ? 0.55 : 1)));

  // deterministic 0..1 from (seed, i): an integer hash, no rng object per call
  const hv = (seed, i) => {
    let h = (Math.imul(seed, 0x9e3779b1) ^ Math.imul(i + 0x632be5ab, 0x85ebca6b)) | 0;
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const hs = (seed, i) => hv(seed, i) * 2 - 1;                     // -1..1

  // ---------------------------------------------------------------------------------------------------------------
  // colours
  // ---------------------------------------------------------------------------------------------------------------
  const hexOr = (c, d) => {
    if (typeof c !== 'string') return d;
    if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
    if (/^#[0-9a-fA-F]{3}$/.test(c)) return '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
    return d;
  };
  const luma = (hex) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  const tint = (h, k) => tk.tint(h, k), shade = (h, k) => tk.shade(h, k), mix = (a, b, k) => tk.mix(a, b, k);
  const rgba = (h, a) => tk.rgba(h, a);
  const WHITE = '#ffffff', PAPER = pal.white;

  // ---------------------------------------------------------------------------------------------------------------
  // option preparation
  // ---------------------------------------------------------------------------------------------------------------
  // d1: default main colour. d2: default accent (a hex, or a function deriving it from the main colour, used whenever the caller gave a colour but no distinct accent)
  function prep(o, d1, d2) {
    o = o || {};
    const s = fin(o.s, 1);
    if (!(s > 0)) return null;
    const c1 = hexOr(o.color, d1);
    const derive = typeof d2 === 'function' ? d2 : (c) => tint(c, 0.5);
    let c2 = o.color2 === undefined ? null : hexOr(o.color2, null);
    if (!c2 || c2 === c1) c2 = (o.color !== undefined && o.color !== null) || typeof d2 !== 'string' ? derive(c1) : d2;
    return { x: fin(o.x, 640), y: fin(o.y, 360), s, dir: fin(o.dir, 1) < 0 ? -1 : 1, ang: fin(o.ang, 0), seed: floor(fin(o.seed, 0)) | 0, c1, c2, w: fin(o.w, 1280), h: fin(o.h, 720), text: o.text, kind: o.kind, o };
  }
  const T01 = (t) => c01(fin(t, 0));
  // translate to the origin, rotate on screen, mirror, scale: the effect then draws at s = 1 around (0, 0). The caller restores.
  function place(ctx, P) {
    ctx.save();
    ctx.translate(P.x, P.y);
    if (P.ang) ctx.rotate(P.ang);
    if (P.dir < 0) ctx.scale(-1, 1);
    if (P.s !== 1) ctx.scale(P.s, P.s);
  }
  const setA = (ctx, ga, a) => { ctx.globalAlpha = ga * c01(a); };

  // ---------------------------------------------------------------------------------------------------------------
  // shared painters
  // ---------------------------------------------------------------------------------------------------------------
  const LX = new Float64Array(400), LY = new Float64Array(400), RX = new Float64Array(400), RY = new Float64Array(400);
  const QX = new Float64Array(400), QY = new Float64Array(400), QW = new Float64Array(400);
  // add a tapered ribbon along n points (QX, QY) with half widths QW to the current path: left edge forward, right edge back (fill it, or stroke its outline)
  function ribbonPath(ctx, n, wMul, add) {
    wMul = wMul === undefined ? 1 : wMul; add = add || 0;
    for (let i = 0; i < n; i++) {
      const a = i > 0 ? i - 1 : 0, b = i < n - 1 ? i + 1 : n - 1;
      let tx = QX[b] - QX[a], ty = QY[b] - QY[a];
      const l = hypot(tx, ty) || 1; tx /= l; ty /= l;
      const w = QW[i] * wMul + (QW[i] > 0.01 ? add : 0);
      LX[i] = QX[i] - ty * w; LY[i] = QY[i] + tx * w; RX[i] = QX[i] + ty * w; RY[i] = QY[i] - tx * w;
    }
    ctx.moveTo(LX[0], LY[0]);
    for (let i = 1; i < n; i++) ctx.lineTo(LX[i], LY[i]);
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(RX[i], RY[i]);
    ctx.closePath();
  }
  // a star polygon: spikes outer radii ro(i) at even vertices, a valley radius rv between them
  function starPath(ctx, n, rot, ro, rv) {
    for (let i = 0; i < n * 2; i++) {
      const a = rot + i * PI / n, r = i % 2 === 0 ? ro(i >> 1) : rv;
      if (i === 0) ctx.moveTo(cos(a) * r, sin(a) * r); else ctx.lineTo(cos(a) * r, sin(a) * r);
    }
    ctx.closePath();
  }
  const glowAt = (ctx, x, y, r, hex, a) => { if (a > 0.01 && r > 1) tk.glow(ctx, x, y, r, hex, a > 1 ? 1 : a); };
  const disc = (ctx, x, y, r, fill) => { if (r > 0.2) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = fill; ctx.fill(); } };
  const nominal = {};

  const FX = {};

  // ===============================================================================================================
  // slash and cross
  // ===============================================================================================================
  // Draws one crescent slash in the current local space. cfg {k size scale, tilt rotation of the chord, flip -1 mirrors the swing, hd head time, t0 t1 tail window}
  const SN = 26;
  const G_PX = new Float64Array(SN), G_PY = new Float64Array(SN), G_NX = new Float64Array(SN), G_NY = new Float64Array(SN), G_HW = new Float64Array(SN), G_F = new Float64Array(SN);
  function crescentPath(ctx, kOut, kIn, add, off) {
    ctx.beginPath();
    for (let i = 0; i < SN; i++) {
      const w = G_HW[i] * kOut + add * G_F[i] + off;
      const x = G_PX[i] + G_NX[i] * w, y = G_PY[i] + G_NY[i] * w;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    for (let i = SN - 1; i >= 0; i--) ctx.lineTo(G_PX[i] - G_NX[i] * (G_HW[i] * kIn + add * G_F[i] - off), G_PY[i] - G_NY[i] * (G_HW[i] * kIn + add * G_F[i] - off));
    ctx.closePath();
  }
  // a comma-shaped fleck: a round head at (x, y) with a tail pointing back along the direction of travel
  function commaPath(ctx, x, y, ang, len, r) {
    const c = cos(ang), s = sin(ang), nx = -s, ny = c;
    ctx.moveTo(x - c * len, y - s * len);
    ctx.quadraticCurveTo(x - c * len * 0.35 + nx * r * 1.15, y - s * len * 0.35 + ny * r * 1.15, x + nx * r, y + ny * r);
    ctx.arc(x, y, r, ang + PI / 2, ang - PI / 2, true);
    ctx.quadraticCurveTo(x - c * len * 0.35 - nx * r * 1.15, y - s * len * 0.35 - ny * r * 1.15, x - c * len, y - s * len);
    ctx.closePath();
  }
  function slashLocal(ctx, P, t, cfg) {
    const k = cfg.k, R = 150 * k, span = 1.5, hd = cfg.hd || 0.3, tw0 = cfg.t0 === undefined ? 0.14 : cfg.t0, tw1 = cfg.t1 === undefined ? 0.84 : cfg.t1;
    const uh = 1 - pow(1 - c01(t / hd), 3), ut = sm(ramp(t, tw0, tw1));
    if (uh - ut < 0.02 || t >= 1) return;
    const ga = ctx.globalAlpha, light = luma(P.c1) > 0.8;
    const accent = light ? (P.c2 !== P.c1 && luma(P.c2) < 0.8 ? P.c2 : '#8fd8ff') : P.c1;
    const body = light ? P.c1 : tint(P.c1, 0.62);
    const life = (1 - 0.42 * t) * (1 + 0.6 * c01(1 - t / 0.1)) * (cfg.life === undefined ? 1 : cfg.life), fade = 1 - ramp(t, 0.74, 1);
    const angAt = (u) => -PI / 2 + (u - 0.5) * span;
    ctx.save();
    ctx.rotate(cfg.tilt);
    if (cfg.flip < 0) ctx.scale(-1, 1);
    // the arc lives on a circle of radius R whose centre is R below the apex (the origin), so the slash passes through (0, 0)
    for (let i = 0; i < SN; i++) {
      const v = i / (SN - 1), u = ut + (uh - ut) * v, phi = angAt(u);
      const f = sin(PI * pow(v, 1.35));
      G_PX[i] = cos(phi) * R; G_PY[i] = R + sin(phi) * R; G_NX[i] = cos(phi); G_NY[i] = sin(phi); G_F[i] = f;
      G_HW[i] = 16 * k * f * life;
    }
    const hx = G_PX[SN - 1], hy = G_PY[SN - 1], mx = G_PX[SN >> 1], my = G_PY[SN >> 1];
    // light first: a wide glow on the blade and a hot one at the tip
    glowAt(ctx, mx, my, 96 * k, accent, 0.5 * env(t, 0.08, 0.5, 0.95));
    glowAt(ctx, hx, hy, 46 * k, WHITE, 0.55 * env(t, 0.05, 0.3, 0.6));
    // a faint smear of the blade's motion, then an ink drop-shadow so it reads on any backdrop
    setA(ctx, ga, 0.2 * fade); crescentPath(ctx, 2.0, 1.5, 0, 0); ctx.fillStyle = accent; ctx.fill();
    ctx.save(); ctx.translate(-2.4 * k, 2.6 * k); setA(ctx, ga, 0.7 * (1 - ramp(t, 0.6, 1))); crescentPath(ctx, 1.4, 1.1, 3.2, 0); ctx.fillStyle = INK; ctx.fill(); ctx.restore();
    setA(ctx, ga, fade);
    crescentPath(ctx, 1.26, 0.8, 0, 0); ctx.fillStyle = accent; ctx.fill();
    crescentPath(ctx, 1.06, 0.6, 0, 0); ctx.fillStyle = body; ctx.fill();
    crescentPath(ctx, 0.5, 0.12, 0, -1.6 * k); ctx.fillStyle = WHITE; ctx.fill();
    // hard cel notch: an ink hairline down the concave side (tapered by the profile like a brush flick)
    crescentPath(ctx, 0, 0.05, 0, -G_HW[SN >> 1] * 0.74); ctx.fillStyle = rgba(INK, 0.75); ctx.fill();
    // the cut: a razor thin line along the whole chord in the first frames, gone in two beats
    const cut = env(t, 0.03, 0.07, 0.2);
    if (cut > 0.02) {
      const p0 = angAt(0), p1 = angAt(1), ax = cos(p0) * R, ay = R + sin(p0) * R, bx = cos(p1) * R, by = R + sin(p1) * R, ex = (bx - ax) * 0.16, ey = (by - ay) * 0.16;
      ctx.globalAlpha = ga * cut; ctx.beginPath(); ctx.moveTo(ax - ex, ay - ey); ctx.lineTo((ax + bx) / 2 + (by - ay) * 0.012, (ay + by) / 2 - (bx - ax) * 0.012 - 1.6 * k); ctx.lineTo(bx + ex, by + ey); ctx.lineTo((ax + bx) / 2 - (by - ay) * 0.012, (ay + by) / 2 + (bx - ax) * 0.012 + 1.6 * k); ctx.closePath(); ctx.fillStyle = WHITE; ctx.fill();
      ctx.globalAlpha = ga;
    }
    // two echo strokes trailing outside the blade: tapered lozenges, not uniform lines
    for (let e = 0; e < 2; e++) {
      const off = (e ? -1 : 1) * (G_HW[SN >> 1] * 1.6 + 8 + e * 3), e0 = e ? 0.22 : 0.05, e1 = e ? 0.86 : 0.62, n = 12;
      for (let i = 0; i < n; i++) {
        const v = e0 + (e1 - e0) * i / (n - 1), q = min(SN - 1, floor(v * (SN - 1)));
        QX[i] = G_PX[q] + G_NX[q] * off; QY[i] = G_PY[q] + G_NY[q] * off; QW[i] = 1.9 * k * sin(PI * i / (n - 1)) + 0.05;
      }
      setA(ctx, ga, 0.8 * fade); ctx.beginPath(); ribbonPath(ctx, n, 1, 0); ctx.fillStyle = light ? WHITE : body; ctx.fill();
    }
    // the tip gleam
    setA(ctx, ga, env(t, 0.06, 0.4, 0.66));
    tk.sparkle(ctx, hx, hy, 19 * k * (1 - 0.4 * t), { color: WHITE, rot: 0.25, glow: 0.3, thin: 0.11 });
    // ink flecks thrown off the head along the tangent, closed form from the seed
    const nf = cnt(9);
    for (let i = 0; i < nf; i++) {
      const ts = 0.05 + 0.3 * hv(P.seed, i), tau = c01((t - ts) / 0.55);
      if (t < ts || tau >= 1) continue;
      const us = 1 - pow(1 - c01(ts / hd), 3), phi = angAt(us);
      const sx = cos(phi) * R, sy = R + sin(phi) * R;
      const side = hs(P.seed, i + 40) > 0 ? 1 : -1, ta = phi + PI / 2, va = ta + side * (0.5 + 0.9 * hv(P.seed, i + 20)), d = (50 + 95 * hv(P.seed, i + 60)) * eo3(tau) * k;
      const px = sx + cos(va) * d + cos(phi) * (10 + 22 * hv(P.seed, i + 80)) * tau * k, py = sy + sin(va) * d + sin(phi) * (10 + 22 * hv(P.seed, i + 80)) * tau * k + 24 * tau * tau;
      const r = (1.8 + 2.6 * hv(P.seed, i + 100)) * k * (1 - tau * 0.65), len = r * (2.6 + 3.4 * (1 - tau));
      ctx.globalAlpha = ga * (1 - tau * tau);
      ctx.beginPath(); commaPath(ctx, px, py, va, len, r); ctx.fillStyle = i % 3 === 0 ? WHITE : INK; ctx.fill();
      if (i % 3 !== 0) { ctx.lineWidth = 1; ctx.strokeStyle = rgba(WHITE, 0.55); ctx.stroke(); }
    }
    ctx.restore();
  }
  FX.slash = (ctx, o, t) => {
    const P = prep(o, PAPER, null); if (!P) return;
    t = T01(t); place(ctx, P);
    slashLocal(ctx, P, t, { k: 1, tilt: 0.75, flip: 1 });
    ctx.restore();
  };
  FX.cross = (ctx, o, t) => {
    const P = prep(o, PAPER, null); if (!P) return;
    t = T01(t); place(ctx, P);
    // both blades are drawn in full and held for a beat, so the X reads; then the tails catch up
    slashLocal(ctx, P, t, { k: 1.05, tilt: 0.75, flip: 1, hd: 0.24, t0: 0.5, t1: 0.96 });
    slashLocal(ctx, { c1: P.c1, c2: P.c2, seed: P.seed + 7 }, c01((t - 0.14) / 0.86), { k: 1.05, tilt: -0.75, flip: -1, hd: 0.24, t0: 0.5, t1: 0.96 });
    // a star flash where the blades cross
    const f = env(t, 0.34, 0.38, 0.72) * ramp(t, 0.16, 0.28);
    if (f > 0.02) {
      const ga = ctx.globalAlpha;
      glowAt(ctx, 0, 0, 90, luma(P.c1) > 0.8 ? '#8fd8ff' : P.c1, 0.7 * f);
      ctx.globalAlpha = ga * f;
      tk.sparkle(ctx, 0, 0, 46 * (0.6 + 0.6 * eo3(ramp(t, 0.18, 0.4))), { color: WHITE, rot: 0.785, glow: 0.5, thin: 0.11 });
      tk.sparkle(ctx, 0, 0, 30, { color: WHITE, rot: 0, glow: 0, thin: 0.13 });
      ctx.globalAlpha = ga;
    }
    ctx.restore();
  };
  nominal.slash = 130; nominal.cross = 140;

  // ===============================================================================================================
  // thrust
  // ===============================================================================================================
  FX.thrust = (ctx, o, t) => {
    const P = prep(o, PAPER, null); if (!P) return;
    t = T01(t);
    let x1 = fin(o && o.x2, P.x), y1 = fin(o && o.y2, P.y);
    if (hypot(x1 - P.x, y1 - P.y) < 8) { const L0 = 240 * P.s; x1 = P.x + cos(P.ang) * L0 * P.dir; y1 = P.y + sin(P.ang) * L0; }
    const L = hypot(x1 - P.x, y1 - P.y), k = min(1.7, max(0.55, P.s));
    const light = luma(P.c1) > 0.8, accent = light ? (P.c2 !== P.c1 && luma(P.c2) < 0.8 ? P.c2 : '#8fd8ff') : P.c1, body = light ? P.c1 : tint(P.c1, 0.62);
    const ga = ctx.globalAlpha;
    ctx.save(); ctx.translate(P.x, P.y); ctx.rotate(atan2(y1 - P.y, x1 - P.x));
    const head = L * eoExpo(ramp(t, 0, 0.24)), tail = L * 0.97 * sm(ramp(t, 0.1, 0.8));
    const fade = 1 - ramp(t, 0.7, 1);
    // the needle
    if (head - tail > 3) {
      const n = 22, W = 13 * k * (1 - 0.4 * t);
      for (let i = 0; i < n; i++) {
        const v = i / (n - 1);
        QX[i] = tail + (head - tail) * v; QY[i] = 0;
        QW[i] = W * pow(v, 1.25) * sqrt(max(0, 1 - pow(v, 9))) + 0.2;
      }
      glowAt(ctx, (head + tail) / 2, 0, (head - tail) * 0.55 + 30 * k, accent, 0.45 * fade);
      setA(ctx, ga, 0.62 * fade); ctx.beginPath(); ribbonPath(ctx, n, 1.45, 2.6); ctx.fillStyle = INK; ctx.fill();
      setA(ctx, ga, fade);
      ctx.beginPath(); ribbonPath(ctx, n, 1.2, 0); ctx.fillStyle = accent; ctx.fill();
      ctx.beginPath(); ribbonPath(ctx, n, 0.86, 0); ctx.fillStyle = body; ctx.fill();
      ctx.beginPath(); ribbonPath(ctx, n, 0.3, 0); ctx.fillStyle = WHITE; ctx.fill();
      // bow wake: two thin lines sweeping back from the head
      const wk = env(t, 0.1, 0.35, 0.75);
      if (wk > 0.02) {
        ctx.lineWidth = 2 * k; ctx.lineCap = 'round'; ctx.strokeStyle = rgba(light ? WHITE : body, 0.85 * wk);
        for (let sd = -1; sd <= 1; sd += 2) { ctx.beginPath(); ctx.moveTo(head - 8 * k, sd * 7 * k); ctx.lineTo(head - (70 + 40 * t) * k, sd * (26 + 14 * t) * k); ctx.stroke(); }
      }
      setA(ctx, ga, env(t, 0.05, 0.3, 0.6));
      tk.sparkle(ctx, head, 0, 24 * k, { color: WHITE, rot: 0.2, glow: 0.5, thin: 0.14 });
    }
    // speed streaks flung back along the shaft
    ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const y = hs(P.seed, i) * 30 * k, st = 0.04 + 0.1 * hv(P.seed, i + 9), a = ramp(t, st, st + 0.12) * (1 - ramp(t, st + 0.15, st + 0.4));
      if (a < 0.02) continue;
      const x0 = head * 0.98 - 20 * k - hv(P.seed, i + 20) * 70 * k, len = (34 + 70 * hv(P.seed, i + 30)) * k;
      ctx.globalAlpha = ga * a * 0.8; ctx.lineWidth = (1.2 + 1.6 * hv(P.seed, i + 40)) * k; ctx.strokeStyle = i % 2 ? WHITE : accent;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 - len * (0.5 + 0.5 * t), y); ctx.stroke();
    }
    // shock rings at the far end
    for (let r = 0; r < 2; r++) {
      const tau = ramp(t, 0.16 + r * 0.12, 0.72 + r * 0.1);
      if (tau <= 0 || tau >= 1) continue;
      const rx = (6 + 30 * eo3(tau)) * k, ry = (18 + 62 * eo3(tau)) * k;
      ctx.globalAlpha = ga * (1 - tau) * (r ? 0.7 : 1);
      ctx.beginPath(); ctx.ellipse(L, 0, rx, ry, 0, 0, TAU);
      ctx.lineWidth = (7 * (1 - tau) + 1.5) * k + 2.4; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = (7 * (1 - tau) + 1.5) * k; ctx.strokeStyle = r ? accent : WHITE; ctx.stroke();
    }
    glowAt(ctx, L, 0, 70 * k, accent, 0.65 * env(t, 0.22, 0.35, 0.8));
    ctx.restore();
    ctx.globalAlpha = ga;
  };
  nominal.thrust = 130;

  // ===============================================================================================================
  // burst
  // ===============================================================================================================
  FX.burst = (ctx, o, t) => {
    const P = prep(o, '#ffe9a8', (c) => (luma(c) > 0.82 ? '#ffd36a' : tint(c, 0.55))); if (!P) return;
    t = T01(t); place(ctx, P);
    const ga = ctx.globalAlpha, fr = floor(t * 18), sd = P.seed + fr * 31;
    const R = 112 * (0.22 + 0.78 * eo3(ramp(t, 0, 0.36))) * (1 - 0.5 * sm(ramp(t, 0.55, 1)));
    const a = 1 - sm(ramp(t, 0.6, 1)), n = 10 + floor(hv(P.seed, 99) * 5), rot = hs(sd, 1) * 0.35 + hv(P.seed, 98) * TAU;
    glowAt(ctx, 0, 0, R * 1.7, P.c2, 0.6 * a);
    // radial speed lines behind the star
    const lines = cnt(14), lf = eo3(ramp(t, 0, 0.3)), la = 0.85 * (1 - ramp(t, 0.18, 0.6));
    if (la > 0.02) {
      ctx.globalAlpha = ga * la; ctx.fillStyle = WHITE; ctx.beginPath();
      for (let i = 0; i < lines; i++) {
        const an = (i + hv(sd, i + 200) * 0.7) / lines * TAU, r0 = R * (0.8 + 0.25 * hv(sd, i + 220)), r1 = R * (1.25 + 0.75 * hv(sd, i + 240) * lf) + 20 * lf, w = 0.05 + 0.03 * hv(sd, i + 260);
        ctx.moveTo(cos(an - w * 0.3) * r0, sin(an - w * 0.3) * r0); ctx.lineTo(cos(an) * r1, sin(an) * r1); ctx.lineTo(cos(an + w * 0.3) * r0, sin(an + w * 0.3) * r0); ctx.closePath();
      }
      ctx.fill();
    }
    ctx.globalAlpha = ga * a;
    const ro = (i) => R * (i % 2 ? 0.66 + 0.22 * hv(sd, i) : 1.0 + 0.24 * hv(sd, i));
    // ink, body, halftone, inner star, core
    ctx.beginPath(); starPath(ctx, n, rot, ro, R * 0.42);
    ctx.lineJoin = 'miter'; ctx.miterLimit = 8; ctx.lineWidth = 9; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = P.c1; ctx.fill();
    if (!tk.lowQ()) {
      ctx.save(); ctx.clip();
      tk.halftone(ctx, -R * 1.4, -R * 1.4, R * 2.8, R * 2.8, { d: 6.5, r: 1.9, color: shade(P.c1), alpha: 0.42, force: true, angle: 0.3 });
      ctx.restore();
    }
    ctx.beginPath(); starPath(ctx, n, rot + PI / n, (i) => R * (0.66 + 0.1 * hv(sd, i + 50)), R * 0.3);
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = P.c2; ctx.fill();
    ctx.beginPath(); starPath(ctx, n, rot, (i) => R * (0.36 + 0.08 * hv(sd, i + 70)), R * 0.17); ctx.fillStyle = WHITE; ctx.fill();
    // the first frame is a flash
    const fl = 1 - ramp(t, 0, 0.12);
    if (fl > 0.02) { ctx.globalAlpha = ga * fl; ctx.beginPath(); starPath(ctx, n, rot + PI / n * 0.5, (i) => R * (1.15 + 0.3 * hv(sd, i + 400)), R * 0.5); ctx.fillStyle = WHITE; ctx.fill(); }
    ctx.restore(); ctx.globalAlpha = ga;
  };
  nominal.burst = 125;

  // ===============================================================================================================
  // ring
  // ===============================================================================================================
  // one shock ring: an inked annulus that thins as it grows. The inner circle is nudged off-centre a little so the band's thickness varies like a brush line.
  function oneRing(ctx, tau, R, thick, seed, accentCol, bodyCol) {
    if (tau <= 0 || tau >= 1) return;
    const ro = R * (0.06 + 0.94 * eo3(tau)), th = max(1.4, thick * pow(1 - tau, 1.1)), ri = max(0.5, ro - th), ga = ctx.globalAlpha, a = 1 - ramp(tau, 0.55, 1);
    const ox = hs(seed, 1) * th * 0.16, oy = hs(seed, 2) * th * 0.16;
    ctx.globalAlpha = ga * a; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.arc(0, 0, ro + 1.4, 0, TAU); ctx.lineWidth = 4.2; ctx.strokeStyle = INK; ctx.stroke();
    if (ri > 3) { ctx.beginPath(); ctx.arc(ox, oy, ri - 1, 0, TAU); ctx.lineWidth = 3; ctx.stroke(); }
    ctx.beginPath(); ctx.arc(0, 0, ro, 0, TAU); ctx.moveTo(ox + ri, oy); ctx.arc(ox, oy, ri, 0, TAU); ctx.fillStyle = bodyCol; ctx.fill('evenodd');
    if (th > 3.5) {
      const hi = max(0.5, ro - th * 0.55);   // at tiny tau ro is smaller than the band, and arc() throws on a negative radius
      ctx.beginPath(); ctx.arc(0, 0, ro - th * 0.12, 0, TAU); ctx.moveTo(hi, 0); ctx.arc(0, 0, hi, 0, TAU); ctx.fillStyle = accentCol; ctx.fill('evenodd');
    }
    ctx.globalAlpha = ga;
  }
  FX.ring = (ctx, o, t) => {
    const P = prep(o, '#fff8f0', (c) => (luma(c) > 0.82 ? '#9fdcff' : tint(c, 0.6))); if (!P) return;
    t = T01(t); place(ctx, P);
    const ga = ctx.globalAlpha, R = 150;
    glowAt(ctx, 0, 0, R * (0.4 + 0.7 * eo3(t)), P.c2, 0.34 * (1 - t));
    // dashes flung outward off the leading edge
    const nt = cnt(14), ta = ramp(t, 0.02, 0.15) * (1 - ramp(t, 0.35, 0.75));
    if (ta > 0.02) {
      ctx.globalAlpha = ga * ta; ctx.lineCap = 'round';
      const rr = R * (0.06 + 0.94 * eo3(t)) + 9;
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass ? P.c1 : INK; ctx.lineWidth = pass ? 2 : 5; ctx.beginPath();
        for (let i = 0; i < nt; i++) { const an = (i + hv(P.seed, i) * 0.6) / nt * TAU, l = (7 + 13 * hv(P.seed, i + 30)) * (1 - t); ctx.moveTo(cos(an) * rr, sin(an) * rr); ctx.lineTo(cos(an) * (rr + l), sin(an) * (rr + l)); }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = ga;
    oneRing(ctx, ramp(t, 0.1, 1), R * 0.78, 11, P.seed + 11, WHITE, P.c2);
    oneRing(ctx, t, R, 19, P.seed, P.c2, P.c1);
    ctx.restore();
  };
  nominal.ring = 150;

  // ===============================================================================================================
  // inkSplash (the Sound Burst: id kept, the picture is a sound, not a splat)
  // ===============================================================================================================
  // a closed polygon through n points (straight lineTo, so the rim reads as a waveform and not a blob)
  function wavePath(ctx, pts, n) {
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 1; i < n; i++) ctx.lineTo(pts[2 * i], pts[2 * i + 1]);
    ctx.closePath();
  }
  const BP = new Float64Array(64);
  const SPLAT = { M: 17, px: new Float64Array(17), py: new Float64Array(17), ns: 9, sa: new Float64Array(9), sl: new Float64Array(9), sw: new Float64Array(9), r: 0 };
  function poolPath(ctx, S, ox, oy) {
    for (let i = 0; i < S.M; i++) { BP[2 * i] = S.px[i] + ox; BP[2 * i + 1] = S.py[i] + oy; }
    wavePath(ctx, BP, S.M);
  }
  // The waveform rim plus nine tapered sound spikes as extra subpaths of the current path. Every subpath runs clockwise on screen, so the union fills
  // cleanly with the nonzero rule (stroke the whole path thick in ink, then fill it: the outline only survives on the outside).
  function splatPath(ctx, S) {
    poolPath(ctx, S, 0, 0);
    for (let i = 0; i < S.ns; i++) {
      const a = S.sa[i], c = cos(a), s = sin(a), nx = -s, ny = c, L = S.sl[i], w = S.sw[i];
      if (L < 3) continue;
      ctx.moveTo(c * S.r * 0.4 - nx * w, s * S.r * 0.4 - ny * w);
      ctx.lineTo(c * L * 0.5 - nx * w * 0.42, s * L * 0.5 - ny * w * 0.42);
      ctx.lineTo(c * L, s * L);
      ctx.lineTo(c * L * 0.5 + nx * w * 0.42, s * L * 0.5 + ny * w * 0.42);
      ctx.lineTo(c * S.r * 0.4 + nx * w, s * S.r * 0.4 + ny * w);
      ctx.closePath();
    }
  }
  // a small note head with a stem (a released sound), inked: head at (x, y)
  function noteBit(ctx, x, y, rr, fill) {
    ctx.beginPath(); ctx.moveTo(x + rr * 0.8, y - rr * 0.2); ctx.lineTo(x + rr * 0.8, y - rr * 3.2);
    ctx.lineWidth = 4.6; ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x, y, rr * 1.2, rr * 0.86, -0.35, 0, TAU); ctx.lineWidth = 5; ctx.stroke(); ctx.fillStyle = fill; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + rr * 0.8, y - rr * 0.2); ctx.lineTo(x + rr * 0.8, y - rr * 3.2); ctx.lineWidth = 1.8; ctx.strokeStyle = fill; ctx.stroke();
  }
  FX.inkSplash = (ctx, o, t) => {
    const P = prep(o, '#7a6bff', (c) => tint(c, 0.4)); if (!P) return;
    t = T01(t); place(ctx, P);
    const ga = ctx.globalAlpha, sd = P.seed, S = SPLAT;
    const dry = ramp(t, 0.32, 0.78), a = 1 - ramp(t, 0.8, 1), r = 41 * eoBack(ramp(t, 0, 0.17)) * (1 - 0.06 * dry);
    if (r < 2 || a < 0.02) { ctx.restore(); return; }
    const body = mix(P.c1, INK, 0.5 + 0.2 * dry), shadowC = mix(P.c1, INK, 0.78), lit = tint(P.c1, 0.5), rot = hv(sd, 500) * TAU;
    S.r = r;
    // the rim: 17 points alternating a high and a low radius, joined by straight lines
    for (let i = 0; i < S.M; i++) { const an = rot + i / S.M * TAU, rr = r * ((i % 2 ? 0.66 : 1.08) + 0.14 * hs(sd, i)); S.px[i] = cos(an) * rr; S.py[i] = sin(an) * rr; }
    for (let i = 0; i < S.ns; i++) {
      const kind = i % 3, gi = eo3(ramp(t, 0.0 + 0.02 * hv(sd, i + 90), 0.13 + 0.07 * hv(sd, i + 91))), j = hv(sd, i + 20);
      S.sa[i] = rot + (i + hs(sd, i + 60) * 0.32) / S.ns * TAU;
      S.sl[i] = (kind === 0 ? 84 + 34 * j : kind === 1 ? 54 + 20 * j : 66 + 20 * j) * gi * (1 - 0.07 * dry);
      S.sw[i] = kind === 0 ? 5.6 : kind === 1 ? 16 + 4 * j : 10 + 3 * j;
    }
    ctx.globalAlpha = ga * a; ctx.lineJoin = 'round';
    // three rings expand from r to r * 2.6 over 0.2 .. 0.9: an inked annulus each, in the two colours
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const tau = ramp(t, 0.2 + 0.07 * i, 0.9);
      if (tau <= 0 || tau >= 1) continue;
      const rr = r * (1 + 1.6 * eo3(tau)), th = max(1.6, 8 * pow(1 - tau, 1.1)), ra = (1 - ramp(tau, 0.45, 1)) * ga * a;
      ctx.globalAlpha = ra;
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.lineWidth = th + 3.4; ctx.strokeStyle = INK; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.lineWidth = th; ctx.strokeStyle = i % 2 ? P.c2 : P.c1; ctx.stroke();
    }
    ctx.globalAlpha = ga * a;
    // note heads flung out on short arcs; each one drifts to rest where it landed
    const nd = cnt(13);
    for (let i = 0; i < nd; i++) {
      const ts = 0.01 + 0.1 * hv(sd, i + 600), tau = c01((t - ts) / 0.3);
      if (t < ts) continue;
      const an = hv(sd, i + 620) * TAU, dist = (78 + 90 * hv(sd, i + 640)) * eo3(tau), px = cos(an) * dist, py = sin(an) * dist * 0.9 - 30 * hv(sd, i + 700) * tau * tau;
      const rr = (3.4 + 3.6 * hv(sd, i + 660)) * (0.7 + 0.3 * tau);
      noteBit(ctx, px, py, rr, i % 2 ? P.c2 : body);
    }
    // the silhouette: a thick ink line, then the body colour on top
    ctx.beginPath(); splatPath(ctx, S); ctx.lineWidth = 9; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = body; ctx.fill();
    // a lit line down the upper edge of each spike
    ctx.lineCap = 'round'; ctx.strokeStyle = rgba(lit, 0.85 * (1 - dry * 0.6)); ctx.lineWidth = 1.8; ctx.beginPath();
    for (let i = 0; i < S.ns; i++) {
      const L = S.sl[i]; if (L < 14) continue;
      const an = S.sa[i], nx = sin(an), ny = -cos(an), w = S.sw[i] * 0.42;
      ctx.moveTo(cos(an) * r * 0.75 + nx * w, sin(an) * r * 0.75 + ny * w); ctx.lineTo(cos(an) * L * 0.72 + nx * w * 0.5, sin(an) * L * 0.72 + ny * w * 0.5);
    }
    ctx.stroke();
    // the core gets one hard shadow (itself minus itself shifted toward the light) with screen tone in it
    ctx.save(); ctx.beginPath(); poolPath(ctx, S, 0, 0); ctx.clip();
    ctx.beginPath(); ctx.rect(-120, -120, 240, 240); poolPath(ctx, S, 6, -6); ctx.fillStyle = shadowC; ctx.fill('evenodd');
    if (!tk.lowQ()) { ctx.clip('evenodd'); tk.halftone(ctx, -120, -120, 240, 240, { d: 5.5, r: 1.5, color: INK, alpha: 0.6, force: true }); }
    ctx.restore();
    // the waveform rim glows: a lit line round the core, so the zigzag reads as a sound wave
    ctx.globalAlpha = ga * a * (1 - 0.5 * dry); ctx.lineJoin = 'miter'; ctx.miterLimit = 3; ctx.beginPath(); poolPath(ctx, S, 0, 0); ctx.lineWidth = 3.2; ctx.strokeStyle = P.c2; ctx.stroke();
    ctx.lineWidth = 1.2; ctx.strokeStyle = WHITE; ctx.stroke(); ctx.lineJoin = 'round'; ctx.globalAlpha = ga * a;
    glowAt(ctx, 0, 0, r * 2.1, P.c1, 0.3 * (1 - dry));
    // a bright dot at the heart, and a white flash ring at 0.1 .. 0.3 where the sound leaves
    disc(ctx, 0, 0, r * 0.2 * (1 - dry * 0.5), rgba(WHITE, 0.9 * (1 - dry)));
    const fl = ramp(t, 0.1, 0.3);
    if (fl > 0 && fl < 1) {
      ctx.globalAlpha = ga * a * (1 - fl); ctx.beginPath(); ctx.arc(0, 0, r * (0.9 + 0.8 * eo3(fl)), 0, TAU);
      ctx.lineWidth = 5 * (1 - 0.6 * fl); ctx.strokeStyle = WHITE; ctx.stroke();
    }
    ctx.restore(); ctx.globalAlpha = ga;
  };
  nominal.inkSplash = 150;

  // ===============================================================================================================
  // petals
  // ===============================================================================================================
  // one baked sakura petal (notched tip, cel shadow, vein, ink line) per colour, drawn dozens of times with a transform each
  function petalSprite(hex) {
    return ART.sprite('fx|petal|' + hex, 32, 32, (g) => {
      g.translate(16, 16);
      const path = () => { g.beginPath(); g.moveTo(0, 12.5); g.bezierCurveTo(9, 8, 11.5, -4, 4.2, -12.5); g.lineTo(0.9, -9.8); g.lineTo(-0.9, -9.8); g.lineTo(-4.2, -12.5); g.bezierCurveTo(-11.5, -4, -9, 8, 0, 12.5); g.closePath(); };
      path(); g.fillStyle = hex; g.fill();
      g.save(); path(); g.clip();
      g.beginPath(); g.ellipse(-7, 6, 9, 12, 0.5, 0, TAU); g.fillStyle = shade(hex, 0.22); g.fill();          // hard shadow, lower left
      g.beginPath(); g.ellipse(3.2, -3.5, 3.4, 7.6, 0.28, 0, TAU); g.fillStyle = rgba(WHITE, 0.5); g.fill();      // anime gloss
      g.restore();
      g.beginPath(); g.moveTo(0, 11); g.quadraticCurveTo(0.4, 1, 0, -6.5); g.lineWidth = 0.9; g.strokeStyle = rgba(shade(hex, 0.5), 0.7); g.stroke();
      path(); g.lineWidth = 1.9; g.lineJoin = 'round'; g.strokeStyle = INK; g.stroke();
    });
  }
  FX.petals = (ctx, o, t) => {
    const P = prep(o, '#ff9cc6', (c) => mix(c, WHITE, 0.3)); if (!P) return;
    t = T01(t); place(ctx, P);
    const ga = ctx.globalAlpha, spr = petalSprite(P.c1), spr2 = petalSprite(P.c2), N = cnt(26), spin = P.seed % 2 ? 1 : -1, ribbon = tint(P.c1, 0.6);
    glowAt(ctx, 0, -20, 130 * (0.4 + 0.6 * eo3(t)), P.c1, 0.4 * env(t, 0.1, 0.5, 0.95));
    // wind ribbons: three comet trails spiralling out, thin tapered brush flicks
    for (let w = 0; w < 3; w++) {
      const tau = ramp(t, 0.02 + w * 0.05, 0.85), th0 = hv(P.seed, w + 500) * TAU, a = env(tau, 0.15, 0.6, 1) * 0.85;
      if (a < 0.02) continue;
      const n = 22;
      for (let i = 0; i < n; i++) {
        const v = i / (n - 1), tt = max(0, tau - 0.3 * (1 - v)), th = th0 + spin * (2.2 + 3.2 * tt), r = (16 + 138 * eo3(tt)) * (0.85 + 0.15 * w);
        QX[i] = cos(th) * r; QY[i] = sin(th) * r * 0.42 - 90 * eo2(tt); QW[i] = 2.2 * sin(PI * pow(v, 0.8)) + 0.05;
      }
      ctx.globalAlpha = ga * a; ctx.beginPath(); ribbonPath(ctx, n, 1, 0); ctx.fillStyle = ribbon; ctx.fill();
    }
    // petals in two passes: the ones on the far side of their orbit first, smaller and dimmer
    if (!spr._inert) {
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < N; i++) {
          const ts = 0.02 + 0.3 * hv(P.seed, i), te = min(1, ts + 0.5 + 0.4 * hv(P.seed, i + 50)), tau = (t - ts) / (te - ts);
          if (tau <= 0 || tau >= 1) continue;
          const th = hv(P.seed, i + 100) * TAU + spin * (2.4 + 2.8 * hv(P.seed, i + 150)) * tau, rho = (30 + 125 * hv(P.seed, i + 200)) * eo3(tau) + 8;
          const back = sin(th) < 0;
          if ((pass === 0) !== back) continue;
          const lift = 30 + 120 * hv(P.seed, i + 250), x = cos(th) * rho, y = sin(th) * rho * 0.42 - lift * (eo2(tau) - 0.32 * tau * tau);
          const size = (7.5 + 7.5 * hv(P.seed, i + 300)) * (back ? 0.82 : 1), rot = hv(P.seed, i + 350) * TAU + (3 + 6 * hs(P.seed, i + 400)) * tau, fl = cos(hv(P.seed, i + 450) * TAU + (7 + 8 * hv(P.seed, i + 500)) * tau);
          const a = ramp(tau, 0, 0.12) * (1 - ramp(tau, 0.72, 1)) * (back ? 0.8 : 1), sx = (abs(fl) < 0.18 ? 0.18 : abs(fl)) * size / 12.5;
          ctx.globalAlpha = ga * a;
          ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sx, size / 12.5);
          ctx.drawImage(fl > 0 ? spr : spr2, -16, -16, 32, 32);
          ctx.restore();
        }
      }
    }
    ctx.globalAlpha = ga;
    // a few sparkles in the storm
    for (let i = 0; i < 4; i++) {
      const ts = 0.1 + 0.4 * hv(P.seed, i + 600), tau = c01((t - ts) / 0.4);
      if (tau <= 0 || tau >= 1) continue;
      const an = hv(P.seed, i + 620) * TAU, r = 30 + 90 * hv(P.seed, i + 640);
      tk.sparkle(ctx, cos(an) * r, sin(an) * r * 0.6 - 30, 9 * sin(PI * tau), { color: i % 2 ? WHITE : P.c2, rot: tau, glow: 0.3 });
    }
    ctx.restore(); ctx.globalAlpha = ga;
  };
  nominal.petals = 190;

  // ===============================================================================================================
  // lightning and chain
  // ===============================================================================================================
  const BX = new Float64Array(80), BY = new Float64Array(80), CX = new Float64Array(80), CY = new Float64Array(80);
  // midpoint-displacement bolt into (ax, ay): returns the point count (2^levels + 1)
  function boltPts(seed, x0, y0, x1, y1, jag, levels, ax, ay) {
    let n = 2; ax[0] = x0; ay[0] = y0; ax[1] = x1; ay[1] = y1;
    const dx = x1 - x0, dy = y1 - y0, L = hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    let disp = jag;
    for (let lv = 0; lv < levels; lv++) {
      for (let i = n - 1; i >= 0; i--) { ax[2 * i] = ax[i]; ay[2 * i] = ay[i]; }
      for (let i = 0; i < n - 1; i++) {
        const j = 2 * i + 1, off = hs(seed, lv * 131 + i) * disp;
        ax[j] = (ax[2 * i] + ax[2 * i + 2]) / 2 + nx * off; ay[j] = (ay[2 * i] + ay[2 * i + 2]) / 2 + ny * off;
      }
      n = 2 * n - 1; disp *= 0.5;
    }
    return n;
  }
  const strokePts = (ctx, ax, ay, n) => { ctx.beginPath(); ctx.moveTo(ax[0], ay[0]); for (let i = 1; i < n; i++) ctx.lineTo(ax[i], ay[i]); ctx.stroke(); };
  // the first `frac` (0..1) of a polyline, in place: returns the new point count
  function truncPts(ax, ay, n, frac) {
    if (frac >= 1) return n;
    const f = frac * (n - 1), i = min(n - 2, floor(f)), m = i + 2, r = c01(f - i);
    ax[m - 1] = lerp(ax[i], ax[i + 1], r); ay[m - 1] = lerp(ay[i], ay[i + 1], r);
    return max(2, m);
  }
  // an angular ribbon along (ax, ay): widths from prof(v); ink underlay, colour body, white core (one alpha for all three)
  function boltRibbon(ctx, ax, ay, n, W, prof, c1, ga, a, inkK) {
    for (let i = 0; i < n; i++) { QX[i] = ax[i]; QY[i] = ay[i]; QW[i] = W * prof(i / (n - 1)) + 0.15; }
    ctx.globalAlpha = ga * a * 0.85; ctx.beginPath(); ribbonPath(ctx, n, inkK || 1.9, 2.4); ctx.fillStyle = INK; ctx.fill();
    ctx.globalAlpha = ga * a; ctx.beginPath(); ribbonPath(ctx, n, 1.15, 0); ctx.fillStyle = c1; ctx.fill();
    ctx.beginPath(); ribbonPath(ctx, n, 0.46, 0); ctx.fillStyle = WHITE; ctx.fill();
  }
  const FLICKER = [1, 0.55, 1, 0.32, 0.85, 0.22, 0.6, 0.16, 0.3, 0.1];
  FX.lightning = (ctx, o, t) => {
    const P = prep(o, '#ffe45e', (c) => (luma(c) > 0.8 ? '#8fd8ff' : tint(c, 0.7))); if (!P) return;
    t = T01(t);
    let x0 = P.x, y0 = P.y, x1 = fin(o && o.x2, P.x), y1 = fin(o && o.y2, P.y);
    if (hypot(x1 - x0, y1 - y0) < 10) {                                  // no end point: it strikes down onto (x, y), leaning with dir and turned by ang
      const vx = (hs(P.seed, 3) * 30 + 36 * P.dir) * P.s, vy = -360 * P.s;
      x1 = P.x; y1 = P.y; x0 = P.x + vx * cos(P.ang) - vy * sin(P.ang); y0 = P.y + vx * sin(P.ang) + vy * cos(P.ang);
    }
    const k = min(1.7, max(0.55, P.s)), ga = ctx.globalAlpha, F = min(9, floor(t * 10)), fa = FLICKER[F] * (1 - ramp(t, 0.72, 1)), fs = P.seed + F * 131;
    const L = hypot(x1 - x0, y1 - y0), jag = min(60, 20 + L * 0.1) * k, grow = ramp(t, 0, 0.09);
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // afterimage of the previous frame's bolt
    if (F > 0 && fa > 0.02) {
      const n0 = boltPts(P.seed + (F - 1) * 131, x0, y0, x1, y1, jag, 3, BX, BY);
      ctx.globalAlpha = ga * FLICKER[F - 1] * 0.3 * (1 - ramp(t, 0.72, 1)); ctx.lineWidth = 8 * k; ctx.strokeStyle = P.c2; strokePts(ctx, BX, BY, n0);
    }
    const n = boltPts(fs, x0, y0, x1, y1, jag, 3, BX, BY);
    // branches split off the trunk (kept before the trunk is truncated)
    const nb = cnt(3), br = [];
    for (let b = 0; b < nb; b++) {
      const idx = 2 + floor(hv(fs, 700 + b) * 5), side = hs(fs, 710 + b) > 0 ? 1 : -1;
      const ta = atan2(BY[idx + 1] - BY[idx - 1], BX[idx + 1] - BX[idx - 1]) + side * (0.45 + 0.5 * hv(fs, 720 + b)), bl = L * (0.17 + 0.2 * hv(fs, 730 + b));
      br.push([BX[idx], BY[idx], BX[idx] + cos(ta) * bl, BY[idx] + sin(ta) * bl, fs + 50 + b]);
    }
    const nm = truncPts(BX, BY, n, grow);
    // soft light around the trunk: three widening strokes at low alpha (no hard edge), additive
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = P.c1;
    for (let g = 0; g < 3; g++) { ctx.globalAlpha = ga * fa * (0.05 + 0.05 * g); ctx.lineWidth = (44 - g * 14) * k; strokePts(ctx, BX, BY, nm); }
    ctx.globalCompositeOperation = 'source-over';
    for (let b = 0; b < br.length; b++) {
      if (grow < 0.55) continue;
      const nbp = boltPts(br[b][4], br[b][0], br[b][1], br[b][2], br[b][3], jag * 0.5, 2, CX, CY);
      boltRibbon(ctx, CX, CY, nbp, 3.2 * k, (v) => pow(1 - v, 0.8), P.c1, ga, fa, 1.9);
    }
    boltRibbon(ctx, BX, BY, nm, 5.6 * k, (v) => 0.4 + 0.6 * pow(sin(PI * v), 0.55), P.c1, ga, fa, 1.75);
    ctx.restore();
    // where it lands: a hot flare, a flat ring, sparks
    const ia = fa * ramp(t, 0.07, 0.13);
    glowAt(ctx, x1, y1, 84 * k, P.c1, 0.7 * ia);
    glowAt(ctx, x1, y1, 40 * k, WHITE, 0.7 * ia);
    const fl = ramp(t, 0.07, 0.11) * (1 - ramp(t, 0.11, 0.42));
    if (fl > 0.02) {
      ctx.save(); ctx.translate(x1, y1); ctx.globalAlpha = ga * fl;
      ctx.beginPath(); starPath(ctx, 8, hv(P.seed, 9) * TAU, (i) => (i % 2 ? 26 : 40) * k * (0.8 + 0.4 * hv(fs, i)), 9 * k);
      ctx.lineJoin = 'miter'; ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = WHITE; ctx.fill();
      ctx.restore();
    }
    const ring = ramp(t, 0.08, 0.55);
    if (ring > 0 && ring < 1) {
      ctx.save(); ctx.translate(x1, y1); ctx.globalAlpha = ga * (1 - ring);
      ctx.beginPath(); ctx.ellipse(0, 0, 90 * eo3(ring) * k, 26 * eo3(ring) * k, 0, 0, TAU); ctx.lineWidth = 6 * k * (1 - ring) + 1; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = 3.4 * k * (1 - ring) + 0.6; ctx.strokeStyle = P.c2; ctx.stroke();
      ctx.restore();
    }
    const ns = cnt(11);
    ctx.lineCap = 'round';
    for (let i = 0; i < ns; i++) {
      const tau = c01((t - 0.08 - 0.06 * hv(P.seed, i + 800)) / 0.42);
      if (tau <= 0 || tau >= 1) continue;
      const an = -PI * hv(P.seed, i + 820) + (hv(P.seed, i + 830) > 0.7 ? PI * 0.9 : 0), d0 = (30 + 120 * hv(P.seed, i + 840)) * k * eo3(tau), d1 = d0 + (8 + 16 * (1 - tau)) * k;
      ctx.globalAlpha = ga * (1 - tau); ctx.strokeStyle = i % 2 ? WHITE : P.c1; ctx.lineWidth = 2.6 * k * (1 - tau) + 0.7;
      ctx.beginPath(); ctx.moveTo(x1 + cos(an) * d0, y1 + sin(an) * d0 * 0.8 + 40 * tau * tau * k); ctx.lineTo(x1 + cos(an) * d1, y1 + sin(an) * d1 * 0.8 + 40 * tau * tau * k); ctx.stroke();
    }
    ctx.globalAlpha = ga;
  };
  nominal.lightning = 200;

  FX.chain = (ctx, o, t) => {
    const P = prep(o, '#7a6bff', (c) => tint(c, 0.6)); if (!P) return;
    t = T01(t);
    let x0 = P.x, y0 = P.y, x1 = fin(o && o.x2, P.x), y1 = fin(o && o.y2, P.y);
    if (hypot(x1 - x0, y1 - y0) < 10) { x1 = x0 + cos(P.ang) * 260 * P.s * P.dir; y1 = y0 + sin(P.ang) * 260 * P.s; }
    const k = min(1.6, max(0.55, P.s)), ga = ctx.globalAlpha, F = floor(t * 14), L = hypot(x1 - x0, y1 - y0), dx = (x1 - x0) / L, dy = (y1 - y0) / L, nx = -dy, ny = dx;
    const head = eo3(ramp(t, 0, 0.4)), tail = sm(ramp(t, 0.5, 0.96)), fade = 1 - ramp(t, 0.8, 1), fs = P.seed + F * 17;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (head - tail > 0.02) {
      const amp = min(34, 12 + L * 0.06) * k, N = 12;
      for (let a = 0; a < 3; a++) {
        const w = [1, 0.62, 0.46][a], sgn = a === 1 ? -1 : 1;
        for (let i = 0; i < N; i++) {
          const u = tail + (head - tail) * i / (N - 1), sn = sin(PI * u);
          const off = amp * w * sn * (hs(fs, a * 40 + i) * 0.8 + sgn * 0.5 * sin(u * 9 + a * 2.1 + F * 1.3));
          BX[i] = x0 + dx * L * u + nx * off; BY[i] = y0 + dy * L * u + ny * off;
        }
        if (a === 0) {
          // a soft halo along the main arc, then the angular ribbon
          ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = P.c1;
          for (let g = 0; g < 2; g++) { ctx.globalAlpha = ga * fade * (0.07 + 0.06 * g); ctx.lineWidth = (26 - g * 10) * k; strokePts(ctx, BX, BY, N); }
          ctx.globalCompositeOperation = 'source-over';
          boltRibbon(ctx, BX, BY, N, 3.6 * k, (v) => 0.35 + 0.65 * pow(sin(PI * v), 0.5), P.c1, ga, fade, 1.9);
        } else {
          ctx.globalAlpha = ga * fade * 0.55; ctx.lineWidth = 4.4 * k; ctx.strokeStyle = INK; strokePts(ctx, BX, BY, N);
          ctx.globalAlpha = ga * fade * 0.95; ctx.lineWidth = 1.9 * k; ctx.strokeStyle = P.c2; strokePts(ctx, BX, BY, N);
        }
      }
      // beads racing along the arcs
      for (let b = 0; b < 4; b++) {
        const u = tail + (head - tail) * ((t * 2.4 + b / 4) % 1), sn = sin(PI * u), off = amp * 0.5 * sn * sin(u * 9 + F * 1.3);
        const bx = x0 + dx * L * u + nx * off, by = y0 + dy * L * u + ny * off;
        glowAt(ctx, bx, by, 16 * k, P.c2, 0.85 * fade); ctx.globalAlpha = ga * fade; disc(ctx, bx, by, 2.8 * k, WHITE);
      }
      ctx.globalAlpha = ga;
      glowAt(ctx, x0 + dx * L * head, y0 + dy * L * head, 34 * k, WHITE, 0.55 * fade * (1 - ramp(t, 0.4, 0.6)));
    }
    ctx.restore(); ctx.globalAlpha = ga;
    // node flares at both ends; the far one bursts on arrival
    glowAt(ctx, x0, y0, 36 * k, P.c1, 0.6 * env(t, 0.05, 0.4, 0.8));
    const arr = ramp(t, 0.38, 0.5) * (1 - ramp(t, 0.5, 0.95));
    if (arr > 0.02) {
      glowAt(ctx, x1, y1, 60 * k, P.c1, 0.7 * arr);
      ctx.globalAlpha = ga * arr; tk.sparkle(ctx, x1, y1, 22 * k * (0.5 + 0.5 * eo3(ramp(t, 0.38, 0.55))), { color: WHITE, rot: F * 0.3, glow: 0.3, thin: 0.14 });
      ctx.save(); ctx.translate(x1, y1); ctx.lineCap = 'round';
      const tau = ramp(t, 0.4, 0.85);
      for (let i = 0; i < cnt(9); i++) {
        const an = hv(P.seed, i + 30) * TAU, d0 = (14 + 46 * hv(P.seed, i + 60)) * k * eo3(tau);
        ctx.globalAlpha = ga * (1 - tau); ctx.strokeStyle = i % 2 ? WHITE : P.c1; ctx.lineWidth = 2.4 * k;
        ctx.beginPath(); ctx.moveTo(cos(an) * d0, sin(an) * d0); ctx.lineTo(cos(an) * (d0 + 9 * k), sin(an) * (d0 + 9 * k)); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.globalAlpha = ga;
  };
  nominal.chain = 160;

  // ===============================================================================================================
  // flame
  // ===============================================================================================================
  function tonguePath(ctx, bx, by, h, w, lean, curl) {
    ctx.moveTo(bx - w, by);
    ctx.bezierCurveTo(bx - w * 1.15, by - h * 0.32, bx + curl - w * 0.3, by - h * 0.62, bx + lean, by - h);
    ctx.bezierCurveTo(bx + curl + w * 0.55, by - h * 0.5, bx + w * 1.2, by - h * 0.28, bx + w, by);
    ctx.closePath();
  }
  // one cel-shaded tongue: ink line, body, mid, inner, white core
  function tongue(ctx, bx, by, hh, w, lean, curl, cols) {
    ctx.beginPath(); tonguePath(ctx, bx, by, hh, w, lean, curl);
    ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = cols[0]; ctx.fill();
    ctx.beginPath(); tonguePath(ctx, bx, by, hh * 0.82, w * 0.78, lean * 0.82, curl * 0.8); ctx.fillStyle = cols[1]; ctx.fill();
    ctx.beginPath(); tonguePath(ctx, bx, by, hh * 0.56, w * 0.5, lean * 0.55, curl * 0.5); ctx.fillStyle = cols[2]; ctx.fill();
    if (hh > 26) { ctx.beginPath(); tonguePath(ctx, bx, by, hh * 0.28, w * 0.26, lean * 0.3, curl * 0.3); ctx.fillStyle = WHITE; ctx.fill(); }
  }
  FX.flame = (ctx, o, t) => {
    const P = prep(o, '#ff9a2e', (c) => (luma(c) > 0.9 ? '#ffffff' : mix(tint(c, 0.35), '#ffe45e', 0.65))); if (!P) return;
    t = T01(t); place(ctx, P);
    const ga = ctx.globalAlpha, sd = P.seed, e = eo3(ramp(t, 0, 0.32)) * (1 - sm(ramp(t, 0.68, 1))), tq = floor(t * 14) / 14;
    const N = 9, cols = [mix(P.c1, '#b0245c', 0.34), P.c1, P.c2], wind = sin(TAU * (0.85 * tq + hv(sd, 77))) * 0.6 + hs(sd, 78) * 0.3;
    ctx.translate(0, 26);
    glowAt(ctx, 0, -50, 120, P.c1, 0.55 * e);
    glowAt(ctx, 0, -30, 60, P.c2, 0.5 * e);
    // scorch smear and an ember bed
    ctx.globalAlpha = ga * 0.5 * e; ctx.beginPath(); ctx.ellipse(0, 4, 58, 11, 0, 0, TAU); ctx.fillStyle = INK; ctx.fill();
    ctx.globalAlpha = ga * 0.85 * e; ctx.beginPath(); ctx.ellipse(0, 2, 42, 6.5, 0, 0, TAU); ctx.fillStyle = P.c1; ctx.fill();
    ctx.globalAlpha = ga;
    // small licks at the two edges, then the tall tongues; outermost first so the tall middle ones sit in front
    const items = [];
    for (let i = 0; i < N; i++) items.push({ i, fx: (i - 4) / 4, small: false });
    items.push({ i: 20, fx: -1.28, small: true }, { i: 21, fx: 1.3, small: true }, { i: 22, fx: -0.62, small: true }, { i: 23, fx: 0.66, small: true });
    items.sort((a, b) => (abs(a.fx) < abs(b.fx) ? 1 : abs(a.fx) > abs(b.fx) ? -1 : a.i - b.i));
    for (let oi = 0; oi < items.length; oi++) {
      const it = items[oi], i = it.i, fx = it.fx, bx = fx * 40 + hs(sd, i) * 5;
      const ph = hv(sd, i + 20), fq = 2.2 + 1.6 * hv(sd, i + 40), sw = sin(TAU * (fq * tq + ph)), cw = cos(TAU * (fq * tq + ph));
      const base = it.small ? 34 + 26 * hv(sd, i + 60) : 64 + 92 * hv(sd, i + 60) * (1 - 0.5 * fx * fx), hh = base * (1 - 0.3 * abs(fx) * abs(fx)) * (0.88 + 0.14 * sw) * e * (i === 4 ? 1.12 : 1);
      const w = (it.small ? 8 : 11 + 6 * hv(sd, i + 80)) * (0.6 + 0.4 * e);
      if (hh < 3) continue;
      const lean = sw * 11 + fx * 8 + wind * hh * 0.2, curl = cw * 9 * (i % 2 ? 1 : -1);
      tongue(ctx, bx, 0, hh, w, lean, curl, cols);
    }
    // detached wisps of fire lifting off the top
    for (let i = 0; i < cnt(4); i++) {
      const ts = 0.1 + 0.3 * hv(sd, i + 300), tau = c01((t - ts) / 0.42);
      if (t < ts || tau >= 1) continue;
      const x = hs(sd, i + 320) * 30 + sin(tau * 6 + i) * 9 + wind * 20 * tau, y = -(70 + 60 * hv(sd, i + 340)) - 80 * eo2(tau), s = 1 - tau * 0.7;
      ctx.globalAlpha = ga * (1 - tau * tau);
      tongue(ctx, x, y, 34 * s, 8 * s, wind * 5, 3, cols);
    }
    ctx.globalAlpha = ga;
    // embers
    const ne = cnt(15);
    for (let i = 0; i < ne; i++) {
      const ts = 0.55 * hv(sd, i + 100), tau = c01((t - ts) / 0.5);
      if (t < ts || tau >= 1) continue;
      const x = hs(sd, i + 120) * 50 + sin(tau * 5 + i) * 8 + 16 * tau + wind * 12 * tau, y = -(30 + 130 * hv(sd, i + 140)) * eo2(tau) - 10, r = (2.2 + 3 * hv(sd, i + 160)) * (1 - tau);
      ctx.globalAlpha = ga * (1 - tau * tau); ctx.save(); ctx.translate(x, y); ctx.rotate(tau * 3 + i);
      ctx.fillStyle = i % 3 === 0 ? P.c2 : P.c1; ctx.fillRect(-r, -r, r * 2, r * 2); ctx.restore();
    }
    ctx.restore(); ctx.globalAlpha = ga;
  };
  nominal.flame = 170;

  // ===============================================================================================================
  // frost
  // ===============================================================================================================
  function shardPath(ctx, len, w) {
    const b = 8, sh = b + (len - b) * 0.36;
    ctx.moveTo(b, 0); ctx.lineTo(sh, -w); ctx.lineTo(len, 0); ctx.lineTo(sh, w); ctx.closePath();
  }
  FX.frost = (ctx, o, t) => {
    const P = prep(o, '#8fdcff', () => '#ffffff'); if (!P) return;
    t = T01(t); place(ctx, P);
    const ga = ctx.globalAlpha, sd = P.seed, K = cnt(11), rot = hv(sd, 900) * TAU, dark = mix(P.c1, '#2559a8', 0.45), lite = tint(P.c1, 0.62);
    glowAt(ctx, 0, 0, 120 * (0.5 + 0.5 * eo3(t)), P.c1, 0.5 * (1 - ramp(t, 0.3, 0.9)));
    // frost ring
    const rr = ramp(t, 0.02, 0.62);
    if (rr > 0 && rr < 1) {
      ctx.globalAlpha = ga * (1 - rr) * 0.8; ctx.beginPath(); ctx.arc(0, 0, 100 * eo3(rr), 0, TAU);
      ctx.lineWidth = 6 * (1 - rr) + 1; ctx.strokeStyle = INK; ctx.stroke(); ctx.setLineDash([10, 7]); ctx.lineWidth = 3.4 * (1 - rr) + 0.6; ctx.strokeStyle = P.c2; ctx.stroke(); ctx.setLineDash([]);
    }
    // the crystals
    for (let i = 0; i < K; i++) {
      const long = i % 3 === 0, L = (44 + 36 * hv(sd, i + 10)) * (long ? 1.32 : 1), w = L * 0.17 + 3, a = (i + hs(sd, i + 30) * 0.22) / K * TAU + rot;
      const t0 = 0.02 + 0.03 * (i % 4), g = eoBack(ramp(t, t0, t0 + 0.26)), shat = ramp(t, 0.66 + 0.06 * hv(sd, i + 50), 1);
      if (g <= 0.02 || shat >= 1) continue;
      const len = max(4, L * g * (1 - 0.35 * shat)), ww = w * (0.4 + 0.6 * min(1, g)) * (1 - 0.5 * shat);
      ctx.save(); ctx.rotate(a); ctx.translate(shat * 14 * hv(sd, i + 70), 0);
      ctx.globalAlpha = ga * (1 - shat * shat);
      ctx.beginPath(); shardPath(ctx, len, ww); ctx.lineJoin = 'miter'; ctx.miterLimit = 6; ctx.lineWidth = 5.4; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = dark; ctx.fill();
      // two-tone facets: the upper half is the lit face
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(8 + (len - 8) * 0.36, -ww); ctx.lineTo(len, 0); ctx.closePath(); ctx.fillStyle = lite; ctx.fill();
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(len, 0); ctx.lineWidth = 1.6; ctx.strokeStyle = rgba(WHITE, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(8 + (len - 8) * 0.36, ww * 0.5); ctx.lineTo(len * 0.9, ww * 0.06); ctx.lineWidth = 1.4; ctx.strokeStyle = rgba(P.c1, 0.9); ctx.stroke();
      ctx.restore();
    }
    // floating gems between the crystals
    for (let i = 0; i < cnt(6); i++) {
      const a = (i + 0.5) / 6 * TAU + rot + hs(sd, i + 300) * 0.2, d = (74 + 30 * hv(sd, i + 320)) * eo3(ramp(t, 0.08, 0.5)) + 16 * ramp(t, 0.5, 1), r = (4.5 + 3.5 * hv(sd, i + 340)) * (1 - ramp(t, 0.6, 1)), al = env(t, 0.12, 0.6, 0.95);
      if (r < 0.6 || al < 0.02) continue;
      ctx.save(); ctx.translate(cos(a) * d, sin(a) * d + 30 * ramp(t, 0.55, 1) * ramp(t, 0.55, 1)); ctx.rotate(a); ctx.globalAlpha = ga * al;
      ctx.beginPath(); ctx.moveTo(r * 1.5, 0); ctx.lineTo(0, -r); ctx.lineTo(-r * 1.5, 0); ctx.lineTo(0, r); ctx.closePath(); ctx.lineWidth = 2.2; ctx.lineJoin = 'miter'; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = lite; ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = ga;
    // the snowflake star
    const sa = env(t, 0.1, 0.45, 0.8), gs = eo3(ramp(t, 0, 0.26));
    if (sa > 0.02) {
      ctx.save(); ctx.rotate(rot * 0.3 + 0.35 * t); ctx.globalAlpha = ga * sa; ctx.lineCap = 'round';
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass ? WHITE : INK; ctx.lineWidth = pass ? 3 : 7;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = i * PI / 3, l = 40 * gs;
          ctx.moveTo(0, 0); ctx.lineTo(cos(a) * l, sin(a) * l);
          for (const f of [0.5, 0.78]) { const px = cos(a) * l * f, py = sin(a) * l * f, bl = l * (f === 0.5 ? 0.3 : 0.2); ctx.moveTo(px, py); ctx.lineTo(px + cos(a + 0.8) * bl, py + sin(a + 0.8) * bl); ctx.moveTo(px, py); ctx.lineTo(px + cos(a - 0.8) * bl, py + sin(a - 0.8) * bl); }
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    const fl = 1 - ramp(t, 0, 0.14);
    if (fl > 0.02) { ctx.globalAlpha = ga * fl; ctx.beginPath(); starPath(ctx, 6, rot, (i) => (40 + 14 * hv(sd, i + 950)) * (0.6 + 0.4 * eo3(ramp(t, 0, 0.14))), 11); ctx.fillStyle = WHITE; ctx.fill(); }
    // shatter debris
    for (let i = 0; i < cnt(14); i++) {
      const tau = c01((t - 0.62 - 0.12 * hv(sd, i + 400)) / 0.38);
      if (tau <= 0 || tau >= 1) continue;
      const a = hv(sd, i + 420) * TAU, d = (36 + 60 * hv(sd, i + 440)) + 40 * tau, x = cos(a) * d + hs(sd, i + 450) * 20 * tau, y = sin(a) * d * 0.8 + 130 * tau * tau, r = (3 + 4 * hv(sd, i + 460)) * (1 - tau * 0.4);
      ctx.save(); ctx.translate(x, y); ctx.rotate(a + tau * 6); ctx.globalAlpha = ga * (1 - tau);
      ctx.beginPath(); ctx.moveTo(0, -r * 1.4); ctx.lineTo(r, r); ctx.lineTo(-r, r * 0.8); ctx.closePath(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = i % 2 ? WHITE : lite; ctx.fill();
      ctx.restore();
    }
    ctx.restore(); ctx.globalAlpha = ga;
  };
  nominal.frost = 130;

  // ===============================================================================================================
  // poison
  // ===============================================================================================================
  const PUFF = [[0, 0, 1], [-0.72, 0.22, 0.72], [0.78, 0.18, 0.74], [-0.22, -0.56, 0.66], [0.38, -0.5, 0.58]];
  // one cloud puff (five circles): an ink outline pass, a dark base, a lit shape offset toward the light, a highlight
  function puff(ctx, cx, cy, R, fl, baseCol, litCol, hiCol) {
    ctx.beginPath(); for (let c = 0; c < 5; c++) { const q = PUFF[c], x = cx + q[0] * R * fl, y = cy + q[1] * R, r = q[2] * R; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
    ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = baseCol; ctx.fill();
    ctx.beginPath(); for (let c = 0; c < 5; c++) { const q = PUFF[c], x = cx + (q[0] * R + R * 0.12) * fl, y = cy + q[1] * R - R * 0.14, r = q[2] * R * 0.8; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
    ctx.fillStyle = litCol; ctx.fill();
    disc(ctx, cx + R * 0.34 * fl, cy - R * 0.42, R * 0.2, hiCol);
  }
  FX.poison = (ctx, o, t) => {
    const P = prep(o, '#74dc42', (c) => mix(shade(c, 0.1), '#8a3fd8', 0.78)); if (!P) return;
    t = T01(t); place(ctx, P);
    const ga = ctx.globalAlpha, sd = P.seed, np = cnt(8), lit = tint(P.c1, 0.28), dark = P.c2, deep = mix(dark, INK, 0.35);
    ctx.translate(0, 16);
    glowAt(ctx, 0, -14, 120, P.c1, 0.5 * env(t, 0.15, 0.6, 0.95));
    // two big slow banks of violet fog behind everything
    for (let b = 0; b < 2; b++) {
      const tau = ramp(t, 0.04 + b * 0.08, 0.9), a = env(tau, 0.2, 0.6, 1) * 0.75;
      if (a < 0.02) continue;
      ctx.globalAlpha = ga * a; puff(ctx, (b ? 26 : -26) + sin(tau * 3 + b) * 8, -6 - 40 * eo2(tau) - b * 14, (30 + 8 * b) * (0.5 + 0.5 * eo3(tau)), b ? -1 : 1, deep, dark, rgba(lit, 0.4));
    }
    // curling wisps
    for (let w = 0; w < 3; w++) {
      const tau = ramp(t, 0.05 + w * 0.08, 0.9), a = env(tau, 0.2, 0.6, 1) * 0.6;
      if (a < 0.02) continue;
      const n = 20, x0 = (w - 1) * 34 + hs(sd, w + 900) * 10;
      for (let i = 0; i < n; i++) { const v = i / (n - 1), y = -v * (100 + 30 * w) * (0.3 + 0.7 * tau), x = x0 + sin(v * 7 + w * 2 + tau * 4) * (10 + 16 * v) * (0.4 + tau); QX[i] = x; QY[i] = y; QW[i] = 5 * sin(PI * pow(v, 0.7)) + 0.1; }
      ctx.globalAlpha = ga * a; ctx.beginPath(); ribbonPath(ctx, n, 1, 0); ctx.fillStyle = w % 2 ? P.c1 : P.c2; ctx.fill();
    }
    // cloud puffs rising and billowing
    for (let i = 0; i < np; i++) {
      const ts = 0.03 + 0.4 * hv(sd, i) * (i / np + 0.3), tau = (t - ts) / 0.58;
      if (tau <= 0 || tau >= 1) continue;
      const R = (16 + 17 * hv(sd, i + 20)) * (0.35 + 0.65 * eo3(min(1, tau * 1.6))) * (1 + 0.3 * tau), cx = hs(sd, i + 40) * 44 + sin(tau * 3 + i) * 9, cy = 6 - (30 + 84 * hv(sd, i + 60)) * eo2(tau);
      ctx.globalAlpha = ga * ramp(tau, 0, 0.18) * (1 - ramp(tau, 0.62, 1));
      puff(ctx, cx, cy, R, hs(sd, i + 80) > 0 ? 1 : -1, i % 2 ? dark : mix(dark, P.c1, 0.4), i % 2 ? mix(P.c1, dark, 0.3) : P.c1, rgba(lit, 0.85));
    }
    // bubbles that rise, wobble and pop
    for (let i = 0; i < cnt(10); i++) {
      const ts = 0.5 * hv(sd, i + 200), tau = (t - ts) / 0.55;
      if (tau <= 0 || tau >= 1) continue;
      const r = 3.6 + 5.6 * hv(sd, i + 220), x = hs(sd, i + 240) * 44 + sin(tau * 9 + i) * 5, y = 16 - (46 + 90 * hv(sd, i + 260)) * eo2(tau);
      if (tau < 0.86) {
        ctx.globalAlpha = ga * ramp(tau, 0, 0.1);
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = rgba(P.c1, 0.3); ctx.fill(); ctx.lineWidth = 3.2; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 1.4; ctx.strokeStyle = lit; ctx.stroke();
        disc(ctx, x - r * 0.32, y - r * 0.36, max(0.9, r * 0.24), WHITE);
      } else {
        const pk = ramp(tau, 0.86, 1);
        ctx.globalAlpha = ga * (1 - pk); ctx.lineWidth = 1.6; ctx.strokeStyle = lit; ctx.beginPath(); ctx.arc(x, y, r * (1 + 0.8 * pk), 0, TAU); ctx.stroke();
        ctx.beginPath(); for (let d = 0; d < 6; d++) { const a = d / 6 * TAU + i, r0 = r * (1.3 + pk), r1 = r0 + 4 * (1 - pk); ctx.moveTo(x + cos(a) * r0, y + sin(a) * r0); ctx.lineTo(x + cos(a) * r1, y + sin(a) * r1); } ctx.stroke();
      }
    }
    ctx.restore(); ctx.globalAlpha = ga;
  };
  nominal.poison = 130;

  // ===============================================================================================================
  // shield
  // ===============================================================================================================
  FX.shield = (ctx, o, t) => {
    const P = prep(o, '#5fb4ff', (c) => tint(c, 0.62)); if (!P) return;
    t = T01(t);
    const rw = max(24, fin(o && o.w, 124)) / 2 * 1.06, rh = max(24, fin(o && o.h, 160)) / 2 * 1.06;
    ctx.save(); ctx.translate(P.x, P.y); if (P.s !== 1) ctx.scale(P.s, P.s);
    const ga = ctx.globalAlpha, pop = 0.82 + 0.18 * eoBack(ramp(t, 0, 0.26)), a = ramp(t, 0, 0.1) * (1 - ramp(t, 0.6, 1)), sd = P.seed;
    if (a < 0.02) { ctx.restore(); return; }
    ctx.scale(pop, pop);
    // where the hit lands: a point on the rim facing the attacker (dir < 0: the right side)
    const ia = (P.dir < 0 ? 0 : PI) + hs(sd, 1) * 0.9 + P.ang, ix = cos(ia) * rw, iy = sin(ia) * rh, ripple = 30 + eo3(ramp(t, 0.02, 0.85)) * (max(rw, rh) * 2.3);
    // interior tint (a soft glow squashed to the shield) and the rim
    ctx.save(); ctx.scale(1, rh / rw); glowAt(ctx, 0, 0, rw * 1.05, P.c1, 0.5 * a); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, rw, rh, 0, 0, TAU); ctx.clip();
    // honeycomb
    const hr = max(13, min(rw, rh) / 3.3), hw = hr * 1.5, hh = hr * 1.7320508;
    const buckets = [[], [], [], []];
    for (let q = -floor(rw / hw) - 1; q <= floor(rw / hw) + 1; q++) {
      for (let r = -floor(rh / hh) - 2; r <= floor(rh / hh) + 2; r++) {
        const cx = q * hw, cy = (r + (q & 1 ? 0.5 : 0)) * hh;
        if ((cx * cx) / (rw * rw) + (cy * cy) / (rh * rh) > 1.25) continue;
        const d = hypot(cx - ix, cy - iy), b = Math.exp(-pow((d - ripple) / (hr * 1.8), 2)) * (1 - 0.6 * ramp(t, 0.3, 0.9));
        buckets[b > 0.7 ? 3 : b > 0.4 ? 2 : b > 0.15 ? 1 : 0].push(cx, cy);
      }
    }
    ctx.lineJoin = 'round';
    const bAlpha = [0.3, 0.55, 0.8, 1], bWidth = [1.4, 2, 2.8, 3.4];
    for (let b = 0; b < 4; b++) {
      const arr = buckets[b];
      if (!arr.length) continue;
      ctx.beginPath();
      for (let c = 0; c < arr.length; c += 2) { for (let v = 0; v < 6; v++) { const an = v * PI / 3, x = arr[c] + cos(an) * hr * 0.94, y = arr[c + 1] + sin(an) * hr * 0.94; if (v === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.closePath(); }
      if (b >= 2) { ctx.globalAlpha = ga * a * (b === 3 ? 0.42 : 0.2); ctx.fillStyle = P.c2; ctx.fill(); }
      ctx.globalAlpha = ga * a * bAlpha[b]; ctx.lineWidth = bWidth[b]; ctx.strokeStyle = b >= 2 ? WHITE : P.c2; ctx.stroke();
    }
    // a diagonal glass sheen sweeping across
    const sw = (ramp(t, 0.05, 0.7) - 0.5) * (rw * 3.4);
    ctx.globalAlpha = ga * a * 0.22; ctx.fillStyle = WHITE; ctx.beginPath();
    ctx.moveTo(sw - 24, -rh * 1.2); ctx.lineTo(sw + 4, -rh * 1.2); ctx.lineTo(sw - rh * 0.7 + 4, rh * 1.2); ctx.lineTo(sw - rh * 0.7 - 24, rh * 1.2); ctx.closePath(); ctx.fill();
    ctx.restore();
    // rim: an inner glow band (fresnel), an ink line outside, the accent, a white edge
    ctx.globalAlpha = ga * a * 0.35; ctx.beginPath(); ctx.ellipse(0, 0, rw - 5, rh - 5, 0, 0, TAU); ctx.lineWidth = 9; ctx.strokeStyle = P.c1; ctx.stroke();
    ctx.globalAlpha = ga * a; ctx.beginPath(); ctx.ellipse(0, 0, rw, rh, 0, 0, TAU);
    ctx.lineWidth = 8; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 5; ctx.strokeStyle = P.c1; ctx.stroke(); ctx.lineWidth = 1.8; ctx.strokeStyle = WHITE; ctx.stroke();
    // the impact flare on the rim
    const fa = env(t, 0.06, 0.2, 0.55);
    if (fa > 0.02) { glowAt(ctx, ix, iy, 60, WHITE, 0.8 * fa); ctx.globalAlpha = ga * fa; tk.sparkle(ctx, ix, iy, 26, { color: WHITE, rot: 0.3, glow: 0.3, thin: 0.14 }); }
    ctx.restore(); ctx.globalAlpha = ga;
  };
  nominal.shield = 110;

  // ===============================================================================================================
  // heal
  // ===============================================================================================================
  function plusPath(ctx, x, y, r) {
    const a = r * 0.36;
    ctx.moveTo(x - a, y - r); ctx.lineTo(x + a, y - r); ctx.lineTo(x + a, y - a); ctx.lineTo(x + r, y - a); ctx.lineTo(x + r, y + a); ctx.lineTo(x + a, y + a);
    ctx.lineTo(x + a, y + r); ctx.lineTo(x - a, y + r); ctx.lineTo(x - a, y + a); ctx.lineTo(x - r, y + a); ctx.lineTo(x - r, y - a); ctx.lineTo(x - a, y - a); ctx.closePath();
  }
  FX.heal = (ctx, o, t) => {
    const P = prep(o, '#7dffb0', () => '#ffffff'); if (!P) return;
    t = T01(t); place(ctx, P);
    const ga = ctx.globalAlpha, sd = P.seed, e = env(t, 0.16, 0.6, 1);
    // a soft light column and a ground ring
    ctx.save(); ctx.translate(0, -34); ctx.scale(0.55, 1.5); glowAt(ctx, 0, 0, 90, P.c1, 0.55 * e); ctx.restore();
    glowAt(ctx, 0, 0, 60, WHITE, 0.3 * env(t, 0.1, 0.35, 0.7));
    const rg = ramp(t, 0, 0.62);
    if (rg > 0 && rg < 1) {
      ctx.globalAlpha = ga * (1 - rg); const rx = 26 + 40 * eo3(rg);
      ctx.beginPath(); ctx.ellipse(0, 40, rx, rx * 0.28, 0, 0, TAU); ctx.lineWidth = 6 * (1 - rg) + 1.4; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 3 * (1 - rg) + 0.8; ctx.strokeStyle = P.c1; ctx.stroke();
    }
    // motes
    for (let i = 0; i < cnt(18); i++) {
      const ts = 0.5 * hv(sd, i), tau = (t - ts) / 0.55;
      if (tau <= 0 || tau >= 1) continue;
      const x = hs(sd, i + 20) * 46 + sin(tau * 6 + i * 1.7) * 7, y = 40 - (100 + 60 * hv(sd, i + 40)) * eo2(tau), r = 2.6 + 3.6 * hv(sd, i + 60), a = pow(sin(PI * tau), 0.7);
      glowAt(ctx, x, y, r * 3.4, i % 3 ? P.c1 : WHITE, 0.8 * a); ctx.globalAlpha = ga * a; disc(ctx, x, y, r * 0.55, WHITE);
    }
    ctx.globalAlpha = ga;
    // chunky plus signs
    for (let i = 0; i < 3; i++) {
      const ts = 0.05 + 0.14 * i, tau = (t - ts) / 0.62;
      if (tau <= 0 || tau >= 1) continue;
      const x = (i - 1) * 32 + hs(sd, i + 90) * 8, y = 24 - (84 + 20 * i) * eo2(tau), r = (13 + 4 * hv(sd, i + 100)) * (0.4 + 0.6 * eoBack(ramp(tau, 0, 0.3))), a = sin(PI * pow(tau, 0.8));
      ctx.globalAlpha = ga * a;
      ctx.beginPath(); plusPath(ctx, x, y, r); ctx.lineJoin = 'miter'; ctx.lineWidth = 6.5; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = P.c1; ctx.fill();
      ctx.beginPath(); plusPath(ctx, x, y, r * 0.58); ctx.fillStyle = WHITE; ctx.fill();
    }
    ctx.globalAlpha = ga;
    for (let i = 0; i < 4; i++) {
      const ts = 0.1 + 0.3 * hv(sd, i + 120), tau = c01((t - ts) / 0.35);
      if (tau <= 0 || tau >= 1) continue;
      tk.sparkle(ctx, hs(sd, i + 140) * 44, -10 - 60 * hv(sd, i + 160), 10 * sin(PI * tau), { color: i % 2 ? WHITE : P.c1, rot: tau, glow: 0.3 });
    }
    ctx.restore(); ctx.globalAlpha = ga;
  };
  nominal.heal = 120;

  // ===============================================================================================================
  // buff and debuff: aura glyph streams
  // ===============================================================================================================
  function chevron(ctx, x, y, w, h, up, col, inkw, colw) {
    // a thick "^" (up) or "v" (down) centred on (x, y)
    const s = up ? -1 : 1;
    ctx.beginPath(); ctx.moveTo(x - w, y - s * h * 0.5); ctx.lineTo(x, y + s * h * 0.5); ctx.lineTo(x + w, y - s * h * 0.5);
    ctx.strokeStyle = INK; ctx.lineWidth = inkw; ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = colw; ctx.stroke();
    ctx.strokeStyle = WHITE; ctx.lineWidth = max(1, colw * 0.3); ctx.stroke();
  }
  function aura(ctx, P, t, up) {
    place(ctx, P);
    const ga = ctx.globalAlpha, sd = P.seed, e = env(t, 0.14, 0.7, 1), yTop = -104, yBot = 42, sgn = up ? -1 : 1;
    ctx.lineJoin = 'miter'; ctx.miterLimit = 5; ctx.lineCap = 'round';
    // the light column (a debuff darkens the air instead)
    if (up) { ctx.save(); ctx.translate(0, -30); ctx.scale(0.65, 1.5); glowAt(ctx, 0, 0, 90, P.c1, 0.55 * e); ctx.restore(); }
    else { ctx.save(); ctx.translate(0, -30); ctx.scale(0.8, 1.45); ctx.globalAlpha = ga * 0.7 * e; tk.glow(ctx, 0, 0, 84, INK, 0.9, false); ctx.restore(); ctx.globalAlpha = ga; ctx.save(); ctx.translate(0, -20); ctx.scale(0.5, 1.4); glowAt(ctx, 0, 0, 70, P.c1, 0.34 * e); ctx.restore(); }
    // the aura itself: flame-like tongues racing along the body (up for a buff, down for a debuff), the shonen power-up look
    for (let i = 0; i < cnt(9); i++) {
      const ph = (t * (1.7 + 0.7 * hv(sd, i + 300)) + hv(sd, i + 320)) % 1, x = hs(sd, i + 340) * 44, len = 34 + 40 * hv(sd, i + 360), y = up ? lerp(yBot, yTop - len * 0.3, ph) : lerp(yTop, yBot + len * 0.3, ph), a = sin(PI * ph) * e * 0.75, w = 4 + 4 * hv(sd, i + 380);
      if (a < 0.03) continue;
      const lean = sin(ph * 7 + i) * 8;
      ctx.globalAlpha = ga * a; ctx.beginPath(); tonguePath(ctx, x, y, -sgn * len, w, lean, lean * 0.5 * (i % 2 ? 1 : -1));
      if (up) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * a * 0.8; }
      ctx.fillStyle = up ? (i % 3 === 0 ? tint(P.c1, 0.6) : P.c1) : (i % 2 ? mix(P.c1, INK, 0.55) : mix(INK, P.c1, 0.2)); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    // the magic circle at the feet with rotating dashes
    ctx.globalAlpha = ga * e * 0.9; ctx.beginPath(); ctx.ellipse(0, 42, 48, 13.5, 0, 0, TAU); ctx.lineWidth = 6.5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.lineWidth = 3.2; ctx.strokeStyle = P.c1; ctx.stroke();
    ctx.setLineDash([12, 8]); ctx.lineDashOffset = -t * (up ? 90 : -90); ctx.beginPath(); ctx.ellipse(0, 42, 35, 10, 0, 0, TAU); ctx.lineWidth = 2; ctx.strokeStyle = WHITE; ctx.stroke(); ctx.setLineDash([]);
    // the sweeping ring: feet to head (buff) or head to feet (debuff), with three fading echoes
    const sweep = sm(ramp(t, 0.04, 0.74));
    for (let g = 3; g >= 0; g--) {
      const sp = c01(sweep - g * 0.05), y = up ? lerp(yBot, yTop, sp) : lerp(yTop, yBot, sp), a = (g === 0 ? 1 : 0.34 / g) * e * (sweep > 0.02 && sweep < 0.99 ? 1 : 0.3);
      ctx.globalAlpha = ga * a; ctx.beginPath(); ctx.ellipse(0, y, 42, 11.5, 0, 0, TAU);
      ctx.lineWidth = g === 0 ? 7.5 : 4; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = g === 0 ? 4.4 : 2.4; ctx.strokeStyle = P.c1; ctx.stroke();
      if (g === 0) { ctx.lineWidth = 1.6; ctx.strokeStyle = WHITE; ctx.stroke(); }
    }
    // three columns of chunky chevrons climbing (or sinking)
    for (let c = 0; c < 3; c++) {
      for (let i = 0; i < 3; i++) {
        const ph = ((t * 1.7 + c * 0.37 + i / 3) % 1), y = up ? lerp(yBot, yTop, ph) : lerp(yTop, yBot, ph), a = sin(PI * ph) * e;
        if (a < 0.03) continue;
        const sz = 0.85 + 0.4 * hv(sd, c * 3 + i);
        ctx.globalAlpha = ga * a; chevron(ctx, (c - 1) * 28, y, 12 * sz, 11 * sz, up, P.c1, 10.5, 6.5);
      }
    }
    // motes rising, or ash flecks falling
    for (let i = 0; i < cnt(10); i++) {
      const ph = ((t * 1.3 + hv(sd, i + 60)) % 1), x = hs(sd, i + 80) * 44 + sin(ph * 6 + i) * 4, y = up ? lerp(yBot, yTop - 10, ph) : lerp(yTop, yBot, ph * ph), a = sin(PI * ph) * e;
      if (up) { glowAt(ctx, x, y, 8, P.c1, 0.9 * a); ctx.globalAlpha = ga * a; disc(ctx, x, y, 1.8, WHITE); }
      else {
        // grey ash and frost flecks (the Hush), short dashes tumbling down
        const fl = 3 + 2.6 * hv(sd, i + 100), fa = (hv(sd, i + 110) - 0.5) * 2;
        ctx.globalAlpha = ga * a; ctx.beginPath(); ctx.moveTo(x - cos(fa) * fl, y - sin(fa) * fl); ctx.lineTo(x + cos(fa) * fl, y + sin(fa) * fl);
        ctx.lineWidth = 3.4; ctx.strokeStyle = '#8e8aa3'; ctx.stroke(); ctx.lineWidth = 1.5; ctx.strokeStyle = i % 2 ? '#f2f0f6' : P.c1; ctx.stroke();
      }
    }
    ctx.restore(); ctx.globalAlpha = ga;
  }
  FX.buff = (ctx, o, t) => { const P = prep(o, '#ffe45e', (c) => tint(c, 0.55)); if (P) aura(ctx, P, T01(t), true); };
  FX.debuff = (ctx, o, t) => { const P = prep(o, '#b58bff', (c) => tint(c, 0.4)); if (P) aura(ctx, P, T01(t), false); };
  nominal.buff = 120; nominal.debuff = 120;

  // ===============================================================================================================
  // sparkle
  // ===============================================================================================================
  FX.sparkle = (ctx, o, t) => {
    const P = prep(o, '#ffe9a8', () => '#ffffff'); if (!P) return;
    t = T01(t); place(ctx, P);
    const ga = ctx.globalAlpha, sd = P.seed, e = env(t, 0.12, 0.55, 1);
    glowAt(ctx, 0, 0, 80, P.c1, 0.42 * e);
    // the big lens-flare star with a long cross flare
    const big = sin(PI * ramp(t, 0, 0.6));
    if (big > 0.02) {
      ctx.globalAlpha = ga * big;
      for (let ax = 0; ax < 2; ax++) {
        const L = 118 * eo3(ramp(t, 0, 0.3)), w = 3.4;
        ctx.save(); ctx.rotate(ax * PI / 2 + 0.3 * t); ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(0, -w); ctx.lineTo(L, 0); ctx.lineTo(0, w); ctx.closePath(); ctx.fillStyle = WHITE; ctx.fill(); ctx.restore();
      }
      tk.sparkle(ctx, 0, 0, 40 * (0.5 + 0.5 * eoBack(ramp(t, 0, 0.3))), { color: WHITE, rot: 0.785 * t, glow: 0.7, thin: 0.13 });
    }
    ctx.globalAlpha = ga;
    // the scatter
    for (let i = 0; i < cnt(8); i++) {
      const ts = 0.06 + 0.4 * hv(sd, i), tau = c01((t - ts) / 0.46);
      if (tau <= 0 || tau >= 1) continue;
      const an = hv(sd, i + 20) * TAU, r = 30 + 62 * hv(sd, i + 40), sz = (9 + 11 * hv(sd, i + 60)) * pow(sin(PI * tau), 0.85);
      tk.sparkle(ctx, cos(an) * r, sin(an) * r * 0.8 - 6, sz, { color: i % 3 === 0 ? P.c1 : i % 3 === 1 ? WHITE : P.c2, rot: tau * 1.3 + hv(sd, i + 80), glow: 0.35, thin: 0.15 });
    }
    // gold-leaf flecks drifting up
    for (let i = 0; i < cnt(9); i++) {
      const ts = 0.03 + 0.4 * hv(sd, i + 200), tau = c01((t - ts) / 0.55);
      if (tau <= 0 || tau >= 1) continue;
      const x = hs(sd, i + 220) * 70 + sin(tau * 5 + i) * 6, y = 10 - 20 * hv(sd, i + 240) - 70 * eo2(tau), r = 2 + 2.4 * hv(sd, i + 260);
      ctx.globalAlpha = ga * sin(PI * tau); ctx.save(); ctx.translate(x, y); ctx.rotate(tau * 4 + i);
      ctx.beginPath(); ctx.moveTo(0, -r * 1.5); ctx.lineTo(r, 0); ctx.lineTo(0, r * 1.5); ctx.lineTo(-r, 0); ctx.closePath(); ctx.fillStyle = i % 2 ? pal.gold : P.c2; ctx.fill(); ctx.restore();
    }
    ctx.restore(); ctx.globalAlpha = ga;
  };
  nominal.sparkle = 120;

  // ===============================================================================================================
  // speedLines
  // ===============================================================================================================
  FX.speedLines = (ctx, o, t) => {
    const P = prep(o, WHITE, null); if (!P) return;
    t = T01(t);
    const box = !!(o && typeof o.w === 'number' && o.w > 0 && typeof o.h === 'number' && o.h > 0), dirMode = !!(o && o.kind === 'dir');
    const fx = fin(o && o.x, box ? P.w / 2 : 640), fy = fin(o && o.y, box ? P.h / 2 : 360), ga = ctx.globalAlpha, F = floor(t * 16), sd = P.seed + F * 17, a = env(t, 0.1, 0.5, 1) * 0.92;
    if (a < 0.02) return;
    ctx.save();
    if (box) { ctx.beginPath(); ctx.rect(0, 0, P.w, P.h); ctx.clip(); }
    ctx.globalAlpha = ga * a; ctx.fillStyle = P.c1;
    if (dirMode) {
      ctx.translate(fx, fy); ctx.rotate(P.ang);
      const half = box ? hypot(P.w, P.h) / 2 : 130 * P.s, n = cnt(box ? 34 : 16), lenK = box ? 1.5 : 0.6 * P.s;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const y = hs(sd, i) * half, len = (150 + 300 * hv(sd, i + 40)) * lenK, x = hs(sd, i + 80) * half + 260 * t * (0.6 + hv(sd, i + 120)) * (P.dir < 0 ? -1 : 1), w = (1.2 + 3.2 * hv(sd, i + 160)) * min(1.6, P.s);
        ctx.moveTo(x - len, y); ctx.lineTo(x - len * 0.4, y - w); ctx.lineTo(x + len * 0.12, y); ctx.lineTo(x - len * 0.4, y + w); ctx.closePath();
      }
      ctx.fill();
    } else {
      const n = cnt(box ? 46 : 24), r0 = (box ? 96 : 44) * P.s * (0.85 + 0.6 * eo3(t)), r1 = box ? hypot(max(fx, P.w - fx), max(fy, P.h - fy)) + 24 : 250 * P.s, rot = P.ang;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const an = rot + (i + hv(sd, i) * 0.85) / n * TAU, ri = r0 * (1 + 0.7 * hv(sd, i + 50)), ro = box ? r1 : ri + (r1 - ri) * (0.5 + 0.5 * hv(sd, i + 90)), wd = box ? 0.006 + 0.016 * hv(sd, i + 130) : 0.02 + 0.035 * hv(sd, i + 130);
        ctx.moveTo(fx + cos(an) * ri, fy + sin(an) * ri); ctx.lineTo(fx + cos(an - wd) * ro, fy + sin(an - wd) * ro); ctx.lineTo(fx + cos(an + wd) * ro, fy + sin(an + wd) * ro); ctx.closePath();
      }
      ctx.fill();
    }
    ctx.restore(); ctx.globalAlpha = ga;
  };
  nominal.speedLines = 0;

  // ===============================================================================================================
  // impactFrame
  // ===============================================================================================================
  FX.impactFrame = (ctx, o, t) => {
    const P = prep(o, WHITE, null); if (!P) return;
    t = T01(t);
    const w = P.w, h = P.h, fx = fin(o && o.x, w / 2), fy = fin(o && o.y, h / 2), ga = ctx.globalAlpha;
    if (tk.opt && tk.opt.reduceMotion) {                                    // no flash: one soft tint that fades
      ctx.save(); ctx.globalAlpha = ga * 0.2 * (1 - t) * (1 - t); ctx.fillStyle = P.c1; ctx.fillRect(0, 0, w, h); ctx.restore(); return;
    }
    const inv = t < 0.5 ? 1 : 1 - ramp(t, 0.5, 1), F = floor(t * 20), sd = P.seed + F * 13;
    if (inv < 0.02) return;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    // 1: the negative
    ctx.globalCompositeOperation = 'difference'; ctx.globalAlpha = ga * inv; ctx.fillStyle = WHITE; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    // 2: crush the edges to ink so the middle burns, then rays converging on the hit, alternating light and ink wedges
    ctx.globalAlpha = ga * inv; tk.vignette(ctx, w, h, { color: INK, alpha: 0.82, inner: 0.16 });
    const R = hypot(max(fx, w - fx), max(fy, h - fy)) + 30, NR = 30, ra = inv * (1 - 0.3 * ramp(t, 0.3, 0.9));
    ctx.globalAlpha = ga * 0.92 * ra; ctx.fillStyle = WHITE; ctx.beginPath();
    for (let i = 0; i < NR; i += 2) {
      const an = (i + hs(sd, i) * 0.3) / NR * TAU + P.ang, wd = TAU / NR * (0.5 + 0.5 * hv(sd, i + 40)), r0 = 36 + 100 * hv(sd, i + 80);
      ctx.moveTo(fx + cos(an) * r0, fy + sin(an) * r0); ctx.lineTo(fx + cos(an - wd * 0.5) * R, fy + sin(an - wd * 0.5) * R); ctx.lineTo(fx + cos(an + wd * 0.5) * R, fy + sin(an + wd * 0.5) * R); ctx.closePath();
    }
    ctx.fill();
    ctx.globalAlpha = ga * 0.85 * ra; ctx.fillStyle = INK; ctx.beginPath();
    for (let i = 1; i < NR; i += 2) {
      const an = (i + hs(sd, i + 200) * 0.3) / NR * TAU + P.ang, wd = TAU / NR * (0.4 + 0.4 * hv(sd, i + 240)), r0 = 60 + 120 * hv(sd, i + 280);
      ctx.moveTo(fx + cos(an) * r0, fy + sin(an) * r0); ctx.lineTo(fx + cos(an - wd * 0.5) * R, fy + sin(an - wd * 0.5) * R); ctx.lineTo(fx + cos(an + wd * 0.5) * R, fy + sin(an + wd * 0.5) * R); ctx.closePath();
    }
    ctx.fill();
    // 3: a hard black-and-white star on the hit itself
    const sr = 120 * (1 - 0.25 * t) * eo3(ramp(t, 0, 0.2)), n = 11;
    if (sr > 4) {
      ctx.globalAlpha = ga * inv; ctx.translate(fx, fy);
      ctx.beginPath(); starPath(ctx, n, hv(sd, 900) * TAU, (i) => sr * (i % 2 ? 0.7 : 1.0 + 0.25 * hv(sd, i + 300)), sr * 0.34); ctx.fillStyle = INK; ctx.fill(); ctx.lineJoin = 'miter'; ctx.lineWidth = 6; ctx.strokeStyle = WHITE; ctx.stroke();
      ctx.beginPath(); starPath(ctx, n, hv(sd, 900) * TAU + PI / n, (i) => sr * 0.5 * (0.8 + 0.3 * hv(sd, i + 340)), sr * 0.18); ctx.fillStyle = WHITE; ctx.fill();
    }
    ctx.restore(); ctx.globalAlpha = ga;
  };

  // ===============================================================================================================
  // glyph runs: heavy lettering baked one character at a time (sfxText, numberPop)
  // ===============================================================================================================
  const advCache = new Map();
  let measureCtx = null;
  function advOf(ch) {
    let v = advCache.get(ch);
    if (v !== undefined) return v;
    v = 0.6;
    try {
      if (!measureCtx) { const c = document.createElement('canvas'); c.width = 8; c.height = 8; measureCtx = c.getContext('2d'); }
      measureCtx.font = '900 100px ' + tk.font.num;
      const m = measureCtx.measureText(ch).width / 100;
      if (m > 0.05 && m < 2) v = m;
    } catch (e) { v = 0.6; }
    advCache.set(ch, v);
    return v;
  }
  const GLYPH_H = 176, GLYPH_PAD = 34;
  // st: {a, b (gradient top/bottom hex), ink, shadow (hex or null), edge (hex or null), key}
  function glyphSprite(ch, st) {
    const adv = advOf(ch), w = adv * 100 + GLYPH_PAD * 2, h = GLYPH_H;
    return ART.sprite('fx|glyph|' + st.key + '|' + ch, w, h, (g) => {
      const cx = w / 2, cy = h / 2 + 4;
      g.font = '900 100px ' + tk.font.num; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.miterLimit = 2;
      if (st.shadow) { g.fillStyle = st.shadow; g.strokeStyle = st.shadow; g.lineWidth = st.lw; g.strokeText(ch, cx + st.so, cy + st.so * 1.25); g.fillText(ch, cx + st.so, cy + st.so * 1.25); }
      if (st.edge) { g.strokeStyle = st.edge; g.lineWidth = st.lw + 12; g.strokeText(ch, cx, cy); }
      g.strokeStyle = st.ink; g.lineWidth = st.lw; g.strokeText(ch, cx, cy);
      const gr = g.createLinearGradient(0, cy - 42, 0, cy + 42);
      gr.addColorStop(0, st.a); gr.addColorStop(0.5, st.a); gr.addColorStop(0.52, st.b); gr.addColorStop(1, st.b);       // a hard cel split, not a soft gradient
      g.fillStyle = gr; g.fillText(ch, cx, cy);
      g.lineWidth = 3; g.strokeStyle = rgba(WHITE, 0.55); g.strokeText(ch, cx - 1, cy - 1);
    });
  }
  // draws the run centred on (0, 0): per(i, n) -> {a, s, dx, dy, rot} for each character. size is the font size in px.
  function glyphRun(ctx, str, st, size, per) {
    const n = str.length, ga = ctx.globalAlpha, k = size / 100, adv = [];
    let total = 0;
    for (let i = 0; i < n; i++) { adv[i] = advOf(str[i]) * size * 0.97; total += adv[i]; }
    let x = -total / 2;
    for (let i = 0; i < n; i++) {
      const ch = str[i], c = per(i, n);
      if (ch !== ' ' && c.a > 0.01 && c.s > 0.01) {
        const spr = glyphSprite(ch, st);
        if (!spr._inert) {
          const sw = (advOf(ch) * 100 + GLYPH_PAD * 2) * k * c.s, sh = GLYPH_H * k * c.s;
          ctx.save(); ctx.translate(x + adv[i] / 2 + c.dx, c.dy); if (c.rot) ctx.rotate(c.rot);
          ctx.globalAlpha = ga * c.a; ctx.drawImage(spr, -sw / 2, -sh / 2, sw, sh);
          if (c.flash > 0.02) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * c.a * c.flash; ctx.drawImage(spr, -sw / 2, -sh / 2, sw, sh); }
          ctx.restore();
        }
      }
      x += adv[i];
    }
    ctx.globalAlpha = ga;
  }

  // ===============================================================================================================
  // sfxText
  // ===============================================================================================================
  FX.sfxText = (ctx, o, t) => {
    const P = prep(o, '#fff8f0', () => '#e8383d'); if (!P) return;
    t = T01(t);
    const str = String(o && o.text !== undefined && o.text !== null && o.text !== '' ? o.text : 'ZAN!').slice(0, 12), n = str.length;
    place(ctx, P);
    const ga = ctx.globalAlpha, sd = P.seed, F = floor(t * 30), size = 74;
    const st = { key: 'sfx|' + P.c1 + '|' + P.c2, a: P.c1, b: mix(shade(P.c1, 0.1), P.c2, 0.32), ink: INK, shadow: P.c2, edge: null, lw: 28, so: 9 };
    ctx.transform(1, 0, -0.2, 1, 0, 0);
    const out = ramp(t, 0.7, 1), punch = 1 + 0.2 * (1 - ramp(t, 0.04, 0.34)), shake = (1 - ramp(t, 0.08, 0.62)) * 3.4 * (tk.motion() < 1 ? 0.3 : 1);
    // burst rays behind the word for a beat
    const ray = env(t, 0.08, 0.2, 0.5);
    if (ray > 0.02) {
      ctx.save(); ctx.transform(1, 0, 0.2, 1, 0, 0); ctx.globalAlpha = ga * ray * 0.85; ctx.fillStyle = INK; ctx.beginPath();
      const R = size * (1.1 + 0.5 * n * 0.25) * eo3(ramp(t, 0, 0.2));
      for (let i = 0; i < 16; i++) { const an = i / 16 * TAU + 0.2, wd = 0.07 + 0.05 * hv(sd, i); ctx.moveTo(cos(an) * size * 0.3, sin(an) * size * 0.3 * 0.6); ctx.lineTo(cos(an - wd) * R, sin(an - wd) * R * 0.7); ctx.lineTo(cos(an + wd) * R, sin(an + wd) * R * 0.7); ctx.closePath(); }
      ctx.fill(); ctx.restore(); ctx.globalAlpha = ga;
    }
    ctx.scale(punch, punch);
    glyphRun(ctx, str, st, size, (i) => {
      const tau = ramp(t, 0.025 * i, 0.025 * i + 0.17), pop = 0.25 + 0.75 * eoBack(tau);
      return {
        a: ramp(tau, 0, 0.3) * (1 - out), s: pop * (1 - 0.12 * out),
        dx: hs(sd, F * 5 + i * 3) * shake, dy: hs(sd, F * 5 + i * 3 + 1) * shake + 18 * out * out + (i % 2 ? 2 : -2),
        rot: (hs(sd, i + 900) * 0.09) + sin(tau * 12) * 0.12 * (1 - tau), flash: 1 - ramp(t, 0, 0.12),
      };
    });
    ctx.restore(); ctx.globalAlpha = ga;
  };
  nominal.sfxText = 130;

  // ===============================================================================================================
  // numberPop
  // ===============================================================================================================
  const NUM = {
    dmg: { a: '#ffffff', b: '#ffe6c8', ink: INK, edge: null, shadow: null, k: 1, lw: 20 },
    crit: { a: '#fff3a0', b: '#ff4a3a', ink: '#2a0a1e', edge: '#e8383d', shadow: null, k: 1.5, lw: 20 },
    heal: { a: '#eaffef', b: '#4fe08a', ink: '#0b3a2a', edge: null, shadow: null, k: 1.08, lw: 20 },
    block: { a: '#e8f6ff', b: '#5fb4ff', ink: '#12356a', edge: null, shadow: null, k: 1, lw: 20 },
    poison: { a: '#f3e0ff', b: '#a05cf0', ink: '#2a0f5a', edge: null, shadow: null, k: 0.9, lw: 20 },
    burn: { a: '#fff0c0', b: '#ff8a2e', ink: '#5a0f22', edge: null, shadow: null, k: 0.9, lw: 20 },
  };
  Object.keys(NUM).forEach((k) => { NUM[k].key = 'num|' + k; NUM[k].so = 0; NUM[k].lw = 26; });
  FX.numberPop = (ctx, o, t) => {
    const P = prep(o, '#ffffff', null); if (!P) return;
    t = T01(t);
    const kind = NUM[P.kind] ? P.kind : 'dmg', st = NUM[kind], str = String(o && o.text !== undefined && o.text !== null && o.text !== '' ? o.text : '0').slice(0, 10), n = str.length, sd = P.seed, F = floor(t * 24);
    ctx.save(); ctx.translate(P.x, P.y); if (P.ang) ctx.rotate(P.ang); if (P.s !== 1) ctx.scale(P.s, P.s);
    const ga = ctx.globalAlpha, size = 46 * st.k, crit = kind === 'crit', shk = crit ? (1 - ramp(t, 0.06, 0.5)) * 3.2 * (tk.motion() < 1 ? 0.3 : 1) : 0, out = ramp(t, 0.66, 1);
    // a crit is announced by a small starburst behind the digits
    if (crit) {
      const sb = env(t, 0.06, 0.16, 0.46);
      if (sb > 0.02) {
        ctx.globalAlpha = ga * sb; const R = 62 * eo3(ramp(t, 0, 0.16)) + 10 * n;
        ctx.beginPath(); starPath(ctx, 10, hv(sd, 5) * TAU, (i) => R * (i % 2 ? 0.72 : 1), R * 0.46); ctx.lineJoin = 'miter'; ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = st.edge; ctx.fill();
        ctx.beginPath(); starPath(ctx, 10, hv(sd, 5) * TAU + PI / 10, (i) => R * 0.62, R * 0.3); ctx.fillStyle = st.a; ctx.fill(); ctx.globalAlpha = ga;
      }
    }
    ctx.translate(0, -12 * eo3(ramp(t, 0, 0.9)));
    glyphRun(ctx, str, st, size, (i) => {
      const t0 = 0.03 * i, tau = ramp(t, t0, t0 + 0.2);
      return {
        a: ramp(tau, 0, 0.25) * (1 - out), s: (0.3 + 0.7 * eoBack(tau)) * (1 - 0.1 * out),
        dx: hs(sd, F * 3 + i) * shk, dy: hs(sd, F * 3 + i + 50) * shk + sin(t * 10 + i * 1.3) * 1.6 * (1 - t) - 6 * sin(PI * min(1, tau * 1.4)),
        rot: (hs(sd, i + 300) * 0.07) + sin(tau * 14) * 0.15 * (1 - tau), flash: 1 - ramp(t, 0, 0.1),
      };
    });
    ctx.restore(); ctx.globalAlpha = ga;
  };
  nominal.numberPop = 60;

  // ===============================================================================================================
  // vignette
  // ===============================================================================================================
  FX.vignette = (ctx, o, t) => {
    const P = prep(o, '#e8383d', null); if (!P) return;
    t = T01(t);
    const w = P.w, h = P.h, ga = ctx.globalAlpha, calm = tk.motion() < 1, inn = eo3(ramp(t, 0, 0.14)), beat = 1 + (calm ? 0 : 0.16 * sin(t * TAU * 2.4) * (1 - t)), out = 1 - sm(ramp(t, 0.5, 1));
    if (out < 0.02) return;
    const D = min(w, h) * 0.085 * (0.35 + 0.65 * inn) * beat, sd = P.seed + (calm ? 0 : floor(t * 10) * 7), lc = luma(P.c1);
    const body = lc > 0.6 ? P.c1 : mix(P.c1, INK, 0.55), edge = lc > 0.6 ? INK : (lc < 0.12 ? pal.dusk : tint(P.c1, 0.3));
    ctx.save();
    ctx.globalAlpha = ga * out; tk.vignette(ctx, w, h, { color: P.c1, alpha: 0.5 * inn, inner: 0.4 });
    // a torn dry-brush frame: an irregular spiky inner boundary (long and short teeth), heaviest in the four corners
    const M = 13, pts = [], dC = D * 2.3;
    const tooth = (idx) => D * (0.5 + 0.95 * hv(sd, idx)) * (idx % 3 === 1 ? 0.4 : idx % 3 === 2 ? 0.75 : 1.15);
    pts.push(dC, dC);
    for (let i = 1; i < M; i++) { const u = i / M; pts.push(u * w, tooth(i) * (1 + 0.6 * pow(1 - min(1, min(u, 1 - u) * 4), 2))); }
    pts.push(w - dC, dC);
    for (let i = 1; i < M; i++) { const u = i / M; pts.push(w - tooth(i + 30) * (1 + 0.6 * pow(1 - min(1, min(u, 1 - u) * 4), 2)), u * h); }
    pts.push(w - dC, h - dC);
    for (let i = 1; i < M; i++) { const u = i / M; pts.push(w - u * w, h - tooth(i + 60) * (1 + 0.6 * pow(1 - min(1, min(u, 1 - u) * 4), 2))); }
    pts.push(dC, h - dC);
    for (let i = 1; i < M; i++) { const u = i / M; pts.push(tooth(i + 90) * (1 + 0.6 * pow(1 - min(1, min(u, 1 - u) * 4), 2)), h - u * h); }
    const trace = () => { ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); };
    ctx.beginPath(); ctx.rect(-4, -4, w + 8, h + 8); trace();
    ctx.fillStyle = body; ctx.globalAlpha = ga * out * 0.94; ctx.fill('evenodd');
    ctx.beginPath(); trace();
    ctx.lineJoin = 'miter'; ctx.miterLimit = 4; ctx.lineWidth = 3.4; ctx.strokeStyle = edge; ctx.globalAlpha = ga * out * 0.9; ctx.stroke();
    ctx.restore(); ctx.globalAlpha = ga;
  };

  // ===============================================================================================================
  // chromatic
  // ===============================================================================================================
  let scr = null;                                                // scratch canvases for the two shifted channels (half resolution)
  function scratch(w, h) {
    try {
      if (!scr) {
        const mk = () => { const c = document.createElement('canvas'), g = c.getContext('2d'); return g ? { c, g } : null; };
        const a = mk(), b = mk();
        if (!a || !b) return null;
        scr = { a, b };
      }
      for (const L of [scr.a, scr.b]) if (L.c.width !== w || L.c.height !== h) { L.c.width = w; L.c.height = h; }
      return scr;
    } catch (e) { scr = null; return null; }
  }
  FX.chromatic = (ctx, o, t) => {
    if (tk.opt && tk.opt.reduceMotion) return;
    const P = prep(o, WHITE, null); if (!P) return;
    t = T01(t);
    const cv = ctx.canvas;
    if (!cv || !(cv.width > 0) || !(cv.height > 0) || typeof document === 'undefined' || !document || typeof document.createElement !== 'function') return;
    let m = null;
    try { m = ctx.getTransform(); } catch (e) { m = null; }
    const sx = m ? m.a : 1, sy = m ? m.d : 1, ex = m ? m.e : 0, ey = m ? m.f : 0;
    if (!(sx > 0) || !(sy > 0) || (m && (abs(m.b) > 1e-6 || abs(m.c) > 1e-6))) return;
    const x0 = max(0, Math.round(ex)), y0 = max(0, Math.round(ey)), x1 = min(cv.width, Math.round(ex + P.w * sx)), y1 = min(cv.height, Math.round(ey + P.h * sy));
    const rw = x1 - x0, rh = y1 - y0;
    if (!(rw >= 8) || !(rh >= 8)) return;
    const amp = 9 * ramp(t, 0, 0.1) * pow(1 - ramp(t, 0.1, 1), 1.4) * (1 + 0.22 * sin(t * 80)) * ctx.globalAlpha;
    const dx = amp * sx * cos(P.ang), dy = amp * sy * sin(P.ang) * 0.5;
    if (abs(dx) + abs(dy) < 0.6) return;
    const tw = max(4, Math.ceil(rw / 2)), th = max(4, Math.ceil(rh / 2)), S = scratch(tw, th);
    if (!S) return;
    const layers = [[S.a.g, S.a.c, '#ff0000'], [S.b.g, S.b.c, '#0000ff']];
    for (let i = 0; i < 2; i++) {
      const g = layers[i][0];
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, tw, th);
      g.drawImage(cv, x0, y0, rw, rh, 0, 0, tw, th);
      g.globalCompositeOperation = 'multiply'; g.fillStyle = layers[i][2]; g.fillRect(0, 0, tw, th); g.globalCompositeOperation = 'source-over';
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath(); ctx.rect(x0, y0, rw, rh); ctx.clip();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#00ff00'; ctx.fillRect(x0, y0, rw, rh);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(S.a.c, 0, 0, tw, th, x0 - dx, y0 - dy, rw, rh);
    ctx.drawImage(S.b.c, 0, 0, tw, th, x0 + dx, y0 + dy, rw, rh);
    ctx.restore();
  };
  nominal.chromatic = 0;

  // ===============================================================================================================
  // brushDrag (the Sound Sweep: id kept, the picture is a sine ribbon of sound)
  // ===============================================================================================================
  const PROF = new Float64Array(49);
  FX.brushDrag = (ctx, o, t) => {
    const P = prep(o, '#7a6bff', (c) => (luma(c) < 0.25 ? '#5ff5ff' : tint(c, 0.5))); if (!P) return;
    t = T01(t);
    let x1 = fin(o && o.x2, P.x), y1 = fin(o && o.y2, P.y);
    if (hypot(x1 - P.x, y1 - P.y) < 8) { x1 = P.x + cos(P.ang) * 420 * P.s * P.dir; y1 = P.y + sin(P.ang) * 420 * P.s; }
    const L = hypot(x1 - P.x, y1 - P.y), k = min(1.8, max(0.5, P.s)), W = 66 * k, sd = P.seed, ga = ctx.globalAlpha;
    // the sweep races along the path in the first half; the sound then fades out from its start
    const head = L * eo3(ramp(t, 0, 0.46)), tail = L * sm(ramp(t, 0.5, 1)), a = 1 - ramp(t, 0.9, 1);
    if (head - tail < 6 || a < 0.02) return;
    ctx.save(); ctx.translate(P.x, P.y); ctx.rotate(atan2(y1 - P.y, x1 - P.x));
    const u0 = tail, u1 = head, span = max(1, u1 - u0), ph0 = hv(sd, 1) * TAU, wl = 0.066 / k;
    // the amplitude falls toward the tail; the whole ribbon snakes on a sine and travels with the head
    const amp = (u) => 11 * k * (0.2 + 0.8 * c01((u - u0) / span)) * (0.4 + 0.6 * sin(PI * c01(u / L) * 0.9 + 0.3));
    const cl = (u) => amp(u) * sin(u * wl - ph0 - t * 9);
    // half width along the whole stroke: a swell at the touchdown, a steady belly, a thin flick at the end
    for (let i = 0; i <= 48; i++) { const v = i / 48; PROF[i] = (0.5 + 0.5 * sm(ramp(v, 0, 0.07))) * (1 - 0.45 * sm(ramp(v, 0.14, 0.8))) * (1 - sm(ramp(v, 0.9, 1))); }
    const prof0 = (u) => { const f = c01(u / L) * 48, i = f | 0, j = i < 48 ? i + 1 : 48; return PROF[i] + (PROF[j] - PROF[i]) * (f - i); };
    const dry = tail > 2, prof = (u) => prof0(u) * (dry ? 0.12 + 0.88 * sm(c01((u - u0) / (80 * k))) : 1) * sm(c01((u1 - u) / (14 * k) + 0.15));
    const N = 40;
    const fillRibbon = (wMul, add, col, al) => {
      for (let i = 0; i < N; i++) { const u = u0 + span * i / (N - 1); QX[i] = u; QY[i] = cl(u); QW[i] = W * 0.32 * prof(u) * wMul * (i === N - 1 ? 0.4 : 1); }
      ctx.globalAlpha = ga * a * al; ctx.beginPath(); ribbonPath(ctx, N, 1, add); ctx.fillStyle = col; ctx.fill();
    };
    glowAt(ctx, (u0 + u1) / 2, cl((u0 + u1) / 2), span * 0.5 + 30 * k, P.c2, 0.2 * a);
    fillRibbon(1, 3.6 * k, INK, 0.9);                    // the ink line round the ribbon so it reads on any ground
    fillRibbon(1, 0, P.c1, 1);                            // the body
    fillRibbon(0.62, 0, mix(P.c1, P.c2, 0.45), 0.9);      // a lighter core band
    // three inner sine lines, each on its own phase and swing
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let g = 0; g < 3; g++) {
      const off = (g - 1) * 0.5, ph = ph0 * (g + 1) + g * 2.1, f = wl * (1.6 + 0.5 * g);
      for (let i = 0; i < N; i++) { const u = u0 + span * i / (N - 1); QX[i] = u; QY[i] = cl(u) + off * W * 0.32 * prof(u) + sin(u * f - ph - t * (11 + 3 * g)) * 0.34 * W * 0.32 * prof(u); }
      ctx.globalAlpha = ga * a * (g === 1 ? 0.95 : 0.75); ctx.beginPath(); ctx.moveTo(QX[0], QY[0]);
      for (let i = 1; i < N; i++) ctx.lineTo(QX[i], QY[i]);
      ctx.lineWidth = (g === 1 ? 2.4 : 1.7) * k; ctx.strokeStyle = g === 1 ? WHITE : P.c2; ctx.stroke();
    }
    // a bright bead at the head
    disc(ctx, u1 - 10 * k, cl(u1 - 10 * k), 5 * k * a, rgba(WHITE, 0.9));
    // notes thrown off the head instead of splatter
    for (let i = 0; i < cnt(8); i++) {
      const ts = 0.06 + 0.36 * hv(sd, i + 100), tau = c01((t - ts) / 0.42);
      if (t < ts || tau >= 1) continue;
      const along = L * eo3(ramp(ts, 0, 0.46)) * (0.94 + 0.08 * hv(sd, i + 120)) + 26 * eo3(tau), side = hs(sd, i + 140) > 0 ? 1 : -1;
      const nx = along, ny = cl(min(along, L)) + side * (W * 0.3 + (8 + 46 * hv(sd, i + 160)) * eo3(tau)) - 20 * tau * tau;
      const kind = i % 3 === 0 ? 'beamed' : i % 3 === 1 ? 'quarter' : 'eighth', sz = (7 + 5 * hv(sd, i + 180)) * k * (1 - 0.3 * tau);
      ctx.globalAlpha = ga * a * (1 - tau * tau);
      tk.note(ctx, nx, ny, sz, { kind, color: i % 2 ? P.c2 : tint(P.c1, 0.3), rot: side * 0.2 * (1 - tau), line: max(1.2, sz * 0.16) });
    }
    ctx.restore(); ctx.globalAlpha = ga;
  };
  nominal.brushDrag = 200;

  // ===============================================================================================================
  // registration
  // ===============================================================================================================
  const names = ART.fx.names.slice();
  const implemented = [];
  names.forEach((n) => { if (FX[n]) { ART.fx[n] = FX[n]; implemented.push(n); } });
  if (implemented.length) ART.declare('fx', implemented);
  ART.fx.nominal = (name) => ({ r: nominal[name] || 0 });
  Object.assign(ART.fx.ms, { slash: 280, cross: 380, thrust: 260, burst: 320, ring: 440, inkSplash: 800 });

  // ===============================================================================================================
  // gallery
  // ===============================================================================================================
  // demo options per effect for a w x h box (also ART.fx.demo)
  const DEMO = {
    slash: (w, h) => ({ x: w / 2, y: h * 0.52, color: '#fff8f0' }),
    cross: (w, h) => ({ x: w / 2, y: h * 0.52, color: '#ffffff' }),
    thrust: (w, h) => ({ x: w * 0.12, y: h * 0.55, x2: w * 0.84, y2: h * 0.5 }),
    burst: (w, h) => ({ x: w / 2, y: h * 0.52, color: '#ffe9a8' }),
    ring: (w, h) => ({ x: w / 2, y: h * 0.52, color: '#fff8f0' }),
    inkSplash: (w, h) => ({ x: w / 2, y: h * 0.5, color: '#7a6bff' }),
    petals: (w, h) => ({ x: w / 2, y: h * 0.56, color: '#ff9cc6' }),
    lightning: (w, h) => ({ x: w * 0.42, y: h * 0.02, x2: w / 2, y2: h * 0.66, color: '#ffe45e' }),
    chain: (w, h) => ({ x: w * 0.16, y: h * 0.62, x2: w * 0.84, y2: h * 0.44, color: '#7a6bff' }),
    flame: (w, h) => ({ x: w / 2, y: h * 0.66, color: '#ff9a2e' }),
    frost: (w, h) => ({ x: w / 2, y: h * 0.52, color: '#8fdcff' }),
    poison: (w, h) => ({ x: w / 2, y: h * 0.62, color: '#74dc42' }),
    shield: (w, h) => ({ x: w / 2, y: h * 0.52, w: 124, h: 160, color: '#5fb4ff' }),
    heal: (w, h) => ({ x: w / 2, y: h * 0.56, color: '#7dffb0' }),
    buff: (w, h) => ({ x: w / 2, y: h * 0.52, color: '#ffe45e' }),
    debuff: (w, h) => ({ x: w / 2, y: h * 0.52, color: '#b58bff' }),
    sparkle: (w, h) => ({ x: w / 2, y: h * 0.5, color: '#ffe9a8' }),
    speedLines: (w, h) => ({ x: w / 2, y: h * 0.5, color: '#ffffff' }),
    impactFrame: (w, h) => ({ x: w / 2, y: h * 0.5, w, h }),
    sfxText: (w, h) => ({ x: w / 2, y: h * 0.5, text: 'ZAN!' }),
    vignette: (w, h) => ({ x: w / 2, y: h / 2, w, h, color: '#e8383d' }),
    chromatic: (w, h) => ({ x: w / 2, y: h / 2, w, h }),
    brushDrag: (w, h) => ({ x: w * 0.08, y: h * 0.72, x2: w * 0.92, y2: h * 0.3, color: '#7a6bff' }),
    numberPop: (w, h) => ({ x: w / 2, y: h * 0.52, text: '128', kind: 'dmg' }),
  };
  const demoOf = (name, w, h, extra) => Object.assign({ seed: 7, s: 1 }, (DEMO[name] || DEMO.burst)(fin(w, 240), fin(h, 240)), extra || {});
  ART.fx.demo = demoOf;
  // the dark combat backdrop every sheet draws on
  function backdrop(g, w, h, light) {
    tk.sky(g, 0, 0, w, h, light ? 'golden' : 'night');
    g.fillStyle = light ? 'rgba(60,30,80,0.35)' : 'rgba(6,4,20,0.55)'; g.fillRect(0, h * 0.72, w, h * 0.28);
    g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, h * 0.72, w, 1.5);
  }
  const VIRT = 240;                                              // a cell is drawn in a 240 x 240 virtual box (full-screen effects cover it)
  function cellDraw(g, name, w, h, t, extra, light) {
    backdrop(g, w, h, light);
    const k = min(w, h) / VIRT, cw = w / k, ch = h / k;
    g.save(); g.scale(k, k);
    const o = demoOf(name, cw, ch, extra);
    // faint origin cross so the anchor is visible
    g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1 / k; g.beginPath(); g.moveTo(o.x - 8, o.y); g.lineTo(o.x + 8, o.y); g.moveTo(o.x, o.y - 8); g.lineTo(o.x, o.y + 8); g.stroke();
    if (name === 'chromatic') underChromatic(g, cw, ch);
    if (ART.fx[name]) ART.fx[name](g, o, t);
    g.restore();
  }
  // something contrasty for the RGB split to fringe: a hero and a hard white star
  function underChromatic(g, cw, ch) {
    g.save(); g.fillStyle = '#fff8f0'; g.beginPath(); starPath2(g, cw / 2, ch * 0.5, 9, 78, 30); g.fill(); g.lineWidth = 5; g.strokeStyle = INK; g.stroke();
    try { ART.hero.draw(g, 'hanae', { x: cw * 0.34, y: ch * 0.86, s: 0.5, pose: 'idle', t: 0 }); } catch (e) { /* art missing */ }
    g.font = '900 34px ' + tk.font.num; g.textAlign = 'center'; g.fillStyle = '#ffe45e'; g.strokeStyle = INK; g.lineWidth = 6; g.strokeText('KIN!', cw * 0.68, ch * 0.34); g.fillText('KIN!', cw * 0.68, ch * 0.34);
    g.restore();
  }
  function starPath2(g, cx, cy, n, ro, ri) { for (let i = 0; i < n * 2; i++) { const a = i * PI / n, r = i % 2 ? ri : ro; if (i === 0) g.moveTo(cx + cos(a) * r, cy + sin(a) * r); else g.lineTo(cx + cos(a) * r, cy + sin(a) * r); } g.closePath(); }
  ART.sheet('fx', (canvas, params) => {
    const times = [0, 0.25, 0.5, 0.75, 1], cells = [], nm = ART.fx.names, per = 3;
    for (let r = 0; r < Math.ceil(nm.length / per); r++) for (let gi = 0; gi < per; gi++) { const name = nm[r * per + gi]; if (name) times.forEach((tt) => cells.push({ name, t: tt, label: name + ' ' + tt })); else times.forEach(() => cells.push({ name: null, t: 0, label: '' })); }
    ART.sheetGrid(canvas, params, cells, (g, cell, w, h) => { if (cell.name) cellDraw(g, cell.name, w, h, cell.t, null, !!params.light); }, { cols: per * times.length, pad: 6, gap: 3, labelH: 13, bg: 'night', cellBg: false, title: 'ART.fx: every effect at t = 0, .25, .5, .75, 1' });
  });
  ART.sheet('fx_anim', (canvas, params) => {
    const n = max(2, floor(fin(params.n, 8))), per = max(1, floor(fin(params.per, 6))), page = max(0, floor(fin(params.page, 0)));
    const nm = params.names ? String(params.names).split(',').map((s) => s.trim()).filter(Boolean) : ART.fx.names.slice(page * per, page * per + per);
    const cells = [];
    nm.forEach((name) => { for (let i = 0; i < n; i++) { const tt = (i + 0.5) / n; cells.push({ name, t: tt, label: name + ' ' + tt.toFixed(2) }); } });
    ART.sheetGrid(canvas, params, cells, (g, cell, w, h) => cellDraw(g, cell.name, w, h, cell.t, null, !!params.light), { cols: n, pad: 6, gap: 3, labelH: 13, bg: 'night', cellBg: false, title: 'ART.fx film strips (page ' + page + ')' });
  });
  // ---- fx_combat: the effects in a combat frame (scene, heroes, enemies on the DESIGN 5.9 marks), scripted on one timeline
  const LANES = [560, 705, 850, 995, 1120];
  const SCRIPTS = {
    hits: { ms: 1300, list: (E) => [
      ['slash', 0, { x: LANES[0], y: 420, color: '#fff8f0', ang: -0.55, s: 1 }], ['burst', 20, { x: LANES[0], y: 420, color: '#fff8f0', s: 0.85 }], ['sfxText', 60, { x: LANES[0] + 30, y: 300, text: 'ZAN!', s: 1 }], ['numberPop', 90, { x: LANES[0] - 20, y: 330, text: '14', kind: 'dmg' }],
      ['flame', 120, { x: LANES[1], y: 470, color: '#ff9a2e', s: 1.1 }], ['numberPop', 150, { x: LANES[1], y: 350, text: '9', kind: 'burn' }],
      ['lightning', 200, { x: LANES[2] + 40, y: 90, x2: LANES[2], y2: 440, color: '#ffe45e', s: 1.1 }], ['burst', 250, { x: LANES[2], y: 440, color: '#ffe45e', s: 1 }], ['numberPop', 260, { x: LANES[2], y: 340, text: '32', kind: 'crit', s: 1.15 }],
      ['frost', 300, { x: LANES[3], y: 430, color: '#8fdcff', s: 1.1 }], ['numberPop', 330, { x: LANES[3], y: 340, text: '11', kind: 'dmg' }],
      ['poison', 350, { x: LANES[4], y: 460, color: '#3fd6b0', s: 1 }], ['numberPop', 380, { x: LANES[4], y: 340, text: '4', kind: 'poison' }],
      ['petals', 0, { x: E.hero.x, y: E.hero.y - 130, color: '#ff9cc6', s: 1.1 }], ['buff', 100, { x: E.back.x, y: E.back.y - 120, color: '#ffe45e', s: 1.2 }],
      ['heal', 200, { x: E.hero.x, y: E.hero.y - 100, color: '#7dffb0', s: 1.1 }], ['shield', 260, { x: E.hero.x, y: E.hero.y - 120, w: 130, h: 220, color: '#5fb4ff', s: 1 }],
    ] },
    crit: { ms: 1000, list: () => [
      ['speedLines', 0, { x: LANES[1], y: 400, w: 1280, h: 720, color: '#ffffff', s: 1.1 }], ['cross', 0, { x: LANES[1], y: 400, color: '#ffffff', s: 1.35, ang: -0.3 }], ['burst', 10, { x: LANES[1], y: 400, color: '#fff8f0', s: 1.55 }],
      ['ring', 30, { x: LANES[1], y: 400, color: '#fff8f0', s: 1.3 }], ['impactFrame', 40, { x: LANES[1], y: 400, w: 1280, h: 720 }], ['chromatic', 60, { w: 1280, h: 720 }],
      ['sfxText', 80, { x: LANES[1] + 34, y: 300, text: 'ZAN!', s: 1.25, ang: -0.1 }], ['numberPop', 90, { x: LANES[1] - 10, y: 330, text: '58', kind: 'crit', s: 1.3 }], ['vignette', 40, { w: 1280, h: 720, color: '#e8383d' }],
    ] },
    ink: { ms: 1100, list: (E) => [
      ['inkSplash', 0, { x: LANES[0], y: 430, color: '#7a6bff', s: 1.2 }], ['sfxText', 40, { x: LANES[0], y: 300, text: 'WAAN!', s: 0.9, color: '#e8e0ff', color2: '#7a6bff' }],
      ['chain', 120, { x: LANES[0], y: 430, x2: LANES[1], y2: 420, color: '#7a6bff' }], ['chain', 200, { x: LANES[1], y: 420, x2: LANES[2], y2: 430, color: '#7a6bff' }],
      ['thrust', 60, { x: E.hero.x + 60, y: E.hero.y - 130, x2: LANES[0] - 30, y2: 420, color: '#fff8f0' }], ['debuff', 260, { x: LANES[2], y: 420, color: '#b58bff', s: 1.3 }],
      ['brushDrag', 0, { x: 380, y: 200, x2: 1000, y2: 260, color: '#7a6bff', color2: '#5ff5ff', s: 1 }], ['sparkle', 300, { x: LANES[3], y: 400, color: '#ffe9a8', s: 1.2 }],
    ] },
  };
  ART.sheet('fx_combat', (canvas, params) => {
    const g = canvas.getContext('2d'), w = params.w, h = params.h, k = min(w / 1280, h / 720), mode = SCRIPTS[params.mode] ? params.mode : 'hits', sc = SCRIPTS[mode];
    const now = c01(fin(params.t, 0.3)) * sc.ms, ts = now / 1000;
    g.save(); g.scale(k, k);
    if (ART.scene && ART.scene.draw) ART.scene.draw(g, params.scene || 'ch1', 1280, 720, ts, { particles: 0.5 }); else backdrop(g, 1280, 720);
    const E = { hero: { x: 330, y: 520 }, back: { x: 170, y: 508 } };
    const heroes = [['kuro', 170, 508, 0.94], ['hanae', 330, 520, 1]];
    heroes.forEach((hh) => { try { ART.hero.draw(g, hh[0], { x: hh[1], y: hh[2], s: hh[3], pose: 'idle', t: ts }); } catch (e) { /* art missing */ } });
    ['kappa', 'karakasa', 'oni_brute'].forEach((id, i) => { try { ART.enemy.draw(g, id, { x: LANES[i + 1 - (mode === 'hits' ? 1 : 0)], y: 520, s: 1, pose: 'idle', t: ts }); } catch (e) { /* art missing */ } });
    const list = sc.list(E).map((e) => ({ name: e[0], at: e[1], o: Object.assign({ seed: 11 + e[1] }, e[2]) }));
    const screen = { impactFrame: 1, chromatic: 1, vignette: 1, speedLines: 1 };
    [false, true].forEach((top) => list.forEach((e) => {
      if (!!screen[e.name] !== top) return;
      const p = (now - e.at) / ART.fx.ms[e.name];
      if (p >= 0 && p < 1 && ART.fx[e.name]) { g.save(); ART.fx[e.name](g, e.o, p); g.restore(); }
    }));
    g.restore();
  });
  ART.sheet('fx_dev', (canvas, params) => {
    const g = canvas.getContext('2d'), w = params.w, h = params.h, name = String(params.name || 'slash'), t = fin(params.t, 0.3);
    backdrop(g, w, h, !!params.light);
    const k = fin(params.zoom, min(w, h) / VIRT);
    g.save(); g.scale(k, k);
    const extra = { seed: fin(params.seed, 7) };
    if (params.color) extra.color = '#' + String(params.color).replace('#', '');
    if (params.text) extra.text = String(params.text);
    if (params.kind) extra.kind = String(params.kind);
    if (params.s) extra.s = fin(params.s, 1);
    if (params.ang) extra.ang = fin(params.ang, 0);
    if (params.dir) extra.dir = fin(params.dir, 1);
    const o = demoOf(name, w / k, h / k, extra);
    if (name === 'chromatic') underChromatic(g, w / k, h / k);
    if (ART.fx[name]) ART.fx[name](g, o, t);
    g.restore();
    g.font = '600 12px ' + tk.font.ui; g.fillStyle = 'rgba(243,230,200,0.8)'; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(name + '  t=' + t.toFixed(2), 8, 6);
  });
})();
