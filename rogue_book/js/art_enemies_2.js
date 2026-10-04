// Echowake: ART.enemy art for CHAPTER 2, the Sunken Lantern City (a haunted canal town at night of lanterns, puppets, faceless things and
// spiders). Extends ART (art.js). This file draws exactly the 17 ids of DATA.ROSTER[2] and registers each with ART.enemy.register(id, {draw, bounds}).
//
//   normals   chochin karakuri_puppet nopperabo drowned_samurai koi_spirit tsukumogami silk_weaver nure_onna rokurokubi ittan_momen
//   elites    drowned_general puppet_master umibozu
//   minions   spiderling paper_puppet lantern_wisp
//   boss      boss_jorogumo   phase 0 the Courtesan (a spider-woman in a layered kimono), phase 1 the Spider (the kimono torn open on a spider's body)
//
// CONTRACT (DESIGN 5.6). draw(ctx, o) receives the context ALREADY translated to the feet centre and scaled; it paints around (0, 0), y negative up, facing
// LEFT. o = {s, pose, t, pt, hpPct, phase, glow, flip}. t is absolute seconds (loops), pt seconds since the pose began (one-shot poses). Poses are
// LISTS.enemyPoses: idle attack hurt block buff die telegraph. Elite ornament, the aura ring and the ground shadow are drawn by ART.enemy.draw: nothing
// here duplicates them. Every id is deterministic (no clock, no Math.random), never throws for odd input, and keeps save and restore balanced.
//
// HOW THEY ARE BUILT (the same cutout-puppet idea as the heroes, tuned for creatures).
//   A creature is a handful of PARTS (a head, a body, a limb, a lantern), each drawn ONCE at rest with the toolkit (celFill, ribbon, eye...) into a cached
//   sprite per raster scale q = ceil(2 * s) / 2, then composited every frame under its own transform (a pivot, a rotation, a squash). Things that
//   flow (tongues, necks, tails, cloth, silk, hair, spider legs) are ART.tk.chain parts: one baked drawing sliced into slabs that bend at joints.
//   Everything that must change every frame is drawn LIVE and cheaply: eyes (blink, look, flare), mouths, flames, glows, sparkles, drips, strings.
//   Poses are a small shared state (poseState: lunge, wind-up, recoil, guard, buff pulse, dissolve) that each creature interprets in its own rig().
//   Death is a themed dissolve: the creature is clipped by a field of shrinking cells (ink blots, paper squares, water bubbles, ember dots) while
//   matching fragments (petals, paper scraps, sparks, bubbles, coins, threads) fly away. A hurt pose flashes a baked white silhouette of every part.
//
// EXTRAS beyond DESIGN 5.6
//   ART.enemy.warm2(id, s) -> parts baked      pre-bake every sprite of a chapter 2 creature at the raster scale for s (avoids a first-frame hitch)
//   ART.enemy.ids2() -> the 17 ids drawn here
//   Gallery sheets: enemies2 (normals, elites, minions, several poses each), boss2 (Jorogumo, both phases, every pose, large), enemies2_anim (film
//   strips of two creatures), enemies2_dev (params id[,id]|all pose|all zoom t pt phase hp: the workbench).
(() => {
  'use strict';
  const tk = ART.tk, pal = tk.pal;
  const clamp = tk.clamp, lerp = tk.lerp, num = tk.num, ease = tk.ease;
  const TAU = Math.PI * 2, PI = Math.PI;
  const cA = (a) => (a >= 0 ? (a <= 1 ? a : 1) : 0);
  const sm = tk.smoothstep;
  const SPECS = {};
  const PAD = 7;
  const POSES = ['idle', 'attack', 'hurt', 'block', 'buff', 'die', 'telegraph'];
  const POSE_MS = { attack: 420, hurt: 260, block: 300, buff: 400, die: 700, telegraph: 0, idle: 0 };

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
  const mirrorX = (pts) => pts.map((p) => { const q = [-p[0], p[1]]; if (p[2]) q.push(p[2]); return q; }).reverse();
  // a teardrop / flame shape pointing up from (cx, cy) (the round base centre), height h, half width w
  function flamePts(cx, cy, w, h, lean) {
    lean = lean || 0;
    return [[cx, cy + w * 0.9], [cx + w * 0.85, cy + w * 0.5], [cx + w, cy - w * 0.1], [cx + w * 0.55 + lean * 0.3, cy - h * 0.45], [cx + lean, cy - h, 1], [cx - w * 0.5 + lean * 0.25, cy - h * 0.4], [cx - w, cy - w * 0.1], [cx - w * 0.85, cy + w * 0.5]];
  }
  // a zig-zag row of teeth: base points along x0..x1 at y, pointing by dy (negative up) with n teeth
  function toothRow(x0, x1, y, dy, n, jitter) {
    const pts = [];
    const step = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      const jx = jitter ? (tk.vary(i * 7 + 3, 'tooth') - 0.5) * jitter : 0, jy = jitter ? (tk.vary(i * 5 + 1, 'toothy') - 0.5) * jitter * 0.6 : 0;
      pts.push([x0 + step * i, y, 1], [x0 + step * (i + 0.5) + jx, y + dy + jy, 1]);
    }
    pts.push([x1, y, 1]);
    return pts;
  }
  // deterministic tiny helpers for live animation
  const flick = (t, seed, rate) => 0.5 + 0.5 * (tk.noise1(t * (rate || 8) + seed * 13.7, seed | 0) * 2 - 1) + 0.0;
  const wob = (t, per, ph) => Math.sin(TAU * (t / per + ph));
  const hv = (id, salt) => tk.vary(id, salt);

  // ---------------------------------------------------------------------------------------------------------------
  // the paint helper handed to every part
  // ---------------------------------------------------------------------------------------------------------------
  function makeS(g, spec) {
    const c = spec.col, lw = spec.lw || 3;
    const S = { g, c, lw, spec };
    // one cel-shaded closed shape with the house defaults: outline lw, hard shadow, backlight rim in the creature's rim colour
    S.cel = (pts, base, o) => tk.celFill(g, pts, base, Object.assign({ line: lw, rim: c.rim, rimW: 1.7, rimAlpha: 0.8 }, o));
    S.ell = (cx, cy, rx, ry, base, o) => S.cel(E(cx, cy, rx, ry), base, o);
    S.line = (pts, o) => tk.inkPath(g, pts, Object.assign({ w: 1.5, color: pal.ink }, o));
    S.fill = (pts, col, alpha, tension) => { g.save(); if (alpha !== undefined) g.globalAlpha *= cA(alpha); g.beginPath(); tk.trace(g, pts, 0, 0, tension); g.fillStyle = col; g.fill(); g.restore(); };
    S.rib = (spine, base, o) => tk.ribbon(g, spine, base, Object.assign({ line: lw, rim: c.rim, rimW: 1.4, gloss: false, strands: 0 }, o));
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
    return ART.sprite('en2|' + spec.id + '|' + name + '|' + q + (white ? '|w' : ''), w * q, h * q, (g) => {
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
    c = tk.chain('en2|' + spec.id + '|' + name + (white ? '|w' : ''), {
      spine: d.spine, cuts: d.cuts, reach: d.reach, overlap: d.overlap,
      draw: (g) => {
        d.draw(makeS(g, spec));
        grainOver(g, -600, -600, 1200, 1200);
        if (white) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#ffffff'; g.fillRect(-600, -600, 1200, 1200); }
      },
    });
    spec._chain[key] = c;
    return c;
  }

  // draw the baked part `name` at its rest place, under an extra transform about its pivot. T = {x, y, r, sx, sy, a, kids}.
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
  // a chain part (tail, tongue, neck, cloth, leg) drawn with per-joint bends (radians, see ART.tk.chain), under an optional transform
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
    ctx.restore();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // the shared pose state
  // ---------------------------------------------------------------------------------------------------------------
  // attack: 0..0.3 anticipation (swing dips to -0.5), 0.3..0.5 strike (swing reaches 1 at p = 0.5), then recovery
  // hurt: recoil spike then settle;  block: guard rises fast and holds;  buff: a pulse;  die: 0..1 dissolve;  telegraph: wind-up ramps to 1 and holds
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

  // ---------------------------------------------------------------------------------------------------------------
  // live helpers: glow, eyes, blink, embers
  // ---------------------------------------------------------------------------------------------------------------
  const blink = (t, id, per) => {
    per = per || 3.6 + 1.6 * hv(id, 'bp');
    const ph = ((t + hv(id, 'bo') * per) % per + per) % per;
    return ph < 0.16 ? Math.abs(ph - 0.08) / 0.08 : 1;                    // 1 open, dips to 0 for a moment
  };
  // an emissive creature eye drawn live: soft glow, socket, iris gradient, pupil, catchlight, lid squash. o: open (0..1), iris [top, bottom],
  // pupil ('slit' 'round' 'dot' 'none'), look [dx, dy], sclera, ring (outline colour), glow (colour), glowK, rot, lw, catch
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
    ctx.restore();
    ctx.globalAlpha = ctx.globalAlpha;
    tk.inkPath(ctx, E(0, 0, rx, ery, 18), { closed: true, w: o.lw || 2.4, color: o.ring || pal.ink, align: 0.2, wobble: 0.05 });
    ctx.restore();
  }
  // drifting embers / motes rising from (x, y): n particles, deterministic in t. o: col, size, rise (px/s), spread, life (s)
  function motes(ctx, x, y, t, n, seed, o) {
    o = o || {};
    const col = o.col || '#ffb040', size = o.size || 2.4, rise = num(o.rise, 30), spread = num(o.spread, 16), life = num(o.life, 1.6), m = tk.motion();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const per = life * (0.7 + 0.6 * hv(seed, 'l' + i)), ph = hv(seed, 'p' + i) * per, u = (((t + ph) % per) + per) % per / per;
      const px = x + (hv(seed, 'x' + i) - 0.5) * spread * 2 + Math.sin(u * 5 + i) * 5 * m, py = y - u * rise * per;
      const a = Math.sin(u * PI) * (o.alpha === undefined ? 0.9 : o.alpha);
      if (a < 0.05) continue;
      const r = size * (0.5 + hv(seed, 's' + i)) * (1 - u * 0.5);
      ctx.globalAlpha = cA(a);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  // a live teardrop flame with three layers (outer, mid, core) whose tip wanders with noise. (x, y) is the centre of the round base.
  // o: c0 c1 c2 (layer colours), glow (halo colour), glowK, lean (extra px), line (outline colour or false), flare (1 = normal)
  function flameLive(ctx, x, y, w, h, t, seed, o) {
    o = o || {};
    const fl = flick(t, seed, 9), lean = ((tk.noise1(t * 3.1 + seed * 5.3, seed) - 0.5) * w * 1.7 + num(o.lean, 0)) * tk.motion() + num(o.lean, 0) * (1 - tk.motion());
    const hh = h * (0.82 + 0.34 * fl) * num(o.flare, 1), ww = w * (0.94 + 0.12 * (1 - fl));
    if (o.glow !== false) tk.glow(ctx, x, y - hh * 0.35, hh * 1.05 + w, o.glow || '#ffa040', cA(num(o.glowK, 0.6) * (0.75 + 0.25 * fl)));
    const layers = [[1, o.c0 || '#ff4a22'], [0.7, o.c1 || '#ffa63a'], [0.4, o.c2 || '#fff2b0']];
    ctx.save();
    for (let i = 0; i < layers.length; i++) {
      const k = layers[i][0], lw = ww * k, lh = hh * (i === 0 ? 1 : 0.86 * k + 0.1), lx = lean * (0.6 + 0.4 * k), by = y - (i === 0 ? 0 : w * 0.12 * (1 - k));
      ctx.beginPath();
      ctx.moveTo(x - lw, by);
      ctx.bezierCurveTo(x - lw * 1.02, by - lh * 0.5, x + lx * 0.55 - lw * 0.32, by - lh * 0.72, x + lx, by - lh);
      ctx.bezierCurveTo(x + lx * 0.55 + lw * 0.32, by - lh * 0.72, x + lw * 1.02, by - lh * 0.5, x + lw, by);
      ctx.quadraticCurveTo(x, by + lw * 1.2, x - lw, by);
      ctx.closePath();
      ctx.fillStyle = layers[i][1]; ctx.fill();
      if (i === 0 && o.line !== false) { ctx.lineWidth = 1.7; ctx.strokeStyle = o.line || 'rgba(70,14,8,0.85)'; ctx.stroke(); }
    }
    ctx.restore();
  }
  // steam or smoke puffs rising from (x, y): soft translucent discs, deterministic in t. o: col, rise, spread, size, life, alpha
  function puffs(ctx, x, y, t, n, seed, o) {
    o = o || {};
    const col = o.col || '#ffffff', rise = num(o.rise, 40), spread = num(o.spread, 8), size = num(o.size, 6), life = num(o.life, 1.1);
    ctx.save();
    for (let i = 0; i < n; i++) {
      const per = life * (0.8 + 0.4 * hv(seed, 'l' + i)), u = ((((t + hv(seed, 'p' + i) * per) % per) + per) % per) / per;
      const a = Math.sin(u * PI) * num(o.alpha, 0.5);
      if (a < 0.03) continue;
      ctx.globalAlpha = cA(a); ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x + (hv(seed, 'x' + i) - 0.5) * spread * 2 + num(o.dx, 0) * u, y - u * rise, size * (0.5 + u * 1.1) * (0.7 + hv(seed, 's' + i) * 0.6), 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  // ballistic offsets for a part that flies apart in a death: p 0..1 -> {x, y, r, a}. Deterministic per (seed, name)
  function fling(seed, name, p, o) {
    o = o || {};
    const vx = (hv(seed, name + 'vx') - 0.5) * num(o.spread, 150) + num(o.bias, 0), vy = -num(o.up, 70) * (0.4 + hv(seed, name + 'vy')), g = num(o.g, 300);
    const u = clamp(p, 0, 1), ground = num(o.ground, 1e9);
    return { x: vx * u, y: Math.min(ground, vy * u + g * u * u), r: (hv(seed, name + 'r') - 0.5) * num(o.spin, 6) * u, a: 1 - clamp((u - 0.62) / 0.38, 0, 1) };
  }
  // expanding water ripples on the ground under a floating or wading creature
  function ripples(ctx, x, y, t, rx, col, n) {
    n = n || 2;
    ctx.save();
    ctx.lineWidth = 1.6;
    for (let i = 0; i < n; i++) {
      const u = (((t * 0.45 + i / n) % 1) + 1) % 1;
      ctx.globalAlpha = cA((1 - u) * 0.5);
      ctx.strokeStyle = col || '#8fd0ff';
      ctx.beginPath(); ctx.ellipse(x, y, rx * (0.3 + u * 0.75), rx * (0.3 + u * 0.75) * 0.2, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // the themed dissolve used by every death: a clip made of shrinking cells, plus matching flying fragments
  // ---------------------------------------------------------------------------------------------------------------
  const cellCache = {};
  function cellsOf(spec) {
    if (cellCache[spec.id]) return cellCache[spec.id];
    const d = spec.die, b = d.box, nx = d.nx || 11, ny = d.ny || 14, cw = (b[2] - b[0]) / nx, ch = (b[3] - b[1]) / ny, cells = [], r = tk.rng('en2die', spec.id);
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
    cellCache[spec.id] = { cells, cw, ch };
    return cellCache[spec.id];
  }
  const LIFE = 0.2;
  function dissolveClip(ctx, spec, p) {
    const { cells, cw, ch } = cellsOf(spec), sq = spec.die.shape === 'paper', hexs = spec.die.shape === 'diamond', rad = Math.max(cw, ch) * 0.78;
    ctx.beginPath();
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (p >= c.th + LIFE) continue;
      const f = p < c.th ? 1 : 1 - (p - c.th) / LIFE;
      const r = rad * (0.15 + 0.85 * f);
      if (sq) {
        const a = (p - c.th) * (c.rnd - 0.5) * 9, cs = Math.cos(a) * r * 0.86, sn = Math.sin(a) * r * 0.86;
        ctx.moveTo(c.x - cs + sn, c.y - sn - cs); ctx.lineTo(c.x + cs + sn, c.y + sn - cs); ctx.lineTo(c.x + cs - sn, c.y + sn + cs); ctx.lineTo(c.x - cs - sn, c.y - sn + cs); ctx.closePath();
      } else if (hexs) {
        ctx.moveTo(c.x + r, c.y); ctx.lineTo(c.x, c.y + r * 0.9); ctx.lineTo(c.x - r, c.y); ctx.lineTo(c.x, c.y - r * 0.9); ctx.closePath();
      } else { ctx.moveTo(c.x + r, c.y); ctx.arc(c.x, c.y, r, 0, TAU); }
    }
    ctx.clip();
  }
  // flying fragments for a dissolve. kinds: petal scrap ember bubble ink coin thread
  function dissolveFx(ctx, spec, st) {
    const d = spec.die, p = st.E.die, { cells } = cellsOf(spec), kinds = d.kinds || ['petal'], cols = d.cols || ['#ff9cc6'], wind = d.wind || [-14, -40];
    ctx.save();
    let drawn = 0;
    for (let i = 0; i < cells.length && drawn < 70; i++) {
      const c = cells[i];
      if (c.rnd < 0.42 || p < c.th) continue;
      const a = p - c.th, life = 0.5;
      if (a > life) continue;
      const u = a / life, kind = kinds[i % kinds.length], col = cols[(i >> 1) % cols.length];
      const px = c.x + wind[0] * a * 5 + Math.sin(a * 14 + i) * 5 * (1 - u * 0.4) + (c.r2 - 0.5) * 30 * u, py = c.y + wind[1] * a * 5 * (0.5 + c.r3) + (kind === 'coin' ? 60 * u * u : 0);
      const al = cA((1 - u) * (1 - p * p * 0.5) * 1.15), sz = (d.size || 6) * (0.55 + c.r3 * 0.8);
      ctx.globalAlpha = al;
      if (kind === 'petal') tk.petal(ctx, px, py, sz, a * 9 + i, al, col);
      else if (kind === 'scrap') {
        ctx.save(); ctx.translate(px, py); ctx.rotate(a * 11 * (c.r2 - 0.5) * 3 + i); ctx.fillStyle = col; ctx.strokeStyle = pal.ink; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.rect(-sz * 0.8, -sz * 0.55, sz * 1.6, sz * 1.1); ctx.fill(); ctx.stroke(); ctx.restore();
      } else if (kind === 'ember') {
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py - u * 20, sz * 0.5 * (1 - u * 0.6), 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
      } else if (kind === 'bubble') {
        ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px, py - u * 30, sz * 0.7, 0, TAU); ctx.stroke();
        ctx.globalAlpha = al * 0.5; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(px - sz * 0.25, py - u * 30 - sz * 0.25, sz * 0.18, 0, TAU); ctx.fill();
      } else if (kind === 'ink') {
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px, py, sz * 0.6 * (1 - u * 0.5), 0, TAU); ctx.fill();
      } else if (kind === 'coin') {
        ctx.save(); ctx.translate(px, py); ctx.scale(Math.abs(Math.cos(a * 16 + i)) * 0.8 + 0.2, 1); ctx.fillStyle = col; ctx.strokeStyle = pal.ink; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.arc(0, 0, sz * 0.7, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
      } else if (kind === 'thread') {
        ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + 8, py - 10, px + 3 + u * 14, py - 22 - u * 10); ctx.stroke();
      }
      drawn++;
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // registration
  // ---------------------------------------------------------------------------------------------------------------
  function makeState(spec, o) {
    o = o || {};
    const s = num(o.s, 1) > 0 ? num(o.s, 1) : 1, t = num(o.t, 0), pt = Math.max(0, num(o.pt, 0));
    const pose = POSES.indexOf(o.pose) >= 0 ? o.pose : 'idle';
    const E = poseState(pose, t, pt);
    return {
      spec, E, s, q: qOf(s), t, pt, pose, hp: o.hpPct === undefined ? 1 : clamp(num(o.hpPct, 1), 0, 1), phase: o.phase | 0, glow: num(o.glow, 0),
      flash: E.flash, m: E.m, wound: sm((0.5 - (o.hpPct === undefined ? 1 : clamp(num(o.hpPct, 1), 0, 1))) / 0.5),
    };
  }
  function register(spec) {
    ART.enemy.register(spec.id, {
      bounds: spec.bounds,
      draw(ctx, o) {
        const st = makeState(spec, o);
        if (st.E.die >= 1) return;
        ctx.save();
        if (spec.k) ctx.scale(spec.k, spec.k);
        if (st.E.die > 0 && spec.die && spec.die.clip !== false) dissolveClip(ctx, spec, st.E.die);
        spec.rig(ctx, st);
        ctx.restore();
        if (st.E.die > 0 && spec.die) { ctx.save(); if (spec.k) ctx.scale(spec.k, spec.k); dissolveFx(ctx, spec, st); ctx.restore(); }
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
  // move, rotate and scale the context about a pivot (px, py): the way every creature body is posed
  function xform(ctx, px, py, dx, dy, rot, sx, sy) {
    ctx.translate(px + dx, py + dy);
    if (rot) ctx.rotate(rot);
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    ctx.translate(-px, -py);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // DROWNED GENERAL (elite, l): the admiral of a fleet that sank with all hands, who will not believe it. Grander than the samurai: sea-green armour laced
  // in gold, great kuwagata horns of tarnished gold, a long white ghost moustache, a tattered sea-blue cape that never stops pouring water, a war fan raised
  // to command the flood, a cutlass held like a cane, and a pole on his back hung with blue-flame lanterns. Accent: pale ghost-light eyes, blue lantern fire.
  // ---------------------------------------------------------------------------------------------------------------
  const GC = { plate: '#1f7a80', plateF: '#175a66', lace: '#e8c86a', gold: '#e8bc4a', coral: '#ff7a6a', skin: '#a8c8d8', cape: '#2a5aa8', capeD: '#1a3a78', glow: '#a8ecff', flame: '#6ad0ff', iron: '#3a4a68' };
  function generalLeg(S, far) {
    const ox = far ? 56 : 0, pl = far ? GC.plateF : GC.plate, o = { depth: 6, line: 3.2, hi: !far, rim: far ? null : GC.glow };
    S.cel([[-42 + ox, -104], [-8 + ox, -104], [-6 + ox, -68], [-12 + ox, -62], [-38 + ox, -62], [-44 + ox, -70]], pl, Object.assign({ halftone: { d: 5, alpha: 0.3 }, decor(g) {
      for (let i = 0; i < 4; i++) tk.inkPath(g, [[-46 + ox, -98 + i * 9], [-4 + ox, -98 + i * 9]], { w: 2.4, color: GC.lace, alpha: 0.95, taper: 0.05, wobble: 0.04 });
    } }, o));
    S.cel(E(-25 + ox, -65, 14, 9.5), far ? '#8a7a3a' : GC.gold, { depth: 3, line: 2.8, hi: !far, rim: null });
    S.cel(cap(-25 + ox, -60, -28 + ox, -16, 24, 19), far ? '#26365a' : GC.iron, Object.assign({}, o, { depth: 5 }));
    S.line([[-36 + ox, -48], [-23 + ox, -46]], { w: 2.2, color: GC.lace, taper: 0.1 });
    S.line([[-35 + ox, -32], [-24 + ox, -31]], { w: 2.2, color: GC.lace, taper: 0.1 });
    [[-32, -42, 3.4], [-26, -36, 2.6], [-34, -26, 3], [-22, -50, 2.4]].forEach((b) => S.cel(E(b[0] + ox, b[1], b[2], b[2]), '#ecd8c8', { depth: 1.2, line: 1.4, hi: false, rim: null, shadow: false }));
    S.cel([[-46 + ox, -14], [-6 + ox, -14], [-1 + ox, -6], [-8 + ox, -1], [-42 + ox, -1], [-48 + ox, -6]], far ? '#6a8a9a' : GC.skin, { depth: 3, line: 2.8, hi: false, rim: null });
  }
  function generalSode(S, far) {
    const cx = far ? 58 : -58, pl = far ? GC.plateF : GC.plate;
    S.cel([[cx - 24, -194], [cx + 24, -197], [cx + 32, -140], [cx - 28, -134]], pl, {
      depth: 9, line: 3.2, tension: 0.25, rim: far ? null : GC.glow, hi: !far, halftone: { d: 5, alpha: 0.3 },
      decor(g) {
        for (let i = 0; i < 4; i++) tk.inkPath(g, [[cx - 30, -186 + i * 12], [cx + 34, -187 + i * 12]], { w: 2.6, color: GC.lace, alpha: 0.95, taper: 0.03, wobble: 0.04 });
        g.fillStyle = GC.gold; g.fillRect(cx - 30, -198, 66, 6);
        g.fillStyle = 'rgba(255,122,106,0.85)'; g.beginPath(); g.ellipse(cx + 4, -166, 9, 8, 0, 0, TAU); g.fill();
      },
    });
    S.cel(E(cx + 4, -166, 8, 7.5), GC.gold, { depth: 2, line: 2.2, hi: false, rim: null });
    [[cx - 14, -150, 3.4], [cx + 16, -176, 2.8], [cx + 8, -190, 2.2]].forEach((b) => S.cel(E(b[0], b[1], b[2], b[2]), '#ecd8c8', { depth: 1, line: 1.4, hi: false, rim: null, shadow: false }));
  }
  define('drowned_general', {
    size: 'l', lw: 3.4, k: 0.95,
    col: { rim: GC.glow },
    bounds: { w: 200, h: 326, head: { x: 0, y: -284 }, body: { x: 0, y: -150 }, feet: { x: 0, y: 0 } },
    die: { box: [-100, -290, 110, 4], nx: 12, ny: 16, from: 'top', order: 0.5, shape: 'ink', kinds: ['bubble', 'ink', 'bubble', 'coin'], cols: ['#a8ecff', '#1c3d78', '#d8f6ff', '#e8bc4a'], wind: [4, 12], size: 7.5 },
    parts: {
      legN: { box: [-56, -108, -2, 4], pivot: [-26, -100], draw(S) { generalLeg(S, false); } },
      legF: { box: [2, -108, 58, 4], pivot: [30, -100], draw(S) { generalLeg(S, true); } },
      torso: {
        box: [-56, -204, 58, -68], pivot: [0, -100],
        draw(S) {
          S.cel([[-36, -184], [-46, -164], [-44, -132], [-35, -110], [-33, -100], [33, -100], [37, -110], [46, -132], [48, -164], [38, -184], [0, -190]], GC.plate, {
            depth: 15, hi: true, hiW: 3, halftone: { d: 5, alpha: 0.32 }, rim: GC.glow,
            decor(g) {
              for (let i = 0; i < 7; i++) tk.inkPath(g, [[-50, -176 + i * 11], [-2, -173 + i * 11], [50, -176 + i * 11]], { w: 2.8, color: GC.lace, alpha: 0.95, taper: 0.03, wobble: 0.04 });
              for (let i = 0; i < 7; i++) tk.inkPath(g, [[-32 + i * 11, -190], [-32 + i * 11, -100]], { w: 1.2, color: '#0a2a34', alpha: 0.45, taper: 0.1 });
              g.fillStyle = 'rgba(255,122,106,0.55)'; g.beginPath(); g.ellipse(24, -126, 14, 9, 0.4, 0, TAU); g.fill();
            },
          });
          // the gilt breastplate with an anchor
          S.cel([[-20, -172], [16, -174], [18, -140], [-2, -128], [-22, -142]], GC.gold, { depth: 5, line: 2.8, hi: true, rim: '#fff0b0' });
          S.line([[-2, -166], [-2, -140]], { w: 3, color: '#8a6a24', taper: 0.1, pressure: 'flat' });
          S.line([[-10, -160], [6, -160]], { w: 3, color: '#8a6a24', taper: 0.1, pressure: 'flat' });
          S.line([[-12, -148], [-2, -136], [8, -148]], { w: 3, color: '#8a6a24', taper: 0.1 });
          for (let i = 0; i < 5; i++) {
            const x = -32 + i * 13.2;
            S.cel([[x, -104], [x + 13.2, -104], [x + 12, -76 - (i % 2) * 4], [x + 1, -75 - ((i + 1) % 2) * 4]], i % 2 ? GC.plateF : GC.plate, { depth: 4, line: 2.6, tension: 0.2, rim: null, hi: false });
            S.line([[x + 1.5, -94], [x + 11.5, -94]], { w: 1.8, color: GC.lace, taper: 0.1 });
            S.line([[x + 1.5, -85], [x + 11.5, -85]], { w: 1.8, color: GC.lace, taper: 0.1 });
          }
          S.cel({ poly: [[-35, -108], [35, -108], [35, -98], [-35, -98]] }, '#5a1a3a', { depth: 2, line: 2.4, tension: 0.2, rim: null });
          S.cel(E(0, -103, 7, 6), GC.gold, { depth: 2, line: 2.2, hi: false, rim: null });
        },
      },
      sodeN: { box: [-92, -204, -28, -128], pivot: [-52, -176], draw(S) { generalSode(S, false); } },
      sodeF: { box: [30, -204, 94, -128], pivot: [52, -176], draw(S) { generalSode(S, true); } },
      armN: {
        box: [-84, -190, -12, -104], pivot: [-46, -178],
        draw(S) {
          S.cel(cap(-46, -178, -62, -150, 24, 21), GC.plate, { depth: 6, line: 3.2, hi: true, rim: GC.glow });
          S.cel(cap(-62, -150, -40, -124, 21, 19), GC.iron, { depth: 5, line: 3.2, hi: true, rim: GC.glow });
          S.line([[-56, -146], [-46, -132]], { w: 2.2, color: GC.lace, taper: 0.1 });
          S.cel(E(-36, -118, 11, 10.5), GC.skin, { depth: 3, line: 2.8, hi: false });
        },
      },
      armF: {
        box: [4, -192, 82, -100], pivot: [50, -178],
        draw(S) {
          S.cel(cap(50, -178, 64, -152, 22, 19), GC.plateF, { depth: 6, line: 3.2, rim: null });
          S.cel(cap(64, -152, 48, -128, 19, 17), '#26365a', { depth: 5, line: 3.2, rim: null });
          S.cel(E(44, -122, 10, 9.5), '#6a8a9a', { depth: 3, line: 2.8, hi: false, rim: null });
        },
      },
      gunbai: {
        box: [-44, -100, 44, 12], pivot: [0, 0],
        draw(S) {
          // the war fan: iron-ribbed, with a gold sun of the flood
          S.cel(cap(0, 8, 0, -20, 7, 7), '#5a3a1a', { depth: 2, line: 2.4, hi: false, rim: null });
          S.cel([[-6, -20], [-40, -44], [-42, -76], [-22, -98], [0, -102], [22, -98], [42, -76], [40, -44], [6, -20]], '#e8d8b0', { depth: 8, line: 3.2, hi: true, hiW: 2.6, rim: '#ffffff', halftone: { d: 5, alpha: 0.2, color: '#8a7a5a' }, tension: 0.8,
            decor(g) { for (let i = -3; i <= 3; i++) tk.inkPath(g, [[0, -20], [i * 12, -100]], { w: 1.3, color: '#8a7a5a', alpha: 0.6, taper: 0.1 }); g.fillStyle = '#1c3d78'; g.beginPath(); g.ellipse(0, -62, 22, 26, 0, 0, TAU); g.fill(); } });
          S.cel(E(0, -62, 15, 17, 14), GC.gold, { depth: 3, line: 2.6, hi: true, rim: '#fff0b0' });
          for (let i = 0; i < 3; i++) tk.inkPath(S.g, [[-12 + i * 12, -58 + Math.abs(i - 1) * 2], [-12 + i * 12 + 6, -72]], { w: 2, color: '#1c3d78', taper: 0.2 });
        },
      },
      cutlass: {
        box: [-12, -16, 118, 16], pivot: [0, 0],
        draw(S) {
          S.cel(cap(-10, 0, 4, 0, 9, 9), '#1b1735', { depth: 2, line: 2.4, hi: false, rim: null, tension: 0.5 });
          S.cel(E(6, 0, 4.4, 12, 12), GC.gold, { depth: 2, line: 2.6, hi: true, rim: null });
          S.cel([[8, -4], [44, -8], [84, -9], [106, -5], [116, 4, 1], [98, 5], [80, 3], [44, 4], [8, 4]], '#e8f6ff', { depth: 3, line: 2.8, hi: false, rim: GC.glow, rimW: 1.6, tension: 0.4, decor(g) { tk.inkPath(g, [[10, 0], [56, -2], [96, 0]], { w: 1.4, color: '#7a9ad0', alpha: 0.9, taper: 0.2, wobble: 0.15 }); } });
        },
      },
      pole: {
        box: [-24, -352, 112, -150], pivot: [40, -150],
        draw(S) {
          S.cel(cap(40, -150, 44, -338, 5.4, 4.4), '#6a4a2a', { depth: 1.6, line: 2.6, hi: false, rim: null, tension: 0.4 });
          S.cel(cap(-14, -334, 100, -338, 4.6, 4.6), '#6a4a2a', { depth: 1.4, line: 2.4, hi: false, rim: null, tension: 0.4 });
          S.cel(E(44, -345, 5, 5), GC.gold, { line: 1.8, hi: false, rim: null });
        },
      },
      lantern: {
        box: [-16, -6, 16, 46], pivot: [0, 0],
        draw(S) {
          S.line([[0, 0], [0, 8]], { w: 2, color: '#6a4a2a', taper: 0.05, pressure: 'flat', wobble: 0 });
          S.cel({ poly: [[-9, 8], [9, 8], [11, 13], [-11, 13]] }, '#1b1735', { depth: 1.5, line: 2.2, tension: 0.2, hi: false, rim: null });
          S.cel([[-9, 12], [-13, 22], [-12, 34], [-8, 40], [8, 40], [12, 34], [13, 22], [9, 12]], '#dceeff', { depth: 4, line: 2.6, hi: false, rim: GC.glow, decor(g) { const rg = g.createRadialGradient(0, 26, 1, 0, 26, 18); rg.addColorStop(0, 'rgba(200,240,255,1)'); rg.addColorStop(1, 'rgba(106,208,255,0.2)'); g.fillStyle = rg; g.fillRect(-16, 8, 32, 34); for (let i = 1; i < 4; i++) tk.inkPath(g, [[-13, 12 + i * 7], [0, 14 + i * 7], [13, 12 + i * 7]], { w: 1.1, color: '#5a7ab0', alpha: 0.6, taper: 0.1 }); } });
          S.cel({ poly: [[-9, 39], [9, 39], [10, 44], [-10, 44]] }, '#1b1735', { depth: 1.5, line: 2.2, tension: 0.2, hi: false, rim: null });
        },
      },
      head: {
        box: [-96, -296, 96, -176], pivot: [0, -190],
        draw(S) {
          S.cel([[16, -226], [52, -216], [60, -190], [50, -176], [24, -180], [12, -200]], GC.plateF, { depth: 6, line: 3.2, hi: false, rim: null, decor(g) { for (let i = 0; i < 3; i++) tk.inkPath(g, [[14, -220 + i * 13], [58, -214 + i * 13]], { w: 2, color: GC.lace, alpha: 0.95, taper: 0.05 }); } });
          S.cel([[-32, -222], [-56, -212], [-62, -190], [-50, -176], [-26, -182], [-16, -202]], GC.plate, { depth: 6, line: 3.2, hi: false, rim: GC.glow, decor(g) { for (let i = 0; i < 3; i++) tk.inkPath(g, [[-60, -212 + i * 13], [-14, -216 + i * 13]], { w: 2, color: GC.lace, alpha: 0.95, taper: 0.05 }); } });
          S.cel(cap(0, -194, 0, -180, 22, 22), '#1a1a30', { depth: 3, line: 2.6, hi: false, rim: null });
          // a weathered, noble ghost face
          S.cel(E(-2, -208, 27, 27, 18), GC.skin, { depth: 10, line: 3.2, hi: true, hiW: 3, rim: '#ffffff', halftone: { d: 5, alpha: 0.24, color: '#5a7a9a' } });
          S.line([[-18, -196], [-10, -193]], { w: 1.4, alpha: 0.7, taper: 0.4, color: '#6a8aa0' });
          S.line([[8, -196], [16, -193]], { w: 1.4, alpha: 0.7, taper: 0.4, color: '#6a8aa0' });
          // great white brows, a long drooping moustache
          S.cel([[-26, -222], [-8, -216], [-2, -219], [-8, -211], [-26, -212]], '#f0f6ff', { depth: 3, line: 2.4, hi: false, rim: null, shadow: false });
          S.cel([[22, -222], [4, -216], [-2, -219], [4, -211], [22, -212]], '#f0f6ff', { depth: 3, line: 2.4, hi: false, rim: null, shadow: false });
          S.cel([[-2, -198], [-12, -202], [-26, -196], [-38, -176], [-32, -166], [-22, -178], [-12, -186], [-2, -188], [8, -186], [18, -178], [28, -166], [34, -176], [22, -196], [10, -202]], '#f4f8ff', { depth: 6, line: 3, hi: true, hiW: 2.2, rim: '#ffffff', halftone: { d: 5, alpha: 0.2, color: '#8aa0c0' } });
          S.line([[-2, -196], [-4, -168]], { w: 1.6, color: '#9ab0d0', taper: 0.3 });
          S.line([[-14, -190], [-22, -172]], { w: 1.4, color: '#9ab0d0', taper: 0.3 });
          S.line([[10, -190], [18, -172]], { w: 1.4, color: '#9ab0d0', taper: 0.3 });
          S.cel(E(-14, -211, 7.5, 5.6, 12, 0.2), '#04081a', { line: 2, shadow: false });
          S.cel(E(10, -211, 7.5, 5.6, 12, -0.2), '#04081a', { line: 2, shadow: false });
          // the helm and its great kuwagata horns
          S.cel([[-34, -220], [-33, -240], [-16, -254], [4, -258], [26, -252], [36, -236], [35, -218], [26, -224], [0, -228], [-26, -224]], GC.plate, {
            depth: 14, line: 3.4, hi: true, hiW: 3, rim: GC.glow, halftone: { d: 5, alpha: 0.32 },
            decor(g) { for (let i = 0; i < 7; i++) tk.inkPath(g, [[0, -260], [-38 + i * 12.5, -220]], { w: 1.4, color: '#0a2a34', alpha: 0.5, taper: 0.1 }); g.fillStyle = GC.gold; g.fillRect(-38, -228, 78, 4); },
          });
          for (let i = 0; i < 6; i++) S.cel(E(-27 + i * 10.8, -231 - Math.abs(i - 2.5) * 1.2, 2.4, 2.4), GC.gold, { line: 1.4, depth: 0.8, hi: false, rim: null, shadow: false });
          [-1, 1].forEach((sg) => {
            const horn = [[sg * 20, -246], [sg * 40, -270], [sg * 62, -282], [sg * 84, -276], [sg * 66, -266], [sg * 46, -258], [sg * 30, -240]];
            S.cel(horn, GC.gold, { depth: 5, line: 3.2, hi: true, hiW: 2.4, rim: '#fff0b0', decor(g) { g.fillStyle = 'rgba(62,160,150,0.5)'; g.beginPath(); g.arc(sg * 50, -272, 5, 0, TAU); g.fill(); } });
          });
          S.cel([[-6, -256], [0, -290], [6, -256]], GC.gold, { depth: 3, line: 3, hi: true, rim: '#fff0b0', tension: 0.3 });
          S.cel(E(0, -252, 6, 6), GC.coral, { line: 1.8, shadow: false });
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die;
      const br = Math.sin(TAU * t / 3.2) * m;
      const crouch = 6 * tele + 3 * guard + 5 * Math.max(0, -sw);
      const dx = -sw * 40 + hurt * 24 + tele * 8;
      const rot = -0.07 * sw + 0.09 * hurt + 0.05 * tele - 0.03 * br;
      const hot = clamp(tele + Math.max(0, sw) + buff, 0, 1);
      ctx.save();
      xform(ctx, 0, -100, dx, crouch, rot, 1, 1 - 0.02 * br - 0.03 * hurt);
      // the cape, drawn live so it never shows a seam: a wave running down it
      {
        const N = 7, sp = [];
        for (let i = 0; i < N; i++) { const u = i / (N - 1); sp.push([24 + u * 66 + Math.sin(TAU * t / 2.1 - u * 3.6) * (4 + 16 * u) * m + 0.35 * sw * u * -30 + 12 * hurt * u, -186 + u * 178]); }
        tk.ribbon(ctx, sp, GC.cape, {
          wMax: 86, w0: 46, w1: 70, profile: (u) => 0.55 + 0.45 * Math.sin(PI * (0.15 + 0.85 * u) * 0.9) * (1 + 0.06 * Math.sin(u * 14 - t * 3)), gloss: false, rim: '#6a8ac8', rimW: 1.8, shadow: GC.capeD, shadowW: 0.5, halftone: { d: 5, alpha: 0.28 }, line: 3.4, strands: 0,
          decor(g) {
            for (let k = 1; k < N - 1; k++) { const p = sp[k]; g.beginPath(); g.arc(p[0], p[1], 9, 0.1 * PI, 0.9 * PI); g.lineWidth = 2; g.strokeStyle = GC.gold; g.globalAlpha = 0.75; g.stroke(); g.beginPath(); g.arc(p[0], p[1], 5, 0.1 * PI, 0.9 * PI); g.stroke(); }
            g.globalAlpha = 1;
          },
        });
      }
      // the lantern pole behind him, its lanterns swinging on cords
      put(ctx, st, 'pole', { r: 0.02 * br + 0.04 * sw });
      [[-2, -335], [44, -336], [90, -337]].forEach((L, i) => {
        const sway = m * 0.2 * Math.sin(TAU * (t / 1.9) + i * 1.7) + 0.16 * hurt - 0.1 * sw;
        put(ctx, st, 'lantern', { x: L[0], y: L[1], r: sway, noFlash: true });
        tk.glow(ctx, L[0] + Math.sin(sway) * -26, L[1] + 26 * Math.cos(sway), 30 + 6 * buff, GC.flame, cA((0.5 + 0.25 * Math.sin(t * 7 + i) + 0.3 * hot) * (1 - die)));
      });
      put(ctx, st, 'armF', { r: -1.2 + 0.25 * sw + 0.3 * tele - 0.5 * buff * Math.sin(PI * E0.buffP) + 2.2 * guard + 0.05 * br, kids(c) { put(c, st, 'gunbai', { x: 44, y: -122, r: 1.15 - 0.3 * tele - 0.35 * sw + 0.5 * buff - 1.5 * guard }); } });
      put(ctx, st, 'legF', { r: -0.06 * sw + 0.05 * hurt });
      put(ctx, st, 'torso', {
        r: 0.02 * br,
        kids(c) {
          put(c, st, 'head', {
            r: 0.02 * br - 0.05 * sw + 0.1 * hurt + 0.04 * tele, y: 2 * tele,
            kids(cc) {
              const open = blink(t, 'general', 4.8) * (1 - 0.4 * hurt);
              [[-14, -211, 1], [10, -211, -1]].forEach((e) => eyeLive(cc, e[0], e[1], 6.6 + 1.6 * hot, 4.8 + 1.2 * hot, { open, iris: ['#a8ecff', '#ffffff'], sclera: '#ffffff', pupil: 'none', glow: GC.glow, glowK: 0.75 + 0.3 * hot, glowR: 3.2, lw: 1.8, rot: e[2] * 0.2 * (1 + hot), catch: false }));
              if (hot > 0.1) tk.glow(cc, -2, -210, 46 + 22 * hot, GC.glow, 0.3 * hot);
            },
          });
        },
      });
      put(ctx, st, 'legN', { r: 0.05 * sw - 0.05 * hurt - 0.05 * tele });
      // the cutlass arm: a cane at rest, then a great overhead chop
      const p = E0.pose === 'attack' ? E0.p : 0;
      const nArm = 0.3 + 0.35 * tele + (E0.pose === 'attack' ? lerp(0, -0.4, sm(p / 0.3)) + 2.0 * ease.outQuad(clamp((p - 0.3) / 0.22, 0, 1)) - 1.7 * sm((p - 0.62) / 0.38) * 0.9 : 0) + 1.2 * guard - 0.4 * hurt;
      put(ctx, st, 'armN', {
        r: nArm,
        kids(c) {
          const rel = (E0.pose === 'attack' ? lerp(2.2, 0.4, ease.inOutQuad(clamp((p - 0.3) / 0.26, 0, 1))) : 1.9 - 0.4 * tele) - nArm - rot;
          put(c, st, 'cutlass', { x: -36, y: -118, r: rel - 0.2 * guard });
          if (E0.pose === 'attack' && p > 0.34 && p < 0.72) {
            c.save(); c.translate(-36, -118);
            const a1 = rel, a0 = a1 + 1.1, u = sm((p - 0.34) / 0.14) * (1 - sm((p - 0.62) / 0.1));
            c.beginPath(); c.arc(0, 0, 118, a0, a1, true); c.arc(0, 0, 44, a1, a0, false); c.closePath();
            const gg = c.createRadialGradient(0, 0, 44, 0, 0, 118); gg.addColorStop(0, 'rgba(168,236,255,0.05)'); gg.addColorStop(1, 'rgba(230,250,255,0.75)');
            c.globalAlpha = u; c.fillStyle = gg; c.fill(); c.restore();
          }
          if (tele > 0.3) tk.glow(c, -36, -118, 30, GC.glow, 0.5 * tele);
        },
      });
      put(ctx, st, 'sodeF', { r: 0.03 * br });
      put(ctx, st, 'sodeN', { r: -0.03 * br - 0.1 * Math.max(0, sw) + 0.05 * hurt });
      ctx.restore();
      // the flood at his feet: a wide wet pool, ripples and drips
      ctx.save(); ctx.translate(dx * 0.5, -3); ctx.scale(1, 0.18);
      ctx.beginPath(); ctx.arc(0, 0, 96, 0, TAU); ctx.fillStyle = 'rgba(40,90,170,0.34)'; ctx.globalAlpha = cA(1 - die); ctx.fill();
      ctx.restore();
      ripples(ctx, dx * 0.5, -3, t, 86, '#a8ecff', 3);
      for (let i = 0; i < 7; i++) {
        const per = 1.2 + 0.5 * hv('gen', 'd' + i), u = (((t + hv('gen', 'o' + i) * per) % per) + per) % per / per;
        const sx = [-70, -34, 10, 50, 78, 66, -52][i], sy = [-110, -78, -74, -110, -80, -30, -150][i];
        ctx.save(); ctx.globalAlpha = cA(Math.min(1, u * 5) * (1 - u) * 0.95 * (1 - die));
        ctx.beginPath(); ctx.ellipse(dx + sx, sy + u * u * (-sy + 4) * 0.98 + crouch * 0.5, 2, 3.4, 0, 0, TAU); ctx.fillStyle = '#c8f0ff'; ctx.fill(); ctx.restore();
      }
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // CHOCHIN LANTERN (normal, m): a one-eyed paper lantern, warm candle glow, a long tongue. Floats. Accent: the amber flame and the vermilion eye.
  // ---------------------------------------------------------------------------------------------------------------
  define('chochin', {
    size: 'm', lw: 3,
    col: { rim: '#ffd98a' },
    bounds: { w: 118, h: 201, head: { x: 0, y: -176 }, body: { x: 0, y: -104 }, feet: { x: 0, y: 0 } },
    die: { box: [-62, -196, 62, -20], nx: 10, ny: 13, from: 'bottom', order: 0.86, shape: 'paper', kinds: ['ember', 'scrap', 'ember'], cols: ['#ffb040', '#f6e4bd', '#ff6a2a'], wind: [8, -34], size: 6 },
    parts: {
      body: {
        box: [-52, -170, 52, -30], pivot: [0, -98],
        draw(S) {
          const g = S.g;
          const shape = [[-32, -148], [-44, -128], [-48, -98], [-44, -66], [-32, -48], [0, -44], [32, -48], [44, -66], [48, -98], [44, -128], [32, -148], [0, -152]];
          S.cel(shape, '#f6e4bd', {
            depth: 14, hi: true, hiW: 3, halftone: { d: 5, alpha: 0.3 }, rim: '#ffd98a',
            decor(gg) {
              const rg = gg.createRadialGradient(-2, -104, 3, -2, -102, 58);
              rg.addColorStop(0, 'rgba(255,196,80,0.98)'); rg.addColorStop(0.5, 'rgba(255,154,52,0.62)'); rg.addColorStop(1, 'rgba(255,120,40,0)');
              gg.fillStyle = rg; gg.fillRect(-60, -160, 120, 130);
              gg.fillStyle = '#cf3a2a'; gg.fillRect(-60, -154, 120, 15); gg.fillRect(-60, -60, 120, 14);
              gg.fillStyle = '#f5c96a'; gg.fillRect(-60, -139, 120, 2.2); gg.fillRect(-60, -62, 120, 2.2);
              for (let i = 1; i <= 6; i++) {
                const y = -138 + i * 13, hw = 48 - Math.pow((y + 98) / 52, 2) * 16;
                tk.inkPath(gg, [[-hw, y - 2], [-hw * 0.5, y + 3], [0, y + 5], [hw * 0.5, y + 3], [hw, y - 2]], { w: 1.5, color: '#7a2a1a', alpha: 0.5, taper: 0.1, wobble: 0.1, seed: i });
              }
            },
          });
          // lacquered caps with gold trim
          S.cel({ poly: [[-38, -147], [-34, -160], [34, -160], [38, -147]] }, '#2a1e4a', { depth: 4, rim: '#6a5aa8', hi: false, tension: 0.3 });
          S.line([[-34, -156], [0, -158], [34, -156]], { w: 1.8, color: '#f5c96a', taper: 0.2 });
          S.cel({ poly: [[-36, -48], [-31, -35], [31, -35], [36, -48]] }, '#2a1e4a', { depth: 4, rim: '#6a5aa8', hi: false, tension: 0.3 });
          S.line([[-31, -40], [0, -38], [31, -40]], { w: 1.8, color: '#f5c96a', taper: 0.2 });
          // three tassels under the bottom cap
          [-15, 0, 15].forEach((x, i) => {
            S.line([[x, -36], [x + (i - 1) * 2, -26], [x + (i - 1) * 3, -16]], { w: 3, color: '#cf3a2a', taper: 0.15, wobble: 0.05 });
            S.cel(E(x + (i - 1) * 3, -14, 4.2, 5), '#f5c96a', { line: 1.6, depth: 2, shadow: false });
          });
        },
      },
      lipTop: {
        box: [-34, -84, 34, -56], pivot: [0, -70],
        draw(S) {
          S.cel({ poly: toothRow(-27, 27, -69, 10, 6, 2.5) }, '#fff6e0', { depth: 3, line: 2, tension: 0.2, hi: false, rim: null });
          S.line([[-31, -70], [-16, -75], [0, -76.5], [16, -75], [31, -70]], { w: 3.6, taper: 0.12, wobble: 0.05 });
          S.line([[-27, -73], [-10, -77], [12, -77]], { w: 1.4, color: '#e6b76a', alpha: 0.9, taper: 0.4 });
        },
      },
      lipBot: {
        box: [-34, -76, 34, -50], pivot: [0, -64],
        draw(S) {
          S.cel({ poly: toothRow(-22, 22, -62, -8, 5, 2) }, '#fff6e0', { depth: 3, line: 2, tension: 0.2, hi: false, rim: null });
          S.line([[-30, -62], [-15, -58.5], [0, -57.5], [15, -58.5], [30, -62]], { w: 3.6, taper: 0.12, wobble: 0.05 });
        },
      },
      armN: {
        box: [-84, -104, -38, -56], pivot: [-45, -92],
        draw(S) {
          S.cel(cap(-45, -92, -63, -74, 13, 9), '#f6e4bd', { depth: 4, hi: false, line: 2.6 });
          S.line([[-50, -88], [-58, -80]], { w: 4.4, color: '#cf3a2a', alpha: 0.95, taper: 0.1 });
          S.cel([[-62, -78], [-70, -80], [-76, -73], [-72, -65], [-64, -64], [-60, -70]], '#f6e4bd', { depth: 3, hi: false, line: 2.4 });
          S.line([[-72, -73], [-66, -70]], { w: 1.2, alpha: 0.7, taper: 0.4 });
          S.line([[-71, -68], [-65, -67]], { w: 1.2, alpha: 0.7, taper: 0.4 });
        },
      },
    },
    chains: {
      tongue: {
        spine: [[-8, -62], [-20, -52], [-12, -38], [-26, -24], [-20, -10]], cuts: [0.26, 0.52, 0.78], reach: 26,
        draw(S) {
          S.rib([[-8, -62], [-20, -52], [-12, -38], [-26, -24], [-20, -10]], '#f0607a', { wMax: 15, w0: 12, w1: 9, cap: 'round', gloss: true, glossAlpha: 0.7, tipPow: 2, rim: '#ffb0c0' });
          S.line([[-10, -58], [-19, -50], [-13, -38], [-25, -26]], { w: 1.5, color: '#a02848', alpha: 0.7, taper: 0.3 });
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die;
      const breath = 1 + 0.018 * m * Math.sin(TAU * t / 1.9);
      const bob = Math.sin(TAU * t / 2.3) * 4 * m;
      const lift = -16 + bob - buff * 12 - tele * 6 + die * 20;
      const dx = -sw * 30 + hurt * 20 + tele * 9;
      const rot = 0.03 * m * Math.sin(TAU * t / 3.1) - 0.13 * sw + 0.17 * hurt + 0.08 * tele + 0.06 * Math.sin(t * 40) * tele * 0.3;
      let sy = 1 + (sw < 0 ? sw * 0.12 : sw * 0.07) + 0.09 * tele + 0.16 * buff - 0.1 * hurt - 0.06 * guard - 0.3 * die;
      let sx = 1 - (sy - 1) * 0.8 + (breath - 1) * 0.5;
      sy *= breath;
      const fl = flick(t, 3, 7);
      ctx.save();
      xform(ctx, 0, -98, dx, lift, rot, sx, sy);
      // the candle flame behind the top cap
      const flameH = 40 + 26 * buff + 22 * tele + 12 * Math.max(0, sw) - 30 * die - 12 * hurt;
      flameLive(ctx, 0, -156, 12 + 3 * buff, Math.max(4, flameH), t, 1, { glowK: 0.55 + 0.25 * buff, lean: -3 * sw });
      // the far arm, then the body
      put(ctx, st, 'armN', { sx: -1, x: 90, r: -0.25 * Math.sin(t * 2.1) * m + 0.6 * buff * -1 + guard * 0.5, noFlash: false });
      put(ctx, st, 'body');
      // warm glow through the paper
      tk.glow(ctx, -2, -104, 62, '#ffb03a', cA((0.34 + 0.14 * fl + 0.22 * tele + 0.2 * buff) * (1 - die * 0.6)));
      // the eye: one big, curious, easily angered
      const angry = clamp(tele * 0.9 + Math.max(0, sw) * 0.8, 0, 1);
      const open = blink(t, 'chochin') * (1 - 0.5 * guard) * (1 - 0.6 * hurt) * (1 + 0.12 * tele);
      const look = [Math.sin(t * 0.7) * 0.6 - 0.5 * angry - 0.4 * sw, Math.sin(t * 0.43) * 0.3];
      eyeLive(ctx, -1, -108, 19, 22, { open, iris: ['#ff3f1a', '#ffc23a'], sclera: '#fff2c8', look, glow: '#ffb040', glowK: 0.5 + 0.4 * angry, lw: 2.8, pupil: 'slit' });
      tk.inkPath(ctx, [[-25, lerp(-133, -139, angry)], [-3, lerp(-141, -130, angry)], [21, lerp(-134, -140, angry)]], { w: 5.2, taper: 0.28, pressure: 'mid', wobble: 0.06, seed: 4 });
      // mouth: interior fire between the lips
      const mo = 0.1 + 0.28 * Math.max(0, sw) + 0.5 * tele + 0.5 * buff + 0.3 * hurt + 0.05 * Math.sin(t * 2.2) * m;
      const gap = 5 + mo * 24, jaw = mo * 12;
      ctx.save();
      ctx.beginPath(); ctx.ellipse(0, -66 + jaw * 0.4, 28, 3 + gap * 0.5, 0, 0, TAU);
      const ig = ctx.createLinearGradient(0, -70, 0, -60 + gap);
      ig.addColorStop(0, '#ff8a2a'); ig.addColorStop(0.6, '#ffd15a'); ig.addColorStop(1, '#ff6a2a');
      ctx.fillStyle = ig; ctx.fill();
      ctx.lineWidth = 2.4; ctx.strokeStyle = pal.ink; ctx.stroke();
      ctx.restore();
      tk.glow(ctx, 0, -66, 30 + gap, '#ffb040', cA(0.28 + 0.4 * mo));
      // the tongue lolls out of the corner of the mouth
      ctx.save(); ctx.translate(0, jaw);
      const tb = [0, 0, 0, 0].map((_, j) => m * 0.2 * Math.sin(TAU * (t / 1.7) - j * 0.9 + 0.7) * (0.7 + j * 0.4) + hurt * 0.2 * (j + 1) - sw * 0.1 * (j + 1));
      putChain(ctx, st, 'tongue', tb, { a: 1 });
      ctx.restore();
      put(ctx, st, 'lipBot', { y: jaw });
      put(ctx, st, 'lipTop', { y: -mo * 6 });
      // near arm
      put(ctx, st, 'armN', { r: 0.28 * Math.sin(t * 2.4 + 1) * m - 0.7 * buff - 1.1 * Math.max(0, sw) + 0.5 * guard + 0.3 * tele });
      // a jet of fire from the mouth during the attack
      if (E0.pose === 'attack' && E0.p > 0.3 && E0.p < 0.75) {
        const jet = Math.sin(PI * (E0.p - 0.3) / 0.45);
        for (let i = 0; i < 8; i++) {
          const u = i / 7, jx = -24 - u * 105 * jet, jy = -62 + (tk.noise1(t * 20 + i * 3, 9) - 0.5) * 12 * u + u * 8;
          flameLive(ctx, jx, jy, 6 + u * 13, 16 + u * 14, t + i * 0.3, 20 + i, { glowK: 0.3 * jet, lean: -14 - u * 10, glow: '#ff8a3a' });
        }
      }
      ctx.restore();
      motes(ctx, 0 + dx, -178 + lift, t, 5, 11, { col: '#ffb040', rise: 34, spread: 12, life: 1.5, alpha: 0.9 * (1 - die) });
      ctx.save(); ctx.translate(dx * 0.6, -3); ctx.scale(1, 0.2); tk.glow(ctx, 0, 0, 74, '#ffb040', cA((0.26 + 0.1 * fl) * (1 - die))); ctx.restore();
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // PUPPET MASTER (elite, l): the theatre's last puppeteer, who never got up from his stool. A gaunt figure in a plum robe and a tall black eboshi hat, chalk-white
  // face with red kabuki lines and hollow glowing eyes, huge sleeves, long spidery hands. A crimson string runs from every finger up out of sight, and he plays
  // them. Elite: taller, stool, hat, ten glowing strings. Accent: hot crimson-pink strings and eyes.
  // ---------------------------------------------------------------------------------------------------------------
  const PM = { robe: '#4a3a86', robeD: '#33266a', gold: '#f5c96a', skin: '#eee6ea', skinD: '#b8a8b8', wood: '#7a4a2a', hat: '#241c42', string: '#ff5a7a', verm: '#d8402e' };
  const PM_TIPS = [[-20, -30], [-10, -34], [0, -35], [10, -33], [19, -28]];      // fingertip offsets from the wrist, at rest (left hand; the right is mirrored)
  function masterHand(S, far) {
    const base = far ? '#c8b8c8' : PM.skin, o = { depth: 2.4, line: 2.4, hi: false, rim: far ? null : '#ffc0d0' };
    S.cel(E(0, -4, 10, 8.5), base, Object.assign({}, o, { depth: 3 }));
    PM_TIPS.forEach((tp, i) => {
      const bx = (i - 2) * 4.6, mx = bx + tp[0] * 0.5, my = -8 + tp[1] * 0.5;
      S.cel(cap(bx, -8, mx, my, 5.6 - i * 0.05, 4.6), base, o);
      S.cel(cap(mx, my, tp[0], tp[1], 4.6, 3.2), base, o);
      S.cel(E(mx, my, 2.6, 2.6, 6), far ? '#a898a8' : '#d8c8d8', { line: 1.4, depth: 0.5, hi: false, rim: null, shadow: false });
    });
  }
  define('puppet_master', {
    size: 'l', lw: 3.2, k: 0.9,
    col: { rim: '#ffc0d0' },
    bounds: { w: 190, h: 286, head: { x: 0, y: -280 }, body: { x: 0, y: -140 }, feet: { x: 0, y: 0 } },
    die: { box: [-120, -290, 120, 4], nx: 12, ny: 16, from: 'top', order: 0.5, shape: 'paper', kinds: ['scrap', 'thread', 'ink', 'thread'], cols: ['#4a3a86', '#ff5a7a', '#241c42', '#f5c96a'], wind: [-4, 14], size: 7 },
    parts: {
      stool: {
        box: [-64, -104, 66, 4], pivot: [0, 0],
        draw(S) {
          [[-40, -50], [40, 52]].forEach((l, i) => S.cel(cap(l[0], -84, l[1], -2, 8, 9), i ? '#5a3418' : PM.wood, { depth: 2.4, line: 2.8, hi: false, rim: null }));
          S.cel(cap(0, -84, 0, -2, 9, 10), PM.wood, { depth: 2.4, line: 2.8, hi: true, rim: '#f0b890' });
          S.line([[-46, -40], [46, -40]], { w: 5, color: '#5a3418', taper: 0.05, pressure: 'flat', wobble: 0.03 });
          S.cel(tk.rrectPts(-56, -102, 112, 18, 7), PM.wood, { depth: 5, line: 3, hi: true, rim: '#f0b890' });
          S.cel(tk.rrectPts(-50, -110, 100, 10, 5), '#a02838', { depth: 3, line: 2.6, hi: true, rim: '#ff8a7a' });
        },
      },
      legN: {
        box: [-36, -66, 2, 6], pivot: [-16, -60],
        draw(S) {
          S.cel(cap(-16, -60, -18, -18, 14, 10.5), '#241c42', { depth: 3, line: 2.6, hi: true, rim: '#8a80ff' });
          S.cel(E(-18, -12, 10, 6.6), '#f2ecec', { depth: 2, line: 2.4, hi: false, rim: null });
          S.cel({ poly: [[-32, -8], [-4, -8], [-2, -3], [-34, -3]] }, '#5a3418', { depth: 2, line: 2.2, tension: 0.2, rim: null });
        },
      },
      legF: {
        box: [-2, -66, 34, 6], pivot: [14, -60],
        draw(S) {
          S.cel(cap(14, -60, 12, -20, 13, 10), '#1a1434', { depth: 3, line: 2.6, hi: false, rim: null });
          S.cel(E(11, -14, 9.6, 6.4), '#d0c8c8', { depth: 2, line: 2.4, hi: false, rim: null });
          S.cel({ poly: [[-2, -10], [24, -10], [26, -5], [0, -5]] }, '#4a2a14', { depth: 2, line: 2.2, tension: 0.2, rim: null });
        },
      },
      robe: {
        box: [-78, -186, 78, -46], pivot: [0, -100],
        draw(S) {
          S.cel([[-44, -174], [-53, -142], [-58, -104], [-70, -70], [-44, -52], [0, -47], [44, -52], [70, -70], [58, -104], [53, -142], [44, -174], [0, -182]], PM.robe, {
            depth: 16, line: 3.2, hi: true, hiW: 3, rim: '#ffc0d0', halftone: { d: 5, alpha: 0.32 },
            decor(g) {
              for (let i = 0; i < 5; i++) tk.inkPath(g, [[-30 + i * 15, -176], [-38 + i * 19, -52]], { w: 1.4, color: '#241a56', alpha: 0.5, taper: 0.1, wobble: 0.06, seed: i });
              // golden puppet-cross crest on the lap
              g.strokeStyle = PM.gold; g.lineWidth = 3;
              g.beginPath(); g.moveTo(-14, -84); g.lineTo(14, -84); g.moveTo(0, -94); g.lineTo(0, -68); g.moveTo(-9, -96); g.lineTo(9, -96); g.stroke();
              g.beginPath(); g.arc(0, -70, 3, 0, TAU); g.fillStyle = PM.gold; g.fill();
              tk.inkPath(g, [[-70, -70], [-44, -62], [0, -58], [44, -62], [70, -70]], { w: 4, color: PM.gold, taper: 0.05, pressure: 'flat', wobble: 0.04 });
            },
          });
          S.cel({ poly: [[-14, -180], [0, -150], [14, -180], [8, -180], [0, -164], [-8, -180]] }, '#f4ecec', { depth: 2, line: 2, tension: 0.2, hi: false, rim: null });
          S.cel({ poly: [[-52, -126], [52, -126], [56, -108], [-56, -108]] }, '#1a1434', { depth: 3, line: 2.6, tension: 0.2, rim: '#8a80ff' });
          S.line([[-52, -117], [54, -117]], { w: 1.6, color: PM.gold, alpha: 0.9, taper: 0.05, pressure: 'flat' });
        },
      },
      armN: {
        box: [-124, -196, -30, -120], pivot: [-40, -166],
        draw(S) {
          S.cel([[-38, -176], [-72, -178], [-98, -166], [-108, -152], [-98, -144], [-72, -150], [-40, -150]], PM.robe, {
            depth: 8, line: 3, hi: true, hiW: 2.6, rim: '#ffc0d0', halftone: { d: 5, alpha: 0.3 },
            decor(g) { tk.inkPath(g, [[-100, -164], [-104, -152], [-96, -146]], { w: 4, color: '#1a1434', taper: 0.05, pressure: 'flat' }); tk.inkPath(g, [[-70, -172], [-84, -158], [-70, -152]], { w: 1.4, color: '#241a56', alpha: 0.6, taper: 0.2 }); },
          });
        },
      },
      handN: { box: [-40, -50, 40, 12], pivot: [0, 0], draw(S) { masterHand(S, false); } },
      armF: {
        box: [30, -196, 124, -120], pivot: [40, -166],
        draw(S) {
          S.cel([[38, -176], [72, -178], [98, -166], [108, -152], [98, -144], [72, -150], [40, -150]], PM.robeD, {
            depth: 8, line: 3, hi: false, rim: null, halftone: { d: 5, alpha: 0.3 },
            decor(g) { tk.inkPath(g, [[100, -164], [104, -152], [96, -146]], { w: 4, color: '#120e28', taper: 0.05, pressure: 'flat' }); },
          });
        },
      },
      handF: { box: [-40, -50, 40, 12], pivot: [0, 0], draw(S) { masterHand(S, true); } },
      head: {
        box: [-36, -246, 36, -170], pivot: [0, -180],
        draw(S) {
          S.cel([[-28, -214], [-40, -204], [-34, -196], [-26, -200]], PM.skin, { depth: 2, line: 2.4, hi: false, rim: null });
          S.cel([[28, -214], [40, -204], [34, -196], [26, -200]], PM.skin, { depth: 2, line: 2.4, hi: false, rim: null });
          S.cel([[-22, -236], [-26, -212], [-22, -192], [-9, -180], [0, -175], [9, -180], [22, -192], [26, -212], [22, -236], [0, -242]], PM.skin, {
            depth: 10, line: 3.2, hi: true, hiW: 2.6, rim: '#ffffff', halftone: { d: 5, alpha: 0.24, color: '#8a6a8a' },
            decor(g) {
              g.fillStyle = 'rgba(216,64,46,0.9)';
              [-1, 1].forEach((sg) => { g.beginPath(); g.moveTo(sg * 6, -218); g.lineTo(sg * 25, -226); g.lineTo(sg * 22, -218); g.lineTo(sg * 8, -212); g.fill(); g.beginPath(); g.moveTo(sg * 6, -204); g.lineTo(sg * 24, -204); g.lineTo(sg * 22, -198); g.lineTo(sg * 8, -200); g.fill(); });
              tk.inkPath(g, [[0, -236], [0, -222]], { w: 3, color: '#d8402e', taper: 0.3 });
            },
          });
          // hollow sunken sockets (the glow is live), a long thin moustache and a wisp of goatee
          S.cel(E(-11, -212, 9, 8.6, 12), '#160c22', { line: 2.4, shadow: false });
          S.cel(E(11, -212, 9, 8.6, 12), '#160c22', { line: 2.4, shadow: false });
          S.line([[-2, -196], [-14, -192], [-30, -182], [-36, -170]], { w: 2.8, color: '#3a3050', taper: 0.3 });
          S.line([[2, -196], [14, -192], [30, -182], [36, -170]], { w: 2.8, color: '#3a3050', taper: 0.3 });
          S.line([[-4, -182], [-2, -168], [0, -160]], { w: 3, color: '#3a3050', taper: 0.4 });
          S.line([[4, -182], [2, -168], [0, -160]], { w: 3, color: '#3a3050', taper: 0.4 });
        },
      },
      hat: {
        box: [-44, -296, 44, -220], pivot: [0, -232],
        draw(S) {
          S.cel([[-26, -232], [-28, -258], [-10, -276], [14, -282], [28, -262], [26, -236], [0, -228]], PM.hat, {
            depth: 12, line: 3.2, hi: true, hiW: 3, rim: '#8a80ff', halftone: { d: 5, alpha: 0.28, color: '#5a5aa8' },
            decor(g) { tk.inkPath(g, [[-24, -246], [0, -240], [26, -250]], { w: 3, color: PM.gold, alpha: 0.9, taper: 0.05, pressure: 'flat' }); tk.inkPath(g, [[-8, -276], [4, -256], [2, -232]], { w: 1.6, color: '#0d0a20', alpha: 0.7, taper: 0.2 }); },
          });
          tk.gloss(S.g, [[-14, -268], [4, -272], [16, -262]], { w: 4.5, alpha: 0.55, color: '#c8c4ff' });
          S.line([[-26, -236], [-34, -216], [-22, -196]], { w: 2.4, color: PM.verm, taper: 0.1 });
          S.line([[26, -238], [34, -216], [22, -196]], { w: 2.4, color: PM.verm, taper: 0.1 });
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die;
      const br = Math.sin(TAU * t / 3.0) * m;
      const slump = 22 * die;
      const dx = -sw * 22 + hurt * 14 + tele * 6, hot = clamp(tele + Math.max(0, sw) + buff, 0, 1);
      const reach = Math.max(0, sw);
      // arm and hand angles: + swings forward (toward the heroes). Hands wiggle, arms rise on the wind-up and whip on the strike
      const fw = (ph) => m * (0.12 + 0.2 * buff) * Math.sin(t * (4.2 + 4 * buff) + ph);
      const nA = 0.02 + 0.15 * Math.sin(TAU * t / 2.6) * m + 0.85 * tele - 0.55 * reach + 0.45 * Math.max(0, -sw) + 0.7 * guard + 0.35 * hurt;
      const fA = -0.02 + 0.12 * Math.sin(TAU * t / 2.6 + 1) * m - 0.7 * tele + 0.5 * reach - 0.55 * guard - 0.25 * hurt;
      const nH = fw(0.4) - 0.3 * reach + 0.3 * guard, fH = fw(2.1) - 0.3 * reach - 0.3 * guard;
      const tips = (hand, arm, wristX, wristY, shX, shY, mir, rotH) => PM_TIPS.map((tp) => {
        const a = rotAbout(0, 0, tp[0] * mir, tp[1], rotH), w = [a[0] + wristX, a[1] + wristY];
        return rotAbout(shX, shY, w[0], w[1], arm);
      });
      const wristN = [-100, -150], wristF = [102, -150];
      const tn = tips('N', nA, wristN[0], wristN[1], -40, -166, 1, nH), tf = tips('F', fA, wristF[0], wristF[1], 40, -166, -1, fH);
      ctx.save();
      put(ctx, st, 'stool');
      ctx.save();
      xform(ctx, 0, -100, dx, slump, 0.02 * br - 0.03 * sw + 0.06 * hurt, 1 + 0.01 * br, 1 - 0.01 * br - 0.16 * die);
      // dangling legs swing beneath the robe
      put(ctx, st, 'legF', { r: 0.1 * Math.sin(TAU * t / 2.2 + 1) * m + 0.2 * hurt + 0.1 * tele });
      put(ctx, st, 'legN', { r: -0.1 * Math.sin(TAU * t / 2.2) * m - 0.15 * hurt - 0.1 * tele + 0.2 * sw });
      put(ctx, st, 'armF', { r: fA, kids(c) { put(c, st, 'handF', { x: wristF[0], y: wristF[1], r: fH, sx: -1 }); } });
      put(ctx, st, 'robe', {
        r: 0.01 * br, sx: 0.93,
        kids(c) {
          put(c, st, 'head', {
            sx: 1.16 / 0.93, sy: 1.16, r: 0.04 * Math.sin(TAU * t / 3.1) * m - 0.1 * sw + 0.14 * hurt + 0.05 * tele + 0.5 * die, y: 2 * tele + 6 * die,
            kids(cc) {
              const open = blink(t, 'master', 4.4) * (1 - 0.5 * hurt);
              [-11, 11].forEach((ex, i) => eyeLive(cc, ex, -212, 6, 5.6 + 1.6 * hot, { open, iris: ['#ff2a5a', '#ffb0c0'], sclera: '#1a0c26', pupil: 'dot', pupilColor: '#160c22', glow: PM.string, glowK: 0.65 + 0.35 * hot, glowR: 3.4, lw: 2, look: [-0.3 * (i ? 1 : 0.6), 0.05], irisK: 0.9, rot: (i ? -1 : 1) * 0.14 * (1 + hot) * 0 }));
              // a thin grin that stretches with each string he pulls
              const mo = 0.1 + 0.9 * reach + 0.6 * tele + 0.5 * hurt + 0.3 * buff;
              cc.beginPath(); cc.moveTo(-14, -188); cc.quadraticCurveTo(0, -182 + 5 * mo, 14, -188); cc.quadraticCurveTo(0, -186 + 9 * mo, -14, -188); cc.fillStyle = '#3a0d1e'; cc.fill(); cc.lineWidth = 2.2; cc.strokeStyle = pal.ink; cc.stroke();
              if (mo > 0.2) { cc.fillStyle = '#ffffff'; for (let i = 0; i < 5; i++) { cc.beginPath(); cc.moveTo(-10 + i * 5, -187 + Math.abs(i - 2) * 0.5); cc.lineTo(-8 + i * 5, -184 - 1 * mo); cc.lineTo(-6 + i * 5, -187 + Math.abs(i - 2) * 0.5); cc.fill(); } }
              put(cc, st, 'hat', { r: 0.03 * Math.sin(TAU * t / 3.4 + 1) * m - 0.04 * tele - 0.5 * die, x: 0, y: 0 });
            },
          });
        },
      });
      put(ctx, st, 'armN', { r: nA, kids(c) { put(c, st, 'handN', { x: wristN[0], y: wristN[1], r: nH }); } });
      // ten glowing strings, one from every fingertip, rising out of sight and swaying like harp strings
      ctx.save();
      const taut = clamp(tele + 0.5 * buff, 0, 1);
      [tn, tf].forEach((set, hi) => set.forEach((tp, i) => {
        const k = hi * 5 + i, ph = k * 0.9, slack = 1 - 0.9 * die - 0.5 * hurt * 0;
        const topY = -300 * (1 - 0.6 * die), whipX = reach * (-170 - 20 * i) * (hi ? 0.8 : 1);
        const midX = tp[0] + (hi ? 1 : -1) * (6 + 5 * (i - 2)) + Math.sin(t * 2.4 + ph) * 8 * m * (1 - taut) + whipX * 0.5;
        const endX = tp[0] + (hi ? 1 : -1) * (24 + 12 * i) * (1 + taut * 0.3) + Math.sin(t * 1.7 + ph) * 12 * m * (1 - taut) + whipX;
        const midY = (tp[1] + topY) / 2 + Math.sin(t * 3 + ph) * 6 * m + 60 * die;
        const g = ctx.createLinearGradient(0, tp[1], 0, topY);
        g.addColorStop(0, 'rgba(255,90,122,0.95)'); g.addColorStop(0.6, 'rgba(255,90,122,0.5)'); g.addColorStop(1, 'rgba(255,90,122,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.7 + taut * 0.8; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(tp[0], tp[1]); ctx.quadraticCurveTo(midX, midY * slack + tp[1] * (1 - slack), endX, topY);
        ctx.stroke();
        // a bead of light running up each string
        const u = (((t * (0.7 + 0.6 * buff + 0.6 * taut) + k * 0.13) % 1) + 1) % 1;
        tk.glow(ctx, lerp(lerp(tp[0], midX, u), lerp(midX, endX, u), u), lerp(lerp(tp[1], midY, u), lerp(midY, topY, u), u), 6 + 3 * taut, PM.string, cA(0.8 * (1 - u) * (1 - die)));
      }));
      ctx.restore();
      tk.glow(ctx, -100 + dx * 0, -170, 50, PM.string, cA((0.14 + 0.3 * hot) * (1 - die)));
      ctx.restore();
      ctx.restore();
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // UMIBOZU (elite, l): a monk-shaped black giant rising out of calm water, taller than the bridge. It wants nothing but silence. A huge wet dome of a head, two
  // vast round glowing eyes, a patchwork kesa stole and heavy prayer beads, webbed hands that rest on the surface and then come down like the tide. It wades in
  // layered moving waves, and on the wind-up a ghostly temple bell hangs over its head. It dies by sinking. Accent: white-cyan eyes, beads and the bell's glow.
  // ---------------------------------------------------------------------------------------------------------------
  const UB = { skin: '#1a1a44', skinD: '#0c0c28', rim: '#6fe0ff', eye: '#f4ffff', glow: '#9fefff', kesaA: '#a8843a', kesaB: '#8a2a3a', kesaC: '#2a6a6a', bead: '#e8dcc0', bronze: '#c8923a', sea: '#1c3f86', seaL: '#3a78d0' };
  function waveBand(ctx, x0, x1, y, amp, t, seed, top, bot, depth, foam) {
    const n = 26, pts = [];
    for (let i = 0; i <= n; i++) { const x = lerp(x0, x1, i / n); pts.push([x, y + amp * (Math.sin(x * 0.045 + t * 1.3 + seed) + 0.45 * Math.sin(x * 0.11 - t * 1.9 + seed * 2))]); }
    const g = ctx.createLinearGradient(0, y - amp, 0, y + depth);
    g.addColorStop(0, top); g.addColorStop(1, bot);
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i <= n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.lineTo(x1, y + depth); ctx.lineTo(x0, y + depth); ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
    if (foam) {
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i <= n; i++) ctx.lineTo(pts[i][0], pts[i][1] - 0.5);
      ctx.lineWidth = 2.6; ctx.strokeStyle = 'rgba(232,248,255,0.85)'; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.fillStyle = 'rgba(240,250,255,0.8)';
      for (let i = 1; i < n; i += 3) { ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1] + 1, 2.2 + (i % 2), 0, TAU); ctx.fill(); }
    }
  }
  function umiArm(S, far) {
    const dir = far ? 1 : -1, sk = far ? '#0f0f30' : UB.skin, o = { depth: 9, line: 3.4, hi: !far, hiW: 3, rim: far ? null : UB.rim, halftone: { d: 5, alpha: 0.3, color: '#4a5aa8' } };
    S.cel(cap(dir * 72, -160, dir * 100, -100, 48, 42), sk, o);
    S.cel(cap(dir * 100, -100, dir * 108, -44, 40, 34), sk, o);
    // the huge webbed hand
    S.cel([[dir * 90, -50], [dir * 128, -50], [dir * 140, -26], [dir * 132, -8], [dir * 116, -14], [dir * 102, -6], [dir * 88, -14], [dir * 82, -32]], sk, { depth: 6, line: 3.2, hi: !far, rim: far ? null : UB.rim, halftone: { d: 5, alpha: 0.3, color: '#4a5aa8' } });
    [-1, 0, 1].forEach((k) => S.line([[dir * (108 + k * 12), -46], [dir * (110 + k * 14), -14]], { w: 1.8, color: far ? '#28285a' : '#4a5aa8', alpha: 0.9, taper: 0.2 }));
  }
  define('umibozu', {
    size: 'l', lw: 3.4, k: 1,
    col: { rim: UB.rim },
    bounds: { w: 250, h: 262, head: { x: 0, y: -256 }, body: { x: 0, y: -130 }, feet: { x: 0, y: 0 } },
    die: { box: [-130, -270, 130, 0], nx: 6, ny: 6, from: 'top', clip: false, kinds: ['bubble', 'bubble', 'ink'], cols: ['#d8f6ff', '#9fefff', '#1a1a44'], wind: [0, -22], size: 9 },
    parts: {
      armF: { box: [30, -196, 156, -0], pivot: [72, -160], draw(S) { umiArm(S, true); } },
      torso: {
        box: [-104, -200, 104, -30], pivot: [0, -100],
        draw(S) {
          S.cel([[-64, -34], [-84, -80], [-92, -130], [-78, -178], [-44, -204], [0, -210], [44, -204], [78, -178], [92, -130], [84, -80], [64, -34]], UB.skin, {
            depth: 22, line: 3.6, hi: true, hiW: 3.4, rim: UB.rim, rimW: 2.4, halftone: { d: 5, alpha: 0.3, color: '#4a5aa8' },
            decor(g) {
              for (let i = 0; i < 6; i++) tk.inkPath(g, [[-70 + i * 26, -196], [-76 + i * 28, -40]], { w: 1.4, color: '#0c0c28', alpha: 0.5, taper: 0.1, wobble: 0.1, seed: i });
              // the patchwork kesa stole slung across the chest
              g.save(); g.translate(0, 0);
              const cols = [UB.kesaA, UB.kesaB, UB.kesaC];
              for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) {
                const x = -76 + c * 18 + r * 12, y = -190 + r * 16 + c * 8;
                g.fillStyle = cols[(r + c) % 3]; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 17, y + 6); g.lineTo(x + 15, y + 22); g.lineTo(x - 2, y + 16); g.closePath(); g.fill();
                g.strokeStyle = 'rgba(245,201,106,0.85)'; g.lineWidth = 1.4; g.stroke();
              }
              g.restore();
            },
          });
          S.line([[-78, -186], [4, -152], [80, -96]], { w: 3, color: '#f5c96a', alpha: 0.9, taper: 0.05, pressure: 'flat', wobble: 0.04 });
        },
      },
      head: {
        box: [-66, -270, 66, -146], pivot: [0, -170],
        draw(S) {
          S.cel(E(0, -204, 56, 52, 24), UB.skin, { depth: 20, line: 3.6, hi: true, hiW: 3.4, rim: UB.rim, rimW: 2.6, halftone: { d: 5, alpha: 0.3, color: '#4a5aa8' } });
          // wet sheen on the great dome
          tk.gloss(S.g, [[-30, -238], [0, -252], [32, -242]], { w: 6, alpha: 0.5, color: '#9aaaff' });
          tk.gloss(S.g, [[-44, -220], [-46, -200]], { w: 3, alpha: 0.4, color: '#9aaaff' });
          // two heavy sleepy brow lids over the glowing eyes
          S.cel([[-46, -216], [-30, -226], [-10, -218], [-10, -208], [-30, -212], [-46, -206]], '#0c0c28', { depth: 2, line: 2.6, hi: false, rim: null, shadow: false });
          S.cel([[46, -216], [30, -226], [10, -218], [10, -208], [30, -212], [46, -206]], '#0c0c28', { depth: 2, line: 2.6, hi: false, rim: null, shadow: false });
        },
      },
      beads: {
        box: [-80, -190, 80, -100], pivot: [0, -166],
        draw(S) {
          // great prayer beads round the neck, with one tassel
          const n = 13;
          for (let i = 0; i < n; i++) {
            const a = PI * (0.08 + 0.84 * i / (n - 1)), y = -160 + Math.sin(a) * 30 - 6;
            S.cel(E(-Math.cos(a) * 60, y, 8.4, 8.4, 10), i % 4 === 2 ? '#ffb040' : UB.bead, { depth: 3, line: 2.4, hi: true, hiW: 1.6, rim: null });
          }
          S.line([[0, -132], [0, -112]], { w: 3, color: '#c8602a', taper: 0.1 });
          S.cel(E(0, -108, 5, 7), '#c8602a', { depth: 1.5, line: 2, hi: false, rim: null });
        },
      },
      bell: {
        box: [-52, -100, 52, 24], pivot: [0, -96],
        draw(S) {
          S.cel(cap(0, -96, 0, -84, 8, 8), '#8a5a1a', { depth: 1.5, line: 2.4, hi: false, rim: null });
          S.cel(E(0, -100, 8, 6), UB.bronze, { depth: 1.5, line: 2.4, hi: false, rim: null });
          S.cel([[-14, -84], [-26, -60], [-38, -22], [-46, 2], [-30, 8], [0, 10], [30, 8], [46, 2], [38, -22], [26, -60], [14, -84]], UB.bronze, {
            depth: 12, line: 3.2, hi: true, hiW: 2.8, rim: '#ffe6a0', halftone: { d: 5, alpha: 0.28, color: '#6a4a1a' },
            decor(g) { g.fillStyle = 'rgba(255,240,180,0.35)'; for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) g.fillRect(-26 + c * 14 + r * 2, -66 + r * 24, 9, 12); tk.inkPath(g, [[-40, -14], [0, -8], [40, -14]], { w: 3, color: '#8a5a1a', taper: 0.05, pressure: 'flat' }); tk.inkPath(g, [[-30, -46], [0, -42], [30, -46]], { w: 2, color: '#8a5a1a', taper: 0.05, pressure: 'flat' }); },
          });
          S.cel(E(0, 12, 6, 5, 8), '#8a5a1a', { depth: 1, line: 2, hi: false, rim: null });
        },
      },
      armN: { box: [-156, -196, -30, 0], pivot: [-72, -160], draw(S) { umiArm(S, false); } },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die;
      const br = Math.sin(TAU * t / 3.6) * m;
      const sink = 250 * ease.inQuad(die), dx = -sw * 18 + hurt * 12 + tele * 4;
      const rot = -0.05 * sw + 0.06 * hurt + 0.012 * br;
      const rise = -8 * tele - 3 * buff + 4 * br;
      const pool = (fn) => { ctx.save(); ctx.beginPath(); ctx.ellipse(0, -10, 128, 40, 0, 0, TAU); ctx.clip(); fn(); ctx.restore(); };
      ctx.save();
      // the sea behind him, a pool of layered waves
      pool(() => waveBand(ctx, -150, 150, -34 - 4 * tele, 5, t, 1, 'rgba(40,90,190,0.9)', 'rgba(14,30,80,0.95)', 60, false));
      ctx.save();
      if (die > 0) { ctx.beginPath(); ctx.rect(-320, -520, 640, 520 - 22); ctx.clip(); }
      xform(ctx, 0, -60, dx, sink + rise, rot, 1 + 0.01 * br, 1 - 0.01 * br);
      const sl = Math.max(0, sw), back = Math.max(0, -sw);
      // both arms rise on the wind-up and the tide comes down on the strike
      const A = E0.pose === 'attack' ? tk.track([[0, 0], [0.3, 2.6], [0.5, 0.6], [1, 0]], E0.p, 'inOutSine') : 0;
      const rN = -(0.05 * Math.sin(TAU * t / 3.0) * m) + 2.7 * tele + A + 0.45 * hurt - 2.3 * guard;
      const rF = 0.05 * Math.sin(TAU * t / 3.0 + 1) * m - 2.7 * tele - A - 0.45 * hurt + 2.3 * guard;
      put(ctx, st, 'armF', { r: rF });
      put(ctx, st, 'torso', {
        kids(c) {
          put(c, st, 'head', {
            r: 0.02 * Math.sin(TAU * t / 4.2) * m - 0.07 * sw + 0.1 * hurt, y: 5 * Math.max(0, sw) - 3 * tele,
            kids(cc) {
              const hot = clamp(tele + sl + buff, 0, 1), open = blink(t, 'umi', 6) * (1 - 0.5 * hurt) * (1 - 0.7 * guard);
              [-1, 1].forEach((sg) => eyeLive(cc, sg * 26, -202, 16, 19 * (0.72 + 0.28 * hot), { open: open * 0.92 + 0.02, iris: ['#cfeaff', '#ffffff'], sclera: UB.eye, pupil: 'dot', pupilColor: '#0c0c28', glow: UB.glow, glowK: 0.8 + 0.3 * hot, glowR: 2.6, lw: 3, look: [-0.4 - 0.3 * sl + Math.sin(t * 0.6) * 0.3, 0.1], irisK: 0.5, catch: true }));
              // a straight, patient mouth that opens to roar
              const mo = 0.05 + 1.0 * sl + 0.9 * tele + 0.5 * hurt + 0.3 * buff;
              if (mo < 0.3) tk.inkPath(cc, [[-22, -164], [0, -162], [22, -164]], { w: 4, color: '#04041a', taper: 0.25 });
              else { cc.beginPath(); cc.ellipse(0, -164, 18 + 10 * mo, 3 + 16 * mo, 0, 0, TAU); cc.fillStyle = '#03030f'; cc.fill(); cc.lineWidth = 3; cc.strokeStyle = pal.ink; cc.stroke(); tk.glow(cc, 0, -160, 26 + 14 * mo, UB.glow, 0.25 * mo); }
              if (hot > 0.1) tk.glow(cc, 0, -204, 90, UB.glow, 0.14 * hot);
            },
          });
          put(c, st, 'beads', { r: 0.03 * Math.sin(TAU * t / 2.6 + 1) * m + 0.05 * hurt });
        },
      });
      put(ctx, st, 'armN', { r: rN });
      ctx.restore();
      // the bell that tolls: it appears over his head on the wind-up
      if (tele > 0.02 || (E0.pose === 'attack' && E0.p < 0.6)) {
        const a = E0.pose === 'attack' ? 1 - E0.p / 0.6 : tele;
        ctx.save(); ctx.globalAlpha = cA(a * 0.95);
        const swing = Math.sin(t * 9) * 0.07 * tele + 0.15 * Math.sin(PI * E0.p) * (E0.pose === 'attack' ? 1 : 0);
        put(ctx, st, 'bell', { x: dx * 0.6, y: -226 * 0 - 186 + sink * 0 - 20 * (1 - a), r: swing, noFlash: true });
        tk.glow(ctx, dx * 0.6, -196, 66, '#ffe6a0', 0.4 * a);
        ctx.restore();
        if (tele > 0.3) for (let i = 0; i < 2; i++) { const u = (((t * 1.4 + i * 0.5) % 1) + 1) % 1; ctx.save(); ctx.globalAlpha = cA((1 - u) * 0.6 * tele); ctx.strokeStyle = '#ffe6a0'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.ellipse(dx * 0.6, -190, 40 + u * 80, 16 + u * 30, 0, 0, TAU); ctx.stroke(); ctx.restore(); }
      }
      // the sea in front: layered waves, foam, a wall of water on guard, a great splash on the strike
      pool(() => {
        waveBand(ctx, -150, 150, -22 - 12 * guard - 6 * tele, 6 + 3 * tele, t, 3, 'rgba(70,140,230,0.95)', 'rgba(20,50,120,0.98)', 50, true);
        waveBand(ctx, -170, 170, -6 - 6 * guard, 5, t * 1.2, 5, 'rgba(58,120,208,0.98)', 'rgba(16,40,100,1)', 30, true);
      });
      if (E0.pose === 'attack' && E0.p > 0.42) {
        const a = (E0.p - 0.42) / 0.58;
        ctx.save();
        for (let i = 0; i < 26; i++) {
          const v = hv('umi', 'sp' + i), ang = -3.0 + v * 1.9, sp = 100 + 190 * hv('umi', 'ss' + i), px = -60 + Math.cos(ang) * sp * a, py = -20 + Math.sin(ang) * sp * a + 200 * a * a;
          ctx.globalAlpha = cA((1 - a) * 1.3); ctx.fillStyle = i % 3 ? '#b8e0ff' : '#ffffff';
          ctx.beginPath(); ctx.ellipse(px, py, 3, 4.6, ang, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
      ripples(ctx, dx * 0.2, -3, t, 150, '#9fefff', 3);
      if (die > 0) { for (let i = 0; i < 3; i++) { const u = clamp(die * 1.3 - i * 0.2, 0, 1); ctx.save(); ctx.globalAlpha = cA((1 - u) * 0.7); ctx.strokeStyle = '#d8f6ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, -14, 40 + u * 150, (40 + u * 150) * 0.18, 0, 0, TAU); ctx.stroke(); ctx.restore(); } }
      ctx.restore();
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // MINIONS (size s): small, simpler, paler, one accent colour each, and clearly kin to the ones who summon them.
  //   spiderling    a coin-sized hatchling of the silk weaver and the boss: pale lilac fuzz, one big pair of pink eyes, an hourglass freckle.
  //   paper_puppet  a folded paper doll on crimson strings, the puppet master's chorus.
  //   lantern_wisp  a stray flame that slipped out of a lantern: a pale cyan ghost-fire with big eyes and a broken red tassel, kin to the drowned general.
  // ---------------------------------------------------------------------------------------------------------------
  const SL = { body: '#c0a4dc', bodyD: '#9a7cc0', bodyF: '#8a6cb0', legF: '#6a4a90', pink: '#ff5ad0', cream: '#f8f0ff' };
  function spiderlingLeg(S, far) {
    S.rib([[0, 0], [14, -22, 1], [36, 34]], far ? SL.legF : SL.bodyD, { wMax: 7, w0: 6.4, w1: 2.2, cap: 'round', gloss: false, line: far ? 2.3 : 2.6, rim: far ? null : '#ffb8f0', rimW: 1.1, shadow: true, profile: (u) => 1 - 0.62 * u });
    S.cel(E(14, -22, 3.6, 3.6, 8), far ? '#7a5aa0' : SL.body, { depth: 1, line: 1.8, hi: false, rim: null, shadow: false });
  }
  define('spiderling', {
    size: 's', lw: 2.6, k: 1.3,
    col: { rim: '#ffb8f0' },
    bounds: { w: 100, h: 92, head: { x: -8, y: -88 }, body: { x: 4, y: -44 }, feet: { x: 0, y: 0 } },
    die: { box: [-56, -84, 60, 2], nx: 8, ny: 7, from: 'out', order: 0.4, shape: 'ink', kinds: ['thread', 'petal', 'thread'], cols: ['#f8f0ff', '#ff5ad0', '#c0a4dc'], wind: [-6, -26], size: 4.6 },
    parts: {
      abdomen: {
        box: [-2, -74, 52, -20], pivot: [24, -44],
        draw(S) {
          S.cel(E(24, -44, 23, 21, 16, -0.2), SL.body, { depth: 8, line: 2.8, hi: true, hiW: 2.4, rim: '#ffb8f0', halftone: { d: 5, alpha: 0.26, color: '#7a5aa0' } });
          S.cel({ poly: [[18, -56], [32, -55], [26, -44], [33, -32], [17, -33], [24, -44]] }, SL.pink, { depth: 1.5, line: 1.6, tension: 0.3, hi: false, rim: null, shadow: '#b02890' });
          S.line([[8, -52], [12, -58]], { w: 1.2, color: SL.cream, alpha: 0.9, taper: 0.4 });
          S.line([[36, -38], [40, -46]], { w: 1.2, color: SL.cream, alpha: 0.9, taper: 0.4 });
        },
      },
      head: {
        box: [-44, -76, 26, -20], pivot: [-6, -44],
        draw(S) {
          S.cel(E(-8, -46, 25, 22, 16), SL.bodyD, { depth: 8, line: 3, hi: true, hiW: 2.4, rim: '#ffb8f0', halftone: { d: 5, alpha: 0.26, color: '#6a4a90' } });
          S.cel(E(-11, -47, 21, 18.6, 16), SL.body, { depth: 6, line: 0, hi: false, rim: null, shadow: false });
          S.ell(-26, -38, 3.6, 2.4, '#ff9ac8', { line: 0, shadow: false, rim: null });
          S.ell(8, -38, 3.6, 2.4, '#ff9ac8', { line: 0, shadow: false, rim: null });
        },
      },
      legN: { box: [-4, -30, 44, 42], pivot: [0, 0], draw(S) { spiderlingLeg(S, false); } },
      legF: { box: [-4, -30, 44, 42], pivot: [0, 0], draw(S) { spiderlingLeg(S, true); } },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die, hot = clamp(tele + Math.max(0, sw), 0, 1);
      const hop = Math.abs(Math.sin(TAU * t / 0.95)) * 5 * m + 16 * Math.max(0, Math.sin(PI * clamp((E0.p - 0.15) / 0.5, 0, 1))) * (E0.pose === 'attack' ? 1 : 0) + 6 * tele + 8 * buff * Math.sin(PI * E0.buffP);
      const dx = -sw * 34 + hurt * 14 + Math.sin(t * 50) * 1.2 * tele;
      const rot = -0.2 * sw + 0.2 * hurt + 0.15 * tele * -1 + 0.03 * Math.sin(TAU * t / 1.9) * m;
      const tap = (i) => m * 0.18 * Math.sin(TAU * t / 0.95 + i * 1.3);
      const LEGS = [[-14, -36, -1, 0.9, 0.05, true], [-4, -34, -1, 0.8, 0.3, true], [12, -34, 1, 0.8, 0.05, true], [22, -36, 1, 0.7, 0.35, true], [-18, -34, -1, 1, 0.0, false], [-8, -32, -1, 0.9, 0.28, false], [10, -32, 1, 0.9, 0.0, false], [20, -34, 1, 0.8, 0.3, false]];
      const legR = (L, i) => (L[4] + tap(i) - (L[2] < 0 ? (0.7 * Math.max(0, sw) + 0.55 * tele) : 0) + 0.3 * hurt + 0.6 * guard * (L[2] < 0 ? -1 : 1) + die * 1.2) * L[2] * -1 * -1;
      ctx.save();
      // buff (skitter): a couple of fading after-images of dodge
      if (buff > 0.1) { for (let k = 1; k <= 2; k++) { ctx.save(); ctx.globalAlpha = cA(0.22 * buff / k); ctx.translate(-10 * k * buff, 0); tk.glow(ctx, 10, -44, 46, SL.pink, 0.5); ctx.restore(); } }
      xform(ctx, 0, -20, dx, -hop, rot, 1 + 0.04 * hurt - 0.06 * guard, 1 - 0.06 * hurt + 0.05 * tele - 0.12 * guard - 0.3 * die);
      LEGS.filter((L) => L[5]).forEach((L, i) => put(ctx, st, 'legF', { x: L[0], y: L[1], r: legR(L, i), sx: L[2] * L[3], sy: L[3] }));
      put(ctx, st, 'abdomen', { sx: 1 + 0.03 * Math.sin(TAU * t / 1.4) * m, sy: 1 + 0.03 * Math.sin(TAU * t / 1.4) * m, r: 0.03 * Math.sin(TAU * t / 1.9) * m });
      tk.glow(ctx, 24, -44, 24, SL.pink, cA((0.16 + 0.1 * Math.sin(t * 2.4) + 0.3 * hot) * (1 - die)));
      put(ctx, st, 'head', {
        r: -0.04 * sw * 0 + 0.04 * Math.sin(TAU * t / 1.9 + 1) * m,
        kids(c) {
          const open = blink(t, 'sling', 3.4) * (1 - 0.6 * hurt);
          const o = { iris: ['#c8127a', '#ff9ae8'], sclera: '#fff2fa', pupil: 'round', glow: SL.pink, glowK: 0.55 + 0.3 * hot, glowR: 2.4, lw: 2.2, look: [-0.5 - 0.3 * sw, 0.05] };
          eyeLive(c, -20, -50, 7.6, 9.4, Object.assign({ open }, o));
          eyeLive(c, -2, -51, 6.8, 8.6, Object.assign({ open }, o));
          eyeLive(c, -11, -66, 2.6, 3, Object.assign({ open, lw: 1.5, catch: false, glowK: 0.3 }, o));
          // tiny fangs that bare on the bite
          const fo = 0.1 + 0.9 * Math.max(0, sw) + 0.5 * tele + 0.4 * hurt;
          c.fillStyle = '#ffffff'; c.strokeStyle = pal.ink; c.lineWidth = 1.4;
          [-21, -12].forEach((fx) => { c.beginPath(); c.moveTo(fx, -35); c.lineTo(fx + 1.6, -35 + 4 + 5 * fo); c.lineTo(fx + 3.6, -35); c.closePath(); c.fill(); c.stroke(); });
        },
      });
      LEGS.filter((L) => !L[5]).forEach((L, i) => put(ctx, st, 'legN', { x: L[0], y: L[1], r: legR(L, i + 4), sx: L[2] * L[3], sy: L[3] }));
      ctx.restore();
    },
  });

  // ------------------------------------------------------------------- paper puppet
  const PP = { paper: '#f3e6c8', paperD: '#d8c48e', verm: '#d8402e', thread: '#ff5a7a' };
  define('paper_puppet', {
    size: 's', lw: 2.6, k: 1.2,
    col: { rim: '#ffc0d0' },
    bounds: { w: 80, h: 153, head: { x: 0, y: -108 }, body: { x: 0, y: -58 }, feet: { x: 0, y: 0 } },
    die: { box: [-42, -122, 42, 2], nx: 6, ny: 9, from: 'top', order: 0.5, shape: 'paper', kinds: ['scrap', 'thread', 'scrap'], cols: ['#f3e6c8', '#d8402e', '#ffd0d8'], wind: [-8, 8], size: 6 },
    parts: {
      body: {
        box: [-24, -84, 24, -30], pivot: [0, -76],
        draw(S) {
          S.cel({ poly: [[-14, -78], [14, -78], [21, -34], [-21, -34]] }, PP.verm, {
            depth: 6, line: 2.8, tension: 0.25, hi: false, rim: '#ff9a8a',
            decor(g) { g.fillStyle = 'rgba(255,240,224,0.9)'; for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(-14 + i * 9 + (j % 2) * 4.5, -70 + j * 11, 1.8, 0, TAU); g.fill(); } tk.inkPath(g, [[-22, -52], [22, -52]], { w: 4, color: '#f5c96a', taper: 0.05, pressure: 'flat', wobble: 0.04 }); },
          });
          S.cel({ poly: [[-9, -82], [0, -60], [9, -82], [5, -82], [0, -70], [-5, -82]] }, PP.paper, { depth: 1.5, line: 1.8, tension: 0.2, hi: false, rim: null, shadow: false });
          S.line([[-12, -44], [12, -44]], { w: 1.3, color: '#8a2a1a', alpha: 0.6, taper: 0.2 });
          S.line([[-15, -36], [15, -36]], { w: 1.3, color: '#8a2a1a', alpha: 0.6, taper: 0.2 });
        },
      },
      head: {
        box: [-24, -122, 24, -80], pivot: [0, -88],
        draw(S) {
          S.cel(E(0, -104, 19, 19, 16), PP.paper, { depth: 6, line: 2.8, hi: false, rim: '#ffffff' });
          S.cel([[-19, -108], [-15, -122], [0, -126], [15, -122], [19, -108], [11, -114], [0, -112], [-11, -114]], '#241c42', { depth: 4, line: 2.6, hi: false, rim: '#8a80ff' });
          S.line([[-6, -122], [0, -113], [6, -122]], { w: 1.4, color: '#5a5aa8', alpha: 0.7, taper: 0.3 });
          S.ell(-12, -96, 3.6, 2.4, '#ff9aa8', { line: 0, shadow: false, rim: null });
          S.ell(12, -96, 3.6, 2.4, '#ff9aa8', { line: 0, shadow: false, rim: null });
          S.line([[-9, -110], [-4, -111]], { w: 1.3, alpha: 0.7, taper: 0.4 });
          S.line([[4, -111], [9, -110]], { w: 1.3, alpha: 0.7, taper: 0.4 });
        },
      },
      armN: {
        box: [-44, -84, -6, -32], pivot: [-13, -74],
        draw(S) {
          S.cel({ poly: [[-10, -78], [-18, -66], [-30, -50], [-38, -52], [-26, -74], [-16, -82]] }, PP.paper, { depth: 3, line: 2.4, tension: 0.2, hi: false, rim: '#ffffff' });
          S.line([[-18, -66], [-27, -58]], { w: 1.3, color: '#a88a5a', alpha: 0.7, taper: 0.3 });
          S.cel(E(-34, -50, 5, 5.4), PP.paperD, { depth: 1.5, line: 2, hi: false, rim: null });
        },
      },
      armF: {
        box: [6, -84, 44, -32], pivot: [13, -74],
        draw(S) {
          S.cel({ poly: [[10, -78], [18, -66], [30, -50], [38, -52], [26, -74], [16, -82]] }, PP.paperD, { depth: 3, line: 2.4, tension: 0.2, hi: false, rim: null });
          S.cel(E(34, -50, 5, 5.4), '#c8b078', { depth: 1.5, line: 2, hi: false, rim: null });
        },
      },
      legN: {
        box: [-24, -40, 6, 6], pivot: [-7, -38],
        draw(S) {
          S.cel({ poly: [[-12, -38], [-3, -38], [-4, -12], [-14, -12]] }, PP.paper, { depth: 3, line: 2.4, tension: 0.2, hi: false, rim: '#ffffff' });
          S.cel({ poly: [[-19, -12], [-2, -12], [0, -3], [-21, -3]] }, '#5a3418', { depth: 2, line: 2.2, tension: 0.2, hi: false, rim: null });
          S.line([[-13, -26], [-4, -26]], { w: 1.2, color: '#a88a5a', alpha: 0.7, taper: 0.3 });
        },
      },
      legF: {
        box: [-6, -40, 24, 6], pivot: [7, -38],
        draw(S) {
          S.cel({ poly: [[3, -38], [12, -38], [14, -12], [4, -12]] }, PP.paperD, { depth: 3, line: 2.4, tension: 0.2, hi: false, rim: null });
          S.cel({ poly: [[2, -12], [19, -12], [21, -3], [0, -3]] }, '#4a2a14', { depth: 2, line: 2.2, tension: 0.2, hi: false, rim: null });
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die;
      const swing = Math.sin(TAU * t / 2.1) * 0.06 * m, jerk = (Math.floor(t * 5) % 2 ? 1 : -1) * 0.02 * m;
      const hover = 8 + Math.sin(TAU * t / 1.7) * 3 * m - 5 * tele + 10 * die;
      const dx = -sw * 22 + hurt * 12;
      const rot = swing + jerk - 0.16 * sw + 0.2 * hurt;
      const fl = (ph) => m * 0.32 * Math.sin(TAU * t / 1.3 + ph);
      // arms flail on the strike and clap together
      const clap = E0.pose === 'attack' ? Math.max(0, sw) : 0;
      const aN = 0.1 + fl(0) - 1.2 * Math.max(0, -sw) * -1 * 0 + 1.3 * clap + 0.6 * hurt + 1.4 * guard - 0.5 * tele * -1;
      const aF = -0.1 + fl(2) - 1.3 * clap - 0.6 * hurt - 1.4 * guard;
      const strings = [[0, -128, 0], [-34, -50, -1], [34, -50, 1], [-9, -30, -0.4], [9, -30, 0.4]];
      ctx.save();
      xform(ctx, 0, -76, dx, -hover, rot, 1, 1 - 0.3 * die);
      put(ctx, st, 'armF', { r: aF });
      put(ctx, st, 'legF', { r: -fl(1) * 0.8 + 0.3 * hurt + 0.2 * clap });
      put(ctx, st, 'body', {
        kids(c) { put(c, st, 'head', { r: 0.05 * Math.sin(TAU * t / 1.7 + 1) * m - 0.12 * sw + 0.2 * hurt + 0.4 * die, kids(cc) {
          // painted dot eyes glow vermilion; the mouth is one stroke
          const open = blink(t, 'ppuppet', 3.2) * (1 - 0.6 * hurt);
          const hot = clamp(tele + clap + buff, 0, 1);
          [-7.5, 7.5].forEach((ex) => eyeLive(cc, ex, -103, 4.4, 5.4 * (0.5 + 0.5 * open), { open: 1, iris: ['#d8402e', '#ff8a7a'], sclera: '#fff6e8', pupil: 'dot', pupilColor: '#3a0d1e', glow: PP.thread, glowK: 0.4 + 0.4 * hot, glowR: 2.6, lw: 1.8, look: [-0.5, 0], irisK: 0.9, catch: false }));
          cc.beginPath(); cc.ellipse(0, -93, 3 + 3 * clap + 3 * hurt, 1.2 + 4 * clap + 3 * hurt, 0, 0, TAU); cc.fillStyle = '#5a1a2a'; cc.fill(); cc.lineWidth = 1.6; cc.strokeStyle = pal.ink; cc.stroke();
        } }); },
      });
      put(ctx, st, 'legN', { r: fl(3) * 0.8 - 0.3 * hurt - 0.2 * clap });
      put(ctx, st, 'armN', { r: aN });
      // crimson strings from the head, the hands and the knees up out of sight
      const slack = 1 - 0.85 * die;
      strings.forEach((sp, i) => {
        const top = -230 + 60 * die, ax = sp[2] * 12 + Math.sin(t * 1.8 + i) * 3 * m;
        const g = ctx.createLinearGradient(0, sp[1], 0, top);
        g.addColorStop(0, 'rgba(255,90,122,0.95)'); g.addColorStop(0.7, 'rgba(255,90,122,0.4)'); g.addColorStop(1, 'rgba(255,90,122,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.6 + tele * 0.8; ctx.lineCap = 'round';
        const ex = sp[0] + (i === 0 ? 0 : sp[2] * 14) - 14 * sp[2] * 0;
        ctx.beginPath(); ctx.moveTo(ex, sp[1]); ctx.quadraticCurveTo(ex + ax * 0.5, (sp[1] + top) / 2 * slack + sp[1] * (1 - slack), ax, top); ctx.stroke();
      });
      ctx.restore();
    },
  });

  // ------------------------------------------------------------------- lantern wisp
  define('lantern_wisp', {
    size: 's', lw: 2.6, k: 1.15,
    col: { rim: '#cfeaff' },
    bounds: { w: 70, h: 127, head: { x: 0, y: -100 }, body: { x: 0, y: -50 }, feet: { x: 0, y: 0 } },
    die: { box: [-40, -100, 40, 0], nx: 6, ny: 7, from: 'top', clip: false, kinds: ['ember', 'ember', 'petal'], cols: ['#a8f0ff', '#ffffff', '#7fe8ff'], wind: [0, -34], size: 5 },
    parts: {},
    chains: {
      tassel: {
        spine: [[0, -22], [3, -12], [-2, -2], [3, 8]], cuts: [0.45], reach: 10,
        draw(S) {
          S.rib([[0, -22], [3, -12], [-2, -2], [3, 8]], '#d8402e', { wMax: 5.6, w0: 5, w1: 1.6, line: 2, gloss: false, strands: 0, rim: '#ff8a7a' });
          S.cel(E(3, 9, 3.4, 3.8, 8), '#f5c96a', { depth: 1, line: 1.6, hi: false, rim: null, shadow: false });
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die, hot = clamp(tele + Math.max(0, sw), 0, 1);
      const bob = Math.sin(TAU * t / 1.8) * 6 * m + Math.sin(TAU * t / 0.7) * 2 * m;
      const lift = 34 + bob - 6 * tele + 8 * buff;
      const dx = -sw * 40 + hurt * 16;
      const size = (1 + 0.5 * Math.max(0, sw) + 0.35 * tele + 0.3 * buff * Math.sin(PI * E0.buffP) - 0.35 * hurt - 0.45 * die) * (1 - 0.1 * guard);
      ctx.save();
      ctx.translate(dx, -lift);
      putChain(ctx, st, 'tassel', [0, 1].map((j) => m * 0.28 * Math.sin(TAU * (t / 1.3) - j) + 0.3 * hurt + 0.15 * sw));
      // the flame itself: live, with big eyes and two stub arms of fire
      ctx.save(); ctx.translate(0, -22); ctx.scale(size, size); ctx.translate(0, 22);
      flameLive(ctx, 0, -26, 20 + 3 * buff, 62 + 20 * tele, t, 7, { c0: '#3ab4ff', c1: '#9ae8ff', c2: '#f4ffff', glow: '#7fe8ff', glowK: 0.28 + 0.2 * hot, lean: -6 * sw + 5 * hurt, line: 'rgba(14,30,90,0.85)' });
      const open = blink(t, 'wisp', 3.0) * (1 - 0.55 * hurt);
      const eo = { iris: ['#1a6ad8', '#8ae8ff'], sclera: '#ffffff', pupil: 'round', glow: '#7fe8ff', glowK: 0.5 + 0.3 * hot, glowR: 2.4, lw: 2.2, look: [-0.5 - 0.4 * sw, 0.05] };
      eyeLive(ctx, -8, -36, 6.2, 8, Object.assign({ open }, eo));
      eyeLive(ctx, 8, -36, 5.6, 7.4, Object.assign({ open }, eo));
      const mo = 0.05 + 0.8 * Math.max(0, sw) + 0.4 * tele + 0.5 * hurt;
      ctx.beginPath(); ctx.ellipse(0, -21, 3 + 3 * mo, 1.2 + 4 * mo, 0, 0, TAU); ctx.fillStyle = '#0e2a6a'; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = pal.ink; ctx.stroke();
      ctx.restore();
      // a warm ring when it shares its glow (block for an ally), sparkles when it flares
      if (guard > 0.05 || buff > 0.05) {
        const a = Math.max(guard, buff);
        ctx.save(); ctx.globalAlpha = cA(a * 0.8); ctx.strokeStyle = '#ffd890'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(0, -40, 34 + 10 * a, 0, TAU); ctx.stroke(); ctx.restore();
        tk.glow(ctx, 0, -40, 60, '#ffd890', 0.3 * a);
      }
      ctx.restore();
      motes(ctx, dx, -lift - 44, t, 4, 17, { col: '#a8f0ff', rise: 30, spread: 12, life: 1.3, size: 1.8, alpha: 0.9 * (1 - die) });
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // JOROGUMO, THE SILK COURTESAN (boss, xl): the mistress of the Sunken Lantern City, who receives every guest in her finest kimono.
  //   phase 0  THE COURTESAN: a towering bell of layered kimono (crimson uchikake embroidered with a golden web, violet, white and gold under-robes spilling at the hem),
  //            an obi bow that is secretly an abdomen, a chalk-white face with lantern eyes, a halo of gold kanzashi pins, an iron fan, silk threads and lanterns
  //            swaying on them. Only four black spider feet peek out from under the hem.
  //   phase 1  THE SPIDER: the kimono tears open. Her torso rises from a spider's thorax, a vast abdomen glows with the sigil of the web, eight enormous legs
  //            skitter, her hair is loose and wild, eight eyes burn, shreds of silk hang from her, and a great web shimmers behind.
  // Every part animates on its own (hem tiers, fan, sleeves, hair, pins, lanterns, legs one by one, abdomen, thorax, silk). Phase 1 blazes brighter below 20 percent.
  // Accent: lantern amber eyes, silk white, crimson.
  // ---------------------------------------------------------------------------------------------------------------
  const JG = { crim: '#b01c40', crimD: '#6a0f2c', viol: '#5a3a9a', gold: '#f0c860', silk: '#f4ecff', skin: '#f8eee8', skinD: '#c8b0b8', hair: '#221438', amber: '#ffb040', plum: '#7a58b0', plumD: '#3a2260', plumF: '#523a86', lilac: '#f0e4ff', black: '#181026' };
  const JG_SPINE = [[0, 0], [74, -146, 1], [236, 118]];
  const jgAt = (u) => (u < 0.34 ? [74 * (u / 0.34), -146 * (u / 0.34)] : [74 + 162 * ((u - 0.34) / 0.66), -146 + 264 * ((u - 0.34) / 0.66)]);
  function jgLeg(S, far) {
    const base = far ? JG.plumF : JG.plum;
    S.rib(JG_SPINE, base, { wMax: 24, w0: 22, w1: 5, cap: 'round', gloss: false, line: far ? 3 : 3.4, rim: far ? null : '#ffb8f0', rimW: 1.6, shadow: true, halftone: { d: 5, alpha: 0.3 }, profile: (u) => 1 - 0.74 * Math.pow(u, 0.9) });
    S.cel(E(74, -146, 12, 12, 10), far ? '#5a4488' : '#8a68c0', { depth: 3, line: 2.8, hi: false, rim: null });
    S.cel(E(74, -146, 5, 5, 8), JG.crim, { line: 1.6, shadow: false });
    [0.16, 0.5, 0.78].forEach((u) => { const p = jgAt(u); S.line([[p[0] - 6, p[1] - 5], [p[0] + 6, p[1] + 5]], { w: 3, color: far ? '#a894c8' : JG.lilac, alpha: 0.95, taper: 0.2 }); });
    for (let i = 0; i < 9; i++) { const p = jgAt(0.08 + i * 0.1); S.line([[p[0] + 3, p[1] - 6], [p[0] + 8, p[1] - 14]], { w: 1.2, color: far ? '#7a6aa0' : '#c8a8e8', alpha: 0.8, taper: 0.4 }); }
    S.line([[236, 118], [242, 130]], { w: 3.4, color: JG.gold, taper: 0.2 });
  }
  const JG_LEG_ROOT = [
    // [x, y, dir, spread, far, phase offset]
    [-40, -124, -1, 0.74, true, 0.2], [-22, -118, -1, 0.48, true, 1.4], [34, -120, 1, 0.7, true, 2.2], [60, -122, 1, 0.44, true, 3.1],
    [-50, -120, -1, 0.86, false, 0.0], [-34, -112, -1, 0.6, false, 0.9], [24, -116, 1, 0.8, false, 1.8], [50, -118, 1, 0.55, false, 2.7],
  ];
  function jgLantern(S) {
    S.line([[0, 0], [0, 10]], { w: 2.2, color: '#6a4a2a', taper: 0.05, pressure: 'flat', wobble: 0 });
    S.cel({ poly: [[-10, 10], [10, 10], [12, 16], [-12, 16]] }, JG.black, { depth: 1.5, line: 2.2, tension: 0.2, hi: false, rim: null });
    S.cel([[-10, 15], [-15, 26], [-14, 40], [-9, 48], [9, 48], [14, 40], [15, 26], [10, 15]], '#ffe6b8', {
      depth: 4, line: 2.6, hi: false, rim: '#ffd890',
      decor(g) { const rg = g.createRadialGradient(0, 32, 1, 0, 32, 22); rg.addColorStop(0, 'rgba(255,220,120,1)'); rg.addColorStop(1, 'rgba(255,150,50,0.35)'); g.fillStyle = rg; g.fillRect(-18, 10, 36, 40); for (let i = 1; i < 4; i++) tk.inkPath(g, [[-15, 14 + i * 8], [0, 17 + i * 8], [15, 14 + i * 8]], { w: 1.1, color: '#a85a1a', alpha: 0.6, taper: 0.1 }); g.fillStyle = JG.crim; g.fillRect(-16, 14, 32, 4); },
    });
    S.cel({ poly: [[-10, 47], [10, 47], [11, 52], [-11, 52]] }, JG.black, { depth: 1.5, line: 2.2, tension: 0.2, hi: false, rim: null });
    S.line([[0, 52], [0, 60]], { w: 2, color: JG.crim, taper: 0.1 });
  }
  define('boss_jorogumo', {
    size: 'xl', lw: 3.6, k: 1.1,
    col: { rim: '#ffb8d8' },
    bounds: { w: 560, h: 398, head: { x: -6, y: -372 }, body: { x: 0, y: -170 }, feet: { x: 0, y: 0 }, right: 328 },
    die: { box: [-250, -350, 250, 6], nx: 16, ny: 16, from: 'out', order: 0.5, shape: 'ink', kinds: ['petal', 'thread', 'scrap', 'thread', 'ember'], cols: ['#ff7eb6', '#f4ecff', '#b01c40', '#e8dcff', '#f0c860'], wind: [-6, -30], size: 9 },
    parts: {
      // ------------------------------------------------ phase 0: the Courtesan
      tip: {
        box: [-6, -34, 74, 10], pivot: [0, 0],
        draw(S) {
          S.rib([[0, -22], [36, -32, 1], [70, 4]], JG.plumD, { wMax: 14, w0: 13, w1: 3, cap: 'round', gloss: false, line: 3, rim: '#ffb8f0', shadow: true, profile: (u) => 1 - 0.7 * u });
          S.cel(E(36, -32, 6.4, 6.4, 8), '#8a68c0', { depth: 2, line: 2.2, hi: false, rim: null });
          S.line([[70, 4], [76, 10]], { w: 3, color: JG.gold, taper: 0.2 });
        },
      },
      tierV: { box: [-150, -46, 150, 14], pivot: [0, -6], draw(S) { jgTier(S, 140, '#6a48b0', 0); } },
      tierW: { box: [-140, -40, 140, 12], pivot: [0, -6], draw(S) { jgTier(S, 128, '#f6f0fa', 2); } },
      tierG: { box: [-130, -34, 130, 10], pivot: [0, -6], draw(S) { jgTier(S, 116, JG.gold, 5); } },
      kimono: {
        box: [-140, -214, 140, 4], pivot: [0, -6],
        draw(S) {
          S.cel([[-46, -198], [-58, -170], [-78, -120], [-108, -52], [-126, -18], [-98, -8], [0, -4], [98, -8], [126, -18], [108, -52], [78, -120], [58, -170], [46, -198], [0, -206]], JG.crim, {
            depth: 26, line: 3.8, hi: true, hiW: 3.4, rim: '#ff9ac8', rimW: 2.2, halftone: { d: 5, alpha: 0.3, color: '#4a0a20' },
            decor(g) {
              // a golden spider web embroidered across the skirt, and a deepening violet hem
              g.strokeStyle = 'rgba(240,200,96,0.9)'; g.lineWidth = 1.7;
              const cx = 26, cy = -92;
              for (let i = 0; i < 11; i++) { const a = i / 11 * TAU + 0.2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 92, cy + Math.sin(a) * 92); g.stroke(); }
              for (let r = 18; r <= 90; r += 18) { g.beginPath(); for (let i = 0; i <= 11; i++) { const a = i / 11 * TAU + 0.2, a2 = (i + 0.5) / 11 * TAU + 0.2, rr = r; if (i === 0) g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); else g.quadraticCurveTo(cx + Math.cos(a - PI / 11) * rr * 0.9, cy + Math.sin(a - PI / 11) * rr * 0.9, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.stroke(); }
              g.fillStyle = 'rgba(244,236,255,0.9)'; for (let i = 0; i < 16; i++) { g.beginPath(); g.arc(-90 + (i * 37) % 180, -60 + (i * 53) % 50, 2, 0, TAU); g.fill(); }
              const gg = g.createLinearGradient(0, -80, 0, 0); gg.addColorStop(0, 'rgba(40,16,80,0)'); gg.addColorStop(1, 'rgba(40,16,80,0.62)'); g.fillStyle = gg; g.fillRect(-140, -80, 280, 84);
              for (let i = 0; i < 6; i++) tk.inkPath(g, [[-40 + i * 16, -196], [-66 + i * 26, -8]], { w: 1.6, color: '#5a0a24', alpha: 0.55, taper: 0.1, wobble: 0.08, seed: i });
            },
          });
        },
      },
      obiBow: {
        box: [20, -246, 176, -66], pivot: [46, -166],
        draw(S) {
          // the great obi bow at her back: two gold loops, a crimson band, trailing tails, and a red hourglass on the knot (an abdomen in disguise)
          S.cel([[48, -166], [40, -204], [62, -238], [104, -244], [138, -224], [148, -190], [120, -168], [80, -160]], JG.gold, { depth: 12, line: 3.4, hi: true, hiW: 3, rim: '#fff0b0', halftone: { d: 5, alpha: 0.28, color: '#8a6a24' }, decor(g) { for (let i = 0; i < 6; i++) tk.inkPath(g, [[56 + i * 16, -246], [50 + i * 20, -162]], { w: 1.5, color: '#8a6a24', alpha: 0.6, taper: 0.1 }); tk.inkPath(g, [[60, -170], [100, -204], [140, -200]], { w: 8, color: JG.crim, alpha: 0.85, taper: 0.1, pressure: 'flat' }); } });
          S.cel([[48, -160], [82, -156], [124, -140], [152, -112], [140, -86], [102, -92], [66, -118], [46, -142]], JG.gold, { depth: 10, line: 3.4, hi: false, rim: '#fff0b0', halftone: { d: 5, alpha: 0.28, color: '#8a6a24' }, decor(g) { tk.inkPath(g, [[64, -140], [106, -122], [140, -102]], { w: 8, color: JG.crim, alpha: 0.85, taper: 0.1, pressure: 'flat' }); } });
          S.rib([[50, -150], [66, -110], [58, -78], [70, -60]], JG.crim, { wMax: 16, w0: 14, w1: 4, line: 3, gloss: false, strands: 0, rim: '#ff9ac8', shadow: true });
          S.cel(E(52, -160, 15, 17, 12), JG.gold, { depth: 4, line: 3, hi: true, rim: '#fff0b0' });
          S.cel({ poly: [[43, -172], [61, -171], [55, -161], [62, -149], [43, -150], [50, -161]] }, JG.crim, { depth: 1.5, line: 1.8, tension: 0.3, hi: false, rim: null, shadow: '#7a0a28' });
        },
      },
      torsoA: {
        box: [-76, -214, 76, -116], pivot: [0, -160],
        draw(S) {
          // stacked collars of the twelve layers, and the obi band
          [['#f6f0fa', 34], ['#b01c40', 30], ['#6a48b0', 26], [JG.gold, 22], ['#f6f0fa', 18]].forEach((c, i) => S.cel({ poly: [[-c[1], -206 + i * 5], [0, -166 + i * 4], [c[1], -206 + i * 5], [c[1] - 6, -208 + i * 5], [0, -176 + i * 4], [-c[1] + 6, -208 + i * 5]] }, c[0], { depth: 2, line: 2.2, tension: 0.2, hi: false, rim: null }));
          S.cel({ poly: [[-58, -160], [58, -160], [64, -134], [-64, -134]] }, JG.black, { depth: 4, line: 3, tension: 0.2, rim: '#8a80ff', decor(g) { for (let i = 0; i < 9; i++) tk.inkPath(g, [[-58 + i * 15, -160], [-62 + i * 16, -134]], { w: 1.6, color: JG.gold, alpha: 0.85, taper: 0.1 }); tk.inkPath(g, [[-60, -147], [62, -147]], { w: 2.4, color: JG.gold, taper: 0.05, pressure: 'flat' }); } });
          S.cel(E(0, -147, 9, 12), JG.crim, { depth: 2, line: 2.4, hi: false, rim: null });
        },
      },
      headA: {
        box: [-64, -352, 68, -226], pivot: [0, -236],
        draw(S) {
          // a halo of gold pins fanning out behind the head
          for (let i = 0; i < 9; i++) {
            const a = -PI * 0.5 + (i - 4) * 0.27, l = 52 + (i % 2) * 8, x0 = 8 + Math.cos(a) * 20, y0 = -292 + Math.sin(a) * 18, x1 = 8 + Math.cos(a) * (20 + l), y1 = -292 + Math.sin(a) * (18 + l);
            S.line([[x0, y0], [x1, y1]], { w: 3, color: JG.gold, taper: 0.05, pressure: 'flat', wobble: 0 });
            S.cel(E(x1, y1, 5.4, 5.4, 8), i % 3 === 0 ? JG.crim : i % 3 === 1 ? JG.silk : JG.amber, { depth: 1.6, line: 2, hi: true, rim: null });
          }
          S.cel([[-40, -282], [-38, -306], [-14, -322], [16, -324], [40, -308], [44, -282], [34, -262], [-30, -262]], JG.hair, { depth: 12, line: 3.4, hi: true, hiW: 3, rim: '#8a80ff', halftone: { d: 5, alpha: 0.24, color: '#5a5aa8' } });
          S.cel(cap(0, -246, 0, -232, 16, 16), JG.skin, { depth: 3, line: 2.6, hi: false, rim: null });
          S.cel(E(-4, -262, 28, 33, 20), JG.skin, { depth: 10, line: 3.4, hi: false, rim: '#ffffff', halftone: { d: 5, alpha: 0.12, color: '#b898a8' } });
          // the bin wings of hair framing the face, the hairline, the chignon and a great gold comb
          S.cel([[-30, -282], [-46, -268], [-48, -244], [-40, -228], [-32, -240], [-34, -262]], JG.hair, { depth: 5, line: 3, hi: true, hiW: 2.4, rim: '#8a80ff' });
          S.cel([[22, -282], [38, -268], [40, -244], [32, -228], [24, -240], [26, -262]], JG.hair, { depth: 5, line: 3, hi: true, hiW: 2.4, rim: '#8a80ff' });
          S.cel([[-30, -276], [-26, -300], [-4, -312], [18, -306], [26, -282], [16, -290], [4, -284, 1], [-6, -292], [-18, -284, 1], [-26, -280]], JG.hair, { depth: 7, line: 3.2, hi: true, hiW: 2.6, rim: '#8a80ff' });
          tk.gloss(S.g, [[-24, -304], [-4, -312], [16, -304]], { w: 5, alpha: 0.6, color: '#d8d4ff' });
          S.cel([[-24, -316], [-6, -336], [14, -334], [30, -318], [16, -324], [-4, -326]], JG.gold, { depth: 4, line: 2.8, hi: true, rim: '#fff0b0' });
          for (let i = 0; i < 6; i++) S.line([[-18 + i * 8, -320 - Math.sin(i / 5 * PI) * 8], [-18 + i * 8, -312]], { w: 1.4, color: '#8a6a24', taper: 0.1 });
          // powder-white face: crimson shadow at the eyes, a beauty mark, small red lips
          S.ell(-17, -266, 12, 6, '#d8304a', { line: 0, shadow: false, rim: null });
          S.ell(9, -266, 11, 5.4, '#d8304a', { line: 0, shadow: false, rim: null });
          S.line([[-30, -268], [-40, -272]], { w: 2.2, color: '#b01c40', taper: 0.4 });
          S.line([[20, -268], [30, -272]], { w: 2.2, color: '#b01c40', taper: 0.4 });
          S.ell(-24, -246, 5, 3.2, '#ffa0b0', { line: 0, shadow: false, rim: null });
          S.ell(16, -246, 5, 3.2, '#ffa0b0', { line: 0, shadow: false, rim: null });
          S.cel(E(-1, -282, 2.6, 2.6, 6), '#d8304a', { line: 0, shadow: false, rim: null });
          S.cel([[-9, -243], [-3, -240.5], [3, -243], [1, -239], [-3, -237.5], [-7, -239]], '#d8102e', { line: 1.8, shadow: false, rim: null });
        },
      },
      armFan: {
        box: [-140, -240, -30, -100], pivot: [-52, -188],
        draw(S) {
          // the near arm, raised: a great furisode sleeve trailing to the ground
          S.cel([[-46, -196], [-70, -204], [-96, -184], [-124, -150], [-134, -110], [-112, -104], [-92, -134], [-68, -158], [-48, -160]], JG.crim, { depth: 12, line: 3.4, hi: true, hiW: 3, rim: '#ff9ac8', halftone: { d: 5, alpha: 0.3, color: '#4a0a20' }, decor(g) { tk.inkPath(g, [[-120, -128], [-124, -110], [-112, -106]], { w: 6, color: JG.gold, taper: 0.05, pressure: 'flat' }); tk.inkPath(g, [[-100, -180], [-118, -146]], { w: 1.6, color: JG.gold, alpha: 0.8, taper: 0.2 }); } });
          S.cel(cap(-52, -190, -76, -222, 15, 12), JG.crim, { depth: 3, line: 2.8, hi: false, rim: null });
          S.cel(E(-80, -230, 8, 7.4), JG.skin, { depth: 2, line: 2.4, hi: false, rim: null });
        },
      },
      fan: {
        box: [-64, -100, 64, 8], pivot: [0, 0],
        draw(S) {
          // the iron fan, open, with a web in silver on black-red paper
          const pts = [[0, 0]];
          for (let i = 0; i <= 8; i++) { const a = -PI * 0.94 + i / 8 * PI * 0.88; pts.push([Math.cos(a) * 62, Math.sin(a) * 62 * 0.9 - 4]); }
          S.cel(pts, '#301028', { depth: 8, line: 3.2, hi: false, rim: '#ff9ac8', tension: 0.7,
            decor(g) { g.strokeStyle = 'rgba(244,236,255,0.9)'; g.lineWidth = 1.5; for (let i = 0; i <= 7; i++) { const a = -PI * 0.94 + i / 7 * PI * 0.88; g.beginPath(); g.moveTo(0, -4); g.lineTo(Math.cos(a) * 64, Math.sin(a) * 58 - 4); g.stroke(); } for (let r = 16; r <= 56; r += 14) { g.beginPath(); g.arc(0, -4, r, -PI * 0.94, -PI * 0.06); g.stroke(); } g.fillStyle = 'rgba(176,28,64,0.6)'; g.beginPath(); g.arc(0, -4, 12, 0, TAU); g.fill(); } });
          S.line([[0, 4], [-52, -54]], { w: 3, color: JG.gold, taper: 0.05, pressure: 'flat' });
          S.line([[0, 4], [54, -54]], { w: 3, color: JG.gold, taper: 0.05, pressure: 'flat' });
          S.cel(E(0, 2, 5, 5, 8), JG.gold, { line: 1.8, shadow: false });
        },
      },
      armThread: {
        box: [24, -296, 130, -176], pivot: [52, -192],
        draw(S) {
          S.cel([[46, -196], [78, -218], [104, -252], [110, -280], [92, -272], [72, -238], [50, -210]], JG.crimD, { depth: 10, line: 3.2, hi: false, rim: null, halftone: { d: 5, alpha: 0.3 }, decor(g) { tk.inkPath(g, [[92, -270], [104, -278]], { w: 5, color: JG.gold, taper: 0.05, pressure: 'flat' }); } });
          S.cel(E(100, -286, 7, 8), '#dcc8c8', { depth: 2, line: 2.4, hi: false, rim: null });
          [-1, 0, 1].forEach((k) => S.line([[100 + k * 3, -292], [102 + k * 5, -304 - Math.abs(k)]], { w: 2.2, color: pal.ink, taper: 0.3 }));
        },
      },
      lantern: { box: [-20, -4, 20, 64], pivot: [0, 0], draw(S) { jgLantern(S); } },
      // ------------------------------------------------ phase 1: the Spider
      abdomen: {
        box: [0, -210, 196, -36], pivot: [98, -124],
        draw(S) {
          S.cel(E(98, -124, 92, 72, 26, -0.16), JG.plumD, {
            depth: 26, line: 3.8, hi: true, hiW: 3.4, rim: '#ffb0e8', rimW: 2.4, halftone: { d: 5, alpha: 0.34, color: '#8a6ac0' },
            decor(g) {
              for (let i = 0; i < 60; i++) { const a = i * 2.39996, r = 8 + (i * 13) % 74; tk.inkPath(g, [[98 + Math.cos(a) * r, -124 + Math.sin(a) * r * 0.78], [98 + Math.cos(a) * r + 4, -124 + Math.sin(a) * r * 0.78 - 8]], { w: 1.2, color: '#b090e0', alpha: 0.5, taper: 0.4 }); }
              g.strokeStyle = 'rgba(240,200,96,0.42)'; g.lineWidth = 1.4;
              for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; g.beginPath(); g.moveTo(98, -124); g.lineTo(98 + Math.cos(a) * 92, -124 + Math.sin(a) * 74); g.stroke(); }
              for (let r = 24; r <= 84; r += 20) { g.beginPath(); g.ellipse(98, -124, r, r * 0.8, -0.16, 0, TAU); g.stroke(); }
            },
          });
          // the hourglass sigil of the web
          S.cel({ poly: [[72, -158], [126, -152], [108, -126], [130, -90], [70, -92], [96, -126]] }, '#ffe6c0', { depth: 4, line: 2.6, tension: 0.3, hi: false, rim: null, shadow: JG.amber });
          S.cel({ poly: [[84, -146], [112, -143], [104, -128], [116, -106], [84, -108], [96, -126]] }, JG.crim, { depth: 2, line: 1.8, tension: 0.3, hi: false, rim: null, shadow: '#7a0a28' });
          S.cel([[176, -70], [192, -64], [196, -50], [180, -48]], JG.plumF, { depth: 3, line: 2.6, hi: false, rim: null });
        },
      },
      thorax: {
        box: [-64, -180, 60, -80], pivot: [-4, -130],
        draw(S) { S.cel(E(-4, -128, 52, 42, 20), JG.plum, { depth: 16, line: 3.6, hi: true, hiW: 3, rim: '#ffb0e8', halftone: { d: 5, alpha: 0.3 } }); },
      },
      torsoB: {
        box: [-66, -214, 66, -110], pivot: [-6, -150],
        draw(S) {
          S.cel([[-24, -198], [-34, -188], [-38, -162], [-32, -134], [34, -134], [40, -162], [36, -188], [26, -198], [0, -202]], JG.skin, { depth: 12, line: 3.4, hi: true, hiW: 2.6, rim: '#ffffff', halftone: { d: 5, alpha: 0.16, color: '#b898a8' } });
          // the torn kimono hangs from her in crimson strips
          S.cel([[-38, -190], [-16, -176], [14, -150], [40, -134], [46, -150], [18, -170], [-8, -190], [-30, -204]], JG.crim, { depth: 6, line: 3, hi: false, rim: '#ff9ac8' });
          S.cel([[-40, -150], [-30, -130], [-14, -126], [-6, -138], [-20, -142], [-28, -156]], JG.crimD, { depth: 4, line: 2.6, hi: false, rim: null });
          tk.inkPath(S.g, [[-30, -196], [-6, -178], [18, -150]], { w: 3, color: JG.gold, taper: 0.1 });
          S.line([[-14, -190], [-4, -178]], { w: 1.4, color: '#ff8aa8', alpha: 0.8, taper: 0.3 });
        },
      },
      headB: {
        box: [-70, -346, 74, -226], pivot: [0, -236],
        draw(S) {
          // wild loose hair with a white streak, broken pins askew
          S.cel([[-48, -284], [-56, -312], [-30, -334], [4, -344], [42, -332], [62, -304], [50, -272], [30, -252], [-30, -252]], JG.hair, { depth: 14, line: 3.6, hi: true, hiW: 3, rim: '#a890ff', halftone: { d: 5, alpha: 0.28, color: '#5a5aa8' } });
          [[-40, -318, -70, -338], [-10, -336, -22, -362], [30, -336, 56, -356], [50, -316, 82, -320]].forEach((s0, i) => S.cel([[s0[0] - 6, s0[1] + 6], [s0[2], s0[3]], [s0[0] + 8, s0[1] - 4]], JG.hair, { depth: 3, line: 2.6, hi: false, rim: '#a890ff', tension: 0.4 }));
          S.cel(cap(0, -246, 0, -232, 16, 16), JG.skin, { depth: 3, line: 2.6, hi: false, rim: null });
          S.cel(E(-4, -262, 28, 33, 20), JG.skin, { depth: 10, line: 3.4, hi: false, rim: '#ffffff', halftone: { d: 5, alpha: 0.12, color: '#b898a8' } });
          S.cel([[-30, -276], [-26, -302], [-4, -314], [18, -308], [26, -282], [16, -292], [4, -286, 1], [-6, -294], [-18, -286, 1], [-26, -282]], JG.hair, { depth: 7, line: 3.2, hi: true, hiW: 2.6, rim: '#a890ff' });
          tk.inkPath(S.g, [[-16, -310], [-2, -296], [8, -280]], { w: 4, color: '#f4ecff', taper: 0.3, alpha: 0.95 });
          S.cel([[-30, -282], [-46, -262], [-48, -236], [-38, -226], [-32, -244]], JG.hair, { depth: 5, line: 3, hi: false, rim: '#a890ff' });
          S.cel([[22, -282], [40, -262], [42, -236], [32, -226], [24, -244]], JG.hair, { depth: 5, line: 3, hi: false, rim: '#a890ff' });
          [[-34, -292, -0.6], [34, -294, 0.7]].forEach((p) => { S.line([[p[0], p[1] + 10], [p[0] + p[2] * 12, p[1] - 22]], { w: 3, color: JG.gold, taper: 0.1, pressure: 'flat' }); S.cel(E(p[0] + p[2] * 12, p[1] - 24, 5, 5, 8), JG.crim, { line: 2, hi: true, rim: null }); });
          S.ell(-17, -266, 12, 6.4, '#d8304a', { line: 0, shadow: false, rim: null });
          S.ell(9, -266, 11, 6, '#d8304a', { line: 0, shadow: false, rim: null });
          [[-28, -276, -44, -292], [-24, -284, -32, -300], [18, -276, 34, -292], [14, -284, 24, -300]].forEach((m) => S.line([[m[0], m[1]], [m[2], m[3]]], { w: 3, color: '#b01c40', taper: 0.4 }));
          S.ell(-24, -244, 5, 3, '#ff8aa0', { line: 0, shadow: false, rim: null });
          S.ell(16, -244, 5, 3, '#ff8aa0', { line: 0, shadow: false, rim: null });
        },
      },
      clawN: {
        box: [-110, -270, -20, -130], pivot: [-32, -192],
        draw(S) {
          S.cel(cap(-32, -192, -62, -206, 15, 12), JG.skin, { depth: 4, line: 3, hi: true, rim: '#ffffff' });
          S.cel(cap(-62, -206, -86, -238, 12, 10), JG.skin, { depth: 3, line: 3, hi: false, rim: null });
          S.cel(E(-90, -246, 9, 8.4), JG.skin, { depth: 2, line: 2.6, hi: false, rim: null });
          [-1.1, -0.4, 0.3, 1.0].forEach((k, i) => { const a = -2.2 + k * 0.5; S.cel(cap(-90 + Math.cos(a + 1.5) * 4, -246 + Math.sin(a + 1.5) * 4, -90 + Math.cos(a) * 36, -246 + Math.sin(a) * 36, 4.6, 1.4), i % 2 ? '#d8c8e8' : '#f4ecff', { depth: 1, line: 2, hi: false, rim: null, shadow: false }); });
          S.line([[-36, -196], [-58, -210]], { w: 4, color: JG.crim, taper: 0.1 });
        },
      },
      clawF: {
        box: [20, -280, 120, -140], pivot: [34, -194],
        draw(S) {
          S.cel(cap(34, -194, 66, -212, 14, 11), '#d8c4c8', { depth: 4, line: 3, hi: false, rim: null });
          S.cel(cap(66, -212, 92, -246, 11, 9), '#d8c4c8', { depth: 3, line: 3, hi: false, rim: null });
          S.cel(E(96, -254, 8.6, 8), '#d8c4c8', { depth: 2, line: 2.6, hi: false, rim: null });
          [-1.0, -0.3, 0.4, 1.1].forEach((k, i) => { const a = -1.0 + k * 0.5 - 1.2; S.cel(cap(96 + Math.cos(a + 1.5) * 4, -254 + Math.sin(a + 1.5) * 4, 96 + Math.cos(a) * 34, -254 + Math.sin(a) * 34, 4.4, 1.4), '#c8b8d8', { depth: 1, line: 2, hi: false, rim: null, shadow: false }); });
        },
      },
    },
    chains: {
      legN: { spine: JG_SPINE, cuts: [0.34, 0.68], overlap: 10, reach: 28, draw(S) { jgLeg(S, false); } },
      legF: { spine: JG_SPINE, cuts: [0.34, 0.68], overlap: 10, reach: 28, draw(S) { jgLeg(S, true); } },
      hairW: {
        spine: [[16, -300], [56, -306], [96, -292], [136, -304], [170, -290]], cuts: [0.3, 0.6], overlap: 8, reach: 24,
        draw(S) { S.rib([[16, -300], [56, -306], [96, -292], [136, -304], [170, -290]], JG.hair, { wMax: 30, w0: 24, w1: 2, rim: '#a890ff', gloss: true, glossColor: '#c8b8ff', glossAlpha: 0.55, strands: 2, line: 3.2, shadow: true, halftone: { d: 5, alpha: 0.24, color: '#5a5aa8' } }); },
      },
      hairW2: {
        spine: [[10, -270], [50, -262], [90, -246], [128, -256], [156, -236]], cuts: [0.3, 0.6], overlap: 8, reach: 22,
        draw(S) { S.rib([[10, -270], [50, -262], [90, -246], [128, -256], [156, -236]], JG.hair, { wMax: 24, w0: 20, w1: 2, rim: '#a890ff', gloss: true, glossColor: '#c8b8ff', glossAlpha: 0.5, strands: 1, line: 3, shadow: true }); },
      },
      hairS: {
        spine: [[-30, -262], [-40, -238], [-34, -206], [-42, -176]], cuts: [0.4], overlap: 8, reach: 20,
        draw(S) { S.rib([[-30, -262], [-40, -238], [-34, -206], [-42, -176]], JG.hair, { wMax: 14, w0: 11, w1: 2, rim: '#8a80ff', gloss: true, glossColor: '#c8c4ff', glossAlpha: 0.5, strands: 1, line: 2.8, shadow: true }); },
      },
      shredA: {
        spine: [[-30, -138], [-46, -110], [-40, -78], [-54, -46]], cuts: [0.34, 0.68], overlap: 8, reach: 22,
        draw(S) { S.rib([[-30, -138], [-46, -110], [-40, -78], [-54, -46]], JG.crim, { wMax: 24, w0: 20, w1: 3, rim: '#ff9ac8', gloss: false, strands: 0, line: 3, shadow: true, halftone: { d: 5, alpha: 0.26 } }); S.line([[-32, -132], [-44, -108], [-40, -80]], { w: 1.6, color: JG.gold, alpha: 0.9, taper: 0.2 }); },
      },
      shredB: {
        spine: [[6, -134], [16, -104], [6, -72], [18, -40]], cuts: [0.34, 0.68], overlap: 8, reach: 22,
        draw(S) { S.rib([[6, -134], [16, -104], [6, -72], [18, -40]], JG.crimD, { wMax: 22, w0: 18, w1: 3, rim: '#ff9ac8', gloss: false, strands: 0, line: 3, shadow: true }); },
      },
      shredC: {
        spine: [[-12, -136], [-16, -108], [-24, -80], [-18, -54]], cuts: [0.5], overlap: 8, reach: 20,
        draw(S) { S.rib([[-12, -136], [-16, -108], [-24, -80], [-18, -54]], '#f6f0fa', { wMax: 18, w0: 14, w1: 2, rim: '#ffffff', gloss: false, strands: 0, line: 2.8, shadow: true }); },
      },
    },
    rig(ctx, st) {
      if (st.phase >= 1) jgSpider(ctx, st); else jgCourtesan(ctx, st);
    },
  });
  function jgTier(S, hw, col, seed) {
    const pts = [[-hw, -22]];
    for (let i = 0; i <= 12; i++) { const x = -hw + i / 12 * hw * 2; pts.push([x, -6 + (i % 2 ? 9 : 2) + (seed % 3)]); }
    pts.push([hw, -22]);
    S.cel(pts, col, { depth: 5, line: 3, hi: false, rim: '#ffffff', tension: 0.6, halftone: { d: 5, alpha: 0.22 }, decor(g) { for (let i = 0; i < 9; i++) tk.inkPath(g, [[-hw + i * hw / 4.5, -20], [-hw + i * hw / 4.5 + 4, -4]], { w: 1.3, color: 'rgba(60,30,90,0.5)', taper: 0.2 }); } });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Jorogumo's rigs: the Courtesan (phase 0) and the Spider (phase 1). Both are assembled from independently animated parts (see the parts above).
  // ---------------------------------------------------------------------------------------------------------------
  // silk that flies toward the heroes: n threads from an origin, u = 0..1 progress
  function jgVolley(ctx, ox, oy, u, alpha, n, seed) {
    if (u <= 0 || alpha <= 0.01) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const v = hv(seed, 'v' + i), ex = ox - (260 + 120 * v) * u, ey = oy + (i - (n - 1) / 2) * 34 * u + 70 * u * u * (0.5 + v), mx = (ox + ex) / 2, my = Math.min(oy, ey) - 26 * (1 - u) - 14;
      ctx.globalAlpha = cA(alpha * (1 - u * 0.5));
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
      ctx.globalAlpha = cA(alpha * 0.4 * (1 - u)); ctx.strokeStyle = '#ffb0e8'; ctx.lineWidth = 5.5; ctx.stroke();
    }
    ctx.restore();
  }
  function jgWeb(ctx, t, m, a, cx, cy, R) {
    if (a <= 0.01) return;
    ctx.save();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#f4ecff'; ctx.globalAlpha = cA(a);
    const spokes = 13, sw = (i) => Math.sin(t * 0.9 + i) * 4 * m;
    for (let i = 0; i < spokes; i++) { const an = i / spokes * TAU; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(an) * R + sw(i), cy + Math.sin(an) * R * 0.86 + sw(i + 3)); ctx.stroke(); }
    for (let r = R * 0.2; r <= R; r += R * 0.16) {
      ctx.beginPath();
      for (let i = 0; i <= spokes; i++) {
        const an = i / spokes * TAU, an2 = (i - 0.5) / spokes * TAU, x = cx + Math.cos(an) * r + sw(i) * r / R, y = cy + Math.sin(an) * r * 0.86 + sw(i + 3) * r / R;
        if (i === 0) ctx.moveTo(x, y); else ctx.quadraticCurveTo(cx + Math.cos(an2) * r * 0.86, cy + Math.sin(an2) * r * 0.86 * 0.86, x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  function jgCourtesan(ctx, st) {
    const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die;
    const sl = Math.max(0, sw), back = Math.max(0, -sw), br = Math.sin(TAU * t / 3.4) * m, hot = clamp(tele + sl + buff, 0, 1);
    const dx = -sw * 30 + hurt * 20 + tele * 8, lean = -0.05 * sw + 0.07 * hurt + 0.02 * tele + 0.008 * br, rise = 8 * tele + 5 * buff * Math.sin(PI * E0.buffP);
    ctx.save();
    // lanterns hang on silk threads from above and sway; they brighten when she is stirred
    [[-198, -232, 0], [200, -212, 1], [-104, -334, 2]].forEach((L, i) => {
      const r = m * 0.12 * Math.sin(TAU * t / 2.3 + i * 1.9) + 0.12 * hurt - 0.06 * sw, sc = i === 2 ? 0.8 : 1;
      const g = ctx.createLinearGradient(0, L[1], 0, L[1] - 190);
      g.addColorStop(0, 'rgba(244,236,255,0.9)'); g.addColorStop(1, 'rgba(244,236,255,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(L[0], L[1]); ctx.lineTo(L[0] + Math.sin(t * 0.7 + i) * 5 * m, L[1] - 190); ctx.stroke();
      ctx.save(); ctx.translate(L[0], L[1]); ctx.scale(sc, sc); ctx.translate(-L[0], -L[1]);
      put(ctx, st, 'lantern', { x: L[0], y: L[1], r, noFlash: true });
      tk.glow(ctx, L[0] - Math.sin(r) * 30, L[1] + 32 * Math.cos(r), 40 + 12 * hot, JG.amber, cA((0.42 + 0.2 * Math.sin(t * 6 + i) + 0.4 * hot) * (1 - die)));
      ctx.restore();
    });
    // four black spider feet peek out from under the hem
    [[-96, -26, -1, 1], [-118, -22, -1, 0.8], [96, -26, 1, 1], [120, -22, 1, 0.8]].forEach((f, i) => put(ctx, st, 'tip', { x: f[0], y: f[1] + 22, sx: f[2] * f[3], sy: f[3], r: (Math.max(0, Math.sin(t * 1.9 + i * 1.7)) > 0.94 ? 0.12 : 0) * m + 0.15 * tele * -1 + 0.2 * hurt * f[2] }));
    xform(ctx, 0, -6, dx, -rise, lean, 1, 1 + 0.008 * br - 0.05 * die);
    const tw = (ph) => m * 4 * Math.sin(TAU * t / 2.4 + ph) + 8 * sl + 10 * hurt;
    put(ctx, st, 'tierV', { x: tw(0), sx: 1 + 0.04 * tele });
    put(ctx, st, 'tierW', { x: tw(1.2), sx: 1 + 0.03 * tele });
    put(ctx, st, 'tierG', { x: tw(2.4), sx: 1 + 0.02 * tele });
    // the obi bow, an abdomen in disguise, that swells when she is angry
    put(ctx, st, 'obiBow', { r: 0.03 * Math.sin(TAU * t / 2.8) * m + 0.12 * tele - 0.08 * sw + 0.05 * hurt, sx: 1 + 0.06 * hot, sy: 1 + 0.06 * hot });
    // the far arm draws a silk thread up toward a lantern
    const fR = 0.04 * Math.sin(TAU * t / 2.6 + 1) * m + 0.5 * tele - 0.25 * sl + 0.4 * hurt * -1 - 0.5 * guard + 0.35 * buff * Math.sin(PI * E0.buffP) * -1;
    put(ctx, st, 'armThread', { r: fR });
    put(ctx, st, 'kimono', { sx: 1 + 0.01 * br, sy: 1 + 0.008 * br, x: 2 * hurt * 6 });
    const nR = 0.05 * Math.sin(TAU * t / 2.6) * m - 0.7 * sl + 0.4 * back - 0.5 * tele + 0.9 * guard + 0.3 * hurt - 0.4 * buff * Math.sin(PI * E0.buffP);
    put(ctx, st, 'torsoA', {
      r: 0.01 * br - 0.02 * sw, sy: 1 + 0.006 * br,
      kids(c) {
        put(c, st, 'headA', {
          r: 0.03 * Math.sin(TAU * t / 3.1) * m - 0.08 * sw + 0.09 * hurt - 0.05 * guard + 0.03 * tele * Math.sin(t * 40), y: 2 * tele - 3 * sl,
          kids(cc) {
            const open = blink(t, 'jorogumo', 4.4) * (1 - 0.6 * hurt) * (1 - 0.4 * guard);
            [[-17, 10.4, 8.6], [9, 9.4, 8]].forEach((e, i) => eyeLive(cc, e[0], -263, e[1], e[2] * (1 + 0.12 * tele), { open, iris: ['#ff7a10', '#ffe090'], sclera: '#fff0d0', pupil: 'slit', glow: JG.amber, glowK: 0.8 + 0.3 * hot, glowR: 3.4, lw: 2.6, look: [-0.5 - 0.4 * sl, 0.02], rot: (i ? -1 : 1) * 0.16 * (1 + hot) }));
            tk.inkPath(cc, [[-30, -272], [-16, -276], [-2, -270]], { w: 2.6, taper: 0.4 });
            tk.inkPath(cc, [[2, -270], [14, -275], [26, -270]], { w: 2.6, taper: 0.4 });
            const mo = 0.05 + 0.95 * sl + 0.5 * tele + 0.5 * hurt + 0.4 * buff;
            if (mo > 0.25) {
              cc.beginPath(); cc.ellipse(-3, -240, 7 + 3 * mo, 2 + 6 * mo, 0, 0, TAU); cc.fillStyle = '#3a0518'; cc.fill(); cc.lineWidth = 2.4; cc.strokeStyle = pal.ink; cc.stroke();
              cc.fillStyle = '#ffffff'; [-8, 2].forEach((fx) => { cc.beginPath(); cc.moveTo(fx - 1.6, -242); cc.lineTo(fx, -234 - 3 * mo); cc.lineTo(fx + 1.6, -242); cc.fill(); });
            }
            tk.glow(cc, -4, -262, 60, JG.amber, cA((0.14 + 0.24 * hot) * (1 - die)));
          },
        });
        putChain(c, st, 'hairS', [0, 1].map((j) => m * 0.14 * Math.sin(TAU * (t / 2.4) - j * 0.9) + 0.18 * hurt - 0.1 * sl));
      },
    });
    put(ctx, st, 'armFan', {
      r: nR,
      kids(c) {
        put(c, st, 'fan', { x: -80, y: -230, r: 0.08 * Math.sin(TAU * t / 2.2) * m - 0.3 + 1.5 * sl * -1 + 0.9 * back * 0 + 0.9 * guard + 0.5 * tele, sx: 1 + 0.12 * sl, sy: 1 + 0.12 * sl });
        if (E0.pose === 'attack' && E0.p > 0.34 && E0.p < 0.72) {
          const u = sm((E0.p - 0.34) / 0.16) * (1 - sm((E0.p - 0.6) / 0.12));
          c.save(); c.translate(-80, -230); c.globalAlpha = cA(u * 0.85);
          c.beginPath(); c.arc(0, 0, 118, -2.7, -0.7, false); c.arc(0, 0, 60, -0.7, -2.7, true); c.closePath();
          const gg = c.createRadialGradient(0, 0, 60, 0, 0, 118); gg.addColorStop(0, 'rgba(255,200,230,0.05)'); gg.addColorStop(1, 'rgba(255,240,250,0.8)'); c.fillStyle = gg; c.fill(); c.restore();
        }
      },
    });
    ctx.restore();
    // silk billowing on the wind-up, flying at the heroes on the strike, motes when she gathers her brood
    const nH = rotAbout(-52 + dx, -188, -80 + dx, -230, nR), fH = rotAbout(52 + dx, -192, 102 + dx, -304, fR);
    if (E0.pose === 'attack') { const u = clamp((E0.p - 0.4) / 0.5, 0, 1); jgVolley(ctx, nH[0], nH[1], u, 1 - die, 5, 3); jgVolley(ctx, fH[0], fH[1], u, 0.8 * (1 - die), 4, 5); }
    if (tele > 0.05) {
      ctx.save(); ctx.lineCap = 'round';
      for (let i = 0; i < 9; i++) { const sx = (i < 5 ? nH[0] : fH[0]), sy = (i < 5 ? nH[1] : fH[1]), a = -2.6 + i * 0.32; ctx.globalAlpha = cA(tele * 0.7); ctx.strokeStyle = '#f4ecff'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.bezierCurveTo(sx + Math.cos(a) * 60 + Math.sin(t * 3 + i) * 10, sy + Math.sin(a) * 60, sx + Math.cos(a) * 120, sy + Math.sin(a) * 100 + Math.sin(t * 2 + i) * 14, sx + Math.cos(a) * 180 - 40, sy + Math.sin(a) * 120); ctx.stroke(); }
      ctx.restore();
    }
    if (buff > 0.05) { motes(ctx, dx, -10, t, 12, 41, { col: '#f4ecff', rise: 120, spread: 100, life: 1.2, size: 3, alpha: buff }); ctx.save(); ctx.globalAlpha = cA(buff * 0.7); ctx.strokeStyle = '#ffb0e8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, -6, 60 + 130 * E0.buffP, (60 + 130 * E0.buffP) * 0.16, 0, 0, TAU); ctx.stroke(); ctx.restore(); }
    motes(ctx, dx, -200, t, 6, 51, { col: '#fff0d0', rise: 40, spread: 90, life: 2.4, size: 2, alpha: 0.7 * (1 - die) });
  }
  function jgSpider(ctx, st) {
    const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die;
    const sl = Math.max(0, sw), back = Math.max(0, -sw), blaze = st.hp < 0.2 ? 1 : 0, hot = clamp(tele + sl + buff + 0.5 * blaze, 0, 1.4);
    const bob = Math.sin(TAU * t / 1.7) * 5 * m, lift = 8 + bob + 34 * tele + 12 * buff * Math.sin(PI * E0.buffP) - 30 * die - 6 * hurt - 10 * back;
    const dx = -sw * 38 + hurt * 22 + tele * 10 - 6 * blaze * Math.sin(t * 30) * m;
    const rot = -0.06 * sw + 0.08 * hurt + 0.1 * tele + 0.012 * Math.sin(TAU * t / 3);
    ctx.save();
    // the great web behind, brighter when she is about to strike
    jgWeb(ctx, t, m, (0.14 + 0.3 * tele + 0.14 * blaze) * (1 - die), 20, -170, 330);
    const legB = (i, L) => {
      const front = L[2] < 0, off = L[5], sk = m * (0.07 + 0.03 * blaze);
      const root = -(sk * Math.sin(TAU * t / 1.3 + off)) - (front ? 0.55 * back + 0.62 * tele : 0.2 * tele) + (front ? 0.2 * sl : 0.06 * sl) - 0.32 * guard + 0.22 * hurt * Math.sin(t * 46 + i) + 0.34 * die + 0.1 * buff * Math.sin(t * 14 + i) - 0.06 * blaze * Math.sin(t * 22 + i);
      const knee = sk * 0.7 * Math.sin(TAU * t / 1.3 + off + 1) + (front ? 0.5 * back - 0.5 * sl + 0.3 * tele : 0.12 * tele) + 1.0 * guard + 1.5 * die + 0.2 * hurt;
      const foot = 0.3 * die + 0.1 * guard;
      return [root, knee, foot];
    };
    const drawLegs = (far) => JG_LEG_ROOT.filter((L) => L[4] === far).forEach((L, k) => {
      const ry = L[1] - lift * 0.55, sy = clamp(-ry / 118, 0.4, 1.6);
      putChain(ctx, st, far ? 'legF' : 'legN', legB(k + (far ? 0 : 4), L), { x: L[0] + dx * 0.8, y: ry, sx: L[2] * L[3], sy });
    });
    drawLegs(true);
    ctx.save();
    xform(ctx, 0, -100, dx, -lift * 0.55, rot, 1 + 0.01 * Math.sin(TAU * t / 2.1) * m, 1 - 0.01 * Math.sin(TAU * t / 2.1) * m - 0.06 * die);
    // the abdomen: a vast plum globe that throbs, with the glowing web sigil and a thread hanging from its tip
    const throb = 1 + 0.03 * Math.sin(TAU * t / 1.9) * m + 0.05 * tele + 0.05 * buff * Math.sin(PI * E0.buffP) - 0.04 * die;
    put(ctx, st, 'abdomen', {
      sx: throb, sy: throb, r: 0.02 * Math.sin(TAU * t / 2.6) * m - 0.05 * tele,
      kids(c) {
        const gl = 0.5 + 0.2 * Math.sin(t * 2.4) * m + 0.55 * hot;
        tk.glow(c, 98, -124, 96, JG.amber, cA(gl * 0.55 * (1 - die)));
        tk.glow(c, 98, -124, 56, '#ff5a3a', cA(gl * 0.4 * (1 - die)));
        c.save(); c.strokeStyle = '#f4ecff'; c.lineWidth = 2; c.lineCap = 'round'; c.globalAlpha = cA(0.9 * (1 - die));
        c.beginPath(); c.moveTo(194, -52); c.bezierCurveTo(198 + Math.sin(t * 2) * 4 * m, -30, 190 + Math.sin(t * 1.6 + 1) * 6 * m, -12, 196, 16); c.stroke(); c.restore();
      },
    });
    put(ctx, st, 'thorax', { sx: 1 + 0.02 * Math.sin(TAU * t / 1.7) * m, sy: 1 + 0.03 * Math.sin(TAU * t / 1.7) * m });
    [['shredB', 1.2], ['shredC', 0.4]].forEach((s0, i) => putChain(ctx, st, s0[0], [0, 1, 2].map((j) => m * 0.13 * Math.sin(TAU * (t / 2.2) - j * 0.9 + s0[1]) + 0.3 * hurt - 0.1 * sl + 0.2 * die)));
    put(ctx, st, 'torsoB', {
      r: 0.012 * Math.sin(TAU * t / 3) * m - 0.06 * sw + 0.08 * hurt + 0.06 * tele, sx: 1.3, sy: 1.3 + 0.008 * Math.sin(TAU * t / 3) * m, y: -8,
      kids(c) {
        put(c, st, 'headB', {
          r: 0.03 * Math.sin(TAU * t / 2.9) * m - 0.1 * sw + 0.1 * hurt + 0.04 * tele + 0.03 * Math.sin(t * 40) * blaze, y: 3 * tele - 5 * sl,
          pre(cc) {
            putChain(cc, st, 'hairW', [0, 1, 2].map((j) => m * (0.16 + 0.05 * blaze) * Math.sin(TAU * (t / 1.9) - j * 0.9) + 0.25 * sl + 0.1 * hurt - 0.15 * tele));
            putChain(cc, st, 'hairW2', [0, 1, 2].map((j) => m * (0.15 + 0.05 * blaze) * Math.sin(TAU * (t / 2.1) - j * 0.9 + 1.4) + 0.2 * sl + 0.1 * hurt - 0.12 * tele));
          },
          kids(cc) {
            const o1 = blink(t, 'jg1', 4.2) * (1 - 0.6 * hurt), o2 = blink(t, 'jg2', 3.3) * (1 - 0.6 * hurt);
            [[-17, 11, 9.4], [9, 10, 9]].forEach((e, i) => eyeLive(cc, e[0], -263, e[1], e[2] * (1 + 0.16 * hot), { open: o1, iris: ['#ff5a10', '#fff090'], sclera: '#fff6d8', pupil: 'slit', glow: JG.amber, glowK: 0.95 + 0.3 * hot, glowR: 3.6, lw: 2.6, look: [-0.5 - 0.4 * sl, 0], rot: (i ? -1 : 1) * 0.22 * (1 + hot) }));
            [[-25, -278], [-12, -284], [5, -285], [18, -279]].forEach((e, i) => eyeLive(cc, e[0], e[1], 3.6, 4.2, { open: i % 2 ? o2 : o1, iris: ['#ff5a10', '#ffd060'], sclera: '#fff6d8', pupil: 'dot', glow: JG.amber, glowK: 0.7 + 0.3 * hot, glowR: 3, lw: 1.5, catch: false, look: [-0.3, 0] }));
            // a wide, fanged mouth
            const mo = 0.3 + 0.75 * sl + 0.6 * tele + 0.5 * hurt + 0.3 * buff + 0.2 * blaze;
            cc.beginPath(); cc.ellipse(-3, -240, 9 + 4 * mo, 3 + 7 * mo, 0, 0, TAU); cc.fillStyle = '#3a0518'; cc.fill(); cc.lineWidth = 2.6; cc.strokeStyle = pal.ink; cc.stroke();
            cc.fillStyle = '#f4ecff'; cc.strokeStyle = pal.ink; cc.lineWidth = 1.6;
            [[-9, -1], [3, 1]].forEach((f) => { cc.beginPath(); cc.moveTo(f[0] - 2.4, -243); cc.quadraticCurveTo(f[0] + f[1] * 3, -236 - 4 * mo, f[0] + f[1] * 1 + 0.6, -228 - 5 * mo); cc.quadraticCurveTo(f[0] + 1, -236, f[0] + 2.4, -243); cc.closePath(); cc.fill(); cc.stroke(); });
            tk.glow(cc, -4, -262, 70, JG.amber, cA((0.18 + 0.3 * hot) * (1 - die)));
          },
        });
        putChain(c, st, 'shredA', [0, 1, 2].map((j) => m * 0.13 * Math.sin(TAU * (t / 2.2) - j * 0.9) + 0.3 * hurt - 0.1 * sl + 0.2 * die));
      },
    });
    ctx.restore();
    drawLegs(false);
    // her clawed arms, raised in front of the near legs so they read
    ctx.save();
    xform(ctx, 0, -100, dx, -lift * 0.55, rot, 1 + 0.01 * Math.sin(TAU * t / 2.1) * m, 1 - 0.01 * Math.sin(TAU * t / 2.1) * m - 0.06 * die);
    put(ctx, st, 'clawF', { sx: 1.3, sy: 1.3, r: -0.15 + 0.14 * Math.sin(TAU * t / 2.3 + 1) * m + 0.5 * sl - 0.6 * tele + 0.3 * hurt - 0.4 * buff * Math.sin(PI * E0.buffP) + 0.8 * guard });
    put(ctx, st, 'clawN', { sx: 1.3, sy: 1.3, r: 0.14 * Math.sin(TAU * t / 2.3) * m - 0.9 * sl + 0.6 * back + 0.5 * tele + 0.4 * hurt + 0.8 * guard - 0.4 * buff * Math.sin(PI * E0.buffP) });
    ctx.restore();
    ctx.restore();
    // silk sprays from her fingers on the strike; a burst of light rings out on a summon
    if (E0.pose === 'attack') { const u = clamp((E0.p - 0.4) / 0.5, 0, 1); jgVolley(ctx, -122 + dx, -270 - lift * 0.55, u, 1 - die, 6, 7); }
    if (buff > 0.05) { ctx.save(); ctx.globalAlpha = cA(buff * 0.7); ctx.strokeStyle = '#ffb0e8'; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.ellipse(0, -8, 70 + 180 * E0.buffP, (70 + 180 * E0.buffP) * 0.16, 0, 0, TAU); ctx.stroke(); ctx.restore(); motes(ctx, 90 + dx, -120, t, 10, 43, { col: '#f4ecff', rise: 110, spread: 80, life: 1.1, size: 3, alpha: buff }); }
    motes(ctx, dx, -220, t, 6, 53, { col: '#fff0d0', rise: 46, spread: 110, life: 2.2, size: 2.2, alpha: 0.7 * (1 - die) });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // KARAKURI PUPPET (normal, m): a painted wooden wind-up doll from a shuttered theatre. Stop-motion ticks, a big brass key on its back,
  // gears turning behind a chest window. Accent: cyan glass eyes and the cyan light of the mechanism (hot gold when it winds up to smash).
  // ---------------------------------------------------------------------------------------------------------------
  const KW = { wood: '#dba260', woodF: '#b98650', woodD: '#7a4a28', teal: '#2a95a0', tealF: '#217680', gold: '#f5c96a', verm: '#d8402e', hair: '#34307a', skin: '#f6ead2', cyan: '#6ff0ff' };
  function karakuriLeg(S, far) {
    const ox = far ? 22 : 0, w = far ? KW.woodF : KW.wood, o = { hi: !far, depth: 5, line: 2.8, rim: far ? null : KW.cyan };
    S.cel(cap(-8 + ox, -62, -10 + ox, -36, 15, 13), w, o);
    S.cel(cap(-10 + ox, -37, -10 + ox, -33, 15, 15), KW.verm, { depth: 2, line: 2, hi: false, rim: null });
    S.cel(E(-10 + ox, -33, 7.2, 7), far ? '#d19555' : '#efb975', { depth: 3, line: 2.4, hi: false });
    S.cel(cap(-10 + ox, -33, -12 + ox, -12, 11.5, 10), w, o);
    S.cel({ poly: [[-27 + ox, -13], [3 + ox, -13], [3 + ox, -6], [-27 + ox, -6]] }, '#6a3a1e', { depth: 3, tension: 0.2, line: 2.4, rim: null });
    S.cel({ poly: [[-24 + ox, -6], [-17 + ox, -6], [-17 + ox, 1], [-24 + ox, 1]] }, '#54301a', { depth: 2, tension: 0.2, line: 2.2, rim: null });
    S.cel({ poly: [[-4 + ox, -6], [3 + ox, -6], [3 + ox, 1], [-4 + ox, 1]] }, '#54301a', { depth: 2, tension: 0.2, line: 2.2, rim: null });
    S.cel(E(-12 + ox, -16, 10, 5.2), '#f3ecda', { depth: 2, line: 2.2, hi: false, rim: null });
    S.line([[-19 + ox, -16], [-12 + ox, -20], [-5 + ox, -16]], { w: 2.6, color: KW.verm, taper: 0.1 });
  }
  function karakuriArm(S, far, part) {
    const sx = far ? 24 : -22, dir = far ? 1 : -1, w = far ? KW.woodF : KW.wood, o = { hi: !far, depth: 4, line: 2.6, rim: far ? null : KW.cyan };
    const ex = sx + dir * 6, skin = far ? '#d19555' : '#efb975';
    if (part === 'U') {
      S.cel(cap(sx, -112, ex, -88, 15, 12.5), far ? '#217680' : KW.teal, { depth: 5, line: 2.6, hi: !far, rim: far ? null : KW.cyan });
      S.cel(cap(ex - dir * 0.5, -92, ex, -88, 13, 13), KW.gold, { depth: 2, line: 2, hi: false, rim: null });
      S.cel(E(ex, -86, 6.6, 6.4), skin, { depth: 2.5, line: 2.2, hi: false });
    } else {
      S.cel(cap(ex, -86, ex + dir * 4, -62, 11.5, 10.5), w, o);
      S.cel(cap(ex + dir * 1, -76, ex + dir * 2, -73, 12.5, 12.5), KW.verm, { depth: 2, line: 1.8, hi: false, rim: null });
      S.cel([[ex + dir * 0, -64], [ex + dir * 11, -66], [ex + dir * 14, -56], [ex + dir * 8, -47], [ex - dir * 4, -50], [ex - dir * 6, -58]], skin, { depth: 3.5, line: 2.6, hi: false });
      S.line([[ex + dir * 2, -56], [ex + dir * 10, -58]], { w: 1.3, alpha: 0.7, taper: 0.4 });
      S.line([[ex + dir * 2, -52], [ex + dir * 9, -53]], { w: 1.3, alpha: 0.7, taper: 0.4 });
    }
  }
  define('karakuri_puppet', {
    size: 'm', lw: 3,
    col: { rim: KW.cyan },
    bounds: { w: 108, h: 194, head: { x: -2, y: -190 }, body: { x: 0, y: -100 }, feet: { x: 0, y: 0 } },
    die: { box: [-70, -200, 70, 4], nx: 8, ny: 10, from: 'out', clip: false, kinds: ['coin', 'scrap', 'ember'], cols: ['#f5c96a', '#dba260', '#6ff0ff'], size: 6, wind: [0, -20] },
    parts: {
      legN: { box: [-30, -66, 6, 4], pivot: [-8, -62], draw(S) { karakuriLeg(S, false); } },
      legF: { box: [-8, -66, 30, 4], pivot: [14, -62], draw(S) { karakuriLeg(S, true); } },
      armNU: { box: [-42, -124, -8, -80], pivot: [-22, -112], draw(S) { karakuriArm(S, false, 'U'); } },
      armNF: { box: [-52, -96, -16, -42], pivot: [-28, -86], draw(S) { karakuriArm(S, false, 'F'); } },
      armFU: { box: [10, -124, 44, -80], pivot: [24, -112], draw(S) { karakuriArm(S, true, 'U'); } },
      armFF: { box: [16, -96, 52, -42], pivot: [30, -86], draw(S) { karakuriArm(S, true, 'F'); } },
      gear: {
        box: [-12, -12, 12, 12], pivot: [0, 0],
        draw(S) {
          const pts = [];
          for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, r = i % 2 ? 7.4 : 10; pts.push([Math.cos(a - 0.1) * r, Math.sin(a - 0.1) * r, 1], [Math.cos(a + 0.1) * r, Math.sin(a + 0.1) * r, 1]); }
          S.cel({ poly: pts }, KW.gold, { depth: 3, line: 1.6, tension: 0, rim: null });
          S.cel(E(0, 0, 3.4, 3.4, 8), '#3a2a12', { line: 1.4, shadow: false });
        },
      },
      torso: {
        box: [-38, -130, 40, -52], pivot: [0, -66],
        draw(S) {
          S.cel([[-24, -121], [-31, -104], [-27, -80], [-24, -62], [-8, -57], [8, -57], [26, -61], [29, -80], [31, -104], [25, -121], [0, -125]], KW.teal, {
            depth: 11, hi: true, halftone: { d: 5, alpha: 0.32 }, rim: KW.cyan,
            decor(g) {
              g.fillStyle = 'rgba(245,201,106,0.9)';
              for (let j = 0; j < 4; j++) for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(-22 + i * 11 + (j % 2) * 5.5, -114 + j * 13, 1.5, 0, TAU); g.fill(); }
              tk.inkPath(g, [[-16, -124], [-4, -104], [10, -124]], { w: 3, color: KW.gold, taper: 0.1 });
            },
          });
          S.cel({ poly: [[-29, -83], [30, -83], [29, -69], [-28, -69]] }, KW.verm, { depth: 3, line: 2.4, tension: 0.2, rim: '#ff8a7a' });
          S.line([[-28, -76], [29, -76]], { w: 1.6, color: KW.gold, taper: 0.1 });
          S.cel([[26, -80], [35, -86], [37, -78], [33, -71], [26, -71]], KW.verm, { depth: 2, line: 2.2, hi: false, rim: null });
          S.cel(E(-2, -100, 16, 16, 18), '#5a3a1a', { depth: 4, line: 2.6, hi: false, rim: KW.gold });
          S.cel(E(-2, -100, 12.4, 12.4, 16), '#0c1c28', { line: 1.6, shadow: false });
        },
      },
      head: {
        box: [-42, -194, 44, -120], pivot: [0, -124],
        draw(S) {
          S.cel(cap(0, -128, 0, -119, 11, 11), '#a86a3a', { depth: 3, hi: false, line: 2.4, rim: null });
          S.cel([[-37, -158], [-36, -176], [-16, -188], [12, -188], [32, -177], [37, -158], [36, -136], [28, -127], [-28, -127], [-36, -136]], KW.hair, { depth: 9, hi: true, hiW: 3, rim: '#a8a0ff', line: 3 });
          S.cel(E(-2, -151, 30, 28.5, 18), KW.skin, { depth: 8, hi: false, line: 3 });
          // bangs: a straight fringe with notches, and a glossy arc
          S.cel([[-33, -160], [-32, -177], [-14, -186], [14, -186], [32, -176], [33, -158], [24, -164], [14, -157, 1], [4, -165], [-6, -157, 1], [-16, -165], [-26, -158]], KW.hair, { depth: 6, hi: true, hiW: 2.4, rim: '#a8a0ff', line: 2.8 });
          tk.gloss(S.g, [[-26, -176], [-8, -183], [12, -182]], { w: 4, alpha: 0.55, color: '#d8d4ff' });
          S.cel(E(-6, -182, 3.2, 3.2, 8), KW.verm, { line: 1.6, shadow: false });
          S.ell(-15, -139, 5.6, 3.6, '#ff9aa0', { line: 0, shadow: false, rim: null });
          S.ell(13, -139, 5.6, 3.6, '#ff9aa0', { line: 0, shadow: false, rim: null });
          S.line([[-21, -165], [-14, -168], [-7, -166]], { w: 2, alpha: 0.9, taper: 0.5 });
          S.line([[6, -166], [13, -168], [20, -165]], { w: 2, alpha: 0.9, taper: 0.5 });
          // the painted, unchanging smile
          S.cel([[-8, -134], [-2, -131], [5, -134], [3, -131], [-2, -128.5], [-6, -131]], '#d8402e', { line: 1.8, shadow: false, rim: null });
          S.line([[-9, -136], [-11, -138]], { w: 1.4, taper: 0.5 });
          S.line([[6, -136], [8, -138]], { w: 1.4, taper: 0.5 });
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die;
      const tick = (r) => Math.floor(t * r) / r;
      const ti = tick(6), hot = clamp(tele + buff + Math.max(0, sw), 0, 1);
      const bobY = Math.round(Math.sin(TAU * t / 1.6) * 1.6) * m + buff * -3 * Math.sin(t * 50);
      const dx = -sw * 24 + hurt * 16 + tele * 8 + Math.sin(t * 60) * 1.4 * buff;
      const rotB = -0.09 * sw + 0.11 * hurt + 0.07 * tele;
      const sy = 1 - 0.04 * tele + 0.05 * buff - 0.05 * hurt;
      const mv = (name, T) => {
        if (!die) return T;
        const f = fling('karakuri', name, die, { spread: 190, up: 110, g: 420, spin: 9, ground: 0 });
        T.x = (T.x || 0) + f.x; T.y = (T.y || 0) + f.y; T.r = (T.r || 0) + f.r; T.a = f.a; T.noFlash = true;
        return T;
      };
      ctx.save();
      xform(ctx, 0, -62, dx, bobY, rotB, 1, sy);
      const legsw = Math.sin(TAU * ti / 1.8) * 0.05 * m;
      put(ctx, st, 'legF', mv('legF', { r: -legsw - 0.12 * sw + 0.1 * hurt + 0.1 * guard }));
      put(ctx, st, 'legN', mv('legN', { r: legsw + 0.32 * sw - 0.1 * hurt - 0.06 * tele }));
      const spin = t * (1.6 + 5 * tele + 9 * buff);
      const tsw = Math.sin(TAU * ti / 2.4) * 0.03 * m;
      // arms (rotations about the shoulder and the elbow; + swings the hand forward, toward the heroes)
      const idleArm = Math.sin(TAU * ti / 2.4) * 0.09 * m;
      const nUp = 0.34 + 1.16 * sw + 2.5 * tele + 1.5 * guard + idleArm - 0.3 * hurt - 0.9 * buff;
      const nFo = 0.32 + 1.3 * guard - 0.35 * Math.max(0, sw) - 0.5 * tele - 0.4 * hurt + 0.3 * buff * Math.sin(t * 34);
      const fUp = -0.34 - 0.3 * sw + 1.2 * tele + 1.6 * guard - idleArm * 0.8 + 0.3 * hurt + 0.9 * buff;
      const fFo = -0.3 - 1.3 * guard + 0.2 * tele - 0.3 * buff * Math.sin(t * 34);
      const ext = 15 * Math.pow(Math.max(0, sw), 2);
      put(ctx, st, 'torso', mv('torso', {
        r: tsw + 0.04 * hurt - 0.03 * sw,
        pre(c) {
          put(c, st, 'armFU', mv('armFU', { r: fUp, kids(cc) { put(cc, st, 'armFF', mv('armFF', { r: fFo })); } }));
          // the big wind-up key on its back, seen face-on: two wings turning about the hub
          c.save(); c.translate(38, -100); c.rotate(spin * 0.5);
          [1, -1].forEach((sg) => {
            c.save(); c.translate(sg * 10, 0);
            c.beginPath(); c.ellipse(0, 0, 10.5, 6.6, 0, 0, TAU); c.fillStyle = KW.gold; c.fill(); c.lineWidth = 2.5; c.strokeStyle = pal.ink; c.stroke();
            c.beginPath(); c.ellipse(0, 0, 4.6, 2.5, 0, 0, TAU); c.fillStyle = '#5a3a12'; c.fill();
            c.beginPath(); c.ellipse(-3, -3.2, 4, 1.4, 0, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.65)'; c.fill();
            c.restore();
          });
          c.beginPath(); c.arc(0, 0, 4.8, 0, TAU); c.fillStyle = '#e0a83a'; c.fill(); c.lineWidth = 2.2; c.stroke();
          c.restore();
        },
        kids(c) {
          // the mechanism behind the chest window
          c.save();
          c.beginPath(); c.arc(-2, -100, 12, 0, TAU); c.clip();
          tk.glow(c, -2, -100, 20, hot > 0.4 ? '#ffd060' : KW.cyan, 0.85);
          put(c, st, 'gear', { x: -8, y: -104, r: spin });
          put(c, st, 'gear', { x: 6, y: -97, r: -spin * 1.3, sx: 0.8, sy: 0.8 });
          c.restore();
          tk.glow(c, -2, -100, 32, hot > 0.4 ? '#ffd060' : KW.cyan, cA(0.28 + 0.4 * hot));
          put(c, st, 'head', mv('head', {
            r: 0.05 * Math.sin(TAU * tick(4) / 3.1) * m + 0.22 * hurt - 0.05 * sw + 0.05 * tele * Math.sin(t * 40),
            y: -2 * tele,
            kids(cc) {
              const open = blink(t, 'karakuri') < 0.6 ? 0.06 : 1;
              const look = [Math.round(Math.sin(t * 0.9) * 2) / 2 - 0.7 * Math.max(0, sw), 0];
              const iris = hot > 0.4 ? ['#ffb020', '#fff0a0'] : ['#1ec6e8', '#b8fbff'], gl = hot > 0.4 ? '#ffd060' : KW.cyan;
              [-14, 10].forEach((ex) => eyeLive(cc, ex, -150, 8.2, 9.4, { open: open * (1 - 0.5 * hurt), iris, sclera: '#0b2233', look, glow: gl, glowK: 0.55 + 0.3 * hot, lw: 2.6, pupil: 'dot', pupilColor: '#0b2233', irisK: 0.95 }));
              if (st.wound > 0.3) tk.inkPath(cc, [[6, -176], [1, -166], [8, -159], [3, -150]], { w: 2, alpha: 0.85 * st.wound, taper: 0.2 });
            },
          }));
        },
      }));
      put(ctx, st, 'armNU', mv('armNU', {
        r: nUp,
        kids(c) {
          if (ext > 2) tk.inkPath(c, [[-28, -86], [-22, -84 + ext * 0.3], [-33, -80 + ext * 0.5], [-23, -76 + ext * 0.7], [-32, -72 + ext]], { w: 2.4, color: '#d8c8b8', taper: 0.05, pressure: 'flat', wobble: 0 });
          put(c, st, 'armNF', mv('armNF', {
            r: nFo, y: ext,
            kids(cc) {
              if (tele > 0.25) tk.glow(cc, -34, -52, 26, '#ffd060', 0.5 * tele);
              if (E0.hit > 0.05) { tk.sparkle(cc, -36, -52, 22 * E0.hit + 6, { color: '#ffffff', rot: 0.5, glow: 0.3 }); tk.sparkle(cc, -36, -52, 14 * E0.hit + 4, { color: '#ffd060', rot: 0.5 + PI / 4, glow: 0 }); }
            },
          }));
        },
      }));
      ctx.restore();
      if (tele > 0.05 || buff > 0.05) puffs(ctx, dx - 6, -150 + bobY, t, 4, 7, { col: '#e8f6ff', rise: 34, spread: 10, size: 4.5, alpha: 0.45 * Math.max(tele, buff) });
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // NOPPERABO (normal, m): a faceless ghost in a straw travelling hat. A smooth blank egg of a face that glows like a moon and ripples like water;
  // the face only opens (two dark holes and a smile of white light) when it strikes. Floats over a wispy robe. Accent: the mint-white face glow.
  // ---------------------------------------------------------------------------------------------------------------
  const NW = { robe: '#c9c5f2', robeF: '#9f9ad6', robeD: '#5a54a8', ind: '#2a2160', face: '#f0f8f2', mint: '#b8fff0', straw: '#dcb878', strawD: '#8a6a3a', verm: '#d8402e' };
  function nopSleeve(S, dir, far) {
    const x = (v) => v * dir, base = far ? NW.robeF : NW.robe;
    const spine = [[x(30), -96], [x(42), -80], [x(46), -58], [x(42), -36]];
    S.rib(spine, base, { wMax: 30, w0: 22, w1: 24, profile: (u) => 0.62 + 0.46 * Math.pow(u, 1.5), shadow: true, halftone: { d: 5, alpha: 0.28 }, rim: far ? null : NW.mint, gloss: false });
    S.line([[x(34), -84], [x(44), -66], [x(44), -46]], { w: 1.5, color: NW.robeD, alpha: 0.7, taper: 0.3 });
    // cuff trim and the pale long fingers poking out
    S.line([[x(31), -40], [x(42), -34], [x(53), -40]], { w: 3, color: NW.ind, taper: 0.1 });
    [[-9, 20], [-3, 24], [4, 22], [10, 16]].forEach((f, i) => {
      S.cel(cap(x(43 + f[0] * 0.3), -34, x(43 + f[0] * 0.9), -34 + f[1], 6.4, 4.2), far ? '#cdd6d4' : NW.face, { depth: 2, line: 2, hi: false, rim: null });
    });
  }
  define('nopperabo', {
    size: 'm', lw: 3, k: 0.9,
    col: { rim: NW.mint },
    bounds: { w: 122, h: 194, head: { x: 0, y: -180 }, body: { x: 0, y: -92 }, feet: { x: 0, y: 0 } },
    die: { box: [-70, -190, 70, -6], nx: 10, ny: 13, from: 'top', order: 0.6, shape: 'ink', kinds: ['ink', 'petal', 'ink'], cols: ['#241a3a', '#b8fff0', '#c9c5f2'], wind: [-6, -34], size: 6 },
    parts: {
      body: {
        box: [-40, -114, 40, -56], pivot: [0, -66],
        draw(S) {
          S.cel([[-22, -105], [-33, -98], [-31, -82], [-24, -66], [0, -61], [24, -66], [31, -82], [33, -98], [22, -105], [0, -109]], NW.robe, { depth: 12, hi: true, halftone: { d: 5, alpha: 0.28 }, rim: NW.mint });
          S.cel({ poly: [[-13, -108], [0, -84], [13, -108], [7, -108], [0, -94], [-7, -108]] }, '#f7f3ff', { depth: 2, line: 2, tension: 0.2, hi: false, rim: null });
          S.line([[-8, -104], [0, -90], [8, -104]], { w: 1.6, color: NW.verm, taper: 0.1 });
          S.cel({ poly: [[-26, -78], [26, -78], [25, -65], [-25, -65]] }, NW.ind, { depth: 3, tension: 0.2, line: 2.6, rim: '#8a80ff' });
          S.line([[-24, -72], [24, -72]], { w: 1.4, color: '#f5c96a', alpha: 0.9, taper: 0.1 });
          S.cel(E(0, -71, 5, 6), '#f5c96a', { depth: 2, line: 1.8, hi: false, rim: null });
        },
      },
      head: {
        box: [-34, -156, 34, -80], pivot: [0, -102],
        draw(S) {
          S.g.translate(0, 6);
          S.cel(E(0, -124, 26, 31, 18), NW.face, { depth: 10, hi: true, hiW: 3, rim: NW.mint, rimW: 2.2, halftone: { d: 5, alpha: 0.16, color: '#8a90c8' }, line: 3.2 });
          // the shade under the hat brim
          S.g.save(); S.clip(E(0, -124, 26, 31, 18));
          S.g.fillStyle = 'rgba(90,84,168,0.5)'; S.g.beginPath(); S.g.ellipse(0, -150, 34, 16, 0, 0, TAU); S.g.fill();
          S.g.restore();
        },
      },
      hat: {
        box: [-62, -200, 62, -106], pivot: [0, -148],
        draw(S) {
          S.g.translate(0, -10);
          S.cel([[-58, -138], [-34, -157], [0, -184], [34, -157], [58, -138], [34, -128], [0, -125], [-34, -128]], NW.straw, {
            depth: 14, hi: true, hiW: 3, rim: '#ffe8a8', halftone: { d: 5, alpha: 0.3 }, line: 3.2,
            decor(gg) {
              for (let i = 0; i < 9; i++) tk.inkPath(gg, [[0, -184], [-58 + i * 14.5, -136]], { w: 1.3, color: NW.strawD, alpha: 0.55, taper: 0.1, wobble: 0.05 });
              for (let j = 1; j < 4; j++) tk.inkPath(gg, [[-58 + j * 6, -136 - j * 9.5], [0, -132 - j * 12], [58 - j * 6, -136 - j * 9.5]], { w: 1.2, color: NW.strawD, alpha: 0.5, taper: 0.1 });
              gg.fillStyle = '#3a2a5a'; gg.fillRect(-60, -142, 120, 5);
            },
          });
          // chin strap cords
          S.line([[-33, -136], [-31, -112], [-28, -92]], { w: 2.2, color: NW.verm, taper: 0.1 });
          S.line([[33, -136], [31, -112], [28, -92]], { w: 2.2, color: NW.verm, taper: 0.1 });
          S.cel(E(-28, -89, 3.4, 4.4), NW.verm, { depth: 1.5, line: 1.6, hi: false, rim: null });
          S.cel(E(28, -89, 3.4, 4.4), NW.verm, { depth: 1.5, line: 1.6, hi: false, rim: null });
        },
      },
    },
    chains: {
      skirt: {
        spine: [[0, -68], [5, -46], [-3, -24], [7, -4]], cuts: [0.3, 0.62], reach: 44,
        draw(S) {
          S.rib([[0, -68], [5, -46], [-3, -24], [7, -4]], NW.robe, { wMax: 58, w0: 50, w1: 3, profile: (u) => 0.9 - 0.85 * Math.pow(u, 1.25), shadow: true, halftone: { d: 5, alpha: 0.26 }, rim: NW.mint, gloss: false });
          for (let i = -2; i <= 2; i++) S.line([[i * 8, -62], [i * 8 + i * 1.5, -40], [i * 3 + 4, -16]], { w: 1.4, color: NW.robeD, alpha: 0.55, taper: 0.3 });
          S.line([[-24, -46], [0, -40], [24, -46]], { w: 2.6, color: NW.ind, alpha: 0.7, taper: 0.2 });
        },
      },
      sleeveN: { spine: [[-30, -96], [-42, -80], [-46, -58], [-42, -36]], cuts: [0.34, 0.68], reach: 40, draw(S) { nopSleeve(S, -1, false); } },
      sleeveF: { spine: [[30, -96], [42, -80], [46, -58], [42, -36]], cuts: [0.34, 0.68], reach: 40, draw(S) { nopSleeve(S, 1, true); } },
      wisp: {
        spine: [[0, 0], [6, -14], [-2, -28], [4, -42]], cuts: [0.4], reach: 12,
        draw(S) { S.rib([[0, 0], [6, -14], [-2, -28], [4, -42]], '#c8fff0', { wMax: 9, w0: 8, w1: 0, line: 1.6, rim: null, shadow: false }); },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die;
      const bob = Math.sin(TAU * t / 2.6) * 5 * m;
      const lift = -18 + bob - 8 * tele - 6 * buff + 10 * die;
      const dx = -sw * 32 + hurt * 20 + tele * 8;
      const rot = 0.03 * m * Math.sin(TAU * t / 3.4) - 0.1 * sw + 0.13 * hurt + 0.05 * tele;
      const face = clamp(Math.max(tele, sw > 0 ? sw : 0, hurt * 0.9, buff * 0.7), 0, 1);
      const sway = (j, ph) => m * 0.16 * Math.sin(TAU * (t / 2.2) - j * 0.8 + ph);
      ctx.save();
      xform(ctx, 0, -66, dx, lift, rot, 1 - 0.05 * hurt, 1 + 0.05 * hurt + 0.04 * tele);
      // the far sleeve, the robe tail, the body
      const fb = [0, 1, 2].map((j) => sway(j, 1.4) + (0.5 * tele - 0.9 * sw * 0.4) * (j === 0 ? 1 : 0.6) + 0.6 * guard * (j ? -0.5 : 1) - 0.25 * hurt);
      putChain(ctx, st, 'sleeveF', fb);
      putChain(ctx, st, 'skirt', [0, 1, 2].map((j) => sway(j, 0) * (0.6 + j * 0.5) + 0.3 * hurt + 0.14 * sw * (j + 1)));
      put(ctx, st, 'body');
      // the head: an egg that glows like a moon
      tk.glow(ctx, 0, -114, 52, NW.mint, cA((0.24 + 0.1 * Math.sin(t * 1.7) * m + 0.4 * face + 0.15 * tele) * (1 - die)));
      put(ctx, st, 'head', {
        r: 0.04 * Math.sin(TAU * t / 3.1) * m + 0.12 * hurt - 0.06 * sw, y: -1 * tele,
        kids(c) {
          // ripples on the blank face, as if it were a still pond
          c.save(); c.beginPath(); c.ellipse(0, -118, 25, 30, 0, 0, TAU); c.clip();
          for (let i = 0; i < 3; i++) {
            const u = (((t * 0.33 + i / 3) % 1) + 1) % 1;
            c.globalAlpha = cA((1 - u) * 0.5 * (1 - face * 0.6));
            c.strokeStyle = '#9fd8cc'; c.lineWidth = 1.4;
            c.beginPath(); c.ellipse(-2 + Math.sin(i * 2) * 3, -116, 4 + u * 26, 5 + u * 32, 0, 0, TAU); c.stroke();
          }
          c.restore();
          if (face > 0.05) {
            // the face opens: two dark holes and a smile of white light
            const a = cA(face * 1.3);
            c.save(); c.globalAlpha = a;
            [-1, 1].forEach((sg) => {
              const ex = sg * 10.5;
              tk.glow(c, ex, -122, 16, '#ffffff', 0.4);
              c.save(); c.translate(ex, -122); c.rotate(sg * 0.32);
              c.beginPath(); c.ellipse(0, 0, 4.2 * (0.6 + 0.4 * face), 10.5 * (0.5 + 0.5 * face), 0, 0, TAU); c.fillStyle = '#1a1240'; c.fill();
              c.lineWidth = 1.8; c.strokeStyle = '#ffffff'; c.stroke();
              c.restore();
            });
            tk.inkPath(c, [[-19, -108], [-11, -100], [0, -96], [11, -100], [19, -108]], { w: 3.6 * (0.5 + face), color: '#ffffff', taper: 0.3, wobble: 0.04, pressure: 'mid' });
            tk.glow(c, 0, -100, 26, '#ffffff', 0.3 * face);
            c.restore();
          }
          put(c, st, 'hat', { r: 0.03 * Math.sin(TAU * t / 2.7 + 1) * m - 0.05 * tele });
        },
      });
      // the near sleeve reaches for you
      const nb = [0, 1, 2].map((j) => sway(j, 0.2) + (-0.55 * tele + 1.15 * Math.max(0, sw) - 0.5 * Math.min(0, sw)) * (j === 0 ? 1 : 0.7) * 1 + 1.3 * guard * (j ? -0.3 : 1) - 0.25 * hurt);
      putChain(ctx, st, 'sleeveN', nb);
      ctx.restore();
      // will-o-wisps drifting round the hem
      for (let i = 0; i < 2; i++) {
        const u = (((t * 0.35 + i * 0.5) % 1) + 1) % 1;
        ctx.save(); ctx.globalAlpha = cA(Math.sin(u * PI) * 0.9 * (1 - die));
        tk.glow(ctx, dx + (i ? 30 : -34) + Math.sin(u * 5 + i) * 6, -20 - u * 70 + lift * 0.5, 9, NW.mint, 0.9);
        ctx.restore();
      }
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // DROWNED SAMURAI (normal, l): a waterlogged blade-master still holding the bridge. Navy armour with rust lacing, a verdigris war mask, a tarnished
  // crescent crest, seaweed and barnacles, a tattered banner on his back, water pouring off him. Iai: a low stance, one hand on the hilt, then a
  // single rising cut. Accent: ghost-fire blue eyes and the cold glow of his blade.
  // ---------------------------------------------------------------------------------------------------------------
  const SW = { navy: '#2a3f7c', navyF: '#202f62', rust: '#c8602a', gold: '#e2b84a', teal: '#3e8a7c', skin: '#8fa8b4', blue: '#8fc8ff', weed: '#2f6a4a', weedL: '#5aa070', iron: '#3a3f5a' };
  function samuraiLeg(S, far) {
    const ox = far ? 52 : 0, nv = far ? SW.navyF : SW.navy, o = { depth: 6, line: 3, hi: !far, rim: far ? null : SW.blue };
    S.cel([[-40 + ox, -100], [-10 + ox, -100], [-8 + ox, -68], [-12 + ox, -64], [-36 + ox, -64], [-42 + ox, -70]], nv, Object.assign({ halftone: { d: 5, alpha: 0.3 }, decor(g) {
      for (let i = 0; i < 4; i++) tk.inkPath(g, [[-44 + ox, -94 + i * 9], [-6 + ox, -94 + i * 9]], { w: 2.2, color: SW.rust, alpha: 0.9, taper: 0.05, wobble: 0.04 });
    } }, o));
    S.cel(E(-24 + ox, -66, 13, 9), far ? '#5a6a90' : '#7a8ab0', { depth: 3, line: 2.6, hi: false, rim: null });
    S.cel(cap(-24 + ox, -62, -27 + ox, -18, 22, 17), far ? '#2c3050' : SW.iron, Object.assign({}, o, { depth: 5 }));
    S.line([[-33 + ox, -50], [-22 + ox, -48]], { w: 2, color: SW.rust, taper: 0.1 });
    S.line([[-32 + ox, -34], [-23 + ox, -33]], { w: 2, color: SW.rust, taper: 0.1 });
    // a barnacle crust on the shin
    [[-30, -44, 3.2], [-25, -38, 2.4], [-33, -28, 2.8]].forEach((b) => S.cel(E(b[0] + ox, b[1], b[2], b[2]), '#d8d0b8', { depth: 1.2, line: 1.4, hi: false, rim: null, shadow: false }));
    S.cel([[-44 + ox, -14], [-6 + ox, -14], [-2 + ox, -6], [-8 + ox, -1], [-40 + ox, -1], [-46 + ox, -6]], far ? '#6a7a86' : SW.skin, { depth: 3, line: 2.8, hi: false, rim: null });
    S.line([[-36 + ox, -8], [-20 + ox, -8]], { w: 1.6, alpha: 0.6, taper: 0.4 });
  }
  function samuraiSode(S, far) {
    const cx = far ? 50 : -50, nv = far ? SW.navyF : SW.navy;
    S.cel([[cx - 20, -186], [cx + 20, -188], [cx + 27, -142], [cx - 25, -137]], nv, {
      depth: 8, line: 3, tension: 0.25, rim: far ? null : SW.blue, hi: !far, halftone: { d: 5, alpha: 0.3 },
      decor(g) {
        for (let i = 0; i < 4; i++) tk.inkPath(g, [[cx - 24, -178 + i * 11], [cx + 26, -179 + i * 11]], { w: 2.4, color: SW.rust, alpha: 0.92, taper: 0.03, wobble: 0.04 });
        for (let i = 0; i < 3; i++) tk.inkPath(g, [[cx - 12 + i * 12, -190], [cx - 10 + i * 12, -136]], { w: 1.2, color: '#0d1430', alpha: 0.5, taper: 0.1 });
        g.fillStyle = SW.gold; g.fillRect(cx - 24, -188, 50, 4);
      },
    });
    [[cx - 12, -152, 3], [cx + 10, -166, 2.4], [cx + 2, -178, 2]].forEach((b) => S.cel(E(b[0], b[1], b[2], b[2]), '#d8d0b8', { depth: 1, line: 1.4, hi: false, rim: null, shadow: false }));
  }
  define('drowned_samurai', {
    size: 'l', lw: 3.4, k: 1,
    col: { rim: SW.blue },
    bounds: { w: 170, h: 315, head: { x: 0, y: -262 }, body: { x: 0, y: -140 }, feet: { x: 0, y: 0 } },
    die: { box: [-90, -270, 90, 4], nx: 11, ny: 14, from: 'top', order: 0.55, shape: 'ink', kinds: ['bubble', 'ink', 'bubble'], cols: ['#8fc8ff', '#2a3f7c', '#b8e0ff'], wind: [0, 10], size: 7 },
    parts: {
      legN: { box: [-52, -104, -4, 4], pivot: [-24, -96], draw(S) { samuraiLeg(S, false); } },
      legF: { box: [0, -104, 52, 4], pivot: [28, -96], draw(S) { samuraiLeg(S, true); } },
      torso: {
        box: [-52, -192, 54, -70], pivot: [0, -98],
        draw(S) {
          S.cel([[-34, -178], [-43, -160], [-41, -130], [-33, -108], [-31, -98], [31, -98], [35, -108], [43, -130], [45, -160], [36, -178], [0, -184]], SW.navy, {
            depth: 14, hi: true, hiW: 3, halftone: { d: 5, alpha: 0.32 }, rim: SW.blue,
            decor(g) {
              for (let i = 0; i < 7; i++) tk.inkPath(g, [[-46, -170 + i * 11], [-2, -167 + i * 11], [46, -170 + i * 11]], { w: 2.6, color: SW.rust, alpha: 0.92, taper: 0.03, wobble: 0.04 });
              for (let i = 0; i < 6; i++) tk.inkPath(g, [[-30 + i * 12, -184], [-30 + i * 12, -98]], { w: 1.2, color: '#0d1430', alpha: 0.45, taper: 0.1 });
              g.fillStyle = 'rgba(58,138,124,0.5)'; g.beginPath(); g.ellipse(20, -120, 16, 10, 0.4, 0, TAU); g.fill();       // verdigris bloom
              g.fillStyle = 'rgba(58,138,124,0.4)'; g.beginPath(); g.ellipse(-22, -160, 9, 6, -0.3, 0, TAU); g.fill();
            },
          });
          S.cel([[-16, -164], [12, -166], [14, -146], [-14, -142]], SW.gold, { depth: 4, line: 2.6, hi: true, rim: null });
          S.line([[-12, -158], [8, -160]], { w: 1.5, color: '#8a6a24', alpha: 0.8, taper: 0.3 });
          S.cel(E(-2, -154, 5.5, 5.5), '#c8602a', { depth: 2, line: 1.8, hi: false, rim: null });
          // kusazuri: the hanging skirt plates
          for (let i = 0; i < 5; i++) {
            const x = -30 + i * 12.4;
            S.cel([[x, -100], [x + 12.4, -100], [x + 11.4, -74 - (i % 2) * 4], [x + 1, -73 - ((i + 1) % 2) * 4]], i % 2 ? SW.navyF : SW.navy, { depth: 4, line: 2.6, tension: 0.2, rim: null, hi: false });
            S.line([[x + 1.5, -91], [x + 11, -91]], { w: 1.8, color: SW.rust, taper: 0.1 });
            S.line([[x + 1.5, -83], [x + 11, -83]], { w: 1.8, color: SW.rust, taper: 0.1 });
          }
          S.cel({ poly: [[-32, -104], [32, -104], [32, -96], [-32, -96]] }, '#5a1a2a', { depth: 2, line: 2.4, tension: 0.2, rim: null });
        },
      },
      sodeN: { box: [-78, -194, -22, -130], pivot: [-46, -170], draw(S) { samuraiSode(S, false); } },
      sodeF: { box: [24, -194, 80, -130], pivot: [46, -170], draw(S) { samuraiSode(S, true); } },
      armN: {
        box: [-78, -176, -14, -100], pivot: [-42, -166],
        draw(S) {
          S.cel(cap(-42, -166, -58, -140, 22, 19), SW.navy, { depth: 6, line: 3, hi: true, rim: SW.blue });
          S.cel(cap(-58, -140, -36, -118, 19, 17), '#3a3f5a', { depth: 5, line: 3, hi: true, rim: SW.blue });
          S.line([[-52, -136], [-42, -124]], { w: 2, color: SW.rust, taper: 0.1 });
          S.cel(E(-33, -112, 10, 9.5), SW.skin, { depth: 3, line: 2.8, hi: false });
          S.line([[-38, -112], [-30, -110]], { w: 1.4, alpha: 0.6, taper: 0.4 });
        },
      },
      armF: {
        box: [6, -176, 74, -100], pivot: [44, -166],
        draw(S) {
          S.cel(cap(44, -166, 56, -138, 21, 18), SW.navyF, { depth: 6, line: 3, rim: null });
          S.cel(cap(56, -138, 40, -116, 18, 16), '#2c3050', { depth: 5, line: 3, rim: null });
          S.cel(E(38, -110, 9.5, 9), '#6a7a86', { depth: 3, line: 2.8, hi: false, rim: null });
        },
      },
      head: {
        box: [-64, -284, 66, -170], pivot: [0, -186],
        draw(S) {
          // back plates (shikoro) and neck
          S.cel([[16, -222], [50, -212], [56, -186], [46, -172], [22, -176], [12, -196]], SW.navyF, { depth: 6, line: 3, hi: false, rim: null, decor(g) { for (let i = 0; i < 3; i++) tk.inkPath(g, [[14, -216 + i * 13], [54, -210 + i * 13]], { w: 2, color: SW.rust, alpha: 0.9, taper: 0.05 }); } });
          S.cel([[-30, -218], [-52, -208], [-58, -186], [-46, -172], [-24, -178], [-16, -198]], SW.navy, { depth: 6, line: 3, hi: false, rim: SW.blue, decor(g) { for (let i = 0; i < 3; i++) tk.inkPath(g, [[-56, -208 + i * 13], [-14, -212 + i * 13]], { w: 2, color: SW.rust, alpha: 0.9, taper: 0.05 }); } });
          S.cel(cap(0, -190, 0, -178, 20, 20), '#1a1a30', { depth: 3, line: 2.6, hi: false, rim: null });
          // the war mask (verdigris), fierce and toothy
          S.cel(E(-2, -206, 28, 27, 18), SW.teal, { depth: 11, line: 3.2, hi: true, hiW: 3, rim: SW.blue, halftone: { d: 5, alpha: 0.3 } });
          S.cel([[-24, -198], [-14, -193], [0, -191], [14, -193], [24, -198], [22, -182], [8, -177], [-8, -177], [-22, -182]], '#2c6a60', { depth: 5, line: 2.8, hi: false, rim: null });
          S.cel({ poly: toothRow(-18, 18, -192, 8, 7, 1.6) }, '#e8e0cc', { depth: 2, line: 1.8, tension: 0.15, hi: false, rim: null });
          S.cel({ poly: toothRow(-14, 14, -180, -7, 5, 1.6) }, '#e8e0cc', { depth: 2, line: 1.8, tension: 0.15, hi: false, rim: null });
          S.line([[-22, -196], [-2, -193], [20, -196]], { w: 2.4, color: '#12302c', taper: 0.2 });
          // moustache and brow ridges
          S.line([[-2, -198], [-14, -197], [-26, -190]], { w: 3, taper: 0.35 });
          S.line([[0, -198], [12, -197], [24, -190]], { w: 3, taper: 0.35 });
          S.cel([[-26, -218], [-10, -212], [-2, -214], [-10, -207], [-26, -208]], '#26584f', { depth: 3, line: 2.4, hi: false, rim: null, shadow: false });
          S.cel([[22, -218], [8, -212], [0, -214], [8, -207], [22, -208]], '#26584f', { depth: 3, line: 2.4, hi: false, rim: null, shadow: false });
          S.cel(E(-14, -211, 7.5, 5.6, 12, 0.25), '#04081a', { line: 2, shadow: false });
          S.cel(E(10, -211, 7.5, 5.6, 12, -0.25), '#04081a', { line: 2, shadow: false });
          // the kabuto bowl and visor
          S.cel([[-32, -218], [-31, -238], [-16, -252], [4, -256], [24, -250], [34, -234], [33, -216], [24, -222], [0, -226], [-24, -222]], SW.navy, {
            depth: 13, line: 3.4, hi: true, hiW: 3, rim: SW.blue, halftone: { d: 5, alpha: 0.32 },
            decor(g) { for (let i = 0; i < 7; i++) tk.inkPath(g, [[0, -258], [-36 + i * 12, -218]], { w: 1.4, color: '#0d1430', alpha: 0.5, taper: 0.1 }); g.fillStyle = SW.gold; g.fillRect(-36, -226, 74, 3.4); },
          });
          for (let i = 0; i < 5; i++) S.cel(E(-24 + i * 12, -229 - Math.abs(i - 2) * 1.5, 2.4, 2.4), SW.gold, { line: 1.4, depth: 0.8, hi: false, rim: null, shadow: false });
          // the crescent crest (maedate), tarnished and barnacled
          const out = tk.arcPts(-2, -248, 34, 30, -2.9, -0.24, 9), inn = tk.arcPts(-2, -238, 24, 20, -0.34, -2.8, 9);
          S.cel(out.concat(inn), SW.gold, { depth: 5, line: 3, hi: true, hiW: 2.4, rim: '#fff0b0', decor(g) { g.fillStyle = 'rgba(62,138,124,0.55)'; g.beginPath(); g.arc(-26, -258, 7, 0, TAU); g.fill(); g.beginPath(); g.arc(20, -270, 5, 0, TAU); g.fill(); } });
          S.cel(E(-2, -252, 5, 5), '#c8602a', { line: 1.8, shadow: false });
        },
      },
      saya: {
        box: [-6, -12, 128, 12], pivot: [0, 0],
        draw(S) {
          S.cel(cap(0, 0, 118, 0, 12, 10), '#1b1735', { depth: 3, line: 2.8, hi: true, hiW: 1.6, rim: SW.blue, tension: 0.5 });
          S.cel(cap(0, 0, 14, 0, 14, 14), SW.gold, { depth: 2, line: 2.2, hi: false, rim: null, tension: 0.5 });
          S.cel(cap(108, 0, 122, 0, 11, 9), SW.gold, { depth: 2, line: 2.2, hi: false, rim: null, tension: 0.5 });
          S.line([[40, -5], [42, 5]], { w: 2.6, color: SW.rust });
          S.line([[70, -5], [72, 5]], { w: 2.6, color: SW.rust });
        },
      },
      blade: {
        box: [-24, -14, 128, 14], pivot: [0, 0],
        draw(S) {
          // handle wrap, guard, curved blade with a hamon line
          S.cel(cap(-22, 0, 2, 0, 9, 9), '#1b1735', { depth: 2, line: 2.4, hi: false, rim: null, tension: 0.5 });
          for (let i = 0; i < 4; i++) S.line([[-19 + i * 6, -4], [-16 + i * 6, 4]], { w: 1.4, color: SW.rust, taper: 0.1 });
          S.cel(E(4, 0, 4, 9, 12), SW.gold, { depth: 2, line: 2.4, hi: false, rim: null });
          S.cel([[6, -3.6], [40, -5.4], [80, -5.4], [112, -3], [126, 1.6, 1], [112, 4.2], [80, 4.6], [40, 4.6], [6, 3.6]], '#e8f2ff', { depth: 3, line: 2.6, hi: false, rim: SW.blue, rimW: 1.6, tension: 0.4, decor(g) { tk.inkPath(g, [[8, 1.5], [50, 0.5], [90, 0.8], [120, 1.4]], { w: 1.3, color: '#7a9ad0', alpha: 0.9, taper: 0.2, wobble: 0.15 }); } });
        },
      },
      pole: {
        box: [30, -330, 44, -150], pivot: [36, -150],
        draw(S) {
          S.cel(cap(36, -150, 38, -320, 5, 4), '#6a4a2a', { depth: 1.6, line: 2.4, hi: false, rim: null, tension: 0.4 });
          S.cel(E(38, -322, 4.5, 4.5), SW.gold, { line: 1.8, hi: false, rim: null });
        },
      },
    },
    chains: {
      flag: {
        spine: [[38, -310], [46, -270], [42, -230], [50, -190]], cuts: [0.25, 0.5, 0.75], reach: 30,
        draw(S) {
          S.rib([[38, -310], [46, -270], [42, -230], [50, -190]], '#39448a', {
            wMax: 34, w0: 32, w1: 22, profile: (u) => 0.9 - 0.25 * u, shadow: true, halftone: { d: 5, alpha: 0.3 }, rim: null, gloss: false, line: 3,
            decor(g) { tk.inkPath(g, [[26, -290], [36, -296], [48, -290], [56, -296]], { w: 2.2, color: '#a8c8ff', alpha: 0.85, taper: 0.2 }); tk.inkPath(g, [[28, -270], [38, -276], [50, -270], [58, -276]], { w: 2.2, color: '#a8c8ff', alpha: 0.85, taper: 0.2 }); tk.inkPath(g, [[30, -240], [42, -244], [52, -238]], { w: 1.8, color: '#a8c8ff', alpha: 0.6, taper: 0.2 }); },
          });
        },
      },
      weedH: {
        spine: [[-26, -214], [-36, -196], [-32, -176], [-40, -158]], cuts: [0.4], reach: 16,
        draw(S) { S.rib([[-26, -214], [-36, -196], [-32, -176], [-40, -158]], SW.weed, { wMax: 11, w0: 9, w1: 1.5, rim: SW.weedL, gloss: true, glossAlpha: 0.4, line: 2.4 }); },
      },
      weedS: {
        spine: [[-62, -150], [-70, -128], [-62, -106], [-72, -84]], cuts: [0.36, 0.7], reach: 18,
        draw(S) { S.rib([[-62, -150], [-70, -128], [-62, -106], [-72, -84]], SW.weed, { wMax: 13, w0: 11, w1: 1.5, rim: SW.weedL, gloss: true, glossAlpha: 0.4, line: 2.4 }); },
      },
      weedW: {
        spine: [[8, -96], [12, -78], [4, -60], [14, -42]], cuts: [0.4], reach: 16,
        draw(S) { S.rib([[8, -96], [12, -78], [4, -60], [14, -42]], SW.weed, { wMax: 12, w0: 10, w1: 1.5, rim: SW.weedL, gloss: true, glossAlpha: 0.4, line: 2.4 }); },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die;
      const br = Math.sin(TAU * t / 3.0) * m;
      const crouch = 7 * tele + 3 * guard + 5 * Math.max(0, -sw) * 2 + 46 * die;
      const dx = -sw * 42 + hurt * 24 + tele * 10;
      const rot = -0.07 * sw + 0.1 * hurt + 0.05 * tele - 0.03 * br - 0.3 * die;
      const wSw = (j, ph) => m * 0.2 * Math.sin(TAU * (t / 2.4) - j * 0.8 + ph) + 0.35 * hurt + 0.12 * sw * (j + 1);
      // the sword: drawn during the strike
      const p = E0.pose === 'attack' ? E0.p : 0;
      const drawn = E0.pose === 'attack' ? sm((p - 0.26) / 0.08) * (1 - sm((p - 0.84) / 0.16)) : 0;
      const th = E0.pose === 'attack' ? lerp(0.4, -3.45, ease.inOutQuad(clamp((p - 0.28) / 0.28, 0, 1))) : 0.4;   // blade world angle: behind, over the top, to the front
      ctx.save();
      xform(ctx, 0, -98, dx, crouch, rot, 1, 1 - 0.02 * br - 0.03 * hurt - 0.3 * die);
      // banner behind him
      put(ctx, st, 'pole', { r: 0.02 * br + 0.03 * sw });
      putChain(ctx, st, 'flag', [0, 1, 2, 3].map((j) => m * 0.11 * Math.sin(TAU * (t / 1.8) - j * 0.9) - 0.05 * sw * (j + 1) - 0.06 * hurt * (j + 1)));
      put(ctx, st, 'armF', { r: -0.1 + 0.25 * sw + 0.6 * tele - 0.3 * br * 0.2 + 1.2 * guard, x: 0, y: 0 });
      put(ctx, st, 'legF', { r: -0.06 * sw + 0.05 * hurt });
      // scabbard on the hip, swinging back when the blade is drawn
      put(ctx, st, 'saya', { x: -30, y: -112, r: -0.28 + 0.5 * drawn - 0.05 * br + 0.15 * tele });
      put(ctx, st, 'torso', {
        r: 0.02 * br,
        kids(c) {
          putChain(c, st, 'weedW', [0, 1].map((j) => wSw(j, 1)));
          put(c, st, 'head', {
            r: 0.02 * br - 0.06 * sw + 0.1 * hurt + 0.05 * tele, y: 2 * tele,
            pre(cc) { putChain(cc, st, 'weedH', [0, 1].map((j) => wSw(j, 2))); },
            kids(cc) {
              const open = blink(t, 'samurai', 4.6) * (1 - 0.4 * hurt);
              const hot = clamp(tele + Math.max(0, sw) + buff, 0, 1);
              [[-14, -211, 1], [10, -211, -1]].forEach((e) => eyeLive(cc, e[0], e[1], 6.4 + 1.6 * hot, 4.6 + 1.2 * hot, { open, iris: ['#7fb8ff', '#eaf6ff'], sclera: '#dff0ff', pupil: 'none', glow: '#7fb8ff', glowK: 0.7 + 0.3 * hot, glowR: 3, lw: 1.8, rot: e[2] * 0.25 * (1 + hot), catch: false }));
              if (hot > 0.1) tk.glow(cc, -2, -210, 40 + 20 * hot, '#7fb8ff', 0.3 * hot);
              // ghost-fire licking up from the crest
              flameLive(cc, -2, -262, 5, 16 + 8 * hot, t, 4, { c0: '#4a5cff', c1: '#7fa8ff', c2: '#e8f4ff', glow: '#7fa8ff', glowK: 0.4, line: 'rgba(20,20,80,0.7)' });
            },
          });
        },
      });
      putChain(ctx, st, 'weedS', [0, 1, 2].map((j) => wSw(j, 0.4)));
      put(ctx, st, 'legN', { r: 0.06 * sw + 0.34 * Math.max(0, sw) * 0 - 0.05 * hurt - 0.05 * tele });
      // near arm: hand on the hilt; whips up and over for the cut
      const nArm = 0.35 + 0.3 * tele + (E0.pose === 'attack' ? lerp(0, -0.2, sm(p / 0.3)) + 1.5 * ease.outQuad(clamp((p - 0.3) / 0.22, 0, 1)) - 1.5 * sm((p - 0.62) / 0.38) * 0.9 : 0) + 1.3 * guard - 0.4 * hurt;
      put(ctx, st, 'armN', {
        r: nArm,
        kids(c) {
          if (drawn > 0.02) {
            c.save(); c.globalAlpha *= drawn;
            const rel = th - nArm - rot;
            // the cut: a crescent of cold light behind the blade
            if (E0.pose === 'attack' && p > 0.3 && p < 0.72) {
              const a0 = lerp(0.4, -3.45, ease.inOutQuad(clamp((p - 0.28 - 0.12) / 0.28, 0, 1))) - nArm - rot, a1 = rel;
              c.save(); c.translate(-33, -112);
              c.beginPath(); c.arc(0, 0, 122, a0, a1, a1 < a0); c.arc(0, 0, 50, a1, a0, a1 >= a0); c.closePath();
              const gg = c.createRadialGradient(0, 0, 50, 0, 0, 122); gg.addColorStop(0, 'rgba(159,208,255,0.05)'); gg.addColorStop(1, 'rgba(230,246,255,0.7)');
              c.fillStyle = gg; c.fill(); c.restore();
            }
            put(c, st, 'blade', { x: -33, y: -112, r: rel });
            c.restore();
          }
          if (tele > 0.3 && drawn < 0.02) tk.glow(c, -33, -112, 26, '#7fb8ff', 0.6 * tele);
        },
      });
      put(ctx, st, 'sodeF', { r: 0.03 * br });
      put(ctx, st, 'sodeN', { r: -0.03 * br - 0.1 * Math.max(0, sw) + 0.05 * hurt });
      ctx.restore();
      // water: a wet sheen pool and drips
      ctx.save();
      const wet = 1 - die;
      ctx.translate(dx * 0.5, -3); ctx.scale(1, 0.18);
      ctx.beginPath(); ctx.arc(0, 0, 84, 0, TAU); ctx.fillStyle = 'rgba(40,80,150,0.32)'; ctx.globalAlpha = cA(wet); ctx.fill();
      ctx.restore();
      ripples(ctx, dx * 0.5, -3, t, 74, '#8fc8ff', 3);
      for (let i = 0; i < 6; i++) {
        const per = 1.2 + 0.5 * hv('sam', 'd' + i), u = (((t + hv('sam', 'o' + i) * per) % per) + per) % per / per;
        const sx = [-60, -30, 10, 46, -46, 32][i], sy = [-108, -78, -74, -110, -150, -150][i];
        ctx.save(); ctx.globalAlpha = cA(Math.min(1, u * 5) * (1 - u) * 0.95 * wet);
        const dy = u * u * (-sy + 4) * 0.98;
        ctx.beginPath(); ctx.ellipse(dx + sx, sy + dy + lift0(crouch), 2, 3.4, 0, 0, TAU); ctx.fillStyle = '#b8e0ff'; ctx.fill(); ctx.restore();
      }
    },
  });
  function lift0(c) { return c * 0.5; }

  // ---------------------------------------------------------------------------------------------------------------
  // KOI SPIRIT (normal, m): the canal's oldest carp, caught mid-leap in a great arc above a swirl of water, glowing like a coin in a wishing well.
  // A white body with a vermilion head spot (tancho) and sumi patches, coin scales, streaming veil fins. Accent: gold sheen and jade eyes.
  // ---------------------------------------------------------------------------------------------------------------
  const KC = { white: '#fdf1dc', verm: '#e8502e', gold: '#f5c96a', jade: '#7fffd8', water: '#8fd0ff', fin: '#ffe4d4' };
  const KSPINE = [[-46, -134], [-30, -147], [-6, -148], [16, -130], [28, -100], [28, -68], [19, -40]];
  define('koi_spirit', {
    size: 'm', lw: 3, k: 1,
    col: { rim: '#ffe6a0' },
    bounds: { w: 132, h: 187, head: { x: -30, y: -164 }, body: { x: 0, y: -100 }, feet: { x: 0, y: 0 } },
    die: { box: [-70, -180, 60, 12], nx: 10, ny: 12, from: 'bottom', order: 0.7, shape: 'ink', kinds: ['coin', 'bubble', 'coin', 'petal'], cols: ['#f5c96a', '#ffffff', '#ffe08a', '#ff9a7a'], wind: [-6, -30], size: 7 },
    parts: {
      body: {
        box: [-62, -186, 50, -30], pivot: [19, -40],
        draw(S) {
          S.rib(KSPINE, KC.white, {
            wMax: 54, w0: 28, w1: 12, cap: 'round', profile: (u) => (u < 0.12 ? lerp(0.52, 0.86, u / 0.12) : u < 0.4 ? lerp(0.86, 1, (u - 0.12) / 0.28) : lerp(1, 0.24, Math.pow((u - 0.4) / 0.6, 0.9))),
            gloss: true, glossAlpha: 0.5, rim: '#ffe6a0', rimW: 2, shadow: '#eec8b8', halftone: { d: 5, alpha: 0.2, color: '#c08a80' }, line: 3.2, shadowW: 0.42,
            decor(gg) {
              for (let r = 0; r < 9; r++) for (let c = 0; c < 8; c++) {
                const x = -34 + c * 12 + (r % 2) * 6, y = -166 + r * 11;
                tk.inkPath(gg, [[x - 5, y - 2], [x, y + 4], [x + 5, y - 2]], { w: 1.1, color: '#a88a5a', alpha: 0.4, taper: 0.2, wobble: 0 });
              }
              // vermilion patches following the arc of the back, the tancho on the head, sumi blotches
              tk.inkPath(gg, [[-4, -160], [16, -146], [30, -116], [32, -86]], { w: 20, color: KC.verm, taper: 0.1, pressure: 'mid', wobble: 0.12, seed: 3 });
              gg.fillStyle = KC.verm; gg.beginPath(); gg.ellipse(-24, -150, 9.5, 10, 0.3, 0, TAU); gg.fill();
              gg.beginPath(); gg.ellipse(24, -58, 7, 9, 0.3, 0, TAU); gg.fill();
              gg.fillStyle = 'rgba(36,26,58,0.85)';
              gg.beginPath(); gg.ellipse(6, -124, 5, 6.4, 0.5, 0, TAU); gg.fill();
              gg.beginPath(); gg.ellipse(-8, -132, 3.6, 4.6, 0.2, 0, TAU); gg.fill();
              gg.beginPath(); gg.ellipse(20, -78, 3.6, 4.6, 0, 0, TAU); gg.fill();
              gg.fillStyle = 'rgba(245,201,106,0.6)';
              for (let i = 0; i < 8; i++) { gg.beginPath(); gg.arc(-26 + (i * 17) % 54, -150 + ((i * 23) % 80), 4.2, 0, PI); gg.fill(); }
            },
          });
          // gill cover, cheek, and the round lips
          S.line([[-18, -152], [-12, -138], [-16, -124]], { w: 2.2, alpha: 0.85, taper: 0.3 });
          S.ell(-30, -132, 5, 3, '#ff9a7a', { line: 0, shadow: false, rim: null });
          S.cel(E(-48, -134, 6.2, 5.4, 10, -0.5), '#f07a5a', { depth: 2, line: 2.2, hi: false, rim: null });
          S.cel(E(-49, -134, 2.4, 2, 8, -0.5), '#7a1638', { line: 0, shadow: false, rim: null });
          // whiskers (barbels)
          S.line([[-50, -138], [-62, -146], [-70, -138], [-72, -126]], { w: 2.4, color: '#f0d8a8', taper: 0.1, wobble: 0 });
          S.line([[-50, -130], [-60, -122], [-64, -108]], { w: 2.4, color: '#f0d8a8', taper: 0.1, wobble: 0 });
        },
      },
      eyeRing: { box: [-8, -8, 8, 8], pivot: [0, 0], draw(S) { S.cel(E(0, 0, 8.2, 8.6, 14), KC.gold, { depth: 2, line: 2.4, hi: false, rim: null }); } },
      dorsal: {
        box: [-20, -190, 44, -110], pivot: [8, -148],
        draw(S) {
          S.cel([[-8, -149], [-2, -172], [12, -186], [22, -178], [32, -160], [34, -138], [18, -132]], KC.fin, {
            depth: 8, line: 3, hi: false, rim: '#ffe6a0', halftone: { d: 5, alpha: 0.2 },
            decor(g) { g.fillStyle = 'rgba(232,80,46,0.8)'; g.beginPath(); g.moveTo(-8, -190); g.lineTo(44, -190); g.lineTo(44, -160); g.lineTo(-8, -170); g.fill(); for (let i = 0; i < 5; i++) tk.inkPath(g, [[6 + i * 5, -142], [-2 + i * 8, -186]], { w: 1.2, color: '#a84a3a', alpha: 0.5, taper: 0.3 }); },
          });
        },
      },
      fin: {
        box: [-50, -130, -4, -60], pivot: [-12, -122],
        draw(S) {
          S.cel([[-12, -123], [-26, -112], [-44, -94], [-44, -78], [-30, -82], [-18, -96]], KC.fin, {
            depth: 6, line: 3, hi: false, rim: '#ffe6a0',
            decor(g) { g.fillStyle = 'rgba(232,80,46,0.8)'; g.beginPath(); g.ellipse(-42, -80, 14, 12, 0.6, 0, TAU); g.fill(); for (let i = 0; i < 4; i++) tk.inkPath(g, [[-14 - i * 2, -118 + i * 2], [-46 + i * 3, -80 - i * 5]], { w: 1.2, color: '#a84a3a', alpha: 0.5, taper: 0.3 }); },
          });
        },
      },
      tailB: {
        box: [-34, -46, 66, 22], pivot: [19, -40],
        draw(S) {
          S.g.globalAlpha = 0.7;
          S.cel([[20, -42], [8, -22], [-8, -2], [-24, 14], [-4, 16], [14, 8], [20, 0], [26, 8], [46, 16], [64, 10], [50, -6], [36, -24], [24, -42]], '#ffeede', { depth: 8, line: 2.4, hi: false, rim: '#ffe6a0', shadow: '#f0b8a0', tension: 0.9 });
          S.g.globalAlpha = 1;
        },
      },
      tailA: {
        box: [-20, -46, 60, 16], pivot: [19, -40],
        draw(S) {
          S.cel([[19, -42], [10, -22], [-2, -6], [-14, 8], [2, 12], [14, 6], [19, -2], [24, 6], [38, 12], [54, 6], [44, -8], [34, -24], [26, -42]], KC.fin, {
            depth: 9, line: 3, hi: false, rim: '#ffe6a0', halftone: { d: 5, alpha: 0.2 }, tension: 0.9,
            decor(g) { g.fillStyle = 'rgba(232,80,46,0.85)'; g.beginPath(); g.moveTo(-30, -6); g.lineTo(70, -6); g.lineTo(70, 30); g.lineTo(-30, 30); g.fill(); for (let i = -3; i <= 3; i++) tk.inkPath(g, [[19 + i, -40], [19 + i * 11, 10]], { w: 1.3, color: '#a84a3a', alpha: 0.55, taper: 0.2, wobble: 0.1 }); },
          });
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die;
      const lift = -Math.sin(TAU * t / 2.4) * 4 * m - 4 * tele - 10 * buff + 6 * die;
      const dx = -sw * 26 + hurt * 18;
      const rot = 0.05 * m * Math.sin(TAU * t / 2.4 + 0.6) - 0.24 * sw + 0.2 * hurt - 0.08 * tele + 0.06 * buff;
      const sq = 1 - 0.08 * guard + 0.04 * buff;
      const wag = (ph, k) => m * 0.26 * Math.sin(TAU * (t / 1.1) + ph) * k + (E0.pose === 'attack' ? 0.7 * sw : 0) + tele * 0.2 * Math.sin(t * 30) + hurt * 0.4 + buff * 0.2 * Math.sin(t * 9 + ph);
      // water swirl under the leap
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const u = (((t * 0.4 + i / 3) % 1) + 1) % 1;
        ctx.globalAlpha = cA((1 - u) * 0.55 * (1 - die));
        ctx.strokeStyle = i === 1 ? '#ffe6a0' : KC.water; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(6 + dx * 0.3, -4, 24 + u * 56, (24 + u * 56) * 0.2, 0, 0, TAU); ctx.stroke();
      }
      ctx.restore();
      ctx.save();
      xform(ctx, 19, -40, dx, lift, rot, sq, 1 / sq);
      put(ctx, st, 'tailB', { r: wag(-0.9, 1.25), a: 0.85 });
      put(ctx, st, 'dorsal', { r: 0.05 * Math.sin(TAU * t / 1.4) * m + 0.1 * sw });
      put(ctx, st, 'tailA', { r: wag(0, 1) });
      put(ctx, st, 'body', {
        kids(c) {
          const open = blink(t, 'koi', 5.2) * (1 - 0.6 * hurt) * (1 - 0.7 * guard);
          put(c, st, 'eyeRing', { x: -32, y: -140 });
          eyeLive(c, -32, -140, 6.8, 7.4, { open, iris: ['#12a878', '#c8ffe8'], sclera: '#fff6d0', pupil: 'round', glow: KC.jade, glowK: 0.6 + 0.3 * buff, glowR: 3, lw: 2, look: [-0.5 - 0.4 * Math.max(0, sw), 0.1], irisK: 0.85 });
          const u = (((t * 0.28) % 1) + 1) % 1;
          c.save(); c.globalAlpha = 0.28 + 0.4 * buff;
          tk.glow(c, -30 + u * 60, -140 + Math.sin(u * PI) * 20 + u * 60, 26, '#ffe6a0', 0.7);
          c.restore();
        },
      });
      put(ctx, st, 'fin', { r: m * 0.22 * Math.sin(TAU * t / 1.3) + 0.4 * sw + 0.5 * guard + 0.3 * buff + 0.2 * hurt });
      ctx.restore();
      // the splash of a strike: droplets flung toward the heroes
      if (E0.pose === 'attack' && E0.p > 0.38) {
        const a = (E0.p - 0.38) / 0.62;
        ctx.save();
        for (let i = 0; i < 16; i++) {
          const v = hv('koi', 'sp' + i), ang = -2.9 + v * 1.6, sp = 90 + 110 * hv('koi', 'ss' + i), px = -30 + Math.cos(ang) * sp * a, py = -90 + Math.sin(ang) * sp * a + 130 * a * a;
          ctx.globalAlpha = cA((1 - a) * 1.2); ctx.fillStyle = i % 3 ? '#b8e0ff' : '#ffffff';
          ctx.beginPath(); ctx.ellipse(px, py, 2.6, 3.8, ang, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
      // block: a water bubble closes round it; heal (buff): coins and light rise
      if (guard > 0.05) {
        ctx.save(); ctx.globalAlpha = cA(guard * 0.9);
        ctx.beginPath(); ctx.ellipse(-4, -92, 76, 90, 0, 0, TAU); ctx.fillStyle = 'rgba(143,208,255,0.16)'; ctx.fill();
        ctx.lineWidth = 2.6; ctx.strokeStyle = '#d8f0ff'; ctx.stroke();
        ctx.beginPath(); ctx.ellipse(-36, -128, 10, 22, 0.5, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
        ctx.restore();
      }
      if (buff > 0.02) { motes(ctx, 0, -20, t, 10, 5, { col: '#ffe08a', rise: 90, spread: 50, life: 1, size: 3.2, alpha: buff }); tk.glow(ctx, 0, -90, 100, '#ffe6a0', 0.34 * buff); }
      motes(ctx, 0, -30, t, 4, 21, { col: '#fff0c0', rise: 60, spread: 44, life: 2.2, size: 2, alpha: 0.7 * (1 - die) });
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // TSUKUMOGAMI (normal, m): an old shamisen that turned a hundred, grew skinny legs and arms, and keeps score. A patched cat-skin drum with one glaring
  // eye and a jagged grin, a long neck, three humming strings, a battered plectrum. Every strum throws rings of sound. Accent: sour green eye, violet sound.
  // ---------------------------------------------------------------------------------------------------------------
  const TS = { wood: '#7a3428', woodD: '#3e1e18', skin: '#efe0bc', skinD: '#c8b088', gold: '#f5c96a', ivory: '#f0e8d0', straw: '#d8b878', eye: '#d8ff4a', snd: '#c88cff', verm: '#d8402e' };
  define('tsukumogami', {
    size: 'm', lw: 3, k: 1.0,
    col: { rim: '#f0b890' },
    bounds: { w: 124, h: 200, head: { x: 0, y: -196 }, body: { x: 0, y: -88 }, feet: { x: 0, y: 0 } },
    die: { box: [-70, -200, 70, 4], nx: 9, ny: 14, from: 'out', order: 0.5, shape: 'paper', kinds: ['scrap', 'thread', 'ink', 'scrap'], cols: ['#7a3428', '#e8e4ff', '#c88cff', '#efe0bc'], wind: [-8, -30], size: 7 },
    parts: {
      neck: {
        box: [-18, -200, 18, -96], pivot: [0, -104],
        draw(S) {
          S.cel(cap(0, -104, 0, -166, 15, 11.5), TS.woodD, { depth: 4, line: 2.8, hi: true, hiW: 1.6, rim: '#f0b890', tension: 0.4 });
          S.cel({ poly: [[-3.6, -106], [3.6, -106], [3, -166], [-3, -166]] }, '#2a140e', { depth: 0, line: 0, tension: 0, shadow: false });
          [-122, -136, -150].forEach((y) => S.line([[-6.5, y], [6.5, y]], { w: 2, color: TS.gold, taper: 0.1, pressure: 'flat' }));
          // headstock, bent back, with three pegs
          S.cel([[-7, -166], [7, -166], [10, -180], [6, -192], [-4, -196], [-9, -188], [-10, -176]], TS.woodD, { depth: 4, line: 2.8, hi: false, rim: '#f0b890' });
          [[-16, -174], [15, -180], [-16, -186]].forEach((p, i) => { S.cel(E(p[0], p[1], 5.5, 3.6, 8, 0.3 * (i - 1)), TS.gold, { depth: 1.5, line: 2, hi: false, rim: null }); S.line([[p[0] * 0.4, p[1]], [p[0], p[1]]], { w: 2.4, color: '#8a6a24', taper: 0.05, pressure: 'flat' }); });
        },
      },
      drum: {
        box: [-42, -112, 42, -40], pivot: [0, -72],
        draw(S) {
          S.cel(tk.rrectPts(-34, -106, 68, 64, 14), TS.wood, { depth: 12, line: 3.2, hi: true, hiW: 3, rim: '#f0b890', halftone: { d: 5, alpha: 0.3 }, decor(g) { for (let i = 0; i < 5; i++) tk.inkPath(g, [[-30 + i * 14, -104], [-28 + i * 14, -44]], { w: 1.3, color: '#3e1e18', alpha: 0.4, taper: 0.1, wobble: 0.1, seed: i }); } });
          // the cat-skin face, patched and stitched
          S.cel(tk.rrectPts(-26, -98, 52, 50, 10), TS.skin, { depth: 8, line: 2.8, hi: false, rim: null });
          S.cel(tk.rrectPts(-24, -60, 22, 12, 3), '#e2cea0', { depth: 2, line: 1.8, hi: false, rim: null, shadow: false });
          S.cel(tk.rrectPts(10, -96, 15, 15, 3), '#d8c090', { depth: 2, line: 1.8, hi: false, rim: null, shadow: false });
          S.line([[-24, -54], [-4, -54]], { w: 1.2, taper: 0.05, pressure: 'flat', wobble: 0 });
          S.line([[12, -94], [23, -94]], { w: 1.2, taper: 0.05, pressure: 'flat', wobble: 0 });
          for (let i = 0; i < 5; i++) S.line([[-22 + i * 4.4, -56], [-22 + i * 4.4, -52]], { w: 1.1, taper: 0.05, pressure: 'flat', wobble: 0 });
          // the bridge and a tailpiece
          S.cel(tk.rrectPts(-9, -101, 18, 5, 2), TS.ivory, { depth: 1, line: 1.8, hi: false, rim: null, shadow: false });
          S.cel(E(0, -43, 9, 3.4), TS.gold, { depth: 1, line: 1.8, hi: false, rim: null, shadow: false });
        },
      },
      legN: {
        box: [-34, -50, -2, 6], pivot: [-16, -44],
        draw(S) {
          S.cel(cap(-16, -44, -25, -26, 8.5, 7.5), TS.woodD, { depth: 2, line: 2.4, hi: false, rim: '#f0b890' });
          S.cel(E(-25, -26, 4.6, 4.6, 8), TS.gold, { depth: 1, line: 1.8, hi: false, rim: null, shadow: false });
          S.cel(cap(-25, -26, -20, -8, 7.5, 7), TS.woodD, { depth: 2, line: 2.4, hi: false, rim: '#f0b890' });
          S.cel(E(-22, -3, 14, 5.2), TS.straw, { depth: 2.5, line: 2.4, hi: false, rim: null });
          S.line([[-30, -4], [-22, -9], [-14, -4]], { w: 2, color: TS.verm, taper: 0.1 });
        },
      },
      legF: {
        box: [-2, -50, 34, 6], pivot: [16, -44],
        draw(S) {
          S.cel(cap(16, -44, 22, -26, 8.5, 7.5), '#2a140e', { depth: 2, line: 2.4, hi: false, rim: null });
          S.cel(E(22, -26, 4.6, 4.6, 8), '#c8a24a', { depth: 1, line: 1.8, hi: false, rim: null, shadow: false });
          S.cel(cap(22, -26, 20, -8, 7.5, 7), '#2a140e', { depth: 2, line: 2.4, hi: false, rim: null });
          S.cel(E(21, -3, 14, 5.2), '#b89858', { depth: 2.5, line: 2.4, hi: false, rim: null });
        },
      },
      armF: {
        box: [10, -112, 64, -60], pivot: [30, -88],
        draw(S) {
          S.cel(cap(30, -88, 44, -78, 6.5, 6), '#2a140e', { depth: 1.5, line: 2.2, hi: false, rim: null });
          S.cel(cap(44, -78, 50, -64, 6, 5.5), '#2a140e', { depth: 1.5, line: 2.2, hi: false, rim: null });
          S.cel(E(51, -61, 5.4, 5), TS.skinD, { depth: 1.5, line: 2, hi: false, rim: null });
        },
      },
      armN: {
        box: [-74, -140, -22, -76], pivot: [-32, -88],
        draw(S) {
          S.cel(cap(-32, -88, -48, -100, 7, 6.5), TS.woodD, { depth: 1.5, line: 2.4, hi: false, rim: '#f0b890' });
          S.cel(E(-48, -100, 4.4, 4.4, 8), TS.gold, { depth: 1, line: 1.8, hi: false, rim: null, shadow: false });
          S.cel(cap(-48, -100, -58, -118, 6.5, 6), TS.woodD, { depth: 1.5, line: 2.4, hi: false, rim: '#f0b890' });
          S.cel(E(-59, -122, 6, 5.6), TS.skinD, { depth: 1.8, line: 2.2, hi: false, rim: null });
          [-1, 0, 1].forEach((k) => S.line([[-62 + k * 2, -124], [-66 + k * 3.4, -128 - Math.abs(k)]], { w: 1.8, taper: 0.2 }));
        },
      },
      bachi: {
        box: [-34, -60, 34, 6], pivot: [0, 0],
        draw(S) {
          // the big ivory plectrum: a fan on a handle
          S.cel([[-4, 0], [-4, -14], [-24, -34], [-28, -50], [-10, -60], [10, -60], [28, -50], [24, -34], [4, -14], [4, 0]], TS.ivory, { depth: 7, line: 3, hi: true, hiW: 2.6, rim: '#ffffff', halftone: { d: 5, alpha: 0.22, color: '#8a7a5a' }, tension: 0.7 });
          S.line([[-20, -46], [0, -52], [20, -46]], { w: 1.5, color: '#8a7a5a', alpha: 0.8, taper: 0.3 });
          S.line([[-14, -34], [0, -38], [14, -34]], { w: 1.4, color: '#8a7a5a', alpha: 0.8, taper: 0.3 });
          S.cel(cap(0, 4, 0, -12, 8, 8), TS.wood, { depth: 2, line: 2.4, hi: false, rim: null });
          S.line([[-5, 0], [5, -3]], { w: 2.2, color: TS.verm });
        },
      },
    },
    chains: {
      ribbon: {
        spine: [[7, -180], [16, -166], [12, -146], [20, -128]], cuts: [0.4], reach: 14,
        draw(S) { S.rib([[7, -180], [16, -166], [12, -146], [20, -128]], TS.verm, { wMax: 8, w0: 7, w1: 1, rim: '#ff8a7a', gloss: true, glossAlpha: 0.5, line: 2.2 }); },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die;
      const hopT = Math.abs(Math.sin(TAU * t / 1.7));
      const hop = hopT * 4 * m + 10 * Math.max(0, -sw) * 1 + 6 * tele + 8 * buff * Math.sin(PI * st.E.buffP);
      const dx = -sw * 30 + hurt * 20 - tele * -6;
      const rot = 0.03 * m * Math.sin(TAU * t / 1.7 + 1) - 0.17 * sw + 0.2 * hurt + 0.12 * tele + 0.03 * Math.sin(t * 48) * tele;
      const vib = clamp(0.12 + 0.9 * Math.max(0, sw) + 0.8 * tele + 0.6 * buff + 0.5 * hurt, 0, 1.2);
      ctx.save();
      xform(ctx, 0, -44, dx, -hop, rot, 1 + 0.05 * hurt - 0.03 * tele, 1 - 0.05 * hurt + 0.03 * tele);
      // legs
      const legSw = Math.sin(TAU * t / 1.7) * 0.12 * m;
      put(ctx, st, 'legF', { r: -legSw * 0.6 - 0.2 * sw + 0.1 * guard });
      put(ctx, st, 'armF', { r: -0.15 + 0.5 * Math.max(0, -sw) - 0.4 * sw + 0.3 * Math.sin(TAU * t / 1.7 + 2) * m * 0.3 - 1.1 * guard - 0.8 * tele });
      put(ctx, st, 'neck', { r: 0.04 * Math.sin(TAU * t / 2.3) * m - 0.05 * sw + 0.05 * hurt * -1, kids(c) {
        putChain(c, st, 'ribbon', [0, 1].map((j) => m * 0.34 * Math.sin(TAU * (t / 1.5) - j * 1.0) + 0.3 * sw + 0.4 * hurt));
      } });
      // the three strings hum over the neck and down to the bridge
      ctx.save();
      const lenS = 66;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        for (let k = 0; k <= 12; k++) {
          const u = k / 12, y = -168 + u * (lenS + 2), amp = Math.sin(PI * u) * (0.5 + 4.2 * vib) * Math.sin(t * (58 + i * 9) + u * 3 + i);
          const x = i * (3 - 1.6 * u) + amp * (k % 2 ? 1 : -1) * 0.0 + amp;
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.lineWidth = 1.5; ctx.strokeStyle = vib > 0.5 ? '#f4e8ff' : '#dcd8f0'; ctx.stroke();
      }
      if (vib > 0.35) tk.glow(ctx, 0, -132, 40, TS.snd, cA(0.5 * (vib - 0.3)));
      ctx.restore();
      put(ctx, st, 'drum', {
        kids(c) {
          // the one big, sour, glaring eye
          const angry = clamp(tele + Math.max(0, sw) + hurt * 0.3, 0, 1);
          const open = blink(t, 'tsuku', 4.2) * (1 - 0.5 * hurt) * (1 - 0.6 * guard) * (1 + 0.12 * tele);
          eyeLive(c, 0, -78, 12, 12.5, { open, iris: ['#9adc10', TS.eye], sclera: '#fffbe0', pupil: 'slit', glow: TS.eye, glowK: 0.4 + 0.4 * angry, glowR: 2.4, lw: 2.8, look: [Math.sin(t * 0.9) * 0.4 - 0.5 * angry, 0.1] });
          tk.inkPath(c, [[-15, lerp(-92, -96, angry)], [0, lerp(-97, -90, angry)], [15, lerp(-92, -96, angry)]], { w: 4.4, taper: 0.25, wobble: 0.05, seed: 2 });
          // jagged grin: opens to sing
          const mo = 0.15 + 0.6 * Math.max(0, sw) + 0.7 * tele + 0.5 * hurt + 0.4 * buff;
          const my = -57, mh = 3 + 9 * mo;
          c.beginPath(); c.moveTo(-15, my);
          for (let i = 0; i <= 6; i++) c.lineTo(-15 + i * 5, my + (i % 2 ? mh * 0.4 : 0));
          for (let i = 6; i >= 0; i--) c.lineTo(-15 + i * 5, my + mh + (i % 2 ? 0 : -mh * 0.3));
          c.closePath(); c.fillStyle = '#3a0d1e'; c.fill(); c.lineWidth = 2.2; c.strokeStyle = pal.ink; c.stroke();
          c.fillStyle = '#fff6e0';
          for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(-14 + i * 5, my + 1); c.lineTo(-11.5 + i * 5, my + 1 + Math.min(mh * 0.6, 6)); c.lineTo(-9 + i * 5, my + 1); c.fill(); }
          if (st.wound > 0.3) tk.inkPath(c, [[16, -100], [10, -90], [16, -84], [8, -74]], { w: 1.8, alpha: 0.8 * st.wound, taper: 0.3 });
        },
      });
      put(ctx, st, 'legN', { r: legSw + 0.28 * sw - 0.1 * hurt });
      // the near arm with its big plectrum
      const strum = Math.sin(TAU * t / 1.2) * 0.12 * m;
      const aR = strum - 1.3 * sw + 0.5 * Math.max(0, -sw) + 0.4 * hurt - 0.9 * tele - 0.4 * buff + 1.4 * guard;
      put(ctx, st, 'armN', { r: aR, kids(c) { put(c, st, 'bachi', { x: -60, y: -122, r: 0.4 - 0.5 * sw - 0.4 * guard, sy: 1 }); } });
      ctx.restore();
      // rings of sound: outward on the strike, gathering inward on the wind-up, a ripple when it buffs
      const ring = (cx, cy, u, a, dir) => {
        ctx.save(); ctx.globalAlpha = cA(a); ctx.strokeStyle = TS.snd; ctx.lineWidth = 3.2 * (1 - u * 0.6);
        for (let k = 0; k < 3; k++) { const r = (16 + u * 70 + k * 16) * (dir > 0 ? 1 : 1 - 0.4 * u); ctx.beginPath(); ctx.arc(cx, cy, r, PI * 0.72, PI * 1.28); ctx.stroke(); }
        ctx.restore();
      };
      if (E0.pose === 'attack' && E0.p > 0.42) { const u = (E0.p - 0.42) / 0.58; ring(dx - 20, -84, u, (1 - u) * 0.9, 1); ring(dx - 20, -84, Math.max(0, u - 0.25), (1 - u) * 0.6, 1); }
      if (tele > 0.1) { const u = (((t * 1.6) % 1) + 1) % 1; ring(dx - 20, -84, 1 - u, tele * u * 0.9, -1); }
      if (buff > 0.05) ring(dx - 10, -84, E0.buffP, buff * 0.8, 1);
      puffs(ctx, dx, -160, t, 3, 33, { col: TS.snd, rise: 30, spread: 14, size: 3, alpha: 0.5 * vib * (1 - die) });
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // SILK WEAVER (normal, m): the house's spider servant. A woman in a headscarf, apron and tied-back sleeves grows out of a plum spider's body: eight
  // jointed legs, a fat abdomen with a glowing hourglass, four hands that never stop drawing silk. Accent: hot magenta (four eyes, hourglass, thread glow).
  // ---------------------------------------------------------------------------------------------------------------
  const WV = { plum: '#7e50a0', plumF: '#523878', plumD: '#2a1636', silk: '#f0e8ff', mag: '#ff5ad0', kimono: '#6a3a8a', apron: '#f4efe4', skin: '#f2e2d8', verm: '#d8402e', hair: '#241a3a' };
  const rotAbout = (px, py, x, y, r) => { const c = Math.cos(r), s = Math.sin(r), dx = x - px, dy = y - py; return [px + dx * c - dy * s, py + dx * s + dy * c]; };
  function weaverLeg(S, far) {
    const base = far ? WV.plumF : WV.plum, o = { wMax: 11, w0: 10, w1: 3, cap: 'round', gloss: false, line: far ? 2.6 : 3, rim: far ? null : '#ffb8f0', rimW: 1.3, shadow: true };
    S.rib([[0, 0], [34, -60, 1], [84, 58]], base, Object.assign({ profile: (u) => 1 - 0.7 * u }, o));
    S.cel(E(34, -60, 6.2, 6.2, 8), far ? '#4a2a5a' : '#7a4a92', { depth: 2, line: 2.2, hi: false, rim: null });
    [[14, -28], [62, 12]].forEach((p) => S.line([[p[0] - 3.5, p[1] - 2.5], [p[0] + 3.5, p[1] + 2.5]], { w: 2.2, color: far ? '#9a86b8' : '#f4ecff', alpha: 0.95, taper: 0.2 }));
    S.line([[84, 58], [88, 66]], { w: 2.6, color: pal.ink, taper: 0.2 });
    for (let i = 0; i < 6; i++) { const u = 0.1 + i * 0.15, ax = u < 0.5 ? 34 * u * 2 : 34 + 50 * (u - 0.5) * 2, ay = u < 0.5 ? -60 * u * 2 : -60 + 118 * (u - 0.5) * 2; S.line([[ax + 2, ay - 4], [ax + 5, ay - 10]], { w: 1.1, color: far ? '#6a4a82' : '#a880c8', alpha: 0.8, taper: 0.4 }); }
  }
  function weaverArm(S, far, low) {
    const sx = far ? 8 : -26, sy = low ? -100 : -120, base = far ? '#4a2a68' : WV.kimono;
    const ex = sx + (far ? 14 : -12) + (low ? 3 : 0), ey = sy + 18, hx = ex + (far ? -8 : -12), hy = ey + 10;
    S.cel(cap(sx, sy, ex, ey, 9.5, 8.5), base, { depth: 4, line: 2.6, hi: !far, rim: far ? null : '#ff9ae0' });
    S.cel(cap(ex, ey, hx, hy, 7.8, 6.6), base, { depth: 3, line: 2.4, hi: false, rim: null });
    S.line([[ex - 3, ey + 2], [ex + 3, ey + 4]], { w: 3, color: WV.verm, taper: 0.1 });
    S.cel(E(hx - 1, hy + 2, 5, 4.4), far ? '#d8c4bc' : WV.skin, { depth: 1.6, line: 2, hi: false, rim: null });
    [-1, 0, 1].forEach((k) => S.line([[hx - 4, hy + 1 + k * 2], [hx - 9, hy + 1 + k * 3.4]], { w: 1.6, taper: 0.3, color: pal.ink }));
  }
  define('silk_weaver', {
    size: 'm', lw: 3, k: 0.94,
    col: { rim: '#ffb8f0' },
    bounds: { w: 150, h: 186, head: { x: -10, y: -184 }, body: { x: 6, y: -84 }, feet: { x: 0, y: 0 } },
    die: { box: [-80, -190, 100, 8], nx: 11, ny: 13, from: 'out', order: 0.6, shape: 'ink', kinds: ['thread', 'petal', 'thread', 'ink'], cols: ['#f0e8ff', '#ff5ad0', '#e8dcff', '#5a3a72'], wind: [-8, -30], size: 6 },
    parts: {
      abdomen: {
        box: [0, -112, 100, -20], pivot: [50, -62],
        draw(S) {
          S.cel(E(52, -62, 43, 37, 20, -0.15), WV.plum, {
            depth: 14, line: 3.4, hi: true, hiW: 3, rim: '#ff9ae0', halftone: { d: 5, alpha: 0.32 },
            decor(g) {
              for (let i = 0; i < 26; i++) { const a = i * 2.4, r = 6 + (i * 7) % 30; tk.inkPath(g, [[52 + Math.cos(a) * r, -62 + Math.sin(a) * r * 0.8], [52 + Math.cos(a) * r + 3, -62 + Math.sin(a) * r * 0.8 - 5]], { w: 1.1, color: '#a880c8', alpha: 0.5, taper: 0.4 }); }
              g.fillStyle = 'rgba(232,220,255,0.9)'; g.beginPath(); g.ellipse(46, -74, 5, 8, -0.3, 0, TAU); g.fill(); g.beginPath(); g.ellipse(60, -52, 4.6, 7, -0.3, 0, TAU); g.fill();
            },
          });
          // the hourglass mark, glowing on top
          S.cel({ poly: [[40, -84], [66, -80], [56, -64], [68, -46], [38, -46], [50, -64]] }, WV.mag, { depth: 3, line: 2, hi: false, rim: null, tension: 0.3, shadow: '#a02890' });
          // spinnerets
          S.cel([[90, -44], [98, -40], [100, -34], [93, -33]], WV.plumF, { depth: 2, line: 2.2, hi: false, rim: null });
        },
      },
      thorax: {
        box: [-34, -92, 26, -44], pivot: [-4, -68],
        draw(S) { S.cel(E(-4, -68, 29, 23, 16), WV.plum, { depth: 9, line: 3.2, hi: true, hiW: 2.6, rim: '#ff9ae0', halftone: { d: 5, alpha: 0.3 } }); },
      },
      armLF: { box: [-14, -124, 8, -68], pivot: [8, -100], draw(S) { weaverArm(S, true, true); } },
      armUF: { box: [-14, -138, 20, -76], pivot: [8, -120], draw(S) { weaverArm(S, true, false); } },
      torso: {
        box: [-42, -138, 20, -72], pivot: [-10, -82],
        draw(S) {
          S.cel([[-31, -122], [-22, -131], [4, -131], [12, -122], [14, -98], [9, -80], [-27, -80], [-33, -100]], WV.kimono, { depth: 10, line: 3, hi: true, hiW: 2.6, rim: '#ff9ae0', halftone: { d: 5, alpha: 0.28 }, decor(g) { g.fillStyle = 'rgba(255,90,208,0.45)'; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(-22 + i * 11, -112 + (i % 2) * 8, 2.2, 0, TAU); g.fill(); } } });
          // the white apron and the crossed tasuki cord
          S.cel([[-29, -122], [-6, -122], [-3, -84], [-27, -83]], WV.apron, { depth: 5, line: 2.6, hi: false, rim: null, tension: 0.35 });
          S.line([[-24, -110], [-8, -108]], { w: 1.2, color: '#c8c0b0', alpha: 0.8, taper: 0.3 });
          S.line([[-26, -128], [8, -96]], { w: 3, color: WV.verm, taper: 0.1 });
          S.line([[6, -128], [-28, -96]], { w: 3, color: WV.verm, taper: 0.1 });
          S.cel({ poly: [[-30, -92], [10, -92], [11, -82], [-29, -81]] }, '#2a1636', { depth: 2, line: 2.4, tension: 0.2, rim: null });
          S.cel(E(10, -86, 6, 5.5), WV.verm, { depth: 1.6, line: 2, hi: false, rim: null });
        },
      },
      head: {
        box: [-44, -186, 26, -122], pivot: [-10, -128],
        draw(S) {
          S.cel(E(-9, -150, 26, 27, 18), WV.hair, { depth: 6, line: 3, hi: false, rim: '#ff9ae0' });
          S.cel(E(-13, -148, 22.4, 24, 18), WV.skin, { depth: 8, line: 3, hi: false, rim: null });
          // headscarf tied over the hair, with a knot
          S.cel([[-34, -158], [-30, -176], [-10, -184], [12, -176], [16, -160], [4, -166], [-10, -162], [-24, -166]], WV.apron, { depth: 5, line: 2.8, hi: false, rim: '#ffffff' });
          S.cel([[8, -170], [22, -178], [26, -166], [18, -160]], WV.apron, { depth: 3, line: 2.4, hi: false, rim: null });
          S.line([[-30, -160], [-10, -164], [10, -162]], { w: 2.2, color: WV.verm, taper: 0.1 });
          S.ell(-24, -136, 4.6, 3, '#ff9ac0', { line: 0, shadow: false, rim: null });
          S.ell(-3, -136, 4.6, 3, '#ff9ac0', { line: 0, shadow: false, rim: null });
          S.line([[-30, -162], [-22, -164]], { w: 2, taper: 0.5 });
          S.line([[-6, -163], [2, -161]], { w: 2, taper: 0.5 });
        },
      },
      armLN: { box: [-52, -124, -20, -70], pivot: [-26, -100], draw(S) { weaverArm(S, false, true); } },
      armUN: { box: [-52, -138, -14, -82], pivot: [-26, -120], draw(S) { weaverArm(S, false, false); } },
    },
    chains: {
      legN: { spine: [[0, 0], [34, -60, 1], [84, 58]], cuts: [0.5], reach: 18, draw(S) { weaverLeg(S, false); } },
      legF: { spine: [[0, 0], [34, -60, 1], [84, 58]], cuts: [0.5], reach: 18, draw(S) { weaverLeg(S, true); } },
      thread: {
        spine: [[100, -38], [104, -22], [98, -8], [104, 4]], cuts: [0.5], reach: 8,
        draw(S) { S.line([[100, -38], [104, -22], [98, -8], [104, 4]], { w: 2, color: '#f0e8ff', taper: 0.1, wobble: 0, pressure: 'flat' }); },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die;
      const skit = (i) => m * 0.09 * Math.sin(TAU * (t / 1.3) + i * 1.7);
      const dx = -sw * 30 + hurt * 18 + tele * 6;
      const rot = -0.07 * sw + 0.1 * hurt + 0.03 * Math.sin(TAU * t / 3.2) * m - 0.06 * tele;
      const bounce = -Math.abs(Math.sin(TAU * t / 1.3)) * 2 * m - 6 * tele + 6 * die + 3 * guard;
      const curl = die * 1.3;
      // legs: [rootX, rootY, dir, scale, r0, far]
      const LEGS = [
        [-8, -66, -1, 0.86, -0.1, true], [2, -64, -1, 0.72, 0.18, true], [24, -62, 1, 0.8, -0.12, true], [40, -58, 1, 0.7, 0.16, true],
        [-14, -62, -1, 1, 0.02, false], [-5, -58, -1, 0.9, 0.26, false], [14, -58, 1, 0.94, 0.02, false], [30, -54, 1, 0.84, 0.28, false],
      ];
      const legBends = (i, L) => {
        const front = L[2] < 0;
        const raise = L[4] + skit(i) * 1.2 + (front ? (-0.8 * Math.max(0, sw) - 0.5 * tele + 0.15 * Math.min(0, sw)) : 0.1 * Math.max(0, sw)) * (i % 4 < 2 ? 1 : 0.7) + 0.3 * hurt * -1 + curl * 0.5 - 0.15 * buff * Math.sin(t * 10 + i);
        const knee = skit(i + 3) * 1.4 + (front ? 0.6 * Math.max(0, sw) + 0.5 * tele : 0) + 0.5 * guard + curl * 1.1;
        return [raise, knee];
      };
      ctx.save();
      xform(ctx, 0, -60, dx, bounce, rot, 1, 1 - 0.04 * hurt);
      LEGS.filter((L) => L[5]).forEach((L, k) => putChain(ctx, st, 'legF', legBends(k, L), { x: L[0], y: L[1], sx: L[2] * L[3], sy: L[3] }));
      put(ctx, st, 'armLF', { r: -0.15 + 0.3 * Math.sin(TAU * t / 1.6 + 1) * m * 0.4 + 0.3 * sw - 0.7 * tele * 0 });
      put(ctx, st, 'armUF', { r: 0.1 + 0.3 * Math.sin(TAU * t / 1.6) * m * 0.4 - 0.3 * sw + 0.4 * tele });
      // abdomen throbs; the hourglass glows
      const throb = 1 + 0.03 * Math.sin(TAU * t / 1.8) * m + 0.12 * buff * Math.sin(PI * E0.buffP) + 0.04 * tele;
      put(ctx, st, 'abdomen', {
        sx: throb, sy: throb, r: 0.02 * Math.sin(TAU * t / 2.4) * m,
        kids(c) {
          const hg = 0.5 + 0.2 * Math.sin(t * 2.2) * m + 0.5 * buff + 0.4 * tele;
          tk.glow(c, 54, -63, 30, WV.mag, cA(hg * 0.7));
          putChain(c, st, 'thread', [0, 1].map((j) => m * 0.2 * Math.sin(TAU * (t / 1.9) - j) + 0.2 * hurt));
        },
      });
      put(ctx, st, 'thorax');
      put(ctx, st, 'torso', {
        r: 0.02 * Math.sin(TAU * t / 3.2) * m - 0.08 * sw + 0.1 * hurt - 0.04 * tele,
        pre(c) {
          // the silk being drawn between the near hands: two taut strands that pluck and shimmer
          const aU = -0.1 + 0.4 * Math.sin(TAU * t / 1.6) * m * 0.4 + 0.7 * sw + 0.5 * tele;
          const aL = 0.05 + 0.3 * Math.sin(TAU * t / 1.6 + 1.3) * m * 0.4 + 0.4 * sw;
          const h1 = rotAbout(-26, -120, -50, -102, aU), h2 = rotAbout(-26, -100, -50, -80, aL);
          c.save();
          tk.inkPath(c, [[h1[0], h1[1]], [(h1[0] + h2[0]) / 2 + Math.sin(t * 9) * 1.4, (h1[1] + h2[1]) / 2], [h2[0], h2[1]]], { w: 1.8, color: '#f4eeff', taper: 0.05, pressure: 'flat', wobble: 0 });
          tk.glow(c, (h1[0] + h2[0]) / 2, (h1[1] + h2[1]) / 2, 22, WV.mag, 0.25 + 0.4 * buff);
          if (E0.pose === 'attack' || E0.pose === 'buff') {
            const u = E0.pose === 'attack' ? clamp((E0.p - 0.4) / 0.6, 0, 1) : E0.buffP;
            for (let i = 0; i < 5; i++) tk.inkPath(c, [[h1[0], h1[1]], [h1[0] - 40 * u - i * 8, h1[1] - 6 + (i - 2) * 14 * u]], { w: 1.4, color: '#f4eeff', alpha: cA((1 - u) * 1.3), taper: 0.3 });
          }
          c.restore();
          put(c, st, 'armLN', { r: aL });
        },
        kids(c) {
          put(c, st, 'head', {
            r: 0.03 * Math.sin(TAU * t / 2.7) * m - 0.1 * sw + 0.15 * hurt, y: -3 * Math.max(0, sw) + 2 * tele,
            kids(cc) {
              const open = blink(t, 'weaver', 3.8) * (1 - 0.6 * hurt);
              const hot = clamp(tele + Math.max(0, sw) + buff, 0, 1);
              const opt = { iris: ['#c8127a', '#ff9ae8'], sclera: '#fff2fa', pupil: 'slit', glow: WV.mag, glowK: 0.55 + 0.3 * hot, glowR: 2.6, lw: 2.2, look: [-0.5 - 0.3 * sw, 0.05] };
              eyeLive(cc, -22, -148, 5.6, 7, Object.assign({ open }, opt));
              eyeLive(cc, -4, -148, 5, 6.6, Object.assign({ open }, opt));
              eyeLive(cc, -18, -158, 2.8, 3.2, Object.assign({ open, lw: 1.6, catch: false, glowK: 0.4 }, opt));
              eyeLive(cc, -7, -158, 2.6, 3, Object.assign({ open, lw: 1.6, catch: false, glowK: 0.4 }, opt));
              // small smile that shows its fangs when it strikes
              const mo = 0.1 + 0.9 * Math.max(0, sw) + 0.5 * tele + 0.5 * hurt;
              tk.inkPath(cc, [[-22, -132], [-13, -128 - mo * 2], [-4, -132]], { w: 2, taper: 0.3 });
              if (mo > 0.2) {
                cc.save(); cc.beginPath(); cc.ellipse(-13, -131, 8, 2 + mo * 5, 0, 0, TAU); cc.fillStyle = '#3a0d2e'; cc.fill(); cc.lineWidth = 2; cc.strokeStyle = pal.ink; cc.stroke();
                cc.fillStyle = '#ffffff'; cc.beginPath(); cc.moveTo(-19, -132.5); cc.lineTo(-17.5, -126 - mo * 2); cc.lineTo(-16, -132.5); cc.fill();
                cc.beginPath(); cc.moveTo(-10, -132.5); cc.lineTo(-8.5, -126 - mo * 2); cc.lineTo(-7, -132.5); cc.fill(); cc.restore();
              }
            },
          });
          put(c, st, 'armUN', { r: -0.1 + 0.4 * Math.sin(TAU * t / 1.6) * m * 0.4 + 0.7 * sw + 0.5 * tele + 1.0 * guard });
        },
      });
      LEGS.filter((L) => !L[5]).forEach((L, k) => putChain(ctx, st, 'legN', legBends(k + 4, L), { x: L[0], y: L[1], sx: L[2] * L[3], sy: L[3] }));
      ctx.restore();
      if (buff > 0.05 || tele > 0.05) motes(ctx, 54 + dx, -70 + bounce, t, 7, 8, { col: '#ff9ae8', rise: 50, spread: 30, life: 1.1, size: 2.6, alpha: Math.max(buff, tele) * 0.9 });
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // NURE-ONNA (normal, l): a woman above the waist and a river snake below it, combing her long wet hair on the canal bank. She waves, and that is not
  // a greeting. A coiled pedestal of teal scales with a pale belly stripe and glowing spots, a torn wet kimono, hair like poured ink. Accent: river-green
  // glowing eyes and the bioluminescent freckles along her coils.
  // ---------------------------------------------------------------------------------------------------------------
  const NU = { scale: '#2f8f80', scaleD: '#1d5a66', belly: '#eee4b8', kimono: '#d6e4ee', collar: '#3a4a8a', skin: '#dcecf0', hair: '#1c2c50', hairL: '#5a8ac8', glow: '#4affd0', plum: '#5a1a3a' };
  function nureBand(S, spine, wMax, seed) {
    S.rib(spine, NU.scale, {
      wMax, w0: wMax * 0.7, w1: wMax * 0.7, cap: 'round', profile: (u) => 0.55 + 0.45 * Math.sin(PI * clamp(u, 0, 1)), gloss: true, glossAlpha: 0.4, glossColor: '#c8fff0', rim: '#9ffff0', rimW: 1.8, shadow: NU.scaleD, halftone: { d: 5, alpha: 0.26 }, line: 3.4,
      decor(g) {
        // belly stripe along the lower edge, diamond scales and glowing freckles
        const lo = spine.map((p) => [p[0], p[1] + wMax * 0.3]);
        tk.inkPath(g, lo, { w: wMax * 0.26, color: NU.belly, taper: 0.02, pressure: 'flat', wobble: 0 });
        for (let i = -9; i <= 9; i++) { tk.inkPath(g, [[i * 10, spine[3][1] - wMax], [i * 10 + wMax * 1.1, spine[3][1] + wMax]], { w: 1.1, color: '#0d3a44', alpha: 0.4, taper: 0.1, wobble: 0 }); tk.inkPath(g, [[i * 10, spine[3][1] + wMax], [i * 10 + wMax * 1.1, spine[3][1] - wMax]], { w: 1.1, color: '#0d3a44', alpha: 0.4, taper: 0.1, wobble: 0 }); }
        const r = tk.rng('nure', seed);
        g.fillStyle = NU.glow;
        for (let i = 0; i < 9; i++) { const u = 0.1 + r() * 0.8, k = Math.min(spine.length - 2, Math.floor(u * (spine.length - 1))), f = u * (spine.length - 1) - k; g.beginPath(); g.arc(lerp(spine[k][0], spine[k + 1][0], f), lerp(spine[k][1], spine[k + 1][1], f) - wMax * 0.14 + r() * 4, 1.9 + r() * 1.2, 0, TAU); g.fill(); }
      },
    });
  }
  define('nure_onna', {
    size: 'l', lw: 3.2, k: 1,
    col: { rim: '#9ffff0' },
    bounds: { w: 190, h: 246, head: { x: 0, y: -234 }, body: { x: 0, y: -120 }, feet: { x: 0, y: 0 } },
    die: { box: [-100, -240, 140, 6], nx: 12, ny: 14, from: 'top', order: 0.5, shape: 'ink', kinds: ['bubble', 'ink', 'bubble', 'petal'], cols: ['#9ffff0', '#1c2c50', '#dcecf0', '#4affd0'], wind: [4, 12], size: 7 },
    parts: {
      coilA: { box: [-108, -62, 108, 14], pivot: [0, -20], draw(S) { nureBand(S, [[-84, -30], [-70, -12], [-38, -2], [0, 0], [38, -2], [70, -12], [84, -30]], 48, 1); } },
      coilB: { box: [-88, -94, 88, -20], pivot: [0, -54], draw(S) { nureBand(S, [[-66, -62], [-54, -46], [-28, -38], [0, -36], [28, -38], [54, -46], [66, -62]], 44, 2); } },
      coilC: { box: [-70, -124, 70, -52], pivot: [0, -86], draw(S) { nureBand(S, [[-48, -92], [-38, -78], [-18, -70], [0, -68], [18, -70], [38, -78], [48, -92]], 40, 3); } },
      torso: {
        box: [-52, -172, 50, -84], pivot: [0, -102],
        draw(S) {
          S.cel([[-27, -152], [-16, -161], [16, -161], [27, -152], [31, -128], [27, -104], [-27, -104], [-31, -128]], NU.kimono, {
            depth: 12, line: 3, hi: true, hiW: 2.6, rim: '#ffffff', halftone: { d: 5, alpha: 0.26, color: '#6a7ab0' },
            decor(g) { tk.inkPath(g, [[-24, -150], [-12, -120], [-20, -104]], { w: 1.4, color: '#8aa0c8', alpha: 0.7, taper: 0.3 }); tk.inkPath(g, [[22, -148], [14, -124], [20, -106]], { w: 1.4, color: '#8aa0c8', alpha: 0.7, taper: 0.3 }); g.fillStyle = 'rgba(58,74,138,0.5)'; g.beginPath(); g.moveTo(-30, -112); g.lineTo(30, -118); g.lineTo(30, -104); g.lineTo(-30, -104); g.fill(); },
          });
          S.cel({ poly: [[-10, -160], [0, -132], [10, -160], [5, -160], [0, -146], [-5, -160]] }, NU.collar, { depth: 2, line: 2, tension: 0.2, hi: false, rim: null });
          // the torn hem drooping over the coils
          S.cel({ poly: [[-30, -108], [30, -110], [26, -92], [20, -98], [14, -86], [6, -96], [-2, -84], [-10, -96], [-18, -88], [-24, -98], [-30, -90]] }, '#c4d4e4', { depth: 4, line: 2.6, tension: 0.15, hi: false, rim: null });
          S.cel(E(0, -156, 11, 6, 10), NU.skin, { depth: 3, line: 2.4, hi: false, rim: null });
        },
      },
      armW: {
        box: [-84, -190, -8, -108], pivot: [-24, -146],
        draw(S) {
          // the beckoning arm: a wet wide sleeve, a pale hand with long fingers
          S.cel(cap(-24, -146, -44, -132, 15, 13), NU.kimono, { depth: 5, line: 2.8, hi: true, rim: '#ffffff' });
          S.cel([[-36, -138], [-58, -132], [-64, -150], [-56, -162], [-44, -156]], '#c4d4e4', { depth: 4, line: 2.8, hi: false, rim: null });
          S.cel(cap(-56, -158, -58, -176, 8, 7), NU.skin, { depth: 2, line: 2.4, hi: false, rim: null });
          [-1, -0.3, 0.4, 1.1].forEach((k, i) => S.cel(cap(-58 + k * 2, -174, -58 + k * 8, -188 + Math.abs(k) * 3, 4.4, 3), NU.skin, { depth: 1, line: 1.8, hi: false, rim: null }));
        },
      },
      armC: {
        box: [6, -166, 46, -100], pivot: [22, -148],
        draw(S) {
          S.cel(cap(22, -148, 32, -130, 12, 11), '#b4c4d8', { depth: 4, line: 2.6, hi: false, rim: null });
          S.cel(cap(32, -130, 16, -116, 10, 9), '#b4c4d8', { depth: 3, line: 2.6, hi: false, rim: null });
          S.cel(E(12, -113, 6, 5.6), NU.skin, { depth: 1.6, line: 2.2, hi: false, rim: null });
          // the boxwood comb
          S.cel(tk.rrectPts(2, -120, 14, 7, 2), '#c8602a', { depth: 1.5, line: 2, hi: false, rim: null });
          for (let i = 0; i < 6; i++) S.line([[4 + i * 2.2, -113], [4 + i * 2.2, -107]], { w: 1.2, taper: 0.1, pressure: 'flat', wobble: 0 });
        },
      },
      head: {
        box: [-38, -232, 38, -152], pivot: [0, -158],
        draw(S) {
          S.cel(E(0, -190, 25, 30, 18), NU.skin, { depth: 9, line: 3.2, hi: false, rim: '#ffffff' });
          // fringe and the long side locks framing the face
          S.cel([[-27, -196], [-24, -220], [-6, -230], [16, -226], [27, -210], [27, -194], [18, -204], [4, -198, 1], [-8, -206], [-16, -198, 1], [-24, -190]], NU.hair, { depth: 7, line: 3, hi: true, hiW: 2.4, rim: NU.hairL });
          S.cel([[-27, -198], [-33, -176], [-30, -156], [-24, -160], [-22, -180]], NU.hair, { depth: 4, line: 2.6, hi: false, rim: NU.hairL });
          S.cel([[27, -198], [33, -176], [30, -156], [24, -160], [22, -180]], NU.hair, { depth: 4, line: 2.6, hi: false, rim: NU.hairL });
          tk.gloss(S.g, [[-18, -222], [0, -228], [16, -222]], { w: 4.5, alpha: 0.5, color: '#a8c8ff' });
          S.line([[-17, -197], [-14, -190]], { w: 1.2, color: NU.hairL, alpha: 0.9, taper: 0.4 });
          S.ell(-14, -176, 4.4, 2.8, '#9ac0d0', { line: 0, shadow: false, rim: null });
          S.ell(14, -176, 4.4, 2.8, '#9ac0d0', { line: 0, shadow: false, rim: null });
        },
      },
    },
    chains: {
      tail: {
        spine: [[80, -30], [112, -30], [134, -50], [130, -84], [106, -100]], cuts: [0.28, 0.52, 0.76], reach: 30,
        draw(S) {
          S.rib([[80, -30], [112, -30], [134, -50], [130, -84], [106, -100]], NU.scale, {
            wMax: 36, w0: 34, w1: 0, gloss: true, glossAlpha: 0.4, glossColor: '#c8fff0', rim: '#9ffff0', shadow: NU.scaleD, halftone: { d: 5, alpha: 0.26 }, line: 3.2, tipPow: 1.1,
            decor(g) { for (let i = 0; i < 10; i++) tk.inkPath(g, [[80 + i * 8, -50 + i * 2], [90 + i * 8, -6 + i * 2]], { w: 1, color: '#0d3a44', alpha: 0.35, taper: 0.1 }); },
          });
        },
      },
      hairA: {
        spine: [[-22, -200], [-36, -178], [-38, -148], [-46, -118], [-40, -90]], cuts: [0.3, 0.6], reach: 26,
        draw(S) { S.rib([[-22, -200], [-36, -178], [-38, -148], [-46, -118], [-40, -90]], NU.hair, { wMax: 26, w0: 12, w1: 3, rim: NU.hairL, gloss: true, glossColor: '#a8c8ff', glossAlpha: 0.5, strands: 2, line: 3, shadow: true, halftone: { d: 5, alpha: 0.2, color: '#5a8ac8' } }); },
      },
      hairB: {
        spine: [[22, -200], [38, -178], [40, -148], [34, -118], [44, -92]], cuts: [0.3, 0.6], reach: 26,
        draw(S) { S.rib([[22, -200], [38, -178], [40, -148], [34, -118], [44, -92]], NU.hair, { wMax: 24, w0: 12, w1: 3, rim: NU.hairL, gloss: true, glossColor: '#a8c8ff', glossAlpha: 0.5, strands: 2, line: 3, shadow: true, halftone: { d: 5, alpha: 0.2, color: '#5a8ac8' } }); },
      },
      hairBack: {
        spine: [[0, -214], [0, -176], [4, -130], [0, -84]], cuts: [0.35, 0.68], reach: 46,
        draw(S) { S.rib([[0, -214], [0, -176], [4, -130], [0, -84]], '#141f3c', { wMax: 64, w0: 40, w1: 24, profile: (u) => 0.6 + 0.4 * Math.sin(PI * (0.2 + 0.7 * u)), rim: NU.hairL, gloss: false, strands: 0, line: 3, shadow: true, halftone: { d: 5, alpha: 0.24, color: '#5a8ac8' } }); },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die;
      const br = Math.sin(TAU * t / 3.0) * m;
      const dx = -sw * 42 + hurt * 24 + tele * 10;
      const sink = 10 * die + 6 * hurt + 4 * guard;
      const rise = 14 * tele + 6 * buff;
      const wag = (j, ph, k) => m * 0.14 * Math.sin(TAU * (t / 2.4) - j * 0.9 + ph) * (k || 1);
      ctx.save();
      ctx.save(); ctx.scale(1, 0.8);
      // the tail lashes round behind: it whips over on the strike
      putChain(ctx, st, 'tail', [0, 1, 2, 3].map((j) => wag(j, 1.2, 1.4) + (E0.pose === 'attack' ? -0.5 * sw * (1 + j * 0.4) : 0) + tele * 0.18 * (j + 1) * -1 + 0.3 * hurt), { x: dx * 0.4, y: sink * 0.5 });
      put(ctx, st, 'coilA', { x: dx * 0.3, y: sink * 0.5, sy: 1 + 0.02 * br - 0.08 * guard, r: 0.01 * br });
      put(ctx, st, 'coilB', { x: dx * 0.6, y: sink * 0.6 - rise * 0.3, sy: 1 + 0.025 * br - 0.1 * guard, sx: 1 + 0.02 * tele, r: -0.012 * br });
      put(ctx, st, 'coilC', { x: dx * 0.8, y: sink * 0.7 - rise * 0.6, sy: 1 + 0.03 * br - 0.12 * guard, r: 0.015 * br });
      ctx.restore();
      // the woman: rises out of the coils, and lunges
      ctx.save();
      xform(ctx, 0, -100, dx, sink - rise + 14, -0.12 * sw + 0.12 * hurt - 0.08 * tele + 0.014 * br, 1.2, 1.2);
      putChain(ctx, st, 'hairBack', [0, 1, 2].map((j) => wag(j, 0.4, 0.7) + 0.2 * hurt - 0.12 * sw));
      put(ctx, st, 'armC', { r: -0.1 + 0.16 * Math.sin(TAU * t / 2.2) * m + 0.4 * tele - 0.5 * sw + 1.1 * guard });
      put(ctx, st, 'torso', {
        r: 0.01 * br,
        kids(c) {
          put(c, st, 'head', {
            r: 0.03 * Math.sin(TAU * t / 3.4) * m - 0.16 * sw + 0.14 * hurt + 0.06 * tele, y: 3 * Math.max(0, sw),
            kids(cc) {
              const open = blink(t, 'nure', 4.4) * (1 - 0.6 * hurt);
              const hot = clamp(tele + Math.max(0, sw) + buff, 0, 1);
              [-10, 10].forEach((ex, i) => eyeLive(cc, ex, -189, 7.4, 8.8, { open, iris: ['#0a8a6a', NU.glow], sclera: '#f0fff4', pupil: 'slit', glow: NU.glow, glowK: 0.5 + 0.4 * hot, glowR: 2.6, lw: 2.4, look: [-0.5 - 0.4 * sw, 0], rot: (i ? -1 : 1) * 0.1 * hot }));
              // a thin smile that unhinges into fangs
              const mo = 0.1 + 1.0 * Math.max(0, sw) + 0.7 * tele + 0.5 * hurt + 0.3 * buff;
              if (mo < 0.3) tk.inkPath(cc, [[-9, -172], [0, -168.5], [9, -172]], { w: 2.6, color: NU.plum, taper: 0.3 });
              else {
                cc.beginPath(); cc.ellipse(0, -170, 8 + 3 * mo, 2 + 7 * mo, 0, 0, TAU); cc.fillStyle = '#3a0d2e'; cc.fill(); cc.lineWidth = 2.2; cc.strokeStyle = pal.ink; cc.stroke();
                cc.fillStyle = '#ffffff';
                [[-5, 1], [5, 1]].forEach((f) => { cc.beginPath(); cc.moveTo(f[0] - 2, -171 - 2 * mo); cc.lineTo(f[0], -171 + 6 + 3 * mo); cc.lineTo(f[0] + 2, -171 - 2 * mo); cc.fill(); });
                cc.fillStyle = '#e8506a'; cc.beginPath(); cc.ellipse(0, -166, 5, 2.4 * mo, 0, 0, TAU); cc.fill();
              }
            },
          });
          putChain(c, st, 'hairA', [0, 1, 2].map((j) => wag(j, 0.2, 1) + 0.25 * hurt - 0.14 * sw + 0.5 * guard * (j === 0 ? 1 : 0.4)));
          putChain(c, st, 'hairB', [0, 1, 2].map((j) => wag(j, 1.9, 1) + 0.25 * hurt - 0.14 * sw - 0.5 * guard * (j === 0 ? 1 : 0.4)));
        },
      });
      // the waving hand: a slow beckon, and a rake when she strikes
      put(ctx, st, 'armW', { r: 0.18 * Math.sin(TAU * t / 1.5) * m - 0.06 - 0.5 * Math.max(0, sw) + 0.3 * hurt - 0.5 * tele + 0.8 * guard });
      ctx.restore();
      ctx.restore();
      // bioluminescent freckles pulse along the coils
      const gl = 0.3 + 0.25 * Math.sin(t * 2.1) * m + 0.4 * Math.max(tele, buff);
      tk.glow(ctx, dx * 0.5, -40 + sink, 80, NU.glow, cA(gl * 0.35 * (1 - die)));
      ripples(ctx, dx * 0.3, -3, t, 96, '#9ffff0', 3);
      // water spray on the strike
      if (E0.pose === 'attack' && E0.p > 0.42) {
        const a = (E0.p - 0.42) / 0.58;
        ctx.save();
        for (let i = 0; i < 14; i++) {
          const v = hv('nure', 'sp' + i), ang = -2.9 + v * 1.4, sp = 70 + 100 * hv('nure', 'ss' + i);
          ctx.globalAlpha = cA((1 - a) * 1.2); ctx.fillStyle = i % 3 ? '#b8f0ff' : '#ffffff';
          ctx.beginPath(); ctx.ellipse(dx - 30 + Math.cos(ang) * sp * a, -170 + Math.sin(ang) * sp * a + 120 * a * a, 2.4, 3.6, ang, 0, TAU); ctx.fill();
        }
        ctx.restore();
      }
      for (let i = 0; i < 4; i++) {
        const per = 1.5 + 0.5 * hv('nure', 'dp' + i), u = (((t + hv('nure', 'do' + i) * per) % per) + per) % per / per, sx = [-40, -30, 32, 40][i], sy = -110 + [0, -30, 0, -20][i];
        ctx.save(); ctx.globalAlpha = cA(Math.min(1, u * 4) * (1 - u) * (1 - die)); ctx.fillStyle = '#b8f0ff'; ctx.beginPath(); ctx.ellipse(dx + sx, sy + u * u * 90, 1.8, 3, 0, 0, TAU); ctx.fill(); ctx.restore();
      }
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // ROKUROKUBI (normal, m): by day a quiet lady at the tea house, kneeling in a crimson kimono with a cup of tea. By night a very long neck. She never
  // leaves her seat: the neck goes over your shoulder. A pale, ringed neck that coils and strikes like a snake, a shimada updo with gold pins,
  // a tiny teacup with steam. Accent: pale jade eyes and the ghost-light that follows her head.
  // ---------------------------------------------------------------------------------------------------------------
  const RK = { robe: '#b8283a', robeD: '#7a1a30', obi: '#f5c96a', skin: '#e8eee6', skinD: '#b4c4c0', hair: '#1c1638', jade: '#9fffd0', cream: '#f4ecd8' };
  define('rokurokubi', {
    size: 'm', lw: 3, k: 0.82,
    col: { rim: '#ffb0b8' },
    bounds: { w: 128, h: 222, head: { x: 0, y: -186 }, body: { x: 0, y: -80 }, feet: { x: 0, y: 0 } },
    die: { box: [-70, -230, 70, 4], nx: 9, ny: 15, from: 'top', order: 0.5, shape: 'ink', kinds: ['petal', 'ink', 'petal'], cols: ['#ff7eb6', '#1c1638', '#b8283a'], wind: [-6, -30], size: 6.5 },
    parts: {
      body: {
        box: [-74, -86, 76, 8], pivot: [0, -4],
        draw(S) {
          // the kneeling bell of a kimono, with the wide sleeves resting at her sides
          S.cel([[-34, -72], [-48, -44], [-62, -8], [-40, 2], [0, 4], [40, 2], [62, -8], [48, -44], [34, -72], [0, -78]], RK.robe, {
            depth: 16, line: 3.2, hi: true, hiW: 3, rim: '#ffb0b8', halftone: { d: 5, alpha: 0.3 },
            decor(g) {
              // a scatter of white plum blossoms and a gold hem
              const r = tk.rng('roku', 'plum');
              for (let i = 0; i < 12; i++) {
                const x = -50 + r() * 100, y = -60 + r() * 60;
                g.fillStyle = 'rgba(255,240,240,0.92)';
                for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x + Math.cos(k * 1.257) * 3.4, y + Math.sin(k * 1.257) * 3.4, 2.4, 0, TAU); g.fill(); }
                g.fillStyle = '#f5c96a'; g.beginPath(); g.arc(x, y, 1.4, 0, TAU); g.fill();
              }
              tk.inkPath(g, [[-64, -4], [0, 0], [64, -4]], { w: 5, color: RK.obi, taper: 0.05, pressure: 'flat', wobble: 0.05 });
            },
          });
          // inner collar and the obi with its great bow at the back
          S.cel({ poly: [[-14, -76], [0, -48], [14, -76], [8, -76], [0, -62], [-8, -76]] }, RK.cream, { depth: 2, line: 2, tension: 0.2, hi: false, rim: null });
          S.cel({ poly: [[-36, -56], [36, -56], [40, -38], [-40, -38]] }, RK.obi, { depth: 4, line: 3, tension: 0.2, rim: '#fff0b0', hi: true });
          S.line([[-36, -47], [38, -47]], { w: 1.6, color: '#8a6a24', alpha: 0.8, taper: 0.1 });
          S.cel([[36, -58], [50, -76], [66, -74], [62, -56], [50, -52]], RK.obi, { depth: 4, line: 2.8, hi: false, rim: null });
          S.cel([[36, -52], [48, -34], [64, -36], [62, -52], [50, -56]], RK.obi, { depth: 4, line: 2.8, hi: false, rim: null });
          S.cel(E(40, -54, 5, 6), RK.robeD, { depth: 2, line: 2.2, hi: false, rim: null });
          // folded hands in the lap around a small teacup
          S.cel(E(-8, -30, 9, 6.5), RK.skin, { depth: 2, line: 2.4, hi: false, rim: null });
          S.cel(E(10, -30, 9, 6.5), RK.skin, { depth: 2, line: 2.4, hi: false, rim: null });
          S.cel([[-6, -40], [12, -40], [10, -28], [-4, -28]], '#f4ecd8', { depth: 3, line: 2.4, hi: false, rim: null, tension: 0.4 });
          S.line([[-5, -37], [11, -37]], { w: 1.6, color: '#3a5aa8', taper: 0.1 });
        },
      },
      head: {
        box: [-44, -244, 44, -158], pivot: [0, -170],
        draw(S) {
          // the tall shimada updo behind the face, glossy, with gold pins and a red ribbon
          S.cel([[-24, -204], [-30, -226], [-14, -240], [8, -242], [24, -232], [30, -212], [22, -200]], RK.hair, { depth: 8, line: 3, hi: true, hiW: 3, rim: '#8a80ff', halftone: { d: 5, alpha: 0.2, color: '#5a5aa8' } });
          S.cel(E(22, -222, 15, 12, 12, 0.5), RK.hair, { depth: 5, line: 2.8, hi: true, hiW: 2.4, rim: '#8a80ff' });
          tk.gloss(S.g, [[-16, -232], [2, -238], [16, -230]], { w: 4.5, alpha: 0.6, color: '#d8d4ff' });
          S.cel(E(-9, -186, 22, 25, 18), RK.skin, { depth: 8, line: 3.2, hi: false, rim: '#ffffff' });
          // fringe, side locks
          S.cel([[-32, -190], [-28, -212], [-8, -222], [12, -220], [24, -206], [22, -190], [14, -200], [2, -196, 1], [-8, -204], [-18, -196, 1], [-26, -184]], RK.hair, { depth: 6, line: 3, hi: true, hiW: 2.4, rim: '#8a80ff' });
          S.cel([[-31, -192], [-36, -172], [-33, -160], [-27, -164], [-26, -180]], RK.hair, { depth: 4, line: 2.6, hi: false, rim: '#8a80ff' });
          S.cel([[13, -192], [17, -172], [14, -160], [8, -164], [8, -180]], RK.hair, { depth: 4, line: 2.6, hi: false, rim: '#8a80ff' });
          // gold kanzashi pins fanning out, and a red ribbon at the knot
          [[-4, -236, -0.5], [6, -240, 0], [16, -236, 0.5]].forEach((p) => { S.line([[p[0] - Math.sin(p[2]) * 4, p[1] + 14], [p[0], p[1] - 10]], { w: 2.4, color: RK.obi, taper: 0.1, pressure: 'flat', wobble: 0 }); S.cel(E(p[0], p[1] - 11, 3.4, 3.4, 8), '#ff7eb6', { depth: 1, line: 1.6, hi: false, rim: null, shadow: false }); });
          S.cel(E(20, -214, 5, 4, 8), '#d8402e', { depth: 1.4, line: 2, hi: false, rim: null });
          S.ell(-24, -173, 4.6, 3, '#ff9ab0', { line: 0, shadow: false, rim: null });
          S.ell(6, -173, 4.6, 3, '#ff9ab0', { line: 0, shadow: false, rim: null });
        },
      },
    },
    chains: {
      neck: {
        spine: [[0, -72], [8, -102], [-6, -130], [6, -154], [0, -168]], cuts: [0.14, 0.28, 0.42, 0.56, 0.7, 0.84], overlap: 10, reach: 30,
        draw(S) {
          const spine = [[0, -72], [8, -102], [-6, -130], [6, -154], [0, -168]];
          S.rib(spine, RK.skin, {
            wMax: 27, w0: 26, w1: 19, profile: (u) => 1 - 0.3 * u, gloss: true, glossAlpha: 0.45, rim: '#ffffff', shadow: RK.skinD, halftone: { d: 5, alpha: 0.2, color: '#7a8a9a' }, line: 3.2,
            decor(g) {
              // the wrinkles of a stretched neck, and a red collar with a gold bead at the root
              for (let i = 1; i <= 13; i++) {
                const p = along(spine, 0.08 + i * 0.064), w = 11 * (1 - 0.3 * i / 13);
                tk.inkPath(g, [[p.x - p.ty * w, p.y + p.tx * w], [p.x + p.tx * 2, p.y + p.ty * 2 + 2.6], [p.x + p.ty * w, p.y - p.tx * w]], { w: 1.1, color: '#8a9aa0', alpha: 0.4, taper: 0.3, wobble: 0 });
              }
              const p0 = along(spine, 0.03);
              tk.inkPath(g, [[p0.x - 16, p0.y + 3], [p0.x, p0.y + 7], [p0.x + 16, p0.y + 3]], { w: 8, color: '#d8402e', taper: 0.05, pressure: 'flat', wobble: 0 });
              g.fillStyle = RK.obi; g.beginPath(); g.arc(p0.x, p0.y + 7, 3.2, 0, TAU); g.fill();
            },
          });
        },
      },
    },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die;
      const br = Math.sin(TAU * t / 3.1) * m;
      // the neck: idle sway, a coil back on the wind-up, a long reach forward on the strike, a wrap round her on guard
      const idle = (i) => m * 0.07 * Math.sin(TAU * (t / 2.6) - i * 0.6);
      const reach = Math.max(0, sw), back = Math.max(0, -sw);
      const ACC = [0, 1.4, -2.5, 2.5, -2.5, 1.4, 0], acc = clamp(guard + 0.55 * tele + 0.35 * back, 0, 1);
      const bends = [0, 1, 2, 3, 4, 5, 6].map((i) => {
        let b = idle(i);
        if (i === 0) b += -1.4 * reach + 0.5 * back + 0.55 * tele - 0.45 * buff * 0.2 + 0.6 * hurt + 0.6 * die;
        else b += -0.08 * reach * (i === 6 ? 0.2 : 1) + 0.5 * hurt * (i % 2 ? -1 : 1) + 0.16 * die + 0.05 * Math.sin(t * 40 + i) * tele + buff * 0.1 * Math.sin(t * 10 + i);
        b += ACC[i] * acc;
        return b;
      });
      const tip = chainTip(SPECS.rokurokubi, 'neck', bends);
      ctx.save();
      const dx = hurt * 10 - 6 * Math.max(0, sw), dy = -3 * die * 0 + 5 * die;
      xform(ctx, 0, -4, dx, dy, 0.02 * br - 0.03 * sw + 0.04 * hurt, 1 + 0.01 * br, 1 + 0.015 * br);
      put(ctx, st, 'body');
      // steam from the little teacup
      puffs(ctx, 2, -42, t, 3, 61, { col: '#ffffff', rise: 26, spread: 4, size: 3.4, alpha: 0.5 * (1 - tele) * (1 - die) });
      putChain(ctx, st, 'neck', bends);
      // the head rides the tip of the neck
      put(ctx, st, 'head', {
        x: tip.dx, y: tip.dy, r: tip.r * 0.3 + 0.05 * Math.sin(TAU * t / 2.2) * m - 0.1 * sw + 0.06 * tele, sx: 1.22, sy: 1.22,
        kids(c) {
          const open = blink(t, 'roku', 4.0) * (1 - 0.6 * hurt);
          const hot = clamp(tele + reach + buff, 0, 1);
          [-19, -1].forEach((ex, i) => eyeLive(c, ex, -184, 6.6, 8.4, { open, iris: ['#12a878', RK.jade], sclera: '#f4fff8', pupil: 'slit', glow: RK.jade, glowK: 0.5 + 0.4 * hot, glowR: 2.6, lw: 2.3, look: [-0.5 - 0.5 * reach, 0.05], rot: (i ? -1 : 1) * 0.08 * (1 + hot) }));
          // the smile: sly and red, opening on the strike
          const mo = 0.05 + 0.9 * reach + 0.6 * tele + 0.5 * hurt;
          if (mo < 0.25) { tk.inkPath(c, [[-17, -166], [-9, -162], [-1, -166]], { w: 3, color: '#b8283a', taper: 0.3 }); tk.inkPath(c, [[-19, -168], [-18, -165]], { w: 1.6, taper: 0.5 }); }
          else { c.beginPath(); c.ellipse(-9, -164, 7 + 2 * mo, 2 + 6 * mo, 0, 0, TAU); c.fillStyle = '#3a0d1e'; c.fill(); c.lineWidth = 2.2; c.strokeStyle = pal.ink; c.stroke(); c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(-14, -166); c.lineTo(-12.5, -160 - mo * 2); c.lineTo(-11, -166); c.fill(); c.beginPath(); c.moveTo(-7, -166); c.lineTo(-5.5, -160 - mo * 2); c.lineTo(-4, -166); c.fill(); }
          tk.glow(c, -9, -186, 46, RK.jade, cA((0.16 + 0.3 * hot) * (1 - die)));
          const ha = TAU * t / 3.4;
          tk.glow(c, -9 + Math.cos(ha) * 36, -200 + Math.sin(ha) * 12, 8, RK.jade, cA(0.9 * (1 - die)));
        },
      });
      ctx.restore();
    },
  });

  // ---------------------------------------------------------------------------------------------------------------
  // ITTAN-MOMEN (normal, m): a bolt of white cotton loose in the night wind. A long ribbon of cloth with a small round face on its hooded end and two
  // cat-ear tips; it rears, ripples like a flag and wraps around whatever is warm. Dyed with indigo waves, frayed at the tail. It is drawn live as one
  // continuous ribbon (a wave travelling up a spine) so the cloth never shows a seam. Accent: pale cyan ghost-glow eyes and streaks of night wind.
  // ---------------------------------------------------------------------------------------------------------------
  const IM = { cloth: '#f7f5ff', shade: '#b9b4e8', ind: '#3b4fa8', cyan: '#8fe8ff' };
  // the spine of the cloth (tail to head) for a pose: a travelling wave, bent forward on a strike, coiled on a guard
  function momenSpine(st) {
    const E0 = st.E, t = st.t, m = st.m, N = 9, reach = Math.max(0, E0.swing), back = Math.max(0, -E0.swing), tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die;
    const gA = 1 + 1.2 * guard;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1), amp = (5 + 17 * u) * m * (1 + 0.5 * tele + 0.6 * buff) * gA + 3 * tele;
      pts.push([amp * Math.sin(TAU * t / 1.5 - u * 4.6) + 7 * Math.sin(TAU * t / 2.7 + 1) * u * m, -4 - u * 152]);
    }
    const sp = tk.bendPts(pts, { ang: -0.95 * reach + 0.3 * back + 0.28 * tele + 0.45 * hurt + 0.55 * die, pow: 1.15, ox: pts[0][0], oy: pts[0][1] });
    return sp;
  }
  define('ittan_momen', {
    size: 'm', lw: 3, k: 0.96,
    col: { rim: '#cfeaff' },
    bounds: { w: 118, h: 198, head: { x: -6, y: -184 }, body: { x: 0, y: -96 }, feet: { x: 0, y: 0 } },
    die: { box: [-72, -190, 56, -4], nx: 9, ny: 14, from: 'top', order: 0.55, shape: 'paper', kinds: ['thread', 'scrap', 'petal', 'thread'], cols: ['#f7f5ff', '#3b4fa8', '#cfeaff', '#b9b4e8'], wind: [-12, -34], size: 6 },
    rig(ctx, st) {
      const E0 = st.E, t = st.t, m = st.m, sw = E0.swing, tele = E0.tele, hurt = E0.hurt, buff = E0.buff, guard = E0.guard, die = E0.die, reach = Math.max(0, sw);
      const hover = -16 - Math.sin(TAU * t / 2.4) * 5 * m - 6 * tele + 12 * die - 6 * buff;
      const sp = momenSpine(st);
      const swell = 1 + 0.42 * guard + 0.16 * buff * Math.sin(PI * E0.buffP) + 0.08 * tele;
      const wide = 56 * swell;
      const rib = (col, o) => tk.ribbon(ctx, sp, col, Object.assign({
        wMax: wide, w0: 12, w1: 38, cap: 'round', profile: (u) => (0.2 + 0.8 * Math.pow(clamp(u * 1.06, 0, 1), 0.8)) * (1 + 0.1 * m * Math.sin(u * 11 - t * 4.2)), gloss: true, glossAlpha: 0.5, glossColor: '#ffffff', rim: '#cfeaff', rimW: 2, shadow: IM.shade, shadowW: 0.4, halftone: { d: 5, alpha: 0.18, color: '#7a76b8' }, line: 3.2,
      }, o));
      ctx.save();
      // streaks of night wind behind it
      ctx.save(); ctx.globalAlpha = cA(0.5 * (1 - die));
      for (let i = 0; i < 4; i++) {
        const u = (((t * 0.6 + i * 0.27) % 1) + 1) % 1, y = -40 - i * 36;
        tk.inkPath(ctx, [[46 - u * 30, y], [54 - u * 30, y - 6 + Math.sin(u * 6 + i) * 4], [72 - u * 30, y - 2]], { w: 2, color: '#cfeaff', alpha: Math.sin(u * PI) * 0.6, taper: 0.4, wobble: 0 });
      }
      ctx.restore();
      ctx.translate(hurt * 16 - 30 * reach, hover);
      const head = sp[sp.length - 1], neck = sp[sp.length - 2], ang = Math.atan2(head[1] - neck[1], head[0] - neck[0]) + PI / 2;
      // the cloth itself, with dyed waves along it
      rib(IM.cloth, {
        decor(g) {
          for (let k = 1; k < sp.length - 1; k++) {
            for (const side of [-1, 1]) {
              const dx = sp[k + 1][0] - sp[k - 1][0], dy = sp[k + 1][1] - sp[k - 1][1], l = Math.hypot(dx, dy) || 1;
              const cx = sp[k][0] - dy / l * side * 13 * (0.5 + k / 12), cy = sp[k][1] + dx / l * side * 13 * (0.5 + k / 12);
              for (let r = 3; r <= 9; r += 3) { g.beginPath(); g.arc(cx, cy, r, 0.1 * PI, 0.9 * PI); g.lineWidth = 1.5; g.strokeStyle = IM.ind; g.globalAlpha = 0.7; g.stroke(); }
            }
          }
          for (let k = 1; k < sp.length - 1; k++) {
            const dx = sp[k + 1][0] - sp[k - 1][0], dy = sp[k + 1][1] - sp[k - 1][1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, hw = 18 + 9 * k / 8;
            tk.inkPath(g, [[sp[k][0] - nx * hw, sp[k][1] - ny * hw], [sp[k][0] + nx * 3, sp[k][1] + ny * 3 + 3], [sp[k][0] + nx * hw, sp[k][1] + ny * hw]], { w: 1.7, color: '#8a86c8', alpha: 0.5, taper: 0.3, wobble: 0 });
          }
          g.globalAlpha = 1;
        },
      });
      // two small cloth arms flutter from the shoulders
      [-1, 1].forEach((sg) => { const b = sp[5]; tk.ribbon(ctx, [[b[0] + sg * 14, b[1] + 4], [b[0] + sg * 34 + Math.sin(t * 4 + sg) * 4 * m, b[1] - 4 + Math.sin(t * 3 + sg * 2) * 6 * m - 10 * reach], [b[0] + sg * 54 + Math.sin(t * 3.4 + sg) * 6 * m, b[1] + 6 + Math.sin(t * 2.6) * 7 * m - 22 * reach]], IM.cloth, { wMax: 15, w0: 13, w1: 3, line: 2.6, gloss: false, strands: 0, rim: '#cfeaff', shadow: IM.shade }); });
      if (st.flash > 0.02) { ctx.save(); ctx.globalAlpha = cA(st.flash); rib('#ffffff', { rim: null, shadow: false, halftone: null, gloss: false, line: 0 }); ctx.restore(); }
      // frayed strips flutter from the torn tail
      [-1, 1].forEach((sg) => tk.ribbon(ctx, [[sp[0][0], sp[0][1] + 2], [sp[0][0] + sg * 7 + Math.sin(t * 5 + sg) * 3 * m, sp[0][1] + 12], [sp[0][0] + sg * 12 + Math.sin(t * 4 + sg * 2) * 5 * m, sp[0][1] + 24]], IM.cloth, { wMax: 6, w0: 5, w1: 1, line: 2.2, gloss: false, strands: 0, rim: null, shadow: false }));
      // the hooded end: two cat-ear tips and a small round face
      ctx.save();
      ctx.translate(head[0], head[1]); ctx.rotate(ang * 0.8);
      const open = blink(t, 'momen', 4.2) * (1 - 0.6 * hurt);
      const hot = clamp(tele + reach + buff, 0, 1);
      [-1, 1].forEach((sg) => {
        ctx.beginPath(); ctx.moveTo(sg * 6, -2); ctx.lineTo(sg * 17, -28 + Math.sin(t * 6 + sg) * 2 * m); ctx.lineTo(sg * 20, -2); ctx.closePath();
        ctx.fillStyle = IM.cloth; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = pal.ink; ctx.lineJoin = 'round'; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sg * 9, -4); ctx.lineTo(sg * 16, -19); ctx.lineTo(sg * 17, -4); ctx.closePath(); ctx.fillStyle = IM.ind; ctx.fill();
      });
      ctx.restore();
      ctx.save();
      const fp = sp[sp.length - 2];
      ctx.translate(fp[0] + (head[0] - fp[0]) * 0.6, fp[1] + (head[1] - fp[1]) * 0.6); ctx.rotate(ang * 0.8);
      [-9, 9].forEach((ex) => eyeLive(ctx, ex, 0, 6, 7.4, { open, iris: ['#2a8ac8', IM.cyan], sclera: '#f4fbff', pupil: 'dot', pupilColor: '#0c2a48', glow: IM.cyan, glowK: 0.55 + 0.35 * hot, glowR: 2.8, lw: 2.2, look: [-0.5 - 0.4 * reach, 0.1], irisK: 0.85 }));
      const mo = 0.1 + 0.8 * reach + 0.5 * tele + 0.4 * hurt;
      ctx.beginPath(); ctx.ellipse(0, 15, 4.6 + 2 * mo, 1.6 + 4 * mo, 0, 0, TAU); ctx.fillStyle = '#3a4a88'; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = pal.ink; ctx.stroke();
      ctx.fillStyle = 'rgba(255,150,170,0.55)'; ctx.beginPath(); ctx.ellipse(-16, 9, 4, 2.4, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(16, 9, 4, 2.4, 0, 0, TAU); ctx.fill();
      tk.glow(ctx, 0, 4, 44, IM.cyan, cA((0.14 + 0.3 * hot) * (1 - die)));
      ctx.restore();
      ctx.restore();
    },
  });



  // ===============================================================================================================
  // public API and gallery sheets
  // ===============================================================================================================
  Object.keys(SPECS).forEach((id) => register(SPECS[id]));
  ART.enemy.warm2 = warm;
  ART.enemy.ids2 = () => Object.keys(SPECS);

  // workbench: params id (comma list or 'all'), pose (one, or 'all' for a row of every pose), zoom, t, pt, phase, hp
  const KEYPT = { idle: 0, attack: 0.21, hurt: 0.07, block: 0.2, buff: 0.16, die: 0.3, telegraph: 0.6 };
  function backdrop(ctx, W, H, t, gy) {
    tk.sky(ctx, 0, 0, W, H, 'night');
    tk.stars(ctx, 0, 0, W, gy * 0.7, t, { n: 50, seed: 12 });
    tk.moon(ctx, W * 0.82, H * 0.13, Math.min(W, H) * 0.05, { phase: 0.18 });
    for (let i = 0; i < 7; i++) {
      const lx = W * (0.06 + i * 0.155), ly = gy - H * (0.34 + 0.08 * Math.sin(i * 2.3));
      tk.glow(ctx, lx, ly, H * 0.11, i % 3 === 1 ? '#ff5a3a' : '#ffb04a', 0.16 + 0.05 * Math.sin(t * 2 + i));
    }
    tk.mist(ctx, 0, gy - H * 0.2, W, H * 0.3, t, { seed: 4, alpha: 0.12 });
    ctx.fillStyle = '#0a0918'; ctx.fillRect(0, gy, W, H - gy);
    const gg = ctx.createLinearGradient(0, gy - 26, 0, gy + 12);
    gg.addColorStop(0, 'rgba(60,90,160,0)'); gg.addColorStop(1, 'rgba(60,90,160,0.4)');
    ctx.fillStyle = gg; ctx.fillRect(0, gy - 26, W, 38);
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
  const NORMALS = ['chochin', 'karakuri_puppet', 'nopperabo', 'drowned_samurai', 'koi_spirit', 'tsukumogami', 'silk_weaver', 'nure_onna', 'rokurokubi', 'ittan_momen'];
  const ELITES = ['drowned_general', 'puppet_master', 'umibozu'];
  const MINIONS = ['spiderling', 'paper_puppet', 'lantern_wisp'];
  const dropShadowBg = (g, w, h, t, seed) => {
    tk.sky(g, 0, 0, w, h, 'night');
    tk.stars(g, 0, 0, w, h * 0.6, t, { n: 14, seed: seed || 3 });
    tk.glow(g, w * 0.2, h * 0.5, h * 0.4, '#ffb04a', 0.12);
    tk.glow(g, w * 0.85, h * 0.4, h * 0.36, '#ff5a3a', 0.1);
    g.fillStyle = 'rgba(10,9,24,0.75)'; g.fillRect(0, h * 0.88, w, h * 0.12);
  };
  const fitScale = (id, w, h, cap) => { const b = ART.enemy.bounds(id); return Math.min(h * 0.86 / (b.h + 14), w * 0.96 / (b.w + 10), cap || 2); };

  // every normal, elite and minion, each in three poses (params.poses = "idle,attack,telegraph" by default), fitted to its cell
  ART.sheet('enemies2', (canvas, params) => {
    const t = num(params.t, 0), poses = String(params.poses || 'idle,attack,telegraph').split(',').filter((p) => POSES.indexOf(p) >= 0);
    const ids = NORMALS.concat(ELITES, MINIONS), np = poses.length || 1;
    const cells = ids.map((id) => ({ id, label: id + '  (' + (DATA.enemies && DATA.enemies[id] ? DATA.enemies[id].tier : '') + ')' }));
    ART.sheetGrid(canvas, params, cells, (g, cell, w, h, i) => {
      dropShadowBg(g, w, h, t, i);
      const gy = h * 0.9, sc = fitScale(cell.id, w / np, h, 1.7);
      (poses.length ? poses : ['idle']).forEach((pose, k) => ART.enemy.draw(g, cell.id, { x: w * (k + 0.5) / np, y: gy, s: sc, pose, t: t + i * 0.37, pt: params.pt !== undefined ? params.pt : KEYPT[pose], phase: 0 }));
    }, { cols: 4, title: 'Chapter 2, the Sunken Lantern City: normals, elites, minions (' + poses.join(', ') + ')', gap: 6, labelH: 16 });
  });

  // the boss: both phases large in idle, then every pose of each phase underneath
  ART.sheet('boss2', (canvas, params) => {
    const g = canvas.getContext('2d'), W = params.w, H = params.h, t = num(params.t, 0), id = 'boss_jorogumo';
    tk.sky(g, 0, 0, W, H, 'night');
    tk.stars(g, 0, 0, W, H * 0.6, t, { n: 60, seed: 5 });
    tk.moon(g, W * 0.5, H * 0.08, H * 0.04, { phase: 0.2 });
    tk.mist(g, 0, H * 0.3, W, H * 0.4, t, { seed: 6, alpha: 0.12 });
    const topH = H * 0.6, gy = topH * 0.94, sc = Math.min(topH * 0.9 / 390, W * 0.46 / 560);
    [0, 1].forEach((ph) => {
      const cx = W * (0.25 + 0.5 * ph);
      g.fillStyle = 'rgba(10,9,24,0.7)'; g.fillRect(W * 0.5 * ph, gy, W * 0.5, topH - gy);
      ART.enemy.draw(g, id, { x: cx, y: gy, s: sc, pose: 'idle', t, pt: 0, phase: ph, hpPct: ph ? 0.4 : 1 });
      g.font = '700 15px system-ui'; g.fillStyle = '#f3e6c8'; g.textAlign = 'center'; g.fillText(ph ? 'phase 1: the Spider' : 'phase 0: the Courtesan', cx, topH - 6);
    });
    const poses = ['attack', 'hurt', 'block', 'buff', 'die', 'telegraph'], rowH = (H - topH) / 2, cw = W / poses.length, s2 = Math.min(rowH * 0.8 / 390, cw * 0.92 / 560);
    [0, 1].forEach((ph) => poses.forEach((pose, k) => {
      const x = cw * (k + 0.5), y = topH + rowH * ph + rowH * 0.88;
      g.fillStyle = 'rgba(10,9,24,0.5)'; g.fillRect(cw * k, topH + rowH * ph + rowH * 0.88, cw, rowH * 0.12);
      ART.enemy.draw(g, id, { x, y, s: s2, pose, t, pt: KEYPT[pose], phase: ph });
      g.font = '600 12px system-ui'; g.fillStyle = '#c9bff0'; g.textAlign = 'center'; g.fillText('phase ' + ph + ' ' + pose, x, topH + rowH * (ph + 1) - 3);
    }));
    tk.paperGrain(g, 0, 0, W, H, { alpha: 0.25 });
  });

  // film strips: two creatures (params.ids), each with an idle loop, an attack and a death across the pose (8 frames each)
  ART.sheet('enemies2_anim', (canvas, params) => {
    const ids = String(params.ids || 'drowned_samurai,koi_spirit').split(',').filter((id) => SPECS[id]).slice(0, 2), n = 8, t0 = num(params.t, 0), cells = [];
    ids.forEach((id) => {
      for (let i = 0; i < n; i++) cells.push({ id, kind: 'idle', i, label: id.split('_')[0] + ' idle ' + (i * 0.3).toFixed(1) + 's' });
      for (let i = 0; i < n; i++) cells.push({ id, kind: 'attack', i, label: 'attack ' + Math.round(i / (n - 1) * POSE_MS.attack) + 'ms' });
      for (let i = 0; i < n; i++) cells.push({ id, kind: 'die', i, label: 'die ' + Math.round(i / (n - 1) * POSE_MS.die) + 'ms' });
    });
    ART.sheetGrid(canvas, params, cells, (g, cell, w, h) => {
      dropShadowBg(g, w, h, t0, 2);
      const sc = fitScale(cell.id, w, h, 1.6), u = cell.i / (n - 1);
      const o = { x: w * 0.5, y: h * 0.9, s: sc, t: t0 + cell.i * (cell.kind === 'idle' ? 0.3 : 0.033) };
      if (cell.kind === 'idle') ART.enemy.draw(g, cell.id, Object.assign(o, { pose: 'idle', pt: 0 }));
      else ART.enemy.draw(g, cell.id, Object.assign(o, { pose: cell.kind, pt: u * POSE_MS[cell.kind] / 1000 }));
    }, { cols: n, title: 'Chapter 2 film strips: ' + ids.join(' and ') + ' (idle loop, attack, death)', gap: 4, labelH: 14 });
  });
})();
