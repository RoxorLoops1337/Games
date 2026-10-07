// TUNER FX (Tuner Artist): the streak aura around the singer (floor ring, light column, orbiting stars) and the studio mic rig (boom, shock mount, capsule, pop filter).
import { THREE, flatMat, mesh, merged } from './kit.js';
import { place, pbox, pcyl, ptor, psph, glowPaint, glowMaterial } from './mg_tuner_set.js';

const C = (h) => new THREE.Color(h);
const additive = (c, o) => new THREE.MeshBasicMaterial(Object.assign({ color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }, o || {}));
const LEVELS = [C('#2ee6ff'), C('#9dff4a'), C('#ffd23f'), C('#ff3ea5')]; // streak 0-1, 2-3, 4-5, 6+

export function buildAura() {
  const g = new THREE.Group(); g.name = 'aura';
  const ringMat = additive(C('#2ee6ff'), { opacity: 0 }), ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.78, 28), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; g.add(ring);
  const ring2Mat = additive(C('#2ee6ff'), { opacity: 0 }), ring2 = new THREE.Mesh(new THREE.RingGeometry(0.9, 0.94, 28), ring2Mat); ring2.rotation.x = -Math.PI / 2; ring2.position.y = 0.065; g.add(ring2);
  const colMat = additive(C('#2ee6ff'), { opacity: 0, side: THREE.BackSide }), col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 2.1, 20, 1, true), colMat); col.position.y = 1.05; g.add(col);
  const NSt = 8, stars = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ toneMapped: false }), NSt); stars.frustumCulled = false; g.add(stars);
  const m4 = new THREE.Matrix4(), v = new THREE.Vector3(), s = new THREE.Vector3(), q = new THREE.Quaternion(), cc = new THREE.Color(); let lvl = 0, amt = 0, boost = 0;
  const api = {
    group: g, boost(k) { boost = Math.max(boost, k || 1); },
    update(dt, t, streak, live) {
      const tgt = streak >= 6 ? 3 : streak >= 4 ? 2 : streak >= 2 ? 1 : 0, want = streak >= 2 ? 0.3 + 0.1 * Math.min(6, streak) : (live ? 0.12 : 0.04);
      amt += (want - amt) * (1 - Math.exp(-dt * 4)); boost = Math.max(0, boost - dt * 2.2); lvl += (tgt - lvl) * (1 - Math.exp(-dt * 5));
      const a = Math.floor(lvl), f = lvl - a; cc.copy(LEVELS[a]).lerp(LEVELS[Math.min(3, a + 1)], f);
      const pulse = 0.5 + 0.5 * Math.sin(t * 5); ringMat.color.copy(cc); ring2Mat.color.copy(cc); colMat.color.copy(cc);
      ringMat.opacity = Math.min(0.9, amt * (0.7 + 0.3 * pulse) + boost * 0.4); ring2Mat.opacity = Math.min(0.8, amt * 0.7 + boost * 0.5); colMat.opacity = Math.min(0.26, (amt - 0.1) * 0.2 + boost * 0.14);
      ring.scale.setScalar(1 + 0.08 * pulse + boost * 0.35); ring2.scale.setScalar(1 + (1 - ((t * 0.9) % 1)) * 0.0 + boost * 0.6 + 0.04 * Math.sin(t * 3)); col.scale.set(1 + boost * 0.4, 1, 1 + boost * 0.4);
      const n = streak >= 2 ? Math.min(NSt, 2 + streak) : 0;
      for (let i = 0; i < NSt; i++) { const on = i < n, ang = t * (1.4 + i * 0.05) + i * (Math.PI * 2 / Math.max(1, n || 1)), r = 0.7 + 0.06 * Math.sin(t * 2 + i), y = 0.5 + ((i * 0.37 + t * 0.35) % 1.4); v.set(Math.cos(ang) * r, y, Math.sin(ang) * r); s.setScalar(on ? 0.04 + 0.02 * Math.sin(t * 9 + i) : 0.0001); q.identity(); m4.compose(v, q, s); stars.setMatrixAt(i, m4); stars.setColorAt(i, cc.clone().multiplyScalar(1.1)); }
      stars.instanceMatrix.needsUpdate = true; if (stars.instanceColor) stars.instanceColor.needsUpdate = true;
    },
    get color() { return cc; },
  };
  return api;
}

// mic rig in the singer's local space: mp = mouth position (x, y, z) measured on the character
export function buildMic(mp) {
  const g = new THREE.Group(); g.name = 'mic'; const lit = [], glow = [];
  const cz = mp.z + 0.4, cy = mp.y - 0.02, cx = mp.x + 0.0;
  const rod = (a, b, r, c) => { const d = new THREE.Vector3().subVectors(b, a), len = d.length(), mid = a.clone().add(b).multiplyScalar(0.5), geo = pcyl(r, r, len, 6, c); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); const e = new THREE.Euler().setFromQuaternion(q); return place(geo, mid.x, mid.y, mid.z, e.x, e.y, e.z); };
  const base = new THREE.Vector3(cx + 0.05, 0, cz + 0.95), top = new THREE.Vector3(cx + 0.05, cy + 0.55, cz + 0.95), arm = new THREE.Vector3(cx, cy + 0.06, cz + 0.12);
  lit.push(place(pcyl(0.24, 0.27, 0.05, 10, '#17102b'), base.x, 0.03, base.z), place(pcyl(0.035, 0.035, 0.12, 6, '#2b2352'), base.x, 0.1, base.z), rod(new THREE.Vector3(base.x, 0.1, base.z), top, 0.018, '#2b2352'), rod(top, arm, 0.014, '#3a3070'));
  lit.push(place(pcyl(0.05, 0.05, 0.07, 8, '#ff3ea5'), top.x, top.y, top.z));
  lit.push(place(pcyl(0.062, 0.062, 0.22, 10, '#c9a24a'), cx, cy, cz, Math.PI / 2), place(pcyl(0.066, 0.066, 0.05, 10, '#4a3a8a'), cx, cy, cz + 0.12, Math.PI / 2), place(pcyl(0.05, 0.05, 0.12, 8, '#17102b'), cx, cy + 0.04, cz - 0.12, Math.PI / 2 * 0.4));
  lit.push(place(ptor(0.095, 0.012, 14, 4, '#17102b'), cx, cy, cz - 0.02), place(pbox(0.012, 0.012, 0.22, '#17102b'), cx, cy + 0.09, cz - 0.1), rod(arm, new THREE.Vector3(cx, cy + 0.09, cz - 0.04), 0.012, '#3a3070'));
  glow.push(glowPaint(place(pbox(0.1, 0.012, 0.012, '#fff'), cx, cy, cz + 0.145), '#ff3ea5', 2.2));
  // pop filter: dark ring on a gooseneck, translucent mesh disc
  const pz = mp.z + 0.2; lit.push(place(ptor(0.14, 0.008, 20, 4, '#2b2352'), cx, mp.y + 0.0, pz), rod(new THREE.Vector3(cx + 0.14, mp.y - 0.02, pz), new THREE.Vector3(cx + 0.38, mp.y - 0.2, pz + 0.18), 0.008, '#17102b'));
  g.add(mesh(merged(lit), flatMat(), { cast: false })); g.add(new THREE.Mesh(merged(glow), glowMaterial()));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.135, 20), new THREE.MeshBasicMaterial({ color: C('#cdd6ff'), transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })); disc.position.set(cx, mp.y, pz); g.add(disc);
  return { group: g, capsule: new THREE.Vector3(cx, cy, cz) };
}
