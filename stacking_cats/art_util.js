// Small canvas helpers for the procedural anime-style art.
export const TAU = Math.PI * 2;
export const INK = '#271c33';

const hex = (c) => {
  if (c[0] !== '#') return [255, 255, 255];
  const s = c.length === 4 ? '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3] : c;
  return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
};
const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export function mix(a, b, t) {
  const A = hex(a), B = hex(b);
  return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
export const shade = (c, t) => (t >= 0 ? mix(c, '#ffffff', t) : mix(c, '#1a1030', -t));
// fine line colour: a dark tint of the fill, so outlines feel hand-inked rather than black
export const lineOf = (c) => mix(c, INK, 0.78);

export function makeCanvas(w, h, scale = 2) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * scale); c.height = Math.ceil(h * scale);
  const ctx = c.getContext('2d');
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  return { c, ctx };
}

export function ell(ctx, x, y, rx, ry, rot = 0) { const p = new Path2D(); p.ellipse(x, y, rx, ry, rot, 0, TAU); return p; }

// fill a Path2D with a cel-shaded look: base colour, soft shadow lobe, rim light, fine outline
export function cel(ctx, path, fill, o = {}) {
  ctx.fillStyle = fill;
  ctx.fill(path);
  if (o.shade !== false) {
    ctx.save();
    ctx.clip(path);
    const b = o.box || [0, 0, 120, 120];
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, rx = (b[2] - b[0]) / 2, ry = (b[3] - b[1]) / 2;
    ctx.fillStyle = o.shadow || 'rgba(70,40,120,.17)';
    ctx.beginPath(); ctx.ellipse(cx + rx * 0.3, cy + ry * 0.62, rx * 1.2, ry * 0.75, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.3)';
    ctx.beginPath(); ctx.ellipse(cx - rx * 0.38, cy - ry * 0.52, rx * 0.34, ry * 0.16, -0.5, 0, TAU); ctx.fill();
    ctx.restore();
  }
  ctx.strokeStyle = o.line || lineOf(fill);
  ctx.lineWidth = o.lw || 1.15;
  ctx.stroke(path);
}

export function poly(ctx, pts, close = true) {
  const p = new Path2D();
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  if (close) p.closePath();
  return p;
}
export function fillPath(ctx, path, fill, lw = 1, line) {
  ctx.fillStyle = fill; ctx.fill(path);
  ctx.strokeStyle = line || lineOf(fill); ctx.lineWidth = lw; ctx.stroke(path);
}
export function star(x, y, r, r2, n = 5, rot = -Math.PI / 2) {
  const p = new Path2D();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n, rr = i % 2 ? r2 : r;
    if (i) p.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else p.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  p.closePath();
  return p;
}
export function line(ctx, pts, color, lw = 1, close = false) {
  ctx.strokeStyle = color; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (close) ctx.closePath();
  ctx.stroke();
}
export function mirror(ctx, w, fn) { ctx.save(); ctx.translate(w, 0); ctx.scale(-1, 1); fn(); ctx.restore(); }
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// A dark outer outline around whatever is drawn on a canvas, so a sprite keeps its silhouette against bright or busy
// backdrops. Draws a tinted copy of the sprite at 12 offsets underneath it. Cheap: run once when the sprite is cached.
export function outlineCanvas(src, px = 2, color = '#2a1840', alpha = 0.85) {
  const w = src.width, h = src.height;
  const sil = document.createElement('canvas'); sil.width = w; sil.height = h;
  const s = sil.getContext('2d');
  s.drawImage(src, 0, 0); s.globalCompositeOperation = 'source-in'; s.fillStyle = color; s.fillRect(0, 0, w, h);
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const o = out.getContext('2d');
  o.globalAlpha = alpha;
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; o.drawImage(sil, Math.cos(a) * px, Math.sin(a) * px); }
  o.globalAlpha = 1; o.drawImage(src, 0, 0);
  return out;
}

// A thin warm highlight on the edges that face the sun (up and to the right), baked into a cached sprite so it costs nothing
// per frame. Done before outlineCanvas so the dark outline stays dark.
export function rimLight(c, d = 3, color = '#fff0c0', alpha = 0.5) {
  const w = c.width, h = c.height;
  const t = document.createElement('canvas'); t.width = w; t.height = h;
  const x = t.getContext('2d');
  x.drawImage(c, 0, 0);
  x.globalCompositeOperation = 'destination-out'; x.drawImage(c, -d, d);
  x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, w, h);
  const o = c.getContext('2d');
  o.save(); o.setTransform(1, 0, 0, 1, 0, 0); o.globalCompositeOperation = 'source-atop'; o.globalAlpha = alpha; o.drawImage(t, 0, 0); o.restore();
  t.width = t.height = 0;
  return c;
}

// Bake fine surface texture into a finished sprite: short strokes a little lighter or darker than the colour underneath, kept
// inside the shape and away from the dark outline and the eyes. Run once when a sprite is cached, so it costs nothing per frame.
export function texturize(c, o = {}) {
  try {
    const w = c.width, h = c.height, x = c.getContext('2d');
    const d = x.getImageData(0, 0, w, h).data;
    const rnd = mulberry(o.seed || 7), n = o.count || Math.round((w * h) / 55);
    const len = o.len || 5, minLum = o.minLum == null ? 70 : o.minLum, lw = o.lw || 1.1, amp = o.amp == null ? 0.14 : o.amp;
    const dir = o.dir == null ? Math.PI / 2 : o.dir, spread = o.spread == null ? 1.1 : o.spread;
    const at = (px, py) => { const i = ((py | 0) * w + (px | 0)) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const px = rnd() * w, py = rnd() * h;
      const [r, g, b, a] = at(px, py);
      if (a < 250) continue;
      const lum = 0.3 * r + 0.59 * g + 0.11 * b;
      if (lum < minLum) continue;
      const ang = dir + (rnd() - 0.5) * spread, L = len * (0.6 + rnd() * 0.8);
      const ex = px + Math.cos(ang) * L, ey = py + Math.sin(ang) * L;
      if (ex < 0 || ey < 0 || ex >= w || ey >= h) continue;
      const e = at(ex, ey);
      if (e[3] < 250 || 0.3 * e[0] + 0.59 * e[1] + 0.11 * e[2] < minLum) continue;
      const light = rnd() < 0.45, k = light ? 1 + amp + 0.06 : 1 - amp - 0.04;
      x.strokeStyle = `rgba(${Math.min(255, Math.round(r * k + (light ? 10 : 0)))},${Math.min(255, Math.round(g * k + (light ? 10 : 0)))},${Math.min(255, Math.round(b * k + (light ? 10 : 0)))},${o.alpha || 0.5})`;
      x.lineWidth = lw * (0.7 + rnd() * 0.6);
      x.beginPath(); x.moveTo(px, py); x.lineTo(ex, ey); x.stroke();
    }
    x.restore();
  } catch (err) { /* no pixel access (tests with a fake canvas): skip the texture */ }
  return c;
}

// idle variety: every so often a tower cat does one small hop. Each cat has its own beat (period 9 to 13 s and its own offset) so they never hop in unison.
export function idleHop(t, seed = 0) {
  const period = 9 + (Math.abs(Math.floor(seed)) % 5), u = (t + seed * 3.7) % period;
  return u < 0.5 ? Math.sin((u / 0.5) * Math.PI) : 0;
}

// how much of the wave is beaten: mice still queued or alive against the wave's size, kept inside 0..1 (summons can push the count past the total)
export function waveProgress(queued, alive, total) {
  if (!(total > 0)) return 0;
  return Math.min(1, Math.max(0, 1 - (queued + alive) / total));
}

// low-health warning strength, 0 to 1: how deep the weakest living cat is below 30% health. Fallen cats (hp 0) are ignored.
export function dangerLevel(cats) {
  let worst = 1;
  for (const c of cats) if (c.hp > 0 && c.max > 0) worst = Math.min(worst, c.hp / c.max);
  return worst >= 0.3 ? 0 : Math.min(1, (0.3 - worst) / 0.3);
}

// a short summary under "WAVE CLEARED!": mice beaten, coins earned and how long it took (parts with nothing to show are left out)
export function clearLine(r) {
  if (!r) return '';
  const parts = [];
  if (r.kills > 0) parts.push(`${r.kills} ${r.kills === 1 ? 'mouse' : 'mice'}`);
  if (r.coins >= 1) parts.push(`+${Math.floor(r.coins)} coins`);
  if (r.time > 0) parts.push(`${Math.round(r.time)}s`);
  return parts.join(' · ');
}

// two-tap confirm for a destructive button: the first tap arms it, a second tap within `win` seconds fires. armedAt 0 means not armed.
export function confirmTap(armedAt, now, win = 3) {
  if (armedAt > 0 && now - armedAt <= win) return { fire: true, armedAt: 0 };
  return { fire: false, armedAt: now };
}
