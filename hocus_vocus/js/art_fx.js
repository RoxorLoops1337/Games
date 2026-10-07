// Hocus Vocus: ART.fx, the combat VFX (24 effects, DATA.LISTS.fx), drawn in the chibi house style of the owners' cast: a chunky warm outline, flat cel colour,
// one hard shadow, cream cores, sparkles and little music notes. Extends ART (art.js); every member REPLACES the art.js placeholder by plain assignment.
//
// CONTRACT (DESIGN 5.6, ART_BIBLE 7, HV_ART_AUDIO 8)
//   ART.fx.NAME(ctx, o, t)     t is PROGRESS 0..1 (clamped; NaN is 0). SCENE owns the timing (ART.fx.ms[NAME] ms by default). A pure function of (o, t) and the
//                              ART.tk.opt settings: no state, no clock, no banned random call. Particles are closed-form functions of o.seed and t, so any t can be drawn in
//                              any order (the gallery relies on it). Unknown keys are ignored, a missing or non-finite number falls back to its default, nothing throws.
//   o = { x, y, x2?, y2?, s?:1, color?, color2?, dir?:1|-1, ang?, seed?, text?, kind?, w?, h? }   stage px, radians
//        x y      origin: the impact point, the caster centre or the line start. s scales EVERYTHING (sizes, line weights, travel) about it.
//        color    the main hex colour (any '#rgb' or '#rrggbb'; other strings fall back to the effect default). color2 the accent. SCENE fills color2 with color
//                 when it has no accent, so an accent equal to the main colour is treated as missing and a matching accent is derived from it.
//        dir      -1 mirrors the effect horizontally about its origin (an attacker facing left), then ang rotates it on screen (radians, clockwise positive).
//                 sfxText never mirrors its letters: dir leans the word the other way instead.
//        seed     any integer: all the variation (jitter, particle layout, flicker frames) derives from it.
//   Each effect has a default duration in ART.fx.ms (retuned below; the values are close to the DESIGN 5.6 table). Unlisted extras beyond DESIGN are at the end.
//
// THE EFFECTS (default colours in brackets; "local" means drawn around the origin at s = 1 and scaled)
//   slash        a sung arc (pink): a fat ribbon of light with a cream core swept along an arc (the head snaps across in 0.3 of the time, the tail catches up), a hard
//                shadow on its inner side, two note heads and a petal flung off the head. ang tilts it; default chord is "\". SCENE colours it by the attacker.
//   cross        two sung arcs making an X (the second one lags 0.2) with a sparkle where they cross.
//   thrust       a projected beam of sound from (x, y) to (x2, y2): a soft cone with rings that snap to its end, a bright note at the tip, a shock ring where it lands.
//                Without x2, y2 it thrusts 240 px along dir and ang.
//   burst        a comic starburst impact: even outline, flat colour body with one hard shadow, inner star, cream core, radial speed lines, "boil" (new jitter every frame).
//   ring         an expanding sound ring: an outlined annulus that thins as it grows, a highlight, tick marks and a trailing second ring.
//   inkSplash    the beat burst, PKAH! (green and lime; the id stays from the old splat): a starburst with a waveform rim and sound spikes, three rings expand outward,
//                note heads fly off and settle, a cream flash ring leaves at the start. Also the summon and the win-over pop.
//   petals       a swirling cherry petal storm: baked chibi petals tumble on tilted orbits that widen and climb, with wind ribbons and a soft pink glow.
//   lightning    Andy's bass bolt, WOMP!: a thick angular orange zigzag that flickers on twos, a wobbling low wave along it, a flat floor shock and sparks where it
//                lands. Without x2, y2 it strikes down onto (x, y) from 360 px above.
//   chain        a walking bass line: orange note heads bounce along an arc between (x, y) and (x2, y2), a bright lead note runs ahead. Without x2, y2 it reaches 260 px along dir.
//   flame        Sizzle: round cartoon flames in three tones that flicker on twos, chilli-red sparks and embers rising, a soft heat glow.
//   frost        TING!: a glassy crystal sparkle burst (outlined two-tone shards, a big four-point star, floating gems) and a bell ring of two sound rings, then it shatters.
//   poison       Earworm: little note-worms (a face and a note flag on the head) wriggling up in mint and violet with bubbles that rise and pop.
//   shield       a sound wall over o.w x o.h: a speaker-grille dot mesh whose dots light up along an expanding ripple from where the hit landed, a soft bubble rim, a sheen.
//   heal         Warm Tea: rising hearts and plus signs, a curl of steam, a warm light column and a ring on the ground.
//   buff         rising equaliser bars and chevrons climbing three columns, a ring sweeping feet to head, a light column.
//   debuff       the same falling: bars and chevrons sinking, a ring that sinks head to feet, a pastel Gloss drip falling and splashing at the feet.
//   sparkle      twinkling four-point stars around a big lens-flare star, drifting confetti dots.
//   speedLines   comic speed lines: 'radial' focus lines converging on (x, y) (default), or kind 'dir' parallel lines along ang. With o.w and o.h it covers that
//                whole box (SCENE always passes them); without, a local burst of lines around (x, y). New line set every frame ("boil").
//   impactFrame  the impact frame: an inverted flash ('difference'), then a pink and green duotone of rays converging on (x, y) over the whole o.w x o.h (default
//                1280 x 720). Never reads pixels. ART.tk.opt.reduceMotion draws a soft tint instead of any flash.
//   sfxText      the hit words (o.text, default 'LA!'; LA! BOOM! SIZZ! TING! WOMP! PKAH! NANANA! TA-DA!): chunky rounded letters, cream fill, a thick warm outline, o.color2
//                (the element colour) as the shadow; each letter its own sprite; pops in with overshoot, shakes, then drops away. Baked once per (character, colours).
//   vignette     hard dramatic edges over o.w x o.h: a torn frame plus a colour bleed from the edges that beats once (default red). Baked once.
//   chromatic    RGB split (reads as a Gloss glitch): the canvas redrawn onto itself with the red and blue channels shifted (multiply masks and 'lighter'), over the o.w x o.h
//                box in the current transform. Half resolution scratch canvases; draws nothing when the canvas cannot be copied (stub, zero size) or under reduceMotion.
//   brushDrag    a Spell cast (the id stays): a mic-wand sparkle trail sweeping from (x, y) to (x2, y2), a bright star at the wand tip, a thin ribbon of light and notes thrown
//                off the head. Without x2, y2 it sweeps 420 px along dir and ang.
//   numberPop    chunky rounded digits (o.text, o.kind dmg | crit | heal | block | poison | burn): cream fill and a thick warm outline for dmg, red with a cream sticker edge
//                for crit, green heal, blue block, mint poison, orange burn; they pop in one after the other with overshoot, wobble, float a little (SCENE adds the main rise) and fade.
//   Every effect honours ART.tk.opt.reduceMotion (particle counts x0.3, no strobing) and quality 'low' (x0.55, no extra passes).
//
// EXTRAS beyond DESIGN 5.6
//   ART.fx.demo(name, w, h, extra?) -> the `o` the gallery uses for a name in a w x h box (handy for tests and tooling)
//   ART.fx.nominal(name) -> {r} the approximate radius in px an effect reaches at s = 1 (0 for full-screen effects); SCENE may use it to cull
//   Gallery sheets: fx (every name at t = 0 .25 .5 .75 1), fx_anim (film strips: params page=0..3, per, n, names=a,b), fx_dev (one effect big: params name,
//   zoom, seed, light=1, color, color2 (none clears the demo accent); use --param frames=6 for a strip), fx_combat (the effects in a combat frame: params t, mode hits | crit | ink)
//
// HOW IT IS BUILT
//   The house look is one recipe: a flat colour body, a warm dark-brown outline so the shape survives any backdrop (HV_ART_AUDIO 1: the line of the heroes, never the old
//   indigo), one hard warm shadow, a cream core, additive glow only for light, and snappy timing (snap in, hold, dissolve; loops and jitter "on twos" through a quantised t).
//   Everything is polygons, arcs and cached sprites (glows come from ART.tk.glow, letters, notes and petals from ART.sprite), so the whole set sits under 0.4 ms per
//   effect at its busiest on a mid laptop (chromatic is GPU bound: a few full-canvas blits). Scratch arrays are module level and never escape a call.
(() => {
  'use strict';
  const tk = ART.tk, pal = tk.pal;
  const PI = Math.PI, TAU = PI * 2;
  const sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max, floor = Math.floor, sqrt = Math.sqrt, pow = Math.pow, hypot = Math.hypot, atan2 = Math.atan2, exp = Math.exp;
  const INK = '#2d170f';                                          // the outline: the warm dark brown of the owners' chibi cards
  const CREAM = '#fff8ec', WHITE = '#ffffff';
  const GLOSS = ['#f4f1fb', '#e6d9ff', '#d9fff4', '#ffe3f1'];       // the Gloss tokens (bible 3.6): opal, lilac, mint and blush sheen

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
  const tint = (h, k) => tk.tint(h, k), mix = (a, b, k) => tk.mix(a, b, k);
  const rgba = (h, a) => tk.rgba(h, a);
  // the warm cel shadow of the cast kit: a little darker, a little more saturated, the hue nudged toward red (never the heavy indigo shade of ART.tk.shade)
  const hslM = new Map();
  function toHsl(hex) {
    let v = hslM.get(hex);
    if (v) return v;
    const c = U.color.rgb(hex), r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    v = [h, s, l];
    if (hslM.size > 600) hslM.clear();
    hslM.set(hex, v);
    return v;
  }
  const warm = (hex, dl) => { const v = toHsl(hex); return U.color.hsl(v[0] - 5, c01(v[1] * 1.06), c01(v[2] - (dl === undefined ? 0.14 : dl))); };

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
  // the house outline round an already built closed path, then the flat fill. lw is the whole stroke: half of it shows outside the fill.
  const celFill = (ctx, fill, lw) => { ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = fill; ctx.fill(); };
  // a plump heart centred on (x, y), about 3r wide
  function heartPath(ctx, x, y, r) {
    ctx.moveTo(x, y + r * 0.95);
    ctx.bezierCurveTo(x - r * 1.55, y + r * 0.12, x - r * 1.15, y - r * 1.05, x, y - r * 0.38);
    ctx.bezierCurveTo(x + r * 1.15, y - r * 1.05, x + r * 1.55, y + r * 0.12, x, y + r * 0.95);
    ctx.closePath();
  }
  // a rounded bar (x, y is the top left), built with arcs so it needs no roundRect
  function barPath(ctx, x, y, w, h) {
    const r = min(w, h) / 2;
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arc(x + w - r, y + r, r, -PI / 2, 0); ctx.lineTo(x + w, y + h - r); ctx.arc(x + w - r, y + h - r, r, 0, PI / 2);
    ctx.lineTo(x + r, y + h); ctx.arc(x + r, y + h - r, r, PI / 2, PI); ctx.lineTo(x, y + r); ctx.arc(x + r, y + r, r, PI, PI * 1.5); ctx.closePath();
  }
  // one chunky cel music note baked per colour and kind: 56 x 60, the head centre at (14, 46), the head about 18 wide. kind: eighth | quarter | beamed
  const NOTE_W = 56, NOTE_H = 60, NOTE_HX = 14, NOTE_HY = 46, NOTE_HEAD = 18;
  function noteSprite(fill, kind) {
    return ART.sprite('fx|note|' + kind + '|' + fill, NOTE_W, NOTE_H, (g) => {
      g.lineJoin = 'round'; g.lineCap = 'round';
      const sh = warm(fill, 0.16), beamed = kind === 'beamed', hx2 = 36, hy2 = 41;
      const stemX = (hx) => hx + 7.4;
      const head = (hx, hy) => { g.beginPath(); g.ellipse(hx, hy, 9, 6.6, -0.4, 0, TAU); };
      const stem = (hx, hy, top) => { g.beginPath(); g.rect(stemX(hx) - 2.2, top, 4.4, hy - top - 2); };
      const flag = () => {
        g.beginPath(); g.moveTo(stemX(NOTE_HX) + 2.2, 8); g.bezierCurveTo(stemX(NOTE_HX) + 12, 12, stemX(NOTE_HX) + 15, 22, stemX(NOTE_HX) + 9, 32);
        g.bezierCurveTo(stemX(NOTE_HX) + 11, 24, stemX(NOTE_HX) + 6, 19, stemX(NOTE_HX) - 2.2, 18); g.closePath();
      };
      const beam = () => { g.beginPath(); g.moveTo(stemX(NOTE_HX) - 2.2, 8); g.lineTo(stemX(hx2) + 2.2, 3); g.lineTo(stemX(hx2) + 2.2, 11); g.lineTo(stemX(NOTE_HX) - 2.2, 16); g.closePath(); };
      const pieces = [];
      pieces.push(() => stem(NOTE_HX, NOTE_HY, 8));
      if (beamed) { pieces.push(() => stem(hx2, hy2, 3)); pieces.push(beam); pieces.push(() => head(hx2, hy2)); } else if (kind !== 'quarter') pieces.push(flag);
      pieces.push(() => head(NOTE_HX, NOTE_HY));
      // outline pass for every piece, then the flat fill pass, so the pieces merge into one sticker
      g.strokeStyle = INK; g.lineWidth = 6;
      pieces.forEach((p) => { p(); g.stroke(); });
      g.fillStyle = fill;
      pieces.forEach((p) => { p(); g.fill(); });
      // the one hard shadow on the head (lower left) and a catchlight
      [[NOTE_HX, NOTE_HY]].concat(beamed ? [[hx2, hy2]] : []).forEach((h) => {
        g.save(); head(h[0], h[1]); g.clip(); g.beginPath(); g.ellipse(h[0] + 3.4, h[1] - 3, 9, 6.6, -0.4, 0, TAU); g.rect(h[0] - 20, h[1] - 20, 40, 40); g.fillStyle = sh; g.fill('evenodd'); g.restore();
        g.beginPath(); g.ellipse(h[0] + 2.6, h[1] - 2.4, 2.1, 1.3, -0.5, 0, TAU); g.fillStyle = 'rgba(255,248,236,0.9)'; g.fill();
      });
    });
  }
  // draws a note with its head centre at (x, y); size is the head width in px; rot turns it about the head
  function noteAt(ctx, x, y, size, rot, fill, kind) {
    const spr = noteSprite(fill, kind || 'eighth');
    if (spr._inert || !(size > 0.5)) return;
    const k = size / NOTE_HEAD;
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot);
    ctx.drawImage(spr, -NOTE_HX * k, -NOTE_HY * k, NOTE_W * k, NOTE_H * k);
    ctx.restore();
  }
  // one baked chibi cherry petal (a notch at the tip, a warm outline, one hard shadow, one catchlight) per colour, drawn dozens of times with a transform each
  function petalSprite(hex) {
    return ART.sprite('fx|petal|' + hex, 32, 32, (g) => {
      g.translate(16, 16);
      const path = () => { g.beginPath(); g.moveTo(0, 12.5); g.bezierCurveTo(9.5, 8, 11.5, -4, 4.4, -12.5); g.lineTo(1, -9.4); g.lineTo(-1, -9.4); g.lineTo(-4.4, -12.5); g.bezierCurveTo(-11.5, -4, -9.5, 8, 0, 12.5); g.closePath(); };
      path(); g.lineJoin = 'round'; g.lineWidth = 3.4; g.strokeStyle = INK; g.stroke(); g.fillStyle = hex; g.fill();
      g.save(); path(); g.clip();
      g.beginPath(); g.ellipse(-7.5, 5.5, 9, 12, 0.5, 0, TAU); g.fillStyle = warm(hex, 0.16); g.fill();          // hard shadow, lower left
      g.beginPath(); g.ellipse(3.6, -3.6, 2.6, 6.2, 0.28, 0, TAU); g.fillStyle = 'rgba(255,248,236,0.85)'; g.fill();      // catchlight
      g.restore();
    });
  }
  const nominal = {};

  const FX = {};

  // ===============================================================================================================
  // slash and cross: the sung arc
  // ===============================================================================================================
  // Draws one sung arc in the current local space. cfg {k size scale, tilt rotation of the chord, flip -1 mirrors the swing, hd head time, t0 t1 tail window}
  const SN = 22;
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
  function slashLocal(ctx, P, t, cfg) {
    const k = cfg.k, R = 150 * k, span = 1.5, hd = cfg.hd || 0.3, tw0 = cfg.t0 === undefined ? 0.14 : cfg.t0, tw1 = cfg.t1 === undefined ? 0.84 : cfg.t1;
    const uh = 1 - pow(1 - c01(t / hd), 3), ut = sm(ramp(t, tw0, tw1));
    if (uh - ut < 0.02 || t >= 1) return;
    const ga = ctx.globalAlpha, body = P.c1, shadow = P.c2, lit = tint(P.c1, 0.55);
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
    // light first: a wide glow on the ribbon and a hot one at the tip
    glowAt(ctx, mx, my, 92 * k, body, 0.42 * env(t, 0.08, 0.5, 0.95));
    glowAt(ctx, hx, hy, 44 * k, WHITE, 0.5 * env(t, 0.05, 0.3, 0.6));
    // the outline, then the flat body, one hard shadow on the inner (lower) half, a thin catchlight on the outer edge, the cream core
    setA(ctx, ga, fade);
    crescentPath(ctx, 1.06, 0.6, 4.4, 0); ctx.fillStyle = INK; ctx.fill();
    crescentPath(ctx, 1.06, 0.6, 0, 0); ctx.fillStyle = body; ctx.fill();
    crescentPath(ctx, 0.02, 0.6, 0, 0); ctx.fillStyle = shadow; ctx.fill();
    crescentPath(ctx, 1.0, -0.66, 0, 0); ctx.fillStyle = lit; ctx.fill();
    crescentPath(ctx, 0.4, 0.1, 0, -2.2 * k); ctx.fillStyle = CREAM; ctx.fill();
    // the tip gleam
    setA(ctx, ga, env(t, 0.06, 0.4, 0.66));
    tk.sparkle(ctx, hx, hy, 20 * k * (1 - 0.4 * t), { color: CREAM, rot: 0.25, glow: 0.3, thin: 0.12 });
    // two note heads and a petal flung off the head along the tangent, closed form from the seed; then a few tiny stars
    const nn = cnt(2);
    for (let i = 0; i < nn + 1; i++) {
      const ts = 0.05 + 0.3 * hv(P.seed, i), tau = c01((t - ts) / 0.6);
      if (t < ts || tau >= 1) continue;
      const us = 1 - pow(1 - c01(ts / hd), 3), phi = angAt(us);
      const sx = cos(phi) * R, sy = R + sin(phi) * R;
      const side = i === 0 ? -1 : i === 1 ? 1 : (hs(P.seed, i + 40) > 0 ? 1 : -1), ta = phi + PI / 2, va = ta + side * (0.5 + 0.9 * hv(P.seed, i + 20)), d = (56 + 90 * hv(P.seed, i + 60)) * eo3(tau) * k;
      const px = sx + cos(va) * d + cos(phi) * (10 + 22 * hv(P.seed, i + 80)) * tau * k, py = sy + sin(va) * d + sin(phi) * (10 + 22 * hv(P.seed, i + 80)) * tau * k + 26 * tau * tau;
      ctx.globalAlpha = ga * (1 - tau * tau);
      if (i < nn) noteAt(ctx, px, py, (13 + 4 * hv(P.seed, i + 100)) * k * (1 - tau * 0.3), side * 0.25 * (1 - tau) + tau * side * 0.5, i % 2 ? lit : body, i % 2 ? 'quarter' : 'eighth');
      else {
        const spr = petalSprite(tint(body, 0.28));
        if (!spr._inert) { const sz = 15 * k * (1 - tau * 0.3); ctx.save(); ctx.translate(px, py); ctx.rotate(tau * 6 * side + va); ctx.scale(0.5 + 0.5 * abs(cos(tau * 9)), 1); ctx.drawImage(spr, -sz, -sz, sz * 2, sz * 2); ctx.restore(); }
      }
    }
    const ns = cnt(5);
    for (let i = 0; i < ns; i++) {
      const ts = 0.08 + 0.3 * hv(P.seed, i + 200), tau = c01((t - ts) / 0.5);
      if (t < ts || tau >= 1) continue;
      const us = 1 - pow(1 - c01(ts / hd), 3), phi = angAt(us), sx = cos(phi) * R, sy = R + sin(phi) * R;
      const va = phi + PI / 2 * (hs(P.seed, i + 240) > 0 ? 1 : -1) + hs(P.seed, i + 260) * 0.8, d = (30 + 80 * hv(P.seed, i + 280)) * eo3(tau) * k;
      ctx.globalAlpha = ga * (1 - tau);
      tk.sparkle(ctx, sx + cos(va) * d, sy + sin(va) * d + 18 * tau * tau, (4 + 4 * hv(P.seed, i + 300)) * k * (1 - tau * 0.5), { color: i % 2 ? CREAM : lit, rot: tau * 2 + i, glow: 0 });
    }
    ctx.restore();
  }
  FX.slash = (ctx, o, t) => {
    const P = prep(o, '#ff7eb6', (c) => warm(c, 0.16)); if (!P) return;
    t = T01(t); place(ctx, P);
    slashLocal(ctx, P, t, { k: 1, tilt: 0.75, flip: 1 });
    ctx.restore();
  };
  FX.cross = (ctx, o, t) => {
    const P = prep(o, '#ff7eb6', (c) => warm(c, 0.16)); if (!P) return;
    t = T01(t); place(ctx, P);
    // both arcs are drawn in full and held for a beat, so the X reads; then the tails catch up
    slashLocal(ctx, P, t, { k: 1.05, tilt: 0.75, flip: 1, hd: 0.24, t0: 0.5, t1: 0.96 });
    slashLocal(ctx, { c1: P.c1, c2: P.c2, seed: P.seed + 7 }, c01((t - 0.14) / 0.86), { k: 1.05, tilt: -0.75, flip: -1, hd: 0.24, t0: 0.5, t1: 0.96 });
    // a sparkle where the arcs cross
    const f = env(t, 0.34, 0.38, 0.72) * ramp(t, 0.16, 0.28);
    if (f > 0.02) {
      const ga = ctx.globalAlpha;
      glowAt(ctx, 0, 0, 80, P.c1, 0.5 * f);
      ctx.globalAlpha = ga * f;
      tk.sparkle(ctx, 0, 0, 38 * (0.6 + 0.6 * eo3(ramp(t, 0.18, 0.4))), { color: CREAM, rot: 0.785, glow: 0.3, thin: 0.12 });
      tk.sparkle(ctx, 0, 0, 24, { color: WHITE, rot: 0, glow: 0, thin: 0.14 });
      ctx.globalAlpha = ga;
    }
    ctx.restore();
  };
  nominal.slash = 130; nominal.cross = 140;

  // ===============================================================================================================
  // thrust: a beam of sound
  // ===============================================================================================================
  FX.thrust = (ctx, o, t) => {
    const P = prep(o, '#ffc9de', (c) => warm(c, 0.2)); if (!P) return;
    t = T01(t);
    let x1 = fin(o && o.x2, P.x), y1 = fin(o && o.y2, P.y);
    if (hypot(x1 - P.x, y1 - P.y) < 8) { const L0 = 240 * P.s; x1 = P.x + cos(P.ang) * L0 * P.dir; y1 = P.y + sin(P.ang) * L0; }
    const L = hypot(x1 - P.x, y1 - P.y), k = min(1.7, max(0.55, P.s)), beamAng = atan2(y1 - P.y, x1 - P.x);
    const ga = ctx.globalAlpha;
    ctx.save(); ctx.translate(P.x, P.y); ctx.rotate(beamAng);
    const head = L * eoExpo(ramp(t, 0, 0.24)), tail = L * 0.97 * sm(ramp(t, 0.1, 0.8));
    const fade = 1 - ramp(t, 0.7, 1);
    if (head - tail > 3) {
      const wAt = (x) => 5 * k + 0.2 * x * min(1, 360 / max(L, 1)), mid = (head + tail) / 2;
      glowAt(ctx, mid, 0, (head - tail) * 0.55 + 30 * k, P.c1, 0.4 * fade);
      // the cone: a cel wedge, the upper half in the colour and the lower half in its hard shadow, a warm hairline on each edge
      ctx.beginPath(); ctx.moveTo(tail, -wAt(tail) * 0.4); ctx.lineTo(head, -wAt(head)); ctx.lineTo(head, 0); ctx.lineTo(tail, 0); ctx.closePath();
      setA(ctx, ga, 0.55 * fade); ctx.fillStyle = P.c1; ctx.fill();
      ctx.beginPath(); ctx.moveTo(tail, wAt(tail) * 0.4); ctx.lineTo(head, wAt(head)); ctx.lineTo(head, 0); ctx.lineTo(tail, 0); ctx.closePath();
      ctx.fillStyle = P.c2; ctx.fill();
      setA(ctx, ga, 0.8 * fade); ctx.lineWidth = 2.6 * k; ctx.lineCap = 'round'; ctx.strokeStyle = INK;
      ctx.beginPath(); ctx.moveTo(tail, -wAt(tail) * 0.4); ctx.lineTo(head, -wAt(head)); ctx.moveTo(tail, wAt(tail) * 0.4); ctx.lineTo(head, wAt(head)); ctx.stroke();
      // the rings: arcs of circles round the caster that stream out to the head, each an outlined bow of sound
      const nr = 5, ph = (t * 3.2) % 1;
      for (let i = 0; i < nr; i++) {
        const u = (i + ph) / nr, r = tail + (head - tail) * u;
        if (r < 14) continue;
        const half = min(0.42, wAt(r) / r * 1.05), a = (0.35 + 0.65 * u) * fade * sin(PI * min(1, u * 1.15 + 0.08));
        if (a < 0.03) continue;
        ctx.globalAlpha = ga * a; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(0, 0, r, -half, half); ctx.lineWidth = (8 + 4 * u) * k * 0.62 + 4.4; ctx.strokeStyle = INK; ctx.stroke();
        ctx.lineWidth = (8 + 4 * u) * k * 0.62; ctx.strokeStyle = i % 2 ? CREAM : P.c1; ctx.stroke();
      }
    }
    // a shock ring where it lands
    for (let r = 0; r < 2; r++) {
      const tau = ramp(t, 0.16 + r * 0.12, 0.72 + r * 0.1);
      if (tau <= 0 || tau >= 1) continue;
      const rx = (5 + 20 * eo3(tau)) * k, ry = (14 + 44 * eo3(tau)) * k;
      ctx.globalAlpha = ga * (1 - tau) * (r ? 0.7 : 1);
      ctx.beginPath(); ctx.ellipse(L, 0, rx, ry, 0, 0, TAU);
      ctx.lineWidth = (6 * (1 - tau) + 1.5) * k + 4; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = (6 * (1 - tau) + 1.5) * k; ctx.strokeStyle = r ? P.c1 : CREAM; ctx.stroke();
    }
    glowAt(ctx, L, 0, 70 * k, P.c1, 0.6 * env(t, 0.22, 0.35, 0.8));
    if (head - tail > 3) {
      // a bright note at the tip, in front of the landing ring
      ctx.save(); ctx.translate(head, 0); ctx.rotate(-beamAng);
      setA(ctx, ga, fade * (0.4 + 0.6 * ramp(t, 0.05, 0.2)));
      noteAt(ctx, 0, 6 * k, 26 * k * (0.8 + 0.2 * eoBack(ramp(t, 0.02, 0.3))), 0.08, CREAM, 'eighth');
      ctx.globalAlpha = ga * env(t, 0.05, 0.3, 0.6);
      tk.sparkle(ctx, 14 * k, -22 * k, 18 * k, { color: WHITE, rot: 0.2, glow: 0.5, thin: 0.14 });
      ctx.restore();
    }
    ctx.restore();
    ctx.globalAlpha = ga;
  };
  nominal.thrust = 130;

  // ===============================================================================================================
  // burst: the comic starburst
  // ===============================================================================================================
  FX.burst = (ctx, o, t) => {
    const P = prep(o, '#ffd84d', (c) => (luma(c) > 0.82 ? '#ffe9a8' : tint(c, 0.55))); if (!P) return;
    t = T01(t); place(ctx, P);
    const ga = ctx.globalAlpha, fr = floor(t * 18), sd = P.seed + fr * 31;
    const R = 112 * (0.22 + 0.78 * eo3(ramp(t, 0, 0.36))) * (1 - 0.5 * sm(ramp(t, 0.55, 1)));
    const a = 1 - sm(ramp(t, 0.6, 1)), n = 10 + floor(hv(P.seed, 99) * 5), rot = hs(sd, 1) * 0.35 + hv(P.seed, 98) * TAU;
    glowAt(ctx, 0, 0, R * 1.7, P.c2, 0.5 * a);
    // radial speed lines behind the star
    const lines = cnt(14), lf = eo3(ramp(t, 0, 0.3)), la = 0.85 * (1 - ramp(t, 0.18, 0.6));
    if (la > 0.02) {
      ctx.globalAlpha = ga * la; ctx.fillStyle = CREAM; ctx.beginPath();
      for (let i = 0; i < lines; i++) {
        const an = (i + hv(sd, i + 200) * 0.7) / lines * TAU, r0 = R * (0.8 + 0.25 * hv(sd, i + 220)), r1 = R * (1.25 + 0.75 * hv(sd, i + 240) * lf) + 20 * lf, w = 0.05 + 0.03 * hv(sd, i + 260);
        ctx.moveTo(cos(an - w * 0.3) * r0, sin(an - w * 0.3) * r0); ctx.lineTo(cos(an) * r1, sin(an) * r1); ctx.lineTo(cos(an + w * 0.3) * r0, sin(an + w * 0.3) * r0); ctx.closePath();
      }
      ctx.fill();
    }
    ctx.globalAlpha = ga * a;
    const ro = (i) => R * (i % 2 ? 0.66 + 0.22 * hv(sd, i) : 1.0 + 0.24 * hv(sd, i));
    // the outline, the flat body, one hard shadow (the star minus itself shifted toward the light), the inner star, the cream core
    ctx.beginPath(); starPath(ctx, n, rot, ro, R * 0.42);
    ctx.lineJoin = 'miter'; ctx.miterLimit = 8; ctx.lineWidth = 8; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = P.c1; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.beginPath(); ctx.rect(-R * 1.6, -R * 1.6, R * 3.2, R * 3.2); ctx.translate(R * 0.1, -R * 0.1); starPath(ctx, n, rot, ro, R * 0.42); ctx.translate(-R * 0.1, R * 0.1);
    ctx.fillStyle = warm(P.c1, 0.15); ctx.fill('evenodd');
    ctx.restore();
    ctx.beginPath(); starPath(ctx, n, rot + PI / n, (i) => R * (0.66 + 0.1 * hv(sd, i + 50)), R * 0.3);
    ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = P.c2; ctx.fill();
    ctx.beginPath(); starPath(ctx, n, rot, (i) => R * (0.36 + 0.08 * hv(sd, i + 70)), R * 0.17); ctx.fillStyle = CREAM; ctx.fill();
    // the first frame is a flash
    const fl = 1 - ramp(t, 0, 0.12);
    if (fl > 0.02) { ctx.globalAlpha = ga * fl; ctx.beginPath(); starPath(ctx, n, rot + PI / n * 0.5, (i) => R * (1.15 + 0.3 * hv(sd, i + 400)), R * 0.5); ctx.fillStyle = WHITE; ctx.fill(); }
    ctx.restore(); ctx.globalAlpha = ga;
  };
  nominal.burst = 125;

  // ===============================================================================================================
  // ring: an expanding sound ring
  // ===============================================================================================================
  // one ring: an outlined annulus that thins as it grows. The inner circle is nudged off-centre a little so the band's thickness varies like a hand-drawn line.
  function oneRing(ctx, tau, R, thick, seed, accentCol, bodyCol) {
    if (tau <= 0 || tau >= 1) return;
    const ro = R * (0.06 + 0.94 * eo3(tau)), th = max(1.4, thick * pow(1 - tau, 1.1)), ri = max(0.5, ro - th), ga = ctx.globalAlpha, a = 1 - ramp(tau, 0.55, 1);
    const ox = hs(seed, 1) * th * 0.16, oy = hs(seed, 2) * th * 0.16;
    ctx.globalAlpha = ga * a; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.arc(0, 0, ro + 1.6, 0, TAU); ctx.lineWidth = 4.6; ctx.strokeStyle = INK; ctx.stroke();
    if (ri > 3) { ctx.beginPath(); ctx.arc(ox, oy, ri - 1, 0, TAU); ctx.lineWidth = 3.2; ctx.stroke(); }
    ctx.beginPath(); ctx.arc(0, 0, ro, 0, TAU); ctx.moveTo(ox + ri, oy); ctx.arc(ox, oy, ri, 0, TAU); ctx.fillStyle = bodyCol; ctx.fill('evenodd');
    if (th > 3.5) {
      const hi = max(0.5, ro - th * 0.55);   // at tiny tau ro is smaller than the band, and arc() throws on a negative radius
      ctx.beginPath(); ctx.arc(0, 0, ro - th * 0.12, 0, TAU); ctx.moveTo(hi, 0); ctx.arc(0, 0, hi, 0, TAU); ctx.fillStyle = accentCol; ctx.fill('evenodd');
    }
    ctx.globalAlpha = ga;
  }
  FX.ring = (ctx, o, t) => {
    const P = prep(o, CREAM, (c) => (luma(c) > 0.82 ? '#ffc2dc' : tint(c, 0.6))); if (!P) return;
    t = T01(t); place(ctx, P);
    const ga = ctx.globalAlpha, R = 150;
    glowAt(ctx, 0, 0, R * (0.4 + 0.7 * eo3(t)), P.c2, 0.3 * (1 - t));
    // dashes flung outward off the leading edge
    const nt = cnt(14), ta = ramp(t, 0.02, 0.15) * (1 - ramp(t, 0.35, 0.75));
    if (ta > 0.02) {
      ctx.globalAlpha = ga * ta; ctx.lineCap = 'round';
      const rr = R * (0.06 + 0.94 * eo3(t)) + 9;
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass ? P.c1 : INK; ctx.lineWidth = pass ? 2.2 : 5.4; ctx.beginPath();
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
  // inkSplash (the beat burst, PKAH!: id kept, the picture is a beatboxed pop)
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
  // cleanly with the nonzero rule (stroke the whole path thick in the outline colour, then fill it: the outline only survives on the outside).
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
  FX.inkSplash = (ctx, o, t) => {
    const P = prep(o, '#3fcf6a', (c) => (luma(c) > 0.78 ? '#c6ff3d' : mix(tint(c, 0.4), '#c6ff3d', 0.45))); if (!P) return;
    t = T01(t); place(ctx, P);
    const ga = ctx.globalAlpha, sd = P.seed, S = SPLAT;
    const dry = ramp(t, 0.32, 0.78), a = 1 - ramp(t, 0.8, 1), r = 41 * eoBack(ramp(t, 0, 0.17)) * (1 - 0.06 * dry);
    if (r < 2 || a < 0.02) { ctx.restore(); return; }
    const body = P.c1, lit = P.c2, shadowC = warm(P.c1, 0.16), rot = hv(sd, 500) * TAU;
    S.r = r;
    // the rim: 17 points alternating a high and a low radius, joined by straight lines
    for (let i = 0; i < S.M; i++) { const an = rot + i / S.M * TAU, rr = r * ((i % 2 ? 0.66 : 1.08) + 0.14 * hs(sd, i)); S.px[i] = cos(an) * rr; S.py[i] = sin(an) * rr; }
    for (let i = 0; i < S.ns; i++) {
      const kind = i % 3, gi = eo3(ramp(t, 0.0 + 0.02 * hv(sd, i + 90), 0.13 + 0.07 * hv(sd, i + 91))), j = hv(sd, i + 20);
      S.sa[i] = rot + (i + hs(sd, i + 60) * 0.32) / S.ns * TAU;
      S.sl[i] = (kind === 0 ? 84 + 34 * j : kind === 1 ? 54 + 20 * j : 66 + 20 * j) * gi * (1 - 0.07 * dry);
      S.sw[i] = kind === 0 ? 6.4 : kind === 1 ? 16 + 4 * j : 10 + 3 * j;
    }
    ctx.globalAlpha = ga * a; ctx.lineJoin = 'round';
    // three rings expand from r to r * 2.6 over 0.2 .. 0.9: an outlined annulus each, in the two colours
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const tau = ramp(t, 0.2 + 0.07 * i, 0.9);
      if (tau <= 0 || tau >= 1) continue;
      const rr = r * (1 + 1.6 * eo3(tau)), th = max(1.8, 8 * pow(1 - tau, 1.1)), ra = (1 - ramp(tau, 0.45, 1)) * ga * a;
      ctx.globalAlpha = ra;
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.lineWidth = th + 4; ctx.strokeStyle = INK; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.lineWidth = th; ctx.strokeStyle = i % 2 ? lit : body; ctx.stroke();
    }
    ctx.globalAlpha = ga * a;
    // note heads flung out on short arcs; each one drifts to rest where it landed
    const nd = cnt(9);
    for (let i = 0; i < nd; i++) {
      const ts = 0.01 + 0.1 * hv(sd, i + 600), tau = c01((t - ts) / 0.3);
      if (t < ts) continue;
      const an = hv(sd, i + 620) * TAU, dist = (78 + 90 * hv(sd, i + 640)) * eo3(tau), px = cos(an) * dist, py = sin(an) * dist * 0.9 - 30 * hv(sd, i + 700) * tau * tau;
      const rr = (11 + 7 * hv(sd, i + 660)) * (0.7 + 0.3 * tau);
      noteAt(ctx, px, py, rr, (hv(sd, i + 680) - 0.5) * 0.7, i % 2 ? lit : body, i % 3 === 0 ? 'quarter' : 'eighth');
    }
    // the silhouette: a thick even outline, then the flat colour on top
    ctx.beginPath(); splatPath(ctx, S); ctx.lineWidth = 8; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = body; ctx.fill();
    // a lit line down the upper edge of each spike
    ctx.lineCap = 'round'; ctx.strokeStyle = rgba(lit, 0.9 * (1 - dry * 0.5)); ctx.lineWidth = 2.4; ctx.beginPath();
    for (let i = 0; i < S.ns; i++) {
      const L = S.sl[i]; if (L < 14) continue;
      const an = S.sa[i], nx = sin(an), ny = -cos(an), w = S.sw[i] * 0.42;
      ctx.moveTo(cos(an) * r * 0.75 + nx * w, sin(an) * r * 0.75 + ny * w); ctx.lineTo(cos(an) * L * 0.72 + nx * w * 0.5, sin(an) * L * 0.72 + ny * w * 0.5);
    }
    ctx.stroke();
    // the core gets one hard shadow (itself minus itself shifted toward the light)
    ctx.save(); ctx.beginPath(); poolPath(ctx, S, 0, 0); ctx.clip();
    ctx.beginPath(); ctx.rect(-120, -120, 240, 240); poolPath(ctx, S, 6, -6); ctx.fillStyle = shadowC; ctx.fill('evenodd');
    ctx.restore();
    // the waveform rim glows: a lime line round the core, so the zigzag reads as a sound wave
    ctx.globalAlpha = ga * a * (1 - 0.4 * dry); ctx.lineJoin = 'miter'; ctx.miterLimit = 3; ctx.beginPath(); poolPath(ctx, S, 0, 0); ctx.lineWidth = 4; ctx.strokeStyle = lit; ctx.stroke();
    ctx.lineWidth = 1.4; ctx.strokeStyle = CREAM; ctx.stroke(); ctx.lineJoin = 'round'; ctx.globalAlpha = ga * a;
    glowAt(ctx, 0, 0, r * 2.1, body, 0.28 * (1 - dry));
    // a cream dot at the heart, and a flash ring at 0.1 .. 0.3 where the sound leaves
    disc(ctx, 0, 0, r * 0.22 * (1 - dry * 0.5), rgba(CREAM, 0.95 * (1 - dry)));
    const fl = ramp(t, 0.1, 0.3);
    if (fl > 0 && fl < 1) {
      ctx.globalAlpha = ga * a * (1 - fl); ctx.beginPath(); ctx.arc(0, 0, r * (0.9 + 0.8 * eo3(fl)), 0, TAU);
      ctx.lineWidth = 5 * (1 - 0.6 * fl); ctx.strokeStyle = CREAM; ctx.stroke();
    }
    ctx.restore(); ctx.globalAlpha = ga;
  };
  nominal.inkSplash = 150;

  // ===============================================================================================================
  // petals: the cherry petal storm
  // ===============================================================================================================
  FX.petals = (ctx, o, t) => {
    const P = prep(o, '#ff7eb6', (c) => mix(c, WHITE, 0.42)); if (!P) return;
    t = T01(t); place(ctx, P);
    const ga = ctx.globalAlpha, spr = petalSprite(P.c1), spr2 = petalSprite(P.c2), N = cnt(26), spin = P.seed % 2 ? 1 : -1, ribbon = tint(P.c1, 0.65);
    glowAt(ctx, 0, -20, 130 * (0.4 + 0.6 * eo3(t)), P.c1, 0.36 * env(t, 0.1, 0.5, 0.95));
    // wind ribbons: three comet trails spiralling out
    for (let w = 0; w < 3; w++) {
      const tau = ramp(t, 0.02 + w * 0.05, 0.85), th0 = hv(P.seed, w + 500) * TAU, a = env(tau, 0.15, 0.6, 1) * 0.8;
      if (a < 0.02) continue;
      const n = 22;
      for (let i = 0; i < n; i++) {
        const v = i / (n - 1), tt = max(0, tau - 0.3 * (1 - v)), th = th0 + spin * (2.2 + 3.2 * tt), r = (16 + 138 * eo3(tt)) * (0.85 + 0.15 * w);
        QX[i] = cos(th) * r; QY[i] = sin(th) * r * 0.42 - 90 * eo2(tt); QW[i] = 2.6 * sin(PI * pow(v, 0.8)) + 0.05;
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
          const size = (8 + 8 * hv(P.seed, i + 300)) * (back ? 0.82 : 1), rot = hv(P.seed, i + 350) * TAU + (3 + 6 * hs(P.seed, i + 400)) * tau, fl = cos(hv(P.seed, i + 450) * TAU + (7 + 8 * hv(P.seed, i + 500)) * tau);
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
      tk.sparkle(ctx, cos(an) * r, sin(an) * r * 0.6 - 30, 10 * sin(PI * tau), { color: i % 2 ? CREAM : P.c2, rot: tau, glow: 0.3 });
    }
    ctx.restore(); ctx.globalAlpha = ga;
  };
  nominal.petals = 190;

  // ===============================================================================================================
  // lightning (Andy's bass bolt, WOMP!) and chain (a walking bass line)
  // ===============================================================================================================
  const BX = new Float64Array(80), BY = new Float64Array(80);
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
  // an angular ribbon along (ax, ay): widths from prof(v); outline, flat colour body, a bright core (one alpha for all three)
  function boltRibbon(ctx, ax, ay, n, W, prof, c1, c2, ga, a) {
    for (let i = 0; i < n; i++) { QX[i] = ax[i]; QY[i] = ay[i]; QW[i] = W * prof(i / (n - 1)) + 0.15; }
    ctx.globalAlpha = ga * a; ctx.beginPath(); ribbonPath(ctx, n, 1, 3.6); ctx.fillStyle = INK; ctx.fill();
    ctx.beginPath(); ribbonPath(ctx, n, 1, 0); ctx.fillStyle = c1; ctx.fill();
    ctx.beginPath(); ribbonPath(ctx, n, 0.5, 0); ctx.fillStyle = c2; ctx.fill();
    ctx.beginPath(); ribbonPath(ctx, n, 0.18, 0); ctx.fillStyle = CREAM; ctx.fill();
  }
  const FLICKER = [1, 0.55, 1, 0.32, 0.85, 0.22, 0.6, 0.16, 0.3, 0.1];
  FX.lightning = (ctx, o, t) => {
    const P = prep(o, '#ff9a2e', (c) => (luma(c) > 0.8 ? '#ffe45e' : mix(tint(c, 0.5), '#ffe45e', 0.5))); if (!P) return;
    t = T01(t);
    let x0 = P.x, y0 = P.y, x1 = fin(o && o.x2, P.x), y1 = fin(o && o.y2, P.y);
    if (hypot(x1 - x0, y1 - y0) < 10) {                                  // no end point: it strikes down onto (x, y), leaning with dir and turned by ang
      const vx = (hs(P.seed, 3) * 30 + 36 * P.dir) * P.s, vy = -360 * P.s;
      x1 = P.x; y1 = P.y; x0 = P.x + vx * cos(P.ang) - vy * sin(P.ang); y0 = P.y + vx * sin(P.ang) + vy * cos(P.ang);
    }
    const k = min(1.7, max(0.55, P.s)), ga = ctx.globalAlpha, F = min(9, floor(t * 10)), fa = FLICKER[F] * (1 - ramp(t, 0.72, 1)), fs = P.seed + F * 131;
    const L = hypot(x1 - x0, y1 - y0), jag = min(70, 26 + L * 0.12) * k, grow = ramp(t, 0, 0.09);
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // the low wave: a slow wobbling sine that rides along the bolt (the bass under the zap), drawn behind it
    const dxl = (x1 - x0) / (L || 1), dyl = (y1 - y0) / (L || 1), nxl = -dyl, nyl = dxl, wv = ramp(t, 0.02, 0.2) * (1 - ramp(t, 0.5, 0.9));
    if (wv > 0.02 && fa > 0.02) {
      const NW = 26, cycles = max(1.5, L / 150), ph = -t * 16;
      for (let i = 0; i < NW; i++) {
        const u = i / (NW - 1) * grow, off = 26 * k * pow(sin(PI * min(1, u)), 0.7) * sin(u * cycles * TAU + ph) * wv;
        BX[i] = x0 + (x1 - x0) * u + nxl * off; BY[i] = y0 + (y1 - y0) * u + nyl * off;
      }
      ctx.globalAlpha = ga * max(fa, 0.75); ctx.lineWidth = 11 * k; ctx.strokeStyle = INK; strokePts(ctx, BX, BY, NW);
      ctx.globalAlpha = ga * max(fa, 0.75); ctx.lineWidth = 6 * k; ctx.strokeStyle = P.c2; strokePts(ctx, BX, BY, NW);
    }
    const n = boltPts(fs, x0, y0, x1, y1, jag, 2, BX, BY);
    const nm = truncPts(BX, BY, n, grow);
    // soft light round the trunk: two widening strokes at low alpha, additive
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = P.c1;
    for (let g = 0; g < 2; g++) { ctx.globalAlpha = ga * fa * (0.07 + 0.06 * g); ctx.lineWidth = (46 - g * 16) * k; strokePts(ctx, BX, BY, nm); }
    ctx.globalCompositeOperation = 'source-over';
    boltRibbon(ctx, BX, BY, nm, 10.4 * k, (v) => 0.45 + 0.55 * pow(sin(PI * v), 0.5), P.c1, P.c2, ga, fa);
    ctx.restore();
    // where it lands: a hot flare, a flat floor shock with cracks, sparks
    const ia = fa * ramp(t, 0.07, 0.13);
    glowAt(ctx, x1, y1, 84 * k, P.c1, 0.6 * ia);
    glowAt(ctx, x1, y1, 40 * k, WHITE, 0.6 * ia);
    const fl = ramp(t, 0.07, 0.11) * (1 - ramp(t, 0.11, 0.42));
    if (fl > 0.02) {
      ctx.save(); ctx.translate(x1, y1); ctx.globalAlpha = ga * fl;
      ctx.beginPath(); starPath(ctx, 8, hv(P.seed, 9) * TAU, (i) => (i % 2 ? 20 : 32) * k * (0.8 + 0.4 * hv(fs, i)), 9 * k);
      ctx.lineJoin = 'miter'; ctx.lineWidth = 4.4; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = CREAM; ctx.fill();
      ctx.restore();
    }
    const ring = ramp(t, 0.08, 0.6);
    if (ring > 0 && ring < 1) {
      ctx.save(); ctx.translate(x1, y1); ctx.globalAlpha = ga * (1 - ring); ctx.lineCap = 'round';
      const rx = 96 * eo3(ring) * k, ry = 28 * eo3(ring) * k, lw = 7 * k * (1 - ring) + 1.4;
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.lineWidth = lw + 4.4; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = lw; ctx.strokeStyle = P.c1; ctx.stroke(); ctx.lineWidth = lw * 0.4; ctx.strokeStyle = CREAM; ctx.stroke();
      // cracks in the floor: short spokes just inside the ring
      ctx.beginPath();
      for (let i = 0; i < 7; i++) { const an = i / 7 * TAU + hv(P.seed, i + 880) * 0.5, r0 = 0.45 * eo3(ring), r1 = 0.82 * eo3(ring); ctx.moveTo(cos(an) * rx * r0, sin(an) * ry * r0); ctx.lineTo(cos(an) * rx * r1, sin(an) * ry * r1); }
      ctx.lineWidth = 3 * k * (1 - ring) + 0.8; ctx.strokeStyle = P.c1; ctx.stroke();
      ctx.restore();
    }
    const ns = cnt(9);
    for (let i = 0; i < ns; i++) {
      const tau = c01((t - 0.08 - 0.06 * hv(P.seed, i + 800)) / 0.42);
      if (tau <= 0 || tau >= 1) continue;
      const an = -PI * hv(P.seed, i + 820) + (hv(P.seed, i + 830) > 0.7 ? PI * 0.9 : 0), d0 = (30 + 120 * hv(P.seed, i + 840)) * k * eo3(tau);
      const sx = x1 + cos(an) * d0, sy = y1 + sin(an) * d0 * 0.8 + 40 * tau * tau * k, r = (3.4 + 2.6 * hv(P.seed, i + 850)) * k * (1 - tau * 0.5);
      ctx.globalAlpha = ga * (1 - tau); ctx.save(); ctx.translate(sx, sy); ctx.rotate(an + tau * 5);
      ctx.beginPath(); ctx.moveTo(0, -r * 1.5); ctx.lineTo(r, 0); ctx.lineTo(0, r * 1.5); ctx.lineTo(-r, 0); ctx.closePath(); ctx.fillStyle = i % 2 ? CREAM : P.c1; ctx.fill(); ctx.restore();
    }
    ctx.globalAlpha = ga;
  };
  nominal.lightning = 200;

  FX.chain = (ctx, o, t) => {
    const P = prep(o, '#ff9a2e', (c) => (luma(c) > 0.8 ? '#ffe45e' : tint(c, 0.5))); if (!P) return;
    t = T01(t);
    let x0 = P.x, y0 = P.y, x1 = fin(o && o.x2, P.x), y1 = fin(o && o.y2, P.y);
    if (hypot(x1 - x0, y1 - y0) < 10) { x1 = x0 + cos(P.ang) * 260 * P.s * P.dir; y1 = y0 + sin(P.ang) * 260 * P.s; }
    const k = min(1.6, max(0.55, P.s)), ga = ctx.globalAlpha, L = hypot(x1 - x0, y1 - y0), dx = (x1 - x0) / L, dy = (y1 - y0) / L;
    // the arc bows up on screen: a quadratic whose control point sits off the chord on the upper side
    let nx = -dy, ny = dx; if (ny > 0) { nx = -nx; ny = -ny; }
    const bow = min(86, 26 + L * 0.2) * k, fade = 1 - ramp(t, 0.78, 1), head = eo3(ramp(t, 0, 0.4)), tail = sm(ramp(t, 0.5, 0.96));
    const at = (u) => { const b = 4 * u * (1 - u) * bow; return [x0 + (x1 - x0) * u + nx * b, y0 + (y1 - y0) * u + ny * b]; };
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // the guide: a dotted line along the arc, drawn as far as the lead note has run
    if (head - tail > 0.02) {
      const NG = 18;
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        for (let i = 0; i <= NG; i++) { const u = tail + (head - tail) * i / NG, q = at(u); if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]); }
        ctx.setLineDash([1, 12 * k]); ctx.globalAlpha = ga * fade * (pass ? 1 : 0.9); ctx.lineWidth = (pass ? 3.4 : 7.4) * k; ctx.strokeStyle = pass ? P.c2 : INK; ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    // the walking notes: each pops into its place on the arc one after the other and keeps a little bounce
    const NN = 5;
    for (let i = 0; i < NN; i++) {
      const ts = 0.05 + 0.1 * i, tau = ramp(t, ts, ts + 0.2), u = (i + 0.5) / NN;
      if (tau <= 0 || t > 0.97) continue;
      const q = at(u), hop = 26 * k * 4 * tau * (1 - tau) * (tau < 1 ? 1 : 0), idle = (tau >= 1 ? 5 * k * abs(sin(t * 11 + i * 1.3)) : 0), a = ramp(tau, 0, 0.3) * fade * (1 - ramp(t, 0.8, 0.97));
      ctx.globalAlpha = ga * a;
      noteAt(ctx, q[0], q[1] - hop - idle, (17 + 3 * hv(P.seed, i)) * k * (0.5 + 0.5 * eoBack(tau)), (hv(P.seed, i + 20) - 0.5) * 0.5 + sin(t * 9 + i) * 0.1, i % 2 ? P.c2 : P.c1, i % 2 ? 'quarter' : 'eighth');
    }
    // the lead note: a bright cream head running ahead along the arc
    if (head < 0.999 || t < 0.5) {
      const q = at(head), a = fade * (1 - ramp(t, 0.4, 0.55));
      if (a > 0.02) { glowAt(ctx, q[0], q[1], 34 * k, WHITE, 0.5 * a); ctx.globalAlpha = ga * a; noteAt(ctx, q[0], q[1], 22 * k, -0.2 + sin(t * 30) * 0.1, CREAM, 'beamed'); }
    }
    ctx.restore(); ctx.globalAlpha = ga;
    // node flares at both ends; the far one bursts on arrival
    glowAt(ctx, x0, y0, 36 * k, P.c1, 0.5 * env(t, 0.05, 0.4, 0.8));
    const arr = ramp(t, 0.38, 0.5) * (1 - ramp(t, 0.5, 0.95));
    if (arr > 0.02) {
      glowAt(ctx, x1, y1, 60 * k, P.c1, 0.6 * arr);
      ctx.globalAlpha = ga * arr; tk.sparkle(ctx, x1, y1, 24 * k * (0.5 + 0.5 * eo3(ramp(t, 0.38, 0.55))), { color: CREAM, rot: 0.3, glow: 0.3, thin: 0.14 });
      const tau = ramp(t, 0.4, 0.85);
      for (let i = 0; i < cnt(6); i++) {
        const an = hv(P.seed, i + 30) * TAU, d0 = (16 + 46 * hv(P.seed, i + 60)) * k * eo3(tau);
        ctx.globalAlpha = ga * (1 - tau);
        tk.sparkle(ctx, x1 + cos(an) * d0, y1 + sin(an) * d0, (4 + 3 * hv(P.seed, i + 90)) * k, { color: i % 2 ? CREAM : P.c1, rot: an, glow: 0 });
      }
    }
    ctx.globalAlpha = ga;
  };
  nominal.chain = 160;

  // ===============================================================================================================
  // flame (Sizzle: round cartoon flames in three tones)
  // ===============================================================================================================
  // a plump teardrop flame with a curled tip and a rounded foot
  function tonguePath(ctx, bx, by, h, w, lean, curl) {
    ctx.moveTo(bx - w, by);
    ctx.bezierCurveTo(bx - w * 1.35, by - h * 0.46, bx + curl - w * 0.55, by - h * 0.7, bx + lean, by - h);
    ctx.bezierCurveTo(bx + curl + w * 0.7, by - h * 0.58, bx + w * 1.4, by - h * 0.34, bx + w, by);
    ctx.quadraticCurveTo(bx, by + w * 0.8, bx - w, by);
    ctx.closePath();
  }
  // one cel flame: outline, outer tone, middle tone, inner tone
  function tongue(ctx, bx, by, hh, w, lean, curl, cols) {
    ctx.beginPath(); tonguePath(ctx, bx, by, hh, w, lean, curl);
    celFill(ctx, cols[0], 6.4);
    ctx.beginPath(); tonguePath(ctx, bx, by + 2, hh * 0.8, w * 0.74, lean * 0.8, curl * 0.8); ctx.fillStyle = cols[1]; ctx.fill();
    ctx.beginPath(); tonguePath(ctx, bx, by + 3, hh * 0.5, w * 0.44, lean * 0.5, curl * 0.5); ctx.fillStyle = cols[2]; ctx.fill();
  }
  FX.flame = (ctx, o, t) => {
    const P = prep(o, '#ff8a3d', (c) => (luma(c) > 0.9 ? CREAM : mix(tint(c, 0.3), '#ffd84d', 0.7))); if (!P) return;
    t = T01(t); place(ctx, P);
    const ga = ctx.globalAlpha, sd = P.seed, e = eo3(ramp(t, 0, 0.32)) * (1 - sm(ramp(t, 0.68, 1))), tq = floor(t * 14) / 14;
    const N = 7, cols = [mix(P.c1, '#e8383d', 0.42), P.c1, P.c2], wind = sin(TAU * (0.85 * tq + hv(sd, 77))) * 0.6 + hs(sd, 78) * 0.3;
    ctx.translate(0, 26);
    glowAt(ctx, 0, -50, 118, P.c1, 0.48 * e);
    glowAt(ctx, 0, -30, 58, P.c2, 0.42 * e);
    // a soft warm scorch under it
    ctx.globalAlpha = ga * 0.42 * e; ctx.beginPath(); ctx.ellipse(0, 5, 56, 10, 0, 0, TAU); ctx.fillStyle = INK; ctx.fill();
    ctx.globalAlpha = ga;
    // small licks at the two edges, then the tall flames; outermost first so the tall middle ones sit in front
    const items = [];
    for (let i = 0; i < N; i++) items.push({ i, fx: (i - 3) / 3, small: false });
    items.push({ i: 20, fx: -1.32, small: true }, { i: 21, fx: 1.34, small: true }, { i: 22, fx: -0.66, small: true }, { i: 23, fx: 0.7, small: true });
    items.sort((a, b) => (abs(a.fx) < abs(b.fx) ? 1 : abs(a.fx) > abs(b.fx) ? -1 : a.i - b.i));
    for (let oi = 0; oi < items.length; oi++) {
      const it = items[oi], i = it.i, fx = it.fx, bx = fx * 38 + hs(sd, i) * 5;
      const ph = hv(sd, i + 20), fq = 2.2 + 1.6 * hv(sd, i + 40), sw = sin(TAU * (fq * tq + ph)), cw = cos(TAU * (fq * tq + ph));
      const base = it.small ? 34 + 24 * hv(sd, i + 60) : 62 + 84 * hv(sd, i + 60) * (1 - 0.5 * fx * fx), hh = base * (1 - 0.3 * abs(fx) * abs(fx)) * (0.88 + 0.14 * sw) * e * (i === 3 ? 1.14 : 1);
      const w = (it.small ? 10 : 15 + 7 * hv(sd, i + 80)) * (0.6 + 0.4 * e);
      if (hh < 3) continue;
      const lean = sw * 10 + fx * 7 + wind * hh * 0.18, curl = cw * 8 * (i % 2 ? 1 : -1);
      tongue(ctx, bx, 0, hh, w, lean, curl, cols);
    }
    // detached little flames lifting off the top
    for (let i = 0; i < cnt(4); i++) {
      const ts = 0.1 + 0.3 * hv(sd, i + 300), tau = c01((t - ts) / 0.42);
      if (t < ts || tau >= 1) continue;
      const x = hs(sd, i + 320) * 30 + sin(tau * 6 + i) * 9 + wind * 20 * tau, y = -(70 + 60 * hv(sd, i + 340)) - 80 * eo2(tau), s = 1 - tau * 0.7;
      ctx.globalAlpha = ga * (1 - tau * tau);
      tongue(ctx, x, y, 34 * s, 10 * s, wind * 5, 3, cols);
    }
    ctx.globalAlpha = ga;
    // chilli-red sparks and embers
    const ne = cnt(15);
    for (let i = 0; i < ne; i++) {
      const ts = 0.55 * hv(sd, i + 100), tau = c01((t - ts) / 0.5);
      if (t < ts || tau >= 1) continue;
      const x = hs(sd, i + 120) * 50 + sin(tau * 5 + i) * 8 + 16 * tau + wind * 12 * tau, y = -(30 + 130 * hv(sd, i + 140)) * eo2(tau) - 10, r = (3 + 3.4 * hv(sd, i + 160)) * (1 - tau);
      ctx.globalAlpha = ga * (1 - tau * tau); ctx.save(); ctx.translate(x, y); ctx.rotate(tau * 3 + i);
      ctx.beginPath(); ctx.moveTo(0, -r * 1.5); ctx.lineTo(r, 0); ctx.lineTo(0, r * 1.5); ctx.lineTo(-r, 0); ctx.closePath();
      ctx.fillStyle = i % 3 === 0 ? P.c2 : i % 3 === 1 ? '#e8383d' : P.c1; ctx.fill(); ctx.restore();
    }
    ctx.restore(); ctx.globalAlpha = ga;
  };
  nominal.flame = 170;

  // ===============================================================================================================
  // frost (TING!: a glassy crystal sparkle burst and a bell ring)
  // ===============================================================================================================
  function shardPath(ctx, len, w) {
    const b = 8, sh = b + (len - b) * 0.36;
    ctx.moveTo(b, 0); ctx.lineTo(sh, -w); ctx.lineTo(len, 0); ctx.lineTo(sh, w); ctx.closePath();
  }
  FX.frost = (ctx, o, t) => {
    const P = prep(o, '#bfefff', () => WHITE); if (!P) return;
    t = T01(t); place(ctx, P);
    const ga = ctx.globalAlpha, sd = P.seed, K = cnt(10), rot = hv(sd, 900) * TAU, dark = mix(P.c1, '#5a9be0', 0.55), lite = tint(P.c1, 0.7);
    glowAt(ctx, 0, 0, 120 * (0.5 + 0.5 * eo3(t)), P.c1, 0.5 * (1 - ramp(t, 0.3, 0.9)));
    // the bell ring: two sets of sound arcs ringing out to the sides, outlined, thinning as they go
    for (let j = 0; j < 2; j++) {
      const rr = ramp(t, 0.03 + 0.1 * j, 0.7);
      if (rr <= 0 || rr >= 1) continue;
      const r = 34 + 88 * eo3(rr), lw = 5.6 * (1 - rr) + 1.4;
      ctx.globalAlpha = ga * (1 - rr) * 0.95; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, r, -0.85, 0.85); ctx.moveTo(cos(PI - 0.85) * r, sin(PI - 0.85) * r); ctx.arc(0, 0, r, PI - 0.85, PI + 0.85);
      ctx.lineWidth = lw + 4.4; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = lw; ctx.strokeStyle = j ? P.c1 : WHITE; ctx.stroke();
    }
    ctx.globalAlpha = ga;
    // the crystals: outlined two-tone shards that thrust out with an overshoot, then shatter
    for (let i = 0; i < K; i++) {
      const long = i % 3 === 0, L = (42 + 34 * hv(sd, i + 10)) * (long ? 1.32 : 1), w = L * 0.17 + 3.4, a = (i + hs(sd, i + 30) * 0.22) / K * TAU + rot;
      const t0 = 0.02 + 0.03 * (i % 4), g = eoBack(ramp(t, t0, t0 + 0.26)), shat = ramp(t, 0.66 + 0.06 * hv(sd, i + 50), 1);
      if (g <= 0.02 || shat >= 1) continue;
      const len = max(4, L * g * (1 - 0.35 * shat)), ww = w * (0.4 + 0.6 * min(1, g)) * (1 - 0.5 * shat);
      ctx.save(); ctx.rotate(a); ctx.translate(shat * 14 * hv(sd, i + 70), 0);
      ctx.globalAlpha = ga * (1 - shat * shat);
      ctx.beginPath(); shardPath(ctx, len, ww); ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = dark; ctx.fill();
      // two-tone facets: the upper half is the lit face, one white glint along the ridge
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(8 + (len - 8) * 0.36, -ww); ctx.lineTo(len, 0); ctx.closePath(); ctx.fillStyle = lite; ctx.fill();
      ctx.beginPath(); ctx.moveTo(8 + (len - 8) * 0.3, -ww * 0.5); ctx.lineTo(len * 0.7, -ww * 0.12); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = WHITE; ctx.stroke();
      ctx.restore();
    }
    // floating gems between the crystals
    for (let i = 0; i < cnt(6); i++) {
      const a = (i + 0.5) / 6 * TAU + rot + hs(sd, i + 300) * 0.2, d = (74 + 30 * hv(sd, i + 320)) * eo3(ramp(t, 0.08, 0.5)) + 16 * ramp(t, 0.5, 1), r = (5 + 3.5 * hv(sd, i + 340)) * (1 - ramp(t, 0.6, 1)), al = env(t, 0.12, 0.6, 0.95);
      if (r < 0.6 || al < 0.02) continue;
      ctx.save(); ctx.translate(cos(a) * d, sin(a) * d + 30 * ramp(t, 0.55, 1) * ramp(t, 0.55, 1)); ctx.rotate(a); ctx.globalAlpha = ga * al;
      ctx.beginPath(); ctx.moveTo(r * 1.5, 0); ctx.lineTo(0, -r); ctx.lineTo(-r * 1.5, 0); ctx.lineTo(0, r); ctx.closePath(); celFill(ctx, lite, 4);
      ctx.restore();
    }
    ctx.globalAlpha = ga;
    // the big four-point star at the heart of the burst, and a small one turned half a step
    const sa = env(t, 0.1, 0.5, 0.85), gs = eo3(ramp(t, 0, 0.26));
    if (sa > 0.02) {
      ctx.globalAlpha = ga * sa;
      tk.sparkle(ctx, 0, 0, 54 * gs, { color: CREAM, rot: 0, glow: 0.7, thin: 0.13 });
      tk.sparkle(ctx, 0, 0, 30 * gs, { color: WHITE, rot: PI / 4, glow: 0, thin: 0.16 });
      ctx.globalAlpha = ga;
    }
    // shatter debris
    for (let i = 0; i < cnt(14); i++) {
      const tau = c01((t - 0.62 - 0.12 * hv(sd, i + 400)) / 0.38);
      if (tau <= 0 || tau >= 1) continue;
      const a = hv(sd, i + 420) * TAU, d = (36 + 60 * hv(sd, i + 440)) + 40 * tau, x = cos(a) * d + hs(sd, i + 450) * 20 * tau, y = sin(a) * d * 0.8 + 130 * tau * tau, r = (3.4 + 4 * hv(sd, i + 460)) * (1 - tau * 0.4);
      ctx.save(); ctx.translate(x, y); ctx.rotate(a + tau * 6); ctx.globalAlpha = ga * (1 - tau);
      ctx.beginPath(); ctx.moveTo(0, -r * 1.4); ctx.lineTo(r, r); ctx.lineTo(-r, r * 0.8); ctx.closePath(); celFill(ctx, i % 2 ? WHITE : lite, 3.6);
      ctx.restore();
    }
    ctx.restore(); ctx.globalAlpha = ga;
  };
  nominal.frost = 130;

  // ===============================================================================================================
  // poison (Earworm: note-worms)
  // ===============================================================================================================
  // a worm's head baked per colour: a round face with two big eyes and a little note flag growing out of the top. 40 x 56, the face centre at (18, 40)
  function wormHead(fill) {
    return ART.sprite('fx|worm|' + fill, 40, 56, (g) => {
      g.lineJoin = 'round'; g.lineCap = 'round';
      const flag = () => { g.beginPath(); g.moveTo(26.6, 6); g.bezierCurveTo(36, 9, 38, 20, 33, 28); g.bezierCurveTo(33.5, 21, 30, 17, 26.6, 16); g.closePath(); };
      const stem = () => { g.beginPath(); g.rect(24.4, 6, 4.4, 28); };
      const head = () => { g.beginPath(); g.arc(18, 40, 11.5, 0, TAU); };
      g.strokeStyle = INK; g.lineWidth = 6; [stem, flag, head].forEach((p) => { p(); g.stroke(); });
      g.fillStyle = fill; [stem, flag, head].forEach((p) => { p(); g.fill(); });
      g.save(); head(); g.clip(); g.beginPath(); g.arc(21, 37, 11.5, 0, TAU); g.rect(-5, 20, 60, 40); g.fillStyle = warm(fill, 0.15); g.fill('evenodd'); g.restore();
      [[13.4, 40], [22.6, 40]].forEach((e) => {
        g.beginPath(); g.ellipse(e[0], e[1], 2.9, 3.6, 0, 0, TAU); g.fillStyle = INK; g.fill();
        g.beginPath(); g.arc(e[0] + 0.9, e[1] - 1.3, 1.1, 0, TAU); g.fillStyle = CREAM; g.fill();
      });
      g.beginPath(); g.arc(18, 44.5, 2.6, 0.2, PI - 0.2); g.lineWidth = 1.6; g.strokeStyle = INK; g.stroke();
    });
  }
  FX.poison = (ctx, o, t) => {
    const P = prep(o, '#7cf2c8', (c) => mix(warm(c, 0.05), '#b27cff', 0.86)); if (!P) return;
    t = T01(t); place(ctx, P);
    const ga = ctx.globalAlpha, sd = P.seed, nw = cnt(4), lit = tint(P.c1, 0.4);
    ctx.translate(0, 18);
    glowAt(ctx, 0, -14, 118, P.c1, 0.42 * env(t, 0.15, 0.6, 0.95));
    glowAt(ctx, 0, -40, 70, P.c2, 0.3 * env(t, 0.25, 0.6, 0.95));
    // the note-worms: a face and a flag up front, a string of round segments wriggling behind it
    for (let w = 0; w < nw; w++) {
      const ts = 0.03 + 0.34 * hv(sd, w) * (w / nw + 0.3), tau = (t - ts) / 0.62;
      if (tau <= 0 || tau >= 1) continue;
      const col = w % 2 ? P.c2 : P.c1, x0 = (w - (nw - 1) / 2) * 34 + hs(sd, w + 40) * 12, rise = 96 + 54 * hv(sd, w + 60), ph = hv(sd, w + 80) * TAU, amp = 13 + 6 * hv(sd, w + 100);
      const a = ramp(tau, 0, 0.15) * (1 - ramp(tau, 0.68, 1));
      const pos = (u) => [x0 + sin(u * 7 + ph) * amp * (0.5 + 0.5 * min(1, u * 3)), 14 - rise * eo2(c01(u))];
      ctx.globalAlpha = ga * a;
      // body segments tail first, one outline and one fill for the whole string
      const NS = 5, seg = [];
      for (let j = NS; j >= 1; j--) { const u = tau - j * 0.05; if (u > 0) { const q = pos(u); seg.push([q[0], q[1], (10.4 - j * 1.1) * (0.6 + 0.4 * min(1, u * 5))]); } }
      if (seg.length) {
        ctx.beginPath(); seg.forEach((s) => { ctx.moveTo(s[0] + s[2], s[1]); ctx.arc(s[0], s[1], s[2], 0, TAU); });
        ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = col; ctx.fill();
        ctx.beginPath(); seg.forEach((s) => { ctx.moveTo(s[0] + s[2] * 0.34, s[1] - s[2] * 0.4); ctx.arc(s[0] + s[2] * 0.2, s[1] - s[2] * 0.4, s[2] * 0.34, 0, TAU); });
        ctx.fillStyle = rgba(CREAM, 0.55); ctx.fill();
      }
      const hp = pos(tau), spr = wormHead(col);
      if (!spr._inert) { const k = 1.15 * (0.6 + 0.4 * min(1, tau * 5)); ctx.save(); ctx.translate(hp[0], hp[1]); ctx.rotate(cos(tau * 7 + ph) * 0.25); ctx.drawImage(spr, -18 * k, -40 * k, 40 * k, 56 * k); ctx.restore(); }
    }
    ctx.globalAlpha = ga;
    // bubbles that rise, wobble and pop
    for (let i = 0; i < cnt(9); i++) {
      const ts = 0.5 * hv(sd, i + 200), tau = (t - ts) / 0.55;
      if (tau <= 0 || tau >= 1) continue;
      const r = 4 + 5.6 * hv(sd, i + 220), x = hs(sd, i + 240) * 48 + sin(tau * 9 + i) * 5, y = 16 - (46 + 90 * hv(sd, i + 260)) * eo2(tau);
      if (tau < 0.86) {
        ctx.globalAlpha = ga * ramp(tau, 0, 0.1);
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = rgba(P.c1, 0.32); ctx.fill(); ctx.lineWidth = 3.4; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 1.4; ctx.strokeStyle = lit; ctx.stroke();
        disc(ctx, x - r * 0.32, y - r * 0.36, max(1, r * 0.26), CREAM);
      } else {
        const pk = ramp(tau, 0.86, 1);
        ctx.globalAlpha = ga * (1 - pk); ctx.lineWidth = 2; ctx.strokeStyle = lit; ctx.beginPath(); ctx.arc(x, y, r * (1 + 0.8 * pk), 0, TAU); ctx.stroke();
        ctx.beginPath(); for (let d = 0; d < 6; d++) { const a = d / 6 * TAU + i, r0 = r * (1.3 + pk), r1 = r0 + 4 * (1 - pk); ctx.moveTo(x + cos(a) * r0, y + sin(a) * r0); ctx.lineTo(x + cos(a) * r1, y + sin(a) * r1); } ctx.lineCap = 'round'; ctx.strokeStyle = lit; ctx.stroke();
      }
    }
    ctx.restore(); ctx.globalAlpha = ga;
  };
  nominal.poison = 130;

  // ===============================================================================================================
  // shield (a sound wall)
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
    // interior tint (a soft glow squashed to the shield)
    ctx.save(); ctx.scale(1, rh / rw); glowAt(ctx, 0, 0, rw * 1.05, P.c1, 0.42 * a); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, rw, rh, 0, 0, TAU); ctx.clip();
    // the speaker grille: a hex-packed mesh of dots, each swelling and lighting up as the ripple from the hit passes it
    const sp = max(11, min(rw, rh) / 4.2), rowH = sp * 0.8660254, buckets = [[], [], [], []];
    for (let r = -floor(rh / rowH) - 1; r <= floor(rh / rowH) + 1; r++) {
      for (let q = -floor(rw / sp) - 1; q <= floor(rw / sp) + 1; q++) {
        const cx = q * sp + (r & 1 ? sp / 2 : 0), cy = r * rowH;
        if ((cx * cx) / (rw * rw) + (cy * cy) / (rh * rh) > 0.95) continue;
        const d = hypot(cx - ix, cy - iy), b = exp(-pow((d - ripple) / (sp * 1.9), 2)) * (1 - 0.6 * ramp(t, 0.3, 0.9));
        buckets[b > 0.7 ? 3 : b > 0.4 ? 2 : b > 0.15 ? 1 : 0].push(cx, cy);
      }
    }
    const bR = [sp * 0.12, sp * 0.17, sp * 0.23, sp * 0.31], bA = [0.6, 0.78, 0.92, 1];
    for (let b = 0; b < 4; b++) {
      const arr = buckets[b];
      if (!arr.length) continue;
      ctx.beginPath();
      for (let c = 0; c < arr.length; c += 2) { ctx.moveTo(arr[c] + bR[b], arr[c + 1]); ctx.arc(arr[c], arr[c + 1], bR[b], 0, TAU); }
      ctx.globalAlpha = ga * a * bA[b]; ctx.fillStyle = b >= 2 ? CREAM : P.c2; ctx.fill();
      if (b >= 2) { ctx.lineWidth = 1.8; ctx.strokeStyle = INK; ctx.globalAlpha = ga * a * 0.55; ctx.stroke(); }
    }
    // a diagonal glass sheen sweeping across
    const sw = (ramp(t, 0.05, 0.7) - 0.5) * (rw * 3.4);
    ctx.globalAlpha = ga * a * 0.2; ctx.fillStyle = WHITE; ctx.beginPath();
    ctx.moveTo(sw - 24, -rh * 1.2); ctx.lineTo(sw + 4, -rh * 1.2); ctx.lineTo(sw - rh * 0.7 + 4, rh * 1.2); ctx.lineTo(sw - rh * 0.7 - 24, rh * 1.2); ctx.closePath(); ctx.fill();
    ctx.restore();
    // the soft bubble rim: an inner glow band, the warm outline outside, the colour, a cream edge and a catchlight arc at the upper right
    ctx.globalAlpha = ga * a * 0.32; ctx.beginPath(); ctx.ellipse(0, 0, rw - 5, rh - 5, 0, 0, TAU); ctx.lineWidth = 11; ctx.strokeStyle = P.c1; ctx.stroke();
    ctx.globalAlpha = ga * a; ctx.beginPath(); ctx.ellipse(0, 0, rw, rh, 0, 0, TAU);
    ctx.lineWidth = 9; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 5.4; ctx.strokeStyle = P.c1; ctx.stroke(); ctx.lineWidth = 1.8; ctx.strokeStyle = CREAM; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, rw - 9, rh - 9, 0, -1.25, -0.35); ctx.lineCap = 'round'; ctx.lineWidth = 3.4; ctx.strokeStyle = rgba(WHITE, 0.9); ctx.stroke();
    // the impact flare on the rim
    const fa = env(t, 0.06, 0.2, 0.55);
    if (fa > 0.02) { glowAt(ctx, ix, iy, 60, WHITE, 0.7 * fa); ctx.globalAlpha = ga * fa; tk.sparkle(ctx, ix, iy, 28, { color: CREAM, rot: 0.3, glow: 0.3, thin: 0.14 }); }
    ctx.restore(); ctx.globalAlpha = ga;
  };
  nominal.shield = 110;

  // ===============================================================================================================
  // heal (Warm Tea: hearts, plus signs and a curl of steam)
  // ===============================================================================================================
  function plusPath(ctx, x, y, r) {
    const a = r * 0.36;
    ctx.moveTo(x - a, y - r); ctx.lineTo(x + a, y - r); ctx.lineTo(x + a, y - a); ctx.lineTo(x + r, y - a); ctx.lineTo(x + r, y + a); ctx.lineTo(x + a, y + a);
    ctx.lineTo(x + a, y + r); ctx.lineTo(x - a, y + r); ctx.lineTo(x - a, y + a); ctx.lineTo(x - r, y + a); ctx.lineTo(x - r, y - a); ctx.lineTo(x - a, y - a); ctx.closePath();
  }
  FX.heal = (ctx, o, t) => {
    const P = prep(o, '#7dffb0', () => WHITE); if (!P) return;
    t = T01(t); place(ctx, P);
    const ga = ctx.globalAlpha, sd = P.seed, e = env(t, 0.16, 0.6, 1), heart = mix(P.c1, '#ff7eb6', 0.9);
    // a warm light column and a ground ring
    ctx.save(); ctx.translate(0, -34); ctx.scale(0.55, 1.5); glowAt(ctx, 0, 0, 90, '#ffe9a8', 0.5 * e); glowAt(ctx, 0, 0, 60, P.c1, 0.3 * e); ctx.restore();
    glowAt(ctx, 0, 0, 56, WHITE, 0.26 * env(t, 0.1, 0.35, 0.7));
    const rg = ramp(t, 0, 0.62);
    if (rg > 0 && rg < 1) {
      ctx.globalAlpha = ga * (1 - rg); const rx = 26 + 40 * eo3(rg);
      ctx.beginPath(); ctx.ellipse(0, 40, rx, rx * 0.28, 0, 0, TAU); ctx.lineWidth = 7 * (1 - rg) + 2; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 3.4 * (1 - rg) + 0.8; ctx.strokeStyle = P.c1; ctx.stroke();
    }
    ctx.globalAlpha = ga;
    // a curl of steam: two soft ribbons that wind up from the ground ring in loose S curves, tapering to nothing
    for (let w = 0; w < 2; w++) {
      const tau = ramp(t, 0.04 + w * 0.1, 0.9), a = env(tau, 0.2, 0.6, 1);
      if (a < 0.03) continue;
      const n = 22, x0 = (w ? 24 : -24) + hs(sd, w + 900) * 5, sgn = w ? -1 : 1;
      for (let i = 0; i < n; i++) { const v = i / (n - 1), y = 34 - v * (96 + 22 * w) * (0.35 + 0.65 * tau), x = x0 + sgn * sin(v * 7.2 + w * 1.9 + tau * 2.4) * (11 + 15 * v) * (0.4 + 0.6 * tau); QX[i] = x; QY[i] = y; QW[i] = 5.4 * sin(PI * pow(v, 0.65)) + 0.1; }
      ctx.globalAlpha = ga * a * 0.9; ctx.beginPath(); ribbonPath(ctx, n, 1, 0); ctx.fillStyle = CREAM; ctx.fill();
      ctx.globalAlpha = ga * a * 0.55; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.strokeStyle = '#d8b9a0'; ctx.beginPath(); ribbonPath(ctx, n, 1, 0); ctx.stroke();
    }
    // light motes
    for (let i = 0; i < cnt(10); i++) {
      const ts = 0.5 * hv(sd, i), tau = (t - ts) / 0.55;
      if (tau <= 0 || tau >= 1) continue;
      const x = hs(sd, i + 20) * 46 + sin(tau * 6 + i * 1.7) * 7, y = 40 - (100 + 60 * hv(sd, i + 40)) * eo2(tau), r = 2.8 + 3.4 * hv(sd, i + 60), a = pow(sin(PI * tau), 0.7);
      glowAt(ctx, x, y, r * 3.4, i % 3 ? P.c1 : WHITE, 0.7 * a); ctx.globalAlpha = ga * a; disc(ctx, x, y, r * 0.6, CREAM);
    }
    ctx.globalAlpha = ga;
    // hearts and chunky plus signs rising in turn
    for (let i = 0; i < 3; i++) {
      const ts = 0.05 + 0.14 * i, tau = (t - ts) / 0.62;
      if (tau <= 0 || tau >= 1) continue;
      const x = (i - 1) * 32 + hs(sd, i + 90) * 8, y = 24 - (84 + 20 * i) * eo2(tau), r = (13 + 4 * hv(sd, i + 100)) * (0.4 + 0.6 * eoBack(ramp(tau, 0, 0.3))), a = sin(PI * pow(tau, 0.8));
      ctx.globalAlpha = ga * a;
      if (i === 1) {
        ctx.beginPath(); plusPath(ctx, x, y, r); celFill(ctx, P.c1, 7);
        ctx.beginPath(); plusPath(ctx, x, y, r * 0.55); ctx.fillStyle = CREAM; ctx.fill();
      } else {
        ctx.beginPath(); heartPath(ctx, x, y, r * 0.78); celFill(ctx, heart, 7);
        ctx.beginPath(); ctx.ellipse(x - r * 0.42, y - r * 0.38, r * 0.2, r * 0.13, -0.6, 0, TAU); ctx.fillStyle = rgba(CREAM, 0.9); ctx.fill();
      }
    }
    ctx.globalAlpha = ga;
    for (let i = 0; i < 4; i++) {
      const ts = 0.1 + 0.3 * hv(sd, i + 120), tau = c01((t - ts) / 0.35);
      if (tau <= 0 || tau >= 1) continue;
      tk.sparkle(ctx, hs(sd, i + 140) * 44, -10 - 60 * hv(sd, i + 160), 11 * sin(PI * tau), { color: i % 2 ? CREAM : P.c1, rot: tau, glow: 0.3 });
    }
    ctx.restore(); ctx.globalAlpha = ga;
  };
  nominal.heal = 120;

  // ===============================================================================================================
  // buff and debuff: aura streams (equaliser bars and chevrons)
  // ===============================================================================================================
  function chevron(ctx, x, y, w, h, up, col, inkw, colw) {
    // a thick "^" (up) or "v" (down) centred on (x, y)
    const s = up ? -1 : 1;
    ctx.beginPath(); ctx.moveTo(x - w, y - s * h * 0.5); ctx.lineTo(x, y + s * h * 0.5); ctx.lineTo(x + w, y - s * h * 0.5);
    ctx.strokeStyle = INK; ctx.lineWidth = inkw; ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = colw; ctx.stroke();
    ctx.strokeStyle = CREAM; ctx.lineWidth = max(1, colw * 0.28); ctx.stroke();
  }
  // a pastel Gloss drip (a teardrop with the one shared Gloss smile and a diagonal sheen), centred on (x, y), radius r
  function dripPath(ctx, x, y, r) {
    ctx.moveTo(x, y - r * 2.3);
    ctx.bezierCurveTo(x + r * 0.15, y - r * 1.2, x + r * 1.1, y - r * 0.6, x + r * 1.05, y + r * 0.2);
    ctx.arc(x, y + r * 0.2, r * 1.05, 0, PI);
    ctx.bezierCurveTo(x - r * 1.1, y - r * 0.6, x - r * 0.15, y - r * 1.2, x, y - r * 2.3);
    ctx.closePath();
  }
  function aura(ctx, P, t, up) {
    place(ctx, P);
    const ga = ctx.globalAlpha, sd = P.seed, e = env(t, 0.14, 0.7, 1), yTop = -104, yBot = 42;
    ctx.lineJoin = 'miter'; ctx.miterLimit = 5; ctx.lineCap = 'round';
    // the light column (a debuff is a pastel Gloss mist instead)
    if (up) { ctx.save(); ctx.translate(0, -30); ctx.scale(0.65, 1.5); glowAt(ctx, 0, 0, 90, P.c1, 0.5 * e); glowAt(ctx, 0, 0, 56, '#fff4c2', 0.3 * e); ctx.restore(); }
    else { ctx.save(); ctx.translate(0, -30); ctx.scale(0.75, 1.45); glowAt(ctx, 0, 0, 84, GLOSS[1], 0.5 * e); glowAt(ctx, 0, 0, 56, P.c1, 0.3 * e); ctx.restore(); }
    // the equaliser: rows of round-capped bars of different heights climbing the body (up for a buff, down for a debuff)
    for (let r = 0; r < cnt(3); r++) {
      const ph = (t * 1.5 + r * 0.34 + hv(sd, r + 300) * 0.1) % 1, y = up ? lerp(yBot, yTop, ph) : lerp(yTop, yBot, ph), a = sin(PI * ph) * e;
      if (a < 0.04) continue;
      ctx.globalAlpha = ga * a * 0.95;
      ctx.beginPath();
      for (let b = 0; b < 5; b++) { const h = 7 + 24 * (0.5 + 0.5 * sin(ph * 9 + b * 1.9 + r * 2.3 + t * 8)), x = (b - 2) * 15; ctx.moveTo(x, y + h * 0.5); ctx.lineTo(x, y - h * 0.5); }
      ctx.lineWidth = 12.4; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 7.6; ctx.strokeStyle = P.c1; ctx.stroke();
      ctx.beginPath();
      for (let b = 0; b < 5; b++) { const h = 7 + 24 * (0.5 + 0.5 * sin(ph * 9 + b * 1.9 + r * 2.3 + t * 8)), x = (b - 2) * 15 + 1.8; ctx.moveTo(x, y + h * 0.2); ctx.lineTo(x, y - h * 0.38); }
      ctx.lineWidth = 2; ctx.strokeStyle = rgba(CREAM, 0.85); ctx.stroke();
    }
    // the stage ring at the feet with rotating dashes
    ctx.globalAlpha = ga * e * 0.9; ctx.beginPath(); ctx.ellipse(0, 42, 48, 13.5, 0, 0, TAU); ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.stroke();
    ctx.lineWidth = 3.4; ctx.strokeStyle = P.c1; ctx.stroke();
    ctx.setLineDash([12, 8]); ctx.lineDashOffset = -t * (up ? 90 : -90); ctx.beginPath(); ctx.ellipse(0, 42, 35, 10, 0, 0, TAU); ctx.lineWidth = 2.2; ctx.strokeStyle = CREAM; ctx.stroke(); ctx.setLineDash([]);
    // the sweeping ring: feet to head (buff) or head to feet (debuff), with three fading trails
    const sweep = sm(ramp(t, 0.04, 0.74));
    for (let g = 3; g >= 0; g--) {
      const sp = c01(sweep - g * 0.05), y = up ? lerp(yBot, yTop, sp) : lerp(yTop, yBot, sp), a = (g === 0 ? 1 : 0.34 / g) * e * (sweep > 0.02 && sweep < 0.99 ? 1 : 0.3);
      ctx.globalAlpha = ga * a; ctx.beginPath(); ctx.ellipse(0, y, 42, 11.5, 0, 0, TAU);
      ctx.lineWidth = g === 0 ? 8 : 4.4; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = g === 0 ? 4.6 : 2.4; ctx.strokeStyle = P.c1; ctx.stroke();
      if (g === 0) { ctx.lineWidth = 1.6; ctx.strokeStyle = CREAM; ctx.stroke(); }
    }
    // three columns of chunky chevrons climbing (or sinking)
    for (let c = 0; c < 3; c++) {
      for (let i = 0; i < 3; i++) {
        const ph = ((t * 1.7 + c * 0.37 + i / 3) % 1), y = up ? lerp(yBot, yTop, ph) : lerp(yTop, yBot, ph), a = sin(PI * ph) * e;
        if (a < 0.03) continue;
        const sz = 0.85 + 0.4 * hv(sd, c * 3 + i);
        ctx.globalAlpha = ga * a; chevron(ctx, (c - 1) * 28, y, 12 * sz, 11 * sz, up, P.c1, 11, 6.8);
      }
    }
    if (up) {
      // motes rising
      for (let i = 0; i < cnt(8); i++) {
        const ph = ((t * 1.3 + hv(sd, i + 60)) % 1), x = hs(sd, i + 80) * 44 + sin(ph * 6 + i) * 4, y = lerp(yBot, yTop - 10, ph), a = sin(PI * ph) * e;
        glowAt(ctx, x, y, 9, P.c1, 0.9 * a); ctx.globalAlpha = ga * a; disc(ctx, x, y, 2, CREAM);
      }
    } else {
      // two pastel Gloss drips falling from above the head to the feet, a little splash where each one lands
      for (let i = 0; i < 2; i++) {
        const ph = ((t * 1.05 + i * 0.5 + hv(sd, i + 60) * 0.15) % 1), x = (i ? 20 : -18) + hs(sd, i + 80) * 6, fall = ph * ph, y = lerp(yTop - 18, yBot - 6, fall), r = 8.4 + 2 * hv(sd, i + 90), a = sin(PI * min(1, ph * 1.05)) * e;
        if (a < 0.04) continue;
        if (ph < 0.86) {
          ctx.globalAlpha = ga * a; ctx.beginPath(); dripPath(ctx, x, y, r); celFill(ctx, GLOSS[i ? 3 : 2], 5.4);
          ctx.beginPath(); ctx.moveTo(x - r * 0.62, y - r * 0.1); ctx.lineTo(x - r * 0.2, y - r * 0.7); ctx.lineWidth = 2.4; ctx.strokeStyle = rgba(WHITE, 0.95); ctx.stroke();
          ctx.beginPath(); ctx.arc(x + r * 0.05, y + r * 0.35, r * 0.34, 0.25, PI - 0.25); ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke();
        } else {
          const sp = ramp(ph, 0.86, 1);
          ctx.globalAlpha = ga * a * (1 - sp); ctx.beginPath(); ctx.ellipse(x, yBot - 2, 8 + 26 * sp, 3 + 8 * sp, 0, 0, TAU); ctx.lineWidth = 4.6; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 2.2; ctx.strokeStyle = GLOSS[1]; ctx.stroke();
        }
      }
    }
    ctx.restore(); ctx.globalAlpha = ga;
  }
  FX.buff = (ctx, o, t) => { const P = prep(o, '#ffd84d', (c) => tint(c, 0.55)); if (P) aura(ctx, P, T01(t), true); };
  FX.debuff = (ctx, o, t) => { const P = prep(o, '#c49bff', (c) => tint(c, 0.4)); if (P) aura(ctx, P, T01(t), false); };
  nominal.buff = 120; nominal.debuff = 120;

  // ===============================================================================================================
  // sparkle
  // ===============================================================================================================
  FX.sparkle = (ctx, o, t) => {
    const P = prep(o, '#fff4c2', () => WHITE); if (!P) return;
    t = T01(t); place(ctx, P);
    const ga = ctx.globalAlpha, sd = P.seed, e = env(t, 0.12, 0.55, 1);
    glowAt(ctx, 0, 0, 80, P.c1, 0.4 * e);
    // the big lens-flare star with a long cross flare
    const big = sin(PI * ramp(t, 0, 0.6));
    if (big > 0.02) {
      ctx.globalAlpha = ga * big;
      for (let ax = 0; ax < 2; ax++) {
        const L = 118 * eo3(ramp(t, 0, 0.3)), w = 3.4;
        ctx.save(); ctx.rotate(ax * PI / 2 + 0.3 * t); ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(0, -w); ctx.lineTo(L, 0); ctx.lineTo(0, w); ctx.closePath(); ctx.fillStyle = CREAM; ctx.fill(); ctx.restore();
      }
      tk.sparkle(ctx, 0, 0, 42 * (0.5 + 0.5 * eoBack(ramp(t, 0, 0.3))), { color: CREAM, rot: 0.785 * t, glow: 0.7, thin: 0.13 });
    }
    ctx.globalAlpha = ga;
    // the scatter
    for (let i = 0; i < cnt(8); i++) {
      const ts = 0.06 + 0.4 * hv(sd, i), tau = c01((t - ts) / 0.46);
      if (tau <= 0 || tau >= 1) continue;
      const an = hv(sd, i + 20) * TAU, r = 30 + 62 * hv(sd, i + 40), sz = (9 + 11 * hv(sd, i + 60)) * pow(sin(PI * tau), 0.85);
      tk.sparkle(ctx, cos(an) * r, sin(an) * r * 0.8 - 6, sz, { color: i % 3 === 0 ? P.c1 : i % 3 === 1 ? CREAM : P.c2, rot: tau * 1.3 + hv(sd, i + 80), glow: 0.35, thin: 0.15 });
    }
    // little round confetti drifting up
    for (let i = 0; i < cnt(7); i++) {
      const ts = 0.03 + 0.4 * hv(sd, i + 200), tau = c01((t - ts) / 0.55);
      if (tau <= 0 || tau >= 1) continue;
      const x = hs(sd, i + 220) * 70 + sin(tau * 5 + i) * 6, y = 10 - 20 * hv(sd, i + 240) - 70 * eo2(tau), r = 2.4 + 2.6 * hv(sd, i + 260);
      ctx.globalAlpha = ga * sin(PI * tau); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = i % 3 === 0 ? P.c2 : i % 3 === 1 ? '#ffd84d' : P.c1; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = INK; ctx.stroke();
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
  // impactFrame: a pink and green duotone flash with rays
  // ===============================================================================================================
  FX.impactFrame = (ctx, o, t) => {
    const P = prep(o, '#ff7eb6', '#3fcf6a'); if (!P) return;
    t = T01(t);
    const w = P.w, h = P.h, fx = fin(o && o.x, w / 2), fy = fin(o && o.y, h / 2), ga = ctx.globalAlpha;
    if (tk.opt && tk.opt.reduceMotion) {                                    // no flash: one soft tint that fades
      ctx.save(); ctx.globalAlpha = ga * 0.2 * (1 - t) * (1 - t); ctx.fillStyle = P.c1; ctx.fillRect(0, 0, w, h); ctx.restore(); return;
    }
    const inv = t < 0.5 ? 1 : 1 - ramp(t, 0.5, 1), F = floor(t * 20), sd = P.seed + F * 13, neg = 1 - ramp(t, 0.12, 0.3);
    if (inv < 0.02) return;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    // 1: the negative, for the first beat only
    if (neg > 0.02) { ctx.globalCompositeOperation = 'difference'; ctx.globalAlpha = ga * inv * neg; ctx.fillStyle = WHITE; ctx.fillRect(0, 0, w, h); ctx.globalCompositeOperation = 'source-over'; }
    // 2: dim the edges to warm brown so the middle burns, then rays converging on the hit, alternating pink and green wedges
    ctx.globalAlpha = ga * inv; tk.vignette(ctx, w, h, { color: INK, alpha: 0.78, inner: 0.16 });
    const R = hypot(max(fx, w - fx), max(fy, h - fy)) + 30, NR = 30, ra = inv * (1 - 0.3 * ramp(t, 0.3, 0.9)), gap = 1 - 0.55 * neg;
    ctx.globalAlpha = ga * 0.92 * ra * gap; ctx.fillStyle = P.c1; ctx.beginPath();
    for (let i = 0; i < NR; i += 2) {
      const an = (i + hs(sd, i) * 0.3) / NR * TAU + P.ang, wd = TAU / NR * (0.55 + 0.5 * hv(sd, i + 40)), r0 = 36 + 100 * hv(sd, i + 80);
      ctx.moveTo(fx + cos(an) * r0, fy + sin(an) * r0); ctx.lineTo(fx + cos(an - wd * 0.5) * R, fy + sin(an - wd * 0.5) * R); ctx.lineTo(fx + cos(an + wd * 0.5) * R, fy + sin(an + wd * 0.5) * R); ctx.closePath();
    }
    ctx.fill();
    ctx.globalAlpha = ga * 0.9 * ra * gap; ctx.fillStyle = P.c2; ctx.beginPath();
    for (let i = 1; i < NR; i += 2) {
      const an = (i + hs(sd, i + 200) * 0.3) / NR * TAU + P.ang, wd = TAU / NR * (0.45 + 0.4 * hv(sd, i + 240)), r0 = 60 + 120 * hv(sd, i + 280);
      ctx.moveTo(fx + cos(an) * r0, fy + sin(an) * r0); ctx.lineTo(fx + cos(an - wd * 0.5) * R, fy + sin(an - wd * 0.5) * R); ctx.lineTo(fx + cos(an + wd * 0.5) * R, fy + sin(an + wd * 0.5) * R); ctx.closePath();
    }
    ctx.fill();
    // 3: a hard cream star on the hit itself, outlined in warm brown
    const sr = 120 * (1 - 0.25 * t) * eo3(ramp(t, 0, 0.2)), n = 11;
    if (sr > 4) {
      ctx.globalAlpha = ga * inv; ctx.translate(fx, fy);
      ctx.beginPath(); starPath(ctx, n, hv(sd, 900) * TAU, (i) => sr * (i % 2 ? 0.7 : 1.0 + 0.25 * hv(sd, i + 300)), sr * 0.34); ctx.lineJoin = 'miter'; ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = CREAM; ctx.fill();
      ctx.beginPath(); starPath(ctx, n, hv(sd, 900) * TAU + PI / n, (i) => sr * 0.5 * (0.8 + 0.3 * hv(sd, i + 340)), sr * 0.18); ctx.fillStyle = P.c1; ctx.fill();
    }
    ctx.restore(); ctx.globalAlpha = ga;
  };

  // ===============================================================================================================
  // glyph runs: chunky rounded lettering baked one character at a time (sfxText, numberPop)
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
  // st: {a, b (the cel fill: lit top and shaded bottom, hex), ink (the outline colour), shadow (hex or null: the offset element-coloured shadow), edge (hex or null: a sticker
  // rim outside the outline), lw (outline width), fat (extra width of the round-joined fill that rounds the letters), so (shadow offset), key}
  function glyphSprite(ch, st) {
    const adv = advOf(ch), w = adv * 100 + GLYPH_PAD * 2, h = GLYPH_H;
    return ART.sprite('fx|glyph|' + st.key + '|' + ch, w, h, (g) => {
      const cx = w / 2, cy = h / 2 + 4;
      g.font = '900 100px ' + tk.font.num; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineCap = 'round'; g.miterLimit = 2;
      // the shadow falls to the lower left: the house light comes from the upper right
      if (st.shadow) { g.fillStyle = st.shadow; g.strokeStyle = st.shadow; g.lineWidth = st.lw; g.strokeText(ch, cx - st.so, cy + st.so * 1.1); g.fillText(ch, cx - st.so, cy + st.so * 1.1); }
      if (st.edge) { g.strokeStyle = st.edge; g.lineWidth = st.lw + 12; g.strokeText(ch, cx, cy); }
      g.strokeStyle = st.ink; g.lineWidth = st.lw; g.strokeText(ch, cx, cy);
      // the fat cel fill: one hard split, a round-joined stroke of the same fill so the letters come out plump and rounded
      const gr = g.createLinearGradient(0, cy - 42, 0, cy + 42);
      gr.addColorStop(0, st.a); gr.addColorStop(0.5, st.a); gr.addColorStop(0.52, st.b); gr.addColorStop(1, st.b);
      g.strokeStyle = gr; g.lineWidth = st.fat; g.strokeText(ch, cx, cy);
      g.fillStyle = gr; g.fillText(ch, cx, cy);
    });
  }
  // draws the run centred on (0, 0): per(i, n) -> {a, s, dx, dy, rot} for each character. size is the font size in px.
  function glyphRun(ctx, str, st, size, per) {
    const n = str.length, ga = ctx.globalAlpha, k = size / 100, adv = [];
    let total = 0;
    for (let i = 0; i < n; i++) { adv[i] = advOf(str[i]) * size * (st.sp || 1.05); total += adv[i]; }
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
  // sfxText: the hit words
  // ===============================================================================================================
  FX.sfxText = (ctx, o, t) => {
    const P = prep(o, CREAM, () => '#ff7eb6'); if (!P) return;
    t = T01(t);
    const str = String(o && o.text !== undefined && o.text !== null && o.text !== '' ? o.text : 'LA!').slice(0, 12), n = str.length;
    // letters are never mirrored (a mirrored word cannot be read): dir leans the word the other way instead
    ctx.save(); ctx.translate(P.x, P.y); if (P.ang) ctx.rotate(P.ang); if (P.s !== 1) ctx.scale(P.s, P.s);
    const ga = ctx.globalAlpha, sd = P.seed, F = floor(t * 30), size = 74, lean = -0.2 * P.dir;
    const st = { key: 'sfx|' + P.c1 + '|' + P.c2, a: P.c1, b: mix(warm(P.c1, 0.05), P.c2, 0.3), ink: INK, shadow: P.c2, edge: null, lw: 26, fat: 9, so: 8 };
    const out = ramp(t, 0.7, 1), punch = 1 + 0.2 * (1 - ramp(t, 0.04, 0.34)), shake = (1 - ramp(t, 0.08, 0.62)) * 3.4 * (tk.motion() < 1 ? 0.3 : 1);
    // a comic pop behind the word for a beat: a spiky star in the element colour with a cream heart, outlined
    const ray = env(t, 0.06, 0.3, 0.46);
    if (ray > 0.02) {
      ctx.save(); ctx.globalAlpha = ga * ray * 0.95;
      const R = size * (0.95 + 0.14 * n) * eo3(ramp(t, 0, 0.2));
      ctx.beginPath(); starPath(ctx, 12, hv(sd, 5) * TAU, (i) => R * (1 + 0.22 * hv(sd, i + 60)), R * 0.62);
      ctx.lineJoin = 'miter'; ctx.miterLimit = 6; ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = P.c2; ctx.fill();
      ctx.beginPath(); starPath(ctx, 12, hv(sd, 5) * TAU + PI / 12, (i) => R * (0.72 + 0.1 * hv(sd, i + 90)), R * 0.5); ctx.fillStyle = rgba(CREAM, 0.7); ctx.fill();
      ctx.restore(); ctx.globalAlpha = ga;
    }
    ctx.transform(1, 0, lean, 1, 0, 0);
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
    dmg: { a: CREAM, b: '#ffd9b0', ink: INK, edge: null, shadow: null, k: 1 },
    crit: { a: '#ff8a6a', b: '#e8383d', ink: INK, edge: CREAM, shadow: null, k: 1.5 },
    heal: { a: '#d8ffe6', b: '#4fe08a', ink: INK, edge: null, shadow: null, k: 1.08 },
    block: { a: '#e0f2ff', b: '#5fb4ff', ink: INK, edge: null, shadow: null, k: 1 },
    poison: { a: '#eafff8', b: '#4fd6a8', ink: INK, edge: null, shadow: null, k: 0.9 },
    burn: { a: '#fff0c0', b: '#ff8a3d', ink: INK, edge: null, shadow: null, k: 0.9 },
  };
  Object.keys(NUM).forEach((k) => { NUM[k].key = 'num|' + k; NUM[k].so = 0; NUM[k].lw = 20; NUM[k].fat = 6; NUM[k].sp = k === 'crit' ? 1.2 : 1.07; });
  FX.numberPop = (ctx, o, t) => {
    const P = prep(o, CREAM, null); if (!P) return;
    t = T01(t);
    const kind = NUM[P.kind] ? P.kind : 'dmg', st = NUM[kind], str = String(o && o.text !== undefined && o.text !== null && o.text !== '' ? o.text : '0').slice(0, 10), n = str.length, sd = P.seed, F = floor(t * 24);
    ctx.save(); ctx.translate(P.x, P.y); if (P.ang) ctx.rotate(P.ang); if (P.s !== 1) ctx.scale(P.s, P.s);
    const ga = ctx.globalAlpha, size = 46 * st.k, crit = kind === 'crit', shk = crit ? (1 - ramp(t, 0.06, 0.5)) * 3.2 * (tk.motion() < 1 ? 0.3 : 1) : 0, out = ramp(t, 0.66, 1);
    // a crit is announced by a small starburst behind the digits
    if (crit) {
      const sb = env(t, 0.06, 0.16, 0.46);
      if (sb > 0.02) {
        ctx.globalAlpha = ga * sb; const R = 62 * eo3(ramp(t, 0, 0.16)) + 10 * n;
        ctx.beginPath(); starPath(ctx, 10, hv(sd, 5) * TAU, (i) => R * (i % 2 ? 0.72 : 1), R * 0.46); ctx.lineJoin = 'miter'; ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke(); ctx.fillStyle = '#ffd84d'; ctx.fill();
        ctx.beginPath(); starPath(ctx, 10, hv(sd, 5) * TAU + PI / 10, (i) => R * 0.62, R * 0.3); ctx.fillStyle = CREAM; ctx.fill(); ctx.globalAlpha = ga;
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
    // a torn frame: an irregular spiky inner boundary (long and short teeth), heaviest in the four corners
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
  // brushDrag (a Spell cast: id kept, the picture is a mic-wand sparkle trail)
  // ===============================================================================================================
  const PROF = new Float64Array(49);
  FX.brushDrag = (ctx, o, t) => {
    const P = prep(o, '#ff7eb6', (c) => (luma(c) < 0.25 ? '#5ff5ff' : tint(c, 0.5))); if (!P) return;
    t = T01(t);
    let x1 = fin(o && o.x2, P.x), y1 = fin(o && o.y2, P.y);
    if (hypot(x1 - P.x, y1 - P.y) < 8) { x1 = P.x + cos(P.ang) * 420 * P.s * P.dir; y1 = P.y + sin(P.ang) * 420 * P.s; }
    const L = hypot(x1 - P.x, y1 - P.y), k = min(1.8, max(0.5, P.s)), W = 66 * k, sd = P.seed, ga = ctx.globalAlpha;
    // the wand races along the path in the first half; the trail then fades out from its start
    const head = L * eo3(ramp(t, 0, 0.46)), tail = L * sm(ramp(t, 0.5, 1)), a = 1 - ramp(t, 0.9, 1);
    if (head - tail < 6 || a < 0.02) return;
    ctx.save(); ctx.translate(P.x, P.y); ctx.rotate(atan2(y1 - P.y, x1 - P.x));
    const u0 = tail, u1 = head, span = max(1, u1 - u0), ph0 = hv(sd, 1) * TAU, wl = 0.066 / k;
    // the amplitude falls toward the tail; the whole trail snakes on a sine and travels with the head
    const amp = (u) => 11 * k * (0.2 + 0.8 * c01((u - u0) / span)) * (0.4 + 0.6 * sin(PI * c01(u / L) * 0.9 + 0.3));
    const cl = (u) => amp(u) * sin(u * wl - ph0 - t * 9);
    // half width along the stroke: a swell at the touchdown, a steady belly, a thin flick at the end
    for (let i = 0; i <= 48; i++) { const v = i / 48; PROF[i] = (0.5 + 0.5 * sm(ramp(v, 0, 0.07))) * (1 - 0.45 * sm(ramp(v, 0.14, 0.8))) * (1 - sm(ramp(v, 0.9, 1))); }
    const prof0 = (u) => { const f = c01(u / L) * 48, i = f | 0, j = i < 48 ? i + 1 : 48; return PROF[i] + (PROF[j] - PROF[i]) * (f - i); };
    const dry = tail > 2, prof = (u) => prof0(u) * (dry ? 0.12 + 0.88 * sm(c01((u - u0) / (80 * k))) : 1) * sm(c01((u1 - u) / (14 * k) + 0.15));
    const N = 30;
    const fillRibbon = (wMul, add, col, al) => {
      for (let i = 0; i < N; i++) { const u = u0 + span * i / (N - 1); QX[i] = u; QY[i] = cl(u); QW[i] = W * 0.15 * prof(u) * wMul * (i === N - 1 ? 0.4 : 1); }
      ctx.globalAlpha = ga * a * al; ctx.beginPath(); ribbonPath(ctx, N, 1, add); ctx.fillStyle = col; ctx.fill();
    };
    glowAt(ctx, (u0 + u1) / 2, cl((u0 + u1) / 2), span * 0.5 + 30 * k, P.c1, 0.22 * a);
    // a thin ribbon of light under the sparkles: the warm outline, the colour, a cream core
    fillRibbon(1, 3.2 * k, INK, 0.85);
    fillRibbon(1, 0, P.c1, 1);
    fillRibbon(0.45, 0, CREAM, 0.95);
    // the sparkle trail: four-point stars strewn along the path, bigger and brighter toward the wand tip
    const ns = cnt(10);
    for (let j = 0; j < ns; j++) {
      const v = (j + 0.5) / ns, u = u0 + span * v, tw = 0.55 + 0.45 * sin(t * 24 + j * 2.1), sz = (3.4 + 12 * pow(v, 1.4)) * k * tw;
      ctx.globalAlpha = ga * a * (0.45 + 0.55 * v);
      tk.sparkle(ctx, u + hs(sd, j + 30) * 6 * k, cl(u) + hs(sd, j) * (8 + 14 * (1 - v)) * k, sz, { color: j % 3 === 0 ? P.c2 : j % 3 === 1 ? CREAM : P.c1, rot: j * 0.7 + t * 2, glow: 0, thin: 0.15 });
    }
    // the wand: a short mic-wand angled back from the head, a cream band, the grille ball at its foot and a big star at the tip
    const hy = cl(u1 - 8 * k), hx = u1 - 8 * k, wa = -0.55 + 0.1 * sin(t * 12), wl2 = 54 * k, bx = hx - cos(wa) * wl2, by = hy - sin(wa) * wl2;
    ctx.globalAlpha = ga * a; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(hx, hy); ctx.lineWidth = 11 * k; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 6.4 * k; ctx.strokeStyle = P.c1; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(lerp(bx, hx, 0.5), lerp(by, hy, 0.5)); ctx.lineTo(lerp(bx, hx, 0.66), lerp(by, hy, 0.66)); ctx.lineWidth = 6.8 * k; ctx.strokeStyle = CREAM; ctx.stroke();
    ctx.beginPath(); ctx.arc(bx, by, 7.4 * k, 0, TAU); celFill(ctx, '#cfcfe0', 6);
    ctx.beginPath(); ctx.arc(bx - 2 * k, by - 2.4 * k, 2.4 * k, 0, TAU); ctx.fillStyle = WHITE; ctx.fill();
    glowAt(ctx, hx, hy, 40 * k, WHITE, 0.55 * a);
    tk.sparkle(ctx, hx, hy, 22 * k * (0.85 + 0.15 * sin(t * 30)), { color: CREAM, rot: 0.2 + t * 3, glow: 0.5, thin: 0.13 });
    // notes thrown off the head
    for (let i = 0; i < cnt(7); i++) {
      const ts = 0.06 + 0.36 * hv(sd, i + 100), tau = c01((t - ts) / 0.42);
      if (t < ts || tau >= 1) continue;
      const along = L * eo3(ramp(ts, 0, 0.46)) * (0.94 + 0.08 * hv(sd, i + 120)) + 26 * eo3(tau), side = hs(sd, i + 140) > 0 ? 1 : -1;
      const nx = along, ny = cl(min(along, L)) + side * (W * 0.2 + (8 + 46 * hv(sd, i + 160)) * eo3(tau)) - 20 * tau * tau;
      const kind = i % 3 === 0 ? 'beamed' : i % 3 === 1 ? 'quarter' : 'eighth', sz = (12 + 6 * hv(sd, i + 180)) * k * (1 - 0.3 * tau);
      ctx.globalAlpha = ga * a * (1 - tau * tau);
      noteAt(ctx, nx, ny, sz, side * 0.2 * (1 - tau), i % 2 ? P.c2 : tint(P.c1, 0.25), kind);
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
    slash: (w, h) => ({ x: w / 2, y: h * 0.52, color: '#ffd1e6', color2: '#ff7eb6' }),
    cross: (w, h) => ({ x: w / 2, y: h * 0.52, color: '#ffd1e6', color2: '#ff7eb6' }),
    thrust: (w, h) => ({ x: w * 0.12, y: h * 0.55, x2: w * 0.84, y2: h * 0.5, color: '#ffc9de' }),
    burst: (w, h) => ({ x: w / 2, y: h * 0.52, color: '#ffd84d' }),
    ring: (w, h) => ({ x: w / 2, y: h * 0.52, color: '#fff8ec' }),
    inkSplash: (w, h) => ({ x: w / 2, y: h * 0.5, color: '#3fcf6a' }),
    petals: (w, h) => ({ x: w / 2, y: h * 0.56, color: '#ff7eb6' }),
    lightning: (w, h) => ({ x: w * 0.42, y: h * 0.02, x2: w / 2, y2: h * 0.66, color: '#ff9a2e' }),
    chain: (w, h) => ({ x: w * 0.16, y: h * 0.62, x2: w * 0.84, y2: h * 0.44, color: '#ff9a2e' }),
    flame: (w, h) => ({ x: w / 2, y: h * 0.66, color: '#ff8a3d' }),
    frost: (w, h) => ({ x: w / 2, y: h * 0.52, color: '#bfefff' }),
    poison: (w, h) => ({ x: w / 2, y: h * 0.62, color: '#7cf2c8' }),
    shield: (w, h) => ({ x: w / 2, y: h * 0.52, w: 124, h: 160, color: '#5fb4ff' }),
    heal: (w, h) => ({ x: w / 2, y: h * 0.56, color: '#7dffb0' }),
    buff: (w, h) => ({ x: w / 2, y: h * 0.52, color: '#ffd84d' }),
    debuff: (w, h) => ({ x: w / 2, y: h * 0.52, color: '#c49bff' }),
    sparkle: (w, h) => ({ x: w / 2, y: h * 0.5, color: '#fff4c2' }),
    speedLines: (w, h) => ({ x: w / 2, y: h * 0.5, color: '#ffffff' }),
    impactFrame: (w, h) => ({ x: w / 2, y: h * 0.5, w, h }),
    sfxText: (w, h) => ({ x: w / 2, y: h * 0.5, text: 'LA!', color: '#fff8ec', color2: '#ff7eb6' }),
    vignette: (w, h) => ({ x: w / 2, y: h / 2, w, h, color: '#e8383d' }),
    chromatic: (w, h) => ({ x: w / 2, y: h / 2, w, h }),
    brushDrag: (w, h) => ({ x: w * 0.08, y: h * 0.72, x2: w * 0.92, y2: h * 0.3, color: '#ff7eb6' }),
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
    g.save(); g.fillStyle = '#fff8ec'; g.beginPath(); starPath2(g, cw / 2, ch * 0.5, 9, 78, 30); g.fill(); g.lineWidth = 5; g.strokeStyle = INK; g.stroke();
    try { ART.hero.draw(g, 'hanae', { x: cw * 0.34, y: ch * 0.86, s: 0.5, pose: 'idle', t: 0 }); } catch (e) { /* art missing */ }
    g.font = '900 34px ' + tk.font.num; g.textAlign = 'center'; g.fillStyle = '#ffd84d'; g.strokeStyle = INK; g.lineWidth = 6; g.strokeText('TING!', cw * 0.68, ch * 0.34); g.fillText('TING!', cw * 0.68, ch * 0.34);
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
      ['slash', 0, { x: LANES[0], y: 420, color: '#ff7eb6', ang: -0.55, s: 1 }], ['burst', 20, { x: LANES[0], y: 420, color: '#ff7eb6', s: 0.85 }], ['sfxText', 60, { x: LANES[0] + 30, y: 300, text: 'LA!', color: '#fff8ec', color2: '#ff7eb6', s: 1 }], ['numberPop', 90, { x: LANES[0] - 20, y: 330, text: '14', kind: 'dmg' }],
      ['flame', 120, { x: LANES[1], y: 470, color: '#ff8a3d', s: 1.1 }], ['sfxText', 150, { x: LANES[1], y: 290, text: 'SIZZ!', color: '#fff8ec', color2: '#ff8a3d', s: 0.85 }], ['numberPop', 150, { x: LANES[1], y: 350, text: '9', kind: 'burn' }],
      ['lightning', 200, { x: LANES[2] + 40, y: 90, x2: LANES[2], y2: 440, color: '#ff9a2e', s: 1.1 }], ['burst', 250, { x: LANES[2], y: 440, color: '#ffd84d', s: 1 }], ['numberPop', 260, { x: LANES[2], y: 340, text: '32', kind: 'crit', s: 1.15 }],
      ['frost', 300, { x: LANES[3], y: 430, color: '#bfefff', s: 1.1 }], ['sfxText', 320, { x: LANES[3], y: 290, text: 'TING!', color: '#fff8ec', color2: '#7cc6ff', s: 0.85 }], ['numberPop', 330, { x: LANES[3], y: 340, text: '11', kind: 'dmg' }],
      ['poison', 350, { x: LANES[4], y: 460, color: '#7cf2c8', s: 1 }], ['numberPop', 380, { x: LANES[4], y: 340, text: '4', kind: 'poison' }],
      ['petals', 0, { x: E.hero.x, y: E.hero.y - 130, color: '#ff7eb6', s: 1.1 }], ['buff', 100, { x: E.back.x, y: E.back.y - 120, color: '#ffd84d', s: 1.2 }],
      ['heal', 200, { x: E.hero.x, y: E.hero.y - 100, color: '#7dffb0', s: 1.1 }], ['shield', 260, { x: E.hero.x, y: E.hero.y - 120, w: 130, h: 220, color: '#5fb4ff', s: 1 }],
    ] },
    crit: { ms: 1000, list: () => [
      ['speedLines', 0, { x: LANES[1], y: 400, w: 1280, h: 720, color: '#ffffff', s: 1.1 }], ['cross', 0, { x: LANES[1], y: 400, color: '#ff7eb6', s: 1.35, ang: -0.3 }], ['burst', 10, { x: LANES[1], y: 400, color: '#ff7eb6', s: 1.55 }],
      ['ring', 30, { x: LANES[1], y: 400, color: '#fff8ec', s: 1.3 }], ['impactFrame', 40, { x: LANES[1], y: 400, w: 1280, h: 720 }], ['chromatic', 60, { w: 1280, h: 720 }],
      ['sfxText', 80, { x: LANES[1] + 34, y: 300, text: 'BOOM!', color: '#fff8ec', color2: '#ff7eb6', s: 1.25, ang: -0.1 }], ['numberPop', 90, { x: LANES[1] - 10, y: 330, text: '58', kind: 'crit', s: 1.3 }], ['vignette', 40, { w: 1280, h: 720, color: '#e8383d' }],
    ] },
    ink: { ms: 1100, list: (E) => [
      ['inkSplash', 0, { x: LANES[0], y: 430, color: '#3fcf6a', s: 1.2 }], ['sfxText', 40, { x: LANES[0], y: 300, text: 'PKAH!', s: 0.9, color: '#fff8ec', color2: '#3fcf6a' }],
      ['chain', 120, { x: LANES[0], y: 430, x2: LANES[1], y2: 420, color: '#ff9a2e' }], ['chain', 200, { x: LANES[1], y: 420, x2: LANES[2], y2: 430, color: '#ff9a2e' }],
      ['thrust', 60, { x: E.hero.x + 60, y: E.hero.y - 130, x2: LANES[0] - 30, y2: 420, color: '#ffc9de' }], ['debuff', 260, { x: LANES[2], y: 420, color: '#c49bff', s: 1.3 }],
      ['brushDrag', 0, { x: 380, y: 200, x2: 1000, y2: 260, color: '#ff7eb6', color2: '#5ff5ff', s: 1 }], ['sparkle', 300, { x: LANES[3], y: 400, color: '#fff4c2', s: 1.2 }],
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
    if (params.color2) extra.color2 = params.color2 === 'none' ? undefined : '#' + String(params.color2).replace('#', '');
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
