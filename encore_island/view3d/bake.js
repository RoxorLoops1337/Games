// Encore Island 3D, actor baker. Authors build characters as a plain hierarchy of meshes (the easy, expressive way) and animate nodes in update().
// bakeActor() then folds the whole hierarchy into a handful of SkinnedMeshes: every source mesh becomes a rigid bone, geometry is merged per
// material bucket (solid / glow / ink hull / textured decal ...), so a 60-part hero costs 3 to 8 draw calls instead of 120. Animation code is untouched:
//   * node position / rotation / scale animation keeps working (the original nodes stay in the scene graph and drive the bones),
//   * `node.visible = false` keeps working (hidden subtrees collapse to zero-size bones every frame),
//   * ctx.setHurt-style flashes keep working when you pass { hurt: ctx.list } (the merged solid material is swapped into that list),
//   * Things that do NOT survive: runtime colour changes on materials, swapping geometry, adding new child meshes after baking (they just render normally, unbaked).
// Mark a node `userData.noBake = true` (or put it under one) to leave it as ordinary meshes, e.g. billboards, particles, light cones.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const HIDDEN_LAYER = 31;
const _m = new THREE.Matrix4(), _n = new THREE.Matrix3(), _v = new THREE.Vector3(), _inv = new THREE.Matrix4();
const BAKED_MATS = new Map(); // bucket key -> shared material (per bake call these are per-actor; see opts.shareKey)

function bucketKey(mat, shareKey) {
  if (mat.userData && mat.userData.noBake) return null;
  if (mat.map || mat.alphaMap || mat.isShaderMaterial && !(mat.side === THREE.BackSide && mat.uniforms && mat.uniforms.uW)) return 'id:' + mat.uuid; // textured / custom: keep the source material
  if (mat.side === THREE.BackSide) return 'ink';
  if (mat.isMeshBasicMaterial) return 'glow|' + (mat.transparent ? 1 : 0) + '|' + mat.opacity.toFixed(2) + '|' + mat.blending + '|' + (mat.depthWrite ? 1 : 0) + '|' + mat.side;
  if (mat.isMeshStandardMaterial) return 'std|' + (mat.flatShading ? 1 : 0) + '|' + mat.roughness.toFixed(2) + '|' + mat.metalness.toFixed(2) + '|' + mat.emissive.getHex() + '|' + mat.emissiveIntensity.toFixed(2) + '|' + (mat.transparent ? 1 : 0) + '|' + mat.opacity.toFixed(2) + '|' + mat.side;
  return 'id:' + mat.uuid;
}

/**
 * Bake `actor.group` (or any Object3D) in place. Returns { meshes, bones, calls } and sets actor.baked.
 * opts.hurt: array of materials the actor's hurt flash drives (ctx.list); it is replaced by the baked solid materials.
 * opts.cast: shadow casting for the baked body (default true; the ink hull never casts).
 */
export function bakeActor(actor, opts = {}) {
  const root = actor.group || actor; if (root.userData.baked) return root.userData.baked;
  root.updateMatrixWorld(true);
  const rootInv = _inv.copy(root.matrixWorld).invert().clone();
  const bones = [], boneIndex = new Map(), buckets = new Map();
  const bone = (node) => { let i = boneIndex.get(node); if (i === undefined) { i = bones.length; bones.push(node); boneIndex.set(node, i); } return i; };
  const skipNoBake = (o) => { for (let p = o; p && p !== root.parent; p = p.parent) if (p.userData && p.userData.noBake) return true; return false; };
  const sources = [];
  root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && o.geometry && o.geometry.attributes.position && !Array.isArray(o.material) && o.material && !skipNoBake(o)) sources.push(o); });
  for (const o of sources) {
    const mat = o.material, key = bucketKey(mat); if (key === null) continue;
    // an ink hull child belongs to its parent's bone
    const owner = (key === 'ink' && o.parent && o.parent.isMesh && boneIndex.has(o.parent)) ? o.parent : o, bi = bone(owner);
    const src = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    _m.copy(rootInv).multiply(o.matrixWorld); _n.getNormalMatrix(_m);
    const p = src.attributes.position, nrm = src.attributes.normal, count = p.count, pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3);
    const inflate = key === 'ink' && mat.isShaderMaterial ? mat.uniforms.uW.value : 0;
    for (let i = 0; i < count; i++) {
      _v.fromBufferAttribute(p, i); if (inflate && nrm) { _v.x += nrm.getX(i) * inflate; _v.y += nrm.getY(i) * inflate; _v.z += nrm.getZ(i) * inflate; }
      _v.applyMatrix4(_m); pos[i * 3] = _v.x; pos[i * 3 + 1] = _v.y; pos[i * 3 + 2] = _v.z;
      if (nrm) { _v.fromBufferAttribute(nrm, i).applyMatrix3(_n).normalize(); nor[i * 3] = _v.x; nor[i * 3 + 1] = _v.y; nor[i * 3 + 2] = _v.z; } else nor[i * 3 + 1] = 1;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    const vc = src.attributes.color, tint = mat.color || new THREE.Color(1, 1, 1);
    for (let i = 0; i < count; i++) { if (vc) { col[i * 3] = vc.getX(i) * tint.r; col[i * 3 + 1] = vc.getY(i) * tint.g; col[i * 3 + 2] = vc.getZ(i) * tint.b; } else { col[i * 3] = tint.r; col[i * 3 + 1] = tint.g; col[i * 3 + 2] = tint.b; } }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (key.startsWith('id:')) g.setAttribute('uv', new THREE.BufferAttribute(src.attributes.uv ? new Float32Array(src.attributes.uv.array) : new Float32Array(count * 2), 2));
    const si = new Uint16Array(count * 4), sw = new Float32Array(count * 4); for (let i = 0; i < count; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    let b = buckets.get(key); if (!b) buckets.set(key, b = { mat, list: [], src: new Set() }); b.list.push(g); b.src.add(mat);
    o.layers.set(HIDDEN_LAYER); if (key === 'ink') o.layers.set(HIDDEN_LAYER);
  }
  if (!bones.length) { root.userData.baked = { meshes: [], bones: 0, calls: 0 }; return root.userData.baked; }
  const boneInverses = bones.map((n) => new THREE.Matrix4().copy(n.matrixWorld).invert());
  const skeleton = new THREE.Skeleton(bones, boneInverses);
  // visibility emulation: a hidden node (or any hidden ancestor) collapses its bone. Hooked into the per-frame skeleton update.
  const upd = skeleton.update.bind(skeleton);
  const chain = bones.map((n) => { const c = []; for (let p = n; p && p !== root; p = p.parent) c.push(p); return c; });
  skeleton.update = function () {
    upd(); const bm = skeleton.boneMatrices; // read it live: three reallocates this array when it builds the bone texture
    for (let i = 0; i < bones.length; i++) { const c = chain[i]; let hid = false; for (let k = 0; k < c.length; k++) if (c[k].visible === false) { hid = true; break; } if (hid) bm.fill(0, i * 16, i * 16 + 16); }
    if (skeleton.boneTexture) skeleton.boneTexture.needsUpdate = true;
  };
  const meshes = [], mats = [];
  for (const [key, b] of buckets) {
    const geom = mergeGeometries(b.list, false); b.list.forEach((g) => g.dispose());
    let m;
    if (key.startsWith('id:')) { m = b.mat; if (m.isMeshStandardMaterial || m.isMeshBasicMaterial) { /* keep vertex colours off: textured decals use their own colour */ } }
    else if (key === 'ink') { m = new THREE.MeshBasicMaterial({ color: 0x2d170f, side: THREE.BackSide, fog: false }); m.userData.noLook = true; }
    else if (key.startsWith('glow')) { m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: b.mat.transparent, opacity: b.mat.opacity, blending: b.mat.blending, depthWrite: b.mat.depthWrite, side: b.mat.side, fog: b.mat.fog }); }
    else { m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: b.mat.flatShading, roughness: b.mat.roughness, metalness: b.mat.metalness, emissive: b.mat.emissive.clone(), emissiveIntensity: b.mat.emissiveIntensity, transparent: b.mat.transparent, opacity: b.mat.opacity, side: b.mat.side }); mats.push(m); if (b.mat.emissive.getHex() === 0xff2a4a || b.mat.emissive.getHex() === 0) m.emissive.set(0xff2a4a); }
    if (!key.startsWith('id:') && !key.startsWith('glow') && key !== 'ink' && b.mat.isMeshStandardMaterial) m.userData.baked = true;
    const sm = new THREE.SkinnedMesh(geom, m); sm.bind(skeleton, root.matrixWorld.clone());
    geom.computeBoundingSphere(); geom.boundingSphere.radius *= 1.4; sm.boundingSphere = geom.boundingSphere.clone(); sm.boundingBox = null;
    sm.castShadow = key !== 'ink' && !key.startsWith('glow') && opts.cast !== false && !(m.transparent); sm.receiveShadow = m.isMeshStandardMaterial; sm.frustumCulled = true; sm.userData.baked = true; sm.userData.bucket = key;
    sm.renderOrder = key === 'ink' ? -1 : 0; root.add(sm); meshes.push(sm);
  }
  if (opts.hurt) { opts.hurt.length = 0; for (const m of mats) opts.hurt.push(m); }
  // hurt flash: rigs drive emissiveIntensity on their (now hidden) source materials; forward it to the baked solid material of that bucket
  for (const [key, b] of buckets) { const bm = meshes.find((s) => s.userData.bucket === key); if (!bm || !bm.material.isMeshStandardMaterial || bm.material.userData.baked !== true) continue;
    for (const sm of b.src) if (sm.emissive && sm.emissive.getHex() === 0xff2a4a) Object.defineProperty(sm, 'emissiveIntensity', { configurable: true, get: () => bm.material.emissiveIntensity, set: (v) => { bm.material.emissiveIntensity = v; } }); }
  const info = { meshes, bones: bones.length, calls: meshes.length, skeleton, mats, dispose() { for (const s of meshes) { s.geometry.dispose(); if (s.material.userData.baked || s.material.isMeshBasicMaterial && !s.material.map) s.material.dispose(); } skeleton.dispose(); } };
  root.userData.baked = info; if (actor.group) actor.baked = info; return info;
}
/** count draw calls a subtree will cost (visible meshes on layer 0) */
export function countCalls(root) { let n = 0; root.traverse((o) => { if (o.isMesh && o.visible && o.layers.test({ mask: 1 })) n++; }); return n; }
