// Encore Island 3D, hub helpers: instanced pools (glow billboards, bulbs, generic), a ground arc/dash ring shader, a text atlas and quad sets.
// Everything here is small and allocation free per frame, so the hub can animate dozens of lights in a handful of draw calls.
import * as THREE from 'three';
import { canvasTex, softTex, stickerText, FONT, rrPath, PI, TAU, HAS_DOM, addOutline, INK, G, GB, roundedBoxGeo, Q, icoDetail } from './kit.js';

const _z = new THREE.Vector3(0, 0, 1), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

/** InstancedMesh with a per-frame put() API: begin(); put(...) xN; end(). Colours are optional (instanceColor). */
export class Inst {
  constructor(geo, mat, max, o = {}) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max); this.mesh.frustumCulled = false; this.max = max; this.n = 0; this.mesh.count = 0;
    this.mesh.castShadow = !!o.cast; this.mesh.receiveShadow = !!o.receive; this.mesh.userData.hubInst = true;
    if (o.colors) this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  }
  begin() { this.n = 0; return this; }
  /** put(x,y,z, rx,ry,rz, sx,sy,sz, r,g,b) ; rotations are Euler XYZ radians */
  put(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx, r, g, b) {
    if (this.n >= this.max) return this; _q.setFromEuler(_e.set(rx, ry, rz)); _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); this.mesh.setMatrixAt(this.n, _m);
    if (r !== undefined && this.mesh.instanceColor) this.mesh.instanceColor.setXYZ(this.n, r, g, b); this.n++; return this;
  }
  /** like put() but with a quaternion */
  putQ(x, y, z, q, sx = 1, sy = sx, sz = sx, r, g, b) {
    if (this.n >= this.max) return this; _m.compose(_p.set(x, y, z), q, _s.set(sx, sy, sz)); this.mesh.setMatrixAt(this.n, _m);
    if (r !== undefined && this.mesh.instanceColor) this.mesh.instanceColor.setXYZ(this.n, r, g, b); this.n++; return this;
  }
  col(r, g, b) { if (this.mesh.instanceColor && this.n > 0) this.mesh.instanceColor.setXYZ(this.n - 1, r, g, b); return this; }
  end() { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; return this; }
}

/** Soft camera-facing sprites in ONE draw call. Per instance: colour (can exceed 1 for bloom) and alpha. add = additive glow, else normal blending (smoke). */
export class Bill {
  constructor(camera, o = {}) {
    this.camera = camera; const max = o.max || 128; this.max = max; this.n = 0;
    const geo = new THREE.PlaneGeometry(1, 1); this.aA = new THREE.InstancedBufferAttribute(new Float32Array(max), 1); geo.setAttribute('aA', this.aA);
    const mat = new THREE.MeshBasicMaterial({ map: softTex(o.tex || 'glow'), transparent: true, depthWrite: false, blending: o.add === false ? THREE.NormalBlending : THREE.AdditiveBlending, fog: true });
    mat.userData.noCast = true; mat.userData.noLook = true;
    mat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aA; varying float vA;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvA = aA;'); sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vA;').replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a *= vA;'); };
    mat.customProgramCacheKey = () => 'hubbill';
    this.mesh = new THREE.InstancedMesh(geo, mat, max); this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.renderOrder = o.order ?? 6;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  }
  begin() { this.n = 0; return this; }
  /** put(x,y,z, size, r,g,b, alpha, roll) */
  put(x, y, z, size, r = 1, g = 1, b = 1, a = 1, roll = 0) {
    if (this.n >= this.max || a <= 0.002 || size <= 0) return this; _q.copy(this.camera.quaternion); if (roll) _q.multiply(_q2.setFromAxisAngle(_z, roll));
    _m.compose(_p.set(x, y, z), _q, _s.set(size, size, size)); this.mesh.setMatrixAt(this.n, _m); this.mesh.instanceColor.setXYZ(this.n, r, g, b); this.aA.setX(this.n, a); this.n++; return this;
  }
  end() { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; this.aA.needsUpdate = true; return this; }
}

/** Ground ring shader quad: a band with an optional clockwise progress arc and/or turning dashes. Used for the monument charge and the warp pad runes. */
const RV = 'varying vec2 vP; void main(){ vP = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const RF = `varying vec2 vP; uniform float uT, uProg, uA, uIn, uOut, uDash, uSpin, uSoft; uniform vec3 uCol;
void main(){
  float rr = length(vP), ang = atan(vP.y, vP.x), e = 0.012 + uSoft;
  float band = smoothstep(uIn - e, uIn + e, rr) * (1.0 - smoothstep(uOut - e, uOut + e, rr));
  float prog = fract((ang + 1.5707963) / 6.2831853 + 1.0);
  float arc = uProg >= 0.999 ? 1.0 : step(prog, uProg) * step(0.0005, uProg);
  float dash = uDash > 0.5 ? step(0.5, fract(ang / 6.2831853 * uDash + uT * uSpin)) : 1.0;
  float a = band * arc * dash * uA;
  gl_FragColor = vec4(uCol, a);
}`;
const _rg = new THREE.PlaneGeometry(2, 2).rotateX(-PI / 2);
export function ringQuad(o = {}) {
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: o.add === false ? THREE.NormalBlending : THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    uniforms: { uT: { value: 0 }, uProg: { value: o.prog ?? 1 }, uA: { value: o.a ?? 1 }, uIn: { value: o.rin ?? 0.8 }, uOut: { value: o.rout ?? 0.95 }, uDash: { value: o.dash ?? 0 }, uSpin: { value: o.spin ?? 0.3 }, uSoft: { value: o.soft ?? 0 }, uCol: { value: new THREE.Color(o.col ?? 0xffd84d) } }, vertexShader: RV, fragmentShader: RF });
  m.userData.noCast = true; m.userData.noLook = true;
  const mesh = new THREE.Mesh(_rg, m); mesh.scale.set(o.r ?? 1, 1, o.r ?? 1); mesh.renderOrder = 4; mesh.userData.u = m.uniforms; return mesh;
}

/** Text atlas: cells = [{ txt, w, c1, c2, bg, ink }] drawn as sticker lettering on rounded boards. Returns { tex, uv(i) -> [u0,v0,u1,v1], aspect(i) }. */
export function textAtlas(cells, o = {}) {
  const cw = o.cw || 512, ch = o.ch || 128, cols = o.cols || 2, rows = Math.ceil(cells.length / cols), Wd = cw * cols, Ht = ch * rows;
  const tex = canvasTex(Wd, Ht, (g) => {
    cells.forEach((c, i) => {
      const x0 = (i % cols) * cw, y0 = Math.floor(i / cols) * ch; g.save(); g.translate(x0, y0);
      if (c.bg) { g.fillStyle = c.edge || '#2d170f'; rrPath(g, 2, 2, cw - 4, ch - 4, c.rad ?? 26); g.fill(); const gr = g.createLinearGradient(0, 0, 0, ch); gr.addColorStop(0, c.bg[0]); gr.addColorStop(1, c.bg[1]); g.fillStyle = gr; rrPath(g, 8, 8, cw - 16, ch - 16, (c.rad ?? 26) - 5); g.fill(); g.fillStyle = 'rgba(255,255,255,0.22)'; rrPath(g, 16, 13, cw - 32, ch * 0.2, 10); g.fill(); }
      const size = c.size || ch * 0.5; g.font = `900 ${size}px ${FONT}`; const tw = g.measureText(c.txt).width, k = Math.min(1, (cw - (c.pad ?? 48)) / tw);
      stickerText(g, c.txt, cw / 2, ch / 2 + (c.dy || 0), size * k, c.c1 || '#ffc9de', c.c2 || '#ff5fa6', c.sw ?? size * k * 0.18); g.restore();
    });
  }, { aniso: 4 });
  const uv = (i) => { const c = i % cols, r = Math.floor(i / cols); return [c / cols, 1 - (r + 1) / rows, (c + 1) / cols, 1 - r / rows]; };
  return { tex, uv, aspect: () => cw / ch };
}
/** Collects textured quads (position, normal, uv) into one geometry for a single atlas mesh. */
export class QuadSet {
  constructor() { this.pos = []; this.nor = []; this.uvs = []; }
  /** quad centred at (x,y,z), width w (local x) and height h (local y), facing +z rotated by yaw about Y and tilted by rx about X */
  add(w, h, x, y, z, yaw, uv, rx = 0) {
    _q.setFromEuler(_e.set(rx, yaw, 0, 'YXZ')); _m.compose(_p.set(x, y, z), _q, _s.set(1, 1, 1));
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(_q), corners = [[-1, -1, uv[0], uv[1]], [1, -1, uv[2], uv[1]], [1, 1, uv[2], uv[3]], [-1, 1, uv[0], uv[3]]], v = corners.map(([a, b]) => new THREE.Vector3(a * w / 2, b * h / 2, 0).applyMatrix4(_m));
    for (const i of [0, 1, 2, 0, 2, 3]) { this.pos.push(v[i].x, v[i].y, v[i].z); this.nor.push(n.x, n.y, n.z); this.uvs.push(corners[i][2], corners[i][3]); }
    return this;
  }
  geometry() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2)); return g; }
}
/** a cylinder rod from A to B added to a Builder (struts, wires, truss chords); n = radial segments */
const _Y = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _re = new THREE.Euler();
export function rod(b, GBcyl, col, ax, ay, az, bx, by, bz, r = 0.02, n = 5) {
  _d.set(bx - ax, by - ay, bz - az); const len = _d.length(); if (len < 1e-5) return b; _d.multiplyScalar(1 / len); _q.setFromUnitVectors(_Y, _d); _re.setFromQuaternion(_q, 'XYZ');
  return b.part(GBcyl(n), col, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, r, len, r, _re.x, _re.y, _re.z);
}
// ---- one shared sign atlas for every lettered board in the hub (shop names, signposts) so they all cost a single textured draw call ----
const WOOD = ['#e2b27a', '#a8703c'], CREAM = ['#fffaf2', '#ffe3c0'];
// [key, text, board gradient, text top, text bottom]; keys starting with p: are the wooden signpost boards
const SIGNS = [
  ['SELL', 'SELL', ['#ffb0d0', '#ff6aa6'], '#fffaf2', '#ffd6e6'], ['MARKET', 'MARKET', ['#ffe27a', '#e8921e'], '#fffaf2', '#ffe9b0'], ['ARENA', 'ARENA', ['#ff9a8a', '#d8384f'], '#fffaf2', '#ffd0d0'], ['STUDIO', 'STUDIO', ['#b99cff', '#6a3fd8'], '#fffaf2', '#e0d4ff'],
  ['ON AIR', 'ON AIR', ['#4a1030', '#240814'], '#ff9ab0', '#ff3d6e'], ['SMELTER', 'SMELTER', ['#ff9a4e', '#c8501e'], '#fffaf2', '#ffd9b0'], ['BACKSTAGE', 'BACKSTAGE', ['#6a4cc4', '#3a2a8a'], '#ffc9de', '#ff5fa6'], ['VAULT', 'VAULT', ['#ffe27a', '#e8921e'], '#fffaf2', '#ffe9b0'],
  ['HOT', 'HOT ITEM', ['#ff9a4a', '#e0481e'], '#fffaf2', '#ffe0a0'],
  ...['HALL OF FAME', 'SMELTER', 'ARENA', 'DOCK', 'TRAINING', 'MARKET', 'BACKSTAGE', 'STUDIO'].map((t) => ['p:' + t, t, WOOD, ...CREAM]),
];
export function signAtlas() {
  const cells = SIGNS.map(([, txt, bg, c1, c2]) => ({ txt, bg, c1, c2, size: 66, rad: 30, sw: 11 })), at = textAtlas(cells, { cw: 384, ch: 128, cols: 3 }), ix = {};
  SIGNS.forEach((s, i) => { ix[s[0]] = i; });
  const mat = new THREE.MeshStandardMaterial({ map: at.tex, roughness: 0.6, alphaTest: 0.35, transparent: false }); mat.userData.noBake = true;
  return { tex: at.tex, mat, has: (n) => n in ix,
    /** add a sign quad (w wide, 3:1 unless h given) to a QuadSet */
    quad(qs, name, w, x, y, z, yaw = 0, rx = 0, h) { const i = ix[name]; if (i === undefined) return qs; return qs.add(w, h || w / 3, x, y, z, yaw, at.uv(i), rx); },
    mesh(qs) { const m = new THREE.Mesh(qs.geometry(), mat); m.castShadow = false; m.receiveShadow = false; return m; }, dispose() { at.tex.dispose && at.tex.dispose(); mat.dispose(); } };
}
/** inked silhouette hulls on the big lit meshes of a built group (one extra draw call per mesh; emissive / transparent parts are skipped) */
export function outline(group, width = 0.032, skipGold = true) {
  group.children.slice().forEach((m) => { if (!m.isMesh || m.isInstancedMesh || !m.material || !m.material.isMeshStandardMaterial || m.material.transparent || m.material.map) return; if (skipGold && m.material.emissiveIntensity > 0.1) return; addOutline(m, width, INK); });
  return group;
}
/** cheaper rounded box: thin pieces become plain boxes, the rest use a 2 (high) / 1 (lower tiers) segment bevel. Same argument order as Builder.rbox. */
export function rbx(b, c, x, y, z, w, h, d, r = 0.15, ry = 0, rx = 0, rz = 0) {
  const m = Math.min(w, h, d); if (m < 0.1) return b.box(c, x, y, z, w, h, d, rx, ry, rz);
  const k = m * r, key = 'hrb' + w.toFixed(3) + '_' + h.toFixed(3) + '_' + d.toFixed(3) + '_' + k.toFixed(3) + '_' + (Q.detail >= 2 ? 2 : 1);
  return b.part(G(key, () => roundedBoxGeo(w, h, d, k, Q.detail >= 2 ? 2 : 1)), c, x, y, z, 1, 1, 1, rx, ry, rz);
}
/** ball whose icosphere detail follows its size (tiny studs 0, medium 1, big 2); same argument order as Builder.ball without the detail */
export function bll(b, c, x, y, z, r, sy = 1, sz) { const d = r < 0.075 ? 0 : r < 0.22 ? 1 : Math.min(2, icoDetail(1)); return b.part(GB.ico(d), c, x, y, z, r, r * sy, sz ? r * sz : r, 0, 0, 0); }
export const hexRGB = (h, k = 1) => { _c.set(h); return [_c.r * k, _c.g * k, _c.b * k]; };
/** a beat-ish value: 1 right on the beat decaying to 0 (LOOK.beat is the engine's own pulse; this is the fallback) */
export const beatOf = (V) => (V.LOOK ? V.LOOK.beat.value : 0);
export { HAS_DOM, TAU, PI };
