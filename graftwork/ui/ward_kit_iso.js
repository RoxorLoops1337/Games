// THE WARD, modular room renderer (design/WARD.md "Modular kit renderer"). ui/ward_iso.js calls this for every room type that has a usable
// recipe (data/ward_kit.js resolved against assets/ward_kit/manifest.json); every other room keeps its painted sprite.
//
// A room is drawn from KIT pieces in the Ward projection (TW 92 x TH 48): a floor diamond filled with a seamless texture through an affine
// pattern, two back wall slabs (the L wall on the u = 0 edge, the R wall on the v = 0 edge) with texture, shading and a coping strip, wall
// pieces (windows, sconces, banners, doors) sheared onto the wall plane, a plinth slab on the open front edges, soft prop shadows. That is the
// STATIC LAYER: it is cached to an offscreen canvas per room, keyed by recipe, wall heights, doors, slabs, the dark tint and a zoom bucket.
// Props are separate sprites, drawn every frame together with the actors sorted by depth (world y of the feet), so a monster or the hero walks
// behind and in front of a bench. Shared walls belong to the room in FRONT (the L wall of (x, y) borders (x - 1, y), the R wall borders
// (x, y - 1)); doors sit where the engine connects two rooms (engine/ward.js neighbors), see wallPlan in data/ward_kit.js.
import { FLAGS } from './perf_flags.js';
import { bucketOf as bucketOfZ, pickLayer, evictFor, isMoving } from './layer_cache.js';
import { SUB, WALL_FULL, WALL_LOW, resolveRecipe, wallHeight, defaultWallMode, pathInRoom, pathOnGrid, propAt } from '../data/ward_kit.js';
import { assets } from './assets.js';

export const TW = 92, TH = 48, HW = TW / 2, HH = TH / 2;
const DOOR_H = 36, DOOR_S0 = 0.2, DOOR_S1 = 0.8, TAU = Math.PI * 2;
const COPE = { wood: '#7a5a3c', stone: '#9b968c', brick: '#8a5a48', plaster: '#d8ccb4', tile: '#cfd6d2', velvet: '#6a1c28', slab: '#8d8a84' };
const FLOORC = { wood: '#5a3a22', stone: '#6b665e', tile: '#9aa09a', darkstone: '#3b3835', carpet: '#6a2a30', brick: '#7a4a3a', slab: '#7d7b78', stage: '#4a2428' };
const WALLC = { wood: '#4a3424', stone: '#5e5a52', tile: '#aab0aa', brick: '#74463a', plaster: '#b9ae98', velvet: '#5a1a26', slab: '#6d6b66' };
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// wall mode setting: 'auto' follows the density (defaultWallMode), or 'full' | 'low' | 'cutaway'
export const KITS = { mode: 'auto', log: null }; // log: tests set an array to record the draw order of props and actors
export function wallModeFor(nRooms) { return KITS.mode === 'auto' ? defaultWallMode(nRooms) : KITS.mode; }
export function cycleWallMode() { const L = ['auto', 'full', 'low', 'cutaway']; KITS.mode = L[(L.indexOf(KITS.mode) + 1) % L.length]; return KITS.mode; }

const Q = { mips: new Map(), pats: new Map(), layers: new Map(), dark: new WeakMap(), wallH: Object.create(null), mons: new Map(), hpaths: new Map(), shadow: null, stats: { layers: 0, hits: 0, msStatic: 0, msItems: 0 } };
export const kitStats = Q.stats;
export function resetKit() { Q.mips.clear(); Q.pats.clear(); Q.layers.clear(); Q.wallH = Object.create(null); Q.mons.clear(); Q.hpaths.clear(); Q.stats.layers = 0; Q.stats.hits = 0; }
function mk(w, h) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  try { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); const x = c.getContext('2d'); return x ? { c, x } : null; } catch (e) { return null; }
}

// ---------------- which rooms are modular ----------------
// the recipe of a room type, or null (painted): needs the kit manifest, every kit image settled, and a variant whose floor and wall exist
export function recipeFor(type, app, fw = 1, fh = 1) { // fw x fh = the room's footprint in cells (a big room has its own plans, data/ward_kit_big.js)
  if (!assets.kitReady()) return null;
  const rc = resolveRecipe(type, assets.kit, fw, fh); if (!rc) return null;
  if (!assets.kitRecipeSettled(rc, app)) return null; // only THIS recipe's images are awaited (the title needs five rooms, not the whole kit)
  if (!assets.kitImg('floors', rc.floor, app) || !assets.kitImg('walls', rc.wall, app)) return null; // the texture failed to load: paint it
  return rc;
}

// true once every listed room type has its images settled (the title scene waits on its five rooms)
export function recipesSettled(types, app) {
  if (!assets.kitReady()) return false;
  for (const t of types) { const rc = resolveRecipe(t, assets.kit); if (rc && !assets.kitRecipeSettled(rc, app)) return false; }
  return true;
}

// ---------------- geometry (room-local: the top vertex of the floor diamond is the origin) ----------------
export const subPt = (gu, gv) => ({ x: (gu - gv) * HW / SUB, y: (gu + gv) * HH / SUB });
// a room covers fw x fh cells: the L wall (u = 0) is fh cells long, the R wall (v = 0) fw cells; n = cells along the wall. s runs 0 to 1 over the whole wall.
const wallPt = (side, s, n = 1) => (side === 'L' ? { x: -n * HW + s * n * HW, y: n * HH - s * n * HH } : { x: s * n * HW, y: s * n * HH });
const wallN = (rc, side) => (side === 'L' ? rc.fh || 1 : rc.fw || 1);
export function corners(rc) { const fw = rc.fw || 1, fh = rc.fh || 1; return { T: [0, 0], R: [fw * HW, fw * HH], B: [(fw - fh) * HW, (fw + fh) * HH], L: [-fh * HW, fh * HH], fw, fh }; }
const asDoors = (d, n) => (Array.isArray(d) ? d : Array(n).fill(!!d));
// the extent of a room's static layer (room-local, top vertex = origin)
export const extentOf = (rc) => { const fw = rc.fw || 1, fh = rc.fh || 1; return { x0: -fh * HW - 5, y0: -(WALL_FULL + 16), x1: fw * HW + 5, y1: (fw + fh) * HH + 12 }; };
function poly(g, pts) { g.beginPath(); for (let i = 0; i < pts.length; i++) (i ? g.lineTo(pts[i][0], pts[i][1]) : g.moveTo(pts[i][0], pts[i][1])); g.closePath(); }

// ---------------- textures: mip chains so a pattern never aliases when the camera zooms out ----------------
function mipLevel(img, key, wantPx) {
  let ch = Q.mips.get(key);
  if (!ch) {
    ch = []; const w0 = img.naturalWidth || img.width || 0, h0 = img.naturalHeight || img.height || 0, o = w0 ? mk(w0, h0) : null;
    if (!o) { Q.mips.set(key, null); return null; }
    o.x.drawImage(img, 0, 0); ch.push(o.c);
    while (ch[ch.length - 1].width > 32) { const p = ch[ch.length - 1], n = mk(p.width / 2, p.height / 2); if (!n) break; n.x.imageSmoothingQuality = 'high'; n.x.drawImage(p, 0, 0, n.c.width, n.c.height); ch.push(n.c); }
    Q.mips.set(key, ch);
  }
  if (!ch) return null;
  let pick = ch[0]; for (const c of ch) if (c.width >= wantPx) pick = c;
  return pick;
}
// fill the current path with the texture mapped so the unit square lands on origin (ox, oy) + u (ux, uy) + v (vx, vy) (world units)
function texFill(g, tex, key, ox, oy, ux, uy, vx, vy, fallback, px) {
  if (!tex || typeof DOMMatrix === 'undefined' || !g.createPattern) { g.fillStyle = fallback; g.fill(); return; }
  const lv = mipLevel(tex.img, key, Math.max(Math.hypot(ux, uy), Math.hypot(vx, vy)) * px);
  if (!lv || !lv.width) { g.fillStyle = fallback; g.fill(); return; }
  const S = lv.width, pk = key + '|' + S; let pat = Q.pats.get(pk);
  if (!pat) { pat = g.createPattern(lv, 'repeat'); if (!pat) { g.fillStyle = fallback; g.fill(); return; } Q.pats.set(pk, pat); }
  pat.setTransform(new DOMMatrix([ux / S, uy / S, vx / S, vy / S, ox, oy]));
  g.fillStyle = pat; g.fill();
}

// ---------------- the static layer ----------------
function drawSlab(g, rc, p) { // the floor's thickness on the open front edges: a plinth with a lit top rim
  const C = corners(rc), th = 6, stone = rc.wall !== 'wood';
  const side = (a, b, c0, c1) => {
    poly(g, [[a.x, a.y], [b.x, b.y], [b.x, b.y + th], [a.x, a.y + th]]); const gr = g.createLinearGradient(0, a.y, 0, a.y + th + HH); gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.fillStyle = gr; g.fill();
    g.strokeStyle = '#0d0907'; g.lineWidth = 1; g.stroke(); g.strokeStyle = 'rgba(255,214,150,.28)'; g.beginPath(); g.moveTo(a.x, a.y + 0.6); g.lineTo(b.x, b.y + 0.6); g.stroke();
  };
  const runs = (flags, n) => { const out = []; let k = 0; while (k < n) { if (!flags[k]) { k++; continue; } let e = k; while (e < n && flags[e]) e++; out.push([k, e]); k = e; } return out; };
  for (const [a, b] of runs(asDoors(p.slabLs || !!p.slabL, C.fw), C.fw)) side({ x: C.L[0] + a * HW, y: C.L[1] + a * HH }, { x: C.L[0] + b * HW, y: C.L[1] + b * HH }, stone ? '#6d6a63' : '#6a4a30', stone ? '#3b3935' : '#3a2616');
  for (const [a, b] of runs(asDoors(p.slabRs || !!p.slabR, C.fh), C.fh)) side({ x: C.B[0] + a * HW, y: C.B[1] - a * HH }, { x: C.B[0] + b * HW, y: C.B[1] - b * HH }, stone ? '#4f4d48' : '#4e3522', stone ? '#2a2927' : '#2a190e');
}
function drawFloor(g, rc, tex, px) {
  const C = corners(rc);
  g.beginPath(); g.moveTo(0, -0.3); g.lineTo(C.R[0] + 0.3, C.R[1]); g.lineTo(C.B[0], C.B[1] + 0.3); g.lineTo(C.L[0] - 0.3, C.L[1]); g.closePath();
  texFill(g, tex, 'f:' + rc.floor, 0, 0, HW, HH, -HW, HH, FLOORC[rc.floor] || '#5a4a3a', px); // one texture tile = one cell of the room
  g.strokeStyle = 'rgba(10,6,3,.55)'; g.lineWidth = 0.8; g.stroke();
}
function wallSolid(g, rc, tex, side, s0, s1, hb, H, px) {
  if (H <= hb + 0.2) return;
  const n = wallN(rc, side), a = wallPt(side, s0, n), b = wallPt(side, s1, n), pts = [[a.x, a.y - hb], [b.x, b.y - hb], [b.x, b.y - H], [a.x, a.y - H]];
  poly(g, pts);
  const o = wallPt(side, 0, n);
  texFill(g, tex, 'w:' + rc.wall, o.x, o.y - WALL_FULL, HW, side === 'L' ? -HH : HH, 0, WALL_FULL, WALLC[rc.wall] || '#4a3424', px);
  // light from the upper left: the left wall a little brighter, the right one darker, both darker toward the floor
  const gr = g.createLinearGradient(0, a.y - H, 0, a.y); gr.addColorStop(0, side === 'L' ? 'rgba(255,214,150,.07)' : 'rgba(0,0,0,.12)'); gr.addColorStop(1, side === 'L' ? 'rgba(0,0,0,.34)' : 'rgba(0,0,0,.46)');
  poly(g, pts); g.fillStyle = gr; g.fill();
  const cp = 3.6; poly(g, [[a.x, a.y - H], [b.x, b.y - H], [b.x, b.y - H - cp], [a.x, a.y - H - cp]]); g.fillStyle = COPE[rc.wall] || '#8a7a62'; g.fill();
  g.strokeStyle = 'rgba(255,225,170,.35)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(a.x, a.y - H - cp + 0.4); g.lineTo(b.x, b.y - H - cp + 0.4); g.stroke();
  g.strokeStyle = '#0d0907'; g.lineWidth = 1; g.beginPath(); g.moveTo(a.x, a.y - H - cp); g.lineTo(b.x, b.y - H - cp); g.moveTo(a.x, a.y - H); g.lineTo(b.x, b.y - H); g.stroke();
  g.beginPath(); g.moveTo(a.x, a.y - hb); g.lineTo(a.x, a.y - H - cp); g.moveTo(b.x, b.y - hb); g.lineTo(b.x, b.y - H - cp); g.stroke();
}
function drawWall(g, rc, tex, side, door, H, px) { // door: a bool, or one bool per cell of the wall (a big room has a door wherever a neighbour meets it)
  const n = wallN(rc, side), ds = asDoors(door, n);
  let k = 0;
  while (k < n) {
    if (!ds[k]) { let e = k; while (e < n && !ds[e]) e++; wallSolid(g, rc, tex, side, k / n, e / n, 0, H, px); k = e; continue; }
    const a = k / n, b = (k + 1) / n, d = b - a;
    wallSolid(g, rc, tex, side, a, a + d * DOOR_S0, 0, H, px); wallSolid(g, rc, tex, side, a + d * DOOR_S1, b, 0, H, px); wallSolid(g, rc, tex, side, a + d * DOOR_S0, a + d * DOOR_S1, DOOR_H, H, px); k++;
  }
}
function post(g, rc, x, y, H) { const stone = rc.wall !== 'wood'; g.fillStyle = stone ? '#6f6a61' : '#4a3322'; g.fillRect(x - 1.8, y - H - 4, 3.6, H + 4); g.strokeStyle = '#0d0907'; g.lineWidth = 1; g.strokeRect(x - 1.8, y - H - 4, 3.6, H + 4); g.fillStyle = 'rgba(255,225,170,.25)'; g.fillRect(x - 1.8, y - H - 4, 1.2, H + 4); }
// a flat sprite on a wall, sheared so its horizontal edges follow the wall direction. Returns the screen point it sits at (for lamp glow) or null.
function wallSprite(g, def, im, side, s, H, alpha, n = 1) {
  const base = wallPt(side, s, n), sc = def.sw && def.w ? def.sw / def.w : 0.1, up = def.wallSlot === 'floor' ? 0 : WALL_FULL * 0.55;
  const top = up + (def.h - def.anchorY) * sc;
  const vis = clamp((H - top + 8) / 8, 0, 1) * alpha; if (vis <= 0.01) return null;
  if (g) {
    g.save(); g.globalAlpha *= vis; g.transform(1, side === 'L' ? -HH / HW : HH / HW, 0, 1, base.x, base.y - up);
    if (im) g.drawImage(im, -def.anchorX * sc, -def.anchorY * sc, def.w * sc, def.h * sc); else { g.fillStyle = '#c9a22788'; g.fillRect(-6, -8, 12, 16); }
    g.restore();
  }
  return { x: base.x, y: base.y - up, top };
}
// is a piece at position s (0..1 over a wall of n cells) in the doorway of one of its cells?
const onDoor = (s, ds, n) => { const k = Math.min(n - 1, Math.max(0, Math.floor(s * n))); return !!ds[k] && Math.abs(s * n - k - 0.5) < 0.3; };
const doorsOf = (p, side, rc) => { const n = wallN(rc, side); return asDoors(side === 'L' ? (p.dL || p.doorL) : (p.dR || p.doorR), n); };
function drawPieces(g, rc, p, app) {
  for (const side of ['L', 'R']) {
    const n = wallN(rc, side), H = side === 'L' ? p.HL : p.HR, ds = doorsOf(p, side, rc);
    if (rc.doorPiece) for (let k = 0; k < n; k++) if (ds[k]) { const d = assets.kitImg('pieces', rc.doorPiece, app); if (d) wallSprite(g, d.def, d.img, side, (k + 0.5) / n, H, clamp((H - 30) / 8, 0, 1), n); }
    for (const pc of rc.pieces) {
      if (pc.wall !== side || onDoor(pc.s, ds, n)) continue;
      const d = assets.kitImg('pieces', pc.id, app); if (!d) continue;
      wallSprite(g, d.def, d.img, side, pc.s, H, 1, n);
    }
  }
}
// lamp glows of the sconces and windows (room-local points, with the wall heights of the moment)
export function glowPoints(rc, p, app, out = []) {
  out.length = 0;
  for (const side of ['L', 'R']) {
    const n = wallN(rc, side), H = side === 'L' ? p.HL : p.HR, ds = doorsOf(p, side, rc);
    for (const pc of rc.pieces) {
      if (pc.wall !== side || onDoor(pc.s, ds, n) || (pc.id !== 'sconce' && pc.id !== 'window' && pc.id !== 'stainedglass')) continue;
      const d = assets.kitDef('pieces', pc.id); if (!d) continue;
      const r = wallSprite(null, d, null, side, pc.s, H, 1, n); if (r) out.push(r.x, r.y, pc.id === 'sconce' ? 0.7 : 0.45);
    }
  }
  return out;
}
function propPos(pr) { const cu = pr.u + pr.c / 2, cv = pr.v + pr.r / 2, q = subPt(cu, cv); return { x: q.x, y: q.y, key: cu + cv }; }
function propShadow(g, rc, pr) {
  const P = propPos(pr), w = (pr.c + pr.r) * HW / SUB * 0.36 + 1.5;
  const C = corners(rc);
  g.save(); g.beginPath(); g.moveTo(0, 0); g.lineTo(C.R[0], C.R[1]); g.lineTo(C.B[0], C.B[1]); g.lineTo(C.L[0], C.L[1]); g.closePath(); g.clip();
  g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgba(48,28,16,.5)'; g.beginPath(); g.ellipse(P.x + 1.5, P.y + 1, w, w * 0.46, 0, 0, TAU); g.fill(); g.restore();
}
// everything static of one room, in room-local coordinates (the caller translated the origin to the top vertex)
function paintStatic(g, rc, p, app, px) {
  const ft = assets.kitImg('floors', rc.floor, app), wt = assets.kitImg('walls', rc.wall, app);
  drawSlab(g, rc, p); drawFloor(g, rc, ft, px);
  drawWall(g, rc, wt, 'L', p.dL || p.doorL, p.HL, px); drawWall(g, rc, wt, 'R', p.dR || p.doorR, p.HR, px);
  { const C = corners(rc); post(g, rc, 0, 0, Math.max(p.HL, p.HR)); post(g, rc, C.L[0], C.L[1], p.HL); post(g, rc, C.R[0], C.R[1], p.HR); }
  drawPieces(g, rc, p, app);
  for (const pr of rc.props) propShadow(g, rc, pr);
  if (p.dark) { // unpowered: a cold, dark multiply over the room's own floor and walls
    g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = '#39416a';
    const C = corners(rc);
    for (const pts of [[[0, 0], C.R, C.B, C.L], [C.L, [0, 0], [0, -p.HL - 4], [C.L[0], C.L[1] - p.HL - 4]], [[0, 0], C.R, [C.R[0], C.R[1] - p.HR - 4], [0, -p.HR - 4]]]) { poly(g, pts); g.fill(); }
    g.restore();
  }
}
export const bucketOf = bucketOfZ;
// draw the static layer of a room with its top vertex at (tx, ty). `p` = { HL, HR, doorL, doorR, slabL, slabR, dark }. Cached per zoom bucket when a DOM exists.
export function drawStatic(app, g, id, rc, tx, ty, p, zoomPx) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  try { return drawStatic0(app, g, id, rc, tx, ty, p, zoomPx); } finally { if (t0) Q.stats.msStatic += performance.now() - t0; }
}
let builtFrame = -1, builtN = 0;
function drawStatic0(app, g, id, rc, tx, ty, p, zoomPx) {
  const EX = extentOf(rc), want = bucketOfZ(zoomPx || 1), base = [rc.key, Math.round(p.HL), Math.round(p.HR), p.doorL ? 1 : 0, p.doorR ? 1 : 0, p.slabL ? 1 : 0, p.slabR ? 1 : 0, p.dark ? 1 : 0, (p.dL || []).map(Number).join(''), (p.dR || []).map(Number).join(''), (p.slabLs || []).map(Number).join(''), (p.slabRs || []).map(Number).join('')].join('|');
  let e = Q.layers.get(id);
  if (!e || e.base !== base) { e = { base, by: new Map(), z: 0 }; Q.layers.set(id, e); }
  if (app.frame === undefined || app.frame !== builtFrame) { builtFrame = app.frame; builtN = 0; }
  const moving = isMoving(e.z, zoomPx || 1); e.z = zoomPx || 1;
  const pick = FLAGS.layers ? pickLayer(want, [...e.by.keys()], { built: builtN, moving }) : { bucket: want, build: !e.by.has(want) }; // layers=0: the old one-bucket cache
  let cv = e.by.get(pick.bucket);
  if (!cv && pick.build) {
    const bucket = pick.bucket, o = mk((EX.x1 - EX.x0) * bucket, (EX.y1 - EX.y0) * bucket);
    if (o) {
      o.x.scale(bucket, bucket); o.x.translate(-EX.x0, -EX.y0);
      paintStatic(o.x, rc, { ...p, HL: Math.round(p.HL), HR: Math.round(p.HR) }, app, bucket);
      cv = o.c; e.by.set(bucket, cv); builtN++; Q.stats.layers++;
      if (FLAGS.layers) { for (const b of evictFor([...e.by.keys()], want)) e.by.delete(b); } else { for (const b of [...e.by.keys()]) if (b !== bucket) e.by.delete(b); }
      if (Q.layers.size > 96) { Q.layers.clear(); Q.layers.set(id, e); }
    }
  } else if (cv) Q.stats.hits++;
  if (cv) { g.drawImage(cv, tx + EX.x0, ty + EX.y0, EX.x1 - EX.x0, EX.y1 - EX.y0); return true; }
  g.save(); g.translate(tx, ty); paintStatic(g, rc, p, app, zoomPx || 1); g.restore();
  return false;
}
export const dropLayer = (id) => Q.layers.delete(id);

// ---------------- wall heights: eased per room and side ----------------
export function wallHeights(id, plan, mode, tk, dt, calm) {
  const out = { HL: 0, HR: 0 };
  for (const side of ['L', 'R']) {
    const shared = side === 'L' ? plan.sharedL : plan.sharedR;
    let want = wallHeight(mode, shared); if (tk > 0 && mode !== 'low') want = Math.min(want, WALL_LOW + (tk === 1 ? 4 : 0));
    const k = id + side; let h = Q.wallH[k]; if (h === undefined || calm) h = want;
    h += (want - h) * Math.min(1, dt * 9); if (Math.abs(want - h) < 0.15) h = want; Q.wallH[k] = h;
    out['H' + side] = h;
  }
  return out;
}
export const currentWallH = (id) => ({ HL: Q.wallH[id + 'L'], HR: Q.wallH[id + 'R'] });

// ---------------- props, animated overlays and the depth pass ----------------
function darkImg(img) {
  let v = Q.dark.get(img); if (v !== undefined) return v;
  const iw = img.naturalWidth || img.width || 0, ih = img.naturalHeight || img.height || 0, k = Math.min(1, 480 / Math.max(1, iw)), o = iw ? mk(iw * k, ih * k) : null;
  if (o) { o.x.drawImage(img, 0, 0, o.c.width, o.c.height); o.x.globalCompositeOperation = 'source-atop'; o.x.fillStyle = 'rgba(88,96,128,.5)'; o.x.fillRect(0, 0, o.c.width, o.c.height); o.x.fillStyle = 'rgba(8,8,16,.45)'; o.x.fillRect(0, 0, o.c.width, o.c.height); }
  v = o ? o.c : null; Q.dark.set(img, v); return v;
}
export function propWorldY(rc, ty, pr) { return ty + propPos(pr).y; }
function drawProp(app, g, pr, tx, ty, dark) {
  const d = assets.kitImg('props', pr.id, app), P = propPos(pr);
  g.save(); g.translate(tx + P.x, ty + P.y); if (pr.flip) g.scale(-1, 1);
  if (d) { const k = d.def.sw / d.def.w; let im = d.img; if (dark) { const dk = darkImg(im); if (dk) im = dk; } g.drawImage(im, -d.def.anchorX * k, -d.def.anchorY * k, d.def.w * k, d.def.h * k); }
  else { g.fillStyle = '#c9a22788'; g.fillRect(-8, -14, 16, 14); }
  g.restore();
  return d;
}
function animate(app, g, pr, d, tx, ty, t, glow) {
  if (!d || !pr.anim) return;
  const P = propPos(pr), x = tx + P.x, hgt = d.def.h * d.def.sw / d.def.w, y = ty + P.y - hgt * 0.6, ph = hash(pr.id + pr.u + pr.v) * TAU;
  g.save();
  if (pr.anim === 'spark') { // an arc jumps across the generator now and then
    const on = Math.sin(t * 2.3 + ph) > 0.55 || ((t * 7 + ph) % 3.1) < 0.12;
    if (on) { g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(170,220,255,.95)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(x - 4, y); for (let i = 1; i <= 5; i++) g.lineTo(x - 4 + i * 1.7, y + (i % 2 ? -2.6 : 2.2) * Math.sin(t * 40 + i)); g.stroke(); g.fillStyle = 'rgba(150,200,255,.5)'; g.beginPath(); g.arc(x + 4, y, 2.4, 0, TAU); g.fill(); glow.push(x, y, 0.25); }
  } else if (pr.anim === 'saw') { // the blade glints and a few motes of sawdust drift off
    const k = (t * 1.6 + ph) % 1;
    g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(255,240,200,${0.5 * Math.sin(k * Math.PI)})`; g.beginPath(); g.ellipse(x + (k - 0.5) * 9, y + 2, 2.6, 0.9, 0, 0, TAU); g.fill();
    for (let i = 0; i < 3; i++) { const q = (t * 0.5 + i / 3 + ph) % 1; g.fillStyle = `rgba(240,214,160,${0.6 * Math.sin(q * Math.PI)})`; g.beginPath(); g.arc(x - 6 + i * 5 + Math.sin(q * 5 + i) * 2, y + 6 - q * 12, 0.8, 0, TAU); g.fill(); }
  } else if (pr.anim === 'flame') {
    const fl = 0.85 + 0.15 * Math.sin(t * 9 + ph) * Math.sin(t * 5.3 + ph); g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgba(255,200,90,.85)'; g.beginPath(); g.ellipse(x, y - hgt * 0.2, 1.8 * fl, 3.4 * fl, 0, 0, TAU); g.fill(); glow.push(x, y - hgt * 0.2, 0.3);
  }
  g.restore();
}
// draw the props of one room together with the actors that stand in it, back to front. items: [{ y, rec }] (o.actor(rec) draws one).
const SORT = [];
export function drawItems(app, g, rc, tx, ty, lift, items, o) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  drawItems0(app, g, rc, tx, ty, lift, items, o); if (t0) Q.stats.msItems += performance.now() - t0;
}
function drawItems0(app, g, rc, tx, ty, lift, items, o) {
  SORT.length = 0;
  for (let i = 0; i < rc.props.length; i++) SORT.push({ y: propWorldY(rc, ty, rc.props[i]), pr: rc.props[i], a: null });
  for (const it of items) SORT.push({ y: it.y, pr: null, a: it });
  SORT.sort((a, b) => a.y - b.y);
  if (KITS.log) KITS.log.push({ ty, order: SORT.map((s) => (s.pr ? 'prop:' + s.pr.id : 'actor:' + s.a.rec.kind) + '@' + s.y.toFixed(2)) });
  g.save(); if (lift) g.translate(0, -lift);
  for (const s of SORT) {
    if (s.pr) { const d = drawProp(app, g, s.pr, tx, ty, o.dark); if (!o.calm && !o.dark) animate(app, g, s.pr, d, tx, ty, o.t, o.glow); } else o.actor(s.a.rec);
  }
  g.restore();
}

// ---------------- monsters: wander the free sub-tiles of their room, never through a prop ----------------
export function monsterAt(key, i, rc, calm, dt, speed = 0.9) {
  let st = Q.mons.get(key);
  if (!st || st.rc !== rc.key) {
    const free = rc.free.filter((f) => !(f[0] === rc.stand[0] && f[1] === rc.stand[1]));
    const cell = free.length ? free[(Math.floor(hash(key) * 997) + i * 3) % free.length] : rc.stand;
    st = { rc: rc.key, cu: cell[0], cv: cell[1], gu: cell[0] + 0.5, gv: cell[1] + 0.5, path: [], wait: hash(key + 'w') * 2.5, face: i % 2 ? -1 : 1, fv: i % 2 ? -1 : 1, s: (hash(key + 's') * 4294967295) | 1, mv: false, dist: 0, vk: 0, turn: 0 };
    Q.mons.set(key, st);
  }
  const rnd = () => { st.s ^= st.s << 13; st.s ^= st.s >>> 17; st.s ^= st.s << 5; return ((st.s >>> 0) % 10000) / 10000; };
  st.lastStep = 0;
  if (calm) { st.gu = st.cu + 0.5; st.gv = st.cv + 0.5; st.path.length = 0; st.mv = false; st.vk = 0; st.fv = st.face; return st; }
  if (!st.path.length) {
    st.mv = false; st.vk += (0 - st.vk) * Math.min(1, dt * 10);
    st.wait -= dt;
    if (st.wait <= 0) {
      const tgt = rc.free[Math.floor(rnd() * rc.free.length)]; const p = tgt ? pathInRoom(rc, [st.cu, st.cv], tgt) : null;
      if (p && p.length > 1) { st.path = p.slice(1); } else st.wait = 1 + rnd() * 2;
    }
  }
  if (st.path.length) {
    st.vk += (1 - st.vk) * Math.min(1, dt * 7); // ease in
    { const t0 = st.path[0], d0 = Math.hypot(t0[0] + 0.5 - st.gu, t0[1] + 0.5 - st.gv); st.slow = st.path.length === 1 ? clamp(d0 / 0.6, 0.2, 1) : 1; } // ease out into the stop
    let rem = speed * st.vk * st.slow * dt, moved = 0;
    st.mv = true;
    while (rem > 1e-9 && st.path.length) { // the step carries over a corner, so the speed never stutters at a waypoint
      const t = st.path[0], tx = t[0] + 0.5, ty = t[1] + 0.5, dx = tx - st.gu, dy = ty - st.gv, d = Math.hypot(dx, dy);
      if (Math.abs(dx - dy) > 0.01) { const nf = dx - dy >= 0 ? 1 : -1; if (nf !== st.face) st.face = nf; }
      if (d <= rem + 1e-9) { st.gu = tx; st.gv = ty; st.cu = t[0]; st.cv = t[1]; st.path.shift(); rem -= d; moved += d; if (!st.path.length) { st.wait = 1.2 + rnd() * 3.2; st.mv = false; } }
      else { st.gu += dx / d * rem; st.gv += dy / d * rem; moved += rem; rem = 0; }
    }
    st.lastStep = moved;
  }
  st.fv += (st.face - st.fv) * Math.min(1, dt * 10); if (Math.abs(st.fv - st.face) < 0.02) st.fv = st.face;
  return st;
}
export const dropMonsters = () => Q.mons.clear();
// world length of a straight move of (dgu, dgv) sub-tiles
export const worldLen = (dgu, dgv) => Math.hypot((dgu - dgv) * HW / SUB, (dgu + dgv) * HH / SUB);

// ---------------- the hero: walks the sub-tile grid from stand to stand, through the doors, around the props ----------------
// cellInfo(gx, gy) -> { room, solid } | null for global sub-tile cells. Returns the polyline of global sub coordinates (cell centres) or null.
export function heroPolyline(key, from, to, cellInfo) {
  if (Q.hpaths.has(key)) return Q.hpaths.get(key);
  const path = pathOnGrid(from, to, cellInfo);
  const poly = path ? path.map((c) => [c[0] + 0.5, c[1] + 0.5]) : null;
  if (Q.hpaths.size > 120) Q.hpaths.clear();
  Q.hpaths.set(key, poly); return poly;
}
// the point at fraction k (0..1) of a polyline's length (world length), with the unit heading in sub coordinates
export function alongPolyline(poly, k) {
  let L = 0; const segs = [];
  for (let i = 1; i < poly.length; i++) { const l = worldLen(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]); segs.push(l); L += l; }
  let d = clamp(k, 0, 1) * L, i = 0; while (i < segs.length - 1 && d > segs[i]) { d -= segs[i]; i++; }
  const a = poly[i], b = poly[i + 1] || poly[i], f = segs[i] ? clamp(d / segs[i], 0, 1) : 0;
  return { gu: a[0] + (b[0] - a[0]) * f, gv: a[1] + (b[1] - a[1]) * f, du: b[0] - a[0], dv: b[1] - a[1], length: L };
}
export { propAt };
