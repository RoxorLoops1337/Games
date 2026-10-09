// Encore Island 3D, the "walk onto it" plate. One look for every upgrade circle in the game (hub, lands, gems, smelter, warp, backstage).
// A beveled stone disc set into the paving, a shader ring on top (gold rune dashes when you can afford it, the green progress arc,
// an additive glow), and a sign post at the back carrying the 2D game's own icon sticker plus a level badge. Prices and names are drawn
// by the HUD overlay (V.labels) so text stays crisp.
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

// ---- shader ring: glow + rune dashes + progress arc in one quad ----
const RING_V = 'varying vec2 vP; void main(){ vP = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const RING_F = `varying vec2 vP; uniform float uT, uAfford, uProg, uBeat, uHalf; uniform vec3 uCol, uProgCol; uniform float uDim;
float band(float r, float a, float b, float e){ return smoothstep(a - e, a + e, r) * (1.0 - smoothstep(b - e, b + e, r)); }
void main(){
  float rr = length(vP) * uHalf, ang = atan(vP.y, vP.x), e = 0.015 * uHalf;
  float pulse = 0.5 + 0.5 * sin(uT * 5.0);
  vec3 col = vec3(0.0); float a = 0.0;
  // glow when you can pay
  float gl = uAfford * (0.30 + 0.22 * pulse + 0.15 * uBeat) * smoothstep(uHalf, 0.55, rr);
  col += vec3(1.0, 0.9, 0.5) * gl; a += gl;
  // rune dashes (turning)
  float dash = step(0.5, fract(ang / 6.2831853 * 18.0 + uT * 0.35));
  float rune = band(rr, 0.66, 0.72, e) * dash;
  vec3 rc = mix(vec3(1.0), vec3(1.0, 0.86, 0.3), uAfford);
  float ra = rune * mix(0.38, 1.0, uAfford); col += rc * ra * 1.5; a += ra;
  // second thin ring
  float r2 = band(rr, 0.50, 0.52, e) * mix(0.18, 0.5, uAfford); col += rc * r2; a += r2;
  // progress arc, clockwise from the top
  float prog = fract((ang + 1.5707963) / 6.2831853 + 1.0);
  float pr = band(rr, 0.88, 0.99, e) * step(prog, uProg) * step(0.0005, uProg);
  col += uProgCol * pr * 1.4; a += pr;
  float track = band(rr, 0.88, 0.99, e) * step(0.0005, uProg) * 0.18; col += vec3(1.0) * track; a += track;
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0) * uDim);
}`;
function ringMaterial(ringCol, half) {
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    uniforms: { uT: { value: 0 }, uAfford: { value: 0 }, uProg: { value: 0 }, uBeat: { value: 0 }, uHalf: { value: half }, uCol: { value: new THREE.Color(1, 1, 1) }, uProgCol: { value: new THREE.Color(ringCol) }, uDim: { value: 1 } },
    vertexShader: RING_V, fragmentShader: RING_F });
  m.userData.noCast = true; m.userData.noLook = true; return m;
}
const _ringGeo = new THREE.PlaneGeometry(2, 2).rotateX(-PI / 2); // unit quad; scaled to the plate

export function makePlate(V, o = {}) {
  const r = o.r ?? 0.92, c1 = o.c1 || '#7a5cd8', c2 = o.c2 || '#3a2a8a', group = new THREE.Group();
  // stone: dark ink rim, cream bevel, tinted top, studs
  const b = new Builder({ ao: 0.12 });
  b.cyl(INK, 0, 0, 0, r + 0.16, 0.05, 48);
  b.cyl(C.cream, 0, 0.0, 0, r + 0.1, 0.1, 48);
  b.cyl(mixc(c2, '#000000', 0.15).getHex(), 0, 0.0, 0, r + 0.02, 0.125, 48);
  b.cyl(mixc(c1, c2, 0.3).getHex(), 0, 0.0, 0, r * 0.84, 0.135, 48);
  b.cyl(mixc(c1, '#ffffff', 0.12).getHex(), 0, 0.0, 0, r * 0.48, 0.14, 40);
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; b.ball({ m: GOLD, c: 0xffe27a }, Math.cos(a) * (r + 0.06), 0.1, Math.sin(a) * (r + 0.06), 0.045, 0.7); }
  const base = b.build({ cast: false }); group.add(base);
  // ring shader quad
  const half = 1.9, rm = ringMaterial(o.ring || '#9af0b4', half), ring = new THREE.Mesh(_ringGeo, rm); ring.scale.set(r * half, 1, r * half); ring.position.y = 0.16; ring.renderOrder = 3; group.add(ring);
  // sign post at the back edge
  const post = new THREE.Group(); post.position.set(0, 0, -r * 0.62); group.add(post);
  const pb = new Builder({ ao: 0.1 }); const ph = r * 1.45;
  pb.cyl(INK, 0, 0, 0, 0.075, ph, 10); pb.cyl(0x8a6cc8, 0, 0.0, 0, 0.05, ph, 10); pb.ball(INK, 0, 0.02, 0, 0.13, 0.5);
  post.add(pb.build({ cast: true }));
  const sr = r * 0.62, sign = new THREE.Group(); sign.position.y = ph + sr * 0.55; post.add(sign);
  const sb = new Builder({ ao: 0.08 });
  sb.cylc(INK, 0, 0, 0, sr + 0.07, 0.1, 36, PI / 2); sb.cylc(C.cream, 0, 0, 0.02, sr + 0.03, 0.1, 36, PI / 2); sb.cylc(mixc(c2, c1, 0.5).getHex(), 0, 0, 0.04, sr, 0.1, 36, PI / 2); sb.cylc(mixc(c1, '#ffffff', 0.15).getHex(), 0, sr * 0.14, 0.06, sr * 0.78, 0.1, 36, PI / 2);
  sign.add(sb.build({ cast: true }));
  const iconMat = new THREE.MeshBasicMaterial({ map: iconTex(o.icon || 'star'), transparent: true, alphaTest: 0.04, depthWrite: false, fog: false }); iconMat.userData.noCast = true; iconMat.userData.noLook = true;
  const icon = new THREE.Mesh(new THREE.PlaneGeometry(sr * 1.5, sr * 1.5), iconMat); icon.position.set(0, sr * 0.03, 0.14); // in front of the sign face (z 0.11) for every plate size icon.renderOrder = 4; sign.add(icon);
  // level badge (a tiny canvas texture, redrawn only when the level changes)
  let badge = null, badgeCtx = null, badgeLvl = -1;
  if (o.lvl !== false) {
    const bt = canvasTex(64, 64, () => {}); badgeCtx = bt.image && bt.image.getContext ? bt.image.getContext('2d') : null;
    const bm = new THREE.MeshBasicMaterial({ map: bt, transparent: true, depthWrite: false, fog: false }); bm.userData.noCast = true; bm.userData.noLook = true;
    badge = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), bm); badge.position.set(sr * 0.82, sr * 0.82, 0.16); badge.renderOrder = 5; badge.visible = false; sign.add(badge); badge.userData.tex = bt;
  }
  function paintBadge(n) {
    if (!badgeCtx || n === badgeLvl) return; badgeLvl = n; const g = badgeCtx; g.clearRect(0, 0, 64, 64);
    g.fillStyle = '#2d170f'; g.beginPath(); g.arc(32, 32, 30, 0, TAU); g.fill(); g.fillStyle = '#ffd84d'; g.beginPath(); g.arc(32, 32, 24, 0, TAU); g.fill();
    g.fillStyle = '#3a2410'; g.font = `900 ${String(n).length > 2 ? 24 : 30}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 32, 35); badge.userData.tex.needsUpdate = true;
  }
  const st = { afford: false, paid: 0, cost: 0, lvl: undefined, label: null, near: false, rem: 0, doneTxt: null, hidden: false, pulse: 0 };
  const plate = { group, r, state: st, sign, ring, post,
    setState(s) { Object.assign(st, s); },
    update(dt, t) {
      group.visible = !st.hidden; if (st.hidden) return;
      const u = rm.uniforms; u.uT.value = t; u.uAfford.value = lerp(u.uAfford.value, st.afford ? 1 : 0, Math.min(1, dt * 8)); u.uBeat.value = V.LOOK ? V.LOOK.beat.value : 0;
      u.uProg.value = st.cost > 0 && st.paid > 0 ? clamp(st.paid / st.cost, 0, 1) : 0;
      const bob = st.afford && !o.noBob ? Math.sin(t * 4 + group.position.x) * 0.09 : 0; sign.position.y += (ph + sr * 0.55 + bob - sign.position.y) * Math.min(1, dt * 10);
      if (badge) { badge.visible = st.lvl !== undefined; if (st.lvl !== undefined) paintBadge(st.lvl); }
      // overlay text (cheap: only when the plate is near the screen focus, which the labels module decides)
      const L = V.labels; if (L) {
        const x = group.position.x, z = group.position.z;
        if (st.near && st.label) L.pill(st.label, x, ph + sr * 1.7, z - r * 0.62, { c1: '#ffffff', c2: '#dccaff', px: 12 });
        if (st.rem > 0) L.price(st.rem, x, 0.05, z + r * 0.7, { gem: !!o.gem, afford: st.afford });
        else if (st.doneTxt) L.pill(st.doneTxt, x, 0.05, z + r * 0.7, { c1: '#9af0b4', c2: '#3fcf6a', px: 12 });
      }
    },
    dispose() { rm.dispose(); iconMat.dispose(); } };
  return plate;
}
