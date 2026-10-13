// Character Studio core: turns a character (cc_data.js) into the numbers every part module draws with (CC.resolve), plus the small
// geometry helpers the hair, face, outfit and accessory files share. Nothing here draws a whole figure; cc_figure.js does that.
// Space: head space has its origin at the head centre, y up is negative, the face is turned to +x (the near ear is on -x), as in the
// game's ART.rj kit. A part module is written for the DEFAULT head and every point goes through K.T so the head width, height and chin
// sliders reshape hair, ears and hats together with the skull.
(function () {
  'use strict';
  const CC = window.CC, RJ = ART.rj, tk = ART.tk;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const TAU = Math.PI * 2;
  CC.u = { clamp, lerp, TAU };

  // ---- colours ----
  const rgb = (hex) => U.color.rgb(hex);
  const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, k) => { const x = rgb(a), y = rgb(b); return toHex(lerp(x[0], y[0], k), lerp(x[1], y[1], k), lerp(x[2], y[2], k)); };
  const lum = (hex) => { const c = rgb(hex); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; };
  const rgba = (hex, a) => { const c = rgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + clamp(a, 0, 1).toFixed(3) + ')'; };
  // the warm cel shadow and the lit-side tint, tuned so a very dark or very light colour still shows a step
  const shade = (hex, k) => (lum(hex) < 0.14 ? mix(hex, '#000000', 0.38 + (k || 0)) : RJ.shade(hex, k));
  const tint = (hex, k) => (lum(hex) > 0.9 ? mix(hex, '#e9dcd8', k || 0.3) : RJ.tint(hex, k));
  CC.col = { rgb, mix, lum, rgba, shade, tint, toHex };

  // ---- the default skull (Jasmin's): 17 control points, closed Catmull-Rom ----
  const SKULL = [[-2, -58], [30, -54], [51, -36], [59.5, -8], [59, 11], [53.5, 28], [42, 43], [27, 55.2], [9, 60.4], [-9, 56.4], [-24, 51.5], [-38, 41], [-52, 25], [-60.5, 6], [-62, -10], [-58, -33], [-40, -52]];
  CC.SKULL = SKULL;

  // the top ring of the skull, far temple over the crown to the near ear, pushed outward by d (a hair cap that hugs or puffs)
  CC.ring = function (d, up) {
    const idx = [3, 2, 1, 0, 16, 15, 14, 13, 12], out = [];
    idx.forEach((i, n) => {
      const p = SKULL[i], dx = p[0] + 1, dy = p[1] + 4, l = Math.hypot(dx, dy) || 1;
      const k = (n === 0 || n === idx.length - 1) ? 0.5 : 1;
      out.push([p[0] + (dx / l) * d * k, p[1] + (dy / l) * d * k - (up && p[1] < -30 ? up * (-p[1] - 30) / 28 : 0)]);
    });
    return out;
  };
  // a zigzag of sharp tips along a polyline: n teeth of height h (outward = along the normal that points away from the head centre)
  CC.teeth = function (pts, n, h, jit) {
    const out = [], f = tk.flatten(pts, { closed: false, step: 3 }), P = [];
    for (let i = 0; i < f.length; i += 2) P.push([f[i], f[i + 1]]);
    const total = P.length - 1;
    for (let k = 0; k < n * 2 + 1; k++) {
      const u = k / (n * 2), i = Math.min(total - 1, Math.floor(u * total)), p = P[i], q = P[i + 1] || p;
      const dx = p[0] + 1, dy = p[1] + 4, l = Math.hypot(dx, dy) || 1, tip = k % 2 === 1, hh = tip ? h * (1 + (((k * 37) % 5) - 2) * (jit || 0.15)) : 0;
      out.push([p[0] + (dx / l) * hh, p[1] + (dy / l) * hh, tip ? 1 : 0]);
    }
    return out;
  };
  // a scalloped, fluffy closed ring (curls, clouds, plush): n soft rounded bumps
  CC.cloud = function (cx, cy, rx, ry, n, amp, phase, dir) {
    const pts = [], sd = dir === -1 ? -1 : 1, steps = 4;
    for (let i = 0; i < n; i++) for (let j = 0; j < steps; j++) {
      const t = j / steps, a = (phase || 0) + ((i + t) / n) * TAU, k = 1 + sd * amp * Math.pow(Math.sin(Math.PI * t), 0.85);
      pts.push(j === 0 ? [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 1] : [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    return pts;
  };
  // sample a polyline at u in 0..1 by arc length
  CC.along = function (pts, u) {
    const f = tk.flatten(pts, { closed: false, step: 2 }), P = [];
    for (let i = 0; i < f.length; i += 2) P.push([f[i], f[i + 1]]);
    if (P.length < 2) return pts[0];
    let tot = 0; const seg = [];
    for (let i = 1; i < P.length; i++) { const d = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); seg.push(d); tot += d; }
    let want = clamp(u, 0, 1) * tot;
    for (let i = 0; i < seg.length; i++) { if (want <= seg[i] || i === seg.length - 1) { const k = seg[i] ? want / seg[i] : 0; return [lerp(P[i][0], P[i + 1][0], k), lerp(P[i][1], P[i + 1][1], k)]; } want -= seg[i]; }
    return P[P.length - 1];
  };
  // a wavy ribbon spine: points from a to b with a sideways sine wave
  CC.waveSpine = function (a, b, waves, amp, n) {
    const out = [], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    for (let i = 0; i <= (n || 8); i++) { const u = i / (n || 8), w = Math.sin(u * waves * Math.PI) * amp * Math.min(1, u * 3); out.push([a[0] + dx * u + nx * w, a[1] + dy * u + ny * w]); }
    return out;
  };
  // a closed outline of a thick wavy strip along a spine (for hair that hangs, tails, braids): width profile w(u)
  CC.strip = function (spine, w0, w1, wmid) {
    const f = tk.flatten(spine, { closed: false, step: 4 }), P = [];
    for (let i = 0; i < f.length; i += 2) P.push([f[i], f[i + 1]]);
    const L = [], R = [];
    for (let i = 0; i < P.length; i++) {
      const u = i / (P.length - 1), a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const hw = (lerp(w0, w1, u) + (wmid || 0) * Math.sin(Math.PI * u)) / 2;
      L.push([P[i][0] + ty * hw, P[i][1] - tx * hw]); R.push([P[i][0] - ty * hw, P[i][1] + tx * hw]);
    }
    return L.concat(R.reverse());
  };

  // ---- the resolver: everything a part needs, computed once per character ----
  CC.resolve = function (c) {
    const K = { c };
    // skin
    K.skin = c.skin; K.skinSh = shade(c.skin, 0.06); K.skinHi = tint(c.skin, 0.4); K.skinDeep = shade(c.skin, 0.2);
    // head shape: T maps a point of the default head to this head
    const sw = c.headW, shh = c.headH, chin = c.chin;
    K.sw = sw; K.sh = shh;
    K.T = (p) => { const q = [p[0] * sw, p[1] * shh + (p[1] > 40 ? chin * (p[1] - 40) / 20 : 0)]; if (p.length > 2) q.push(p[2]); return q; };
    K.TT = (pts) => pts.map(K.T);
    K.skull = K.TT(SKULL);
    // hair palette
    const hc = c.hairColor, h2 = c.hairColor2;
    K.hair = { base: hc, sh: shade(hc, 0.04), hi: tint(hc, 0.34), streak: mix(hc, lum(hc) > 0.5 ? '#c07a30' : '#e8a060', 0.45), c2: h2, c2sh: shade(h2, 0.04), dye: c.dye };
    K.hairLine = K.hair.sh;
    // brows follow the hair unless set
    K.browColor = c.browColor || mix(hc, '#2a1208', 0.35);
    K.facialColor = c.facialC || hc;
    // iris pair (a dark top and a lighter lens)
    K.iris = [mix(c.iris, '#100804', 0.5), tint(c.iris, 0.18)];
    // the face grid (head space, default head), see the notes in the figure file
    const E = EYE_STYLE[c.eyes] || EYE_STYLE.round;
    K.eyeStyle = E;
    const cx = 9, eyeY = 7 + c.eyeY, w = E.w * c.eyeSize, h = E.h * c.eyeSize, wF = w * 0.88, gap = 29 + c.eyeGap;
    K.fg = {
      cx, eyeY, w, h, wF, gap,
      near: { x: cx - gap / 2 - w / 2, y: eyeY, w, h }, far: { x: cx + gap / 2 + wF / 2, y: eyeY, w: wF, h: h },
      browY: eyeY - h / 2 - 15 + c.browY, noseY: eyeY + 17 + c.noseY, mouthY: eyeY + 30 + c.mouthY, mouthW: 23.5 * c.mouthW, blushY: eyeY + 21, earY: 8, earR: 15.5 * c.earSize,
    };
    // body
    K.build = c.build; K.legT = c.legT;
    return K;
  };

  // eye styles: the base size, and the numbers RJ.eyeCel takes (iris share of the eye, lid tilt and drop, flick, crease)
  const EYE_STYLE = {
    round: { w: 31, h: 31, irisW: 0.74, irisH: 0.92, tilt: 0, drop: 0, wing: 0.45, crease: true, lashK: 1 },
    almond: { w: 31, h: 21, irisW: 0.5, irisH: 0.86, tilt: 0.2, drop: 0.2, wing: 0.55, crease: true, lashK: 1.15 },
    sleepy: { w: 30, h: 25, irisW: 0.6, irisH: 0.84, tilt: -0.05, drop: 0.45, wing: 0.3, crease: true, lashK: 1 },
    cat: { w: 31, h: 23, irisW: 0.55, irisH: 0.9, tilt: 0.38, drop: 0.12, wing: 1, crease: true, lashK: 1.1 },
    sharp: { w: 30, h: 19, irisW: 0.46, irisH: 0.8, tilt: 0.62, drop: 0.22, wing: 0.7, crease: false, lashK: 1.2 },
    wide: { w: 33, h: 33, irisW: 0.8, irisH: 0.95, tilt: -0.05, drop: 0, wing: 0.2, crease: false, lashK: 0.9 },
    dot: { w: 26, h: 26, dot: true },
    happy: { w: 30, h: 30, arcs: true },
    star: { w: 32, h: 32, irisW: 0.82, irisH: 0.95, tilt: 0, drop: 0, wing: 0.35, crease: true, lashK: 1 },
  };
  CC.EYE_STYLE = EYE_STYLE;
})();
