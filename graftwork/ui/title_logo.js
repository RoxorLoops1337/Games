// TITLE LOGO: the GRAFTWORK wordmark, drawn in code (no image), and the black surgical thread that sews it on.
//   Letters: engraved high-contrast serif (the game's display stack), banded brass over vellum, a debossed shadow below, a rim light on the upper left,
//   fine hatching in the lower half. Each letter is baked once to its own small canvas (per device scale) and only blitted per frame.
//   Thread: one running stitch (setLineDash) through the feet of the letters, a loose tail to each screen edge. On the first load of a session a needle
//   travels the seam, pulling the thread and sewing the letters on one by one (intro, about 3.6 s, any input skips it). Afterwards the needle hangs from
//   the right end by its thread and sways; now and then a bright glint runs along the seam with two ticks, and a slow glint sweeps the letters.
//   Reduced motion: no intro, no sway, no glint, no pulse: the finished wordmark, still.
import { W, FONT, clamp } from './core.js';
import { lnw } from '../art/linework.js';
import { TAU, offscreen as mk } from './util.js';

export const WORD = 'GRAFTWORK';
export const INTRO_S = 3.6;
// plain wording, no em dashes. The first one is the game's motto.
export const TAGLINES = ['Cut what you love. Stitch what you need.', 'Sew yourself a better weapon.', 'Your own cards are the patient.'];
export const TAGLINE_S = 6.5;
const SIZE = 118, SPACE = 7, PAD = 26;
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

// one letter, origin = left of the glyph box, y = baseline
function paintLetter(g, ch, x, base, w) {
  g.save();
  g.font = `bold ${SIZE}px ${FONT}`; g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.lineJoin = 'round';
  // debossed: a soft dark pool below and right, as if the letter were pressed into the cloth
  g.shadowColor = 'rgba(0,0,0,.85)'; g.shadowBlur = 16; g.shadowOffsetX = 3; g.shadowOffsetY = 9; g.fillStyle = '#0c0807'; g.fillText(ch, x, base);
  g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetX = 0; g.shadowOffsetY = 0;
  g.lineWidth = 7; g.strokeStyle = '#0d0907'; g.strokeText(ch, x, base);               // the ink edge
  g.fillStyle = '#fff1b8'; g.fillText(ch, x - 1.4, base - 1.6);                          // rim light: shows only on the upper left edges
  const gr = g.createLinearGradient(0, base - SIZE * 0.74, 0, base);                     // banded brass over vellum (stepped, engraved)
  gr.addColorStop(0, '#f7edd4'); gr.addColorStop(0.36, '#e4cb8c'); gr.addColorStop(0.5, '#c9a64e'); gr.addColorStop(0.505, '#9c7a2c'); gr.addColorStop(0.8, '#b58f3a'); gr.addColorStop(1, '#6a4f15');
  g.fillStyle = gr; g.fillText(ch, x + 0.5, base + 0.6);
  g.globalCompositeOperation = 'source-atop';                                            // hatching: diagonal hairlines on the shaded half
  g.strokeStyle = 'rgba(40,24,6,.2)'; g.lineWidth = 0.8; g.beginPath();
  for (let i = -SIZE; i < w + SIZE; i += 4.5) { g.moveTo(x + i, base - SIZE * 0.36); g.lineTo(x + i - SIZE * 0.36, base + 4); }
  g.stroke();
  g.strokeStyle = 'rgba(255,248,214,.16)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x - 4, base - SIZE * 0.5); g.lineTo(x + w + 4, base - SIZE * 0.5); g.stroke(); // the banding edge catches light
  g.restore();
}

export function createLogo() {
  const L = { px: 0, letters: null, layout: null, cache: [], scratch: null, intro: { ticks: 0 }, sweepT: -99, pulseT: -99, nextPulse: 7, lastStitch: -1, events: [] };

  // glyph metrics and positions (centre cx, baseline y)
  L.metrics = (app, cx, base) => {
    if (L.mcache && L.mcache.cx === cx && L.mcache.baseY === base) return L.mcache.m;
    const m = L.metrics0(app, cx, base); L.mcache = { cx, baseY: base, m }; return m;
  };
  L.metrics0 = (app, cx, base) => {
    const g = app.ctx; g.save(); g.font = `bold ${SIZE}px ${FONT}`;
    const ws = [...WORD].map((c) => Math.max(20, g.measureText(c).width)); g.restore();
    const total = ws.reduce((a, b) => a + b, 0) + SPACE * (ws.length - 1);
    let x = cx - total / 2; const letters = [];
    [...WORD].forEach((ch, i) => { letters.push({ ch, x, w: ws[i], cx: x + ws[i] / 2 }); x += ws[i] + SPACE; });
    const seamY = base - 10;
    const x0 = cx - total / 2, x1 = cx + total / 2;
    // the thread: left tail from the screen edge, the seam through the feet of the letters, right tail back out. Polyline with cumulative length.
    const pts = [];
    const bez = (p0, p1, p2, p3, n) => { for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; pts.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]); } };
    bez([-30, seamY + 108], [x0 - 260, seamY + 70], [x0 - 120, seamY + 4], [x0 - 14, seamY], 40);
    const seamStart = pts.length - 1;
    for (let i = 1; i <= 90; i++) pts.push([x0 - 14 + (x1 - x0 + 28) * i / 90, seamY + Math.sin(i * 0.42) * 0.8]);
    const seamEnd = pts.length - 1;
    bez([x1 + 14, seamY], [x1 + 120, seamY - 6], [x1 + 250, seamY - 50], [W + 30, seamY - 74], 40);
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const m = { letters, total, x0, x1, base, seamY, pts, cum, len: cum[cum.length - 1], seamStart, seamEnd, paths: null };
    if (typeof Path2D !== 'undefined') { // the finished thread as three Path2D segments: idle frames stroke them without walking the polyline
      try { const cuts = [0, seamStart, seamEnd, pts.length - 1]; m.paths = [0, 1, 2].map((k) => { const q = new Path2D(); for (let i = cuts[k]; i <= cuts[k + 1]; i++) (i === cuts[k] ? q.moveTo(pts[i][0], pts[i][1]) : q.lineTo(pts[i][0], pts[i][1])); return q; }); } catch (e) { m.paths = null; }
    }
    return m;
  };
  const pointAt = (m, d) => { // point at arc length d along the thread
    const { pts, cum } = m; d = clamp(d, 0, m.len); let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
    const a = pts[i - 1], b = pts[i], seg = cum[i] - cum[i - 1] || 1, f = clamp((d - cum[i - 1]) / seg, 0, 1);
    return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) };
  };

  function bake(app, m) {
    const px = Math.max(1, app.px || 1);
    if (L.px === px && L.cache.length === m.letters.length) return;
    L.px = px; L.cache = [];
    for (const l of m.letters) {
      const cw = l.w + PAD * 2, chh = SIZE * 1.5, o = mk(cw * px, chh * px);
      if (!o) { L.cache.push(null); continue; }
      o.x.scale(px, px); paintLetter(o.x, l.ch, PAD, SIZE * 1.12, l.w); L.cache.push({ c: o.c, w: cw, h: chh, oy: SIZE * 1.12 });
    }
  }

  // events the title turns into sound: { tk: n } (needle ticks), { pull: true }, { sweep: true }
  L.take = () => { const e = L.events; L.events = []; return e; };
  L.reset = () => { L.sweepT = -99; L.pulseT = -99; L.nextPulse = 7; L.lastStitch = -1; L.events = []; };

  // draw: st = { cx, cy, p (intro progress 0..1, 1 = finished), t (idle clock), calm, alpha }
  L.draw = (app, st) => {
    const g = app.ctx, calm = !!st.calm, p = clamp(st.p, 0, 1), t = st.t || 0, done = p >= 1;
    const base = st.cy + SIZE * 0.34, bob = calm ? 0 : Math.sin(t * 1.1) * 1.1, m = L.layout = L.metrics(app, st.cx, base);
    bake(app, m);
    // thread length drawn so far: the left tail (0.25 to 0.8 s), the seam through the letters (0.8 to 2.75 s, the slow part), the right tail (2.75 to 3.3 s)
    const ts = p * INTRO_S, lin = (a, b) => clamp((ts - a) / (b - a), 0, 1), c0 = m.cum[m.seamStart], c1 = m.cum[m.seamEnd];
    const reveal = done ? m.len : lin(0.25, 0.8) ** 1.4 * c0 + (c1 - c0) * (lin(0.8, 2.75) * 0.9 + ease(lin(0.8, 2.75)) * 0.1) + (m.len - c1) * ease(lin(2.75, 3.3));
    void c0;
    const needle = pointAt(m, reveal), stitchLen = 23, stitchN = Math.floor(reveal / stitchLen);
    if (!done && !calm && stitchN > L.lastStitch) { // one tick per two stitches, as a pair: "tk tk"
      for (let i = L.lastStitch + 1; i <= stitchN; i++) if (i % 5 === 0) L.events.push({ tk: 2 });
      L.lastStitch = stitchN;
    }
    g.save(); g.translate(0, bob); if (st.alpha !== undefined) g.globalAlpha *= st.alpha;
    // ---- the gauze strip the seam is sewn into: a pale woven band under the letters, so the black thread reads on the dark room (it grows with the needle) ----
    { const gx = done ? W : clamp(needle.x, 0, W);
      if (gx > 2) {
        g.save(); g.beginPath(); g.rect(0, m.seamY - 17, gx, 34); g.clip();
        const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, 'rgba(232,220,196,0)'); gr.addColorStop(0.2, 'rgba(232,220,196,.15)'); gr.addColorStop(0.8, 'rgba(232,220,196,.15)'); gr.addColorStop(1, 'rgba(232,220,196,0)');
        g.fillStyle = gr; g.fillRect(0, m.seamY - 17, W, 34);
        g.strokeStyle = 'rgba(232,220,196,.22)'; g.lineWidth = 1; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(0, m.seamY - 14.5); g.lineTo(W, m.seamY - 14.5); g.moveTo(0, m.seamY + 14.5); g.lineTo(W, m.seamY + 14.5); g.stroke(); g.setLineDash([]);
        g.restore();
      } }
    // ---- letters: each appears as the needle passes it ----
    m.letters.forEach((l, i) => {
      const r = done ? 1 : ease(clamp((needle.x - (l.cx - 40)) / 120, 0, 1)) * (reveal > m.cum[m.seamStart] ? 1 : 0);
      if (r <= 0.003) return;
      const c = L.cache[i], gx = l.x - PAD, gy = base - SIZE * 1.12 + (1 - r) * -14;
      g.save(); g.globalAlpha *= r;
      if (c) g.drawImage(c.c, gx, gy, c.w, c.h); else paintLetter(g, l.ch, l.x, base + (1 - r) * -14, l.w);
      g.restore();
    });
    // ---- the glint sweep (idle): a diagonal light band crosses the letters every 9 s or so ----
    if (done && !calm) {
      const cyc = (t % 9.5), sk = cyc / 1.35; if (sk < 1) L.sweepNow(app, g, m, sk);
    }
    // ---- the thread ----
    if (st.thread !== false) L.thread(app, g, m, reveal, done, t, calm, needle);
    g.restore();
    return m;
  };
  L.sweepNow = (app, g, m, k) => {
    const x = m.x0 - 120 + (m.total + 240) * k, bw = 70, top = m.base - SIZE * 0.9, bh = SIZE * 1.1;
    const sc = L.scratch || (L.scratch = mk(10, 10));
    for (let i = 0; i < m.letters.length; i++) {
      const l = m.letters[i], c = L.cache[i]; if (!c || l.x + l.w < x - bw - 30 || l.x > x + bw + 30) continue;
      if (!sc) continue;
      const w = Math.ceil(c.w * L.px), h = Math.ceil(c.h * L.px); if (sc.c.width < w || sc.c.height < h) { sc.c.width = w; sc.c.height = h; }
      const q = sc.x; q.setTransform(1, 0, 0, 1, 0, 0); q.clearRect(0, 0, sc.c.width, sc.c.height); q.globalCompositeOperation = 'source-over';
      q.scale(L.px, L.px);
      const rel = x - (l.x - PAD), gr = q.createLinearGradient(rel - bw, 0, rel + bw, 0); gr.addColorStop(0, 'rgba(255,244,205,0)'); gr.addColorStop(0.5, 'rgba(255,248,222,.95)'); gr.addColorStop(1, 'rgba(255,244,205,0)');
      q.fillStyle = gr; q.fillRect(0, 0, c.w, c.h); q.globalCompositeOperation = 'destination-in'; q.setTransform(1, 0, 0, 1, 0, 0); q.drawImage(c.c, 0, 0);
      g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.85 * Math.sin(k * Math.PI);
      g.drawImage(sc.c, 0, 0, w, h, l.x - PAD, base0(m) - SIZE * 1.12, w / L.px, h / L.px); g.restore();
    }
    void top; void bh;
  };
  L.thread = (app, g, m, reveal, done, t, calm, needle) => {
    const { pts, cum } = m; if (reveal < 2) return;
    // polyline up to `reveal`
    const upto = (a, b) => { // a path from arc length a to b
      g.beginPath(); let started = false;
      for (let i = 0; i < pts.length; i++) {
        if (cum[i] < a - 0.001 && !(i + 1 < pts.length && cum[i + 1] > a)) continue;
        if (cum[i] > b) { const q = pointAt(m, b); g.lineTo(q.x, q.y); break; }
        if (!started) { const q = pointAt(m, a); g.moveTo(q.x, q.y); started = true; }
        g.lineTo(pts[i][0], pts[i][1]);
      }
    };
    const segs = [[0, m.cum[m.seamStart], [12, 16]], [m.cum[m.seamStart], m.cum[m.seamEnd], [14, 9]], [m.cum[m.seamEnd], m.len, [12, 16]]];
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    for (let si = 0; si < segs.length; si++) {
      const [a, b, dash] = segs[si], e = Math.min(b, reveal); if (e <= a + 0.5) continue;
      const P = done && m.paths ? m.paths[si] : null, line = () => { if (P) g.stroke(P); else { upto(a, e); g.stroke(); } }; // finished: the cached Path2D, no walking the polyline
      g.setLineDash(dash);
      g.lineDashOffset = -(a % (dash[0] + dash[1]));
      // a faint light edge above (the thread stands proud of the cloth), the thread itself, a soft shadow below
      g.strokeStyle = 'rgba(255,238,200,.38)'; g.lineWidth = 1.4; g.save(); g.translate(0, -2.4); line(); g.restore();
      g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 5; g.save(); g.translate(0.8, 2.2); line(); g.restore();
      g.strokeStyle = '#070505'; g.lineWidth = 3.6; line();
    }
    g.setLineDash([]);
    // a glint pulse running along the seam now and then (idle, never with reduced motion): the thread catches the light, the needle jiggles
    if (done && !calm) {
      if (t > L.nextPulse && L.pulseT < 0) { L.pulseT = t; L.nextPulse = t + 9 + (Math.sin(t * 12.9) * 0.5 + 0.5) * 6; L.events.push({ tk: 2 }); }
      const pk = (t - L.pulseT) / 1.25;
      if (pk >= 0 && pk < 1) {
        const d = m.cum[m.seamStart] + (m.cum[m.seamEnd] - m.cum[m.seamStart]) * ease(pk), a = Math.max(m.cum[m.seamStart], d - 90), q0 = pointAt(m, a);
        g.setLineDash([14, 9]); g.lineDashOffset = -(a % 23); g.strokeStyle = `rgba(255,236,190,${(0.55 * Math.sin(pk * Math.PI)).toFixed(3)})`; g.lineWidth = lnw(2); g.globalCompositeOperation = 'lighter';
        upto(a, d); g.stroke(); g.setLineDash([]); void q0;
      }
    }
    g.restore();
    // ---- the needle: travels the seam while it is sewing, then hangs from the right end by its thread ----
    const sewing = !done, end = pointAt(m, m.len), seamEnd = pointAt(m, m.cum[m.seamEnd]);
    if (sewing) {
      const ph = (reveal / 23) * TAU, dip = Math.sin(ph), ang = needle.ang + (dip > 0 ? 0.85 : -0.85), under = dip < 0 ? 0.35 : 1;
      L.drawNeedle(g, needle.x, needle.y + dip * 7, ang, 70, under, m, reveal);
    } else {
      const sw = calm ? 0 : Math.sin(t * 0.9) * 0.07 + Math.sin(t * 2.3) * 0.015, hang = 52, sx = seamEnd.x + 2, sy = seamEnd.y, kx = sx, ky = sy + 10;
      // the loose end of the seam: a small knot, then the thread down to the needle's eye
      g.save(); g.fillStyle = '#0a0808'; g.beginPath(); g.arc(sx, sy, 3.4, 0, TAU); g.fill(); g.restore();
      g.save(); g.strokeStyle = '#0a0808'; g.lineWidth = lnw(1.8); g.lineCap = 'round'; g.beginPath(); g.moveTo(kx, ky - 10);
      const ex = kx + Math.sin(sw) * hang, ey = ky + Math.cos(sw) * hang; g.quadraticCurveTo(kx + Math.sin(sw) * hang * 0.2, ky + hang * 0.55, ex, ey); g.stroke(); g.restore();
      L.drawNeedle(g, ex, ey + 4, Math.PI / 2 + sw + 0.1, 58, 1, null, 0);
    }
    void end;
  };
  L.drawNeedle = (g, x, y, ang, len, a, m, reveal) => { // a steel needle: tip at (x, y) heading `ang`, eye at the tail; the thread runs from the eye back to the last stitch
    g.save(); g.globalAlpha *= a; g.translate(x, y); g.rotate(ang);
    const tx = -len; // tail x (tip at 0)
    if (m && reveal > 4) { // thread from the eye to the last drawn stitch, with slack
      const back = pointAt(m, Math.max(0, reveal - 26));
      g.save(); g.rotate(-ang); g.translate(-x, -y);
      g.strokeStyle = '#0a0808'; g.lineWidth = lnw(1.8); g.lineCap = 'round'; g.beginPath(); g.moveTo(back.x, back.y);
      const ex = x + Math.cos(ang) * tx, ey = y + Math.sin(ang) * tx; g.quadraticCurveTo((back.x + ex) / 2, Math.min(back.y, ey) - 22, ex, ey); g.stroke(); g.restore();
    }
    const gr = g.createLinearGradient(0, -3, 0, 3); gr.addColorStop(0, '#f4f0e8'); gr.addColorStop(0.5, '#a9a8a6'); gr.addColorStop(1, '#4a4948');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(tx * 0.3, -2.2, tx, -2.8); g.lineTo(tx, 2.8); g.quadraticCurveTo(tx * 0.3, 2.2, 0, 0); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(10,8,8,.8)'; g.lineWidth = lnw(0.8); g.stroke();
    g.fillStyle = '#0d0a0a'; g.beginPath(); g.ellipse(tx + 7, 0, 3.4, 1.3, 0, 0, TAU); g.fill(); // the eye
    g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(tx * 0.8, -1.6, len * 0.35, 0.9); // glint along the shaft
    g.restore();
  };
  return L;
}
const base0 = (m) => m.base;

// ---- taglines: three, rotating, cross-faded ----
export function taglineAt(t, calm) {
  if (calm) return { text: TAGLINES[0], a: 1, i: 0 };
  const n = TAGLINES.length, k = t / TAGLINE_S, i = Math.floor(k) % n, f = k - Math.floor(k), fade = 0.9 / TAGLINE_S;
  const a = clamp(Math.min(f / fade, (1 - f) / fade), 0, 1);
  return { text: TAGLINES[i], a, i };
}
