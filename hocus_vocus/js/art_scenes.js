// Hocus Vocus: ART.scene, the full-screen background paintings, the HOCUS VOCUS logo and the RJ monogram. Extends ART (art.js).
//
// PUBLIC API (DESIGN 5.6; these members REPLACE the placeholders of art.js)
//   ART.scene.draw(ctx, sceneId, w, h, t, opts) -> true
//        Paints scene `sceneId` (DATA.LISTS.scenes: title ch1 ch2 ch3 boss1 boss2 boss3 camp shop event treasure victory defeat paper) into the
//        rectangle (0, 0, w, h) of the current transform. t is ABSOLUTE SECONDS and drives every loop (mist, lanterns, fire, petals, lightning).
//        The scenes are composed on the 1280 x 720 stage and scaled to COVER any other size (uniform scale, centred crop), so 16:9 fits exactly.
//        `paper` is the exception: it is a texture that fills any w x h at 1:1.
//        opts (all optional):  particles  number 0..2 (default 1), the multiplier for drifting petals, leaves and fireflies (0 = none);
//                                          `false` means 0 and `true` means 1. ART.tk.opt.reduceMotion multiplies it by 0.3 on top.
//                              parallaxX   camera offset in STAGE PX (clamped to +-90): positive moves the camera right, so near layers slide left.
//                                          Far layers move about 5% of it, mid layers 30%, foreground 100%, the ground plane never moves.
//                                          reduceMotion forces parallax 0. A slow automatic sway (a few px) runs when reduceMotion is off.
//                              logo        title only: also paint ART.scene.logo(ctx, 640, 150, 540, t) (default false: the screen composes it)
//                              rung        title only: true once the player has won. The mic stands free of its Gloss wrap, glows warm, its ring stays
//                                          whole and clear and notes and hearts rise; the duo sing and sway (default false: wrapped and muffled, the duo
//                                          idle). The Gloss at the corners shrinks to half. Part of the title layer cache key.
//                              seed        paper only: which print-grain layout (default 0), so two panels never look identical
//                              edge        paper only: false skips the soft printed edge and the two strips of tape (default true)
//        Never throws: an unknown id paints a night sky with a small "scene ?" label and returns false; a drawing error is caught once per scene
//        (ART.scene.lastError holds its message) and the draw returns false.
//        COMBAT scenes (ch1 ch2 ch3 boss1 boss2 boss3) keep the contract of DESIGN 5.9: ground plane (feet) at y = 520 of 720, heroes on the left
//        third, enemies across the right two thirds, the band below y 520 darkened for the HUD and the hand, mid-tone hazy backdrops behind the
//        enemy lanes so the fight never competes with the painting.
//   ART.scene.logo(ctx, x, y, w, t, opts?)
//        The HOCUS VOCUS logo, CENTRED on (x, y), w px wide: stacked by default (HOCUS over VOCUS, about 0.40 * w tall), or one line with
//        opts.line (about 0.14 * w tall). Chunky rounded sticker letters (HOCUS pink, VOCUS green, each with a lighter top band), a cream inner rim,
//        a thick warm outline and a soft drop shadow; letters lean by 3 degrees in turn. The O of HOCUS is a cherry blossom, the O of VOCUS a green
//        mic grille; a mic-wand with a gold star crosses behind both words. Pure functions of t: each letter bobs on a 0.8 s wave, the blossom turns
//        (9 s) and lets a petal go (5.2 s), the grille sends a sound ring (7.3 s), the wand's star twinkles (6.1 s). Each letter is cached per width.
//        The title screen draws it at ART.scene.logo(ctx, 640, 150, 540, t) (y 42 to 258).
//   ART.scene.monogram(ctx, x, y, r, o?) -> bool
//        The owners' RJ monogram centred on (x, y), radius r: one chunky cream stroke (the stem and bowl of an R running into the hook of a J) on a
//        disc split diagonally pink and green, under the warm outline. Cached per radius. o.alpha. (favicon art, card back, share card, boot dot, flag)
//   Extras beyond DESIGN:
//   ART.scene.warm(id, w, h) -> bool      bakes every static layer of a scene at that size now (call while a screen loads to avoid a first-frame hitch)
//   ART.scene.info(id) -> {id, combat, ground, mood, layers, focus?} | null     combat: bool, ground: 520 for combat scenes, mood: a short colour-script word;
//        focus (title only): {x0, x1, y0, y1, k}, the stage, mic and duo's bounding box in stage px and its layer parallax factor (the menu column clears it)
//   ART.scene.ids -> [ids]                the scene ids that have real art (all of DATA.LISTS.scenes)
//   ART.scene.lastError -> string | null  the message of the last caught drawing error (tests assert it stays null)
//   ART.scene.DESIGN = {w: 1280, h: 720, ground: 520}
//   Gallery sheets: `scenes` (all of them small, in a grid), `scene_<id>` for every id (large; params guides=1 draws the ground line and HUD
//   zones, actors=1 stands the heroes and an Act's enemies on their marks, px=N sets parallaxX, particles=N, rung=1), `logo` (the stacked logo,
//   the RJ monogram at five sizes, the one-line logo on a poster, small logos over one loop), `title_anim` (a film strip of the title over t).
//
// HOW IT IS BUILT
//   A scene is an ordered list of items. A LAYER is painted ONCE into a cached ART.sprite (only as large as it needs to be: a lamp post at
//   the edge is a 300 px sprite, not a full screen) at the backing scale of the draw size, then composited every frame with a parallax offset that is
//   snapped to whole device pixels (an aligned blit is a plain copy, a fractional one is resampled, which is slow on a CPU canvas). Layers may also
//   scroll (seamless mist, clouds), be drawn additively (god rays) or with multiply (the boss colour grade), breathe in alpha, or be baked at a lower
//   resolution when they are soft anyway. The washi grain is baked into the big painted layers (source-atop), so no full-screen grain pass runs per
//   frame; the Hocus Vocus screen scenes (title, camp, shop, event, treasure, victory, defeat) pass grain: false (the chibi look has none). A layer may
//   hop with dy(T) (the treasure box). An ANIM item draws the cheap moving things live: particles (one setTransform + drawImage each), flames, lanterns, reflections cut into
//   strips, lightning. Combat scenes bake at up to 1.5x on a 2x display so they leave room in the sprite cache for the heroes and enemies.
//   Everything is a pure function of (scene id, size, t, opts, ART.tk.opt): seeded streams, no clock, no banned random call. Quality 'low' halves the layer
//   resolution and the particle counts, drops halftone and the cosmetic layers (rays, bokeh, mist, grain); reduceMotion slows every drift to 0.3 and
//   removes flashes and parallax. The first draw of a scene bakes its layers (about 100 to 300 ms): call ART.scene.warm(id, w, h) while a screen loads.
(() => {
  'use strict';
  const tk = ART.tk, pal = tk.pal;
  const TAU = Math.PI * 2, PI = Math.PI;
  const num = tk.num, clamp = tk.clamp, lerp = tk.lerp;
  const DW = 1280, DH = 720, GROUND = 520;                       // the design space every scene is composed in
  const cA = (a) => (a >= 0 ? (a <= 1 ? a : 1) : 0);
  const A = (hex, a) => tk.rgba(hex, a);                         // '#rrggbb' + alpha -> rgba() string (cached)
  const mixc = (a, b, k) => U.color.mix(a, b, clamp(k, 0, 1));
  const lite = (a, k) => U.color.lighten(a, k);
  const shd = (a, k) => tk.shade(a, k);
  const R = (...k) => tk.rng('scn', ...k);                       // seeded stream
  const nz = (x, y, sd, oct) => U.noise.fbm(x, y, sd, oct || 3); // smooth 0..0.875
  const wrapv = (v, lo, span) => lo + (((v - lo) % span) + span) % span;
  const ss = (a, b, v) => { const k = clamp((v - a) / (b - a || 1), 0, 1); return k * k * (3 - 2 * k); };

  // ---------------------------------------------------------------------------------------------------------------
  // small painters shared by every scene (all in design space, g is any 2d context)
  // ---------------------------------------------------------------------------------------------------------------
  function poly(g, pts) {                                        // straight-edged path (no fill)
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
  }
  function fillPoly(g, pts, fill) { poly(g, pts); g.fillStyle = fill; g.fill(); }
  function fillRectG(g, x, y, w, h, stops, vertical) {           // gradient rectangle; stops [[0, hex or rgba], ...]
    g.fillStyle = vertical === false ? tk.lin(g, x, y, x + w, y, stops) : tk.lin(g, x, y, x, y + h, stops);
    g.fillRect(x, y, w, h);
  }
  // a ridge line sampled from fbm noise: [[x, y], ...] from x0 to x1
  function ridgePts(sd, x0, x1, base, amp, freq, o) {
    o = o || {};
    const step = o.step || 14, pts = [];
    for (let x = x0; x <= x1 + step; x += step) {
      const n = nz(x * freq, sd * 0.37, sd, o.oct || 3);
      pts.push([x, base - amp * (n - 0.4) * 2 + (o.tilt || 0) * (x - x0) / (x1 - x0 || 1)]);
    }
    return pts;
  }
  function fillRidge(g, pts, bottom, fill) {
    g.beginPath();
    g.moveTo(pts[0][0], bottom);
    for (let i = 0; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.lineTo(pts[pts.length - 1][0], bottom);
    g.closePath();
    g.fillStyle = fill; g.fill();
  }
  // a soft elliptical blob (radial gradient), used for mist, clouds' haze and glows baked into layers
  function blob(g, x, y, rx, ry, color, a) {
    if (!(rx > 0.5) || !(ry > 0.5)) return;
    g.save(); g.translate(x, y); g.scale(1, ry / rx);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    gr.addColorStop(0, A(color, a)); gr.addColorStop(0.5, A(color, a * 0.5)); gr.addColorStop(1, A(color, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill();
    g.restore();
  }
  function disc(g, x, y, r, fill) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = fill; g.fill(); }
  function ellip(g, x, y, rx, ry, fill, rot) { g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU); g.fillStyle = fill; g.fill(); }
  // 4-point sparkle drawn as a plain filled star (cheap, no glow), for baked layers
  function star4(g, x, y, r, fill, rot) {
    g.save(); g.translate(x, y); g.rotate(rot || 0);
    g.beginPath();
    g.moveTo(0, -r); g.quadraticCurveTo(r * 0.12, -r * 0.12, r, 0); g.quadraticCurveTo(r * 0.12, r * 0.12, 0, r);
    g.quadraticCurveTo(-r * 0.12, r * 0.12, -r, 0); g.quadraticCurveTo(-r * 0.12, -r * 0.12, 0, -r); g.closePath();
    g.fillStyle = fill; g.fill(); g.restore();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // glow sprites and additive drawing for live items
  // ---------------------------------------------------------------------------------------------------------------
  function glowSpr(hex) {
    return ART.sprite('sc|glow|' + hex, 64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, A(lite(hex, 0.55), 1)); gr.addColorStop(0.22, A(hex, 0.72)); gr.addColorStop(0.55, A(hex, 0.2)); gr.addColorStop(1, A(hex, 0));
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    });
  }
  // additive glow at (x, y); call inside addMode() so the composite op is switched once for a whole batch
  function glowAt(ctx, x, y, r, hex, a) {
    if (!(r > 0.5) || !(a > 0.004)) return;
    ART.blit(ctx, glowSpr(hex), x - r, y - r, r * 2, r * 2, a);
  }
  function addMode(ctx, fn) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; fn(ctx); ctx.restore(); }
  // a small ellipse-shaped additive glow (flames, water glints)
  function glowE(ctx, x, y, rx, ry, hex, a) {
    if (!(rx > 0.5) || !(ry > 0.5) || !(a > 0.004)) return;
    ART.blit(ctx, glowSpr(hex), x - rx, y - ry, rx * 2, ry * 2, a);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // per-index particle parameters, generated once and cached (hashing a string per particle per frame would cost a millisecond)
  // ---------------------------------------------------------------------------------------------------------------
  const PSETS = new Map();
  function pset(key, n, gen) {
    let a = PSETS.get(key);
    n *= 2;                                                       // opts.particles goes up to 2, so every set holds double the base count
    if (!a || a.length < n) {
      const r = R('pset', key);
      a = [];
      for (let i = 0; i < n; i++) a.push(gen(r, i));
      PSETS.set(key, a);
    }
    return a;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // the scene machinery: layers baked into sprites, anim items drawn live
  // ---------------------------------------------------------------------------------------------------------------
  const SCENES = {};                                             // id -> {id, combat, mood, items}
  const layer = (name, rect, f, draw, o) => Object.assign({ isLayer: true, name, rect, f: f || 0, draw }, o);
  const anim = (fn) => ({ isAnim: true, fn });
  const full = (y, h) => ({ x: 0, y: y || 0, w: DW, h: h === undefined ? DH - (y || 0) : h });
  const PAR = 90;                                                // clamp of parallaxX, and the pad every parallax layer bakes on each side
  let lastError = null;
  const warned = {};

  function layerSprite(L, rr, T) {
    const k = (T.low ? 0.5 : 1) * (L.q || 1) * T.cap;
    const key = 'sc|' + (L.sk || T.sid) + '|' + L.name + '|' + Math.round(T.s * 1000) + '|' + k + (L.vary ? '|' + L.vary(T) : '');
    const grainy = !T.low && L.grain !== false && !L.add && !L.op && !L.scroll && (L.q || 1) === 1;
    return ART.sprite(key, rr.w * T.s * k, rr.h * T.s * k, (g) => {
      g.scale(T.s * k, T.s * k);
      g.translate(-rr.x, -rr.y);
      L.draw(g, rr, T);
      // the washi grain is baked into the big painted layers (only where they have paint), so no full-screen grain pass runs per frame
      if (grainy) tk.paperGrain(g, rr.x, rr.y, rr.w, rr.h, { alpha: L.grain || 0.2, blend: 'source-atop' });
    });
  }
  function layerGeom(L) {                                        // the sprite rectangle: the layer's rect plus the parallax pad on both sides
    const r = L.rect, pad = L.f > 0 ? Math.ceil(PAR * L.f) + 2 : 0;
    return { x: r.x - pad, y: r.y, w: r.w + 2 * pad, h: r.h };
  }
  function blitLayer(ctx, T, L) {
    if (T.low && L.fx) return;                                    // cosmetic layers (rays, bokeh, mist) drop out at quality 'low'
    const r = L.rect, f = L.f, rr = layerGeom(L);
    let a = L.alpha === undefined ? 1 : (typeof L.alpha === 'function' ? L.alpha(T) : L.alpha);
    if (!(a > 0.003)) return;
    const spr = layerSprite(L, rr, T);
    const rot = L.rot ? L.rot(T) : 0;                              // a layer may swing about a pivot
    if (rot) { const px = L.pivot[0] - T.par * f, py = L.pivot[1]; ctx.save(); ctx.translate(px, py); ctx.rotate(rot); ctx.translate(-px, -py); }
    let y = rr.y + (L.bob ? Math.sin(T.tt * L.bob[1] + (L.bob[2] || 0)) * L.bob[0] : 0) + (L.dy ? num(L.dy(T), 0) : 0);   // dy(T): a layer may hop (the Gift Box)
    const op = L.add ? 'lighter' : L.op;
    if (op) { ctx.save(); ctx.globalCompositeOperation = op; }
    if (L.scroll) {
      const off = wrapv(T.tt * L.scroll + T.par * f, 0, r.w);
      ART.blit(ctx, spr, r.x - off, y, r.w, rr.h, a);
      ART.blit(ctx, spr, r.x - off + r.w, y, r.w, rr.h, a);
    } else {
      // snap the destination to whole device pixels: a sprite blitted at a fractional offset is resampled (slow on a CPU canvas), an aligned one is a copy
      let x = rr.x - T.par * f;
      if (!L.bob) { x = Math.round(x * T.q) / T.q; y = Math.round(y * T.q) / T.q; }
      ART.blit(ctx, spr, x, y, rr.w, rr.h, a);
    }
    if (op) ctx.restore();
    if (rot) ctx.restore();
  }
  // the time context every anim item receives
  function makeT(sid, w, h, t, o) {
    const mot = tk.motion(), low = tk.lowQ();
    t = num(t, 0);
    let pf = o.particles === undefined ? 1 : (o.particles === true ? 1 : o.particles === false ? 0 : num(o.particles, 1));
    pf = clamp(pf, 0, 2) * (mot < 1 ? 0.3 : 1) * (low ? 0.6 : 1);
    const def = SCENES[sid];
    const sway = def && def.sway !== undefined ? def.sway : 9;
    const par = mot < 1 ? 0 : clamp(num(o.parallaxX, 0), -PAR, PAR) + Math.sin(t * 0.21) * sway;
    const s = Math.max(w / DW, h / DH);
    // combat scenes share the sprite cache with the heroes and enemies, so on a 2x display their layers are baked at up to 1.5x (backgrounds are soft anyway)
    const cap = def && def.cap ? Math.min(1, def.cap / (ART.res > 0 ? ART.res : 1)) : 1;
    return { sid, cap, t, tt: t * mot, mot, low, pf, par, s, q: s * (ART.res > 0 ? ART.res : 1), w, h, ox: (w - DW * s) / 2, oy: (h - DH * s) / 2, o, def };
  }
  function drawScene(ctx, sid, w, h, t, o) {
    const def = SCENES[sid];
    const T = makeT(sid, w, h, t, o);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    ctx.translate(T.ox, T.oy); ctx.scale(T.s, T.s);
    const items = def.items;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it) continue;
      if (it.isLayer) blitLayer(ctx, T, it); else it.fn(ctx, T);
    }
    ctx.restore();
  }
  function fallbackScene(ctx, id, w, h) {
    tk.sky(ctx, 0, 0, w, h, 'night');
    ctx.save();
    ctx.font = '600 14px ' + tk.font.ui; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = A(pal.paper, 0.7); ctx.fillText('scene ' + String(id).slice(0, 24) + '?', 10, 10);
    ctx.restore();
  }


  // ---------------------------------------------------------------------------------------------------------------
  // scenery painters: ridge heights, ink stems and grass tufts. Design space.
  // ---------------------------------------------------------------------------------------------------------------
  // y of a polyline ridge at x (linear interpolation)
  function ridgeY(pts, x) {
    for (let i = 1; i < pts.length; i++) if (pts[i][0] >= x) { const a = pts[i - 1], b = pts[i], k = (x - a[0]) / (b[0] - a[0] || 1); return lerp(a[1], b[1], k); }
    return pts[pts.length - 1][1];
  }

  // a stem (ribbon-like tapering stroke) drawn as ink: pts [[x,y]...]
  function branch(g, pts, w, col, o) {
    o = o || {};
    tk.inkPath(g, pts, { w: w + (o.outline === undefined ? 4 : o.outline), color: pal.ink, taper: 0.05, taperStart: 0, wobble: 0.08, pressure: 'head', seed: o.seed || 1 });
    tk.inkPath(g, pts, { w, color: col, taper: 0.05, taperStart: 0, wobble: 0.08, pressure: 'head', seed: o.seed || 1 });
    if (o.hi) tk.inkPath(g, pts.map((p) => [p[0] + w * 0.18, p[1] - w * 0.1]), { w: w * 0.28, color: o.hi, taper: 0.3, taperStart: 0.05, wobble: 0.05, pressure: 'head', seed: (o.seed || 1) + 2, alpha: 0.9 });
  }


  // a tuft of grass blades: base point (x, y), height h, n blades
  function grass(g, x, y, h, n, col, sd, lean) {
    const r = R('grass', sd);
    g.fillStyle = col;
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const dx = (i - (n - 1) / 2) * (h * 0.11) + (r() - 0.5) * h * 0.05, hh = h * (0.55 + 0.6 * r()), bend = ((r() - 0.5) * 0.9 + (lean || 0)) * h * 0.45, wd = Math.max(0.9, h * 0.045);
      g.moveTo(x + dx - wd, y);
      g.quadraticCurveTo(x + dx + bend * 0.3, y - hh * 0.6, x + dx + bend, y - hh);
      g.quadraticCurveTo(x + dx + bend * 0.5 + wd * 0.5, y - hh * 0.5, x + dx + wd, y);
    }
    g.fill();
  }


  // ---------------------------------------------------------------------------------------------------------------
  // shared scene pieces: haze bands, the soft vignette + HUD shade layer, god rays, water reflections
  // ---------------------------------------------------------------------------------------------------------------
  const X0 = -PAR - 8, XW = DW + 2 * PAR + 16;                   // a horizontal span that also covers the parallax pad of a layer
  function haze(g, y0, y1, col, aTop, aBot) { fillRectG(g, X0, y0, XW, y1 - y0, [[0, A(col, aTop)], [1, A(col, aBot)]]); }
  function wrapDraw(cx, half, fn) { for (let k = -1; k <= 1; k++) { const x = cx + k * DW; if (x + half > -20 && x - half < DW + 20) fn(x); } }

  // The last static layer of a scene: a soft elliptical vignette and, for combat scenes, the darkening band below the ground line so the HUD
  // and the hand stay readable. It is baked at low resolution (q) because it is only smooth gradients. o: color alpha hud hudFrom hudColor inner
  function vigLayer(name, o) {
    o = o || {};
    return layer(name, full(0), 0, (g) => {
      const col = o.color || pal.ink;
      g.save(); g.translate(DW / 2, DH / 2); g.scale(1, 0.74);
      const gr = g.createRadialGradient(0, 0, DW * (o.inner === undefined ? 0.3 : o.inner), 0, 0, DW * 0.68);
      gr.addColorStop(0, A(col, 0)); gr.addColorStop(1, A(col, o.alpha === undefined ? 0.5 : o.alpha));
      g.fillStyle = gr; g.fillRect(-DW, -DH, DW * 2, DH * 2);
      g.restore();
      if (o.hud) {
        const hc = o.hudColor || pal.ink, y0 = o.hudFrom === undefined ? GROUND - 4 : o.hudFrom;
        fillRectG(g, 0, y0, DW, DH - y0, [[0, A(hc, 0)], [0.35, A(hc, o.hud * 0.55)], [1, A(hc, o.hud)]]);
        blob(g, DW / 2, DH + 30, DW * 0.62, 190, hc, o.hud * 0.55);
      }
      if (o.top) fillRectG(g, 0, 0, DW, 150, [[0, A(o.topColor || pal.ink, o.top)], [1, A(o.topColor || pal.ink, 0)]]);
    }, { q: 0.3 });
  }
  const grain = () => null;                                        // kept so scenes read the same: the grain is baked into the big layers (layerSprite)

  // Soft god-ray layer: shafts fan out from (sx, sy) at the given angles (degrees, canvas orientation), additive. Each shaft is three nested
  // triangles (feathered edges) that fade in away from the source, so there is never a hard starburst point.
  function raysLayer(name, sx, sy, angles, widthDeg, color, a, o) {
    o = o || {};
    return layer(name, full(0), 0, (g) => {
      const R2 = 1500, r0 = o.r0 === undefined ? 140 : o.r0;
      angles.forEach((deg, i) => {
        const wv = widthDeg * (0.7 + 0.6 * (((i * 7) % 5) / 4));
        for (let k = 0; k < 3; k++) {
          const ww = wv * (1.7 - k * 0.55) * PI / 180, ak = 0.32 + k * 0.3;
          const am = deg * PI / 180, a0 = am - ww / 2, a1 = am + ww / 2;
          const ex = sx + Math.cos(am) * R2, ey = sy + Math.sin(am) * R2;
          g.fillStyle = tk.lin(g, sx + Math.cos(am) * r0 * 0.5, sy + Math.sin(am) * r0 * 0.5, ex, ey, [[0, A(color, 0)], [0.1, A(color, 0.9 * ak)], [0.4, A(color, 0.34 * ak)], [0.78, A(color, 0)]]);
          g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + Math.cos(a0) * R2, sy + Math.sin(a0) * R2); g.lineTo(sx + Math.cos(a1) * R2, sy + Math.sin(a1) * R2); g.closePath(); g.fill();
        }
      });
      (o.bokeh || []).forEach((p, i) => {                        // lens-flare bokeh discs share the sprite with the rays: one additive full-screen blit instead of two
        disc(g, p[0], p[1], p[2], A(o.bokehColor || color, 0.4 * (0.6 + 0.4 * ((i * 5) % 3) / 2)));
        g.beginPath(); g.arc(p[0], p[1], p[2], 0, TAU); g.lineWidth = Math.max(1.2, p[2] * 0.06); g.strokeStyle = A(lite(o.bokehColor || color, 0.5), 0.6); g.stroke();
      });
    }, { q: 0.4, add: true, fx: true, alpha: (T) => a * (1 + (o.pulse === undefined ? 0.2 : o.pulse) * Math.sin(T.tt * 0.45 + (o.phase || 0))) });
  }


  // Water reflection of a baked layer: the layer's sprite is mirrored about y = mirrorY into `depth` px of water, cut into thin strips that
  // wobble sideways (more with distance), then faded. squash < 1 compresses the reflection. alpha is the strength.
  function reflectAnim(L, mirrorY, depth, alpha, o) {
    o = o || {};
    return anim((ctx, T) => {
      const rr = layerGeom(L), spr = layerSprite(L, rr, T);
      if (!spr || spr._inert || !spr.width) return;
      const kx = spr.width / rr.w, ky = spr.height / rr.h, sq = o.squash || 0.9, N = T.low ? 10 : 22, hs = depth / N, amp = (o.amp || 5) * T.mot;
      const x = rr.x - T.par * L.f;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, mirrorY, DW, depth); ctx.clip();
      for (let i = 0; i < N; i++) {
        const d0 = i * hs, sy = (mirrorY - (i + 1) * hs * sq - rr.y) * ky, sh = hs * sq * ky;
        if (sy + sh < 0 || sy > spr.height) continue;
        const cy = Math.max(0, sy), ch = Math.min(spr.height, sy + sh) - cy;
        if (!(ch > 0.5)) continue;
        const wob = Math.sin(T.tt * 1.7 + i * 0.85 + (o.ph || 0)) * amp * (0.25 + i / N) + Math.sin(T.tt * 0.9 + i * 2.1) * amp * 0.4;
        ctx.globalAlpha = alpha * (1 - 0.65 * (i / N));
        ctx.drawImage(spr, 0, cy, spr.width, ch, x + wob, mirrorY + d0, rr.w, hs + 0.8);
      }
      ctx.restore();
    });
  }


  // ---------------------------------------------------------------------------------------------------------------
  // particles: drifting sprites (petals and leaves), twinkling stars and fireflies. Parameters come from cached per-index sets.
  // ---------------------------------------------------------------------------------------------------------------
  const mkSpr = (key, w, h, fn) => ART.sprite('sc|' + key, w, h, fn);       // fixed-size sprite, independent of the scene scale

  function petalSpr(hex, variant) {
    return mkSpr('petal|' + hex + '|' + (variant || 0), 32, 32, (g) => {
      g.translate(16, 16);
      const s = 12.5;
      const shape = [[0, -s, 1], [s * 0.75, -s * 0.55], [s * 0.7, s * 0.4], [0, s * 0.9, 1], [-s * 0.7, s * 0.4], [-s * 0.75, -s * 0.55]];
      tk.celFill(g, shape, hex, { line: 1.6, lineColor: mixc(shd(hex), pal.ink, 0.35), depth: 4, hi: false, tension: 0.8, shadow: shd(hex, 0.25) });
      g.globalAlpha = 0.85; g.fillStyle = lite(hex, 0.75);
      g.beginPath(); g.ellipse(-s * 0.18, -s * 0.28, s * 0.14, s * 0.32, 0.35, 0, TAU); g.fill();
      // the little notch at the tip of a sakura petal
      g.globalAlpha = 1; g.strokeStyle = A(shd(hex, 0.5), 0.8); g.lineWidth = 1; g.beginPath(); g.moveTo(0, s * 0.9); g.lineTo(0, s * 0.62); g.stroke();
    });
  }
  function leafSpr(base, variant) {
    return mkSpr('leafp|' + base + '|' + (variant || 0), 48, 20, (g) => {
      g.translate(4, 10);
      tk.celFill(g, [[0, 0, 1], [10, -6.5], [26, -5], [40, 0, 1], [26, 5.5], [10, 6.2]], base, { line: 1.5, lineColor: mixc(shd(base), pal.ink, 0.4), depth: 3, hi: false, tension: 0.7, shadow: shd(base, 0.25) });
      g.globalAlpha = 0.6; tk.inkStroke(g, 3, 0, 36, 0, { w: 0.9, color: pal.ink, taper: 0.3, wobble: 0 });
    });
  }

  // Drifting sprites that wrap around an area. cfg: key, n, sprs (array of sprites, picked per particle), area {x,y,w,h}, vx, vy (px/s), sway (px),
  // size [min, max] (px), aspect (h / w of the sprite), tumble, spin, alpha [min, max], add. Each particle is one setTransform, one alpha write and
  // one drawImage (the combined matrix is computed by hand), because a scene has dozens of them per frame.
  function drift(ctx, T, cfg) {
    const n = Math.round(cfg.n * T.pf);
    if (n <= 0) return;
    const P = pset('drift|' + cfg.key, cfg.n, (r) => ({ x: r(), y: r(), sp: 0.55 + r() * 0.9, sz: r(), ph: r() * TAU, fq: 0.5 + r() * 1.3, k: r(), rot: r() * TAU, rs: (r() - 0.5) * 2, al: r() }));
    const a = cfg.area, m = 50, tt = T.tt, sw = cfg.sway || 0, asp = cfg.aspect || 1, al = cfg.alpha || [0.7, 1], ga = ctx.globalAlpha;
    const M = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
    ctx.save();
    if (cfg.add) ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const p = P[i];
      const x = wrapv(a.x + p.x * a.w + cfg.vx * p.sp * tt + Math.sin(tt * p.fq + p.ph) * sw, a.x - m, a.w + 2 * m);
      const y = wrapv(a.y + p.y * a.h + cfg.vy * p.sp * tt + Math.cos(tt * p.fq * 0.8 + p.ph) * sw * 0.35, a.y - m, a.h + 2 * m);
      const sz = lerp(cfg.size[0], cfg.size[1], p.sz), sp = cfg.sprs[Math.floor(p.k * cfg.sprs.length) % cfg.sprs.length];
      if (!sp || sp._inert) continue;
      const fade = cfg.fade === false ? 1 : Math.min(1, ss(a.x - m, a.x + 20, x) * ss(a.x + a.w + m, a.x + a.w - 20, x) * ss(a.y - m, a.y + 10, y) * ss(a.y + a.h + m, a.y + a.h - 10, y) * 1.4);
      const alpha = lerp(al[0], al[1], p.al) * fade;
      if (!(alpha > 0.02)) continue;
      const rot = p.rot + (cfg.spin || 0) * tt * p.rs + Math.sin(tt * p.fq * 1.3 + p.ph) * (cfg.wob === undefined ? 0.5 : cfg.wob), cs = Math.cos(rot), sn = Math.sin(rot), sx = cfg.tumble ? 0.18 + 0.82 * Math.abs(Math.cos(tt * p.fq * 1.7 + p.ph)) : 1;
      ctx.globalAlpha = ga * cA(alpha);
      if (M) ctx.setTransform(M.a * cs * sx + M.c * sn * sx, M.b * cs * sx + M.d * sn * sx, -M.a * sn + M.c * cs, -M.b * sn + M.d * cs, M.a * x + M.c * y + M.e, M.b * x + M.d * y + M.f);
      else { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sx, 1); }
      ctx.drawImage(sp, -sz / 2, -sz * asp / 2, sz, sz * asp);
      if (!M) ctx.restore();
    }
    ctx.restore();
  }

  // Twinkling stars from cached sprites. cfg: key, n, area {x, y, w, h} (default the top of the stage: h), gold (share of warm stars)
  function twinkle(ctx, T, cfg) {
    const n = Math.round(cfg.n * (T.low ? 0.6 : 1));
    const P = pset('tw|' + cfg.key, cfg.n, (r) => ({ x: r(), y: Math.pow(r(), 1.2), s: 0.7 + r() * 1.6, ph: r() * TAU, fq: 0.8 + r() * 2, gold: r() < (cfg.gold === undefined ? 0.2 : cfg.gold), big: r() < 0.28 }));
    const dot = [mkSpr('dot|w', 8, 8, (g) => { disc(g, 4, 4, 3, '#ffffff'); }), mkSpr('dot|g', 8, 8, (g) => { disc(g, 4, 4, 3, '#ffe9a8'); })];
    const star = [mkSpr('star|w', 24, 24, (g) => { star4(g, 12, 12, 11, '#ffffff'); disc(g, 12, 12, 2.4, '#ffffff'); }), mkSpr('star|g', 24, 24, (g) => { star4(g, 12, 12, 11, '#ffe9a8'); disc(g, 12, 12, 2.4, '#ffffff'); })];
    const a = cfg.area || { x: 0, y: 0, w: DW, h: cfg.h || 320 }, ga = ctx.globalAlpha;
    for (let i = 0; i < Math.min(n, P.length); i++) {
      const p = P[i], tw = 0.5 + 0.5 * Math.sin(T.tt * p.fq + p.ph), al = 0.3 + 0.7 * tw;
      ctx.globalAlpha = ga * cA(al * (0.5 + 0.4 * p.s / 2.3));
      const x = a.x + p.x * a.w, y = a.y + p.y * a.h;
      if (p.big) { const r = p.s * (2.2 + 2 * tw); ART.blit(ctx, star[p.gold ? 1 : 0], x - r, y - r, r * 2, r * 2); } else { const r = p.s * 0.9; ART.blit(ctx, dot[p.gold ? 1 : 0], x - r, y - r, r * 2, r * 2); }
    }
    ctx.globalAlpha = ga;
  }

  // Fireflies: glowing motes on lazy Lissajous paths that blink. cfg: key, n, area, color, size (glow radius), core (bright centre colour), speed
  function fireflies(ctx, T, cfg) {
    const n = Math.round(cfg.n * T.pf);
    if (n <= 0) return;
    const P = pset('fly|' + cfg.key, cfg.n, (r) => ({ x: r(), y: r(), ax: 20 + r() * 50, ay: 12 + r() * 30, fx: 0.15 + r() * 0.35, fy: 0.2 + r() * 0.4, ph: r() * TAU, ph2: r() * TAU, bl: 0.5 + r() * 1.2, sz: 0.6 + r() * 0.7 }));
    const a = cfg.area, tt = T.tt * (cfg.speed || 1), col = cfg.color || '#d8ff7a';
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const p = P[i];
      const x = a.x + p.x * a.w + Math.sin(tt * p.fx + p.ph) * p.ax, y = a.y + p.y * a.h + Math.sin(tt * p.fy + p.ph2) * p.ay;
      const b = Math.pow(0.5 + 0.5 * Math.sin(T.tt * p.bl + p.ph), 2);
      const al = 0.2 + 0.8 * b;
      glowAt(ctx, x, y, (cfg.size || 12) * p.sz * (0.7 + 0.5 * b), col, 0.8 * al);
      glowAt(ctx, x, y, (cfg.size || 12) * p.sz * 0.28, cfg.core || '#ffffff', al);
    }
    ctx.restore();
  }


  // ===============================================================================================================
  // HOCUS VOCUS HOUSE PIECES for the screen scenes (title, camp, shop, event, treasure, victory, defeat, paper) and the logo. The owners' chibi
  // cast is the style authority: an even warm-brown line with a slight taper, flat cel colour with ONE hard warm shadow on the lower left (the key
  // light is upper right), a thin highlight, round bouncy shapes and candy colours on the deep indigo night. No halftone, no grain, no brush ink.
  // Backgrounds keep soft gradients, glows and bokeh. The Gloss (the polite antagonist) is an opalescent pastel film with a diagonal highlight
  // sweep, airbrushed edges and never an outline.
  // ===============================================================================================================
  const OL = '#2d170f';                                              // the cast's warm outline (kit RJ.C.ink)
  const HV = {
    pink: '#ff7eb6', pinkL: '#ffc2dc', pinkD: '#c93f78', pinkB: '#ff5fa2', green: '#3fcf6a', lime: '#c6ff3d', greenD: '#1f8a3e',
    cream: '#fff8ec', gold: '#ffd84d', teal: '#2ec4b6', tealD: '#0d4f4a', tealL: '#e6fffb', red: '#c8264f', redD: '#8f1838', bulb: '#fff4d6',
    peach: '#ffb38a', violet: '#a77bff', orange: '#ff9a2e', chrome: '#c9cbd6', sky: '#7cc6ff', tomato: '#e8553f', mint: '#8fe3c0',
  };
  const GL = ['#f4f1fb', '#e6d9ff', '#d9fff4', '#ffe3f1'];          // the Gloss: opal, lilac sheen, mint sheen, blush sheen
  const HSLC = new Map();
  // the warm cel shadow of the cast (kit RJ.shade): a little darker, a little more saturated, hue nudged toward red
  function wsh(hex, dl) {
    const key = hex + '|' + dl;
    let v = HSLC.get(key);
    if (v) return v;
    const c = U.color.rgb(hex), r = c[0] / 255, gg = c[1] / 255, b = c[2] / 255, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = (mx === r ? (gg - b) / d + (gg < b ? 6 : 0) : mx === gg ? (b - r) / d + 2 : (r - gg) / d + 4) * 60; }
    v = U.color.hsl(h - 5, clamp(s * 1.06, 0, 1), clamp(l - (dl === undefined ? 0.13 : dl), 0, 1));
    if (HSLC.size > 600) HSLC.clear();
    HSLC.set(key, v);
    return v;
  }
  const tint = (hex, k) => U.color.mix(hex, '#ffffff', k === undefined ? 0.4 : k);
  // a cel shape in the cast's look (tk.celFill with the house defaults: warm line, warm shadow, no screen tone)
  function cel(g, shape, base, o) {
    tk.celFill(g, shape, base, Object.assign({ line: 2.6, lineColor: OL, wobble: 0.02, weightVar: 0.3, hi: false, hiW: 2.2, hiAlpha: 0.75, shadow: wsh(base), halftone: false, tension: 0.5 }, o));
  }
  const rect4 = (x, y, w, h) => ({ poly: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]] });
  const rrect = (x, y, w, h, r) => tk.rrectPts(x, y, w, h, r);
  // an open warm line
  function oline(g, pts, w, o) { tk.inkPath(g, pts, Object.assign({ w: w || 2.4, color: OL, taper: 0.1, wobble: 0.02, pressure: 'flat' }, o)); }
  // round things under ONE outline (the kit's RJ.blob recipe): circles [[x, y, r], ...]. An outline pass, a shade pass, the base shifted toward
  // the light (so a crescent of shade stays on the lower left), then a small highlight. o: lw, line, shade, hi (false for none), lit
  function puffs(g, cs, base, o) {
    o = o || {};
    const lw = o.lw === undefined ? 2.4 : o.lw, sh = o.shade || wsh(base), hi = o.hi === undefined ? tint(base, 0.5) : o.hi, lit = o.lit || 0.09;
    g.save();
    if (lw > 0) { g.fillStyle = o.line || OL; g.beginPath(); cs.forEach((c) => { g.moveTo(c[0] + c[2] + lw, c[1]); g.arc(c[0], c[1], c[2] + lw, 0, TAU); }); g.fill(); }
    g.fillStyle = sh; g.beginPath(); cs.forEach((c) => { g.moveTo(c[0] + c[2], c[1]); g.arc(c[0], c[1], c[2], 0, TAU); }); g.fill();
    g.fillStyle = base; g.beginPath(); cs.forEach((c) => { const k = c[2] * lit, rr = Math.max(0.5, c[2] - k * 1.45); g.moveTo(c[0] + k + rr, c[1] - k); g.arc(c[0] + k, c[1] - k, rr, 0, TAU); }); g.fill();
    if (hi) { g.fillStyle = hi; g.beginPath(); cs.forEach((c) => { if (c[2] > 7) { g.moveTo(c[0] + c[2] * 0.56, c[1] - c[2] * 0.4); g.ellipse(c[0] + c[2] * 0.38, c[1] - c[2] * 0.42, c[2] * 0.18, c[2] * 0.1, -0.7, 0, TAU); } }); g.fill(); }
    g.restore();
  }
  function star5Path(g, x, y, r, rot, inner) {
    const k = inner || 0.48;
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = (rot || 0) - PI / 2 + i * PI / 5, rr = i % 2 ? r * k : r; if (i) g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath();
  }
  // a chunky outlined five-point star with a warm shadow half
  function star5(g, x, y, r, col, rot, lw) {
    g.save(); g.lineJoin = 'round';
    star5Path(g, x, y, r, rot); g.lineWidth = lw === undefined ? Math.max(1.4, r * 0.16) : lw; g.strokeStyle = OL; g.stroke(); g.fillStyle = col; g.fill();
    g.clip(); g.fillStyle = wsh(col, 0.1); g.beginPath(); g.moveTo(x - r * 2, y + r * 2); g.lineTo(x + r * 2, y - r * 2 + r * 2.4); g.lineTo(x + r * 2, y + r * 2); g.closePath(); g.fill();
    g.restore();
  }
  function heartPath(g, x, y, s) {
    g.beginPath();
    g.moveTo(x, y + s * 0.9);
    g.bezierCurveTo(x - s * 1.25, y + s * 0.05, x - s * 0.75, y - s * 0.95, x, y - s * 0.32);
    g.bezierCurveTo(x + s * 0.75, y - s * 0.95, x + s * 1.25, y + s * 0.05, x, y + s * 0.9);
    g.closePath();
  }
  function heart(g, x, y, s, col, lw) {
    g.save(); g.lineJoin = 'round';
    heartPath(g, x, y, s); g.lineWidth = lw === undefined ? Math.max(1.2, s * 0.22) : lw; g.strokeStyle = OL; if (g.lineWidth > 0) g.stroke(); g.fillStyle = col; g.fill();
    g.clip(); g.fillStyle = wsh(col, 0.1); g.beginPath(); g.ellipse(x - s * 0.55, y + s * 0.5, s * 0.8, s * 0.6, 0, 0, TAU); g.fill();
    g.fillStyle = A('#ffffff', 0.8); g.beginPath(); g.ellipse(x + s * 0.42, y - s * 0.38, s * 0.2, s * 0.12, -0.6, 0, TAU); g.fill();
    g.restore();
  }
  // a sagging string between two points (a catenary-like parabola), sampled: [[x, y], ...]
  function sagPts(x0, y0, x1, y1, sag, n) {
    const out = [];
    for (let i = 0; i <= n; i++) { const u = i / n; out.push([lerp(x0, x1, u), lerp(y0, y1, u) + sag * 4 * u * (1 - u)]); }
    return out;
  }
  // bunting: a sagging cord with outlined pennants in rotating colours
  function bunting(g, x0, y0, x1, y1, sag, n, cols, size) {
    const pts = sagPts(x0, y0, x1, y1, sag, n * 4);
    oline(g, pts, 1.8, { taper: 0 });
    for (let i = 0; i < n; i++) {
      const u0 = (i + 0.12) / n, u1 = (i + 0.88) / n, ia = Math.round(u0 * n * 4), ib = Math.round(u1 * n * 4);
      const a = pts[ia], b = pts[ib], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      const tip = [mx - dy / L * size * 1.25, my + dx / L * size * 1.25];
      cel(g, { poly: [a, b, tip] }, cols[i % cols.length], { line: 1.8, depth: size * 0.22, tension: 0 });
    }
  }
  // a string of fairy-light bulbs along a sagging wire: the wire and the bulbs (bulb positions returned for the live glow)
  function fairyString(g, x0, y0, x1, y1, sag, gap, cols, r) {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / gap)), pts = sagPts(x0, y0, x1, y1, sag, n), out = [];
    oline(g, pts, 1.4, { taper: 0, color: '#3a2440' });
    for (let i = 1; i < n; i++) {
      const p = pts[i], c = cols[i % cols.length];
      g.fillStyle = OL; g.fillRect(p[0] - r * 0.35, p[1] - 1, r * 0.7, r * 0.8);
      puffs(g, [[p[0], p[1] + r * 1.2, r]], c, { lw: 1.2, hi: '#ffffff' });
      out.push([p[0], p[1] + r * 1.2, c]);
    }
    return out;
  }
  // a five-petal blossom (the logo O, Jasmin's flower): petals pink to light pink, cream centre, five stamen dots. Outlined like a sticker.
  function blossom(g, x, y, r, rot, o) {
    o = o || {};
    const pr = r * 0.46, pd = r * 0.54, cols = [o.c0 || HV.pinkB, o.c1 || HV.pinkL];
    const P = [];
    for (let i = 0; i < 5; i++) { const a = rot - PI / 2 + i * TAU / 5; P.push([x + Math.cos(a) * pd, y + Math.sin(a) * pd, pr, a]); }
    g.save();
    const lw = o.lw === undefined ? Math.max(1, r * 0.09) : o.lw;
    if (lw > 0) { g.fillStyle = OL; g.beginPath(); P.forEach((p) => { g.moveTo(p[0] + p[2] + lw, p[1]); g.arc(p[0], p[1], p[2] + lw, 0, TAU); }); g.fill(); }
    P.forEach((p) => {
      const gr = g.createRadialGradient(x, y, r * 0.1, x, y, r * 1.02); gr.addColorStop(0, cols[0]); gr.addColorStop(1, cols[1]);
      g.fillStyle = gr; g.beginPath(); g.arc(p[0], p[1], p[2], 0, TAU); g.fill();
      // the little notch at the petal tip
      const nx = x + Math.cos(p[3]) * (pd + pr * 0.98), ny = y + Math.sin(p[3]) * (pd + pr * 0.98);
      g.fillStyle = OL; g.beginPath(); g.arc(nx, ny, Math.max(0.6, pr * 0.16), 0, TAU); g.fill();
    });
    // a soft warm shade on the lower-left petals
    g.globalAlpha = 0.35; g.fillStyle = wsh(cols[0], 0.08);
    P.forEach((p) => { if (Math.cos(p[3]) - Math.sin(p[3]) < -0.3) { g.beginPath(); g.arc(p[0] - pr * 0.18, p[1] + pr * 0.18, pr * 0.62, 0, TAU); g.fill(); } });
    g.globalAlpha = 1;
    puffs(g, [[x, y, r * 0.3]], o.centre || HV.cream, { lw: Math.max(0.8, r * 0.05), hi: false });
    for (let i = 0; i < 5; i++) { const a = rot - PI / 2 + TAU / 10 + i * TAU / 5; disc(g, x + Math.cos(a) * r * 0.17, y + Math.sin(a) * r * 0.17, Math.max(0.6, r * 0.055), o.dot || '#ff5fa2'); }
    g.restore();
  }
  // the Gloss as a film: a shape filled with the four opal sheens on a diagonal and a white highlight sweep; no outline, a soft lilac edge
  function glossFill(g, trace, x0, y0, x1, y1, a, bands) {
    g.save();
    g.globalAlpha = g.globalAlpha * (a === undefined ? 0.8 : a);
    g.beginPath(); trace(g);
    g.fillStyle = bands ? tk.lin(g, x0, y0, x1, y1, [[0, '#ffc8e6'], [0.2, '#d8c4ff'], [0.4, '#c4fff0'], [0.6, '#ffd6ec'], [0.8, '#d8c4ff'], [1, '#c4fff0']])
      : tk.lin(g, x0, y0, x1, y1, [[0, '#ffd6ec'], [0.33, '#e0ccff'], [0.66, '#ccfff0'], [1, GL[0]]]);
    g.fill();
    g.clip();
    const w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, L = Math.max(w, h);
    g.fillStyle = tk.lin(g, cx - L * 0.3, cy - L * 0.3, cx + L * 0.3, cy + L * 0.3, [[0, A('#ffffff', 0)], [0.42, A('#ffffff', 0)], [0.5, A('#ffffff', 0.75)], [0.56, A('#ffffff', 0.15)], [0.62, A('#ffffff', 0)], [1, A('#ffffff', 0)]]);
    g.fillRect(x0 - 10, y0 - 10, w + 20, h + 20);
    g.restore();
  }
  // the one shared Gloss smile: a small closed-mouth curve and a sparkle beside it
  function glossSmile(g, x, y, s) {
    g.save(); g.lineCap = 'round';
    g.strokeStyle = A('#b9a6e8', 0.9); g.lineWidth = Math.max(1, s * 0.16);
    g.beginPath(); g.moveTo(x - s * 0.55, y - s * 0.08); g.quadraticCurveTo(x, y + s * 0.42, x + s * 0.55, y - s * 0.08); g.stroke();
    disc(g, x - s * 0.36, y - s * 0.62, Math.max(0.8, s * 0.11), A('#b9a6e8', 0.9)); disc(g, x + s * 0.36, y - s * 0.62, Math.max(0.8, s * 0.11), A('#b9a6e8', 0.9));
    star4(g, x + s * 1.0, y - s * 0.9, s * 0.42, '#ffffff', 0);
    g.restore();
  }
  // Gloss creeping in from the edges: airbrushed blobs on torn outlines (tornBlob), filled with the sheen gradient, no outline, a soft feather
  function tornBlob(g, cx, cy, rx, ry, sd, k) {
    const n = 64, pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, jag = nz(Math.cos(a) * 1.8 + sd, Math.sin(a) * 1.8 + sd, sd, 3), m = k * (0.82 + jag * 0.32);
      pts.push([cx + Math.cos(a) * rx * m, cy + Math.sin(a) * ry * m]);
    }
    return pts;
  }
  function glossCorners(g, spots, k, sd) {
    spots.forEach((s, i) => {
      const pts = tornBlob(g, s[0], s[1], s[2], s[3], sd + i * 13, k);
      // airbrushed: a dozen thin nested passes, so the edge fades instead of stepping; the sheen bands like opal
      for (let j = 0; j < 12; j++) {
        const sc = 1.08 - j * 0.05, sp = pts.map((v) => [s[0] + (v[0] - s[0]) * sc, s[1] + (v[1] - s[1]) * sc]);
        glossFill(g, (c) => tk.trace(c, { poly: sp }), s[0] - s[2] * k, s[1] - s[3] * k, s[0] + s[2] * k, s[1] + s[3] * k, 0.085, true);
      }
      // a few tiny polite sparkles in the film
      const rr = R('gloss-spark', sd, i);
      for (let j = 0; j < 4; j++) { const v = pts[Math.floor(rr() * pts.length)], u = 0.2 + rr() * 0.5; star4(g, s[0] + (v[0] - s[0]) * u, s[1] + (v[1] - s[1]) * u, 3 + rr() * 4, A('#ffffff', 0.9), 0); }
    });
  }
  // soft dust and light: a round dot sprite and a cream note glyph sprite (the title and victory drift)
  function noteSpr(k) {
    return mkSpr('hvnote|' + k, 32, 32, (g) => {
      const kind = ['eighth', 'quarter', 'beamed', 'eighth', 'quarter'][k % 5];
      tk.note(g, kind === 'beamed' ? 13 : 14, 22, 10, { kind, color: OL, rot: k % 5 === 3 ? 0.3 : 0, line: 4.2 });
      tk.note(g, kind === 'beamed' ? 13 : 14, 22, 9, { kind, color: k % 2 ? HV.cream : '#ffe9a8', rot: k % 5 === 3 ? 0.3 : 0, line: 2 });
    });
  }
  function heartSpr(col) { return mkSpr('hvheart|' + col, 32, 32, (g) => heart(g, 16, 16, 10, col, 2.4)); }
  function moteSpr(col) { return mkSpr('hvmote|' + col, 16, 16, (g) => { const gr = g.createRadialGradient(8, 8, 0, 8, 8, 8); gr.addColorStop(0, A(col, 1)); gr.addColorStop(0.4, A(col, 0.5)); gr.addColorStop(1, A(col, 0)); g.fillStyle = gr; g.fillRect(0, 0, 16, 16); }); }
  function sparkSpr(col) { return mkSpr('hvspark|' + col, 24, 24, (g) => { star4(g, 12, 12, 11, col, 0); disc(g, 12, 12, 2.2, '#ffffff'); }); }
  function confettiSpr(col, k) {
    return mkSpr('hvconf|' + col + '|' + k, 20, 20, (g) => {
      g.fillStyle = OL;
      if (k % 3 === 0) { g.fillRect(3, 6, 14, 8); g.fillStyle = col; g.fillRect(4.2, 7.2, 11.6, 5.6); }
      else if (k % 3 === 1) { disc(g, 10, 10, 6.4, OL); disc(g, 10, 10, 5, col); }
      else { star5(g, 10, 10, 7.5, col, 0, 1.3); }
    });
  }
  // a cartoon moon in the cast's look: cream disc, one hard warm shade crescent, flat craters, the warm line
  function hvMoon(g, x, y, r, o) {
    o = o || {};
    blob(g, x, y, r * 3.2, r * 2.8, o.glow || '#b49aff', 0.28);
    blob(g, x, y, r * 1.9, r * 1.8, '#fff4d6', 0.32);
    g.save();
    g.beginPath(); g.arc(x, y, r + 3, 0, TAU); g.fillStyle = OL; g.fill();
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = o.base || '#fff3d2'; g.fill(); g.clip();
    g.beginPath(); g.rect(x - r * 2, y - r * 2, r * 4, r * 4); g.arc(x + r * 0.2, y - r * 0.2, r * 1.0, 0, TAU); g.fillStyle = o.shade || '#f3cf9e'; g.fill('evenodd');
    [[-0.3, -0.25, 0.2], [0.28, 0.12, 0.15], [-0.05, 0.42, 0.12], [0.42, -0.4, 0.09]].forEach((c) => {
      ellip(g, x + c[0] * r, y + c[1] * r, c[2] * r, c[2] * r * 0.86, A('#e9c48e', 0.75));
      ellip(g, x + c[0] * r + c[2] * r * 0.18, y + c[1] * r - c[2] * r * 0.16, c[2] * r * 0.7, c[2] * r * 0.6, A('#fffbe8', 0.5));
    });
    g.restore();
    g.fillStyle = A('#ffffff', 0.85); g.beginPath(); g.ellipse(x + r * 0.5, y - r * 0.55, r * 0.16, r * 0.08, -0.8, 0, TAU); g.fill();
  }
  // stars baked into a sky: dots and a few 4-point sparkles
  function hvStars(g, key, n, y0, y1) {
    const r = R(key);
    for (let i = 0; i < n; i++) { const x = X0 + r() * XW, y = y0 + Math.pow(r(), 1.3) * (y1 - y0), s = 0.8 + r() * 1.6; g.fillStyle = A(r() < 0.25 ? '#ffe9a8' : '#efeaff', 0.35 + 0.5 * r()); g.fillRect(x, y, s, s); }
    for (let i = 0; i < Math.round(n / 9); i++) star4(g, X0 + r() * XW, y0 + Math.pow(r(), 1.4) * (y1 - y0) * 0.8, 3 + r() * 4, A(r() < 0.4 ? '#ffe9a8' : '#ffffff', 0.85), 0);
  }
  // a stage curtain panel, gathered by a gold tie-back. side -1: hangs at the left (outer edge x0, inner edge x1), +1: mirrored.
  // o: tieY (y of the tie-back, null for an open drop), tieIn (how far the tie pulls the inner edge toward the outer), tieSpan (the share of the
  // panel the rope crosses from the inner edge, default all of it), base, shade, folds
  function curtain(g, x0, x1, y0, y1, o) {
    o = o || {};
    const base = o.base || HV.red, sh = o.shade || HV.redD, side = x1 > x0 ? 1 : -1, tieY = o.tieY, tieIn = o.tieIn === undefined ? 0.55 : o.tieIn, folds = o.folds || 5;
    const inner = (y) => {                                            // x of the inner edge at y
      if (tieY === null || tieY === undefined) return x1 + side * Math.sin((y - y0) / (y1 - y0) * PI) * 6;
      if (y < tieY) { const u = (y - y0) / (tieY - y0); return lerp(x1, lerp(x1, x0, tieIn), tk.ease.inOutSine ? tk.ease.inOutSine(u) : u); }
      const u = (y - tieY) / (y1 - tieY); return lerp(lerp(x1, x0, tieIn), x1 + side * 16, Math.pow(u, 0.7));
    };
    const N = 24, edge = [];
    for (let i = 0; i <= N; i++) { const y = lerp(y0, y1, i / N); edge.push([inner(y), y]); }
    const shape = { poly: [[x0, y0]].concat(edge, [[x0, y1 + 2]]) };
    g.save();
    g.beginPath(); tk.trace(g, shape); g.fillStyle = base; g.fill();
    g.clip();
    // the folds: shade bands that follow the gather, each with a lit stripe on its right
    for (let f = 0; f < folds; f++) {
      const u = (f + 0.5) / folds, band = [], hiB = [];
      for (let i = 0; i <= N; i++) {
        const y = lerp(y0, y1, i / N), xi = inner(y), x = lerp(x0, xi, u), wv = Math.abs(xi - x0) / folds;
        band.push([x - wv * 0.3, y]); hiB.push([x + wv * 0.18, y]);
      }
      const bw = [];
      for (let i = 0; i <= N; i++) { const y = lerp(y0, y1, i / N), xi = inner(y), wv = Math.abs(xi - x0) / folds; bw.push([band[i][0] + wv * 0.34, y]); }
      fillPoly(g, band.concat(bw.reverse()), sh);
      tk.inkPath(g, hiB, { w: 2.2, color: A(tint(base, 0.35), 0.75), taper: 0.3, pressure: 'flat', wobble: 0 });
    }
    // the shade where the curtain turns away from the light, and a warm glow along the inner edge from the stage lights
    g.fillStyle = tk.lin(g, x0, 0, x1, 0, [[0, A(wsh(sh, 0.12), 0.55)], [0.5, A(wsh(sh, 0.12), 0)], [1, A('#ffcf8a', 0.18)]]); g.fillRect(Math.min(x0, x1) - 30, y0, Math.abs(x1 - x0) + 60, y1 - y0 + 4);
    g.restore();
    tk.inkPath(g, shape, { closed: true, w: 2.8, color: OL, wobble: 0.02, weightVar: 0.25 });
    // gold hem trim
    oline(g, [[x0, y1 - 4], [inner(y1 - 4), y1 - 4]], 6, { color: OL, taper: 0 });
    oline(g, [[x0, y1 - 4], [inner(y1 - 4), y1 - 4]], 3.4, { color: HV.gold, taper: 0 });
    if (tieY !== null && tieY !== undefined) {                          // the tie-back: a gold rope round the waist and a tassel
      const xi = inner(tieY), xa = o.tieSpan ? lerp(xi, x0, o.tieSpan) : x0 - side * 6, ya = tieY;
      oline(g, [[xa, ya - 4], [lerp(xa, xi, 0.5), ya + 4], [xi + side * 4, ya - 2]], 8, { color: OL, taper: 0 });
      oline(g, [[xa, ya - 4], [lerp(xa, xi, 0.5), ya + 4], [xi + side * 4, ya - 2]], 5, { color: HV.gold, taper: 0 });
      const tx = xi + side * 2, ty = ya + 2;
      cel(g, [[tx - 4, ty, 1], [tx + 4, ty, 1], [tx + 7, ty + 22], [tx, ty + 26], [tx - 7, ty + 22]], HV.gold, { line: 2, depth: 2.5 });
    }
  }

  // ===============================================================================================================
  // TITLE: a little round stage under a huge moon. RoxorLoops and Jasmin stand either side of a vintage chrome mic. Before the player's first win
  // (opts.rung false) the mic is shrink-wrapped in the Gloss and its ring breaks into soft pastel blobs; after it the mic is live, glows warm and its
  // ring rolls out whole while notes and hearts rise. Blossom Bay, Scrollopolis and the Perfect Stage sit on the horizon; the Gloss creeps in
  // from the four corners (half as far once the mic is live).
  // ===============================================================================================================
  const TM = { x: 470, y: 150, r: 96 };                           // the moon (partly behind the logo)
  const STG = { cx: 640, top: 530, rx: 212, ry: 22, lip: 22 };     // the round stage: floor ellipse centre (cx, top), rx, ry; the lip wall below
  const MIC = { x: 640, head: 390, base: 528 };
  // the centrepiece's bounding box in stage px (stage, curtains, mic and the duo) and its layer parallax factor: exported by ART.scene.info.
  // x0, x1 and k never move (the menu column clears x1); y0 and y1 sit under the logo (y 42 to 258) and the tagline (y 262 to 290).
  const TITLE_FOCUS = { x0: 360, x1: 920, y0: 292, y1: 570, k: 0.1 };
  const lay = (name, rect, f, draw, o) => layer(name, rect, f, draw, Object.assign({ grain: false }, o));

  function titleSky(g) {
    fillRectG(g, X0, 0, XW, 560, [[0, '#070516'], [0.36, '#171049'], [0.62, '#2b1f6e'], [0.84, '#59399a'], [1, '#7a4fa8']]);
    hvStars(g, 'hv-title-stars', 160, 0, 430);
    // a soft pink and green aurora of spotlight haze high in the sky
    blob(g, 160, 120, 380, 160, '#ff7eb6', 0.12); blob(g, 1120, 110, 380, 170, '#3fcf6a', 0.1);
    hvMoon(g, TM.x, TM.y, TM.r);
  }
  // Blossom Bay (left), Scrollopolis (right) and the Perfect Stage's opalescent ring floating far above the sea (centre)
  function titleFar(g) {
    // the sea
    fillRectG(g, X0, 466, XW, 110, [[0, '#4a3596'], [0.25, '#33247a'], [1, '#1c1450']]);
    const r = R('hv-title-sea');
    for (let i = 0; i < 70; i++) { const y = 472 + Math.pow(r(), 1.4) * 80, x = X0 + r() * XW, w = 8 + r() * 30 * (1 + (y - 470) / 60); g.fillStyle = A(r() < 0.3 ? '#ffd9f0' : '#b9a6ff', 0.18 + r() * 0.2); g.fillRect(x, y, w, 1.6); }
    for (let i = 0; i < 16; i++) { const y = 474 + i * 5.5, w = 30 - i * 1.2; g.fillStyle = A('#fff4d6', 0.5 - i * 0.025); g.fillRect(TM.x - w / 2 + Math.sin(i * 1.7) * 6, y, w, 2); }
    blob(g, 640, 470, 520, 46, '#c8a8ff', 0.4);
    // the Perfect Stage, far off (seen through the open stage): a little opal arena floating above the sea on a column of soft light, a ring
    // light hovering over it like a halo
    g.save(); g.globalAlpha = 0.85;
    const PX = 486, PY = 436, PR = 40;
    fillRectG(g, PX - 18, PY + 10, 36, 466 - PY - 8, [[0, A('#e6d9ff', 0.45)], [1, A('#e6d9ff', 0.05)]]);
    blob(g, PX, PY, PR * 1.7, PR * 0.7, '#e6d9ff', 0.45);
    // the arena: an opal bowl, its rim lit, the stands as a pale band
    g.beginPath(); g.ellipse(PX, PY + 6, PR * 0.82, PR * 0.2, 0, 0, PI); g.lineTo(PX - PR * 0.5, PY + 18); g.ellipse(PX, PY + 18, PR * 0.5, PR * 0.1, 0, PI, 0, true); g.closePath();
    g.fillStyle = tk.lin(g, PX - PR, 0, PX + PR, 0, [[0, '#c9b8f0'], [0.5, '#f4f1fb'], [1, '#d9fff4']]); g.fill();
    ellip(g, PX, PY + 6, PR * 0.82, PR * 0.2, '#f4f1fb');
    ellip(g, PX, PY + 7, PR * 0.62, PR * 0.13, A('#c9cbd6', 0.9));
    for (let i = 0; i < 9; i++) { const a = PI + (i + 0.5) / 9 * PI; disc(g, PX + Math.cos(a) * PR * 0.72, PY + 6 + Math.sin(a) * PR * 0.17, 1.2, A('#ffffff', 0.9)); }
    g.lineWidth = 4; g.strokeStyle = A('#f4f1fb', 0.55); g.beginPath(); g.ellipse(PX, PY - 12, PR * 0.7, PR * 0.17, 0, 0, TAU); g.stroke();
    g.lineWidth = 1.8; g.strokeStyle = tk.lin(g, PX - PR, 0, PX + PR, 0, [[0, '#ffe3f1'], [0.35, '#e6d9ff'], [0.7, '#d9fff4'], [1, '#ffe3f1']]); g.beginPath(); g.ellipse(PX, PY - 12, PR * 0.7, PR * 0.17, 0, 0, TAU); g.stroke();
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.3; star4(g, PX + Math.cos(a) * PR * 0.7, PY - 12 + Math.sin(a) * PR * 0.17, 1.8, A('#ffffff', 0.85), 0); }
    g.restore();
    // BLOSSOM BAY: candy houses climbing a hill above a little harbour
    const hill = (x) => 466 - 150 * Math.pow(clamp((360 - x) / 420, 0, 1), 0.8) - 10 * Math.sin(x * 0.02);
    const hp = []; for (let x = X0; x <= 380; x += 10) hp.push([x, hill(x)]);
    fillRidge(g, hp.concat([[392, 470]]), 500, tk.lin(g, 0, 300, 0, 480, [[0, '#4a3790'], [1, '#2c2168']]));
    oline(g, hp, 2, { color: A(OL, 0.7) });
    const cols = [HV.tomato, HV.mint, HV.gold, HV.sky, '#ff9fc6', '#c9a0ff'];
    const hr = R('hv-bay-houses');
    const houses = [];
    for (let x = -60; x < 340; x += 26 + hr() * 14) houses.push({ x, w: 26 + hr() * 14, h: 26 + hr() * 22, c: cols[Math.floor(hr() * cols.length)], roof: hr() });
    houses.sort((a, b) => hill(b.x) - hill(a.x));
    houses.forEach((h, i) => {
      const by = hill(h.x + h.w / 2) + 12, c = U.color.mix(h.c, '#3a2a7a', 0.28), x = h.x, y = by - h.h;
      cel(g, rect4(x, y, h.w, h.h + 4), c, { line: 1.6, depth: 4, tension: 0 });
      const rc = U.color.mix(h.roof < 0.5 ? '#c93f5a' : '#5a7ad8', '#3a2a7a', 0.25);
      if (h.roof < 0.65) cel(g, { poly: [[x - 4, y + 1], [x + h.w / 2, y - h.w * 0.42], [x + h.w + 4, y + 1]] }, rc, { line: 1.6, depth: 3, tension: 0 });
      else cel(g, tk.arcPts(x + h.w / 2, y + 1, h.w / 2 + 3, h.w * 0.36, PI, TAU, 10), rc, { line: 1.6, depth: 3 });
      for (let k = 0; k < 2; k++) { if (hr() < 0.75) { const wx = x + 5 + k * (h.w - 16), wy = y + 6 + hr() * (h.h - 16); g.fillStyle = OL; g.fillRect(wx - 1, wy - 1, 8, 9); g.fillStyle = hr() < 0.8 ? '#ffd98a' : '#ffb0d0'; g.fillRect(wx, wy, 6, 7); } }
    });
    // the harbour: a quay, three little boats strung with fairy lights
    fillRectG(g, X0, 470, 430 - X0, 8, [[0, '#2a1f5a'], [1, '#1c1448']]);
    oline(g, [[X0, 470], [420, 470]], 1.6, { taper: 0, color: A(OL, 0.7) });
    [[70, 492, 1], [180, 498, 0.9], [300, 490, 0.8]].forEach((b, i) => {
      const x = b[0], y = b[1], s = b[2];
      cel(g, [[x - 26 * s, y - 6 * s, 1], [x + 28 * s, y - 6 * s, 1], [x + 20 * s, y + 6 * s], [x - 18 * s, y + 6 * s]], [HV.sky, '#ff9fc6', HV.gold][i], { line: 1.6, depth: 3, tension: 0.2 });
      oline(g, [[x, y - 6 * s], [x, y - 44 * s]], 1.6, { taper: 0 });
      [[x - 24 * s, y - 7 * s], [x + 26 * s, y - 7 * s]].forEach((e, k) => sagPts(x, y - 44 * s, e[0], e[1], 4, 5).forEach((p, j) => { if (j) disc(g, p[0], p[1], 1.6, ['#ffd98a', '#ff9fc6', '#c6ff3d'][(j + k) % 3]); }));
    });
    // SCROLLOPOLIS: phone-towers with glowing screens, a web of cables with tiny lights
    const tr = R('hv-scroll-towers'), towers = [];
    for (let x = 900; x < 1380; x += 30 + tr() * 26) towers.push({ x, w: 26 + tr() * 20, h: 70 + tr() * 150, k: tr() });
    towers.sort((a, b) => a.h - b.h);
    const scr = ['#3d7bff', '#3ff0ff', '#ff6fb5', '#a77bff'];
    towers.forEach((tw, i) => {
      const x = tw.x, y = 470 - tw.h, w = tw.w, sc = scr[i % scr.length], far = tw.h < 120;
      cel(g, rrect(x, y, w, tw.h + 6, w * 0.26), U.color.mix(far ? '#3a2d80' : '#241c5c', '#4a3790', far ? 0.4 : tw.k * 0.3), { line: 1.6, depth: 4, lineColor: A(OL, far ? 0.55 : 0.85) });
      // the phone screen in the top of the tower, and rows of lit windows under it
      const sh = Math.min(tw.h * 0.42, w * 1.7);
      g.fillStyle = A(sc, far ? 0.32 : 0.55); g.beginPath(); tk.trace(g, rrect(x + 3.5, y + 6, w - 7, sh, w * 0.14)); g.fill();
      g.fillStyle = A('#ffffff', 0.18); g.fillRect(x + 4, y + 7, (w - 8) * 0.4, sh - 2);
      for (let yy = y + sh + 14; yy < 462; yy += 12) for (let xx = x + 5; xx < x + w - 7; xx += 8) if (U.hash('hv-win', Math.round(xx), Math.round(yy)) % 3 === 0) { g.fillStyle = A(U.hash('hv-winc', Math.round(xx * yy)) % 2 ? '#ffd98a' : sc, 0.55); g.fillRect(xx, yy, 4, 5); }
      // tiny screen content: a heart, a play triangle, bars
      const cx = x + w / 2, cy = y + 6 + sh * 0.5, kind = i % 3;
      g.fillStyle = A('#ffffff', far ? 0.4 : 0.7);
      if (kind === 0) { heartPath(g, cx, cy, w * 0.14); g.fill(); }
      else if (kind === 1) { g.beginPath(); g.moveTo(cx - w * 0.1, cy - w * 0.13); g.lineTo(cx + w * 0.14, cy); g.lineTo(cx - w * 0.1, cy + w * 0.13); g.closePath(); g.fill(); }
      else for (let k = 0; k < 3; k++) g.fillRect(x + 7, cy - 7 + k * 6, (w - 14) * (0.4 + 0.3 * ((k + i) % 3) / 2), 2.4);
      oline(g, [[cx, y], [cx, y - 10 - tw.k * 10]], 1.4, { taper: 0, color: A(OL, 0.8) });
      disc(g, cx, y - 10 - tw.k * 10, 1.8, A('#ff6fb5', 0.9));
    });
    for (let i = 0; i < towers.length - 1; i++) {
      const a = towers[i], b = towers[(i + 3) % towers.length], ax = a.x + a.w / 2, ay = 470 - a.h + 14, bx = b.x + b.w / 2, by = 470 - b.h + 14;
      const pts = sagPts(ax, ay, bx, by, 18, 8);
      tk.inkPath(g, pts, { w: 1.2, color: A('#120c30', 0.8), taper: 0, pressure: 'flat', wobble: 0 });
      pts.forEach((p, j) => { if (j % 2) disc(g, p[0], p[1] + 1, 1.4, A(scr[(i + j) % 4], 0.9)); });
    }
  }
  // the near hill at the left with cherry trees, the tour van with Jordan's poster in the window, a lamppost and bunting
  function titleMid(g) {
    const hy = (x) => 488 + 50 * clamp((x - 20) / 470, 0, 1) - 14 * Math.sin(x * 0.012);
    const hp = []; for (let x = X0; x <= 520; x += 10) hp.push([x, hy(x)]);
    fillRidge(g, hp, 600, tk.lin(g, 0, 470, 0, 600, [[0, '#2c2470'], [1, '#17113f']]));
    oline(g, hp, 2.6, { taper: 0 });
    // cherry trees: a short trunk and a bubbly pink canopy under one outline
    [[50, 1.15], [150, 0.92], [240, 0.78]].forEach((tr, i) => {
      const x = tr[0], s = tr[1], gy = hy(x) + 4;
      cel(g, [[x - 7 * s, gy, 1], [x - 4 * s, gy - 50 * s], [x - 14 * s, gy - 76 * s], [x - 6 * s, gy - 78 * s], [x + 2 * s, gy - 58 * s], [x + 12 * s, gy - 80 * s], [x + 18 * s, gy - 76 * s], [x + 6 * s, gy - 50 * s], [x + 8 * s, gy, 1]], '#7a4a5a', { line: 2.2, depth: 4 });
      const rr = R('hv-tree', i), cs = [];
      for (let k = 0; k < 9; k++) cs.push([x + (rr() - 0.5) * 92 * s, gy - 92 * s + (rr() - 0.5) * 44 * s, (18 + rr() * 12) * s]);
      puffs(g, cs, '#ff9fc6', { lw: 2.4, shade: '#e0679e', hi: '#ffe0ee' });
      for (let k = 0; k < 6; k++) blossom(g, x + (rr() - 0.5) * 80 * s, gy - 92 * s + (rr() - 0.5) * 40 * s, 4.5 * s, rr() * TAU, { lw: 0.8, c0: '#ffffff', c1: '#ffd6ea', dot: '#ff7eb6' });
    });
    // the lamppost
    const lx = 196, ly = hy(lx) + 2;
    cel(g, rect4(lx - 3, ly - 92, 6, 92), '#3a3a6a', { line: 2, depth: 2, tension: 0 });
    cel(g, [[lx - 9, ly, 1], [lx + 9, ly, 1], [lx + 6, ly - 8], [lx - 6, ly - 8]], '#3a3a6a', { line: 2, depth: 2, tension: 0 });
    cel(g, [[lx - 10, ly - 96, 1], [lx + 10, ly - 96, 1], [lx + 7, ly - 116], [lx - 7, ly - 116]], '#ffe7a8', { line: 2.2, depth: 3, tension: 0.1, shadow: '#ffc96a' });
    cel(g, [[lx - 13, ly - 116, 1], [lx + 13, ly - 116, 1], [lx, ly - 126]], '#3a3a6a', { line: 2.2, depth: 2, tension: 0 });
    // the tour van, parked by the stage: cream body, pink skirt, green stripe, round windows, Jordan's poster in the back window
    const vx = 300, vy = hy(340) + 6;
    blob(g, vx + 40, vy + 2, 54, 7, '#05030f', 0.5);
    cel(g, [[vx, vy - 6, 1], [vx, vy - 40], [vx + 8, vy - 50], [vx + 62, vy - 50], [vx + 72, vy - 38], [vx + 84, vy - 30], [vx + 86, vy - 6, 1]], '#fff1d6', { line: 2.4, depth: 5, hi: '#ffffff', tension: 0.35,
      decor: (c) => {
        c.fillStyle = '#ff9fc6'; c.fillRect(vx - 4, vy - 20, 96, 20);
        c.fillStyle = HV.green; c.fillRect(vx - 4, vy - 25, 96, 5);
        c.fillStyle = A(wsh('#ff9fc6'), 0.9); c.fillRect(vx - 4, vy - 9, 96, 9);
      } });
    [[vx + 14, vy - 38, 13, 12], [vx + 34, vy - 38, 15, 12], [vx + 54, vy - 38, 13, 12]].forEach((w, i) => {
      cel(g, rrect(w[0] - w[2] / 2, w[1] - w[3] / 2, w[2], w[3], 3.5), i === 0 ? '#ffe9b0' : '#8fc8ff', { line: 1.6, depth: 2.5 });
      if (i === 0) { star4(g, w[0] - 2, w[1] - 1, 3.6, HV.pink, 0); blossom(g, w[0] + 3, w[1] + 2, 3, 0.4, { lw: 0.6 }); }
    });
    cel(g, [[vx + 64, vy - 46], [vx + 70, vy - 38], [vx + 80, vy - 32], [vx + 66, vy - 32, 1]], '#8fc8ff', { line: 1.6, depth: 2 });
    [vx + 18, vx + 68].forEach((wx) => { puffs(g, [[wx, vy - 4, 9]], '#3a3448', { lw: 2.2, hi: false }); disc(g, wx, vy - 4, 3.6, '#c9cbd6'); });
    puffs(g, [[vx + 84, vy - 16, 3.2]], '#fff4b0', { lw: 1.4, hi: false });
    // bunting from the lamp to the van roof
    bunting(g, lx + 6, ly - 104, vx + 40, vy - 50, 14, 7, [HV.pink, HV.green, HV.gold, HV.cream], 8);
  }
  function titleGround(g) {
    // a low hill on the right (kept dark and calm under the menu column) and the lawn in front of the stage
    const rp = []; for (let x = 820; x <= X0 + XW; x += 12) rp.push([x, 512 - 30 * clamp((x - 820) / 300, 0, 1) + 6 * Math.sin(x * 0.02)]);
    fillRidge(g, rp, 600, tk.lin(g, 0, 470, 0, 600, [[0, '#251d62'], [1, '#140f3a']]));
    oline(g, rp, 2.2, { taper: 0, color: A(OL, 0.8) });
    fillRectG(g, X0, 528, XW, DH - 528, [[0, '#1d1857'], [0.3, '#151046'], [1, '#090624']]);
    oline(g, [[X0, 530], [X0 + XW, 530]], 2, { taper: 0, color: A(OL, 0.6) });
    // a path of round stepping stones from the front of the picture up to the stage
    [[640, 700, 46], [622, 652, 38], [652, 614, 31], [634, 586, 25]].forEach((st, i) => {
      blob(g, st[0], st[1] + 3, st[2] * 1.1, st[2] * 0.3, '#05030f', 0.5);
      cel(g, tk.ellipsePts(st[0], st[1], st[2], st[2] * 0.3, 18), U.color.mix('#5a4a9a', '#2c2470', i * 0.12), { line: 2.2, depth: 3, hi: A('#c8b8ff', 0.6) });
    });
    const r = R('hv-title-lawn');
    for (let i = 0; i < 90; i++) {
      const x = X0 + r() * XW, y = 540 + Math.pow(r(), 0.8) * 170, s = 0.7 + (y - 540) / 170;
      if ((Math.abs(x - 640) < 260 && y < 580) || Math.abs(x - 638) < 60) continue;
      if (r() < 0.55) { g.strokeStyle = A(r() < 0.5 ? '#3a8a6a' : '#2a6a5a', 0.8); g.lineWidth = 1.6 * s; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 2 * s, y - 7 * s); g.moveTo(x + 3 * s, y); g.lineTo(x + 5 * s, y - 9 * s); g.stroke(); }
      else blossom(g, x, y - 2, 2.6 * s, r() * TAU, { lw: 0.7, c0: r() < 0.5 ? '#ffd6ea' : '#fff3c4', c1: '#ffffff', dot: '#ff9fc6' });
    }
  }
  // the stage itself: the rod, both curtains gathered, the round stage with its cream lip and a row of bulbs, the fairy-light string
  const TITLE_BULBS = [];
  function titleStage(g) {
    const S = STG;
    // the rod the curtains hang from
    oline(g, [[364, 296], [916, 296]], 8, { taper: 0 });
    oline(g, [[364, 296], [916, 296]], 4.4, { taper: 0, color: HV.gold });
    [364, 916].forEach((x) => puffs(g, [[x, 296, 7]], HV.gold, { lw: 2.2 }));
    curtain(g, 370, 432, 298, 536, { tieY: 432, tieIn: 0.5 });
    curtain(g, 910, 848, 298, 536, { tieY: 432, tieIn: 0.5 });
    // the lip wall: plum with a row of bulbs
    const front = [], back = [];
    for (let i = 0; i <= 40; i++) { const a = i / 40 * PI; front.push([S.cx - Math.cos(a) * S.rx, S.top + Math.sin(a) * S.ry]); }
    for (let i = 40; i >= 0; i--) { const a = i / 40 * PI; back.push([S.cx - Math.cos(a) * S.rx, S.top + Math.sin(a) * S.ry + S.lip]); }
    blob(g, S.cx, S.top + S.ry + S.lip, S.rx * 1.2, 22, '#05030f', 0.6);
    cel(g, { poly: front.concat(back) }, '#7a2058', { line: 2.8, depth: 7, shadow: '#56123f', tension: 0 });
    for (let i = 1; i < 16; i++) { const a = i / 16 * PI, x = S.cx - Math.cos(a) * S.rx * 0.98, y = S.top + Math.sin(a) * S.ry + S.lip * 0.55; puffs(g, [[x, y, 3.4]], '#ffe39a', { lw: 1.4, hi: '#ffffff' }); }
    // the floor: warm boards in a spotlight
    const floor = tk.ellipsePts(S.cx, S.top, S.rx, S.ry, 48);
    g.save();
    g.beginPath(); tk.trace(g, { poly: floor }); g.fillStyle = '#a8546a'; g.fill(); g.clip();
    g.fillStyle = tk.rad(g, S.cx, S.top - 4, 10, S.cx, S.top, S.rx, [[0, '#ffb58a'], [0.6, '#c8667a'], [1, '#8a3a5a']]); g.fillRect(S.cx - S.rx, S.top - S.ry, S.rx * 2, S.ry * 2);
    g.strokeStyle = A('#5a1a3a', 0.4); g.lineWidth = 1.4;
    for (let k = -3; k <= 3; k++) { g.beginPath(); g.ellipse(S.cx, S.top + k * 5, S.rx * (1 - Math.abs(k) * 0.05), S.ry * 0.25, 0, 0, PI, false); g.stroke(); }
    g.restore();
    // the cream lip round the floor edge
    g.save(); g.lineCap = 'round';
    g.strokeStyle = OL; g.lineWidth = 9; g.beginPath(); g.ellipse(S.cx, S.top, S.rx, S.ry, 0, 0, TAU); g.stroke();
    g.strokeStyle = HV.cream; g.lineWidth = 5; g.beginPath(); g.ellipse(S.cx, S.top, S.rx, S.ry, 0, 0, TAU); g.stroke();
    g.strokeStyle = A('#e8c9a8', 0.9); g.lineWidth = 2; g.beginPath(); g.ellipse(S.cx, S.top + 1.6, S.rx, S.ry, 0, 0.15, PI - 0.15); g.stroke();
    g.restore();
    // the fairy lights along the top, between the curtains
    TITLE_BULBS.length = 0;
    fairyString(g, 376, 302, 904, 302, 14, 24, [HV.pink, HV.gold, HV.green, HV.cream, '#7cc6ff'], 4.2).forEach((b) => TITLE_BULBS.push(b));
  }
  // the vintage chrome mic on its stand (the head at y 390): rung adds a warm light on the chrome
  function titleMic(g, rung) {
    const x = MIC.x, hy = MIC.head;
    // the round base and the pole
    cel(g, tk.ellipsePts(x, MIC.base, 36, 9, 20), '#4a4a6a', { line: 2.6, depth: 4, hi: '#9a9ab8' });
    cel(g, [[x - 4, MIC.base - 4, 1], [x - 3.4, hy + 46], [x + 3.4, hy + 46], [x + 4, MIC.base - 4, 1]], HV.chrome, { line: 2.4, depth: 3, hi: '#ffffff', tension: 0 });
    cel(g, rrect(x - 7, hy + 92, 14, 10, 3), '#4a4a6a', { line: 2, depth: 2 });   // the height clamp
    // the yoke that holds the head
    oline(g, tk.arcPts(x, hy + 12, 30, 34, 0.15, PI - 0.15, 12), 8.4, { taper: 0 });
    oline(g, tk.arcPts(x, hy + 12, 30, 34, 0.15, PI - 0.15, 12), 4.2, { taper: 0, color: HV.chrome });
    oline(g, [[x, hy + 46], [x, hy + 50]], 8, { taper: 0 });
    // the head: a chrome capsule with horizontal grille slats
    const head = tk.ellipsePts(x, hy, 25, 34, 28);
    cel(g, head, '#d8dae6', { line: 3, depth: 7, shadow: '#8c8ea6', hi: '#ffffff', hiW: 3,
      decor: (c) => {
        for (let k = -6; k <= 6; k++) { const y = hy + k * 4.6, hw = 25 * Math.sqrt(Math.max(0, 1 - Math.pow(k * 4.6 / 34, 2))) - 5; if (hw > 2) { c.fillStyle = A('#5a5c74', 0.55); c.fillRect(x - hw, y - 0.9, hw * 2, 1.8); c.fillStyle = A('#ffffff', 0.5); c.fillRect(x - hw, y + 0.9, hw * 2, 1); } }
        c.fillStyle = A('#ffffff', 0.85); c.beginPath(); c.ellipse(x + 11, hy - 16, 4, 9, 0.3, 0, TAU); c.fill();
        if (rung) { c.fillStyle = A('#ffcf8a', 0.35); c.beginPath(); c.ellipse(x - 8, hy + 10, 18, 22, 0, 0, TAU); c.fill(); }
      } });
    // the band round its waist and the badge
    oline(g, [[x - 25, hy + 2], [x + 25, hy + 2]], 9, { taper: 0 });
    oline(g, [[x - 24, hy + 2], [x + 24, hy + 2]], 5, { taper: 0, color: rung ? HV.gold : '#b4b6c8' });
    star5(g, x, hy + 2, 6, rung ? HV.pink : '#d8dae6', 0, 1.6);
  }
  // the Gloss wrap round the mic and its stand: an opalescent film, a pinched tuft on top, the polite smile
  function titleWrap(g) {
    const x = MIC.x, hy = MIC.head;
    const outline = [];
    tk.arcPts(x, hy - 2, 36, 46, PI * 1.08, PI * 1.92, 14).forEach((p) => outline.push(p));
    outline.push([x + 34, hy + 22], [x + 30, hy + 50], [x + 14, hy + 66], [x + 11, hy + 110], [x + 12, MIC.base - 16], [x + 46, MIC.base - 6], [x + 44, MIC.base + 10], [x, MIC.base + 14], [x - 44, MIC.base + 10], [x - 46, MIC.base - 6], [x - 12, MIC.base - 16], [x - 11, hy + 110], [x - 14, hy + 66], [x - 30, hy + 50], [x - 34, hy + 22]);
    const tr = (c) => tk.trace(c, outline, 0, 0, 0.5);
    glossFill(g, tr, x - 50, hy - 50, x + 50, MIC.base + 14, 0.78);
    g.save(); g.beginPath(); tr(g); g.lineWidth = 2; g.strokeStyle = A('#c8b6f0', 0.55); g.stroke(); g.restore();
    // shrink-wrap creases
    [[[x - 26, hy - 20], [x - 10, hy - 4], [x - 22, hy + 18]], [[x + 22, hy - 28], [x + 8, hy - 10]], [[x - 6, hy + 70], [x + 4, hy + 100], [x - 4, hy + 128]]].forEach((cr) => tk.inkPath(g, cr, { w: 1.6, color: A('#ffffff', 0.8), taper: 0.4, wobble: 0.05 }));
    // the pinched tuft on top
    const ty = hy - 46;
    [[-1, -0.5], [1, 0.5]].forEach((s) => glossFill(g, (c) => tk.trace(c, [[x, ty + 2], [x + s[0] * 14, ty - 14], [x + s[0] * 6, ty - 18], [x + s[0] * 2, ty - 6]], 0, 0, 0.5), x - 16, ty - 20, x + 16, ty + 2, 0.85));
    disc(g, x, ty + 1, 4, A('#e6d9ff', 0.95));
    glossSmile(g, x - 2, hy + 32, 8);
  }
  // the duo on the stage: RoxorLoops at x 560 facing right, Jasmin at x 720 flipped (as on the owners' duo card), drawn by ART.hero so the
  // viewer's outfits show. Idle, looking at the wrapped mic; once the mic is live both hold the sing frame of `cast` and sway on the beat.
  function titleDuo(ctx, T) {
    const H = ART.hero;
    if (!H || typeof H.draw !== 'function' || !(typeof ART.has === 'function' && ART.has('hero', 'kuro'))) return;
    const rung = !!T.o.rung, px = T.par * 0.1;
    [['kuro', 560, false, 0], ['hanae', 720, true, 0.55]].forEach((d) => {
      const sway = rung && T.mot >= 1 ? Math.sin((T.tt * 1.75 + d[3]) * PI) * 0.035 : 0;
      ctx.save();
      try {
        ctx.translate(d[1] - px, STG.top); ctx.rotate(sway);
        H.draw(ctx, d[0], { x: 0, y: 0, s: 0.7, pose: rung ? 'cast' : 'idle', pt: rung ? 0.25 : 0, t: T.t + d[3] * 3, flip: d[2] });
      } catch (e) { /* the hero art reports its own errors */ }
      ctx.restore();
    });
  }
  // the foreground: a cherry blossom branch from the top-left corner, bunting across the top right (above the menu column's plaques)
  function titleBranch(g) {
    const pts = [[-30, 20], [60, 44], [150, 64], [236, 112]];
    tk.inkPath(g, pts, { w: 22, color: OL, taper: 0.6, taperStart: 0, pressure: 'head', wobble: 0.04 });
    tk.inkPath(g, pts, { w: 16, color: '#6a3a4a', taper: 0.6, taperStart: 0, pressure: 'head', wobble: 0.04 });
    tk.inkPath(g, pts.map((p) => [p[0] + 1, p[1] - 4]), { w: 4, color: A('#a46a7a', 0.9), taper: 0.6, taperStart: 0.1, pressure: 'head', wobble: 0.04 });
    [[[96, 52], [124, 104], [128, 136]], [[40, 38], [52, 4], [70, -10]], [[180, 82], [214, 70], [254, 70]]].forEach((tw) => { tk.inkPath(g, tw, { w: 8.4, color: OL, taper: 0.7, taperStart: 0, wobble: 0.04 }); tk.inkPath(g, tw, { w: 5, color: '#6a3a4a', taper: 0.7, taperStart: 0, wobble: 0.04 }); });
    const r = R('hv-title-branch');
    const spots = [[10, 30, 22], [70, 52, 26], [126, 132, 20], [160, 70, 24], [226, 104, 20], [252, 70, 16], [62, 0, 18], [120, 96, 16]];
    spots.forEach((s, i) => {
      const cs = []; for (let k = 0; k < 4; k++) cs.push([s[0] + (r() - 0.5) * s[2] * 1.2, s[1] + (r() - 0.5) * s[2], s[2] * (0.42 + r() * 0.3)]);
      puffs(g, cs, '#ffb0d2', { lw: 2.4, shade: '#ec78ac', hi: '#fff0f6' });
    });
    spots.forEach((s, i) => { for (let k = 0; k < 3; k++) blossom(g, s[0] + (r() - 0.5) * s[2] * 1.4, s[1] + (r() - 0.5) * s[2], 6 + r() * 4, r() * TAU, { lw: 1.4, c0: '#ff7eb6', c1: '#ffe0ee' }); });
  }
  function titleBunting(g) {
    bunting(g, 920, -6, 1300, 34, 44, 9, [HV.green, HV.pink, HV.gold, HV.cream, HV.teal], 11);
  }

  // the ring: one circle grows from the mic head every 10.5 s. While the mic is wrapped it breaks into soft pastel blobs past r 160 (muffled);
  // once it is live it stays whole and clear out to r 260.
  const TITLE_RING_P = 10.5;
  function titleRing(ctx, T) {
    if (T.mot < 1) return;
    const rung = !!T.o.rung, DUR = 2.6, s = ((T.tt % TITLE_RING_P) + TITLE_RING_P) % TITLE_RING_P;
    if (s > DUR) return;
    const u = s / DUR, r = 260 * (1 - Math.pow(1 - u, 2)), fade = 1 - ss(0.3, 1, u), cx = MIC.x - T.par * 0.1, cy = MIC.head;
    ctx.save();
    ctx.lineCap = 'round';
    if (rung) {
      [[1, 1], [0.72, 0.55]].forEach((q) => {
        const rr = r * q[0];
        if (rr < 4) return;
        ctx.globalAlpha = 0.85 * fade * q[1]; ctx.strokeStyle = '#ffd84d'; ctx.lineWidth = 2.5 + 5 * (1 - u); ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 0.95 * fade * q[1]; ctx.strokeStyle = '#fff8ec'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke();
      });
    } else {
      const solid = 1 - ss(130, 170, r);
      if (solid > 0.01 && r > 4) { ctx.globalAlpha = 0.7 * fade * solid; ctx.strokeStyle = '#e6d9ff'; ctx.lineWidth = 2 + 3 * (1 - u); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke(); }
      if (solid < 0.99) {
        const n = 30, spr = [moteSpr(GL[1]), moteSpr(GL[2]), moteSpr(GL[3])];
        for (let i = 0; i < n; i++) {
          const h = U.hash('ring-gloss', i) % 1000 / 1000, h2 = U.hash('ring-gloss2', i) % 1000 / 1000;
          if (h < 0.25) continue;
          const a = i / n * TAU + (h2 - 0.5) * 0.12, rr = r + (h - 0.6) * 14, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr, sz = 10 + h2 * 14 * (1 - solid);
          ART.blit(ctx, spr[i % 3], x - sz, y - sz, sz * 2, sz * 2, 0.9 * fade * (1 - solid) * (0.5 + h * 0.5));
        }
      }
    }
    ctx.restore();
  }
  // twinkling bulbs of the fairy string (additive), and the warm stage light pool
  function titleLights(ctx, T) {
    const px = T.par * 0.1, rung = !!T.o.rung;
    addMode(ctx, () => {
      const p = 0.85 + 0.15 * Math.sin(T.tt * 1.1);
      glowE(ctx, STG.cx - px, STG.top - 6, 230, 40, '#ffcf8a', (rung ? 0.5 : 0.3) * p);
      glowE(ctx, STG.cx - px * 0.5, 620, 280, 70, '#ff9fc6', (rung ? 0.16 : 0.1) * p);
      glowE(ctx, MIC.x - px, MIC.head, 90, 110, rung ? '#ffcf8a' : '#e6d9ff', (rung ? 0.5 : 0.22) * p);
      for (let i = 0; i < TITLE_BULBS.length; i++) {
        const b = TITLE_BULBS[i], tw = 0.55 + 0.45 * Math.sin(T.tt * (1.3 + (i % 5) * 0.37) + i * 1.7);
        glowAt(ctx, b[0] - px, b[1], 13, b[2], 0.45 * tw);
      }
      glowAt(ctx, 196 - T.par * 0.3, hyLamp() - 106, 46, '#ffd98a', 0.55);
    });
  }
  const hyLamp = () => 488 + 50 * clamp((196 - 20) / 470, 0, 1) - 14 * Math.sin(196 * 0.012) + 2;

  SCENES.title = { id: 'title', combat: false, mood: 'moonlit stage', sway: 8, focus: TITLE_FOCUS, items: [
    lay('sky', full(0, 560), 0.02, titleSky),
    anim((ctx, T) => { twinkle(ctx, T, { key: 'hv-title', n: 40, h: 380, gold: 0.35 }); }),
    lay('far', full(280, 300), 0.05, titleFar),
    lay('ground', full(450, 270), 0, titleGround),
    lay('mid', { x: 0, y: 360, w: 520, h: 240 }, 0.3, titleMid),
    lay('stage', { x: 340, y: 282, w: 600, h: 300 }, 0.1, titleStage),
    anim(titleLights),
    lay('mic', { x: 560, y: 340, w: 160, h: 210 }, 0.1, (g, rr, T) => titleMic(g, !!T.o.rung), { vary: (T) => (T.o.rung ? 'live' : 'wrapped') }),
    lay('wrap', { x: 570, y: 316, w: 140, h: 236 }, 0.1, titleWrap, { alpha: (T) => (T.o.rung ? 0 : 1) }),
    anim(titleRing),
    anim(titleDuo),
    anim((ctx, T) => {
      const rung = !!T.o.rung, px = T.par * 0.1;
      if (rung) {
        drift(ctx, T, { key: 'hv-title-notes', n: 14, sprs: [noteSpr(0), noteSpr(1), noteSpr(2), noteSpr(3), heartSpr(HV.pink), heartSpr(HV.green)], area: { x: 540 - px, y: 60, w: 200, h: 320 }, vx: 0, vy: -38, sway: 34, size: [20, 32], aspect: 1, spin: 0.2, wob: 0.35, alpha: [0.75, 1] });
        tk.sparkle(ctx, MIC.x + 22 - px, MIC.head - 30, 10 + 4 * Math.sin(T.tt * 2.6), { color: '#fff8ec', alpha: 0.95, glow: 0.7 });
      } else {
        drift(ctx, T, { key: 'hv-title-notes0', n: 7, sprs: [noteSpr(0), noteSpr(1), noteSpr(2), noteSpr(3), heartSpr(HV.pink), heartSpr(HV.green)], area: { x: 120, y: 60, w: 1040, h: 360 }, vx: 0, vy: -16, sway: 30, size: [16, 24], aspect: 1, spin: 0.2, wob: 0.35, alpha: [0.35, 0.6] });
        tk.sparkle(ctx, MIC.x + 18 - px, MIC.head - 40, 5 + 2 * Math.sin(T.tt * 1.3), { color: '#ffffff', alpha: 0.8, glow: 0.3 });
      }
    }),
    lay('branch', { x: 0, y: 0, w: 300, h: 180 }, 1, titleBranch),
    lay('bunting', { x: 900, y: 0, w: 380, h: 110 }, 1, titleBunting),
    anim((ctx, T) => {
      drift(ctx, T, { key: 'hv-title-petals', n: 22, sprs: [petalSpr('#ffc2dc', 0), petalSpr('#ff9cc6', 1), petalSpr('#fff0f6', 2)], area: { x: 0, y: 0, w: DW, h: DH }, vx: 34, vy: 30, sway: 40, size: [12, 22], aspect: 1, tumble: true, spin: 0.7, alpha: [0.75, 1] });
      fireflies(ctx, T, { key: 'hv-title-motes', n: 14, area: { x: 120, y: 330, w: 1040, h: 220 }, color: '#7dff8a', size: 11, core: '#eaffd0' });
    }),
    lay('glossA', full(0), 0, (g, rr, T) => glossCorners(g, [[-20, 740, 230, 150], [1300, 744, 240, 160], [-14, -14, 130, 90], [1296, -12, 120, 86]], T.o.rung ? 0.5 : 1, 5), { q: 0.6, vary: (T) => (T.o.rung ? 'half' : 'full') }),
    vigLayer('hv-title-vig', { color: '#05030f', alpha: 0.5, inner: 0.34 }),
    anim((ctx, T) => { if (T.o.logo) logoDraw(ctx, 640, 150, 540, T.t); }),
  ] };


  // ===============================================================================================================
  // THE ACT SCENES: the combat backdrops of the three Acts (ch1 boss1: Blossom Bay, ch2 boss2: Scrollopolis, ch3 boss3: the Perfect Stage), in
  // the chibi house style of the screen scenes above: the warm outline on near things and a lighter, hazier line further back, flat cel colour
  // with one hard shadow on the lower left (the key light is upper right), candy colours, no grain and no halftone. Every Act keeps the combat
  // contract of DESIGN 5.9: feet on y 520, the heroes on the left third, the enemy lanes across the right two thirds with a calm mid-tone band
  // behind them, and the band below y 520 shaded for the HUD and the hand. A boss scene is its Act pushed to its most dramatic moment: a colour
  // shift and a hard vignette. The only words painted here are the bible's art words: the Scrollopolis graffiti (`first!`, `mid`,
  // `who asked`) and the `APPLAUSE` sign.
  // ===============================================================================================================
  const actL = (sk) => (name, rect, f, draw, o) => layer(name, rect, f, draw, Object.assign({ sk, grain: false }, o));
  // the hard vignette of a boss scene: an oval that closes in fast from the edges (baked small: it is only a gradient)
  function hardVig(name, col, a, o) {
    o = o || {};
    return layer(name, full(0), 0, (g) => {
      g.save(); g.translate(DW / 2, o.cy || DH * 0.44); g.scale(1, 0.66);
      const gr = g.createRadialGradient(0, 0, DW * (o.inner === undefined ? 0.34 : o.inner), 0, 0, DW * 0.62);
      gr.addColorStop(0, A(col, 0)); gr.addColorStop(0.6, A(col, a * 0.5)); gr.addColorStop(1, A(col, a));
      g.fillStyle = gr; g.fillRect(-DW, -DH * 1.6, DW * 2, DH * 3.2);
      g.restore();
    }, { q: 0.3 });
  }

  // A tiny stroke font for the painted art words: skeletons in a box of cap height 1 (y down from the cap line), w the advance. Drawn as fat
  // round strokes, so the letters are chunky and rounded whatever fonts the device has. Strokes with more than three points are smoothed once.
  const sfArc = (cx, cy, rx, ry, a0, a1, n) => { const o = []; for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); o.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return o; };
  const SF = {
    f: { w: 0.6, s: [[[0.27, 1], [0.27, 0.3], [0.33, 0.09], [0.47, 0.02], [0.6, 0.07]], [[0.08, 0.47], [0.5, 0.47]]] },
    i: { w: 0.34, s: [[[0.17, 0.46], [0.17, 1]], [[0.17, 0.15], [0.17, 0.16]]] },
    r: { w: 0.56, s: [[[0.15, 0.46], [0.15, 1]], [[0.15, 0.68], [0.22, 0.52], [0.36, 0.44], [0.52, 0.47]]] },
    s: { w: 0.6, s: [[[0.52, 0.52], [0.4, 0.44], [0.22, 0.45], [0.13, 0.56], [0.22, 0.68], [0.42, 0.74], [0.52, 0.86], [0.44, 0.98], [0.24, 1.0], [0.08, 0.93]]] },
    t: { w: 0.54, s: [[[0.26, 0.16], [0.26, 0.86], [0.32, 0.98], [0.48, 0.98]], [[0.08, 0.47], [0.48, 0.47]]] },
    '!': { w: 0.32, s: [[[0.16, 0.03], [0.16, 0.66]], [[0.16, 0.95], [0.16, 0.96]]] },
    m: { w: 0.9, s: [[[0.12, 1], [0.12, 0.46]], [[0.12, 0.64], [0.21, 0.48], [0.33, 0.45], [0.43, 0.54], [0.43, 1]], [[0.43, 0.64], [0.52, 0.48], [0.64, 0.45], [0.75, 0.54], [0.75, 1]]] },
    d: { w: 0.68, s: [sfArc(0.31, 0.73, 0.2, 0.27, 0, TAU, 20), [[0.53, 0.03], [0.53, 1]]] },
    w: { w: 0.84, s: [[[0.06, 0.46], [0.22, 1], [0.41, 0.6], [0.6, 1], [0.76, 0.46]]] },
    h: { w: 0.66, s: [[[0.13, 0.03], [0.13, 1]], [[0.13, 0.66], [0.23, 0.5], [0.37, 0.45], [0.5, 0.52], [0.53, 0.64], [0.53, 1]]] },
    o: { w: 0.68, s: [sfArc(0.34, 0.73, 0.22, 0.27, 0, TAU, 22)] },
    a: { w: 0.66, s: [sfArc(0.29, 0.74, 0.19, 0.25, 0, TAU, 20), [[0.5, 0.48], [0.5, 1]]] },
    k: { w: 0.62, s: [[[0.13, 0.03], [0.13, 1]], [[0.5, 0.46], [0.15, 0.75]], [[0.29, 0.65], [0.52, 1]]] },
    e: { w: 0.64, s: [[[0.11, 0.73], [0.52, 0.73], [0.5, 0.58], [0.39, 0.47], [0.26, 0.46], [0.13, 0.55], [0.09, 0.73], [0.15, 0.9], [0.31, 1.0], [0.49, 0.96]]] },
    A: { w: 0.8, s: [[[0.06, 1], [0.4, 0], [0.74, 1]], [[0.19, 0.64], [0.61, 0.64]]] },
    P: { w: 0.72, s: [[[0.14, 1], [0.14, 0], [0.4, 0]].concat(sfArc(0.4, 0.27, 0.25, 0.27, -PI / 2, PI / 2, 12), [[0.14, 0.54]])] },
    L: { w: 0.64, s: [[[0.14, 0], [0.14, 1], [0.58, 1]]] },
    U: { w: 0.8, s: [[[0.12, 0]].concat(sfArc(0.4, 0.6, 0.28, 0.4, PI, 0, 16), [[0.68, 0]])] },
    S: { w: 0.76, s: [[[0.64, 0.16], [0.49, 0.02], [0.28, 0.02], [0.13, 0.17], [0.2, 0.38], [0.43, 0.5], [0.62, 0.62], [0.66, 0.82], [0.52, 0.98], [0.29, 1.0], [0.1, 0.86]]] },
    E: { w: 0.66, s: [[[0.58, 0], [0.14, 0], [0.14, 1], [0.58, 1]], [[0.14, 0.5], [0.5, 0.5]]] },
    ' ': { w: 0.3, s: [] },
  };
  Object.keys(SF).forEach((k) => {
    SF[k].s = SF[k].s.map((st) => {
      if (st.length <= 3 || st.length > 14) return st;                 // lines stay straight, arcs are already dense
      const f = tk.flatten(st, { tension: 0.5, step: 0.03 }), o = [];
      for (let i = 0; i < f.length; i += 2) o.push([f[i], f[i + 1]]);
      return o;
    });
  });
  function sfWidth(word, gap) { let w = 0; for (let i = 0; i < word.length; i++) { const c = SF[word[i]]; w += (c ? c.w : 0.5) + gap; } return w - gap; }
  // A word in fat round strokes centred on (x, y) (the middle of the cap box), size the cap height in px. The outline goes under ALL the letters
  // first so neighbours merge into one sticker. o: fill, line (outline colour), lw (stroke weight as a share of size, default 0.2), ol (outline px),
  // rim (an inner rim colour or none) and rimW, shadow (a drop shadow colour), hi (a highlight colour), lean (radians, alternating per letter),
  // gap (advance between letters as a share of size), tilt (radians, the whole word). Returns the width in px.
  function sfWord(g, word, x, y, size, o) {
    o = o || {};
    const gap = o.gap === undefined ? 0.07 : o.gap, W = sfWidth(word, gap) * size, lw = size * (o.lw || 0.2), ol = o.ol === undefined ? Math.max(1.2, size * 0.07) : o.ol;
    const rimW = o.rim ? (o.rimW === undefined ? ol * 0.8 : o.rimW) : 0;
    const glyphs = [];
    let cx = -W / 2;
    for (let i = 0; i < word.length; i++) { const c = SF[word[i]]; if (c && c.s.length) glyphs.push({ c, x: cx, lean: o.lean ? (glyphs.length % 2 ? 1 : -1) * o.lean : 0 }); cx += ((c ? c.w : 0.5) + gap) * size; }
    const pass = (width, col, dx, dy) => {
      g.strokeStyle = col; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
      glyphs.forEach((gl) => {
        const ca = Math.cos(gl.lean), sa = Math.sin(gl.lean), mx = gl.c.w / 2;
        gl.c.s.forEach((st) => st.forEach((p, k) => { const px = p[0] - mx, py = p[1] - 0.5, X = gl.x + (mx + px * ca - py * sa) * size + dx, Y = (px * sa + py * ca) * size + dy; if (k) g.lineTo(X, Y); else g.moveTo(X, Y); }));
      });
      g.stroke();
    };
    g.save(); g.translate(x, y); if (o.tilt) g.rotate(o.tilt);
    if (o.shadow) pass(lw + (ol + rimW) * 2, o.shadow, -size * 0.05, size * 0.08);
    pass(lw + (ol + rimW) * 2, o.line || OL, 0, 0);
    if (o.rim) pass(lw + rimW * 2, o.rim, 0, 0);
    pass(lw, o.fill || HV.cream, 0, 0);
    if (o.hi) pass(lw * 0.26, o.hi, lw * 0.16, -lw * 0.18);
    g.restore();
    return W;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // ACT I, BLOSSOM BAY (ch1): the harbour at golden hour. Across the basin the candy houses climb the hill (tomato, mint, lemon, sky), bunting
  // strung between the balconies, little cherry trees along the far quay, and three house fronts gone opalescent and flat with identical
  // lip-syncing buskers in front of them: the Gloss is only starting. The open sea and the low sun at the right, a breakwater with a striped
  // lighthouse, the little pier stage with its mic stand and an arch of fairy lights far right, boats strung with fairy lights bobbing in the
  // basin, and the near quay of warm cobbles as the ground. Cherry trees frame the top corners and drop petals, bunting sways between them,
  // gulls glide far off, the water shimmers and the fairy lights twinkle.
  // ---------------------------------------------------------------------------------------------------------------
  const BB = { fq: 410, nq: 506, sea: 394, sunX: 1012, sunY: 306 };
  const BB_HAZE = '#ffd6b4';
  const bbHill = (x) => BB.fq - (BB.fq - 132) * Math.pow(1 - clamp((x + 110) / 1000, 0, 1), 1.25) + 10 * Math.sin(x * 0.011 + 0.6) * clamp((890 - x) / 300, 0, 1);
  let BB_HOUSES = null;
  function bbHouses() {
    if (BB_HOUSES) return BB_HOUSES;
    const r = R('bb-houses'), out = [];
    const cols = [HV.tomato, HV.mint, HV.gold, HV.sky, '#ff9fc6', '#c9a0ff', '#ffb38a', HV.mint, HV.tomato, HV.sky];
    const roofs = ['#d9563f', '#c94f6a', '#2e9a8e', '#5a7ad8', '#e07a3a', '#d9563f'];
    let x = -112, ci = 0;
    while (x < 870) {
      const w = 33 + r() * 18, lane = r() < 0.3;
      let base = BB.fq + 2;
      const top = bbHill(x + w / 2);
      while (base > top + 16) {
        const h = Math.min(30 + r() * 24, base - top + 8);
        out.push({ x, w, h, base, col: cols[(ci * 3 + Math.floor(r() * 4)) % cols.length], roof: roofs[Math.floor(r() * roofs.length)], kind: r() < 0.5 ? 0 : (r() < 0.55 ? 1 : 2), seed: out.length, low: base === BB.fq + 2, bal: r() < 0.4 });
        base -= h * (0.8 + r() * 0.12);
        ci++;
      }
      x += w + (lane ? 7 + r() * 7 : 0.5);
    }
    // three house fronts on the waterfront have caught the Gloss
    const low = out.filter((h) => h.low && h.x > 200 && h.x < 760);
    [1, 5, 9].forEach((i) => { if (low[i]) low[i].gloss = true; });
    out.sort((a, b) => a.base - b.base || a.x - b.x);
    BB_HOUSES = out;
    return out;
  }
  function bbSky(g) {
    fillRectG(g, X0, 0, XW, 470, [[0, '#6f7fd8'], [0.28, '#a78ad2'], [0.52, '#ff9fb2'], [0.72, '#ffbb8e'], [0.88, '#ffd89c'], [1, '#ffe9bc']]);
    blob(g, BB.sunX, BB.sunY, 620, 380, '#ffcf8a', 0.75);
    blob(g, BB.sunX, BB.sunY, 230, 180, '#fff1c4', 0.9);
    // the sun: a cream disc, one warm shade crescent, a soft warm line
    g.save();
    disc(g, BB.sunX, BB.sunY, 60, '#fff4cf');
    g.beginPath(); g.arc(BB.sunX, BB.sunY, 60, 0, TAU); g.clip();
    g.beginPath(); g.rect(BB.sunX - 130, BB.sunY - 130, 260, 260); g.arc(BB.sunX + 9, BB.sunY - 9, 60, 0, TAU); g.fillStyle = '#ffe2a2'; g.fill('evenodd');
    g.restore();
    g.lineWidth = 2.6; g.strokeStyle = A('#f29a5a', 0.75); g.beginPath(); g.arc(BB.sunX, BB.sunY, 60, 0, TAU); g.stroke();
    g.fillStyle = A('#ffffff', 0.85); g.beginPath(); g.ellipse(BB.sunX + 26, BB.sunY - 30, 10, 5, -0.8, 0, TAU); g.fill();
    // thin golden streaks low over the sea
    [[870, 352, 220], [1150, 340, 190], [720, 372, 160], [1060, 378, 260]].forEach((s) => {
      g.fillStyle = A('#fff0c8', 0.55); g.beginPath(); tk.trace(g, rrect(s[0] - s[2] / 2, s[1], s[2], 7, 3.5)); g.fill();
    });
  }
  function bbClouds(g) {
    // puffy cartoon clouds lit warm from the low sun at the right; drawn wrapped so the strip scrolls seamlessly
    [[190, 82, 1.15], [560, 50, 0.95], [1220, 96, 1], [820, 150, 0.7], [400, 196, 0.62]].forEach((c, i) => wrapDraw(c[0], 140 * c[2], (x) => {
      const s = c[2];
      puffs(g, [[x - 52 * s, c[1] + 8 * s, 24 * s], [x - 18 * s, c[1] - 8 * s, 32 * s], [x + 22 * s, c[1] - 2 * s, 28 * s], [x + 56 * s, c[1] + 10 * s, 20 * s], [x, c[1] + 14 * s, 26 * s]],
        '#ffe0d6', { lw: 2, line: A(OL, 0.42), shade: '#f3a7bf', hi: '#fff8ee', lit: 0.16 });
    }));
  }
  // distant hills behind the town, the open sea to the horizon with the sun's glitter path, and a far island across the bay
  function bbFar(g) {
    [[60, '#d5b0dc', 0.9], [30, '#e6b6c4', 0.95]].forEach((rg, k) => {
      const pts = [];
      for (let x = X0; x <= 1030; x += 12) pts.push([x, lerp(Math.min(BB.sea + 6, bbHill(x) - rg[0] + 16 * Math.sin(x * 0.009 + k * 2)), BB.sea + 8, ss(760 + k * 40, 1020, x))]);
      fillRidge(g, pts, BB.sea + 30, tk.lin(g, 0, 120, 0, BB.sea, [[0, A(tint(rg[1], 0.25), rg[2])], [1, A(rg[1], rg[2])]]));
      oline(g, pts, 1.4, { color: A(OL, 0.22), taper: 0 });
      // hazy round trees and a few far roofs along the ridge, so the hill reads as a hill
      const tr = R('bb-ridge', k);
      for (let i = 0; i < 16; i++) {
        const x = X0 + 40 + i * 62 + tr() * 30;
        if (x > 900) break;
        const y = ridgeY(pts, x) + 3, rr = 7 + tr() * 6;
        if (tr() < 0.3) { g.fillStyle = A(mixc('#ff9fc6', rg[1], 0.5), 0.9); g.fillRect(x - 6, y - 8, 12, 10); g.beginPath(); g.moveTo(x - 8, y - 8); g.lineTo(x, y - 14); g.lineTo(x + 8, y - 8); g.closePath(); g.fillStyle = A(mixc('#c94f6a', rg[1], 0.5), 0.9); g.fill(); }
        else { const c = mixc(rg[1], '#9a76b8', 0.3); g.fillStyle = A(c, 0.95); g.beginPath(); g.arc(x, y, rr, PI, TAU); g.arc(x + rr * 0.9, y + 1, rr * 0.7, PI, TAU); g.closePath(); g.fill(); g.fillStyle = A('#ffffff', 0.18); g.beginPath(); g.arc(x + rr * 0.2, y - rr * 0.35, rr * 0.45, PI, TAU); g.fill(); }
      }
    });
    const isl = []; for (let x = 1120; x <= X0 + XW; x += 10) isl.push([x, BB.sea - 12 * Math.sin(clamp((x - 1120) / 300, 0, 1) * PI) - 4]);
    fillRidge(g, isl, BB.sea + 4, '#d9b2d8'); oline(g, isl, 1.2, { color: A(OL, 0.2), taper: 0 });
    fillRectG(g, X0, BB.sea, XW, BB.fq + 18 - BB.sea, [[0, '#ffe6b8'], [0.12, '#a7e3d2'], [0.5, '#62cbc2'], [1, '#3dbab5']]);
    g.fillStyle = A('#fff6dc', 0.8); g.fillRect(X0, BB.sea - 1, XW, 2);
    const r = R('bb-glitter');
    for (let i = 0; i < 40; i++) {
      const y = BB.sea + 3 + Math.pow(r(), 1.2) * (BB.fq + 14 - BB.sea), k = (y - BB.sea) / 30, w = (6 + r() * 26) * (0.6 + k * 0.4), x = BB.sunX + (r() - 0.5) * (40 + k * 70);
      g.fillStyle = A(r() < 0.6 ? '#fff4d0' : '#ffd890', 0.55 + r() * 0.35); g.fillRect(x - w / 2, y, w, 1.6 + k * 0.4);
    }
  }
  // one candy house: body, roof (gable, round or flat), windows catching the low sun, shutters, a balcony with flower pots, a door on the quay
  function bbHouse(g, h) {
    const k = clamp((BB.fq - h.base) / 250, 0, 1), hz = 0.08 + 0.36 * k * k, lc = A(OL, 0.8 - 0.3 * k), lw = 1.7 - 0.4 * k, x = h.x, w = h.w, top = h.base - h.h;
    if (h.gloss) { bbGlossHouse(g, h); return; }
    const col = mixc(h.col, BB_HAZE, hz), roof = mixc(h.roof, BB_HAZE, hz);
    cel(g, rect4(x, top, w, h.h + 2), col, { line: lw, lineColor: lc, depth: Math.max(2.5, w * 0.13), shadow: mixc(wsh(h.col, 0.11), BB_HAZE, hz), tension: 0 });
    if (h.kind === 0) cel(g, { poly: [[x - 3, top + 1], [x + w / 2, top - w * 0.4], [x + w + 3, top + 1]] }, roof, { line: lw, lineColor: lc, depth: 3, tension: 0 });
    else if (h.kind === 1) cel(g, tk.arcPts(x + w / 2, top + 1, w / 2 + 2, w * 0.32, PI, TAU, 10), roof, { line: lw, lineColor: lc, depth: 3 });
    else cel(g, rect4(x - 2, top - 5, w + 4, 6), roof, { line: lw, lineColor: lc, depth: 2, tension: 0 });
    const nx = w > 38 ? 2 : 1, ny = h.h > 42 ? 2 : 1, ww = 6.6, wh = 8.6, sh = mixc(['#2e9a8e', '#ff7eb6', '#5a7ad8', '#3fcf6a'][h.seed % 4], BB_HAZE, hz);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const wx = nx === 1 ? x + w / 2 - ww / 2 : x + (i ? w - 7 - ww : 7), wy = top + 6 + j * h.h * 0.42;
      if (h.low && j === ny - 1 && i === 0 && nx === 2) continue;           // the door goes here
      g.fillStyle = lc; g.fillRect(wx - 1.2, wy - 1.2, ww + 2.4, wh + 2.4);
      g.fillStyle = (U.hash('bbw', h.seed, i, j) % 3) ? mixc('#fff0c2', BB_HAZE, hz * 0.4) : mixc('#a8dcff', BB_HAZE, hz);
      g.fillRect(wx, wy, ww, wh);
      g.fillStyle = A('#ffffff', 0.7); g.fillRect(wx + ww * 0.58, wy + 1, 1.6, wh * 0.45);
      if (h.seed % 3 === 0 && nx === 1) { g.fillStyle = sh; g.fillRect(wx - 5, wy - 1, 3.4, wh + 2); g.fillRect(wx + ww + 1.6, wy - 1, 3.4, wh + 2); }
    }
    if (h.bal && ny === 2) {                                                  // a little balcony under the top window with flower pots
      const by = top + 6 + wh + 3, bx0 = x + 3, bx1 = x + w - 3;
      g.fillStyle = lc; g.fillRect(bx0, by, bx1 - bx0, 2);
      g.strokeStyle = lc; g.lineWidth = 1; g.beginPath(); for (let bx = bx0 + 3; bx < bx1; bx += 4) { g.moveTo(bx, by); g.lineTo(bx, by + 5); } g.stroke();
      g.fillRect(bx0, by + 5, bx1 - bx0, 1.4);
      [bx0 + 4, bx1 - 5].forEach((px, i) => { disc(g, px, by - 2, 2.4, i ? '#ff7eb6' : '#ffd84d'); disc(g, px + 2.4, by - 3, 1.8, '#3fcf6a'); });
    }
    if (h.low) {
      const dx = nx === 2 ? x + 7 : x + w / 2 - 5, dw = 10, dh = 15;
      cel(g, [[dx, h.base, 1], [dx, h.base - dh + 4], [dx + dw / 2, h.base - dh], [dx + dw, h.base - dh + 4], [dx + dw, h.base, 1]], mixc(wsh(h.col, 0.25), BB_HAZE, hz * 0.5), { line: 1.4, lineColor: lc, depth: 1.5, tension: 0.4 });
    }
  }
  // a house front gone opalescent and flat: the Gloss film, no windows, the one polite smile
  function bbGlossHouse(g, h) {
    const x = h.x, w = h.w, top = h.base - h.h, rh = w * 0.4;
    const tr = (c) => { c.moveTo(x - 3, top + 1); c.lineTo(x + w / 2, top - rh); c.lineTo(x + w + 3, top + 1); c.lineTo(x + w, top + 1); c.lineTo(x + w, h.base + 2); c.lineTo(x, h.base + 2); c.lineTo(x, top + 1); c.closePath(); };
    glossFill(g, tr, x - 4, top - rh, x + w + 4, h.base, 1, true);
    g.save(); g.beginPath(); tr(g); g.lineWidth = 1.4; g.strokeStyle = A('#b9a6e8', 0.7); g.stroke(); g.restore();
    glossSmile(g, x + w / 2, top + h.h * 0.42, 5.2);
  }
  // a lip-syncing busker in front of a Gloss house: a pastel silhouette, mic raised, every one in exactly the same pose
  function bbBusker(g, x, base) {
    g.save(); g.translate(x, base);
    g.fillStyle = A('#a996dc', 0.95); g.strokeStyle = A('#a996dc', 0.95); g.lineCap = 'round'; g.lineWidth = 2.6;
    g.beginPath(); g.moveTo(-3, 0); g.lineTo(-2, -9); g.moveTo(3, 0); g.lineTo(2, -9); g.stroke();
    g.beginPath(); tk.trace(g, rrect(-4.5, -19, 9, 11, 3.5)); g.fill();
    g.beginPath(); g.moveTo(3.5, -16); g.lineTo(6.5, -21); g.lineTo(3.4, -25); g.moveTo(-3.5, -16); g.lineTo(-7, -11); g.stroke();
    disc(g, 0.6, -24, 4.4, A('#a996dc', 0.95));
    disc(g, 3.6, -26, 1.7, '#6e62a8');
    g.fillStyle = A('#ffffff', 0.6); g.fillRect(1.6, -27.5, 1.6, 1.2);
    g.restore();
  }
  // a small round cherry tree on the far quay
  function bbLittleTree(g, x, base, s, i) {
    cel(g, [[x - 2 * s, base, 1], [x - 1.6 * s, base - 10 * s], [x + 1.6 * s, base - 10 * s], [x + 2 * s, base, 1]], mixc('#7a4a5a', BB_HAZE, 0.15), { line: 1.4, lineColor: A(OL, 0.75), depth: 1, tension: 0 });
    const rr = R('bb-ltree', i), cs = [];
    for (let k = 0; k < 4; k++) cs.push([x + (rr() - 0.5) * 16 * s, base - 16 * s + (rr() - 0.5) * 8 * s, (6 + rr() * 3) * s]);
    puffs(g, cs, mixc('#ff9fc6', BB_HAZE, 0.12), { lw: 1.6, line: A(OL, 0.75), shade: '#ec7aaa', hi: '#ffe4f0', lit: 0.12 });
  }
  // bunting strung across a lane between two balconies (small far pennants under a thin cord)
  function bbMiniBunting(g, x0, y0, x1, y1, sag, n, s) {
    const pts = sagPts(x0, y0, x1, y1, sag, n * 2), cols = [HV.pink, HV.gold, HV.green, HV.cream, HV.sky];
    oline(g, pts, 1, { color: A(OL, 0.55), taper: 0 });
    for (let i = 0; i < n; i++) {
      const a = pts[i * 2], b = pts[i * 2 + 1], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(mx, my + s * 1.3); g.closePath();
      g.fillStyle = cols[i % cols.length]; g.fill(); g.lineWidth = 0.9; g.strokeStyle = A(OL, 0.55); g.stroke();
    }
  }
  function bbTown(g) {
    const hp = []; for (let x = X0; x <= 900; x += 10) hp.push([x, bbHill(x)]);
    fillRidge(g, hp.concat([[900, BB.fq + 4]]), BB.fq + 12, tk.lin(g, 0, 130, 0, BB.fq, [[0, '#d8cf9e'], [1, '#9cc884']]));
    oline(g, hp, 1.5, { color: A(OL, 0.45), taper: 0 });
    const hs = bbHouses();
    hs.forEach((h) => bbHouse(g, h));
    // bunting across the lanes between the balconies
    const r = R('bb-bunting');
    for (let i = 0; i < 12; i++) {
      const x0 = -80 + i * 78 + r() * 30, y0 = Math.max(bbHill(x0) + 26, BB.fq - 220 + r() * 190);
      if (y0 > BB.fq - 24) continue;
      bbMiniBunting(g, x0, y0, x0 + 56 + r() * 30, y0 + (r() - 0.5) * 12, 6 + r() * 4, 6, 3.6);
    }
    // the far quay wall along the water, then the breakwater out to the lighthouse
    cel(g, rect4(X0, BB.fq, 1000 - X0, 13), mixc('#e6ad86', BB_HAZE, 0.15), { line: 1.6, lineColor: A(OL, 0.7), depth: 3, tension: 0, hi: '#fff0d8', hiW: 2 });
    g.strokeStyle = A(OL, 0.3); g.lineWidth = 1; g.beginPath(); for (let x = X0 + 20; x < 1000; x += 46) { g.moveTo(x, BB.fq + 3); g.lineTo(x, BB.fq + 13); } g.stroke();
    // little cherry trees along the far quay, and the identical buskers in front of the Gloss houses
    [-30, 128, 262, 548, 818].forEach((x, i) => bbLittleTree(g, x, BB.fq + 2, 1.15, i));
    hs.filter((h) => h.gloss).forEach((h) => bbBusker(g, h.x + h.w / 2, BB.fq + 3));
    // the lighthouse at the end of the breakwater: candy stripes, a gallery and a lamp room
    const lx = 972, lb = BB.fq + 1;
    cel(g, [[lx - 9, lb, 1], [lx - 7, lb - 46, 1], [lx + 7, lb - 46, 1], [lx + 9, lb, 1]], HV.cream, { line: 1.8, lineColor: A(OL, 0.8), depth: 3, tension: 0,
      decor: (c) => { c.fillStyle = '#ff7eb6'; for (let k = 0; k < 3; k++) c.fillRect(lx - 12, lb - 12 - k * 14, 24, 6); } });
    cel(g, rect4(lx - 11, lb - 50, 22, 4), '#c94f6a', { line: 1.6, lineColor: A(OL, 0.8), depth: 1, tension: 0 });
    cel(g, rect4(lx - 6, lb - 61, 12, 11), '#fff4c8', { line: 1.6, lineColor: A(OL, 0.8), depth: 0, shadow: false, tension: 0 });
    cel(g, tk.arcPts(lx, lb - 61, 8, 7, PI, TAU, 8), '#c94f6a', { line: 1.6, lineColor: A(OL, 0.8), depth: 1.5 });
  }
  function bbWater(g) {
    fillRectG(g, X0, BB.fq + 6, XW, BB.nq + 18 - BB.fq - 6, [[0, '#6cd2c6'], [0.45, '#2bb3b1'], [1, '#1d8892']]);
    blob(g, BB.sunX, BB.fq + 40, 220, 50, '#ffcf8a', 0.4);
    const r = R('bb-ripples');
    g.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      const y = BB.fq + 18 + Math.pow(r(), 0.8) * (BB.nq - BB.fq - 22), k = (y - BB.fq) / (BB.nq - BB.fq), x = X0 + r() * XW, w = 10 + k * 26 + r() * 10;
      g.strokeStyle = A(r() < 0.5 ? '#b8f0e2' : '#e6fffb', 0.35 + 0.2 * r()); g.lineWidth = 1.4 + k;
      g.beginPath(); g.moveTo(x - w / 2, y); g.quadraticCurveTo(x, y - 2.4 - k * 2, x + w / 2, y); g.stroke();
    }
  }
  function bbWaterTint(g) {
    fillRectG(g, X0, BB.fq + 8, XW, BB.nq - BB.fq + 6, [[0, A('#2bb3b1', 0)], [0.55, A('#2bb3b1', 0.18)], [1, A('#14707c', 0.55)]]);
    blob(g, BB.sunX, BB.fq + 54, 150, 46, '#fff1c4', 0.32);
  }
  // the little pier stage far right: a boardwalk on stilts from the right edge, a round stage with a cream lip, a mic stand and an arch of bulbs
  const BB_PS = { x: 1150, top: 440, rx: 46, ry: 9 };
  function bbArchBulbs() {
    const out = [];
    for (let i = 0; i <= 8; i++) { const a = PI + i / 8 * PI; out.push([BB_PS.x + Math.cos(a) * 42, BB_PS.top - 4 + Math.sin(a) * 58, [HV.pink, HV.gold, HV.green, HV.cream][i % 4]]); }
    return out;
  }
  function bbPier(g) {
    const P = BB_PS, lc = A(OL, 0.85);
    // the stilts, then the boardwalk from the right edge to the stage
    g.fillStyle = '#7a4a5a';
    for (let x = P.x - 30; x < 1400; x += 26) { g.fillStyle = lc; g.fillRect(x - 3, P.top + 2, 6, 52); g.fillStyle = '#8a5a5a'; g.fillRect(x - 1.8, P.top + 2, 3.6, 51); }
    cel(g, rect4(P.x, P.top - 3, 1400 - P.x, 9), '#c98a62', { line: 1.8, lineColor: lc, depth: 3, tension: 0, hi: '#f0b888', hiW: 1.6 });
    g.strokeStyle = A(OL, 0.4); g.lineWidth = 1; g.beginPath(); for (let x = P.x + 16; x < 1400; x += 16) { g.moveTo(x, P.top - 2); g.lineTo(x, P.top + 5); } g.stroke();
    // the round stage: lip wall with bulbs, then the floor
    const front = [], back = [], lip = 10;
    for (let i = 0; i <= 24; i++) { const a = i / 24 * PI; front.push([P.x - Math.cos(a) * P.rx, P.top + Math.sin(a) * P.ry]); }
    for (let i = 24; i >= 0; i--) { const a = i / 24 * PI; back.push([P.x - Math.cos(a) * P.rx, P.top + Math.sin(a) * P.ry + lip]); }
    cel(g, { poly: front.concat(back) }, '#c94f78', { line: 1.8, lineColor: lc, depth: 3, tension: 0 });
    for (let i = 1; i < 8; i++) { const a = i / 8 * PI; disc(g, P.x - Math.cos(a) * P.rx * 0.96, P.top + Math.sin(a) * P.ry + lip * 0.55, 1.8, '#ffe39a'); }
    cel(g, tk.ellipsePts(P.x, P.top, P.rx, P.ry, 28), '#e8a07a', { line: 1.8, lineColor: lc, depth: 2, hi: '#ffd0a8' });
    g.lineWidth = 2.4; g.strokeStyle = HV.cream; g.beginPath(); g.ellipse(P.x, P.top, P.rx - 1, P.ry - 1, 0, PI * 0.05, PI * 0.95); g.stroke();
    // the arch of fairy lights on two thin posts
    oline(g, [[P.x - 42, P.top - 2], [P.x - 42, P.top - 8]], 2.2, { taper: 0, color: lc });
    oline(g, tk.arcPts(P.x, P.top - 4, 42, 58, PI, TAU, 16), 2.6, { taper: 0, color: lc });
    oline(g, tk.arcPts(P.x, P.top - 4, 42, 58, PI, TAU, 16), 1.2, { taper: 0, color: '#c98a62' });
    bbArchBulbs().forEach((b) => { g.fillStyle = lc; g.fillRect(b[0] - 1, b[1] - 1, 2, 2.4); puffs(g, [[b[0], b[1] + 3, 2.6]], b[2], { lw: 1, line: lc, hi: '#ffffff' }); });
    // the mic stand, waiting
    const mx = P.x + 6;
    oline(g, [[mx - 8, P.top + 1], [mx, P.top - 6], [mx + 8, P.top + 1]], 2.6, { taper: 0, color: lc });
    oline(g, [[mx, P.top - 6], [mx, P.top - 40]], 3.4, { taper: 0, color: lc });
    oline(g, [[mx, P.top - 6], [mx, P.top - 40]], 1.6, { taper: 0, color: HV.chrome });
    puffs(g, [[mx, P.top - 44, 4.4]], '#5a5868', { lw: 1.6, line: lc, hi: '#c9cbd6' });
  }
  // boats strung with fairy lights: waterline at y 0 in local space, about 120 wide; bulbs from the mast top to the bow and the stern
  const BB_BOATS = [{ x: 446, y: 484, s: 0.62, col: HV.sky, ph: 0 }, { x: 676, y: 458, s: 0.48, col: '#ff9fc6', ph: 1.7 }, { x: 878, y: 494, s: 0.66, col: HV.gold, ph: 3.1 }];
  function boatBulbs() {
    const out = [], cols = [HV.pink, HV.gold, HV.green, HV.cream, HV.sky];
    [[60, -24], [-58, -24]].forEach((e, k) => sagPts(14, -88, e[0], e[1], 7, 6).forEach((p, j) => { if (j > 0 && j < 6) out.push([p[0], p[1] + 3, cols[(j + k * 2) % cols.length]]); }));
    return out;
  }
  function bbBoat(g, col) {
    ellip(g, 0, 7, 60, 7, A('#0f5a66', 0.3));
    oline(g, [[14, -22], [14, -90]], 4.4, { taper: 0 });
    oline(g, [[14, -22], [14, -90]], 2, { taper: 0, color: '#c98a62' });
    cel(g, { poly: [[14, -90], [32, -84], [14, -78]] }, HV.pink, { line: 1.8, depth: 1.5, tension: 0 });
    [[60, -24], [-58, -24]].forEach((e) => oline(g, sagPts(14, -88, e[0], e[1], 7, 12), 1.2, { taper: 0, color: A(OL, 0.8) }));
    boatBulbs().forEach((b) => puffs(g, [[b[0], b[1], 3]], b[2], { lw: 1.1, hi: '#ffffff' }));
    cel(g, rrect(-34, -46, 40, 26, 6), HV.cream, { line: 2.2, depth: 3, hi: '#ffffff' });
    cel(g, rect4(-38, -50, 48, 6), tint(col, 0.1), { line: 2, depth: 1.5, tension: 0 });
    [[-24, -34], [-8, -34]].forEach((w) => puffs(g, [[w[0], w[1], 4.2]], '#a8dcff', { lw: 1.6, hi: '#ffffff' }));
    cel(g, [[-62, -24, 1], [66, -24, 1], [54, -2], [44, 6], [-44, 6], [-56, -4]], col, { line: 2.4, depth: 5, tension: 0.35, hi: tint(col, 0.45),
      decor: (c) => { c.fillStyle = HV.cream; c.fillRect(-70, -20, 140, 5); c.fillStyle = A(wsh(col, 0.12), 0.8); c.fillRect(-70, -1, 140, 12); } });
    disc(g, 40, -12, 3.4, OL); disc(g, 40, -12, 2, HV.cream);
  }
  const boatSpr = (i) => mkSpr('bb|boat|' + i, 160, 130, (g) => { g.translate(80, 104); bbBoat(g, BB_BOATS[i].col); });
  function gullSpr(k) {
    return mkSpr('bb|gull|' + k, 48, 26, (g) => {
      g.lineCap = 'round'; g.lineJoin = 'round';
      const wing = (s) => (k === 0 ? [[24, 14], [24 + s * 7, 5], [24 + s * 15, 4], [24 + s * 21, 9]] : [[24, 14], [24 + s * 8, 12], [24 + s * 15, 15], [24 + s * 20, 20]]);
      [-1, 1].forEach((s) => {
        const p = wing(s);
        [[5.2, OL], [2.8, '#ffffff']].forEach((st) => { g.beginPath(); g.moveTo(p[0][0], p[0][1]); g.quadraticCurveTo(p[1][0], p[1][1], p[2][0], p[2][1]); g.lineTo(p[3][0], p[3][1]); g.strokeStyle = st[1]; g.lineWidth = st[0]; g.stroke(); });
        disc(g, p[3][0], p[3][1], 1.4, '#8a90a8');
      });
      ellip(g, 24, 15, 7.4, 4, OL); ellip(g, 24, 15, 5.8, 2.7, '#ffffff'); disc(g, 30, 14, 1.4, HV.gold);
    });
  }
  // the near quay: warm round cobbles in rows that grow toward the viewer, the stone coping at the water's edge, two bollards with rope and a
  // crate of fruit from the Snack Pier
  function bbQuay(g) {
    const y0 = BB.nq;
    fillRectG(g, X0, y0, XW, DH - y0 + 4, [[0, '#e9b48e'], [0.3, '#d6977c'], [1, '#9a6070']]);
    const r = R('bb-cobbles'), cc = ['#efc19a', '#e3ad8a', '#f4cfaa', '#dfa192', '#ebbca2'];
    let y = y0 + 15, rh = 7.5;
    while (y < DH + 10) {
      const sw = rh * 2.4;
      for (let x = X0 + r() * sw; x < X0 + XW; x += sw * (0.92 + r() * 0.3)) {
        const w = sw * (0.4 + r() * 0.08), hh = rh * 0.42, c = cc[Math.floor(r() * cc.length)];
        ellip(g, x - 0.8, y + 1.2, w, hh, A('#8a4e5e', 0.45));
        ellip(g, x, y, w * 0.96, hh * 0.92, c);
        ellip(g, x + w * 0.2, y - hh * 0.3, w * 0.4, hh * 0.32, A('#fff4e4', 0.4));
      }
      y += rh * 1.02; rh *= 1.16;
    }
    fillRectG(g, X0, y0 + 30, XW, DH - y0 - 30, [[0, A('#6a3050', 0)], [1, A('#6a3050', 0.5)]]);
    blob(g, BB.sunX - 30, y0 + 40, 380, 46, '#ffcf8a', 0.4);
    // the coping along the edge, with joints, and its shadow on the cobbles
    fillRectG(g, X0, y0 + 8, XW, 10, [[0, A('#6a3448', 0.4)], [1, A('#6a3448', 0)]]);
    cel(g, rect4(X0, y0 - 6, XW, 14), '#f6dcb8', { line: 2.4, depth: 4, tension: 0, hi: '#fff4e2', hiW: 2 });
    g.strokeStyle = A(OL, 0.45); g.lineWidth = 1.4; g.beginPath(); for (let x = X0 + 30; x < X0 + XW; x += 64) { g.moveTo(x, y0 - 5); g.lineTo(x, y0 + 7); } g.stroke();
    // two bollards with a loop of rope
    [470, 1196].forEach((bx, i) => {
      blob(g, bx - 10, y0 + 6, 22, 5, '#5a2a3a', 0.4);
      cel(g, [[bx - 8, y0 + 2, 1], [bx - 7, y0 - 16], [bx - 10, y0 - 20], [bx - 8, y0 - 25], [bx + 8, y0 - 25], [bx + 10, y0 - 20], [bx + 7, y0 - 16], [bx + 8, y0 + 2, 1]], '#3e4a6a', { line: 2.2, depth: 3, hi: '#7a86a8', tension: 0.3 });
      oline(g, [[bx - 8, y0 - 14], [bx, y0 - 10], [bx + 8, y0 - 14]], 3.4, { taper: 0 });
      oline(g, [[bx - 8, y0 - 14], [bx, y0 - 10], [bx + 8, y0 - 14]], 1.8, { taper: 0, color: '#e8c890' });
      if (i) { oline(g, [[bx + 8, y0 - 13], [bx + 20, y0 - 2], [bx + 36, y0 + 4]], 3.4, { taper: 0 }); oline(g, [[bx + 8, y0 - 13], [bx + 20, y0 - 2], [bx + 36, y0 + 4]], 1.8, { taper: 0, color: '#e8c890' }); }
    });
    // a crate of fruit from the Snack Pier
    const cx = 28, cy = y0 - 4;
    blob(g, cx + 30, cy + 8, 56, 8, '#5a2a3a', 0.4);
    const fr = R('bb-fruit');
    for (let i = 0; i < 9; i++) { const fx = cx + 6 + (i % 5) * 12 + (i > 4 ? 6 : 0), fy = cy - 34 - (i > 4 ? 7 : 0) + fr() * 2; puffs(g, [[fx, fy, 6.4]], i % 3 === 1 ? '#e8553f' : (i % 3 === 2 ? '#c6e03d' : '#ff9a2e'), { lw: 1.6, hi: '#ffffff' }); }
    cel(g, rect4(cx, cy - 30, 66, 30), '#d8955a', { line: 2.4, depth: 4, tension: 0, hi: '#f4c08a',
      decor: (c) => { c.fillStyle = A(OL, 0.35); c.fillRect(cx, cy - 20, 66, 2); c.fillRect(cx, cy - 10, 66, 2); } });
  }
  // a big cherry tree at the screen edge: a curving trunk rising from below the frame and a bubbly pink canopy across the top corner
  function bbTree(g, side) {
    const m = (p) => (side < 0 ? [p[0], p[1]] : [DW - p[0], p[1]]);
    const trunk = [[-6, 760], [24, 560], [14, 380], [36, 230], [74, 120], [130, 54]].map(m);
    tk.inkPath(g, trunk, { w: 66, color: OL, taper: 0.62, taperStart: 0, pressure: 'head', wobble: 0.03 });
    tk.inkPath(g, trunk, { w: 58, color: '#7a4a5a', taper: 0.62, taperStart: 0, pressure: 'head', wobble: 0.03 });
    tk.inkPath(g, trunk.map((p) => [p[0] + 10, p[1] - 2]), { w: 10, color: A('#b47a86', 0.9), taper: 0.62, taperStart: 0.05, pressure: 'head', wobble: 0.03 });
    tk.inkPath(g, trunk.map((p) => [p[0] - 12, p[1] + 4]), { w: 14, color: A('#5a2f42', 0.8), taper: 0.62, taperStart: 0.05, pressure: 'head', wobble: 0.03 });
    [[[60, 150], [130, 140], [210, 118]], [[40, 250], [90, 230], [130, 196]], [[100, 80], [190, 70], [300, 84]]].forEach((b) => { const bp = b.map(m); tk.inkPath(g, bp, { w: 12, color: OL, taper: 0.7, taperStart: 0, wobble: 0.04 }); tk.inkPath(g, bp, { w: 7.6, color: '#7a4a5a', taper: 0.7, taperStart: 0, wobble: 0.04 }); });
    const r = R('bb-tree', side);
    const spots = [[10, 20, 64], [110, 6, 58], [210, 34, 52], [310, 70, 40], [44, 110, 50], [150, 92, 46], [240, 124, 34], [96, 190, 30], [24, 200, 28], [372, 88, 26]];
    spots.forEach((s) => {
      const cs = []; for (let k = 0; k < 5; k++) cs.push([s[0] + (r() - 0.5) * s[2] * 1.3, s[1] + (r() - 0.5) * s[2] * 0.9, s[2] * (0.38 + r() * 0.26)]);
      puffs(g, cs.map((c) => m(c).concat([c[2]])), '#ffaccf', { lw: 2.6, shade: '#ec78ac', hi: '#fff0f6', lit: 0.1 });
    });
    spots.forEach((s) => { for (let k = 0; k < 3; k++) { const p = m([s[0] + (r() - 0.5) * s[2] * 1.4, s[1] + (r() - 0.5) * s[2]]); blossom(g, p[0], p[1], 6 + r() * 4, r() * TAU, { lw: 1.3, c0: '#ff7eb6', c1: '#ffe0ee' }); } });
  }
  // the live bunting between the two cherry trees: one cord, pennants grouped by colour, a gentle sway
  function bbBunting(ctx, T, x0, y0, x1, y1, n, size, cols, sag0, par) {
    const sag = sag0 + 5 * Math.sin(T.tt * 1.1) * T.mot, sw = Math.sin(T.tt * 1.7) * 0.5 * T.mot;
    const pts = sagPts(x0 - par, y0, x1 - par, y1, sag, n * 2);
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = OL; ctx.lineWidth = 2;
    ctx.beginPath(); pts.forEach((p, i) => { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.stroke();
    const tri = (i) => { const a = pts[i * 2], b = pts[i * 2 + 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, k = size * 1.3, wv = sw * Math.sin(i * 1.3 + T.tt * 2.2) * size * 0.35; return [a, b, [(a[0] + b[0]) / 2 - dy / L * k + wv, (a[1] + b[1]) / 2 + dx / L * k]]; };
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const t3 = tri(i); ctx.moveTo(t3[0][0], t3[0][1]); ctx.lineTo(t3[1][0], t3[1][1]); ctx.lineTo(t3[2][0], t3[2][1]); ctx.closePath(); }
    ctx.lineWidth = 3.6; ctx.stroke();
    cols.forEach((c, ci) => { ctx.beginPath(); for (let i = ci; i < n; i += cols.length) { const t3 = tri(i); ctx.moveTo(t3[0][0], t3[0][1]); ctx.lineTo(t3[1][0], t3[1][1]); ctx.lineTo(t3[2][0], t3[2][1]); ctx.closePath(); } ctx.fillStyle = c; ctx.fill(); });
    ctx.restore();
  }
  function bbItems() {
    const L = actL('ch1');
    const town = L('town', { x: 0, y: 100, w: 1010, h: 330 }, 0.1, bbTown);
    return [
      L('sky', full(0, 470), 0.02, bbSky),
      L('clouds', { x: 0, y: 20, w: DW, h: 250 }, 0, bbClouds, { scroll: 2.2 }),
      anim((ctx, T) => {
        // the sun breathes, gulls glide far off over the bay
        addMode(ctx, () => glowAt(ctx, BB.sunX - T.par * 0.02, BB.sunY, 120 + 8 * Math.sin(T.tt * 0.8), '#fff1c4', 0.35));
        const G = [[0, 0.21, 176, 30, 0], [0.45, 0.16, 236, 24, 1.3], [0.8, 0.13, 148, 20, 2.6]];
        for (let i = 0; i < G.length; i++) {
          const q = G[i], x = wrapv(q[0] * DW + T.tt * 18 * q[1] / 0.2 - T.par * 0.04, -60, DW + 120), y = q[2] + Math.sin(T.tt * 0.5 + q[4]) * 9;
          const fl = Math.sin(T.tt * 2.4 + q[4] * 3) > 0.55 ? 1 : 0;
          ART.blit(ctx, gullSpr(fl), x - q[3] / 2, y - q[3] * 0.27, q[3], q[3] * 0.54);
        }
      }),
      L('far', full(100, 330), 0.05, bbFar),
      town,
      L('water', { x: 0, y: BB.fq + 6, w: DW, h: BB.nq - BB.fq + 12 }, 0, bbWater),
      reflectAnim(town, BB.fq + 12, BB.nq - BB.fq - 10, 0.34, { amp: 3, squash: 0.8 }),
      L('watertint', { x: 0, y: BB.fq + 6, w: DW, h: BB.nq - BB.fq + 10 }, 0, bbWaterTint, { q: 0.5 }),
      anim((ctx, T) => {
        // water shimmer: short light strips that slide and wink
        const P = pset('bb-shim', 34, (r) => ({ x: r(), y: r(), w: 8 + r() * 26, sp: 0.4 + r() * 0.8, fq: 0.7 + r() * 1.6, ph: r() * TAU }));
        const ga = ctx.globalAlpha, n = T.low ? 20 : 34;
        for (let i = 0; i < n; i++) {
          const p = P[i], y = BB.fq + 16 + p.y * (BB.nq - BB.fq - 22), x = wrapv(p.x * DW + T.tt * 7 * p.sp, -40, DW + 80), w = p.w * (0.6 + 0.6 * (y - BB.fq) / 96);
          const a = Math.pow(0.5 + 0.5 * Math.sin(T.tt * p.fq + p.ph), 2) * 0.7;
          if (a < 0.04) continue;
          ctx.globalAlpha = ga * a; ctx.fillStyle = Math.abs(x - BB.sunX) < 170 ? '#fff4d0' : '#e6fffb';
          ctx.fillRect(x - w / 2, y, w, 2);
        }
        ctx.globalAlpha = ga;
      }),
      L('pier', { x: 1090, y: 370, w: 190, h: 130 }, 0.12, bbPier),
      anim((ctx, T) => {
        // the boats bob and rock; their fairy lights and the pier stage's arch twinkle
        const glows = [];
        BB_BOATS.forEach((b, i) => {
          const bob = Math.sin(T.tt * 0.9 + b.ph) * 2.2 * T.mot, rot = Math.sin(T.tt * 0.7 + b.ph) * 0.035 * T.mot, x = b.x - T.par * 0.2;
          ctx.save(); ctx.translate(x, b.y + bob); ctx.rotate(rot); ctx.scale(b.s, b.s);
          ART.blit(ctx, boatSpr(i), -80, -104, 160, 130);
          ctx.restore();
          boatBulbs().forEach((q, j) => glows.push(x + q[0] * b.s, b.y + bob + q[1] * b.s, q[2], i * 7 + j));
        });
        const pp = T.par * 0.12;
        bbArchBulbs().forEach((q, j) => glows.push(q[0] - pp, q[1] + 3, q[2], 40 + j));
        addMode(ctx, () => {
          for (let i = 0; i < glows.length; i += 4) { const tw = 0.5 + 0.5 * Math.sin(T.tt * (1.3 + (glows[i + 3] % 5) * 0.37) + glows[i + 3] * 1.9); glowAt(ctx, glows[i], glows[i + 1], 9, glows[i + 2], 0.3 + 0.5 * tw); }
          glowAt(ctx, 972 - T.par * 0.1, BB.fq - 55, 18 + 4 * Math.sin(T.tt * 1.6), '#fff1c4', 0.7);
        });
      }),
      L('ground', { x: 0, y: BB.nq - 60, w: DW, h: DH - BB.nq + 60 }, 0, bbQuay),
      L('fgL', { x: 0, y: 0, w: 420, h: DH }, 1, (g) => bbTree(g, -1)),
      L('fgR', { x: 860, y: 0, w: 420, h: DH }, 1, (g) => bbTree(g, 1)),
      anim((ctx, T) => {
        bbBunting(ctx, T, 372, 92, 914, 84, 13, 12, [HV.pink, HV.green, HV.gold, HV.cream, HV.sky], 44, T.par);
        drift(ctx, T, { key: 'ch1petals', n: 26, sprs: [petalSpr('#ffc2dc', 0), petalSpr('#ff9fc6', 1), petalSpr('#fff0f6', 2)], area: { x: 0, y: 0, w: DW, h: DH }, vx: 26, vy: 34, sway: 40, size: [12, 22], aspect: 1, tumble: true, spin: 0.7, alpha: [0.8, 1] });
      }),
      vigLayer('ch1vig', { color: '#5a2a5a', alpha: 0.32, inner: 0.36, hud: 0.64, hudColor: '#3a1a34' }),
    ];
  }
  SCENES.ch1 = { id: 'ch1', combat: true, cap: 1.5, mood: 'golden hour on the harbour', sway: 6, items: bbItems() };

  // ---------------------------------------------------------------------------------------------------------------
  // BOSS I, KRAKI'S STAGE (boss1): the end-of-pier stage grown to the size of the harbour, at sunset. The stage deck is the ground, its back edge
  // strung with bulbs; behind it the bay churns and sends up sound bubbles; a long pier crosses the whole picture carrying eight mic stands; a
  // huge sun in orange and bubblegum pink sinks into the sea and Blossom Bay is a dusky silhouette on its hill. A lighting truss across the top
  // sweeps coloured beams over the deck, speakers stacked on crates stand at both edges and thump on the beat, and the petals fly in a
  // stronger wind. Colour shift: hot sunset; a hard plum vignette.
  // ---------------------------------------------------------------------------------------------------------------
  const KS = { sea: 404, pier: 446, deck: 502, sunX: 862, sunY: 400 };
  const KS_CANS = [[190, '#ff5fa2'], [420, '#ffd84d'], [640, '#2bb3b1'], [860, '#ff8a5b'], [1090, '#ff5fa2']];
  const KS_WOOF = [[56, 484, 34], [56, 364, 28], [1222, 478, 34], [1222, 358, 28]];   // stacked straight onto the crates (crate tops at y 542 and 536)
  function ksSky(g) {
    fillRectG(g, X0, 0, XW, KS.sea + 12, [[0, '#46288a'], [0.24, '#9a3a90'], [0.48, '#ff5fa2'], [0.7, '#ff8a5b'], [0.88, '#ffb066'], [1, '#ffd38a']]);
    hvStars(g, 'ks-stars', 46, 0, 130);
    blob(g, KS.sunX, KS.sunY, 760, 340, '#ff8a5b', 0.55);
    blob(g, KS.sunX, KS.sunY, 320, 190, '#ffd38a', 0.7);
    const r0 = 132;
    g.save(); g.beginPath(); g.arc(KS.sunX, KS.sunY, r0, 0, TAU); g.clip();
    fillRectG(g, KS.sunX - r0, KS.sunY - r0, r0 * 2, r0 * 2, [[0, '#fff3b8'], [0.55, '#ffc46a'], [1, '#ff8a5b']]);
    for (let k = 0; k < 5; k++) { const y = KS.sunY - 26 + k * 18 + k * k * 2, hh = 3 + k * 2.2; g.fillStyle = A('#ff6fa0', 0.85); g.fillRect(KS.sunX - r0, y, r0 * 2, hh); }
    g.restore();
    g.lineWidth = 3; g.strokeStyle = A('#ff5f8a', 0.6); g.beginPath(); g.arc(KS.sunX, KS.sunY, r0, PI, TAU); g.stroke();
    // long flat sunset clouds, lit gold underneath
    [[180, 112, 1.2], [520, 70, 0.9], [1120, 120, 1.1], [760, 190, 0.7], [330, 236, 0.55], [1230, 250, 0.5]].forEach((c) => {
      const s = c[2], cs = [];
      for (let k = 0; k < 6; k++) cs.push([c[0] + (k - 2.5) * 30 * s, c[1] + (k % 2 ? -6 : 4) * s, (k === 2 || k === 3 ? 26 : 19) * s]);
      puffs(g, cs, '#ff9ac0', { lw: 2.2, line: A(OL, 0.5), shade: '#d0508a', hi: '#ffd6a8', lit: 0.12 });
      g.fillStyle = A('#ffcf8a', 0.7); g.beginPath(); tk.trace(g, rrect(c[0] - 80 * s, c[1] + 14 * s, 160 * s, 6 * s, 3 * s)); g.fill();
    });
  }
  // the sea under the sunset, the sun's path on it, and Blossom Bay a dusky silhouette on its hill with its windows lit
  function ksFar(g) {
    fillRectG(g, X0, KS.sea, XW, KS.pier + 30 - KS.sea, [[0, '#ffc48a'], [0.22, '#ff8fa4'], [0.6, '#4fb0b4'], [1, '#2a8f9a']]);
    g.fillStyle = A('#fff2c8', 0.85); g.fillRect(X0, KS.sea - 1, XW, 2);
    const r = R('ks-path');
    for (let i = 0; i < 34; i++) { const y = KS.sea + 3 + Math.pow(r(), 1.2) * 40, k = (y - KS.sea) / 40, w = (10 + r() * 34) * (0.6 + k * 0.6); g.fillStyle = A(r() < 0.5 ? '#fff2c8' : '#ffd38a', 0.6 + r() * 0.3); g.fillRect(KS.sunX + (r() - 0.5) * (80 + k * 90) - w / 2, y, w, 2); }
    const hill = (x) => KS.sea - 150 * Math.pow(clamp((390 - x) / 480, 0, 1), 0.85) - 6 * Math.sin(x * 0.03);
    const hp = []; for (let x = X0; x <= 410; x += 10) hp.push([x, hill(x)]);
    fillRidge(g, hp, KS.sea + 8, tk.lin(g, 0, 240, 0, KS.sea, [[0, '#8a3a86'], [1, '#6a2a72']]));
    oline(g, hp, 1.6, { color: A(OL, 0.5), taper: 0 });
    const hr = R('ks-town');
    for (let x = -80; x < 360; x += 24 + hr() * 10) {
      const w = 20 + hr() * 10, hy = hill(x + w / 2) + 6;
      for (let y = hy; y < KS.sea - 6; y += 22 + hr() * 6) {
        const h = 18 + hr() * 8, c = mixc(['#a54a8a', '#9a4a9a', '#b85a8a', '#8a4a9a'][Math.floor(hr() * 4)], '#6a2a72', 0.2);
        g.fillStyle = c; g.fillRect(x, y, w, h + 4);
        g.beginPath(); g.moveTo(x - 2, y); g.lineTo(x + w / 2, y - w * 0.36); g.lineTo(x + w + 2, y); g.closePath(); g.fillStyle = mixc(c, '#4a1a5a', 0.3); g.fill();
        if (hr() < 0.7) { g.fillStyle = '#ffd98a'; g.fillRect(x + w * 0.3, y + 5, 4, 5); }
        if (hr() < 0.4) { g.fillStyle = '#ffb0d0'; g.fillRect(x + w * 0.65, y + 5, 4, 5); }
      }
    }
  }
  function ksMicStand(g, x, base, s, i) {
    const body = '#4a1f5a', rim = '#ffb070', dir = x < KS.sunX ? 1 : -1;
    const line = (pts, w) => { oline(g, pts, w + 2.6, { taper: 0 }); oline(g, pts, w, { taper: 0, color: body }); };
    line([[x - 14 * s, base + 1], [x, base - 12 * s], [x + 14 * s, base + 1]], 2.2 * s);
    line([[x, base - 10 * s], [x, base - 78 * s]], 3 * s);
    oline(g, [[x + 1.2 * s, base - 12 * s], [x + 1.2 * s, base - 76 * s]], 1 * s, { taper: 0, color: A(rim, 0.9) });
    cel(g, rrect(x - 4 * s, base - 50 * s, 8 * s, 7 * s, 2 * s), body, { line: 1.6, depth: 1, tension: 0.3 });
    const hx = x + dir * 15 * s, hy = base - 92 * s;
    line([[x, base - 74 * s], [hx, hy + 8 * s]], 2.2 * s);
    g.save(); g.translate(hx, hy); g.rotate(dir * 0.5);
    cel(g, [[-3 * s, 10 * s, 1], [3 * s, 10 * s, 1], [4 * s, 20 * s], [-4 * s, 20 * s]], '#2a2238', { line: 1.6, depth: 1, tension: 0.2 });
    puffs(g, [[0, 0, 7.5 * s]], '#c9cbd6', { lw: 1.8, shade: '#8a8ca6', hi: '#ffffff' });
    g.fillStyle = i % 2 ? HV.pink : HV.teal; g.fillRect(-6 * s, 6 * s, 12 * s, 3 * s);
    g.restore();
  }
  // the long pier across the bay: stilts, the deck in silhouette with a sunset rim, a rope railing, and eight mic stands along it
  function ksPier(g) {
    const y = KS.pier;
    for (let x = X0 + 10; x < X0 + XW; x += 40) { g.fillStyle = OL; g.fillRect(x - 4, y + 4, 8, 62); g.fillStyle = '#5a2a5a'; g.fillRect(x - 2.4, y + 4, 4.8, 61); }
    cel(g, rect4(X0, y - 4, XW, 11), '#6a2f62', { line: 2, depth: 3, tension: 0, hi: '#ffb070', hiW: 2 });
    for (let x = X0 + 30; x < X0 + XW; x += 76) { cel(g, rect4(x - 2.5, y - 30, 5, 27), '#5a2a5a', { line: 1.6, depth: 1, tension: 0 }); }
    for (let x = X0 + 30; x < X0 + XW - 76; x += 76) { oline(g, sagPts(x, y - 27, x + 76, y - 27, 7, 8), 2.6, { taper: 0 }); oline(g, sagPts(x, y - 27, x + 76, y - 27, 7, 8), 1.2, { taper: 0, color: '#e8a878' }); }
    for (let i = 0; i < 8; i++) ksMicStand(g, 104 + i * 153, y - 4, 1, i);
  }
  function ksWater(g) {
    fillRectG(g, X0, KS.pier + 6, XW, KS.deck + 16 - KS.pier, [[0, '#3fb8b4'], [0.6, '#228a96'], [1, '#17606f']]);
    const r = R('ks-foam');
    g.lineCap = 'round';
    for (let i = 0; i < 46; i++) {
      const y = KS.pier + 14 + r() * (KS.deck - KS.pier - 14), x = X0 + r() * XW, w = 12 + r() * 22;
      g.strokeStyle = A('#d9fff4', 0.45 + 0.3 * r()); g.lineWidth = 2;
      g.beginPath(); g.moveTo(x - w / 2, y + 2); g.quadraticCurveTo(x - w * 0.1, y - 5, x + w / 2, y); g.stroke();
    }
    blob(g, KS.sunX, KS.pier + 20, 200, 26, '#ffb066', 0.4);
  }
  function ksDeckBulbs() { const out = []; for (let x = X0 + 18; x < X0 + XW; x += 36) out.push([x, KS.deck - 1, [HV.gold, HV.pink, HV.cream, HV.teal][Math.round((x - X0) / 36) % 4]]); return out; }
  // the stage deck: warm boards running toward the bay, spotlight pools, and the cream lip with bulbs along the back edge
  function ksDeck(g) {
    const y0 = KS.deck;
    fillRectG(g, X0, y0, XW, DH - y0 + 4, [[0, '#d07a58'], [0.25, '#b05a52'], [0.6, '#7a3448'], [1, '#4a1a38']]);
    // planks running across the stage: seams that open out toward the viewer, staggered butt joints, a lit edge on every plank
    const r = R('ks-planks');
    let yy = y0 + 6, step = 9, row = 0;
    while (yy < DH + 4) {
      g.fillStyle = A('#ffcf9a', 0.16); g.fillRect(X0, yy + 1.5, XW, Math.max(1, step * 0.18));
      g.fillStyle = A('#3a1028', 0.5); g.fillRect(X0, yy - 1, XW, 1.4 + row * 0.25);
      const jw = 90 + step * 9;
      g.strokeStyle = A('#3a1028', 0.45); g.lineWidth = 1.2 + row * 0.2; g.beginPath();
      for (let x = X0 + ((row * 0.37) % 1) * jw + r() * 20; x < X0 + XW; x += jw * (0.8 + r() * 0.4)) { g.moveTo(x, yy); g.lineTo(x + (x - 640) * 0.03, yy + step); }
      g.stroke();
      yy += step; step *= 1.24; row++;
    }
    blob(g, 420, y0 + 54, 220, 34, '#ff7eb6', 0.32); blob(g, 900, y0 + 60, 240, 36, '#ffb066', 0.32);
    cel(g, rect4(X0, y0 - 9, XW, 13), '#ffe9cc', { line: 2.6, depth: 3, tension: 0, hi: '#ffffff', hiW: 2 });
    ksDeckBulbs().forEach((b) => puffs(g, [[b[0], b[1], 3.6]], b[2], { lw: 1.4, hi: '#ffffff' }));
  }
  // the lighting truss across the top: two tubes with a zigzag between and five spot cans hanging under it
  function ksTruss(g) {
    const t0 = 16, t1 = 40;
    const zz = []; for (let x = X0, k = 0; x <= X0 + XW; x += 24, k++) zz.push([x, k % 2 ? t0 : t1]);
    oline(g, zz, 5.4, { taper: 0 }); oline(g, zz, 2.6, { taper: 0, color: '#8a8aa8' });
    [t0, t1].forEach((y) => { oline(g, [[X0, y], [X0 + XW, y]], 9, { taper: 0 }); oline(g, [[X0, y], [X0 + XW, y]], 5, { taper: 0, color: '#9a9ab8' }); oline(g, [[X0, y - 1.4], [X0 + XW, y - 1.4]], 1.4, { taper: 0, color: '#e6e6f4' }); });
    KS_CANS.forEach((c) => {
      const x = c[0];
      oline(g, [[x, t1], [x, t1 + 12]], 4, { taper: 0 });
      cel(g, rrect(x - 15, t1 + 10, 30, 30, 8), '#2c2440', { line: 2.4, depth: 4, hi: '#5a5070' });
      puffs(g, [[x, t1 + 42, 11]], tint(c[1], 0.45), { lw: 2.2, hi: '#ffffff' });
    });
  }
  // a stack of speakers on a crate, standing on the near deck at a screen edge
  function ksStack(g, side) {
    const cx = side < 0 ? 56 : 1222, base = side < 0 ? 612 : 606;
    blob(g, cx, base + 4, 110, 14, '#2a0c24', 0.5);
    cel(g, rect4(cx - 74, base - 70, 148, 70), '#c8885a', { line: 2.8, depth: 6, tension: 0, hi: '#ecb07e',
      decor: (c) => { c.fillStyle = A(OL, 0.35); [base - 50, base - 26].forEach((y) => c.fillRect(cx - 74, y, 148, 3)); c.fillRect(cx - 4, base - 70, 3, 70); } });
    KS_WOOF.filter((w) => (side < 0 ? w[0] < 640 : w[0] > 640)).forEach((w, i) => {
      const bw = w[2] * 2 + 36, bh = w[2] * 2 + 58, bx = w[0] - bw / 2, by = w[1] - w[2] - 34;
      cel(g, rrect(bx, by, bw, bh, 10), '#2c2440', { line: 3, depth: 7, hi: '#5a5070',
        decor: (c) => { c.fillStyle = i ? HV.teal : HV.pink; c.fillRect(bx, by, bw, 7); } });
      cel(g, tk.ellipsePts(w[0], w[1], w[2], w[2], 26), '#3a3450', { line: 2.6, depth: 4, hi: '#6a6488' });
      g.lineWidth = 1.6; g.strokeStyle = A('#14101e', 0.7); [0.78, 0.56].forEach((k) => { g.beginPath(); g.arc(w[0], w[1], w[2] * k, 0, TAU); g.stroke(); });
      puffs(g, [[w[0], w[1], w[2] * 0.3]], '#c9cbd6', { lw: 2, hi: '#ffffff' });
      puffs(g, [[w[0], by + 18, 8]], '#3a3450', { lw: 2, hi: '#8a84a8' });
    });
  }
  function bubbleSpr(k) {
    return mkSpr('ks|bubble|' + k, 40, 40, (g) => {
      g.beginPath(); g.arc(20, 20, 16, 0, TAU); g.fillStyle = A(k % 2 ? '#d9fff4' : '#ffe3f1', 0.3); g.fill();
      g.lineWidth = 2.2; g.strokeStyle = A(OL, 0.75); g.stroke();
      g.lineWidth = 1.6; g.strokeStyle = A('#ffffff', 0.9); g.beginPath(); g.arc(20, 20, 11.5, -1.35, -0.25); g.stroke();
      disc(g, 26, 11, 2.2, '#ffffff');
      if (k >= 2) tk.note(g, 18, 25, 7, { kind: k === 2 ? 'eighth' : 'quarter', color: k === 2 ? HV.pink : HV.teal, line: 2 });
    });
  }
  function ksItems() {
    const L = actL('boss1');
    return [
      L('sky', full(0, KS.sea + 12), 0.02, ksSky),
      L('far', full(220, KS.pier + 30 - 220), 0.05, ksFar),
      anim((ctx, T) => {
        // the sun's path winks on the water
        const P = pset('ks-wink', 16, (r) => ({ y: r(), x: r(), fq: 1 + r() * 2, ph: r() * TAU, w: 10 + r() * 30 }));
        const ga = ctx.globalAlpha; ctx.fillStyle = '#fff2c8';
        for (let i = 0; i < 16; i++) { const p = P[i], a = Math.pow(0.5 + 0.5 * Math.sin(T.tt * p.fq + p.ph), 3); if (a < 0.05) continue; ctx.globalAlpha = ga * a * 0.8; ctx.fillRect(KS.sunX - T.par * 0.05 + (p.x - 0.5) * 160 - p.w / 2, KS.sea + 4 + p.y * 36, p.w, 2); }
        ctx.globalAlpha = ga;
      }),
      L('pier', { x: 0, y: 330, w: DW, h: 190 }, 0.12, ksPier),
      L('water', { x: 0, y: KS.pier + 4, w: DW, h: KS.deck - KS.pier + 14 }, 0, ksWater),
      anim((ctx, T) => {
        // the bay churns: foam curls rolling in two directions
        const P = pset('ks-churn', 22, (r) => ({ x: r(), y: r(), w: 14 + r() * 22, sp: (r() < 0.5 ? -1 : 1) * (14 + r() * 20), ph: r() * TAU }));
        ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = A('#ffffff', 0.75); ctx.lineWidth = 2.4; ctx.beginPath();
        for (let i = 0; i < 22; i++) {
          const p = P[i], x = wrapv(p.x * DW + T.tt * p.sp, -40, DW + 80), y = KS.pier + 16 + p.y * (KS.deck - KS.pier - 22) + Math.sin(T.tt * 2.2 + p.ph) * 2.5, w = p.w * (0.7 + 0.3 * Math.sin(T.tt * 1.7 + p.ph));
          ctx.moveTo(x - w / 2, y + 2); ctx.quadraticCurveTo(x, y - 6, x + w / 2, y + 1);
        }
        ctx.stroke(); ctx.restore();
        drift(ctx, T, { key: 'ks-bubbles', n: 22, sprs: [bubbleSpr(0), bubbleSpr(1), bubbleSpr(2), bubbleSpr(3), bubbleSpr(0)], area: { x: 0, y: 60, w: DW, h: KS.deck - 40 }, vx: -12, vy: -46, sway: 20, size: [14, 34], aspect: 1, alpha: [0.65, 1], wob: 0.1 });
      }),
      L('deck', { x: 0, y: KS.deck - 14, w: DW, h: DH - KS.deck + 14 }, 0, ksDeck),
      anim((ctx, T) => {
        // the beams sweep: an additive cone from each can, and its pool of light on the deck
        if (T.low) return;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        KS_CANS.forEach((c, i) => {
          const x = c[0] - T.par * 0.25, y = 92, a = PI / 2 + 0.42 * Math.sin(T.tt * 0.55 + i * 1.4), len = 560, hw = 0.12;
          const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
          ctx.fillStyle = tk.lin(ctx, x, y, ex, ey, [[0, A(c[1], 0.34)], [0.7, A(c[1], 0.1)], [1, A(c[1], 0)]]);
          ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x + Math.cos(a - hw) * len, y + Math.sin(a - hw) * len); ctx.lineTo(x + Math.cos(a + hw) * len, y + Math.sin(a + hw) * len); ctx.lineTo(x + 6, y); ctx.closePath(); ctx.fill();
          const k = (KS.deck + 30 - y) / Math.max(0.2, Math.sin(a)), px = x + Math.cos(a) * k;
          glowE(ctx, px, KS.deck + 30, 90, 20, c[1], 0.35);
        });
        ctx.restore();
      }),
      L('truss', { x: 0, y: 0, w: DW, h: 100 }, 0.25, ksTruss),
      L('fgL', { x: 0, y: 260, w: 150, h: 380 }, 1, (g) => ksStack(g, -1)),
      L('fgR', { x: 1140, y: 250, w: 150, h: 390 }, 1, (g) => ksStack(g, 1)),
      anim((ctx, T) => {
        // the deck bulbs twinkle, the speakers thump on the beat (126 bpm), petals fly in a stronger wind
        addMode(ctx, () => {
          ksDeckBulbs().forEach((b, i) => { const tw = 0.5 + 0.5 * Math.sin(T.tt * 3 - i * 0.7); glowAt(ctx, b[0], b[1], 10, b[2], 0.25 + 0.45 * tw); });
          KS_CANS.forEach((c, i) => glowAt(ctx, c[0] - T.par * 0.25, 82, 26, c[1], 0.6 + 0.2 * Math.sin(T.tt * 2 + i)));
        });
        const beat = T.mot < 1 ? 0 : Math.pow(1 - (((T.tt / (60 / 126)) % 1) + 1) % 1, 3);
        if (beat > 0.05) KS_WOOF.forEach((w) => tk.soundRings(ctx, w[0] - T.par, w[1], w[2] * 1.08, { n: 2, gap: 0.24, color: '#ffd38a', alpha: 0.7 * beat, lw: 2.4 }));
        drift(ctx, T, { key: 'ks-petals', n: 30, sprs: [petalSpr('#ffc2dc', 0), petalSpr('#ff9fc6', 1), petalSpr('#fff0f6', 2)], area: { x: 0, y: 0, w: DW, h: DH }, vx: -150, vy: 46, sway: 30, size: [12, 22], aspect: 1, tumble: true, spin: 1.2, alpha: [0.8, 1] });
      }),
      hardVig('boss1hv', '#2a0820', 0.72, { inner: 0.3 }),
      vigLayer('boss1vig', { color: '#2a0820', alpha: 0.18, inner: 0.4, hud: 0.72, hudColor: '#2a0c24' }),
    ];
  }
  SCENES.boss1 = { id: 'boss1', combat: true, cap: 1.5, mood: 'sunset karaoke on the pier', sway: 5, items: ksItems() };

  // ---------------------------------------------------------------------------------------------------------------
  // ACT II, SCROLLOPOLIS (ch2): a street at 2 am. Every building is a giant lit phone whose screen flips to new content every few seconds
  // (seeded): a wow face, a heart, a video, the feed, a laughing face, a thumb, the endless loading ring, an ad for the Night Noodle Market.
  // The Feed's glowing cables are strung across the sky with pulses running along them, notification bubbles drift up like balloons, hearts and
  // thumbs fall like snow, and a huge moon hangs over the rooftops where nobody looks. On the far pavement (which scrolls by itself) everyone
  // walks looking down, faces lit from below by their phones; low walls carry the only graffiti the city knows: `first!`, `mid`, `who asked`.
  // ---------------------------------------------------------------------------------------------------------------
  const SC = { walk: 474, kerb: 504 };
  const SC_B = [[-34, 164, 300], [150, 118, 236], [290, 148, 318], [462, 104, 212], [588, 152, 282], [764, 116, 230], [904, 152, 322], [1080, 120, 252], [1218, 134, 300]];
  const SC_BG = ['#3d7bff', '#ff6fb5', '#2a3a8a', '#26306a', '#a77bff', '#2ab8d8', '#1f2a5e', '#ff9a2e'];
  const SC_CW = 128, SC_CH = 224;
  const SC_SEQ = [1, 3, 2, 6, 5, 7, 0, 1, 3, 6, 2, 5, 7, 4, 3, 1, 6, 2];   // the faces (0 and 4) come up less often than the rest
  const scScreen = (b) => ({ x: b[0] + 10, y: SC.walk - b[2] + 22, w: b[1] - 20, h: b[2] - 58 });
  const SC_PEOPLE = [[14, 0.9, 1], [276, 1, 1], [404, 0.88, -1], [528, 0.86, 1], [772, 0.92, -1], [862, 0.84, 1], [1196, 0.96, -1]];
  // one screen's worth of content, drawn in a cell of SC_CW x SC_CH
  function scContent(g, k) {
    const W = SC_CW, H = SC_CH, cx = W / 2, cy = H * 0.44, bg = SC_BG[k];
    fillRectG(g, 0, 0, W, H, [[0, tint(bg, 0.22)], [1, bg]]);
    g.fillStyle = A('#ffffff', 0.18); g.fillRect(8, 8, W - 16, 10);                                     // the status bar
    const face = (happy) => {
      puffs(g, [[cx, cy, 38]], '#ffd84d', { lw: 3, hi: '#fff4b0' });
      if (happy) {
        [-14, 14].forEach((dx) => { g.lineWidth = 4; g.lineCap = 'round'; g.strokeStyle = OL; g.beginPath(); g.arc(cx + dx, cy - 6, 7, PI * 1.1, PI * 1.9); g.stroke(); });
        g.beginPath(); g.moveTo(cx - 20, cy + 6); g.quadraticCurveTo(cx, cy + 34, cx + 20, cy + 6); g.closePath(); g.fillStyle = OL; g.fill();
        g.beginPath(); g.ellipse(cx, cy + 18, 9, 5, 0, 0, TAU); g.fillStyle = '#ff6f8f'; g.fill();
        [-30, 30].forEach((dx) => { g.beginPath(); g.moveTo(cx + dx, cy - 2); g.quadraticCurveTo(cx + dx * 1.15, cy + 10, cx + dx, cy + 14); g.quadraticCurveTo(cx + dx * 0.85, cy + 10, cx + dx, cy - 2); g.fillStyle = '#7cc6ff'; g.fill(); });
      } else {
        [-14, 14].forEach((dx) => { ellip(g, cx + dx, cy - 6, 8, 11, '#ffffff'); disc(g, cx + dx, cy - 4, 4.6, OL); disc(g, cx + dx + 1.6, cy - 6.5, 1.6, '#ffffff'); });
        [-14, 14].forEach((dx) => { g.lineWidth = 3.4; g.lineCap = 'round'; g.strokeStyle = OL; g.beginPath(); g.moveTo(cx + dx - 7, cy - 24 - (dx > 0 ? 2 : 0)); g.lineTo(cx + dx + 6, cy - 26 + (dx > 0 ? 0 : 2)); g.stroke(); });
        ellip(g, cx, cy + 18, 8, 10, OL); ellip(g, cx, cy + 21, 5, 5, '#ff6f8f');
      }
    };
    if (k === 0) face(false);
    else if (k === 4) face(true);
    else if (k === 1) { heart(g, cx, cy, 34, '#ffffff', 3); heartPath(g, cx, cy, 22); g.fillStyle = '#ff6fb5'; g.fill(); star4(g, cx + 36, cy - 34, 9, '#ffffff', 0); star4(g, cx - 38, cy + 26, 6, '#ffffff', 0); }
    else if (k === 2) {
      puffs(g, [[cx, cy, 34]], '#ffffff', { lw: 3, hi: false });
      g.beginPath(); g.moveTo(cx - 10, cy - 15); g.lineTo(cx + 16, cy); g.lineTo(cx - 10, cy + 15); g.closePath(); g.fillStyle = '#ff5f8a'; g.fill();
      g.fillStyle = A('#ffffff', 0.4); g.fillRect(14, H - 50, W - 28, 6); g.fillStyle = '#ff5f8a'; g.fillRect(14, H - 50, (W - 28) * 0.4, 6); disc(g, 14 + (W - 28) * 0.4, H - 47, 6, '#ffffff');
    } else if (k === 3) {
      for (let i = 0; i < 5; i++) {
        const y = 32 + i * 36;
        disc(g, 26, y + 10, 11, ['#ff9fc6', '#8fe3c0', '#ffd84d', '#7cc6ff', '#c9a0ff'][i]);
        g.fillStyle = A('#ffffff', 0.75); g.fillRect(44, y + 2, 60 - (i % 3) * 10, 6); g.fillStyle = A('#ffffff', 0.4); g.fillRect(44, y + 13, 40 + (i % 2) * 20, 5);
      }
    } else if (k === 5) {
      g.save(); g.translate(cx, cy);
      cel(g, rrect(-24, -6, 40, 40, 9), '#ffffff', { line: 3, depth: 4, shadow: '#c8d8ff' });
      cel(g, [[-12, -4, 1], [-8, -30], [0, -40], [8, -36], [4, -6, 1]], '#ffffff', { line: 3, depth: 3, shadow: '#c8d8ff', tension: 0.4 });
      cel(g, rrect(-36, -4, 12, 40, 4), '#ffd84d', { line: 3, depth: 2 });
      g.restore();
    } else if (k === 6) {
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU - PI / 2; disc(g, cx + Math.cos(a) * 28, cy + Math.sin(a) * 28, 6.5, A('#ffffff', 0.15 + 0.85 * i / 7)); }
      g.fillStyle = A('#ffffff', 0.3); for (let i = 0; i < 3; i++) g.fillRect(20, H - 64 + i * 14, W - 40 - i * 18, 6);
    } else if (k === 7) {
      [[-14, -40], [4, -48], [20, -38]].forEach((s, i) => { g.lineWidth = 3.4; g.lineCap = 'round'; g.strokeStyle = A('#ffffff', 0.8); g.beginPath(); g.moveTo(cx + s[0], cy - 8); g.bezierCurveTo(cx + s[0] - 10, cy - 20, cx + s[0] + 10, cy - 30, cx + s[0], cy + s[1] + (i % 2) * 4); g.stroke(); });
      oline(g, [[cx + 4, cy - 2], [cx + 40, cy - 46]], 6, { taper: 0 }); oline(g, [[cx + 4, cy - 2], [cx + 40, cy - 46]], 3, { taper: 0, color: '#c98a62' });
      oline(g, [[cx + 12, cy - 2], [cx + 46, cy - 40]], 6, { taper: 0 }); oline(g, [[cx + 12, cy - 2], [cx + 46, cy - 40]], 3, { taper: 0, color: '#c98a62' });
      ellip(g, cx, cy + 2, 40, 9, OL); ellip(g, cx, cy + 2, 37, 7, '#ffd98a');
      g.lineWidth = 2.4; g.strokeStyle = '#e8b04a'; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(cx - 30 + i * 6, cy); g.quadraticCurveTo(cx - 10 + i * 8, cy - 7, cx + 10 + i * 6, cy + 1); g.stroke(); }
      disc(g, cx - 14, cy - 1, 5, '#3fcf6a'); disc(g, cx + 16, cy, 4, '#ff7a5a');
      cel(g, [[cx - 40, cy + 2, 1], [cx + 40, cy + 2, 1], [cx + 30, cy + 30], [cx - 30, cy + 30]], '#ffffff', { line: 3, depth: 5, shadow: '#e0d0f0', tension: 0.4, decor: (c) => { c.fillStyle = '#ff6fb5'; c.fillRect(cx - 40, cy + 12, 80, 6); } });
    }
    g.fillStyle = A('#ffffff', 0.5); g.beginPath(); tk.trace(g, rrect(cx - 18, H - 16, 36, 4, 2)); g.fill();       // the home bar
  }
  const scAtlas = () => mkSpr('sc|content', SC_CW * 8, SC_CH, (g) => { for (let k = 0; k < 8; k++) { g.save(); g.translate(k * SC_CW, 0); g.beginPath(); g.rect(0, 0, SC_CW, SC_CH); g.clip(); scContent(g, k); g.restore(); } });
  // which content screen i shows at time tt, and how long ago it changed
  function scShow(i, tt) {
    const P = 3.1 + (i % 3) * 0.85 + (i % 2) * 0.4, off = (U.hash('sc-off', i) % 1000) / 1000 * P, n = Math.floor((tt + off) / P);
    return { k: SC_SEQ[(U.hash('sc-show', i, n) + i * 5) % SC_SEQ.length], age: tt + off - n * P };
  }
  function scSky(g) {
    fillRectG(g, X0, 0, XW, SC.walk + 6, [[0, '#080b22'], [0.4, '#141a3a'], [0.72, '#1f2960'], [1, '#2c3a7c']]);
    hvStars(g, 'sc-stars', 50, 0, 200);
    blob(g, 380, 118, 360, 300, '#5a6ad8', 0.25);
    hvMoon(g, 380, 118, 100, { glow: '#8a9aff', base: '#fff2c4', shade: '#f2d79e' });
    blob(g, 640, SC.walk - 20, 760, 140, '#3d7bff', 0.28); blob(g, 1000, SC.walk - 40, 360, 120, '#ff6fb5', 0.16);
  }
  // the far skyline: two rows of hazy phone towers with dim screens, tiny windows and antenna lights
  function scFar(g) {
    [[0.62, 'sc-far0', 130, 260, '#1c2458'], [0.3, 'sc-far1', 90, 210, '#232c66']].forEach((row, ri) => {
      const r = R(row[1]);
      for (let x = X0 - 20; x < X0 + XW; x += 46 + r() * 40) {
        const w = 40 + r() * 46, h = row[2] + r() * row[3], y = SC.walk - h, col = mixc(row[4], '#3a4890', row[0] * 0.4);
        cel(g, rrect(x, y, w, h + 20, w * 0.22), col, { line: 1.6, lineColor: A('#0a0c22', 0.6), depth: 4, shadow: mixc(col, '#0a0c22', 0.35), tension: 0.5 });
        g.fillStyle = A(SC_BG[Math.floor(r() * 8)], 0.28 + 0.15 * ri); g.beginPath(); tk.trace(g, rrect(x + 5, y + 10, w - 10, Math.min(h * 0.4, w * 1.4), 5)); g.fill();
        for (let yy = y + Math.min(h * 0.4, w * 1.4) + 18; yy < SC.walk - 6; yy += 13) for (let xx = x + 6; xx < x + w - 8; xx += 9) if (U.hash('sc-win', Math.round(xx), Math.round(yy)) % 4 === 0) { g.fillStyle = A(U.hash('sc-wc', Math.round(xx + yy)) % 3 ? '#9fb0ff' : '#ffd98a', 0.4); g.fillRect(xx, yy, 4, 5); }
        if (r() < 0.5) { oline(g, [[x + w / 2, y + 2], [x + w / 2, y - 14]], 1.4, { taper: 0, color: A('#0a0c22', 0.8) }); disc(g, x + w / 2, y - 15, 2, '#ff6fb5'); }
      }
    });
    haze(g, 300, SC.walk, '#3d4fa8', 0, 0.3);
  }
  // the Feed's cables: sagging lines between the tower tops and off the edges of the picture
  const SC_CABLES = [[-60, 120, 220, 150, 40], [220, 150, 520, 100, 54], [520, 100, 760, 180, 40], [760, 180, 1010, 120, 46], [1010, 120, 1340, 160, 50], [-60, 230, 370, 168, 30], [370, 168, 830, 210, 70], [830, 210, 1340, 90, 60], [150, 60, 680, 40, 90], [680, 40, 1200, 70, 70]];
  function scCables(g) {
    SC_CABLES.forEach((c, i) => {
      const pts = sagPts(c[0], c[1], c[2], c[3], c[4], 24);
      oline(g, pts, 9, { taper: 0, color: A('#3ff0ff', 0.1) });
      oline(g, pts, 3.4, { taper: 0, color: '#0a0c22' });
      oline(g, pts, 1.3, { taper: 0, color: A(i % 3 === 1 ? '#ff6fb5' : '#3ff0ff', 0.85) });
      pts.forEach((p, j) => { if (j % 6 === 3) { disc(g, p[0], p[1], 3.4, '#0a0c22'); disc(g, p[0], p[1], 2, i % 2 ? '#ff6fb5' : '#3ff0ff'); } });
    });
  }
  // a little hoarding wall with sprayed graffiti in chunky rounded letters (the bible's three words only)
  function scWall(g, x0, x1, word, size, fill, tilt) {
    const top = SC.walk - 56;
    cel(g, rect4(x0, top, x1 - x0, 58), '#3a4380', { line: 2.4, depth: 6, tension: 0, hi: '#5a64a8',
      decor: (c) => { c.strokeStyle = A('#141a3a', 0.4); c.lineWidth = 1.4; c.beginPath(); for (let x = x0 + 34; x < x1; x += 40) { c.moveTo(x, top); c.lineTo(x, SC.walk); } c.stroke(); } });
    cel(g, rect4(x0 - 4, top - 6, x1 - x0 + 8, 8), '#5a64a8', { line: 2.2, depth: 2, tension: 0 });
    const cx = (x0 + x1) / 2, cy = top + 28;
    blob(g, cx, cy, (x1 - x0) * 0.5, 28, fill, 0.35);
    const W = sfWord(g, word, cx, cy, size, { fill, line: '#0a0c22', ol: 2.4, rim: HV.cream, rimW: 1.6, lw: 0.22, lean: 0.06, tilt, shadow: A('#0a0c22', 0.5), hi: A('#ffffff', 0.6) });
    const r = R('sc-drip', word);
    g.lineCap = 'round';
    for (let i = 0; i < 4; i++) { const dx = cx - W / 2 + r() * W, l = 6 + r() * 10; g.strokeStyle = fill; g.lineWidth = 2.2; g.beginPath(); g.moveTo(dx, cy + size * 0.42); g.lineTo(dx, cy + size * 0.42 + l); g.stroke(); disc(g, dx, cy + size * 0.42 + l, 1.8, fill); }
  }
  // a pedestrian looking down at a phone: a navy silhouette with a rim of screen light; x, base, scale, facing
  function scPerson(g, x, base, s, f) {
    g.save(); g.translate(x, base); g.scale(s * f, s);
    const body = '#12163e', rim = A('#3ff0ff', 0.55);
    g.lineCap = 'round'; g.strokeStyle = body; g.lineWidth = 6;
    g.beginPath(); g.moveTo(-4, 0); g.lineTo(-3, -16); g.moveTo(5, 0); g.lineTo(3, -16); g.stroke();
    g.beginPath(); tk.trace(g, rrect(-8, -38, 16, 24, 6)); g.fillStyle = body; g.fill();
    g.strokeStyle = body; g.lineWidth = 5; g.beginPath(); g.moveTo(5, -32); g.lineTo(10, -24); g.lineTo(9, -30); g.stroke();
    disc(g, 4, -45, 8, body);
    g.fillStyle = '#3ff0ff'; g.save(); g.translate(10, -31); g.rotate(-0.5); g.fillRect(-3, -4.5, 6, 9); g.restore();
    g.strokeStyle = rim; g.lineWidth = 1.6; g.beginPath(); g.arc(4, -45, 8, 0.1, 1.5); g.stroke();
    g.restore();
  }
  function scStreet(g) {
    // the buildings: giant phones, bezel and shade, a dark screen (the content is drawn live), a camera dot, a lit door at the bottom
    SC_B.forEach((b, i) => {
      const x = b[0], w = b[1], top = SC.walk - b[2], s = scScreen(b), body = ['#262e66', '#2c2a6a', '#22306a'][i % 3];
      cel(g, rrect(x, top, w, b[2] + 24, 20), body, { line: 2.8, lineColor: '#0a0c22', depth: 8, hi: '#5a68c0', hiW: 2.4, tension: 0.5 });
      g.fillStyle = '#0a0c26'; g.beginPath(); tk.trace(g, rrect(s.x - 2, s.y - 2, s.w + 4, s.h + 4, 11)); g.fill();
      g.fillStyle = '#0a0c22'; g.beginPath(); tk.trace(g, rrect(x + w / 2 - 14, top + 7, 28, 6, 3)); g.fill();
      disc(g, x + w / 2 + 22, top + 10, 3, '#0a0c22'); disc(g, x + w / 2 + 22, top + 10, 1.3, '#5a68c0');
      const dw = Math.min(30, w * 0.26);
      cel(g, rrect(x + w / 2 - dw / 2, SC.walk - 26, dw, 28, 5), '#ffd98a', { line: 2, lineColor: '#0a0c22', depth: 3, shadow: '#ffb050', tension: 0.4 });
    });
    // the far pavement (it scrolls by itself: the grooves are drawn live)
    cel(g, rect4(X0, SC.walk, XW, SC.kerb - SC.walk + 4), '#2e3a7a', { line: 2.2, lineColor: '#0a0c22', depth: 0, shadow: false, tension: 0, hi: '#5a68c0', hiW: 2 });
  }
  // in front of the screens: the night haze that keeps them mid-tone, the low walls with graffiti and the people on the pavement
  function scWalls(g) {
    fillRectG(g, X0, 140, XW, SC.walk - 140, [[0, A('#141a3a', 0.12)], [0.5, A('#141a3a', 0.3)], [1, A('#141a3a', 0.42)]]);
    scWall(g, 36, 250, 'first!', 34, '#ff6fb5', -0.05);
    scWall(g, 596, 742, 'mid', 40, '#3ff0ff', 0.04);
    scWall(g, 920, 1166, 'who asked', 30, '#c6ff3d', -0.03);
    SC_PEOPLE.forEach((p) => scPerson(g, p[0], SC.walk + 18, p[1], p[2]));
  }
  // the near street: blue asphalt, the kerb, soft reflections of the screens and puddles
  function scRoad(g) {
    const y0 = SC.kerb;
    fillRectG(g, X0, y0, XW, DH - y0 + 4, [[0, '#26307a'], [0.25, '#1b225a'], [1, '#0b0e2a']]);
    SC_B.forEach((b, i) => { const cx = b[0] + b[1] / 2; fillRectG(g, cx - b[1] * 0.36, y0 + 8, b[1] * 0.72, 150, [[0, A(SC_BG[(i * 3) % 8], 0.22)], [1, A(SC_BG[(i * 3) % 8], 0)]]); });
    const r = R('sc-puddles');
    for (let i = 0; i < 8; i++) { const x = 60 + i * 160 + (r() - 0.5) * 60, y = y0 + 40 + r() * 120, rx = 40 + r() * 50; ellip(g, x, y, rx, rx * 0.13, A('#3d7bff', 0.28)); ellip(g, x + rx * 0.2, y - 1, rx * 0.5, rx * 0.05, A('#9ff6ff', 0.35)); }
    g.strokeStyle = A('#ffd84d', 0.3); g.lineWidth = 3;
    g.beginPath(); for (let x = X0; x < X0 + XW; x += 90) { g.moveTo(x, y0 + 96); g.lineTo(x + 46, y0 + 96); } g.stroke();
    cel(g, rect4(X0, y0 - 4, XW, 10), '#8a94d8', { line: 2.4, lineColor: '#0a0c22', depth: 3, tension: 0, hi: '#c8d0ff', hiW: 2 });
  }
  // the near street furniture: a lamppost whose head is a ring light (left), a bundle of the Feed's cables and a reaction board (right)
  function scFg(g, side) {
    if (side < 0) {
      const x = 52;
      cel(g, [[x - 18, 730, 1], [x - 12, 690], [x - 7, 680, 1], [x + 7, 680, 1], [x + 12, 690], [x + 18, 730, 1]], '#2a3270', { line: 2.8, lineColor: '#0a0c22', depth: 4, tension: 0.3 });
      cel(g, rect4(x - 6, 150, 12, 540), '#2a3270', { line: 2.8, lineColor: '#0a0c22', depth: 4, hi: '#5a68c0', tension: 0 });
      oline(g, [[x, 156], [x + 30, 112], [x + 74, 104]], 10, { taper: 0, color: '#0a0c22' }); oline(g, [[x, 156], [x + 30, 112], [x + 74, 104]], 6, { taper: 0, color: '#2a3270' });
      g.lineWidth = 16; g.strokeStyle = '#0a0c22'; g.beginPath(); g.arc(x + 104, 126, 32, 0, TAU); g.stroke();
      g.lineWidth = 10; g.strokeStyle = '#e6f6ff'; g.beginPath(); g.arc(x + 104, 126, 32, 0, TAU); g.stroke();
      for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; disc(g, x + 104 + Math.cos(a) * 32, 126 + Math.sin(a) * 32, 1.6, '#9ff6ff'); }
      // a speech-bubble sign with a heart hanging off the post
      cel(g, rrect(x + 8, 300, 74, 52, 14), '#ff6fb5', { line: 2.6, lineColor: '#0a0c22', depth: 5, hi: '#ffb0d6' });
      cel(g, { poly: [[x + 22, 350], [x + 18, 368], [x + 38, 350]] }, '#ff6fb5', { line: 2.4, lineColor: '#0a0c22', depth: 0, shadow: false, tension: 0 });
      heart(g, x + 45, 324, 13, '#ffffff', 2.2);
      oline(g, [[x + 6, 304], [x + 14, 304]], 4, { taper: 0, color: '#0a0c22' });
    } else {
      [[0, '#1a2050', 0], [12, '#22285e', 1], [24, '#1a2050', 2]].forEach((c) => {
        const pts = sagPts(1160, -10, 1300, 150 + c[0] * 2, 70 + c[0] * 2, 16);
        oline(g, pts, 10, { taper: 0, color: '#0a0c22' }); oline(g, pts, 6, { taper: 0, color: c[1] });
        oline(g, pts.map((p) => [p[0] + 1, p[1] - 1.5]), 1.4, { taper: 0, color: A(c[2] === 1 ? '#ff6fb5' : '#3ff0ff', 0.85) });
      });
      cel(g, rrect(1214, 130, 44, 30, 8), '#2a3270', { line: 2.6, lineColor: '#0a0c22', depth: 4, hi: '#5a68c0' });
      disc(g, 1227, 145, 3.6, '#3ff0ff'); disc(g, 1245, 145, 3.6, '#ff6fb5');
    }
  }
  function notifSpr(k) {
    return mkSpr('sc|notif|' + k, 48, 64, (g) => {
      const col = ['#ff5f8a', '#3d7bff', '#ffffff', '#a77bff'][k];
      g.lineWidth = 1.4; g.strokeStyle = A('#e6f6ff', 0.8); g.beginPath(); g.moveTo(24, 40); g.quadraticCurveTo(20, 50, 26, 62); g.stroke();
      cel(g, rrect(6, 6, 36, 28, 11), col, { line: 2.4, lineColor: '#0a0c22', depth: 3, hi: '#ffffff', hiW: 1.6 });
      cel(g, { poly: [[16, 33], [22, 41], [26, 33]] }, col, { line: 2.2, lineColor: '#0a0c22', depth: 0, shadow: false, tension: 0 });
      if (k === 0) { heartPath(g, 24, 19, 8); g.fillStyle = '#ffffff'; g.fill(); }
      else if (k === 1) { [16, 24, 32].forEach((x) => disc(g, x, 20, 2.8, '#ffffff')); }
      else if (k === 2) { disc(g, 24, 16, 4.4, '#3d7bff'); g.fillStyle = '#3d7bff'; g.beginPath(); g.arc(24, 29, 8, PI, TAU); g.fill(); }
      else { star4(g, 24, 20, 9, '#ffffff', 0); }
    });
  }
  function snowSpr(k) {
    return mkSpr('sc|snow|' + k, 24, 24, (g) => {
      if (k === 0) heart(g, 12, 12, 8, '#ff6fb5', 1.8);
      else { cel(g, rrect(5, 11, 11, 9, 2.5), '#7cc6ff', { line: 1.6, lineColor: '#0a0c22', depth: 1.5 }); cel(g, [[7, 11, 1], [9, 3], [13, 4], [12, 11, 1]], '#7cc6ff', { line: 1.6, lineColor: '#0a0c22', depth: 1, tension: 0.3 }); }
    });
  }
  function scItems() {
    const L = actL('ch2');
    return [
      L('sky', full(0, SC.walk + 6), 0.02, scSky),
      anim((ctx, T) => { twinkle(ctx, T, { key: 'ch2', n: 26, h: 200, gold: 0.3 }); }),
      L('far', full(150, SC.walk - 130), 0.06, scFar),
      L('cables', full(0, 280), 0.1, scCables),
      anim((ctx, T) => {
        // pulses run along the Feed's cables
        const px = T.par * 0.1;
        addMode(ctx, () => SC_CABLES.forEach((c, i) => {
          const u = wrapv(T.tt * (0.07 + (i % 4) * 0.02) + i * 0.37, 0, 1), x = lerp(c[0], c[2], u), y = lerp(c[1], c[3], u) + c[4] * 4 * u * (1 - u);
          glowAt(ctx, x - px, y, 12, i % 3 === 1 ? '#ff6fb5' : '#3ff0ff', 0.85);
        }));
      }),
      L('street', { x: 0, y: 120, w: DW, h: SC.kerb - 116 }, 0.12, scStreet),
      anim((ctx, T) => {
        // the screens flip to new content every few seconds, with a quick white flash; their light spills onto the street; the phones light the faces
        const px = T.par * 0.12, atlas = scAtlas();
        if (!atlas || atlas._inert) return;
        const kx = atlas.width / (SC_CW * 8), ky = atlas.height / SC_CH, ga = ctx.globalAlpha;
        SC_B.forEach((b, i) => {
          const s = scScreen(b), sh = scShow(i, T.tt), x = s.x - px;
          ctx.globalAlpha = ga * 0.72;
          ctx.drawImage(atlas, sh.k * SC_CW * kx, 0, SC_CW * kx, SC_CH * ky, x, s.y, s.w, s.h);
          ctx.globalAlpha = ga;
          if (sh.age < 0.18 && T.mot >= 1) { ctx.globalAlpha = ga * 0.45 * (1 - sh.age / 0.18); ctx.fillStyle = '#e6f6ff'; ctx.fillRect(x, s.y, s.w, s.h); ctx.globalAlpha = ga; }
        });
        // the pavement scrolls by itself, like an escalator
        ctx.save(); ctx.strokeStyle = A('#8a9ae8', 0.4); ctx.lineWidth = 2; ctx.beginPath();
        const off = wrapv(T.tt * 22, 0, 40);
        for (let x = X0 - off; x < X0 + XW; x += 40) { ctx.moveTo(x - px, SC.walk + 6); ctx.lineTo(x - px - 8, SC.kerb - 6); }
        ctx.stroke(); ctx.restore();
      }),
      L('walls', { x: 0, y: 130, w: DW, h: SC.kerb - 126 }, 0.12, scWalls),
      anim((ctx, T) => {
        const px = T.par * 0.12, spill = [];
        SC_B.forEach((b, i) => { const s = scScreen(b); spill.push(s.x - px + s.w / 2, s.w, SC_BG[scShow(i, T.tt).k]); });
        addMode(ctx, () => {
          for (let i = 0; i < spill.length; i += 3) glowE(ctx, spill[i], SC.kerb + 20, spill[i + 1] * 0.75, 30, spill[i + 2], 0.28);
          SC_PEOPLE.forEach((p, i) => glowAt(ctx, p[0] + 8 * p[1] * p[2] - px, SC.walk + 18 - 38 * p[1], 13 * p[1], '#3ff0ff', 0.45 + 0.2 * Math.sin(T.tt * 3 + i * 1.7)));
        });
      }),
      L('road', { x: 0, y: SC.kerb - 8, w: DW, h: DH - SC.kerb + 8 }, 0, scRoad),
      L('fgL', { x: 0, y: 70, w: 190, h: 650 }, 1, (g) => scFg(g, -1)),
      L('fgR', { x: 1150, y: 0, w: 130, h: 240 }, 1, (g) => scFg(g, 1)),
      anim((ctx, T) => {
        addMode(ctx, () => { const p = 0.8 + 0.2 * Math.sin(T.tt * 1.9); glowAt(ctx, 156 - T.par, 126, 64, '#9ff6ff', 0.5 * p); glowE(ctx, 156 - T.par, SC.kerb + 26, 110, 24, '#9ff6ff', 0.3 * p); });
        drift(ctx, T, { key: 'ch2notif', n: 10, sprs: [notifSpr(0), notifSpr(1), notifSpr(2), notifSpr(3)], area: { x: 0, y: 60, w: DW, h: 460 }, vx: 6, vy: -24, sway: 22, size: [26, 40], aspect: 1.33, alpha: [0.85, 1], wob: 0.15 });
        drift(ctx, T, { key: 'ch2snow', n: 24, sprs: [snowSpr(0), snowSpr(1)], area: { x: 0, y: 0, w: DW, h: DH }, vx: -8, vy: 30, sway: 26, size: [12, 18], aspect: 1, spin: 0.4, alpha: [0.75, 1], wob: 0.5 });
      }),
      vigLayer('ch2vig', { color: '#05061a', alpha: 0.42, inner: 0.36, hud: 0.74, hudColor: '#05061a' }),
    ];
  }
  SCENES.ch2 = { id: 'ch2', combat: true, cap: 1.5, mood: 'the city at 2 am', sway: 6, items: scItems() };

  // ---------------------------------------------------------------------------------------------------------------
  // BOSS II, THE ROOFTOP (boss2): the top of the tallest phone-tower under the moon. The Feed's web of glowing cables fills the sky, radiating
  // from a giant ring light at centre back that stands on a tripod on the roof; pulses run out along the strands. Below the parapet the city's
  // tower tops glow, and at the left edge the Night Noodle Market's string lights twinkle over its stalls, steam rising. Gold glitter falls,
  // and the moon glows brighter as the fight goes on. Colour shift: violet and glitter gold; a hard violet vignette.
  // ---------------------------------------------------------------------------------------------------------------
  const SP = { cx: 640, cy: 236, ring: 118, par: 456, roof: 500 };
  let SP_WEB = null;
  function spWeb() {
    if (SP_WEB) return SP_WEB;
    const r = R('sp-web'), n = 18, spokes = [];
    for (let i = 0; i < n; i++) spokes.push(i / n * TAU + (r() - 0.5) * 0.12);
    const rings = []; let rad = SP.ring + 30;
    while (rad < 980) { rings.push(rad); rad *= 1.3; }
    SP_WEB = { spokes, rings };
    return SP_WEB;
  }
  function spSky(g) {
    fillRectG(g, X0, 0, XW, SP.par + 10, [[0, '#0d0626'], [0.35, '#2a1660'], [0.75, '#46208a'], [1, '#6a2a9a']]);
    hvStars(g, 'sp-stars', 70, 0, 300);
    hvMoon(g, 1040, 128, 92, { glow: '#ffd84d', base: '#fff2c4', shade: '#f2d79e' });
  }
  function spWebPaint(g) {
    const W = spWeb(), cx = SP.cx, cy = SP.cy;
    const at = (a, rr) => [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
    const strand = (pts) => { oline(g, pts, 7, { taper: 0, color: A('#3ff0ff', 0.12) }); oline(g, pts, 2.6, { taper: 0, color: A('#0a0620', 0.9) }); oline(g, pts, 1.2, { taper: 0, color: A('#7ff6ff', 0.9) }); };
    W.spokes.forEach((a) => strand([at(a, SP.ring + 14), at(a, 1000)]));
    W.rings.forEach((rr, k) => {
      for (let i = 0; i < W.spokes.length; i++) {
        const a0 = W.spokes[i], a1 = W.spokes[(i + 1) % W.spokes.length] + (i === W.spokes.length - 1 ? TAU : 0), p = at(a0, rr), q = at(a1, rr), m = at((a0 + a1) / 2, rr * 0.93);
        strand([p, m, q]);
        if (U.hash('sp-node', k, i) % 3 === 0) { disc(g, p[0], p[1], 3, '#0a0620'); star4(g, p[0], p[1], 4.6, '#ffd84d', 0); }
      }
    });
  }
  // the giant ring light on its tripod, standing on the roof at centre back
  function spRing(g) {
    const cx = SP.cx, cy = SP.cy, R0 = SP.ring;
    const legs = [[cx - 70, SP.roof + 30], [cx + 70, SP.roof + 30], [cx + 8, SP.roof + 44]];
    legs.forEach((l) => { oline(g, [[cx, SP.par - 10], l], 9, { taper: 0 }); oline(g, [[cx, SP.par - 10], l], 5, { taper: 0, color: '#3a2a6a' }); });
    cel(g, rect4(cx - 6, cy + R0 + 6, 12, SP.par - cy - R0 - 6), '#3a2a6a', { line: 2.6, depth: 3, hi: '#7a6ab8', tension: 0 });
    cel(g, rrect(cx - 12, cy + R0 - 2, 24, 16, 5), '#3a2a6a', { line: 2.4, depth: 2 });
    const inner = g.createRadialGradient(cx, cy, R0 * 0.2, cx, cy, R0);
    inner.addColorStop(0, A('#9ff6ff', 0.06)); inner.addColorStop(0.7, A('#9ff6ff', 0.16)); inner.addColorStop(1, A('#e6f6ff', 0.45));
    g.fillStyle = inner; g.beginPath(); g.arc(cx, cy, R0, 0, TAU); g.fill();
    g.lineWidth = 27; g.strokeStyle = OL; g.beginPath(); g.arc(cx, cy, R0, 0, TAU); g.stroke();
    g.lineWidth = 21; g.strokeStyle = '#f4f8ff'; g.beginPath(); g.arc(cx, cy, R0, 0, TAU); g.stroke();
    g.lineWidth = 6; g.strokeStyle = A('#c9d8ff', 0.8); g.beginPath(); g.arc(cx - 2, cy + 2, R0 - 4, PI * 0.55, PI * 1.25); g.stroke();
    g.lineWidth = 4; g.strokeStyle = A('#bff8ff', 0.9); g.beginPath(); g.arc(cx, cy, R0 + 5, 0, TAU); g.stroke();
    for (let i = 0; i < 48; i++) { const a = i / 48 * TAU; disc(g, cx + Math.cos(a) * R0, cy + Math.sin(a) * R0, 2.2, i % 2 ? '#ffffff' : '#d9f8ff'); }
  }
  // beyond the parapet: the city's tower tops with lit screens, and the Night Noodle Market's stalls on a lower roof at the left
  function spCity(g) {
    const r = R('sp-city');
    for (let x = X0; x < X0 + XW; x += 34 + r() * 30) {
      const w = 30 + r() * 30, top = SP.par - 30 - r() * 110, col = mixc('#2a1a5a', '#4a2a7a', r());
      if (x < 360 && top < SP.par - 70) continue;
      cel(g, rrect(x, top, w, SP.par - top + 10, w * 0.24), col, { line: 1.8, lineColor: A('#0a0620', 0.8), depth: 4, tension: 0.5 });
      g.fillStyle = A(SC_BG[Math.floor(r() * 8)], 0.5); g.beginPath(); tk.trace(g, rrect(x + 4, top + 8, w - 8, Math.min(40, (SP.par - top) * 0.5), 4)); g.fill();
      if (r() < 0.6) { oline(g, [[x + w / 2, top + 1], [x + w / 2, top - 12]], 1.6, { taper: 0, color: '#0a0620' }); disc(g, x + w / 2, top - 13, 2.2, r() < 0.5 ? '#ff6fb5' : '#ffd84d'); }
    }
    // the noodle market: striped awnings, a counter with bowls, string lights between poles
    const base = SP.par - 4;
    [[20, 92, '#ff6fb5'], [128, 96, '#2ec4b6'], [240, 100, '#ffd84d']].forEach((s, i) => {
      const x = s[0], w = s[1];
      cel(g, rect4(x + 6, base - 34, w - 12, 34), '#5a2a6a', { line: 2, lineColor: A(OL, 0.9), depth: 3, tension: 0 });
      cel(g, rect4(x + 10, base - 30, w - 20, 16), '#ffd98a', { line: 1.6, lineColor: A(OL, 0.9), depth: 0, shadow: false, tension: 0 });
      for (let k = 0; k < 3; k++) { ellip(g, x + 24 + k * (w - 48) / 2, base - 30, 9, 3.4, OL); ellip(g, x + 24 + k * (w - 48) / 2, base - 31, 7.6, 2.4, k % 2 ? '#fff4e6' : '#ffe0a0'); }
      const aw = [[x - 4, base - 40], [x + w + 4, base - 40], [x + w - 6, base - 62], [x + 6, base - 62]];
      cel(g, { poly: aw }, HV.cream, { line: 2.2, lineColor: A(OL, 0.9), depth: 0, shadow: false, tension: 0,
        decor: (c) => { c.fillStyle = s[2]; for (let k = 0; k < 6; k += 2) { const u0 = k / 6, u1 = (k + 1) / 6; c.beginPath(); c.moveTo(lerp(x - 4, x + w + 4, u0), base - 40); c.lineTo(lerp(x - 4, x + w + 4, u1), base - 40); c.lineTo(lerp(x + 6, x + w - 6, u1), base - 62); c.lineTo(lerp(x + 6, x + w - 6, u0), base - 62); c.closePath(); c.fill(); } } });
      for (let k = 0; k < 6; k++) { const sx = lerp(x - 4, x + w + 4, (k + 0.5) / 6); g.beginPath(); g.arc(sx, base - 40, (w + 8) / 12, 0, PI); g.fillStyle = k % 2 ? HV.cream : s[2]; g.fill(); g.lineWidth = 1.4; g.strokeStyle = A(OL, 0.9); g.stroke(); }
    });
    [[0, base - 70], [116, base - 74], [230, base - 72], [350, base - 70]].forEach((p) => { cel(g, rect4(p[0] - 2, p[1], 4, base - p[1]), '#3a2a6a', { line: 1.4, depth: 0, shadow: false, tension: 0 }); });
  }
  function spMarketBulbs() {
    const out = [], cols = [HV.gold, HV.pink, HV.cream, '#7cc6ff'];
    [[0, SP.par - 74, 116, SP.par - 78], [116, SP.par - 78, 230, SP.par - 76], [230, SP.par - 76, 350, SP.par - 74]].forEach((s, k) => sagPts(s[0], s[1], s[2], s[3], 12, 7).forEach((p, j) => { if (j > 0 && j < 7) out.push([p[0], p[1] + 3, cols[(j + k) % 4]]); }));
    return out;
  }
  function spMarketLines(g) { [[0, SP.par - 74, 116, SP.par - 78], [116, SP.par - 78, 230, SP.par - 76], [230, SP.par - 76, 350, SP.par - 74]].forEach((s) => oline(g, sagPts(s[0], s[1], s[2], s[3], 12, 14), 1.2, { taper: 0, color: A(OL, 0.9) })); spMarketBulbs().forEach((b) => puffs(g, [[b[0], b[1], 2.6]], b[2], { lw: 1, hi: '#ffffff' })); }
  // the roof: the parapet with an LED strip along its lip, then the deck in violet tiles with the ring light's reflection
  function spRoof(g) {
    cel(g, rect4(X0, SP.par, XW, SP.roof - SP.par + 6), '#3a2a72', { line: 2.6, depth: 5, tension: 0, hi: '#6a5aa8',
      decor: (c) => { c.strokeStyle = A('#1a0e3a', 0.5); c.lineWidth = 1.6; c.beginPath(); for (let x = X0 + 20; x < X0 + XW; x += 58) { c.moveTo(x, SP.par + 8); c.lineTo(x, SP.roof + 6); } c.stroke(); } });
    cel(g, rect4(X0, SP.par - 8, XW, 10), '#d8ccff', { line: 2.4, depth: 2, tension: 0, hi: '#ffffff' });
    const y0 = SP.roof;
    fillRectG(g, X0, y0, XW, DH - y0 + 4, [[0, '#3a2a7a'], [0.3, '#2a1c5e'], [1, '#100a2a']]);
    g.strokeStyle = A('#160c38', 0.6); g.lineWidth = 1.8; g.beginPath();
    for (let xb = -1000; xb < 2300; xb += 80) { g.moveTo(xb, DH + 4); g.lineTo(640 + (xb - 640) * 0.4, y0 + 2); }
    let yy = y0 + 14, st = 12; while (yy < DH) { g.moveTo(X0, yy); g.lineTo(X0 + XW, yy); yy += st; st *= 1.3; }
    g.stroke();
    blob(g, SP.cx, y0 + 60, 260, 40, '#9ff6ff', 0.25);
    blob(g, 1040, y0 + 40, 180, 26, '#ffd84d', 0.18);
    fillRectG(g, X0, y0, XW, 10, [[0, A('#0a0620', 0.45)], [1, A('#0a0620', 0)]]);
  }
  // near the edges: a rooftop vent box with a neon heart (left) and an antenna mast feeding cables up into the web (right)
  function spFg(g, side) {
    if (side < 0) {
      cel(g, rect4(-20, 410, 150, 200), '#2c2060', { line: 2.8, depth: 8, hi: '#5a4a9a', tension: 0,
        decor: (c) => { c.strokeStyle = A('#120a30', 0.6); c.lineWidth = 3; c.beginPath(); for (let y = 440; y < 600; y += 22) { c.moveTo(-10, y); c.lineTo(120, y); } c.stroke(); } });
      g.save(); g.lineJoin = 'round';
      heartPath(g, 60, 360, 40); g.lineWidth = 12; g.strokeStyle = OL; g.stroke(); g.lineWidth = 7; g.strokeStyle = '#ff6fb5'; g.stroke(); g.lineWidth = 2.4; g.strokeStyle = '#ffd6ea'; g.stroke();
      g.restore();
      oline(g, [[30, 396], [30, 410]], 4, { taper: 0 }); oline(g, [[92, 396], [92, 410]], 4, { taper: 0 });
    } else {
      const x = 1232;
      [[x - 40, 560], [x + 40, 560]].forEach((l) => { oline(g, [[x, 300], l], 7, { taper: 0 }); oline(g, [[x, 300], l], 3.4, { taper: 0, color: '#4a3a7a' }); });
      cel(g, rect4(x - 5, 60, 10, 500), '#3a2a6a', { line: 2.4, depth: 3, hi: '#7a6ab8', tension: 0 });
      for (let y = 100; y < 520; y += 46) oline(g, [[x - 14, y], [x + 14, y]], 3.4, { taper: 0 });
      [[x, 70, SP.cx + 600, -40], [x, 120, 1300, 40]].forEach((c) => { const pts = sagPts(c[0], c[1], c[2], c[3], -10, 12); oline(g, pts, 4, { taper: 0, color: '#0a0620' }); oline(g, pts, 1.6, { taper: 0, color: '#7ff6ff' }); });
      puffs(g, [[x, 56, 7]], '#ff6fb5', { lw: 2.2, hi: '#ffffff' });
    }
  }
  function steamSpr() { return mkSpr('sp|steam', 32, 32, (g) => { const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, A('#ffffff', 0.7)); gr.addColorStop(1, A('#ffffff', 0)); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); }); }
  function spItems() {
    const L = actL('boss2');
    return [
      L('sky', full(0, SP.par + 10), 0.02, spSky),
      anim((ctx, T) => {
        // the moon glows brighter as the fight goes on (by t only)
        const k = 0.3 + 0.55 * ss(0, 300, T.t) + 0.05 * Math.sin(T.tt * 0.7);
        addMode(ctx, () => { glowAt(ctx, 1040 - T.par * 0.02, 128, 230, '#fff2c4', 0.3 * k); glowAt(ctx, 1040 - T.par * 0.02, 128, 130, '#ffd84d', 0.35 * k); });
        twinkle(ctx, T, { key: 'boss2', n: 26, h: 300, gold: 0.5 });
      }),
      L('web', full(0, SP.par + 10), 0.04, spWebPaint, { q: 0.8 }),
      anim((ctx, T) => {
        // the web pulses along its strands: a glow runs out along every spoke
        const W = spWeb(), px = T.par * 0.04;
        addMode(ctx, () => {
          W.spokes.forEach((a, i) => {
            const u = wrapv(T.tt * 0.16 + (U.hash('sp-pulse', i) % 100) / 100, 0, 1), rr = SP.ring + 20 + u * 760, x = SP.cx + Math.cos(a) * rr - px, y = SP.cy + Math.sin(a) * rr;
            if (y < SP.par + 4) glowAt(ctx, x, y, 14, i % 3 ? '#3ff0ff' : '#ffd84d', 0.9 * (1 - u * 0.6));
          });
          const p = 0.6 + 0.4 * Math.sin(T.tt * 1.4);
          glowAt(ctx, SP.cx - px, SP.cy, SP.ring * 1.8, '#9ff6ff', 0.16 * p);
        });
      }),
      L('city', full(SP.par - 160, 170), 0.08, spCity),
      L('marketlights', { x: 0, y: SP.par - 100, w: 380, h: 40 }, 0.08, spMarketLines),
      L('ring', { x: SP.cx - 160, y: SP.cy - 160, w: 320, h: SP.roof + 60 - SP.cy + 160 }, 0.04, spRing),
      L('roof', { x: 0, y: SP.par - 12, w: DW, h: DH - SP.par + 12 }, 0, spRoof),
      L('fgL', { x: 0, y: 300, w: 150, h: 320 }, 1, (g) => spFg(g, -1)),
      L('fgR', { x: 1160, y: 0, w: 120, h: 580 }, 1, (g) => spFg(g, 1)),
      anim((ctx, T) => {
        const mp = T.par * 0.08;
        addMode(ctx, () => {
          spMarketBulbs().forEach((b, i) => glowAt(ctx, b[0] - mp, b[1], 9, b[2], 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(T.tt * 2.1 + i * 1.3))));
          const p = 0.75 + 0.25 * Math.sin(T.tt * 3.1) * Math.sin(T.tt * 1.1);
          glowAt(ctx, 60 - T.par, 360, 70, '#ff6fb5', 0.5 * p);
          glowAt(ctx, 1232 - T.par, 56, 22, '#ff6fb5', 0.5 + 0.5 * (Math.sin(T.tt * 4) > 0 ? 1 : 0));
        });
        drift(ctx, T, { key: 'boss2steam', n: 6, sprs: [steamSpr()], area: { x: 20, y: SP.par - 130, w: 300, h: 90 }, vx: 4, vy: -16, sway: 10, size: [16, 30], aspect: 1, alpha: [0.25, 0.5], wob: 0 });
        drift(ctx, T, { key: 'boss2glitter', n: 30, sprs: [sparkSpr('#ffd84d'), sparkSpr('#fff2c4'), moteSpr('#ffd84d')], area: { x: 0, y: 0, w: DW, h: DH }, vx: -6, vy: 34, sway: 18, size: [6, 14], aspect: 1, spin: 0.6, alpha: [0.6, 1], add: true, wob: 0 });
      }),
      hardVig('boss2hv', '#0e0420', 0.78, { inner: 0.3 }),
      vigLayer('boss2vig', { color: '#0e0420', alpha: 0.2, inner: 0.4, hud: 0.76, hudColor: '#0a0418' }),
    ];
  }
  SCENES.boss2 = { id: 'boss2', combat: true, cap: 1.5, mood: 'the rooftop of the feed', sway: 5, items: spItems() };

  // ---------------------------------------------------------------------------------------------------------------
  // ACT III, THE PERFECT STAGE (ch3): a colossal arena floating above a sea of phone lights, in opal and pastel chrome, perfectly symmetric
  // about the centre. Stepped stands rise at both sides, every tier filled with identical mannequin fans holding phones up with the same polite
  // smile; three identical empty judges' chairs float far back over the sea, whose phone lights twinkle in a perfect travelling wave; ring
  // lights hang in the sky like halos and breathe in unison; the mirror floor reflects the stands; confetti falls in a perfect grid, in
  // lockstep. The line here is a cool slate (the Perfect Stage reads too clean), and nothing is dark.
  // ---------------------------------------------------------------------------------------------------------------
  const PS = { edge: 452, sea: 404, tiers: 5 };
  const PSL = '#5a5f7a';
  const PS_RINGS = [[240, 118, 38], [440, 104, 44], [640, 92, 54], [840, 104, 44], [1040, 118, 38]];
  const psInner = (i) => 430 - i * 52;
  const psTop = (i) => PS.edge - 44 * (i + 1);
  function psSky(g, boss) {
    fillRectG(g, X0, 0, XW, PS.edge + 6, boss ? [[0, '#cbbff2'], [0.4, '#e3d9fb'], [0.72, '#f4f1fb'], [1, '#ffe3f1']] : [[0, '#968cd2'], [0.4, '#b8acea'], [0.72, '#d6cbf4'], [1, '#efdcee']]);
    // the Gloss's airbrush: soft diagonal opal sweeps, and tiny sparkles set out in a perfect grid
    [[-200, 0.18], [260, 0.12], [720, 0.16]].forEach((b) => {
      g.save(); g.globalAlpha = b[1]; g.fillStyle = tk.lin(g, b[0], 0, b[0] + 360, 300, [[0, A('#ffffff', 0)], [0.5, '#ffffff'], [1, A('#ffffff', 0)]]);
      g.beginPath(); g.moveTo(b[0], 0); g.lineTo(b[0] + 220, 0); g.lineTo(b[0] + 520, PS.edge); g.lineTo(b[0] + 300, PS.edge); g.closePath(); g.fill(); g.restore();
    });
    for (let j = 0; j < 4; j++) for (let i = 0; i < 17; i++) star4(g, 20 + i * 80 + (j % 2) * 40, 24 + j * 54, 3.2, A('#ffffff', 0.75), 0);
    // a soft shaft of light falls from every ring light, all exactly alike
    PS_RINGS.forEach((r) => {
      if (boss && Math.abs(r[0] - 640) <= 300) return;
      g.fillStyle = tk.lin(g, 0, r[1] + r[2], 0, PS.edge, [[0, A('#ffffff', 0.22)], [1, A('#ffffff', 0)]]);
      g.beginPath(); g.moveTo(r[0] - r[2] * 0.7, r[1] + r[2] * 0.7); g.lineTo(r[0] + r[2] * 0.7, r[1] + r[2] * 0.7); g.lineTo(r[0] + r[2] * 1.9, PS.edge); g.lineTo(r[0] - r[2] * 1.9, PS.edge); g.closePath(); g.fill();
    });
    blob(g, 640, PS.sea, 700, 90, boss ? '#ffe3f1' : '#f4e6fb', 0.7);
  }
  // the sea of phone lights far below the floating arena (the lights are drawn live), the horizon in chrome
  function psSea(g, boss) {
    fillRectG(g, X0, PS.sea, XW, PS.edge + 8 - PS.sea, boss ? [[0, '#efe8fb'], [0.3, '#cdc4ee'], [1, '#aba2dc']] : [[0, '#e2d9f7'], [0.3, '#b3aae0'], [1, '#8a81c4']]);
    // a soft airbrushed cloud bank far below the arena, the sea of phone lights under it
    const r = R('ps-bank');
    for (let i = 0; i < 26; i++) { const x = 400 + i * 19 + (r() - 0.5) * 10, rr = 14 + r() * 16; blob(g, x, PS.sea + 6 + r() * 6, rr * 1.6, rr * 0.7, boss ? '#ffffff' : '#f4f1fb', 0.85); }
    blob(g, 640, PS.sea + 4, 300, 20, '#ffffff', 0.4);
  }
  // the ring lights hanging in the sky like halos (their breathing glow is live)
  function psRing(g, x, y, r, w) {
    g.lineWidth = w + 4; g.strokeStyle = A(PSL, 0.7); g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
    g.lineWidth = w; g.strokeStyle = tk.lin(g, x - r, y - r, x + r, y + r, [[0, '#ffe3f1'], [0.35, '#ffffff'], [0.6, '#d9fff4'], [1, '#e6d9ff']]); g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
    const n = Math.round(r * 0.6);
    for (let i = 0; i < n; i++) { const a = i / n * TAU; disc(g, x + Math.cos(a) * r, y + Math.sin(a) * r, Math.max(1, w * 0.13), '#ffffff'); }
    g.lineWidth = 1.2; g.strokeStyle = A(PSL, 0.45); g.beginPath(); g.arc(x, y, r - w / 2 - 1, 0, TAU); g.stroke();
  }
  function psRings(g, boss) { PS_RINGS.forEach((r) => { if (!boss || Math.abs(r[0] - 640) > 300) psRing(g, r[0], r[1], r[2], r[2] * 0.2); }); }
  // one mannequin fan: a pale body, an oval head with the shared polite smile, one arm raising a phone toward the centre (dir +1 or -1)
  function psFan(g, x, base, s, dir, boss) {
    const lc = A(PSL, 0.55), body = boss ? '#ebe4fc' : '#d8cff3', head = boss ? '#fbf9ff' : '#f1edfb', ph = boss ? 50 : 40;
    g.lineCap = 'round';
    g.strokeStyle = lc; g.lineWidth = 5.6 * s; g.beginPath(); g.moveTo(x + dir * 5 * s, base - 19 * s); g.lineTo(x + dir * 10 * s, base - ph * s + 8 * s); g.stroke();
    g.fillStyle = lc; g.beginPath(); tk.trace(g, rrect(x - 10.4 * s, base - 23.4 * s, 20.8 * s, 26 * s, 7.6 * s)); g.fill();
    ellip(g, x, base - 31 * s, 8.6 * s, 9.6 * s, lc);
    g.fillStyle = body; g.beginPath(); tk.trace(g, rrect(x - 9 * s, base - 22 * s, 18 * s, 24 * s, 6.6 * s)); g.fill();
    ellip(g, x - 3 * s, base - 9 * s, 4 * s, 9 * s, A(PSL, 0.12));
    g.strokeStyle = body; g.lineWidth = 3.4 * s; g.beginPath(); g.moveTo(x + dir * 5 * s, base - 19 * s); g.lineTo(x + dir * 10 * s, base - ph * s + 8 * s); g.stroke();
    ellip(g, x, base - 31 * s, 7.4 * s, 8.4 * s, head);
    ellip(g, x - 2.6 * s, base - 29 * s, 4.4 * s, 6 * s, A('#c9bdf0', 0.45));
    g.strokeStyle = A(PSL, 0.7); g.lineWidth = Math.max(0.7, 1 * s); g.beginPath(); g.arc(x, base - 31 * s, 3.4 * s, 0.35, PI - 0.35); g.stroke();
    const px = x + dir * 10.5 * s, py = base - ph * s + 2 * s;
    g.fillStyle = PSL; g.fillRect(px - 3.4 * s, py - 5.4 * s, 6.8 * s, 10.8 * s);
    g.fillStyle = boss ? '#ffffff' : '#d9fff4'; g.fillRect(px - 2.3 * s, py - 4.2 * s, 4.6 * s, 8.4 * s);
  }
  // where every fan stands (both wings, mirror symmetric): [x, base, scale, dir, tier]
  let PS_FANS = null;
  function psFans() {
    if (PS_FANS) return PS_FANS;
    const out = [];
    for (let i = PS.tiers - 1; i >= 0; i--) {
      const s = 1 - i * 0.08, step = 30 * s;
      for (let k = 0; ; k++) { const x = psInner(i) - 18 * s - k * step; if (x < X0 - 10) break; out.push([x, psTop(i) + 3, s, 1, i]); out.push([DW - x, psTop(i) + 3, s, -1, i]); }
    }
    PS_FANS = out;
    return out;
  }
  // the stepped stands at both wings: chrome-lipped opal tiers, top tier first, each with its row of identical fans
  function psStands(g, boss) {
    const fans = psFans();
    for (let i = PS.tiers - 1; i >= 0; i--) {
      const top = psTop(i), riser = boss ? mixc('#e6d9ff', '#ffffff', 0.25 - i * 0.03) : mixc('#bfb1ee', '#ddd0fa', 0.1 + i * 0.14);
      [-1, 1].forEach((side) => {
        const x0 = side < 0 ? X0 : DW - psInner(i), x1 = side < 0 ? psInner(i) : X0 + XW;
        g.fillStyle = riser; g.fillRect(x0, top, x1 - x0, PS.edge - top + 8);
        g.fillStyle = A(boss ? '#ffe3f1' : '#d9fff4', 0.35); g.fillRect(x0, top + 6, x1 - x0, 6);
        g.fillStyle = '#f7f5fd'; g.fillRect(x0, top - 3, x1 - x0, 6);
        g.lineWidth = 1.4; g.strokeStyle = A(PSL, 0.5); g.beginPath(); g.moveTo(x0, top - 3); g.lineTo(x1, top - 3); g.moveTo(x0, top + 3); g.lineTo(x1, top + 3); g.lineTo(x1, PS.edge); g.stroke();
      });
      fans.forEach((f) => { if (f[4] === i) psFan(g, f[0], f[1], f[2], f[3], boss); });
    }
    // the higher tiers sit further back in the opal haze
    fillRectG(g, X0, 150, XW, PS.edge - 150, [[0, A(boss ? '#f4f1fb' : '#dcd2f8', boss ? 0.42 : 0.34)], [1, A(boss ? '#f4f1fb' : '#dcd2f8', 0.04)]]);
  }
  // three identical empty judges' chairs on a little floating platform far back over the sea
  function psJudges(g, boss) {
    const y = 392;
    blob(g, 640, y + 20, 110, 40, '#ffffff', 0.4);
    fillRectG(g, 600, y + 8, 80, 50, [[0, A('#ffffff', 0.35)], [1, A('#ffffff', 0)]]);
    [600, 640, 680].forEach((x) => {
      g.fillStyle = A(PSL, 0.6); g.beginPath(); tk.trace(g, rrect(x - 11.4, y - 41.4, 22.8, 32.8, 7)); g.fill();
      g.fillStyle = '#f7f5fd'; g.beginPath(); tk.trace(g, rrect(x - 10, y - 40, 20, 30, 6)); g.fill();
      g.fillStyle = A('#d9fff4', 0.7); g.beginPath(); tk.trace(g, rrect(x - 6, y - 35, 12, 20, 4)); g.fill();
      g.fillStyle = A(PSL, 0.6); g.fillRect(x - 1.2, y - 10, 2.4, 9);
      ellip(g, x, y - 10, 11, 3.4, A(PSL, 0.6)); ellip(g, x, y - 10.5, 9.6, 2.4, '#f7f5fd');
    });
    ellip(g, 640, y, 64, 9, A(PSL, 0.55)); ellip(g, 640, y - 1, 62, 7.6, '#f4f1fb');
    g.lineWidth = 1.6; g.strokeStyle = A('#c9cbd6', 0.9); g.beginPath(); g.ellipse(640, y, 58, 6, 0, 0.1, PI - 0.1); g.stroke();
  }
  // the mirror floor: a pale gradient with the chrome lip and its perfectly even little lights along the back edge
  function psFloor(g, boss) {
    fillRectG(g, X0, PS.edge, XW, DH - PS.edge + 4, boss ? [[0, '#efeafc'], [0.4, '#d6cdf3'], [1, '#aaa0d8']] : [[0, '#d2c9f2'], [0.4, '#aea3de'], [1, '#7a70b6']]);
  }
  function psFloorTop(g, boss) {
    // the perspective grid of the floor tiles, a diagonal sheen like a phone screen catching the light, and the fade toward the viewer
    g.strokeStyle = A('#ffffff', 0.35); g.lineWidth = 1.4; g.beginPath();
    for (let xb = -1400; xb < 2700; xb += 120) { g.moveTo(xb, DH + 4); g.lineTo(640 + (xb - 640) * 0.3, PS.edge + 2); }
    let yy = PS.edge + 12, st = 10; while (yy < DH) { g.moveTo(X0, yy); g.lineTo(X0 + XW, yy); yy += st; st *= 1.32; }
    g.stroke();
    fillRectG(g, X0, PS.edge, XW, DH - PS.edge, [[0, A(boss ? '#f4f1fb' : '#d2c9f2', 0)], [0.4, A(boss ? '#d6cdf3' : '#a69bd8', 0.45)], [1, A(boss ? '#aaa0d8' : '#7a70b6', 0.9)]]);
    g.save(); g.globalAlpha = 0.5;
    g.fillStyle = tk.lin(g, 300, PS.edge, 700, DH, [[0, A('#ffffff', 0)], [0.45, A('#ffffff', 0)], [0.52, A('#ffffff', 0.7)], [0.6, A('#ffffff', 0)], [1, A('#ffffff', 0)]]);
    g.fillRect(X0, PS.edge, XW, DH - PS.edge); g.restore();
    g.fillStyle = A(PSL, 0.6); g.fillRect(X0, PS.edge - 5, XW, 11);
    g.fillStyle = '#f7f5fd'; g.fillRect(X0, PS.edge - 4, XW, 8);
    g.fillStyle = A('#c9cbd6', 0.9); g.fillRect(X0, PS.edge + 2, XW, 2);
    for (let x = 640 - 20 * 33; x <= 640 + 20 * 33; x += 20) disc(g, x, PS.edge, 1.7, boss ? '#ffe3f1' : '#ffffff');
  }
  // chrome pillars at both edges, opal with chrome bands and a sheen (mirror symmetric)
  function psPillar(g, side) {
    const x = side < 0 ? 30 : DW - 30, w = 64;
    g.fillStyle = A(PSL, 0.6); g.fillRect(x - w / 2 - 2, -10, w + 4, DH + 20);
    g.fillStyle = tk.lin(g, x - w / 2, 0, x + w / 2, 0, [[0, '#cfc6ee'], [0.3, '#f7f5fd'], [0.55, '#e6d9ff'], [0.75, '#d9fff4'], [1, '#bfb6e6']]); g.fillRect(x - w / 2, -10, w, DH + 20);
    [70, 250, 430, 610].forEach((y) => { g.fillStyle = A(PSL, 0.6); g.fillRect(x - w / 2 - 6, y - 2, w + 12, 16); g.fillStyle = tk.lin(g, x - w / 2, 0, x + w / 2, 0, [[0, '#a8aabb'], [0.4, '#ffffff'], [1, '#9a9cb0']]); g.fillRect(x - w / 2 - 4, y, w + 8, 12); });
    g.fillStyle = A('#ffffff', 0.55); g.fillRect(x - w * 0.2, -10, 5, DH + 20);
  }
  // a perfect grid of confetti: every piece falls at the same speed with the same spin, the colours repeat in a fixed pattern. Fewer
  // particles keep every n-th row, so the grid stays perfect.
  function psConfSpr(k) {
    return mkSpr('ps|conf|' + k, 16, 16, (g) => { const c = [GL[1], GL[2], GL[3], HV.chrome][k]; g.fillStyle = A(PSL, 0.5); g.fillRect(2, 2, 12, 12); g.fillStyle = c; g.fillRect(3, 3, 10, 10); g.fillStyle = A('#ffffff', 0.7); g.fillRect(3, 3, 10, 3.4); });
  }
  function confettiGrid(ctx, T) {
    const rows = 9, cols = 16;
    let nr = Math.round(rows * Math.min(1, T.pf));
    if (nr <= 0) return;
    const stride = Math.max(1, Math.round(rows / nr)), gx = DW / cols, gy = 84, fall = T.tt * 34, rot = 0.6 + T.tt * 1.1, cs = Math.cos(rot), sn = Math.sin(rot), sz = 11;
    const sprs = [psConfSpr(0), psConfSpr(1), psConfSpr(2), psConfSpr(3)];
    const M = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
    ctx.save();
    for (let r = 0; r < rows; r += stride) {
      const y = wrapv(r * gy + fall, -gy / 2, rows * gy) - 20;
      for (let c = 0; c < cols; c++) {
        const x = gx / 2 + c * gx, sp = sprs[(r + c) % 4];
        if (!sp || sp._inert) continue;
        if (M) ctx.setTransform(M.a * cs + M.c * sn, M.b * cs + M.d * sn, -M.a * sn + M.c * cs, -M.b * sn + M.d * cs, M.a * x + M.c * y + M.e, M.b * x + M.d * y + M.f);
        else { ctx.save(); ctx.translate(x, y); ctx.rotate(rot); }
        ctx.drawImage(sp, -sz / 2, -sz / 2, sz, sz);
        if (!M) ctx.restore();
      }
    }
    ctx.restore();
  }
  // the mirror floor: the stands reflected straight down (one flipped blit), clipped to the floor
  function mirrorAnim(L, mirrorY, depth, alpha) {
    return anim((ctx, T) => {
      const rr = layerGeom(L), spr = layerSprite(L, rr, T);
      if (!spr || spr._inert || !spr.width) return;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, mirrorY, DW, depth); ctx.clip();
      ctx.globalAlpha = ctx.globalAlpha * alpha;
      ctx.translate(0, mirrorY * 2); ctx.scale(1, -1);
      ctx.drawImage(spr, rr.x - T.par * L.f, rr.y, rr.w, rr.h);
      ctx.restore();
    });
  }
  // the phone lights in the sea: a perfect grid in perspective rows whose twinkle runs across as one even wave
  function psSeaLights(ctx, T, boss) {
    const ga = ctx.globalAlpha, px = T.par * 0.04;
    ctx.fillStyle = boss ? '#ffffff' : '#f4fbff';
    for (let r = 0; r < 4; r++) {
      const y = PS.sea + 14 + r * 6 + r * r * 1.8, gap = 20 + r * 9, sz = 1.6 + r * 0.7;
      for (let c = -12; c <= 12; c++) {
        const x = 640 + c * gap - px;
        if (Math.abs(x - 640) > 250 + r * 12) continue;
        const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(T.tt * 2.2 - Math.abs(c) * 0.55 - r * 0.8));
        ctx.globalAlpha = ga * a; ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      }
    }
    ctx.globalAlpha = ga;
  }
  function psItems(id, boss) {
    const L = actL(id);
    const stands = L('stands', { x: 0, y: 150, w: DW, h: PS.edge - 142 }, 0.06, (g) => psStands(g, boss));
    const items = [
      L('sky', full(0, PS.edge + 6), 0.02, (g) => psSky(g, boss)),
      L('sea', { x: 0, y: PS.sea - 4, w: DW, h: PS.edge - PS.sea + 14 }, 0.04, (g) => psSea(g, boss)),
      anim((ctx, T) => psSeaLights(ctx, T, boss)),
      L('rings', { x: 0, y: 40, w: DW, h: 150 }, 0.03, (g) => psRings(g, boss)),
      anim((ctx, T) => {
        // the ring lights breathe in unison
        const p = 0.5 + 0.5 * Math.sin(T.tt * 1.5), px = T.par * 0.03;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        PS_RINGS.forEach((r) => {
          if (boss && Math.abs(r[0] - 640) <= 300) return;
          ctx.globalAlpha = 0.18 + 0.3 * p; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = r[2] * 0.36; ctx.beginPath(); ctx.arc(r[0] - px, r[1], r[2], 0, TAU); ctx.stroke();
        });
        ctx.restore();
      }),
      L('judges', { x: 560, y: 330, w: 160, h: 100 }, 0.05, (g) => psJudges(g, boss)),
      stands,
      L('floor', { x: 0, y: PS.edge, w: DW, h: DH - PS.edge }, 0, (g) => psFloor(g, boss)),
      mirrorAnim(stands, PS.edge + 4, DH - PS.edge, boss ? 0.32 : 0.28),
      L('floortop', { x: 0, y: PS.edge - 8, w: DW, h: DH - PS.edge + 8 }, 0, (g) => psFloorTop(g, boss)),
      L('fgL', { x: 0, y: 0, w: 70, h: DH }, 1, (g) => psPillar(g, -1)),
      L('fgR', { x: DW - 70, y: 0, w: 70, h: DH }, 1, (g) => psPillar(g, 1)),
      anim(confettiGrid),
    ];
    return items;
  }
  SCENES.ch3 = { id: 'ch3', combat: true, cap: 1.5, mood: 'the perfect stage, too clean', sway: 6, items: psItems('ch3', false).concat([
    vigLayer('ch3vig', { color: '#6a5fa8', alpha: 0.28, inner: 0.38, hud: 0.62, hudColor: '#3a3466' }),
  ]) };

  // ---------------------------------------------------------------------------------------------------------------
  // BOSS III, CENTRE STAGE (boss3): the centre of the Perfect Stage. The APPLAUSE sign blazes above with one warm red row of bulbs that chase,
  // a giant ring-light halo pulses behind the stage with the three empty chairs inside it, the mannequin crowd holds its phones up higher
  // and their screens flash in a perfect wave, the mirror floor shines and the confetti keeps its grid. Colour shift: brighter, cleaner
  // opal; the hard vignette is pale lilac, never dark.
  // ---------------------------------------------------------------------------------------------------------------
  const AP = { x0: 372, x1: 908, y0: 30, y1: 132 };
  function apBulbs() {
    const out = [];
    for (let x = AP.x0 + 18; x <= AP.x1 - 18; x += 22) out.push([x, AP.y1 - 9]);
    return out;
  }
  function apSign(g) {
    const w = AP.x1 - AP.x0, h = AP.y1 - AP.y0;
    oline(g, [[AP.x0 + 60, -10], [AP.x0 + 60, AP.y0]], 3, { taper: 0, color: A(PSL, 0.8) }); oline(g, [[AP.x1 - 60, -10], [AP.x1 - 60, AP.y0]], 3, { taper: 0, color: A(PSL, 0.8) });
    g.fillStyle = A(PSL, 0.8); g.beginPath(); tk.trace(g, rrect(AP.x0 - 3, AP.y0 - 3, w + 6, h + 6, 18)); g.fill();
    g.fillStyle = tk.lin(g, AP.x0, AP.y0, AP.x1, AP.y1, [[0, '#f7f5fd'], [0.4, '#c9cbd6'], [0.6, '#ffffff'], [1, '#b8bacb']]); g.beginPath(); tk.trace(g, rrect(AP.x0, AP.y0, w, h, 16)); g.fill();
    g.fillStyle = tk.lin(g, 0, AP.y0 + 16, 0, AP.y1 - 16, [[0, '#ffe3f1'], [1, '#e6d9ff']]); g.beginPath(); tk.trace(g, rrect(AP.x0 + 16, AP.y0 + 18, w - 32, h - 36, 8)); g.fill();
    apBulbs().forEach((b) => { disc(g, b[0], b[1], 5.4, A(PSL, 0.8)); disc(g, b[0], b[1], 4.2, '#ff5a5f'); disc(g, b[0] + 1.2, b[1] - 1.4, 1.4, '#ffd6d0'); });
    sfWord(g, 'APPLAUSE', 640, (AP.y0 + AP.y1) / 2 + 1, 38, { fill: '#ffffff', line: '#8a6fd0', ol: 2.6, rim: '#ffd6ea', rimW: 2, lw: 0.2, gap: 0.12, hi: A('#ffe3f1', 0.9) });
  }
  // the giant ring-light halo at the centre back, with its lilac stand rods running down behind the sea
  function apHalo(g) {
    const cx = 640, cy = 290, r = 172;
    [-1, 1].forEach((s) => { g.fillStyle = A(PSL, 0.5); g.fillRect(cx + s * 120 - 3, cy + 110, 6, PS.edge - cy - 110); g.fillStyle = '#e6e4f0'; g.fillRect(cx + s * 120 - 2, cy + 110, 4, PS.edge - cy - 110); });
    psRing(g, cx, cy, r, 26);
  }
  function apItems() {
    const items = psItems('boss3', true);
    const floorAt = items.findIndex((it) => it && it.name === 'floor');
    const L = actL('boss3');
    items.splice(floorAt - 2, 0,
      L('halo', { x: 440, y: 90, w: 400, h: PS.edge - 80 }, 0.04, apHalo),
      anim((ctx, T) => {
        const p = 0.5 + 0.5 * Math.sin(T.tt * 2.1), px = T.par * 0.04;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.2 + 0.35 * p; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 40; ctx.beginPath(); ctx.arc(640 - px, 290, 172, 0, TAU); ctx.stroke();
        ctx.restore();
      }));
    items.push(
      anim((ctx, T) => {
        // the phones flash in a perfect wave across the stands
        const px = T.par * 0.06, fans = psFans();
        addMode(ctx, () => {
          for (let i = 0; i < fans.length; i++) {
            const f = fans[i], a = Math.sin(T.tt * 3 - Math.abs(f[0] - 640) * 0.012 - f[4] * 0.6);
            if (a < 0.6) continue;
            glowAt(ctx, f[0] + f[3] * 10.5 * f[2] - px, f[1] - 48 * f[2], 9 * f[2], '#ffffff', (a - 0.6) * 2);
          }
        });
      }),
      L('sign', { x: AP.x0 - 10, y: 0, w: AP.x1 - AP.x0 + 20, h: AP.y1 + 12 }, 0.03, apSign),
      anim((ctx, T) => {
        // the sign blazes and its warm red bulbs chase
        const px = T.par * 0.03, B = apBulbs(), step = Math.floor(T.tt * 9);
        addMode(ctx, () => {
          glowE(ctx, 640 - px, (AP.y0 + AP.y1) / 2, 300, 70, '#ffe3f1', 0.35 + 0.1 * Math.sin(T.tt * 2.3));
          for (let i = 0; i < B.length; i++) { const on = ((i - step) % 3 + 3) % 3 === 0; glowAt(ctx, B[i][0] - px, B[i][1], on ? 14 : 8, '#ff6a5a', on ? 0.9 : 0.3); }
        });
      }),
      hardVig('boss3hv', '#c9b8f0', 0.6, { inner: 0.32 }),
      vigLayer('boss3vig', { color: '#b9a6e8', alpha: 0.12, inner: 0.4, hud: 0.55, hudColor: '#3a3466' }),
    );
    return items;
  }
  SCENES.boss3 = { id: 'boss3', combat: true, cap: 1.5, mood: 'centre stage, flawless', sway: 5, items: apItems() };


  // ===============================================================================================================
  // CAMP: the Green Room, a cosy backstage room. A teal wall with a fairy-light string, the dressing-room door with a big star, a mirror ringed
  // by warm bulbs over a dressing table with a little record player, a chubby sofa with a patchwork throw, set lists taped to the wall, a little
  // table with a kettle, a teapot and a bowl of clementines, and a potted plant. The kettle steams, the bulbs breathe, the record spins.
  // ===============================================================================================================
  const GR = { floor: 470, mirX: 300, mirY: 112, mirW: 210, mirH: 196, recX: 452, recY: 362, kettleX: 1000, kettleY: 404 };
  const GR_BULBS = [];
  function grWall(g) {
    fillRectG(g, X0, 0, XW, GR.floor + 6, [[0, '#123d42'], [0.5, '#1f5f63'], [1, '#2a7270']]);
    // soft wallpaper stripes and a little star print
    for (let x = X0; x < X0 + XW; x += 46) { g.fillStyle = A('#2f7c78', 0.45); g.fillRect(x, 0, 18, GR.floor); }
    const r = R('hv-gr-wall');
    for (let y = 30; y < GR.floor - 20; y += 46) for (let x = X0 + ((y / 46) % 2) * 23 + 14; x < X0 + XW; x += 46) star4(g, x + (r() - 0.5) * 2, y, 3.4, A('#7fd8c8', 0.35), 0);
    // the warm light of the mirror bulbs on the wall
    blob(g, GR.mirX + GR.mirW / 2, GR.mirY + GR.mirH / 2, 420, 300, '#ffcf8a', 0.32);
    blob(g, 1040, 300, 380, 240, '#ffcf8a', 0.16);
    // the skirting board
    cel(g, rect4(X0, GR.floor - 16, XW, 18), '#fff1d6', { line: 2.4, depth: 4, tension: 0 });
  }
  function grFloor(g) {
    fillRectG(g, X0, GR.floor, XW, DH - GR.floor, [[0, '#9a5e3e'], [0.4, '#7e4a32'], [1, '#4a2a22']]);
    g.strokeStyle = A('#4a2418', 0.6); g.lineWidth = 2;
    for (let k = 1; k < 9; k++) { const y = GR.floor + k * k * 3.4; g.beginPath(); g.moveTo(X0, y); g.lineTo(X0 + XW, y); g.stroke(); }
    const r = R('hv-gr-boards');
    for (let k = 0; k < 8; k++) { const y0 = GR.floor + k * k * 3.4, y1 = GR.floor + (k + 1) * (k + 1) * 3.4; for (let x = X0 + r() * 120; x < X0 + XW; x += 140 + r() * 90) { g.beginPath(); g.moveTo(x, y0); g.lineTo(x + (x - 640) * 0.05, y1); g.stroke(); } }
    // the braided rug in pink, cream and green rings
    const rx = 330, ry = 66, cx = 660, cy = 610;
    ellip(g, cx - 6, cy + 8, rx + 8, ry + 6, A('#1a0a10', 0.4));
    ellip(g, cx, cy, rx + 3, ry + 3, OL);
    [[1, HV.pink], [0.86, HV.cream], [0.74, '#3fbf74'], [0.62, '#ffd84d'], [0.5, HV.pink], [0.38, HV.cream], [0.26, '#3fbf74']].forEach((p) => ellip(g, cx, cy, rx * p[0], ry * p[0], p[1]));
    g.save(); g.strokeStyle = A(OL, 0.25); g.lineWidth = 1.2; for (let k = 1; k < 7; k++) { g.beginPath(); g.ellipse(cx, cy, rx * (1 - k * 0.12), ry * (1 - k * 0.12), 0, 0, TAU); g.stroke(); } g.restore();
    g.fillStyle = A('#ffffff', 0.18); g.beginPath(); g.ellipse(cx + 60, cy - 20, rx * 0.5, ry * 0.3, 0, 0, TAU); g.fill();
  }
  function grDoor(g) {
    // the frame, the door (stage red) with a big gold star, a round knob and a little light above
    cel(g, rect4(56, 128, 184, GR.floor - 128 + 4), '#fff1d6', { line: 2.8, depth: 6, tension: 0 });
    cel(g, rect4(74, 146, 148, GR.floor - 146), HV.red, { line: 2.6, depth: 10, shadow: HV.redD, hi: '#e8507a', hiW: 3, tension: 0,
      decor: (c) => { [[88, 160, 120, 120], [88, 300, 120, 150]].forEach((p) => { c.strokeStyle = A(HV.redD, 0.9); c.lineWidth = 3; c.strokeRect(p[0], p[1], p[2], p[3]); c.strokeStyle = A('#ff7a9a', 0.7); c.lineWidth = 1.4; c.strokeRect(p[0] + 2, p[1] + 2, p[2], p[3]); }); } });
    star5(g, 148, 222, 42, HV.gold, 0, 3);
    g.fillStyle = A('#ffffff', 0.8); g.beginPath(); g.ellipse(160, 200, 6, 3.4, -0.7, 0, TAU); g.fill();
    puffs(g, [[200, 330, 8]], HV.gold, { lw: 2.2 });
    puffs(g, [[148, 112, 10]], '#fff4b0', { lw: 2.2, hi: '#ffffff' });
  }
  function grMirror(g) {
    const x = GR.mirX, y = GR.mirY, w = GR.mirW, h = GR.mirH;
    // the dressing table under it
    cel(g, rect4(x - 26, 336, w + 52, 20), '#f2d7a8', { line: 2.6, depth: 4, hi: '#fff4dc', tension: 0 });
    cel(g, rect4(x - 14, 356, w + 28, GR.floor - 356 - 6), '#d8a26a', { line: 2.6, depth: 8, tension: 0,
      decor: (c) => { [[x - 4, 368], [x + w / 2 + 6, 368]].forEach((p) => { c.strokeStyle = A('#8a5a3a', 0.8); c.lineWidth = 2; c.strokeRect(p[0], p[1], w / 2 - 12, 40); disc(c, p[0] + w / 4 - 6, p[1] + 20, 4, '#ffd84d'); }); } });
    // the mirror and its bulb frame
    cel(g, rrect(x, y, w, h, 14), '#fff1d6', { line: 3, depth: 6, tension: 0.5 });
    g.save(); g.beginPath(); tk.trace(g, rrect(x + 18, y + 18, w - 36, h - 36, 8)); g.fillStyle = tk.lin(g, x, y, x + w, y + h, [[0, '#bfeee6'], [0.5, '#7ec8c8'], [1, '#4a9aa2']]); g.fill(); g.clip();
    g.fillStyle = A('#ffffff', 0.55); g.beginPath(); g.moveTo(x + w * 0.5, y); g.lineTo(x + w * 0.72, y); g.lineTo(x + w * 0.3, y + h); g.lineTo(x + w * 0.08, y + h); g.closePath(); g.fill();
    g.fillStyle = A('#ffffff', 0.3); g.beginPath(); g.moveTo(x + w * 0.8, y); g.lineTo(x + w * 0.88, y); g.lineTo(x + w * 0.46, y + h); g.lineTo(x + w * 0.38, y + h); g.closePath(); g.fill();
    g.restore();
    oline(g, rrect(x + 18, y + 18, w - 36, h - 36, 8).concat([[x + 18, y + 26]]), 2.4, { taper: 0 });
    // a sticker stuck to the mirror corner: a heart
    heart(g, x + w - 34, y + h - 34, 9, HV.pink, 2);
    GR_BULBS.length = 0;
    for (let i = 0; i < 5; i++) { const bx = x + 18 + i * (w - 36) / 4; [[bx, y + 9], [bx, y + h - 9]].forEach((p) => { puffs(g, [[p[0], p[1], 6.4]], HV.bulb, { lw: 2, hi: '#ffffff' }); GR_BULBS.push(p); }); }
    for (let i = 1; i < 4; i++) { const by = y + 18 + i * (h - 36) / 4; [[x + 9, by], [x + w - 9, by]].forEach((p) => { puffs(g, [[p[0], p[1], 6.4]], HV.bulb, { lw: 2, hi: '#ffffff' }); GR_BULBS.push(p); }); }
    // the record player on the dressing table (the record itself spins live)
    cel(g, rect4(GR.recX - 46, GR.recY - 22, 92, 26), '#3fb3a4', { line: 2.4, depth: 4, hi: '#8fe3c0', tension: 0 });
    cel(g, tk.ellipsePts(GR.recX, GR.recY - 24, 36, 9, 20), '#1d1c22', { line: 2, depth: 2, shadow: '#0c0b0f' });
    oline(g, [[GR.recX + 40, GR.recY - 30], [GR.recX + 30, GR.recY - 38], [GR.recX + 8, GR.recY - 26]], 3, { taper: 0, color: '#c9cbd6' });
    // a little pot of brushes and a hand mirror on the table
    cel(g, rect4(x + 6, 316, 22, 22), HV.pink, { line: 2, depth: 3, tension: 0 });
    [[x + 12, 296], [x + 18, 290], [x + 24, 298]].forEach((p, i) => { oline(g, [[p[0], 318], p], 3.4, { taper: 0, color: ['#ffd84d', '#7cc6ff', '#3fcf6a'][i] }); });
  }
  function grSofa(g) {
    const x0 = 560, x1 = 950, seat = 410, back = 278;
    blob(g, (x0 + x1) / 2, GR.floor + 10, 230, 18, '#1a0a10', 0.5);
    const col = '#f0876a', sh = wsh(col);
    // the back, the arms and the seat cushions under one warm outline each
    cel(g, rrect(x0 + 18, back, x1 - x0 - 36, 120, 40), col, { line: 2.8, depth: 10, shadow: sh, hi: tint(col, 0.35), hiW: 3 });
    cel(g, rrect(x0 + 40, seat - 14, x1 - x0 - 80, 50, 18), col, { line: 2.6, depth: 8, shadow: sh, hi: tint(col, 0.35) });
    cel(g, rrect(x0 + 40, seat + 26, x1 - x0 - 80, 46, 14), wsh(col, 0.06), { line: 2.6, depth: 6, shadow: sh });
    [[x0, 0], [x1 - 60, 1]].forEach((a) => cel(g, rrect(a[0], seat - 52, 60, 128, 28), col, { line: 2.8, depth: 9, shadow: sh, hi: tint(col, 0.35), hiW: 3 }));
    // stubby feet
    [[x0 + 30, 0], [x1 - 30, 1]].forEach((f) => cel(g, rrect(f[0] - 8, seat + 70, 16, 16, 4), '#6a3a2a', { line: 2, depth: 3 }));
    // cushions: pink with a blossom, green with a star; plump squircles with the corners tugged out a little
    const cushion = (cx, cy, w, h, tilt) => {
      const pts = [];
      for (let i = 0; i < 48; i++) {
        const a = i / 48 * TAU, c = Math.cos(a), sn = Math.sin(a), k = Math.pow(Math.pow(Math.abs(c), 3) + Math.pow(Math.abs(sn), 3), -1 / 3);
        const pull = 1 + 0.07 * Math.pow(Math.abs(Math.sin(2 * a)), 6), x = c * k * w / 2 * pull, y = sn * k * h / 2 * pull;
        pts.push([cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)]);
      }
      return { poly: pts };
    };
    cel(g, cushion(x0 + 104, back + 90, 86, 74, -0.08), HV.pink, { line: 2.4, depth: 7, hi: HV.pinkL, tension: 0 });
    blossom(g, x0 + 104, back + 90, 14, 0.3, { lw: 1.6, c0: '#ffffff', c1: '#fff0f6', dot: HV.pink });
    cel(g, cushion(x1 - 113, back + 87, 88, 76, 0.07), '#3fbf74', { line: 2.4, depth: 7, hi: '#9ff0b8', tension: 0 });
    star5(g, x1 - 113, back + 88, 14, HV.gold, 0.1, 2);
    // the patchwork throw over the right half: squares in candy colours, stitched
    const tx = 760, ty = back + 30, tw = 150, th = 150, cols = [HV.pinkL, '#ffd84d', '#8fe3c0', '#7cc6ff', HV.cream, '#c9a0ff', '#ff9fc6', '#c6ff3d'];
    const throwShape = [[tx, ty, 1], [tx + tw, ty + 6, 1], [tx + tw + 8, ty + th * 0.7], [tx + tw - 6, ty + th, 1], [tx + 10, ty + th - 6, 1], [tx - 6, ty + th * 0.5]];
    cel(g, throwShape, HV.cream, { line: 2.6, depth: 8, shadow: '#e8c9a8',
      decor: (c) => {
        let n = 0;
        for (let yy = ty - 10; yy < ty + th + 10; yy += 30) for (let xx = tx - 10; xx < tx + tw + 20; xx += 30) {
          c.save(); c.translate(xx, yy); c.rotate(0.06); c.fillStyle = cols[(n++ * 3 + Math.floor(yy / 30)) % cols.length]; c.fillRect(0, 0, 30, 30);
          c.setLineDash([3, 3]); c.strokeStyle = A(OL, 0.45); c.lineWidth = 1.1; c.strokeRect(2, 2, 26, 26); c.setLineDash([]); c.restore();
        }
        c.fillStyle = A(wsh('#ff9fc6', 0.2), 0.35); c.fillRect(tx - 10, ty + th * 0.62, tw + 30, th);
      } });
  }
  function grSetlists(g) {
    // three set lists taped to the wall: cream sheets with scribbled lines (no words), each with a strip of tape
    [[640, 120, -0.06, 90, 116], [748, 136, 0.05, 84, 108], [850, 118, -0.03, 90, 120]].forEach((p, i) => {
      g.save(); g.translate(p[0], p[1]); g.rotate(p[2]);
      blob(g, -4, p[4] / 2 + 6, p[3] * 0.6, p[4] * 0.55, '#051a1c', 0.35);
      cel(g, rect4(-p[3] / 2, 0, p[3], p[4]), '#fff8ee', { line: 2.2, depth: 3, shadow: '#efdcc4', tension: 0 });
      const r = R('hv-setlist', i);
      for (let k = 0; k < 7; k++) { const y = 16 + k * 13; oline(g, [[-p[3] / 2 + 10, y], [-p[3] / 2 + 10 + (p[3] - 26) * (0.45 + r() * 0.5), y + (r() - 0.5) * 2]], 2, { color: A(k === 0 ? HV.pinkD : '#4a3a5a', 0.7), taper: 0.2, wobble: 0.3, seed: i * 9 + k }); }
      if (i === 1) star5(g, p[3] / 2 - 16, p[4] - 18, 8, HV.gold, 0, 1.4); else heart(g, p[3] / 2 - 16, p[4] - 18, 7, HV.pink, 1.4);
      g.fillStyle = A('#fff6c8', 0.75); g.save(); g.rotate(-0.1); g.fillRect(-16, -8, 32, 14); g.restore();
      g.restore();
    });
  }
  function grTable(g) {
    const cx = 1010, top = 420;
    blob(g, cx, GR.floor + 8, 110, 14, '#1a0a10', 0.5);
    cel(g, [[cx - 6, top + 10, 1], [cx + 6, top + 10, 1], [cx + 8, GR.floor, 1], [cx - 8, GR.floor, 1]], '#c8885a', { line: 2.4, depth: 3, tension: 0 });
    cel(g, tk.ellipsePts(cx, GR.floor - 2, 40, 8, 16), '#a8683a', { line: 2.2, depth: 3 });
    cel(g, tk.ellipsePts(cx, top, 124, 20, 30), '#e8b07a', { line: 2.8, depth: 5, hi: '#ffd8a8', hiW: 2.4 });
    // the kettle (teal, steaming)
    const kx = GR.kettleX - 64, ky = top - 4;
    cel(g, [[kx - 30, ky, 1], [kx - 34, ky - 30], [kx - 22, ky - 50], [kx + 22, ky - 50], [kx + 34, ky - 30], [kx + 30, ky, 1]], HV.teal, { line: 2.6, depth: 7, hi: '#8ff0e4', hiW: 2.4 });
    oline(g, [[kx + 30, ky - 22], [kx + 46, ky - 32], [kx + 54, ky - 46]], 9, { taper: 0 });
    oline(g, [[kx + 30, ky - 22], [kx + 46, ky - 32], [kx + 54, ky - 46]], 5, { taper: 0, color: HV.teal });
    oline(g, tk.arcPts(kx, ky - 52, 22, 20, PI, TAU, 10), 7, { taper: 0 }); oline(g, tk.arcPts(kx, ky - 52, 22, 20, PI, TAU, 10), 3.4, { taper: 0, color: '#3a3448' });
    puffs(g, [[kx, ky - 52, 5]], '#3a3448', { lw: 2 });
    // the teapot (pink with cream dots)
    const px = cx + 22, py = top + 2;
    cel(g, tk.ellipsePts(px, py - 24, 30, 26, 20), HV.pink, { line: 2.6, depth: 7, hi: HV.pinkL, hiW: 2.4,
      decor: (c) => { [[-14, -34], [10, -40], [-4, -18], [16, -16], [-20, -14]].forEach((d) => disc(c, px + d[0], py + d[1], 3.4, HV.cream)); } });
    oline(g, [[px - 30, py - 26], [px - 46, py - 36], [px - 50, py - 46]], 8, { taper: 0.3 }); oline(g, [[px - 30, py - 26], [px - 46, py - 36], [px - 50, py - 46]], 4, { taper: 0.3, color: HV.pink });
    oline(g, tk.arcPts(px + 30, py - 26, 12, 13, -PI / 2, PI / 2, 8), 7.4, { taper: 0 }); oline(g, tk.arcPts(px + 30, py - 26, 12, 13, -PI / 2, PI / 2, 8), 3.6, { taper: 0, color: HV.pink });
    puffs(g, [[px, py - 52, 6]], HV.pinkL, { lw: 2 });
    // the bowl of clementines
    const bx = cx + 92, by = top + 6;
    const cl = [[bx - 16, by - 20, 11], [bx + 4, by - 24, 12], [bx + 20, by - 18, 10], [bx - 4, by - 34, 10], [bx + 14, by - 34, 9]];
    puffs(g, cl, '#ff9a2e', { lw: 2, shade: '#e8701a', hi: '#ffd08a' });
    cl.forEach((c, i) => { if (i % 2 === 0) { const lx = c[0] + 3, ly = c[1] - c[2] + 1; g.fillStyle = OL; g.beginPath(); g.ellipse(lx + 3, ly - 1, 5.6, 3, -0.5, 0, TAU); g.fill(); g.fillStyle = '#3fbf74'; g.beginPath(); g.ellipse(lx + 3, ly - 1, 4.4, 2, -0.5, 0, TAU); g.fill(); } });
    cel(g, [[bx - 30, by - 18, 1], [bx + 30, by - 18, 1], [bx + 20, by, 1], [bx - 20, by, 1]], HV.cream, { line: 2.4, depth: 4, hi: '#ffffff', tension: 0.3 });
    // two little cups
    [[cx - 92, top + 4], [cx + 46, top + 8]].forEach((c, i) => cel(g, rrect(c[0] - 9, c[1] - 14, 18, 15, 4), i ? '#3fbf74' : HV.cream, { line: 2, depth: 3 }));
  }
  function grPlant(g) {
    const x = 1214, y = GR.floor;
    // big round leaves on stems, then the pot in front
    const r = R('hv-gr-plant'), leaves = [];
    for (let i = 0; i < 12; i++) { const a = -PI / 2 + (i - 5.5) * 0.19 + (r() - 0.5) * 0.12, L = 80 + r() * 130; leaves.push([x + Math.cos(a) * L, y - 74 + Math.sin(a) * L, a, 28 + r() * 12]); }
    leaves.forEach((l) => oline(g, [[x, y - 60], [lerp(x, l[0], 0.5), lerp(y - 60, l[1], 0.5) + 10], [l[0], l[1]]], 3.4, { taper: 0.2, color: '#2a7a4a' }));
    leaves.sort((a, b) => a[1] - b[1]).forEach((l) => {
      g.save(); g.translate(l[0], l[1]); g.rotate(l[2] + PI / 2);
      cel(g, [[0, l[3] * 0.9, 1], [-l[3] * 0.62, l[3] * 0.1], [-l[3] * 0.4, -l[3] * 0.62], [0, -l[3] * 0.95, 1], [l[3] * 0.4, -l[3] * 0.62], [l[3] * 0.62, l[3] * 0.1]], '#3fcf6a', { line: 2.4, depth: 6, shadow: '#239a4a', hi: '#9ff0b8', hiW: 2 });
      oline(g, [[0, l[3] * 0.8], [0, -l[3] * 0.7]], 1.6, { color: A('#1f6a3a', 0.8) });
      g.restore();
    });
    cel(g, [[x - 50, y - 70, 1], [x + 50, y - 70, 1], [x + 40, y, 1], [x - 40, y, 1]], '#e0703e', { line: 2.8, depth: 8, hi: '#ffa070', tension: 0.1 });
    cel(g, rect4(x - 56, y - 82, 112, 16), '#e8804e', { line: 2.6, depth: 3, tension: 0 });
    blossom(g, x, y - 36, 10, 0.2, { lw: 1.4 });
  }
  function grFairy(g) {
    GR_FAIRY.length = 0;
    fairyString(g, -20, 34, 640, 46, 46, 30, [HV.pink, HV.gold, '#3fcf6a', HV.cream, '#7cc6ff'], 5).forEach((b) => GR_FAIRY.push(b));
    fairyString(g, 640, 46, 1300, 30, 50, 30, [HV.gold, '#3fcf6a', HV.cream, '#7cc6ff', HV.pink], 5).forEach((b) => GR_FAIRY.push(b));
  }
  const GR_FAIRY = [];
  function grSteamSpr() { return mkSpr('hvgr|steam', 64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.5, 'rgba(240,250,255,0.35)'); gr.addColorStop(1, 'rgba(240,250,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }); }
  SCENES.camp = { id: 'camp', combat: false, mood: 'the green room, kettle on', sway: 5, items: [
    lay('wall', full(0, GR.floor + 10), 0.02, grWall),
    lay('fairy', full(0, 110), 0.04, grFairy),
    lay('floor', full(GR.floor - 4, DH - GR.floor + 4), 0, grFloor),
    lay('door', { x: 40, y: 90, w: 220, h: 390 }, 0.05, grDoor),
    lay('setlists', { x: 580, y: 96, w: 340, h: 160 }, 0.05, grSetlists),
    lay('mirror', { x: 260, y: 96, w: 290, h: 380 }, 0.05, grMirror),
    anim((ctx, T) => {
      const px = T.par * 0.05;
      // the record spins: a black disc with grooves, a pink and green label and a highlight that goes round
      const rx = GR.recX - px, ry = GR.recY - 25, a = T.tt * 3.5;
      ctx.save(); ctx.translate(rx, ry); ctx.scale(1, 0.26);
      ctx.fillStyle = '#141318'; ctx.beginPath(); ctx.arc(0, 0, 32, 0, TAU); ctx.fill();
      ctx.strokeStyle = A('#4a4856', 0.9); ctx.lineWidth = 1.2; [26, 20].forEach((rr) => { ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke(); });
      ctx.fillStyle = HV.pink; ctx.beginPath(); ctx.arc(0, 0, 11, a, a + PI); ctx.fill(); ctx.fillStyle = HV.green; ctx.beginPath(); ctx.arc(0, 0, 11, a + PI, a + TAU); ctx.fill();
      ctx.strokeStyle = A('#ffffff', 0.5); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 24, a * 0.2 + 0.4, a * 0.2 + 1.0); ctx.stroke();
      ctx.restore();
      // the bulbs breathe
      addMode(ctx, () => {
        const b = 0.75 + 0.25 * Math.sin(T.tt * 1.2);
        glowE(ctx, GR.mirX + GR.mirW / 2 - px, GR.mirY + GR.mirH / 2, 260, 220, '#ffcf8a', 0.22 * b);
        for (let i = 0; i < GR_BULBS.length; i++) glowAt(ctx, GR_BULBS[i][0] - px, GR_BULBS[i][1], 20, '#fff4d6', (0.5 + 0.2 * Math.sin(T.tt * 1.2 + i * 0.4)) * b);
        for (let i = 0; i < GR_FAIRY.length; i++) { const f = GR_FAIRY[i]; glowAt(ctx, f[0] - T.par * 0.04, f[1], 16, f[2], 0.4 + 0.3 * Math.sin(T.tt * (1.1 + (i % 4) * 0.3) + i)); }
        glowAt(ctx, 148 - px, 112, 40, '#fff4b0', 0.5 * b);
      });
    }),
    lay('sofa', { x: 540, y: 260, w: 430, h: 230 }, 0.1, grSofa),
    lay('table', { x: 870, y: 330, w: 270, h: 160 }, 0.12, grTable),
    lay('plant', { x: 960, y: 110, w: 380, h: 380 }, 0.14, grPlant),
    anim((ctx, T) => {
      // kettle steam, curling up and fading
      const st = grSteamSpr(), P = pset('hv-gr-steam', 10, (r) => ({ ph: r(), dx: (r() - 0.5) * 10, sp: 0.6 + r() * 0.5 }));
      const n = Math.max(2, Math.round(10 * T.pf)), kx = GR.kettleX - 14 - T.par * 0.12, ky = 372;
      for (let i = 0; i < n; i++) { const p = P[i], u = ((T.tt * 0.22 * p.sp + p.ph) % 1 + 1) % 1, x = kx + p.dx + Math.sin(T.tt * 1.3 + p.ph * 6) * 10 * u + u * 14, y = ky - u * 130, s = 8 + u * 30; ART.blit(ctx, st, x - s, y - s, s * 2, s * 2, 0.55 * Math.sin(PI * u)); }
      drift(ctx, T, { key: 'hv-gr-motes', n: 14, sprs: [moteSpr('#fff4d6')], area: { x: 160, y: 80, w: 980, h: 380 }, vx: 3, vy: -5, sway: 18, size: [4, 8], aspect: 1, alpha: [0.25, 0.7], add: true, wob: 0 });
    }),
    vigLayer('hv-gr-vig', { color: '#0a1416', alpha: 0.45, inner: 0.34 }),
  ] };

  // ===============================================================================================================
  // SHOP: Jordan's Merch Stall from the front, with nobody behind it, at a festival at night: a teal canopy with a scalloped fringe that sways,
  // T-shirts on a line, tote bags, sticker sheets, a tablet on a stand that sparkles, and a little RJ monogram flag on top.
  // ===============================================================================================================
  const MS = { x0: 330, x1: 950, roofY: 132, eave: 232, counter: 452, ground: 566 };
  function msSky(g) {
    fillRectG(g, X0, 0, XW, MS.ground + 10, [[0, '#0c0a2a'], [0.45, '#22195e'], [0.8, '#3d2a7e'], [1, '#5a3a8e']]);
    hvStars(g, 'hv-ms-stars', 110, 0, 300);
    // far festival tents in soft candy colours and their string lights
    const r = R('hv-ms-tents');
    for (let x = X0; x < X0 + XW; x += 120 + r() * 60) {
      const w = 90 + r() * 50, h = 50 + r() * 30, y = 520, c = U.color.mix([HV.pink, HV.teal, HV.gold, '#a77bff'][Math.floor(r() * 4)], '#3d2a7e', 0.55);
      cel(g, { poly: [[x, y], [x + w / 2, y - h], [x + w, y]] }, c, { line: 1.6, depth: 4, tension: 0, lineColor: A(OL, 0.6) });
      oline(g, [[x + w / 2, y - h], [x + w / 2, y - h - 14]], 1.4, { color: A(OL, 0.6) });
    }
    fillRectG(g, X0, 516, XW, 60, [[0, '#2a1f5a'], [1, '#1c1448']]);
    MS_LIGHTS.length = 0;
    fairyString(g, X0, 150, MS.x0 - 26, MS.eave - 8, 40, 30, [HV.gold, HV.pink, '#3fcf6a', HV.cream, '#7cc6ff'], 4.4).forEach((b) => MS_LIGHTS.push(b));
    fairyString(g, MS.x1 + 26, MS.eave - 8, X0 + XW, 150, 40, 30, [HV.pink, HV.gold, HV.cream, '#3fcf6a', '#7cc6ff'], 4.4).forEach((b) => MS_LIGHTS.push(b));
  }
  const MS_LIGHTS = [];
  function msGround(g) {
    fillRectG(g, X0, MS.ground - 6, XW, DH - MS.ground + 6, [[0, '#1f4a52'], [0.3, '#173a44'], [1, '#0a1a24']]);
    oline(g, [[X0, MS.ground - 4], [X0 + XW, MS.ground - 4]], 2.4, { taper: 0, color: A(OL, 0.8) });
    const r = R('hv-ms-grass');
    for (let i = 0; i < 70; i++) { const x = X0 + r() * XW, y = MS.ground + 6 + Math.pow(r(), 0.8) * 140, s = 0.8 + (y - MS.ground) / 120; g.strokeStyle = A(r() < 0.5 ? '#3a8a6a' : '#2a6a5a', 0.85); g.lineWidth = 1.8 * s; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 2 * s, y - 8 * s); g.moveTo(x + 3 * s, y); g.lineTo(x + 5 * s, y - 10 * s); g.stroke(); }
    // a warm pool of light under the stall
    blob(g, 640, MS.ground + 30, 420, 50, '#ffcf8a', 0.35);
  }
  function msStall(g) {
    const { x0, x1, roofY, eave, counter, ground } = MS;
    // the back of the stall (dark teal) and the two posts
    cel(g, rect4(x0 + 14, eave, x1 - x0 - 28, counter - eave), '#0f3d3e', { line: 2.4, depth: 0, tension: 0, shadow: false });
    blob(g, 640, 360, 300, 110, '#2ec4b6', 0.18);
    [x0, x1 - 26].forEach((x) => cel(g, rect4(x, eave - 8, 26, ground - eave + 8), '#fff1d6', { line: 2.6, depth: 6, tension: 0,
      decor: (c) => { for (let y = eave; y < ground; y += 34) { c.fillStyle = HV.teal; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 26, y - 12); c.lineTo(x + 26, y + 4); c.lineTo(x, y + 16); c.closePath(); c.fill(); } } }));
    // the line of T-shirts
    const lineY = 284;
    oline(g, sagPts(x0 + 26, lineY - 8, x1 - 26, lineY - 8, 16, 20), 2, { taper: 0 });
    [[430, HV.pink, 'heart'], [540, '#3fcf6a', 'star'], [650, HV.cream, 'blossom'], [760, '#a77bff', 'note'], [862, '#ffd84d', 'mono']].forEach((s, i) => {
      const x = s[0], y = lineY - 6 + 16 * 4 * ((x - x0) / (x1 - x0)) * (1 - (x - x0) / (x1 - x0)), c = s[1];
      cel(g, [[x - 22, y, 1], [x - 10, y - 2], [x - 4, y + 4], [x + 4, y + 4], [x + 10, y - 2], [x + 22, y, 1], [x + 34, y + 16, 1], [x + 24, y + 26, 1], [x + 20, y + 20, 1], [x + 20, y + 70, 1], [x - 20, y + 70, 1], [x - 20, y + 20, 1], [x - 24, y + 26, 1], [x - 34, y + 16, 1]], c, { line: 2.2, depth: 6, tension: 0.15 });
      [[x - 16, y - 4], [x + 16, y - 4]].forEach((p) => { g.fillStyle = OL; g.fillRect(p[0] - 2.5, p[1] - 6, 5, 9); });
      const cx = x, cy = y + 36;
      if (s[2] === 'heart') heart(g, cx, cy, 9, HV.cream, 1.8);
      else if (s[2] === 'star') star5(g, cx, cy, 11, HV.gold, 0, 1.8);
      else if (s[2] === 'blossom') blossom(g, cx, cy, 11, 0.2, { lw: 1.4 });
      else if (s[2] === 'note') tk.note(g, cx - 3, cy + 6, 9, { kind: 'beamed', color: HV.cream, line: 2.4 });
      else monoDraw(g, cx, cy, 11, {});
    });
    // tote bags hanging on the posts
    [[x0 + 50, 340, HV.cream, 0], [x1 - 50, 344, '#ff9fc6', 1]].forEach((b) => {
      const x = b[0], y = b[1];
      oline(g, tk.arcPts(x, y, 14, 22, PI, TAU, 10), 6.4, { taper: 0 }); oline(g, tk.arcPts(x, y, 14, 22, PI, TAU, 10), 3, { taper: 0, color: b[2] });
      cel(g, [[x - 26, y, 1], [x + 26, y, 1], [x + 30, y + 64, 1], [x - 30, y + 64, 1]], b[2], { line: 2.4, depth: 6, tension: 0.05 });
      if (b[3]) star5(g, x, y + 32, 13, HV.green, 0, 1.8);
      else cel(g, [[x - 10, y + 22, 1], [x + 10, y + 22, 1], [x + 12, y + 46, 1], [x - 12, y + 46, 1]], HV.pink, { line: 1.6, depth: 2, tension: 0.05 });   // a tote bag with a tote bag on it
    });
    // the counter: a wooden top, a cream front with a pink and green stripe, sticker sheets pinned to it
    cel(g, rect4(x0 - 10, counter - 14, x1 - x0 + 20, 22), '#d8a26a', { line: 2.8, depth: 5, hi: '#ffd8a8', hiW: 2.4, tension: 0 });
    cel(g, rect4(x0 + 4, counter + 8, x1 - x0 - 8, ground - counter - 8), HV.cream, { line: 2.8, depth: 10, shadow: '#efd8bc', tension: 0,
      decor: (c) => { c.fillStyle = HV.pink; c.fillRect(x0, counter + 22, x1 - x0, 12); c.fillStyle = '#3fcf6a'; c.fillRect(x0, counter + 34, x1 - x0, 7); } });
    [[420, 500, -0.05], [530, 504, 0.04], [750, 500, -0.03], [856, 504, 0.05]].forEach((s, i) => {
      g.save(); g.translate(s[0], s[1]); g.rotate(s[2]);
      cel(g, rect4(-34, 0, 68, 50), '#ffffff', { line: 2, depth: 3, shadow: '#e8e0f0', tension: 0 });
      const r = R('hv-ms-sheet', i);
      for (let k = 0; k < 6; k++) { const sx = -22 + (k % 3) * 22, sy = 13 + Math.floor(k / 3) * 24, kind = Math.floor(r() * 4), c = [HV.pink, '#3fcf6a', HV.gold, '#7cc6ff', '#a77bff'][Math.floor(r() * 5)]; if (kind === 0) heart(g, sx, sy, 6, c, 1.2); else if (kind === 1) star5(g, sx, sy, 7, c, 0, 1.2); else if (kind === 2) blossom(g, sx, sy, 7, r(), { lw: 1 }); else puffs(g, [[sx, sy, 6]], c, { lw: 1.2 }); }
      g.restore();
    });
    // on the counter: folded tees, a mug, and the tablet stand (its screen sparkles live)
    [[452, HV.pink], [452, '#3fcf6a'], [452, HV.cream]].forEach((f, i) => cel(g, rrect(f[0] - 36, counter - 30 - i * 11, 72, 14, 4), f[1], { line: 2, depth: 3 }));
    cel(g, rrect(570, counter - 40, 30, 30, 6), HV.teal, { line: 2.2, depth: 4, hi: '#8ff0e4' });
    oline(g, tk.arcPts(600, counter - 26, 8, 9, -PI / 2, PI / 2, 8), 6, { taper: 0 }); oline(g, tk.arcPts(600, counter - 26, 8, 9, -PI / 2, PI / 2, 8), 2.6, { taper: 0, color: HV.teal });
    heart(g, 585, counter - 24, 6, HV.pink, 1.2);
    // the tablet: a pink case round a thin black bezel, leaning back on a little easel stand with a lip at the front
    oline(g, [[742, counter - 16], [756, counter - 60]], 7, { taper: 0 }); oline(g, [[742, counter - 16], [756, counter - 60]], 3.4, { taper: 0, color: '#4a4660' });
    cel(g, rrect(678, counter - 106, 88, 70, 12), HV.pink, { line: 2.6, depth: 4, hi: HV.pinkL, tension: 0.5 });
    cel(g, rrect(683, counter - 101, 78, 60, 8), '#1d1c22', { line: 1.4, depth: 0, shadow: false, tension: 0.5 });
    g.fillStyle = tk.lin(g, 688, counter - 96, 756, counter - 46, [[0, '#2f8a9a'], [1, '#14384a']]); g.beginPath(); tk.trace(g, rrect(688, counter - 96, 68, 50, 4)); g.fill();
    g.fillStyle = A('#ffffff', 0.16); g.beginPath(); g.moveTo(724, counter - 96); g.lineTo(756, counter - 96); g.lineTo(756, counter - 74); g.closePath(); g.fill();
    disc(g, 722, counter - 98.5, 1.4, '#4a4660');
    cel(g, [[690, counter - 12, 1], [754, counter - 12, 1], [754, counter - 24], [690, counter - 24]], '#3a3448', { line: 2.2, depth: 3, hi: '#5a5670', tension: 0 });
    cel(g, rrect(694, counter - 40, 56, 8, 3), '#3a3448', { line: 2, depth: 2, tension: 0 });
    // a pile of badges and a jar of plectrum-shaped stickers
    puffs(g, [[820, counter - 18, 9], [838, counter - 16, 8], [829, counter - 30, 8]], HV.gold, { lw: 1.8 });
    [[820, counter - 18, HV.pink], [838, counter - 16, '#3fcf6a'], [829, counter - 30, HV.sky]].forEach((b) => disc(g, b[0], b[1], 4, b[2]));
  }
  // the canopy top and the flag (baked); the fringe is drawn live so it can sway
  function msCanopy(g) {
    const { x0, x1, roofY, eave } = MS;
    const shape = { poly: [[x0 + 40, roofY], [x1 - 40, roofY], [x1 + 30, eave], [x0 - 30, eave]] };
    cel(g, shape, HV.teal, { line: 3, depth: 0, shadow: false, tension: 0,
      decor: (c) => {
        const n = 10;
        for (let i = 0; i < n; i += 2) { const u0 = i / n, u1 = (i + 1) / n; fillPoly(c, [[lerp(x0 + 40, x1 - 40, u0), roofY], [lerp(x0 + 40, x1 - 40, u1), roofY], [lerp(x0 - 30, x1 + 30, u1), eave], [lerp(x0 - 30, x1 + 30, u0), eave]], HV.tealL); }
        c.fillStyle = A('#0d4f4a', 0.25); c.fillRect(x0 - 40, roofY, x1 - x0 + 80, 26);
        c.fillStyle = A('#ffffff', 0.2); c.fillRect(x0 - 40, eave - 22, x1 - x0 + 80, 10);
      } });
    // the little monogram flag on a pole
    const fx = 640;
    oline(g, [[fx, roofY + 2], [fx, roofY - 70]], 6, { taper: 0 }); oline(g, [[fx, roofY + 2], [fx, roofY - 70]], 2.6, { taper: 0, color: '#c9cbd6' });
    puffs(g, [[fx, roofY - 72, 5]], HV.gold, { lw: 2 });
    cel(g, [[fx + 2, roofY - 66, 1], [fx + 74, roofY - 60], [fx + 66, roofY - 44], [fx + 76, roofY - 28], [fx + 2, roofY - 30, 1]], HV.cream, { line: 2.4, depth: 4, tension: 0.4 });
    monoDraw(g, fx + 34, roofY - 47, 14, {});
  }
  // the scalloped fringe under the canopy edge: alternating teal and cream scallops, each swinging a little on its own phase
  function msFringe(ctx, T) {
    const { x0, x1, eave } = MS, n = 18, w = (x1 - x0 + 60) / n, px = T.par * 0.1;
    ctx.save(); ctx.lineJoin = 'round';
    for (let i = 0; i < n; i++) {
      const x = x0 - 30 + i * w - px, sw = T.mot < 1 ? 0 : Math.sin(T.tt * 2.1 + i * 0.7) * 2.6, c = i % 2 ? HV.tealL : HV.teal;
      ctx.beginPath(); ctx.moveTo(x, eave - 1); ctx.lineTo(x + w, eave - 1); ctx.quadraticCurveTo(x + w + sw, eave + 30, x + w / 2 + sw, eave + 30); ctx.quadraticCurveTo(x + sw, eave + 30, x, eave - 1); ctx.closePath();
      ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = OL; ctx.stroke();
      ctx.fillStyle = A(wsh(c, 0.1), 0.8); ctx.beginPath(); ctx.ellipse(x + w * 0.38 + sw, eave + 18, w * 0.18, 6, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  SCENES.shop = { id: 'shop', combat: false, mood: 'the merch stall at the festival', sway: 6, items: [
    lay('sky', full(0, MS.ground + 10), 0.03, msSky),
    anim((ctx, T) => { twinkle(ctx, T, { key: 'hv-ms', n: 30, h: 260, gold: 0.3 }); }),
    lay('ground', full(MS.ground - 10, DH - MS.ground + 10), 0, msGround),
    lay('stall', { x: 300, y: 220, w: 680, h: 360 }, 0.1, msStall),
    lay('canopy', { x: 280, y: 50, w: 720, h: 190 }, 0.1, msCanopy),
    anim(msFringe),
    anim((ctx, T) => {
      const px = T.par * 0.1;
      // the tablet screen: a big sparkle that pops every few seconds, plus the stall's warm lights
      const tw = ((T.tt % 2.6) + 2.6) % 2.6, k = tw < 0.8 ? Math.sin(tw / 0.8 * PI) : 0;
      tk.sparkle(ctx, 722 - px, MS.counter - 71, 12 + 10 * k, { color: '#ffffff', alpha: 0.7 + 0.3 * k, glow: 0.4 + 0.5 * k, rot: T.tt * 0.3 });
      tk.sparkle(ctx, 744 - px, MS.counter - 88, 4 + 3 * k, { color: HV.pinkL, alpha: 0.9, glow: 0.3 });
      addMode(ctx, () => {
        const b = 0.8 + 0.2 * Math.sin(T.tt * 1.4);
        glowE(ctx, 640 - px, MS.eave + 80, 320, 120, '#ffcf8a', 0.22 * b);
        glowAt(ctx, 722 - px, MS.counter - 71, 50, '#3ff0ff', 0.25 + 0.3 * k);
        for (let i = 0; i < MS_LIGHTS.length; i++) { const l = MS_LIGHTS[i]; glowAt(ctx, l[0] - T.par * 0.03, l[1], 14, l[2], 0.3 + 0.3 * Math.sin(T.tt * (1.2 + (i % 4) * 0.35) + i * 2.1)); }
      });
      drift(ctx, T, { key: 'hv-ms-confetti', n: 12, sprs: [sparkSpr('#fff4d6'), sparkSpr('#c6ff3d'), sparkSpr('#ffc2dc')], area: { x: 0, y: 0, w: DW, h: 560 }, vx: 6, vy: 14, sway: 30, size: [6, 12], aspect: 1, spin: 0.4, alpha: [0.4, 0.9], add: true });
    }),
    vigLayer('hv-ms-vig', { color: '#070516', alpha: 0.5, inner: 0.34 }),
  ] };

  // ===============================================================================================================
  // EVENT: a Detour: a street corner at dusk. A poster wall, a lamppost, a bench under string lights strung between two trees, and a bent arrow
  // signpost with a question mark. The string lights twinkle; a leaf or a petal drifts by.
  // ===============================================================================================================
  const EVC = { kerb: 520 };
  function evSky(g) {
    fillRectG(g, X0, 0, XW, EVC.kerb, [[0, '#3a2a86'], [0.35, '#5b3fa8'], [0.62, '#b86aa8'], [0.82, '#ff9a8a'], [1, '#ffb38a']]);
    hvStars(g, 'hv-ev-stars', 40, 0, 140);
    blob(g, 980, 430, 420, 120, '#ffd0a0', 0.5);
    [[260, 120, 1], [820, 90, 1.2], [1130, 170, 0.8]].forEach((c) => { const s = c[2]; puffs(g, [[c[0] - 38 * s, c[1] + 4 * s, 22 * s], [c[0], c[1] - 6 * s, 30 * s], [c[0] + 38 * s, c[1] + 4 * s, 20 * s]], '#c88ac8', { lw: 2, shade: '#9a6ab8', hi: '#ffd0e4', lit: 0.14 }); });
    // far rooftops with lit windows
    const r = R('hv-ev-roofs');
    for (let x = X0; x < X0 + XW; x += 50 + r() * 50) {
      const w = 50 + r() * 50, h = 60 + r() * 90, y = 440;
      cel(g, rect4(x, y - h, w, h + 90), U.color.mix('#5b3fa8', '#3a2a6a', r()), { line: 1.6, depth: 0, shadow: false, tension: 0, lineColor: A(OL, 0.5) });
      if (r() < 0.5) cel(g, { poly: [[x - 4, y - h], [x + w / 2, y - h - 22], [x + w + 4, y - h]] }, '#4a2f8a', { line: 1.6, depth: 0, shadow: false, tension: 0, lineColor: A(OL, 0.5) });
      for (let k = 0; k < 4; k++) if (r() < 0.45) { g.fillStyle = A('#ffd98a', 0.85); g.fillRect(x + 8 + (k % 2) * (w - 26), y - h + 12 + Math.floor(k / 2) * 28, 10, 12); }
    }
  }
  function evStreet(g) {
    fillRectG(g, X0, EVC.kerb - 4, XW, DH - EVC.kerb + 4, [[0, '#8a6a9a'], [0.2, '#6a4f86'], [1, '#2e2250']]);
    cel(g, rect4(X0, EVC.kerb - 6, XW, 14), '#c8a8c8', { line: 2.4, depth: 3, tension: 0 });
    g.strokeStyle = A('#3a2a5a', 0.55); g.lineWidth = 1.8;
    for (let k = 1; k < 6; k++) { const y = EVC.kerb + 8 + k * k * 7; g.beginPath(); g.moveTo(X0, y); g.lineTo(X0 + XW, y); g.stroke(); }
    for (let x = X0; x < X0 + XW; x += 110) { g.beginPath(); g.moveTo(x, EVC.kerb + 8); g.lineTo(x + (x - 640) * 0.5, DH); g.stroke(); }
    blob(g, 600, EVC.kerb + 40, 200, 40, '#ffd98a', 0.35);
    const r = R('hv-ev-petals');
    for (let i = 0; i < 26; i++) { const x = X0 + r() * XW, y = EVC.kerb + 14 + r() * 180; g.save(); g.translate(x, y); g.rotate(r() * TAU); g.fillStyle = A(r() < 0.5 ? '#ffb0d0' : '#ff8ab8', 0.85); g.beginPath(); g.ellipse(0, 0, 4, 2.4, 0, 0, TAU); g.fill(); g.restore(); }
  }
  // the poster wall: warm plaster with brick peeking through, gig posters (shapes only, no words) and tape
  function evWall(g) {
    const x0 = 30, x1 = 520, top = 170;
    cel(g, rect4(x0, top, x1 - x0, EVC.kerb - top), '#e0907a', { line: 2.8, depth: 12, shadow: '#b86a5e', tension: 0,
      decor: (c) => {
        const r = R('hv-ev-brick');
        for (let i = 0; i < 9; i++) { const bx = x0 + r() * (x1 - x0), by = top + r() * (EVC.kerb - top); for (let k = 0; k < 3; k++) { c.fillStyle = A('#b8584e', 0.7); c.fillRect(bx + (k % 2) * 14, by + k * 12, 26, 9); } }
        c.fillStyle = A('#ffd0a0', 0.25); c.fillRect(x0, top, x1 - x0, 40);
      } });
    cel(g, rect4(x0 - 8, top - 14, x1 - x0 + 16, 18), '#c8706a', { line: 2.6, depth: 4, tension: 0 });
    const posters = [
      [70, 200, 120, 160, HV.pink, 'blossom', -0.04], [200, 192, 110, 140, '#3fcf6a', 'mic', 0.05], [320, 214, 130, 120, '#ffd84d', 'star', -0.03],
      [94, 372, 110, 120, '#7cc6ff', 'note', 0.04], [214, 346, 130, 150, HV.cream, 'mono', -0.05], [360, 344, 120, 140, '#a77bff', 'heart', 0.03],
    ];
    posters.forEach((p, i) => {
      g.save(); g.translate(p[0] + p[2] / 2, p[1] + p[3] / 2); g.rotate(p[6]);
      const w = p[2], h = p[3];
      cel(g, [[-w / 2, -h / 2, 1], [w / 2, -h / 2, 1], [w / 2, h / 2 - 16, 1], [w / 2 - 16, h / 2], [-w / 2, h / 2, 1]], p[4], { line: 2.4, depth: 5, tension: 0 });
      // a curled torn corner
      cel(g, { poly: [[w / 2, h / 2 - 16], [w / 2 - 16, h / 2], [w / 2 - 14, h / 2 - 14]] }, tint(p[4], 0.5), { line: 2, depth: 0, shadow: false, tension: 0 });
      const ink = p[4] === HV.cream ? HV.pink : HV.cream;
      g.fillStyle = A(wsh(p[4], 0.08), 0.7); g.fillRect(-w / 2 + 8, -h / 2 + 8, w - 16, 10); g.fillRect(-w / 2 + 8, h / 2 - 30, (w - 16) * 0.6, 7); g.fillRect(-w / 2 + 8, h / 2 - 18, (w - 16) * 0.4, 6);
      if (p[5] === 'blossom') blossom(g, 0, 0, 30, 0.3, { lw: 2 });
      else if (p[5] === 'mic') {
        g.save(); g.rotate(0.35);
        cel(g, [[-6, 2, 1], [6, 2, 1], [9, 44], [-9, 44]], '#1d1c22', { line: 2.2, depth: 2, hi: '#615f6d', tension: 0.2 });
        cel(g, rect4(-9, -2, 18, 7), HV.pink, { line: 2, depth: 1.5, tension: 0 });
        cel(g, tk.ellipsePts(0, -18, 18, 18, 20), '#5a5868', { line: 2.4, depth: 4, shadow: '#34323e', hi: '#a8a6b8',
          decor: (c) => { c.strokeStyle = A('#2a2830', 0.6); c.lineWidth = 1.2; c.beginPath(); for (let k2 = -4; k2 <= 4; k2++) { c.moveTo(-18 + k2 * 4.5, -36); c.lineTo(18 + k2 * 4.5, 0); c.moveTo(-18 + k2 * 4.5, 0); c.lineTo(18 + k2 * 4.5, -36); } c.stroke(); } });
        g.restore();
        star4(g, 30, -30, 8, '#ffffff', 0);
      }
      else if (p[5] === 'star') star5(g, 0, 0, 34, HV.pink, 0, 2.4);
      else if (p[5] === 'note') tk.note(g, -6, 16, 22, { kind: 'beamed', color: OL, line: 4 });
      else if (p[5] === 'mono') monoDraw(g, 0, -4, 34, {});
      else heart(g, 0, 0, 26, HV.pink, 2.4);
      g.fillStyle = A('#fff6c8', 0.8); g.fillRect(-14, -h / 2 - 7, 28, 13);
      g.restore();
    });
  }
  function evLamp(g) {
    const x = 590, base = EVC.kerb + 6;
    cel(g, [[x - 14, base, 1], [x + 14, base, 1], [x + 9, base - 22], [x - 9, base - 22]], '#3a3a6a', { line: 2.4, depth: 3, tension: 0 });
    cel(g, rect4(x - 4, 170, 8, base - 192), '#3a3a6a', { line: 2.4, depth: 3, hi: '#6a6a9a', tension: 0 });
    oline(g, [[x, 176], [x + 26, 158], [x + 44, 168]], 8, { taper: 0 }); oline(g, [[x, 176], [x + 26, 158], [x + 44, 168]], 4, { taper: 0, color: '#3a3a6a' });
    cel(g, [[x + 30, 168, 1], [x + 58, 168, 1], [x + 52, 192], [x + 36, 192]], '#ffe7a8', { line: 2.4, depth: 3, shadow: '#ffc96a', tension: 0.1 });
    cel(g, [[x + 26, 168, 1], [x + 62, 168, 1], [x + 44, 154]], '#3a3a6a', { line: 2.4, depth: 2, tension: 0 });
  }
  function evTrees(g) {
    [[700, 1], [1218, 1.1]].forEach((tr, i) => {
      const x = tr[0], s = tr[1], base = EVC.kerb + 4;
      cel(g, [[x - 12 * s, base, 1], [x - 8 * s, base - 120 * s], [x - 26 * s, base - 170 * s], [x - 14 * s, base - 176 * s], [x, base - 140 * s], [x + 18 * s, base - 182 * s], [x + 28 * s, base - 172 * s], [x + 10 * s, base - 120 * s], [x + 14 * s, base, 1]], '#6a4a5a', { line: 2.6, depth: 6 });
      const r = R('hv-ev-tree', i), cs = [];
      for (let k = 0; k < 11; k++) cs.push([x + (r() - 0.5) * 170 * s, base - 220 * s + (r() - 0.5) * 100 * s, (30 + r() * 22) * s]);
      puffs(g, cs, '#4aa88a', { lw: 2.6, shade: '#2f7a6a', hi: '#a8f0c8', lit: 0.1 });
      // dusk light on the canopy and a few blossoms
      for (let k = 0; k < 7; k++) blossom(g, x + (r() - 0.5) * 140 * s, base - 220 * s + (r() - 0.5) * 80 * s, 5 * s, r() * TAU, { lw: 1, c0: '#ffd6ea', c1: '#ffffff' });
    });
  }
  const EV_LIGHTS = [];
  function evLights(g) {
    EV_LIGHTS.length = 0;
    fairyString(g, 720, 262, 1196, 256, 54, 26, [HV.gold, HV.pink, '#3fcf6a', HV.cream, '#7cc6ff'], 4.6).forEach((b) => EV_LIGHTS.push(b));
    fairyString(g, 610, 186, 720, 262, 16, 26, [HV.pink, HV.gold, HV.cream], 4.2).forEach((b) => EV_LIGHTS.push(b));
  }
  function evBench(g) {
    const x0 = 806, x1 = 1030, y = 468;
    blob(g, (x0 + x1) / 2, EVC.kerb + 10, 140, 12, '#1a0a20', 0.5);
    [[x0 + 18], [x1 - 18]].forEach((l) => { cel(g, rect4(l[0] - 5, y, 10, EVC.kerb - y + 6), '#3a3a6a', { line: 2.2, depth: 2, tension: 0 }); });
    cel(g, rect4(x0, y - 8, x1 - x0, 14), '#d8884a', { line: 2.4, depth: 4, hi: '#ffb070', tension: 0 });
    cel(g, rect4(x0 + 4, y + 8, x1 - x0 - 8, 10), '#c87a3e', { line: 2.2, depth: 3, tension: 0 });
    [y - 54, y - 32].forEach((by) => cel(g, rect4(x0, by, x1 - x0, 16), '#d8884a', { line: 2.4, depth: 4, hi: '#ffb070', tension: 0 }));
    [[x0 + 18], [x1 - 18]].forEach((l) => cel(g, rect4(l[0] - 4, y - 62, 8, 56), '#3a3a6a', { line: 2, depth: 2, tension: 0 }));
    // somebody left a ukulele on the bench
    g.save(); g.translate(950, y - 22); g.rotate(-0.5);
    puffs(g, [[0, 6, 18], [0, -18, 14]], '#ffb070', { lw: 2.4, shade: '#e08848', hi: '#ffd8a8' });
    disc(g, 0, -4, 6, '#5a3a2a');
    cel(g, rect4(-3.4, -66, 6.8, 50), '#8a5a3a', { line: 2, depth: 2, tension: 0 });
    cel(g, rrect(-6, -78, 12, 14, 3), '#8a5a3a', { line: 2, depth: 2 });
    g.restore();
  }
  function evSign(g) {
    const x = 1110, base = EVC.kerb + 8;
    cel(g, rect4(x - 6, 250, 12, base - 250), '#c8885a', { line: 2.6, depth: 4, hi: '#ffc090', tension: 0 });
    // three arrow boards: one pointing left, one right, one bent and drooping
    const arrow = (y, dir, rot, col) => {
      g.save(); g.translate(x, y); g.rotate(rot);
      const L = 104, h = 30, pts = dir > 0 ? [[-24, -h / 2, 1], [L - 22, -h / 2, 1], [L, 0, 1], [L - 22, h / 2, 1], [-24, h / 2, 1]] : [[24, -h / 2, 1], [-L + 22, -h / 2, 1], [-L, 0, 1], [-L + 22, h / 2, 1], [24, h / 2, 1]];
      cel(g, pts, col, { line: 2.6, depth: 5, hi: tint(col, 0.4), hiW: 2, tension: 0 });
      g.fillStyle = A(OL, 0.25); g.fillRect(dir > 0 ? -10 : -70, -3, 76, 6);
      disc(g, 0, 0, 3.4, OL);
      g.restore();
    };
    arrow(300, 1, -0.06, HV.pink);
    arrow(346, -1, 0.05, '#3fcf6a');
    arrow(392, 1, 0.42, HV.gold);
    // the round board on top with a question mark
    puffs(g, [[x, 236, 30]], HV.cream, { lw: 2.8, hi: '#ffffff' });
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    const qm = (c, w) => { c.beginPath(); c.moveTo(x - 10, 228); c.quadraticCurveTo(x - 10, 214, x + 1, 214); c.quadraticCurveTo(x + 12, 214, x + 12, 225); c.quadraticCurveTo(x + 12, 233, x + 2, 238); c.lineTo(x + 1, 244); c.strokeStyle = w[1]; c.lineWidth = w[0]; c.stroke(); };
    qm(g, [9, OL]); qm(g, [5, '#a77bff']);
    disc(g, x + 1, 254, 5.4, OL); disc(g, x + 1, 254, 3.4, '#a77bff');
    g.restore();
  }
  SCENES.event = { id: 'event', combat: false, mood: 'a street corner at dusk', sway: 6, items: [
    lay('sky', full(0, EVC.kerb + 10), 0.03, evSky),
    lay('street', full(EVC.kerb - 10, DH - EVC.kerb + 10), 0, evStreet),
    lay('wall', { x: 10, y: 150, w: 530, h: 390 }, 0.08, evWall),
    lay('trees', { x: 580, y: 230, w: 760, h: 310 }, 0.08, evTrees),
    lay('lamp', { x: 560, y: 140, w: 120, h: 400 }, 0.08, evLamp),
    lay('lights', { x: 590, y: 170, w: 640, h: 150 }, 0.08, evLights),
    lay('bench', { x: 790, y: 380, w: 260, h: 160 }, 0.1, evBench),
    lay('sign', { x: 990, y: 196, w: 240, h: 340 }, 0.12, evSign),
    anim((ctx, T) => {
      const px = T.par * 0.08;
      addMode(ctx, () => {
        const f = 0.85 + 0.15 * Math.sin(T.tt * 2.3) * Math.sin(T.tt * 0.7 + 1);
        glowE(ctx, 634 - px, 182, 90, 70, '#ffd98a', 0.55 * f);
        glowE(ctx, 620 - px, EVC.kerb + 20, 170, 34, '#ffd98a', 0.35 * f);
        for (let i = 0; i < EV_LIGHTS.length; i++) { const b = EV_LIGHTS[i], tw = 0.5 + 0.5 * Math.sin(T.tt * (1.2 + (i % 5) * 0.41) + i * 2.3); glowAt(ctx, b[0] - px, b[1], 15, b[2], 0.25 + 0.45 * tw); }
      });
      drift(ctx, T, { key: 'hv-ev-leaves', n: 8, sprs: [petalSpr('#ffc2dc', 0), petalSpr('#ff9cc6', 1), leafSpr('#6ac89a', 0)], area: { x: 0, y: 80, w: DW, h: 520 }, vx: -38, vy: 22, sway: 50, size: [12, 22], aspect: 1, tumble: true, spin: 0.8, alpha: [0.8, 1] });
    }),
    vigLayer('hv-ev-vig', { color: '#1a0f3a', alpha: 0.45, inner: 0.34 }),
  ] };

  // ===============================================================================================================
  // TREASURE: a gift box on a small round stage under a spotlight, in the dark backstage. A pink ribbon and bow with a heart tag; sparkles. The
  // spotlight's dust drifts and the box gives a little hop every 4 s.
  // ===============================================================================================================
  const TRS = { cx: 640, top: 548, rx: 236, ry: 26, lip: 26, boxY: 548 };
  const TR_HOP = 4;
  function trHop(T) {
    if (T.mot < 1) return 0;
    const s = ((T.tt % TR_HOP) + TR_HOP) % TR_HOP;
    return s < 0.5 ? -18 * Math.sin(s / 0.5 * PI) : (s < 0.7 ? -3 * Math.sin((s - 0.5) / 0.2 * PI) : 0);
  }
  function trBack(g) {
    fillRectG(g, X0, 0, XW, DH, [[0, '#0a0826'], [0.6, '#17123f'], [1, '#0c0a24']]);
    // the back curtain: deep indigo-plum folds
    for (let x = X0; x < X0 + XW; x += 54) {
      g.fillStyle = tk.lin(g, x, 0, x + 54, 0, [[0, '#1c1448'], [0.5, '#2c1f62'], [1, '#160f3c']]); g.fillRect(x, 0, 54, 520);
      oline(g, [[x, 0], [x + 4, 260], [x, 520]], 1.6, { color: A(OL, 0.5), taper: 0 });
    }
    fillRectG(g, X0, 440, XW, 120, [[0, A('#0a0826', 0)], [1, A('#0a0826', 0.8)]]);
    // bokeh in candy colours
    const r = R('hv-tr-bokeh');
    for (let i = 0; i < 26; i++) { const x = X0 + r() * XW, y = 40 + r() * 380, rr = 6 + r() * 18, c = [HV.pink, HV.gold, '#3fcf6a', '#7cc6ff', '#a77bff'][i % 5]; disc(g, x, y, rr, A(c, 0.16)); g.strokeStyle = A(tint(c, 0.5), 0.3); g.lineWidth = 1.4; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.stroke(); }
    fillRectG(g, X0, 520, XW, DH - 520, [[0, '#1a1448'], [1, '#08061c']]);
  }
  function trStage(g) {
    const S = TRS, front = [], back = [];
    blob(g, S.cx, S.top + S.ry + S.lip, S.rx * 1.25, 24, '#000000', 0.6);
    for (let i = 0; i <= 40; i++) { const a = i / 40 * PI; front.push([S.cx - Math.cos(a) * S.rx, S.top + Math.sin(a) * S.ry]); }
    for (let i = 40; i >= 0; i--) { const a = i / 40 * PI; back.push([S.cx - Math.cos(a) * S.rx, S.top + Math.sin(a) * S.ry + S.lip]); }
    cel(g, { poly: front.concat(back) }, '#5a2a8a', { line: 2.8, depth: 7, shadow: '#3a1a62', tension: 0 });
    for (let i = 1; i < 16; i++) { const a = i / 16 * PI, x = S.cx - Math.cos(a) * S.rx * 0.98, y = S.top + Math.sin(a) * S.ry + S.lip * 0.55; puffs(g, [[x, y, 3.4]], '#ffe39a', { lw: 1.4, hi: '#ffffff' }); }
    g.save(); g.beginPath(); g.ellipse(S.cx, S.top, S.rx, S.ry, 0, 0, TAU);
    g.fillStyle = tk.rad(g, S.cx, S.top, 10, S.cx, S.top, S.rx, [[0, '#ffe2a8'], [0.5, '#c88aa8'], [1, '#6a3a8a']]); g.fill(); g.restore();
    g.save(); g.strokeStyle = OL; g.lineWidth = 9; g.beginPath(); g.ellipse(S.cx, S.top, S.rx, S.ry, 0, 0, TAU); g.stroke();
    g.strokeStyle = HV.cream; g.lineWidth = 5; g.beginPath(); g.ellipse(S.cx, S.top, S.rx, S.ry, 0, 0, TAU); g.stroke(); g.restore();
  }
  // the gift box: gold, a pink ribbon both ways, a big bow, a heart tag on a string
  function trBox(g) {
    const cx = TRS.cx, b = TRS.boxY - 4, w = 176, h = 116, lidH = 34;
    cel(g, rect4(cx - w / 2, b - h, w, h), '#ffd84d', { line: 3, depth: 14, shadow: '#e8a22a', hi: '#fff0a0', hiW: 3, tension: 0,
      decor: (c) => { c.fillStyle = HV.pink; c.fillRect(cx - 16, b - h, 32, h); c.fillStyle = HV.pinkL; c.fillRect(cx - 16, b - h, 8, h); c.fillStyle = A(wsh(HV.pink, 0.1), 0.9); c.fillRect(cx + 8, b - h, 8, h);
        for (let k = 0; k < 8; k++) { const sx = cx + (k % 2 ? 1 : -1) * (36 + (k % 4 > 1 ? 30 : 0)), sy = b - h + 26 + Math.floor(k / 4) * 50 + (k % 4 > 1 ? 24 : 0); disc(c, sx, sy, 7, A('#ffffff', 0.55)); disc(c, sx + 1.4, sy - 1.4, 4.6, A('#fff6c0', 0.9)); } } });
    cel(g, rect4(cx - w / 2 - 10, b - h - lidH + 6, w + 20, lidH), '#ffe066', { line: 3, depth: 8, shadow: '#e8a22a', hi: '#fff6c0', hiW: 3, tension: 0,
      decor: (c) => { c.fillStyle = HV.pink; c.fillRect(cx - 16, b - h - lidH, 32, lidH + 10); c.fillStyle = HV.pinkL; c.fillRect(cx - 16, b - h - lidH, 8, lidH + 10); } });
    // the bow: two loops and two tails
    const by = b - h - lidH + 6;
    [[-1], [1]].forEach((s) => {
      cel(g, [[cx, by, 1], [cx + s[0] * 30, by - 44], [cx + s[0] * 62, by - 36], [cx + s[0] * 56, by - 8], [cx + s[0] * 10, by + 2, 1]], HV.pink, { line: 2.8, depth: 7, hi: HV.pinkL, hiW: 2.4 });
      cel(g, [[cx + s[0] * 6, by + 4, 1], [cx + s[0] * 24, by + 40], [cx + s[0] * 34, by + 30, 1], [cx + s[0] * 44, by + 46, 1], [cx + s[0] * 14, by + 2, 1]], HV.pink, { line: 2.4, depth: 4, tension: 0.2 });
    });
    puffs(g, [[cx, by - 2, 13]], HV.pinkB, { lw: 2.6 });
    // the heart tag on a little string
    oline(g, [[cx + 10, by + 6], [cx + 38, by + 30], [cx + 58, by + 26]], 2, { taper: 0 });
    heart(g, cx + 70, by + 38, 19, HV.cream, 2.6);
    heart(g, cx + 70, by + 38, 10, HV.pink, 1.4);
  }
  SCENES.treasure = { id: 'treasure', combat: false, mood: 'a gift on a little stage', sway: 6, items: [
    lay('back', full(0), 0.04, trBack),
    anim((ctx, T) => {
      // the spotlight cone from above
      const px = T.par * 0.04;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.2 + 0.03 * Math.sin(T.tt * 0.8);
      ctx.fillStyle = tk.lin(ctx, 0, -20, 0, TRS.top, [[0, A('#fff4d6', 0.95)], [1, A('#ffcf8a', 0.4)]]);
      ctx.beginPath(); ctx.moveTo(600 - px, -20); ctx.lineTo(680 - px, -20); ctx.lineTo(TRS.cx + 230, TRS.top); ctx.lineTo(TRS.cx - 230, TRS.top); ctx.closePath(); ctx.fill();
      ctx.restore();
    }),
    lay('stage', { x: 380, y: 500, w: 520, h: 120 }, 0, trStage),
    anim((ctx, T) => {
      const k = 1 + trHop(T) / 60;
      addMode(ctx, () => { glowE(ctx, TRS.cx, TRS.top, 210, 24, '#ffe2a8', 0.5); });
      ellip(ctx, TRS.cx - 6, TRS.top + 2, 100 * k, 12 * k, A('#2a0a3a', 0.45));
    }),
    lay('box', { x: 520, y: 310, w: 260, h: 250 }, 0, trBox, { dy: trHop }),
    anim((ctx, T) => {
      const hop = trHop(T), pf = T.pf;
      // sparkles round the box, a pop of them as it lands
      for (let i = 0; i < Math.round(7 * Math.max(0.4, pf)); i++) {
        const a = i / 7 * TAU + T.tt * 0.3, rr = 120 + 18 * Math.sin(T.tt * 1.3 + i), tw = 0.5 + 0.5 * Math.sin(T.tt * 2.2 + i * 1.7);
        tk.sparkle(ctx, TRS.cx + Math.cos(a) * rr, 470 + Math.sin(a) * rr * 0.55 + hop * 0.3, 4 + 7 * tw, { color: i % 2 ? '#ffd84d' : '#fff8ec', alpha: 0.5 + 0.5 * tw, glow: 0.5 });
      }
      drift(ctx, T, { key: 'hv-tr-dust', n: 26, sprs: [moteSpr('#fff4d6'), moteSpr('#ffe2a8')], area: { x: 450, y: 0, w: 380, h: 540 }, vx: 3, vy: 7, sway: 26, size: [3, 8], aspect: 1, alpha: [0.3, 0.85], add: true, wob: 0 });
    }),
    vigLayer('hv-tr-vig', { color: '#05030f', alpha: 0.55, inner: 0.3 }),
  ] };


  // ===============================================================================================================
  // THE LOGO: HOCUS over VOCUS in chunky rounded sticker letters (HOCUS candy pink with a light pink top band, VOCUS green with a lime top band),
  // a cream inner rim, a thick warm outline and a soft drop shadow down and to the left. Letters lean alternately by 3 degrees. The O of HOCUS is a
  // cherry blossom that turns slowly and lets a petal go; the O of VOCUS is a green mic grille with a short black handle that sends a sound ring.
  // A mic-wand (black body, pink band, a gold star for a grille, a trail of sparkles) crosses behind both words. Every letter is baked once per
  // width into its own sprite, so a frame is a dozen blits plus the live sparkles, rings and petal.
  // ===============================================================================================================
  const LOGO_COL = { H: { base: '#ff7eb6', top: '#ffc2dc' }, V: { base: '#3fcf6a', top: '#c6ff3d' } };
  const arcU = (cx, cy, rx, ry, a0, a1, n) => { const o = []; for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); o.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return o; };
  const splU = (pts) => { const f = tk.flatten(pts, { tension: 0.5, step: 0.02 }), o = []; for (let i = 0; i < f.length; i += 2) o.push([f[i], f[i + 1]]); return o; };
  // skeletons in a box of cap height 1 (y down from the cap line): w the advance, s the strokes, hi a short highlight dash (lit side, upper right)
  const LOGO_SK = {
    H: { w: 0.8, s: [[[0.13, 0], [0.13, 1]], [[0.67, 0], [0.67, 1]], [[0.13, 0.5], [0.67, 0.5]]], hi: [[0.72, 0.06], [0.72, 0.2]] },
    C: { w: 0.8, s: [arcU(0.45, 0.5, 0.34, 0.5, -0.82, -TAU + 0.82, 26)], hi: [[0.6, 0.0], [0.7, 0.05]] },
    U: { w: 0.82, s: [[[0.13, 0]].concat(arcU(0.42, 0.56, 0.29, 0.44, PI, 0, 18), [[0.71, 0]])], hi: [[0.76, 0.06], [0.76, 0.22]] },
    S: { w: 0.82, s: [splU([[0.7, 0.16], [0.5, 0.0], [0.26, 0.03], [0.13, 0.22], [0.25, 0.42], [0.47, 0.5], [0.66, 0.6], [0.72, 0.8], [0.56, 0.98], [0.3, 1.0], [0.1, 0.86]])], hi: [[0.42, -0.04], [0.56, -0.02]] },
    V: { w: 0.8, s: [[[0.06, 0], [0.4, 1], [0.74, 0]]], hi: [[0.8, 0.04], [0.76, 0.18]] },
  };
  const LOGO_CACHE = new Map();
  function logoLayout(w, line) {
    const key = Math.round(w) + (line ? 'L' : 'S');
    let L = LOGO_CACHE.get(key);
    if (L) return L;
    const u = line ? w * 0.102 : w * 0.148, S = 0.27, gap = 0.04;
    const rows = line ? [['H', 'O', 'C', 'U', 'S', ' ', 'V', 'O', 'C', 'U', 'S']] : [['H', 'O', 'C', 'U', 'S'], ['V', 'O', 'C', 'U', 'S']];
    const items = [];
    let n = 0;
    rows.forEach((row, ri) => {
      const word = (i) => (line ? (i < 5 ? 'H' : 'V') : (ri === 0 ? 'H' : 'V'));
      const adv = row.map((ch) => (ch === ' ' ? 0.34 : ch === 'O' ? 0.92 : LOGO_SK[ch].w) + gap);
      const rw = adv.reduce((a, b) => a + b, 0) - gap;
      let x = -rw / 2 + (line ? 0 : (ri === 0 ? -0.4 : 0.4));
      const cy = line ? 0 : (ri === 0 ? -0.685 : 0.685);
      row.forEach((ch, i) => {
        if (ch !== ' ') {
          const lw = ch === 'O' ? 0.92 : LOGO_SK[ch].w;
          items.push({ ch, wd: word(i), x: x, cx: x + lw / 2, cy, lw, lean: (n % 2 ? 1 : -1) * 3 * PI / 180, n });
          n++;
        }
        x += adv[i];
      });
    });
    L = { u, S, items, line: !!line, key, w };
    if (LOGO_CACHE.size > 12) LOGO_CACHE.clear();
    LOGO_CACHE.set(key, L);
    return L;
  }
  const logoInk = (w) => ({ rim: Math.max(0.8, w * 2 / 740), ol: Math.max(1, w * 5 / 740) });
  function strokeSet(g, strokes, u, lw, col, dx, dy) {
    g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    strokes.forEach((st) => st.forEach((p, i) => { const X = p[0] * u + dx, Y = p[1] * u + dy; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }));
    g.stroke();
  }
  // one letter: fill, top band and highlight; then (behind) the warm shade crescent, the cream rim, the warm outline and the drop shadow
  function letterSpr(L, it) {
    const u = L.u, pad = 0.42, sk = LOGO_SK[it.ch], col = LOGO_COL[it.wd], ink = logoInk(L.w), W = (it.lw + pad * 2) * u, H = (1 + pad * 2) * u;
    return ART.sprite('sc|hvlogo|' + L.key + '|' + it.n, W, H, (g) => {
      const S = L.S * u, d = S * 0.15, sh = Math.max(1, u * 0.055);
      g.translate(pad * u, pad * u);
      g.translate(it.lw * u / 2, u / 2); g.rotate(it.lean); g.translate(-it.lw * u / 2, -u / 2);
      strokeSet(g, sk.s, u, S, col.base, 0, 0);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = col.top; g.fillRect(-pad * u, -pad * u, W, (pad + 0.34) * u);
      g.fillStyle = A(col.top, 0.55); g.fillRect(-pad * u, 0.34 * u, W, 0.06 * u);
      strokeSet(g, [sk.hi], u, S * 0.22, A('#ffffff', 0.92), 0, 0);
      g.globalCompositeOperation = 'destination-over';
      strokeSet(g, sk.s, u, S, wsh(col.base, 0.1), -d, d);
      strokeSet(g, sk.s, u, S + ink.rim * 2, HV.cream, 0, 0); strokeSet(g, sk.s, u, S + ink.rim * 2, HV.cream, -d, d);
      strokeSet(g, sk.s, u, S + (ink.rim + ink.ol) * 2, OL, 0, 0); strokeSet(g, sk.s, u, S + (ink.rim + ink.ol) * 2, OL, -d, d);
      strokeSet(g, sk.s, u, S + (ink.rim + ink.ol) * 2, 'rgba(20,10,40,0.38)', -d - sh, d + sh * 1.3);
    });
  }
  // the blossom O (drawn turning, so its drop shadow is a separate silhouette sprite blitted under it)
  function blossomOSpr(L, shadow) {
    const u = L.u, R0 = 0.56 * u, ink = logoInk(L.w), W = u * 1.6;
    return ART.sprite('sc|hvlogoB|' + L.key + (shadow ? 's' : ''), W, W, (g) => {
      g.translate(W / 2, W / 2);
      if (shadow) { g.globalAlpha = 0.38; blossom(g, 0, 0, R0, 0, { lw: ink.ol + ink.rim, c0: '#140a28', c1: '#140a28', centre: '#140a28', dot: '#140a28' }); return; }
      // cream rim and warm outline round the petals, then the flower itself
      const pr = R0 * 0.46, pd = R0 * 0.54;
      [[ink.ol + ink.rim, OL], [ink.rim, HV.cream]].forEach((p) => { g.fillStyle = p[1]; g.beginPath(); for (let i = 0; i < 5; i++) { const a = -PI / 2 + i * TAU / 5, x = Math.cos(a) * pd, y = Math.sin(a) * pd; g.moveTo(x + pr + p[0], y); g.arc(x, y, pr + p[0], 0, TAU); } g.fill(); });
      blossom(g, 0, 0, R0, 0, { lw: 0, c0: '#ff5fa2', c1: '#ffc2dc' });
    });
  }
  // the mic-grille O: a green ball with a lime highlight and a dark green mesh, a short black handle with a lime band peeking below
  function grilleOSpr(L) {
    const u = L.u, R0 = 0.5 * u, ink = logoInk(L.w), W = u * 1.6, H = u * 2.0;
    return ART.sprite('sc|hvlogoG|' + L.key, W, H, (g) => {
      g.translate(W / 2, u * 0.7);
      const sh = Math.max(1, u * 0.055), hy = R0 * 0.82, hl = u * 0.36, hw = u * 0.15;
      const body = (c, grow, dx, dy) => {
        c.beginPath(); c.arc(dx, dy, R0 + grow, 0, TAU); c.fill();
        c.beginPath(); tk.trace(c, rrect(-hw - grow + dx, hy - grow + dy, (hw + grow) * 2, hl + grow * 2, hw * 0.5 + grow)); c.fill();
      };
      g.fillStyle = 'rgba(20,10,40,0.38)'; body(g, ink.rim + ink.ol, -sh, sh * 1.3);
      g.fillStyle = OL; body(g, ink.rim + ink.ol, 0, 0);
      g.fillStyle = HV.cream; body(g, ink.rim, 0, 0);
      // the handle and its lime band
      g.fillStyle = '#1d1c22'; g.beginPath(); tk.trace(g, rrect(-hw, hy, hw * 2, hl, hw * 0.5)); g.fill();
      g.fillStyle = '#615f6d'; g.fillRect(hw * 0.25, hy + 2, hw * 0.4, hl - 6);
      g.fillStyle = HV.lime; g.fillRect(-hw, hy + hl * 0.18, hw * 2, hl * 0.18);
      // the ball
      g.save();
      g.beginPath(); g.arc(0, 0, R0, 0, TAU); g.fillStyle = HV.green; g.fill(); g.clip();
      g.beginPath(); g.rect(-R0 * 2, -R0 * 2, R0 * 4, R0 * 4); g.arc(R0 * 0.16, -R0 * 0.16, R0 * 0.98, 0, TAU); g.fillStyle = wsh(HV.green, 0.12); g.fill('evenodd');
      g.strokeStyle = A('#0f5a2a', 0.75); g.lineWidth = Math.max(0.8, u * 0.022);
      g.beginPath();
      for (let k = -6; k <= 6; k++) { const o = k * R0 * 0.17; g.moveTo(o - R0, -R0); g.lineTo(o + R0, R0); g.moveTo(o - R0, R0); g.lineTo(o + R0, -R0); }
      g.stroke();
      g.fillStyle = A(HV.lime, 0.85); g.beginPath(); g.ellipse(R0 * 0.36, -R0 * 0.4, R0 * 0.3, R0 * 0.18, -0.7, 0, TAU); g.fill();
      g.fillStyle = A('#ffffff', 0.9); g.beginPath(); g.ellipse(R0 * 0.44, -R0 * 0.48, R0 * 0.1, R0 * 0.06, -0.7, 0, TAU); g.fill();
      g.restore();
      g.strokeStyle = A('#0f5a2a', 0.8); g.lineWidth = Math.max(0.8, u * 0.02); g.beginPath(); g.arc(0, 0, R0 * 0.99, 0, TAU); g.stroke();
    });
  }
  // the mic-wand behind the words: from the lower left (handle) to the upper right (the gold star)
  // the mic-wand: a hand mic body that swells from a rounded butt (lower left) to a pink collar, a little black cup, and the gold star sitting in
  // the cup where the grille would be. WAND_K: where the star's centre sits along the wand (0 butt, 1 tip).
  const WAND_K = 0.905, WAND_BODY = 0.79, WAND_BAND = 0.845, WAND_CUP = 0.875;
  function wandGeo(L) {
    const w = L.w;
    return L.line ? { ax: -0.5 * w, ay: 0.075 * w, bx: 0.64 * w, by: -0.1 * w } : { ax: -0.47 * w, ay: 0.16 * w, bx: 0.5 * w, by: -0.19 * w };
  }
  function wandSpr(L) {
    const u = L.u, G = wandGeo(L), ink = logoInk(L.w), x0 = Math.min(G.ax, G.bx) - u * 0.6, y0 = Math.min(G.ay, G.by) - u * 0.6, W = Math.abs(G.bx - G.ax) + u * 1.2, H = Math.abs(G.by - G.ay) + u * 1.2;
    return { x0, y0, W, H, spr: ART.sprite('sc|hvlogoW|' + L.key, W, H, (g) => {
      g.translate(-x0, -y0);
      const dx = G.bx - G.ax, dy = G.by - G.ay, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
      g.translate(G.ax, G.ay); g.rotate(ang);
      const sh = Math.max(1, u * 0.05);
      const r0 = u * 0.075, r1 = u * 0.135, rb = u * 0.16, rc = u * 0.2;
      const xe = len * WAND_BODY, xb = len * WAND_BAND, xc = len * WAND_CUP;
      // body (rounded butt, swelling cone), collar and cup as one union of sub-paths, grown for the rim and the outline
      const shape = (c, grow, ox, oy) => {
        c.beginPath();
        c.moveTo(xe + ox, -(r1 + grow) + oy); c.lineTo(ox, -(r0 + grow) + oy); c.arc(ox, oy, r0 + grow, -PI / 2, PI / 2, true); c.lineTo(xe + ox, r1 + grow + oy); c.closePath();
        tk.trace(c, rrect(xe - u * 0.02 - grow + ox, -(rb + grow) + oy, xb - xe + u * 0.02 + grow * 2, (rb + grow) * 2, rb * 0.3 + grow));
        c.moveTo(xb - u * 0.01 - grow + ox, -(rb * 0.85 + grow) + oy); c.lineTo(xc + grow + ox, -(rc + grow) + oy); c.lineTo(xc + grow + ox, rc + grow + oy); c.lineTo(xb - u * 0.01 - grow + ox, rb * 0.85 + grow + oy); c.closePath();
        c.fill();
      };
      g.lineJoin = 'round';
      g.fillStyle = 'rgba(20,10,40,0.35)'; shape(g, ink.ol + ink.rim, -sh, sh);
      g.fillStyle = OL; shape(g, ink.ol + ink.rim, 0, 0);
      g.fillStyle = HV.cream; shape(g, ink.rim, 0, 0);
      g.fillStyle = '#1d1c22'; shape(g, 0, 0, 0);
      // the hard cel shadow on the lower side of the body, and one thin highlight on the lit (upper) side
      g.save();
      g.beginPath(); g.moveTo(xe, r1 * 0.25); g.lineTo(0, r0 * 0.25); g.arc(0, 0, r0, PI * 0.08, PI / 2); g.lineTo(xe, r1); g.closePath(); g.fillStyle = '#0d0c12'; g.fill();
      g.strokeStyle = '#5d5a6b'; g.lineWidth = Math.max(1, u * 0.035); g.lineCap = 'round';
      g.beginPath(); g.moveTo(u * 0.08, -r0 * 0.5); g.lineTo(xe - u * 0.1, -r1 * 0.55); g.stroke();
      g.restore();
      // the pink collar under the star, with a lighter top band and a tiny highlight
      g.save();
      g.beginPath(); tk.trace(g, rrect(xe - u * 0.02, -rb, xb - xe + u * 0.02, rb * 2, rb * 0.3)); g.fillStyle = HV.pink; g.fill(); g.clip();
      g.fillStyle = HV.pinkL; g.fillRect(xe - u * 0.05, -rb - 1, xb - xe + u * 0.1, rb * 0.75);
      g.fillStyle = wsh(HV.pink, 0.12); g.fillRect(xe - u * 0.05, rb * 0.45, xb - xe + u * 0.1, rb);
      g.restore();
      g.strokeStyle = OL; g.lineWidth = Math.max(0.8, ink.ol * 0.5);
      g.beginPath(); g.moveTo(xe - u * 0.02, -rb); g.lineTo(xe - u * 0.02, rb); g.moveTo(xb, -rb); g.lineTo(xb, rb); g.stroke();
      // the gold star where the grille would be
      g.translate(len * WAND_K, 0); g.rotate(-ang + 0.12);
      const sr = u * 0.42;
      g.save(); g.lineJoin = 'round';
      star5Path(g, -sh, sh, sr, 0, 0.5); g.lineWidth = (ink.ol + ink.rim) * 2; g.strokeStyle = 'rgba(20,10,40,0.35)'; g.stroke(); g.fillStyle = 'rgba(20,10,40,0.35)'; g.fill();
      star5Path(g, 0, 0, sr, 0, 0.5); g.lineWidth = (ink.ol + ink.rim) * 2; g.strokeStyle = OL; g.stroke();
      g.lineWidth = ink.rim * 2; g.strokeStyle = HV.cream; g.stroke();
      g.fillStyle = '#ffd84d'; g.fill(); g.clip();
      g.fillStyle = '#f5a623'; g.beginPath(); g.moveTo(-sr * 1.4, sr * 1.4); g.lineTo(sr * 1.4, -sr * 0.2); g.lineTo(sr * 1.4, sr * 1.4); g.closePath(); g.fill();
      g.fillStyle = A('#fff6c0', 0.95); g.beginPath(); g.ellipse(sr * 0.18, -sr * 0.42, sr * 0.14, sr * 0.08, -0.6, 0, TAU); g.fill();
      g.restore();
    }) };
  }
  // the live layer: bob, the turning blossom and its petal, the grille's sound ring, the wand's twinkle and sparkle trail
  function logoDraw(ctx, x, y, w, t, opts) {
    const L = logoLayout(w, !!(opts && opts.line)), u = L.u, mot = tk.motion(), tm = t * mot;
    const bob = mot < 1 ? 0 : 2 * w / 540;
    // every sprite the logo ever needs is asked for on every frame (a cache lookup), so no later frame bakes anything
    const W = wandSpr(L), bl = blossomOSpr(L, false), blS = blossomOSpr(L, true), gr = grilleOSpr(L), pet = petalSpr('#ff9cc6', 1);
    const sprs = L.items.map((it) => (it.ch === 'O' ? null : letterSpr(L, it)));
    ART.blit(ctx, W.spr, x + W.x0, y + W.y0, W.W, W.H);
    const G = wandGeo(L), ang = Math.atan2(G.by - G.ay, G.bx - G.ax), len = Math.hypot(G.bx - G.ax, G.by - G.ay);
    const sx = x + G.ax + Math.cos(ang) * len * WAND_K, sy = y + G.ay + Math.sin(ang) * len * WAND_K;
    // the sparkle trail behind the star (drawn before the words so the words sit on top)
    for (let i = 0; i < 6; i++) {
      const k = (i + 1) / 6, px = sx - Math.cos(ang) * u * (0.55 + k * 1.7) + Math.sin(ang) * u * 0.45 * Math.sin(k * 5), py = sy - Math.sin(ang) * u * (0.55 + k * 1.7) - Math.cos(ang) * u * 0.45 * Math.sin(k * 5) - u * 0.25;
      const sh = 0.5 + 0.5 * Math.sin(tm * 3.1 + i * 1.9);
      tk.sparkle(ctx, px, py, u * (0.12 - k * 0.06) * (0.6 + 0.6 * sh), { color: i % 2 ? '#ffd84d' : '#fff8ec', alpha: (0.95 - k * 0.5) * (0.4 + 0.6 * sh), glow: 0.4 });
    }
    // the letters
    L.items.forEach((it, i) => {
      const by = bob * Math.sin((t / 0.8) * TAU - it.n * 0.7), cx = x + it.cx * u, cy = y + it.cy * u + by;
      if (it.ch === 'O' && it.wd === 'H') {
        const rot = (tm / 9) * TAU, Wb = u * 1.6, sh = Math.max(1, u * 0.055);
        ctx.save(); ctx.translate(cx - sh, cy + sh * 1.3); ctx.rotate(rot); ART.blit(ctx, blS, -Wb / 2, -Wb / 2, Wb, Wb); ctx.restore();
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ART.blit(ctx, bl, -Wb / 2, -Wb / 2, Wb, Wb); ctx.restore();
        // a petal lets go every 5.2 s and drifts off down and to the left
        const pp = ((tm % 5.2) + 5.2) % 5.2, pu = pp / 3.2;
        if (pu < 1) {
          const a = rot - PI / 2 + 2 * TAU / 5, px = cx + Math.cos(a) * u * 0.42 - pu * u * 0.9 + Math.sin(pu * 7) * u * 0.08, py = cy + Math.sin(a) * u * 0.42 + pu * u * 1.1;
          ctx.save(); ctx.translate(px, py); ctx.rotate(pu * 5 + a); ART.blit(ctx, pet, -u * 0.12, -u * 0.12, u * 0.24, u * 0.24, 1 - pu * pu); ctx.restore();
        }
      } else if (it.ch === 'O') {
        const Wg = u * 1.6, Hg = u * 2.0;
        ART.blit(ctx, gr, cx - Wg / 2, cy - u * 0.7, Wg, Hg);
        // a sound ring rolls out of the grille every 7.3 s
        const rp = ((tm % 7.3) + 7.3) % 7.3, ru = rp / 1.6;
        if (ru < 1) {
          ctx.save(); ctx.lineCap = 'round';
          const rr = u * (0.6 + ru * 0.9);
          ctx.globalAlpha = 0.9 * (1 - ru); ctx.strokeStyle = HV.lime; ctx.lineWidth = Math.max(1, u * 0.05 * (1 - ru * 0.5));
          ctx.beginPath(); ctx.arc(cx, cy, rr, -PI * 0.9, -PI * 0.1); ctx.stroke();
          ctx.globalAlpha = 0.7 * (1 - ru); ctx.strokeStyle = HV.cream; ctx.lineWidth = Math.max(0.8, u * 0.025);
          ctx.beginPath(); ctx.arc(cx, cy, rr * 0.8, -PI * 0.85, -PI * 0.15); ctx.stroke();
          ctx.restore();
        }
      } else {
        const pad = 0.42, spr = sprs[i];
        ART.blit(ctx, spr, x + (it.x - pad) * u, y + (it.cy - 0.5 - pad) * u + by, (it.lw + pad * 2) * u, (1 + pad * 2) * u);
      }
    });
    // the star twinkles every 6.1 s
    const tw = ((tm % 6.1) + 6.1) % 6.1, tu = tw / 0.9;
    const flash = tu < 1 ? Math.sin(tu * PI) : 0;
    tk.sparkle(ctx, sx + u * 0.16, sy - u * 0.2, u * (0.1 + 0.32 * flash), { color: '#fffbe8', alpha: 0.35 + 0.65 * flash, glow: 0.3 + 0.5 * flash, rot: 0.2 });
  }

  // ===============================================================================================================
  // THE RJ MONOGRAM (ART.scene.monogram): one chunky rounded cream stroke, the stem of an R, its bowl, and the bowl's tail running down into the
  // hook of a J, two short bars inside the bowl, on a disc split diagonally pink and green, under the warm outline. Cached per radius.
  // ===============================================================================================================
  const MONO_PATH = (g, k, dy) => {
    g.beginPath();
    g.moveTo(-0.42 * k, (0.34 + dy) * k); g.lineTo(-0.42 * k, (-0.56 + dy) * k); g.lineTo(0.02 * k, (-0.56 + dy) * k);
    g.quadraticCurveTo(0.36 * k, (-0.56 + dy) * k, 0.36 * k, (-0.32 + dy) * k); g.quadraticCurveTo(0.36 * k, (-0.08 + dy) * k, 0.02 * k, (-0.08 + dy) * k);
    g.lineTo(-0.14 * k, (-0.08 + dy) * k); g.lineTo(0.26 * k, (0.16 + dy) * k); g.lineTo(0.26 * k, (0.5 + dy) * k);
    g.quadraticCurveTo(0.26 * k, (0.76 + dy) * k, 0.02 * k, (0.76 + dy) * k); g.quadraticCurveTo(-0.18 * k, (0.76 + dy) * k, -0.2 * k, (0.58 + dy) * k);
  };
  function monoSpr(r) {
    const rr = Math.max(2, Math.round(r * 2) / 2), W = rr * 2.5;
    return ART.sprite('sc|hvmono|' + rr, W, W, (g) => {
      g.translate(W / 2, W / 2);
      const ol = Math.max(0.8, rr * 0.08), rim = Math.max(0.6, rr * 0.06), sh = Math.max(0.6, rr * 0.07);
      disc(g, -sh, sh * 1.3, rr, 'rgba(20,10,40,0.35)');
      disc(g, 0, 0, rr, OL);
      disc(g, 0, 0, rr - ol, HV.cream);
      const ri = rr - ol - rim;
      g.save();
      g.beginPath(); g.arc(0, 0, ri, 0, TAU); g.fillStyle = HV.pink; g.fill(); g.clip();
      g.fillStyle = HV.green; g.beginPath(); g.moveTo(-ri * 1.3, ri * 1.3); g.lineTo(ri * 1.3, -ri * 1.3); g.lineTo(ri * 1.3, ri * 1.3); g.closePath(); g.fill();
      g.strokeStyle = A(OL, 0.5); g.lineWidth = Math.max(0.6, rr * 0.03); g.beginPath(); g.moveTo(-ri * 1.3, ri * 1.3); g.lineTo(ri * 1.3, -ri * 1.3); g.stroke();
      g.beginPath(); g.rect(-ri * 2, -ri * 2, ri * 4, ri * 4); g.arc(ri * 0.12, -ri * 0.12, ri * 0.98, 0, TAU); g.fillStyle = A('#5a1a48', 0.22); g.fill('evenodd');
      g.restore();
      g.strokeStyle = A('#ffffff', 0.7); g.lineWidth = Math.max(0.8, rr * 0.06); g.lineCap = 'round';
      g.beginPath(); g.arc(0, 0, ri * 0.82, -PI * 0.42, -PI * 0.12); g.stroke();
      // the glyph: outline pass, then the cream stroke, then the two bars
      const k = ri * 0.95, dy = -0.08, sw = Math.max(1, k * 0.19), gol = Math.max(0.7, k * 0.06);
      g.lineJoin = 'round'; g.lineCap = 'round';
      MONO_PATH(g, k, dy); g.strokeStyle = OL; g.lineWidth = sw + gol * 2; g.stroke();
      MONO_PATH(g, k, dy); g.strokeStyle = HV.cream; g.lineWidth = sw; g.stroke();
      [-0.39, -0.25].forEach((by) => {
        g.beginPath(); g.moveTo(-0.2 * k, (by + dy) * k); g.lineTo(0.06 * k, (by + dy) * k);
        g.strokeStyle = OL; g.lineWidth = Math.max(0.8, k * 0.07) + gol * 2; g.stroke();
        g.strokeStyle = HV.cream; g.lineWidth = Math.max(0.8, k * 0.07); g.stroke();
      });
    });
  }
  function monoDraw(ctx, x, y, r, o) {
    o = o && typeof o === 'object' ? o : {};
    r = num(r, 16);
    if (!(r > 0.5)) return;
    const rr = Math.max(2, Math.round(r * 2) / 2), W = rr * 2.5, a = o.alpha === undefined ? 1 : cA(num(o.alpha, 1));
    if (!(a > 0.003)) return;
    ART.blit(ctx, monoSpr(rr), num(x, 0) - W / 2 * (r / rr), num(y, 0) - W / 2 * (r / rr), W * (r / rr), W * (r / rr), a);
  }

  // ===============================================================================================================
  // VICTORY: dawn over the open stage. The curtains are tied wide, the sky goes from violet to peach, the moon is setting, the Gloss has softened
  // into ordinary warm stage shine, two spotlights sweep and the crowd sings along with their arms up (generic silhouettes, no faces), swaying.
  // Confetti and cherry petals fall, tumbling every which way (never in a grid).
  // ===============================================================================================================
  const VS = { cx: 640, top: 498, rx: 380, ry: 30, lip: 30 };
  function vcSky(g) {
    fillRectG(g, X0, 0, XW, 560, [[0, '#2b1f6e'], [0.3, '#6a3f9e'], [0.55, '#d86aa8'], [0.75, '#ffa48a'], [0.9, '#ffcf8a'], [1, '#ffe2a8']]);
    hvStars(g, 'hv-vc-stars', 50, 0, 170);
    // the sun coming up behind the stage, and the moon setting at the left
    blob(g, 760, 470, 520, 240, '#ffd88a', 0.55); blob(g, 760, 470, 220, 120, '#fff4d6', 0.7);
    hvMoon(g, 210, 432, 46, { glow: '#ffc2dc', base: '#fff0dc', shade: '#f6c8b0' });
    // soft dawn clouds: flat cream puffs with a pink underside
    [[300, 160, 1.1], [980, 120, 1.3], [620, 210, 0.8], [1180, 250, 0.9]].forEach((c, i) => {
      const s = c[2], cs = [[c[0] - 40 * s, c[1] + 6 * s, 26 * s], [c[0], c[1] - 8 * s, 34 * s], [c[0] + 42 * s, c[1] + 4 * s, 24 * s], [c[0] + 16 * s, c[1] + 12 * s, 26 * s]];
      puffs(g, cs, '#ffe6ee', { lw: 2.2, shade: '#ffa8c0', hi: '#ffffff', lit: 0.14 });
    });
  }
  function vcFar(g) {
    // lilac hills with Blossom Bay's roofs and a few cherry trees catching the first light
    const h1 = ridgePts(301, X0, X0 + XW, 452, 46, 0.003, { oct: 3 });
    fillRidge(g, h1, 560, tk.lin(g, 0, 400, 0, 540, [[0, '#c79ad8'], [1, '#9a6ab8']]));
    oline(g, h1, 2, { color: A(OL, 0.55), taper: 0 });
    const r = R('hv-vc-roofs');
    for (let x = X0 + 10; x < X0 + XW; x += 30 + r() * 40) {
      const y = ridgeY(h1, x) + 8, w = 18 + r() * 16, h = 14 + r() * 16, c = U.color.mix([HV.tomato, HV.mint, HV.gold, HV.sky, '#ff9fc6'][Math.floor(r() * 5)], '#c79ad8', 0.35);
      cel(g, rect4(x, y - h, w, h + 6), c, { line: 1.4, depth: 3, tension: 0 });
      cel(g, { poly: [[x - 3, y - h + 1], [x + w / 2, y - h - w * 0.4], [x + w + 3, y - h + 1]] }, U.color.mix('#c93f5a', '#c79ad8', 0.3), { line: 1.4, depth: 2, tension: 0 });
    }
    const h2 = ridgePts(307, X0, X0 + XW, 486, 26, 0.005, { oct: 3 });
    fillRidge(g, h2, 560, tk.lin(g, 0, 460, 0, 540, [[0, '#8a5aa8'], [1, '#6a3f8e']]));
    oline(g, h2, 2.2, { color: A(OL, 0.7), taper: 0 });
  }
  // the open stage: a scalloped valance across the top, the curtains tied wide at both sides, the round stage with a cream lip
  function vcStage(g) {
    // the audience floor in front of the stage (the crowd stands on it)
    fillRectG(g, X0, 520, XW, DH - 520, [[0, '#4a2a6a'], [0.4, '#2c1846'], [1, '#160c26']]);
    curtain(g, -20, 150, 40, 560, { tieY: 380, tieIn: 0.45, folds: 6 });
    curtain(g, 1300, 1130, 40, 560, { tieY: 380, tieIn: 0.45, folds: 6 });
    // the valance: red with gold scallops
    const vy = 58;
    const edge = []; for (let x = -40; x <= 1320; x += 4) { const k = ((x + 40) % 64) / 64; edge.push([x, vy + 26 * Math.sin(k * PI) * 0.86]); }
    g.save(); g.beginPath(); g.moveTo(-40, -10); g.lineTo(1320, -10);
    for (let i = edge.length - 1; i >= 0; i--) g.lineTo(edge[i][0], edge[i][1]);
    g.closePath(); g.fillStyle = HV.red; g.fill(); g.clip();
    for (let x = -30; x < 1320; x += 32) { g.fillStyle = A(HV.redD, 0.6); g.fillRect(x, -10, 12, vy + 30); }
    g.restore();
    oline(g, edge, 9, { taper: 0 }); oline(g, edge, 5, { taper: 0, color: HV.gold });
    for (let x = -8; x < 1300; x += 64) { puffs(g, [[x, vy + 26, 6]], HV.gold, { lw: 2 }); }
    // the round stage
    const S = VS, front = [], back = [];
    for (let i = 0; i <= 48; i++) { const a = i / 48 * PI; front.push([S.cx - Math.cos(a) * S.rx, S.top + Math.sin(a) * S.ry]); }
    for (let i = 48; i >= 0; i--) { const a = i / 48 * PI; back.push([S.cx - Math.cos(a) * S.rx, S.top + Math.sin(a) * S.ry + S.lip]); }
    cel(g, { poly: front.concat(back) }, '#8a2a62', { line: 2.8, depth: 8, shadow: '#5e1446', tension: 0 });
    for (let i = 1; i < 22; i++) { const a = i / 22 * PI, x = S.cx - Math.cos(a) * S.rx * 0.98, y = S.top + Math.sin(a) * S.ry + S.lip * 0.55; puffs(g, [[x, y, 4]], '#ffe39a', { lw: 1.4, hi: '#ffffff' }); }
    g.save();
    g.beginPath(); g.ellipse(S.cx, S.top, S.rx, S.ry, 0, 0, TAU); g.fillStyle = tk.rad(g, S.cx, S.top - 6, 10, S.cx, S.top, S.rx, [[0, '#ffd2a0'], [0.6, '#e48a8a'], [1, '#b05a7a']]); g.fill();
    g.restore();
    g.save(); g.strokeStyle = OL; g.lineWidth = 9; g.beginPath(); g.ellipse(S.cx, S.top, S.rx, S.ry, 0, 0, TAU); g.stroke();
    g.strokeStyle = HV.cream; g.lineWidth = 5; g.beginPath(); g.ellipse(S.cx, S.top, S.rx, S.ry, 0, 0, TAU); g.stroke(); g.restore();
    // a mic stand at the back of the stage, live and warm, and two little speakers
    const mx = 640, my = 486;
    cel(g, tk.ellipsePts(mx, my, 20, 5, 14), '#4a4a6a', { line: 2, depth: 2 });
    cel(g, rect4(mx - 2.4, my - 92, 4.8, 90), HV.chrome, { line: 2, depth: 2, tension: 0 });
    cel(g, tk.ellipsePts(mx, my - 104, 12, 16, 16), '#d8dae6', { line: 2.4, depth: 4, shadow: '#8c8ea6', hi: '#ffffff' });
    [[430, 1], [850, -1]].forEach((s) => {
      const x = s[0];
      cel(g, rrect(x - 26, 420, 52, 72, 8), '#3a3448', { line: 2.6, depth: 5 });
      puffs(g, [[x, 444, 13]], '#1d1c22', { lw: 2, hi: '#615f6d' }); puffs(g, [[x, 474, 8]], '#1d1c22', { lw: 2, hi: '#615f6d' });
    });
  }
  // the crowd: rows of generic singing silhouettes, arms up, a warm rim from the stage. Baked as wide strips that sway.
  function crowdRow(g, y, n, seed, col, rim) {
    const r = R('hv-crowd', seed);
    for (let i = 0; i < n; i++) {
      const x = -40 + (i + r() * 0.6) * (1360 / n), s = 0.8 + r() * 0.4, up = r();
      const hx = x, hy = y - 66 * s;
      // body and arms
      const arms = up < 0.55 ? [[[hx - 14 * s, hy + 26 * s], [hx - 30 * s, hy - 10 * s], [hx - 26 * s, hy - 40 * s]], [[hx + 14 * s, hy + 26 * s], [hx + 28 * s, hy - 12 * s], [hx + 30 * s, hy - 42 * s]]] : up < 0.8 ? [[[hx + 14 * s, hy + 26 * s], [hx + 30 * s, hy - 6 * s], [hx + 22 * s, hy - 44 * s]]] : [];
      arms.forEach((a) => { tk.inkPath(g, a, { w: 13 * s + 5, color: OL, taper: 0, pressure: 'flat', wobble: 0 }); });
      g.fillStyle = OL; g.beginPath(); tk.trace(g, rrect(hx - 24 * s - 2.5, hy + 16 * s - 2.5, 48 * s + 5, 90 * s, 20 * s)); g.fill();
      disc(g, hx, hy, 20 * s + 2.5, OL);
      arms.forEach((a) => { tk.inkPath(g, a, { w: 13 * s, color: col, taper: 0, pressure: 'flat', wobble: 0 }); disc(g, a[2][0], a[2][1], 7.5 * s, col); });
      g.fillStyle = col; g.beginPath(); tk.trace(g, rrect(hx - 24 * s, hy + 16 * s, 48 * s, 90 * s, 20 * s)); g.fill();
      disc(g, hx, hy, 20 * s, col);
      // the warm rim from the stage on the upper right of each head and shoulder
      g.fillStyle = A(rim, 0.8); g.beginPath(); g.arc(hx, hy, 20 * s, -PI * 0.62, -PI * 0.02); g.arc(hx - 1.6 * s, hy + 1.6 * s, 19.4 * s, -PI * 0.02, -PI * 0.62, true); g.fill();
      if (r() < 0.3) { const c = [HV.pink, HV.green, HV.gold][Math.floor(r() * 3)]; disc(g, hx + 30 * s, hy - 50 * s, 6 * s, c); }       // a little light stick glow
    }
  }
  SCENES.victory = { id: 'victory', combat: false, mood: 'dawn, the crowd sings along', sway: 8, items: [
    lay('sky', full(0, 560), 0.02, vcSky),
    lay('far', full(380, 190), 0.06, vcFar),
    raysLayer('hv-vc-rays', 760, 470, [-160, -135, -110, -90, -70, -45, -20], 7, '#ffe2a8', 0.4, { r0: 120 }),
    lay('stage', full(0), 0.12, vcStage),
    anim((ctx, T) => {
      // two spotlights sweeping from the top corners, and warm stage shine where the Gloss used to be
      const px = T.par * 0.12;
      addMode(ctx, () => {
        [[200, -1], [1080, 1]].forEach((s, i) => {
          const a = PI / 2 + s[1] * (0.32 + 0.18 * Math.sin(T.tt * 0.5 + i * 2.1)), L = 620;
          ctx.save(); ctx.translate(s[0] - px, 40); ctx.rotate(a - PI / 2);
          ctx.globalAlpha = 0.22; ctx.fillStyle = tk.lin(ctx, 0, 0, 0, L, [[0, A('#fff4d6', 0.9)], [1, A('#ffcf8a', 0)]]);
          ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.lineTo(110, L); ctx.lineTo(-110, L); ctx.closePath(); ctx.fill();
          ctx.restore();
        });
        glowE(ctx, VS.cx - px, VS.top, 380, 46, '#ffd88a', 0.4);
      });
      drift(ctx, T, { key: 'hv-vc-shine', n: 18, sprs: [sparkSpr('#fff4d6'), sparkSpr('#ffd84d')], area: { x: 240, y: 120, w: 800, h: 360 }, vx: 0, vy: -10, sway: 20, size: [8, 18], aspect: 1, spin: 0.3, wob: 0.5, alpha: [0.4, 0.95], add: true });
    }),
    lay('crowdBack', { x: -40, y: 520, w: 1360, h: 140 }, 0.5, (g) => crowdRow(g, 640, 16, 1, '#4a2a6a', '#ffb38a'), { bob: [3, 4.4, 0] }),
    lay('crowdFront', { x: -40, y: 560, w: 1360, h: 160 }, 0.9, (g) => crowdRow(g, 712, 12, 2, '#2a1846', '#ffcf8a'), { bob: [4, 4.4, 1.6] }),
    anim((ctx, T) => {
      const cols = [HV.pink, HV.green, HV.gold, HV.sky, HV.cream, '#a77bff'];
      drift(ctx, T, { key: 'hv-vc-confetti', n: 46, sprs: cols.map((c, i) => confettiSpr(c, i)), area: { x: 0, y: -20, w: DW, h: DH }, vx: 8, vy: 60, sway: 50, size: [9, 15], aspect: 1, tumble: true, spin: 1.6, alpha: [0.85, 1] });
      drift(ctx, T, { key: 'hv-vc-petals', n: 20, sprs: [petalSpr('#ffc2dc', 0), petalSpr('#ff9cc6', 1), petalSpr('#fff0f6', 2)], area: { x: 0, y: 0, w: DW, h: DH }, vx: -30, vy: 34, sway: 40, size: [12, 20], aspect: 1, tumble: true, spin: 0.7, alpha: [0.8, 1] });
      drift(ctx, T, { key: 'hv-vc-notes', n: 10, sprs: [noteSpr(0), noteSpr(1), noteSpr(2), heartSpr(HV.pink)], area: { x: 80, y: 260, w: 1120, h: 330 }, vx: 0, vy: -30, sway: 26, size: [18, 28], aspect: 1, spin: 0.2, wob: 0.3, alpha: [0.6, 0.95] });
    }),
    vigLayer('hv-vc-vig', { color: '#2a0f3a', alpha: 0.35, inner: 0.36 }),
  ] };

  // ===============================================================================================================
  // DEFEAT: an empty stage after the show. The curtain is half closed, one mic stand stands in a single soft spotlight, the pastel Gloss sheen
  // settles over the floor like dust, and under the curtain's hem runs a thin warm line of light: every 6 s the curtain twitches (the show goes
  // on). Indigo and pastel, never broken, never dark red.
  // ===============================================================================================================
  const DF = { floor: 500, micX: 640, micB: 642, gap0: 448, gap1: 832 };
  function dfBack(g) {
    // the back wall of the stage between the half-closed curtains: deep indigo flats, a light truss up in the dark, a warm glow from a door
    // left ajar backstage, and a flight case and a stool waiting for tomorrow
    fillRectG(g, X0, 0, XW, DF.floor + 10, [[0, '#0c0a26'], [0.6, '#17123f'], [1, '#262056']]);
    g.strokeStyle = A('#3a3274', 0.7); g.lineWidth = 2;
    for (let x = 380; x < 920; x += 96) { g.beginPath(); g.moveTo(x, 150); g.lineTo(x, DF.floor); g.stroke(); }
    blob(g, 560, 420, 150, 140, '#ffcf8a', 0.16);
    cel(g, rect4(520, 300, 64, DF.floor - 300), '#2c2350', { line: 2.2, depth: 3, tension: 0 });
    g.save(); g.beginPath(); tk.trace(g, rect4(520, 300, 64, DF.floor - 300)); g.clip();
    g.fillStyle = tk.lin(g, 520, 0, 584, 0, [[0, A('#ffcf8a', 0.75)], [0.4, A('#ffcf8a', 0.25)], [1, A('#ffcf8a', 0)]]); g.fillRect(520, 300, 26, DF.floor - 300);
    g.restore();
    blob(g, 548, DF.floor, 120, 18, '#ffcf8a', 0.3);
    // the truss with three dark stage lamps
    cel(g, rect4(330, 112, 620, 14), '#3a3268', { line: 2.2, depth: 3, tension: 0 });
    g.strokeStyle = A(OL, 0.6); g.lineWidth = 1.6; g.beginPath();
    for (let x = 336; x < 944; x += 22) { g.moveTo(x, 114); g.lineTo(x + 11, 124); g.lineTo(x + 22, 114); }
    g.stroke();
    [470, 640, 810].forEach((x) => { cel(g, rrect(x - 13, 128, 26, 30, 7), '#2a2440', { line: 2.2, depth: 3, hi: '#4a4466' }); ellip(g, x, 158, 9, 3.5, '#4a4466'); });
    // a flight case with two stickers and a stool, in the shadow at the back
    cel(g, rrect(668, 428, 96, 66, 6), '#2e2a4a', { line: 2.4, depth: 4, hi: '#4a4670' });
    cel(g, rect4(668, 452, 96, 6), '#4a4670', { line: 1.6, depth: 1, tension: 0 });
    puffs(g, [[696, 474, 7]], A(HV.pink, 0.55), { lw: 1.2, hi: false }); star5(g, 738, 475, 7, A(HV.green, 0.55), 0.2, 1.2);
    cel(g, tk.ellipsePts(800, 448, 22, 6, 16), '#3a3060', { line: 2, depth: 2 });
    [[786, 452, 780, 496], [814, 452, 820, 496], [800, 454, 800, 494]].forEach((l) => oline(g, [[l[0], l[1]], [l[2], l[3]]], 4, { color: '#2a2246', taper: 0 }));
  }
  const DF_CURT = { tieY: 318, tieIn: 0.16, tieSpan: 0.2, folds: 8, base: '#6a3a86', shade: '#47286a' };
  function dfCurtainL(g) { curtain(g, -30, DF.gap0, 30, DF.floor + 4, DF_CURT); dfHem(g, -30, DF.gap0); }
  function dfCurtainR(g) { curtain(g, 1310, DF.gap1, 30, DF.floor + 4, DF_CURT); dfHem(g, DF.gap1, 1310); }
  // the thin warm line of light that leaks under a curtain's hem (the show goes on behind it)
  function dfHem(g, x0, x1) { const a = Math.min(x0, x1) + 6, b = Math.max(x0, x1) - 6; oline(g, [[a, DF.floor + 5], [b, DF.floor + 5]], 2.6, { taper: 0.02, color: '#ffcf8a' }); }
  function dfFront(g) {
    // the valance and the stage floor: boards running across, a few staggered board ends, the cream lip at the front edge
    const edge = []; for (let x = -40; x <= 1320; x += 4) { const k = ((x + 40) % 80) / 80; edge.push([x, 48 + 32 * Math.sin(k * PI) * 0.86]); }
    g.save(); g.beginPath(); g.moveTo(-40, -10); g.lineTo(1320, -10);
    for (let i = edge.length - 1; i >= 0; i--) g.lineTo(edge[i][0], edge[i][1]);
    g.closePath(); g.fillStyle = '#56307a'; g.fill(); g.clip();
    for (let x = -30; x < 1320; x += 40) { g.fillStyle = A('#3a1e5a', 0.6); g.fillRect(x, -10, 14, 90); }
    g.restore();
    oline(g, edge, 8, { taper: 0 }); oline(g, edge, 4.4, { taper: 0, color: '#d8b060' });
    fillRectG(g, X0, DF.floor, XW, DH - DF.floor, [[0, '#33286a'], [0.3, '#251c56'], [1, '#110c2c']]);
    oline(g, [[X0, DF.floor], [X0 + XW, DF.floor]], 3, { taper: 0 });
    const rows = [];
    for (let k = 1; k < 9; k++) rows.push(DF.floor + k * k * 2.7 + k * 4);
    g.lineWidth = 1.8;
    rows.forEach((y, i) => {
      if (y > 684) return;
      g.strokeStyle = A('#4a3c8a', 0.55); g.beginPath(); g.moveTo(X0, y); g.lineTo(X0 + XW, y); g.stroke();
      const prev = i ? rows[i - 1] : DF.floor, r = R('hv-df-board', i);
      for (let x = X0 + r() * 200; x < X0 + XW; x += 180 + r() * 160) { const dx = (x - 640) * 0.04; g.beginPath(); g.moveTo(x - dx, prev); g.lineTo(x, y); g.stroke(); }
    });
    // the cream lip at the front edge of the stage
    oline(g, [[X0, 690], [X0 + XW, 690]], 10, { taper: 0 }); oline(g, [[X0, 690], [X0 + XW, 690]], 6, { taper: 0, color: '#d8ccb8' });
    // two strips of tape on the floor, pink and green: the marks where the two voices stood
    [[560, 618, HV.pink, 0.2], [722, 620, HV.green, -0.15]].forEach((m) => {
      g.save(); g.translate(m[0], m[1]); g.scale(1, 0.42);
      [m[3] + PI / 4, m[3] - PI / 4].forEach((a) => { g.save(); g.rotate(a); cel(g, rect4(-22, -5, 44, 10), U.color.mix(m[2], '#33286a', 0.35), { line: 1.4, depth: 1.5, tension: 0 }); g.restore(); });
      g.restore();
    });
  }
  function dfMic(g) {
    const x = DF.micX, b = DF.micB, top = b - 236;
    blob(g, x, b + 6, 90, 14, '#05030f', 0.55);
    // the tripod base and the pole, chunky chrome in the cast's line
    [[-1, -44], [1, 44]].forEach((s) => cel(g, [[x - 4, b - 28], [x + s[1] - 5 * s[0], b + 2], [x + s[1] + 4 * s[0], b + 3], [x + 4, b - 26]], '#5a5a7a', { line: 2.6, depth: 2, tension: 0 }));
    cel(g, [[x - 3, b - 30], [x - 2, b + 8], [x + 2, b + 8], [x + 3, b - 30]], '#4a4a6a', { line: 2.4, depth: 1.5, tension: 0 });
    cel(g, rrect(x - 7, b - 42, 14, 16, 4), '#3a3a5a', { line: 2.4, depth: 2 });
    cel(g, [[x - 5, b - 30, 1], [x - 4.4, top], [x + 4.4, top], [x + 5, b - 30, 1]], '#b6b8cc', { line: 2.8, depth: 3, shadow: '#7c7e98', hi: '#f0f0fa', tension: 0 });
    cel(g, rrect(x - 8, b - 140, 16, 14, 4), '#3a3a5a', { line: 2.4, depth: 2, hi: '#6a6a8a' });
    // the mic resting in its clip, tipped toward the empty seats: a black handle, a pink band, a round grille
    g.save(); g.translate(x, top); g.rotate(-0.42);
    cel(g, rrect(-9, -8, 18, 16, 5), '#3a3a5a', { line: 2.4, depth: 2 });
    cel(g, [[-7, 4, 1], [7, 4, 1], [10.5, -58], [-10.5, -58]], '#1d1c22', { line: 2.8, depth: 3, shadow: '#0c0b0f', hi: '#615f6d', tension: 0.2 });
    cel(g, rect4(-11.5, -62, 23, 9), HV.pink, { line: 2.4, depth: 2, hi: HV.pinkL, tension: 0 });
    cel(g, tk.ellipsePts(0, -80, 20, 20, 20), '#5a5868', { line: 2.8, depth: 5, shadow: '#34323e', hi: '#a8a6b6',
      decor: (c) => { c.strokeStyle = A('#2a2830', 0.7); c.lineWidth = 1.2; c.beginPath(); for (let k2 = -4; k2 <= 4; k2++) { c.moveTo(-20, -80 + k2 * 4.6); c.lineTo(20, -80 + k2 * 4.6); c.moveTo(k2 * 4.6, -100); c.lineTo(k2 * 4.6, -60); } c.stroke(); } });
    g.restore();
    // a set list left on the floor by the stand
    g.save(); g.translate(x + 92, b - 4); g.scale(1, 0.5); g.rotate(0.3);
    cel(g, rect4(-22, -28, 44, 56), '#efe8f6', { line: 2, depth: 2, tension: 0 });
    g.strokeStyle = A('#8a7ab0', 0.8); g.lineWidth = 2.4; g.lineCap = 'round';
    for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(-14, -18 + k * 9); g.lineTo(6 + (k % 3) * 4, -18 + k * 9); g.stroke(); }
    heart(g, 12, 18, 5, HV.pink, 1.2);
    g.restore();
  }
  // Gloss dust settled on the floor: soft opal blobs, no outline
  function dfSheen(g) {
    const r = R('hv-df-sheen');
    for (let i = 0; i < 16; i++) {
      const x = X0 + r() * XW, y = DF.floor + 30 + r() * 170, rx = 80 + r() * 160, ry = 10 + r() * 18, c = ['#e0ccff', '#ccfff0', '#ffd6ec', '#f4f1fb'][i % 4];
      blob(g, x, y, rx, ry, c, 0.2 + r() * 0.14);
    }
    for (let i = 0; i < 40; i++) star4(g, X0 + r() * XW, DF.floor + 20 + r() * 190, 1.6 + r() * 2.6, A('#ffffff', 0.5 + r() * 0.4), 0);
  }
  // the curtain twitch: every 6 s a panel's hem swings a hair, as if someone backstage brushed it on the way to the next show
  const DF_TWITCH = 6;
  function dfTwitch(T, ph) {
    if (T.mot < 1) return 0;
    const s = (((T.tt + ph) % DF_TWITCH) + DF_TWITCH) % DF_TWITCH;
    return s < 1.2 ? 0.012 * Math.sin(s / 1.2 * TAU * 1.5) * (1 - s / 1.2) : 0;
  }
  SCENES.defeat = { id: 'defeat', combat: false, mood: 'after the show, the curtain twitches', sway: 4, items: [
    lay('back', full(0, 520), 0.04, dfBack),
    anim((ctx, T) => { addMode(ctx, () => { glowE(ctx, 560 - T.par * 0.04, DF.floor - 4, 220, 10, '#ffcf8a', 0.5); }); }),
    lay('curtL', { x: -40, y: 20, w: DF.gap0 + 70, h: 490 }, 0.08, dfCurtainL, { rot: (T) => dfTwitch(T, 0), pivot: [100, 30] }),
    lay('curtR', { x: DF.gap1 - 30, y: 20, w: 1320 - DF.gap1 + 30, h: 490 }, 0.08, dfCurtainR, { rot: (T) => dfTwitch(T, 3), pivot: [1180, 30] }),
    lay('front', full(0), 0, dfFront),
    anim((ctx, T) => {
      // the thin warm line of light under the curtains' hem, breathing
      const p = 0.8 + 0.2 * Math.sin(T.tt * 0.9);
      addMode(ctx, () => {
        glowE(ctx, DF.gap0 / 2, DF.floor + 2, DF.gap0 / 2 + 20, 7, '#ffcf8a', 0.75 * p);
        glowE(ctx, (DF.gap1 + 1280) / 2, DF.floor + 2, (1280 - DF.gap1) / 2 + 20, 7, '#ffcf8a', 0.75 * p);
        glowE(ctx, 640, DF.floor + 4, 640, 26, '#ffcf8a', 0.16 * p);
      });
    }),
    lay('sheen', full(DF.floor, DH - DF.floor), 0.03, dfSheen, { q: 0.6, alpha: (T) => 0.75 + 0.25 * Math.sin(T.tt * 0.35) }),
    lay('mic', { x: DF.micX - 110, y: DF.micB - 360, w: 250, h: 390 }, 0, dfMic),
    anim((ctx, T) => {
      // the single soft spotlight on the mic, with dust turning in it
      const x = DF.micX;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.17 + 0.03 * Math.sin(T.tt * 0.7);
      ctx.fillStyle = tk.lin(ctx, 0, 40, 0, 660, [[0, A('#e6d9ff', 0.9)], [1, A('#fff4d6', 0.3)]]);
      ctx.beginPath(); ctx.moveTo(x - 34, 130); ctx.lineTo(x + 34, 130); ctx.lineTo(x + 170, 664); ctx.lineTo(x - 170, 664); ctx.closePath(); ctx.fill();
      ctx.restore();
      addMode(ctx, () => { glowE(ctx, x, 650, 190, 30, '#fff4d6', 0.45); glowE(ctx, x, 158, 30, 12, '#fff4d6', 0.6); });
      drift(ctx, T, { key: 'hv-df-dust', n: 24, sprs: [moteSpr('#f4f1fb'), moteSpr('#ffe3f1')], area: { x: x - 130, y: 150, w: 260, h: 480 }, vx: 4, vy: 6, sway: 22, size: [4, 9], aspect: 1, alpha: [0.3, 0.8], add: true, wob: 0 });
      drift(ctx, T, { key: 'hv-df-sheen', n: 16, sprs: [moteSpr(GL[1]), moteSpr(GL[2]), moteSpr(GL[3])], area: { x: 0, y: DF.floor + 10, w: DW, h: 200 }, vx: 10, vy: -2, sway: 30, size: [20, 44], aspect: 0.4, alpha: [0.15, 0.4], wob: 0 });
    }),
    vigLayer('hv-df-vig', { color: '#070516', alpha: 0.55, inner: 0.3 }),
  ] };

  // ===============================================================================================================
  // PAPER: a gig-poster texture for panels: cream card stock with a faint two-colour print grain (pink and green specks, slightly off
  // register), soft printed edges, and with `edge` (default true) a strip of tape at two corners. Deterministic per (size, seed), still, cached;
  // `paper` fills any w x h at 1:1 (not scaled from the stage).
  // ===============================================================================================================
  function paperPaint(g, w, h, seed, edge) {
    const r = R('hv-paper', seed), k = Math.sqrt(w * h) / 700;
    fillRectG(g, 0, 0, w, h, [[0, '#fff8ee'], [0.5, '#fff4e6'], [1, '#fbeedc']]);
    g.fillStyle = tk.lin(g, 0, 0, w, h, [[0, A('#ffffff', 0.45)], [0.5, A('#ffffff', 0)], [1, A('#f0d8c0', 0.25)]]); g.fillRect(0, 0, w, h);
    // soft card mottling
    const step = clamp(Math.round(Math.sqrt(w * h) / 14), 22, 48), sf = 0.009 / Math.max(0.6, k);
    for (let y = -step / 2; y < h + step; y += step) for (let x = -step / 2; x < w + step; x += step) {
      const v = nz(x * sf + seed * 3.1, y * sf, 23 + seed, 3) - 0.42;
      if (Math.abs(v) < 0.03) continue;
      blob(g, x + (r() - 0.5) * step * 0.3, y + (r() - 0.5) * step * 0.3, step * 1.8, step * 1.6, v > 0 ? '#ffffff' : '#efd8bf', Math.min(0.12, Math.abs(v) * 0.35));
    }
    // the print grain: a sparse halftone of pink specks and a green one a hair off register, fading in and out in soft round patches
    // (seeded soft spots, so a patch never shows the square cells of a noise grid)
    const d = 9;
    [[HV.pink, 0, 0, 0.3], [HV.green, 2.2, 1.4, 0.24]].forEach((p, pi) => {
      const rp = R('hv-paper-spot', seed, pi), spots = [], ns = Math.max(3, Math.round(3.5 * k * k + 3));
      for (let i = 0; i < ns; i++) spots.push([rp() * w, rp() * h, (40 + rp() * 90) * Math.max(0.5, k), 0.55 + rp() * 0.45]);
      g.fillStyle = A(p[0], p[3]);
      g.beginPath();
      for (let y = d / 2 + p[2]; y < h; y += d) for (let x = d / 2 + p[1] + ((Math.round(y / d) % 2) * d) / 2; x < w; x += d) {
        let v = 0;
        for (let i = 0; i < spots.length; i++) { const s2 = spots[i], dx = (x - s2[0]) / s2[2], dy = (y - s2[1]) / s2[2], q = dx * dx + dy * dy; if (q < 1) v = Math.max(v, s2[3] * (1 - q) * (1 - q)); }
        if (v < 0.18) continue;
        const rr = Math.min(1.8, (v - 0.18) * 3);
        g.moveTo(x + rr, y); g.arc(x, y, rr, 0, TAU);
      }
      g.fill();
    });
    // a few stray ink specks
    for (let i = 0; i < Math.round(30 * k); i++) disc(g, r() * w, r() * h, 0.5 + r() * 0.9, A(r() < 0.5 ? HV.pinkD : HV.greenD, 0.2));
    if (edge !== false) {
      // soft printed edges: a warm band that is uneven, as if the ink ran out toward the trim
      const e = Math.min(w, h) * 0.07;
      fillRectG(g, 0, 0, w, e, [[0, A('#e8c8a8', 0.4)], [1, A('#e8c8a8', 0)]]); fillRectG(g, 0, h - e, w, e, [[0, A('#e8c8a8', 0)], [1, A('#e8c8a8', 0.45)]]);
      g.fillStyle = tk.lin(g, 0, 0, e, 0, [[0, A('#e8c8a8', 0.4)], [1, A('#e8c8a8', 0)]]); g.fillRect(0, 0, e, h);
      g.fillStyle = tk.lin(g, w - e, 0, w, 0, [[0, A('#e8c8a8', 0)], [1, A('#e8c8a8', 0.4)]]); g.fillRect(w - e, 0, e, h);
      // two strips of tape at the top corners
      const tw = clamp(Math.min(w, h) * 0.26, 18, 120), th = tw * 0.3;
      [[0, 0, -0.7, '#ffc2dc'], [w, 0, 0.7, '#c6f5d2']].forEach((c, i) => {
        if (w < 60 || h < 40) return;
        g.save(); g.translate(c[0] + (i ? -tw * 0.3 : tw * 0.3), c[1] + tw * 0.24); g.rotate(c[2]);
        g.fillStyle = A(c[3], 0.78); g.beginPath();
        g.moveTo(-tw / 2, -th / 2);
        for (let k2 = 0; k2 <= 6; k2++) g.lineTo(-tw / 2 + tw * k2 / 6, -th / 2 + (k2 % 2 ? 1.6 : 0));
        for (let k2 = 6; k2 >= 0; k2--) g.lineTo(-tw / 2 + tw * k2 / 6, th / 2 - (k2 % 2 ? 1.6 : 0));
        g.closePath(); g.fill();
        g.fillStyle = A('#ffffff', 0.45); g.fillRect(-tw / 2, -th / 2 + 1.5, tw, th * 0.22);
        g.strokeStyle = A(wsh(c[3], 0.12), 0.5); g.lineWidth = 1; g.stroke();
        g.restore();
      });
    }
  }
  SCENES.paper = { id: 'paper', combat: false, mood: 'gig poster card', custom: true, items: [layer('paper', full(0), 0, () => {})],
    draw(ctx, id, w, h, t, o) {
      const sd = Math.round(num(o.seed, 0)), edge = o.edge !== false;
      const lq = tk.lowQ() ? 0.5 : 1;
      const spr = ART.sprite('sc|hvpaper|' + Math.round(w) + 'x' + Math.round(h) + '|' + sd + '|' + (edge ? 1 : 0) + '|' + lq, w * lq, h * lq, (g, sw, sh) => { g.scale(sw / w, sh / h); paperPaint(g, w, h, sd, edge); });
      ART.blit(ctx, spr, 0, 0, w, h);
    } };

  // ===============================================================================================================
  // public API, declaration and gallery sheets
  // ===============================================================================================================
  const ORDER = ['title', 'ch1', 'ch2', 'ch3', 'boss1', 'boss2', 'boss3', 'camp', 'shop', 'event', 'treasure', 'victory', 'defeat', 'paper'];
  const has = (id) => Object.prototype.hasOwnProperty.call(SCENES, id);
  const scene = ART.scene;

  scene.draw = function draw(ctx, sceneId, w, h, t, opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    w = num(w, DW); h = num(h, DH);
    if (!(w >= 1) || !(h >= 1) || !ctx) return false;
    const id = String(sceneId);
    if (!has(id)) { fallbackScene(ctx, id, w, h); return false; }
    try {
      const def = SCENES[id];
      (def.draw || drawScene)(ctx, id, w, h, t, o);
      return true;
    } catch (e) {
      scene.lastError = id + ': ' + (e && e.message);
      if (!warned[id]) { warned[id] = true; if (typeof console !== 'undefined' && console.error) console.error('ART.scene.draw(' + id + '): ' + (e && e.stack)); }
      try { ctx.restore(); } catch (e2) { /* nothing to restore */ }
      try { fallbackScene(ctx, id, w, h); } catch (e3) { /* the context itself is unusable */ }
      return false;
    }
  };
  scene.logo = function logo(ctx, x, y, w, t, opts) {
    try { logoDraw(ctx, num(x, 0), num(y, 0), Math.max(8, num(w, 400)), num(t, 0), opts && typeof opts === 'object' ? opts : null); return true; } catch (e) {
      scene.lastError = 'logo: ' + (e && e.message);
      if (!warned.logo) { warned.logo = true; if (typeof console !== 'undefined' && console.error) console.error('ART.scene.logo: ' + (e && e.stack)); }
      return false;
    }
  };
  scene.monogram = function monogram(ctx, x, y, r, o) {
    if (!ctx) return false;
    try { monoDraw(ctx, x, y, r, o); return true; } catch (e) {
      scene.lastError = 'monogram: ' + (e && e.message);
      if (!warned.monogram) { warned.monogram = true; if (typeof console !== 'undefined' && console.error) console.error('ART.scene.monogram: ' + (e && e.stack)); }
      return false;
    }
  };
  scene.warm = function warm(id, w, h) {
    id = String(id); w = num(w, DW); h = num(h, DH);
    if (!has(id) || !(w >= 1) || !(h >= 1)) return false;
    const sink = ART.sprite('sc|warm|' + id + '|' + Math.round(w) + 'x' + Math.round(h) + '|' + tk.lowQ(), 4, 4, (g) => { scene.draw(g, id, w, h, 0, { particles: 0 }); });
    return !!sink;
  };
  scene.info = function info(id) {
    id = String(id);
    if (!has(id)) return null;
    const d = SCENES[id];
    const out = { id, combat: !!d.combat, ground: d.combat ? GROUND : null, mood: d.mood || '', layers: d.items ? d.items.filter((i) => i && i.isLayer).length : 0 };
    if (d.focus) out.focus = Object.assign({}, d.focus);                 // title: the centrepiece's box in stage px and its layer parallax factor
    return out;
  };
  scene.ids = ORDER.filter(has);
  scene.lastError = null;
  scene.DESIGN = { w: DW, h: DH, ground: GROUND };
  ART.declare('scene', scene.ids);

  // ---------------------------------------------------------------------------------------------------------------
  // gallery helpers: guides (ground line, HUD zones, lanes) and actors (heroes and enemies on their marks) over a scene
  // ---------------------------------------------------------------------------------------------------------------
  function drawGuides(g, w, h) {
    const s = Math.max(w / DW, h / DH), ox = (w - DW * s) / 2, oy = (h - DH * s) / 2;
    g.save(); g.translate(ox, oy); g.scale(s, s);
    g.lineWidth = 2; g.font = '600 12px ' + tk.font.ui; g.textBaseline = 'top'; g.textAlign = 'left';
    const box = (x, y, bw, bh, col, label) => { g.strokeStyle = col; g.strokeRect(x, y, bw, bh); g.fillStyle = col; g.fillText(label, x + 4, y + 3); };
    box(0, 0, 1280, 56, 'rgba(255,240,120,0.8)', 'top bar');
    box(12, 64, 288, 186, 'rgba(120,255,200,0.8)', 'hero panels');
    box(12, 588, 258, 124, 'rgba(120,200,255,0.8)', 'left dock');
    box(290, 566, 700, 154, 'rgba(255,160,220,0.8)', 'hand');
    box(1000, 588, 268, 124, 'rgba(120,200,255,0.8)', 'right dock');
    g.strokeStyle = 'rgba(255,90,90,0.95)'; g.beginPath(); g.moveTo(0, GROUND); g.lineTo(DW, GROUND); g.stroke();
    g.fillStyle = 'rgba(255,90,90,0.95)'; g.fillText('ground y 520', 1150, GROUND - 16);
    [560, 705, 850, 995, 1120].forEach((x, i) => { g.beginPath(); g.moveTo(x, GROUND - 8); g.lineTo(x, GROUND + 8); g.stroke(); g.fillText('L' + i, x - 6, GROUND + 10); });
    g.restore();
  }
  const ACTORS = { 1: ['kappa', 'karakasa', 'oni_brute'], 2: ['chochin', 'drowned_samurai', 'nure_onna'], 3: ['storm_drone', 'komainu_guardian', 'censor_golem'] };
  const BOSSES = { 1: 'boss_kuzunoha', 2: 'boss_jorogumo', 3: 'boss_editor' };
  function drawActors(g, w, h, id, t) {
    const m = /^(?:ch|boss)([123])$/.exec(id);
    if (!m) return;
    const ch = +m[1], boss = id.indexOf('boss') === 0;
    const s = Math.max(w / DW, h / DH), ox = (w - DW * s) / 2, oy = (h - DH * s) / 2;
    g.save(); g.translate(ox, oy); g.scale(s, s);
    ART.hero.draw(g, 'kuro', { x: 170, y: 508, s: 0.94, pose: 'idle', t });
    ART.hero.draw(g, 'hanae', { x: 330, y: GROUND, s: 1, pose: 'idle', t });
    if (boss) ART.enemy.draw(g, BOSSES[ch], { x: 1120, y: GROUND, s: 1, pose: 'idle', t });
    else ACTORS[ch].forEach((e, i) => ART.enemy.draw(g, e, { x: [850, 995, 1120][i], y: GROUND, s: 1, pose: 'idle', t }));
    g.restore();
  }

  ART.sheet('scenes', (canvas, params) => {
    const t = num(params.t, 0);
    ART.sheetGrid(canvas, params, ORDER.map((id) => ({ label: id, id })), (g, cell, w, h) => {
      scene.draw(g, cell.id, w, h, t, { particles: 1 });
    }, { aspect: 16 / 9, cols: params.cols || 4, pad: 8, gap: 6, labelH: 16, bg: 'night' });
  });
  ORDER.forEach((id) => {
    ART.sheet('scene_' + id, (canvas, params) => {
      const g = canvas.getContext('2d'), t = num(params.t, 0);
      scene.draw(g, id, params.w, params.h, t, { particles: params.particles === undefined ? 1 : params.particles, parallaxX: num(params.px, 0), logo: params.logo === undefined ? id === 'title' : !!params.logo, seed: num(params.seed, 0), rung: params.rung === true || num(params.rung, 0) > 0 });
      if (params.guides) drawGuides(g, params.w, params.h);
      if (params.actors) drawActors(g, params.w, params.h, id, t);
    });
  });
  ART.sheet('logo', (canvas, params) => {
    const g = canvas.getContext('2d'), W = params.w, H = params.h, t = num(params.t, 0);
    // the stacked logo on the title night, the one-line form on a gig poster, small stacked logos over one loop, and the RJ monogram at sizes
    fillRectG(g, 0, 0, W, H * 0.6, [[0, '#070516'], [0.6, '#2b1f6e'], [1, '#59399a']]);
    scene.logo(g, W * 0.42, H * 0.3, W * 0.5, t);
    [[0.82, 0.16, 0.07], [0.82, 0.36, 0.045], [0.93, 0.36, 0.03], [0.93, 0.48, 0.018], [0.82, 0.5, 0.012]].forEach((m) => scene.monogram(g, W * m[0], H * m[1], W * m[2], {}));
    g.save(); g.translate(0, H * 0.6); scene.draw(g, 'paper', W, H * 0.2, 0, { seed: 2 }); g.restore();
    scene.logo(g, W * 0.36, H * 0.7, W * 0.62, t + 1, { line: true });
    scene.monogram(g, W * 0.86, H * 0.7, H * 0.07, {});
    g.fillStyle = '#0d0b1e'; g.fillRect(0, H * 0.8, W, H * 0.2);
    for (let i = 0; i < 6; i++) scene.logo(g, W * (0.09 + i * 0.164), H * 0.9, W * 0.15, t + i * 0.9);
  });
  ART.sheet('title_anim', (canvas, params) => {
    const t = num(params.t, 0);
    ART.sheetGrid(canvas, params, [0, 1, 2, 3, 4, 5].map((i) => ({ label: 't = ' + (t + i * 2.3).toFixed(1) + ' s', i })), (g, cell, w, h) => {
      scene.draw(g, 'title', w, h, t + cell.i * 2.3, { particles: 1, logo: true, rung: params.rung === true || num(params.rung, 0) > 0 });
    }, { aspect: 16 / 9, cols: 3, pad: 8, gap: 6, labelH: 16, bg: 'night' });
  });
})();
