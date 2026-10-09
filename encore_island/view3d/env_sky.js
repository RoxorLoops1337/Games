// Encore Island 3D environment: the sky. A camera-locked dome (gradient, sun/moon disc with glow, stylised drifting clouds, twinkling stars), a ring of
// soft cloud banks poking out of the haze, and far floating islets, all instanced and cheap. The haze at the horizon is the scene fog colour so the
// sea melts into the sky.
import * as THREE from 'three';
import * as kit from './kit.js';
import { W, WY, Acc, tpl, facetGeo, patchMat, smoothBlob } from './env_util.js';

const DOME_V = `varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0); gl_Position = p.xyww; }`;
const DOME_F = `
varying vec3 vD; uniform vec3 uTop, uMid, uLow, uFog, uSunCol, uSunDisc, uCloudCol; uniform vec3 uSunDir; uniform float uT, uStars, uSunSize;
float hs(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), f.x), mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0, 1.0)), f.x), f.y); }
float fb(vec2 p){ return vn(p) * 0.55 + vn(p * 2.1 + 3.7) * 0.3 + vn(p * 4.3 + 9.1) * 0.15; }
void main(){
  vec3 d = normalize(vD); float h = d.y;
  vec3 col = mix(uFog, uLow, smoothstep(-0.02, 0.1, h)); col = mix(col, uMid, smoothstep(0.06, 0.4, h)); col = mix(col, uTop, smoothstep(0.35, 0.95, h));
  if (h < 0.0) col = uFog;
  // stars
  if (uStars > 0.01 && h > 0.0) { vec3 q = d * 90.0; vec3 c = floor(q); float r = h3(c); float tw = 0.6 + 0.4 * sin(uT * (1.5 + r * 3.0) + r * 40.0);
    float st = step(0.984, r) * smoothstep(0.55, 0.0, length(fract(q) - 0.5) * 1.6) * tw; vec3 q2 = d * 28.0; float r2 = h3(floor(q2) + 5.0); st += step(0.992, r2) * smoothstep(0.5, 0.0, length(fract(q2) - 0.5) * 1.5) * (0.7 + 0.3 * sin(uT * 2.0 + r2 * 30.0)) * 1.6;
    col += vec3(0.9, 0.95, 1.0) * st * uStars * smoothstep(0.0, 0.25, h); }
  // sun / moon: disc, soft halo
  float sd = max(dot(d, normalize(uSunDir)), 0.0); float R = 0.045 * uSunSize;
  float disc = smoothstep(cos(R * 1.12), cos(R * 0.92), sd); col += uSunCol * pow(sd, 6.0) * 0.18 + uSunCol * pow(sd, 40.0) * 0.22; col = mix(col, uSunDisc, disc);
  // clouds on a flat layer, toon-banded with a lit rim toward the sun
  if (h > 0.01) { vec2 uv = d.xz / (h + 0.16) * 0.9 + vec2(uT * 0.012, uT * 0.004); float n = fb(uv);
    float cl = smoothstep(0.5, 0.58, n) * smoothstep(0.01, 0.2, h); float n2 = fb(uv + normalize(uSunDir).xz * 0.07);
    float lit = smoothstep(-0.02, 0.07, n - n2); vec3 cc = mix(uCloudCol * 0.84 * (0.6 + 0.4 * uLow), uCloudCol, lit); cc = mix(cc, cc + vec3(0.12), smoothstep(0.64, 0.8, n));
    col = mix(col, cc, cl * 0.92); }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createSky(V) {
  const U = { uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uLow: { value: new THREE.Color() }, uFog: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() }, uSunDisc: { value: new THREE.Color() }, uCloudCol: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uT: kit.LOOK.t, uStars: { value: 0 }, uSunSize: { value: 1 } };
  const dm = new THREE.ShaderMaterial({ uniforms: U, vertexShader: DOME_V, fragmentShader: DOME_F, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false }); dm.userData.noCast = true; dm.userData.noLook = true;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16), dm); dome.frustumCulled = false; dome.renderOrder = -1000; dome.name = 'skyDome'; dome.userData.noBake = true;
  const root = new THREE.Group(); root.name = 'sky'; root.add(dome);

  // ---- cloud banks: soft painted cloud billboards (upright, turning to face the camera) in a ring around the world, hazed by distance and faded out
  // near the camera so they never block the view. One instanced draw call.
  const PUFFS = kit.Q.detail === 0 ? 40 : 84, banks = new THREE.Group(); banks.name = 'cloudBanks';
  const ctex = kit.canvasTex(256, 128, (g, w, h) => { // lumpy cloud: overlapping soft discs, lit from above (R = brightness, A = coverage)
    const r = kit.rng(3), lobes = [[0.5, 0.52, 0.3], [0.3, 0.62, 0.2], [0.7, 0.6, 0.22], [0.15, 0.72, 0.13], [0.86, 0.72, 0.13], [0.42, 0.34, 0.18], [0.62, 0.36, 0.16]];
    for (const [cx, cy, rr] of lobes) { const x = cx * w, y = cy * h, R = rr * h * 1.5, gr = g.createRadialGradient(x, y, R * 0.15, x, y, R); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.62, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2); }
    g.globalCompositeOperation = 'source-atop'; const sh = g.createLinearGradient(0, h * 0.12, 0, h * 0.86); sh.addColorStop(0, 'rgba(255,255,255,1)'); sh.addColorStop(0.55, 'rgba(226,226,236,1)'); sh.addColorStop(1, 'rgba(176,176,204,1)'); g.fillStyle = sh; g.fillRect(0, 0, w, h);
  }, { mip: false });
  const cu = { uMap: { value: ctex }, uCol: { value: new THREE.Color() }, uUnder: { value: new THREE.Color() }, uFog: { value: new THREE.Color() }, uFogN: { value: 60 }, uFogF: { value: 200 }, uFadeA: { value: 38 }, uFadeB: { value: 70 }, uCam: { value: new THREE.Vector3() }, uO: { value: 0.9 } };
  const cm = new THREE.ShaderMaterial({ uniforms: cu, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; varying float vD; varying vec3 vW; void main(){ vec3 c = instanceMatrix[3].xyz; float s = instanceMatrix[0][0]; vec3 rt = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); rt = normalize(vec3(rt.x, 0.0, rt.z));
      vec3 wp = c + rt * position.x * s * 2.0 + vec3(0.0, 1.0, 0.0) * position.y * s; vUv = uv; vW = wp; gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0); }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vW; uniform sampler2D uMap; uniform vec3 uCol, uUnder, uFog, uCam; uniform float uFogN, uFogF, uFadeA, uFadeB, uO;
      void main(){ vec4 t = texture2D(uMap, vUv); float d = length(vW - uCam); vec3 col = mix(uUnder, uCol, t.r * t.r * 1.15); float a = t.a * uO * smoothstep(uFadeA, uFadeB, d);
        float fg = clamp((d - uFogN) / max(1.0, uFogF - uFogN), 0.0, 1.0); fg = fg * fg * (3.0 - 2.0 * fg); col = mix(col, uFog, fg * 0.8); gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
  cm.userData.noCast = true; cm.userData.noLook = true;
  const puffs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), cm, PUFFS); puffs.frustumCulled = false; puffs.castShadow = false; puffs.receiveShadow = false; puffs.renderOrder = -900; puffs.name = 'puffs';
  const pr = kit.rng(77), seedP = []; for (let i = 0; i < PUFFS; i++) seedP.push({ a: pr() * 6.283, d: pr(), y: pr(), s: 0.6 + pr() * 0.9, ph: pr() * 6.28, hi: pr() < 0.3 });
  banks.add(puffs); root.add(banks);

  // ---- far floating islets: grass cap, tiered rock body, one tiny tree. One instanced mesh.
  const ISL = 16, ig = (() => { const A = new Acc(), r = kit.rng(9), up = tpl((b) => b.shape(blobSmooth(1, 0.1, 61, 0.5), 0xffffff, 0, 0, 0, 1)); const capC = new THREE.Color(0xa4e59c), rockC = new THREE.Color(0x8a6ac0), rockD = new THREE.Color(0x52408a), treeC = new THREE.Color(0xff9cc6);
    A.add(up, 0, 0.05, 0, 0, 1.0, 0.3, 1.0, capC, 0, 0, 0); // flat-ish grass lens
    const rk = tpl((b) => b.shape(facetGeo(1, 0.3, 71, 1.0), 0xffffff, 0, 0, 0, 1)); A.add(rk, 0, -0.55, 0, 0.5, 0.88, 0.95, 0.88, rockC, 0, 0, 0.3); A.add(rk, 0.05, -1.35, 0, 1.2, 0.55, 0.9, 0.55, rockD, 0, 0, 0.2); A.add(rk, -0.05, -2.0, 0.05, 2.0, 0.28, 0.7, 0.28, rockD, 0, 0, 0.2);
    const tr = tpl((b) => { b.part(kit.GB.cyl(6, 0.7), 0x8a5e3e, 0, 0.3, 0, 0.07, 0.6, 0.07); b.shape(blobSmooth(1, 0.1, 5, 0.9), 0xffffff, 0, 0.78, 0, 0.36); }); A.add(tr, 0.15, 0.2, 0.05, 0, 1, 1, 1, treeC, 0, 0, 0.1);
    return A.build(false); })();
  const im = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: false }); im.userData.noCast = true;
  const islets = new THREE.InstancedMesh(ig, im, ISL); islets.frustumCulled = false; islets.name = 'islets'; const iseed = []; for (let i = 0; i < ISL; i++) iseed.push({ a: pr() * 6.283, d: pr(), y: pr(), s: 3 + pr() * 4.5, ph: pr() * 6.28, yaw: pr() * 6.28 });
  root.add(islets);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  let cx = 0, cz = 0, rad = 30, radT = 30;
  const api = {
    root, uniforms: U,
    /** where the world is: centre and radius (world units) of everything built, so banks and islets sit outside it */
    setWorld(x, z, r) { cx = x; cz = z; radT = r; },
    update(dt, t, cam, mood) {
      dome.position.copy(cam.position);
      U.uTop.value.copy(mood.skyTop); U.uMid.value.copy(mood.skyMid); U.uLow.value.copy(mood.skyLow); U.uFog.value.copy(mood.fog); U.uSunCol.value.copy(mood.sun); U.uSunDisc.value.copy(mood.sunDisc); U.uCloudCol.value.copy(mood.cloudCol);
      U.uSunDir.value.set(mood.sunDir[0], mood.sunDir[1], mood.sunDir[2]); U.uStars.value = mood.stars; U.uSunSize.value = mood.sunSize;
      cu.uCol.value.copy(mood.cloudCol); cu.uUnder.value.copy(mood.skyMid).lerp(mood.cloudCol, 0.35).multiplyScalar(0.8); cu.uFog.value.copy(mood.fog); cu.uFogN.value = mood.fogNear; cu.uFogF.value = mood.fogFar; cu.uCam.value.copy(cam.position);
      im.color.copy(mood.hemiSky).lerp(new THREE.Color(1, 1, 1), 0.6); cu.uFadeA.value = 26; cu.uFadeB.value = 62;
      rad += (radT - rad) * (1 - Math.exp(-dt * 0.8));
      const drift = t * 0.0035;
      for (let i = 0; i < PUFFS; i++) { const s = seedP[i], a = s.a + drift * (s.hi ? 1.6 : 1), R = rad + 30 + s.d * 150, y = s.hi ? 7 + s.y * 14 : WY + 0.3 + s.y * 7 + Math.sin(t * 0.3 + s.ph) * 0.3, sc = s.s * (s.hi ? 14 : 20);
        pv.set(cx + Math.cos(a) * R, y, cz + Math.sin(a) * R); q.identity(); sv.set(sc, sc * 0.5, 1); m4.compose(pv, q, sv); puffs.setMatrixAt(i, m4); }
      puffs.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < ISL; i++) { const s = iseed[i], a = s.a + t * 0.0012, R = rad + 34 + s.d * 90; pv.set(cx + Math.cos(a) * R, 1.5 + s.y * 9 + Math.sin(t * 0.5 + s.ph) * 0.35, cz + Math.sin(a) * R); q.setFromAxisAngle(UP, s.yaw + t * 0.02); sv.setScalar(s.s); m4.compose(pv, q, sv); islets.setMatrixAt(i, m4); }
      islets.instanceMatrix.needsUpdate = true;
    },
    dispose() { dome.geometry.dispose(); dm.dispose(); puffs.geometry.dispose(); cm.dispose(); ctex.dispose(); ig.dispose(); im.dispose(); puffs.dispose(); islets.dispose(); },
  };
  return api;
}
const blobSmooth = (d, amp, seed, sy) => smoothBlob(kit.icoDetail(d), amp, seed, sy);
