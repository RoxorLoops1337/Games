// Busking rhythm game: the crowd. A few real park characters close to the highway (they pick clips from the crowd energy and join in one by one),
// plus a block of instanced low-poly spectators (torso, head, hair, arms, glow sticks = 5 draw calls) that sway, clap and wave glow sticks as combo rises.
import { THREE, flatMat, rng } from './kit.js';
import { createNPC } from './characters.js';
import { STAGE } from './mg_rhythm_world.js';

const C = (h) => new THREE.Color(h);
const SKIN = ['#f1c9a5', '#d9a46e', '#b87f4e', '#8d5a36', '#5e3823', '#f6d1b1'].map(C), HAIRC = ['#2a2024', '#1a1420', '#7a4e34', '#c8a15a', '#ff3ea5', '#35f2e0', '#b9b9c8', '#e0703a'].map(C);
const TOPC = ['#ff4f8b', '#ff8a3d', '#ffd23f', '#8fd14f', '#29d3c7', '#4fa3ff', '#7b5cff', '#c77dff', '#e8e1d5', '#3a3a4f', '#b5573f', '#e63946'].map(C);
const NEAR = [['luca', 3.7, 1.6], ['mira', -3.8, 0.0], ['sky', 4.1, -3.2], ['pascal', -4.2, -2.9], ['roo', 3.9, -6.2], ['jin', -3.9, -6.0], ['penny', 5.0, 0.4], ['foxy', -5.1, 1.5]];

function painted(geo, hex, rnd, tint) { const g = geo.index ? geo.toNonIndexed() : geo, n = g.attributes.position.count, a = new Float32Array(n * 3), c = C(hex); for (let i = 0; i < n; i += 3) { const f = (rnd() - 0.5) * (tint === undefined ? 0.1 : tint); for (let k = 0; k < 3; k++) { a[(i + k) * 3] = c.r + f; a[(i + k) * 3 + 1] = c.g + f; a[(i + k) * 3 + 2] = c.b + f; } } g.deleteAttribute('uv'); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
function mergeG(list) { const tot = list.reduce((s, g) => s + g.attributes.position.count, 0), pos = new Float32Array(tot * 3), col = new Float32Array(tot * 3); let o = 0; list.forEach((g) => { pos.set(g.attributes.position.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }); const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); return g; }

export function buildCrowd(ctx, q, look) {
  const group = new THREE.Group(); group.name = 'crowd'; const R = rng(2024), rnd = rng(7);
  // ---- real characters ----
  const nNear = q === 'low' ? 0 : q === 'med' ? 4 : 6, near = [];
  for (let i = 0; i < nNear; i++) {
    const [id, x, z] = NEAR[i]; let c = null; try { c = createNPC(ctx, id, {}); } catch (e) { console.error('[rhythm] crowd ' + id + ' ' + e); }
    if (!c) continue; c.object.position.set(x, 0, z); c.object.rotation.y = Math.atan2(-x * 0.55, -6 - z) + (R() - 0.5) * 0.2; c.object.scale.setScalar(1.0 + R() * 0.08); c.lookAt(new THREE.Vector3(0, 1.4, STAGE.z)); c.thr = 0.12 + i * 0.1; c.ph = R() * 4; c.mode = ''; group.add(c.object);
    c.object.traverse((o) => { if (o.isMesh) { o.castShadow = q !== 'low' && o.castShadow; } }); near.push(c); c.play('idle', {});
  }
  // ---- instanced spectators ----
  const N = q === 'low' ? 16 : q === 'med' ? 28 : 40, torsoG = mergeG([painted(new THREE.CylinderGeometry(0.2, 0.27, 0.62, 6, 1), '#ffffff', rnd, 0.1).translate(0, 0.98, 0), painted(new THREE.CylinderGeometry(0.24, 0.2, 0.68, 6, 1, true), '#6a6482', rnd, 0.1).translate(0, 0.34, 0)]);
  const headG = painted(new THREE.IcosahedronGeometry(0.2, 0), '#ffffff', rnd, 0.06).translate(0, 1.48, 0), hairG = (() => { const g = new THREE.IcosahedronGeometry(0.215, 0); g.scale(1, 0.62, 1); g.translate(0, 1.56, -0.01); return painted(g, '#ffffff', rnd, 0.1); })();
  const armG = (() => { const g = new THREE.BoxGeometry(0.1, 0.52, 0.1); g.translate(0, -0.26, 0); return painted(g, '#ffffff', rnd, 0.06); })(), stickG = painted(new THREE.CylinderGeometry(0.025, 0.03, 0.42, 4), '#ffffff', rnd, 0);
  const mk = (g, mat, n) => { const m = new THREE.InstancedMesh(g, mat, n); m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); return m; };
  const torso = mk(torsoG, flatMat(), N), head = mk(headG, flatMat(), N), hair = mk(hairG, flatMat(), N), arms = mk(armG, flatMat(), N * 2), sticks = mk(stickG, new THREE.MeshBasicMaterial({ toneMapped: false }), N);
  [torso, head, hair, arms].forEach((m) => { m.castShadow = q === 'high'; m.receiveShadow = false; });
  const P = []; const tc = new THREE.Color();
  // rows on both sides of the highway, packed but never inside the lane area or on top of the real characters
  let guard = 0; while (P.length < N && guard++ < 4000) {
    const side = R() < 0.5 ? -1 : 1, x = side * (3.3 + Math.pow(R(), 1.6) * 6.5), z = 1.6 - R() * 11.4; if (Math.abs(x) < 3.25 || (z < STAGE.front + 0.2 && Math.abs(x) < STAGE.w / 2 + 0.6)) continue;
    if (P.some((p) => Math.hypot(p.x - x, p.z - z) < 0.95)) continue; if (near.some((c) => Math.hypot(c.object.position.x - x, c.object.position.z - z) < 1.1)) continue;
    const i = P.length; P.push({ x, z, ry: Math.atan2(-x * 0.5, -5 - z) + (R() - 0.5) * 0.4, s: 0.92 + R() * 0.2, ph: R() * 6.28, thr: R() * 0.8, stick: R() < 0.4 ? 1 : 0, sc: R() }); }
  P.forEach((p, i) => { torso.setColorAt(i, tc.copy(TOPC[(R() * TOPC.length) | 0]).multiplyScalar(0.95)); head.setColorAt(i, SKIN[(R() * SKIN.length) | 0]); hair.setColorAt(i, HAIRC[(R() * HAIRC.length) | 0]); sticks.setColorAt(i, tc.set(['#ff3ea5', '#35f2e0', '#ffd23f', '#9dff4a', '#a86bff'][i % 5]).multiplyScalar(2.2)); });
  group.add(torso, head, hair, arms, sticks);
  const o = new THREE.Object3D(), tmp = new THREE.Matrix4(), hp = new THREE.Matrix4();
  function put(mesh, idx, x, y, z, rx, ry, rz, s) { o.position.set(x, y, z); o.rotation.set(rx, ry, rz, 'YXZ'); o.scale.setScalar(s); o.updateMatrix(); mesh.setMatrixAt(idx, o.matrix); }
  function update(dt, t, E, beat, punch) {
    const ph = beat * Math.PI * 2, kick = Math.exp(-(beat % 1) * 5);
    for (let i = 0; i < P.length; i++) {
      const p = P[i], active = Math.max(0, Math.min(1, (E - p.thr * 0.7) / 0.25)), bob = (0.02 + 0.085 * active) * Math.abs(Math.sin(ph * 0.5 + p.ph * 0.15)) + 0.035 * active * kick, sway = Math.sin(t * 0.8 + p.ph) * 0.05 * (1 - active) + Math.sin(ph * 0.5 + p.ph) * 0.07 * active;
      const y = bob, s = p.s, cx = p.x, cz = p.z;
      put(torso, i, cx, y * 0.4, cz, 0, p.ry, sway * 0.6, s); put(head, i, cx + Math.sin(sway) * 0.1, y, cz, 0.05 * kick * active, p.ry, sway, s); put(hair, i, cx + Math.sin(sway) * 0.1, y, cz, 0.05 * kick * active, p.ry, sway, s);
      // arms: idle hang, clap in front on the beat at mid energy, both up with a glow stick at high energy
      const hype = Math.max(0, Math.min(1, (E - p.thr * 0.5 - 0.15) / 0.3)), clapT = active * (1 - hype), swing = Math.sin(ph + p.ph) * 0.5 + 0.5, sh = 1.2 * s + y * 0.5;
      for (let a = 0; a < 2; a++) {
        const sd = a ? -1 : 1; const hang = 0.12 + sway * 0.4; const clap = 1.05 + 0.45 * Math.max(0, Math.sin(ph * 2 + p.ph)) * 1.0; const up = Math.PI - 0.55 - 0.35 * Math.sin(ph * 0.5 * 2 + p.ph + a) * 0.5 - hype * 0.0;
        const rz = (1 - active) * (sd * hang) + active * (1 - hype) * (sd * (0.15 + 0.1 * (1 - Math.max(0, Math.sin(ph * 2 + p.ph)))) ) + hype * (-sd * (2.5 + 0.35 * Math.sin(ph + p.ph * 2 + a)));
        const rx = active * (1 - hype) * -(0.55 + 0.35 * Math.max(0, Math.sin(ph * 2 + p.ph))) + hype * -0.15;
        const ox = Math.cos(p.ry) * sd * 0.27 * s, oz = -Math.sin(p.ry) * sd * 0.27 * s;
        o.position.set(cx + ox, sh - 0.04, cz + oz); o.rotation.set(rx, p.ry, rz, 'YXZ'); o.scale.setScalar(s); o.updateMatrix(); arms.setMatrixAt(i * 2 + a, o.matrix);
        if (a === 0 && p.stick) { hp.copy(o.matrix); tmp.makeTranslation(0, -0.55, 0); hp.multiply(tmp); const vis = hype > 0.05 ? 1 : 0; const sc = vis; tmp.makeScale(sc, sc, sc); hp.multiply(tmp); sticks.setMatrixAt(i, hp); }
        else if (a === 0) { tmp.makeScale(0, 0, 0); sticks.setMatrixAt(i, tmp); }
      }
    }
    [torso, head, hair, arms, sticks].forEach((m) => { m.instanceMatrix.needsUpdate = true; });
    // real characters: idle -> nod along -> dance -> cheer, joining one by one
    near.forEach((c, i) => {
      const th = c.thr, mode = E < th ? 'idle' : E < th + 0.3 ? 'talk' : E < 0.88 ? 'dance' : 'cheer';
      if (mode === 'dance') c.play('dance', { bpm: ctx.__bpm || 100, phase: beat * 0.5 + c.ph, amp: 0.6 + 0.4 * E }); else if (mode === 'cheer') c.play('cheer', {}); else if (mode === 'talk') c.play('wave', {}); else c.play('idle', {});
      c.update(dt, t);
    });
  }
  return { group, update, near, spectators: P.length, setQuality() {}, dispose() { near.forEach((c) => c.dispose && c.dispose()); } };
}
