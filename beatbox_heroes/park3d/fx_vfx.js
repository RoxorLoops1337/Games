// FX module (Lighting and VFX Artist): every fake-volumetric and ambient effect, GPU driven (all motion is in the vertex shaders, the CPU only
// writes a few uniforms per frame, no allocations). Draw calls (all additive or soft alpha, depthWrite off):
//   1 glow cards (lamp halos + neon + stage glow)   2 lamp cones + ground light pools   3 god rays   4 fireflies and dust motes   5 floating music notes
// (the sky dome is the 6th call and lives in lighting.js).
import { THREE } from './kit.js';

const GLSL_OUT = '\n#include <colorspace_fragment>\n';
function additive(extra) { return Object.assign({ transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false, toneMapped: false, side: THREE.DoubleSide }, extra); }
function instanced(base, attrs, count) { const g = new THREE.InstancedBufferGeometry(); g.index = base.index; for (const k in base.attributes) g.setAttribute(k, base.attributes[k]); for (const k in attrs) g.setAttribute(k, new THREE.InstancedBufferAttribute(attrs[k].a, attrs[k].n)); g.instanceCount = count; return g; }

export function buildVFX(ctx, terrain, S) {
  const group = new THREE.Group(); group.name = 'fx';
  const R = ctx.kit.rng(90210); const a = terrain.anchors || {};
  const U = { uTime: { value: 0 }, uSunDir: { value: S.sunDir }, uSunCol: { value: S.sunCol }, uLamp: { value: 0 }, uNeon: { value: 0 }, uRay: { value: 0 }, uFly: { value: 0 }, uDust: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uPx: { value: 900 }, uOn: { value: 0 }, uOrigin: { value: new THREE.Vector3(8, 1.3, -8) }, uStage: { value: 0 }, uGain: { value: 1 } };
  const mats = [];

  // ---------- lamp list (terrain.anchors.lamps, else sensible fallback along x=-4 and x=4 every 8 m) ----------
  let lamps = (a.lamps || []).map((l) => ({ x: l.x, y: l.y > 1.5 ? l.y : 3.6, z: l.z }));
  if (!lamps.length) { for (let z = -24; z <= 24; z += 8) { lamps.push({ x: -4, y: 3.6, z }, { x: 4, y: 3.6, z }); } }
  lamps = lamps.slice(0, 24);

  // ---------- 1. glow cards ----------
  const cards = []; // x,y,z,size,intensity,phase,kind(0 lamp,1 neon,2 stage), r,g,b
  const c = (hex) => new THREE.Color(hex);
  const warm = c('#ffc46b'), pink = c('#ff3d9a'), cyan = c('#35f2e0');
  lamps.forEach((l, i) => cards.push([l.x, l.y, l.z, 1.5, 1.25, (i * 0.6180339) % 1, 0, warm.r, warm.g, warm.b]));
  const gz = (a.graffiti ? a.graffiti.z : -26) + 0.9, gx = a.graffiti ? a.graffiti.x : 0;
  for (let i = 0; i < 9; i++) { const col = i % 2 ? cyan : pink; cards.push([gx - 11 + i * 2.75, 2.6 + (i % 3) * 0.5, gz, 1.8, 1.1, i * 0.13, 1, col.r, col.g, col.b]); }
  const bs = a.buskSpot || { x: 8, z: -8 }; cards.push([bs.x, 1.5, bs.z, 3.4, 1.0, 0.5, 2, pink.r, pink.g, pink.b]);
  const cd = new Float32Array(cards.length * 4), cp = new Float32Array(cards.length * 3), cc = new Float32Array(cards.length * 3);
  cards.forEach((q, i) => { cp.set([q[0], q[1], q[2]], i * 3); cd.set([q[3], q[4], q[5], q[6]], i * 4); cc.set([q[7], q[8], q[9]], i * 3); });
  const cardMat = new THREE.ShaderMaterial(additive({ uniforms: U, vertexShader: `
    attribute vec3 iPos; attribute vec4 iData; attribute vec3 iCol; uniform float uTime, uLamp, uNeon, uStage; varying vec2 vUv; varying vec4 vC;
    void main(){ vUv = position.xy * 2.0; float k = iData.w;
      float on = k < 0.5 ? smoothstep(iData.z * 0.6, iData.z * 0.6 + 0.4, uLamp) : (k < 1.5 ? uNeon * (0.8 + 0.2 * sin(uTime * 3.0 + iData.z * 40.0)) : uStage);
      float fl = 1.0 + 0.05 * sin(uTime * 9.0 + iData.z * 40.0) + 0.03 * sin(uTime * 23.0 + iData.z * 13.0);
      vC = vec4(iCol, iData.y * on * fl); vec4 mv = viewMatrix * vec4(iPos, 1.0); mv.xy += position.xy * iData.x; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform float uGain; varying vec2 vUv; varying vec4 vC;
    void main(){ float r2 = dot(vUv, vUv); if (r2 > 1.0 || vC.a < 0.004) discard; float core = exp(-r2 * 16.0), halo = pow(1.0 - r2, 3.0);
      gl_FragColor = vec4(vC.rgb * (core * 1.2 + halo * 0.45) * vC.a * uGain, 1.0); ${GLSL_OUT} }` }));
  mats.push(cardMat);
  const cardGeo = instanced(new THREE.PlaneGeometry(1, 1), { iPos: { a: cp, n: 3 }, iData: { a: cd, n: 4 }, iCol: { a: cc, n: 3 } }, cards.length);
  const cardMesh = new THREE.Mesh(cardGeo, cardMat); cardMesh.frustumCulled = false; cardMesh.renderOrder = 10; group.add(cardMesh);

  // ---------- 2. lamp cones + ground pools (+ the busking spot light) ----------
  const SEG = 14, cv = [], ct = [], ck = [], ci = [];
  cv.push(0, 0, 0); ct.push(0); ck.push(0); // apex
  for (let i = 0; i < SEG; i++) { const an = (i / SEG) * Math.PI * 2; cv.push(Math.cos(an), -1, Math.sin(an)); ct.push(1); ck.push(0); }
  for (let i = 0; i < SEG; i++) ci.push(0, 1 + i, 1 + ((i + 1) % SEG));
  const dc = cv.length / 3; cv.push(0, -1, 0); ct.push(0); ck.push(1); // disc centre
  for (let i = 0; i < SEG; i++) { const an = (i / SEG) * Math.PI * 2; cv.push(Math.cos(an), -1, Math.sin(an)); ct.push(1); ck.push(1); }
  for (let i = 0; i < SEG; i++) ci.push(dc, dc + 1 + i, dc + 1 + ((i + 1) % SEG));
  const coneBase = new THREE.BufferGeometry(); coneBase.setAttribute('position', new THREE.Float32BufferAttribute(cv, 3)); coneBase.setAttribute('aT', new THREE.Float32BufferAttribute(ct, 1)); coneBase.setAttribute('aKind', new THREE.Float32BufferAttribute(ck, 1)); coneBase.setIndex(ci);
  const cones = lamps.map((l, i) => [l.x, l.y, l.z, 2.7, l.y - 0.06, (i * 0.6180339) % 1, 0, warm.r, warm.g, warm.b]);
  cones.push([bs.x, 5.5, bs.z, 2.2, 5.44, 0.5, 1, pink.r * 0.9 + 0.1, pink.g * 0.7 + 0.1, pink.b * 0.8 + 0.1]);
  const ps = new Float32Array(cones.length * 4), po = new Float32Array(cones.length * 3), pc = new Float32Array(cones.length * 3);
  cones.forEach((q, i) => { po.set([q[0], q[1], q[2]], i * 3); ps.set([q[3], q[4], q[5], q[6]], i * 4); pc.set([q[7], q[8], q[9]], i * 3); });
  const coneMat = new THREE.ShaderMaterial(additive({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, uniforms: U, vertexShader: `
    attribute vec3 iPos; attribute vec4 iS; attribute vec3 iCol; attribute float aT; attribute float aKind; uniform float uTime, uLamp, uStage;
    varying float vT; varying float vK; varying vec4 vC; varying float vF; varying float vW;
    void main(){ vW = iS.w; vT = aT; vK = aKind; vec3 lp = vec3(position.x * iS.x, position.y * iS.y, position.z * iS.x); vec3 wp = iPos + lp;
      float on = iS.w < 0.5 ? smoothstep(iS.z * 0.6, iS.z * 0.6 + 0.4, uLamp) : uStage; on *= 1.0 + 0.05 * sin(uTime * 9.0 + iS.z * 40.0);
      vC = vec4(iCol, on); vec3 nrm = normalize(vec3(position.x, 0.4, position.z)); vF = aKind > 0.5 ? 1.0 : pow(abs(dot(normalize(cameraPosition - wp), nrm)), 1.4);
      gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0); }`,
  fragmentShader: `uniform float uGain; varying float vT; varying float vK; varying vec4 vC; varying float vF; varying float vW;
    void main(){ float a = vK > 0.5 ? pow(1.0 - vT, 1.7) * 0.32 : pow(1.0 - vT, 1.3) * (vW > 0.5 ? 0.06 : 0.42) * vF; a *= vC.a; if (a < 0.003) discard;
      gl_FragColor = vec4(vC.rgb * a * uGain, 1.0); ${GLSL_OUT} }` }));
  mats.push(coneMat);
  const coneGeo = instanced(coneBase, { iPos: { a: po, n: 3 }, iS: { a: ps, n: 4 }, iCol: { a: pc, n: 3 } }, cones.length);
  const coneMesh = new THREE.Mesh(coneGeo, coneMat); coneMesh.frustumCulled = false; coneMesh.renderOrder = 9; group.add(coneMesh);

  // ---------- 3. god rays: parallel shafts along the sun direction, standing on scattered ground points under where canopies are ----------
  const NR = 8, rg = new Float32Array(NR * 3), rd = new Float32Array(NR * 4);
  for (let i = 0; i < NR; i++) { rg.set([(R() - 0.5) * 30, 0, -16 + R() * 26], i * 3); rd.set([22 + R() * 10, 1.6 + R() * 2.4, R(), 0], i * 4); }
  const rayBase = new THREE.PlaneGeometry(2, 1); rayBase.translate(0, 0.5, 0);
  const rayMat = new THREE.ShaderMaterial(additive({ uniforms: U, vertexShader: `
    attribute vec3 iG; attribute vec4 iD; uniform vec3 uSunDir; varying float vT; varying float vX; varying float vPh; varying float vNear;
    void main(){ vT = position.y; vX = position.x; vPh = iD.z; vec3 P = iG + uSunDir * (position.y * iD.x - 1.0); vec3 V = normalize(cameraPosition - P);
      vec3 side = normalize(cross(uSunDir, V)); P += side * position.x * iD.y * (0.7 + 0.6 * position.y); vNear = smoothstep(5.0, 14.0, distance(cameraPosition, P)); gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0); }`,
  fragmentShader: `uniform float uTime, uRay, uGain; uniform vec3 uSunCol; varying float vT; varying float vX; varying float vPh; varying float vNear;
    void main(){ float e = 1.0 - vX * vX; e *= e; float lenF = smoothstep(0.0, 0.18, vT) * (1.0 - smoothstep(0.55, 1.0, vT));
      float sh = 0.7 + 0.3 * sin(uTime * 0.5 + vPh * 6.283 + vT * 3.0) + 0.1 * sin(vX * 9.0 + vPh * 20.0); float a = e * lenF * sh * uRay * vNear; if (a < 0.002) discard;
      gl_FragColor = vec4(uSunCol * a * uGain, 1.0); ${GLSL_OUT} }` }));
  mats.push(rayMat);
  const rayGeo = instanced(rayBase, { iG: { a: rg, n: 3 }, iD: { a: rd, n: 4 } }, NR);
  const rayMesh = new THREE.Mesh(rayGeo, rayMat); rayMesh.frustumCulled = false; rayMesh.renderOrder = 8; group.add(rayMesh);

  // ---------- 4. fireflies and dust motes (one Points object, motion in the shader, wraps around the follow target) ----------
  const NP = 240, pb = new Float32Array(NP * 3), pq = new Float32Array(NP * 4);
  for (let i = 0; i < NP; i++) { pb.set([R(), R(), R()], i * 3); const fire = i % 3 === 0; pq.set([fire ? 0.1 + R() * 0.08 : 0.022 + R() * 0.03, 0.4 + R() * 0.9, R(), fire ? 0 : 1], i * 4); }
  const ptGeo = new THREE.BufferGeometry(); ptGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NP * 3), 3)); ptGeo.setAttribute('aBase', new THREE.BufferAttribute(pb, 3)); ptGeo.setAttribute('aPar', new THREE.BufferAttribute(pq, 4));
  const ptMat = new THREE.ShaderMaterial(additive({ uniforms: U, vertexShader: `
    attribute vec3 aBase; attribute vec4 aPar; uniform float uTime, uPx, uFly, uDust; uniform vec3 uCenter; varying vec4 vC;
    void main(){ vec3 box = vec3(32.0, 7.0, 32.0); float t = uTime * aPar.y; float fire = 1.0 - aPar.w;
      vec3 p; p.x = aBase.x * box.x + sin(t * 0.7 + aPar.z * 6.283) * (fire * 1.2 + 0.4) + t * 0.12 * (1.0 - fire);
      p.z = aBase.z * box.z + cos(t * 0.6 + aPar.z * 5.0) * (fire * 1.2 + 0.4); p.y = 0.25 + mod(aBase.y * box.y + t * (0.08 + 0.25 * (1.0 - fire)) + sin(t * 1.3 + aPar.z * 9.0) * 0.3 * fire, box.y);
      p.xz = uCenter.xz + mod(p.xz - uCenter.xz + 0.5 * box.xz, box.xz) - 0.5 * box.xz;
      float dist = length(p.xz - uCenter.xz); float edge = 1.0 - smoothstep(9.0, 15.5, dist);
      float blink = pow(0.5 + 0.5 * sin(uTime * (1.2 + aPar.y) + aPar.z * 40.0), 3.0);
      vec3 col = fire > 0.5 ? vec3(1.0, 0.95, 0.35) * 2.4 * blink * uFly : vec3(1.0, 0.82, 0.5) * 1.1 * uDust * (0.6 + 0.4 * sin(t * 2.0 + aPar.z * 30.0));
      vC = vec4(col * edge, 1.0); vec4 mv = viewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = max(1.5, aPar.x * projectionMatrix[1][1] * uPx * 0.5 / max(0.1, -mv.z)); }`,
  fragmentShader: `uniform float uGain; varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard; float g = exp(-d * d * 3.5); gl_FragColor = vec4(vC.rgb * g * uGain, 1.0); ${GLSL_OUT} }` }));
  mats.push(ptMat);
  const points = new THREE.Points(ptGeo, ptMat); points.frustumCulled = false; points.renderOrder = 11; group.add(points);

  // ---------- 5. floating music notes from the busking stage ----------
  const NN = 16, nO = new Float32Array(NN * 3), nP = new Float32Array(NN * 4), nC = new Float32Array(NN * 3), cols = [pink, cyan, c('#ffd23f'), c('#c77dff')];
  for (let i = 0; i < NN; i++) { nO.set([R() - 0.5, 0, R() - 0.5], i * 3); nP.set([i / NN, 0.8 + R() * 0.5, 0.5 + R() * 0.25, i % 2], i * 4); const k = cols[i % 4]; nC.set([k.r, k.g, k.b], i * 3); }
  const nt = (() => { const cvs = document.createElement('canvas'); cvs.width = 128; cvs.height = 64; const g = cvs.getContext('2d'); g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.ellipse(20, 46, 9, 6.5, -0.4, 0, 6.3); g.fill(); g.beginPath(); g.moveTo(28, 44); g.lineTo(28, 10); g.quadraticCurveTo(40, 14, 42, 28); g.stroke();
    g.beginPath(); g.ellipse(80, 48, 8, 6, -0.4, 0, 6.3); g.fill(); g.beginPath(); g.ellipse(108, 42, 8, 6, -0.4, 0, 6.3); g.fill(); g.lineWidth = 4.5; g.beginPath(); g.moveTo(87, 46); g.lineTo(87, 12); g.lineTo(115, 6); g.lineTo(115, 40); g.stroke(); g.lineWidth = 7; g.beginPath(); g.moveTo(87, 14); g.lineTo(115, 8); g.stroke();
    const t = new THREE.CanvasTexture(cvs); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const noteMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide, uniforms: Object.assign({ tNote: { value: nt } }, U), vertexShader: `
    attribute vec3 iO; attribute vec4 iP; attribute vec3 iCol; uniform float uTime, uOn; uniform vec3 uOrigin; varying vec2 vUv; varying vec3 vC; varying float vA;
    void main(){ float life = fract(uTime * iP.y * 0.22 + iP.x); vec3 p = uOrigin + vec3(iO.x * life * 2.4 + sin(life * 9.0 + iP.x * 30.0) * 0.5, life * 3.8, iO.z * life * 2.4 + cos(life * 7.0 + iP.x * 20.0) * 0.35);
      float s = iP.z * smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.65, 1.0, life)) * uOn; float an = sin(life * 6.0 + iP.x * 9.0) * 0.4; float ca = cos(an), sa = sin(an);
      vec2 q = vec2(position.x * ca - position.y * sa, position.x * sa + position.y * ca) * s; vec4 mv = viewMatrix * vec4(p, 1.0); mv.xy += q; gl_Position = projectionMatrix * mv;
      vUv = vec2((position.x + 0.5) * 0.5 + iP.w * 0.5, position.y + 0.5); vC = iCol; vA = smoothstep(0.0, 0.1, life) * (1.0 - smoothstep(0.7, 1.0, life)) * uOn; }`,
  fragmentShader: `uniform sampler2D tNote; varying vec2 vUv; varying vec3 vC; varying float vA; void main(){ float t = texture2D(tNote, vUv).a; float a = t * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC * 1.6, a); ${GLSL_OUT} }` });
  mats.push(noteMat);
  const noteGeo = instanced(new THREE.PlaneGeometry(1, 1), { iO: { a: nO, n: 3 }, iP: { a: nP, n: 4 }, iCol: { a: nC, n: 3 } }, NN);
  const notes = new THREE.Mesh(noteGeo, noteMat); notes.frustumCulled = false; notes.renderOrder = 12; notes.visible = false; group.add(notes);

  // ---------- control ----------
  let musicTarget = 0, tier = 'high';
  const lerpK = (v, to, k) => v + (to - v) * k;
  return {
    group, mats, lamps, lampCount: lamps.length,
    setMusic(on) { musicTarget = on ? 1 : 0; },
    setQuality(q) { tier = q; U.uGain.value = q === 'low' ? 0.42 : 1; ptGeo.setDrawRange(0, q === 'high' ? NP : q === 'med' ? 140 : 70); rayGeo.instanceCount = q === 'high' ? NR : q === 'med' ? 5 : 3; noteGeo.instanceCount = q === 'high' ? NN : q === 'med' ? 12 : 8; },
    setPixelHeight(px) { U.uPx.value = px; },
    update(dt, t, cx, cz) {
      U.uTime.value = t; U.uCenter.value.set(cx, 0, cz); const k = 1 - Math.exp(-dt * 3);
      U.uLamp.value = S.lamp; U.uNeon.value = S.neon; U.uRay.value = S.ray; U.uFly.value = S.fly; U.uDust.value = S.dust; U.uStage.value = S.stage;
      U.uOn.value = lerpK(U.uOn.value, musicTarget, k); notes.visible = U.uOn.value > 0.01;
    },
  };
}
