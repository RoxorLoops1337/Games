// 12m enemy art: every boss stage (10, 15, ... 50) wears its own crown and its own aura, so the nine bosses stop looking like two
// (the species cycle only gives sleepy and gloomy bosses). Plain canvas painters, baked once per stage by art_draw.js (one rotated
// drawImage for the aura and one for the crown per frame, no gradients per frame).
const TAU = Math.PI * 2, INK = '#2d170f';
// metal [light, dark], gem, aura colour, prongs, aura style, extra crown part
const TIERS = [
  { metal: ['#e8a868', '#98561e'], gem: '#ff5a5a', aura: '#ffb27a', prongs: 3, style: 'rays', n: 10 },
  { metal: ['#eef2fa', '#8c9ab8'], gem: '#6fe3ff', aura: '#bfe9ff', prongs: 4, style: 'ring', n: 12 },
  { metal: ['#ffd84d', '#d98f1a'], gem: '#ff3d7a', aura: '#ffe08a', prongs: 5, style: 'rays', n: 14 },
  { metal: ['#86e898', '#2f8f4a'], gem: '#fff1a8', aura: '#9dffa8', prongs: 5, style: 'petals', n: 8 },
  { metal: ['#ff7a98', '#b8284a'], gem: '#ffffff', aura: '#ff7a9a', prongs: 6, style: 'rays', n: 16 },
  { metal: ['#86b0ff', '#2f4fb0'], gem: '#ffe27a', aura: '#8fb8ff', prongs: 6, style: 'petals', n: 10 },
  { metal: ['#cfa0ff', '#6a3ab8'], gem: '#7dffd2', aura: '#d2a8ff', prongs: 7, style: 'notes', n: 6 },
  { metal: ['#5a6284', '#1a1d2e'], gem: '#ff7a2a', aura: '#ff9a4a', prongs: 7, style: 'flames', n: 12 },
  { metal: ['#fff6d0', '#e0b84a'], gem: '#ff5a8a', aura: '#ffe9a0', prongs: 9, style: 'sun', n: 18 },
];
export const BOSS_TIER_COUNT = TIERS.length;
// stage -> tier index, -1 when the boss keeps the plain look (stage 5 and non-boss stages)
export const bossTierB12m = stage => (stage >= 10 && stage <= 50 && stage % 5 === 0 ? Math.min(TIERS.length - 1, stage / 5 - 2) : -1);
export const tierInfoB12m = i => TIERS[i] || null;

function poly(g, pts) { g.beginPath(); for (let i = 0; i < pts.length; i++) i ? g.lineTo(pts[i][0], pts[i][1]) : g.moveTo(pts[i][0], pts[i][1]); g.closePath(); }
function dot(g, x, y, r, col, lw) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = col; g.fill(); g.lineWidth = lw; g.strokeStyle = INK; g.stroke(); }

// The crown, painted in head space (origin = head centre) like crownPaint: cy is the crown band's vertical centre.
export function paintCrownB12m(g, R, cy, i) {
  const T = TIERS[i]; if (!T) return;
  const n = T.prongs, half = R * (0.5 + n * 0.028), lw = Math.max(2.4, R * 0.075);
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  const pts = [[-half, cy + R * 0.16]];
  for (let k = 0; k < n; k++) {
    const x = n === 1 ? 0 : -half + (2 * half) * k / (n - 1), mid = (n - 1) / 2, tall = 1 - Math.abs(k - mid) / (mid + 0.5) * 0.45;
    pts.push([x, cy - R * (0.2 + 0.42 * tall)]);
    if (k < n - 1) pts.push([x + half / (n - 1), cy - R * 0.06]);
  }
  pts.push([half, cy + R * 0.16]);
  poly(g, pts); g.fillStyle = T.metal[1]; g.fill();
  g.save(); g.translate(R * 0.04, -R * 0.04); poly(g, pts); g.fillStyle = T.metal[0]; g.fill(); g.restore();
  poly(g, pts); g.lineWidth = lw; g.strokeStyle = INK; g.stroke();
  // band with a row of studs
  g.beginPath(); g.moveTo(-half * 0.92, cy + R * 0.02); g.lineTo(half * 0.92, cy + R * 0.02); g.lineWidth = R * 0.07; g.strokeStyle = T.metal[1]; g.stroke();
  // a gem on every tip, the middle one bigger
  for (let k = 0; k < n; k++) {
    const x = n === 1 ? 0 : -half + (2 * half) * k / (n - 1), mid = (n - 1) / 2, tall = 1 - Math.abs(k - mid) / (mid + 0.5) * 0.45, big = Math.abs(k - mid) < 0.5;
    const col = i === 8 ? ['#ff5a8a', '#ffd84d', '#6fe3ff', '#9dff6d', '#c89aff'][k % 5] : T.gem;
    dot(g, x, cy - R * (0.2 + 0.42 * tall) - R * 0.02, R * (big ? 0.1 : 0.07), col, 1.8);
  }
  for (let k = 0; k < 3; k++) dot(g, (k - 1) * R * 0.3, cy + R * 0.1, R * 0.055, T.gem, 1.4);
  if (i === 8) {   // the final crown carries a star on top
    g.save(); g.translate(0, cy - R * 0.72); g.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? R * 0.08 : R * 0.18; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    g.closePath(); g.fillStyle = '#fff1a8'; g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke(); g.restore();
  }
  g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.ellipse(-half * 0.55, cy - R * 0.05, R * 0.04, R * 0.1, 0.5, 0, TAU); g.fill();
  g.restore();
}

// The aura, painted around the head centre in a box of 5R x 5R (so up to 2.5R out). It is baked and drawn rotating slowly.
export function paintAuraB12m(g, R, i) {
  const T = TIERS[i]; if (!T) return;
  const n = T.n, c = T.aura;
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
  // a soft disc behind everything (baked once, so the gradient costs nothing per frame)
  const gr = g.createRadialGradient(0, 0, R * 0.9, 0, 0, R * 2.35);
  gr.addColorStop(0, c + 'aa'); gr.addColorStop(1, c + '00');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R * 2.35, 0, TAU); g.fill();
  g.globalAlpha = 0.85;
  if (T.style === 'rays' || T.style === 'sun' || T.style === 'flames') {
    for (let k = 0; k < n; k++) {
      const a = k / n * TAU, long = k % 2 === 0, L = (T.style === 'sun' ? (long ? 2.35 : 1.8) : long ? 2.05 : 1.6) * R, w = (T.style === 'flames' ? 0.2 : 0.11) * R;
      g.save(); g.rotate(a);
      if (T.style === 'flames') poly(g, [[R * 1.12, -w], [R * 1.5, -w * 1.6], [L, 0], [R * 1.5, w * 0.5], [R * 1.12, w]]); else poly(g, [[R * 1.15, -w], [L, 0], [R * 1.15, w]]);
      g.fillStyle = T.style === 'sun' && !long ? '#ff9ac6' : c; g.fill(); g.lineWidth = Math.max(2, R * 0.045); g.strokeStyle = INK; g.stroke(); g.restore();
    }
  } else if (T.style === 'ring') {
    for (const [rr, m, sz] of [[1.55, n, 0.09], [1.95, n * 2, 0.06]]) {
      g.beginPath(); g.arc(0, 0, R * rr, 0, TAU); g.lineWidth = R * 0.035; g.strokeStyle = c; g.globalAlpha = 0.55; g.stroke(); g.globalAlpha = 0.9;
      for (let k = 0; k < m; k++) { const a = k / m * TAU; dot(g, Math.cos(a) * R * rr, Math.sin(a) * R * rr, R * sz, k % 2 ? '#ffffff' : c, 1.6); }
    }
  } else if (T.style === 'petals') {
    for (let k = 0; k < n; k++) {
      const a = k / n * TAU; g.save(); g.rotate(a); g.beginPath(); g.ellipse(R * 1.65, 0, R * 0.55, R * 0.2, 0, 0, TAU);
      g.fillStyle = c; g.fill(); g.lineWidth = Math.max(2, R * 0.05); g.strokeStyle = INK; g.stroke(); g.restore();
    }
  } else if (T.style === 'notes') {
    for (let k = 0; k < n; k++) {
      const a = k / n * TAU; g.save(); g.rotate(a); g.translate(R * 1.8, 0); g.rotate(-a);   // each note stays upright in the bake
      g.beginPath(); g.ellipse(0, 0, R * 0.2, R * 0.15, -0.4, 0, TAU); g.fillStyle = c; g.fill(); g.lineWidth = 2.4; g.strokeStyle = INK; g.stroke();
      g.beginPath(); g.moveTo(R * 0.17, -R * 0.03); g.lineTo(R * 0.17, -R * 0.5); g.lineTo(R * 0.4, -R * 0.36); g.lineWidth = R * 0.07; g.strokeStyle = INK; g.stroke(); g.lineWidth = R * 0.035; g.strokeStyle = c; g.stroke();
      g.restore();
    }
  }
  g.restore();
}
