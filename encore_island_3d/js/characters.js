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

const SKIN = 0xffc5a0;
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
// STYLE: the 3D game sets flat = false (smooth "medium poly" shading under the inked hull) and boost = 1 for hero-class actors (one extra icosphere subdivision).
export const STYLE = { flat: true, boost: 0 };
const ico = (d = 1) => { const dd = Math.min(4, d + STYLE.boost); return geo('ico' + dd, () => new THREE.IcosahedronGeometry(1, dd)); };
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
        mat = new THREE.MeshStandardMaterial({ color, flatShading: STYLE.flat, roughness: 0.75, metalness: 0, emissive: 0xff2a4a, emissiveIntensity: 0, ...extra });
        map.set(k, mat); list.push(mat);
      }
      return mat;
    },
    mk(key, params) {
      let mat = map.get(key);
      if (!mat) { mat = new THREE.MeshStandardMaterial({ flatShading: STYLE.flat, roughness: 0.75, metalness: 0, emissive: 0xff2a4a, emissiveIntensity: 0, ...params }); map.set(key, mat); list.push(mat); }
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
  if ((o.ol !== false && !o.mat) || (o.hull && o.ol !== false)) {
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

/* ------------------------------------------------------------------ HERO art kit: painted face/outfit textures + the chibi hero rig */
// All textures are drawn procedurally on canvases (cached per module, shared by instances). Without `document` (headless) the decals are skipped.
const HTX = new Map();
function ctex(key, w, h, draw) {
  let t = HTX.get(key);
  if (t !== undefined) return t;
  t = null;
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    draw(cv.getContext('2d'), w, h);
    t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  }
  HTX.set(key, t);
  return t;
}
const HMAT = new Map();
function decalMat(key, tex) {
  let m = HMAT.get(key);
  if (!m) { m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); HMAT.set(key, m); }
  return m;
}
// 2D painting helpers
const ell = (g, x, y, rx, ry, fill, rot = 0) => { g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2); if (fill) { g.fillStyle = fill; g.fill(); } };
const star = (g, x, y, ro, ri, fill) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? ri : ro; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); g.fillStyle = fill; g.fill(); };
const heart = (g, x, y, s, fill, stroke, lw) => { g.beginPath(); g.moveTo(x, y + s * 0.9); g.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.7, y - s * 1.1, x, y - s * 0.4); g.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.5, y - s * 0.1, x, y + s * 0.9); g.fillStyle = fill; g.fill(); if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); } };

// Head: sphere with a tapered jaw. surf(x,y) = z of the surface (head-local), kept in sync with the deformed geometry.
function makeHead(rx, ry, rz, cy, jaw) {
  const tp = (yn) => (yn < 0.1 ? 1 - jaw * Math.pow(clamp((0.1 - yn) / 1.1, 0, 1), 1.2) : 1);
  const surf = (x, y) => { const yn = (y - cy) / ry, t = tp(yn); return rz * t * Math.sqrt(Math.max(1e-4, 1 - (x / (rx * t)) ** 2 - yn * yn)); };
  const g = geo(`hd${jaw}`, () => {
    const s = new THREE.SphereGeometry(1, 15, 10), p = s.attributes.position;
    for (let i = 0; i < p.count; i++) { const t = tp(p.getY(i)); p.setX(i, p.getX(i) * t); p.setZ(i, p.getZ(i) * t); }
    s.computeVertexNormals();
    // toon-ish shading: pull front normals toward the camera so the painted face reads evenly lit
    const nm = s.attributes.normal;
    for (let i = 0; i < nm.count; i++) {
      let nx = nm.getX(i), ny = nm.getY(i), nz = nm.getZ(i);
      const w = 0.55 * clamp((nz + 0.2) / 0.7, 0, 1);
      nx *= 1 - w; ny = ny * (1 - w) + 0.3 * w; nz = nz * (1 - w) + w;
      const l = Math.hypot(nx, ny, nz) || 1; nm.setXYZ(i, nx / l, ny / l, nz / l);
    }
    return s;
  });
  return { rx, ry, rz, cy, tp, surf, g };
}
// curved decal patch hugging the head (geometry relative to its centre; mesh must be placed at (cx,cy,z0))
function patchGeo(H, cx, cy, w, h, o = {}) {
  const nx = o.nx || 6, ny = o.ny || 4, eps = o.eps ?? 0.011, rot = o.rot || 0, cr = Math.cos(rot), sr = Math.sin(rot);
  const z0 = H.surf(cx, cy) + eps;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const u = i / nx, v = j / ny, lx = (u - 0.5) * w, ly = (0.5 - v) * h;
    const x = cx + lx * cr - ly * sr, y = cy + lx * sr + ly * cr;
    pos.push(x - cx, y - cy, H.surf(x, y) + eps - z0); uv.push(o.flip ? 1 - u : u, 1 - v);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return { g, z0 };
}
function decal(parent, H, mat, cx, cy, w, h, o = {}) {
  const { g, z0 } = patchGeo(H, cx, cy, w, h, o);
  const m = new THREE.Mesh(g, mat); m.position.set(cx, cy, z0); m.renderOrder = o.ro ?? 3; parent.add(m); return m;
}
// painted decal on a torso cylinder front (radius r at height, z squash zs)
function cylDecal(parent, mat, r, zs, y, w, h, o = {}) {
  const nx = 6, ny = 3, pos = [], uv = [], idx = [], eps = o.eps ?? 0.008;
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const u = i / nx, v = j / ny, x = (u - 0.5) * w, yy = y + (0.5 - v) * h;
    pos.push(x, yy, r * zs * Math.sqrt(Math.max(0.01, 1 - (x / r) ** 2)) + eps); uv.push(u, 1 - v);
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  const m = new THREE.Mesh(g, mat); m.renderOrder = 3; parent.add(m); return m;
}
// hair lock: a closed tapered prism hugging the head surface along a polyline of normalised head coords [xn, yn]
function lockGeo(H, path, wid, lift) {
  const n = path.length, V = [], I = [];
  const P = (xn, yn, off) => { const x = xn * H.rx, y = H.cy + yn * H.ry, z = H.surf(x, y); const nx = x / (H.rx * H.rx), ny = (y - H.cy) / (H.ry * H.ry), nz = z / (H.rz * H.rz), l = Math.hypot(nx, ny, nz) || 1; return [x + nx / l * off, y + ny / l * off, z + nz / l * off]; };
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
    let tx = (b[0] - a[0]) * H.rx, ty = (b[1] - a[1]) * H.ry; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const w = wid[i] * 0.5, hw = w / H.rx, hh = w / H.ry; // half width in normalised coords
    const c = path[i], L = P(c[0] - ty * hw, c[1] + tx * hh, -0.01), A = P(c[0], c[1], lift[i]), Rr = P(c[0] + ty * hw, c[1] - tx * hh, -0.01);
    V.push(...L, ...A, ...Rr);
  }
  for (let i = 0; i < n - 1; i++) { const a = i * 3, b = (i + 1) * 3; I.push(a, a + 1, b, a + 1, b + 1, b, a + 1, a + 2, b + 1, a + 2, b + 2, b + 1, a + 2, a, b + 2, a, b, b + 2); }
  I.push(0, 2, 1, (n - 1) * 3, (n - 1) * 3 + 1, (n - 1) * 3 + 2);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(V, 3)); g.setIndex(I); g.computeVertexNormals(); return g;
}
// blade between two points (flattened pointy ellipsoid) — spikes, strands, tail flicks
const _bv = new THREE.Vector3();
function blade(ctx, parent, col, ax, ay, az, bx, by, bz, w, th, o = {}) {
  _bv.set(bx - ax, by - ay, bz - az);
  const len = _bv.length();
  const m = part(ctx, parent, ico(o.d ?? 0), col, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, w, len / 2, th, { q: aim(bx - ax, by - ay, bz - az), ol: o.ol ?? 0.012, mat: o.mat });
  return m;
}
// lofted elliptical tube down -y: rings = [[y, halfX, halfZ, offsetX]]
function tubeGeo(rings, seg = 7, flip = false) {
  const P = [], I = [], n = rings.length;
  for (const r of rings) for (let k = 0; k < seg; k++) { const a = (k / seg) * Math.PI * 2; P.push(r[3] + Math.cos(a) * r[1], r[0], Math.sin(a) * r[2]); }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < seg; k++) { const a = i * seg + k, b = i * seg + (k + 1) % seg, c = a + seg, d = b + seg; if (flip) I.push(a, c, b, b, c, d); else I.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I);
  g.computeVertexNormals(); return g;
}
// tall flame lock rising +y with a curl toward -x at the tip
const flameGeo = (len, w, th, curl) => geo(`flame${len},${w},${th},${curl}`, () => tubeGeo([[0, w * 0.55, th * 0.55, 0], [len * 0.34, w * 0.62, th * 0.62, curl * 0.08 * len], [len * 0.7, w * 0.4, th * 0.42, curl * 0.4 * len], [len, 0.002, 0.002, curl * len]], 4, true));
// pleated skirt: tapered ring whose bottom ring alternates radius
function pleatGeo(rt, rb, h, n, depth) {
  return geo(`pleat${rt},${rb},${h},${n},${depth}`, () => {
    const g = new THREE.CylinderGeometry(rt, rb, h, n * 2, 1, true), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = i % (n * 2 + 1); if (p.getY(i) < 0) { const s = k % 2 ? 1 - depth : 1; p.setX(i, p.getX(i) * s); p.setZ(i, p.getZ(i) * s); } }
    return g;
  });
}

// ---- face paint (all drawn "outer corner on the right"; the -x side is mirrored by UV flip)
function paintEyeJ(g, W, H) {
  const cx = W * 0.5, cy = H * 0.56;
  ell(g, cx, cy, W * 0.47, H * 0.46, '#fff6f0');
  const gr = g.createLinearGradient(0, cy - H * 0.4, 0, cy + H * 0.44); gr.addColorStop(0, '#4a2815'); gr.addColorStop(0.5, '#7c4824'); gr.addColorStop(1, '#c08848');
  ell(g, cx, cy + 2, W * 0.4, H * 0.44, gr); g.lineWidth = 4; g.strokeStyle = '#2a140c'; g.stroke();
  ell(g, cx, cy - 3, W * 0.2, H * 0.24, '#24100a');
  star(g, cx - W * 0.015, cy + H * 0.13, W * 0.1, W * 0.045, '#ff86b6'); ell(g, cx - W * 0.015, cy + H * 0.13, W * 0.022, W * 0.022, '#ffe6f0');
  ell(g, cx + W * 0.17, cy - H * 0.2, W * 0.095, W * 0.1, '#ffffff'); ell(g, cx - W * 0.2, cy + H * 0.28, W * 0.045, W * 0.045, '#ffffff'); ell(g, cx + W * 0.2, cy + H * 0.2, W * 0.025, W * 0.025, '#fff0f6');
  g.lineCap = 'round'; g.strokeStyle = '#2a140c'; g.lineWidth = 9;
  g.beginPath(); g.moveTo(W * 0.04, cy + H * 0.0); g.quadraticCurveTo(W * 0.42, cy - H * 0.62, W * 0.97, cy - H * 0.1); g.stroke();
  g.lineWidth = 6; g.beginPath(); g.moveTo(W * 0.94, cy - H * 0.1); g.lineTo(W * 1.0, cy - H * 0.28); g.stroke();
  g.lineWidth = 3; g.strokeStyle = '#7a4a30'; g.beginPath(); g.moveTo(W * 0.12, cy + H * 0.4); g.quadraticCurveTo(W * 0.5, cy + H * 0.58, W * 0.9, cy + H * 0.34); g.stroke();
}
function paintEyeShutJ(g, W, H) {
  g.lineCap = 'round'; g.strokeStyle = '#2a140c'; g.lineWidth = 8;
  g.beginPath(); g.moveTo(W * 0.06, H * 0.5); g.quadraticCurveTo(W * 0.5, H * 0.86, W * 0.96, H * 0.42); g.stroke();
  g.lineWidth = 5; g.beginPath(); g.moveTo(W * 0.93, H * 0.43); g.lineTo(W * 1.0, H * 0.28); g.stroke();
  g.lineWidth = 3; g.beginPath(); g.moveTo(W * 0.2, H * 0.66); g.lineTo(W * 0.12, H * 0.76); g.moveTo(W * 0.5, H * 0.74); g.lineTo(W * 0.47, H * 0.86); g.moveTo(W * 0.78, H * 0.62); g.lineTo(W * 0.82, H * 0.76); g.stroke();
}
function paintEyeR(g, W, H) {
  const cx = W * 0.5, cy = H * 0.56;
  g.save(); g.beginPath(); g.ellipse(cx, cy, W * 0.46, H * 0.36, 0, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#f3f1f4'; g.fillRect(0, 0, W, H);
  const gr = g.createLinearGradient(0, cy - H * 0.3, 0, cy + H * 0.32); gr.addColorStop(0, '#4d5f8a'); gr.addColorStop(0.55, '#7f95c4'); gr.addColorStop(1, '#bccbe8');
  ell(g, cx, cy + H * 0.02, W * 0.27, H * 0.33, gr); g.lineWidth = 3; g.strokeStyle = '#2a3354'; g.stroke();
  ell(g, cx, cy, W * 0.12, H * 0.17, '#171c33');
  ell(g, cx + W * 0.1, cy - H * 0.1, W * 0.07, W * 0.07, '#ffffff'); ell(g, cx - W * 0.1, cy + H * 0.12, W * 0.035, W * 0.035, '#eaf2ff');
  g.restore();
  g.lineCap = 'round'; g.strokeStyle = '#1f1612'; g.lineWidth = 10;
  g.beginPath(); g.moveTo(W * 0.02, cy + H * 0.02); g.quadraticCurveTo(W * 0.4, cy - H * 0.5, W * 0.96, cy - H * 0.06); g.stroke();
  g.lineWidth = 6; g.beginPath(); g.moveTo(W * 0.9, cy - H * 0.08); g.lineTo(W * 1.0, cy - H * 0.3); g.stroke();
  g.lineWidth = 3; g.strokeStyle = '#6a4a48'; g.beginPath(); g.moveTo(W * 0.14, cy + H * 0.3); g.quadraticCurveTo(W * 0.5, cy + H * 0.46, W * 0.88, cy + H * 0.24); g.stroke();
}
function paintEyeShutR(g, W, H) {
  g.lineCap = 'round'; g.strokeStyle = '#1f1612'; g.lineWidth = 9;
  g.beginPath(); g.moveTo(W * 0.04, H * 0.52); g.quadraticCurveTo(W * 0.5, H * 0.8, W * 0.96, H * 0.46); g.stroke();
  g.lineWidth = 6; g.beginPath(); g.moveTo(W * 0.92, H * 0.47); g.lineTo(W * 1.0, H * 0.3); g.stroke();
}
function paintBrow(g, W, H, col, thick, arch) { // thick end at inner (left), tapering outward (right)
  g.fillStyle = col; g.beginPath();
  g.moveTo(W * 0.02, H * 0.62);
  g.quadraticCurveTo(W * 0.4, H * (0.5 - arch), W * 0.98, H * (0.5 - arch * 0.2));
  g.quadraticCurveTo(W * 0.5, H * (0.5 - arch) + thick * 0.55, W * 0.02, H * 0.62 + thick);
  g.closePath(); g.fill();
}
function paintMouthJ(g, W, H) {
  g.beginPath(); g.moveTo(W * 0.04, H * 0.26); g.quadraticCurveTo(W * 0.5, H * 0.16, W * 0.96, H * 0.26); g.quadraticCurveTo(W * 0.9, H * 0.98, W * 0.5, H * 0.96); g.quadraticCurveTo(W * 0.1, H * 0.98, W * 0.04, H * 0.26); g.closePath();
  g.fillStyle = '#b8344f'; g.fill();
  g.save(); g.clip(); ell(g, W * 0.5, H * 0.98, W * 0.34, H * 0.4, '#ff8aa4'); g.restore();
  g.lineJoin = 'round'; g.lineWidth = 5; g.strokeStyle = '#3d1420'; g.beginPath(); g.moveTo(W * 0.04, H * 0.26); g.quadraticCurveTo(W * 0.5, H * 0.16, W * 0.96, H * 0.26); g.quadraticCurveTo(W * 0.9, H * 0.98, W * 0.5, H * 0.96); g.quadraticCurveTo(W * 0.1, H * 0.98, W * 0.04, H * 0.26); g.stroke();
  g.fillStyle = '#fff4ee'; g.beginPath(); g.moveTo(W * 0.14, H * 0.27); g.quadraticCurveTo(W * 0.5, H * 0.19, W * 0.86, H * 0.27); g.lineTo(W * 0.82, H * 0.4); g.quadraticCurveTo(W * 0.5, H * 0.33, W * 0.18, H * 0.4); g.closePath(); g.fill();
}
function paintMouthR(g, W, H) {
  g.lineJoin = 'round'; g.beginPath(); g.moveTo(W * 0.08, H * 0.34); g.quadraticCurveTo(W * 0.5, H * 0.52, W * 0.94, H * 0.2); g.quadraticCurveTo(W * 0.78, H * 0.92, W * 0.42, H * 0.84); g.quadraticCurveTo(W * 0.14, H * 0.74, W * 0.08, H * 0.34); g.closePath();
  g.fillStyle = '#7d2a35'; g.fill();
  g.save(); g.clip(); g.fillStyle = '#fffaf2'; g.fillRect(0, 0, W, H * 0.58); ell(g, W * 0.5, H * 1.0, W * 0.3, H * 0.28, '#e0707e'); g.restore();
  g.lineWidth = 5; g.strokeStyle = '#2f1612'; g.beginPath(); g.moveTo(W * 0.08, H * 0.34); g.quadraticCurveTo(W * 0.5, H * 0.52, W * 0.94, H * 0.2); g.quadraticCurveTo(W * 0.78, H * 0.92, W * 0.42, H * 0.84); g.quadraticCurveTo(W * 0.14, H * 0.74, W * 0.08, H * 0.34); g.stroke();
}
function paintBlush(g, W, H, col) { const gr = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2); gr.addColorStop(0, col + 'cc'); gr.addColorStop(0.6, col + '66'); gr.addColorStop(1, col + '00'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
function paintNose(g, W, H, col) { g.strokeStyle = col; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(W * 0.3, H * 0.4); g.quadraticCurveTo(W * 0.5, H * 0.75, W * 0.74, H * 0.42); g.stroke(); }

// ---- the rig. o: hip, legX, legR, legColor, head dims, shoulder pos, arm colours/radii, skin; details are added by the caller.
function buildHero(ctx, o) {
  const skin = o.skin ?? SKIN;
  const fitG = new THREE.Group(), root = new THREE.Group();
  fitG.add(root);
  const HIP = o.hip;
  const R = { fitG, root, ctx, HIP, hs: 1, lo: false, legs: [], arms: [] };
  for (const sd of [-1, 1]) {
    const piv = new THREE.Group();
    piv.position.set(sd * (o.legX ?? 0.085), HIP, 0);
    root.add(piv);
    part(ctx, piv, hang(o.legR, o.legR * 0.92, HIP - 0.06, 6), o.legColor ?? skin, 0, 0, 0, 1, 1, 1, { ol: OUTLINE * 0.85 });
    R.legs.push(piv);
    if (o.leg) o.leg(piv, sd);
  }
  const body = new THREE.Group(); body.position.y = HIP; root.add(body); R.body = body;
  const head = new THREE.Group(); head.position.y = o.headY; body.add(head); R.head = head;
  const hr = o.head; // {rx,ry,rz,jaw}
  const cy = hr.ry - 0.03;
  const H = makeHead(hr.rx, hr.ry, hr.rz, cy, hr.jaw);
  R.H = H; R.d = { cy, rx: hr.rx, ry: hr.ry, rz: hr.rz, hs: 1 };
  const skinMat = o.headMat || ctx.mk('skinS' + skin, { color: skin, flatShading: false });
  skinMat.color.multiplyScalar(1.12);
  part(ctx, head, H.g, skin, 0, cy, 0, hr.rx, hr.ry, hr.rz, { ol: 0.02, mat: skinMat, hull: true });
  for (const sd of [-1, 1]) {
    part(ctx, head, ico(0), skin, sd * (hr.rx * 0.985), cy - 0.045, -0.005, o.earW ?? 0.05, o.earH ?? 0.085, 0.055, { ol: 0.012 });
    part(ctx, head, ico(0), 0xf2a99a, sd * (hr.rx * 0.985 + sd * 0.012), cy - 0.04, 0.005, 0.02, 0.05, 0.03, { ol: false });
  }
  const arms = [];
  for (const sd of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(sd * o.shX, o.shY, 0); sh.rotation.order = 'YXZ'; body.add(sh);
    part(ctx, sh, hang(o.armR, o.armR * 0.9, o.upLen, 6), o.upperColor ?? skin, 0, 0, 0, 1, 1, 1, { ol: 0.013 });
    if (o.sleeve) part(ctx, sh, hang(o.armR * 1.28, o.armR * 1.2, o.sleeve.len, 6), o.sleeve.col, 0, 0.012, 0, 1, 1, 1, { ol: 0.013 });
    const el = new THREE.Group(); el.position.y = -o.upLen; el.rotation.order = 'YXZ'; sh.add(el);
    part(ctx, el, hang(o.armR * 0.92, o.armR * 0.78, o.foreLen, 6), skin, 0, 0, 0, 1, 1, 1, { ol: 0.012 });
    const hand = part(ctx, el, ico(1), skin, 0, -o.foreLen - 0.015, 0, o.handR, o.handR * 1.05, o.handR * 0.9, { ol: 0.013 });
    arms.push({ sh, el, hand, sd });
  }
  R.arms = arms; R.armL = arms[0]; R.armR = arms[1];
  return R;
}
// total fit: scale to height H and drop the lowest point to y=0
function fitHero(R, Ht) {
  R.fitG.updateMatrixWorld(true);
  let b = new THREE.Box3().setFromObject(R.fitG);
  const s = Ht / (b.max.y - b.min.y);
  R.fitG.scale.setScalar(s); R.fitG.updateMatrixWorld(true);
  b = new THREE.Box3().setFromObject(R.fitG);
  R.fitG.position.y = -b.min.y; R.fitS = s;
  return s;
}
// arm pose lerp including the elbow's z (so waves can bend upward)
function poseArm(a, w, sx, sy, sz, ex = 0, ey = 0, ez = 0) {
  const r = a.sh.rotation, e = a.el.rotation;
  r.x = lerp(r.x, sx, w); r.y = lerp(r.y, sy, w); r.z = lerp(r.z, sz, w);
  e.x = lerp(e.x, ex, w); e.y = lerp(e.y, ey, w); e.z = lerp(e.z, ez, w);
}
function setBlinkH(face, bl, extra = 0) {
  const v = Math.max(bl, extra), shut = v > 0.5;
  for (let i = 0; i < 2; i++) { face.eyeOpen[i].visible = !shut; face.eyeShut[i].visible = shut; face.eyes[i].scale.y = shut ? 1 : Math.max(0.3, 1 - 1.2 * v); }
}
function setMouthH(face, open, wide = 0, base = 0.62) { face.mouth.scale.set(0.9 + wide * 0.3, base + open * 0.9, 1); }
// face: eyes/brows/blush/nose/mouth as painted decals. f: {ex,ey,ew,eh,eyeP,shutP,brow:{col,thick,arch,y,w,h,rot},nose,mouthP,my,mw,mh,blush}
function addHeroFace(ctx, head, H, f) {
  const cy = H.cy, eyes = [], eyeOpen = [], eyeShut = [];
  const mEO = decalMat('eo' + f.id, ctex('eo' + f.id, 128, 128, f.eyeP)), mES = decalMat('es' + f.id, ctex('es' + f.id, 128, 128, f.shutP));
  for (const sd of [-1, 1]) {
    const piv = new THREE.Group(), ex = sd * f.ex, ey = cy + f.ey;
    const z0 = H.surf(ex, ey) + 0.011;
    piv.position.set(ex, ey, z0); head.add(piv);
    const mk = (mat) => { const { g } = patchGeo(H, ex, ey, f.ew, f.eh, { nx: 4, ny: 4, flip: sd < 0, rot: sd * (f.eyeRot || 0) }); const m = new THREE.Mesh(g, mat); m.renderOrder = 4; piv.add(m); return m; };
    eyeOpen.push(mk(mEO)); const sh = mk(mES); sh.visible = false; eyeShut.push(sh); eyes.push(piv);
  }
  if (f.blush) {
    const mB = decalMat('bl' + f.id, ctex('bl' + f.id, 64, 64, (g, W, Hh) => paintBlush(g, W, Hh, f.blush)));
    for (const sd of [-1, 1]) decal(head, H, mB, sd * f.bx, cy + f.by, f.bw, f.bw * 0.7, { ro: 2, rot: sd * 0.15 });
  }
  const b = f.brow;
  const mBr = decalMat('br' + f.id, ctex('br' + f.id, 128, 48, (g, W, Hh) => paintBrow(g, W, Hh, b.col, b.thick, b.arch)));
  for (const sd of [-1, 1]) decal(head, H, mBr, sd * b.x, cy + b.y, b.w, b.h, { ro: 5, nx: 6, ny: 2, flip: sd < 0, rot: sd * b.rot, eps: 0.013 });
  const mN = decalMat('no' + f.id, ctex('no' + f.id, 64, 64, (g, W, Hh) => paintNose(g, W, Hh, f.noseCol)));
  decal(head, H, mN, f.nx || 0, cy + f.ny, 0.06, 0.06, { ro: 2 });
  const mM = decalMat('mo' + f.id, ctex('mo' + f.id, 128, 96, f.mouthP));
  const mouth = new THREE.Group(); const my = cy + f.my; mouth.position.set(f.mx || 0, my, H.surf(f.mx || 0, my) + 0.011); head.add(mouth);
  { const { g } = patchGeo(H, f.mx || 0, my, f.mw, f.mh, { nx: 6, ny: 4 }); const m = new THREE.Mesh(g, mM); m.renderOrder = 4; mouth.add(m); }
  return { eyes, eyeOpen, eyeShut, mouth, d: R_d(H) };
}
const R_d = (H) => ({ cy: H.cy, rx: H.rx, ry: H.ry, rz: H.rz, hs: 1 });

/* ------------------------------------------------------------------ JASMIN */
const JC = { hair: 0x68381e, hair2: 0x8c5430, hairDk: 0x3a1d0f, top: 0xfda3bd, topDk: 0xf27fa3, skirt: 0xfdadc6, pink: 0xff8fb9, white: 0xfffaf4, sole: 0xffb4cf, gold: 0xf4c64e, mic: 0x1b1b24 };
function jasminHairTex() {
  return ctex('jhair', 256, 128, (g, W, H) => {
    g.fillStyle = '#683a20'; g.fillRect(0, 0, W, H);
    const r = rng(11);
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0.0, 'rgba(133,80,45,0.85)'); gr.addColorStop(0.28, 'rgba(133,80,45,0.0)'); gr.addColorStop(0.7, 'rgba(40,18,8,0.0)'); gr.addColorStop(1, 'rgba(40,18,8,0.5)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.lineCap = 'round';
    for (let i = 0; i < 150; i++) {
      const x = r() * W, y0 = r() * H * 0.8, len = 14 + r() * 40, dx = (r() - 0.5) * 6, lt = r() < 0.55;
      g.strokeStyle = lt ? 'rgba(200,126,72,0.55)' : 'rgba(34,15,7,0.45)'; g.lineWidth = lt ? 1.4 : 1.8;
      g.beginPath(); g.moveTo(x, y0); g.quadraticCurveTo(x + dx, y0 + len * 0.5, x + dx * 1.6, y0 + len); g.stroke();
    }
    // glossy halo band
    const hb = g.createLinearGradient(0, H * 0.18, 0, H * 0.42); hb.addColorStop(0, 'rgba(255,214,170,0)'); hb.addColorStop(0.5, 'rgba(255,214,170,0.45)'); hb.addColorStop(1, 'rgba(255,214,170,0)');
    g.fillStyle = hb; g.fillRect(0, H * 0.18, W, H * 0.24);
  });
}
function jasminChestTex() {
  return ctex('jchest', 128, 128, (g, W, H) => {
    g.fillStyle = '#e8ecf6'; g.strokeStyle = '#8a8fa8'; g.lineWidth = 2;
    for (let i = 0; i <= 14; i++) { const u = i / 14, x = W * (0.1 + 0.8 * u), y = H * (0.04 + 0.62 * (1 - Math.pow(Math.abs(u - 0.5) * 2, 1.6))); g.beginPath(); g.arc(x, y, 4.2, 0, 7); g.fill(); g.stroke(); }
    heart(g, W * 0.5, H * 0.82, 15, '#ff4f93', '#8a1c4c', 3);
    ell(g, W * 0.45, H * 0.74, 4, 3, '#ffd0e4');
  });
}
export function makeJasmin() {
  const ctx = makeCtx();
  const R = buildHero(ctx, {
    hip: 0.48, legX: 0.085, legR: 0.054, legColor: SKIN, head: { rx: 0.4, ry: 0.375, rz: 0.372, jaw: 0.22 }, headY: 0.35, shX: 0.17, shY: 0.29, armR: 0.037, upLen: 0.16, foreLen: 0.14, handR: 0.06, earH: 0.1, earW: 0.055,
    leg(piv) {
      part(ctx, piv, hang(0.06, 0.057, 0.12, 6), JC.white, 0, -0.31, 0, 1, 1, 1, { ol: 0.012 });
      part(ctx, piv, hang(0.067, 0.065, 0.035, 6), 0xf1e6ec, 0, -0.31, 0, 1, 1, 1, { ol: 0.01 });
      part(ctx, piv, ico(1), JC.white, 0, -0.43, 0.04, 0.075, 0.046, 0.15, { ol: 0.013 });
      part(ctx, piv, ico(0), 0xffc2da, 0, -0.44, 0.15, 0.05, 0.034, 0.045, { ol: false });
      part(ctx, piv, ico(1), JC.sole, 0, -0.462, 0.04, 0.078, 0.022, 0.155, { ol: false });
    },
  });
  const { head, body, H } = R;
  const { cy, rx, ry, rz } = H;
  // ---- outfit
  part(ctx, body, cyl(0.135, 0.15, 0.34, 12), JC.top, 0, 0.16, 0, 1, 1, 0.88);
  for (const sd of [-1, 1]) part(ctx, body, ico(0), JC.top, sd * 0.158, 0.295, 0, 0.058, 0.052, 0.058, { ol: 0.012 });
  part(ctx, body, cyl(0.15, 0.152, 0.07, 12), JC.topDk, 0, 0.005, 0, 1, 1, 0.88, { ol: 0.012 });
  cylDecal(body, decalMat('jchest', jasminChestTex()), 0.135, 0.88, 0.245, 0.21, 0.21);
  const skirt = new THREE.Group(); body.add(skirt);
  part(ctx, skirt, pleatGeo(0.155, 0.31, 0.2, 10, 0.16), JC.skirt, 0, -0.1, 0, 1, 1, 0.94, { mo: { side: THREE.DoubleSide }, ol: 0.012 });
  part(ctx, skirt, pleatGeo(0.295, 0.31, 0.04, 10, 0.16), 0xffc6d8, 0, -0.18, 0, 1, 1, 0.94, { mo: { side: THREE.DoubleSide }, ol: false });
  // ---- hair: textured crown cap, fringe locks, back mass
  const hm = ctx.mk('jhair', { color: 0xffffff, map: jasminHairTex(), flatShading: false });
  part(ctx, head, cap(16, 7, 1.22), 0, 0, cy + 0.02, -0.03, rx * 1.14, ry * 1.1, rz * 1.12, { mat: hm, hull: true, ol: 0.014, rx: -0.42 });
  const lockMat = ctx.mk('jhairL', { color: 0xffffff, map: jasminHairTex(), flatShading: false });
  part(ctx, head, ico(1), 0, 0, cy - 0.03, -0.1, rx * 0.99, ry * 0.93, rz * 0.84, { mat: lockMat, hull: true, ol: 0.014 });
  const lock = (path, wid, lift, mat) => part(ctx, head, lockGeo(H, path, wid, lift), 0, 0, 0, 0, 1, 1, 1, { mat: mat || lockMat, hull: true, ol: 0.011 });
  lock([[0.02, 0.93], [0.3, 0.88], [0.58, 0.74], [0.8, 0.48], [0.93, 0.15], [0.97, -0.12]], [0.04, 0.13, 0.16, 0.14, 0.1, 0.04], [0.026, 0.034, 0.038, 0.034, 0.028, 0.02]);
  lock([[0.04, 0.93], [-0.24, 0.88], [-0.52, 0.74], [-0.76, 0.54], [-0.92, 0.28], [-0.96, 0.05]], [0.05, 0.14, 0.15, 0.12, 0.08, 0.035], [0.026, 0.032, 0.034, 0.03, 0.024, 0.018]);
  lock([[0.05, 0.94], [0.24, 0.86], [0.5, 0.64], [0.7, 0.36]], [0.03, 0.08, 0.08, 0.03], [0.036, 0.044, 0.044, 0.03]);
  // hair clips (pink ovals)
  const c1y = cy + ry * 0.56, c1x = -0.29;
  part(ctx, head, ico(0), JC.pink, c1x, c1y, H.surf(c1x, c1y) + 0.015, 0.05, 0.125, 0.03, { rz: 0.3, rx: -0.2, ry: -0.7, ol: 0.01 });
  // ponytail
  const tail = new THREE.Group(); tail.position.set(-0.2, cy + ry * 0.97, -0.07); head.add(tail);
  part(ctx, tail, ico(0), JC.pink, 0, 0.03, 0.0, 0.125, 0.05, 0.075, { rz: -0.5, ol: 0.011 }); // clip on the ponytail base
  part(ctx, tail, ico(1), JC.hair, 0.0, 0.04, 0, 0.085, 0.1, 0.075, { rz: 0.35 });
  // ponytail: three lofted tube segments sharing one width profile (rooted narrow at the clip, full in the middle, flicked tip)
  const LT = 0.98, prof = (t) => (t < 0.12 ? 0.05 + t / 0.12 * 0.045 : t < 0.3 ? 0.095 + (t - 0.12) / 0.18 * 0.05 : t < 0.55 ? 0.145 : t < 0.8 ? 0.145 - (t - 0.55) / 0.25 * 0.045 : 0.1 - (t - 0.8) / 0.2 * 0.095);
  const mkSeg = (parent, y, t0, t1, col) => {
    const g = new THREE.Group(); g.position.y = y; parent.add(g);
    const rings = [];
    for (let i = 0; i <= 2; i++) { const t = t0 + (t1 - t0) * (i / 2), w = prof(t); rings.push([-(t - t0) * LT, w * 1.3, w * 0.8, 0]); }
    part(ctx, g, tubeGeo(rings), col, 0, 0, 0, 1, 1, 1, { ol: 0.012 });
    const hw = prof((t0 + t1) / 2);
    part(ctx, g, ico(0), JC.hair2, hw * 0.45, -(t1 - t0) * LT * 0.5, hw * 0.55, hw * 0.3, (t1 - t0) * LT * 0.42, hw * 0.25, { ol: false });
    part(ctx, g, ico(0), JC.hairDk, -hw * 0.5, -(t1 - t0) * LT * 0.55, hw * 0.5, hw * 0.25, (t1 - t0) * LT * 0.4, hw * 0.22, { ol: false });
    return g;
  };
  const t1 = mkSeg(tail, 0, 0, 0.36, JC.hair), t2 = mkSeg(t1, -0.36 * LT, 0.36, 0.68, JC.hair), t3 = mkSeg(t2, -0.32 * LT, 0.68, 1.0, JC.hair);
  // earrings (gold hoops)
  for (const sd of [-1, 1]) part(ctx, head, torus(0.042, 0.009, 3, 10), JC.gold, sd * (rx * 0.985 + 0.018), cy - 0.17, 0.02, 1, 1, 1, { ol: false, ry: sd * 0.5 });
  // ---- face
  R.face = addHeroFace(ctx, head, H, {
    id: 'J', eyeP: paintEyeJ, shutP: paintEyeShutJ, ex: 0.204, ey: -0.045, ew: 0.215, eh: 0.215, blush: '#ff7fa4', bx: 0.235, by: -0.17, bw: 0.17,
    brow: { col: '#7a4a30', thick: 6, arch: 0.3, x: 0.2, y: 0.185, w: 0.17, h: 0.09, rot: 0.06 }, noseCol: '#d9877a', ny: -0.135,
    mouthP: paintMouthJ, my: -0.232, mw: 0.2, mh: 0.14,
  });
  // ---- microphone in the -x hand
  const mic = new THREE.Group(); R.armR.el.add(mic);
  part(ctx, mic, hang(0.026, 0.021, 0.2, 6), JC.mic, 0, -0.1, 0, 1, 1, 1, { ol: 0.01 });
  part(ctx, mic, ico(1), JC.mic, 0, -0.32, 0, 0.056, 0.06, 0.056, { ol: 0.012 });
  part(ctx, mic, ico(0), 0x70708a, 0, -0.345, 0.035, 0.022, 0.016, 0.014, { ol: false });
  part(ctx, mic, torus(0.027, 0.012, 3, 7), 0xff5fa5, 0, -0.1, 0, 1, 1, 1, { rx: Math.PI / 2, ol: 0.007 });
  fitHero(R, 1.7);

  const noteG = new THREE.Group(); R.fitG.add(noteG);
  const noteCols = [0xffd84d, 0xff7eb6, 0x9af0b4, 0x8fe3f0];
  const notes = [];
  for (let i = 0; i < 4; i++) {
    const n = new THREE.Group(); const m = basic(noteCols[i]);
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
      const beat = Math.sin(t * Math.PI * 4), hit = Math.abs(Math.sin(t * Math.PI * 2));
      const A = L.atkEnv, idleW = Math.sin(t * 3.2);
      // base pose (as drawn): mic hand up by the chin, free hand waving out to the side
      poseArm(R.armR, 1, -0.65 - S.s * 0.1 * amp, -0.1, -0.3, -1.9, 0, 0);
      poseArm(R.armL, 1, -0.1 + S.s * 0.5 * amp, 0, -0.8, -0.15, 0, -(0.95 + idleW * 0.2 * (1 - sg)));
      poseArm(R.armR, sg, -0.8 + beat * 0.05, -0.1, -0.25, -1.95);
      poseArm(R.armL, sg, -0.25 + beat * 0.15, -0.2, -0.95, -0.35, 0, -(0.5 + beat * 0.12));
      R.head.rotation.x += sg * (-0.1 + beat * 0.05);
      R.head.rotation.z += sg * Math.sin(t * Math.PI * 2) * 0.07;
      R.root.position.y += sg * hit * 0.035;
      R.body.rotation.x += sg * -0.05;
      R.body.rotation.z = sg * Math.sin(t * Math.PI * 2) * 0.04;
      if (A > 0) {
        poseArm(R.armR, A, -1.55, 0, -0.1, -0.2);
        poseArm(R.armL, A, 0.6, 0, -0.6, -0.4);
        R.body.rotation.x += A * 0.28;
        R.head.rotation.x += A * -0.12;
        R.root.position.z = A * 0.28;
      } else R.root.position.z = 0;
      const vowel = 0.72 + 0.28 * Math.sin(t * 3.1);
      const open = Math.max(sg * (0.5 + 0.5 * beat) * vowel, A * 0.9);
      setMouthH(R.face, open * 0.75, A * 0.5, 1.0);
      setBlinkH(R.face, S.blink, sg * 0.55 * (0.5 + 0.5 * Math.sin(t * 0.8)) * (sg > 0.7 ? 1 : 0));
      skirt.scale.set(1 + 0.06 * amp * Math.abs(S.s) + sg * hit * 0.03, 1, 1 + 0.06 * amp * Math.abs(S.s) + sg * hit * 0.03);
      skirt.rotation.set(-0.05 * amp + Math.sin(ph * 2 - 0.5) * 0.04 * amp, 0, S.s * 0.09 * amp + Math.sin(t * 1.4) * 0.01);
      const idle = Math.sin(t * 1.7), side = Math.sin(ph - 0.6);
      tail.rotation.set(0.0 + 0.1 * amp + sg * (0.12 + 0.18 * beat) + A * 0.4 + idle * 0.05 + Math.sin(ph * 2) * 0.12 * amp, 0, -0.95 + side * 0.18 * amp + sg * Math.sin(t * Math.PI * 2 - 0.4) * 0.15);
      t1.rotation.set(-0.06 + Math.sin(ph * 2 - 0.9) * 0.2 * amp + Math.sin(t * 1.7 - 0.8) * 0.05 + sg * beat * 0.1, 0, 0.48 + Math.sin(ph - 1.2) * 0.22 * amp);
      t2.rotation.set(-0.1 + Math.sin(ph * 2 - 1.8) * 0.26 * amp + Math.sin(t * 1.7 - 1.6) * 0.07 + sg * beat * 0.14, 0, 0.36 + Math.sin(ph - 1.8) * 0.28 * amp);
      t3.rotation.set(-0.1 + Math.sin(ph * 2 - 2.4) * 0.3 * amp + sg * beat * 0.16, 0, -0.3 + Math.sin(ph - 2.4) * 0.3 * amp);
      for (let i = 0; i < 4; i++) {
        const n = notes[i];
        if (!n.on) {
          if (sg > 0.3) { n.wait -= dt; if (n.wait <= 0) { n.on = true; n.life = 0; n.vx = (Math.random() - 0.5) * 0.7; n.vy = 0.5 + Math.random() * 0.3; n.x = 0.12; n.y = 1.25; n.z = 0.45; } }
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
const RC = { hair: 0x3d2316, hair2: 0x5c3320, hairDk: 0x24120a, tee: 0x463a32, teeDk: 0x2c241f, pants: 0x7da02e, pantsDk: 0x517318, shoe: 0xc4e43a, sole: 0xf6fbbd };
function roxorHeadTex() {
  return ctex('rhead', 512, 256, (g, W, H) => {
    const im = g.createImageData(W, H), d = im.data, r = rng(5);
    const sk = [255, 201, 166], st = [150, 108, 86];
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const phi = (px / W) * Math.PI * 2, th = (py / H) * Math.PI;
      const x = -Math.cos(phi) * Math.sin(th), y = Math.cos(th), z = Math.sin(phi) * Math.sin(th);
      const xb = 0.3 + (0.75 - y) * 0.5, ymin = z < -0.15 ? -0.5 : -0.2;
      const stub = y > ymin && (Math.abs(x) > xb || z < -0.25) && (y > 0.0 || Math.abs(x) > 0.5 || z < 0);
      const edge = stub && z > -0.2 && y < 0.75 && Math.abs(x) - xb < 0.03;
      const n = stub ? (r() < 0.25 ? -10 : 0) : 0, c = edge ? [128, 88, 68] : stub ? st : sk, i = (py * W + px) * 4;
      d[i] = c[0] + n; d[i + 1] = c[1] + n; d[i + 2] = c[2] + n; d[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  });
}
function roxorChestTex() {
  return ctex('rchest', 128, 128, (g, W, H) => {
    ell(g, W / 2, H / 2, 54, 54, '#f7a928'); g.lineWidth = 5; g.strokeStyle = '#d9770f'; g.stroke();
    ell(g, W / 2 - 4, H / 2 - 6, 40, 38, '#ffbc3d');
    ell(g, W * 0.37, H * 0.4, 6, 9, '#8a4a10'); ell(g, W * 0.63, H * 0.4, 6, 9, '#8a4a10');
    g.lineWidth = 6; g.lineCap = 'round'; g.strokeStyle = '#a85a10'; g.beginPath(); g.arc(W / 2, H * 0.47, 28, 0.25, Math.PI - 0.25); g.stroke();
  });
}
export function makeRoxor() {
  const ctx = makeCtx();
  const WOOD = 0xc99060, YEL = 0xffd84d, CREAM = 0xfff4e6;
  const headMat = ctx.mk('rhead', { color: 0xffffff, map: roxorHeadTex(), flatShading: false });
  const R = buildHero(ctx, {
    hip: 0.42, legX: 0.115, legR: 0.1, legColor: RC.pants, head: { rx: 0.35, ry: 0.32, rz: 0.335, jaw: 0.3 }, headY: 0.35, shX: 0.235, shY: 0.28, armR: 0.044, upLen: 0.15, foreLen: 0.14, handR: 0.057, headMat, earH: 0.085,
    sleeve: { col: RC.tee, len: 0.1 },
    leg(piv) {
      part(ctx, piv, hang(0.08, 0.09, 0.07, 6), RC.pantsDk, 0, -0.29, 0, 1, 1, 1, { ol: 0.012 });
      part(ctx, piv, box(0.02, 0.22, 0.07), RC.pantsDk, 0.055, -0.15, 0.05, 1, 1, 1, { ol: false, rz: 0.08 });
      part(ctx, piv, box(0.02, 0.16, 0.07), RC.pantsDk, -0.01, -0.12, 0.085, 1, 1, 1, { ol: false, rz: 0.02 });
      part(ctx, piv, box(0.02, 0.1, 0.07), RC.pantsDk, -0.06, -0.2, 0.05, 1, 1, 1, { ol: false, rz: -0.1 });
      part(ctx, piv, box(0.016, 0.14, 0.05), RC.pantsDk, -0.04, -0.1, 0.05, 1, 1, 1, { ol: false, rz: -0.05 });
      part(ctx, piv, ico(1), RC.shoe, 0, -0.375, 0.05, 0.095, 0.058, 0.18, { ol: 0.013 });
      part(ctx, piv, ico(0), 0xa9c92c, 0, -0.36, 0.16, 0.055, 0.03, 0.07, { ol: false });
      part(ctx, piv, ico(1), RC.sole, 0, -0.41, 0.05, 0.1, 0.024, 0.19, { ol: 0.007 });
    },
  });
  const { head, body, H } = R;
  const { cy, rx, ry, rz } = H;
  part(ctx, body, cyl(0.19, 0.165, 0.1, 12), RC.pants, 0, -0.03, 0, 1, 1, 0.9, { ol: 0.012 });
  part(ctx, body, cyl(0.175, 0.195, 0.35, 12), RC.tee, 0, 0.16, 0, 1, 1, 0.86);
  part(ctx, body, cyl(0.062, 0.07, 0.1, 8), SKIN, 0, 0.35, 0, 1, 1, 1, { ol: 0.012 });
  part(ctx, body, cyl(0.105, 0.14, 0.04, 12), RC.teeDk, 0, 0.325, 0, 1, 1, 0.9, { ol: 0.012 });
  cylDecal(body, decalMat('rchest', roxorChestTex()), 0.185, 0.86, 0.18, 0.22, 0.22);
  // ---- mohawk crest: dark base mass + a fan of tall curled flame locks
  const hm2 = ctx.mk('rhairM', { color: RC.hair, flatShading: false });
  part(ctx, head, ico(1), 0, 0, cy + ry * 0.86, -0.04, rx * 0.72, ry * 0.34, rz * 0.98, { mat: hm2, hull: true, ol: 0.014, rx: -0.12 });
  part(ctx, head, ico(0), RC.hairDk, 0, cy + ry * 0.55, -rz * 0.55, rx * 0.5, ry * 0.4, rz * 0.45, { ol: false });
  // curled tips of the quiff: [xn, zn, lean, tilt, len, width, light]
  const fl = [
    [-0.4, 0.2, -0.7, 0.15, 0.46, 0.2, 0], [-0.17, 0.14, -0.3, 0.05, 0.58, 0.22, 1], [0.05, 0.1, 0.0, -0.05, 0.64, 0.23, 0], [0.26, 0.06, 0.4, -0.12, 0.56, 0.22, 1], [0.46, 0.0, 0.85, -0.15, 0.42, 0.19, 0],
    [-0.1, -0.3, -0.15, -0.6, 0.5, 0.21, 1], [0.2, -0.32, 0.35, -0.6, 0.44, 0.2, 0],
  ];
  for (const f of fl) {
    const bx = f[0] * rx, bz = f[1] * rz, by = cy + ry * Math.sqrt(Math.max(0.05, 1 - f[0] * f[0] - f[1] * f[1])) - 0.03;
    part(ctx, head, flameGeo(f[4] * 0.72, f[5] * 1.05, 0.14, -0.45), f[6] ? RC.hair2 : RC.hair, bx, by, bz, 1, 1, 1, { rz: -f[2], rx: f[3], ol: 0.012 });
  }
  // nape tail of wavy hair (viewer's left)
  for (let i = 0; i < 3; i++) blade(ctx, head, i % 2 ? RC.hair2 : RC.hair, -0.12 - i * 0.07, cy - 0.12, -rz * 0.8, -0.22 - i * 0.1, cy - 0.34 - (i % 2) * 0.05, -rz * 0.86, 0.06, 0.04);
  // stud earring
  part(ctx, head, ico(0), 0xe8e8f0, -(rx * 0.985 + 0.014), cy - 0.12, 0.02, 0.018, 0.018, 0.018, { ol: 0.006 });
  R.face = addHeroFace(ctx, head, H, {
    id: 'R', eyeP: paintEyeR, shutP: paintEyeShutR, ex: 0.16, ey: -0.035, ew: 0.17, eh: 0.15, blush: '#ff9fb0', bx: 0.2, by: -0.13, bw: 0.1,
    brow: { col: '#5a3220', thick: 11, arch: 0.28, x: 0.158, y: 0.15, w: 0.17, h: 0.1, rot: -0.04 }, noseCol: '#cf8a74', ny: -0.1,
    mouthP: paintMouthR, my: -0.175, mx: 0.02, mw: 0.15, mh: 0.092,
  });
  // microphone in the +x hand (viewer's right, as drawn)
  const mic = new THREE.Group(); R.armR.el.add(mic);
  part(ctx, mic, hang(0.024, 0.02, 0.2, 6), 0x1b1b24, 0, -0.1, 0, 1, 1, 1, { ol: 0.01 });
  part(ctx, mic, ico(1), 0x1b1b24, 0, -0.31, 0, 0.052, 0.056, 0.052, { ol: 0.011 });
  part(ctx, mic, torus(0.025, 0.011, 3, 7), 0x76d04a, 0, -0.1, 0, 1, 1, 1, { rx: Math.PI / 2, ol: 0.007 });
  // pointing finger on the -x hand
  part(ctx, R.armL.el, hang(0.017, 0.011, 0.1, 5), SKIN, -0.004, -0.2, 0.02, 1, 1, 1, { ol: 0.009 });
  part(ctx, R.armL.el, ico(0), SKIN, 0.045, -0.19, 0.02, 0.022, 0.03, 0.02, { ol: 0.008 });
  // ---- carry rack (unchanged)
  const rack = new THREE.Group(); body.add(rack);
  part(ctx, rack, box(0.4, 0.5, 0.05), WOOD, 0, 0.14, -0.17, 1, 1, 1, { ol: false });
  part(ctx, rack, box(0.5, 0.05, 0.6), WOOD, 0, -0.1, -0.47, 1, 1, 1, { ol: 0.012 });
  for (const sd of [-1, 1]) {
    part(ctx, rack, box(0.045, 0.045, 0.34), 0xa8703f, sd * 0.17, 0.02, -0.34, 1, 1, 1, { ol: false });
    part(ctx, rack, box(0.045, 0.62, 0.045), 0xa8703f, sd * 0.25, 0.2, -0.72, 1, 1, 1, { ol: false });
  }
  part(ctx, rack, box(0.5, 0.05, 0.05), 0xa8703f, 0, 0.45, -0.72, 1, 1, 1, { ol: false });
  for (const sd of [-1, 1]) {
    part(ctx, rack, box(0.05, 0.4, 0.02), CREAM, sd * 0.085, 0.16, 0.128, 1, 1, 1, { rz: sd * -0.06, ol: false });
    part(ctx, rack, box(0.05, 0.03, 0.34), CREAM, sd * 0.1, 0.34, -0.02, 1, 1, 1, { ol: false });
  }
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
    if (i % 3 === 1) {
      part(ctx, piv, dome(), c, 0, -0.07, 0, 0.125, 0.125, 0.125, { ol: 0.012 });
      part(ctx, piv, hang(0.13, 0.13, 0.03, 6), 0xfff4e6, 0, -0.07, 0, 1, 1, 1, { ol: false });
      part(ctx, piv, box(0.025, 0.04, 0.19), YEL, 0, 0.06, 0, 1, 1, 1, { ol: false });
    } else {
      part(ctx, piv, box(0.21, 0.185, 0.21), c, 0, 0, 0, 1, 1, 1, { ol: 0.013 });
    }
    piv.scale.setScalar(0.0001);
    items.push({ piv, s: 0, v: 0 });
  }
  fitHero(R, 1.8);
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
      const beat = Math.sin(t * Math.PI * 4), hit = Math.abs(Math.sin(t * Math.PI * 2));
      // base pose (as drawn): mic hand at the chest (+x), free arm pointing out (-x)
      poseArm(R.armR, 1, -0.4 - S.s * 0.08 * amp, -0.1, -0.25, -1.95, 0, 0);
      poseArm(R.armL, 1, -0.3 + S.s * 0.4 * amp, 0, -0.85, -0.3, 0, -(0.9 + Math.sin(t * 1.9) * 0.06));
      // carrying: hands hold the shoulder straps
      poseArm(R.armL, cw * 0.85, -0.55 + S.s * 0.08 * amp, 0.35, -0.12, -1.65);
      poseArm(R.armR, cw * 0.85, -0.55 - S.s * 0.08 * amp, -0.35, 0.12, -1.65);
      R.body.rotation.x += cw * (0.07 + 0.03 * Math.min(carryT, 12) / 12);
      R.root.position.y -= cw * 0.01 * Math.min(carryT, 12) / 12;
      // singing: mic up to the mouth + fist-pump
      poseArm(R.armR, sg * (1 - cw), -0.8, -0.1, -0.2, -2.0);
      poseArm(R.armL, sg * (1 - cw), -0.5 + beat * 0.15, 0, -1.0, -0.35, 0, -(0.9 + beat * 0.1));
      R.head.rotation.x += sg * (-0.08 + beat * 0.05);
      R.root.position.y += sg * hit * 0.03;
      if (A > 0) {
        poseArm(R.armR, A, -1.6, 0, 0.05, -0.05);
        poseArm(R.armL, A, 0.5, 0, -0.5, -0.5);
        R.body.rotation.x += A * 0.25;
        R.root.position.z = A * 0.28;
      } else R.root.position.z = 0;
      setMouthH(R.face, Math.max(A * 0.9, sg * (0.4 + 0.4 * beat)) * 0.8, 0.1 + A * 0.4, 0.8);
      setBlinkH(R.face, S.blink);
      rack.visible = cw > 0.03 || carryT > 0;
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

// ---- shared building blocks for other modules (foes, heroes in the game view). Same pattern as makeKappa / makeOni below. ----
export const CK = { clamp, lerp, damp, ease, rng, makeCtx, part, flat, aim, addFace, makeLife, lifeXform, creatureBase, creatureStub, newState, fit, setBlink, setMouth,
  ico, box, cyl, hang, cone, torus, cap, dome, geo, inkMat, eyeMat, whiteMat, mouthMat, tongueMat, basic, outlineGeo };
