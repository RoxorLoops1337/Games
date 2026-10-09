// Encore Island 3D, the Backstage greenroom: an underground diorama far from the island (BACKSTAGE in world.js, x about -400 units).
// Cutaway room (back wall with three doorways, side walls, plank floor, rug, couch, fridge, rack, mirror, neon sign, stairs up) lit by warm pools of
// light and string bulbs. Doorways come from bsDoors() (js/backstage.js: registered features first, then chained placeholders) and show locked or
// open from door.unlocked(). While the hero is inside, this module overrides the mood (dark violet, warm key) so nothing of the outside world shows.
import * as THREE from 'three';
import { Builder, C, W, TAU, PI, GOLD, glow, canvasTex, softTex, stickerText, FONT, rrPath, lerp, clamp, mixc, INK, DEFAULT_MOOD } from './kit.js';
import { iconTex } from './plate3d.js';

const MOOD = Object.assign({}, DEFAULT_MOOD, { skyTop: '#140c2c', skyMid: '#1a1038', skyLow: '#2a1a50', fog: '#1c1034', fogNear: 120, fogFar: 260, sun: '#ffd8b0', sunI: 1.5, sunDir: [-0.35, 0.85, 0.5], hemiSky: '#8a78d8', hemiGround: '#4a2a5a', hemiI: 1.15, exposure: 1.18, rim: '#ff9ac8', water: '#1a1038', waterDeep: '#120a28' });
const woodTex = () => canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#6a4030'; g.fillRect(0, 0, w, h);
  for (let r = 0; r < 8; r++) { const y = r * 64; g.fillStyle = r % 2 ? '#5e382a' : '#764836'; g.fillRect(0, y, w, 64); g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, y, w, 3);
    const off = (r % 3) * 150; g.fillRect(off, y, 3, 64); g.fillRect((off + 300) % w, y, 3, 64);
    for (let i = 0; i < 9; i++) { g.strokeStyle = 'rgba(40,16,10,0.22)'; g.lineWidth = 1.5; g.beginPath(); const yy = y + 8 + i * 6.5; g.moveTo(0, yy); g.bezierCurveTo(w * 0.3, yy - 4, w * 0.6, yy + 5, w, yy - 1); g.stroke(); }
    g.fillStyle = 'rgba(255,220,180,0.10)'; g.fillRect(0, y + 4, w, 4); }
}, { repeat: true });
const curtainTex = () => canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#2a1850'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 16; i++) { const x = i * 32, gr = g.createLinearGradient(x, 0, x + 32, 0); gr.addColorStop(0, 'rgba(0,0,0,0.38)'); gr.addColorStop(0.5, 'rgba(255,126,182,0.14)'); gr.addColorStop(1, 'rgba(0,0,0,0.38)'); g.fillStyle = gr; g.fillRect(x, 0, 32, h); }
  const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(0,0,0,0.35)'); v.addColorStop(0.5, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.25)'); g.fillStyle = v; g.fillRect(0, 0, w, h);
}, { repeat: true });
const rugTex = () => canvasTex(512, 256, (g, w, h) => {
  g.fillStyle = '#7a2050'; g.fillRect(0, 0, w, h);
  for (let r = 0; r < 4; r++) for (let q = 0; q < 8; q++) { const x = q * 64 + (r % 2) * 32, y = r * 64; g.fillStyle = (q + r) % 2 ? 'rgba(255,126,182,0.20)' : 'rgba(0,0,0,0.14)'; rrPath(g, x + 4, y + 4, 56, 56, 14); g.fill(); }
  g.strokeStyle = '#ffd84d'; g.lineWidth = 6; g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.43, h * 0.4, 0, 0, TAU); g.stroke(); g.strokeStyle = 'rgba(255,244,230,0.7)'; g.lineWidth = 2; g.beginPath(); g.ellipse(w / 2, h / 2, w * 0.4, h * 0.36, 0, 0, TAU); g.stroke();
});
const signTex = (txt, w = 1024, h = 256, size = 150, c1 = '#ffc9de', c2 = '#ff5fa6') => canvasTex(w, h, (g) => { g.clearRect(0, 0, w, h); stickerText(g, txt, w / 2, h / 2, size, c1, c2); });
const posterTex = (title, c1, c2) => canvasTex(256, 384, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = '#2d170f'; rrPath(g, 0, 0, w, h, 14); g.fill(); g.fillStyle = gr; rrPath(g, 8, 8, w - 16, h - 16, 10); g.fill();
  g.fillStyle = 'rgba(255,244,230,0.9)'; g.font = `900 38px ${FONT}`; g.textAlign = 'center'; g.fillText(title, w / 2, 70); g.beginPath(); g.arc(w / 2, h * 0.55, 62, 0, TAU); g.fillStyle = 'rgba(255,244,230,0.25)'; g.fill();
  g.fillStyle = '#fff4e6'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -PI / 2 + i * PI / 5, r = i % 2 ? 22 : 52; g.lineTo(w / 2 + Math.cos(a) * r, h * 0.55 + Math.sin(a) * r); } g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,244,230,0.85)'; g.font = `800 20px ${FONT}`; g.fillText('LIVE TONIGHT', w / 2, h - 36);
});
const RING_F = 'varying vec2 vP; uniform float uP; uniform vec3 uC; void main(){ float r = length(vP); float a = atan(vP.y, vP.x); float prog = fract((a + 1.5707963) / 6.2831853 + 1.0); float band = smoothstep(0.78, 0.82, r) * (1.0 - smoothstep(0.96, 1.0, r)); float on = step(prog, uP); gl_FragColor = vec4(uC * (0.35 + 0.9 * on), band * (0.25 + 0.75 * on)); }';

export async function init(V) {
  const X0 = BACKSTAGE.x * W, Z0 = BACKSTAGE.y * W, RW = BACKSTAGE.w * W, RH = BACKSTAGE.h * W, ZB = Z0 + 70 * W, cx = X0 + RW / 2, WH = 6.4;
  const root = new THREE.Group(); root.name = 'backstage'; V.world.add(root);
  const tex = (m, rep) => { m.wrapS = m.wrapT = THREE.RepeatWrapping; m.repeat.set(rep[0], rep[1]); return m; };
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.85, metalness: 0 }, o));
  // ---- shell: floor, rug, back + side walls, skirting, front lip ----
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(RW, RH - 70 * W).rotateX(-PI / 2), std({ map: tex(woodTex(), [RW / 3.2, (RH - 1.4) / 3.2]), roughness: 0.55 })); floor.position.set(cx, 0, ZB + (RH - 70 * W) / 2); floor.receiveShadow = true; root.add(floor);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 4.7).rotateX(-PI / 2), std({ map: rugTex(), roughness: 1, transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); rug.position.set(cx, 0.012, ZB + 3.4); rug.receiveShadow = true; root.add(rug);
  const rugStar = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ map: iconTex('star'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })); rugStar.position.set(cx, 0.02, ZB + 3.4); root.add(rugStar);
  const wallMat = std({ map: tex(curtainTex(), [RW / 3, 2]), roughness: 1 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(RW, WH), wallMat); back.position.set(cx, WH / 2, ZB); back.receiveShadow = true; root.add(back);
  for (const sd of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(RH - 70 * W, WH), std({ map: tex(curtainTex(), [(RH - 1.4) / 3, 2]), roughness: 1, side: THREE.DoubleSide })); w.rotation.y = sd * PI / 2 * -1; w.position.set(sd < 0 ? X0 : X0 + RW, WH / 2, ZB + (RH - 70 * W) / 2); w.receiveShadow = true; root.add(w); }
  const sh = new Builder({ ao: 0.2 });
  sh.brbox(0x4a2a3a, cx, -0.5, ZB + (RH - 70 * W) / 2, RW + 0.8, 0.5, RH - 70 * W + 0.8, 0.2); // slab edge under the floor
  sh.bbox(0x3a2030, cx, 0, ZB + 0.05, RW, 0.55, 0.14); for (const sd of [-1, 1]) sh.bbox(0x3a2030, sd < 0 ? X0 + 0.05 : X0 + RW - 0.05, 0, ZB + (RH - 70 * W) / 2, 0.14, 0.55, RH - 70 * W); // wainscot
  sh.bbox(0xffd84d, cx, WH - 0.35, ZB + 0.06, RW, 0.2, 0.2); // crown moulding
  sh.brbox(0x2d170f, cx, 0, Z0 + RH + 0.1, RW + 0.6, 0.18, 0.4, 0.4);
  root.add(sh.build({ cast: false }));
  // ---- string lights (instanced bulbs on a sagging wire), chasing on the beat ----
  const NB = 30, bulbGeo = new THREE.SphereGeometry(0.075, 10, 8), bulbs = new THREE.InstancedMesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), NB);
  bulbs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NB * 3), 3); const bm = new THREE.Matrix4(), BC = [0xff9ac8, 0x9af0b4, 0xc6a8ff, 0xffe98a], col = new THREE.Color();
  const wire = [];
  for (let i = 0; i < NB; i++) { const a = (i + 0.5) / NB, x = X0 + a * RW, y = WH - 0.75 + Math.sin(a * PI * 6) * 0.1 + (1 - Math.pow(Math.abs(Math.sin(a * PI * 3)), 0.5)) * 0.0; bm.makeTranslation(x, y, ZB + 0.18); bulbs.setMatrixAt(i, bm); wire.push(new THREE.Vector3(x, y + 0.08, ZB + 0.16)); }
  root.add(bulbs); const wb = new Builder(); for (let i = 0; i < wire.length - 1; i++) { const a = wire[i], b = wire[i + 1], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, len = Math.hypot(b.x - a.x, b.y - a.y); wb.part(new THREE.CylinderGeometry(1, 1, 1, 4).toNonIndexed(), 0x2d170f, mx, my, ZB + 0.16, 0.012, len, 0.012, 0, 0, PI / 2 + Math.atan2(b.y - a.y, b.x - a.x)); } root.add(wb.build({ cast: false }));
  // ---- neon sign ----
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 1.65), new THREE.MeshBasicMaterial({ map: signTex('BACKSTAGE'), transparent: true, toneMapped: false, depthWrite: false })); neon.position.set(cx, 4.9, ZB + 0.22); root.add(neon);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.4), new THREE.MeshBasicMaterial({ map: softTex('glow'), color: new THREE.Color(1.6, 0.4, 0.9), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); halo.position.set(cx, 4.9, ZB + 0.15); root.add(halo);
  // ---- doorways ----
  const doors = [];
  function plaque(name) { return canvasTex(512, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#2d170f'; rrPath(g, 4, 10, w - 8, h - 20, 26); g.fill(); const gr = g.createLinearGradient(0, 14, 0, h - 14); gr.addColorStop(0, '#f0e8ff'); gr.addColorStop(1, '#b8a8e8'); g.fillStyle = gr; rrPath(g, 10, 16, w - 20, h - 32, 22); g.fill(); g.fillStyle = '#3a2410'; g.font = `900 ${Math.min(52, 440 / Math.max(6, name.length) * 1.6)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, w / 2, h / 2 + 2); }); }
  const portalMat = () => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, toneMapped: false, uniforms: { uT: { value: 0 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec2 vUv; uniform float uT; void main(){ vec2 p = vUv * 2.0 - 1.0; float r = length(p * vec2(0.9, 0.6)); float sw = 0.5 + 0.5 * sin(atan(p.y, p.x) * 3.0 + uT * 2.0 - r * 8.0); vec3 c = mix(vec3(1.6, 0.5, 1.0), vec3(0.5, 0.35, 1.5), vUv.y) * (0.7 + 0.5 * sw); gl_FragColor = vec4(c, 0.92 - r * 0.25); }' });
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group(), dx = X0 + RW * (0.25 + 0.25 * i); g.position.set(dx, 0, ZB + 0.04); root.add(g);
    const fb = new Builder({ ao: 0.15 }); fb.brbox(0xb08a5a, 0, 0, 0, 2.5, 3.1, 0.34, 0.3); fb.bbox(0x2d170f, 0, 0, 0.1, 2.14, 2.74, 0.2); fb.cylc(0xffd84d, 0, 3.12, 0.14, 0.14, 0.1, 14, PI / 2); root.add(g); g.add(fb.build({ cast: true }));
    const dark = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.65), new THREE.MeshBasicMaterial({ color: 0x0c0620 })); dark.position.set(0, 1.35, 0.21); g.add(dark);
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.65), portalMat()); portal.position.set(0, 1.35, 0.22); g.add(portal);
    const lk = new Builder({ ao: 0.1 }); // chains + padlock
    for (const sd of [-1, 1]) lk.part(new THREE.BoxGeometry(1, 1, 1), 0x9a9ab0, 0, 1.35, 0.26, 0.09, 3.1, 0.06, 0, 0, sd * 0.69);
    lk.rbox({ m: GOLD, c: 0xffd84d }, 0, 1.2, 0.34, 0.56, 0.46, 0.2, 0.3); lk.tor({ m: GOLD, c: 0xffe27a }, 0, 1.5, 0.34, 0.2, 0.05, 8, 16); const locked = lk.build({ cast: false }); g.add(locked);
    const icon = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false })); icon.position.set(0, 3.6, 0.2); g.add(icon);
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.62), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false })); pl.position.set(0, -0.0, 1.0); pl.rotation.x = -0.5; pl.position.y = 0.04; pl.rotation.x = -PI / 2 + 0.0; g.add(pl);
    doors.push({ g, dark, portal, locked, icon, pl, id: '', name: '', open: null });
  }
  // ---- furniture ----
  const fn = new Builder({ ao: 0.2 });
  const cX = X0 + 3.2, cZ = Z0 + RH - 0.5; // couch, bottom left
  fn.rbox(0xc84a8a, cX, 0.62, cZ - 0.2, 3.4, 1.2, 1.15, 0.3); fn.rbox(0x7a2a5a, cX, 0.28, cZ, 3.5, 0.5, 1.3, 0.3); for (let i = 0; i < 3; i++) fn.rbox(0xe06aa8, cX - 1.1 + i * 1.1, 0.78, cZ + 0.12, 1.0, 0.42, 0.95, 0.35);
  for (const sd of [-1, 1]) fn.rbox(0xd85a98, cX + sd * 1.75, 0.66, cZ, 0.4, 1.0, 1.3, 0.4);
  fn.rbox(0xffd84d, cX - 0.8, 1.2, cZ - 0.15, 0.4, 0.4, 0.2, 0.4, 0.4); fn.rbox(0x6ec9e0, cX + 0.9, 1.18, cZ - 0.12, 0.38, 0.38, 0.2, 0.4, -0.3);
  const fX = X0 + RW - 2.4; // fridge, bottom right
  fn.rbox(0xbfeaf2, fX, 1.2, cZ - 0.3, 1.5, 2.4, 1.2, 0.18); fn.bbox(0x2d170f, fX, 1.4, cZ + 0.31, 1.44, 0.05, 0.02); fn.rbox(0x6fb2c8, fX + 0.55, 1.95, cZ + 0.32, 0.08, 0.6, 0.1, 0.4); fn.rbox(0x6fb2c8, fX + 0.55, 0.9, cZ + 0.32, 0.08, 0.9, 0.1, 0.4);
  fn.ball(0xff7eb6, fX - 0.35, 1.9, cZ + 0.33, 0.12, 0.4); fn.rbox(0x3fcf6a, fX - 0.2, 0.9, cZ + 0.33, 0.28, 0.4, 0.06, 0.4); fn.rbox(0xffd84d, fX + 0.1, 0.8, cZ + 0.33, 0.4, 0.3, 0.06, 0.4);
  for (const sd of [-1, 1]) { const sx = sd < 0 ? X0 + 1.1 : X0 + RW - 1.1, sz = ZB + 1.3; fn.rbox(0x2a2438, sx, 0.75, sz, 1.1, 1.5, 0.9, 0.2); fn.cyl(0x6a6a88, sx, 0.2, sz + 0.46, 0.34, 0.06, 20); fn.cyl(0x6a6a88, sx, 0.9, sz + 0.46, 0.28, 0.06, 20); fn.cyl(0x8a8aa8, sx, 1.2, sz + 0.46, 0.14, 0.05, 16); } // speaker stacks
  const mX = X0 + RW * 0.1; // mirror
  fn.rbox(0xffd84d, mX, 2.45, ZB + 0.18, 2.1, 2.9, 0.16, 0.2); fn.rbox(0xdff4ff, mX, 2.45, ZB + 0.28, 1.84, 2.6, 0.06, 0.2);
  fn.brbox(0x7a4a3a, mX, 0, ZB + 0.6, 2.2, 0.82, 0.8, 0.25); fn.rbox(0xfff4e6, mX - 0.5, 0.95, ZB + 0.55, 0.3, 0.25, 0.3, 0.4); fn.cyl(0xff7eb6, mX + 0.4, 0.82, ZB + 0.55, 0.12, 0.3, 12); fn.cyl(0x9af0b4, mX + 0.1, 0.82, ZB + 0.7, 0.1, 0.24, 12); // dressing table
  const rX = X0 + RW * 0.9; // outfit rack
  fn.cylc(0x2d170f, rX, 3.2, ZB + 0.55, 0.05, 2.4, 8, 0, 0, PI / 2); for (const sd of [-1, 1]) { fn.cyl(0x2d170f, rX + sd * 1.2, 0, ZB + 0.55, 0.05, 3.2, 8); fn.rbox(0x2d170f, rX + sd * 1.2, 0.06, ZB + 0.55, 0.7, 0.12, 0.7, 0.4); }
  root.add(fn.build({ cast: true }));
  const clothes = new THREE.Group(); root.add(clothes); const CC = [0xff7eb6, 0x3fcf6a, 0xffd84d, 0xa77bff, 0x2ec4b6, 0xff9a2e], hang = [];
  for (let i = 0; i < 6; i++) { const b = new Builder({ ao: 0.18 }); b.rbox(CC[i], 0, -0.55, 0, 0.5, 1.0, 0.18, 0.4); b.rbox(CC[(i + 2) % 6], 0, -0.1, 0, 0.62, 0.22, 0.2, 0.4); const o = b.build({ cast: false }), p = new THREE.Group(); p.position.set(rX - 0.95 + i * 0.38, 3.15, ZB + 0.55); p.add(o); clothes.add(p); hang.push(p); }
  const poster = (title, c1, c2, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.25), new THREE.MeshBasicMaterial({ map: posterTex(title, c1, c2), toneMapped: true })); m.position.set(x, 3.0, z); m.rotation.y = ry; root.add(m); };
  poster('ENCORE', '#ff7eb6', '#7a5cd8', X0 + 0.07, ZB + 3.0, PI / 2); poster('TOUR', '#46c8c0', '#3a2a86', X0 + 0.07, ZB + 5.4, PI / 2); poster('LIVE', '#ffd84d', '#ff7eb6', X0 + RW - 0.07, ZB + 3.0, -PI / 2); poster('HITS', '#9af0b4', '#7a5cd8', X0 + RW - 0.07, ZB + 5.4, -PI / 2);
  // ---- stairs up (bottom middle) ----
  const stairX = BS_STAIRS.x * W, stairZ = BS_STAIRS.y * W + 0.6, sb = new Builder({ ao: 0.25 });
  for (let i = 0; i < 6; i++) sb.rbox(i % 2 ? 0x5a4a8a : 0x6a5a9a, stairX, 0.14 + i * 0.0, stairZ + 0.6 - i * 0.34, 3.0 - i * 0.12, 0.28, 0.36, 0.3);
  root.add(sb.build({ cast: false })); const shaft = new THREE.Mesh(new THREE.ConeGeometry(1.7, 3.2, 20, 1, true).translate(0, -1.6, 0), glow(1.0, 0.9, 0.6, { opacity: 0.16, add: true, side: THREE.DoubleSide })); shaft.position.set(stairX, 3.0, stairZ + 0.2); shaft.renderOrder = 6; root.add(shaft);
  // ---- hanging spotlights: fake volumetric cones ----
  const cones = []; const coneGeo = new THREE.ConeGeometry(1.5, 5.6, 24, 1, true).translate(0, -2.8, 0);
  [[-0.28, 0xff9ac8], [0, 0xffe9a0], [0.28, 0x9ac8ff]].forEach(([k, c], i) => { const m = new THREE.Mesh(coneGeo, glow(((c >> 16) & 255) / 255 * 1.2, ((c >> 8) & 255) / 255 * 1.2, (c & 255) / 255 * 1.2, { opacity: 0.13, add: true, side: THREE.DoubleSide })); m.position.set(cx + k * RW, 5.9, ZB + 3.4); m.renderOrder = 6; root.add(m); cones.push(m); const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.0), toneMapped: false })); lamp.position.copy(m.position); root.add(lamp); });
  const glowQ = (x, z, r, c, o) => { const q = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ map: softTex('glow'), color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })); q.position.set(x, 0.03, z); root.add(q); return q; };
  glowQ(cx - 0.28 * RW, ZB + 3.4, 2.6, new THREE.Color(1.4, 0.5, 0.8), 0.45); glowQ(cx, ZB + 3.4, 3.0, new THREE.Color(1.5, 1.2, 0.7), 0.5); glowQ(cx + 0.28 * RW, ZB + 3.4, 2.6, new THREE.Color(0.6, 0.8, 1.5), 0.45);
  // dust motes
  const NM = 70, mp = new Float32Array(NM * 3), ms = [], mG = new THREE.BufferGeometry(); for (let i = 0; i < NM; i++) { mp[i * 3] = X0 + 1 + Math.random() * (RW - 2); mp[i * 3 + 1] = Math.random() * 5.5; mp[i * 3 + 2] = ZB + 1 + Math.random() * (RH - 2.4); ms.push(Math.random() * 6); }
  mG.setAttribute('position', new THREE.BufferAttribute(mp, 3)); const motes = new THREE.Points(mG, new THREE.PointsMaterial({ map: softTex('glow'), size: 0.16, color: 0xfff0d8, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true })); motes.frustumCulled = false; root.add(motes);
  // hold ring under the hero while a doorway or the stairs charge
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-PI / 2), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, uniforms: { uP: { value: 0 }, uC: { value: new THREE.Color(1.6, 0.6, 1.0) } }, vertexShader: 'varying vec2 vP; void main(){ vP = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: RING_F })); ring.visible = false; ring.renderOrder = 8; V.dyn.add(ring);
  const warm = new THREE.PointLight(0xffc890, 0, 22, 1.6), pink = new THREE.PointLight(0xff5fa6, 0, 16, 1.8); warm.position.set(cx, 4.6, ZB + 3.6); pink.position.set(cx, 4.2, ZB + 0.9); root.add(warm, pink);
  let act = 0;
  function showDoor(i, d, t) {
    const o = doors[i], open = !!d.unlocked();
    if (o.id !== d.id || o.name !== d.name) { o.id = d.id; o.name = d.name; o.icon.material.map = iconTex(d.icon); o.icon.material.needsUpdate = true; if (o.pl.material.map) o.pl.material.map.dispose(); o.pl.material.map = plaque(d.name); o.pl.material.needsUpdate = true; o.pl.scale.set(1, 1, 1); }
    if (o.open !== open) { o.open = open; o.portal.visible = open; o.locked.visible = !open; o.dark.visible = !open; }
    if (open) o.portal.material.uniforms.uT.value = t;
  }
  return {
    update(dt, t) {
      const on = S.place === 'backstage'; act = lerp(act, on ? 1 : 0, Math.min(1, dt * 4)); V.moodOverride = on ? MOOD : null; warm.intensity = 55 * act; pink.intensity = 28 * act * (0.9 + 0.1 * Math.sin(t * 9));
      if (act < 0.01 && !on) return;
      const dd = typeof bsDoors === 'function' ? bsDoors() : []; for (let i = 0; i < 3; i++) if (dd[i]) showDoor(i, dd[i], t);
      const beat = V.LOOK.beat.value, p = S.player;
      neon.material.opacity = 0.9 + 0.1 * Math.sin(t * 23) * (Math.sin(t * 3.1) > 0.92 ? 1 : 0.2); halo.material.opacity = 0.5 + 0.35 * beat + 0.08 * Math.sin(t * 7);
      for (let i = 0; i < NB; i++) { col.set(BC[(i + ((t * 3) | 0)) % 4]).multiplyScalar(1.2 + 1.3 * ((i + ((t * 6) | 0)) % 3 === 0 ? 1 : 0.2) + beat * 0.5); bulbs.setColorAt(i, col); } bulbs.instanceColor.needsUpdate = true;
      for (let i = 0; i < hang.length; i++) hang[i].rotation.z = Math.sin(t * 1.4 + i) * 0.05 * (0.6 + (p.moving ? 0.8 : 0));
      cones.forEach((c, i) => { c.rotation.z = Math.sin(t * 0.7 + i * 2.1) * 0.12; c.rotation.x = Math.cos(t * 0.5 + i) * 0.06; c.material.opacity = 0.11 + 0.05 * beat; });
      const a = mG.attributes.position; for (let i = 0; i < NM; i++) { let y = a.getY(i) + dt * (0.08 + 0.05 * Math.sin(ms[i] + t)); if (y > 5.8) y = 0.2; a.setY(i, y); a.setX(i, a.getX(i) + Math.sin(t * 0.3 + ms[i]) * dt * 0.1); } a.needsUpdate = true;
      shaft.material.opacity = 0.13 + 0.05 * Math.sin(t * 2);
      // labels: door names and hints, exit
      const L = V.labels;
      for (let i = 0; i < 3; i++) { const d = dd[i]; if (!d) continue; const dp = bsDoorPos(i), dx = dp.x * W, near = Math.abs(p.x - dp.x) < 90 && p.y < BACKSTAGE.y + 170; L.pill(d.name, dx, 0.02, dp.y * W + 0.9, { c1: d.unlocked() ? '#ffe98a' : '#e6dcff', c2: d.unlocked() ? '#f0b422' : '#a99ad8', px: 11 }); if (near) L.pill(d.unlocked() ? 'stand still to enter' : (d.hint === '???' ? 'Coming soon' : d.hint), dx, 0.02, dp.y * W + 1.45, { px: 10 }); }
      L.pill('EXIT  stand still', stairX, 0.1, stairZ - 0.9, { c1: '#ffe98a', c2: '#f0b422', px: 11 });
      const atStairs = dist2(p.x, p.y, BS_STAIRS.x, BS_STAIRS.y) < BS_STAIRS.r * BS_STAIRS.r, atDoor = typeof bsDoorAt === 'function' && bsDoorAt(p.x, p.y) >= 0;
      ring.visible = S.bsHold > 0 && (atStairs || atDoor); if (ring.visible) { ring.position.set(p.x * W, 0.04, p.y * W + 0.1); ring.scale.setScalar(0.9); ring.material.uniforms.uP.value = clamp(S.bsHold / BS_HOLD, 0, 1); }
    },
    dispose() { V.world.remove(root); V.dyn.remove(ring); },
  };
}
