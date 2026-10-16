// Voxel creatures and people: every body part is a box, shaded per face, posed with joint pivots.
import * as THREE from 'three';
import { ITEMS, MOBS, BLOCKS } from '../../shared/data.js';
import { itemIcon, SKINS, HAIRS, SHIRTS, PANTS } from '../art.js';

const FACE_SHADE = [0.84, 0.84, 1.08, 0.5, 0.96, 0.74]; // +x -x +y -y +z -z
const geoCache = new Map();
function boxGeo(w, h, d, anchor = 'center') {
  const key = `${w}|${h}|${d}|${anchor}`;
  let g = geoCache.get(key);
  if (g) return g;
  g = new THREE.BoxGeometry(w, h, d);
  if (anchor === 'bottom') g.translate(0, h / 2, 0); else if (anchor === 'top') g.translate(0, -h / 2, 0);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = (f * 4 + v) * 3; col[i] = col[i + 1] = col[i + 2] = FACE_SHADE[f]; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geoCache.set(key, g);
  return g;
}

// every mesh asks its owner for the current light tint just before it is drawn
export function tintable(mesh, tintRef) {
  mesh.userData.tint = tintRef;
  mesh.onBeforeRender = function onBefore(r, sc, cam, g, mat) { mat.color.copy(this.userData.noTint ? WHITE : this.userData.tint.value); mat.uniformsNeedUpdate = true; };
  return mesh;
}
const WHITE = new THREE.Color(1, 1, 1);
const matCache = new Map();
function mat(color, extra = {}) {
  const key = color + JSON.stringify(extra.key || '');
  let m = matCache.get(key);
  if (!m) { m = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, map: extra.map || null, transparent: !!extra.transparent, alphaTest: extra.alphaTest || 0 }); m.userData.base = new THREE.Color(color); matCache.set(key, m); }
  return m;
}
// materials are shared, so the base colour is baked into a vertex colour copy instead of the material
function part(w, h, d, hex, tintRef, anchor = 'center', opts = {}) {
  const base = boxGeo(w, h, d, anchor);
  let geo = base;
  const c = new THREE.Color(hex);
  geo = base.clone();
  const col = geo.attributes.color; const a = base.attributes.color.array;
  for (let i = 0; i < col.count; i++) col.setXYZ(i, a[i * 3] * c.r, a[i * 3 + 1] * c.g, a[i * 3 + 2] * c.b);
  const m = new THREE.Mesh(geo, opts.material || mat('#fff', { key: 'plain' }));
  tintable(m, tintRef);
  if (opts.noTint) m.userData.noTint = true;
  return m;
}
export function newTint() { return { value: new THREE.Color(1, 1, 1) }; }

// ---------------------------------------------------------------- face texture
const faceCache = new Map();
function faceTexture(look, blink, hurt) {
  const key = [look.skin, look.eyes, blink ? 1 : 0, hurt ? 1 : 0].join('|');
  let t = faceCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const skin = SKINS[look.skin % SKINS.length] || '#ffd9b5';
  g.fillStyle = skin; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(4, 4, 18, 8);
  g.fillStyle = 'rgba(255,110,110,0.30)'; g.beginPath(); g.arc(14, 42, 6, 0, 7); g.arc(50, 42, 6, 0, 7); g.fill();
  const iris = ['#2a2a30', '#2a62c8', '#2a9a4a', '#8a4a1a', '#8a2ac8'][look.eyes % 5];
  for (const ex of [20, 44]) {
    if (blink) { g.strokeStyle = '#222'; g.lineWidth = 3; g.beginPath(); g.moveTo(ex - 7, 30); g.lineTo(ex + 7, 30); g.stroke(); }
    else {
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(ex, 30, 8, 10, 0, 0, 7); g.fill(); g.strokeStyle = '#222'; g.lineWidth = 2; g.stroke();
      g.fillStyle = iris; g.beginPath(); g.arc(ex + 2, 31, 5, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillRect(ex, 27, 3, 3);
    }
    g.strokeStyle = 'rgba(50,30,20,0.8)'; g.lineWidth = 3; g.beginPath(); g.moveTo(ex - 8, 17); g.lineTo(ex + 8, 15); g.stroke();
  }
  g.fillStyle = 'rgba(190,120,90,0.7)'; g.fillRect(30, 36, 5, 6);
  g.strokeStyle = '#7a2a2a'; g.lineWidth = 3; g.beginPath();
  if (hurt) g.arc(32, 55, 6, Math.PI, 0); else g.arc(32, 46, 9, 0.25, Math.PI - 0.25);
  g.stroke();
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  faceCache.set(key, t);
  return t;
}
const faceMat = new Map();
function headMaterials(look, blink, hurt) {
  const key = [look.skin, look.eyes, blink ? 1 : 0, hurt ? 1 : 0].join('|');
  let m = faceMat.get(key);
  if (!m) {
    const plain = mat('#fff', { key: 'plain' });
    const face = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, map: faceTexture(look, blink, hurt) });
    m = [plain, plain, plain, plain, face, plain];
    faceMat.set(key, m);
  }
  return m;
}

const ARMOR_COL = { leather: '#a5723c', copper: '#e08a4a', iron: '#dfe3ea', gold: '#ffd84a', titanium: '#b9a6ff' };
const armorColor = (id) => { const n = ITEMS[id] ? ITEMS[id].name : ''; const m = /^(leather|copper|iron|gold|titanium)_/.exec(n); return m ? ARMOR_COL[m[1]] : null; };

// ---------------------------------------------------------------- items held or dropped
const iconTex = new Map();
export function iconTexture(id) {
  let t = iconTex.get(id);
  if (!t) { t = new THREE.CanvasTexture(itemIcon(id)); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; iconTex.set(id, t); }
  return t;
}
const iconMat = new Map();
function iconMaterial(id) {
  let m = iconMat.get(id);
  if (!m) { m = new THREE.MeshBasicMaterial({ map: iconTexture(id), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, vertexColors: false }); iconMat.set(id, m); }
  return m;
}
// a flat icon with real thickness: a few stacked layers, edge layers darker
export function itemModel(id, size, tintRef, atlas) {
  const grp = new THREE.Group();
  const def = ITEMS[id];
  if (def && def.place && atlas && !(BLOCKS[def.place].plant || BLOCKS[def.place].station)) {
    const geo = new THREE.BoxGeometry(size, size, size);
    const uv = atlas.tile(def.place, 0), a = geo.attributes.uv;
    for (let f = 0; f < 6; f++) { const q = [[uv[0], uv[3]], [uv[2], uv[3]], [uv[0], uv[1]], [uv[2], uv[1]]]; for (let v = 0; v < 4; v++) a.setXY(f * 4 + v, q[v][0], q[v][1]); }
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: atlas.texture, vertexColors: false })); tintable(m, tintRef);
    grp.add(m);
    return grp;
  }
  const layers = 5;
  for (let i = 0; i < layers; i++) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(size, size), iconMaterial(id));
    q.position.z = (i - (layers - 1) / 2) * size * 0.05;
    q.userData.tint = tintRef; q.userData.noTint = true; // icon layers stay readable
    grp.add(q);
  }
  return grp;
}

// ---------------------------------------------------------------- the blockhead
export function buildPerson(look, tint, atlas) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const skin = SKINS[look.skin % SKINS.length], hair = HAIRS[look.hair % HAIRS.length];
  const shirt = SHIRTS[look.shirt % SHIRTS.length], pants = PANTS[look.pants % PANTS.length];
  const mk = (w, h, d, c, anchor) => part(w, h, d, c, tint, anchor);
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-0.14, 0.58, 0); legR.position.set(0.14, 0.58, 0);
  for (const l of [legL, legR]) { l.add(mk(0.25, 0.58, 0.3, pants, 'top')); const boot = mk(0.27, 0.14, 0.34, '#3a2a22'); boot.position.set(0, -0.54, 0.02); l.add(boot); l.userData.boot = boot; body.add(l); }
  const torso = mk(0.56, 0.58, 0.34, shirt); torso.position.set(0, 0.87, 0); body.add(torso);
  const belt = mk(0.58, 0.08, 0.36, '#2a2220'); belt.position.set(0, 0.62, 0); body.add(belt);
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-0.37, 1.12, 0); armR.position.set(0.37, 1.12, 0);
  for (const a of [armL, armR]) { a.add(mk(0.18, 0.56, 0.22, shirt, 'top')); const hand = mk(0.17, 0.14, 0.21, skin); hand.position.set(0, -0.52, 0); a.add(hand); body.add(a); }
  const head = new THREE.Group(); head.position.set(0, 1.16, 0); body.add(head);
  const headMesh = new THREE.Mesh(boxGeo(0.74, 0.74, 0.74, 'bottom').clone(), headMaterials(look, false, false));
  { const c = new THREE.Color(skin), col = headMesh.geometry.attributes.color, a = boxGeo(0.74, 0.74, 0.74, 'bottom').attributes.color.array; for (let i = 0; i < col.count; i++) col.setXYZ(i, a[i * 3] * c.r, a[i * 3 + 1] * c.g, a[i * 3 + 2] * c.b); }
  // the face material is white-based: skin tint lives in vertex colours for the other faces, so the face face gets plain shade
  tintable(headMesh, tint); head.add(headMesh);
  { const col = headMesh.geometry.attributes.color; for (let v = 0; v < 4; v++) { const i = 4 * 4 + v; col.setXYZ(i, 0.96, 0.96, 0.96); } }
  const hs = look.hairStyle % 6, hp = (w, h, d, x, y, z) => { const m = mk(w, h, d, hair); m.position.set(x, y, z); head.add(m); return m; };
  if (hs === 1) { hp(0.8, 0.2, 0.8, 0, 0.78, 0); hp(0.8, 0.5, 0.16, 0, 0.5, -0.33); hp(0.16, 0.34, 0.6, -0.33, 0.55, 0); hp(0.16, 0.34, 0.6, 0.33, 0.55, 0); }
  else if (hs === 2) { hp(0.78, 0.12, 0.78, 0, 0.78, 0); for (let i = 0; i < 5; i++) hp(0.12, 0.24 + (i % 2) * 0.1, 0.12, -0.3 + i * 0.15, 0.95 + (i % 2) * 0.05, ((i * 7) % 3 - 1) * 0.18); hp(0.8, 0.4, 0.14, 0, 0.55, -0.34); }
  else if (hs === 3) { hp(0.8, 0.2, 0.8, 0, 0.78, 0); hp(0.82, 0.8, 0.16, 0, 0.35, -0.34); hp(0.14, 0.7, 0.5, -0.38, 0.4, -0.05); hp(0.14, 0.7, 0.5, 0.38, 0.4, -0.05); }
  else if (hs === 4) { hp(0.16, 0.3, 0.7, 0, 0.9, 0); hp(0.16, 0.18, 0.2, 0, 0.8, 0.32); }
  else if (hs === 5) { hp(0.8, 0.16, 0.8, 0, 0.78, 0); hp(0.6, 0.18, 0.1, 0, 0.12, 0.37); hp(0.4, 0.1, 0.08, 0, 0.3, 0.39); }
  // armor and gear get added/removed by setArmor
  const gear = new THREE.Group(); body.add(gear);
  const handHold = new THREE.Group(); handHold.position.set(0, -0.52, 0.12); armR.add(handHold);
  const rec = { root, body, legL, legR, armL, armR, head, headMesh, gear, handHold, look, tint, atlas, armorKey: '', heldId: -1, blink: false, hurt: false, yaw: 0, t: 0 };
  return rec;
}

export function setArmor(rec, armor) {
  const key = armor.join(',');
  if (key === rec.armorKey) return;
  rec.armorKey = key;
  while (rec.gear.children.length) rec.gear.remove(rec.gear.children[0]);
  const [h, c, f] = armor;
  const ac = armorColor(h);
  if (ac) { const m = part(0.82, 0.3, 0.82, ac, rec.tint); m.position.set(0, 1.16 + 0.55, 0); const brim = part(0.86, 0.08, 0.86, ac, rec.tint); brim.position.set(0, 1.16 + 0.32, 0); const v = part(0.5, 0.1, 0.06, '#222', rec.tint); v.position.set(0, 1.16 + 0.42, 0.42); rec.gear.add(m, brim, v); }
  const cc = armorColor(c);
  if (cc) { const m = part(0.62, 0.62, 0.4, cc, rec.tint); m.position.set(0, 0.87, 0); const sl = part(0.24, 0.2, 0.28, cc, rec.tint); sl.position.set(-0.37, 1.2, 0); const sr = sl.clone(); sr.position.x = 0.37; rec.gear.add(m, sl, sr); }
  const fc = armorColor(f);
  rec.legL.userData.boot.material = rec.legR.userData.boot.material = mat('#fff', { key: 'plain' });
  if (fc) { for (const l of [rec.legL, rec.legR]) { const b = part(0.3, 0.24, 0.38, fc, rec.tint); b.position.set(0, -0.46, 0.02); b.userData.armor = true; l.add(b); } }
  else for (const l of [rec.legL, rec.legR]) for (const ch of [...l.children]) if (ch.userData.armor) l.remove(ch);
}
export function setHeld(rec, id) {
  if (rec.heldId === id) return;
  rec.heldId = id;
  while (rec.handHold.children.length) rec.handHold.remove(rec.handHold.children[0]);
  if (!id) return;
  const def = ITEMS[id];
  const tool = def && (def.tool || def.name === 'bow');
  const m = itemModel(id, tool ? 0.85 : 0.5, rec.tint, rec.atlas);
  if (tool) { m.rotation.z = -0.8; m.position.set(0.12, -0.12, 0.1); } else m.position.set(0, -0.05, 0.12);
  rec.handHold.add(m);
}

// st: {dir, t, speed, air, climb, swing 0..1, dead, hurt, blink, wet, idleT}
export function poseCharacter(rec, st, dt) {
  const moving = st.speed > 0.05;
  const target = (st.dir >= 0 ? 1 : -1) * (moving || st.air || st.climb ? Math.PI / 2 - 0.22 : Math.PI / 2 - 0.85);
  const cl = st.climb ? 0 : target;
  rec.yaw += (cl - rec.yaw) * Math.min(1, dt * 12);
  rec.root.rotation.y = rec.yaw;
  const sw = Math.sin(st.t) * st.speed;
  const bob = st.air ? 0 : Math.abs(Math.sin(st.t)) * st.speed * 0.06;
  rec.body.position.y = bob;
  const legA = st.climb ? Math.sin(st.t * 1.4) * 0.7 : st.air ? 0.55 : sw * 0.85;
  rec.legL.rotation.x = legA; rec.legR.rotation.x = -legA;
  rec.armL.rotation.x = st.air ? -2.5 : -sw * 0.8;
  let ra = sw * 0.8;
  if (st.climb) ra = Math.sin(st.t * 1.4 + 1.5) * 0.9 - 2.5; else if (st.swing > 0) ra = -1.1 - Math.sin((1 - st.swing) * Math.PI) * 1.7; else if (st.air) ra = -2.4;
  rec.armR.rotation.x = ra;
  if (st.climb) rec.armL.rotation.x = Math.sin(st.t * 1.4) * 0.9 - 2.5;
  rec.armL.rotation.z = rec.armR.rotation.z = 0;
  if (!moving && !st.air && !st.swing && !st.climb) { const b = Math.sin(st.t2 || 0) * 0.03; rec.armL.rotation.z = -0.05 - b; rec.armR.rotation.z = 0.05 + b; }
  rec.head.rotation.y = 0; rec.head.rotation.x = st.air && st.vy < -2 ? -0.15 : 0;
  rec.root.rotation.z = 0; rec.lift = 0;
  if (st.dead) { rec.root.rotation.z = (st.dir >= 0 ? -1 : 1) * Math.PI / 2; rec.lift = 0.38; }
  const blink = !!st.blink, hurt = !!st.hurt;
  if (blink !== rec.blink || hurt !== rec.hurt) { rec.blink = blink; rec.hurt = hurt; rec.headMesh.material = headMaterials(rec.look, blink, hurt); }
}

// ---------------------------------------------------------------- creatures
export function buildMob(type, tint) {
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const P = (w, h, d, c, x, y, z, parent = body, anchor) => { const m = part(w, h, d, c, tint, anchor); m.position.set(x, y, z); parent.add(m); return m; };
  const E = (w, h, d, c, x, y, z, parent = body) => { const m = part(w, h, d, c, tint, 'center', { noTint: true }); m.position.set(x, y, z); parent.add(m); return m; };
  const rec = { root, body, parts: {}, type };
  if (type === 'waddler') {
    P(0.8, 0.62, 0.62, '#f4f1ea', 0, 0.5, 0); P(0.6, 0.4, 0.1, '#fffdf4', 0.0, 0.46, 0.32);
    const head = new THREE.Group(); head.position.set(0.3, 0.85, 0); body.add(head);
    P(0.46, 0.44, 0.46, '#f4f1ea', 0, 0, 0, head, 'bottom'); P(0.26, 0.14, 0.2, '#f2a23a', 0.3, 0.2, 0, head); P(0.12, 0.12, 0.08, '#e04a4a', 0.02, 0.5, 0, head);
    E(0.08, 0.1, 0.06, '#111', 0.2, 0.3, 0.24, head); E(0.08, 0.1, 0.06, '#111', 0.2, 0.3, -0.24, head);
    P(0.5, 0.36, 0.1, '#cfc8bc', -0.05, 0.5, 0.36); P(0.5, 0.36, 0.1, '#cfc8bc', -0.05, 0.5, -0.36);
    rec.parts.legL = new THREE.Group(); rec.parts.legR = new THREE.Group();
    rec.parts.legL.position.set(0, 0.2, 0.16); rec.parts.legR.position.set(0, 0.2, -0.16);
    for (const l of [rec.parts.legL, rec.parts.legR]) { P(0.1, 0.2, 0.1, '#f2a23a', 0, 0, 0, l, 'top'); P(0.26, 0.05, 0.16, '#f2a23a', 0.07, -0.19, 0, l); body.add(l); }
  } else if (type === 'hoppit') {
    P(0.62, 0.42, 0.42, '#d8c0a0', 0, 0.34, 0); P(0.3, 0.3, 0.06, '#efe0cc', 0.05, 0.3, 0.22);
    const head = new THREE.Group(); head.position.set(0.3, 0.55, 0); body.add(head);
    P(0.34, 0.32, 0.34, '#e6d0b2', 0, 0, 0, head, 'bottom'); P(0.08, 0.34, 0.08, '#e6d0b2', -0.04, 0.32, 0.1, head, 'bottom'); P(0.08, 0.34, 0.08, '#e6d0b2', -0.04, 0.32, -0.1, head, 'bottom');
    E(0.06, 0.07, 0.05, '#111', 0.17, 0.2, 0.15, head); E(0.06, 0.07, 0.05, '#111', 0.17, 0.2, -0.15, head); P(0.07, 0.07, 0.1, '#e08a9a', 0.19, 0.12, 0, head);
    P(0.16, 0.16, 0.16, '#fff', -0.36, 0.38, 0);
    rec.parts.legL = new THREE.Group(); rec.parts.legR = new THREE.Group(); rec.parts.legL.position.set(-0.15, 0.2, 0.15); rec.parts.legR.position.set(-0.15, 0.2, -0.15);
    for (const l of [rec.parts.legL, rec.parts.legR]) { P(0.28, 0.12, 0.1, '#c8b090', 0.06, -0.02, 0, l); body.add(l); }
  } else if (type === 'gloomling') {
    rec.parts.legL = new THREE.Group(); rec.parts.legR = new THREE.Group(); rec.parts.legL.position.set(0, 0.62, 0.14); rec.parts.legR.position.set(0, 0.62, -0.14);
    for (const l of [rec.parts.legL, rec.parts.legR]) { P(0.22, 0.62, 0.2, '#1c1626', 0, 0, 0, l, 'top'); body.add(l); }
    P(0.7, 0.82, 0.5, '#2b2040', 0, 1.0, 0); P(0.74, 0.12, 0.54, '#3a2c56', 0, 0.62, 0);
    const head = new THREE.Group(); head.position.set(0, 1.4, 0); body.add(head);
    P(0.62, 0.52, 0.56, '#2b2040', 0, 0, 0, head, 'bottom'); P(0.66, 0.12, 0.6, '#1c1626', 0, 0.46, 0, head);
    E(0.1, 0.12, 0.06, '#ff4a6a', 0.22, 0.28, 0.3, head); E(0.1, 0.12, 0.06, '#ff4a6a', 0.22, 0.28, -0.3, head);
    rec.parts.armR = new THREE.Group(); rec.parts.armR.position.set(0.3, 1.3, 0); P(0.14, 0.14, 0.14, '#2b2040', 0, 0, 0, rec.parts.armR); P(0.5, 0.12, 0.12, '#2b2040', 0.25, 0, 0, rec.parts.armR); body.add(rec.parts.armR);
  } else if (type === 'skitter') {
    P(0.7, 0.34, 0.55, '#3a3340', 0, 0.38, 0); P(0.34, 0.28, 0.36, '#2f2a36', 0.4, 0.4, 0); P(0.14, 0.14, 0.14, '#c8344a', -0.4, 0.46, 0);
    for (const [x, y, z] of [[0.52, 0.5, 0.12], [0.52, 0.5, -0.12], [0.58, 0.44, 0.02]]) E(0.06, 0.06, 0.05, '#ffd23a', x, y, z);
    rec.parts.legs = [];
    for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) { const l = new THREE.Group(); l.position.set(-0.2 + i * 0.17, 0.4, sd * 0.2); P(0.07, 0.07, 0.5, '#2a2630', 0, 0, sd * 0.22, l); const kn = P(0.07, 0.4, 0.07, '#2a2630', 0, -0.2, sd * 0.46, l); void kn; body.add(l); rec.parts.legs.push([l, i, sd]); }
  } else if (type === 'fishy') {
    P(0.56, 0.34, 0.2, '#f6a84a', 0, 0.2, 0); P(0.4, 0.1, 0.22, '#fff6e0', 0.02, 0.14, 0);
    rec.parts.tail = new THREE.Group(); rec.parts.tail.position.set(-0.28, 0.2, 0); P(0.2, 0.34, 0.06, '#f08a3a', -0.1, 0, 0, rec.parts.tail); body.add(rec.parts.tail);
    P(0.3, 0.1, 0.04, '#f08a3a', 0, 0.4, 0); E(0.06, 0.06, 0.05, '#111', 0.2, 0.26, 0.11); E(0.06, 0.06, 0.05, '#111', 0.2, 0.26, -0.11);
  } else if (type === 'stonewarden') {
    rec.parts.legL = new THREE.Group(); rec.parts.legR = new THREE.Group(); rec.parts.legL.position.set(0, 0.9, 0.3); rec.parts.legR.position.set(0, 0.9, -0.3);
    for (const l of [rec.parts.legL, rec.parts.legR]) { P(0.6, 0.9, 0.5, '#6c6f7a', 0, 0, 0, l, 'top'); body.add(l); }
    P(1.5, 1.4, 1.0, '#8a8d98', 0, 1.6, 0); P(1.1, 0.3, 0.1, '#6c6f7a', 0, 1.3, 0.52); P(0.5, 0.5, 0.1, '#ff9a3d', 0, 1.7, 0.52, body); 
    const head = new THREE.Group(); head.position.set(0, 2.3, 0); body.add(head);
    P(0.9, 0.7, 0.8, '#9ea1ac', 0, 0, 0, head, 'bottom'); E(0.14, 0.12, 0.06, '#ff9a3d', 0.26, 0.4, 0.42, head); E(0.14, 0.12, 0.06, '#ff9a3d', 0.26, 0.4, -0.42, head); P(0.7, 0.2, 0.6, '#7a7d88', 0, 0.78, 0, head);
    rec.parts.armL = new THREE.Group(); rec.parts.armR = new THREE.Group(); rec.parts.armL.position.set(0, 2.15, 0.7); rec.parts.armR.position.set(0, 2.15, -0.7);
    for (const a of [rec.parts.armL, rec.parts.armR]) { P(0.4, 1.3, 0.4, '#7a7d88', 0, 0, 0, a, 'top'); P(0.55, 0.45, 0.55, '#6c6f7a', 0, -1.3, 0, a); body.add(a); }
  }
  return rec;
}
export function poseMob(rec, st, dt) {
  const target = st.dir >= 0 ? Math.PI / 2 - 0.3 : -Math.PI / 2 + 0.3;
  rec.yaw = rec.yaw === undefined ? target : rec.yaw + (target - rec.yaw) * Math.min(1, dt * 10);
  rec.root.rotation.y = rec.yaw;
  const sw = Math.sin(st.t) * 0.8;
  const p = rec.parts;
  if (p.legL) { p.legL.rotation.z = sw; p.legR.rotation.z = -sw; }
  if (p.legL && rec.type !== 'hoppit') { p.legL.rotation.x = 0; }
  if (rec.type === 'hoppit') rec.body.position.y = st.air ? 0.15 : 0;
  if (rec.type === 'skitter') for (const [l, i, sd] of p.legs) l.rotation.y = Math.sin(st.t * 1.5 + i * 1.1) * 0.35 * sd;
  if (rec.type === 'fishy') p.tail.rotation.y = Math.sin(st.t * 2) * 0.7;
  if (rec.type === 'gloomling') p.armR.rotation.z = Math.sin(st.t) * 0.3 - 0.2;
  if (rec.type === 'stonewarden') { p.armL.rotation.z = -sw * 0.6; p.armR.rotation.z = sw * 0.6; }
  rec.body.scale.setScalar(st.hurt ? 1.06 : 1);
}
