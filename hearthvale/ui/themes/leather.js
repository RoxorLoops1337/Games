// Tavern Leather: every texture is drawn at runtime on Canvas 2D (periodic noise, fbm grain, Worley pebbles, creases, fibres,
// scratches, stitched seams with thread shadows, brass rivets, nails, wax). The results are published as data-URL custom
// properties on <html> (--lt-wood, --lt-leather, --lt-grain, --lt-parch, --lt-brass, --lt-cloth, --lt-wax and the 9-slice
// frames --lt-fr-wood / --lt-fr-tan / --lt-fr-moss / --lt-fr-slate / --lt-fr-rust) which leather.css consumes.
// Without this script the CSS still renders with flat gradient fallbacks.
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const mix = (a, b, t) => a + (b - a) * t;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---- periodic value noise: lattice px*py, wraps, so every texture tiles ----
function vnoise(L, px, py, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px, y0 = ((yi % py) + py) % py, y1 = (y0 + 1) % py;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = L[y0 * px + x0], b = L[y0 * px + x1], c = L[y1 * px + x0], d = L[y1 * px + x1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function mkFbm(seed, px, py, oct) {
  const r = rng(seed), layers = []; let a = px, b = py;
  for (let o = 0; o < oct; o++) { const L = new Float32Array(a * b); for (let i = 0; i < L.length; i++) L[i] = r(); layers.push({ L, px: a, py: b }); a *= 2; b *= 2; }
  return (u, v) => { let s = 0, amp = 1, tot = 0; for (const l of layers) { s += amp * vnoise(l.L, l.px, l.py, u * l.px, v * l.py); tot += amp; amp *= 0.5; } return s / tot; };
}
const wrap = (a, N) => { a %= N; if (a > N / 2) a -= N; if (a < -N / 2) a += N; return a; };
function rrPath(x, x0, y0, w, h, r) { x.beginPath(); x.moveTo(x0 + r, y0); x.arcTo(x0 + w, y0, x0 + w, y0 + h, r); x.arcTo(x0 + w, y0 + h, x0, y0 + h, r); x.arcTo(x0, y0 + h, x0, y0, r); x.arcTo(x0, y0, x0 + w, y0, r); x.closePath(); }

// ---- honey wood planks with grain isolines, fibres, pores, knots, seams and butt joints (opaque, tileable) ----
function genWood(N, seed) {
  const c = cv(N, N), x = c.getContext('2d'), img = x.createImageData(N, N), d = img.data, r = rng(seed);
  const grain = mkFbm(seed + 3, 3, 30, 3), fib = mkFbm(seed + 4, 2, 90, 2), blot = mkFbm(seed + 5, 3, 3, 3), pore = mkFbm(seed + 6, 36, 6, 2);
  const planks = 4, ph = N / planks;
  const pt = []; for (let p = 0; p < planks; p++) pt.push({ t: (r() - 0.5) * 0.2, off: r(), bx: r() * N });
  const knots = [{ x: N * (0.2 + r() * 0.2), y: ph * 1.5, R: 11 + r() * 4 }, { x: N * (0.6 + r() * 0.25), y: ph * 3.5, R: 9 + r() * 4 }];
  const light = hex('#efc684'), dark = hex('#b87a3c'), deep = hex('#5a3114');
  for (let y = 0; y < N; y++) {
    const p = Math.floor(y / ph), ly = y - p * ph, v = y / N;
    for (let xx = 0; xx < N; xx++) {
      const u = xx / N;
      const g = grain(u, v + pt[p].off);
      let kk = 0, kr = 0;
      for (const k of knots) { const dx = wrap(xx - k.x, N), dy = wrap(y - k.y, N) * 1.25, d2 = dx * dx + dy * dy; if (d2 > 9 * k.R * k.R) continue; const dist = Math.sqrt(d2), w = Math.exp(-d2 / (2 * k.R * k.R)); kk = Math.max(kk, w); kr += w * dist * 0.42; }
      const F = g * 9 + kr;
      const line = Math.pow(1 - Math.abs(Math.sin(F * Math.PI)), 7) * 0.6;
      let tone = (g - 0.5) * 0.7 + (blot(u, v) - 0.5) * 0.5 + pt[p].t + (fib(u, v) - 0.5) * 0.22 - line;
      tone -= kk * kk * 0.5;
      if (pore(u, v) > 0.72) tone -= 0.1;
      if (ly < 1.6) tone -= 1.1; else if (ly < 4) tone += (4 - ly) * 0.035;
      if (ly > ph - 3.5) tone -= (3.5 - (ph - ly)) * 0.055;
      const dj = wrap(xx - pt[p].bx, N); if (Math.abs(dj) < 0.9) tone -= 0.8; else if (dj > 0.9 && dj < 2.6) tone += 0.1;
      const t = clamp(0.46 - tone), sd = clamp(-tone - 0.55, 0, 0.85);
      const i = (y * N + xx) * 4;
      for (let k = 0; k < 3; k++) { const col = mix(light[k], dark[k], t); d[i + k] = mix(col, deep[k], sd); }
      d[i + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0); return c;
}
// a non-tiling wood strip for the plank frame (grain runs along x)
function genWoodStrip(W, H, seed) {
  const c = cv(W, H), x = c.getContext('2d'), img = x.createImageData(W, H), d = img.data;
  const grain = mkFbm(seed, 2, 14, 3), fib = mkFbm(seed + 1, 2, 60, 2);
  const light = hex('#e9b673'), dark = hex('#a8692f');
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
    const u = xx / W, v = y / H, g = grain(u, v);
    const line = Math.pow(1 - Math.abs(Math.sin(g * 7 * Math.PI)), 8) * 0.4;
    const t = clamp(0.5 - ((g - 0.5) * 0.5 + (fib(u, v) - 0.5) * 0.3) + line);
    const i = (y * W + xx) * 4; for (let k = 0; k < 3; k++) d[i + k] = mix(light[k], dark[k], t); d[i + 3] = 255;
  }
  x.putImageData(img, 0, 0); return c;
}

// ---- pebbled leather overlay (alpha only, tileable): Worley cells, lit groove shading, fibre noise, creases, wear ----
function genGrain(N, seed, creases, cell) {
  const G = Math.max(4, Math.round(N / (cell || 11))), r = rng(seed), pf = new Float32Array(G * G * 2);
  for (let i = 0; i < G * G; i++) { pf[i * 2] = 0.15 + r() * 0.7; pf[i * 2 + 1] = 0.15 + r() * 0.7; }
  const fib = mkFbm(seed + 9, 24, 24, 2), mott = mkFbm(seed + 10, 4, 4, 3);
  const h = new Float32Array(N * N), gv = new Float32Array(N * N), wr2 = new Float32Array(N * N), cs = 1 / G;
  for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) {
    const u = xx / N, v = y / N, gi = Math.floor(u * G), gj = Math.floor(v * G); let f1 = 9, f2 = 9;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ci = (gi + di + G) % G, cj = (gj + dj + G) % G, k = (cj * G + ci) * 2;
      const ddx = u - (gi + di + pf[k]) / G, ddy = v - (gj + dj + pf[k + 1]) / G, dd = ddx * ddx + ddy * ddy;
      if (dd < f1) { f2 = f1; f1 = dd; } else if (dd < f2) f2 = dd;
    }
    f1 = Math.sqrt(f1); f2 = Math.sqrt(f2);
    let hv = clamp((f2 - f1) / (cs * 0.5)); hv = hv * hv * (3 - 2 * hv);
    const dome = clamp(1 - f1 / (cs * 0.75)), mt = mott(u, v);
    h[y * N + xx] = hv * 0.55 + dome * 0.45 + (fib(u, v) - 0.5) * 0.3 + (mt - 0.5) * 0.2;
    gv[y * N + xx] = hv; wr2[y * N + xx] = mt;
  }
  const cr = [], rr = rng(seed + 33);
  for (let k = 0; k < (creases || 0); k++) cr.push({ y0: rr() * N, amp: 4 + rr() * 9, f: 1 + Math.floor(rr() * 2), ph: rr() * TAU, f2: 2 + Math.floor(rr() * 3), a2: 1.5 + rr() * 3, w: 1.2 + rr() * 1.4, str: 0.35 + rr() * 0.4 });
  const c = cv(N, N), x = c.getContext('2d'), img = x.createImageData(N, N), d = img.data;
  for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) {
    const hv = h[y * N + xx], hl = h[((y + 1) % N) * N + (xx + 1) % N];
    let dark = Math.pow(clamp(1 - gv[y * N + xx]), 2) * 0.17, light = clamp((hv - hl) * 1.9) * 0.24;
    for (const k of cr) {
      const yc = k.y0 + k.amp * Math.sin(TAU * k.f * xx / N + k.ph) + k.a2 * Math.sin(TAU * k.f2 * xx / N + k.ph * 2);
      const dy = wrap(y - yc, N), ad = Math.abs(dy);
      if (ad > k.w * 12) continue;
      dark += k.str * 0.26 * Math.exp(-(ad / k.w) * (ad / k.w)) + k.str * 0.1 * Math.exp(-(ad / (k.w * 5)) * (ad / (k.w * 5)));
      light += k.str * 0.2 * Math.exp(-((dy - k.w * 2.2) / (k.w * 1.1)) * ((dy - k.w * 2.2) / (k.w * 1.1)));
    }
    const wear = wr2[y * N + xx];
    if (wear > 0.7) light += (wear - 0.7) * 0.5;
    const net = light - dark, a = Math.round(clamp(Math.abs(net), 0, 0.55) * 255 / 16) * 16, i = (y * N + xx) * 4;
    if (net >= 0) { d[i] = 255; d[i + 1] = 238; d[i + 2] = 200; } else { d[i] = 38; d[i + 1] = 16; d[i + 2] = 2; }
    d[i + 3] = a;
  }
  x.putImageData(img, 0, 0); return c;
}
function bakeLeather(grain, N, top, bot) {
  const c = cv(N, N), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, N);
  g.addColorStop(0, top); g.addColorStop(1, bot); x.fillStyle = g; x.fillRect(0, 0, N, N);
  x.drawImage(grain, 0, 0); return c;
}

// ---- aged parchment: mottled fibre field, stains, long fibres, foxing speckles (opaque, tileable) ----
function genParch(N, seed) {
  const c = cv(N, N), x = c.getContext('2d'), img = x.createImageData(N, N), d = img.data, r = rng(seed);
  const big = mkFbm(seed + 1, 2, 2, 4), mid = mkFbm(seed + 2, 6, 6, 3), fine = mkFbm(seed + 3, 48, 48, 2), stain = mkFbm(seed + 4, 3, 3, 4);
  const a = hex('#f8ebc6'), b = hex('#e6cc92'), s = hex('#c79a5a');
  for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) {
    const u = xx / N, v = y / N, t = clamp((big(u, v) - 0.3) * 1.5 + (mid(u, v) - 0.5) * 0.5 + (fine(u, v) - 0.5) * 0.25);
    const st = clamp((stain(u, v) - 0.6) * 3.2) * 0.38, i = (y * N + xx) * 4;
    for (let k = 0; k < 3; k++) d[i + k] = mix(mix(a[k], b[k], t), s[k], st);
    d[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const copies = (fn) => { for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) { x.save(); x.translate(ox, oy); fn(); x.restore(); } };
  for (let i = 0; i < 70; i++) { // long fibres
    const px = r() * N, py = r() * N, ang = r() * TAU, len = 8 + r() * 26, dark = r() < 0.6;
    x.strokeStyle = dark ? 'rgba(120,80,30,.16)' : 'rgba(255,250,225,.4)'; x.lineWidth = 0.6 + r() * 0.5; x.lineCap = 'round';
    const mx = px + Math.cos(ang) * len * 0.5 + (r() - 0.5) * 6, my = py + Math.sin(ang) * len * 0.5 + (r() - 0.5) * 6;
    copies(() => { x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(mx, my, px + Math.cos(ang) * len, py + Math.sin(ang) * len); x.stroke(); });
  }
  for (let i = 0; i < 90; i++) { // foxing and specks
    const px = r() * N, py = r() * N, rad = 0.4 + r() * (r() < 0.05 ? 1.3 : 0.8);
    x.fillStyle = r() < 0.25 ? 'rgba(150,90,30,.22)' : 'rgba(90,55,20,.28)';
    copies(() => { x.beginPath(); x.arc(px, py, rad, 0, TAU); x.fill(); });
  }
  return c;
}

// ---- brushed brass (opaque, tileable): anisotropic streaks plus scratches ----
function genBrass(N, seed) {
  const c = cv(N, N), x = c.getContext('2d'), img = x.createImageData(N, N), d = img.data, r = rng(seed);
  const st = mkFbm(seed, 2, 70, 2), st2 = mkFbm(seed + 1, 3, 5, 3);
  const lo = hex('#ad771c'), hi = hex('#f0cb68');
  for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) {
    const u = xx / N, v = y / N, t = clamp((st(u, v) - 0.5) * 1.9 + (st2(u, v) - 0.5) * 0.9 + 0.5), i = (y * N + xx) * 4;
    for (let k = 0; k < 3; k++) d[i + k] = mix(lo[k], hi[k], t); d[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  for (let i = 0; i < 46; i++) {
    const py = r() * N, px = r() * N, len = 10 + r() * 60, dark = r() < 0.5;
    x.strokeStyle = dark ? 'rgba(90,55,5,.18)' : 'rgba(255,248,200,.35)'; x.lineWidth = 0.5;
    for (const ox of [-N, 0, N]) { x.beginPath(); x.moveTo(px + ox, py); x.lineTo(px + ox + len, py + (r() - 0.5) * 1.5); x.stroke(); }
  }
  return c;
}

// ---- woven cloth ribbon overlay (alpha): over/under threads, tileable at 96px ----
function genCloth(N, seed) {
  const c = cv(N, N), x = c.getContext('2d'), img = x.createImageData(N, N), d = img.data, nz = mkFbm(seed, 24, 24, 2), cell = 6;
  for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) {
    const cx = Math.floor(xx / cell), cy = Math.floor(y / cell), over = (cx + cy) % 2 === 0, fx = (xx % cell) / cell, fy = (y % cell) / cell;
    const prof = over ? Math.sin(fx * Math.PI) : Math.sin(fy * Math.PI);
    const along = over ? Math.sin((y / N) * TAU * (N / 3)) * 0.04 : Math.sin((xx / N) * TAU * (N / 3)) * 0.04;
    const v = prof - 0.62 + along + (nz(xx / N, y / N) - 0.5) * 0.35;
    const i = (y * N + xx) * 4;
    if (v >= 0) { d[i] = 255; d[i + 1] = 226; d[i + 2] = 190; d[i + 3] = Math.round(clamp(v * 0.9) * 150); } else { d[i] = 40; d[i + 1] = 8; d[i + 2] = 0; d[i + 3] = Math.round(clamp(-v * 1.0) * 200); }
  }
  x.putImageData(img, 0, 0); return c;
}

// ---- 9-slice frames ----
function rivet(x, cx, cy, rad) {
  x.save(); x.fillStyle = 'rgba(30,12,0,.45)'; x.beginPath(); x.arc(cx + rad * 0.25, cy + rad * 0.45, rad * 1.1, 0, TAU); x.fill();
  const g = x.createRadialGradient(cx - rad * 0.3, cy - rad * 0.35, rad * 0.1, cx, cy, rad);
  g.addColorStop(0, '#fffbe2'); g.addColorStop(0.28, '#f3cb62'); g.addColorStop(0.7, '#b87c1c'); g.addColorStop(1, '#5e3608');
  x.fillStyle = g; x.beginPath(); x.arc(cx, cy, rad, 0, TAU); x.fill();
  x.strokeStyle = 'rgba(60,30,0,.7)'; x.lineWidth = 0.9; x.stroke();
  x.fillStyle = 'rgba(255,255,255,.95)'; x.beginPath(); x.arc(cx - rad * 0.34, cy - rad * 0.36, rad * 0.2, 0, TAU); x.fill(); x.restore();
}
function stitch(x, px, py, ang, len, th, thread) {
  x.save(); x.translate(px, py); x.rotate(ang); x.lineCap = 'round';
  x.strokeStyle = 'rgba(25,10,0,.55)'; x.lineWidth = th + 0.8; x.beginPath(); x.moveTo(-len / 2, 1.4); x.lineTo(len / 2, 1.4); x.stroke();
  x.strokeStyle = thread; x.lineWidth = th; x.beginPath(); x.moveTo(-len / 2, 0); x.lineTo(len / 2, 0); x.stroke();
  x.strokeStyle = 'rgba(255,255,245,.6)'; x.lineWidth = th * 0.32; x.beginPath(); x.moveTo(-len / 2 + 1, -th * 0.2); x.lineTo(len / 2 - 1, -th * 0.2); x.stroke();
  x.fillStyle = 'rgba(30,12,0,.7)'; for (const s of [-1, 1]) { x.beginPath(); x.arc(s * (len / 2 + th * 0.6), 0, th * 0.28, 0, TAU); x.fill(); }
  x.restore();
}
function leatherFrame(grainTile, T, col, thread, o) {
  const S = o.S, W = 2 * S + T, c = cv(W, W), x = c.getContext('2d'), R = S - 4;
  const outer = () => { rrPath(x, 0, 0, W, W, R); x.rect(S, S, T, T); };
  x.save(); x.beginPath(); rrPath(x, 0, 0, W, W, R); x.rect(S + T, S, -T, T); x.clip('evenodd');
  const g = x.createLinearGradient(0, 0, 0, W); g.addColorStop(0, col[0]); g.addColorStop(0.5, col[1]); g.addColorStop(1, col[2]);
  x.fillStyle = g; x.fillRect(0, 0, W, W);
  x.translate(S, S); x.fillStyle = x.createPattern(grainTile, 'repeat'); x.fillRect(-S, -S, W, W); x.restore();
  // bevel on the outer edge, groove on the inner edge
  x.save(); x.beginPath(); rrPath(x, 0, 0, W, W, R); x.rect(S + T, S, -T, T); x.clip('evenodd');
  const eg = x.createLinearGradient(0, 0, W, W); eg.addColorStop(0, 'rgba(255,240,200,.75)'); eg.addColorStop(0.45, 'rgba(255,240,200,0)'); eg.addColorStop(0.6, 'rgba(30,10,0,0)'); eg.addColorStop(1, 'rgba(30,10,0,.5)');
  x.strokeStyle = eg; x.lineWidth = 5; rrPath(x, 0, 0, W, W, R); x.stroke();
  x.strokeStyle = 'rgba(40,18,4,.9)'; x.lineWidth = 2.4; rrPath(x, 0, 0, W, W, R); x.stroke();
  x.strokeStyle = 'rgba(30,12,0,.75)'; x.lineWidth = 4; x.strokeRect(S, S, T, T);
  x.strokeStyle = 'rgba(255,235,190,.35)'; x.lineWidth = 2; x.strokeRect(S - 3.5, S - 3.5, T + 7, T + 7);
  x.restore();
  // stitched seam: straight runs tile every T (aligned to the slice), one stitch per rounded corner
  const k = o.k, sp = o.sp, n = Math.round(T / sp), r2 = R - k;
  for (let i = 0; i < n; i++) {
    const p = S + sp / 2 + i * sp;
    stitch(x, p, k, 0, o.len, o.th, thread); stitch(x, p, W - k, 0, o.len, o.th, thread);
    stitch(x, k, p, Math.PI / 2, o.len, o.th, thread); stitch(x, W - k, p, Math.PI / 2, o.len, o.th, thread);
  }
  for (const [cx, cy, a0] of [[k + r2, k + r2, Math.PI], [W - k - r2, k + r2, Math.PI * 1.5], [W - k - r2, W - k - r2, 0], [k + r2, W - k - r2, Math.PI / 2]]) {
    const a = a0 + Math.PI / 4; stitch(x, cx + Math.cos(a) * r2, cy + Math.sin(a) * r2, a + Math.PI / 2, o.len * 0.9, o.th, thread);
  }
  return c;
}
function woodFrame(T) {
  const S = 28, W = 2 * S + T, c = cv(W, W), x = c.getContext('2d'), strip = genWoodStrip(160, 34, 77), R = 24;
  x.save(); x.beginPath(); rrPath(x, 0, 0, W, W, R); x.rect(S + T, S, -T, T); x.clip('evenodd');
  const bar = (poly, rot, ox, oy, len) => { x.save(); x.beginPath(); x.moveTo(poly[0][0], poly[0][1]); for (let i = 1; i < poly.length; i++) x.lineTo(poly[i][0], poly[i][1]); x.closePath(); x.clip(); x.translate(ox, oy); x.rotate(rot); x.drawImage(strip, 0, 0, len, S); x.restore(); };
  bar([[0, 0], [W, 0], [W - S, S], [S, S]], 0, 0, 0, W);
  bar([[0, W], [W, W], [W - S, W - S], [S, W - S]], 0, 0, W - S, W);
  bar([[0, 0], [S, S], [S, W - S], [0, W]], Math.PI / 2, S, 0, W);
  bar([[W, 0], [W - S, S], [W - S, W - S], [W, W]], Math.PI / 2, W, 0, W);
  x.strokeStyle = 'rgba(50,24,6,.45)'; x.lineWidth = 1.2; // mitre seams
  for (const [a, b, c2, d2] of [[0, 0, S, S], [W, 0, W - S, S], [0, W, S, W - S], [W, W, W - S, W - S]]) { x.beginPath(); x.moveTo(a, b); x.lineTo(c2, d2); x.stroke(); }
  const eg = x.createLinearGradient(0, 0, W, W); eg.addColorStop(0, 'rgba(255,236,190,.8)'); eg.addColorStop(0.45, 'rgba(255,236,190,0)'); eg.addColorStop(0.6, 'rgba(40,16,0,0)'); eg.addColorStop(1, 'rgba(40,16,0,.55)');
  x.strokeStyle = eg; x.lineWidth = 6; rrPath(x, 0, 0, W, W, R); x.stroke();
  x.strokeStyle = 'rgba(52,26,8,.95)'; x.lineWidth = 2.6; rrPath(x, 0, 0, W, W, R); x.stroke();
  x.strokeStyle = 'rgba(40,18,4,.85)'; x.lineWidth = 5; x.strokeRect(S, S, T, T);
  x.strokeStyle = 'rgba(255,230,180,.4)'; x.lineWidth = 1.6; x.strokeRect(S - 4.5, S - 4.5, T + 9, T + 9);
  x.restore();
  for (const [cx, cy] of [[14, 14], [W - 14, 14], [14, W - 14], [W - 14, W - 14]]) rivet(x, cx, cy, 5);
  return c;
}
// ---- red wax seal (level badge) ----
function waxSeal(N, seed) {
  const c = cv(N, N), x = c.getContext('2d'), r = rng(seed), m = N / 2;
  const lobes = []; for (let i = 0; i < 9; i++) lobes.push([r() * 4 + 1.5, r() * TAU, 1 + Math.floor(r() * 3)]);
  const rad = (t) => { let v = m * 0.68; for (const [a, p, f] of lobes) v += a * Math.sin(t * (f + 2) + p) * (N / 160); return v; };
  x.save(); x.shadowColor = 'rgba(60,10,0,.45)'; x.shadowBlur = N * 0.04; x.shadowOffsetY = N * 0.025;
  x.beginPath(); for (let i = 0; i <= 180; i++) { const t = i / 180 * TAU, q = rad(t); i ? x.lineTo(m + Math.cos(t) * q, m + Math.sin(t) * q) : x.moveTo(m + Math.cos(t) * q, m + Math.sin(t) * q); }
  x.closePath(); const g = x.createRadialGradient(m * 0.8, m * 0.7, m * 0.1, m, m, m * 0.95);
  g.addColorStop(0, '#f2705c'); g.addColorStop(0.5, '#c8362a'); g.addColorStop(1, '#7c1812'); x.fillStyle = g; x.fill(); x.restore();
  x.strokeStyle = 'rgba(70,6,0,.55)'; x.lineWidth = N * 0.03; x.beginPath(); x.arc(m, m, m * 0.5, 0, TAU); x.stroke();
  x.strokeStyle = 'rgba(255,170,150,.55)'; x.lineWidth = N * 0.018; x.beginPath(); x.arc(m + 1, m + 1.5, m * 0.5 + N * 0.02, Math.PI * 0.1, Math.PI * 0.9); x.stroke();
  x.strokeStyle = 'rgba(255,190,170,.65)'; x.lineWidth = N * 0.028; x.lineCap = 'round'; x.beginPath(); x.arc(m, m, m * 0.6, Math.PI * 1.05, Math.PI * 1.45); x.stroke();
  x.fillStyle = 'rgba(255,255,255,.55)'; x.beginPath(); x.ellipse(m * 0.62, m * 0.5, m * 0.12, m * 0.06, -0.6, 0, TAU); x.fill();
  return c;
}

const png = (c) => 'url("' + c.toDataURL('image/png') + '")';
const jpg = (c, q) => 'url("' + c.toDataURL('image/jpeg', q || 0.86) + '")';

export default function init({ root, id }) {
  const set = []; const own = [];
  const T = {}; const tm = (n, f) => { const a = performance.now(); const r = f(); T[n] = Math.round(performance.now() - a); return r; };
  const put = (k, v) => { try { root.style.setProperty(k, v); set.push(k); } catch { /* ignore */ } };
  const t0 = performance.now(); let dead = false, grain = null;
  const FT = 72, thr = '#f6e8c0';
  const lf = (tile, cols) => png(leatherFrame(tile, FT, cols, thr, { S: 30, k: 13, sp: 18, len: 11, th: 4.4 }));
  // generated in small slices so the main thread never stalls for long; the CSS has flat fallbacks until each lands
  const steps = [
    () => { grain = tm('grain', () => genGrain(192, 11, 2, 7)); put('--lt-grain', png(grain)); },
    () => { put('--lt-wood', jpg(tm('wood', () => genWood(192, 5)))); },
    () => { put('--lt-leather', jpg(bakeLeather(grain, 192, '#d9a867', '#bd8445'), 0.86)); put('--lt-brass', jpg(tm('brass', () => genBrass(128, 31), 0.86))); },
    () => { put('--lt-parch', jpg(tm('parch', () => genParch(192, 21)), 0.84)); },
    () => {
      const tile = tm('ftile', () => genGrain(FT, 61, 0, 5));
      put('--lt-fr-tan', lf(tile, ['#dfae6e', '#c99350', '#a8733a']));
      put('--lt-fr-moss', lf(tile, ['#98b866', '#7a9c4a', '#587a34']));
      put('--lt-fr-slate', lf(tile, ['#b3a590', '#9a8b76', '#7b6d5a']));
      put('--lt-fr-rust', lf(tile, ['#d58a6a', '#b96648', '#8f4630']));
    },
    () => { put('--lt-fr-wood', png(woodFrame(72))); put('--lt-cloth', png(genCloth(96, 41))); put('--lt-wax', png(waxSeal(160, 51))); },
  ];
  let si = 0;
  const run = () => {
    if (dead || si >= steps.length) { try { root.dataset.ltMs = String(Math.round(performance.now() - t0)); root.dataset.ltT = JSON.stringify(T); } catch { /* ignore */ } return; }
    try { steps[si++](); } catch { /* flat fallbacks stay */ }
    setTimeout(run, 0);
  };
  run();

  // pointer feedback: a pressed class that mirrors :active (reliable on touch), plus a brass glint where the finger lands
  const SEL = '.b,.rb,.pill,.gp,#card,.mini-b,button.tab,.card,.chipb,.rowi,.fieldchip,.tap,.seg button,.uis,.qitem';
  let down = null;
  const onDown = (e) => { try { const el = e.target && e.target.closest && e.target.closest(SEL); if (el && !el.classList.contains('off')) { down = el; el.classList.add('lt-dn'); } } catch { /* ignore */ } };
  const onUp = () => { if (down) { down.classList.remove('lt-dn'); down = null; } };
  document.addEventListener('pointerdown', onDown, true);
  for (const ev of ['pointerup', 'pointercancel', 'dragend', 'blur']) window.addEventListener(ev, onUp, true);
  return function dispose() {
    dead = true;
    document.removeEventListener('pointerdown', onDown, true);
    for (const ev of ['pointerup', 'pointercancel', 'dragend', 'blur']) window.removeEventListener(ev, onUp, true);
    for (const k of set) { try { root.style.removeProperty(k); } catch { /* ignore */ } }
    for (const n of own) { try { n.remove(); } catch { /* ignore */ } }
    try { delete root.dataset.ltMs; delete root.dataset.ltT; document.querySelectorAll('.lt-dn').forEach((e) => e.classList.remove('lt-dn')); } catch { /* ignore */ }
  };
}
