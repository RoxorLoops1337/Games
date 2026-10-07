// TUNER SET (Tuner Artist): the vocal booth at night. Padded foam walls, wood floor, neon tubes, warm hanging lamp, ON AIR sign,
// studio monitors, a mic on a boom with a pop filter, pulsing VU towers. Everything static is merged into a handful of draw calls.
import { THREE, flatMat, paint, nonIndexed, merged, mesh, canvasTex, rng as mkRng } from './kit.js';

export const BOOTH = { x: 2.8, zBack: -3.7, zFront: 6.5, h: 6.3 };
const col = (h) => new THREE.Color(h);
// place a geometry (built at the origin) with position, euler rotation and scale
export function place(g, x, y, z, rx, ry, rz, sx, sy, sz) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x || 0, y || 0, z || 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), new THREE.Vector3(sx === undefined ? 1 : sx, sy === undefined ? 1 : sy, sz === undefined ? 1 : sz));
  g.applyMatrix4(m); return g;
}
export const pbox = (w, h, d, c) => paint(nonIndexed(new THREE.BoxGeometry(w, h, d)), c);
export const pcyl = (rt, rb, h, seg, c, open) => paint(nonIndexed(new THREE.CylinderGeometry(rt, rb, h, seg || 8, 1, !!open)), c);
export const ptor = (r, t, seg, tseg, c, arc) => paint(nonIndexed(new THREE.TorusGeometry(r, t, tseg || 5, seg || 14, arc || Math.PI * 2)), c);
export const psph = (r, c, d) => paint(nonIndexed(new THREE.IcosahedronGeometry(r, d || 1)), c);
// HDR colour for glow geometry (MeshBasicMaterial, toneMapped:false): rgb multiplied above 1 so bloom picks it up
export function glowPaint(g, hex, k) { const c = col(hex).multiplyScalar((k || 1.6) * 0.62), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
export const glowMaterial = () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
let GLOWTEX = null;
// soft radial sprite texture (white centre fading to nothing) for halos, so glows never show a hard disc edge
export function glowTex() { if (GLOWTEX) return GLOWTEX; GLOWTEX = canvasTex(64, 64, (c, w, h) => { const gr = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, h); }); return GLOWTEX; }
const additive = (c, o) => new THREE.MeshBasicMaterial(Object.assign({ color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }, o || {}));

const FOAM = ['#3c2c70', '#2f2360', '#4b3086', '#27316a', '#573093', '#2a2058', '#38307a'];
const FOAM_ACCENT = ['#1f6f86', '#a8286f'];

export function buildSet(ctx, tier) {
  const g = new THREE.Group(); g.name = 'booth'; const R = mkRng(7), lowQ = tier === 'low';
  const BX = BOOTH.x, ZB = BOOTH.zBack, ZF = BOOTH.zFront, HH = BOOTH.h;
  const lit = [], glow = [];
  // ---- floor: dark wood boards + a round violet rug with a neon ring under the singer
  const fl = ['#4d3558', '#5a3d62', '#432e4f', '#573a5c'];
  for (let i = 0; i < 17; i++) lit.push(place(pbox(BX * 2, 0.1, 0.6, fl[i % 4]), 0, -0.05, ZB + 0.3 + i * 0.6));
  lit.push(place(pbox(BX * 2 + 0.4, 0.12, ZF - ZB + 0.4, '#241a3a'), 0, -0.13, (ZF + ZB) / 2));
  lit.push(place(pcyl(1.55, 1.6, 0.04, 20, '#6d3fae'), 0, 0.02, 1.05)); lit.push(place(pcyl(1.2, 1.25, 0.05, 20, '#8a56cc'), 0, 0.03, 1.05)); lit.push(place(pcyl(0.8, 0.84, 0.06, 20, '#6d3fae'), 0, 0.04, 1.05));
  glow.push(glowPaint(place(ptor(1.58, 0.022, 28, 3, '#fff', Math.PI * 2), 0, 0.05, 1.05, Math.PI / 2), '#ff3ea5', 1.3));
  // ---- walls: plum back wall + side walls, ceiling, skirting
  lit.push(place(pbox(BX * 2 + 0.6, HH, 0.3, '#2b2050'), 0, HH / 2, ZB - 0.15));
  lit.push(place(pbox(0.3, HH, ZF - ZB, '#2b2050'), -BX - 0.15, HH / 2, (ZF + ZB) / 2)); lit.push(place(pbox(0.3, HH, ZF - ZB, '#2b2050'), BX + 0.15, HH / 2, (ZF + ZB) / 2));
  lit.push(place(pbox(BX * 2 + 0.6, 0.3, ZF - ZB, '#1d1536'), 0, HH + 0.15, (ZF + ZB) / 2));
  lit.push(place(pbox(BX * 2, 0.34, 0.12, '#17102b'), 0, 0.17, ZB + 0.06)); lit.push(place(pbox(0.12, 0.34, ZF - ZB, '#17102b'), -BX + 0.06, 0.17, (ZF + ZB) / 2)); lit.push(place(pbox(0.12, 0.34, ZF - ZB, '#17102b'), BX - 0.06, 0.17, (ZF + ZB) / 2));
  // ---- acoustic foam wedges (4 sided pyramids) on both side walls, the ceiling and the lower back wall
  const cell = lowQ ? 0.8 : 0.55, pyr = (c) => paint(nonIndexed(new THREE.ConeGeometry(cell * 0.5, cell * 0.42, 4, 1, true)), c);
  const foam = (x, y, z, rx, ry, rz, dim) => { const r = R(); let c = r < 0.06 ? FOAM_ACCENT[0] : r < 0.1 ? FOAM_ACCENT[1] : FOAM[Math.floor(R() * FOAM.length)]; if (dim) c = '#' + col(c).multiplyScalar(dim).getHexString(); const p = pyr(c); p.rotateY(Math.PI / 4); lit.push(place(p, x, y, z, rx, ry, rz)); };
  for (let z = ZB + cell / 2; z < ZF; z += cell) for (let y = 0.75; y < HH - 0.1; y += cell) { foam(-BX + cell * 0.2, y, z, 0, 0, -Math.PI / 2); foam(BX - cell * 0.2, y, z, 0, 0, Math.PI / 2); }
  // ceiling foam (apex pointing down) + lower back wall panels, flat felt blocks above the skirting
  for (let z = ZB + cell / 2; z < ZF; z += cell) for (let x = -BX + cell / 2; x < BX; x += cell) foam(x, HH - cell * 0.18, z, Math.PI, 0, 0, 0.45);
  for (let x = -BX + cell / 2; x < BX; x += cell) for (let y = 0.7; y < 1.45; y += cell) lit.push(place(pbox(cell * 0.93, cell * 0.93, 0.1, FOAM[Math.floor(R() * FOAM.length)]), x, y, ZB + 0.05));
  // ---- neon: wall corner strips, ceiling tubes, floor edge lines
  const neonGeo = (c, k) => (b) => glow.push(glowPaint(b, c, k));
  const nP = neonGeo('#ff3ea5', 1.35), nC = neonGeo('#2ee6ff', 1.3);
  nP(place(pbox(0.07, HH - 0.3, 0.07, '#fff'), -BX + 0.2, HH / 2, ZB + 0.12)); nC(place(pbox(0.07, HH - 0.3, 0.07, '#fff'), BX - 0.2, HH / 2, ZB + 0.12));
  nP(place(pbox(0.06, 0.06, ZF - ZB - 0.4, '#fff'), -BX + 0.45, HH - 0.28, (ZF + ZB) / 2)); nC(place(pbox(0.06, 0.06, ZF - ZB - 0.4, '#fff'), BX - 0.45, HH - 0.28, (ZF + ZB) / 2));
  nC(place(pbox(0.06, 0.06, ZF - ZB - 0.4, '#fff'), -BX + 0.2, 0.46, (ZF + ZB) / 2)); nP(place(pbox(0.06, 0.06, ZF - ZB - 0.4, '#fff'), BX - 0.2, 0.46, (ZF + ZB) / 2));
  nP(place(pbox(BX * 2 - 0.6, 0.06, 0.06, '#fff'), 0, HH - 0.28, ZB + 0.16));
  // ---- warm floor lamp (brass pole, conical shade, hot bulb) on the left of the rug: the warm key of the booth
  const LAMP = new THREE.Vector3(-1.15, 1.75, -0.7);
  lit.push(place(pcyl(0.26, 0.3, 0.05, 10, '#2b2048'), LAMP.x, 0.03, LAMP.z), place(pcyl(0.025, 0.025, LAMP.y - 0.3, 6, '#c98a2e'), LAMP.x, (LAMP.y - 0.3) / 2 + 0.05, LAMP.z));
  lit.push(place(pcyl(0.14, 0.3, 0.38, 10, '#d99a3a', true), LAMP.x, LAMP.y, LAMP.z), place(pcyl(0.15, 0.15, 0.03, 10, '#8a5a1e'), LAMP.x, LAMP.y + 0.2, LAMP.z));
  glow.push(glowPaint(place(psph(0.1, '#fff', 1), LAMP.x, LAMP.y - 0.1, LAMP.z), '#ffc46b', 1.9));
  // ---- studio monitor speakers either side of the rug, on stands
  for (const sx of [-1, 1]) {
    const x = sx * 2.3, z = -2.6;
    lit.push(place(pcyl(0.03, 0.03, 0.9, 5, '#17102b'), x, 0.45, z), place(pbox(0.6, 0.05, 0.4, '#17102b'), x, 0.02, z), place(pbox(0.55, 0.85, 0.45, '#1d1736'), x, 1.28, z), place(pbox(0.5, 0.78, 0.04, '#2b2352'), x, 1.28, z + 0.235));
    lit.push(place(pcyl(0.17, 0.17, 0.05, 10, '#0d0a1c'), x, 1.48, z + 0.25, Math.PI / 2), place(pcyl(0.1, 0.1, 0.05, 8, '#0d0a1c'), x, 1.0, z + 0.25, Math.PI / 2));
    glow.push(glowPaint(place(pcyl(0.03, 0.03, 0.02, 6, '#fff'), x + 0.2, 1.65, z + 0.27, Math.PI / 2), sx < 0 ? '#9dff4a' : '#ffe14d', 1.5));
  }
  // ---- little props: wall guitar-less pegboard of cables, a plant pot, a stool by the rug
  lit.push(place(pcyl(0.2, 0.15, 0.3, 7, '#8a4f3a'), -2.35, 0.15, 0.2)); for (let i = 0; i < 5; i++) { const a = i * 1.26; lit.push(place(pbox(0.06, 0.55, 0.02, i % 2 ? '#3f9b5a' : '#2f7d4e'), -2.35 + Math.cos(a) * 0.12, 0.62, 0.2 + Math.sin(a) * 0.12, 0.3 * Math.sin(a), 0, 0.5 * Math.cos(a)));}
  lit.push(place(pcyl(0.2, 0.2, 0.06, 8, '#a8693b'), 2.15, 0.62, 0.3), place(pcyl(0.03, 0.03, 0.6, 5, '#17102b'), 2.15, 0.3, 0.3), place(pcyl(0.16, 0.16, 0.03, 8, '#5a3a5c'), 2.15, 0.02, 0.3));
  const litMesh = mesh(merged(lit), flatMat(), { cast: false }); litMesh.receiveShadow = !lowQ; g.add(litMesh);
  const glowMesh = new THREE.Mesh(merged(glow), glowMaterial()); g.add(glowMesh);

  // ---- ON AIR sign: canvas neon, pulses red while the singer is live
  const signTex = canvasTex(256, 96, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#2a0b1a'; c.beginPath(); c.roundRect ? c.roundRect(6, 6, w - 12, h - 12, 18) : c.rect(6, 6, w - 12, h - 12); c.fill(); c.lineWidth = 6; c.strokeStyle = '#ff4f6a'; c.stroke(); c.font = '900 52px "Trebuchet MS",system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#ffd8de'; c.shadowColor = '#ff3a5a'; c.shadowBlur = 16; c.fillText('ON AIR', w / 2, h / 2 + 3); });
  const signMat = new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false, transparent: true, color: new THREE.Color(0.35, 0.35, 0.35) });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.36), signMat); sign.position.set(1.55, 5.25, ZB + 0.18); g.add(sign);
  const signGlow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.2), additive(new THREE.Color(1.0, 0.18, 0.28), { opacity: 0.0, map: glowTex() })); signGlow.position.set(1.55, 5.25, ZB + 0.2); g.add(signGlow);

  // ---- light spill cones / glows (additive, one draw call each)
  const lampCone = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.6, 12, 1, true), additive(new THREE.Color(1.0, 0.62, 0.22), { opacity: 0.03 })); lampCone.position.set(LAMP.x, LAMP.y - 0.85, LAMP.z); g.add(lampCone);
  const lampHalo = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), additive(new THREE.Color(1, 0.7, 0.3), { opacity: 0.5, map: glowTex() })); lampHalo.position.set(LAMP.x, LAMP.y - 0.05, LAMP.z + 0.3); g.add(lampHalo);

  // ---- lights: cool violet hemi fill, warm spot from the lamp side (the one shadow map), pink and cyan rims
  const hemi = new THREE.HemisphereLight('#8a7ee8', '#5a3470', 1.35); g.add(hemi);
  const key = new THREE.SpotLight('#ffc27a', 12, 18, 0.7, 0.9, 1.4); key.position.set(-1.9, 2.8, 1.2); key.target.position.set(0.1, 0.9, 0.3); key.castShadow = !lowQ; key.shadow.mapSize.set(tier === 'high' ? 1024 : 512, tier === 'high' ? 1024 : 512); key.shadow.bias = -0.0006; key.shadow.normalBias = 0.03; key.shadow.camera.near = 1; key.shadow.camera.far = 14; g.add(key, key.target);
  const rimP = new THREE.PointLight('#ff3ea5', 14, 9, 1.6); rimP.position.set(-2.1, 2.4, -1.4); g.add(rimP);
  const rimC = new THREE.PointLight('#2ee6ff', 14, 9, 1.6); rimC.position.set(2.1, 2.4, -1.4); g.add(rimC);
  const front = new THREE.DirectionalLight('#cfc2ff', 0.75); front.position.set(0.8, 2.4, 6); front.target.position.set(0, 1, 1); g.add(front, front.target);

  // ---- VU towers (instanced bars) either side of the back wall
  const NB = 16, bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.12, 0.1), new THREE.MeshBasicMaterial({ toneMapped: false }), NB * 2); bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage); bars.frustumCulled = false;
  const m4 = new THREE.Matrix4(), cc = new THREE.Color(), VX = [-2.45, 2.45], VY0 = 1.7, VST = 0.2;
  for (let s = 0; s < 2; s++) for (let i = 0; i < NB; i++) { m4.makeTranslation(VX[s], VY0 + i * VST, ZB + 0.14); bars.setMatrixAt(s * NB + i, m4); bars.setColorAt(s * NB + i, cc.set('#222')); }
  bars.instanceColor.setUsage(THREE.DynamicDrawUsage); g.add(bars);
  const barFrame = [place(pbox(0.5, NB * VST + 0.2, 0.08, '#0e0a1e'), VX[0], VY0 + NB * VST / 2 - 0.1, ZB + 0.08), place(pbox(0.5, NB * VST + 0.2, 0.08, '#0e0a1e'), VX[1], VY0 + NB * VST / 2 - 0.1, ZB + 0.08)];
  g.add(mesh(merged(barFrame), flatMat(), { cast: false }));
  const vuLevel = [0, 0], cGreen = col('#5dff7a').multiplyScalar(1.7), cYel = col('#ffe14d').multiplyScalar(1.8), cRed = col('#ff3a5a').multiplyScalar(2.0), cOff = col('#2a2250');
  function setVU(a, b) { // a, b = 0..1 levels for the two towers
    vuLevel[0] = a; vuLevel[1] = b;
    for (let s = 0; s < 2; s++) { const lv = vuLevel[s] * NB; for (let i = 0; i < NB; i++) { const on = Math.max(0, Math.min(1, lv - i)); const base = i < 9 ? cGreen : i < 13 ? cYel : cRed; cc.copy(cOff).lerp(base, on > 0.02 ? 0.25 + 0.75 * on : 0); bars.setColorAt(s * NB + i, cc); } }
    bars.instanceColor.needsUpdate = true;
  }
  setVU(0.05, 0.05);

  // ---- floating dust motes in the lamp light (instanced, drifting)
  const ND = lowQ ? 14 : 40, dust = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a0').multiplyScalar(0.9), toneMapped: false }), ND); dust.frustumCulled = false; dust.instanceMatrix.setUsage(THREE.DynamicDrawUsage); g.add(dust);
  const dp = []; for (let i = 0; i < ND; i++) dp.push({ x: -2 + R() * 4, y: 0.6 + R() * 4, z: -2.5 + R() * 5.5, ph: R() * 6.28, sp: 0.15 + R() * 0.25, sz: 0.012 + R() * 0.014 });
  const dm = new THREE.Matrix4(), dq = new THREE.Quaternion(), dv = new THREE.Vector3(), ds = new THREE.Vector3();
  const api = {
    group: g, lamp: LAMP, key, hemi, rimP, rimC, signMat, vu: setVU, bars,
    update(dt, t, c) {
      for (let i = 0; i < ND; i++) { const p = dp[i]; p.y += p.sp * dt * 0.4; if (p.y > 5.2) p.y = 0.5; dv.set(p.x + 0.12 * Math.sin(t * 0.4 + p.ph), p.y, p.z + 0.12 * Math.cos(t * 0.33 + p.ph)); ds.setScalar(p.sz * (0.7 + 0.3 * Math.sin(t * 2 + p.ph))); dm.compose(dv, dq, ds); dust.setMatrixAt(i, dm); } dust.instanceMatrix.needsUpdate = true;
      // c: { live (singing now), level, streakCol, beat }
      const live = c.live ? 1 : 0; api._live += (live - api._live) * (1 - Math.exp(-dt * 8));
      const pulse = 0.5 + 0.5 * Math.sin(t * 6); const k = 0.28 + api._live * (0.75 + 0.25 * pulse);
      signMat.color.setRGB(k, k * 0.55 + 0.1, k * 0.6 + 0.12); signGlow.material.opacity = 0.05 + api._live * 0.35 * (0.6 + 0.4 * pulse);
      lampHalo.material.opacity = 0.42 + 0.06 * Math.sin(t * 2.2); key.intensity = 12 * (0.97 + 0.03 * Math.sin(t * 3.1));
      rimP.intensity = 12 + (c.beat || 0) * 8 + api._live * 4; rimC.intensity = 12 + (c.beat || 0) * 8 + api._live * 4;
    },
    setQuality(q) { key.castShadow = q !== 'low'; litMesh.receiveShadow = q !== 'low'; },
    _live: 0,
  };
  return api;
}
