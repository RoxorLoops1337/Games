// Echowake -- ART.scene: the full-screen background paintings and the ECHOWAKE logo. Extends ART (art.js).
//
// PUBLIC API (DESIGN 5.6; these members REPLACE the placeholders of art.js)
//   ART.scene.draw(ctx, sceneId, w, h, t, opts) -> true
//        Paints scene `sceneId` (DATA.LISTS.scenes: title ch1 ch2 ch3 boss1 boss2 boss3 camp shop event treasure victory defeat paper) into the
//        rectangle (0, 0, w, h) of the current transform. t is ABSOLUTE SECONDS and drives every loop (mist, lanterns, fire, petals, lightning).
//        The scenes are composed on the 1280 x 720 stage and scaled to COVER any other size (uniform scale, centred crop), so 16:9 fits exactly.
//        `paper` is the exception: it is a texture that fills any w x h at 1:1.
//        opts (all optional):  particles  number 0..2 (default 1), the multiplier for drifting petals, leaves, sparks, fireflies (0 = none);
//                                          `false` means 0 and `true` means 1. ART.tk.opt.reduceMotion multiplies it by 0.3 on top.
//                              parallaxX   camera offset in STAGE PX (clamped to +-90): positive moves the camera right, so near layers slide left.
//                                          Far layers move about 5% of it, mid layers 30%, foreground 100%, the ground plane never moves.
//                                          reduceMotion forces parallax 0. A slow automatic sway (a few px) runs when reduceMotion is off.
//                              logo        title only: also paint ART.scene.logo(ctx, 640, 172, 740, t) (default false: the screen composes it)
//                              rung        title only: true once the player has won. The temple bell hangs free of its grey Hush threads, the striker is pulled
//                                          back and the ring stays whole and clear (default false: bound and muffled). Part of the title layer cache key.
//                              seed        paper only: which stain layout (default 0), so two panels never look identical
//                              edge        paper only: false skips the aged darkened edge (default true)
//        Never throws: an unknown id paints a night sky with a small "scene ?" label and returns false; a drawing error is caught once per scene
//        (ART.scene.lastError holds its message) and the draw returns false.
//        COMBAT scenes (ch1 ch2 ch3 boss1 boss2 boss3) keep the contract of DESIGN 5.9: ground plane (feet) at y = 520 of 720, heroes on the left
//        third, enemies across the right two thirds, the band below y 520 darkened for the HUD and the hand, mid-tone hazy backdrops behind the
//        enemy lanes so the fight never competes with the painting.
//   ART.scene.logo(ctx, x, y, w, t)
//        The brush-lettered ECHOWAKE logo, CENTRED on (x, y), w px wide (about 0.15 * w tall). Every letter is a set of calligraphic brush
//        strokes (ART.tk.inkPath), gold leaf over ink, with a gold echo ping inside the O, a soft glow, twinkling sparkles and three sound-ring
//        pulses (5.2, 7.3 and 6.1 s loops: a ring grows and fades, a note rises). t in seconds. The static part is cached per width.
//   Extras beyond DESIGN:
//   ART.scene.warm(id, w, h) -> bool      bakes every static layer of a scene at that size now (call while a screen loads to avoid a first-frame hitch)
//   ART.scene.info(id) -> {id, combat, ground, mood, layers, focus?} | null     combat: bool, ground: 520 for combat scenes, mood: a short colour-script word;
//        focus (title only): {x0, x1, y0, y1, k}, the bell and belfry's bounding box in stage px and its layer parallax factor (the menu column clears it)
//   ART.scene.ids -> [ids]                the scene ids that have real art (all of DATA.LISTS.scenes)
//   ART.scene.lastError -> string | null  the message of the last caught drawing error (tests assert it stays null)
//   ART.scene.DESIGN = {w: 1280, h: 720, ground: 520}
//   Gallery sheets: `scenes` (all of them small, in a grid), `scene_<id>` for every id (large; params guides=1 draws the ground line and HUD
//   zones, actors=1 stands the heroes and a chapter's enemies on their marks, px=N sets parallaxX, particles=N), `logo` (big, small, on paper, and the
//   pulses over one loop), `title_anim` (a film strip of the title over t).
//
// HOW IT IS BUILT
//   A scene is an ordered list of items. A LAYER is painted ONCE into a cached ART.sprite (only as large as it needs to be: an edge cluster of
//   bamboo is a 300 px sprite, not a full screen) at the backing scale of the draw size, then composited every frame with a parallax offset that is
//   snapped to whole device pixels (an aligned blit is a plain copy, a fractional one is resampled, which is slow on a CPU canvas). Layers may also
//   scroll (seamless mist, clouds), be drawn additively (god rays) or with multiply (the boss colour grade), breathe in alpha, or be baked at a lower
//   resolution when they are soft anyway. The washi grain is baked into the big painted layers (source-atop), so no full-screen grain pass runs per
//   frame. An ANIM item draws the cheap moving things live: particles (one setTransform + drawImage each), flames, lanterns, reflections cut into
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
  const dark = (a, k) => U.color.darken(a, k);
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
  // seamless soft mist bands for a strip of width w: blobs are drawn three times so the strip tiles horizontally
  function mistPaint(g, w, h, color, seed, n) {
    const r = R('mist', seed);
    for (let i = 0; i < n; i++) {
      const cx = r() * w, cy = h * (0.3 + 0.45 * r()), rx = w * (0.09 + 0.16 * r()), ry = h * (0.2 + 0.3 * r()), a = 0.45 + 0.55 * r();
      for (let k = -1; k <= 1; k++) blob(g, cx + k * w, cy, rx, ry, color, a);
    }
  }
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
    const rot = L.rot ? L.rot(T) : 0;                              // a layer may swing about a pivot (the title bell)
    if (rot) { const px = L.pivot[0] - T.par * f, py = L.pivot[1]; ctx.save(); ctx.translate(px, py); ctx.rotate(rot); ctx.translate(-px, -py); }
    let y = rr.y + (L.bob ? Math.sin(T.tt * L.bob[1] + (L.bob[2] || 0)) * L.bob[0] : 0);
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
  // scenery painters: bamboo, leaves, clouds, torii, grass. Design space, cel-shaded with the house ink line where they are near.
  // ---------------------------------------------------------------------------------------------------------------
  // y of a polyline ridge at x (linear interpolation)
  function ridgeY(pts, x) {
    for (let i = 1; i < pts.length; i++) if (pts[i][0] >= x) { const a = pts[i - 1], b = pts[i], k = (x - a[0]) / (b[0] - a[0] || 1); return lerp(a[1], b[1], k); }
    return pts[pts.length - 1][1];
  }
  // A bamboo stalk from y0 (top) to y1 (bottom) centred on x, width w. o: base shade hi rim node line lean seed gap alpha
  function stalk(g, x, y0, y1, w, o) {
    o = o || {};
    const sd = o.seed === undefined ? Math.round(x * 7 + y0) : o.seed;
    const r = R('stalk', sd);
    const n = Math.max(3, Math.ceil((y1 - y0) / 24)), lean = o.lean || 0;
    const Lp = [], Rp = [], Cp = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, y = lerp(y0, y1, u);
      const cx = x + lean * (u - 0.5) + (nz(y * 0.011, x * 0.05, 5) - 0.4) * w * 0.4;
      const ww = w * (0.82 + 0.18 * u);
      Cp.push(cx); Lp.push([cx - ww / 2, y]); Rp.push([cx + ww / 2, y]);
    }
    const at = (y) => { const u = clamp((y - y0) / (y1 - y0 || 1), 0, 1) * n, i = Math.min(n - 1, Math.floor(u)), k = u - i; return { cx: lerp(Cp[i], Cp[i + 1], k), w: lerp(Rp[i][0] - Lp[i][0], Rp[i + 1][0] - Lp[i + 1][0], k) }; };
    const ga = g.globalAlpha;
    if (o.alpha !== undefined) g.globalAlpha = ga * cA(o.alpha);
    const rp = Rp.slice().reverse();
    fillPoly(g, Lp.concat(rp), o.base || '#6f9a5a');
    const mixP = (k) => Lp.map((p, i) => [lerp(p[0], Rp[i][0], k), p[1]]);
    if (o.shade) {
      const sh = Lp.concat(mixP(0.46).reverse());
      fillPoly(g, sh, o.shade);
      if (o.halftone && !tk.lowQ()) { g.save(); poly(g, sh); g.clip(); tk.halftone(g, x - w, y0, w * 2, y1 - y0, { d: 5, r: 1.3, color: o.halftone, alpha: 0.5, force: true }); g.restore(); }
    }
    if (o.hi) { const a = mixP(0.72), b = mixP(0.88); fillPoly(g, a.concat(b.reverse()), o.hi); }
    if (o.rim) { const a = mixP(0.93); fillPoly(g, a.concat(rp.slice()), o.rim); }
    // nodes: a dark band, a light lip under it, and a little stub on alternating sides
    const gap = o.gap || 84;
    let ny = y0 + r() * gap;
    let side = r() < 0.5 ? -1 : 1;
    while (ny < y1 - 4) {
      const p = at(ny), hw = p.w / 2 + 1.6;
      const skew = (r() - 0.5) * 2.2;
      fillPoly(g, [[p.cx - hw, ny - 2.6 + skew], [p.cx + hw, ny - 2.6 - skew], [p.cx + hw, ny + 2.2 - skew], [p.cx - hw, ny + 2.2 + skew]], o.node || (o.shade ? mixc(o.shade, '#140f2e', 0.35) : '#2a3f2a'));
      if (o.hi) fillPoly(g, [[p.cx - hw * 0.3, ny + 2.4], [p.cx + hw, ny + 2.2 - skew], [p.cx + hw, ny + 4 - skew], [p.cx - hw * 0.3, ny + 4.2]], A(o.hi, 0.7));
      if (w > 14) { ellip(g, p.cx + side * hw * 0.9, ny - 1, w * 0.13, w * 0.07, o.node || '#2a3f2a', side * 0.5); side = -side; }
      ny += gap * (0.75 + 0.5 * r());
    }
    if (o.line) {
      tk.inkPath(g, Lp, { w: o.line, color: o.lineColor || pal.ink, taper: 0.02, seed: sd, wobble: 0.1 });
      tk.inkPath(g, Rp, { w: o.line * 0.8, color: o.lineColor || pal.ink, taper: 0.02, seed: sd + 3, wobble: 0.1 });
    }
    g.globalAlpha = ga;
  }
  // a clump of stalks leaning slightly apart. o as stalk plus n, spread
  function clump(g, x, y0, y1, w, o) {
    const r = R('clump', o.seed === undefined ? Math.round(x) : o.seed), n = o.n || 3, sp = o.spread || w * 1.5;
    const list = [];
    for (let i = 0; i < n; i++) list.push({ dx: (i - (n - 1) / 2) * sp * (0.7 + 0.6 * r()) + (r() - 0.5) * w, w: w * (0.65 + 0.5 * r()), top: y0 - r() * 30, lean: (r() - 0.5) * w * 1.6 });
    list.sort((a, b) => a.w - b.w);
    list.forEach((s, i) => stalk(g, x + s.dx, s.top, y1, s.w, Object.assign({}, o, { seed: (o.seed || 0) * 17 + i + Math.round(x), lean: s.lean })));
  }

  // a bamboo leaf blade, root at (x, y), angle in radians (0 = pointing right), length len, half width wid
  function blade(g, x, y, ang, len, wid, base, o) {
    o = o || {};
    g.save(); g.translate(x, y); g.rotate(ang);
    const shape = [[0, 0, 1], [len * 0.3, -wid * 0.92], [len * 0.72, -wid * 0.55], [len, 0, 1], [len * 0.64, wid * 0.7], [len * 0.28, wid * 0.78]];
    tk.celFill(g, shape, base, { line: o.line === undefined ? 1.7 : o.line, lineColor: o.lineColor, depth: wid * 0.7, rim: o.rim, rimW: o.rimW || 1.4, rimAlpha: 1, hi: false, tension: 0.7, light: (o.light === undefined ? tk.light : o.light) - ang, shadow: o.shadow, align: 0.4 });
    if (len > 26 && o.vein !== false) { g.globalAlpha = 0.55; tk.inkStroke(g, len * 0.08, 0, len * 0.9, 0, { w: 0.9, color: o.veinColor || pal.ink, taper: 0.3, wobble: 0 }); g.globalAlpha = 1; }
    g.restore();
  }
  // a fan of leaf blades from a point: o.dir (mean angle), o.spread, o.n, o.len, o.wid, base/shadow/rim/line colours
  function leafFan(g, x, y, o) {
    const r = R('fan', o.seed === undefined ? Math.round(x * 3 + y) : o.seed), n = o.n || 9;
    const list = [];
    for (let i = 0; i < n; i++) {
      const u = n > 1 ? i / (n - 1) : 0.5;
      list.push({ a: (o.dir || 0) + (u - 0.5) * (o.spread || 2) + (r() - 0.5) * 0.28, l: (o.len || 80) * (0.62 + 0.55 * r()), w: (o.wid || 9) * (0.75 + 0.5 * r()), d: r() });
    }
    list.sort((p, q) => p.d - q.d);
    list.forEach((b, i) => blade(g, x, y, b.a, b.l, b.w, i % 3 === 0 && o.base2 ? o.base2 : o.base, { line: o.line, lineColor: o.lineColor, rim: o.rim, shadow: o.shadow, vein: o.vein }));
  }
  // a stem (ribbon-like tapering stroke) drawn as ink: pts [[x,y]...]
  function branch(g, pts, w, col, o) {
    o = o || {};
    tk.inkPath(g, pts, { w: w + (o.outline === undefined ? 4 : o.outline), color: pal.ink, taper: 0.05, taperStart: 0, wobble: 0.08, pressure: 'head', seed: o.seed || 1 });
    tk.inkPath(g, pts, { w, color: col, taper: 0.05, taperStart: 0, wobble: 0.08, pressure: 'head', seed: o.seed || 1 });
    if (o.hi) tk.inkPath(g, pts.map((p) => [p[0] + w * 0.18, p[1] - w * 0.1]), { w: w * 0.28, color: o.hi, taper: 0.3, taperStart: 0.05, wobble: 0.05, pressure: 'head', seed: (o.seed || 1) + 2, alpha: 0.9 });
  }

  // a cel-shaded cumulus mound: three rows of puffs (big at the base, small on top), each puff cel-shaded with its own lit rim.
  // cx, cy centre of the base; w, h size; o: base shade lit line seed flatY light
  function cloud(g, cx, cy, w, h, o) {
    o = o || {};
    const r = R('cloud', o.seed || 0), puffs = [], rows = 3;
    for (let row = 0; row < rows; row++) {
      const k = row / (rows - 1), rw = w * (1 - 0.46 * k), n = Math.max(2, Math.round(rw / (52 - 12 * k))), ry = cy - k * h * 0.46;
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5 + (r() - 0.5) * 0.6) / n, hump = Math.pow(Math.sin(PI * clamp(u, 0.02, 0.98)), 0.6);
        puffs.push({ x: cx - rw / 2 + u * rw, y: ry - hump * h * 0.12 * r() + (r() - 0.5) * h * 0.06, r: h * (0.2 + 0.24 * hump * (0.55 + 0.45 * r())) * (1 - 0.22 * k), row });
      }
    }
    g.save();
    if (o.flat !== false) { g.beginPath(); g.rect(cx - w, cy - h * 3, w * 2, h * 3 + h * (o.flatY === undefined ? 0.28 : o.flatY)); g.clip(); }
    puffs.forEach((p) => tk.celCircle(g, p.x, p.y, p.r, o.base || '#ffe9c8', { line: o.line || false, lineColor: o.lineColor, depth: p.r * 0.4, shadow: o.shade, rim: o.lit, rimSide: 'light', rimW: Math.max(1.4, p.r * 0.08), rimAlpha: 0.9, hi: false, light: o.light === undefined ? tk.light : o.light }));
    g.restore();
  }

  // a wispy horizontal cloud streak (tapered ink-wash ribbon, soft edges): cx, cy, w, h
  function streak(g, cx, cy, w, h, col, a, seed) {
    const r = R('streak', seed || 0);
    for (let i = 0; i < 5; i++) {
      const k = i / 4, ww = w * (1 - 0.2 * k + 0.1 * r()), yy = cy + (k - 0.5) * h * 0.9 + (r() - 0.5) * 4;
      g.save(); g.translate(cx + (r() - 0.5) * w * 0.1, yy); g.scale(1, (h * 0.22) / (ww * 0.5));
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, ww * 0.5);
      gr.addColorStop(0, A(col, a * (0.5 + 0.5 * r()))); gr.addColorStop(0.7, A(col, a * 0.35)); gr.addColorStop(1, A(col, 0));
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, ww * 0.5, 0, TAU); g.fill(); g.restore();
    }
  }

  // a torii gate: x centre, y ground, s width. Vermilion pillars, black kasagi. o.col base colour, o.alpha, o.line
  function torii(g, x, y, s, o) {
    o = o || {};
    const col = o.col || '#e8383d', sh = o.shade || shd(col), w = s, h = s * 0.86, pw = s * 0.075, ga = g.globalAlpha;
    if (o.alpha !== undefined) g.globalAlpha = ga * cA(o.alpha);
    const px = [x - w * 0.34, x + w * 0.34];
    px.forEach((cx) => {
      fillPoly(g, [[cx - pw * 0.55, y], [cx - pw * 0.5, y - h * 0.94], [cx + pw * 0.5, y - h * 0.94], [cx + pw * 0.55, y]], col);
      fillPoly(g, [[cx - pw * 0.55, y], [cx - pw * 0.5, y - h * 0.94], [cx - pw * 0.05, y - h * 0.94], [cx - pw * 0.02, y]], sh);
      fillPoly(g, [[cx - pw * 0.9, y - h * 0.02], [cx + pw * 0.9, y - h * 0.02], [cx + pw * 0.8, y + h * 0.03], [cx - pw * 0.8, y + h * 0.03]], '#241a3a');
    });
    // nuki (tie beam), shimaki and the curved black kasagi
    fillPoly(g, [[x - w * 0.46, y - h * 0.7], [x + w * 0.46, y - h * 0.7], [x + w * 0.46, y - h * 0.63], [x - w * 0.46, y - h * 0.63]], col);
    fillPoly(g, [[x - w * 0.46, y - h * 0.66], [x + w * 0.46, y - h * 0.66], [x + w * 0.46, y - h * 0.63], [x - w * 0.46, y - h * 0.63]], sh);
    fillPoly(g, [[x - w * 0.5, y - h * 0.9], [x + w * 0.5, y - h * 0.9], [x + w * 0.5, y - h * 0.83], [x - w * 0.5, y - h * 0.83]], '#241a3a');
    g.beginPath();
    g.moveTo(x - w * 0.66, y - h * 1.03);
    g.quadraticCurveTo(x - w * 0.34, y - h * 0.94, x, y - h * 0.955);
    g.quadraticCurveTo(x + w * 0.34, y - h * 0.94, x + w * 0.66, y - h * 1.03);
    g.lineTo(x + w * 0.6, y - h * 0.9);
    g.quadraticCurveTo(x + w * 0.34, y - h * 0.86, x, y - h * 0.87);
    g.quadraticCurveTo(x - w * 0.34, y - h * 0.86, x - w * 0.6, y - h * 0.9);
    g.closePath(); g.fillStyle = '#1b1230'; g.fill();
    if (o.line) { const lw = o.line; tk.inkPath(g, [[x - w * 0.66, y - h * 1.03], [x, y - h * 0.955], [x + w * 0.66, y - h * 1.03]], { w: lw, color: '#0d0b1e', taper: 0.1, wobble: 0.05 }); }
    g.globalAlpha = ga;
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
  // a small tumbling leaf lying on the ground (flat ellipse-ish blade)
  function litter(g, x, y, s, ang, base, line) {
    g.save(); g.translate(x, y); g.rotate(ang);
    tk.celFill(g, [[-s, 0, 1], [-s * 0.3, -s * 0.24], [s * 0.4, -s * 0.2], [s, 0, 1], [s * 0.3, s * 0.22], [-s * 0.4, s * 0.2]], base, { line: line === undefined ? 1.2 : line, depth: s * 0.22, hi: false, tension: 0.6, light: tk.light - ang });
    g.restore();
  }
  // soft cast shadows and light pools helpers
  function lightPool(g, x, y, rx, ry, col, a) { blob(g, x, y, rx, ry, col, a); }

  // An elongated anime stratus band: a cel-shaded lens with puffs along its top, a lit upper-right edge and a hard shadow underneath.
  // cx, cy centre; w, h size; o: base shade lit seed n (lenses) lean
  function cloudBand(g, cx, cy, w, h, o) {
    o = o || {};
    const r = R('band', o.seed || 0), n = o.n || 3;
    for (let i = 0; i < n; i++) {
      const k = i / Math.max(1, n - 1), ww = w * (1 - 0.3 * k + 0.12 * (r() - 0.5)), hh = h * (0.5 + 0.5 * (1 - k)), x = cx + (r() - 0.5) * w * 0.16 + (o.lean || 0) * k, y = cy + (k - 0.35) * h * 0.85;
      tk.celFill(g, [[x - ww / 2, y, 1], [x - ww * 0.32, y - hh * 0.4], [x + ww * 0.24, y - hh * 0.36], [x + ww / 2, y, 1], [x + ww * 0.3, y + hh * 0.24], [x - ww * 0.28, y + hh * 0.26]], o.base || '#ffcfae', { line: false, depth: hh * 0.3, shadow: o.shade, hi: false, tension: 0.85, light: -0.55 });
      const pn = o.puffs === false ? 0 : 2 + Math.floor(ww / 90);
      for (let j = 0; j < pn; j++) {
        const u = (j + 0.5 + (r() - 0.5) * 0.5) / pn, px = x - ww * 0.36 + u * ww * 0.72, pr = hh * (0.32 + 0.3 * r()) * Math.sin(PI * (0.15 + 0.7 * u));
        tk.celCircle(g, px, y - hh * 0.3 - pr * 0.25, pr, o.base || '#ffcfae', { line: false, depth: pr * 0.4, shadow: o.shade, rim: o.lit, rimSide: 'light', rimW: Math.max(1.4, pr * 0.1), rimAlpha: 0.95, hi: false, light: -0.55 });
      }
    }
  }


  // ---------------------------------------------------------------------------------------------------------------
  // props shared by several scenes: sakura flowers, pagodas, stone lanterns, paper lanterns
  // ---------------------------------------------------------------------------------------------------------------
  // a five-petal sakura blossom: r = flower radius, base petal colour, mid centre colour
  function flower(g, x, y, r, rot, base, o) {
    o = o || {};
    g.save(); g.translate(x, y); g.rotate(rot);
    const ink = A(o.line || '#8a2456', 0.75);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU;
      g.save(); g.rotate(a); g.translate(0, -r * 0.5);
      g.beginPath(); g.ellipse(0, 0, r * 0.46, r * 0.58, 0, 0, TAU);
      g.fillStyle = base; g.fill();
      g.beginPath(); g.ellipse(r * 0.12, r * 0.12, r * 0.4, r * 0.5, 0, 0, TAU);          // hard cel shadow crescent toward the centre
      g.save(); g.clip(); g.beginPath(); g.rect(-r, -r, r * 2, r * 2); g.ellipse(-r * 0.1, -r * 0.14, r * 0.46, r * 0.58, 0, 0, TAU); g.fillStyle = o.shade || shd(base, 0.12); g.fill('evenodd'); g.restore();
      g.lineWidth = Math.max(0.7, r * 0.09); g.strokeStyle = ink; g.beginPath(); g.ellipse(0, 0, r * 0.46, r * 0.58, 0, 0, TAU); g.stroke();
      g.restore();
    }
    disc(g, 0, 0, r * 0.2, o.mid || '#ff5a9a');
    g.strokeStyle = A('#ffe9a8', 0.9); g.lineWidth = Math.max(0.6, r * 0.06);
    g.beginPath(); for (let k = 0; k < 5; k++) { const a = k * 1.26 + 0.3; g.moveTo(0, 0); g.lineTo(Math.cos(a) * r * 0.36, Math.sin(a) * r * 0.36); } g.stroke();
    g.restore();
  }
  // a cluster of blossoms and buds around a point (deterministic by seed)
  function blossomCluster(g, x, y, spread, n, seed, o) {
    o = o || {};
    const r = R('blossom', seed), cols = o.cols || ['#ffc6de', '#ffb0d0', '#ffd8e8', '#ff9fc4'];
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * spread, sz = (o.size || 9) * (0.7 + 0.6 * r());
      flower(g, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, sz, r() * TAU, cols[Math.floor(r() * cols.length)], o);
    }
  }

  // a five-tier pagoda silhouette: x centre, y ground, s total height; col body colour; lit window colour (or null)
  function pagoda(g, x, y, s, col, lit) {
    const tiers = 5, th = s / (tiers + 0.9);
    for (let i = 0; i < tiers; i++) {
      const w = s * (0.3 - i * 0.04), yb = y - i * th;
      fillPoly(g, [[x - w * 0.6, yb], [x + w * 0.6, yb], [x + w * 0.6, yb - th * 0.7], [x - w * 0.6, yb - th * 0.7]], col);
      if (lit) { g.fillStyle = lit; g.fillRect(x - w * 0.16, yb - th * 0.52, w * 0.32, th * 0.3); }
      fillPoly(g, [[x - w * 1.28, yb - th * 0.78], [x - w * 0.78, yb - th * 0.6], [x - w * 0.32, yb - th * 0.7 - th * 0.34], [x + w * 0.32, yb - th * 0.7 - th * 0.34], [x + w * 0.78, yb - th * 0.6], [x + w * 1.28, yb - th * 0.78], [x + w * 0.62, yb - th * 0.5], [x - w * 0.62, yb - th * 0.5]], col);
    }
    const top = y - tiers * th - th * 0.3;
    g.strokeStyle = col; g.lineWidth = Math.max(1.2, s * 0.012); g.beginPath(); g.moveTo(x, top); g.lineTo(x, top - s * 0.18); g.stroke();
    for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(x, top - s * (0.03 + k * 0.03), s * (0.03 - k * 0.005), s * 0.008, 0, 0, TAU); g.stroke(); }
  }

  // a stone garden lantern (toro): x centre, y ground, s height. glow(ctx) can be drawn live over its firebox: the firebox centre is returned.
  function toro(g, x, y, s, o) {
    o = o || {};
    const stone = o.stone || '#6c6a8a', sh = o.shade || shd(stone, 0.3), rim = o.rim || '#c8c4ff', w = s * 0.5;
    const cel = (pts, base) => tk.celFill(g, pts, base, { line: Math.max(1.4, s * 0.03), lineColor: o.lineColor || '#140f2e', depth: s * 0.05, shadow: sh, rim, rimSide: 'light', rimW: Math.max(1, s * 0.02), rimAlpha: 0.7, hi: false, tension: 0.15, align: 0.4 });
    cel([[x - w * 0.5, y], [x + w * 0.5, y], [x + w * 0.42, y - s * 0.09], [x - w * 0.42, y - s * 0.09]], stone);                 // base slab
    cel([[x - w * 0.16, y - s * 0.09], [x + w * 0.16, y - s * 0.09], [x + w * 0.13, y - s * 0.4], [x - w * 0.13, y - s * 0.4]], stone);  // pillar
    cel([[x - w * 0.5, y - s * 0.4], [x + w * 0.5, y - s * 0.4], [x + w * 0.42, y - s * 0.47], [x - w * 0.42, y - s * 0.47]], stone);   // saucer
    const fy = y - s * 0.47;
    cel([[x - w * 0.32, fy], [x + w * 0.32, fy], [x + w * 0.32, fy - s * 0.24], [x - w * 0.32, fy - s * 0.24]], mixc(stone, '#241a3a', 0.25));   // firebox
    g.fillStyle = o.fire || '#ffb84a'; g.fillRect(x - w * 0.17, fy - s * 0.2, w * 0.34, s * 0.16);
    g.strokeStyle = A('#140f2e', 0.8); g.lineWidth = Math.max(1, s * 0.018); g.beginPath(); g.moveTo(x, fy - s * 0.2); g.lineTo(x, fy - s * 0.04); g.stroke();
    cel([[x - w * 0.64, fy - s * 0.24], [x + w * 0.64, fy - s * 0.24], [x + w * 0.2, fy - s * 0.4], [x - w * 0.2, fy - s * 0.4]], stone);    // roof
    cel([[x - w * 0.1, fy - s * 0.4], [x + w * 0.1, fy - s * 0.4], [x + w * 0.07, fy - s * 0.5], [x - w * 0.07, fy - s * 0.5]], stone);    // finial
    return { x, y: fy - s * 0.12, r: s * 0.3 };
  }

  // a hanging paper lantern (chochin): x, y = the top of the lantern, r = radius, col base colour. Static art; the glow is live.
  function chochin(g, x, y, r, col, o) {
    o = o || {};
    const h = r * 1.5, dk = shd(col, 0.3);
    tk.inkStroke(g, x, y - r * 0.9, x, y, { w: Math.max(1.2, r * 0.1), color: pal.ink, taper: 0.05, wobble: 0 });
    tk.celFill(g, tk.ellipsePts(x, y + h / 2, r, h / 2, 16), col, { line: Math.max(1.6, r * 0.13), depth: r * 0.42, shadow: dk, rim: o.rim || lite(col, 0.55), rimSide: 'light', rimW: Math.max(1.2, r * 0.11), rimAlpha: 0.85, hi: false, decor: (gg) => {
      gg.strokeStyle = A(mixc(col, '#140f2e', 0.55), 0.75); gg.lineWidth = Math.max(0.9, r * 0.06);
      for (let i = 1; i < 6; i++) { const yy = y + h * i / 6, k = Math.sin(PI * i / 6); gg.beginPath(); gg.ellipse(x, yy, r * k, r * 0.18, 0, 0, PI); gg.stroke(); }
      if (o.mark) { gg.fillStyle = A(o.mark, 0.85); gg.beginPath(); gg.ellipse(x, y + h / 2, r * 0.3, r * 0.42, 0, 0, TAU); gg.fill(); }
    } });
    fillPoly(g, [[x - r * 0.42, y - r * 0.05], [x + r * 0.42, y - r * 0.05], [x + r * 0.34, y + r * 0.16], [x - r * 0.34, y + r * 0.16]], '#241a3a');
    fillPoly(g, [[x - r * 0.34, y + h - r * 0.14], [x + r * 0.34, y + h - r * 0.14], [x + r * 0.42, y + h + r * 0.06], [x - r * 0.42, y + h + r * 0.06]], '#241a3a');
    tk.inkStroke(g, x, y + h + r * 0.06, x, y + h + r * 0.06 + r * 0.7, { w: Math.max(1, r * 0.08), color: '#e8383d', taper: 0.3, wobble: 0.1 });
    return { x, y: y + h / 2, r };
  }


  // ---------------------------------------------------------------------------------------------------------------
  // shared scene pieces: haze bands, the soft vignette + HUD shade layer, paper grain, swaying sprites
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

  // A sprite that hangs from a pivot and sways. spriteFn() -> canvas of logical size w x h; (x, y) top-left in design space, (px, py) the pivot inside
  // the sprite, amp radians, freq Hz, f parallax factor.
  function swayer(f, spriteFn, x, y, w, h, px, py, amp, freq, ph) {
    return anim((ctx, T) => {
      ctx.save();
      ctx.translate(x + px - T.par * f, y + py);
      ctx.rotate(Math.sin(T.tt * freq * TAU + ph) * amp * (T.mot < 1 ? 0.4 : 1));
      ART.blit(ctx, spriteFn(), -px, -py, w, h);
      ctx.restore();
    });
  }
  // a scrolling seamless mist strip layer. y, h in design px; color hex; a base alpha; speed px/s; f parallax; seed
  function mistLayer(name, y, h, color, a, speed, f, seed, o) {
    o = o || {};
    return layer(name, { x: 0, y, w: DW, h }, f, (g) => { mistPaint(g, DW, h, color, seed, o.n || 12); }, { scroll: speed, alpha: o.breathe ? (T) => a * (1 + o.breathe * Math.sin(T.tt * 0.3 + seed)) : a, bob: o.bob, q: 0.5, fx: true });
  }
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

  // Lens-flare bokeh: soft translucent discs with a slightly brighter rim, additive. pts [[x, y, r], ...]
  function bokehLayer(name, pts, color, a, o) {
    o = o || {};
    return layer(name, full(0), 0, (g) => {
      pts.forEach((p, i) => {
        disc(g, p[0], p[1], p[2], A(color, 0.55 * (0.6 + 0.4 * ((i * 5) % 3) / 2)));
        g.beginPath(); g.arc(p[0], p[1], p[2], 0, TAU); g.lineWidth = Math.max(1.2, p[2] * 0.06); g.strokeStyle = A(lite(color, 0.5), 0.8); g.stroke();
      });
    }, { q: 0.5, add: true, fx: true, alpha: (T) => a * (1 + 0.25 * Math.sin(T.tt * 0.6 + (o.phase || 0))) });
  }

  // A hard ink frame: dry-brush strokes along the four edges, ink splashes in the corners and a soft radial vignette. For the boss scenes.
  function inkFrame(name, o) {
    o = o || {};
    return layer(name, full(0), 0, (g) => {
      const col = o.color || '#0a0410', th = o.th || 40, a = o.alpha === undefined ? 0.92 : o.alpha;
      const edges = [[[-30, th * 0.1], [DW * 0.3, th * 0.3], [DW * 0.7, th * 0.05], [DW + 30, th * 0.2]], [[-30, DH - th * 0.1], [DW * 0.4, DH - th * 0.25], [DW * 0.75, DH - th * 0.05], [DW + 30, DH - th * 0.2]],
        [[th * 0.1, -30], [th * 0.3, DH * 0.4], [th * 0.05, DH * 0.75], [th * 0.2, DH + 30]], [[DW - th * 0.1, -30], [DW - th * 0.25, DH * 0.35], [DW - th * 0.05, DH * 0.7], [DW - th * 0.2, DH + 30]]];
      edges.forEach((e, i) => tk.inkPath(g, e, { w: th * 2, color: A(col, a), taper: 0, pressure: 'flat', wobble: 0.5, freq: 0.03, seed: (o.seed || 1) * 7 + i, step: 6 }));
      const r = R('inkframe', o.seed || 1);
      [[0, 0], [DW, 0], [0, DH], [DW, DH]].forEach((c, i) => tk.inkBlot(g, c[0], c[1], 90 + r() * 40, { seed: (o.seed || 1) + i, color: col, drips: i < 2 ? 4 : 0, jag: 0.35 }));
      g.save(); g.translate(DW / 2, DH / 2); g.scale(1, 0.74);
      const gr = g.createRadialGradient(0, 0, DW * 0.3, 0, 0, DW * 0.7);
      gr.addColorStop(0, A(col, 0)); gr.addColorStop(1, A(col, o.soft === undefined ? 0.6 : o.soft));
      g.fillStyle = gr; g.fillRect(-DW, -DH, DW * 2, DH * 2);
      g.restore();
    }, { q: 0.55 });
  }
  // colour grade for a boss scene: a multiply layer (dark, tinted), radial speed lines behind the boss lane, rising embers, and the ink frame
  function bossOverlay(sk, o) {
    const cx = o.cx || 1100, cy = o.cy || 330;
    return [
      layer(sk + 'grade', full(0), 0, (g) => {
        fillRectG(g, 0, 0, DW, DH, [[0, o.top || '#5a3a70'], [0.55, o.mid || '#9a7a94'], [0.8, '#ffffff'], [1, '#ffffff']]);
      }, { q: 0.3, op: 'multiply', alpha: o.grade === undefined ? 0.85 : o.grade }),
      layer(sk + 'speed', full(0), 0, (g) => { tk.speedLines(g, cx, cy, { n: 70, seed: o.seed || 3, r0: 150, r1: 1000, color: o.line || '#ffb070', alpha: 0.5, w: 7 }); },
        { q: 0.5, add: true, alpha: (T) => (o.speed === undefined ? 0.16 : o.speed) * (0.7 + 0.3 * Math.sin(T.tt * 1.3)) }),
      anim((ctx, T) => {
        drift(ctx, T, { key: sk + 'embers', n: o.embers || 34, sprs: [emberSpr(o.ember || '#ff8a3a'), emberSpr(o.ember2 || '#ffb060')], area: { x: 0, y: 60, w: DW, h: 640 }, vx: 10, vy: -34, sway: 26, size: [7, 16], aspect: 1, alpha: [0.5, 1], add: true, wob: 0 });
      }),
    ];
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
  // particles: drifting sprites (petals, leaves, charms, ash), fireflies, sparks. Parameters come from cached per-index sets.
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
  function charmSpr(variant) {                                             // a paper ofuda talisman: cream strip, vermilion seal marks
    return mkSpr('charm|' + variant, 28, 44, (g) => {
      g.translate(14, 22);
      tk.celFill(g, [[-9, -18, 1], [9, -18, 1], [9, 18, 1], [-9, 18, 1]], '#f3e6c8', { line: 1.8, depth: 4, hi: false, tension: 0.05, shadow: '#cdb98f' });
      g.fillStyle = '#e8383d';
      for (let i = 0; i < 4; i++) { const y = -13 + i * 7 + (variant % 2) * 1.5; g.fillRect(-4.5 + (i % 2) * 1.5, y, 7 - (i % 3) * 1.2, 2.2); }
      g.beginPath(); g.arc(0, 12, 3.4, 0, TAU); g.strokeStyle = '#e8383d'; g.lineWidth = 1.6; g.stroke();
    });
  }
  function emberSpr(hex) {
    return mkSpr('ember|' + hex, 16, 16, (g) => {
      const gr = g.createRadialGradient(8, 8, 0, 8, 8, 8);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.25, A(lite(hex, 0.5), 1)); gr.addColorStop(0.6, A(hex, 0.5)); gr.addColorStop(1, A(hex, 0));
      g.fillStyle = gr; g.fillRect(0, 0, 16, 16);
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

  // Rising sparks / embers from a source. cfg: key, n, x, y (source), spread (px), rise (px/s), life (s), color, size, wind (px/s)
  function sparks(ctx, T, cfg) {
    const n = Math.round(cfg.n * T.pf);
    if (n <= 0) return;
    const P = pset('spark|' + cfg.key, cfg.n, (r) => ({ ph: r(), dx: (r() - 0.5) * 2, sp: 0.6 + r() * 0.8, sz: 0.5 + r() * 0.9, fq: 1 + r() * 2.5, ph2: r() * TAU }));
    const life = cfg.life || 3;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const p = P[i], u = ((T.tt / life * p.sp + p.ph) % 1 + 1) % 1;
      const x = cfg.x + p.dx * (cfg.spread || 14) * (0.3 + u) + Math.sin(T.tt * p.fq + p.ph2) * 6 * u + (cfg.wind || 0) * u * life;
      const y = cfg.y - u * (cfg.rise || 160) * p.sp;
      const a = Math.pow(1 - u, 1.4) * ss(0, 0.06, u);
      const hex = u < 0.4 ? (cfg.hot || '#fff0b0') : (cfg.color || '#ff9a2e');
      glowAt(ctx, x, y, (cfg.size || 6) * p.sz * (1 - 0.5 * u), hex, a);
    }
    ctx.restore();
  }


  // ===============================================================================================================
  // CHAPTER 1: the Whispering Bamboo Grove at golden dusk. Low sun at the right, rose hills, a far torii, hazy bamboo walls in three depths,
  // god rays, drifting leaves, warm mist. Dark ground plane at y = 520.
  // ===============================================================================================================
  const C1 = { fog: '#ffd9a0', sunX: 930, sunY: 322 };
  const c1sx = (boss) => (boss ? 800 : C1.sunX);
  const C1_HILLS = [
    { sd: 11, base: 402, amp: 70, freq: 0.0028, top: '#c8809c', bot: '#f3ad8e' },
    { sd: 23, base: 436, amp: 56, freq: 0.0037, top: '#a67291', bot: '#ea9c88' },
    { sd: 37, base: 468, amp: 40, freq: 0.0049, top: '#87627f', bot: '#d98c7e' },
  ];

  function ch1Sky(g, boss) {
    const stops = boss ? [[0, '#1c0c2e'], [0.28, '#5a1840'], [0.5, '#c8402e'], [0.68, '#ff8a3a'], [0.84, '#ffc060'], [1, '#ffd88a']]
      : [[0, '#5b4894'], [0.25, '#a86a9c'], [0.45, '#ff9078'], [0.62, '#ffbf78'], [0.78, '#ffe2a0'], [1, '#fff0c8']];
    fillRectG(g, X0, 0, XW, 490, stops);
    // manga screen-tone: dots that swell toward the horizon glow
    if (!tk.lowQ()) tk.halftoneRamp(g, X0, 250, XW, 200, { d: 9, dir: PI / 2, r0: 0.2, r1: 3.1, color: boss ? '#3a0a2a' : '#c0607a', alpha: boss ? 0.22 : 0.17 });
    const sx = c1sx(boss), sy = C1.sunY;
    blob(g, sx, sy, 640, 470, boss ? '#ff8a3a' : '#ffe2a0', boss ? 0.75 : 0.9);
    blob(g, sx, sy, 300, 230, boss ? '#ffc060' : '#fff3cc', boss ? 0.7 : 0.9);
    if (boss) {
      // an eclipse: black disc, burning corona
      disc(g, sx, sy, 84, '#ffd890');
      disc(g, sx, sy, 68, '#0d0620');
      tk.inkPath(g, tk.ellipsePts(sx, sy, 70, 70, 20), { closed: true, w: 3, color: '#ffb050', align: 0.5, weightVar: 0.2 });
    } else {
      disc(g, sx, sy, 66, '#fff9e2');
      tk.inkPath(g, tk.ellipsePts(sx, sy, 66, 66, 20), { closed: true, w: 2.4, color: A('#f5a04a', 0.8), align: 0.5, weightVar: 0.2 });
      tk.inkPath(g, tk.ellipsePts(sx, sy, 92, 92, 22), { closed: true, w: 1.4, color: A('#ffe9a8', 0.7), align: 0.5, weightVar: 0.2, alpha: 0.7 });
    }
  }

  function ch1Clouds(g, boss) {
    const list = [
      { x: 170, y: 132, w: 380, h: 52, s: 1 }, { x: 640, y: 88, w: 430, h: 56, s: 2 }, { x: 1080, y: 160, w: 360, h: 50, s: 3 },
      { x: 360, y: 246, w: 300, h: 36, s: 4 }, { x: 860, y: 214, w: 340, h: 40, s: 5 },
    ];
    list.forEach((c) => wrapDraw(c.x, c.w * 0.7, (x) => {
      streak(g, x, c.y + c.h * 0.7, c.w * 1.3, c.h * 0.8, boss ? '#ff9060' : '#ffc4a4', 0.3, c.s);
      cloudBand(g, x, c.y, c.w, c.h, { seed: c.s, base: boss ? '#b04058' : '#ffd0b0', shade: boss ? '#3e1038' : '#c4708c', lit: boss ? '#ffb070' : '#fff2cc', lean: 20 });
    }));
  }

  function ch1Hills(g, boss) {
    const fog = boss ? '#ff9a50' : C1.fog;
    C1_HILLS.forEach((hl, i) => {
      const pts = ridgePts(hl.sd, X0, X0 + XW, hl.base, hl.amp, hl.freq, { oct: 4 });
      const top = boss ? mixc(hl.top, '#3a0f2a', 0.6) : hl.top, bot = boss ? mixc(hl.bot, '#a83a30', 0.45) : hl.bot;
      fillRidge(g, pts, 560, tk.lin(g, 0, hl.base - hl.amp, 0, 560, [[0, top], [0.5, bot], [0.86, mixc(bot, fog, 0.55)], [1, fog]]));
      // backlit edge: a thin bright line along the ridge close to the sun
      tk.inkPath(g, pts.filter((p) => Math.abs(p[0] - c1sx(boss)) < 520), { w: 1.6, color: boss ? '#ffb060' : '#fff0c4', alpha: 0.5, taper: 0.4, wobble: 0.1, seed: i });
      haze(g, hl.base + 40, 500, fog, 0, 0.3 - i * 0.05);
      if (i === 1) {
        // the far torii on the second hill
        const tx = 262, ty = ridgeY(pts, tx) + 3;
        torii(g, tx, ty, 58, { col: boss ? '#7a2038' : '#d8605a', shade: boss ? '#3a1030' : '#a4424e', alpha: 0.85 });
        fillPoly(g, [[tx - 20, ty + 3], [tx + 20, ty + 3], [tx + 26, ty + 12], [tx - 26, ty + 12]], A(mixc(bot, '#5a3a5a', 0.4), 0.9));
      }
    });
    // far bamboo walls: hazy clumps in two depths
    const walls = [
      { n: 15, w: [5, 8], col: boss ? '#6a2a48' : '#b98088', a: 0.62, y1: 470, sd: 3 },
      { n: 13, w: [9, 14], col: boss ? '#4a1c3c' : '#9a7480', a: 0.7, y1: 484, sd: 4 },
    ];
    walls.forEach((wl, wi) => {
      const r = R('ch1wall', wl.sd);
      for (let i = 0; i < wl.n; i++) {
        const x = X0 + r() * XW;
        clump(g, x, -20, wl.y1, lerp(wl.w[0], wl.w[1], r()), { n: 2 + Math.floor(r() * 2), spread: 9, base: wl.col, shade: mixc(wl.col, '#5a3a6a', 0.4), hi: null, alpha: wl.a, seed: wl.sd * 100 + i, gap: 60 + wi * 20, node: mixc(wl.col, '#5a3a6a', 0.5) });
      }
      haze(g, 330, 490, fog, 0, wi === 0 ? 0.42 : 0.34);
    });
  }

  function ch1Mid(g, boss) {
    const fog = boss ? '#ff8a40' : C1.fog;
    const groups = [
      { x: 148, w: 30, n: 3, hz: 0.06 }, { x: 372, w: 22, n: 2, hz: 0.16 }, { x: 560, w: 24, n: 2, hz: 0.42 },
      { x: 706, w: 17, n: 2, hz: 0.56 }, { x: 1092, w: 20, n: 2, hz: 0.4 }, { x: 1176, w: 30, n: 3, hz: 0.1 },
    ];
    groups.forEach((gr, i) => {
      const base = mixc(boss ? '#5a4a3a' : '#6f9250', fog, gr.hz), shade = mixc(boss ? '#2a1030' : '#2c5244', fog, gr.hz * 0.8), hi = mixc(boss ? '#ff9a50' : '#eadc86', fog, gr.hz * 0.5);
      clump(g, gr.x, -20, 515, gr.w, { n: gr.n, spread: gr.w * 1.9, base, shade, hi, rim: null, node: mixc(shade, pal.ink, 0.3), line: 2.2, lineColor: mixc('#241a3a', fog, gr.hz + 0.15), seed: i + 40, gap: 96 });
    });
    haze(g, 360, 520, fog, 0, 0.36);
  }

  function ch1Ground(g, boss) {
    const hy = 494;
    const ground = ridgePts(77, X0, X0 + XW, hy, 6, 0.01, { oct: 2, step: 20 });
    fillRidge(g, ground, DH + 10, tk.lin(g, 0, hy - 10, 0, DH, boss ? [[0, '#5a3a30'], [0.12, '#3a2428'], [0.5, '#1a1020'], [1, '#0a0612']] : [[0, '#8a7a46'], [0.1, '#6b5a34'], [0.28, '#43352a'], [0.6, '#221a26'], [1, '#100b1c']]));
    const r = R('ch1ground');
    // a worn dirt trail through the middle of the plane, soft edged
    for (let i = 0; i < 11; i++) blob(g, X0 + i * 150 + (r() - 0.5) * 40, 548 + (r() - 0.5) * 16, 170, 34, boss ? '#6a4a44' : '#b39a5c', boss ? 0.34 : 0.4);
    for (let i = 0; i < 90; i++) {                                // pebbles on the trail
      const x = X0 + r() * XW, y = 520 + r() * 60, s = 1 + r() * 2.2;
      ellip(g, x, y, s * 1.4, s, r() < 0.5 ? A(boss ? '#8a6a60' : '#e0cc8c', 0.7) : A('#241a30', 0.5));
    }
    // sunlit patches and long cast shadows of the stalks, slanting to the lower left away from the sun
    for (let i = 0; i < 9; i++) {
      const x = 80 + i * 150 + (r() - 0.5) * 60, w = 22 + r() * 40, len = 200 + r() * 160;
      fillPoly(g, [[x, hy + 4], [x + w, hy + 4], [x + w - len * 0.55 + 20, hy + len * 0.7], [x - len * 0.55 - 20, hy + len * 0.7]], A(boss ? '#08040c' : '#1c1230', 0.24));
      const lx = x + 70 + r() * 30;
      fillPoly(g, [[lx, hy + 2], [lx + w * 0.8, hy + 2], [lx + w * 0.8 - len * 0.5, hy + len * 0.6], [lx - len * 0.5, hy + len * 0.6]], A(boss ? '#ff8a40' : '#ffe08a', 0.12));
    }
    lightPool(g, 930, hy + 16, 460, 46, boss ? '#ff8a40' : '#ffe9a0', boss ? 0.3 : 0.5);
    // moss and grass strokes across the ground, larger toward the viewer
    const tone = boss ? ['#2a1a28', '#3a2430'] : ['#2e4a34', '#5f7a3c', '#8a8a46'];
    for (let i = 0; i < 300; i++) {
      const y = hy + 8 + Math.pow(r(), 1.5) * 210, k = (y - hy) / 210, x = X0 + r() * XW;
      grass(g, x, y, 5 + k * 14 + r() * 5, 3, A(tone[i % tone.length], 0.55 + 0.3 * r()), i, 0.2);
    }
    // flagstones: irregular, cel-shaded, half sunk in the trail
    for (let i = 0; i < 6; i++) {
      const x = 130 + i * 210 + (r() - 0.5) * 70, y = 545 + (r() - 0.5) * 26, rx = 22 + r() * 16, ry = rx * (0.28 + r() * 0.08), pts = [];
      for (let j = 0; j < 7; j++) { const a = (j / 7) * TAU + r() * 0.3, k = 0.75 + r() * 0.4; pts.push([x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k]); }
      tk.celFill(g, pts, boss ? '#4a3a44' : '#a89670', { line: 2, lineColor: A('#241a3a', 0.85), depth: 3.4, hi: 'auto', hiW: 1.6, shadow: boss ? '#241628' : '#66564a', tension: 0.6, align: 0.5 });
    }
    // grass silhouettes along the far edge of the plane
    const tuft = boss ? '#1a1024' : '#33503a';
    for (let x = X0; x < X0 + XW; x += 30 + r() * 30) grass(g, x, hy + 6 + (r() - 0.5) * 6, 18 + r() * 26, 4 + Math.floor(r() * 3), mixc(tuft, boss ? '#3a1a28' : '#a8b060', r() * 0.35), Math.round(x), 0.25);
    // fallen leaves
    const lc = boss ? ['#5a3a30', '#3a2a34'] : ['#c8b058', '#a09a48', '#e0c872'];
    for (let i = 0; i < 46; i++) {
      const x = X0 + r() * XW, y = hy + 22 + Math.pow(r(), 0.8) * 190;
      litter(g, x, y, 5 + r() * 5 + (y - hy) * 0.03, r() * TAU, lc[i % lc.length], y > 600 ? 0.9 : 1.2);
    }
    fillRectG(g, X0, hy - 50, XW, 84, [[0, A(boss ? '#ff8a40' : C1.fog, 0)], [0.6, A(boss ? '#ff8a40' : C1.fog, boss ? 0.28 : 0.4)], [1, A(boss ? '#ff8a40' : C1.fog, 0)]]);
  }

  function ch1Fg(g, side, boss) {
    const dk = boss ? '#150c1c' : '#1f3a34', sh = boss ? '#08040c' : '#0e2226', rim = boss ? '#ff8a40' : '#ffd27a';
    const stalks = side < 0
      ? [{ x: 40, w: 58, lean: -6 }, { x: 128, w: 34, lean: 10 }]
      : [{ x: 1246, w: 60, lean: 8 }, { x: 1166, w: 30, lean: -8 }];
    stalks.forEach((s, i) => stalk(g, s.x, -30, 760, s.w, { base: dk, shade: sh, hi: mixc(dk, rim, 0.45), rim: mixc(dk, rim, 0.85), node: sh, line: 3.6, lean: s.lean, seed: 90 + i + (side > 0 ? 5 : 0), gap: 110, halftone: boss ? '#000000' : '#020a10' }));
    const lf = { base: boss ? '#2a1a2c' : '#1f4a3a', base2: boss ? '#3a2036' : '#2a5c44', shadow: boss ? '#0a0410' : '#0c2a2c', rim: rim, line: 2, lineColor: '#0d0b1e' };
    if (side < 0) {
      branch(g, [[-30, 26], [90, 34], [200, 78], [290, 150]], 9, boss ? '#2a1a24' : '#3a5a34', { seed: 3 });
      leafFan(g, 268, 128, Object.assign({ dir: 1.05, spread: 2.6, n: 9, len: 96, wid: 9, seed: 5 }, lf));
      leafFan(g, 176, 62, Object.assign({ dir: 1.3, spread: 2.4, n: 8, len: 84, wid: 8.5, seed: 6 }, lf));
      leafFan(g, 70, 30, Object.assign({ dir: 1.55, spread: 2.2, n: 8, len: 80, wid: 8, seed: 7 }, lf));
    } else {
      branch(g, [[1320, 20], [1200, 30], [1090, 76], [1010, 146]], 9, boss ? '#2a1a24' : '#3a5a34', { seed: 4 });
      leafFan(g, 1030, 128, Object.assign({ dir: 2.1, spread: 2.6, n: 9, len: 92, wid: 9, seed: 8 }, lf));
      leafFan(g, 1130, 58, Object.assign({ dir: 1.85, spread: 2.4, n: 8, len: 84, wid: 8.5, seed: 9 }, lf));
      leafFan(g, 1236, 28, Object.assign({ dir: 1.6, spread: 2.2, n: 8, len: 78, wid: 8, seed: 10 }, lf));
    }
  }
  function ch1FanSprite(k, boss) {
    return mkSpr('ch1|fan|' + k + (boss ? 'b' : ''), 190, 190, (g) => {
      const lf = { base: boss ? '#2a1a2c' : '#1f4a3a', base2: boss ? '#3a2036' : '#2a5c44', shadow: boss ? '#0a0410' : '#0c2a2c', rim: boss ? '#ff8a40' : '#ffd27a', line: 2, lineColor: '#0d0b1e' };
      leafFan(g, 95, 30, Object.assign({ dir: PI / 2, spread: 2.2, n: 8, len: 100, wid: 9.5, seed: 20 + k }, lf));
    });
  }

  function ch1Items(id, boss) {
    const sk = id;
    const L = (name, rect, f, draw, o) => layer(name, rect, f, draw, Object.assign({ sk }, o));
    const items = [
      L('sky', full(0, 490), 0.03, (g) => ch1Sky(g, boss)),
      L('clouds', { x: 0, y: 60, w: DW, h: 260 }, 0.02, (g) => ch1Clouds(g, boss), { scroll: 2.4 }),
      anim((ctx, T) => { addMode(ctx, () => tk.sparkle(ctx, c1sx(boss) - T.par * 0.03, C1.sunY, 54 + 6 * Math.sin(T.tt * 1.3), { color: boss ? '#ffb060' : '#fffbe8', glow: 0.6, rot: 0.2, thin: 0.1 })); }),
      L('hills', full(0, 530), 0.08, (g) => ch1Hills(g, boss)),
      mistLayer(sk + 'mistFar', 330, 160, boss ? '#ff8a50' : '#ffe0a8', boss ? 0.5 : 0.62, 5, 0.1, 3),
      L('mid', full(0, 530), 0.3, (g) => ch1Mid(g, boss)),
      raysLayer(sk + 'rays', c1sx(boss), C1.sunY, [126, 146, 162, 178, 196, 214], 7, boss ? '#ff9a50' : '#fff0c0', boss ? 0.3 : 0.32, { phase: 1, r0: 150, bokeh: [[770, 170, 40], [640, 240, 22], [560, 120, 54], [1010, 150, 20], [1130, 260, 34], [420, 90, 28], [880, 60, 16]], bokehColor: boss ? '#ff8a50' : '#ffe2b0' }),
      L('ground', { x: 0, y: 440, w: DW, h: 280 }, 0, (g) => ch1Ground(g, boss)),
      mistLayer(sk + 'mistNear', 440, 130, boss ? '#ff8a50' : '#ffdca0', boss ? 0.36 : 0.42, 9, 0.35, 5, { bob: [3, 0.4, 0] }),
      L('fgL', { x: 0, y: 0, w: 330, h: DH }, 1, (g) => ch1Fg(g, -1, boss)),
      L('fgR', { x: 950, y: 0, w: 330, h: DH }, 1, (g) => ch1Fg(g, 1, boss)),
      swayer(1, () => ch1FanSprite(0, boss), 330 - 95 + 8, 92, 190, 190, 95, 30, 0.07, 0.14, 0),
      swayer(1, () => ch1FanSprite(1, boss), 1010 - 95 - 40, 92, 190, 190, 95, 30, 0.07, 0.12, 2),
      anim((ctx, T) => {
        const leaves = [leafSpr(boss ? '#5a3a30' : '#d8c060', 0), leafSpr(boss ? '#3a2a34' : '#8fb050', 1), leafSpr(boss ? '#7a4030' : '#e8a840', 2)];
        drift(ctx, T, { key: sk + 'leaves', n: 20, sprs: leaves, area: { x: 0, y: 0, w: DW, h: DH }, vx: -42, vy: 26, sway: 34, size: [16, 30], aspect: 0.42, tumble: true, spin: 0.6, alpha: [0.75, 1] });
        tk.kirakira(ctx, 320, 110, 720, 420, T.tt, { n: Math.round(16 * T.pf), seed: 5, size: 3.2, rise: 5, color: boss ? '#ff9a50' : '#ffe9a8' });
      }),
      ...(boss ? bossOverlay(sk, { cx: 1120, cy: 330, top: '#5a2a5a', mid: '#a06a7a', speed: 0.15 }) : []),
      vigLayer(sk + 'vig', { color: boss ? '#0d0410' : '#3a1030', alpha: boss ? 0.6 : 0.42, hud: boss ? 0.82 : 0.66 }),
      ...(boss ? [inkFrame(sk + 'frame', { seed: 2, th: 34 })] : []),
      grain(0.26),
    ];
    return items;
  }
  SCENES.ch1 = { id: 'ch1', combat: true, cap: 1.5, mood: 'golden dusk', sway: 6, items: ch1Items('ch1', false) };

  SCENES.boss1 = { id: 'boss1', combat: true, cap: 1.5, mood: 'eclipse over the grove', sway: 5, items: ch1Items('boss1', true) };


  // ===============================================================================================================
  // TITLE: a bronze temple bell in a wooden belfry on a cliff under a huge moon, bamboo and a sakura branch framing it. Until the player's first
  // win the bell is bound to the posts with grey Hush threads and its ring is muffled; after the first win (opts.rung) it hangs free and rings
  // clear. Ash and frost creep in at the corners.
  // ===============================================================================================================
  const TM = { x: 905, y: 286, r: 172 };                          // the moon
  const BELL = { cx: 640, pivotY: 300, crown: 304, lip: 478 };    // the bell hangs from the crossbeam at (cx, pivotY)
  // the centrepiece's bounding box in stage px (ink line and gold fittings included) and its layer parallax factor: exported by ART.scene.info
  const TITLE_FOCUS = { x0: 360, x1: 920, y0: 238, y1: 506, k: 0.1 };

  function titleSky(g) {
    fillRectG(g, X0, 0, XW, 560, [[0, '#070516'], [0.34, '#140e42'], [0.62, '#2b1f6e'], [0.84, '#59399a'], [1, '#8a58aa']]);
    if (!tk.lowQ()) tk.halftoneRamp(g, X0, 250, XW, 260, { d: 9, dir: PI / 2, r0: 0.2, r1: 3.2, color: '#b898ff', alpha: 0.16 });
    // stars baked in (a second, twinkling set is live)
    const r = R('title-stars');
    for (let i = 0; i < 150; i++) {
      const x = X0 + r() * XW, y = Math.pow(r(), 1.3) * 420, s = 0.6 + r() * 1.4;
      g.fillStyle = A(r() < 0.2 ? '#ffe9a8' : '#e8e4ff', 0.35 + 0.5 * r()); g.fillRect(x, y, s, s);
    }
    blob(g, TM.x, TM.y, 680, 560, '#9a86ff', 0.28);
    blob(g, TM.x, TM.y, 420, 380, '#ffe9a8', 0.4);
    // three faint sound rings around the moon, thinning outward
    for (let k = 0; k < 3; k++) tk.soundRings(g, TM.x, TM.y, TM.r + 36 + k * 30, { n: 1, color: '#fff1cc', alpha: 0.25 - k * 0.075, lw: 3.2 - k * 0.7 });
    // the moon: paper-cream disc, hard lavender shadow crescent with screen-tone, ink-wash seas, a thick ink outline
    disc(g, TM.x, TM.y, TM.r, '#fff2d2');
    g.save();
    g.beginPath(); g.arc(TM.x, TM.y, TM.r, 0, TAU); g.clip();
    g.beginPath(); g.rect(TM.x - TM.r * 2, TM.y - TM.r * 2, TM.r * 4, TM.r * 4); g.arc(TM.x + TM.r * 0.24, TM.y - TM.r * 0.2, TM.r * 1.04, 0, TAU);
    g.fillStyle = '#d6c8ee'; g.fill('evenodd');
    g.clip('evenodd');
    tk.halftone(g, TM.x - TM.r, TM.y - TM.r, TM.r * 2, TM.r * 2, { d: 6, r: 1.5, color: '#7a64b8', alpha: 0.45, force: true });
    g.restore();
    g.save(); g.beginPath(); g.arc(TM.x, TM.y, TM.r, 0, TAU); g.clip();
    const mr = R('title-moon');
    for (let i = 0; i < 9; i++) blob(g, TM.x + (mr() - 0.5) * TM.r * 1.3, TM.y + (mr() - 0.5) * TM.r * 1.3, TM.r * (0.1 + 0.18 * mr()), TM.r * (0.08 + 0.14 * mr()), '#b8a8d0', 0.5);
    for (let i = 0; i < 5; i++) { const cx = TM.x + (mr() - 0.5) * TM.r * 1.4, cy = TM.y + (mr() - 0.5) * TM.r * 1.4, cr = 5 + mr() * 12; tk.inkPath(g, tk.arcPts(cx, cy, cr, cr * 0.8, 0.3, 4.6, 8), { w: 1.6, color: A('#7a64b8', 0.6), taper: 0.3, wobble: 0.2, seed: i }); }
    g.restore();
    tk.inkPath(g, tk.ellipsePts(TM.x, TM.y, TM.r, TM.r, 30), { closed: true, w: 5, color: pal.ink, align: 0.5, weightVar: 0.7, wobble: 0.12 });
  }

  function titleMountains(g) {
    const rims = '#b8a8ff';
    const defs = [
      { sd: 5, base: 452, amp: 100, freq: 0.0024, top: '#4a3a92', bot: '#6a4aa0', a: 0.55 },
      { sd: 9, base: 486, amp: 78, freq: 0.0032, top: '#2f2578', bot: '#4a3488', a: 0.4 },
      { sd: 15, base: 520, amp: 60, freq: 0.0044, top: '#1b1456', bot: '#2c2070', a: 0.3 },
    ];
    defs.forEach((d, i) => {
      const pts = ridgePts(d.sd, X0, X0 + XW, d.base, d.amp, d.freq, { oct: 4 });
      fillRidge(g, pts, 600, tk.lin(g, 0, d.base - d.amp, 0, 600, [[0, d.top], [0.6, d.bot], [1, '#8a58aa']]));
      tk.inkPath(g, pts.filter((p) => p[0] > 500), { w: 1.8, color: A(rims, 0.55), taper: 0.3, wobble: 0.1, seed: i });
      haze(g, d.base, 560, '#8a58aa', 0, d.a);
      if (i === 2) pagoda(g, 1096, ridgeY(pts, 1096) + 6, 108, '#100b36', '#ffb84a');
      if (i === 1) { const tx = 186; torii(g, tx, ridgeY(pts, tx) + 4, 46, { col: '#5a2a78', shade: '#2a1458', alpha: 0.9 }); }
    });
  }

  function titleCliff(g) {
    const top = [[X0, 690], [-40, 640], [110, 590], [240, 545], [312, 508], [420, 492], [640, 486], [860, 489], [962, 500], [1030, 528], [1160, 580], [1320, 640], [X0 + XW, 690]];
    const body = () => { g.beginPath(); tk.trace(g, top, 0, 0, 0.8, false); g.lineTo(X0 + XW, 760); g.lineTo(X0, 760); g.closePath(); };
    body(); g.fillStyle = tk.lin(g, 0, 480, 0, 740, [[0, '#2a2262'], [0.35, '#1a1448'], [1, '#080618']]); g.fill();
    g.save(); body(); g.clip();
    // rock facets: angular plates lit from the moon (upper right) with hard shadows and screen-tone
    const r = R('title-cliff');
    for (let i = 0; i < 30; i++) {
      const x = X0 + r() * XW, y = 520 + r() * 190, w = 40 + r() * 120, h = 30 + r() * 80;
      const pts = [[x, y], [x + w * 0.6, y - h * 0.2], [x + w, y + h * 0.1], [x + w * 0.8, y + h * 0.8], [x + w * 0.2, y + h]];
      fillPoly(g, pts, A(r() < 0.5 ? '#3a3080' : '#120d38', 0.5));
      tk.inkPath(g, [pts[0], pts[1], pts[2]], { w: 1.6, color: A('#9a88ff', 0.35), taper: 0.4, wobble: 0.1, seed: i });
    }
    for (let i = 0; i < 26; i++) {                                    // long vertical strata and cracks
      const x = X0 + r() * XW, y = 505 + r() * 60, len = 50 + r() * 150, pts = [[x, y]];
      for (let k = 1; k < 5; k++) pts.push([x + (r() - 0.5) * 22, y + len * k / 4]);
      tk.inkPath(g, pts, { w: 1.6 + r() * 1.6, color: A(pal.ink, 0.75), taper: 0.5, wobble: 0.2, seed: i + 30 });
    }
    if (!tk.lowQ()) tk.halftone(g, X0, 600, XW, 160, { d: 7, r: 1.6, color: '#04030f', alpha: 0.5, force: true });
    g.restore();
    tk.inkPath(g, tk.flatten(top, { tension: 0.8, step: 8 }).reduce((a, v, i, arr) => { if (i % 2 === 0) a.push([v, arr[i + 1]]); return a; }, []), { w: 4, color: pal.ink, taper: 0.02, wobble: 0.15, seed: 3 });
    // moonlit grass cap along the plateau with blade silhouettes
    const gp = tk.flatten(top, { tension: 0.8, step: 10 }), edge = [];
    for (let i = 0; i < gp.length; i += 2) if (gp[i] > 240 && gp[i] < 1040) edge.push([gp[i], gp[i + 1]]);
    tk.inkPath(g, edge, { w: 9, color: '#27506a', taper: 0.05, wobble: 0.2, pressure: 'flat', seed: 8 });
    tk.inkPath(g, edge.map((p) => [p[0], p[1] - 3]), { w: 2.4, color: A('#a8f0ff', 0.6), taper: 0.1, wobble: 0.2, pressure: 'flat', seed: 9 });
    const gr = R('title-grass');
    for (let x = 250; x < 1040; x += 16 + gr() * 20) { const y = ridgeY(edge, x); grass(g, x, y + 3, 14 + gr() * 22, 4 + Math.floor(gr() * 3), gr() < 0.5 ? '#1e4660' : '#2b6a7a', Math.round(x), 0.15); }
    // tiny wildflowers near the book, catching the glow
    for (let i = 0; i < 26; i++) { const x = 270 + gr() * 740, y = ridgeY(edge, x) + 4 + gr() * 6; disc(g, x, y - 2, 1.4 + gr() * 1.3, gr() < 0.5 ? '#ffe9a8' : '#ffc2dc'); }
    // a stone lantern at the left end of the plateau
    toro(g, 288, ridgeY(edge, 300) + 8, 78, { stone: '#5a5486', rim: '#c8c0ff' });
  }

  const BELL_PROFILE = [[304, 22], [310, 38], [322, 47], [345, 51], [385, 56], [425, 62], [452, 67], [468, 71], [478, 76]];   // [y, half width] down the bell
  function bellHalf(y) {
    const P = BELL_PROFILE;
    if (y <= P[0][0]) return P[0][1];
    for (let i = 1; i < P.length; i++) if (y <= P[i][0]) { const a = P[i - 1], b = P[i]; return lerp(a[1], b[1], (y - a[0]) / (b[0] - a[0])); }
    return P[P.length - 1][1];
  }
  const BF = { px: [420, 860], pw: 26, top: 262, foot: 490 };      // belfry post centres, width, top and foot y

  // the wooden belfry (shoro): footings, two lacquer posts, a crossbeam, a lower tie beam and a tiled hip roof with upturned eaves and gold ridge caps
  function titleBelfry(g) {
    const lac = '#2c1838', lacD = '#170c24', lacH = '#6a3a6a', gold = '#f5c96a';
    blob(g, 640, 496, 330, 26, '#03020a', 0.75);
    BF.px.forEach((x) => {
      tk.celFill(g, { poly: [[x - 24, 496], [x - 19, 484], [x + 19, 484], [x + 24, 496], [x + 29, 504], [x - 29, 504]] }, '#4a4470', { line: 2.6, depth: 4, hi: 'auto', hiW: 2, shadow: '#2a2548', tension: 0.05, align: 0.5 });
    });
    // the lower tie beam, behind the bell
    tk.celFill(g, { poly: [[BF.px[0], 440], [BF.px[1], 440], [BF.px[1], 452], [BF.px[0], 452]] }, lac, { line: 2.6, depth: 3, hi: lacH, hiW: 1.6, shadow: lacD, tension: 0.05, align: 0.5 });
    // the posts, with gold bands
    BF.px.forEach((x, i) => {
      const hw = BF.pw / 2;
      tk.celFill(g, { poly: [[x - hw, BF.foot], [x - hw + 1, BF.top], [x + hw - 1, BF.top], [x + hw, BF.foot]] }, lac, { line: 3, depth: 7, hi: lacH, hiW: 3, shadow: lacD, rim: '#ffd98a', rimSide: -0.5, rimW: 2, rimAlpha: 0.55, tension: 0.05, align: 0.5 });
      [318, 404].forEach((y) => { fillPoly(g, [[x - hw - 2, y], [x + hw + 2, y], [x + hw + 2, y + 5], [x - hw - 2, y + 5]], gold); tk.inkPath(g, { poly: [[x - hw - 2, y], [x + hw + 2, y], [x + hw + 2, y + 5], [x - hw - 2, y + 5], [x - hw - 2, y]] }, { w: 1.4, color: pal.ink, pressure: 'flat', taper: 0 }); });
      for (let k = 0; k < 5; k++) tk.inkPath(g, [[x - hw + 4 + k * 4.5, BF.top + 8], [x - hw + 4.5 + k * 4.5, BF.foot - 6]], { w: 1, color: A('#c9a0c8', 0.12), taper: 0.3, wobble: 0.1, seed: i * 5 + k, pressure: 'flat' });
    });
    // the crossbeam the bell hangs from (its lower half shows under the roof edge)
    tk.celFill(g, { poly: [[404, 282], [876, 282], [876, 300], [404, 300]] }, lac, { line: 3, depth: 4, hi: lacH, hiW: 2, shadow: lacD, tension: 0.05, align: 0.5 });
    [404, 876].forEach((x) => { disc(g, x, 291, 7, gold); tk.inkPath(g, tk.ellipsePts(x, 291, 7, 7, 14), { closed: true, w: 1.6, color: pal.ink, align: 0.5 }); disc(g, x, 291, 2.6, '#a8782a'); });
    // the hip roof: a ridge, two sloping hips, an eave that sags in the middle
    const eave = (x) => 276 + 14 * (1 - Math.pow((x - 640) / 254, 2));
    const roof = [[472, 250], [808, 250], [894, 276]];
    for (let x = 894; x >= 386; x -= 14) roof.push([x, eave(x)]);
    roof.push([386, 276]);
    const ry = (x, u) => 250 + (eave(x) - 250) * u, rxl = (u) => lerp(472, 386, u), rxr = (u) => lerp(808, 894, u), ROWS = 5;
    tk.celFill(g, { poly: roof }, '#2a2670', {
      line: 3.2, depth: 8, hi: '#5c54b8', hiW: 2.4, shadow: '#14104a', rim: '#b8a8ff', rimSide: -0.5, rimW: 1.8, rimAlpha: 0.5, tension: 0.05, align: 0.5,
      decor: (c) => {
        for (let i = 1; i <= ROWS; i++) {
          const u = i / (ROWS + 1), l1 = [], l2 = [];
          for (let x = rxl(u); x <= rxr(u) + 1; x += 24) { l1.push([x, ry(x, u)]); l2.push([x, ry(x, u) + 2]); }
          tk.inkPath(c, l1, { w: 1.8, color: A(pal.ink, 0.8), taper: 0.05, wobble: 0.05, pressure: 'flat', step: 8 });
          tk.inkPath(c, l2, { w: 1.4, color: A('#9a92f0', 0.7), taper: 0.05, wobble: 0.05, pressure: 'flat', step: 8 });
        }
        c.beginPath();
        for (let i = 0; i <= ROWS; i++) {
          const u0 = i / (ROWS + 1), u1 = (i + 1) / (ROWS + 1);
          for (let x = rxl(u0) + (i % 2) * 11; x < rxr(u0); x += 22) { c.moveTo(x, ry(x, u0)); c.lineTo(x, ry(x, u1)); }
        }
        c.strokeStyle = A(pal.ink, 0.55); c.lineWidth = 1.2; c.stroke();
        const eb = []; for (let x = 386; x <= 894; x += 12) eb.push([x, eave(x) - 3]);
        tk.inkPath(c, eb, { w: 5, color: A('#7a72d8', 0.85), taper: 0, pressure: 'flat', wobble: 0.02, step: 8 });
        tk.inkPath(c, eb.map((p) => [p[0], p[1] - 3]), { w: 1.2, color: A(pal.ink, 0.7), taper: 0, pressure: 'flat', wobble: 0.02, step: 8 });
      },
    });
    // upturned eave tips
    [-1, 1].forEach((s) => {
      const x0 = 640 + s * 254, p = [[x0 - s * 6, 279], [x0 + s * 6, 274], [x0 + s * 16, 266], [x0 + s * 22, 254], [x0 + s * 15, 262], [x0 + s * 4, 268], [x0 - s * 10, 268]];
      tk.celFill(g, p, '#2a2670', { line: 3, depth: 3, hi: false, shadow: '#14104a', tension: 0.5, align: 0.5 });
    });
    // rafter ends under the eave
    g.fillStyle = '#1c1030';
    for (let x = 404; x <= 876; x += 24) g.fillRect(x - 3, eave(x) - 1, 6, 7);
    // gold ridge cap, hip caps and end ornaments
    [[[472, 250], [808, 250], 7], [[472, 250], [386, 276], 5], [[808, 250], [894, 276], 5]].forEach((l, i) => {
      tk.inkPath(g, [l[0], l[1]], { w: l[2] + 3, color: pal.ink, pressure: 'flat', taper: 0, align: 0.5 });
      tk.inkPath(g, [l[0], l[1]], { w: l[2], color: gold, pressure: 'flat', taper: 0, align: 0.5 });
      tk.inkPath(g, [[l[0][0], l[0][1] - 1.5], [l[1][0], l[1][1] - 1.5]], { w: 1.4, color: A('#fff6d0', 0.9), pressure: 'flat', taper: 0, align: 0.5 });
    });
    [472, 808].forEach((x) => { disc(g, x, 249, 8, pal.ink); disc(g, x, 249, 6.2, gold); disc(g, x - 1.4, 247.6, 2.2, '#fff6d0'); });
  }

  // the bell: hanger, body with two bands, a 4 x 4 grid of bosses, verdigris streaks, gold rim light, and the striker log on its two ropes
  function titleBellBody(g, rung) {
    const cx = BELL.cx, bz = '#c9893a', bzD = '#7a4a1c', vd = '#5fbfa8';
    // hanger: a bronze loop and rod from the beam to the crown
    tk.inkPath(g, [[cx, 296], [cx, 306]], { w: 11, color: pal.ink, pressure: 'flat', taper: 0, align: 0.5 });
    tk.inkPath(g, [[cx, 296], [cx, 306]], { w: 7, color: bz, pressure: 'flat', taper: 0, align: 0.5 });
    tk.inkPath(g, tk.ellipsePts(cx, 302, 13, 7, 18), { closed: true, w: 5, color: pal.ink, align: 0.5 });
    tk.inkPath(g, tk.ellipsePts(cx, 302, 13, 7, 18), { closed: true, w: 2.6, color: '#e0a24c', align: 0.5 });
    // the body
    const pts = [];
    BELL_PROFILE.forEach((p, i) => pts.push([cx + p[1], p[0], i === 0 || i === BELL_PROFILE.length - 1 ? 1 : 0]));
    for (let i = BELL_PROFILE.length - 1; i >= 0; i--) pts.push([cx - BELL_PROFILE[i][1], BELL_PROFILE[i][0], i === 0 || i === BELL_PROFILE.length - 1 ? 1 : 0]);
    tk.celFill(g, pts, bz, {
      line: 3, depth: 15, hi: '#e8ac5a', hiW: 4, shadow: bzD, rim: '#ffe9a8', rimSide: -0.5, rimW: 3, rimAlpha: 0.75, tension: 0.5, align: 0.5, halftone: true,
      decor: (c) => {
        c.fillStyle = tk.lin(c, cx - 80, 0, cx + 4, 0, [[0, A('#3a1c08', 0.4)], [1, A('#3a1c08', 0)]]); c.fillRect(cx - 80, 300, 90, 190);
        const bands = [[326, 334], [410, 418]];
        bands.forEach((b, bi) => {
          const top = [], bot = [];
          for (let k = 0; k <= 10; k++) { const u = k / 10 * 2 - 1, y = Math.pow(u, 2); top.push([cx + u * 82, b[0] + 4 * (1 - y)]); bot.push([cx + u * 82, b[1] + 4 * (1 - y)]); }
          fillPoly(c, top.concat(bot.slice().reverse()), '#8a5a24');
          tk.inkPath(c, top, { w: 1.4, color: A(pal.ink, 0.8), taper: 0, pressure: 'flat', wobble: 0.05 });
          tk.inkPath(c, bot, { w: 1.4, color: A(pal.ink, 0.8), taper: 0, pressure: 'flat', wobble: 0.05 });
          tk.inkPath(c, top.map((p) => [p[0], p[1] + 2]), { w: 1, color: A('#ffe08a', 0.8), taper: 0, pressure: 'flat', wobble: 0.02 });
          tk.inkPath(c, bot.map((p) => [p[0], p[1] - 2]), { w: 1, color: A('#ffe08a', 0.7), taper: 0, pressure: 'flat', wobble: 0.02 });
        });
        for (let row = 0; row < 4; row++) {
          const y = 349 + row * 16, hw = bellHalf(y);
          for (let col = 0; col < 4; col++) {
            const u = [-0.62, -0.21, 0.21, 0.62][col], x = cx + u * hw, rr = 3.8 * Math.sqrt(1 - u * u * 0.6);
            disc(c, x - 0.8, y + 1, rr, '#6a3c14');
            disc(c, x + 0.3, y - 0.3, rr * 0.86, '#e0a24c');
            disc(c, x + rr * 0.3, y - rr * 0.35, rr * 0.3, A('#fff6d0', 0.9));
            tk.inkPath(c, tk.ellipsePts(x, y, rr, rr, 10), { closed: true, w: 1, color: A(pal.ink, 0.85), align: 0.5 });
          }
        }
        // the striking boss near the lip: a lotus disc
        disc(c, cx, 438, 10, '#8a5a24'); disc(c, cx, 438, 7, '#d89a44');
        for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; tk.inkPath(c, [[cx + Math.cos(a) * 3, 438 + Math.sin(a) * 3], [cx + Math.cos(a) * 7, 438 + Math.sin(a) * 7]], { w: 1.2, color: A(pal.ink, 0.7), taper: 0.2 }); }
        tk.inkPath(c, tk.ellipsePts(cx, 438, 10, 10, 14), { closed: true, w: 1.4, color: A(pal.ink, 0.85), align: 0.5 });
        // the lip: a dark ring above a light underside
        tk.inkPath(c, [[cx - 80, 463], [cx, 466], [cx + 80, 463]], { w: 2.6, color: A('#4a2a0e', 0.85), taper: 0, pressure: 'flat', wobble: 0.02 });
        tk.inkPath(c, [[cx - 80, 474], [cx, 477], [cx + 80, 474]], { w: 3, color: A('#ffe08a', 0.8), taper: 0, pressure: 'flat', wobble: 0.02 });
        // a vertical highlight streak on the lit side
        tk.inkPath(c, [[cx + 34, 330], [cx + 40, 400], [cx + 46, 458]], { w: 5, color: A('#ffe9a8', 0.38), taper: 0.4, wobble: 0.08, pressure: 'mid' });
        // verdigris streaks running down from the bands and the bosses
        const r = R('bell-verdigris');
        for (let i = 0; i < 11; i++) {
          const y0 = [334, 346, 362, 378, 394, 418][i % 6] + r() * 4, x = cx + (r() - 0.5) * 120, len = 14 + r() * 44;
          tk.inkPath(c, [[x, y0], [x + (r() - 0.5) * 3, y0 + len * 0.5], [x + (r() - 0.5) * 4, y0 + len]], { w: 2 + r() * 2.4, color: A(vd, 0.5 + r() * 0.2), taper: 0.5, taperStart: 0.05, wobble: 0.3, seed: i + 5, pressure: 'head' });
        }
        for (let i = 0; i < 14; i++) disc(c, cx + (r() - 0.5) * 130, 440 + r() * 36, 0.8 + r() * 1.6, A(vd, 0.5));
      },
    });
    // the striker (shumoku): a wooden log on two ropes, pulled back to the right when the bell has been rung
    g.save();
    g.translate(770, 300); g.rotate(rung ? -0.34 : 0); g.translate(-770, -300);
    [746, 794].forEach((x) => { tk.inkPath(g, [[x, 300], [x, 352]], { w: 5.4, color: pal.ink, pressure: 'flat', taper: 0, align: 0.5 }); tk.inkPath(g, [[x, 300], [x, 352]], { w: 3.2, color: '#d8c090', pressure: 'flat', taper: 0, align: 0.5 }); tk.inkPath(g, [[x - 0.8, 305], [x - 0.8, 349]], { w: 0.9, color: A('#8a6a4a', 0.8), pressure: 'flat', taper: 0 }); });
    tk.celFill(g, [[728, 350, 1], [814, 350, 1], [824, 355], [826, 363], [824, 371], [814, 376, 1], [728, 376, 1], [718, 371], [716, 363], [718, 355]], '#a8743c', { line: 3, depth: 7, hi: '#d09858', hiW: 2.4, shadow: '#5a3a1c', tension: 0.3, align: 0.5, rim: '#ffe9a8', rimSide: -0.5, rimW: 1.6, rimAlpha: 0.55 });
    [726, 816].forEach((x) => { fillPoly(g, [[x - 3.5, 351], [x + 3.5, 351], [x + 3.5, 375], [x - 3.5, 375]], '#f5c96a'); tk.inkPath(g, { poly: [[x - 3.5, 351], [x + 3.5, 351], [x + 3.5, 375], [x - 3.5, 375], [x - 3.5, 351]] }, { w: 1.3, color: pal.ink, pressure: 'flat', taper: 0 }); });
    tk.inkPath(g, [[734, 358], [770, 357], [808, 358]], { w: 1.2, color: A('#4a2a0e', 0.6), taper: 0.3, wobble: 0.1 });
    tk.inkPath(g, [[738, 368], [772, 369], [806, 367]], { w: 1.2, color: A('#4a2a0e', 0.5), taper: 0.3, wobble: 0.1 });
    g.restore();
  }

  // the five grey Hush threads: tied to the posts, sagging, then drawn tight round the bell, with ash flecks along them
  function titleThreads(g) {
    const r = R('title-threads'), ash = '#8e8aa3', lx = BF.px[0] + BF.pw / 2 - 2, rx = BF.px[1] - BF.pw / 2 + 2, cx = BELL.cx;
    const rows = [[336, -14, 10, 15], [368, 12, -16, 17], [400, -8, 16, 13], [432, 16, -10, 18], [462, -12, 12, 14]];     // [y at the bell, left knot offset, right knot offset, sag]
    rows.forEach((ro, i) => {
      const yb = ro[0], hw = bellHalf(yb) + 2, pts = [];
      const wrap = (u) => yb + 8 * (1 - u * u);                       // tight round the bell, a shallow smile
      for (let k = 0; k <= 6; k++) { const u = k / 6; pts.push([lerp(lx, cx - hw, u), lerp(yb + ro[1], yb - 2, u) + ro[3] * Math.sin(PI * u) + 2 * Math.sin(u * 13 + i)]); }
      for (let k = 1; k < 6; k++) { const u = k / 6 * 2 - 1; pts.push([cx + u * hw, wrap(u)]); }
      for (let k = 0; k <= 6; k++) { const u = k / 6; pts.push([lerp(cx + hw, rx, u), lerp(yb - 2, yb + ro[2], u) + ro[3] * Math.sin(PI * u) + 2 * Math.sin(u * 13 + i * 3)]); }
      tk.inkPath(g, pts, { w: 4.6, color: A('#46425a', 0.6), taper: 0, pressure: 'flat', wobble: 0.04, seed: i, step: 6 });
      tk.inkPath(g, pts, { w: 2.6, color: A(ash, 0.85), taper: 0.03, pressure: 'flat', wobble: 0.1, seed: i + 9, step: 6 });
      tk.inkPath(g, pts.map((p) => [p[0], p[1] - 0.9]), { w: 0.8, color: A('#f2f0f6', 0.5), taper: 0.1, pressure: 'flat', wobble: 0.05, seed: i + 3, step: 6 });
      [pts[0], pts[pts.length - 1]].forEach((p) => { disc(g, p[0], p[1], 5, '#46425a'); disc(g, p[0], p[1], 3.6, ash); disc(g, p[0] - 0.8, p[1] - 0.8, 1.2, '#f2f0f6'); });
      for (let j = 0; j < 18; j++) {
        const k = Math.floor(r() * (pts.length - 1)), p = pts[k], q = pts[k + 1], u = r(), x = lerp(p[0], q[0], u), y = lerp(p[1], q[1], u) + (r() - 0.5) * 9;
        g.fillStyle = A(r() < 0.5 ? '#f2f0f6' : '#8e8aa3', 0.35 + r() * 0.5); g.fillRect(x, y, 2 + r() * 4, 1);
      }
    });
  }
  // the whole centrepiece in one go (victory and defeat use it): belfry, bell, and the threads unless the bell has rung
  function titleBell(g, rung) {
    titleBelfry(g);
    titleBellBody(g, rung);
    if (!rung) titleThreads(g);
  }

  function titleBeam(g) {
    // soft light spilling down from under the bell lip onto the cliff, and a faint column behind the bell
    for (let k = 0; k < 3; k++) {
      const wb = 150 + k * 22, wt = 270 + k * 70;
      g.fillStyle = tk.lin(g, 0, 480, 0, 524, [[0, A('#fff0c0', 0.5 - k * 0.12)], [1, A('#ffe0a0', 0)]]);
      g.beginPath(); g.moveTo(640 - wb / 2, 480); g.lineTo(640 - wt / 2, 524); g.lineTo(640 + wt / 2, 524); g.lineTo(640 + wb / 2, 480); g.closePath(); g.fill();
    }
    g.fillStyle = tk.lin(g, 0, 480, 0, 240, [[0, A('#ffe0a0', 0.16)], [0.7, A('#ffe0a0', 0.05)], [1, A('#ffe0a0', 0)]]);
    g.fillRect(560, 240, 160, 240);
  }

  function titleFg(g, side) {
    const dk = '#100a2a', sh = '#060414', rim = '#9a88ff';
    g.save();
    if (side > 0) { g.translate(DW, 0); g.scale(-1, 1); }
    const stalks = [{ x: 40, w: 62, lean: -8, top: -30 }, { x: 128, w: 36, lean: 10, top: -30 }, { x: 206, w: 20, lean: -6, top: -30 }];
    stalks.forEach((s, i) => stalk(g, s.x, s.top, 760, s.w, { base: dk, shade: sh, hi: mixc(dk, rim, 0.3), rim: mixc(dk, rim, 0.75), node: sh, line: 3.6, lean: s.lean, seed: 130 + i, gap: 116, halftone: '#020108' }));
    const lf = { base: '#150e34', base2: '#1c1444', shadow: '#070416', rim, line: 2, lineColor: '#05030f' };
    branch(g, [[-30, 30], [70, 40], [150, 80], [212, 150]], 8, '#1a1240', { seed: 3, outline: 3 });
    leafFan(g, 194, 130, Object.assign({ dir: 1.05, spread: 2.6, n: 9, len: 90, wid: 8.5, seed: 5 }, lf));
    leafFan(g, 118, 64, Object.assign({ dir: 1.3, spread: 2.4, n: 8, len: 70, wid: 8, seed: 6 }, lf));
    leafFan(g, 46, 32, Object.assign({ dir: 1.55, spread: 2.2, n: 8, len: 66, wid: 7.5, seed: 7 }, lf));
    g.restore();
  }
  function titleSakura(g) {
    // a blossoming branch from the top-right corner, hanging into the frame
    const pts = [[1350, 20], [1280, 30], [1210, 56], [1150, 104], [1110, 170]];
    branch(g, pts, 11, '#3a2038', { seed: 11, hi: '#8a5a7a' });
    [[[1250, 40], [1236, 84], [1210, 116]], [[1190, 80], [1160, 76], [1130, 84]], [[1150, 104], [1176, 150], [1170, 196]]].forEach((tw, i) => branch(g, tw, 4.5, '#3a2038', { seed: 12 + i, outline: 2.4 }));
    const spots = [[1300, 40, 30, 7], [1250, 52, 36, 9], [1198, 84, 34, 9], [1150, 128, 36, 9], [1112, 178, 30, 7], [1210, 118, 24, 6], [1148, 84, 22, 5], [1174, 190, 22, 5], [1290, 96, 22, 5]];
    spots.forEach((s, i) => blossomCluster(g, s[0], s[1], s[2], s[3], 40 + i, { size: 10, line: '#7a2050' }));
    // moonlit rim on the blossoms
    const rr = R('title-blossom-rim');
    for (let i = 0; i < 30; i++) { const s = spots[i % spots.length]; disc(g, s[0] + (rr() - 0.5) * s[2] * 2, s[1] + (rr() - 0.5) * s[2], 1.2 + rr() * 1.6, A('#ffffff', 0.85)); }
  }

  // the Hush: grey ash and frost creeping in from the corners and edges (the colour drained, not paper). `k` scales the reach, `sd` reshapes the edges.
  function tornBlob(g, cx, cy, rx, ry, sd, k) {
    const n = 70, pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, jag = nz(Math.cos(a) * 3.2 + sd, Math.sin(a) * 3.2 + sd, sd, 4), fine = nz(a * 22 + sd, sd, sd + 1, 3);
      const m = k * (0.72 + jag * 0.5) * (0.9 + fine * 0.2);
      pts.push([cx + Math.cos(a) * rx * m, cy + Math.sin(a) * ry * m]);
    }
    return pts;
  }
  // grey fog patches at spots [[x, y, rx, ry], ...]: a cool grey radial, no outline, a soft 18 px feather (the blob drawn three times, shrinking, with rising
  // alpha) and 30 static ash and frost dashes per patch
  function hushSpots(g, spots, k, sd, tag) {
    spots.forEach((s, i) => {
      const pts = tornBlob(g, s[0], s[1], s[2], s[3], sd + i * 13, k), reach = Math.max(s[2], s[3]) * k;
      [[0, 0.3], [9, 0.6], [18, 0.9]].forEach((p) => {
        const sc = Math.max(0.5, 1 - p[0] / Math.max(40, reach));
        g.save(); g.globalAlpha = g.globalAlpha * p[1];
        g.beginPath(); tk.trace(g, { poly: pts.map((v) => [s[0] + (v[0] - s[0]) * sc, s[1] + (v[1] - s[1]) * sc]) });
        g.fillStyle = tk.rad(g, s[0], s[1], 10, s[0], s[1], reach, [[0, '#b9b6c6'], [1, '#8e8aa3']]); g.fill();
        g.restore();
      });
      g.save(); g.beginPath(); tk.trace(g, { poly: pts }); g.clip();
      const rr = R(tag || 'hush-dash', i + sd);
      for (let j = 0; j < 30; j++) {
        const v = pts[Math.floor(rr() * pts.length)], u = 0.12 + rr() * 0.8, x = s[0] + (v[0] - s[0]) * u, y = s[1] + (v[1] - s[1]) * u;
        g.fillStyle = j % 2 ? A('#f2f0f6', 0.8) : A('#5a566e', 0.55); g.fillRect(x, y, 3 + rr() * 4, 1);
      }
      g.restore();
    });
  }
  function titleHush(g, k, sd) {
    hushSpots(g, [[-12, 734, 190, 140], [1292, 738, 210, 150], [-10, -8, 110, 84], [1292, -10, 104, 80], [-12, 404, 40, 96], [1294, 330, 36, 90]], k, sd, 'title-hush');
  }
  // a rising note glyph with a soft gold glow (the title and victory drift)
  function noteSpr(k) {
    return mkSpr('note|' + k, 32, 32, (g) => {
      g.globalAlpha = 0.5; disc(g, 16, 16, 14, A('#ffcf6a', 0.22)); g.globalAlpha = 1;
      const kind = ['eighth', 'quarter', 'beamed', 'eighth', 'rest'][k % 5];
      tk.note(g, kind === 'beamed' ? 13 : 14, kind === 'rest' ? 16 : 22, 9, { kind, color: '#fff4d0', rot: k % 5 === 3 ? 0.3 : 0, line: 1.7 });
    });
  }
  function fanSprite(key, dir, spread, base, base2, shadow, rim, seed) {
    return mkSpr('fan|' + key, 190, 190, (g) => { leafFan(g, 95, 30, { dir, spread, n: 8, len: 98, wid: 9, seed, base, base2, shadow, rim, line: 2, lineColor: '#05030f' }); });
  }

  function toroGlow(ctx, T) {
    const f = 0.8 + 0.2 * Math.sin(T.tt * 7.3) * Math.sin(T.tt * 3.1 + 1) + 0.06 * Math.sin(T.tt * 13);
    addMode(ctx, () => { glowAt(ctx, 288 - T.par * 0.1, 470, 86 * f, '#ffb04a', 0.6 * f); glowAt(ctx, 288 - T.par * 0.1, 470, 22, '#fff0c0', 0.8 * f); });
  }

  // the bell swings a hair (+-0.03 rad over 0.8 s) every 10.5 s, just as its ring leaves the lip
  const TITLE_RING_P = 10.5;
  function bellSwing(T) {
    if (T.mot < 1) return 0;
    const s = ((T.tt % TITLE_RING_P) + TITLE_RING_P) % TITLE_RING_P;
    return s < 0.8 ? 0.03 * Math.sin(s / 0.8 * TAU) * (1 - s / 0.8) : 0;
  }
  // the ring: one circle expands from the lip to r 260. Muffled (no win yet) it breaks into grey ash flecks past r 160; once the bell has rung it stays whole and clear.
  function titleRing(ctx, T) {
    if (T.mot < 1) return;
    const rung = !!T.o.rung, DUR = 2.6, s = ((T.tt % TITLE_RING_P) + TITLE_RING_P) % TITLE_RING_P;
    if (s > DUR) return;
    const u = s / DUR, r = 260 * (1 - Math.pow(1 - u, 2)), fade = 1 - ss(0.3, 1, u), cx = BELL.cx - T.par * 0.1, cy = BELL.lip + 2;
    ctx.save();
    ctx.lineCap = 'round';
    if (rung) {
      [[1, 1], [0.7, 0.55]].forEach((q) => {
        const rr = r * q[0];
        if (rr < 4) return;
        ctx.globalAlpha = 0.8 * fade * q[1]; ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 2 + 5 * (1 - u); ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 0.9 * fade * q[1]; ctx.strokeStyle = '#fffdf0'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke();
      });
    } else {
      const solid = 1 - ss(130, 170, r);
      if (solid > 0.01 && r > 4) {
        ctx.globalAlpha = 0.7 * fade * solid; ctx.strokeStyle = '#e8e4ff'; ctx.lineWidth = 2 + 3 * (1 - u); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
      }
      if (solid < 0.99) {
        const n = 56;
        for (let i = 0; i < n; i++) {
          const h = U.hash('ring-ash', i) % 1000 / 1000, h2 = U.hash('ring-len', i) % 1000 / 1000;
          if (h < 0.34) continue;
          const a = i / n * TAU + (h2 - 0.5) * 0.05, rr = r + (h - 0.6) * 10, len = 3 + h2 * 5, tx = -Math.sin(a), ty = Math.cos(a);
          const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
          if (y > 520) continue;
          ctx.globalAlpha = 0.85 * fade * (1 - solid) * (0.5 + h * 0.5); ctx.strokeStyle = h2 < 0.5 ? '#8e8aa3' : '#f2f0f6'; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(x - tx * len / 2, y - ty * len / 2); ctx.lineTo(x + tx * len / 2, y + ty * len / 2); ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  SCENES.title = { id: 'title', combat: false, mood: 'moonlit bell', sway: 8, focus: TITLE_FOCUS, items: [
    layer('sky', full(0, 560), 0.02, titleSky),
    layer('moonclouds', { x: 0, y: 150, w: DW, h: 300 }, 0.03, (g) => {
      [[240, 236, 420, 1], [700, 318, 520, 2], [1100, 214, 380, 3], [520, 168, 340, 4]].forEach((c) => wrapDraw(c[0], c[2] * 0.6, (x) => {
        for (let k = 0; k < 4; k++) tk.inkPath(g, [[x - c[2] / 2, c[1] + k * 5], [x - c[2] * 0.15, c[1] - 3 + k * 6], [x + c[2] * 0.2, c[1] + 2 + k * 5], [x + c[2] / 2, c[1] - 4 + k * 6]], { w: 11 - k * 2, color: A(k < 2 ? '#1c1450' : '#3a2c8a', 0.5 - k * 0.07), taper: 0.42, wobble: 0.5, seed: c[3] * 4 + k, pressure: 'mid' });
        tk.inkPath(g, [[x - c[2] * 0.3, c[1] - 7], [x, c[1] - 9], [x + c[2] * 0.3, c[1] - 6]], { w: 1.6, color: A('#c8b8ff', 0.6), taper: 0.4, wobble: 0.3, seed: c[3] });
      }));
    }, { scroll: 1.6, alpha: 0.95 }),
    anim((ctx, T) => { twinkle(ctx, T, { key: 'title', n: 46, h: 400 }); }),
    layer('mountains', full(200, 400), 0.06, titleMountains),
    mistLayer('title-mistFar', 400, 170, '#a890ff', 0.4, 5, 0.08, 21),
    layer('cliff', full(420, 300), 0.1, titleCliff),
    anim((ctx, T) => {
      toroGlow(ctx, T);
      const p = 0.85 + 0.15 * Math.sin(T.tt * 1.1);
      addMode(ctx, () => { glowE(ctx, 640 - T.par * 0.1, 486, 520, 120, '#ffd98a', (T.o.rung ? 0.4 : 0.26) * p); glowE(ctx, 640 - T.par * 0.1, 478, 260, 60, '#fff2c8', (T.o.rung ? 0.4 : 0.26) * p); });
    }),
    layer('belfry', { x: 340, y: 236, w: 600, h: 276 }, 0.1, titleBelfry),
    layer('bell', { x: 540, y: 284, w: 340, h: 200 }, 0.1, (g, rr, T) => titleBellBody(g, !!T.o.rung), { vary: (T) => (T.o.rung ? 'rung' : 'bound'), rot: bellSwing, pivot: [BELL.cx, BELL.pivotY] }),
    layer('threads', { x: 400, y: 316, w: 480, h: 190 }, 0.1, titleThreads, { alpha: (T) => (T.o.rung ? 0 : 1) }),
    anim(titleRing),
    layer('beam', full(0, 540), 0.1, titleBeam, { add: true, alpha: (T) => (0.75 + 0.25 * Math.sin(T.tt * 0.9)) * (T.o.rung ? 1 : 0.55) }),
    anim((ctx, T) => {
      const gl = [noteSpr(0), noteSpr(1), noteSpr(2), noteSpr(3), noteSpr(4)];
      drift(ctx, T, { key: 'title-notes', n: 16, sprs: gl, area: { x: 540, y: 0, w: 200, h: 470 }, vx: 0, vy: -34, sway: 40, size: [20, 34], aspect: 1, spin: 0.3, wob: 0.4, alpha: [0.6, 1], add: true });
      addMode(ctx, () => { const p = 0.7 + 0.3 * Math.sin(T.tt * 2.2); glowAt(ctx, 640 - T.par * 0.1, 400, 70 * p, '#ffe0a0', T.o.rung ? 0.42 : 0.22); });
      tk.sparkle(ctx, 684 - T.par * 0.1, 326, (T.o.rung ? 15 : 10) + 4 * Math.sin(T.tt * 2.6), { color: '#fffbe8', alpha: 0.9, glow: 0.6 });
    }),
    anim((ctx, T) => {
      fireflies(ctx, T, { key: 'title-ff1', n: 16, area: { x: 270, y: 380, w: 760, h: 150 }, color: '#d8ff7a', size: 13 });
      fireflies(ctx, T, { key: 'title-ff2', n: 8, area: { x: 60, y: 300, w: 1160, h: 280 }, color: '#8ff0ff', size: 11, speed: 0.7 });
    }),
    layer('fgL', { x: 0, y: 0, w: 330, h: DH }, 1, (g) => titleFg(g, -1)),
    layer('fgR', { x: 950, y: 0, w: 330, h: DH }, 1, (g) => titleFg(g, 1)),
    layer('sakura', { x: 960, y: 0, w: 330, h: 300 }, 1.0, titleSakura),
    swayer(1, () => fanSprite('t0', PI / 2, 2.2, '#150e34', '#1c1444', '#070416', '#9a88ff', 21), 190 - 95, 100, 190, 190, 95, 30, 0.07, 0.13, 0),
    anim((ctx, T) => {
      drift(ctx, T, { key: 'title-petals', n: 26, sprs: [petalSpr('#ffc2dc', 0), petalSpr('#ff9cc6', 1), petalSpr('#fff0f6', 2)], area: { x: 0, y: 0, w: DW, h: DH }, vx: -46, vy: 30, sway: 40, size: [12, 24], aspect: 1, tumble: true, spin: 0.7, alpha: [0.75, 1] });
    }),
    layer('hushA', full(0), 0, (g) => titleHush(g, 1, 3), { q: 0.7 }),
    layer('hushB', full(0), 0, (g) => titleHush(g, 1.16, 7), { q: 0.7, alpha: (T) => 0.5 + 0.5 * Math.sin(T.tt * 0.27) }),
    vigLayer('title-vig', { color: '#05030f', alpha: 0.6, inner: 0.32 }),
    anim((ctx, T) => { if (T.o.logo) logoDraw(ctx, 640, 172, 740, T.t); }),
    grain(0.3),
  ] };


  // ===============================================================================================================
  // CHAPTER 2: the Sunken Lantern City. A haunted canal town at night: indigo sky, a far skyline, machiya along the far bank with lit windows
  // and a red arched bridge, black water full of wobbling reflections and floating lanterns, strings of paper lanterns overhead, drifting
  // ofuda charms and pale ghost flames. The quay (ground plane, y = 520) is dark wet stone.
  // ===============================================================================================================
  const C2 = { bank: 372, quay: 505 };
  const C2_PAL = (boss) => (boss
    ? { lan: ['#b06aff', '#5ff5d0', '#8a5aff', '#ff5a8a'], glow: '#a070ff', win: '#c090ff', moon: '#ff4a5a', flame: '#a0ffe8' }
    : { lan: ['#e8383d', '#ff9a2e', '#ff6a3a', '#ffb84a'], glow: '#ff9a3a', win: '#ffb84a', moon: '#e8f0ff', flame: '#9ff0ff' });
  let C2LAN = null;
  function c2Lanterns() {
    if (C2LAN) return C2LAN;
    const out = [], r = R('c2lan');
    [{ y0: 66, y1: 52, sag: 62, n: 11, r: 19, f: 0.5, st: 0 }, { y0: 178, y1: 192, sag: 34, n: 15, r: 11, f: 0.3, st: 1 }].forEach((s) => {
      for (let i = 0; i < s.n; i++) {
        const u = (i + 0.5 + (r() - 0.5) * 0.25) / s.n, x = -30 + u * (DW + 60), y = lerp(s.y0, s.y1, u) + s.sag * 4 * u * (1 - u);
        out.push({ x, y, r: s.r * (0.9 + 0.2 * r()), f: s.f, st: s.st, ci: Math.floor(r() * 4), ph: r() * TAU, fq: 0.5 + r() * 0.7 });
      }
    });
    C2LAN = out;
    return out;
  }
  function c2Rope(g, s) {
    const pts = [];
    for (let i = 0; i <= 20; i++) { const u = i / 20; pts.push([-30 + u * (DW + 60), lerp(s.y0, s.y1, u) + s.sag * 4 * u * (1 - u)]); }
    tk.inkPath(g, pts, { w: s.st === 0 ? 3 : 2, color: '#0d0b1e', taper: 0.02, wobble: 0.05, pressure: 'flat', step: 10 });
  }

  function c2Sky(g, boss) {
    const pl = C2_PAL(boss);
    fillRectG(g, X0, 0, XW, 470, boss ? [[0, '#06030e'], [0.4, '#180a30'], [0.7, '#3a1250'], [0.9, '#6a1a4a'], [1, '#8a2a50']] : [[0, '#070516'], [0.4, '#141046'], [0.7, '#2d2170'], [0.9, '#5a3a90'], [1, '#7a4a96']]);
    if (!tk.lowQ()) tk.halftoneRamp(g, X0, 210, XW, 200, { d: 9, dir: PI / 2, r0: 0.2, r1: 3.1, color: boss ? '#ff5a8a' : '#a890ff', alpha: 0.15 });
    const r = R('c2stars');
    for (let i = 0; i < 130; i++) { const x = X0 + r() * XW, y = Math.pow(r(), 1.4) * 320, s = 0.6 + r() * 1.3; g.fillStyle = A(r() < 0.2 ? '#ffe9a8' : '#e8e4ff', 0.3 + 0.5 * r()); g.fillRect(x, y, s, s); }
    const mx = boss ? 830 : 1030, my = boss ? 200 : 152, mr = boss ? 118 : 58;
    blob(g, mx, my, mr * 6, mr * 5, pl.moon, boss ? 0.28 : 0.22);
    blob(g, mx, my, mr * 3, mr * 2.6, pl.moon, boss ? 0.36 : 0.4);
    disc(g, mx, my, mr, boss ? '#ff6a70' : '#f4f6ff');
    g.save(); g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.clip();
    g.beginPath(); g.rect(mx - mr * 2, my - mr * 2, mr * 4, mr * 4); g.arc(mx + mr * 0.26, my - mr * 0.2, mr * 1.04, 0, TAU); g.fillStyle = boss ? '#b02a4a' : '#c4ccf0'; g.fill('evenodd');
    const mr2 = R('c2moon');
    for (let i = 0; i < 6; i++) blob(g, mx + (mr2() - 0.5) * mr * 1.3, my + (mr2() - 0.5) * mr * 1.3, mr * (0.1 + 0.16 * mr2()), mr * (0.08 + 0.12 * mr2()), boss ? '#8a1a3a' : '#a8b4d8', 0.5);
    g.restore();
    tk.inkPath(g, tk.ellipsePts(mx, my, mr, mr, 26), { closed: true, w: 3.4, color: pal.ink, align: 0.5, weightVar: 0.7, wobble: 0.1 });
    // thin ink-wash cloud streaks drifting across
    [[300, 120, 380], [840, 260, 420], [1100, 90, 300]].forEach((c, i) => {
      for (let k = 0; k < 3; k++) tk.inkPath(g, [[c[0] - c[2] / 2, c[1] + k * 5], [c[0], c[1] - 3 + k * 5], [c[0] + c[2] / 2, c[1] + 2 + k * 5]], { w: 8 - k * 2, color: A(boss ? '#2a0a30' : '#1c1450', 0.5 - k * 0.1), taper: 0.42, wobble: 0.5, seed: i * 4 + k });
    });
  }

  function c2Far(g, boss) {
    const pl = C2_PAL(boss), roofC = boss ? '#1a0a34' : '#1e1858';
    // two rows of far rooftops, a pagoda and a castle-like tower
    [{ base: 372, hMin: 30, hMax: 78, col: boss ? '#2a1044' : '#2a2270', sd: 3, k: 0.6 }, { base: 384, hMin: 40, hMax: 96, col: roofC, sd: 4, k: 0.8 }].forEach((row, ri) => {
      const r = R('c2far', row.sd);
      let x = X0 - 10;
      while (x < X0 + XW) {
        const w = 44 + r() * 70, h = row.hMin + r() * (row.hMax - row.hMin);
        fillPoly(g, [[x, row.base], [x + w, row.base], [x + w, row.base - h * 0.7], [x, row.base - h * 0.7]], row.col);
        fillPoly(g, [[x - 8, row.base - h * 0.66], [x + w * 0.2, row.base - h], [x + w * 0.8, row.base - h], [x + w + 8, row.base - h * 0.66]], mixc(row.col, '#0d0b1e', 0.25));
        tk.inkPath(g, [[x + w * 0.2, row.base - h], [x + w * 0.8, row.base - h]], { w: 1.4, color: A(boss ? '#ff8ab0' : '#9a8cff', 0.5), taper: 0.3, wobble: 0.05 });
        for (let k = 0; k < 2 + Math.floor(w / 30); k++) if (r() < 0.55) { g.fillStyle = A(pl.win, 0.75); g.fillRect(x + 6 + k * 14 + r() * 4, row.base - h * 0.5 - r() * h * 0.15, 4, 5); }
        x += w + 4 + r() * 22;
      }
    });
    pagoda(g, 470, 380, 210, boss ? '#07020e' : '#07051c', pl.win);
    pagoda(g, 1210, 384, 150, boss ? '#07020e' : '#07051c', pl.win);
    haze(g, 330, 400, boss ? '#7a2a5a' : '#5a3a90', 0, 0.42);
  }

  // a machiya townhouse: x left, base y, width, height; o: floors wall seed lit
  function house(g, x, base, w, h, o) {
    const r = R('house', o.seed), floors = o.floors || 2, roofH = Math.min(h * 0.36, 44), bodyH = h - roofH, fh = bodyH / floors, wall = o.wall || '#1b1554', pl = o.pal;
    fillPoly(g, [[x, base], [x + w, base], [x + w, base - bodyH], [x, base - bodyH]], wall);
    fillPoly(g, [[x + w * 0.8, base], [x + w, base], [x + w, base - bodyH], [x + w * 0.8, base - bodyH]], mixc(wall, o.rim || '#6a5ac8', 0.2));
    for (let f = 0; f < floors; f++) {
      const y1 = base - f * fh, y0 = y1 - fh, bays = Math.max(2, Math.floor(w / 30)), bw = (w - 8) / bays;
      for (let b = 0; b < bays; b++) {
        const bx = x + 4 + b * bw, lit = r() < (o.lit === undefined ? 0.62 : o.lit), wx = bx + 3, wy = y0 + fh * 0.2, ww = bw - 6, wh = fh * 0.5;
        if (lit) {
          blob(g, bx + bw / 2, wy + wh / 2, bw * 0.95, wh * 1.0, pl.win, 0.34);
          g.fillStyle = tk.lin(g, 0, wy, 0, wy + wh, [[0, lite(pl.win, 0.35)], [1, pl.win]]); g.fillRect(wx, wy, ww, wh);
          g.strokeStyle = A('#2a1a20', 0.75); g.lineWidth = 1;
          g.beginPath(); g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + wh); g.moveTo(wx, wy + wh / 2); g.lineTo(wx + ww, wy + wh / 2); g.stroke();
          if (r() < 0.4) { g.fillStyle = A('#1a1020', 0.85); g.beginPath(); g.ellipse(wx + ww * (0.3 + r() * 0.4), wy + wh * 0.72, ww * 0.16, wh * 0.28, 0, 0, TAU); g.fill(); }   // a silhouette at the window
        } else { g.fillStyle = '#0d0a2a'; g.fillRect(wx, wy, ww, wh); g.strokeStyle = A('#3a2f80', 0.6); g.lineWidth = 1; g.strokeRect(wx, wy, ww, wh); }
        g.strokeStyle = A('#0d0b1e', 0.7); g.lineWidth = 1.6; g.strokeRect(wx - 0.5, wy - 0.5, ww + 1, wh + 1);
      }
      fillPoly(g, [[x - 5, y0 + 3], [x + w + 5, y0 + 3], [x + w + 8, y0 - 3], [x - 8, y0 - 3]], mixc(wall, '#0d0b1e', 0.45));   // the little eave between floors
    }
    const ry = base - bodyH;
    fillPoly(g, [[x - 14, ry + 2], [x + w * 0.18, ry - roofH], [x + w * 0.82, ry - roofH], [x + w + 14, ry + 2], [x + w + 8, ry + 9], [x - 8, ry + 9]], o.roof || '#120e3c');
    fillPoly(g, [[x + w * 0.5, ry - roofH], [x + w * 0.82, ry - roofH], [x + w + 14, ry + 2], [x + w + 8, ry + 9], [x + w * 0.5, ry + 9]], mixc(o.roof || '#120e3c', o.rim || '#6a5ac8', 0.16));
    tk.inkPath(g, [[x + w * 0.18, ry - roofH], [x + w * 0.5, ry - roofH - 1], [x + w * 0.82, ry - roofH]], { w: 2, color: A(o.rim || '#8a7aff', 0.7), taper: 0.3, wobble: 0.05 });
    g.strokeStyle = A('#050318', 0.55); g.lineWidth = 1.2;
    for (let k = 1; k < 4; k++) { const yy = ry - roofH + roofH * k / 4 + 2; g.beginPath(); g.moveTo(x + w * 0.18 - k * 3.5, yy); g.lineTo(x + w * 0.82 + k * 3.5, yy); g.stroke(); }
    tk.inkPath(g, { poly: [[x, base], [x, base - bodyH], [x + w, base - bodyH], [x + w, base]] }, { w: 2, color: A('#05030f', 0.8), taper: 0, pressure: 'flat', wobble: 0.05 });
  }

  // the red arched bridge (taiko-bashi) seen from the side: x0..x1 at deck level y, h the arch rise
  function taiko(g, x0, x1, y, h, boss) {
    const red = boss ? '#7a2a9a' : '#e8383d', dk = shd(red, 0.3), n = 26, mid = (x0 + x1) / 2, pts = [];
    for (let i = 0; i <= n; i++) { const u = i / n; pts.push([lerp(x0, x1, u), y - h * 4 * u * (1 - u)]); }
    // under-arch dark and posts
    fillPoly(g, pts.concat([[x1, y + 22], [x0, y + 22]]), '#0d0a26');
    tk.inkPath(g, pts.map((p) => [p[0], p[1] + 18 * Math.sin(PI * (p[0] - x0) / (x1 - x0)) + 6]), { w: 3, color: A('#3a2f80', 0.8), taper: 0.05, wobble: 0.05 });
    tk.inkPath(g, pts, { w: 12, color: '#0d0b1e', taper: 0.02, pressure: 'flat', wobble: 0.04 });
    tk.inkPath(g, pts, { w: 8, color: red, taper: 0.02, pressure: 'flat', wobble: 0.04 });
    tk.inkPath(g, pts.map((p) => [p[0], p[1] + 2.4]), { w: 2.6, color: dk, taper: 0.02, pressure: 'flat', wobble: 0.04 });
    const rail = pts.map((p) => [p[0], p[1] - 26]);
    for (let i = 1; i < n; i += 2) { g.strokeStyle = A('#0d0b1e', 0.9); g.lineWidth = 4.4; g.beginPath(); g.moveTo(pts[i][0], pts[i][1]); g.lineTo(rail[i][0], rail[i][1]); g.stroke(); g.strokeStyle = red; g.lineWidth = 2.6; g.beginPath(); g.moveTo(pts[i][0], pts[i][1]); g.lineTo(rail[i][0], rail[i][1]); g.stroke(); }
    tk.inkPath(g, rail, { w: 8, color: '#0d0b1e', taper: 0.02, pressure: 'flat' });
    tk.inkPath(g, rail, { w: 5, color: red, taper: 0.02, pressure: 'flat' });
    [x0, x1].forEach((px) => { fillPoly(g, [[px - 7, y + 4], [px + 7, y + 4], [px + 5, y - 46], [px - 5, y - 46]], '#0d0b1e'); fillPoly(g, [[px - 4.6, y + 2], [px + 4.6, y + 2], [px + 3.4, y - 44], [px - 3.4, y - 44]], red); disc(g, px, y - 50, 6, boss ? '#c090ff' : '#f5c96a'); });
    return { mid };
  }

  function c2Bank(g, boss) {
    const pl = C2_PAL(boss), r = R('c2bank');
    const walls = boss ? ['#1a0e40', '#221046', '#150a38'] : ['#1b1554', '#221a62', '#161048'];
    let x = X0 - 20, si = 0;
    const gap = [900, 1150];
    while (x < X0 + XW) {
      if (x > gap[0] - 20 && x < gap[1]) { x = gap[1]; continue; }
      const w = 84 + r() * 84, h = 104 + r() * 70;
      if (x + w > gap[0] - 10 && x < gap[0]) { x += w + 6; continue; }
      house(g, x, C2.bank, w, h, { seed: si++, floors: h > 140 ? 3 : 2, wall: walls[si % 3], pal: pl, rim: boss ? '#c060a0' : '#7a6aff', roof: boss ? '#0e0630' : '#120e3c', lit: boss ? 0.45 : 0.64 });
      x += w + 4 + r() * 10;
    }
    taiko(g, gap[0] + 10, gap[1] - 10, C2.bank - 6, 46, boss);
    // stone embankment wall along the whole far bank
    fillPoly(g, [[X0, C2.bank - 6], [X0 + XW, C2.bank - 6], [X0 + XW, C2.bank + 16], [X0, C2.bank + 16]], '#1a1650');
    fillPoly(g, [[X0, C2.bank - 6], [X0 + XW, C2.bank - 6], [X0 + XW, C2.bank - 1], [X0, C2.bank - 1]], mixc('#1a1650', '#9a8cff', 0.25));
    g.strokeStyle = A('#05030f', 0.7); g.lineWidth = 1.4;
    for (let k = X0; k < X0 + XW; k += 34) { g.beginPath(); g.moveTo(k, C2.bank - 1); g.lineTo(k + (k % 3) * 3, C2.bank + 16); g.stroke(); }
    g.beginPath(); g.moveTo(X0, C2.bank + 8); g.lineTo(X0 + XW, C2.bank + 8); g.stroke();
  }

  function c2Water(g, boss) {
    fillRectG(g, X0, C2.bank + 10, XW, C2.quay - C2.bank + 40, boss ? [[0, '#1a0a30'], [0.5, '#0a0618'], [1, '#05030e']] : [[0, '#1c1a64'], [0.45, '#0f1246'], [1, '#080a2a']]);
  }
  function c2WaterTint(g, boss) {
    // the light path of the moon and the glow of the lanterns on the water, plus the darkness under the quay edge
    const mx = boss ? 830 : 1030;
    fillRectG(g, X0, C2.bank + 6, XW, 130, [[0, A(boss ? '#ff4a5a' : '#7a6ad8', boss ? 0.16 : 0.2)], [1, A('#0a0820', 0)]]);
    blob(g, mx - 20, C2.bank + 60, 130, 60, boss ? '#ff4a5a' : '#dfe6ff', boss ? 0.2 : 0.22);
    fillRectG(g, X0, C2.quay - 60, XW, 64, [[0, A('#04020c', 0)], [1, A('#04020c', 0.55)]]);
  }
  function c2Quay(g, boss) {
    const pl = C2_PAL(boss), y0 = C2.quay - 8;
    fillRectG(g, X0, y0, XW, DH - y0 + 4, boss ? [[0, '#2a1a4a'], [0.1, '#1a0f36'], [0.5, '#0c0620'], [1, '#04020c']] : [[0, '#3a3388'], [0.1, '#26206a'], [0.45, '#141040'], [1, '#07051a']]);
    fillPoly(g, [[X0, y0], [X0 + XW, y0], [X0 + XW, y0 + 9], [X0, y0 + 9]], boss ? '#4a2a70' : '#5a4fb0');
    fillPoly(g, [[X0, y0], [X0 + XW, y0], [X0 + XW, y0 + 3], [X0, y0 + 3]], boss ? '#c090ff' : '#b8b0ff');
    tk.inkPath(g, [[X0, y0 + 9], [X0 + XW, y0 + 9]], { w: 2.6, color: pal.ink, taper: 0, pressure: 'flat' });
    const r = R('c2quay');
    // slab courses in perspective: rows get taller and joints wider apart toward the viewer
    let y = y0 + 9, row = 0;
    while (y < DH + 10) {
      const rh = 9 + row * 3.4, k = (y - y0) / 210, jw = 44 + row * 22;
      g.strokeStyle = A('#04020c', 0.55 + 0.2 * Math.min(1, k)); g.lineWidth = 1.4 + row * 0.35;
      g.beginPath(); g.moveTo(X0, y + rh); g.lineTo(X0 + XW, y + rh); g.stroke();
      g.strokeStyle = A(boss ? '#8a6ac8' : '#7a70e0', 0.14);
      g.lineWidth = 1.2; g.beginPath(); g.moveTo(X0, y + rh + 1.6); g.lineTo(X0 + XW, y + rh + 1.6); g.stroke();
      g.strokeStyle = A('#04020c', 0.5); g.lineWidth = 1.4 + row * 0.35;
      const off = (row % 2) * jw / 2 + r() * 8;
      for (let x = X0 + off; x < X0 + XW; x += jw) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + (x - 640) * 0.02, y + rh); g.stroke(); }
      y += rh; row++;
    }
    // puddles catching the lantern light and the sky
    for (let i = 0; i < 9; i++) {
      const x = 80 + i * 145 + (r() - 0.5) * 60, py = 540 + r() * 110, rx = 34 + r() * 60, ry = rx * 0.16;
      g.fillStyle = A(boss ? '#6a3a9a' : '#4a5ad0', 0.34); g.beginPath(); g.ellipse(x, py, rx, ry, 0, 0, TAU); g.fill();
      g.fillStyle = A('#c8d0ff', 0.2); g.beginPath(); g.ellipse(x - rx * 0.2, py - ry * 0.25, rx * 0.55, ry * 0.3, 0, 0, TAU); g.fill();
      if (i % 3 === 0) { g.fillStyle = A(pl.glow, 0.32); g.beginPath(); g.ellipse(x + rx * 0.3, py + ry * 0.1, rx * 0.16, ry * 0.5, 0, 0, TAU); g.fill(); }
    }
    // warm wash of lantern light along the quay edge
    c2Lanterns().filter((l) => l.st === 0).forEach((l) => blob(g, l.x, y0 + 30, 96, 26, pl.lan[l.ci], 0.22));
    // mooring posts with rope
    [[168, 520], [1080, 526]].forEach((m) => {
      fillPoly(g, [[m[0] - 7, m[1] + 6], [m[0] + 7, m[1] + 6], [m[0] + 5, m[1] - 28], [m[0] - 5, m[1] - 28]], '#1a1236');
      fillPoly(g, [[m[0] + 2, m[1] + 6], [m[0] + 7, m[1] + 6], [m[0] + 5, m[1] - 28], [m[0] + 1, m[1] - 28]], '#4a3f9a');
      tk.inkPath(g, { poly: [[m[0] - 7, m[1] + 6], [m[0] - 5, m[1] - 28], [m[0] + 5, m[1] - 28], [m[0] + 7, m[1] + 6]] }, { w: 2.2, color: pal.ink, taper: 0, pressure: 'flat' });
      disc(g, m[0], m[1] - 28, 6, '#2a2060');
      tk.inkPath(g, [[m[0] - 5, m[1] - 20], [m[0] + 6, m[1] - 18], [m[0] - 5, m[1] - 15]], { w: 2.4, color: '#b89a6a', taper: 0.1, wobble: 0.1 });
    });
  }

  function c2Fg(g, side, boss) {
    const pl = C2_PAL(boss), wood = boss ? '#150a30' : '#150f3a', dk = '#05030f', warm = boss ? '#c090ff' : '#ff9a3a';
    if (side < 0) {
      // a timber pillar and roof eave at the far left, lit warm from the lantern hanging beside it
      fillPoly(g, [[-30, -10], [76, -10], [72, DH + 10], [-30, DH + 10]], wood);
      fillPoly(g, [[46, -10], [76, -10], [72, DH + 10], [44, DH + 10]], mixc(wood, warm, 0.22));
      const wr = R('c2pillar');
      for (let k = 0; k < 9; k++) { const x = -20 + k * 10 + wr() * 5, pts = [[x, -10]]; for (let j = 1; j < 6; j++) pts.push([x + (wr() - 0.5) * 5, j * 130]); tk.inkPath(g, pts, { w: 1.2 + wr() * 1.4, color: A(dk, 0.5), taper: 0.3, wobble: 0.2, seed: k, step: 14 }); }
      tk.inkPath(g, [[76, -10], [72, DH / 2], [74, DH + 10]], { w: 3.8, color: dk, taper: 0, pressure: 'flat', wobble: 0.1, step: 12 });
      tk.inkPath(g, [[67, -10], [63, DH / 2], [65, DH + 10]], { w: 1.8, color: A(warm, 0.55), taper: 0, pressure: 'flat', wobble: 0.1, step: 12 });
      [180, 470].forEach((y) => { fillPoly(g, [[-30, y], [78, y], [78, y + 14], [-30, y + 14]], '#0a0620'); fillPoly(g, [[-30, y], [78, y], [78, y + 3], [-30, y + 3]], A(warm, 0.35)); });
      // the eave: a heavy beam, rafter ends beneath it, and the roof edge above
      fillPoly(g, [[-30, 26], [340, 30], [340, 50], [-30, 54]], '#0e0830');
      fillPoly(g, [[-30, 26], [340, 30], [340, 36], [-30, 32]], mixc('#0e0830', warm, 0.3));
      for (let k = 0; k < 8; k++) { const x = 30 + k * 44; fillPoly(g, [[x, 52], [x + 16, 52], [x + 12, 80 - k * 2], [x + 2, 80 - k * 2]], '#0a0624'); fillPoly(g, [[x + 9, 52], [x + 16, 52], [x + 12, 80 - k * 2], [x + 9, 80 - k * 2]], A(warm, 0.22)); }
      tk.inkPath(g, [[-30, 54], [340, 50]], { w: 3.4, color: dk, taper: 0, pressure: 'flat', wobble: 0.06 });
      fillPoly(g, [[-30, -10], [360, -10], [340, 26], [-30, 22]], '#0a0624');
      for (let k = 0; k < 9; k++) { g.strokeStyle = A('#2a2070', 0.6); g.lineWidth = 2; g.beginPath(); g.moveTo(-20 + k * 44, -10); g.quadraticCurveTo(-14 + k * 44, 8, -20 + k * 44 + 8, 24); g.stroke(); }
      fillPoly(g, [[70, 214], [106, 208], [106, 222], [70, 228]], '#2a2060');           // the lantern bracket
      tk.inkPath(g, [[106, 212], [126, 212]], { w: 3, color: '#2a2060', taper: 0, pressure: 'flat' });
    } else {
      // the trunk and branches of a willow at the far right
      const trunk = [[1330, DH + 10], [1288, 560], [1262, 380], [1276, 220], [1236, 80], [1190, -10]];
      tk.inkPath(g, trunk, { w: 72, color: dk, taper: 0, pressure: 'head', wobble: 0.08, seed: 4, step: 10 });
      tk.inkPath(g, trunk, { w: 64, color: wood, taper: 0, pressure: 'head', wobble: 0.08, seed: 4, step: 10 });
      tk.inkPath(g, trunk.map((p) => [p[0] - 14, p[1]]), { w: 16, color: mixc(wood, '#9a8cff', 0.28), taper: 0.1, pressure: 'head', wobble: 0.2, seed: 6, alpha: 0.7, step: 10 });
      const br = [[[1270, 90], [1180, 60], [1090, 70], [1030, 110]], [[1262, 200], [1190, 168], [1120, 176]]];
      br.forEach((b, i) => { tk.inkPath(g, b, { w: 14, color: dk, taper: 0.1, pressure: 'head', wobble: 0.1, seed: i + 9, step: 8 }); tk.inkPath(g, b, { w: 9, color: wood, taper: 0.1, pressure: 'head', wobble: 0.1, seed: i + 9, step: 8 }); });
      // drooping willow fronds
      const r = R('c2willow');
      for (let i = 0; i < 26; i++) {
        const bi = i % 2, bp = br[bi], u = r(), sx = lerp(bp[0][0], bp[bp.length - 1][0], u), sy = lerp(bp[0][1], bp[bp.length - 1][1], u) + Math.sin(u * PI) * -12, len = 90 + r() * 210, sw = (r() - 0.5) * 30;
        const fr = [[sx, sy], [sx + sw * 0.3, sy + len * 0.3], [sx + sw * 0.8, sy + len * 0.65], [sx + sw, sy + len]];
        tk.inkPath(g, fr, { w: 2.6, color: mixc('#0a1a30', '#2a5a5a', r() * 0.5), taper: 0.5, taperStart: 0.02, wobble: 0.15, seed: i, pressure: 'head' });
        for (let k = 1; k < 7; k++) { const t = k / 7, px = sx + sw * t * t, py = sy + len * t; blade(g, px, py, PI / 2 + (r() - 0.5) * 1.1 + (k % 2 ? 0.5 : -0.5), 12 + r() * 12, 2.4, mixc('#123a40', '#2a7a6a', r() * 0.6), { line: 0.8, vein: false, rim: A('#9ff0e0', 0.5) }); }
      }
    }
  }
  function c2Frond(k, boss) {
    return mkSpr('c2frond|' + k + (boss ? 'b' : ''), 120, 260, (g) => {
      const r = R('c2frond', k);
      for (let i = 0; i < 6; i++) {
        const sx = 60 + (i - 2.5) * 12, sw = (r() - 0.5) * 24, len = 150 + r() * 90;
        tk.inkPath(g, [[sx, 0], [sx + sw * 0.3, len * 0.3], [sx + sw * 0.8, len * 0.65], [sx + sw, len]], { w: 2.4, color: '#0e2a34', taper: 0.5, taperStart: 0.02, wobble: 0.15, seed: i + k * 7, pressure: 'head' });
        for (let j = 1; j < 8; j++) { const t = j / 8; blade(g, sx + sw * t * t, len * t, PI / 2 + (r() - 0.5) * 1.1 + (j % 2 ? 0.5 : -0.5), 12 + r() * 10, 2.3, mixc('#123a40', '#2a7a6a', r() * 0.6), { line: 0.8, vein: false, rim: A('#9ff0e0', 0.5) }); }
      }
    });
  }

  function c2Items(id, boss) {
    const sk = id, pl = C2_PAL(boss);
    const L = (name, rect, f, draw, o) => layer(name, rect, f, draw, Object.assign({ sk }, o));
    const lanterns = c2Lanterns();
    const bank = L('bank', full(160, 232), 0.3, (g) => c2Bank(g, boss));
    const lanSpr = (l) => mkSpr('c2lan|' + boss + '|' + l.ci + '|' + Math.round(l.r), l.r * 4, l.r * 4.6, (g) => { chochin(g, l.r * 2, l.r * 0.9, l.r, pl.lan[l.ci], { rim: lite(pl.lan[l.ci], 0.6), mark: l.st === 0 && l.ci % 2 ? '#fff4d0' : null }); });
    const items = [
      L('sky', full(0, 470), 0.02, (g) => c2Sky(g, boss)),
      anim((ctx, T) => { twinkle(ctx, T, { key: 'ch2', n: 40, h: 300 }); }),
      L('far', full(120, 330), 0.08, (g) => c2Far(g, boss)),
      mistLayer(sk + 'mistFar', 300, 130, boss ? '#a0407a' : '#7a6ad8', boss ? 0.28 : 0.2, 4, 0.1, 31),
      bank,
      L('water', { x: 0, y: C2.bank + 8, w: DW, h: 160 }, 0, (g) => c2Water(g, boss)),
      reflectAnim(bank, C2.bank + 8, 130, boss ? 0.5 : 0.62, { amp: 5 }),
      L('watertint', { x: 0, y: C2.bank + 4, w: DW, h: 170 }, 0, (g) => c2WaterTint(g, boss), { q: 0.5 }),
      anim((ctx, T) => {
        // lantern reflection columns and floating lanterns on the water
        addMode(ctx, () => {
          lanterns.filter((l) => l.st === 0).forEach((l) => { const fl = 0.8 + 0.2 * Math.sin(T.tt * 2.2 * l.fq + l.ph); glowE(ctx, l.x - T.par * l.f, C2.bank + 66, 14 * fl, 58, pl.lan[l.ci], 0.34 * fl); });
        });
        const fl = pset('c2float', 8, (r) => ({ x: r(), y: r(), sp: 0.6 + r() * 0.8, ph: r() * TAU, ci: Math.floor(r() * 4) }));
        const n = Math.round(8 * Math.max(0.4, T.pf)), fl2 = [];
        for (let i = 0; i < n; i++) {
          const p = fl[i], x = wrapv(p.x * DW + T.tt * 9 * p.sp, -40, DW + 80), y = C2.bank + 40 + p.y * 84 + Math.sin(T.tt * 0.8 + p.ph) * 2, s = 0.7 + 0.5 * p.y;
          ctx.save(); ctx.translate(x, y + 4); ctx.rotate(Math.sin(T.tt * 0.9 + p.ph) * 0.05);
          fillPoly(ctx, [[-13 * s, 0], [13 * s, 0], [10 * s, -12 * s], [-10 * s, -12 * s]], A('#1a1236', 0.95));
          fillPoly(ctx, [[-9 * s, -1], [9 * s, -1], [7 * s, -10 * s], [-7 * s, -10 * s]], pl.lan[p.ci]);
          ctx.restore();
          fl2.push(x, y, s, p.ci);
        }
        addMode(ctx, () => { for (let i = 0; i < fl2.length; i += 4) { glowAt(ctx, fl2[i], fl2[i + 1] - 4 * fl2[i + 2], 24 * fl2[i + 2], pl.lan[fl2[i + 3]], 0.6); glowE(ctx, fl2[i], fl2[i + 1] + 14 * fl2[i + 2], 12 * fl2[i + 2], 24 * fl2[i + 2], pl.lan[fl2[i + 3]], 0.35); } });
      }),
      mistLayer(sk + 'mistWater', 396, 120, boss ? '#8a3a90' : '#6a5ad0', boss ? 0.34 : 0.3, 7, 0.4, 32, { bob: [3, 0.4, 1] }),
      L('quay', { x: 0, y: C2.quay - 10, w: DW, h: DH - C2.quay + 10 }, 0, (g) => c2Quay(g, boss)),
      L('ropes', full(30, 200), 0.4, (g) => { c2Rope(g, { y0: 66, y1: 52, sag: 62, st: 0 }); c2Rope(g, { y0: 178, y1: 192, sag: 34, st: 1 }); }),
      anim((ctx, T) => {
        const fls = [];
        lanterns.forEach((l) => {
          const fl = 0.78 + 0.22 * Math.sin(T.tt * 3.1 * l.fq + l.ph) * Math.sin(T.tt * 1.3 + l.ph * 2), sw = Math.sin(T.tt * l.fq * 1.4 + l.ph) * 0.045 * T.mot, x = l.x - T.par * l.f;
          ctx.save(); ctx.translate(x, l.y); ctx.rotate(sw);
          ART.blit(ctx, lanSpr(l), -l.r * 2, -l.r * 0.9, l.r * 4, l.r * 4.6);
          ctx.restore();
          fls.push(x, l.y + l.r * 1.05, l.r, fl, l.ci);
        });
        addMode(ctx, () => { for (let i = 0; i < fls.length; i += 5) { glowAt(ctx, fls[i], fls[i + 1], fls[i + 2] * 3.6 * fls[i + 3], pl.lan[fls[i + 4]], 0.62 * fls[i + 3]); glowAt(ctx, fls[i], fls[i + 1], fls[i + 2] * 1.1, '#fff0c8', 0.55 * fls[i + 3]); } });
      }),
      L('fgL', { x: 0, y: 0, w: 340, h: DH }, 1, (g) => c2Fg(g, -1, boss)),
      L('fgR', { x: 960, y: 0, w: 320, h: DH }, 1, (g) => c2Fg(g, 1, boss)),
      swayer(1, () => mkSpr('c2pillarlan|' + boss, 100, 116, (g) => { chochin(g, 50, 16, 24, pl.lan[1], { rim: '#ffe0a0', mark: '#fff4d0' }); }), 76, 194, 100, 116, 50, 0, 0.06, 0.2, 0),
      anim((ctx, T) => { addMode(ctx, () => { const f = 0.85 + 0.15 * Math.sin(T.tt * 5.3) * Math.sin(T.tt * 2.1); glowAt(ctx, 126 - T.par, 244, 118 * f, pl.lan[1], 0.62 * f); glowAt(ctx, 126 - T.par, 244, 30, '#fff0c8', 0.6 * f); }); }),
      swayer(1, () => c2Frond(0, boss), 1060, 40, 120, 260, 60, 0, 0.05, 0.12, 0),
      swayer(1, () => c2Frond(1, boss), 1140, 30, 120, 260, 60, 0, 0.05, 0.1, 1.7),
      anim((ctx, T) => {
        fireflies(ctx, T, { key: sk + 'hito', n: 7, area: { x: 100, y: 280, w: 1080, h: 250 }, color: pl.flame, core: '#ffffff', size: 22, speed: 0.6 });
        drift(ctx, T, { key: sk + 'charms', n: 10, sprs: [charmSpr(0), charmSpr(1), charmSpr(2)], area: { x: 0, y: 30, w: DW, h: 660 }, vx: -26, vy: -10, sway: 30, size: [17, 26], aspect: 1.55, tumble: true, spin: 0.5, alpha: [0.7, 1], wob: 0.35 });
      }),
    ];
    if (boss) items.push(...bossOverlay(sk, { cx: 1120, cy: 330, top: '#4a2a70', mid: '#8a6a9a', speed: 0.13, line: '#c090ff', ember: '#b06aff', ember2: '#5ff5d0', embers: 30 }), webLayer(sk + 'web'), spiders(sk));
    items.push(vigLayer(sk + 'vig', { color: boss ? '#0a0410' : '#05030f', alpha: boss ? 0.6 : 0.5, hud: boss ? 0.86 : 0.72, hudColor: '#03020a' }));
    if (boss) items.push(inkFrame(sk + 'frame', { seed: 5, th: 34, color: '#06020e' }));
    items.push(grain(0.28));
    return items;
  }
  SCENES.ch2 = { id: 'ch2', combat: true, cap: 1.5, mood: 'lantern city at night', sway: 6, items: c2Items('ch2', false) };


  // ===============================================================================================================
  // CHAPTER 3: the Crimson Sky Citadel, the soundless storm: lightning without thunder. A fortress on a floating rock above a crimson cloud sea; floating
  // stones, lightning, grey felt scraps and cotton tufts drifting, and hush rifts ripping the sky. The ground plane (y = 520) is a cracked stone
  // causeway with a dim rune circle.
  // ===============================================================================================================
  const C3 = { horizon: 452 };
  const C3_PAL = (boss) => (boss
    ? { sky: [[0, '#08040e'], [0.35, '#240a26'], [0.62, '#5a1636'], [0.84, '#a82a40'], [1, '#e0503c']], cloud: '#5a1a3a', cloudShade: '#1c0a20', cloudLit: '#ff5a4a', sea: '#8a1a3a', seaLit: '#ff9060', seaShade: '#3a0a24', stone: '#3a1a36', bolt: '#ffffff', glow: '#ff5a4a' }
    : { sky: [[0, '#12061e'], [0.3, '#3a0f34'], [0.55, '#7a1a44'], [0.78, '#c8384a'], [1, '#ff7a50']], cloud: '#4a1a48', cloudShade: '#200a2c', cloudLit: '#ff7a6a', sea: '#b02a4a', seaLit: '#ffb878', seaShade: '#5a1238', stone: '#3a2050', bolt: '#a8c8ff', glow: '#ff7a50' });

  // a jagged hush rift in the sky: cx, cy centre, len, w max width, ang tilt; grey ash and frost showing through. Returns its edges and a way to place a
  // point inside it (local u along 0..1, v across -1..1) for the live flicker.
  function voidTear(g, cx, cy, len, w, ang, seed, boss) {
    const r = R('tear', seed), n = 30, L = [], Rr = [];
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (let i = 0; i <= n; i++) {
      const u = i / n, prof = Math.pow(Math.sin(PI * u), 0.7) * w * 0.5, along = (u - 0.5) * len;
      const j1 = (r() - 0.5) * w * 0.5 * (i % 2 ? 1 : 0.4), j2 = (r() - 0.5) * w * 0.5 * (i % 2 ? 0.4 : 1), j3 = (r() - 0.5) * len * 0.018;
      L.push([cx + ca * (along + j3) - sa * (-prof + j1), cy + sa * (along + j3) + ca * (-prof + j1)]);
      Rr.push([cx + ca * (along + j3) - sa * (prof + j2), cy + sa * (along + j3) + ca * (prof + j2)]);
    }
    const outline = L.concat(Rr.slice().reverse());
    g.save(); g.translate(0, 0);
    blob(g, cx, cy, len * 0.6, w * 2.2, boss ? '#e0c8d4' : '#cfcdd8', 0.35);
    g.beginPath(); tk.trace(g, { poly: outline });
    g.fillStyle = tk.rad(g, cx, cy, 2, cx, cy, len * 0.5, [[0, '#d4d2de'], [0.6, '#b4b1c4'], [1, '#8e8aa3']]); g.fill();
    g.save(); g.clip();
    for (let i = 0; i < 30; i++) {                                    // thirty static ash and frost dashes baked inside the rift
      const k = 1 + Math.floor(r() * (n - 1)), v = 0.12 + r() * 0.76, px = lerp(L[k][0], Rr[k][0], v), py = lerp(L[k][1], Rr[k][1], v);
      g.fillStyle = i % 2 ? A('#f2f0f6', 0.85) : A('#5a566e', 0.55); g.fillRect(px, py, 3 + r() * 4, 1.1);
    }
    g.restore();
    tk.inkPath(g, L, { w: 3, color: pal.ink, taper: 0.02, wobble: 0.3, seed: seed, weightVar: 0.5, pressure: 'flat', step: 4 });
    tk.inkPath(g, Rr, { w: 3, color: pal.ink, taper: 0.02, wobble: 0.3, seed: seed + 1, weightVar: 0.5, pressure: 'flat', step: 4 });
    g.restore();
    return { top: L[Math.floor(n / 2)], L, R: Rr };
  }
  // where inside a rift (cx, cy, len, w, ang) the point (u along 0..1, v across -1..1) falls
  function riftPoint(cx, cy, len, w, ang, u, v) {
    const along = (u - 0.5) * len, across = v * Math.pow(Math.sin(PI * u), 0.7) * w * 0.4;
    return [cx + Math.cos(ang) * along - Math.sin(ang) * across, cy + Math.sin(ang) * along + Math.cos(ang) * across];
  }

  function c3Sky(g, boss) {
    const pl = C3_PAL(boss);
    fillRectG(g, X0, 0, XW, 480, pl.sky);
    if (!tk.lowQ()) tk.halftoneRamp(g, X0, 230, XW, 230, { d: 9, dir: PI / 2, r0: 0.2, r1: 3.2, color: boss ? '#ff3a4a' : '#ff5a7a', alpha: 0.2 });
    const r = R('c3stars');
    for (let i = 0; i < 60; i++) { const x = X0 + r() * XW, y = Math.pow(r(), 1.5) * 230, s = 0.6 + r() * 1.2; g.fillStyle = A('#ffd8d0', 0.15 + 0.35 * r()); g.fillRect(x, y, s, s); }
    blob(g, 760, 470, 760, 260, pl.glow, boss ? 0.5 : 0.62);
    blob(g, 760, 470, 380, 130, '#ffd0a0', 0.4);
  }
  function c3Storm(g, boss) {
    const pl = C3_PAL(boss);
    [[150, 60, 460, 84, 1], [560, 34, 500, 80, 2], [930, 70, 480, 84, 3], [1250, 40, 400, 76, 4], [340, 200, 320, 52, 5], [1100, 236, 360, 50, 6]].forEach((c) => wrapDraw(c[0], c[2] * 0.6, (x) => {
      streak(g, x, c[1] + c[3] * 0.5, c[2] * 1.3, c[3], boss ? '#ff4a5a' : '#ff6a7a', 0.24, c[4]);
      cloud(g, x, c[1], c[2], c[3], { seed: c[4], base: pl.cloud, shade: pl.cloudShade, lit: pl.cloudLit, flat: false, line: 0, light: -0.4 });
    }));
  }
  function c3Sea(g, boss) {
    const pl = C3_PAL(boss), r = R('c3sea');
    fillRectG(g, X0, C3.horizon - 30, XW, 260, [[0, A(pl.sea, 0)], [0.25, pl.seaShade], [1, mixc(pl.seaShade, '#100418', 0.6)]]);
    for (let row = 0; row < 6; row++) {
      const y = C3.horizon - 8 + row * 15, n = 5 + row;
      for (let i = 0; i < n; i++) {
        const cx = X0 + (i + r() * 0.6) / n * XW, w = 240 + r() * 200 + row * 40, h = 46 + row * 6 + r() * 26;
        cloud(g, cx, y + (r() - 0.5) * 6, w, h, { seed: row * 20 + i, base: mixc(pl.sea, pl.seaShade, row * 0.09), shade: pl.seaShade, lit: mixc(pl.seaLit, pl.sea, row * 0.1), flatY: 0.2, line: 0, light: -0.35 });
      }
    }
    haze(g, C3.horizon - 20, C3.horizon + 40, pl.glow, 0.3, 0);
  }
  function c3Rock(g, w, h, seed, boss) {
    const pl = C3_PAL(boss), r = R('c3rock', seed), rimc = boss ? '#ff6a5a' : '#ff9a70';
    // silhouette: a flat-topped slab with a jagged, tapering underside
    const top = [[w * 0.05, h * 0.2], [w * 0.3, h * 0.13], [w * 0.62, h * 0.16], [w * 0.95, h * 0.22]];
    const under = [[w * 0.88, h * 0.4], [w * 0.74, h * 0.62], [w * 0.6, h * 0.66], [w * 0.52, h * 0.94], [w * 0.4, h * 0.7], [w * 0.28, h * 0.74], [w * 0.16, h * 0.5]];
    const pts = top.concat(under);
    tk.celFill(g, { poly: pts }, pl.stone, { line: Math.max(2.4, w * 0.024), depth: h * 0.1, rim: rimc, rimSide: 'shadow', rimW: 2.6, rimAlpha: 0.85, hi: 'auto', hiW: 2, halftone: true, shadow: shd(pl.stone, 0.3), align: 0.5 });
    // facet planes: hard-edged lighter and darker polygons on the face
    fillPoly(g, [top[1], top[2], [w * 0.6, h * 0.5], [w * 0.36, h * 0.44]], A(mixc(pl.stone, rimc, 0.22), 0.55));
    fillPoly(g, [top[2], top[3], under[0], [w * 0.66, h * 0.52]], A('#05020a', 0.35));
    fillPoly(g, [top[0], top[1], [w * 0.36, h * 0.44], under[6]], A('#05020a', 0.25));
    for (let i = 0; i < 4; i++) { const x = w * (0.2 + 0.18 * i) + (r() - 0.5) * 8, y = h * 0.3; tk.inkPath(g, [[x, y], [x + (r() - 0.5) * 12, y + h * 0.16], [x + (r() - 0.5) * 16, y + h * 0.3]], { w: 1.8, color: A(pal.ink, 0.85), taper: 0.5, wobble: 0.3, seed: i + seed }); }
    // a moss cap on top, and roots hanging from the underside
    tk.inkPath(g, top, { w: 7, color: boss ? '#2a1830' : '#3a5a52', taper: 0.05, wobble: 0.3, pressure: 'flat', seed: seed });
    for (let i = 0; i < 3; i++) { const p = under[1 + i * 2] || under[1]; tk.inkPath(g, [[p[0], p[1] - 4], [p[0] + (r() - 0.5) * 10, p[1] + h * 0.1], [p[0] + (r() - 0.5) * 14, p[1] + h * 0.2]], { w: 2.6, color: A(pal.ink, 0.9), taper: 0.6, taperStart: 0.02, wobble: 0.3, seed: i + seed + 9, pressure: 'head' }); }
    // a couple of loose pebbles beneath
    for (let i = 0; i < 3; i++) tk.celFill(g, tk.ellipsePts(w * (0.3 + i * 0.18), h * (0.94 + (i % 2) * 0.03), w * 0.02, w * 0.016, 7), pl.stone, { line: 1.2, depth: 1.2, hi: false, shadow: shd(pl.stone, 0.3) });
  }
  function c3Citadel(g, boss) {
    const pl = C3_PAL(boss), cx = 700, body = boss ? '#1a0a22' : '#1d0c30', roof = boss ? '#0c0414' : '#100620';
    // the floating rock underneath
    const rock = [[cx - 310, 424], [cx - 240, 440], [cx - 200, 500], [cx - 120, 540], [cx - 70, 606], [cx - 10, 660], [cx + 20, 600], [cx + 80, 560], [cx + 170, 520], [cx + 250, 470], [cx + 320, 424]];
    tk.celFill(g, rock, mixc(pl.stone, '#0c0414', 0.35), { line: 3.4, depth: 22, rim: pl.glow, rimSide: 'shadow', rimW: 3, rimAlpha: 0.75, hi: false, halftone: true, tension: 0.7, shadow: '#0c0414', align: 0.5 });
    const r = R('c3cit');
    for (let i = 0; i < 9; i++) { const x = cx - 220 + r() * 440, y = 450 + r() * 60; tk.inkPath(g, [[x, y], [x + (r() - 0.5) * 30, y + 30 + r() * 40], [x + (r() - 0.5) * 40, y + 70 + r() * 50]], { w: 2, color: A(pal.ink, 0.85), taper: 0.5, wobble: 0.3, seed: i + 70 }); }
    // ramparts with crenellations, then the keep and flanking towers
    fillPoly(g, [[cx - 330, 430], [cx + 330, 430], [cx + 330, 372], [cx - 330, 372]], body);
    for (let x = cx - 330; x < cx + 330; x += 22) fillPoly(g, [[x, 372], [x + 13, 372], [x + 13, 358], [x, 358]], body);
    g.fillStyle = A(pl.glow, 0.5); for (let x = cx - 310; x < cx + 310; x += 44) g.fillRect(x, 392, 5, 12);
    pagoda(g, cx, 372, 330, body, boss ? '#ff4a5a' : '#ff9a4a');
    pagoda(g, cx - 210, 380, 210, body, boss ? '#ff4a5a' : '#ff9a4a');
    pagoda(g, cx + 214, 380, 236, body, boss ? '#ff4a5a' : '#ff9a4a');
    // the gate and a rim of crimson light on the roofs
    fillPoly(g, [[cx - 40, 430], [cx - 40, 396], [cx, 380], [cx + 40, 396], [cx + 40, 430]], '#08030e');
    g.fillStyle = A(pl.glow, 0.5); g.beginPath(); g.moveTo(cx - 26, 430); g.lineTo(cx - 26, 402); g.quadraticCurveTo(cx, 390, cx + 26, 402); g.lineTo(cx + 26, 430); g.fill();
    tk.inkPath(g, [[cx - 330, 372], [cx + 330, 372]], { w: 2, color: A(pl.glow, 0.6), taper: 0.1, wobble: 0.05 });
    // banners
    [[cx - 110, 300], [cx + 118, 296], [cx + 214, 258]].forEach((b, i) => { fillPoly(g, [[b[0], b[1]], [b[0] + 20, b[1] + 6], [b[0] + 20, b[1] + 52], [b[0], b[1] + 46]], boss ? '#3a0a30' : '#7a1230'); tk.inkPath(g, { poly: [[b[0], b[1]], [b[0] + 20, b[1] + 6], [b[0] + 20, b[1] + 52], [b[0], b[1] + 46], [b[0], b[1]]] }, { w: 1.4, color: pal.ink, taper: 0, pressure: 'flat' }); });
    haze(g, 380, 470, pl.glow, 0, 0.32);
  }

  function c3Ground(g, boss) {
    const pl = C3_PAL(boss), y0 = 500;
    // the front edge of the causeway crumbles into the clouds
    const edge = ridgePts(61, X0, X0 + XW, y0, 10, 0.02, { oct: 3, step: 16 });
    fillRidge(g, edge, DH + 10, tk.lin(g, 0, y0 - 10, 0, DH, boss ? [[0, '#3a1a3a'], [0.1, '#2a1030'], [0.5, '#12061a'], [1, '#05020a']] : [[0, '#5a3060'], [0.1, '#3a1c50'], [0.45, '#1c0c30'], [1, '#08040f']]));
    tk.inkPath(g, edge, { w: 3.4, color: pal.ink, taper: 0.02, wobble: 0.2, pressure: 'flat', seed: 4, step: 10 });
    tk.inkPath(g, edge.map((p) => [p[0], p[1] + 2]), { w: 1.6, color: A(boss ? '#ff7a6a' : '#ffb090', 0.8), taper: 0.05, wobble: 0.2, pressure: 'flat', seed: 5, step: 10 });
    const r = R('c3ground');
    // slab courses and cracks
    let y = y0 + 6, row = 0;
    while (y < DH + 10) {
      const rh = 12 + row * 4.4, jw = 64 + row * 28;
      g.strokeStyle = A('#05020a', 0.6); g.lineWidth = 1.6 + row * 0.4;
      g.beginPath(); g.moveTo(X0, y + rh); g.lineTo(X0 + XW, y + rh); g.stroke();
      g.strokeStyle = A(boss ? '#ff7a6a' : '#c88ab0', 0.12); g.lineWidth = 1.2; g.beginPath(); g.moveTo(X0, y + rh + 1.6); g.lineTo(X0 + XW, y + rh + 1.6); g.stroke();
      g.strokeStyle = A('#05020a', 0.5); g.lineWidth = 1.6 + row * 0.4;
      const off = (row % 2) * jw / 2 + r() * 14;
      for (let x = X0 + off; x < X0 + XW; x += jw) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + (x - 640) * 0.03, y + rh); g.stroke(); }
      y += rh; row++;
    }
    for (let i = 0; i < 12; i++) {
      const x = X0 + r() * XW, yy = y0 + 20 + r() * 150, pts = [[x, yy]];
      for (let k = 1; k < 5; k++) pts.push([pts[k - 1][0] + (r() - 0.5) * 70, pts[k - 1][1] + 6 + r() * 26]);
      tk.inkPath(g, pts, { w: 2 + r() * 2, color: A(pal.ink, 0.85), taper: 0.5, wobble: 0.3, seed: i + 50 });
    }
    // a dim rune circle where the fight happens
    g.save(); g.translate(640, 566); g.scale(1, 0.15);
    g.strokeStyle = A(pl.glow, 0.34); g.lineWidth = 12; g.beginPath(); g.arc(0, 0, 470, 0, TAU); g.stroke();
    g.strokeStyle = A(pl.glow, 0.5); g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 486, 0, TAU); g.stroke(); g.beginPath(); g.arc(0, 0, 452, 0, TAU); g.stroke();
    g.fillStyle = A(pl.glow, 0.5);
    for (let i = 0; i < 28; i++) { const a = i / 28 * TAU; g.save(); g.rotate(a); g.fillRect(462, -6, 16, 12); g.restore(); }
    g.restore();
    // a broken parapet silhouetted against the clouds
    for (let i = 0; i < 9; i++) {
      const x = 30 + i * 150 + (r() - 0.5) * 40;
      if (r() < 0.28) continue;
      const h = 22 + r() * 26;
      fillPoly(g, [[x, y0 + 4], [x + 22, y0 + 4], [x + 20, y0 - h], [x + 3, y0 - h + r() * 8]], '#12061a');
      fillPoly(g, [[x + 14, y0 + 4], [x + 22, y0 + 4], [x + 20, y0 - h], [x + 14, y0 - h + 2]], A(boss ? '#ff6a5a' : '#ff9a70', 0.4));
      tk.inkPath(g, { poly: [[x, y0 + 4], [x + 3, y0 - h + 4], [x + 20, y0 - h], [x + 22, y0 + 4]] }, { w: 1.8, color: pal.ink, taper: 0, pressure: 'flat' });
    }
  }

  function c3Fg(g, side, boss) {
    const pl = C3_PAL(boss), dk = '#0a0414', st = boss ? '#2a1230' : '#2c1846', rimc = boss ? '#ff6a5a' : '#ff9a70';
    g.save();
    if (side > 0) { g.translate(DW, 0); g.scale(-1, 1); }
    // a broken fluted pillar with a snapped top and hanging chains
    const px = 62, top = 190;
    fillPoly(g, [[px - 46, DH + 10], [px + 46, DH + 10], [px + 38, top + 30], [px + 30, top - 8], [px + 8, top + 14], [px - 14, top - 24], [px - 36, top + 12], [px - 40, top + 50]], st);
    fillPoly(g, [[px + 10, DH + 10], [px + 46, DH + 10], [px + 38, top + 30], [px + 30, top - 8], [px + 8, top + 14], [px + 6, top + 40]], mixc(st, rimc, 0.22));
    for (let k = -2; k <= 2; k++) tk.inkPath(g, [[px + k * 14, top + 30 + Math.abs(k) * 10], [px + k * 14 + 2, DH]], { w: 2, color: A(dk, 0.7), taper: 0.3, wobble: 0.1, seed: k + 10, step: 12 });
    tk.inkPath(g, [[px - 46, DH + 10], [px - 40, top + 50], [px - 36, top + 12], [px - 14, top - 24], [px + 8, top + 14], [px + 30, top - 8], [px + 38, top + 30], [px + 46, DH + 10]], { w: 4, color: dk, taper: 0, pressure: 'flat', wobble: 0.1, step: 8 });
    tk.inkPath(g, [[px + 30, top - 8], [px + 38, top + 30], [px + 46, top + 200]], { w: 2, color: A(rimc, 0.7), taper: 0.3, wobble: 0.1 });
    // chains: little ink links
    [[px - 6, 10, top - 6], [px + 26, 24, top]].forEach((c, ci) => {
      const x0 = c[0], y0 = -10, y1 = c[2] + 8, n = 16;
      for (let i = 0; i <= n; i++) { const u = i / n, x = x0 + Math.sin(u * 3 + ci) * 6, y = lerp(y0, y1, u); g.save(); g.translate(x, y); g.rotate(i % 2 ? 0 : PI / 2); g.beginPath(); g.ellipse(0, 0, 3.2, 6.2, 0, 0, TAU); g.lineWidth = 2.4; g.strokeStyle = '#0a0414'; g.stroke(); g.lineWidth = 1.2; g.strokeStyle = A('#8a7a9a', 0.9); g.stroke(); g.restore(); }
    });
    // rubble
    for (let i = 0; i < 8; i++) { const x = 20 + i * 24, y = DH - 30 - (i % 3) * 14; fillPoly(g, [[x, y], [x + 22, y - 6], [x + 28, y + 10], [x + 6, y + 16]], mixc(st, '#000000', 0.2)); }
    g.restore();
  }
  // a scrap of grey felt (quilted, with a stitched seam); variant 1 wears a cloth gag bound with cord
  function c3PageSpr(k) {
    return mkSpr('c3felt|' + k, 44, 56, (g) => {
      g.translate(22, 28);
      const r = R('c3felt', k);
      const pts = [[-17, -23], [-3, -24 + r() * 3], [17, -22], [18 - r() * 3, -6], [16, 20 + r() * 3], [4, 24], [-15, 22 - r() * 4], [-18 + r() * 3, 0]];
      tk.celFill(g, pts, '#6e6a7e', { line: 2, depth: 5, hi: false, shadow: '#46425a', tension: 0.15, align: 0.4 });
      g.strokeStyle = A('#cfcdd8', 0.35); g.lineWidth = 0.9; g.beginPath();                    // quilting: crossed diagonals
      for (let i = -3; i <= 3; i++) { g.moveTo(-14, i * 8 - 14); g.lineTo(14, i * 8 + 14); g.moveTo(14, i * 8 - 14); g.lineTo(-14, i * 8 + 14); }
      g.stroke();
      g.setLineDash([3, 2.4]); g.strokeStyle = A('#f2f0f6', 0.7); g.lineWidth = 1; g.beginPath(); g.moveTo(-13, -18); g.lineTo(13, -17); g.lineTo(12, 17); g.lineTo(-12, 16); g.closePath(); g.stroke(); g.setLineDash([]);
      if (k === 1) {                                                                          // the cloth gag and its cord
        g.fillStyle = '#9a96aa'; g.fillRect(-14, -4, 28, 8);
        g.strokeStyle = '#46425a'; g.lineWidth = 2; g.beginPath(); for (let x = -9; x <= 10; x += 6) { g.moveTo(x, -5); g.lineTo(x + 2, 5); } g.stroke();
        g.lineWidth = 1.2; g.strokeRect(-14, -4, 28, 8);
      }
    });
  }
  // a cotton tuft: three cel-filled puffs
  function c3TuftSpr(k) {
    return mkSpr('c3tuft|' + k, 44, 36, (g) => {
      g.translate(22, 20);
      const r = R('c3tuft', k);
      [[-9, 3, 9], [8, 4, 8.5], [0, -5, 10.5]].forEach((p, i) => {
        const jr = 1 + (r() - 0.5) * 0.2;
        tk.celFill(g, tk.ellipsePts(p[0] + (r() - 0.5) * 3, p[1], p[2] * jr, p[2] * 0.86 * jr, 12), i === 2 ? '#f2f0f6' : '#e6e4ee', { line: 1.6, lineColor: '#6e6a7e', depth: 3, hi: false, shadow: '#cfcdd8', tension: 1 });
      });
    });
  }
  function c3RockLayerSpr(k, boss) { return mkSpr('c3fr|' + k + (boss ? 'b' : ''), 190, 150, (g) => { c3Rock(g, 190, 150, 30 + k, boss); }); }
  function dropSpr() {
    return mkSpr('c3drop', 20, 30, (g) => {
      g.translate(10, 18);
      g.beginPath(); g.moveTo(0, -14); g.bezierCurveTo(4, -6, 8, -2, 8, 3); g.arc(0, 3, 8, 0, PI); g.bezierCurveTo(-8, -2, -4, -6, 0, -14); g.closePath();
      g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 1.4; g.strokeStyle = '#b8a8e8'; g.stroke();
      g.fillStyle = A('#d8c8ff', 0.8); g.beginPath(); g.ellipse(2, 5, 3, 4, 0, 0, TAU); g.fill();
    });
  }

  // lightning: a flash of the sky and a forked bolt now and then. Deterministic from t; gentle by design (at most 0.1 alpha overall, none when reduceMotion).
  function lightning(ctx, T, boss, cfg) {
    if (T.mot < 1) return;
    const P = cfg.period, k = Math.floor(T.t / P), ph = T.t - k * P, r = R('bolt', cfg.key, k);
    const off = 1.2 + r() * (P - 2.6), dt = ph - off;
    const tx = 300 + r() * 800, ty = C3.horizon + 10 + r() * 30, ox = tx + (r() - 0.5) * 240;
    if (dt < 0 || dt > 0.9) return;
    const I = Math.exp(-dt * 8) + (dt > 0.16 ? 0.55 * Math.exp(-(dt - 0.16) * 10) : 0);
    const col = boss ? '#ffb0c0' : '#c8d8ff';
    addMode(ctx, () => {
      ctx.globalAlpha = 0.1 * clamp(I, 0, 1); ctx.fillStyle = col; ctx.fillRect(0, 0, DW, C3.horizon + 40);
      glowE(ctx, tx, ty - 40, 300, 160, col, 0.3 * clamp(I, 0, 1));
    });
    if (dt < 0.34) {
      const seed = k * 31 + Math.floor(dt * 24);
      ctx.save(); ctx.globalAlpha = clamp(I * 1.2, 0, 1);
      tk.bolt(ctx, ox, -10, tx, ty, { seed, jag: 46, n: 11, w: 3.4, color: boss ? '#ff7a9a' : '#7a9aff', core: '#ffffff' });
      tk.bolt(ctx, ox + (tx - ox) * 0.35, (ty + 10) * 0.35, tx + (r() - 0.5) * 300, ty - 30, { seed: seed + 5, jag: 30, n: 7, w: 2, color: boss ? '#ff7a9a' : '#7a9aff', core: '#ffffff' });
      ctx.restore();
    }
  }
  function rain(ctx, T, n, col) {
    const cnt = Math.round(n * T.pf);
    if (cnt <= 0) return;
    const P = pset('c3rain', n, (r) => ({ x: r(), y: r(), l: 14 + r() * 26, sp: 0.8 + r() * 0.6 }));
    ctx.save(); ctx.strokeStyle = A(col, 0.2); ctx.lineWidth = 1.2; ctx.beginPath();
    for (let i = 0; i < cnt; i++) {
      const p = P[i], x = wrapv(p.x * DW - T.tt * 190 * p.sp, -40, DW + 80), y = wrapv(p.y * DH + T.tt * 640 * p.sp, -40, DH + 80);
      ctx.moveTo(x, y); ctx.lineTo(x + p.l * 0.29, y - p.l);
    }
    ctx.stroke(); ctx.restore();
  }

  const C3_TEARS = [[210, 92, 250, 44, -0.32, 3], [1060, 70, 320, 52, 0.22, 5]];
  const C3_ROCKS = [[300, 196, 0.86, 0], [560, 132, 0.52, 1], [930, 176, 0.72, 2], [1176, 250, 0.5, 3], [700, 262, 0.3, 4], [90, 300, 0.42, 1]];

  function c3Items(id, boss) {
    const sk = id, pl = C3_PAL(boss);
    const L = (name, rect, f, draw, o) => layer(name, rect, f, draw, Object.assign({ sk }, o));
    const bo = boss ? bossOverlay(sk, { cx: 1120, cy: 320, top: '#4a1a3a', mid: '#8a5a6a', speed: 0.16, line: '#ffe0e0', ember: '#ff4a5a', ember2: '#ffffff', embers: 22 }) : [], bossGrade = bo[0];
    const items = [
      L('sky', full(0, 490), 0.02, (g) => c3Sky(g, boss)),
      L('storm', { x: 0, y: 0, w: DW, h: 310 }, 0.03, (g) => c3Storm(g, boss), { scroll: 3 }),
      L('citadel', { x: 260, y: 240, w: 880, h: 440 }, 0.12, (g) => c3Citadel(g, boss)),
      L('sea', full(380, 340), 0.1, (g) => c3Sea(g, boss)),
      ...(boss ? [bossGrade] : []),
      L('tears', { x: 0, y: 0, w: DW, h: 200 }, 0.05, (g) => { C3_TEARS.forEach((t) => voidTear(g, t[0], t[1], t[2], t[3], t[4], t[5], boss)); }),
      anim((ctx, T) => {
        addMode(ctx, () => { C3_TEARS.forEach((t, i) => { const p = 0.75 + 0.25 * Math.sin(T.tt * 0.9 + i * 2); glowE(ctx, t[0] - T.par * 0.05, t[1], t[2] * 0.7, t[3] * 2.4, boss ? '#e0c8d4' : '#cfcdd8', 0.2 * p); }); });
        // a cheap live flicker: two frost dashes per rift, re-chosen twelve times a second (hashed with the rift's seed)
        const step = Math.floor(T.tt * 12);
        C3_TEARS.forEach((t) => {
          for (let j = 0; j < 2; j++) {
            const h = U.hash('rift', t[5], step, j), p = riftPoint(t[0] - T.par * 0.05, t[1], t[2], t[3], t[4], 0.1 + 0.8 * ((h % 997) / 997), ((h >>> 10) % 1000) / 1000 * 1.4 - 0.7);
            ctx.fillStyle = A('#ffffff', 0.9); ctx.fillRect(p[0], p[1], 3 + (h % 4), 1.4);
          }
        });
      }),
      anim((ctx, T) => {
        C3_ROCKS.forEach((rk, i) => {
          const sp = c3RockLayerSpr(rk[3], boss), s = rk[2], w = 190 * s, h = 150 * s, bob = Math.sin(T.tt * 0.55 + i * 1.7) * 6 * s * T.mot;
          ctx.save(); ctx.translate(rk[0] - T.par * (0.15 + s * 0.2), rk[1] + bob); ctx.rotate(Math.sin(T.tt * 0.3 + i) * 0.03 * T.mot);
          ART.blit(ctx, sp, -w / 2, -h / 2, w, h);
          ctx.restore();
        });
        lightning(ctx, T, boss, { period: 7.3, key: sk });
      }),
      mistLayer(sk + 'mist', 430, 130, boss ? '#ff5a6a' : '#ff8a7a', boss ? 0.3 : 0.34, 8, 0.2, 41),
      L('ground', { x: 0, y: 470, w: DW, h: 250 }, 0, (g) => c3Ground(g, boss)),
      anim((ctx, T) => { addMode(ctx, () => { const p = 0.55 + 0.45 * Math.sin(T.tt * 1.2); ctx.save(); ctx.translate(640, 566); ctx.scale(1, 0.15); ctx.strokeStyle = A(pl.glow, 0.5 * p); ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(0, 0, 470, 0, TAU); ctx.stroke(); ctx.restore(); }); }),
      L('fgL', { x: 0, y: 0, w: 200, h: DH }, 1, (g) => c3Fg(g, -1, boss)),
      L('fgR', { x: 1080, y: 0, w: 200, h: DH }, 1, (g) => c3Fg(g, 1, boss)),
      anim((ctx, T) => {
        drift(ctx, T, { key: sk + 'scraps', n: 5, sprs: [c3PageSpr(0), c3PageSpr(1), c3PageSpr(2)], area: { x: 0, y: 20, w: DW, h: 520 }, vx: -30, vy: 16, sway: 40, size: [24, 40], aspect: 1.27, tumble: true, spin: 0.9, alpha: [0.8, 1], wob: 0.5 });
        drift(ctx, T, { key: sk + 'tufts', n: 7, sprs: [c3TuftSpr(0), c3TuftSpr(1), c3TuftSpr(2)], area: { x: 0, y: 20, w: DW, h: 520 }, vx: -24, vy: 12, sway: 36, size: [22, 36], aspect: 0.82, tumble: true, spin: 0.6, alpha: [0.8, 1], wob: 0.5 });
        drift(ctx, T, { key: sk + 'tears', n: 14, sprs: [dropSpr()], area: { x: 100, y: 20, w: 1100, h: 480 }, vx: -2, vy: 46, sway: 6, size: [9, 15], aspect: 1.5, alpha: [0.5, 0.95], wob: 0.05 });
        drift(ctx, T, { key: sk + 'sparks', n: 24, sprs: [emberSpr(boss ? '#ff4a5a' : '#ff8a4a')], area: { x: 0, y: 200, w: DW, h: 480 }, vx: -18, vy: -30, sway: 20, size: [7, 14], aspect: 1, alpha: [0.4, 0.95], add: true, wob: 0 });
        rain(ctx, T, 70, boss ? '#ffb0c0' : '#c8d8ff');
      }),
    ];
    if (boss) items.push(...c3BossExtras(sk));
    if (boss) items.push(...bo.slice(1));
    items.push(vigLayer(sk + 'vig', { color: boss ? '#07020a' : '#0a0410', alpha: boss ? 0.62 : 0.5, hud: boss ? 0.86 : 0.74, hudColor: '#04010a' }));
    if (boss) items.push(inkFrame(sk + 'frame', { seed: 8, th: 34, color: '#050108' }));
    items.push(grain(0.28));
    return items;
  }
  SCENES.ch3 = { id: 'ch3', combat: true, cap: 1.5, mood: 'storm above the crimson clouds', sway: 6, items: c3Items('ch3', false) };


  // ===============================================================================================================
  // BOSS extras: silk webs and dangling spiderlings for Jorogumo (boss2); a silenced sky, gagged notes on a ghost staff, for the Conductor (boss3).
  // ===============================================================================================================
  function webPaint(g, ax, ay, a0, a1, Rd, n, rings, seed) {
    const r = R('web', seed), silk = '#efe8ff';
    const ang = [], len = [];
    for (let i = 0; i < n; i++) { ang.push(lerp(a0, a1, i / (n - 1)) + (r() - 0.5) * 0.06); len.push(Rd * (0.82 + 0.18 * r())); }
    const P = (i, k) => [ax + Math.cos(ang[i]) * len[i] * k, ay + Math.sin(ang[i]) * len[i] * k];
    for (let i = 0; i < n; i++) { const e = P(i, 1); tk.inkPath(g, [[ax, ay], e], { w: 1.6, color: A(silk, 0.62), taper: 0.25, wobble: 0.1, seed: seed + i, pressure: 'flat' }); }
    for (let k = 1; k <= rings; k++) {
      const kk = 0.14 + 0.86 * k / rings;
      for (let i = 0; i < n - 1; i++) {
        const p = P(i, kk), q = P(i + 1, kk), mid = [(p[0] + q[0]) / 2 + (ax - (p[0] + q[0]) / 2) * 0.16, (p[1] + q[1]) / 2 + (ay - (p[1] + q[1]) / 2) * 0.16];
        tk.inkPath(g, [p, mid, q], { w: 1.1, color: A(silk, 0.5), taper: 0.3, wobble: 0.05, seed: k * 20 + i, pressure: 'flat', step: 6 });
        if (r() < 0.16) { g.fillStyle = A('#ffffff', 0.9); g.beginPath(); g.arc(p[0], p[1], 1.4 + r() * 1.2, 0, TAU); g.fill(); }
      }
    }
  }
  function webLayer(name) {
    return layer(name, full(0, 420), 0.6, (g) => {
      webPaint(g, 1300, -10, PI * 0.5 + 0.12, PI * 1.02, 460, 9, 9, 3);
      webPaint(g, -20, -10, -0.02, PI * 0.46, 330, 8, 8, 9);
      const r = R('strands');
      for (let i = 0; i < 9; i++) { const x = 220 + r() * 800, y1 = 80 + r() * 260; tk.inkPath(g, [[x, -10], [x + (r() - 0.5) * 8, y1 * 0.5], [x, y1]], { w: 1.2, color: A('#efe8ff', 0.4), taper: 0.3, wobble: 0.1, seed: i, pressure: 'flat' }); g.fillStyle = A('#ffffff', 0.9); g.beginPath(); g.arc(x, y1, 1.8, 0, TAU); g.fill(); }
    });
  }
  function spiders(sk) {
    const xs = [[214, 0.0], [660, 1.9], [1010, 3.7]];
    return anim((ctx, T) => {
      xs.forEach((sp, i) => {
        const x = sp[0] - T.par * 0.6, y = 128 + 40 * Math.sin(T.tt * 0.35 + sp[1]) * T.mot + i * 18;
        ctx.save();
        ctx.strokeStyle = A('#efe8ff', 0.6); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, -10); ctx.lineTo(x, y - 8); ctx.stroke();
        ctx.translate(x, y); ctx.scale(1 + i * 0.12, 1 + i * 0.12);
        ctx.strokeStyle = '#05020a'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        for (let k = 0; k < 4; k++) for (const sd of [-1, 1]) { const a = 0.4 + k * 0.42; ctx.beginPath(); ctx.moveTo(sd * 4, 0); ctx.lineTo(sd * (12 + k * 1.4), -6 + k * 5); ctx.lineTo(sd * (16 + k * 2.4), 4 + k * 6 + Math.sin(T.tt * 3 + k + i) * 1.2 * T.mot); ctx.stroke(); }
        ctx.fillStyle = '#05020a'; ctx.beginPath(); ctx.ellipse(0, 3, 6.4, 8, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(0, -6, 4.6, 4.2, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = A('#ffffff', 0.5); ctx.beginPath(); ctx.ellipse(-2, 1, 1.4, 3, 0.3, 0, TAU); ctx.fill();
        ctx.restore();
        addMode(ctx, () => { glowAt(ctx, x - 2, y - 7, 5, '#ff3a5a', 0.9); glowAt(ctx, x + 2, y - 7, 5, '#ff3a5a', 0.9); });
      });
    });
  }

  // a wrapped grey cloth gag with cord bindings (the censor bars): felt, a lit seam, dark cord strokes across
  function gagBar(g, x, y, w, h) {
    g.fillStyle = '#6e6a7e'; g.fillRect(x, y, w, h);
    g.fillStyle = A('#f2f0f6', 0.2); g.fillRect(x, y + 1, w, 2);
    g.strokeStyle = '#46425a'; g.lineWidth = 2; g.beginPath();
    for (let cx = x + 6; cx < x + w - 3; cx += Math.max(10, w / 7)) { g.moveTo(cx, y - 1); g.lineTo(cx + 3, y + h + 1); }
    g.stroke();
    g.strokeStyle = A('#46425a', 0.9); g.lineWidth = 1.2; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  function c3BossExtras(sk) {
    const L = (name, rect, f, draw, o) => layer(name, rect, f, draw, Object.assign({ sk }, o));
    return [
      // a ghost of the music being silenced: a faint five-line staff with note heads, several struck through by gags
      L('ghostpage', { x: 120, y: 20, w: 620, h: 330 }, 0.05, (g) => {
        g.save(); g.translate(430, 190); g.rotate(-0.1); g.translate(-300, -150);
        const ink = A('#f2f0f6', 0.34), top = 96, gap = 26;
        for (let i = 0; i < 5; i++) tk.inkPath(g, [[24, top + i * gap + (i % 2)], [300, top + i * gap - 2], [576, top + i * gap + 1]], { w: 1.8, color: ink, taper: 0.08, wobble: 0.15, seed: i + 3, pressure: 'flat' });
        [24, 576].forEach((x) => tk.inkPath(g, [[x, top - 2], [x + 1, top + gap * 4 + 2]], { w: 2.4, color: ink, taper: 0, pressure: 'flat' }));
        const r = R('ghoststaff'), kinds = ['eighth', 'quarter', 'beamed', 'eighth', 'quarter'];
        for (let i = 0; i < 11; i++) tk.note(g, 66 + i * 46, top + gap * (r() * 4.6) - gap * 0.2, 15, { kind: kinds[i % 5], color: '#f2f0f6', alpha: 0.38, line: 1.8 });
        [[40, top + 14, 176], [250, top + 54, 200], [150, top + 2, 120], [420, top + 38, 150]].forEach((b) => gagBar(g, b[0], b[1], b[2], 15));
        g.restore();
      }, { alpha: 0.9 }),
      L('rip', { x: 380, y: 60, w: 560, h: 240 }, 0.06, (g) => { voidTear(g, 660, 170, 470, 110, -0.12, 17, true); }),
      anim((ctx, T) => { addMode(ctx, () => { const p = 0.7 + 0.3 * Math.sin(T.tt * 0.8); glowE(ctx, 660 - T.par * 0.06, 170, 340, 150, '#d8cfd8', 0.24 * p); }); }),
      // floating cloth gags that drift slowly across the sky
      anim((ctx, T) => {
        const P = pset('c3bars', 6, (r) => ({ x: r(), y: r(), w: 70 + r() * 90, sp: 0.6 + r() * 0.8, ph: r() * TAU }));
        const n = Math.max(2, Math.round(6 * T.pf));
        for (let i = 0; i < n; i++) {
          const p = P[i], x = wrapv(p.x * DW + T.tt * 8 * p.sp, -160, DW + 320), y = 60 + p.y * 300 + Math.sin(T.tt * 0.5 + p.ph) * 8 * T.mot;
          gagBar(ctx, x, y, p.w, 15);
        }
      }),
    ];
  }

  SCENES.boss2 = { id: 'boss2', combat: true, cap: 1.5, mood: 'the spider court by red moon', sway: 5, items: c2Items('boss2', true) };
  SCENES.boss3 = { id: 'boss3', combat: true, cap: 1.5, mood: 'the sky falling silent', sway: 5, items: c3Items('boss3', true) };


  // ===============================================================================================================
  // CAMP: a fire under a giant sakura at night. The trunk on the left throws its limbs across the sky, the canopy is lit warm from below by
  // the fire and cold from above by the moon; sparks, smoke, steam from a kettle, fireflies and falling petals.
  // ===============================================================================================================
  const CAMP = { fx: 610, fy: 588 };
  const LIMBS = [
    { pts: [[300, 640], [312, 520], [292, 420], [270, 330], [230, 240]], w: 108, seed: 1 },
    { pts: [[270, 350], [210, 270], [120, 200], [30, 150], [-40, 96]], w: 46, seed: 2 },
    { pts: [[262, 330], [300, 220], [330, 110], [352, 10], [356, -40]], w: 44, seed: 3 },
    { pts: [[290, 300], [400, 250], [540, 190], [700, 130], [860, 92], [1010, 74], [1200, 30]], w: 38, seed: 4 },
    { pts: [[420, 246], [460, 200], [520, 120], [560, 30]], w: 20, seed: 5 },
    { pts: [[620, 160], [670, 200], [700, 250]], w: 16, seed: 6 },
    { pts: [[880, 90], [920, 160], [960, 210]], w: 14, seed: 7 },
  ];
  function campSky(g) {
    fillRectG(g, X0, 0, XW, 560, [[0, '#070516'], [0.4, '#140e42'], [0.7, '#2b1f6e'], [1, '#4a3288']]);
    if (!tk.lowQ()) tk.halftoneRamp(g, X0, 260, XW, 240, { d: 9, dir: PI / 2, r0: 0.2, r1: 3, color: '#a890ff', alpha: 0.13 });
    const r = R('camp-stars');
    for (let i = 0; i < 120; i++) { const x = X0 + r() * XW, y = Math.pow(r(), 1.3) * 380, s = 0.6 + r() * 1.3; g.fillStyle = A(r() < 0.2 ? '#ffe9a8' : '#e8e4ff', 0.3 + 0.5 * r()); g.fillRect(x, y, s, s); }
    const mx = 1040, my = 200, mr = 64;
    blob(g, mx, my, 420, 340, '#9a86ff', 0.26); blob(g, mx, my, 220, 190, '#ffe9a8', 0.34);
    disc(g, mx, my, mr, '#fff2d2');
    g.save(); g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.clip();
    g.beginPath(); g.rect(mx - mr * 2, my - mr * 2, mr * 4, mr * 4); g.arc(mx + mr * 0.24, my - mr * 0.2, mr * 1.04, 0, TAU); g.fillStyle = '#d6c8ee'; g.fill('evenodd');
    const mr2 = R('camp-moon'); for (let i = 0; i < 6; i++) blob(g, mx + (mr2() - 0.5) * mr * 1.3, my + (mr2() - 0.5) * mr * 1.3, mr * (0.1 + 0.16 * mr2()), mr * (0.08 + 0.12 * mr2()), '#b8a8d0', 0.5);
    g.restore();
    tk.inkPath(g, tk.ellipsePts(mx, my, mr, mr, 26), { closed: true, w: 3.6, color: pal.ink, align: 0.5, weightVar: 0.7, wobble: 0.1 });
  }
  function campHills(g) {
    [{ sd: 41, base: 470, amp: 90, freq: 0.003, top: '#3a2c88', bot: '#5a3f98', a: 0.5 }, { sd: 43, base: 510, amp: 64, freq: 0.0042, top: '#1f1860', bot: '#30257a', a: 0.4 }].forEach((d, i) => {
      const pts = ridgePts(d.sd, X0, X0 + XW, d.base, d.amp, d.freq, { oct: 4 });
      fillRidge(g, pts, 640, tk.lin(g, 0, d.base - d.amp, 0, 640, [[0, d.top], [0.6, d.bot], [1, '#4a3288']]));
      tk.inkPath(g, pts.filter((p) => p[0] > 700), { w: 1.6, color: A('#b8a8ff', 0.5), taper: 0.3, wobble: 0.1, seed: i });
      haze(g, d.base + 10, 620, '#4a3288', 0, d.a);
    });
    // a distant tree line of cedars
    const r = R('camp-cedar');
    for (let x = X0; x < X0 + XW; x += 16 + r() * 20) { const h = 40 + r() * 60, y = 540; fillPoly(g, [[x, y], [x + 9, y - h], [x + 18, y]], '#160f46'); }
  }
  function campGround(g) {
    const ground = ridgePts(88, X0, X0 + XW, 566, 8, 0.012, { oct: 2, step: 20 });
    fillRidge(g, ground, DH + 10, tk.lin(g, 0, 556, 0, DH, [[0, '#24406a'], [0.08, '#1a2e52'], [0.4, '#0e1834'], [1, '#05081a']]));
    const r = R('camp-ground');
    // fallen petals and moonlit grass
    for (let i = 0; i < 300; i++) { const y = 574 + Math.pow(r(), 0.9) * 140, x = X0 + r() * XW, s = 1.4 + r() * 2.6 + (y - 574) * 0.012; g.save(); g.translate(x, y); g.rotate(r() * TAU); g.fillStyle = A(r() < 0.5 ? '#ffb0d0' : '#ff8ab8', 0.6 + 0.3 * r()); g.beginPath(); g.ellipse(0, 0, s * 1.5, s * 0.8, 0, 0, TAU); g.fill(); g.restore(); }
    for (let i = 0; i < 220; i++) { const y = 566 + Math.pow(r(), 1.3) * 150, x = X0 + r() * XW; grass(g, x, y, 6 + (y - 566) * 0.06 + r() * 8, 3, A(r() < 0.5 ? '#2a6a6a' : '#1a4a5a', 0.7), i, 0.2); }
    for (let x = X0; x < X0 + XW; x += 24 + r() * 26) grass(g, x, 570 + (r() - 0.5) * 6, 18 + r() * 24, 4 + Math.floor(r() * 3), r() < 0.5 ? '#1c4a5a' : '#2a6470', Math.round(x), 0.2);
    // the ring of stones and two log seats
    const fx = CAMP.fx, fy = CAMP.fy;
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, x = fx + Math.cos(a) * 76, y = fy + 6 + Math.sin(a) * 20, s = 11 + (i % 3) * 3; tk.celFill(g, tk.ellipsePts(x, y, s * 1.3, s * 0.85, 8), '#5a5488', { line: 2, depth: 3, hi: 'auto', hiW: 1.4, shadow: '#2a2458', rim: '#ffb060', rimSide: 'light', rimW: 1.6, rimAlpha: 0.85, tension: 0.6 }); }
    [[fx - 210, fy + 44, -0.12], [fx + 250, fy + 34, 0.08]].forEach((lg) => {
      const x = lg[0], y = lg[1];
      tk.celFill(g, [[x - 62, y], [x + 62, y - 2], [x + 64, y + 26], [x - 60, y + 28]], '#4a3040', { line: 3, depth: 8, hi: 'auto', shadow: '#241428', rim: '#ffb060', rimSide: 'light', rimW: 2, rimAlpha: 0.7, tension: 0.2 });
      tk.celFill(g, tk.ellipsePts(x + 62, y + 13, 8, 14, 10), '#d0a878', { line: 2.4, depth: 4, hi: false, shadow: '#a07850' });
      tk.inkPath(g, tk.arcPts(x + 62, y + 13, 4, 8, 0, 5, 8), { w: 1.2, color: A('#6a4830', 0.8), taper: 0.3 });
    });
    // logs under the fire, crossed
    [[-0.32, 0], [0.3, 1]].forEach((l) => { g.save(); g.translate(fx, fy + 4); g.rotate(l[0]); tk.celFill(g, [[-58, -8], [58, -9], [60, 8], [-58, 9]], l[1] ? '#5a3a30' : '#4a2c28', { line: 3, depth: 4, hi: 'auto', shadow: '#241018', rim: '#ff9a3a', rimSide: 'light', rimW: 2, rimAlpha: 0.8, tension: 0.2 }); g.restore(); });
  }
  function campTree(g) {
    const bark = '#3a2438', shade = '#1c1028', warm = '#ff9a5a';
    LIMBS.forEach((L) => {
      tk.inkPath(g, L.pts, { w: L.w + 7, color: pal.ink, taper: 0.02, taperStart: 0, pressure: 'head', wobble: 0.1, seed: L.seed, step: 8 });
      tk.inkPath(g, L.pts, { w: L.w, color: bark, taper: 0.02, taperStart: 0, pressure: 'head', wobble: 0.1, seed: L.seed, step: 8 });
      tk.inkPath(g, L.pts.map((p) => [p[0] - L.w * 0.2, p[1]]), { w: L.w * 0.5, color: A(shade, 0.85), taper: 0.02, taperStart: 0, pressure: 'head', wobble: 0.12, seed: L.seed + 3, step: 8 });      // hard shadow on the moon side
      tk.inkPath(g, L.pts.map((p) => [p[0] + L.w * 0.34, p[1]]), { w: L.w * 0.16, color: A(warm, 0.75), taper: 0.1, taperStart: 0.02, pressure: 'head', wobble: 0.12, seed: L.seed + 5, step: 8 });   // firelight rim
    });
    const r = R('camp-bark');
    for (let i = 0; i < 24; i++) { const y = 340 + r() * 290, x = 300 - 50 + r() * 100 - (640 - y) * 0.02; tk.inkPath(g, [[x, y], [x + (r() - 0.5) * 8, y + 24 + r() * 30], [x + (r() - 0.5) * 8, y + 60 + r() * 40]], { w: 1.6 + r() * 1.4, color: A(pal.ink, 0.6), taper: 0.5, wobble: 0.3, seed: i + 60 }); }
    for (let i = 0; i < 6; i++) blob(g, 270 + r() * 60, 480 + r() * 150, 20 + r() * 20, 10 + r() * 10, '#2a5a5a', 0.5);                       // moss
    // roots gripping the ground
    [[[262, 620], [218, 640], [160, 648]], [[338, 622], [384, 640], [440, 644]], [[300, 630], [290, 660], [300, 690]]].forEach((rt, i) => { tk.inkPath(g, rt, { w: 34, color: pal.ink, taper: 0.5, taperStart: 0, pressure: 'head', wobble: 0.1, seed: i }); tk.inkPath(g, rt, { w: 28, color: bark, taper: 0.5, taperStart: 0, pressure: 'head', wobble: 0.1, seed: i }); });
  }
  function campCanopy(g, layerIdx) {
    // blossom masses along the limbs, three tones back to front
    const tones = [
      { base: '#6a2a66', shade: '#361448', lit: '#b05a98', n: 1 },
      { base: '#a24a84', shade: '#5e2064', lit: '#e88ac0', n: 1 },
      { base: '#dc7cae', shade: '#8a3072', lit: '#ffd8ec', n: 1 },
    ];
    const t = tones[layerIdx], r = R('camp-canopy', layerIdx), puffs = [];
    LIMBS.forEach((L) => {
      if (L.w < 14) return;
      const d = tk.flatten(L.pts, { step: 22 }), m = d.length >> 1;
      for (let i = 0; i < m; i += (layerIdx === 2 ? 1 : 2)) {
        if (L.seed === 1 && d[2 * i + 1] > 330) continue;                       // no blossoms on the bare trunk
        const px = d[2 * i], py = d[2 * i + 1], k = 1 + (layerIdx === 2 ? 1 : 0);
        for (let j = 0; j < k; j++) puffs.push({ x: px + (r() - 0.5) * 120, y: py + (r() - 0.55) * 100 + (layerIdx === 0 ? 20 : 0), r: (layerIdx === 0 ? 58 : layerIdx === 1 ? 44 : 32) * (0.45 + 0.95 * r() * r() + 0.2) });
      }
    });
    puffs.sort((a, b) => a.y - b.y);
    if (layerIdx < 2) puffs.forEach((p) => blob(g, p.x - 6, p.y + p.r * 0.7, p.r * 1.5, p.r * 0.9, '#1a0a30', 0.4));
    puffs.forEach((p) => tk.celCircle(g, p.x, p.y, p.r, t.base, { line: layerIdx === 2 ? 1.8 : false, lineColor: '#7a2a5a', depth: p.r * 0.42, shadow: t.shade, rim: t.lit, rimSide: 'light', rimW: Math.max(1.6, p.r * 0.09), rimAlpha: 0.95, hi: false, light: -1.25 }));
    if (layerIdx === 2) puffs.forEach((p) => { for (let k = 0; k < 3; k++) flower(g, p.x + (r() - 0.5) * p.r * 1.5, p.y + (r() - 0.5) * p.r * 1.2, 5 + r() * 4.5, r() * TAU, ['#ffe0ee', '#ffc0dc', '#ffffff', '#f8a0c8'][Math.floor(r() * 4)], { line: '#a03a70' }); });
    if (layerIdx === 1) puffs.forEach((p) => { if (r() < 0.7) flower(g, p.x + (r() - 0.5) * p.r, p.y + (r() - 0.5) * p.r, 5 + r() * 3, r() * TAU, r() < 0.5 ? '#e88ac0' : '#c05a98', { line: '#5a1e5a' }); });
  }
  function campSteamSpr() { return mkSpr('camp|steam', 64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(230,236,255,0.8)'); gr.addColorStop(0.5, 'rgba(210,220,255,0.3)'); gr.addColorStop(1, 'rgba(210,220,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }); }

  // the live flame: layered tongues that sway and stretch
  function flamePaint(ctx, x, y, s, t, ph, small) {
    const layers = small ? [['#e8381e', 1.0, 0.0], ['#ffb830', 0.6, 1.2], ['#fffbe8', 0.26, 2.4]] : [['#e8381e', 1.0, 0.0], ['#ff7a24', 0.84, 0.6], ['#ffb830', 0.62, 1.2], ['#ffe98a', 0.4, 1.8], ['#fffbe8', 0.2, 2.4]];
    layers.forEach((L, li) => {
      for (let k = small ? 0 : -1; k <= (small ? 0 : 1); k++) {
        const side = k !== 0, h = s * L[1] * (side ? 0.62 : 1) * (1 + 0.13 * Math.sin(t * (9 + k * 2) + ph + L[2] + k)), w = s * (side ? 0.2 : 0.34) * L[1] * (1 + 0.06 * Math.sin(t * 6 + k));
        const cx = x + k * s * 0.3, tip = cx + Math.sin(t * 6.5 + ph + L[2] * 0.7 + k * 1.3) * w * 0.55 - k * w * 0.3;
        ctx.beginPath();
        ctx.moveTo(cx - w, y);
        ctx.bezierCurveTo(cx - w * 1.15, y - h * 0.45, tip - w * 0.25, y - h * 0.68, tip, y - h);
        ctx.bezierCurveTo(tip + w * 0.3, y - h * 0.66, cx + w * 1.15, y - h * 0.45, cx + w, y);
        ctx.quadraticCurveTo(cx, y + w * 0.35, cx - w, y);
        ctx.fillStyle = L[0]; ctx.fill();
        if (li === 0) { ctx.lineWidth = 1.6; ctx.strokeStyle = A('#7a1408', 0.65); ctx.stroke(); }
      }
    });
  }
  function kettle(g) {                                              // a tripod with a black iron kettle (tetsubin) hanging over the fire
    const fx = CAMP.fx, fy = CAMP.fy;
    [[-86, -0.34], [0, 0.0], [86, 0.34]].forEach((l, i) => { tk.inkPath(g, [[fx + l[0] * 0.15 + l[1] * 30, fy - 176], [fx + l[0], fy + 18]], { w: i === 1 ? 5 : 6, color: '#0d0810', taper: 0.02, pressure: 'flat', wobble: 0.05 }); tk.inkPath(g, [[fx + l[0] * 0.15 + l[1] * 30 + 1, fy - 176], [fx + l[0] + 1, fy + 18]], { w: 2, color: A('#ff9a3a', 0.6), taper: 0.1, pressure: 'flat' }); });
    tk.inkPath(g, [[fx, fy - 174], [fx, fy - 116]], { w: 3, color: '#0d0810', taper: 0, pressure: 'flat' });
    tk.celFill(g, tk.ellipsePts(fx, fy - 96, 30, 24, 14), '#2a2438', { line: 3, depth: 8, hi: 'auto', hiW: 2, shadow: '#0e0a1a', rim: '#ff9a3a', rimSide: 'light', rimW: 2.4, rimAlpha: 0.9 });
    tk.celFill(g, [[fx - 16, fy - 118], [fx + 16, fy - 118], [fx + 12, fy - 124], [fx - 12, fy - 124]], '#1a1428', { line: 2, depth: 2, hi: false, tension: 0.2 });
    tk.inkPath(g, [[fx + 24, fy - 100], [fx + 40, fy - 108], [fx + 46, fy - 118]], { w: 6, color: '#0d0810', taper: 0.2, pressure: 'flat' });
    tk.inkPath(g, tk.arcPts(fx, fy - 120, 22, 20, PI, PI * 2, 8), { w: 2, color: '#0d0810', taper: 0.1 });
  }

  SCENES.camp = { id: 'camp', combat: false, mood: 'firelight under the sakura', sway: 7, items: [
    layer('sky', full(0, 560), 0.02, campSky),
    anim((ctx, T) => { twinkle(ctx, T, { key: 'camp', n: 40, h: 330 }); }),
    layer('hills', full(300, 340), 0.06, campHills),
    mistLayer('camp-mistFar', 440, 150, '#a890ff', 0.3, 4, 0.08, 51),
    layer('canopyBack', full(-40, 530), 0.12, (g) => campCanopy(g, 0)),
    layer('ground', full(540, 180), 0, campGround),
    layer('tree', { x: 0, y: -60, w: 1280, h: 780 }, 0.28, campTree),
    layer('canopyMid', full(-40, 530), 0.32, (g) => campCanopy(g, 1)),
    layer('kettle', { x: 480, y: 380, w: 260, h: 260 }, 0, kettle),
    anim((ctx, T) => {
      const fl = 0.85 + 0.15 * Math.sin(T.tt * 9.3) * Math.sin(T.tt * 4.1 + 1) + 0.05 * Math.sin(T.tt * 17);
      const fx = CAMP.fx, fy = CAMP.fy;
      // firelight on the ground and the tree, then the flames themselves
      addMode(ctx, () => {
        glowE(ctx, fx, fy + 6, 480, 90, '#ff8a3a', 0.4 * fl);
        glowE(ctx, fx, fy - 40, 420, 300, '#ff7a30', 0.36 * fl);
        glowE(ctx, fx, fy - 30, 180, 130, '#ffc060', 0.45 * fl);
        glowE(ctx, 420, 260, 560, 250, '#ff8a5a', 0.16 * fl);
      });
      flamePaint(ctx, fx, fy, 78, T.tt, 0);
      flamePaint(ctx, fx - 26, fy + 6, 44, T.tt + 1.3, 2.1, true);
      flamePaint(ctx, fx + 28, fy + 6, 50, T.tt + 0.7, 4.2, true);
      addMode(ctx, () => glowAt(ctx, fx, fy - 22, 54 * fl, '#fff0b0', 0.55));
      sparks(ctx, T, { key: 'camp-sparks', n: 34, x: fx, y: fy - 60, spread: 26, rise: 240, life: 3.4, color: '#ff8a2e', hot: '#fff0b0', size: 7, wind: 22 });
      // kettle steam and smoke drifting up
      const st = campSteamSpr(), P = pset('camp-steam', 9, (r) => ({ ph: r(), dx: (r() - 0.5) * 14, sp: 0.6 + r() * 0.5 }));
      const n = Math.max(3, Math.round(9 * T.pf));
      for (let i = 0; i < n; i++) { const p = P[i], u = ((T.tt * 0.16 * p.sp + p.ph) % 1 + 1) % 1, x = fx + 44 + p.dx + Math.sin(T.tt + p.ph * 6) * 8 * u + u * 18, y = fy - 118 - u * 100, s = 12 + u * 34; ART.blit(ctx, st, x - s, y - s, s * 2, s * 2, 0.5 * Math.sin(PI * u)); }
      const sm = pset('camp-smoke', 6, (r) => ({ ph: r(), dx: (r() - 0.5) * 30, sp: 0.5 + r() * 0.5 }));
      for (let i = 0; i < Math.max(2, Math.round(6 * T.pf)); i++) { const p = sm[i], u = ((T.tt * 0.09 * p.sp + p.ph) % 1 + 1) % 1, x = fx + p.dx + u * 90 + Math.sin(T.tt * 0.7 + p.ph * 6) * 20 * u, y = fy - 150 - u * 250, s = 26 + u * 70; ART.blit(ctx, st, x - s, y - s, s * 2, s * 2, 0.22 * Math.sin(PI * u)); }
    }),
    layer('canopyFront', full(-40, 530), 0.6, (g) => campCanopy(g, 2)),
    anim((ctx, T) => {
      addMode(ctx, () => { const fl = 0.85 + 0.15 * Math.sin(T.tt * 9.3) * Math.sin(T.tt * 4.1 + 1); glowE(ctx, 520, 250, 620, 170, '#ff9a6a', 0.2 * fl); });
      drift(ctx, T, { key: 'camp-petals', n: 34, sprs: [petalSpr('#ffc2dc', 0), petalSpr('#ff9cc6', 1), petalSpr('#fff0f6', 2)], area: { x: 0, y: 0, w: DW, h: DH }, vx: -22, vy: 34, sway: 46, size: [12, 24], aspect: 1, tumble: true, spin: 0.7, alpha: [0.75, 1] });
      fireflies(ctx, T, { key: 'camp-ff', n: 14, area: { x: 100, y: 380, w: 1100, h: 260 }, color: '#d8ff7a', size: 12 });
    }),
    vigLayer('camp-vig', { color: '#05030f', alpha: 0.6, inner: 0.3 }),
    grain(0.3),
  ] };


  // ===============================================================================================================
  // SHOP: a lantern-lit peddler stall on a night market street. A tanuki shopkeeper in a straw hat behind the counter (he blinks, breathes and
  // waves now and then), shelves of jars and masks, a tray of glowing gems, strings of paper lanterns and warm steam.
  // ===============================================================================================================
  const SH = { cx: 410, postL: 172, postR: 648, roofY: 236, counter: 476, ground: 560 };
  const SH_LANTERNS = [
    { x: 150, y: 250, r: 26, ci: 0, ph: 0.3, f: 0.16 }, { x: 664, y: 250, r: 26, ci: 1, ph: 1.9, f: 0.16 }, { x: 410, y: 232, r: 22, ci: 3, ph: 3.1, f: 0.16 },
    { x: 60, y: 96, r: 16, ci: 1, ph: 2.2, f: 0.08 }, { x: 300, y: 84, r: 15, ci: 0, ph: 4.0, f: 0.08 }, { x: 540, y: 90, r: 15, ci: 3, ph: 0.9, f: 0.08 }, { x: 790, y: 78, r: 16, ci: 1, ph: 5.1, f: 0.08 },
    { x: 1010, y: 92, r: 15, ci: 0, ph: 2.9, f: 0.08 }, { x: 1230, y: 80, r: 16, ci: 3, ph: 1.4, f: 0.08 },
  ];
  const SH_COLS = ['#e8383d', '#ff9a2e', '#ff6a3a', '#ffb84a'];

  function shopBack(g) {
    fillRectG(g, X0, 0, XW, 600, [[0, '#070516'], [0.35, '#141046'], [0.75, '#2a2070'], [1, '#3a2a86']]);
    const r = R('shop-stars');
    for (let i = 0; i < 70; i++) { const x = X0 + r() * XW, y = r() * 200, s = 0.6 + r() * 1.2; g.fillStyle = A('#e8e4ff', 0.3 + 0.5 * r()); g.fillRect(x, y, s, s); }
    blob(g, 520, 70, 300, 200, '#9a86ff', 0.22);
    disc(g, 520, 74, 34, '#fff2d2'); tk.inkPath(g, tk.ellipsePts(520, 74, 34, 34, 20), { closed: true, w: 3, color: pal.ink, align: 0.5, weightVar: 0.7 });
    // facades: dark townhouses on both sides and a lower row behind the stall
    const rows = [
      { x: -60, w: 250, top: 40, base: 600, wall: '#1a1450', seed: 1 }, { x: 880, w: 240, top: 30, base: 600, wall: '#1c1656', seed: 2 }, { x: 1110, w: 260, top: 80, base: 600, wall: '#161048', seed: 3 },
      { x: 210, w: 200, top: 150, base: 560, wall: '#120e3c', seed: 4 }, { x: 420, w: 220, top: 170, base: 560, wall: '#150f42', seed: 5 }, { x: 630, w: 260, top: 140, base: 560, wall: '#130e3e', seed: 6 },
    ];
    rows.forEach((b) => {
      const rr = R('shop-facade', b.seed), h = b.base - b.top;
      fillPoly(g, [[b.x, b.base], [b.x + b.w, b.base], [b.x + b.w, b.top + 40], [b.x, b.top + 40]], b.wall);
      fillPoly(g, [[b.x + b.w * 0.82, b.base], [b.x + b.w, b.base], [b.x + b.w, b.top + 40], [b.x + b.w * 0.82, b.top + 40]], mixc(b.wall, '#6a5ac8', 0.16));
      // roof
      fillPoly(g, [[b.x - 14, b.top + 46], [b.x + b.w * 0.16, b.top - 4], [b.x + b.w * 0.84, b.top - 4], [b.x + b.w + 14, b.top + 46], [b.x + b.w + 8, b.top + 54], [b.x - 8, b.top + 54]], '#0e0a30');
      tk.inkPath(g, [[b.x + b.w * 0.16, b.top - 4], [b.x + b.w * 0.84, b.top - 4]], { w: 2, color: A('#8a7aff', 0.6), taper: 0.3, wobble: 0.05 });
      // windows in bays
      const bays = Math.floor(b.w / 54), bw = (b.w - 12) / bays;
      for (let fl = 0; fl < Math.max(1, Math.floor((h - 60) / 90)); fl++) for (let k = 0; k < bays; k++) {
        const wx = b.x + 8 + k * bw + 6, wy = b.top + 76 + fl * 88, lit = rr() < 0.34, cold = rr() < 0.3;
        if (lit) { const wc = cold ? '#8a9aff' : '#ffb84a'; blob(g, wx + bw * 0.4, wy + 20, bw * 0.8, 30, wc, 0.2); g.fillStyle = tk.lin(g, 0, wy, 0, wy + 40, [[0, lite(wc, 0.4)], [1, mixc(wc, '#3a2a5a', 0.25)]]); g.fillRect(wx, wy, bw - 12, 40); g.strokeStyle = A('#2a1a20', 0.8); g.lineWidth = 1.2; g.beginPath(); g.moveTo(wx + (bw - 12) / 2, wy); g.lineTo(wx + (bw - 12) / 2, wy + 40); g.moveTo(wx, wy + 20); g.lineTo(wx + bw - 12, wy + 20); g.stroke(); }
        else { g.fillStyle = '#0a0824'; g.fillRect(wx, wy, bw - 12, 40); g.strokeStyle = A('#3a2f80', 0.6); g.lineWidth = 1; g.strokeRect(wx, wy, bw - 12, 40); }
        g.strokeStyle = A('#05030f', 0.75); g.lineWidth = 2; g.strokeRect(wx - 0.5, wy - 0.5, bw - 11, 41);
      }
      tk.inkPath(g, { poly: [[b.x, b.base], [b.x, b.top + 40], [b.x + b.w, b.top + 40], [b.x + b.w, b.base]] }, { w: 2.4, color: A('#05030f', 0.8), taper: 0, pressure: 'flat', wobble: 0.05 });
    });
    haze(g, 400, 580, '#3a2a86', 0, 0.4);
  }

  function jar(g, x, y, s, col, lid) {
    tk.celFill(g, [[x - s * 0.34, y - s * 0.7, 1], [x + s * 0.34, y - s * 0.7, 1], [x + s * 0.5, y - s * 0.3], [x + s * 0.44, y], [x - s * 0.44, y], [x - s * 0.5, y - s * 0.3]], col, { line: Math.max(1.4, s * 0.06), depth: s * 0.14, hi: 'auto', hiW: 1.6, shadow: shd(col, 0.3), rim: '#ffcf80', rimSide: 'light', rimW: 1.4, rimAlpha: 0.8, tension: 0.4 });
    tk.celFill(g, [[x - s * 0.3, y - s * 0.7], [x + s * 0.3, y - s * 0.7], [x + s * 0.24, y - s * 0.86], [x - s * 0.24, y - s * 0.86]], lid || '#5a3a2a', { line: Math.max(1.2, s * 0.05), depth: s * 0.05, hi: false, tension: 0.15 });
  }
  function scrollItem(g, x, y, len, col, ang) {
    g.save(); g.translate(x, y); g.rotate(ang || 0);
    tk.celFill(g, [[-len / 2, -7], [len / 2, -7], [len / 2, 7], [-len / 2, 7]], '#f0dcae', { line: 2, depth: 3, hi: false, shadow: '#c8b080', tension: 0.15 });
    tk.celFill(g, [[-len / 2 - 5, -8], [-len / 2 + 5, -8], [-len / 2 + 5, 8], [-len / 2 - 5, 8]], col, { line: 1.6, depth: 2, hi: false, tension: 0.15 });
    tk.celFill(g, [[len / 2 - 5, -8], [len / 2 + 5, -8], [len / 2 + 5, 8], [len / 2 - 5, 8]], col, { line: 1.6, depth: 2, hi: false, tension: 0.15 });
    tk.inkStroke(g, -len * 0.3, 0, len * 0.3, 0, { w: 1, color: A('#3a2a5c', 0.5), taper: 0.3 });
    g.restore();
  }
  function foxMask(g, x, y, s) {
    tk.celFill(g, [[x, y - s, 1], [x + s * 0.62, y - s * 0.58], [x + s * 0.5, y + s * 0.1], [x, y + s * 0.62, 1], [x - s * 0.5, y + s * 0.1], [x - s * 0.62, y - s * 0.58]], '#f8f0e0', { line: Math.max(1.6, s * 0.06), depth: s * 0.14, hi: false, shadow: '#d0c0a8', tension: 0.55 });
    fillPoly(g, [[x - s * 0.62, y - s * 0.58], [x - s * 0.42, y - s * 1.12], [x - s * 0.16, y - s * 0.78]], '#f8f0e0'); fillPoly(g, [[x + s * 0.62, y - s * 0.58], [x + s * 0.42, y - s * 1.12], [x + s * 0.16, y - s * 0.78]], '#f8f0e0');
    tk.inkPath(g, [[x - s * 0.5, y - s * 0.1], [x - s * 0.3, y - s * 0.28], [x - s * 0.1, y - s * 0.12]], { w: s * 0.07, color: '#e8383d', taper: 0.3 }); tk.inkPath(g, [[x + s * 0.5, y - s * 0.1], [x + s * 0.3, y - s * 0.28], [x + s * 0.1, y - s * 0.12]], { w: s * 0.07, color: '#e8383d', taper: 0.3 });
    tk.inkPath(g, [[x - s * 0.16, y + s * 0.3], [x, y + s * 0.38], [x + s * 0.16, y + s * 0.3]], { w: s * 0.06, color: pal.ink, taper: 0.3 });
    disc(g, x, y + s * 0.18, s * 0.06, pal.ink);
  }
  function omamori(g, x, y, col) { tk.inkStroke(g, x, y - 20, x, y, { w: 1.6, color: '#e8383d', taper: 0.1 }); tk.celFill(g, [[x - 7, y], [x + 7, y], [x + 7, y + 20], [x - 7, y + 20]], col, { line: 1.6, depth: 2, hi: false, tension: 0.12 }); g.fillStyle = A('#fff4d0', 0.9); g.fillRect(x - 3, y + 5, 6, 2); g.fillRect(x - 2, y + 10, 4, 2); }
  function gemShape(g, x, y, r, col, cut) {
    g.save(); g.translate(x, y);
    const pts = cut === 0 ? [[0, -r], [r * 0.8, -r * 0.2], [r * 0.5, r * 0.8], [-r * 0.5, r * 0.8], [-r * 0.8, -r * 0.2]] : cut === 1 ? [[0, -r], [r, 0], [0, r], [-r, 0]] : tk.ellipsePts(0, 0, r, r * 0.8, 8);
    tk.celFill(g, pts.map((p) => p.length ? p : p), col, { line: 1.6, depth: r * 0.5, hi: 'auto', hiW: 1.4, shadow: shd(col, 0.3), rim: '#ffffff', rimSide: 'light', rimW: 1, rimAlpha: 0.8, tension: cut === 2 ? 1 : 0.1 });
    g.fillStyle = A('#ffffff', 0.85); g.beginPath(); g.ellipse(-r * 0.28, -r * 0.3, r * 0.14, r * 0.26, 0.4, 0, TAU); g.fill();
    g.restore();
  }

  function shopStallBack(g) {
    const L = SH.postL, Rr = SH.postR, top = SH.roofY + 40;
    // the dark wooden back wall with warm light spilling on it
    fillPoly(g, [[L, top], [Rr, top], [Rr, SH.counter], [L, SH.counter]], '#2a1a24');
    blob(g, SH.cx, 388, 300, 170, '#ffb84a', 0.5); blob(g, SH.cx, 400, 180, 110, '#ffe0a0', 0.35);
    const r = R('shop-planks'); g.strokeStyle = A('#0a0610', 0.5); g.lineWidth = 1.4;
    for (let x = L + 14; x < Rr; x += 24 + r() * 8) { g.beginPath(); g.moveTo(x, top); g.lineTo(x + (r() - 0.5) * 3, SH.counter); g.stroke(); }
    // three shelves of goods
    const shelves = [318, 374, 430];
    shelves.forEach((y, si) => {
      fillPoly(g, [[L + 6, y], [Rr - 6, y], [Rr - 6, y + 9], [L + 6, y + 9]], '#5a3a2a'); fillPoly(g, [[L + 6, y], [Rr - 6, y], [Rr - 6, y + 3], [L + 6, y + 3]], A('#ffcf80', 0.6));
      tk.inkPath(g, [[L + 6, y + 9], [Rr - 6, y + 9]], { w: 2, color: '#0a0610', taper: 0, pressure: 'flat' });
    });
    const jars = ['#7a3a2a', '#2a5a7a', '#8a6a3a', '#3a3a7a', '#7a2a4a', '#4a6a3a'];
    for (let i = 0; i < 6; i++) jar(g, L + 44 + i * 30 + (i > 3 ? 210 : 0), 318, 30 + (i % 3) * 6, jars[i % 6]);
    foxMask(g, SH.cx - 150, 300, 24); foxMask(g, SH.cx + 152, 296, 22);
    for (let i = 0; i < 4; i++) scrollItem(g, L + 60 + i * 30, 374 - 8 - (i % 2) * 14, 44, ['#e8383d', '#5a5ad8', '#3aa878', '#f5c96a'][i], -0.2 + i * 0.1);
    for (let i = 0; i < 5; i++) jar(g, Rr - 190 + i * 32, 374, 26 + (i % 2) * 8, jars[(i + 2) % 6], '#2a1a24');
    for (let i = 0; i < 4; i++) omamori(g, L + 60 + i * 34, 380, ['#e8383d', '#3a58c8', '#3aa878', '#f5c96a'][i]);
    for (let i = 0; i < 7; i++) jar(g, L + 40 + i * 62, 430, 30 + (i % 3) * 5, jars[(i * 5) % 6]);
    for (let i = 0; i < 3; i++) scrollItem(g, Rr - 100 + i * 24, 430 - 8, 34, ['#e8383d', '#5a5ad8', '#3aa878'][i], 1.4);
  }

  function tanukiSpr() {
    return mkSpr('shop|tanuki', 250, 250, (g) => {
      g.translate(125, 250);
      const fur = '#9a7050', furD = '#5a3a30', cream = '#f2e0b8', dk = '#241418';
      // tail peeking out behind him
      tk.celFill(g, [[70, -40], [100, -60], [114, -30], [96, -8], [70, -14]], '#8a6446', { line: 3, depth: 8, hi: false, shadow: furD, rim: '#ffcf80', rimSide: 'light', rimW: 2, rimAlpha: 0.8 });
      [[68, -70], [90, -50]].forEach((s) => tk.inkPath(g, [[s[0], s[1]], [s[0] + 14, s[1] - 6]], { w: 5, color: dk, taper: 0.4 }));
      // round body and belly
      tk.celFill(g, tk.ellipsePts(0, -66, 82, 66, 18), fur, { line: 3.6, depth: 16, hi: 'auto', hiW: 2, shadow: furD, rim: '#ffcf80', rimSide: 'light', rimW: 2.4, rimAlpha: 0.9 });
      tk.celFill(g, tk.ellipsePts(0, -58, 52, 46, 16), cream, { line: 2.4, depth: 10, hi: false, shadow: '#d8c090', rim: '#fff8e0', rimSide: 'light', rimW: 1.6, rimAlpha: 0.9 });
      // a striped haori-like sash around the middle
      fillPoly(g, [[-60, -78], [60, -78], [56, -66], [-56, -66]], '#3a2a8a'); tk.inkPath(g, [[-60, -78], [60, -78]], { w: 2, color: dk, taper: 0.05, pressure: 'flat' }); tk.inkPath(g, [[-56, -66], [56, -66]], { w: 2, color: dk, taper: 0.05, pressure: 'flat' });
      disc(g, 0, -72, 5, '#f5c96a');
      // ears
      [[-38, -152], [38, -152]].forEach((e, i) => { tk.celFill(g, tk.ellipsePts(e[0], e[1], 16, 18, 10), fur, { line: 3, depth: 5, hi: false, shadow: furD, rim: '#ffcf80', rimSide: 'light', rimW: 1.6, rimAlpha: 0.8 }); tk.celFill(g, tk.ellipsePts(e[0] + (i ? -2 : 2), e[1] + 2, 8, 10, 8), '#e0a0a0', { line: 1.4, depth: 2, hi: false }); });
      // head
      tk.celFill(g, tk.ellipsePts(0, -124, 60, 54, 18), fur, { line: 3.6, depth: 12, hi: 'auto', hiW: 2, shadow: furD, rim: '#ffcf80', rimSide: 'light', rimW: 2.4, rimAlpha: 0.9 });
      // dark eye patches and the cream muzzle
      [[-24, -128, -0.4], [24, -128, 0.4]].forEach((p) => { g.save(); g.translate(p[0], p[1]); g.rotate(p[2]); tk.celFill(g, tk.ellipsePts(0, 0, 15, 22, 10), '#2a1a20', { line: 1.6, depth: 4, hi: false, shadow: '#14090e' }); g.restore(); });
      tk.celFill(g, tk.ellipsePts(0, -108, 30, 22, 12), cream, { line: 2.4, depth: 6, hi: false, shadow: '#d8c090' });
      g.beginPath(); g.moveTo(-7, -116); g.lineTo(7, -116); g.lineTo(0, -108); g.closePath(); g.fillStyle = dk; g.fill();
      tk.mouth(g, 0, -100, 26, 'grin', { lineW: 2.2, color: dk });
      tk.blush(g, -36, -108, 16, { color: '#ff8a8a', alpha: 0.5 }); tk.blush(g, 36, -108, 16, { color: '#ff8a8a', alpha: 0.5 });
      // the straw hat with a magic leaf on top
      tk.celFill(g, [[-78, -156, 1], [-30, -170], [0, -196], [30, -170], [78, -156, 1], [30, -144], [-30, -144]], '#d8b060', { line: 3.2, depth: 8, hi: 'auto', hiW: 2, shadow: '#a07830', rim: '#fff0b0', rimSide: 'light', rimW: 2, rimAlpha: 0.9, tension: 0.3,
        decor: (gg) => { gg.strokeStyle = A('#7a5820', 0.7); gg.lineWidth = 1.2; for (let k = -6; k <= 6; k++) { gg.beginPath(); gg.moveTo(k * 4, -196); gg.lineTo(k * 12.5, -148); gg.stroke(); } for (let k = 0; k < 3; k++) { gg.beginPath(); gg.ellipse(0, -168 + k * 8, 30 + k * 16, 6, 0, 0, PI); gg.stroke(); } } });
      tk.inkPath(g, [[-40, -146], [-44, -118], [-30, -100]], { w: 2, color: '#e8383d', taper: 0.2 }); tk.inkPath(g, [[40, -146], [44, -118], [30, -100]], { w: 2, color: '#e8383d', taper: 0.2 });
      blade(g, -4, -196, -1.9, 26, 8, '#3aa050', { line: 1.8, vein: true });
      // little front paws resting on the counter
      [[-46, -22], [46, -22]].forEach((p) => tk.celFill(g, tk.ellipsePts(p[0], p[1], 22, 15, 10), fur, { line: 3, depth: 5, hi: false, shadow: furD, rim: '#ffcf80', rimSide: 'light', rimW: 1.6, rimAlpha: 0.8 }));
      [[-52, -24], [-42, -24], [40, -24], [50, -24]].forEach((p) => disc(g, p[0], p[1], 2.6, dk));
    });
  }

  function shopStallFront(g) {
    const L = SH.postL, Rr = SH.postR, cy = SH.counter, cx = SH.cx;
    // the counter: heavy wooden slab, panelled front
    tk.celFill(g, [[L - 24, cy], [Rr + 24, cy], [Rr + 20, cy + 14], [L - 20, cy + 14]], '#8a5a3a', { line: 3.4, depth: 5, hi: 'auto', hiW: 2, shadow: '#5a3a28', rim: '#ffd080', rimSide: 'light', rimW: 2, rimAlpha: 0.9, tension: 0.1 });
    fillPoly(g, [[L - 16, cy + 14], [Rr + 16, cy + 14], [Rr + 16, SH.ground], [L - 16, SH.ground]], '#4a2c26');
    fillPoly(g, [[L - 16, cy + 14], [Rr + 16, cy + 14], [Rr + 16, cy + 26], [L - 16, cy + 26]], '#2a1620');
    const r = R('shop-counter');
    for (let i = 0; i < 6; i++) { const x = L - 10 + i * ((Rr - L + 20) / 6); g.strokeStyle = A('#0a0610', 0.7); g.lineWidth = 3; g.beginPath(); g.moveTo(x, cy + 26); g.lineTo(x, SH.ground); g.stroke(); g.strokeStyle = A('#ffcf80', 0.16); g.lineWidth = 1.6; g.beginPath(); g.moveTo(x + 5, cy + 30); g.lineTo(x + 5, SH.ground - 2); g.stroke(); }
    for (let i = 0; i < 5; i++) { const x = L + 30 + i * 90 + r() * 10, y = cy + 60 + r() * 30; tk.inkPath(g, [[x, y], [x + 30 + r() * 30, y + (r() - 0.5) * 3]], { w: 1.4, color: A('#0a0610', 0.5), taper: 0.4, wobble: 0.2, seed: i }); }
    // an enso brush mark and a gem emblem painted on the front panel
    tk.inkPath(g, tk.arcPts(cx, cy + 62, 26, 26, -0.6, 5.4, 18), { w: 6, color: A('#f0dcae', 0.85), pressure: 'head', taperEnd: 0.4, wobble: 0.3, seed: 4 });
    gemShape(g, cx, cy + 62, 10, '#e8383d', 0);
    // posts, rope-wrapped
    [L, Rr].forEach((px, i) => {
      tk.celFill(g, [[px - 12, SH.roofY + 30], [px + 12, SH.roofY + 30], [px + 14, SH.ground + 6], [px - 14, SH.ground + 6]], '#6a3a2a', { line: 3.4, depth: 7, hi: 'auto', hiW: 2, shadow: '#3a1e1c', rim: '#ffd080', rimSide: 'light', rimW: 2, rimAlpha: 0.85, tension: 0.1 });
      for (let k = 0; k < 4; k++) { const y = SH.roofY + 60 + k * 9; tk.inkPath(g, [[px - 12, y], [px, y + 4], [px + 12, y]], { w: 3, color: '#d8b060', taper: 0.1, pressure: 'flat' }); }
    });
    // roof: a deep tiled canopy with upswept eaves, lit warm underneath
    const rf = [[L - 70, SH.roofY + 36], [L - 30, SH.roofY - 4], [cx, SH.roofY - 34], [Rr + 30, SH.roofY - 4], [Rr + 70, SH.roofY + 36], [Rr + 50, SH.roofY + 46], [cx, SH.roofY + 30], [L - 50, SH.roofY + 46]];
    tk.celFill(g, rf, '#3a1c30', { line: 3.6, depth: 10, hi: false, shadow: '#1a0c1e', rim: '#ff9a4a', rimSide: 'light', rimW: 2.4, rimAlpha: 0.7, tension: 0.3, decor: (gg) => {
      gg.strokeStyle = A('#0a0410', 0.6); gg.lineWidth = 1.6;
      for (let k = 1; k < 5; k++) { const yy = SH.roofY - 30 + k * 13; gg.beginPath(); gg.moveTo(L - 76, yy + 6); gg.quadraticCurveTo(cx, yy - 10, Rr + 76, yy + 6); gg.stroke(); }
      for (let k = 0; k < 16; k++) { const x = L - 60 + k * ((Rr - L + 120) / 15); gg.beginPath(); gg.moveTo(x, SH.roofY - 20); gg.lineTo(x + (x - cx) * 0.12, SH.roofY + 46); gg.stroke(); }
    } });
    fillPoly(g, [[L - 50, SH.roofY + 46], [cx, SH.roofY + 30], [Rr + 50, SH.roofY + 46], [Rr + 50, SH.roofY + 56], [cx, SH.roofY + 42], [L - 50, SH.roofY + 56]], '#241020');
    // noren curtains: indigo cloth with a white mark, slit into panels with a scalloped hem
    [[L + 14, L + 154], [Rr - 154, Rr - 14]].forEach((n, ni) => {
      const x0 = n[0], x1 = n[1], y0 = SH.roofY + 54, y1 = y0 + 88, pw = (x1 - x0) / 3;
      for (let k = 0; k < 3; k++) {
        const a = x0 + k * pw + 1.5, b = x0 + (k + 1) * pw - 1.5, sw = Math.sin(k * 1.7 + ni) * 2;
        tk.celFill(g, [[a, y0, 1], [b, y0, 1], [b + sw, y1 - 6], [(a + b) / 2, y1 + 3], [a + sw, y1 - 6]], '#2a3a9a', { line: 2.4, depth: 6, hi: false, shadow: '#141c5a', rim: '#7a8aff', rimSide: 'light', rimW: 1.6, rimAlpha: 0.7, tension: 0.15 });
      }
      tk.inkPath(g, tk.arcPts((x0 + x1) / 2, y0 + 40, 15, 15, -0.5, 5.2, 14), { w: 5, color: '#f4eedc', pressure: 'head', taperEnd: 0.4, wobble: 0.3, seed: ni + 8 });
      tk.inkStroke(g, x0, y0 - 1, x1, y0 - 1, { w: 4, color: '#0a0610', taper: 0, pressure: 'flat' });
    });
    // things on the counter: a tray of gems, a scroll pile, a teacup, a small abacus
    tk.celFill(g, [[cx - 160, cy - 2], [cx - 34, cy - 2], [cx - 30, cy - 12], [cx - 164, cy - 12]], '#1a1030', { line: 2.4, depth: 3, hi: false, shadow: '#0a0618', rim: '#ffd080', rimSide: 'light', rimW: 1.4, rimAlpha: 0.7, tension: 0.15 });
    [['#e8383d', 0, -140], ['#3a7aff', 1, -118], ['#3aa878', 2, -96], ['#f5c96a', 0, -74], ['#c05aff', 1, -52]].forEach((gm) => gemShape(g, cx + gm[2], cy - 12, 8, gm[0], gm[1]));
    scrollItem(g, cx + 130, cy - 8, 60, '#e8383d', 0.05); scrollItem(g, cx + 140, cy - 22, 54, '#5a5ad8', -0.06); scrollItem(g, cx + 120, cy - 36, 50, '#3aa878', 0.04);
    tk.celFill(g, tk.ellipsePts(cx + 76, cy - 8, 14, 8, 10), '#f4eedc', { line: 2, depth: 2, hi: false, shadow: '#c8c0a8' });
    tk.celFill(g, [[cx + 64, cy - 8], [cx + 88, cy - 8], [cx + 84, cy - 24], [cx + 68, cy - 24]], '#f4eedc', { line: 2, depth: 3, hi: false, shadow: '#c8c0a8', tension: 0.2 });
    fillPoly(g, [[cx + 96, cy - 2], [cx + 122, cy - 2], [cx + 122, cy - 18], [cx + 96, cy - 18]], '#6a3a2a');
    for (let k = 0; k < 3; k++) { g.strokeStyle = A('#0a0610', 0.9); g.lineWidth = 1.2; g.beginPath(); g.moveTo(cx + 96, cy - 6 - k * 4.4); g.lineTo(cx + 122, cy - 6 - k * 4.4); g.stroke(); disc(g, cx + 102 + k * 8, cy - 6 - k * 4.4, 2.2, '#f5c96a'); }
  }

  function shopGround(g) {
    const y0 = SH.ground - 6;
    fillRectG(g, X0, y0, XW, DH - y0 + 4, [[0, '#3a3080'], [0.1, '#26206a'], [0.45, '#141040'], [1, '#07051a']]);
    fillPoly(g, [[X0, y0], [X0 + XW, y0], [X0 + XW, y0 + 6], [X0, y0 + 6]], '#5a4fb0');
    const r = R('shop-street');
    let y = y0 + 6, row = 0;
    while (y < DH + 10) {
      const rh = 10 + row * 3.6, jw = 46 + row * 24;
      g.strokeStyle = A('#04020c', 0.6); g.lineWidth = 1.4 + row * 0.35; g.beginPath(); g.moveTo(X0, y + rh); g.lineTo(X0 + XW, y + rh); g.stroke();
      const off = (row % 2) * jw / 2 + r() * 10;
      for (let x = X0 + off; x < X0 + XW; x += jw) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + (x - 640) * 0.02, y + rh); g.stroke(); }
      y += rh; row++;
    }
    blob(g, SH.cx, y0 + 34, 420, 50, '#ffb84a', 0.5); blob(g, SH.cx, y0 + 22, 230, 28, '#ffe0a0', 0.4);
    for (let i = 0; i < 8; i++) { const x = 60 + i * 158 + (r() - 0.5) * 60, py = 596 + r() * 100, rx = 34 + r() * 60, ry = rx * 0.16; g.fillStyle = A('#4a5ad0', 0.32); g.beginPath(); g.ellipse(x, py, rx, ry, 0, 0, TAU); g.fill(); g.fillStyle = A('#c8d0ff', 0.2); g.beginPath(); g.ellipse(x - rx * 0.2, py - ry * 0.25, rx * 0.55, ry * 0.3, 0, 0, TAU); g.fill(); if (i % 2 === 0) { g.fillStyle = A('#ffb84a', 0.3); g.beginPath(); g.ellipse(x + rx * 0.2, py, rx * 0.2, ry * 0.5, 0, 0, TAU); g.fill(); } }
    // crates and barrels at the edges
    [[820, 596, 1], [890, 610, 0.86]].forEach((c) => { const x = c[0], y = c[1], s = c[2]; tk.celFill(g, [[x - 34 * s, y], [x + 34 * s, y], [x + 34 * s, y - 52 * s], [x - 34 * s, y - 52 * s]], '#5a3a2a', { line: 3, depth: 7, hi: 'auto', shadow: '#2a1820', rim: '#ffb060', rimSide: 'light', rimW: 2, rimAlpha: 0.7, tension: 0.1 }); g.strokeStyle = A('#0a0610', 0.7); g.lineWidth = 2; g.beginPath(); g.moveTo(x - 34 * s, y - 26 * s); g.lineTo(x + 34 * s, y - 26 * s); g.moveTo(x, y); g.lineTo(x, y - 52 * s); g.stroke(); });
  }

  function shopFg(g) {
    // a dark post and a hanging wooden sign at the far right, the edge of a barrel bottom-left
    fillPoly(g, [[1206, -10], [1250, -10], [1246, DH + 10], [1210, DH + 10]], '#180f2e');
    fillPoly(g, [[1236, -10], [1250, -10], [1246, DH + 10], [1232, DH + 10]], A('#ff9a3a', 0.28));
    tk.inkPath(g, [[1250, -10], [1246, DH + 10]], { w: 3.6, color: '#05030f', taper: 0, pressure: 'flat' });
    tk.inkPath(g, [[1210, 150], [1120, 150]], { w: 7, color: '#180f2e', taper: 0, pressure: 'flat' });
    [[1140, 154], [1170, 154]].forEach((p) => tk.inkStroke(g, p[0], p[1], p[0], p[1] + 26, { w: 2, color: '#0a0610', taper: 0, pressure: 'flat' }));
    tk.celFill(g, [[1120, 180], [1190, 180], [1190, 250], [1120, 250]], '#6a3a2a', { line: 3, depth: 6, hi: 'auto', shadow: '#3a1e1c', rim: '#ffd080', rimSide: 'light', rimW: 2, rimAlpha: 0.85, tension: 0.1 });
    tk.inkPath(g, tk.arcPts(1155, 215, 22, 22, -0.6, 5.3, 16), { w: 6, color: '#f4eedc', pressure: 'head', taper: 0.1, taperEnd: 0.4, wobble: 0.3, seed: 2 });
    gemShape(g, 1155, 215, 9, '#3a7aff', 1);
  }
  function shopLanternSpr(l) {
    return mkSpr('shop|lan|' + l.ci + '|' + l.r, l.r * 4, l.r * 4.6, (g) => { chochin(g, l.r * 2, l.r * 0.9, l.r, SH_COLS[l.ci], { rim: lite(SH_COLS[l.ci], 0.6), mark: l.r > 20 && l.ci % 2 ? '#fff4d0' : null }); });
  }

  SCENES.shop = { id: 'shop', combat: false, mood: 'a peddler\'s lantern stall', sway: 6, items: [
    layer('back', full(0, 600), 0.06, shopBack),
    anim((ctx, T) => { twinkle(ctx, T, { key: 'shop', n: 22, h: 180 }); }),
    layer('ropes', full(40, 120), 0.08, (g) => { const back = SH_LANTERNS.filter((l) => l.f === 0.08).sort((a, b) => a.x - b.x), pts = [[X0, 60]]; back.forEach((l, i) => { pts.push([l.x, l.y - l.r * 1.6]); }); pts.push([X0 + XW, 70]); for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], mid = [(a[0] + b[0]) / 2, Math.max(a[1], b[1]) + 22]; tk.inkPath(g, [a, mid, b], { w: 2.2, color: '#0a0610', taper: 0.02, wobble: 0.03, pressure: 'flat', step: 10 }); } }),
    mistLayer('shop-mist', 380, 160, '#7a6ad8', 0.22, 4, 0.1, 61),
    layer('stallBack', { x: SH.postL - 40, y: SH.roofY, w: SH.postR - SH.postL + 80, h: SH.counter - SH.roofY + 8 }, 0.1, shopStallBack),
    anim((ctx, T) => {                                               // the shopkeeper: baked body, live eyes, breathing, and a wave now and then
      const spr = tanukiSpr(), x = SH.cx - T.par * 0.12, y = SH.counter + 22, br = 1 + 0.012 * Math.sin(T.tt * 1.7) * T.mot;
      ctx.save(); ctx.translate(x, y); ctx.scale(1, br); ART.blit(ctx, spr, -125, -250, 250, 250);
      const bl = ((T.tt + 1.3) % 4.4) < 0.14 ? 0.15 : 1, lk = Math.sin(T.tt * 0.6) * 2.4 * T.mot;
      [[-24, -128, -0.4], [24, -128, 0.4]].forEach((e) => {
        ctx.save(); ctx.translate(e[0], e[1]); ctx.rotate(e[2] * 0.4);
        ctx.fillStyle = '#fff8e8'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 10 * bl, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#1a0c10'; ctx.beginPath(); ctx.ellipse(lk * 0.6, 1, 4.6, 6.4 * bl, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(lk * 0.6 - 1.6, -2, 1.6, 0, TAU); ctx.fill();
        ctx.restore();
      });
      const wv = ((T.tt + 2.5) % 7.5) / 7.5;                          // a friendly paw wave every 7.5 s
      if (wv < 0.2 && T.mot >= 1) {
        const k = wv / 0.2, a = Math.sin(k * PI * 5) * 0.34 * Math.sin(k * PI);
        ctx.save(); ctx.translate(60, -60); ctx.rotate(-0.5 + a);
        tk.celFill(ctx, tk.ellipsePts(0, -22, 14, 26, 10), '#9a7050', { line: 3, depth: 4, hi: false, shadow: '#5a3a30', rim: '#ffcf80', rimSide: 'light', rimW: 1.6, rimAlpha: 0.8 });
        [-5, 0, 5].forEach((d) => disc(ctx, d, -40, 2.4, '#241418'));
        ctx.restore();
      }
      ctx.restore();
    }),
    layer('stallFront', { x: SH.postL - 100, y: SH.roofY - 50, w: SH.postR - SH.postL + 200, h: SH.ground - SH.roofY + 66 }, 0.14, shopStallFront),
    layer('ground', { x: 0, y: SH.ground - 10, w: DW, h: DH - SH.ground + 10 }, 0, shopGround),
    anim((ctx, T) => {
      // lanterns: sway, warm glow, and the sparkle of the gems on the counter
      const gl = [];
      SH_LANTERNS.forEach((l) => {
        const fl = 0.8 + 0.2 * Math.sin(T.tt * 3.1 + l.ph) * Math.sin(T.tt * 1.3 + l.ph * 2), sw = Math.sin(T.tt * 0.9 + l.ph) * 0.05 * T.mot, x = l.x - T.par * l.f;
        ctx.save(); ctx.translate(x, l.y); ctx.rotate(sw);
        ctx.strokeStyle = '#0a0610'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -l.r * 1.6); ctx.lineTo(0, 0); ctx.stroke();
        ART.blit(ctx, shopLanternSpr(l), -l.r * 2, -l.r * 0.9, l.r * 4, l.r * 4.6);
        ctx.restore();
        gl.push(x, l.y + l.r * 1.05, l.r, fl, l.ci);
      });
      addMode(ctx, () => { for (let i = 0; i < gl.length; i += 5) { glowAt(ctx, gl[i], gl[i + 1], gl[i + 2] * 4.2 * gl[i + 3], SH_COLS[gl[i + 4]], 0.6 * gl[i + 3]); glowAt(ctx, gl[i], gl[i + 1], gl[i + 2] * 1.2, '#fff0c8', 0.55 * gl[i + 3]); } });
      addMode(ctx, () => { glowE(ctx, SH.cx - 70, SH.counter - 20, 130, 40, '#ffe0a0', 0.24 + 0.06 * Math.sin(T.tt * 2)); });
      [[-140, 0.0], [-118, 1.3], [-96, 2.1], [-74, 3.4], [-52, 4.6]].forEach((gm) => { const tw = Math.pow(Math.max(0, Math.sin(T.tt * 1.6 + gm[1])), 4); if (tw > 0.08) tk.sparkle(ctx, SH.cx + gm[0] - T.par * 0.14, SH.counter - 14, 6 + 8 * tw, { color: '#ffffff', alpha: tw, glow: 0.5, rot: gm[1] }); });
      // steam from a pot at the right of the stall
      const st = campSteamSpr(), P = pset('shop-steam', 7, (r) => ({ ph: r(), dx: (r() - 0.5) * 12, sp: 0.6 + r() * 0.5 }));
      for (let i = 0; i < Math.max(3, Math.round(7 * T.pf)); i++) { const p = P[i], u = ((T.tt * 0.2 * p.sp + p.ph) % 1 + 1) % 1, x = SH.cx + 230 + p.dx + Math.sin(T.tt + p.ph * 6) * 7 * u, y = SH.counter - 30 - u * 110, s = 10 + u * 30; ART.blit(ctx, st, x - s, y - s, s * 2, s * 2, 0.45 * Math.sin(PI * u)); }
      fireflies(ctx, T, { key: 'shop-motes', n: 10, area: { x: 100, y: 300, w: 1000, h: 260 }, color: '#ffcf7a', size: 9, speed: 0.6 });
      drift(ctx, T, { key: 'shop-petals', n: 8, sprs: [petalSpr('#ffc2dc', 0), petalSpr('#ff9cc6', 1)], area: { x: 0, y: 0, w: DW, h: DH }, vx: -20, vy: 26, sway: 40, size: [10, 18], aspect: 1, tumble: true, spin: 0.7, alpha: [0.7, 1] });
    }),
    layer('fg', { x: 1060, y: 0, w: 220, h: DH }, 1, shopFg),
    vigLayer('shop-vig', { color: '#05030f', alpha: 0.55, inner: 0.3 }),
    grain(0.28),
  ] };


  // ===============================================================================================================
  // EVENT: a fogbound shrine path. Moonlit cedars frame a stone path that runs into the mist between rows of stone lanterns toward a far
  // torii and a shrine; three depths of drifting fog, pale ghost flames, a straw rope with paper streamers in the foreground.
  // ===============================================================================================================
  const EV = { vx: 640, hy: 404, pathHalf: 12 };
  const evP = [0.97, 0.64, 0.42, 0.29, 0.2, 0.14];                 // depth stations along the path (1 = nearest)
  const evY = (p) => EV.hy + (DH - EV.hy) * p;
  const evHalf = (p) => EV.pathHalf + (300 - EV.pathHalf) * p;

  function cedar(g, x, base, h, w, col, lit, sd) {
    const r = R('cedar', sd), tiers = 9 + Math.floor(h / 60);
    for (let i = 0; i < tiers; i++) {
      const u = i / tiers, y1 = base - h * u * 0.96, y0 = y1 - h / tiers * 1.7, tw = w * (1 - u * 0.86) * (0.9 + 0.2 * r());
      const pts = [[x, y0 - 4]];
      const n = 5; for (let k = 1; k <= n; k++) pts.push([x + tw * (k / n) * (1 + (r() - 0.5) * 0.25), y0 + (y1 - y0) * (k / n) + (k % 2 ? -3 : 3)]);
      for (let k = n; k >= 1; k--) pts.push([x - tw * (k / n) * (1 + (r() - 0.5) * 0.25), y0 + (y1 - y0) * (k / n) + (k % 2 ? 3 : -3)]);
      fillPoly(g, pts, col);
      if (lit) tk.inkPath(g, pts.slice(0, n + 1), { w: 1.4, color: lit, taper: 0.4, wobble: 0.1, seed: i + sd, alpha: 0.7 });
    }
    fillPoly(g, [[x - w * 0.05, base], [x + w * 0.05, base], [x + w * 0.04, base - h * 0.1], [x - w * 0.04, base - h * 0.1]], col);
  }

  function evSky(g) {
    fillRectG(g, X0, 0, XW, 480, [[0, '#03101c'], [0.4, '#0a2434'], [0.75, '#1d4858'], [1, '#3a7080']]);
    if (!tk.lowQ()) tk.halftoneRamp(g, X0, 240, XW, 200, { d: 9, dir: PI / 2, r0: 0.2, r1: 3, color: '#8ad8e8', alpha: 0.12 });
    const r = R('ev-stars');
    for (let i = 0; i < 90; i++) { const x = X0 + r() * XW, y = Math.pow(r(), 1.3) * 300, s = 0.6 + r() * 1.2; g.fillStyle = A('#e8f8ff', 0.25 + 0.5 * r()); g.fillRect(x, y, s, s); }
    const mx = 880, my = 150, mr = 54;
    blob(g, mx, my, 360, 280, '#8ad8e8', 0.3); blob(g, mx, my, 180, 150, '#e8fbff', 0.4);
    disc(g, mx, my, mr, '#f0fbff');
    g.save(); g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.clip();
    g.beginPath(); g.rect(mx - mr * 2, my - mr * 2, mr * 4, mr * 4); g.arc(mx + mr * 0.24, my - mr * 0.2, mr * 1.04, 0, TAU); g.fillStyle = '#b8d8e8'; g.fill('evenodd');
    const mr2 = R('ev-moon'); for (let i = 0; i < 5; i++) blob(g, mx + (mr2() - 0.5) * mr * 1.3, my + (mr2() - 0.5) * mr * 1.3, mr * (0.1 + 0.16 * mr2()), mr * (0.08 + 0.12 * mr2()), '#98b8c8', 0.5);
    g.restore();
    tk.inkPath(g, tk.ellipsePts(mx, my, mr, mr, 24), { closed: true, w: 3.2, color: pal.ink, align: 0.5, weightVar: 0.7, wobble: 0.1 });
    for (let k = 0; k < 3; k++) tk.inkPath(g, [[mx - 200, my + 20 + k * 6], [mx, my + 10 + k * 6], [mx + 220, my + 24 + k * 6]], { w: 9 - k * 2, color: A('#0a2434', 0.55 - k * 0.1), taper: 0.42, wobble: 0.5, seed: k + 3 });
  }
  function evForest(g) {
    // three depths of cedar silhouettes on the horizon, with fog washing over each
    const groups = [{ n: 26, h: [150, 260], w: [40, 60], col: '#2a5060', lit: '#8ad8e8', sd: 1, hz: 0.5 }, { n: 20, h: [200, 320], w: [50, 72], col: '#1a3a4a', lit: '#8ad8e8', sd: 2, hz: 0.32 }, { n: 12, h: [260, 400], w: [60, 84], col: '#0e2836', lit: '#8ad8e8', sd: 3, hz: 0.18 }];
    groups.forEach((gr, gi) => {
      const r = R('ev-forest', gr.sd);
      for (let i = 0; i < gr.n; i++) {
        let x = X0 + (i + r() * 0.8) / gr.n * XW;
        if (Math.abs(x - 640) < 120 - gi * 30) x += x < 640 ? -160 : 160;                // keep the corridor to the shrine open
        cedar(g, x, EV.hy + 6 + gi * 4, gr.h[0] + r() * (gr.h[1] - gr.h[0]), gr.w[0] + r() * (gr.w[1] - gr.w[0]), gr.col, gr.lit, gr.sd * 40 + i);
      }
      haze(g, 240, EV.hy + 30, '#5a98a8', 0, gr.hz + 0.2);
    });
  }
  function evShrine(g) {
    const x = 640, y = 420;
    fillPoly(g, [[x - 70, y], [x + 70, y], [x + 60, y - 10], [x - 60, y - 10]], '#1a3a4a');
    fillPoly(g, [[x - 44, y - 10], [x + 44, y - 10], [x + 44, y - 46], [x - 44, y - 46]], '#16303e');
    fillPoly(g, [[x - 12, y - 10], [x + 12, y - 10], [x + 12, y - 36], [x - 12, y - 36]], '#ffcf7a');
    fillPoly(g, [[x - 66, y - 44], [x - 22, y - 76], [x + 22, y - 76], [x + 66, y - 44], [x + 54, y - 40], [x - 54, y - 40]], '#0e2230');
    tk.inkPath(g, [[x - 22, y - 76], [x + 22, y - 76]], { w: 1.6, color: A('#8ad8e8', 0.7), taper: 0.3 });
    blob(g, x, y - 26, 60, 40, '#ffcf7a', 0.4);
    torii(g, x, y + 32, 132, { col: '#b8483e', shade: '#6a2a3a', alpha: 0.85 });
  }
  function evGround(g) {
    fillRectG(g, X0, EV.hy, XW, DH - EV.hy + 4, [[0, '#2a5868'], [0.12, '#163646'], [0.5, '#0a1c28'], [1, '#03080f']]);
    const r = R('ev-ground');
    // the path: converging edges, courses of slabs, joints running to the vanishing point
    const hw = (y) => evHalf((y - EV.hy) / (DH - EV.hy));
    fillPoly(g, [[EV.vx - EV.pathHalf, EV.hy], [EV.vx + EV.pathHalf, EV.hy], [EV.vx + 300, DH + 4], [EV.vx - 300, DH + 4]], tk.lin(g, 0, EV.hy, 0, DH, [[0, '#6a9aa8'], [0.15, '#3a6070'], [0.6, '#1c3846'], [1, '#0a1c28']]));
    let k = 0, y = EV.hy;
    while (y < DH) {
      const step = 3 + Math.pow(k, 1.55) * 0.9;
      y += step; k++;
      const w = hw(y), jn = 5;
      g.strokeStyle = A('#020a12', 0.5); g.lineWidth = 0.6 + k * 0.09;
      g.beginPath(); g.moveTo(EV.vx - w, y); g.lineTo(EV.vx + w, y); g.stroke();
      g.strokeStyle = A('#b8e8f0', 0.08); g.lineWidth = 0.6 + k * 0.07; g.beginPath(); g.moveTo(EV.vx - w, y + 0.8 + k * 0.1); g.lineTo(EV.vx + w, y + 0.8 + k * 0.1); g.stroke();
    }
    for (let j = -3; j <= 3; j++) { g.strokeStyle = A('#020a12', 0.45); g.lineWidth = 1.6; g.beginPath(); g.moveTo(EV.vx + j * EV.pathHalf / 3.2, EV.hy); g.lineTo(EV.vx + j * 300 / 3.2 * (1 + (j % 2 ? 0.05 : -0.04)), DH + 4); g.stroke(); }
    // mossy curbs along both edges
    [-1, 1].forEach((sd) => { const pts = []; for (let i = 0; i <= 14; i++) { const yy = EV.hy + (DH - EV.hy) * Math.pow(i / 14, 1.5); pts.push([EV.vx + sd * (hw(yy) + 3), yy]); } tk.inkPath(g, pts, { w: 12, color: '#0e2a30', taper: 0.02, taperStart: 0.02, pressure: 'head', wobble: 0.1, step: 8 }); tk.inkPath(g, pts.map((p) => [p[0] - sd * 3, p[1] - 2]), { w: 3, color: A('#8ad8c0', 0.5), taper: 0.02, pressure: 'head', wobble: 0.2, step: 8 }); });
    // grass tufts and fallen leaves
    for (let i = 0; i < 200; i++) { const yy = EV.hy + 10 + Math.pow(r(), 1.6) * (DH - EV.hy), x = X0 + r() * XW; if (Math.abs(x - EV.vx) < hw(yy) + 12) continue; grass(g, x, yy, 4 + (yy - EV.hy) * 0.06 + r() * 8, 3, A(r() < 0.5 ? '#2a6a6a' : '#1a4a56', 0.8), i, 0.15); }
    for (let i = 0; i < 40; i++) { const yy = EV.hy + 30 + Math.pow(r(), 1.3) * (DH - EV.hy - 30), x = EV.vx + (r() - 0.5) * hw(yy) * 1.8; litter(g, x, yy, 2.4 + (yy - EV.hy) * 0.02, r() * TAU, r() < 0.5 ? '#c8a050' : '#a06a3a', 0.8); }
  }
  function evLanterns(g) {
    evP.forEach((p, i) => {
      const y = evY(p), s = 150 * p + 14, hw = evHalf(p) + 66 * p + 12, fog = mixc('#6a8898', '#3a5868', p);
      [-1, 1].forEach((sd) => toro(g, EV.vx + sd * hw, y + 2, s, { stone: mixc('#8aa8b8', '#4a6070', p), shade: mixc('#3a5060', '#1a2c3a', p), rim: '#c8f0ff', fire: '#ffcf7a', lineColor: '#061018' }));
    });
  }
  function evFg(g, side) {
    // a great cedar trunk at each edge, ink-outlined, moss on the roots, moonlight rim on the inner side
    g.save();
    if (side > 0) { g.translate(DW, 0); g.scale(-1, 1); }
    const dk = '#081820', sh = '#030c12', rim = '#8ad8e8';
    const tr = [[60, DH + 10], [66, 560], [54, 380], [62, 200], [50, 60], [58, -20]];
    tk.inkPath(g, tr, { w: 150, color: pal.ink, taper: 0, pressure: 'flat', wobble: 0.06, seed: 3, step: 10 });
    tk.inkPath(g, tr, { w: 140, color: dk, taper: 0, pressure: 'flat', wobble: 0.06, seed: 3, step: 10 });
    tk.inkPath(g, tr.map((p) => [p[0] - 34, p[1]]), { w: 52, color: A(sh, 0.9), taper: 0, pressure: 'flat', wobble: 0.1, seed: 5, step: 10 });
    tk.inkPath(g, tr.map((p) => [p[0] + 56, p[1]]), { w: 9, color: A(rim, 0.55), taper: 0.02, pressure: 'flat', wobble: 0.15, seed: 6, step: 10 });
    const r = R('ev-bark', side);
    for (let i = 0; i < 14; i++) { const x = 0 + r() * 120, y = r() * DH; tk.inkPath(g, [[x, y], [x + (r() - 0.5) * 10, y + 40 + r() * 60], [x + (r() - 0.5) * 12, y + 100 + r() * 90]], { w: 1.6 + r() * 1.4, color: A(sh, 0.8), taper: 0.5, wobble: 0.3, seed: i }); }
    for (let i = 0; i < 5; i++) blob(g, 40 + r() * 80, 500 + r() * 200, 24 + r() * 26, 10 + r() * 10, '#2a7a70', 0.5);
    // ferns at the foot
    for (let i = 0; i < 9; i++) { const x = 100 + r() * 150, y = DH - 6; leafFan(g, x, y, { dir: -PI / 2 + (r() - 0.5) * 1.6, spread: 1.6, n: 6, len: 60 + r() * 40, wid: 5, base: '#0e3a3a', base2: '#154a44', shadow: '#061c22', rim: '#8ad8e8', line: 1.6, lineColor: '#020a12', seed: 300 + i + side, vein: false }); }
    g.restore();
  }
  function evRope(g) {
    // the shimenawa: a thick twisted straw rope between the two trunks with paper streamers hanging from it
    const pts = [[120, 156], [300, 196], [640, 226], [980, 196], [1160, 156]];
    tk.inkPath(g, pts, { w: 20, color: pal.ink, taper: 0, pressure: 'flat', wobble: 0.05, step: 8 });
    tk.inkPath(g, pts, { w: 15, color: '#c8b070', taper: 0, pressure: 'flat', wobble: 0.05, step: 8 });
    tk.inkPath(g, pts.map((p) => [p[0], p[1] + 4]), { w: 5, color: '#8a7038', taper: 0, pressure: 'flat', wobble: 0.05, step: 8 });
    const d = tk.flatten(pts, { step: 10 });
    for (let i = 0; i < d.length - 2; i += 2) { g.strokeStyle = A('#5a4820', 0.7); g.lineWidth = 1.4; g.beginPath(); g.moveTo(d[i] - 2, d[i + 1] - 7); g.lineTo(d[i] + 3, d[i + 1] + 7); g.stroke(); }
  }
  function evShideSpr(k) {
    return mkSpr('ev|shide|' + k, 40, 90, (g) => {
      g.translate(20, 6);
      const right = [[8, 0], [8, 20], [-2, 26], [10, 44], [0, 50], [10, 68], [-2, 74]], left = [[-8, 0], [-8, 20], [-18, 26], [-6, 44], [-16, 50], [-6, 68], [-16, 74]];
      tk.celFill(g, { poly: right.concat(left.reverse()) }, '#f4f0e8', { line: 2, depth: 4, hi: false, shadow: '#b8c0c8', rim: '#c8f0ff', rimSide: 'light', rimW: 1.4, rimAlpha: 0.8 });
    });
  }

  function evItems() {
    const L = (name, rect, f, draw, o) => layer(name, rect, f, draw, o);
    const toroPos = [];
    evP.forEach((p) => [-1, 1].forEach((sd) => { const s = 150 * p + 14; toroPos.push({ x: EV.vx + sd * (evHalf(p) + 66 * p + 12), y: evY(p) - s * 0.59, s, p }); }));
    return [
      L('sky', full(0, 480), 0.02, evSky),
      anim((ctx, T) => { twinkle(ctx, T, { key: 'event', n: 30, h: 300, gold: 0 }); }),
      L('forest', full(120, 340), 0.06, evForest),
      mistLayer('ev-mistFar', 330, 140, '#9ad0e0', 0.5, 3, 0.06, 71),
      L('shrine', { x: 480, y: 300, w: 320, h: 180 }, 0.05, evShrine),
      anim((ctx, T) => { addMode(ctx, () => { glowAt(ctx, 640 - T.par * 0.05, 396, 46, '#ffcf7a', 0.4 + 0.1 * Math.sin(T.tt * 1.8)); }); }),
      mistLayer('ev-mistMid', 380, 100, '#9ad0e0', 0.4, 5, 0.1, 72),
      L('ground', { x: 0, y: EV.hy - 4, w: DW, h: DH - EV.hy + 4 }, 0, evGround),
      L('lanterns', full(300, 420), 0.05, evLanterns),
      anim((ctx, T) => {
        addMode(ctx, () => toroPos.forEach((t, i) => { const fl = 0.8 + 0.2 * Math.sin(T.tt * 5.1 + i * 1.7) * Math.sin(T.tt * 2.3 + i); glowAt(ctx, t.x - T.par * 0.05, t.y, t.s * 0.9 * fl, '#ffb84a', 0.5 * fl); glowAt(ctx, t.x - T.par * 0.05, t.y, t.s * 0.24, '#fff0c8', 0.6 * fl); }));
      }),
      mistLayer('ev-mistNear', 470, 170, '#8ac0d0', 0.42, 8, 0.3, 73, { bob: [4, 0.35, 0] }),
      anim((ctx, T) => {
        fireflies(ctx, T, { key: 'ev-hito', n: 9, area: { x: 200, y: 300, w: 880, h: 330 }, color: '#9ff0ff', core: '#ffffff', size: 24, speed: 0.55 });
        fireflies(ctx, T, { key: 'ev-ff', n: 12, area: { x: 100, y: 380, w: 1080, h: 260 }, color: '#d8ff7a', size: 10, speed: 0.8 });
      }),
      L('fgL', { x: 0, y: 0, w: 330, h: DH }, 1, (g) => evFg(g, -1)),
      L('fgR', { x: 950, y: 0, w: 330, h: DH }, 1, (g) => evFg(g, 1)),
      L('rope', { x: 100, y: 130, w: 1080, h: 120 }, 0.9, evRope),
      ...[0, 1, 2, 3, 4, 5, 6].map((i) => { const u = (i + 0.5) / 7, x = lerp(150, 1130, u), y = 156 + 70 * Math.sin(PI * u) * 0.75 + (u > 0.5 ? 0 : 0); return swayer(0.9, () => evShideSpr(i % 3), x - 20, y + 8, 40, 90, 20, 0, 0.09, 0.22 + 0.03 * i, i * 1.3); }),
      anim((ctx, T) => { drift(ctx, T, { key: 'ev-leaves', n: 12, sprs: [leafSpr('#c8a050', 0), leafSpr('#a06a3a', 1)], area: { x: 0, y: 0, w: DW, h: DH }, vx: -26, vy: 22, sway: 30, size: [14, 24], aspect: 0.42, tumble: true, spin: 0.6, alpha: [0.6, 0.95] }); }),
      vigLayer('ev-vig', { color: '#02070c', alpha: 0.62, inner: 0.28 }),
      grain(0.3),
    ];
  }
  SCENES.event = { id: 'event', combat: false, mood: 'fog on the shrine path', sway: 7, items: evItems() };


  // ===============================================================================================================
  // TREASURE: a glowing chest in a dark hall. One-point perspective: pillars with torches, a ribbed ceiling, a sealed far door, a raised dais with
  // a lacquer chest whose lid stands open on rotating rays of light, coins and gems spilling out, dust in a moonbeam from above.
  // ===============================================================================================================
  const TR = { vx: 640, vy: 336, cx: 560, chestY: 512 };
  const trQ = (q) => ({ l: lerp(-10, 520, q), r: lerp(1290, 760, q), t: lerp(-20, 270, q), b: lerp(740, 410, q) });

  function trHall(g) {
    const n = trQ(0), f = trQ(1);
    fillRectG(g, X0, -20, XW, 780, [[0, '#0a0614'], [1, '#0a0614']]);
    // floor, ceiling and the two walls, each a quad between the near and far frames
    const quad = (pts, stops) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach((p) => g.lineTo(p[0], p[1])); g.closePath(); g.fillStyle = stops; g.fill(); };
    quad([[n.l, n.b], [n.r, n.b], [f.r, f.b], [f.l, f.b]], tk.lin(g, 0, f.b, 0, n.b, [[0, '#2a1e44'], [0.5, '#161030'], [1, '#080512']]));
    quad([[n.l, n.t], [n.r, n.t], [f.r, f.t], [f.l, f.t]], tk.lin(g, 0, n.t, 0, f.t, [[0, '#04020a'], [1, '#180f30']]));
    quad([[n.l, n.t], [f.l, f.t], [f.l, f.b], [n.l, n.b]], tk.lin(g, n.l, 0, f.l, 0, [[0, '#0c0818'], [1, '#2a1e48']]));
    quad([[n.r, n.t], [f.r, f.t], [f.r, f.b], [n.r, n.b]], tk.lin(g, n.r, 0, f.r, 0, [[0, '#0c0818'], [1, '#2a1e48']]));
    // the far wall with a sealed door: a great arch, iron bands and a vermilion seal
    fillPoly(g, [[f.l, f.t], [f.r, f.t], [f.r, f.b], [f.l, f.b]], '#241a3e');
    const dx = 640, dy = f.b, dw = 84, dh = 130;
    g.beginPath(); g.moveTo(dx - dw / 2, dy); g.lineTo(dx - dw / 2, dy - dh * 0.6); g.quadraticCurveTo(dx - dw / 2, dy - dh, dx, dy - dh); g.quadraticCurveTo(dx + dw / 2, dy - dh, dx + dw / 2, dy - dh * 0.6); g.lineTo(dx + dw / 2, dy); g.closePath();
    g.fillStyle = '#0a0616'; g.fill(); g.lineWidth = 4; g.strokeStyle = pal.ink; g.stroke();
    g.strokeStyle = A('#5a4a8a', 0.8); g.lineWidth = 3; [0.25, 0.5, 0.75].forEach((k) => { g.beginPath(); g.moveTo(dx - dw / 2, dy - dh * k); g.lineTo(dx + dw / 2, dy - dh * k); g.stroke(); });
    g.beginPath(); g.arc(dx, dy - dh * 0.5, 15, 0, TAU); g.lineWidth = 5; g.strokeStyle = '#e8383d'; g.stroke(); g.beginPath(); g.moveTo(dx - 9, dy - dh * 0.5 - 9); g.lineTo(dx + 9, dy - dh * 0.5 + 9); g.moveTo(dx + 9, dy - dh * 0.5 - 9); g.lineTo(dx - 9, dy - dh * 0.5 + 9); g.lineWidth = 3; g.stroke();
    // stone courses on the side walls, converging on the vanishing point, and joints between blocks
    g.strokeStyle = A('#020108', 0.65);
    for (let k = 0; k <= 12; k++) { const u = k / 12; g.lineWidth = 1 + (1 - u) * 1.2; g.beginPath(); g.moveTo(n.l, lerp(n.t, n.b, u)); g.lineTo(f.l, lerp(f.t, f.b, u)); g.moveTo(n.r, lerp(n.t, n.b, u)); g.lineTo(f.r, lerp(f.t, f.b, u)); g.stroke(); }
    const r = R('tr-walls');
    for (let k = 0; k < 40; k++) { const q = Math.pow(k / 40, 1.4), w = trQ(q), q2 = trQ(Math.min(1, q + 0.025)); [w.l, w.r].forEach((x, si) => { const row = Math.floor(r() * 12), u0 = row / 12, u1 = (row + 1) / 12; g.lineWidth = 1.4 * (1 - q * 0.6); g.beginPath(); g.moveTo(x, lerp(w.t, w.b, u0)); g.lineTo(x, lerp(w.t, w.b, u1)); g.stroke(); }); }
    // floor: tile courses with a gold inlaid line down the middle
    g.strokeStyle = A('#020108', 0.7);
    for (let k = 0; k < 18; k++) { const y = lerp(f.b, n.b, Math.pow(k / 18, 1.8)); g.lineWidth = 0.8 + k * 0.12; const w = (y - f.b) / (n.b - f.b); g.beginPath(); g.moveTo(lerp(f.l, n.l, w), y); g.lineTo(lerp(f.r, n.r, w), y); g.stroke(); }
    for (let j = -6; j <= 6; j++) { g.lineWidth = 1.6; g.beginPath(); g.moveTo(640 + j * 26, f.b); g.lineTo(640 + j * 190, n.b); g.stroke(); }
    tk.inkPath(g, [[640, f.b], [640, n.b]], { w: 5, color: A('#f5c96a', 0.5), taper: 0.02, pressure: 'flat' });
    // ceiling ribs: nested arches receding
    [0.06, 0.24, 0.42, 0.6].forEach((q, i) => { const w = trQ(q), q1 = trQ(q + 0.05); tk.inkPath(g, [[w.l, w.t + (w.b - w.t) * 0.34], [w.l + (640 - w.l) * 0.3, w.t - 14 + i * 6], [640, w.t - 24 + i * 8], [w.r - (w.r - 640) * 0.3, w.t - 14 + i * 6], [w.r, w.t + (w.b - w.t) * 0.34]], { w: 16 - i * 3, color: '#0a0616', taper: 0, pressure: 'flat', wobble: 0.04, step: 10 }); tk.inkPath(g, [[w.l, w.t + (w.b - w.t) * 0.34], [w.l + (640 - w.l) * 0.3, w.t - 14 + i * 6], [640, w.t - 24 + i * 8], [w.r - (w.r - 640) * 0.3, w.t - 14 + i * 6], [w.r, w.t + (w.b - w.t) * 0.34]], { w: 3, color: A('#8a7ad8', 0.5), taper: 0, pressure: 'flat', wobble: 0.04, step: 10 }); });
  }
  function trPillars(g) {
    [0.02, 0.36, 0.62].forEach((q, i) => {
      const w = trQ(q), sc = 1 - q * 0.75, pw = 132 * sc;
      [w.l + 70 * sc, w.r - 70 * sc].forEach((x, si) => {
        const top = w.t + (w.b - w.t) * 0.02, bot = w.b - 6 * sc;
        const cx = x, l = cx - pw / 2, rr = cx + pw / 2;
        fillPoly(g, [[l, bot], [rr, bot], [rr, top], [l, top]], tk.lin(g, l, 0, rr, 0, [[0, '#1a1236'], [0.35, '#3a2c66'], [0.55, '#4a3a80'], [0.8, '#241a48'], [1, '#100a26']]));
        // hard-edged cel bands on the round shaft, the lit band facing the chest
        const litSide = si === 0 ? 1 : -1;
        fillPoly(g, litSide > 0 ? [[rr - pw * 0.34, bot], [rr - pw * 0.16, bot], [rr - pw * 0.16, top], [rr - pw * 0.34, top]] : [[l + pw * 0.16, bot], [l + pw * 0.34, bot], [l + pw * 0.34, top], [l + pw * 0.16, top]], A('#ffcf80', 0.22));
        fillPoly(g, litSide > 0 ? [[l, bot], [l + pw * 0.28, bot], [l + pw * 0.28, top], [l, top]] : [[rr - pw * 0.28, bot], [rr, bot], [rr, top], [rr - pw * 0.28, top]], A('#04020a', 0.45));
        // gold rings and a capital and base
        [0.16, 0.5, 0.84].forEach((k) => { const y = lerp(top, bot, k); fillPoly(g, [[l - 4 * sc, y], [rr + 4 * sc, y], [rr + 4 * sc, y + 12 * sc], [l - 4 * sc, y + 12 * sc]], '#b8841f'); fillPoly(g, [[l - 4 * sc, y], [rr + 4 * sc, y], [rr + 4 * sc, y + 4 * sc], [l - 4 * sc, y + 4 * sc]], '#ffe08a'); tk.inkPath(g, [[l - 4 * sc, y + 12 * sc], [rr + 4 * sc, y + 12 * sc]], { w: 2 * sc + 0.8, color: pal.ink, taper: 0, pressure: 'flat' }); });
        fillPoly(g, [[l - 14 * sc, bot], [rr + 14 * sc, bot], [rr + 10 * sc, bot - 22 * sc], [l - 10 * sc, bot - 22 * sc]], '#2a1e50');
        tk.inkPath(g, [[l, bot], [l, top]], { w: 3 * sc + 1, color: pal.ink, taper: 0, pressure: 'flat' }); tk.inkPath(g, [[rr, bot], [rr, top]], { w: 3 * sc + 1, color: pal.ink, taper: 0, pressure: 'flat' });
        // an iron torch bracket
        const ty = lerp(top, bot, 0.34), tx = litSide > 0 ? rr + 6 * sc : l - 6 * sc;
        tk.inkPath(g, [[litSide > 0 ? rr : l, ty + 8 * sc], [tx + litSide * 14 * sc, ty + 4 * sc]], { w: 5 * sc + 1, color: '#0a0616', taper: 0, pressure: 'flat' });
        fillPoly(g, [[tx + litSide * 14 * sc - 9 * sc, ty + 4 * sc], [tx + litSide * 14 * sc + 9 * sc, ty + 4 * sc], [tx + litSide * 14 * sc + 6 * sc, ty + 18 * sc], [tx + litSide * 14 * sc - 6 * sc, ty + 18 * sc]], '#0a0616');
      });
    });
  }
  function trTorches() {
    const out = [];
    [0.02, 0.36, 0.62].forEach((q) => { const w = trQ(q), sc = 1 - q * 0.75, top = w.t + (w.b - w.t) * 0.02, bot = w.b - 6 * sc, ty = lerp(top, bot, 0.34); [[w.l + 70 * sc + 66 * sc + 14 * sc, 1], [w.r - 70 * sc - 66 * sc - 14 * sc, -1]].forEach((p, i) => out.push({ x: p[0], y: ty + 4 * sc, s: sc, ph: q * 9 + i })); });
    return out;
  }

  function coinPile(g, cx, cy, w, h, seed) {
    const r = R('coins', seed), list = [];
    for (let i = 0; i < 120; i++) { const u = r(), v = Math.pow(r(), 0.8), x = cx + (u - 0.5) * w * (1 - v * 0.7), y = cy - v * h + (r() - 0.5) * 6; list.push([x, y, r()]); }
    list.sort((a, b) => a[1] - b[1]);
    list.forEach((c) => { g.save(); g.translate(c[0], c[1]); g.rotate((c[2] - 0.5) * 0.7); g.fillStyle = '#7a4a10'; g.beginPath(); g.ellipse(0, 1.4, 9, 4.8, 0, 0, TAU); g.fill(); g.fillStyle = c[2] < 0.5 ? '#f5c96a' : '#ffe08a'; g.beginPath(); g.ellipse(0, 0, 9, 4.6, 0, 0, TAU); g.fill(); g.strokeStyle = A('#5a3408', 0.9); g.lineWidth = 1; g.stroke(); g.fillStyle = A('#fffbe0', 0.7); g.beginPath(); g.ellipse(-2.5, -1, 3, 1.2, 0, 0, TAU); g.fill(); g.restore(); });
  }
  function trChest(g) {
    const cx = TR.cx, by = TR.chestY, w = 232, h = 118, d = 52;
    // the dais: three stone steps with a gold trim, and the shadow under the chest
    [[380, 30], [320, 22], [268, 16]].forEach((s, i) => {
      const y = by + 12 + 26 - i * 0 + (2 - i) * 22 - 26, hw = s[0];
      const yy = by + 52 - i * 24, hh = 24;
      tk.celFill(g, [[cx - hw, yy], [cx + hw, yy], [cx + hw - 12, yy - hh], [cx - hw + 12, yy - hh]], i === 2 ? '#4a3a80' : '#3a2c68', { line: 3, depth: 5, hi: 'auto', hiW: 2, shadow: '#1a1238', rim: '#ffcf80', rimSide: 'light', rimW: 2, rimAlpha: 0.6, tension: 0.08 });
      fillPoly(g, [[cx - hw + 12, yy - hh], [cx + hw - 12, yy - hh], [cx + hw - 12, yy - hh + 4], [cx - hw + 12, yy - hh + 4]], A('#ffe08a', 0.6));
    });
    blob(g, cx, by + 6, 160, 20, '#020108', 0.7);
    // spilled coins in front and around
    coinPile(g, cx - 120, by + 6, 120, 30, 1); coinPile(g, cx + 150, by + 8, 130, 34, 2);
    // body of the chest: front, side, straps, lock
    const fx0 = cx - w / 2, fx1 = cx + w / 2, fy0 = by - h * 0.55, fy1 = by;
    tk.celFill(g, [[fx1, fy0], [fx1 + d, fy0 - d * 0.42], [fx1 + d, fy1 - d * 0.42], [fx1, fy1]], '#5a1220', { line: 3.4, depth: 6, hi: false, shadow: '#2a0812', rim: '#ff9a4a', rimSide: 'light', rimW: 2, rimAlpha: 0.6, tension: 0.05 });
    tk.celFill(g, [[fx0, fy0], [fx1, fy0], [fx1, fy1], [fx0, fy1]], '#8a1a2c', { line: 3.6, depth: 9, hi: 'auto', hiW: 2, shadow: '#4a0e1c', rim: '#ff9a4a', rimSide: 'light', rimW: 2.4, rimAlpha: 0.75, tension: 0.06 });
    const gold = (pts, ln) => tk.celFill(g, pts, '#f5c96a', { line: ln || 2.4, depth: 3, hi: 'auto', hiW: 1.4, shadow: '#b8741f', rim: '#fffbe0', rimSide: 'light', rimW: 1.2, rimAlpha: 0.9, tension: 0.06 });
    [fx0 + 16, fx1 - 36].forEach((x) => gold([[x, fy0], [x + 20, fy0], [x + 20, fy1], [x, fy1]]));
    gold([[fx0, fy0 + 32], [fx1, fy0 + 32], [fx1, fy0 + 44], [fx0, fy0 + 44]]);
    gold([[cx - 22, fy0 + 20], [cx + 22, fy0 + 20], [cx + 22, fy0 + 66], [cx, fy0 + 78], [cx - 22, fy0 + 66]]);
    disc(g, cx, fy0 + 46, 6, pal.ink); tk.inkStroke(g, cx, fy0 + 46, cx, fy0 + 60, { w: 4, color: pal.ink, taper: 0.1, pressure: 'flat' });
    [[fx0, fy1], [fx1, fy1]].forEach((c) => gold([[c[0] - 6, c[1] - 30], [c[0] + 24, c[1] - 30], [c[0] + 24, c[1]], [c[0] - 6, c[1]]]));
    // the open top: a gold-lit mound of coins and gems, and the lid standing up behind it
    tk.celFill(g, [[fx0, fy0], [fx1, fy0], [fx1 + d, fy0 - d * 0.42], [fx0 + d, fy0 - d * 0.42]], '#ffd870', { line: 3, depth: 2, hi: false, shadow: '#e0a040', tension: 0.05 });
    coinPile(g, cx + d * 0.4, fy0 - 6, w * 0.9, 44, 3);
    const lid = [[fx0 + d * 0.9, fy0 - d * 0.36], [fx1 + d * 0.9, fy0 - d * 0.36], [fx1 + d * 1.2, fy0 - d * 0.36 - h * 0.86], [fx0 + d * 1.2, fy0 - d * 0.36 - h * 0.86]];
    const back = () => { g.save(); g.globalCompositeOperation = 'destination-over'; g.restore(); };
    return { fx0, fx1, fy0, lid, cx, by, w, h, d };
  }

  function chestLidBack(g) {                                        // drawn BEFORE the chest body so the lid stands behind the treasure
    const cx = TR.cx, by = TR.chestY, w = 232, h = 118, d = 52, fx0 = cx - w / 2, fx1 = cx + w / 2, fy0 = by - h * 0.55;
    const l = [[fx0 + d * 0.9, fy0 - d * 0.36], [fx1 + d * 0.9, fy0 - d * 0.36], [fx1 + d * 1.15, fy0 - d * 0.36 - h * 0.9], [fx0 + d * 1.15, fy0 - d * 0.36 - h * 0.9]];
    tk.celFill(g, l, '#7a1626', { line: 3.6, depth: 8, hi: false, shadow: '#3a0a14', rim: '#ff9a4a', rimSide: 'light', rimW: 2, rimAlpha: 0.7, tension: 0.06 });
    const inner = [[l[0][0] + 12, l[0][1] - 6], [l[1][0] - 12, l[1][1] - 6], [l[2][0] - 12, l[2][1] + 10], [l[3][0] + 12, l[3][1] + 10]];
    g.beginPath(); tk.trace(g, { poly: inner }); g.fillStyle = tk.lin(g, 0, inner[3][1], 0, inner[0][1], [[0, '#ffe8a0'], [0.5, '#f5b850'], [1, '#c8802a']]); g.fill();
    g.lineWidth = 2; g.strokeStyle = A('#5a3408', 0.9); g.stroke();
    // padded quilting lines inside the lid
    g.strokeStyle = A('#8a5010', 0.5); g.lineWidth = 1.4;
    for (let k = 1; k < 4; k++) { const t = k / 4; g.beginPath(); g.moveTo(lerp(inner[0][0], inner[3][0], t), lerp(inner[0][1], inner[3][1], t)); g.lineTo(lerp(inner[1][0], inner[2][0], t), lerp(inner[1][1], inner[2][1], t)); g.stroke(); g.beginPath(); g.moveTo(lerp(inner[3][0], inner[2][0], t), lerp(inner[3][1], inner[2][1], t)); g.lineTo(lerp(inner[0][0], inner[1][0], t), lerp(inner[0][1], inner[1][1], t)); g.stroke(); }
    const gold = (pts) => tk.celFill(g, pts, '#f5c96a', { line: 2.2, depth: 3, hi: false, shadow: '#b8741f', tension: 0.06 });
    gold([[l[3][0] - 6, l[3][1] - 8], [l[2][0] + 6, l[2][1] - 8], [l[2][0] + 6, l[2][1] + 12], [l[3][0] - 6, l[3][1] + 12]]);
  }
  function trGems(g) {
    const cx = TR.cx, by = TR.chestY, r = R('tr-gems');
    const cols = ['#e8383d', '#3a7aff', '#3aa878', '#f5c96a', '#c05aff'];
    for (let i = 0; i < 14; i++) { const x = cx + (r() - 0.5) * 300 + 20, y = by - 70 + (r() - 0.3) * 56; if (Math.abs(x - cx) > 150 && y < by - 30) continue; gemShape(g, x, y, 6 + r() * 5, cols[i % 5], i % 3); }
    for (let i = 0; i < 8; i++) { const side = i % 2 ? 1 : -1; gemShape(g, cx + side * (170 + r() * 120), by + 16 + r() * 22, 5 + r() * 5, cols[(i + 2) % 5], i % 3); }
  }
  function trRaysSpr() {
    return mkSpr('tr|rays', 900, 900, (g) => {
      g.translate(450, 450);
      const r = R('tr-rays');
      for (let i = 0; i < 14; i++) {
        const am = (i / 14) * TAU + (r() - 0.5) * 0.2, wv = (0.05 + r() * 0.06) * (1 + 0.3 * (i % 2));
        for (let k = 0; k < 3; k++) {
          const ww = wv * (1.6 - k * 0.5), a0 = am - ww / 2, a1 = am + ww / 2;
          g.fillStyle = tk.lin(g, 0, 0, Math.cos(am) * 450, Math.sin(am) * 450, [[0, A('#fff0c0', 0.8 * (0.3 + k * 0.3))], [0.5, A('#ffd880', 0.3 * (0.3 + k * 0.3))], [1, A('#ffd880', 0)]]);
          g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a0) * 450, Math.sin(a0) * 450); g.lineTo(Math.cos(a1) * 450, Math.sin(a1) * 450); g.closePath(); g.fill();
        }
      }
    });
  }
  function trBanners(g) {
    [[300, 0], [980, 1]].forEach((b, i) => {
      const x = b[0], top = 30;
      tk.inkStroke(g, x - 34, top, x + 34, top, { w: 6, color: '#0a0616', taper: 0, pressure: 'flat' });
      fillPoly(g, [[x - 30, top + 2], [x + 30, top + 2], [x + 26, top + 150], [x + 10, top + 132], [x, top + 160], [x - 12, top + 134], [x - 26, top + 152]], i ? '#4a1a6a' : '#7a1a3a');
      tk.inkPath(g, { poly: [[x - 30, top + 2], [x + 30, top + 2], [x + 26, top + 150], [x + 10, top + 132], [x, top + 160], [x - 12, top + 134], [x - 26, top + 152], [x - 30, top + 2]] }, { w: 2.4, color: pal.ink, taper: 0, pressure: 'flat', wobble: 0.1 });
      tk.inkPath(g, tk.arcPts(x, top + 60, 14, 14, -0.4, 5.2, 12), { w: 4, color: '#f5c96a', pressure: 'head', taperEnd: 0.4, wobble: 0.2, seed: i });
      fillPoly(g, [[x - 30, top + 2], [x - 22, top + 2], [x - 20, top + 150], [x - 26, top + 152]], A('#000000', 0.25));
    });
  }

  function trItems() {
    const ray = trRaysSpr(), torches = trTorches();
    return [
      layer('hall', full(-20, 760), 0.03, trHall),
      layer('banners', full(0, 240), 0.08, trBanners),
      // the moonbeam from an oculus above, with dust drifting through it
      anim((ctx, T) => { addMode(ctx, () => { ctx.save(); ctx.globalAlpha = 0.34 + 0.06 * Math.sin(T.tt * 0.5); ctx.fillStyle = tk.lin(ctx, 0, 0, 0, 560, [[0, A('#c8d8ff', 0.7)], [0.7, A('#a0b8ff', 0.16)], [1, A('#a0b8ff', 0)]]); ctx.beginPath(); ctx.moveTo(710, -10); ctx.lineTo(860, -10); ctx.lineTo(950, 560); ctx.lineTo(650, 560); ctx.closePath(); ctx.fill(); ctx.restore(); }); }),
      layer('pillars', full(-20, 760), 0.1, trPillars),
      layer('chestLid', { x: 300, y: 260, w: 520, h: 300 }, 0.16, chestLidBack),
      layer('chest', { x: 230, y: 340, w: 680, h: 330 }, 0.16, (g) => { trChest(g); trGems(g); }),
      anim((ctx, T) => {
        const p = 0.75 + 0.25 * Math.sin(T.tt * 1.4), cx = TR.cx + 44 - T.par * 0.16, cy = TR.chestY - 78;
        addMode(ctx, () => {
          glowE(ctx, cx, cy - 20, 420, 260, '#ffcf6a', 0.3 * p); glowE(ctx, cx, cy - 30, 170, 110, '#fff0c0', 0.3 * p);
          glowE(ctx, TR.cx - T.par * 0.16, TR.chestY + 30, 620, 96, '#ffcf6a', 0.26 * p);
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(T.tt * 0.07); ctx.globalAlpha = 0.3 * p; ART.blit(ctx, ray, -520, -520, 1040, 1040); ctx.restore();
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(-T.tt * 0.045 + 1); ctx.globalAlpha = 0.2 * p; ART.blit(ctx, ray, -420, -420, 840, 840); ctx.restore();
        });
      }),
      anim((ctx, T) => {
        const tg = [];
        torches.forEach((t) => {
          const fl = 0.82 + 0.18 * Math.sin(T.tt * 8.7 + t.ph) * Math.sin(T.tt * 3.3 + t.ph * 2), x = t.x - T.par * 0.1;
          tg.push(x, t.y, t.s, fl);
          ctx.save(); ctx.translate(x, t.y); ctx.scale(t.s, t.s); flamePaint(ctx, 0, 0, 34, T.tt, t.ph, true); ctx.restore();
        });
        addMode(ctx, () => { for (let i = 0; i < tg.length; i += 4) { glowAt(ctx, tg[i], tg[i + 1] - 20 * tg[i + 2], 130 * tg[i + 2] * tg[i + 3], '#ff8a3a', 0.5 * tg[i + 3]); glowAt(ctx, tg[i], tg[i + 1] - 16 * tg[i + 2], 34 * tg[i + 2], '#fff0b0', 0.55 * tg[i + 3]); } });
        sparks(ctx, T, { key: 'tr-sparks', n: 18, x: TR.cx + 44, y: TR.chestY - 90, spread: 90, rise: 200, life: 3.6, color: '#ffd060', hot: '#fffbe0', size: 6 });
        fireflies(ctx, T, { key: 'tr-dust', n: 22, area: { x: 660, y: 40, w: 260, h: 520 }, color: '#fff0c8', core: '#ffffff', size: 5, speed: 0.5 });
        for (let i = 0; i < 9; i++) { const ph = i * 1.9, tw = Math.pow(Math.max(0, Math.sin(T.tt * (1.2 + i * 0.17) + ph)), 3); if (tw > 0.08) tk.sparkle(ctx, TR.cx + 44 + Math.cos(ph * 3.1) * (60 + i * 16) - T.par * 0.16, TR.chestY - 110 + Math.sin(ph * 2.3) * (40 + i * 8), 5 + 12 * tw, { color: i % 2 ? '#ffffff' : '#ffe9a8', alpha: tw, glow: 0.6, rot: ph }); }
      }),
      mistLayer('tr-mist', 500, 160, '#5a4a9a', 0.24, 5, 0.2, 81),
      vigLayer('tr-vig', { color: '#020108', alpha: 0.72, inner: 0.26 }),
      grain(0.3),
    ];
  }
  SCENES.treasure = { id: 'treasure', combat: false, mood: 'a glowing chest in the dark hall', sway: 6, items: trItems() };


  // ===============================================================================================================
  // THE LOGO: ECHOWAKE in hand-built brush strokes. Each letter is a few calligraphic strokes (thick pressed start, tapering flick), drawn as gold
  // leaf over ink with cel shading, bristle streaks and gold flecks, baked once per width; the glow, sparkles and the sound-ring pulses are live.
  // ===============================================================================================================
  // Letter skeletons in a 100-unit-tall box (y down). p: control points, w: brush width in units, pr: pressure ('head' thick to thin, 'mid', 'flat'),
  // ts/te: taper fractions of the two ends. adv: advance to the next letter.
  const LOGO_LETTERS = [
    { ch: 'E', adv: 80, s: [
      { p: [[12, 5], [14, 50], [10, 96]], w: 19, pr: 'head', te: 0.3 },
      { p: [[12, 9], [38, 4], [66, 11], [69, 26]], w: 11, pr: 'head', te: 0.3 },
      { p: [[14, 50], [34, 46], [54, 51]], w: 8, pr: 'head', te: 0.4 },
      { p: [[10, 92], [40, 90], [66, 91], [72, 77]], w: 12, pr: 'head', te: 0.3 }] },
    { ch: 'C', adv: 88, s: [
      { p: [[72, 16], [48, 4], [20, 18], [10, 50], [22, 84], [48, 97], [74, 86]], w: 21, pr: 'mid', ts: 0.1, te: 0.18 },
      { p: [[64, 8], [74, 12], [78, 22]], w: 7, pr: 'mid', ts: 0.3, te: 0.3 }] },
    { ch: 'H', adv: 94, s: [
      { p: [[12, 5], [14, 50], [10, 97]], w: 19, pr: 'head', te: 0.3 },
      { p: [[80, 4], [79, 50], [82, 96]], w: 19, pr: 'head', te: 0.3 },
      { p: [[14, 52], [46, 47], [79, 51]], w: 10, pr: 'head', te: 0.35 },
      { p: [[2, 9], [12, 4], [26, 10]], w: 6.5, pr: 'mid', ts: 0.3, te: 0.3 }] },
    { ch: 'O', adv: 102, s: [
      { p: [[56, 6], [26, 15], [10, 50], [24, 85], [54, 95]], w: 23, pr: 'mid', ts: 0.12, te: 0.12 },
      { p: [[44, 5], [76, 15], [90, 50], [76, 85], [44, 96]], w: 21, pr: 'mid', ts: 0.12, te: 0.12 }] },
    { ch: 'W', adv: 146, s: [
      { p: [[6, 5], [20, 50], [34, 96]], w: 20, pr: 'head', te: 0.3 },
      { p: [[34, 96], [52, 52], [70, 9]], w: 10, pr: 'mid', ts: 0.15, te: 0.25 },
      { p: [[68, 7], [88, 52], [104, 96]], w: 20, pr: 'head', te: 0.3 },
      { p: [[104, 96], [122, 52], [140, 5]], w: 10, pr: 'mid', ts: 0.15, te: 0.3 },
      { p: [[0, 9], [10, 4], [22, 10]], w: 6.5, pr: 'mid', ts: 0.3, te: 0.3 }] },
    { ch: 'A', adv: 96, s: [
      { p: [[48, 4], [28, 50], [8, 96]], w: 12, pr: 'mid', ts: 0.15, te: 0.25 },
      { p: [[46, 6], [66, 50], [88, 96]], w: 22, pr: 'head', te: 0.3 },
      { p: [[24, 64], [50, 60], [76, 65]], w: 8, pr: 'head', te: 0.4 }] },
    { ch: 'K', adv: 90, s: [
      { p: [[12, 5], [14, 50], [10, 97]], w: 19, pr: 'head', te: 0.3 },
      { p: [[74, 4], [48, 32], [22, 60]], w: 13, pr: 'head', te: 0.4 },
      { p: [[26, 50], [50, 72], [80, 97]], w: 21, pr: 'mid', ts: 0.06, te: 0.3 },
      { p: [[2, 9], [12, 4], [26, 10]], w: 6.5, pr: 'mid', ts: 0.3, te: 0.3 }] },
    { ch: 'E', adv: 80, s: [
      { p: [[12, 5], [14, 50], [10, 96]], w: 19, pr: 'head', te: 0.3 },
      { p: [[12, 9], [38, 4], [66, 11], [69, 26]], w: 11, pr: 'head', te: 0.3 },
      { p: [[14, 50], [34, 46], [54, 51]], w: 8, pr: 'head', te: 0.4 },
      { p: [[10, 92], [40, 90], [66, 91], [72, 77]], w: 12, pr: 'head', te: 0.3 }] },
  ];
  const LOGO_SLANT = 0.09;                                           // top leans right, like a brush hand
  const LOGO_GOLD = { top: '#fff2c0', mid: '#f5c96a', bot: '#cf8b2e', shade: '#b8741f', hi: '#fffbe0', deep: '#7a3f18' };

  // sampled ribbon geometry of one stroke: centre points, unit normals, widths. pts already in px.
  function strokeGeo(pts, W, pr, ts, te, seed) {
    const d = tk.flatten(pts, { step: 2.2 }), m = d.length >> 1;
    const L = [0];
    for (let i = 1; i < m; i++) L.push(L[i - 1] + Math.hypot(d[2 * i] - d[2 * i - 2], d[2 * i + 1] - d[2 * i - 1]));
    const total = L[m - 1] || 1, c = [], nn = [], ww = [];
    for (let i = 0; i < m; i++) {
      const u = L[i] / total, a = Math.max(0, i - 1), b = Math.min(m - 1, i + 1);
      let tx = d[2 * b] - d[2 * a], ty = d[2 * b + 1] - d[2 * a + 1];
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      let w = W * (pr === 'head' ? 1 - 0.55 * u : pr === 'flat' ? 1 : 0.68 + 0.32 * Math.sin(PI * u));
      if (ts > 0 && u < ts) w *= 0.15 + 0.85 * ss(0, ts, u);
      if (te > 0 && u > 1 - te) w *= 0.1 + 0.9 * ss(0, te, 1 - u);
      w *= 1 + 0.07 * (nz(L[i] * 0.05, seed, seed, 2) * 2 - 0.8);
      c.push([d[2 * i], d[2 * i + 1]]); nn.push([-ty, tx]); ww.push(Math.max(0.4, w));
    }
    return { c, n: nn, w: ww, total };
  }
  // polygon between fractions a < b of the width (from the centre line), pushed outward by `add` px at both edges
  function band(geo, a, b, add) {
    const P = [], m = geo.c.length;
    for (let i = 0; i < m; i++) P.push([geo.c[i][0] + geo.n[i][0] * (b * geo.w[i] + add), geo.c[i][1] + geo.n[i][1] * (b * geo.w[i] + add)]);
    for (let i = m - 1; i >= 0; i--) P.push([geo.c[i][0] + geo.n[i][0] * (a * geo.w[i] - add), geo.c[i][1] + geo.n[i][1] * (a * geo.w[i] - add)]);
    return P;
  }
  const LOGO_CACHE = new Map();
  function logoLayout(w) {
    const key = Math.round(w);
    let L = LOGO_CACHE.get(key);
    if (L) return L;
    let totalU = 0;
    LOGO_LETTERS.forEach((l) => { totalU += l.adv; });
    totalU -= 6;
    const k = w / totalU, H = 100 * k;
    const strokes = [], anchors = [];
    let ox = 0, si = 0;
    const X = (x, y) => (ox + x + (50 - y) * LOGO_SLANT - totalU / 2) * k;         // local px relative to the logo centre
    const Y = (y) => (y - 50) * k;
    LOGO_LETTERS.forEach((l, li) => {
      l.s.forEach((s) => {
        const pts = s.p.map((p) => [X(p[0], p[1]), Y(p[1])]);
        strokes.push({ geo: strokeGeo(pts, s.w * k, s.pr, s.ts || 0, s.te === undefined ? 0.25 : s.te, si++), w: s.w * k, pts, thin: s.w < 14 });
      });
      if (l.ch === 'O') { anchors.push({ x: X(50, 50), y: Y(50), r: 0.045 * H, T: 5.2, ph: 0.0, len: 0.8 * H }); anchors.moon = { x: X(50, 50), y: Y(50), r: 0.13 * H }; }
      if (l.ch === 'K') anchors.push({ x: X(80, 97), y: Y(98), r: 0.04 * H, T: 7.3, ph: 0.34, len: 0.6 * H });
      if (l.ch === 'E' && li === 7) anchors.push({ x: X(56, 51), y: Y(51), r: 0.04 * H, T: 6.1, ph: 0.61, len: 0.55 * H });
      ox += l.adv;
    });
    const mx = 0.09 * w, my = 0.34 * H;
    L = { k, H, w, totalU, strokes, anchors, moon: anchors.moon, sw: w + 2 * mx, sh: H + 2 * my, mx, my };
    if (LOGO_CACHE.size > 12) LOGO_CACHE.clear();
    LOGO_CACHE.set(key, L);
    return L;
  }

  function paintLogo(g, L) {
    const cx = L.sw / 2, cy = L.sh / 2, k = L.k, H = L.H;
    g.translate(cx, cy);
    const gold = LOGO_GOLD;
    const lightDir = [Math.cos(tk.light), Math.sin(tk.light)];
    const lightSide = (geo) => { let s = 0; for (let i = 0; i < geo.n.length; i++) s += geo.n[i][0] * lightDir[0] + geo.n[i][1] * lightDir[1]; return s >= 0 ? 1 : -1; };
    const cap = (geo, add, fill, at) => {                                // round blunt cap at the pressed start
      const i = at === 'end' ? geo.c.length - 1 : 0, r = geo.w[i] / 2 + add;
      if (r > 0.6) { g.beginPath(); g.arc(geo.c[i][0], geo.c[i][1], r, 0, TAU); g.fillStyle = fill; g.fill(); }
    };
    // 1. ink drop shadow, 2. ink outline
    g.save(); g.translate(-0.04 * H, 0.075 * H);
    L.strokes.forEach((s) => { fillPoly(g, band(s.geo, -0.5, 0.5, 0.062 * H), A('#0d0b1e', 0.55)); });
    g.restore();
    const out = 0.062 * H;
    L.strokes.forEach((s) => { fillPoly(g, band(s.geo, -0.5, 0.5, out), pal.ink); });
    // 3. gold body with a vertical leaf gradient
    const grad = tk.lin(g, 0, -H * 0.5, 0, H * 0.5, [[0, gold.top], [0.5, gold.mid], [1, gold.bot]]);
    L.strokes.forEach((s) => { fillPoly(g, band(s.geo, -0.5, 0.5, 0), grad); });
    // 4. cel shading: hard shadow strip on the far side from the light, highlight strip on the near side
    L.strokes.forEach((s) => {
      const sd = lightSide(s.geo);
      fillPoly(g, sd > 0 ? band(s.geo, -0.5, -0.1, 0) : band(s.geo, 0.1, 0.5, 0), A(gold.shade, 0.85));
      fillPoly(g, sd > 0 ? band(s.geo, 0.24, 0.4, 0) : band(s.geo, -0.4, -0.24, 0), A(gold.hi, 0.9));
    });
    // 5. dry-brush bristle streaks along the strokes
    L.strokes.forEach((s, si) => {
      if (s.thin) return;
      const r = R('logo', si);
      for (let j = 0; j < 4; j++) {
        const f = -0.3 + j * 0.2 + (r() - 0.5) * 0.08, u0 = r() * 0.4, u1 = u0 + 0.25 + r() * 0.4, m = s.geo.c.length;
        const i0 = Math.floor(u0 * (m - 1)), i1 = Math.min(m - 1, Math.floor(u1 * (m - 1)));
        const line = [];
        for (let i = i0; i <= i1; i++) line.push([s.geo.c[i][0] + s.geo.n[i][0] * f * s.geo.w[i], s.geo.c[i][1] + s.geo.n[i][1] * f * s.geo.w[i]]);
        if (line.length > 3) tk.inkPath(g, line, { w: 0.7 + r() * 0.9, color: r() < 0.5 ? gold.deep : '#fffbe0', alpha: 0.35, taper: 0.5, wobble: 0.1, seed: si * 7 + j, step: 3 });
      }
    });
    // 6. gold-leaf flecks: little foil flakes scattered along the strokes
    const fr = R('logofleck');
    L.strokes.forEach((s) => {
      if (s.thin) return;
      const n = Math.round(s.geo.total / (0.085 * H));
      for (let j = 0; j < n; j++) {
        const i = Math.floor(fr() * (s.geo.c.length - 1)), f = (fr() - 0.5) * 0.7, x = s.geo.c[i][0] + s.geo.n[i][0] * f * s.geo.w[i], y = s.geo.c[i][1] + s.geo.n[i][1] * f * s.geo.w[i];
        const sz = (0.008 + fr() * 0.014) * H, a = fr() * PI;
        const col = fr() < 0.4 ? '#fffbe0' : fr() < 0.5 ? '#ffe08a' : '#b8741f';
        g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = A(col, 0.85);
        g.beginPath(); g.moveTo(-sz, -sz * 0.45); g.lineTo(sz * 0.8, -sz * 0.6); g.lineTo(sz, sz * 0.4); g.lineTo(-sz * 0.6, sz * 0.7); g.closePath(); g.fill(); g.restore();
      }
    });
    // 7. the echo ping inside the O: a gold dot, one gold ring and an outer ring broken into left and right arcs, each over an ink line
    if (L.moon) {
      const m = L.moon, dotR = m.r * 0.55, ringR = m.r * 1.0, outR = m.r * 1.45, lw = m.r * 0.18;
      const arcs = (r) => { g.beginPath(); g.arc(m.x, m.y, r, PI * 0.65, PI * 1.35); g.moveTo(m.x + Math.cos(-PI * 0.35) * r, m.y + Math.sin(-PI * 0.35) * r); g.arc(m.x, m.y, r, -PI * 0.35, PI * 0.35); };
      g.lineCap = 'round';
      g.strokeStyle = pal.ink; g.lineWidth = lw * 1.9; g.beginPath(); g.arc(m.x, m.y, ringR, 0, TAU); g.stroke(); arcs(outR); g.stroke();
      disc(g, m.x, m.y, dotR * 1.28, pal.ink);
      g.strokeStyle = '#f5c96a'; g.lineWidth = lw; g.beginPath(); g.arc(m.x, m.y, ringR, 0, TAU); g.stroke();
      g.lineWidth = lw * 0.8; arcs(outR); g.stroke();
      const mg = tk.rad(g, m.x - dotR * 0.3, m.y - dotR * 0.3, 1, m.x, m.y, dotR, [[0, '#fffbe0'], [0.6, '#ffd97a'], [1, '#e0a040']]);
      disc(g, m.x, m.y, dotR, mg);
    }
    // outer ink splatter flecks around the word
    const sr = R('logosplat');
    for (let i = 0; i < 22; i++) {
      const x = (sr() - 0.5) * L.w * 1.02, y = (sr() - 0.5) * H * 1.5, rr = (0.006 + sr() * sr() * 0.02) * H;
      if (Math.abs(y) < H * 0.5 && Math.abs(x) < L.w * 0.48) continue;
      if (i % 4 === 0) tk.note(g, x, y + H * 0.04, H * 0.075, { kind: ['eighth', 'quarter', 'beamed'][(i >> 2) % 3], color: '#f5c96a', alpha: 0.85, line: Math.max(1, H * 0.012) });
      else disc(g, x, y, rr, A(pal.ink, 0.85));
    }
  }

  // a sound-ring pulse at an anchor: a ring grows from the anchor's radius to six times that and fades (gold, then cyan), and a small note rises and fades.
  // u is the phase 0..1 of its own cycle.
  function drawPulse(ctx, ax, ay, a, t, H) {
    const u = (((t / a.T) + a.ph) % 1 + 1) % 1, r = a.r;
    if (u < 0.6) {
      const k = u / 0.6, rr = lerp(r, r * 6, 1 - Math.pow(1 - k, 2));
      ctx.save();
      ctx.globalAlpha *= cA(1 - k);
      ctx.lineWidth = Math.max(0.5, lerp(r * 0.5, 0.5, k));
      ctx.strokeStyle = k < 0.5 ? '#ffe9a8' : '#5ff5ff';
      ctx.beginPath(); ctx.arc(ax, ay, rr, 0, TAU); ctx.stroke();
      if (k < 0.7) { ctx.globalAlpha *= 0.6; ctx.lineWidth = Math.max(0.5, r * 0.18); ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.arc(ax, ay, rr * 0.94, 0, TAU); ctx.stroke(); }
      ctx.restore();
    }
    if (u > 0.2 && u < 0.8) {
      const k = (u - 0.2) / 0.6, fade = Math.sin(PI * k);
      tk.note(ctx, ax + Math.sin(k * 5 + a.ph * 9) * r, ay - a.len * 0.6 * k, r * 3, { kind: a.T < 6 ? 'eighth' : 'quarter', color: '#fff4d0', alpha: fade * 0.95, line: Math.max(0.8, r * 0.35) });
    }
  }

  function logoDraw(ctx, x, y, w, t) {
    const L = logoLayout(w), H = L.H;
    const sprite = ART.sprite('sc|logo|' + Math.round(w), L.sw, L.sh, (g) => paintLogo(g, L));
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.4);
    // soft glow behind the lettering: warm gold under violet, breathing
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glowE(ctx, x, y, w * 0.62, H * 1.1, '#7a5cff', 0.34 + 0.08 * pulse);
    glowE(ctx, x, y, w * 0.5, H * 0.72, '#ffcf6a', 0.3 + 0.1 * pulse);
    ctx.restore();
    ART.blit(ctx, sprite, x - L.sw / 2, y - L.sh / 2, L.sw, L.sh);
    // gold sparkles that twinkle on the highlights
    const sp = [[0.075, -0.4, 0.0], [0.27, 0.34, 1.7], [0.41, -0.42, 3.1], [0.6, 0.42, 4.4], [0.79, -0.38, 2.2], [0.95, 0.3, 5.3]];
    sp.forEach((p, i) => {
      const tw = Math.pow(Math.max(0, Math.sin(t * (1.3 + i * 0.17) + p[2])), 3);
      if (tw > 0.05) tk.sparkle(ctx, x + (p[0] - 0.5) * L.w, y + p[1] * H * 1.05, H * (0.07 + 0.11 * tw), { color: i % 2 ? '#fffbe0' : '#ffe9a8', alpha: tw, rot: 0.2 * i, glow: 0.5 });
    });
    L.anchors.forEach((a) => drawPulse(ctx, x + a.x, y + a.y, a, t, H));
  }


  // ===============================================================================================================
  // VICTORY: dawn. A low golden sun on rose hills, lit clouds, cranes crossing the light, the temple bell free on a boulder, its striker pulled
  // back, a gold ring leaving its lip every 2.4 s, a sakura branch, petals on a warm wind, notes and gold leaf in the air.
  // ===============================================================================================================
  const VC = { sx: 720, sy: 452 };
  function vcSky(g) {
    fillRectG(g, X0, 0, XW, 500, [[0, '#3f3486'], [0.22, '#7a64c4'], [0.42, '#e08cc0'], [0.6, '#ffb0a0'], [0.8, '#ffd898'], [1, '#fff0c0']]);
    if (!tk.lowQ()) tk.halftoneRamp(g, X0, 250, XW, 230, { d: 9, dir: PI / 2, r0: 0.2, r1: 3.1, color: '#e0609a', alpha: 0.16 });
    const r = R('vc-stars');
    for (let i = 0; i < 40; i++) { const x = X0 + r() * XW, y = r() * 150, s = 0.6 + r() * 1.1; g.fillStyle = A('#ffffff', 0.25 + 0.4 * r()); g.fillRect(x, y, s, s); }
    blob(g, VC.sx, VC.sy, 760, 520, '#ffd898', 0.9); blob(g, VC.sx, VC.sy, 340, 260, '#fff6d8', 0.95);
    disc(g, VC.sx, VC.sy, 96, '#fffbe8');
    tk.inkPath(g, tk.ellipsePts(VC.sx, VC.sy, 96, 96, 24), { closed: true, w: 2.6, color: A('#f5a04a', 0.8), align: 0.5, weightVar: 0.2 });
    tk.inkPath(g, tk.ellipsePts(VC.sx, VC.sy, 132, 132, 26), { closed: true, w: 1.4, color: A('#ffe9a8', 0.7), align: 0.5, weightVar: 0.2 });
  }
  function vcClouds(g) {
    [[200, 150, 420, 56, 1], [720, 96, 480, 60, 2], [1150, 190, 360, 52, 3], [430, 290, 340, 40, 4], [980, 300, 380, 42, 5]].forEach((c) => wrapDraw(c[0], c[2] * 0.7, (x) => {
      streak(g, x, c[1] + c[3] * 0.7, c[2] * 1.3, c[3] * 0.8, '#ffc0b0', 0.3, c[4]);
      cloudBand(g, x, c[1], c[2], c[3], { seed: c[4], base: '#ffd0c0', shade: '#d078a8', lit: '#fffbe0', lean: 18 });
    }));
  }
  function vcHills(g) {
    [{ sd: 71, base: 430, amp: 84, freq: 0.0026, top: '#d888b0', bot: '#f8b498' }, { sd: 73, base: 470, amp: 64, freq: 0.0036, top: '#b06a9a', bot: '#f0a08e' }, { sd: 79, base: 506, amp: 44, freq: 0.0048, top: '#8a5a8a', bot: '#e08c84' }].forEach((h, i) => {
      const pts = ridgePts(h.sd, X0, X0 + XW, h.base, h.amp, h.freq, { oct: 4 });
      fillRidge(g, pts, 600, tk.lin(g, 0, h.base - h.amp, 0, 600, [[0, h.top], [0.5, h.bot], [0.85, mixc(h.bot, '#ffe0a0', 0.6)], [1, '#ffe0a0']]));
      tk.inkPath(g, pts.filter((p) => Math.abs(p[0] - VC.sx) < 560), { w: 1.8, color: A('#fff6d0', 0.7), taper: 0.4, wobble: 0.1, seed: i });
      haze(g, h.base + 30, 560, '#ffe0a0', 0, 0.3);
      if (i === 1) torii(g, 250, ridgeY(pts, 250) + 3, 56, { col: '#d8605a', shade: '#a4424e', alpha: 0.85 });
      if (i === 2) pagoda(g, 1050, ridgeY(pts, 1050) + 4, 120, '#7a4a7a', '#ffe0a0');
    });
    const r = R('vc-trees');
    for (let x = X0; x < X0 + XW; x += 26 + r() * 30) { const y = 528 + (r() - 0.5) * 10, h = 24 + r() * 30; fillPoly(g, [[x, y], [x + 7, y - h], [x + 14, y]], A(mixc('#6a4a7a', '#ffe0a0', 0.2), 0.9)); }
  }
  function vcFront(g) {
    const ground = ridgePts(93, X0, X0 + XW, 566, 10, 0.012, { oct: 2, step: 20 });
    fillRidge(g, ground, DH + 10, tk.lin(g, 0, 556, 0, DH, [[0, '#c8a860'], [0.08, '#9a8a48'], [0.4, '#4a5a3a'], [1, '#1e2a28']]));
    tk.inkPath(g, ground, { w: 2.6, color: A('#fff0c0', 0.9), taper: 0.02, wobble: 0.2, pressure: 'flat', seed: 4, step: 12 });
    const r = R('vc-front');
    for (let i = 0; i < 260; i++) { const y = 574 + Math.pow(r(), 0.9) * 140, x = X0 + r() * XW; grass(g, x, y, 6 + (y - 574) * 0.06 + r() * 10, 3, A(r() < 0.5 ? '#6a8a3a' : '#c8b060', 0.75), i, -0.15); }
    for (let x = X0; x < X0 + XW; x += 22 + r() * 24) grass(g, x, 570 + (r() - 0.5) * 6, 20 + r() * 26, 4 + Math.floor(r() * 3), r() < 0.5 ? '#8a9a44' : '#d8c060', Math.round(x), -0.2);
    for (let i = 0; i < 70; i++) { const x = X0 + r() * XW, y = 580 + r() * 130; disc(g, x, y, 1.6 + r() * 1.6, r() < 0.5 ? '#fff0f6' : '#ffc0d8'); }
    // the boulder and the freed bell on it, striker pulled back
    g.save(); g.translate(430, 578); g.scale(0.72, 0.72); g.translate(-640, -500);
    tk.celFill(g, [[320, 560], [360, 520], [480, 500], [640, 494], [800, 500], [930, 522], [968, 562], [900, 590], [640, 606], [380, 592]], '#8a6a7a', { line: 5, depth: 22, hi: 'auto', hiW: 3, shadow: '#4a3448', rim: '#fff0c0', rimSide: 'light', rimW: 3, rimAlpha: 0.9, tension: 0.6, align: 0.5 });
    for (let i = 0; i < 6; i++) blob(g, 380 + r() * 520, 540 + r() * 40, 30 + r() * 40, 8 + r() * 10, '#5a8a4a', 0.5);
    titleBell(g, true);
    g.restore();
  }
  function crane(ctx, x, y, s, t, ph, flip) {
    ctx.save(); ctx.translate(x, y); ctx.scale(flip ? -s : s, s);
    const fl = Math.sin(t * 3.4 + ph) * 0.62, ink = '#1a1230';
    const wing = (sgn, dy) => {
      ctx.save(); ctx.translate(-2, -4); ctx.rotate(sgn * (-0.3 + fl) + (sgn > 0 ? 0 : -0.1));
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-8, -20 * sgn - 8, -34, -30 * sgn, -58, -22 * sgn); ctx.lineTo(-50, -6 * sgn); ctx.bezierCurveTo(-34, -6 * sgn, -14, 2 * sgn, 0, 4);
      ctx.closePath(); ctx.fillStyle = '#fffaf0'; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = ink; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-58, -22 * sgn); ctx.lineTo(-38, -26 * sgn); ctx.lineTo(-34, -16 * sgn); ctx.lineTo(-50, -6 * sgn); ctx.closePath(); ctx.fillStyle = ink; ctx.fill();
      ctx.restore();
    };
    wing(-1);
    ctx.beginPath(); ctx.ellipse(0, 0, 22, 7, 0, 0, TAU); ctx.fillStyle = '#fffaf0'; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = ink; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(18, -2); ctx.bezierCurveTo(30, -6, 34, -14, 40, -14); ctx.lineWidth = 3; ctx.strokeStyle = ink; ctx.stroke(); ctx.lineWidth = 1.6; ctx.strokeStyle = '#fffaf0'; ctx.stroke();
    ctx.beginPath(); ctx.arc(41, -14, 3.2, 0, TAU); ctx.fillStyle = '#fffaf0'; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = ink; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(44, -14); ctx.lineTo(54, -12); ctx.lineWidth = 1.8; ctx.strokeStyle = '#e8a040'; ctx.stroke();
    ctx.fillStyle = '#e8383d'; ctx.beginPath(); ctx.arc(41, -17, 1.6, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-20, 2); ctx.lineTo(-44, 8); ctx.lineWidth = 1.6; ctx.strokeStyle = ink; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-18, 3); ctx.lineTo(-40, 14); ctx.stroke();
    wing(1);
    ctx.restore();
  }
  function vcRaysSpr() {
    return mkSpr('vc|rays', 1200, 700, (g) => {
      g.translate(600, 700);
      const r = R('vc-rays');
      for (let i = 0; i < 16; i++) {
        const am = -PI + (i + 0.5) / 16 * PI + (r() - 0.5) * 0.1, wv = 0.06 + r() * 0.06;
        for (let k = 0; k < 3; k++) {
          const ww = wv * (1.7 - k * 0.55), a0 = am - ww / 2, a1 = am + ww / 2, L = 900;
          g.fillStyle = tk.lin(g, 0, 0, Math.cos(am) * L, Math.sin(am) * L, [[0, A('#fff6d8', 0.9 * (0.3 + k * 0.3))], [0.45, A('#ffe0a0', 0.3 * (0.3 + k * 0.3))], [1, A('#ffe0a0', 0)]]);
          g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a0) * L, Math.sin(a0) * L); g.lineTo(Math.cos(a1) * L, Math.sin(a1) * L); g.closePath(); g.fill();
        }
      }
    });
  }
  SCENES.victory = { id: 'victory', combat: false, mood: 'dawn, the bell rings again', sway: 8, items: [
    layer('sky', full(0, 500), 0.02, vcSky),
    layer('clouds', { x: 0, y: 0, w: DW, h: 340 }, 0.02, vcClouds, { scroll: 2.6 }),
    anim((ctx, T) => {
      const p = 0.8 + 0.2 * Math.sin(T.tt * 0.5);
      addMode(ctx, () => { ctx.save(); ctx.translate(VC.sx - T.par * 0.03, VC.sy); ctx.rotate(Math.sin(T.tt * 0.06) * 0.06 * T.mot); ctx.globalAlpha = 0.4 * p; ART.blit(ctx, vcRaysSpr(), -900, -700, 1800, 700); ctx.restore(); });
      tk.sparkle(ctx, VC.sx - T.par * 0.03, VC.sy, 90 + 10 * Math.sin(T.tt * 1.3), { color: '#fffbe8', glow: 0.5, thin: 0.08, rot: 0.2, alpha: 0.9 });
    }),
    layer('hills', full(300, 300), 0.08, vcHills),
    mistLayer('vc-mist', 430, 170, '#ffe0a0', 0.5, 6, 0.1, 91),
    layer('front', full(370, 350), 0.1, vcFront),
    anim((ctx, T) => {
      const p = 0.8 + 0.2 * Math.sin(T.tt * 1.2), bx = 430 - T.par * 0.1;
      addMode(ctx, () => { glowE(ctx, bx, 520, 420, 200, '#ffd870', 0.4 * p); glowE(ctx, bx, 540, 230, 90, '#fff2c0', 0.4 * p); ctx.save(); ctx.translate(bx, 528); ctx.globalAlpha = 0.22 * p; ART.blit(ctx, vcRaysSpr(), -600, -700, 1200, 700); ctx.restore(); });
      if (T.mot >= 1) {                                        // every 2.4 s a gold ring leaves the bell lip and crosses the whole sky
        const u = (T.tt / 2.4) % 1, rr = 900 * (1 - Math.pow(1 - u, 2.2));
        if (rr > 3) { ctx.save(); ctx.strokeStyle = '#fff0c0'; ctx.lineWidth = 6 - 5 * u; ctx.globalAlpha = 0.75 * (1 - ss(0.2, 1, u)); ctx.beginPath(); ctx.arc(bx, 562, rr, 0, TAU); ctx.stroke(); ctx.restore(); }
      }
      drift(ctx, T, { key: 'vc-glyphs', n: 14, sprs: [noteSpr(0), noteSpr(1), noteSpr(2), noteSpr(3), noteSpr(4)], area: { x: 330, y: 200, w: 200, h: 340 }, vx: 6, vy: -30, sway: 30, size: [20, 34], aspect: 1, spin: 0.3, wob: 0.4, alpha: [0.6, 1], add: true });
      [[0.0, 1], [2.2, -1], [4.4, 1]].forEach((c, i) => { const u = ((T.tt * 0.018 + c[0] / 6) % 1 + 1) % 1; crane(ctx, lerp(-80, DW + 80, c[1] > 0 ? u : 1 - u), 210 + i * 46 + Math.sin(T.tt * 0.5 + i) * 10, 0.78 - i * 0.12, T.tt * T.mot, i * 1.3, c[1] < 0); });
      tk.kirakira(ctx, 0, 60, DW, 560, T.tt, { n: Math.round(24 * T.pf), seed: 9, size: 3.6, rise: 8, color: '#ffe9a8' });
    }),
    layer('sakura', { x: 960, y: 0, w: 330, h: 300 }, 1.0, titleSakura),
    anim((ctx, T) => { drift(ctx, T, { key: 'vc-petals', n: 40, sprs: [petalSpr('#ffc2dc', 0), petalSpr('#ff9cc6', 1), petalSpr('#fff0f6', 2)], area: { x: 0, y: 0, w: DW, h: DH }, vx: -70, vy: 26, sway: 60, size: [12, 26], aspect: 1, tumble: true, spin: 0.8, alpha: [0.75, 1] }); }),
    vigLayer('vc-vig', { color: '#7a3a6a', alpha: 0.3, inner: 0.34 }),
    grain(0.24),
  ] };


  // ===============================================================================================================
  // DEFEAT: the world falls silent. A cool grey ground with a ghost of the grove drained of colour, grey fog patches eating it from the edges, a still
  // grey puddle with three frozen ripples, colour running out of the sky in long grey drips, the hero's bachi and a dropped flute lying still, and the
  // temple bell: whole, re-wrapped in grey Hush threads, its striker hanging still (a rest is not the end of the music). The middle stays calm and
  // pale so the story text sits well on it.
  // ===============================================================================================================
  // the drained ground: pale cool grey with soft mottling, static ash and frost dashes and a lavender vignette. Deterministic per seed.
  function hushPaint(g, w, h, seed) {
    const r = R('hush-ground', seed);
    fillRectG(g, 0, 0, w, h, [[0, '#d6d4df'], [0.5, '#cfcdd8'], [1, '#bfbccb']]);
    const step = 40;
    for (let y = -step / 2; y < h + step; y += step) for (let x = -step / 2; x < w + step; x += step) {
      const v = nz(x * 0.006 + seed * 3.1, y * 0.006, 23 + seed, 3) - 0.42;
      if (Math.abs(v) < 0.02) continue;
      blob(g, x + (r() - 0.5) * 12, y + (r() - 0.5) * 12, step * 2, step * 1.8, v > 0 ? '#f4f3f8' : '#8e8aa3', Math.min(0.16, Math.abs(v) * 0.45));
    }
    for (let i = 0; i < Math.round(w * h / 2400); i++) {
      const x = r() * w, y = r() * h, len = 2 + r() * 4;
      g.fillStyle = r() < 0.5 ? A('#5a566e', 0.06 + 0.1 * r()) : A('#ffffff', 0.12 + 0.18 * r()); g.fillRect(x, y, len, 1);
    }
    const e = Math.min(w, h) * 0.12;
    fillRectG(g, 0, 0, w, e, [[0, A('#a898d8', 0.22)], [1, A('#a898d8', 0)]]); fillRectG(g, 0, h - e, w, e, [[0, A('#a898d8', 0)], [1, A('#a898d8', 0.26)]]);
    g.fillStyle = tk.lin(g, 0, 0, e, 0, [[0, A('#a898d8', 0.22)], [1, A('#a898d8', 0)]]); g.fillRect(0, 0, e, h);
    g.fillStyle = tk.lin(g, w - e, 0, w, 0, [[0, A('#a898d8', 0)], [1, A('#a898d8', 0.22)]]); g.fillRect(w - e, 0, e, h);
  }
  function dfInk(g) {
    const r = R('df-ink'), ink = '#6f6b86', ash = '#8e8aa3';
    // far hills drained to grey, dissolving toward the middle
    [[430, 70, 0.0026, 0.2, 5], [470, 56, 0.0034, 0.28, 6], [504, 42, 0.0044, 0.38, 7]].forEach((d, i) => {
      const pts = ridgePts(d[4], X0, X0 + XW, d[0], d[1], d[2], { oct: 4 });
      fillRidge(g, pts, 620, tk.lin(g, 0, d[0] - d[1], 0, 620, [[0, A(ash, d[3])], [0.6, A(ash, d[3] * 0.5)], [1, A(ash, 0)]]));
      tk.inkPath(g, pts, { w: 2 + i, color: A(ink, d[3] + 0.12), taper: 0.02, wobble: 0.4, pressure: 'flat', seed: i, step: 10 });
    });
    // bamboo at both edges: strong at the bottom, breaking up into flecks toward the top
    [[70, 1], [150, 0.72], [1210, 1], [1130, 0.7], [250, 0.45], [1040, 0.5]].forEach((s, i) => {
      const x = s[0], top = 120 + (1 - s[1]) * 200 + r() * 40, pts = [[x + (r() - 0.5) * 20, top], [x + (r() - 0.5) * 22, top + 60], [x + (r() - 0.5) * 18, 480], [x, 710]];
      tk.inkPath(g, pts, { w: 26 * s[1] + 6, color: A(ink, 0.6 * s[1] + 0.14), taper: 0, taperStart: 0.4, taperEnd: 0, pressure: 'tail', wobble: 0.35, seed: i + 3, step: 8 });
      for (let n = 1; n < 6; n++) { const y = lerp(620, top + 40, n / 6); tk.inkPath(g, [[x - 13 * s[1], y], [x + 13 * s[1], y + 2]], { w: 3, color: A('#46425a', 0.55 * s[1]), taper: 0.3, wobble: 0.2, seed: n + i }); }
      for (let n = 0; n < 26; n++) disc(g, x + (r() - 0.5) * 60, top - 10 - r() * 90, 0.8 + r() * 2.4, A(ink, 0.5 * s[1] * (1 - n / 30)));
      for (let n = 0; n < 5; n++) { const a0 = (i % 2 ? PI + 0.5 : -0.5) + (r() - 0.5) * 1.1, l = 40 + r() * 46, x0 = x + (r() - 0.5) * 16, y0 = top + 10 + n * 26; tk.inkPath(g, [[x0, y0], [x0 + Math.cos(a0) * l * 0.5, y0 + Math.sin(a0) * l * 0.5 - 8], [x0 + Math.cos(a0) * l, y0 + Math.sin(a0) * l + 6]], { w: 5, color: A(ink, 0.34 * s[1] + 0.08), taper: 0.5, taperStart: 0.05, wobble: 0.3, seed: i * 9 + n }); }
    });
    // Hush materials: grey felt strips hanging from the top, stitched, with ragged hems and frost flecks, and wadding clumps in the corners
    [[60, 150, 56], [190, 90, 40], [330, 120, 34], [940, 70, 36], [1090, 140, 44], [1210, 190, 58]].forEach((d, i) => {
      const x = d[0], len = d[1], wd = d[2], hem = [];
      for (let k = 0; k <= 6; k++) hem.push([x + wd / 2 - (k / 6) * wd, len + (k % 2 ? 9 : -4) + r() * 8]);
      tk.celFill(g, [[x - wd / 2, -8], [x + wd / 2, -8]].concat(hem), i % 2 ? '#a6a3b8' : '#9794ab', { line: 2, depth: 3, hi: false, shadow: '#6f6b86', tension: 0.05, rim: '#f2f0f6', rimW: 1, rimAlpha: 0.4 });
      for (let y = 14; y < len - 8; y += 12) { g.fillStyle = A('#f2f0f6', 0.55); g.fillRect(x - wd / 2 + 5, y, 4, 1.5); g.fillRect(x + wd / 2 - 9, y, 4, 1.5); }
      for (let n = 0; n < 7; n++) g.fillRect(x + (r() - 0.5) * wd, r() * len, 2 + r() * 3, 1);
    });
    [[20, 14, 1], [1262, 10, -1], [420, -6, 0.6]].forEach((c, i) => {
      for (let n = 0; n < 16; n++) {
        const a = r() * TAU, d = r() * 70 * c[2], x = c[0] + Math.cos(a) * d, y = c[1] + Math.abs(Math.sin(a)) * d * 0.7, rad = 14 + r() * 20;
        blob(g, x, y + 3, rad * 2, rad * 1.6, '#6f6b86', 0.16); blob(g, x, y, rad * 2, rad * 1.5, r() < 0.5 ? '#e6e4ee' : '#cfcdd8', 0.85);
        blob(g, x - rad * 0.3, y - rad * 0.3, rad, rad * 0.7, '#ffffff', 0.5);
      }
    });
    for (let i = 0; i < 40; i++) { const x = (i % 2 ? 40 : 1240) + (r() - 0.5) * 140, y = 200 + r() * 460; g.fillStyle = A(r() < 0.6 ? '#f2f0f6' : '#8e8aa3', 0.5); g.fillRect(x, y, 2 + r() * 4, 1.2); }
  }
  function dfBlank(g) {
    // soft grey felt-wool fog banks eating the picture from the top and the inside edges
    [[640, -30, 520, 130], [180, 250, 90, 160], [1110, 300, 100, 170], [560, 590, 200, 80], [880, 590, 240, 100]].forEach((d) => {
      for (let k = 0; k < 4; k++) blob(g, d[0], d[1], d[2] * (2.2 - k * 0.4), d[3] * (2.2 - k * 0.4), '#d6d4df', 0.22);
    });
  }
  function dfPool(g) {
    const r = R('df-pool');
    // a still grey puddle with three frozen ripple rings
    const pts = []; for (let i = 0; i < 60; i++) { const a = i / 60 * TAU, k = 1 + (nz(Math.cos(a) * 3.2 + 3, Math.sin(a) * 3.2 + 3, 61, 4) - 0.4) * 1.1 + (i % 5 === 0 ? 0.1 : 0); pts.push([640 + Math.cos(a) * 560 * k, 744 + Math.sin(a) * 104 * k]); }
    g.beginPath(); tk.trace(g, pts, 0, 0, 0.9); g.fillStyle = tk.lin(g, 0, 640, 0, 740, [[0, '#a6a3b8'], [0.4, '#8e8aa3'], [1, '#6f6b86']]); g.fill();
    tk.inkPath(g, pts, { closed: true, w: 3, color: '#5a566e', pressure: 'flat', wobble: 0.3, seed: 3, align: 0.5, weightVar: 0.2 });
    [[150, 13, 0.5], [236, 20, 0.34], [330, 28, 0.22]].forEach((q) => { g.beginPath(); g.ellipse(720, 702, q[0], q[1], 0, 0, TAU); g.strokeStyle = A('#f2f0f6', q[2]); g.lineWidth = 2; g.stroke(); });
    tk.inkPath(g, [[230, 690], [420, 676], [640, 672]], { w: 6, color: A('#f2f0f6', 0.45), taper: 0.5, wobble: 0.2, seed: 2 });
    tk.inkPath(g, [[760, 684], [880, 690]], { w: 4, color: A('#f2f0f6', 0.35), taper: 0.5, wobble: 0.2, seed: 4 });
    for (let i = 0; i < 40; i++) { const a = r() * PI + PI, d = 420 + r() * 300, x = 640 + Math.cos(a) * d * 1.1, y = 700 + Math.sin(a) * d * 0.16 - r() * 26; g.fillStyle = r() < 0.5 ? A('#f2f0f6', 0.8) : A('#6f6b86', 0.7); g.fillRect(x, y, 2 + r() * 5, 1.2); }
  }
  // the hero's bachi drumsticks and a dropped shakuhachi, lying still
  function dfInstruments(g) {
    g.save(); g.translate(1010, 676); g.rotate(-0.1);
    tk.celFill(g, [[-130, -5], [20, -6], [96, -3], [100, 0], [96, 3], [20, 6], [-130, 5]], '#d8b878', { line: 2.4, depth: 4, hi: 'auto', shadow: '#8a6a3a', tension: 0.15, rim: '#fff0c0', rimSide: 'light', rimW: 1.2, rimAlpha: 0.5 });
    [-92, -52, -14, 24].forEach((x) => { g.fillStyle = A('#5a3a1a', 0.85); g.fillRect(x, -6, 5, 12); });
    [[-100, 0], [-66, 0], [-34, 0], [-8, 0], [18, 0]].forEach((p, i) => { if (i % 2 === 0) { g.fillStyle = A('#2a1a10', 0.85); g.beginPath(); g.ellipse(p[0] + 14, -0.5, 2.2, 2.8, 0, 0, TAU); g.fill(); } });
    tk.inkPath(g, [[-132, -4], [-126, 4]], { w: 2, color: A('#5a3a1a', 0.8), pressure: 'flat', taper: 0 });
    g.restore();
    g.save(); g.translate(1070, 646); g.rotate(0.22);
    [[-8, 2.2], [10, -3]].forEach((q, i) => {
      tk.celFill(g, [[-96 + i * 6, -5.5], [-30, -6.5], [90, -7.5 + i], [96, 0], [90, 7.5 - i], [-30, 6.5], [-96 + i * 6, 5.5]], i ? '#a8743c' : '#b88a4c', { line: 2.6, depth: 4, hi: 'auto', shadow: '#5a3a1c', tension: 0.15, rim: '#fff0c0', rimSide: 'light', rimW: 1.2, rimAlpha: 0.5 });
      if (i === 0) for (let x = -64; x <= 20; x += 28) { g.fillStyle = A('#5a3a1a', 0.8); g.fillRect(x, -6, 3, 12); }
    });
    g.restore();
    blob(g, 1070, 690, 150, 12, '#3a3650', 0.35);
  }
  function dfDripSpecs() { const r = R('df-drips'), out = []; for (let i = 0; i < 9; i++) out.push({ x: 60 + i * 148 + (r() - 0.5) * 80, len: 100 + r() * 190, w: 3.4 + r() * 4, T: 9 + r() * 8, ph: r(), blot: 8 + r() * 12 }); return out; }
  const DF_DRIPS = dfDripSpecs();

  SCENES.defeat = { id: 'defeat', combat: false, mood: 'the world falls silent', sway: 4, items: [
    layer('paper', full(0), 0, (g) => hushPaint(g, DW, DH, 7)),
    layer('ink', full(0), 0.04, dfInk),
    layer('blank', full(0), 0, dfBlank),
    mistLayer('df-fade', 300, 260, '#e6e4ee', 0.5, 3, 0.05, 101),
    // the temple bell, small, in the drained grove: whole, bound again in grey threads, striker still; never cracked
    layer('bell', { x: 190, y: 480, w: 280, h: 140 }, 0.05, (g) => {
      g.save(); g.translate(330, 598); g.scale(0.45, 0.45); g.translate(-640, -498);
      titleBell(g, false);
      g.restore();
      g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = A('#8e8aa3', 0.46); g.fillRect(190, 480, 280, 140); g.restore();
    }),
    layer('pool', { x: 0, y: 600, w: DW, h: 120 }, 0, dfPool),
    // loose grey Hush threads hanging from the top edge, swaying very slowly
    anim((ctx, T) => {
      DF_DRIPS.forEach((d, i) => {
        const len = 60 + d.len * 0.7, x = d.x - T.par * 0.04, sw = Math.sin(T.tt / d.T * TAU + d.ph * TAU) * 6;
        tk.inkPath(ctx, [[x, -8], [x + sw * 0.4, len * 0.5], [x + sw, len]], { w: 1.6 + d.w * 0.12, color: A(i % 2 ? '#8e8aa3' : '#f2f0f6', 0.8), taper: 0.3, taperStart: 0, pressure: 'flat', wobble: 0.1, seed: i, step: 8 });
      });
    }),
    layer('bachi', { x: 780, y: 540, w: 500, h: 180 }, 0.06, dfInstruments),
    anim((ctx, T) => {
      const P = pset('df-ash', 34, (r) => ({ x: r(), y: r(), sp: 0.5 + r() * 0.8, sz: 1 + r() * 3, ph: r() * TAU }));
      const n = Math.round(34 * T.pf);
      ctx.save();
      for (let i = 0; i < n; i++) { const p = P[i], x = wrapv(p.x * DW + Math.sin(T.tt * 0.4 + p.ph) * 26 + T.tt * 6, -20, DW + 40), y = wrapv(p.y * DH + T.tt * 16 * p.sp, -20, DH + 40); ctx.fillStyle = A(i % 2 ? '#6f6b86' : '#f2f0f6', 0.3 + 0.3 * p.sp); ctx.save(); ctx.translate(x, y); ctx.rotate(p.ph + T.tt * 0.3); ctx.fillRect(-p.sz, -p.sz * 0.5, p.sz * 2, p.sz); ctx.restore(); }
      ctx.restore();
    }),
    vigLayer('df-vig', { color: '#3a3650', alpha: 0.4, inner: 0.36 }),
    grain(0.3),
  ] };


  // ===============================================================================================================
  // PAPER: a reusable silk texture for panels. Pale cool cream with a fine woven crosshatch, soft mottling, faint folds and a soft lavender vignette at
  // the edge. Deterministic per (size, seed); `paper` fills any w x h at 1:1 (not scaled from the stage).
  // ===============================================================================================================
  function paperPaint(g, w, h, seed, edge) {
    const r = R('paper', seed), k = Math.sqrt(w * h) / 700;                  // features scale gently with the panel size
    fillRectG(g, 0, 0, w, h, [[0, '#f1eff5'], [0.5, '#ebe8f1'], [1, '#e2dfea']]);
    g.fillStyle = tk.lin(g, 0, 0, w, h, [[0, A('#ffffff', 0.5)], [0.5, A('#ffffff', 0)], [1, A('#b8b4d0', 0.22)]]); g.fillRect(0, 0, w, h);
    // soft mottling: a coarse noise field of light and dark tone, drawn as overlapping soft blobs so there are no visible cells
    const step = clamp(Math.round(Math.sqrt(w * h) / 16), 22, 44), sf = 0.0085 / Math.max(0.6, k);
    for (let y = -step / 2; y < h + step; y += step) for (let x = -step / 2; x < w + step; x += step) {
      const v = nz(x * sf + seed * 3.1, y * sf, 17 + seed, 3) - 0.42;
      if (Math.abs(v) < 0.02) continue;
      blob(g, x + (r() - 0.5) * step * 0.3, y + (r() - 0.5) * step * 0.3, step * 2.0, step * 1.8, v > 0 ? '#ffffff' : '#b8b4d0', Math.min(0.13, Math.abs(v) * 0.4));
    }
    // the weave: two sets of fine 1 px lines, across and down
    g.lineWidth = 1; g.strokeStyle = A('#6a6684', 0.06); g.beginPath();
    for (let y = 0.5; y < h; y += 3) { g.moveTo(0, y); g.lineTo(w, y); }
    for (let x = 0.5; x < w; x += 3) { g.moveTo(x, 0); g.lineTo(x, h); }
    g.stroke();
    // faint folds: a wobbly soft line with a light line beside it
    for (let i = 0; i < 2; i++) {
      const vertical = i === 0, p = 0.22 + r() * 0.56, pts = [], n = 8;
      for (let j = 0; j <= n; j++) { const u = j / n, off = (nz(u * 4 + seed, i * 7, 31, 2) - 0.4) * 14; pts.push(vertical ? [w * p + off, u * h] : [u * w, h * p + off]); }
      tk.inkPath(g, pts, { w: 1.1, color: A('#8a86a4', 0.13), pressure: 'flat', taper: 0.1, wobble: 0.3, seed: i, step: 6 });
      tk.inkPath(g, pts.map((q) => [q[0] + (vertical ? 1.5 : 0), q[1] + (vertical ? 0 : 1.5)]), { w: 1.1, color: A('#ffffff', 0.5), pressure: 'flat', taper: 0.1, wobble: 0.3, seed: i + 5, step: 6 });
    }
    if (edge !== false) {                                                     // a soft lavender vignette toward the border, uneven
      const e = Math.min(w, h) * 0.09;
      fillRectG(g, 0, 0, w, e, [[0, A('#b8a8e0', 0.24)], [1, A('#b8a8e0', 0)]]); fillRectG(g, 0, h - e, w, e, [[0, A('#b8a8e0', 0)], [1, A('#b8a8e0', 0.3)]]);
      g.fillStyle = tk.lin(g, 0, 0, e, 0, [[0, A('#b8a8e0', 0.24)], [1, A('#b8a8e0', 0)]]); g.fillRect(0, 0, e, h);
      g.fillStyle = tk.lin(g, w - e, 0, w, 0, [[0, A('#b8a8e0', 0)], [1, A('#b8a8e0', 0.24)]]); g.fillRect(w - e, 0, e, h);
      for (let i = 0; i < 18; i++) { const side = i % 4, t = r(), x = side === 0 ? t * w : side === 1 ? w : side === 2 ? t * w : 0, y = side === 0 ? 0 : side === 1 ? t * h : side === 2 ? h : t * h; blob(g, x, y, (20 + r() * 40) * Math.max(0.5, k), (14 + r() * 26) * Math.max(0.5, k), '#a898d8', 0.16); }
    }
    tk.paperGrain(g, 0, 0, w, h, { alpha: 0.5, blend: 'multiply', force: true });
  }
  SCENES.paper = { id: 'paper', combat: false, mood: 'cool silk', custom: true, items: [layer('paper', full(0), 0, () => {})],
    draw(ctx, id, w, h, t, o) {
      const sd = Math.round(num(o.seed, 0)), edge = o.edge !== false;
      const lq = tk.lowQ() ? 0.5 : 1;
      const spr = ART.sprite('sc|paper|' + Math.round(w) + 'x' + Math.round(h) + '|' + sd + '|' + (edge ? 1 : 0) + '|' + lq, w * lq, h * lq, (g, sw, sh) => { g.scale(sw / w, sh / h); paperPaint(g, w, h, sd, edge); });
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
  scene.logo = function logo(ctx, x, y, w, t) {
    try { logoDraw(ctx, num(x, 0), num(y, 0), Math.max(8, num(w, 400)), num(t, 0)); return true; } catch (e) {
      scene.lastError = 'logo: ' + (e && e.message);
      if (!warned.logo) { warned.logo = true; if (typeof console !== 'undefined' && console.error) console.error('ART.scene.logo: ' + (e && e.stack)); }
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
    tk.sky(g, 0, 0, W, H * 0.56, 'moon');
    tk.kirakira(g, 0, 0, W, H * 0.56, t, { n: 30, seed: 3 });
    scene.logo(g, W / 2, H * 0.27, W * 0.66, t);
    g.fillStyle = pal.paper; g.fillRect(0, H * 0.56, W, H * 0.22);
    tk.paperGrain(g, 0, H * 0.56, W, H * 0.22, { alpha: 0.6 });
    scene.logo(g, W * 0.3, H * 0.67, W * 0.36, t + 1);
    scene.logo(g, W * 0.72, H * 0.67, W * 0.2, t + 2);
    g.fillStyle = pal.night; g.fillRect(0, H * 0.78, W, H * 0.22);
    for (let i = 0; i < 6; i++) scene.logo(g, W * (0.09 + i * 0.164), H * 0.86, W * 0.15, t + i * 0.9);
  });
  ART.sheet('title_anim', (canvas, params) => {
    const t = num(params.t, 0);
    ART.sheetGrid(canvas, params, [0, 1, 2, 3, 4, 5].map((i) => ({ label: 't = ' + (t + i * 2.3).toFixed(1) + ' s', i })), (g, cell, w, h) => {
      scene.draw(g, 'title', w, h, t + cell.i * 2.3, { particles: 1, logo: true, rung: params.rung === true || num(params.rung, 0) > 0 });
    }, { aspect: 16 / 9, cols: 3, pad: 8, gap: 6, labelH: 16, bg: 'night' });
  });
})();
