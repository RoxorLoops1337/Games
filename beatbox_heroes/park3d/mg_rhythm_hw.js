// Busking rhythm game: the 3D note highway. Four glowing lanes (B pink, T yellow, K cyan, Pf purple) running from the stage toward the camera,
// a scrolling beat-stripe surface, faceted gem notes (one instanced mesh per lane, a different silhouette per lane), receptors with press flashes.
import { THREE, canvasTex } from './kit.js';
import { glowSheet } from './mg_rhythm_fx.js';

export const LANES = [
  { name: 'B', color: '#ff4f8b', hi: '#ffc2d8', dark: '#8a1f4d', keys: ['KeyD', 'ArrowLeft', 'Digit1'], seg: 6, drum: 'kick' },
  { name: 'T', color: '#ffd23f', hi: '#fff3b0', dark: '#a06a08', keys: ['KeyF', 'ArrowDown', 'Digit2'], seg: 3, drum: 'hat' },
  { name: 'K', color: '#35f2e0', hi: '#c4fff8', dark: '#0f6a85', keys: ['KeyJ', 'ArrowUp', 'Digit3'], seg: 4, drum: 'snare' },
  { name: 'Pf', color: '#a86bff', hi: '#e6d2ff', dark: '#4b2a96', keys: ['KeyK', 'ArrowRight', 'Digit4'], seg: 4, diamond: true, drum: 'snare' },
];
export const LW = 1.06, HIT_Z = 2.2, SPAWN_Z = -9.2, NEAR_Z = 4.4, FAR_Z = -10.3, GEM_Y = 0.3;
export const laneX = (i) => (i - 1.5) * LW;

const C = (h) => new THREE.Color(h);
function paintFaces(geo, L, rnd) {
  const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, n = p.count, a = new Float32Array(n * 3), cm = C(L.color), ch = C(L.hi), cd = C(L.dark), t = new THREE.Color(), A = new THREE.Vector3(), B = new THREE.Vector3(), D = new THREE.Vector3(), N = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    A.fromBufferAttribute(p, i); B.fromBufferAttribute(p, i + 1); D.fromBufferAttribute(p, i + 2); N.subVectors(D, B).cross(A.sub(B)).normalize();
    const up = N.y, side = N.x * 0.55 + N.z * 0.6; if (up > 0.85) t.copy(cm).lerp(ch, 0.75).multiplyScalar(1.12); else { const k = Math.max(0, Math.min(1, 0.45 + up * 0.55 + side * 0.4 + (rnd() - 0.5) * 0.3)); t.copy(cd).lerp(cm, k); if (up > 0.2) t.lerp(ch, (up - 0.2) * 0.5); t.multiplyScalar(1.04); }
    for (let k = 0; k < 3; k++) { a[(i + k) * 3] = t.r; a[(i + k) * 3 + 1] = t.g; a[(i + k) * 3 + 2] = t.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
// chunky faceted gem: crown (flat table) + pavilion, silhouette differs per lane (hex, triangle, square, diamond)
export function gemGeo(i, rnd) {
  const L = LANES[i], seg = L.seg, k = seg === 3 ? 1.22 : 1;
  const crown2 = new THREE.CylinderGeometry(0.12 * k, 0.26 * k, 0.1, seg, 1), crown = new THREE.CylinderGeometry(0.27 * k, 0.47 * k, 0.2, seg, 1), pav = new THREE.CylinderGeometry(0.47 * k, 0.14 * k, 0.26, seg, 1, true);
  crown.translate(0, 0.13, 0); crown2.translate(0, 0.28, 0); pav.translate(0, -0.1, 0);
  const parts = [crown2, crown, pav].map((g) => { const ng = g.index ? g.toNonIndexed() : g; ng.deleteAttribute('uv'); return ng; });
  const m = new THREE.Matrix4();
  parts.forEach((g) => { if (L.diamond) { m.makeScale(0.82, 1.15, 1.4); g.applyMatrix4(m); } else if (seg === 4) { m.makeRotationY(Math.PI / 4); g.applyMatrix4(m); m.makeScale(0.92, 1.0, 0.92); g.applyMatrix4(m); } else if (seg === 3) { m.makeRotationY(Math.PI); g.applyMatrix4(m); } });
  const merged = new THREE.BufferGeometry(), arrs = parts.map((g) => paintFaces(g, L, rnd)); let tot = 0; arrs.forEach((g) => { tot += g.attributes.position.count; });
  const pos = new Float32Array(tot * 3), col = new Float32Array(tot * 3); let o = 0; arrs.forEach((g) => { pos.set(g.attributes.position.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; });
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3)); merged.setAttribute('color', new THREE.BufferAttribute(col, 3)); merged.computeVertexNormals(); return merged;
}

function beatTexture() {
  return canvasTex(256, 512, (g, w, h) => {
    const base = g.createLinearGradient(0, 0, 0, h); base.addColorStop(0, '#2c2145'); base.addColorStop(1, '#251b3c'); g.fillStyle = base; g.fillRect(0, 0, w, h);
    LANES.forEach((L, i) => { const x0 = i * 64, gr = g.createLinearGradient(x0, 0, x0 + 64, 0); const c = C(L.color); const rgb = (a) => 'rgba(' + ((c.r * 255) | 0) + ',' + ((c.g * 255) | 0) + ',' + ((c.b * 255) | 0) + ',' + a + ')'; gr.addColorStop(0, rgb(0.1)); gr.addColorStop(0.5, rgb(0.42)); gr.addColorStop(1, rgb(0.1)); g.fillStyle = gr; g.fillRect(x0, 0, 64, h); });
    // beat stripes every 128 px (4 beats per texture), the bar line is thick and bright
    for (let b = 0; b < 4; b++) { const y = b * 128, th = b === 0 ? 11 : 5, al = b === 0 ? 0.62 : 0.26; g.fillStyle = 'rgba(255,240,214,' + al + ')'; g.fillRect(0, y - th / 2, w, th); if (b === 0) g.fillRect(0, h - th / 2, w, th / 2 + 1); }
    g.fillStyle = 'rgba(255,255,255,0.05)'; for (let i = 0; i < 4; i++) for (let y = 0; y < h; y += 16) g.fillRect(i * 64 + 30, y, 4, 8);
  });
}

export function buildHighway(ctx, q) {
  const group = new THREE.Group(); group.name = 'highway'; const rnd = ctx.kit.rng(77);
  const HW = LW * 4 + 0.36, LEN = NEAR_Z - FAR_Z, zMid = (NEAR_Z + FAR_Z) / 2;
  // --- slab body + side rails + lane dividers (one merged, unlit, glowing mesh) ---
  const tex = beatTexture(); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8;
  const surf = new THREE.PlaneGeometry(LW * 4, LEN, 1, 1); surf.rotateX(-Math.PI / 2); surf.translate(0, 0.095, zMid);
  const uv = surf.attributes.uv; // v is rewritten by setApproach(); u 0..1 across the 4 lanes
  const surfMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: true, fog: false });
  const surface = new THREE.Mesh(surf, surfMat); surface.receiveShadow = false; group.add(surface);
  const parts = [];
  const add = (w, h, d, x, y, z, hex, k) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); const c = C(hex).multiplyScalar(k || 1), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); g.deleteAttribute('normal'); parts.push(g.index ? g.toNonIndexed() : g); };
  add(HW, 0.09, LEN, 0, 0.0, zMid, '#3a2d58', 1); // slab
  for (let i = 0; i <= 4; i++) { const x = (i - 2) * LW, edge = i === 0 || i === 4; add(edge ? 0.12 : 0.045, edge ? 0.12 : 0.04, LEN, x, edge ? 0.11 : 0.105, zMid, i < 2 ? '#ff6fb0' : i === 2 ? '#fff0c8' : '#5ff6ec', edge ? 1.7 : 1.3); }
  // end caps and rail posts
  add(HW + 0.1, 0.16, 0.14, 0, 0.06, NEAR_Z + 0.02, '#ffd27a', 1.1);
  for (let k = 0; k < 7; k++) { const z = NEAR_Z - 0.4 - k * (LEN / 6.4); [-1, 1].forEach((s) => add(0.14, 0.3, 0.14, s * (HW / 2 + 0.02), 0.16, z, '#2b2438', 1)); [-1, 1].forEach((s) => add(0.1, 0.06, 0.1, s * (HW / 2 + 0.02), 0.34, z, k % 2 ? '#ff3ea5' : '#35f2e0', 2.2)); }
  // receptors: lane shaped hollow rings with a bright bevel, on the hit line
  LANES.forEach((L, i) => {
    const seg = L.seg, x = laneX(i), rg = new THREE.RingGeometry(0.34, 0.56, seg === 3 ? 3 : seg, 1); rg.rotateX(-Math.PI / 2);
    const m = new THREE.Matrix4(); if (!L.diamond && seg === 4) { m.makeRotationY(Math.PI / 4); rg.applyMatrix4(m); } if (seg === 3) { m.makeRotationY(Math.PI / 2); rg.applyMatrix4(m); } if (seg === 6) { m.makeRotationY(Math.PI / 6); rg.applyMatrix4(m); }
    if (L.diamond) { m.makeScale(0.82, 1, 1.4); rg.applyMatrix4(m); }
    rg.translate(x, 0.13, HIT_Z); const c = C(L.color).multiplyScalar(1.3), n = rg.attributes.position.count, a = new Float32Array(n * 3); for (let j = 0; j < n; j++) { a[j * 3] = c.r; a[j * 3 + 1] = c.g; a[j * 3 + 2] = c.b; } rg.setAttribute('color', new THREE.BufferAttribute(a, 3)); rg.deleteAttribute('uv'); rg.deleteAttribute('normal'); parts.push(rg.index ? rg.toNonIndexed() : rg);
  });
  add(LW * 4, 0.025, 0.07, 0, 0.125, HIT_Z, '#fff4d6', 1.6); // the hit line itself
  let tot = 0; parts.forEach((g) => { tot += g.attributes.position.count; }); const pos = new Float32Array(tot * 3), col = new Float32Array(tot * 3); let o = 0; parts.forEach((g) => { pos.set(g.attributes.position.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; });
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); bg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const deco = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })); deco.frustumCulled = false; group.add(deco);

  // --- gems: one instanced mesh per lane ---
  const NG = 36, gems = LANES.map((L, i) => {
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false }), im = new THREE.InstancedMesh(gemGeo(i, rnd), mat, NG); im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); const z = new THREE.Matrix4().makeScale(0, 0, 0), w = new THREE.Color(1, 1, 1); for (let k = 0; k < NG; k++) { im.setMatrixAt(k, z); im.setColorAt(k, w); } im.instanceColor.setUsage(THREE.DynamicDrawUsage); im.count = 0; group.add(im); return im;
  });
  // glow pools under each gem (additive) + press flashes and beams at the receptors
  const halos = glowSheet(NG * 4, 'soft', 1, 1); halos.rotation.x = -Math.PI / 2; group.add(halos);
  const flash = glowSheet(8, 'soft', 1, 1); flash.rotation.x = -Math.PI / 2; group.add(flash);
  const beams = glowSheet(4, 'beam', 1, 1); group.add(beams);

  const dummy = new THREE.Object3D(), tc = new THREE.Color(), cMiss = new THREE.Color(0.32, 0.3, 0.4), cWhite = new THREE.Color(1, 1, 1), m4 = new THREE.Matrix4(), zeroM = new THREE.Matrix4().makeScale(0, 0, 0);
  const laneC = LANES.map((L) => C(L.color)); let beatsApproach = 2.4, nHalo = 0;
  function setApproach(approach, spb) {
    beatsApproach = approach / spb; const a = uv.array; // v = beats from the hit line / 4 (one texture = a 4 beat period); u across lanes
    const zOf = [FAR_Z, FAR_Z, NEAR_Z, NEAR_Z]; for (let k = 0; k < uv.count; k++) { const z = zOf[k]; a[k * 2 + 1] = ((HIT_Z - z) / (HIT_Z - SPAWN_Z)) * beatsApproach / 4; } uv.needsUpdate = true;
  }
  // g: { T, spb, approach, notes:[{lane, time, state, id, hitT}], press:[0..1 x4], energy, t }
  const cnt = [0, 0, 0, 0];
  function update(g) {
    const T = g.T, spb = g.spb, ap = g.approach, span = HIT_Z - SPAWN_Z; tex.offset.y = (T / spb / 4) % 1;
    cnt[0] = cnt[1] = cnt[2] = cnt[3] = 0; nHalo = 0;
    for (let ni = 0; ni < g.notes.length; ni++) {
      const n = g.notes[ni], dt = n.time - T; if (n.state === 1 || n.state === 2) continue;          // hit notes vanish (sparks take over)
      if (dt > ap * 1.001 || dt < -0.55) continue; const z = HIT_Z - dt / ap * span, L = n.lane; if (cnt[L] >= NG) continue;
      const miss = n.state === 3, pop = Math.min(1, (ap - dt) / (ap * 0.1)), fade = miss ? Math.max(0, 1 + dt / 0.5) : 1, s = 1.18 * (0.55 + 0.45 * pop) * (1 - (1 - fade) * 0.4) * (1 + (!miss && dt < 0.12 && dt > -0.1 ? 0.12 : 0));
      dummy.position.set(laneX(L), GEM_Y + (miss ? 0 : Math.sin(g.t * 3 + n.id) * 0.03), z); dummy.rotation.set(0.0, g.t * 1.2 + n.id * 0.9, 0); dummy.scale.set(s, s * (miss ? 0.6 : 1), s); dummy.updateMatrix();
      const idx = cnt[L]++; gems[L].setMatrixAt(idx, dummy.matrix); gems[L].setColorAt(idx, miss ? cMiss : cWhite);
      if (!miss && nHalo < NG * 4) { const hs = (2.1 + (dt < 0.3 && dt > -0.1 ? 0.4 : 0)) * pop; m4.makeScale(hs, hs, hs); m4.setPosition(laneX(L), -z, 0.14); halos.setMatrixAt(nHalo, m4); const k = 0.55 * pop; tc.copy(laneC[L]).multiplyScalar(k); halos.setColorAt(nHalo, tc); nHalo++; }
    }
    for (let L = 0; L < 4; L++) { gems[L].count = cnt[L]; gems[L].instanceMatrix.needsUpdate = true; if (gems[L].instanceColor) gems[L].instanceColor.needsUpdate = true; }
    for (let k = nHalo; k < NG * 4; k++) { halos.setMatrixAt(k, zeroM); tc.setRGB(0, 0, 0); halos.setColorAt(k, tc); if (k > nHalo + 3) break; } // clear a few trailing slots (older ones are always zeroed by the loop above)
    halos.count = Math.min(NG * 4, nHalo + 4); halos.instanceMatrix.needsUpdate = true; if (halos.instanceColor) halos.instanceColor.needsUpdate = true;
    // receptor flashes + beams
    for (let L = 0; L < 4; L++) {
      const p = g.press[L], x = laneX(L), idle = 0.16 + 0.1 * (0.5 + 0.5 * Math.sin(g.t * 4 + L)) * (0.3 + g.energy);
      const fs = 1.5 + p * 0.9; m4.makeScale(fs, fs, fs); m4.setPosition(x, -HIT_Z, 0.16); flash.setMatrixAt(L, m4); tc.copy(laneC[L]).multiplyScalar(idle + p * 1.5); flash.setColorAt(L, tc);
      const bh = 1.2 + p * 2.6; m4.makeScale(1.0 + p * 0.3, bh, 1); m4.setPosition(x, bh / 2 + 0.1, HIT_Z + 0.02); beams.setMatrixAt(L, m4); tc.copy(laneC[L]).multiplyScalar(p * 1.35); beams.setColorAt(L, tc);
    }
    flash.instanceMatrix.needsUpdate = true; flash.instanceColor.needsUpdate = true; beams.instanceMatrix.needsUpdate = true; beams.instanceColor.needsUpdate = true;
  }
  return { group, update, setApproach, gems, surface, deco, texture: tex };
}
