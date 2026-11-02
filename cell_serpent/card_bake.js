// 07-cards round 8: the card foils and the luck meter tip are baked once into small images (CSS custom properties on <html>),
// so the pick screen animates only transforms and opacity on cached layers: no masks on oversized layers, no moving gradient
// backgrounds, no blend modes. Low-end phones keep 60 fps while three Godlike foils spin. The CSS that uses them is gated on
// html.cb, so without a canvas (tests, very old browsers) the old gradient CSS keeps working.
const TAU = Math.PI * 2;
export const FOIL_COLORS = ['#cfd8e8', '#4fb8ff', '#b06cff', '#ffb04d', '#ff4d7a', '#ffe14a'];   // same as RARITIES in sim.js (a test pins this)
const S = 96;

function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function url(c) { return `url("${c.toDataURL('image/png')}")`; }
function radial(g, cx, cy, r, stops) { const q = g.createRadialGradient(cx, cy, 0, cx, cy, r); for (const [o, c] of stops) q.addColorStop(o, c); return q; }
function dots(g, col, pitch, r) { g.fillStyle = col; for (let y = pitch / 2; y < S; y += pitch) for (let x = pitch / 2; x < S; x += pitch) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); } }
function hatch(g, col, pitch, lw, dir) { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); for (let k = -S; k < S * 2; k += pitch) { if (dir > 0) { g.moveTo(k, S); g.lineTo(k + S, 0); } else { g.moveTo(k, 0); g.lineTo(k + S, S); } } g.stroke(); }

function plate(rn) {
  const [c, g] = mk(S, S), col = FOIL_COLORS[rn];
  if (rn <= 1) {
    g.fillStyle = radial(g, S / 2, S * 0.38, S * 0.6, [[0, 'rgba(255,255,255,.33)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(0, 0, S, S);
    dots(g, rgba(col, 0.45), 11, 1.6);
    if (rn === 1) { g.lineWidth = 1.3; g.strokeStyle = rgba(col, 0.55); g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 7, 0, TAU); g.stroke(); g.fillStyle = radial(g, S / 2, S / 2, S / 2, [[0.7, 'rgba(0,0,0,0)'], [1, rgba(col, 0.35)]]); g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 7, 0, TAU); g.fill(); }
  } else if (rn === 2) {
    hatch(g, rgba(col, 0.55), 8.5, 1.6, 1);
    g.fillStyle = radial(g, S / 2, S * 0.4, S * 0.7, [[0, rgba('#ecd4ff', 0.55)], [1, 'rgba(176,108,255,0)']]); g.fillRect(0, 0, S, S);
  } else if (rn === 3) {
    g.fillStyle = radial(g, S / 2, S / 2, S * 0.72, [[0, '#9a6522'], [0.55, '#6b4012'], [1, 'rgba(255,176,77,.4)']]); g.fillRect(0, 0, S, S);
  } else if (rn === 4) {
    g.fillStyle = '#2a0a1c'; g.fillRect(0, 0, S, S); hatch(g, rgba(col, 0.5), 13, 1.2, 1); hatch(g, rgba(col, 0.5), 13, 1.2, -1);
  } else {
    g.fillStyle = '#5a4600'; g.fillRect(0, 0, S, S); hatch(g, 'rgba(255,255,255,.27)', 13, 1.2, 1); hatch(g, 'rgba(255,255,255,.27)', 13, 1.2, -1);
  }
  return c;
}
// Rotating layers: sunburst (Legendary) and rainbow prism (Godlike), already faded out at the edge so they need no mask.
function burst(rainbow) {
  const R = 2 * S, [c, g] = mk(R, R); g.translate(R / 2, R / 2);
  if (rainbow) {
    const cols = ['#ffe14a', '#ff7ad0', '#6fe3ff', '#9dff6d', '#ffe14a'];
    for (let i = 0; i < 72; i++) { const t = i / 72 * 4, k = Math.floor(t); g.fillStyle = mixc(cols[k], cols[k + 1], t - k); g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, i / 72 * TAU - 0.02, (i + 1) / 72 * TAU + 0.02); g.closePath(); g.fill(); }
  } else {
    g.fillStyle = 'rgba(255,210,122,.55)';
    for (let i = 0; i < 18; i++) { g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, i * TAU / 18, i * TAU / 18 + 7 * TAU / 360); g.closePath(); g.fill(); }
  }
  g.globalCompositeOperation = 'destination-in'; g.fillStyle = radial(g, 0, 0, R * 0.44, [[0.1, '#000'], [1, 'rgba(0,0,0,0)']]); g.fillRect(-R / 2, -R / 2, R, R);
  return c;
}
function mixc(a, b, f) { const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16), m = s => Math.round(((x >> s) & 255) * (1 - f) + ((y >> s) & 255) * f); return `rgb(${m(16)},${m(8)},${m(0)})`; }
function glints() {
  const [c, g] = mk(S, S);
  for (const [x, y, r] of [[0.14, 0.2, 1.7], [0.8, 0.28, 1.3], [0.66, 0.82, 1.5], [0.22, 0.76, 1.3]]) { g.fillStyle = radial(g, x * S, y * S, r * 2.4, [[0, '#fff'], [0.45, '#fff'], [0.46, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']]); g.beginPath(); g.arc(x * S, y * S, r * 2.4, 0, TAU); g.fill(); }
  return c;
}
function sweep() {   // a soft diagonal band centred in the tile (Epic foil sheen and the card wide sheen both use it)
  const [c, g] = mk(S, S); g.translate(S / 2, S / 2); g.rotate(0.3);
  const q = g.createLinearGradient(-S * 0.32, 0, S * 0.32, 0); q.addColorStop(0, 'rgba(255,255,255,0)'); q.addColorStop(0.3, 'rgba(255,255,255,.4)'); q.addColorStop(0.5, 'rgba(120,255,255,.35)'); q.addColorStop(0.7, 'rgba(255,136,255,.4)'); q.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = q; g.fillRect(-S * 0.32, -S, S * 0.64, S * 2);
  return c;
}
function beat(col) { const [c, g] = mk(S, S); g.fillStyle = radial(g, S / 2, S / 2, S * 0.66, [[0, mixc('#ffffff', col, 0.75)], [1, rgba(col, 0)]]); g.fillRect(0, 0, S, S); return c; }
function tip() { const [c, g] = mk(24, 24); g.fillStyle = radial(g, 12, 12, 12, [[0, '#fff'], [0.4, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(0, 0, 24, 24); return c; }
function stripe() { const [c, g] = mk(64, 8); const q = g.createLinearGradient(0, 0, 64, 0); q.addColorStop(0, 'rgba(255,255,255,0)'); q.addColorStop(0.5, 'rgba(255,255,255,.62)'); q.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = q; g.fillRect(0, 0, 64, 8); return c; }
function tile(col) { const [c, g] = mk(8, 8); g.strokeStyle = col; g.lineWidth = 1.2; g.beginPath(); for (const k of [-8, 0, 8]) { g.moveTo(k, 8); g.lineTo(k + 8, 0); } g.stroke(); return c; }

let done = false;
export function bakeCardArt(root) {
  if (done) return true;
  try {
    if (typeof document === 'undefined') return false;
    const st = (root || document.documentElement).style, set = (k, c) => st.setProperty(k, url(c));
    for (let i = 0; i < 6; i++) set('--cb-f' + i, plate(i));
    set('--cb-burst3', burst(false)); set('--cb-burst5', burst(true)); set('--cb-glint', glints()); set('--cb-sweep', sweep());
    set('--cb-beat4', beat(FOIL_COLORS[4])); set('--cb-tip', tip()); set('--cb-stripe', stripe());
    set('--cb-h2', tile(rgba(FOIL_COLORS[2], 0.4))); set('--cb-h3', tile('rgba(255,210,122,.3)')); set('--cb-h4', tile(rgba(FOIL_COLORS[4], 0.4))); set('--cb-h5', tile('rgba(255,255,255,.22)'));
    (root || document.documentElement).classList.add('cb'); done = true; return true;
  } catch (e) { return false; }
}
