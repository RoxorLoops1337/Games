// Busking rhythm game FX: additive glow sheets (instanced), a spark pool (hit sparks, fireworks), flat rings, confetti.
// Everything is pooled: no allocations per frame, 3 draw calls for the whole module.
import { THREE, canvasTex } from './kit.js';

const TEX = {};
// white-on-transparent glow textures, tinted per instance with instanceColor
export function glowTex(kind) {
  if (TEX[kind]) return TEX[kind];
  TEX[kind] = canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    if (kind === 'soft') { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.14)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    else if (kind === 'ring') { const gr = g.createRadialGradient(64, 64, 34, 64, 64, 62); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,1)'); gr.addColorStop(0.8, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    else if (kind === 'beam') { const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); const gx = g.createLinearGradient(0, 0, w, 0); gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.3, 'rgba(0,0,0,0)'); gx.addColorStop(0.7, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, w, h); }
    else if (kind === 'star') { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.moveTo(64, 4); g.lineTo(70, 58); g.lineTo(124, 64); g.lineTo(70, 70); g.lineTo(64, 124); g.lineTo(58, 70); g.lineTo(4, 64); g.lineTo(58, 58); g.closePath(); g.fill(); }
  });
  return TEX[kind];
}
export function glowMaterial(kind) { return new THREE.MeshBasicMaterial({ map: glowTex(kind), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false, side: THREE.FrontSide }); }
// an instanced additive sheet: n quads of w x h, per instance matrix + colour (colour magnitude fades the glow)
export function glowSheet(n, kind, w, h) {
  const g = new THREE.PlaneGeometry(w || 1, h || 1); const m = new THREE.InstancedMesh(g, glowMaterial(kind), n); m.frustumCulled = false; m.renderOrder = 20;
  const z = new THREE.Matrix4().makeScale(0, 0, 0), c = new THREE.Color(0, 0, 0); for (let i = 0; i < n; i++) { m.setMatrixAt(i, z); m.setColorAt(i, c); } m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.instanceColor.setUsage(THREE.DynamicDrawUsage); return m;
}

export function createFx(ctx, q, camera) {
  const group = new THREE.Group(); group.name = 'rhythm_fx';
  const NS = q === 'low' ? 110 : q === 'med' ? 180 : 260, NC = q === 'low' ? 50 : q === 'med' ? 90 : 140, NR = 10;
  const sparks = glowSheet(NS, 'star', 1, 1), rings = glowSheet(NR, 'ring', 1, 1);
  rings.rotation.x = -Math.PI / 2;
  // confetti: little two-sided flat chips, lit by nothing (bright colours), tinted per instance
  const cg = new THREE.PlaneGeometry(0.17, 0.11), cm = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: false }), confetti = new THREE.InstancedMesh(cg, cm, NC); confetti.frustumCulled = false;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < NC; i++) { confetti.setMatrixAt(i, zero); confetti.setColorAt(i, new THREE.Color(1, 1, 1)); } confetti.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(sparks, rings, confetti);

  const P = { x: new Float32Array(NS), y: new Float32Array(NS), z: new Float32Array(NS), vx: new Float32Array(NS), vy: new Float32Array(NS), vz: new Float32Array(NS), life: new Float32Array(NS), age: new Float32Array(NS), size: new Float32Array(NS), r: new Float32Array(NS), g: new Float32Array(NS), b: new Float32Array(NS), grav: new Float32Array(NS), drag: new Float32Array(NS), on: new Uint8Array(NS) };
  let cursor = 0, hi = 0;
  const col = new THREE.Color(), m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), vp = new THREE.Vector3(), vs = new THREE.Vector3(), eu = new THREE.Euler();
  function spark(x, y, z, vx, vy, vz, life, size, hex, grav, drag) {
    const i = cursor; cursor = (cursor + 1) % NS; if (i + 1 > hi) hi = i + 1; col.set(hex);
    P.x[i] = x; P.y[i] = y; P.z[i] = z; P.vx[i] = vx; P.vy[i] = vy; P.vz[i] = vz; P.life[i] = life; P.age[i] = 0; P.size[i] = size; P.r[i] = col.r; P.g[i] = col.g; P.b[i] = col.b; P.grav[i] = grav === undefined ? 6 : grav; P.drag[i] = drag === undefined ? 1.2 : drag; P.on[i] = 1;
  }
  const R = Math.random;
  // radial burst of sparks around a point (hit sparks, firework shells)
  function burst(x, y, z, n, o) {
    o = o || {}; const cols = o.colors || [o.color || '#ffffff'], sp = o.speed || 3, up = o.up || 0, life = o.life || 0.5, size = o.size || 0.22; if (q === 'low') n = Math.ceil(n * 0.6);
    for (let k = 0; k < n; k++) { const a = R() * 6.283, e = (R() - 0.3) * (o.sphere ? 2.4 : 1.4), s = sp * (0.45 + R() * 0.7), cy = Math.cos(e); spark(x, y, z, Math.cos(a) * cy * s, Math.sin(e) * s + up, Math.sin(a) * cy * s * (o.flat ? 0.5 : 1), life * (0.7 + R() * 0.5), size * (0.6 + R() * 0.8), cols[k % cols.length], o.grav, o.drag); }
  }
  // a firework: shell rises, then a big coloured sphere with a sparkly tail
  const shells = [];
  function firework(x, y, z, palette) { shells.push({ x, y: 0.2, z, ty: y, vy: 15, hex: palette || ['#ff3ea5', '#ffd23f', '#2ee6ff'], t: 0 }); }
  function popFirework(s) { const base = s.hex[(R() * s.hex.length) | 0]; burst(s.x, s.y, s.z, q === 'low' ? 22 : 44, { colors: [base, '#fff2dc', base, s.hex[(R() * s.hex.length) | 0]], speed: 5.5, life: 1.5, size: 0.42, grav: 2.4, drag: 1.6, sphere: true }); }
  // rings on the ground
  const RG = []; for (let i = 0; i < NR; i++) RG.push({ on: false, age: 0, x: 0, z: 0, r: 0, g: 0, b: 0, max: 1.6 });
  let rc = 0;
  function ring(x, z, hex, max) { const r = RG[rc]; rc = (rc + 1) % NR; col.set(hex); r.on = true; r.age = 0; r.x = x; r.z = z; r.r = col.r; r.g = col.g; r.b = col.b; r.max = max || 1.7; }
  // confetti
  const C = { x: new Float32Array(NC), y: new Float32Array(NC), z: new Float32Array(NC), vx: new Float32Array(NC), vy: new Float32Array(NC), vz: new Float32Array(NC), rx: new Float32Array(NC), ry: new Float32Array(NC), sx: new Float32Array(NC), sy: new Float32Array(NC), ph: new Float32Array(NC), land: new Float32Array(NC), on: new Uint8Array(NC) };
  const CC = ['#ff3ea5', '#ffd23f', '#2ee6ff', '#a86bff', '#9dff4a', '#fff2dc', '#ff8a3d']; let cc = 0;
  function confettiBurst(n, cx, cy, cz, spreadX, spreadZ) {
    if (q === 'low') n = Math.ceil(n * 0.5);
    for (let k = 0; k < n; k++) { const i = cc; cc = (cc + 1) % NC; C.on[i] = 1; C.x[i] = cx + (R() - 0.5) * spreadX; C.y[i] = cy + R() * 0.8; C.z[i] = cz + (R() - 0.5) * spreadZ; C.vx[i] = (R() - 0.5) * 2.2; C.vy[i] = 1 + R() * 3; C.vz[i] = (R() - 0.5) * 2.2; C.rx[i] = R() * 6; C.ry[i] = R() * 6; C.sx[i] = 3 + R() * 7; C.sy[i] = 3 + R() * 7; C.ph[i] = R() * 6; C.land[i] = 0; col.set(CC[(R() * CC.length) | 0]); confetti.setColorAt(i, col); }
    if (confetti.instanceColor) confetti.instanceColor.needsUpdate = true;
  }
  function update(dt, t) {
    // sparks
    const cq = camera.quaternion;
    for (let i = 0; i < hi; i++) {
      if (!P.on[i]) continue; P.age[i] += dt; const a = P.age[i], L = P.life[i];
      if (a >= L) { P.on[i] = 0; sparks.setMatrixAt(i, zero); col.setRGB(0, 0, 0); sparks.setColorAt(i, col); continue; }
      const dr = Math.exp(-P.drag[i] * dt); P.vx[i] *= dr; P.vz[i] *= dr; P.vy[i] = P.vy[i] * dr - P.grav[i] * dt; P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.z[i] += P.vz[i] * dt; if (P.y[i] < 0.03) { P.y[i] = 0.03; P.vy[i] *= -0.35; }
      const k = 1 - a / L, s = P.size[i] * (0.4 + 0.6 * k);
      vp.set(P.x[i], P.y[i], P.z[i]); vs.set(s, s, s); m4.compose(vp, cq, vs); sparks.setMatrixAt(i, m4); const f = k * k * 1.5; col.setRGB(P.r[i] * f, P.g[i] * f, P.b[i] * f); sparks.setColorAt(i, col);
    }
    sparks.instanceMatrix.needsUpdate = true; if (sparks.instanceColor) sparks.instanceColor.needsUpdate = true;
    // firework shells
    for (let i = shells.length - 1; i >= 0; i--) { const s = shells[i]; s.t += dt; s.y += s.vy * dt; s.vy *= Math.exp(-0.9 * dt); spark(s.x + (R() - 0.5) * 0.1, s.y, s.z, (R() - 0.5) * 0.5, -0.5, (R() - 0.5) * 0.5, 0.45, 0.18, '#ffd9a0', 1, 1); if (s.y >= s.ty || s.t > 1.3) { popFirework(s); shells.splice(i, 1); } }
    // rings
    for (let i = 0; i < NR; i++) { const r = RG[i]; if (!r.on) continue; r.age += dt; const u = r.age / 0.5; if (u >= 1) { r.on = false; rings.setMatrixAt(i, zero); col.setRGB(0, 0, 0); rings.setColorAt(i, col); continue; }
      const s = 0.5 + (r.max - 0.5) * (1 - (1 - u) * (1 - u)); vp.set(r.x, 0.0, 0); // rotation.x is on the mesh: local y maps to world -z
      m4.makeScale(s, s, s); m4.setPosition(r.x, -r.z, 0.1); rings.setMatrixAt(i, m4); const f = (1 - u) * 1.4; col.setRGB(r.r * f, r.g * f, r.b * f); rings.setColorAt(i, col); }
    rings.instanceMatrix.needsUpdate = true; if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
    // confetti
    let any = false;
    for (let i = 0; i < NC; i++) {
      if (!C.on[i]) continue; any = true;
      if (C.land[i] > 0) { C.land[i] += dt; if (C.land[i] > 1.4) { C.on[i] = 0; confetti.setMatrixAt(i, zero); continue; } }
      else { C.vy[i] += (-2.4 - C.vy[i]) * (1 - Math.exp(-1.8 * dt)); C.vx[i] *= Math.exp(-0.6 * dt); C.vz[i] *= Math.exp(-0.6 * dt); C.x[i] += (C.vx[i] + Math.sin(t * 2.4 + C.ph[i]) * 0.6) * dt; C.z[i] += (C.vz[i] + Math.cos(t * 2.1 + C.ph[i]) * 0.5) * dt; C.y[i] += C.vy[i] * dt; C.rx[i] += C.sx[i] * dt; C.ry[i] += C.sy[i] * dt; if (C.y[i] <= 0.05) { C.y[i] = 0.05; C.land[i] = 0.001; } }
      eu.set(C.land[i] > 0 ? -1.5708 : C.rx[i], C.land[i] > 0 ? C.ph[i] : C.ry[i], 0); qq.setFromEuler(eu); vp.set(C.x[i], C.y[i], C.z[i]); const sc = C.land[i] > 0 ? Math.max(0, 1 - C.land[i] / 1.4) : 1; vs.set(sc, sc, sc); m4.compose(vp, qq, vs); confetti.setMatrixAt(i, m4);
    }
    if (any) confetti.instanceMatrix.needsUpdate = true;
  }
  function clear() { for (let i = 0; i < hi; i++) P.on[i] = 0; shells.length = 0; for (let i = 0; i < NC; i++) { C.on[i] = 0; confetti.setMatrixAt(i, zero); } confetti.instanceMatrix.needsUpdate = true; }
  return { group, spark, burst, firework, ring, confettiBurst, update, clear, count() { let n = 0; for (let i = 0; i < hi; i++) n += P.on[i]; return n; } };
}
