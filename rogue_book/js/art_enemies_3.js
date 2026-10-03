// Inkwoven -- ART.enemy art for CHAPTER 3, the Crimson Sky Citadel (a storm fortress above crimson clouds, where the Blank erases the words: storm
// constructs, redaction knights, void scribes, folded paper giants). Extends ART (art.js). This file draws exactly the 17 ids of DATA.ROSTER[3] and
// registers each with ART.enemy.register(id, {draw, bounds}).
//
//   normals   storm_drone komainu_guardian redaction_knight void_scribe blank_soldier sky_serpent eraser_wraith thunder_crow paper_golem margin_imp
//   elites    censor_golem storm_whelp black_bar_inquisitor
//   minions   blank_page spark_mote typo_sprite
//   boss      boss_editor   phase 0 the Editor (a pale scholar with a red pen), phase 1 the Eraser (a hulking giant with eraser arms),
//                           phase 2 the Blank Page (a colossal tear in the page shaped like a face)
//
// CONTRACT (DESIGN 5.6). draw(ctx, o) receives the context ALREADY translated to the feet centre and scaled; it paints around (0, 0), y negative up, facing
// LEFT. o = {s, pose, t, pt, hpPct, phase, glow, flip}. t is absolute seconds (loops), pt seconds since the pose began (one-shot poses). Poses are
// LISTS.enemyPoses: idle attack hurt block buff die telegraph. Elite ornament, the aura ring and the ground shadow are drawn by ART.enemy.draw: nothing
// here duplicates them. Every id is deterministic (no clock, no Math.random), never throws for odd input, and keeps save and restore balanced.
//
// HOW THEY ARE BUILT (cutout puppets, the same trick as the heroes).
//   A creature is a handful of PARTS (a head, an arm, a page, a lantern), each drawn ONCE at rest with the toolkit (celFill, ribbon, ...) into a cached
//   sprite per raster scale q = ceil(2 * s) / 2, then composited every frame under its own transform (a pivot, a rotation, a squash) so the pieces
//   move independently. Things that flow (tails, necks, cloth, whiskers, paper) are ART.tk.chain parts: one baked drawing sliced into slabs that bend
//   at joints. Whatever changes every frame is drawn LIVE and cheaply: eyes (blink, look, flare), lightning, glows, sparks, crumbs, orbiting pages.
//   A shared pose state (wind-up, strike, recoil, guard, buff pulse, dissolve) is read by each creature's rig(), so every creature answers every pose.
//   Death is a themed dissolve: the creature is clipped by shrinking cells (ink, paper, shards) or redaction strips or an eraser wipe, with matching
//   fragments flying away (paper scraps, black bars, letters, eraser crumbs, stone chunks, sparks, feathers). A hurt pose flashes a baked white silhouette.
//   Chapter look: the Blank is paper white and black censor bars, the storm is electric cyan and yellow, both against a crimson sky, so creatures
//   carry a cool or pale body, a dark ink line and one hot emissive accent that pops off the red.
//
// EXTRAS beyond DESIGN 5.6
//   ART.enemy.warm3(id, s) -> parts baked      pre-bake every sprite of a chapter 3 creature at the raster scale for s (avoids a first-frame hitch)
//   ART.enemy.ids3() -> the 17 ids drawn here
//   boss_editor is ONE spec holding the parts of all three forms (prefixes p0_ p1_ p2_) and one rig per form, chosen by o.phase (0 Editor, 1 Eraser, 2 Blank
//   Page; later values keep the last form); each form has its own bounds-compatible dissolve (paper and red marks, pink crumbs, letters and bars imploding).
//   Gallery sheets: enemies3 (normals, elites, minions, several poses each), boss3 (The Editor, three phases, every pose, large), enemies3_anim (film
//   strips of two creatures), enemies3_dev (params id[,id]|all pose|all zoom t pt phase hp: the workbench).
(() => {
  'use strict';
  const tk = ART.tk, pal = tk.pal;
  const clamp = tk.clamp, lerp = tk.lerp, num = tk.num, ease = tk.ease;
  const TAU = Math.PI * 2, PI = Math.PI;
  const sin = Math.sin, cos = Math.cos;
  const cA = (a) => (a >= 0 ? (a <= 1 ? a : 1) : 0);
  const sm = tk.smoothstep;
  const SPECS = {};
  const PAD = 8;
  const LIGHT = -2.05;                                  // key light: up and to the LEFT, so the faces they turn toward the heroes are lit
  const POSES = ['idle', 'attack', 'hurt', 'block', 'buff', 'die', 'telegraph'];
  const POSE_MS = { attack: 420, hurt: 260, block: 300, buff: 400, die: 700, telegraph: 0, idle: 0 };

  // chapter palette
  const C = {
    paper: '#f3e6c8', paper2: '#e6d3a3', white: '#fff8f0', ink: '#140f2e', night: '#0d0b1e', bar: '#0b0916',
    cyan: '#5ff5ff', azure: '#5fb4ff', volt: '#ffe45e', crimson: '#e8383d', red: '#ff3a4a', magenta: '#ff3a8a',
    brass: '#d9a441', gold: '#f5c96a', stone: '#8d94b8', iron: '#4a4f6e', pink: '#f4a3b8', violet: '#5b3fa8', lilac: '#b9a8ff',
  };

  // ---------------------------------------------------------------------------------------------------------------
  // shape helpers (control-point arrays for tk.celFill / tk.inkPath)
  // ---------------------------------------------------------------------------------------------------------------
  const E = (cx, cy, rx, ry, n, rot) => tk.ellipsePts(cx, cy, rx, ry, n || Math.max(10, Math.round(Math.max(rx, ry) / 3) + 8), rot || 0);
  // a rounded capsule between two points with end widths wa and wb
  function cap(ax, ay, bx, by, wa, wb) {
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, nx = -uy, ny = ux;
    const ra = wa / 2, rb = wb / 2, mx = (ax + bx) / 2, my = (ay + by) / 2, rm = (ra + rb) / 2 * 1.04;
    return [[ax + nx * ra, ay + ny * ra], [mx + nx * rm, my + ny * rm], [bx + nx * rb, by + ny * rb], [bx + ux * rb * 1.05, by + uy * rb * 1.05],
      [bx - nx * rb, by - ny * rb], [mx - nx * rm, my - ny * rm], [ax - nx * ra, ay - ny * ra], [ax - ux * ra * 1.05, ay - uy * ra * 1.05]];
  }
  // a straight-edged polygon descriptor, and an axis-aligned rectangle of it
  const poly = (pts) => ({ poly: pts });
  const rect = (x, y, w, h) => ({ poly: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]] });
  // a rectangle with the corners skewed: top edge shifted by sk px (paper and cardboard look folded, not machined)
  const quad = (x, y, w, h, sk) => ({ poly: [[x + (sk || 0), y], [x + w + (sk || 0), y], [x + w, y + h], [x, y + h]] });
  const mirrorX = (pts) => pts.map((p) => { const q = [-p[0], p[1]]; if (p[2]) q.push(p[2]); return q; }).reverse();
  // a zig-zag row of points along x0..x1 at y with n teeth of height dy (sharp corners): jaws, torn paper, lightning fins
  function zig(x0, x1, y, dy, n, jitter, seed) {
    const pts = [], step = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      const jx = jitter ? (tk.vary(seed || 3, 'zx' + i) - 0.5) * jitter : 0, jy = jitter ? (tk.vary(seed || 3, 'zy' + i) - 0.5) * jitter * 0.6 : 0;
      pts.push([x0 + step * i, y, 1], [x0 + step * (i + 0.5) + jx, y + dy + jy, 1]);
    }
    pts.push([x1, y, 1]);
    return pts;
  }
  // deterministic tiny helpers for live animation
  const hv = (id, salt) => tk.vary(id, salt);
  const wob = (t, per, ph) => sin(TAU * (t / per + (ph || 0)));
  const flick = (t, seed, rate) => clamp(0.5 + 0.5 * (tk.noise1(t * (rate || 8) + seed * 13.7, seed | 0) * 2 - 1), 0, 1);

  // ---------------------------------------------------------------------------------------------------------------
  // the paint helper handed to every part
  // ---------------------------------------------------------------------------------------------------------------
  function makeS(g, spec) {
    const c = spec.col || {}, lw = spec.lw || 3;
    const S = { g, c, lw, spec };
    // one cel-shaded closed shape with the house defaults: outline lw, hard shadow, backlight rim in the creature's rim colour
    S.cel = (pts, base, o) => tk.celFill(g, pts, base, Object.assign({ line: lw, light: LIGHT, rim: c.rim, rimW: 1.7, rimAlpha: 0.8, shadowT: c.shT, lineColor: c.lineColor, wobble: c.wobble }, o));
    S.ell = (cx, cy, rx, ry, base, o) => S.cel(E(cx, cy, rx, ry), base, o);
    S.line = (pts, o) => tk.inkPath(g, pts, Object.assign({ w: 1.5, color: pal.ink }, o));
    S.fill = (pts, col, alpha, tension) => { g.save(); if (alpha !== undefined) g.globalAlpha *= cA(alpha); g.beginPath(); tk.trace(g, pts, 0, 0, tension); g.fillStyle = col; g.fill(); g.restore(); };
    S.rib = (spine, base, o) => tk.ribbon(g, spine, base, Object.assign({ line: lw, light: LIGHT, rim: c.rim, rimW: 1.4, gloss: false, strands: 0 }, o));
    S.clip = (pts, tension) => { g.beginPath(); tk.trace(g, pts, 0, 0, tension); g.clip(); };
    S.dots = (x, y, w, h, o) => tk.halftone(g, x, y, w, h, Object.assign({ d: 5, r: 1.1, alpha: 0.4, force: true }, o));
    S.glow = (x, y, r, col, a) => tk.glow(g, x, y, r, col, a);
    return S;
  }
  // washi grain baked into every sprite, only where there is paint
  function grainOver(g, x, y, w, h) {
    g.save(); g.globalCompositeOperation = 'source-atop';
    tk.paperGrain(g, x, y, w, h, { alpha: 0.7, force: true });
    g.restore();
  }
  const qOf = (s) => Math.max(0.5, Math.ceil(clamp(num(s, 1), 0.25, 2.5) * 2) / 2);

  // ---------------------------------------------------------------------------------------------------------------
  // spec registry and baking
  // ---------------------------------------------------------------------------------------------------------------
  function define(id, spec) {
    spec.id = id;
    spec.parts = spec.parts || {};
    spec.chains = spec.chains || {};
    spec._chain = {};
    SPECS[id] = spec;
    return spec;
  }
  function boxOf(p) { const b = p.box; return [b[0] - PAD, b[1] - PAD, b[2] + PAD, b[3] + PAD]; }
  function partSpr(spec, name, q, white) {
    const p = spec.parts[name], b = boxOf(p), w = b[2] - b[0], h = b[3] - b[1];
    return ART.sprite('en3|' + spec.id + '|' + name + '|' + q + (white ? '|w' : ''), w * q, h * q, (g) => {
      g.scale(q, q); g.translate(-b[0], -b[1]);
      p.draw(makeS(g, spec));
      grainOver(g, b[0], b[1], w, h);
      if (white) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#ffffff'; g.fillRect(b[0], b[1], w, h); }
    });
  }
  function chainOf(spec, name, white) {
    const key = name + (white ? '|w' : '');
    let c = spec._chain[key];
    if (c) return c;
    const d = spec.chains[name];
    c = tk.chain('en3|' + spec.id + '|' + name + (white ? '|w' : ''), {
      spine: d.spine, cuts: d.cuts, reach: d.reach, overlap: d.overlap,
      draw: (g) => {
        d.draw(makeS(g, spec));
        grainOver(g, -700, -700, 1400, 1400);
        if (white) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#ffffff'; g.fillRect(-700, -700, 1400, 1400); }
      },
    });
    spec._chain[key] = c;
    return c;
  }

  // draw the baked part `name` at its rest place, under an extra transform about its pivot. T = {x, y, r, sx, sy, a, kids, pre}.
  // `kids(ctx)` runs inside the transform (after the sprite), `pre(ctx)` before it, both in REST coordinates, so children with their own pivots nest.
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
    ctx.drawImage(partSpr(spec, name, st.q), ox, oy, w, h);
    if (st.flash > 0.02 && !T.noFlash) {
      const ga2 = ctx.globalAlpha;
      ctx.globalAlpha = ga2 * cA(st.flash);
      ctx.drawImage(partSpr(spec, name, st.q, true), ox, oy, w, h);
      ctx.globalAlpha = ga2;
    }
    ctx.globalAlpha = ga;
    if (T.kids) { ctx.translate(-pv[0], -pv[1]); T.kids(ctx); }
    ctx.restore();
  }
  // a chain part (tail, neck, cloth, whisker) drawn with per-joint bends (radians, see ART.tk.chain), under an optional transform about its root
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
    chainOf(spec, name, false).draw(ctx, bends, st.q);
    if (st.flash > 0.02) {
      ctx.globalAlpha = ctx.globalAlpha * cA(st.flash);
      chainOf(spec, name, true).draw(ctx, bends, st.q);
    }
    ctx.globalAlpha = ga;
    if (T.kids) T.kids(ctx);
    ctx.restore();
  }
  // move, rotate and scale the context about a pivot (px, py): the way every creature body is posed
  function xform(ctx, px, py, dx, dy, rot, sx, sy) {
    ctx.translate(px + dx, py + dy);
    if (rot) ctx.rotate(rot);
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    ctx.translate(-px, -py);
  }
  // point and unit tangent at fraction u (0..1) along a control-point spine: places rings, scales and spots along tails and necks
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
  // where the tip of a chain part ends up for a set of bends (the same accumulation ART.tk.chain.draw does), and the total turn there: heads ride on it
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
  // the shared pose state
  // ---------------------------------------------------------------------------------------------------------------
  // attack: 0..0.3 anticipation (wind rises, swing dips to -0.5), 0.3..0.5 strike (swing reaches 1 at p = 0.5), then recovery
  // hurt: recoil spike then settle;  block: guard rises fast and holds;  buff: a pulse;  die: 0..1 dissolve;  telegraph: wind-up ramps to 1 and holds
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
  // live helpers: eyes, blink, sparks, lightning, crumbs, notes
  // ---------------------------------------------------------------------------------------------------------------
  const blink = (t, id, per) => {
    per = per || 3.6 + 1.6 * hv(id, 'bp');
    const ph = ((t + hv(id, 'bo') * per) % per + per) % per;
    return ph < 0.16 ? Math.abs(ph - 0.08) / 0.08 : 1;                    // 1 open, dips to 0 for a moment
  };
  // an emissive creature eye drawn live: soft glow, socket, iris gradient, pupil, catchlight, lid squash. o: open (0..1), iris [top, bottom],
  // pupil ('slit' 'round' 'dot' 'none'), look [dx, dy], sclera, ring (outline colour), glow (colour), glowK, rot, lw, catch, lidTop (0..1 top lid drop)
  function eyeLive(ctx, x, y, rx, ry, o) {
    o = o || {};
    const open = clamp(num(o.open, 1), 0, 1), iris = o.iris || ['#ff5a2a', '#ffc04a'], look = o.look || [0, 0];
    const ery = Math.max(0.6, ry * open);
    if (o.glow && o.glowK !== 0) tk.glow(ctx, x, y, Math.max(rx, ry) * (o.glowR || 2.6), o.glow, cA(num(o.glowK, 0.7) * (0.35 + 0.65 * open)));
    ctx.save();
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    if (open < 0.14) {
      tk.inkPath(ctx, [[-rx, 0], [0, ry * 0.18], [rx, 0]], { w: o.lw || 2.4, taper: 0.3, wobble: 0 });
      ctx.restore();
      return;
    }
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ery, 0, 0, TAU);
    ctx.fillStyle = o.sclera || pal.white; ctx.fill();
    ctx.save();
    ctx.clip();
    const gr = ctx.createLinearGradient(0, -ery, 0, ery);
    gr.addColorStop(0, iris[0]); gr.addColorStop(1, iris[1]);
    const ix = num(look[0], 0) * rx * 0.28, iy = num(look[1], 0) * ery * 0.22, irx = rx * (o.irisK || 0.78), iry = ery * 1.02;
    ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(ix, iy, irx, iry, 0, 0, TAU); ctx.fill();
    const pk = o.pupil === undefined ? 'slit' : o.pupil;
    if (pk !== 'none') {
      ctx.fillStyle = o.pupilColor || pal.ink; ctx.beginPath();
      if (pk === 'slit') ctx.ellipse(ix, iy, irx * 0.2, iry * 0.86, 0, 0, TAU);
      else if (pk === 'dot') ctx.ellipse(ix, iy, irx * 0.28, iry * 0.28, 0, 0, TAU);
      else ctx.ellipse(ix, iy, irx * 0.44, iry * 0.5, 0, 0, TAU);
      ctx.fill();
    }
    if (o.catch !== false) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(ix - irx * 0.36, iy - iry * 0.42, Math.max(0.8, irx * 0.2), Math.max(0.8, iry * 0.18), 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = ctx.globalAlpha * 0.8;
      ctx.beginPath(); ctx.arc(ix + irx * 0.34, iy + iry * 0.45, Math.max(0.6, irx * 0.09), 0, TAU); ctx.fill();
    }
    if (o.lidTop) {                                                       // an angry lid: a hard ink wedge across the top of the eye
      ctx.globalAlpha = 1; ctx.fillStyle = o.lidColor || pal.ink;
      ctx.beginPath(); ctx.moveTo(-rx * 1.2, -ery * 1.2); ctx.lineTo(rx * 1.2, -ery * 1.2); ctx.lineTo(rx * 1.2, -ery + ery * 2 * o.lidTop * 0.5); ctx.lineTo(-rx * 1.2, -ery + ery * 2 * o.lidTop * 1.1); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    tk.inkPath(ctx, E(0, 0, rx, ery, 18), { closed: true, w: o.lw || 2.4, color: o.ring || pal.ink, align: 0.2, wobble: 0.05 });
    ctx.restore();
  }
  // drifting motes rising from (x, y): n particles, deterministic in t. o: col, size, rise (px/s), spread, life (s), alpha, add (additive, default true)
  function motes(ctx, x, y, t, n, seed, o) {
    o = o || {};
    const col = o.col || '#ffb040', size = o.size || 2.4, rise = num(o.rise, 30), spread = num(o.spread, 16), life = num(o.life, 1.6), m = tk.motion();
    ctx.save();
    if (o.add !== false) ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const per = life * (0.7 + 0.6 * hv(seed, 'l' + i)), ph = hv(seed, 'p' + i) * per, u = (((t + ph) % per) + per) % per / per;
      const px = x + (hv(seed, 'x' + i) - 0.5) * spread * 2 + sin(u * 5 + i) * 5 * m, py = y - u * rise * per;
      const a = sin(u * PI) * (o.alpha === undefined ? 0.9 : o.alpha);
      if (a < 0.05) continue;
      const r = size * (0.5 + hv(seed, 's' + i)) * (1 - u * 0.5);
      ctx.globalAlpha = cA(a);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  // a live lightning bolt between two points that re-rolls about 14 times a second. o: w, jag, n, color, core, seed
  function zap(ctx, x0, y0, x1, y1, t, o) {
    o = o || {};
    tk.bolt(ctx, x0, y0, x1, y1, { seed: Math.floor(t * 14) + (o.seed | 0) * 17, w: o.w || 2, jag: o.jag === undefined ? 9 : o.jag, n: o.n || 6, color: o.color || '#5fd0ff', core: o.core || '#eaffff' });
  }
  // sparks: short bright dashes flying out of (x, y) in a spread, looping. o: col, size, speed, life, spread (radians), dir (radians), alpha
  function sparks(ctx, x, y, t, n, seed, o) {
    o = o || {};
    const col = o.col || '#fff2a0', len = num(o.size, 6), speed = num(o.speed, 60), life = num(o.life, 0.7), dir = num(o.dir, -PI / 2), spread = num(o.spread, PI);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineWidth = num(o.w, 1.8);
    for (let i = 0; i < n; i++) {
      const per = life * (0.7 + 0.6 * hv(seed, 'sl' + i)), u = ((((t + hv(seed, 'sp' + i) * per) % per) + per) % per) / per;
      const a = dir + (hv(seed, 'sa' + i) - 0.5) * spread, d = u * speed * (0.5 + hv(seed, 'sv' + i));
      const px = x + cos(a) * d, py = y + sin(a) * d + u * u * num(o.grav, 0), al = (1 - u) * (o.alpha === undefined ? 0.95 : o.alpha);
      if (al < 0.04) continue;
      ctx.globalAlpha = cA(al);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - cos(a) * len * (1 - u * 0.5), py - sin(a) * len * (1 - u * 0.5)); ctx.stroke();
    }
    ctx.restore();
  }
  // soft translucent puffs rising or drifting from (x, y): smoke, steam, cloud, dust. o: col, rise, spread, size, life, alpha, dx
  function puffs(ctx, x, y, t, n, seed, o) {
    o = o || {};
    const col = o.col || '#ffffff', rise = num(o.rise, 40), spread = num(o.spread, 8), size = num(o.size, 6), life = num(o.life, 1.1);
    ctx.save();
    for (let i = 0; i < n; i++) {
      const per = life * (0.8 + 0.4 * hv(seed, 'l' + i)), u = ((((t + hv(seed, 'p' + i) * per) % per) + per) % per) / per;
      const a = sin(u * PI) * num(o.alpha, 0.5);
      if (a < 0.03) continue;
      ctx.globalAlpha = cA(a); ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x + (hv(seed, 'x' + i) - 0.5) * spread * 2 + num(o.dx, 0) * u, y - u * rise, size * (0.5 + u * 1.1) * (0.7 + hv(seed, 's' + i) * 0.6), 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  // a crescent slash: an arc of radius r from angle a0 to a1 with a pointed, tapering body `thick` px deep at its middle. o: alpha, fill, edge, glow
  function swoosh(ctx, cx, cy, r, thick, a0, a1, o) {
    o = o || {};
    const am = (a0 + a1) / 2, half = (a1 - a0) / 2;
    const cm = [cos(am) * r * cos(half), sin(am) * r * cos(half)], im = [cos(am) * (r - thick), sin(am) * (r - thick)];
    const q = [2 * im[0] - cm[0], 2 * im[1] - cm[1]];
    ctx.save(); ctx.translate(cx, cy);
    ctx.globalAlpha = ctx.globalAlpha * cA(o.alpha === undefined ? 1 : o.alpha);
    ctx.beginPath(); ctx.arc(0, 0, r, a0, a1, a1 < a0); ctx.quadraticCurveTo(q[0], q[1], cos(a0) * r, sin(a0) * r); ctx.closePath();
    ctx.fillStyle = o.fill || '#ffffff'; ctx.fill();
    if (o.edge) { ctx.strokeStyle = o.edge; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.restore();
  }
  // ballistic offsets for a part that flies apart in a death: p 0..1 -> {x, y, r, a}. Deterministic per (seed, name)
  function fling(seed, name, p, o) {
    o = o || {};
    const vx = (hv(seed, name + 'vx') - 0.5) * num(o.spread, 150) + num(o.bias, 0), vy = -num(o.up, 70) * (0.4 + hv(seed, name + 'vy')), g = num(o.g, 300);
    const u = clamp(p, 0, 1), ground = num(o.ground, 1e9);
    return { x: vx * u, y: Math.min(ground, vy * u + g * u * u), r: (hv(seed, name + 'r') - 0.5) * num(o.spin, 6) * u, a: 1 - clamp((u - 0.62) / 0.38, 0, 1) };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // the themed dissolve used by every death: a clip made of shrinking cells, redaction strips or an eraser wipe, plus matching flying fragments
  // ---------------------------------------------------------------------------------------------------------------
  const cellCache = {};
  function cellsOf(spec) {
    const ck = spec.id + '|' + (spec.die.key || '');
    if (cellCache[ck]) return cellCache[ck];
    const d = spec.die, b = d.box, nx = d.nx || 11, ny = d.ny || 14, cw = (b[2] - b[0]) / nx, ch = (b[3] - b[1]) / ny, cells = [], r = tk.rng('en3die', spec.id);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const u = (i + 0.5) / nx, v = (j + 0.5) / ny, rnd = r();
      let f;
      switch (d.from) {
        case 'bottom': f = 1 - v; break;                                             // the bottom goes first
        case 'top': f = v; break;
        case 'left': f = u; break;
        case 'right': f = 1 - u; break;
        case 'out': f = 1 - Math.min(1, Math.hypot((u - 0.5) * 2, (v - 0.5) * 2) / 1.05); break;
        case 'in': f = Math.min(1, Math.hypot((u - 0.5) * 2, (v - 0.5) * 2) / 1.05); break;
        default: f = rnd;
      }
      const th = 0.05 + 0.72 * clamp(f * (d.order === undefined ? 0.72 : d.order) + rnd * (1 - (d.order === undefined ? 0.72 : d.order)), 0, 1);
      cells.push({ x: b[0] + (i + 0.5) * cw, y: b[1] + (j + 0.5) * ch, th, rnd, r2: r(), r3: r() });
    }
    cellCache[ck] = { cells, cw, ch };
    return cellCache[ck];
  }
  const LIFE = 0.2;
  function dissolveClip(ctx, spec, p) {
    const d = spec.die, b = d.box;
    if (d.shape === 'strips') {
      // redaction: horizontal bands whose visible part is eaten from alternating sides
      const n = d.ny || 16, bh = (b[3] - b[1]) / n, w = b[2] - b[0];
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const th = 0.04 + 0.6 * (d.from === 'bottom' ? (n - 1 - i) / n : i / n) * 0.85 + 0.12 * hv(spec.id, 'st' + i), u = clamp((p - th) / 0.3, 0, 1);
        if (u >= 1) continue;
        const cut = w * ease.inQuad(u);
        if (i % 2) ctx.rect(b[0], b[1] + i * bh - 0.5, w - cut, bh + 1); else ctx.rect(b[0] + cut, b[1] + i * bh - 0.5, w - cut, bh + 1);
      }
      ctx.clip();
      return;
    }
    if (d.shape === 'wipe') {
      // an eraser rubbing left to right in three slanted passes: everything behind the edge is gone
      const w = b[2] - b[0], h = b[3] - b[1], edge = b[0] - 30 + (w + 60) * ease.inOutQuad(p), sl = h * 0.35, k = sin(p * PI * 3.2);
      ctx.beginPath();
      ctx.moveTo(edge + sl * 0.5 * k, b[1] - 10); ctx.lineTo(b[2] + 60, b[1] - 10); ctx.lineTo(b[2] + 60, b[3] + 10); ctx.lineTo(edge - sl * 0.5 * k, b[3] + 10); ctx.closePath();
      ctx.clip();
      return;
    }
    const { cells, cw, ch } = cellsOf(spec), sq = d.shape === 'paper', hexs = d.shape === 'diamond', rad = Math.max(cw, ch) * 0.78;
    ctx.beginPath();
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (p >= c.th + LIFE) continue;
      const f = p < c.th ? 1 : 1 - (p - c.th) / LIFE;
      const r = rad * (0.15 + 0.85 * f);
      if (sq) {
        const a = (p - c.th) * (c.rnd - 0.5) * 9, cs = cos(a) * r * 0.86, sn = sin(a) * r * 0.86;
        ctx.moveTo(c.x - cs + sn, c.y - sn - cs); ctx.lineTo(c.x + cs + sn, c.y + sn - cs); ctx.lineTo(c.x + cs - sn, c.y + sn + cs); ctx.lineTo(c.x - cs - sn, c.y - sn + cs); ctx.closePath();
      } else if (hexs) {
        ctx.moveTo(c.x + r, c.y); ctx.lineTo(c.x, c.y + r * 0.9); ctx.lineTo(c.x - r, c.y); ctx.lineTo(c.x, c.y - r * 0.9); ctx.closePath();
      } else { ctx.moveTo(c.x + r, c.y); ctx.arc(c.x, c.y, r, 0, TAU); }
    }
    ctx.clip();
  }
  // flying fragments for a dissolve. kinds: petal scrap ember spark shard ink bar letter crumb stone puff feather wind
  function dissolveFx(ctx, spec, st) {
    const d = spec.die, p = st.E.die, b = d.box, kinds = d.kinds || ['scrap'], cols = d.cols || ['#f3e6c8'], wind = d.wind || [-14, -40];
    ctx.save();
    if (d.shape === 'strips') {
      // the black bars that strike each band out: they sweep in from the eaten side, hold for a beat, then fade
      const n = d.ny || 16, bh = (b[3] - b[1]) / n, w = b[2] - b[0];
      ctx.fillStyle = C.bar;
      for (let i = 0; i < n; i++) {
        const th = 0.04 + 0.6 * (d.from === 'bottom' ? (n - 1 - i) / n : i / n) * 0.85 + 0.12 * hv(spec.id, 'st' + i), u = clamp((p - th) / 0.3, 0, 1);
        if (u <= 0) continue;
        const cut = w * ease.inQuad(u), lead = clamp(u * 3, 0, 1) * 14, fade = 1 - clamp((p - th - 0.3) / 0.16, 0, 1);
        if (fade <= 0) continue;
        ctx.globalAlpha = cA(fade);
        if (i % 2) ctx.fillRect(b[0] + w - cut - lead, b[1] + i * bh + bh * 0.12, cut + lead, bh * 0.76); else ctx.fillRect(b[0], b[1] + i * bh + bh * 0.12, cut + lead, bh * 0.76);
      }
    }
    let drawn = 0;
    const { cells } = cellsOf(spec);
    for (let i = 0; i < cells.length && drawn < 70; i++) {
      const c = cells[i];
      const th = d.shape === 'strips' || d.shape === 'wipe' ? 0.08 + 0.6 * c.rnd : c.th;
      if (c.rnd < (d.thin === undefined ? 0.42 : d.thin) || p < th) continue;
      const a = p - th, life = d.life || 0.5;
      if (a > life) continue;
      const u = a / life, kind = kinds[i % kinds.length], col = cols[(i >> 1) % cols.length];
      const px = c.x + wind[0] * a * 5 + sin(a * 14 + i) * 5 * (1 - u * 0.4) + (c.r2 - 0.5) * 30 * u, py = c.y + wind[1] * a * 5 * (0.5 + c.r3) + (kind === 'stone' || kind === 'shard' ? 70 * u * u : 0);
      const al = cA((1 - u) * (1 - p * p * 0.5) * 1.15), sz = (d.size || 6) * (0.55 + c.r3 * 0.8);
      ctx.globalAlpha = al;
      fragment(ctx, kind, px, py, sz, col, a, u, i, c, al);
      drawn++;
    }
    ctx.restore();
  }
  function fragment(ctx, kind, px, py, sz, col, a, u, i, c, al) {
    if (kind === 'petal') tk.petal(ctx, px, py, sz, a * 9 + i, al, col);
    else if (kind === 'scrap') {
      ctx.save(); ctx.translate(px, py); ctx.rotate(a * 11 * (c.r2 - 0.5) * 3 + i); ctx.fillStyle = col; ctx.strokeStyle = pal.ink; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.rect(-sz * 0.8, -sz * 0.55, sz * 1.6, sz * 1.1); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-sz * 0.5, -sz * 0.15); ctx.lineTo(sz * 0.5, -sz * 0.15); ctx.moveTo(-sz * 0.5, sz * 0.2); ctx.lineTo(sz * 0.2, sz * 0.2); ctx.lineWidth = 0.8; ctx.stroke();
      ctx.restore();
    } else if (kind === 'ember') {
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py - u * 20, sz * 0.5 * (1 - u * 0.6), 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
    } else if (kind === 'spark') {
      ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      const ang = (c.r2 - 0.5) * TAU, l = sz * (1 - u * 0.5);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + cos(ang) * l * 0.5 + 2, py + sin(ang) * l * 0.5); ctx.lineTo(px + cos(ang) * l - 2, py + sin(ang) * l * 0.9); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    } else if (kind === 'shard') {
      ctx.save(); ctx.translate(px, py); ctx.rotate(a * 8 * (c.r2 - 0.5) * 3 + i); ctx.fillStyle = col; ctx.strokeStyle = pal.ink; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(-sz * 0.7, sz * 0.4); ctx.lineTo(sz * 0.1, -sz * 0.8); ctx.lineTo(sz * 0.8, sz * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    } else if (kind === 'ink') {
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, sz * 0.6 * (1 - u * 0.5), 0, TAU); ctx.fill();
    } else if (kind === 'bar') {
      ctx.save(); ctx.translate(px, py); ctx.rotate((c.r2 - 0.5) * 0.5); ctx.fillStyle = col; ctx.fillRect(-sz * 1.2, -sz * 0.28, sz * 2.4, sz * 0.56); ctx.restore();
    } else if (kind === 'letter') {
      ctx.save(); ctx.translate(px, py); ctx.rotate((c.r2 - 0.5) * 1.6 + a * 2); ctx.fillStyle = col; ctx.strokeStyle = pal.ink; ctx.lineWidth = 1.6; ctx.font = '900 ' + Math.round(sz * 1.9) + 'px ' + tk.font.num;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const ch = 'aeg#@?!%&xzq'.charAt((i * 7) % 12);
      ctx.strokeText(ch, 0, 0); ctx.fillText(ch, 0, 0); ctx.restore();
    } else if (kind === 'crumb') {
      ctx.save(); ctx.translate(px, py + u * u * 30); ctx.rotate(a * 9 + i); ctx.fillStyle = col; ctx.strokeStyle = 'rgba(120,50,70,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.rect(-sz * 0.5, -sz * 0.35, sz, sz * 0.7); ctx.fill(); ctx.stroke(); ctx.restore();
    } else if (kind === 'stone') {
      ctx.save(); ctx.translate(px, py); ctx.rotate(a * 5 * (c.r2 - 0.5) * 3 + i); ctx.fillStyle = col; ctx.strokeStyle = pal.ink; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-sz * 0.8, sz * 0.2); ctx.lineTo(-sz * 0.4, -sz * 0.7); ctx.lineTo(sz * 0.5, -sz * 0.6); ctx.lineTo(sz * 0.8, sz * 0.3); ctx.lineTo(0, sz * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    } else if (kind === 'puff') {
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, sz * (0.6 + u * 1.2), 0, TAU); ctx.fill();
    } else if (kind === 'feather') {
      ctx.save(); ctx.translate(px, py + u * 26); ctx.rotate(sin(a * 12 + i) * 0.9 + (c.r2 - 0.5) * 2); ctx.fillStyle = col; ctx.strokeStyle = pal.ink; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(0, -sz * 1.1); ctx.quadraticCurveTo(sz * 0.7, -sz * 0.2, 0, sz * 1.1); ctx.quadraticCurveTo(-sz * 0.7, -sz * 0.2, 0, -sz * 1.1); ctx.fill(); ctx.stroke(); ctx.restore();
    } else if (kind === 'wind') {
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(px, py, sz * (0.5 + u), a * 6, a * 6 + PI * 1.3); ctx.stroke();
    }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // registration
  // ---------------------------------------------------------------------------------------------------------------
  function makeState(spec, o) {
    o = o || {};
    const s = num(o.s, 1) > 0 ? num(o.s, 1) : 1, t = num(o.t, 0), pt = Math.max(0, num(o.pt, 0));
    const pose = POSES.indexOf(o.pose) >= 0 ? o.pose : 'idle';
    const E0 = poseState(pose, t, pt);
    const hp = o.hpPct === undefined ? 1 : clamp(num(o.hpPct, 1), 0, 1);
    return {
      spec, E: E0, s, q: qOf(s), t, pt, pose, hp, phase: o.phase | 0, glow: num(o.glow, 0),
      flash: E0.flash, m: E0.m, wound: sm((0.5 - hp) / 0.5),
    };
  }
  function register(spec) {
    ART.enemy.register(spec.id, {
      bounds: spec.bounds,
      draw(ctx, o) {
        const st = makeState(spec, o);
        if (st.E.die >= 1) return;
        const dieSpec = typeof spec.die === 'function' ? spec.die(st) : spec.die;
        ctx.save();
        if (spec.k) ctx.scale(spec.k, spec.k);
        if (st.E.die > 0 && dieSpec && dieSpec.clip !== false) dissolveClip(ctx, { id: spec.id, die: dieSpec }, st.E.die);
        spec.rig(ctx, st);
        ctx.restore();
        if (st.E.die > 0 && dieSpec) { ctx.save(); if (spec.k) ctx.scale(spec.k, spec.k); dissolveFx(ctx, { id: spec.id, die: dieSpec }, st); ctx.restore(); }
      },
    });
  }
  function warm(id, s) {
    const spec = SPECS[id];
    if (!spec) return 0;
    const q = qOf(s);
    let n = 0;
    Object.keys(spec.parts).forEach((k) => { partSpr(spec, k, q); n++; });
    Object.keys(spec.chains).forEach((k) => { n += chainOf(spec, k).warm(q); });
    return n;
  }

  // ===============================================================================================================
  // CREATURES
  // ===============================================================================================================
  // ---------------------------------------------------------------------------------------------------------------
  // STORM DRONE (normal, m): a brass Aladdin lamp that flew into a thundercloud and came out humming. It hovers on a scrap of storm, a toy rotor on
  // its lid, lightning rods either side, one big cyan lens for an eye and a trumpet spout that jabs three times. Accent: the cyan lens and the arcs.
  // ---------------------------------------------------------------------------------------------------------------
  const DR = { brass: '#d9a441', brassD: '#9a6320', gold: '#ffe08a', teal: '#2f8f8a', cloud: '#6b6796', cloudD: '#3a3568', arc: '#5fd0ff', arcCore: '#eaffff' };
  define('storm_drone', {
    size: 'm', lw: 3.1,
    col: { rim: '#9ffbff' },
    bounds: { w: 190, h: 177, head: { x: -26, y: -166 }, body: { x: 0, y: -98 }, feet: { x: 0, y: 0 } },
    die: { box: [-96, -174, 84, -26], nx: 10, ny: 10, from: 'out', order: 0.6, shape: 'diamond', kinds: ['spark', 'shard', 'spark', 'ember'], cols: ['#bffcff', '#d9a441', '#ffe45e', '#5ff5ff'], wind: [0, -6], size: 8 },
    parts: {
      cloud: {
        box: [-58, -70, 58, -24], pivot: [0, -48],
        draw(S) {
          const puffs3 = [[-30, -46, 20, 15], [-8, -52, 24, 19], [18, -47, 22, 16], [40, -42, 15, 11], [-46, -38, 13, 9]];
          puffs3.forEach((c, i) => S.ell(c[0], c[1], c[2], c[3], i % 2 ? DR.cloud : '#7a76a8', { depth: 6, line: 2.6, hi: false, rim: '#a8f4ff', rimW: 1.6, halftone: { d: 5, alpha: 0.3 } }));
          tk.inkPath(S.g, [[-52, -36], [-20, -30], [16, -30], [50, -36]], { w: 2.2, color: DR.cloudD, alpha: 0.7, taper: 0.4 });
        },
      },
      handle: {
        box: [22, -130, 76, -74], pivot: [30, -104],
        draw(S) {
          S.rib([[28, -118], [52, -128], [66, -106], [52, -84], [28, -88]], DR.brass, { wMax: 9, w0: 9, w1: 9, tipPow: 1, cap: 'round', shadow: DR.brassD, rim: '#fff0b0', profile: () => 1 });
          S.cel(E(66, -106, 6, 6), DR.brassD, { depth: 2, line: 2.2, hi: false, rim: null });
        },
      },
      spout: {
        box: [-86, -140, -20, -80], pivot: [-30, -104],
        draw(S) {
          S.cel([[-24, -118], [-44, -118], [-62, -122], [-78, -132, 1], [-80, -104, 1], [-64, -104], [-46, -96], [-24, -90]], DR.brass, {
            depth: 8, tension: 0.6, hi: true, hiW: 2.4, rim: '#fff0b0', halftone: { d: 5, alpha: 0.25 },
            decor(g) { [-34, -52, -68].forEach((x, i) => tk.inkPath(g, [[x, -128 + i * 2], [x - 2, -88 + i * 3]], { w: 3, color: DR.gold, alpha: 0.75, taper: 0.1, wobble: 0.1 })); },
          });
          S.cel(E(-79, -118, 5.4, 15, 12, 0.12), DR.brassD, { depth: 3, line: 2.8, hi: false, rim: null });
          S.ell(-80, -118, 2.8, 10.5, '#120a24', { line: 1.4, shadow: false, rim: null });
        },
      },
      body: {
        box: [-42, -146, 44, -60], pivot: [0, -98],
        draw(S) {
          // the foot ring, then the pot-belly with an engraved cloud-scroll band, then the lid
          S.cel({ poly: [[-16, -74], [16, -74], [12, -64], [-12, -64]] }, DR.brassD, { depth: 3, line: 2.6, hi: false, rim: null });
          S.cel([[-24, -124], [0, -130], [24, -124], [37, -104], [35, -86], [21, -73], [0, -69], [-21, -73], [-35, -86], [-37, -104]], DR.brass, {
            depth: 14, hi: true, hiW: 3.2, halftone: { d: 5, alpha: 0.3 }, rim: '#fff0b0',
            decor(g) {
              tk.inkPath(g, [[-40, -104], [-20, -108], [0, -104], [20, -108], [40, -104]], { w: 3, color: DR.gold, alpha: 0.85, taper: 0.02, wobble: 0.03 });
              tk.inkPath(g, [[-40, -92], [-20, -96], [0, -92], [20, -96], [40, -92]], { w: 2.4, color: DR.teal, alpha: 0.9, taper: 0.02, wobble: 0.03 });
              for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(-32 + i * 16, -98, 2, 0, TAU); g.fillStyle = DR.brassD; g.fill(); }
              for (let i = 0; i < 4; i++) tk.inkCurve(g, 6 + i * 6, -86, 10 + i * 6, -80, 14 + i * 6, -86, { w: 1.4, color: DR.brassD, alpha: 0.8, taper: 0.3 });
            },
          });
          S.cel([[-22, -126], [-10, -138], [10, -138], [22, -126], [12, -122], [-12, -122]], DR.brass, { depth: 5, hi: true, rim: '#fff0b0', line: 2.8 });
          S.cel({ poly: [[-6, -150], [6, -150], [8, -138], [-8, -138]] }, DR.brassD, { depth: 2, line: 2.4, hi: false, rim: null });
        },
      },
      antL: {
        box: [-40, -176, -10, -124], pivot: [-16, -128],
        draw(S) {
          S.cel(cap(-16, -128, -30, -162, 5.4, 3.8), '#b9b4d8', { depth: 2, line: 2.4, hi: false, rim: '#ffffff' });
          S.cel(E(-31, -166, 5.4, 5.4), '#9ffbff', { depth: 2, line: 2.2, hi: true, rim: null });
        },
      },
      antR: {
        box: [10, -176, 40, -124], pivot: [16, -128],
        draw(S) {
          S.cel(cap(16, -128, 30, -162, 5.4, 3.8), '#b9b4d8', { depth: 2, line: 2.4, hi: false, rim: '#ffffff' });
          S.cel(E(31, -166, 5.4, 5.4), '#9ffbff', { depth: 2, line: 2.2, hi: true, rim: null });
        },
      },
      brow: {
        box: [-38, -122, 8, -96], pivot: [-14, -110],
        draw(S) {
          S.cel([[-34, -118], [-14, -122], [4, -112], [2, -104], [-14, -111], [-32, -108]], DR.brassD, { depth: 3, line: 2.6, hi: true, hiW: 1.4, rim: '#fff0b0', tension: 0.5 });
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die, atk = E0.pose === 'attack';
      let jab = 0, jabN = -1;
      if (atk) { const q = clamp((E0.p - 0.08) / 0.84, 0, 0.999) * 3; jabN = Math.floor(q); jab = sin(PI * (q % 1)); }
      const hot = clamp(tele + buff + jab * 0.8 + die, 0, 1);
      const shake = (tele * 1.6 + buff * 2.2 + die * 3.5) * sin(t * 61);
      const bob = sin(t * 2.3) * 5 * m;
      const dx = -jab * 16 + hurt * 22 + tele * 10 + shake, dy = bob - hurt * 8 + shake * 0.4 - tele * 3 + guard * 2;
      const rot = 0.03 * sin(t * 1.7) * m + hurt * 0.32 + tele * 0.14 - jab * 0.08;
      const spin = t * (38 + 34 * hot + 20 * guard);
      // the scrap of storm it rides on
      const cpulse = 1 + 0.03 * sin(t * 3.1);
      put(ctx, st, 'cloud', { x: dx * 0.4, y: bob * 0.4 + hurt * 3, sx: cpulse, sy: 1 / cpulse });
      const fl = flick(t, 5, 6);
      tk.glow(ctx, -6 + dx * 0.4, -44, 44, '#8ff4ff', 0.12 + 0.34 * (fl > 0.72 ? 1 : 0) * (1 - die) + 0.1 * hot);
      ctx.save();
      xform(ctx, 0, -98, dx, dy, rot, 1 - 0.06 * guard, 1 - 0.06 * guard + 0.03 * jab);
      put(ctx, st, 'handle', { r: 0.05 * sin(t * 2.1) * m - 0.1 * hurt });
      // tail rotor on the handle
      {
        const hx = 66, hy = -106, ph = spin * 1.3;
        tk.glow(ctx, hx, hy, 15, '#dfffff', 0.16);
        ctx.save(); ctx.translate(hx, hy); ctx.scale(0.5, 1); ctx.globalAlpha = 0.34; ctx.fillStyle = '#e8fdff'; ctx.beginPath(); ctx.arc(0, 0, 17, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(20,15,46,0.85)'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, -cos(ph) * 15); ctx.lineTo(0, cos(ph) * 15); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sin(ph) * 6, -sin(ph) * 15 * 0.4); ctx.lineTo(-sin(ph) * 6, sin(ph) * 15 * 0.4); ctx.stroke(); ctx.restore();
      }
      put(ctx, st, 'spout', { r: -0.04 * jab + 0.05 * tele - 0.05 * hurt });
      put(ctx, st, 'antL', { r: -0.06 * sin(t * 2.6 + 1) * m - 0.1 * hot });
      put(ctx, st, 'antR', { r: 0.06 * sin(t * 2.6) * m + 0.1 * hot });
      // the mast and its toy rotor
      tk.inkPath(ctx, [[0, -138], [0, -152]], { w: 3.2, color: pal.ink, taper: 0.05, pressure: 'flat', wobble: 0 });
      {
        const mx = 0, my = -153, rx = 38, wob2 = 0.5 + 0.5 * cos(spin);
        ctx.save(); ctx.translate(mx, my);
        ctx.globalAlpha = 0.3 * (1 - die); ctx.fillStyle = '#e8fdff'; ctx.beginPath(); ctx.ellipse(0, 0, rx, 6, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.9 * (1 - die * 0.7); ctx.strokeStyle = pal.ink; ctx.lineCap = 'round'; ctx.lineWidth = 3.4;
        ctx.beginPath(); ctx.moveTo(-cos(spin) * rx, -sin(spin) * 3.2); ctx.lineTo(cos(spin) * rx, sin(spin) * 3.2); ctx.stroke();
        ctx.strokeStyle = DR.brass; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-cos(spin) * rx * 0.96, -sin(spin) * 3.2); ctx.lineTo(cos(spin) * rx * 0.96, sin(spin) * 3.2); ctx.stroke();
        ctx.globalAlpha = 0.5; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(0, 0, rx * (0.7 + 0.25 * wob2), 4.2, 0, 0.2, PI - 0.2); ctx.stroke();
        ctx.restore();
        tk.sparkle(ctx, mx, my, 3.2, { color: '#ffffff', glow: 0.2, alpha: 0.9 });
      }
      put(ctx, st, 'body', {
        kids(c) {
          // the lens: a live glass eye with a dilating pupil and a shutter lid
          const lx = -14, ly = -98, R = 13.5, open = blink(t, 'drone', 3.4) * (1 - 0.35 * hurt) * (1 - 0.3 * tele) * (1 - 0.15 * guard);
          tk.glow(c, lx, ly, 34, hot > 0.3 ? '#ffb040' : '#5ff5ff', 0.4 + 0.4 * hot);
          c.save(); c.beginPath(); c.arc(lx, ly, R, 0, TAU); c.clip();
          const gr = c.createRadialGradient(lx - 3, ly - 3, 1, lx, ly, R);
          if (hot > 0.35) { gr.addColorStop(0, '#fffbd0'); gr.addColorStop(0.55, '#ffb030'); gr.addColorStop(1, '#a01a20'); } else { gr.addColorStop(0, '#f2ffff'); gr.addColorStop(0.5, '#4fd8f0'); gr.addColorStop(1, '#0a4a90'); }
          c.fillStyle = gr; c.fillRect(lx - R, ly - R, R * 2, R * 2);
          const lk = [sin(t * 0.9) * 0.7 - 0.2 + tele * -0.4, cos(t * 0.7) * 0.4 * m], pr = R * (0.36 + 0.1 * hot + 0.08 * Math.max(0, sin(t * 0.5))), px = lx + lk[0] * 4, py = ly + lk[1] * 3;
          c.fillStyle = '#0a0620'; c.beginPath(); c.arc(px, py, pr, 0, TAU); c.fill();
          c.strokeStyle = 'rgba(10,6,32,0.55)'; c.lineWidth = 1.4;
          for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + spin * 0.05; c.beginPath(); c.moveTo(px + cos(a) * pr, py + sin(a) * pr); c.lineTo(px + cos(a) * R, py + sin(a) * R); c.stroke(); }
          c.fillStyle = 'rgba(255,255,255,0.95)'; c.beginPath(); c.ellipse(lx - 5, ly - 5.5, 3.6, 2.4, -0.6, 0, TAU); c.fill(); c.beginPath(); c.arc(lx + 5.5, ly + 5, 1.4, 0, TAU); c.fill();
          // the shutter: brass lid coming down from the top
          const ld = (1 - open) * R * 2;
          if (ld > 0.5) { c.fillStyle = DR.brassD; c.fillRect(lx - R, ly - R, R * 2, ld); c.fillStyle = pal.ink; c.fillRect(lx - R, ly - R + ld - 1.2, R * 2, 1.6); }
          c.restore();
          tk.inkPath(c, E(lx, ly, R, R, 18), { closed: true, w: 2.6, color: pal.ink, align: 0.2, wobble: 0.04 });
        },
      });
      put(ctx, st, 'brow', { r: -0.06 * hot + 0.03 * hurt, y: 2 * hurt });
      // arcs between the lightning rods, wider when it is worked up
      {
        const a0 = [-30 + 0.06 * -12 * hot, -166], a1 = [30 + 0.06 * 12 * hot, -166], arcK = 0.55 + 0.45 * hot + 0.25 * flick(t, 9, 7);
        if (flick(t, 3, 9) > 0.32 - 0.3 * hot) {
          ctx.save(); ctx.globalAlpha = cA(arcK * (1 - die * 0.4));
          zap(ctx, a0[0], a0[1], a1[0], a1[1], t, { seed: 1, w: 1.6 + hot * 1.4, jag: 8 + 8 * hot, n: 7, color: DR.arc, core: DR.arcCore });
          if (hot > 0.25) zap(ctx, a0[0], a0[1] + 2, a1[0], a1[1] - 8, t, { seed: 2, w: 1.4, jag: 12, n: 6 });
          ctx.restore();
        }
        tk.glow(ctx, a0[0], a0[1], 14 + 10 * hot, DR.arc, 0.5 + 0.3 * flick(t, 4, 8));
        tk.glow(ctx, a1[0], a1[1], 14 + 10 * hot, DR.arc, 0.5 + 0.3 * flick(t, 5, 8));
      }
      // the spout: a charge orb gathers on a telegraph, a bolt fires on every jab
      {
        const mx = -80, my = -118;
        if (tele > 0.02 || jab > 0.02 || buff > 0.1) {
          const r = 3 + 12 * tele + 6 * jab + 4 * buff;
          tk.glow(ctx, mx - 4, my, r * 2.6, '#8ff4ff', cA(0.5 + 0.4 * tele));
          ctx.beginPath(); ctx.arc(mx - 4, my, r, 0, TAU); ctx.fillStyle = '#f6ffff'; ctx.fill();
          if (tele > 0.15) for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + t * 7; zap(ctx, mx - 4 + cos(a) * r, my + sin(a) * r, mx - 4 + cos(a) * (r + 18 * tele), my + sin(a) * (r + 18 * tele), t, { seed: i + 4, w: 1.4, jag: 4, n: 3 }); }
        }
        if (atk && jab > 0.3) {
          const tgt = [[-176, -116], [-164, -148], [-164, -84]][jabN] || [-170, -116];
          zap(ctx, mx, my, tgt[0], tgt[1], t, { seed: jabN + 10, w: 3, jag: 12, n: 8 });
          zap(ctx, mx, my, tgt[0] + 10, tgt[1] + 10, t, { seed: jabN + 20, w: 1.6, jag: 16, n: 6 });
          tk.glow(ctx, tgt[0], tgt[1], 36, '#bffcff', 0.6 * jab);
        }
      }
      if (guard > 0.05) {
        for (let i = 0; i < 6; i++) {
          const a = t * 3 + i * TAU / 6, r0 = 62;
          zap(ctx, cos(a) * r0, -98 + sin(a) * r0 * 0.8, cos(a + 0.7) * r0, -98 + sin(a + 0.7) * r0 * 0.8, t, { seed: i, w: 1.8, jag: 5, n: 4 });
        }
      }
      ctx.restore();
      if (hot > 0.15 || die > 0) sparks(ctx, dx, -98 + dy, t, 10, 31, { col: '#fff2a0', speed: 54 + 40 * die, size: 6, spread: TAU, life: 0.6, alpha: 0.9 * clamp(hot + die, 0, 1) });
      if (buff > 0.05) { ctx.save(); ctx.globalAlpha = buff * 0.7; ctx.strokeStyle = '#fff2a0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, -98, 40 + 60 * E0.buffP, 34 + 50 * E0.buffP, 0, 0, TAU); ctx.stroke(); ctx.restore(); }
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // KOMAINU GUARDIAN (normal, l): a stone lion-dog off a shrine gate, alone on a chipped plinth, curly stone mane, a straw shimenawa with paper streamers,
  // amber light leaking out of every crack. Braces (stone spikes rise), then pounces. Accent: glowing amber eyes and cracks.
  // ---------------------------------------------------------------------------------------------------------------
  const KM = { stone: '#8d94b8', stoneD: '#646b92', stoneL: '#b9bfdc', mane: '#8189b4', maneD: '#5e6690', crack: '#ff9a3a', crackH: '#ffe08a', rope: '#c9a35f', ropeD: '#7a5a28', paper: '#fff8f0', eye: '#ffb040', horn: '#d8d4e8' };
  function whorl(S, cx, cy, r, col, a0, sweep) {
    const pts = [];
    for (let i = 0; i <= 14; i++) { const u = i / 14, a = (a0 || 0) + u * (sweep || 5.2), rr = r * (1 - u * 0.86); pts.push([cx + cos(a) * rr, cy + sin(a) * rr]); }
    S.line(pts, { w: Math.max(1.4, r * 0.16), color: col, alpha: 0.9, taper: 0.25, wobble: 0.06 });
  }
  function crackLine(S, pts, w) {
    S.line(pts, { w: (w || 3.2) + 1.6, color: '#2a0d0a', taper: 0.15, wobble: 0.1 });
    S.line(pts, { w: (w || 3.2) * 0.55, color: KM.crack, taper: 0.15, wobble: 0.1 });
  }
  const KM_GLOW = [[-22, -128], [42, -142], [58, -92], [-58, -104], [8, -84], [-78, -60], [70, -70]];
  function komainuLeg(S, far, hind) {
    const c = far ? KM.stoneD : KM.stone, o = { depth: 8, hi: !far, hiW: 2.4, rim: far ? null : S.c.rim, halftone: { d: 5, alpha: far ? 0.36 : 0.28 } };
    if (!hind) {
      const ox = far ? 34 : 0;
      S.cel(cap(-68 + ox, -128, -73 + ox, -30, 36, 28), c, o);
      S.cel([[-98 + ox, -20], [-92 + ox, -34], [-70 + ox, -38], [-52 + ox, -30], [-50 + ox, -18], [-60 + ox, -12], [-92 + ox, -12]], c, Object.assign({}, o, { depth: 5 }));
      [-88, -76, -64].forEach((x) => S.line([[x + ox, -34], [x - 2 + ox, -16]], { w: 1.8, color: pal.ink, alpha: 0.7, taper: 0.4 }));
      if (!far) crackLine(S, [[-70, -96], [-64, -78], [-72, -62], [-66, -46]], 2.6);
      else S.line([[-40 + ox, -100], [-34 + ox, -70]], { w: 1.6, color: pal.ink, alpha: 0.5, taper: 0.4 });
    } else {
      const ox = far ? 26 : 0;
      S.cel(E(56 + ox, -98, 33, 40, 14, -0.25), c, Object.assign({}, o, { depth: 10 }));
      S.cel(cap(52 + ox, -74, 44 + ox, -30, 30, 22), c, Object.assign({}, o, { depth: 6, hi: false }));
      S.cel([[18 + ox, -20], [26 + ox, -36], [48 + ox, -38], [64 + ox, -28], [62 + ox, -16], [50 + ox, -12], [22 + ox, -12]], c, Object.assign({}, o, { depth: 5, hi: false }));
      [22, 34, 46].forEach((x) => S.line([[x + ox, -34], [x - 2 + ox, -16]], { w: 1.8, color: pal.ink, alpha: 0.7, taper: 0.4 }));
      if (!far) { whorl(S, 58, -102, 15, KM.stoneD, 0.4); crackLine(S, [[74, -118], [66, -100], [76, -84]], 2.4); }
    }
  }
  define('komainu_guardian', {
    size: 'l', lw: 3.6,
    col: { rim: '#c7d0ff', shT: 0.5 },
    bounds: { w: 290, h: 276, head: { x: -96, y: -246 }, body: { x: -4, y: -118 }, feet: { x: 0, y: 0 } },
    die: { box: [-160, -270, 130, 4], nx: 12, ny: 14, from: 'top', order: 0.55, shape: 'diamond', kinds: ['stone', 'stone', 'ember', 'puff'], cols: ['#8d94b8', '#646b92', '#ffb040', '#b9bfdc'], wind: [6, 10], size: 11, life: 0.55 },
    parts: {
      plinth: {
        box: [-130, -22, 128, 4], pivot: [0, 0],
        draw(S) {
          S.cel([[-118, -18], [102, -18], [116, -3], [124, 0, 1], [-124, 0, 1], [-112, -3]], KM.stoneD, { depth: 6, tension: 0.15, hi: true, hiW: 2, rim: '#c7d0ff', halftone: { d: 5, alpha: 0.32 }, line: 3.4 });
          S.line([[-100, -12], [-60, -10], [-52, -4]], { w: 1.8, color: pal.ink, alpha: 0.5, taper: 0.4 });
          crackLine(S, [[52, -17], [58, -10], [50, -3]], 2.4);
          S.line([[-30, -17], [-24, -10], [-34, -4]], { w: 1.6, color: pal.ink, alpha: 0.5, taper: 0.4 });
        },
      },
      legHF: { box: [-4, -138, 112, -8], pivot: [70, -18], draw(S) { komainuLeg(S, true, true); } },
      legFF: { box: [-94, -150, -6, -8], pivot: [-38, -18], draw(S) { komainuLeg(S, true, false); } },
      torso: {
        box: [-104, -184, 116, -56], pivot: [0, -100],
        draw(S) {
          S.cel([[-90, -130], [-72, -160], [-30, -174], [20, -172], [66, -162], [94, -138], [100, -108], [80, -78], [34, -64], [-20, -62], [-64, -70], [-92, -96]], KM.stone, {
            depth: 20, hi: true, hiW: 3.2, rim: S.c.rim, halftone: { d: 5, alpha: 0.3 },
            decor(g) {
              whorl(S, -54, -122, 20, KM.stoneD, 1.2);
              for (let i = 0; i < 4; i++) tk.inkPath(g, [[-26 + i * 24, -168], [-22 + i * 24, -134], [-30 + i * 24, -104]], { w: 2.4, color: KM.stoneD, alpha: 0.75, taper: 0.3, wobble: 0.08 });
              for (let i = 0; i < 3; i++) tk.inkPath(g, [[-16 + i * 26, -92 + i * 2], [4 + i * 26, -84], [22 + i * 26, -92]], { w: 1.8, color: KM.stoneD, alpha: 0.6, taper: 0.4 });
            },
          });
          crackLine(S, [[-30, -172], [-22, -150], [-34, -132], [-24, -112], [-30, -96]], 3.4);
          crackLine(S, [[44, -166], [38, -148], [50, -134], [42, -118]], 3);
          crackLine(S, [[10, -66], [4, -78], [16, -88]], 2.4);
          S.line([[80, -140], [70, -122]], { w: 1.6, color: pal.ink, alpha: 0.55, taper: 0.4 });
        },
      },
      legHN: { box: [-4, -138, 112, -8], pivot: [56, -18], draw(S) { komainuLeg(S, false, true); } },
      legFN: { box: [-124, -150, -36, -8], pivot: [-72, -18], draw(S) { komainuLeg(S, false, false); } },
      spikes: {
        box: [-60, -240, 100, -150], pivot: [16, -160],
        draw(S) {
          [[-46, 44], [-26, 58], [-4, 66], [18, 64], [40, 56], [62, 46], [82, 34]].forEach((sp, i) => {
            const x = sp[0], h = sp[1], y0 = -160 + (i > 4 ? 6 : 0);
            S.cel([[x - 11, y0 + 4, 1], [x - 2, y0 - h * 0.7], [x + 1, y0 - h, 1], [x + 8, y0 - h * 0.5], [x + 12, y0 + 4, 1]], KM.stoneL, { depth: 5, hi: true, hiW: 1.8, rim: '#ffffff', tension: 0.3, line: 2.8, halftone: { d: 4, alpha: 0.3 } });
            S.line([[x - 1, y0 - 2], [x + 1, y0 - h * 0.6]], { w: 1.4, color: KM.crack, alpha: 0.9, taper: 0.4 });
          });
        },
      },
      maneB: {
        box: [-150, -270, 20, -100], pivot: [-66, -186],
        draw(S) {
          const cur = [];
          for (let i = 0; i < 10; i++) { const a = PI * (0.95 + i * 0.13), R = 60 + 5 * (i % 3); cur.push([-66 + cos(a) * R, -186 + sin(a) * R * 0.98, 19 + 3 * ((i + 1) % 3), i]); }
          [[-22, -166, 20], [-40, -146, 18], [-100, -126, 20], [-118, -146, 17]].forEach((c, i) => cur.push([c[0], c[1], c[2], 20 + i]));
          cur.forEach((c) => {
            S.cel(E(c[0], c[1], c[2], c[2], 14), c[3] % 2 ? KM.mane : KM.maneD, { depth: 5, hi: c[3] % 2 === 1, hiW: 1.8, rim: S.c.rim, line: 3, halftone: { d: 4, alpha: 0.28 } });
            whorl(S, c[0], c[1], c[2] * 0.78, pal.ink, c[3] * 0.9, 4.8);
          });
        },
      },
      jaw: {
        box: [-162, -172, -46, -120], pivot: [-62, -160],
        draw(S) {
          S.cel([[-62, -164], [-104, -167], [-134, -166], [-146, -158], [-138, -142], [-108, -134], [-74, -138], [-56, -150]], KM.stone, { depth: 8, hi: true, hiW: 2, rim: S.c.rim, halftone: { d: 5, alpha: 0.3 } });
          [-130, -114, -98].forEach((x, i) => S.cel([[x - 4, -166, 1], [x + 1, -178 - (i % 2) * 2, 1], [x + 6, -166, 1]], KM.paper, { depth: 2, line: 2, hi: false, rim: null, tension: 0.2, shadow: false }));
          S.line([[-130, -146], [-96, -142], [-70, -146]], { w: 1.6, color: KM.stoneD, alpha: 0.8, taper: 0.4 });
        },
      },
      head: {
        box: [-166, -272, -30, -140], pivot: [-56, -178],
        draw(S) {
          // the ear, the horn, then the big square lion face
          S.cel([[-66, -226], [-52, -250], [-44, -222]], KM.stoneD, { depth: 4, line: 3, hi: false, rim: null, tension: 0.4 });
          S.cel([[-98, -234, 1], [-104, -250], [-114, -268, 1], [-92, -250], [-86, -232, 1]], KM.horn, { depth: 4, line: 3, hi: true, hiW: 1.6, rim: '#ffffff', tension: 0.3 });
          S.cel([[-60, -232], [-90, -243], [-120, -233], [-141, -213], [-150, -192], [-150, -172], [-137, -161], [-110, -157], [-84, -155], [-62, -156], [-46, -176], [-46, -206]], KM.stone, {
            depth: 16, hi: true, hiW: 3, rim: S.c.rim, halftone: { d: 5, alpha: 0.3 },
            decor(g) {
              tk.inkPath(g, [[-150, -186], [-128, -192], [-108, -186]], { w: 1.8, color: KM.stoneD, alpha: 0.85, taper: 0.4 });
              tk.inkPath(g, [[-92, -230], [-90, -214], [-98, -204]], { w: 1.8, color: KM.stoneD, alpha: 0.6, taper: 0.4 });
            },
          });
          // heavy brow, cheek curls, nose, fangs
          S.cel([[-128, -206], [-108, -214], [-84, -212], [-78, -204], [-98, -200], [-122, -198]], KM.stoneD, { depth: 4, line: 3, hi: false, rim: S.c.rim, tension: 0.5 });
          whorl(S, -68, -178, 11, KM.stoneD, 2.2);
          S.cel(E(-143, -180, 10.5, 8.6, 10), KM.stoneD, { depth: 3, line: 2.8, hi: true, hiW: 1.2, rim: null });
          S.ell(-147, -179, 2.8, 3.4, '#241a3a', { line: 1, shadow: false, rim: null });
          [[-132, -162], [-110, -158]].forEach((f, i) => S.cel([[f[0] - 5, f[1] - 2, 1], [f[0], f[1] + 16 - i * 2, 1], [f[0] + 6, f[1] - 2, 1]], KM.paper, { depth: 3, line: 2.2, hi: false, rim: null, tension: 0.2, shadow: false }));
          crackLine(S, [[-72, -232], [-74, -216], [-64, -202], [-70, -186]], 2.6);
        },
      },
      rope: {
        box: [-130, -168, -34, -104], pivot: [-80, -150],
        draw(S) {
          S.rib([[-56, -156], [-76, -146], [-100, -142], [-122, -152]], KM.rope, { wMax: 12, w0: 12, w1: 10, tipPow: 1, cap: 'round', profile: () => 1, shadow: KM.ropeD, rim: '#f2d894', line: 3 });
          for (let i = 0; i < 6; i++) { const p = along([[-56, -156], [-76, -146], [-100, -142], [-122, -152]], 0.08 + i * 0.17); S.line([[p.x - 3, p.y - 5], [p.x + 3, p.y + 5]], { w: 1.6, color: KM.ropeD, taper: 0.3 }); }
          [[-70, -146], [-92, -142], [-112, -146]].forEach((s0, k) => {
            const x = s0[0], y = s0[1];
            S.cel([[x - 3, y + 4, 1], [x + 5, y + 14, 1], [x - 4, y + 22, 1], [x + 6, y + 32, 1], [x - 3, y + 40, 1], [x - 8, y + 30, 1], [x + 1, y + 22, 1], [x - 8, y + 14, 1]], KM.paper, { depth: 2, line: 2, hi: false, rim: null, tension: 0, shadow: '#c9bdd8' });
          });
        },
      },
    },
    chains: {
      tail: {
        spine: [[92, -128], [116, -148], [130, -186], [116, -222], [92, -240]], cuts: [0.34, 0.68], reach: 46, overlap: 4,
        draw(S) {
          S.rib([[92, -128], [116, -148], [130, -186], [116, -222], [92, -240]], KM.stone, { wMax: 40, w0: 24, w1: 8, tipPow: 1.2, shadow: KM.stoneD, rim: S.c.rim, rimW: 1.8, line: 3.4, halftone: { d: 5, alpha: 0.3 },
            decor(g) { for (let i = 0; i < 4; i++) { const p = along([[92, -128], [116, -148], [130, -186], [116, -222], [92, -240]], 0.2 + i * 0.2); whorl(S, p.x + 4, p.y, 11 - i * 1.5, KM.stoneD, i, 4.6); } } });
          crackLine(S, [[124, -170], [128, -190], [120, -206]], 2.4);
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die, atk = E0.pose === 'attack';
      const p = atk ? E0.p : 0;
      const leap = atk ? sm((p - 0.27) / 0.16) * (1 - sm((p - 0.6) / 0.32)) : 0;
      const crouch = 15 * tele + (atk ? 12 * Math.max(0, -E0.swing) * 2 : 0) + 5 * guard + 10 * die;
      const br = sin(TAU * t / 3.6) * m;
      const rage = clamp(tele + guard * 0.4 + buff + st.wound * 0.6 + die, 0, 1);
      const dx = -leap * 92 + hurt * 15 + E0.shake * 1.6 * 0.5 + (buff > 0 ? -6 * buff : 0);
      const dy = crouch - leap * 44 + 0.6 * br;
      const rot = -0.05 * tele + leap * -0.1 + 0.05 * hurt;
      // the plinth stays put (a little dust jumps off it)
      put(ctx, st, 'plinth', {});
      const dust = (tele > 0.3 ? tele : 0) + leap * 0.6 + guard * 0.4;
      if (dust > 0.05 || die > 0) puffs(ctx, -40 + dx * 0.2, -16, t, 6, 61, { col: '#d9d2ea', rise: 30, spread: 60, size: 6, life: 1.2, alpha: 0.4 * clamp(dust + die, 0, 1) });
      ctx.save();
      xform(ctx, 0, -18, dx, dy, rot, 1, 1);
      const legK = 1 - (crouch * 0.6) / 110;
      const leg = (name, r0) => put(ctx, st, name, { sy: legK, r: r0 });
      leg('legHF', 0.25 * leap + 0.02 * br); leg('legFF', -0.4 * leap - 0.05 * tele);
      putChain(ctx, st, 'tail', [0.05 * sin(t * 1.9) * m + 0.25 * tele - 0.2 * leap + 0.2 * buff, 0.16 * sin(t * 1.9 - 0.8) * m, 0.24 * sin(t * 1.9 - 1.6) * m]);
      put(ctx, st, 'torso', { sy: 1 + 0.014 * br - 0.04 * tele + 0.03 * guard, sx: 1 + 0.008 * br + 0.02 * guard, r: 0.01 * br });
      if (guard > 0.02) put(ctx, st, 'spikes', { sy: 0.15 + 0.85 * ease.outBack(clamp(guard, 0, 1)), sx: 0.7 + 0.3 * guard, a: clamp(guard * 3, 0, 1) });
      leg('legHN', 0.3 * leap + 0.02 * br); leg('legFN', -0.5 * leap - 0.06 * tele);
      // the mane, the head and the jaw all ride on the neck
      const nodR = 0.03 * sin(t * 1.3) * m, headR = nodR - 0.13 * tele - 0.2 * (atk ? E0.strike : 0) + 0.3 * buff + 0.2 * hurt + 0.05 * tele * sin(t * 40);
      const open = (0.06 + 0.05 * sin(t * 2.4)) * m + 0.62 * tele + (atk ? 0.95 * E0.wind * (1 - E0.strike) : 0) + 0.85 * buff + 0.35 * hurt + 0.6 * die;
      put(ctx, st, 'maneB', { r: 0.02 * sin(t * 1.7) * m + headR * 0.5, sx: 1 + 0.05 * buff + 0.03 * tele + 0.02 * br, sy: 1 + 0.05 * buff + 0.03 * tele + 0.02 * br });
      ctx.save(); xform(ctx, -56, -178, 0, 0, 0, 1.12, 1.12);
      put(ctx, st, 'head', {
        r: headR, y: 0,
        pre(c) {
          // the mouth cavity, glowing when it is angry, then the lower jaw hinged under it
          if (open > 0.1) {
            const H = [-62, -160], U = [-140, -164], jx = H[0] - 80 * cos(open) + 10 * sin(open), jy = H[1] + 80 * sin(open) + 10 * cos(open);
            c.beginPath(); c.moveTo(H[0], H[1] - 6); c.lineTo(U[0], U[1]); c.lineTo(jx, jy - 4); c.lineTo(H[0], H[1] + 6); c.closePath();
            const gr = c.createLinearGradient(H[0], H[1], U[0], U[1] + 30);
            gr.addColorStop(0, '#ffcf6a'); gr.addColorStop(0.5, '#ff7a30'); gr.addColorStop(1, '#5a1010');
            c.fillStyle = gr; c.globalAlpha = 0.95; c.fill(); c.globalAlpha = 1;
            tk.glow(c, -108, -156 + open * 20, 46, '#ffb040', cA(0.35 + 0.5 * rage));
          }
          put(c, st, 'jaw', { r: -open });
        },
        kids(c) {
          const ob = blink(t, 'komainu', 4.6) * (1 - 0.3 * hurt);
          eyeLive(c, -101, -191, 10.5, 8.2, { open: ob, iris: ['#ff7a20', '#ffe070'], sclera: '#fff0c8', pupil: 'slit', glow: KM.eye, glowK: 0.7 + 0.3 * rage, glowR: 3, lw: 2.6, rot: -0.14, look: [-0.5 - tele * 0.4, 0.1], lidTop: 0.32 + 0.2 * rage });
          if (rage > 0.25) tk.glow(c, -100, -190, 30 + 20 * rage, '#ff9a3a', 0.22 * rage);
        },
      });
      ctx.restore();
      put(ctx, st, 'rope', { r: 0.03 * sin(t * 1.5 + 1) * m + headR * 0.3 + 0.04 * hurt });
      // light leaking out of the cracks
      const ck = 0.3 + 0.5 * rage + 0.15 * sin(t * 2.4);
      KM_GLOW.forEach((g0, i) => tk.glow(ctx, g0[0], g0[1], 14 + 12 * rage, KM.crack, cA(ck * (0.5 + 0.5 * sin(t * 2.2 + i * 1.3)) * (1 - die * 0.5))));
      if (guard > 0.05) tk.glow(ctx, 16, -170, 70, '#ffffff', 0.18 * guard);
      ctx.restore();
      if (buff > 0.03) {
        for (let i = 0; i < 3; i++) {
          const u = (E0.buffP + i * 0.28) % 1, r = 20 + 130 * u;
          ctx.save(); ctx.globalAlpha = cA((1 - u) * 0.7 * buff * 2); ctx.strokeStyle = '#ffb040'; ctx.lineWidth = 4 * (1 - u) + 1; ctx.beginPath(); ctx.ellipse(-130 + dx, -172, r * 0.55, r, 0, -1.1, 1.1); ctx.stroke(); ctx.restore();
        }
      }
      if (E0.pose === 'hurt' && E0.p < 0.7) for (let i = 0; i < 5; i++) { const fj = fling('kmhurt' + i, 'c', E0.p, { spread: 130, up: 60, g: 260, ground: -16 }); ctx.save(); ctx.globalAlpha = fj.a; ctx.translate(-30 + fj.x, -130 + fj.y); ctx.rotate(fj.r); ctx.fillStyle = KM.stone; ctx.strokeStyle = pal.ink; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-5, 3); ctx.lineTo(-2, -5); ctx.lineTo(5, -3); ctx.lineTo(4, 4); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // REDACTION KNIGHT (normal, m): ivory paper plate armour struck through with black censor bars, a face that is one black bar with two red slits,
  // a crest that is a black bar, a document for a cape, a tower shield stamped CLASSIFIED and a cleaver that is a very heavy black bar.
  // Accent: the red slit eyes and the red seal.
  // ---------------------------------------------------------------------------------------------------------------
  const KN = { plate: '#efe3c8', plateD: '#b7a9c8', black: '#0b0916', red: '#ff3a4a', redD: '#a01028', gold: '#f5c96a', cloth: '#3a2a5a', steel: '#cfd3e8' };
  function redactTicks(g, x, y, w, n, col) {
    for (let i = 0; i < n; i++) tk.inkPath(g, [[x, y + i * 5.5], [x + w * (0.55 + 0.4 * tk.vary('tick', 'w' + i)), y + i * 5.5]], { w: 1.6, color: col || '#8a7aa8', taper: 0.1, pressure: 'flat', wobble: 0.05 });
  }
  function seal(S, cx, cy, r) {
    S.cel(E(cx, cy, r, r, 14), KN.red, { depth: r * 0.4, line: 2.4, hi: true, hiW: 1.4, rim: '#ffb0a0', rimW: 1.2 });
    S.line([[cx - r * 0.5, cy - r * 0.3], [cx + r * 0.5, cy - r * 0.3]], { w: 1.8, color: '#ffe8e0', taper: 0.1, pressure: 'flat' });
    S.line([[cx, cy - r * 0.55], [cx, cy + r * 0.55]], { w: 1.8, color: '#ffe8e0', taper: 0.1, pressure: 'flat' });
    S.line([[cx - r * 0.45, cy + r * 0.5], [cx + r * 0.45, cy + r * 0.5]], { w: 1.8, color: '#ffe8e0', taper: 0.1, pressure: 'flat' });
  }
  define('redaction_knight', {
    size: 'm', lw: 3.1,
    col: { rim: '#ffffff', shT: 0.38 },
    bounds: { w: 190, h: 195, head: { x: -6, y: -170 }, body: { x: -2, y: -96 }, feet: { x: 0, y: 0 } },
    die: { box: [-74, -196, 62, 4], ny: 16, shape: 'strips', from: 'top', kinds: ['bar', 'scrap', 'bar', 'scrap'], cols: ['#0b0916', '#efe3c8', '#0b0916', '#c9bdd8'], wind: [4, 10], size: 9, thin: 0.5 },
    parts: {
      legF: {
        box: [-2, -60, 40, 2], pivot: [16, -56],
        draw(S) {
          S.cel(cap(16, -56, 20, -14, 24, 20), KN.plateD, { depth: 6, hi: false, rim: null, halftone: { d: 5, alpha: 0.3 } });
          S.cel([[2, -16], [30, -16], [38, -8], [32, -2], [4, -2]], '#6a5a8a', { depth: 4, hi: false, rim: null, tension: 0.4 });
          S.fill({ poly: [[6, -36], [30, -36], [30, -28], [6, -28]] }, KN.black, 1);
        },
      },
      legN: {
        box: [-44, -60, 4, 2], pivot: [-12, -56],
        draw(S) {
          S.cel(cap(-12, -56, -16, -14, 26, 22), KN.plate, { depth: 7, hi: true, hiW: 2, rim: S.c.rim, halftone: { d: 5, alpha: 0.28 } });
          S.cel([[-40, -16], [-6, -16], [2, -8], [-4, -2], [-38, -2], [-44, -8]], '#7a68a0', { depth: 4, hi: true, hiW: 1.4, rim: S.c.rim, tension: 0.4 });
          S.fill({ poly: [[-27, -38], [-3, -38], [-3, -29], [-27, -29]] }, KN.black, 1);
          tk.inkPath(S.g, [[-25, -33.5], [-5, -33.5]], { w: 1.4, color: '#ffffff', alpha: 0.35, taper: 0.1, pressure: 'flat' });
        },
      },
      torso: {
        box: [-44, -124, 48, -40], pivot: [0, -60],
        draw(S) {
          // tassets, then the breastplate with its bars and the seal
          [[-34, 0], [-14, 1], [6, 0], [24, 1]].forEach((ts, i) => S.cel(quad(ts[0], -66, 22, 26, 0), i % 2 ? KN.plateD : KN.plate, { depth: 4, line: 2.6, hi: false, rim: i ? null : S.c.rim, tension: 0.2 }));
          S.cel([[-32, -112], [-12, -122], [20, -118], [34, -104], [38, -78], [28, -56], [-14, -54], [-33, -68], [-38, -94]], KN.plate, {
            depth: 16, hi: true, hiW: 3, rim: S.c.rim, halftone: { d: 5, alpha: 0.32 },
            decor(g) {
              redactTicks(g, -32, -114, 64, 2, '#9a8ab8');
              g.fillStyle = KN.black; g.beginPath(); g.moveTo(-44, -100); g.lineTo(6, -103); g.lineTo(6, -91); g.lineTo(-44, -88); g.fill();
              g.beginPath(); g.moveTo(-6, -72); g.lineTo(44, -74); g.lineTo(44, -64); g.lineTo(-6, -62); g.fill();
              tk.inkPath(g, [[-40, -97], [4, -99]], { w: 1.2, color: '#ffffff', alpha: 0.3, taper: 0.1, pressure: 'flat' });
              redactTicks(g, -34, -78, 22, 3, '#9a8ab8');
              tk.inkPath(g, [[-2, -120], [2, -80], [-2, -56]], { w: 1.6, color: '#8a7aa8', alpha: 0.7, taper: 0.3 });
            },
          });
          seal(S, 14, -84, 7);
          S.cel({ poly: [[-36, -60], [38, -60], [36, -52], [-34, -52]] }, '#3a2a5a', { depth: 2, line: 2.4, hi: false, rim: null });
          S.cel(E(2, -56, 5.5, 5, 10), KN.gold, { depth: 2, line: 2, hi: false, rim: null });
        },
      },
      armN: {
        box: [-64, -126, 4, -60], pivot: [-28, -100],
        draw(S) {
          S.cel(cap(-30, -98, -46, -80, 19, 16), KN.plate, { depth: 5, hi: false, rim: S.c.rim, halftone: { d: 5, alpha: 0.28 } });
          S.cel([[-50, -112], [-34, -122], [-14, -112], [-12, -94], [-30, -88], [-48, -96]], KN.plate, { depth: 9, hi: true, hiW: 2.4, rim: S.c.rim, halftone: { d: 5, alpha: 0.3 }, tension: 0.7 });
          S.fill({ poly: [[-48, -104], [-14, -102], [-13, -95], [-47, -97]] }, KN.black, 1);
          S.line([[-44, -114], [-32, -119], [-20, -114]], { w: 1.6, color: '#ffffff', alpha: 0.5, taper: 0.4 });
        },
      },
      armF: {
        box: [-64, -126, 44, -60], pivot: [16, -102],
        draw(S) {
          S.cel(cap(16, -102, -8, -104, 20, 17), '#a8999f', { depth: 5, hi: false, rim: null });
          S.cel(cap(-8, -104, -36, -108, 17, 15), '#8a7aa0', { depth: 5, hi: false, rim: null });
          S.cel(E(-40, -108, 9.5, 9.5, 10), '#6a5a8a', { depth: 3, line: 2.6, hi: false, rim: null });
          S.cel(E(14, -104, 15, 13, 12), KN.plateD, { depth: 5, line: 3, hi: false, rim: null });
        },
      },
      cleaver: {
        box: [-24, -108, 24, 28], pivot: [0, 0],
        draw(S) {
          // grip wrapped in red, a guard, then the black-bar blade with a bright edge and a partial line of "text"
          S.cel(cap(0, 26, 0, 2, 9, 9), KN.redD, { depth: 3, line: 2.6, hi: false, rim: null, tension: 0.5 });
          for (let i = 0; i < 4; i++) S.line([[-4, 22 - i * 5], [4, 19 - i * 5]], { w: 1.4, color: '#ffb0a0', taper: 0.2 });
          S.cel({ poly: [[-15, 4], [15, 4], [13, -3], [-13, -3]] }, KN.gold, { depth: 2, line: 2.4, hi: true, rim: null });
          S.cel({ poly: [[-14, -4], [15, -4], [17, -78], [12, -100], [-11, -102], [-16, -78]] }, KN.black, {
            depth: 5, line: 3, hi: false, rim: '#c9c0ff', rimW: 1.6, shadow: '#1a1430',
            decor(g) {
              g.fillStyle = '#efe3c8'; g.globalAlpha = 0.85;
              for (let i = 0; i < 3; i++) g.fillRect(-9, -22 - i * 20, 14 - i * 3, 3.2);
              g.globalAlpha = 1;
            },
          });
          tk.inkPath(S.g, [[-15, -8], [-14, -50], [-12, -92]], { w: 2.4, color: KN.steel, taper: 0.1, wobble: 0.05, pressure: 'flat' });
        },
      },
      shield: {
        box: [-34, -60, 34, 60], pivot: [0, 0],
        draw(S) {
          S.cel([[-26, -50, 1], [24, -54, 1], [28, 24], [4, 52], [-24, 24]], KN.black, {
            depth: 8, line: 3.2, tension: 0.3, hi: false, rim: '#c9c0ff', rimW: 1.6, shadow: '#1a1430',
            decor(g) {
              g.strokeStyle = KN.plate; g.lineWidth = 2.4; g.beginPath(); g.moveTo(-20, -42); g.lineTo(20, -46); g.lineTo(22, 20); g.lineTo(3, 42); g.lineTo(-19, 20); g.closePath(); g.stroke();
              g.fillStyle = KN.plate; g.globalAlpha = 0.9;
              for (let i = 0; i < 4; i++) g.fillRect(-14, -34 + i * 8, 12 + (i % 2) * 8, 3);
              g.globalAlpha = 1;
            },
          });
          seal(S, 4, 12, 8);
        },
      },
      head: {
        box: [-44, -186, 40, -104], pivot: [-2, -110],
        draw(S) {
          S.cel(E(-3, -132, 31, 29, 16), KN.plate, { depth: 12, hi: true, hiW: 3, rim: S.c.rim, halftone: { d: 5, alpha: 0.3 } });
          S.cel({ poly: [[-34, -138], [30, -138], [29, -118], [-33, -118]] }, KN.black, { depth: 3, line: 3, hi: false, rim: '#c9c0ff', rimW: 1.4, shadow: '#1a1430' });
          S.cel({ poly: [[-34, -156], [-3, -160], [30, -156], [32, -146], [-35, -146]] }, KN.plate, { depth: 4, line: 2.6, hi: true, hiW: 1.4, rim: null, tension: 0.4 });
          tk.inkPath(S.g, [[-30, -146], [-3, -149], [26, -146]], { w: 2.2, color: KN.gold, alpha: 0.9, taper: 0.1 });
          S.cel({ poly: [[-30, -116], [26, -116], [22, -106], [-26, -106]] }, KN.plateD, { depth: 3, line: 2.6, hi: false, rim: null });
        },
      },
      crest: {
        box: [-30, -204, 46, -140], pivot: [-2, -156],
        draw(S) {
          S.cel({ poly: [[-6, -156], [8, -164], [36, -196], [46, -190], [22, -156]] }, KN.black, { depth: 4, line: 3, hi: false, rim: '#c9c0ff', rimW: 1.4, shadow: '#1a1430' });
          S.line([[16, -170], [36, -190]], { w: 3, color: KN.red, taper: 0.1, pressure: 'flat' });
        },
      },
    },
    chains: {
      capeD: {
        spine: [[18, -108], [38, -84], [50, -50], [48, -14]], cuts: [0.34, 0.68], reach: 60, overlap: 4,
        draw(S) {
          S.cel([[8, -112, 1], [30, -110, 1], [58, -66], [72, -12, 1], [36, -4, 1], [24, -30], [12, -70]], '#5a4a7a', {
            depth: 12, line: 3, tension: 0.4, hi: false, rim: null, halftone: { d: 5, alpha: 0.3 },
            decor(g) {
              for (let i = 0; i < 7; i++) { g.fillStyle = i % 2 ? KN.black : 'rgba(239,227,200,0.8)'; g.beginPath(); g.moveTo(0, -112 + i * 16); g.lineTo(70, -112 + i * 16 + 4); g.lineTo(70, -112 + i * 16 + 14); g.lineTo(0, -112 + i * 16 + 10); g.fill(); }
            },
          });
          S.fill(zig(14, 72, -8, 9, 6, 3, 21), '#5a4a7a', 1, 0);
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die, atk = E0.pose === 'attack', p = atk ? E0.p : 0;
      const br = sin(TAU * t / 2.8) * m;
      const hot = clamp(tele + buff + (atk ? E0.strike : 0), 0, 1);
      const dx = -E0.strike * 26 * (atk ? 1 : 0) + hurt * 16 + E0.shake * 1.2 + 4 * tele;
      const dy = 2 * tele;
      const rot = 0.02 * br + 0.06 * tele - 0.09 * E0.strike * (atk ? 1 : 0) + 0.12 * hurt;
      // the weapon arm: raise on the wind-up, chop on the strike
      let A = 0.05 * br, W = -0.7 + 0.03 * br;
      if (atk) {
        if (p < 0.3) { const k = sm(p / 0.3); A = 1.9 * k; W = lerp(-0.7, 0.5, k); } else if (p < 0.5) { const k = ease.inCubic((p - 0.3) / 0.2); A = lerp(1.9, -0.25, k); W = lerp(0.5, -1.3, k); } else { const k = sm((p - 0.5) / 0.5); A = lerp(-0.25, 0.05, k); W = lerp(-1.3, -0.7, k); }
      } else if (E0.pose === 'telegraph') { A = 1.9 * tele + 0.03 * E0.shake; W = lerp(-0.7, 0.5, tele); } else if (E0.pose === 'block') { A = -0.5 * guard; W = lerp(-0.7, -1.6, guard); } else if (E0.pose === 'hurt') { A = 0.4 * hurt; W = -0.7 + 0.5 * hurt; } else if (E0.pose === 'buff') { A = 0.9 * E0.buff; W = -0.7 + 0.6 * E0.buff; } else if (die > 0) { A = 0.6 * die; }
      putChain(ctx, st, 'capeD', [0.08 * sin(t * 2.2) * m + 0.1 * tele - 0.2 * E0.strike + 0.1 * hurt, 0.16 * sin(t * 2.2 - 0.9) * m, 0.22 * sin(t * 2.2 - 1.8) * m], { x: dx * 0.6, y: dy });
      ctx.save();
      xform(ctx, 0, -60, dx, dy, rot, 1, 1);
      put(ctx, st, 'legF', { r: 0.03 * br - 0.1 * tele + 0.05 * E0.strike * (atk ? 1 : 0) });
      // the far arm carries the weapon
      put(ctx, st, 'armF', {
        r: A,
        kids(c) { put(c, st, 'cleaver', { x: -40, y: -110, r: W - A - rot }); if (hot > 0.3 || tele > 0.2) tk.glow(c, -40, -108, 26 + 14 * tele, KN.red, 0.4 * clamp(hot + tele, 0, 1)); },
      });
      put(ctx, st, 'torso', { r: 0.01 * br, sy: 1 + 0.012 * br - 0.02 * tele });
      put(ctx, st, 'legN', { r: -0.03 * br + 0.08 * tele - 0.08 * E0.strike * (atk ? 1 : 0) });
      // the shield on the near arm: it comes up in front on a block
      put(ctx, st, 'shield', { x: -54 - 10 * guard - 4 * tele, y: -62 - 22 * guard, r: -0.1 - 0.16 * guard + 0.08 * hurt + 0.02 * br, sx: 0.82 + 0.06 * buff, sy: 0.82 + 0.06 * buff });
      put(ctx, st, 'armN', { r: 0.04 * br - 0.3 * guard + 0.1 * hurt });
      // black bars sliding across the body on a Blackout
      const bl = clamp(guard + buff * 0.8, 0, 1);
      if (bl > 0.02) {
        ctx.fillStyle = KN.black;
        [[-112, 8], [-92, 6], [-72, 8], [-56, 6]].forEach((b, i) => { const w = 96 * ease.outQuad(clamp(bl * 1.4 - i * 0.12, 0, 1)); ctx.fillRect(38 - w, b[0], w, b[1] + 2); });
      }
      put(ctx, st, 'crest', { r: 0.05 * sin(t * 2.6) * m - 0.1 * tele + 0.14 * hurt });
      put(ctx, st, 'head', {
        r: 0.02 * br - 0.04 * E0.strike * (atk ? 1 : 0) + 0.1 * hurt - 0.03 * tele,
        kids(c) {
          // two red slits in the bar: they glitch sideways now and then, thicken when angry, blink shut
          const ob = blink(t, 'knight', 4.2) * (1 - 0.4 * hurt), gl = flick(t, 8, 3) > 0.9 ? 3 : 0, th = 3.2 + 2.6 * hot;
          c.save(); c.globalCompositeOperation = 'lighter';
          tk.glow(c, -8, -128, 30 + 16 * hot, KN.red, 0.4 + 0.4 * hot);
          c.restore();
          c.fillStyle = hot > 0.4 ? '#ffe0d0' : '#ff5a5a';
          [-1, 1].forEach((sd) => { const w = 15; c.fillRect(-3 + sd * 14 - w / 2 + gl * sd, -128 - th * ob / 2, w, Math.max(0.8, th * ob)); });
          c.fillStyle = KN.red; c.globalAlpha = 0.6;
          [-1, 1].forEach((sd) => { const w = 19; c.fillRect(-3 + sd * 14 - w / 2 + gl * sd, -128 - th * ob * 0.9, w, Math.max(1.4, th * ob * 1.8)); });
          c.globalAlpha = 1;
        },
      });
      ctx.restore();
      if (atk && p > 0.42 && p < 0.72) {
        const u = sm((p - 0.42) / 0.12) * (1 - sm((p - 0.62) / 0.1));
        swoosh(ctx, -22 + dx, -108, 112, 36, -1.1, -3.7, { alpha: u * 0.9, fill: '#ffd6d6', edge: '#ff3a4a' });
      }
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // VOID SCRIBE (normal, m): a hooded, floating clerk of the Blank in a violet-black robe, a blank paper mask for a face and a brush loaded with ink the
  // colour of nothing: the strokes it makes are WHITE. A jar of the stuff glows at its belt and an unwritten scroll drifts beside it. It writes in the air
  // (the white trail is live) and erases everything else. Accent: the glowing white-lilac ink and two pinprick eyes.
  // ---------------------------------------------------------------------------------------------------------------
  const VS = { robe: '#2b2050', robeL: '#4a3a86', trim: '#f3e6c8', ink: '#ffffff', inkG: '#cfc0ff', cyan: '#bff0ff', skin: '#f6ecd4', shaft: '#3a2a1a', gold: '#f5c96a' };
  // where the brush tip of the scribe is for a given time and pose channels: hand position and the brush's world angle
  function scribeBrush(t, E0, m) {
    const k = m;
    let hx = -78 + 8 * sin(2.1 * t) * k, hy = -96 + 6 * sin(3.2 * t + 1) * k, W = -0.75 + 0.22 * sin(2.1 * t + 0.6) * k;
    if (E0.pose === 'attack') {
      const p = E0.p;
      const a = p < 0.3 ? sm(p / 0.3) : 1, b = p < 0.3 ? 0 : p < 0.5 ? ease.inCubic((p - 0.3) / 0.2) : 1 - sm((p - 0.5) / 0.5);
      hx += 12 * a - 46 * b; hy += -26 * a + 34 * b; W = lerp(W, -0.1, a) + b * (-2.0);
    } else if (E0.pose === 'telegraph') { hx += 16 * E0.tele; hy += -38 * E0.tele; W = lerp(W, -0.2, E0.tele) + 0.03 * E0.shake; }
    else if (E0.pose === 'buff') { hx += -30 * E0.buff * cos(E0.buffP * TAU); hy += -10 * E0.buff; W += -0.6 * sin(E0.buffP * TAU); }
    else if (E0.pose === 'hurt') { hx += 20 * E0.hurt; hy += -8 * E0.hurt; W += 0.7 * E0.hurt; }
    else if (E0.pose === 'block') { hx += 16 * E0.guard; hy += -20 * E0.guard; W += 0.5 * E0.guard; }
    return { hx, hy, W };
  }
  define('void_scribe', {
    size: 'm', lw: 3.1,
    col: { rim: '#c9c0ff', shT: 0.42 },
    bounds: { w: 200, h: 200, head: { x: -8, y: -172 }, body: { x: -2, y: -96 }, feet: { x: 0, y: 0 } },
    die: { box: [-150, -196, 78, -14], nx: 10, ny: 12, from: 'bottom', order: 0.6, shape: 'ink', kinds: ['ink', 'letter', 'scrap', 'ink'], cols: ['#ffffff', '#cfc0ff', '#f3e6c8', '#2b2050'], wind: [-10, -22], size: 8 },
    parts: {
      tip: {
        box: [6, -206, 74, -150], pivot: [16, -158],
        draw(S) {
          S.cel([[14, -164, 1], [30, -190], [58, -204, 1], [56, -190], [44, -172], [30, -158, 1]], VS.robe, { depth: 7, line: 3, tension: 0.5, hi: false, rim: S.c.rim, halftone: { d: 5, alpha: 0.32 } });
          S.cel(E(58, -202, 4.4, 4.4, 8), VS.ink, { depth: 1.5, line: 2, hi: false, rim: null, shadow: VS.inkG });
        },
      },
      robe: {
        box: [-60, -130, 66, -14], pivot: [0, -100],
        draw(S) {
          const pts = [[-36, -108], [-18, -122], [16, -122], [34, -108], [44, -76], [52, -44, 1]].concat(zig(52, -50, -44, 20, 8, 7, 5)).concat([[-46, -76]]);
          S.cel(pts, VS.robe, {
            depth: 18, tension: 0.5, hi: true, hiW: 2.4, rim: S.c.rim, halftone: { d: 5, alpha: 0.34 },
            decor(g) {
              g.fillStyle = VS.robeL; g.beginPath(); g.moveTo(-50, -84); g.lineTo(52, -88); g.lineTo(52, -72); g.lineTo(-50, -68); g.fill();
              tk.inkPath(g, [[-50, -84], [0, -87], [52, -88]], { w: 1.6, color: pal.ink, taper: 0.05, pressure: 'flat' });
              tk.inkPath(g, [[-50, -68], [0, -70], [52, -72]], { w: 1.6, color: pal.ink, taper: 0.05, pressure: 'flat' });
              for (let i = 0; i < 5; i++) tk.inkPath(g, [[-34 + i * 17, -62], [-32 + i * 17, -32]], { w: 2, color: '#1a1238', alpha: 0.7, taper: 0.3, wobble: 0.08 });
              for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(-26 + i * 18, -54 + (i % 2) * 8, 8, 2.4); }
            },
          });
          S.cel([[-20, -120], [0, -90], [20, -120], [12, -121], [0, -104], [-12, -121]], VS.trim, { depth: 3, line: 2.6, hi: false, rim: null, tension: 0.3 });
        },
      },
      jar: {
        box: [-12, -20, 12, 20], pivot: [0, -16],
        draw(S) {
          S.line([[0, -16], [0, -6]], { w: 1.8, color: pal.ink, taper: 0.05, pressure: 'flat', wobble: 0 });
          S.cel({ poly: [[-4, -8], [4, -8], [4, -3], [-4, -3]] }, '#7a5a3a', { depth: 1.5, line: 2, hi: false, rim: null });
          S.cel([[-5, -3, 1], [-11, 6], [-8, 16], [8, 16], [11, 6], [5, -3, 1]], '#e8f6ff', {
            depth: 5, line: 2.6, hi: false, rim: '#ffffff', tension: 0.5,
            decor(g) { const rg = g.createRadialGradient(0, 8, 1, 0, 8, 12); rg.addColorStop(0, '#ffffff'); rg.addColorStop(1, 'rgba(160,140,255,0.9)'); g.fillStyle = rg; g.fillRect(-12, -4, 24, 22); },
          });
        },
      },
      hood: {
        box: [-52, -176, 48, -92], pivot: [-6, -108],
        draw(S) {
          S.cel([[-42, -124], [-38, -150], [-16, -168], [12, -166], [32, -148], [36, -124], [30, -102], [0, -96], [-30, -102]], VS.robe, {
            depth: 14, tension: 0.9, hi: true, hiW: 2.6, rim: S.c.rim, halftone: { d: 5, alpha: 0.34 },
          });
          // the dark opening, then the blank paper mask with its two pinprick sockets
          S.cel(E(-14, -124, 25, 29, 16), '#0d0a1e', { depth: 4, line: 3, hi: false, rim: null, shadow: false });
          S.cel(E(-14, -124, 20, 24, 16), VS.skin, { depth: 8, line: 2.8, hi: true, hiW: 2, rim: '#ffffff', halftone: { d: 5, alpha: 0.2, color: '#8a7aa8' } });
          S.line([[-22, -108], [-14, -105], [-6, -108]], { w: 1.6, color: '#7a6a9a', taper: 0.4 });
          S.line([[-34, -140], [-26, -146]], { w: 1.2, color: '#b8a8c8', alpha: 0.8, taper: 0.4 });
        },
      },
      sleeve: {
        box: [-100, -136, -8, -60], pivot: [-26, -104],
        draw(S) {
          S.cel([[-20, -118], [-44, -124], [-72, -114], [-84, -96], [-74, -76], [-48, -80], [-22, -92]], VS.robe, { depth: 12, tension: 0.8, hi: true, hiW: 2, rim: S.c.rim, halftone: { d: 5, alpha: 0.34 } });
          S.cel([[-76, -114], [-86, -98], [-76, -78], [-68, -80], [-76, -98], [-68, -112]], VS.trim, { depth: 3, line: 2.6, hi: false, rim: null, tension: 0.4 });
          S.line([[-40, -116], [-46, -96], [-40, -84]], { w: 1.6, color: '#1a1238', alpha: 0.7, taper: 0.3 });
        },
      },
      hand: {
        box: [-22, -18, 22, 22], pivot: [0, 0],
        draw(S) {
          S.cel(E(0, 0, 9, 8, 10), VS.skin, { depth: 3, line: 2.6, hi: false, rim: '#ffffff' });
          [[-5, -4], [1, -6], [6, -3]].forEach((f) => S.line([[f[0], f[1]], [f[0] - 2, f[1] - 4]], { w: 2.2, color: VS.skin, taper: 0.3 }));
        },
      },
      brush: {
        box: [-16, -108, 16, 34], pivot: [0, 0],
        draw(S) {
          S.cel(cap(0, 30, 0, -50, 6.4, 5), VS.shaft, { depth: 2, line: 2.6, hi: true, hiW: 1.2, rim: S.c.rim, tension: 0.5 });
          S.cel({ poly: [[-4, -46], [4, -46], [4.4, -54], [-4.4, -54]] }, VS.gold, { depth: 1.5, line: 2, hi: false, rim: null });
          S.cel([[-6, -54, 1], [-8, -70], [-3, -92], [0, -104, 1], [4, -90], [8, -70], [6, -54, 1]], VS.ink, { depth: 5, line: 2.6, tension: 0.6, hi: false, rim: '#ffffff', shadow: VS.inkG, halftone: { d: 4, alpha: 0.25, color: '#7a6ad0' } });
        },
      },
      scroll: {
        box: [-34, -46, 34, 46], pivot: [0, 0],
        draw(S) {
          S.cel({ poly: [[-24, -34], [26, -36], [24, 34], [-22, 36]] }, VS.skin, { depth: 6, line: 2.8, hi: true, hiW: 1.4, rim: '#ffffff', halftone: { d: 5, alpha: 0.18, color: '#8a7aa8' } });
          S.cel(cap(-28, -37, 30, -38, 9, 9), '#e3d2ae', { depth: 3, line: 2.6, hi: false, rim: null });
          S.cel(cap(-26, 37, 28, 36, 9, 9), '#e3d2ae', { depth: 3, line: 2.6, hi: false, rim: null });
          for (let i = 0; i < 6; i++) tk.inkPath(S.g, [[-16, -22 + i * 8.6], [-16 + 24 * (0.5 + 0.5 * tk.vary('scr', 'w' + i)) , -22 + i * 8.6 + 0.5]], { w: 1.8, color: '#4a3a66', alpha: 0.85, taper: 0.1, pressure: 'flat', wobble: 0.1 });
          // white strokes wiping some of the lines out
          tk.inkPath(S.g, [[-20, -8], [-2, -14], [22, -4]], { w: 6, color: VS.ink, taper: 0.3, wobble: 0.08 });
          tk.inkPath(S.g, [[-20, 16], [4, 10], [20, 18]], { w: 5, color: VS.ink, taper: 0.3, wobble: 0.08 });
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die, atk = E0.pose === 'attack';
      const hot = clamp(tele + buff + (atk ? E0.strike : 0), 0, 1);
      const bob = sin(t * 1.9) * 5 * m, sway = 0.03 * sin(t * 1.3) * m;
      const dx = -E0.strike * 14 * (atk ? 1 : 0) + hurt * 20 + 5 * tele, dy = bob - hurt * 6 + 6 - 8 * die;
      const rot = sway + 0.08 * tele + 0.15 * hurt - 0.06 * (atk ? E0.strike : 0);
      const br = scribeBrush(t, E0, m), br0 = scribeBrush(t, { pose: 'idle' }, m);
      // the air-writing trail: the same brush path a moment ago, shifted to where the brush is now, fading and thinning
      const tipOf = (b) => [b.hx + sin(b.W) * 96, b.hy - cos(b.W) * 96];
      const tip = tipOf(br);
      const trailPts = [];
      for (let k = 0; k <= 10; k++) { const b2 = scribeBrush(t - k * 0.045, { pose: 'idle' }, m), tp = tipOf(b2), t0 = tipOf(br0); trailPts.push([tip[0] + (tp[0] - t0[0]) + (E0.pose === 'attack' ? k * 5 * E0.strike : 0), tip[1] + (tp[1] - t0[1])]); }
      ctx.save();
      xform(ctx, 0, -100, dx, dy, rot, 1 - 0.05 * die, 1 - 0.1 * die);
      // the scroll floats to the side
      put(ctx, st, 'scroll', { x: -96 + 4 * sin(t * 1.4) * m - 8 * guard - 12 * (atk ? E0.strike : 0), y: -66 + 5 * sin(t * 1.9 + 1) * m + 0 * guard, r: 0.08 * sin(t * 1.6) * m - 0.3 * guard + 0.6 * buff * sin(t * 12) * 0.2 - 0.1 * hurt });
      put(ctx, st, 'tip', { r: -0.08 * sin(t * 2.4) * m + 0.2 * hurt - 0.1 * tele });
      put(ctx, st, 'robe', { r: 0.02 * sin(t * 1.7) * m, sy: 1 + 0.02 * sin(t * 2.4) * m });
      put(ctx, st, 'jar', { x: 18, y: -80, r: 0.18 * sin(t * 2.1) * m - 0.3 * hurt, kids(c) { tk.glow(c, 0, 8, 22 + 10 * hot, VS.inkG, 0.45 + 0.2 * sin(t * 3)); } });
      put(ctx, st, 'hood', {
        r: 0.02 * sin(t * 1.5 + 1) * m + 0.1 * hurt - 0.05 * tele,
        kids(c) {
          const ob = blink(t, 'scribe', 3.9) * (1 - 0.5 * hurt);
          eyeLive(c, -22, -128, 3.4 + 1.2 * hot, 5 + 1.6 * hot, { open: ob, iris: [VS.cyan, '#ffffff'], sclera: '#eafcff', pupil: 'none', glow: VS.cyan, glowK: 0.85 + 0.15 * hot, glowR: 3.4, lw: 1.5, catch: false });
          eyeLive(c, -6, -128, 3 + 1 * hot, 4.6 + 1.4 * hot, { open: ob, iris: [VS.cyan, '#ffffff'], sclera: '#eafcff', pupil: 'none', glow: VS.cyan, glowK: 0.85 + 0.15 * hot, glowR: 3.4, lw: 1.5, catch: false });
        },
      });
      // the arm: sleeve, hand and the brush riding on the hand
      const sleeveR = 1.05 * guard + 0.1 * sin(t * 2.1 + 1) * m + (atk ? -0.35 * E0.strike : 0) + 0.3 * tele + 0.3 * hurt;
      put(ctx, st, 'sleeve', { r: sleeveR * 0.5 - 0.05 * sin(t * 2.1) * m });
      // the hand and brush are placed directly in body space: the sleeve cuff is only a visual anchor
      if (trailPts.length > 2 && (E0.pose !== 'die')) {
        for (let k = 0; k < trailPts.length - 1; k++) {
          const a = trailPts[k], b = trailPts[k + 1], f = 1 - k / trailPts.length;
          ctx.save(); ctx.globalAlpha = cA(f * f * (0.55 + 0.4 * hot));
          tk.inkPath(ctx, [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], b], { w: 5 * f + 1, color: VS.ink, taper: 0.3, wobble: 0.05, pressure: 'flat', minW: 0.6 });
          ctx.restore();
        }
      }
      put(ctx, st, 'brush', { x: br.hx, y: br.hy, r: br.W });
      put(ctx, st, 'hand', { x: br.hx, y: br.hy, r: br.W * 0.6 });
      // the blank ink at the bristles glows, and drips
      tk.glow(ctx, tip[0], tip[1], 16 + 20 * hot, VS.inkG, 0.6 + 0.3 * hot);
      if (tele > 0.05 || (atk && E0.p < 0.32)) { const r = 4 + 16 * (tele || sm(E0.p / 0.3)); tk.glow(ctx, tip[0], tip[1] - 10, r * 2.2, '#ffffff', 0.6); ctx.beginPath(); ctx.arc(tip[0], tip[1] - 10, r, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = VS.inkG; ctx.stroke(); }
      for (let i = 0; i < 3; i++) { const per = 1.3 + 0.3 * i, u = ((t / per + i * 0.33) % 1 + 1) % 1; ctx.save(); ctx.globalAlpha = cA(sin(u * PI) * 1.2) * (1 - die); ctx.beginPath(); ctx.ellipse(tip[0] + 2, tip[1] + 6 + u * 46, 2.2, 3.2 + u * 2, 0, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.restore(); }
      ctx.restore();
      // a brushed swipe across the front on an attack, splashes on the hit, a wide erasing stroke on a buff
      if (atk && E0.p > 0.42 && E0.p < 0.8) {
        const u = clamp((E0.p - 0.42) / 0.38, 0, 1);
        swoosh(ctx, -30 + dx, -110, 112, 30, -1.0, -3.4, { alpha: (1 - u) * 0.9, fill: '#ffffff', edge: VS.inkG });
        for (let i = 0; i < 8; i++) { const a = 2.5 + hv('vsp', 'a' + i) * 1.4, d = 30 + 80 * u * (0.5 + hv('vsp', 'd' + i)); ctx.save(); ctx.globalAlpha = cA(1 - u); ctx.beginPath(); ctx.arc(-70 + cos(a) * d, -100 + sin(a) * d * 0.6 + u * 16, 2 + 4 * hv('vsp', 's' + i), 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.restore(); }
      }
      if (buff > 0.05) {
        const u = E0.buffP;
        ctx.save(); ctx.globalAlpha = cA(buff * 1.3);
        tk.inkPath(ctx, [[60 - 230 * u * 0 + dx, -120], [-40 + dx, -112 + 6 * sin(u * 9)], [-200 + dx, -124]], { w: 22 * buff + 2, color: '#ffffff', taper: 0.35, wobble: 0.1, pressure: 'mid' });
        tk.glow(ctx, -80 + dx, -118, 90, VS.inkG, 0.4 * buff);
        ctx.restore();
      }
      if (hurt > 0.2) for (let i = 0; i < 5; i++) { const fj = fling('vshurt' + i, 'd', E0.p, { spread: 110, up: 50, g: 200 }); ctx.save(); ctx.globalAlpha = fj.a; ctx.beginPath(); ctx.arc(-10 + fj.x, -110 + fj.y, 2.6, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.restore(); }
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // BLANK SOLDIER (normal, m): a drill sergeant's dream cut from one sheet and folded: a rectangle body with a crease, accordion arms and legs, an origami
  // helmet, a face that is a blank square with two pinprick eyes, a bamboo spear with a paper head and a flag. Braver in a crowd. On death it unfolds flat
  // and blows away as scraps. Accent: the cyan pinprick eyes and the glowing spear edge.
  // ---------------------------------------------------------------------------------------------------------------
  const BS = { paper: '#fbf3e0', paper2: '#efe2c4', crease: '#a99bc8', red: '#e8383d', black: '#0b0916', bamboo: '#c9a35f', cyan: '#7ff4ff' };
  function pleats(S, x0, y0, x1, y1, n, w) {
    const dx = x1 - x0, dy = y1 - y0;
    for (let i = 1; i < n; i++) { const u = i / n; S.line([[x0 + dx * u - w / 2, y0 + dy * u + (i % 2 ? 1 : -1)], [x0 + dx * u + w / 2, y0 + dy * u + (i % 2 ? -1 : 1)]], { w: 1.5, color: BS.crease, alpha: 0.9, taper: 0.3, wobble: 0.05 }); }
  }
  define('blank_soldier', {
    size: 'm', lw: 3,
    col: { rim: '#ffffff', shT: 0.38 },
    bounds: { w: 180, h: 214, head: { x: -6, y: -170 }, body: { x: -2, y: -98 }, feet: { x: 0, y: 0 } },
    die: { box: [-80, -186, 70, 4], nx: 10, ny: 14, from: 'top', order: 0.5, shape: 'paper', kinds: ['scrap', 'scrap', 'scrap', 'ink'], cols: ['#fbf3e0', '#efe2c4', '#ffffff', '#7ff4ff'], wind: [-20, -30], size: 9, thin: 0.3, life: 0.6 },
    parts: {
      legF: {
        box: [-2, -60, 40, 2], pivot: [14, -54],
        draw(S) {
          S.cel(quad(6, -54, 16, 44, 0), BS.paper2, { depth: 5, hi: false, rim: null, tension: 0.2 });
          pleats(S, 14, -50, 14, -8, 5, 16);
          S.cel({ poly: [[4, -10], [28, -14], [32, -1], [2, -1]] }, BS.paper2, { depth: 3, hi: false, rim: null });
        },
      },
      legN: {
        box: [-44, -60, 2, 2], pivot: [-12, -54],
        draw(S) {
          S.cel(quad(-20, -54, 17, 46, 0), BS.paper, { depth: 6, hi: true, hiW: 1.6, rim: S.c.rim, tension: 0.2, halftone: { d: 5, alpha: 0.2, color: '#a99bc8' } });
          pleats(S, -12, -50, -12, -8, 5, 17);
          S.cel({ poly: [[-32, -10], [-6, -14], [-2, -1], [-36, -1]] }, BS.paper, { depth: 3, hi: false, rim: S.c.rim });
          S.line([[-30, -6], [-8, -8]], { w: 1.3, color: BS.crease, taper: 0.3 });
        },
      },
      torso: {
        box: [-38, -128, 36, -44], pivot: [-2, -60],
        draw(S) {
          S.cel({ poly: [[-30, -122], [26, -124], [24, -54], [-28, -52]] }, BS.paper, {
            depth: 12, hi: true, hiW: 2.2, rim: S.c.rim, halftone: { d: 5, alpha: 0.24, color: '#a99bc8' },
            decor(g) {
              g.fillStyle = 'rgba(169,155,200,0.42)'; g.beginPath(); g.moveTo(-32, -126); g.lineTo(-2, -88); g.lineTo(-30, -54); g.fill();
              tk.inkPath(g, [[-32, -126], [-2, -88], [-30, -54]], { w: 1.6, color: BS.crease, taper: 0.1, pressure: 'flat' });
              tk.inkPath(g, [[26, -124], [2, -86], [24, -54]], { w: 1.4, color: BS.crease, alpha: 0.7, taper: 0.1, pressure: 'flat' });
              for (let i = 0; i < 3; i++) tk.inkPath(g, [[6, -110 + i * 6], [20, -110 + i * 6]], { w: 1.3, color: '#8a7aa8', alpha: 0.7, taper: 0.1, pressure: 'flat' });
            },
          });
          S.cel({ poly: [[-30, -64], [26, -66], [26, -56], [-30, -54]] }, BS.black, { depth: 1, line: 2.4, hi: false, rim: null, shadow: false });
          S.cel(E(10, -92, 7, 7, 12), BS.red, { depth: 2.5, line: 2, hi: true, hiW: 1.2, rim: null });
        },
      },
      head: {
        box: [-46, -190, 40, -108], pivot: [-2, -114],
        draw(S) {
          S.cel({ poly: [[-26, -146], [22, -148], [20, -114], [-24, -112]] }, BS.paper, { depth: 8, hi: true, hiW: 1.6, rim: S.c.rim, tension: 0.2, halftone: { d: 5, alpha: 0.2, color: '#a99bc8' } });
          S.cel({ poly: [[-40, -140, 1], [-12, -184, 1], [4, -188, 1], [34, -140, 1], [30, -132, 1], [-34, -132, 1]] }, BS.paper2, {
            depth: 9, hi: false, rim: S.c.rim, tension: 0.15, halftone: { d: 5, alpha: 0.26, color: '#a99bc8' },
            decor(g) { g.fillStyle = 'rgba(169,155,200,0.5)'; g.beginPath(); g.moveTo(-4, -190); g.lineTo(38, -132); g.lineTo(-4, -132); g.fill(); tk.inkPath(g, [[-4, -188], [-4, -132]], { w: 1.6, color: BS.crease, taper: 0.1, pressure: 'flat' }); },
          });
          S.cel(E(-4, -160, 7, 7, 12), BS.red, { depth: 2, line: 2, hi: false, rim: null });
          S.line([[-30, -120], [16, -122]], { w: 1.3, color: BS.crease, alpha: 0.7, taper: 0.2 });
        },
      },
      armN: {
        box: [-64, -124, -8, -70], pivot: [-24, -110],
        draw(S) {
          S.cel(cap(-24, -110, -38, -92, 14, 12), BS.paper, { depth: 4, hi: false, rim: S.c.rim });
          pleats(S, -24, -110, -38, -92, 3, 13);
          S.cel(cap(-38, -92, -50, -82, 12, 11), BS.paper2, { depth: 3, hi: false, rim: null });
          S.cel(E(-52, -81, 8, 7.5, 10), BS.paper, { depth: 3, line: 2.6, hi: false, rim: S.c.rim });
        },
      },
      shield: {
        box: [-30, -42, 30, 42], pivot: [0, 0],
        draw(S) {
          S.cel({ poly: [[-22, -34], [22, -38], [26, 26], [0, 38], [-24, 26]] }, BS.paper2, {
            depth: 8, hi: true, hiW: 1.6, rim: S.c.rim, tension: 0.2, halftone: { d: 5, alpha: 0.24, color: '#a99bc8' },
            decor(g) { g.fillStyle = BS.black; g.fillRect(-26, -12, 54, 12); tk.inkPath(g, [[-24, -34], [0, 34]], { w: 1.4, color: BS.crease, alpha: 0.6, taper: 0.2 }); },
          });
          S.cel(E(0, -20, 6, 6, 10), BS.red, { depth: 2, line: 2, hi: false, rim: null });
        },
      },
      spear: {
        box: [-18, -168, 22, 40], pivot: [0, 0],
        draw(S) {
          S.cel(cap(0, 36, 0, -118, 5.6, 4.6), BS.bamboo, { depth: 2, line: 2.6, hi: true, hiW: 1, rim: null, tension: 0.4 });
          [[-20], [-56], [-92]].forEach((n) => S.line([[-3, n[0]], [3, n[0] - 1]], { w: 1.6, color: '#7a5a28', taper: 0.2 }));
          S.cel([[-9, -116, 1], [0, -164, 1], [9, -116, 1], [0, -122, 1]], BS.paper, {
            depth: 4, line: 2.6, tension: 0, hi: false, rim: '#ffffff',
            decor(g) { g.fillStyle = 'rgba(169,155,200,0.55)'; g.beginPath(); g.moveTo(0, -164); g.lineTo(9, -116); g.lineTo(0, -122); g.fill(); },
          });
        },
      },
    },
    chains: {
      flag: {
        spine: [[3, -108], [16, -104], [28, -92], [38, -74]], cuts: [0.34, 0.68], reach: 30, overlap: 3,
        draw(S) {
          S.cel({ poly: [[2, -114], [14, -112], [40, -70], [26, -66], [4, -100]] }, BS.paper, {
            depth: 4, line: 2.6, tension: 0.2, hi: false, rim: S.c.rim,
            decor(g) { g.fillStyle = BS.red; g.beginPath(); g.moveTo(8, -112); g.lineTo(18, -108); g.lineTo(34, -76); g.lineTo(26, -74); g.fill(); g.fillStyle = BS.black; g.beginPath(); g.moveTo(14, -96); g.lineTo(28, -94); g.lineTo(30, -86); g.lineTo(18, -88); g.fill(); },
          });
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die, atk = E0.pose === 'attack', p = atk ? E0.p : 0;
      const step = sin(TAU * t / 1.2) * m, br = sin(TAU * t / 2.6) * m;
      // paper flexes: a slow skew in the whole body, sharper on a hit
      const skew = 0.035 * sin(t * 1.9) * m + 0.16 * hurt - 0.1 * tele - 0.08 * (atk ? E0.strike : 0);
      const hop = Math.max(0, step) * 2.2 * (1 - tele) * (1 - die);
      const dx = -E0.strike * 34 * (atk ? 1 : 0) + hurt * 16 + 12 * tele * 0.5 + E0.shake * 1.1, dy = -hop + 3 * guard;
      // the spear: held at the ready, drawn back on a wind-up, driven straight out on a strike
      let W = -0.2 + 0.03 * br, hx = -52, hy = -82;
      if (atk) {
        if (p < 0.3) { const k = sm(p / 0.3); W = lerp(-0.2, -1.05, k); hx += 22 * k; hy += 6 * k; } else if (p < 0.5) { const k = ease.inCubic((p - 0.3) / 0.2); W = lerp(-1.05, -1.5, k); hx += lerp(22, -26, k); hy += lerp(6, -4, k); } else { const k = sm((p - 0.5) / 0.5); W = lerp(-1.5, -0.2, k); hx += lerp(-26, 0, k); hy += lerp(-4, 0, k); }
      } else if (E0.pose === 'telegraph') { W = lerp(-0.2, -1.1, tele) + 0.03 * E0.shake; hx += 24 * tele; hy += 8 * tele; } else if (E0.pose === 'hurt') { W += 0.5 * hurt; hy += 8 * hurt; } else if (E0.pose === 'buff') { W += -0.5 * buff; hy += -14 * buff; } else if (E0.pose === 'block') { W = lerp(-0.2, 0.15, guard); hx += 14 * guard; }
      ctx.save();
      if (die > 0) { ctx.translate(0, 0); ctx.transform(1 + 0.5 * die, 0, 0, 1 - 0.55 * die, -0.25 * 60 * die, 0); }
      ctx.save();
      xform(ctx, 0, -50, dx, dy, 0, 1, 1);
      ctx.transform(1, 0, skew, 1 - 0.01 * br, -skew * 50, 0);
      put(ctx, st, 'legF', { r: 0.1 * step * (1 - tele) + 0.03 * hurt });
      put(ctx, st, 'torso', { r: 0.012 * br, sy: 1 + 0.012 * br });
      put(ctx, st, 'legN', { r: -0.1 * step * (1 - tele) - 0.05 * E0.strike * (atk ? 1 : 0) });
      // shield: it slides into the guard
      if (guard > 0.02 || buff > 0.02) put(ctx, st, 'shield', { x: -48 - 4 * guard, y: -76, r: -0.06, sx: clamp(guard * 1.3 + buff, 0, 1), sy: 1, a: clamp(guard * 3 + buff * 2, 0, 1) });
      // the spear rides on the near hand: bamboo, paper head with a glowing edge, and the flag on a chain in the spear's own frame
      put(ctx, st, 'spear', {
        x: hx, y: hy, r: W,
        kids(c) {
          const fb = [0.22 * sin(t * 5.5) * m + 0.12 * (atk ? E0.strike : 0) - 0.2 * hurt, 0.34 * sin(t * 5.5 - 1) * m, 0.4 * sin(t * 5.5 - 2) * m];
          putChain(c, st, 'flag', fb, { r: 0.1 * tele });
          tk.glow(c, 0, -142, 18 + 12 * (tele + E0.strike * (atk ? 1 : 0)), BS.cyan, 0.35 + 0.4 * clamp(tele + buff + (atk ? E0.strike : 0), 0, 1));
        },
      });
      put(ctx, st, 'armN', { r: 0.05 * br + 0.5 * (atk ? E0.wind : 0) * -1 + 0.15 * tele - 0.1 * E0.strike * (atk ? 1 : 0), x: 0, y: 0 });
      put(ctx, st, 'head', {
        r: 0.02 * br - 0.05 * E0.strike * (atk ? 1 : 0) + 0.12 * hurt, x: 0, y: 0,
        kids(c) {
          const ob = blink(t, 'soldier', 3.4) * (1 - 0.4 * hurt);
          [[-16, -130], [4, -130]].forEach((e) => eyeLive(c, e[0], e[1], 2.8, 3.4, { open: ob, iris: [BS.cyan, '#ffffff'], sclera: '#ffffff', pupil: 'none', glow: BS.cyan, glowK: 0.9, glowR: 3.6, lw: 1.4, catch: false }));
        },
      });
      ctx.restore();
      ctx.restore();
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // SKY SERPENT (normal, l): a long white wind that learned to hold a shape: an eastern dragon-serpent coiled on the flagstones, pale as cloud, wind-curl
  // patterns down its scales, a mane of cloud puffs, antler horns and two long whiskers that never stop streaming. The neck rears, the jaws snap in threes.
  // Accent: glowing cyan eyes and the streaks of wind that circle it.
  // ---------------------------------------------------------------------------------------------------------------
  const SP = { body: '#e4f3ff', bodyD: '#8fb4e6', belly: '#fff2d2', line: '#7ab0e0', horn: '#f5d98a', cyan: '#5ff5ff', cloud: '#ffffff' };
  const SP_NECK = [[24, -96], [2, -124], [6, -156], [-24, -182], [-60, -194]];
  const SP_TAIL = [[86, -30], [114, -40], [132, -70], [124, -100], [104, -112]];
  // points offset sideways from a spine by off(u) px (positive = to the left of the direction of travel)
  function spineOffset(spine, n, off) {
    const out = [];
    for (let i = 0; i <= n; i++) { const u = i / n, p = along(spine, u), o = off(u); out.push([p.x + p.ty * o, p.y - p.tx * o]); }
    return out;
  }
  function windCurl(S, x, y, r, a0) {
    const pts = [];
    for (let i = 0; i <= 12; i++) { const u = i / 12, a = a0 + u * 4.6, rr = r * (1 - u * 0.8); pts.push([x + cos(a) * rr, y + sin(a) * rr]); }
    S.line(pts, { w: Math.max(1.3, r * 0.14), color: SP.line, alpha: 0.85, taper: 0.3, wobble: 0.05 });
  }
  define('sky_serpent', {
    size: 'l', lw: 3.4,
    col: { rim: '#ffffff', shT: 0.42 },
    bounds: { w: 330, h: 296, head: { x: -80, y: -250 }, body: { x: 6, y: -70 }, feet: { x: 0, y: 0 } },
    die: { box: [-190, -270, 150, 6], nx: 13, ny: 14, from: 'out', order: 0.4, shape: 'ink', kinds: ['wind', 'puff', 'spark', 'wind'], cols: ['#ffffff', '#cfeaff', '#5ff5ff', '#e4f3ff'], wind: [-24, -14], size: 11, life: 0.6 },
    parts: {
      coil: {
        box: [-112, -122, 116, 4], pivot: [0, -50],
        draw(S) {
          const band = (cx, cy, rx, ry, seed, lite) => {
            S.cel(E(cx, cy, rx, ry, 18), lite ? SP.body : '#d4e6fb', {
              depth: 12, hi: true, hiW: 2.6, rim: S.c.rim, halftone: { d: 5, alpha: 0.26 },
              decor(g) {
                g.fillStyle = SP.belly; g.beginPath(); g.ellipse(cx - rx * 0.05, cy + ry * 0.55, rx * 0.86, ry * 0.5, 0, 0, PI); g.fill();
                for (let i = 0; i < 9; i++) tk.inkPath(g, [[cx - rx * 0.82 + i * rx * 0.2, cy + ry * 0.12], [cx - rx * 0.82 + i * rx * 0.2 + 2, cy + ry * 0.98]], { w: 1.3, color: '#b9a878', alpha: 0.6, taper: 0.3 });
                for (let i = 0; i < 4; i++) tk.inkCurve(g, cx - rx * 0.7 + i * rx * 0.4, cy - ry * 0.5, cx - rx * 0.5 + i * rx * 0.4, cy - ry * 0.9, cx - rx * 0.3 + i * rx * 0.4, cy - ry * 0.5, { w: 1.6, color: SP.line, alpha: 0.75, taper: 0.3 });
              },
            });
          };
          band(0, -24, 100, 25, 1, false);
          band(-6, -56, 86, 24, 2, true);
          band(8, -86, 70, 22, 3, false);
          windCurl(S, 60, -28, 14, 0.4); windCurl(S, -56, -60, 12, 2.4); windCurl(S, 44, -90, 10, 1.2);
        },
      },
      jaw: {
        box: [-160, -206, -40, -150], pivot: [-56, -190],
        draw(S) {
          S.cel([[-56, -192], [-94, -190], [-126, -186], [-148, -184], [-148, -172], [-124, -166], [-90, -168], [-60, -174]], SP.body, { depth: 7, hi: true, hiW: 1.8, rim: S.c.rim, halftone: { d: 5, alpha: 0.24 } });
          S.cel({ poly: [[-56, -192], [-94, -190], [-126, -186], [-148, -184], [-148, -178], [-100, -182], [-60, -186]] }, SP.belly, { depth: 1, line: 0, hi: false, rim: null, shadow: false });
          [[-136, -186], [-116, -188], [-96, -190]].forEach((f) => S.cel([[f[0] - 3, f[1], 1], [f[0], f[1] - 12, 1], [f[0] + 4, f[1], 1]], '#ffffff', { depth: 2, line: 1.8, tension: 0, hi: false, rim: null, shadow: false }));
        },
      },
      head: {
        box: [-166, -274, -20, -160], pivot: [-60, -194],
        draw(S) {
          // antler horns and the cloud mane behind, then the long skull
          S.cel([[-64, -226, 1], [-58, -252], [-40, -274, 1], [-36, -252], [-44, -232, 1]], SP.horn, { depth: 4, line: 3, tension: 0.4, hi: true, hiW: 1.4, rim: '#ffffff' });
          S.cel([[-84, -228, 1], [-88, -252], [-102, -268, 1], [-96, -248], [-92, -228, 1]], SP.horn, { depth: 4, line: 3, tension: 0.4, hi: true, hiW: 1.2, rim: '#ffffff' });
          [[-34, -214, 20], [-26, -190, 17], [-46, -236, 15], [-70, -166, 12]].forEach((c, i) => S.ell(c[0], c[1], c[2], c[2] * 0.9, SP.cloud, { depth: 5, line: 3, hi: false, rim: S.c.rim, halftone: { d: 4, alpha: 0.2, color: '#8fb4e6' } }));
          S.cel([[-36, -222], [-66, -238], [-98, -238], [-126, -228], [-146, -214], [-162, -206, 1], [-160, -192], [-144, -185], [-118, -188], [-92, -180], [-64, -178], [-40, -190], [-28, -204]], SP.body, {
            depth: 12, hi: true, hiW: 2.4, rim: S.c.rim, halftone: { d: 5, alpha: 0.24 },
            decor(g) {
              tk.inkCurve(g, -46, -216, -70, -230, -98, -224, { w: 1.6, color: SP.line, alpha: 0.85, taper: 0.4 });
              tk.inkPath(g, [[-146, -204], [-128, -210], [-110, -204]], { w: 1.5, color: SP.line, alpha: 0.8, taper: 0.4 });
              windCurl(S, -60, -200, 12, 0.8);
            },
          });
          S.cel([[-118, -216], [-96, -222], [-72, -218], [-68, -208], [-92, -206], [-114, -206]], '#b9d6f6', { depth: 3, line: 2.6, hi: false, rim: S.c.rim, tension: 0.5 });
          S.ell(-152, -197, 3.6, 3.2, '#3a4a78', { line: 1.4, shadow: false, rim: null });
          [[-132, -184], [-110, -181]].forEach((f) => S.cel([[f[0] - 3, f[1], 1], [f[0] + 1, f[1] + 12, 1], [f[0] + 5, f[1], 1]], '#ffffff', { depth: 2, line: 1.8, tension: 0, hi: false, rim: null, shadow: false }));
        },
      },
    },
    chains: {
      neck: {
        spine: SP_NECK, cuts: [0.34, 0.68], reach: 76, overlap: 9,
        draw(S) {
          S.rib(SP_NECK, SP.body, {
            cap: 'round', wMax: 62, w0: 62, w1: 46, tipPow: 1, profile: (u) => 1 - 0.26 * u, shadow: '#cfe3f8', rim: S.c.rim, rimW: 1.8, line: 3.4, halftone: { d: 5, alpha: 0.26 }, shadowW: 0.55,
            decor(g) {
              const bp = spineOffset(SP_NECK, 16, (u) => 16 * (1 - 0.26 * u));
              tk.ribbon(g, bp, SP.belly, { wMax: 22, w0: 22, w1: 16, tipPow: 1, profile: () => 1, shadow: false, line: false, gloss: false, strands: 0 });
              for (let i = 0; i < 12; i++) { const p = along(SP_NECK, 0.05 + i * 0.08); tk.inkPath(g, [[p.x - p.ty * 32, p.y + p.tx * 32], [p.x + p.ty * 6, p.y - p.tx * 6]], { w: 1.3, color: '#b9a878', alpha: 0.55, taper: 0.3 }); }
              for (let i = 0; i < 4; i++) { const p = along(SP_NECK, 0.15 + i * 0.22); windCurl(S, p.x - p.ty * 16 + 6, p.y + p.tx * 16, 10, i); }
            },
          });
        },
      },
      tail: {
        spine: SP_TAIL, cuts: [0.34, 0.68], reach: 40, overlap: 4,
        draw(S) {
          S.rib(SP_TAIL, SP.body, { wMax: 36, w0: 34, w1: 5, tipPow: 1.2, shadow: '#cfe3f8', rim: S.c.rim, rimW: 1.6, line: 3.2, halftone: { d: 5, alpha: 0.26 },
            decor(g) { for (let i = 0; i < 6; i++) { const p = along(SP_TAIL, 0.1 + i * 0.13); tk.inkPath(g, [[p.x - p.ty * 16, p.y + p.tx * 16], [p.x + p.ty * 16, p.y - p.tx * 16]], { w: 1.3, color: SP.line, alpha: 0.6, taper: 0.3 }); } } });
          const e = SP_TAIL[SP_TAIL.length - 1];
          S.ell(e[0] - 2, e[1] - 4, 14, 12, SP.cloud, { depth: 4, line: 2.8, hi: false, rim: S.c.rim });
          windCurl(S, e[0] - 2, e[1] - 4, 10, 0.5);
        },
      },
      whisk: {
        spine: [[-140, -194], [-166, -206], [-190, -194], [-208, -212]], cuts: [0.5], reach: 24, overlap: 3,
        draw(S) {
          S.rib([[-140, -194], [-166, -206], [-190, -194], [-208, -212]], '#d8f6ff', { wMax: 7, w0: 6, w1: 1, tipPow: 1, shadow: '#9fd0f0', rim: false, line: 2.4, halftone: false, gloss: false });
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die, atk = E0.pose === 'attack', p = atk ? E0.p : 0;
      const w1 = t * 1.5, br = sin(TAU * t / 3.4) * m;
      const strike = atk ? E0.strike : 0, wind = atk ? E0.wind : 0;
      // three quick bites across the strike window
      const bite = atk ? Math.max(0, sin(clamp((p - 0.26) / 0.44, 0, 1) * PI * 3)) : 0;
      const A = -0.06 * tele;
      const sw = [0.05 * sin(w1) * m, 0.09 * sin(w1 - 0.9) * m, 0.11 * sin(w1 - 1.8) * m];
      const rear = 0.34 * tele + 0.36 * wind - 0.9 * strike + 0.5 * buff + 0.35 * hurt + die * 0.3;
      const tuck = guard;
      const bends = [sw[0] + rear * 0.3 + 0.18 * tuck - 0.1 * strike, sw[1] + rear * 0.36 - 0.55 * tuck - 0.42 * strike, sw[2] + rear * 0.34 - 0.75 * tuck - 0.42 * strike];
      const tip = chainTip(st.spec, 'neck', bends);
      const dx = -strike * 30 + hurt * 14, spread = 1 + 0.04 * tuck + 0.02 * br;
      // wind streaks circling the coil
      const streak = (front) => {
        for (let i = 0; i < 5; i++) {
          const a0 = t * (1.1 + 0.1 * i) + i * 1.3, r = 88 + 12 * i, cy = -70 - 8 * i;
          const fa = sin(a0);
          if ((fa > 0) !== front) continue;
          ctx.save(); ctx.globalAlpha = cA(0.5 * (0.4 + 0.6 * Math.abs(fa)) * (1 - die)) * (0.5 + 0.5 * clamp(buff + tele + 0.4, 0, 1));
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 + i % 2; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.ellipse(10, cy, r, 20 + 4 * i, 0, a0 - 0.7, a0 + 0.7); ctx.stroke(); ctx.restore();
        }
      };
      streak(false);
      ctx.save();
      xform(ctx, 0, -50, dx * 0.4, 0, 0, spread, 1 - 0.02 * br - 0.04 * tuck);
      putChain(ctx, st, 'tail', [0.1 * sin(w1 * 1.3) * m + 0.2 * tuck, 0.22 * sin(w1 * 1.3 - 1) * m + 0.2 * tuck, 0.3 * sin(w1 * 1.3 - 2) * m - 0.4 * hurt + 0.3 * buff * sin(t * 8)]);
      put(ctx, st, 'coil', { sy: 1 + 0.02 * br + 0.03 * buff, sx: 1 + 0.01 * br });
      ctx.restore();
      ctx.save();
      xform(ctx, 24, -96, dx, 0, A, 1, 1);
      putChain(ctx, st, 'neck', bends);
      // the head rides the tip of the neck
      const open = 0.06 + 0.06 * sin(t * 2.2) * m + 0.62 * tele + 0.5 * wind * (1 - strike) + 0.7 * bite + 0.55 * buff + 0.4 * hurt + 0.5 * die;
      const headR = tip.r * 0.55 - 0.1 * strike + 0.08 * sin(t * 1.7) * m + 0.05 * tele * sin(t * 44);
      put(ctx, st, 'head', {
        x: tip.dx, y: tip.dy, r: tip.r + headR, sx: 1.28, sy: 1.28,
        pre(c) {
          // whiskers and the glowing mouth behind the skull
          [[0, 0.3, 1], [8, -0.1, 0.8]].forEach((w, k) => putChain(c, st, 'whisk', [0.5 * sin(t * 3 + k) * m - 0.3 * strike, 0.7 * sin(t * 3 - 1 + k) * m], { y: w[0], r: w[1] + 0.1 * sin(t * 2.4 + k) * m, sx: w[2], sy: w[2] }));
          if (open > 0.12) {
            const H = [-58, -188], U = [-146, -184], jx = H[0] - 90 * cos(open) + 4 * sin(open), jy = H[1] + 90 * sin(open) + 4 * cos(open);
            c.beginPath(); c.moveTo(H[0], H[1] - 6); c.lineTo(U[0], U[1]); c.lineTo(jx, jy - 2); c.lineTo(H[0], H[1] + 6); c.closePath();
            const gr = c.createLinearGradient(H[0], H[1], U[0], U[1] + 30); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.6, '#8ff4ff'); gr.addColorStop(1, '#2a7aa8');
            c.fillStyle = gr; c.fill();
            tk.glow(c, -100, -184 + open * 22, 44, SP.cyan, cA(0.3 + 0.6 * clamp(tele + wind + buff, 0, 1)));
          }
          put(c, st, 'jaw', { r: -open });
        },
        kids(c) {
          const ob = blink(t, 'serpent', 4.1) * (1 - 0.3 * hurt);
          eyeLive(c, -96, -206, 10, 7.2, { open: ob, iris: ['#5ff5ff', '#ffffff'], sclera: '#ffffff', pupil: 'slit', pupilColor: '#0a3a6a', glow: SP.cyan, glowK: 0.8 + 0.2 * (tele + buff), glowR: 3, lw: 2.4, rot: -0.2, lidTop: 0.3 + 0.2 * clamp(tele + strike, 0, 1) });
        },
      });
      ctx.restore();
      streak(true);
      if (buff > 0.05) for (let i = 0; i < 3; i++) { const u = (E0.buffP + i * 0.3) % 1; ctx.save(); ctx.globalAlpha = cA((1 - u) * buff * 1.6); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(10, -90 - 30 * u, 100 + 30 * u, 26 + 20 * u, 0, 0, TAU); ctx.stroke(); ctx.restore(); }
      if (atk && strike > 0.3) { ctx.save(); ctx.globalAlpha = 0.6 * strike; sparks(ctx, -150 + dx, -160, t, 8, 44, { col: '#ffffff', speed: 60, size: 12, dir: PI, spread: 1.2, life: 0.4 }); ctx.restore(); }
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // ERASER WRAITH (normal, m): a pencil ghost, half rubbed out already: a smudged graphite cloak in a soft grey line, a blank oval face with round dark
  // eyes and a tiny humming mouth, a tail that frays into smudge and crumbs, and one enormous pink eraser held out in front, rubbing. Accent: the eraser
  // pink and the crumbs it sheds.
  // ---------------------------------------------------------------------------------------------------------------
  const EW = { ghost: '#aaa7c8', ghostL: '#cbc8e2', mask: '#ece9f8', pink: '#f4a3b8', pinkD: '#d4708a', wrap: '#fff8f0', blue: '#5f9bff', red: '#e8383d', line: '#3c3858', smudge: '#6f6b8f' };
  function note(ctx, x, y, s, a, col) {
    ctx.save(); ctx.globalAlpha = ctx.globalAlpha * cA(a); ctx.fillStyle = col || '#ffffff'; ctx.strokeStyle = col || '#ffffff'; ctx.lineWidth = Math.max(1.2, s * 0.16); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.ellipse(x, y, s * 0.5, s * 0.36, -0.4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + s * 0.42, y - s * 0.06); ctx.lineTo(x + s * 0.42, y - s * 1.1); ctx.quadraticCurveTo(x + s * 0.8, y - s * 0.9, x + s * 0.72, y - s * 0.5); ctx.stroke();
    ctx.restore();
  }
  function hatch(g, x0, y0, x1, y1, gap, col, a) {
    for (let x = x0 - (y1 - y0); x < x1; x += gap) tk.inkPath(g, [[x, y1], [x + (y1 - y0), y0]], { w: 1.2, color: col, alpha: a, taper: 0.2, wobble: 0.06, seed: (x | 0) });
  }
  define('eraser_wraith', {
    size: 'm', lw: 2.8,
    col: { rim: '#ffffff', shT: 0.38, lineColor: EW.line },
    bounds: { w: 200, h: 185, head: { x: -8, y: -166 }, body: { x: 0, y: -92 }, feet: { x: 0, y: 0 } },
    die: { box: [-130, -176, 140, -20], shape: 'wipe', kinds: ['crumb', 'crumb', 'puff', 'crumb'], cols: ['#f4a3b8', '#ffd0dc', '#aaa7c8', '#d4708a'], wind: [-8, 10], size: 6, thin: 0.3, nx: 12, ny: 8 },
    parts: {
      cloak: {
        box: [-62, -130, 66, -20], pivot: [0, -80],
        draw(S) {
          S.cel([[-38, -110], [-46, -84], [-38, -56], [-16, -38], [10, -28], [36, -38], [50, -60], [48, -92], [36, -114], [0, -122]], EW.ghost, {
            depth: 18, hi: true, hiW: 2.4, rim: S.c.rim, halftone: { d: 4, alpha: 0.32, color: '#4a4664' },
            decor(g) { hatch(g, -50, -100, 56, -30, 9, '#4a4664', 0.34); tk.inkPath(g, [[-30, -100], [-28, -64], [-16, -42]], { w: 1.6, color: '#f0eefc', alpha: 0.6, taper: 0.3 }); },
          });
          // rubbed-through patches where the graphite is gone
          S.ell(24, -66, 9, 6, EW.ghostL, { depth: 2, line: 0, hi: false, rim: null, shadow: false });
          S.ell(2, -48, 6, 4, EW.ghostL, { depth: 2, line: 0, hi: false, rim: null, shadow: false });
        },
      },
      hood: {
        box: [-54, -176, 44, -84], pivot: [-6, -108],
        draw(S) {
          S.cel([[-44, -128], [-40, -152], [-20, -172], [8, -172], [30, -154], [36, -128], [30, -104], [-2, -94], [-34, -104]], EW.ghost, {
            depth: 14, tension: 0.9, hi: true, hiW: 2.6, rim: S.c.rim, halftone: { d: 4, alpha: 0.3, color: '#4a4664' },
            decor(g) { hatch(g, -46, -170, 38, -96, 9, '#4a4664', 0.3); },
          });
          S.cel([[16, -168], [30, -186, 1], [40, -176], [32, -160]], EW.ghost, { depth: 4, line: 2.4, hi: false, rim: null, tension: 0.4 });
          S.cel(E(-14, -126, 24, 29, 16), EW.mask, { depth: 8, line: 2.6, hi: true, hiW: 1.8, rim: '#ffffff', halftone: { d: 5, alpha: 0.16, color: '#8a86a8' } });
          tk.blush(S.g, -32, -112, 12, { color: '#ff8fa8', alpha: 0.5, hatch: false });
          tk.blush(S.g, 4, -112, 11, { color: '#ff8fa8', alpha: 0.5, hatch: false });
        },
      },
      sleeve: {
        box: [-96, -120, -14, -60], pivot: [-28, -98],
        draw(S) {
          S.cel([[-24, -114], [-50, -118], [-74, -108], [-84, -92], [-72, -76], [-46, -78], [-22, -88]], EW.ghost, { depth: 10, tension: 0.8, hi: true, hiW: 1.8, rim: S.c.rim, halftone: { d: 4, alpha: 0.3, color: '#4a4664' } });
          S.cel([[-72, -110], [-84, -94], [-72, -78], [-64, -80], [-72, -94], [-64, -108]], EW.mask, { depth: 3, line: 2.4, hi: false, rim: null, tension: 0.4 });
        },
      },
      eraser: {
        box: [-64, -22, 34, 22], pivot: [0, 0],
        draw(S) {
          // a big pink rubber block, its used end rounded and grey with graphite, its paper wrapper white with a blue band
          S.cel([[-56, -14, 1], [-10, -15, 1], [-8, 15, 1], [-54, 15, 1]], EW.pink, {
            depth: 8, line: 3, tension: 0.15, hi: true, hiW: 2, rim: '#ffd6e0', halftone: { d: 4, alpha: 0.2, color: '#a04a62' },
            decor(g) { g.fillStyle = 'rgba(90,86,120,0.55)'; g.beginPath(); g.moveTo(-60, -16); g.lineTo(-40, -16); g.lineTo(-44, 0); g.lineTo(-38, 16); g.lineTo(-60, 16); g.fill(); hatch(g, -58, -14, -36, 14, 5, '#3c3858', 0.5); },
          });
          S.cel([[-14, -16, 1], [26, -16, 1], [26, 16, 1], [-14, 16, 1]], EW.wrap, {
            depth: 5, line: 3, tension: 0.15, hi: false, rim: '#ffffff',
            decor(g) { g.fillStyle = EW.blue; g.fillRect(-14, -16, 8, 32); g.fillStyle = EW.red; g.fillRect(-4, -16, 3, 32); tk.inkPath(g, [[6, -6], [22, -6]], { w: 1.6, color: '#8a86a8', taper: 0.1, pressure: 'flat' }); tk.inkPath(g, [[6, 2], [18, 2]], { w: 1.6, color: '#8a86a8', taper: 0.1, pressure: 'flat' }); },
          });
        },
      },
      hand: {
        box: [-16, -14, 16, 16], pivot: [0, 0],
        draw(S) { S.cel(E(0, 0, 9, 8, 10), EW.mask, { depth: 3, line: 2.4, hi: false, rim: '#ffffff' }); [[-6, -3], [-1, -6], [5, -4]].forEach((f) => S.line([[f[0], f[1]], [f[0] - 2, f[1] - 4]], { w: 2.4, color: EW.mask, taper: 0.3 })); },
      },
    },
    chains: {
      tail: {
        spine: [[28, -46], [56, -52], [82, -42], [106, -54], [130, -44]], cuts: [0.34, 0.68], reach: 34, overlap: 5,
        draw(S) {
          S.rib([[28, -46], [56, -52], [82, -42], [106, -54], [130, -44]], EW.ghost, { wMax: 44, w0: 40, w1: 2, tipPow: 1.3, shadow: '#7a7699', rim: S.c.rim, rimW: 1.4, line: 2.8, halftone: { d: 4, alpha: 0.3, color: '#4a4664' }, gloss: false, strands: 0,
            decor(g) { hatch(g, 20, -80, 140, -20, 9, '#4a4664', 0.3); } });
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die, atk = E0.pose === 'attack', p = atk ? E0.p : 0;
      const strike = atk ? E0.strike : 0, wind = atk ? E0.wind : 0;
      const bob = sin(t * 2) * 6 * m, hot = clamp(tele + buff + strike, 0, 1);
      const dx = -strike * 40 + hurt * 20 + 6 * tele + wind * 8, dy = bob - hurt * 5 - 10 * tele * 0 - wind * 6;
      const rot = 0.035 * sin(t * 1.4) * m + 0.06 * tele + 0.12 * hurt - 0.06 * strike;
      // the rubbing hand: small quick strokes at idle, a raised wind-up, a hard zig-zag swipe on the strike
      const rub = sin(t * 9) * m;
      let hx = -78 + 9 * rub, hy = -88 + 3 * sin(t * 4.5) * m, ER = -0.02 + 0.08 * rub;
      if (atk) { const k = sm(p / 0.3), z = sin(p * 60) * 6 * strike; hx += 20 * k - 68 * strike; hy += -28 * k + 30 * strike + z; ER = lerp(-0.02, -0.5, k) + 0.9 * strike; }
      else if (E0.pose === 'telegraph') { hx += 12 * tele + 3 * E0.shake; hy += -46 * tele; ER = -0.5 * tele + 0.05 * E0.shake; }
      else if (E0.pose === 'block') { hx += 40 * guard; hy += -6 * guard; ER = 0.3 * guard; }
      else if (E0.pose === 'buff') { hy += -16 * buff; hx += 6 * buff; }
      else if (E0.pose === 'hurt') { hx += 18 * hurt; hy += -6 * hurt; ER = 0.4 * hurt; }
      ctx.save();
      ctx.globalAlpha = 1 - 0.18 * guard;
      xform(ctx, 0, -80, dx, dy, rot, 1 - 0.1 * guard + 0.1 * hurt, 1 + 0.06 * guard - 0.05 * hurt);
      putChain(ctx, st, 'tail', [0.1 * sin(t * 2.2) * m + 0.12 * tele - 0.2 * strike, 0.2 * sin(t * 2.2 - 0.9) * m, 0.3 * sin(t * 2.2 - 1.8) * m - 0.2 * hurt], { y: 4 * sin(t * 2.2) * m });
      put(ctx, st, 'cloak', { sy: 1 + 0.02 * sin(t * 2.6) * m, sx: 1 - 0.015 * sin(t * 2.6) * m });
      put(ctx, st, 'hood', {
        r: 0.02 * sin(t * 1.6 + 1) * m + 0.1 * hurt - 0.05 * tele,
        kids(c) {
          const ob = blink(t, 'wraith', 3.6) * (1 - 0.6 * hurt);
          eyeLive(c, -25, -128, 6, 8, { open: ob, iris: ['#2a2540', '#5a5580'], sclera: '#ffffff', pupil: 'none', irisK: 0.96, lw: 2, catch: true, glow: '#ffd0e0', glowK: 0.2 + 0.4 * hot, glowR: 2.2 });
          eyeLive(c, -6, -128, 5.4, 7.4, { open: ob, iris: ['#2a2540', '#5a5580'], sclera: '#ffffff', pupil: 'none', irisK: 0.96, lw: 2, catch: true, glow: '#ffd0e0', glowK: 0.2 + 0.4 * hot, glowR: 2.2 });
          // a humming mouth that opens wider when it works, and a grimace on the wind-up
          const mo = 3.2 + 1.6 * (0.5 + 0.5 * sin(t * 4.2)) * m + 5 * tele + 3 * buff + 4 * strike;
          c.beginPath(); c.ellipse(-16, -108, mo * 0.8, mo, 0, 0, TAU); c.fillStyle = '#4a1a3a'; c.fill(); c.lineWidth = 1.8; c.strokeStyle = EW.line; c.stroke();
          if (tele > 0.3) { c.beginPath(); c.ellipse(-16, -105, mo * 0.5, mo * 0.4, 0, 0, TAU); c.fillStyle = '#ff7a9a'; c.fill(); }
        },
      });
      put(ctx, st, 'sleeve', { r: (E0.pose === 'telegraph' ? -0.5 * tele : 0) + (atk ? -0.5 * sm(p / 0.3) + 0.9 * strike : 0) + 0.7 * guard + 0.05 * sin(t * 1.9) * m + 0.2 * hurt });
      put(ctx, st, 'eraser', { x: hx, y: hy, r: ER, sx: 1.3, sy: 1.3 });
      put(ctx, st, 'hand', { x: hx + 2, y: hy });
      // pink glow on the eraser when it means it
      tk.glow(ctx, hx - 30, hy, 28 + 22 * hot, '#ff8fb0', 0.2 + 0.5 * hot);
      ctx.restore();
      // crumbs shed by the eraser and by the tail, graphite dust, hummed notes
      motes(ctx, hx - 30 + dx, hy + 8 + dy, t, 7, 71, { col: '#f4a3b8', size: 2.2, rise: -34, spread: 18, life: 1.2, alpha: 0.95, add: false });
      motes(ctx, 100 + dx, -50 + dy, t, 5, 72, { col: '#aaa7c8', size: 2, rise: -22, spread: 20, life: 1.5, alpha: 0.8, add: false });
      for (let i = 0; i < 2 + (buff > 0 ? 3 : 0); i++) { const per = 2.2, u = ((t / per + i / 2) % 1 + 1) % 1; note(ctx, -20 + dx + sin(u * 6 + i) * 12, -150 + dy - u * 40, 9 + 3 * buff, sin(u * PI) * (0.9 - die * 0.9), '#ffffff'); }
      if (atk && p > 0.36 && p < 0.8) {
        const u = (p - 0.36) / 0.44;
        ctx.save(); ctx.globalAlpha = (1 - u) * 0.85;
        for (let i = 0; i < 3; i++) { ctx.fillStyle = i === 1 ? '#ffd0dc' : '#ffffff'; ctx.beginPath(); ctx.moveTo(-110 + dx, -110 + i * 12); ctx.lineTo(-40 + dx, -96 + i * 12); ctx.lineTo(-44 + dx, -86 + i * 12); ctx.lineTo(-116 + dx, -100 + i * 12); ctx.closePath(); ctx.fill(); }
        ctx.restore();
      }
      if (tele > 0.05) for (let i = 0; i < 6; i++) { const a = t * 5 + i * TAU / 6, r = 22 + 20 * tele; ctx.save(); ctx.globalAlpha = tele * 0.8; ctx.fillStyle = '#f4a3b8'; ctx.fillRect(hx - 30 + dx + cos(a) * r, hy - 4 + dy + sin(a) * r * 0.7, 3.4, 2.4); ctx.restore(); }
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // THUNDER CROW (normal, m): a crow that flew too close to the storm and came back louder. Storm-indigo plumage struck through with yellow lightning
  // marks, a crest that stands on end with static, a heavy gold beak, wings that crackle when they spread. Dives like a hammer. Accent: the white-gold
  // glaring eye and the lightning in its feathers.
  // ---------------------------------------------------------------------------------------------------------------
  const TC = { plumage: '#3b418c', plumageD: '#22265a', belly: '#6068a8', beak: '#f5c96a', beakD: '#c48a2a', volt: '#ffe45e', voltCore: '#ffffff', eye: '#fff2a0', cloud: '#d8d4f4' };
  // one long feather from the origin: base width w, length len, rotated by ang, with a lightning zig down its middle
  function feather(S, ang, len, w, col, mark) {
    const c = cos(ang), s = sin(ang), R = (x, y) => [x * c - y * s, x * s + y * c];
    const pts = [R(0, 0), R(len * 0.3, -w / 2), R(len * 0.72, -w * 0.4), R(len, 0), R(len * 0.72, w * 0.4), R(len * 0.3, w / 2)];
    pts[3].push(1);
    S.cel(pts, col, { depth: 3.6, line: 2.6, tension: 0.7, hi: false, rim: S.c.rim, rimW: 1.2, halftone: { d: 4, alpha: 0.22 } });
    if (mark) {
      const zz = [R(len * 0.22, 0), R(len * 0.42, -w * 0.14), R(len * 0.52, w * 0.12), R(len * 0.72, -w * 0.1), R(len * 0.9, 0)];
      S.line(zz, { w: 3, color: TC.volt, taper: 0.2, pressure: 'flat', wobble: 0 });
      S.line(zz, { w: 1.1, color: TC.voltCore, taper: 0.2, pressure: 'flat', wobble: 0 });
    }
  }
  function crowWing(S, far) {
    const col = far ? TC.plumageD : TC.plumage, n = 6;
    for (let i = 0; i < n; i++) feather(S, -0.45 - i * 0.24 - (far ? 0.1 : 0), 96 - i * 6 + (far ? 4 : 0), 24, i % 2 ? col : (far ? '#2a2e68' : '#464da0'), !far && i % 2 === 0);
    S.cel([[-6, -12], [30, -30], [58, -24], [46, 6], [10, 14]], col, { depth: 6, line: 2.8, tension: 0.8, hi: !far, hiW: 1.6, rim: far ? null : S.c.rim, halftone: { d: 4, alpha: 0.24 } });
  }
  define('thunder_crow', {
    size: 'm', lw: 3,
    col: { rim: '#ffe98a', shT: 0.4 },
    bounds: { w: 200, h: 188, head: { x: -44, y: -166 }, body: { x: 0, y: -90 }, feet: { x: 0, y: 0 } },
    die: { box: [-110, -180, 110, 4], nx: 11, ny: 12, from: 'out', order: 0.5, shape: 'diamond', kinds: ['feather', 'spark', 'feather', 'feather'], cols: ['#3b418c', '#ffe45e', '#22265a', '#6068a8'], wind: [8, -12], size: 10, life: 0.6 },
    parts: {
      legF: { box: [-4, -60, 34, 4], pivot: [14, -46], draw(S) { S.cel(cap(14, -46, 16, -10, 8, 6), TC.beakD, { depth: 2, line: 2.4, hi: false, rim: null, tension: 0.5 }); [[-8, 4], [0, -2], [10, 6]].forEach((t3) => S.line([[16, -8], [16 + t3[0] - 6, t3[1]]], { w: 3.4, color: TC.beakD, taper: 0.2, wobble: 0 })); } },
      legN: { box: [-28, -60, 12, 4], pivot: [-8, -46], draw(S) { S.cel(cap(-8, -46, -12, -10, 9, 7), TC.beak, { depth: 2, line: 2.6, hi: false, rim: S.c.rim, tension: 0.5 }); [[-16, 4], [-8, -2], [3, 6]].forEach((t3) => S.line([[-12, -8], [-12 + t3[0] - 4, t3[1]]], { w: 3.6, color: TC.beak, taper: 0.2, wobble: 0 })); } },
      wingF: { box: [-20, -220, 110, -60], pivot: [12, -114], draw(S) { S.g.save(); S.g.translate(12, -114); crowWing(S, true); S.g.restore(); } },
      body: {
        box: [-58, -140, 60, -44], pivot: [0, -92],
        draw(S) {
          // tail feathers first, then the plump barrel of a body with a paler chest
          [[-0.1, 70], [0.15, 62], [0.4, 54]].forEach((f, i) => { S.g.save(); S.g.translate(34, -76); feather(S, f[0] + 0.2, f[1] + 12, 20, i % 2 ? TC.plumage : '#464da0', i === 1); S.g.restore(); });
          S.cel(E(0, -92, 46, 40, 16, -0.15), TC.plumage, {
            depth: 16, hi: true, hiW: 2.6, rim: S.c.rim, halftone: { d: 4, alpha: 0.3 },
            decor(g) { g.fillStyle = TC.belly; g.beginPath(); g.ellipse(-14, -80, 30, 28, 0.2, 0, TAU); g.fill(); for (let i = 0; i < 4; i++) tk.inkPath(g, [[-34 + i * 10, -92 + (i % 2) * 8], [-30 + i * 10, -84 + (i % 2) * 8], [-26 + i * 10, -92 + (i % 2) * 8]], { w: 1.6, color: TC.plumageD, alpha: 0.85, taper: 0.3 }); },
          });
        },
      },
      wingN: { box: [-20, -220, 110, -60], pivot: [4, -108], draw(S) { S.g.save(); S.g.translate(4, -108); crowWing(S, false); S.g.restore(); } },
      crest: {
        box: [-84, -190, -8, -130], pivot: [-32, -150],
        draw(S) { [[-1.9, 34], [-1.55, 42], [-1.2, 36], [-0.9, 28]].forEach((f, i) => { S.g.save(); S.g.translate(-32 + i * 4, -152); feather(S, f[0], f[1], 11, i % 2 ? TC.plumage : '#464da0', false); S.g.restore(); tk.sparkle(S.g, -32 + i * 4 + cos(f[0]) * f[1], -152 + sin(f[0]) * f[1], 3.4, { color: TC.volt, glow: 0.3 }); }); },
      },
      jaw: {
        box: [-104, -134, -42, -100], pivot: [-56, -122],
        draw(S) { S.cel([[-56, -124], [-84, -124], [-104, -118, 1], [-82, -108], [-58, -108]], TC.beak, { depth: 4, line: 2.8, tension: 0.4, hi: false, rim: S.c.rim }); S.line([[-100, -118], [-64, -122]], { w: 1.3, color: TC.beakD, alpha: 0.7, taper: 0.3 }); },
      },
      head: {
        box: [-108, -170, -4, -96], pivot: [-32, -112],
        draw(S) {
          S.cel(E(-38, -128, 31, 29, 16), TC.plumage, { depth: 12, hi: true, hiW: 2.4, rim: S.c.rim, halftone: { d: 4, alpha: 0.3 } });
          S.cel([[-56, -134], [-84, -138], [-108, -122, 1], [-84, -120], [-58, -118]], TC.beak, { depth: 5, line: 3, tension: 0.4, hi: true, hiW: 1.4, rim: S.c.rim });
          S.cel(E(-70, -130, 2.6, 2.2, 8), TC.beakD, { line: 1, shadow: false, rim: null });
          // a heavy angry brow ridge
          S.cel([[-72, -146], [-52, -144], [-34, -138], [-36, -134], [-52, -138], [-70, -140]], TC.plumageD, { depth: 2, line: 2.4, hi: false, rim: S.c.rim, tension: 0.5 });
          S.line([[-30, -120], [-14, -116]], { w: 2, color: TC.volt, taper: 0.3 });
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die, atk = E0.pose === 'attack', p = atk ? E0.p : 0;
      const strike = atk ? E0.strike : 0, wind = atk ? E0.wind : 0;
      const hop = Math.abs(sin(t * 2.1)) * 5 * m * (1 - tele) * (1 - guard), flap = sin(t * 2.6) * m;
      const hot = clamp(tele + buff + strike + die * 0.5, 0, 1);
      const dx = -strike * 110 + hurt * 16 + 4 * tele + 5 * wind, dy = -hop + strike * 14 + 4 * guard - 10 * wind * 0 - hurt * 4;
      const rot = -0.12 * strike * 4 * (atk ? 1 : 0) * 0.5 + 0.16 * tele - 0.5 * strike + 0.05 * sin(t * 1.9) * m + 0.2 * hurt;
      // wings: up and crackling on a wind-up, swept back for the dive, wrapped round the body on a perch
      const wingSpread = -0.4 * tele - 0.35 * wind + 1.6 * strike + 1.35 * guard - 0.55 * buff + 0.2 * hurt;
      const wr = 0.16 * flap + wingSpread + 0.3 * sin(t * 30) * tele * 0.1;
      const beakOpen = 0.05 + 0.04 * sin(t * 3) * m + 0.6 * tele + 0.5 * wind * (1 - strike) + 0.65 * buff + 0.35 * hurt + 0.4 * die;
      // a dive leaves speed lines behind it
      if (strike > 0.1) { ctx.save(); ctx.globalAlpha = 0.6 * strike; tk.speedLines(ctx, 0, 0, { mode: 'dir', rect: [10 + dx, -150, 160, 110], angle: 0.3, n: 8, len: 90, seed: 9, color: '#ffffff', w: 3, alpha: 0.7 }); ctx.restore(); }
      // storm gathering overhead on the wind-up
      if (tele > 0.05) {
        puffs(ctx, 0, -190, t, 6, 81, { col: TC.cloud, rise: -4, spread: 50, size: 16, life: 1.4, alpha: 0.6 * tele });
        if (flick(t, 6, 8) > 0.5) { ctx.save(); ctx.globalAlpha = tele; zap(ctx, -10 + 24 * sin(t * 5), -196, -20, -130, t, { seed: 2, w: 2.4, jag: 10, n: 6, color: '#ffe45e', core: '#ffffff' }); ctx.restore(); }
      }
      ctx.save();
      xform(ctx, 0, -50, dx, dy, rot, 1 - 0.04 * guard, 1 - 0.04 * guard + 0.02 * sin(t * 2.5) * m);
      put(ctx, st, 'legF', { r: 0.1 * sin(t * 2.1) * m + 0.2 * strike });
      ctx.save(); ctx.translate(0, 10);
      put(ctx, st, 'wingF', { r: wr * 1.05 - 0.1 - 0.05 * sin(t * 2.6 + 1) * m });
      put(ctx, st, 'body', { sy: 1 + 0.02 * sin(t * 3.1) * m });
      ctx.restore();
      put(ctx, st, 'legN', { r: -0.1 * sin(t * 2.1) * m - 0.3 * strike });
      ctx.save(); ctx.translate(0, 10);
      put(ctx, st, 'wingN', { r: wr });
      const nod = 0.06 * sin(t * 2.1 + 0.6) * m - 0.3 * tele * 0 - 0.24 * strike + 0.1 * tele * -1 + 0.25 * buff + 0.15 * hurt;
      put(ctx, st, 'crest', { r: 0.14 * sin(t * 6) * m + nod * 0.8, sx: 1 + 0.4 * buff + 0.25 * tele, sy: 1 + 0.4 * buff + 0.25 * tele });
      put(ctx, st, 'head', {
        r: nod, x: 0, y: 2 * tele,
        pre(c) { put(c, st, 'jaw', { r: -beakOpen * 0.9 }); },
        kids(c) {
          const ob = blink(t, 'crow', 3.8) * (1 - 0.4 * hurt);
          eyeLive(c, -50, -132, 10.4, 9, { open: ob, iris: ['#fff2a0', '#ffffff'], sclera: '#ffffff', pupil: 'dot', glow: TC.volt, glowK: 0.7 + 0.3 * hot, glowR: 3, lw: 2.4, rot: -0.2, look: [-0.7, 0.1], lidTop: 0.34 + 0.2 * hot, pupilColor: '#221a44' });
          if (beakOpen > 0.3) tk.glow(c, -80, -118, 20, TC.volt, 0.4 * clamp(beakOpen, 0, 1));
        },
      });
      ctx.restore();
      // static: sparks off the crest and wing tips, arcs when it is worked up
      sparks(ctx, -36, -158, t, 5, 82, { col: TC.volt, speed: 26, size: 5, spread: 2.6, life: 0.6, alpha: 0.9 });
      if (hot > 0.2 || flick(t, 12, 6) > 0.85) { ctx.save(); ctx.globalAlpha = 0.5 + 0.5 * hot; zap(ctx, -60, -158, 30, -170, t, { seed: 3, w: 1.6 + hot * 1.4, jag: 8, n: 6, color: '#ffe45e', core: '#ffffff' }); ctx.restore(); }
      if (hot > 0.15) tk.glow(ctx, 0, -100, 80, TC.volt, 0.16 * hot + 0.14 * flick(t, 3, 12) * hot);
      ctx.restore();
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // PAPER GOLEM (normal, l): a giant folded by patient hands from the pages of an unfinished chapter: faceted cream paper, printed with rows of
  // unreadable text, bound at every joint with red thread, a folded-paper head with two round eyes that glow like lanterns and a stitched slit of a
  // mouth. A lantern window in the chest lights up as it works itself up. Slow, big, and every fold makes the next slam worse. Accent: the amber
  // lantern light and the red thread.
  // ---------------------------------------------------------------------------------------------------------------
  const PG = { paper: '#efe0bc', paperL: '#fbf0d6', paperD: '#d8c49a', thread: '#e8383d', glow: '#ffb84a', text: '#8a7aa0', dark: '#5a2a10' };
  function textRows(g, x, y, w, n, col, gap) {
    for (let i = 0; i < n; i++) tk.inkPath(g, [[x, y + i * (gap || 6)], [x + w * (0.6 + 0.4 * tk.vary('txt', 'r' + i + x)), y + i * (gap || 6)]], { w: 1.6, color: col || PG.text, alpha: 0.8, taper: 0.05, pressure: 'flat', wobble: 0.1, seed: i });
  }
  function knot(S, x, y, r) {
    S.cel(E(x, y, r, r * 0.8, 10), PG.thread, { depth: r * 0.4, line: 2.2, hi: true, hiW: 1.2, rim: null });
    S.line([[x - r * 0.9, y - r * 0.2], [x - r * 1.9, y + r * 0.9]], { w: 2, color: PG.thread, taper: 0.3 });
    S.line([[x + r * 0.9, y - r * 0.2], [x + r * 1.9, y + r * 0.9]], { w: 2, color: PG.thread, taper: 0.3 });
  }
  function foldBox(S, pts, base, o) {
    S.cel({ poly: pts }, base, Object.assign({
      depth: 8, hi: true, hiW: 2, rim: S.c.rim, halftone: { d: 5, alpha: 0.22, color: '#a89ab8' },
      decor(g) {
        const b = tk.bbox(pts);
        g.fillStyle = 'rgba(120,100,160,0.22)'; g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(b[2], b[3]); g.lineTo(b[0], b[3]); g.fill();
        tk.inkPath(g, [[b[0], b[1]], [b[2], b[3]]], { w: 1.6, color: '#a89ab8', alpha: 0.9, taper: 0.05, pressure: 'flat' });
      },
    }, o));
  }
  define('paper_golem', {
    size: 'l', lw: 3.4,
    col: { rim: '#ffffff', shT: 0.36 },
    bounds: { w: 250, h: 252, head: { x: -6, y: -240 }, body: { x: 0, y: -120 }, feet: { x: 0, y: 0 } },
    die: { box: [-150, -262, 130, 4], nx: 12, ny: 14, from: 'top', order: 0.45, shape: 'paper', kinds: ['scrap', 'scrap', 'scrap', 'ember'], cols: ['#fbf0d6', '#efe0bc', '#d8c49a', '#ffb84a'], wind: [-22, -26], size: 12, thin: 0.25, life: 0.62 },
    parts: {
      legF: {
        box: [0, -76, 84, 4], pivot: [34, -70],
        draw(S) {
          foldBox(S, [[10, -70], [56, -70], [58, -22], [8, -22]], PG.paperD, { rim: null });
          foldBox(S, [[0, -22], [72, -22], [78, -6], [68, 0], [-2, 0]], PG.paperD, { rim: null, depth: 4 });
          knot(S, 34, -48, 5);
        },
      },
      legN: {
        box: [-78, -76, 6, 4], pivot: [-30, -70],
        draw(S) {
          foldBox(S, [[-56, -70], [-4, -70], [-2, -22], [-54, -22]], PG.paper, {});
          foldBox(S, [[-74, -22], [0, -22], [2, -8], [-6, 0], [-70, 0], [-78, -10]], PG.paper, { depth: 5 });
          knot(S, -30, -48, 5.5);
          S.g.save(); textRows(S.g, -48, -64, 34, 3, PG.text, 6); S.g.restore();
        },
      },
      torso: {
        box: [-96, -204, 96, -58], pivot: [0, -110],
        draw(S) {
          S.cel({ poly: [[-78, -176], [-40, -192], [40, -192], [82, -176], [70, -122], [58, -66], [-58, -66], [-70, -122]] }, PG.paper, {
            depth: 22, hi: true, hiW: 3, rim: S.c.rim, halftone: { d: 5, alpha: 0.24, color: '#a89ab8' },
            decor(g) {
              g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.moveTo(-78, -176); g.lineTo(-40, -192); g.lineTo(-6, -130); g.lineTo(-70, -122); g.fill();
              g.fillStyle = 'rgba(120,100,160,0.26)'; g.beginPath(); g.moveTo(82, -176); g.lineTo(70, -122); g.lineTo(58, -66); g.lineTo(0, -66); g.lineTo(-6, -130); g.fill();
              [[[-78, -176], [-6, -130]], [[-6, -130], [58, -66]], [[-70, -122], [-6, -130]], [[-6, -130], [40, -192]]].forEach((cr) => tk.inkPath(g, cr, { w: 1.8, color: '#a89ab8', alpha: 0.9, taper: 0.05, pressure: 'flat' }));
              textRows(g, -66, -176, 44, 4, PG.text, 6); textRows(g, 14, -96, 38, 4, PG.text, 6); textRows(g, -54, -92, 30, 3, PG.text, 6);
              g.fillStyle = '#d9c8f0'; g.globalAlpha = 0.5; g.fillRect(20, -176, 30, 8); g.globalAlpha = 1;
            },
          });
          // the lantern window in the chest: a diamond cut through the page
          S.cel({ poly: [[-6, -166], [22, -136], [-6, -106], [-34, -136]] }, PG.dark, { depth: 3, line: 3, hi: false, rim: null, shadow: false });
          S.cel({ poly: [[-6, -158], [14, -136], [-6, -114], [-26, -136]] }, PG.glow, { depth: 2, line: 0, hi: false, rim: null, shadow: false });
          S.line([[-6, -158], [-6, -114]], { w: 1.8, color: PG.dark, alpha: 0.7, taper: 0.1, pressure: 'flat' });
          S.line([[-26, -136], [14, -136]], { w: 1.8, color: PG.dark, alpha: 0.7, taper: 0.1, pressure: 'flat' });
          S.cel({ poly: [[-58, -82], [58, -82], [56, -68], [-56, -68]] }, PG.thread, { depth: 3, line: 2.8, hi: true, hiW: 1.2, rim: null });
          knot(S, 0, -75, 6);
        },
      },
      armF: {
        box: [30, -210, 150, -50], pivot: [86, -172],
        draw(S) {
          foldBox(S, [[70, -196], [112, -186], [114, -152], [78, -148]], PG.paperD, { rim: null });
          foldBox(S, [[84, -150], [116, -150], [116, -100], [84, -100]], PG.paperD, { rim: null });
          foldBox(S, [[78, -100], [124, -100], [126, -62], [82, -58]], PG.paperD, { rim: null, depth: 6 });
          knot(S, 100, -148, 4.5); knot(S, 100, -102, 4);
        },
      },
      armN: {
        box: [-160, -214, -30, -40], pivot: [-84, -172],
        draw(S) {
          foldBox(S, [[-112, -204], [-62, -196], [-58, -152], [-108, -148]], PG.paper, {});
          foldBox(S, [[-106, -152], [-70, -152], [-72, -102], [-104, -102]], PG.paper, {});
          foldBox(S, [[-118, -102], [-62, -102], [-60, -50], [-116, -46], [-122, -74]], PG.paperL, { depth: 9 });
          S.g.save(); textRows(S.g, -110, -100, 34, 3, PG.text, 6); S.g.restore();
          knot(S, -86, -150, 5.5); knot(S, -88, -104, 5);
        },
      },
      plates: {
        box: [-84, -190, 84, -60], pivot: [0, -128],
        draw(S) {
          foldBox(S, [[-70, -180], [0, -196], [70, -180], [62, -140], [-62, -140]], PG.paperL, { depth: 10 });
          foldBox(S, [[-58, -140], [58, -140], [54, -96], [-54, -96]], PG.paper, { depth: 10 });
          foldBox(S, [[-52, -96], [52, -96], [46, -62], [-46, -62]], PG.paperD, { depth: 10 });
          S.g.save(); textRows(S.g, -40, -180, 60, 3, PG.text, 8); S.g.restore();
        },
      },
      head: {
        box: [-60, -256, 56, -170], pivot: [-2, -178],
        draw(S) {
          // a folded peak like an origami helmet, then the boxy paper head with two round eye holes and a stitched mouth
          S.cel({ poly: [[-40, -222, 1], [-4, -256, 1], [36, -222, 1], [30, -214, 1], [-34, -214, 1]] }, PG.paperL, {
            depth: 8, hi: false, rim: S.c.rim, halftone: { d: 5, alpha: 0.22, color: '#a89ab8' },
            decor(g) { g.fillStyle = 'rgba(120,100,160,0.28)'; g.beginPath(); g.moveTo(-4, -258); g.lineTo(38, -212); g.lineTo(-4, -212); g.fill(); tk.inkPath(g, [[-4, -256], [-4, -214]], { w: 1.6, color: '#a89ab8', taper: 0.1, pressure: 'flat' }); },
          });
          foldBox(S, [[-44, -218], [40, -220], [36, -176], [-40, -174]], PG.paper, { depth: 12 });
          S.cel(E(-20, -198, 11, 12, 14), PG.dark, { depth: 2, line: 3, hi: false, rim: null, shadow: false });
          S.cel(E(10, -198, 10, 11, 14), PG.dark, { depth: 2, line: 3, hi: false, rim: null, shadow: false });
          S.line([[-28, -186], [-10, -184], [6, -186], [22, -186]], { w: 2.4, color: pal.ink, taper: 0.1, pressure: 'flat' });
          for (let i = 0; i < 5; i++) S.line([[-24 + i * 11, -191], [-24 + i * 11, -181]], { w: 2, color: PG.thread, taper: 0.3, pressure: 'flat' });
          S.line([[-36, -172], [34, -174]], { w: 1.4, color: '#a89ab8', alpha: 0.7, taper: 0.1 });
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die, atk = E0.pose === 'attack', p = atk ? E0.p : 0;
      const strike = atk ? E0.strike : 0, wind = atk ? E0.wind : 0, br = sin(TAU * t / 3.6) * m, fold = clamp(guard + buff * 0.8, 0, 1);
      const hot = clamp(tele + buff + strike + fold * 0.6 + st.wound * 0.3, 0, 1);
      const dx = -strike * 26 + hurt * 14 + E0.shake * 1.4 + 6 * tele, dy = 4 * tele + 3 * fold + 10 * die;
      const rot = -0.1 * tele + 0.06 * strike + 0.1 * hurt + 0.012 * br - 0.04 * wind;
      // arms: raised over the head on a wind-up, an overhand smash on the strike, crossed over the chest when folding up
      let aN = 0.06 * br, aF = -0.05 * br;
      if (atk) { if (p < 0.3) { const k = sm(p / 0.3); aN = lerp(0, 2.45, k); aF = lerp(0, 2.55, k); } else if (p < 0.5) { const k = ease.inCubic((p - 0.3) / 0.2); aN = lerp(2.45, -0.15, k); aF = lerp(2.55, -0.1, k); } else { const k = sm((p - 0.5) / 0.5); aN = lerp(-0.15, 0.06 * br, k); aF = lerp(-0.1, 0, k); } }
      else if (E0.pose === 'telegraph') { aN = 2.45 * tele + 0.03 * E0.shake; aF = 2.55 * tele - 0.03 * E0.shake; }
      else if (E0.pose === 'block') { aN = 0.85 * guard; aF = 0.9 * guard; }
      else if (E0.pose === 'buff') { aN = 0.5 * buff + 0.2 * sin(E0.buffP * TAU); aF = 0.5 * buff; }
      else if (E0.pose === 'hurt') { aN = 0.5 * hurt; aF = 0.4 * hurt; }
      else if (die > 0) { aN = 0.6 * die; aF = 0.5 * die; }
      ctx.save();
      if (die > 0) ctx.transform(1 + 0.4 * die, 0, 0, 1 - 0.5 * die, -20 * die, 0);
      ctx.save();
      xform(ctx, 0, -60, dx, dy, rot, 1, 1 - 0.05 * fold);
      const skew = 0.02 * sin(t * 1.7) * m + 0.05 * hurt;
      ctx.transform(1, 0, skew, 1, -skew * 110, 0);
      put(ctx, st, 'legF', { r: 0.02 * br });
      put(ctx, st, 'armF', { r: aF });
      put(ctx, st, 'torso', { sy: 1 + 0.012 * br - 0.02 * tele, sx: 1 + 0.006 * br });
      // the lantern in the chest: a warm window that pulses, blazes when it is winding up
      {
        const lg = 0.4 + 0.15 * sin(t * 2.4) * m + 0.5 * hot;
        tk.glow(ctx, -6, -136, 40 + 26 * hot, PG.glow, cA(lg * 0.9));
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = cA(lg * 0.55); ctx.fillStyle = '#ffd890'; ctx.beginPath(); ctx.moveTo(-6, -158); ctx.lineTo(14, -136); ctx.lineTo(-6, -114); ctx.lineTo(-26, -136); ctx.closePath(); ctx.fill(); ctx.restore();
      }
      put(ctx, st, 'legN', { r: -0.02 * br });
      if (fold > 0.02) put(ctx, st, 'plates', { sy: 0.4 + 0.6 * ease.outBack(clamp(fold, 0, 1)), sx: 0.85 + 0.15 * fold, a: clamp(fold * 3, 0, 1) });
      put(ctx, st, 'armN', { r: aN });
      put(ctx, st, 'head', {
        r: 0.02 * sin(t * 1.3 + 1) * m - 0.06 * tele + 0.05 * strike + 0.12 * hurt, y: 2 * fold + 3 * tele,
        kids(c) {
          const ob = blink(t, 'golem', 5.2) * (1 - 0.3 * hurt), gl = 0.7 + 0.2 * sin(t * 2.2) * m + 0.4 * hot;
          [[-20, -198, 8.5, 9.4], [10, -198, 8, 8.8]].forEach((e) => { tk.glow(c, e[0], e[1], 26 + 10 * hot, PG.glow, cA(gl * 0.8)); c.fillStyle = '#fff3c8'; c.beginPath(); c.ellipse(e[0], e[1], e[2] * 0.78 * (0.3 + 0.7 * ob), e[3] * 0.78 * (0.3 + 0.7 * ob), 0, 0, TAU); c.fill(); });
        },
      });
      ctx.restore();
      // loose pages peeling off and drifting away
      motes(ctx, 0 + dx, -150 + dy, t, 6, 91, { col: '#fbf0d6', size: 3, rise: 16, spread: 90, life: 2.6, alpha: 0.8, add: false });
      if (atk && p > 0.48 && p < 0.9) { const u = (p - 0.48) / 0.42; puffs(ctx, -110 + dx, -6, t * 0 + u, 5, 92, { col: '#e8dcc0', rise: 12, spread: 60, size: 10, life: 1, alpha: 0.5 * (1 - u), dx: -30 }); }
      if (hurt > 0.3) for (let i = 0; i < 5; i++) { const fj = fling('pghurt' + i, 's', E0.p, { spread: 120, up: 70, g: 160, spin: 10 }); ctx.save(); ctx.globalAlpha = fj.a; ctx.translate(-20 + fj.x, -150 + fj.y); ctx.rotate(fj.r); ctx.fillStyle = PG.paperL; ctx.strokeStyle = pal.ink; ctx.lineWidth = 1.6; ctx.fillRect(-6, -4, 12, 8); ctx.strokeRect(-6, -4, 12, 8); ctx.restore(); }
      ctx.restore();
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // MARGIN IMP (normal, m): the doodle in the margin that climbed out of the page: cream paper skin drawn in a shaky, hatched pen line, magenta horns and
  // a magenta arrow of a tail, a huge grin, a giant black quill for a pen and a list of your mistakes trailing from its belt. It draws horns on
  // everyone and calls friends by sketching them. Accent: magenta ink (eyes, horns, tail, the nib).
  // ---------------------------------------------------------------------------------------------------------------
  const MI = { skin: '#f6edd2', hatch: '#241a3a', mag: '#ff3a8a', magD: '#b0245c', magL: '#ff8cc0', quill: '#3b2a7a', vane: '#5b3fa8', gold: '#f5c96a' };
  function penHatch(g, x0, y0, x1, y1, gap, a) {
    for (let x = x0; x < x1 + (y1 - y0); x += gap) tk.inkPath(g, [[x, y0], [x - (y1 - y0) * 0.7, y1]], { w: 1.5, color: MI.hatch, alpha: a === undefined ? 0.75 : a, taper: 0.25, wobble: 0.3, seed: (x | 0) });
  }
  define('margin_imp', {
    size: 'm', lw: 3.4,
    col: { rim: '#ffffff', shT: 0.3, wobble: 0.34 },
    bounds: { w: 190, h: 231, head: { x: -6, y: -170 }, body: { x: 0, y: -88 }, feet: { x: 0, y: 0 } },
    die: { box: [-100, -186, 90, 4], nx: 11, ny: 14, from: 'top', order: 0.6, shape: 'ink', kinds: ['ink', 'letter', 'ink', 'scrap'], cols: ['#241a3a', '#ff3a8a', '#f6edd2', '#ff8cc0'], wind: [4, 10], size: 8, thin: 0.3 },
    parts: {
      legF: { box: [-2, -50, 40, 4], pivot: [14, -44], draw(S) { S.line([[14, -44], [16, -12]], { w: 5, color: MI.hatch, taper: 0.05, pressure: 'flat', wobble: 0.2 }); S.cel([[2, -12], [28, -14], [34, -4], [26, 2], [4, 2]], MI.magD, { depth: 3, line: 2.8, hi: false, rim: null }); } },
      legN: { box: [-40, -50, 4, 4], pivot: [-10, -44], draw(S) { S.line([[-10, -44], [-14, -12]], { w: 5.6, color: MI.hatch, taper: 0.05, pressure: 'flat', wobble: 0.2 }); S.cel([[-34, -12], [-4, -14], [2, -4], [-4, 2], [-32, 2], [-38, -6]], MI.mag, { depth: 4, line: 3, hi: true, hiW: 1.4, rim: S.c.rim }); } },
      list: {
        box: [-6, -86, 60, 6], pivot: [22, -78],
        draw(S) {
          S.cel({ poly: [[10, -78], [40, -80], [44, -12], [38, 0], [30, -6], [20, 0], [12, -10]] }, MI.skin, { depth: 5, line: 3, hi: true, hiW: 1.2, rim: S.c.rim, tension: 0.2 });
          for (let i = 0; i < 7; i++) tk.inkPath(S.g, [[14, -70 + i * 9], [14 + 18 * (0.5 + 0.5 * tk.vary('lst', 'w' + i)), -70 + i * 9 + 1]], { w: 1.6, color: MI.hatch, alpha: 0.8, taper: 0.1, pressure: 'flat', wobble: 0.3, seed: i });
          [[34, -66], [34, -48], [34, -30]].forEach((c, i) => { tk.inkPath(S.g, [[c[0] - 3, c[1] - 3], [c[0] + 3, c[1] + 3]], { w: 2.2, color: MI.mag, taper: 0.2 }); tk.inkPath(S.g, [[c[0] + 3, c[1] - 3], [c[0] - 3, c[1] + 3]], { w: 2.2, color: MI.mag, taper: 0.2 }); });
        },
      },
      body: {
        box: [-38, -112, 44, -36], pivot: [2, -76],
        draw(S) {
          S.cel(E(2, -76, 28, 32, 14), MI.skin, { depth: 14, hi: true, hiW: 2, rim: S.c.rim, halftone: false, decor(g) { penHatch(g, 6, -100, 36, -50, 6, 0.7); g.fillStyle = MI.mag; g.globalAlpha = 0.9; g.beginPath(); g.moveTo(-26, -66); g.lineTo(30, -70); g.lineTo(30, -60); g.lineTo(-26, -56); g.fill(); g.globalAlpha = 1; } });
          S.cel(E(-8, -84, 5.6, 5.6, 8), MI.gold, { depth: 1.5, line: 2.4, hi: false, rim: null });
        },
      },
      armF: { box: [-4, -110, 46, -60], pivot: [20, -96], draw(S) { S.line([[20, -96], [34, -80], [30, -68]], { w: 5, color: MI.hatch, taper: 0.05, pressure: 'flat', wobble: 0.2 }); S.cel(E(30, -66, 6.4, 6, 10), MI.skin, { depth: 2, line: 2.6, hi: false, rim: null }); } },
      armN: { box: [-56, -110, 2, -60], pivot: [-16, -94], draw(S) { S.line([[-16, -94], [-32, -84], [-42, -88]], { w: 6, color: MI.hatch, taper: 0.05, pressure: 'flat', wobble: 0.2 }); } },
      hand: { box: [-16, -14, 16, 16], pivot: [0, 0], draw(S) { S.cel(E(0, 0, 8, 7.4, 10), MI.skin, { depth: 2, line: 2.6, hi: false, rim: S.c.rim }); [[-5, -3], [0, -6], [5, -3]].forEach((f) => S.line([[f[0], f[1]], [f[0] - 2, f[1] - 4]], { w: 2.4, color: MI.skin, taper: 0.3 })); } },
      quill: {
        box: [-30, -128, 30, 24], pivot: [0, 0],
        draw(S) {
          S.cel([[0, -118, 1], [-16, -96], [-20, -60], [-12, -24], [0, -8, 1], [10, -26], [16, -60], [12, -98]], MI.quill, { depth: 8, line: 3, tension: 0.7, hi: true, hiW: 1.6, rim: '#c9b0ff', halftone: { d: 4, alpha: 0.25 }, decor(g) { for (let i = 0; i < 7; i++) tk.inkPath(g, [[0, -14 - i * 14], [-16 + (i % 2) * 2, -22 - i * 14], [-20, -30 - i * 14]], { w: 1.2, color: MI.vane, alpha: 0.9, taper: 0.3 }); tk.inkPath(g, [[0, -10], [0, -112]], { w: 2, color: '#e8dcc8', taper: 0.1 }); } });
          S.cel(cap(0, 24, 0, 2, 5, 4), '#e8dcc8', { depth: 1.5, line: 2.4, hi: false, rim: null, tension: 0.5 });
          S.cel([[-4, 22, 1], [0, 34, 1], [4, 22, 1]], MI.gold, { depth: 1, line: 2, tension: 0, hi: false, rim: null, shadow: false });
        },
      },
      hornF: { box: [10, -184, 48, -140], pivot: [22, -150], draw(S) { S.cel([[14, -150, 1], [24, -172], [40, -182, 1], [36, -160], [30, -146, 1]], MI.magD, { depth: 4, line: 3, tension: 0.4, hi: false, rim: null }); } },
      hornN: { box: [-50, -184, -10, -140], pivot: [-24, -152], draw(S) { S.cel([[-40, -148, 1], [-42, -170], [-36, -182, 1], [-22, -162], [-14, -148, 1]], MI.mag, { depth: 5, line: 3, tension: 0.4, hi: true, hiW: 1.4, rim: S.c.rim }); } },
      head: {
        box: [-62, -176, 52, -88], pivot: [-6, -100],
        draw(S) {
          S.cel([[-46, -140, 1], [-66, -146], [-72, -134, 1], [-56, -126]], MI.skin, { depth: 3, line: 3, tension: 0.4, hi: false, rim: null });
          S.cel([[30, -138, 1], [50, -146], [54, -132, 1], [40, -124]], MI.skin, { depth: 3, line: 3, tension: 0.4, hi: false, rim: null });
          S.cel(E(-6, -128, 46, 42, 18), MI.skin, { depth: 16, hi: true, hiW: 2.8, rim: S.c.rim, decor(g) { penHatch(g, 6, -166, 46, -90, 6, 0.55); } });
          // a shock of ink spikes for hair
          [[-26, -168, -34, -184], [-6, -172, -4, -190], [14, -168, 24, -184]].forEach((h, i) => S.line([[h[0], h[1]], [(h[0] + h[2]) / 2 + 3, (h[1] + h[3]) / 2], [h[2], h[3]]], { w: 4, color: MI.hatch, taper: 0.5, wobble: 0.2, seed: i }));
          tk.blush(S.g, -38, -110, 13, { color: MI.magL, alpha: 0.55, hatch: true });
          tk.blush(S.g, 26, -110, 12, { color: MI.magL, alpha: 0.5, hatch: true });
          // brows and a grin full of teeth
          tk.brow(S.g, -26, -150, 22, { side: -1, tilt: 0.55, thick: 3.4, seed: 2 });
          tk.brow(S.g, 12, -150, 20, { side: 1, tilt: 0.55, thick: 3.2, seed: 5 });
          tk.mouth(S.g, -10, -104, 40, 'grin', { lineW: 2.6, inner: '#6a0a3a', tongue: MI.magL });
        },
      },
    },
    chains: {
      tail: {
        spine: [[26, -60], [52, -68], [64, -94], [52, -120]], cuts: [0.5], reach: 34, overlap: 4,
        draw(S) {
          S.rib([[26, -60], [52, -68], [64, -94], [52, -118]], MI.hatch, { wMax: 6, w0: 6, w1: 4, tipPow: 1, profile: () => 1, shadow: false, rim: false, line: 0, gloss: false, strands: 0 });
          S.cel([[52, -116, 1], [40, -130, 1], [52, -142, 1], [60, -128, 1]], MI.mag, { depth: 3, line: 2.8, tension: 0, hi: false, rim: S.c.rim });
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die, atk = E0.pose === 'attack', p = atk ? E0.p : 0;
      const strike = atk ? E0.strike : 0, wind = atk ? E0.wind : 0;
      const hopP = (t / 0.9) % 1, hop = Math.abs(sin(PI * hopP)) * 8 * m * (1 - tele) * (1 - guard);
      const hot = clamp(tele + buff + strike, 0, 1);
      const dx = -strike * 36 + hurt * 16 + 3 * tele + wind * 6, dy = -hop + 3 * guard + (hurt ? -4 * hurt : 0);
      const rot = 0.03 * sin(t * 3.4) * m + 0.05 * tele + 0.16 * hurt - 0.1 * strike;
      // the quill: it doodles at idle, is hoisted with a fat ink bead on the wind-up, and stabs on the strike
      let qx = -46 + 7 * sin(t * 5.2) * m, qy = -90 + 6 * sin(t * 6.1 + 1) * m, QR = 0.45 + 0.25 * sin(t * 5.2) * m;
      if (atk) { const k = sm(p / 0.3); qx += 12 * k - 48 * strike; qy += -34 * k + 38 * strike; QR = 0.45 + 1.6 * k - 1.1 * strike; }
      else if (E0.pose === 'telegraph') { qx += 20 * tele + 2 * E0.shake; qy += -46 * tele; QR = 0.45 + 1.7 * tele; }
      else if (E0.pose === 'buff') { qx += -20 * buff * cos(E0.buffP * TAU * 2); qy += -14 * buff * sin(E0.buffP * TAU * 2); QR += 0.5 * sin(E0.buffP * TAU * 2); }
      else if (E0.pose === 'block') { qx += 34 * guard; qy += 10 * guard; QR += 0.5 * guard; }
      else if (E0.pose === 'hurt') { qx += 16 * hurt; QR += 0.6 * hurt; }
      // the writing tip is 34 px below the grip along the quill
      const nibW = [qx - sin(QR) * 34 * 1.25, qy + cos(QR) * 34 * 1.25];
      ctx.save();
      xform(ctx, 0, -50, dx, dy, rot, 1 - 0.05 * die, 1 - 0.05 * die);
      putChain(ctx, st, 'tail', [0.2 * sin(t * 3.2) * m + 0.2 * tele - 0.3 * hurt, 0.3 * sin(t * 3.2 - 1) * m]);
      put(ctx, st, 'legF', { r: 0.2 * sin(TAU * t / 0.9) * m });
      put(ctx, st, 'armF', { r: 0.1 * sin(t * 3) * m - 0.2 * guard });
      put(ctx, st, 'body', { sy: 1 + 0.02 * sin(TAU * t / 0.9) * m, sx: 1 - 0.015 * sin(TAU * t / 0.9) * m });
      put(ctx, st, 'legN', { r: -0.2 * sin(TAU * t / 0.9) * m });
      put(ctx, st, 'list', { r: 0.1 * sin(t * 2.7) * m + 0.2 * hurt, sx: 1 + 0.9 * guard, sy: 1 + 0.5 * guard, x: -14 * guard, y: -10 * guard });
      put(ctx, st, 'armN', { r: (E0.pose === 'telegraph' ? -0.7 * tele : 0) + (atk ? -0.5 * sm(p / 0.3) + 0.9 * strike : 0) + 0.06 * sin(t * 5) * m });
      put(ctx, st, 'quill', { x: qx, y: qy, r: QR, sx: 1.25, sy: 1.25 });
      put(ctx, st, 'hand', { x: qx + 2, y: qy + 20, r: 0 });
      put(ctx, st, 'hornF', { r: 0.1 * sin(t * 3.3) * m + 0.2 * hot });
      put(ctx, st, 'hornN', { r: -0.1 * sin(t * 3.3 + 1) * m - 0.2 * hot });
      put(ctx, st, 'head', {
        r: 0.03 * sin(t * 2.2) * m - 0.06 * strike + 0.12 * hurt + 0.05 * tele, y: 2 * tele,
        kids(c) {
          const ob = blink(t, 'imp', 3.3) * (1 - 0.5 * hurt);
          const lk = [-0.6 + 0.4 * sin(t * 0.8), 0.1 * m];
          eyeLive(c, -26, -130, 10.5, 12.5, { open: ob, iris: [MI.magD, MI.magL], sclera: '#ffffff', pupil: 'round', glow: MI.mag, glowK: 0.3 + 0.5 * hot, glowR: 2.2, lw: 2.8, look: lk, rot: 0.05, lidTop: 0.16 + 0.24 * hot, pupilColor: '#3a0a2a' });
          eyeLive(c, 12, -130, 9.6, 11.6, { open: ob, iris: [MI.magD, MI.magL], sclera: '#ffffff', pupil: 'round', glow: MI.mag, glowK: 0.3 + 0.5 * hot, glowR: 2.2, lw: 2.8, look: lk, rot: -0.05, lidTop: 0.16 + 0.24 * hot, pupilColor: '#3a0a2a' });
        },
      });
      // the magenta ink bead at the nib and the scribble it leaves in the air
      const bead = 3 + 6 * tele + 3 * wind;
      tk.glow(ctx, nibW[0], nibW[1], 14 + 14 * hot, MI.mag, 0.4 + 0.4 * hot);
      ctx.beginPath(); ctx.arc(nibW[0], nibW[1] + 2, bead, 0, TAU); ctx.fillStyle = MI.mag; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = MI.hatch; ctx.stroke();
      if (!die) {
        const trail = [];
        for (let k = 0; k < 9; k++) { const tt = t - k * 0.05; trail.push([nibW[0] + (sin(tt * 11) * 8 + k * 3) * m - (k ? 0 : 0), nibW[1] + cos(tt * 13) * 6 * m + k * (atk ? 2 : 0)]); }
        for (let k = 0; k < trail.length - 1; k++) { const f = 1 - k / trail.length; ctx.save(); ctx.globalAlpha = cA(f * f * (0.5 + 0.4 * hot)); tk.inkPath(ctx, [trail[k], [(trail[k][0] + trail[k + 1][0]) / 2, (trail[k][1] + trail[k + 1][1]) / 2 + 2], trail[k + 1]], { w: 3.4 * f + 0.8, color: MI.mag, taper: 0.3, pressure: 'flat', wobble: 0.2 }); ctx.restore(); }
      }
      ctx.restore();
      // a doodle sketching itself in the air: a small imp outline scribbled in on a buff (the friend it calls)
      if (buff > 0.03) {
        const u = E0.buffP;
        ctx.save(); ctx.translate(-118 + dx, -110); ctx.globalAlpha = cA(buff * 1.4);
        tk.inkPath(ctx, E(0, 0, 18 * (0.5 + 0.5 * u), 16 * (0.5 + 0.5 * u), 14), { closed: true, w: 3, color: MI.mag, align: 0, wobble: 0.3 });
        tk.inkPath(ctx, [[-14 * u, -18 * u], [-8 * u, -30 * u], [-2 * u, -18 * u]], { w: 2.6, color: MI.mag, taper: 0.3 });
        tk.inkPath(ctx, [[14 * u, -18 * u], [8 * u, -30 * u], [2 * u, -18 * u]], { w: 2.6, color: MI.mag, taper: 0.3 });
        tk.sparkle(ctx, 22, -22, 6, { color: '#ffffff' });
        ctx.restore();
      }
      if (atk && p > 0.42 && p < 0.85) {
        const u = (p - 0.42) / 0.43;
        ctx.save(); ctx.globalAlpha = 1 - u;
        for (let i = 0; i < 3; i++) { const pts = []; for (let k = 0; k < 9; k++) pts.push([-96 + dx - k * 9 - i * 8, -98 + i * 16 + (k % 2 ? 9 : -9) * (1 - u)]); tk.inkPath(ctx, pts, { w: 3, color: i === 1 ? '#ffffff' : MI.mag, taper: 0.2, pressure: 'flat', wobble: 0.1 }); }
        ctx.restore();
      }
      if (die > 0) {
        // the strike-through: two fat pen strokes cross it out before it goes
        const u = clamp(die * 1.6, 0, 1);
        ctx.save(); ctx.globalAlpha = cA(1 - clamp((die - 0.7) / 0.3, 0, 1));
        tk.inkPath(ctx, [[-60 + dx, -150], [60 + dx, -20 - 130 * (1 - u)]], { w: 9, color: MI.mag, taper: 0.1, pressure: 'flat', wobble: 0.15 });
        if (u > 0.5) tk.inkPath(ctx, [[60 + dx, -150], [-60 + dx, -20 - 130 * (1 - clamp((u - 0.5) * 2, 0, 1))]], { w: 9, color: MI.mag, taper: 0.1, pressure: 'flat', wobble: 0.15 });
        ctx.restore();
      }
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // CENSOR GOLEM (elite, l): built by the Blank to approve nothing. An iron filing-cabinet of a body with brass handles and a black censor bar across
  // the drawers, a visor-slit lamp for a head crowned with a row of little rubber stamps, brass epaulettes, wax seals swinging at the hip, one arm that
  // is a rubber stamp the size of a door (DENIED, back to front) and one that is an ink pad. Steam vents, a scanning red eye, papers spilling out.
  // Accent: the red scanner light and the red stamp face.
  // ---------------------------------------------------------------------------------------------------------------
  const CG = { iron: '#4d5273', ironL: '#6d739c', ironD: '#33375a', brass: '#e2ae4c', brassD: '#a06f20', black: '#0b0916', red: '#ff3a4a', redD: '#9a1226', wood: '#9a6a34', woodD: '#5a3a1a', paper: '#fff8f0' };
  function rivet(S, x, y, r) { S.cel(E(x, y, r || 3, r || 3, 8), CG.brass, { depth: 1, line: 1.6, hi: false, rim: null, shadow: false }); }
  define('censor_golem', {
    size: 'l', lw: 3.5,
    col: { rim: '#ff9aa4', shT: 0.42 },
    bounds: { w: 260, h: 275, head: { x: -6, y: -256 }, body: { x: 0, y: -130 }, feet: { x: 0, y: 0 } },
    die: { box: [-170, -276, 130, 4], nx: 12, ny: 15, from: 'top', order: 0.5, shape: 'paper', kinds: ['scrap', 'shard', 'scrap', 'ember'], cols: ['#fff8f0', '#4d5273', '#efe0bc', '#ff3a4a'], wind: [-10, -6], size: 12, thin: 0.25, life: 0.6 },
    parts: {
      legF: { box: [-2, -76, 88, 4], pivot: [36, -70], draw(S) { S.cel({ poly: [[8, -72], [64, -72], [66, -20], [6, -20]] }, CG.ironD, { depth: 8, hi: false, rim: null, halftone: { d: 5, alpha: 0.3 } }); S.cel({ poly: [[-2, -22], [76, -22], [82, -6], [76, 0], [-2, 0]] }, CG.brassD, { depth: 4, hi: false, rim: null }); rivet(S, 20, -52); rivet(S, 52, -52); } },
      legN: { box: [-90, -76, 6, 4], pivot: [-34, -70], draw(S) { S.cel({ poly: [[-64, -72], [-6, -72], [-4, -20], [-62, -20]] }, CG.iron, { depth: 9, hi: true, hiW: 2, rim: S.c.rim, halftone: { d: 5, alpha: 0.28 } }); S.cel({ poly: [[-84, -22], [0, -22], [4, -6], [-2, 0], [-82, 0], [-88, -8]] }, CG.brass, { depth: 4, hi: true, hiW: 1.4, rim: '#fff0b0' }); rivet(S, -50, -52); rivet(S, -20, -52); } },
      armS: {
        box: [-132, -212, -62, -76], pivot: [-88, -188],
        draw(S) {
          S.cel(cap(-90, -190, -96, -130, 32, 28), CG.iron, { depth: 8, hi: true, hiW: 2, rim: S.c.rim, halftone: { d: 5, alpha: 0.28 } });
          S.cel(cap(-96, -130, -100, -92, 30, 26), CG.ironL, { depth: 7, hi: true, hiW: 2, rim: S.c.rim });
          rivet(S, -92, -160, 3.4); rivet(S, -98, -112, 3.2);
          S.cel({ poly: [[-116, -140], [-82, -142], [-82, -128], [-116, -126]] }, CG.brass, { depth: 3, line: 2.8, hi: true, hiW: 1.2, rim: '#fff0b0' });
        },
      },
      armF: {
        box: [30, -216, 150, -60], pivot: [88, -188],
        draw(S) {
          S.cel(cap(88, -188, 104, -140, 30, 26), CG.ironD, { depth: 7, hi: false, rim: null, halftone: { d: 5, alpha: 0.3 } });
          // the ink pad: a black tray of crimson ink for a fist
          S.cel({ poly: [[84, -140], [136, -138], [140, -96], [88, -92]] }, CG.black, { depth: 6, line: 3.4, hi: false, rim: S.c.rim, shadow: '#1a1430', decor(g) { g.fillStyle = CG.redD; g.beginPath(); g.moveTo(90, -134); g.lineTo(130, -132); g.lineTo(132, -108); g.lineTo(92, -106); g.fill(); g.fillStyle = 'rgba(255,90,100,0.5)'; g.fillRect(96, -128, 24, 4); } });
          rivet(S, 90, -136); rivet(S, 134, -134);
          S.ell(100, -88, 5, 9, CG.redD, { line: 0, depth: 1, hi: false, rim: null, shadow: false });
        },
      },
      torso: {
        box: [-108, -216, 108, -60], pivot: [0, -130],
        draw(S) {
          S.cel({ poly: [[-92, -204], [86, -208], [98, -72], [-82, -68]] }, CG.iron, {
            depth: 22, hi: true, hiW: 3, rim: S.c.rim, halftone: { d: 5, alpha: 0.3 },
            decor(g) {
              // three drawers with brass pulls and label cards, the middle one under the censor bar
              [[-198, 0], [-160, 1], [-122, 2]].forEach((dr, i) => {
                const y = dr[0], sk = dr[1];
                g.fillStyle = i === 1 ? '#3d4262' : '#575c82'; g.fillRect(-84 + sk * 2, y + 3, 172, 32);
                tk.inkPath(g, [[-84 + sk * 2, y + 3], [88 + sk * 2, y + 3], [88 + sk * 2, y + 35], [-84 + sk * 2, y + 35], [-84 + sk * 2, y + 3]], { w: 2.4, color: pal.ink, taper: 0.02, pressure: 'flat', wobble: 0.02 });
                g.fillStyle = CG.brass; g.fillRect(-14 + sk * 2, y + 22, 28, 6); tk.inkPath(g, [[-14 + sk * 2, y + 25], [14 + sk * 2, y + 25]], { w: 1.2, color: CG.brassD, taper: 0.1, pressure: 'flat' });
                g.fillStyle = CG.paper; g.fillRect(-62 + sk * 2, y + 10, 30, 14); tk.inkPath(g, [[-59 + sk * 2, y + 14], [-36 + sk * 2, y + 14]], { w: 1.2, color: '#8a7aa0', taper: 0.1, pressure: 'flat' }); tk.inkPath(g, [[-59 + sk * 2, y + 19], [-44 + sk * 2, y + 19]], { w: 1.2, color: '#8a7aa0', taper: 0.1, pressure: 'flat' });
                g.strokeStyle = CG.red; g.lineWidth = 2; g.beginPath(); g.moveTo(-50 + sk * 2, y + 11); g.lineTo(-40 + sk * 2, y + 23); g.moveTo(-40 + sk * 2, y + 11); g.lineTo(-50 + sk * 2, y + 23); g.stroke();
              });
            },
          });
          rivet(S, -80, -196); rivet(S, 80, -200); rivet(S, -74, -78); rivet(S, 90, -80);
          // the censor bar
          S.cel({ poly: [[-96, -166], [94, -170], [94, -142], [-96, -138]] }, CG.black, { depth: 3, line: 3.2, hi: false, rim: '#ff9aa4', rimW: 1.4, shadow: '#1a1430' });
          S.cel({ poly: [[-96, -70], [-4, -70], [-4, -58], [-96, -58]] }, CG.brassD, { depth: 1, line: 0, hi: false, rim: null, shadow: false });
        },
      },
      epaulet: {
        box: [-120, -224, 120, -170], pivot: [0, -190],
        draw(S) {
          [[-98, -192], [98, -196]].forEach((e, i) => {
            S.cel([[e[0] - 24, e[1] + 4], [e[0] - 20, e[1] - 20], [e[0], e[1] - 28], [e[0] + 20, e[1] - 20], [e[0] + 24, e[1] + 4]], CG.brass, { depth: 6, line: 3.2, tension: 0.7, hi: true, hiW: 2, rim: '#fff0b0' });
            for (let k = 0; k < 4; k++) tk.inkPath(S.g, [[e[0] - 18 + k * 12, e[1] + 2], [e[0] - 16 + k * 12, e[1] - 18]], { w: 1.6, color: CG.brassD, alpha: 0.9, taper: 0.3 });
            rivet(S, e[0], e[1] - 12, 4);
          });
        },
      },
      seal: {
        box: [-16, -6, 16, 62], pivot: [0, 0],
        draw(S) { S.line([[0, 0], [0, 16]], { w: 2, color: pal.ink, taper: 0.05, pressure: 'flat', wobble: 0 }); S.cel(E(0, 26, 11, 11, 12), CG.red, { depth: 4, line: 2.6, hi: true, hiW: 1.4, rim: '#ffb0a0' }); S.line([[-5, 26], [5, 26]], { w: 1.8, color: '#ffe8e0', taper: 0.1, pressure: 'flat' }); S.line([[0, 21], [0, 31]], { w: 1.8, color: '#ffe8e0', taper: 0.1, pressure: 'flat' }); S.cel([[-6, 36, 1], [-9, 58, 1], [-1, 52, 1], [0, 38, 1]], CG.red, { depth: 1, line: 2, tension: 0, hi: false, rim: null, shadow: false }); S.cel([[6, 36, 1], [9, 58, 1], [1, 52, 1], [0, 38, 1]], CG.redD, { depth: 1, line: 2, tension: 0, hi: false, rim: null, shadow: false }); },
      },
      head: {
        box: [-52, -290, 52, -196], pivot: [-2, -204],
        draw(S) {
          // a crown of little rubber stamps, then the square lamp of a head with its visor slit
          [[-32, 0], [-16, 1], [0, 2], [16, 1], [32, 0]].forEach((c, i) => {
            const h = 22 + (i === 2 ? 10 : 0);
            S.cel({ poly: [[c[0] - 5, -246], [c[0] + 5, -246], [c[0] + 5, -246 - h + 8], [c[0] - 5, -246 - h + 8]] }, CG.wood, { depth: 2, line: 2.2, hi: false, rim: null });
            S.cel(E(c[0], -246 - h + 6, 6.6, 6.6, 8), CG.wood, { depth: 3, line: 2.4, hi: true, hiW: 1, rim: '#e0b070' });
            S.cel({ poly: [[c[0] - 8, -246], [c[0] + 8, -246], [c[0] + 8, -240], [c[0] - 8, -240]] }, CG.brass, { depth: 1, line: 1.8, hi: false, rim: null, shadow: false });
          });
          S.cel({ poly: [[-40, -242], [36, -244], [40, -208], [-44, -206]] }, CG.iron, { depth: 12, line: 3.4, hi: true, hiW: 2.4, rim: S.c.rim, halftone: { d: 5, alpha: 0.28 } });
          S.cel({ poly: [[-34, -232], [30, -234], [32, -216], [-38, -214]] }, CG.black, { depth: 2, line: 2.8, hi: false, rim: null, shadow: false });
          rivet(S, -34, -240); rivet(S, 32, -242); rivet(S, -38, -210); rivet(S, 36, -212);
          S.cel(E(-46, -226, 5, 7, 8), CG.brass, { depth: 2, line: 2, hi: false, rim: null }); S.cel(E(44, -228, 5, 7, 8), CG.brassD, { depth: 2, line: 2, hi: false, rim: null });
        },
      },
      stamp: {
        box: [-64, -70, 64, 78], pivot: [0, 0],
        draw(S) {
          // the great rubber stamp: a wooden knob handle and a big base with DENIED cut backwards into its face
          S.cel(cap(0, 4, 0, -30, 18, 14), CG.wood, { depth: 5, line: 3, hi: true, hiW: 1.6, rim: '#e0b070', tension: 0.5 });
          S.cel(E(0, -44, 26, 22, 14), CG.wood, { depth: 8, line: 3.4, hi: true, hiW: 2, rim: '#e0b070' });
          S.cel({ poly: [[-40, 6], [40, 6], [44, 18], [-44, 18]] }, CG.brass, { depth: 3, line: 3, hi: true, hiW: 1.4, rim: '#fff0b0' });
          S.cel({ poly: [[-46, 18], [46, 18], [48, 68], [-48, 68]] }, CG.black, {
            depth: 6, line: 3.4, hi: false, rim: '#ff9aa4', rimW: 1.6, shadow: '#1a1430',
            decor(g) {
              g.save(); g.translate(0, 44); g.scale(-1, 1); g.fillStyle = CG.red; g.font = '900 24px ' + tk.font.num; g.textAlign = 'center'; g.textBaseline = 'middle';
              g.fillText('DENIED', 0, 0); g.restore();
              g.fillStyle = 'rgba(255,58,74,0.35)'; g.fillRect(-46, 62, 92, 6);
            },
          });
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die, atk = E0.pose === 'attack', p = atk ? E0.p : 0;
      const strike = atk ? E0.strike : 0, wind = atk ? E0.wind : 0, br = sin(TAU * t / 3.8) * m;
      const hot = clamp(tele + buff + strike + guard * 0.6 + st.wound * 0.4, 0, 1);
      const dx = -strike * 20 + hurt * 12 + E0.shake * 1.3 + 5 * tele, dy = 3 * tele + 4 * guard + 8 * die;
      const rot = -0.05 * tele + 0.045 * strike + 0.08 * hurt + 0.008 * br;
      // the stamp arm: heavy and slow, over the head on the wind-up, a smash on the strike, up in front on a block
      let aS = 0.05 * br, aI = -0.05 * br;
      if (atk) { if (p < 0.3) { const k = sm(p / 0.3); aS = lerp(0, 2.5, k); aI = lerp(0, 2.2, k); } else if (p < 0.5) { const k = ease.inCubic((p - 0.3) / 0.2); aS = lerp(2.5, -0.1, k); aI = lerp(2.2, 0, k); } else { const k = sm((p - 0.5) / 0.5); aS = lerp(-0.1, 0.05 * br, k); aI = lerp(0, 0, k); } }
      else if (E0.pose === 'telegraph') { aS = 2.5 * tele + 0.03 * E0.shake; aI = 2.2 * tele; }
      else if (E0.pose === 'block') { aS = 1.3 * guard; aI = 0.6 * guard; }
      else if (E0.pose === 'buff') { aS = 0.6 * buff; aI = 0.4 * buff; }
      else if (E0.pose === 'hurt') { aS = 0.5 * hurt; aI = 0.3 * hurt; }
      else if (die > 0) { aS = 0.5 * die; aI = 0.3 * die; }
      // steam whistling from the shoulder vents
      const steamK = 0.4 + 0.6 * hot;
      puffs(ctx, -98 + dx, -218 + dy, t, 4, 101, { col: '#f0e8ff', rise: 50, spread: 8, size: 6 + 4 * hot, life: 1.3 - 0.4 * hot, alpha: 0.5 * steamK * (1 - die), dx: -8 });
      puffs(ctx, 98 + dx, -222 + dy, t, 4, 102, { col: '#f0e8ff', rise: 50, spread: 8, size: 6 + 4 * hot, life: 1.3 - 0.4 * hot, alpha: 0.5 * steamK * (1 - die), dx: 8 });
      ctx.save();
      if (die > 0) ctx.transform(1 + 0.2 * die, 0, 0, 1 - 0.3 * die, -8 * die, 0);
      xform(ctx, 0, -70, dx, dy, rot, 1, 1);
      put(ctx, st, 'legF', { r: 0.015 * br });
      put(ctx, st, 'armF', { r: aI });
      put(ctx, st, 'torso', { sy: 1 + 0.012 * br - 0.02 * tele + 0.01 * guard, sx: 1 + 0.006 * br });
      // the censor bar carries a red scanning light
      {
        const sx = -80 + 160 * (0.5 + 0.5 * sin(t * 1.3)) * (1 - 0.6 * tele);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; tk.glow(ctx, sx, -155, 30 + 12 * hot, CG.red, 0.55 + 0.4 * hot); ctx.restore();
        ctx.fillStyle = hot > 0.4 ? '#ffd0d0' : CG.red; ctx.globalAlpha = 0.9; ctx.fillRect(sx - 14, -157, 28, 4); ctx.globalAlpha = 1;
        if (hot > 0.3) { ctx.fillStyle = CG.red; ctx.globalAlpha = 0.35 * hot; ctx.fillRect(-94, -167, 186, 26); ctx.globalAlpha = 1; }
      }
      put(ctx, st, 'legN', { r: -0.015 * br });
      put(ctx, st, 'epaulet', { sy: 1 + 0.01 * br, r: 0.01 * br });
      [[-78, -78], [70, -82]].forEach((s0, i) => put(ctx, st, 'seal', { x: s0[0], y: s0[1], r: 0.25 * sin(t * 2.2 + i * 2) * m + 0.4 * hurt * (i ? 1 : -1) + 0.2 * strike, sy: 1 }));
      // the stamp arm: a plated arm on the shoulder and the stamp riding the fist with its face turned to the front
      put(ctx, st, 'armS', {
        r: aS,
        kids(c) { put(c, st, 'stamp', { x: -104, y: -96, r: -aS * 0.7 + 0.1 * br - 0.25 * guard, sx: 1 + 0.06 * hot, sy: 1 + 0.06 * hot }); },
      });
      if (hot > 0.2) tk.glow(ctx, -104 - aS * 14, -60 - aS * 30, 46 + 20 * hot, CG.red, 0.35 * hot);
      put(ctx, st, 'head', {
        r: 0.02 * sin(t * 0.9) * m - 0.05 * tele + 0.05 * strike + 0.1 * hurt, y: 2 * tele,
        kids(c) {
          // the visor slit: a red eye that sweeps left and right, flares and narrows
          const sweep = -6 + 12 * (0.5 + 0.5 * sin(t * 1.1)) * (1 - 0.7 * hot), th = 3.4 + 3.4 * hot, ob = blink(t, 'censor', 5.4);
          tk.glow(c, sweep, -224, 30 + 16 * hot, CG.red, 0.5 + 0.4 * hot);
          c.fillStyle = hot > 0.4 ? '#ffe0d0' : CG.red; c.fillRect(sweep - 18, -224 - th * ob / 2, 36, Math.max(0.8, th * ob));
        },
      });
      ctx.restore();
      if (atk && p > 0.5 && p < 0.9) {
        const u = (p - 0.5) / 0.4;
        ctx.save(); ctx.globalAlpha = (1 - u) * 0.9; ctx.translate(-150 + dx, -40); ctx.scale(1, 0.35); ctx.strokeStyle = CG.red; ctx.lineWidth = 6 * (1 - u) + 1; ctx.beginPath(); ctx.arc(0, 0, 30 + 90 * u, 0, TAU); ctx.stroke(); ctx.restore();
        sparks(ctx, -140 + dx, -30, u, 8, 103, { col: '#ff5a6a', speed: 70, size: 8, spread: 2.4, dir: -PI / 2, life: 1, alpha: 1 - u });
      }
      if (die > 0.15) {
        // the hanko that ends it: a big red seal stamped on the chest
        const u = clamp((die - 0.15) / 0.3, 0, 1);
        ctx.save(); ctx.globalAlpha = cA(u * (1 - clamp((die - 0.75) / 0.25, 0, 1)) * 0.95); ctx.translate(0, -130); ctx.scale(2 - u, 2 - u); ctx.rotate(-0.2);
        ctx.strokeStyle = CG.red; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(0, 0, 46, 0, TAU); ctx.stroke();
        ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(-28, -28); ctx.lineTo(28, 28); ctx.moveTo(28, -28); ctx.lineTo(-28, 28); ctx.stroke(); ctx.restore();
      }
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // STORM DRAGON WHELP (elite, l): a chubby young storm dragon still growing into its thunder: slate-blue scales and a cream belly, stubby gold horns, a
  // ruff of thundercloud puffs, little bat wings whose veins are lightning, a row of dorsal spikes that crackle and a tail ending in a lightning fin.
  // A pocket thundercloud rides above its head. It gets more excited every time you hit it (more sparks as HP falls). Accent: cyan eyes, yellow static.
  // ---------------------------------------------------------------------------------------------------------------
  const SW = { scale: '#3f5fb0', scaleL: '#6e90e6', scaleD: '#2a3f88', belly: '#fff2d2', horn: '#f8ecb8', wing: '#5a3fa8', bone: '#e8d8a0', volt: '#ffe45e', cyan: '#5ff5ff', cloud: '#dcdcf4', cloudD: '#5a5090' };
  function wingDraw(S, far) {
    const col = far ? '#3d2a78' : SW.wing, fingers = [[-1.25, 96], [-0.72, 104], [-0.22, 86]];
    const tips = fingers.map((f) => [cos(f[0]) * f[1], sin(f[0]) * f[1]]);
    S.cel([[0, 0, 1], [tips[0][0], tips[0][1], 1], [(tips[0][0] + tips[1][0]) / 2 - 8, (tips[0][1] + tips[1][1]) / 2 + 22], [tips[1][0], tips[1][1], 1], [(tips[1][0] + tips[2][0]) / 2 - 8, (tips[1][1] + tips[2][1]) / 2 + 20], [tips[2][0], tips[2][1], 1], [16, 34, 1]], col, {
      depth: 12, tension: 0.35, hi: !far, hiW: 2, rim: far ? null : S.c.rim, halftone: { d: 5, alpha: 0.3 },
      decor(g) { tips.forEach((tp, i) => { const zz = []; for (let k = 0; k <= 5; k++) zz.push([tp[0] * k / 5 + (k % 2 ? 5 : -5) * (k > 0 && k < 5 ? 1 : 0), tp[1] * k / 5 + (k % 2 ? -3 : 3) * (k > 0 && k < 5 ? 1 : 0)]); tk.inkPath(g, zz, { w: 2.6, color: SW.volt, alpha: far ? 0.6 : 0.95, taper: 0.2, pressure: 'flat', wobble: 0 }); }); },
    });
    fingers.forEach((f, i) => S.cel(cap(0, 0, cos(f[0]) * f[1], sin(f[0]) * f[1], 8, 4), SW.bone, { depth: 2, line: 2.6, hi: false, rim: null, tension: 0.5 }));
    S.cel(E(0, 0, 9, 9, 8), SW.bone, { depth: 2, line: 2.6, hi: false, rim: null });
  }
  define('storm_whelp', {
    size: 'l', lw: 3.5,
    col: { rim: '#a8f4ff', shT: 0.42 },
    bounds: { w: 290, h: 276, head: { x: -72, y: -250 }, body: { x: 10, y: -90 }, feet: { x: 0, y: 0 }, right: 160 },
    die: { box: [-170, -280, 160, 6], nx: 13, ny: 15, from: 'out', order: 0.45, shape: 'diamond', kinds: ['spark', 'puff', 'spark', 'shard'], cols: ['#ffe45e', '#dcdcf4', '#5ff5ff', '#3f5fb0'], wind: [0, -12], size: 12, life: 0.6 },
    parts: {
      wingF: { box: [-20, -260, 130, -80], pivot: [22, -130], draw(S) { S.g.save(); S.g.translate(22, -130); wingDraw(S, true); S.g.restore(); } },
      legFF: { box: [-56, -100, 4, 4], pivot: [-6, -90], draw(S) { S.cel(cap(-6, -90, -14, -26, 32, 26), SW.scaleD, { depth: 7, hi: false, rim: null, halftone: { d: 5, alpha: 0.32 } }); S.cel(E(-18, -14, 24, 12, 12), SW.scaleD, { depth: 4, line: 3, hi: false, rim: null }); [-30, -20, -10].forEach((x) => S.cel([[x - 3, -8, 1], [x, 4, 1], [x + 3, -8, 1]], SW.horn, { depth: 1, line: 1.8, tension: 0, hi: false, rim: null, shadow: false })); } },
      body: {
        box: [-70, -168, 96, -30], pivot: [12, -88],
        draw(S) {
          S.cel(E(12, -90, 72, 62, 20, -0.08), SW.scale, {
            depth: 22, hi: true, hiW: 3, rim: S.c.rim, halftone: { d: 5, alpha: 0.32 },
            decor(g) {
              g.fillStyle = SW.belly; g.beginPath(); g.ellipse(-10, -76, 42, 46, 0.1, 0, TAU); g.fill();
              for (let i = 0; i < 5; i++) tk.inkPath(g, [[-50, -104 + i * 14], [-10, -98 + i * 14], [32, -104 + i * 14]], { w: 1.8, color: '#c9b078', alpha: 0.8, taper: 0.3 });
              for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(30 + (i % 3) * 16, -136 + Math.floor(i / 3) * 14, 6, 0.1 * PI, 0.9 * PI); g.lineWidth = 1.8; g.strokeStyle = SW.scaleD; g.stroke(); }
            },
          });
        },
      },
      haunch: {
        box: [10, -110, 100, 4], pivot: [52, -62],
        draw(S) {
          S.cel(E(52, -62, 36, 42, 14, -0.2), SW.scaleL, { depth: 10, hi: true, hiW: 2.4, rim: S.c.rim, halftone: { d: 5, alpha: 0.28 } });
          S.cel(E(56, -16, 32, 13, 12), SW.scale, { depth: 5, line: 3.2, hi: true, hiW: 1.6, rim: S.c.rim });
          [44, 56, 68].forEach((x) => S.cel([[x - 3, -10, 1], [x + 1, 2, 1], [x + 4, -10, 1]], SW.horn, { depth: 1, line: 1.8, tension: 0, hi: false, rim: null, shadow: false }));
        },
      },
      legFN: {
        box: [-80, -104, -6, 4], pivot: [-32, -90],
        draw(S) {
          S.cel(cap(-32, -90, -44, -26, 36, 28), SW.scale, { depth: 8, hi: true, hiW: 2, rim: S.c.rim, halftone: { d: 5, alpha: 0.28 } });
          S.cel(E(-50, -14, 27, 13, 12), SW.scale, { depth: 5, line: 3.2, hi: true, hiW: 1.6, rim: S.c.rim });
          [-64, -52, -40].forEach((x) => S.cel([[x - 3, -8, 1], [x, 5, 1], [x + 4, -8, 1]], SW.horn, { depth: 1, line: 1.8, tension: 0, hi: false, rim: null, shadow: false }));
        },
      },
      spikes: {
        box: [-40, -214, 100, -110], pivot: [20, -140],
        draw(S) {
          [[-14, -146, -0.5, 26], [10, -152, -0.25, 32], [36, -146, 0, 34], [58, -132, 0.3, 30], [76, -114, 0.6, 24]].forEach((sp) => {
            const x = sp[0], y = sp[1], a = sp[2] - PI / 2, h = sp[3], c = cos(a), s = sin(a), nx = -s, ny = c;
            S.cel([[x - nx * 9, y - ny * 9, 1], [x + c * h, y + s * h, 1], [x + nx * 9, y + ny * 9, 1]], SW.volt, { depth: 4, line: 3, tension: 0, hi: false, rim: '#ffffff', shadow: '#c89a10' });
          });
        },
      },
      wingN: { box: [-20, -260, 130, -80], pivot: [6, -134], draw(S) { S.g.save(); S.g.translate(6, -134); wingDraw(S, false); S.g.restore(); } },
      mane: {
        box: [-100, -220, 6, -100], pivot: [-52, -150],
        draw(S) { [[-34, -172, 22], [-16, -148, 24], [-30, -124, 20], [-58, -196, 18], [-8, -192, 15]].forEach((c, i) => S.ell(c[0], c[1], c[2], c[2] * 0.92, i % 2 ? SW.cloud : '#c4c4e8', { depth: 6, line: 3, hi: false, rim: S.c.rim, halftone: { d: 4, alpha: 0.2, color: '#8a8ac8' } })); },
      },
      jaw: {
        box: [-140, -142, -40, -100], pivot: [-58, -128],
        draw(S) {
          S.cel([[-58, -132], [-92, -130], [-124, -126, 1], [-122, -114], [-88, -110], [-60, -116]], SW.belly, { depth: 6, line: 3.2, tension: 0.5, hi: true, hiW: 1.4, rim: S.c.rim });
          [-112, -96, -80].forEach((x, i) => S.cel([[x - 3, -128, 1], [x + 1, -138 - (i % 2) * 2, 1], [x + 5, -128, 1]], '#ffffff', { depth: 1, line: 1.8, tension: 0, hi: false, rim: null, shadow: false }));
        },
      },
      head: {
        box: [-140, -226, -20, -96], pivot: [-52, -126],
        draw(S) {
          S.cel([[-60, -184, 1], [-56, -208], [-34, -226, 1], [-42, -200], [-44, -180, 1]], SW.horn, { depth: 4, line: 3, tension: 0.4, hi: true, hiW: 1.4, rim: '#ffffff' });
          S.cel([[-84, -186, 1], [-90, -212], [-108, -224, 1], [-100, -202], [-98, -182, 1]], SW.horn, { depth: 4, line: 3, tension: 0.4, hi: true, hiW: 1.4, rim: '#ffffff' });
          S.cel(E(-76, -152, 52, 45, 18), SW.scale, { depth: 16, hi: true, hiW: 2.8, rim: S.c.rim, halftone: { d: 5, alpha: 0.3 } });
          S.cel(E(-112, -140, 26, 20, 14), SW.scaleL, { depth: 7, line: 3.2, hi: true, hiW: 1.6, rim: S.c.rim });
          S.ell(-124, -148, 3.4, 3, '#1a2a60', { line: 1, shadow: false, rim: null });
          S.ell(-112, -150, 3, 2.8, '#1a2a60', { line: 1, shadow: false, rim: null });
          S.cel([[-108, -172], [-84, -178], [-56, -170], [-52, -162], [-80, -164], [-106, -166]], SW.scaleD, { depth: 3, line: 2.6, hi: false, rim: S.c.rim, tension: 0.5 });
          S.line([[-60, -128], [-80, -124]], { w: 2, color: SW.volt, taper: 0.4 });
          [[-118, -126], [-102, -124]].forEach((f) => S.cel([[f[0] - 3, f[1], 1], [f[0] + 1, f[1] + 10, 1], [f[0] + 5, f[1], 1]], '#ffffff', { depth: 1, line: 1.8, tension: 0, hi: false, rim: null, shadow: false }));
        },
      },
      cloudC: {
        box: [-140, -290, -10, -216], pivot: [-76, -240],
        draw(S) { [[-96, -244, 18], [-76, -252, 22], [-54, -244, 17], [-84, -232, 14], [-64, -232, 15]].forEach((c, i) => S.ell(c[0], c[1], c[2], c[2] * 0.84, i % 2 ? '#6a60a8' : SW.cloudD, { depth: 6, line: 2.8, hi: false, rim: '#a8f4ff', rimW: 1.4, halftone: { d: 4, alpha: 0.3 } })); },
      },
    },
    chains: {
      tail: {
        spine: [[68, -70], [102, -58], [126, -90], [118, -128], [92, -142]], cuts: [0.34, 0.68], reach: 50, overlap: 6,
        draw(S) {
          S.rib([[68, -70], [102, -58], [126, -90], [118, -128], [92, -142]], SW.scale, { wMax: 50, w0: 46, w1: 12, tipPow: 1.1, shadow: SW.scaleD, rim: S.c.rim, rimW: 1.6, line: 3.4, halftone: { d: 5, alpha: 0.3 }, decor(g) { g.fillStyle = SW.belly; g.globalAlpha = 0.6; for (let i = 0; i < 5; i++) { const p = along([[68, -70], [102, -58], [126, -90], [118, -128], [92, -142]], 0.1 + i * 0.16); g.beginPath(); g.ellipse(p.x + p.ty * 12, p.y - p.tx * 12, 5, 8, 0, 0, TAU); g.fill(); } g.globalAlpha = 1; } });
          // the lightning fin
          S.cel([[92, -142, 1], [72, -168, 1], [84, -162, 1], [64, -190, 1], [94, -158, 1], [82, -160, 1], [102, -146, 1]], SW.volt, { depth: 4, line: 3, tension: 0, hi: false, rim: '#ffffff', shadow: '#c89a10' });
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die, atk = E0.pose === 'attack', p = atk ? E0.p : 0;
      const strike = atk ? E0.strike : 0, wind = atk ? E0.wind : 0, br = sin(TAU * t / 3.0) * m, fold = clamp(guard + buff * 0.7, 0, 1);
      const hot = clamp(tele + buff + strike + guard * 0.5 + st.wound * 0.6 + die, 0, 1);
      const dx = -strike * 52 + hurt * 16 + E0.shake * 1.2 + 4 * tele, dy = -tele * 6 + 4 * fold - wind * 6 + 6 * die;
      const rot = 0.1 * tele + 0.03 * br - 0.08 * strike + 0.1 * hurt + 0.06 * wind;
      const wr = -0.1 - 0.06 * sin(t * 2.2) * m - 0.6 * tele - 0.4 * wind + 1.5 * fold + 0.4 * hurt + 1.0 * strike;
      const open = 0.07 + 0.05 * sin(t * 2.6) * m + 0.72 * tele + 0.6 * wind * (1 - strike) + 0.8 * strike * (p > 0.45 ? 1 : 0.5) + 0.4 * buff + 0.4 * hurt + 0.5 * die;
      const headR = -0.06 * strike - 0.3 * tele * -1 * 0.5 + 0.06 * sin(t * 1.5) * m + 0.15 * hurt - 0.06 * fold;
      ctx.save();
      xform(ctx, 12, -90, dx, dy, rot, 1 - 0.04 * fold, 1 - 0.04 * fold);
      putChain(ctx, st, 'tail', [0.08 * sin(t * 1.8) * m + 0.2 * tele + 0.25 * fold - 0.2 * strike, 0.16 * sin(t * 1.8 - 0.9) * m + 0.2 * fold, 0.24 * sin(t * 1.8 - 1.8) * m + 0.2 * fold]);
      put(ctx, st, 'wingF', { r: wr * 1.1 - 0.05 });
      put(ctx, st, 'legFF', { r: 0.03 * br + 0.1 * strike });
      put(ctx, st, 'body', { sy: 1 + 0.02 * br - 0.03 * tele, sx: 1 + 0.01 * br });
      put(ctx, st, 'haunch', { r: -0.02 * br });
      put(ctx, st, 'spikes', { sy: 1 + 0.5 * hot, sx: 1 + 0.2 * hot, r: 0.02 * sin(t * 2.4) * m });
      put(ctx, st, 'mane', { r: 0.03 * sin(t * 1.9) * m + headR * 0.6, sx: 1 + 0.06 * hot, sy: 1 + 0.06 * hot });
      put(ctx, st, 'head', {
        r: headR, y: 2 * tele,
        pre(c) {
          if (open > 0.12) {
            const H = [-56, -128], U = [-124, -138], jx = H[0] - 68 * cos(open) + 6 * sin(open), jy = H[1] + 68 * sin(open) + 6 * cos(open);
            c.beginPath(); c.moveTo(H[0], H[1] - 8); c.lineTo(U[0], U[1]); c.lineTo(jx, jy - 3); c.lineTo(H[0], H[1] + 6); c.closePath();
            const gr = c.createLinearGradient(H[0], H[1], U[0], U[1] + 30); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#a8f4ff'); gr.addColorStop(1, '#3a70c0');
            c.fillStyle = gr; c.fill();
            tk.glow(c, -100, -126 + open * 14, 44, SW.cyan, cA(0.3 + 0.6 * clamp(tele + strike + wind, 0, 1)));
          }
          put(c, st, 'jaw', { r: -open });
        },
        kids(c) {
          const ob = blink(t, 'whelp', 4.4) * (1 - 0.4 * hurt);
          eyeLive(c, -88, -154, 12, 10.4, { open: ob, iris: ['#5ff5ff', '#ffffff'], sclera: '#ffffff', pupil: 'slit', pupilColor: '#0a2a6a', glow: SW.cyan, glowK: 0.8 + 0.2 * hot, glowR: 3, lw: 2.8, rot: -0.15, lidTop: 0.28 + 0.24 * hot, look: [-0.5, 0.1] });
          eyeLive(c, -60, -156, 9, 8.4, { open: ob, iris: ['#5ff5ff', '#ffffff'], sclera: '#ffffff', pupil: 'slit', pupilColor: '#0a2a6a', glow: SW.cyan, glowK: 0.6 + 0.2 * hot, glowR: 3, lw: 2.4, rot: -0.15, lidTop: 0.28 + 0.24 * hot, look: [-0.5, 0.1] });
        },
      });
      put(ctx, st, 'legFN', { r: -0.03 * br - 0.9 * strike + 0.3 * wind * (atk ? 1 : 0) });
      put(ctx, st, 'wingN', { r: wr });
      // the pocket thundercloud over its head: it drifts and flashes; the horns arc to each other when it is excited
      {
        const cy = -12 * tele - 4 * sin(t * 1.6) * m;
        put(ctx, st, 'cloudC', { x: 0 + 4 * sin(t * 1.1) * m, y: cy, r: 0.03 * sin(t * 1.3) * m, noFlash: true });
        const fl = flick(t, 4, 7);
        tk.glow(ctx, -76, -232 + cy, 44 + 20 * hot, SW.cyan, 0.18 + 0.4 * (fl > 0.7 ? 1 : 0) + 0.2 * hot);
        if (fl > 0.62 - 0.4 * hot) { ctx.save(); zap(ctx, -76 + 8 * sin(t * 3), -232 + cy, -70, -200, t, { seed: 1, w: 2, jag: 8, n: 5, color: '#a8f4ff', core: '#ffffff' }); ctx.restore(); }
        if (hot > 0.25) { ctx.save(); ctx.globalAlpha = hot; zap(ctx, -46, -212, -100, -216, t, { seed: 5, w: 1.8, jag: 7, n: 5, color: '#ffe45e', core: '#ffffff' }); ctx.restore(); }
      }
      // static crawling over the spikes and haunch, denser the angrier it is
      sparks(ctx, 20, -150, t, 4 + Math.round(8 * hot), 111, { col: SW.volt, speed: 34 + 30 * hot, size: 6, spread: TAU, life: 0.6, alpha: 0.9 });
      if (fold > 0.05) for (let i = 0; i < 6; i++) { const a = t * 6 + i * TAU / 6, r = 130 * (1 - 0.5 * fold * 0.5); ctx.save(); ctx.globalAlpha = fold; ctx.globalCompositeOperation = 'lighter'; tk.glow(ctx, 12 + cos(a) * r * 0.7, -90 + sin(a) * r * 0.5, 12, SW.cyan, 0.9); ctx.restore(); }
      if (tele > 0.05) { const r = 8 + 30 * tele; tk.glow(ctx, -76, -250 - 6 * tele, r * 2.6, '#ffffff', 0.5 * tele); ctx.beginPath(); ctx.arc(-76, -250 - 6 * tele, r * 0.7, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.globalAlpha = tele; ctx.fill(); ctx.globalAlpha = 1; for (let i = 0; i < 5; i++) { const a = t * 6 + i * 1.3; zap(ctx, -76, -250 - 6 * tele, -76 + cos(a) * (r + 30), -250 - 6 * tele + sin(a) * (r + 30), t, { seed: i, w: 1.8, jag: 6, n: 4, color: '#ffe45e', core: '#ffffff' }); } }
      ctx.restore();
      if (atk && p > 0.42 && p < 0.9) {
        const u = clamp((p - 0.42) / 0.48, 0, 1);
        ctx.save(); ctx.globalAlpha = cA(1 - u * u);
        const bx = -128 + dx, by = -132;
        for (let i = 0; i < 3; i++) zap(ctx, bx, by, bx - 150 - 40 * i, by + (i - 1) * 40, t, { seed: i + 30, w: 3.4 - i * 0.6, jag: 16, n: 8, color: '#5fd0ff', core: '#ffffff' });
        tk.glow(ctx, bx - 40, by, 50, '#bffcff', 0.6);
        ctx.restore();
      }
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // BLACK-BAR INQUISITOR (elite, l): the Blank's hanging judge. A tall black robe under an ivory mantle that is more black bar than paper, a pointed
  // capirote hood over a blank white porcelain mask whose mouth has been blacked out with a censor bar (Gag Order), two hard gold slits for eyes, a gavel
  // the size of a mallet and a sentence scroll that unrolls to the floor with its words struck through. Iron chains with open shackles hang from the belt.
  // A halo of loose black bars circles its head and snaps into a cage when it is about to pass sentence. Accent: cold gold eyes and the hot gold gavel.
  // ---------------------------------------------------------------------------------------------------------------
  const BI = { robe: '#241c4c', robeL: '#3d3274', robeD: '#130e2c', paper: '#fff8f0', paperD: '#d8c8e8', bar: '#0b0916', gold: '#ffd24a', goldD: '#b8801c', iron: '#575d86', ironD: '#33375a', wood: '#8a5a2a', woodD: '#4e3014', brass: '#e2ae4c', lilac: '#c9b8ff', skin: '#fdf4e6' };
  function biLink(S, x, y, rot, big) { S.cel(E(x, y, big ? 8 : 6.4, big ? 11 : 9, 10, rot), BI.iron, { depth: 3, line: 2.4, hi: false, rim: S.c.rim, rimW: 1.2, shadow: BI.ironD }); S.ell(x, y, 2.4, 4.4, '#140f2e', { line: 0, hi: false, rim: null, shadow: false }); }
  function biChainDraw(S, sp) {
    for (let i = 0; i < 9; i++) { const p = along(sp, 0.04 + i * 0.1); biLink(S, p.x, p.y, Math.atan2(p.ty, p.tx) + (i % 2 ? PI / 2 : 0), false); }
    const e = along(sp, 0.99);
    S.cel(E(e.x, e.y + 8, 13, 13, 14), BI.iron, { depth: 4, line: 3, hi: true, hiW: 1.6, rim: S.c.rim });
    S.ell(e.x, e.y + 8, 6.6, 6.6, '#140f2e', { line: 0, hi: false, rim: null, shadow: false });
    S.cel({ poly: [[e.x - 5, e.y - 6], [e.x + 6, e.y - 6], [e.x + 4, e.y + 2], [e.x - 4, e.y + 2]] }, BI.ironD, { depth: 1, line: 2, hi: false, rim: null, shadow: false });
  }
  const BI_CH1 = [[-40, -112], [-68, -86], [-80, -54], [-70, -24]], BI_CH2 = [[38, -112], [66, -90], [78, -58], [66, -28]];
  define('black_bar_inquisitor', {
    size: 'l', lw: 3.4,
    col: { rim: '#c9b8ff', shT: 0.42 },
    bounds: { w: 240, h: 287, head: { x: -10, y: -262 }, body: { x: 0, y: -126 }, feet: { x: 0, y: 0 } },
    die: { box: [-90, -292, 90, 4], nx: 9, ny: 18, from: 'top', order: 0.6, shape: 'strips', kinds: ['bar', 'scrap', 'letter', 'bar'], cols: ['#0b0916', '#fff8f0', '#ffd24a', '#241c4c'], wind: [-8, -12], size: 12, thin: 0.3, life: 0.5 },
    parts: {
      scroll: {
        box: [-34, -10, 34, 112], pivot: [0, -2],
        draw(S) {
          S.cel({ poly: [[-22, 2], [22, 0], [24, 92], [14, 98], [4, 90], [-6, 100], [-22, 92]] }, BI.paper, { depth: 6, line: 3, hi: true, hiW: 1.4, rim: S.c.rim, tension: 0.1, halftone: { d: 5, alpha: 0.18, color: '#8a7aa8' } });
          for (let i = 0; i < 8; i++) tk.inkPath(S.g, [[-16, 12 + i * 10], [-16 + 24 * (0.45 + 0.5 * tk.vary('bis', 'w' + i)), 12.4 + i * 10]], { w: 1.8, color: '#4a3a66', alpha: 0.85, taper: 0.1, pressure: 'flat', wobble: 0.1 });
          // the words struck out: black bars across the sentence, a gold wax seal at the foot
          S.cel({ poly: [[-20, 18], [22, 17], [22, 27], [-20, 28]] }, BI.bar, { depth: 1, line: 2.4, hi: false, rim: null, shadow: false });
          S.cel({ poly: [[-20, 46], [14, 45], [14, 55], [-20, 56]] }, BI.bar, { depth: 1, line: 2.4, hi: false, rim: null, shadow: false });
          S.cel({ poly: [[-20, 66], [22, 65], [22, 74], [-20, 75]] }, BI.bar, { depth: 1, line: 2.4, hi: false, rim: null, shadow: false });
          S.cel(E(0, 88, 8.6, 8.6, 12), BI.gold, { depth: 3, line: 2.6, hi: true, hiW: 1.4, rim: '#fff4c0', shadow: BI.goldD });
          S.line([[-3, 88], [3, 88]], { w: 1.6, color: BI.goldD, taper: 0.1, pressure: 'flat' }); S.line([[0, 85], [0, 91]], { w: 1.6, color: BI.goldD, taper: 0.1, pressure: 'flat' });
          S.cel(cap(-26, 1, 26, -1, 9, 9), BI.wood, { depth: 3, line: 2.8, hi: true, hiW: 1.2, rim: '#e0b070', tension: 0.5 });
          S.cel(E(-27, 0, 5.6, 5.6, 8), BI.brass, { depth: 1, line: 2, hi: false, rim: null }); S.cel(E(27, -1, 5.6, 5.6, 8), BI.brass, { depth: 1, line: 2, hi: false, rim: null });
        },
      },
      armB: {
        box: [20, -204, 112, -90], pivot: [42, -178],
        draw(S) {
          S.cel([[34, -196], [58, -190], [78, -158], [86, -128, 1], [60, -116, 1], [46, -140], [30, -166]], BI.robe, { depth: 10, tension: 0.6, hi: true, hiW: 2.2, rim: S.c.rim, halftone: { d: 5, alpha: 0.3 } });
          S.cel({ poly: [[56, -126], [88, -134], [92, -120], [62, -112]] }, BI.paper, { depth: 2, line: 2.8, hi: false, rim: null, shadow: BI.paperD });
          S.cel({ poly: [[62, -125], [90, -131], [91, -124], [63, -118]] }, BI.bar, { depth: 1, line: 0, hi: false, rim: null, shadow: false });
          S.cel(E(74, -108, 8.6, 8, 10), BI.skin, { depth: 2, line: 2.6, hi: false, rim: '#ffffff' });
        },
      },
      robe: {
        box: [-94, -214, 96, 4], pivot: [0, -110],
        draw(S) {
          const hem = zig(68, -68, -8, 12, 11, 6, 41);
          const pts = [[-24, -206], [2, -212], [28, -206], [42, -190], [48, -150], [58, -100], [68, -40]].concat(hem).concat([[-66, -42], [-58, -100], [-48, -150], [-42, -190]]);
          S.cel(pts, BI.robe, {
            depth: 22, tension: 0.5, hi: true, hiW: 3, rim: S.c.rim, halftone: { d: 5, alpha: 0.34 },
            decor(g) {
              g.fillStyle = BI.robeL;
              [[-34, -170, -48, -20], [-6, -176, -10, -16], [26, -172, 38, -18]].forEach((f) => { g.beginPath(); g.moveTo(f[0], f[1]); g.lineTo(f[0] + 14, f[1] + 4); g.lineTo(f[2] + 18, f[3]); g.lineTo(f[2], f[3]); g.closePath(); g.globalAlpha = 0.5; g.fill(); g.globalAlpha = 1; });
              for (let i = 0; i < 6; i++) tk.inkPath(g, [[-44 + i * 18, -150], [-50 + i * 20, -30]], { w: 2, color: '#0e0a24', alpha: 0.7, taper: 0.3, wobble: 0.1, seed: i });
              // the paper hem the Blank has eaten: a white band with black bars
              g.fillStyle = BI.paper; g.beginPath(); g.moveTo(-90, -24);
              for (let k = 0; k <= 12; k++) g.lineTo(-90 + k * 15, -24 + (k % 2 ? -5 : 1) + (tk.vary('bihem', 'k' + k) - 0.5) * 3);
              g.lineTo(100, 8); g.lineTo(-90, 8); g.closePath(); g.fill();
              g.fillStyle = BI.bar; [[-56, -14, 30], [-8, -17, 22], [28, -14, 28]].forEach((b) => g.fillRect(b[0], b[1], b[2], 7));
              // the belt
              g.fillStyle = '#0e0a24'; g.beginPath(); g.moveTo(-60, -122); g.lineTo(62, -126); g.lineTo(64, -106); g.lineTo(-64, -102); g.closePath(); g.fill();
              g.fillStyle = BI.brass; g.fillRect(-26, -120, 18, 14); g.fillStyle = '#0e0a24'; g.fillRect(-21, -116, 8, 6);
            },
          });
        },
      },
      tabs: {
        box: [-44, -112, 44, -10], pivot: [0, -112],
        draw(S) {
          [[-34, 44, 0.04], [-14, 52, -0.02], [6, 40, 0.03], [24, 48, -0.04]].forEach((tb, i) => {
            const x = tb[0], h = tb[1];
            S.cel({ poly: [[x - 8, -108], [x + 8, -108 + tb[2] * 20], [x + 7, -108 + h], [x - 7, -108 + h + 4]] }, BI.paper, { depth: 3, line: 2.6, hi: false, rim: S.c.rim, tension: 0.1, shadow: BI.paperD });
            S.cel({ poly: [[x - 8, -108 + h * 0.4], [x + 8, -108 + h * 0.4 + 1], [x + 7, -108 + h * 0.4 + 9], [x - 8, -108 + h * 0.4 + 8]] }, BI.bar, { depth: 1, line: 0, hi: false, rim: null, shadow: false });
          });
        },
      },
      mantle: {
        box: [-76, -214, 76, -138], pivot: [0, -196],
        draw(S) {
          S.cel([[-54, -196], [-34, -210], [0, -214], [34, -210], [54, -196], [58, -172, 1], [46, -152], [30, -162, 1], [16, -146], [0, -160, 1], [-16, -146], [-30, -162, 1], [-46, -152], [-58, -172, 1]], BI.paper, {
            depth: 14, tension: 0.4, hi: true, hiW: 2.4, rim: S.c.rim, shadow: BI.paperD, halftone: { d: 5, alpha: 0.22, color: '#8a7aa8' },
            decor(g) {
              g.fillStyle = BI.bar; [[-62, -190, 124, 12], [-54, -171, 80, 10]].forEach((b) => g.fillRect(b[0], b[1], b[2], b[3]));
              g.fillStyle = BI.bar; g.fillRect(16, -156, 30, 9);
              for (let i = 0; i < 4; i++) tk.inkPath(g, [[-48 + i * 4, -148 + i * 0], [-30 + i * 4, -150]], { w: 1.4, color: '#8a7aa8', alpha: 0, taper: 0.1 });
            },
          });
          // the clasp, gold, over the chest
          S.cel(E(-4, -194, 10, 10, 12), BI.gold, { depth: 3, line: 2.8, hi: true, hiW: 1.4, rim: '#fff4c0', shadow: BI.goldD });
          S.line([[-9, -194], [1, -194]], { w: 1.6, color: BI.goldD, taper: 0.1, pressure: 'flat' });
        },
      },
      bands: {
        box: [-34, -210, 26, -150], pivot: [-4, -200],
        draw(S) {
          [[-18, 0], [6, 1]].forEach((b) => {
            S.cel({ poly: [[b[0] - 9, -204], [b[0] + 9, -204], [b[0] + 8, -162], [b[0] - 8, -158]] }, BI.paper, { depth: 3, line: 2.6, hi: false, rim: S.c.rim, shadow: BI.paperD });
            S.line([[b[0] - 4, -192], [b[0] + 4, -192]], { w: 1.2, color: '#8a7aa8', taper: 0.1, pressure: 'flat' }); S.line([[b[0] - 4, -184], [b[0] + 4, -184]], { w: 1.2, color: '#8a7aa8', taper: 0.1, pressure: 'flat' });
          });
        },
      },
      armG: {
        box: [-122, -204, -16, -66], pivot: [-40, -178],
        draw(S) {
          S.cel([[-28, -196], [-54, -192], [-76, -158], [-90, -122, 1], [-62, -104, 1], [-42, -136], [-22, -170]], BI.robe, { depth: 11, tension: 0.6, hi: true, hiW: 2.4, rim: S.c.rim, halftone: { d: 5, alpha: 0.32 } });
          S.cel({ poly: [[-94, -126], [-60, -108], [-56, -92], [-92, -112]] }, BI.paper, { depth: 2, line: 2.8, hi: false, rim: null, shadow: BI.paperD });
          S.cel({ poly: [[-88, -122], [-64, -108], [-62, -101], [-86, -113]] }, BI.bar, { depth: 1, line: 0, hi: false, rim: null, shadow: false });
          S.cel(E(-74, -96, 9, 8.4, 10), BI.skin, { depth: 2, line: 2.6, hi: false, rim: '#ffffff' });
        },
      },
      gavel: {
        box: [-44, -126, 44, 22], pivot: [0, 0],
        draw(S) {
          S.cel(cap(0, 12, 0, -86, 10, 8), BI.woodD, { depth: 3, line: 3, hi: true, hiW: 1.4, rim: '#e0b070', tension: 0.5 });
          S.cel({ poly: [[-32, -118], [30, -122], [34, -86], [-28, -82]] }, BI.wood, { depth: 8, line: 3.4, hi: true, hiW: 2, rim: '#e0b070', halftone: { d: 5, alpha: 0.26 } });
          S.cel({ poly: [[-34, -120], [-24, -121], [-22, -84], [-32, -83]] }, BI.brass, { depth: 2, line: 2.4, hi: true, hiW: 1.2, rim: '#fff0b0' });
          S.cel({ poly: [[22, -122], [32, -122], [35, -86], [25, -85]] }, BI.brass, { depth: 2, line: 2.4, hi: false, rim: null });
          S.cel(E(0, 14, 7, 7, 8), BI.brass, { depth: 1, line: 2.4, hi: false, rim: null });
        },
      },
      hood: {
        box: [-60, -304, 56, -186], pivot: [-6, -198],
        draw(S) {
          // the capirote: a tall cone with a white paper hem, a black bar around it, then the mask
          S.cel([[-40, -200], [-38, -226], [-28, -256], [-16, -286, 1], [-5, -284, 1], [12, -254], [26, -226], [34, -200], [-2, -192]], BI.robe, {
            depth: 14, tension: 0.5, hi: true, hiW: 2.6, rim: S.c.rim, halftone: { d: 5, alpha: 0.34 },
            decor(g) { g.fillStyle = BI.bar; g.beginPath(); g.moveTo(-30, -252); g.lineTo(22, -246); g.lineTo(24, -234); g.lineTo(-33, -240); g.closePath(); g.fill(); },
          });
          S.cel(E(-6, -222, 25, 30, 18), BI.skin, {
            depth: 8, line: 3, hi: true, hiW: 2.2, rim: '#ffffff', shadow: '#d4c4e4', halftone: { d: 5, alpha: 0.22, color: '#8a7aa8' },
            decor(g) { tk.inkPath(g, [[-18, -240], [-12, -232], [-14, -224]], { w: 1.2, color: '#8a7aa8', alpha: 0.8, taper: 0.4 }); tk.inkPath(g, [[8, -204], [4, -210], [8, -216]], { w: 1.2, color: '#8a7aa8', alpha: 0.8, taper: 0.4 }); },
          });
          // brow ridge shadow so the slits read as stern
          S.cel([[-26, -238], [-6, -242], [16, -238], [14, -230], [-6, -234], [-26, -232]], '#c4b4d8', { depth: 1, line: 0, tension: 0.4, hi: false, rim: null, shadow: false });
          // the gag: a black censor bar across the mouth with white stitches
          S.cel({ poly: [[-34, -218], [24, -222], [25, -202], [-35, -198]] }, BI.bar, { depth: 2, line: 3.2, hi: false, rim: '#c9b8ff', rimW: 1.2, shadow: '#1a1430' });
          for (let i = 0; i < 4; i++) { const x = -24 + i * 14; tk.inkPath(S.g, [[x - 3, -214 - i * 0.3], [x + 3, -206 - i * 0.3]], { w: 1.8, color: '#fff8f0', alpha: 0.85, taper: 0.1, pressure: 'flat', wobble: 0 }); tk.inkPath(S.g, [[x + 3, -214 - i * 0.3], [x - 3, -206 - i * 0.3]], { w: 1.8, color: '#fff8f0', alpha: 0.85, taper: 0.1, pressure: 'flat', wobble: 0 }); }
        },
      },
      tassel: {
        box: [-34, -306, 18, -240], pivot: [-10, -284],
        draw(S) {
          S.cel([[-10, -284, 1], [-18, -272], [-22, -256, 1], [-14, -262], [-8, -272, 1]], BI.paper, { depth: 2, line: 2.4, tension: 0.3, hi: false, rim: null, shadow: BI.paperD });
          S.cel(E(-9, -286, 4.4, 4.4, 8), BI.gold, { depth: 1, line: 2, hi: false, rim: '#fff4c0', shadow: BI.goldD });
        },
      },
    },
    chains: {
      ch1: { spine: BI_CH1, cuts: [0.34, 0.68], reach: 30, overlap: 6, draw(S) { biChainDraw(S, BI_CH1); } },
      ch2: { spine: BI_CH2, cuts: [0.34, 0.68], reach: 30, overlap: 6, draw(S) { biChainDraw(S, BI_CH2); } },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die, atk = E0.pose === 'attack', p = atk ? E0.p : 0;
      const strike = atk ? E0.strike : 0, wind = atk ? E0.wind : 0, br = sin(TAU * t / 3.6) * m, hot = clamp(tele + buff + strike + guard * 0.5 + st.wound * 0.4, 0, 1);
      const dx = -strike * 28 + hurt * 14 + E0.shake * 1.2 + 8 * tele - 5 * wind, dy = 3 * tele + 4 * guard + 8 * die + 2 * br;
      const rot = -0.03 * strike + 0.05 * tele + 0.07 * hurt + 0.01 * br;
      // arm and gavel angles (world angle of the gavel is chosen, then made relative to the arm)
      let aS = 0.05 * br, gW = -0.18 + 0.05 * br, aB = -0.04 * br;
      if (atk) {
        if (p < 0.3) { const k = sm(p / 0.3); aS = lerp(0, 2.2, k); gW = lerp(-0.18, 0.35, k); }
        else if (p < 0.5) { const k = ease.inCubic((p - 0.3) / 0.2); aS = lerp(2.2, -0.3, k); gW = lerp(0.35, -2.3, k); }
        else { const k = sm((p - 0.5) / 0.5); aS = lerp(-0.3, 0.05 * br, k); gW = lerp(-2.3, -0.18, k); }
      } else if (E0.pose === 'telegraph') { aS = 2.2 * tele + 0.03 * E0.shake; gW = 0.35 * tele - 0.18 * (1 - tele) + 0.03 * E0.shake; aB = -0.5 * tele; }
      else if (E0.pose === 'block') { aS = 0.8 * guard; gW = -1.2 * guard - 0.18 * (1 - guard); aB = 1.5 * guard; }
      else if (E0.pose === 'buff') { aS = 1.2 * buff; gW = 0.4 * buff - 0.18; aB = -1.0 * buff; }
      else if (E0.pose === 'hurt') { aS = 0.4 * hurt; gW = 0.3 * hurt - 0.18; aB = 0.4 * hurt; }
      else if (die > 0) { aS = 0.5 * die; aB = -0.4 * die; }
      ctx.save();
      if (die > 0) ctx.transform(1, 0, 0, 1 - 0.12 * die, 0, -2 * die);
      xform(ctx, 0, -110, dx, dy, rot, 1, 1 + 0.01 * br);
      const sway = sin(t * 1.6) * m;
      putChain(ctx, st, 'ch2', [0.14 * sway - 0.3 * buff, 0.18 * sin(t * 1.6 - 0.9) * m + 0.2 * hurt, 0.2 * sin(t * 1.6 - 1.8) * m + 0.4 * buff * sin(t * 14)]);
      if (guard < 0.3) put(ctx, st, 'armB', { r: aB });
      put(ctx, st, 'robe', { sy: 1 + 0.01 * br, r: 0.006 * br });
      put(ctx, st, 'tabs', { r: 0.05 * sin(t * 1.9 + 1) * m + 0.1 * strike - 0.08 * tele, sy: 1 + 0.02 * sin(t * 2.7) * m });
      putChain(ctx, st, 'ch1', [0.14 * sin(t * 1.6 + 1) * m + 0.2 * strike + 0.4 * wind - 0.3 * buff, 0.18 * sin(t * 1.6 + 0.1) * m + 0.3 * hurt, 0.2 * sin(t * 1.6 - 0.8) * m + 0.3 * buff * sin(t * 13 + 1)]);
      put(ctx, st, 'mantle', { sy: 1 + 0.015 * br, r: 0.01 * br, sx: 1 + 0.01 * br });
      if (guard >= 0.3) put(ctx, st, 'armB', { r: aB });
      put(ctx, st, 'bands', { r: 0.04 * sin(t * 1.9) * m });
      // the scroll hangs from the back hand and swings
      {
        const hx = 74, hy = -108, ca = cos(aB), sa = sin(aB), px = 42 + (hx - 42) * ca - (hy + 178) * sa, py = -178 + (hx - 42) * sa + (hy + 178) * ca;
        put(ctx, st, 'scroll', { x: px, y: py, r: 0.1 * sin(t * 1.5) * m + 0.3 * hurt, sy: 1 - 0.06 * guard });
      }
      // the arm with the gavel riding on the hand
      put(ctx, st, 'armG', {
        r: aS,
        kids(c) {
          put(c, st, 'gavel', { x: -74, y: -96, r: gW - aS });
        },
      });
      // gavel head heats up gold
      {
        const ang = gW, hx = -40 + (-74 + 40) * cos(aS) - (-96 + 178) * sin(aS), hy = -178 + (-74 + 40) * sin(aS) + (-96 + 178) * cos(aS);
        const gx = hx + sin(ang) * 102, gy = hy - cos(ang) * 102;
        if (hot > 0.15) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; tk.glow(ctx, gx, gy, 38 + 30 * hot, BI.gold, 0.55 * hot); ctx.restore(); }
      }
      put(ctx, st, 'hood', {
        r: 0.02 * sin(t * 1.1) * m - 0.04 * tele + 0.05 * strike + 0.1 * hurt, y: 2 * tele - 1 * strike,
        kids(c) {
          const sweep = 1.5 * sin(t * 0.9) * m, ob = blink(t, 'inq', 5.2) * (1 - 0.5 * hurt), ex = hot > 0.4;
          eyeLive(c, -17 + sweep, -233, 7.4 + 1.6 * hot, 4.2 + 1.6 * hot, { open: ob, iris: ['#fff2b0', BI.gold], sclera: '#fff8e0', pupil: 'none', glow: BI.gold, glowK: 0.9 + 0.1 * hot, glowR: 3, lw: 2, lidTop: 0.34 + 0.3 * (1 - hot), lidColor: '#1a1430', rot: 0.18 });
          eyeLive(c, 5 + sweep, -233, 7.4 + 1.6 * hot, 4.2 + 1.6 * hot, { open: ob, iris: ['#fff2b0', BI.gold], sclera: '#fff8e0', pupil: 'none', glow: BI.gold, glowK: 0.9 + 0.1 * hot, glowR: 3, lw: 2, lidTop: 0.34 + 0.3 * (1 - hot), lidColor: '#1a1430', rot: -0.18 });
          void ex;
        },
      });
      put(ctx, st, 'tassel', { r: 0.2 * sin(t * 2.3) * m + 0.2 * hurt - 0.1 * tele, sy: 1 + 0.04 * sin(t * 3.1) * m });
      // the halo of loose bars: it spins slowly, speeds up and closes into a cage over the head when the sentence is near
      {
        const n = 5, cx = -6, cy = -268, rx = lerp(58, 40, tele) + 6 * buff, ry = lerp(12, 7, tele);
        const spin = t * (0.5 + 1.2 * hot) + 0.3;
        const list = [];
        for (let i = 0; i < n; i++) { const a = spin + i * TAU / n; list.push({ a, z: sin(a), x: cos(a) * rx, y: sin(a) * ry, w: 24 + 16 * hv('bib', 'w' + i), h: 7 + 3 * hv('bib', 'h' + i), r: 0.14 * cos(a * 2 + i) }); }
        list.sort((a, b) => a.z - b.z);
        list.forEach((b) => {
          ctx.save(); ctx.translate(cx + b.x + dx * 0.9, cy + b.y + dy - 4 * tele); ctx.rotate(b.r + 0.4 * tele * b.z);
          ctx.globalAlpha = (0.55 + 0.45 * (b.z * 0.5 + 0.5)) * (1 - die);
          ctx.fillStyle = BI.bar; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
          ctx.strokeStyle = tele > 0.4 ? BI.gold : '#8a86c8'; ctx.lineWidth = 1.4; ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
          ctx.restore();
        });
        if (tele > 0.3) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; tk.glow(ctx, cx + dx, cy + dy, 70, BI.gold, 0.28 * tele); ctx.restore(); }
      }
      ctx.restore();
      // the slam: a shock ring on the floor in front, black bars and paper flying, the gavel dust
      if (atk && p > 0.48 && p < 0.9) {
        const u = (p - 0.48) / 0.42;
        ctx.save(); ctx.translate(-150 + dx, -8); ctx.scale(1, 0.28); ctx.globalAlpha = (1 - u) * 0.95; ctx.strokeStyle = BI.gold; ctx.lineWidth = 7 * (1 - u) + 1; ctx.beginPath(); ctx.arc(0, 0, 20 + 100 * ease.outCubic(u), 0, TAU); ctx.stroke(); ctx.restore();
        for (let i = 0; i < 7; i++) { const fj = fling('biimp' + i, 'b', u, { spread: 160, up: 110, g: 380, bias: -50 }); ctx.save(); ctx.globalAlpha = fj.a; ctx.translate(-150 + dx + fj.x, -14 + fj.y); ctx.rotate(fj.r); ctx.fillStyle = i % 3 ? BI.bar : BI.paper; ctx.fillRect(-8, -3, 16, 6); ctx.restore(); }
        sparks(ctx, -150 + dx, -14, u, 9, 51, { col: '#ffe08a', speed: 80, size: 8, spread: PI, dir: -PI / 2, life: 1, alpha: 1 - u });
      }
      if (buff > 0.1) motes(ctx, -6 + dx, -150 + dy, t, 10, 'bibuff', { col: '#ffd24a', size: 2.6, rise: 80, spread: 40, life: 0.9, alpha: buff });
    },
  });
  // ---------------------------------------------------------------------------------------------------------------
  // BLANK PAGE (minion, s): a sheet that has not decided to be a story yet. Cream paper with a torn left edge, a dog-eared corner, pale ruled lines and one
  // pink margin rule, two big ink-dot eyes and a tiny mouth: innocent, and it folds both flaps around whoever tries to write on it. Three strips hinged at
  // the fold lines flutter on their own (idle), close over the front (wrap and block) or spread wide (buff). Accent: the white glow of the Blank and the
  // pink margin line.
  // ---------------------------------------------------------------------------------------------------------------
  const BP = { paper: '#fff8f0', rule: '#9ec0f0', margin: '#ff5f86', ink: '#2a2250', glow: '#f4ecff', lilac: '#cdbfe8' };
  const BPL = -31, BPR = 33, BPT = -106, BPB = -20;
  function bpSheet(S) {
    const g = S.g, L = BPL, R = BPR, T = BPT, B = BPB;
    const pts = [[L + 3, T + 1, 1], [-12, T - 2], [12, T], [R - 13, T - 1, 1], [R, T + 13, 1], [R + 1, -62], [R - 2, B - 2, 1], [10, B + 3], [-12, B + 1], [L + 4, B - 1, 1],
      [L - 1, B - 12, 1], [L + 4, B - 24, 1], [L - 2, B - 36, 1], [L + 4, B - 48, 1], [L - 2, B - 60, 1], [L + 3, B - 72, 1], [L - 1, B - 84, 1]];
    S.cel(pts, BP.paper, {
      depth: 9, tension: 0.2, hi: true, hiW: 2.2, rim: S.c.rim, halftone: { d: 5, alpha: 0.2, color: '#9a8ac0' },
      decor(gg) {
        for (let i = 0; i < 7; i++) tk.inkPath(gg, [[L + 4, T + 24 + i * 11], [R - 3, T + 24 + i * 11 + (i % 2 ? 0.8 : -0.4)]], { w: 1.2, color: BP.rule, alpha: 0.75, taper: 0.05, pressure: 'flat', wobble: 0.06 });
        tk.inkPath(gg, [[L + 15, T + 4], [L + 15.6, -62], [L + 15, B - 3]], { w: 1.5, color: BP.margin, alpha: 0.9, taper: 0.05, pressure: 'flat', wobble: 0.05 });
      },
    });
    // the dog-ear: a folded triangle in shade, outlined
    S.cel({ poly: [[R - 13, T - 1], [R, T + 13], [R - 13, T + 13]] }, '#e6dcf4', { depth: 2, line: 2.4, hi: false, rim: null, shadow: '#b8a8d8' });
    void g;
  }
  function bpStrip(x0, x1) {
    return (S) => { const g = S.g; g.save(); g.beginPath(); g.rect(x0, BPT - 12, x1 - x0, BPB - BPT + 24); g.clip(); bpSheet(S); g.restore(); };
  }
  define('blank_page', {
    size: 's', lw: 2.8,
    col: { rim: '#ffffff', shT: 0.3 },
    bounds: { w: 96, h: 112, head: { x: -4, y: -108 }, body: { x: 0, y: -62 }, feet: { x: 0, y: 0 } },
    die: { box: [-52, -118, 52, -8], nx: 8, ny: 10, from: 'out', order: 0.5, shape: 'paper', kinds: ['scrap', 'scrap', 'letter', 'ink'], cols: ['#fff8f0', '#e6dcf4', '#2a2250', '#ff5f86'], wind: [-12, -20], size: 8, thin: 0.3 },
    parts: {
      pageL: { box: [-35, -116, -13, -12], pivot: [-13, -62], draw: bpStrip(-35, -12) },
      pageR: { box: [13, -116, 38, -12], pivot: [13, -62], draw: bpStrip(12, 38) },
      pageM: { box: [-14, -116, 14, -12], pivot: [0, -62], draw: bpStrip(-13.5, 13.5) },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die, atk = E0.pose === 'attack';
      const strike = atk ? E0.strike : 0, wind = atk ? E0.wind : 0;
      const bob = sin(t * 1.9) * 5 * m, flut = sin(t * 3.1) * m, wrap = clamp(strike * 1.1 + guard + (E0.pose === 'telegraph' ? tele * 0.55 : 0), 0, 1), spread = buff;
      const dx = -strike * 44 + hurt * 14 + 3 * tele - 5 * wind, dy = bob - 5 * tele - 4 * wind + 7 * die - 6 * buff;
      const rot = 0.05 * sin(t * 1.2) * m + 0.16 * hurt - 0.14 * strike + 0.1 * tele - 0.12 * wind;
      ctx.save();
      tk.glow(ctx, dx, -62 + dy, 50 + 16 * buff + 10 * tele, BP.glow, 0.28 + 0.3 * buff + 0.2 * tele);
      xform(ctx, 0, -62, dx, dy, rot, 1 - 0.18 * hurt, 1 + 0.06 * hurt);
      // the flaps: a flutter, a close over the front (narrow, swing, move in), a spread on a buff
      const closed = clamp(guard, 0, 1), fl = 0.05 * flut + 0.2 * spread - 0.7 * strike - 0.5 * tele + 0.03 * E0.shake, fr = -0.05 * sin(t * 3.1 + 1.3) * m - 0.2 * spread + 0.5 * strike + 0.5 * tele - 0.03 * E0.shake;
      const sxL = lerp(1 + 0.3 * strike, -0.9, closed), sxR = lerp(1 + 0.3 * strike, -0.9, closed);
      if (closed < 0.35) { put(ctx, st, 'pageR', { r: fr, sx: sxR }); put(ctx, st, 'pageL', { r: fl, sx: sxL }); }
      put(ctx, st, 'pageM', {
        sy: 1 + 0.015 * sin(t * 2.4) * m,
        kids(c) {
          const ob = blink(t, 'bpage', 4.2) * (1 - 0.7 * hurt) * (1 - wrap * 0.7), lk = [-0.9 + 0.4 * sin(t * 0.7) * m, 0.1];
          const ang = 0.12 * tele + 0.2 * strike;
          eyeLive(c, -7, -67, 4.8, 6.6 + 1.2 * tele, { open: ob, iris: [BP.ink, '#4a3a86'], sclera: '#ffffff', pupil: 'none', look: lk, glow: BP.glow, glowK: 0.5, glowR: 2.2, lw: 1.8, rot: -ang });
          eyeLive(c, 7, -67, 4.4, 6.2 + 1.2 * tele, { open: ob, iris: [BP.ink, '#4a3a86'], sclera: '#ffffff', pupil: 'none', look: lk, glow: BP.glow, glowK: 0.5, glowR: 2.2, lw: 1.8, rot: ang });
          // the mouth: a tiny smile, round and shocked when hit, a thin sly line while it wraps
          c.save();
          if (hurt > 0.3) { c.beginPath(); c.ellipse(0, -50, 3.4, 4.4, 0, 0, TAU); c.fillStyle = BP.ink; c.fill(); }
          else if (wrap > 0.4 || tele > 0.4) tk.inkPath(c, [[-5, -51], [0, -49.4], [5, -52]], { w: 1.8, color: BP.ink, taper: 0.3, wobble: 0 });
          else tk.inkPath(c, [[-5, -52], [0, -48.6], [5, -52]], { w: 1.8, color: BP.ink, taper: 0.3, wobble: 0 });
          c.restore();
        },
      });
      if (closed >= 0.35) { put(ctx, st, 'pageR', { r: fr, sx: sxR }); put(ctx, st, 'pageL', { r: fl, sx: sxL }); }
      ctx.restore();
      // a paper cut: a bright slash line over the target on the strike
      if (atk && E0.p > 0.46 && E0.p < 0.75) {
        const u = (E0.p - 0.46) / 0.29;
        ctx.save(); ctx.globalAlpha = (1 - u) * 0.95;
        swoosh(ctx, -66 + dx, -62, 54, 14, -0.9, 0.9 + 2.2 * 0, { alpha: 1, fill: '#ffffff', edge: BP.lilac });
        ctx.restore();
      }
      if (buff > 0.05) motes(ctx, dx, -40 + dy, t, 8, 'bpbuff', { col: '#ffffff', size: 2.6, rise: 54, spread: 24, life: 0.8, alpha: buff });
      if (st.wound > 0.3) for (let i = 0; i < 2; i++) { const u = ((t * 0.9 + i * 0.5) % 1 + 1) % 1; ctx.save(); ctx.globalAlpha = (1 - u) * 0.8; ctx.translate(-6 + dx + 14 * i, -26 + dy + u * 24); ctx.rotate(u * 3 + i); ctx.fillStyle = BP.paper; ctx.fillRect(-3, -2, 6, 4); ctx.restore(); }
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // SPARK MOTE (minion, s): a crumb of storm no bigger than a seed: a hot yellow ball with eight little fins, big shiny eyes, a sprig of cyan arcs and a
  // thimble of thundercloud to ride on. It hums, jitters and has exactly one thing to say. Idle is a nervous hover; attack is a dash; telegraph swells
  // and whitens; death is a bang. Accent: electric yellow with cyan arcs.
  // ---------------------------------------------------------------------------------------------------------------
  const SM = { core: '#ffe45e', coreD: '#e8a41c', fin: '#ffc92e', white: '#fffbe0', cyan: '#5ff5ff', cloud: '#6a60a8', cloudD: '#3d3478', rim: '#fffbd0' };
  define('spark_mote', {
    size: 's', lw: 2.8,
    col: { rim: '#ffffff', shT: 0.32 },
    bounds: { w: 92, h: 106, head: { x: -4, y: -100 }, body: { x: 0, y: -62 }, feet: { x: 0, y: 0 } },
    die: { box: [-50, -112, 50, -8], nx: 7, ny: 9, from: 'out', order: 0.4, shape: 'diamond', kinds: ['spark', 'spark', 'puff', 'shard'], cols: ['#ffe45e', '#fffbe0', '#5ff5ff', '#6a60a8'], wind: [0, -6], size: 9, thin: 0.15, life: 0.55 },
    parts: {
      cloud: {
        box: [-34, -34, 34, 2], pivot: [0, -22],
        draw(S) { [[-14, -18, 11], [0, -22, 14], [14, -18, 11], [-4, -12, 9], [8, -11, 9]].forEach((c, i) => S.ell(c[0], c[1], c[2], c[2] * 0.86, i % 2 ? SM.cloud : SM.cloudD, { depth: 4, line: 2.4, hi: false, rim: '#a8f4ff', rimW: 1.2, halftone: { d: 4, alpha: 0.3 } })); },
      },
      fins: {
        box: [-44, -108, 44, -16], pivot: [0, -62],
        draw(S) {
          for (let i = 0; i < 8; i++) {
            const a = i * TAU / 8 + 0.2, big = i % 2 === 0, r0 = 16, r1 = big ? 38 : 29, w = big ? 9 : 7, c = cos(a), s = sin(a), nx = -s, ny = c;
            S.cel([[c * r0 - nx * w, s * r0 - 62 - ny * w, 1], [c * r1, s * r1 - 62, 1], [c * r0 + nx * w, s * r0 - 62 + ny * w, 1]], big ? SM.core : SM.fin, { depth: 3, line: 2.6, tension: 0, hi: false, rim: big ? '#ffffff' : null, shadow: SM.coreD });
          }
        },
      },
      core: {
        box: [-30, -92, 30, -32], pivot: [0, -62],
        draw(S) {
          S.cel(E(0, -62, 22, 22, 16), SM.core, {
            depth: 9, hi: true, hiW: 2.4, rim: S.c.rim, shadow: SM.coreD, halftone: { d: 4, alpha: 0.28, color: '#c07810' },
            decor(g) { g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.ellipse(-8, -72, 7, 4.4, -0.6, 0, TAU); g.fill(); },
          });
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die, atk = E0.pose === 'attack';
      const strike = atk ? E0.strike : 0, wind = atk ? E0.wind : 0, hot = clamp(tele + buff + strike + guard * 0.5, 0, 1);
      const jx = (hv('smj', 'x' + Math.floor(t * 18)) - 0.5) * 3.2 * m * (0.5 + hot), jy = (hv('smj', 'y' + Math.floor(t * 18)) - 0.5) * 3.2 * m * (0.5 + hot);
      const bob = sin(t * 2.6) * 6 * m + sin(t * 5.3) * 1.5 * m;
      const dx = -strike * 120 + hurt * 14 + 4 * wind + jx + 3 * E0.shake * 0.3, dy = bob - 4 * tele - 3 * wind + jy + 6 * die - 8 * buff;
      const sw = 1 + 0.2 * tele + 0.18 * buff + 0.16 * wind + 0.12 * strike - 0.1 * die;
      ctx.save();
      // the heat haze: a big soft glow that pulses with the hum
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; tk.glow(ctx, dx, -62 + dy, 64 + 30 * hot, SM.core, (0.4 + 0.25 * sin(t * 6) * m + 0.35 * hot) * (1 - die)); ctx.restore();
      put(ctx, st, 'cloud', { x: dx * 0.6, y: dy * 0.5 + 3 * sin(t * 2.6 + 1) * m, sx: 1 + 0.05 * sin(t * 3) * m - 0.1 * strike, sy: 1 + 0.05 * sin(t * 3 + 1) * m });
      xform(ctx, 0, -62, dx, dy, 0, sw, sw);
      put(ctx, st, 'fins', { r: t * 0.7 * m + 0.5 * sin(t * 9) * m * 0.1 + 2.6 * strike + 0.4 * hurt, sx: 1 + 0.06 * sin(t * 12) * m, sy: 1 - 0.06 * sin(t * 12) * m });
      put(ctx, st, 'core', {
        sy: 1 + 0.03 * sin(t * 5) * m,
        kids(c) {
          const ob = blink(t, 'smote', 2.9) * (1 - 0.6 * hurt), lk = [-0.7 + 0.2 * sin(t * 1.9), 0];
          eyeLive(c, -8.5, -63, 5.4, 8 + 1.6 * tele, { open: ob, iris: ['#14102e', '#3a2a88'], sclera: '#ffffff', pupil: 'none', look: lk, glow: '#ffffff', glowK: 0.3, glowR: 2, lw: 1.8, lidTop: hot > 0.4 ? 0.28 : 0, rot: -0.15 * hot });
          eyeLive(c, 7.5, -63, 5, 7.6 + 1.6 * tele, { open: ob, iris: ['#14102e', '#3a2a88'], sclera: '#ffffff', pupil: 'none', look: lk, glow: '#ffffff', glowK: 0.3, glowR: 2, lw: 1.8, lidTop: hot > 0.4 ? 0.28 : 0, rot: 0.15 * hot });
          if (hurt > 0.25 || strike > 0.3) { c.beginPath(); c.ellipse(-1, -50, 3.6, 4.6, 0, 0, TAU); c.fillStyle = '#14102e'; c.fill(); }
          else tk.inkPath(c, [[-6, -51], [-1, -47.6], [5, -51]], { w: 1.9, color: '#14102e', taper: 0.3, wobble: 0 });
        },
      });
      ctx.restore();
      // arcs hopping between the fins, more of them the angrier it is; a long bolt when it dashes
      ctx.save();
      const nArc = 2 + Math.round(3 * hot);
      for (let i = 0; i < nArc; i++) {
        const a0 = hv('smarc', 'a' + i) * TAU + t * 0.6, r0 = 26, a1 = a0 + 0.9 + 0.5 * hv('smarc', 'b' + i);
        zap(ctx, dx + cos(a0) * r0, -62 + dy + sin(a0) * r0, dx + cos(a1) * (r0 + 14), -62 + dy + sin(a1) * (r0 + 14), t * (0.4 + 0.2 * i), { seed: 20 + i, w: 1.8, jag: 5, n: 4, color: SM.cyan, core: '#ffffff' });
      }
      if (strike > 0.2) for (let i = 0; i < 3; i++) zap(ctx, dx + 20, -62 + dy + (i - 1) * 9, dx + 120 + 30 * i, -62 + dy + (i - 1) * 14, t, { seed: 40 + i, w: 2.4 - i * 0.5, jag: 8, n: 6, color: SM.cyan, core: '#ffffff' });
      ctx.restore();
      sparks(ctx, dx, -62 + dy, t, 5 + Math.round(6 * hot), 77, { col: '#fff2a0', speed: 36 + 30 * hot, size: 5, life: 0.5, spread: TAU, alpha: 1 - die });
      if (die > 0) {
        const u = die;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = cA((1 - u) * 0.9); ctx.strokeStyle = SM.white; ctx.lineWidth = 5 * (1 - u) + 1; ctx.beginPath(); ctx.arc(0, -62, 12 + 74 * ease.outCubic(u), 0, TAU); ctx.stroke();
        tk.glow(ctx, 0, -62, 40 + 60 * u, '#ffffff', (1 - u) * 0.9); ctx.restore();
      }
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // TYPO SPRITE (minion, s): a typewriter key that came loose and went wrong: a cream ring of keycap round a dark face glowing with a magenta ":)" that
  // glitches (an X eye, a flipped mouth, an offset ghost in magenta and cyan) every second or so, on two ink-stained stick legs with a curl of ribbon
  // for an antenna and a proofreader's caret for a hat. Accent: glitch magenta with a cyan ghost (the same magenta as its summoner, the Margin Imp).
  // ---------------------------------------------------------------------------------------------------------------
  const TS = { ring: '#f3e6c8', ringD: '#c8b080', brass: '#d9a441', face: '#2a1f4a', faceL: '#4a3a86', mag: '#ff3a8a', magL: '#ff8cc0', cyan: '#5ff5ff', ribbon: '#241a3a', ink: '#140f2e' };
  // the glitch clock: 0 normally, 1 inside a short burst; `k` lets the angry poses force it
  function glitch(t, force) {
    const ph = ((t * 0.83 + 0.2) % 1 + 1) % 1, burst = ph > 0.88 ? 1 - Math.abs((ph - 0.94) / 0.06) : 0;
    return clamp(Math.max(burst, force || 0), 0, 1);
  }
  define('typo_sprite', {
    size: 's', lw: 2.8,
    col: { rim: '#ffd0e8', shT: 0.34 },
    bounds: { w: 96, h: 123, head: { x: -4, y: -104 }, body: { x: 0, y: -58 }, feet: { x: 0, y: 0 } },
    die: { box: [-52, -112, 52, 0], nx: 8, ny: 10, from: 'top', order: 0.6, shape: 'paper', kinds: ['letter', 'scrap', 'spark', 'letter'], cols: ['#ff3a8a', '#f3e6c8', '#5ff5ff', '#ffffff'], wind: [-10, 6], size: 8, thin: 0.25 },
    parts: {
      legN: { box: [-24, -34, 4, 4], pivot: [-8, -32], draw(S) { S.line([[-8, -32], [-10, -10]], { w: 4.6, color: TS.ink, taper: 0.05, pressure: 'flat', wobble: 0.06 }); S.cel([[-24, -8], [-4, -10], [2, -2], [-20, 2]], TS.ringD, { depth: 3, line: 2.6, tension: 0.3, hi: false, rim: S.c.rim }); S.ell(-8, -4, 2.6, 2, TS.mag, { line: 0, shadow: false, hi: false, rim: null }); } },
      legF: { box: [-2, -34, 26, 4], pivot: [10, -32], draw(S) { S.line([[10, -32], [12, -10]], { w: 4.2, color: TS.ink, taper: 0.05, pressure: 'flat', wobble: 0.06 }); S.cel([[-2, -8], [18, -10], [24, -2], [2, 2]], TS.ringD, { depth: 3, line: 2.6, tension: 0.3, hi: false, rim: null }); } },
      armN: {
        box: [-48, -66, -10, -30], pivot: [-24, -52],
        draw(S) {
          S.line([[-24, -52], [-36, -46], [-42, -40]], { w: 4.2, color: TS.ink, taper: 0.05, pressure: 'flat', wobble: 0.06 });
          S.cel([[-42, -36, 1], [-46, -42], [-40, -48, 1]], TS.mag, { depth: 2, line: 2.2, tension: 0.2, hi: false, rim: null, shadow: '#b0245c' });   // the nib that does the poking
        },
      },
      armF: { box: [8, -66, 40, -30], pivot: [22, -52], draw(S) { S.line([[22, -52], [32, -46], [30, -38]], { w: 3.8, color: TS.ink, taper: 0.05, pressure: 'flat', wobble: 0.06 }); S.ell(30, -37, 3.4, 3.4, TS.ring, { depth: 1, line: 2, hi: false, rim: null }); } },
      key: {
        box: [-38, -92, 38, -22], pivot: [0, -57],
        draw(S) {
          S.cel(E(0, -57, 31, 31, 18), TS.ring, { depth: 11, hi: true, hiW: 2.4, rim: S.c.rim, shadow: TS.ringD, halftone: { d: 5, alpha: 0.22, color: '#8a6a30' } });
          S.cel(E(0, -57, 25.4, 25.4, 18), TS.brass, { depth: 6, line: 2.6, hi: true, hiW: 1.4, rim: '#fff0b0' });
          S.cel(E(0, -57, 22, 22, 18), TS.face, {
            depth: 8, line: 2.6, hi: false, rim: S.c.rim, rimW: 1.2, shadow: '#17102e', halftone: { d: 4, alpha: 0.3, color: '#7a5ac0' },
            decor(g) { g.fillStyle = 'rgba(255,255,255,0.16)'; g.beginPath(); g.ellipse(-8, -68, 9, 4, -0.6, 0, TAU); g.fill(); },
          });
        },
      },
      ribbon: {
        box: [-12, -118, 30, -74], pivot: [6, -86],
        draw(S) {
          S.rib([[6, -86], [14, -98], [4, -108], [-2, -102], [8, -96]], TS.ribbon, { wMax: 6, w0: 5, w1: 3, line: 2.2, tipPow: 1, shadow: '#0d0a1e', rim: null });
          S.cel({ poly: [[-3, -112], [7, -122], [17, -112], [13, -112], [7, -117], [1, -112]] }, TS.mag, { depth: 2, line: 2.2, hi: false, rim: '#ffd0e8', shadow: '#b0245c' });
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die, atk = E0.pose === 'attack';
      const strike = atk ? E0.strike : 0, wind = atk ? E0.wind : 0, hot = clamp(tele + buff + strike + hurt * 0.6, 0, 1);
      const gl = glitch(t, hot * 0.9 + 0.8 * hurt);
      const hop = Math.max(0, sin(t * 3.4)) * 7 * m, br = sin(t * 3.4 - 1.2) * m, hopT = 1 - hop / 7;
      const gx = gl > 0.3 ? (hv('tsg', 'x' + Math.floor(t * 24)) - 0.5) * 10 * gl : 0;
      const dx = -strike * 42 + hurt * 14 + 5 * wind + gx, dy = -hop - 6 * tele + 6 * die - 3 * wind;
      const rot = 0.05 * sin(t * 1.7) * m + 0.2 * hurt - 0.1 * strike + 0.1 * tele;
      const sq = 1 - 0.08 * hopT * (1 - Math.abs(sin(t * 3.4))) * 0 + 0.0;
      ctx.save();
      xform(ctx, 0, -2, dx, 0, 0, 1, 1);
      put(ctx, st, 'legF', { r: 0.34 * sin(t * 3.4) * m + 0.2 * strike, y: dy * 0.2 });
      put(ctx, st, 'legN', { r: -0.34 * sin(t * 3.4) * m - 0.2 * strike, y: dy * 0.2 });
      xform(ctx, 0, -57, 0, dy, rot, sq, 1 - 0.04 * br * 0 + 0.02 * br);
      // ghosts first: the same key twice, shifted, in cyan and magenta, only inside a glitch
      if (gl > 0.05) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = cA(gl * 0.55);
        ctx.save(); ctx.translate(-5 * gl, 1.5 * gl); ctx.globalAlpha = cA(gl * 0.6); ctx.fillStyle = TS.cyan; ctx.beginPath(); ctx.arc(0, -57, 29, 0, TAU); ctx.fill(); ctx.restore();
        ctx.save(); ctx.translate(5 * gl, -1.5 * gl); ctx.fillStyle = TS.mag; ctx.beginPath(); ctx.arc(0, -57, 29, 0, TAU); ctx.fill(); ctx.restore();
        ctx.restore();
      }
      put(ctx, st, 'armF', { r: 0.2 * sin(t * 2.8 + 1) * m + 0.4 * buff + 0.2 * guard, x: 0, y: 0 });
      put(ctx, st, 'ribbon', { r: 0.14 * sin(t * 2.3) * m - 0.18 * tele + 0.2 * hurt + 0.1 * br, sy: 1 + 0.05 * sin(t * 4.4) * m });
      put(ctx, st, 'key', {
        sy: 1 + 0.02 * br, sx: 1 - 0.02 * br + 0.06 * guard,
        kids(c) {
          // the face: normally ":)" in glowing magenta; in a glitch an X for an eye, a flipped mouth and a stuttering offset
          const ob = blink(t, 'typo', 3.4), off = gl > 0.3 ? 2.4 * (hv('tsf', 'o' + Math.floor(t * 20)) - 0.5) : 0, bad = gl > 0.3 || hot > 0.5;
          c.save(); c.translate(off, 0);
          tk.glow(c, 0, -58, 30, TS.mag, 0.32 + 0.3 * gl);
          const lw = 3.2;
          // eyes
          if (ob < 0.3) { tk.inkPath(c, [[-14, -61], [-9, -59.4], [-4, -61]], { w: lw, color: TS.magL, taper: 0.3, wobble: 0 }); tk.inkPath(c, [[4, -61], [9, -59.4], [14, -61]], { w: lw, color: TS.magL, taper: 0.3, wobble: 0 }); }
          else {
            c.fillStyle = bad ? TS.cyan : TS.magL; c.beginPath(); c.ellipse(-9, -62, 3.6, 5, 0, 0, TAU); c.fill();
            if (bad) { tk.inkPath(c, [[5, -67], [13, -57]], { w: lw, color: TS.magL, taper: 0.1, pressure: 'flat', wobble: 0 }); tk.inkPath(c, [[13, -67], [5, -57]], { w: lw, color: TS.magL, taper: 0.1, pressure: 'flat', wobble: 0 }); }
            else { c.beginPath(); c.ellipse(9, -62, 3.6, 5, 0, 0, TAU); c.fill(); c.fillStyle = '#ffffff'; c.beginPath(); c.arc(7.8, -63.6, 1.3, 0, TAU); c.fill(); c.beginPath(); c.arc(-10.2, -63.6, 1.3, 0, TAU); c.fill(); }
          }
          // mouth
          if (bad) tk.inkPath(c, [[-9, -46], [-3, -50], [3, -46], [9, -50]], { w: lw, color: TS.magL, taper: 0.25, wobble: 0 });
          else tk.inkPath(c, [[-9, -50], [-3, -45.4], [3, -45.4], [9, -50]], { w: lw, color: TS.magL, taper: 0.25, wobble: 0 });
          c.restore();
          if (gl > 0.3) { c.save(); c.globalAlpha = 0.85; c.fillStyle = TS.cyan; const sy0 = -72 + 22 * hv('tsb', 'y' + Math.floor(t * 20)); c.fillRect(-20, sy0, 40, 2.6); c.restore(); }
        },
      });
      put(ctx, st, 'armN', { r: -0.2 * sin(t * 2.8) * m - 0.9 * wind - 0.2 * tele + 1.6 * strike + 0.4 * hurt + 0.8 * guard });
      ctx.restore();
      // stray letters peeling off the key, always a few, many when glitching
      const nL = 2 + Math.round(4 * gl);
      for (let i = 0; i < nL; i++) {
        const per = 1.2 + 0.4 * hv('tsl', 'p' + i), u = (((t + hv('tsl', 'o' + i) * per) % per) + per) % per / per, ch = 'xq#@?!%&zt'.charAt(Math.floor(hv('tsl', 'c' + i) * 10));
        ctx.save(); ctx.globalAlpha = cA(sin(u * PI) * 0.9) * (1 - die); ctx.translate(dx + (hv('tsl', 'x' + i) - 0.5) * 60 + sin(u * 4 + i) * 6, -92 + dy - u * 34); ctx.rotate(sin(u * 3 + i) * 0.5);
        ctx.fillStyle = i % 2 ? TS.mag : TS.cyan; ctx.font = '900 ' + Math.round(9 + 4 * hv('tsl', 's' + i)) + 'px ' + tk.font.num; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ch, 0, 0); ctx.restore();
      }
      if (atk && E0.p > 0.46 && E0.p < 0.8) { const u = (E0.p - 0.46) / 0.34; ctx.save(); ctx.globalAlpha = (1 - u) * 0.9; ctx.globalCompositeOperation = 'lighter'; tk.glow(ctx, -70 + dx, -52 + dy, 20 + 24 * u, TS.mag, 0.9); ctx.restore(); tk.sparkle(ctx, -72 + dx, -52 + dy, 12 * (1 - u * 0.4), { color: '#ffd0e8', alpha: 1 - u, rot: u }); }
    },
  });
  // ===============================================================================================================
  // THE EDITOR (boss, xl), three forms in one spec. Parts and chains of all three forms live in BE_P and BE_C (prefixes p0_ p1_ p2_), each form has its
  // own rig in BE_RIG[phase]; the registered rig dispatches on st.phase.
  //   phase 0, THE EDITOR: a pale, tall, gaunt scholar in an ink-black gown with a stiff paper cravat, half-moon spectacles, silver hair swept back in a long
  //     tail, a stack of manuscript under one arm and a red pen as long as a spear in the other hand. Behind him a fan of manuscript pages (red edits and
  //     black bars on them) sways like a peacock's tail; proofreader's marks orbit him; the pen drips red. Accent: crimson ink.
  //   phase 1, THE ERASER: the gown has split: a hulking giant of pink rubber (the paper sleeve of an eraser round his belly, used blocks for pauldrons and
  //     knuckles, brass ferrules at the knees), the scholar's head small and furious on top, the robe in rags on his back, crumbs and graphite smears
  //     flying off him. Accent: furious red eyes behind cracked spectacles.
  //   phase 2, THE BLANK PAGE: a colossal tear in the page in the shape of a face: ragged paper lips curling back from a violet-black void, eyes and
  //     mouth as slits of blank white light, his broken spectacles floating over them, paper hands clawing in from the sides, a crack running to the floor,
  //     letters being sucked into the mouth, the storm leaking through. Accent: blinding blank white with storm cyan.
  // ===============================================================================================================
  const BE_P = {}, BE_C = {}, BE_RIG = [];
  const BE = {
    ink: '#140f2e', robe: '#231c4c', robeL: '#3d3274', robeD: '#120d2a', skin: '#ebe8f8', skinD: '#b9b3d8', hair: '#f6f2ff', hairD: '#b8b0e0', paper: '#fff8f0', paperD: '#d8c8e8',
    red: '#ff2a4a', redD: '#9a1226', redL: '#ff9aa8', lac: '#e8383d', gold: '#e2ae4c', goldD: '#a06f20', bar: '#0b0916', lilac: '#c9b8ff', cyan: '#5ff5ff', pink: '#f4a3b8', pinkL: '#ffd0dc', pinkD: '#c4607e',
  };
  // a manuscript page with its pivot at the bottom centre: kind 'a' is covered in red edits, 'b' in black bars
  function bePage(S, kind) {
    const g = S.g;
    S.cel([[-34, -106, 1], [-4, -109], [30, -107, 1], [36, -96, 1], [37, -52], [34, -2, 1], [2, 2], [-32, -1, 1], [-37, -50]], BE.paper, {
      depth: 8, tension: 0.2, hi: true, hiW: 2, rim: S.c.rim, shadow: BE.paperD, halftone: { d: 5, alpha: 0.2, color: '#8a7aa8' },
      decor(gg) {
        for (let i = 0; i < 10; i++) tk.inkPath(gg, [[-28, -94 + i * 9], [-28 + 50 * (0.55 + 0.45 * tk.vary('bep' + kind, 'w' + i)), -94 + i * 9 + (i % 2 ? 0.6 : -0.3)]], { w: 1.6, color: '#3b2f60', alpha: 0.8, taper: 0.1, pressure: 'flat', wobble: 0.1 });
        if (kind === 'a') {
          tk.inkPath(gg, [[-30, -85], [26, -86]], { w: 2.4, color: BE.red, taper: 0.1, pressure: 'flat', wobble: 0.1 });
          tk.inkPath(gg, [[-26, -58], [14, -59]], { w: 2.4, color: BE.red, taper: 0.1, pressure: 'flat', wobble: 0.1 });
          tk.inkPath(gg, [[8, -40], [12, -48], [16, -40]], { w: 2.2, color: BE.red, taper: 0.1, pressure: 'flat', wobble: 0 });
          tk.inkPath(gg, [[-30, -30], [-18, -40], [-6, -28], [6, -42]], { w: 2.2, color: BE.red, taper: 0.1, wobble: 0.1 });
          gg.beginPath(); gg.arc(22, -70, 9, 0, TAU); gg.strokeStyle = BE.red; gg.lineWidth = 2.2; gg.stroke();
        } else {
          gg.fillStyle = BE.bar; [[-30, -74, 46, 8], [-30, -48, 56, 8], [-30, -22, 30, 8]].forEach((b) => gg.fillRect(b[0], b[1], b[2], b[3]));
        }
      },
    });
    S.cel({ poly: [[24, -107], [36, -96], [24, -94]] }, BE.paperD, { depth: 1, line: 2.2, hi: false, rim: null, shadow: '#a898c8' });
    void g;
  }
  BE_P.p0_pageA = { box: [-46, -118, 46, 10], pivot: [0, 0], draw(S) { bePage(S, 'a'); } };
  BE_P.p0_pageB = { box: [-46, -118, 46, 10], pivot: [0, 0], draw(S) { bePage(S, 'b'); } };
  BE_P.p0_robe = {
    box: [-92, -262, 94, 4], pivot: [0, -150],
    draw(S) {
      const hem = zig(70, -70, -8, 14, 11, 6, 61);
      const pts = [[-16, -254], [2, -258], [18, -254], [38, -240], [46, -206], [40, -158], [52, -100], [68, -40]].concat(hem).concat([[-66, -42], [-50, -100], [-36, -158], [-42, -206], [-38, -240]]);
      S.cel(pts, BE.robe, {
        depth: 24, tension: 0.5, hi: true, hiW: 3, rim: S.c.rim, halftone: { d: 5, alpha: 0.34 },
        decor(g) {
          g.fillStyle = BE.robeL; g.globalAlpha = 0.5;
          [[-26, -230, -44, -20], [4, -236, 4, -14], [30, -226, 40, -18]].forEach((f) => { g.beginPath(); g.moveTo(f[0], f[1]); g.lineTo(f[0] + 14, f[1] + 4); g.lineTo(f[2] + 20, f[3]); g.lineTo(f[2], f[3]); g.closePath(); g.fill(); });
          g.globalAlpha = 1;
          for (let i = 0; i < 6; i++) tk.inkPath(g, [[-34 + i * 14, -150], [-44 + i * 18, -22]], { w: 2, color: '#0a0720', alpha: 0.7, taper: 0.3, wobble: 0.1, seed: i });
          // gold thread down the front edge and white ink splashes: the gown is covered in corrections
          tk.inkPath(g, [[-4, -250], [-6, -150], [-12, -22]], { w: 2.4, color: BE.gold, alpha: 0.9, taper: 0.1, pressure: 'flat', wobble: 0.04 });
          for (let i = 0; i < 9; i++) { const x = -34 + 70 * tk.vary('bes', 'x' + i), y = -226 + 200 * tk.vary('bes', 'y' + i); g.fillStyle = 'rgba(255,248,240,0.7)'; g.beginPath(); g.arc(x, y, 1.6 + 2 * tk.vary('bes', 'r' + i), 0, TAU); g.fill(); }
          // the belt of a cord with a brass pen-case
          g.fillStyle = '#0a0720'; g.beginPath(); g.moveTo(-40, -160); g.lineTo(42, -164); g.lineTo(44, -150); g.lineTo(-42, -146); g.closePath(); g.fill();
          g.fillStyle = BE.gold; g.fillRect(-14, -158, 16, 10);
          // a ragged white hem: the Blank has already begun on him
          g.fillStyle = BE.paper; g.beginPath(); g.moveTo(-90, -22);
          for (let k = 0; k <= 12; k++) g.lineTo(-90 + k * 15, -22 + (k % 2 ? -6 : 1) + (tk.vary('behem', 'k' + k) - 0.5) * 3);
          g.lineTo(100, 8); g.lineTo(-90, 8); g.closePath(); g.fill();
          g.fillStyle = BE.bar; [[-50, -14, 26], [-6, -16, 22], [30, -14, 28]].forEach((b) => g.fillRect(b[0], b[1], b[2], 6));
        },
      });
    },
  };
  BE_P.p0_strips = {
    box: [-50, -162, 50, -10], pivot: [0, -158],
    draw(S) {
      [[-30, 78, 0.04], [-10, 92, -0.02], [10, 70, 0.03], [30, 84, -0.04]].forEach((tb, i) => {
        const x = tb[0], h = tb[1];
        S.cel({ poly: [[x - 8, -154], [x + 8, -154 + tb[2] * 20], [x + 7, -154 + h], [x - 7, -154 + h + 4]] }, BE.paper, { depth: 3, line: 2.6, hi: false, rim: S.c.rim, tension: 0.1, shadow: BE.paperD });
        for (let k = 0; k < 3; k++) tk.inkPath(S.g, [[x - 4, -146 + k * 12 + i], [x + 4, -146 + k * 12 + i]], { w: 1.2, color: '#8a7aa8', alpha: 0.85, taper: 0.1, pressure: 'flat' });
        S.cel({ poly: [[x - 8, -154 + h * 0.55], [x + 8, -154 + h * 0.55 + 1], [x + 8, -154 + h * 0.55 + 8], [x - 8, -154 + h * 0.55 + 7]] }, BE.bar, { depth: 1, line: 0, hi: false, rim: null, shadow: false });
      });
    },
  };
  BE_P.p0_cravat = {
    box: [-36, -262, 30, -184], pivot: [-4, -250],
    draw(S) {
      // a stiff high collar, then three layers of pleated white frill down the chest and a red ink-drop brooch
      S.cel([[-26, -250], [-22, -266], [-8, -270], [-8, -252]], BE.robe, { depth: 3, line: 2.6, tension: 0.3, hi: false, rim: S.c.rim });
      [[-24, 24, -250, -226], [-20, 20, -230, -208], [-15, 15, -212, -190]].forEach((fr, i) => {
        const pts = [[fr[0] - 4, fr[2]], [fr[1] + 4, fr[2]], [fr[1] + 2, fr[3]]];
        for (let k = 4; k >= 0; k--) pts.push([lerp(fr[1], fr[0], k / 4) + (k % 2 ? 0 : 0), fr[3] + (k % 2 ? 6 : 0) - 2]);
        S.cel(pts, BE.paper, { depth: 4, line: 2.8, tension: 0.3, hi: true, hiW: 1.2, rim: S.c.rim, shadow: BE.paperD, halftone: { d: 4, alpha: 0.2, color: '#8a7aa8' } });
        for (let k = 0; k < 4; k++) tk.inkPath(S.g, [[fr[0] + 6 + k * (fr[1] - fr[0] - 8) / 3, fr[2] + 4], [fr[0] + 6 + k * (fr[1] - fr[0] - 8) / 3 - 1, fr[3] - 2]], { w: 1.2, color: '#a898c8', alpha: 0.8, taper: 0.2 });
      });
      S.cel([[-4, -222], [-9, -214], [-4, -205], [1, -214]], BE.red, { depth: 2, line: 2.4, tension: 0.4, hi: false, rim: '#ffd0d8', shadow: BE.redD });
    },
  };
  // the head: a long pale face turned to the left, with the nose out front and the hair slicked back (the long tail is a chain)
  BE_P.p0_head = {
    box: [-48, -332, 40, -236], pivot: [-2, -258],
    draw(S) {
      S.cel([[22, -300], [30, -284], [26, -266], [14, -252]], BE.skinD, { depth: 1, line: 0, tension: 0.5, hi: false, rim: null, shadow: false });
      S.cel([[-22, -304], [-6, -314], [14, -306], [23, -286], [20, -266], [10, -250], [-6, -246], [-14, -254], [-23, -266], [-24, -270], [-35, -271, 1], [-27, -279], [-25, -292]], BE.skin, {
        depth: 11, tension: 0.5, hi: true, hiW: 2.2, rim: '#ffffff', shadow: BE.skinD, halftone: { d: 5, alpha: 0.22, color: '#7a6ac0' },
        decor(g) {
          tk.inkPath(g, [[-20, -262], [-12, -259], [-6, -262]], { w: 1.6, color: '#7a6a9a', taper: 0.4 });                  // the thin pressed mouth
          tk.inkPath(g, [[2, -256], [6, -262], [10, -270]], { w: 1.2, color: '#a898c8', alpha: 0.8, taper: 0.4 });          // a hollow cheek
          tk.inkPath(g, [[-24, -279], [-18, -277]], { w: 1.4, color: '#a898c8', taper: 0.4 });
        },
      });
      // the ear, then the slicked hair
      S.cel(E(14, -276, 4.6, 8, 10), BE.skin, { depth: 1, line: 2.4, hi: false, rim: null, shadow: BE.skinD });
      S.cel([[-22, -302], [-4, -316], [16, -308], [26, -286], [18, -296], [2, -300], [-10, -298]], BE.hair, { depth: 4, line: 3, tension: 0.5, hi: true, hiW: 1.6, rim: S.c.rim, shadow: BE.hairD });
      tk.inkPath(S.g, [[-14, -306], [0, -310], [12, -304]], { w: 2, color: '#ffffff', alpha: 0.9, taper: 0.4, wobble: 0 });
    },
  };
  BE_C.p0_hair = {
    spine: [[14, -298], [40, -298], [58, -278], [64, -246], [56, -212]], cuts: [0.3, 0.62], reach: 40, overlap: 6,
    draw(S) {
      const sp = [[14, -298], [40, -298], [58, -278], [64, -246], [56, -212]];
      S.rib(sp, BE.hair, { wMax: 15, w0: 11, w1: 2, tipPow: 1.1, shadow: BE.hairD, rim: S.c.rim, rimW: 1.4, line: 3, gloss: true, glossColor: '#ffffff', glossAlpha: 0.9, strands: 3 });
      S.cel(E(34, -303, 4.6, 8, 8, 0.4), BE.red, { depth: 1, line: 2.4, hi: false, rim: '#ffd0d8', shadow: BE.redD });          // a red ribbon tie
    },
  };
  BE_P.p0_armF = {
    box: [-130, -262, -10, -120], pivot: [-38, -238],
    draw(S) {
      S.cel([[-26, -250], [-52, -250], [-80, -214], [-100, -168, 1], [-72, -144, 1], [-52, -178], [-26, -214]], BE.robe, { depth: 12, tension: 0.6, hi: true, hiW: 2.4, rim: S.c.rim, halftone: { d: 5, alpha: 0.32 } });
      // the cuff: white, spattered red
      S.cel({ poly: [[-104, -172], [-70, -148], [-64, -130], [-102, -150]] }, BE.paper, { depth: 2, line: 2.8, hi: false, rim: null, shadow: BE.paperD });
      for (let i = 0; i < 4; i++) S.ell(-96 + i * 8, -150 + i * 5 - 4, 2 + (i % 2), 2 + (i % 2), BE.red, { line: 0, hi: false, rim: null, shadow: false });
      // the hand: long pale fingers around the pen
      S.cel(E(-84, -142, 9.6, 8.6, 10), BE.skin, { depth: 2, line: 2.6, hi: false, rim: '#ffffff', shadow: BE.skinD });
      [[-92, -148], [-86, -151], [-80, -150]].forEach((f) => S.line([[f[0], f[1]], [f[0] - 4, f[1] - 6]], { w: 3, color: BE.skin, taper: 0.3 }));
    },
  };
  // the red pen: a lacquer barrel with gold bands and a long dipped nib, grip point at the origin, the nib pointing up
  BE_P.p0_pen = {
    box: [-20, -214, 20, 76], pivot: [0, 0],
    draw(S) {
      S.cel(cap(0, 66, 0, -118, 14, 10), BE.lac, { depth: 4, line: 3.2, hi: true, hiW: 1.8, rim: '#ffb0b8', tension: 0.5, shadow: BE.redD });
      [[-100, 5], [40, 4], [-16, 4]].forEach((b) => S.cel({ poly: [[-8, b[0]], [8, b[0]], [8, b[0] + b[1]], [-8, b[0] + b[1]]] }, BE.gold, { depth: 1, line: 2, hi: false, rim: '#fff0b0', shadow: BE.goldD }));
      S.cel(E(0, 70, 8, 8, 10), BE.gold, { depth: 2, line: 2.6, hi: true, hiW: 1.2, rim: '#fff0b0', shadow: BE.goldD });
      // the nib
      S.cel([[-9, -118, 1], [-12, -142], [-5, -176], [0, -204, 1], [5, -176], [12, -142], [9, -118, 1]], BE.gold, { depth: 4, line: 3, tension: 0.5, hi: true, hiW: 1.6, rim: '#fff4c0', shadow: BE.goldD });
      S.line([[0, -190], [0, -150]], { w: 1.8, color: BE.goldD, taper: 0.2, pressure: 'flat' });
      S.cel(E(0, -146, 3.2, 3.2, 8), BE.ink, { depth: 0, line: 1.4, hi: false, rim: null, shadow: false });
      S.cel([[-6, -176, 1], [0, -204, 1], [6, -176, 1], [3, -184], [0, -198], [-3, -184]], BE.red, { depth: 1, line: 0, tension: 0, hi: false, rim: null, shadow: false });   // ink on the tip
    },
  };
  BE_P.p0_armB = {
    box: [4, -262, 104, -120], pivot: [40, -238],
    draw(S) {
      S.cel([[30, -250], [56, -246], [82, -208], [92, -170, 1], [56, -150, 1], [44, -184], [28, -216]], BE.robe, { depth: 12, tension: 0.6, hi: true, hiW: 2.2, rim: S.c.rim, halftone: { d: 5, alpha: 0.32 } });
      S.cel({ poly: [[56, -156], [92, -174], [98, -160], [62, -142]] }, BE.paper, { depth: 2, line: 2.8, hi: false, rim: null, shadow: BE.paperD });
      S.cel(E(76, -150, 9, 8, 10), BE.skin, { depth: 2, line: 2.6, hi: false, rim: '#ffffff', shadow: BE.skinD });
    },
  };
  BE_P.p0_stack = {
    box: [-46, -50, 46, 50], pivot: [0, 0],
    draw(S) {
      for (let i = 0; i < 5; i++) S.cel({ poly: [[-34 + i * 2, -34 + i * 9], [32 - i * 1, -36 + i * 9 + (i % 2)], [34 - i * 2, -26 + i * 9], [-32 + i, -24 + i * 9]] }, i % 2 ? BE.paper : '#f0e6d4', { depth: 2, line: 2.4, hi: false, rim: S.c.rim, shadow: BE.paperD });
      S.cel({ poly: [[-30, -8], [30, -10], [30, -2], [-30, 0]] }, BE.lac, { depth: 1, line: 2.2, hi: false, rim: null, shadow: BE.redD });      // a red ribbon round the pile
      S.cel({ poly: [[-26, -46], [28, -48], [28, -36], [-26, -34]] }, BE.bar, { depth: 1, line: 2.4, hi: false, rim: null, shadow: false });
      S.cel(E(0, -4, 6, 6, 8), BE.gold, { depth: 1, line: 2, hi: false, rim: '#fff0b0', shadow: BE.goldD });
    },
  };
  // a floating proofreader's mark painted live: kind 0 pilcrow, 1 caret, 2 delete loop, 3 stet dots, 4 strike line
  function beMark(ctx, kind, x, y, s, rot, col, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = cA(a); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 3.4 * s; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    if (kind === 0) { ctx.moveTo(4 * s, 12 * s); ctx.lineTo(4 * s, -12 * s); ctx.moveTo(-3 * s, 12 * s); ctx.lineTo(-3 * s, -12 * s); ctx.moveTo(9 * s, -12 * s); ctx.lineTo(-3 * s, -12 * s); ctx.arc(-3 * s, -6 * s, 6 * s, -PI / 2, PI / 2, true); ctx.stroke(); }
    else if (kind === 1) { ctx.moveTo(-10 * s, 6 * s); ctx.lineTo(0, -8 * s); ctx.lineTo(10 * s, 6 * s); ctx.stroke(); }
    else if (kind === 2) { ctx.moveTo(-12 * s, 4 * s); ctx.bezierCurveTo(-4 * s, -12 * s, 12 * s, 8 * s, 12 * s, -2 * s); ctx.bezierCurveTo(12 * s, -14 * s, -6 * s, 6 * s, -2 * s, 12 * s); ctx.stroke(); }
    else if (kind === 3) { for (let i = -1; i <= 1; i++) { ctx.moveTo(i * 8 * s + 1.4 * s, 0); ctx.arc(i * 8 * s, 0, 1.4 * s, 0, TAU); } ctx.fill(); }
    else { ctx.moveTo(-12 * s, 0); ctx.lineTo(12 * s, 0); ctx.stroke(); }
    ctx.restore();
  }
  BE_RIG[0] = function (ctx, st) {
    const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die, atk = E0.pose === 'attack', p = atk ? E0.p : 0;
    const strike = atk ? E0.strike : 0, wind = atk ? E0.wind : 0, br = sin(TAU * t / 4.0) * m, hot = clamp(tele + buff + strike + guard * 0.4 + st.wound * 0.5, 0, 1);
    const dx = -strike * 36 + hurt * 14 + E0.shake * 1.2 + 6 * tele - 6 * wind, dy = 3 * tele + 3 * guard + 10 * die + 2 * br;
    const rot = -0.02 * strike + 0.04 * tele + 0.06 * hurt + 0.008 * br;
    let aF = 0.05 * br, gW = -0.8 + 0.04 * br, aB = -0.03 * br;
    if (atk) {
      if (p < 0.3) { const k = sm(p / 0.3); aF = lerp(0, 2.1, k); gW = lerp(-0.8, 0.45, k); }
      else if (p < 0.5) { const k = ease.inCubic((p - 0.3) / 0.2); aF = lerp(2.1, -0.2, k); gW = lerp(0.45, -2.2, k); }
      else { const k = sm((p - 0.5) / 0.5); aF = lerp(-0.2, 0.05 * br, k); gW = lerp(-2.2, -0.8, k); }
    } else if (E0.pose === 'telegraph') { aF = 2.1 * tele + 0.03 * E0.shake; gW = lerp(-0.8, 0.4, tele) + 0.03 * E0.shake; aB = -0.4 * tele; }
    else if (E0.pose === 'block') { aF = 0.7 * guard; gW = lerp(-0.8, -1.3, guard); aB = 1.5 * guard; }
    else if (E0.pose === 'buff') { aF = 0.9 * buff; gW = -0.8 + 0.7 * buff; aB = -0.7 * buff; }
    else if (E0.pose === 'hurt') { aF = 0.4 * hurt; gW = -0.8 + 0.4 * hurt; aB = 0.3 * hurt; }
    else if (die > 0) { aF = 0.5 * die; aB = -0.4 * die; }
    // the fan of pages: spread with the mood, each page swaying about the shoulders on its own phase
    const spread = 1 + 0.18 * tele + 0.3 * buff - 0.25 * guard;
    ctx.save();
    if (die > 0) ctx.transform(1, 0, 0, 1 - 0.1 * die, 0, 0);
    xform(ctx, 0, -150, dx, dy, rot, 1, 1 + 0.01 * br);
    {
      const n = 9;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1) - 0.5, a = u * 2.9 * spread + 0.05 * sin(t * (0.9 + 0.15 * i) + i) * m + 0.08 * hurt * (u > 0 ? 1 : -1), z = 0.88 + 0.12 * Math.abs(Math.cos(i * 1.7));
        ctx.save(); ctx.translate(4, -206); ctx.rotate(a); ctx.translate(0, -34 * (1 + 0.1 * hot)); ctx.scale(z, z);
        put(ctx, st, i % 2 ? 'p0_pageB' : 'p0_pageA', { r: 0.03 * sin(t * 1.3 + i * 1.7) * m });
        ctx.restore();
      }
      tk.glow(ctx, 4, -230, 130, BE.lilac, 0.16 + 0.12 * hot);
      { const gr = ctx.createRadialGradient(-4, -282, 8, -4, -282, 74); gr.addColorStop(0, 'rgba(26,19,64,0.92)'); gr.addColorStop(0.7, 'rgba(26,19,64,0.7)'); gr.addColorStop(1, 'rgba(26,19,64,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(-4, -282, 74, 0, TAU); ctx.fill(); }
    }
    putChain(ctx, st, 'p0_hair', [0.1 * sin(t * 1.6) * m + 0.15 * hurt - 0.2 * strike, 0.14 * sin(t * 1.6 - 0.9) * m, 0.2 * sin(t * 1.6 - 1.8) * m + 0.3 * tele * sin(t * 12)], { r: 0.02 * br + 0.06 * tele });
    if (guard < 0.3) put(ctx, st, 'p0_armB', { r: aB });
    put(ctx, st, 'p0_robe', { sy: 1 + 0.01 * br, r: 0.005 * br });
    put(ctx, st, 'p0_strips', { r: 0.05 * sin(t * 1.8 + 1) * m + 0.1 * strike - 0.07 * tele, sy: 1 + 0.02 * sin(t * 2.6) * m });
    put(ctx, st, 'p0_cravat', { sy: 1 + 0.015 * br, r: 0.01 * br });
    // the stack held in the back arm, its ribbon trailing
    {
      const ca = cos(aB), sa = sin(aB), hx = 76, hy = -150, px = 40 + (hx - 40) * ca - (hy + 238) * sa, py = -238 + (hx - 40) * sa + (hy + 238) * ca;
      put(ctx, st, 'p0_stack', { x: px - 18 - 40 * guard, y: py + 10 - 40 * guard, r: -0.1 + 0.03 * sin(t * 1.7) * m - 0.2 * guard + 0.2 * hurt });
    }
    if (guard >= 0.3) put(ctx, st, 'p0_armB', { r: aB });
    put(ctx, st, 'p0_head', {
      r: 0.02 * sin(t * 1.1) * m - 0.04 * tele + 0.05 * strike + 0.1 * hurt, y: 2 * tele, sx: 1.2, sy: 1.2,
      kids(c) {
        const ob = blink(t, 'editor', 4.6) * (1 - 0.5 * hurt), look = [-0.6 + 0.3 * sin(t * 0.7) * m, 0.1];
        // eyes: pale with red pupils, narrowed; flaring when hot
        eyeLive(c, -15, -279, 6.6, 4.4 + 1.8 * hot, { open: ob, iris: ['#ff6a7a', BE.red], sclera: '#fff8f0', pupil: 'slit', look, glow: BE.red, glowK: 0.5 + 0.5 * hot, glowR: 3, lw: 2, lidTop: 0.3 - 0.1 * hot, lidColor: BE.skinD, rot: 0.12 });
        eyeLive(c, 3, -280, 5.6, 4.2 + 1.8 * hot, { open: ob, iris: ['#ff6a7a', BE.red], sclera: '#fff8f0', pupil: 'slit', look, glow: BE.red, glowK: 0.5 + 0.5 * hot, glowR: 3, lw: 2, lidTop: 0.3 - 0.1 * hot, lidColor: BE.skinD, rot: -0.1 });
        // the half-moon spectacles in gold wire, with a glint that slides across the lenses
        c.save();
        tk.inkPath(c, [[-23, -281], [-15, -272], [-6, -278]], { w: 1.8, color: BE.gold, taper: 0.2, pressure: 'flat', wobble: 0 });
        tk.inkPath(c, [[-6, -278], [-2, -280], [-3, -280]], { w: 1.8, color: BE.gold, taper: 0.2, pressure: 'flat', wobble: 0 });
        tk.inkPath(c, [[-1, -281], [3, -272], [11, -278]], { w: 1.8, color: BE.gold, taper: 0.2, pressure: 'flat', wobble: 0 });
        c.globalAlpha = 0.25; c.fillStyle = '#cfe6ff'; c.beginPath(); c.moveTo(-24, -282); c.lineTo(-6, -280); c.lineTo(-10, -270); c.lineTo(-20, -270); c.fill(); c.beginPath(); c.moveTo(-1, -282); c.lineTo(11, -280); c.lineTo(8, -271); c.lineTo(0, -271); c.fill();
        c.globalAlpha = 1;
        const gl = ((t * 0.37) % 1 + 1) % 1;
        if (gl < 0.3) { c.globalAlpha = sin(gl / 0.3 * PI) * 0.9; c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(-20 + gl * 40, -282); c.lineTo(-17 + gl * 40, -282); c.lineTo(-20 + gl * 40, -272); c.lineTo(-23 + gl * 40, -272); c.fill(); }
        c.restore();
        // brows: thin, arched, one lifted; lower with the temper
        tk.inkPath(c, [[-24, -290 + 2 * hot], [-14, -293 + 2 * hot], [-5, -289 + 4 * hot]], { w: 2.4, color: '#6a5a96', taper: 0.4, wobble: 0 });
        tk.inkPath(c, [[-2, -290 + 4 * hot], [6, -294 + 2 * hot], [14, -289]], { w: 2.4, color: '#6a5a96', taper: 0.4, wobble: 0 });
        if (hurt > 0.25 || strike > 0.3) { c.fillStyle = BE.ink; c.beginPath(); c.ellipse(-14, -260, 4.4, 3 + 2 * hurt, 0, 0, TAU); c.fill(); }
      },
    });
    // the red pen on the hand of the front arm, dripping
    put(ctx, st, 'p0_armF', {
      r: aF,
      kids(c) { put(c, st, 'p0_pen', { x: -84, y: -142, r: gW - aF }); },
    });
    {
      const ang = gW, hx = -38 + (-84 + 38) * cos(aF) - (-142 + 238) * sin(aF), hy = -238 + (-84 + 38) * sin(aF) + (-142 + 238) * cos(aF);
      const tx = hx + sin(ang) * 204, ty = hy - cos(ang) * 204;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; tk.glow(ctx, tx, ty, 26 + 34 * hot, BE.red, 0.5 + 0.4 * hot); ctx.restore();
      for (let i = 0; i < 3; i++) { const per = 1.1 + 0.25 * i, u = ((t / per + i * 0.33) % 1 + 1) % 1; ctx.save(); ctx.globalAlpha = cA(sin(u * PI) * 1.3) * (1 - die); ctx.fillStyle = BE.red; ctx.beginPath(); ctx.ellipse(tx + 2 - 4 * i, ty + 6 + u * 70, 2.2, 3.4 + u * 3, 0, 0, TAU); ctx.fill(); ctx.restore(); }
      if (tele > 0.05 || (atk && p < 0.32)) { const k = tele || sm(p / 0.3); tk.sparkle(ctx, tx, ty - 6, 8 + 16 * k, { color: '#ffd0d8', alpha: 0.9 }); }
      // the strike: a long red strike-through line across the front, then a splash
      if (atk && p > 0.44 && p < 0.9) {
        const u = clamp((p - 0.44) / 0.46, 0, 1);
        ctx.save(); ctx.globalAlpha = (1 - ease.inQuad(u)) * 0.95;
        tk.inkPath(ctx, [[-60 + dx, -120 + dy], [-170 + dx, -110], [-300 + dx, -96 + 10 * sin(u * 9)]], { w: 14 * (1 - u * 0.5), color: BE.red, taper: 0.4, wobble: 0.06, pressure: 'mid' });
        tk.inkPath(ctx, [[-180 + dx, -132], [-300 + dx, -136]], { w: 4, color: '#ffd0d8', taper: 0.4, wobble: 0.1 });
        ctx.restore();
        for (let i = 0; i < 8; i++) { const fj = fling('beink' + i, 'b', u, { spread: 220, up: 90, g: 300, bias: -70 }); ctx.save(); ctx.globalAlpha = fj.a; ctx.fillStyle = BE.red; ctx.beginPath(); ctx.arc(-200 + dx + fj.x, -90 + fj.y, 2 + 3 * hv('beink', 's' + i), 0, TAU); ctx.fill(); ctx.restore(); }
      }
    }
    // proofreader's marks orbit him: a slow ring of red glyphs that tightens and speeds up when he is about to strike
    {
      const n = 6, spin = t * (0.4 + 0.9 * hot), rx = lerp(120, 96, tele) + 8 * buff;
      for (let i = 0; i < n; i++) {
        const a = spin + i * TAU / n, z = sin(a), x = cos(a) * rx - 4, y = -200 + sin(a * 1.0) * 20 + 14 * sin(t * 1.3 + i), s = 0.8 + 0.25 * z;
        beMark(ctx, i % 5, x + dx, y + dy, s, 0.3 * sin(t * 1.1 + i), z > 0 ? BE.red : '#8a1a34', (0.35 + 0.45 * (z * 0.5 + 0.5)) * (1 - die));
      }
    }
    ctx.restore();
    if (buff > 0.1) motes(ctx, dx, -200 + dy, t, 12, 'bebuff', { col: '#ff6a7a', size: 2.6, rise: 90, spread: 70, life: 0.9, alpha: buff });
  };
  // ---- phase 1: THE ERASER ---------------------------------------------------------------------------------------
  const BEE = { pink: '#f08ab0', pinkL: '#ffc4d8', pinkD: '#b8506e', smudge: '#767690', blue: '#4a7ae0', white: '#fff8f0', brass: '#e2ae4c', steel: '#b8bcd8', steelD: '#6a6e90' };
  // smudges of graphite and chewed corners painted into an eraser shape (decor)
  function eraserDecor(g, x0, y0, x1, y1, seed, n) {
    for (let i = 0; i < (n || 4); i++) {
      const x = x0 + (x1 - x0) * tk.vary('eras' + seed, 'x' + i), y = y0 + (y1 - y0) * tk.vary('eras' + seed, 'y' + i);
      tk.inkPath(g, [[x, y], [x + 14 + 10 * tk.vary('eras' + seed, 'l' + i), y + 3 * (tk.vary('eras' + seed, 'a' + i) - 0.5)], [x + 30, y + 2]], { w: 3.6 + 2 * tk.vary('eras' + seed, 'w' + i), color: BEE.smudge, alpha: 0.4, taper: 0.5, wobble: 0.2, seed: i });
    }
  }
  function eraserSleeve(S, x0, y0, x1, y1, sk) {
    S.cel({ poly: [[x0, y0], [x1, y0 + (sk || 0)], [x1, y1 + (sk || 0)], [x0, y1]] }, BEE.white, { depth: 4, line: 3, hi: false, rim: S.c.rim, shadow: '#d8c8e8', halftone: { d: 5, alpha: 0.2, color: '#8a7aa8' } });
    S.cel({ poly: [[x0, y0 + (y1 - y0) * 0.38], [x1, y0 + (y1 - y0) * 0.38 + (sk || 0)], [x1, y0 + (y1 - y0) * 0.62 + (sk || 0)], [x0, y0 + (y1 - y0) * 0.62]] }, BEE.blue, { depth: 1, line: 0, hi: false, rim: null, shadow: false });
  }
  function eraserLeg(S, cx, flip) {
    const sg = flip ? -1 : 1;
    S.cel([[cx - 28, -118], [cx + 28, -120], [cx + 31, -52, 1], [cx + 36, -10, 1], [cx - 36, -8, 1], [cx - 31, -54, 1]], BEE.pink, { depth: 12, tension: 0.3, hi: true, hiW: 2.4, rim: S.c.rim, halftone: { d: 5, alpha: 0.3 }, decor(g) { eraserDecor(g, cx - 28, -112, cx + 4, -16, cx, 3); } });
    S.cel({ poly: [[cx - 32, -62], [cx + 32, -62], [cx + 34, -42], [cx - 34, -42]] }, BEE.steel, { depth: 3, line: 3, hi: true, hiW: 1.4, rim: '#ffffff', shadow: BEE.steelD, decor(g) { for (let k = -3; k <= 3; k++) tk.inkPath(g, [[cx + k * 9, -62], [cx + k * 9, -42]], { w: 1.4, color: BEE.steelD, alpha: 0.8, taper: 0.1, pressure: 'flat' }); } });
    S.cel({ poly: [[cx - 40, -16], [cx + 40, -16], [cx + 42, 0], [cx - 42, 0]] }, '#5a5a6e', { depth: 2, line: 3, hi: false, rim: S.c.rim, shadow: '#3a3a4e' });     // the worn graphite foot
    void sg;
  }
  BE_P.p1_legN = { box: [-100, -128, 0, 6], pivot: [-44, -112], draw(S) { eraserLeg(S, -44, false); } };
  BE_P.p1_legF = { box: [-4, -128, 96, 6], pivot: [42, -112], draw(S) { eraserLeg(S, 42, true); } };
  BE_P.p1_torso = {
    box: [-112, -276, 114, -104], pivot: [0, -190],
    draw(S) {
      S.cel([[-84, -258, 1], [-30, -268], [34, -268], [88, -260, 1], [102, -232, 1], [92, -178], [76, -124, 1], [-66, -122, 1], [-90, -176], [-100, -232, 1]], BEE.pink, {
        depth: 26, tension: 0.35, hi: true, hiW: 3.2, rim: S.c.rim, halftone: { d: 5, alpha: 0.32 },
        decor(g) { eraserDecor(g, -84, -250, -40, -130, 11, 4); eraserDecor(g, 50, -250, 70, -130, 12, 3); tk.inkPath(g, [[62, -262], [56, -240], [66, -224], [58, -208]], { w: 2.4, color: BEE.pinkD, alpha: 0.9, taper: 0.4, wobble: 0.1 }); tk.inkPath(g, [[-70, -236], [-20, -228], [34, -240], [80, -226]], { w: 9, color: BEE.smudge, alpha: 0.22, taper: 0.5, wobble: 0.2 }); tk.inkPath(g, [[-60, -142], [0, -136], [60, -144]], { w: 7, color: BEE.smudge, alpha: 0.2, taper: 0.5, wobble: 0.2 }); tk.inkPath(g, [[-60, -134], [-52, -146], [-58, -158]], { w: 2.2, color: BEE.pinkD, alpha: 0.9, taper: 0.4, wobble: 0.1 }); },
      });
      // the paper sleeve of the eraser: a white wrap round the belly with a blue band and the maker's mark
      eraserSleeve(S, -86, -204, 96, -150, 3);
      S.g.save(); S.g.font = '900 17px ' + tk.font.num; S.g.textAlign = 'center'; S.g.textBaseline = 'middle'; S.g.fillStyle = '#ffffff'; S.g.strokeStyle = BEE.blue;
      S.g.fillText('ERASE', 4, -177); S.g.restore();
      // chewed bites out of the torso where he has rubbed himself away
      [[-92, -200], [96, -214], [-70, -134]].forEach((b, i) => S.cel([[b[0] - 7, b[1] - 6, 1], [b[0] + 5, b[1] - 2, 1], [b[0] - 2, b[1] + 8, 1]], '#7a2a44', { depth: 1, line: 2, tension: 0, hi: false, rim: null, shadow: false }));
    },
  };
  function eraserPad(S, cx, sg) {
    S.cel([[cx - 34, -246, 1], [cx + 32, -252, 1], [cx + 40, -222], [cx + 28, -204, 1], [cx - 34, -208, 1], [cx - 42, -228]], BEE.pink, { depth: 9, tension: 0.3, hi: true, hiW: 2.4, rim: S.c.rim, halftone: { d: 5, alpha: 0.3 }, decor(g) { eraserDecor(g, cx - 30, -240, cx + 8, -210, cx, 3); } });
    S.cel([[cx - 24, -264, 1], [cx + 22, -268, 1], [cx + 30, -248, 1], [cx - 28, -246, 1]], BEE.pinkL, { depth: 5, line: 3.2, tension: 0.2, hi: true, hiW: 1.6, rim: S.c.rim, shadow: BEE.pink });
    S.cel(E(cx + 8 * sg, -236, 4, 4, 8), BEE.brass, { depth: 1, line: 2, hi: false, rim: null });
  }
  BE_P.p1_padN = { box: [-146, -278, -50, -194], pivot: [-100, -232], draw(S) { eraserPad(S, -100, -1); } };
  BE_P.p1_padF = { box: [52, -278, 148, -194], pivot: [100, -232], draw(S) { eraserPad(S, 100, 1); } };
  function eraserArm(S, sx) {
    // shoulder to fist: a thick arm and a fist that is one whole eraser block, worn at the knuckles
    const x = (v) => sx * v;
    S.cel(cap(x(100), -232, x(122), -150, 58, 52), BEE.pink, { depth: 10, tension: 0.4, hi: true, hiW: 2.2, rim: S.c.rim, halftone: { d: 5, alpha: 0.3 } });
    S.cel(cap(x(122), -150, x(130), -84, 54, 50), BEE.pinkL, { depth: 9, tension: 0.4, hi: true, hiW: 2, rim: S.c.rim });
    S.cel({ poly: [[x(94), -154], [x(150), -158], [x(152), -142], [x(96), -138]] }, BEE.steel, { depth: 2, line: 2.8, hi: false, rim: '#ffffff', shadow: BEE.steelD });
    const pts = [[x(86), -108, 1], [x(176), -110, 1], [x(186), -84], [x(178), -26, 1], [x(90), -24, 1], [x(80), -64]];
    S.cel(sx < 0 ? pts.slice().reverse() : pts, BEE.pink, { depth: 14, tension: 0.3, hi: true, hiW: 2.6, rim: S.c.rim, halftone: { d: 5, alpha: 0.32 }, decor(g) { eraserDecor(g, Math.min(x(90), x(170)), -100, Math.max(x(90), x(170)), -30, 7 + sx, 5); } });
    S.cel({ poly: [[x(86), -108], [x(176), -110], [x(172), -98], [x(90), -96]] }, BEE.pinkL, { depth: 1, line: 0, hi: false, rim: null, shadow: false });
    eraserSleeve(S, Math.min(x(88), x(178)), -76, Math.max(x(88), x(178)), -50, 0);
  }
  BE_P.p1_armF = { box: [-206, -272, -50, -14], pivot: [-100, -232], draw(S) { eraserArm(S, -1); } };
  BE_P.p1_armB = { box: [50, -272, 206, -14], pivot: [100, -232], draw(S) { eraserArm(S, 1); } };
  BE_P.p1_head = { box: BE_P.p0_head.box, pivot: BE_P.p0_head.pivot, draw: BE_P.p0_head.draw };
  BE_C.p1_cloak = {
    spine: [[0, -262], [0, -200], [0, -130], [0, -64]], cuts: [0.34, 0.68], reach: 118, overlap: 6,
    draw(S) {
      const pts = [[-70, -262], [0, -274], [70, -262], [112, -230], [106, -150], [118, -92, 1]].concat(zig(118, -118, -92, 26, 8, 16, 71)).concat([[-106, -150], [-112, -230]]);
      S.cel(pts, BE.robe, {
        depth: 22, tension: 0.4, hi: true, hiW: 2.6, rim: S.c.rim, halftone: { d: 5, alpha: 0.34 },
        decor(g) { for (let i = 0; i < 7; i++) tk.inkPath(g, [[-90 + i * 30, -240], [-96 + i * 32, -110]], { w: 2, color: '#0a0720', alpha: 0.7, taper: 0.3, wobble: 0.1, seed: i }); g.fillStyle = 'rgba(255,248,240,0.75)'; for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(-96 + 190 * tk.vary('bec', 'x' + i), -250 + 150 * tk.vary('bec', 'y' + i), 2 + 2 * tk.vary('bec', 'r' + i), 0, TAU); g.fill(); } },
      });
    },
  };
  BE_RIG[1] = function (ctx, st) {
    const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die, atk = E0.pose === 'attack', p = atk ? E0.p : 0;
    const strike = atk ? E0.strike : 0, wind = atk ? E0.wind : 0, br = sin(TAU * t / 3.2) * m, hot = clamp(tele + buff + strike + guard * 0.3 + st.wound * 0.6, 0, 1);
    const dx = -strike * 56 + hurt * 18 + E0.shake * 1.3 + 8 * tele - 10 * wind, dy = 5 * tele + 4 * guard + 12 * die + 3 * br * 0.5 - 4 * buff;
    const rot = -0.05 * strike + 0.05 * tele + 0.06 * hurt + 0.012 * br;
    let aF = 0.06 * br, aB = -0.06 * br - 0.04;
    if (atk) {
      if (p < 0.3) { const k = sm(p / 0.3); aF = lerp(0, 2.5, k); aB = lerp(-0.04, -2.2, k); }
      else if (p < 0.5) { const k = ease.inCubic((p - 0.3) / 0.2); aF = lerp(2.5, -0.5, k); aB = lerp(-2.2, 0.3, k); }
      else { const k = sm((p - 0.5) / 0.5); aF = lerp(-0.5, 0.06 * br, k); aB = lerp(0.3, -0.04, k); }
    } else if (E0.pose === 'telegraph') { aF = 2.5 * tele + 0.03 * E0.shake; aB = -2.3 * tele - 0.03 * E0.shake; }
    else if (E0.pose === 'block') { aF = 1.4 * guard; aB = 1.1 * guard; }
    else if (E0.pose === 'buff') { aF = 1.5 * buff; aB = -1.5 * buff; }
    else if (E0.pose === 'hurt') { aF = 0.5 * hurt; aB = -0.3 * hurt; }
    else if (die > 0) { aF = 0.5 * die; aB = -0.5 * die; }
    const heave = 1 + 0.018 * br - 0.03 * tele + 0.02 * buff;
    ctx.save();
    if (die > 0) ctx.transform(1 + 0.08 * die, 0, 0, 1 - 0.12 * die, -6 * die, 0);
    { ctx.save(); ctx.globalCompositeOperation = 'lighter'; tk.glow(ctx, dx, -190 + dy, 190, '#ff6a8a', (0.12 + 0.25 * hot) * (1 - die)); ctx.restore(); }
    xform(ctx, 0, -112, dx, dy, rot, 1, 1);
    putChain(ctx, st, 'p1_cloak', [0.04 * sin(t * 1.4) * m + 0.05 * tele, 0.08 * sin(t * 1.4 - 0.9) * m + 0.1 * hurt, 0.12 * sin(t * 1.4 - 1.8) * m + 0.2 * strike]);
    put(ctx, st, 'p1_legF', { r: 0.02 * br });
    put(ctx, st, 'p1_armB', { r: aB });
    put(ctx, st, 'p1_padF', { r: 0.03 * br + 0.1 * (tele + buff), y: -3 * tele });
    put(ctx, st, 'p1_torso', { sy: heave, sx: 1 + 0.008 * br });
    put(ctx, st, 'p1_legN', { r: -0.02 * br });
    if (guard >= 0.3) put(ctx, st, 'p1_armB', { r: aB });
    // hair, then the little furious head on the big body (the Editor's own head, scaled up, with its cracked spectacles)
    ctx.save();
    ctx.translate(-2, -266); ctx.scale(1.34, 1.34); ctx.translate(2, 258);
    putChain(ctx, st, 'p0_hair', [-0.1 + 0.2 * sin(t * 4.1) * m * (0.4 + hot) + 0.2 * hurt, 0.3 * sin(t * 4.1 - 0.9) * m * (0.4 + hot), 0.4 * sin(t * 4.1 - 1.8) * m * (0.4 + hot)], { r: -0.3 + 0.1 * tele });
    ctx.restore();
    put(ctx, st, 'p1_head', {
      x: 0, y: -8 + 2 * br, sx: 1.34, sy: 1.34, r: 0.03 * sin(t * 1.2) * m - 0.1 * tele + 0.08 * strike + 0.12 * hurt,
      kids(c) {
        const ob = blink(t, 'editor1', 6.2) * (1 - 0.5 * hurt), jaw = clamp(0.25 + 0.75 * (tele + strike * 0.8 + buff + hurt * 0.7), 0, 1);
        // red furious eyes, big, with a hard angry lid
        eyeLive(c, -15, -279, 7.4, 5.4 + 1.6 * hot, { open: ob, iris: ['#ff8a96', '#ff1a3a'], sclera: '#fff0f0', pupil: 'dot', pupilColor: '#3a0010', look: [-0.8, 0.1], glow: BE.red, glowK: 0.9 + 0.1 * hot, glowR: 3.4, lw: 2, lidTop: 0.5, lidColor: BE.skinD, rot: 0.34 });
        eyeLive(c, 3, -280, 6.4, 5.2 + 1.6 * hot, { open: ob, iris: ['#ff8a96', '#ff1a3a'], sclera: '#fff0f0', pupil: 'dot', pupilColor: '#3a0010', look: [-0.8, 0.1], glow: BE.red, glowK: 0.9 + 0.1 * hot, glowR: 3.4, lw: 2, lidTop: 0.5, lidColor: BE.skinD, rot: -0.3 });
        // the spectacles, cracked: one lens starred, the frame bent
        c.save();
        tk.inkPath(c, [[-23, -282], [-15, -271], [-6, -279]], { w: 2, color: BE.gold, taper: 0.2, pressure: 'flat', wobble: 0 });
        tk.inkPath(c, [[-1, -283], [3, -271], [11, -279]], { w: 2, color: BE.gold, taper: 0.2, pressure: 'flat', wobble: 0 });
        c.globalAlpha = 0.28; c.fillStyle = '#cfe6ff'; c.beginPath(); c.moveTo(-24, -282); c.lineTo(-6, -280); c.lineTo(-10, -270); c.lineTo(-20, -270); c.fill();
        c.globalAlpha = 1;
        [[-14, -276, -22, -283], [-14, -276, -8, -270], [-14, -276, -19, -270], [-14, -276, -6, -281]].forEach((k) => tk.inkPath(c, [[k[0], k[1]], [k[2], k[3]]], { w: 1.2, color: '#ffffff', alpha: 0.95, taper: 0.4, wobble: 0 }));
        c.restore();
        // a snarling mouth: the gritted line opens into a roar
        c.save(); c.fillStyle = '#2a0a1a'; c.beginPath(); c.ellipse(-12, -260, 7, 2 + 6 * jaw, 0, 0, TAU); c.fill();
        c.fillStyle = '#ffffff'; c.fillRect(-18, -262 - 2 * jaw, 12, 2.4); c.restore();
        tk.inkPath(c, [[-26, -292 + 5], [-14, -289 + 5], [-4, -283 + 3]], { w: 3, color: '#4a3a76', taper: 0.4, wobble: 0 });
        tk.inkPath(c, [[-2, -284 + 3], [8, -289 + 5], [16, -293 + 5]], { w: 3, color: '#4a3a76', taper: 0.4, wobble: 0 });
      },
    });
    if (guard < 0.3) { /* the front arm is always in front of the torso */ }
    put(ctx, st, 'p1_padN', { r: -0.03 * br - 0.1 * (tele + buff), y: -3 * tele });
    put(ctx, st, 'p1_armF', { r: aF });
    ctx.restore();
    // crumbs shedding off him and graphite smoke: more when he is angry
    const nc = 6 + Math.round(8 * hot);
    for (let i = 0; i < nc; i++) {
      const per = 1.1 + 0.5 * hv('beer', 'p' + i), u = (((t + hv('beer', 'o' + i) * per) % per) + per) % per / per, x = dx + (hv('beer', 'x' + i) - 0.5) * 220, y0 = -240 + 200 * hv('beer', 'y' + i);
      ctx.save(); ctx.globalAlpha = cA(sin(u * PI) * 0.95) * (1 - die); ctx.translate(x + sin(u * 5 + i) * 4, y0 + dy + u * 54); ctx.rotate(u * 6 + i);
      ctx.fillStyle = i % 3 ? BEE.pink : BEE.pinkD; ctx.strokeStyle = 'rgba(100,30,50,0.6)'; ctx.lineWidth = 1; const sz = 3 + 3 * hv('beer', 's' + i); ctx.fillRect(-sz / 2, -sz / 3, sz, sz * 0.66); ctx.strokeRect(-sz / 2, -sz / 3, sz, sz * 0.66); ctx.restore();
    }
    puffs(ctx, -150 + dx, -60 + dy, t, 3, 91, { col: '#8a8aa8', rise: 34, spread: 14, size: 7, life: 1.1, alpha: 0.35 * (1 - die) });
    // the slam: a white rubbed wipe across the front and a shock ring
    if (atk && p > 0.46 && p < 0.9) {
      const u = (p - 0.46) / 0.44;
      ctx.save(); ctx.translate(-190 + dx, -10); ctx.scale(1, 0.3); ctx.globalAlpha = (1 - u) * 0.95; ctx.strokeStyle = '#ffd0dc'; ctx.lineWidth = 9 * (1 - u) + 1; ctx.beginPath(); ctx.arc(0, 0, 30 + 150 * ease.outCubic(u), 0, TAU); ctx.stroke(); ctx.restore();
      swoosh(ctx, -110 + dx, -110, 150, 44, -0.4, -2.9, { alpha: (1 - u) * 0.85, fill: '#ffffff', edge: '#ffd0dc' });
      for (let i = 0; i < 9; i++) { const fj = fling('beer2' + i, 'b', u, { spread: 220, up: 120, g: 380, bias: -70 }); ctx.save(); ctx.globalAlpha = fj.a; ctx.translate(-190 + dx + fj.x, -20 + fj.y); ctx.rotate(fj.r); ctx.fillStyle = i % 2 ? BEE.pink : '#ffffff'; ctx.fillRect(-5, -3, 10, 6); ctx.restore(); }
    }
    if (buff > 0.1) motes(ctx, dx, -150 + dy, t, 14, 'beebuff', { col: '#ff8aa8', size: 3, rise: 100, spread: 90, life: 0.9, alpha: buff });
  };
  // ---- phase 2: THE BLANK PAGE -------------------------------------------------------------------------------------
  const BEB = { void: '#0d0720', voidL: '#3a2272', white: '#ffffff', cyan: '#5ff5ff', lilac: '#c9b8ff', gold: '#e2ae4c' };
  const BEB_CY = -196;
  // the outline of the tear: a face shape (wide brow, narrow chin) with a ragged edge; k scales it, jag roughens it
  function tearPts(k, jag, seed) {
    const pts = [], n = 46;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU - PI / 2, s = sin(a), c = cos(a), down = Math.max(0, s);
      const rx = 100 * k * (1 - 0.4 * Math.pow(down, 1.4)) * (1 + 0.08 * Math.max(0, -s)), ry = 158 * k;
      const r = 1 + jag * ((i % 2 ? 1 : -0.6) * (0.5 + tk.vary('tear' + seed, 'j' + i)));
      pts.push([c * rx * r, BEB_CY + s * ry * r, 1]);
    }
    return pts;
  }
  BE_P.p2_face = {
    box: [-136, -372, 136, 8], pivot: [0, BEB_CY],
    draw(S) {
      const g = S.g, lip = tearPts(1.0, 0.05, 'lip'), hole = tearPts(0.83, 0.07, 'hole');
      // the paper lip of the tear, curling back: cream, with its own shadow and fibres
      S.cel(lip, BE.paper, { depth: 18, tension: 0, hi: true, hiW: 3, rim: S.c.rim, shadow: BE.paperD, halftone: { d: 5, alpha: 0.22, color: '#8a7aa8' }, lineColor: BE.ink });
      // fibres along the torn edge
      for (let i = 0; i < lip.length; i += 2) { const p = lip[i], a = Math.atan2(p[1] - BEB_CY, p[0]); tk.inkPath(g, [[p[0], p[1]], [p[0] - cos(a) * (8 + 8 * tk.vary('fib', 'a' + i)), p[1] - sin(a) * (8 + 8 * tk.vary('fib', 'a' + i))]], { w: 1.4, color: '#a898c8', alpha: 0.85, taper: 0.5, wobble: 0.1 }); }
      // the void: violet-black with a hint of stars, a storm light low in the throat and hairline storm cracks
      g.save();
      g.beginPath(); tk.trace(g, hole, 0, 0, 0); g.clip();
      const gr = g.createRadialGradient(0, BEB_CY - 20, 10, 0, BEB_CY, 150); gr.addColorStop(0, '#4a2a8a'); gr.addColorStop(0.55, '#1c0e3c'); gr.addColorStop(1, '#07030f');
      g.fillStyle = gr; g.fillRect(-120, -360, 240, 330);
      for (let i = 0; i < 26; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.3 + 0.5 * tk.vary('vs', 'a' + i)).toFixed(2) + ')'; g.beginPath(); g.arc(-80 + 160 * tk.vary('vs', 'x' + i), -330 + 260 * tk.vary('vs', 'y' + i), 0.8 + 1.2 * tk.vary('vs', 'r' + i), 0, TAU); g.fill(); }
      tk.halftone(g, -90, -330, 180, 240, { d: 7, r: 1.2, color: '#6a4ac8', alpha: 0.12, force: true });
      g.restore();
      tk.inkPath(g, hole.concat([hole[0]]), { w: 3.6, color: BE.ink, closed: true, taper: 0.02, pressure: 'flat', wobble: 0.04, tension: 0 });
      // a thin white glow along the inside of the lip, the Blank leaking round the edge
      g.save(); g.globalAlpha = 0.55; tk.inkPath(g, hole.concat([hole[0]]), { w: 1.8, color: '#ffffff', closed: true, taper: 0.02, pressure: 'flat', wobble: 0.04, tension: 0, align: -0.4 }); g.restore();
    },
  };
  // the crack that carries the tear down to the floor
  BE_P.p2_crack = {
    box: [-30, -60, 30, 8], pivot: [0, -40],
    draw(S) {
      S.cel([[-16, -48, 1], [-20, -30, 1], [-8, -16, 1], [-12, 0, 1], [4, 2, 1], [6, -14, 1], [16, -30, 1], [12, -48, 1]], BEB.void, { depth: 2, line: 3, tension: 0, hi: false, rim: '#ffffff', rimW: 1.8, shadow: false });
    },
  };
  BE_P.p2_stripA = {
    box: [-24, -112, 24, 10], pivot: [0, 0],
    draw(S) {
      S.cel([[-11, 2, 1], [11, 0, 1], [13, -30], [9, -62], [16, -88, 1], [2, -100, 1], [-9, -84], [-13, -50], [-10, -24]], BE.paper, {
        depth: 7, tension: 0.4, hi: true, hiW: 1.8, rim: S.c.rim, shadow: BE.paperD, halftone: { d: 5, alpha: 0.2, color: '#8a7aa8' },
        decor(g) { for (let i = 0; i < 7; i++) tk.inkPath(g, [[-8, -10 - i * 12], [8, -10 - i * 12 - 0.5]], { w: 1.3, color: '#6a5a96', alpha: 0.8, taper: 0.1, pressure: 'flat', wobble: 0.1 }); g.fillStyle = BE.bar; g.fillRect(-12, -52, 20, 6); },
      });
    },
  };
  BE_P.p2_stripB = {
    box: [-22, -84, 22, 10], pivot: [0, 0],
    draw(S) {
      S.cel([[-9, 2, 1], [9, 0, 1], [11, -24], [8, -50], [13, -70, 1], [1, -78, 1], [-8, -62], [-11, -36]], BE.paper, {
        depth: 6, tension: 0.4, hi: true, hiW: 1.6, rim: S.c.rim, shadow: BE.paperD, halftone: { d: 5, alpha: 0.2, color: '#8a7aa8' },
        decor(g) { for (let i = 0; i < 5; i++) tk.inkPath(g, [[-6, -10 - i * 12], [7, -10 - i * 12 - 0.5]], { w: 1.2, color: '#6a5a96', alpha: 0.8, taper: 0.1, pressure: 'flat', wobble: 0.1 }); g.fillStyle = BEB.cyan; g.globalAlpha = 0.6; g.fillRect(-10, -34, 18, 3); g.globalAlpha = 1; },
      });
    },
  };
  // a long arm of torn paper ending in a clawing paper hand; shoulder at the origin, pointing left
  BE_P.p2_arm = {
    box: [-216, -52, 14, 52], pivot: [0, 0],
    draw(S) {
      S.cel([[8, -16, 1], [-30, -20], [-70, -15], [-110, -20], [-128, -26, 1], [-134, 4, 1], [-112, 18], [-70, 14], [-30, 19], [8, 16, 1]], BE.paper, {
        depth: 8, tension: 0.35, hi: true, hiW: 2.2, rim: S.c.rim, shadow: BE.paperD, halftone: { d: 5, alpha: 0.22, color: '#8a7aa8' },
        decor(g) { for (let i = 0; i < 5; i++) tk.inkPath(g, [[-10 - i * 24, -8], [-24 - i * 24, 8]], { w: 1.3, color: '#6a5a96', alpha: 0.7, taper: 0.1, pressure: 'flat', wobble: 0.1 }); g.fillStyle = BE.bar; g.fillRect(-92, -6, 30, 8); },
      });
      // the palm and four long fingers, a thumb that hooks
      S.cel([[-124, -30, 1], [-156, -34], [-170, -18, 1], [-172, 6, 1], [-156, 20], [-126, 18, 1]], BE.paper, { depth: 6, tension: 0.4, hi: true, hiW: 1.8, rim: S.c.rim, shadow: BE.paperD });
      [[-30, -208, -34, 0.0], [-12, -214, -14, 0.1], [6, -212, 4, 0.2], [20, -200, 16, 0.3]].forEach((f, i) => {
        const y0 = f[0], xe = f[1], ye = f[2];
        S.cel([[-166, y0 - 6, 1], [-190, y0 - 8 + (ye - y0) * 0.3], [xe, ye + (i - 1.5) * 6, 1], [-190, y0 + 6 + (ye - y0) * 0.3], [-166, y0 + 6, 1]], BE.paper, { depth: 3, line: 2.8, tension: 0.4, hi: false, rim: S.c.rim, shadow: BE.paperD });
      });
      S.cel([[-150, -28, 1], [-166, -48], [-184, -50, 1], [-170, -38], [-158, -24, 1]], BE.paper, { depth: 3, line: 2.8, tension: 0.4, hi: false, rim: S.c.rim, shadow: BE.paperD });
    },
  };
  // the broken spectacles: a pair of round gold-wire lenses on the bridge, cracked; drawn live so they can float
  function beSpecs(ctx, x, y, rot, a, hot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = cA(a);
    [-1, 1].forEach((sg, i) => {
      const cx = sg * 44, r = 25;
      ctx.beginPath(); ctx.arc(cx, 0, r, 0, TAU); ctx.fillStyle = 'rgba(200,225,255,0.13)'; ctx.fill();
      ctx.lineWidth = 3.4; ctx.strokeStyle = BE.ink; ctx.beginPath(); ctx.arc(cx, 0, r + 1.8, 0, TAU); ctx.stroke();
      ctx.lineWidth = 2.6; ctx.strokeStyle = BE.gold; ctx.beginPath(); ctx.arc(cx, 0, r, 0, TAU); ctx.stroke();
      ctx.lineWidth = 1.3; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath();
      if (i === 0) { ctx.moveTo(cx - 6, -4); ctx.lineTo(cx - 20, -16); ctx.moveTo(cx - 6, -4); ctx.lineTo(cx + 12, -16); ctx.moveTo(cx - 6, -4); ctx.lineTo(cx - 18, 10); ctx.moveTo(cx - 6, -4); ctx.lineTo(cx + 10, 12); }
      else { ctx.moveTo(cx + 8, 4); ctx.lineTo(cx + 18, -12); ctx.moveTo(cx + 8, 4); ctx.lineTo(cx - 10, 14); }
      ctx.stroke();
      ctx.globalAlpha = cA(a) * 0.8; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(cx - 10, -12, 7, 3, -0.6, 0, TAU); ctx.fill(); ctx.globalAlpha = cA(a);
    });
    ctx.lineWidth = 3; ctx.strokeStyle = BE.gold; ctx.beginPath(); ctx.moveTo(-19, -2); ctx.quadraticCurveTo(0, -14, 19, -2); ctx.stroke();
    ctx.restore();
  }
  // a jagged mouth polygon: a white maw with black fangs of void biting into it from the top and the bottom
  function beMouth(ctx, cx, cy, w, open, t, hot) {
    const h = 8 + open * 76, n = 9, top = [], bot = [];
    for (let i = 0; i <= n; i++) { const u = i / n, x = cx + (u - 0.5) * w, bow = 1 - Math.pow(2 * u - 1, 2); top.push([x, cy - h * 0.45 * bow - 3 + (i % 2 ? 5 : -2) + sin(t * 3 + i) * 1.2]); bot.push([x, cy + h * 0.55 * bow + 3 + (i % 2 ? -5 : 2) + sin(t * 2.6 + i * 1.7) * 1.2]); }
    ctx.save();
    tk.glow(ctx, cx, cy, w * 0.8, '#ffffff', 0.3 + 0.4 * hot);
    ctx.beginPath(); ctx.moveTo(top[0][0], top[0][1]); top.forEach((p) => ctx.lineTo(p[0], p[1])); for (let i = n; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]); ctx.closePath();
    const gr = ctx.createLinearGradient(0, cy - h / 2, 0, cy + h / 2); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#eae0ff'); gr.addColorStop(1, '#b8a4ff');
    ctx.fillStyle = gr; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = BE.ink; ctx.stroke();
    ctx.fillStyle = BEB.void; ctx.strokeStyle = BE.ink; ctx.lineWidth = 1.6;
    for (let i = 0; i < n; i++) {
      if (i % 2 === 0) { const a = top[i], b = top[i + 1], mx = (a[0] + b[0]) / 2; ctx.beginPath(); ctx.moveTo(a[0], a[1] - 2); ctx.lineTo(b[0], b[1] - 2); ctx.lineTo(mx, a[1] + 8 + 8 * open); ctx.closePath(); ctx.fill(); }
      else { const a = bot[i], b = bot[i + 1], mx = (a[0] + b[0]) / 2; ctx.beginPath(); ctx.moveTo(a[0], a[1] + 2); ctx.lineTo(b[0], b[1] + 2); ctx.lineTo(mx, a[1] - 8 - 8 * open); ctx.closePath(); ctx.fill(); }
    }
    ctx.restore();
  }
  BE_RIG[2] = function (ctx, st) {
    const E0 = st.E, t = st.t, m = st.m, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die, atk = E0.pose === 'attack', p = atk ? E0.p : 0;
    const strike = atk ? E0.strike : 0, wind = atk ? E0.wind : 0, br = sin(TAU * t / 3.4) * m, hot = clamp(tele + buff + strike + guard * 0.3 + st.wound * 0.6 + die, 0, 1);
    const hover = sin(t * 1.1) * 7 * m, dx = -strike * 40 + hurt * 18 + E0.shake * 1.3 + 8 * tele - 8 * wind, dy = hover - 5 * tele + 3 * guard + 4 * die - 4 * buff;
    const rot = -0.03 * strike + 0.03 * tele + 0.05 * hurt + 0.008 * br;
    const open = clamp(0.3 + 0.1 * sin(t * 1.7) * m + 0.9 * tele + 0.9 * strike + 0.7 * buff + 0.5 * hurt + 0.4 * wind, 0, 1);
    const sc = (1 + 0.012 * br + 0.04 * buff + 0.03 * tele - 0.03 * guard) * (1 - 0.35 * die);
    // arms: shoulder pose in rad (positive raises), front and back
    let aF = -0.45 + 0.06 * sin(t * 1.3) * m, aB = -0.6 + 0.07 * sin(t * 1.3 + 1.1) * m;
    if (atk) {
      if (p < 0.3) { const k = sm(p / 0.3); aF = lerp(aF, 1.1, k); aB = lerp(aB, 0.8, k); }
      else if (p < 0.5) { const k = ease.inCubic((p - 0.3) / 0.2); aF = lerp(1.1, -0.15, k); aB = lerp(0.8, -0.2, k); }
      else { const k = sm((p - 0.5) / 0.5); aF = lerp(-0.15, -0.45, k); aB = lerp(-0.2, -0.6, k); }
    } else if (E0.pose === 'telegraph') { aF = lerp(aF, 1.1, tele) + 0.03 * E0.shake; aB = lerp(aB, 0.9, tele) - 0.03 * E0.shake; }
    else if (E0.pose === 'block') { aF = lerp(aF, 0.25, guard); aB = lerp(aB, 0.1, guard); }
    else if (E0.pose === 'buff') { aF = lerp(aF, 0.7, buff); aB = lerp(aB, 0.5, buff); }
    else if (E0.pose === 'hurt') { aF = aF - 0.25 * hurt; aB = aB - 0.25 * hurt; }
    // the blank behind everything: a big pale glow, brighter when hot
    ctx.save();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; tk.glow(ctx, dx, BEB_CY + dy, 260, '#ffffff', (0.16 + 0.28 * hot + 0.05 * sin(t * 2.3) * m) * (1 - die * 0.6)); tk.glow(ctx, dx, BEB_CY + dy, 190, BEB.lilac, 0.18 + 0.2 * hot); ctx.restore();
    put(ctx, st, 'p2_crack', { y: 0, sy: 1 + 0.04 * br, sx: 1 + 0.1 * hot });
    ctx.save();
    xform(ctx, 0, BEB_CY, dx, dy, rot, sc, sc);
    // the back arm and the ring of curling strips behind the lip
    const n = 13;
    ctx.save();
    ctx.translate(70, -150);
    put(ctx, st, 'p2_arm', { r: aB, sx: 0.8, sy: 0.8, a: 0.9, noFlash: false });
    ctx.restore();
    for (let i = 0; i < n; i++) {
      const hj = hv('bestrip', 'j' + i), a = -PI / 2 + (i + 0.5 + (hj - 0.5) * 0.7) / n * TAU, s = sin(a), c = cos(a), down = Math.max(0, s), rxx = 100 * (1 - 0.4 * Math.pow(down, 1.4)) * (1 + 0.08 * Math.max(0, -s)) * 0.98, px = c * rxx, py = BEB_CY + s * 156 * 0.98;
      if (s > 0.62) continue;                                   // none along the chin, where the crack is
      const long = hv('bestrip', 'l' + i) > 0.4, k = (0.62 + 0.9 * hv('bestrip', 'k' + i)) * (1 - 0.4 * Math.max(0, -s)), ang = a + PI / 2 + (hv('bestrip', 'a' + i) - 0.5) * 0.9, flare = 0.5 * buff + 0.25 * tele - 0.5 * guard, wob = 0.16 * sin(t * (1.1 + 0.13 * i) + i) * m + 0.08 * hurt * (i % 2 ? 1 : -1);
      ctx.save(); ctx.translate(px, py); ctx.rotate(ang + wob + (c > 0 ? flare : -flare) * 0.4);
      put(ctx, st, long ? 'p2_stripA' : 'p2_stripB', { r: 0.14 * sin(t * 1.9 + i * 2) * m + (hv('bestrip', 'c' + i) - 0.5) * 0.5, sy: k * (1 + 0.08 * hot), sx: 0.8 + 0.5 * hv('bestrip', 'w' + i) });
      ctx.restore();
    }
    put(ctx, st, 'p2_face', { sy: 1 + 0.01 * br, sx: 1 });
    // the features, live, inside the void
    {
      const ob = blink(t, 'blankpage', 5.0) * (1 - 0.4 * hurt), look = -0.35 + 0.1 * sin(t * 0.8) * m;
      const sq = Math.max(0.12, ob * (1 - 0.3 * (guard))), th = 1 + 0.35 * hot;
      // eyes: slanted slits of blank light with a tiny dark pupil, and a thin tear trailing from each
      [[-1, -50, -228, 0.34], [1, 48, -228, -0.34]].forEach((e, i) => {
        const ex = e[1], ey = e[2], w = 44 * th, h = 18 * th * sq;
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(e[3] * (1 + 0.5 * hot));
        tk.glow(ctx, 0, 0, 60, '#ffffff', 0.5 + 0.4 * hot);
        ctx.beginPath(); ctx.moveTo(-w, 0); ctx.quadraticCurveTo(0, -h * 1.2, w, 0); ctx.quadraticCurveTo(0, h * 1.4, -w, 0); ctx.closePath(); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = BE.ink; ctx.stroke();
        if (sq > 0.3) { ctx.fillStyle = '#15082c'; ctx.beginPath(); ctx.ellipse(look * w * 0.6, 0, 4.4, h * 0.85, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(look * w * 0.6 - 1.4, -h * 0.3, 1.4, 0, TAU); ctx.fill(); }
        ctx.restore();
        tk.inkPath(ctx, [[ex + e[0] * 4, ey + 16], [ex + e[0] * 9, ey + 38], [ex + e[0] * 6, ey + 58]], { w: 2, color: '#ffffff', alpha: 0.7, taper: 0.5, wobble: 0.1 });
      });
      // black bar brows, angry, twitching
      [[-1, -52, -258, 0.4], [1, 48, -258, -0.4]].forEach((b) => {
        ctx.save(); ctx.translate(b[1], b[2] + 3 * hot); ctx.rotate(b[3] * (1 + 0.35 * hot) + 0.04 * sin(t * 9 + b[0]) * hot); ctx.fillStyle = BE.bar; ctx.fillRect(-32, -6, 64, 12);
        ctx.strokeStyle = '#8a86c8'; ctx.lineWidth = 1.2; ctx.strokeRect(-32, -6, 64, 12); ctx.restore();
      });
      // the nose: a thin rip of light
      ctx.save(); ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.moveTo(-2, -204); ctx.lineTo(4, -170); ctx.lineTo(-6, -150); ctx.lineTo(0, -172); ctx.closePath(); ctx.fill(); ctx.restore();
      // the mouth and the black bar that slides across it every so often (and always when he is guarding)
      beMouth(ctx, 0, -118, 124, open, t, hot);
      const ph = ((t / 6.5) % 1 + 1) % 1, slide = Math.max(ph < 0.16 ? sin(ph / 0.16 * PI) : 0, guard);
      if (slide > 0.02) { ctx.save(); ctx.globalAlpha = cA(slide * 1.4); ctx.translate(lerp(-130, 0, ease.outCubic(clamp(slide * 1.3, 0, 1))), -118); ctx.fillStyle = BE.bar; ctx.fillRect(-90, -13, 180, 26); ctx.strokeStyle = '#8a86c8'; ctx.lineWidth = 1.4; ctx.strokeRect(-90, -13, 180, 26); ctx.restore(); }
      // the spectacles float over the eyes, bobbing and slightly askew
      beSpecs(ctx, -1 + 2 * sin(t * 0.9) * m, -228 + 5 * sin(t * 1.3 + 1) * m - 6 * tele, 0.06 * sin(t * 0.8) * m + 0.12 * hurt, 0.95 * (1 - die), hot);
      // letters sucked into the mouth in a spiral, the words being unwritten
      const nl = 12 + Math.round(6 * hot);
      for (let i = 0; i < nl; i++) {
        const per = 1.8 + 0.8 * hv('belet', 'p' + i), u = (((t + hv('belet', 'o' + i) * per) % per) + per) % per / per, a0 = hv('belet', 'a' + i) * TAU, rad = 210 * Math.pow(1 - u, 1.3), ang = a0 + u * 3.4;
        const x = cos(ang) * rad * 1.1, y = -118 + sin(ang) * rad * 0.8 - 20 * u, ch = 'aeoitnsrhdlcum#@?!%&'.charAt(Math.floor(hv('belet', 'c' + i) * 20));
        ctx.save(); ctx.globalAlpha = cA(sin(u * PI) * 0.95) * (1 - die); ctx.translate(x, y); ctx.rotate(ang + u * 6); ctx.fillStyle = i % 4 === 0 ? BEB.cyan : '#ffffff'; ctx.strokeStyle = BE.ink; ctx.lineWidth = 2;
        ctx.font = '900 ' + Math.round((12 + 8 * hv('belet', 's' + i)) * (0.4 + 0.6 * (1 - u))) + 'px ' + tk.font.num; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.strokeText(ch, 0, 0); ctx.fillText(ch, 0, 0); ctx.restore();
      }
      // storm leaking through the rim: cyan arcs hopping off the edge, many more when he is hurt
      const nz = 3 + Math.round(5 * hot) + Math.round(3 * st.wound);
      for (let i = 0; i < nz; i++) {
        const a = hv('bez', 'a' + i) * TAU + t * 0.1, s = sin(a), c = cos(a), rxx = 100 * (1 - 0.4 * Math.pow(Math.max(0, s), 1.4)) * 0.92, x0 = c * rxx, y0 = BEB_CY + s * 156 * 0.92;
        zap(ctx, x0, y0, x0 + c * (38 + 40 * hv('bez', 'l' + i)), y0 + s * (38 + 40 * hv('bez', 'l' + i)) + 10, t * (0.5 + 0.2 * (i % 3)), { seed: 60 + i, w: 2.2, jag: 7, n: 5, color: BEB.cyan, core: '#ffffff' });
      }
      if (tele > 0.05) {
        // the maw gathers light: rays and a swelling orb
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        tk.glow(ctx, 0, -118, 50 + 120 * tele, '#ffffff', 0.7 * tele);
        for (let i = 0; i < 14; i++) { const a = i / 14 * TAU + t * 0.5; ctx.globalAlpha = 0.5 * tele; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cos(a) * 70, -118 + sin(a) * 60); ctx.lineTo(cos(a) * (90 + 120 * tele), -118 + sin(a) * (80 + 100 * tele)); ctx.stroke(); }
        ctx.restore();
      }
    }
    // the front arm over everything
    ctx.save(); ctx.translate(-70, -118);
    put(ctx, st, 'p2_arm', { r: aF });
    ctx.restore();
    ctx.restore();
    ctx.restore();
    // the rip: a long white jagged tear across the front on the strike and a burst of paper
    if (atk && p > 0.44 && p < 0.9) {
      const u = clamp((p - 0.44) / 0.46, 0, 1);
      ctx.save(); ctx.globalAlpha = (1 - ease.inQuad(u)) * 0.95;
      const pts = []; for (let k = 0; k <= 10; k++) pts.push([-80 + dx - 230 * k / 10, -110 - 20 * sin(k * 1.3) + (k % 2 ? 12 : -12)]);
      tk.inkPath(ctx, pts, { w: 18 * (1 - u * 0.5), color: '#ffffff', taper: 0.4, wobble: 0.05, pressure: 'mid', tension: 0 });
      tk.inkPath(ctx, pts, { w: 4, color: BEB.cyan, taper: 0.4, wobble: 0.05, pressure: 'mid', tension: 0, alpha: 0.9 });
      ctx.restore();
      for (let i = 0; i < 9; i++) { const fj = fling('bepg' + i, 'b', u, { spread: 240, up: 100, g: 320, bias: -80 }); ctx.save(); ctx.globalAlpha = fj.a; ctx.translate(-240 + dx + fj.x, -90 + fj.y); ctx.rotate(fj.r); ctx.fillStyle = i % 3 ? '#fff8f0' : BE.bar; ctx.fillRect(-7, -4, 14, 8); ctx.restore(); }
    }
    if (die > 0.2) {
      // the end of the book: the tear flares white and snaps shut into a line
      const u = clamp((die - 0.2) / 0.8, 0, 1);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; tk.glow(ctx, 0, BEB_CY, 120 + 220 * u, '#ffffff', 0.9 * Math.sin(u * PI)); ctx.restore();
    }
    if (buff > 0.1) motes(ctx, dx, -100 + dy, t, 14, 'bebbuff', { col: '#ffffff', size: 3, rise: 100, spread: 100, life: 0.9, alpha: buff });
  };
  // the registered boss: bounds cover all three forms, the dissolve differs per form, the rig dispatches on the phase
  const BE_DIE = [
    { key: 'p0', box: [-150, -340, 110, 4], nx: 11, ny: 18, from: 'top', order: 0.55, shape: 'paper', kinds: ['scrap', 'letter', 'bar', 'scrap'], cols: ['#fff8f0', '#ff2a4a', '#0b0916', '#c9b8ff'], wind: [-10, -10], size: 12, thin: 0.25, life: 0.6 },
    { key: 'p1', box: [-170, -350, 150, 4], nx: 12, ny: 18, from: 'out', order: 0.5, shape: 'paper', kinds: ['crumb', 'crumb', 'scrap', 'ink'], cols: ['#f4a3b8', '#ffd0dc', '#c4607e', '#5a5a6a'], wind: [-6, -8], size: 13, thin: 0.2, life: 0.6 },
    { key: 'p2', box: [-170, -360, 150, 4], nx: 12, ny: 18, from: 'in', order: 0.35, shape: 'paper', kinds: ['letter', 'scrap', 'letter', 'bar'], cols: ['#ffffff', '#fff8f0', '#5ff5ff', '#0b0916'], wind: [0, -22], size: 14, thin: 0.15, life: 0.6 },
  ];
  define('boss_editor', {
    size: 'xl', lw: 3.8,
    col: { rim: '#c9b8ff', shT: 0.42 },
    bounds: { w: 340, h: 352, head: { x: -6, y: -330 }, body: { x: 0, y: -170 }, feet: { x: 0, y: 0 }, right: 159 },
    die: (st) => BE_DIE[clamp(st.phase, 0, 2)],
    parts: BE_P,
    chains: BE_C,
    rig(ctx, st) { const ph = clamp(st.phase, 0, 2); (BE_RIG[ph] || BE_RIG[0])(ctx, st); },
  });
  // ===============================================================================================================
  // registration of every spec and the gallery
  // ===============================================================================================================
  Object.keys(SPECS).forEach((id) => register(SPECS[id]));
  ART.enemy.warm3 = warm;
  ART.enemy.ids3 = () => Object.keys(SPECS);

  // workbench: params id (comma list or 'all'), pose (one, or 'all' for a row of every pose), zoom, t, pt, phase, hp
  const KEYPT = { idle: 0, attack: 0.21, hurt: 0.07, block: 0.2, buff: 0.16, die: 0.3, telegraph: 0.6 };
  // the chapter 3 backdrop for swatches: a crimson storm sky, a citadel silhouette, floating stones, white void tears, an occasional lightning flash
  function backdrop(ctx, W, H, t, gy, seed) {
    const u = H / 500;
    tk.sky(ctx, 0, 0, W, gy, 'crimson');
    const fl = Math.max(0, sin(t * 0.9 + (seed || 0)) * 6 - 5.2);                    // rare deterministic flashes
    if (fl > 0) { ctx.fillStyle = 'rgba(255,240,255,' + (fl * 0.35).toFixed(3) + ')'; ctx.fillRect(0, 0, W, gy); }
    tk.glow(ctx, W * 0.5, gy * 0.92, W * 0.5, '#ff7a5a', 0.28);
    // white void tears in the sky
    ctx.fillStyle = 'rgba(255,248,240,0.5)';
    [[0.14, 0.16, 0.12], [0.76, 0.1, 0.14]].forEach((tr, i) => {
      const x = W * tr[0], y = gy * tr[1], w = W * tr[2];
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 1; k <= 9; k++) ctx.lineTo(x + w * k / 9, y + (k % 2 ? -1 : 1) * (2 + 4 * hv('tear' + i, 'k' + k)) * u);
      for (let k = 9; k >= 0; k--) ctx.lineTo(x + w * k / 9, y + (k % 2 ? 3 : 0) * u + (1 + 2 * hv('tear' + i, 'j' + k)) * u);
      ctx.closePath(); ctx.fill();
    });
    // the citadel: a wall and three stacked towers, black against the glow, a few lit windows
    ctx.fillStyle = '#1d0a2c';
    const cx0 = W * 0.5, base = gy - 24 * u;
    ctx.fillRect(cx0 - 190 * u, base - 46 * u, 380 * u, 60 * u);
    for (let k = 0; k < 14; k++) ctx.fillRect(cx0 - 190 * u + k * 27 * u, base - 56 * u, 14 * u, 10 * u);
    [[-120, 90, 40], [0, 140, 56], [118, 100, 42]].forEach((tw) => {
      const x = cx0 + tw[0] * u, top = base - tw[1] * u, w = tw[2] * u;
      ctx.fillRect(x - w / 2, top, w, base - top);
      for (let k = 0; k < 3; k++) { const ww = w * (1.5 - k * 0.24), yy = top + k * 26 * u; ctx.beginPath(); ctx.moveTo(x - ww / 2, yy + 8 * u); ctx.lineTo(x, yy - 12 * u); ctx.lineTo(x + ww / 2, yy + 8 * u); ctx.closePath(); ctx.fill(); }
    });
    ctx.fillStyle = 'rgba(255,170,90,0.9)';
    for (let k = 0; k < 9; k++) ctx.fillRect(cx0 - 170 * u + k * 42 * u, base - 30 * u + (k % 3) * 5 * u, 3 * u, 4 * u);
    // floating stones
    ctx.fillStyle = '#2a1238';
    [[0.08, 0.3, 20], [0.92, 0.36, 16], [0.62, 0.14, 14]].forEach((sp, i) => {
      const x = W * sp[0], y = gy * sp[1] + sin(t * 0.6 + i * 2) * 4 * u, r = sp[2] * u;
      ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y - r * 0.15); ctx.lineTo(x + r * 0.5, y + r * 0.7); ctx.lineTo(x + r * 0.05, y + r * 1.5); ctx.lineTo(x - r * 0.6, y + r * 0.6); ctx.closePath(); ctx.fill();
    });
    // the cloud bank
    for (let i = 0; i < 18; i++) {
      const cx = W * (i / 17) + sin(t * 0.2 + i) * 6 * u, cy = gy - 10 * u - hv('cl', 'y' + i) * 26 * u, r = (30 + 22 * hv('cl', 'r' + i)) * u;
      ctx.fillStyle = i % 2 ? '#a02048' : '#c83c50'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#24102c'; ctx.fillRect(0, gy, W, H - gy);
    const gg = ctx.createLinearGradient(0, gy - 4, 0, gy + 18);
    gg.addColorStop(0, 'rgba(255,90,90,0.4)'); gg.addColorStop(1, 'rgba(255,90,90,0)');
    ctx.fillStyle = gg; ctx.fillRect(0, gy - 4, W, 22);
    tk.kirakira(ctx, 0, 0, W, gy, t, { n: 10, seed: seed || 4, size: 2.4, color: '#ffe9a8' });
  }
  ART.sheet('enemies3_dev', (canvas, params) => {
    const ctx = canvas.getContext('2d'), W = params.w, H = params.h, t = num(params.t, 0);
    const all = params.id === 'all' || params.id === undefined;
    const ids = all ? Object.keys(SPECS) : String(params.id).split(',');
    const zoom = num(params.zoom, 1.6), gy = H * 0.9;
    backdrop(ctx, W, H, t, gy, 3);
    if (params.pose === 'all') {
      POSES.forEach((pose, i) => {
        ART.enemy.draw(ctx, ids[0], { x: W * (i + 0.5) / POSES.length, y: gy, s: zoom, pose, t, pt: params.pt !== undefined ? params.pt : KEYPT[pose], phase: params.phase | 0, hpPct: params.hp });
        ctx.font = '600 13px system-ui'; ctx.fillStyle = '#c9bff0'; ctx.textAlign = 'center'; ctx.fillText(pose, W * (i + 0.5) / POSES.length, H - 8);
      });
    } else {
      const pose = params.pose || 'idle';
      ids.forEach((id, i) => ART.enemy.draw(ctx, id, { x: W * (i + 0.5) / ids.length, y: gy, s: zoom, pose, t, pt: params.pt !== undefined ? params.pt : KEYPT[pose], phase: params.phase | 0, hpPct: params.hp }));
    }
    tk.paperGrain(ctx, 0, 0, W, H, { alpha: 0.25 });
  });
  // ---------------------------------------------------------------------------------------------------------------
  // gallery sheets
  // ---------------------------------------------------------------------------------------------------------------
  const NORMALS = ['storm_drone', 'komainu_guardian', 'redaction_knight', 'void_scribe', 'blank_soldier', 'sky_serpent', 'eraser_wraith', 'thunder_crow', 'paper_golem', 'margin_imp'];
  const ELITES = ['censor_golem', 'storm_whelp', 'black_bar_inquisitor'];
  const MINIONS = ['blank_page', 'spark_mote', 'typo_sprite'];
  const cellBg = (g, w, h, t, seed) => {
    tk.sky(g, 0, 0, w, h, 'crimson');
    tk.glow(g, w * 0.5, h * 0.8, h * 0.6, '#ff7a5a', 0.25);
    const fl = Math.max(0, sin(t * 0.9 + (seed || 0) * 1.7) * 6 - 5.3);
    if (fl > 0) { g.fillStyle = 'rgba(255,240,255,' + (fl * 0.3).toFixed(3) + ')'; g.fillRect(0, 0, w, h); }
    g.fillStyle = 'rgba(36,16,44,0.9)'; g.fillRect(0, h * 0.88, w, h * 0.12);
    tk.kirakira(g, 0, 0, w, h * 0.85, t, { n: 6, seed: (seed || 0) + 3, size: 2, color: '#ffe9a8' });
  };
  const fitScale = (id, w, h, cap) => { const b = ART.enemy.bounds(id); return Math.min(h * 0.86 / (b.h + 14), w * 0.96 / (b.w + 10), cap || 2); };
  const tierOf = (id) => (DATA.enemies && DATA.enemies[id] ? DATA.enemies[id].tier : '');

  // every normal, elite and minion, each in three poses (params.poses = "idle,attack,telegraph" by default), fitted to its cell
  ART.sheet('enemies3', (canvas, params) => {
    const t = num(params.t, 0), poses = String(params.poses || 'idle,attack,telegraph').split(',').filter((p) => POSES.indexOf(p) >= 0);
    const ids = NORMALS.concat(ELITES, MINIONS), np = poses.length || 1;
    const cells = ids.map((id) => ({ id, label: id + '  (' + tierOf(id) + ')' }));
    ART.sheetGrid(canvas, params, cells, (g, cell, w, h, i) => {
      cellBg(g, w, h, t, i);
      const gy = h * 0.9, sc = fitScale(cell.id, w / np, h, 1.7);
      (poses.length ? poses : ['idle']).forEach((pose, k) => ART.enemy.draw(g, cell.id, { x: w * (k + 0.5) / np, y: gy, s: sc, pose, t: t + i * 0.37, pt: params.pt !== undefined ? params.pt : KEYPT[pose], phase: 0 }));
    }, { cols: 4, title: 'Chapter 3, the Crimson Sky Citadel: normals, elites, minions (' + poses.join(', ') + ')', gap: 6, labelH: 16 });
  });

  // the boss: all three forms large in idle, then every pose of each form underneath
  ART.sheet('boss3', (canvas, params) => {
    const g = canvas.getContext('2d'), W = params.w, H = params.h, t = num(params.t, 0), id = 'boss_editor';
    const topH = H * 0.56, gy = topH * 0.95, names = ['phase 0: the Editor', 'phase 1: the Eraser', 'phase 2: the Blank Page'];
    backdrop(g, W, H, t, gy, 2);
    const sc = Math.min(topH * 0.9 / 350, W / 3 * 0.9 / 330);
    [0, 1, 2].forEach((ph) => {
      const cx = W * (ph + 0.5) / 3;
      ART.enemy.draw(g, id, { x: cx, y: gy, s: sc, pose: 'idle', t, pt: 0, phase: ph, hpPct: ph === 2 ? 0.25 : ph === 1 ? 0.5 : 1 });
      g.font = '700 15px system-ui'; g.fillStyle = '#f3e6c8'; g.textAlign = 'center'; g.fillText(names[ph], cx, topH - 6);
    });
    const poses = ['attack', 'hurt', 'block', 'buff', 'die', 'telegraph'], bandH = (H - topH) / 3, cw = W / poses.length, s2 = Math.min(bandH * 0.84 / 350, cw * 0.96 / 340);
    [0, 1, 2].forEach((ph) => poses.forEach((pose, k) => {
      const x = cw * (k + 0.5), y = topH + bandH * ph + bandH * 0.9;
      g.fillStyle = 'rgba(36,16,44,0.7)'; g.fillRect(cw * k, topH + bandH * ph, cw - 2, bandH - 2);
      ART.enemy.draw(g, id, { x, y, s: s2, pose, t, pt: KEYPT[pose], phase: ph });
      g.font = '600 12px system-ui'; g.fillStyle = '#c9bff0'; g.textAlign = 'center'; g.fillText('phase ' + ph + ' ' + pose, x, topH + bandH * (ph + 1) - 4);
    }));
    tk.paperGrain(g, 0, 0, W, H, { alpha: 0.25 });
  });

  // film strips: two creatures (params.ids), each with an idle loop, an attack and a death across the pose (8 frames each)
  ART.sheet('enemies3_anim', (canvas, params) => {
    const ids = String(params.ids || 'black_bar_inquisitor,spark_mote').split(',').filter((id) => SPECS[id]).slice(0, 2), n = 8, t0 = num(params.t, 0), cells = [];
    ids.forEach((id) => {
      for (let i = 0; i < n; i++) cells.push({ id, kind: 'idle', i, label: id.split('_')[0] + ' idle ' + (i * 0.3).toFixed(1) + 's' });
      for (let i = 0; i < n; i++) cells.push({ id, kind: 'attack', i, label: 'attack ' + Math.round(i / (n - 1) * POSE_MS.attack) + 'ms' });
      for (let i = 0; i < n; i++) cells.push({ id, kind: 'die', i, label: 'die ' + Math.round(i / (n - 1) * POSE_MS.die) + 'ms' });
    });
    ART.sheetGrid(canvas, params, cells, (g, cell, w, h) => {
      cellBg(g, w, h, t0, 2);
      const sc = fitScale(cell.id, w, h, 1.6), u = cell.i / (n - 1);
      const o = { x: w * 0.5, y: h * 0.9, s: sc, t: t0 + cell.i * (cell.kind === 'idle' ? 0.3 : 0.033) };
      if (cell.kind === 'idle') ART.enemy.draw(g, cell.id, Object.assign(o, { pose: 'idle', pt: 0 }));
      else ART.enemy.draw(g, cell.id, Object.assign(o, { pose: cell.kind, pt: u * POSE_MS[cell.kind] / 1000 }));
    }, { cols: n, title: 'Chapter 3 film strips: ' + ids.join(' and ') + ' (idle loop, attack, death)', gap: 4, labelH: 14 });
  });
})();
