// Living things: pigeons that peck, waddle, preen and flush into the air, butterflies around the flower beds, and flocks of birds crossing the sky.
// Everything is a handful of tiny articulated parts baked into ONE dynamic vertex buffer per mesh (CPU skinned each frame, ~2000 vertices).
import { THREE, flatMat, paint, nonIndexed, rng } from './kit.js';
import { xf, paintSolid, col } from './flora_common.js';

const TAU = Math.PI * 2;
function tri(pts, colors) { // pts = [[x,y,z]*3], colors = 3 hex strings (or 1)
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
  const cs = colors.length === 1 ? [colors[0], colors[0], colors[0]] : colors; const a = []; cs.forEach((c) => { const k = col(c); a.push(k.r, k.g, k.b); });
  g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3)); return g;
}
function quad(p, colors) { const a = tri([p[0], p[1], p[2]], [colors[0], colors[1], colors[2]]), b = tri([p[0], p[2], p[3]], [colors[0], colors[2], colors[3]]); return [a, b]; }
function plain(geo) { const g = geo.index ? geo.toNonIndexed() : geo; if (g.attributes.uv) g.deleteAttribute('uv'); if (g.attributes.normal) g.deleteAttribute('normal'); return g; }
function mergeRaw(list) { // merge non indexed geometries that only have position + color
  let n = 0; list.forEach((g) => { n += g.attributes.position.count; }); const p = new Float32Array(n * 3), c = new Float32Array(n * 3); let o = 0, ranges = [];
  list.forEach((g) => { p.set(g.attributes.position.array, o * 3); c.set(g.attributes.color.array, o * 3); ranges.push({ start: o, count: g.attributes.position.count }); o += g.attributes.position.count; });
  return { p, c, n, ranges };
}

// ---------- pigeon ----------
function pigeonParts(r, tone) {
  const body = mergeRaw([plain(paintSolid(xf(new THREE.IcosahedronGeometry(0.115, 0), { y: 0, sx: 1.05, sy: 0.88, sz: 1.5 }), tone.belly, tone.back, r, 0.25))]);
  const chest = mergeRaw([plain(paintSolid(xf(new THREE.IcosahedronGeometry(0.075, 0), { y: 0.0, z: 0, sx: 1, sy: 1.1, sz: 1.0 }), '#5fb0a0', '#b08ad0', r, 0.1))]);
  const headG = [plain(paintSolid(xf(new THREE.IcosahedronGeometry(0.055, 0), { y: 0.055, z: 0.03 }), tone.head, tone.back, r, 0.1))];
  headG.push(tri([[-0.022, 0.065, 0.085], [0.022, 0.065, 0.085], [0, 0.055, 0.16]], ['#c9b090', '#c9b090', '#f2dcbc']), tri([[-0.022, 0.065, 0.085], [0, 0.045, 0.085], [0.022, 0.065, 0.085]], ['#8a7a6a']));
  headG.push(tri([[0.045, 0.085, 0.045], [0.06, 0.075, 0.075], [0.05, 0.065, 0.045]], ['#e8782a']), tri([[-0.045, 0.085, 0.045], [-0.05, 0.065, 0.045], [-0.06, 0.075, 0.075]], ['#e8782a'])); // eyes
  const head = mergeRaw(headG);
  const tail = mergeRaw(quad([[-0.04, 0, 0], [0.04, 0, 0], [0.055, 0, -0.13], [-0.055, 0, -0.13]], [tone.back, tone.back, '#5f5a86', '#5f5a86']));
  const wing = (s) => mergeRaw([tri([[0, 0, 0.07], [s * 0.36, 0, 0.0], [s * 0.1, 0, -0.12]], [tone.back, '#7a76a6', tone.back]), tri([[s * 0.1, 0, -0.12], [s * 0.36, 0, 0.0], [s * 0.27, 0, -0.17]], [tone.back, '#7a76a6', '#5a5580']), tri([[0, 0, 0.07], [s * 0.1, 0, -0.12], [0, 0, -0.12]], [tone.back, tone.back, tone.back])]);
  const leg = (s) => mergeRaw([tri([[s * 0.04, 0, 0], [s * 0.04 + 0.014, 0, 0], [s * 0.04, -0.105, 0.01]], ['#d9728a'])].concat([tri([[s * 0.04, -0.105, 0.01], [s * 0.04 + 0.022, -0.105, 0.01], [s * 0.04 + 0.011, -0.105, 0.07]], ['#d9728a'])]));
  return { body, chest, head, tail, wL: wing(1), wR: wing(-1), lL: leg(1), lR: leg(-1) };
}
const TONES = [
  { back: '#a6a4cc', belly: '#d8d2e6', head: '#8d8bb8' },
  { back: '#b3a9bd', belly: '#e6dae0', head: '#9a93ae' },
  { back: '#8d8cb8', belly: '#c4bddb', head: '#7a79a6' },
  { back: '#d2c4cc', belly: '#f2e6e8', head: '#b9aab8' }, // pale one
];

class Pigeon {
  constructor(rig, home, R, free) { this.R = R; this.free = free; this.home = home; this.x = home.x; this.z = home.z; this.y = 0; this.yaw = R() * TAU; this.mode = 'peck'; this.t = R() * 2; this.dur = 1 + R() * 2; this.ph = R() * 10; this.fromx = 0; this.fromz = 0; this.tox = 0; this.toz = 0; this.fT = 0; this.fD = 1; this.H = 1; this.s = 1.15 + R() * 0.3; this.peckAmt = 0; this.head = 0; this.pitch = 0; this.flap = 0; this.roll = 0; this.world = new THREE.Matrix4(); this.pose = []; for (let i = 0; i < 8; i++) this.pose.push(new THREE.Matrix4()); this.idle = 6 + R() * 25; this.look = 0; }
  pickWalk() { for (let i = 0; i < 6; i++) { const a = this.R() * TAU, d = 0.5 + this.R() * 1.6, x = this.x + Math.cos(a) * d, z = this.z + Math.sin(a) * d; if (this.free(x, z) && Math.hypot(x - this.home.x, z - this.home.z) < 4.5) { this.tox = x; this.toz = z; return true; } } return false; }
  fly(tx, tz, long) { this.mode = 'fly'; this.fromx = this.x; this.fromz = this.z; this.tox = tx; this.toz = tz; const d = Math.hypot(tx - this.x, tz - this.z); this.fD = 0.8 + d * 0.2; this.fT = 0; this.H = (long ? 2.4 : 1.0) + d * 0.22; this.yaw0 = this.yaw; }
  landSpot(px, pz, minDist) { for (let i = 0; i < 12; i++) { const a = this.R() * TAU, d = 3 + this.R() * 6, x = this.home.x + Math.cos(a) * d * 0.7, z = this.home.z + Math.sin(a) * d * 0.7; if (this.free(x, z) && (px === undefined || Math.hypot(x - px, z - pz) > minDist)) return [x, z]; } return [this.home.x, this.home.z]; }
  update(dt, t, pl) {
    const R = this.R; this.t += dt; this.ph += dt;
    if (pl && this.mode !== 'fly' && Math.hypot(pl.x - this.x, pl.z - this.z) < 2.0) { const [tx, tz] = this.landSpot(pl.x, pl.z, 4.5); this.fly(tx, tz, true); this.delay = R() * 0.15; }
    if (this.mode === 'peck' || this.mode === 'look') {
      this.peckAmt = this.mode === 'peck' ? Math.max(0, Math.sin(this.ph * 7.5)) ** 3 : 0; this.look = this.mode === 'look' ? Math.sin(this.ph * 1.6) * 0.9 : 0;
      this.walkP = 0; if (this.t > this.dur) { this.t = 0; this.dur = 1 + R() * 3; const k = R(); if (k < 0.45 && this.pickWalk()) this.mode = 'walk'; else if (k < 0.65) this.mode = 'look'; else this.mode = 'peck'; this.idle -= this.dur; if (this.idle < 0) { this.idle = 15 + R() * 40; const [tx, tz] = this.landSpot(pl && pl.x, pl && pl.z, 3); this.fly(tx, tz, false); } }
    } else if (this.mode === 'walk') {
      const dx = this.tox - this.x, dz = this.toz - this.z, d = Math.hypot(dx, dz), want = Math.atan2(dx, dz); let da = want - this.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); this.yaw += da * Math.min(1, dt * 7);
      const sp = Math.abs(da) < 0.8 ? 0.55 : 0.05; this.x += Math.sin(this.yaw) * sp * dt; this.z += Math.cos(this.yaw) * sp * dt; this.walkP = (this.walkP || 0) + dt * sp * 16; this.peckAmt = 0;
      if (d < 0.1 || this.t > 6) { this.mode = 'peck'; this.t = 0; this.dur = 1 + R() * 2; }
    } else if (this.mode === 'fly') {
      if (this.delay > 0) { this.delay -= dt; return this.posePose(t); }
      this.fT += dt; const u = Math.min(1, this.fT / this.fD), e = u * u * (3 - 2 * u);
      const nx = this.fromx + (this.tox - this.fromx) * e, nz = this.fromz + (this.toz - this.fromz) * e; const dx = nx - this.x, dz = nz - this.z;
      if (Math.hypot(dx, dz) > 1e-4) { const want = Math.atan2(dx, dz); let da = want - this.yaw; da = Math.atan2(Math.sin(da), Math.cos(da)); this.yaw += da * Math.min(1, dt * 9); }
      const oy = this.y; this.x = nx; this.z = nz; this.y = this.H * Math.sin(Math.PI * Math.pow(u, 0.85)); this.pitch = -Math.atan2(this.y - oy, Math.max(0.001, Math.hypot(dx, dz))) * 0.6; this.roll = 0.0;
      if (u >= 1) { this.y = 0; this.mode = 'peck'; this.t = 0; this.dur = 0.6 + R(); this.pitch = 0; this.bounce = 0.35; this.walkP = 0; }
    }
    this.posePose(t);
  }
  posePose(t) {
    const P = this.pose, s = this.s, fly = this.mode === 'fly', walk = this.mode === 'walk';
    const bob = walk ? Math.abs(Math.sin(this.walkP * 1.0)) * 0.012 : 0, roll = walk ? Math.sin(this.walkP) * 0.1 : 0;
    const pitchBody = fly ? this.pitch : this.peckAmt * 0.55;
    const base = new THREE.Matrix4().compose(new THREE.Vector3(this.x, this.y + GH(this.x, this.z) + (fly ? 0.18 : 0.0), this.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.yaw, 0, 'YXZ')), new THREE.Vector3(s, s, s)); this.world.copy(base);
    const T = (x, y, z, rx, ry, rz) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
    const bodyY = 0.15 + bob, bodyM = T(0, bodyY, 0, pitchBody + (walk ? -0.05 : 0), 0, roll);
    // body parts hang off the body matrix; legs stay near the ground
    P[0].copy(bodyM);
    P[1].copy(bodyM).multiply(T(0, 0.03, 0.1, 0, 0, 0));
    const headFwd = walk ? Math.sin(this.walkP * 2) * 0.02 : 0, headDown = fly ? -0.1 : this.peckAmt * 1.15;
    P[2].copy(bodyM).multiply(T(0, 0.07, 0.12 + headFwd, headDown, this.look, this.look * 0.3));
    P[3].copy(bodyM).multiply(T(0, 0.02, -0.15, fly ? -0.25 : 0.25 + this.peckAmt * 0.2, 0, 0));
    let wa = 0, fold = 1;
    if (fly) { const ff = this.fT < 0.12 ? 0.2 : 1; wa = Math.sin(t * 30 + this.ph) * 1.0 * ff; fold = 0; }
    const wing = (s2) => { const m = fly ? T(s2 * 0.08, 0.07, 0.0, 0, 0, s2 * (wa + 0.2)) : T(s2 * 0.02, 0.105, 0.03, 0, 0, -s2 * 1.05); if (!fly) m.multiply(new THREE.Matrix4().makeScale(0.48, 1, 0.9)); return bodyM.clone().multiply(m); };
    P[4].copy(wing(1)); P[5].copy(wing(-1));
    const sw = walk ? Math.sin(this.walkP) * 0.7 : 0;
    const legBase = (s2, sg) => T(0, bodyY - 0.04, 0.0, fly ? 0.9 : sg * sw, 0, 0);
    P[6].copy(legBase(1, 1)); P[7].copy(legBase(-1, -1));
  }
}

// ---------- butterfly ----------
function butterflyParts(r, c1, c2) {
  const wing = (s) => mergeRaw(quad([[0, 0, 0.02], [s * 0.1, 0, 0.07], [s * 0.12, 0, -0.04], [0, 0, -0.02]], [c1, c2, c2, c1]).concat(quad([[0, 0, -0.01], [s * 0.09, 0, -0.02], [s * 0.06, 0, -0.1], [0, 0, -0.04]], [c1, c2, c1, c1])));
  const body = mergeRaw([tri([[0, 0, 0.05], [0.012, 0, -0.05], [-0.012, 0, -0.05]], ['#3b2d4a']), tri([[0, 0.01, 0.05], [-0.012, 0, -0.05], [0.012, 0, -0.05]], ['#4a3a5c'])]);
  return { body, wL: wing(1), wR: wing(-1) };
}
const BCOLS = [['#ffd23f', '#ff9a30'], ['#ff8fc0', '#fff0f4'], ['#8a63ff', '#d6c4ff'], ['#ffb347', '#ff6a3a'], ['#fff0d8', '#f7c0a0']];

// ---------- bird in flight (distant, silhouetted) ----------
function birdParts(r) {
  const c = '#3b2f5c', c2 = '#5a4a7c';
  const body = mergeRaw([tri([[0, 0, 0.14], [0.04, 0, -0.1], [-0.04, 0, -0.1]], [c2, c, c]), tri([[0, 0.03, 0.04], [-0.04, 0, -0.1], [0.04, 0, -0.1]], [c, c, c]), tri([[0, 0, -0.1], [0.05, 0, -0.24], [-0.05, 0, -0.24]], [c, c, c])]);
  const wing = (s) => mergeRaw(quad([[0, 0, 0.07], [s * 0.4, 0, 0.0], [s * 0.38, 0, -0.1], [0, 0, -0.1]], [c2, c, c, c]));
  return { body, wL: wing(1), wR: wing(-1) };
}

let GH = () => 0;
export function buildLife(ctx, spots, free, flowerCenters, gh) {
  if (gh) GH = gh;
  const R = rng(4242), group = new THREE.Group();
  const rigData = (creatures) => { // creatures: array of {parts:[{p,c,n,ranges}]}  -> single buffer
    let nv = 0; creatures.forEach((cr) => cr.parts.forEach((pt) => { nv += pt.n; }));
    const pos = new Float32Array(nv * 3), col2 = new Float32Array(nv * 3), base = new Float32Array(nv * 3); let o = 0;
    creatures.forEach((cr) => { cr.ranges = []; cr.parts.forEach((pt) => { base.set(pt.p, o * 3); col2.set(pt.c, o * 3); cr.ranges.push({ start: o, count: pt.n }); o += pt.n; }); });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); geo.setAttribute('color', new THREE.BufferAttribute(col2, 3));
    return { geo, pos, base };
  };
  const skin = (rig, cr, i) => { // write world*pose*base into pos for creature cr
    const w = cr.world, e = new THREE.Matrix4(); const pos = rig.pos, base = rig.base;
    for (let j = 0; j < cr.ranges.length; j++) {
      e.multiplyMatrices(w, cr.pose[j]); const m = e.elements, a = cr.ranges[j];
      for (let v = a.start; v < a.start + a.count; v++) { const x = base[v * 3], y = base[v * 3 + 1], z = base[v * 3 + 2]; pos[v * 3] = m[0] * x + m[4] * y + m[8] * z + m[12]; pos[v * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; pos[v * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]; }
    }
  };
  const ord = ['body', 'chest', 'head', 'tail', 'wL', 'wR', 'lL', 'lR'];

  // pigeons: small flocks at the given homes
  const pigeons = [];
  for (const h of spots.pigeonHomes) for (let i = 0; i < h.n; i++) {
    const parts = pigeonParts(R, R.pick(TONES)); const cr = new Pigeon(null, { x: h.x + R.range(-1.2, 1.2), z: h.z + R.range(-1.2, 1.2) }, R, free); cr.x = cr.home.x; cr.z = cr.home.z; cr.parts = ord.map((k) => parts[k]); pigeons.push(cr);
  }
  const pRig = rigData(pigeons); pigeons.forEach((p) => p.update(0.01, 0, null)); pigeons.forEach((p) => skin(pRig, p));
  const pMat = flatMat({ side: THREE.DoubleSide }); const pMesh = new THREE.Mesh(pRig.geo, pMat); pMesh.frustumCulled = false; pMesh.castShadow = true; pMesh.receiveShadow = false; pMesh.name = 'pigeons'; group.add(pMesh);

  // butterflies + sky birds share one non shadow-casting mesh
  const air = [];
  (flowerCenters || []).forEach((f, i) => { for (let k = 0; k < f.n; k++) { const c = R.pick(BCOLS); const parts = butterflyParts(R, c[0], c[1]); air.push({ kind: 'bf', c: f, ph: R() * 20, rr: R.range(1.3, 3.2), sp: R.range(0.5, 0.9), hy: R.range(0.5, 1.4), parts: [parts.body, parts.wL, parts.wR], world: new THREE.Matrix4(), pose: [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()], fl: R.range(18, 26) }); } });
  const nFlocks = [[5, 9.5, 0.2], [4, 13, 2.6]];
  nFlocks.forEach((fl, fi) => { const dir = fi === 0 ? 0.35 : 2.6; for (let k = 0; k < fl[0]; k++) { const parts = birdParts(R); air.push({ kind: 'bird', fi, ph: R() * 20, k, dir, alt: fl[1] + R.range(-1, 1.5), off: { x: (k - fl[0] / 2) * 2.6 + R.range(-0.8, 0.8), z: -Math.abs(k - fl[0] / 2) * 2.2 + R.range(-0.6, 0.6) }, parts: [parts.body, parts.wL, parts.wR], world: new THREE.Matrix4(), pose: [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()] }); } });
  const aRig = rigData(air); const aMat = flatMat({ side: THREE.DoubleSide }); const aMesh = new THREE.Mesh(aRig.geo, aMat); aMesh.frustumCulled = false; aMesh.castShadow = false; aMesh.receiveShadow = false; aMesh.name = 'air'; group.add(aMesh);

  const tv = new THREE.Vector3(), tq = new THREE.Quaternion(), te = new THREE.Euler(), ts = new THREE.Vector3(1, 1, 1), tm = new THREE.Matrix4();
  const comp = (m, x, y, z, rx, ry, rz, s) => { te.set(rx, ry, rz, 'YXZ'); tq.setFromEuler(te); tv.set(x, y, z); ts.setScalar(s || 1); return m.compose(tv, tq, ts); };
  const playerPos = () => { try { const p = window.__park && window.__park.player && window.__park.player.object; return p ? p.position : null; } catch (e) { return null; } };
  let flushCool = 0;
  function update(dt, t) {
    const pl = playerPos(); flushCool -= dt;
    // a flush spreads: when one pigeon is spooked, its neighbours within 2.5 m join in
    for (const p of pigeons) p.update(dt, t, pl);
    for (const p of pigeons) if (p.mode === 'fly' && p.fT < 0.05 && !p.spread) { p.spread = true; for (const q of pigeons) if (q !== p && q.mode !== 'fly' && Math.hypot(q.x - p.x, q.z - p.z) < 2.6) { const [tx, tz] = q.landSpot(pl && pl.x, pl && pl.z, 3); q.fly(tx, tz, true); q.delay = Math.random() * 0.25; } } else if (p.mode !== 'fly') p.spread = false;
    pigeons.forEach((p) => skin(pRig, p)); pRig.geo.attributes.position.needsUpdate = true;
    for (const a of air) {
      if (a.kind === 'bf') {
        const f = a.c, u = t * a.sp + a.ph, x = f.x + Math.cos(u) * a.rr + Math.sin(u * 2.3) * 0.6, z = f.z + Math.sin(u * 0.83) * a.rr * 0.8 + Math.cos(u * 1.9) * 0.5, y = GH(x, z) + a.hy + Math.sin(u * 1.7) * 0.35 + Math.sin(t * a.fl) * 0.03;
        const dx = -Math.sin(u) * a.rr - 0.0, dz = Math.cos(u * 0.83) * 0.83 * a.rr * 0.8; comp(a.world, x, y, z, 0.1, Math.atan2(dx, dz), Math.sin(u * 1.3) * 0.25, 1.7);
        const fl = Math.sin(t * a.fl + a.ph) * 1.0 + 0.15;
        a.pose[0].identity(); comp(a.pose[1], 0, 0, 0, 0, 0, fl); comp(a.pose[2], 0, 0, 0, 0, 0, -fl);
      } else {
        const sp = 4.6 + a.fi * 0.9, along = ((t * sp + a.fi * 50) % 170) - 85 + a.off.z, cd = Math.cos(a.dir), sd = Math.sin(a.dir), lx = a.off.x;
        comp(a.world, cd * along - sd * lx, a.alt + Math.sin(t * 0.8 + a.k) * 0.4, sd * along + cd * lx, 0, Math.atan2(cd, sd), Math.sin(t * 0.5 + a.k) * 0.15, 2.2);
        const glide = Math.sin(t * 0.35 + a.fi * 2 + a.ph * 0.0) > 0.55; const fl = glide ? 0.18 : Math.sin(t * 9 + a.k * 0.6) * 0.75;
        a.pose[0].identity(); comp(a.pose[1], 0, 0.03, 0, 0, 0, fl); comp(a.pose[2], 0, 0.03, 0, 0, 0, -fl);
      }
      skin(aRig, a);
    }
    aRig.geo.attributes.position.needsUpdate = true;
  }
  return { group, update, pigeons, count: { pigeons: pigeons.length, air: air.length } };
}
