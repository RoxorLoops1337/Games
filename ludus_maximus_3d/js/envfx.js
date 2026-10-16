// envfx.js : shared ENVIRONMENT FX + geometry helpers (not combat fx; see fx.js for that).
//   patchMaterial   onBeforeCompile injector (vertex sway, instanced animation)
//   prepGeo/mergeGeos/colorize/boxGeo  baked-AO vertex color + merged-geometry helpers
//   createFlames    torch flame (instanced billboard, noise shader, HDR -> bloom) + glow halos
//   createDustMotes GPU-animated Points (no CPU update)
//   createGodRays   additive sun shafts along the sun direction
//   createBlobShadows  fake contact shadows (instanced radial decals)
//   createWater     stylized water plane (fresnel, ripples, sun glint)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRadialTexture } from './envtex.js';

/** Inject GLSL into a built-in material. All chunks optional.
 *  vPars: after #include <common> in vertex; vBody: after #include <begin_vertex> (variable `transformed`);
 *  fPars: after <common> in fragment; fBody: after <color_fragment> (variable `diffuseColor`);
 *  vAfterUv: after <uv_vertex> (e.g. to remap vMapUv for a texture atlas). */
export function patchMaterial(mat, { key, uniforms = {}, vPars = '', vBody = '', fPars = '', fBody = '', vAfterUv = '' }) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + vPars)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + vBody)
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n' + vAfterUv);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + fPars)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + fBody);
  };
  mat.customProgramCacheKey = () => key || 'patched';
  return mat;
}

/** Make every geometry mergeable: non-indexed, with position/normal/uv/color. */
export function prepGeo(g, { color = 1, uvScale = 1 } = {}) {
  if (g.index) g = g.toNonIndexed();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  else if (uvScale !== 1) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvScale, uv.getY(i) * uvScale); }
  if (!g.attributes.color) {
    const n = g.attributes.position.count, c = new Float32Array(n * 3).fill(color);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  return g;
}
/** PERF: the geometry of every instance of an InstancedMesh, transformed by its matrix (baked, non-indexed, mergeable). Lets static repeated pieces that share a
 *  material become one plain Mesh (one draw call instead of one per instanced set). Costs memory (no instancing), so only for modest counts. */
export function bakeInstances(im) { const g0 = prepGeo(im.geometry.clone()), m = new THREE.Matrix4(), out = []; for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m); out.push(g0.clone().applyMatrix4(m)); } return out; }
export function mergeGeos(list) { return mergeGeometries(list.map((g) => prepGeo(g)), false); }
/** Bake per-vertex color: fn(x,y,z,nx,ny,nz) -> [r,g,b] or number (grey). Cheap fake AO / gradients / dirt. */
export function colorize(g, fn) {
  g = prepGeo(g);
  const p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const r = fn(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i), i);
    if (typeof r === 'number') c.setXYZ(i, r, r, r); else c.setXYZ(i, r[0], r[1], r[2]);
  }
  return g;
}
/** Axis-aligned box at (x,y,z) center with world-scaled UVs (1 uv unit = `texM` meters). */
export function boxGeo(w, h, d, x = 0, y = 0, z = 0, texM = 4) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / texM, uv.getY(i) * dims[f][1] / texM); }
  g.translate(x, y, z);
  return g;
}

// ---------------------------------------------------------------------------------------------
// Torch flames
// ---------------------------------------------------------------------------------------------
const NOISE_GLSL = /* glsl */`
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0., a = .5; for(int i=0;i<4;i++){ s += a*vn(p); p = p*2.02 + 3.7; a *= .5; } return s; }
`;
// PERF: flame body and glow halo share ONE instanced mesh (2n instances, aKind 1 = flame, 0 = halo) and one shader: 1 draw call instead of 2 per torch set.
const FLAME_VERT = /* glsl */`
attribute float aPhase; attribute float aKind;
varying vec2 vUv; varying float vPh; varying float vKind;
uniform float uTime;
void main(){
  vUv = uv; vPh = aPhase; vKind = aKind;
  vec3 c = instanceMatrix[3].xyz;
  float s = length(instanceMatrix[0].xyz);
  vec4 mv = modelViewMatrix * vec4(c, 1.0);
  if (aKind > 0.5) {
    float fl = 1.0 + 0.12*sin(uTime*13.0 + aPhase*6.28) + 0.08*sin(uTime*23.0 + aPhase*11.0);
    mv.xy += vec2(position.x * s * 0.62, position.y * s * fl);
    mv.x += sin(uTime*7.0 + aPhase*6.28 + position.y*3.0) * 0.035 * s * position.y;
  } else {
    float fl = 1.0 + 0.06*sin(uTime*11.0 + aPhase*6.28);
    mv.xy += (position.xy - vec2(0.0, 0.5)) * s * fl;
  }
  gl_Position = projectionMatrix * mv;
}`;
const FLAME_FRAG = /* glsl */`
varying vec2 vUv; varying float vPh; varying float vKind;
uniform float uTime, uInt, uGlow; uniform vec3 uColor;
${NOISE_GLSL}
void main(){
  if (vKind < 0.5) {
    float r = length(vUv - 0.5) * 2.0; float a = pow(max(1.0 - r, 0.0), 2.6) * uGlow;
    gl_FragColor = vec4(uColor * 2.0, a);
  } else {
  vec2 p = vec2(vUv.x - 0.5, vUv.y);
  float t = uTime * 1.6 + vPh * 10.0;
  float n  = fbm(vec2(p.x * 3.5, p.y * 2.2 - t * 1.5));
  float n2 = fbm(vec2(p.x * 6.0 + 5.0, p.y * 4.0 - t * 2.4));
  float w = 0.46 * pow(max(1.0 - p.y, 0.0), 0.85) * (0.75 + 0.5 * n);
  float x = p.x + (n - 0.5) * 0.30 * p.y;
  float d = abs(x) / max(w, 0.001);
  float body = 1.0 - smoothstep(0.2, 1.0, d);
  float tip = 1.0 - smoothstep(0.5, 1.0, p.y + (n2 - 0.5) * 0.45);
  float a = body * tip * smoothstep(0.0, 0.06, p.y);
  float core = 1.0 - smoothstep(0.0, 0.75, d + p.y * 1.0 - 0.15 + (n2 - 0.5) * 0.3);
  vec3 col = mix(vec3(1.3, 0.28, 0.04), vec3(2.8, 1.25, 0.25), smoothstep(0.0, 0.7, 1.0 - p.y - d * 0.4));
  col = mix(col, vec3(4.2, 3.2, 1.7), core);
  gl_FragColor = vec4(col * uInt, a);
  }
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** points: [{x,y,z,s}] (flame base position, s = flame height in meters). ONE draw call (flame bodies + glow halos in one instanced mesh). */
export function createFlames(points, { glowScale = 5 } = {}) {
  const n = points.length, g = new THREE.Group(); g.name = 'flames';
  const quad = new THREE.PlaneGeometry(1, 1); quad.translate(0, 0.5, 0);
  const ph = new Float32Array(n * 2), kind = new Float32Array(n * 2); for (let i = 0; i < n; i++) { ph[i] = ph[n + i] = (i * 0.618034) % 1; kind[i] = 0; kind[n + i] = 1; }
  const uTime = { value: 0 }, uInt = { value: 1 }, uGlow = { value: 0.5 };
  const fg = quad.clone(); fg.setAttribute('aPhase', new THREE.InstancedBufferAttribute(ph, 1)); fg.setAttribute('aKind', new THREE.InstancedBufferAttribute(kind, 1));
  const fm = new THREE.ShaderMaterial({ uniforms: { uTime, uInt, uGlow, uColor: { value: new THREE.Color(0xff8a30) } }, vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const flame = new THREE.InstancedMesh(fg, fm, n * 2); flame.frustumCulled = false; flame.renderOrder = 5; flame.name = 'flames_all';
  const m = new THREE.Matrix4();
  points.forEach((p, i) => {
    const gs = p.s * glowScale; m.makeScale(gs, gs, gs).setPosition(p.x, p.y + p.s * 0.45, p.z); flame.setMatrixAt(i, m);
    m.makeScale(p.s, p.s, p.s).setPosition(p.x, p.y, p.z); flame.setMatrixAt(n + i, m);
  });
  g.add(flame);
  return {
    group: g, flame, glow: flame,
    /** night 0..1 raises halo brightness (torches matter most at dusk/night) */
    update(t, night = 0) { uTime.value = t; uGlow.value = 0.14 + 0.26 * night; uInt.value = 1.0 + 0.35 * night; },
  };
}

// ---------------------------------------------------------------------------------------------
// Dust motes (Points; all motion in the vertex shader)
// ---------------------------------------------------------------------------------------------
export function createDustMotes({ count = 300, min = new THREE.Vector3(-20, 0.3, -20), max = new THREE.Vector3(20, 9, 20), size = 3.2, color = 0xfff0cc, wind = new THREE.Vector3(0.35, 0.05, 0.1), intensity = 1.4, seed = 1 } = {}) {
  const pos = new Float32Array(count * 3), seeds = new Float32Array(count * 4);
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < count; i++) {
    pos[i * 3] = min.x + rnd() * (max.x - min.x); pos[i * 3 + 1] = min.y + rnd() * (max.y - min.y); pos[i * 3 + 2] = min.z + rnd() * (max.z - min.z);
    for (let k = 0; k < 4; k++) seeds[i * 4 + k] = rnd();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  const size3 = max.clone().sub(min);
  const u = { uTime: { value: 0 }, uSize: { value: size }, uPR: { value: 1 }, uMin: { value: min.clone() }, uSize3: { value: size3 }, uWind: { value: wind.clone() }, uColor: { value: new THREE.Color(color) }, uInt: { value: intensity } };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: /* glsl */`
      attribute vec4 aSeed; uniform float uTime, uSize, uPR; uniform vec3 uMin, uSize3, uWind; varying float vA;
      void main(){
        vec3 p = position + uWind * uTime * (0.3 + aSeed.x * 0.7)
          + vec3(sin(uTime*0.3 + aSeed.y*6.28)*0.7, sin(uTime*0.4 + aSeed.z*6.28)*0.5, cos(uTime*0.25 + aSeed.w*6.28)*0.7);
        p = uMin + mod(p - uMin, uSize3);
        vec3 e = (p - uMin) / uSize3; vA = smoothstep(0.0, 0.1, min(min(e.x, 1.0-e.x), min(e.y, 1.0-e.y)));
        vA *= 0.35 + 0.65 * (0.5 + 0.5*sin(uTime*(0.7 + aSeed.y*1.5) + aSeed.z*30.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(uSize * uPR * (0.5 + aSeed.x) * 30.0 / -mv.z, 1.0, 14.0 * uPR);
        vA *= exp(-(-mv.z) * 0.025);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uInt; varying float vA;
      void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; float a = pow(max(1.0 - r, 0.0), 1.8) * vA;
        gl_FragColor = vec4(uColor * uInt, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 6; pts.name = 'dust';
  return { points: pts, uniforms: u, update(t, pr) { u.uTime.value = t; if (pr) u.uPR.value = pr; }, setSunColor(c) { u.uColor.value.set(c); } };
}

// ---------------------------------------------------------------------------------------------
// God rays (light shafts): crossed quads along the light direction. origins = [{x,y,z,w,len}] top point of each shaft.
// ---------------------------------------------------------------------------------------------
export function createGodRays(origins, sunDir, { color = 0xffc784, intensity = 0.16 } = {}) {
  const base = new THREE.PlaneGeometry(1, 1); base.translate(0, 0.5, 0);
  const g2 = base.clone(); g2.rotateY(Math.PI / 2);
  const both = mergeGeometries([base.clone(), g2]);
  const u = { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uInt: { value: intensity } };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: `varying vec2 vUv; varying float vD; void main(){ vUv = uv; vec4 mv = modelViewMatrix * instanceMatrix * vec4(position,1.); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying float vD; uniform float uTime, uInt; uniform vec3 uColor;
      void main(){
        float edge = smoothstep(0.0, 0.4, vUv.x) * (1.0 - smoothstep(0.6, 1.0, vUv.x));
        float along = smoothstep(0.0, 0.1, vUv.y) * pow(1.0 - vUv.y, 1.2);
        float n = 0.6 + 0.4 * sin(vUv.x * 19.0 + uTime * 0.35 + sin(vUv.y * 5.0 + uTime * 0.25) * 2.0);
        float a = edge * along * n * uInt * smoothstep(1.5, 8.0, vD);
        gl_FragColor = vec4(uColor * 1.4, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.InstancedMesh(both, mat, origins.length); mesh.frustumCulled = false; mesh.renderOrder = 3; mesh.name = 'godrays';
  const m = new THREE.Matrix4(), X = new THREE.Vector3(), Z = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const place = (d) => {
    X.crossVectors(up, d).normalize(); Z.crossVectors(X, d).normalize();
    origins.forEach((o, i) => { m.makeBasis(X.clone().multiplyScalar(o.w), d.clone().multiplyScalar(o.len), Z.clone().multiplyScalar(o.w)); m.setPosition(o.x, o.y, o.z); mesh.setMatrixAt(i, m); });
    mesh.instanceMatrix.needsUpdate = true;
  };
  place(sunDir.clone().multiplyScalar(-1).normalize());
  return { mesh, uniforms: u, update(t) { u.uTime.value = t; }, setSunDir(sd, col, inten) { place(sd.clone().multiplyScalar(-1).normalize()); if (col !== undefined) u.uColor.value.set(col); if (inten !== undefined) u.uInt.value = inten; } };
}

// ---------------------------------------------------------------------------------------------
// Blob shadows: soft violet radial decals. items = [{x,y,z,r}]
// ---------------------------------------------------------------------------------------------
export function createBlobShadows(items, { opacity = 0.55, color = 0x1a1230 } = {}) {
  const tex = makeRadialTexture(64, [[0, 'rgba(255,255,255,0.9)'], [0.55, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]);
  const geo = new THREE.PlaneGeometry(2, 2); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.InstancedMesh(geo, mat, items.length); mesh.renderOrder = 1; mesh.name = 'blobshadows';
  const m = new THREE.Matrix4();
  items.forEach((it, i) => { m.makeScale(it.r, 1, it.rz || it.r).setPosition(it.x, it.y + 0.04, it.z); mesh.setMatrixAt(i, m); });
  return mesh;
}

// ---------------------------------------------------------------------------------------------
// Water (fountain / pool): fresnel mix of deep color and sky color, ripple normals, sun glints.
// ---------------------------------------------------------------------------------------------
export function createWater(w, d, { deep = 0x1f5a66, shallow = 0x5fb2a6, sky = 0xbfd4f0 } = {}) {
  const u = { uTime: { value: 0 }, uDeep: { value: new THREE.Color(deep) }, uShallow: { value: new THREE.Color(shallow) }, uSky: { value: new THREE.Color(sky) }, uSunDir: { value: new THREE.Vector3(0, 0.3, 1) }, uSunCol: { value: new THREE.Color(0xffc27f) } };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, fog: false,
    vertexShader: `varying vec3 vW; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      varying vec3 vW; varying vec2 vUv; uniform float uTime; uniform vec3 uDeep, uShallow, uSky, uSunDir, uSunCol;
      void main(){
        vec2 p = vW.xz;
        vec3 n = normalize(vec3(
          (sin(p.x*3.1 + uTime*1.3) * 0.5 + sin(p.y*4.3 - uTime*1.7 + p.x) * 0.5) * 0.06,
          1.0,
          (cos(p.y*3.7 + uTime*1.1) * 0.5 + sin(p.x*5.1 + p.y*2.0 + uTime*1.9) * 0.5) * 0.06));
        vec3 V = normalize(cameraPosition - vW);
        float f = pow(1.0 - max(dot(n, V), 0.0), 3.0);
        vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 0.5, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)) * 2.0));
        col = mix(col, uSky, f * 0.85);
        vec3 H = normalize(uSunDir + V);
        col += uSunCol * pow(max(dot(n, H), 0.0), 220.0) * 6.0;
        gl_FragColor = vec4(col, 0.92);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); mesh.rotation.x = -Math.PI / 2; mesh.name = 'water';
  return { mesh, uniforms: u, update(t) { u.uTime.value = t; } };
}

// ---------------------------------------------------------------------------------------------
// ARENAS: pooled hazard visuals for the arena floor (fire, spikes, sand, trapdoor, pillar). createHazardFX({ max, lite, onEnd }) -> {
//   group, setHazards(list), updateHazards(list, t), update(t) (clock for shader animation), active(), stats() }.
// List items (sim plane, y is the sim's second axis = world z): { id, kind, x, y, r, t0, dur, tele? }. Lifecycle by age = t - t0:
//   age < 0 hidden | 0..tele TELEGRAPH (ring and cracks fill) | tele..dur-fade ACTIVE | last fade seconds CLEANUP (fades, scorch stamped through onEnd).
//   tele defaults to min(1.5, 0.45 * dur). An id that disappears from the list fades out in 0.35 s. Max 6 simultaneous (extra items are ignored).
// Cost: 3 draw calls only while something is up (ground telegraph quads, solids = spikes / pillar / trapdoor leaves / sand column in ONE instanced mesh whose parts collapse
// in the vertex shader by kind, flame billboards for fire) and 0 when the list is empty. All state in typed arrays, nothing allocated per frame.
// ---------------------------------------------------------------------------------------------
export const HAZARD_KINDS = ['fire', 'spikes', 'sand', 'trapdoor', 'pillar'];
const HZ_ID = { fire: 0, spikes: 1, sand: 2, trapdoor: 3, pillar: 4 };
const HZ_SPIKES = 11;
const HZ_GROUND_VERT = /* glsl */`
attribute vec4 aH; attribute vec4 aP; varying vec2 vQ; varying vec4 vH; varying vec4 vP;
void main(){ vQ = position.xz; vH = aH; vP = aP; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`;
const HZ_GROUND_FRAG = /* glsl */`
uniform float uTime; varying vec2 vQ; varying vec4 vH; varying vec4 vP;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
vec2 h22(vec2 p){ return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
float crackEdge(vec2 p){ vec2 n = floor(p), f = fract(p); float d1 = 8., d2 = 8.;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 g = vec2(float(i), float(j)); vec2 r = g + h22(n + g) - f; float d = dot(r, r); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return sqrt(d2) - sqrt(d1); }
vec4 acc;
void over(vec3 c, float a){ a = clamp(a, 0.0, 1.0); acc.rgb = c * a + acc.rgb * (1.0 - a); acc.a = a + acc.a * (1.0 - a); }
void main(){
  float kind = vH.x, f = vH.y, act = vH.z, fade = vH.w, seed = vP.x, ageI = vP.w;
  float d = length(vQ), ang = atan(vQ.y, vQ.x);
  float edge = 1.0 - smoothstep(0.9, 1.03, d);
  float ring = 1.0 - smoothstep(0.0, 0.05, abs(d - 1.0));
  float pulse = 0.65 + 0.35 * sin(uTime * (8.0 + 10.0 * f) + seed * 6.0);
  acc = vec4(0.0);
  if (kind < 0.5) {                                   // FIRE: cracks fill outward and glow, then jets burn and leave a scorch
    float cr = 1.0 - smoothstep(0.0, 0.09, crackEdge(vQ * 2.4 + seed * 7.0));
    float fillM = 1.0 - smoothstep(f * 1.02 - 0.06, f * 1.02, d);
    float n = vn(vQ * 5.0 + seed);
    over(vec3(0.03, 0.02, 0.015), edge * (0.3 * f + 0.4 * act) * (0.55 + 0.45 * n));
    over(vec3(2.7, 0.95, 0.18) * (0.75 + 0.45 * pulse), cr * edge * (fillM * (0.35 + 0.65 * f) + act));
    over(vec3(2.0, 0.55, 0.1) * (0.7 + 0.3 * sin(uTime * 14.0 + seed)), act * edge * (1.0 - d) * 0.55);
    over(vec3(2.4, 0.8, 0.2) * (0.6 + 0.8 * pulse), ring * (0.5 + 0.4 * pulse) * (1.0 - act * 0.6));
  } else if (kind < 1.5) {                            // SPIKES: dark holes light up red as the telegraph fills, the 3D spikes rise from them
    float hole = 0.0, rim = 0.0;
    for (int i = 0; i < ${HZ_SPIKES}; i++) {
      float fi = float(i); vec2 p = 0.8 * sqrt((fi + 0.5) / ${HZ_SPIKES}.0) * vec2(cos(fi * 2.39996), sin(fi * 2.39996));
      float l = length(vQ - p); hole = max(hole, 1.0 - smoothstep(0.11, 0.15, l)); rim = max(rim, (1.0 - smoothstep(0.15, 0.26, l)) * (1.0 - hole));
    }
    over(vec3(2.6, 0.35, 0.15) * (0.7 + 0.5 * pulse), rim * (0.15 + 0.7 * f) * edge * (1.0 - act * 0.6));
    over(vec3(0.015, 0.01, 0.01), hole * (0.35 + 0.6 * f));
    over(vec3(2.2, 0.4, 0.25) * (0.6 + 0.7 * pulse), ring * (0.45 + 0.35 * pulse) * (1.0 - act * 0.7));
  } else if (kind < 2.5) {                            // SAND: a spiral that spins up, pale ring, haze disc
    float s = sin(ang * 3.0 + d * 9.0 - uTime * (1.5 + act * 7.0) + seed * 6.0);
    float band = smoothstep(0.15, 0.9, s) * edge;
    vec3 tan = vec3(0.9, 0.7, 0.4) * (1.0 + 0.4 * act);
    over(tan, edge * 0.16 * f + edge * 0.12 * act);
    over(tan, band * (0.16 + 0.34 * f + 0.4 * act) * (1.0 - d * 0.45));
    over(vec3(1.5, 1.15, 0.6) * (0.7 + 0.5 * pulse), ring * (0.4 + 0.3 * pulse) * (1.0 - act * 0.6));
  } else if (kind < 3.5) {                            // TRAPDOOR: boards glow amber at the seams, then split open over a black pit
    float qd = max(abs(vQ.x), abs(vQ.y));
    float sq = 1.0 - smoothstep(0.76, 0.8, qd), outline = 1.0 - smoothstep(0.0, 0.04, abs(qd - 0.78));
    float seam = 1.0 - smoothstep(0.0, 0.03, abs(vQ.x));
    float planks = (1.0 - smoothstep(0.0, 0.012, abs(fract(vQ.y * 3.2) - 0.5) - 0.47)) * 0.5;
    over(vec3(0.16, 0.1, 0.06), sq * (0.45 + planks) * f * (1.0 - act));
    over(vec3(2.4, 1.1, 0.3) * (0.6 + 0.6 * pulse), (outline + seam * 0.7) * sq * (0.25 + 0.7 * f) * (1.0 - act * 0.8));
    float open = act * 0.78, pit = (1.0 - smoothstep(open - 0.02, open, abs(vQ.x))) * sq * step(0.001, act);
    over(vec3(0.005, 0.004, 0.006), pit * 0.97);
    over(vec3(0.7, 0.4, 0.2) * 0.5, outline * act * 0.6);
  } else {                                            // PILLAR: shadow of the falling column grows, red ring, then dust ring and cracks on impact
    float sh = 1.0 - smoothstep(f * 0.95 - 0.12, f * 0.95 + 0.02, d);
    over(vec3(0.0), sh * (0.18 + 0.4 * f) * edge);
    over(vec3(2.6, 0.45, 0.2) * (0.6 + 0.8 * pulse), ring * (0.5 + 0.4 * pulse) * (1.0 - step(0.0, ageI) * 0.8));
    float hit = step(0.0, ageI), rr = clamp(ageI * 2.4, 0.0, 1.7);
    over(vec3(0.85, 0.74, 0.56), (1.0 - smoothstep(0.0, 0.3, abs(d - rr))) * hit * (1.0 - rr / 1.7) * 0.6);
    float rays = pow(abs(sin(ang * 7.0 + seed * 9.0 + floor(d * 4.0) * 0.8)), 24.0) * (1.0 - smoothstep(0.1, 0.8, d)) * hit;
    over(vec3(0.03, 0.02, 0.02), rays * 0.7);
    over(vec3(0.05, 0.04, 0.03), hit * (1.0 - smoothstep(0.1, 0.45, d)) * 0.5);
  }
  acc.a *= fade;
  if (acc.a < 0.003) discard;
  gl_FragColor = vec4(acc.rgb / max(acc.a, 1e-4), acc.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createHazardFX({ max = 6, lite = false, onEnd = null } = {}) {
  const group = new THREE.Group(); group.name = 'hazards';
  const ids = new Array(max).fill(null), kind = new Float32Array(max).fill(-1), X = new Float32Array(max), Z = new Float32Array(max), R = new Float32Array(max);
  const T0 = new Float32Array(max), DUR = new Float32Array(max), TELE = new Float32Array(max), SEED = new Float32Array(max), seen = new Uint8Array(max), ended = new Uint8Array(max), gone = new Uint8Array(max);
  const aHarr = new Float32Array(max * 4), aParr = new Float32Array(max * 4);
  const aH = new THREE.InstancedBufferAttribute(aHarr, 4), aP = new THREE.InstancedBufferAttribute(aParr, 4); aH.setUsage(THREE.DynamicDrawUsage); aP.setUsage(THREE.DynamicDrawUsage);
  const uTime = { value: 0 }, M = new THREE.Matrix4(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  let nActive = 0, lastList = null, anyG = false, anyS = false, anyF = false;

  // ---- ground telegraphs / scorch (1 draw call)
  const gGeo = new THREE.PlaneGeometry(2.7, 2.7); gGeo.rotateX(-Math.PI / 2); gGeo.setAttribute('aH', aH); gGeo.setAttribute('aP', aP);
  const gMat = new THREE.ShaderMaterial({ uniforms: { uTime }, vertexShader: HZ_GROUND_VERT, fragmentShader: HZ_GROUND_FRAG, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const ground = new THREE.InstancedMesh(gGeo, gMat, max); ground.frustumCulled = false; ground.renderOrder = 2; ground.name = 'hazard_ground'; ground.visible = false;
  for (let i = 0; i < max; i++) ground.setMatrixAt(i, ZERO); ground.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  // ---- solids (1 draw call): part kind 1 spikes, 2 + 3 trapdoor leaves, 4 pillar, 5 sand column
  const parts = [];
  const add = (g, pk, cx, cz, rv, rgb, shade) => {
    g = g.index ? g.toNonIndexed() : g; const n = g.attributes.position.count, p = g.attributes.position, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const k = shade ? shade(p.getY(i)) : 1; c[i * 3] = rgb[0] * k; c[i * 3 + 1] = rgb[1] * k; c[i * 3 + 2] = rgb[2] * k; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.setAttribute('aPK', new THREE.BufferAttribute(new Float32Array(n).fill(pk), 1));
    g.setAttribute('aC', new THREE.BufferAttribute(new Float32Array(n * 2).map((_, i) => (i % 2 ? cz : cx)), 2)); g.setAttribute('aPI', new THREE.BufferAttribute(new Float32Array(n).fill(rv), 1));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    parts.push(g);
  };
  for (let i = 0; i < HZ_SPIKES; i++) {
    const a = i * 2.39996, rr = 0.8 * Math.sqrt((i + 0.5) / HZ_SPIKES);
    add(new THREE.ConeGeometry(0.15, 1.15, 5, 1, true).translate(0, 0.575, 0), 1, Math.cos(a) * rr, Math.sin(a) * rr, (i * 0.37) % 1, [0.62, 0.64, 0.68], (y) => 0.55 + 0.6 * Math.min(1, y / 1.15));
  }
  add(new THREE.BoxGeometry(0.78, 0.07, 1.56).translate(-0.39, -0.035, 0), 2, 0.78, 0, 0, [0.26, 0.16, 0.09]);
  add(new THREE.BoxGeometry(0.78, 0.07, 1.56).translate(0.39, -0.035, 0), 3, -0.78, 0, 0, [0.26, 0.16, 0.09]);
  { const col = new THREE.CylinderGeometry(0.5, 0.56, 7, 10).translate(0, 3.5, 0), cap = new THREE.BoxGeometry(1.5, 0.32, 1.5).translate(0, 7.16, 0), base = new THREE.BoxGeometry(1.4, 0.3, 1.4).translate(0, 0.15, 0);
    add(col, 4, 0, 0, 0, [0.86, 0.82, 0.74], (y) => 0.8 + 0.2 * Math.sin(y * 3.0)); add(cap, 4, 0, 0, 0, [0.92, 0.88, 0.8]); add(base, 4, 0, 0, 0, [0.7, 0.66, 0.6]); }
  add(new THREE.CylinderGeometry(0.4, 1.0, 5.5, lite ? 14 : 20, lite ? 7 : 11, true).translate(0, 2.75, 0), 5, 0, 0, 0, [0.86, 0.68, 0.42]);
  const sGeo = mergeGeometries(parts); sGeo.setAttribute('aH', aH); sGeo.setAttribute('aP', aP);
  const sMat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: true }), {
    key: 'hazsolid', uniforms: { uTime },
    vPars: 'attribute vec4 aH; attribute vec4 aP; attribute float aPK; attribute vec2 aC; attribute float aPI; uniform float uTime; varying float vA; varying vec2 vSt;',
    vBody: `
      float k = aH.x, f = aH.y, act = aH.z, fd = aH.w, r = aP.z, imp = aP.w, pk = aPK;
      float want = pk < 1.5 ? 1.0 : (pk < 3.5 ? 3.0 : (pk < 4.5 ? 4.0 : 2.0));
      vA = 1.0; vSt = vec2(0.0);
      vec3 sp = position; vec3 anchor = vec3(aC.x * r, 0.0, aC.y * r);
      if (abs(k - want) > 0.5 || fd < 0.01) { transformed = vec3(0.0, -50.0, 0.0); }
      else if (pk < 1.5) { float rise = clamp(act * (1.15 + 0.3 * aPI) - 0.1 * aPI, 0.0, 1.0); rise = 1.0 - pow(1.0 - rise, 3.0); float s = clamp(r / 2.0, 0.7, 1.25); transformed = anchor + vec3(sp.x * s, sp.y * rise * s - 0.03, sp.z * s); }
      else if (pk < 3.5) { float side = pk < 2.5 ? 1.0 : -1.0; float ph = act * 1.5 * side; float cs = cos(ph), sn = sin(ph); vec3 l = vec3(sp.x * r, sp.y, sp.z * r); transformed = vec3(anchor.x + l.x * cs - l.y * sn, l.x * sn + l.y * cs + 0.02, l.z) * step(0.001, act) + vec3(0.0, -50.0, 0.0) * (1.0 - step(0.001, act)); }
      else if (pk < 4.5) { float sc = clamp(r * 0.45, 0.8, 1.4); float fall = 1.0 - f * f * f; float hgt = (1.0 - step(0.0, imp)) * fall * 22.0 + step(0.0, imp) * exp(-imp * 14.0) * 0.25; float sink = (1.0 - fd) * 7.4; transformed = vec3(sp.x * sc, sp.y + hgt - sink, sp.z * sc); vA = step(0.001, f); }
      else { float hh = sp.y / 5.5; float rr = r * 0.85; float tw = hh * 1.2 + 0.4 * sin(uTime * 1.3 + hh * 3.0); float cs = cos(tw), sn = sin(tw); vec2 xz = sp.xz * rr; xz = vec2(xz.x * cs - xz.y * sn, xz.x * sn + xz.y * cs); float grow = clamp(act * 1.3, 0.0, 1.0); transformed = vec3(xz.x * (0.25 + 0.75 * grow), sp.y * grow, xz.y * (0.25 + 0.75 * grow)); vSt = vec2(atan(sp.z, sp.x) * 2.0 + hh * 5.0 - uTime * 6.0, hh); vA = act * fd * (0.42 - 0.26 * hh); }
      `,
    fPars: 'varying float vA; varying vec2 vSt;',
    fBody: 'diffuseColor.a *= vA * mix(1.0, 0.55 + 0.45 * sin(vSt.x * 3.0), step(0.0001, abs(vSt.y)));',
  });
  const solids = new THREE.InstancedMesh(sGeo, sMat, max); solids.frustumCulled = false; solids.renderOrder = 3; solids.name = 'hazard_solids'; solids.visible = false; solids.castShadow = false;
  for (let i = 0; i < max; i++) solids.setMatrixAt(i, ZERO); solids.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  // ---- fire jets (1 draw call): 7 flame billboards per slot, matrices rewritten while a fire hazard is active
  const FL = 7, fpts = []; for (let i = 0; i < max * FL; i++) fpts.push({ x: 0, y: 0, z: 0, s: 1 });
  const flames = createFlames(fpts, { glowScale: 2.4 }); flames.flame.visible = true; flames.group.visible = false;
  const fn = max * FL, FM = new THREE.Matrix4();
  for (let i = 0; i < fn * 2; i++) flames.flame.setMatrixAt(i, ZERO); flames.flame.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  group.add(ground, solids, flames.group);

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const RISE = [0.35, 0.12, 0.5, 0.45, 0.02];
  function alloc(it) {
    for (let s = 0; s < max; s++) if (ids[s] === null) {
      ids[s] = it.id; kind[s] = HZ_ID[it.kind] === undefined ? 0 : HZ_ID[it.kind]; ended[s] = 0; gone[s] = 0;
      let h = 7; const str = String(it.id); for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 9973; SEED[s] = (h % 997) / 997; return s;
    }
    return -1;
  }
  function free(s) {
    if (!ended[s] && onEnd) { ended[s] = 1; try { onEnd(HAZARD_KINDS[kind[s]], X[s], Z[s], R[s]); } catch (e) { /* a stamp must never break the frame */ } }
    ids[s] = null; kind[s] = -1; ground.setMatrixAt(s, ZERO); solids.setMatrixAt(s, ZERO);
    for (let k = 0; k < FL; k++) { flames.flame.setMatrixAt(s * FL + k, ZERO); flames.flame.setMatrixAt(fn + s * FL + k, ZERO); }
  }
  function sync(list) {
    seen.fill(0);
    if (list) for (let i = 0; i < list.length; i++) {
      const it = list[i]; if (!it) continue;
      let s = -1; for (let q = 0; q < max; q++) if (ids[q] === it.id) { s = q; break; }
      if (s < 0) { s = alloc(it); if (s < 0) continue; }
      seen[s] = 1; X[s] = it.x; Z[s] = it.y; R[s] = it.r > 0 ? it.r : 1.5; T0[s] = it.t0; const dur = it.dur > 0 ? it.dur : 3; if (!gone[s]) DUR[s] = dur;
      TELE[s] = it.tele > 0 ? Math.min(it.tele, dur * 0.9) : Math.min(1.5, dur * 0.45);
    }
    return list;
  }
  function pose(t) {
    nActive = 0; anyG = anyS = anyF = false; let fl = false;
    for (let s = 0; s < max; s++) {
      if (ids[s] === null) continue;
      if (!seen[s] && !gone[s]) { gone[s] = 1; const a = t - T0[s]; DUR[s] = Math.max(0.05, Math.min(DUR[s], a + 0.35)); }
      const age = t - T0[s], dur = DUR[s], tele = TELE[s], k = kind[s];
      if (age > dur + 0.02) { free(s); continue; }
      if (age < 0) { ground.setMatrixAt(s, ZERO); solids.setMatrixAt(s, ZERO); continue; }
      const fadeLen = Math.min(0.5, dur * 0.25), fOut = 1 - clamp01((age - (dur - fadeLen)) / fadeLen), fIn = clamp01(age / 0.15);
      const f = clamp01(age / tele), rise = clamp01((age - tele) / RISE[k]), act = rise * fOut, imp = age >= tele ? age - tele : -1;
      aHarr[s * 4] = k; aHarr[s * 4 + 1] = f; aHarr[s * 4 + 2] = act; aHarr[s * 4 + 3] = fIn * fOut;
      aParr[s * 4] = SEED[s] * 6.28; aParr[s * 4 + 1] = age; aParr[s * 4 + 2] = R[s]; aParr[s * 4 + 3] = imp;
      M.makeScale(R[s], 1, R[s]).setPosition(X[s], 0.035 + 0.002 * s, Z[s]); ground.setMatrixAt(s, M);
      M.makeTranslation(X[s], 0.0, Z[s]); solids.setMatrixAt(s, M);
      nActive++; anyG = true; if (k !== 0) anyS = true;
      if (k === 0) {                                   // fire jets: a centre column and six around the ring, heights ripple
        fl = true; const hs = act * (0.9 + 0.5 * Math.min(R[s], 2.5) * 0.5);
        for (let j = 0; j < FL; j++) {
          const a = j * 1.0472 + SEED[s] * 6.28, rr = j === 0 ? 0 : R[s] * (0.62 + 0.12 * Math.sin(j * 3.1 + SEED[s] * 9)), sz = hs * (j === 0 ? 1.15 : 0.8 + 0.3 * Math.sin(j * 2.3 + t * 3.0 + SEED[s] * 7));
          const px = X[s] + Math.cos(a) * rr, pz = Z[s] + Math.sin(a) * rr;
          if (sz < 0.02) { flames.flame.setMatrixAt(s * FL + j, ZERO); flames.flame.setMatrixAt(fn + s * FL + j, ZERO); continue; }
          FM.makeScale(sz * 2.4, sz * 2.4, sz * 2.4).setPosition(px, 0.05 + sz * 0.45, pz); flames.flame.setMatrixAt(s * FL + j, FM);
          FM.makeScale(sz, sz, sz).setPosition(px, 0.05, pz); flames.flame.setMatrixAt(fn + s * FL + j, FM);
        }
        if (act > 0.02) anyF = true;
      }
    }
    ground.visible = anyG; solids.visible = anyS; flames.group.visible = anyF;
    ground.instanceMatrix.needsUpdate = true; solids.instanceMatrix.needsUpdate = true; aH.needsUpdate = true; aP.needsUpdate = true;
    if (anyF || fl) flames.flame.instanceMatrix.needsUpdate = true;   // fl: a fire is up (even if invisible this frame) so cleared matrices upload
  }
  return {
    group, ground, solids, flames,
    setHazards(list) { lastList = sync(list); },
    updateHazards(list, t) { if (list !== undefined) lastList = list; sync(lastList); pose(t); },
    /** shader clock (seconds); call each frame, independent of the sim time used for the hazard ages */
    update(t) { uTime.value = t; flames.update(t, 0.35); },
    active() { return nActive; },
    stats() { return { active: nActive, drawCalls: (ground.visible ? 1 : 0) + (solids.visible ? 1 : 0) + (flames.group.visible ? 1 : 0) }; },
    dispose() { gGeo.dispose(); gMat.dispose(); sGeo.dispose(); sMat.dispose(); },
  };
}
