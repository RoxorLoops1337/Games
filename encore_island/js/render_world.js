'use strict';
// Encore Island — world rendering: water, organic islands, boardwalks, the zoned home island, plates, the Backstage stairway.
let vw = 412, vh = 860, dpr = 1, scl = 1, vL = 0, vR = 0, vT = 0, vB = 0, hits = [];
const CAM = { x: 0, y: 0, init: false };
const vis = (x, y, m) => x > vL - m && x < vR + m && y > vT - m && y < vB + m;
// island outline: a smooth blob through the radius samples, built LOCAL to the land centre (callers translate to g.x, g.y first).
// Outlines never change, so each (land, scale, offset) is baked once into a Path2D; without Path2D (headless tests) the path is built on ctx.
function blobPathTo(t, g, sc, dy) {
  const n = RAD_N; let px = 0, py = 0, fx = 0, fy = 0;
  for (let i = 0; i <= n; i++) {
    const a = (i % n) / n * TAU, r = g.rad[i % n] * sc, x = Math.cos(a) * r, y = dy + Math.sin(a) * r;
    if (i === 0) { t.moveTo(x, y); fx = x; fy = y; } else { t.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2); }
    px = x; py = y;
  }
  t.quadraticCurveTo(px, py, (px + fx) / 2, (py + fy) / 2); t.closePath();
}
function blobPath(g, sc, dy) { ctx.beginPath(); blobPathTo(ctx, g, sc, dy); } // immediate, for the foam rings that breathe
const HAS_PATH2D = typeof Path2D === 'function', BLOBS = new Map();
function blob(g, sc, dy) { // the cached Path2D, or null once the path has been built on ctx instead
  if (!HAS_PATH2D) { blobPath(g, sc, dy); return null; }
  let m = BLOBS.get(g); if (!m) BLOBS.set(g, m = new Map());
  const key = dy * 10 + sc; let p = m.get(key); // dy is a whole number of px and sc < 2, so the key is unique
  if (!p) { p = new Path2D(); blobPathTo(p, g, sc, dy); m.set(key, p); }
  return p;
}
function bFill(g, sc, dy) { const p = blob(g, sc, dy); if (p) ctx.fill(p); else ctx.fill(); }
function bStroke(g, sc, dy) { const p = blob(g, sc, dy); if (p) ctx.stroke(p); else ctx.stroke(); }
function bClip(g, sc, dy) { const p = blob(g, sc, dy); if (p) ctx.clip(p); else ctx.clip(); }
// derived biome colours: mixc/rgba build strings, so do it once per biome
function biomePal(B) { return B.pal || (B.pal = { cliffDark: mixc(B.cliff, '#1a0a30', 0.35), cliffMid: mixc(B.cliff, B.deep, 0.5), edge: rgba(B.deep, 0.32), mist: rgba(B.g[0], 0.22), portal: mixc(B.deep, '#1a0a30', 0.25) }); }
const GPK = ['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7']; // ground pattern keys per biome
function landVisible(g) { const m = g.r * 1.3 + 60; return g.x + m > vL && g.x - m < vR && g.y + m > vT && g.y - m < vB; }
const WATER = { key: '', grad: null }; // the sky-to-deep gradient only changes with the biome or the screen height
function drawWater() {
  // water tint follows the biome of the island nearest the camera
  const kk = nearestLandIdx(CAM.x, CAM.y), bi = kk === 0 ? 0 : (kk - 1) % 8, B = BIOMES[bi], key = bi + '|' + vh;
  if (WATER.key !== key) { const g = ctx.createLinearGradient(0, 0, 0, vh); g.addColorStop(0, mixc('#8fe3f0', B.shore, 0.25)); g.addColorStop(1, mixc('#4fb4d4', B.deep, 0.35)); WATER.key = key; WATER.grad = g; }
  ctx.fillStyle = WATER.grad; ctx.fillRect(0, 0, vw, vh);
  ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  const sp = 120, ox = -(CAM.x * scl * 0.9) % sp, oy = -(CAM.y * scl * 0.9) % sp;
  for (let y = -sp; y < vh + sp; y += sp * 0.62) for (let x = -sp; x < vw + sp; x += sp) {
    const wx = x + ox + ((Math.round(y / sp * 1.6)) % 2) * sp * 0.5, wy = y + oy + Math.sin(S.t * 0.8 + x * 0.02 + y * 0.01) * 4;
    ctx.beginPath(); ctx.moveTo(wx, wy); ctx.quadraticCurveTo(wx + 14, wy - 8, wx + 28, wy); ctx.quadraticCurveTo(wx + 42, wy + 8, wx + 56, wy); ctx.stroke();
  }
  ctx.restore();
}
function foamRing(g, t, sc, a, w, ph) { const pul = 0.5 + 0.5 * Math.sin(t * 1.4 + ph + g.k); ctx.globalAlpha = a * (0.55 + 0.45 * pul); ctx.lineWidth = w; blobPath(g, sc + pul * 0.012, 8); ctx.stroke(); }
function drawIslandBase(g, B) { // cliff thickness + animated foam
  const P = biomePal(B);
  ctx.translate(g.x, g.y);
  ctx.fillStyle = P.cliffDark; bFill(g, 1, 34); ctx.fillStyle = B.cliff; bFill(g, 1, 22); ctx.fillStyle = P.cliffMid; bFill(g, 1, 12);
  ctx.fillStyle = 'rgba(30,10,60,0.18)'; bFill(g, 1.06, 46);
  ctx.lineJoin = 'round'; ctx.strokeStyle = B.shore; // the foam breathes with the beat, so these two stay immediate paths
  foamRing(g, S.t, 1.045, 0.5, 12, 0); foamRing(g, S.t, 1.085, 0.28, 8, 1.7);
  ctx.globalAlpha = 1; ctx.lineJoin = 'miter';
  ctx.translate(-g.x, -g.y);
}
function drawIslandTop(g, B, bi, born) {
  const grow = born === undefined ? 1 : easeBack(clamp((S.t - born) / 1.1, 0, 1)), P = biomePal(B);
  ctx.save(); ctx.translate(g.x, g.y); if (grow < 1) ctx.scale(Math.max(0.05, grow), Math.max(0.05, grow));
  if (!g.topGrad) { const f = ctx.createRadialGradient(0, -g.r * 0.2, g.r * 0.1, 0, 0, g.r * 1.15); f.addColorStop(0, B.g[0]); f.addColorStop(1, B.g[1]); g.topGrad = f; } // size and biome are fixed per land
  ctx.fillStyle = g.topGrad; bFill(g, 1, 0);
  bClip(g, 1, 0);
  const gp = groundPat(GPK[bi], B.g, B.tuft, B.flowers, 'grass');
  if (gp) { ctx.translate(-g.x, -g.y); ctx.fillStyle = gp; ctx.fillRect(g.x - g.r * 1.3, g.y - g.r * 1.3, g.r * 2.6, g.r * 2.6); ctx.translate(g.x, g.y); } // the grass tiles keep their world phase
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 10; bStroke(g, 0.985, 0); // sunny rim
  ctx.strokeStyle = P.edge; ctx.lineWidth = 30; bStroke(g, 1, 0); // soft inner edge shade
  ctx.restore();
}
const DASH_WALK = [14, 22], DASH_NONE = [];
function walkPath(g) { // the boardwalk polyline, baked once per land (null = built on ctx)
  const P = g.path;
  if (!HAS_PATH2D) { ctx.beginPath(); ctx.moveTo(P[0].x, P[0].y); for (let i = 1; i < P.length; i++) ctx.lineTo(P[i].x, P[i].y); return null; }
  if (!g.walk) { const p = new Path2D(); p.moveTo(P[0].x, P[0].y); for (let i = 1; i < P.length; i++) p.lineTo(P[i].x, P[i].y); g.walk = p; }
  return g.walk;
}
function strokeWalk(p, w, col) { ctx.strokeStyle = col; ctx.lineWidth = w; if (p) ctx.stroke(p); else ctx.stroke(); }
function drawPaths(maxK) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let k = 1; k <= maxK; k++) {
    const g = geoOf(k); if (!landVisible(g) && !landVisible(geoOf(g.parent))) continue;
    const p = walkPath(g);
    strokeWalk(p, PATH_HALF * 2 + 14, HV.line); strokeWalk(p, PATH_HALF * 2 + 4, '#c9a878'); strokeWalk(p, PATH_HALF * 2 - 10, '#f6e7c8');
    ctx.setLineDash(DASH_WALK); strokeWalk(p, 6, 'rgba(255,126,182,0.35)'); ctx.setLineDash(DASH_NONE);
  }
}
// mist hiding the next, still-locked island
function drawMist(kn) {
  const g = geoOf(kn); if (!landVisible(g)) return;
  const B = biomeOf(kn);
  ctx.translate(g.x, g.y); ctx.fillStyle = biomePal(B).mist; bFill(g, 0.96, 0); ctx.translate(-g.x, -g.y);
  ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.78)';
  for (let i = 0; i < 16; i++) { const a = i / 16 * TAU + S.t * 0.07 * (i % 2 ? 1 : -1), r = g.r * (0.18 + 0.5 * hash01(kn * 31 + i)) , bx = g.x + Math.cos(a) * r, by = g.y + Math.sin(a) * r * 0.85 + Math.sin(S.t * 0.6 + i) * 6, br = 70 + 60 * hash01(kn * 17 + i);
    ctx.globalAlpha = 0.5 + 0.3 * hash01(i + kn); ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.fill(); }
  ctx.restore();
  ctx.save(); ctx.translate(g.x, g.y - 20 + Math.sin(S.t * 1.6) * 5); drawIcon('lock', 0, 0, 90); ctx.restore();
  labelPill(B.name, g.x, g.y + 60, '#ffffff', '#d8c8ff', 15);
}
// ---- the home island. Zones around the Stage Plaza, each with its own paving, joined by cobbled boulevards (world.js has the layout) ----
const ZONE_DEG = [-90, -40, 0, 33, 90, 148, 180, -125]; // boulevard directions (screen angles): Hall, Smelter, Arena, Dock, Terrace, Backstage, Market, Studio
const PLAZA_R = 240, BLVD_W = 76;
const HUBSIGNS = (function () { // signposts at the boulevard mouths, each on whichever side of its boulevard is clearer of the fixtures
  const defs = [[-90, 'HALL OF FAME'], [-40, 'SMELTER'], [0, 'ARENA'], [33, 'DOCK'], [90, 'TRAINING'], [180, 'MARKET'], [148, 'BACKSTAGE'], [-125, 'STUDIO']], out = [];
  for (const [deg, txt] of defs) {
    const a = deg * D2R, ax = Math.cos(a) * (PLAZA_R + 24), ay = Math.sin(a) * (PLAZA_R + 24), px = -Math.sin(a) * (BLVD_W / 2 + 26), py = Math.cos(a) * (BLVD_W / 2 + 26);
    let best = null, bc = -1;
    for (const sd of [1, -1]) { const x = ax + px * sd, y = ay + py * sd; let c = 1e9; for (const o of HUB_KEEP) if (o !== HUB_KEEP[0]) c = Math.min(c, Math.hypot(x - o.x, y - o.y)); for (const o of out) c = Math.min(c, Math.hypot(x - o.x, y - o.y)); if (c > bc) { bc = c; best = { x: Math.round(x), y: Math.round(y) }; } }
    out.push({ x: best.x, y: best.y, txt, dir: Math.cos(a) >= 0 ? 1 : -1 });
  }
  return out;
})();
const HUBDECOR = (function () { // rim trees and bushes, kept off every fixture and the boulevard ends
  const r = mkRng(77), out = [];
  for (let i = 0; i < 64; i++) {
    const a = i / 64 * TAU + r() * 0.08, rr0 = radiusAt(HUB_GEO, a) * (0.925 + r() * 0.05), x = Math.cos(a) * rr0, y = Math.sin(a) * rr0, bush = i % 4 === 0;
    let ok = true; for (const o of HUB_KEEP) if (o !== HUB_KEEP[0] && Math.hypot(x - o.x, y - o.y) < 125) ok = false;
    if (ok) out.push({ t: bush ? 'bush' : 'tree', x, y, s: bush ? 1.1 : 0.78 + r() * 0.3, v: (r() * 3) | 0 }); else r();
  }
  out.sort((p, q) => p.y - q.y); return out;
})();
// ---- hub lamp posts: warm lanterns between the boulevard mouths and along the shore, pulsing on the beat ----
const HUBLAMPS = (function () {
  const out = [], gates = [], degs = ZONE_DEG.slice().sort((p, q) => p - q);
  for (let k = 1; k <= 40; k++) if (geoOf(k).parent === 0) gates.push(unlockSpot(k));
  const tryAdd = (x, y, ph, keepR) => { for (const o of HUB_KEEP) if (o !== HUB_KEEP[0] && Math.hypot(x - o.x, y - o.y) < keepR) return; for (const gt of gates) if (Math.hypot(x - gt.x, y - gt.y) < 105) return; for (const s of HUBSIGNS) if (Math.hypot(x - s.x, y - s.y) < 60) return; for (const l of out) if (Math.hypot(x - l.x, y - l.y) < 90) return; out.push({ x, y, ph }); };
  for (let i = 0; i < degs.length; i++) { const d0 = degs[i], d1 = i + 1 < degs.length ? degs[i + 1] : degs[0] + 360, a = (d0 + d1) / 2 * D2R; tryAdd(Math.cos(a) * (PLAZA_R - 36), Math.sin(a) * (PLAZA_R - 36), i * 0.7, 70); } // on the plaza, between the boulevard mouths
  for (const d of ZONE_DEG) for (const sd of [1, -1]) { const a = d * D2R, R = PLAZA_R + 120; tryAdd(Math.cos(a) * R - Math.sin(a) * sd * (BLVD_W / 2 + 22), Math.sin(a) * R + Math.cos(a) * sd * (BLVD_W / 2 + 22), d * 0.05, 92); } // flanking each boulevard
  for (let i = 0; i < 14; i++) { const a = i / 14 * TAU + 0.12, R = radiusAt(HUB_GEO, a) * 0.8; tryAdd(Math.cos(a) * R, Math.sin(a) * R, i * 0.9 + 2, 108); } // along the shore
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
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 * pu; ctx.translate(l.x, l.y - 84); ctx.fillStyle = ggrad(2, 80, '#ffd678'); ctx.beginPath(); ctx.arc(0, 0, 80, 0, TAU); ctx.fill(); ctx.translate(-l.x, 84 - l.y); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
function drawSignpost(s) { // a wooden post with an arrow board pointing down its boulevard
  const x = s.x, y = s.y, LN = HV.line; ctx.font = font(10); const w = ctx.measureText(s.txt).width + 26;
  ctx.fillStyle = 'rgba(40,20,80,0.2)'; ctx.beginPath(); ctx.ellipse(x + 3, y + 3, 12, 5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = LN; rr(x - 5, y - 50, 10, 52, 3); ctx.fill(); ctx.fillStyle = '#a8703c'; rr(x - 3, y - 48, 6, 48, 2); ctx.fill();
  const bx = s.dir > 0 ? x - 10 : x + 10 - w, by = y - 46, tip = 10; // arrow board
  ctx.fillStyle = LN; ctx.beginPath(); if (s.dir > 0) { ctx.moveTo(bx - 2, by - 2); ctx.lineTo(bx + w, by - 2); ctx.lineTo(bx + w + tip + 2, by + 9); ctx.lineTo(bx + w, by + 20); ctx.lineTo(bx - 2, by + 20); } else { ctx.moveTo(bx + w + 2, by - 2); ctx.lineTo(bx, by - 2); ctx.lineTo(bx - tip - 2, by + 9); ctx.lineTo(bx, by + 20); ctx.lineTo(bx + w + 2, by + 20); } ctx.closePath(); ctx.fill();
  ctx.translate(0, by); ctx.fillStyle = vgrad(18, '#d9a468', '#a8703c'); ctx.beginPath(); if (s.dir > 0) { ctx.moveTo(bx, 0); ctx.lineTo(bx + w, 0); ctx.lineTo(bx + w + tip, 9); ctx.lineTo(bx + w, 18); ctx.lineTo(bx, 18); } else { ctx.moveTo(bx + w, 0); ctx.lineTo(bx, 0); ctx.lineTo(bx - tip, 9); ctx.lineTo(bx, 18); ctx.lineTo(bx + w, 18); } ctx.closePath(); ctx.fill(); ctx.translate(0, -by);
  ctx.fillStyle = '#fff4e6'; ctx.textAlign = 'center'; ctx.fillText(s.txt, bx + w / 2, by + 13);
}
// cached floor shapes (Path2D when available): the plaza, the eight boulevards and the terrace ring
const HUBPATH = { blvd: null, terrace: null };
function blvdPathTo(t) { for (const d of ZONE_DEG) { const a = d * D2R, r1 = d === 90 ? TERRACE.y + 280 - 90 : d === -90 ? 345 : d === 180 ? 345 : d === -40 ? 390 : d === 0 ? 500 : d === 33 ? 440 : d === 148 ? 470 : 470; t.moveTo(Math.cos(a) * (PLAZA_R - 30), Math.sin(a) * (PLAZA_R - 30)); t.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); } }
function terracePathTo(t) { const c = TERRACE, a0 = c.a0 * D2R, a1 = c.a1 * D2R, r0 = c.r - 60, r1 = c.r + 110; t.moveTo(c.x + Math.cos(a0) * r0, c.y + Math.sin(a0) * r0); t.arc(c.x, c.y, r1, a0, a1); t.arc(c.x, c.y, r0, a1, a0, true); t.closePath(); }
function hubPath(key, build) { if (!HAS_PATH2D) { ctx.beginPath(); build(ctx); return null; } let p = HUBPATH[key]; if (!p) { p = new Path2D(); build(p); HUBPATH[key] = p; } return p; }
function pStroke(p) { if (p) ctx.stroke(p); else ctx.stroke(); }
function pFill(p) { if (p) ctx.fill(p); else ctx.fill(); }
function zoneEllipse(x, y, rx, ry, edge, base, pat) { // a paved zone patch: dark rim, pale edge, then its own tile pattern
  ctx.fillStyle = HV.line; ctx.beginPath(); ctx.ellipse(x, y + 4, rx + 6, ry + 6, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = edge; ctx.beginPath(); ctx.ellipse(x, y, rx + 3, ry + 3, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = base; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
  if (pat) { ctx.save(); ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.clip(); ctx.fillStyle = pat; ctx.fillRect(x - rx, y - ry, rx * 2, ry * 2); ctx.restore(); }
}
function drawHubFloor() {
  ctx.save(); bClip(HUB_GEO, 0.985, 0); // nothing paved may hang over the shore
  const cob = groundPat('plaza', ['#fff1d6', '#fff1d6'], '#efd6ae', null, 'cobble');
  // boulevards: dark edge, cream stone, cobbles
  const bp = hubPath('blvd', blvdPathTo); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = HV.line; ctx.lineWidth = BLVD_W + 10; pStroke(bp); ctx.strokeStyle = '#fff1d6'; ctx.lineWidth = BLVD_W; pStroke(bp); if (cob) { ctx.strokeStyle = cob; ctx.lineWidth = BLVD_W - 4; pStroke(bp); }
  ctx.strokeStyle = 'rgba(255,126,182,0.35)'; ctx.lineWidth = 3; ctx.setLineDash([12, 16]); pStroke(bp); ctx.setLineDash(DASH_NONE);
  // the zones
  zoneEllipse(0, -345, 290, 130, '#fff8ee', '#f6f0ff', groundPat('hall', ['#f6f0ff', '#f6f0ff'], 'rgba(150,120,200,0.35)', null, 'marble')); // Hall of Fame (marble)
  zoneEllipse(345, -180, 190, 150, '#7a5a60', '#4a3a48', groundPat('yard', ['#4a3a48', '#4a3a48'], '#3a2a38', null, 'basalt')); // Smelter Yard (basalt)
  zoneEllipse(-345, -140, 190, 200, '#e8c89a', '#c9a878', groundPat('market', ['#c9a878', '#c9a878'], 'rgba(90,50,20,0.45)', null, 'plank')); // Market Quarter (planks)
  zoneEllipse(500, 60, 95, 70, '#fff1d6', '#f3d9a8', groundPat('arena', ['#f3d9a8', '#f3d9a8'], '#e0c08a', null, 'sand')); // Arena (sand)
  zoneEllipse(WAYPAD.x, WAYPAD.y, 86, 86, '#dff8ff', '#bfe9f4', null); // Travel Dock
  zoneEllipse(HATCH.x, HATCH.y + 10, 92, 76, '#8a7aa8', '#5a4a7a', null); // Backstage landing
  // Training Terrace: a slab-floored ring with a balustrade along its outer edge
  const tp = hubPath('terrace', terracePathTo);
  ctx.fillStyle = HV.line; ctx.translate(0, 4); pFill(tp); ctx.translate(0, -4); ctx.fillStyle = '#fff8ee'; pFill(tp);
  const slab = groundPat('terrace', ['#efe6f6', '#efe6f6'], 'rgba(120,90,160,0.35)', null, 'slab'); if (slab) { ctx.save(); if (tp) ctx.clip(tp); else ctx.clip(); ctx.fillStyle = slab; ctx.fillRect(TERRACE.x - 460, TERRACE.y, 920, 460); ctx.restore(); }
  for (let d = TERRACE.a0; d <= TERRACE.a1; d += 5.5) { const a = d * D2R, R = TERRACE.r + 96, x = TERRACE.x + Math.cos(a) * R, y = TERRACE.y + Math.sin(a) * R; ctx.fillStyle = HV.line; ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill(); ctx.fillStyle = '#d8c8f0'; ctx.beginPath(); ctx.arc(x, y - 2, 5, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = HV.line; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(TERRACE.x, TERRACE.y, TERRACE.r + 96, TERRACE.a0 * D2R, TERRACE.a1 * D2R); ctx.stroke(); ctx.strokeStyle = '#d8c8f0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(TERRACE.x, TERRACE.y - 4, TERRACE.r + 96, TERRACE.a0 * D2R, TERRACE.a1 * D2R); ctx.stroke();
  // the Stage Plaza: cobbled disc with a pink dashed ring
  ctx.fillStyle = HV.line; ctx.beginPath(); ctx.arc(0, 0, PLAZA_R + 8, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff1d6'; ctx.beginPath(); ctx.arc(0, 0, PLAZA_R, 0, TAU); ctx.fill();
  if (cob) { ctx.save(); ctx.beginPath(); ctx.arc(0, 0, PLAZA_R, 0, TAU); ctx.clip(); ctx.fillStyle = cob; ctx.fillRect(-PLAZA_R, -PLAZA_R, PLAZA_R * 2, PLAZA_R * 2); ctx.restore(); }
  ctx.strokeStyle = 'rgba(255,126,182,0.6)'; ctx.lineWidth = 5; ctx.setLineDash([16, 14]); ctx.beginPath(); ctx.arc(0, 0, PLAZA_R - 18, 0, TAU); ctx.stroke(); ctx.setLineDash(DASH_NONE);
  ctx.restore();
  // the stage the heroes come out on
  const sx = STAGE.x, sy = STAGE.y + 18;
  ctx.fillStyle = 'rgba(40,20,80,0.25)'; ctx.beginPath(); ctx.ellipse(sx, sy + 14, 120, 42, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = HV.line; ctx.beginPath(); ctx.ellipse(sx, sy + 6, 112, 42, 0, 0, TAU); ctx.fill();
  ctx.translate(0, sy - 30); ctx.fillStyle = vgrad(70, '#ff9ac8', '#d8559a'); ctx.beginPath(); ctx.ellipse(sx, 30, 106, 38, 0, 0, TAU); ctx.fill(); ctx.translate(0, 30 - sy);
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
  ctx.translate(0, y - 50); ctx.fillStyle = vgrad(56, '#6a4cc4', '#3a2a8a'); rr(x - 126, 0, 252, 54, 13); ctx.fill(); ctx.translate(0, 50 - y);
  for (let i = 0; i < 18; i++) { const a = i / 17, lx = x - 114 + a * 228, on = ((S.t * 5) | 0) % 2 === i % 2; ctx.fillStyle = on ? '#fff4c0' : '#ffd84d'; ctx.beginPath(); ctx.arc(lx, y - 44, on ? 3.4 : 2.6, 0, TAU); ctx.arc(lx, y - 2, on ? 3.4 : 2.6, 0, TAU); ctx.fill(); }
  stickerText('ENCORE ISLAND', x, y - 12, 25, '#ffc9de', '#ff5fa6', 0);
}
function plateIcon(icon, x, y, s) { if (!drawIcon(icon, x, y, s)) { ctx.fillStyle = '#fff'; ctx.font = font(s * 0.5); ctx.textAlign = 'center'; ctx.fillText('?', x, y + s * 0.18); } }
// a walk-onto plate: a stone disc set into the paving (drawn in perspective) with a rune ring that turns gold when you can afford it,
// the progress ring on the stone, and a sign post at its far edge carrying the icon, level badge, name and price
const PLATE_SQ = 0.55, DASH_RUNE = [8, 10];
function drawPlate(x, y, r, icon, label, cost, paid, o) {
  o = o || {};
  const rem = Math.max(0, cost - paid), afford = !o.gem ? S.wallet >= rem : S.gems >= rem, near = dist2(S.player.x, S.player.y, x, y) < (r + 110) * (r + 110);
  const bob = afford && !o.noBob ? Math.sin(S.t * 4 + x) * 3 : 0, pul = afford ? 0.5 + 0.5 * Math.sin(S.t * 5 + x * 0.01) : 0, c1 = o.c1 || '#7a5cd8', c2 = o.c2 || '#3a2a8a';
  ctx.translate(x, y); ctx.scale(1, PLATE_SQ);
  if (afford) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.28 + 0.22 * pul; ctx.fillStyle = ggrad(r * 0.5, r * 1.9, '#ffe98a'); ctx.beginPath(); ctx.arc(0, 0, r * 1.9, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
  ctx.fillStyle = HV.line; ctx.beginPath(); ctx.arc(0, 5, r + 6, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff1d6'; ctx.beginPath(); ctx.arc(0, 0, r + 3, 0, TAU); ctx.fill();
  ctx.fillStyle = pgrad(r, c1, c2); ctx.beginPath(); ctx.arc(0, 0, r - 2, 0, TAU); ctx.fill();
  ctx.strokeStyle = afford ? '#ffe98a' : 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3; ctx.setLineDash(DASH_RUNE); ctx.lineDashOffset = -S.t * 30; ctx.beginPath(); ctx.arc(0, 0, r * 0.68, 0, TAU); ctx.stroke(); ctx.setLineDash(DASH_NONE); ctx.lineDashOffset = 0;
  if (paid > 0 && cost > 0) { ctx.strokeStyle = o.ring || '#9af0b4'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, 0, r - 2, -Math.PI / 2, -Math.PI / 2 + Math.min(1, paid / cost) * TAU); ctx.stroke(); }
  ctx.scale(1, 1 / PLATE_SQ); ctx.translate(-x, -y);
  // the sign post rises from the back of the plate so the hero standing on it stays in front
  const sr = r * 0.6, py = y - r * PLATE_SQ + 4, sy = py - r * 1.25 + bob;
  ctx.fillStyle = HV.line; rr(x - 6, sy, 12, py - sy + 4, 4); ctx.fill(); ctx.fillStyle = '#8a6cc8'; rr(x - 3.5, sy + 4, 7, py - sy - 4, 3); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x - 2.5, sy + 8, 2, py - sy - 14);
  disc(x, sy, sr, c1, c2);
  plateIcon(icon, x, sy + 1, sr * 1.3);
  if (o.lvl !== undefined) { ctx.fillStyle = HV.line; ctx.beginPath(); ctx.arc(x + sr * 0.82, sy - sr * 0.82, 13, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffd84d'; ctx.beginPath(); ctx.arc(x + sr * 0.82, sy - sr * 0.82, 10.5, 0, TAU); ctx.fill(); ctx.fillStyle = '#3a2410'; ctx.font = font(11); ctx.textAlign = 'center'; ctx.fillText(o.lvl, x + sr * 0.82, sy - sr * 0.82 + 4); }
  if (near && label) labelPill(label, x, sy - sr - 16, '#ffffff', '#dccaff', 12);
  if (rem > 0) priceTag(rem, x, y + r * PLATE_SQ + 24, !!o.gem, afford);
  else if (o.doneTxt) labelPill(o.doneTxt, x, y + r * PLATE_SQ + 24, '#9af0b4', '#3fcf6a', 12);
}
function priceTag(v, x, y, gem, afford) {
  const txt = typeof v === 'number' ? fmt(v) : v;
  ctx.font = font(13); const w = ctx.measureText(txt).width + 36, h = 22, bx = x - w / 2, by = y - 16;
  ctx.fillStyle = HV.line; rr(bx - 2, by - 1.5, w + 4, h + 4, 12); ctx.fill();
  ctx.translate(0, by); ctx.fillStyle = afford ? (gem ? vgrad(h, '#7af0e0', '#27b5a8') : vgrad(h, '#ffe98a', '#f0b422')) : vgrad(h, '#e6dcff', '#a99ad8');
  rr(bx, 0, w, h, 11); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.4)'; rr(bx + 3, 2, w - 6, 7, 4); ctx.fill(); ctx.translate(0, -by);
  if (gem) drawGemIcon(bx + 13, by + 11, 0.7); else drawIcon('coin', bx + 13, by + 11, 22);
  ctx.fillStyle = afford ? '#3a2410' : '#5a4a88'; ctx.textAlign = 'left'; ctx.fillText(txt, bx + 25, by + 16); ctx.textAlign = 'center';
}
// the Backstage stairway (SW landing): hidden until BACKSTAGE_SHOW lands, a grated well with a lock until its plate is paid, then an open
// lit stairwell under a neon arch. Drawn with the ground so the hero on the steps stays in front.
function drawHatch() {
  const n = S.lands.length; if (n < BACKSTAGE_SHOW) return;
  const x = HATCH.x, y = HATCH.y, bp = S.bsPlate, open = bp.built, t = S.t, near = dist2(S.player.x, S.player.y, x, y) < 150 * 150;
  ctx.fillStyle = HV.line; rr(x - 60, y - 44, 120, 84, 14); ctx.fill();
  ctx.translate(0, y - 40); ctx.fillStyle = vgrad(76, '#5a4a8a', '#1e1240'); rr(x - 56, 0, 112, 76, 11); ctx.fill(); ctx.translate(0, 40 - y);
  for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#3e3076' : '#4a3a86'; ctx.globalAlpha = 1 - i * 0.18; rr(x - 48 + i * 5, y - 32 + i * 15, 96 - i * 10, 13, 3); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(x - 45 + i * 5, y - 31 + i * 15, 90 - i * 10, 2); } ctx.globalAlpha = 1;
  for (const sd of [-1, 1]) { ctx.fillStyle = HV.line; rr(x + sd * 64 - 6, y - 64, 12, 54, 4); ctx.fill(); ctx.fillStyle = '#ffd84d'; rr(x + sd * 64 - 3.5, y - 62, 7, 50, 3); ctx.fill(); ctx.fillStyle = HV.line; ctx.beginPath(); ctx.arc(x + sd * 64, y - 66, 7, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffe98a'; ctx.beginPath(); ctx.arc(x + sd * 64, y - 66, 4.5, 0, TAU); ctx.fill(); } // rope posts
  if (!open) {
    ctx.strokeStyle = '#8a8aa0'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.setLineDash([7, 5]); ctx.beginPath(); ctx.moveTo(x - 64, y - 60); ctx.quadraticCurveTo(x, y - 46, x + 64, y - 60); ctx.stroke(); ctx.setLineDash(DASH_NONE); // chain
    ctx.strokeStyle = 'rgba(255,244,230,0.45)'; ctx.lineWidth = 3; for (let gx = -44; gx <= 44; gx += 11) { ctx.beginPath(); ctx.moveTo(x + gx, y - 34); ctx.lineTo(x + gx, y + 30); ctx.stroke(); } // grate
    drawIcon('lock', x, y - 4 + Math.sin(t * 2) * 2, 44);
    labelPill('BACKSTAGE', x, y - 84, '#ffffff', '#dccaff', 12);
    if (n >= BACKSTAGE_OPEN) { const rem = Math.max(0, bp.cost - bp.paid); if (bp.paid > 0) gbar(x - 44, y + 44, 88, 8, bp.paid / bp.cost, '#ff9ac8', '#c93f78'); priceTag(rem, x, y + 72, false, S.wallet >= rem); }
    else labelPill('Opens at ' + BACKSTAGE_OPEN + ' lands  (' + n + '/' + BACKSTAGE_OPEN + ')', x, y + 60, '#e6dcff', '#a99ad8', 11);
    return;
  }
  ctx.strokeStyle = '#ff5fa6'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - 64, y - 60); ctx.quadraticCurveTo(x, y - 40, x + 64, y - 60); ctx.stroke(); // velvet rope, now opened to the side
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45 + 0.1 * Math.sin(t * 3); ctx.translate(x, y + 14); ctx.fillStyle = ggrad(4, 70, '#ff9ac8'); ctx.beginPath(); ctx.ellipse(0, 0, 70, 40, 0, 0, TAU); ctx.fill(); ctx.translate(-x, -y - 14); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; // light from below
  ctx.fillStyle = HV.line; rr(x - 76, y - 112, 152, 38, 12); ctx.fill(); ctx.translate(0, y - 109); ctx.fillStyle = vgrad(32, '#6a4cc4', '#3a2a8a'); rr(x - 73, 0, 146, 32, 10); ctx.fill(); ctx.translate(0, 109 - y); // the arch sign
  for (let i = 0; i < 9; i++) { const lx = x - 64 + i * 16, on = ((t * 5) | 0) % 2 === i % 2; ctx.fillStyle = on ? '#fff4c0' : '#ffd84d'; ctx.beginPath(); ctx.arc(lx, y - 108, on ? 3 : 2.2, 0, TAU); ctx.fill(); }
  stickerText('BACKSTAGE', x, y - 86, 17, '#ffc9de', '#ff5fa6', 0);
  if (S.place === 'hub' && S.bsHold > 0) { ctx.strokeStyle = '#ff9ac8'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.ellipse(x, y + 4, 66, 36, 0, -Math.PI / 2, -Math.PI / 2 + Math.min(1, S.bsHold / BS_HOLD) * TAU); ctx.stroke(); }
  if (near) labelPill('stand still to go down', x, y + 60, '#ffffff', '#dccaff', 11);
}
function drawStall() {
  const x = SELL.x, y = SELL.y;
  shadow(x, y + 34, 56, 0.25);
  const jf = (S.t * 0.7 | 0) % 2 ? 0 : 2; if (!artDraw('jordan', 'idle', jf, x, y + 6, 0.38, false)) { ctx.fillStyle = '#e8c49a'; ctx.beginPath(); ctx.arc(x, y - 8, 10, 0, TAU); ctx.fill(); }
  ctx.fillStyle = HV.line; rr(x - 52, y - 12, 104, 44, 12); ctx.fill(); ctx.translate(0, y - 8); ctx.fillStyle = vgrad(36, '#d9a468', '#a8703c'); rr(x - 49, -1, 98, 38, 10); ctx.fill(); ctx.translate(0, 8 - y);
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
  ctx.fillStyle = HV.line; rr(x - 68, y - 8, 136, 46, 11); ctx.fill(); ctx.translate(0, y - 4); ctx.fillStyle = vgrad(38, '#d9a468', '#a8703c'); rr(x - 65, -1, 130, 40, 9); ctx.fill(); ctx.translate(0, 4 - y);
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
  ctx.translate(0, y - 48); ctx.fillStyle = vgrad(84, '#9a7af0', '#5a3fb8'); rr(x - 48, 0, 96, 84, 15); ctx.fill(); ctx.translate(0, 48 - y);
  ctx.strokeStyle = 'rgba(30,10,80,0.28)'; ctx.lineWidth = 2.5; for (let r = 0; r < 3; r++) { const yy = y - 30 + r * 22; ctx.beginPath(); ctx.moveTo(x - 46, yy); ctx.lineTo(x + 46, yy); ctx.stroke(); for (let c = 0; c < 4; c++) { const xx = x - 36 + c * 24 + (r % 2) * 12; ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy + 22); ctx.stroke(); } }
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; rr(x - 43, y - 45, 86, 13, 6); ctx.fill();
  ctx.fillStyle = HV.line; ctx.beginPath(); ctx.moveTo(x - 31, y + 36); ctx.lineTo(x - 31, y - 4); ctx.arc(x, y - 4, 31, Math.PI, 0); ctx.lineTo(x + 31, y + 36); ctx.closePath(); ctx.fill();
  ctx.translate(0, y - 34); ctx.fillStyle = vgrad(68, '#ff6a2e', hot ? '#ffd84d' : '#a8501e'); ctx.beginPath(); ctx.moveTo(x - 26, 68); ctx.lineTo(x - 26, 30); ctx.arc(x, 30, 26, Math.PI, 0); ctx.lineTo(x + 26, 68); ctx.closePath(); ctx.fill(); ctx.translate(0, 34 - y);
  for (let i = 0; i < 4; i++) { const fx = x - 18 + i * 12, fh = (16 + 12 * Math.sin(t * 9 + i * 1.7) + (i % 2) * 6) * heat + 6; ctx.fillStyle = i % 2 ? '#ffe98a' : '#ff9a2e'; ctx.beginPath(); ctx.moveTo(fx - 7, y + 34); ctx.quadraticCurveTo(fx - 5, y + 34 - fh * 0.6, fx + Math.sin(t * 7 + i) * 3, y + 34 - fh); ctx.quadraticCurveTo(fx + 5, y + 34 - fh * 0.6, fx + 7, y + 34); ctx.closePath(); ctx.fill(); }
  if (hot) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5; ctx.translate(x, y + 10); ctx.fillStyle = ggrad(4, 70, '#ffa03c'); ctx.beginPath(); ctx.arc(0, 0, 70, 0, TAU); ctx.fill(); ctx.translate(-x, -y - 10); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
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
    labelPill('ENCORE TOUR  +' + crownsToGain() + ' crowns', x, y - 106, '#ffe98a', '#f0b422', 12); labelPill('stand still to begin', x, y - 128, '#ffffff', '#dccaff', 10); // above the crown: the signposts stand below
  } else labelPill('Encore Tour: ' + S.lands.length + '/' + PRESTIGE_MIN + ' lands', x, y - 106, '#ffffff', '#dccaff', 12);
}
function drawDen(z) {
  const d = z.g.den, pul = 0.5 + 0.5 * Math.sin(S.t * 2 + z.k);
  shadow(d.x, d.y + 6, 44, 0.3);
  ctx.fillStyle = HV.line; ctx.beginPath(); ctx.ellipse(d.x, d.y, 40, 22, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#4a2f7a'; ctx.beginPath(); ctx.ellipse(d.x, d.y + 1, 34, 17, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = 0.55 + 0.25 * pul; ctx.translate(d.x, d.y); ctx.fillStyle = ggrad(2, 26, foeCol(z.k)); ctx.beginPath(); ctx.ellipse(0, 0, 30, 15, 0, 0, TAU); ctx.fill(); ctx.translate(-d.x, -d.y); ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(d.x, d.y - 2, 24 + pul * 3, 11 + pul * 1.5, 0, 0, TAU); ctx.stroke();
}
function drawLandPlates(z) {
  for (const pl of z.plates) {
    if (pl.built) continue; // a maxed repeatable plate counts as built too
    drawPlate(pl.x, pl.y, 42, pl.icon, pl.name + (pl.repeat ? ' LV' + (pl.lvl + 1) : ''), pl.cost, pl.paid, { lvl: pl.repeat ? pl.lvl : undefined, c1: pl.id === 'altar' ? '#c85a5a' : undefined, c2: pl.id === 'altar' ? '#6a1f3a' : undefined });
  }
  if (z.altar) { const a = z.altar, ready = a.cd <= 0; drawPlate(a.x, a.y, 38, 'altar', ready ? 'Summon Headliner' : 'Headliner resting', 0, 0, { noBob: !ready, c1: ready ? '#e05a7a' : '#6a5a88', c2: ready ? '#6a1f3a' : '#3e3076' }); if (!ready) labelPill(Math.ceil(a.cd) + 's', a.x, a.y + 60, '#ffffff', '#dccaff', 12); }
  if (S.waygate) drawPad(z.pad.x, z.pad.y, 'HOME');
}
function drawPad(x, y, label) { // a warp pad: teal stone disc in perspective, a turning rune ring and the upright warp sigil
  ctx.translate(x, y); ctx.scale(1, PLATE_SQ);
  ctx.fillStyle = HV.line; ctx.beginPath(); ctx.arc(0, 5, 48, 0, TAU); ctx.fill(); ctx.fillStyle = '#dff8ff'; ctx.beginPath(); ctx.arc(0, 0, 45, 0, TAU); ctx.fill(); ctx.fillStyle = pgrad(42, '#6ec9e0', '#2a5a9a'); ctx.beginPath(); ctx.arc(0, 0, 40, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#b8f4ff'; ctx.lineWidth = 4; ctx.setLineDash([12, 9]); ctx.lineDashOffset = -S.t * 40; ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.stroke(); ctx.setLineDash(DASH_NONE); ctx.lineDashOffset = 0;
  ctx.scale(1, 1 / PLATE_SQ); ctx.translate(-x, -y);
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.3 + 0.12 * Math.sin(S.t * 4 + x); ctx.translate(x, y - 10); ctx.fillStyle = ggrad(4, 50, '#6ec9e0'); ctx.beginPath(); ctx.arc(0, 0, 50, 0, TAU); ctx.fill(); ctx.translate(-x, 10 - y); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  drawIcon('way', x, y - 22 + Math.sin(S.t * 2.5 + x) * 2, 44); labelPill(label, x, y + 46, '#b8f4ff', '#6ec9e0', 11);
}
function drawHubPlates() {
  for (const key in UPG) { const pos = UPG_POS[key], u = UPG[key]; drawPlate(pos.x, pos.y, 46, u.icon, u.name, upgCost(key, S.up[key]), S.upPaid[key], { lvl: S.up[key] + 1 }); }
  for (const key in GEMU) { const pos = GEM_POS[key], c = gemUpCost(key, S.gemUp[key]); drawPlate(pos.x, pos.y, 42, key === 'coin' ? 'coin' : key, GEMU[key].name + ' · ' + GEMU[key].what, c, S.gemPaid[key], { gem: true, lvl: S.gemUp[key], c1: '#46c8c0', c2: '#1a6a8a', ring: '#b8fff6' }); }
  if (!S.waygate && S.lands.length >= 2) drawPlate(WAYPLATE.x, WAYPLATE.y, 44, 'way', 'Warp Pads', S.wayPlate.cost, S.wayPlate.paid, { c1: '#5ab8e8', c2: '#2a5a9a', ring: '#b8f4ff' });
  if (S.waygate) drawPad(WAYPAD.x, WAYPAD.y, 'TO NEWEST');
  drawHatch();
}
function drawUnlockPlate() { // the portal to the next island: unmistakable — beacon pillar, ripples, banner and a big gold price
  const n = S.lands.length + 1, u = S.unlockPlate; if (!u) return;
  const B = biomeOf(n), rem = Math.max(0, u.cost - u.paid), afford = S.wallet >= rem, t = S.t, r = 58;
  if (vis(u.x, u.y, 200)) {
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = '#ffd678';
    const ph = (t * 0.9) % 1; // expanding ripples on the ground
    for (let i = 0; i < 2; i++) { const q = (ph + i * 0.5) % 1; ctx.globalAlpha = 0.5 * (1 - q) * (afford ? 1 : 0.5); ctx.lineWidth = 5 * (1 - q) + 1; ctx.beginPath(); ctx.ellipse(u.x, u.y + 24, 60 + q * 70, 22 + q * 26, 0, 0, TAU); ctx.stroke(); }
    const bh = afford ? 230 : 150; // beacon pillar
    ctx.globalAlpha = afford ? 0.42 + 0.14 * Math.sin(t * 5) : 0.2; ctx.translate(0, u.y - bh); ctx.fillStyle = vgrad(bh, 'rgba(255,233,138,0)', '#ffe98a');
    ctx.beginPath(); ctx.moveTo(u.x - 44, bh); ctx.lineTo(u.x - 22, 0); ctx.lineTo(u.x + 22, 0); ctx.lineTo(u.x + 44, bh); ctx.closePath(); ctx.fill(); ctx.translate(0, bh - u.y);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  drawPlate(u.x, u.y, r, 'way', '', u.cost, u.paid, { c1: B.g[0], c2: biomePal(B).portal, ring: '#ffe98a' });
}

function drawUnlockBanner() { // drawn after the y-sorted actors so trees can never hide it
  const n = S.lands.length + 1, u = S.unlockPlate; if (!u || !vis(u.x, u.y, 120)) return;
  const B = biomeOf(n), rem = Math.max(0, u.cost - u.paid), afford = S.wallet >= rem, t = S.t, r = 58;
  const by = u.y - r - 30 + Math.sin(t * 3) * 3;
  labelPill('NEW LAND · ' + B.name, u.x, by, afford ? '#ffe98a' : '#ffffff', afford ? '#f0b422' : '#dccaff', 13);
  if (afford) { ctx.save(); ctx.translate(u.x, by - 26 + Math.sin(t * 6) * 4); ctx.fillStyle = HV.line; ctx.beginPath(); ctx.moveTo(-12, -2); ctx.lineTo(12, -2); ctx.lineTo(0, 14); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#ffd84d'; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.lineTo(0, 9); ctx.closePath(); ctx.fill(); ctx.restore(); }
}
