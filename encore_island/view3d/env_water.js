// Encore Island 3D environment: the sea. One big plane that follows the camera, shaded by a custom shader that reads a baked SHORE MAP
// (a half-float signed distance field of the real island outlines, re-baked in time slices whenever a land is added).
// Shader: shallow-to-deep tint by shore distance, wobbly animated foam lines, caustics in the shallows, drifting dashes (the 2D game's wave
// strokes), glitter, cloud shadows, the islands' shadow on the water and a haze that matches the scene fog.
import * as THREE from 'three';
import * as kit from './kit.js';
import { WY, W, outline } from './env_util.js';

const VERT = `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FRAG = `
varying vec3 vW;
uniform sampler2D uShore; uniform vec4 uRect; uniform float uHas, uT, uBeat, uCloud, uSparkle, uFoam, uFogN, uFogF, uGrowR, uGrowS;
uniform vec3 uShallow, uDeep, uFoamCol, uSky, uFogCol, uSun, uCam; uniform vec2 uSunXZ; uniform vec2 uGrowC;
float hs(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), f.x), mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0, 1.0)), f.x), f.y); }
float shoreD(vec2 p){
  vec2 uv = (p - uRect.xy) * uRect.zw; float d = 40.0;
  if (uHas > 0.5 && uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) d = texture2D(uShore, uv).r;
  if (uGrowS > 0.0) { float gd = length(p - uGrowC); d += uGrowS * (1.0 - smoothstep(uGrowR * 0.9, uGrowR * 1.6, gd)); }
  return d;
}
void main(){
  vec2 p = vW.xz; float t = uT;
  vec2 wob = vec2(vn(p * 0.55 + vec2(t * 0.16, 0.0)), vn(p * 0.55 + vec2(5.2, t * 0.14))) - 0.5;
  float d = shoreD(p + wob * 0.55);
  // depth tint: bright turquoise hugging the cliffs, deep blue offshore
  float dep = smoothstep(0.0, 6.5, d);
  vec3 col = mix(uShallow * 1.12, uDeep, pow(dep, 0.8));
  col = mix(col, uShallow * 1.2 + 0.03, (1.0 - smoothstep(0.0, 1.2, d)) * 0.35);
  float sw = vn(p * 0.09 + vec2(t * 0.02, -t * 0.015)); col *= 0.92 + 0.14 * sw;                     // broad swells of lightness
  // wave strokes: stretched drifting noise thresholded into short dashes, like the 2D game's wave arcs
  float ds = vn(p * vec2(0.32, 4.4) + vec2(t * 0.3, 0.0)) * 0.6 + vn(p * vec2(0.7, 8.0) - vec2(t * 0.42, 3.0)) * 0.4;
  float cd = length(vW - uCam); float dash = smoothstep(0.68, 0.76, ds) * (0.5 + 0.5 * dep) * (1.0 - smoothstep(40.0, 120.0, cd) * 0.85);
  col = mix(col, vec3(1.0), dash * 0.2);
  #ifndef LOWQ
  // caustics: two warped cell layers crossing, only in the shallows
  float cs = (1.0 - smoothstep(0.4, 3.8, d));
  if (cs > 0.01) { vec2 q = p * 1.7 + wob * 2.0; float c1 = vn(q + vec2(t * 0.35, t * 0.2)), c2 = vn(q * 1.3 - vec2(t * 0.27, -t * 0.31)); float cc = pow(1.0 - abs(c1 - c2) * 1.9, 5.0); col += uShallow * cc * cs * 0.55 + vec3(0.5, 0.6, 0.5) * cc * cs * 0.12; }
  // the islands' shadow on the water (taps at two heights of the cliff, offset toward the sun)
  float sh = 0.0; vec2 sx = p + uSunXZ * 1.4; sh = max(sh, smoothstep(0.3, -1.2, shoreD(sx))); sx = p + uSunXZ * 2.8; sh = max(sh, smoothstep(0.2, -2.0, shoreD(sx)) * 0.8);
  col = mix(col, uDeep * 0.8, sh * 0.3);
  #endif
  // foam: a bright soft hem on the cliff base, then ripples spreading outward that break up with noise
  float fn = vn(p * 2.3 + vec2(t * 0.25, -t * 0.2));
  float hem = smoothstep(0.42 + 0.1 * uBeat, 0.0, d + (fn - 0.5) * 0.22) * (0.8 + 0.2 * sin(t * 1.3 + p.x * 0.7));
  float ph = d * 1.15 - t * 0.2; float lines = smoothstep(0.1, 0.0, abs(fract(ph) - 0.5) - 0.34 + (fn - 0.5) * 0.3) * smoothstep(3.2, 0.5, d) * smoothstep(0.35, 0.65, d);
  float foam = clamp(hem + lines * 0.55, 0.0, 1.0) * uFoam;
  col = mix(col, uFoamCol, foam * 0.92);
  // glitter on the swell tops, stronger where the sun-facing shimmer is
  vec2 gq = p * 2.2; vec2 gc = floor(gq), gf = fract(gq) - 0.5; float gh = hs(gc), gph = fract(t * (0.25 + 0.3 * hs(gc + 3.7)) + gh);
  float gl = step(0.78, gh) * smoothstep(0.0, 0.08, gph) * smoothstep(0.35, 0.08, gph) * max(0.0, 1.0 - (abs(gf.x) + abs(gf.y)) * 3.4) * 2.2;
  col += uSun * gl * uSparkle * 0.55 * (0.4 + 0.6 * dep) * (1.0 - smoothstep(30.0, 90.0, cd));
  // sky reflection at grazing angles
  vec3 vd = normalize(uCam - vW); float fr = pow(1.0 - clamp(vd.y, 0.0, 1.0), 3.0);
  col = mix(col, uSky, fr * 0.45);
  // cloud shadows drifting over the sea (same field as the lit materials)
  if (uCloud > 0.001) { vec2 q = p * 0.05 + vec2(t * 0.022, t * 0.012); float n = vn(q * 3.0) * 0.62 + vn(q * 6.93 + 7.1) * 0.38; col *= 1.0 - smoothstep(0.46, 0.66, n) * uCloud * 0.55; }
  float a = mix(0.6, 1.0, smoothstep(0.1, 3.2, d)); a = max(a, foam);
  float fg = clamp((length(vW - uCam) - uFogN) / max(1.0, uFogF - uFogN), 0.0, 1.0); fg = fg * fg * (3.0 - 2.0 * fg);
  col = mix(col, uFogCol, fg); a = mix(a, 1.0, fg);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// the cliff skirt steps inward as it descends, so at sea level the rock sits this far inside the top outline: the shore map follows the WATERLINE
const WATERLINE_INSET = 0.72;
// ---- the bake: rasterise outlines, exact Euclidean distance transform (Felzenszwalb), pack to half floats. Generator: yield between slices.
function* edt(f, R, out, v, z) { // f: Float32Array R*R (0 or 1e20), out: squared distances
  const tmp = new Float64Array(R), d = new Float64Array(R);
  const line = (get, set) => {
    for (let i = 0; i < R; i++) tmp[i] = get(i);
    let k = 0; v[0] = 0; z[0] = -1e20; z[1] = 1e20;
    for (let q = 1; q < R; q++) { let s; for (;;) { const r = v[k]; s = ((tmp[q] + q * q) - (tmp[r] + r * r)) / (2 * q - 2 * r); if (s <= z[k]) k--; else break; } k++; v[k] = q; z[k] = s; z[k + 1] = 1e20; }
    k = 0; for (let q = 0; q < R; q++) { while (z[k + 1] < q) k++; const r = v[k]; d[q] = (q - r) * (q - r) + tmp[r]; }
    for (let i = 0; i < R; i++) set(i, d[i]);
  };
  for (let x = 0; x < R; x++) { line((y) => f[y * R + x], (y, val) => { out[y * R + x] = val; }); if ((x & 127) === 127) yield; }
  for (let y = 0; y < R; y++) { line((x) => out[y * R + x], (x, val) => { out[y * R + x] = val; }); if ((y & 127) === 127) yield; }
}
function* bakeShore(geos, rect, R, res) {
  const cv = document.createElement('canvas'); cv.width = cv.height = R; const c = cv.getContext('2d', { willReadFrequently: true }), k = R / rect.size;
  c.fillStyle = '#000'; c.fillRect(0, 0, R, R); c.fillStyle = '#fff';
  for (const g of geos) { const o = outline(g, 3), cx = g.x * W, cz = g.y * W; c.beginPath(); for (let i = 0; i < o.length; i += 2) { const l = Math.hypot(o[i], o[i + 1]), sc = 1 - WATERLINE_INSET / l, x = (cx + o[i] * sc - rect.x0) * k, y = (cz + o[i + 1] * sc - rect.z0) * k; i ? c.lineTo(x, y) : c.moveTo(x, y); } c.closePath(); c.fill(); }
  const img = c.getImageData(0, 0, R, R).data; yield;
  const N = R * R, f = new Float32Array(N), dOut = new Float32Array(N), dIn = new Float32Array(N), v = new Int32Array(R), z = new Float64Array(R + 1);
  for (let i = 0; i < N; i++) f[i] = img[i * 4] > 127 ? 0 : 1e20; yield* edt(f, R, dOut, v, z);
  for (let i = 0; i < N; i++) f[i] = img[i * 4] > 127 ? 1e20 : 0; yield* edt(f, R, dIn, v, z);
  const half = new Uint16Array(N), tex = rect.size / R, toH = THREE.DataUtils.toHalfFloat;
  for (let i = 0; i < N; i++) { const sd = (Math.sqrt(dOut[i]) - Math.sqrt(dIn[i])) * tex; half[i] = toH(Math.max(-12, Math.min(40, sd))); if ((i & 0x3ffff) === 0x3ffff) yield; }
  res.data = half; res.rect = rect; res.R = R;
}

export function createWater(V) {
  const U = {
    uShore: { value: null }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uHas: { value: 0 }, uT: kit.LOOK.t, uBeat: kit.LOOK.beat, uCloud: kit.LOOK.cloud, uSparkle: { value: 1 }, uFoam: { value: 1 },
    uFogN: { value: 60 }, uFogF: { value: 200 }, uGrowR: { value: 1 }, uGrowS: { value: 0 }, uGrowC: { value: new THREE.Vector2() },
    uShallow: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() }, uFoamCol: { value: new THREE.Color() }, uSky: { value: new THREE.Color() }, uFogCol: { value: new THREE.Color() }, uSun: { value: new THREE.Color() }, uCam: { value: new THREE.Vector3() }, uSunXZ: { value: new THREE.Vector2(0.7, -0.6) },
  };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, defines: kit.Q.detail === 0 ? { LOWQ: 1 } : {} });
  mat.userData.noCast = true; mat.userData.noLook = true;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400, 1, 1).rotateX(-Math.PI / 2), mat); mesh.frustumCulled = false; mesh.renderOrder = -5; mesh.name = 'sea'; mesh.userData.noBake = true;
  let job = null, pending = null, res = null, tex = null, wantKey = '';
  const api = {
    mesh, uniforms: U,
    /** ask for a (re)bake of these geos; the old map stays until the new one is ready */
    request(geos, extent, key) {
      if (!kit.HAS_DOM || key === wantKey) return; wantKey = key;
      const m = 9, w = (extent.x1 - extent.x0) * W + m * 2, h = (extent.y1 - extent.y0) * W + m * 2, size = Math.max(w, h), cx = (extent.x0 + extent.x1) / 2 * W, cz = (extent.y0 + extent.y1) / 2 * W;
      const R = Math.min(kit.Q.detail === 0 ? 512 : 1024, Math.max(256, 2 ** Math.ceil(Math.log2(size / 0.1))));
      pending = { geos, rect: { x0: cx - size / 2, z0: cz - size / 2, size }, R }; job = null;
    },
    /** run baking for at most `ms` milliseconds; true when something is in flight */
    work(ms) {
      if (!pending && !job) return false;
      const t0 = performance.now();
      if (pending && !job) { res = {}; job = bakeShore(pending.geos, pending.rect, pending.R, res); pending = null; }
      while (job && performance.now() - t0 < ms) {
        const r = job.next();
        if (r.done) { job = null; if (tex) tex.dispose(); tex = new THREE.DataTexture(res.data, res.R, res.R, THREE.RedFormat, THREE.HalfFloatType); tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.generateMipmaps = false; tex.needsUpdate = true;
          U.uShore.value = tex; U.uHas.value = 1; U.uRect.value.set(res.rect.x0, res.rect.z0, 1 / res.rect.size, 1 / res.rect.size); res = null; }
      }
      return !!(job || pending);
    },
    /** the newest land is "growing in": push its foam inward while it scales up (f 0..1) */
    grow(cx, cz, r, f) { U.uGrowS.value = f >= 1 ? 0 : (1 - f) * r; U.uGrowR.value = r; U.uGrowC.value.set(cx, cz); },
    update(dt, t, cam, mood, fog) {
      U.uCam.value.copy(cam.position); const s = 6; mesh.position.set(Math.round(cam.position.x / s) * s, WY + Math.sin(t * 0.8) * 0.035, Math.round(cam.position.z / s) * s);
      U.uShallow.value.copy(mood.water); U.uDeep.value.copy(mood.waterDeep); U.uFoamCol.value.copy(mood.foamCol); U.uSky.value.copy(mood.skyLow); U.uFogCol.value.copy(mood.fog); U.uSun.value.copy(mood.sunDisc);
      U.uSparkle.value = mood.sparkle; U.uFoam.value = mood.foam; U.uFogN.value = mood.fogNear; U.uFogF.value = mood.fogFar;
      const L = mood.sunDir, ly = Math.max(0.25, L[1]); U.uSunXZ.value.set(L[0] / ly, L[2] / ly);
    },
    dispose() { mesh.geometry.dispose(); mat.dispose(); if (tex) tex.dispose(); },
  };
  return api;
}
