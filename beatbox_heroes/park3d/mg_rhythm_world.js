// Busking rhythm game: the golden-hour street stage. Crate stage + amps, brick backdrop with a neon sign, string lights, spot beams,
// paved plaza with lawn, trees, skyline and clouds from the park flora, a few pigeons. Static geometry is merged into a handful of meshes.
import { THREE, flatMat, rng, canvasTex, jitter, leafShadow } from './kit.js';
import { xf } from './flora_common.js';
import { makeOak, makePine, PALS } from './flora_trees.js';
import { buildSkyline, buildClouds } from './flora_sky.js';
import { glowSheet } from './mg_rhythm_fx.js';

export const STAGE = { z: -12.4, front: -10.1, back: -14.5, w: 9.2, h: 0.6 };
const C = (h) => new THREE.Color(h);
const mixc = (a, b, t) => C(a).lerp(C(b), t);

// ---- tiny geometry collector (painted, non-indexed, merged at the end) ----
class Bag {
  constructor() { this.p = []; this.c = []; }
  add(geo, color, tint, r) {
    const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, c = C(color), t = new THREE.Color(); r = r || Math.random;
    for (let i = 0; i < p.count; i += 3) { const f = (r() - 0.5) * (tint === undefined ? 0.07 : tint); t.setRGB(c.r + f, c.g + f, c.b + f); for (let k = 0; k < 3; k++) { this.p.push(p.getX(i + k), p.getY(i + k), p.getZ(i + k)); this.c.push(t.r, t.g, t.b); } }
  }
  box(w, h, d, x, y, z, color, o) { o = o || {}; const g = new THREE.BoxGeometry(w, h, d); if (o.ry || o.rx || o.rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'))); g.translate(x, y, z); this.add(g, color, o.tint, o.r); }
  cyl(rt, rb, h, seg, x, y, z, color, o) { o = o || {}; const g = new THREE.CylinderGeometry(rt, rb, h, seg || 6, 1); if (o.rx || o.rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(o.rx || 0, 0, o.rz || 0))); g.translate(x, y, z); this.add(g, color, o.tint, o.r); }
  // thin round rod between two points
  rod(a, b, rad, color) { const d = new THREE.Vector3().subVectors(b, a), len = d.length(), g = new THREE.CylinderGeometry(rad, rad, len, 4, 1); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize())); const m = a.clone().add(b).multiplyScalar(0.5); g.translate(m.x, m.y, m.z); this.add(g, color, 0.02); }
  geo() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.computeVertexNormals(); return g; }
}
// drop the triangles of a non-indexed mesh whose centroid fails keep(x, z): the skyline behind the camera and far off to the sides is never seen
function cullTris(mesh, keep) {
  const g = mesh.geometry, p = g.attributes.position, names = Object.keys(g.attributes), out = {}; names.forEach((k) => { out[k] = []; });
  for (let i = 0; i < p.count; i += 3) { const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3; if (!keep(x, z)) continue; names.forEach((k) => { const a = g.attributes[k], n = a.itemSize; for (let v = 0; v < 3; v++) for (let c = 0; c < n; c++) out[k].push(a.array[(i + v) * n + c]); }); }
  const ng = new THREE.BufferGeometry(); names.forEach((k) => ng.setAttribute(k, new THREE.Float32BufferAttribute(out[k], g.attributes[k].itemSize))); mesh.geometry.dispose(); mesh.geometry = ng;
}
function meshOf(bag, mat, cast, recv) { const m = new THREE.Mesh(bag.geo(), mat || flatMat()); m.castShadow = !!cast; m.receiveShadow = recv !== false; return m; }

function brickTexture() {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#d6b9a0'; g.fillRect(0, 0, w, h); const R = rng(9), cols = ['#b5573f', '#a24c3f', '#c4664a', '#ae5242', '#9a4a44', '#b96148'];
    const bw = 32, bh = 16; for (let y = 0, r = 0; y < h; y += bh, r++) for (let x = -(r % 2) * bw / 2; x < w; x += bw) { g.fillStyle = cols[(R() * cols.length) | 0]; if (R() < 0.06) g.fillStyle = '#8c4a5e'; g.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3); g.fillStyle = 'rgba(255,220,180,0.12)'; g.fillRect(x + 1.5, y + 1.5, bw - 3, 2); }
    // a little graffiti: tags in the park palette
    g.font = 'bold 40px Impact, Arial Black, sans-serif'; g.textBaseline = 'middle'; g.lineWidth = 5; g.strokeStyle = '#2b2438'; g.fillStyle = '#ffd23f'; g.strokeText('B', 60, 190); g.fillText('B', 60, 190); g.fillStyle = '#29d3c7'; g.strokeText('K', 452, 205); g.fillText('K', 452, 205);
    g.fillStyle = '#ff4f8b'; g.beginPath(); g.arc(440, 60, 18, 0, 6.3); g.fill(); g.strokeStyle = '#2b2438'; g.lineWidth = 4; g.stroke();
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(60,30,90,0.28)'); gr.addColorStop(0.5, 'rgba(60,30,90,0)'); gr.addColorStop(1, 'rgba(60,30,90,0.3)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
function neonTexture(text) {
  return canvasTex(512, 160, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 96px Impact, Arial Black, sans-serif';
    g.shadowColor = '#ff3ea5'; g.shadowBlur = 26; g.fillStyle = '#ff3ea5'; g.fillText(text, w / 2, h / 2 + 4); g.fillText(text, w / 2, h / 2 + 4);
    g.shadowBlur = 8; g.shadowColor = '#fff'; g.fillStyle = '#ffe3f2'; g.fillText(text, w / 2, h / 2 + 4);
  });
}

export function buildWorld(ctx, q) {
  const group = new THREE.Group(); group.name = 'rhythm_world'; const R = rng(4107), ST = STAGE;
  const mat = flatMat();
  // ---------------- ground: lawn plane + paved plaza oval + sand rim, painted per triangle (two small planes, one merged mesh) ----------------
  { const pave = ['#b8aec7', '#a79cba', '#c8bfd6'].map(C), sand = C('#d8b98c'), grass = ['#5cae52', '#4f9a4a', '#438a45', '#6bb85a'].map(C), shade = C('#4a3a78'), t = new THREE.Color();
    const plane = (w, d, sx, sz, cz, y) => { const g = new THREE.PlaneGeometry(w, d, sx, sz); g.rotateX(-Math.PI / 2); g.translate(0, y, cz); const ng = g.toNonIndexed(), p = ng.attributes.position, a = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i += 3) {
        const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, cz2 = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3, ex = cx / 8.8, ez = (cz2 + 5.5) / 16.5, d2 = Math.sqrt(ex * ex + ez * ez), cell = (Math.floor(cx / 1.25) + Math.floor(cz2 / 1.25));
        if (y > 0) { if (d2 < 1) { t.copy(pave[((cell % 3) + 3) % 3]); t.lerp(C('#e9d9c4'), Math.max(0, 0.5 - d2) * 0.35); t.multiplyScalar(0.94 + R() * 0.1); if (d2 > 0.88) t.lerp(sand, 0.55); } else if (d2 < 1.06) t.copy(sand).multiplyScalar(0.95 + R() * 0.08); else t.setRGB(0, 0, 0); }
        else { t.copy(grass[(R() * 4) | 0]); t.lerp(shade, Math.min(0.4, Math.max(0, (d2 - 1.1) * 0.18))); t.multiplyScalar(0.92 + R() * 0.14); }
        for (let k = 0; k < 3; k++) { a[(i + k) * 3] = t.r; a[(i + k) * 3 + 1] = t.g; a[(i + k) * 3 + 2] = t.b; }
      }
      // plaza triangles outside the oval (flagged black) are dropped
      if (y > 0) { const keepP = [], keepC = []; for (let i = 0; i < p.count; i += 3) { if (a[i * 3] === 0 && a[i * 3 + 1] === 0) continue; for (let k = 0; k < 3; k++) { keepP.push(p.getX(i + k), p.getY(i + k), p.getZ(i + k)); keepC.push(a[(i + k) * 3], a[(i + k) * 3 + 1], a[(i + k) * 3 + 2]); } } ng.setAttribute('position', new THREE.Float32BufferAttribute(keepP, 3)); ng.setAttribute('color', new THREE.Float32BufferAttribute(keepC, 3)); } else ng.setAttribute('color', new THREE.BufferAttribute(a, 3));
      ng.deleteAttribute('uv'); ng.deleteAttribute('normal'); return ng; };
    const lawn = plane(96, 84, 24, 21, -14, 0), plaza = plane(19.6, 34.5, 16, 28, -5.5, 0.012), n1 = lawn.attributes.position.count, n2 = plaza.attributes.position.count, pos = new Float32Array((n1 + n2) * 3), col = new Float32Array((n1 + n2) * 3);
    pos.set(lawn.attributes.position.array, 0); col.set(lawn.attributes.color.array, 0); pos.set(plaza.attributes.position.array, n1 * 3); col.set(plaza.attributes.color.array, n1 * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals(); const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.name = 'ground'; group.add(m); }

  // ---------------- stage: crates + deck + amps + mic + tip jar ----------------
  const stage = new Bag(), wood = ['#b07342', '#9a6035', '#c48650', '#a56a3c'], dark = '#5a3a2a', lite = '#d49a62';
  const crate = (x, y, z, w, h, d, ry) => { const c = wood[(R() * 4) | 0]; stage.box(w, h, d, x, y + h / 2, z, c, { tint: 0.08, ry, r: R }); [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => stage.box(0.1, h + 0.02, 0.1, x + Math.cos(ry || 0) * a * (w / 2 - 0.04) + Math.sin(ry || 0) * b * (d / 2 - 0.04), y + h / 2, z - Math.sin(ry || 0) * a * (w / 2 - 0.04) + Math.cos(ry || 0) * b * (d / 2 - 0.04), dark, { ry, tint: 0.04, r: R })); };
  const cw = ST.w / 8; for (let i = 0; i < 8; i++) { crate(-ST.w / 2 + cw * (i + 0.5), 0, ST.front - 0.55, cw - 0.04, ST.h - 0.14, 1.05, 0); crate(-ST.w / 2 + cw * (i + 0.5), 0, ST.front - 1.65, cw - 0.04, ST.h - 0.14, 1.05, 0); crate(-ST.w / 2 + cw * (i + 0.5), 0, ST.front - 2.75, cw - 0.04, ST.h - 0.14, 1.05, 0); crate(-ST.w / 2 + cw * (i + 0.5), 0, ST.front - 3.85, cw - 0.04, ST.h - 0.14, 1.05, 0); }
  for (let i = 0; i < 9; i++) { const dw = ST.w / 9; stage.box(dw - 0.02, 0.14, 4.4, -ST.w / 2 + dw * (i + 0.5), ST.h - 0.07, (ST.front + ST.back) / 2, mixc('#c07f48', '#a8693b', R()).getStyle(), { tint: 0.05, r: R }); }
  stage.box(ST.w + 0.12, 0.05, 0.1, 0, ST.h - 0.02, ST.front + 0.03, '#ffd27a', { tint: 0.02 });  // front lip, lit by the lamps
  // loose crates in front as steps and a tip jar
  crate(-3.9, 0, ST.front + 0.65, 0.8, 0.5, 0.8, 0.4); crate(3.7, 0, ST.front + 0.7, 0.9, 0.6, 0.9, -0.25); crate(4.35, 0, ST.front + 0.15, 0.7, 0.42, 0.7, 0.2); crate(-3.2, 0, ST.front + 1.3, 0.6, 0.38, 0.6, 0.9);
  stage.cyl(0.2, 0.17, 0.3, 8, -3.5, 0.15, ST.front + 1.7, '#e0703a'); stage.cyl(0.21, 0.21, 0.04, 8, -3.5, 0.3, ST.front + 1.7, '#ffd23f');
  // amp stacks
  const amp = (x, z, ry, big) => {
    const H = big ? 1.3 : 0.95, W = 1.15, D = 0.72, y0 = ST.h; const rot = (px, pz) => [x + Math.cos(ry) * px + Math.sin(ry) * pz, z - Math.sin(ry) * px + Math.cos(ry) * pz];
    stage.box(W, H, D, x, y0 + H / 2, z, '#34304a', { ry, tint: 0.05 }); stage.box(W + 0.04, 0.06, D + 0.04, x, y0 + H, z, '#26223a', { ry, tint: 0.02 });
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => { const [qx, qz] = rot(a * (W / 2), b * (D / 2)); stage.box(0.09, 0.09, 0.09, qx, y0 + (b > 0 ? 0.05 : H - 0.04), qz, '#ffd23f', { ry, tint: 0.02 }); });
    const spk = (px, py) => { const [qx, qz] = rot(px, D / 2 + 0.01); stage.cyl(0.3, 0.3, 0.05, 8, qx, y0 + py, qz, '#2b2438', { rx: Math.PI / 2, tint: 0.02 }); stage.cyl(0.22, 0.12, 0.08, 8, qx, y0 + py, qz + 0.0, '#8d8da8', { rx: Math.PI / 2, tint: 0.04 }); stage.cyl(0.07, 0.07, 0.1, 6, qx, y0 + py, qz + 0.02, '#c8c8dc', { rx: Math.PI / 2, tint: 0.02 }); };
    if (big) { spk(-0.26, H * 0.3); spk(0.26, H * 0.3); spk(-0.26, H * 0.74); spk(0.26, H * 0.74); } else { spk(0, H * 0.46); }
  };
  amp(-3.25, ST.z - 0.45, 0.28, true); amp(3.25, ST.z - 0.45, -0.28, true); amp(-3.6, ST.z + 0.6, 0.6, false); amp(3.6, ST.z + 0.6, -0.6, false);
  // monitors (wedges) at the front lip
  [[-1.5, 0.3], [1.5, -0.3]].forEach(([x, ry]) => { stage.box(0.8, 0.28, 0.5, x, ST.h + 0.14, ST.front - 0.4, '#34304a', { ry, tint: 0.04, rx: 0.0 }); stage.box(0.78, 0.04, 0.34, x, ST.h + 0.3, ST.front - 0.35, '#5e5e7a', { ry, tint: 0.03 }); });

  // ---------------- backdrop: brick wall with coping, pilasters and a neon sign ----------------
  const wallZ = ST.back - 0.4, WW = 13.6, WH = 6.7; const bt = brickTexture(); bt.wrapS = bt.wrapT = THREE.RepeatWrapping; bt.repeat.set(WW / 7, WH / 3.4);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(WW, WH, 0.6), [flatMat({ vertexColors: false, color: '#9a7a6a' }), flatMat({ vertexColors: false, color: '#9a7a6a' }), flatMat({ vertexColors: false, color: '#b08a78' }), flatMat({ vertexColors: false, color: '#9a7a6a' }), new THREE.MeshLambertMaterial({ map: bt, flatShading: true }), new THREE.MeshLambertMaterial({ map: bt, flatShading: true })]);
  wall.position.set(0, WH / 2, wallZ); wall.castShadow = true; wall.receiveShadow = true; group.add(wall);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 3.5), new THREE.MeshLambertMaterial({ flatShading: true, map: canvasTex(512, 310, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#3d2c6c'); gr.addColorStop(1, '#241a44'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,62,165,0.35)'; g.lineWidth = 6; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(w / 2, h * 0.62, 40 + i * 34, 0, 6.3); g.stroke(); } g.strokeStyle = 'rgba(53,242,224,0.28)'; g.lineWidth = 3; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(w / 2, h * 0.62, 56 + i * 34, 0, 6.3); g.stroke(); }
    g.fillStyle = 'rgba(255,240,214,0.7)'; const r = rng(5); for (let i = 0; i < 40; i++) { const x = r() * w, y = r() * h, s = 1 + r() * 2.2; g.fillRect(x, y, s, s); }
  }) }));
  banner.position.set(0, 2.35, wallZ + 0.34); banner.receiveShadow = true; group.add(banner);
  const frame = stage; frame.box(6.0, 0.1, 0.14, 0, 4.13, wallZ + 0.36, '#2b2438', { tint: 0 }); frame.box(6.0, 0.1, 0.14, 0, 0.62, wallZ + 0.36, '#2b2438', { tint: 0 }); frame.box(0.1, 3.6, 0.14, -2.95, 2.37, wallZ + 0.36, '#2b2438', { tint: 0 }); frame.box(0.1, 3.6, 0.14, 2.95, 2.37, wallZ + 0.36, '#2b2438', { tint: 0 });
  frame.box(5.9, 0.05, 0.05, 0, 4.0, wallZ + 0.46, '#ff3ea5', { tint: 0 });
  const trim = stage; trim.box(WW + 0.5, 0.26, 0.9, 0, WH + 0.1, wallZ, '#b5adbf', { tint: 0.05 });
  [-WW / 2 + 0.2, -3.6, 3.6, WW / 2 - 0.2].forEach((x, i) => { const w = i === 0 || i === 3 ? 0.9 : 0.5; trim.box(w, WH + 0.1, 0.5, x, WH / 2, wallZ + 0.4, '#c9a98f', { tint: 0.05 }); trim.box(w + 0.25, 0.2, 0.7, x, WH + 0.2, wallZ + 0.4, '#b5adbf', { tint: 0.04 }); });
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 1.94), new THREE.MeshBasicMaterial({ map: neonTexture('BEATBOX'), transparent: true, toneMapped: false, depthWrite: false, fog: false })); neon.position.set(0, 5.3, wallZ + 0.33); neon.renderOrder = 4; group.add(neon);

  // ---------------- poles + string lights ----------------
  const poles = stage, bulbPos = [], BCOL = ['#ffd27a', '#ffd27a', '#ff6fb0', '#ffd27a', '#6ff6ec', '#ffd27a'];
  const pole = (x, z, h) => { poles.cyl(0.09, 0.13, h, 6, x, h / 2, z, '#6a4230', { tint: 0.05 }); poles.box(0.5, 0.08, 0.08, x, h - 0.1, z, '#4b3547', { tint: 0.03 }); poles.cyl(0.18, 0.2, 0.18, 6, x, 0.09, z, '#8d8397', { tint: 0.05 }); };
  const strand = (a, b, sag, n) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b); let prev = null;
    for (let i = 0; i <= 14; i++) { const u = i / 14, p = A.clone().lerp(B, u); p.y -= sag * 4 * u * (1 - u); if (prev) poles.rod(prev, p, 0.012, '#2b2438'); prev = p; }
    for (let i = 0; i < n; i++) { const u = (i + 0.5) / n, p = A.clone().lerp(B, u); p.y -= sag * 4 * u * (1 - u); bulbPos.push([p.x, p.y - 0.09, p.z, BCOL[bulbPos.length % BCOL.length]]); poles.cyl(0.02, 0.02, 0.07, 4, p.x, p.y - 0.035, p.z, '#2b2438', { tint: 0 }); }
  };
  const PX = 5.15; [[PX, -9.7], [-PX, -9.7], [PX, -4.6], [-PX, -4.6], [PX, 0.6], [-PX, 0.6]].forEach(([x, z]) => pole(x, z, 4.6));
  strand([-PX, 4.5, -9.7], [PX, 4.5, -9.7], 0.55, 16); strand([-PX, 4.5, -4.6], [PX, 4.5, -4.6], 0.6, 16); if (q !== 'low') strand([-PX, 4.5, 0.6], [PX, 4.5, 0.6], 0.62, 16);
  strand([-PX, 4.5, -9.7], [-PX, 4.5, -4.6], 0.4, 8); strand([PX, 4.5, -9.7], [PX, 4.5, -4.6], 0.4, 8); strand([-PX, 4.5, -4.6], [-PX, 4.5, 0.6], 0.4, 8); strand([PX, 4.5, -4.6], [PX, 4.5, 0.6], 0.4, 8);
  // stage truss with spot cans
  poles.box(8.6, 0.12, 0.12, 0, 4.3, ST.front - 0.2, '#3a3a4f', { tint: 0.03 }); [-4.3, 4.3].forEach((x) => poles.box(0.12, 4.3, 0.12, x, 2.15, ST.front - 0.2, '#3a3a4f', { tint: 0.03 }));
  [-3.3, -2.0, 2.0, 3.3].forEach((x) => { poles.cyl(0.16, 0.22, 0.34, 6, x, 4.13, ST.front - 0.2, '#2b2438', { tint: 0.03 }); });
  // ---------------- spot beams (additive cones, vertex alpha via colour) ----------------
  const beamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide }); beamMat.forceSinglePass = true;
  const mkBeam = (hex, len, rad) => { // two nested cones (bright core, dim wide skirt) so the beam edge is soft
    const one = (r, gain) => { const g = new THREE.ConeGeometry(r, len, 10, 1, true); g.translate(0, -len / 2, 0); const p = g.attributes.position, a = new Float32Array(p.count * 3), c = C(hex); for (let i = 0; i < p.count; i++) { const k = 1 - Math.min(1, Math.max(0, -p.getY(i) / len)); const f = (0.02 + 0.2 * k * k) * gain; a[i * 3] = c.r * f; a[i * 3 + 1] = c.g * f; a[i * 3 + 2] = c.b * f; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g; };
    const A = one(rad, 0.7), B = one(rad * 0.55, 1.1), tot = A.attributes.position.count + B.attributes.position.count, pos = new Float32Array(tot * 3), col = new Float32Array(tot * 3); pos.set(A.attributes.position.array, 0); col.set(A.attributes.color.array, 0); pos.set(B.attributes.position.array, A.attributes.position.count * 3); col.set(B.attributes.color.array, A.attributes.position.count * 3);
    const g = new THREE.BufferGeometry(); g.setIndex([...Array.from(A.index.array), ...Array.from(B.index.array).map((v) => v + A.attributes.position.count)]); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g; };
  const beams = [];
  [[-3.3, '#ff3ea5', 0], [3.3, '#35f2e0', 0], [-2.0, '#ffd27a', 1], [2.0, '#a86bff', 1]].forEach(([x, hex, hi], i) => {
    const pivot = new THREE.Object3D(); pivot.position.set(x, 3.96, ST.front - 0.2); const m = new THREE.Mesh(mkBeam(hex, 5.4, 0.95), ((mm) => { mm.forceSinglePass = true; return mm; })(beamMat.clone())); m.frustumCulled = false; m.renderOrder = 8; pivot.add(m); group.add(pivot); beams.push({ pivot, mesh: m, hi, base: x, ph: i * 1.7 });
  });
  if (q === 'low') { beams.splice(2); }

  // ---------------- trees, lamp posts, hedges (park house style) ----------------
  const trees = []; const tp = [[-10.5, -8.5, 1.35, 'o'], [10.8, -9, 1.4, 'm'], [-11.4, -1.5, 1.25, 'o'], [11.6, -2.5, 1.3, 'c'], [-7.8, -16.8, 1.5, 'o'], [8.6, -17, 1.45, 'o'], [-12.8, -13.5, 1.2, 'p'], [13, -12.5, 1.25, 'p'], [-13.2, 3, 1.15, 'o'], [13.4, 4, 1.15, 'o']];
  if (q === 'low') tp.length = 6;
  tp.forEach(([x, z, s, k], i) => { const g = k === 'p' ? makePine(300 + i, s * 1.1) : makeOak(300 + i, k === 'm' ? PALS.MAPLE : k === 'c' ? PALS.CHERRY : (i % 2 ? PALS.OAK2 : PALS.OAK), s); trees.push(xf(g, { x, y: 0, z, ry: R() * 6 })); });
  { const parts = trees.map((g) => (g.attributes.uv ? (g.deleteAttribute('uv'), g) : g)); let tot = 0; parts.forEach((g) => { tot += g.attributes.position.count; }); const pos = new Float32Array(tot * 3), col = new Float32Array(tot * 3); let o = 0; parts.forEach((g) => { const gg = g.index ? g.toNonIndexed() : g; pos.set(gg.attributes.position.array, o * 3); col.set(gg.attributes.color.array, o * 3); o += gg.attributes.position.count; });
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, o * 3), 3)); bg.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, o * 3), 3)); bg.computeVertexNormals(); const tm = new THREE.Mesh(bg, mat); tm.castShadow = q !== 'low'; leafShadow(tm, { minY: 1.7 }); tm.receiveShadow = true; tm.name = 'trees'; group.add(tm); }
  const props = stage;
  // hedges + planters along the plaza edge, benches
  for (let i = 0; i < 9; i++) { const side = i % 2 ? 1 : -1, z = 4.2 - Math.floor(i / 2) * 3.4, x = side * 8.6; props.box(1.7, 0.6, 0.9, x, 0.3, z, '#8a5a3a', { tint: 0.06, r: R, ry: side * 1.5708 }); const b = jitter(new THREE.IcosahedronGeometry(0.62, 1), 0.2, R); b.scale(1.3, 0.8, 0.9); b.translate(x, 0.82, z); props.add(b, ['#3f9b5a', '#58b667', '#2f7d4e'][i % 3], 0.1, R); [0, 1].forEach((k) => { const f = jitter(new THREE.IcosahedronGeometry(0.1, 0), 0.04, R); f.translate(x + (k - 0.5) * 0.7, 1.15 + k * 0.1, z + (R() - 0.5) * 0.4); props.add(f, ['#ff4f8b', '#ffd23f', '#fff2dc'][(i + k) % 3], 0.05, R); }); }
  const bench = (x, z, ry) => { const c = Math.cos(ry), s = Math.sin(ry), at = (px, pz) => [x + c * px + s * pz, z - s * px + c * pz]; props.box(1.5, 0.08, 0.44, x, 0.44, z, '#a66b3f', { ry, tint: 0.05 }); const [bx, bz] = at(0, -0.22); props.box(1.5, 0.4, 0.07, bx, 0.74, bz, '#b07342', { ry, tint: 0.05 }); [-0.62, 0.62].forEach((px) => { const [qx, qz] = at(px, 0); props.box(0.07, 0.44, 0.44, qx, 0.22, qz, '#3a3a4f', { ry, tint: 0.02 }); }); };
  bench(-6.6, -11.2, 1.0); bench(6.6, -11.6, -1.0);
  // lamp posts (iron post + glowing globe) flanking the plaza, plus real glow comes from the lighting module's lamp list
  const lampsIron = stage, lampGlow = [];
  [[-6.3, -7.5], [6.3, -7.5], [-6.5, 2.4], [6.5, 2.4]].forEach(([x, z]) => { lampsIron.cyl(0.07, 0.12, 3.5, 6, x, 1.75, z, '#3a3550', { tint: 0.04 }); lampsIron.cyl(0.17, 0.2, 0.2, 6, x, 0.1, z, '#2b2438', { tint: 0.03 }); lampsIron.cyl(0.26, 0.2, 0.12, 6, x, 3.55, z, '#2b2438', { tint: 0.03 }); lampGlow.push([x, 3.8, z]); });
  const stageMesh = meshOf(stage, mat, q !== 'low', true); stageMesh.name = 'stage'; group.add(stageMesh);
  // bulbs (string lights + lamp globes): tiny glowing icospheres in ONE instanced draw, plus soft halos (additive) for the string bulbs
  const bulbG = new THREE.IcosahedronGeometry(0.075, 0), nB = bulbPos.length, bulbs = new THREE.InstancedMesh(bulbG, new THREE.MeshBasicMaterial({ toneMapped: false }), nB + lampGlow.length), tcol = new THREE.Color(), dm = new THREE.Matrix4();
  bulbPos.forEach((b, i) => { dm.makeTranslation(b[0], b[1], b[2]); bulbs.setMatrixAt(i, dm); bulbs.setColorAt(i, tcol.set(b[3]).multiplyScalar(1.6)); });
  lampGlow.forEach((p, i) => { dm.makeScale(2.7, 2.7, 2.7); dm.setPosition(p[0], p[1], p[2]); bulbs.setMatrixAt(nB + i, dm); bulbs.setColorAt(nB + i, tcol.set('#ffc46b').multiplyScalar(2.2)); }); bulbs.frustumCulled = false; group.add(bulbs);
  const halos = glowSheet(nB, 'soft', 1, 1); const baseCols = bulbPos.map((b) => C(b[3])); group.add(halos);
  const hm = new THREE.Matrix4(); bulbPos.forEach((b, i) => { hm.makeScale(0.5, 0.5, 0.5); hm.setPosition(b[0], b[1], b[2]); halos.setMatrixAt(i, hm); });

  // ---------------- skyline + clouds (reuse the park's) ----------------
  let skyline = null;
  try { skyline = buildSkyline(ctx, { minX: -15, maxX: 15, minZ: -17, maxZ: 6 }, rng(31337), () => 0); [skyline.body, skyline.lit].forEach((m) => cullTris(m, (x, z) => z < 9 && Math.abs(x) < 0.6 * (11.4 - z) + 16)); group.add(skyline.group); } catch (e) { console.error('[rhythm] skyline failed ' + e); }
  try { group.add(buildClouds(rng(808)).mesh); } catch (e) { console.error('[rhythm] clouds failed ' + e); }

  // ---------------- pigeons ----------------
  const pig = buildPigeons(q, R); group.add(pig.group);

  const state = { glow: 0 };
  function update(dt, t, v) {
    const E = v.energy, beat = v.beat, pulse = Math.exp(-(beat % 1) * 4);
    // string lights breathe with the crowd
    const lvl = 0.5 + E * 0.9 + pulse * 0.25 * E, tc = new THREE.Color();
    for (let i = 0; i < baseCols.length; i++) { const tw = 0.85 + 0.15 * Math.sin(t * 3 + i * 1.7); tc.copy(baseCols[i]).multiplyScalar(lvl * tw * 0.6); halos.setColorAt(i, tc); }
    halos.instanceColor.needsUpdate = true;
    // beams: base pair always on, second pair joins above 35% energy, they sweep faster as the crowd heats up
    beams.forEach((b, i) => { const on = b.hi ? Math.max(0, (E - 0.3) / 0.4) : 0.45 + 0.5 * E; const sw = Math.sin(t * (0.9 + E * 1.6) + b.ph) * (b.hi ? 0.55 : 0.12); b.pivot.lookAt(new THREE.Vector3(b.base * 0.95 + sw * 1.4, 0.5, ST.z + 1.2 + (b.hi ? 0.4 : 0))); b.mesh.material.opacity = Math.min(1, on * (0.75 + 0.35 * pulse)); b.mesh.visible = b.mesh.material.opacity > 0.02; });
    pig.update(dt, t, E, v.flee);
  }
  // beams point their -Y axis (cone tip at origin, body toward -Y) at the target: lookAt aims +Z, so pre-rotate once
  beams.forEach((b) => { b.mesh.rotation.x = -Math.PI / 2; });
  return { group, update, pigeons: pig, skyline, bulbs: bulbPos.length, stageMesh };
}

// ---------------- pigeons (instanced bodies + wings), pecking on the plaza, scattering at big moments ----------------
function buildPigeons(q, R) {
  const group = new THREE.Group(); group.name = 'pigeons'; const n = q === 'low' ? 3 : 6;
  const body = new Bag(), wing = new Bag(); const gray = '#8d8da8', neck = '#5f9a98', dk = '#6b6b84';
  const sph = (rad, sx, sy, sz, x, y, z, hex) => { const g = new THREE.IcosahedronGeometry(rad, 0); g.scale(sx, sy, sz); g.translate(x, y, z); body.add(g, hex, 0.06, R); };
  sph(0.1, 1, 0.9, 1.45, 0, 0.17, 0, gray); sph(0.062, 1, 1, 1, 0, 0.27, 0.12, neck); sph(0.05, 1, 1, 1, 0, 0.31, 0.17, gray); body.box(0.025, 0.02, 0.05, 0, 0.3, 0.23, '#e0a050', { tint: 0 }); body.box(0.07, 0.02, 0.14, 0, 0.17, -0.17, dk, { tint: 0.03, rx: 0.3 });
  body.box(0.012, 0.09, 0.012, 0.03, 0.045, 0, '#d98a8a', { tint: 0 }); body.box(0.012, 0.09, 0.012, -0.03, 0.045, 0, '#d98a8a', { tint: 0 });
  const wg = new THREE.BoxGeometry(0.34, 0.022, 0.27); wg.translate(0.17, 0, 0); wing.add(wg, dk, 0.05, R);
  const bm = new THREE.InstancedMesh(body.geo(), flatMat(), n), wm = new THREE.InstancedMesh(wing.geo(), flatMat({ side: THREE.DoubleSide }), n * 2);
  bm.castShadow = q !== 'low'; bm.frustumCulled = false; wm.frustumCulled = false; group.add(bm, wm);
  const homes = [[-3.9, -10.9, 0.6], [3.8, -10.8, 0.6], [-2.95, -8.4, 0], [2.95, -8.0, 0], [-2.2, -10.5, 0.6], [2.4, -10.45, 0.6]].slice(0, n), P = homes.map((h, i) => ({ hx: h[0], hz: h[1], hy: h[2], x: h[0], z: h[1], y: 0, ph: R() * 6, fly: 0, ret: 0, spd: 0.8 + R(), dir: R() * 6.28, peck: R() * 4 }));
  const o = new THREE.Object3D(), wo = new THREE.Object3D();
  function update(dt, t, E, flee) {
    for (let i = 0; i < n; i++) {
      const p = P[i];
      if (flee && p.fly <= 0 && p.ret <= 0) { p.fly = 0.001; p.vx = (R() - 0.5) * 3; p.vz = -2 - R() * 3; p.vy = 4 + R() * 2; }
      if (p.fly > 0) { p.fly += dt; p.vy -= dt * 2.2; p.x += p.vx * dt; p.z += p.vz * dt; p.y = Math.max(0, p.y + p.vy * dt); if (p.fly > 3.2) { p.fly = 0; p.ret = 0.001; p.x = p.hx + (R() - 0.5) * 8; p.z = p.hz; p.y = 6; } }
      else if (p.ret > 0) { p.ret += dt; p.y = Math.max(0, p.y - dt * 3.2); p.x += (p.hx - p.x) * Math.min(1, dt * 1.2); p.z += (p.hz - p.z) * Math.min(1, dt * 1.2); if (p.y <= 0.001) p.ret = 0; }
      const flying = p.fly > 0 || p.ret > 0 && p.y > 0.02;
      const peck = flying ? 0 : Math.max(0, Math.sin(t * 5 * p.spd + p.ph)) * (Math.sin(t * 0.7 + p.peck) > 0.3 ? 0.6 : 0), hop = flying ? 0 : Math.max(0, Math.sin(t * (2 + E * 3) + p.ph * 2)) * 0.02 * (E > 0.3 ? 1 : 0.2);
      const yaw = flying ? Math.atan2(p.vx || 0, p.vz || -1) + (p.ret > 0 ? 3.14 : 0) : p.dir + Math.sin(t * 0.3 + p.ph) * 0.3;
      o.position.set(p.x, p.y + hop + (p.hy || 0), p.z); o.rotation.set(peck * 0.9 - (flying ? 0.35 : 0), yaw, 0); o.scale.setScalar(1.9); o.updateMatrix(); bm.setMatrixAt(i, o.matrix);
      const flap = flying ? Math.sin(t * 28 + p.ph) * 0.9 : 0.05;
      [1, -1].forEach((s, k) => { wo.position.copy(o.position); wo.position.y += 0.19 * 1.9; wo.rotation.set(0, yaw, 0); wo.updateMatrix(); const mm = wo.matrix.clone(); const w2 = new THREE.Matrix4().makeRotationZ(s * (flying ? flap : 0.5)).multiply(new THREE.Matrix4().makeScale(s * 1.9, 1.9, 1.9)); wm.setMatrixAt(i * 2 + k, mm.multiply(w2)); });
    }
    bm.instanceMatrix.needsUpdate = true; wm.instanceMatrix.needsUpdate = true;
  }
  return { group, update, flocks: P };
}
