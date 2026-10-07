// WEATHER module (Lighting and VFX Artist): rain for the outdoor worlds. Everything is GPU driven (the CPU writes a few uniforms per frame, no allocations) and every
// geometry is built once at its maximum size: the quality tiers only change instanceCount / visibility, never geometry.
//   1 rain streaks (instanced camera-facing ribbons)   2 ground splashes (instanced rings, follow the player)   3 wet sheen (one static ground mesh: dark wet tint, puddles,
//   sky + lamp + neon reflections, rain ripples; "wet specular" done with light only, the ground materials are never touched)
// Tier rules: high = 1100 streaks, 240 splashes, full puddle noise, 24 reflectors | med = 640 / 120 / 14 | low = 200 streaks, NO splashes, simple puddles, 6 reflectors.
// buildWeather(ctx, terrain, S, reflectors) -> { group, setQuality(q), setPixelHeight(px), update(dt, t, cx, cz), tier(), dispose() }
// S (the lighting state) provides: rain 0..1, night 0..1, lamp, neon, stage, fogCol, rainRefl (Color: sky colour the ground mirrors).
import { THREE, disposeTree } from './kit.js';

const GLSL_OUT = '\n#include <colorspace_fragment>\n';
export const WEATHER_TIERS = { low: { streaks: 260, splashes: 0, refl: 6, noise: 0, gain: 1.5 }, med: { streaks: 640, splashes: 120, refl: 14, noise: 1, gain: 1 }, high: { streaks: 1100, splashes: 240, refl: 24, noise: 1, gain: 1 } };
const MAXS = 1100, MAXP = 240, MAXR = 24; // the geometry is built at these sizes whatever the tier

function mat(extra) { return new THREE.ShaderMaterial(Object.assign({ transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false, toneMapped: false, side: THREE.DoubleSide }, extra)); }
function instanced(base, attrs, count) { const g = new THREE.InstancedBufferGeometry(); g.index = base.index; for (const k in base.attributes) g.setAttribute(k, base.attributes[k]); for (const k in attrs) g.setAttribute(k, new THREE.InstancedBufferAttribute(attrs[k].a, attrs[k].n)); g.instanceCount = count; return g; }

export function buildWeather(ctx, terrain, S, reflectors) {
  const group = new THREE.Group(); group.name = 'weather'; group.visible = false;
  const R = ctx.kit.rng(7771); const camera = ctx.camera;
  const b = terrain.bounds || { minX: -17, maxX: 17, minZ: -27, maxZ: 27 }, M = 4;
  const org = new THREE.Vector2(b.minX - M, b.minZ - M), size = new THREE.Vector2(b.maxX - b.minX + 2 * M, b.maxZ - b.minZ + 2 * M);
  const HMAX = 1.28, RES = 0.5, TW = Math.ceil(size.x / RES), TH = Math.ceil(size.y / RES);
  // ground data texture: R = terrain height (0..1.28 m), G = walkable-path mask (wet shine and puddles live on the paths). Filled the first time it rains.
  const hData = new Uint8Array(TW * TH * 2), hTex = new THREE.DataTexture(hData, TW, TH, THREE.RGFormat, THREE.UnsignedByteType);
  hTex.magFilter = THREE.LinearFilter; hTex.minFilter = THREE.LinearFilter; hTex.wrapS = hTex.wrapT = THREE.ClampToEdgeWrapping; hTex.unpackAlignment = 1; hTex.generateMipmaps = false; hTex.needsUpdate = true;
  let filled = false;
  function fillGround() {
    filled = true; const hf = typeof terrain.heightAt === 'function' ? terrain.heightAt : null, pd = typeof terrain.pathDist === 'function' ? terrain.pathDist : null;
    for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
      const x = org.x + (i + 0.5) * RES, z = org.y + (j + 0.5) * RES, h = hf ? hf(x, z) : 0; let m = 1;
      if (pd) { const d = pd(x, z), f = Math.min(1, Math.max(0, (0.6 - d) / 0.9)); m = f * f * (3 - 2 * f); }
      const o = (j * TW + i) * 2; hData[o] = Math.max(0, Math.min(255, Math.round(h / HMAX * 255))); hData[o + 1] = Math.round(m * 255);
    }
    hTex.needsUpdate = true;
  }
  const U = { uTime: { value: 0 }, uRain: { value: 0 }, uNight: { value: 0 }, uPx: { value: 900 }, uGain: { value: 1 }, uCenter: { value: new THREE.Vector3() }, uCol: { value: new THREE.Color('#bcd2ff') },
    uWind: { value: new THREE.Vector2(0.22, 0.08) }, uBright: { value: 0.6 },
    tH: { value: hTex }, uOrg: { value: org }, uSize: { value: size }, uHMax: { value: HMAX },
    uRefl: { value: new THREE.Color('#8fa0c8') }, uTint: { value: new THREE.Color('#1c2744') }, uLamp: { value: 0 }, uNeon: { value: 0 }, uStage: { value: 0 }, uNL: { value: MAXR }, uNoise: { value: 1 },
    uRef: { value: new Array(MAXR).fill(0).map(() => new THREE.Vector4()) }, uRefC: { value: new Array(MAXR).fill(0).map(() => new THREE.Vector3()) } };

  // ---------- 1. rain streaks ----------
  const sR = new Float32Array(MAXS * 4); for (let i = 0; i < MAXS; i++) sR.set([R(), R(), R(), R()], i * 4);
  const streakMat = mat({ uniforms: U, vertexShader: `
    attribute vec4 iR; uniform float uTime, uRain, uPx, uBright; uniform vec3 uCenter; uniform vec2 uWind; varying float vA; varying float vT;
    void main(){ vec3 B = vec3(21.0, 13.0, 21.0); float spd = 15.0 + iR.w * 7.0; float s = fract(iR.y + uTime * spd / B.y); float y = (1.0 - s) * B.y;
      vec3 p = vec3(uCenter.x + (iR.x - 0.5) * B.x + uWind.x * (s * B.y), y, uCenter.z + (iR.z - 0.5) * B.z + uWind.y * (s * B.y));
      p.xz = uCenter.xz + mod(p.xz - uCenter.xz + 0.5 * B.xz, B.xz) - 0.5 * B.xz;
      vec3 d = normalize(vec3(-uWind.x, 1.0, -uWind.y)); // ribbon axis, pointing up the drop's tail
      float dist = distance(cameraPosition, p); float L = (0.36 + 0.42 * iR.w) * (0.75 + 0.5 * smoothstep(3.0, 14.0, dist));
      float wpx = 1.0 * dist / max(1.0, projectionMatrix[1][1] * uPx * 0.5); vec3 side = normalize(cross(d, cameraPosition - p));
      vec3 P = p + d * (position.y * L) + side * position.x * max(0.008, wpx);
      float near = smoothstep(2.2, 4.5, dist), far = 1.0 - smoothstep(18.0, 30.0, dist), grd = smoothstep(0.03, 0.4, y);
      vT = position.y + 0.5; vA = uRain * near * far * grd * (0.55 + 0.45 * iR.w) * uBright; gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0); }`,
  fragmentShader: `uniform vec3 uCol; uniform float uGain; varying float vA; varying float vT; void main(){ float a = vA * (1.0 - 0.88 * vT) * smoothstep(0.0, 0.06, vT + 0.03); if (a < 0.004) discard; gl_FragColor = vec4(uCol * a * uGain, 1.0); ${GLSL_OUT} }` });
  const streakBase = new THREE.PlaneGeometry(1, 1);
  const streakGeo = instanced(streakBase, { iR: { a: sR, n: 4 } }, MAXS);
  const streaks = new THREE.Mesh(streakGeo, streakMat); streaks.frustumCulled = false; streaks.renderOrder = 14; streaks.name = 'rain'; group.add(streaks);

  // ---------- 2. ground splashes ----------
  const pR = new Float32Array(MAXP * 4); for (let i = 0; i < MAXP; i++) pR.set([R(), R(), R(), R()], i * 4);
  const splashMat = mat({ uniforms: U, vertexShader: `
    attribute vec4 iR; uniform float uTime, uRain; uniform vec3 uCenter; uniform sampler2D tH; uniform vec2 uOrg, uSize; uniform float uHMax; varying vec2 vUv; varying float vA;
    void main(){ float rate = 1.2 + iR.w * 1.6; float k = uTime * rate + iR.z * 13.0; float cyc = floor(k), life = fract(k);
      vec2 rn = fract(sin(vec2(iR.x * 127.1 + cyc * 311.7, iR.y * 269.5 + cyc * 183.3)) * 43758.5453); vec2 B = vec2(23.0, 23.0);
      vec2 wp = rn * 400.0 + iR.xy * 13.0; vec2 xz = uCenter.xz + mod(wp - uCenter.xz + 0.5 * B, B) - 0.5 * B; vec4 gh = texture2D(tH, (xz - uOrg) / uSize);
      float y = gh.r * uHMax + 0.045; float edge = 1.0 - smoothstep(7.5, 11.0, length(xz - uCenter.xz));
      float r = (0.05 + 0.25 * life) * (0.7 + 0.7 * iR.x); vUv = position.xy * 2.0; vA = pow(1.0 - life, 1.6) * uRain * edge * (0.25 + 0.75 * gh.g) * smoothstep(0.0, 0.05, life);
      gl_Position = projectionMatrix * viewMatrix * vec4(xz.x + position.x * r * 2.0, y, xz.y + position.y * r * 2.0, 1.0); }`,
  fragmentShader: `uniform vec3 uCol; uniform float uGain, uNight; varying vec2 vUv; varying float vA;
    void main(){ float d = length(vUv); if (d > 1.0 || vA < 0.004) discard; float ring = smoothstep(0.2, 0.0, abs(d - 0.78)) + smoothstep(0.35, 0.0, d) * 0.4; gl_FragColor = vec4(uCol * ring * vA * uGain * (0.8 + 0.5 * uNight), 1.0); ${GLSL_OUT} }` });
  const splashGeo = instanced(new THREE.PlaneGeometry(1, 1), { iR: { a: pR, n: 4 } }, MAXP);
  const splashes = new THREE.Mesh(splashGeo, splashMat); splashes.frustumCulled = false; splashes.renderOrder = 13; splashes.name = 'splashes'; group.add(splashes);

  // ---------- 3. wet sheen: a static ground mesh (1 m grid, heights from the data texture) that darkens and mirrors ----------
  const gw = Math.ceil(size.x), gd = Math.ceil(size.y); const sg = new THREE.PlaneGeometry(size.x, size.y, gw, gd); sg.rotateX(-Math.PI / 2); sg.translate(org.x + size.x / 2, 0, org.y + size.y / 2);
  const sheenMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: true, fog: false, toneMapped: false, premultipliedAlpha: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, uniforms: U, vertexShader: `
    uniform sampler2D tH; uniform vec2 uOrg, uSize; uniform float uHMax; varying vec3 vW; varying vec2 vUv;
    void main(){ vec3 p = position; vUv = (p.xz - uOrg) / uSize; p.y = texture2D(tH, vUv).r * uHMax + 0.03; vW = p; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
  fragmentShader: `uniform sampler2D tH; uniform float uRain, uTime, uNight, uLamp, uNeon, uStage, uNL, uNoise; uniform vec3 uRefl, uTint; uniform vec4 uRef[${MAXR}]; uniform vec3 uRefC[${MAXR}]; varying vec3 vW; varying vec2 vUv;
    float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
    void main(){ if (uRain < 0.003) discard; vec4 hm = texture2D(tH, vUv); float path = hm.g; vec2 q = vW.xz;
      float n = vn(q * 0.3) * 0.62 + vn(q * 0.85 + 7.0) * 0.38; if (uNoise > 0.5) n = n * 0.9 + vn(q * 2.4 + 3.0) * 0.1;
      float pud = smoothstep(0.47, 0.6, n); float pm = pud * (0.18 + 0.82 * path);
      vec3 V = normalize(cameraPosition - vW); float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 2.2);
      float rip = 0.0; { vec2 g = q * 2.1; vec2 id = floor(g); float ph = h21(id), t = fract(uTime * 0.8 + ph), dd = length(fract(g) - 0.5); rip = smoothstep(0.045, 0.0, abs(dd - t * 0.5)) * (1.0 - t) * step(0.5, h21(id + 3.0)); }
      vec3 acc = vec3(0.0); vec2 cam = cameraPosition.xz;
      for (int i = 0; i < ${MAXR}; i++) { if (float(i) >= uNL) break; vec4 r = uRef[i]; vec2 tc = cam - r.xz; float dl = length(tc) + 0.001; vec2 dir = tc / dl; float k = r.y / (r.y + cameraPosition.y);
        vec2 d = q - (r.xz + tc * k); float par = dot(d, dir), perp = dot(d, vec2(-dir.y, dir.x)); float len = 0.7 + r.y * 0.55;
        float g = exp(-perp * perp * (5.0 + 20.0 * rip)) * exp(-par * par / (len * len)); float on = r.w < 0.5 ? uLamp : (r.w < 1.5 ? uNeon : uStage); acc += uRefC[i] * g * on; }
      float wet = 0.1 + 0.16 * path + 0.3 * pm;
      vec3 sky = uRefl * (0.12 + 0.75 * fres) * (pm + 0.14 * path);
      vec3 refl = (acc * (pm * 1.5 + path * 0.28) + sky) * (1.0 + rip * 1.5) * uRain;
      float edge = smoothstep(0.0, 0.03, vUv.x) * smoothstep(1.0, 0.97, vUv.x) * smoothstep(0.0, 0.03, vUv.y) * smoothstep(1.0, 0.97, vUv.y);
      float a = wet * uRain * edge; gl_FragColor = vec4(uTint * a + refl * edge, a); ${GLSL_OUT} }` });
  const sheen = new THREE.Mesh(sg, sheenMat); sheen.frustumCulled = false; sheen.renderOrder = 6; sheen.name = 'wet_sheen'; group.add(sheen);

  // reflectors: lamps, neon, stage glow (from fx_vfx), nearest to the spawn point first so the cheap tiers keep the useful ones
  const st = (terrain.anchors && (terrain.anchors.fountain || terrain.anchors.start)) || { x: 0, z: 0 }, dst = (p) => Math.hypot(p.x - st.x, p.z - st.z), quota = [14, 8, 2], seen = [0, 0, 0];
  const RL = (reflectors || []).slice().sort((p, q) => dst(p) - dst(q)).filter((r) => { const k = Math.min(2, r.kind || 0); return ++seen[k] <= quota[k]; }).slice(0, MAXR);
  for (let i = 0; i < RL.length; i++) { const r = RL[i]; U.uRef.value[i].set(r.x, Math.max(0.5, r.y), r.z, r.kind || 0); U.uRefC.value[i].set(r.r, r.g, r.b).multiplyScalar(r.k === undefined ? 1 : r.k); }

  let tier = 'high', T = WEATHER_TIERS.high; const tmp = new THREE.Color(), cp = new THREE.Vector3();
  const api = {
    group, geometries: [streakGeo, splashGeo, sg],
    tier() { return tier; },
    setQuality(q) { if (!WEATHER_TIERS[q]) return; tier = q; T = WEATHER_TIERS[q]; streakGeo.instanceCount = T.streaks; splashGeo.instanceCount = T.splashes; U.uNL.value = Math.min(T.refl, RL.length); U.uNoise.value = T.noise; U.uGain.value = T.gain; },
    setPixelHeight(px) { U.uPx.value = px; },
    update(dt, t, cx, cz) {
      const w = S.rain; group.visible = w > 0.004; if (!group.visible) return; if (!filled) fillGround();
      U.uTime.value = t; U.uRain.value = w; U.uNight.value = S.night; U.uLamp.value = S.lamp; U.uNeon.value = S.neon; U.uStage.value = S.stage;
      // the rain box sits between the player and the camera so the near streaks fill the frame
      camera.getWorldPosition(cp); U.uCenter.value.set(cx + (cp.x - cx) * 0.3, 0, cz + (cp.z - cz) * 0.3);
      tmp.setRGB(0.66, 0.78, 1.0).lerp(S.fogCol, 0.28); U.uCol.value.copy(tmp); U.uBright.value = 0.5 + 0.38 * S.night + 0.18 * (S.lamp);
      U.uRefl.value.copy(S.rainRefl); U.uTint.value.setRGB(0.05 + 0.03 * (1 - S.night), 0.08 + 0.03 * (1 - S.night), 0.17 + 0.04 * (1 - S.night));
      splashes.visible = T.splashes > 0;
    },
    dispose() { disposeTree(group); hTex.dispose(); if (group.parent) group.parent.remove(group); },
  };
  api.setQuality('high'); return api;
}
