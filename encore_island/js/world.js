'use strict';
// Encore Island — organic world generation. The hub ("Stage Plaza") sits at the origin; every new land is a noise-warped blob dropped
// along a golden-angle spiral and joined to its nearest neighbour by a curving boardwalk. All geometry is a pure function of the land
// index, so it never needs saving.
const HUB = { x: 0, y: 0, r: 400 };
const PATH_HALF = 58, RAD_N = 56, GAP = 150;
const HUB_GEO = { k: 0, x: 0, y: 0, r: HUB.r, rad: null, ia: 0, parent: -1, path: null, seed: 7 };
const LAND_GEO = [];
function mkRadii(seed, r) {
  const rad = new Float32Array(RAD_N), p1 = hash01(seed * 3 + 1) * TAU, p2 = hash01(seed * 5 + 2) * TAU, p3 = hash01(seed * 7 + 3) * TAU, p4 = hash01(seed * 11 + 4) * TAU;
  for (let i = 0; i < RAD_N; i++) {
    const a = i / RAD_N * TAU;
    rad[i] = r * (1 + 0.115 * Math.sin(a * 2 + p1) + 0.075 * Math.sin(a * 3 + p2) + 0.05 * Math.sin(a * 5 + p3) + 0.03 * Math.sin(a * 8 + p4));
  }
  return rad;
}
HUB_GEO.rad = mkRadii(7, HUB.r);
function radiusAt(g, ang) { // smooth radius lookup around a blob
  let t = ((ang % TAU) + TAU) % TAU / TAU * RAD_N; const i = Math.floor(t) % RAD_N, j = (i + 1) % RAD_N; t -= Math.floor(t);
  return g.rad[i] * (1 - t) + g.rad[j] * t;
}
function geoOf(k) { return k === 0 ? HUB_GEO : genLand(k); }
function genLand(k) {
  if (LAND_GEO[k]) return LAND_GEO[k];
  const r = 300 + 12 * Math.min(k, 12);
  const others = [HUB_GEO]; for (let j = 1; j < k; j++) others.push(genLand(j));
  let a = k * 2.39996323 + (hash01(k * 13) - 0.5) * 0.5, R = HUB.r + r + GAP, x = 0, y = 0;
  for (let it = 0; it < 240; it++) {
    x = Math.cos(a) * R; y = Math.sin(a) * R;
    let ok = true;
    for (const o of others) if (dist2(x, y, o.x, o.y) < Math.pow(r + o.r * 1.12 + GAP, 2)) { ok = false; break; }
    if (ok) break;
    R += 26; if (it % 5 === 4) a += 0.21;
  }
  let par = HUB_GEO, bd = 1e18;
  for (const o of others) { const d = dist2(x, y, o.x, o.y); if (d < bd) { bd = d; par = o; } }
  const g = { k, x, y, r, seed: 100 + k * 17, parent: par.k, rad: mkRadii(100 + k * 17, r), ia: Math.atan2(par.y - y, par.x - x) };
  // boardwalk: a gentle S-curve from the parent's rim to this land's rim (overlapping both blobs so it always connects)
  const ang = Math.atan2(y - par.y, x - par.x), pr = radiusAt(par, ang) - 70, cr = radiusAt(g, g.ia) - 70;
  const sx = par.x + Math.cos(ang) * pr, sy = par.y + Math.sin(ang) * pr, ex = x + Math.cos(g.ia) * cr, ey = y + Math.sin(g.ia) * cr;
  const dx = ex - sx, dy = ey - sy, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, off = (hash01(k * 29) - 0.5) * 0.5 * len;
  g.path = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16, w = Math.sin(t * Math.PI); g.path.push({ x: sx + dx * t + nx * off * w, y: sy + dy * t + ny * off * w }); }
  g.den = { x: x - Math.cos(g.ia) * r * 0.2, y: y - Math.sin(g.ia) * r * 0.2 };
  g.decor = mkDecor(g);
  LAND_GEO[k] = g;
  return g;
}
// scatter props on a land: trees hug the rim, flowers/rocks/mushrooms fill the middle; every spot is kept clear of the plate ring + boardwalk
function mkDecor(g) {
  const rng = mkRng(g.seed * 31 + 5), B = biomeOf(g.k), out = [];
  const keepOff = (x, y) => { for (let i = 0; i < g.path.length; i += 2) if (dist2(x, y, g.path[i].x, g.path[i].y) < 92 * 92) return true; return false; };
  for (let i = 0; i < 46; i++) { // rim trees
    const a = rng() * TAU, rr = radiusAt(g, a) * (0.80 + rng() * 0.15), x = g.x + Math.cos(a) * rr, y = g.y + Math.sin(a) * rr;
    if (keepOff(x, y)) continue; out.push({ t: 'tree', x, y, s: 0.9 + rng() * 0.55, v: (rng() * 3) | 0 });
  }
  for (let i = 0; i < 26; i++) { // inner clutter, away from the middle where plates live
    const a = rng() * TAU, rr = radiusAt(g, a) * (0.62 + rng() * 0.18), x = g.x + Math.cos(a) * rr, y = g.y + Math.sin(a) * rr;
    if (keepOff(x, y)) continue; out.push({ t: rng() < 0.5 ? 'rock' : rng() < 0.5 ? 'bush' : 'flower', x, y, s: 0.7 + rng() * 0.6, v: (rng() * 3) | 0 });
  }
  out.sort((p, q) => p.y - q.y);
  return out;
}
// walkable test over hub + unlocked lands + their boardwalks
function walkable(x, y, n) {
  if (dist2(x, y, 0, 0) < Math.pow(radiusAt(HUB_GEO, Math.atan2(y, x)) - 10, 2)) return true;
  for (let k = 1; k <= n; k++) {
    const g = LAND_GEO[k] || genLand(k), dx = x - g.x, dy = y - g.y;
    if (dx * dx + dy * dy < Math.pow(radiusAt(g, Math.atan2(dy, dx)) - 10, 2)) return true;
    const P = g.path;
    if (dx * dx + dy * dy < Math.pow(g.r * 2.6, 2) || true) for (let i = 0; i < P.length - 1; i++) {
      const ax = P[i].x, ay = P[i].y, bx = P[i + 1].x, by = P[i + 1].y, vx = bx - ax, vy = by - ay;
      const t = clamp(((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1), 0, 1);
      if (dist2(x, y, ax + vx * t, ay + vy * t) < PATH_HALF * PATH_HALF) return true;
    }
  }
  return false;
}
// which land (0 = hub) is the point standing in, or -1 on a boardwalk / nowhere
function landAt(x, y, n) {
  for (let k = n; k >= 1; k--) { const g = geoOf(k), dx = x - g.x, dy = y - g.y; if (dx * dx + dy * dy < Math.pow(radiusAt(g, Math.atan2(dy, dx)), 2)) return k; }
  if (dist2(x, y, 0, 0) < Math.pow(radiusAt(HUB_GEO, Math.atan2(y, x)), 2)) return 0;
  return -1;
}
function worldExtent(n) {
  let x0 = -HUB.r, x1 = HUB.r, y0 = -HUB.r, y1 = HUB.r;
  for (let k = 1; k <= n + 1; k++) { const g = geoOf(k); x0 = Math.min(x0, g.x - g.r * 1.2); x1 = Math.max(x1, g.x + g.r * 1.2); y0 = Math.min(y0, g.y - g.r * 1.2); y1 = Math.max(y1, g.y + g.r * 1.2); }
  return { x0, y0, x1, y1 };
}
const polar = (g, off, f) => ({ x: g.x + Math.cos(g.ia + off) * g.r * f, y: g.y + Math.sin(g.ia + off) * g.r * f });
const D2R = Math.PI / 180;

// ---- hub furniture (all offsets from the Stage Plaza centre) ----
const STAGE = { x: 0, y: 40 };
const SELL = { x: -175, y: -85, r: 62 }, VAULT = { x: -165, y: 95, r: 68 };
const FORGE = { x: 185, y: -105, r: 55 }, TRAY = { x: 195, y: 45, r: 55 }, FUP = { x: 278, y: -40, r: 44 };
const MONU = { x: 0, y: -235, r: 48 }, WAYPAD = { x: 255, y: 150, r: 44 }, WAYPLATE = { x: 120, y: 190, r: 46 };
const UPG_POS = { speed: { x: -265, y: 205 }, cap: { x: -135, y: 262 }, dmg: { x: 0, y: 282 }, rate: { x: 135, y: 262 }, hp: { x: 265, y: 205 } };
const GEM_POS = { magnet: { x: -255, y: -165 }, crit: { x: -310, y: -20 }, coin: { x: -265, y: 118 } };
// plates inside a land (positions are polar around the land centre, relative to the direction of the entrance)
function landPlateDefs(k, g) {
  const bc = bcost(k), P = (id, name, icon, off, f, cost, rep) => { const p = polar(g, off * D2R, f); return { id, name, icon, x: p.x, y: p.y, base: Math.ceil(cost), cost: Math.ceil(cost), mul: rep ? rep.mul : 0, maxLvl: rep ? rep.max : 0, paid: 0, lvl: 0, built: false, repeat: !!rep }; };
  const POOL = [{ id: 'tower2', name: 'Speaker Tower', icon: 'tower', mul: 1.5 }, { id: 'wizard', name: 'Disco Tower', icon: 'disco', mul: 1.8 }, { id: 'catapult', name: 'Boom Box', icon: 'boom', mul: 1.7 }, { id: 'drums', name: 'War Drums', icon: 'drums', mul: 1.4 }];
  const pl = [P('tower1', 'Speaker Tower', 'tower', 52, 0.56, 70 * bc), P('gate2', 'Crowd Gate', 'gate', 100, 0.52, 110 * bc, { mul: 1.6, max: 4 }), P('towersUp', 'Amp Up', 'amp', -100, 0.52, 130 * bc, { mul: 1.7, max: 6 })];
  if (k === 1) pl.push(P('tower2', 'Speaker Tower', 'tower', -52, 0.56, 120 * bc));
  else {
    const a = POOL[k % 4], b = POOL[(k + 2) % 4];
    pl.push(P(a.id, a.name, a.icon, -52, 0.56, 95 * bc * a.mul)); pl.push(P(b.id, b.name, b.icon, 145, 0.58, 95 * bc * b.mul)); pl.push(P('altar', 'Headliner Stage', 'altar', 180, 0.7, 200 * bc));
  }
  return pl;
}
// where the plate that opens land k+1 sits: inside land k's rim, facing the next land
function unlockSpot(kNext) {
  const c = geoOf(kNext), par = geoOf(c.parent), ang = Math.atan2(c.y - par.y, c.x - par.x), rr = radiusAt(par, ang) - 105;
  return { x: par.x + Math.cos(ang) * rr, y: par.y + Math.sin(ang) * rr };
}
function landPadSpot(g) { const p = polar(g, 0, 0.8); return { x: p.x, y: p.y }; }
