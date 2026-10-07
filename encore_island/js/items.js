'use strict';
// ---- premium item art ----------------------------------------------------------------
// Every item is painted once at 128px in the Hocus Vocus sticker style (warm outline, lit gradient, gloss, sparkle),
// cached as an offscreen sprite, and blitted at any size. Headless/no-canvas falls back to painting directly.
const ILN = '#2d170f';
// lit vertical gradient from a base colour
function litGrad(c, y0, y1, hi, lo) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, mixc(c, '#ffffff', hi === undefined ? 0.55 : hi)); g.addColorStop(0.45, c); g.addColorStop(1, mixc(c, '#1a0a30', lo === undefined ? 0.38 : lo));
  return g;
}
// outlined, lit shape: path() builds the geometry
function shape(path, c, y0, y1, lw, hi, lo) {
  ctx.beginPath(); path(); ctx.lineJoin = 'round'; ctx.lineWidth = lw || 7; ctx.strokeStyle = ILN; ctx.stroke();
  ctx.fillStyle = typeof c === 'string' && c[0] === '#' ? litGrad(c, y0, y1, hi, lo) : c; ctx.fill();
}
function spark(x, y, r, a) {
  ctx.save(); ctx.translate(x, y); ctx.globalAlpha = a === undefined ? 0.95 : a; ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(0, -r); ctx.quadraticCurveTo(r * 0.12, -r * 0.12, r, 0); ctx.quadraticCurveTo(r * 0.12, r * 0.12, 0, r); ctx.quadraticCurveTo(-r * 0.12, r * 0.12, -r, 0); ctx.quadraticCurveTo(-r * 0.12, -r * 0.12, 0, -r); ctx.fill();
  ctx.restore();
}
function glossE(x, y, rx, ry, rot, a) { ctx.save(); ctx.globalAlpha = a === undefined ? 0.55 : a; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, 6.29); ctx.fill(); ctx.restore(); }
function halo(c, r, a) { const g = ctx.createRadialGradient(0, 0, 2, 0, 0, r); g.addColorStop(0, c); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.29); ctx.fill(); ctx.restore(); }
function rivet(x, y, r) { ctx.fillStyle = ILN; ctx.beginPath(); ctx.arc(x, y + 1, r + 1.5, 0, 6.29); ctx.fill(); ctx.fillStyle = '#fff4e6'; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.29); ctx.fill(); }

// ---- helmets: one silhouette per metal tier (copper → uranium), a gold star badge per extra lap of 8 ----
const HELM_PAINT = [
  // 0 copper: riveted pot helm
  (c) => {
    shape(() => { ctx.moveTo(-40, 26); ctx.lineTo(-40, -6); ctx.arc(0, -6, 40, Math.PI, 0); ctx.lineTo(40, 26); ctx.closePath(); }, c, -48, 28);
    shape(() => ctx.roundRect ? ctx.roundRect(-46, 14, 92, 18, 9) : rr(-46, 14, 92, 18, 9), mixc(c, '#ffffff', 0.12), 14, 32, 6);
    ctx.fillStyle = '#3a1a10'; rr(-24, -2, 48, 11, 5); ctx.fill();
    for (const x of [-34, -17, 0, 17, 34]) rivet(x, 23, 3.2);
    shape(() => ctx.arc(0, -48, 7, 0, 6.29), c, -56, -40, 5);
    glossE(-17, -26, 12, 6, -0.7); spark(24, -28, 9);
  },
  // 1 bronze: Greek helm with a horsehair crest
  (c) => {
    ctx.lineCap = 'round'; ctx.strokeStyle = ILN; ctx.lineWidth = 22; ctx.beginPath(); ctx.moveTo(-34, -30); ctx.bezierCurveTo(-30, -78, 30, -78, 34, -30); ctx.stroke();
    ctx.strokeStyle = '#ff5a6a'; ctx.lineWidth = 14; ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-26, -42); ctx.bezierCurveTo(-18, -68, 10, -70, 18, -62); ctx.stroke();
    shape(() => { ctx.moveTo(-40, 30); ctx.lineTo(-40, -6); ctx.arc(0, -6, 40, Math.PI, 0); ctx.lineTo(40, 30); ctx.quadraticCurveTo(32, 40, 24, 34); ctx.lineTo(24, 8); ctx.lineTo(-24, 8); ctx.lineTo(-24, 34); ctx.quadraticCurveTo(-32, 40, -40, 30); ctx.closePath(); }, c, -48, 38);
    ctx.fillStyle = '#3a1a10'; rr(-22, 8, 44, 24, 6); ctx.fill();
    shape(() => rr(-6, 6, 12, 30, 5), mixc(c, '#ffffff', 0.15), 6, 36, 5);
    shape(() => rr(-42, -10, 84, 11, 5), mixc(c, '#ffffff', 0.2), -10, 1, 5);
    glossE(-18, -26, 12, 6, -0.7); spark(26, -20, 9);
  },
  // 2 silver: great helm with a blue plume
  (c) => {
    ctx.save(); ctx.translate(2, -48); ctx.rotate(0.12);
    for (let i = 0; i < 4; i++) { shape(() => ctx.ellipse(8 + i * 3, -14 - i * 7, 14 - i * 1.5, 9, 0.5 - i * 0.1, 0, 6.29), i % 2 ? '#7aa6ff' : '#4f7fe8', -50, 0, 5, 0.35, 0.3); }
    ctx.restore();
    shape(() => { ctx.moveTo(-36, 42); ctx.lineTo(-36, -22); ctx.quadraticCurveTo(-36, -48, 0, -48); ctx.quadraticCurveTo(36, -48, 36, -22); ctx.lineTo(36, 42); ctx.quadraticCurveTo(0, 52, -36, 42); ctx.closePath(); }, c, -48, 50);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; rr(-5, -46, 10, 92, 4); ctx.fill();
    ctx.fillStyle = '#2a1230'; rr(-31, -9, 62, 11, 5); ctx.fill();
    for (const [x, y] of [[14, 14], [22, 14], [14, 22], [22, 22], [14, 30], [22, 30]]) { ctx.fillStyle = '#2a1230'; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 6.29); ctx.fill(); }
    glossE(-22, -30, 9, 14, 0.2); spark(24, -32, 9);
  },
  // 3 gold: winged helm with a ruby
  (c) => {
    for (const sd of [-1, 1]) {
      ctx.save(); ctx.scale(sd, 1);
      for (let i = 0; i < 4; i++) { ctx.save(); ctx.translate(30, -12); ctx.rotate(-0.5 - i * 0.34); shape(() => ctx.ellipse(26, 0, 28 - i * 3, 8.5, 0, 0, 6.29), i % 2 ? '#ffffff' : '#fff1f8', -10, 10, 5, 0.1, 0.18); ctx.restore(); }
      ctx.restore();
    }
    shape(() => { ctx.moveTo(-40, 28); ctx.lineTo(-40, -6); ctx.arc(0, -6, 40, Math.PI, 0); ctx.lineTo(40, 28); ctx.closePath(); }, c, -48, 28);
    shape(() => rr(-44, 12, 88, 18, 9), mixc(c, '#ffffff', 0.2), 12, 30, 6);
    ctx.fillStyle = '#3a1a10'; rr(-22, -2, 44, 10, 5); ctx.fill();
    shape(() => { ctx.moveTo(0, -38); ctx.lineTo(10, -28); ctx.lineTo(0, -16); ctx.lineTo(-10, -28); ctx.closePath(); }, '#ff3d6a', -38, -16, 5);
    glossE(-1, -30, 3, 5, 0, 0.7); glossE(-20, -26, 12, 6, -0.7); spark(26, -26, 10);
  },
  // 4 platinum: viking helm with horns
  (c) => {
    for (const sd of [-1, 1]) { ctx.save(); ctx.scale(sd, 1); shape(() => { ctx.moveTo(30, -4); ctx.bezierCurveTo(66, -4, 66, -36, 56, -58); ctx.bezierCurveTo(54, -34, 40, -26, 28, -28); ctx.closePath(); }, '#f6ebcf', -58, 0, 6, 0.3, 0.28); ctx.restore(); }
    shape(() => { ctx.moveTo(-38, 28); ctx.lineTo(-38, -4); ctx.arc(0, -4, 38, Math.PI, 0); ctx.lineTo(38, 28); ctx.closePath(); }, c, -44, 28);
    shape(() => rr(-42, 8, 84, 16, 8), mixc(c, '#9aa7c8', 0.3), 8, 24, 6);
    shape(() => rr(-7, 8, 14, 34, 6), mixc(c, '#ffffff', 0.1), 8, 42, 5);
    ctx.fillStyle = '#3a1a10'; rr(-26, 4, 19, 8, 4); ctx.fill(); rr(7, 4, 19, 8, 4); ctx.fill();
    for (const x of [-30, -15, 15, 30]) rivet(x, 16, 2.8);
    glossE(-18, -24, 12, 6, -0.7); spark(24, -26, 9);
  },
  // 5 mythril: crystal elven helm, glowing
  (c) => {
    halo('#6ee0d8', 60, 0.55);
    shape(() => { ctx.moveTo(-34, 30); ctx.lineTo(-38, -6); ctx.quadraticCurveTo(-38, -40, 0, -50); ctx.quadraticCurveTo(38, -40, 38, -6); ctx.lineTo(34, 30); ctx.lineTo(12, 20); ctx.lineTo(-12, 20); ctx.closePath(); }, c, -50, 30);
    for (const sd of [-1, 1]) { ctx.save(); ctx.scale(sd, 1); shape(() => { ctx.moveTo(34, 0); ctx.lineTo(60, -22); ctx.lineTo(40, 12); ctx.closePath(); }, '#9af0e8', -22, 12, 5); ctx.restore(); }
    for (const [x, h, w] of [[-16, 30, 9], [16, 30, 9], [0, 46, 12]]) shape(() => { ctx.moveTo(x - w, -38); ctx.lineTo(x, -38 - h); ctx.lineTo(x + w, -38); ctx.lineTo(x, -30); ctx.closePath(); }, '#7af7ee', -80, -30, 5, 0.5, 0.2);
    ctx.fillStyle = '#12304a'; rr(-26, -2, 52, 9, 4); ctx.fill();
    ctx.fillStyle = '#b8fff6'; rr(-24, 0, 48, 3, 2); ctx.fill();
    glossE(-20, -24, 11, 6, -0.7); spark(26, -22, 10); spark(-34, -52, 6, 0.8);
  },
  // 6 cobalt: kabuto with a golden crest
  (c) => {
    shape(() => { ctx.moveTo(-54, 34); ctx.lineTo(-36, 10); ctx.lineTo(36, 10); ctx.lineTo(54, 34); ctx.quadraticCurveTo(0, 44, -54, 34); ctx.closePath(); }, mixc(c, '#1a2a6a', 0.25), 10, 44, 6);
    shape(() => { ctx.moveTo(-38, 14); ctx.lineTo(-38, -6); ctx.arc(0, -6, 38, Math.PI, 0); ctx.lineTo(38, 14); ctx.closePath(); }, c, -44, 14);
    ctx.strokeStyle = 'rgba(20,20,70,0.45)'; ctx.lineWidth = 3;
    for (const x of [-24, -12, 0, 12, 24]) { ctx.beginPath(); ctx.moveTo(x * 0.4, -43); ctx.lineTo(x, 12); ctx.stroke(); }
    ctx.fillStyle = '#12184a'; rr(-24, 2, 48, 8, 4); ctx.fill();
    shape(() => { ctx.moveTo(0, -40); ctx.quadraticCurveTo(-26, -50, -40, -80); ctx.quadraticCurveTo(-16, -64, 0, -62); ctx.quadraticCurveTo(16, -64, 40, -80); ctx.quadraticCurveTo(26, -50, 0, -40); ctx.closePath(); }, '#ffd84d', -80, -40, 5);
    shape(() => ctx.arc(0, -52, 5.5, 0, 6.29), '#ff5a6a', -58, -46, 4);
    glossE(-18, -26, 12, 6, -0.7); spark(26, -22, 9);
  },
  // 7 uranium: toxic spiked helm with glowing eyes
  (c) => {
    halo('#b6ff3d', 62, 0.6);
    for (const [x, a, h] of [[-30, -0.5, 30], [-15, -0.2, 38], [0, 0, 44], [15, 0.2, 38], [30, 0.5, 30]]) { ctx.save(); ctx.translate(x, -34); ctx.rotate(a); shape(() => { ctx.moveTo(-8, 4); ctx.lineTo(0, -h); ctx.lineTo(8, 4); ctx.closePath(); }, '#8fbf30', -h, 4, 5, 0.4, 0.3); ctx.restore(); }
    shape(() => { ctx.moveTo(-40, 30); ctx.lineTo(-40, -6); ctx.arc(0, -6, 40, Math.PI, 0); ctx.lineTo(40, 30); ctx.quadraticCurveTo(0, 38, -40, 30); ctx.closePath(); }, mixc(c, '#2a4a10', 0.35), -48, 34);
    ctx.fillStyle = '#12200a'; ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(-6, 6); ctx.lineTo(-10, 14); ctx.lineTo(-30, 10); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(30, 0); ctx.lineTo(6, 6); ctx.lineTo(10, 14); ctx.lineTo(30, 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d8ff5a'; ctx.beginPath(); ctx.moveTo(-26, 3); ctx.lineTo(-10, 7); ctx.lineTo(-12, 10); ctx.lineTo(-26, 7); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(26, 3); ctx.lineTo(10, 7); ctx.lineTo(12, 10); ctx.lineTo(26, 7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c6ff3d'; for (const x of [-24, 0, 24]) { ctx.beginPath(); ctx.moveTo(x - 5, 30); ctx.quadraticCurveTo(x, 50, x + 5, 30); ctx.fill(); }
    glossE(-20, -24, 11, 6, -0.7); spark(26, -20, 9);
  },
];
const HELM_KEYS = []; // per helmet level: metal index, lap count and the sprite-cache key (asked for every stacked helmet, every frame)
function helmSpriteKey(k) { let h = HELM_KEYS[k]; if (!h) { const i = (k - 1) % 8, cyc = Math.min(3, Math.floor((k - 1) / 8)); HELM_KEYS[k] = h = { i, cyc, key: 'helm' + i + '_' + cyc, paint: () => paintHelmet(i, cyc) }; } return h; }
function paintHelmet(i, cyc) {
  ctx.save(); ctx.translate(0, 13); ctx.scale(0.83, 0.83);
  HELM_PAINT[i](METALS[i].col);
  ctx.restore();
  for (let n = 0; n < cyc; n++) { // one gold star badge per extra lap
    const bx = 40 - n * 24, by = -44;
    shape(() => { for (let p = 0; p < 10; p++) { const r = p % 2 ? 6 : 13, a = -1.5708 + p * 0.6283; ctx.lineTo(bx + Math.cos(a) * r, by + Math.sin(a) * r); } ctx.closePath(); }, '#ffd84d', by - 13, by + 13, 5);
  }
}
// generic cached item: key, paint fn (128px space centred on 0,0), display px at s=1
const ITEM_KEYS = {}; // 'it_' + key, built once per key so the sprite lookup never hashes a fresh string
function drawItem(key, paint, x, y, s, d) {
  s = s || 1;
  const c = sprite(ITEM_KEYS[key] || (ITEM_KEYS[key] = 'it_' + key), 128, paint);
  const w = d * s * 1.22;
  if (c) { ctx.drawImage(c, x - w / 2, y - w / 2, w, w); return; }
  ctx.save(); ctx.translate(x, y); ctx.scale(w / 128, w / 128); paint(); ctx.restore();
}
function drawHelmetIcon(x, y, k, s) { const h = helmSpriteKey(k); drawItem(h.key, h.paint, x, y, s || 1, 36); }

// ---- bars (any metal) ----
function paintBar(col, glow) {
  if (glow) halo('#b6ff3d', 62, 0.6);
  shape(() => { ctx.moveTo(-34, -16); ctx.lineTo(34, -16); ctx.lineTo(50, 4); ctx.lineTo(-50, 4); ctx.closePath(); }, mixc(col, '#ffffff', 0.45), -16, 4, 7, 0.2, 0.05);
  shape(() => rr(-50, 4, 100, 30, 6), col, 4, 34, 7);
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; rr(-40, 12, 80, 14, 5); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-40, 12); ctx.lineTo(40, 12); ctx.stroke();
  glossE(-24, -9, 16, 3.5, 0, 0.7);
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.moveTo(-18, 6); ctx.lineTo(-6, 6); ctx.lineTo(-24, 32); ctx.lineTo(-36, 32); ctx.closePath(); ctx.globalAlpha = 0.28; ctx.fill(); ctx.globalAlpha = 1;
  spark(32, -6, 10);
}
function paintCoin() {
  shape(() => ctx.arc(0, 0, 46, 0, 6.29), '#ffd84d', -46, 46, 8, 0.45, 0.25);
  ctx.strokeStyle = '#c98a10'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, 34, 0, 6.29); ctx.stroke();
  ctx.fillStyle = '#ffe98a'; ctx.beginPath(); ctx.arc(0, 0, 30, 0, 6.29); ctx.fill();
  shape(() => { for (let i = 0; i < 10; i++) { const r = i % 2 ? 7 : 17, a = -1.5708 + i * 0.6283; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); }, '#ffc21a', -17, 17, 4, 0.3, 0.2);
  glossE(-18, -22, 14, 6, -0.6, 0.65); spark(24, 22, 7, 0.8);
}
function drawCoinIcon(x, y, s) { drawItem('coin', paintCoin, x, y, s, 24); }
function drawBarIcon(x, y, s, col, glow) { drawItem('bar' + (col || '#e8b93a') + (glow ? 'g' : ''), () => paintBar(col || '#e8b93a', glow), x, y, s, 32); }

// ---- currency + valuables ----
function paintCrown() {
  shape(() => { ctx.moveTo(-46, 28); ctx.lineTo(-52, -26); ctx.lineTo(-26, -2); ctx.lineTo(0, -40); ctx.lineTo(26, -2); ctx.lineTo(52, -26); ctx.lineTo(46, 28); ctx.closePath(); }, '#ffd84d', -40, 28);
  shape(() => rr(-47, 18, 94, 16, 7), '#ffe98a', 18, 34, 6);
  for (const [x, y] of [[-52, -28], [0, -42], [52, -28]]) { ctx.fillStyle = ILN; ctx.beginPath(); ctx.arc(x, y, 9, 0, 6.29); ctx.fill(); ctx.fillStyle = '#fff4e6'; ctx.beginPath(); ctx.arc(x, y, 6.2, 0, 6.29); ctx.fill(); }
  shape(() => { ctx.moveTo(0, -4); ctx.lineTo(10, 8); ctx.lineTo(0, 20); ctx.lineTo(-10, 8); ctx.closePath(); }, '#ff3d6a', -4, 20, 4);
  shape(() => ctx.arc(-28, 10, 5.5, 0, 6.29), '#6ee0d8', 4, 16, 3); shape(() => ctx.arc(28, 10, 5.5, 0, 6.29), '#6ee0d8', 4, 16, 3);
  glossE(-22, -8, 6, 14, 0.5, 0.6); spark(30, -14, 10);
}
function drawCrownIcon(x, y, s) { drawItem('crown', paintCrown, x, y, s, 28); }
function paintGem() {
  halo('#6ee0d8', 58, 0.45);
  shape(() => { ctx.moveTo(-30, -30); ctx.lineTo(30, -30); ctx.lineTo(50, -6); ctx.lineTo(0, 50); ctx.lineTo(-50, -6); ctx.closePath(); }, '#46d8cf', -30, 50, 7, 0.3, 0.3);
  ctx.fillStyle = '#b8fff6'; ctx.beginPath(); ctx.moveTo(-30, -30); ctx.lineTo(30, -30); ctx.lineTo(18, -6); ctx.lineTo(-18, -6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#7af0e6'; ctx.beginPath(); ctx.moveTo(-30, -30); ctx.lineTo(-18, -6); ctx.lineTo(-50, -6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1fa8a4'; ctx.beginPath(); ctx.moveTo(30, -30); ctx.lineTo(50, -6); ctx.lineTo(18, -6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2cc4bf'; ctx.beginPath(); ctx.moveTo(-18, -6); ctx.lineTo(18, -6); ctx.lineTo(0, 50); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#17888a'; ctx.beginPath(); ctx.moveTo(18, -6); ctx.lineTo(50, -6); ctx.lineTo(0, 50); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-30, -30); ctx.lineTo(-18, -6); ctx.lineTo(0, 50); ctx.moveTo(30, -30); ctx.lineTo(18, -6); ctx.moveTo(-18, -6); ctx.lineTo(18, -6); ctx.stroke();
  spark(-16, -18, 11); spark(26, 10, 6, 0.8);
}
function drawGemIcon(x, y, s) { drawItem('gem', paintGem, x, y, s, 24); }

// stack entry: helmet / bar / crown
function drawStackEntry(e, x, y, s) {
  if (e.crown) drawCrownIcon(x, y, s);
  else if (e.bar) { const m = metal(e.k || 1); drawBarIcon(x, y, s, m.col, m.glow); }
  else drawHelmetIcon(x, y, e.k, s);
}
