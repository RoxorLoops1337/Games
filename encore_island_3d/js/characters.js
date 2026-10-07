// Encore Island 3D — characters. Procedural chibi low-poly rigs (no textures, no per-frame allocation).
// API: makeJasmin(), makeRoxor(), makeCreature('kappa'|'oni'|'slime'), makeFan(seed)
//   -> { group, update(dt,t,st), attack(), die(), isDead(), get dead, setCarry(n) }
import * as THREE from 'three';
import { C } from './palette.js';

/* ------------------------------------------------------------------ helpers */
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const ease = (u) => u * u * (3 - 2 * u);
function rng(seed) {
  let s = (seed | 0) + 0x9e3779b9;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SKIN = 0xffd7bd;
const OUTLINE = 0.017;

// shared (never-tinted) materials
const inkMat = new THREE.MeshBasicMaterial({ color: C.ink, side: THREE.BackSide });
const eyeMat = new THREE.MeshBasicMaterial({ color: 0x2b1426 });
const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const mouthMat = new THREE.MeshBasicMaterial({ color: 0x5a1426 });
const tongueMat = new THREE.MeshBasicMaterial({ color: 0xff7f95 });
const BASIC = new Map();
const basic = (c) => { let m = BASIC.get(c); if (!m) { m = new THREE.MeshBasicMaterial({ color: c }); BASIC.set(c, m); } return m; };

// shared geometry cache
const GC = new Map();
const geo = (k, f) => { let g = GC.get(k); if (!g) { g = f(); GC.set(k, g); } return g; };
const ico = (d = 1) => geo('ico' + d, () => new THREE.IcosahedronGeometry(1, d));
const box = (w, h, d) => geo(`box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (rt, rb, h, seg = 8) => geo(`cyl${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1));
const hang = (rt, rb, h, seg = 6) => geo(`hang${rt},${rb},${h},${seg}`, () => { const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1); g.translate(0, -h / 2, 0); return g; });
const cone = (r, h, seg = 5) => geo(`cone${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg, 1));
const torus = (r, t, a = 5, b = 8) => geo(`tor${r},${t},${a},${b}`, () => new THREE.TorusGeometry(r, t, a, b));
const cap = (seg, rows, th) => geo(`cap${seg},${rows},${th}`, () => new THREE.SphereGeometry(1, seg, rows, 0, Math.PI * 2, 0, th));
const dome = () => geo('dome', () => new THREE.SphereGeometry(1, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2));

// Inverted-hull outline geometry: expand each vertex along its (position-welded, scale-aware) normal by e world-ish units.
const OC = new Map();
function outlineGeo(g, sx, sy, sz, e) {
  const key = `${g.uuid}|${sx.toFixed(3)},${sy.toFixed(3)},${sz.toFixed(3)}|${e}`;
  let o = OC.get(key);
  if (o) return o;
  const src = g.index ? g.toNonIndexed() : g;
  const p = src.attributes.position, n = p.count;
  const q = (v) => Math.round(v * 1000);
  const keys = new Array(n);
  for (let i = 0; i < n; i++) keys[i] = q(p.getX(i)) + ',' + q(p.getY(i)) + ',' + q(p.getZ(i));
  const acc = new Map();
  const fn = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    a.x *= sx; a.y *= sy; a.z *= sz; b.x *= sx; b.y *= sy; b.z *= sz; c.x *= sx; c.y *= sy; c.z *= sz;
    ab.subVectors(b, a); ac.subVectors(c, a); ab.cross(ac);
    const l = ab.length() || 1e-9;
    fn.push(ab.x / l, ab.y / l, ab.z / l);
    for (let k = 0; k < 3; k++) {
      let s = acc.get(keys[i + k]);
      if (!s) { s = [0, 0, 0]; acc.set(keys[i + k], s); }
      s[0] += ab.x; s[1] += ab.y; s[2] += ab.z;
    }
  }
  // normalise + find the smallest cosine to adjacent faces (so flat faces still get full thickness)
  const dir = new Map();
  for (const [k, s] of acc) { const l = Math.hypot(s[0], s[1], s[2]) || 1; dir.set(k, [s[0] / l, s[1] / l, s[2] / l, 1]); }
  for (let f = 0; f < n / 3; f++) {
    for (let k = 0; k < 3; k++) {
      const d = dir.get(keys[f * 3 + k]);
      const cs = d[0] * fn[f * 3] + d[1] * fn[f * 3 + 1] + d[2] * fn[f * 3 + 2];
      if (cs < d[3]) d[3] = cs;
    }
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const d = dir.get(keys[i]);
    const m = e / clamp(d[3], 0.5, 1);
    out[i * 3] = p.getX(i) + (d[0] * m) / sx;
    out[i * 3 + 1] = p.getY(i) + (d[1] * m) / sy;
    out[i * 3 + 2] = p.getZ(i) + (d[2] * m) / sz;
  }
  o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.BufferAttribute(out, 3));
  OC.set(key, o);
  return o;
}

// per-character material context (own materials so hurt-flash is per instance)
function makeCtx() {
  const map = new Map(), list = [];
  return {
    list,
    m(color, extra) {
      const k = color + (extra ? JSON.stringify(extra) : '');
      let mat = map.get(k);
      if (!mat) {
        mat = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.75, metalness: 0, emissive: 0xff2a4a, emissiveIntensity: 0, ...extra });
        map.set(k, mat); list.push(mat);
      }
      return mat;
    },
    setHurt(v) { for (const m of list) m.emissiveIntensity = v * 0.85; },
  };
}

// add a mesh (+ inked hull) to parent
function part(ctx, parent, g, color, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, o = {}) {
  const mat = o.mat || ctx.m(color, o.mo);
  const mesh = new THREE.Mesh(g, mat);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  if (o.rx || o.ry || o.rz) mesh.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
  if (o.q) mesh.quaternion.copy(o.q);
  mesh.castShadow = o.shadow !== false;
  if (o.ol !== false && !o.mat) {
    const e = typeof o.ol === 'number' ? o.ol : OUTLINE;
    mesh.add(new THREE.Mesh(outlineGeo(g, sx, sy, sz, e), inkMat));
  }
  parent.add(mesh);
  return mesh;
}
const flat = (g, mat, parent, x, y, z, sx, sy, sz, o = {}) => { // unlit/face bits: no outline, no shadow
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  if (o.ry || o.rz || o.rx) m.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
  parent.add(m); return m;
};
const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();
const aim = (x, y, z) => _q.clone().setFromUnitVectors(_up, _d.set(x, y, z).normalize());

/* ------------------------------------------------------------------ face */
// head dims d = {cy,rx,ry,rz,hs}; features positioned on the ellipsoid surface
function addFace(ctx, head, d, f = {}) {
  const { cy, rx, ry, rz, hs } = d;
  const sz = (x, y) => rz * Math.sqrt(Math.max(0.04, 1 - (x / rx) ** 2 - ((y - cy) / ry) ** 2));
  const ex = (f.ex ?? 0.128) * hs, ey = cy + (f.ey ?? -0.05) * hs, ew = (f.ew ?? 0.07) * hs, eh = (f.eh ?? 0.098) * hs;
  const lo = !!f.lo;
  const eyes = [];
  for (const sd of [-1, 1]) {
    const piv = new THREE.Group();
    piv.position.set(sd * ex, ey, sz(sd * ex, ey) - 0.014 * hs);
    piv.rotation.z = sd * (f.tilt || 0);
    head.add(piv);
    flat(ico(1), eyeMat, piv, 0, 0, 0, ew, eh, 0.04 * hs);
    if (!lo && f.iris !== null) flat(ico(0), basic(f.iris ?? 0x7a3f2c), piv, 0, -eh * 0.2, 0.024 * hs, ew * 0.8, eh * 0.7, 0.03 * hs);
    flat(ico(0), whiteMat, piv, ew * 0.32, eh * 0.4, 0.046 * hs, ew * 0.3, ew * 0.3, 0.012 * hs);
    if (!lo) flat(ico(0), whiteMat, piv, -ew * 0.38, -eh * 0.42, 0.04 * hs, ew * 0.16, ew * 0.16, 0.01 * hs);
    eyes.push(piv);
  }
  if (f.blush !== false) {
    const bm = basic(f.blushColor ?? 0xff8fb0);
    for (const sd of [-1, 1]) {
      const bx = sd * 0.205 * hs, by = cy - 0.115 * hs;
      const b = flat(ico(0), bm, head, bx, by, sz(bx, by) - 0.004 * hs, 0.055 * hs, 0.034 * hs, 0.01 * hs);
      b.rotation.y = sd * 0.8; b.rotation.x = 0.1;
    }
  }
  if (f.brow) {
    const bc = basic(f.brow);
    for (const sd of [-1, 1]) {
      const bx = sd * ex, by = ey + eh * 1.55;
      const b = flat(box(1, 1, 1), bc, head, bx, by, sz(bx, by) + 0.002 * hs, 0.075 * hs, 0.018 * hs, 0.018 * hs);
      b.rotation.z = sd * -(f.browTilt ?? 0);
    }
  }
  const my = cy + (f.my ?? -0.145) * hs;
  const mouth = new THREE.Group();
  mouth.position.set(0, my, sz(0, my) - 0.006 * hs);
  head.add(mouth);
  const mw = (f.mw ?? 0.04) * hs;
  flat(ico(0), mouthMat, mouth, 0, 0, 0, mw, 0.013 * hs, 0.02 * hs);
  if (!lo) flat(ico(0), tongueMat, mouth, 0, -0.006 * hs, 0.012 * hs, mw * 0.55, 0.01 * hs, 0.012 * hs);
  return { eyes, mouth, d };
}

/* ------------------------------------------------------------------ life / lifecycle */
function makeLife(ctx, atkDur = 0.5, dieDur = 0.9) {
  const L = { atkT: -1, dieT: -1, dead: false, hurt: 0, hurtApplied: 0, atkEnv: 0, dieU: 0 };
  L.attack = () => { if (L.dieT < 0 && !L.dead) L.atkT = 0; };
  L.die = () => { if (L.dieT < 0) L.dieT = 0; };
  L.tick = (dt, st) => {
    L.hurt = damp(L.hurt, clamp(st.hurt || 0, 0, 1), 28, dt);
    if (Math.abs(L.hurt - L.hurtApplied) > 0.004) { ctx.setHurt(L.hurt); L.hurtApplied = L.hurt; }
    if (L.atkT >= 0) {
      L.atkT += dt;
      const u = L.atkT / atkDur;
      if (u >= 1) { L.atkT = -1; L.atkEnv = 0; }
      else L.atkEnv = u < 0.3 ? ease(u / 0.3) : 1 - ease((u - 0.3) / 0.7);
    } else L.atkEnv = 0;
    if (L.dieT >= 0 && !L.dead) {
      L.dieT += dt;
      L.dieU = Math.min(1, L.dieT / dieDur);
      if (L.dieU >= 1) L.dead = true;
    }
  };
  return L;
}
// root squash/spin composed from hurt + attack pulse + death
function lifeXform(L, root, bx, by, bz, extraSY = 1, extraXZ = 1) {
  let sx = bx * extraXZ, sy = by * extraSY, sz = bz * extraXZ;
  const h = L.hurt;
  sx *= 1 + 0.1 * h; sz *= 1 + 0.1 * h; sy *= 1 - 0.13 * h;
  if (L.dieT >= 0) {
    const u = L.dieU, k = Math.pow(1 - u, 1.4), pop = Math.sin(Math.min(1, u * 1.6) * Math.PI);
    sx *= k * (1 + 0.35 * pop); sz *= k * (1 + 0.35 * pop); sy *= k * (1 - 0.35 * pop);
    root.rotation.y = u * u * 12;
    root.position.y += pop * 0.35;
  } else root.rotation.y = 0;
  root.scale.set(sx, sy, sz);
}

/* ------------------------------------------------------------------ kid (humanoid) builder */
function buildKid(ctx, o) {
  const hs = o.headS || 1, lo = !!o.lo;
  const fitG = new THREE.Group();
  const root = new THREE.Group();
  fitG.add(root);
  const HIP = 0.46;
  const R = { fitG, root, ctx, HIP, hs, lo, legs: [], arms: [] };
  // legs
  const legR = o.legR || 0.058;
  for (const sd of [-1, 1]) {
    const piv = new THREE.Group();
    piv.position.set(sd * 0.09, HIP, 0);
    root.add(piv);
    part(ctx, piv, hang(legR, legR * 0.9, 0.36, 6), o.legColor ?? SKIN, 0, 0, 0, 1, 1, 1, { ol: OUTLINE * 0.85 });
    if (o.cuff) part(ctx, piv, hang(legR * 1.15, legR * 1.15, 0.06, 6), o.cuff, 0, -0.3, 0, 1, 1, 1, { ol: 0.012 });
    part(ctx, piv, ico(0), o.shoes, 0, -0.385, 0.04, 0.092, 0.07, 0.14, { ol: lo ? false : 0.014 });
    if (o.sole && !lo) part(ctx, piv, box(0.14, 0.026, 0.25), o.sole, 0, -0.447, 0.03, 1, 1, 1, { ol: false });
    R.legs.push(piv);
  }
  const body = new THREE.Group();
  body.position.y = HIP;
  root.add(body);
  R.body = body;
  part(ctx, body, cyl(0.135, 0.15, 0.36, lo ? 6 : 8), o.shirt, 0, 0.17, 0, 1, 1, 0.9);
  if (o.pelvis) part(ctx, body, cyl(0.15, 0.14, 0.1, lo ? 6 : 8), o.pelvis, 0, -0.01, 0, 1, 1, 0.9, { ol: 0.012 });
  // head
  const head = new THREE.Group();
  head.position.y = 0.37;
  body.add(head);
  R.head = head;
  const ry = 0.33 * hs, rx = 0.36 * hs, rz = 0.34 * hs;
  const d = { cy: ry - 0.03, rx, ry, rz, hs };
  R.d = d;
  part(ctx, head, ico(lo ? 1 : 2), o.skin ?? SKIN, 0, d.cy, 0, rx, ry, rz, { ol: 0.02 });
  if (!lo) for (const sd of [-1, 1]) part(ctx, head, ico(0), o.skin ?? SKIN, sd * (rx - 0.005), d.cy - 0.02 * hs, 0, 0.045 * hs, 0.06 * hs, 0.05 * hs, { ol: 0.012 });
  R.face = addFace(ctx, head, d, { lo, iris: o.iris, brow: o.brow, browTilt: o.browTilt, ew: o.ew, eh: o.eh, ex: o.ex, ey: o.ey, tilt: o.tilt, mw: o.mw, blush: o.blush });
  // arms
  for (const sd of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(sd * 0.18, 0.3, 0);
    sh.rotation.order = 'YXZ';
    body.add(sh);
    const arm = { sh, el: null, hand: null, sd };
    if (lo) {
      part(ctx, sh, hang(0.05, 0.042, 0.24, 6), o.sleeve ?? o.shirt, 0, 0, 0, 1, 1, 1, { ol: 0.012 });
      arm.hand = part(ctx, sh, ico(0), o.skin ?? SKIN, 0, -0.255, 0, 0.066, 0.066, 0.066, { ol: false });
    } else {
      part(ctx, sh, hang(0.054, 0.048, 0.2, 6), o.sleeve ?? o.shirt, 0, 0, 0, 1, 1, 1, { ol: 0.013 });
      const el = new THREE.Group();
      el.position.y = -0.2;
      el.rotation.order = 'YXZ';
      sh.add(el);
      part(ctx, el, hang(0.045, 0.038, 0.19, 6), o.armColor ?? o.skin ?? SKIN, 0, 0, 0, 1, 1, 1, { ol: 0.012 });
      arm.el = el;
      arm.hand = part(ctx, el, ico(0), o.skin ?? SKIN, 0, -0.215, 0, 0.066, 0.066, 0.066, { ol: 0.013 });
    }
    R.arms.push(arm);
  }
  R.armL = R.arms[0]; R.armR = R.arms[1]; // armR is at +x
  return R;
}

function fit(R, H) {
  R.fitG.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(R.fitG);
  const h = b.max.y - b.min.y;
  const s = H / h;
  R.fitG.scale.setScalar(s);
  R.fitS = s;
  return s;
}

function newState(seed = 0) {
  return { sp: 0, ph: 0, blinkIn: 1.5 + seed * 0.37, blinkT: -1, sing: 0, off: seed * 1.7, carryW: 0, cheer: 0, rnd: rng(seed * 31 + 7) };
}

// base locomotion + idle + blink. Characters then override arms/head by weights.
function kidTick(R, S, dt, t, st) {
  const sp = (S.sp = damp(S.sp, clamp(st.speed || 0, 0, 1), 10, dt));
  const amp = Math.min(1, sp * 2.4);
  S.amp = amp;
  S.ph += dt * sp * 13;
  const ph = S.ph, s = Math.sin(ph), c = Math.cos(ph);
  const br = Math.sin(t * 2.4 + S.off);
  S.s = s; S.c = c;
  R.root.position.set(0, (Math.abs(c) - 1) * 0.055 * amp + 0.03 * amp + br * 0.004, 0);
  R.legs[0].rotation.x = s * 0.66 * amp;
  R.legs[1].rotation.x = -s * 0.66 * amp;
  R.legs[0].rotation.z = 0.03; R.legs[1].rotation.z = -0.03;
  R.body.position.x = c * 0.02 * amp;
  R.body.rotation.set(0.1 * amp + br * 0.012, s * 0.14 * amp, 0);
  R.body.scale.set(1 + br * 0.008, 1 + br * 0.014, 1 + br * 0.008);
  R.head.rotation.set(Math.sin(t * 1.3 + S.off) * 0.025 - 0.04 * amp, -s * 0.07 * amp, Math.sin(t * 0.9 + S.off) * 0.03);
  // arms: swing opposite to legs
  const aL = R.armL, aR = R.armR;
  aL.sh.rotation.set(s * 0.8 * amp, 0, -0.1 - 0.02 * br);
  aR.sh.rotation.set(-s * 0.8 * amp, 0, 0.1 + 0.02 * br);
  if (aL.el) { aL.el.rotation.set(-0.2 - 0.35 * amp * (0.5 + 0.5 * s), 0, 0); aR.el.rotation.set(-0.2 - 0.35 * amp * (0.5 - 0.5 * s), 0, 0); }
  // blink
  S.blinkIn -= dt;
  if (S.blinkIn <= 0 && S.blinkT < 0) { S.blinkT = 0; S.blinkIn = 2 + S.rnd() * 3.5; }
  let bl = 0;
  if (S.blinkT >= 0) { S.blinkT += dt; const u = S.blinkT / 0.15; if (u >= 1) S.blinkT = -1; else bl = 1 - Math.abs(u * 2 - 1); }
  S.blink = bl;
}
function blendArm(a, w, sx, sy, sz, ex = 0, ey = 0) {
  const r = a.sh.rotation;
  r.x = lerp(r.x, sx, w); r.y = lerp(r.y, sy, w); r.z = lerp(r.z, sz, w);
  if (a.el) { const e = a.el.rotation; e.x = lerp(e.x, ex, w); e.y = lerp(e.y, ey, w); }
}
function setBlink(face, bl, extra = 0) {
  const sy = Math.max(0.08, 1 - 0.92 * Math.max(bl, extra));
  face.eyes[0].scale.y = sy; face.eyes[1].scale.y = sy;
}
function setMouth(face, open, wide = 0) {
  face.mouth.scale.set(1 + wide * 0.4 - open * 0.15, 1 + open * 3.8, 1 + open * 0.6);
}

/* ------------------------------------------------------------------ JASMIN */
export function makeJasmin() {
  const ctx = makeCtx();
  const HAIR = 0x8a5030, HAIR2 = 0xa86a40, PINK = 0xff8fc0, HOT = 0xff4d8d, CREAM = 0xfff4e6;
  const R = buildKid(ctx, { shirt: PINK, sleeve: PINK, skin: SKIN, legColor: SKIN, shoes: CREAM, sole: 0xff9cc6, pelvis: PINK, iris: 0x7a3f2c, legR: 0.052, brow: 0x6a3a22, browTilt: 0.04 });
  const { head, body, d } = R;
  const { cy, rx, ry, rz } = d;
  const sz = (x, y) => rz * Math.sqrt(Math.max(0.04, 1 - (x / rx) ** 2 - ((y - cy) / ry) ** 2));
  // dress details
  part(ctx, body, cyl(0.15, 0.145, 0.05, 8), HOT, 0, 0.02, 0, 1, 1, 0.92, { ol: 0.012 });          // belt
  part(ctx, body, cyl(0.105, 0.125, 0.05, 8), CREAM, 0, 0.355, 0, 1, 1, 0.95, { ol: 0.012 });       // collar
  part(ctx, body, ico(0), HOT, 0, 0.3, 0.14, 0.05, 0.05, 0.03, { ol: 0.01 });                       // chest bow
  part(ctx, body, ico(0), HOT, -0.05, 0.3, 0.14, 0.04, 0.03, 0.025, { ol: 0.008 });
  part(ctx, body, ico(0), HOT, 0.05, 0.3, 0.14, 0.04, 0.03, 0.025, { ol: 0.008 });
  const skirt = new THREE.Group(); skirt.position.y = 0; body.add(skirt);
  part(ctx, skirt, cyl(0.15, 0.31, 0.22, 8), PINK, 0, -0.08, 0, 1, 1, 1);
  part(ctx, skirt, cyl(0.315, 0.322, 0.05, 8), CREAM, 0, -0.175, 0, 1, 1, 1, { ol: 0.012 });
  // socks
  for (const lg of R.legs) part(ctx, lg, hang(0.06, 0.056, 0.09, 6), CREAM, 0, -0.27, 0, 1, 1, 1, { ol: 0.012 });
  // ---- hair
  const hairParts = [];
  const capH = part(ctx, head, cap(10, 6, 1.62), HAIR, 0, cy + 0.015, -0.03, rx * 1.065, ry * 1.06, rz * 1.075, { rx: -0.42 });
  part(ctx, head, ico(1), HAIR, 0, cy - 0.04, -0.1, rx * 0.98, ry * 0.9, rz * 0.82);
  for (let i = 0; i < 6; i++) {
    const x = -0.24 + i * 0.096, y = cy + 0.215 - Math.abs(i - 2.5) * 0.012;
    const zz = sz(x, y - 0.1) + 0.012;
    part(ctx, head, cone(0.085, 0.2, 5), i % 2 ? HAIR2 : HAIR, x, y, zz, 1, 1, 0.8, { rx: Math.PI, rz: (i - 2.5) * 0.09, ol: 0.012 });
  }
  for (const sd of [-1, 1]) {
    part(ctx, head, cone(0.065, 0.27, 5), HAIR2, sd * 0.325, cy - 0.01, 0.02, 1, 1, 0.9, { rx: Math.PI, rz: sd * 0.12, ol: 0.012 });
  }
  // hair clip bow (hot pink)
  const clip = new THREE.Group(); clip.position.set(0.215, cy + 0.2, sz(0.215, cy + 0.2) - 0.02); clip.rotation.y = 0.65; head.add(clip);
  for (const sd of [-1, 1]) part(ctx, clip, cone(0.05, 0.11, 4), HOT, sd * 0.06, 0, 0, 1, 1, 0.5, { rz: -sd * Math.PI / 2, ol: 0.01 });
  part(ctx, clip, ico(0), 0xffd84d, 0, 0, 0.012, 0.03, 0.03, 0.03, { ol: 0.008 });
  // ponytail
  const tail = new THREE.Group(); tail.position.set(0, cy + 0.2, -0.3); head.add(tail);
  part(ctx, tail, torus(0.075, 0.034, 4, 6), HOT, 0, -0.02, 0, 1, 1, 1, { rx: Math.PI / 2, ol: 0.01 });
  const seg = (parent, sx, sy, len, col) => {
    part(ctx, parent, ico(0), col, 0, -len * 0.5, 0, sx, sy, sx);
  };
  seg(tail, 0.115, 0.19, 0.3, HAIR);
  const t2 = new THREE.Group(); t2.position.y = -0.27; tail.add(t2);
  seg(t2, 0.115, 0.19, 0.3, HAIR2);
  const t3 = new THREE.Group(); t3.position.y = -0.27; t2.add(t3);
  seg(t3, 0.085, 0.17, 0.3, HAIR);
  part(ctx, t3, cone(0.07, 0.17, 5), HAIR2, 0, -0.34, 0, 1, 1, 1, { rx: Math.PI, ol: 0.012 });
  // microphone (right hand, +x)
  const mic = new THREE.Group(); mic.position.y = -0.2; R.armR.el.add(mic);
  part(ctx, mic, hang(0.03, 0.022, 0.2, 6), 0x7a5cd8, 0, 0, 0, 1, 1, 1, { ol: 0.011 });
  part(ctx, mic, ico(0), 0xd8d8f0, 0, -0.25, 0, 0.064, 0.07, 0.064, { ol: 0.012 });
  part(ctx, mic, torus(0.062, 0.014, 3, 6), HOT, 0, -0.205, 0, 1, 1, 1, { rx: Math.PI / 2, ol: 0.008 });
  fit(R, 1.7);

  // music notes
  const noteG = new THREE.Group(); R.fitG.add(noteG);
  const noteCols = [0xffd84d, 0xff7eb6, 0x9af0b4, 0x8fe3f0];
  const notes = [];
  for (let i = 0; i < 4; i++) {
    const n = new THREE.Group();
    const m = basic(noteCols[i]);
    flat(ico(0), m, n, 0, 0, 0, 0.05, 0.04, 0.03);
    flat(box(1, 1, 1), m, n, 0.04, 0.09, 0, 0.012, 0.16, 0.012);
    const fl = flat(box(1, 1, 1), m, n, 0.075, 0.15, 0, 0.05, 0.02, 0.012); fl.rotation.z = -0.5;
    n.visible = false; noteG.add(n); notes.push({ n, on: false, wait: i * 0.2, life: 0, vx: 0, vy: 0, x: 0, y: 0, z: 0 });
  }

  const S = newState(1), L = makeLife(ctx, 0.55, 0.9);
  const self = {
    group: new THREE.Group(),
    update(dt, t, st) {
      if (L.dead) return;
      dt = Math.min(dt, 0.05); st = st || {};
      L.tick(dt, st);
      kidTick(R, S, dt, t, st);
      const amp = S.amp, ph = S.ph;
      const sg = (S.sing = damp(S.sing, st.singing ? 1 : 0, 9, dt));
      const beat = Math.sin(t * Math.PI * 4);        // 2 Hz
      const hit = Math.abs(Math.sin(t * Math.PI * 2)); // bounce on the beat
      const A = L.atkEnv;
      // singing pose
      blendArm(R.armR, sg, -0.95, -0.08, 0.1, -1.3);
      blendArm(R.armL, sg, -0.2 + beat * 0.15, 0.2, -1.0 + beat * 0.08, -0.35);
      R.head.rotation.x += sg * (-0.1 + beat * 0.05);
      R.head.rotation.z += sg * Math.sin(t * Math.PI * 2) * 0.07;
      R.root.position.y += sg * hit * 0.035;
      R.body.rotation.x += sg * -0.05;
      R.body.rotation.z = sg * Math.sin(t * Math.PI * 2) * 0.04;
      // attack = big sing-punch
      if (A > 0) {
        blendArm(R.armR, A, -1.6, 0, 0.05, -0.05);
        blendArm(R.armL, A, 0.6, 0, -0.5, -0.4);
        R.body.rotation.x += A * 0.28;
        R.head.rotation.x += A * -0.12;
        R.root.position.z = A * 0.28;
      } else R.root.position.z = 0;
      // mouth + eyes
      const vowel = 0.72 + 0.28 * Math.sin(t * 3.1);
      const open = Math.max(sg * (0.5 + 0.5 * beat) * vowel, A * 0.9);
      setMouth(R.face, open * 0.75, A * 0.5);
      setBlink(R.face, S.blink, sg * 0.55 * (0.5 + 0.5 * Math.sin(t * 0.8)) * (sg > 0.7 ? 1 : 0) + A * 0.0);
      // skirt + ponytail secondary motion
      skirt.scale.set(1 + 0.06 * amp * Math.abs(S.s) + sg * hit * 0.03, 1, 1 + 0.06 * amp * Math.abs(S.s) + sg * hit * 0.03);
      skirt.rotation.set(-0.05 * amp + Math.sin(ph * 2 - 0.5) * 0.04 * amp, 0, S.s * 0.09 * amp + Math.sin(t * 1.4) * 0.01);
      const idle = Math.sin(t * 1.7), side = Math.sin(ph - 0.6);
      tail.rotation.set(0.75 + 0.35 * amp + sg * (0.15 + 0.2 * beat) + A * 0.4 + idle * 0.05 + Math.sin(ph * 2) * 0.12 * amp, 0, side * 0.3 * amp + sg * Math.sin(t * Math.PI * 2 - 0.4) * 0.15);
      t2.rotation.set(-0.12 + Math.sin(ph * 2 - 0.9) * 0.22 * amp + Math.sin(t * 1.7 - 0.8) * 0.07 + sg * beat * 0.1, 0, Math.sin(ph - 1.2) * 0.25 * amp);
      t3.rotation.set(-0.1 + Math.sin(ph * 2 - 1.8) * 0.3 * amp + Math.sin(t * 1.7 - 1.6) * 0.1 + sg * beat * 0.16, 0, Math.sin(ph - 1.8) * 0.3 * amp);
      // notes
      for (let i = 0; i < 4; i++) {
        const n = notes[i];
        if (!n.on) {
          if (sg > 0.3) { n.wait -= dt; if (n.wait <= 0) { n.on = true; n.life = 0; n.vx = (Math.random() - 0.5) * 0.7; n.vy = 0.5 + Math.random() * 0.3; n.x = 0.12; n.y = 1.15; n.z = 0.42; } }
          continue;
        }
        n.life += dt * 0.9;
        if (n.life >= 1) { n.on = false; n.n.visible = false; n.wait = 0.1 + i * 0.12; continue; }
        n.x += n.vx * dt; n.y += n.vy * dt; n.z += 0.35 * dt;
        const u = n.life, sc = Math.sin(u * Math.PI) * 1.1;
        n.n.visible = sc > 0.02;
        n.n.position.set(n.x + Math.sin(u * 9 + i) * 0.05, n.y, n.z);
        n.n.scale.setScalar(sc * 0.9); n.n.rotation.z = Math.sin(u * 7 + i) * 0.4; n.n.rotation.y = u * 4;
      }
      lifeXform(L, R.root, 1, 1, 1, 1 + A * 0.06 + sg * hit * 0.012, 1 + A * 0.12);
    },
    attack() { L.attack(); },
    die() { L.die(); },
    isDead() { return L.dead; },
    get dead() { return L.dead; },
    setCarry() {},
  };
  self.group.add(R.fitG);
  self.group.name = 'Jasmin';
  return self;
}

/* ------------------------------------------------------------------ ROXOR */
export function makeRoxor() {
  const ctx = makeCtx();
  const HAIR = 0x6b4128, HAIR2 = 0x865535, TEE = 0x5b4aa0, GREEN = 0x79d46a, YEL = 0xffd84d, WOOD = 0xc99060, CREAM = 0xfff4e6;
  const R = buildKid(ctx, { shirt: TEE, sleeve: TEE, skin: SKIN, legColor: GREEN, legR: 0.066, cuff: 0x5fb855, shoes: YEL, sole: CREAM, pelvis: GREEN, iris: 0x3b2a1e, ew: 0.066, eh: 0.09, brow: 0x3a2218, browTilt: -0.14, mw: 0.05, tilt: 0.0 });
  const { head, body, d } = R;
  const { cy, rx, ry, rz } = d;
  const sz = (x, y) => rz * Math.sqrt(Math.max(0.04, 1 - (x / rx) ** 2 - ((y - cy) / ry) ** 2));
  // tee: logo + collar
  part(ctx, body, cyl(0.06, 0.06, 0.02, 8), YEL, 0, 0.19, 0.133, 1, 1, 1, { rx: Math.PI / 2, ol: 0.01 });
  part(ctx, body, cyl(0.032, 0.032, 0.024, 8), 0xff7a3a, 0, 0.19, 0.138, 1, 1, 1, { rx: Math.PI / 2, ol: false });
  part(ctx, body, cyl(0.112, 0.125, 0.045, 8), 0x2f2750, 0, 0.355, 0, 1, 1, 0.95, { ol: 0.012 });
  part(ctx, body, cyl(0.15, 0.147, 0.04, 8), 0x2f2750, 0, 0.02, 0, 1, 1, 0.92, { ol: 0.012 });
  // spiky hair
  part(ctx, head, cap(10, 6, 1.5), HAIR, 0, cy + 0.03, -0.04, rx * 1.06, ry * 1.06, rz * 1.07, { rx: -0.35 });
  part(ctx, head, ico(1), HAIR, 0, cy - 0.03, -0.1, rx * 0.98, ry * 0.9, rz * 0.82);
  const spikes = [
    [0.0, 1.0, 0.55, 0.16, 0.34], [-0.4, 0.95, 0.3, 0.14, 0.3], [0.45, 0.95, 0.25, 0.14, 0.3], [0.0, 0.9, -0.45, 0.16, 0.34],
    [-0.7, 0.7, -0.25, 0.14, 0.28], [0.72, 0.7, -0.2, 0.14, 0.28], [-0.25, 0.8, 0.75, 0.12, 0.26], [0.3, 0.82, 0.72, 0.12, 0.26], [-0.85, 0.35, 0.0, 0.1, 0.22], [0.86, 0.35, 0.0, 0.1, 0.22],
  ];
  spikes.forEach((s, i) => {
    const v = new THREE.Vector3(s[0], s[1], s[2]).normalize();
    part(ctx, head, cone(s[3], s[4], 4), i % 2 ? HAIR2 : HAIR, v.x * rx * 0.97, cy + v.y * ry * 0.97, v.z * rz * 0.97, 1, 1, 1, { q: aim(s[0] * 1.3, s[1], s[2] * 1.3), ol: 0.013 });
  });
  // fringe
  for (let i = 0; i < 4; i++) {
    const x = -0.15 + i * 0.1, y = cy + 0.21;
    part(ctx, head, cone(0.06, 0.15, 4), i % 2 ? HAIR : HAIR2, x, y, sz(x, y - 0.06) + 0.01, 1, 1, 0.8, { rx: Math.PI, rz: (i - 1.5) * 0.12, ol: 0.012 });
  }
  // smug extras: earring stud + cheek scar-free grin handled by mouth width
  // ---- carry rack
  const rack = new THREE.Group(); body.add(rack);
  part(ctx, rack, box(0.4, 0.5, 0.05), WOOD, 0, 0.14, -0.17, 1, 1, 1, { ol: 0.012 });           // back plate on the tee
  part(ctx, rack, box(0.5, 0.05, 0.6), WOOD, 0, -0.1, -0.47, 1, 1, 1, { ol: 0.012 });            // shelf
  for (const sd of [-1, 1]) {
    part(ctx, rack, box(0.045, 0.045, 0.34), 0xa8703f, sd * 0.17, 0.02, -0.34, 1, 1, 1, { ol: false });   // struts
    part(ctx, rack, box(0.045, 0.62, 0.045), 0xa8703f, sd * 0.25, 0.2, -0.72, 1, 1, 1, { ol: false });   // rear posts
  }
  part(ctx, rack, box(0.5, 0.05, 0.05), 0xa8703f, 0, 0.45, -0.72, 1, 1, 1, { ol: false });
  for (const sd of [-1, 1]) {
    part(ctx, body, box(0.05, 0.4, 0.02), CREAM, sd * 0.085, 0.16, 0.128, 1, 1, 1, { rz: sd * -0.06, ol: 0.008 });
    part(ctx, body, box(0.05, 0.03, 0.34), CREAM, sd * 0.1, 0.34, -0.02, 1, 1, 1, { ol: 0.008 });
  }
  // loot stack: 3 chained pivots (sway lag), 2 columns x 6 rows
  const stackA = new THREE.Group(); stackA.position.set(0, -0.07, -0.5); rack.add(stackA);
  const stackB = new THREE.Group(); stackB.position.y = 0.4; stackA.add(stackB);
  const stackC = new THREE.Group(); stackC.position.y = 0.4; stackB.add(stackC);
  const lootCols = [C.pink, C.mint, C.gold, C.sky, C.violet, C.orange, C.blossom, C.teal, C.hotPink, C.green, 0xffe98a, 0xb59cff];
  const items = [];
  for (let i = 0; i < 12; i++) {
    const r = Math.floor(i / 2), col = i % 2, parent = r < 2 ? stackA : r < 4 ? stackB : stackC;
    const piv = new THREE.Group();
    const yBase = (r % 2) * 0.2 + 0.1;
    piv.position.set(col === 0 ? -0.115 : 0.115, yBase, (i % 3 - 1) * 0.015);
    piv.rotation.y = (i % 4 - 1.5) * 0.12;
    parent.add(piv);
    const c = lootCols[i];
    if (i % 3 === 1) { // helmet
      part(ctx, piv, dome(), c, 0, -0.07, 0, 0.125, 0.125, 0.125, { ol: 0.012 });
      part(ctx, piv, hang(0.13, 0.13, 0.03, 6), 0xfff4e6, 0, -0.07, 0, 1, 1, 1, { ol: 0.01 });
      part(ctx, piv, box(0.025, 0.04, 0.19), YEL, 0, 0.06, 0, 1, 1, 1, { ol: 0.008 });
    } else { // crate
      part(ctx, piv, box(0.21, 0.185, 0.21), c, 0, 0, 0, 1, 1, 1, { ol: 0.013 });
      part(ctx, piv, box(0.22, 0.045, 0.22), CREAM, 0, 0.0, 0, 1, 1, 1, { ol: false });
      part(ctx, piv, box(0.045, 0.195, 0.22), YEL, 0, 0, 0, 1, 1, 1, { ol: false });
    }
    piv.scale.setScalar(0.0001);
    items.push({ piv, s: 0, v: 0 });
  }
  fit(R, 1.8);
  const S = newState(2), L = makeLife(ctx, 0.5, 0.9);
  let carryT = 0;
  const self = {
    group: new THREE.Group(),
    setCarry(n) { carryT = clamp(Math.round(n || 0), 0, 12); self._carryManual = true; },
    update(dt, t, st) {
      if (L.dead) return;
      dt = Math.min(dt, 0.05); st = st || {};
      L.tick(dt, st);
      if (st.carry !== undefined && st.carry !== null) carryT = clamp(Math.round(st.carry), 0, 12);
      kidTick(R, S, dt, t, st);
      const amp = S.amp, ph = S.ph, A = L.atkEnv;
      const cw = (S.carryW = damp(S.carryW, carryT > 0 ? 1 : 0, 8, dt));
      const sg = (S.sing = damp(S.sing, st.singing ? 1 : 0, 9, dt));
      // carrying: hands hold the shoulder straps
      blendArm(R.armL, cw * 0.85, -0.55 + S.s * 0.08 * amp, 0.35, -0.12, -1.65);
      blendArm(R.armR, cw * 0.85, -0.55 - S.s * 0.08 * amp, -0.35, 0.12, -1.65);
      R.body.rotation.x += cw * (0.07 + 0.03 * Math.min(carryT, 12) / 12);
      R.root.position.y -= cw * 0.01 * Math.min(carryT, 12) / 12;
      // singing: cheering fist-pump + head bob
      const beat = Math.sin(t * Math.PI * 4), hit = Math.abs(Math.sin(t * Math.PI * 2));
      blendArm(R.armR, sg * (1 - cw), -2.5 + beat * 0.2, -0.1, 0.35, -0.5);
      R.head.rotation.x += sg * (-0.08 + beat * 0.05);
      R.root.position.y += sg * hit * 0.03;
      if (A > 0) {
        blendArm(R.armR, A, -1.6, 0, 0.05, -0.05);
        blendArm(R.armL, A, 0.5, 0, -0.5, -0.5);
        R.body.rotation.x += A * 0.25;
        R.root.position.z = A * 0.28;
      } else R.root.position.z = 0;
      setMouth(R.face, Math.max(A * 0.9, sg * (0.4 + 0.4 * beat)) * 0.8, 0.3 + A * 0.4);
      setBlink(R.face, S.blink);
      // loot spring pop + sway
      for (let i = 0; i < 12; i++) {
        const it = items[i], tg = i < carryT ? 1 : 0;
        const sub = Math.max(1, Math.ceil(dt / 0.016)), h = dt / sub;
        for (let k = 0; k < sub; k++) { it.v += (tg - it.s) * 170 * h; it.v *= Math.exp(-11 * h); it.s += it.v * h; }
        const sc = Math.max(0.0001, it.s);
        it.piv.scale.setScalar(sc);
        it.piv.visible = sc > 0.004;
      }
      const lean = 0.05 + 0.1 * amp;
      stackA.rotation.set(lean + Math.sin(ph * 2) * 0.03 * amp + Math.sin(t * 1.6) * 0.008, 0, Math.sin(ph) * 0.05 * amp);
      stackB.rotation.set(Math.sin(ph * 2 - 0.9) * 0.06 * amp + 0.02, 0, Math.sin(ph - 0.9) * 0.1 * amp + Math.sin(t * 1.5) * 0.015);
      stackC.rotation.set(Math.sin(ph * 2 - 1.8) * 0.09 * amp + 0.02, 0, Math.sin(ph - 1.8) * 0.15 * amp + Math.sin(t * 1.5 - 0.8) * 0.025);
      lifeXform(L, R.root, 1, 1, 1, 1 + A * 0.05, 1 + A * 0.1);
    },
    attack() { L.attack(); },
    die() { L.die(); },
    isDead() { return L.dead; },
    get dead() { return L.dead; },
  };
  self.group.add(R.fitG);
  self.group.name = 'Roxor';
  return self;
}

/* ------------------------------------------------------------------ creatures */
function creatureBase(ctx, name) {
  const group = new THREE.Group(); group.name = name;
  const fitG = new THREE.Group(); const root = new THREE.Group();
  fitG.add(root); group.add(fitG);
  return { group, fitG, root };
}
function creatureStub(self, L) {
  self.attack = () => L.attack();
  self.die = () => L.die();
  self.isDead = () => L.dead;
  Object.defineProperty(self, 'dead', { get: () => L.dead });
  self.setCarry = () => {};
  return self;
}

function makeKappa() {
  const ctx = makeCtx();
  const { group, fitG, root } = creatureBase(ctx, 'kappa');
  const TEAL = 0x5fd8c6, TEAL2 = 0x45b8ac, CREAM = 0xfff0c8, SHELL = 0x93c25a, SHELL2 = 0x6f9f46, YEL = 0xffd84d;
  const legs = [];
  for (const sd of [-1, 1]) {
    const p = new THREE.Group(); p.position.set(sd * 0.15, 0.2, 0); root.add(p);
    part(ctx, p, hang(0.075, 0.065, 0.14, 6), TEAL2, 0, 0, 0, 1, 1, 1, { ol: 0.014 });
    part(ctx, p, ico(0), CREAM, 0, -0.165, 0.045, 0.1, 0.045, 0.14, { ol: false });
    legs.push(p);
  }
  const body = new THREE.Group(); body.position.y = 0.2; root.add(body);
  part(ctx, body, ico(1), TEAL, 0, 0.2, 0, 0.33, 0.29, 0.29);
  part(ctx, body, ico(0), CREAM, 0, 0.18, 0.16, 0.21, 0.2, 0.13, { ol: false });
  // shell
  const shell = part(ctx, body, ico(1), SHELL, 0, 0.24, -0.2, 0.31, 0.3, 0.17);
  for (const [x, y] of [[0, 0.28], [0, 0.1]]) part(ctx, body, ico(0), SHELL2, x, y + 0.04, -0.34, 0.1, 0.09, 0.03, { ol: false });
  // arms
  const arms = [];
  for (const sd of [-1, 1]) {
    const p = new THREE.Group(); p.position.set(sd * 0.3, 0.3, 0.02); p.rotation.order = 'YXZ'; body.add(p);
    part(ctx, p, hang(0.06, 0.05, 0.14, 6), TEAL, 0, 0, 0, 1, 1, 1, { ol: 0.013 });
    part(ctx, p, ico(0), CREAM, 0, -0.16, 0.0, 0.07, 0.07, 0.07, { ol: false });
    arms.push(p);
  }
  // head
  const head = new THREE.Group(); head.position.y = 0.43; body.add(head);
  const hs = 1, ry = 0.3, rx = 0.37, rz = 0.33, cy = 0.2;
  const d = { cy, rx, ry, rz, hs };
  part(ctx, head, ico(2), TEAL, 0, cy, 0, rx, ry, rz, { ol: 0.019 });
  const face = addFace(ctx, head, d, { ex: 0.14, ey: 0.0, ew: 0.07, eh: 0.095, mw: 0.05, my: -0.12, iris: 0x2b6a6a });
  // beak
  part(ctx, head, ico(0), YEL, 0, cy - 0.065, rz * 0.9, 0.08, 0.045, 0.055, { ol: false });
  // dish on head
  part(ctx, head, cyl(0.2, 0.22, 0.05, 7), CREAM, 0, cy + ry - 0.02, -0.01, 1, 1, 1, { ol: 0.014 });
  flat(ico(0), basic(0x8fe3f8), head, 0, cy + ry + 0.012, -0.01, 0.17, 0.03, 0.17);
  flat(ico(0), basic(0xffffff), head, -0.06, cy + ry + 0.03, 0.02, 0.04, 0.012, 0.025);
  fit({ fitG, root, constructor: null }, 1.0);
  // fit helper expects R.fitG
  const S = newState(3), L = makeLife(ctx, 0.5, 0.8);
  const self = {
    group,
    update(dt, t, st) {
      if (L.dead) return;
      dt = Math.min(dt, 0.05); st = st || {};
      L.tick(dt, st);
      const sp = (S.sp = damp(S.sp, clamp(st.speed || 0, 0, 1), 10, dt)), amp = Math.min(1, sp * 2.4);
      S.ph += dt * sp * 12;
      const ph = S.ph, s = Math.sin(ph), br = Math.sin(t * 2.2 + 1), A = L.atkEnv;
      root.position.set(0, Math.abs(Math.cos(ph)) * 0.05 * amp + br * 0.006, A * 0.4);
      legs[0].rotation.x = s * 0.7 * amp; legs[1].rotation.x = -s * 0.7 * amp;
      body.rotation.set(0.08 * amp + A * 0.35, 0, s * 0.1 * amp);
      body.scale.set(1 + br * 0.012, 1 + br * 0.02, 1 + br * 0.012);
      head.rotation.set(Math.sin(t * 1.4) * 0.03 - A * 0.2, -s * 0.06 * amp, Math.sin(t * 1.1 + 2) * 0.04);
      arms[0].rotation.set(s * 0.6 * amp - A * 1.7, 0, -0.35 - 0.2 * br);
      arms[1].rotation.set(-s * 0.6 * amp - A * 1.7, 0, 0.35 + 0.2 * br);
      shell.rotation.z = s * 0.04 * amp;
      S.blinkIn -= dt;
      if (S.blinkIn <= 0 && S.blinkT < 0) { S.blinkT = 0; S.blinkIn = 2 + S.rnd() * 3; }
      let bl = 0;
      if (S.blinkT >= 0) { S.blinkT += dt; const u = S.blinkT / 0.15; if (u >= 1) S.blinkT = -1; else bl = 1 - Math.abs(u * 2 - 1); }
      setBlink(face, bl);
      setMouth(face, A * 0.9 + (st.singing ? 0.3 : 0), 0);
      lifeXform(L, root, 1, 1, 1, 1 + A * 0.08, 1 + A * 0.05);
    },
  };
  return creatureStub(self, L);
}

function makeOni() {
  const ctx = makeCtx();
  const { group, fitG, root } = creatureBase(ctx, 'oni');
  const RED = 0xff7058, RED2 = 0xe5553f, CREAM = 0xfff0c8, YEL = 0xffd84d, DARK = 0x3a2230, WOOD = 0xb87e4c;
  const legs = [];
  for (const sd of [-1, 1]) {
    const p = new THREE.Group(); p.position.set(sd * 0.12, 0.22, 0); root.add(p);
    part(ctx, p, hang(0.07, 0.06, 0.16, 6), RED2, 0, 0, 0, 1, 1, 1, { ol: 0.014 });
    part(ctx, p, ico(0), RED, 0, -0.18, 0.035, 0.09, 0.05, 0.12, { ol: false });
    legs.push(p);
  }
  const body = new THREE.Group(); body.position.y = 0.22; root.add(body);
  part(ctx, body, ico(1), RED, 0, 0.19, 0, 0.28, 0.27, 0.25);
  // tiger-stripe loincloth
  part(ctx, body, cyl(0.2, 0.27, 0.13, 6), YEL, 0, 0.02, 0, 1, 1, 0.92, { ol: 0.013 });
  for (let i = 0; i < 3; i++) { const a = (i - 1) * 0.6; part(ctx, body, box(0.035, 0.12, 0.012), DARK, Math.sin(a) * 0.255, 0.02, Math.cos(a) * 0.23, 1, 1, 1, { ry: a, ol: false }); }
  const arms = [];
  for (const sd of [-1, 1]) {
    const p = new THREE.Group(); p.position.set(sd * 0.27, 0.3, 0.02); p.rotation.order = 'YXZ'; body.add(p);
    part(ctx, p, hang(0.06, 0.05, 0.15, 6), RED, 0, 0, 0, 1, 1, 1, { ol: 0.013 });
    part(ctx, p, ico(0), RED2, 0, -0.17, 0, 0.075, 0.075, 0.075, { ol: false });
    arms.push(p);
  }
  // club in right hand (+x)
  const club = new THREE.Group(); club.position.set(0, -0.17, 0.02); arms[1].add(club);
  part(ctx, club, hang(0.03, 0.035, 0.18, 6), WOOD, 0, 0.08, 0, 1, 1, 1, { ol: 0.012, rx: Math.PI });
  const cb = new THREE.Group(); cb.position.y = -0.1; club.add(cb);
  part(ctx, cb, cyl(0.085, 0.045, 0.3, 6), WOOD, 0, -0.15, 0, 1, 1, 1, { ol: 0.014 });
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; part(ctx, cb, cone(0.03, 0.06, 4), 0xfff4e6, Math.cos(a) * 0.085, -0.1 - (i % 2) * 0.1, Math.sin(a) * 0.085, 1, 1, 1, { q: aim(Math.cos(a), 0.15, Math.sin(a)), ol: 0.008 }); }
  club.rotation.x = -0.4;
  // head
  const head = new THREE.Group(); head.position.y = 0.43; body.add(head);
  const ry = 0.3, rx = 0.36, rz = 0.33, cy = 0.2, hs = 1;
  const d = { cy, rx, ry, rz, hs };
  part(ctx, head, ico(2), RED, 0, cy, 0, rx, ry, rz, { ol: 0.019 });
  const face = addFace(ctx, head, d, { ex: 0.12, ey: -0.03, ew: 0.06, eh: 0.08, mw: 0.055, my: -0.125, iris: 0xaa2a1a, brow: 0x3a2230, browTilt: -0.5, blushColor: 0xff9ab0 });
  // fangs
  for (const sd of [-1, 1]) part(ctx, head, cone(0.026, 0.07, 4), 0xffffff, sd * 0.06, cy - 0.09, 0.3, 1, 1, 1, { ol: false });
  // horns
  for (const sd of [-1, 1]) {
    part(ctx, head, cone(0.075, 0.26, 5), CREAM, sd * 0.17, cy + ry - 0.0, 0.0, 1, 1, 1, { q: aim(sd * 0.45, 1, 0.2), ol: 0.014 });
  }
  // wild hair tuft
  for (let i = 0; i < 3; i++) {
    const a = (i - 1) * 0.4;
    part(ctx, head, cone(0.08, 0.18, 4), DARK, Math.sin(a) * 0.1, cy + ry + 0.01, -0.08 + Math.cos(a) * 0.03, 1, 1, 1, { rz: -a, rx: -0.2, ol: false });
  }
  // ears
  fit({ fitG, root }, 1.1);
  const S = newState(4), L = makeLife(ctx, 0.55, 0.8);
  const self = {
    group,
    update(dt, t, st) {
      if (L.dead) return;
      dt = Math.min(dt, 0.05); st = st || {};
      L.tick(dt, st);
      const sp = (S.sp = damp(S.sp, clamp(st.speed || 0, 0, 1), 10, dt)), amp = Math.min(1, sp * 2.4);
      S.ph += dt * sp * 12;
      const ph = S.ph, s = Math.sin(ph), br = Math.sin(t * 2.6 + 2), A = L.atkEnv;
      root.position.set(0, Math.abs(Math.cos(ph)) * 0.06 * amp + br * 0.006, A * 0.35);
      legs[0].rotation.x = s * 0.75 * amp; legs[1].rotation.x = -s * 0.75 * amp;
      body.rotation.set(0.08 * amp + A * 0.3, s * 0.12 * amp, 0);
      body.scale.set(1 + br * 0.012, 1 + br * 0.02, 1 + br * 0.012);
      head.rotation.set(Math.sin(t * 1.6) * 0.03 - A * 0.25, -s * 0.07 * amp, Math.sin(t * 1.1) * 0.04);
      arms[0].rotation.set(s * 0.7 * amp - A * 0.3, 0, -0.45 - 0.1 * br);
      // club arm: raise high on windup, slam down forward
      const wind = A < 0.5 ? A : 0.5;
      arms[1].rotation.set(-s * 0.7 * amp - A * 2.7, 0, 0.45 + 0.1 * br - A * 0.2);
      club.rotation.x = -0.4 - A * 0.8;
      S.blinkIn -= dt;
      if (S.blinkIn <= 0 && S.blinkT < 0) { S.blinkT = 0; S.blinkIn = 2 + S.rnd() * 3; }
      let bl = 0;
      if (S.blinkT >= 0) { S.blinkT += dt; const u = S.blinkT / 0.15; if (u >= 1) S.blinkT = -1; else bl = 1 - Math.abs(u * 2 - 1); }
      setBlink(face, bl);
      setMouth(face, A * 1.0, 0.2);
      lifeXform(L, root, 1, 1, 1, 1 + A * 0.07, 1 + A * 0.06);
    },
  };
  return creatureStub(self, L);
}

function makeSlime() {
  const ctx = makeCtx();
  const { group, fitG, root } = creatureBase(ctx, 'slime');
  const JELLY = 0x7fe39a, LIGHT = 0xc6ffd6, DEEP = 0x4fc47c;
  const g = geo('slimeBlob', () => {
    const b = new THREE.IcosahedronGeometry(1, 2);
    const p = b.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 0) p.setY(i, y * 0.28); }
    return b;
  });
  const body = new THREE.Group(); body.position.y = 0.0; root.add(body);
  const blob = part(ctx, body, g, JELLY, 0, 0.2, 0, 0.55, 0.74, 0.5, { mo: { roughness: 0.35 }, ol: 0.02 });
  // inner glints / bubbles
  const inner = [[-0.2, 0.28, 0.22, 0.07], [0.22, 0.55, 0.0, 0.05], [0.15, 0.2, -0.2, 0.06], [-0.18, 0.62, -0.08, 0.04]];
  for (const [x, y, z, r] of inner) part(ctx, body, ico(0), LIGHT, x, y, z, r, r, r, { ol: false });
  // belly shade + top drop tip
  part(ctx, body, cone(0.1, 0.22, 5), JELLY, 0, 0.98, 0, 1, 1, 1, { mo: { roughness: 0.35 }, ol: 0.014 });
  // glossy highlight
  const hl = flat(ico(0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false }), body, -0.2, 0.75, 0.26, 0.12, 0.07, 0.04);
  hl.rotation.set(0.0, -0.5, 0.6);
  flat(ico(0), basic(0xffffff), body, -0.3, 0.6, 0.2, 0.025, 0.025, 0.02);
  // face on the blob surface
  const head = new THREE.Group(); body.add(head);
  const d = { cy: 0.38, rx: 0.55, ry: 0.55, rz: 0.5, hs: 1.12 };
  const face = addFace(ctx, head, d, { ex: 0.115, ey: 0.0, ew: 0.07, eh: 0.1, mw: 0.045, my: -0.15, iris: 0x1e6a46, blushColor: 0xffa6c0 });
  head.position.y = 0.0;
  fit({ fitG, root }, 0.95);
  const S = newState(5), L = makeLife(ctx, 0.5, 0.8);
  const self = {
    group,
    update(dt, t, st) {
      if (L.dead) return;
      dt = Math.min(dt, 0.05); st = st || {};
      L.tick(dt, st);
      const sp = (S.sp = damp(S.sp, clamp(st.speed || 0, 0, 1), 8, dt)), amp = Math.min(1, sp * 2.4);
      S.ph += dt * sp * 9;
      const ph = S.ph, A = L.atkEnv;
      const hop = Math.abs(Math.sin(ph));               // 0 on ground
      const stretch = Math.cos(ph * 2);                  // + at launch/land? tall when airborne
      const br = Math.sin(t * 3.0), jig = Math.sin(t * 7.0) * 0.012;
      root.position.set(0, hop * 0.3 * amp, A * 0.45);
      const sq = amp * (0.5 - hop) * 0.3;               // squash on ground, stretch in air
      blob.scale.set(0.55 * (1 - sq + br * 0.02 + jig), 0.74 * (1 + sq * 1.1 + br * 0.04 - jig * 2), 0.5 * (1 - sq + br * 0.02 + jig));
      body.scale.set(1 + A * 0.12, 1 - A * 0.12, 1 + A * 0.12);
      // face rides the blob: scale compensate
      head.position.y = (blob.scale.y / 0.74 - 1) * 0.35;
      head.scale.set(1, blob.scale.y / 0.74 * 0.5 + 0.5, 1);
      S.blinkIn -= dt;
      if (S.blinkIn <= 0 && S.blinkT < 0) { S.blinkT = 0; S.blinkIn = 2 + S.rnd() * 3; }
      let bl = 0;
      if (S.blinkT >= 0) { S.blinkT += dt; const u = S.blinkT / 0.15; if (u >= 1) S.blinkT = -1; else bl = 1 - Math.abs(u * 2 - 1); }
      setBlink(face, bl);
      setMouth(face, A * 1.0 + (st.singing ? 0.25 : 0), 0.2);
      lifeXform(L, root, 1, 1, 1, 1, 1);
    },
  };
  return creatureStub(self, L);
}

export function makeCreature(kind) {
  if (kind === 'oni') return makeOni();
  if (kind === 'slime') return makeSlime();
  return makeKappa();
}

/* ------------------------------------------------------------------ FANS */
const FAN_SKIN = [0xffd7bd, 0xf6bf98, 0xdc9d70, 0xb27a50, 0xffe6d0];
const FAN_HAIR = [0x3b2418, 0xffd84d, 0xff7eb6, 0x7a5cd8, 0x46c8c0, 0xff9a2e, 0x2d170f, 0x9af0b4, 0x8a5030, 0xf2f2ff];
const FAN_SHIRT = [0xff7eb6, 0x9af0b4, 0x8fe3f0, 0xffd84d, 0xb59cff, 0xff9a2e, 0xff6b6b, 0x6fd36a, 0xffc2dc];
const FAN_PANTS = [0x6a7bd8, 0x3a2a86, 0xfff4e6, 0x46c8c0, 0xff9cc6, 0x4a4a68];

export function makeFan(seed = 1) {
  const r = rng(seed * 977 + 13);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const ctx = makeCtx();
  const skin = pick(FAN_SKIN), hairC = pick(FAN_HAIR), shirt = pick(FAN_SHIRT), pants = pick(FAN_PANTS);
  const style = Math.floor(r() * 5), acc = Math.floor(r() * 3), skirtOn = r() < 0.35;
  const accColor = pick([0xff4d8d, 0x9af0b4, 0xffd84d, 0x8fe3f8, 0xb59cff]);
  const R = buildKid(ctx, { lo: true, headS: 1.16, skin, shirt, sleeve: shirt, legColor: skirtOn ? skin : pants, shoes: pick([0xfff4e6, 0xff7eb6, 0xffd84d, 0x4a4a68]), pelvis: skirtOn ? null : pants, legR: 0.062, iris: null, blush: true, ew: 0.072, eh: 0.1 });
  const { head, body, d } = R;
  const { cy, rx, ry, rz } = d;
  const sz = (x, y) => rz * Math.sqrt(Math.max(0.04, 1 - (x / rx) ** 2 - ((y - cy) / ry) ** 2));
  if (skirtOn) part(ctx, body, cyl(0.15, 0.26, 0.17, 6), pick(FAN_SHIRT), 0, -0.05, 0, 1, 1, 1, { ol: 0.012 });
  // hair
  const hl = new THREE.Color(hairC).lerp(new THREE.Color(0xffffff), 0.15).getHex();
  if (style !== 3) part(ctx, head, cap(8, 4, 1.55), hairC, 0, cy + 0.02, -0.03, rx * 1.07, ry * 1.07, rz * 1.08, { rx: -0.4 });
  if (style === 0) { // bob
    part(ctx, head, ico(0), hairC, 0, cy - 0.04, -0.12, rx * 1.0, ry * 0.95, rz * 0.8);
  } else if (style === 1) { // twin buns
    for (const sd of [-1, 1]) part(ctx, head, ico(0), hl, sd * 0.2, cy + ry * 0.98, -0.05, 0.12, 0.12, 0.12, { ol: 0.013 });
  } else if (style === 2) { // spikes
    for (let i = 0; i < 4; i++) { const a = -0.6 + i * 0.4; part(ctx, head, cone(0.085, 0.22, 4), i % 2 ? hl : hairC, Math.sin(a) * 0.2, cy + ry * 0.95, -0.03, 1, 1, 1, { rz: -a * 0.8, ol: 0.012 }); }
  } else if (style === 3) { // puff
    part(ctx, head, ico(1), hairC, 0, cy + 0.08, -0.05, rx * 1.2, ry * 1.1, rz * 1.15, { ol: 0.016 });
  } else { // twin tails
    for (const sd of [-1, 1]) {
      part(ctx, head, cone(0.1, 0.34, 5), hl, sd * 0.36, cy - 0.05, -0.04, 1, 1, 1, { rx: Math.PI, rz: sd * 0.25, ol: 0.012 });
      part(ctx, head, ico(0), 0xff4d8d, sd * 0.33, cy + 0.1, -0.04, 0.045, 0.045, 0.045, { ol: false });
    }
  }
  for (let i = 0; i < 3; i++) { const x = -0.1 + i * 0.1, y = cy + 0.2; part(ctx, head, cone(0.06, 0.12, 4), hairC, x, y, sz(x, y - 0.06) + 0.008, 1, 1, 0.8, { rx: Math.PI, ol: 0.01 }); }
  // accessory on right hand (+x arm)
  const hand = R.armR;
  if (acc === 0) { // glow stick
    const gm = basic(accColor);
    flat(hang(0.024, 0.024, 0.36, 5), gm, hand.sh, 0, -0.25, 0, 1, 1, 1);
    flat(ico(0), basic(0xffffff), hand.sh, 0, -0.6, 0, 0.03, 0.03, 0.03);
  } else if (acc === 1) { // foam finger
    part(ctx, hand.sh, ico(0), accColor, 0, -0.34, 0, 0.12, 0.1, 0.07, { ol: 0.012 });
    part(ctx, hand.sh, hang(0.04, 0.045, 0.26, 5), accColor, 0, -0.38, 0, 1, 1, 1, { ol: 0.012 });
    part(ctx, hand.sh, ico(0), accColor, 0, -0.65, 0, 0.05, 0.05, 0.05, { ol: 0.012 });
  }
  fit(R, 1.4);
  const S = newState(seed), L = makeLife(ctx, 0.5, 0.8);
  S.phase = r() * 6.28; S.speedF = 5 + r() * 2.5; S.style = Math.floor(r() * 2);
  const self = {
    group: new THREE.Group(),
    update(dt, t, st) {
      if (L.dead) return;
      dt = Math.min(dt, 0.05); st = st || {};
      L.tick(dt, st);
      kidTick(R, S, dt, t, st);
      const amp = S.amp, A = L.atkEnv;
      const ch = 1 - amp;
      const sg = (S.sing = damp(S.sing, st.singing ? 1 : 0, 6, dt));
      const f = (S.speedF) * (1 + sg * 0.25), p = t * f + S.phase;
      const pump = Math.sin(p), bounce = Math.abs(Math.sin(p * 0.5));
      const w = ch * (0.92 + 0.08 * Math.max(sg, A));
      if (S.style === 0) {
        blendArm(R.armR, w, -2.6 + pump * 0.3, -0.05, 0.6);
        blendArm(R.armL, w, -2.6 - pump * 0.3, 0.05, -0.6);
      } else {
        blendArm(R.armR, w, -2.8 + pump * 0.25, 0, 0.45 + pump * 0.3);
        blendArm(R.armL, w, -0.25, 0.2, -0.4);
      }
      R.root.position.y += bounce * 0.07 * w * (1 + sg * 0.6 + A);
      R.body.rotation.z = Math.sin(p * 0.5) * 0.06 * ch;
      R.head.rotation.z += Math.sin(p * 0.5 + 1) * 0.07 * ch;
      R.legs[0].rotation.x += bounce * -0.12 * ch; R.legs[1].rotation.x += bounce * 0.12 * ch;
      setBlink(R.face, S.blink);
      setMouth(R.face, ch * (0.35 + 0.5 * Math.max(0, Math.sin(p * 1.0))) * (0.7 + 0.3 * sg) * 0.8 + A * 0.6, 0.4);
      lifeXform(L, R.root, 1, 1, 1, 1 + A * 0.08, 1 + A * 0.06);
    },
  };
  self.group.add(R.fitG);
  self.group.name = 'fan' + seed;
  return creatureStub(self, L);
}
