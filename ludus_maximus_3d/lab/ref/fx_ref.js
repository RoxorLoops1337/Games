// fx_ref.js : shared environment FX + geometry helpers.
//   patchMaterial   onBeforeCompile injector (vertex sway, instanced animation)
//   prepGeo/mergeGeos/colorize/boxGeo  baked-AO vertex color + merged-geometry helpers
//   createFlames    torch flame (instanced billboard, noise shader, HDR -> bloom) + glow halos
//   createDustMotes GPU-animated Points (no CPU update)
//   createGodRays   additive sun shafts along the sun direction
//   createBlobShadows  fake contact shadows (instanced radial decals)
//   createWater     stylized water plane (fresnel, ripples, sun glint)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRadialTexture } from './tex_ref.js';

/** Inject GLSL into a built-in material. All chunks optional.
 *  vPars: after #include <common> in vertex; vBody: after #include <begin_vertex> (variable `transformed`);
 *  fPars: after <common> in fragment; fBody: after <color_fragment> (variable `diffuseColor`). */
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
const FLAME_VERT = /* glsl */`
attribute float aPhase;
varying vec2 vUv; varying float vPh;
uniform float uTime;
void main(){
  vUv = uv; vPh = aPhase;
  vec3 c = instanceMatrix[3].xyz;
  float s = length(instanceMatrix[0].xyz);
  vec4 mv = modelViewMatrix * vec4(c, 1.0);
  float fl = 1.0 + 0.12*sin(uTime*13.0 + aPhase*6.28) + 0.08*sin(uTime*23.0 + aPhase*11.0);
  mv.xy += vec2(position.x * s * 0.62, position.y * s * fl);
  mv.x += sin(uTime*7.0 + aPhase*6.28 + position.y*3.0) * 0.035 * s * position.y;
  gl_Position = projectionMatrix * mv;
}`;
const FLAME_FRAG = /* glsl */`
varying vec2 vUv; varying float vPh;
uniform float uTime, uInt;
${NOISE_GLSL}
void main(){
  vec2 p = vec2(vUv.x - 0.5, vUv.y);
  float t = uTime * 1.6 + vPh * 10.0;
  float n  = fbm(vec2(p.x * 3.5, p.y * 2.2 - t * 1.5));
  float n2 = fbm(vec2(p.x * 6.0 + 5.0, p.y * 4.0 - t * 2.4));
  float w = 0.46 * pow(max(1.0 - p.y, 0.0), 0.85) * (0.75 + 0.5 * n);
  float x = p.x + (n - 0.5) * 0.30 * p.y;
  float d = abs(x) / max(w, 0.001);
  float body = smoothstep(1.0, 0.2, d);
  float tip = 1.0 - smoothstep(0.5, 1.0, p.y + (n2 - 0.5) * 0.45);
  float a = body * tip * smoothstep(0.0, 0.06, p.y);
  float core = smoothstep(0.75, 0.0, d + p.y * 1.0 - 0.15 + (n2 - 0.5) * 0.3);
  vec3 col = mix(vec3(1.3, 0.28, 0.04), vec3(2.8, 1.25, 0.25), smoothstep(0.0, 0.7, 1.0 - p.y - d * 0.4));
  col = mix(col, vec3(4.2, 3.2, 1.7), core);
  gl_FragColor = vec4(col * uInt, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const GLOW_VERT = /* glsl */`
varying vec2 vUv; attribute float aPhase; uniform float uTime;
void main(){ vUv = uv; vec3 c = instanceMatrix[3].xyz; float s = length(instanceMatrix[0].xyz);
  vec4 mv = modelViewMatrix * vec4(c, 1.0);
  float fl = 1.0 + 0.06*sin(uTime*11.0 + aPhase*6.28);
  mv.xy += (position.xy - vec2(0.0, 0.5)) * s * fl; gl_Position = projectionMatrix * mv; }`;
const GLOW_FRAG = /* glsl */`
varying vec2 vUv; uniform float uGlow; uniform vec3 uColor;
void main(){ float r = length(vUv - 0.5) * 2.0; float a = pow(max(1.0 - r, 0.0), 2.6) * uGlow;
  gl_FragColor = vec4(uColor * 2.0, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** points: [{x,y,z,s}] (flame base position, s = flame height in meters). */
export function createFlames(points, { glowScale = 5 } = {}) {
  const n = points.length, g = new THREE.Group(); g.name = 'flames';
  const quad = new THREE.PlaneGeometry(1, 1); quad.translate(0, 0.5, 0);
  const ph = new Float32Array(n); for (let i = 0; i < n; i++) ph[i] = (i * 0.618034) % 1;
  const phA = () => new THREE.InstancedBufferAttribute(ph, 1);
  const uTime = { value: 0 }, uInt = { value: 1 }, uGlow = { value: 0.5 };
  const fg = quad.clone(); fg.setAttribute('aPhase', phA());
  const fm = new THREE.ShaderMaterial({ uniforms: { uTime, uInt }, vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const flame = new THREE.InstancedMesh(fg, fm, n); flame.frustumCulled = false; flame.renderOrder = 5;
  const gg = quad.clone(); gg.setAttribute('aPhase', phA());
  const gm = new THREE.ShaderMaterial({ uniforms: { uTime, uGlow, uColor: { value: new THREE.Color(0xff8a30) } }, vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const glow = new THREE.InstancedMesh(gg, gm, n); glow.frustumCulled = false; glow.renderOrder = 4;
  const m = new THREE.Matrix4();
  points.forEach((p, i) => {
    m.makeScale(p.s, p.s, p.s).setPosition(p.x, p.y, p.z); flame.setMatrixAt(i, m);
    const gs = p.s * glowScale; m.makeScale(gs, gs, gs).setPosition(p.x, p.y + p.s * 0.45, p.z); glow.setMatrixAt(i, m);
  });
  g.add(glow, flame);
  return {
    group: g, flame, glow,
    /** night 0..1 raises halo brightness (torches matter most at dusk/night) */
    update(t, night = 0) { uTime.value = t; uGlow.value = 0.18 + 0.55 * night; uInt.value = 1.0 + 0.35 * night; },
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
  const geo = base.clone(); const g2 = base.clone(); g2.rotateY(Math.PI / 2);
  const both = mergeGeometries([geo, g2]);
  const u = { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uInt: { value: intensity } };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: `varying vec2 vUv; varying float vD; void main(){ vUv = uv; vec4 mv = modelViewMatrix * instanceMatrix * vec4(position,1.); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying float vD; uniform float uTime, uInt; uniform vec3 uColor;
      void main(){
        float edge = smoothstep(0.0, 0.4, vUv.x) * smoothstep(1.0, 0.6, vUv.x);
        float along = smoothstep(0.0, 0.1, vUv.y) * pow(1.0 - vUv.y, 1.2);
        float n = 0.6 + 0.4 * sin(vUv.x * 19.0 + uTime * 0.35 + sin(vUv.y * 5.0 + uTime * 0.25) * 2.0);
        float a = edge * along * n * uInt * smoothstep(1.5, 8.0, vD);
        gl_FragColor = vec4(uColor * 1.4, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.InstancedMesh(both, mat, origins.length); mesh.frustumCulled = false; mesh.renderOrder = 3; mesh.name = 'godrays';
  const dir = sunDir.clone().multiplyScalar(-1).normalize(); // ray travel direction (downward)
  const m = new THREE.Matrix4(), X = new THREE.Vector3(), Z = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const place = (d) => {
    X.crossVectors(up, d).normalize(); Z.crossVectors(X, d).normalize();
    origins.forEach((o, i) => { m.makeBasis(X.clone().multiplyScalar(o.w), d.clone().multiplyScalar(o.len), Z.clone().multiplyScalar(o.w)); m.setPosition(o.x, o.y, o.z); mesh.setMatrixAt(i, m); });
    mesh.instanceMatrix.needsUpdate = true;
  };
  place(dir);
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
          sin(p.x*3.1 + uTime*1.3) * 0.5 + sin(p.y*4.3 - uTime*1.7 + p.x) * 0.5,
          6.0,
          cos(p.y*3.7 + uTime*1.1) * 0.5 + sin(p.x*5.1 + p.y*2.0 + uTime*1.9) * 0.5) * vec3(0.06,1.0,0.06));
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
