// Reference gear for rig.js: low-poly procedural weapons and armor attached to rig sockets/joints.
// Weapon convention: authored along +Y with the grip at the origin; rig.joints.handR/handL sockets map +Y to the forearm axis.
import * as THREE from 'three';
import { lathe, capsule, boxG, sphereG, addCloak, addPlume, addTassel, WEAPON_POSES } from './rig.js';

const V3 = THREE.Vector3;
const part = (geo, mat, name) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; m.name = name || ''; return m; };
const col = (g) => { // ensure a colour attribute exists (all rig materials use vertexColors)
  if (!g.attributes.color) { const n = g.attributes.position.count, a = new Float32Array(n * 3).fill(1); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); } return g;
};

export function makeBlade(len = 0.62, w = 0.034, mat, curve = 0) {
  const g = col(new THREE.CylinderGeometry(0.004, w, len, 4, 1)); g.rotateY(Math.PI / 4); g.scale(1, 1, 0.16); g.translate(0, len / 2, 0);
  if (curve) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, p.getZ(i) + curve * y * y); } g.computeVertexNormals(); }
  return part(g, mat, 'blade');
}
export function makeSword(rig, o = {}) {
  const g = new THREE.Group(); g.name = 'sword';
  const m = rig.mats;
  g.add(part(col(new THREE.CylinderGeometry(0.018, 0.016, 0.13, 6)), m.leather, 'grip')).position.y = 0;
  const guard = part(col(new THREE.BoxGeometry(0.11, 0.02, 0.035)), m.trim, 'guard'); guard.position.y = 0.07; g.add(guard);
  const pom = part(col(new THREE.SphereGeometry(0.026, 6, 4)), m.trim, 'pommel'); pom.position.y = -0.07; g.add(pom);
  const b = makeBlade(o.len || 0.6, o.width || 0.034, rig.mats.steel || rig.mats.metal, o.curve || 0); b.position.y = 0.08; g.add(b);
  g.userData.tip = new THREE.Object3D(); g.userData.tip.position.y = 0.7; g.add(g.userData.tip); return g;
}
export function makeSica(rig) { return makeSword(rig, { len: 0.52, width: 0.04, curve: 0.55 }); }
export function makeSpear(rig, o = {}) {
  const g = new THREE.Group(); g.name = 'spear'; const m = rig.mats, L = o.len || 2.0;
  const shaft = part(col(new THREE.CylinderGeometry(0.017, 0.019, L, 6)), m.leather, 'shaft'); shaft.position.y = L / 2 - 0.45; g.add(shaft);
  const head = part(lathe([[0, 0], [0.034, 0.05], [0.03, 0.12], [0.012, 0.2], [0, 0.26]], 4, 1, 0.3, 0, 1), m.metal, 'head'); head.position.y = L - 0.45; g.add(head);
  const fer = part(col(new THREE.ConeGeometry(0.02, 0.08, 6)), m.metal, 'ferrule'); fer.rotation.x = Math.PI; fer.position.y = -0.47; g.add(fer);
  const gb = new THREE.Object3D(); gb.name = 'gripB'; gb.position.y = o.gripB ?? 0.42; g.add(gb); g.userData.gripB = gb; return g;
}
export function makeTrident(rig) {
  const g = makeSpear(rig, { len: 1.85 }); g.name = 'trident'; const m = rig.mats, y0 = 1.85 - 0.45;
  g.remove(g.children.find((c) => c.name === 'head'));
  for (const x of [-0.055, 0, 0.055]) { const p = part(lathe([[0, 0], [0.012, 0.03], [0.008, 0.16], [0, 0.22]], 4, 1, 1, 0, 1), m.metal, 'prong'); p.position.set(x, y0 + (x === 0 ? 0.04 : 0), 0); g.add(p); }
  const bar = part(col(new THREE.BoxGeometry(0.14, 0.02, 0.025)), m.metal, 'crossbar'); bar.position.y = y0; g.add(bar); return g;
}
export function makeShield(rig, kind = 'scutum') {
  // face normal is +Z in authoring space; mount() rotates it onto the forearm axis
  const g = new THREE.Group(); g.name = 'shield-' + kind; const m = rig.mats;
  let face;
  if (kind === 'scutum') { const cg = col(new THREE.CylinderGeometry(0.46, 0.46, 0.86, 8, 1, true, -0.72, 1.44)); cg.translate(0, 0, -0.46); face = part(cg, m.cloth, 'face'); face.material = m.cloth; }
  else if (kind === 'round') { const rg = col(new THREE.SphereGeometry(0.36, 12, 4, 0, Math.PI * 2, 0, 0.9)); rg.rotateX(Math.PI / 2); rg.scale(1, 1, 0.45); rg.translate(0, 0, -0.06); face = part(rg, m.metal, 'face'); }
  else { const cg = col(new THREE.CylinderGeometry(0.3, 0.3, 0.4, 6, 1, true, -0.5, 1.0)); cg.translate(0, 0, -0.3); face = part(cg, m.metal, 'face'); }
  face.material = face.material.clone(); face.material.side = THREE.DoubleSide; g.add(face);
  const boss = part(col(new THREE.SphereGeometry(0.07, 6, 4)), m.trim, 'boss'); boss.position.z = kind === 'scutum' ? 0.02 : 0.04; g.add(boss);
  const rim = part(col(new THREE.TorusGeometry(kind === 'round' ? 0.35 : 0.3, 0.012, 4, 14)), m.trim, 'rim'); rim.position.z = -0.0; rim.visible = kind === 'round'; g.add(rim);
  return g;
}
// Shield held on the forearm but stabilised: its face normal follows the forearm direction projected on the ground plane and its
// height axis stays along body-up, so it never flops flat when the arm hangs. Position stays on the wrist.
export function mountOnForearm(rig, shield, side = 'L', off = 0.14) {
  const wrist = rig.joints['wrist' + side], holder = new THREE.Object3D(); holder.position.set(0, -off, 0); wrist.add(holder); holder.add(shield);
  const f = new V3(), n = new V3(), up = new V3(), x = new V3(), M = new THREE.Matrix4(), qb = new THREE.Quaternion(), qw = new THREE.Quaternion(), bf = new V3(0, 0, 1);
  rig.postUpdate.push(() => {
    wrist.getWorldQuaternion(qw); rig.body.getWorldQuaternion(qb);
    f.set(0, -1, 0).applyQuaternion(qw).applyQuaternion(qb.clone().invert()); // forearm axis in body space
    const hl = Math.hypot(f.x, f.z); n.set(f.x, 0, f.z).multiplyScalar(1).add(bf.clone().multiplyScalar(Math.max(0, 0.6 - hl))).normalize();
    up.set(0, 1, 0); x.crossVectors(up, n).normalize(); up.crossVectors(n, x);
    M.makeBasis(x, up, n); qb.multiply(new THREE.Quaternion().setFromRotationMatrix(M)); // body-space basis -> world
    holder.quaternion.copy(qw.invert()).multiply(qb);
  });
  return holder;
}
export function makeHelm(rig, kind = 'murmillo') {
  const g = new THREE.Group(); g.name = 'helm-' + kind; const m = rig.mats;
  const dome = part(lathe([[0.108, 0.02], [0.118, 0.1], [0.11, 0.18], [0.07, 0.235], [0, 0.265]], 9, 0.97, 1.1, 0.1, 0.8), m.metal, 'dome'); g.add(dome);
  const visor = part(boxG(0.19, 0.07, 0.03), m.metal, 'visor'); visor.position.set(0, 0.12, 0.105); g.add(visor);
  for (const sg of [-1, 1]) { const ch = part(boxG(0.03, 0.15, 0.13), m.metal, 'cheek'); ch.position.set(sg * 0.105, 0.04, 0.03); ch.rotation.z = -sg * 0.1; g.add(ch); }
  if (kind === 'murmillo') { // fish-crest fin
    const fin = part(lathe([[0.0, 0], [0.02, 0.05], [0.0, 0.1]], 4, 0.6, 5, 0, 1), m.metal, 'fin'); fin.scale.set(1, 1.2, 1); fin.position.set(0, 0.255, 0.0); g.add(fin);
    const crest = part(boxG(0.025, 0.12, 0.26), m.trim, 'crest'); crest.position.set(0, 0.31, -0.02); g.add(crest);
    const tail = part(boxG(0.02, 0.07, 0.1), m.trim, 'crestTail'); tail.position.set(0, 0.29, -0.16); tail.rotation.x = 0.5; g.add(tail);
  } else if (kind === 'thraex') { // brim + griffin crest
    const brim = part(new THREE.CylinderGeometry(0.15, 0.15, 0.012, 9), m.metal, 'brim'); col(brim.geometry); brim.position.set(0, 0.14, 0.02); brim.scale.set(0.95, 1, 1.2); g.add(brim);
    const gr = part(boxG(0.02, 0.1, 0.2), m.trim, 'griffin'); gr.position.set(0, 0.3, -0.03); g.add(gr);
    const beak = part(col(new THREE.ConeGeometry(0.04, 0.12, 4)), m.trim, 'beak'); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.32, 0.12); g.add(beak);
  } else if (kind === 'hoplomachus') { // plume holder
    const hold = part(boxG(0.04, 0.05, 0.12), m.trim, 'holder'); hold.position.set(0, 0.275, 0); g.add(hold);
  }
  g.position.y = -0.005; return g;
}
export function makeGalerus(rig) {
  const g = new THREE.Group(); const m = rig.mats;
  const plate = part(lathe([[0.09, 0.0], [0.12, 0.03], [0.1, 0.07], [0.04, 0.09]], 8, 1.1, 0.9, 0, 1), m.metal, 'galerus'); plate.position.set(0.03, 0.045, 0); plate.rotation.z = -0.25; g.add(plate);
  const flange = part(boxG(0.02, 0.17, 0.14), m.metal, 'flange'); flange.position.set(-0.03, 0.15, 0); flange.rotation.z = 0.25; g.add(flange);
  return g;
}
export function makeGreave(rig, side = 'L') { const g = part(capsule(0.34, 0.068, 0.05, 7, 0.0), rig.mats.metal, 'greave'); g.position.y = -0.04; g.scale.set(1.12, 1, 1.18); return g; }
export function makeManica(rig) { const g = part(capsule(0.26, 0.056, 0.042, 7, 0.0), rig.mats.metal, 'manica'); g.position.y = -0.01; g.scale.set(1.15, 1, 1.15); return g; }
function strap(rig, from, to, w = 0.035) { const d = new V3().subVectors(to, from), m = part(boxG(w, d.length(), 0.012), rig.mats.leather, 'strap'); m.position.copy(from).add(to).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new V3(0, 1, 0), d.normalize()); return m; }
export function addSkirt(rig, n = 8, len = 0.26) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, r = 0.185; const x = Math.sin(a) * r, z = Math.cos(a) * r * 0.72;
    const sock = new THREE.Object3D(); sock.position.set(x, -0.02, z); rig.joints.hips.add(sock); rig.sockets['sk' + i] = sock;
    const front = Math.abs(Math.cos(a)) > 0.7;
    addTassel(rig, 'sk' + i, { rows: 3, length: len, radius: [0.05, 0.04], flat: front ? [1.5, 0.4] : [0.4, 1.5], material: i % 2 ? rig.mats.leather : rig.mats.cloth, box: true });
  }
}

// Equip a full style. Returns {weapon, shield}. Also wires hand IK for two-handed poses.
export const STYLES = ['murmillo', 'retiarius', 'thraex', 'hoplomachus', 'dimachaerus'];
export function equipStyle(rig, style) {
  const J = rig.joints, m = rig.mats; const out = {};
  const hang = (o, parent, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); parent.add(o); return o; };
  if (style === 'murmillo') {
    rig.animator.setWeapon('sword');
    out.weapon = makeSword(rig); J.handR.add(out.weapon);
    out.shield = makeShield(rig, 'scutum'); mountOnForearm(rig, out.shield, 'L', 0.2);
    out.helm = makeHelm(rig, 'murmillo'); J.head.add(out.helm);
    J.elbowR.add(makeManica(rig)).position.y = -0.0; rig.joints.elbowR.children[rig.joints.elbowR.children.length - 1].position.y = -0.01;
    J.kneeL.add(makeGreave(rig)); addSkirt(rig, 8);
    addTassel(rig, 'beltFront', { length: 0.3, rows: 4, material: m.cloth, radius: [0.04, 0.03], flat: [1.4, 0.4], box: true });
  } else if (style === 'retiarius') {
    rig.animator.setWeapon('spear');
    out.weapon = makeTrident(rig); J.handR.add(out.weapon); rig.animator.ik.hand = { target: out.weapon.userData.gripB, w: 1, side: 'L' };
    const gal = makeGalerus(rig); J.shoulderL.add(gal); gal.position.set(0.0, 0.06, 0);
    addSkirt(rig, 7, 0.2); rig.setPalette({}); J.elbowR.add(makeManica(rig)).position.y = -0.01;
  } else if (style === 'thraex') {
    rig.animator.setWeapon('sword');
    out.weapon = makeSica(rig); J.handR.add(out.weapon);
    out.shield = makeShield(rig, 'square'); mountOnForearm(rig, out.shield, 'L', 0.17);
    out.helm = makeHelm(rig, 'thraex'); J.head.add(out.helm);
    J.kneeL.add(makeGreave(rig)); J.kneeR.add(makeGreave(rig)); addSkirt(rig, 8, 0.2);
  } else if (style === 'hoplomachus') {
    rig.animator.setWeapon('spear');
    out.weapon = makeSpear(rig); J.handR.add(out.weapon); rig.animator.ik.hand = { target: out.weapon.userData.gripB, w: 1, side: 'L' };
    out.helm = makeHelm(rig, 'hoplomachus'); J.head.add(out.helm); addPlume(rig, { tall: 1.35 });
    J.kneeL.add(makeGreave(rig)); addSkirt(rig, 8, 0.28); addCloak(rig);
  } else if (style === 'dimachaerus') {
    rig.animator.setWeapon('dual');
    out.weapon = makeSword(rig); J.handR.add(out.weapon); out.weaponL = makeSword(rig); J.handL.add(out.weaponL);
    const ch = J.chest;
    ch.add(strap(rig, new V3(-0.2, 0.3, 0.1), new V3(0.17, 0.02, 0.15))); ch.add(strap(rig, new V3(0.2, 0.3, 0.1), new V3(-0.17, 0.02, 0.15)));
    for (const s of ['L', 'R']) { const w = part(capsule(0.08, 0.044, 0.042, 6, 0), m.cloth, 'wrap'); w.position.y = -0.17; J['elbow' + s].add(w); }
    addSkirt(rig, 6, 0.16);
  }
  return out;
}
