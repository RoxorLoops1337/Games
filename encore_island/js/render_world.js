'use strict';
// Encore Island — world rendering: water, organic islands, boardwalks, hub furniture, plates, actors, effects.
let vw = 412, vh = 860, dpr = 1, scl = 1, vL = 0, vR = 0, vT = 0, vB = 0, hits = [];
const CAM = { x: 0, y: 0, init: false };
const PLATE_POS = [];
const vis = (x, y, m) => x > vL - m && x < vR + m && y > vT - m && y < vB + m;
function blobPath(g, sc, dx, dy) {
  ctx.beginPath(); const n = RAD_N; let px = 0, py = 0, fx = 0, fy = 0;
  for (let i = 0; i <= n; i++) {
    const a = (i % n) / n * TAU, r = g.rad[i % n] * sc, x = g.x + dx + Math.cos(a) * r, y = g.y + dy + Math.sin(a) * r;
    if (i === 0) { ctx.moveTo(x, y); fx = x; fy = y; } else { ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2); }
    px = x; py = y;
  }
  ctx.quadraticCurveTo(px, py, (px + fx) / 2, (py + fy) / 2); ctx.closePath();
}
function landVisible(g) { const m = g.r * 1.3 + 60; return g.x + m > vL && g.x - m < vR && g.y + m > vT && g.y - m < vB; }
function drawWater() {
  // water tint follows the biome of the island nearest the camera
  const kk = nearestLandIdx(CAM.x, CAM.y), B = kk === 0 ? BIOMES[0] : biomeOf(kk);
  const g = ctx.createLinearGradient(0, 0, 0, vh); g.addColorStop(0, mixc('#8fe3f0', B.shore, 0.25)); g.addColorStop(1, mixc('#4fb4d4', B.deep, 0.35));
  ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
  ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  const sp = 120, ox = -(CAM.x * scl * 0.9) % sp, oy = -(CAM.y * scl * 0.9) % sp;
  for (let y = -sp; y < vh + sp; y += sp * 0.62) for (let x = -sp; x < vw + sp; x += sp) {
    const wx = x + ox + ((Math.round(y / sp * 1.6)) % 2) * sp * 0.5, wy = y + oy + Math.sin(S.t * 0.8 + x * 0.02 + y * 0.01) * 4;
    ctx.beginPath(); ctx.moveTo(wx, wy); ctx.quadraticCurveTo(wx + 14, wy - 8, wx + 28, wy); ctx.quadraticCurveTo(wx + 42, wy + 8, wx + 56, wy); ctx.stroke();
  }
  ctx.restore();
}
function drawIslandBase(g, B) { // cliff thickness + animated foam
  const t = S.t;
  for (const [off, col] of [[34, mixc(B.cliff, '#1a0a30', 0.35)], [22, B.cliff], [12, mixc(B.cliff, B.deep, 0.5)]]) { ctx.fillStyle = col; blobPath(g, 1, 0, off); ctx.fill(); }
  ctx.fillStyle = 'rgba(30,10,60,0.18)'; blobPath(g, 1.06, 0, 46); ctx.fill();
  ctx.save(); ctx.lineJoin = 'round';
  for (const [sc, a, w, ph] of [[1.045, 0.5, 12, 0], [1.085, 0.28, 8, 1.7]]) { const pul = 0.5 + 0.5 * Math.sin(t * 1.4 + ph + g.k); ctx.globalAlpha = a * (0.55 + 0.45 * pul); ctx.strokeStyle = B.shore; ctx.lineWidth = w; blobPath(g, sc + pul * 0.012, 0, 8); ctx.stroke(); }
  ctx.restore();
}
function drawIslandTop(g, B, bi, born) {
  const grow = born === undefined ? 1 : easeBack(clamp((S.t - born) / 1.1, 0, 1));
  if (grow < 1) { ctx.save(); ctx.translate(g.x, g.y); ctx.scale(Math.max(0.05, grow), Math.max(0.05, grow)); ctx.translate(-g.x, -g.y); }
  const fill = ctx.createRadialGradient(g.x, g.y - g.r * 0.2, g.r * 0.1, g.x, g.y, g.r * 1.15); fill.addColorStop(0, B.g[0]); fill.addColorStop(1, B.g[1]);
  ctx.fillStyle = fill; blobPath(g, 1, 0, 0); ctx.fill();
  const gp = groundPat('b' + bi, B.g, B.tuft, B.flowers, 'grass');
  ctx.save(); blobPath(g, 1, 0, 0); ctx.clip(); if (gp) { ctx.fillStyle = gp; ctx.fillRect(g.x - g.r * 1.3, g.y - g.r * 1.3, g.r * 2.6, g.r * 2.6); }
  ctx.strokeStyle = rgba('#ffffff', 0.55); ctx.lineWidth = 10; blobPath(g, 0.985, 0, 0); ctx.stroke(); // sunny rim
  ctx.strokeStyle = rgba(B.deep, 0.32); ctx.lineWidth = 30; blobPath(g, 1.0, 0, 0); ctx.stroke(); // soft inner edge shade
  ctx.restore();
  if (grow < 1) ctx.restore();
}
function drawPaths(maxK) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let k = 1; k <= maxK; k++) {
    const g = geoOf(k), P = g.path; if (!landVisible(g) && !landVisible(geoOf(g.parent))) continue;
    for (const [w, col] of [[PATH_HALF * 2 + 14, HV.line], [PATH_HALF * 2 + 4, '#c9a878'], [PATH_HALF * 2 - 10, '#f6e7c8']]) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(P[0].x, P[0].y); for (let i = 1; i < P.length; i++) ctx.lineTo(P[i].x, P[i].y); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,126,182,0.35)'; ctx.lineWidth = 6; ctx.setLineDash([14, 22]); ctx.beginPath(); ctx.moveTo(P[0].x, P[0].y); for (let i = 1; i < P.length; i++) ctx.lineTo(P[i].x, P[i].y); ctx.stroke(); ctx.setLineDash([]);
  }
}
// mist hiding the next, still-locked island
function drawMist(kn) {
  const g = geoOf(kn); if (!landVisible(g)) return;
  const B = biomeOf(kn);
  ctx.fillStyle = rgba(B.g[0], 0.22); blobPath(g, 0.96, 0, 0); ctx.fill();
  ctx.save(); ctx.fillStyle = rgba('#ffffff', 0.78);
  for (let i = 0; i < 16; i++) { const a = i / 16 * TAU + S.t * 0.07 * (i % 2 ? 1 : -1), r = g.r * (0.18 + 0.5 * hash01(kn * 31 + i)) , bx = g.x + Math.cos(a) * r, by = g.y + Math.sin(a) * r * 0.85 + Math.sin(S.t * 0.6 + i) * 6, br = 70 + 60 * hash01(kn * 17 + i);
    ctx.globalAlpha = 0.5 + 0.3 * hash01(i + kn); ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.fill(); }
  ctx.restore();
  ctx.save(); ctx.translate(g.x, g.y - 20 + Math.sin(S.t * 1.6) * 5); drawIcon('lock', 0, 0, 90); ctx.restore();
  labelPill(B.name, g.x, g.y + 60, '#ffffff', '#d8c8ff', 15);
}
const HUBDECOR = (function () {
  const r = mkRng(77), out = [];
  for (let i = 0; i < 44; i++) {
    const a = i / 44 * TAU + r() * 0.1, rr0 = radiusAt(HUB_GEO, a) * (0.935 + r() * 0.045), x = Math.cos(a) * rr0, y = Math.sin(a) * rr0, bush = i % 4 === 0;
    let ok = true; for (const o of HUB_KEEP) if (o !== HUB_KEEP[0] && Math.hypot(x - o.x, y - o.y) < 125) ok = false;
    if (ok) out.push({ t: bush ? 'bush' : 'tree', x, y, s: bush ? 1.1 : 0.78 + r() * 0.3, v: (r() * 3) | 0 }); else r();
  }
  out.sort((p, q) => p.y - q.y); return out;
})();
// ---- hub lamp posts: warm lanterns ringing the plaza, pulsing on the beat ----
const HUBLAMPS = (function () {
  const out = [], R = HUB.r * 0.8, gates = [];
  for (let k = 1; k <= 40; k++) if (geoOf(k).parent === 0) gates.push(unlockSpot(k));
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * TAU + 0.12, x = Math.cos(a) * R, y = Math.sin(a) * R; let ok = true;
    for (const o of HUB_KEEP) if (o !== HUB_KEEP[0] && Math.hypot(x - o.x, y - o.y) < 108) ok = false;
    for (const gt of gates) if (Math.hypot(x - gt.x, y - gt.y) < 105) ok = false;
    if (ok) out.push({ x, y, ph: i * 0.7 });
  }
  return out;
})();
function paintLamp() {
  const LN = HV.line;
  ctx.fillStyle = LN; rr(-6, -4, 12, 58, 4); ctx.fill(); ctx.fillStyle = '#8a6cc8'; rr(-3.5, -2, 7, 54, 3); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-2.5, 0, 2, 50);
  ctx.fillStyle = LN; ctx.beginPath(); ctx.ellipse(0, 54, 15, 7, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#6a4aa8'; ctx.beginPath(); ctx.ellipse(0, 53, 12, 5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = LN; rr(-13, -34, 26, 34, 9); ctx.fill();
  const g = ctx.createLinearGradient(0, -31, 0, -3); g.addColorStop(0, '#fff6c0'); g.addColorStop(1, '#ffb640'); ctx.fillStyle = g; rr(-10, -31, 20, 28, 7); ctx.fill();
  ctx.fillStyle = '#ffd84d'; ctx.beginPath(); ctx.arc(0, -17, 5, 0, TAU); ctx.fill(); glossE(-4, -25, 3, 6, 0.2, 0.7);
  ctx.fillStyle = LN; ctx.beginPath(); ctx.moveTo(-16, -33); ctx.lineTo(0, -48); ctx.lineTo(16, -33); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#ff7eb6'; ctx.beginPath(); ctx.moveTo(-12, -35); ctx.lineTo(0, -44); ctx.lineTo(12, -35); ctx.closePath(); ctx.fill();
}
function drawLamp(l) {
  const c = sprite('lamp', 128, () => { ctx.scale(1, 1); ctx.translate(0, -8); paintLamp(); });
  const pu = 0.65 + 0.35 * Math.max(0, 1 - (beatNow() % 1) * 2.5) + Math.sin(S.t * 3 + l.ph) * 0.06;
  ctx.fillStyle = 'rgba(40,20,80,0.2)'; ctx.beginPath(); ctx.ellipse(l.x + 4, l.y + 6, 18, 6, 0, 0, TAU); ctx.fill();
  if (c) ctx.drawImage(c, l.x - 56, l.y - 122, 112, 112); else { ctx.save(); ctx.translate(l.x, l.y - 40); paintLamp(); ctx.restore(); }
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; const gl = ctx.createRadialGradient(l.x, l.y - 84, 2, l.x, l.y - 84, 80); gl.addColorStop(0, 'rgba(255,214,120,' + (0.5 * pu) + ')'); gl.addColorStop(1, 'rgba(255,214,120,0)'); ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(l.x, l.y - 84, 80, 0, TAU); ctx.fill(); ctx.restore();
}
function drawHubFloor() {
  const g = HUB_GEO, B = BIOMES[0];
  const rad = HUB.r * 0.88;
  ctx.fillStyle = HV.line; ctx.beginPath(); ctx.arc(0, 0, rad + 8, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff1d6'; ctx.beginPath(); ctx.arc(0, 0, rad, 0, TAU); ctx.fill();
  const cp = groundPat('plaza', ['#fff1d6', '#fff1d6'], '#efd6ae', null, 'cobble');
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, rad, 0, TAU); ctx.clip(); if (cp) { ctx.fillStyle = cp; ctx.fillRect(-rad, -rad, rad * 2, rad * 2); } ctx.restore();
  ctx.strokeStyle = 'rgba(255,126,182,0.6)'; ctx.lineWidth = 5; ctx.setLineDash([16, 14]); ctx.beginPath(); ctx.arc(0, 0, rad - 18, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  // the stage the heroes come out on
  const sx = STAGE.x, sy = STAGE.y + 18;
  ctx.fillStyle = 'rgba(40,20,80,0.25)'; ctx.beginPath(); ctx.ellipse(sx, sy + 14, 120, 42, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = HV.line; ctx.beginPath(); ctx.ellipse(sx, sy + 6, 112, 42, 0, 0, TAU); ctx.fill();
  const sg = ctx.createLinearGradient(0, sy - 30, 0, sy + 40); sg.addColorStop(0, '#ff9ac8'); sg.addColorStop(1, '#d8559a'); ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(sx, sy, 106, 38, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff4e6'; ctx.beginPath(); ctx.ellipse(sx, sy - 3, 92, 31, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,126,182,0.22)'; ctx.beginPath(); ctx.ellipse(sx, sy - 3, 74, 24, 0, 0, TAU); ctx.fill();
  const beat = (beatNow() % 1), pu = Math.max(0, 1 - beat * 3);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; // sweeping spotlight beams
  for (let i = 0; i < 3; i++) { const sw = Math.sin(S.t * 0.9 + i * 2.1) * 46, bx = sx + (i - 1) * 62; ctx.fillStyle = ['rgba(255,150,200,0.10)', 'rgba(150,240,190,0.09)', 'rgba(190,160,255,0.10)'][i]; ctx.beginPath(); ctx.moveTo(bx - 6, sy - 150); ctx.lineTo(bx + 6, sy - 150); ctx.lineTo(bx + sw + 34, sy - 3); ctx.lineTo(bx + sw - 34, sy - 3); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,126,182,' + (0.35 + 0.5 * pu) + ')'; ctx.lineWidth = 3 + 3 * pu; ctx.beginPath(); ctx.ellipse(sx, sy - 3, 92 + 6 * pu, 31 + 2 * pu, 0, 0, TAU); ctx.stroke();
}
function drawHubSign() { // "ENCORE ISLAND" marquee arch behind the stage
  const x = 0, y = -62;
  ctx.fillStyle = 'rgba(40,20,80,0.2)'; ctx.beginPath(); ctx.ellipse(x, y + 44, 140, 16, 0, 0, TAU); ctx.fill();
  for (const sd of [-1, 1]) { ctx.fillStyle = HV.line; rr(x + sd * 112 - 6, y - 4, 12, 52, 5); ctx.fill(); ctx.fillStyle = '#ffd84d'; rr(x + sd * 112 - 3.5, y - 2, 7, 48, 3); ctx.fill(); }
  ctx.fillStyle = HV.line; rr(x - 130, y - 54, 260, 62, 16); ctx.fill();
  const g = ctx.createLinearGradient(0, y - 50, 0, y + 6); g.addColorStop(0, '#6a4cc4'); g.addColorStop(1, '#3a2a8a'); ctx.fillStyle = g; rr(x - 126, y - 50, 252, 54, 13); ctx.fill();
  for (let i = 0; i < 18; i++) { const a = i / 17, lx = x - 114 + a * 228, on = ((S.t * 5) | 0) % 2 === i % 2; ctx.fillStyle = on ? '#fff4c0' : '#ffd84d'; ctx.beginPath(); ctx.arc(lx, y - 44, on ? 3.4 : 2.6, 0, TAU); ctx.arc(lx, y - 2, on ? 3.4 : 2.6, 0, TAU); ctx.fill(); }
  stickerText('ENCORE ISLAND', x, y - 12, 25, '#ffc9de', '#ff5fa6', 0);
}
function plateIcon(icon, x, y, s) { if (!drawIcon(icon, x, y, s)) { ctx.fillStyle = '#fff'; ctx.font = font(s * 0.5); ctx.textAlign = 'center'; ctx.fillText('?', x, y + s * 0.18); } }
// a walk-onto plate: glossy disc, icon sticker, progress ring, price pill that glows when you can afford it
function drawPlate(x, y, r, icon, label, cost, paid, o) {
  o = o || {}; PLATE_POS.push({ x, y });
  const rem = Math.max(0, cost - paid), afford = !o.gem ? S.wallet >= rem : S.gems >= rem, near = dist2(S.player.x, S.player.y, x, y) < (r + 110) * (r + 110);
  const bob = afford && !o.noBob ? Math.sin(S.t * 5 + x) * 2.5 : 0, pul = afford ? 0.5 + 0.5 * Math.sin(S.t * 5 + x * 0.01) : 0;
  shadow(x, y + r * 0.82, r * 0.95, 0.28);
  const cy = y - 6 + bob;
  if (afford) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const gl = ctx.createRadialGradient(x, cy, r * 0.6, x, cy, r * 1.7); gl.addColorStop(0, 'rgba(255,233,138,' + (0.30 + 0.25 * pul) + ')'); gl.addColorStop(1, 'rgba(255,233,138,0)'); ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, cy, r * 1.7, 0, TAU); ctx.fill(); ctx.restore(); }
  ctx.fillStyle = HV.line; ctx.beginPath(); ctx.arc(x, cy + 3, r + 6, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,244,230,0.96)'; ctx.beginPath(); ctx.arc(x, cy, r + 3, 0, TAU); ctx.fill();
  const gd = ctx.createRadialGradient(x - r * 0.3, cy - r * 0.4, r * 0.1, x, cy, r); gd.addColorStop(0, o.c1 || '#7a5cd8'); gd.addColorStop(1, o.c2 || '#3a2a8a'); ctx.fillStyle = gd; ctx.beginPath(); ctx.arc(x, cy, r - 3, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.ellipse(x, cy - r * 0.5, r * 0.7, r * 0.3, 0, 0, TAU); ctx.fill();
  if (paid > 0 && cost > 0) { ctx.strokeStyle = o.ring || '#9af0b4'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(x, cy, r + 1, -Math.PI / 2, -Math.PI / 2 + Math.min(1, paid / cost) * TAU); ctx.stroke(); }
  plateIcon(icon, x, cy + 1, r * 1.25);
  if (o.lvl !== undefined) { ctx.fillStyle = HV.line; ctx.beginPath(); ctx.arc(x + r * 0.78, cy - r * 0.78, 13, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffd84d'; ctx.beginPath(); ctx.arc(x + r * 0.78, cy - r * 0.78, 10.5, 0, TAU); ctx.fill(); ctx.fillStyle = '#3a2410'; ctx.font = font(11); ctx.textAlign = 'center'; ctx.fillText(o.lvl, x + r * 0.78, cy - r * 0.78 + 4); }
  if (near && label) labelPill(label, x, cy - r - 18, '#ffffff', '#dccaff', 12);
  if (rem > 0) priceTag(rem, x, y + r + 22, !!o.gem, afford);
  else if (o.doneTxt) labelPill(o.doneTxt, x, y + r + 22, '#9af0b4', '#3fcf6a', 12);
}
function priceTag(v, x, y, gem, afford) {
  const txt = typeof v === 'number' ? fmt(v) : v;
  ctx.font = font(13); const w = ctx.measureText(txt).width + 36, h = 22, bx = x - w / 2, by = y - 16;
  ctx.fillStyle = HV.line; rr(bx - 2, by - 1.5, w + 4, h + 4, 12); ctx.fill();
  const g = ctx.createLinearGradient(0, by, 0, by + h);
  if (afford) { g.addColorStop(0, gem ? '#7af0e0' : '#ffe98a'); g.addColorStop(1, gem ? '#27b5a8' : '#f0b422'); } else { g.addColorStop(0, '#e6dcff'); g.addColorStop(1, '#a99ad8'); }
  ctx.fillStyle = g; rr(bx, by, w, h, 11); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.4)'; rr(bx + 3, by + 2, w - 6, 7, 4); ctx.fill();
  if (gem) drawGemIcon(bx + 13, by + 11, 0.7); else drawIcon('coin', bx + 13, by + 11, 22);
  ctx.fillStyle = afford ? '#3a2410' : '#5a4a88'; ctx.textAlign = 'left'; ctx.fillText(txt, bx + 25, by + 16); ctx.textAlign = 'center';
}
function drawStall() {
  const x = SELL.x, y = SELL.y;
  shadow(x, y + 34, 56, 0.25);
  const jf = (S.t * 0.7 | 0) % 2 ? 0 : 2; if (!artDraw('jordan', 'idle', jf, x, y + 6, 0.38, false)) { ctx.fillStyle = '#e8c49a'; ctx.beginPath(); ctx.arc(x, y - 8, 10, 0, TAU); ctx.fill(); }
  ctx.fillStyle = HV.line; rr(x - 52, y - 12, 104, 44, 12); ctx.fill(); const cg = ctx.createLinearGradient(0, y - 8, 0, y + 28); cg.addColorStop(0, '#d9a468'); cg.addColorStop(1, '#a8703c'); ctx.fillStyle = cg; rr(x - 49, y - 9, 98, 38, 10); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; rr(x - 44, y - 7, 88, 8, 4); ctx.fill();
  ctx.fillStyle = HV.line; ctx.fillRect(x - 56, y - 84, 6, 74); ctx.fillRect(x + 50, y - 84, 6, 74); rr(x - 64, y - 104, 128, 28, 12); ctx.fill();
  for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#fff4e6' : HV.pink; const x0 = x - 61 + i * 20.3; ctx.beginPath(); ctx.moveTo(x0, y - 102); ctx.lineTo(x0 + 20.3, y - 102); ctx.lineTo(x0 + 20.3, y - 86); ctx.arc(x0 + 10.15, y - 86, 10.15, 0, Math.PI); ctx.lineTo(x0, y - 102); ctx.fill(); }
  labelPill('SELL', x, y - 112, '#ffffff', '#dccaff', 14);
}
const COIN_STACKS = (n) => Math.min(56, Math.ceil(3 * Math.sqrt(n / 12)));
function drawVault() {
  const x = VAULT.x, y = VAULT.y, st = COIN_STACKS(S.pallet);
  shadow(x, y + 36, 66, 0.28);
  ctx.strokeStyle = 'rgba(255,217,74,0.6)'; ctx.lineWidth = 3; ctx.setLineDash([8, 7]); ctx.beginPath(); ctx.arc(x, y, VAULT.r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = HV.line; rr(x - 68, y - 8, 136, 46, 11); ctx.fill(); const cg = ctx.createLinearGradient(0, y - 4, 0, y + 34); cg.addColorStop(0, '#d9a468'); cg.addColorStop(1, '#a8703c'); ctx.fillStyle = cg; rr(x - 65, y - 5, 130, 40, 9); ctx.fill();
  ctx.fillStyle = '#ffd84d'; rr(x - 8, y - 5, 16, 40, 3); ctx.fill();
  const paint = (ox, oy, sc) => { for (let i = 0; i < st; i++) { const col = i % 8, row = Math.floor(i / 8), cx2 = ox + (-52 + col * 15 + (row % 2) * 7) * sc, cy2 = oy + (6 - row * 11) * sc, hgt = 2 + (i * 7 + 3) % 5;
    for (let j = 0; j < hgt; j++) { ctx.fillStyle = j % 2 ? '#ffe066' : '#f0b422'; ctx.beginPath(); ctx.ellipse(cx2, cy2 - j * 4 * sc, 7 * sc, 3.4 * sc, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(120,70,10,0.75)'; ctx.lineWidth = 0.9 * sc; ctx.stroke(); if (j === hgt - 1) { ctx.fillStyle = '#fff6c0'; ctx.beginPath(); ctx.ellipse(cx2 - 1.5 * sc, cy2 - j * 4 * sc - 0.6 * sc, 3 * sc, 1.2 * sc, -0.2, 0, TAU); ctx.fill(); } } } };
  const cs = st > 0 ? sprite('coins' + st, 296, () => paint(0, 44, 2)) : null;
  if (st === 0) { /* empty crate */ } else if (cs) ctx.drawImage(cs, x - 74, y - 96, 148, 148); else paint(x, y, 1);
  if (S.pallet > 0 && ((S.t * 4) | 0) % 3 === 0) spark(x + (vrnd() - 0.5) * 90, y - vrnd() * 50, 5, 0.9);
  labelPill(S.pallet > 0 ? fmt(S.pallet) : 'Vault', x, y + 54, '#ffe98a', '#f0b422', 14);
}
// ---- forge / towers / monument ----
function drawForgeBody(x, y, hot) {
  const t = S.t, heat = hot ? 1 : 0.4; shadow(x, y + 40, 58, 0.28);
  ctx.fillStyle = HV.line; rr(x + 18, y - 82, 28, 44, 7); ctx.fill(); ctx.fillStyle = '#ff9ac8'; rr(x + 21, y - 79, 22, 38, 5); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.35)'; rr(x + 24, y - 77, 6, 34, 3); ctx.fill();
  ctx.fillStyle = HV.line; rr(x + 14, y - 88, 36, 12, 5); ctx.fill(); ctx.fillStyle = '#ffc9de'; rr(x + 16, y - 86, 32, 8, 4); ctx.fill();
  for (let i = 0; i < 4; i++) { const ph = (t * 0.45 + i / 4) % 1; ctx.globalAlpha = (1 - ph) * (hot ? 0.7 : 0.25); ctx.fillStyle = '#fff4e6'; ctx.beginPath(); ctx.arc(x + 32 + Math.sin(ph * 7 + i) * 8, y - 92 - ph * 56, 7 + ph * 13, 0, TAU); ctx.fill(); }
  ctx.globalAlpha = 1; ctx.fillStyle = HV.line; rr(x - 52, y - 52, 104, 92, 18); ctx.fill();
  const bg = ctx.createLinearGradient(0, y - 48, 0, y + 36); bg.addColorStop(0, '#9a7af0'); bg.addColorStop(1, '#5a3fb8'); ctx.fillStyle = bg; rr(x - 48, y - 48, 96, 84, 15); ctx.fill();
  ctx.strokeStyle = 'rgba(30,10,80,0.28)'; ctx.lineWidth = 2.5; for (let r = 0; r < 3; r++) { const yy = y - 30 + r * 22; ctx.beginPath(); ctx.moveTo(x - 46, yy); ctx.lineTo(x + 46, yy); ctx.stroke(); for (let c = 0; c < 4; c++) { const xx = x - 36 + c * 24 + (r % 2) * 12; ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy + 22); ctx.stroke(); } }
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; rr(x - 43, y - 45, 86, 13, 6); ctx.fill();
  ctx.fillStyle = HV.line; ctx.beginPath(); ctx.moveTo(x - 31, y + 36); ctx.lineTo(x - 31, y - 4); ctx.arc(x, y - 4, 31, Math.PI, 0); ctx.lineTo(x + 31, y + 36); ctx.closePath(); ctx.fill();
  const fg = ctx.createLinearGradient(0, y - 34, 0, y + 34); fg.addColorStop(0, '#ff6a2e'); fg.addColorStop(1, hot ? '#ffd84d' : '#a8501e'); ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(x - 26, y + 34); ctx.lineTo(x - 26, y - 4); ctx.arc(x, y - 4, 26, Math.PI, 0); ctx.lineTo(x + 26, y + 34); ctx.closePath(); ctx.fill();
  for (let i = 0; i < 4; i++) { const fx = x - 18 + i * 12, fh = (16 + 12 * Math.sin(t * 9 + i * 1.7) + (i % 2) * 6) * heat + 6; ctx.fillStyle = i % 2 ? '#ffe98a' : '#ff9a2e'; ctx.beginPath(); ctx.moveTo(fx - 7, y + 34); ctx.quadraticCurveTo(fx - 5, y + 34 - fh * 0.6, fx + Math.sin(t * 7 + i) * 3, y + 34 - fh); ctx.quadraticCurveTo(fx + 5, y + 34 - fh * 0.6, fx + 7, y + 34); ctx.closePath(); ctx.fill(); }
  if (hot) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const gl = ctx.createRadialGradient(x, y + 10, 4, x, y + 10, 70); gl.addColorStop(0, 'rgba(255,160,60,0.5)'); gl.addColorStop(1, 'rgba(255,160,60,0)'); ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y + 10, 70, 0, TAU); ctx.fill(); ctx.restore(); }
  for (const [rx, ry] of [[-42, -40], [42, -40], [-42, 28], [42, 28]]) { ctx.fillStyle = HV.line; ctx.beginPath(); ctx.arc(x + rx, y + ry + 1, 5, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff4e6'; ctx.beginPath(); ctx.arc(x + rx, y + ry, 3.4, 0, TAU); ctx.fill(); }
}
function drawForgeArea() {
  if (!S.forge) { if (S.lands.length >= 1) drawPlate(FORGE.x, FORGE.y, 52, 'forge', 'Smelter', S.forgePlate.cost, S.forgePlate.paid, { c1: '#ff9a4e', c2: '#c8501e', ring: '#ffd84d' }); return; }
  const f = S.forge; drawForgeBody(FORGE.x, FORGE.y, f.queue.length > 0);
  labelPill('SMELTER LV' + (S.forgeLvl + 1) + '  x' + BAR_MUL, FORGE.x, FORGE.y - 96, '#ffe98a', '#f0b422', 12);
  labelPill(f.queue.length + '/' + forgeQ() + ' shields', FORGE.x, FORGE.y + 54, '#ffffff', '#dccaff', 11);
  ctx.fillStyle = HV.line; rr(TRAY.x - 56, TRAY.y - 10, 112, 30, 9); ctx.fill(); const tg = ctx.createLinearGradient(0, TRAY.y - 7, 0, TRAY.y + 17); tg.addColorStop(0, '#d9a468'); tg.addColorStop(1, '#a8703c'); ctx.fillStyle = tg; rr(TRAY.x - 53, TRAY.y - 7, 106, 24, 7); ctx.fill();
  const tr = f.tray, show = Math.min(tr.length, 15); let idx = 0;
  for (let row = 0; row < 3 && idx < show; row++) { const per = 5 - row, x0 = TRAY.x - (per - 1) * 13; for (let c2 = 0; c2 < per && idx < show; c2++, idx++) { const m = metal(tr[tr.length - 1 - idx] || 1); drawBarIcon(x0 + c2 * 26, TRAY.y - 4 - row * 12, 0.78, m.col, m.glow); } }
  labelPill(tr.length ? metal(tr[tr.length - 1]).name + ' bars' : 'bars', TRAY.x, TRAY.y + 38, '#ffe98a', '#f0b422', 11);
  if (S.forgeLvl < FORGE_LVL_MAX) drawPlate(FUP.x, FUP.y, 40, 'amp', 'Upgrade Smelter', forgeUpCost(S.forgeLvl), S.forgeUpPlate.paid, { c1: '#ffb060', c2: '#c8601e', ring: '#ffd84d' });
}
function drawTower(tw) {
  const LN = HV.line, rec = (tw.fire || 0) > 0 ? 1 + tw.fire * 0.5 : 1;
  shadow(tw.x, tw.y + 30, 34, 0.28);
  if (tw.type === 'catapult') {
    ctx.fillStyle = LN; rr(tw.x - 29, tw.y - 17, 58, 40, 9); ctx.fill(); ctx.fillStyle = '#ff7eb6'; rr(tw.x - 26, tw.y - 14, 52, 34, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.35)'; rr(tw.x - 22, tw.y - 12, 44, 8, 4); ctx.fill();
    for (const dx of [-14, 14]) { ctx.fillStyle = LN; ctx.beginPath(); ctx.arc(tw.x + dx, tw.y + 20, 10, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff4e6'; ctx.beginPath(); ctx.arc(tw.x + dx, tw.y + 20, 7, 0, TAU); ctx.fill(); }
    const arm = Math.max(0, 1 - (tw.cd || 0) / CAT_RATE), ax = tw.x - 26 * Math.cos(arm * 1.2), ay = tw.y - 34 * Math.sin(0.4 + arm * 1.1);
    ctx.strokeStyle = LN; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(tw.x, tw.y); ctx.lineTo(ax, ay); ctx.stroke(); ctx.strokeStyle = '#ffd84d'; ctx.lineWidth = 5; ctx.stroke();
    ctx.fillStyle = LN; ctx.beginPath(); ctx.arc(ax, ay, 9, 0, TAU); ctx.fill(); ctx.fillStyle = '#a77bff'; ctx.beginPath(); ctx.arc(ax, ay, 6.5, 0, TAU); ctx.fill(); return;
  }
  ctx.save(); ctx.translate(tw.x, tw.y + 30); ctx.scale(1 / rec, rec); ctx.translate(-tw.x, -(tw.y + 30));
  if (tw.type === 'wizard') {
    ctx.fillStyle = LN; rr(tw.x - 23, tw.y - 39, 46, 72, 11); ctx.fill(); ctx.fillStyle = '#6b4fc4'; rr(tw.x - 20, tw.y - 36, 40, 66, 8); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.25)'; rr(tw.x - 16, tw.y - 33, 14, 58, 6); ctx.fill();
    const pulse = 0.5 + Math.sin(S.t * 6) * 0.4; ctx.fillStyle = 'rgba(255,200,255,' + (0.2 + pulse * 0.3) + ')'; ctx.beginPath(); ctx.arc(tw.x, tw.y - 56, 22, 0, TAU); ctx.fill();
    ctx.fillStyle = LN; ctx.beginPath(); ctx.arc(tw.x, tw.y - 56, 15, 0, TAU); ctx.fill(); ctx.fillStyle = '#e6d9ff'; ctx.beginPath(); ctx.arc(tw.x, tw.y - 56, 12.5, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff'; for (let k = 0; k < 5; k++) { const a = S.t * 2 + k * 1.26; ctx.fillRect(tw.x + Math.cos(a) * 8 - 1.5, tw.y - 56 + Math.sin(a) * 8 - 1.5, 3, 3); }
  } else {
    ctx.fillStyle = LN; rr(tw.x - 25, tw.y - 33, 50, 66, 10); ctx.fill(); ctx.fillStyle = '#8f6be8'; rr(tw.x - 22, tw.y - 30, 44, 60, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.22)'; rr(tw.x - 18, tw.y - 27, 12, 52, 5); ctx.fill();
    const beat = (beatNow() % 1) < 0.18 ? 1 : 0;
    for (const [cy, cr] of [[-8, 9], [14, 7]]) { ctx.fillStyle = LN; ctx.beginPath(); ctx.arc(tw.x + 3, tw.y + cy, cr + 2 + beat, 0, TAU); ctx.fill(); ctx.fillStyle = '#3a2a7a'; ctx.beginPath(); ctx.arc(tw.x + 3, tw.y + cy, cr + beat * 0.6, 0, TAU); ctx.fill(); ctx.fillStyle = '#ff7eb6'; ctx.beginPath(); ctx.arc(tw.x + 3, tw.y + cy, cr * 0.4, 0, TAU); ctx.fill(); }
    ctx.fillStyle = LN; rr(tw.x - 29, tw.y - 46, 58, 20, 7); ctx.fill(); ctx.fillStyle = '#fff4e6'; rr(tw.x - 26, tw.y - 43, 52, 14, 5); ctx.fill();
    for (let i = -2; i <= 2; i++) { ctx.fillStyle = [HV.pink, HV.green, HV.gold, HV.violet, HV.pink][i + 2]; ctx.fillRect(tw.x + i * 10 - 3, tw.y - 41, 6, 10); }
    ctx.strokeStyle = LN; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(tw.x - 24, tw.y - 46); ctx.lineTo(tw.x - 24, tw.y - 78); ctx.stroke();
    const wave = Math.sin(S.t * 5 + tw.x) * 3; ctx.fillStyle = HV.pink; ctx.strokeStyle = LN; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(tw.x - 24, tw.y - 78); ctx.lineTo(tw.x - 4 + wave, tw.y - 73); ctx.lineTo(tw.x - 24, tw.y - 67); ctx.closePath(); ctx.fill(); ctx.stroke();
    const sing = ['rawclaw', 'roxor', 'andy', 'jasmin_unicorn'][((tw.x * 0.37) | 0) % 4 & 3];
    artDraw(sing, 'idle', (S.t * 5 + tw.x) | 0, tw.x + 4, tw.y - 42, 0.27, false);
  }
  ctx.restore();
}
function drawMonument() {
  const x = MONU.x, y = MONU.y, ready = S.lands.length >= PRESTIGE_MIN;
  shadow(x, y + 34, 50, 0.28);
  ctx.fillStyle = HV.line; rr(x - 42, y - 8, 84, 44, 10); ctx.fill(); ctx.fillStyle = '#e6d3a3'; rr(x - 39, y - 5, 78, 38, 8); ctx.fill();
  ctx.fillStyle = HV.line; rr(x - 30, y - 44, 60, 48, 10); ctx.fill(); ctx.fillStyle = ready ? '#ffd84d' : '#b9b2d0'; rr(x - 27, y - 41, 54, 42, 8); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.35)'; rr(x - 22, y - 38, 20, 36, 6); ctx.fill();
  drawIcon('crown', x, y - 62 + Math.sin(S.t * 2) * 3, 56);
  if (ready) {
    const chg = S.prestT / PREST_T; if (chg > 0) { ctx.strokeStyle = '#ffd84d'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(x, y - 14, 58, -Math.PI / 2, -Math.PI / 2 + chg * TAU); ctx.stroke(); }
    labelPill('ENCORE TOUR  +' + crownsToGain() + ' crowns', x, y + 52, '#ffe98a', '#f0b422', 12); labelPill('stand still to begin', x, y + 74, '#ffffff', '#dccaff', 10);
  } else labelPill('Encore Tour: ' + S.lands.length + '/' + PRESTIGE_MIN + ' lands', x, y + 52, '#ffffff', '#dccaff', 12);
}
function drawDen(z) {
  const d = z.g.den, pul = 0.5 + 0.5 * Math.sin(S.t * 2 + z.k);
  shadow(d.x, d.y + 6, 44, 0.3);
  ctx.fillStyle = HV.line; ctx.beginPath(); ctx.ellipse(d.x, d.y, 40, 22, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#4a2f7a'; ctx.beginPath(); ctx.ellipse(d.x, d.y + 1, 34, 17, 0, 0, TAU); ctx.fill();
  const gl = ctx.createRadialGradient(d.x, d.y, 2, d.x, d.y, 26); gl.addColorStop(0, rgba(foeCol(z.k), 0.55 + 0.25 * pul)); gl.addColorStop(1, rgba(foeCol(z.k), 0)); ctx.fillStyle = gl; ctx.beginPath(); ctx.ellipse(d.x, d.y, 30, 15, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(d.x, d.y - 2, 24 + pul * 3, 11 + pul * 1.5, 0, 0, TAU); ctx.stroke();
}
function drawLandPlates(z) {
  const gate = z.plates.find(p => p.id === 'gate2');
  for (const pl of z.plates) {
    if (pl.built && !pl.repeat) { continue; }
    if (pl.built && pl.repeat) continue;
    drawPlate(pl.x, pl.y, 42, pl.icon, pl.name + (pl.repeat ? ' LV' + (pl.lvl + 1) : ''), pl.cost, pl.paid, { lvl: pl.repeat ? pl.lvl : undefined, c1: pl.id === 'altar' ? '#c85a5a' : undefined, c2: pl.id === 'altar' ? '#6a1f3a' : undefined });
  }
  if (z.altar) { const a = z.altar, ready = a.cd <= 0; drawPlate(a.x, a.y, 38, 'altar', ready ? 'Summon Headliner' : 'Headliner resting', 0, 0, { noBob: !ready, c1: ready ? '#e05a7a' : '#6a5a88', c2: ready ? '#6a1f3a' : '#3e3076' }); if (!ready) labelPill(Math.ceil(a.cd) + 's', a.x, a.y + 60, '#ffffff', '#dccaff', 12); }
  if (S.waygate) { const q = landPadSpot(z.g); drawPad(q.x, q.y, 'HOME'); }
}
function drawPad(x, y, label) {
  ctx.strokeStyle = '#6ec9e0'; ctx.lineWidth = 4; ctx.setLineDash([12, 9]); ctx.beginPath(); ctx.arc(x, y, 40, S.t, S.t + TAU); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(110,201,224,0.2)'; ctx.beginPath(); ctx.arc(x, y, 34, 0, TAU); ctx.fill(); drawIcon('way', x, y, 46); labelPill(label, x, y + 54, '#b8f4ff', '#6ec9e0', 11);
}
function drawHubPlates() {
  for (const key in UPG) { const pos = UPG_POS[key], u = UPG[key]; drawPlate(pos.x, pos.y, 46, u.icon, u.name, upgCost(key, S.up[key]), S.upPaid[key], { lvl: S.up[key] + 1 }); }
  for (const key in GEMU) { const pos = GEM_POS[key], c = gemUpCost(key, S.gemUp[key]); drawPlate(pos.x, pos.y, 42, key === 'coin' ? 'coin' : key, GEMU[key].name + ' · ' + GEMU[key].what, c, S.gemPaid[key], { gem: true, lvl: S.gemUp[key], c1: '#46c8c0', c2: '#1a6a8a', ring: '#b8fff6' }); }
  if (!S.waygate && S.lands.length >= 2) drawPlate(WAYPLATE.x, WAYPLATE.y, 44, 'way', 'Warp Pads', S.wayPlate.cost, S.wayPlate.paid, { c1: '#5ab8e8', c2: '#2a5a9a', ring: '#b8f4ff' });
  if (S.waygate) drawPad(WAYPAD.x, WAYPAD.y, 'TO NEWEST');
}
function drawUnlockPlate() {
  const n = S.lands.length + 1, u = S.unlockPlate || { x: 0, y: 0, cost: nextUnlockCost(), paid: S.unlockPaid };
  drawPlate(u.x, u.y, 50, 'way', 'New Land: ' + biomeOf(n).name, u.cost, u.paid, { c1: '#ffb86a', c2: '#c8521e', ring: '#ffe98a', noBob: false });
}
