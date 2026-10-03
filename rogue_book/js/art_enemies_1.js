// Inkwoven -- ART.enemy, chapter 1: the Whispering Bamboo Grove (forest spirits and folk monsters, golden dusk). Extends ART (art.js).
//
// PUBLIC API. Nothing new is exported beyond DESIGN 5.6: this file calls ART.enemy.register(id, {draw, bounds}) once for each of the 17 ids of
// chapter 1 (10 normals, 3 elites, 3 minions, the boss) and registers gallery sheets. Extras a reader may want:
//   ART.enemy.ch1 = { ids, audit(id), pointAt(id, name, o), warm(id, s), spec(id) }   dev helpers (audit reads pixels: never call it per frame)
//   Gallery sheets: enemies1 (every normal, elite and minion, several poses), boss1 (Kuzunoha in both phases and every pose),
//   enemies1_anim (film strips of two enemies, params a= b=), enemy1_dev (params id=kappa[,..]|all pose= zoom= t= pt= phase= grove=0|1).
//
// HOW IT IS BUILT (read this before touching a creature)
//   Every creature is a 2D cutout puppet, the same trick as art_heroes.js. Each PART (a head, an arm, a shell, a tail) is drawn ONCE at rest by
//   a function that uses the toolkit (celFill, ribbon, eye ...), cached as a sprite per raster scale (ART.sprite) and composited every frame under
//   a matrix built from the pose. Bending things (tails, ribbons, cloth) are ART.tk.chain parts. Faces are baked per state (eyes x mouth) and
//   blink by swapping states. Only glows, sparks, spores, flames and other effects are drawn live, and they are cheap (cached glow sprites).
//   A part is {id, box:[x0,y0,x1,y1] (rest space, PAD is added), parent, pivot:[x,y], xf(K, t, st) -> {dx,dy,rot,sx,sy}, draw(S, variant)}, or
//   {chain:{spine, cuts, reach}, bends(K, t, st)}, or {states, draw(S, state)} for faces, or {live(ctx, st)}. Rest space: feet at the origin, y negative is up,
//   the creature faces LEFT. K is the pose channel dictionary (poseK): body offset, lean and squash plus the semantic channels wind (anticipation),
//   strike (the blow), guard, buff, flash, hurt, alert, die, and the face (eyes, mouth). Parts read the channels, so every creature answers every pose.
//   Arms swing with rot = A * wind - B * strike (wind raises the weapon, strike brings it down), which reads as a wind-up and a blow on every creature.
//   Poses: one-shots (attack hurt block buff die) derive from pt and hold their end pose; telegraph ramps up over 0.34 s and then holds with a
//   tremble; idle is a loop of t. Death is generic: the body is cut into torn strips that drift away and thin out, with themed bits and a soul orb.
//   Determinism: no clock and no Math.random; every draw is a pure function of (id, pose, t, pt, phase) plus the sprite cache.
(() => {
  'use strict';
  const tk = ART.tk, pal = tk.pal, mat = tk.mat;
  const clamp = tk.clamp, lerp = tk.lerp, num = tk.num, track = tk.track;
  const TAU = Math.PI * 2, PI = Math.PI;
  const SPECS = {};
  const POSE_MS = { attack: 420, hurt: 260, block: 300, buff: 400, die: 700, telegraph: 0, idle: 0 };
  const LIGHT = -2.1;                             // key light for creatures: up and to the LEFT, so the faces they turn toward the heroes are lit
  const PAD = 10;                                 // every part box grows by this so outlines, rims and grain never clip
  const cA = (a) => (a >= 0 ? (a <= 1 ? a : 1) : 0);
  const smooth = tk.smoothstep;
  const sin = Math.sin, cos = Math.cos;

  // ---------------------------------------------------------------------------------------------------------------
  // small shape helpers (rest space)
  // ---------------------------------------------------------------------------------------------------------------
  const ell = (cx, cy, rx, ry, n, rot) => tk.ellipsePts(cx, cy, rx, ry, n || 14, rot || 0);
  const rrectPts = tk.rrectPts;
  // an organic blob: an ellipse whose radius wobbles a little per point (deterministic per seed)
  function blob(cx, cy, rx, ry, seed, amt, n, rot) {
    n = n || 14; amt = amt === undefined ? 0.06 : amt;
    const r = tk.rng('en1blob', seed || 0), out = [], c = cos(rot || 0), s = sin(rot || 0);
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU, k = 1 + (r() * 2 - 1) * amt, x = cos(a) * rx * k, y = sin(a) * ry * k;
      out.push([cx + x * c - y * s, cy + x * s + y * c]);
    }
    return out;
  }
  // a colour set from one base: base, shadow, light, deep
  const cs = (base) => ({ b: base, s: tk.shade(base), l: tk.tint(base, 0.32), d: tk.deep(base, 0.5) });
  const rgba = tk.rgba;
  const P = (x, y) => [x, y];
  // a soft-edged closed polygon with fur tufts along a spine: widths[i] is the full width at spine[i]; tuft is the extra spike length
  function furShape(spine, widths, tuft, seed, tension) {
    const d = tk.flatten(spine, { step: 9 }), m = d.length >> 1, L = [0];
    for (let i = 1; i < m; i++) L.push(L[i - 1] + Math.hypot(d[2 * i] - d[2 * i - 2], d[2 * i + 1] - d[2 * i - 1]));
    const total = L[m - 1] || 1, left = [], right = [], r = tk.rng('en1fur', seed || 0);
    const wAt = (u) => { const f = u * (widths.length - 1), i = Math.min(widths.length - 2, Math.floor(f)); return lerp(widths[i], widths[i + 1], f - i); };
    for (let i = 0; i < m; i++) {
      const a = i > 0 ? i - 1 : 0, b = i < m - 1 ? i + 1 : m - 1;
      let tx = d[2 * b] - d[2 * a], ty = d[2 * b + 1] - d[2 * a + 1];
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const w = wAt(L[i] / total) / 2, spk = (i % 2 ? 1 : 0) * tuft * (0.6 + r() * 0.8);
      const nx = -ty, ny = tx;
      left.push([d[2 * i] + nx * (w + spk), d[2 * i + 1] + ny * (w + spk), spk > 0.5 ? 1 : 0]);
      right.push([d[2 * i] - nx * (w + (i % 2 ? 0 : tuft * (0.6 + r() * 0.8))), d[2 * i + 1] - ny * (w + (i % 2 ? 0 : tuft * 0.7)), 0]);
    }
    const out = left.concat(right.reverse());
    void tension;
    return out.map((p) => (p[2] ? [p[0], p[1], 1] : [p[0], p[1]]));
  }
  // a tapered four-point tube around a segment (blades, thorns, claws, spikes)
  function taper(x0, y0, x1, y1, w0, w1) {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    return [[x0 + nx * w0 / 2, y0 + ny * w0 / 2], [x1 + nx * w1 / 2, y1 + ny * w1 / 2], [x1 - nx * w1 / 2, y1 - ny * w1 / 2], [x0 - nx * w0 / 2, y0 - ny * w0 / 2]];
  }
  // a point and tangent at fraction u along a spine (control points), for stripes, spots and ornaments that follow a tail or a limb
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
  // a stripe across a ribbon-shaped part at fraction u (used inside a decor callback, so it is clipped to the part)
  function stripe(g, spine, u, w, len, color) {
    const p = spineAt(spine, u);
    g.save(); g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'butt';
    g.beginPath(); g.moveTo(p.x - p.ty * len, p.y + p.tx * len); g.lineTo(p.x + p.ty * len, p.y - p.tx * len); g.stroke(); g.restore();
  }
  // a stable table of random numbers per (spec, key): particle systems read it instead of hashing strings every frame
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
    S.cel = (pts, base, o) => tk.celFill(g, pts, base, Object.assign({ light: LIGHT, line: lw, rim: c.rim, rimW: 1.7, rimAlpha: 0.85, hi: 'auto', hiW: 2 }, o));
    S.blob = (cx, cy, rx, ry, base, o) => S.cel(ell(cx, cy, rx, ry, clamp(Math.round(Math.max(rx, ry) / 3) + 8, 10, 22)), base, o);
    // a smooth tapered limb along a spine (w0 at the root, w1 at the tip, round caps), shaded as ONE shape so joints never step
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
      S.cel(poly, base, Object.assign({ depth: clamp(Math.min(w0, w1) * 0.42, 2, 8), line: lw * 0.9, tension: 0.85, seed: o.seed }, o));
    };
    S.limb = (spine, base, w0, w1, o) => S.tube(spine, w0, w1, base, o);
    S.ln = (pts, o) => tk.inkPath(g, pts, Object.assign({ w: 1.5, color: pal.ink }, o));
    S.fill = (pts, color, alpha) => { g.save(); if (alpha !== undefined) g.globalAlpha *= cA(alpha); g.beginPath(); tk.trace(g, pts); g.fillStyle = color; g.fill(); g.restore(); };
    S.gloss = (spine, w, alpha, color) => tk.gloss(g, spine, { w, alpha, color });
    S.dot = (x, y, r, color, alpha) => { g.save(); if (alpha !== undefined) g.globalAlpha *= cA(alpha); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = color; g.fill(); g.restore(); };
    S.clip = (pts) => { g.beginPath(); tk.trace(g, pts); g.clip(); };
    S.eye = (x, y, w, h, state, o) => {
      const map = { open: 'neutral', half: 'half', closed: 'closed', hurt: 'hurt', angry: 'angry', wide: 'wide', happy: 'happy', sleepy: 'sleepy', smirk: 'smirk' };
      tk.eye(g, x, y, w, h, Object.assign({ expr: map[state] || 'neutral', side: 1, lineW: Math.max(1.1, w * 0.085) }, o));
    };
    // simple eyes for creatures that are not anime-faced. states: open half closed hurt angry wide. o: color (glow), pupil, w, h
    S.bead = (x, y, r, state, o) => {
      o = o || {};
      const ink = pal.ink;
      if (state === 'closed' || state === 'hurt') {
        if (state === 'hurt') { S.ln([[x - r, y - r * 0.8], [x + r * 0.4, y]], { w: 2.2, taper: 0.2, pressure: 'flat' }); S.ln([[x - r, y + r * 0.8], [x + r * 0.4, y]], { w: 2.2, taper: 0.2, pressure: 'flat' }); return; }
        S.ln([[x - r, y], [x, y + r * 0.45], [x + r, y - r * 0.1]], { w: 2.4, taper: 0.3 }); return;
      }
      const g = S.g;
      g.save(); g.beginPath(); g.ellipse(x, y, r, r * (state === 'wide' ? 1.15 : 1), 0, 0, TAU); g.fillStyle = o.sclera || o.color || ink; g.fill(); g.clip();
      if (o.iris) {
        const ig = g.createLinearGradient(0, y - r, 0, y + r); ig.addColorStop(0, o.iris); ig.addColorStop(1, o.iris2 || o.iris);
        g.fillStyle = ig; g.beginPath(); g.ellipse(x, y + r * 0.08, r * 0.74, r * 0.82, 0, 0, TAU); g.fill();
        g.fillStyle = o.pupil || ink; g.beginPath(); g.ellipse(x, y + r * 0.05, r * 0.36, r * 0.5, 0, 0, TAU); g.fill();
      }
      g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.ellipse(x - r * 0.3, y - r * 0.32, r * 0.3, r * 0.34, 0, 0, TAU); g.fill();
      g.beginPath(); g.arc(x + r * 0.35, y + r * 0.35, r * 0.13, 0, TAU); g.fill();
      if (state === 'half' || state === 'angry') {
        g.fillStyle = o.lid || o.lidColor || ink; g.beginPath();
        if (state === 'half') { g.rect(x - r * 1.2, y - r * 1.2, r * 2.4, r * 1.25); } else { g.moveTo(x - r * 1.2, y - r * 1.3); g.lineTo(x + r * 1.2, y - r * 1.3); g.lineTo(x + r * 1.2, y - r * 0.05 - (o.tilt || 0.9) * r * 0.5); g.lineTo(x - r * 1.2, y - r * 0.05 + (o.tilt || 0.9) * r * 0.5); }
        g.closePath(); g.fill();
      }
      g.restore();
      tk.inkPath(g, ell(x, y, r, r * (state === 'wide' ? 1.15 : 1), 12), { closed: true, w: 1.8, color: ink, align: 0 });
      if (state === 'half' || state === 'angry') tk.inkPath(g, state === 'half' ? [[x - r, y - r * 0.05], [x + r, y - r * 0.05]] : [[x - r, y - r * 0.05 + (o.tilt || 0.9) * r * 0.5], [x + r, y - r * 0.05 - (o.tilt || 0.9) * r * 0.5]], { w: 2.4, color: ink, taper: 0.1, pressure: 'flat' });
    };
    // a hollow glowing eye: a dark socket with a bright core (the live glow is added by the creature)
    S.hollow = (x, y, w, h, state, o) => {
      o = o || {};
      const g = S.g, ink = pal.ink;
      if (state === 'closed') { S.ln([[x - w / 2, y], [x, y + h * 0.16], [x + w / 2, y]], { w: 2.4, taper: 0.3 }); return; }
      if (state === 'hurt') { S.ln([[x - w / 2, y - h / 2], [x + w / 2, y + h / 2]], { w: 2.4, taper: 0.2, pressure: 'flat' }); S.ln([[x - w / 2, y + h / 2], [x + w / 2, y - h / 2]], { w: 2.4, taper: 0.2, pressure: 'flat' }); return; }
      const hh = h * (state === 'half' ? 0.55 : state === 'wide' ? 1.15 : 1);
      g.save(); g.beginPath(); g.ellipse(x, y + (h - hh) / 2, w / 2, hh / 2, 0, 0, TAU); g.fillStyle = o.socket || '#1a1030'; g.fill(); g.clip();
      const gr = g.createRadialGradient(x, y, 0, x, y, Math.max(w, h) * 0.5); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, o.color || '#c8ff5a'); gr.addColorStop(1, rgba(o.color || '#c8ff5a', 0));
      g.fillStyle = gr; g.fillRect(x - w, y - h, w * 2, h * 2);
      if (state === 'angry') { g.fillStyle = o.socket || '#1a1030'; g.beginPath(); g.moveTo(x - w, y - h); g.lineTo(x + w, y - h); g.lineTo(x + w, y - h * 0.05 - h * 0.28); g.lineTo(x - w, y - h * 0.05 + h * 0.28); g.closePath(); g.fill(); }
      g.restore();
      tk.inkPath(g, ell(x, y + (h - hh) / 2, w / 2, hh / 2, 12), { closed: true, w: 1.8, color: ink, align: 0 });
    };
    return S;
  }

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
      const p = clamp(u / 700, 0, 1);
      K.die = p; K.flash = clamp(1 - p * 4.5, 0, 1);
      const r = clamp(p / 0.2, 0, 1);
      K.bx = 16 * tk.ease.outQuad(r); K.brot = 0.16 * tk.ease.outQuad(r); K.bsy = 1 + 0.04 * r; K.bsx = 1 - 0.06 * r;
      K.eyes = 'hurt'; K.mouth = 'open';
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
  function grainOver(g, x, y, w, h) {
    g.save(); g.globalCompositeOperation = 'source-atop';
    tk.paperGrain(g, x, y, w, h, { alpha: 0.8, force: true });
    g.restore();
  }
  function partSprite(spec, part, q, variant, state, flash) {
    const b = boxOf(part), w = b[2] - b[0], h = b[3] - b[1];
    const key = 'en1|' + spec.id + '|' + (part.share || part.id) + '|' + (variant || '') + '|' + (state || '') + (flash ? '|f' : '') + '|' + q;
    return ART.sprite(key, w * q, h * q, (g) => {
      g.scale(q, q); g.translate(-b[0], -b[1]);
      part.draw(makeS(g, spec, variant), state || variant);
      if (flash) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#fff8f0'; g.fillRect(b[0] - 4, b[1] - 4, w + 8, h + 8); } else grainOver(g, b[0], b[1], w, h);
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
        if (flash) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#fff8f0'; g.fillRect(-900, -900, 1800, 1800); } else grainOver(g, -600, -600, 1200, 1200);
      },
    });
    part._chains[ck] = c;
    return c;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // effects shared by every creature (all drawn live, all cheap)
  // ---------------------------------------------------------------------------------------------------------------
  const FX = {};
  // a small themed bit: a leaf, petal, drop, ember, paper scrap, ink blot, spore, feather or dust mote centred at (x, y)
  FX.bit = (ctx, kind, x, y, sz, rot, a, c1, c2) => {
    if (!(a > 0.02) || !(sz > 0.3)) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha *= cA(a);
    if (kind === 'leaf') {
      ctx.beginPath(); ctx.moveTo(-sz, 0); ctx.quadraticCurveTo(0, -sz * 0.7, sz, 0); ctx.quadraticCurveTo(0, sz * 0.7, -sz, 0);
      ctx.fillStyle = c1 || '#79c24f'; ctx.fill(); ctx.lineWidth = Math.max(0.8, sz * 0.12); ctx.strokeStyle = pal.ink; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-sz * 0.8, 0); ctx.lineTo(sz * 0.7, 0); ctx.lineWidth = Math.max(0.6, sz * 0.07); ctx.strokeStyle = c2 || '#2f6a2a'; ctx.stroke();
    } else if (kind === 'petal') {
      ctx.restore(); tk.petal(ctx, x, y, sz, rot, a, c1 || '#ffc2dc'); return;
    } else if (kind === 'drop') {
      ctx.beginPath(); ctx.moveTo(0, -sz * 1.3); ctx.bezierCurveTo(sz * 0.9, -sz * 0.2, sz * 0.8, sz * 0.9, 0, sz * 0.9); ctx.bezierCurveTo(-sz * 0.8, sz * 0.9, -sz * 0.9, -sz * 0.2, 0, -sz * 1.3);
      ctx.fillStyle = c1 || '#9ff0f2'; ctx.fill(); ctx.lineWidth = Math.max(0.8, sz * 0.14); ctx.strokeStyle = c2 || '#0f6a78'; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(-sz * 0.25, sz * 0.1, sz * 0.16, sz * 0.32, 0.2, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
    } else if (kind === 'ember') {
      ctx.restore(); tk.glow(ctx, x, y, sz * 2.6, c1 || '#ff9a2e', a * 0.9); tk.sparkle(ctx, x, y, sz * 1.2, { color: c2 || '#ffe9a8', alpha: a, rot, glow: 0 }); return;
    } else if (kind === 'paper') {
      ctx.beginPath(); ctx.moveTo(-sz, -sz * 0.7); ctx.lineTo(sz * 0.9, -sz * 0.8); ctx.lineTo(sz * 0.6, sz * 0.5); ctx.lineTo(-sz * 0.8, sz * 0.8); ctx.closePath();
      ctx.fillStyle = c1 || pal.paper; ctx.fill(); ctx.lineWidth = Math.max(0.8, sz * 0.1); ctx.strokeStyle = pal.ink; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-sz * 0.1, -sz * 0.75); ctx.lineTo(sz * 0.05, sz * 0.65); ctx.lineWidth = Math.max(0.6, sz * 0.06); ctx.strokeStyle = c2 || '#b9a070'; ctx.stroke();
    } else if (kind === 'ink') {
      ctx.beginPath(); ctx.arc(0, 0, sz, 0, TAU); ctx.fillStyle = c1 || pal.ink; ctx.fill();
      ctx.beginPath(); ctx.arc(-sz * 0.3, -sz * 0.3, sz * 0.28, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill();
    } else if (kind === 'feather') {
      ctx.beginPath(); ctx.moveTo(-sz * 1.2, 0); ctx.quadraticCurveTo(0, -sz * 0.6, sz * 1.2, sz * 0.1); ctx.quadraticCurveTo(0, sz * 0.5, -sz * 1.2, 0);
      ctx.fillStyle = c1 || '#2a2445'; ctx.fill(); ctx.lineWidth = Math.max(0.7, sz * 0.1); ctx.strokeStyle = pal.ink; ctx.stroke();
    } else {                                                                     // spore, dust
      ctx.restore(); tk.glow(ctx, x, y, sz * 2, c1 || '#c8ff5a', a * 0.8, kind === 'dust' ? false : true); return;
    }
    ctx.restore();
  };
  // a page torn from the book: curled corner, ruled lines of brush script and one violet glyph. size = half the width
  FX.page = (ctx, x, y, sz, rot, a, glowc) => {
    if (!(a > 0.02)) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha *= cA(a);
    if (glowc) tk.glow(ctx, 0, 0, sz * 2.2, glowc, 0.28);
    const w = sz, h = sz * 1.35;
    ctx.beginPath(); ctx.moveTo(-w, -h); ctx.quadraticCurveTo(0, -h - 3, w, -h + 1); ctx.lineTo(w + 1, h - 8); ctx.lineTo(w - 9, h); ctx.quadraticCurveTo(0, h + 3, -w, h - 1); ctx.closePath();
    ctx.fillStyle = '#f6ecd0'; ctx.fill(); ctx.lineWidth = Math.max(1.4, sz * 0.13); ctx.strokeStyle = pal.ink; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w + 1, h - 8); ctx.lineTo(w - 9, h); ctx.lineTo(w - 8, h - 9); ctx.closePath(); ctx.fillStyle = '#d8c090'; ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(26,16,48,0.75)'; ctx.lineWidth = Math.max(1, sz * 0.1); ctx.lineCap = 'round';
    [-0.55, -0.2, 0.15, 0.5].forEach((f, i) => { ctx.beginPath(); ctx.moveTo(-w * 0.62, h * f); ctx.quadraticCurveTo(0, h * f + (i % 2 ? 2 : -2), w * (0.62 - (i === 3 ? 0.4 : 0)), h * f); ctx.stroke(); });
    ctx.fillStyle = 'rgba(143,95,232,0.85)'; ctx.beginPath(); ctx.arc(w * 0.28, -h * 0.72, sz * 0.2, 0, TAU); ctx.fill();
    ctx.restore();
  };
  // a rising soul orb: the last thing a dying spirit leaves behind
  FX.orb = (ctx, x, y, r, color, a) => {
    if (!(a > 0.02)) return;
    tk.glow(ctx, x, y, r * 3, color, 0.55 * a);
    ctx.save(); ctx.globalAlpha *= cA(a); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = '#fffaf0'; ctx.fill(); ctx.restore();
    tk.sparkle(ctx, x, y, r * 2.2, { color: '#ffffff', alpha: a, glow: 0, rot: 0.3 });
  };
  // a calligraphic crescent: the mark a blow leaves in the air. Angles in radians (canvas orientation), sweeping a0 to a1.
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
  // manga tension ticks: pairs of short dashes radiating from (x, y), the shiver of a wind-up
  FX.ticks = (ctx, x, y, r0, r1, n, t, color, a) => {
    if (!(a > 0.02)) return;
    ctx.save(); ctx.globalAlpha *= cA(a); ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const ang = i / n * TAU + 0.4 + 0.06 * sin(t * 30 + i), on = sin(t * 19 + i * 2.3) > -0.35;
      if (!on) continue;
      const c = cos(ang), s2 = sin(ang), px = -s2 * 2.6, py = c * 2.6;
      ctx.strokeStyle = pal.ink; ctx.lineWidth = 4.6;
      ctx.beginPath(); ctx.moveTo(x + c * r0, y + s2 * r0); ctx.lineTo(x + c * r1, y + s2 * r1); ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(x + c * r0, y + s2 * r0); ctx.lineTo(x + c * r1, y + s2 * r1); ctx.stroke();
      void px; void py;
    }
    ctx.restore();
  };

  // an impact dust ring at (x, y) growing with u 0..1 (a heavy blow landing on the ground)
  FX.dust = (ctx, x, y, u, s, color) => {
    if (!(u > 0.02) || u >= 1) return;
    const a = (1 - u) * 0.75;
    for (let i = 0; i < 7; i++) {
      const side = i % 2 ? 1 : -1, d = (14 + (i >> 1) * 20) * u * s, r = (6 + (i >> 1) * 3) * (0.5 + u) * s;
      ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = color || '#f3e6c8';
      ctx.beginPath(); ctx.arc(x + side * d, y - r * 0.6 - u * 8 * s, r, 0, TAU); ctx.fill();
      ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(20,15,46,0.5)'; ctx.stroke(); ctx.restore();
    }
  };

  // ---------------------------------------------------------------------------------------------------------------
  // defining and drawing a creature
  // ---------------------------------------------------------------------------------------------------------------
  function define(spec) {
    const H = DATA.LISTS.sizeHeight[spec.size] || 170;
    spec.h = spec.h || H;
    spec.lw = spec.lw || (spec.size === 's' ? 2.1 : spec.size === 'm' ? 2.5 : spec.size === 'l' ? 3 : 3.5);
    spec.col = Object.assign({ rim: '#ffdf9a' }, spec.col);
    spec.acc = spec.acc || '#ffe9a8';
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
  // draw the whole creature body (underlays, parts, overlays) for one pose state
  function drawBody(ctx, st) {
    const spec = st.spec, K = st.K, M = st.M, q = st.q, t = st.t;
    if (spec.under) spec.under(ctx, st);
    const parts = spec.parts;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.when && !part.when(st)) continue;
      const bm = M[part.id];
      ctx.save();
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
  // torn strip boundaries for the death dissolve: N + 1 curves across the box, shared by neighbouring strips so no seams show
  function tearLines(spec, N, box) {
    const key = spec.id + '|tear|' + N;
    let tl = TABLES.get(key);
    if (tl) return tl;
    const r = tk.rng('en1tear', spec.id), w = box[2] - box[0], h = box[3] - box[1], K = 8;
    tl = [];
    for (let i = 0; i <= N; i++) {
      const line = [];
      for (let k = 0; k <= K; k++) {
        const y0 = box[1] + h * i / N + (i > 0 && i < N ? (r() * 2 - 1) * h / N * 0.42 : 0);
        line.push([box[0] - 30 + (w + 60) * k / K, i === 0 ? box[1] - 60 : i === N ? box[3] + 40 : y0]);
      }
      tl.push(line);
    }
    TABLES.set(key, tl);
    return tl;
  }
  function drawDie(ctx, st) {
    const spec = st.spec, K = st.K, p = K.die, dz = spec.die || {}, box = spec.dieBox || [-70, -spec.h, 70, 0];
    const N = dz.strips || 7, tl = tearLines(spec, N, box), m = tk.motion();
    const dir = dz.dir === undefined ? 1 : dz.dir;
    const q = (i) => clamp((p - 0.1 - i * (dz.stagger || 0.062)) / 0.46, 0, 1);
    // strips that have not started moving are drawn once through a single union clip so no seams show
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < N; i++) if (q(i) <= 0) { const a = tl[i], b = tl[i + 1]; ctx.moveTo(a[0][0], a[0][1]); for (let k = 1; k < a.length; k++) ctx.lineTo(a[k][0], a[k][1]); for (let k = b.length - 1; k >= 0; k--) ctx.lineTo(b[k][0], b[k][1]); ctx.closePath(); }
    ctx.clip();
    drawBody(ctx, st);
    ctx.restore();
    const rr = table(spec.id + 'dieStrip', N, 4);
    for (let i = 0; i < N; i++) {
      const qi = q(i);
      if (qi <= 0 || qi >= 1) continue;
      const a = tl[i], b = tl[i + 1], e = tk.ease.inQuad(qi), cy = (a[0][1] + b[0][1]) / 2;
      ctx.save();
      ctx.beginPath(); ctx.moveTo(a[0][0], a[0][1]); for (let k = 1; k < a.length; k++) ctx.lineTo(a[k][0], a[k][1]); for (let k = b.length - 1; k >= 0; k--) ctx.lineTo(b[k][0], b[k][1]); ctx.closePath(); ctx.clip();
      ctx.globalAlpha *= cA(1 - Math.pow(qi, 1.3));
      ctx.translate(dir * e * (30 + 46 * rr[i][0]) * (0.4 + 0.6 * m), -e * (18 + 26 * rr[i][1]) * (0.4 + 0.6 * m));
      ctx.translate(0, cy); ctx.rotate(dir * e * (rr[i][2] - 0.35) * 0.35); ctx.scale(1 + 0.12 * e, 1 - 0.3 * e); ctx.translate(0, -cy);
      drawBody(ctx, st);
      ctx.restore();
    }
    // themed bits fly off the torn edges, and the soul orb leaves the chest at the end
    const bits = table(spec.id + 'dieBits', 26, 6), col = dz.colors || ['#ffc2dc', '#ffffff'];
    const w = box[2] - box[0], h = box[3] - box[1];
    for (let i = 0; i < bits.length; i++) {
      const b = bits[i], sp = 0.1 + b[0] * 0.5, life = clamp((p - sp) / 0.5, 0, 1);
      if (life <= 0 || life >= 1) continue;
      const sx = box[0] + b[1] * w, sy = box[1] + (0.12 + b[2] * 0.8) * h;
      const x = sx + dir * (life * (40 + 90 * b[3])) * (0.5 + 0.5 * m) + sin(life * 6 + b[4] * 6) * 8 * m;
      const y = sy - life * (26 + 80 * b[5]) * (0.5 + 0.5 * m) + (dz.gravity ? life * life * dz.gravity * h * 0.5 : 0);
      FX.bit(ctx, dz.kind || 'petal', x, y, (dz.size || 5) * (0.7 + b[3] * 0.6), life * 7 + b[4] * 6, sin(life * PI) * 0.95, col[i % col.length], col[(i + 1) % col.length]);
    }
    if (spec.dieExtra) spec.dieExtra(ctx, st, p);
    const orb = clamp((p - 0.5) / 0.5, 0, 1);
    if (orb > 0) { const oc = dz.orb || spec.acc; FX.orb(ctx, (box[0] + box[2]) / 2 + dir * orb * 14, box[1] + h * (0.55 - 0.5 * orb), 4 + 4 * sin(orb * PI), oc, sin(orb * PI) * 0.95); }
  }
  // the overlays every pose shares: hit spark, buff ring, telegraph flare, strike speed lines, guard glint
  function poseFx(ctx, st) {
    const spec = st.spec, K = st.K, t = st.t, pt = st.pt, acc = spec.acc, hp = spec.hitAt || [0, -spec.h * 0.55], m = tk.motion();
    const at = (id, x, y) => (id ? st.at(id, x, y) : [x, y]);
    if (K.alert > 0.02) {
      const c = at(spec.alertBone, spec.alertAt ? spec.alertAt[0] : 0, spec.alertAt ? spec.alertAt[1] : -spec.h * 0.6), pl = 0.6 + 0.4 * sin(t * 14), ac = spec.alertColor || '#ffb340';
      tk.glow(ctx, c[0], c[1], spec.h * (0.4 + 0.3 * K.wind) * (0.9 + 0.1 * pl), acc, 0.42 * K.alert * pl);
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
        FX.arc(ctx, c[0], c[1], A.r, a0, a1, A.w || 12, '#fff8f0', 0.95 * fade);
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
      tk.glow(ctx, c[0], c[1], spec.h * 0.7, acc, 0.5 * K.buff);
      ctx.save(); ctx.globalAlpha *= 0.9 * (1 - u); ctx.strokeStyle = acc; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(c[0], c[1] + spec.h * 0.42, spec.h * (0.15 + 0.32 * u), spec.h * (0.04 + 0.08 * u), 0, 0, TAU); ctx.stroke(); ctx.restore();
      for (let i = 0; i < 6; i++) { const ph = (u * 1.2 + i * 0.17) % 1; tk.sparkle(ctx, c[0] + (i - 2.5) * spec.h * 0.07, c[1] + spec.h * 0.3 - ph * spec.h * 0.75, 4 + (i % 2) * 2, { color: i % 2 ? '#ffffff' : acc, alpha: sin(ph * PI), glow: 0.3 }); }
    }
    if (K.guard > 0.05) {
      const c = at(spec.guardBone, -spec.h * 0.32, -spec.h * 0.5);
      ctx.save(); ctx.globalAlpha *= 0.85 * K.guard; ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(c[0] + 12, c[1], spec.h * (0.32 + i * 0.06), PI * (0.78 + i * 0.03), PI * (1.22 - i * 0.03)); ctx.stroke(); }
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
  // THE CREATURES
  // ===============================================================================================================
  // (defined below, one block per creature)
  // ---------------------------------------------------------------------------------------------------------------
  // KAPPA (normal, m): a river imp with a pond on his head and a great deal of pride. Accent: the glowing dish water.
  // ---------------------------------------------------------------------------------------------------------------
  const webFoot = (x, y, w) => [[x + 8, y - 4], [x - 4, y - 11], [x - w * 0.5, y - 7], [x - w * 0.86, y - 2], [x - w, y + 1], [x - w * 0.94, y + 5], [x - w * 0.76, y + 3], [x - w * 0.64, y + 7], [x - w * 0.44, y + 4], [x - w * 0.3, y + 7], [x - w * 0.06, y + 5], [x + 10, y + 5]];
  define({
    id: 'kappa', size: 'm', acc: '#5ff5ff', lunge: 46,
    col: { rim: '#bff5ee', skin: cs('#55b87a'), belly: '#efe3a4', shell: cs('#94623a'), beak: cs('#ffc94d'), hair: cs('#2a2244'), rope: '#e9d9a2', cuke: cs('#46a544') },
    hitAt: [-10, -112], alertAt: [-8, -120], hitBone: 'head', alertBone: 'head', buffBone: 'body', guardBone: 'body',
    arc: { bone: 'body', x: -22, y: -92, r: 54, a0: -1.2, a1: -4.4, w: 11, color: '#bff5ee' },
    bounds: { w: 150, h: 174, head: { x: -8, y: -142 }, body: { x: 0, y: -76 }, feet: { x: 0, y: 0 } },
    die: { kind: 'drop', colors: ['#9ff0f2', '#55b87a', '#ffffff'], orb: '#bff5ee', gravity: 0.9, size: 5 },
    dieBox: [-60, -172, 60, 0],
    parts: [
      { id: 'shell', box: [-6, -122, 60, -40], parent: 'body', pivot: [26, -78],
        xf: (K, t) => ({ rot: 0.03 * sin(t * 1.9) - 0.12 * K.guard, dy: -8 * K.guard }),
        draw(S) {
          const c = S.c, sh = c.shell;
          S.cel(blob(30, -80, 27, 39, 4, 0.03, 18, 0.2), sh.b, { depth: 9, halftone: { d: 4.4, alpha: 0.3 }, rim: '#ffd889',
            decor: (g) => {
              g.strokeStyle = rgba(sh.d, 0.75); g.lineWidth = 1.7; g.lineCap = 'round';
              const hx = 31, hy = -80, R = 13;
              g.beginPath(); for (let i = 0; i <= 6; i++) { const a = i / 6 * TAU + 0.4; g.lineTo(hx + cos(a) * R, hy + sin(a) * R * 1.15); } g.stroke();
              for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.4; g.beginPath(); g.moveTo(hx + cos(a) * R, hy + sin(a) * R * 1.15); g.lineTo(hx + cos(a) * 40, hy + sin(a) * 46); g.stroke(); }
              g.fillStyle = rgba(sh.l, 0.35); g.beginPath(); tk.trace(g, ell(hx - 3, hy - 3, R * 0.7, R * 0.8, 6)); g.fill();
              g.strokeStyle = rgba('#ffd889', 0.5); g.lineWidth = 2.2; g.beginPath(); g.ellipse(30, -80, 22, 33, 0.2, 3.7, 5.2); g.stroke();
            } });
        } },
      ...arm2({
        id: 'armB', parent: 'body', sh: [12, -92], el: [-1, -82], wrist: [-13, -66], w: [15, 12, 11], hr: 14, bend: -2,
        color: tk.shade('#55b87a', 0.2),
        a1: (K, t) => ({ rot: 0.05 * sin(t * 1.6 + 1) + 0.9 * K.wind + 0.3 * K.strike + 0.6 * K.guard }),
        a2: (K, t) => ({ rot: 0.08 * sin(t * 1.9 + 1) + 0.6 * K.wind + 0.4 * K.strike + 1.6 * K.guard }),
        hand: (S, x, y) => { const dk = tk.shade(S.c.skin.b, 0.2); S.cel(blob(x - 2, y + 3, 9, 8, 2, 0.1, 9), dk, { depth: 3, line: S.lw * 0.8 }); [-1, 0, 1].forEach((k) => S.cel(taper(x - 2 + k * 5, y + 8, x - 4 + k * 6, y + 17, 5, 2), '#efe3c0', { depth: 1, line: 1.4, rim: null, hi: false })); },
      }),
      { id: 'legB', box: [-2, -50, 38, 4], parent: 'root', pivot: [16, -46],
        xf: (K, t) => ({ rot: 0.03 * sin(t * 3.2 + 2) }),
        draw(S) {
          const dk = tk.shade(S.c.skin.b, 0.2);
          S.limb([[16, -46], [19, -30], [17, -14]], dk, 21, 16, { bulge: 0.1 });
          S.cel(webFoot(30, -6, 34), dk, { depth: 3, line: S.lw * 0.9, tension: 0.55, hi: false });
        } },
      { id: 'body', box: [-40, -110, 44, -36], parent: 'root', pivot: [0, -38],
        xf: (K, t, st) => ({ sy: 1 + 0.022 * sin(t * 2.2) * st.m - 0.02 * K.guard, sx: 1 - 0.012 * sin(t * 2.2) * st.m }),
        draw(S) {
          const c = S.c, g = S.g, sk = c.skin;
          const pear = [[0, -104], [18, -98], [30, -80], [33, -58], [24, -42], [2, -38], [-22, -42], [-31, -58], [-28, -80], [-16, -98]];
          S.cel(pear, sk.b, { depth: 10, halftone: { d: 4.6, alpha: 0.26 },
            decor: (gg) => {
              gg.beginPath(); tk.trace(gg, blob(-10, -62, 21, 25, 6, 0.04, 12)); gg.fillStyle = c.belly; gg.fill();
              gg.strokeStyle = rgba('#a89a5a', 0.7); gg.lineWidth = 1.5;
              [-72, -62, -52].forEach((y, i) => { gg.beginPath(); gg.moveTo(-28 + i, y); gg.quadraticCurveTo(-12, y + 5, 4, y); gg.stroke(); });
            } });
          tk.inkPath(g, [[-31, -58], [-12, -50], [10, -49], [33, -56]], { w: 8, color: pal.ink, taper: 0.05, wobble: 0.04 });
          tk.inkPath(g, [[-31, -58], [-12, -50], [10, -49], [33, -56]], { w: 5, color: c.rope, taper: 0.05, wobble: 0.04 });
          tk.inkPath(g, [[-28, -58.5], [-12, -51.5], [8, -50.5]], { w: 1.4, color: '#ffffff', alpha: 0.7, taper: 0.4 });
          S.cel(blob(-13, -50, 5.8, 5.8, 3, 0.1, 8), c.rope, { depth: 2, line: 1.8, hi: false, rim: null });
          S.ln([[-13, -46], [-17, -36]], { w: 3.2, color: pal.ink }); S.ln([[-13, -46], [-17, -36]], { w: 1.8, color: c.rope });
          S.ln([[-11, -46], [-8, -35]], { w: 3.2, color: pal.ink }); S.ln([[-11, -46], [-8, -35]], { w: 1.8, color: c.rope });
          S.cel(blob(-25, -52, 5, 15, 3, 0.05, 10, -0.5), c.cuke.b, { depth: 3, line: 1.9, hi: false, rim: null,
            decor: (gg) => { gg.fillStyle = c.cuke.d; [[-28, -58], [-24, -50], [-30, -48], [-21, -57], [-27, -53]].forEach((p) => { gg.beginPath(); gg.arc(p[0], p[1], 1.2, 0, TAU); gg.fill(); }); } });
        } },
      { id: 'legF', box: [-56, -50, 8, 4], parent: 'root', pivot: [-8, -46],
        xf: (K, t) => ({ rot: -0.03 * sin(t * 3.2) }),
        draw(S) {
          const sk = S.c.skin;
          S.limb([[-8, -46], [-13, -30], [-18, -14]], sk.b, 23, 17, { bulge: 0.1 });
          S.cel(webFoot(-6, -6, 42), sk.b, { depth: 4, tension: 0.55, line: S.lw,
            decor: (g) => { g.strokeStyle = rgba(sk.d, 0.8); g.lineWidth = 1.4; [[-24, -8, -28, 4], [-36, -5, -40, 5]].forEach((l) => { g.beginPath(); g.moveTo(l[0], l[1]); g.lineTo(l[2], l[3]); g.stroke(); }); } });
        } },
      { id: 'head', box: [-52, -176, 40, -96], parent: 'body', pivot: [-6, -100],
        xf: (K, t, st) => ({ rot: 0.03 * sin(t * 1.7) + 0.16 * K.wind - 0.16 * K.strike - 0.1 * K.guard + 0.08 * K.hurt, dy: 1.2 * sin(t * 2.2 + 0.5) * st.m + 6 * K.guard, dx: -8 * K.strike + 4 * K.wind }),
        draw(S) {
          const c = S.c, sk = c.skin;
          S.cel(blob(-8, -126, 36, 29, 8, 0.03, 16), sk.b, { depth: 9, halftone: { d: 4.4, alpha: 0.24 } });
          // bowl-cut hair: the ring that keeps the pond in place
          S.cel([[-45, -122], [-44, -142], [-30, -157], [-8, -161], [14, -157], [30, -142], [33, -124], [27, -140], [19, -135], [11, -145], [1, -137], [-9, -147], [-18, -138], [-28, -147], [-37, -136]], c.hair.b, { depth: 8, rim: '#7a6bff', rimW: 1.6, hi: c.hair.l, hiW: 2.2, tension: 0.7,
            decor: (g) => { tk.gloss(g, [[-30, -148], [-14, -154], [4, -153]], { w: 3.4, alpha: 0.55 }); } });
          S.cel([[33, -130], [47, -137], [45, -124], [34, -120]], sk.b, { depth: 3, line: S.lw * 0.85, tension: 0.6, hi: false });
          S.cel(ell(-8, -163, 23, 7.5, 16), '#efe0b8', { depth: 3, line: S.lw * 0.9, hiW: 1.6, rim: '#ffffff' });
          S.cel(ell(-8, -163.5, 18, 5, 14), tk.shade('#c8b890', 0.3), { depth: 2, line: 1.4, hi: false, rim: null, shadow: false });
          tk.blush(S.g, -30, -113, 11, { alpha: 0.32, color: '#ff9a7a' }); tk.blush(S.g, 8, -114, 10, { alpha: 0.32, color: '#ff9a7a' });
        } },
      { id: 'jaw', box: [-60, -120, -20, -96], parent: 'head', pivot: [-26, -112],
        xf: (K) => ({ rot: K.mouth === 'open' ? -0.5 : K.mouth === 'grit' ? -0.1 : 0.02 }),
        draw(S) {
          S.cel([[-28, -115], [-44, -114], [-55, -109], [-53, -103], [-42, -100], [-28, -101]], S.c.beak.s, { depth: 3, tension: 0.7, line: S.lw * 0.9, hi: false, rim: null });
        } },
      { id: 'beak', box: [-62, -136, -18, -104], parent: 'head', pivot: [-26, -112],
        xf: (K) => ({ rot: K.mouth === 'open' ? 0.06 : 0 }),
        draw(S) {
          const b = S.c.beak;
          S.cel([[-26, -130], [-40, -128], [-53, -121], [-58, -113], [-52, -108], [-40, -110], [-26, -112]], b.b, { depth: 5, tension: 0.7, line: S.lw * 0.95, rim: '#fff2b0', hi: '#fff0a0',
            decor: (g) => { g.fillStyle = rgba(pal.ink, 0.65); g.beginPath(); g.arc(-50, -119, 1.7, 0, TAU); g.arc(-44, -122, 1.5, 0, TAU); g.fill(); } });
          S.ln([[-56, -111], [-46, -109], [-36, -110], [-28, -112]], { w: 1.6, taper: 0.3 });
          S.ln([[-56, -111], [-58, -114]], { w: 1.4, taper: 0.4 });
        } },
      { id: 'face', box: [-50, -152, 30, -104], parent: 'head', pivot: [-8, -126], face: true,
        stateOf: (st) => st.face.split('|')[0],
        draw(S, state) {
          const ir = ['#5a6a00', '#d8ff58'], ang = state === 'angry' || state === 'hurt', ex = state === 'open' ? 'smirk' : state;
          S.eye(-27, -127, 18, 22, ex, { iris: ir, glow: 0.6, sclera: '#fffaf0', lashes: false, wing: 0.12 });
          S.eye(-0.5, -129, 16, 20, ex, { iris: ir, glow: 0.6, sclera: '#fffaf0', catchSide: 1, lashes: false, wing: 0.12 });
          tk.brow(S.g, -29, -142, 16, { tilt: ang ? 0.75 : 0.28, side: 1, thick: 3.6, arch: 0.3 });
          tk.brow(S.g, 0, -144, 14, { tilt: ang ? 0.75 : 0.28, side: -1, thick: 3.2, arch: 0.3 });
        } },
      ...arm2({
        id: 'armF', parent: 'body', sh: [-22, -92], el: [-38, -81], wrist: [-45, -63], w: [18, 15, 13], hr: 16, bend: 2,
        color: '#55b87a', tubeOpts: { bulge: 0.08 },
        a1: (K, t) => ({ rot: 0.05 * sin(t * 1.6) + 2.6 * K.wind + 0.6 * K.strike + 0.9 * K.guard - 0.2 * K.hurt }),
        a2: (K, t) => ({ rot: 0.08 * sin(t * 1.9) + 1.0 * K.wind + 0.7 * K.strike + 1.9 * K.guard }),
        hand: (S, x, y) => {
          const sk = S.c.skin;
          S.cel(blob(x - 2, y + 3, 10.5, 9.5, 5, 0.08, 10), sk.b, { depth: 3, line: S.lw * 0.85 });
          [-1, 0, 1].forEach((k) => S.cel(taper(x - 2 + k * 6, y + 8, x - 4 + k * 7.5, y + 19, 6.4, 2.4), '#efe3c0', { depth: 1, line: 1.5, rim: null, hi: false, tension: 0.4 }));
          S.ln([[x - 4, y - 3], [x + 1, y + 5]], { w: 1.2, alpha: 0.6 });
        },
      }),
      { id: 'water', parent: 'head', live(ctx, st) {
        const K = st.K, t = st.t, m = st.m;
        const tilt = 0.07 * sin(t * 3.1) * m + 0.5 * K.hurt + 0.12 * K.wind, pl = 0.5 + 0.5 * sin(t * 2.4);
        tk.glow(ctx, -8, -168, 36 + 8 * K.buff, '#5ff5ff', 0.26 + 0.12 * pl + 0.35 * K.buff);
        ctx.save(); ctx.translate(-8, -164); ctx.rotate(tilt);
        ctx.beginPath(); ctx.ellipse(0, 0, 17, 4.6, 0, 0, TAU);
        const gr = ctx.createLinearGradient(0, -5, 0, 5); gr.addColorStop(0, '#d8ffff'); gr.addColorStop(1, '#5fd0e0');
        ctx.fillStyle = gr; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(20,15,46,0.7)'; ctx.stroke();
        ctx.beginPath(); ctx.ellipse(-4 + 3 * sin(t * 2), -1.2, 7, 1.4, 0, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill();
        ctx.beginPath(); ctx.ellipse(tilt * 90, -2.2 - 2 * K.buff, 9 + 2 * K.buff, 2.6 + 1.8 * K.buff, 0, 0, TAU); ctx.fillStyle = 'rgba(190,250,255,0.55)'; ctx.fill();
        ctx.restore();
        for (let i = 0; i < 3; i++) { const ph = (t * 0.5 + i * 0.33) % 1; tk.sparkle(ctx, -8 + (i - 1) * 8 + sin(ph * 6) * 2, -166 - ph * 20, 2.4 + i * 0.6, { color: '#e8ffff', alpha: sin(ph * PI) * 0.9 * m, glow: 0.3 }); }
        if (K.pose === 'hurt' || K.pose === 'die') {
          const u = clamp(st.pt / (K.pose === 'hurt' ? 0.26 : 0.5), 0, 1), rr = table('kappa-splash', 7, 3);
          for (let i = 0; i < 7; i++) { const x = -8 + (i - 3) * 6 + u * (rr[i][0] - 0.3) * 70, y = -166 - u * (30 + rr[i][1] * 30) + u * u * 70; FX.bit(ctx, 'drop', x, y, 3 + rr[i][2] * 2.4, 0, 1 - u, '#9ff0f2', '#0f6a78'); }
        }
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // TANUKI BANDIT (normal, m): a raccoon-dog thief in a straw hat with a sack of stolen gold. Accent: the glint of coin gold.
  // ---------------------------------------------------------------------------------------------------------------
  const pawFoot = (x, y, w) => [[x + 8, y - 4], [x - 4, y - 10], [x - w * 0.55, y - 7], [x - w * 0.92, y - 2], [x - w, y + 2], [x - w * 0.9, y + 6], [x - w * 0.62, y + 5], [x - w * 0.45, y + 7], [x - w * 0.2, y + 5], [x + 9, y + 5]];
  define({
    id: 'tanuki_bandit', size: 'm', acc: '#ffd23a', lunge: 44,
    col: { rim: '#ffe2a0', fur: cs('#8f6d54'), dark: '#3d2c2a', belly: '#f1dfbd', straw: cs('#e0bf78'), sack: cs('#3f4fa0'), coin: '#f5c96a', wood: cs('#a8743c') },
    hitAt: [-10, -110], alertAt: [-30, -120], hitBone: 'head', alertBone: 'head', buffBone: 'body', guardBone: 'body',
    arc: { bone: 'body', x: -26, y: -90, r: 74, a0: -1.0, a1: -4.1, w: 13, color: '#ffe9a8' },
    bounds: { w: 190, h: 184, head: { x: -8, y: -140 }, body: { x: 0, y: -76 }, feet: { x: 0, y: 0 } },
    die: { kind: 'leaf', colors: ['#79c24f', '#c9a25a', '#f5c96a'], orb: '#ffe9a8', gravity: 0.5, size: 5.5 },
    dieBox: [-70, -180, 80, 0],
    parts: [
      { id: 'tail', box: [16, -150, 96, -40], parent: 'body', pivot: [30, -56],
        chain: { spine: [[30, -56], [56, -66], [74, -96], [66, -134]], cuts: [0.34, 0.68], reach: 46 },
        bends: (K, t, st) => { const a = 0.16 * sin(t * 2.1) * st.m + 0.2 * K.wind - 0.3 * K.strike; return [a, a * 0.9, a * 1.1]; },
        draw(S) {
          const c = S.c, sp = [[30, -56], [56, -66], [74, -96], [66, -134]];
          S.cel(furShape(sp, [16, 32, 38, 30, 6], 5, 3), c.fur.b, { depth: 8, halftone: { d: 4.6, alpha: 0.25 }, line: S.lw, tension: 0.8,
            decor: (g) => { [0.3, 0.48, 0.66, 0.82].forEach((u) => stripe(g, sp, u, 8, 30, c.dark)); const tp = spineAt(sp, 0.98); g.fillStyle = c.belly; g.beginPath(); g.arc(tp.x, tp.y, 13, 0, TAU); g.fill(); } });
        } },
      { id: 'sack', box: [14, -152, 88, -52], parent: 'body', pivot: [46, -110],
        xf: (K, t, st) => ({ rot: 0.04 * sin(t * 2.3 + 1) * st.m + 0.1 * K.wind - 0.12 * K.strike }),
        draw(S) {
          const c = S.c, g = S.g;
          S.cel(blob(50, -84, 25, 29, 5, 0.05, 14), c.sack.b, { depth: 8, halftone: { d: 4.4, alpha: 0.28 },
            decor: (gg) => { gg.strokeStyle = rgba('#f3ecd8', 0.85); gg.lineWidth = 2.2; gg.lineCap = 'round'; for (let i = 0; i < 4; i++) { const cx = 40 + (i % 2) * 20, cy = -96 + Math.floor(i / 2) * 26; gg.beginPath(); gg.arc(cx, cy, 5 + (i % 2), 0.4, 4.6); gg.stroke(); } } });
          // knotted neck with coins spilling out of the top
          S.cel([[38, -108], [48, -118], [60, -110], [56, -100], [42, -100]], c.sack.s, { depth: 3, line: S.lw * 0.9, hi: false, rim: null });
          [[38, -119, 8.5], [58, -121, 9], [48, -128, 9.5], [66, -110, 7]].forEach((cn, i) => {
            S.cel(ell(cn[0], cn[1], cn[2], cn[2], 12), i % 2 ? '#ffd86a' : c.coin, { depth: 2.4, line: 2, rim: '#fff8d8', hiW: 1.8 });
            tk.inkPath(g, ell(cn[0], cn[1], cn[2] * 0.68, cn[2] * 0.68, 12).concat([ell(cn[0], cn[1], cn[2] * 0.68, cn[2] * 0.68, 12)[0]]), { w: 1.3, color: '#a8721a', alpha: 0.8, taper: 0 });
            S.cel(rrectPts(cn[0] - 2.4, cn[1] - 2.4, 4.8, 4.8, 0.8), '#5a3a0a', { shadow: false, line: 1.2, hi: false, rim: null, tension: 0.2 });
          });
          tk.inkPath(g, [[36, -101], [42, -95]], { w: 2, color: c.sack.d, taper: 0.4 });
        } },
      { id: 'legB', box: [4, -50, 40, 4], parent: 'root', pivot: [14, -44],
        xf: (K, t) => ({ rot: 0.03 * sin(t * 3 + 2) }),
        draw(S) { const dk = tk.shade('#6e523f', 0.15); S.limb([[14, -44], [18, -28], [17, -12]], dk, 20, 15); S.cel(pawFoot(30, -6, 30), dk, { depth: 3, line: S.lw * 0.9, tension: 0.55, hi: false }); } },
      { id: 'body', box: [-42, -108, 46, -32], parent: 'root', pivot: [0, -36],
        xf: (K, t, st) => ({ sy: 1 + 0.024 * sin(t * 2.1) * st.m - 0.02 * K.guard, sx: 1 - 0.014 * sin(t * 2.1) * st.m }),
        draw(S) {
          const c = S.c, g = S.g;
          S.cel([[0, -104], [22, -98], [36, -78], [38, -56], [26, -38], [2, -34], [-24, -38], [-36, -58], [-33, -80], [-18, -98]], c.fur.b, { depth: 10, halftone: { d: 4.6, alpha: 0.26 },
            decor: (gg) => {
              gg.beginPath(); tk.trace(gg, blob(-6, -58, 25, 27, 7, 0.04, 12)); gg.fillStyle = c.belly; gg.fill();
              gg.strokeStyle = rgba('#b89a6a', 0.65); gg.lineWidth = 1.5; gg.beginPath(); gg.arc(-6, -54, 3, 0, TAU); gg.stroke();
              gg.beginPath(); gg.ellipse(-14, -70, 8, 5, -0.5, 3.4, 5.6); gg.strokeStyle = rgba('#ffffff', 0.7); gg.lineWidth = 2.4; gg.stroke();
            } });
          // straw rope belt, a knot and a sake gourd hanging on the left hip
          tk.inkPath(g, [[-35, -60], [-12, -52], [12, -51], [37, -58]], { w: 8, color: pal.ink, taper: 0.05, wobble: 0.04 });
          tk.inkPath(g, [[-35, -60], [-12, -52], [12, -51], [37, -58]], { w: 5, color: '#d8b46a', taper: 0.05, wobble: 0.04 });
          S.ln([[-14, -52], [-18, -42]], { w: 3.4 }); S.ln([[-14, -52], [-18, -42]], { w: 1.8, color: '#d8b46a' });
          S.cel(ell(-20, -33, 7.5, 7.5, 10), '#d8973a', { depth: 3, line: 1.9, rim: '#ffe2a0' });
          S.cel(ell(-20, -43, 5, 5.5, 9), '#d8973a', { depth: 2, line: 1.8, rim: null, hi: false });
          S.cel(rrectPts(-22.5, -50, 5, 4, 1), '#8a5a1a', { shadow: false, line: 1.4, hi: false, rim: null });
        } },
      { id: 'legF', box: [-50, -50, 6, 4], parent: 'root', pivot: [-10, -44],
        xf: (K, t) => ({ rot: -0.03 * sin(t * 3) }),
        draw(S) { const c = S.c; S.limb([[-10, -44], [-15, -28], [-19, -12]], '#7d5d47', 22, 17, { bulge: 0.08 }); S.cel(pawFoot(-6, -6, 38), '#7d5d47', { depth: 3, line: S.lw, tension: 0.55,
          decor: (g) => { g.strokeStyle = rgba(c.dark, 0.7); g.lineWidth = 1.4; [[-22, -6, -25, 6], [-32, -4, -35, 6]].forEach((l) => { g.beginPath(); g.moveTo(l[0], l[1]); g.lineTo(l[2], l[3]); g.stroke(); }); } }); } },
      ...arm2({
        id: 'armF', parent: 'body', sh: [-26, -90], el: [-44, -79], wrist: [-52, -61], w: [19, 16, 14], hr: 16, bend: 2,
        color: '#7d5d47', tubeOpts: { bulge: 0.08 },
        a1: (K, t) => ({ rot: 0.05 * sin(t * 1.7) + 2.7 * K.wind + 0.6 * K.strike + 0.9 * K.guard - 0.2 * K.hurt }),
        a2: (K, t) => ({ rot: 0.08 * sin(t * 2) + 0.5 * K.wind + 0.7 * K.strike + 1.9 * K.guard }),
        hand: (S, x, y) => { S.cel(blob(x - 1, y + 2, 10.5, 10, 5, 0.08, 10), S.c.fur.b, { depth: 3, line: S.lw * 0.85 }); S.ln([[x - 5, y - 2], [x - 1, y + 6]], { w: 1.2, alpha: 0.5 }); },
      }),
      { id: 'head', box: [-70, -190, 44, -92], parent: 'body', pivot: [-6, -98],
        xf: (K, t, st) => ({ rot: 0.03 * sin(t * 1.8) + 0.14 * K.wind - 0.14 * K.strike + 0.08 * K.hurt - 0.06 * K.guard, dy: 1.2 * sin(t * 2.1 + 0.5) * st.m + 4 * K.guard, dx: -7 * K.strike }),
        draw(S) {
          const c = S.c, g = S.g;
          // ears first, they sit under the hat brim
          [[-40, -140, 0.4], [22, -142, -0.3]].forEach((e) => { S.cel(blob(e[0], e[1], 11, 12, 2, 0.05, 9, e[2]), c.fur.b, { depth: 3, line: S.lw * 0.9, hi: false, rim: null }); S.cel(blob(e[0] + (e[0] < 0 ? 1 : -1), e[1] + 1, 5.5, 6.5, 3, 0.05, 8, e[2]), c.dark, { depth: 1, line: 0, hi: false, rim: null, shadow: false }); });
          S.cel(blob(-8, -122, 37, 30, 8, 0.03, 16), c.fur.b, { depth: 9, halftone: { d: 4.4, alpha: 0.24 } });
          // cheek tufts
          S.cel([[-42, -122], [-56, -116], [-44, -112]], c.fur.l, { depth: 2, line: 1.8, hi: false, rim: null, tension: 0.2 });
          S.cel([[26, -122], [40, -116], [28, -110]], c.fur.b, { depth: 2, line: 1.8, hi: false, rim: null, tension: 0.2 });
          // the bandit mask over the eyes
          S.cel([[-40, -132], [-26, -140], [-8, -134], [-4, -120], [-16, -113], [-34, -118]], c.dark, { depth: 3, line: 1.8, shadow: false, hi: false, rim: null });
          S.cel([[-2, -134], [10, -138], [24, -130], [22, -118], [10, -114], [-2, -120]], c.dark, { depth: 3, line: 1.8, shadow: false, hi: false, rim: null });
          // muzzle
          S.cel(blob(-44, -114, 20, 13, 9, 0.05, 12, 0.15), c.belly, { depth: 4, line: S.lw * 0.9, rim: '#ffffff', hi: false });
          S.cel(blob(-60, -119, 5.5, 4.2, 4, 0.08, 8), '#241a30', { depth: 1, line: 1.5, shadow: false, rim: null, hi: false });
          tk.inkPath(g, [[-62, -122], [-58, -123]], { w: 1.4, color: '#ffffff', alpha: 0.8, taper: 0.4 });
          // whiskers
          [[-56, -112, -76, -108], [-54, -108, -74, -100]].forEach((w) => S.ln([[w[0], w[1]], [(w[0] + w[2]) / 2, (w[1] + w[3]) / 2 - 2], [w[2], w[3]]], { w: 1.2, alpha: 0.7, taper: 0.5 }));
          // straw kasa, cocked over one ear
          const hat = tk.xf([[-56, -142], [-36, -158], [-8, -182], [20, -158], [42, -142], [20, -134], [-8, -130], [-34, -134]], { rot: -0.13, cx: -8, cy: -140 });
          S.cel(hat, c.straw.b, { depth: 9, line: S.lw, rim: '#fff2c0', tension: 0.55, hi: c.straw.l,
            decor: (gg) => {
              gg.strokeStyle = rgba('#8a6a2a', 0.55); gg.lineWidth = 1.3;
              for (let i = 1; i < 7; i++) { const u = i / 7; gg.beginPath(); gg.moveTo(-8 + (-48 + 96 * u * 0) , -182); gg.lineTo(-56 + i * 15.5, -140 - Math.sin(u * PI) * 3); gg.stroke(); }
              for (let i = 0; i < 4; i++) { gg.beginPath(); gg.ellipse(-8, -150 + i * -9, 40 - i * 9, 6 - i * 0.9, -0.13, 0, TAU); gg.stroke(); }
            } });
          S.ln([[-50, -137], [-38, -124], [-26, -114]], { w: 2, color: '#6a4a20', alpha: 0.8, taper: 0.2 });
          S.ln([[36, -138], [30, -122], [18, -110]], { w: 2, color: '#6a4a20', alpha: 0.8, taper: 0.2 });
        } },
      { id: 'face', box: [-82, -140, 30, -90], parent: 'head', pivot: [-8, -122], face: true,
        draw(S, state) {
          const [ey, mo] = state.split('|'), g = S.g;
          const ex = ey === 'open' ? 'half' : ey;
          S.bead(-24, -125, 7, ex, { sclera: '#fff4d8', iris: '#e8a020', iris2: '#ffd75a', pupil: '#1c1428', lid: '#3d2c2a', tilt: 0.9 });
          S.bead(3, -127, 6.2, ex, { sclera: '#fff4d8', iris: '#e8a020', iris2: '#ffd75a', pupil: '#1c1428', lid: '#3d2c2a', tilt: 0.9 });
          tk.brow(g, -26, -139, 16, { tilt: ey === 'angry' || ey === 'hurt' ? 0.6 : -0.15, side: 1, thick: 3.6, arch: 0.2, color: '#ffffff', alpha: 0.9 });
          tk.brow(g, 4, -140, 14, { tilt: ey === 'angry' || ey === 'hurt' ? 0.6 : -0.15, side: -1, thick: 3.2, arch: 0.2, color: '#ffffff', alpha: 0.9 });
          // the grin: a wide curve with one fang, or a gape
          if (mo === 'open') {
            const sh = [[-66, -108], [-52, -104], [-36, -104], [-30, -108], [-38, -94], [-52, -92]];
            S.fill(sh, '#5a1428'); S.fill([[-52, -96], [-44, -94], [-40, -98], [-50, -99]], '#ff7fa0'); tk.inkPath(g, sh, { closed: true, w: 2, align: 0, tension: 0.7 });
            S.fill([[-60, -108], [-56, -108], [-58, -102]], '#fffaf0');
          } else {
            tk.inkPath(g, [[-66, -108], [-54, -101], [-42, -102], [-32, -108]], { w: 2.2, taper: 0.25 });
            S.fill([[-56, -102], [-52, -101], [-54, -95]], '#fffaf0'); tk.inkPath(g, [[-56, -102], [-54, -95], [-52, -101]], { w: 1.2, taper: 0.1 });
          }
        } },
      { id: 'club', parent: 'armF2', pivot: [-52, -61], box: [-116, -150, -30, -52],
        xf: (K) => ({ rot: -2.5 * Math.max(K.wind, K.strike) + 0.4 * K.guard }),
        draw(S) {
          const c = S.c, g = S.g, d = [cos(-2.2), sin(-2.2)], hx = -50, hy = -62, L = 82;
          S.tube([[hx, hy], [hx + d[0] * L * 0.5, hy + d[1] * L * 0.5], [hx + d[0] * L, hy + d[1] * L]], 9, 27, c.wood.b, { depth: 5, line: S.lw * 0.95, rim: '#ffd08a', hi: c.wood.l, tension: 0.9, bulge: -0.05 });
          for (let i = 0; i < 5; i++) { const u = 0.6 + (i % 3) * 0.13, p = spineAt([[hx, hy], [hx + d[0] * L * 0.5, hy + d[1] * L * 0.5], [hx + d[0] * L, hy + d[1] * L]], u), off = (i - 2) * 4.4; S.dot(p.x - p.ty * off, p.y + p.tx * off, 2.4, '#b8b4c8'); S.dot(p.x - p.ty * off - 0.7, p.y + p.tx * off - 0.7, 0.9, '#ffffff'); }
          S.ln([[hx + d[0] * 20, hy + d[1] * 20], [hx + d[0] * 44, hy + d[1] * 44]], { w: 1.3, color: c.wood.d, alpha: 0.7, taper: 0.4 });
        } },
      { id: 'glint', parent: 'body', live(ctx, st) {
        const t = st.t, m = st.m;
        for (let i = 0; i < 3; i++) {
          const ph = (t * 0.55 + i * 0.37) % 1, u = sin(ph * PI);
          tk.sparkle(ctx, 42 + (i - 1) * 9, -122 - ph * 12, (3 + i) * (0.5 + u * 0.7), { color: i % 2 ? '#ffffff' : '#ffe9a8', alpha: u * m + 0.0, glow: 0.4, rot: ph });
        }
        tk.glow(ctx, 50, -122, 20, '#ffd23a', 0.16 + 0.1 * sin(t * 3));
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // KODAMA (normal, s): a tree spirit no bigger than a lantern, rattling its head like a gourd. Accent: green glow in its hollow face.
  // ---------------------------------------------------------------------------------------------------------------
  define({
    id: 'kodama', size: 's', acc: '#a5ff8a', lunge: 26, alertColor: '#d8ff7a',
    col: { rim: '#d8ffd0', wood: cs('#e9f2dc'), moss: cs('#6fae4a'), bark: cs('#8a6a4a') },
    hitAt: [0, -70], alertAt: [0, -70], hitBone: 'head', alertBone: 'head', buffBone: 'body', guardBone: 'body',
    bounds: { w: 100, h: 118, head: { x: 0, y: -80 }, body: { x: 0, y: -50 }, feet: { x: 0, y: 0 } },
    die: { kind: 'leaf', colors: ['#a5ff8a', '#e9f2dc', '#6fae4a'], orb: '#d8ffd0', gravity: 0.35, size: 4 },
    dieBox: [-40, -112, 40, 0], strips: 6,
    tweak(K, pose, t) { if (pose === 'idle') K.by = -1.5 * Math.abs(sin(t * 2.2)); },
    parts: [
      { id: 'legB', box: [2, -22, 22, 2], parent: 'body', pivot: [10, -20], xf: (K, t) => ({ rot: 0.05 * sin(t * 2.2 + 1) }),
        draw(S) { S.limb([[10, -22], [11, -12], [10, -4]], S.c.wood.s, 10, 8); S.cel(blob(8, -2, 8, 4.5, 2, 0.1, 8), S.c.bark.b, { depth: 2, line: S.lw * 0.8, hi: false }); } },
      { id: 'body', box: [-22, -56, 22, -14], parent: 'root', pivot: [0, -14],
        xf: (K, t, st) => ({ sy: 1 + 0.03 * sin(t * 2.2) * st.m, sx: 1 - 0.015 * sin(t * 2.2) * st.m }),
        draw(S) {
          const c = S.c;
          S.cel([[0, -52], [14, -46], [19, -32], [14, -18], [0, -14], [-14, -18], [-19, -32], [-14, -46]], c.wood.b, { depth: 6, halftone: { d: 4, alpha: 0.2 }, hiW: 1.6,
            decor: (g) => { g.fillStyle = rgba(c.moss.b, 0.9); g.beginPath(); tk.trace(g, blob(6, -22, 14, 7, 3, 0.2, 9)); g.fill(); g.fillStyle = rgba(c.moss.l, 0.8); [[10, -24], [2, -20], [14, -20]].forEach((p) => { g.beginPath(); g.arc(p[0], p[1], 2.4, 0, TAU); g.fill(); }); } });
        } },
      { id: 'legF', box: [-22, -22, 0, 2], parent: 'body', pivot: [-8, -20], xf: (K, t) => ({ rot: -0.05 * sin(t * 2.2) }),
        draw(S) { S.limb([[-8, -22], [-9, -12], [-8, -4]], S.c.wood.b, 11, 9); S.cel(blob(-10, -2, 8.5, 4.5, 3, 0.1, 8), S.c.bark.b, { depth: 2, line: S.lw * 0.8, hi: false }); } },
      { id: 'head', box: [-44, -126, 44, -36], parent: 'body', pivot: [0, -48],
        xf: (K, t, st) => {
          const shiver = Math.max(0, sin(t * 0.9 + 0.5) - 0.86) * 7;                    // an occasional rattle
          return { rot: 0.1 * sin(t * 1.3) * st.m + sin(t * 46) * (0.05 * shiver + 0.1 * K.strike + 0.06 * K.alert) + 0.2 * K.wind - 0.16 * K.strike + 0.12 * K.hurt, dx: -5 * K.strike, dy: 1.5 * sin(t * 2.2 + 0.4) * st.m - 3 * K.guard,
            sx: 1 + 0.12 * K.wind, sy: 1 + 0.12 * K.wind - 0.08 * K.guard }; },
        draw(S) {
          const c = S.c, g = S.g;
          S.cel(blob(0, -72, 34, 31, 12, 0.04, 16), c.wood.b, { depth: 8, halftone: { d: 4.4, alpha: 0.22 }, hiW: 2.2,
            decor: (gg) => {
              gg.strokeStyle = rgba('#8aa07a', 0.5); gg.lineWidth = 1.4; gg.lineCap = 'round';
              [[22, -84, 30, -70], [24, -62, 30, -56], [-30, -80, -24, -90]].forEach((l) => { gg.beginPath(); gg.moveTo(l[0], l[1]); gg.quadraticCurveTo((l[0] + l[2]) / 2 + 3, (l[1] + l[3]) / 2, l[2], l[3]); gg.stroke(); });
              gg.fillStyle = rgba(c.moss.b, 0.9); gg.beginPath(); tk.trace(gg, blob(22, -90, 12, 8, 6, 0.25, 9, 0.5)); gg.fill();
              gg.fillStyle = rgba(c.moss.l, 0.8); [[20, -92], [26, -86]].forEach((p) => { gg.beginPath(); gg.arc(p[0], p[1], 2.2, 0, TAU); gg.fill(); });
            } });
          // a fern sprout and a tiny mushroom growing from the crown
          S.ln([[0, -100], [-2, -110], [-9, -116]], { w: 2.6, color: c.moss.d, taper: 0.1 });
          S.cel([[-9, -116], [-20, -118], [-26, -112], [-16, -112]], c.moss.b, { depth: 2, line: 1.8, hi: false, rim: null, tension: 0.5 });
          S.cel([[-3, -112], [4, -122], [12, -120], [8, -112]], c.moss.l, { depth: 2, line: 1.8, hi: false, rim: null, tension: 0.5 });
          S.ln([[10, -100], [12, -106]], { w: 2.4, color: '#f3e6c8' }); S.cel(ell(12, -108, 6.5, 4, 9), '#e8583d', { depth: 2, line: 1.8, rim: '#ff9a7a', hi: false });
          S.dot(10, -109, 1.3, '#fff8f0'); S.dot(14.5, -107.5, 1, '#fff8f0');
          void g;
        } },
      { id: 'face', box: [-30, -94, 30, -44], parent: 'head', pivot: [0, -70], face: true,
        draw(S, state) {
          const [ey, mo] = state.split('|'), g = S.g;
          S.hollow(-13, -74, 12, 18, ey, { color: '#a5ff8a', socket: '#1a2a20' });
          S.hollow(11, -74, 12, 18, ey, { color: '#a5ff8a', socket: '#1a2a20' });
          // the mouth: a round dark hollow that opens wide when it rattles
          const big = mo === 'open' ? 1.5 : mo === 'grit' ? 1.1 : 1;
          g.save(); g.beginPath(); g.ellipse(-1, -54, 6 * big, 8 * big, 0, 0, TAU); g.fillStyle = '#1a2a20'; g.fill();
          const gr = g.createRadialGradient(-1, -52, 0, -1, -52, 8 * big); gr.addColorStop(0, rgba('#a5ff8a', 0.85)); gr.addColorStop(1, rgba('#a5ff8a', 0)); g.fillStyle = gr; g.beginPath(); g.ellipse(-1, -54, 6 * big, 8 * big, 0, 0, TAU); g.fill(); g.restore();
          tk.inkPath(g, ell(-1, -54, 6 * big, 8 * big, 10), { closed: true, w: 1.8, align: 0 });
          tk.blush(g, -24, -60, 8, { alpha: 0.3, color: '#ffb0a0', hatch: false }); tk.blush(g, 22, -60, 8, { alpha: 0.3, color: '#ffb0a0', hatch: false });
        } },
      ...arm2({
        id: 'armF', parent: 'body', sh: [-12, -44], el: [-22, -36], wrist: [-26, -24], w: [9, 8, 7], hr: 9, bend: 1, color: '#e9f2dc',
        a1: (K, t) => ({ rot: 0.1 * sin(t * 2.2) + 2.4 * K.wind + 0.5 * K.strike + 0.9 * K.guard }),
        a2: (K, t) => ({ rot: 0.12 * sin(t * 2.6) + 0.5 * K.wind + 0.7 * K.strike + 1.9 * K.guard }),
        hand: (S, x, y) => { S.cel(blob(x, y + 1, 5.5, 5.5, 2, 0.1, 8), S.c.wood.b, { depth: 2, line: S.lw * 0.8, hi: false }); },
      }),
      { id: 'glow', parent: 'head', live(ctx, st) {
        const K = st.K, t = st.t, pl = 0.6 + 0.4 * sin(t * 3.4);
        const k = 0.5 + 0.7 * K.alert + 0.6 * K.buff + 0.4 * K.strike;
        tk.glow(ctx, -13, -74, 15, '#a5ff8a', 0.55 * pl * k); tk.glow(ctx, 11, -74, 15, '#a5ff8a', 0.55 * pl * k); tk.glow(ctx, -1, -54, 14, '#a5ff8a', 0.4 * pl * k);
        tk.glow(ctx, 0, -72, 56, '#a5ff8a', 0.13 * k);
        for (let i = 0; i < 4; i++) { const ph = (t * 0.25 + i * 0.25) % 1, a = ph * TAU + i; tk.sparkle(ctx, cos(a) * (40 + 6 * i) * 0.9, -70 + sin(a * 1.3) * 26 - ph * 10, 2.2 + (i % 2), { color: '#d8ff9a', alpha: sin(ph * PI) * 0.9 * st.m, glow: 0.4 }); }
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // KARAKASA (normal, m): an old paper umbrella that dreamed of walking. One eye, one leg, one very long tongue. Accent: the amber eye.
  // ---------------------------------------------------------------------------------------------------------------
  const KK_E = [[72, -126], [52, -114], [28, -108], [2, -107], [-24, -108], [-50, -114], [-72, -124]];      // rib ends of the canopy rim
  define({
    id: 'karakasa', size: 'm', acc: '#ffc93a', lunge: 40, alertColor: '#ffb340',
    col: { rim: '#ffe0a0', paper: cs('#d8452e'), cream: '#f4dfb2', rib: '#5a2a1a', bamboo: cs('#c8a860'), skin: cs('#dcb27c'), tongue: cs('#ff7fa0') },
    hitAt: [-6, -136], alertAt: [-4, -138], hitBone: 'canopy', alertBone: 'canopy', buffBone: 'shaft', guardBone: 'shaft',
    arc: { bone: 'shaft', x: -4, y: -92, r: 62, a0: -1.2, a1: -4.4, w: 12, color: '#ffe9a8' },
    bounds: { w: 170, h: 186, head: { x: -4, y: -140 }, body: { x: 4, y: -100 }, feet: { x: 0, y: 0 } },
    die: { kind: 'paper', colors: ['#d8452e', '#f4dfb2', '#c8a860'], orb: '#ffe0a0', gravity: 0.6, size: 6 },
    dieBox: [-80, -186, 80, 0], strips: 7,
    tweak(K, pose, t) {
      if (pose === 'idle' || pose === 'block' || pose === 'buff') {
        const c = (t / 1.15) % 1, air = c < 0.72 ? sin(PI * c / 0.72) : 0;
        K.by = -18 * air;
        K.bsy *= 1 + 0.05 * air - (c >= 0.72 ? 0.09 * sin((c - 0.72) / 0.28 * PI) : 0);
        K.bsx *= 1 - 0.03 * air + (c >= 0.72 ? 0.05 * sin((c - 0.72) / 0.28 * PI) : 0);
      }
    },
    parts: [
      ...arm2({
        id: 'armB', parent: 'shaft', sh: [8, -92], el: [22, -84], wrist: [32, -68], w: [9, 8, 7], hr: 11, bend: -1, color: tk.shade('#dcb27c', 0.15),
        a1: (K, t) => ({ rot: 0.1 * sin(t * 2.2 + 1) - 0.4 * K.wind + 0.3 * K.strike - 0.3 * K.guard }),
        a2: (K, t) => ({ rot: 0.14 * sin(t * 2.6 + 1) - 0.3 * K.wind + 0.3 * K.strike - 1.2 * K.guard }),
        hand: (S, x, y) => { const dk = tk.shade(S.c.skin.b, 0.15); S.cel(blob(x, y + 1, 6, 6, 2, 0.1, 8), dk, { depth: 2, line: S.lw * 0.8, hi: false }); [-1, 0, 1].forEach((k) => S.cel(taper(x + k * 3.6, y + 4, x + k * 4.6, y + 11, 3.4, 1.4), '#efe3c0', { depth: 0.5, line: 1.2, rim: null, hi: false, shadow: false })); },
      }),
      { id: 'leg', box: [-24, -62, 28, 4], parent: 'root', pivot: [2, -56],
        xf: (K, t) => { const c = (t / 1.15) % 1; return { rot: 0.14 * sin(PI * Math.min(1, c / 0.72)) * (K.pose === 'idle' || K.pose === 'block' || K.pose === 'buff' ? 1 : 0.2) - 0.05 }; },
        draw(S) {
          const c = S.c, g = S.g;
          S.limb([[2, -58], [3, -40], [1, -22]], c.skin.b, 17, 13, { bulge: 0.05 });
          S.cel(rrectPts(-18, -18, 40, 8, 3), '#b0743c', { depth: 3, line: S.lw * 0.9, rim: '#ffd08a', tension: 0.3, hi: false });
          S.cel(rrectPts(-13, -10, 8, 10, 1.5), '#8a5a2a', { depth: 1, line: 1.9, tension: 0.3, hi: false, rim: null, shadow: false });
          S.cel(rrectPts(10, -10, 8, 10, 1.5), '#8a5a2a', { depth: 1, line: 1.9, tension: 0.3, hi: false, rim: null, shadow: false });
          S.cel(blob(0, -20, 10, 5, 3, 0.1, 8), c.skin.b, { depth: 2, line: S.lw * 0.85, hi: false });
          tk.inkPath(g, [[-4, -20], [-1, -11], [6, -20]], { w: 2.4, color: '#e8383d', taper: 0.1 });
        } },
      { id: 'shaft', box: [-6, -126, 20, -50], parent: 'root', pivot: [5, -56],
        xf: (K, t, st) => ({ sy: 1 + 0.015 * sin(t * 2.2) * st.m, rot: 0.03 * sin(t * 1.9) }),
        draw(S) {
          const c = S.c;
          S.tube([[5, -56], [6, -90], [6, -122]], 15, 13, c.bamboo.b, { depth: 4, line: S.lw * 0.95, tension: 0.9, rim: '#ffe6a8' });
          [-76, -98].forEach((y) => { S.ln([[-1, y], [6, y + 2], [13, y]], { w: 2.2, color: c.bamboo.d }); });
          S.cel(rrectPts(0, -66, 12, 6, 2), '#e8383d', { depth: 1, line: 1.6, tension: 0.3, hi: false, rim: null, shadow: false });
        } },
      { id: 'canopy', box: [-76, -196, 80, -100], parent: 'shaft', pivot: [5, -116],
        xf: (K, t, st) => ({ rot: 0.04 * sin(t * 1.5) * st.m - 0.22 * K.strike + 0.12 * K.wind + 0.06 * K.hurt, sx: 1 + 0.1 * K.wind - 0.68 * K.guard, sy: 1 + 0.05 * K.wind + 0.08 * K.guard, dy: -3 * K.strike }),
        draw(S) {
          const c = S.c, g = S.g;
          const A = [8, -182];
          const shape = [[A[0], A[1], 1]];
          [[26, -168], [52, -148]].forEach((p) => shape.push(p));
          KK_E.forEach((e, i) => { shape.push([e[0], e[1], 1]); if (i < KK_E.length - 1) shape.push([(e[0] + KK_E[i + 1][0]) / 2, (e[1] + KK_E[i + 1][1]) / 2 - 8]); });
          [[-56, -146], [-32, -168]].forEach((p) => shape.push(p));
          S.cel(shape, c.paper.b, { depth: 12, tension: 0.6, halftone: { d: 4.6, alpha: 0.24 }, rim: '#ffd08a',
            decor: (gg) => {
              for (let i = 0; i < KK_E.length - 1; i++) {
                const e0 = KK_E[i], e1 = KK_E[i + 1], v = [(e0[0] + e1[0]) / 2, (e0[1] + e1[1]) / 2 - 8];
                gg.beginPath(); gg.moveTo(A[0], A[1]); gg.lineTo(e0[0], e0[1]); gg.lineTo(v[0], v[1]); gg.lineTo(e1[0], e1[1]); gg.closePath();
                gg.fillStyle = (i === 2 || i === 3) ? c.cream : (i % 2 ? c.paper.s : c.paper.b); gg.fill();
              }
              gg.strokeStyle = rgba(c.rib, 0.9); gg.lineWidth = 2.2; gg.lineCap = 'round';
              KK_E.forEach((e) => { gg.beginPath(); gg.moveTo(A[0], A[1]); gg.quadraticCurveTo((A[0] + e[0]) / 2 + (e[0] < 8 ? -3 : 3), (A[1] + e[1]) / 2 - 4, e[0], e[1]); gg.stroke(); });
              gg.strokeStyle = rgba('#7a3a20', 0.6); gg.lineWidth = 1.4; gg.beginPath(); gg.ellipse(8, -150, 26, 9, 0, 0.1, PI - 0.1); gg.stroke();
              gg.fillStyle = rgba('#000000', 0.06);
              // soaked stains and patches on the old paper
              gg.fillStyle = rgba('#7a3a20', 0.25); gg.beginPath(); tk.trace(gg, blob(44, -150, 9, 6, 4, 0.3, 8)); gg.fill();
              gg.fillStyle = rgba('#f4dfb2', 0.9); gg.beginPath(); tk.trace(gg, rrectPts(-58, -140, 12, 12, 2)); gg.fill(); tk.inkPath(gg, [[-58, -140], [-46, -140], [-46, -128], [-58, -128], [-58, -140]], { w: 1.4, alpha: 0.7, taper: 0 });
            } });
          // the finial and the ring where the ribs meet
          S.cel([[8, -180], [3, -196], [8, -204], [13, -196]], c.bamboo.b, { depth: 2, line: S.lw * 0.85, tension: 0.4, hi: false, rim: null });
          S.cel(ell(8, -181, 6, 4, 8), c.bamboo.d, { depth: 1, line: 1.6, hi: false, rim: null, shadow: false });
          // a torn slit and a patch along the rim
          tk.inkPath(g, [[-40, -112], [-36, -118], [-38, -122]], { w: 1.6, alpha: 0.8, taper: 0.3 });
        } },
      { id: 'face', box: [-44, -166, 34, -104], parent: 'canopy', pivot: [-6, -136], face: true,
        draw(S, state) {
          const [ey, mo] = state.split('|'), g = S.g;
          // the one big eye, on a cream panel
          tk.eye(g, -6, -138, 32, 36, { expr: ({ open: 'wide', half: 'half', closed: 'closed', hurt: 'hurt', angry: 'angry', wide: 'wide' })[ey] || 'wide', side: 1, iris: ['#8a4a00', '#ffc93a'], sclera: '#fffaf0', glow: 0.6, lashes: false, wing: 0.15, lineW: 2.4 });
          // the grin under it: a jagged slit
          const gy = -116;
          if (mo === 'open') {
            const sh = [[-36, gy - 2], [-18, gy - 5], [4, gy - 5], [22, gy - 2], [14, gy + 12], [-4, gy + 16], [-24, gy + 12]];
            S.fill(sh, '#4a1020'); tk.inkPath(g, sh, { closed: true, w: 2.2, align: 0, tension: 0.6 });
            for (let i = 0; i < 5; i++) { const x = -30 + i * 12; S.fill([[x, gy - 4], [x + 6, gy - 4], [x + 3, gy + 3]], '#fffaf0'); }
          } else {
            tk.inkPath(g, [[-36, gy], [-20, gy + 6], [0, gy + 5], [22, gy - 1]], { w: 2.6, taper: 0.2 });
            for (let i = 0; i < 4; i++) { const x = -28 + i * 13; S.fill([[x, gy + 3 + (i % 2) * 1], [x + 5, gy + 5], [x + 2, gy + 11]], '#fffaf0'); tk.inkPath(g, [[x, gy + 3], [x + 2, gy + 11], [x + 5, gy + 5]], { w: 1.1, taper: 0.1 }); }
          }
        } },
      { id: 'tongue', box: [-72, -122, -4, -46], parent: 'canopy',
        chain: { spine: [[-24, -110], [-33, -96], [-32, -80], [-40, -66]], cuts: [0.34, 0.68], reach: 20 },
        bends: (K, t, st) => { const a = 0.24 * sin(t * 4.2) * st.m + 0.5 * K.strike - 0.3 * K.wind; return [a * 0.6, a, a * 1.3]; },
        draw(S) {
          const c = S.c, g = S.g, sp = [[-24, -110], [-33, -96], [-32, -80], [-40, -66]];
          S.tube(sp, 12, 11, c.tongue.b, { depth: 3, line: S.lw * 0.85, tension: 0.9, rim: '#ffc0d0', bulge: 0.08 });
          tk.inkPath(g, [[-26, -104], [-32, -94], [-31, -82], [-38, -70]], { w: 1.4, color: c.tongue.d, alpha: 0.7, taper: 0.3 });
          S.cel(blob(-41, -64, 7, 7.5, 2, 0.08, 9), c.tongue.b, { depth: 3, line: S.lw * 0.85, rim: '#ffc0d0' });
        } },
      ...arm2({
        id: 'armF', parent: 'shaft', sh: [2, -92], el: [-14, -84], wrist: [-27, -68], w: [10, 9, 8], hr: 12, bend: 1, color: '#dcb27c',
        a1: (K, t) => ({ rot: 0.1 * sin(t * 2.2) + 2.4 * K.wind + 0.5 * K.strike + 0.8 * K.guard }),
        a2: (K, t) => ({ rot: 0.14 * sin(t * 2.6) + 0.6 * K.wind + 0.7 * K.strike + 1.7 * K.guard }),
        hand: (S, x, y) => { S.cel(blob(x, y + 1, 7, 7, 2, 0.1, 8), S.c.skin.b, { depth: 2, line: S.lw * 0.8, hi: false }); [-1, 0, 1].forEach((k) => S.cel(taper(x + k * 4, y + 5, x + k * 5, y + 13, 3.6, 1.4), '#efe3c0', { depth: 0.5, line: 1.2, rim: null, hi: false, shadow: false })); },
      }),
      { id: 'eyeglow', parent: 'canopy', live(ctx, st) {
        const K = st.K, t = st.t, k = 0.5 + 0.6 * K.alert + 0.5 * K.strike + 0.5 * K.buff, pl = 0.7 + 0.3 * sin(t * 3.1);
        if (K.eyes !== 'closed' && K.eyes !== 'hurt') tk.glow(ctx, -6, -138, 34, '#ffc93a', 0.34 * pl * k);
        tk.glow(ctx, 8, -140, 70, '#ff8a3a', 0.1 * k);
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // HITODAMA (normal, s) and EMBER WISP (minion, s): soul-flames. Flames are a six-frame flip-book (a hand-drawn boil at 9 fps).
  // ---------------------------------------------------------------------------------------------------------------
  // one flame frame: outer body, mid layer and hot core. o: hw (half width), h (height), y0 (base), cols [outer, mid, core, rim], sway
  function flameFrame(S, k, o) {
    const ph = k / 6 * TAU, hw = o.hw, y0 = o.y0, H = o.h, sw = o.sway === undefined ? 1 : o.sway;
    const tipx = sw * 8 * sin(ph), tipy = y0 - H - 5 * cos(ph * 2 + 1);
    const outer = [[0, y0 + 3], [hw * 0.86, y0 - 2], [hw * 1.02, y0 - H * 0.26], [hw * 0.9, y0 - H * 0.5],
      [hw * 1.0 + 3 * sw * sin(ph + 1), y0 - H * 0.63], [hw * 0.66 + 5 * sw * sin(ph + 0.5), y0 - H * 0.74], [hw * 0.36, y0 - H * 0.68],
      [tipx * 0.6 + hw * 0.08, y0 - H * 0.88], [tipx, tipy, 1], [tipx * 0.3 - hw * 0.3, y0 - H * 0.8], [-hw * 0.5 + 2 * sw * sin(ph + 4), y0 - H * 0.64],
      [-hw * 0.94 + 3 * sw * sin(ph + 3), y0 - H * 0.5], [-hw * 1.02, y0 - H * 0.26], [-hw * 0.86, y0 - 2]];
    S.cel(outer, o.cols[0], { depth: 8, halftone: { d: 4.2, alpha: 0.22 }, rim: o.cols[3], rimW: 2.2, hi: false, line: S.lw });
    const mid = tk.xf(outer, { s: 0.66, cx: 0, cy: y0, dy: -2, dx: tipx * 0.06 });
    S.cel(mid, o.cols[1], { depth: 3, line: 0, shadow: false, rim: null, hi: false });
    const core = tk.xf(outer, { s: 0.34, cx: 0, cy: y0, dy: -3 });
    S.cel(core, o.cols[2], { depth: 2, line: 0, shadow: false, rim: null, hi: false });
  }
  define({
    id: 'hitodama', size: 's', acc: '#9d8cff', lunge: 36, alertColor: '#c8b8ff',
    col: { rim: '#c8f0ff' },
    hitAt: [0, -52], alertAt: [0, -54], hitBone: 'flame', alertBone: 'flame', buffBone: 'flame', guardBone: 'flame',
    bounds: { w: 96, h: 120, head: { x: 0, y: -80 }, body: { x: 0, y: -62 }, feet: { x: 0, y: 0 } },
    die: { kind: 'ember', colors: ['#9d8cff', '#7fe8ff', '#ffffff'], orb: '#c8f0ff', gravity: -0.2, size: 4 },
    dieBox: [-40, -122, 40, -8], strips: 6,
    tweak(K, pose, t) { K.by += -22 - 5 * sin(t * 1.9) * tk.motion(); },
    parts: [
      { id: 'tail', box: [0, -104, 72, -14], parent: 'flame', pivot: [8, -30],
        chain: { spine: [[8, -30], [30, -24], [50, -38], [52, -62], [40, -86]], cuts: [0.3, 0.6], reach: 26 },
        bends: (K, t, st) => { const a = 0.34 * sin(t * 3.1) * st.m + 0.3 * K.strike; return [a * 0.5, a, a * 1.3]; },
        draw(S) {
          const sp = [[8, -30], [30, -24], [50, -38], [52, -62], [40, -86]];
          S.tube(sp, 22, 1.5, '#6a5cf0', { depth: 5, line: S.lw * 0.85, tension: 0.9, rim: null, hi: false, halftone: { d: 4.2, alpha: 0.2 },
            decor: (g) => { tk.inkPath(g, sp, { w: 10, color: '#7fe8ff', taper: 0.35, alpha: 0.95 }); tk.inkPath(g, sp, { w: 3.6, color: '#ffffff', taper: 0.4, alpha: 0.9 }); } });
        } },
      { id: 'flame', box: [-34, -106, 34, -20], parent: 'root', pivot: [0, -24], v: (st) => 'f' + (Math.floor(st.t * 9) % 6),
        xf: (K, t, st) => ({ sx: 1 + 0.2 * K.buff + 0.2 * K.wind + 0.12 * K.strike - 0.15 * K.guard, sy: 1 + 0.04 * sin(t * 7) * st.m + 0.16 * K.buff + 0.12 * K.wind - 0.16 * K.guard, rot: 0.05 * sin(t * 2.3) * st.m + 0.08 * K.wind - 0.1 * K.strike }),
        draw(S, variant) { flameFrame(S, +String(variant).slice(1) || 0, { hw: 23, y0: -24, h: 76, cols: ['#6a5cf0', '#7fe8ff', '#ffffff', '#d8f8ff'] }); } },
      { id: 'face', box: [-24, -76, 24, -30], parent: 'flame', pivot: [0, -52], face: true,
        draw(S, state) {
          const [ey, mo] = state.split('|'), g = S.g, dark = '#2a1a5a';
          S.bead(-8, -54, 6.4, ey === 'open' ? 'open' : ey, { color: dark, lid: '#4a3aa0', tilt: 1 });
          S.bead(9, -54, 5.8, ey === 'open' ? 'open' : ey, { color: dark, lid: '#4a3aa0', tilt: 1 });
          if (mo === 'open') { g.beginPath(); g.ellipse(0, -41, 5, 7, 0, 0, TAU); g.fillStyle = dark; g.fill(); tk.inkPath(g, ell(0, -41, 5, 7, 9), { closed: true, w: 1.6, align: 0 }); }
          else if (mo === 'grit') { tk.inkPath(g, [[-7, -42], [-3, -39], [3, -43], [7, -40]], { w: 2.2, color: dark, taper: 0.2 }); }
          else { g.beginPath(); g.ellipse(0, -41, 2.6, 3.4, 0, 0, TAU); g.fillStyle = dark; g.fill(); }
          tk.blush(g, -16, -46, 7, { alpha: 0.35, color: '#ff9ac8', hatch: false }); tk.blush(g, 16, -46, 7, { alpha: 0.35, color: '#ff9ac8', hatch: false });
        } },
      { id: 'aura', parent: 'flame', live(ctx, st) {
        const K = st.K, t = st.t, m = st.m, pl = 0.7 + 0.3 * sin(t * 4.2), k = 1 + 0.6 * K.alert + 0.6 * K.buff + 0.5 * K.strike;
        tk.glow(ctx, 0, -54, 62 * (0.95 + 0.05 * pl), '#6a5cf0', 0.5 * k);
        tk.glow(ctx, 0, -50, 34, '#7fe8ff', 0.5 * k);
        for (let i = 0; i < 5; i++) {
          const ph = (t * 0.5 + i * 0.2) % 1, a = i * 2.4 + t * 0.6;
          FX.bit(ctx, 'ember', cos(a) * (18 + 8 * ph) + 4, -40 - ph * 62, 2.2 + (i % 3), 0, sin(ph * PI) * 0.9 * m + 0.1 * m, '#7fe8ff', '#ffffff');
        }
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // ONI CUB (normal, m): a very small oni with very large opinions. Accent: the pulsing anger mark and hot amber eyes.
  // ---------------------------------------------------------------------------------------------------------------
  const fist = (S, x, y, r, base) => {
    S.cel(blob(x, y + 2, r, r * 0.95, 3, 0.05, 10), base, { depth: 3.5, line: S.lw * 0.9 });
    [-0.5, 0, 0.5].forEach((k) => S.ln([[x + k * r * 0.85 - 1, y - r * 0.2], [x + k * r * 0.9, y + r * 0.7]], { w: 1.3, alpha: 0.55, taper: 0.4 }));
  };
  define({
    id: 'oni_cub', size: 'm', acc: '#ff6a3a', lunge: 52, alertColor: '#ffd23a',
    col: { rim: '#ffd6a0', skin: cs('#e8583d'), belly: '#ff8a62', horn: cs('#f3e6c8'), hair: '#1c1230', cloth: cs('#f5c96a') },
    hitAt: [-8, -120], alertAt: [-8, -124], hitBone: 'head', alertBone: 'head', buffBone: 'body', guardBone: 'body',
    arc: { bone: 'body', x: -26, y: -92, r: 52, a0: -1.2, a1: -4.4, w: 12, color: '#ffd6a0' },
    bounds: { w: 150, h: 182, head: { x: -6, y: -140 }, body: { x: 0, y: -74 }, feet: { x: 0, y: 0 } },
    die: { kind: 'ember', colors: ['#ff6a3a', '#ffd23a', '#ffffff'], orb: '#ffd6a0', gravity: -0.1, size: 4.5 },
    dieBox: [-60, -182, 60, 0],
    parts: [
      ...arm2({
        id: 'armB', parent: 'body', sh: [16, -92], el: [3, -80], wrist: [-8, -64], w: [16, 14, 12], hr: 15, bend: -2, color: tk.shade('#e8583d', 0.18),
        a1: (K, t) => ({ rot: 0.06 * sin(t * 2.2 + 1) + 0.9 * K.wind + 0.3 * K.strike + 0.6 * K.guard }),
        a2: (K, t) => ({ rot: 0.1 * sin(t * 2.6 + 1) + 0.6 * K.wind + 0.4 * K.strike + 1.6 * K.guard }),
        hand: (S, x, y) => fist(S, x - 1, y + 4, 10, tk.shade(S.c.skin.b, 0.18)),
      }),
      { id: 'legB', box: [-2, -50, 40, 4], parent: 'root', pivot: [14, -42], xf: (K, t) => ({ rot: 0.03 * sin(t * 3 + 2) }),
        draw(S) { const dk = tk.shade(S.c.skin.b, 0.18); S.limb([[14, -42], [18, -26], [17, -12]], dk, 22, 17); S.cel(pawFoot(30, -6, 30), dk, { depth: 3, line: S.lw * 0.9, tension: 0.55, hi: false }); } },
      { id: 'body', box: [-42, -104, 42, -24], parent: 'root', pivot: [0, -36],
        xf: (K, t, st) => ({ sy: 1 + 0.025 * sin(t * 2.6) * st.m - 0.02 * K.guard, sx: 1 - 0.014 * sin(t * 2.6) * st.m }),
        draw(S) {
          const c = S.c, g = S.g;
          S.cel([[0, -100], [22, -94], [34, -74], [34, -54], [22, -38], [0, -34], [-22, -38], [-34, -54], [-34, -74], [-22, -94]], c.skin.b, { depth: 10, halftone: { d: 4.6, alpha: 0.26 },
            decor: (gg) => { gg.beginPath(); tk.trace(gg, blob(-6, -66, 20, 22, 9, 0.04, 12)); gg.fillStyle = c.belly; gg.fill(); gg.strokeStyle = rgba('#a02a1a', 0.6); gg.lineWidth = 1.5; gg.beginPath(); gg.arc(-6, -56, 2.6, 0, TAU); gg.stroke(); } });
          // tiger-skin loincloth with a black cord
          S.cel([[-34, -52], [34, -50], [30, -30], [10, -24], [0, -33], [-12, -25], [-30, -31]], c.cloth.b, { depth: 5, line: S.lw * 0.95, tension: 0.5, rim: '#fff2b0',
            decor: (gg) => { gg.fillStyle = '#1c1230'; for (let i = 0; i < 6; i++) { const x = -32 + i * 12; gg.beginPath(); gg.moveTo(x, -52); gg.lineTo(x + 7, -50); gg.lineTo(x + 3, -28); gg.lineTo(x - 2, -30); gg.closePath(); gg.fill(); } } });
          tk.inkPath(g, [[-34, -54], [-10, -49], [12, -48], [35, -53]], { w: 5.5, color: '#1c1230', taper: 0.05, wobble: 0.04 });
        } },
      { id: 'legF', box: [-52, -50, 6, 4], parent: 'root', pivot: [-10, -42], xf: (K, t) => ({ rot: -0.03 * sin(t * 3) }),
        draw(S) { const sk = S.c.skin; S.limb([[-10, -42], [-15, -26], [-19, -12]], sk.b, 24, 18, { bulge: 0.08 }); S.cel(pawFoot(-6, -6, 38), sk.b, { depth: 3, line: S.lw, tension: 0.55 }); } },
      ...arm2({
        id: 'armF', parent: 'body', sh: [-26, -92], el: [-41, -80], wrist: [-46, -62], w: [18, 16, 14], hr: 16, bend: 2, color: '#e8583d', tubeOpts: { bulge: 0.08 },
        a1: (K, t) => ({ rot: 0.05 * sin(t * 2.2) + 2.7 * K.wind + 0.6 * K.strike + 0.9 * K.guard - 0.2 * K.hurt }),
        a2: (K, t) => ({ rot: 0.1 * sin(t * 2.6) + 0.4 * K.wind + 0.7 * K.strike + 1.9 * K.guard }),
        hand: (S, x, y) => fist(S, x - 1, y + 4, 12, S.c.skin.b),
      }),
      { id: 'head', box: [-64, -196, 50, -88], parent: 'body', pivot: [-6, -96],
        xf: (K, t, st) => ({ rot: 0.03 * sin(t * 2) + 0.18 * K.wind - 0.28 * K.strike + 0.1 * K.hurt - 0.08 * K.guard, dy: 1.3 * sin(t * 2.6 + 0.5) * st.m + 4 * K.guard, dx: -16 * K.strike + 5 * K.wind }),
        draw(S) {
          const c = S.c, g = S.g, sk = c.skin;
          [[-44, -128, 0.5], [32, -130, -0.4]].forEach((e) => S.cel(blob(e[0], e[1], 10, 13, 2, 0.05, 9, e[2]), sk.b, { depth: 3, line: S.lw * 0.9, hi: false, rim: null }));
          // horns: a tall near one and a chipped stub, with wild hair between
          S.cel([[-30, -146], [-38, -164], [-36, -184], [-24, -166], [-14, -148]], c.horn.b, { depth: 4, line: S.lw * 0.95, tension: 0.6, rim: '#ffffff', hi: c.horn.l, decor: (gg) => { [-158, -168].forEach((y) => tk.inkPath(gg, [[-42, y], [-22, y + 4]], { w: 1.3, color: '#b09a70', alpha: 0.8, taper: 0.2 })); } });
          S.cel([[8, -148], [10, -166], [14, -161], [18, -170], [22, -148]], c.horn.b, { depth: 3, line: S.lw * 0.9, tension: 0.35, rim: '#ffffff', hi: false });
          S.cel([[-16, -148], [-10, -170, 1], [-4, -152], [3, -175, 1], [9, -150], [16, -140], [-12, -138]], c.hair, { depth: 4, line: S.lw * 0.9, tension: 0.45, rim: '#7a6bff', hi: false, shadow: false });
          S.cel(blob(-6, -122, 39, 34, 8, 0.03, 16), sk.b, { depth: 10, halftone: { d: 4.4, alpha: 0.24 } });
          // hair fringe over the brow
          S.cel([[-40, -134], [-30, -152], [-8, -156], [18, -152], [34, -136], [24, -140], [16, -134], [6, -142], [-6, -136], [-16, -143], [-28, -136]], c.hair, { depth: 3, line: S.lw * 0.9, tension: 0.55, rim: '#7a6bff', hi: false, shadow: false });
          tk.blush(g, -34, -108, 11, { alpha: 0.4, color: '#a01a1a' }); tk.blush(g, 22, -108, 10, { alpha: 0.4, color: '#a01a1a' });
        } },
      { id: 'face', box: [-58, -142, 40, -84], parent: 'head', pivot: [-6, -122], face: true,
        draw(S, state) {
          const [ey, mo] = state.split('|'), g = S.g, ir = ['#7a2a00', '#ffb03a'], ex = ey === 'open' ? 'angry' : ey;
          S.eye(-26, -124, 20, 23, ex, { iris: ir, glow: 0.6, sclera: '#fff6e0', lashes: false, wing: 0.1 });
          S.eye(3, -126, 17, 20, ex, { iris: ir, glow: 0.6, sclera: '#fff6e0', lashes: false, wing: 0.1, catchSide: 1 });
          const mad = ey === 'angry' || ey === 'open' || ey === 'hurt';
          tk.brow(g, -28, -142, 20, { tilt: mad ? 0.85 : 0.2, side: 1, thick: 4.4, arch: 0.15, color: '#1c1230' });
          tk.brow(g, 3, -143, 17, { tilt: mad ? 0.85 : 0.2, side: -1, thick: 4, arch: 0.15, color: '#1c1230' });
          if (mo === 'open') {
            const sh = [[-40, -108], [-24, -112], [-2, -112], [12, -108], [6, -90], [-12, -82], [-30, -88]];
            S.fill(sh, '#4a0a1a'); S.fill([[-24, -92], [-12, -86], [-2, -92], [-14, -96]], '#ff7fa0');
            tk.inkPath(g, sh, { closed: true, w: 2.2, align: 0, tension: 0.7 });
            S.fill([[-38, -108], [-32, -108], [-35, -98]], '#fffaf0'); S.fill([[4, -108], [10, -108], [7, -99]], '#fffaf0');
          } else {
            tk.inkPath(g, [[-40, -100], [-22, -106], [-4, -105], [10, -99]], { w: 3, taper: 0.2 });
            S.fill([[-32, -104], [-27, -105], [-30, -113]], '#fffaf0'); tk.inkPath(g, [[-32, -104], [-30, -113], [-27, -105]], { w: 1.2, taper: 0.1 });
            S.fill([[-10, -105], [-5, -105], [-8, -113]], '#fffaf0'); tk.inkPath(g, [[-10, -105], [-8, -113], [-5, -105]], { w: 1.2, taper: 0.1 });
          }
          tk.inkPath(g, [[-6, -113], [-3, -108]], { w: 1.6, alpha: 0.6, taper: 0.4 });
        } },
      { id: 'fury', parent: 'head', live(ctx, st) {
        const K = st.K, t = st.t, m = st.m, pl = 0.5 + 0.5 * sin(t * 5.5), mad = 0.4 + 0.5 * K.alert + 0.4 * K.strike + 0.5 * K.buff;
        // the anger mark: four arcs bowed toward the centre that throb
        ctx.save(); ctx.translate(16, -148); const sc = 0.85 + 0.25 * pl * mad; ctx.scale(sc, sc); ctx.rotate(0.15);
        ctx.lineCap = 'round';
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach((q) => {
          ctx.beginPath(); ctx.moveTo(q[0] * 14, q[1] * 3); ctx.quadraticCurveTo(q[0] * 5, q[1] * 5, q[0] * 3, q[1] * 14);
          ctx.strokeStyle = pal.ink; ctx.lineWidth = 7.6; ctx.stroke(); ctx.strokeStyle = '#ff4a2a'; ctx.lineWidth = 4.4; ctx.stroke();
        });
        ctx.restore();
        tk.glow(ctx, 16, -148, 24, '#ff6a3a', 0.25 * mad);
        // steam puffs from the nostrils
        for (let i = 0; i < 6; i++) {
          const ph = (t * (0.6 + 0.4 * mad) + i / 6) % 1;
          ctx.save(); ctx.globalAlpha *= sin(ph * PI) * 0.6 * m * (0.4 + mad * 0.5); ctx.fillStyle = '#fff8f0';
          ctx.beginPath(); ctx.arc(-58 - ph * 26, -112 - ph * 30 + (i % 2) * 5, 2.5 + ph * 6, 0, TAU); ctx.fill(); ctx.restore();
        }
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // CROW TENGU (normal, m): a lesser tengu, all feathers and mischief. Accent: sharp gold eyes and the wind he drags.
  // ---------------------------------------------------------------------------------------------------------------
  const CROW = cs('#2d2b4e');
  function feather(S, x, y, ang, len, w, base) {
    const c = cos(ang), s2 = sin(ang), nx = -s2, ny = c;
    const pts = [[x, y], [x + c * len * 0.5 + nx * w * 0.5, y + s2 * len * 0.5 + ny * w * 0.5], [x + c * len, y + s2 * len, 1], [x + c * len * 0.5 - nx * w * 0.5, y + s2 * len * 0.5 - ny * w * 0.5]];
    S.cel(pts, base, { depth: 3, line: S.lw * 0.85, tension: 0.7, hi: false, rim: '#8f8ad8', rimW: 1.2 });
  }
  define({
    id: 'crow_tengu', size: 'm', acc: '#ffe45e', lunge: 54, alertColor: '#ffe45e',
    col: { rim: '#a89cff', crow: CROW, robe: cs('#efe4c4'), beak: cs('#f5b83a'), sash: cs('#c8302f'), leg: cs('#c89a3a') },
    hitAt: [-8, -100], alertAt: [-8, -130], hitBone: 'body', alertBone: 'head', buffBone: 'body', guardBone: 'body',
    arc: { bone: 'body', x: -10, y: -108, r: 66, a0: -0.8, a1: -3.8, w: 12, color: '#c8c0ff' },
    bounds: { w: 200, h: 184, head: { x: -12, y: -136 }, body: { x: 6, y: -88 }, feet: { x: 0, y: 0 } },
    die: { kind: 'feather', colors: ['#2d2b4e', '#5a5a9a', '#efe4c4'], orb: '#ffe45e', gravity: 0.9, size: 5.5 },
    dieBox: [-70, -184, 100, 0],
    tweak(K, pose, t) { K.by += -7 - 3 * sin(t * 2.6) * tk.motion(); K.bx += -0.0; },
    parts: [
      // far wing (higher, behind everything), then the near wing, each an inner cover and an outer fan of primaries
      { id: 'wingBi', box: [4, -196, 70, -100], parent: 'body', pivot: [14, -112],
        xf: (K, t, st) => ({ rot: -0.16 * sin(t * 2.6 + 0.6) * st.m + 0.5 * K.strike - 0.4 * K.wind - 0.3 * K.guard }),
        draw(S) { const c = S.c; S.cel([[14, -108], [26, -134], [46, -156], [62, -160], [58, -142], [48, -124], [34, -108]], tk.shade(c.crow.b, 0.15), { depth: 6, line: S.lw, tension: 0.7, rim: '#8f8ad8' }); } },
      { id: 'wingBo', box: [30, -204, 130, -120], parent: 'wingBi', pivot: [58, -152],
        xf: (K, t, st) => ({ rot: -0.3 * sin(t * 2.6 - 0.4) * st.m + 0.5 * K.strike - 0.3 * K.wind - 0.2 * K.guard }),
        draw(S) { const c = S.c, b = tk.shade(c.crow.b, 0.15); [-0.75, -0.42, -0.1, 0.22, 0.55].forEach((a, i) => feather(S, 58, -152, a - 0.5, 62 - i * 3, 15, i % 2 ? b : c.crow.b)); } },
      { id: 'tail', box: [8, -70, 74, -20], parent: 'body', pivot: [14, -60],
        xf: (K, t, st) => ({ rot: 0.1 * sin(t * 2.2) * st.m + 0.3 * K.strike }),
        draw(S) { const c = S.c; [0.15, 0.45, 0.75].forEach((a, i) => feather(S, 14, -62, a - 0.2, 52 - i * 6, 13, c.crow.b)); } },
      { id: 'legB', box: [-14, -60, 34, 4], parent: 'root', pivot: [8, -50], xf: (K, t) => ({ rot: 0.04 * sin(t * 2.6 + 1) - 0.1 * K.wind }),
        draw(S) { const c = S.c; S.tube([[8, -52], [20, -34], [10, -16]], 11, 7, tk.shade(c.leg.b, 0.15), { depth: 2.5, line: S.lw * 0.8, hi: false }); [[-14, 0], [-6, 3], [4, 4]].forEach((tp, i) => S.cel(taper(10, -12, 10 + tp[0], -4 + tp[1], 6, 2), '#4a3a2a', { depth: 0.5, line: 1.4, hi: false, rim: null, shadow: false })); } },
      { id: 'body', box: [-34, -132, 40, -46], parent: 'root', pivot: [0, -50],
        xf: (K, t, st) => ({ sy: 1 + 0.022 * sin(t * 2.6) * st.m - 0.03 * K.guard, sx: 1 - 0.012 * sin(t * 2.6) * st.m, rot: 0.03 * sin(t * 1.9) }),
        draw(S) {
          const c = S.c, g = S.g;
          S.cel([[-2, -128], [18, -120], [28, -98], [24, -70], [10, -52], [-10, -50], [-24, -68], [-26, -98], [-16, -120]], c.crow.b, { depth: 9, halftone: { d: 4.4, alpha: 0.26 } });
          // the cream robe front, a red obi and the suzukake collar with its three pom-poms
          S.cel([[-14, -122], [4, -118], [14, -96], [12, -66], [-14, -62], [-22, -92]], c.robe.b, { depth: 6, line: S.lw * 0.95, tension: 0.6, rim: '#ffffff',
            decor: (gg) => { gg.strokeStyle = rgba(c.robe.d, 0.5); gg.lineWidth = 1.4; [[-4, -110, -6, -68], [4, -108, 2, -68]].forEach((l) => { gg.beginPath(); gg.moveTo(l[0], l[1]); gg.lineTo(l[2], l[3]); gg.stroke(); }); } });
          S.cel([[-24, -76], [14, -72], [14, -60], [-24, -64]], c.sash.b, { depth: 3, line: S.lw * 0.9, tension: 0.3, rim: '#ff9a8a', hi: false });
          tk.inkPath(g, [[-20, -122], [-4, -114], [12, -118]], { w: 6, color: pal.ink, taper: 0.1 }); tk.inkPath(g, [[-20, -122], [-4, -114], [12, -118]], { w: 3.6, color: '#f5d878', taper: 0.1 });
          [[-16, -108], [-4, -102], [8, -108]].forEach((p, i) => { S.cel(ell(p[0], p[1], 5.6, 5.6, 8), '#fff2c8', { depth: 2, line: 1.7, rim: '#ffffff', hi: false }); void i; });
        } },
      { id: 'legF', box: [-34, -60, 20, 4], parent: 'root', pivot: [-8, -50], xf: (K, t) => ({ rot: -0.04 * sin(t * 2.6) + 0.2 * K.wind }),
        draw(S) { const c = S.c; S.tube([[-8, -52], [6, -34], [-6, -16]], 12, 8, c.leg.b, { depth: 3, line: S.lw * 0.85, hi: false }); [[-22, -1], [-14, 3], [-4, 4]].forEach((tp) => S.cel(taper(-6, -12, -6 + tp[0], -4 + tp[1], 6.4, 2), '#4a3a2a', { depth: 0.5, line: 1.5, hi: false, rim: null, shadow: false })); S.cel(blob(-6, -14, 7, 5, 2, 0.1, 8), c.leg.b, { depth: 2, line: S.lw * 0.8, hi: false }); } },
      { id: 'head', box: [-84, -166, 40, -100], parent: 'body', pivot: [-6, -114],
        xf: (K, t, st) => ({ rot: 0.03 * sin(t * 2.4) + 0.12 * K.wind - 0.2 * K.strike + 0.08 * K.hurt, dy: 1.5 * sin(t * 2.6 + 0.5) * st.m + 3 * K.guard, dx: -18 * K.strike + 4 * K.wind }),
        draw(S) {
          const c = S.c, g = S.g;
          [[12, -142, 0.3, 20], [22, -136, 0.6, 24], [26, -128, 0.9, 20]].forEach((f) => feather(S, f[0], f[1], f[2] + 0.1, f[3], 8, c.crow.b));
          S.cel(blob(-8, -134, 29, 26, 5, 0.03, 14), c.crow.b, { depth: 8, halftone: { d: 4.4, alpha: 0.26 } });
          // tokin: the little black box hat, tied under the chin
          S.cel(tk.xf(rrectPts(-14, -166, 26, 16, 3), { rot: -0.18, cx: -1, cy: -158 }), '#1a1730', { depth: 3, line: S.lw * 0.9, tension: 0.3, rim: '#7a6bff', hi: false });
          S.cel(tk.xf(rrectPts(-6, -158, 10, 6, 2), { rot: -0.18, cx: -1, cy: -158 }), '#c8302f', { depth: 1, line: 1.4, tension: 0.3, shadow: false, hi: false, rim: null });
          tk.inkPath(g, [[-30, -130], [-24, -112], [-10, -108]], { w: 2.2, color: '#c8302f', taper: 0.2 });
        } },
      { id: 'jaw', box: [-84, -132, -28, -104], parent: 'head', pivot: [-32, -128], xf: (K) => ({ rot: K.mouth === 'open' ? -0.42 : K.mouth === 'grit' ? -0.08 : 0.02 }),
        draw(S) { S.cel([[-32, -130], [-52, -128], [-70, -122], [-62, -116], [-46, -116], [-32, -118]], S.c.beak.s, { depth: 2, line: S.lw * 0.85, tension: 0.6, hi: false, rim: null }); } },
      { id: 'beak', box: [-86, -152, -22, -112], parent: 'head', pivot: [-32, -128], xf: (K) => ({ rot: K.mouth === 'open' ? 0.05 : 0 }),
        draw(S) {
          const b = S.c.beak;
          S.cel([[-30, -146], [-48, -142], [-64, -132], [-78, -114, 1], [-64, -120], [-46, -124], [-30, -128]], b.b, { depth: 4, line: S.lw * 0.95, tension: 0.65, rim: '#fff2b0', hi: '#fff0a0' });
          S.dot(-52, -134, 1.6, pal.ink);
        } },
      { id: 'face', box: [-52, -156, 28, -112], parent: 'head', pivot: [-8, -134], face: true,
        draw(S, state) {
          const [ey] = state.split('|'), g = S.g, ang = ey === 'angry' || ey === 'hurt';
          const ex = ey === 'open' ? 'determined' : ey;
          S.eye(-24, -137, 17, 21, ex, { iris: ['#8a6a00', '#ffe45e'], sclera: '#fff6d0', glow: 0.7, lashes: false, wing: 0.1, pupil: '#1a1730' });
          S.eye(-1, -138, 14, 18, ex, { iris: ['#8a6a00', '#ffe45e'], sclera: '#fff6d0', glow: 0.7, lashes: false, wing: 0.1, pupil: '#1a1730', catchSide: 1 });
          tk.brow(g, -26, -151, 15, { tilt: ang ? 0.8 : 0.4, side: 1, thick: 3.4, arch: 0.2, color: '#0d0b1e' });
          tk.brow(g, 0, -151, 12, { tilt: ang ? 0.8 : 0.4, side: -1, thick: 3, arch: 0.2, color: '#0d0b1e' });
        } },
      ...arm2({
        id: 'armF', parent: 'body', sh: [-12, -110], el: [-28, -98], wrist: [-36, -80], w: [17, 16, 11], hr: 30, boxF: [-104, -110, 0, 0], bend: 2, color: '#efe4c4',
        a1: (K, t) => ({ rot: 0.06 * sin(t * 2) + 2.7 * K.wind + 0.6 * K.strike + 0.9 * K.guard - 0.2 * K.hurt }),
        a2: (K, t) => ({ rot: 0.1 * sin(t * 2.4) + 0.4 * K.wind + 0.7 * K.strike + 1.8 * K.guard }),
        tubeOpts: { rim: '#ffffff' },
        hand: (S, x, y) => {
          const c = S.c;
          // a hauchiwa: a wooden handle and a bold fan of pale plumes that read against the dark robe, with a red cord
          S.tube([[x, y + 4], [x + 3, y + 16]], 6, 6, '#8a5a30', { depth: 1.5, line: 1.6, hi: false, rim: null, tension: 0.5, shadow: false });
          [-0.78, -0.4, 0, 0.4, 0.78].forEach((a, i) => feather(S, x + 2, y + 2, 2.05 + a, 60 - Math.abs(a) * 14, 20, i % 2 ? '#9a96d0' : '#b6b2e6'));
          S.cel(blob(x, y + 2, 7.5, 7.5, 2, 0.1, 8), c.crow.b, { depth: 2, line: S.lw * 0.8, hi: false });
          S.ln([[x - 3, y + 6], [x + 4, y + 8]], { w: 3, color: '#c8302f' });
        },
      }),
      { id: 'wind', parent: 'root', live(ctx, st) {
        const K = st.K, t = st.t, m = st.m;
        if (K.pose === 'attack' || K.pose === 'telegraph') {
          const a = K.pose === 'attack' ? K.strike : K.alert * 0.6;
          ctx.save(); ctx.globalAlpha *= 0.7 * a; ctx.strokeStyle = '#d8d0ff'; ctx.lineWidth = 2; ctx.lineCap = 'round';
          for (let i = 0; i < 5; i++) { const y = -60 - i * 20, x0 = 40 + ((t * 300 + i * 40) % 60); ctx.beginPath(); ctx.moveTo(x0, y); ctx.quadraticCurveTo(x0 + 20, y - 5, x0 + 46, y + 2); ctx.stroke(); }
          ctx.restore();
        }
        for (let i = 0; i < 3; i++) { const ph = (t * 0.4 + i * 0.33) % 1; FX.bit(ctx, 'feather', 40 + i * 14 + ph * 20, -70 + i * 18 + ph * 30, 3.4, ph * 6 + i, sin(ph * PI) * 0.7 * m, '#2d2b4e'); }
        tk.glow(ctx, -30, -138, 22, '#ffe45e', 0.2 + 0.2 * K.alert + 0.15 * K.strike);
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // BAMBOO SPRITE (normal, s): a bamboo shoot with a face and a leaf blade in each hand. They never come alone. Accent: lime blade glow.
  // ---------------------------------------------------------------------------------------------------------------
  function leafBlade(S, x, y, ang, len, w, base) {
    const c = cos(ang), s2 = sin(ang), nx = -s2, ny = c, mx = x + c * len * 0.55, my = y + s2 * len * 0.55;
    const pts = [[x, y], [mx + nx * w * 0.5, my + ny * w * 0.5], [x + c * len, y + s2 * len, 1], [mx - nx * w * 0.5, my - ny * w * 0.5]];
    S.cel(pts, base, { depth: 3, line: S.lw * 0.85, tension: 0.75, hi: false, rim: '#e8ff9a', rimW: 1.4,
      decor: (g) => { tk.inkPath(g, [[x, y], [x + c * len * 0.95, y + s2 * len * 0.95]], { w: 1.6, color: '#d8f8a0', alpha: 0.9, taper: 0.2 }); } });
  }
  define({
    id: 'bamboo_sprite', size: 's', acc: '#c8ff5a', lunge: 34, alertColor: '#e8ff7a',
    col: { rim: '#e8ffb0', bam: cs('#7fc04a'), ring: '#b8e06a', leaf: cs('#3f9a3a'), leaf2: cs('#68b840') },
    hitAt: [0, -66], alertAt: [0, -70], hitBone: 'body', alertBone: 'body', buffBone: 'body', guardBone: 'body',
    arc: { bone: 'body', x: -20, y: -66, r: 48, a0: -1.3, a1: -4.2, w: 10, color: '#e8ff9a' },
    bounds: { w: 110, h: 122, head: { x: 0, y: -74 }, body: { x: 0, y: -58 }, feet: { x: 0, y: 0 } },
    die: { kind: 'leaf', colors: ['#7fc04a', '#c8ff5a', '#3f9a3a'], orb: '#e8ffb0', gravity: 0.45, size: 4.5 },
    dieBox: [-46, -118, 46, 0], strips: 6,
    tweak(K, pose, t) { if (pose === 'idle') K.by = -3.5 * Math.abs(sin(t * 4.1)); },
    parts: [
      ...arm2({
        id: 'armB', parent: 'body', sh: [18, -66], el: [28, -58], wrist: [32, -44], w: [7, 6, 5], hr: 8, bend: -1, color: tk.shade('#3f9a3a', 0.1),
        a1: (K, t) => ({ rot: 0.1 * sin(t * 3.1 + 1) + 0.9 * K.wind + 0.3 * K.strike + 0.6 * K.guard }),
        a2: (K, t) => ({ rot: 0.14 * sin(t * 3.4 + 1) + 0.6 * K.wind + 0.4 * K.strike + 1.4 * K.guard }),
        hand: (S, x, y) => { S.cel(blob(x, y + 1, 4.6, 4.6, 2, 0.1, 8), tk.shade('#3f9a3a', 0.1), { depth: 1.5, line: S.lw * 0.8, hi: false }); },
      }),
      { id: 'bladeB', parent: 'armB2', pivot: [32, -44], box: [-20, -120, 90, 30], xf: (K) => ({ rot: -1.6 * Math.max(K.wind, K.strike) }),
        draw(S) { leafBlade(S, 32, -44, -0.7, 52, 12, tk.shade(S.c.leaf.b, 0.12)); } },
      { id: 'legB', box: [-2, -40, 30, 4], parent: 'body', pivot: [9, -36], xf: (K, t) => ({ rot: 0.1 * sin(t * 4.1 + 2) }),
        draw(S) { const dk = tk.shade('#5aa040', 0.1); S.limb([[9, -38], [11, -22], [10, -10]], dk, 10, 8); S.cel([[6, -10], [20, -10], [26, -4], [24, 1], [4, 1]], '#c8a860', { depth: 2, line: S.lw * 0.8, tension: 0.4, hi: false, rim: null }); } },
      { id: 'body', box: [-30, -100, 30, -30], parent: 'root', pivot: [0, -36],
        xf: (K, t, st) => ({ sy: 1 + 0.03 * sin(t * 3.2) * st.m - 0.04 * K.guard, sx: 1 - 0.018 * sin(t * 3.2) * st.m }),
        draw(S) {
          const c = S.c, g = S.g;
          S.cel([[-20, -96], [0, -100], [20, -94], [24, -80], [24, -52], [22, -38], [0, -34], [-22, -38], [-24, -52], [-24, -80]], c.bam.b, { depth: 8, halftone: { d: 4, alpha: 0.24 }, tension: 0.6, rim: '#e8ffb0',
            decor: (gg) => {
              gg.fillStyle = rgba('#ffffff', 0.18); gg.fillRect(-18, -98, 5, 64);
              gg.fillStyle = c.ring; gg.fillRect(-28, -60, 56, 7); gg.fillStyle = rgba(c.bam.d, 0.6); gg.fillRect(-28, -54, 56, 2.4);
              gg.fillStyle = rgba(c.bam.d, 0.4); gg.fillRect(-28, -60, 56, 1.6);
            } });
          // the jagged cut of the culm at the top, with a dark hollow
          S.cel([[-20, -96], [-10, -103], [0, -98], [10, -104], [20, -95], [0, -92]], c.bam.s, { depth: 2, line: S.lw * 0.85, tension: 0.35, hi: false, rim: null, shadow: false });
          tk.blush(g, -19, -64, 8, { alpha: 0.4, color: '#ffb0a0', hatch: false }); tk.blush(g, 19, -64, 8, { alpha: 0.4, color: '#ffb0a0', hatch: false });
        } },
      { id: 'legF', box: [-30, -40, 4, 4], parent: 'body', pivot: [-8, -36], xf: (K, t) => ({ rot: -0.1 * sin(t * 4.1) }),
        draw(S) { S.limb([[-8, -38], [-10, -22], [-9, -10]], S.c.bam.b, 11, 9); S.cel([[-6, -10], [-24, -10], [-30, -4], [-28, 1], [-4, 1]], '#c8a860', { depth: 2, line: S.lw * 0.8, tension: 0.4, hi: false, rim: null }); } },
      { id: 'crown', box: [-44, -140, 44, -90], parent: 'body', pivot: [0, -98],
        xf: (K, t, st) => ({ rot: 0.08 * sin(t * 3.3) * st.m + 0.16 * K.wind - 0.16 * K.strike }),
        draw(S) {
          const c = S.c;
          leafBlade(S, -4, -98, -2.6, 42, 14, c.leaf2.b); leafBlade(S, 4, -98, -0.5, 42, 14, c.leaf.b); leafBlade(S, 0, -98, -1.6, 44, 15, c.leaf2.l);
        } },
      { id: 'face', box: [-28, -92, 28, -50], parent: 'body', pivot: [0, -72], face: true,
        draw(S, state) {
          const [ey, mo] = state.split('|'), g = S.g;
          const ex = ey === 'open' ? 'wide' : ey;
          S.eye(-10, -76, 14, 18, ex, { iris: ['#2a6a10', '#c8ff5a'], sclera: '#fffaf0', glow: 0.6, lashes: false, wing: 0.1 });
          S.eye(10, -76, 14, 18, ex, { iris: ['#2a6a10', '#c8ff5a'], sclera: '#fffaf0', glow: 0.6, lashes: false, wing: 0.1, side: -1 });
          const ang = ey === 'angry' || ey === 'hurt';
          tk.brow(g, -11, -90, 12, { tilt: ang ? 0.7 : 0.3, side: 1, thick: 2.6, arch: 0.2 }); tk.brow(g, 11, -90, 12, { tilt: ang ? 0.7 : 0.3, side: -1, thick: 2.6, arch: 0.2 });
          if (mo === 'open') { g.beginPath(); g.ellipse(0, -60, 7, 6, 0, 0, TAU); g.fillStyle = '#4a1020'; g.fill(); tk.inkPath(g, ell(0, -60, 7, 6, 9), { closed: true, w: 1.8, align: 0 }); S.fill([[-4, -66], [4, -66], [0, -62]], '#fffaf0'); }
          else tk.inkPath(g, [[-8, -63], [-3, -59], [3, -59], [8, -64]], { w: 2.2, taper: 0.25 });
        } },
      ...arm2({
        id: 'armF', parent: 'body', sh: [-18, -66], el: [-30, -58], wrist: [-34, -44], w: [8, 7, 6], hr: 9, bend: 1, color: '#3f9a3a',
        a1: (K, t) => ({ rot: 0.1 * sin(t * 3.1) + 2.7 * K.wind + 0.6 * K.strike + 0.9 * K.guard }),
        a2: (K, t) => ({ rot: 0.14 * sin(t * 3.4) + 0.4 * K.wind + 0.7 * K.strike + 1.7 * K.guard }),
        hand: (S, x, y) => { S.cel(blob(x, y + 1, 5.2, 5.2, 2, 0.1, 8), '#3f9a3a', { depth: 1.5, line: S.lw * 0.8, hi: false }); },
      }),
      { id: 'bladeF', parent: 'armF2', pivot: [-34, -44], box: [-110, -130, 20, 20], xf: (K) => ({ rot: -2.2 * Math.max(K.wind, K.strike) }),
        draw(S) { leafBlade(S, -34, -44, -2.3, 56, 13, S.c.leaf.b); } },
      { id: 'glow', parent: 'body', live(ctx, st) {
        const K = st.K, t = st.t, m = st.m, k = 0.5 + 0.7 * K.alert + 0.6 * K.strike;
        tk.glow(ctx, -10, -76, 12, '#c8ff5a', 0.4 * k); tk.glow(ctx, 10, -76, 12, '#c8ff5a', 0.4 * k);
        for (let i = 0; i < 3; i++) { const ph = (t * 0.7 + i * 0.33) % 1; FX.bit(ctx, 'leaf', -30 + i * 30 + sin(ph * 5 + i) * 10, -104 + ph * 60, 3, ph * 8 + i, sin(ph * PI) * 0.6 * m, '#7fc04a', '#2f6a2a'); }
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // MUSHROOM FOLK (normal, m): a gentle spore-cap wanderer, until you swing at it. Accent: toxic green spores.
  // ---------------------------------------------------------------------------------------------------------------
  define({
    id: 'mushroom_folk', size: 'm', acc: '#b8ff5a', lunge: 26, alertColor: '#d8ff6a',
    col: { rim: '#ffe6b0', cap: cs('#e2592f'), stalk: cs('#efe0bc'), gill: '#d8b878', spot: '#fff3d8', root: cs('#a98a62') },
    hitAt: [0, -100], alertAt: [4, -150], hitBone: 'body', alertBone: 'cap', buffBone: 'body', guardBone: 'body',
    arc: { bone: 'body', x: 4, y: -140, r: 70, a0: -0.9, a1: -4.0, w: 14, color: '#ffe6b0' },
    bounds: { w: 160, h: 184, head: { x: 4, y: -150 }, body: { x: 0, y: -84 }, feet: { x: 0, y: 0 } },
    die: { kind: 'spore', colors: ['#b8ff5a', '#e2592f', '#fff3d8'], orb: '#d8ff9a', gravity: 0.3, size: 5 },
    dieBox: [-72, -184, 72, 0],
    parts: [
      { id: 'legB', box: [-2, -54, 34, 4], parent: 'body', pivot: [12, -50], xf: (K, t) => ({ rot: 0.03 * sin(t * 2.4 + 2) }),
        draw(S) { const dk = tk.shade(S.c.root.b, 0.12); S.limb([[12, -50], [14, -30], [12, -12]], dk, 16, 13); S.cel([[2, -12], [22, -12], [30, -6], [28, 1], [6, 3], [-2, -2]], dk, { depth: 3, line: S.lw * 0.9, tension: 0.55, hi: false }); } },
      { id: 'body', box: [-46, -126, 46, -40], parent: 'root', pivot: [0, -46],
        xf: (K, t, st) => ({ sy: 1 + 0.02 * sin(t * 2) * st.m - 0.03 * K.guard, sx: 1 - 0.01 * sin(t * 2) * st.m, rot: 0.03 * sin(t * 1.4) * st.m + 0.0 - 0.3 * K.strike + 0.1 * K.wind + 0.05 * K.hurt }),
        draw(S) {
          const c = S.c, g = S.g;
          S.cel([[-20, -124], [20, -124], [24, -100], [28, -74], [30, -52], [0, -44], [-30, -52], [-27, -74], [-23, -100]], c.stalk.b, { depth: 9, halftone: { d: 4.4, alpha: 0.2 }, tension: 0.7, rim: '#ffffff', hi: false,
            decor: (gg) => { gg.strokeStyle = rgba(c.stalk.d, 0.35); gg.lineWidth = 1.4; for (let i = -2; i <= 2; i++) { gg.beginPath(); gg.moveTo(i * 9, -120); gg.quadraticCurveTo(i * 12, -84, i * 14, -48); gg.stroke(); } } });
          // the ring skirt of the stem, scalloped
          const ring = [[-44, -78], [-30, -86], [0, -88], [30, -86], [44, -78], [40, -70, 1], [30, -73], [22, -66, 1], [12, -72], [2, -65, 1], [-8, -72], [-18, -66, 1], [-28, -73], [-36, -68, 1]];
          S.cel(ring, tk.mix(c.stalk.b, '#d8b878', 0.45), { depth: 4, line: S.lw * 0.9, tension: 0.6, rim: '#fff3d8', hi: false, decor: (gg) => { gg.strokeStyle = rgba(c.stalk.d, 0.5); gg.lineWidth = 1.3; for (let i = -3; i <= 3; i++) { gg.beginPath(); gg.moveTo(i * 12, -86); gg.lineTo(i * 13, -70); gg.stroke(); } } });
          void g;
        } },
      { id: 'legF', box: [-42, -54, 8, 4], parent: 'body', pivot: [-12, -50], xf: (K, t) => ({ rot: -0.03 * sin(t * 2.4) }),
        draw(S) { const rt = S.c.root; S.limb([[-12, -50], [-15, -30], [-18, -12]], rt.b, 17, 14); S.cel([[-6, -12], [-28, -12], [-38, -6], [-36, 1], [-14, 3], [-4, -2]], rt.b, { depth: 3, line: S.lw, tension: 0.55,
          decor: (g) => { g.strokeStyle = rgba(rt.d, 0.7); g.lineWidth = 1.3; [[-24, -8, -28, 2], [-32, -6, -35, 2]].forEach((l) => { g.beginPath(); g.moveTo(l[0], l[1]); g.lineTo(l[2], l[3]); g.stroke(); }); } }); } },
      { id: 'face', box: [-30, -124, 30, -84], parent: 'body', pivot: [0, -104], face: true,
        draw(S, state) {
          const [ey, mo] = state.split('|'), g = S.g;
          const ex = ey === 'open' ? 'sleepy' : ey;
          S.eye(-11, -104, 13, 16, ex, { iris: ['#4a6a00', '#b8ff5a'], sclera: '#fffaf0', glow: 0.5, lashes: false, wing: 0.1 });
          S.eye(11, -104, 13, 16, ex, { iris: ['#4a6a00', '#b8ff5a'], sclera: '#fffaf0', glow: 0.5, lashes: false, wing: 0.1, side: -1 });
          tk.blush(g, -21, -94, 9, { alpha: 0.4, color: '#ff9a8a' }); tk.blush(g, 21, -94, 9, { alpha: 0.4, color: '#ff9a8a' });
          if (mo === 'open') { g.beginPath(); g.ellipse(0, -88, 6, 6.5, 0, 0, TAU); g.fillStyle = '#4a1020'; g.fill(); tk.inkPath(g, ell(0, -88, 6, 6.5, 9), { closed: true, w: 1.8, align: 0 }); }
          else if (mo === 'grit') tk.inkPath(g, [[-7, -90], [-3, -87], [3, -90], [7, -87]], { w: 2, taper: 0.2 });
          else tk.inkPath(g, [[-5, -90], [0, -87], [5, -90]], { w: 2, taper: 0.3 });
        } },
      ...arm2({
        id: 'armF', parent: 'body', sh: [-24, -100], el: [-38, -88], wrist: [-44, -68], w: [10, 9, 8], hr: 11, bend: 1.5, color: '#efe0bc', tubeOpts: { rim: '#ffffff' },
        a1: (K, t) => ({ rot: 0.06 * sin(t * 1.8) + 2.5 * K.wind + 0.6 * K.strike + 0.9 * K.guard }),
        a2: (K, t) => ({ rot: 0.1 * sin(t * 2.1) + 0.4 * K.wind + 0.7 * K.strike + 1.8 * K.guard }),
        hand: (S, x, y) => { S.cel(blob(x, y + 2, 7, 7, 2, 0.1, 8), S.c.stalk.b, { depth: 2, line: S.lw * 0.8, hi: false }); [-1, 0, 1].forEach((k) => S.cel(taper(x + k * 4.4, y + 6, x + k * 5.4, y + 13, 4, 2), S.c.stalk.s, { depth: 0.5, line: 1.2, rim: null, hi: false, shadow: false })); },
      }),
      ...arm2({
        id: 'armB', parent: 'body', sh: [24, -100], el: [38, -90], wrist: [46, -72], w: [10, 9, 8], hr: 11, boxF: [24, -104, 66, 8], bend: -1.5, color: tk.shade('#efe0bc', 0.12),
        a1: (K, t) => ({ rot: 0.04 * sin(t * 1.8 + 1) - 0.2 * K.strike + 0.1 * K.guard }),
        a2: (K, t) => ({ rot: 0.06 * sin(t * 2.1 + 1) }),
        hand: (S, x, y) => { S.cel(blob(x, y + 2, 7, 7, 2, 0.1, 8), tk.shade(S.c.stalk.b, 0.12), { depth: 2, line: S.lw * 0.8, hi: false }); },
        decorF: (S) => { S.tube([[47, -76], [48, -40], [47, 0]], 6, 5, '#7a5a3a', { depth: 1.5, line: S.lw * 0.8, hi: false, rim: '#c8a070' }); S.cel(blob(46, -84, 5, 6, 2, 0.1, 8), '#c8a840', { depth: 1.5, line: 1.6, hi: false }); },
      }),
      { id: 'cap', box: [-84, -204, 88, -104], parent: 'body', pivot: [4, -122],
        xf: (K, t, st) => ({ rot: 0.05 * sin(t * 1.6 + 0.4) * st.m - 0.2 * K.strike + 0.08 * K.wind, dy: -3 * K.wind + 2 * K.guard, dx: -14 * K.strike, sy: 1 - 0.06 * K.guard, sx: 1 + 0.06 * K.guard }),
        draw(S) {
          const c = S.c, g = S.g;
          const dome = [[-72, -124], [-62, -154], [-32, -176], [6, -182], [44, -174], [68, -152], [78, -124], [58, -114, 1], [30, -120], [4, -114, 1], [-24, -120], [-52, -112, 1]];
          S.cel(dome, c.cap.b, { depth: 14, halftone: { d: 4.6, alpha: 0.26 }, tension: 0.6, rim: '#ffc080', hi: c.cap.l,
            decor: (gg) => {
              gg.fillStyle = c.spot;
              [[-40, -150, 10], [-8, -166, 8], [24, -150, 12], [52, -138, 8], [-56, -132, 6], [8, -136, 7], [-22, -136, 5]].forEach((sp) => { gg.beginPath(); gg.ellipse(sp[0], sp[1], sp[2], sp[2] * 0.85, 0, 0, TAU); gg.fill(); });
              gg.fillStyle = rgba(c.cap.d, 0.35); [[-36, -146, 4], [28, -146, 5]].forEach((sp) => { gg.beginPath(); gg.arc(sp[0] + 2, sp[1] + 3, sp[2], 0, TAU); gg.fill(); });
              // gills peeking along the underside of the rim
              gg.strokeStyle = rgba(c.gill, 0.9); gg.lineWidth = 1.6; for (let i = -6; i <= 6; i++) { gg.beginPath(); gg.moveTo(i * 10 + 4, -120); gg.lineTo(i * 10.6 + 4, -112); gg.stroke(); }
            } });
          // the short bamboo-thorns that grow on the cap (the live ones lengthen them)
          [[-30, -172], [6, -180], [42, -172]].forEach((p) => S.cel([[p[0] - 4, p[1] + 2], [p[0], p[1] - 10], [p[0] + 4, p[1] + 2]], '#fff3d8', { depth: 1, line: 1.6, tension: 0.3, hi: false, rim: null, shadow: false }));
          void g;
        } },
      { id: 'thorns', parent: 'cap', live(ctx, st) {
        const K = st.K, g = 0.35 + 0.65 * K.buff + 0.35 * K.alert;
        [[-56, -146, -2.2], [-42, -166, -1.9], [-20, -178, -1.7], [20, -180, -1.4], [52, -164, -1.0], [66, -142, -0.7]].forEach((p, i) => {
          const len = 10 + 16 * g * (0.7 + 0.3 * ((i * 7) % 3) / 2);
          ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(p[2] + PI / 2); ctx.beginPath(); ctx.moveTo(-4, 2); ctx.lineTo(0, -len); ctx.lineTo(4, 2); ctx.closePath();
          ctx.fillStyle = '#fff3d8'; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = pal.ink; ctx.stroke(); ctx.restore();
        });
      } },
      { id: 'spores', parent: 'cap', live(ctx, st) {
        const K = st.K, t = st.t, m = st.m, burst = K.pose === 'attack' ? K.strike : K.alert * 0.8, rr = table('spores', 16, 3);
        tk.glow(ctx, 4, -140, 60, '#b8ff5a', 0.08 + 0.12 * burst);
        for (let i = 0; i < 9; i++) {
          const ph = (t * 0.32 + i / 9) % 1, x = -56 + rr[i][0] * 112 + sin(ph * 5 + i) * 8, y = -116 - ph * 50;
          FX.bit(ctx, 'spore', x, y + 46, 3 + rr[i][1] * 3, 0, sin(ph * PI) * 0.75 * m + 0.1 * m, rr[i][2] > 0.5 ? '#b8ff5a' : '#c890ff');
        }
        if (burst > 0.05) for (let i = 0; i < 10; i++) {
          const x = -30 - burst * (24 + rr[i][0] * 70), y = -116 + (rr[i][1] - 0.4) * 50 - burst * 6;
          FX.bit(ctx, 'spore', x, y, 5 + rr[i][2] * 7, 0, 0.55 * burst, i % 2 ? '#b8ff5a' : '#8f6ae8');
        }
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // BAMBOO BOAR (normal, l): a charger that ate so much bamboo its hide turned to green armour. Accent: red-hot eyes and steam.
  // ---------------------------------------------------------------------------------------------------------------
  function boarLeg(id, hx, near, paw) {
    const dark = !near;
    return {
      id, box: [hx - 34, -108, hx + 30, 4], parent: 'body', pivot: [hx, -72],
      xf: (K, t, st) => ({ rot: 0.02 * sin(t * 2 + hx) + (paw ? -0.5 * Math.abs(sin(t * 9)) * K.alert * st.m - 0.45 * K.wind + 0.5 * K.strike : 0.2 * K.strike * (hx > 0 ? 1 : -1)) }),
      draw(S) {
        const c = S.c, hide = dark ? tk.shade(c.hide.b, 0.2) : c.hide.b;
        S.tube([[hx, -76], [hx + 3, -46], [hx + 1, -16]], 34, 22, hide, { depth: 6, line: S.lw, hi: false, bulge: 0.08, halftone: { d: 4.6, alpha: 0.24 } });
        S.cel([[hx - 13, -20], [hx + 13, -20], [hx + 15, 0], [hx - 16, 0]], dark ? '#2a2030' : '#3a2c3a', { depth: 3, line: S.lw * 0.9, tension: 0.3, hi: false, rim: '#a08aa0' });
        S.ln([[hx - 1, -18], [hx, -2]], { w: 1.6, color: '#0d0b1e', alpha: 0.7 });
      },
    };
  }
  function bambooStalk(S, x0, y0, x1, y1, w, c) {
    const sp = [[x0, y0], [(x0 + x1) / 2 + 2, (y0 + y1) / 2], [x1, y1]];
    S.tube(sp, w, w * 0.8, c.bam.b, { depth: 3.5, line: S.lw * 0.9, rim: '#e8ffb0', hi: false, tension: 0.8,
      decor: (g) => { for (let u = 0.18; u < 1; u += 0.24) { const p = spineAt(sp, u); g.fillStyle = c.node; g.fillRect(p.x - w, p.y - 2.5, w * 2, 5); g.fillStyle = rgba(c.bam.d, 0.6); g.fillRect(p.x - w, p.y + 2, w * 2, 1.6); } } });
  }
  define({
    id: 'bamboo_boar', size: 'l', acc: '#ff7a3a', lunge: 86, alertColor: '#ff9a3a', ox: 26,
    col: { rim: '#ffd6a0', hide: cs('#7c5b4a'), belly: '#a5826a', bris: '#3a2a26', bam: cs('#5faa4a'), node: '#a8dc70', tusk: cs('#f3e6c8') },
    hitAt: [-90, -112], alertAt: [-100, -110], hitBone: 'head', alertBone: 'head', buffBone: 'body', guardBone: 'body',
    tweak(K) { K.bsy *= 1 - 0.07 * K.wind; K.brot -= 0.05 * K.wind; K.bsx *= 1 + 0.04 * K.wind; },
    arc: { bone: 'head', x: -150, y: -96, r: 44, a0: 1.7, a1: 4.4, w: 14, color: '#ffd6a0' },
    bounds: { w: 310, h: 262, head: { x: -100, y: -110 }, body: { x: 26, y: -108 }, feet: { x: 0, y: 0 } },
    die: { kind: 'leaf', colors: ['#5faa4a', '#a8dc70', '#7c5b4a'], orb: '#ffd6a0', gravity: 0.8, size: 7 },
    dieBox: [-140, -262, 160, 0], strips: 8,
    parts: [
      { id: 'shoot1', box: [-76, -290, 30, -140], parent: 'body', pivot: [-24, -158], xf: (K, t, st) => ({ rot: 0.05 * sin(t * 1.3) * st.m + 0.04 * K.wind - 0.05 * K.strike }),
        draw(S) { const c = S.c; bambooStalk(S, -24, -158, -30, -236, 12, c); leafBlade(S, -30, -236, -2.4, 44, 14, tk.shade('#3f9a3a', 0.1)); leafBlade(S, -30, -236, -0.7, 40, 13, '#68b840'); leafBlade(S, -30, -236, -1.6, 46, 14, '#3f9a3a'); } },
      { id: 'shoot2', box: [-24, -300, 90, -140], parent: 'body', pivot: [22, -164], xf: (K, t, st) => ({ rot: 0.06 * sin(t * 1.1 + 1.5) * st.m + 0.04 * K.wind - 0.05 * K.strike }),
        draw(S) { const c = S.c; bambooStalk(S, 22, -164, 30, -250, 14, c); leafBlade(S, 30, -250, -2.3, 46, 15, '#3f9a3a'); leafBlade(S, 30, -250, -0.6, 44, 14, tk.shade('#3f9a3a', 0.1)); leafBlade(S, 30, -250, -1.5, 48, 15, '#68b840'); } },
      { id: 'shoot3', box: [10, -260, 100, -140], parent: 'body', pivot: [50, -156], xf: (K, t, st) => ({ rot: 0.07 * sin(t * 1.4 + 3) * st.m + 0.04 * K.wind - 0.05 * K.strike }),
        draw(S) { const c = S.c; bambooStalk(S, 50, -156, 56, -218, 11, c); leafBlade(S, 56, -218, -2.3, 40, 13, '#68b840'); leafBlade(S, 56, -218, -0.7, 38, 12, '#3f9a3a'); } },
      { id: 'tail', box: [88, -150, 128, -90], parent: 'body', pivot: [96, -118], xf: (K, t, st) => ({ rot: 0.25 * sin(t * 3) * st.m + 0.3 * K.strike }),
        draw(S) { const c = S.c; S.tube([[94, -118], [110, -128], [118, -112], [110, -100]], 12, 4, c.hide.b, { depth: 3, line: S.lw * 0.85, hi: false }); S.cel([[108, -100], [114, -94], [118, -104]], c.bris, { depth: 1, line: 1.6, shadow: false, hi: false, rim: null, tension: 0.3 }); } },
      boarLeg('legBB', 74, false, false),
      boarLeg('legBF', -66, false, false),
      { id: 'body', box: [-108, -180, 112, -44], parent: 'root', pivot: [6, -50],
        xf: (K, t, st) => ({ sy: 1 + 0.02 * sin(t * 1.9) * st.m - 0.03 * K.guard, sx: 1 - 0.01 * sin(t * 1.9) * st.m + 0.03 * K.guard, rot: -0.02 * K.strike }),
        draw(S) {
          const c = S.c, g = S.g;
          const barrel = [[-96, -120], [-84, -152], [-46, -170], [10, -172], [58, -166], [96, -146], [110, -112], [100, -80], [60, -56], [10, -50], [-44, -54], [-84, -74]];
          S.cel(barrel, c.hide.b, { depth: 16, halftone: { d: 5, alpha: 0.28 }, tension: 0.85, rim: '#ffb060', hi: '#a0806e',
            decor: (gg) => {
              gg.fillStyle = c.belly; gg.beginPath(); tk.trace(gg, [[-70, -74], [-20, -84], [40, -84], [90, -90], [88, -50], [10, -40], [-60, -50]]); gg.fill();
              gg.strokeStyle = rgba(c.bris, 0.55); gg.lineWidth = 1.5; gg.lineCap = 'round';
              for (let i = 0; i < 26; i++) { const x = -90 + i * 8, y = -158 + ((i * 37) % 22) - (x > 40 ? -(x - 40) * 0.5 : 0); gg.beginPath(); gg.moveTo(x, y); gg.lineTo(x + 5, y + 9); gg.stroke(); }
              gg.fillStyle = rgba('#ffffff', 0.1); gg.beginPath(); gg.ellipse(-4, -140, 64, 12, -0.04, 0, TAU); gg.fill();
            } });
          void g;
        } },
      { id: 'mane', box: [-112, -200, 84, -110], parent: 'body', pivot: [-20, -150], xf: (K, t, st) => ({ sy: 1 + 0.5 * K.guard + 0.3 * K.buff + 0.25 * K.alert, rot: 0.01 * sin(t * 2) * st.m }),
        draw(S) {
          const c = S.c;
          const sp = [];
          for (let i = 0; i < 15; i++) { const x = -96 + i * 12, y = -150 - Math.sin((i / 14) * PI) * 18 + (i > 9 ? (i - 9) * 3 : 0); sp.push([x - 5, y + 8], [x + 1, y - 22 - (i % 3) * 6, 1], [x + 5, y + 8]); }
          S.cel(sp, c.bris, { depth: 2, line: S.lw * 0.85, tension: 0.2, hi: false, rim: '#a08aa0', shadow: false });
        } },
      { id: 'plates', box: [-70, -170, 90, -70], parent: 'body', pivot: [10, -110], xf: (K) => ({ sx: 1 + 0.06 * K.guard + 0.05 * K.buff, sy: 1 + 0.08 * K.guard + 0.06 * K.buff }),
        draw(S) {
          const c = S.c, g = S.g;
          for (let i = 0; i < 8; i++) {
            const x = -60 + i * 18, top = -166 + Math.abs(i - 3.5) * 3.2, bot = -84 - Math.abs(i - 3.5) * 3;
            S.cel(rrectPts(x - 8, top, 17, bot - top, 7), i % 2 ? tk.shade(c.bam.b, 0.06) : c.bam.b, { depth: 3.5, line: S.lw * 0.9, tension: 0.45, rim: '#e8ffb0', rimW: 1.4, hi: false,
              decor: (gg) => { gg.fillStyle = c.node; gg.fillRect(x - 9, top + (bot - top) * 0.32, 19, 5); gg.fillRect(x - 9, top + (bot - top) * 0.72, 19, 5); gg.fillStyle = rgba(c.bam.d, 0.55); gg.fillRect(x - 9, top + (bot - top) * 0.32 + 4, 19, 1.6); gg.fillRect(x - 9, top + (bot - top) * 0.72 + 4, 19, 1.6); } });
          }
          tk.inkPath(g, [[-70, -140], [0, -132], [80, -136]], { w: 5, color: pal.ink, taper: 0.05 }); tk.inkPath(g, [[-70, -140], [0, -132], [80, -136]], { w: 2.8, color: '#e9d9a2', taper: 0.05 });
          tk.inkPath(g, [[-70, -108], [0, -100], [80, -106]], { w: 5, color: pal.ink, taper: 0.05 }); tk.inkPath(g, [[-70, -108], [0, -100], [80, -106]], { w: 2.8, color: '#e9d9a2', taper: 0.05 });
        } },
      boarLeg('legNB', 50, true, false),
      boarLeg('legNF', -42, true, true),
      { id: 'head', box: [-176, -196, -58, -50], parent: 'body', pivot: [-84, -118],
        xf: (K, t, st) => ({ rot: 0.03 * sin(t * 1.9) * st.m - 0.34 * K.wind - 0.22 * K.strike + 0.12 * K.hurt, dx: -20 * K.strike, dy: 4 * K.wind + 1.5 * sin(t * 1.9 + 0.5) * st.m }),
        draw(S) {
          const c = S.c, g = S.g;
          S.cel([[-72, -154], [-100, -160], [-128, -140], [-152, -112], [-162, -96], [-156, -76], [-134, -66], [-100, -68], [-78, -84], [-62, -112], [-64, -138]], c.hide.b, { depth: 11, halftone: { d: 4.8, alpha: 0.26 }, tension: 0.85, rim: '#ffb060', hi: '#a0806e' });
          // snout disc with nostrils
          S.cel(blob(-160, -88, 15, 19, 4, 0.05, 12, -0.2), tk.shade(c.hide.b, -0.05), { depth: 4, line: S.lw * 0.95, rim: '#ffd6a0', hi: false });
          S.cel(ell(-164, -95, 3.6, 5, 8), '#1a1020', { depth: 1, line: 1.4, shadow: false, hi: false, rim: null }); S.cel(ell(-158, -80, 3.4, 4.8, 8), '#1a1020', { depth: 1, line: 1.4, shadow: false, hi: false, rim: null });
          // curling tusk
          S.cel([[-146, -70], [-158, -80, 1], [-164, -108], [-154, -126, 1], [-152, -104], [-142, -82]], c.tusk.b, { depth: 3, line: S.lw * 0.9, tension: 0.75, rim: '#ffffff', hi: false });
          // ear and brow ridge
          S.cel([[-86, -152], [-96, -178], [-112, -156], [-104, -142]], c.hide.b, { depth: 3, line: S.lw * 0.9, tension: 0.4, hi: false, rim: null, decor: (gg) => { gg.fillStyle = rgba('#e8a0a0', 0.6); gg.beginPath(); tk.trace(gg, [[-94, -152], [-98, -166], [-104, -154]]); gg.fill(); } });
          S.cel([[-130, -128], [-108, -140], [-82, -132], [-84, -124], [-108, -128], [-128, -120]], c.bris, { depth: 2, line: S.lw * 0.8, tension: 0.4, hi: false, rim: null, shadow: false });
          void g;
        } },
      { id: 'face', box: [-146, -150, -70, -96], parent: 'head', pivot: [-104, -122], face: true,
        draw(S, state) {
          const [ey, mo] = state.split('|'), g = S.g;
          const ex = ey === 'open' ? 'angry' : ey;
          S.bead(-114, -120, 8.6, ex, { sclera: '#fff0d8', iris: '#d8401a', iris2: '#ff9a3a', pupil: '#1a1020', lid: '#7c5b4a', tilt: 0.7 });
          S.bead(-92, -124, 7, ex, { sclera: '#fff0d8', iris: '#d8401a', iris2: '#ff9a3a', pupil: '#1a1020', lid: '#7c5b4a', tilt: 0.7 });
          if (mo === 'open') { const sh = [[-150, -84], [-128, -84], [-108, -78], [-112, -64], [-140, -62]]; S.fill(sh, '#4a1020'); S.fill([[-146, -84], [-140, -84], [-143, -76]], '#fffaf0'); tk.inkPath(g, sh, { closed: true, w: 2, align: 0, tension: 0.6 }); }
          else tk.inkPath(g, [[-150, -84], [-128, -80], [-108, -84]], { w: 2.2, taper: 0.2, alpha: 0.8 });
        } },
      { id: 'steam', parent: 'head', live(ctx, st) {
        const K = st.K, t = st.t, m = st.m, k = 0.5 + 0.6 * K.alert + 0.4 * K.strike;
        tk.glow(ctx, -114, -120, 20, '#ff7a3a', 0.28 * k); tk.glow(ctx, -92, -124, 16, '#ff7a3a', 0.24 * k);
        for (let i = 0; i < 6; i++) {
          const ph = (t * (0.7 + 0.5 * k) + i / 6) % 1;
          ctx.save(); ctx.globalAlpha *= sin(ph * PI) * 0.75 * m * Math.min(1, 0.4 + k * 0.5); ctx.fillStyle = '#fff8f0';
          ctx.beginPath(); ctx.arc(-172 - ph * 34, -92 - ph * 20 + (i % 2) * 8, 3 + ph * 8 * (0.8 + k * 0.4), 0, TAU); ctx.fill(); ctx.restore();
        }
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // ONI BRUTE (elite, l): a blue champion of the mountain oni with an iron kanabo, gold and a grudge. Below half HP (phase 1) he
  // flushes violet, veins of ember light open across his arms and chest and steam pours off him. Accent: amber eyes and ember veins.
  // ---------------------------------------------------------------------------------------------------------------
  const BRU_BLUE = cs('#4a63b8'), BRU_RAGE = cs('#7a3fb0');
  const bruSkin = (v) => (v === 'r' ? BRU_RAGE : BRU_BLUE);
  const bruFist = (S, x, y, v) => {
    const sk = bruSkin(v);
    S.cel(blob(x - 2, y + 6, 20, 19, 4, 0.05, 12), sk.b, { depth: 6, line: S.lw, halftone: { d: 4.6, alpha: 0.24 } });
    [-1, 0, 1].forEach((k) => S.ln([[x + k * 10 - 3, y - 6], [x + k * 11, y + 16]], { w: 1.8, alpha: 0.55, taper: 0.4 }));
    S.cel([[x - 20, y - 8], [x + 18, y - 8], [x + 18, y + 1], [x - 20, y + 1]], '#f5c96a', { depth: 2, line: 1.8, tension: 0.3, hi: false, rim: '#fff2c8' });
  };
  define({
    id: 'oni_brute', size: 'l', acc: '#ffb03a', lunge: 74, alertColor: '#ffb340', ox: 12,
    col: { rim: '#ffd6a0', hair: cs('#eeeefa'), horn: cs('#f3e6c8'), gold: '#f5c96a', cloth: cs('#f5c96a'), sash: cs('#a02a3a'), iron: cs('#4a4a5e'), bead: cs('#8a5a3a') },
    hitAt: [-8, -150], alertAt: [-8, -208], hitBone: 'body', alertBone: 'head', buffBone: 'body', guardBone: 'body',
    arc: { bone: 'body', x: -56, y: -166, r: 92, a0: -1.0, a1: -3.9, w: 20, color: '#ffd6a0' },
    bounds: { w: 260, h: 282, head: { x: -14, y: -230 }, body: { x: 6, y: -130 }, feet: { x: 0, y: 0 } },
    die: { kind: 'ember', colors: ['#ffb03a', '#4a63b8', '#ffffff'], orb: '#ffd6a0', gravity: 0.3, size: 6 },
    dieBox: [-140, -284, 120, 0], strips: 8,
    parts: [
      ...arm2({
        id: 'armB', parent: 'body', sh: [56, -166], el: [80, -138], wrist: [68, -102], w: [36, 30, 28], hr: 22, bend: -2, color: (v) => tk.shade(bruSkin(v).b, 0.2), v: (st) => (st.phase >= 1 ? 'r' : ''),
        a1: (K, t) => ({ rot: 0.04 * sin(t * 1.6 + 1) - 0.3 * K.wind + 0.2 * K.strike - 0.3 * K.guard }),
        a2: (K, t) => ({ rot: 0.06 * sin(t * 1.9 + 1) - 0.2 * K.wind + 0.3 * K.strike - 0.9 * K.guard }),
        hand: (S, x, y, v) => bruFist(S, x, y, v),
      }),
      { id: 'legB', box: [-16, -114, 84, 6], parent: 'body', pivot: [26, -88], v: (st) => (st.phase >= 1 ? 'r' : ''), xf: (K, t) => ({ rot: 0.02 * sin(t * 2.2 + 2) }),
        draw(S, v) { const dk = tk.shade(bruSkin(v).b, 0.2); S.limb([[26, -88], [30, -52], [32, -14]], dk, 46, 36, { bulge: 0.08 }); S.cel(pawFoot(46, -6, 64), dk, { depth: 4, line: S.lw, tension: 0.55, hi: false }); } },
      { id: 'body', box: [-76, -196, 78, -50], parent: 'root', pivot: [0, -90], v: (st) => (st.phase >= 1 ? 'r' : ''),
        xf: (K, t, st) => ({ sy: 1 + 0.018 * sin(t * 1.7) * st.m - 0.03 * K.guard, sx: 1 - 0.01 * sin(t * 1.7) * st.m + 0.03 * K.buff }),
        draw(S, v) {
          const c = S.c, g = S.g, sk = bruSkin(v);
          S.cel([[-62, -172], [-34, -184], [34, -184], [64, -170], [62, -140], [48, -110], [38, -88], [-38, -88], [-48, -110], [-60, -140]], sk.b, { depth: 16, halftone: { d: 5, alpha: 0.28 }, tension: 0.7, rim: v === 'r' ? '#ff9a6a' : '#b6c8ff',
            decor: (gg) => {
              gg.strokeStyle = rgba(sk.d, 0.55); gg.lineWidth = 2; gg.lineCap = 'round';
              [[-50, -160, -30, -138, -4, -152], [50, -160, 30, -138, 4, -152]].forEach((q) => { gg.beginPath(); gg.moveTo(q[0], q[1]); gg.quadraticCurveTo(q[2], q[3], q[4], q[5]); gg.stroke(); });
              gg.beginPath(); gg.moveTo(0, -172); gg.lineTo(0, -104); gg.stroke();
              [-124, -110, -98].forEach((y) => { gg.beginPath(); gg.moveTo(-16, y); gg.quadraticCurveTo(0, y + 4, 16, y); gg.stroke(); });
              gg.strokeStyle = rgba('#ffffff', 0.5); gg.lineWidth = 2.4; gg.beginPath(); gg.moveTo(-46, -172); gg.lineTo(-24, -140); gg.stroke();
              gg.beginPath(); gg.moveTo(-40, -172); gg.lineTo(-18, -140); gg.stroke();
            } });
          // tiger-skin loincloth under a gold-buckled belt
          S.cel([[-42, -94], [42, -94], [38, -54], [12, -48], [0, -62], [-12, -48], [-38, -54]], c.cloth.b, { depth: 5, line: S.lw * 0.95, tension: 0.5, rim: '#fff2b0',
            decor: (gg) => { gg.fillStyle = '#1c1230'; for (let i = 0; i < 7; i++) { const x = -40 + i * 12.5; gg.beginPath(); gg.moveTo(x, -94); gg.lineTo(x + 8, -92); gg.lineTo(x + 3, -52); gg.lineTo(x - 3, -54); gg.closePath(); gg.fill(); } } });
          tk.inkPath(g, [[-44, -92], [0, -86], [44, -92]], { w: 12, color: pal.ink, taper: 0.03 }); tk.inkPath(g, [[-44, -92], [0, -86], [44, -92]], { w: 8, color: '#5a2a1a', taper: 0.03 });
          S.cel(blob(0, -88, 13, 12, 3, 0.05, 10), c.gold, { depth: 3, line: S.lw * 0.9, rim: '#fff8d0' });
          S.dot(-4, -90, 1.8, pal.ink); S.dot(4, -90, 1.8, pal.ink); S.ln([[-4, -84], [0, -82], [4, -84]], { w: 1.6 });
          // the tattered bandolier with three faded medals
          S.cel([[-60, -170], [-44, -182], [56, -102], [40, -86], [30, -98, 1], [22, -84, 1], [12, -96]], c.sash.b, { depth: 4, line: S.lw * 0.9, tension: 0.25, rim: '#ff8a9a', hi: false,
            decor: (gg) => { gg.strokeStyle = rgba(c.gold, 0.9); gg.lineWidth = 2.2; gg.beginPath(); gg.moveTo(-58, -172); gg.lineTo(44, -90); gg.stroke(); } });
          [0.26, 0.5, 0.74].forEach((u, i) => { const x = lerp(-52, 46, u), y = lerp(-176, -95, u); S.cel(ell(x, y, 7.5, 7.5, 9), i === 1 ? '#f5c96a' : '#d8b060', { depth: 2, line: 1.8, rim: '#fff8d0', hi: false }); S.dot(x, y, 2.2, '#a07a30'); });
          // prayer-bead necklace
          for (let i = 0; i < 9; i++) { const u = i / 8, x = lerp(-38, 38, u), y = -176 + Math.sin(u * PI) * 24; S.cel(ell(x, y, 7.6, 7.6, 9), i === 4 ? '#c8302f' : c.bead.b, { depth: 2.5, line: 1.9, rim: '#e8b880', hi: false }); }
        } },
      { id: 'legF', box: [-90, -114, 6, 6], parent: 'root', pivot: [-24, -88], v: (st) => (st.phase >= 1 ? 'r' : ''), xf: (K, t) => ({ rot: -0.02 * sin(t * 2.2) }),
        draw(S, v) {
          const sk = bruSkin(v);
          S.limb([[-24, -88], [-30, -52], [-34, -14]], sk.b, 48, 38, { bulge: 0.08 });
          S.cel(pawFoot(-20, -6, 70), sk.b, { depth: 4, line: S.lw, tension: 0.55, decor: (g) => { g.strokeStyle = rgba(sk.d, 0.7); g.lineWidth = 1.8; [[-40, -6, -44, 6], [-54, -3, -58, 6]].forEach((l) => { g.beginPath(); g.moveTo(l[0], l[1]); g.lineTo(l[2], l[3]); g.stroke(); }); } });
          S.cel(rrectPts(-58, -34, 46, 8, 3), S.c.gold, { depth: 2, line: 1.8, tension: 0.3, hi: false, rim: '#fff8d0' });
        } },
      { id: 'head', box: [-84, -290, 90, -166], parent: 'body', pivot: [-6, -184], v: (st) => (st.phase >= 1 ? 'r' : ''),
        xf: (K, t, st) => ({ rot: 0.02 * sin(t * 1.7) + 0.12 * K.wind - 0.16 * K.strike + 0.07 * K.hurt, dy: -6 + 1.6 * sin(t * 1.7 + 0.5) * st.m + 3 * K.guard, dx: -12 * K.strike }),
        draw(S, v) {
          const c = S.c, g = S.g, sk = bruSkin(v);
          // the white mane of an old champion, streaming back
          S.cel([[8, -240], [34, -252, 1], [32, -234], [58, -240, 1], [50, -220], [76, -218, 1], [58, -204], [72, -190, 1], [40, -192], [12, -204]], c.hair.b, { depth: 6, line: S.lw * 0.95, tension: 0.35, rim: '#ffffff', hi: false });
          // ears with a gold ring
          S.cel(blob(-52, -208, 11, 15, 2, 0.05, 9, 0.3), sk.b, { depth: 3, line: S.lw * 0.9, hi: false, rim: null });
          tk.inkPath(g, ell(-54, -196, 6, 8, 10), { closed: true, w: 3.4, color: pal.ink, align: 0 }); tk.inkPath(g, ell(-54, -196, 6, 8, 10), { closed: true, w: 1.9, color: c.gold, align: 0 });
          // horns: a tall gold-capped one, and a chipped stump
          S.cel([[-36, -232], [-48, -250], [-54, -274, 1], [-32, -258], [-14, -238]], c.horn.b, { depth: 6, line: S.lw, tension: 0.6, rim: '#ffffff', hi: c.horn.l, decor: (gg) => { [-246, -258].forEach((y) => tk.inkPath(gg, [[-58, y], [-30, y + 5]], { w: 1.8, color: '#b09a70', alpha: 0.8, taper: 0.2 })); } });
          S.cel([[-58, -274, 1], [-52, -262], [-42, -268, 1], [-48, -282, 1]], c.gold, { depth: 2, line: 1.8, tension: 0.2, hi: false, rim: '#fff8d0' });
          S.cel([[8, -238], [10, -258], [17, -252], [21, -264, 1], [26, -238]], c.horn.b, { depth: 4, line: S.lw * 0.9, tension: 0.3, rim: '#ffffff', hi: false });
          S.cel(blob(-8, -206, 46, 38, 8, 0.03, 16), sk.b, { depth: 12, halftone: { d: 4.8, alpha: 0.26 }, rim: v === 'r' ? '#ff9a6a' : '#b6c8ff' });
          // heavy jaw
          S.cel([[-44, -196], [-30, -178], [-8, -172], [16, -180], [28, -198], [-4, -190]], sk.s, { depth: 3, line: S.lw * 0.9, tension: 0.5, hi: false, rim: null, shadow: false });
          // war paint on the cheek
          [[-36, -196, -22, -180], [-28, -200, -14, -184]].forEach((l) => tk.inkPath(g, [[l[0], l[1]], [l[2], l[3]]], { w: 4, color: '#e8383d', taper: 0.25 }));
        } },
      { id: 'face', box: [-70, -244, 50, -146], parent: 'head', pivot: [-8, -208], face: true,
        draw(S, state) {
          const [ey, mo] = state.split('|'), g = S.g;
          const ex = ey === 'open' ? 'angry' : ey, ir = ['#7a2a00', '#ffb03a'];
          S.eye(-26, -210, 22, 20, ex, { iris: ir, glow: 0.7, sclera: '#fff6e0', lashes: false, wing: 0.1, lineW: 2.4 });
          S.eye(8, -212, 19, 18, ex, { iris: ir, glow: 0.7, sclera: '#fff6e0', lashes: false, wing: 0.1, lineW: 2.2, catchSide: 1 });
          tk.brow(g, -28, -228, 28, { tilt: 0.85, side: 1, thick: 7, arch: 0.15, color: '#eeeefa' });
          tk.brow(g, 8, -230, 24, { tilt: 0.85, side: -1, thick: 6, arch: 0.15, color: '#eeeefa' });
          [-8, -1, 6].forEach((o) => tk.inkPath(g, [[-40 + o, -226], [-24 + o, -196]], { w: 2, color: '#eeeefa', alpha: 0.85, taper: 0.3 }));
          S.cel(blob(-8, -196, 8, 6, 3, 0.1, 8), tk.shade('#4a63b8', 0.1), { depth: 1, line: 1.6, hi: false, rim: null, shadow: false });
          S.dot(-11, -196, 1.8, pal.ink); S.dot(-5, -196, 1.8, pal.ink);
          if (mo === 'open') {
            const sh = [[-38, -186], [-20, -190], [6, -190], [24, -184], [16, -164], [-6, -156], [-30, -164]];
            S.fill(sh, '#4a0a1a'); S.fill([[-24, -168], [-8, -160], [8, -168], [-8, -174]], '#ff7fa0'); tk.inkPath(g, sh, { closed: true, w: 2.6, align: 0, tension: 0.7 });
            S.fill([[-34, -186], [-24, -186], [-29, -170]], '#fffaf0'); S.fill([[10, -188], [20, -186], [15, -172]], '#fffaf0');
          } else {
            tk.inkPath(g, [[-38, -184], [-18, -190], [4, -189], [22, -182]], { w: 4, taper: 0.2 });
            S.fill([[-32, -188], [-24, -189], [-28, -204]], '#fffaf0'); tk.inkPath(g, [[-32, -188], [-28, -204], [-24, -189]], { w: 1.5, taper: 0.1 });
            S.fill([[6, -189], [14, -187], [11, -202]], '#fffaf0'); tk.inkPath(g, [[6, -189], [11, -202], [14, -187]], { w: 1.5, taper: 0.1 });
          }
        } },
      { id: 'club', parent: 'armF2', pivot: [-94, -100], box: [-140, -160, -50, 28], xf: (K) => ({ rot: -0.85 * K.strike }),
        draw(S) {
          const c = S.c, d = [cos(1.75), sin(1.75)], w = [-94, -100], a = [w[0] - 26 * d[0], w[1] - 26 * d[1]], b = [w[0] + 100 * d[0], w[1] + 100 * d[1]], m = [lerp(a[0], b[0], 0.55), lerp(a[1], b[1], 0.55)];
          S.tube([a, m, b], 16, 46, c.iron.b, { depth: 7, line: S.lw, rim: '#a8a8d0', hi: '#7a7a98', tension: 0.9, halftone: { d: 4.4, alpha: 0.3 } });
          const spine = [a, m, b];
          for (let i = 0; i < 9; i++) { const u = 0.5 + (i % 4) * 0.13, p = spineAt(spine, u), off = (i % 2 ? 1 : -1) * (12 + u * 12); S.cel(taper(p.x - p.ty * off * 0.6, p.y + p.tx * off * 0.6, p.x - p.ty * (off + Math.sign(off) * 10), p.y + p.tx * (off + Math.sign(off) * 10), 8, 1.5), '#c8c8e0', { depth: 1, line: 1.5, tension: 0.3, hi: false, rim: null, shadow: false }); }
          const g0 = spineAt(spine, 0.16); S.cel(rrectPts(g0.x - 9, g0.y - 12, 18, 24, 3), '#6a3a2a', { depth: 2, line: 1.8, tension: 0.3, hi: false, rim: '#c8804a' });
          const g1 = spineAt(spine, 0.42); S.cel(taper(g1.x - g1.ty * 18, g1.y + g1.tx * 18, g1.x + g1.ty * 18, g1.y - g1.tx * 18, 7, 7), c.gold, { depth: 1.5, line: 1.8, tension: 0.3, hi: false, rim: '#fff8d0' });
        } },
      ...arm2({
        id: 'armF', parent: 'body', sh: [-56, -166], el: [-86, -134], wrist: [-94, -100], w: [40, 34, 30], hr: 26, bend: 3, color: (v) => bruSkin(v).b, v: (st) => (st.phase >= 1 ? 'r' : ''), tubeOpts: { bulge: 0.1 },
        a1: (K, t) => ({ rot: 0.04 * sin(t * 1.7) + 2.7 * K.wind + 0.6 * K.strike + 0.9 * K.guard - 0.15 * K.hurt }),
        a2: (K, t) => ({ rot: 0.06 * sin(t * 2) + 0.4 * K.wind + 0.7 * K.strike + 1.9 * K.guard }),
        decorU: (S) => { S.cel(taper(-70, -156, -78, -148, 40, 40), S.c.gold, { depth: 3, line: 2, tension: 0.3, hi: false, rim: '#fff8d0' }); },
        hand: (S, x, y, v) => bruFist(S, x, y, v),
      }),
      { id: 'pauldron', parent: 'body', box: [-96, -206, -34, -140], xf: () => ({}),
        draw(S) { const c = S.c; S.cel([[-88, -168], [-78, -190], [-54, -190], [-42, -170], [-54, -150], [-80, -152]], c.iron.b, { depth: 6, line: S.lw, tension: 0.6, rim: '#a8a8d0', hi: '#7a7a98' });
          [[-82, -186, -2.2], [-66, -196, -1.7], [-50, -190, -1.2]].forEach((sp) => S.cel(taper(sp[0], sp[1], sp[0] + cos(sp[2]) * 16, sp[1] + sin(sp[2]) * 16, 9, 1.5), '#c8c8e0', { depth: 1, line: 1.6, tension: 0.3, hi: false, rim: null, shadow: false })); } },
      { id: 'rage', parent: 'body', live(ctx, st) {
        const K = st.K, t = st.t, m = st.m;
        tk.glow(ctx, -30, -206, 26, '#ffb03a', (0.22 + 0.2 * K.alert + 0.2 * K.strike) * 0.9);
        tk.glow(ctx, 6, -208, 22, '#ffb03a', (0.2 + 0.2 * K.alert + 0.2 * K.strike) * 0.9);
        if (st.phase >= 1) {
          const pl = 0.6 + 0.4 * sin(t * 5);
          ctx.save(); ctx.lineCap = 'round'; ctx.globalCompositeOperation = 'lighter';
          [[-50, -160, -36, -140, -46, -118], [50, -160, 38, -138, 48, -114], [-22, -150, -8, -132, -16, -112], [70, -150, 76, -132, 70, -110]].forEach((v, i) => {
            ctx.beginPath(); ctx.moveTo(v[0], v[1]); ctx.quadraticCurveTo(v[2], v[3], v[4], v[5]);
            ctx.strokeStyle = rgba('#ff6a2a', 0.5 * pl); ctx.lineWidth = 7; ctx.stroke(); ctx.strokeStyle = rgba('#ffe9a8', 0.9 * pl); ctx.lineWidth = 2.2; ctx.stroke(); void i;
          });
          ctx.restore();
          for (let i = 0; i < 8; i++) { const ph = (t * 0.6 + i / 8) % 1, sx = i % 2 ? 66 : -84; ctx.save(); ctx.globalAlpha *= sin(ph * PI) * 0.4 * m; ctx.fillStyle = '#fff8f0'; ctx.beginPath(); ctx.arc(sx + (i % 2 ? 1 : -1) * ph * 14 + sin(ph * 6 + i) * 5, -172 - ph * 70, 3 + ph * 8, 0, TAU); ctx.fill(); ctx.restore(); }
          tk.glow(ctx, 0, -140, 130, '#ff5a3a', 0.16 * pl);
        }
        if (K.pose === 'attack') FX.dust(ctx, -118, -4, clamp((st.pt * 1000 - 150) / 270, 0, 1), 1.4, '#f3e6c8');
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // TENGU DUELIST (elite, l): a long-nosed red-faced master swordsman on tall clogs, wings folded like a cloak. He bows before every
  // strike. Accent: the cold glow of his blade (it flares below half HP). Grand: wide hakama, wings, gold sash.
  // ---------------------------------------------------------------------------------------------------------------
  function getaShoe(S, cx, cy, w) {
    S.cel(rrectPts(cx - w / 2, cy - 12, w, 10, 3), '#a8743c', { depth: 3, line: S.lw * 0.9, tension: 0.3, rim: '#ffd08a', hi: false });
    [-w * 0.28, w * 0.28].forEach((dx) => S.cel(rrectPts(cx + dx - 5, cy - 3, 10, 16, 2), '#7a5028', { depth: 1.5, line: 1.9, tension: 0.3, hi: false, rim: null }));
    S.cel(blob(cx - 2, cy - 18, w * 0.42, 8, 3, 0.05, 10), '#f4f0e8', { depth: 2.5, line: S.lw * 0.85, hi: false });
    S.ln([[cx - w * 0.3, cy - 10], [cx, cy - 5], [cx + w * 0.3, cy - 10]], { w: 2.2, color: '#c8302f' });
  }
  define({
    id: 'tengu_duelist', size: 'l', acc: '#9fe8ff', lunge: 96, alertColor: '#9fe8ff', ox: 38,
    col: { rim: '#c8e4ff', crow: cs('#2d2b4e'), face: cs('#d8503a'), haori: cs('#26306a'), hak: cs('#232a68'), lining: cs('#c8302f'), white: cs('#f4f0e8'), gold: '#e8b040', steel: '#e8f2ff' },
    hitAt: [-8, -150], alertAt: [-100, -166], hitBone: 'body', alertBone: 'body', buffBone: 'body', guardBone: 'body',
    arc: { bone: 'body', x: -24, y: -166, r: 150, a0: 2.75, a1: 3.65, w: 12, color: '#bfeaff' },
    bounds: { w: 320, h: 262, head: { x: -14, y: -222 }, body: { x: 10, y: -140 }, feet: { x: 0, y: 0 } },
    die: { kind: 'feather', colors: ['#2d2b4e', '#f4f0e8', '#9fe8ff'], orb: '#bfeaff', gravity: 0.7, size: 7 },
    dieBox: [-190, -270, 150, 0], strips: 8,
    tweak(K, pose, t) { K.brot += -0.04; },
    parts: [
      { id: 'wingBi', box: [-4, -304, 150, -140], parent: 'body', pivot: [14, -168],
        xf: (K, t, st) => ({ rot: -0.07 * sin(t * 1.5 + 0.6) * st.m + 0.35 * K.strike - 0.25 * K.wind - 0.15 * K.guard }),
        draw(S) { const c = S.c, b = tk.shade(c.crow.b, 0.15); [-1.6, -1.3, -1.0, -0.7, -0.4, -0.1, 0.2].forEach((a, i) => feather(S, 62, -210, a, 92 - i * 4, 19, i % 2 ? b : c.crow.b)); S.cel([[14, -166], [28, -196], [50, -218], [70, -214], [66, -190], [48, -170], [30, -160]], b, { depth: 7, line: S.lw, tension: 0.7, rim: '#8f8ad8' }); } },
      { id: 'wingFi', box: [-4, -230, 160, -110], parent: 'body', pivot: [16, -160],
        xf: (K, t, st) => ({ rot: 0.08 * sin(t * 1.5) * st.m + 0.3 * K.strike - 0.2 * K.wind - 0.12 * K.guard }),
        draw(S) { const c = S.c; [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9].forEach((a, i) => feather(S, 70, -160, a - 0.2, 86 - Math.abs(i - 3) * 4, 19, i % 2 ? c.crow.b : tk.shade(c.crow.b, 0.15))); S.cel([[16, -158], [30, -178], [56, -184], [76, -166], [66, -146], [40, -138]], c.crow.b, { depth: 7, line: S.lw, tension: 0.7, rim: '#8f8ad8' }); } },
      { id: 'haoriB', box: [8, -170, 96, -60], parent: 'body',
        chain: { spine: [[24, -150], [40, -122], [52, -90]], cuts: [0.4, 0.75], reach: 34 },
        bends: (K, t, st) => { const a = 0.12 * sin(t * 2 + 1) * st.m - 0.5 * K.strike + 0.15 * K.wind; return [a * 0.6, a, a * 1.2]; },
        draw(S) { const c = S.c; S.tube([[24, -150], [40, -122], [52, -90]], 34, 30, tk.shade(c.haori.b, 0.15), { depth: 5, line: S.lw * 0.95, tension: 0.9, hi: false, rim: '#8fa0ff' }); tk.inkPath(S.g, [[36, -146], [48, -120], [58, -92]], { w: 3, color: c.lining.b, taper: 0.1 }); } },
      ...arm2({
        id: 'armB', parent: 'body', sh: [14, -168], el: [42, -182], wrist: [56, -206], w: [20, 17, 13], hr: 18, bend: -2, color: tk.shade('#26306a', 0.15), tubeOpts: { rim: '#8fa0ff' },
        a1: (K, t) => ({ rot: 0.05 * sin(t * 1.8 + 1) + 0.5 * K.wind - 0.5 * K.strike + 0.3 * K.guard }),
        a2: (K, t) => ({ rot: 0.08 * sin(t * 2.1 + 1) + 0.4 * K.wind - 0.4 * K.strike }),
        hand: (S, x, y) => { S.cel(blob(x, y - 2, 8, 8, 2, 0.1, 8), tk.shade(S.c.face.b, 0.1), { depth: 2, line: S.lw * 0.85, hi: false }); [-1.2, -0.4, 0.4, 1.2].forEach((k) => S.cel(taper(x + k * 4, y - 6, x + k * 8, y - 20, 4.6, 2), tk.shade(S.c.face.b, 0.1), { depth: 1, line: 1.5, tension: 0.4, hi: false, rim: null, shadow: false })); },
      }),
      { id: 'getaB', box: [30, -52, 96, 4], parent: 'root', pivot: [62, -28], xf: (K, t) => ({ rot: 0.02 * sin(t * 2) }), draw(S) { getaShoe(S, 62, -20, 50); } },
      { id: 'getaF', box: [-96, -52, -24, 4], parent: 'root', pivot: [-58, -28], xf: (K, t) => ({ rot: -0.02 * sin(t * 2) }), draw(S) { getaShoe(S, -58, -20, 54); } },
      { id: 'hakama', box: [-96, -134, 100, -24], parent: 'root', pivot: [0, -122],
        xf: (K, t, st) => ({ sx: 1 + 0.012 * sin(t * 1.8) * st.m + 0.03 * K.strike, rot: 0.01 * sin(t * 1.6) * st.m }),
        draw(S) {
          const c = S.c;
          S.cel([[-34, -124], [34, -124], [54, -96], [76, -64], [90, -36, 1], [64, -30], [40, -40], [14, -28], [-14, -40], [-40, -28], [-66, -38], [-86, -34, 1], [-72, -64], [-50, -96]], c.hak.b, { depth: 14, line: S.lw, tension: 0.55, halftone: { d: 5, alpha: 0.26 }, rim: '#8fa0ff',
            decor: (g) => {
              g.strokeStyle = rgba(c.hak.d, 0.7); g.lineWidth = 1.8; g.lineCap = 'round';
              for (let i = -4; i <= 4; i++) { g.beginPath(); g.moveTo(i * 6, -122); g.quadraticCurveTo(i * 10, -80, i * 17 + (i < 0 ? -6 : 6), -34); g.stroke(); }
              g.strokeStyle = rgba('#8fa0ff', 0.4); g.lineWidth = 2.2; g.beginPath(); g.moveTo(-8, -120); g.quadraticCurveTo(-24, -80, -40, -36); g.stroke();
              g.strokeStyle = rgba(c.gold, 0.9); g.lineWidth = 3; g.beginPath(); g.moveTo(-86, -37); g.lineTo(-66, -40); g.lineTo(-40, -30); g.lineTo(-14, -41); g.lineTo(14, -30); g.lineTo(40, -42); g.lineTo(64, -32); g.lineTo(90, -38); g.stroke();
            } });
        } },
      { id: 'body', box: [-46, -196, 116, -78], parent: 'root', pivot: [0, -120],
        xf: (K, t, st) => ({ sy: 1 + 0.014 * sin(t * 1.7) * st.m, rot: 0.02 * sin(t * 1.3) * st.m - 0.05 * K.strike + 0.06 * K.wind }),
        draw(S) {
          const c = S.c, g = S.g;
          // the long black scabbard pokes out behind the far hip
          S.tube([[26, -126], [64, -110], [104, -96]], 10, 8, '#1c1630', { depth: 2, line: S.lw * 0.85, hi: false, rim: '#8f8ad8', tension: 0.9 });
          S.cel(rrectPts(98, -102, 12, 12, 3), c.gold, { depth: 1.5, line: 1.7, tension: 0.3, hi: false, rim: '#fff8d0' });
          S.cel([[-32, -178], [28, -180], [40, -148], [36, -118], [-36, -118], [-40, -150]], c.haori.b, { depth: 12, line: S.lw, tension: 0.6, halftone: { d: 5, alpha: 0.26 }, rim: '#8fa0ff', hi: c.haori.l,
            decor: (gg) => {
              gg.fillStyle = c.white.b; gg.beginPath(); gg.moveTo(-14, -180); gg.lineTo(12, -180); gg.lineTo(6, -140); gg.lineTo(-2, -118); gg.lineTo(-10, -118); gg.closePath(); gg.fill();
              gg.strokeStyle = c.lining.b; gg.lineWidth = 4; gg.beginPath(); gg.moveTo(-14, -180); gg.lineTo(-8, -140); gg.lineTo(-12, -118); gg.stroke(); gg.beginPath(); gg.moveTo(12, -180); gg.lineTo(8, -140); gg.lineTo(0, -118); gg.stroke();
              gg.fillStyle = rgba(c.white.b, 0.9); gg.beginPath(); gg.arc(-24, -146, 7, 0, TAU); gg.fill(); gg.strokeStyle = pal.ink; gg.lineWidth = 1.6; gg.beginPath(); gg.arc(-24, -146, 7, 0, TAU); gg.stroke();
              gg.beginPath(); gg.moveTo(-24, -152); gg.lineTo(-24, -140); gg.moveTo(-30, -146); gg.lineTo(-18, -146); gg.stroke();
            } });
          S.cel([[-40, -132], [40, -130], [40, -116], [-40, -118]], c.gold, { depth: 3, line: S.lw * 0.9, tension: 0.3, rim: '#fff8d0', hi: false });
          S.ln([[-4, -130], [-6, -104], [-2, -96]], { w: 3, color: c.lining.b }); S.ln([[2, -130], [6, -102]], { w: 3, color: c.lining.b });
          void g;
        } },
      { id: 'haoriF', box: [-70, -170, 0, -60], parent: 'body',
        chain: { spine: [[-26, -150], [-40, -122], [-46, -88]], cuts: [0.4, 0.75], reach: 34 },
        bends: (K, t, st) => { const a = -0.1 * sin(t * 2) * st.m + 0.6 * K.strike - 0.2 * K.wind; return [a * 0.6, a, a * 1.2]; },
        draw(S) { const c = S.c; S.tube([[-26, -150], [-40, -122], [-46, -88]], 34, 30, c.haori.b, { depth: 5, line: S.lw * 0.95, tension: 0.9, rim: '#8fa0ff', hi: c.haori.l }); tk.inkPath(S.g, [[-16, -146], [-30, -120], [-36, -90]], { w: 3.4, color: c.lining.b, taper: 0.1 }); } },
      { id: 'head', box: [-108, -260, 60, -170], parent: 'body', pivot: [-8, -176],
        xf: (K, t, st) => ({ rot: 0.02 * sin(t * 1.6) + 0.06 * K.wind - 0.1 * K.strike + 0.06 * K.hurt, dy: 1.3 * sin(t * 1.6 + 0.5) * st.m, dx: -10 * K.strike }),
        draw(S) {
          const c = S.c, g = S.g;
          S.cel(blob(16, -232, 14, 12, 3, 0.1, 9), c.white.b, { depth: 3, line: S.lw * 0.9, rim: '#ffffff', hi: false });
          S.cel(blob(-8, -204, 30, 28, 5, 0.03, 14), c.face.b, { depth: 9, halftone: { d: 4.4, alpha: 0.26 }, rim: '#ffb090' });
          // the great nose
          S.cel([[-28, -214], [-54, -212], [-86, -196, 1], [-58, -188], [-28, -192]], c.face.b, { depth: 5, line: S.lw, tension: 0.6, rim: '#ffb090', hi: false });
          S.dot(-70, -194, 2.2, pal.ink);
          // black tokin on the brow
          S.cel(tk.xf(rrectPts(-14, -240, 24, 16, 3), { rot: -0.15, cx: -2, cy: -232 }), '#1a1730', { depth: 3, line: S.lw * 0.9, tension: 0.3, rim: '#7a6bff', hi: false });
          S.cel(tk.xf(rrectPts(-6, -232, 9, 5, 2), { rot: -0.15, cx: -2, cy: -232 }), c.lining.b, { depth: 1, line: 1.4, tension: 0.3, shadow: false, hi: false, rim: null });
          tk.inkPath(g, [[-4, -196], [-14, -190]], { w: 1.8, alpha: 0.6, taper: 0.4 });
        } },
      { id: 'face', box: [-96, -236, 26, -176], parent: 'head', pivot: [-8, -204], face: true,
        draw(S, state) {
          const [ey, mo] = state.split('|'), g = S.g, ang = ey === 'angry' || ey === 'hurt';
          const ex = ey === 'open' ? 'determined' : ey;
          S.eye(-24, -206, 17, 15, ex, { iris: ['#8a5a00', '#ffe45e'], sclera: '#fff6d0', glow: 0.6, lashes: false, wing: 0.1, pupil: '#1a1730' });
          S.eye(0, -207, 14, 13, ex, { iris: ['#8a5a00', '#ffe45e'], sclera: '#fff6d0', glow: 0.6, lashes: false, wing: 0.1, pupil: '#1a1730', catchSide: 1 });
          // huge white brows, a drooping moustache
          S.cel([[-46, -216], [-30, -234, 1], [-24, -222], [-6, -232, 1], [0, -218], [-16, -212], [-38, -210]], '#f4f0e8', { depth: 3, line: S.lw * 0.85, tension: 0.35, rim: '#ffffff', hi: false, shadow: '#c8c0d8' });
          S.cel([[6, -218], [18, -230, 1], [24, -216], [14, -208]], '#f4f0e8', { depth: 2, line: S.lw * 0.8, tension: 0.35, hi: false, rim: null });
          [[-34, -192, -30, -172], [-26, -192, -16, -170]].forEach((m) => S.cel([[m[0], m[1]], [m[0] - 6, (m[1] + m[3]) / 2], [m[2], m[3], 1], [m[0] + 6, (m[1] + m[3]) / 2 + 2]], '#f4f0e8', { depth: 1.5, line: 1.7, tension: 0.4, hi: false, rim: null, shadow: false }));
          if (mo === 'open') { const sh = [[-30, -184], [-14, -186], [0, -182], [-6, -172], [-22, -172]]; S.fill(sh, '#4a0a1a'); tk.inkPath(g, sh, { closed: true, w: 2, align: 0, tension: 0.6 }); }
          else tk.inkPath(g, [[-28, -182], [-14, -178], [2, -182]], { w: 2, taper: 0.3, alpha: 0.8 });
        } },
      { id: 'beard', box: [-40, -196, 20, -120], parent: 'head',
        chain: { spine: [[-14, -186], [-8, -166], [-14, -144]], cuts: [0.4, 0.75], reach: 20 },
        bends: (K, t, st) => { const a = 0.14 * sin(t * 2.4) * st.m + 0.4 * K.strike; return [a * 0.5, a, a * 1.3]; },
        draw(S) { S.tube([[-14, -186], [-8, -166], [-14, -144]], 24, 2, '#f4f0e8', { depth: 4, line: S.lw * 0.85, tension: 0.9, hi: false, rim: '#ffffff', shadow: '#c8c0d8' }); } },
      { id: 'blade', parent: 'armF2', pivot: [-84, -164], box: [-236, -232, -50, -120], xf: (K) => ({ rot: -0.1 * K.strike + 0.2 * K.wind }),
        draw(S) {
          const c = S.c, g = S.g, d = [cos(3.35), sin(3.35)], w = [-84, -164], n = [-d[1], d[0]];
          const pt = (u, off) => [w[0] + d[0] * u + n[0] * off, w[1] + d[1] * u + n[1] * off];
          S.tube([pt(-26, 0), pt(-4, 0), pt(8, 0)], 9, 9, '#1a1730', { depth: 2, line: S.lw * 0.85, hi: false, rim: '#8f8ad8', tension: 0.8 });
          S.cel(ell(pt(-28, 0)[0], pt(-28, 0)[1], 6, 6, 8), c.gold, { depth: 1.5, line: 1.7, hi: false, rim: '#fff8d0' });
          const spine = [pt(8, 0), pt(66, 2.5), pt(124, 1)];
          S.tube(spine, 7, 2, c.steel, { depth: 2, line: S.lw * 0.85, hi: false, rim: '#ffffff', tension: 0.9, shadow: '#a8b8d8' });
          tk.inkPath(g, [pt(12, 1), pt(40, 3), pt(70, 3.6), pt(100, 2)], { w: 1.5, color: '#ffffff', alpha: 0.9, taper: 0.3 });
          const tsuba = [pt(8, -13), pt(12, -12), pt(12, 12), pt(8, 13)];
          S.cel(tsuba, c.gold, { depth: 1.5, line: 1.9, tension: 0.4, hi: false, rim: '#fff8d0' });
        } },
      ...arm2({
        id: 'armF', parent: 'body', sh: [-24, -166], el: [-54, -158], wrist: [-84, -164], w: [26, 22, 15], hr: 16, bend: 3, boxF: [-114, -190, -30, -106], color: '#2c3878', tubeOpts: { rim: '#8fa0ff', bulge: 0.15 },
        a1: (K, t) => ({ rot: 0.03 * sin(t * 1.7) + 1.1 * K.wind - 0.1 * K.strike + 0.5 * K.guard - 0.1 * K.hurt }),
        a2: (K, t) => ({ rot: 0.05 * sin(t * 2) + 0.6 * K.wind - 0.05 * K.strike + 1.3 * K.guard }),
        hand: (S, x, y) => { S.cel(blob(x + 2, y, 8.5, 8, 2, 0.1, 8), S.c.face.b, { depth: 2, line: S.lw * 0.85, hi: false }); },
        // a wide hanging sleeve flap with a red lining edge and a white cuff, so the sword arm reads as cloth and not a bandage
        decorF: (S) => {
          S.cel([[-52, -150], [-70, -152], [-90, -150], [-94, -132], [-84, -120, 1], [-72, -128], [-60, -118, 1], [-48, -132]], '#2c3878', { depth: 4, line: S.lw * 0.9, tension: 0.55, rim: '#8fa0ff', hi: false,
            decor: (g) => { g.strokeStyle = S.c.lining.b; g.lineWidth = 3.4; g.lineCap = 'round'; g.beginPath(); g.moveTo(-93, -134); g.lineTo(-84, -121); g.lineTo(-72, -129); g.lineTo(-60, -119); g.lineTo(-49, -132); g.stroke(); } });
          S.cel([[-68, -172], [-58, -172], [-58, -152], [-68, -152]], '#f4f0e8', { depth: 1.5, line: S.lw * 0.8, tension: 0.3, rim: '#ffffff', hi: false });
        },
      }),
      { id: 'bladeGlow', parent: 'armF2', live(ctx, st) {
        const K = st.K, t = st.t, m = st.m, low = st.hpPct < 0.5 ? 1 : 0;
        const k = 0.9 + 1.4 * K.alert + 0.9 * K.strike + 0.5 * K.wind + 0.9 * low + 0.25 * K.buff, pl = 0.75 + 0.25 * sin(t * 4);
        const d = [cos(3.35), sin(3.35)];
        for (let i = 0; i < 5; i++) tk.glow(ctx, -84 + d[0] * (14 + i * 26), -164 + d[1] * (14 + i * 26) + 2, 26 - i * 1.5, '#9fe8ff', 0.22 * k * pl);
        const tp = [-84 + d[0] * 124, -164 + d[1] * 124 + 1];
        tk.sparkle(ctx, tp[0], tp[1], 9 * (0.6 + 0.4 * pl) * (0.8 + 0.4 * K.strike), { color: '#ffffff', rot: t * 0.4, glow: 0.5 });
        for (let i = 0; i < 3; i++) { const ph = (t * 0.6 + i / 3) % 1; tk.sparkle(ctx, -84 + d[0] * (30 + ph * 96), -164 + d[1] * (30 + ph * 96) - 8 - ph * 10, 2.6, { color: '#dff6ff', alpha: sin(ph * PI) * m * (0.6 + low * 0.4), glow: 0.3 }); }
        if (low || K.pose === 'attack') {
          ctx.save(); ctx.globalAlpha *= 0.4 * (low ? 0.8 : 1) * (K.pose === 'attack' ? K.strike : 1) * m; ctx.strokeStyle = '#bfeaff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
          [-10, -20, -30].forEach((o, i) => { ctx.beginPath(); ctx.moveTo(-84 + d[0] * 40 + 12 * (i + 1), -164 + d[1] * 40 + o + 6); ctx.lineTo(-84 + d[0] * (124 - i * 10) + 20 * (i + 1), -164 + d[1] * (124 - i * 10) + o + 4); ctx.stroke(); });
          ctx.restore();
        }
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // MOSS GUARDIAN (elite, l): a shrine guardian so old the moss has grown into its bones. Stone, straw rope and paper streamers, ferns on
  // its shoulders, jade light in its cracks. Both fists rise and slam. Accent: the glowing jade in its eyes and cracks.
  // ---------------------------------------------------------------------------------------------------------------
  const STONE = cs('#8a92a8'), MOSS = cs('#5fa040');
  function moss(g, cx, cy, rx, ry, seed) {
    g.save();
    g.fillStyle = MOSS.b; g.beginPath(); tk.trace(g, blob(cx, cy, rx, ry, seed, 0.28, 11)); g.fill();
    g.fillStyle = rgba(MOSS.d, 0.5); g.beginPath(); tk.trace(g, blob(cx + rx * 0.15, cy + ry * 0.35, rx * 0.8, ry * 0.55, seed + 1, 0.3, 9)); g.fill();
    g.fillStyle = '#9fdc62'; const r = tk.rng('en1moss', seed);
    for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(cx + (r() - 0.5) * rx * 1.5, cy + (r() - 0.6) * ry * 1.2, 1.6 + r() * 1.8, 0, TAU); g.fill(); }
    g.restore();
  }
  function stoneBlock(S, pts, o) {
    S.cel(pts, STONE.b, Object.assign({ depth: 10, tension: 0.4, halftone: { d: 5, alpha: 0.26 }, rim: '#cfe0ff', hi: STONE.l }, o));
  }
  // chiselled joints, a carved knee ring and a shrine-mark on a stone leg (x0..x1 is the leg width)
  function legCarve(g, x0, x1) {
    const cx = (x0 + x1) / 2;
    g.save(); g.strokeStyle = rgba('#2a3048', 0.62); g.lineWidth = 2.4; g.lineCap = 'round';
    [-74, -46].forEach((y) => { g.beginPath(); g.moveTo(x0 + 2, y); g.quadraticCurveTo(cx, y + 5, x1 - 2, y); g.stroke(); });
    g.beginPath(); g.arc(cx, -60, 7.5, 0, TAU); g.stroke(); g.beginPath(); g.arc(cx, -60, 2.4, 0, TAU); g.stroke();
    g.strokeStyle = rgba('#e6f0ff', 0.55); g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(x0 + 4, -73); g.quadraticCurveTo(cx, -68, x1 - 4, -73); g.stroke();
    g.restore();
  }
  const stoneFist = (S, x, y, dark) => {
    const base = dark ? tk.shade(STONE.b, 0.12) : STONE.b;
    S.cel(rrectPts(x - 26, y - 14, 52, 50, 12), base, { depth: 8, line: S.lw, tension: 0.5, rim: '#cfe0ff', hi: STONE.l, halftone: { d: 5, alpha: 0.26 },
      decor: (g) => { g.strokeStyle = rgba('#2a3048', 0.7); g.lineWidth = 2.2; [-9, 4, 17].forEach((dx) => { g.beginPath(); g.moveTo(x + dx, y + 12); g.lineTo(x + dx, y + 34); g.stroke(); }); moss(g, x + 6, y - 12, 18, 9, 5); } });
  };
  define({
    id: 'moss_guardian', size: 'l', acc: '#9dffb0', lunge: 40, alertColor: '#c8ffb0', ox: 0,
    col: { rim: '#cfe0ff' },
    hitAt: [0, -150], alertAt: [0, -230], hitBone: 'body', alertBone: 'head', buffBone: 'body', guardBone: 'body',
    arc: { bone: 'body', x: -64, y: -172, r: 100, a0: -1.2, a1: -3.6, w: 22, color: '#c8ffd0' },
    bounds: { w: 250, h: 284, head: { x: -4, y: -232 }, body: { x: 0, y: -130 }, feet: { x: 0, y: 0 } },
    die: { kind: 'leaf', colors: ['#8a92a8', '#5fa040', '#9dffb0'], orb: '#c8ffd0', gravity: 1.0, size: 7 },
    dieBox: [-140, -290, 140, 0], strips: 8, dir: 1,
    parts: [
      ...arm2({
        id: 'armB', parent: 'body', sh: [66, -168], el: [100, -134], wrist: [102, -98], w: [54, 46, 42], hr: 34, bend: -2, color: tk.shade('#8a92a8', 0.12),
        tubeOpts: { halftone: { d: 5, alpha: 0.26 }, rim: '#cfe0ff' },
        a1: (K, t) => ({ rot: 0.02 * sin(t * 1.3 + 1) - 2.6 * K.wind - 0.3 * K.strike - 0.3 * K.guard }),
        a2: (K, t) => ({ rot: 0.03 * sin(t * 1.5 + 1) - 0.5 * K.wind - 0.3 * K.strike - 1.3 * K.guard }),
        hand: (S, x, y) => stoneFist(S, x, y, true),
      }),
      { id: 'legB', box: [4, -104, 78, 6], parent: 'body', pivot: [34, -92], xf: (K, t) => ({ rot: 0.01 * sin(t * 1.5) }),
        draw(S) { stoneBlock(S, rrectPts(10, -96, 46, 74, 10), { fill: 0, decor: (g) => { legCarve(g, 10, 56); moss(g, 46, -32, 14, 8, 5); } }); S.cel(rrectPts(2, -26, 68, 26, 8), tk.shade(STONE.b, 0.14), { depth: 6, line: S.lw, tension: 0.4, rim: '#cfe0ff', hi: false, halftone: { d: 5, alpha: 0.26 } }); } },
      { id: 'body', box: [-84, -200, 86, -50], parent: 'root', pivot: [0, -90],
        xf: (K, t, st) => ({ sy: 1 + 0.012 * sin(t * 1.3) * st.m - 0.02 * K.guard, sx: 1 + 0.02 * K.buff }),
        draw(S) {
          const c = S.c, g = S.g;
          S.cel([[-72, -174], [-42, -194], [42, -194], [74, -172], [70, -136], [54, -104], [42, -84], [-42, -84], [-54, -104], [-68, -136]], STONE.b, { depth: 16, halftone: { d: 5, alpha: 0.28 }, tension: 0.4, rim: '#cfe0ff', hi: STONE.l,
            decor: (gg) => {
              gg.strokeStyle = rgba('#2a3048', 0.6); gg.lineWidth = 2.4; gg.lineCap = 'round';
              [[-52, -164, -30, -138, -4, -150], [52, -164, 30, -138, 4, -150]].forEach((q) => { gg.beginPath(); gg.moveTo(q[0], q[1]); gg.quadraticCurveTo(q[2], q[3], q[4], q[5]); gg.stroke(); });
              gg.beginPath(); gg.moveTo(0, -190); gg.lineTo(0, -108); gg.stroke();
              [-126, -112].forEach((y) => { gg.beginPath(); gg.moveTo(-18, y); gg.quadraticCurveTo(0, y + 5, 18, y); gg.stroke(); });
              // jade light in a hairline crack
              gg.strokeStyle = '#9dffb0'; gg.lineWidth = 3; gg.beginPath(); gg.moveTo(30, -186); gg.lineTo(24, -166); gg.lineTo(34, -152); gg.lineTo(28, -132); gg.stroke();
              gg.beginPath(); gg.moveTo(-40, -122); gg.lineTo(-28, -104); gg.lineTo(-36, -92); gg.stroke();
              moss(gg, -50, -178, 30, 16, 1); moss(gg, 52, -176, 26, 14, 2); moss(gg, -30, -96, 26, 10, 3); moss(gg, 44, -120, 14, 22, 4);
            } });
          // the straw rope with white paper streamers
          tk.inkPath(g, [[-48, -102], [0, -94], [48, -102]], { w: 15, color: pal.ink, taper: 0.03 }); tk.inkPath(g, [[-48, -102], [0, -94], [48, -102]], { w: 11, color: '#d8b46a', taper: 0.03 });
          for (let i = -3; i <= 3; i++) tk.inkPath(g, [[i * 14 - 4, -106], [i * 14 + 4, -84]], { w: 2.2, color: '#a07a30', alpha: 0.7, taper: 0.1 });
          [-30, -8, 16, 38].forEach((x, i) => { const y = -92 + Math.abs(i - 1.5) * 2; S.cel([[x, y], [x + 13, y], [x + 13, y + 10], [x + 4, y + 10], [x + 4, y + 20], [x + 15, y + 20], [x + 15, y + 32], [x + 3, y + 32], [x + 3, y + 22], [x - 2, y + 22], [x - 2, y + 10], [x, y + 10]], '#fffaf0', { depth: 2, line: 1.9, tension: 0.05, hi: false, rim: null, shadow: '#c8c8e0' }); });
          void c;
        } },
      { id: 'legF', box: [-88, -104, -4, 6], parent: 'body', pivot: [-34, -92], xf: (K, t) => ({ rot: -0.01 * sin(t * 1.5) }),
        draw(S) { stoneBlock(S, rrectPts(-56, -96, 48, 76, 10), { decor: (g) => { legCarve(g, -56, -8); moss(g, -34, -30, 22, 9, 6); g.strokeStyle = '#9dffb0'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(-44, -84); g.lineTo(-38, -66); g.lineTo(-46, -50); g.stroke(); } }); S.cel(rrectPts(-74, -26, 72, 26, 8), STONE.b, { depth: 6, line: S.lw, tension: 0.4, rim: '#cfe0ff', hi: STONE.l, halftone: { d: 5, alpha: 0.26 }, decor: (g) => moss(g, -40, -22, 24, 8, 7) }); } },
      { id: 'head', box: [-76, -336, 70, -180], parent: 'body', pivot: [-4, -196],
        xf: (K, t, st) => ({ rot: 0.015 * sin(t * 1.2) + 0.1 * K.wind - 0.1 * K.strike + 0.05 * K.hurt, dy: 1.4 * sin(t * 1.3 + 0.5) * st.m + 3 * K.guard, dx: -8 * K.strike }),
        draw(S) {
          const c = S.c, g = S.g;
          // a topknot stone with a sapling growing out of it
          S.cel(blob(-4, -268, 14, 13, 3, 0.05, 10), STONE.b, { depth: 4, line: S.lw * 0.95, hi: STONE.l, rim: '#cfe0ff' });
          S.tube([[-4, -276], [-6, -292], [2, -304]], 6, 3, '#6a8a3a', { depth: 1.5, line: 1.8, hi: false, rim: null });
          leafBlade(S, 2, -304, -2.6, 24, 9, '#5fa040'); leafBlade(S, 2, -304, -0.6, 22, 9, '#8fce5a');
          S.cel(rrectPts(-44, -262, 80, 70, 18), STONE.b, { depth: 12, line: S.lw, tension: 0.5, halftone: { d: 5, alpha: 0.28 }, rim: '#cfe0ff', hi: STONE.l,
            decor: (gg) => { moss(gg, -22, -258, 24, 11, 8); moss(gg, 26, -230, 12, 24, 9); gg.strokeStyle = rgba('#2a3048', 0.5); gg.lineWidth = 2; gg.beginPath(); gg.moveTo(-8, -262); gg.lineTo(-12, -246); gg.stroke(); } });
          // ears with heavy stone earrings
          [[-46, -228], [38, -228]].forEach((e, i) => { S.cel(blob(e[0], e[1], 8, 13, 2 + i, 0.06, 9), STONE.b, { depth: 3, line: S.lw * 0.9, hi: false, rim: null }); S.cel(ell(e[0], e[1] + 18, 6, 7, 8), '#c8b070', { depth: 2, line: 1.8, hi: false, rim: '#fff2c8' }); });
          void c; void g;
        } },
      { id: 'face', box: [-46, -260, 40, -190], parent: 'head', pivot: [-4, -228], face: true,
        draw(S, state) {
          const [ey, mo] = state.split('|'), g = S.g;
          // a carved brow ridge that always glowers
          S.cel([[-40, -246], [-16, -252], [-2, -244], [-8, -234], [-34, -238]], tk.shade(STONE.b, 0.14), { depth: 4, line: S.lw * 0.95, tension: 0.35, hi: false, rim: '#cfe0ff' });
          S.cel([[2, -244], [18, -252], [34, -246], [30, -236], [6, -234]], tk.shade(STONE.b, 0.14), { depth: 4, line: S.lw * 0.95, tension: 0.35, hi: false, rim: '#cfe0ff' });
          S.hollow(-24, -228, 20, 13, ey === 'open' ? 'angry' : ey, { color: '#9dffb0', socket: '#12202a' });
          S.hollow(16, -228, 20, 13, ey === 'open' ? 'angry' : ey, { color: '#9dffb0', socket: '#12202a' });
          S.cel([[-6, -226], [4, -226], [6, -210], [-8, -210]], tk.shade(STONE.b, 0.06), { depth: 2, line: 1.9, tension: 0.3, hi: false, rim: null });
          if (mo === 'open') { const sh = [[-30, -206], [-10, -208], [10, -208], [26, -204], [18, -190], [-2, -186], [-22, -190]]; S.fill(sh, '#0a1218'); tk.inkPath(g, sh, { closed: true, w: 2.4, align: 0, tension: 0.6 }); [-22, -8, 6, 18].forEach((x) => S.fill([[x, -207], [x + 7, -207], [x + 3, -196]], '#e8f0e0')); S.fill([[-14, -188], [14, -188], [0, -196]], '#9dffb0', 0.5); }
          else { tk.inkPath(g, [[-30, -204], [-8, -207], [12, -207], [28, -203]], { w: 3.4, taper: 0.2 }); [-22, -8, 8, 20].forEach((x, i) => { S.fill([[x, -205], [x + 6, -205], [x + 3, -196 + (i % 2) * 2]], '#e8f0e0'); tk.inkPath(g, [[x, -205], [x + 3, -197], [x + 6, -205]], { w: 1.3, taper: 0.1 }); }); }
        } },
      ...arm2({
        id: 'armF', parent: 'body', sh: [-66, -168], el: [-100, -134], wrist: [-102, -98], w: [56, 48, 44], hr: 34, bend: 2, color: '#8a92a8',
        tubeOpts: { halftone: { d: 5, alpha: 0.26 }, rim: '#cfe0ff', bulge: 0.06 },
        a1: (K, t) => ({ rot: 0.02 * sin(t * 1.3) + 2.6 * K.wind + 0.3 * K.strike + 0.9 * K.guard - 0.1 * K.hurt }),
        a2: (K, t) => ({ rot: 0.03 * sin(t * 1.5) + 0.5 * K.wind + 0.3 * K.strike + 1.5 * K.guard }),
        decorU: (S) => { moss(S.g, -84, -152, 22, 12, 11); },
        hand: (S, x, y) => stoneFist(S, x, y, false),
      }),
      { id: 'fronds', parent: 'body', box: [-110, -230, 110, -160], xf: (K, t, st) => ({ rot: 0.03 * sin(t * 1.4) * st.m }),
        draw(S) { [[-64, -186, -2.5, 34], [-52, -190, -2.0, 30], [-40, -192, -1.7, 26], [62, -184, -0.6, 32], [50, -190, -1.1, 28]].forEach((f, i) => leafBlade(S, f[0], f[1], f[2], f[3], 11, i % 2 ? '#5fa040' : '#8fce5a')); } },
      { id: 'glow', parent: 'body', live(ctx, st) {
        const K = st.K, t = st.t, m = st.m, pl = 0.65 + 0.35 * sin(t * 2.4), k = 0.7 + 0.9 * K.alert + 0.6 * K.strike + 0.5 * K.buff;
        tk.glow(ctx, 30, -168, 24, '#9dffb0', 0.3 * pl * k); tk.glow(ctx, -34, -104, 20, '#9dffb0', 0.26 * pl * k);
        for (let i = 0; i < 4; i++) { const ph = (t * 0.22 + i / 4) % 1, a = i * 1.7 + ph * 5; FX.bit(ctx, 'leaf', -80 + i * 55 + sin(a) * 12, -200 - ph * 60 + 40, 4.5, a * 1.3, sin(ph * PI) * 0.75 * m, '#8fce5a', '#2f6a2a'); }
        if (K.pose === 'attack') { const u = clamp((st.pt * 1000 - 160) / 260, 0, 1); FX.dust(ctx, -108, -6, u, 1.7, '#e8e2d0'); FX.dust(ctx, 110, -6, u, 1.7, '#e8e2d0'); }
      } },
      { id: 'headglow', parent: 'head', live(ctx, st) {
        const K = st.K, t = st.t, k = 0.7 + 0.9 * K.alert + 0.6 * K.strike, pl = 0.7 + 0.3 * sin(t * 2.4);
        if (K.eyes !== 'closed' && K.eyes !== 'hurt') { tk.glow(ctx, -24, -228, 26, '#9dffb0', 0.5 * pl * k); tk.glow(ctx, 16, -228, 26, '#9dffb0', 0.5 * pl * k); }
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // EMBER WISP (minion, s): a spark that broke off a hitodama. Same flame language, warmer, smaller, simpler. It burns once, brilliantly.
  // ---------------------------------------------------------------------------------------------------------------
  define({
    id: 'ember_wisp', size: 's', acc: '#ff9a3a', lunge: 40, alertColor: '#ffd23a', lw: 2.2,
    col: { rim: '#ffe0a0' },
    hitAt: [0, -44], alertAt: [0, -46], hitBone: 'flame', alertBone: 'flame', buffBone: 'flame', guardBone: 'flame',
    bounds: { w: 64, h: 90, head: { x: 0, y: -62 }, body: { x: 0, y: -46 }, feet: { x: 0, y: 0 } },
    die: { kind: 'ember', colors: ['#ff9a3a', '#ffd23a', '#ffffff'], orb: '#ffe0a0', gravity: -0.3, size: 3.6 },
    dieBox: [-30, -90, 30, -6], strips: 5,
    tweak(K, pose, t) { K.by += -16 - 4 * sin(t * 2.6) * tk.motion(); },
    parts: [
      { id: 'flame', box: [-24, -84, 24, -14], parent: 'root', pivot: [0, -20], v: (st) => 'f' + (Math.floor(st.t * 10) % 6),
        xf: (K, t, st) => ({ sx: 1 + 0.2 * K.buff + 0.2 * K.wind + 0.12 * K.strike - 0.2 * K.guard, sy: 1 + 0.05 * sin(t * 8) * st.m + 0.14 * K.buff + 0.1 * K.wind - 0.2 * K.guard, rot: 0.06 * sin(t * 2.7) * st.m - 0.08 * K.strike }),
        draw(S, variant) { flameFrame(S, +String(variant).slice(1) || 0, { hw: 16, y0: -20, h: 52, cols: ['#ff6a2a', '#ffb23a', '#fff2c0', '#ffe0a0'], sway: 1.2 }); } },
      { id: 'face', box: [-18, -62, 18, -28], parent: 'flame', pivot: [0, -42], face: true,
        draw(S, state) {
          const [ey, mo] = state.split('|'), g = S.g, dark = '#5a1a0a';
          S.bead(-5.5, -43, 4.4, ey === 'open' ? 'open' : ey, { color: dark, lid: '#a03a1a', tilt: 1 });
          S.bead(6, -43, 4, ey === 'open' ? 'open' : ey, { color: dark, lid: '#a03a1a', tilt: 1 });
          if (mo === 'open') { g.beginPath(); g.ellipse(0, -33, 3.6, 4.6, 0, 0, TAU); g.fillStyle = dark; g.fill(); } else { g.beginPath(); g.ellipse(0, -33, 2, 2.4, 0, 0, TAU); g.fillStyle = dark; g.fill(); }
        } },
      { id: 'sparks', parent: 'flame', live(ctx, st) {
        const K = st.K, t = st.t, m = st.m, k = 1 + 0.6 * K.alert + 0.6 * K.strike + 0.4 * K.buff, pl = 0.7 + 0.3 * sin(t * 6);
        tk.glow(ctx, 0, -42, 44 * (0.95 + 0.05 * pl), '#ff6a2a', 0.5 * k); tk.glow(ctx, 0, -38, 24, '#ffd23a', 0.5 * k);
        for (let i = 0; i < 4; i++) { const ph = (t * 0.8 + i * 0.25) % 1; FX.bit(ctx, 'ember', sin(ph * 5 + i * 2) * 14, -34 - ph * 50, 1.8 + (i % 2), 0, sin(ph * PI) * 0.9 * m, '#ffb23a', '#ffffff'); }
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // LEAF IMP (minion, s): one leaf and one bad idea. Fast, lean, forever running in place. Accent: fresh lime.
  // ---------------------------------------------------------------------------------------------------------------
  define({
    id: 'leaf_imp', size: 's', acc: '#c8ff5a', lunge: 44, alertColor: '#e8ff7a', lw: 2.2,
    col: { rim: '#e8ffb0', leaf: cs('#8fd04a'), vein: '#3f8a2a', twig: cs('#8a6a3a') },
    hitAt: [0, -50], alertAt: [-4, -60], hitBone: 'body', alertBone: 'head', buffBone: 'body', guardBone: 'body',
    arc: { bone: 'body', x: -14, y: -44, r: 34, a0: -1.2, a1: -4.0, w: 8, color: '#e8ff9a' },
    bounds: { w: 84, h: 92, head: { x: -4, y: -66 }, body: { x: 0, y: -44 }, feet: { x: 0, y: 0 } },
    die: { kind: 'leaf', colors: ['#8fd04a', '#c8ff5a', '#3f8a2a'], orb: '#e8ffb0', gravity: 0.5, size: 4 },
    dieBox: [-38, -92, 38, 0], strips: 5,
    tweak(K, pose, t) { if (pose === 'idle') { K.by = -2.5 * Math.abs(sin(t * 8)); K.brot -= 0.06; } },
    parts: [
      { id: 'legB', box: [0, -30, 24, 4], parent: 'body', pivot: [8, -26], xf: (K, t) => ({ rot: 0.55 * sin(t * 8 + PI) }),
        draw(S) { const dk = tk.shade('#8a6a3a', 0.1); S.limb([[8, -28], [10, -16], [8, -5]], dk, 5.4, 4.2); S.cel([[4, -5], [16, -5], [22, 0], [2, 1]], tk.shade('#8fd04a', 0.15), { depth: 1.5, line: 1.7, tension: 0.4, hi: false, rim: null }); } },
      { id: 'body', box: [-26, -66, 26, -20], parent: 'root', pivot: [0, -28],
        xf: (K, t, st) => ({ sy: 1 + 0.03 * sin(t * 8) * st.m, rot: 0.03 * sin(t * 4) * st.m }),
        draw(S) {
          const c = S.c;
          S.cel([[0, -62], [16, -50], [20, -36], [10, -26], [-10, -26], [-20, -36], [-16, -50]], c.leaf.b, { depth: 7, line: S.lw, tension: 0.55, halftone: { d: 4, alpha: 0.22 }, rim: '#e8ffb0',
            decor: (g) => { g.strokeStyle = rgba(c.vein, 0.85); g.lineWidth = 1.8; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, -60); g.lineTo(0, -28); g.stroke(); [[-40, -14], [-34, -12], [-28, -12]].forEach((v) => { g.beginPath(); g.moveTo(0, v[0]); g.lineTo(-12, v[0] - 8); g.moveTo(0, v[0]); g.lineTo(12, v[0] - 8); g.stroke(); }); } });
        } },
      { id: 'legF', box: [-26, -30, 4, 4], parent: 'body', pivot: [-6, -26], xf: (K, t) => ({ rot: 0.55 * sin(t * 8) }),
        draw(S) { S.limb([[-6, -28], [-8, -16], [-6, -5]], '#8a6a3a', 5.6, 4.4); S.cel([[-2, -5], [-14, -5], [-22, 0], [0, 1]], '#8fd04a', { depth: 1.5, line: 1.7, tension: 0.4, hi: false, rim: null }); } },
      { id: 'head', box: [-34, -92, 30, -46], parent: 'body', pivot: [-2, -50],
        xf: (K, t, st) => ({ rot: 0.05 * sin(t * 4) * st.m + 0.12 * K.wind - 0.14 * K.strike, dy: 1.2 * sin(t * 8) * st.m, dx: -5 * K.strike }),
        draw(S) {
          const c = S.c, g = S.g;
          [[-22, -72, -2.5, 26], [18, -72, -0.65, 26]].forEach((e) => leafBlade(S, e[0] * 0.6, e[1] + 8, e[2], e[3], 11, tk.shade(c.leaf.b, 0.06)));
          S.cel(blob(-2, -66, 20, 17, 4, 0.04, 12), c.leaf.b, { depth: 6, line: S.lw, halftone: { d: 4, alpha: 0.22 }, rim: '#e8ffb0', hi: c.leaf.l });
          S.cel([[-6, -82], [0, -96, 1], [8, -82], [2, -80]], c.leaf.b, { depth: 2, line: 1.8, tension: 0.4, hi: false, rim: null });
          tk.blush(g, -14, -58, 7, { alpha: 0.4, color: '#ffb0a0', hatch: false }); tk.blush(g, 12, -58, 7, { alpha: 0.4, color: '#ffb0a0', hatch: false });
        } },
      { id: 'face', box: [-24, -78, 22, -50], parent: 'head', pivot: [-2, -66], face: true,
        draw(S, state) {
          const [ey, mo] = state.split('|'), g = S.g, ex = ey === 'open' ? 'wide' : ey;
          S.eye(-9, -68, 11, 14, ex, { iris: ['#2a6a10', '#c8ff5a'], sclera: '#fffaf0', glow: 0.6, lashes: false, wing: 0.1 });
          S.eye(8, -68, 10, 13, ex, { iris: ['#2a6a10', '#c8ff5a'], sclera: '#fffaf0', glow: 0.6, lashes: false, wing: 0.1, side: -1 });
          if (mo === 'open') { g.beginPath(); g.ellipse(0, -55, 5, 4.5, 0, 0, TAU); g.fillStyle = '#4a1020'; g.fill(); tk.inkPath(g, ell(0, -55, 5, 4.5, 8), { closed: true, w: 1.6, align: 0 }); }
          else tk.inkPath(g, [[-6, -57], [-2, -54], [4, -54], [8, -58]], { w: 1.9, taper: 0.25 });
        } },
      ...arm2({
        id: 'armF', parent: 'body', sh: [-12, -46], el: [-22, -40], wrist: [-26, -30], w: [5, 4.4, 4], hr: 8, bend: 1, color: '#8a6a3a',
        a1: (K, t) => ({ rot: 0.3 * sin(t * 8) + 2.6 * K.wind + 0.6 * K.strike }),
        a2: (K, t) => ({ rot: 0.2 * sin(t * 8 + 1) + 0.5 * K.wind + 0.7 * K.strike }),
        hand: (S, x, y) => { S.cel(blob(x, y + 1, 3.6, 3.6, 2, 0.1, 7), '#8fd04a', { depth: 1, line: 1.5, hi: false, rim: null }); },
      }),
      { id: 'twig', parent: 'armF2', pivot: [-26, -30], box: [-84, -100, -6, 0], xf: (K) => ({ rot: -1.4 * Math.max(K.wind, K.strike) }),
        draw(S) { S.tube([[-24, -26], [-40, -36], [-58, -50]], 4, 2, '#8a6a3a', { depth: 1.5, line: 1.7, hi: false, rim: null }); leafBlade(S, -58, -50, -2.4, 16, 8, '#8fd04a'); } },
      { id: 'glow', parent: 'body', live(ctx, st) {
        const K = st.K, t = st.t, m = st.m;
        tk.glow(ctx, -11, -68, 10, '#c8ff5a', 0.32 + 0.3 * K.alert + 0.2 * K.strike);
        for (let i = 0; i < 2; i++) { const ph = (t * 1.1 + i * 0.5) % 1; FX.bit(ctx, 'leaf', 26 + ph * 16, -30 - ph * 10 + i * 8, 2.6, ph * 8, sin(ph * PI) * 0.55 * m, '#8fd04a', '#3f8a2a'); }
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // PAPER KODAMA (minion, s): a hollow doll folded from a torn page and given a face by the fox's brush. It leaks the Blank: violet ink.
  // ---------------------------------------------------------------------------------------------------------------
  define({
    id: 'paper_kodama', size: 's', acc: '#a070ff', lunge: 30, alertColor: '#c8a0ff', lw: 2.2,
    col: { rim: '#fff0d0', paper: cs('#f4e8cc'), ink: '#1a1030' },
    hitAt: [0, -60], alertAt: [0, -62], hitBone: 'head', alertBone: 'head', buffBone: 'body', guardBone: 'body',
    bounds: { w: 88, h: 108, head: { x: 0, y: -76 }, body: { x: 0, y: -46 }, feet: { x: 0, y: 0 } },
    die: { kind: 'paper', colors: ['#f4e8cc', '#a070ff', '#1a1030'], orb: '#c8a0ff', gravity: 0.5, size: 5 },
    dieBox: [-42, -108, 42, -4], strips: 6,
    tweak(K, pose, t) { K.by += -6 - 3 * sin(t * 1.8) * tk.motion(); },
    parts: [
      { id: 'body', box: [-26, -58, 26, -8], parent: 'root', pivot: [0, -12],
        xf: (K, t, st) => ({ sy: 1 + 0.03 * sin(t * 2) * st.m - 0.04 * K.guard, rot: 0.04 * sin(t * 1.5) * st.m }),
        draw(S) {
          const c = S.c;
          // a folded cone of paper: creases, a torn hem and a dog-eared corner
          S.cel([[0, -54], [16, -44], [22, -28], [26, -12, 1], [14, -16], [8, -10, 1], [0, -16], [-8, -9, 1], [-16, -16], [-26, -12, 1], [-22, -28], [-16, -44]], c.paper.b, { depth: 8, line: S.lw, tension: 0.3, halftone: { d: 4.2, alpha: 0.3 }, rim: '#ffffff', hi: false,
            decor: (g) => {
              g.strokeStyle = rgba('#b09a6a', 0.9); g.lineWidth = 1.6; g.lineCap = 'round';
              [[0, -52, 0, -18], [0, -50, 14, -20], [0, -50, -14, -20], [-16, -42, 16, -30]].forEach((l) => { g.beginPath(); g.moveTo(l[0], l[1]); g.lineTo(l[2], l[3]); g.stroke(); });
              g.fillStyle = rgba('#a070ff', 0.35); g.beginPath(); tk.trace(g, blob(8, -26, 6, 4, 3, 0.3, 8)); g.fill();
              g.strokeStyle = rgba(c.ink, 0.5); g.lineWidth = 1.2; [[-14, -34, -6, -32], [-16, -30, -8, -29], [-12, -26, -5, -25]].forEach((l) => { g.beginPath(); g.moveTo(l[0], l[1]); g.lineTo(l[2], l[3]); g.stroke(); });
            } });
        } },
      { id: 'head', box: [-38, -104, 36, -46], parent: 'body', pivot: [0, -52],
        xf: (K, t, st) => ({ rot: 0.1 * sin(t * 1.4) * st.m + 0.16 * K.wind - 0.16 * K.strike + 0.12 * K.hurt + sin(t * 44) * 0.05 * K.alert, dx: -6 * K.strike, dy: 1.3 * sin(t * 2 + 0.4) * st.m }),
        draw(S) {
          const c = S.c;
          // the head is a folded, faceted egg of paper with a curled corner
          S.cel([[0, -100], [18, -94], [30, -78], [30, -62], [14, -50], [-14, -50], [-30, -62], [-30, -78], [-16, -94]], c.paper.b, { depth: 9, line: S.lw, tension: 0.4, halftone: { d: 4.2, alpha: 0.28 }, rim: '#ffffff', hi: false,
            decor: (g) => {
              g.strokeStyle = rgba('#b09a6a', 0.85); g.lineWidth = 1.5; g.lineCap = 'round';
              [[0, -98, -8, -52], [0, -98, 12, -54], [-24, -84, 24, -80], [-28, -66, 26, -70]].forEach((l) => { g.beginPath(); g.moveTo(l[0], l[1]); g.lineTo(l[2], l[3]); g.stroke(); });
              g.fillStyle = rgba('#b09a6a', 0.35); g.beginPath(); tk.trace(g, [[16, -94], [30, -78], [22, -76], [12, -88]]); g.fill();
            } });
          S.cel([[22, -94], [34, -98, 1], [30, -86], [26, -84]], c.paper.s, { depth: 1.5, line: 1.7, tension: 0.2, hi: false, rim: null });
        } },
      { id: 'face', box: [-26, -84, 24, -50], parent: 'head', pivot: [0, -72], face: true,
        draw(S, state) {
          const [ey, mo] = state.split('|'), g = S.g, ink = S.c.ink;
          // brush-drawn holes: slightly uneven ink ovals with a violet gleam
          const eye = (x, y, w, h) => {
            if (ey === 'closed') { tk.inkPath(g, [[x - w / 2, y], [x, y + 2], [x + w / 2, y]], { w: 2.6, color: ink, taper: 0.3 }); return; }
            if (ey === 'hurt') { tk.inkPath(g, [[x - w / 2, y - 4], [x + w / 2, y + 4]], { w: 2.6, color: ink, taper: 0.2 }); tk.inkPath(g, [[x - w / 2, y + 4], [x + w / 2, y - 4]], { w: 2.6, color: ink, taper: 0.2 }); return; }
            const hh = ey === 'half' ? h * 0.55 : h;
            g.beginPath(); tk.trace(g, blob(x, y + (h - hh) / 2, w / 2, hh / 2, x, 0.12, 9)); g.fillStyle = ink; g.fill();
            g.beginPath(); g.ellipse(x - w * 0.12, y - h * 0.15 + (h - hh) / 2, w * 0.14, h * 0.16, 0, 0, TAU); g.fillStyle = 'rgba(200,160,255,0.9)'; g.fill();
          };
          eye(-11, -70, 11, 15); eye(10, -70, 11, 15);
          if (ey === 'angry') { tk.inkPath(g, [[-20, -82], [-4, -76]], { w: 3, color: ink, taper: 0.3 }); tk.inkPath(g, [[20, -82], [4, -76]], { w: 3, color: ink, taper: 0.3 }); }
          const big = mo === 'open' ? 1.5 : 1;
          g.beginPath(); tk.trace(g, blob(0, -56, 5 * big, 6.5 * big, 7, 0.14, 9)); g.fillStyle = ink; g.fill();
          g.beginPath(); g.ellipse(-1, -55, 1.6 * big, 2 * big, 0, 0, TAU); g.fillStyle = 'rgba(200,160,255,0.85)'; g.fill();
        } },
      ...arm2({
        id: 'armF', parent: 'body', sh: [-14, -44], el: [-26, -38], wrist: [-32, -26], w: [8, 7, 6], hr: 10, bend: 1, color: '#f4e8cc', tubeOpts: { rim: '#ffffff', halftone: { d: 4, alpha: 0.25 } },
        a1: (K, t) => ({ rot: 0.1 * sin(t * 2.4) + 2.6 * K.wind + 0.5 * K.strike + 0.9 * K.guard }),
        a2: (K, t) => ({ rot: 0.14 * sin(t * 2.8) + 0.5 * K.wind + 0.6 * K.strike + 1.7 * K.guard }),
        hand: (S, x, y) => { S.cel([[x - 5, y - 3], [x + 5, y - 3], [x + 6, y + 8], [x, y + 11], [x - 6, y + 8]], '#f4e8cc', { depth: 1.5, line: 1.6, tension: 0.3, hi: false, rim: null }); },
      }),
      { id: 'ink', parent: 'head', live(ctx, st) {
        const K = st.K, t = st.t, m = st.m, k = 0.5 + 0.7 * K.alert + 0.5 * K.strike;
        tk.glow(ctx, -11, -70, 12, '#a070ff', 0.3 * k); tk.glow(ctx, 10, -70, 12, '#a070ff', 0.3 * k); tk.glow(ctx, 0, -56, 10, '#a070ff', 0.25 * k);
        // ink drips from the holes: a slow bead that stretches and falls
        [[-11, -62, 0], [10, -62, 0.4], [0, -50, 0.7]].forEach((d, i) => {
          const ph = (t * 0.4 + d[2]) % 1, y = d[1] + Math.pow(ph, 1.6) * 44 * (0.6 + 0.4 * m);
          ctx.save(); ctx.globalAlpha *= (1 - ph * ph); ctx.strokeStyle = '#1a1030'; ctx.lineWidth = 2.2 * (1 - ph * 0.5); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(d[0], d[1]); ctx.lineTo(d[0], Math.min(y, d[1] + ph * 26)); ctx.stroke();
          ctx.beginPath(); ctx.arc(d[0], y, 2.6 * (1 - ph * 0.4), 0, TAU); ctx.fillStyle = '#1a1030'; ctx.fill(); ctx.restore(); void i;
        });
      } },
    ],
  });

  // ---------------------------------------------------------------------------------------------------------------
  // KUZUNOHA, THE NINE-TAIL INK FOX (boss, xl). She sits like a shrine statue: chest raised, ink-dipped forepaws, a vermilion collar with a
  // gold bell, violet eyes, a noh mask floating at her shoulder, nine plumed tails that end in dripping brush tips and pages of the book
  // turning around her.
  //   phase 0: the tails ride in a loose bundle behind her and the mask floats whole.
  //   phase 1 (below half HP): the tails open into a peacock wheel with an ink-brush halo behind it, the mask splits down its middle and its
  //   halves drift apart with violet light between, more pages wheel about her, ink veins spread over her fur and her eyes blaze.
  // Poses: telegraph raises the great centre tail like a brush poised over the page; attack brings it down in a calligraphic sweep and the
  // head snaps forward; block (Nine Tails Rise) folds every tail forward into a dome; buff flares the fan open; die unravels her into ink,
  // petals and pages.
  // ---------------------------------------------------------------------------------------------------------------
  const FOX = cs('#fbf4ee'), VIOLET = '#8f5fe8', INKV = '#2a1a5a';
  const TAIL_SP = [[0, 0], [9, -64], [-2, -136], [11, -214]], TAIL_R = [88, -152];
  const tailBase = (i, ph) => (ph >= 1 ? -0.2 + (i - 4) * 0.2 : 0.02 + (i - 4) * 0.095);
  // a fluffy plume dipped in ink like a calligraphy brush: smooth scalloped white body, ragged dark tip that ends in a point
  function foxTailArt(S, v) {
    const p1 = String(v).charAt(0) === 'p' && String(v).charAt(1) === '1', tone = +String(v).split('|')[1] || 0;
    S.tube(TAIL_SP, 36, 8, tk.mix(p1 ? '#fbf6ff' : FOX.b, p1 ? '#a48ae8' : '#b8a4e8', 0.15 * tone), { bulge: 3.3, profile: (u) => 1 + 0.05 * sin(u * 24), depth: 13, halftone: { d: 4.8, alpha: 0.24 }, tension: 0.9, rim: p1 ? '#c8a0ff' : '#d8c0ff', rimW: 2.4, hi: '#ffffff', hiW: 3.2, line: S.lw,
      decor: (gg) => {
        const u0 = p1 ? 0.58 : 0.68, r = tk.rng('en1tailink', 3), pts = [];
        for (let k = 0; k <= 8; k++) { const f = k / 8 - 0.5, u = u0 + (r() - 0.5) * 0.08 + Math.abs(f) * 0.08, sp = spineAt(TAIL_SP, u); pts.push([sp.x - sp.ty * f * 140, sp.y + sp.tx * f * 140]); }
        pts.push([pts[8][0], -230], [pts[0][0], -230]);
        const a = spineAt(TAIL_SP, u0), b = spineAt(TAIL_SP, 1);
        const gr = gg.createLinearGradient(a.x, a.y, b.x, b.y); gr.addColorStop(0, '#9a68f0'); gr.addColorStop(0.35, '#5a34b0'); gr.addColorStop(1, '#241458');
        gg.beginPath(); tk.trace(gg, { poly: pts }); gg.fillStyle = gr; gg.fill();
        for (let k = 0; k < 7; k++) { const f = k / 6 - 0.5, sp = spineAt(TAIL_SP, u0 + 0.03), sp2 = spineAt(TAIL_SP, 0.97 - Math.abs(f) * 0.1); tk.inkPath(gg, [[sp.x - sp.ty * f * 84, sp.y + sp.tx * f * 84], [sp2.x - sp2.ty * f * 16, sp2.y + sp2.tx * f * 16]], { w: 2.4, color: '#b088ff', alpha: 0.55, taper: 0.4, wobble: 0.1, seed: k }); }
        const gl = spineAt(TAIL_SP, 0.84); tk.inkPath(gg, [[gl.x - 10, gl.y + 16], [gl.x - 8, gl.y - 8], [gl.x - 3, gl.y - 22]], { w: 3.2, color: '#ffffff', alpha: 0.6, taper: 0.5 });
        [-0.28, 0.0, 0.28].forEach((f, k) => { const s0 = spineAt(TAIL_SP, 0.1), s1 = spineAt(TAIL_SP, u0 - 0.05), sm = spineAt(TAIL_SP, (0.1 + u0 - 0.05) / 2); tk.inkPath(gg, [[s0.x - s0.ty * f * 28, s0.y + s0.tx * f * 28], [sm.x - sm.ty * f * 58, sm.y + sm.tx * f * 58], [s1.x - s1.ty * f * 44, s1.y + s1.tx * f * 44]], { w: 1.7, color: '#b8a8e0', alpha: 0.8, taper: 0.35, wobble: 0.1, seed: k + 4 }); });
      } });
  }
  function foxTail(i) {
    return {
      id: 'tail' + i, share: 'tail', parent: 'seat', pivot: [0, 0], v: (st) => (st.phase >= 1 ? 'p1' : 'p0') + '|' + Math.abs(i - 4),
      chain: { spine: TAIL_SP, cuts: [0.34, 0.68], reach: 64 },
      xf: (K, t, st) => {
        const d = i - 4;
        let th = tailBase(i, st.phase) + 0.05 * sin(t * 1.3 + i * 0.7) * st.m;
        th += 0.24 * d / 4 * K.wind + 0.32 * d / 4 * K.buff + 0.16 * K.hurt;
        if (i === 4) th += -0.5 * K.wind - 1.5 * K.strike; else th += -0.3 * sin(i * 2.1) * K.strike;
        th = lerp(th, -0.7 + d * 0.1, clamp(K.guard, 0, 1));
        return { dx: TAIL_R[0], dy: TAIL_R[1], rot: th, sx: 1 - 0.02 * Math.abs(d) + 0.08 * K.buff, sy: 1 - 0.03 * Math.abs(d) + (i === 4 ? 0.22 * K.wind : 0) + 0.06 * K.buff };
      },
      bends: (K, t, st) => [0, 1, 2].map((j) => (0.16 * sin(t * 1.5 + i * 0.9 - j * 0.8) * st.m + (i === 4 ? -0.25 * K.strike : 0.1 * K.strike)) * (0.55 + 0.45 * j)),
      draw(S, v) { foxTailArt(S, v); },
    };
  }
  const maskShape = () => [[0, -42], [21, -32], [30, -8], [25, 20], [9, 39], [0, 44], [-9, 39], [-25, 20], [-30, -8], [-21, -32]];
  function noh(S, half) {
    const g = S.g;
    if (half) {                                          // clip to a jagged half: the crack runs down the middle
      const zig = [[0, -60], [5, -44], [-4, -30], [6, -16], [-5, -2], [5, 14], [-4, 28], [4, 42], [0, 60]];
      g.save(); g.beginPath();
      if (half === 'L') { g.moveTo(-60, -60); zig.forEach((p) => g.lineTo(p[0], p[1])); g.lineTo(-60, 60); } else { g.moveTo(60, -60); zig.forEach((p) => g.lineTo(p[0], p[1])); g.lineTo(60, 60); }
      g.closePath(); g.clip();
    }
    [[-22, -30, -30, -58, -10, -38], [22, -30, 30, -58, 10, -38]].forEach((e) => S.cel([[e[0], e[1]], [e[2], e[3], 1], [e[4], e[5]]], '#fbf4ee', { depth: 3, line: S.lw * 0.9, tension: 0.2, hi: false, rim: '#d8c0ff' }));
    S.cel(maskShape(), '#fbf4ee', { depth: 8, line: S.lw, tension: 0.8, halftone: { d: 4.4, alpha: 0.22 }, rim: '#d8c0ff', hi: '#ffffff',
      decor: (gg) => {
        gg.strokeStyle = '#e8383d'; gg.lineCap = 'round';
        [[-8, -12, -30, -22, 3.4], [-8, -6, -30, 0, 2.6], [8, -12, 30, -22, 3.4], [8, -6, 30, 0, 2.6]].forEach((l) => { gg.lineWidth = l[4]; gg.beginPath(); gg.moveTo(l[0], l[1]); gg.quadraticCurveTo((l[0] + l[2]) / 2, l[1] - 8, l[2], l[3]); gg.stroke(); });
        gg.lineWidth = 3; gg.beginPath(); gg.moveTo(0, -40); gg.lineTo(0, -22); gg.stroke();
        gg.strokeStyle = 'rgba(42,26,90,0.55)'; gg.lineWidth = 1.4; [[-24, 12, -14, 14], [-25, 18, -14, 18], [24, 12, 14, 14], [25, 18, 14, 18]].forEach((l) => { gg.beginPath(); gg.moveTo(l[0], l[1]); gg.lineTo(l[2], l[3]); gg.stroke(); });
      } });
    [[-13, -4, -1], [13, -4, 1]].forEach((e) => { const pts = [[e[0] - e[2] * 9, -6], [e[0], -10], [e[0] + e[2] * 9, -3], [e[0], -1]]; S.fill(pts, '#c8a0ff'); tk.inkPath(g, pts, { closed: true, w: 2.2, align: 0, tension: 0.5 }); S.dot(e[0], -5, 1.6, '#ffffff'); });
    S.fill([[-3, 14], [3, 14], [0, 20]], '#1a1030'); tk.inkPath(g, [[-9, 26], [0, 30], [9, 26]], { w: 2, color: '#e8383d', taper: 0.3 });
    S.dot(0, -28, 3, VIOLET); tk.inkPath(g, ell(0, -28, 5, 5, 8), { closed: true, w: 1.4, color: '#3a2278', align: 0 });
    if (half) {
      g.restore();
      const zig = [[0, -44], [5, -30], [-4, -16], [6, -2], [-5, 12], [5, 26], [-4, 40]];
      tk.inkPath(g, zig.map((p) => [p[0] + (half === 'L' ? -0.5 : 0.5), p[1]]), { w: 3, color: pal.ink, taper: 0.1, alpha: 0.95 });
    }
  }
  // an ink-dipped stocking hanging from a foreleg: x the paw centre, y the ground, yTop where the ink stops
  function foxSock(S, x, y, yTop, far) {
    const g = S.g, base = far ? '#1a0f40' : INKV;
    S.tube([[x + 2, yTop], [x + 1, (yTop + y) / 2], [x, y - 8]], 24, 22, base, { depth: 5, line: S.lw * 0.95, hi: false, tension: 0.9, rim: '#8f5fe8', halftone: { d: 4.4, alpha: 0.24 } });
    tk.inkPath(g, [[x - 13, yTop - 1], [x - 6, yTop - 6], [x + 2, yTop], [x + 8, yTop - 7], [x + 14, yTop - 1]], { w: 5, color: base, taper: 0.1, wobble: 0.3 });
    S.cel(blob(x - 8, y - 6, 26, 11, 5, 0.05, 10), base, { depth: 3, line: S.lw * 0.9, hi: false, rim: '#8f5fe8' });
    [-1, 0, 1].forEach((k) => tk.inkPath(g, [[x - 26 + k * 10, y - 4], [x - 28 + k * 10, y + 1]], { w: 2, color: '#a888e8', alpha: 0.7, taper: 0.3 }));
  }
  const HEAD_OFF = [28, -4];                            // the head parts were drawn around (-128, -262); this moves them to sit on the seated chest
  const atHead = (p) => { const o = HEAD_OFF, d = p.draw; return Object.assign({}, p, { box: p.box.map((v, i) => v + o[i % 2]), pivot: p.pivot.map((v, i) => v + o[i]), draw(S, st) { S.g.save(); S.g.translate(o[0], o[1]); d(S, st); S.g.restore(); } }); };
  define({
    id: 'boss_kuzunoha', size: 'xl', acc: '#c8a0ff', lunge: 34, alertColor: '#d8b8ff', ox: 4,
    col: { rim: '#d8c0ff' },
    hitAt: [-30, -170], alertAt: [40, -250], hitBone: 'body', alertBone: 'body', buffBone: 'body', guardBone: 'body',
    arc: { bone: 'tail4', x: 0, y: 0, r: 210, a0: -1.5, a1: -3.95, w: 40, color: '#b088ff' },
    bounds: { w: 430, h: 372, head: { x: -100, y: -280 }, body: { x: 0, y: -160 }, feet: { x: 0, y: 0 } },
    die: { kind: 'petal', colors: ['#ffc2dc', '#c8a0ff', '#ffffff', '#3a2278'], orb: '#d8b8ff', gravity: -0.2, size: 8, stagger: 0.05 },
    dieBox: [-250, -390, 200, 0], strips: 10, dir: 1,
    tweak(K, pose, t) { K.by += -1.2 * sin(t * 1.4) * tk.motion(); },
    dieExtra(ctx, st, p) {
      const q = clamp((p - 0.12) / 0.6, 0, 1);
      if (q > 0 && q < 1) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 8 * (1 - q); ctx.strokeStyle = rgba('#c8a0ff', 0.8 * (1 - q));
        ctx.beginPath(); ctx.ellipse(-10, -170, 60 + q * 280, 40 + q * 180, 0, 0, TAU); ctx.stroke();
        ctx.lineWidth = 3; ctx.strokeStyle = rgba('#ffffff', 0.9 * (1 - q)); ctx.beginPath(); ctx.ellipse(-10, -170, 40 + q * 250, 26 + q * 160, 0, 0, TAU); ctx.stroke(); ctx.restore();
        tk.glow(ctx, -10, -170, 220 * (1 - q * 0.4), '#c8a0ff', 0.55 * (1 - q));
      }
      const rr = table('kuz-die', 14, 4);
      for (let i = 0; i < rr.length; i++) { const life = clamp((p - 0.1 - rr[i][0] * 0.3) / 0.6, 0, 1); if (life <= 0 || life >= 1) continue; FX.page(ctx, -160 + rr[i][1] * 380 + sin(life * 7 + i) * 22, -60 - life * (120 + rr[i][2] * 200), 7 + rr[i][3] * 4, life * 9 + i, sin(life * PI), '#a878ff'); }
    },
    parts: [
      { id: 'halo', parent: 'root', live(ctx, st) {
        if (st.phase < 1) return;
        const t = st.t, m = st.m, pl = 0.7 + 0.3 * sin(t * 2);
        tk.glow(ctx, 40, -190, 250, '#6a3ac8', 0.28 * pl);
        // a great brushed enso ring behind the wheel of tails, turning slowly
        const spr = ART.sprite('en1|enso', 520, 520, (g) => {
          const pts = [];
          for (let k = 0; k <= 60; k++) { const a = 0.5 + k / 60 * 5.5, r = 214 + 5 * sin(k * 0.7) - k * 0.12; pts.push([260 + cos(a) * r, 260 + sin(a) * r]); }
          tk.inkPath(g, pts, { w: 30, color: '#2a1a5a', taper: 0.06, taperEnd: 0.5, pressure: (u) => 1 - 0.55 * u, wobble: 0.2, seed: 9 });
          tk.inkPath(g, pts.map((p) => [260 + (p[0] - 260) * 0.985, 260 + (p[1] - 260) * 0.985]), { w: 11, color: '#8f5fe8', taper: 0.1, taperEnd: 0.6, pressure: (u) => 1 - 0.5 * u, wobble: 0.3, seed: 4, alpha: 0.9 });
          for (let k = 0; k < 9; k++) { const a = 0.5 + (0.1 + k * 0.1) * 5.5, r = 214 - k * 0.6; tk.inkPath(g, [[260 + cos(a) * (r - 13), 260 + sin(a) * (r - 13)], [260 + cos(a + 0.12) * (r + 14), 260 + sin(a + 0.12) * (r + 14)]], { w: 1.6, color: '#ffffff', alpha: 0.5, taper: 0.5 }); }
          [[6.0, 226, 5], [6.15, 240, 3.4], [5.9, 246, 2.6]].forEach((d, k) => { const a = d[0]; g.beginPath(); g.arc(260 + cos(a) * d[1], 260 + sin(a) * d[1], d[2], 0, TAU); g.fillStyle = '#2a1a5a'; g.fill(); void k; });
        });
        ctx.save(); ctx.translate(40, -190); ctx.rotate(t * 0.12 * m); ctx.globalAlpha *= 0.85; ctx.drawImage(spr, -260, -260, 520, 520); ctx.restore();
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        for (let k = 0; k < 2; k++) {
          const R = 236 + k * 14, a0 = -t * (0.3 + 0.1 * k) * m + k * 2.1;
          ctx.strokeStyle = rgba(k ? '#ffffff' : '#a878ff', k ? 0.5 : 0.55); ctx.lineWidth = k ? 2 : 4;
          for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.arc(40, -190, R, a0 + j * 2.1, a0 + j * 2.1 + 1.2); ctx.stroke(); }
        }
        ctx.restore();
      } },
      { id: 'pool', parent: 'root', live(ctx, st) {
        const t = st.t, ph = st.phase >= 1 ? 1 : 0, R = ph ? 230 : 170, m = st.m;
        ctx.save();
        const gr = ctx.createRadialGradient(0, -2, 10, 0, -2, R); gr.addColorStop(0, rgba('#140a34', 0.7)); gr.addColorStop(0.7, rgba('#2a1a5a', 0.45)); gr.addColorStop(1, rgba('#2a1a5a', 0));
        ctx.scale(1, 0.12); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(10, -16, R, 0, TAU); ctx.fill();
        for (let k = 0; k < 2; k++) { const u = (t * 0.3 + k * 0.5) % 1; ctx.strokeStyle = rgba('#c8a0ff', 0.5 * (1 - u) * m); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(-40, -16, 30 + u * (R - 40), 0, TAU); ctx.stroke(); }
        ctx.restore();
      } },
      { id: 'pagesBack', parent: 'root', live(ctx, st) { foxPages(ctx, st, false); } },
      ...[0, 8, 1, 7, 2, 6, 3, 5, 4].map(foxTail),
      { id: 'seat', parent: 'root', pivot: [20, -30], live() {},
        xf: (K, t, st) => ({ sy: 1 + 0.012 * sin(t * 1.5) * st.m - 0.02 * K.guard, sx: 1 - 0.006 * sin(t * 1.5) * st.m, rot: 0.008 * sin(t * 0.9) * st.m - 0.03 * K.strike + 0.02 * K.wind }) },
      { id: 'body', box: [-160, -270, 150, 4], parent: 'seat', pivot: [20, -30], v: (st) => (st.phase >= 1 ? 'p1' : ''),
        xf: () => ({ sx: 0.86 }),
        draw(S, v) {
          const p1 = v === 'p1';
          const torso = [[112, -92], [110, -120, 1], [102, -142], [98, -160, 1], [80, -186], [70, -204, 1], [40, -226], [24, -240, 1], [-10, -244], [-28, -252, 1], [-60, -242], [-76, -246, 1], [-98, -218], [-116, -178], [-110, -140], [-90, -114], [-52, -74], [0, -46], [56, -30], [104, -42]];
          S.cel(torso, FOX.b, { depth: 20, halftone: { d: 5.4, alpha: 0.26 }, tension: 0.85, rim: '#d8c0ff', hi: '#ffffff', line: S.lw,
            decor: (gg) => {
              gg.strokeStyle = 'rgba(184,168,224,0.8)'; gg.lineWidth = 1.6; gg.lineCap = 'round';
              [[-70, -226, -10, -232, 50, -206], [-96, -190, -20, -190, 70, -160], [-90, -150, -20, -140, 60, -110], [-60, -100, 0, -84, 70, -70]].forEach((q) => { gg.beginPath(); gg.moveTo(q[0], q[1]); gg.quadraticCurveTo(q[2], q[3], q[4], q[5]); gg.stroke(); });
              [[-30, -214, 0, -180, 40, -190, 4.6], [30, -150, 60, -128, 96, -140, 3.4], [-56, -170, -36, -146, -8, -150, 3]].forEach((q, i) => { tk.inkPath(gg, [[q[0], q[1]], [q[2], q[3]], [q[4], q[5]]], { w: q[6] * (p1 ? 1.4 : 1), color: p1 ? '#8f5fe8' : '#5a3aa8', alpha: p1 ? 0.85 : 0.55, taper: 0.4, wobble: 0.15, seed: i }); });
              if (p1) for (let i = 0; i < 6; i++) tk.inkPath(gg, [[-90 + i * 36, -240 + i * 8], [-86 + i * 36 + 8, -190 + i * 6], [-90 + i * 36, -140]], { w: 4, color: '#8f5fe8', alpha: 0.35, taper: 0.4, wobble: 0.2, seed: i + 10 });
            } });
          // the folded haunch and the hind foot laid forward on the ground
          S.cel(blob(64, -62, 60, 52, 6, 0.03, 14, -0.1), FOX.b, { depth: 14, line: S.lw, halftone: { d: 5, alpha: 0.24 }, rim: '#d8c0ff', hi: '#ffffff' });
          tk.inkPath(S.g, [[36, -98], [52, -70], [40, -44]], { w: 1.8, color: '#b8a8e0', alpha: 0.8, taper: 0.4 });
          S.cel(blob(16, -14, 48, 15, 3, 0.04, 12), INKV, { depth: 4, line: S.lw * 0.95, hi: false, rim: '#8f5fe8', halftone: { d: 4.4, alpha: 0.24 } });
          [-1, 0, 1].forEach((k) => tk.inkPath(S.g, [[-24 + k * 10, -10], [-26 + k * 10, -3]], { w: 2, color: '#a888e8', alpha: 0.7, taper: 0.3 }));
          // a spray of fur at the haunch
          S.cel([[112, -112], [130, -96, 1], [110, -100], [124, -76, 1], [106, -84]], '#ffffff', { depth: 3, line: S.lw * 0.85, tension: 0.25, hi: false, rim: null });
        } },
      { id: 'legB', box: [-100, -170, -8, 6], parent: 'seat', pivot: [-48, -150], xf: (K, t) => ({ dx: 24, rot: 0.015 * sin(t * 1.4 + 1) - 0.4 * K.wind + 0.5 * K.strike }),
        draw(S) { const dk = tk.shade(FOX.b, 0.2); S.tube([[-48, -150], [-46, -96], [-54, -50]], 34, 24, dk, { depth: 6, line: S.lw, hi: false, tension: 0.9, rim: '#a888e8' }); foxSock(S, -56, -4, -54, true); } },
      { id: 'legN', box: [-140, -190, -50, 6], parent: 'seat', pivot: [-86, -170], xf: (K, t) => ({ dx: 28, rot: -0.015 * sin(t * 1.4) - 0.6 * K.wind + 0.9 * K.strike + 0.5 * K.guard }),
        draw(S) {
          S.tube([[-86, -168], [-90, -104], [-98, -54]], 40, 26, FOX.b, { depth: 8, line: S.lw, hi: '#ffffff', tension: 0.9, bulge: 0.08, rim: '#d8c0ff' });
          S.cel([[-72, -126], [-58, -112, 1], [-76, -110]], '#ffffff', { depth: 1.5, line: S.lw * 0.8, tension: 0.2, hi: false, rim: null, shadow: false });
          foxSock(S, -100, -4, -56, false);
        } },
      { id: 'ruff', box: [-160, -250, -50, -120], parent: 'seat', pivot: [-90, -200], xf: (K, t, st) => ({ dx: 16, rot: 0.02 * sin(t * 1.8) * st.m, sx: 1 + 0.02 * sin(t * 1.5) * st.m }),
        draw(S) { S.cel(furShape([[-108, -232], [-124, -196], [-108, -144]], [34, 64, 30], 11, 41), '#ffffff', { depth: 9, line: S.lw * 0.95, tension: 0.6, rim: '#d8c0ff', hi: false, halftone: { d: 4.8, alpha: 0.2 } }); } },
      { id: 'earB', box: [-140, -380, -30, -270], parent: 'head', pivot: [-72, -296], xf: (K, t) => ({ rot: 0.05 * sin(t * 2.6 + 1) + Math.max(0, sin(t * 0.8 + 1) - 0.88) * 2 }),
        draw: (S) => { S.cel(tk.xf([[-118, -294], [-108, -326], [-92, -356, 1], [-82, -324], [-80, -294]], { dx: 28, dy: -4 }), tk.shade(FOX.b, 0.14), { depth: 5, line: S.lw * 0.95, tension: 0.4, hi: false, rim: '#a888e8', decor: (g) => { g.fillStyle = '#3a2278'; g.beginPath(); tk.trace(g, { poly: tk.xf([[-108, -298], [-100, -324], [-94, -346], [-90, -322], [-92, -298]], { dx: 28, dy: -4 }) }); g.fill(); } }); } },
      atHead({ id: 'head', box: [-270, -300, -60, -200], parent: 'seat', pivot: [-116, -250],
        xf: (K, t, st) => ({ rot: 0.03 * sin(t * 1.2) * st.m + 0.3 * K.wind - 0.26 * K.strike + 0.1 * K.hurt - 0.06 * K.guard, dx: 12 - 26 * K.strike + 8 * K.wind, dy: -5 * K.wind + 1.6 * sin(t * 1.5 + 0.5) * st.m }),
        draw(S) {
          const g = S.g;
          S.cel(blob(-128, -262, 47, 38, 8, 0.03, 16, -0.1), FOX.b, { depth: 12, halftone: { d: 5, alpha: 0.24 }, rim: '#d8c0ff', hi: '#ffffff', line: S.lw });
          S.fill([[-158, -246], [-190, -244], [-218, -238], [-206, -230], [-180, -228], [-150, -236]], '#3a0a30');
          S.cel([[-156, -290], [-190, -280], [-222, -262], [-238, -248, 1], [-220, -240], [-190, -242], [-156, -244]], FOX.b, { depth: 9, line: S.lw, tension: 0.7, halftone: { d: 4.8, alpha: 0.22 }, rim: '#d8c0ff', hi: '#ffffff' });
          S.cel(blob(-236, -249, 9, 8, 3, 0.05, 9), '#1a1030', { depth: 2, line: S.lw * 0.8, hi: false, rim: '#a888e8', shadow: false }); S.dot(-239, -252, 2, '#ffffff');
          [[-214, -242], [-196, -245]].forEach((f) => S.fill([[f[0], f[1]], [f[0] + 9, f[1]], [f[0] + 5, f[1] + 12]], '#fffaf0'));
          [[-244, -262, -216, -258, -192, -256], [-242, -268, -214, -270, -190, -266]].forEach((w, i) => tk.inkPath(g, [[w[0], w[1]], [w[2], w[3]], [w[4], w[5]]], { w: 1.4, color: '#a888e8', alpha: 0.8, taper: 0.5, seed: i }));
          S.cel([[-100, -250], [-72, -244, 1], [-94, -234], [-66, -222, 1], [-98, -220], [-112, -236]], '#ffffff', { depth: 4, line: S.lw * 0.85, tension: 0.3, hi: false, rim: '#d8c0ff' });
          tk.inkPath(g, [[-84, -232], [-102, -226], [-124, -232]], { w: 19, color: pal.ink, taper: 0.03 }); tk.inkPath(g, [[-84, -232], [-102, -226], [-124, -232]], { w: 14, color: '#e8383d', taper: 0.03 });
          tk.inkPath(g, [[-88, -235], [-102, -230], [-120, -236]], { w: 2.2, color: '#ff9a8a', alpha: 0.9, taper: 0.3 });
          S.cel(ell(-108, -214, 9, 9, 10), '#f5c96a', { depth: 3, line: S.lw * 0.9, rim: '#fff8d0' }); S.ln([[-108, -222], [-108, -206]], { w: 1.4, color: '#a07a30' }); S.dot(-108, -210, 1.8, '#5a3a10');
          S.cel([[-92, -224], [-84, -212], [-90, -202], [-98, -208]], '#3fd6b0', { depth: 2, line: 1.8, tension: 0.6, rim: '#c8fff0', hi: false });
        } }),
      atHead({ id: 'jaw', box: [-250, -260, -120, -200], parent: 'head', pivot: [-138, -240], xf: (K) => ({ rot: K.mouth === 'open' ? -0.5 : K.mouth === 'grit' ? -0.16 : 0.02 }),
        draw(S) {
          S.cel([[-160, -244], [-192, -244], [-222, -238], [-214, -228], [-190, -226], [-160, -228], [-136, -238]], tk.shade(FOX.b, 0.06), { depth: 5, line: S.lw * 0.95, tension: 0.7, hi: false, rim: '#d8c0ff' });
          [[-210, -238], [-194, -242]].forEach((f) => S.fill([[f[0], f[1]], [f[0] + 8, f[1]], [f[0] + 4, f[1] - 11]], '#fffaf0'));
        } }),
      atHead({ id: 'earF', box: [-180, -380, -90, -270], parent: 'head', pivot: [-132, -292], xf: (K, t) => ({ rot: 0.05 * sin(t * 2.3) + Math.max(0, sin(t * 0.7) - 0.9) * 2 }),
        draw(S) { S.cel([[-152, -292], [-146, -330], [-134, -364, 1], [-118, -326], [-112, -292]], FOX.b, { depth: 6, line: S.lw, tension: 0.4, hi: '#ffffff', rim: '#d8c0ff', decor: (g) => { g.fillStyle = '#3a2278'; g.beginPath(); tk.trace(g, { poly: [[-146, -298], [-140, -328], [-134, -352], [-124, -326], [-124, -298]] }); g.fill(); g.strokeStyle = '#8f5fe8'; g.lineWidth = 2; g.beginPath(); g.moveTo(-138, -304); g.lineTo(-133, -334); g.stroke(); } }); } }),
      atHead({ id: 'face', box: [-200, -320, -70, -235], parent: 'head', pivot: [-134, -270], face: true, xf: null,
        draw(S, state) {
          const [ey, mo] = state.split('|'), g = S.g, ex = ey === 'open' ? 'determined' : ey;
          [[-176, -256, -146, -250, -110, -240, 4.4], [-172, -250, -146, -240, -114, -226, 3], [-150, -294, -126, -300, -98, -292, 3.4]].forEach((l, i) => tk.inkPath(g, [[l[0], l[1]], [l[2], l[3]], [l[4], l[5]]], { w: l[6], color: '#e8383d', taper: 0.35, wobble: 0.1, seed: i }));
          S.eye(-162, -272, 32, 30, ex, { iris: ['#3a1a8a', '#e0c0ff'], sclera: '#fff0ff', glow: 1, lashes: false, wing: 0.5, lineW: 2.8 });
          S.eye(-118, -276, 26, 25, ex, { iris: ['#3a1a8a', '#e0c0ff'], sclera: '#fff0ff', glow: 1, lashes: false, wing: 0.5, lineW: 2.6, catchSide: 1 });
          tk.brow(g, -168, -296, 26, { tilt: 0.7, side: 1, thick: 3.8, arch: 0.2, color: '#3a2278' }); tk.brow(g, -116, -300, 22, { tilt: 0.7, side: -1, thick: 3.4, arch: 0.2, color: '#3a2278' });
          S.dot(-138, -298, 4.6, '#8f5fe8'); tk.inkPath(g, ell(-138, -298, 6.6, 6.6, 8), { closed: true, w: 1.6, color: '#3a2278', align: 0 });
          tk.inkPath(g, [[-160, -258], [-158, -248], [-159, -238]], { w: 3.4, color: '#2a1a5a', taper: 0.1, taperEnd: 0.5 }); S.dot(-159, -236, 2.4, '#2a1a5a');
          tk.inkPath(g, [[-116, -262], [-114, -254]], { w: 2.6, color: '#2a1a5a', taper: 0.1, taperEnd: 0.5 });
          void mo;
        } }),
      { id: 'maskW', box: [-46, -66, 46, 56], parent: 'seat', pivot: [0, 0], when: (st) => st.phase < 1,
        xf: (K, t, st) => ({ dx: 30 + 4 * K.wind, dy: -336 + 6 * sin(t * 1.5) * st.m, rot: 0.1 * sin(t * 1.1) * st.m + 0.05 * K.hurt }),
        draw(S) { noh(S, null); } },
      { id: 'maskL', box: [-46, -66, 12, 56], parent: 'seat', pivot: [0, 0], when: (st) => st.phase >= 1,
        xf: (K, t, st) => ({ dx: -4 + 4 * K.wind, dy: -332 + 7 * sin(t * 1.5) * st.m, rot: -0.35 + 0.12 * sin(t * 1.3) * st.m }),
        draw(S) { noh(S, 'L'); } },
      { id: 'maskR', box: [-12, -66, 46, 56], parent: 'seat', pivot: [0, 0], when: (st) => st.phase >= 1,
        xf: (K, t, st) => ({ dx: 72 + 4 * K.wind, dy: -328 + 7 * sin(t * 1.5 + 1.2) * st.m, rot: 0.4 + 0.12 * sin(t * 1.3 + 1) * st.m }),
        draw(S) { noh(S, 'R'); } },
      { id: 'fxHead', parent: 'head', live(ctx, st) {
        const K = st.K, t = st.t, p1 = st.phase >= 1, k = (p1 ? 1.5 : 1) + 0.8 * K.alert + 0.6 * K.strike + 0.4 * K.buff, pl = 0.75 + 0.25 * sin(t * 3);
        ctx.save(); ctx.translate(HEAD_OFF[0], HEAD_OFF[1]);
        if (K.eyes !== 'closed' && K.eyes !== 'hurt') { tk.glow(ctx, -162, -272, 38, '#b088ff', 0.55 * k * pl); tk.glow(ctx, -118, -276, 32, '#b088ff', 0.5 * k * pl); }
        if (p1) tk.glow(ctx, -140, -268, 76, '#8f5fe8', 0.25 * pl);
        ctx.restore();
      } },
      { id: 'fxMask', parent: 'root', raw: true, live(ctx, st) {
        const t = st.t, p1 = st.phase >= 1, pl = 0.7 + 0.3 * sin(t * 3.4), M = st.M;
        const eyeGlow = (id, x, y, r, a) => { const m = M[id]; ctx.save(); ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]); tk.glow(ctx, x, y, r, '#b088ff', a); ctx.restore(); };
        if (!p1) { eyeGlow('maskW', -13, -5, 16, 0.6 * pl); eyeGlow('maskW', 13, -5, 16, 0.6 * pl); eyeGlow('maskW', 0, 0, 56, 0.16 * pl); }
        else {
          eyeGlow('maskL', -13, -5, 18, 0.7 * pl); eyeGlow('maskR', 13, -5, 18, 0.7 * pl);
          const a = M.maskL, b = M.maskR, mx = (a[4] + b[4]) / 2, my = (a[5] + b[5]) / 2;
          tk.glow(ctx, mx, my, 70, '#a878ff', 0.5 * pl); tk.sparkle(ctx, mx, my, 12 + 4 * pl, { color: '#ffffff', rot: t * 0.6, glow: 0.6 });
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.strokeStyle = rgba('#c8a0ff', 0.6 * pl); ctx.lineWidth = 3;
          for (let i = 0; i < 4; i++) { const u = (t * 0.6 + i / 4) % 1; ctx.beginPath(); ctx.moveTo(lerp(a[4], b[4], 0.3), lerp(a[5], b[5], 0.3) - 30 + i * 20); ctx.lineTo(lerp(a[4], b[4], 0.7), lerp(a[5], b[5], 0.7) - 30 + i * 20 + u * 6); ctx.stroke(); }
          ctx.restore();
        }
      } },
      { id: 'fxTails', parent: 'root', raw: true, live(ctx, st) {
        const K = st.K, t = st.t, m = st.m, M = st.M, p1 = st.phase >= 1, k = 0.35 + 0.65 * K.alert + 0.5 * K.buff + (st.K.pose === 'attack' ? 0.6 * K.strike : 0);
        for (let i = 0; i < 9; i++) {
          const tm = M['tail' + i], bend = (0.16 * sin(t * 1.5 + i * 0.9) + 0.16 * sin(t * 1.5 + i * 0.9 - 0.8) + 0.16 * sin(t * 1.5 + i * 0.9 - 1.6)) * 0.42 * m;
          const cb = cos(bend), sb = sin(bend), tx = 11, ty = -216, px = tx * cb - ty * sb, py = tx * sb + ty * cb;
          const tip = mat.pt(tm, px, py);
          tk.glow(ctx, tip[0], tip[1], (p1 ? 30 : 22) * (0.8 + 0.4 * (i === 4 ? 1 + K.wind : 1)), '#8f5fe8', (0.2 + 0.28 * k) * (p1 ? 1.2 : 1));
          const ph = (t * 0.32 + i * 0.211) % 1, fall = Math.pow(clamp((ph - 0.55) / 0.45, 0, 1), 1.7);
          const sz = 2.4 + 2.4 * clamp(ph / 0.55, 0, 1);
          ctx.save(); ctx.globalAlpha *= ph < 0.55 ? 0.95 : 1 - fall * 0.9; ctx.fillStyle = '#1a0f40';
          ctx.beginPath(); ctx.arc(tip[0] - 1, tip[1] + 3 + fall * 120 * (0.5 + 0.5 * m), sz * (1 - fall * 0.3), 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(200,160,255,0.7)'; ctx.beginPath(); ctx.arc(tip[0] - 2, tip[1] + 2 + fall * 120 * (0.5 + 0.5 * m), sz * 0.3, 0, TAU); ctx.fill(); ctx.restore();
        }
        if (K.wind > 0.2) { const c = mat.pt(M.tail4, 11, -218 * (1 + 0.22 * K.wind)); tk.glow(ctx, c[0], c[1], 64 * K.wind, '#c8a0ff', 0.6 * K.alert); tk.sparkle(ctx, c[0], c[1], 18 * K.wind, { color: '#ffffff', rot: t * 2, glow: 0.7 }); }
      } },
      { id: 'pagesFront', parent: 'root', live(ctx, st) {
        foxPages(ctx, st, true);
        const t = st.t, m = st.m, p1 = st.phase >= 1, rr = table('kuz-motes', 22, 3);
        for (let i = 0; i < (p1 ? 22 : 12); i++) { const ph = (t * 0.16 + rr[i][0]) % 1; tk.sparkle(ctx, -190 + rr[i][1] * 380 + sin(ph * 6 + i) * 10, -30 - ph * 330, 2.4 + rr[i][2] * 3, { color: rr[i][2] > 0.5 ? '#d8c0ff' : '#ffffff', alpha: sin(ph * PI) * 0.85 * m, glow: 0.4 }); }
      } },
    ],
  });
  // pages of the book turning about the fox: back ones behind her, front ones over her
  function foxPages(ctx, st, front) {
    const t = st.t, m = st.m, p1 = st.phase >= 1, n = p1 ? 8 : 5, rr = table('kuz-pages', 10, 4);
    for (let i = 0; i < n; i++) {
      const a = t * (0.32 + rr[i][0] * 0.1) * m + i * TAU / n + rr[i][1] * 2, sn = sin(a);
      if ((sn > 0) !== front) continue;
      const rx = (p1 ? 190 : 170) + rr[i][2] * 24, ry = 60 + rr[i][3] * 40, x = 10 + cos(a) * rx, y = -200 + sn * ry - 40 * sin(t * 0.7 + i) * m;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a * 1.3 + i); ctx.scale(1, 0.55 + 0.45 * Math.abs(cos(a * 2 + i)));
      FX.page(ctx, 0, 0, 9 + rr[i][2] * 4, 0, 0.95, p1 ? '#a878ff' : null);
      ctx.restore();
    }
  }

  //@CREATURES

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
      const states = part.face ? ['open|closed', 'angry|open', 'hurt|open', 'closed|closed', 'half|grit', 'wide|closed'] : [''];
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
    const c = ART.sprite('en1|warmprobe', 4, 4, () => {});
    void c;
    const noop = { save() {}, restore() {}, transform() {}, drawImage() {}, translate() {}, scale() {}, rotate() {}, setTransform() {}, beginPath() {}, moveTo() {}, lineTo() {}, arc() {}, ellipse() {}, fill() {}, stroke() {}, clip() {}, fillRect() {}, rect() {}, quadraticCurveTo() {}, bezierCurveTo() {}, closePath() {}, createLinearGradient() { return { addColorStop() {} }; }, createRadialGradient() { return { addColorStop() {} }; }, setLineDash() {}, globalAlpha: 1 };
    try { drawEnemy(spec, noop, { s, pose, t: 0.3, pt: 0.15, phase: 0 }); if (spec.id === 'boss_kuzunoha') drawEnemy(spec, noop, { s, pose, t: 0.3, pt: 0.15, phase: 1 }); } catch (e) { /* warming is best effort */ }
  }
  // ===============================================================================================================
  // gallery: a golden-dusk bamboo backdrop (chapter 1's atmosphere, ART_BIBLE 3 and 6) and the sheets
  // ===============================================================================================================
  function grove(ctx, W, H, t, gy) {
    ART.blit(ctx, ART.sprite('en1|grove|' + Math.round(W) + 'x' + Math.round(H) + '|' + Math.round(gy), W, H, (g) => {
      tk.sky(g, 0, 0, W, gy, 'golden');
      tk.glow(g, W * 0.7, gy * 0.4, gy * 0.9, '#fff0b8', 0.85);
      const layers = [{ n: 30, col: '#b07a90', a: 0.32, w: [5, 9], seed: 1 }, { n: 18, col: '#8a6090', a: 0.5, w: [8, 14], seed: 2 }, { n: 9, col: '#4a3a6a', a: 0.9, w: [13, 22], seed: 3 }];
      layers.forEach((L) => {
        const r = tk.rng('en1grove', L.seed);
        for (let i = 0; i < L.n; i++) {
          const x = r() * W, w = lerp(L.w[0], L.w[1], r()), seg = 50 + r() * 50;
          g.fillStyle = rgba(L.col, L.a); g.fillRect(x - w / 2, -10, w, gy + 10);
          g.fillStyle = rgba('#ffe7a8', L.a * 0.25); g.fillRect(x - w / 2, -10, w * 0.25, gy + 10);
          g.fillStyle = rgba(pal.ink, L.a * 0.5);
          for (let y = (r() * seg); y < gy; y += seg) g.fillRect(x - w / 2 - 1, y, w + 2, Math.max(1.5, w * 0.16));
          if (L.seed > 1) for (let k = 0; k < 3; k++) { const ly = 10 + r() * gy * 0.35, dir = r() < 0.5 ? -1 : 1; g.beginPath(); g.ellipse(x + dir * w * 2.2, ly, w * 2.4, w * 0.5, dir * -0.5, 0, TAU); g.fillStyle = rgba('#7a9a4a', L.a * 0.55); g.fill(); }
        }
      });
      const gg = g.createLinearGradient(0, gy - 30, 0, H);
      gg.addColorStop(0, rgba('#e8a86a', 0.0)); gg.addColorStop(0.12, '#6a4a5a'); gg.addColorStop(1, '#241a3a');
      g.fillStyle = gg; g.fillRect(0, gy - 30, W, H - gy + 30);
      g.fillStyle = rgba('#ffd889', 0.22); g.fillRect(0, gy - 2, W, 3);
      const r = tk.rng('en1grass', 1);
      for (let i = 0; i < 60; i++) { const x = r() * W, y = gy + 4 + r() * (H - gy - 6), h = 5 + r() * 9; tk.inkPath(g, [[x, y], [x + (r() - 0.5) * 6, y - h * 0.6], [x + (r() - 0.5) * 10, y - h]], { w: 2, color: rgba('#c8b060', 0.5), taper: 0.5, wobble: 0 }); }
    }), 0, 0, W, H);
    tk.mist(ctx, 0, gy - H * 0.35, W, H * 0.4, t, { seed: 4, alpha: 0.13, color: '#fff0d0' });
    tk.kirakira(ctx, 0, 0, W, gy, t, { n: 18, seed: 6, size: 2.6, rise: 4 });
    tk.paperGrain(ctx, 0, 0, W, H, { alpha: 0.28 });
  }
  const KEYPT = { idle: 0, telegraph: 0.5, attack: 0.19, hurt: 0.05, block: 0.14, buff: 0.16, die: 0.3 };
  const POSES = ['idle', 'telegraph', 'attack', 'hurt', 'block', 'buff', 'die'];
  // combat mock: the heroes at the SCENE layout and the enemies in their lanes (1280 x 720, ground at 520), the size they are really seen at
  function combatMock(ctx, params, ids) {
    const W = params.w, H = params.h, t = num(params.t, 0), k = Math.min(W / 1280, H / 720), lanes = [560, 705, 850, 995, 1120];
    ctx.save(); ctx.scale(k, k);
    grove(ctx, 1280, 720, t, 520);
    const poses = String(params.pose || 'idle').split(','), n = Math.min(5, ids.length);
    ART.hero.draw(ctx, 'hanae', { x: 330, y: 520, s: 1, pose: 'idle', t });
    ART.hero.draw(ctx, 'kuro', { x: 170, y: 508, s: 0.94, pose: 'idle', t: t + 0.7 });
    ids.slice(0, 5).forEach((id, i) => {
      const pose = poses[i % poses.length], sp = SPECS[id];
      if (!sp) return;
      ART.enemy.draw(ctx, id, { x: lanes[5 - n + i], y: 520, s: 1, pose, t: t + i * 0.4, pt: params.pt !== undefined ? num(params.pt, 0) : KEYPT[pose] || 0, phase: params.phase | 0, hpPct: params.hp === undefined ? 1 : params.hp });
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
    if (params.grove === 0 || params.grove === false) { ctx.fillStyle = '#3a2f52'; ctx.fillRect(0, 0, W, H); } else grove(ctx, W, H, t, gy);
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

  // the roster order for the sheets: normals, elites, minions (the boss has its own sheet)
  function chapterIds() {
    const r = (DATA.ROSTER && DATA.ROSTER[1]) || [], ord = { normal: 0, elite: 1, minion: 2 };
    return r.filter((x) => SPECS[x.id] && x.tier !== 'boss').sort((a, b) => ord[a.tier] - ord[b.tier]).map((x) => x.id);
  }
  ART.sheet('enemies1', (canvas, params) => {
    const ids = chapterIds(), poses = String(params.poses || 'idle,telegraph,attack').split(','), t = num(params.t, 0);
    const cells = ids.map((id) => ({ id, label: id + '  (' + ((DATA.enemies[id] || {}).tier || '?') + ', ' + ((DATA.enemies[id] || {}).size || '?') + ')' }));
    ART.sheetGrid(canvas, params, cells, (g, cell, w, h) => {
      grove(g, w, h, t, h * 0.9);
      const n = poses.length, slot = w / n, b = ART.enemy.bounds(cell.id);
      poses.forEach((pose, k) => {
        const s = Math.min(slot * 0.98 / b.w, h * 0.9 / b.h);
        ART.enemy.draw(g, cell.id, { x: slot * (k + 0.5), y: h * 0.9, s, pose, t: t + k * 0.31, pt: params.pt !== undefined ? num(params.pt, 0) : KEYPT[pose] || 0 });
      });
    }, { cols: 4, title: 'Chapter 1, the Whispering Bamboo Grove: idle, telegraph, attack (params poses=a,b,c  t=)', gap: 6, labelH: 16, cellBg: false });
  });
  ART.sheet('boss1', (canvas, params) => {
    const ctx = canvas.getContext('2d'), W = params.w, H = params.h, t = num(params.t, 0), id = 'boss_kuzunoha';
    const poses = ['telegraph', 'attack', 'hurt', 'block', 'buff', 'die'], phases = params.phase !== undefined ? [params.phase | 0] : [0, 1];
    ctx.fillStyle = pal.night; ctx.fillRect(0, 0, W, H);
    const rowH = H / phases.length, big = Math.min(W * 0.34, 560), small = (W - big) / poses.length, b = ART.enemy.bounds(id);
    phases.forEach((ph, r) => {
      const y0 = r * rowH;
      ctx.save(); ctx.beginPath(); ctx.rect(0, y0, W, rowH); ctx.clip(); ctx.translate(0, y0);
      grove(ctx, W, rowH, t, rowH * 0.9);
      ART.enemy.draw(ctx, id, { x: big * 0.62, y: rowH * 0.9, s: Math.min(big * 0.98 / b.w, rowH * 0.92 / b.h), pose: 'idle', t, pt: 0, phase: ph });
      poses.forEach((pose, k) => {
        const s = Math.min(small * 0.98 / b.w, rowH * 0.7 / b.h);
        ART.enemy.draw(ctx, id, { x: big + small * (k + 0.5), y: rowH * 0.9, s, pose, t: t + k * 0.3, pt: KEYPT[pose] || 0, phase: ph });
        ctx.font = '600 12px system-ui'; ctx.fillStyle = 'rgba(255,248,240,0.9)'; ctx.textAlign = 'center'; ctx.fillText(pose, big + small * (k + 0.5), rowH - 6);
      });
      ctx.font = '700 15px system-ui'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff8f0'; ctx.fillText('Kuzunoha  phase ' + ph + (ph ? '  (fan, split mask, halo)' : '  (bundle, whole mask)') + '  idle', 12, 22);
      ctx.restore();
    });
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(0, rowH - 1, W, 2);
  });
  ART.sheet('enemies1_anim', (canvas, params) => {
    const ctx = canvas.getContext('2d'), W = params.w, H = params.h, t = num(params.t, 0);
    const pair = [SPECS[params.a] ? params.a : 'kappa', SPECS[params.b] ? params.b : 'bamboo_boar'], N = num(params.n, 10);
    const rows = [];
    pair.forEach((id) => { rows.push({ id, pose: 'telegraph', label: 'telegraph wind-up (0 to 340 ms, then it holds)', span: 0.5 }); rows.push({ id, pose: 'attack', label: 'attack (0 to 420 ms)', span: 0.42 }); rows.push({ id, pose: 'die', label: 'die (0 to 700 ms)', span: 0.7 }); });
    const rh = H / rows.length, cw = W / N;
    ctx.fillStyle = pal.night; ctx.fillRect(0, 0, W, H);
    rows.forEach((row, r) => {
      const y0 = r * rh;
      ctx.save(); ctx.beginPath(); ctx.rect(0, y0, W, rh); ctx.clip(); ctx.translate(0, y0);
      grove(ctx, W, rh, t, rh * 0.86);
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
