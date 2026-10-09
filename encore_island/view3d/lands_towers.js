// Encore Island 3D, lands: the three towers (Speaker Tower, Disco Tower, Boom Box) and the little land upgrades that live beside the plates:
// War Drums (drum kit + beat ring), Amp Up (a growing wall of amp stacks), Crowd Gate (a candy arch whose size follows its level).
// Each tower is a few merged meshes (body + ink hull, speaker cones that pulse, the animated bits) so a tower costs ~5 to 7 draw calls.
import * as THREE from 'three';
import { Builder, C, INK, TAU, PI, SHINY, GOLD, addOutline, clamp, lerp, seg, LOOK, hash01, rng, softTex } from './kit.js';
import { clothGeo, clothMesh, moteField, beamGeo, glowSprite, ringMesh, col, disposeDeep } from './lands_fx.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PINK = 0xff7eb6, VIOLET = 0x8f6be8, DEEP = 0x3a2a7a, CREAM = C.cream, GOLDC = 0xffd84d;
const ink = (grp, w = 0.022) => { grp.children.slice().forEach((m) => { if (m.isMesh && !m.userData.noInk && m.material.vertexColors) addOutline(m, w); }); return grp; };

// ---- a speaker (cone, surround, dust cap) facing +Z, built at (x, y) on the plane z = 0. Lives in its own mesh so it can pulse in depth.
function spk(b, x, y, R, cap = PINK) {
  b.tor(CREAM, x, y, 0, R, R * 0.13, 6, seg(20));
  b.cylc(0x2a1b66, x, y, -R * 0.04, R * 0.9, R * 0.1, seg(20), PI / 2);
  b.tor(0x5a3fb8, x, y, R * 0.03, R * 0.56, R * 0.05, 5, seg(16));
  b.ball(cap, x, y, R * 0.05, R * 0.3, 1, 0.6);
  b.ball(CREAM, x - R * 0.09, y + R * 0.1, R * 0.17, R * 0.07, 1, 0.5);
}
// ---- the tiny singing figure on the Speaker Tower: one merged mesh that bobs and squashes as a unit
const FIG = [{ shirt: PINK, hair: 0x6a3a8a, skin: 0xffd9b8 }, { shirt: 0x46c8c0, hair: 0x2d170f, skin: 0xf3c9a0 }, { shirt: GOLDC, hair: 0xff8a3a, skin: 0xffd9b8 }, { shirt: 0xa77bff, hair: 0xf6e7c8, skin: 0xffe0c8 }];
function figure(v) {
  const f = FIG[v & 3], b = new Builder({ ao: 0.12 });
  b.brbox(0x2a1b66, -0.045, 0, 0, 0.06, 0.12, 0.07, 0.4); b.brbox(0x2a1b66, 0.045, 0, 0, 0.06, 0.12, 0.07, 0.4); // legs
  b.brbox(f.shirt, 0, 0.1, 0, 0.19, 0.2, 0.14, 0.45); // body
  b.ball(f.skin, 0, 0.38, 0.0, 0.125, 0.95); // head
  b.ball(f.hair, 0, 0.42, -0.025, 0.138, 0.82); b.ball(f.hair, 0.0, 0.5, 0.03, 0.06, 0.8); // hair + tuft
  b.ball(INK, -0.045, 0.385, 0.108, 0.02, 1.3, 0.5); b.ball(INK, 0.045, 0.385, 0.108, 0.02, 1.3, 0.5); // eyes
  b.ball(0x7a1f3a, 0, 0.335, 0.112, 0.035, 0.9, 0.5); // open mouth, mid note
  b.ball(f.skin, -0.115, 0.17, 0.02, 0.04); b.cylc(f.shirt, 0.125, 0.25, 0.04, 0.032, 0.17, 6, 0, 0, -0.5); b.ball(f.skin, 0.17, 0.33, 0.06, 0.04); // arms: one low, one up
  b.cyl(0x6a6a7a, 0.17, 0.31, 0.06, 0.012, 0.05, 6); b.ball(GOLDC, 0.17, 0.37, 0.06, 0.04); // mic
  return b.build({ cast: false });
}
// ---- flash ring (muzzle pop): own additive material so each tower fades independently
function flashRing(c, size) {
  const m = new THREE.MeshBasicMaterial({ map: softTex('ring'), color: col(c, 1.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 }); m.userData.noCast = m.userData.noLook = m.userData.own = true;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m); mesh.userData.billboard = true; mesh.userData.size = size; mesh.visible = false; mesh.renderOrder = 7; return mesh;
}
function setFlash(fr, u, y) { // u: 0 at the shot .. 1 done
  fr.visible = u < 1; if (!fr.visible) return; const s = fr.userData.size * (0.5 + u * 1.5); fr.scale.set(s, s, s); fr.material.opacity = (1 - u) * 0.9; if (y !== undefined) fr.position.y = y;
}
// ---- per-tower drum-boost ring on the ground (only while the land has War Drums)
function drumRing() { const r = ringMesh({ c: 0xffa040, a: 0.6, r: 1.1, in: 0.78, out: 1, soft: 0.05, y: 0.09 }); r.visible = false; return r; }

// ================================================================= Speaker Tower (tw.type 'archer')
export function speakerTower(tw) {
  const g = new THREE.Group(), body = new THREE.Group(), b = new Builder({ ao: 0.2 }), cb = new Builder({ ao: 0 });
  const hs = [0.78, 0.66, 0.56], ws = [1.04, 0.94, 0.84], D = 0.82; let y = 0.16;
  b.brbox(CREAM, 0, 0, 0, 1.24, 0.16, 1.04, 0.4);
  hs.forEach((h, i) => {
    const w = ws[i];
    b.brbox(VIOLET, 0, y, 0, w, h, D, 0.2); b.brbox(CREAM, 0, y + h - 0.05, 0, w + 0.06, 0.08, D + 0.06, 0.45);
    b.rbox(DEEP, 0, y + h / 2 - 0.02, D / 2 - 0.01, w * 0.86, h * 0.76, 0.05, 0.3);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) b.ball(GOLDC, sx * w * 0.4, y + h / 2 - 0.02 + sy * h * 0.36, D / 2 + 0.03, 0.03);
    const cy = y + h / 2 - 0.02;
    if (i === 0) { spk(cb, -0.24, cy, 0.24); spk(cb, 0.24, cy, 0.24); }
    else if (i === 1) { spk(cb, -0.16, cy, 0.25); spk(cb, 0.24, cy + 0.14, 0.12, 0xffd84d); spk(cb, 0.24, cy - 0.13, 0.1, 0xffd84d); }
    else { spk(cb, 0.14, cy, 0.2); spk(cb, -0.22, cy + 0.08, 0.12, 0x9af0b4); spk(cb, -0.22, cy - 0.13, 0.09, 0x9af0b4); }
    y += h;
  });
  b.brbox(CREAM, 0, y, 0, 0.96, 0.1, 0.78, 0.4); // stage deck
  [[-0.32, PINK, 0.14], [-0.16, 0x9af0b4, 0.2], [0, GOLDC, 0.12], [0.16, 0xa77bff, 0.18], [0.32, PINK, 0.14]].forEach(([x, c, h]) => b.brbox(c, x, y + 0.1, 0.3, 0.1, h, 0.1, 0.4));
  const top = y + 0.1;
  b.cyl(CREAM, -0.4, top, -0.28, 0.03, 0.9, 8); b.ball(GOLDC, -0.4, top + 0.92, -0.28, 0.06);
  body.add(...b.build({ cast: true }).children.slice()); ink(body);
  const cones = cb.build({ cast: false }).children[0]; cones.position.z = D / 2 + 0.02; body.add(cones);
  const flag = clothMesh(clothGeo(0.5, 0.3, PINK, 0xff4d8d, tw.x * 0.01, 8, 0.85)); flag.position.set(-0.38, top + 0.72, -0.28); body.add(flag);
  const fig = figure(((tw.x * 0.37) | 0) % 4 & 3); fig.position.set(0, top, -0.02); body.add(fig);
  const fr = flashRing(0xfff0b0, 2.2); fr.position.y = top + 0.4; body.add(fr); const dr = drumRing(); body.add(dr);
  g.add(body);
  return { g, update(dt, t, z) {
    const f = clamp((tw.fire || 0) / 0.25, 0, 1), bt = LOOK.beat.value, rec = f * f;
    body.scale.set(1 + 0.09 * rec - 0.01 * bt, 1 - 0.15 * rec + 0.02 * bt, 1 + 0.09 * rec - 0.01 * bt);
    cones.scale.z = 1 + 0.35 * bt + 0.7 * f; const ph = t * 5 + tw.x;
    fig.position.y = top + Math.abs(Math.sin(ph)) * 0.035 + bt * 0.015; fig.rotation.y = Math.sin(t * 1.6 + tw.x) * 0.4; fig.scale.set(1 + 0.04 * bt, 1 - 0.05 * bt + 0.08 * f, 1 + 0.04 * bt);
    setFlash(fr, f > 0 ? 1 - f : 1); dr.visible = !!z.drums; if (z.drums) { const u = ((t * 2) % 1); dr.scale.setScalar(1.1 + u * 0.7); dr.userData.u.uA.value = (1 - u) * 0.7; }
  }, dispose() { disposeDeep(g); } };
}

// ================================================================= Disco Tower (tw.type 'wizard')
export function discoTower(tw) {
  const g = new THREE.Group(), body = new THREE.Group(), b = new Builder({ ao: 0.2 }), tb = new Builder({ ao: 0.05 });
  b.cyl(CREAM, 0, 0, 0, 0.62, 0.14, 12); b.cyl(0x4a3a96, 0, 0.14, 0, 0.54, 0.12, 12);
  b.cyl(0x6b4fc4, 0, 0.26, 0, 0.47, 1.55, seg(16), 0.74);
  b.cyl(CREAM, 0, 1.78, 0, 0.32, 0.1, 12); b.cyl(0x6b4fc4, 0, 1.88, 0, 0.1, 0.22, 8);
  const rr = rng(21), tiles = [0xffffff, 0xcdf4ff, 0xffd0f0, 0xe0d0ff, 0xfff4c0];
  for (let row = 0; row < 5; row++) { const yy = 0.52 + row * 0.3, R = 0.47 - ((yy - 0.26) / 1.55) * 0.12 + 0.025, n = 11; for (let i = 0; i < n; i++) { const a = (i + (row & 1) * 0.5) / n * TAU; tb.box({ m: SHINY, c: tiles[(i * 3 + row * 2 + (rr() * 2 | 0)) % 5] }, Math.sin(a) * R, yy, Math.cos(a) * R, 0.2, 0.19, 0.05, 0, a, 0); } }
  body.add(...b.build({ cast: true }).children.slice()); ink(body); const tiles3 = tb.build({ cast: false }); tiles3.children.forEach((m) => { m.castShadow = false; }); body.add(tiles3);
  // the disco ball: faceted mirror tiles, spins; gimbal rings around it
  const by = 2.52, gb = new Builder({ ao: 0 }); gb.tor(GOLDC, 0, by, 0, 0.52, 0.03, 6, seg(28)); gb.tor(GOLDC, 0, by, 0, 0.52, 0.03, 6, seg(28), 0, PI / 2, 0); gb.cyl(GOLDC, 0, 2.1, 0, 0.03, 0.3, 6);
  const gimbal = gb.build({ cast: false }); body.add(gimbal);
  const bg = new THREE.IcosahedronGeometry(0.4, 2).toNonIndexed(), pc = bg.attributes.position.count, cc = new Float32Array(pc * 3), kk = new THREE.Color(), pal = [0xffffff, 0xcdf4ff, 0xffc8ee, 0xdcd0ff, 0xfff0b8, 0xaee8ff];
  for (let f = 0; f < pc / 3; f++) { kk.set(pal[(hash01(f * 7 + 3) * pal.length) | 0]).multiplyScalar(0.7 + hash01(f) * 0.5); for (let v = 0; v < 3; v++) { cc[(f * 3 + v) * 3] = kk.r; cc[(f * 3 + v) * 3 + 1] = kk.g; cc[(f * 3 + v) * 3 + 2] = kk.b; } }
  bg.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  const ballMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.18, metalness: 0.5, emissive: 0x6a3a9a, emissiveIntensity: 0.55 }); ballMat.userData.noCast = true; ballMat.userData.own = true;
  const ball = new THREE.Mesh(bg, ballMat); ball.position.y = by; body.add(ball);
  const aura = glowSprite(0xff9ae8, 2.8, { a: 0.4, k: 1 }); aura.position.y = by; body.add(aura);
  const stars = moteField({ mode: 'orbit', n: 12, r: 0.78, h: by, star: true, size: 0.22, c: 0xffffff, c2: 0xffa8ec, seed: tw.x | 0 }); body.add(stars);
  // light fans from the ball (one merged mesh, spins slowly); gradient runs along each cone
  const m4 = new THREE.Matrix4(), e = new THREE.Euler(), parts = []; for (let i = 0; i < 5; i++) { const gg = beamGeo(0.03, 0.5, 3.0, 12); m4.compose(new THREE.Vector3(0, by, 0), new THREE.Quaternion().setFromEuler(e.set(0, i / 5 * TAU, 0)).multiply(new THREE.Quaternion().setFromEuler(e.set(0, 0, -(PI / 2 + 0.6)))), new THREE.Vector3(1, 1, 1)); gg.applyMatrix4(m4); parts.push(gg); }
  const bgeo = mergeGeometries(parts, false); parts.forEach((p) => p.dispose());
  const fan = new THREE.Mesh(bgeo, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, uniforms: { uT: LOOK.t, uA: { value: 0.1 }, uFall: { value: 1.3 }, uStr: { value: 3 }, uSpd: { value: 1.5 }, uBase: { value: 0.03 }, uCol: { value: col(0xffd0f4) } },
    vertexShader: 'varying float vY; varying float vAng; void main(){ vY = uv.y; vAng = uv.x * 6.2831853; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uT, uA, uFall, uStr, uSpd, uBase; uniform vec3 uCol; varying float vY; varying float vAng; void main(){ float a = uA * pow(clamp(1.0 - vY, 0.0, 1.0), uFall) * smoothstep(0.0, uBase, vY) * (0.7 + 0.3 * sin(vAng * uStr + vY * 9.0 - uT * uSpd)); gl_FragColor = vec4(uCol, a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n }' }));
  fan.material.userData.noCast = fan.material.userData.noLook = fan.material.userData.own = true; fan.renderOrder = 5; body.add(fan);
  const fr = flashRing(0xffc8f4, 2.6); fr.position.y = by; body.add(fr); const dr = drumRing(); body.add(dr);
  g.add(body);
  return { g, update(dt, t, z) {
    const f = clamp((tw.fire || 0) / 0.3, 0, 1), bt = LOOK.beat.value, pul = 0.5 + Math.sin(t * 6) * 0.4;
    body.scale.set(1 + 0.05 * f, 1 - 0.08 * f + 0.01 * bt, 1 + 0.05 * f);
    ball.rotation.y += dt * (0.9 + 5 * f); ball.scale.setScalar(1 + 0.35 * f + 0.04 * bt); gimbal.rotation.y = -t * 0.4;
    aura.scale.setScalar(2.6 + pul * 0.5 + f * 1.8); fan.rotation.y = t * 0.45; fan.material.uniforms.uA.value = 0.075 + 0.12 * f + 0.03 * bt;
    setFlash(fr, f > 0 ? 1 - f : 1); dr.visible = !!z.drums; if (z.drums) { const u = ((t * 2) % 1); dr.scale.setScalar(1.1 + u * 0.7); dr.userData.u.uA.value = (1 - u) * 0.7; }
  }, dispose() { disposeDeep(g); } };
}

// ================================================================= Boom Box catapult (tw.type 'catapult')
const CAT_RATE_FALLBACK = 4.2;
export function boomBox(tw) {
  const g = new THREE.Group(), body = new THREE.Group(), b = new Builder({ ao: 0.22 }), cb = new Builder({ ao: 0 });
  for (const sx of [-1, 1]) { b.cylc(INK, sx * 0.64, 0.27, 0.02, 0.29, 0.16, seg(18), 0, 0, PI / 2); b.cylc(CREAM, sx * 0.67, 0.27, 0.02, 0.22, 0.2, seg(18), 0, 0, PI / 2); b.ball(PINK, sx * 0.76, 0.27, 0.02, 0.07, 1, 0.6); }
  b.cylc(INK, 0, 0.27, 0.02, 0.04, 1.3, 8, 0, 0, PI / 2);
  b.brbox(PINK, 0, 0.3, 0, 1.24, 0.74, 0.52, 0.28); b.rbox(CREAM, 0, 0.3 + 0.74 - 0.15, 0.255, 1.0, 0.2, 0.03, 0.4);
  b.rbox(DEEP, 0, 0.68, 0.27, 0.4, 0.26, 0.03, 0.3);
  for (const sx of [-1, 1]) { b.tor(CREAM, sx * 0.09, 0.68, 0.29, 0.065, 0.014, 5, seg(14)); b.ball(GOLDC, sx * 0.09, 0.68, 0.29, 0.02); }
  [0x9af0b4, 0x9af0b4, GOLDC, GOLDC, PINK].forEach((c, i) => b.ball(c, -0.2 + i * 0.1, 0.9, 0.275, 0.026, 1, 0.5));
  b.ball(GOLDC, -0.4, 1.05, 0.12, 0.05); b.ball(GOLDC, 0.4, 1.05, 0.12, 0.05);
  b.cylc(CREAM, 0.46, 1.2, -0.14, 0.018, 0.5, 6, 0, 0, -0.18); b.ball(PINK, 0.51, 1.46, -0.14, 0.04);
  b.brbox(0x6b4fc4, 0, 0.98, -0.14, 0.3, 0.42, 0.16, 0.3); b.ball(GOLDC, 0, 1.3, -0.04, 0.07, 1, 0.8);
  body.add(...b.build({ cast: true }).children.slice()); ink(body);
  spk(cb, -0.4, 0.58, 0.23); spk(cb, 0.4, 0.58, 0.23);
  const cones = cb.build({ cast: false }).children[0]; cones.position.z = 0.27; body.add(cones);
  // arm: pivots on the post, +Y is the throwing end
  const arm = new THREE.Group(); arm.position.set(0, 1.3, -0.04); const ab = new Builder({ ao: 0.05 });
  ab.rbox(GOLDC, 0, 0.4, 0, 0.1, 1.05, 0.1, 0.4); ab.rbox(GOLDC, 0, -0.18, 0, 0.1, 0.3, 0.1, 0.4); ab.rbox(C.violet, 0, -0.42, 0, 0.28, 0.24, 0.22, 0.3);
  ab.ball(CREAM, 0, 0.98, 0.02, 0.2, 0.5, 0.9); ab.tor(GOLDC, 0, 1.02, 0.02, 0.19, 0.03, 5, seg(16), PI / 2, 0, 0);
  arm.add(...ab.build({ cast: false }).children.slice()); ink(arm, 0.018); body.add(arm);
  const sb = new Builder({ ao: 0 }); sb.ball(0xa77bff, 0, 0, 0, 0.17); sb.ball(CREAM, -0.05, 0.06, 0.1, 0.05); const shot = sb.build({ cast: false }); shot.position.set(0, 1.12, 0.02); arm.add(shot);
  const fr = flashRing(0xc8a8ff, 2.4); fr.position.y = 1.0; body.add(fr); const dr = drumRing(); body.add(dr);
  g.add(body); const PHI_R = -0.95, PHI_C = 2.0;
  return { g, update(dt, t, z) {
    const rate = (typeof CAT_RATE !== 'undefined' ? CAT_RATE : CAT_RATE_FALLBACK) * (z.drums ? 0.75 : 1), cd = tw.cd || 0, ak = clamp(1 - cd / rate, 0, 1), fire = tw.fire || 0, f = clamp(fire / 0.4, 0, 1), u = 1 - f, bt = LOOK.beat.value;
    const wind = ak * ak * (3 - 2 * ak); let phi = lerp(PHI_R, PHI_C, wind);
    if (f > 0) phi += (PHI_C - PHI_R) * Math.exp(-6 * u) * Math.cos(14 * u); // snaps through the release and settles
    arm.rotation.z = phi;
    const sc = f > 0 ? (u < 0.12 ? 1 : 0) : clamp((ak - 0.04) * 8, 0, 1); shot.visible = sc > 0.01; shot.scale.setScalar(Math.max(0.01, sc));
    const hop = f > 0 ? Math.sin(u * PI) * 0.1 * f : 0; body.position.y = hop; body.position.z = f * -0.06; body.rotation.x = -0.1 * f;
    body.scale.set(1 + 0.06 * f * f, 1 - 0.1 * f * f + 0.015 * bt, 1);
    cones.scale.z = 1 + 0.35 * bt + 0.8 * f; setFlash(fr, f > 0 ? u : 1); dr.visible = !!z.drums; if (z.drums) { const w = ((t * 2) % 1); dr.scale.setScalar(1.1 + w * 0.7); dr.userData.u.uA.value = (1 - w) * 0.7; }
  }, dispose() { disposeDeep(g); } };
}

// ================================================================= War Drums: a drum kit that hits on the beat
export function drumKit() {
  const g = new THREE.Group(), body = new THREE.Group(), b = new Builder({ ao: 0.2 }), cy = new Builder({ ao: 0 });
  // kick drum
  b.cylc(INK, 0, 0.55, 0, 0.5, 0.52, seg(22), PI / 2); b.cylc(PINK, 0, 0.55, 0, 0.47, 0.56, seg(22), PI / 2); b.tor(CREAM, 0, 0.55, 0.29, 0.47, 0.05, 6, seg(24)); b.cylc(CREAM, 0, 0.55, 0.275, 0.43, 0.03, seg(22), PI / 2);
  b.tor(PINK, 0, 0.55, 0.3, 0.26, 0.03, 5, seg(18)); b.ball(GOLDC, 0, 0.55, 0.31, 0.08, 1, 0.5);
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; b.ball(GOLDC, Math.cos(a) * 0.5, 0.55 + Math.sin(a) * 0.5, 0.27, 0.03); }
  b.cylc(INK, -0.38, 0.06, 0.3, 0.03, 0.34, 6, 0.5, 0, 0.3); b.cylc(INK, 0.38, 0.06, 0.3, 0.03, 0.34, 6, 0.5, 0, -0.3);
  // rack toms
  for (const sx of [-1, 1]) { b.cylc(DEEP, sx * 0.3, 1.2, -0.02, 0.25, 0.26, seg(18), PI / 2 - 0.45); b.cylc(CREAM, sx * 0.3, 1.2 + 0.055, 0.075, 0.23, 0.04, seg(18), PI / 2 - 0.45); b.cylc(INK, sx * 0.3, 1.0, -0.05, 0.03, 0.4, 6); }
  // snare + floor tom
  b.cyl(INK, -0.95, 0.0, 0.2, 0.03, 0.7, 6); b.cyl(CREAM, -0.95, 0.7, 0.2, 0.28, 0.2, seg(16)); b.cyl(CREAM, -0.95, 0.9, 0.2, 0.25, 0.03, seg(16)); b.tor(0xc8c8d8, -0.95, 0.78, 0.2, 0.285, 0.02, 4, seg(18), PI / 2);
  b.cyl(DEEP, 0.95, 0.12, 0.1, 0.32, 0.5, seg(16)); b.cyl(CREAM, 0.95, 0.62, 0.1, 0.3, 0.04, seg(16));
  // sticks resting on the snare
  b.cylc(0xe0b078, -0.95, 0.96, 0.2, 0.014, 0.5, 5, 0, 0.5, PI / 2 - 0.1); b.cylc(0xe0b078, -0.95, 0.96, 0.2, 0.014, 0.5, 5, 0, -0.5, PI / 2 - 0.1);
  // cymbal stands (poles); cymbal discs go in their own wobbling mesh
  b.cyl(INK, -1.15, 0, -0.1, 0.022, 1.05, 6); b.cyl(INK, 1.0, 0, -0.3, 0.022, 1.5, 6);
  cy.cylc(GOLDC, 0, 0, 0, 0.3, 0.025, seg(20), 0, 0, 0, 0.9); cy.ball(0xfff0a0, 0, 0.03, 0, 0.07, 0.5); cy.cylc(GOLDC, 0, -0.06, 0, 0.3, 0.025, seg(20), 0, 0, 0, 0.9);
  body.add(...b.build({ cast: true }).children.slice()); ink(body, 0.02);
  const hat = cy.build({ cast: false }); hat.position.set(-1.15, 1.08, -0.1); body.add(hat);
  const cb2 = new Builder({ ao: 0 }); cb2.cylc(GOLDC, 0, 0, 0, 0.42, 0.025, seg(22), 0, 0, 0, 0.9); cb2.ball(0xfff0a0, 0, 0.03, 0, 0.08, 0.5);
  const crash = cb2.build({ cast: false }); crash.position.set(1.0, 1.55, -0.3); crash.rotation.z = 0.2; body.add(crash);
  const ring = ringMesh({ c: 0xff9a3a, a: 0.5, r: 1, in: 0.88, out: 1, soft: 0.05, y: 0.09 }); g.add(ring);
  g.add(body); body.scale.setScalar(0.92);
  return { g, update(dt, t) {
    const bt = LOOK.beat.value; body.scale.set(0.92 + 0.02 * bt, 0.92 - 0.035 * bt, 0.92 + 0.02 * bt);
    hat.rotation.z = Math.sin(t * 22) * 0.08 * bt; hat.position.y = 1.08 - 0.03 * bt; crash.rotation.z = 0.2 + Math.sin(t * 17) * 0.1 * bt; crash.rotation.x = Math.cos(t * 13) * 0.07 * bt;
    const u = (t * 2) % 1; ring.scale.setScalar(1.2 + u * 3.2); ring.userData.u.uA.value = (1 - u) * (0.2 + 0.4 * bt);
  }, dispose() { disposeDeep(g); } };
}

// ================================================================= Amp Up: a wall of amp stacks, one per level (max 6)
export function ampWall(n) {
  const g = new THREE.Group(), b = new Builder({ ao: 0.18 }); const cnt = Math.min(6, n);
  for (let i = 0; i < cnt; i++) {
    const a = (i - (cnt - 1) / 2) * 0.46, x = Math.sin(a) * 1.9, z = (1 - Math.cos(a)) * 1.4, ry = -a * 0.8;
    b.local(x, 0, z, ry, (q) => {
      q.brbox(0x2e2260, 0, 0, 0, 0.66, 0.64, 0.42, 0.18); q.rbox(CREAM, 0, 0.33, 0.215, 0.54, 0.46, 0.03, 0.3);
      for (let k = 0; k < 4; k++) q.box(0x6a5ab0, 0, 0.17 + k * 0.1, 0.235, 0.52, 0.018, 0.012);
      q.cylc(0x2a1b66, 0, 0.33, 0.235, 0.17, 0.02, seg(14), PI / 2); q.ball(PINK, 0, 0.33, 0.25, 0.055, 1, 0.5);
      q.brbox(0x2e2260, 0, 0.64, 0, 0.66, 0.26, 0.38, 0.22); q.rbox(PINK, 0, 0.77, 0.195, 0.6, 0.08, 0.025, 0.4);
      for (let k = 0; k < 4; k++) q.ball(GOLDC, -0.22 + k * 0.12, 0.77, 0.215, 0.032, 1, 0.6); q.ball(0x9af0b4, 0.27, 0.77, 0.215, 0.026, 1, 0.5);
      q.ball(GOLDC, -0.3, 0.02, 0.18, 0.035); q.ball(GOLDC, 0.3, 0.02, 0.18, 0.035);
    });
  }
  const m = b.build({ cast: true }); ink(m, 0.02); g.add(m); g.userData.cnt = cnt; return { g, dispose() { disposeDeep(g); } };
}

// ================================================================= Crowd Gate: a candy-striped festival arch, bigger each level (1..4)
export function crowdGate(lvl) {
  const g = new THREE.Group(), b = new Builder({ ao: 0.15 }), w = 1.5 + 0.4 * lvl, h = 1.5 + 0.34 * lvl, Rr = w / 2, ph = Math.max(0.6, h - Rr);
  const pill = (sx) => { const n = Math.max(3, Math.round(ph / 0.26)); for (let i = 0; i < n; i++) b.brbox(i & 1 ? CREAM : PINK, sx * Rr, i * ph / n, 0, 0.3, ph / n + 0.005, 0.3, 0.3); b.ball(GOLDC, sx * Rr, ph + 0.02, 0, 0.17); };
  pill(-1); pill(1);
  const n = 14; for (let i = 0; i < n; i++) { const a0 = i / n * PI, a1 = (i + 1) / n * PI, am = (a0 + a1) / 2, len = Rr * (a1 - a0) * 1.04; b.rbox(i & 1 ? CREAM : PINK, Math.cos(am) * Rr, ph + Math.sin(am) * Rr, 0, len, 0.28, 0.3, 0.3, 0, 0, am + PI / 2); }
  b.brbox(DEEP, 0, 0, 0, w + 0.5, 0.1, 0.5, 0.4);
  const bulbs = Math.min(14, 2 + lvl * 3); for (let i = 0; i < bulbs; i++) { const a = (i + 0.5) / bulbs * PI; b.ball({ m: GOLD, c: 0xffe27a }, Math.cos(a) * Rr, ph + Math.sin(a) * Rr, 0.2, 0.05); }
  for (let i = 0; i < lvl; i++) b.ball({ m: GOLD, c: 0xfff0a0 }, (i - (lvl - 1) / 2) * 0.24, ph + Rr + 0.3, 0, 0.09);
  const mesh = b.build({ cast: true }); ink(mesh, 0.02); g.add(mesh);
  const flags = []; for (let i = 0; i < 2; i++) { const f = clothMesh(clothGeo(0.42, 0.24, i ? 0x9af0b4 : GOLDC, i ? 0x3fcf6a : 0xf0b422, i * 2, 6, 0.8)); f.position.set((i ? 1 : -1) * Rr, ph + 0.5, 0); g.add(f); }
  return { g, dispose() { disposeDeep(g); } };
}
