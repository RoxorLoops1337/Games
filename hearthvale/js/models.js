// Procedural low-poly models (no image files). Every builder returns a THREE.Group centred on its footprint.
import * as THREE from 'three';

const geoCache = {}, matCache = {};
export const mat = (c, o = {}) => {
  const k = c + JSON.stringify(o);
  return matCache[k] || (matCache[k] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.92, metalness: 0, flatShading: true, ...o }));
};
const geo = (k, f) => geoCache[k] || (geoCache[k] = f());
export function box(w, h, d, c, x = 0, y = 0, z = 0, o) {
  const m = new THREE.Mesh(geo('b', () => new THREE.BoxGeometry(1, 1, 1)), mat(c, o)); m.scale.set(w, h, d); m.position.set(x, y + h / 2, z); m.castShadow = m.receiveShadow = true; return m;
}
export function cyl(rt, rb, h, c, x = 0, y = 0, z = 0, seg = 10, o) {
  const m = new THREE.Mesh(geo('c' + rt / rb + seg, () => new THREE.CylinderGeometry(rt / (rb || 1), 1, 1, seg)), mat(c, o)); m.scale.set(rb, h, rb); m.position.set(x, y + h / 2, z); m.castShadow = m.receiveShadow = true; return m;
}
export function cone(r, h, c, x = 0, y = 0, z = 0, seg = 4, rot = Math.PI / 4, o) {
  const m = new THREE.Mesh(geo('cn' + seg, () => new THREE.ConeGeometry(1, 1, seg)), mat(c, o)); m.scale.set(r, h, r); m.position.set(x, y + h / 2, z); m.rotation.y = rot; m.castShadow = m.receiveShadow = true; return m;
}
export function ball(r, c, x = 0, y = 0, z = 0, o) {
  const m = new THREE.Mesh(geo('s', () => new THREE.IcosahedronGeometry(1, 1)), mat(c, o)); m.scale.setScalar(r); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m;
}
const G = (...kids) => { const g = new THREE.Group(); for (const k of kids) g.add(k); return g; };
const ROOFS = ['#c8553d', '#d9823b', '#b94a6a', '#4f7fb8', '#8a6bb0', '#c4a23c'];
const roofOf = (id) => ROOFS[id % ROOFS.length];
// gable roof: a triangular prism along X
export function gable(w, h, d, c, x = 0, y = 0, z = 0) {
  const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
  const m = new THREE.Mesh(g, mat(c)); m.rotation.y = Math.PI / 2; m.position.set(x - w / 2, y, z); m.castShadow = m.receiveShadow = true; return m;
}

export const BUILD = {
  hall(o) {
    return G(box(2.8, 0.7, 2.8, '#9a9288', 0, 0, 0), box(2.5, 1.0, 2.5, '#e9d9b4', 0, 0.7, 0), cone(2.2, 1.5, '#b5473a', 0, 1.7, 0), box(0.4, 1.0, 0.4, '#8a8279', 0.8, 1.9, 0.5),
      box(0.7, 0.9, 0.08, '#6b4a2c', 0, 0.7, 1.27), cyl(0.04, 0.04, 2.0, '#5a4630', -1.0, 1.0, -1.0, 6), box(0.7, 0.45, 0.05, o.color, -0.65, 2.55, -1.0));
  },
  house(o) {
    return G(box(1.7, 0.2, 1.7, '#a39a8f'), box(1.5, 0.9, 1.5, '#f2e6c9', 0, 0.2, 0), cone(1.35, 0.9, roofOf(o.id), 0, 1.1, 0), box(0.3, 0.55, 0.06, '#6b4a2c', 0, 0.2, 0.76), box(0.28, 0.28, 0.06, '#8fc7e8', 0.5, 0.65, 0.76), box(0.25, 0.7, 0.25, '#8a8279', -0.45, 1.2, -0.3));
  },
  kitchen(o) {
    return G(box(1.8, 0.15, 1.8, '#a39a8f'), box(1.6, 0.8, 1.4, '#f0d8a8', 0, 0.15, 0), gable(1.8, 0.7, 1.7, '#c8553d', 0, 0.95, 0), box(0.3, 0.9, 0.3, '#8a8279', 0.5, 1.0, -0.3), box(0.4, 0.4, 0.06, '#6b4a2c', -0.3, 0.15, 0.72), ball(0.22, '#d9d4cc', 0.55, 0.28, 0.9));
  },
  sawmill(o) {
    const blade = cyl(0.5, 0.5, 0.04, '#c9ced4', 0.5, 0.55, 0.0, 14); blade.rotation.z = Math.PI / 2; blade.name = 'spin';
    return G(box(1.9, 0.12, 1.9, '#8a6b45'), box(0.12, 1.2, 0.12, '#6b4a2c', -0.8, 0.1, -0.8), box(0.12, 1.2, 0.12, '#6b4a2c', 0.8, 0.1, -0.8), box(0.12, 1.2, 0.12, '#6b4a2c', -0.8, 0.1, 0.8), box(0.12, 1.2, 0.12, '#6b4a2c', 0.8, 0.1, 0.8),
      gable(1.9, 0.6, 1.9, '#9a6b3f', 0, 1.3, 0), blade, cyl(0.15, 0.15, 0.9, '#b58a56', -0.4, 0.1, 0.4, 8), cyl(0.15, 0.15, 0.9, '#c49a62', -0.4, 0.4, 0.4, 8));
  },
  kiln(o) {
    return G(box(1.8, 0.15, 1.8, '#a39a8f'), cyl(0.7, 0.85, 0.9, '#c4693f', 0, 0.15, 0, 10), cone(0.8, 0.5, '#a9532f', 0, 1.05, 0, 10, 0), cyl(0.18, 0.2, 0.7, '#6f5a4a', 0.4, 1.0, -0.3, 8), box(0.5, 0.4, 0.2, '#2e2420', 0, 0.2, 0.8));
  },
  storehouse(o) {
    return G(box(1.9, 0.12, 1.9, '#a39a8f'), box(1.7, 1.0, 1.6, '#b88c5a', 0, 0.12, 0), gable(1.9, 0.8, 1.9, '#7a5a3a', 0, 1.1, 0), box(0.8, 0.8, 0.06, '#6b4a2c', 0, 0.12, 0.82), box(0.8, 0.06, 0.07, '#e9d9b4', 0, 0.5, 0.84));
  },
  study(o) {
    return G(box(1.8, 0.15, 1.8, '#a39a8f'), cyl(0.7, 0.8, 1.3, '#d9d0e8', 0, 0.15, 0, 8), cone(0.95, 0.9, '#4f5fb8', 0, 1.45, 0, 8, 0), ball(0.12, '#f2d36b', 0, 2.4, 0), box(0.35, 0.5, 0.06, '#6b4a2c', 0, 0.15, 0.78), box(0.3, 0.3, 0.06, '#f2d36b', 0.3, 0.9, 0.7));
  },
  mill(o) {
    const blades = new THREE.Group(); blades.name = 'spinz'; blades.position.set(0, 1.6, 0.65);
    for (let i = 0; i < 4; i++) { const b = box(0.28, 1.5, 0.04, '#f6efdc', 0, 0, 0); b.position.y = 0.75; b.rotation.z = 0; const arm = new THREE.Group(); arm.add(b); arm.rotation.z = i * Math.PI / 2; blades.add(arm); }
    return G(box(1.8, 0.12, 1.8, '#a39a8f'), cyl(0.5, 0.75, 1.5, '#f0e4c8', 0, 0.12, 0, 8), cone(0.7, 0.6, '#8a5a3a', 0, 1.62, 0, 8, 0), blades);
  },
  bakery(o) {
    return G(box(1.8, 0.15, 1.8, '#a39a8f'), box(1.6, 0.9, 1.4, '#f5d9b0', 0, 0.15, 0), gable(1.8, 0.65, 1.7, '#b0603a', 0, 1.05, 0), cyl(0.2, 0.22, 0.8, '#8a8279', 0.5, 1.0, -0.3, 8), box(0.9, 0.12, 0.45, '#e86a8a', 0, 0.75, 0.9), box(0.4, 0.4, 0.06, '#6b4a2c', 0, 0.15, 0.72), ball(0.15, '#d9a45c', -0.5, 0.25, 0.95));
  },
  market(o) {
    const stripes = []; for (let i = 0; i < 5; i++) stripes.push(box(0.36, 0.1, 1.2, i % 2 ? '#f2efe6' : '#d9534f', -0.72 + i * 0.36, 1.0, 0.2));
    return G(box(1.9, 0.1, 1.9, '#a39a8f'), box(0.1, 1.1, 0.1, '#6b4a2c', -0.85, 0.1, -0.35), box(0.1, 1.1, 0.1, '#6b4a2c', 0.85, 0.1, -0.35), box(0.1, 1.1, 0.1, '#6b4a2c', -0.85, 0.1, 0.8), box(0.1, 1.1, 0.1, '#6b4a2c', 0.85, 0.1, 0.8), ...stripes,
      box(1.4, 0.4, 0.5, '#b88c5a', 0, 0.1, 0.1), ball(0.14, '#d9534f', -0.4, 0.62, 0.1), ball(0.14, '#e8c04a', 0, 0.62, 0.1), ball(0.14, '#7bbf4a', 0.4, 0.62, 0.1));
  },
  flowers(o) {
    const g = G(box(0.8, 0.06, 0.8, '#5a4630'));
    const cs = ['#ef7fb0', '#f2d36b', '#fff', '#a78bf0'];
    for (let i = 0; i < 7; i++) g.add(ball(0.09, cs[(o.id + i) % 4], -0.28 + (i % 3) * 0.28, 0.18, -0.25 + Math.floor(i / 3) * 0.28));
    return g;
  },
  lantern(o) { return G(cyl(0.05, 0.05, 1.0, '#4a4036', 0, 0, 0, 6), ball(0.18, '#ffe08a', 0, 1.1, 0, { emissive: '#ffb830', emissiveIntensity: 0.8 })); },
  fountain(o) { return G(cyl(0.9, 0.95, 0.35, '#b9b4ac', 0, 0, 0, 14), cyl(0.75, 0.75, 0.2, '#6fc3ea', 0, 0.2, 0, 14, { transparent: true, opacity: 0.85 }), cyl(0.12, 0.15, 0.8, '#b9b4ac', 0, 0.3, 0, 8), ball(0.2, '#9fdcf5', 0, 1.1, 0)); },
  banner(o) { return G(cyl(0.04, 0.04, 1.6, '#5a4630', 0, 0, 0, 6), box(0.5, 0.7, 0.04, o.color, 0.27, 0.8, 0)); },
};
export function farmModel(b) {
  const g = G(box(2.9, 0.1, 1.9, '#7a5a3a'));
  const crops = new THREE.Group(); crops.name = 'crops'; g.add(crops);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
    const s = box(0.25, 1, 0.25, '#e6c44a', -1.15 + c * 0.46, 0.1, -0.7 + r * 0.46); s.userData.crop = true; crops.add(s);
  }
  return g;
}
export function setFarmStage(g, stage, crop) {
  const crops = g.getObjectByName('crops'); if (!crops) return;
  const growth = stage === 'ripe' ? 1 : stage === 'grow' ? 0.15 + crop * 0.7 : 0.02;
  const colr = stage === 'ripe' ? '#e6c44a' : '#7bbf4a';
  for (const s of crops.children) { s.scale.y = Math.max(0.02, growth * 0.7); s.position.y = 0.1 + s.scale.y / 2; s.material = mat(colr); }
}

export function treeModel(seed = 0) {
  const g = G(cyl(0.12, 0.16, 0.6, '#7a5a3a', 0, 0, 0, 6));
  const c = ['#5aa84a', '#4f9a4a', '#6bb554'][seed % 3];
  g.add(cone(0.65, 1.0, c, 0, 0.5, 0, 7, seed)); g.add(cone(0.5, 0.8, c, 0, 1.1, 0, 7, seed)); g.add(cone(0.32, 0.6, '#7cc65e', 0, 1.6, 0, 7, seed));
  g.rotation.y = seed; return g;
}
export function rockModel(seed = 0) {
  const g = new THREE.Group(); const r = ball(0.55, '#9aa0a6', 0, 0.3, 0); r.scale.set(0.6, 0.45, 0.55); g.add(r);
  const r2 = ball(0.3, '#b3b8bd', 0.35, 0.18, 0.2); g.add(r2); g.rotation.y = seed; return g;
}
export function clayModel() {
  const g = G(cyl(0.6, 0.65, 0.08, '#b5703f', 0, 0, 0, 12), cyl(0.38, 0.4, 0.1, '#c98a55', 0.1, 0.05, 0.05, 10)); return g;
}
export function stumpModel() { return G(cyl(0.15, 0.17, 0.2, '#7a5a3a', 0, 0, 0, 7)); }

const HAT = ['#e8564a', '#f2b632', '#3d8bd8', '#52b56a', '#a65bd6', '#ef7fb0'];
export function villagerModel(color, hat) {
  const g = new THREE.Group(); const body = new THREE.Group(); body.name = 'body'; g.add(body);
  body.add(cyl(0.2, 0.26, 0.5, color, 0, 0.1, 0, 8), ball(0.2, '#f1c9a0', 0, 0.78, 0), cone(0.23, 0.3, HAT[hat % 6], 0, 0.88, 0, 8, 0));
  const arm = box(0.07, 0.3, 0.07, '#f1c9a0', 0.26, 0.35, 0); arm.name = 'arm'; body.add(arm);
  body.add(box(0.07, 0.3, 0.07, '#f1c9a0', -0.26, 0.35, 0));
  const sh = new THREE.Mesh(new THREE.CircleGeometry(0.3, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.2 })); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.02; g.add(sh);
  return g;
}
export function boardModel() {
  const g = G(box(0.2, 2.0, 0.2, '#6b4a2c', -0.9, 0, 0), box(0.2, 2.0, 0.2, '#6b4a2c', 0.9, 0, 0), box(2.2, 1.3, 0.12, '#c9a36b', 0, 0.9, 0), gable(2.4, 0.4, 0.5, '#8a5a3a', 0, 2.2, 0));
  for (let i = 0; i < 5; i++) g.add(box(0.35, 0.45, 0.02, ['#fff', '#f9e79f', '#d6eaf8'][i % 3], -0.8 + i * 0.4, 1.0 + (i % 2) * 0.3, 0.08));
  return g;
}
