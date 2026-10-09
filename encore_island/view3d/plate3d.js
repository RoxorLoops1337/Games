// Encore Island 3D, the "walk onto it" plate. One look for every upgrade circle in the game (hub, lands, gems, smelter, warp, backstage).
// A beveled stone disc set into the paving (a merged Builder mesh, which hub3d / lands3d fold further into shared meshes), a shader ring on top
// (gold rune dashes when you can afford it, the green progress arc, an additive glow), and the 2D game's own icon painted flat on the stone
// (a floor decal, no post or sign) plus a level badge lying beside it. Prices and names are drawn by the HUD overlay (V.labels) so text stays crisp.
// PERFORMANCE: every plate in the game shares THREE instanced draw calls (rings, sign stickers, level badges) through PlateFx, whatever the plate
// count. Icon decals and badges are flat quads cut from two texture atlases (icon per icon+colours, digits 0..99).
//   const p = makePlate(V, { r: 0.92, icon: 'dmg', c1: '#7a5cd8', c2: '#3a2a8a', ring: '#9af0b4', gem: false });
//   p.group.position.set(x * W, 0, y * W); V.hubGroup.add(p.group);
//   each frame: p.setState({ afford, paid, cost, lvl, label, near, rem, doneTxt, hidden }); p.update(dt, t);
import * as THREE from 'three';
import { Builder, C, INK, W, TAU, PI, canvasTex, glow, mixc, lerp, clamp, softTex, stickerText, FONT, GOLD } from './kit.js';

// ---- icon textures: the very same sticker the 2D game paints, so both views match ----
const _icons = new Map();
export function iconCanvas(key) {
  if (typeof sprite !== 'function' || typeof ICON_PAINT === 'undefined' || !ICON_PAINT[key]) return null;
  return sprite('ic_' + key, 128, () => { ctx.scale(0.95, 0.95); ICON_PAINT[key](); });
}
export function iconTex(key) {
  let t = _icons.get(key); if (t) return t;
  const c = iconCanvas(key);
  if (c) { t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; }
  else t = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#fff'; g.font = `900 80px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', w / 2, h / 2 + 4); });
  _icons.set(key, t); return t;
}

// ---- shared instanced layer: one ring mesh, one sign-sticker mesh, one badge mesh for ALL plates of an engine ----
const CAP = 128, CELL = 128, GRID = 8, BCELL = 64, BGRID = 10;
const css = (c) => (typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : c);
const RING_V = 'attribute vec4 aS; attribute vec3 aC; varying vec2 vP; varying vec4 vS; varying vec3 vC; void main(){ vP = uv * 2.0 - 1.0; vS = aS; vC = aC; vec4 p = vec4(position, 1.0);\n#ifdef USE_INSTANCING\n p = instanceMatrix * p;\n#endif\n gl_Position = projectionMatrix * modelViewMatrix * p; }';
const RING_F = `varying vec2 vP; varying vec4 vS; varying vec3 vC; uniform float uT, uBeat; const float uHalf = 1.9;
float band(float r, float a, float b, float e){ return smoothstep(a - e, a + e, r) * (1.0 - smoothstep(b - e, b + e, r)); }
void main(){
  float aff = vS.x, prog = vS.y, rr = length(vP) * uHalf, ang = atan(vP.y, vP.x), e = 0.015 * uHalf;
  float pulse = 0.5 + 0.5 * sin(uT * 5.0 + vS.z); vec3 col = vec3(0.0); float a = 0.0;
  float gl = aff * (0.30 + 0.22 * pulse + 0.15 * uBeat) * smoothstep(uHalf, 0.55, rr); col += vec3(1.0, 0.9, 0.5) * gl; a += gl;
  float dash = step(0.5, fract(ang / 6.2831853 * 18.0 + uT * 0.35)); float rune = band(rr, 0.80, 0.85, e) * dash;
  vec3 rc = mix(vec3(1.0), vec3(1.0, 0.86, 0.3), aff); float ra = rune * mix(0.38, 1.0, aff); col += rc * ra * 1.5; a += ra;
  float r2 = band(rr, 0.745, 0.765, e) * mix(0.18, 0.5, aff); col += rc * r2; a += r2;
  float pa = fract((ang + 1.5707963) / 6.2831853 + 1.0); float pr = band(rr, 0.90, 1.0, e) * step(pa, prog) * step(0.0005, prog); col += vC * pr * 1.4; a += pr;
  float track = band(rr, 0.90, 1.0, e) * step(0.0005, prog) * 0.18; col += vec3(1.0) * track; a += track;
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0)); }`;
const _qGeo = new THREE.PlaneGeometry(1, 1).rotateX(-PI / 2); // unit quad lying on the ground (icon decals, badges): its up is screen up
const PS = 1.12; // visual plate size over the trigger radius the caller passes
const _ringGeo = new THREE.PlaneGeometry(2, 2).rotateX(-PI / 2); // unit quad on the ground; scaled per instance
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0), _z = new THREE.Matrix4().makeScale(0, 0, 0);
class Slots { constructor(mesh) { this.mesh = mesh; this.free = []; this.top = 0; } take() { const i = this.free.length ? this.free.pop() : this.top++; if (i >= CAP) { this.top = CAP; return -1; } if (i + 1 > this.mesh.count) this.mesh.count = i + 1; return i; } drop(i) { if (i < 0) return; this.mesh.setMatrixAt(i, _z); this.free.push(i); this.mesh.instanceMatrix.needsUpdate = true; } }
function uvAtlas(mesh, cap) { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); a.setUsage(THREE.DynamicDrawUsage); mesh.geometry.setAttribute('aUV', a); return a; }
const ATLAS_VS = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aUV;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = uv * aUV.zw + aUV.xy;'); };
class PlateFx {
  constructor(V) {
    this.V = V; this.root = new THREE.Group(); this.root.name = 'plateFx'; this.root.userData.mod = 'plates'; V.world.add(this.root);
    // rings
    const rg = _ringGeo.clone(); this.aS = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4); this.aC = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3); this.aS.setUsage(THREE.DynamicDrawUsage); this.aC.setUsage(THREE.DynamicDrawUsage); rg.setAttribute('aS', this.aS); rg.setAttribute('aC', this.aC);
    this.ringMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, uniforms: { uT: { value: 0 }, uBeat: { value: 0 } }, vertexShader: RING_V, fragmentShader: RING_F }); this.ringMat.userData.noLook = true;
    this.rings = new THREE.InstancedMesh(rg, this.ringMat, CAP); this.rings.count = 0; this.rings.frustumCulled = false; this.rings.renderOrder = 3; this.rings.userData.noCast = true;
    // sign stickers (atlas of icon discs) and badges (atlas of digits)
    this.cells = new Map(); this.nCell = 0;
    this.signTex = HAS_DOM ? this.makeAtlas(CELL * GRID) : new THREE.Texture(); this.signMat = new THREE.MeshBasicMaterial({ map: this.signTex, transparent: true, alphaTest: 0.04, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }); this.signMat.userData.noLook = true; this.signMat.onBeforeCompile = ATLAS_VS; this.signMat.customProgramCacheKey = () => 'plateAtlas';
    this.signs = new THREE.InstancedMesh(_qGeo.clone(), this.signMat, CAP); this.signs.count = 0; this.signs.frustumCulled = false; this.signs.renderOrder = 2; this.aSign = uvAtlas(this.signs, CAP);
    this.badgeTex = HAS_DOM ? this.makeBadgeAtlas() : new THREE.Texture(); this.badgeMat = new THREE.MeshBasicMaterial({ map: this.badgeTex, transparent: true, alphaTest: 0.04, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }); this.badgeMat.userData.noLook = true; this.badgeMat.onBeforeCompile = ATLAS_VS; this.badgeMat.customProgramCacheKey = () => 'plateAtlas';
    this.badges = new THREE.InstancedMesh(_qGeo.clone(), this.badgeMat, CAP); this.badges.count = 0; this.badges.frustumCulled = false; this.badges.renderOrder = 5; this.aBadge = uvAtlas(this.badges, CAP);
    this.sr = new Slots(this.rings); this.ss = new Slots(this.signs); this.sb = new Slots(this.badges);
    for (const m of [this.rings, this.signs, this.badges]) { m.userData.noCast = true; this.root.add(m); }
    this.rings.onBeforeRender = () => { this.ringMat.uniforms.uT.value = this.V.LOOK ? this.V.LOOK.t.value : 0; this.ringMat.uniforms.uBeat.value = this.V.LOOK ? this.V.LOOK.beat.value : 0; if (this.dirty) { this.rings.instanceMatrix.needsUpdate = true; this.aS.needsUpdate = true; this.aC.needsUpdate = true; this.signs.instanceMatrix.needsUpdate = true; this.aSign.needsUpdate = true; this.badges.instanceMatrix.needsUpdate = true; this.aBadge.needsUpdate = true; this.dirty = false; } };
  }
  makeAtlas(n) { const c = document.createElement('canvas'); c.width = c.height = n; this.actx = c.getContext('2d'); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
  makeBadgeAtlas() { const n = BCELL * BGRID, c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'); g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < 100; i++) { const x = (i % BGRID) * BCELL + BCELL / 2, y = ((i / BGRID) | 0) * BCELL + BCELL / 2, lab = i === 99 ? '99+' : String(i); g.fillStyle = '#2d170f'; g.beginPath(); g.arc(x, y, 30, 0, TAU); g.fill(); g.fillStyle = '#ffd84d'; g.beginPath(); g.arc(x, y, 24, 0, TAU); g.fill(); g.fillStyle = '#3a2410'; g.font = `900 ${lab.length > 2 ? 20 : lab.length > 1 ? 26 : 30}px ${FONT}`; g.fillText(lab, x, y + 2); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
  /** atlas cell (0..63) of the sticker for icon + colours, painted on first use */
  cell(icon, c1, c2) {
    const key = icon + '|' + c1 + '|' + c2; let i = this.cells.get(key); if (i !== undefined) return i; i = Math.min(this.nCell++, GRID * GRID - 1); this.cells.set(key, i);
    if (this.actx) { const g = this.actx, x = (i % GRID) * CELL + CELL / 2, y = ((i / GRID) | 0) * CELL + CELL / 2; g.clearRect(x - CELL / 2, y - CELL / 2, CELL, CELL);
      // a soft darker pad so the art reads on any stone colour, then the icon itself, big
      const pad = '#' + mixc(c2, '#000000', 0.4).getHexString(); g.fillStyle = pad; g.globalAlpha = 0.66; g.beginPath(); g.arc(x, y, 60, 0, TAU); g.fill(); g.globalAlpha = 0.9; g.lineWidth = 3; g.strokeStyle = '#fff4e6'; g.beginPath(); g.arc(x, y, 58, 0, TAU); g.stroke(); g.globalAlpha = 1;
      const ic = iconCanvas(icon); if (ic) g.drawImage(ic, x - 54, y - 52, 108, 108); else { g.fillStyle = '#fff'; g.font = `900 72px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', x, y + 3); }
      this.signTex.needsUpdate = true; }
    return i;
  }
  uv(attr, slot, cell, grid) { const u = 1 / grid; attr.setXYZW(slot, (cell % grid) * u, 1 - (((cell / grid) | 0) + 1) * u, u, u); }
}
const _fx = new WeakMap();
const plateFx = (V) => { let f = _fx.get(V); if (!f) _fx.set(V, f = new PlateFx(V)); return f; };
const HAS_DOM = typeof document !== 'undefined' && !!document.createElement;

export function makePlate(V, o = {}) {
  const r = (o.r ?? 0.92) * PS, c1 = o.c1 || '#7a5cd8', c2 = o.c2 || '#3a2a8a', group = new THREE.Group(), fx = plateFx(V);
  // stone: dark ink rim, cream bevel, tinted top, studs (child 0 of the group: hub3d and lands3d merge it with its neighbours)
  const b = new Builder({ ao: 0.12 });
  b.cyl(INK, 0, 0, 0, r + 0.16, 0.05, 48);
  b.cyl(C.cream, 0, 0.0, 0, r + 0.1, 0.1, 48);
  b.cyl(mixc(c2, '#000000', 0.15).getHex(), 0, 0.0, 0, r + 0.02, 0.125, 48);
  b.cyl(mixc(c1, c2, 0.3).getHex(), 0, 0.0, 0, r * 0.93, 0.135, 48);
  b.cyl(mixc(c1, '#ffffff', 0.12).getHex(), 0, 0.0, 0, r * 0.76, 0.14, 40);
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; b.ball({ m: GOLD, c: 0xffe27a }, Math.cos(a) * (r + 0.06), 0.1, Math.sin(a) * (r + 0.06), 0.045, 0.7); }
  const base = b.build({ cast: false }); group.add(base);
  // no post any more: `post` and `sign` stay as empty groups so the modules that fold or sweep plates keep working
  const post = new THREE.Group(), sign = new THREE.Group(); group.add(post, sign);
  const sRing = fx.sr.take(), sSign = fx.ss.take(), sBadge = o.lvl !== false ? fx.sb.take() : -1, cell = fx.cell(o.icon || 'star', c1, c2);
  const ringCol = new THREE.Color(o.ring || '#9af0b4'); fx.aC.setXYZ(sRing, ringCol.r, ringCol.g, ringCol.b); fx.uv(fx.aSign, sSign, cell, GRID);
  const st = { afford: false, paid: 0, cost: 0, lvl: undefined, label: null, near: false, rem: 0, doneTxt: null, hidden: false, pulse: 0 };
  let aff = 0, lastLvl = -2, wasHidden = null; const seed = Math.random() * 6.28, cam = V.camera;
  const plate = { group, r, state: st, sign, ring: null, post,
    setState(s) { Object.assign(st, s); },
    update(dt, t) {
      group.visible = !st.hidden;
      if (st.hidden) { if (wasHidden !== true) { wasHidden = true; fx.rings.setMatrixAt(sRing, _z); fx.signs.setMatrixAt(sSign, _z); if (sBadge >= 0) fx.badges.setMatrixAt(sBadge, _z); fx.dirty = true; } return; }
      wasHidden = false; aff += ((st.afford ? 1 : 0) - aff) * Math.min(1, dt * 8);
      const prog = st.cost > 0 && st.paid > 0 ? clamp(st.paid / st.cost, 0, 1) : 0, pulse = st.afford && !o.noBob ? 1 + Math.sin(t * 4 + group.position.x) * 0.045 : 1;
      const gx = group.position.x, gz = group.position.z, gy = group.position.y;
      fx.rings.setMatrixAt(sRing, _m.compose(_p.set(gx, gy + 0.16, gz), _q.identity(), _s.set(r * 1.9, 1, r * 1.9))); fx.aS.setXYZW(sRing, aff, prog, seed, 0);
      const d = r * 1.58 * pulse; fx.signs.setMatrixAt(sSign, _m.compose(_p.set(gx, gy + 0.152, gz), _q.identity(), _s.set(d, 1, d)));
      if (sBadge >= 0) { if (st.lvl === undefined) fx.badges.setMatrixAt(sBadge, _z); else { if (st.lvl !== lastLvl) { lastLvl = st.lvl; fx.uv(fx.aBadge, sBadge, clamp(st.lvl | 0, 0, 99), BGRID); }
        fx.badges.setMatrixAt(sBadge, _m.compose(_p.set(gx + r * 0.86, gy + 0.153, gz - r * 0.86), _q.identity(), _s.set(0.52, 1, 0.52))); } }
      fx.dirty = true;
      // overlay text (cheap: only when the plate is near the screen focus, which the labels module decides)
      const L = V.labels; if (L) {
        const x = group.position.x, z = group.position.z;
        if (st.near && st.label) L.pill(st.label, x, 0.35, z - r * 1.32, { c1: '#ffffff', c2: '#dccaff', px: 12 });
        if (st.rem > 0) L.price(st.rem, x, 0.05, z + r * 1.22, { gem: !!o.gem, afford: st.afford });
        else if (st.doneTxt) L.pill(st.doneTxt, x, 0.05, z + r * 1.22, { c1: '#9af0b4', c2: '#3fcf6a', px: 12 });
      }
    },
    dispose() { fx.sr.drop(sRing); fx.ss.drop(sSign); fx.sb.drop(sBadge); } };
  return plate;
}
