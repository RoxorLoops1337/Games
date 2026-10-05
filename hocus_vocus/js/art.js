// Hocus Vocus: ART: the art director's toolkit and the ART namespace skeleton. Every art file builds on this one.
//
// STYLE (ART_BIBLE.md is the law): the house look is the owners' chibi style, a chunky warm-brown outline, flat candy colour + ONE hard shadow
// shape + a thin lit-side highlight, sparkle stars and little music notes. The cast kit (art_cast_kit.js) wraps this toolkit in those chibi defaults.
// The toolkit itself keeps its whole original helper set (the variable-width `inkPath` line, `celFill` with a backlight rim and optional halftone
// dots, anime gloss on hair and metal, the washi grain), so any art file can still reach for it. The default key light comes from the upper right
// (ART.tk.light), so shadows fall to the lower left.
// Read this header as the manual: every function a Wave 2 artist needs is here, with its options. Colours passed to helpers that DERIVE other
// colours (celFill, ribbon, glow, sparkle...) must be hex strings ('#ff7eb6'); plain fillStyle strings are fine anywhere else.
//
// THE NAMESPACE (DESIGN 5.6). Real art files REPLACE members by plain assignment (ART.icon.draw = ...); until they do, each member is a working
// placeholder (a labelled coloured box, never throws, safe with the no-op context, safe for unknown ids).
//   ART.res                 backing-store multiplier (UI sets it to UI.px; the gallery sets it and calls ART.sprite.clear())
//   ART.has(kind, id)       true only for REAL art. Art files mark theirs with ART.declare(kind, id | [ids]); ART.enemy.register declares 'enemy' ids
//   ART.declare(kind, ids)  kinds: hero enemy motif relic status tile intent gem `brush` stat type row scene fx (any string works)
//   ART.sheet(name, fn)     register a gallery sheet fn(canvas, params) into ART.sheets (a plain object); throws on a duplicate name. params.w and
//                           params.h are logical px, params.t is the animation argument (seconds, except ART.fx sheets: progress 0..1)
//   ART.sheetGrid(canvas, params, cells, drawCell, opts)   labelled contact-sheet grid, see below
//   ART.sprite(key, w, h, drawFn) -> canvas   memoised offscreen canvas of (w * ART.res) x (h * ART.res), its context pre-scaled so drawFn(g, w, h)
//                           paints in w x h. Callers ctx.drawImage(spr, x, y, w, h). LRU by count (ART.sprite.maxCount 400) AND by pixels
//                           (ART.sprite.maxPixels 48e6). ART.sprite.clear(), .has(key), .drop(keyPrefix), .stats() -> {count, hits, misses, pixels}.
//                           Falls back to an inert canvas + no-op context when no canvas can be made, so it never throws. NEVER pass a
//                           key whose content depends on anything not in the key. Include size, palette and variant in the key.
//   ART.blit(ctx, spr, x, y, w, h, alpha?)   drawImage that tolerates an inert sprite
//   ART.placeholder(ctx, label, x, y, w, h, opts?)   labelled coloured box (opts.round for a circle, opts.color, opts.alpha)
//   ART.hero    (art_cast.js)  draw portrait medallion bounds poseMs pointAt keyPt warm audit expressions ids outfits skins castId; the chibi
//               cast kit is ART.rj (art_cast_kit.js), Jordan and the gallery helpers are ART.cast
//   ART.enemy   register(id, {draw(ctx, o), bounds}) draw bounds poseMs -- art.js owns the shell: ground shadow, elite ring, boss aura, tier scale
//   ART.card    draw(ctx, cardOrId, w, h, t)   motif(ctx, id, x, y, size, palette, t)
//   ART.icon    draw(ctx, kind, id, x, y, size, opts)      ART.scene draw(ctx, id, w, h, t, opts) logo(ctx, x, y, w, t)
//   ART.map     hex(ctx, kind, x, y, size, opts) paintBloom(ctx, x, y, size, p) token(ctx, heroIds, x, y, t, moving)
//   ART.fx      NAME(ctx, o, t)  t is PROGRESS 0..1 here only; ART.fx.names (= LISTS.fx) and ART.fx.ms (default durations)
//
// ENEMY SHELL. ART.enemy.draw(ctx, id, {x, y, s, pose, t, pt, flip, hpPct, phase, alpha, glow}) looks the id up, translates to the feet centre,
// draws a contact shadow and (elite, boss) the tier aura, scales by s * tier scale (elite 1.08), mirrors on flip and calls
// entry.draw(ctx, {s, pose, t, pt, hpPct, phase, glow, flip}) with the context ALREADY translated and scaled, painting around (0, 0), y negative up,
// facing LEFT. Bounds are offsets from the feet centre at s = 1 (elite scale included), not mirrored by flip; `h` is the idle body's drawn height and the optional
// `right` the visible reach to the right of the feet (art plus ground ring), see ART.enemy.bounds. An unknown id draws a placeholder.
//
// THE TOOLKIT: ART.tk (all members are also plain properties, so `const tk = ART.tk` is the usual way in)
//   Palette      pal.{ink night indigo violet dusk paper paper2 sumi gold gold2 vermilion sakura sakura2 jade azure cyan amber bloodmoon ash white}
//                fam(name) -> {base, light, dark, glow} for the LISTS.palettes hue families (fams is the table; unknown -> ash)
//                shade(hex, t?) the house cel shadow, tint(hex, t?) toward white, deep(hex, t?) near-ink version, mix(a, b, t), rgba(hex, alpha)
//                light (default key light angle, the direction TO the light), font.{num display ui}, skies (sky presets)
//   Options      opt {reduceMotion, quality} (UI.applySettings replaces the whole object), motion() -> 1 or 0.3, lowQ() -> quality is 'low'
//   Random       seed(...parts) rng(...parts) vary(id, salt) -> 0..1 pick(id, list, salt) noise1(x, seed) noise2(x, y, seed): all deterministic,
//                seeded through U.hash and a murmur finaliser so near-identical ids do not cluster
//   Easing       ease.{...U.ease, smooth outBack2 inOutSine outSine inSine snap step}   wave(t, period, phase) pulse(t, period, phase, lo, hi)
//                spring(t, freq, damp) blend(a, b, k) blendPose(a, b, k) track([[time, v], ...], t, easing) poseTrack([[time, {pose}], ...], t, easing)
//   Geometry     shapes are arrays of control points [x, y] ([x, y, 1] = sharp corner) smoothed by Catmull-Rom; {poly:[[x, y], ...]} is a straight
//                polygon; a function(ctx) may add path commands (fills only). P(x, y, corner?) circlePts(cx, cy, r, n) ellipsePts(cx, cy, rx, ry, n, rot)
//                arcPts(cx, cy, rx, ry, a0, a1, n) rrectPts(x, y, w, h, r) xf(pts, {dx, dy, s, sx, sy, rot, cx, cy}) mirrorPts(pts, axisX)
//                lerpPts(a, b, k) bendPts(pts, {ang, pow, ox, oy}) bbox(pts) dist(ax, ay, bx, by) flatten(pts, {closed, tension, step}) -> flat
//                [x0, y0, x1, y1, ...] trace(ctx, shape, dx, dy, tension) shapeBox(shape) mat.{I mul pt inv local} (2D affine [a b c d e f])
//   Ink line     inkPath(ctx, shape, o)   the variable-width brush stroke: o.w (3.2) color closed taper taperStart taperEnd pressure ('mid' 'flat'
//                                         'head' 'tail' or fn(u)) wobble (0.14) freq seed t (boil) weightVar (closed lines are heavier on the shadow side)
//                                         light align alpha minW step tension
//                inkStroke(ctx, x0, y0, x1, y1, o) inkCurve(ctx, x0, y0, cx, cy, x1, y1, o) inkBlot(ctx, x, y, r, {seed, color, drips, n, jag})
//                inkBleed(ctx, shape, {w, color, alpha, inside}) inkText(ctx, text, x, y, size, {fill stroke strokeW family weight skew align rot shadow
//                shadowOff grad})
//   Cel shading  celFill(ctx, shape, base, o)   base + one hard shadow + lit-side highlight (o.hi) + backlight rim (o.rim) + halftone + outline:
//                                         o.light depth shadow shadowShape shadowT rim rimW rimSide rimAlpha hi hiW hiAlpha halftone line lineColor
//                                         align tension decor bbox seed wobble weightVar
//                celCircle(ctx, x, y, r, base, o) celEllipse(ctx, x, y, rx, ry, base, o)
//                ribbon(ctx, spine, base, o)  a tapered, shaded, inked strip along a spine (hair, tails, scarves, silk, tentacles, limbs):
//                                         wMax w0 w1 profile tipPow cap bend sway {amp, freq, phase} t shadow shadowW rim gloss glossColor
//                                         glossAlpha strands tipColor tipFrac tipShadow decor line lineColor seed light
//                hairLock(ctx, spine, base, o) ribbon with hair defaults    gloss(ctx, spine, {w, color, alpha})  the anime highlight band
//                chain(key, {spine, cuts, reach, overlap, draw}) -> chain: bakes ONE drawing into rigid slabs; chain.draw(ctx, bends, q) bends it
//                                         with one drawImage per slab (bends[0] rotates the root, bends[j] the j-th joint; q is the raster scale,
//                                         use ceil(2 * zoom) / 2), chain.warm(q), chain.segs, chain.joints. This is how ponytails, tails,
//                                         sashes and cloaks sway cheaply and without seams.
//   Light        glow(ctx, x, y, r, hex, alpha, add?) cached additive radial glow   sparkle(ctx, x, y, r, {color rot alpha thin glow})
//                kirakira(ctx, x, y, w, h, t, {n seed color size rise}) drifting gold flecks    speedLines(ctx, cx, cy, {mode 'radial'|'dir' n seed
//                r0 r1 rect angle len color alpha w})    petal(ctx, x, y, size, rot, alpha, base)    bolt(ctx, x0, y0, x1, y1, {seed w jag n color core})
//   Screen tone  halftone(ctx, x, y, w, h, {d r color alpha angle force}) 45 degree dots (cached pattern), halftoneRamp(ctx, x, y, w, h, {d dir r0 r1
//                color alpha}) graduated dots (draws every dot: cache it in a sprite)
//   Faces        eye(ctx, cx, cy, w, h, {expr side open look iris pupil ring sclera ink tilt drop lash wing lineW catch catchSide star glow lashes arc})
//                exprs: neutral happy closed angry determined hurt sad wide half sleepy smirk (eyePresets). side +1 puts the outer corner at +x.
//                brow(ctx, x, y, w, {side tilt arch thick color seed alpha}) mouth(ctx, x, y, w, kind, {lineW color inner tongue}) kinds: smile smirk
//                flat frown open grin shout grit cat tiny. blush(ctx, x, y, w, {color alpha hatch}) nose(ctx, x, y, s, {color skin})
//   Atmosphere   paperGrain(ctx, x, y, w, h, {alpha blend}) vignette(ctx, w, h, {color alpha hard inner}) sky(ctx, x, y, w, h, preset | stops, {key})
//                mist(ctx, x, y, w, h, t, {n seed color alpha speed}) stars(ctx, x, y, w, h, t, {n seed color}) moon(ctx, x, y, r, {glow phase color seed})
//   Utilities    lin(ctx, x0, y0, x1, y1, stops) rad(ctx, x0, y0, r0, x1, y1, r1, stops) withAlpha(ctx, a, fn) flipX(ctx, x, fn) clamp lerp num smoothstep
//   Every drawing function absorbs NaN and Infinity, never throws for odd input, and leaves save/restore balanced. Nothing here reads a clock or
//   the banned random call: animation takes a `t` you pass in, and lines never move unless you give them one.
//
// GALLERY GRID. ART.sheetGrid(canvas, params, cells, drawCell, opts)
//   cells       array of strings or {label, ...anything}      drawCell(ctx, cell, w, h, i, {col, row, x, y, cw, ch}): the context is clipped to the cell
//               and translated so (0, 0) is its top-left; w x h is the drawing area (the label strip sits below it)
//   opts        cols pad gap labelH title titleH bg ('night' | 'paper' | any fill) cellBg aspect      returns {cols, rows, cw, ch, rects}
//   ART.sheets.toolkit demonstrates every helper; look at it (gallery.html?sheet=toolkit) before drawing anything.
const ART = (() => {
  'use strict';
  const A = { res: 1 };                                    // the public namespace; ART.res is read live by the sprite cache
  const tk = { opt: { reduceMotion: false, quality: 'high' } };   // the toolkit; UI.applySettings replaces tk.opt
  const TAU = Math.PI * 2;
  const PI = Math.PI;
  const clamp = U.clamp;
  const lerp = U.lerp;
  // finite number or a default; every public entry point runs untrusted numbers through this so a NaN can never reach a canvas call
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : (d === undefined ? 0 : d));
  // alpha clamp that turns NaN into 0 (comparisons with NaN are false, so test the positive case first)
  const cA = (a) => (a >= 0 ? (a <= 1 ? a : 1) : 0);
  const pos = (v, d) => (v > 0 && isFinite(v) ? v : (d === undefined ? 0 : d));

  // ---------------------------------------------------------------------------------------------------------------
  // palette (mirrors the CSS custom properties in css/base.css) and hue families (LISTS.palettes)
  // ---------------------------------------------------------------------------------------------------------------
  const pal = {
    ink: '#140f2e', night: '#0d0b1e', indigo: '#1a1340', violet: '#3b2a7a', dusk: '#5b3fa8',
    paper: '#f3e6c8', paper2: '#e6d3a3', sumi: '#241a3a', gold: '#f5c96a', gold2: '#ffe9a8',
    vermilion: '#e8383d', sakura: '#ff7eb6', sakura2: '#ffc2dc', jade: '#3fd6b0', azure: '#5fb4ff',
    cyan: '#5ff5ff', amber: '#ff9a2e', bloodmoon: '#b0245c', ash: '#8a86a8', white: '#fff8f0',
    hush: '#cfcdd8', hush2: '#8e8aa3', felt: '#6e6a7e', bronze: '#c9893a', verdigris: '#5fbfa8',
    // the Hocus Vocus skin (HV_ART_AUDIO 9.1): the same values as the --hv-* and --gloss* tokens of css/base.css. `vox` is the light tint of the Vox orb
    // (the orb itself is the inline SVG --vox in the CSS), for canvas numbers and glows.
    hvPink: '#ff7eb6', hvPinkD: '#c93f78', hvPinkL: '#ffc9de', hvGreen: '#3fcf6a', hvGreenD: '#1f7a3a', hvLime: '#c6ff3d',
    hvViolet: '#a77bff', hvOrange: '#ff9a2e', hvTeal: '#2ec4b6', hvCream: '#fff4e6', hvLine: '#2d170f',
    gloss: '#f4f1fb', glossLilac: '#e6d9ff', glossMint: '#d9fff4', glossBlush: '#ffe3f1', vox: '#ffd0e6',
  };
  // card palette names -> {base, light, dark, glow}
  const fams = {
    rose: { base: '#ff7eb6', light: '#ffc2dc', dark: '#b0245c', glow: '#ffd6ea' },
    crimson: { base: '#e8383d', light: '#ff8a7a', dark: '#7d1230', glow: '#ffb0a0' },
    amber: { base: '#ff9a2e', light: '#ffd08a', dark: '#a34a08', glow: '#ffe0a8' },
    gold: { base: '#f5c96a', light: '#ffe9a8', dark: '#a8782a', glow: '#fff2c8' },
    jade: { base: '#3fd6b0', light: '#a5f5dc', dark: '#12775f', glow: '#c8fff0' },
    teal: { base: '#2fc0c8', light: '#9ff0f2', dark: '#0f6a78', glow: '#c8ffff' },
    azure: { base: '#5fb4ff', light: '#b5dcff', dark: '#2559a8', glow: '#d8eeff' },
    indigo: { base: '#4a4fd0', light: '#9aa0ff', dark: '#1a1a70', glow: '#c0c4ff' },
    violet: { base: '#8f5fe8', light: '#cdb0ff', dark: '#43208f', glow: '#e2d0ff' },
    ink: { base: '#2a2445', light: '#8a86a8', dark: '#0d0b1e', glow: '#f3e6c8' },
    moon: { base: '#e8eefc', light: '#ffffff', dark: '#8a96c0', glow: '#ffffff' },
    ash: { base: '#8a86a8', light: '#c4c0d8', dark: '#4a4664', glow: '#dcd8ec' },
  };
  const fam = (name) => fams[name] || fams.ash;

  // colour derivations are hot (called per shape), so they are memoised per input string
  const memo = (fn) => {
    const m = new Map();
    return (a, b) => {
      const k = a + '|' + (b === undefined ? '' : b);
      let v = m.get(k);
      if (v === undefined) { v = fn(a, b); if (m.size > 4000) m.clear(); m.set(k, v); }
      return v;
    };
  };
  const shade = memo((hex, t) => U.color.shadow(hex, t));                       // the house cel shadow: darker, pulled toward indigo
  const tint = memo((hex, t) => U.color.lighten(hex, t == null ? 0.35 : t));    // toward white
  const deep = memo((hex, t) => U.color.mix(U.color.darken(hex, t == null ? 0.55 : t), pal.ink, 0.35));   // near-ink version of a hue (iris rims, deep lines)
  const mix = (a, b, t) => U.color.mix(a, b, clamp(num(t, 0.5), 0, 1));
  const rgbaM = new Map();
  const rgba = (hex, a) => {
    const q = Math.round(cA(a) * 100);
    const k = hex + '|' + q;
    let v = rgbaM.get(k);
    if (v === undefined) { v = U.color.rgba(hex, q / 100); if (rgbaM.size > 6000) rgbaM.clear(); rgbaM.set(k, v); }
    return v;
  };

  // ---------------------------------------------------------------------------------------------------------------
  // seeded randomness: everything varies per id, nothing varies per frame unless the caller feeds t
  // ---------------------------------------------------------------------------------------------------------------
  // FNV hashes of near-identical strings cluster in their high bits, so every derived seed goes through a murmur3 finaliser
  const mix32 = (h) => { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; };
  const seed = (...parts) => mix32(U.hash(...parts));
  const rng = (...parts) => U.rng(mix32(U.hash(...parts)));
  const vary = (id, salt) => mix32(U.hash(id, salt === undefined ? '' : salt)) / 4294967296;      // one stable number in 0..1
  const pick = (id, list, salt) => list[Math.floor(vary(id, salt) * list.length) % list.length];
  const noise1 = (x, sd) => U.noise.n1(x, sd | 0);                                       // smooth 0..1
  const noise2 = (x, y, sd) => U.noise.n2(x, y, sd | 0);

  // ---------------------------------------------------------------------------------------------------------------
  // easing and pose blending
  // ---------------------------------------------------------------------------------------------------------------
  const ease = Object.assign({}, U.ease, {
    smooth: U.smooth,
    outBack2: (t) => { const c = 2.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    inOutSine: (t) => -(Math.cos(PI * t) - 1) / 2,
    outSine: (t) => Math.sin(t * PI / 2),
    inSine: (t) => 1 - Math.cos(t * PI / 2),
    // anticipation then release (easeInOutBack): dips below 0 first, then overshoots 1, settles at 1
    snap: (t) => { const c2 = 1.70158 * 1.525; return t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2 : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2; },
    step: (t) => (t < 1 ? 0 : 1),
  });
  const wave = (t, period, phase) => Math.sin(TAU * (t / (period || 1) + (phase || 0)));
  const pulse = (t, period, phase, lo, hi) => { const a = lo === undefined ? 0 : lo, b = hi === undefined ? 1 : hi; return a + (b - a) * (0.5 + 0.5 * wave(t, period, phase)); };
  // damped spring step response: 0 at t=0, overshoots, settles at 1 (freq rad/s, damp 1/s)
  const spring = (t, freq, damp) => (t <= 0 ? 0 : 1 - Math.exp(-(damp === undefined ? 5 : damp) * t) * Math.cos((freq === undefined ? 12 : freq) * t));
  const blend = (a, b, k) => a + (b - a) * k;
  // component-wise blend of two plain objects of numbers (missing keys count as 0); strings and arrays are taken from b when k >= 0.5
  const blendPose = (a, b, k) => {
    const out = {};
    const keys = new Set(Object.keys(a || {}).concat(Object.keys(b || {})));
    keys.forEach((key) => {
      const x = a ? a[key] : undefined, y = b ? b[key] : undefined;
      if (typeof x === 'number' || typeof y === 'number') out[key] = blend(typeof x === 'number' ? x : 0, typeof y === 'number' ? y : 0, k);
      else out[key] = k >= 0.5 ? (y !== undefined ? y : x) : (x !== undefined ? x : y);
    });
    return out;
  };
  // keyframe track: keys = [[time, value], ...] ascending; eases each span with `easing` (name in ART.tk.ease or fn); holds the ends
  const track = (keys, t, easing) => {
    const n = keys.length;
    if (n === 0) return 0;
    if (t <= keys[0][0]) return keys[0][1];
    if (t >= keys[n - 1][0]) return keys[n - 1][1];
    const fn = typeof easing === 'function' ? easing : (ease[easing] || ease.inOutSine);
    let i = 1;
    while (i < n - 1 && t > keys[i][0]) i++;
    const a = keys[i - 1], b = keys[i];
    return a[1] + (b[1] - a[1]) * fn((t - a[0]) / (b[0] - a[0] || 1));
  };
  // keyframes of whole poses: frames = [[time, poseObj], ...]; always returns a fresh object the caller may edit
  const poseTrack = (frames, t, easing) => {
    const n = frames.length;
    if (t <= frames[0][0]) return Object.assign({}, frames[0][1]);
    if (t >= frames[n - 1][0]) return Object.assign({}, frames[n - 1][1]);
    const fn = typeof easing === 'function' ? easing : (ease[easing] || ease.inOutSine);
    let i = 1;
    while (i < n - 1 && t > frames[i][0]) i++;
    const a = frames[i - 1], b = frames[i];
    return blendPose(a[1], b[1], fn((t - a[0]) / (b[0] - a[0] || 1)));
  };

  // ---------------------------------------------------------------------------------------------------------------
  // geometry: a "shape" is an array of control points [x, y] (or [x, y, 1] for a sharp corner) that Catmull-Rom smoothing
  // turns into a curve; {poly:[[x,y],...]} is a straight-edged polygon; a function(ctx) may add path commands (fills only)
  // ---------------------------------------------------------------------------------------------------------------
  const P = (x, y, corner) => (corner ? [x, y, 1] : [x, y]);
  const circlePts = (cx, cy, r, n) => ellipsePts(cx, cy, r, r, n, 0);
  function ellipsePts(cx, cy, rx, ry, n, rot) {
    n = n || 12; rot = rot || 0;
    const out = [], c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
      out.push([cx + x * c - y * s, cy + x * s + y * c]);
    }
    return out;
  }
  // arc as control points from angle a0 to a1 (radians, canvas orientation), n points inclusive
  function arcPts(cx, cy, rx, ry, a0, a1, n) {
    n = Math.max(2, n || 6);
    const out = [];
    for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * (i / (n - 1)); out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * (ry === undefined ? rx : ry)]); }
    return out;
  }
  // rounded rectangle as control points: eight points with the corners cut by r, which Catmull-Rom smoothing rounds nicely
  function rrectPts(x, y, w, h, r) {
    r = Math.min(r === undefined ? Math.min(w, h) * 0.25 : r, w / 2, h / 2);
    return [[x + r, y], [x + w - r, y], [x + w, y + r], [x + w, y + h - r], [x + w - r, y + h], [x + r, y + h], [x, y + h - r], [x, y + r]];
  }
  // transform helper: returns a NEW array. o = {dx, dy, s, sx, sy, rot, cx, cy}: scale and rotate about (cx, cy) then translate
  function xf(pts, o) {
    o = o || {};
    const sx = (o.sx !== undefined ? o.sx : (o.s !== undefined ? o.s : 1)), sy = (o.sy !== undefined ? o.sy : (o.s !== undefined ? o.s : 1));
    const rot = o.rot || 0, c = Math.cos(rot), s = Math.sin(rot), cx = o.cx || 0, cy = o.cy || 0, dx = o.dx || 0, dy = o.dy || 0;
    return pts.map((p) => {
      const x = (p[0] - cx) * sx, y = (p[1] - cy) * sy;
      const q = [cx + x * c - y * s + dx, cy + x * s + y * c + dy];
      if (p[2]) q.push(p[2]);
      return q;
    });
  }
  const mirrorPts = (pts, axisX) => pts.map((p) => { const q = [2 * (axisX || 0) - p[0], p[1]]; if (p[2]) q.push(p[2]); return q; });
  // morph between two control-point lists of equal length (k 0..1)
  const lerpPts = (a, b, k) => a.map((p, i) => { const q = b[i] || p; const r = [lerp(p[0], q[0], k), lerp(p[1], q[1], k)]; if (p[2]) r.push(p[2]); return r; });
  // bend a chain root-to-tip: point i rotates about the root by ang * (i/(n-1))^pow, so the tip swings most (hair, tails, ribbons)
  function bendPts(pts, o) {
    o = o || {};
    const n = pts.length, ang = num(o.ang, 0), pw = o.pow === undefined ? 1.3 : o.pow;
    const ox = o.ox === undefined ? pts[0][0] : o.ox, oy = o.oy === undefined ? pts[0][1] : o.oy;
    if (!ang) return pts;
    return pts.map((p, i) => {
      const a = ang * Math.pow(n > 1 ? i / (n - 1) : 0, pw), c = Math.cos(a), s = Math.sin(a);
      const x = p[0] - ox, y = p[1] - oy;
      const q = [ox + x * c - y * s, oy + x * s + y * c];
      if (p[2]) q.push(p[2]);
      return q;
    });
  }
  function bbox(pts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < pts.length; i++) { const p = pts[i]; if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    return [x0, y0, x1, y1];
  }
  const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

  // Catmull-Rom control points to a dense flat polyline [x0, y0, x1, y1, ...]. tension 1 = standard, 0 = straight lines.
  function flatten(pts, o) {
    o = o || {};
    const closed = !!o.closed, k = (o.tension === undefined ? 1 : o.tension) / 6, step = o.step || 5;
    const n = pts.length, out = [];
    if (n === 0) return out;
    if (n === 1) { out.push(pts[0][0], pts[0][1]); return out; }
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p1 = pts[i], p2 = pts[(i + 1) % n];
      const p0 = closed ? pts[(i + n - 1) % n] : pts[i > 0 ? i - 1 : 0];
      const p3 = closed ? pts[(i + 2) % n] : pts[i + 2 < n ? i + 2 : n - 1];
      const x1 = p1[0], y1 = p1[1], x2 = p2[0], y2 = p2[1];
      const c1x = p1[2] ? x1 : x1 + (x2 - p0[0]) * k, c1y = p1[2] ? y1 : y1 + (y2 - p0[1]) * k;
      const c2x = p2[2] ? x2 : x2 - (p3[0] - x1) * k, c2y = p2[2] ? y2 : y2 - (p3[1] - y1) * k;
      const cnt = Math.max(1, Math.min(40, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / step)));
      for (let j = 0; j < cnt; j++) {
        const u = j / cnt, v = 1 - u;
        const a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
        out.push(a * x1 + b * c1x + c * c2x + d * x2, a * y1 + b * c1y + c * c2y + d * y2);
      }
    }
    if (!closed) out.push(pts[n - 1][0], pts[n - 1][1]);
    return out;
  }
  const polyFlat = (poly) => { const out = []; for (let i = 0; i < poly.length; i++) out.push(poly[i][0], poly[i][1]); return out; };
  // dense polyline for any shape descriptor (null for function shapes)
  function denseOf(shape, closed, o) {
    if (Array.isArray(shape)) return flatten(shape, { closed, tension: o && o.tension, step: o && o.step });
    if (shape && shape.poly) return polyFlat(shape.poly);
    return null;
  }
  // add a shape to the current path (no beginPath, no fill); dx, dy offset it; always a closed subpath
  function traceShape(ctx, shape, dx, dy, tension, closed) {
    dx = dx || 0; dy = dy || 0;
    if (typeof shape === 'function') { if (dx || dy) { ctx.save(); ctx.translate(dx, dy); shape(ctx); ctx.restore(); } else shape(ctx); return; }
    const isClosed = closed === undefined ? true : closed;
    if (shape && shape.poly) {
      const p = shape.poly;
      if (!p.length) return;
      ctx.moveTo(p[0][0] + dx, p[0][1] + dy);
      for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0] + dx, p[i][1] + dy);
      if (isClosed) ctx.closePath();
      return;
    }
    const pts = shape, n = pts.length;
    if (n < 2) return;
    const k = (tension === undefined ? 1 : tension) / 6;
    ctx.moveTo(pts[0][0] + dx, pts[0][1] + dy);
    const segs = isClosed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p1 = pts[i], p2 = pts[(i + 1) % n];
      const p0 = isClosed ? pts[(i + n - 1) % n] : pts[i > 0 ? i - 1 : 0];
      const p3 = isClosed ? pts[(i + 2) % n] : pts[i + 2 < n ? i + 2 : n - 1];
      const x1 = p1[0], y1 = p1[1], x2 = p2[0], y2 = p2[1];
      ctx.bezierCurveTo((p1[2] ? x1 : x1 + (x2 - p0[0]) * k) + dx, (p1[2] ? y1 : y1 + (y2 - p0[1]) * k) + dy,
        (p2[2] ? x2 : x2 - (p3[0] - x1) * k) + dx, (p2[2] ? y2 : y2 - (p3[1] - y1) * k) + dy, x2 + dx, y2 + dy);
    }
    if (isClosed) ctx.closePath();
  }
  function shapeBox(shape) {
    if (Array.isArray(shape)) return bbox(shape);
    if (shape && shape.poly) return bbox(shape.poly);
    return null;
  }
  // ---------------------------------------------------------------------------------------------------------------
  // sprite cache: memoised offscreen canvases, LRU by count and by total pixels
  // ---------------------------------------------------------------------------------------------------------------
  // every 2d method as a no-op, for environments where a real canvas cannot be made (never throws, never draws)
  const NOOP = (() => {
    let self;
    const fn = () => self;
    const handler = {
      get: (t, k) => (k === 'canvas' ? undefined : k === 'measureText' ? () => ({ width: 0 }) : k === 'getImageData' ? () => ({ data: [], width: 0, height: 0 }) : fn),
      set: () => true,
    };
    self = (typeof Proxy === 'function') ? new Proxy(function () {}, handler) : { canvas: undefined };
    return self;
  })();
  function makeCanvas(w, h) {
    try {
      if (typeof document !== 'undefined' && document && typeof document.createElement === 'function') {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext && c.getContext('2d');
        if (g) return { c, g };
      }
    } catch (e) { /* fall through to the next option */ }
    try {
      if (typeof OffscreenCanvas === 'function') {
        const c = new OffscreenCanvas(w, h), g = c.getContext('2d');
        if (g) return { c, g };
      }
    } catch (e) { /* fall through to the inert stand-in */ }
    return { c: { width: w, height: h, _inert: true }, g: NOOP };
  }
  const sprites = new Map();
  const sstat = { hits: 0, misses: 0, pixels: 0 };
  const patterns = new Map();
  function sprite(key, w, h, drawFn) {
    w = Math.max(1, num(w, 1)); h = Math.max(1, num(h, 1));
    const res = A.res > 0 ? A.res : 1;
    const k = key + '@' + res;
    const hit = sprites.get(k);
    if (hit) { sstat.hits++; sprites.delete(k); sprites.set(k, hit); return hit.c; }
    sstat.misses++;
    let pw = Math.min(4096, Math.max(1, Math.ceil(w * res))), ph = Math.min(4096, Math.max(1, Math.ceil(h * res)));
    const { c, g } = makeCanvas(pw, ph);
    try {
      g.setTransform(pw / w, 0, 0, ph / h, 0, 0);
      drawFn(g, w, h, c);
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) console.error('ART.sprite ' + key + ': ' + (e && e.message));
    } finally {
      try { g.setTransform(1, 0, 0, 1, 0, 0); } catch (e) { /* inert context */ }
    }
    const entry = { c, px: pw * ph };
    sprites.set(k, entry);
    sstat.pixels += entry.px;
    while ((sprites.size > sprite.maxCount || sstat.pixels > sprite.maxPixels) && sprites.size > 1) {
      const oldest = sprites.keys().next().value;
      const e = sprites.get(oldest);
      sstat.pixels -= e.px;
      sprites.delete(oldest);
    }
    return c;
  }
  sprite.maxCount = 400;
  sprite.maxPixels = 48e6;
  sprite.clear = () => { sprites.clear(); patterns.clear(); sstat.pixels = 0; };
  sprite.has = (key) => sprites.has(key + '@' + (A.res > 0 ? A.res : 1));
  sprite.stats = () => ({ count: sprites.size, hits: sstat.hits, misses: sstat.misses, pixels: sstat.pixels });
  sprite.drop = (prefix) => { for (const k of Array.from(sprites.keys())) if (k.indexOf(prefix) === 0) { sstat.pixels -= sprites.get(k).px; sprites.delete(k); } };
  // draw a sprite made by ART.sprite into ctx at (x, y) with logical size w x h
  function blit(ctx, spr, x, y, w, h, alpha) {
    if (!spr || spr._inert) return;
    if (alpha !== undefined && alpha < 1) { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * cA(alpha); ctx.drawImage(spr, x, y, w, h); ctx.globalAlpha = ga; } else ctx.drawImage(spr, x, y, w, h);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // the ink line: variable-width calligraphic strokes
  // ---------------------------------------------------------------------------------------------------------------
  const LIGHT = -1.05;                                  // default key light: the direction TO the light, up and to the right
  const motion = () => (tk.opt && tk.opt.reduceMotion ? 0.3 : 1);
  const lowQ = () => !!(tk.opt && tk.opt.quality === 'low');
  const smoothstep = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

  // Fill a shape (any shape descriptor) as a brush stroke of varying width.
  //   o.w          maximum width in px (default 3.2)          o.color   any fill style (default ART.tk.pal.ink)
  //   o.closed     treat the shape as a loop (an outline), default false
  //   o.taper      fraction of the length used to taper EACH end of an open stroke, default 0.28 (o.taperStart / o.taperEnd override)
  //   o.pressure   'mid' (bulge in the middle, open default), 'flat' (closed default), 'head', 'tail' or fn(u 0..1) -> 0..1
  //   o.wobble     pressure wobble amplitude 0..1 (default 0.14), o.freq wobble frequency per px (default 0.06), o.seed int
  //   o.t          if given the wobble drifts with time (a boiling line); omitted means the line never moves
  //   o.weightVar  closed lines are thicker on the shadow side (0..1, default 0.5), o.light the light angle (see ART.tk.light)
  //   o.align      closed lines only: -1 inside, 0 centred, 1 outside the path (default 0.3)
  //   o.alpha, o.minW, o.step (sample spacing, default 5)
  function inkPath(ctx, shape, o) {
    o = o || {};
    const closed = !!o.closed;
    const col = o.color || pal.ink;
    const W = pos(o.w, 3.2);
    if (typeof shape === 'function') {
      ctx.save(); ctx.beginPath(); shape(ctx);
      ctx.strokeStyle = col; ctx.lineWidth = W; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); ctx.restore();
      return;
    }
    if (!shape) return;
    const d = denseOf(shape, closed, o);
    if (!d || d.length < 4) return;
    const m = d.length >> 1;
    const L = new Array(m);
    L[0] = 0;
    for (let i = 1; i < m; i++) L[i] = L[i - 1] + Math.hypot(d[2 * i] - d[2 * i - 2], d[2 * i + 1] - d[2 * i - 1]);
    const total = L[m - 1] + (closed ? Math.hypot(d[0] - d[2 * m - 2], d[1] - d[2 * m - 1]) : 0);
    if (!(total > 0.4)) return;
    const ts = closed ? 0 : (o.taperStart !== undefined ? o.taperStart : (o.taper !== undefined ? o.taper : 0.28));
    const te = closed ? 0 : (o.taperEnd !== undefined ? o.taperEnd : (o.taper !== undefined ? o.taper : 0.28));
    const prs = o.pressure === undefined ? (closed ? 'flat' : 'mid') : o.pressure;
    const wob = o.wobble === undefined ? 0.14 : o.wobble;
    const freq = o.freq === undefined ? 0.06 : o.freq;
    const sd = o.seed | 0;
    const ph = o.t === undefined ? 0 : num(o.t) * (o.boil === undefined ? 1.6 : o.boil);
    const minW = o.minW === undefined ? Math.min(0.3, W * 0.12) : o.minW;
    const wv = o.weightVar === undefined ? (closed ? 0.5 : (o.light !== undefined ? 0.4 : 0)) : o.weightVar;
    const la = o.light === undefined ? LIGHT : o.light;
    const sdx = -Math.cos(la), sdy = -Math.sin(la);
    let sgn = 1;
    if (closed) {
      let area = 0;
      for (let i = 0; i < m; i++) { const j = (i + 1) % m; area += d[2 * i] * d[2 * j + 1] - d[2 * j] * d[2 * i + 1]; }
      sgn = area > 0 ? 1 : -1;
    }
    const align = closed ? (o.align === undefined ? 0.3 : o.align) : 0;
    const ax = new Array(m), ay = new Array(m), bx = new Array(m), by = new Array(m);
    let wStart = 0, wEnd = 0;
    for (let i = 0; i < m; i++) {
      const a = closed ? (i + m - 1) % m : (i > 0 ? i - 1 : 0), b = closed ? (i + 1) % m : (i < m - 1 ? i + 1 : m - 1);
      let tx = d[2 * b] - d[2 * a], ty = d[2 * b + 1] - d[2 * a + 1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      const nx = ty * sgn, ny = -tx * sgn;
      const u = L[i] / total;
      let w = W;
      w *= typeof prs === 'function' ? num(prs(u), 1) : prs === 'flat' ? 1 : prs === 'head' ? 1 - 0.6 * u : prs === 'tail' ? 0.4 + 0.6 * u : 0.62 + 0.38 * Math.sin(PI * u);
      if (ts > 0 && u < ts) w *= smoothstep(u / ts);
      if (te > 0 && u > 1 - te) w *= smoothstep((1 - u) / te);
      if (wob) w *= 1 + wob * (noise1(L[i] * freq + ph + sd * 3.7, sd) * 2 - 1);
      if (wv) w *= 1 + wv * (nx * sdx + ny * sdy);
      if (w < minW) w = minW;
      const off = align * w / 2, x = d[2 * i], y = d[2 * i + 1];
      ax[i] = x + nx * (off + w / 2); ay[i] = y + ny * (off + w / 2);
      bx[i] = x + nx * (off - w / 2); by[i] = y + ny * (off - w / 2);
      if (i === 0) wStart = w;
      if (i === m - 1) wEnd = w;
    }
    const ga = ctx.globalAlpha;
    if (o.alpha !== undefined) ctx.globalAlpha = ga * cA(o.alpha);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(ax[0], ay[0]);
    for (let i = 1; i < m; i++) ctx.lineTo(ax[i], ay[i]);
    if (closed) {
      ctx.closePath();
      ctx.moveTo(bx[0], by[0]);
      for (let i = m - 1; i >= 1; i--) ctx.lineTo(bx[i], by[i]);
      ctx.closePath();
      ctx.fill('evenodd');
    } else {
      for (let i = m - 1; i >= 0; i--) ctx.lineTo(bx[i], by[i]);
      ctx.closePath();
      ctx.fill();
      if ((ts === 0 && wStart > 1.2) || (te === 0 && wEnd > 1.2)) {
        ctx.beginPath();
        if (ts === 0 && wStart > 1.2) { ctx.moveTo(d[0] + wStart / 2, d[1]); ctx.arc(d[0], d[1], wStart / 2, 0, TAU); }
        if (te === 0 && wEnd > 1.2) { ctx.moveTo(d[2 * m - 2] + wEnd / 2, d[2 * m - 1]); ctx.arc(d[2 * m - 2], d[2 * m - 1], wEnd / 2, 0, TAU); }
        ctx.fill();
      }
    }
    if (o.alpha !== undefined) ctx.globalAlpha = ga;
  }
  // a straight (or bent) brush stroke between two points; o.bend pushes the middle sideways by that many px
  function inkStroke(ctx, x0, y0, x1, y1, o) {
    o = o || {};
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, b = num(o.bend, 0);
    inkPath(ctx, [[x0, y0], [(x0 + x1) / 2 - dy / len * b, (y0 + y1) / 2 + dx / len * b], [x1, y1]], o);
  }
  // quadratic curve stroke with one control point
  function inkCurve(ctx, x0, y0, cx, cy, x1, y1, o) {
    inkPath(ctx, [[x0, y0], [(x0 + 2 * cx + x1) / 4, (y0 + 2 * cy + y1) / 4], [x1, y1]], o);
  }
  // irregular ink blot (filled, no outline). o: color, seed, n (points, default 11), jag 0..1 (default 0.28), drips (count, default 0)
  function inkBlot(ctx, x, y, r, o) {
    o = o || {};
    const rr = rng('blot', o.seed | 0), n = o.n || 11, jag = o.jag === undefined ? 0.28 : o.jag;
    const pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU, k = 1 + (rr() * 2 - 1) * jag; pts.push([x + Math.cos(a) * r * k, y + Math.sin(a) * r * k]); }
    ctx.beginPath(); traceShape(ctx, pts); ctx.fillStyle = o.color || pal.ink; ctx.fill();
    const drips = o.drips | 0;
    for (let i = 0; i < drips; i++) {
      const a = 0.3 + rr() * (PI - 0.6), len = r * (0.6 + rr() * 1.1), w = Math.max(1, r * (0.12 + rr() * 0.14));
      const sx = x + Math.cos(a) * r * 0.7, sy = y + Math.sin(a) * r * 0.7;
      inkPath(ctx, [[sx, sy], [sx + (rr() - 0.5) * 2, sy + len * 0.5], [sx, sy + len]], { w, color: o.color || pal.ink, taperStart: 0, taperEnd: 0.5, wobble: 0.1, pressure: 'flat', seed: i });
      ctx.beginPath(); ctx.arc(sx, sy + len, w * 0.62, 0, TAU); ctx.fillStyle = o.color || pal.ink; ctx.fill();
    }
  }
  // soft ink-bleed edge on a shape: a few translucent strokes that feather inward (default) or outward. o: w, color, alpha, inside
  function inkBleed(ctx, shape, o) {
    o = o || {};
    if (lowQ()) return;
    const w = pos(o.w, 6), col = o.color || pal.ink, a = o.alpha === undefined ? 0.5 : o.alpha, inside = o.inside !== false;
    const ga = ctx.globalAlpha;
    ctx.save();
    if (inside) { ctx.beginPath(); traceShape(ctx, shape); ctx.clip(); }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = col;
    for (let k = 0; k < 4; k++) {
      ctx.globalAlpha = ga * cA(a * (0.22 - k * 0.04));
      ctx.lineWidth = Math.max(0.5, w * (2 - k * 0.42));
      ctx.setLineDash(k % 2 ? [w * 3, w * 0.8] : [w * 5, w * 1.6, w * 1.5, w]);
      ctx.beginPath(); traceShape(ctx, shape); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // halftone (screen-tone) dots
  // ---------------------------------------------------------------------------------------------------------------
  function dotPattern(ctx, o) {
    const d = Math.max(2, num(o.d, 6)), r = Math.max(0.3, num(o.r, d * 0.27)), col = o.color || pal.ink, a = o.alpha === undefined ? 0.5 : o.alpha;
    const key = 'ht|' + d + '|' + r + '|' + col + '|' + Math.round(a * 100);
    const res = A.res > 0 ? A.res : 1;
    const pk = key + '@' + res;
    let pat = patterns.get(pk);
    if (pat) return pat;
    const spr = sprite(key, d, d, (g) => {
      g.fillStyle = rgba(col, a);
      g.beginPath(); g.arc(d * 0.25, d * 0.25, r, 0, TAU); g.arc(d * 0.75, d * 0.75, r, 0, TAU); g.fill();
      g.beginPath(); g.arc(d * 1.25, d * 0.25, r, 0, TAU); g.arc(d * 0.25, d * 1.25, r, 0, TAU); g.arc(-d * 0.25, d * 0.25, r, 0, TAU); g.arc(d * 0.25, -d * 0.25, r, 0, TAU);
      g.arc(d * 0.75, -d * 0.25, r, 0, TAU); g.arc(-d * 0.25, d * 0.75, r, 0, TAU); g.arc(d * 1.25, d * 0.75, r, 0, TAU); g.arc(d * 0.75, d * 1.25, r, 0, TAU); g.fill();
    });
    try {
      pat = ctx.createPattern(spr, 'repeat');
      if (pat && typeof pat.setTransform === 'function' && typeof DOMMatrix === 'function') pat.setTransform(new DOMMatrix([1 / res, 0, 0, 1 / res, 0, 0]));
    } catch (e) { pat = null; }
    if (pat) patterns.set(pk, pat);
    return pat;
  }
  // Fill the rectangle (x, y, w, h) with a 45 degree dot screen. Usually called inside a clip. o: d spacing (6), r dot radius,
  // color (ink), alpha (0.5), angle (extra rotation of the whole screen in radians)
  function halftone(ctx, x, y, w, h, o) {
    o = o || {};
    if (lowQ() && o.force !== true) return;
    const pat = dotPattern(ctx, o);
    ctx.save();
    const cx = x + w / 2, cy = y + h / 2, half = Math.hypot(w, h) / 2 + 2;
    ctx.translate(cx, cy);
    if (o.angle) ctx.rotate(o.angle);
    if (pat) { ctx.fillStyle = pat; ctx.fillRect(-half, -half, half * 2, half * 2); }
    else { ctx.globalAlpha = ctx.globalAlpha * 0.35; ctx.fillStyle = o.color || pal.ink; ctx.fillRect(-half, -half, half * 2, half * 2); }
    ctx.restore();
  }
  // Graduated screen-tone: dot radius grows from r0 to r1 along direction o.dir (radians) across the rect. Draws every dot, so cache it.
  function halftoneRamp(ctx, x, y, w, h, o) {
    o = o || {};
    const d = Math.max(3, num(o.d, 7)), r0 = num(o.r0, 0.2), r1 = num(o.r1, d * 0.5), dir = num(o.dir, 0);
    const c = Math.cos(dir), s = Math.sin(dir), span = Math.abs(w * c) + Math.abs(h * s) || 1;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = rgba(o.color || pal.ink, o.alpha === undefined ? 0.6 : o.alpha);
    ctx.beginPath();
    const cx = x + w / 2, cy = y + h / 2;
    for (let j = 0, gy = y - d; gy < y + h + d; gy += d / 2, j++) {
      for (let gx = x - d + (j % 2 ? d / 2 : 0); gx < x + w + d; gx += d) {
        const k = clamp(0.5 + ((gx - cx) * c + (gy - cy) * s) / span, 0, 1), r = lerp(r0, r1, k);
        if (r > 0.25) { ctx.moveTo(gx + r, gy); ctx.arc(gx, gy, r, 0, TAU); }
      }
    }
    ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // cel shading
  // ---------------------------------------------------------------------------------------------------------------
  // Fill a closed shape the house way: base colour, ONE hard shadow shape, an optional rim light, optional halftone in the
  // shadow, then a variable-width ink outline.
  //   base           fill colour (a hex string, so the shadow can be derived)
  //   o.light        angle of the direction TO the key light (default ART.tk.light, up and to the right)
  //   o.depth        shadow crescent thickness in px (default 12% of the shape's short side, 1.5..14)
  //   o.shadow       false (no shadow), or a colour string (default ART.tk.shade(base))
  //   o.shadowShape  a shape descriptor drawn as the shadow instead of the automatic crescent (clipped to the shape)
  //   o.rim          rim-light colour; o.rimW thickness (default 1.6); o.rimSide 'shadow' (default, backlight on the shadow edge),
  //                  'light', or an angle in radians giving the direction the rim faces; o.rimAlpha
  //   o.hi           lit-side highlight edge: true or 'auto' (the base lifted 30% toward white) or a colour; o.hiW thickness (2.2), o.hiAlpha (0.85)
  //   o.halftone     true or {d, r, color, alpha, angle}: dot screen clipped inside the shadow
  //   o.line         false for no outline, a number for its width (default 3.2); o.lineColor, o.align, o.seed, o.wobble, o.weightVar
  //   o.tension      Catmull-Rom smoothing 0..1 (default 1); use about 0.3 for rectangles and straight shafts so they do not bulge into lenses
  //   o.decor        fn(ctx): extra art drawn inside the shape (clipped to it) after the shading and BEFORE the outline: stripes, tips, patterns
  //   o.bbox         [x0, y0, x1, y1] when the shape is a function (needed for the shadow maths)
  function celFill(ctx, shape, base, o) {
    o = o || {};
    if (!shape) return;
    const light = o.light === undefined ? LIGHT : o.light;
    const box = shapeBox(shape) || o.bbox || [-1500, -1500, 1500, 1500];
    const bw = box[2] - box[0], bh = box[3] - box[1];
    const depth = o.depth === undefined ? clamp(Math.min(bw, bh) * 0.12, 1.5, 14) : o.depth;
    const sdx = -Math.cos(light), sdy = -Math.sin(light);
    ctx.beginPath(); traceShape(ctx, shape, 0, 0, o.tension); ctx.fillStyle = base; ctx.fill();
    const region = (dx, dy) => { ctx.beginPath(); ctx.rect(box[0] - 80, box[1] - 80, bw + 160, bh + 160); traceShape(ctx, shape, dx, dy, o.tension); ctx.clip('evenodd'); };
    if (o.shadow !== false && (o.shadowShape || depth > 0)) {
      const shCol = typeof o.shadow === 'string' ? o.shadow : shade(base, o.shadowT);
      ctx.save();
      ctx.beginPath(); traceShape(ctx, shape, 0, 0, o.tension); ctx.clip();
      if (o.shadowShape) { ctx.beginPath(); traceShape(ctx, o.shadowShape); ctx.clip(); } else region(-sdx * depth, -sdy * depth);
      ctx.fillStyle = shCol; ctx.fillRect(box[0] - 80, box[1] - 80, bw + 160, bh + 160);
      if (o.halftone && !lowQ()) { const h = o.halftone === true ? {} : o.halftone; halftone(ctx, box[0], box[1], bw, bh, { d: h.d || 5, r: h.r, color: h.color || deep(base), alpha: h.alpha === undefined ? 0.45 : h.alpha, angle: h.angle, force: true }); }
      ctx.restore();
    }
    if (o.hi && Math.min(bw, bh) > 9) {
      // third tone: a thin lit-side highlight, the base colour lifted toward white
      const hw = pos(o.hiW, 2.2), hc = o.hi === true || o.hi === 'auto' ? tint(base, 0.3) : o.hi;
      ctx.save();
      ctx.beginPath(); traceShape(ctx, shape, 0, 0, o.tension); ctx.clip();
      region(sdx * hw, sdy * hw);
      ctx.globalAlpha = ctx.globalAlpha * cA(o.hiAlpha === undefined ? 0.85 : o.hiAlpha);
      ctx.fillStyle = hc; ctx.fillRect(box[0] - 80, box[1] - 80, bw + 160, bh + 160);
      ctx.restore();
    }
    if (o.rim) {
      const rw = pos(o.rimW, 1.6);
      let rx = sdx, ry = sdy;
      if (o.rimSide === 'light') { rx = -sdx; ry = -sdy; } else if (typeof o.rimSide === 'number') { rx = Math.cos(o.rimSide); ry = Math.sin(o.rimSide); }
      ctx.save();
      ctx.beginPath(); traceShape(ctx, shape, 0, 0, o.tension); ctx.clip();
      region(-rx * rw, -ry * rw);
      if (o.rimAlpha !== undefined) ctx.globalAlpha = ctx.globalAlpha * cA(o.rimAlpha);
      ctx.fillStyle = o.rim; ctx.fillRect(box[0] - 80, box[1] - 80, bw + 160, bh + 160);
      ctx.restore();
    }
    if (o.decor) { ctx.save(); ctx.beginPath(); traceShape(ctx, shape, 0, 0, o.tension); ctx.clip(); o.decor(ctx); ctx.restore(); }
    if (o.line !== false && o.line !== 0) {
      inkPath(ctx, shape, { closed: true, w: typeof o.line === 'number' ? o.line : pos(o.lineW, 3.2), color: o.lineColor || pal.ink, align: o.align, seed: o.seed, wobble: o.wobble, weightVar: o.weightVar, light, step: o.step, tension: o.tension });
    }
  }
  const celEllipse = (ctx, cx, cy, rx, ry, base, o) => celFill(ctx, ellipsePts(cx, cy, rx, ry, clamp(Math.round(Math.max(rx, ry) / 2) + 8, 10, 24), 0), base, o);
  const celCircle = (ctx, cx, cy, r, base, o) => celEllipse(ctx, cx, cy, r, r, base, o);

  // ---------------------------------------------------------------------------------------------------------------
  // ribbons: tapered, shaded, inked strips along a spine (hair locks, tails, scarves, silk, tentacles, limbs)
  // ---------------------------------------------------------------------------------------------------------------
  // Draw a ribbon along `spine` (control points [x,y], root first). base is the fill hex.
  //   width      o.wMax (max width, default 10), o.w0 (root width, default 0.75 * wMax), o.w1 (tip width, default 0 = a point),
  //              o.profile fn(u 0..1) -> width multiplier of wMax (replaces the default lock profile), o.tipPow (default 1.4)
  //   caps       o.cap 'flat' | 'round' (both ends, round adds a half circle)
  //   motion     o.bend (radians the tip swings about the root), or o.sway {amp, freq, phase} with o.t (seconds): amp*sin(2*pi*freq*t + phase)
  //   shading    o.shadow (false or colour), o.rim, o.rimW, o.light, o.halftone (as celFill) and o.shadowW (0..1, share of the width in shadow, default 0.55)
  //   detail     o.gloss (default true: the anime highlight band, colour o.glossColor, alpha o.glossAlpha), o.strands (0..3 thin lines, default 1),
  //              o.tipColor / o.tipFrac (default 0.28) / o.tipShadow dip the last part of the ribbon in a second colour, o.decor fn(ctx) as in celFill
  //   line       o.line width or false, o.lineColor, o.seed
  function ribbon(ctx, spine, base, o) {
    o = o || {};
    if (!spine || spine.length < 2) return;
    let sp = spine;
    let bend = num(o.bend, 0);
    if (o.sway) bend += num(o.sway.amp, 0) * Math.sin(TAU * num(o.sway.freq, 0.5) * num(o.t, 0) + num(o.sway.phase, 0)) * motion();
    if (bend) sp = bendPts(spine, { ang: bend });
    const d = flatten(sp, { step: 5 });
    const m = d.length >> 1;
    if (m < 2) return;
    const L = [0];
    for (let i = 1; i < m; i++) L.push(L[i - 1] + Math.hypot(d[2 * i] - d[2 * i - 2], d[2 * i + 1] - d[2 * i - 1]));
    const total = L[m - 1];
    if (!(total > 1)) return;
    const wMax = pos(o.wMax, 10), w0 = o.w0 === undefined ? wMax * 0.75 : o.w0, w1 = o.w1 === undefined ? 0 : o.w1, tipPow = o.tipPow || 1.4;
    const widthAt = (u) => {
      if (o.profile) return wMax * num(o.profile(u), 1);
      const up = 0.28;
      if (u < up) return lerp(w0, wMax, smoothstep(u / up));
      return lerp(w1, wMax, 1 - Math.pow((u - up) / (1 - up), tipPow));
    };
    const cx = [], cy = [], nx = [], ny = [], wd = [];
    for (let i = 0; i < m; i++) {
      const a = i > 0 ? i - 1 : 0, b = i < m - 1 ? i + 1 : m - 1;
      let tx = d[2 * b] - d[2 * a], ty = d[2 * b + 1] - d[2 * a + 1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      cx.push(d[2 * i]); cy.push(d[2 * i + 1]); nx.push(-ty); ny.push(tx); wd.push(Math.max(0, widthAt(L[i] / total)));
    }
    const left = [], right = [];
    for (let i = 0; i < m; i++) { left.push([cx[i] + nx[i] * wd[i] / 2, cy[i] + ny[i] * wd[i] / 2]); right.push([cx[i] - nx[i] * wd[i] / 2, cy[i] - ny[i] * wd[i] / 2]); }
    const outline = left.slice();
    const roundTip = o.cap === 'round';
    if (roundTip) {
      const r = wd[m - 1] / 2, ang = Math.atan2(ny[m - 1], nx[m - 1]);
      for (let k = 1; k <= 3; k++) { const a = ang - (k / 4) * PI; outline.push([cx[m - 1] + Math.cos(a) * r, cy[m - 1] + Math.sin(a) * r]); }
    }
    for (let i = m - 1; i >= 0; i--) outline.push(right[i]);
    if (roundTip) {
      const r = wd[0] / 2, ang = Math.atan2(-ny[0], -nx[0]);
      for (let k = 1; k <= 3; k++) { const a = ang - (k / 4) * PI; outline.push([cx[0] + Math.cos(a) * r, cy[0] + Math.sin(a) * r]); }
    }
    const light = o.light === undefined ? LIGHT : o.light;
    const sdx = -Math.cos(light), sdy = -Math.sin(light);
    const i0 = Math.floor(m * 0.3), i1 = Math.max(i0 + 1, Math.floor(m * 0.7));
    let dotN = 0;
    for (let i = i0; i <= i1 && i < m; i++) dotN += nx[i] * sdx + ny[i] * sdy;
    const side = dotN >= 0 ? 1 : -1;                     // +1: the left edge array faces the shadow
    let shadowShape;
    if (o.shadow !== false) {
      const edge = side > 0 ? left : right, sw = clamp(o.shadowW === undefined ? 0.55 : o.shadowW, 0.1, 1);
      const poly = [];
      for (let i = 0; i < m; i++) { const k = side * wd[i] * (0.5 - sw); poly.push([cx[i] + nx[i] * k, cy[i] + ny[i] * k]); }
      for (let i = m - 1; i >= 0; i--) poly.push(edge[i]);
      shadowShape = { poly };
    }
    let decor = o.decor;
    if (o.tipColor) {
      const tf = clamp(o.tipFrac === undefined ? 0.28 : o.tipFrac, 0.05, 0.9), i0 = Math.max(1, Math.floor(m * (1 - tf))), last = m - 1;
      // ragged colour boundary: five points across the width alternating up and down the strand, like dipped hair
      const bnd = [], e0 = clamp(i0 - 2, 1, last);
      for (let k = 0; k <= 4; k++) {
        const f = 0.5 - k * 0.25, idx = clamp(i0 + (k % 2 ? 3 : -2), 1, last);
        bnd.push([cx[idx] + nx[idx] * wd[idx] * f, cy[idx] + ny[idx] * wd[idx] * f]);
      }
      const tipPoly = { poly: bnd.concat(right.slice(e0), left.slice(e0).reverse()) };
      const prev = decor;
      decor = (g) => {
        if (prev) prev(g);
        g.beginPath(); traceShape(g, tipPoly); g.fillStyle = o.tipColor; g.fill();
        if (shadowShape) { g.save(); g.beginPath(); traceShape(g, tipPoly); g.clip(); g.beginPath(); traceShape(g, shadowShape); g.fillStyle = o.tipShadow || mix(shade(o.tipColor), o.tipColor, 0.45); g.fill(); g.restore(); }
      };
    }
    celFill(ctx, { poly: outline }, base, { light, shadowShape, shadow: o.shadow === false ? false : o.shadow, rim: o.rim, rimW: o.rimW, rimSide: o.rimSide, halftone: o.halftone, line: o.line, lineColor: o.lineColor, seed: o.seed, weightVar: o.weightVar, wobble: o.wobble, step: 6, decor });
    if (o.gloss !== false && total > 14) {
      const g0 = 0.16, g1 = 0.72, poly = [];
      const gl = [], gr = [];
      for (let i = 0; i < m; i++) {
        const u = L[i] / total;
        if (u < g0 || u > g1) continue;
        const k = (u - g0) / (g1 - g0), gw = wd[i] * 0.2 * Math.sin(PI * Math.pow(k, 0.85)) + 0.2;
        const off = -side * wd[i] * 0.2;
        gl.push([cx[i] + nx[i] * (off + gw / 2), cy[i] + ny[i] * (off + gw / 2)]);
        gr.push([cx[i] + nx[i] * (off - gw / 2), cy[i] + ny[i] * (off - gw / 2)]);
      }
      if (gl.length > 2) {
        for (let i = 0; i < gl.length; i++) poly.push(gl[i]);
        for (let i = gr.length - 1; i >= 0; i--) poly.push(gr[i]);
        const ga = ctx.globalAlpha;
        ctx.globalAlpha = ga * cA(o.glossAlpha === undefined ? 0.6 : o.glossAlpha);
        ctx.beginPath(); traceShape(ctx, { poly }); ctx.fillStyle = o.glossColor || tint(base, 0.78); ctx.fill();
        ctx.globalAlpha = ga;
      }
    }
    const strands = o.strands === undefined ? 1 : o.strands | 0;
    if (strands > 0 && total > 26 && !lowQ()) {
      for (let s = 0; s < strands; s++) {
        const off = (strands === 1 ? 0.12 : (s / (strands - 1) - 0.5) * 0.55) * -side, pts = [];
        for (let i = 0; i < m; i++) {
          const u = L[i] / total;
          if (u < 0.32 || u > 0.9) continue;
          pts.push([cx[i] + nx[i] * off * wd[i], cy[i] + ny[i] * off * wd[i]]);
        }
        if (pts.length > 2) inkPath(ctx, pts, { w: 1, color: deep(base, 0.45), alpha: 0.55, taper: 0.4, wobble: 0.1, seed: s + 5 });
      }
    }
  }
  // ribbon with hair defaults: highlight band on, one strand line, sway ready. Same options as ribbon.
  function hairLock(ctx, spine, base, o) { ribbon(ctx, spine, base, Object.assign({ gloss: true, strands: 1 }, o)); }
  // the anime highlight: a white tapered band along a spine. o: w (default 4), color, alpha (default 0.6)
  function gloss(ctx, spine, o) {
    o = o || {};
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * cA(o.alpha === undefined ? 0.6 : o.alpha);
    ribbon(ctx, spine, o.color || pal.white, { wMax: pos(o.w, 4), w0: 0, w1: 0, tipPow: 1, shadow: false, line: false, gloss: false, strands: 0, profile: (u) => Math.sin(PI * u) });
    ctx.globalAlpha = ga;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // light: glow, sparkle, kirakira, speed lines
  // ---------------------------------------------------------------------------------------------------------------
  const hexOk = (c) => (typeof c === 'string' && c.charAt(0) === '#' ? c : pal.white);
  function glowSprite(color) {
    return sprite('glow|' + color, 64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, rgba(tint(color, 0.6), 1));
      gr.addColorStop(0.22, rgba(color, 0.75));
      gr.addColorStop(0.55, rgba(color, 0.22));
      gr.addColorStop(1, rgba(color, 0));
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    });
  }
  // additive radial glow, cached and scaled: ART.tk.glow(ctx, x, y, r, '#5ff5ff', 0.8). Colour must be a hex string. add=false uses normal blending.
  function glow(ctx, x, y, r, color, alpha, add) {
    if (!(r > 0.5)) return;
    const spr = glowSprite(hexOk(color));
    ctx.save();
    if (add !== false) ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = ctx.globalAlpha * cA(alpha === undefined ? 1 : alpha);
    ctx.drawImage(spr, x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }
  // four-point star with concave sides. o: color, rot, alpha, thin (waist, default 0.16), glow (halo strength 0..1, default 0.5)
  function sparkle(ctx, x, y, r, o) {
    o = o || {};
    if (!(r > 0.3)) return;
    const rot = num(o.rot, 0), k = o.thin === undefined ? 0.16 : o.thin, col = o.color || pal.white;
    ctx.save();
    if (o.alpha !== undefined) ctx.globalAlpha = ctx.globalAlpha * cA(o.alpha);
    const gl = o.glow === undefined ? 0.5 : o.glow;
    if (gl > 0 && r > 2.5) glow(ctx, x, y, r * 1.5, hexOk(col), gl * 0.6);
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a0 = rot + i * PI / 2, a1 = a0 + PI / 2, am = a0 + PI / 4;
      const px = x + Math.cos(a0) * r, py = y + Math.sin(a0) * r;
      if (i === 0) ctx.moveTo(px, py);
      ctx.quadraticCurveTo(x + Math.cos(am) * r * k, y + Math.sin(am) * r * k, x + Math.cos(a1) * r, y + Math.sin(a1) * r);
    }
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    ctx.restore();
  }
  // Inked music note glyph centred on (x, y), head width about size. o: kind ('eighth' | 'quarter' | 'beamed' | 'rest'), color (ink), alpha, rot, line (stroke width)
  function note(ctx, x, y, size, o) {
    o = o || {};
    size = pos(size, 16);
    const col = hexOk(o.color || pal.ink), lw = pos(o.line, Math.max(1.2, size * 0.14)), kind = o.kind || 'eighth';
    ctx.save();
    if (o.alpha !== undefined) ctx.globalAlpha = ctx.globalAlpha * cA(o.alpha);
    ctx.translate(x, y); ctx.rotate(num(o.rot, 0));
    const hw = size * 0.5, hh = size * 0.36, sh = size * 1.7;
    const head = (hx, hy) => { ctx.beginPath(); ctx.ellipse(hx, hy, hw, hh, -0.35, 0, TAU); ctx.fillStyle = col; ctx.fill(); };
    const stem = (hx, hy) => { const sx = hx + hw * 0.86, sy = hy - hh * 0.2; inkPath(ctx, [[sx, sy], [sx, sy - sh]], { w: lw, color: col, align: 0, wobble: 0 }); return [sx, sy - sh]; };
    if (kind === 'rest') {
      const pts = [[-hw * 0.3, -size * 0.9], [hw * 0.7, -size * 0.5], [-hw * 0.3, -size * 0.1], [hw * 0.6, size * 0.3]];
      inkPath(ctx, pts, { w: lw * 1.2, color: col, align: 0, wobble: 0 });
      ctx.beginPath(); ctx.ellipse(-hw * 0.1, size * 0.6, hw * 0.6, hh * 0.9, 0, 0, TAU); ctx.fillStyle = col; ctx.fill();
    } else if (kind === 'beamed') {
      const ax = -hw * 1.1, bx = hw * 1.5;
      head(ax, 0); head(bx, -size * 0.2);
      const t1 = stem(ax, 0), t2 = stem(bx, -size * 0.2);
      inkPath(ctx, [[t1[0], t1[1]], [t2[0], t2[1]]], { w: lw * 2.2, color: col, align: 0, wobble: 0 });
    } else {
      head(0, 0);
      const top = stem(0, 0);
      if (kind !== 'quarter') inkPath(ctx, [[top[0], top[1]], [top[0] + size * 0.55, top[1] + size * 0.5], [top[0] + size * 0.4, top[1] + size * 0.95]], { w: lw, color: col, align: 0, wobble: 0 });
    }
    ctx.restore();
  }
  // Concentric sound rings centred on (x, y), first ring at r. o: n (3), gap (0.32, share of r), color (gold), alpha, lw, broken (false: outermost ring as left and right arcs), rot
  function soundRings(ctx, x, y, r, o) {
    o = o || {};
    r = pos(r, 10);
    const n = Math.max(1, Math.min(12, Math.round(num(o.n, 3)))), gap = num(o.gap, 0.32), lw = pos(o.lw, Math.max(1, r * 0.1));
    ctx.save();
    if (o.alpha !== undefined) ctx.globalAlpha = ctx.globalAlpha * cA(o.alpha);
    ctx.strokeStyle = hexOk(o.color || pal.gold); ctx.lineWidth = lw; ctx.lineCap = 'round';
    const rot = num(o.rot, 0);
    for (let i = 0; i < n; i++) {
      const rr = r * (1 + gap * i);
      ctx.beginPath();
      if (o.broken && i === n - 1) {
        ctx.arc(x, y, rr, rot + PI * 0.65, rot + PI * 1.35); ctx.moveTo(x + Math.cos(rot - PI * 0.35) * rr, y + Math.sin(rot - PI * 0.35) * rr); ctx.arc(x, y, rr, rot - PI * 0.35, rot + PI * 0.35);
      } else ctx.arc(x, y, rr, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
  // Drifting gold-leaf flecks over the rect (x, y, w, h). t in seconds; o: n (14), seed, color (gold), size (max radius, 3.2), rise (px/s, 6)
  function kirakira(ctx, x, y, w, h, t, o) {
    o = o || {};
    const n = o.n === undefined ? 14 : o.n, sd = o.seed | 0, size = num(o.size, 3.2), rise = num(o.rise, 6) * motion(), col = o.color || pal.gold;
    const tt = num(t, 0);
    for (let i = 0; i < n; i++) {
      const v1 = vary(sd, 'kx' + i), v2 = vary(sd, 'ky' + i), v3 = vary(sd, 'kp' + i), v4 = vary(sd, 'ks' + i);
      const px = x + v1 * w + Math.sin(tt * 0.6 + v3 * TAU) * 6 * motion();
      const py = y + ((v2 * h - tt * rise * (0.5 + v4)) % h + h) % h;
      const tw = 0.5 + 0.5 * Math.sin(tt * (1.5 + v4 * 2) + v3 * TAU);
      if (tw < 0.12) continue;
      sparkle(ctx, px, py, size * (0.4 + v4 * 0.7) * (0.5 + tw * 0.6), { color: v4 > 0.6 ? pal.gold2 : col, alpha: tw, rot: v3, glow: 0.3 });
    }
  }
  // Manga speed lines. o.mode 'radial' (default: lines converge on cx, cy between radii r0 and r1) or 'dir' (parallel lines at o.angle across
  // the rect o.rect [x, y, w, h], each up to o.len long). Also: n (36), seed, color, alpha (0.7), w (max line width, 3)
  function speedLines(ctx, cx, cy, o) {
    o = o || {};
    const n = o.n === undefined ? 36 : o.n, rr = rng('speed', o.seed | 0), w = pos(o.w, 3), col = o.color || pal.white;
    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * cA(o.alpha === undefined ? 0.7 : o.alpha);
    ctx.fillStyle = col;
    ctx.beginPath();
    if (o.mode === 'dir') {
      const R = o.rect || [cx - 300, cy - 200, 600, 400], ang = num(o.angle, 0), len = pos(o.len, 220), c = Math.cos(ang), s = Math.sin(ang);
      for (let i = 0; i < n; i++) {
        const px = R[0] + rr() * R[2], py = R[1] + rr() * R[3], l = len * (0.35 + rr() * 0.65), ww = w * (0.3 + rr() * 0.7);
        ctx.moveTo(px, py); ctx.lineTo(px - c * l - s * ww / 2, py - s * l + c * ww / 2); ctx.lineTo(px - c * l + s * ww / 2, py - s * l - c * ww / 2); ctx.closePath();
      }
    } else {
      const r0 = num(o.r0, 60), r1 = pos(o.r1, 800);
      for (let i = 0; i < n; i++) {
        const a = (i + rr() * 0.8) / n * TAU, ri = r0 + rr() * (r1 - r0) * 0.35, ww = w * (0.35 + rr() * 0.9) / 2, ro = r1, ca = Math.cos(a), sa = Math.sin(a);
        ctx.moveTo(cx + ca * ri, cy + sa * ri); ctx.lineTo(cx + ca * ro - sa * ww * 2, cy + sa * ro + ca * ww * 2); ctx.lineTo(cx + ca * ro + sa * ww * 2, cy + sa * ro - ca * ww * 2); ctx.closePath();
      }
    }
    ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // small shared shapes: petal, lightning bolt, gradients, scoped state
  // ---------------------------------------------------------------------------------------------------------------
  // A soft sakura-style petal with a rose edge and a white highlight, centred at (x, y), size = half length. base is the fill (default pink).
  function petal(ctx, x, y, size, rot, alpha, base) {
    if (!(size > 0.3) || !(alpha > 0.02)) return;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(num(rot, 0)); ctx.globalAlpha = ctx.globalAlpha * cA(alpha);
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.bezierCurveTo(size * 0.9, -size * 0.7, size * 0.8, size * 0.55, 0, size * 0.85);
    ctx.bezierCurveTo(-size * 0.8, size * 0.55, -size * 0.9, -size * 0.7, 0, -size);
    ctx.fillStyle = base || '#ff9cc6'; ctx.fill();
    ctx.lineWidth = Math.max(0.8, size * 0.12); ctx.strokeStyle = '#b0245c'; ctx.globalAlpha = ctx.globalAlpha * 0.8; ctx.stroke();
    ctx.globalAlpha = ctx.globalAlpha * 0.9; ctx.beginPath(); ctx.ellipse(-size * 0.2, -size * 0.25, size * 0.22, size * 0.42, 0.3, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.restore();
  }
  // A jagged lightning bolt from (x0, y0) to (x1, y1): a soft coloured underglow stroke and a bright core. Deterministic per o.seed
  // (feed it Math.floor(t * 14) for a crackle). o: seed, w (core width, 2), jag (sideways wander in px, 8), n (segments, 6), color ('#5fd0ff'), core ('#eaffff')
  function bolt(ctx, x0, y0, x1, y1, o) {
    o = o || {};
    const n = Math.max(2, o.n | 0 || 6), w = pos(o.w, 2), jag = num(o.jag, 8), r = rng('bolt', o.seed | 0);
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, pts = [[x0, y0]];
    for (let i = 1; i < n; i++) { const u = i / n, off = (r() - 0.5) * 2 * jag * Math.sin(u * PI); pts.push([x0 + dx * u + nx * off, y0 + dy * u + ny * off]); }
    pts.push([x1, y1]);
    inkPath(ctx, { poly: pts }, { w: w * 2.8, color: rgba(o.color || '#5fd0ff', 0.4), taper: 0.2, wobble: 0, pressure: 'flat', step: 60 });
    inkPath(ctx, { poly: pts }, { w, color: o.core || '#eaffff', taper: 0.25, wobble: 0, pressure: 'flat', step: 60 });
  }
  // gradient helpers: stops = [[offset, colour], ...]
  function lin(ctx, x0, y0, x1, y1, stops) { const g = ctx.createLinearGradient(num(x0), num(y0), num(x1), num(y1)); stops.forEach((s) => g.addColorStop(clamp(s[0], 0, 1), s[1])); return g; }
  function rad(ctx, x0, y0, r0, x1, y1, r1, stops) { const g = ctx.createRadialGradient(num(x0), num(y0), Math.max(0, num(r0)), num(x1), num(y1), Math.max(0, num(r1))); stops.forEach((s) => g.addColorStop(clamp(s[0], 0, 1), s[1])); return g; }
  // withAlpha: run fn(ctx) with the global alpha multiplied by a (restored after). flipX: run fn(ctx) mirrored about the vertical line x (saved and restored)
  function withAlpha(ctx, a, fn) { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * cA(a); fn(ctx); ctx.globalAlpha = ga; }
  function flipX(ctx, x, fn) { ctx.save(); ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); fn(ctx); ctx.restore(); }


  // ---------------------------------------------------------------------------------------------------------------
  // 2D affine matrices [a, b, c, d, e, f] (the canvas order) and the sliced rigid chain
  // ---------------------------------------------------------------------------------------------------------------
  const mat = {
    I: () => [1, 0, 0, 1, 0, 0],
    mul: (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]],
    pt: (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]],
    inv: (m) => {
      const d = m[0] * m[3] - m[1] * m[2] || 1e-9;
      return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d];
    },
    // rotate by rot and scale (sx, sy) about the pivot (px, py), then translate by (dx, dy)
    local: (px, py, dx, dy, rot, sx, sy) => {
      const c = Math.cos(rot || 0), s = Math.sin(rot || 0), a = c * (sx === undefined ? 1 : sx), b = s * (sx === undefined ? 1 : sx), cc = -s * (sy === undefined ? 1 : sy), d = c * (sy === undefined ? 1 : sy);
      return [a, b, cc, d, px + (dx || 0) - (a * px + cc * py), py + (dy || 0) - (b * px + d * py)];
    },
  };
  // A chain is a piece of art (a lock of hair, a tail, a sash, a strand of silk) that bends. The art is drawn ONCE at rest by o.draw and cut
  // into rigid slabs at fractions of a spine; each slab is a cached sprite. Drawing rotates the slabs about their joints, so the whole thing
  // bends like a real ribbon at the price of one drawImage per slab, and the shading and outline never seam because they were drawn together.
  //   ART.tk.chain(key, o) -> chain
  //   o.spine    [[x, y], ...] the spine of the artwork at rest (root first), only used to place the joints and the cuts
  //   o.cuts     fractions of the spine length where it splits, default [0.34, 0.68] (so 3 slabs)
  //   o.reach    half width of a slab in px, must cover the artwork (default 40)      o.overlap  px each slab runs into the next (default 4)
  //   o.draw     fn(ctx) painting the WHOLE artwork at rest in the spine's coordinates
  //   chain.draw(ctx, bends, q)   bends[0] rotates the whole chain about its root, bends[j] the j-th joint (radians, each relative to the
  //                               slab before it); q (default 1) is the raster scale: use ceil(2 * zoom) / 2 so big draws stay sharp
  //   chain.warm(q)               bake every slab now (returns the slab count)
  //   chain.segs, chain.joints    for tests and debugging
  function chain(key, o) {
    const spine = o.spine, cuts = o.cuts || [0.34, 0.68], reach = pos(o.reach, 40), overlap = o.overlap === undefined ? 4 : o.overlap;
    const d = flatten(spine, { step: 3 });
    const m = d.length >> 1, L = [0];
    for (let i = 1; i < m; i++) L.push(L[i - 1] + Math.hypot(d[2 * i] - d[2 * i - 2], d[2 * i + 1] - d[2 * i - 1]));
    const total = L[m - 1] || 1;
    const at = (u) => {
      const s = clamp(u, 0, 1) * total;
      let i = 1;
      while (i < m - 1 && L[i] < s) i++;
      const i0 = i - 1, sp = L[i] - L[i0] || 1, f = clamp((s - L[i0]) / sp, 0, 1);
      let tx = d[2 * i] - d[2 * i0], ty = d[2 * i + 1] - d[2 * i0 + 1];
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      return { x: lerp(d[2 * i0], d[2 * i], f), y: lerp(d[2 * i0 + 1], d[2 * i + 1], f), tx, ty };
    };
    const start = at(0), end = at(1), joints = cuts.map(at);
    const ext = (p, s) => ({ x: p.x + p.tx * s, y: p.y + p.ty * s, tx: p.tx, ty: p.ty });
    const bounds = [ext(start, -reach)].concat(joints, [ext(end, reach)]);
    const segs = [];
    for (let j = 0; j < bounds.length - 1; j++) {
      const a = bounds[j], b0 = bounds[j + 1], b = j < bounds.length - 2 ? ext(b0, overlap) : b0;
      const qa0 = [a.x + a.ty * reach, a.y - a.tx * reach], qa1 = [a.x - a.ty * reach, a.y + a.tx * reach];
      const qb0 = [b.x + b.ty * reach, b.y - b.tx * reach], qb1 = [b.x - b.ty * reach, b.y + b.tx * reach];
      const poly = [qa0, qb0, qb1, qa1];
      const bx = bbox(poly);
      segs.push({ poly, box: [Math.floor(bx[0]), Math.floor(bx[1]), Math.ceil(bx[2]), Math.ceil(bx[3])], pivot: j === 0 ? [start.x, start.y] : [bounds[j].x, bounds[j].y] });
    }
    const spr = (j, q) => {
      const sg = segs[j], bw = sg.box[2] - sg.box[0], bh = sg.box[3] - sg.box[1];
      return sprite(key + '|c' + j + '|q' + q, bw * q, bh * q, (g) => {
        g.scale(q, q); g.translate(-sg.box[0], -sg.box[1]);
        g.save(); g.beginPath(); traceShape(g, { poly: sg.poly }); g.clip();
        o.draw(g);
        g.restore();
      });
    };
    return {
      segs, joints, total,
      warm(q) { for (let j = 0; j < segs.length; j++) spr(j, q || 1); return segs.length; },
      draw(ctx, bends, q) {
        q = q || 1;
        const mats = [];
        let M = mat.I();
        for (let j = 0; j < segs.length; j++) {
          const b = bends && bends[j] ? bends[j] : 0;
          if (b) M = mat.mul(M, mat.local(segs[j].pivot[0], segs[j].pivot[1], 0, 0, b, 1, 1));
          mats.push(M);
        }
        for (let j = segs.length - 1; j >= 0; j--) {
          const sg = segs[j], mm = mats[j];
          ctx.save();
          ctx.transform(mm[0], mm[1], mm[2], mm[3], mm[4], mm[5]);
          ctx.drawImage(spr(j, q), sg.box[0], sg.box[1], sg.box[2] - sg.box[0], sg.box[3] - sg.box[1]);
          ctx.restore();
        }
      },
    };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // faces: the anime eye, brows, mouths, blush
  // ---------------------------------------------------------------------------------------------------------------
  // expression presets for the eye: arc (a drawn curve instead of an eye), tilt (inner corner lowered, radians-ish, 0..1),
  // drop (share of the eye height the flat upper lid covers), lash (line weight multiplier)
  const EYE_PRESETS = {
    neutral: {},
    smile: {},
    happy: { arc: 'happy' },
    closed: { arc: 'closed' },
    angry: { tilt: 0.6, drop: 0.2, lash: 1.25 },
    determined: { tilt: 0.3, drop: 0.14, lash: 1.15 },
    hurt: { arc: 'hurt' },
    sad: { tilt: -0.5, drop: 0.1 },
    wide: { wide: 1.14 },
    half: { drop: 0.4 },
    sleepy: { drop: 0.5, tilt: -0.12 },
    smirk: { tilt: 0.22, drop: 0.3 },
  };
  // Draw one anime eye centred at (cx, cy), w wide, h tall (h > w gives the big vertical anime eye).
  //   o.expr    neutral | happy | closed | angry | determined | hurt | sad | wide | half | sleepy | smirk   (presets, see EYE_PRESETS)
  //   o.side    +1 (default) the outer corner and the wing flick point to +x, -1 mirrored
  //   o.open    0..1, animate for blinking (0 = closed)             o.look [dx, dy] -1..1 iris offset
  //   o.iris    [topColour, bottomColour] gradient, default violet  o.pupil, o.ring, o.sclera, o.ink colours
  //   o.tilt, o.drop, o.lash, o.wing (0..1 flick length, default 0.55), o.lineW (px)   override the preset numbers
  //   o.catch   catchlight strength 0..1 (default 1), o.catchSide +1/-1 which side the big catchlight sits in world space (default +1)
  //   o.star    the tiny star catchlight (default true)            o.glow 0..1 emissive glow behind and inside the iris
  //   o.lashes  little lash flicks at the outer corner (default true when w >= 14)
  function eye(ctx, cx, cy, w, h, o) {
    o = o || {};
    w = pos(w, 10); h = pos(h, 12);
    const pr = EYE_PRESETS[o.expr] || EYE_PRESETS.neutral;
    const side = o.side === -1 ? -1 : 1;
    const open = clamp(o.open === undefined ? 1 : num(o.open, 1), 0, 1);
    const arc = o.arc !== undefined ? o.arc : pr.arc;
    const tilt = o.tilt !== undefined ? o.tilt : (pr.tilt || 0);
    const drop = o.drop !== undefined ? o.drop : (pr.drop || 0);
    const lashK = num(o.lash, pr.lash || 1);
    const ink = o.ink || pal.ink;
    const lw = pos(o.lineW, Math.max(1.1, w * 0.085));
    const wing = o.wing === undefined ? 0.55 : o.wing;
    const iris = o.iris || ['#3a2a8a', '#9d8cff'];
    const a = w / 2 * (pr.wide || 1), b = h / 2 * (pr.wide || 1);
    ctx.save();
    ctx.translate(cx, cy);
    if (side < 0) ctx.scale(-1, 1);
    const glowK = clamp(num(o.glow, 0), 0, 1);
    const isArc = arc === 'happy' || arc === 'closed' || arc === 'hurt' || open < 0.09;
    if (glowK > 0.01 && !isArc) glow(ctx, 0, 0, w * 0.95, hexOk(iris[1]), glowK * 0.7);
    if (isArc) {
      const kind = arc || 'closed';
      if (kind === 'happy') {
        inkPath(ctx, [[-a, b * 0.3], [-a * 0.55, -b * 0.28], [a * 0.05, -b * 0.5], [a * 0.62, -b * 0.3], [a * 1.02, b * 0.18], [a * 1.08 + wing * w * 0.12, b * 0.02]], { w: lw * 2.6 * lashK, color: ink, taperStart: 0.3, taperEnd: 0.2, pressure: (u) => 0.5 + 0.7 * u, wobble: 0.06, seed: 3 });
        inkPath(ctx, [[-a * 0.55, b * 0.38], [0, b * 0.3], [a * 0.5, b * 0.34]], { w: lw * 0.7, color: ink, alpha: 0.55, taper: 0.4 });
      } else if (kind === 'hurt') {
        inkPath(ctx, [[a * 0.95, -b * 0.75], [-a * 0.1, -b * 0.3], [-a * 0.65, 0.0]], { w: lw * 2.3, color: ink, taperStart: 0.05, taperEnd: 0.25, pressure: 'flat', wobble: 0.05 });
        inkPath(ctx, [[-a * 0.65, 0.0], [-a * 0.1, b * 0.3], [a * 0.95, b * 0.75]], { w: lw * 2.3, color: ink, taperStart: 0.25, taperEnd: 0.05, pressure: 'flat', wobble: 0.05 });
      } else {
        inkPath(ctx, [[-a, -b * 0.05], [-a * 0.5, b * 0.28], [a * 0.1, b * 0.4], [a * 0.68, b * 0.24], [a * 1.02, -b * 0.08], [a * 1.1 + wing * w * 0.1, -b * 0.28]], { w: lw * 2.5 * lashK, color: ink, taperStart: 0.28, taperEnd: 0.22, pressure: (u) => 0.55 + 0.6 * u, wobble: 0.06, seed: 4 });
        if (w >= 14) { inkPath(ctx, [[a * 0.7, b * 0.26], [a * 0.98, b * 0.5]], { w: lw * 0.9, color: ink, taper: 0.5 }); inkPath(ctx, [[a * 0.35, b * 0.38], [a * 0.5, b * 0.66]], { w: lw * 0.8, color: ink, taper: 0.5 }); }
      }
      ctx.restore();
      return;
    }
    // ----- the open eye: lid outline in local space, outer corner at +x
    const yb = (x) => 0.1 * b + 0.88 * b * (1 - (x / a) * (x / a));            // bottom lid height at x
    const topPts = [[-a * 0.62, -b * 0.8], [-a * 0.12, -b * 1.0], [a * 0.5, -b * 0.92]];
    const cutY = -b + 2 * b * drop;
    const top = topPts.map((p) => {
      let y = p[1];
      y = Math.max(y, cutY);
      y += tilt * b * 0.5 * (-p[0] / a);
      y = lerp(yb(p[0]), y, open);
      return [p[0], Math.min(y, yb(p[0]) - 0.04 * b)];
    });
    const I = [-a, b * 0.12, 1], O = [a * 1.02, -b * 0.05 + tilt * b * -0.1, 1];
    const shape = [I, top[0], top[1], top[2], O, [a * 0.58, b * 0.68], [0, b * 0.98], [-a * 0.6, b * 0.8]];
    ctx.save();
    ctx.beginPath(); traceShape(ctx, shape); ctx.clip();
    ctx.fillStyle = o.sclera || pal.white; ctx.fillRect(-a * 1.3, -b * 1.3, a * 2.6, b * 2.6);
    const look = o.look || [0, 0];
    const irx = a * 0.84, iry = b * 1.04, icx = num(look[0]) * a * 0.3, icy = b * 0.04 + num(look[1]) * b * 0.22;
    const gr = ctx.createLinearGradient(0, icy - iry, 0, icy + iry);
    gr.addColorStop(0, iris[0]); gr.addColorStop(0.5, mix(iris[0], iris[1], 0.5)); gr.addColorStop(1, glowK > 0.2 ? tint(iris[1], 0.35) : iris[1]);
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.ellipse(icx, icy, irx, iry, 0, 0, TAU); ctx.fill();
    ctx.lineWidth = Math.max(0.6, w * 0.05); ctx.strokeStyle = o.ring || deep(iris[0], 0.35); ctx.stroke();
    ctx.fillStyle = o.pupil || deep(iris[0], 0.72);
    ctx.beginPath(); ctx.ellipse(icx, icy - iry * 0.02, irx * 0.4, iry * 0.5, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = ctx.globalAlpha * 0.5; ctx.fillStyle = tint(iris[1], 0.5);
    ctx.beginPath(); ctx.ellipse(icx, icy + iry * 0.52, irx * 0.72, iry * 0.34, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = ctx.globalAlpha * 2;
    // hard lid shadow across the top
    ctx.save();
    ctx.beginPath(); ctx.rect(-a * 1.4, -b * 1.4, a * 2.8, b * 2.8); traceShape(ctx, shape, 0, 0.3 * h * Math.max(0.35, open)); ctx.clip('evenodd');
    ctx.fillStyle = rgba(pal.indigo, 0.34); ctx.fillRect(-a * 1.4, -b * 1.4, a * 2.8, b * 2.8);
    ctx.restore();
    const ck = clamp(o.catch === undefined ? 1 : num(o.catch, 1), 0, 1);
    if (ck > 0.02) {
      const cs = (o.catchSide === -1 ? -1 : 1) * side;
      ctx.globalAlpha = ctx.globalAlpha * ck; ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(icx + cs * irx * 0.4, icy - iry * 0.36, irx * 0.26, iry * 0.24, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(icx - cs * irx * 0.4, icy + iry * 0.5, Math.max(0.5, irx * 0.11), 0, TAU); ctx.fill();
      if (o.star !== false && w >= 16) sparkle(ctx, icx - cs * irx * 0.12, icy + iry * 0.28, irx * 0.2, { color: '#ffffff', glow: 0, thin: 0.2 });
      ctx.globalAlpha = ctx.globalAlpha / ck;
    }
    ctx.restore();
    // ink: heavy upper lid with the wing flick, a lighter second lid, lower lash, tiny inner tick
    const wx = O[0] + wing * w * 0.34, wy = O[1] - wing * h * 0.26 + tilt * b * -0.05;
    inkPath(ctx, [[I[0] + a * 0.05, I[1] - b * 0.05], top[0], top[1], top[2], [O[0], O[1]], [wx, wy]], { w: lw * 2.4 * lashK, color: ink, taperStart: 0.22, taperEnd: 0.16, pressure: (u) => 0.4 + 0.75 * Math.pow(u, 0.7), wobble: 0.05, seed: 7 });
    if (w >= 12) inkPath(ctx, [[top[1][0] - a * 0.1, top[1][1] - b * 0.09], [top[2][0], top[2][1] - b * 0.1], [O[0] + a * 0.02, O[1] - b * 0.12], [wx - w * 0.06, wy - h * 0.06]], { w: lw * 0.85, color: ink, alpha: 0.85, taper: 0.4, wobble: 0.05, seed: 9 });
    if (o.lashes !== false && w >= 14) {
      inkPath(ctx, [[top[2][0] + a * 0.15, top[2][1] - b * 0.02], [top[2][0] + a * 0.3, top[2][1] - b * 0.28]], { w: lw * 0.9, color: ink, taper: 0.6 });
      inkPath(ctx, [[O[0] - a * 0.08, O[1]], [O[0] + a * 0.16, O[1] - b * 0.36]], { w: lw * 0.9, color: ink, taper: 0.6 });
    }
    inkPath(ctx, [[a * 0.62, b * 0.7], [a * 0.3, b * 0.92], [-a * 0.15, b * 1.0]], { w: lw * 0.75, color: ink, alpha: 0.8, taper: 0.45, wobble: 0.05 });
    inkPath(ctx, [[-a * 1.0, b * 0.02], [-a * 1.12, b * 0.2]], { w: lw * 0.7, color: ink, alpha: 0.65, taper: 0.5 });
    ctx.restore();
  }
  // Eyebrow: a tapered brush tick, thicker at the inner end. o: side (+1 outer end at +x), tilt (0..1 inner end lowered: angry), arch (0..1),
  // thick (px, default 2.6), color, seed
  function brow(ctx, x, y, w, o) {
    o = o || {};
    const side = o.side === -1 ? -1 : 1, tilt = num(o.tilt, 0), arch = num(o.arch, 0.35), th = pos(o.thick, Math.max(1.4, w * 0.13));
    const ang = -tilt * 0.6, c = Math.cos(ang), s = Math.sin(ang);
    const raw = [[-w / 2, 0], [-w * 0.12, -arch * w * 0.14], [w * 0.28, -arch * w * 0.12], [w / 2, w * 0.05]];
    const pts = raw.map((p) => [x + side * (p[0] * c - p[1] * s), y + (p[0] * s + p[1] * c)]);
    inkPath(ctx, pts, { w: th, color: o.color || pal.ink, pressure: (u) => 1 - 0.55 * u, taperStart: 0.1, taperEnd: 0.5, wobble: 0.08, seed: o.seed | 0, alpha: o.alpha });
  }
  // Mouth of width w centred at (x, y). kind: smile | smirk | flat | frown | open | grin | shout | grit | cat | tiny. o: lineW, color, inner, tongue
  function mouth(ctx, x, y, w, kind, o) {
    o = o || {};
    w = pos(w, 10);
    const lw = pos(o.lineW, Math.max(1.1, w * 0.1)), ink = o.color || pal.ink, inner = o.inner || '#7a1638', tongue = o.tongue || '#ff7fa0';
    const line = (pts, wid, k) => inkPath(ctx, pts, { w: wid || lw * 1.4, color: ink, taper: 0.38, wobble: 0.06, seed: k || 1 });
    const fillOpen = (shape, bx, by, bw, bh) => {
      ctx.save();
      ctx.beginPath(); traceShape(ctx, shape); ctx.fillStyle = inner; ctx.fill(); ctx.clip();
      ctx.beginPath(); ctx.ellipse(bx, by + bh * 0.36, bw * 0.36, bh * 0.3, 0, 0, TAU); ctx.fillStyle = tongue; ctx.fill();
      ctx.restore();
    };
    if (kind === 'smile') {
      line([[x - w / 2, y - w * 0.02], [x - w * 0.22, y + w * 0.14], [x + w * 0.2, y + w * 0.14], [x + w / 2, y - w * 0.08]]);
      line([[x + w * 0.5, y - w * 0.06], [x + w * 0.58, y - w * 0.16]], lw * 0.9, 2);
    } else if (kind === 'smirk') {
      line([[x - w / 2, y + w * 0.06], [x - w * 0.1, y + w * 0.14], [x + w * 0.3, y + w * 0.05], [x + w / 2, y - w * 0.16]]);
      line([[x + w * 0.5, y - w * 0.14], [x + w * 0.6, y - w * 0.25]], lw * 0.9, 2);
    } else if (kind === 'flat') line([[x - w / 2, y], [x, y + w * 0.05], [x + w / 2, y - w * 0.02]]);
    else if (kind === 'frown') line([[x - w / 2, y + w * 0.1], [x - w * 0.2, y - w * 0.04], [x + w * 0.2, y - w * 0.04], [x + w / 2, y + w * 0.1]]);
    else if (kind === 'cat') {
      line([[x - w / 2, y - w * 0.04], [x - w * 0.24, y + w * 0.14], [x, y - w * 0.02]], lw * 1.3);
      line([[x, y - w * 0.02], [x + w * 0.24, y + w * 0.14], [x + w / 2, y - w * 0.06]], lw * 1.3, 2);
    } else if (kind === 'tiny') {
      ctx.beginPath(); ctx.ellipse(x, y + w * 0.04, w * 0.14, w * 0.11, 0, 0, TAU); ctx.fillStyle = inner; ctx.fill();
      inkPath(ctx, ellipsePts(x, y + w * 0.04, w * 0.14, w * 0.11, 8), { closed: true, w: lw, color: ink, align: 0 });
    } else if (kind === 'open') {
      const sh = ellipsePts(x, y + w * 0.12, w * 0.24, w * 0.3, 10);
      fillOpen(sh, x, y + w * 0.12, w * 0.5, w * 0.6);
      inkPath(ctx, sh, { closed: true, w: lw * 1.4, color: ink, align: 0 });
    } else if (kind === 'grit') {
      const sh = [[x - w * 0.5, y - w * 0.02], [x + w * 0.5, y - w * 0.02], [x + w * 0.44, y + w * 0.3], [x, y + w * 0.36], [x - w * 0.44, y + w * 0.3]];
      ctx.beginPath(); traceShape(ctx, sh, 0, 0, 0.6); ctx.fillStyle = '#fff8f0'; ctx.fill();
      ctx.save(); ctx.beginPath(); traceShape(ctx, sh, 0, 0, 0.6); ctx.clip();
      for (let i = 1; i < 5; i++) inkPath(ctx, [[x - w * 0.5 + w * i * 0.2, y - w * 0.04], [x - w * 0.5 + w * i * 0.2, y + w * 0.38]], { w: lw * 0.7, color: ink, taper: 0, pressure: 'flat', wobble: 0 });
      inkPath(ctx, [[x - w * 0.5, y + w * 0.16], [x + w * 0.5, y + w * 0.16]], { w: lw * 0.8, color: ink, taper: 0, pressure: 'flat', wobble: 0 });
      ctx.restore();
      inkPath(ctx, sh, { closed: true, w: lw * 1.5, color: ink, align: 0, tension: 0.6 });
    } else {                                                                     // grin | shout
      const big = kind === 'shout';
      const sh = [[x - w * 0.5, y - w * 0.06], [x - w * 0.2, y - w * 0.13], [x + w * 0.22, y - w * 0.13], [x + w * 0.5, y - w * 0.08], [x + w * 0.36, y + w * (big ? 0.5 : 0.34)], [x, y + w * (big ? 0.62 : 0.46)], [x - w * 0.36, y + w * (big ? 0.5 : 0.34)]];
      fillOpen(sh, x, y + w * 0.1, w, w * (big ? 0.7 : 0.5));
      ctx.save(); ctx.beginPath(); traceShape(ctx, sh); ctx.clip();
      ctx.fillStyle = '#fff8f0'; ctx.beginPath(); ctx.rect(x - w * 0.6, y - w * 0.2, w * 1.2, w * (big ? 0.24 : 0.18)); ctx.fill();
      ctx.restore();
      inkPath(ctx, sh, { closed: true, w: lw * 1.5, color: ink, align: 0 });
    }
  }
  // Blush: a soft rose patch with three hatch marks. o: color (default #ff7aa6), alpha (0.4), hatch (default true)
  function blush(ctx, x, y, w, o) {
    o = o || {};
    const col = o.color || '#ff7aa6', h = w * 0.55;
    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * cA(o.alpha === undefined ? 0.4 : o.alpha);
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, w / 2, h / 2, 0, 0, TAU); ctx.fill();
    ctx.restore();
    if (o.hatch !== false && w >= 9) for (let i = 0; i < 3; i++) inkPath(ctx, [[x - w * 0.3 + i * w * 0.24, y + h * 0.28], [x - w * 0.16 + i * w * 0.24, y - h * 0.28]], { w: Math.max(0.8, w * 0.055), color: deep(col, 0.2), alpha: 0.7, taper: 0.5, wobble: 0 });
  }
  // tiny nose mark; s is the face size hint (px)
  function nose(ctx, x, y, s, o) {
    o = o || {};
    inkPath(ctx, [[x - s * 0.02, y - s * 0.03], [x + s * 0.03, y + s * 0.03], [x + s * 0.09, y + s * 0.04]], { w: Math.max(0.9, s * 0.032), color: o.color || deep(o.skin || '#e8b090', 0.4), alpha: 0.8, taper: 0.45, wobble: 0 });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // atmosphere: paper grain, vignette, sky, mist, stars, moon
  // ---------------------------------------------------------------------------------------------------------------
  function grainPattern(ctx) {
    const res = A.res > 0 ? A.res : 1;
    const pk = 'grain@' + res;
    let pat = patterns.get(pk);
    if (pat) return pat;
    const S = 192;
    const spr = sprite('paper|grain', S, S, (g) => {
      const r = rng('paper', 'grain');
      for (let i = 0; i < 900; i++) {
        const x = r() * S, y = r() * S, dark = r() < 0.55, s = 0.4 + r() * 1.1;
        g.fillStyle = dark ? rgba('#3a2a1a', 0.05 + r() * 0.16) : rgba('#ffffff', 0.05 + r() * 0.18);
        g.fillRect(x, y, s, s);
      }
      g.lineCap = 'round';
      for (let i = 0; i < 90; i++) {
        const x = r() * S, y = r() * S, a = r() * TAU, l = 3 + r() * 9, dark = r() < 0.5;
        g.strokeStyle = dark ? rgba('#4a3220', 0.09 + r() * 0.08) : rgba('#ffffff', 0.12 + r() * 0.1);
        g.lineWidth = 0.4 + r() * 0.5;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (r() - 0.5) * 3, y + Math.sin(a) * l * 0.5 + (r() - 0.5) * 3, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
      for (let i = 0; i < 8; i++) {
        const x = r() * S, y = r() * S;
        g.fillStyle = rgba('#8a6a3a', 0.025); g.beginPath(); g.arc(x, y, 8 + r() * 14, 0, TAU); g.fill();
      }
    });
    try {
      pat = ctx.createPattern(spr, 'repeat');
      if (pat && typeof pat.setTransform === 'function' && typeof DOMMatrix === 'function') pat.setTransform(new DOMMatrix([1 / res, 0, 0, 1 / res, 0, 0]));
    } catch (e) { pat = null; }
    if (pat) patterns.set(pk, pat);
    return pat;
  }
  // washi paper grain over the rect. o: alpha (0.5), blend ('source-over' default, 'multiply' on light paper). One cached tile, one fill.
  function paperGrain(ctx, x, y, w, h, o) {
    o = o || {};
    if (lowQ() && o.force !== true) return;
    const pat = grainPattern(ctx);
    if (!pat) return;
    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * cA(o.alpha === undefined ? 0.5 : o.alpha);
    if (o.blend) ctx.globalCompositeOperation = o.blend;
    ctx.fillStyle = pat; ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
  // Hard or soft vignette over w x h. o: color (night), alpha (0.6), hard (a thick inset frame instead of a gradient), inner (0..1 clear centre size)
  function vignette(ctx, w, h, o) {
    o = o || {};
    const col = o.color || pal.night, a = o.alpha === undefined ? 0.6 : o.alpha, r = Math.hypot(w, h) / 2;
    ctx.save();
    if (o.hard) {
      ctx.globalAlpha = ctx.globalAlpha * cA(a); ctx.fillStyle = col;
      const t = Math.min(w, h) * 0.045;
      ctx.fillRect(0, 0, w, t); ctx.fillRect(0, h - t, w, t); ctx.fillRect(0, t, t, h - 2 * t); ctx.fillRect(w - t, t, t, h - 2 * t);
    } else {
      const g = ctx.createRadialGradient(w / 2, h / 2, r * clamp(o.inner === undefined ? 0.45 : o.inner, 0, 0.95), w / 2, h / 2, r);
      g.addColorStop(0, rgba(col, 0)); g.addColorStop(1, rgba(col, a));
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }
  const SKIES = {
    dusk: [[0, '#ffc98a'], [0.3, '#ff8f7a'], [0.62, '#8a4fa0'], [1, '#2a1c55']],
    golden: [[0, '#ffe7a8'], [0.4, '#ffb36b'], [0.8, '#c97a72'], [1, '#6a3f7a']],
    night: [[0, '#0d0b1e'], [0.6, '#1a1340'], [1, '#3b2a7a']],
    dawn: [[0, '#ffd9c2'], [0.4, '#ffb0c8'], [0.75, '#a58bd8'], [1, '#4a3a8c']],
    storm: [[0, '#1a0a24'], [0.5, '#4a1238'], [1, '#b0245c']],
    crimson: [[0, '#2a0a20'], [0.55, '#8a1a3a'], [1, '#ff6a4a']],
    paper: [[0, '#f8efd6'], [1, '#e6d3a3']],
    moon: [[0, '#0b0a20'], [0.7, '#1e1a4c'], [1, '#4a4a9c']],
  };
  // Vertical sky gradient over the rect. preset: a key of ART.tk.skies (dusk golden night dawn storm crimson paper moon) or [[offset, hex], ...].
  // o.key caches the result as a sprite (recommended for full-screen static skies).
  function sky(ctx, x, y, w, h, preset, o) {
    o = o || {};
    const stops = Array.isArray(preset) ? preset : (SKIES[preset] || SKIES.night);
    const paint = (g, gx, gy, gw, gh) => {
      const gr = g.createLinearGradient(0, gy, 0, gy + gh);
      stops.forEach((s) => gr.addColorStop(clamp(s[0], 0, 1), s[1]));
      g.fillStyle = gr; g.fillRect(gx, gy, gw, gh);
    };
    if (o.key) { blit(ctx, sprite('sky|' + o.key + '|' + w + 'x' + h, w, h, (g, sw, sh) => paint(g, 0, 0, sw, sh)), x, y, w, h); return; }
    paint(ctx, x, y, w, h);
  }
  // Drifting fog bands over the rect at time t. o: n (5), seed, color (paper), alpha (0.12), speed (px/s, 10)
  function mist(ctx, x, y, w, h, t, o) {
    o = o || {};
    const n = o.n === undefined ? 5 : o.n, sd = o.seed | 0, col = hexOk(o.color || pal.paper), a = o.alpha === undefined ? 0.12 : o.alpha, sp = num(o.speed, 10) * motion();
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    for (let i = 0; i < n; i++) {
      const v = vary(sd, 'm' + i), v2 = vary(sd, 'my' + i), rw = w * (0.35 + v * 0.35), rh = h * (0.12 + v2 * 0.14);
      const px = x + ((v * (w + rw) + num(t, 0) * sp * (0.5 + v2)) % (w + rw * 2)) - rw, py = y + h * (0.25 + 0.7 * v2);
      glow(ctx, px, py, rw * 0.5, col, a * (0.6 + 0.4 * v), false);
      ctx.save(); ctx.translate(px, py); ctx.scale(1, rh / (rw * 0.5)); glow(ctx, 0, 0, rw * 0.5, col, a, false); ctx.restore();
    }
    ctx.restore();
  }
  // Twinkling starfield over the rect. o: n (60), seed, color (white)
  function stars(ctx, x, y, w, h, t, o) {
    o = o || {};
    const n = o.n === undefined ? 60 : o.n, sd = o.seed | 0, col = o.color || pal.white;
    const ga = ctx.globalAlpha;
    ctx.save();
    for (let i = 0; i < n; i++) {
      const px = x + vary(sd, 'sx' + i) * w, py = y + vary(sd, 'sy' + i) * h * 0.8, s = 0.5 + vary(sd, 'ss' + i) * 1.3;
      const tw = 0.55 + 0.45 * Math.sin(num(t, 0) * (0.8 + vary(sd, 'st' + i) * 2) + vary(sd, 'sp' + i) * TAU);
      ctx.globalAlpha = ga * cA(tw * (0.35 + 0.5 * vary(sd, 'sa' + i)));
      if (s > 1.5) sparkle(ctx, px, py, s * 2.4, { color: col, glow: 0, rot: 0.2 }); else { ctx.fillStyle = col; ctx.fillRect(px - s / 2, py - s / 2, s, s); }
    }
    ctx.restore();
  }
  // Moon disc with halo. o: glow (halo strength, 0.7), phase (0 full .. 1 new-ish crescent), color, seed
  function moon(ctx, x, y, r, o) {
    o = o || {};
    const col = o.color || '#fff4d6', ph = clamp(num(o.phase, 0), 0, 1);
    glow(ctx, x, y, r * 3.2, '#ffe9a8', o.glow === undefined ? 0.7 : o.glow);
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
    ctx.fillStyle = col; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    const rr = rng('moon', o.seed | 0);
    ctx.fillStyle = rgba('#c8b890', 0.28);
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(x + (rr() - 0.5) * r * 1.3, y + (rr() - 0.5) * r * 1.3, r * (0.08 + rr() * 0.16), 0, TAU); ctx.fill(); }
    if (ph > 0.01) { ctx.fillStyle = rgba(pal.indigo, 0.92); ctx.beginPath(); ctx.arc(x + r * 2 * ph * 0.9, y - r * 0.1 * ph, r * 1.02, 0, TAU); ctx.fill(); }
    ctx.restore();
    inkPath(ctx, ellipsePts(x, y, r, r, 20), { closed: true, w: Math.max(1.2, r * 0.05), color: pal.ink, align: 0.5, wobble: 0.08, weightVar: 0.3 });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // lettering
  // ---------------------------------------------------------------------------------------------------------------
  const font = {
    num: '"Trebuchet MS","Segoe UI",Arial,"Liberation Sans",system-ui,sans-serif',
    display: '"Arial Rounded MT Bold","Nunito","Quicksand","Varela Round","Trebuchet MS",Arial,"Liberation Sans",system-ui,sans-serif',   // the css --font-display stack (HV_ART_AUDIO 9)
    ui: '"Segoe UI","Helvetica Neue",Arial,"Liberation Sans",system-ui,sans-serif',                                                          // the css --font-ui stack
  };
  // Heavy comic lettering: fill, thick ink outline, optional block shadow. o: fill (white), stroke (ink), strokeW (size * 0.16),
  // family (font.num), weight (900), skew (-0.18, negative leans right), align ('center'), rot (radians), shadow (colour), shadowOff (size * 0.08),
  // grad [topHex, bottomHex] for a vertical gradient fill.
  function inkText(ctx, text, x, y, size, o) {
    o = o || {};
    size = pos(size, 16);
    ctx.save();
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    const sk = o.skew === undefined ? -0.18 : o.skew;
    ctx.transform(1, 0, sk, 1, 0, 0);
    ctx.font = (o.weight || 900) + ' ' + size + 'px ' + (o.family || font.num);
    ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.miterLimit = 2;
    const sw = pos(o.strokeW, size * 0.16);
    const str = String(text);
    if (o.shadow) { const off = num(o.shadowOff, size * 0.08); ctx.fillStyle = o.shadow; ctx.strokeStyle = o.shadow; ctx.lineWidth = sw; ctx.strokeText(str, off, off); ctx.fillText(str, off, off); }
    ctx.strokeStyle = o.stroke || pal.ink; ctx.lineWidth = sw; ctx.strokeText(str, 0, 0);
    if (o.grad) { const g = ctx.createLinearGradient(0, -size * 0.5, 0, size * 0.5); g.addColorStop(0, o.grad[0]); g.addColorStop(1, o.grad[1]); ctx.fillStyle = g; } else ctx.fillStyle = o.fill || pal.white;
    ctx.fillText(str, 0, 0);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // placeholder for unknown ids, and the gallery grid helper
  // ---------------------------------------------------------------------------------------------------------------
  // A labelled coloured box (a circle with o.round) that says "art missing here". Never throws. o: color, round, alpha
  function placeholder(ctx, label, x, y, w, h, o) {
    o = o || {};
    w = Math.max(1, num(w, 40)); h = Math.max(1, num(h, 40));
    const txt = String(label === undefined || label === null ? '?' : label);
    const hue = (U.hashStr(txt) % 360);
    const col = o.color || U.color.hsl(hue, 0.5, 0.36);
    ctx.save();
    if (o.alpha !== undefined) ctx.globalAlpha = ctx.globalAlpha * cA(o.alpha);
    ctx.beginPath();
    if (o.round) ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, TAU); else ctx.rect(x, y, w, h);
    ctx.fillStyle = col; ctx.fill();
    ctx.lineWidth = Math.max(1.5, Math.min(w, h) * 0.04); ctx.strokeStyle = pal.ink; ctx.stroke();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = rgba('#ffffff', 0.22); ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.moveTo(x + w, y); ctx.lineTo(x, y + h); ctx.stroke();
    ctx.restore();
    const fs = clamp(Math.min(w / Math.max(3, txt.length) * 1.7, h * 0.3), 7, 22);
    ctx.font = '700 ' + fs + 'px ' + font.ui; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = pal.white; ctx.fillText(txt, x + w / 2, y + h / 2, Math.max(4, w - 4));
    ctx.restore();
  }
  // Lay out labelled cells on a gallery canvas so every artist can build a contact sheet in a few lines.
  //   ART.sheetGrid(canvas, params, cells, drawCell, opts)
  //   canvas, params   exactly what a sheet function receives (the context is already scaled; params.w and params.h are logical px)
  //   cells            array of strings or objects {label, ...anything}; the label is printed under the cell
  //   drawCell         fn(ctx, cell, w, h, i, cellInfo): the context is clipped to the cell and translated so (0, 0) is its top-left and
  //                    the drawing area is w x h (label strip excluded). cellInfo = {col, row, x, y, cw, ch}
  //   opts             cols (default: best fit for the aspect), title, pad (10), labelH (18), bg ('night' | 'paper' | any fill), cellBg (fill
  //                    or false), aspect (cell w/h hint when auto-fitting, default 1), gap (8), titleH (0 or 26 with a title)
  // Returns {cols, rows, cw, ch, rects} for tests.
  function sheetGrid(canvas, params, cells, drawCell, opts) {
    opts = opts || {};
    const ctx = canvas.getContext('2d');
    const W = num(params && params.w, 1600), H = num(params && params.h, 900);
    const pad = num(opts.pad, 10), gap = num(opts.gap, 8), labelH = num(opts.labelH, 18), titleH = opts.title ? num(opts.titleH, 26) : 0;
    const n = Math.max(1, cells.length);
    const availW = W - pad * 2, availH = H - pad * 2 - titleH;
    let cols = opts.cols;
    if (!cols) {
      let best = 0;
      const aspect = opts.aspect || 1;
      for (let c = 1; c <= n; c++) {
        const r = Math.ceil(n / c), cw = (availW - gap * (c - 1)) / c, ch = (availH - gap * (r - 1)) / r - labelH;
        const s = Math.min(cw, ch * aspect);
        if (s > best) { best = s; cols = c; }
      }
    }
    cols = Math.max(1, Math.min(n, cols | 0));
    const rows = Math.ceil(n / cols);
    const cw = (availW - gap * (cols - 1)) / cols, chFull = (availH - gap * (rows - 1)) / rows, ch = Math.max(4, chFull - labelH);
    ctx.save();
    ctx.fillStyle = opts.bg === 'paper' ? pal.paper : (opts.bg && opts.bg !== 'night' ? opts.bg : pal.night);
    ctx.fillRect(0, 0, W, H);
    if (opts.title) { ctx.font = '700 15px ' + font.ui; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = opts.bg === 'paper' ? pal.ink : pal.paper; ctx.fillText(String(opts.title), pad, pad + titleH / 2); }
    const rects = [];
    for (let i = 0; i < cells.length; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      const x = pad + col * (cw + gap), y = pad + titleH + row * (chFull + gap);
      const cell = cells[i], label = typeof cell === 'string' ? cell : (cell && cell.label !== undefined ? cell.label : '');
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, cw, ch); ctx.clip();
      if (opts.cellBg !== false) { ctx.fillStyle = opts.cellBg || (opts.bg === 'paper' ? pal.paper2 : pal.indigo); ctx.fillRect(x, y, cw, ch); }
      ctx.translate(x, y);
      try { drawCell(ctx, cell, cw, ch, i, { col, row, x, y, cw, ch }); } catch (e) {
        ctx.fillStyle = '#3a0d1e'; ctx.fillRect(0, 0, cw, ch); ctx.fillStyle = '#ffd0da'; ctx.font = '12px ' + font.ui; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(String(e && e.message).slice(0, 60), 6, 6);
        if (typeof console !== 'undefined' && console.error) console.error('sheetGrid cell ' + i + ': ' + (e && e.stack));
      }
      ctx.restore();
      ctx.font = '600 12px ' + font.ui; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = opts.bg === 'paper' ? pal.ink : '#c9bff0'; ctx.fillText(String(label), x + cw / 2, y + ch + labelH / 2, cw);
      rects.push({ x, y, w: cw, h: ch });
    }
    ctx.restore();
    return { cols, rows, cw, ch, rects };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // the toolkit object
  // ---------------------------------------------------------------------------------------------------------------
  // numeric arguments in [from, to) that are NaN or infinite become 0 before the drawing function sees them
  const sane = (fn, from, to) => function () {
    const n = Math.min(arguments.length, to);
    for (let i = from; i < n; i++) if (typeof arguments[i] === 'number' && !isFinite(arguments[i])) arguments[i] = 0;
    return fn.apply(this, arguments);
  };
  Object.assign(tk, {
    pal, fams, fam, light: LIGHT, font, skies: SKIES,
    shade, tint, deep, mix, rgba,
    seed, rng, vary, pick, noise1, noise2,
    ease, wave, pulse, spring, blend, blendPose, track, poseTrack, motion, lowQ,
    P, circlePts, ellipsePts, arcPts, rrectPts, xf, mirrorPts, lerpPts, bendPts, bbox, dist, flatten, trace: traceShape, shapeBox,
    inkPath, inkStroke: sane(inkStroke, 1, 5), inkCurve: sane(inkCurve, 1, 7), inkBlot: sane(inkBlot, 1, 4), inkBleed, inkText: sane(inkText, 2, 5),
    celFill, celEllipse: sane(celEllipse, 1, 5), celCircle: sane(celCircle, 1, 4), ribbon, hairLock, gloss,
    halftone: sane(halftone, 1, 5), halftoneRamp: sane(halftoneRamp, 1, 5), glow: sane(glow, 1, 4), sparkle: sane(sparkle, 1, 4), note: sane(note, 1, 4), soundRings: sane(soundRings, 1, 4), kirakira: sane(kirakira, 1, 6), speedLines: sane(speedLines, 1, 3),
    eye: sane(eye, 1, 5), eyePresets: EYE_PRESETS, brow: sane(brow, 1, 4), mouth: sane(mouth, 1, 4), blush: sane(blush, 1, 4), nose: sane(nose, 1, 4),
    paperGrain: sane(paperGrain, 1, 5), vignette: sane(vignette, 1, 3), sky: sane(sky, 1, 5), mist: sane(mist, 1, 6), stars: sane(stars, 1, 6), moon: sane(moon, 1, 4),
    petal: sane(petal, 1, 4), bolt: sane(bolt, 1, 5), lin, rad, withAlpha, flipX,
    clamp, lerp, num, smoothstep, mat, chain,
  });

  // ---------------------------------------------------------------------------------------------------------------
  // registry of real (non-placeholder) art, and gallery sheets
  // ---------------------------------------------------------------------------------------------------------------
  const real = new Set();
  A.declare = (kind, ids) => { (Array.isArray(ids) ? ids : [ids]).forEach((id) => real.add(kind + '|' + id)); };
  A.has = (kind, id) => real.has(kind + '|' + id);
  A.sheets = {};
  A.sheet = (name, fn) => {
    if (typeof name !== 'string' || !name) throw new Error('ART.sheet: name must be a non-empty string');
    if (typeof fn !== 'function') throw new Error('ART.sheet(' + name + '): fn must be a function');
    if (Object.prototype.hasOwnProperty.call(A.sheets, name)) throw new Error('ART.sheet: duplicate sheet name "' + name + '"');
    A.sheets[name] = fn;
    return fn;
  };
  A.sprite = sprite;
  A.blit = blit;
  A.placeholder = placeholder;
  A.sheetGrid = sheetGrid;
  A.tk = tk;

  // ---------------------------------------------------------------------------------------------------------------
  // placeholders for every member of DESIGN 5.6: labelled shapes, never throw, safe on the no-op context
  // ---------------------------------------------------------------------------------------------------------------
  const POSE_MS = { attack: 420, cast: 500, hurt: 260, block: 300, buff: 400, die: 700, down: 500, cheer: 800, telegraph: 0, idle: 0, walk: 0 };
  const poseMs = (pose) => (POSE_MS[pose] || 0);
  const heroDef = (id) => (DATA.heroes && DATA.heroes[id]) || null;
  const heroColor = (id) => { const d = heroDef(id); return d ? d.color : '#a9c4ff'; };

  A.hero = {
    poseMs,
    bounds: () => ({ w: 120, h: 250, head: { x: 6, y: -200 }, hand: { x: 40, y: -100 }, feet: { x: 0, y: 0 }, weapon: { x: 70, y: -150 } }),
    draw(ctx, id, o) {
      o = o || {};
      const s = num(o.s, 1), x = num(o.x, 0), y = num(o.y, 0);
      ctx.save();
      ctx.translate(x, y); ctx.scale(o.flip ? -s : s, s);
      if (o.alpha !== undefined) ctx.globalAlpha = ctx.globalAlpha * cA(o.alpha);
      placeholder(ctx, String(id) + (o.pose ? ' ' + o.pose : ''), -50, -250, 100, 250, { color: U.color.mix(heroColor(id), pal.ink, 0.45) });
      ctx.restore();
    },
    portrait(ctx, id, o) { o = o || {}; placeholder(ctx, String(id) + ' ' + (o.expr || 'neutral'), num(o.x, 0), num(o.y, 0), pos(o.w, 150), pos(o.h, 200), { color: U.color.mix(heroColor(id), pal.ink, 0.45) }); },
    medallion(ctx, id, x, y, r) { r = pos(r, 24); placeholder(ctx, String(id), num(x, 0) - r, num(y, 0) - r, r * 2, r * 2, { round: true, color: U.color.mix(heroColor(id), pal.ink, 0.35) }); },
  };

  const enemies = new Map();
  const enemyMeta = (id) => (DATA.enemies && DATA.enemies[id]) || (DATA.rosterById && DATA.rosterById[id]) || null;
  const chapterHue = { 1: '#8f5fe8', 2: '#ff6a4a', 3: '#ff3a6a' };
  function enemyBase(id) {
    const m = enemyMeta(id), size = m && m.size ? m.size : 'm', h = (DATA.LISTS.sizeHeight[size] || 170);
    const w = size === 'xl' ? h * 0.9 : size === 'l' ? h * 0.85 : h * 0.8;
    return { w, h, head: { x: -w * 0.1, y: -h * 0.88 }, body: { x: 0, y: -h * 0.5 }, feet: { x: 0, y: 0 } };
  }
  const tierScale = (id) => { const m = enemyMeta(id); return m && m.tier === 'elite' ? 1.08 : 1; };
  // the gold rune ring of an elite and the slow ring of a boss (drawn below): radius as a share of the bounds width, one place for the drawing and for `right`
  const RING_K = { elite: 0.52, boss: 0.6 };
  const ringReach = (id, w) => { const m = enemyMeta(id); return m && RING_K[m.tier] ? w * RING_K[m.tier] : 0; };
  A.enemy = {
    poseMs,
    // art_enemies_N.js call this once per id: entry = {draw(ctx, o), bounds:{w,h,head,body,feet}}
    register(id, entry) {
      if (!entry || typeof entry.draw !== 'function') throw new Error('ART.enemy.register(' + id + '): entry.draw is required');
      enemies.set(id, entry);
      real.add('enemy|' + id);
    },
    // `right` (only when there is something to report) is how far the visible picture reaches to the RIGHT of the feet centre: the larger of what the entry
    // declares for its art (the idle and the held telegraph pose) and the shell's own ground ring. SCENE slides the enemy line left by the overhang so a
    // lane at the screen edge never crops a tail, a wing or the ring (DESIGN 5.9, SCENE.stats().fit). Every other number is the drawn silhouette too:
    // `h` reaches the top of the idle body (not its thinnest tip), because intent bubbles sit on top.y - 6.
    bounds(id) {
      const e = enemies.get(id), b = e && e.bounds ? e.bounds : enemyBase(id), k = tierScale(id);
      const sc = (p) => ({ x: p.x * k, y: p.y * k });
      const out = { w: b.w * k, h: b.h * k, head: sc(b.head), body: sc(b.body || { x: 0, y: -b.h / 2 }), feet: sc(b.feet || { x: 0, y: 0 }) };
      const ring = ringReach(id, b.w * k), right = Math.max(num(b.right, 0) * k, ring);
      if (right > 0) out.right = right;
      return out;
    },
    draw(ctx, id, o) {
      o = o || {};
      const e = enemies.get(id), m = enemyMeta(id), tier = m ? m.tier : 'normal';
      const b = A.enemy.bounds(id), k = tierScale(id), s = num(o.s, 1) * k, t = num(o.t, 0);
      ctx.save();
      ctx.translate(num(o.x, 0), num(o.y, 0));
      if (o.alpha !== undefined) ctx.globalAlpha = ctx.globalAlpha * cA(o.alpha);
      const sw = b.w * num(o.s, 1);
      // contact shadow
      ctx.save(); ctx.scale(1, 0.16);
      ctx.beginPath(); ctx.arc(0, 0, sw * 0.42, 0, TAU); ctx.fillStyle = rgba(pal.ink, 0.38); ctx.fill();
      ctx.restore();
      // tier aura: elites get a gold rune ring and orbiting sparks, bosses a large coloured glow and a slow rune ring
      if (tier === 'elite' || tier === 'boss') {
        const boss = tier === 'boss', col = boss ? (chapterHue[m && m.chapter] || '#8f5fe8') : '#ffb640', bh = b.h * num(o.s, 1);
        const pl = 0.5 + 0.5 * Math.sin(t * 2.2);
        glow(ctx, 0, -bh * 0.5, bh * (boss ? 0.78 : 0.62), col, (boss ? 0.34 : 0.26) + 0.08 * pl);
        ctx.save(); ctx.scale(1, 0.2);
        ctx.strokeStyle = rgba(boss ? pal.gold2 : pal.gold, 0.85); ctx.lineWidth = boss ? 3 : 2.2;
        ctx.setLineDash([9, 7]); ctx.lineDashOffset = -t * (boss ? 10 : 24) * motion();
        ctx.beginPath(); ctx.arc(0, 0, sw * RING_K[tier], 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        const nSp = boss ? 5 : 3;
        for (let i = 0; i < nSp; i++) {
          const a = t * 0.9 * motion() + i * TAU / nSp;
          sparkle(ctx, Math.cos(a) * sw * 0.5, -bh * (0.42 + 0.3 * Math.sin(a * 0.5 + i)) + Math.sin(a) * bh * 0.05, boss ? 6 : 4.5, { color: pal.gold2, alpha: 0.5 + 0.5 * Math.sin(t * 3 + i), glow: 0.5 });
        }
      }
      if (o.glow) glow(ctx, 0, -b.h * num(o.s, 1) * 0.5, b.h * num(o.s, 1) * 0.7, typeof o.glow === 'string' ? o.glow : '#ffe9a8', typeof o.glow === 'number' ? clamp(o.glow, 0, 1) * 0.6 : 0.4);
      ctx.scale(o.flip ? -s : s, s);
      if (e) e.draw(ctx, { s, pose: o.pose || 'idle', t, pt: num(o.pt, 0), hpPct: o.hpPct === undefined ? 1 : o.hpPct, phase: o.phase | 0, glow: o.glow || 0, flip: !!o.flip });
      else placeholder(ctx, String(id), -b.w / 2 / k, -b.h / k, b.w / k, b.h / k, { color: U.color.mix(m && m.chapter ? chapterHue[m.chapter] : pal.dusk, pal.ink, 0.5) });
      ctx.restore();
    },
  };

  A.card = {
    draw(ctx, cardOrId, w, h) {
      const id = typeof cardOrId === 'string' ? cardOrId : (cardOrId && cardOrId.id) || '?';
      const def = DATA.cards && DATA.cards[id];
      const f = fam(def && def.art && def.art.c);
      w = pos(w, 170); h = pos(h, 116);
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, f.light); g.addColorStop(1, f.dark);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      placeholder(ctx, id, w * 0.2, h * 0.2, w * 0.6, h * 0.6, { color: f.base, alpha: 0.85 });
    },
    motif(ctx, motifId, x, y, size, palette) {
      size = pos(size, 40);
      const f = fam(typeof palette === 'string' ? palette : (palette && palette.name) || 'ash');
      placeholder(ctx, String(motifId), num(x, 0) - size / 2, num(y, 0) - size / 2, size, size, { round: true, color: f.dark });
    },
  };
  A.icon = {
    draw(ctx, kind, id, x, y, size, opts) {
      size = pos(size, 24);
      placeholder(ctx, String(id), num(x, 0) - size / 2, num(y, 0) - size / 2, size, size, { round: true, alpha: opts && opts.dim ? 0.5 : 1 });
    },
  };
  A.scene = {
    draw(ctx, sceneId, w, h, t) {
      w = pos(w, 1280); h = pos(h, 720);
      sky(ctx, 0, 0, w, h, /boss|defeat/.test(String(sceneId)) ? 'storm' : /ch2|shop|camp|event|title|treasure/.test(String(sceneId)) ? 'night' : /victory/.test(String(sceneId)) ? 'dawn' : /paper/.test(String(sceneId)) ? 'paper' : 'golden');
      ctx.fillStyle = rgba(pal.ink, 0.55); ctx.fillRect(0, h * 0.72, w, h * 0.28);
      ctx.font = '700 22px ' + font.ui; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = pal.white;
      ctx.fillText('scene ' + sceneId, w / 2, h / 2);
    },
    logo(ctx, x, y, w) { w = pos(w, 400); inkText(ctx, 'HOCUS VOCUS', num(x, 0), num(y, 0), w / 6.3, { family: font.display, fill: pal.paper, weight: 900, skew: -0.08 }); },
  };
  A.map = {
    hex(ctx, kind, x, y, size, opts) {
      size = pos(size, 46);
      const wash = { fog: '#e6d3a3', known: '#cbb98f', ground: '#f3e6c8', block: '#3a2f52', painted: '#f8e9c0', edge: '#cbb98f', path: '#ffd889', hover: '#ffe9a8', target: '#ff9ac8' }[kind] || '#e6d3a3';
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = PI / 6 + i * PI / 3; const px = num(x, 0) + Math.cos(a) * size, py = num(y, 0) + Math.sin(a) * size; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
      ctx.closePath(); ctx.fillStyle = wash; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = pal.ink; ctx.stroke();
      if (opts && opts.tile && opts.tile !== 'empty') { ctx.font = '700 ' + Math.max(8, size * 0.28) + 'px ' + font.ui; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = pal.ink; ctx.fillText(String(opts.tile).slice(0, 5), x, y); }
    },
    paintBloom(ctx, x, y, size, p) { p = clamp(num(p, 1), 0, 1); glow(ctx, x, y, Math.max(1, size * (0.3 + p * 1.1)), pal.sakura, 0.5 * (1 - p * 0.5), false); },
    token(ctx, heroIds, x, y) {
      const ids = Array.isArray(heroIds) ? heroIds : [heroIds];
      ids.forEach((id, i) => { ctx.beginPath(); ctx.arc(num(x, 0) + (i - (ids.length - 1) / 2) * 16, num(y, 0), 12, 0, TAU); ctx.fillStyle = heroColor(id); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = pal.ink; ctx.stroke(); });
    },
  };
  // effects: one signature, t is PROGRESS 0..1. The placeholder is a fading expanding ring.
  A.fx = { names: (DATA.LISTS && DATA.LISTS.fx ? DATA.LISTS.fx : []).slice(), ms: { slash: 260, cross: 340, thrust: 240, burst: 300, ring: 420, inkSplash: 700, petals: 1100, lightning: 380, chain: 420, flame: 700, frost: 600, poison: 800, shield: 500, heal: 800, buff: 700, debuff: 700, sparkle: 600, speedLines: 280, impactFrame: 140, sfxText: 520, vignette: 400, chromatic: 220, brushDrag: 450, numberPop: 900 } };
  A.fx.names.forEach((name) => {
    A.fx[name] = (ctx, o, t) => {
      o = o || {};
      const p = clamp(num(t, 0), 0, 1), r = (10 + p * 50) * num(o.s, 1);
      ctx.save();
      ctx.globalAlpha = ctx.globalAlpha * (1 - p);
      ctx.strokeStyle = o.color || pal.gold; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(num(o.x, 640), num(o.y, 360), r, 0, TAU); ctx.stroke();
      ctx.restore();
    };
  });


  // ---------------------------------------------------------------------------------------------------------------
  // gallery sheet: the toolkit demo (ART.sheets.toolkit), the visual regression target for art.js
  // ---------------------------------------------------------------------------------------------------------------
  A.sheet('toolkit', (canvas, params) => {
    const t = num(params.t, 0);
    const cells = [
      { label: 'inkPath: taper, pressure, wobble', fn(g, w, h) {
        g.fillStyle = pal.paper; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 6; i++) {
          const y = 22 + i * (h - 44) / 5;
          inkPath(g, [[16, y + 6], [w * 0.3, y - 10 + i * 2], [w * 0.62, y + 9], [w - 16, y - 4]], { w: 3 + i * 1.5, seed: i, wobble: 0.05 + i * 0.06, taper: i < 3 ? 0.3 : 0.05, pressure: i === 4 ? 'head' : i === 5 ? (u) => 0.35 + 0.65 * Math.abs(Math.sin(u * 9)) : 'mid', t: i > 3 ? t : undefined });
        }
      } },
      { label: 'closed outline: light-side thin, shadow-side heavy', fn(g, w, h) {
        g.fillStyle = pal.paper; g.fillRect(0, 0, w, h);
        const leaf = [[w * 0.2, h * 0.5], [w * 0.32, h * 0.22], [w * 0.5, h * 0.14], [w * 0.5, h * 0.5, 1], [w * 0.46, h * 0.82], [w * 0.28, h * 0.8]];
        celFill(g, leaf, '#ff7eb6', { line: 6 });
        celFill(g, ellipsePts(w * 0.74, h * 0.5, w * 0.16, h * 0.28, 14), '#8f5fe8', { line: 6, weightVar: 0.9 });
        sparkle(g, w * 0.5, h * 0.9, 8, { color: pal.vermilion });
      } },
      { label: 'celFill: base, shadow, lit edge (hi), rim, halftone', fn(g, w, h) {
        sky(g, 0, 0, w, h, 'night');
        celCircle(g, w * 0.2, h * 0.5, w * 0.14, '#ffc2dc', { line: 3.4, hi: true, hiW: 3 });
        celFill(g, [[w * 0.45, h * 0.3], [w * 0.62, h * 0.25], [w * 0.7, h * 0.55], [w * 0.55, h * 0.78], [w * 0.42, h * 0.6]], '#5b8bff', { rim: pal.cyan, rimW: 2.4, depth: 10, halftone: true, hi: true, hiW: 3 });
        celFill(g, [[w * 0.78, h * 0.2], [w * 0.92, h * 0.4], [w * 0.86, h * 0.75], [w * 0.74, h * 0.6, 1], [w * 0.7, h * 0.35]], '#ff9a2e', { depth: 9, rim: '#ffe45e', rimW: 2, halftone: { d: 4.5 }, light: -2.4, hi: true });
      } },
      { label: 'ribbon / hairLock: gloss, strands, dipped tips, sway (t)', fn(g, w, h) {
        sky(g, 0, 0, w, h, 'dusk');
        const cols = ['#ff7eb6', '#a9c4ff', '#7a6bff', '#ff9a2e', '#3fd6b0'], tips = ['#ffd0e6', '#ffffff', '#5ff5ff', '#ffe45e', '#c8fff0'];
        for (let i = 0; i < 5; i++) {
          const x = 34 + i * (w - 68) / 4, len = h * 0.62;
          hairLock(g, [[x, 22], [x + 10, 22 + len * 0.35], [x - 8, 22 + len * 0.7], [x + 6, 22 + len]], cols[i], { wMax: 28 - i * 2, w0: 12, sway: { amp: 0.3, freq: 0.6, phase: i * 1.3 }, t, rim: '#ffffff', rimW: 1.4, tipColor: tips[i], tipFrac: 0.3, strands: 2 });
        }
        ribbon(g, [[16, h - 28], [w * 0.4, h - 58], [w * 0.7, h - 18], [w - 16, h - 44]], '#e8383d', { wMax: 16, w0: 6, w1: 4, cap: 'round', bend: Math.sin(t) * 0.15, gloss: true });
      } },
      { label: 'eye: neutral happy closed angry determined hurt sad wide', fn(g, w, h) {
        g.fillStyle = '#ffe3d0'; g.fillRect(0, 0, w, h);
        const ex = ['neutral', 'happy', 'closed', 'angry', 'determined', 'hurt', 'sad', 'wide'];
        const iris = [['#4a2a8a', '#b5a0ff'], ['#8a1848', '#ff6fb0'], ['#0a5a7a', '#5ff5ff'], ['#7a4a00', '#ffd23a']];
        const cw = w / 4, ch = h / 2;
        ex.forEach((e, i) => {
          const cx = cw * (i % 4) + cw / 2, cy = ch * Math.floor(i / 4) + ch / 2;
          eye(g, cx, cy, cw * 0.42, ch * 0.55, { expr: e, iris: iris[i % 4], side: i % 2 ? -1 : 1, open: e === 'neutral' ? 0.5 + 0.5 * Math.abs(Math.cos(t * 1.3)) : 1 });
        });
      } },
      { label: 'mouths, brows, blush', fn(g, w, h) {
        g.fillStyle = '#ffe3d0'; g.fillRect(0, 0, w, h);
        const kinds = ['smile', 'smirk', 'grin', 'shout', 'open', 'grit', 'cat', 'frown', 'flat', 'tiny'];
        kinds.forEach((k, i) => mouth(g, w * (0.12 + 0.19 * (i % 5)), h * (0.3 + 0.33 * Math.floor(i / 5)), w * 0.14, k));
        for (let i = 0; i < 5; i++) brow(g, w * (0.12 + 0.19 * i), h * 0.86, w * 0.13, { tilt: (i - 2) * 0.3, arch: 0.3 + i * 0.1, side: i % 2 ? -1 : 1 });
        blush(g, w * 0.88, h * 0.88, w * 0.14);
      } },
      { label: 'sparkle, kirakira, glow', fn(g, w, h) {
        sky(g, 0, 0, w, h, 'night');
        kirakira(g, 0, 0, w, h, t, { n: 26, seed: 4 });
        sparkle(g, w * 0.2, h * 0.5, 22, { color: pal.white });
        sparkle(g, w * 0.4, h * 0.34, 12, { color: pal.gold2, rot: 0.5 });
        glow(g, w * 0.62, h * 0.5, 36, pal.cyan, 0.9);
        glow(g, w * 0.82, h * 0.5, 30, pal.sakura, 0.9);
        sparkle(g, w * 0.62, h * 0.5, 12, { color: '#ffffff', glow: 0 });
        sparkle(g, w * 0.82, h * 0.5, 12, { color: '#ffffff', glow: 0 });
      } },
      { label: 'halftone, halftone ramp, speed lines (radial, dir)', fn(g, w, h) {
        g.fillStyle = pal.paper; g.fillRect(0, 0, w, h);
        halftone(g, 0, 0, w * 0.34, h * 0.5, { d: 6, force: true });
        halftoneRamp(g, w * 0.36, 0, w * 0.32, h * 0.5, { d: 7, dir: 0.4, r1: 3.6 });
        halftone(g, w * 0.7, 0, w * 0.3, h * 0.5, { d: 4, r: 1.4, color: pal.bloodmoon, alpha: 0.7, force: true });
        g.save(); g.beginPath(); g.rect(0, h * 0.52, w * 0.5, h * 0.48); g.clip(); g.fillStyle = pal.ink; g.fillRect(0, h * 0.52, w * 0.5, h * 0.48);
        speedLines(g, w * 0.25, h * 0.76, { n: 40, seed: 2, r0: 20, r1: 200, w: 4 }); g.restore();
        g.save(); g.beginPath(); g.rect(w * 0.5, h * 0.52, w * 0.5, h * 0.48); g.clip(); g.fillStyle = '#2a4a8a'; g.fillRect(w * 0.5, h * 0.52, w * 0.5, h * 0.48);
        speedLines(g, 0, 0, { mode: 'dir', rect: [w * 0.5, h * 0.52, w * 0.5, h * 0.48], angle: 0, len: 110, n: 28, seed: 3, w: 3 }); g.restore();
      } },
      { label: 'sky presets and mist', fn(g, w, h) {
        const names = Object.keys(SKIES), sh = h / names.length;
        names.forEach((n, i) => { sky(g, 0, i * sh, w, sh, n); g.font = '600 11px ' + font.ui; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = i === 6 ? pal.ink : pal.white; g.fillText(n, 8, i * sh + sh / 2); });
        mist(g, 0, 0, w, h, t, { seed: 2, alpha: 0.2 });
      } },
      { label: 'ground grain, edge-bled shape, spill, lettering', fn(g, w, h) {
        g.fillStyle = pal.paper; g.fillRect(0, 0, w, h);
        paperGrain(g, 0, 0, w, h, { alpha: 0.9 });
        const sh = [[w * 0.1, h * 0.2], [w * 0.4, h * 0.14], [w * 0.46, h * 0.5], [w * 0.14, h * 0.55]];
        g.beginPath(); traceShape(g, sh); g.fillStyle = '#ffd889'; g.fill();
        inkBleed(g, sh, { w: 6 });
        inkBlot(g, w * 0.72, h * 0.3, 20, { seed: 3, drips: 3 });
        inkText(g, 'LA!', w * 0.5, h * 0.78, Math.min(w * 0.3, 54), { fill: pal.white, shadow: pal.vermilion, rot: -0.08 });
      } },
      { label: 'ease curves (outBack, outElastic, snap, spring)', fn(g, w, h) {
        g.fillStyle = pal.indigo; g.fillRect(0, 0, w, h);
        const list = [['outBack', pal.sakura], ['outElastic', pal.cyan], ['snap', pal.gold], ['inOutSine', pal.jade]];
        list.forEach(([n, c]) => { const pts = []; for (let i = 0; i <= 40; i++) { const u = i / 40; pts.push([16 + u * (w - 32), h - 24 - ease[n](u) * (h - 60)]); } inkPath(g, pts, { w: 2.4, color: c, taper: 0.05, wobble: 0 }); });
        const sp = []; for (let i = 0; i <= 40; i++) sp.push([16 + i / 40 * (w - 32), h - 24 - spring(i / 40 * 1.2, 14, 6) * (h - 60)]);
        inkPath(g, sp, { w: 1.4, color: pal.white, taper: 0.05, wobble: 0, alpha: 0.7 });
      } },
      { label: 'ART.tk.chain: one baked drawing bent at its joints (t)', fn(g, w, h) {
        sky(g, 0, 0, w, h, 'night');
        for (let i = 0; i < 3; i++) {
          const ch = ART.tk.chain('sheet|chain' + i, { spine: [[0, 0], [8, 40], [-6, 80], [4, 120]], cuts: [0.34, 0.68], reach: 30, draw: (gg) => { ribbon(gg, [[0, 0], [8, 40], [-6, 80], [4, 120]], ['#ff7eb6', '#a9c4ff', '#ffd889'][i], { wMax: 24, w0: 10, tipColor: '#ffffff', tipFrac: 0.28, sway: null, rim: '#ffffff' }); } });
          g.save(); g.translate(w * (0.2 + 0.3 * i), 20 + (h - 160) * 0.3); ch.draw(g, [0.12 * Math.sin(t * 1.4 + i), 0.3 * Math.sin(t * 1.4 + i - 0.8), 0.4 * Math.sin(t * 1.4 + i - 1.6)], 1); g.restore();
        }
        inkText(g, 'one sprite per slab', w / 2, h - 18, 14, { skew: 0, fill: pal.paper, weight: 700, strokeW: 3 });
      } },
      { label: 'petal, bolt, sparkle, eye blink and half-lids', fn(g, w, h) {
        sky(g, 0, 0, w, h, 'dusk');
        for (let i = 0; i < 7; i++) petal(g, 30 + i * (w - 60) / 6, 40 + 20 * Math.sin(t * 2 + i), 10 + (i % 3) * 3, t + i, 1, i % 2 ? '#ffc2dc' : '#ff9cc6');
        bolt(g, w * 0.15, h * 0.45, w * 0.5, h * 0.62, { seed: Math.floor(t * 8), jag: 14 }); bolt(g, w * 0.5, h * 0.62, w * 0.86, h * 0.44, { seed: Math.floor(t * 8) + 5, jag: 14, color: '#ff9ac8' });
        [1, 0.7, 0.4, 0.15, 0].forEach((o, i) => eye(g, 34 + i * (w - 68) / 4, h - 48, 26, 34, { open: o, iris: ['#8a1848', '#ff6fb0'], side: 1 }));
      } },
      { label: 'note, soundRings', fn(g, w, h) {
        sky(g, 0, 0, w, h, 'night');
        ['eighth', 'quarter', 'beamed', 'rest'].forEach((k, i) => note(g, w * (0.14 + i * 0.24), h * 0.34, 16, { kind: k, color: pal.gold, rot: i === 1 ? 0.1 : 0 }));
        soundRings(g, w * 0.28, h * 0.72, 16, { n: 3, color: pal.jade, alpha: 0.9, lw: 2.4 });
        soundRings(g, w * 0.7, h * 0.72, 16, { n: 3, color: pal.sakura, broken: true, rot: 0, lw: 2.4 });
      } },
      { label: 'palette and hue families', fn(g, w, h) {
        g.fillStyle = pal.night; g.fillRect(0, 0, w, h);
        const keys = Object.keys(pal), sw = w / 10;
        keys.forEach((k, i) => { g.fillStyle = pal[k]; g.fillRect((i % 10) * sw, Math.floor(i / 10) * 28, sw - 2, 26); });
        Object.keys(fams).forEach((k, i) => { const f = fams[k], y = 92 + i * ((h - 98) / 12); ['dark', 'base', 'light', 'glow'].forEach((n, j) => { g.fillStyle = f[n]; g.fillRect(6 + j * 22, y, 20, (h - 98) / 12 - 2); }); g.font = '600 10px ' + font.ui; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = pal.paper; g.fillText(k, 100, y + 5); });
      } },
    ];
    sheetGrid(canvas, params, cells, (g, cell, w, h) => cell.fn(g, w, h), { cols: 5, title: 'ART.tk toolkit (t = ' + t.toFixed(2) + 's)' });
  });

  return A;
})();
