'use strict';
// ===================== ART_ICONS: "RoxorLoops & Jasmin" bubbly sticker icon set =====================
// Overrides icon() from art.js. Every icon is drawn in unit space (-1..1) as a puffy, inflated vinyl
// sticker: flat saturated palette fills (lime / hot pink / cyan / lavender / sunny yellow / orange /
// cream), a uniform thick ink outline with round joins (drawn *under* the fill so shading stays
// visible), toon felt shading (shade + mid band offset away from the upper-left light, light rim,
// paper grain), one big crisp white highlight blob + tiny sparkle, and a white die-cut sticker border
// made by dilating the finished silhouette. Big icons get small doodles (music notes, stars, hearts).
// No soft shadows or glows: outline-only separation, so the magenta-keyed export sheet stays clean.
// Results are cached as offscreen sprites keyed by name + device-pixel size bucket + detail level +
// colour override, so a frame only pays for drawImage.
// Small icons (s < 22 or < 20 device px) get a simplified pass: thicker outline, one shade band, one
// highlight, no grain / rim / doodles.

// ---------- original IC-table renderer (fallback for unknown names) ----------
function legacyIcon(c, name, x, y, s, o = {}) {
  const d = IC[name]; if (!d) return;
  c.save(); c.translate(x, y); c.scale(s, s); if (d.r) c.rotate(d.r); if (o.rot) c.rotate(o.rot);
  const lw = Math.max(1.7 / s, (o.lw || 4.2) / s * (s > 30 ? 1 : s / 30 + .4));
  d.parts.forEach((pt, i) => {
    let fill = pt.f ? (ICC[pt.f] || (pt.f === 'grey' ? '#8a8378' : pt.f === 'paper' ? '#efe6c8' : pt.f)) : null;
    if (o.col && i === (o.ci || 0) && pt.f) fill = o.col;
    const sd = (o.seed || 7) + i;
    const oo = { seed: sd, lw: pt.stroke === 0 ? 0.01 : lw, off: .06 * 1, amp: .015, sharp: pt.sharp || d.sharp, stroke: pt.stroke !== 0, shade: s > 14, pad: .2, shadeSz: .11 };
    if (pt.e) { inkShape(c, ellPts(pt.e[0], pt.e[1], pt.e[2], pt.e[3], 10), fill, Object.assign(oo, { sharp: false })); }
    else if (pt.rot) { c.save(); c.rotate(pt.rot); inkShape(c, pt.p, fill, oo); c.restore(); }
    else if (!fill && pt.line) { c.beginPath(); c.moveTo(pt.p[0][0], pt.p[0][1]); for (const q of pt.p.slice(1)) c.lineTo(q[0], q[1]); c.lineWidth = lw * 1.4; c.strokeStyle = C.ink; c.lineCap = 'round'; c.stroke(); }
    else if (pt.p.length > 2) inkShape(c, pt.p, fill, oo);
    else if (pt.p.length === 2) { c.beginPath(); c.moveTo(pt.p[0][0], pt.p[0][1]); c.lineTo(pt.p[1][0], pt.p[1][1]); c.lineWidth = lw * 1.6; c.strokeStyle = C.ink; c.stroke(); }
  });
  if (name === 'question') { c.restore(); disp(c, '?', x, y + s * .05, s * 1.3, C.cream); return; }
  c.restore();
}

const ICON_ART = {};                 // name -> { r: base rotation, fn: painter, pad: canvas radius in units }
const ICON_EXTRA = ['poison', 'stun', 'energy', 'deck', 'gem', 'key']; // new names (not in IC / ICON_ORDER)
const ICON_CACHE = new Map();
const ICON_STATS = { renders: 0, ms: 0 };
function iconCacheClear() { ICON_CACHE.clear(); }
function iconBucket(pr) { return pr <= 40 ? Math.max(6, Math.round(pr / 2) * 2) : pr <= 100 ? Math.round(pr / 4) * 4 : Math.min(240, Math.round(pr / 8) * 8); }

let iconRender; // assigned inside the painter closure

(function () {
  const TAU = Math.PI * 2, INK = '#15101c';
  // RoxorLoops & Jasmin sticker palette
  const K = {
    lime: '#6cc22e', limeL: '#a6e65a', limeD: '#3f8f1a', pink: '#f06aa0', pinkL: '#ff9cc6', pinkD: '#d63a82',
    cyan: '#3fd8e8', cyanD: '#1597b0', lav: '#b79ae8', sky: '#7fd0e8', yel: '#ffd23a', ora: '#ff8a2a',
    cream: '#fbf7ea', white: '#ffffff', steel: '#d6eef6', red: '#f2477c', skin: '#ffd2b8', hair: '#4a2c22', navy: '#2a3058'
  };
  let X = null, L = .07, HI = true, BIG = false, OV = {}, PB = 70, GRAIN = null;
  const col = (i, def) => (OV.col && i === (OV.ci || 0)) ? OV.col : def;

  // ---------- colour ----------
  function rgbOf(cl) {
    if (cl[0] === '#') { let h = cl.slice(1); if (h.length === 3) h = h.split('').map(q => q + q).join(''); const n = parseInt(h.slice(0, 6), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
    const m = cl.match(/[\d.]+/g); return m ? [+m[0], +m[1], +m[2]] : [128, 128, 128];
  }
  // mix colour a towards b by t (0..1), optional alpha
  function mx(a, b, t, al = 1) { const p = rgbOf(a), q = rgbOf(b); return `rgba(${(p[0] + (q[0] - p[0]) * t) | 0},${(p[1] + (q[1] - p[1]) * t) | 0},${(p[2] + (q[2] - p[2]) * t) | 0},${al})`; }
  const shade = (b, t = .26) => mx(b, '#3a1f5c', t);   // shadows lean violet (felt-marker look), never muddy black
  const lite = (b, t = .45, a = 1) => mx(b, '#ffffff', t, a);

  // light direction (unit vector pointing TOWARDS the light) in the current local frame,
  // so rotated icons (sword, axe...) still read as lit from the screen's upper-left
  function LD() {
    const m = X.getTransform(), det = (m.a * m.d - m.b * m.c) || 1, vx = -.6, vy = -.8;
    const lx = (m.d * vx - m.c * vy) / det, ly = (-m.b * vx + m.a * vy) / det, n = Math.hypot(lx, ly) || 1;
    return [lx / n, ly / n];
  }

  // ---------- grain (felt / risograph speckle) ----------
  let NOISE = null;
  function noiseCanvas() {
    if (NOISE) return NOISE;
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d');
    let sd = 12345; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 900; i++) { const a = r(); x.fillStyle = a < .5 ? 'rgba(255,255,255,.22)' : 'rgba(40,10,60,.13)'; x.fillRect((r() * 64) | 0, (r() * 64) | 0, 1, 1); }
    return (NOISE = cv);
  }

  // ---------- paths (call with nb=1 to append to the current path) ----------
  const P = pts => nb => { if (!nb) X.beginPath(); X.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) X.lineTo(pts[i][0], pts[i][1]); X.closePath(); };
  const S = pts => nb => { // smooth closed blob through edge midpoints
    if (!nb) X.beginPath(); const n = pts.length;
    X.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; X.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); }
    X.closePath();
  };
  // rounded polygon: every corner gets an arc (radius clamped so short edges never fold back)
  const RP = (pts, r) => nb => {
    if (!nb) X.beginPath(); const n = pts.length, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const s0 = mid(pts[n - 1], pts[0]); X.moveTo(s0[0], s0[1]);
    for (let i = 0; i < n; i++) {
      const a = pts[i], pm = mid(pts[(i + n - 1) % n], a), nm = mid(a, pts[(i + 1) % n]);
      const ux = pm[0] - a[0], uy = pm[1] - a[1], vx = nm[0] - a[0], vy = nm[1] - a[1], lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
      const th = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv || 1))));
      const rr = Math.min(Array.isArray(r) ? r[i] : r, Math.min(lu, lv) * Math.tan(th / 2) * .95);
      X.arcTo(a[0], a[1], nm[0], nm[1], Math.max(0, rr));
    }
    X.closePath();
  };
  const E = (cx, cy, rx, ry = rx, rot = 0) => nb => { if (!nb) X.beginPath(); X.moveTo(cx + Math.cos(rot) * rx, cy + Math.sin(rot) * rx); X.ellipse(cx, cy, rx, ry, rot, 0, TAU); X.closePath(); };
  const RR = (x, y, w, h, r) => nb => {
    if (!nb) X.beginPath(); r = Math.min(r, w / 2, h / 2);
    X.moveTo(x + r, y); X.arcTo(x + w, y, x + w, y + h, r); X.arcTo(x + w, y + h, x, y + h, r); X.arcTo(x, y + h, x, y, r); X.arcTo(x, y, x + w, y, r); X.closePath();
  };
  const F = fn => nb => { if (!nb) X.beginPath(); fn(); };
  const U = (...paths) => nb => { if (!nb) X.beginPath(); paths.forEach(p => p(1)); }; // union of sub-paths (same winding)
  const sx = (pts, k, ox = 0, oy = 0) => pts.map(q => [q[0] * k + ox, q[1] * k + oy]);
  const starPts = (n, ro, ri, cx = 0, cy = 0, rot = 0) => Array.from({ length: n * 2 }, (_, i) => { const a = rot + i * Math.PI / n, r = i % 2 ? ri : ro; return [cx + Math.sin(a) * r, cy - Math.cos(a) * r]; });
  const puffStar = (n, ro, ri, cx = 0, cy = 0, rot = 0) => RP(starPts(n, ro, ri, cx, cy, rot), Array.from({ length: n * 2 }, (_, i) => i % 2 ? ro * .3 : ro * .16));
  const heartPath = (k = 1, ox = 0, oy = 0) => F(() => {
    const h = (x, y) => [ox + x * k, oy + y * k], m = (x, y) => { const q = h(x, y); X.moveTo(q[0], q[1]); }, b = (a, c, d, e, f, g) => { const p1 = h(a, c), p2 = h(d, e), p3 = h(f, g); X.bezierCurveTo(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]); };
    m(0, .86); b(-.36, .62, -.92, .26, -.92, -.2); b(-.92, -.64, -.52, -.84, -.28, -.8); b(-.12, -.77, -.02, -.66, 0, -.5);
    b(.02, -.66, .12, -.77, .28, -.8); b(.52, -.84, .92, -.64, .92, -.2); b(.92, .26, .36, .62, 0, .86); X.closePath();
  });
  const dropPath = (k = 1, ox = 0, oy = 0) => F(() => {
    X.moveTo(ox, oy - .96 * k); X.bezierCurveTo(ox + .2 * k, oy - .6 * k, ox + .66 * k, oy - .2 * k, ox + .66 * k, oy + .3 * k);
    X.bezierCurveTo(ox + .66 * k, oy + .7 * k, ox + .36 * k, oy + .92 * k, ox, oy + .92 * k); X.bezierCurveTo(ox - .36 * k, oy + .92 * k, ox - .66 * k, oy + .7 * k, ox - .66 * k, oy + .3 * k);
    X.bezierCurveTo(ox - .66 * k, oy - .2 * k, ox - .2 * k, oy - .6 * k, ox, oy - .96 * k); X.closePath();
  });
  // speech bubble (rounded box + tail), mirrored with m=-1
  const bubble = (m = 1) => F(() => {
    X.moveTo(-.5 * m, -.7); X.lineTo(.5 * m, -.7); X.quadraticCurveTo(.94 * m, -.7, .94 * m, -.28); X.lineTo(.94 * m, .0); X.quadraticCurveTo(.94 * m, .4, .5 * m, .4);
    X.lineTo(.08 * m, .4); X.quadraticCurveTo(-.08 * m, .72, -.4 * m, .9); X.quadraticCurveTo(-.26 * m, .64, -.28 * m, .4); X.lineTo(-.5 * m, .4); X.quadraticCurveTo(-.94 * m, .4, -.94 * m, 0); X.lineTo(-.94 * m, -.28); X.quadraticCurveTo(-.94 * m, -.7, -.5 * m, -.7); X.closePath();
  });

  // ---------- the core sticker part ----------
  // under-outline (2x width, so a full uniform line shows outside) -> flat fill -> toon shade bands
  // (fill offset toward the light, leaving a crescent on the far side) -> light rim -> grain -> details
  function part(path, base, o = {}) {
    const lw = L * (o.lw || 1);
    X.lineJoin = 'round'; X.lineCap = 'round';
    if (o.outline !== false) { path(); X.lineWidth = lw * 2; X.strokeStyle = INK; X.stroke(); }
    path(); X.fillStyle = base; X.fill();
    X.save(); path(); X.clip();
    if (!o.flat) {
      const [lx, ly] = LD(), d = (o.d || 1) * (HI ? .11 : .15);
      path(); X.fillStyle = shade(base, HI ? .3 : .24); X.fill();
      if (HI) { X.save(); X.translate(lx * d * .42, ly * d * .42); path(); X.fillStyle = shade(base, .14); X.fill(); X.restore(); }
      X.save(); X.translate(lx * d, ly * d); path(); X.fillStyle = base; X.fill(); X.restore();
      if (HI && o.rim !== 0) { X.save(); X.translate(-lx * d * .45, -ly * d * .45); path(); X.lineWidth = d * .9; X.strokeStyle = lite(base, .5, o.rim || .6); X.stroke(); X.restore(); }
      if (HI && GRAIN && o.grain !== false) { X.fillStyle = GRAIN; X.fillRect(-4, -4, 8, 8); }
    }
    if (o.in) o.in();
    X.restore();
  }
  function fillP(path, cl) { path(); X.fillStyle = cl; X.fill(); }
  function sline(pts, w, cl = INK, cap = 'round') {
    X.beginPath(); X.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) X.lineTo(pts[i][0], pts[i][1]);
    X.lineWidth = w; X.strokeStyle = cl; X.lineCap = cap; X.lineJoin = 'round'; X.stroke();
  }
  function curve(pts, w, cl = INK) { // smooth open polyline
    X.beginPath(); X.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) X.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
    const z = pts[pts.length - 1]; X.lineTo(z[0], z[1]); X.lineWidth = w; X.strokeStyle = cl; X.lineCap = 'round'; X.lineJoin = 'round'; X.stroke();
  }
  // inked open stroke (outline + colour core), e.g. thread, headphone band
  function tube(pts, w, cl) { curve(pts, w + L * 2, INK); curve(pts, w, cl); }
  // the one big crisp vinyl highlight blob
  function hl(x, y, rx, ry, rot = -.6, a = .92) { X.save(); X.translate(x, y); X.rotate(rot); X.beginPath(); X.ellipse(0, 0, rx, ry, 0, 0, TAU); X.fillStyle = `rgba(255,255,255,${a})`; X.fill(); X.restore(); }
  function dot(x, y, r, cl = '#fff') { if (!HI) return; X.beginPath(); X.arc(x, y, r, 0, TAU); X.fillStyle = cl; X.fill(); }
  // four-point sparkle; inked=true for sparkles that float outside a shape
  function spark(x, y, r, cl = '#fff', inked = false) {
    const pth = () => { X.beginPath(); X.moveTo(x, y - r); X.quadraticCurveTo(x + r * .14, y - r * .14, x + r * .8, y); X.quadraticCurveTo(x + r * .14, y + r * .14, x, y + r); X.quadraticCurveTo(x - r * .14, y + r * .14, x - r * .8, y); X.quadraticCurveTo(x - r * .14, y - r * .14, x, y - r); X.closePath(); };
    if (inked) { pth(); X.lineWidth = L * 1.6; X.lineJoin = 'round'; X.strokeStyle = INK; X.stroke(); }
    pth(); X.fillStyle = cl; X.fill();
  }
  // ---- doodle flourishes (big icons only) ----
  function dnote(x, y, k = 1) {
    if (!BIG) return;
    X.save(); X.translate(x, y); X.scale(k, k);
    sline([[.07, 0], [.07, -.36], [.24, -.28]], L * 1.25 / k);
    X.beginPath(); X.ellipse(0, 0, .1, .075, -.45, 0, TAU); X.fillStyle = INK; X.fill();
    X.restore();
  }
  function dstar(x, y, r, cl = K.yel) { if (!BIG) return; part(puffStar(5, r, r * .48, x, y), cl, { lw: .7, flat: true }); }
  function dheart(x, y, r, cl = K.pink) { if (!BIG) return; part(heartPath(r, x, y), cl, { lw: .7, flat: true }); }
  function dashes(list) { if (!BIG) return; for (const q of list) sline([[q[0], q[1]], [q[2], q[3]]], L * 1.1); }
  // kawaii face (dot eyes + smile + blush)
  function face(cx, cy, k = 1, blush = true) {
    if (!HI) return;
    for (const s of [-1, 1]) { X.beginPath(); X.ellipse(cx + s * .17 * k, cy, .055 * k, .07 * k, 0, 0, TAU); X.fillStyle = INK; X.fill(); dot(cx + s * .17 * k - .015 * k, cy - .025 * k, .02 * k); }
    curve([[cx - .08 * k, cy + .1 * k], [cx, cy + .17 * k], [cx + .08 * k, cy + .1 * k]], L * .8);
    if (blush) for (const s of [-1, 1]) { X.beginPath(); X.ellipse(cx + s * .3 * k, cy + .1 * k, .07 * k, .04 * k, 0, 0, TAU); X.fillStyle = 'rgba(255,110,160,.75)'; X.fill(); }
  }
  function card(x, y, w, h, base, rot, deco) {
    X.save(); X.translate(x, y); X.rotate(rot);
    part(RR(-w / 2, -h / 2, w, h, w * .2), base, {
      in() {
        if (HI) { X.lineWidth = L * .8; X.strokeStyle = 'rgba(255,255,255,.85)'; RR(-w / 2 + w * .12, -h / 2 + w * .12, w * .76, h - w * .24, w * .12)(); X.stroke(); }
        if (deco) deco(w, h);
        hl(-w * .22, -h * .32, w * .12, h * .06, -.5, .85);
      }
    });
    X.restore();
  }
  const def = (name, r, fn, pad) => { ICON_ART[name] = { r, fn, pad: pad || 1.18 }; };

  // ================= WEAPONS =================
  def('sword', .78, () => {
    const bc = col(0, K.steel);
    part(RP([[-.2, .44], [-.2, -.52], [0, -.98], [.2, -.52], [.2, .44]], .12), bc, {
      in() { sline([[.03, .38], [.03, -.6]], .07, shade(bc, .12)); hl(-.095, -.18, .045, .34, 0); dot(-.08, -.7, .04); }
    });
    part(RR(-.1, .5, .2, .34, .08), col(2, K.lav), { in() { if (HI) for (const y of [.58, .7]) sline([[-.1, y], [.1, y + .05]], L * .8, shade(K.lav, .45)); } });
    part(RR(-.54, .34, 1.08, .22, .11), col(1, K.pink), { in() { hl(-.3, .4, .15, .035, 0, .85); } });
    part(heartPath(.13, 0, .45), K.yel, { lw: .7, flat: true });
    part(E(0, .93, .14), K.yel, { in() { hl(-.045, .885, .05, .03, -.5); } });
    if (BIG) { spark(.4, -.62, .16, '#fff', true); dstar(-.42, -.3, .1, K.cyan); }
  });
  def('dagger', .78, () => {
    const bc = col(0, K.steel);
    part(RP([[-.2, .28], [-.2, -.26], [0, -.8], [.2, -.26], [.2, .28]], .12), bc, {
      in() { hl(-.09, -.14, .045, .22, 0); dot(-.06, -.5, .035); }
    });
    part(RR(-.11, .4, .22, .34, .09), K.pink, { in() { if (HI) sline([[-.11, .54], [.11, .58]], L * .8, shade(K.pink, .45)); } });
    part(RR(-.4, .22, .8, .22, .11), col(1, K.lime), { in() { hl(-.22, .28, .12, .035, 0, .85); } });
    part(E(0, .84, .14), K.cyan, { in() { hl(-.045, .8, .05, .03); } });
    if (BIG) spark(.36, -.5, .15, '#fff', true);
  });
  def('axe', .6, () => {
    part(RR(-.1, -.9, .2, 1.82, .1), col(0, K.ora), { in() { hl(-.04, -.2, .025, .3, 0, .7); } });
    part(RR(-.12, .48, .24, .4, .12), K.pink, { in() { if (HI) for (const y of [.58, .7]) sline([[-.12, y], [.12, y + .05]], L * .8, shade(K.pink, .45)); } });
    part(RP([[-.06, -.7], [-.4, -.52], [-.06, -.34]], .08), K.steel);
    const hc = col(1, K.steel);
    part(F(() => { X.moveTo(.02, -.76); X.quadraticCurveTo(.3, -.8, .58, -1.02); X.quadraticCurveTo(1.0, -.46, .58, .16); X.quadraticCurveTo(.3, -.06, .02, -.12); X.closePath(); }), hc, {
      in() { curve([[.64, -.88], [.8, -.6], [.8, -.32]], .07, 'rgba(255,255,255,.92)'); dot(.7, -.08, .04); if (HI) curve([[.5, -.86], [.66, -.6], [.68, -.28], [.52, .04]], L * .8, shade(hc, .3)); }
    });
    part(RR(-.15, -.74, .3, .16, .08), K.yel); part(RR(-.15, -.2, .3, .16, .08), K.yel);
    if (BIG) dstar(.5, .45, .12, K.lime);
  });
  def('hammer', .6, () => {
    part(RR(-.1, -.42, .2, 1.36, .1), col(0, K.yel), { in() { hl(-.04, .1, .025, .25, 0, .7); } });
    part(RR(-.12, .5, .24, .4, .12), K.lime, { in() { if (HI) for (const y of [.6, .72]) sline([[-.12, y], [.12, y + .05]], L * .8, shade(K.lime, .45)); } });
    const hc = col(1, K.lav);
    part(RR(-.56, -.98, 1.12, .6, .2), hc, { in() { hl(-.26, -.86, .2, .055, 0); dot(.16, -.88, .035); } });
    part(RR(-.76, -1.0, .26, .64, .12), K.pink, { in() { hl(-.68, -.86, .035, .1, 0, .8); } });
    part(RR(.5, -1.0, .26, .64, .12), K.pink);
    if (HI) part(puffStar(5, .14, .07, 0, -.66), K.yel, { lw: .6, flat: true });
  });
  def('shield', 0, () => {
    const out = [[0, -.96], [.44, -.88], [.8, -.76], [.8, -.18], [.68, .3], [.38, .68], [0, .98], [-.38, .68], [-.68, .3], [-.8, -.18], [-.8, -.76], [-.44, -.88]];
    part(S(out), col(1, K.cyan), { in() { hl(-.5, -.62, .14, .06, -.3); } });
    part(S(sx(out, .72, 0, -.04)), col(0, K.pink), { in() { hl(-.3, -.48, .14, .07, -.5); dot(-.48, -.3, .04); } });
    part(puffStar(5, .32, .15, 0, -.06), K.yel, { lw: .8, in() { hl(-.07, -.17, .06, .035, -.5, .8); } });
    if (BIG) spark(.62, -.98, .14, '#fff', true);
  });
  def('fist', 0, () => {
    const g = col(0, K.red);
    part(RR(-.44, .32, .88, .58, .16), K.cream, {
      in() { fillP(RR(-.5, .5, 1, .14, 0), K.lime); hl(-.26, .42, .12, .04, 0, .8); }
    });
    part(S([[-.66, -.24], [-.5, -.74], [0, -.9], [.5, -.8], [.76, -.4], [.72, .1], [.46, .44], [-.44, .44], [-.7, .12]]), g, {
      in() { if (HI) curve([[-.26, -.38], [.08, -.5], [.46, -.38]], L * .8, shade(g, .35)); hl(-.28, -.62, .2, .08, -.35); dot(.08, -.72, .045); }
    });
    part(S([[-.74, -.08], [-.44, -.22], [-.06, -.06], [-.04, .18], [-.38, .26], [-.74, .16]]), g, { d: .7, in() { hl(-.48, -.1, .1, .035, -.15, .8); } });
    dashes([[.86, -.62, 1.02, -.76], [.94, -.28, 1.12, -.3], [.88, .06, 1.04, .14]]);
  }, 1.22);

  // ================= ELEMENTS / FX =================
  def('bolt', 0, () => {
    const pts = [[.26, -.98], [-.56, .12], [-.04, .12], [-.28, .98], [.6, -.22], [.08, -.22]];
    part(RP(pts, .07), col(0, K.yel), { in() { hl(-.02, -.44, .05, .2, .62); dot(-.2, .34, .04); } });
    dashes([[.62, -.66, .8, -.78], [-.64, .5, -.82, .6]]);
    if (BIG) spark(.62, .4, .14, '#fff', true);
  });
  def('drop', 0, () => {
    part(dropPath(1, 0, .02), col(0, K.red), { in() { hl(-.3, .16, .1, .26, .3); dot(-.14, -.4, .055); } });
    if (BIG) dheart(.62, -.6, .14, K.pinkL);
  });
  def('heart', 0, () => {
    part(heartPath(1, 0, .02), col(0, K.pink), { in() { hl(-.48, -.34, .2, .1, -.65); dot(-.2, -.56, .055); } });
    if (BIG) { spark(.78, -.72, .16, '#fff', true); dnote(-.86, .56, .9); }
  });
  def('fire', 0, () => {
    const outer = [[0, -1], [.22, -.6], [.5, -.62], [.44, -.24], [.76, .04], [.7, .6], [.36, .92], [-.36, .92], [-.7, .6], [-.74, .06], [-.46, -.2], [-.56, -.66], [-.2, -.42]];
    const fc = col(0, K.ora);
    part(S(outer), fc, {
      in() {
        part(S([[0, -.32], [.22, 0], [.42, .3], [.34, .72], [0, .86], [-.34, .72], [-.4, .3], [-.18, .04]]), col(1, K.yel), { lw: .6, d: .6 });
        hl(-.34, -.06, .06, .16, .4); face(0, .48, .8, false);
      }
    });
    if (BIG) { dstar(.74, -.66, .1, K.yel); spark(-.74, -.5, .12, '#fff', true); }
  });
  def('smoke', 0, () => {
    const cl = col(0, '#d6cdf0');
    part(E(.62, .74, .16), cl, { rim: 0, d: .5 }); part(E(.86, .48, .09), cl, { rim: 0, d: .4, flat: !HI });
    const cloud = U(E(-.56, .14, .3), E(.56, .12, .32), E(-.24, -.26, .38), E(.24, -.4, .36), RR(-.84, -.04, 1.7, .5, .25));
    part(cloud, cl, { rim: 0, in() { hl(-.3, -.44, .16, .07, -.5); dot(.1, -.6, .04); if (HI) { curve([[-.5, .18], [-.36, .1]], L * .8, shade(cl, .4)); curve([[.18, .06], [.34, -.02]], L * .8, shade(cl, .4)); } } });
    if (BIG) { curve([[-.9, -.62], [-.72, -.78], [-.56, -.7]], L * 1.1); curve([[.66, -.86], [.84, -.82], [.86, -.66]], L * 1.1); }
  });
  def('dust', 0, () => {
    const cl = col(0, '#f4e2b0');
    part(E(-.38, -.3, .3), cl, { rim: 0, in() { hl(-.48, -.42, .1, .05, -.5); } });
    part(E(.36, -.08, .34), cl, { rim: 0, in() { hl(.25, -.22, .11, .05, -.5); } });
    part(E(-.08, .4, .4), cl, { rim: 0, in() { hl(-.22, .24, .13, .06, -.5); } });
    dashes([[-.9, .12, -.68, .02], [.66, .5, .9, .44], [.6, .72, .8, .76]]);
    if (BIG) { spark(.62, -.68, .12, '#fff', true); spark(-.76, .62, .1, '#fff', true); }
  });
  def('quake', 0, () => {
    const gc = col(0, '#e0a070');
    part(RP([[-.96, .2], [-.6, .12], [-.38, .04], [-.18, .3], [.2, -.06], [.5, .26], [.96, .12], [.96, .86], [-.96, .86]], .1), gc, {
      in() { fillP(RP([[-.96, .2], [-.6, .12], [-.38, .04], [-.18, .3], [.2, -.06], [.5, .26], [.96, .12], [.96, .34], [-.96, .4]], .06), K.lime);
        sline([[-.18, .3], [-.06, .5], [-.18, .66], [-.1, .9]], L * 1.2); sline([[.5, .26], [.42, .5], [.54, .7]], L * 1.2); hl(-.7, .52, .12, .04, 0, .7); }
    });
    part(RP([[.04, -.96], [.2, -.4], [.42, -.44], [.08, .06], [-.12, -.08], [-.04, -.46], [-.3, -.42]], .05), col(1, K.yel), { lw: .9, in() { hl(.02, -.6, .03, .12, .3); } });
    dashes([[-.66, -.4, -.86, -.5], [-.6, -.18, -.84, -.18], [.62, -.46, .84, -.56], [.6, -.22, .86, -.22]]);
  }, 1.2);

  // ================= COINS, ORBS, BADGES =================
  def('coin', 0, () => {
    const g = col(0, K.yel);
    part(E(0, 0, .86), g, {
      in() {
        X.lineWidth = .07; X.strokeStyle = shade(g, .32); X.beginPath(); X.arc(.02, .03, .66, 0, TAU); X.stroke();
        part(puffStar(5, .46, .22, 0, .02), lite(g, .35), { lw: .7, d: .7 });
        hl(-.42, -.48, .2, .08, -.75); dot(-.12, -.68, .045);
      }
    });
    if (BIG) spark(.78, -.7, .15, '#fff', true);
  });
  def('crack', 0, () => {
    part(E(0, 0, .84), col(0, K.ora), {
      in() {
        const cr = [[-.1, -.9], [.15, -.3], [-.2, 0], [.2, .4], [0, .9], [-.05, .4], [-.4, 0], [-.05, -.3]];
        fillP(P(cr), INK);
        if (HI) { sline([[.15, -.3], [.5, -.42]], L * 1.1); sline([[-.2, 0], [-.55, .2]], L * 1.1); sline([[.2, .4], [.5, .5]], L); }
        hl(-.46, -.4, .14, .07, -.7);
      }
    });
  });
  def('curse', 0, () => {
    const b = col(0, K.lav);
    part(E(0, 0, .84), b, {
      in() {
        X.beginPath(); for (let t = 0; t <= 1; t += .02) { const a = t * 10.5, r = .06 + t * .54; X[t ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
        X.lineWidth = HI ? L * 1.3 : L * 1.6; X.strokeStyle = shade(b, .7); X.lineCap = 'round'; X.stroke();
        hl(-.44, -.44, .16, .07, -.7); dot(-.18, -.64, .04);
      }
    });
    if (BIG) { dstar(.74, -.7, .12, K.pink); dstar(-.76, .66, .09, K.pink); }
  });
  def('graft', 0, () => {
    part(E(0, 0, .86), col(1, K.lime), { in() { hl(-.5, -.48, .12, .05, -.75); } });
    part(E(0, 0, .6), col(0, K.cyan), {
      in() { sline([[-.3, 0], [-.07, .24], [.32, -.24]], .2); sline([[-.3, 0], [-.07, .24], [.32, -.24]], .09, '#fff'); hl(-.28, -.32, .1, .045, -.7); }
    });
    if (HI) for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + .3; X.beginPath(); X.arc(Math.cos(a) * .73, Math.sin(a) * .73, .045, 0, TAU); X.fillStyle = lite(K.lime, .6); X.fill(); }
  });
  def('ap', 0, () => {
    const g = col(0, K.yel);
    part(puffStar(8, .96, .62), g, { in() { hl(-.4, -.44, .14, .06, -.75); } });
    part(E(0, 0, .38), K.cream, { lw: .8, in() { fillP(heartPath(.2, 0, .02), K.pink); } });
  });
  def('star', 0, () => {
    const g = col(0, K.yel);
    part(puffStar(5, .98, .46, 0, .04), g, { in() { hl(-.24, -.36, .13, .06, -.9); face(0, .1, .9); } });
    if (BIG) { spark(.78, -.74, .14, '#fff', true); dnote(-.82, -.5, .85); }
  });
  def('plus', 0, () => {
    const p = [[-.28, -.84], [.28, -.84], [.28, -.28], [.84, -.28], [.84, .28], [.28, .28], [.28, .84], [-.28, .84], [-.28, .28], [-.84, .28], [-.84, -.28], [-.28, -.28]];
    part(RP(p, [.14, .14, .08, .14, .14, .08, .14, .14, .08, .14, .14, .08]), col(0, K.lime), { in() { hl(-.08, -.56, .06, .16, 0); dot(-.6, -.08, .04); } });
    if (BIG) spark(.66, -.68, .14, '#fff', true);
  });
  const arrow = (dir, base) => () => {
    const k = dir;
    const p = [[0, -.94 * k], [.86, -.04 * k], [.34, -.04 * k], [.34, .84 * k], [-.34, .84 * k], [-.34, -.04 * k], [-.86, -.04 * k]];
    part(RP(p, [.14, .12, .06, .12, .12, .06, .12]), base, { in() { hl(-.14, (k > 0 ? .3 : -.4), .05, .2, 0); dot(-.36, -.22 * k, .04); } });
  };
  def('up', 0, () => arrow(1, col(0, K.lime))());
  def('down', 0, () => arrow(-1, col(0, K.pink))());
  def('question', 0, () => {
    part(E(0, 0, .86), col(0, K.lav), {
      in() {
        const q = () => { X.beginPath(); X.arc(0, -.2, .27, Math.PI * 1.05, Math.PI * 2.3); X.quadraticCurveTo(0, .02, 0, .2); };
        q(); X.lineWidth = .3; X.strokeStyle = INK; X.lineCap = 'round'; X.stroke();
        q(); X.lineWidth = .16; X.strokeStyle = K.yel; X.stroke();
        X.beginPath(); X.arc(0, .5, .14, 0, TAU); X.fillStyle = INK; X.fill(); X.beginPath(); X.arc(0, .5, .07, 0, TAU); X.fillStyle = K.yel; X.fill();
        hl(-.48, -.42, .14, .06, -.75);
      }
    });
  });

  // ================= BODY / FACES =================
  def('skull', 0, () => {
    const bone = col(0, K.cream);
    if (HI) tube([[-.82, -.06], [-.86, -.66], [-.46, -1.04], [0, -1.12], [.46, -1.04], [.86, -.66], [.82, -.06]], .13, K.pink);
    part(RR(-.36, .2, .72, .62, .22), bone, {
      in() { sline([[-.3, .46], [.3, .46]], L * .9); for (const x of [-.14, 0, .14]) sline([[x, .36], [x, .58]], L * .8); }
    });
    part(S([[0, -.94], [.64, -.76], [.84, -.2], [.66, .3], [.3, .46], [-.3, .46], [-.66, .3], [-.84, -.2], [-.64, -.76]]), bone, {
      in() {
        for (const m of [-1, 1]) { fillP(E(.3 * m, -.14, .21, .23), INK); dot(.3 * m - .07, -.22, .07); dot(.3 * m + .07, -.06, .03); }
        fillP(heartPath(.1, 0, .18), INK);
        hl(-.36, -.62, .2, .07, -.4);
        if (HI) for (const m of [-1, 1]) { X.beginPath(); X.ellipse(.54 * m, .12, .08, .045, 0, 0, TAU); X.fillStyle = 'rgba(255,110,160,.7)'; X.fill(); }
      }
    });
    if (HI) for (const m of [-1, 1]) part(RR(m < 0 ? -1.0 : .74, -.42, .26, .5, .12), K.cyan, { lw: .9, in() { hl(.87 * m - .04, -.3, .03, .08, 0, .8); } });
  }, 1.28);
  def('eye', 0, () => {
    const lid = F(() => { X.moveTo(-.96, 0); X.quadraticCurveTo(0, -.9, .96, 0); X.quadraticCurveTo(0, .9, -.96, 0); X.closePath(); });
    part(lid, col(0, K.white), {
      in() {
        part(E(0, 0, .42, .44), col(1, K.cyan), { lw: .8, d: .8, in() { fillP(E(0, .02, .19, .21), INK); hl(-.14, -.16, .1, .08, -.5, .95); dot(.13, .14, .05); } });
      }
    });
    if (HI) for (const a of [-.5, -.17, .17, .5]) sline([[a * .9, -.44 + Math.abs(a) * .28], [a * 1.15, -.68 + Math.abs(a) * .34]], L * 1.2);
    if (BIG) spark(.84, -.6, .14, '#fff', true);
  });
  def('mouth', 0, () => {
    part(bubble(1), col(0, K.cream), {
      in() {
        const m = F(() => { X.moveTo(-.54, -.36); X.quadraticCurveTo(0, -.46, .54, -.36); X.quadraticCurveTo(.5, .22, 0, .26); X.quadraticCurveTo(-.5, .22, -.54, -.36); X.closePath(); });
        part(m, INK, {
          flat: true, lw: .6, in() {
            fillP(E(0, .26, .3, .16), K.pink);
            fillP(RR(-.5, -.5, 1, .2, .04), '#fff'); if (HI) for (const x of [-.25, 0, .25]) sline([[x, -.36], [x, -.26]], L * .6);
          }
        });
        hl(-.6, -.54, .14, .05, -.2);
      }
    });
  });
  def('talk', 0, () => {
    const b = col(0, K.yel);
    part(bubble(-1), b, {
      in() { for (const x of [-.44, 0, .44]) { X.beginPath(); X.arc(x, -.14, .13, 0, TAU); X.fillStyle = INK; X.fill(); } hl(.56, -.52, .14, .05, .2); }
    });
    if (BIG) dnote(-.78, -.82, .8);
  }, 1.22);
  def('mask', 0, () => {
    const mc = col(0, K.pink);
    if (HI) { part(E(-.56, -.66, .12, .3, -.5), K.lime, { lw: .8 }); part(E(-.3, -.74, .1, .28, -.15), K.cyan, { lw: .8 }); }
    const m = [[-.94, -.34], [-.5, -.52], [0, -.38], [.5, -.52], [.94, -.34], [.86, .14], [.52, .36], [.18, .26], [0, .1], [-.18, .26], [-.52, .36], [-.86, .14]];
    part(S(m), mc, {
      in() {
        for (const s of [-1, 1]) { fillP(S([[.66 * s, -.1], [.46 * s, -.28], [.16 * s, -.16], [.2 * s, .0], [.44 * s, .06]]), INK); dot(.4 * s - .06, -.14, .045); }
        hl(-.62, -.34, .14, .05, -.25);
      }
    });
    part(heartPath(.13, 0, -.4), K.yel, { lw: .7, flat: true });
  });
  def('body', 0, () => {
    const hood = col(1, K.cyan), skin = col(0, K.skin);
    part(S([[-.78, .96], [-.76, .1], [-.46, -.18], [.46, -.18], [.76, .1], [.78, .96]]), hood, {
      in() {
        if (HI) { fillP(E(-.4, .5, .2, .14, .4), 'rgba(183,154,232,.8)'); fillP(E(.42, .2, .16, .12, -.3), 'rgba(183,154,232,.8)'); fillP(E(.3, .76, .14, .1), 'rgba(255,255,255,.6)'); }
        part(E(0, .44, .2), K.yel, { lw: .6, flat: true, in() { if (HI) { dot(-.07, .4, .03, INK); dot(.07, .4, .03, INK); curve([[-.09, .5], [0, .56], [.09, .5]], L * .6); } } });
        hl(-.5, .06, .12, .05, -.4);
      }
    });
    part(E(0, -.5, .34, .34), skin, {
      in() { if (HI) { for (const s of [-1, 1]) fillP(E(.13 * s, -.48, .04, .055), INK); fillP(E(-.22, -.38, .05, .03), 'rgba(255,110,160,.7)'); fillP(E(.22, -.38, .05, .03), 'rgba(255,110,160,.7)'); } hl(-.14, -.66, .08, .04, -.5); }
    });
    part(RP([[-.14, -.74], [-.2, -.98], [-.04, -.84], [0, -1.06], [.08, -.84], [.22, -.98], [.16, -.72]], .03), K.hair, { lw: .8, rim: 0 });
  }, 1.24);
  def('thorn', 0, () => {
    const g = col(0, K.lime);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU - Math.PI / 2, p = (an, r) => [Math.cos(an) * r, Math.sin(an) * r];
      part(RP([p(a - .34, .46), p(a, 1.0), p(a + .34, .46)], [.06, .05, .06]), K.limeD, { lw: .9, rim: 0 });
    }
    part(F(() => { X.arc(0, 0, .6, 0, TAU); X.moveTo(.3, 0); X.arc(0, 0, .3, 0, TAU, true); }), g, {
      in() { hl(-.34, -.36, .14, .05, -.75); if (HI) for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; curve([[Math.cos(a) * .32, Math.sin(a) * .32], [Math.cos(a + .35) * .46, Math.sin(a + .35) * .46], [Math.cos(a + .6) * .58, Math.sin(a + .6) * .58]], L * .7, shade(g, .4)); } }
    });
    if (HI) part(E(.42, -.42, .12, .07, .7), K.limeL, { lw: .6, flat: true });
    if (BIG) dstar(.62, .62, .1, K.pink);
  });
  def('boot', 0, () => {
    const bc = col(0, K.pink);
    part(S([[-.42, -.86], [.2, -.86], [.18, -.2], [.26, .06], [.62, .14], [.88, .4], [.88, .66], [-.48, .66], [-.5, .1], [-.44, -.3]]), bc, {
      in() {
        if (HI) for (const y of [-.6, -.38, -.16]) sline([[-.2, y], [.06, y + .06]], L * .9, '#fff');
        part(puffStar(5, .14, .07, -.18, .28), K.yel, { lw: .6, flat: true });
        hl(-.3, -.6, .05, .18, 0);
      }
    });
    part(RR(-.48, -.94, .72, .2, .1), K.cyan);
    part(RR(-.56, .58, 1.5, .3, .15), col(1, K.white), { in() { if (HI) sline([[-.5, .74], [.88, .74]], L * .8, K.lime); } });
    if (BIG) dashes([[-.72, -.2, -.92, -.2], [-.74, .1, -.94, .14]]);
  });

  // ================= OBJECTS =================
  def('cards', 0, () => {
    card(-.28, .04, .76, 1.14, col(0, K.lime), -.3, (w, h) => { if (HI) part(puffStar(5, .17, .08), K.yel, { lw: .6, flat: true }); });
    card(.24, -.02, .76, 1.14, col(1, K.pink), .14, () => { part(heartPath(.24, 0, .02), K.white, { lw: .7, flat: true }); });
  });
  def('deck', 0, () => {
    const cls = [K.cyan, K.lav, col(0, K.pink)];
    for (let i = 2; i >= 0; i--) card(-.14 + i * .14, .1 - i * .1, .9, 1.3, cls[2 - i], -.1 + i * .07, (w, h) => {
      if (!i) part(puffStar(5, .22, .1), K.yel, { lw: .7, flat: true });
    });
  });
  def('clock', 0, () => {
    const body = col(1, K.pink);
    for (const s of [-1, 1]) part(E(.5 * s, -.72, .24, .2, .5 * s), K.yel, { lw: .9 });
    if (HI) for (const s of [-1, 1]) sline([[.46 * s, .6], [.6 * s, .9]], .12 + L * 2), sline([[.46 * s, .6], [.6 * s, .9]], .12, body);
    part(E(0, .04, .82), body, { in() { hl(-.52, -.42, .12, .05, -.75); } });
    part(E(0, .04, .6), col(0, K.cream), {
      lw: .8, in() {
        if (HI) for (let i = 0; i < 12; i += 3) { const a = i / 12 * TAU; X.beginPath(); X.arc(Math.cos(a) * .47, .04 + Math.sin(a) * .47, .045, 0, TAU); X.fillStyle = K.lav; X.fill(); }
        sline([[0, .04], [0, -.36]], .1); sline([[0, .04], [.3, .16]], .1);
        X.beginPath(); X.arc(0, .04, .07, 0, TAU); X.fillStyle = K.pink; X.fill();
      }
    });
  });
  def('compass', 0, () => {
    part(E(0, 0, .88), K.yel, { in() { hl(-.54, -.44, .12, .05, -.75); } });
    part(E(0, 0, .68), col(0, K.cream), {
      lw: .8, in() {
        if (HI) for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; sline([[Math.cos(a) * .5, Math.sin(a) * .5], [Math.cos(a) * .6, Math.sin(a) * .6]], L * 1.1); }
      }
    });
    part(RP([[0, -.64], [.2, 0], [-.2, 0]], .05), col(1, K.pink), { lw: .8, d: .6, in() { hl(-.05, -.26, .03, .1, .2, .8); } });
    part(RP([[0, .64], [.2, 0], [-.2, 0]], .05), col(2, K.cyan), { lw: .8, d: .6 });
    X.beginPath(); X.arc(0, 0, .08, 0, TAU); X.fillStyle = INK; X.fill();
  });
  def('bottle', .3, () => {
    const glass = col(0, K.sky);
    const body = F(() => { X.moveTo(-.17, -.78); X.lineTo(.17, -.78); X.lineTo(.17, -.48); X.quadraticCurveTo(.52, -.32, .52, .04); X.lineTo(.52, .74); X.quadraticCurveTo(.52, .92, .34, .92); X.lineTo(-.34, .92); X.quadraticCurveTo(-.52, .92, -.52, .74); X.lineTo(-.52, .04); X.quadraticCurveTo(-.52, -.32, -.17, -.48); X.closePath(); });
    part(body, glass, {
      in() {
        const liq = col(1, K.yel);
        part(RR(-.6, -.06, 1.2, 1.2, .02), liq, { outline: false, grain: false });
        sline([[-.6, -.06], [.6, -.06]], L * .9);
        fillP(RR(-.52, .22, 1.04, .3, 0), K.pink);
        part(heartPath(.1, 0, .37), K.white, { lw: .5, flat: true });
        if (HI) for (const q of [[.2, .7, .05], [.3, .08, .035], [-.16, .64, .03]]) { X.lineWidth = L * .6; X.strokeStyle = '#fff'; X.beginPath(); X.arc(q[0], q[1], q[2], 0, TAU); X.stroke(); }
        hl(-.34, -.06, .05, .3, 0); dot(-.06, -.66, .03);
      }
    });
    part(RR(-.22, -1.0, .44, .24, .08), K.pink);
  });
  def('needle', .78, () => {
    if (HI) tube([[0, .66], [.3, .78], [.34, .54], [.1, .44], [-.24, .54], [-.36, .78], [-.18, .96]], .08, col(1, K.pink));
    const sh = F(() => { X.moveTo(0, -.98); X.quadraticCurveTo(.12, -.6, .12, -.3); X.lineTo(.12, .74); X.quadraticCurveTo(.12, .88, 0, .88); X.quadraticCurveTo(-.12, .88, -.12, .74); X.lineTo(-.12, -.3); X.quadraticCurveTo(-.12, -.6, 0, -.98); X.closePath(); });
    part(sh, col(0, K.steel), { in() { hl(-.05, -.1, .025, .4, 0); fillP(E(0, .64, .045, .13), INK); } });
    if (!HI) tube([[0, .66], [.3, .7]], .08, col(1, K.pink));
    if (BIG) spark(.32, -.6, .14, '#fff', true);
  });
  def('gear', 0, () => {
    const n = 8, pts = [], base = col(0, K.sky);
    for (let i = 0; i < n; i++) { const a = i / n * TAU, w = TAU / n; pts.push([Math.cos(a - w * .5) * .68, Math.sin(a - w * .5) * .68], [Math.cos(a - w * .22) * .94, Math.sin(a - w * .22) * .94], [Math.cos(a + w * .22) * .94, Math.sin(a + w * .22) * .94], [Math.cos(a + w * .5) * .68, Math.sin(a + w * .5) * .68]); }
    part(RP(pts, .07), base, { in() { hl(-.4, -.44, .16, .06, -.75); } });
    part(E(0, 0, .32), col(1, K.cream), { lw: .8, d: .6, in() { fillP(E(0, 0, .14), INK); } });
  });
  def('tent', 0, () => {
    const tc = col(0, K.pink);
    sline([[0, -.8], [0, -1.04]], L * 2 + .06); sline([[0, -.8], [0, -1.04]], .06, K.yel);
    part(RP([[0, -1.06], [.3, -.96], [0, -.86]], .03), K.lime, { lw: .7, flat: true });
    const shape = RP([[0, -.86], [.94, .72], [-.94, .72]], [.08, .1, .1]);
    part(shape, K.cream, {
      in() {
        for (const s of [-.62, -.2, .2, .62]) fillP(P([[0, -.86], [s * 1.1 - .12, .8], [s * 1.1 + .12, .8]]), tc);
        fillP(RR(-1, .54, 2, .2, 0), K.cyan);
        hl(-.3, -.2, .04, .2, .55);
      }
    });
    part(RP([[0, .06], [.3, .72], [-.3, .72]], .04), INK, { flat: true, lw: .6 });
    if (BIG) { dstar(-.74, -.5, .1); dstar(.76, -.38, .08, K.cyan); }
  });
  def('anvil', 0, () => {
    const p = [[-.96, -.54], [.92, -.54], [.88, -.34], [.42, -.16], [.32, .04], [.44, .5], [.74, .6], [.74, .84], [-.74, .84], [-.74, .6], [-.44, .5], [-.32, .04], [-.44, -.16], [-.7, -.26]];
    part(RP(p, .08), col(0, '#a8b2d8'), { in() { hl(-.4, -.44, .26, .045, 0); dot(.44, -.44, .035); fillP(RR(-.74, .6, 1.48, .08, 0), lite('#a8b2d8', .3)); } });
    if (BIG) { spark(.62, -.86, .14, K.yel, true); spark(.86, -.66, .09, '#fff', true); }
  });
  def('chest', 0, () => {
    const wood = col(0, K.ora), lidC = col(1, K.pink);
    part(RR(-.86, -.3, 1.72, 1.04, .14), wood, { in() { sline([[-.86, .2], [.86, .2]], L * .8, shade(wood, .4)); hl(-.6, -.1, .12, .04, 0, .7); } });
    part(F(() => { X.moveTo(-.86, -.26); X.lineTo(-.86, -.5); X.quadraticCurveTo(-.82, -.88, 0, -.88); X.quadraticCurveTo(.82, -.88, .86, -.5); X.lineTo(.86, -.26); X.closePath(); }), lidC, {
      in() { hl(-.42, -.7, .2, .05, -.1); }
    });
    for (const x of [-.58, .58]) part(RR(x - .08, -.88, .16, 1.62, .06), K.yel, { lw: .8, d: .5 });
    part(heartPath(.24, 0, -.22), col(2, K.yel), { lw: .9, in() { fillP(E(0, -.24, .05), INK); fillP(P([[-.03, -.24], [.03, -.24], [.04, -.12], [-.04, -.12]]), INK); } });
    if (BIG) spark(.74, -1.0, .14, '#fff', true);
  }, 1.22);
  def('crown', 0, () => {
    const g = col(0, K.yel);
    for (const q of [[-.84, -.5], [0, -.78], [.84, -.5]]) part(E(q[0], q[1], .13), K.pink, { lw: .8, d: .6 });
    part(RP([[-.86, .62], [-.86, -.42], [-.42, -.06], [0, -.68], [.42, -.06], [.86, -.42], [.86, .62]], [.1, .06, .1, .06, .1, .06, .1]), g, {
      in() {
        fillP(RR(-.9, .26, 1.8, .36, 0), shade(g, .14)); sline([[-.9, .26], [.9, .26]], L * .8);
        hl(-.56, -.12, .05, .16, .3); dot(-.2, -.06, .04);
      }
    });
    for (const q of [[-.5, K.cyan, .09], [0, K.lime, .12], [.5, K.cyan, .09]]) part(E(q[0], .44, q[2]), q[1], { lw: .6, flat: true, in() { dot(q[0] - q[2] * .35, .44 - q[2] * .35, q[2] * .3); } });
  });
  def('shop', 0, () => {
    part(RR(-.8, -.24, 1.6, 1.06, .1), col(0, K.cream), {
      in() {
        part(RR(-.62, -.04, .7, .5, .08), K.cyan, { lw: .7, in() { hl(-.48, .06, .1, .035, -.3); } });
        part(RR(.24, .02, .4, .86, .08), K.lime, { lw: .7, in() { dot(.32, .44, .035, INK); } });
      }
    });
    const aw = F(() => { X.moveTo(-.98, -.22); X.lineTo(-.74, -.86); X.lineTo(.74, -.86); X.lineTo(.98, -.22); for (let i = 0; i < 5; i++) { const x1 = .98 - i * (1.96 / 5), x2 = x1 - 1.96 / 5; X.quadraticCurveTo((x1 + x2) / 2, .02, x2, -.22); } X.closePath(); });
    part(aw, col(1, K.pink), {
      in() {
        for (let i = 1; i < 5; i += 2) { const x1 = -.98 + i * (1.96 / 5), x2 = x1 + 1.96 / 5, t1 = -.74 + i * (1.48 / 5), t2 = t1 + 1.48 / 5; fillP(P([[t1, -.9], [t2, -.9], [x2, -.06], [x1, -.06]]), '#fff'); }
        hl(-.5, -.74, .16, .035, 0, .8);
      }
    });
    if (BIG) dheart(.82, -.98, .13);
  }, 1.22);
  def('key', .78, () => {
    const g = col(0, K.yel);
    part(RR(-.1, -.3, .2, 1.24, .1), g, { in() { hl(-.04, .3, .02, .3, 0, .8); } });
    part(RP([[.06, .5], [.42, .5], [.42, .66], [.26, .66], [.26, .74], [.42, .74], [.42, .92], [.06, .92]], .05), g);
    part(heartPath(.5, 0, -.52), g, { in() { fillP(heartPath(.2, 0, -.5), INK); hl(-.24, -.66, .09, .045, -.6); } });
  });
  def('gem', 0, () => {
    const b = col(0, K.cyan);
    const out = [[-.5, -.66], [.5, -.66], [.9, -.18], [0, .9], [-.9, -.18]];
    part(RP(out, .08), b, {
      grain: false, in() {
        fillP(P([[-.5, -.66], [.5, -.66], [.3, -.18], [-.3, -.18]]), lite(b, .45));
        fillP(P([[.3, -.18], [.9, -.18], [0, .9]]), shade(b, .2));
        sline([[-.9, -.18], [.9, -.18]], L * .8); sline([[-.3, -.18], [0, .9], [.3, -.18]], L * .8); sline([[-.5, -.66], [-.3, -.18]], L * .7); sline([[.5, -.66], [.3, -.18]], L * .7);
        hl(-.18, -.48, .14, .05, -.15); dot(-.48, -.28, .04);
      }
    });
    if (BIG) { spark(.7, -.78, .16, '#fff', true); spark(-.8, .4, .1, '#fff', true); }
  });
  def('poison', 0, () => {
    const g = col(0, K.lime);
    part(dropPath(.94, 0, .05), g, {
      in() {
        if (HI) { for (const s of [-1, 1]) { sline([[.2 * s - .07, .14], [.2 * s + .07, .28]], L * 1.1); sline([[.2 * s + .07, .14], [.2 * s - .07, .28]], L * 1.1); } curve([[-.14, .5], [-.05, .45], [.05, .52], [.14, .47]], L * .9); }
        hl(-.3, .14, .08, .22, .3); dot(-.12, -.38, .045);
      }
    });
    for (const q of [[.56, -.62, .12], [.72, -.3, .07], [-.6, -.48, .09]]) part(E(q[0], q[1], q[2]), lite(g, .3), { lw: .7, flat: true, in() { dot(q[0] - q[2] * .3, q[1] - q[2] * .3, q[2] * .35); } });
  });
  def('stun', 0, () => {
    X.save(); X.lineWidth = L * 2 + .14; X.strokeStyle = INK; X.beginPath(); X.ellipse(0, .16, .86, .4, -.12, 0, TAU); X.stroke();
    X.lineWidth = .14; X.strokeStyle = col(0, K.cyan); X.stroke(); X.restore();
    for (const q of [[-.62, .16, .36, K.yel], [.08, -.36, .44, K.pink], [.62, .36, .32, K.yel]]) part(puffStar(5, q[2], q[2] * .48, q[0], q[1]), q[3], { lw: .8, in() { hl(q[0] - q[2] * .25, q[1] - q[2] * .3, q[2] * .14, q[2] * .07, -.8); } });
  });
  def('energy', 0, () => {
    const b = col(0, K.cyan);
    part(E(0, 0, .86), b, {
      in() {
        part(RP([[.12, -.64], [-.34, .08], [-.02, .08], [-.14, .64], [.34, -.12], [.02, -.12]], .04), K.yel, { lw: .8, d: .6 });
        hl(-.46, -.42, .16, .07, -.75); dot(-.2, -.64, .04);
      }
    });
    if (BIG) { spark(.8, -.68, .14, '#fff', true); dnote(.74, .62, .8); }
  });

  // ---------- render one icon into a cached sprite ----------
  iconRender = function (name, pb, hi, o, lwU) {
    const t0 = performance.now();
    const A = ICON_ART[name];
    L = lwU || (hi ? Math.max(.062, 2.1 / pb) : clamp(1.35 / pb, .09, .2));
    const bw = hi ? Math.max(2, pb * .07) : Math.max(1, pb * .055);   // white die-cut border, device px
    const N = Math.ceil(pb * (A.pad + L) * 2 + bw * 2) + 4;
    const cv = document.createElement('canvas'); cv.width = cv.height = N; const x = cv.getContext('2d');
    x.translate(N / 2, N / 2); x.scale(pb, pb); if (A.r) x.rotate(A.r);
    X = x; PB = pb; HI = hi; BIG = hi && pb >= 44; OV = o || {};
    GRAIN = null;
    if (hi) { try { GRAIN = x.createPattern(noiseCanvas(), 'repeat'); GRAIN.setTransform(new DOMMatrix([1 / pb, 0, 0, 1 / pb, 0, 0])); } catch (e) { GRAIN = null; } }
    try { A.fn(); } catch (e) { console.warn('icon', name, e); }
    X = null; GRAIN = null;
    // sticker border: dilate the silhouette in white (two rings of 16 taps), then lay the art on top
    const t = document.createElement('canvas'); t.width = t.height = N; const tx = t.getContext('2d');
    tx.drawImage(cv, 0, 0); tx.globalCompositeOperation = 'source-in'; tx.fillStyle = '#fff'; tx.fillRect(0, 0, N, N);
    const out = document.createElement('canvas'); out.width = out.height = N; const ox = out.getContext('2d');
    const rings = bw > 2.5 ? [bw, bw * .55] : [bw];
    for (const r of rings) for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; ox.drawImage(t, Math.cos(a) * r, Math.sin(a) * r); }
    ox.drawImage(cv, 0, 0);
    ICON_STATS.renders++; ICON_STATS.ms += performance.now() - t0;
    return out;
  };
})();

// ---------- public entry point (overrides art.js icon) ----------
function icon(c, name, x, y, s, o = {}) {
  if (typeof SPR !== 'undefined' && SPR.icon(c, name, x, y, s)) return;
  const A = ICON_ART[name];
  if (!A || !(s > 0)) return legacyIcon(c, name, x, y, s, o);
  const m = c.getTransform(), k = Math.hypot(m.a, m.b) || 1, pr = s * k;
  const pb = iconBucket(pr), hi = s >= 22 && pr >= 20;
  const key = name + '|' + pb + '|' + (hi ? 1 : 0) + '|' + (o.col || '') + '|' + (o.ci || 0) + '|' + (o.lw || 0);
  let spr = ICON_CACHE.get(key);
  if (!spr) {
    if (ICON_CACHE.size > 900) ICON_CACHE.clear();
    spr = iconRender(name, pb, hi, o, o.lw ? o.lw / s * .8 : 0); ICON_CACHE.set(key, spr);
  }
  const sc = s / pb, w = spr.width * sc;
  if (o.rot) { c.save(); c.translate(x, y); c.rotate(o.rot); c.drawImage(spr, -w / 2, -w / 2, w, w); c.restore(); }
  else c.drawImage(spr, x - w / 2, y - w / 2, w, w);
}
