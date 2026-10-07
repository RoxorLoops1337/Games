// CONTROLS module (Gameplay Engineer). Third-person camera rig for a PORTRAIT phone (3/4 view, pitch about 45 degrees, yaw 40, follow with critically damped smoothing,
// slight look-ahead), tap-to-move with grid A* over terrain.blocked(), a dynamic on-screen joystick, WASD/arrows, collision sliding against blocked(), walk/run blending.
// CONTRACT: createControls(ctx, { player (character), terrain, spots, dom }) -> { update(dt,t), moveTo(x,z), stop(), onTapWorld(x,z), setEnabled(b), camera rig is applied to ctx.camera }
// TEST HOOKS (window.__park.controls): teleportTo(x,z), tapWorld(x,z,{run}), setJoystick(dx,dz) (screen axes: dx right, dz DOWN, so (0,-1) walks "up" the screen),
//   advance(seconds) (runs the sim in fixed 1/30 steps, handy because headless GL is slow), skipIntro(), state(), showRoute(bool), interact(), release().
// EVENTS used on ctx.events: listens 'spot' {id} (starts the cinematic: lock, ease camera, face the spot, play a clip) and 'spotDone' (unlocks);
//   FLAT scene: reads terrain.camera {dist,pitch,yaw (deg),fov,minDist,maxDist,focusY,hWidth,margin}, wheel/pinch zoom within min/max, camera kept inside the full-height north/west walls,
//   extra circle colliders (terrain.anchors.lamps, terrain.colliders, ctx.flora.colliders or flora.trees), canopy fade from ctx.flora.canopies, tap a NPC (npc.tapRadius) => events 'npc' {id}.
//   hooks: zoomBy(f), setZoom(d), talkTo(id), camera() state.   emits 'stick' {active,ox,oy,kx,ky} (CSS px inside dom) and 'tap' {x,z} for the UI.
import { THREE } from './kit.js';
import { makeSparkles, updateSparkScale } from './spots.js';
import { createUI } from './ui3d.js';

const D2R = Math.PI / 180;
const CFG0 = { yaw: 40 * D2R, pitch: 45 * D2R, dist: 17, fovMin: 32, fovMax: 46, hWidth: 8.2, charFromBottom: 0.42, lookY: 0.9,
  walk: 3.2, run: 5.7, accel: 9, decel: 15, turn: 13, radius: 0.3, cell: 0.75, stickR: 58, dead: 0.12, tapMs: 380, tapPx: 11, introDur: 2.6 };
const CFG = Object.assign({}, CFG0);
const easeIO = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapPi = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

// ---------- grid A* (octile, 8-way, inflated obstacles, string pulling) ----------
function makeGrid(terrain, Bx) {
  const b = terrain.bounds || { minX: -17, maxX: 17, minZ: -27, maxZ: 27 }, cs = CFG.cell, nx = Math.ceil((b.maxX - b.minX) / cs), nz = Math.ceil((b.maxZ - b.minZ) / cs);
  const blk = new Uint8Array(nx * nz), B = Bx || ((x, z) => { try { return !!terrain.blocked(x, z); } catch (e) { return false; } }), ri = CFG.radius + 0.12;
  const cx = (i) => b.minX + (i + 0.5) * cs, cz = (j) => b.minZ + (j + 0.5) * cs;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x = cx(i), z = cz(j); let bl = x < b.minX + 0.6 || x > b.maxX - 0.6 || z < b.minZ + 0.6 || z > b.maxZ - 0.6; if (!bl) bl = B(x, z) || B(x + ri, z) || B(x - ri, z) || B(x, z + ri) || B(x, z - ri) || B(x + ri * 0.7, z + ri * 0.7) || B(x - ri * 0.7, z + ri * 0.7) || B(x + ri * 0.7, z - ri * 0.7) || B(x - ri * 0.7, z - ri * 0.7); blk[j * nx + i] = bl ? 1 : 0; }
  const toI = (x) => clamp(Math.floor((x - b.minX) / cs), 0, nx - 1), toJ = (z) => clamp(Math.floor((z - b.minZ) / cs), 0, nz - 1);
  const walk = (x, z) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && !blk[toJ(z) * nx + toI(x)];
  function nearestFree(x, z) { const i0 = toI(x), j0 = toJ(z); if (!blk[j0 * nx + i0]) return [i0, j0]; for (let r = 1; r < 14; r++) { let best = null, bd = 1e9; for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) { if (i < 0 || j < 0 || i >= nx || j >= nz || (Math.abs(i - i0) !== r && Math.abs(j - j0) !== r) || blk[j * nx + i]) continue; const d = (cx(i) - x) ** 2 + (cz(j) - z) ** 2; if (d < bd) { bd = d; best = [i, j]; } } if (best) return best; } return null; }
  function los(ax, az, bx, bz, skip) { const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / (cs * 0.25))); for (let k = 0; k <= n; k++) { const t = k / n; if (skip && t * d < skip) continue; if (!walk(ax + (bx - ax) * t, az + (bz - az) * t)) return false; } return true; }
  function find(sx, sz, tx, tz) {
    const s = nearestFree(sx, sz), e = nearestFree(tx, tz); if (!s || !e) return null; const N = nx * nz, g = new Float32Array(N).fill(1e9), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N), heap = [];
    const h = (i, j) => { const dx = Math.abs(i - e[0]), dz = Math.abs(j - e[1]); return (dx + dz) + (1.41421 - 2) * Math.min(dx, dz); };
    const push = (id, f) => { heap.push([f, id]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { let l = c * 2 + 1, r = l + 1, m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
    const si = s[1] * nx + s[0], ei = e[1] * nx + e[0]; g[si] = 0; push(si, h(s[0], s[1]));
    while (heap.length) { const [, id] = pop(); if (closed[id]) continue; closed[id] = 1; if (id === ei) break; const i = id % nx, j = (id / nx) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { if (!di && !dj) continue; const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue; const nid = nj * nx + ni; if (blk[nid] || closed[nid]) continue; if (di && dj && (blk[j * nx + ni] || blk[nj * nx + i])) continue; const ng = g[id] + (di && dj ? 1.41421 : 1); if (ng < g[nid]) { g[nid] = ng; from[nid] = id; push(nid, ng + h(ni, nj)); } } }
    if (!closed[ei]) return null; const cells = []; for (let id = ei; id >= 0; id = from[id]) cells.push([cx(id % nx), cz((id / nx) | 0)]); cells.reverse(); return cells;
  }
  return { b, nx, nz, cs, blk, walk, los, find, nearestFree, cx, cz };
}

export function createControls(ctx, o) {
  const THREE_ = THREE, cam = ctx.camera, canvas = ctx.canvas, p = o.player, terrain = o.terrain, spotsApi = o.spots, dom = o.dom || document.body, events = ctx.events;
  const pos = p.object.position, A = (terrain && terrain.anchors) || {}, st = A.start || { x: 0, z: 10, rot: Math.PI };
  const bounds = () => (terrain && terrain.bounds) || { minX: -17, maxX: 17, minZ: -27, maxZ: 27 };
  const Bk = (x, z) => { try { if (terrain.blocked(x, z)) return true; } catch (e) { /* ignore */ } for (let i = 0; i < circles.length; i++) { const c = circles[i], dx = x - c[0], dz = z - c[1]; if (dx * dx + dz * dz < c[2] * c[2]) return true; } return false; };
  Object.assign(CFG, CFG0); const TC = terrain && terrain.camera, IN = !!(terrain && terrain.interior), npcs = o.npcs || ctx.npcs || [];
  let fixedFov = 0, zoomable = false, zMin = 0, zMax = 0;
  if (TC) { if (TC.dist) CFG.dist = TC.dist; if (TC.pitch) CFG.pitch = TC.pitch * D2R; if (TC.yaw !== undefined) CFG.yaw = TC.yaw * D2R; if (TC.focusY !== undefined) CFG.lookY = TC.focusY; if (TC.fov) fixedFov = TC.fov; if (TC.minDist && TC.maxDist) { zoomable = true; zMin = TC.minDist; zMax = TC.maxDist; } }
  // extra circle colliders (lamps, trees) read through hooks, so terrain files stay untouched
  let circles = [], circleKey = 0;
  function gatherCircles() {
    const out = [], add = (x, z, r) => { if (isFinite(x) && isFinite(z) && r > 0) out.push([x, z, r]); }; const L = (terrain && terrain.anchors && terrain.anchors.lamps) || []; for (const l of L) add(l.x, l.z, 0.26);
    const f = ctx.flora; for (const t of (terrain && terrain.colliders) || []) add(t.x, t.z, t.r || 0.3); if (f) { if (f.colliders) for (const t of f.colliders) add(t.x, t.z, t.r || 0.4); else if (f.trees) for (const t of f.trees) add(t.x, t.z, t.r || 0.42 * (t.s || 1)); }
    circles = out; circleKey = out.length;
  }
  gatherCircles();
  const search = typeof location !== 'undefined' ? location.search : '';
  pos.set(st.x, 0, st.z); let heading = st.rot === undefined ? Math.PI : st.rot; p.object.rotation.y = heading;

  // ---------- state ----------
  const S = { enabled: true, locked: false, vel: { x: 0, z: 0 }, speed: 0, clip: '', clipSpeed: 0, path: null, pathI: 0, pathRun: false, target: null, stuck: 0, running: false,
    stick: { active: false, x: 0, y: 0, ox: 0, oy: 0, id: -1, sx: 0, sy: 0, t0: 0, drag: false, shown: false }, hook: { x: 0, y: 0 }, keys: {}, lastTap: { t: 0, x: 0, y: 0 }, spot: null, focus: 0, focusTarget: 0, focusZoom: 0.2, time: 0, showRoute: false };
  let grid = null, gridVer = 0, fpPrev = null, fpT = 0; const getGrid = () => grid || (gridVer++, grid = makeGrid(terrain, Bk));
  function fingerprint() { const b = bounds(); let h = 0; for (let x = b.minX + 0.7; x < b.maxX; x += 1.5) for (let z = b.minZ + 0.7; z < b.maxZ; z += 1.5) h = (h * 31 + (Bk(x, z) ? 1 : 0)) | 0; return (h * 31 + circleKey) | 0; }
  function watchTerrain(dt) { fpT -= dt; if (fpT > 0) return; fpT = 2; gatherCircles(); const h = fingerprint(); if (fpPrev !== null && h !== fpPrev) { grid = null; if (S.target) { const t = S.target; planPath(t.x, t.z, S.pathRun); } } fpPrev = h; }

  // ---------- camera rig ----------
  const C = { yaw: CFG.yaw, pitch: CFG.pitch, dist: CFG.dist, tx: pos.x, tz: pos.z, zd: CFG.dist, vx: 0, vz: 0, lx: 0, lz: 0, runK: 0, aspect: 0, w: 0, h: 0, fov: 38, intro: -1 };
  const lookAt = new THREE_.Vector3(), ray = new THREE_.Vector3(), camDir = new THREE_.Vector3();
  function softClamp(v, lo, hi) { return v < lo ? lo + (v - lo) * 0.3 : v > hi ? hi + (v - hi) * 0.3 : v; }
  function damp(cur, vel, target, smooth, dt) { const om = 2 / smooth, x = om * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x), ch = cur - target, tmp = (vel + om * ch) * dt; return [target + (ch + tmp) * e, (vel - om * tmp) * e]; }
  function sizeCam() {
    const w = canvas.clientWidth || 360, h = canvas.clientHeight || 640, asp = w / h; if (w === C.w && h === C.h && cam.aspect === C.aspect && C.fovSet === C.fov) return; C.w = w; C.h = h;
    const half = CFG.hWidth / 2 / (CFG.dist * asp); C.fov = clamp(2 * Math.atan(half) / D2R, CFG.fovMin, CFG.fovMax); if (fixedFov) C.fov = clamp(Math.max(fixedFov, 2 * Math.atan(((TC && TC.hWidth) || 7) / 2 / (CFG.dist * asp)) / D2R), fixedFov, 58); C.fovSet = C.fov; cam.fov = C.fov; cam.aspect = asp; cam.setViewOffset(w, h, 0, -(CFG.charFromBottom < 0.5 ? (0.5 - CFG.charFromBottom) : 0) * h, w, h); cam.updateProjectionMatrix(); C.aspect = cam.aspect;
  }
  function placeCamera(tx, tz, dist, pitch, yaw) { const cp = Math.cos(pitch), sp = Math.sin(pitch); lookAt.set(tx, CFG.lookY, tz); cam.position.set(tx + Math.sin(yaw) * cp * dist, CFG.lookY + sp * dist, tz + Math.cos(yaw) * cp * dist);
    if (IN) { const b = bounds(); cam.position.x = Math.max(cam.position.x, b.minX + 0.6); cam.position.z = Math.max(cam.position.z, b.minZ + 0.6); } // never behind the full-height north and west walls
    cam.lookAt(lookAt); cam.updateMatrixWorld(true); }
  function updateCamera(dt) {
    sizeCam(); const b = bounds();
    // look-ahead along velocity (1.5 u at run), damped
    const lt = { x: S.vel.x * 0.32, z: S.vel.z * 0.32 }, ll = Math.hypot(lt.x, lt.z); if (ll > 1.6) { lt.x *= 1.6 / ll; lt.z *= 1.6 / ll; }
    const k = 1 - Math.exp(-3 * dt); C.lx += (lt.x - C.lx) * k; C.lz += (lt.z - C.lz) * k;
    let wx = pos.x + C.lx, wz = pos.z + C.lz;
    if (S.spot && S.spot.camShift) { wx += (S.spot.camShift.x) * S.focus; wz += (S.spot.camShift.z) * S.focus; }
    if (IN) { const m = (TC && TC.margin !== undefined) ? TC.margin : 1.6; wx = softClamp(wx, b.minX + m, b.maxX - m); wz = softClamp(wz, b.minZ + m, b.maxZ - m * 0.6); } else { wx = softClamp(wx, b.minX + 3.2, b.maxX - 3.2); wz = softClamp(wz, b.minZ + 4.2, b.maxZ - 3.2); }
    S.focus += (S.focusTarget - S.focus) * (1 - Math.exp(-5.5 * dt)); const ef = easeIO(clamp(S.focus, 0, 1));
    const rk = clamp((S.speed - CFG.walk) / (CFG.run - CFG.walk), 0, 1); C.runK += (rk - C.runK) * (1 - Math.exp(-2.5 * dt));
    let dist = (zoomable ? C.zd : CFG.dist) * (1 - S.focusZoom * ef) + (IN ? 0.3 : 1.4) * C.runK, pitch = CFG.pitch + 0.05 * ef, yaw = C.yaw;
    if (C.intro >= 0) { // fly-in from the gate
      C.intro += dt; const u = clamp(C.intro / CFG.introDur, 0, 1), e = easeIO(u), g = A.gate || A.door || { x: 0, z: 26 };
      if (u >= 1) { C.intro = -1; C.tx = wx; C.tz = wz; C.vx = C.vz = 0; S.locked = S.spot ? true : false; } else {
        const fx = g.x, fz = IN ? g.z - 0.5 : g.z - 3, d0 = IN ? dist * 1.7 : 30, p0 = IN ? Math.max(0.25, pitch - 0.45) : 0.62; C.tx = fx + (wx - fx) * e; C.tz = fz + (wz - fz) * e; dist = d0 + (dist - d0) * e; pitch = p0 + (pitch - p0) * e; yaw = CFG.yaw + (1 - e) * (IN ? 0.35 : 0.55); C.yaw = CFG.yaw; placeCamera(C.tx, C.tz, dist, pitch, yaw); return; }
    }
    [C.tx, C.vx] = damp(C.tx, C.vx, wx, 0.2, dt); [C.tz, C.vz] = damp(C.tz, C.vz, wz, 0.2, dt);
    C.dist += (dist - C.dist) * (1 - Math.exp(-4 * dt)); canopyFade(dt); placeCamera(C.tx, C.tz, C.dist, pitch, yaw);
  }
  function snapCamera() { sizeCam(); C.tx = pos.x; C.tz = pos.z; C.vx = C.vz = 0; C.lx = C.lz = 0; C.dist = zoomable ? C.zd : CFG.dist; placeCamera(C.tx, C.tz, C.dist, CFG.pitch, C.yaw); }

  // ---------- canopy fade (flora is another module: only read ctx.flora.canopies / trees with a .mesh) ----------
  function canopyFade(dt) {
    const f = ctx.flora, list = f && (f.canopies || f.trees); if (!list || !list.length) return; const k = 1 - Math.exp(-8 * dt);
    for (const t of list) { const m = t.mesh || t.canopy; if (!m || !isFinite(t.x)) continue; const R = t.cr || (t.r ? t.r * 3 : 2.4), tgt = Math.hypot(pos.x - t.x, pos.z - t.z) < R ? 0.28 : 1; if (t._fade === undefined) t._fade = 1; if (t._fade === tgt) continue; t._fade += (tgt - t._fade) * k; if (Math.abs(t._fade - tgt) < 0.01) t._fade = tgt; setFade(m, t._fade); }
  }
  function setFade(m, v) { m.traverse((o) => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const mt of ms) { if (mt.userData._ft === undefined) mt.userData._ft = mt.transparent; if (mt.userData._fo === undefined) mt.userData._fo = mt.opacity; mt.transparent = v < 1 || mt.userData._ft; mt.opacity = mt.userData._fo * v; if (mt.userData._lt !== mt.transparent) { mt.userData._lt = mt.transparent; mt.needsUpdate = true; } } }); }

  // ---------- picking ----------
  function screenToGround(px, py) { // px,py in CSS px relative to the canvas; analytic ray vs the y=0 plane
    const r = canvas.getBoundingClientRect(), nx = (px / r.width) * 2 - 1, ny = -(py / r.height) * 2 + 1; ray.set(nx, ny, 0.5).unproject(cam); camDir.copy(ray).sub(cam.position); if (camDir.y > -1e-4) return null; const t = -cam.position.y / camDir.y; return { x: cam.position.x + camDir.x * t, z: cam.position.z + camDir.z * t };
  }
  function worldToScreen(x, y, z) { const r = canvas.getBoundingClientRect(); ray.set(x, y, z).project(cam); return { x: (ray.x * 0.5 + 0.5) * r.width, y: (-ray.y * 0.5 + 0.5) * r.height, behind: ray.z > 1 }; }

  // ---------- movement ----------
  function free(x, z) { const b = bounds(); if (x < b.minX + 0.5 || x > b.maxX - 0.5 || z < b.minZ + 0.5 || z > b.maxZ - 0.5) return false; const r = CFG.radius; return !Bk(x, z) && !Bk(x + r, z) && !Bk(x - r, z) && !Bk(x, z + r) && !Bk(x, z - r); }
  function stepMove(dx, dz) { const x = pos.x, z = pos.z; if (free(x + dx, z + dz) || !free(x, z)) { pos.x += dx; pos.z += dz; return; } if (dx && free(x + dx, z)) { pos.x += dx; S.vel.z *= 0.5; return; } if (dz && free(x, z + dz)) { pos.z += dz; S.vel.x *= 0.5; return; } S.vel.x *= 0.3; S.vel.z *= 0.3; }
  function inputVec() { // screen-space: x right, y down; magnitude 0..1
    let x = 0, y = 0; const k = S.keys; x += (k.right ? 1 : 0) - (k.left ? 1 : 0); y += (k.down ? 1 : 0) - (k.up ? 1 : 0); const kl = Math.hypot(x, y); if (kl > 1) { x /= kl; y /= kl; }
    const cands = [{ x, y }, { x: S.stick.active ? S.stick.x : 0, y: S.stick.active ? S.stick.y : 0 }, { x: S.hook.x, y: S.hook.y }]; let best = cands[0], bm = -1; for (const c of cands) { const m = Math.hypot(c.x, c.y); if (m > bm) { bm = m; best = c; } } return { x: best.x, y: best.y, mag: Math.min(1, Math.hypot(best.x, best.y)) };
  }
  function planPath(tx, tz, run) {
    const gr = getGrid(), b = bounds(); tx = clamp(tx, b.minX + 0.8, b.maxX - 0.8); tz = clamp(tz, b.minZ + 0.8, b.maxZ - 0.8);
    const cells = gr.find(pos.x, pos.z, tx, tz); if (!cells) return false; const end = gr.walk(tx, tz) ? [tx, tz] : cells[cells.length - 1]; const raw = [[pos.x, pos.z], ...cells]; if (gr.walk(tx, tz)) raw.push(end); else raw.push(end);
    const out = [raw[0]]; let i = 0; while (i < raw.length - 1) { let j = raw.length - 1; while (j > i + 1 && !gr.los(raw[i][0], raw[i][1], raw[j][0], raw[j][1], i === 0 && !gr.walk(raw[0][0], raw[0][1]) ? 0.9 : 0)) j--; out.push(raw[j]); i = j; }
    S.rawPath = raw; S.path = out; S.pathI = 1; S.pathRun = !!run; S.target = { x: end[0], z: end[1] }; S.stuck = 0; S.arrived = false; markerTap(end[0], end[1]); events.emit('tap', { x: end[0], z: end[1] }); return true;
  }
  function stop() { S.path = null; S.target = null; S.hook.x = S.hook.y = 0; }
  function onTapWorld(x, z, run) {
    if (C.intro >= 0) skipIntro(); if (!S.enabled || S.locked) return false;
    // tapping on a spot (its ring or its floating icon) walks to its centre
    if (spotsApi && spotsApi.spots) { let bs = null, bd = 1.7; for (const s of spotsApi.spots) { if (!s.placed && s.placed !== undefined) continue; const d = Math.hypot(x - s.x, z - s.z); if (d < bd) { bd = d; bs = s; } } if (bs) { x = bs.x; z = bs.z; } }
    return planPath(x, z, run);
  }
  function onTapScreen(px, py, run) {
    if (!S.locked && C.intro < 0) for (const n of npcs) { if (!n.tapRadius) continue; const np = n.object.position, q = worldToScreen(np.x, 1.0, np.z); if (!q.behind && Math.hypot(q.x - px, q.y - py) < 46) return talkTo(n.id); }
    if (spotsApi && spotsApi.spots) for (const s of spotsApi.spots) { if (s.placed === false) continue; const q = worldToScreen(s.x, s.iconY || 3.9, s.z); if (!q.behind && Math.hypot(q.x - px, q.y - py) < 38) return onTapWorld(s.x, s.z, run); }
    const g = screenToGround(px, py); if (g) return onTapWorld(g.x, g.z, run); return false;
  }
  function talkTo(id) {
    const n = npcs.find((x) => x.id === id); if (!n || S.locked || S.spot) return false; const np = n.object.position, d = Math.hypot(np.x - pos.x, np.z - pos.z);
    if (d < 2.4) { stop(); S.talk = null; heading = Math.atan2(np.x - pos.x, np.z - pos.z); p.object.rotation.y = heading; events.emit('npc', { id: n.id, scene: ctx.sceneName || 'park' }); return true; }
    const a = Math.atan2(pos.x - np.x, pos.z - np.z); let ok = false; for (const r of [1.3, 1.6, 2.0]) for (const da of [0, 0.7, -0.7, 1.4, -1.4]) { const tx = np.x + Math.sin(a + da) * r, tz = np.z + Math.cos(a + da) * r; if (free(tx, tz) && planPath(tx, tz, false)) { ok = true; break; } if (ok) break; }
    if (ok) S.talk = n.id; return ok;
  }
  function talkStep() { if (!S.talk || S.path || S.locked) return; const id = S.talk; S.talk = null; const n = npcs.find((x) => x.id === id); if (n && Math.hypot(n.object.position.x - pos.x, n.object.position.z - pos.z) < 2.8) talkTo(id); }
  function interact() { if (S.locked || !spotsApi) return false; const n = spotsApi.nearest(pos); if (!n) { for (const q of npcs) if (q.tapRadius && Math.hypot(q.object.position.x - pos.x, q.object.position.z - pos.z) < 1.9) return talkTo(q.id); } if (n) { spotsApi.activate(n.id); try { navigator.vibrate && navigator.vibrate(10); } catch (e) { /* ignore */ } return true; } return false; }
  function skipIntro() { if (C.intro >= 0) { C.intro = -1; S.locked = S.spot ? true : false; snapCamera(); } }

  function setClip(name, speed) { if (S.clip === name && (name === 'idle' || Math.abs(speed - S.clipSpeed) < 0.08)) return; S.clip = name; S.clipSpeed = speed; try { p.play(name, { speed }); } catch (e) { /* ignore */ } }
  function moveStep(dt) {
    let des = { x: 0, z: 0 }, dmax = 0, canMove = S.enabled && !S.locked && C.intro < 0; const cy = Math.cos(C.yaw), sy = Math.sin(C.yaw);
    if (canMove) {
      const inp = inputVec();
      if (inp.mag > CFG.dead) { // joystick / keys: camera-relative, analog speed
        const m = clamp((inp.mag - CFG.dead) / (1 - CFG.dead), 0, 1), run = m > 0.78 || S.keys.shift; let spd = run ? CFG.walk + (CFG.run - CFG.walk) * clamp((m - 0.7) / 0.25, 0, 1) : CFG.walk * (0.35 + 0.65 * clamp(m / 0.75, 0, 1)); if (S.keys.shift) spd = CFG.run;
        const wx = cy * inp.x + sy * inp.y, wz = -sy * inp.x + cy * inp.y, wl = Math.hypot(wx, wz) || 1; des.x = wx / wl * spd; des.z = wz / wl * spd; S.path = null; S.target = null;
      } else if (S.path) {
        const pt = S.path[S.pathI]; let dx = pt[0] - pos.x, dz = pt[1] - pos.z, d = Math.hypot(dx, dz); const last = S.pathI === S.path.length - 1;
        if (d < (last ? 0.12 : 0.32)) { if (last) { S.path = null; S.target = null; S.arrived = true; } else S.pathI++; }
        else { const vmax = S.pathRun ? CFG.run : CFG.walk; let remain = d; for (let i = S.pathI; i < S.path.length - 1; i++) remain += Math.hypot(S.path[i + 1][0] - S.path[i][0], S.path[i + 1][1] - S.path[i][1]); const spd = Math.min(vmax, 0.55 + remain * 3.2); des.x = dx / d * spd; des.z = dz / d * spd; dmax = spd; }
      }
    }
    const hasDes = Math.hypot(des.x, des.z) > 0.01, k = 1 - Math.exp(-(hasDes ? CFG.accel : CFG.decel) * dt); S.vel.x += (des.x - S.vel.x) * k; S.vel.z += (des.z - S.vel.z) * k;
    if (!hasDes && Math.hypot(S.vel.x, S.vel.z) < 0.05) S.vel.x = S.vel.z = 0;
    const px = pos.x, pz = pos.z; stepMove(S.vel.x * dt, S.vel.z * dt); const moved = Math.hypot(pos.x - px, pos.z - pz) / Math.max(dt, 1e-4); S.speed += (moved - S.speed) * (1 - Math.exp(-14 * dt));
    if (S.path && hasDes) { S.stuck = moved < 0.25 * dmax ? S.stuck + dt : 0; if (S.stuck > 0.7) { const t = S.target; stop(); if (t) planPath(t.x, t.z, S.pathRun); S.stuck = 0; } }
    if (S.speed > 0.2) { const th = Math.atan2(S.vel.x, S.vel.z); if (Math.hypot(S.vel.x, S.vel.z) > 0.3) heading += wrapPi(th - heading) * (1 - Math.exp(-CFG.turn * dt)); }
    pos.y = terrain && terrain.heightAt ? terrain.heightAt(pos.x, pos.z) || 0 : 0; p.object.rotation.y = heading;
    // animation: walk/run with hysteresis, real speed passed so feet do not slide
    if (!S.spot) { if (S.speed < 0.18) setClip('idle', 0); else { if (S.running ? S.speed < 4.1 : S.speed > 4.7) S.running = !S.running; setClip(S.running ? 'run' : 'walk', S.speed); } }
  }

  // ---------- spot cinematic ----------
  function startSpot(id) {
    if (S.spot || !spotsApi) return; const s = spotsApi.spots.find((x) => x.id === id); if (!s) return; stop(); S.vel.x = S.vel.z = 0; const cine = s.cine || {}; S.locked = true;
    let face = heading; if (cine.face === 'rot') face = s.rot || 0; else { face = Math.atan2(s.x - pos.x, s.z - pos.z); }
    const to = cine.snap && (cine.exact || free(s.x, s.z)) ? { x: s.x, z: s.z } : cine.snap ? (() => { const gr = getGrid(), c = gr.nearestFree(s.x, s.z); return c ? { x: gr.cx(c[0]), z: gr.cz(c[1]) } : { x: pos.x, z: pos.z }; })() : { x: pos.x, z: pos.z };
    S.spot = { id, s, t: 0, from: { x: pos.x, z: pos.z, h: heading }, to, face, clip: cine.clip || 'idle', played: false, camShift: { x: (s.x - to.x) * 0.25, z: (s.z - to.z) * 0.25 } };
    S.focusTarget = 1; S.focusZoom = cine.zoom === undefined ? 0.2 : cine.zoom; S.speed = 0; setClip('idle', 0);
  }
  function endSpot() { if (!S.spot) return; if (!free(pos.x, pos.z)) { const gr = getGrid(), cc = gr.nearestFree(pos.x, pos.z); if (cc) { pos.x = gr.cx(cc[0]); pos.z = gr.cz(cc[1]); } } S.spot = null; S.focusTarget = 0; S.locked = C.intro >= 0; S.clip = ''; setClip('idle', 0); }
  function spotStep(dt) { const sp = S.spot; if (!sp) return; sp.t += dt; const u = easeIO(clamp(sp.t / 0.6, 0, 1)); pos.x = sp.from.x + (sp.to.x - sp.from.x) * u; pos.z = sp.from.z + (sp.to.z - sp.from.z) * u; heading = sp.from.h + wrapPi(sp.face - sp.from.h) * u; p.object.rotation.y = heading; if (!sp.played && sp.t > 0.35) { sp.played = true; S.clip = sp.clip; try { p.play(sp.clip, { speed: 1, bpm: 100 }); } catch (e) { /* ignore */ } } }
  events.on('spot', (e) => startSpot(e && e.id)); events.on('spotDone', () => endSpot());

  // ---------- markers: destination ring, ripple, route dots ----------
  const mk = new THREE_.Group(); mk.visible = false; ctx.scene.add(mk); const addMat = (c) => new THREE_.MeshBasicMaterial({ color: new THREE_.Color(c).multiplyScalar(1.3), transparent: true, depthWrite: false, blending: THREE_.AdditiveBlending, toneMapped: false, fog: false });
  const mRing = new THREE_.Mesh(new THREE_.RingGeometry(0.36, 0.46, 28).rotateX(-Math.PI / 2), addMat('#ffe14d')), mDot = new THREE_.Mesh(new THREE_.CircleGeometry(0.15, 14).rotateX(-Math.PI / 2), addMat('#fff6e8')), mRip = new THREE_.Mesh(new THREE_.RingGeometry(0.4, 0.5, 28).rotateX(-Math.PI / 2), addMat('#ffe14d'));
  [mRing, mDot, mRip].forEach((m) => { m.position.y = 0.07; m.renderOrder = 5; mk.add(m); }); let ripT = 9, fade = 0;
  function markerTap(x, z) { mk.position.set(x, 0, z); mk.visible = true; ripT = 0; fade = 1; }
  const dots = makeSparkles(THREE_, 72, 0.9); ctx.scene.add(dots); dots.visible = false;
  let routeLine = null; const rdots = makeSparkles(THREE_, 200, 1.0); ctx.scene.add(rdots); rdots.visible = false;
  function updateMarkers(dt, t) {
    updateSparkScale(dots, ctx.renderer, cam);
    if (S.target && S.path) fade = Math.min(1, fade + dt * 6); else fade = Math.max(0, fade - dt * 4); mk.visible = fade > 0.01; if (!mk.visible) { ripT = 9; }
    if (mk.visible) { const pu = 1 + 0.12 * Math.sin(t * 8); mRing.scale.set(pu, 1, pu); mRing.material.opacity = 0.9 * fade; mDot.material.opacity = 0.9 * fade; ripT += dt; const u = clamp(ripT / 0.55, 0, 1); mRip.visible = u < 1; mRip.scale.setScalar(0.6 + u * 1.6); mRip.material.opacity = (1 - u) * 0.9 * fade; }
    // route dots every 0.85 u along the remaining smoothed path
    const pa = dots.geometry.attributes; let n = 0;
    if (S.path) { let px = pos.x, pz = pos.z, carry = (t * 0.9) % 0.85; for (let i = S.pathI; i < S.path.length && n < 72; i++) { let ex = S.path[i][0], ez = S.path[i][1], seg = Math.hypot(ex - px, ez - pz), d = carry; while (d < seg && n < 72) { const f = d / seg, x = px + (ex - px) * f, z = pz + (ez - pz) * f; pa.position.setXYZ(n, x, 0.1, z); pa.aColor.setXYZ(n, 1, 0.9, 0.5); pa.aSize.array[n] = 0.4; pa.aAlpha.array[n] = 1.0 * Math.min(1, Math.hypot(x - pos.x, z - pos.z) / 1.0); n++; d += 0.85; } carry = d - seg; px = ex; pz = ez; } }
    for (let i = n; i < 72; i++) pa.aAlpha.array[i] = 0; dots.visible = n > 0; pa.position.needsUpdate = pa.aColor.needsUpdate = pa.aSize.needsUpdate = pa.aAlpha.needsUpdate = true;
    if (routeLine) { routeLine.visible = S.showRoute && !!S.rawPath; rdots.visible = routeLine.visible; if (rdots.visible) updateSparkScale(rdots, ctx.renderer, cam); }
  }
  function showRoute(v) {
    S.showRoute = v !== false; if (!routeLine) { routeLine = new THREE_.Group(); ctx.scene.add(routeLine); }
    routeLine.clear(); if (!S.rawPath) return; { const pa = rdots.geometry.attributes; let n = 0; const polyDots = (pts, r, g, b, sz) => { for (let i = 0; i < pts.length - 1 && n < 200; i++) { const a = pts[i], c = pts[i + 1], L = Math.hypot(c[0] - a[0], c[1] - a[1]), k = Math.max(1, Math.round(L / 0.45)); for (let q = 0; q < k && n < 200; q++) { const t = q / k; pa.position.setXYZ(n, a[0] + (c[0] - a[0]) * t, 0.2, a[1] + (c[1] - a[1]) * t); pa.aColor.setXYZ(n, r, g, b); pa.aSize.array[n] = sz; pa.aAlpha.array[n] = 1; n++; } } }; polyDots(S.rawPath, 0.2, 0.9, 1, 0.3); polyDots(S.path || S.rawPath, 1, 0.25, 0.65, 0.5); for (let i = n; i < 200; i++) pa.aAlpha.array[i] = 0; pa.position.needsUpdate = pa.aColor.needsUpdate = pa.aSize.needsUpdate = pa.aAlpha.needsUpdate = true; rdots.visible = true; updateSparkScale(rdots, ctx.renderer, cam); } const mkl = (pts, c, y) => { const g = new THREE_.BufferGeometry().setFromPoints(pts.map((q) => new THREE_.Vector3(q[0], y, q[1]))); const l = new THREE_.Line(g, new THREE_.LineBasicMaterial({ color: c, depthTest: false, transparent: true })); l.renderOrder = 9; return l; };
    routeLine.add(mkl(S.rawPath, '#2ee6ff', 0.12), mkl(S.path || S.rawPath, '#ff3ea5', 0.16));
  }

  // ---------- input: dynamic joystick + tap-to-move + keyboard ----------
  const rectOf = () => canvas.getBoundingClientRect();
  function stickEmit() { const s = S.stick, r = rectOf(); events.emit('stick', { active: s.active && s.shown, ox: s.ox, oy: s.oy, kx: s.ox + s.x * CFG.stickR, ky: s.oy + s.y * CFG.stickR, w: r.width, h: r.height }); }
  function down(e) {
    if (pinch || S.stick.id !== -1 || (e.pointerType === 'mouse' && e.button !== 0)) return; if (C.intro >= 0) { skipIntro(); e.preventDefault(); return; } const r = rectOf(); S.stick.id = e.pointerId; S.stick.sx = e.clientX - r.left; S.stick.sy = e.clientY - r.top; S.stick.t0 = performance.now(); S.stick.drag = false; S.stick.shown = false; S.stick.ox = S.stick.sx; S.stick.oy = S.stick.sy; S.stick.x = S.stick.y = 0;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } e.preventDefault();
  }
  function move(e) {
    const s = S.stick; if (pinch || e.pointerId !== s.id) return; const r = rectOf(), x = e.clientX - r.left, y = e.clientY - r.top; const dx = x - s.ox, dy = y - s.oy;
    if (!s.drag && Math.hypot(x - s.sx, y - s.sy) > CFG.tapPx) { s.drag = true; s.active = true; s.shown = true; if (C.intro >= 0) skipIntro(); }
    if (s.drag) { const l = Math.hypot(dx, dy); if (l > CFG.stickR) { // the base follows the thumb a little so a long drag never feels stuck
        const ex = l - CFG.stickR; s.ox += dx / l * ex * 0.0; s.oy += dy / l * ex * 0.0; } const m = Math.min(1, l / CFG.stickR); s.x = l ? dx / l * m : 0; s.y = l ? dy / l * m : 0; stickEmit(); }
  }
  function up(e) {
    const s = S.stick; if (e.pointerId !== s.id) return; const r = rectOf(), x = e.clientX - r.left, y = e.clientY - r.top, now = performance.now();
    if (!s.drag && now - s.t0 < CFG.tapMs) { const lt = S.lastTap, dbl = now - lt.t < 320 && Math.hypot(x - lt.x, y - lt.y) < 46; S.lastTap = { t: now, x, y }; onTapScreen(x, y, dbl); }
    s.active = false; s.shown = false; s.id = -1; s.x = s.y = 0; s.drag = false; stickEmit(); try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }
  // wheel and two-finger pinch zoom (only when the scene gives minDist/maxDist)
  const ptrs = new Map(); let pinch = null; const zoomTo = (d) => { if (zoomable) C.zd = clamp(d, zMin, zMax); return C.zd; };
  canvas.addEventListener('wheel', (e) => { if (!zoomable) return; e.preventDefault(); zoomTo(C.zd * Math.exp(clamp(e.deltaY, -120, 120) * 0.0012)); }, { passive: false });
  const pd = () => { const a = [...ptrs.values()]; return a.length > 1 ? Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) : 0; };
  canvas.addEventListener('pointerdown', (e) => { ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (zoomable && ptrs.size === 2) { pinch = { d0: Math.max(20, pd()), z0: C.zd }; const s = S.stick; s.active = s.shown = false; s.drag = true; s.x = s.y = 0; stickEmit(); } }, true);
  canvas.addEventListener('pointermove', (e) => { if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pinch) zoomTo(pinch.z0 * pinch.d0 / Math.max(20, pd())); }, true);
  const pend = (e) => { ptrs.delete(e.pointerId); if (pinch && ptrs.size < 2) pinch = null; }; canvas.addEventListener('pointerup', pend, true); canvas.addEventListener('pointercancel', pend, true);
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ShiftLeft: 'shift', ShiftRight: 'shift' };
  window.addEventListener('keydown', (e) => { const k = KEYMAP[e.code]; if (k) { S.keys[k] = true; if (C.intro >= 0) skipIntro(); e.preventDefault(); } else if ((e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') && !e.repeat) { if (interact()) e.preventDefault(); } });
  window.addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) S.keys[k] = false; }); window.addEventListener('blur', () => { S.keys = {}; });

  // ---------- main update ----------
  let ui = { update() {}, toast() {} };
  const nointro = /nointro/.test(search) || (typeof window !== 'undefined' && window.__PARK_NOINTRO); if (!nointro) { C.intro = 0; S.locked = true; setClip('idle', 0); }
  snapCamera(); if (C.intro >= 0) updateCamera(0.0001);
  function update(dt, t) {
    dt = clamp(dt, 0, 0.05); S.time = t; watchTerrain(dt); // main.js can hand a negative dt on the very first frame
    if (S.spot) spotStep(dt); else { moveStep(dt); talkStep(); } updateCamera(dt); updateMarkers(dt, t); ui.update(dt, t);
  }
  function replayIntro() { stop(); S.vel.x = S.vel.z = 0; S.speed = 0; C.intro = 0; S.locked = true; setClip('idle', 0); updateCamera(0.0001); }
  function teleportTo(x, z) { stop(); S.vel.x = S.vel.z = 0; S.speed = 0; endSpot(); pos.set(x, 0, z); if (C.intro >= 0) { C.intro = -1; S.locked = false; } snapCamera(); }
  const api = { update, moveTo: (x, z, o2) => onTapWorld(x, z, o2 && o2.run), stop, onTapWorld, setEnabled(b) { S.enabled = !!b; if (!b) stop(); }, teleportTo, talkTo, zoomBy(f) { return +zoomTo(C.zd * f).toFixed(2); }, setZoom(d) { return +zoomTo(d).toFixed(2); }, tapWorld: (x, z, o2) => onTapWorld(x, z, o2 && o2.run),
    setJoystick(dx, dz) { S.hook.x = dx || 0; S.hook.y = dz || 0; }, advance(sec) { const n = Math.ceil(sec * 30), d = sec / n; for (let i = 0; i < n; i++) { S.time += d; update(d, S.time); try { p.update(d, S.time); } catch (e) { /* ignore */ } } }, skipIntro, replayIntro, interact, release() { events.emit('spotDone', { id: S.spot && S.spot.id }); },
    showRoute, worldToScreen, screenToGround, toast(m) { ui.toast && ui.toast(m); }, rebuildGrid() { grid = null; return getGrid(); }, get gridVersion() { getGrid(); return gridVer; }, get grid() { return getGrid(); },
    get locked() { return S.locked; }, get inSpot() { return S.spot ? S.spot.id : null; }, get yaw() { return C.yaw; }, get heading() { return heading; }, get speed() { return S.speed; }, get intro() { return C.intro >= 0; }, get target() { return S.target; }, get path() { return S.path; },
    state() { return { x: +pos.x.toFixed(2), z: +pos.z.toFixed(2), heading: +heading.toFixed(2), speed: +S.speed.toFixed(2), clip: S.clip, moving: !!S.path || S.speed > 0.2, arrived: !!S.arrived, locked: S.locked, spot: S.spot ? S.spot.id : null, intro: C.intro >= 0, camDist: +C.dist.toFixed(2), zoom: +C.zd.toFixed(2), fov: +C.fov.toFixed(1), talk: S.talk || null }; } };
  try { ui = createUI(ctx, api, { dom, spots: spotsApi, player: p, terrain }); } catch (e) { console.error('[park3d] ui failed: ' + (e && e.stack || e)); }
  return api;
}
