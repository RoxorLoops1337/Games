// SHELL: the moving parts of the title alley: neon sign (drop-in, sway, chase bulbs, dead-letter flicker), string lights, rain, steam vents, wet street reflections, light shafts.
// Everything is GPU driven (a few uniforms per frame, no allocations in update). No em dashes.
import { THREE, rng, flatMat } from './kit.js';
import { Buf, col } from './terrain_util.js';
import { signTex, glowTex } from './w_title_tex.js';
import { AL, LIGHTS } from './w_title_set.js';

const NOBLOOM = { toneMapped: false, fog: false };

// ------------------------------------------------------------------ the sign
export function buildSign() {
  const g = new THREE.Group(); g.name = 'title_sign'; const pivot = new THREE.Group(); g.add(pivot);
  const W = 3.45, H = 1.725, texA = signTex(0), texB = signTex(1), mask = signTex(0, true);
  const mat = new THREE.MeshBasicMaterial(Object.assign({ map: texA, transparent: true, color: '#ffffff', depthWrite: false }, NOBLOOM));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat); face.renderOrder = 6; pivot.add(face);
  const dead = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial(Object.assign({ map: mask, transparent: true, opacity: 0, depthWrite: false }, NOBLOOM))); dead.position.z = 0.012; dead.renderOrder = 7; pivot.add(dead);
  const bw = W * 0.965, bh = H * 0.94, br = 0.17, sh = new THREE.Shape(); sh.moveTo(-bw / 2 + br, -bh / 2); sh.lineTo(bw / 2 - br, -bh / 2); sh.quadraticCurveTo(bw / 2, -bh / 2, bw / 2, -bh / 2 + br); sh.lineTo(bw / 2, bh / 2 - br); sh.quadraticCurveTo(bw / 2, bh / 2, bw / 2 - br, bh / 2); sh.lineTo(-bw / 2 + br, bh / 2); sh.quadraticCurveTo(-bw / 2, bh / 2, -bw / 2, bh / 2 - br); sh.lineTo(-bw / 2, -bh / 2 + br); sh.quadraticCurveTo(-bw / 2, -bh / 2, -bw / 2 + br, -bh / 2);
  const back = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: false, curveSegments: 3 }), new THREE.MeshBasicMaterial({ color: '#0d0820' })); back.position.z = -0.1; back.renderOrder = 5; pivot.add(back);   // rounded plaque with real depth (the canvas face sits on its front)
  const hal = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.9, H * 2.1), new THREE.MeshBasicMaterial(Object.assign({ map: glowTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: '#ff3ea5', opacity: 0.5 }, NOBLOOM))); hal.position.z = -0.06; hal.renderOrder = 4; pivot.add(hal);
  // chains + mounting bar going up out of frame
  const dark = flatMat(), cb = new Buf({ rng: rng(3) });
  for (const s of [-1, 1]) for (let y = 0; y < 5; y += 0.18) cb.box(s * (W / 2 - 0.35), H / 2 + y, 0, 0.06, 0.14, 0.03, col('#a49fd0'), { base: 0, tint: 0.2 });
  cb.box(0, H / 2 - 0.02, -0.04, W * 0.9, 0.07, 0.07, col('#2a2540'), { base: 0 });
  const chain = new THREE.Mesh(cb.geometry(false), dark); chain.castShadow = false; pivot.add(chain);
  return { group: g, pivot, mat, texA, texB, dead: dead.material, hal: hal.material, W, H };
}

// ------------------------------------------------------------------ string lights: wire (lit mesh), bulbs (unlit mesh), halos (additive points, beat driven)
const SPANS = (() => {
  const out = [], sp = [4.5, 1.5, -1.5, -4.5, -7.5, -9.0];
  for (const s of [-1, 1]) for (let i = 0; i < sp.length - 1; i++) out.push([[s * (AL.hw - 0.08), 4.7 + (s > 0 ? 0.25 : 0) - (i % 2) * 0.1, sp[i]], [s * (AL.hw - 0.08), 4.7 + (s > 0 ? 0.25 : 0) - ((i + 1) % 2) * 0.1, sp[i + 1]], 0.42]);
  out.push([[-AL.hw + 0.05, 3.5, -5.7], [AL.hw - 0.05, 3.2, -5.7], 0.55], [[-AL.hw + 0.05, 4.0, -7.1], [AL.hw - 0.05, 4.3, -7.1], 0.5], [[-AL.hw + 0.05, 7.4, -6.3], [AL.hw - 0.05, 6.9, -6.3], 0.7], [[-AL.hw + 0.05, 6.6, -8.3], [AL.hw - 0.05, 7.2, -8.3], 0.6], [[-AL.hw + 0.05, 6.4, -7.3], [AL.hw - 0.05, 5.9, -7.3], 0.5]);
  return out;
})();
const PALB = ['#ff3ea5', '#ffe14d', '#2ee6ff', '#fff0d0', '#9dff4a', '#a86bff'];
export function buildStringLights() {
  const W = new Buf({ rng: rng(9) }), Bm = new Buf({ rng: rng(10) }), pos = [], colr = [], ph = [];
  SPANS.forEach(([a, b, sag], si) => {
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(3, Math.round(len / 0.55)); let pv = null;
    for (let i = 0; i <= n; i++) { const t = i / n, x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t, y = a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), P = [x, y, z];
      if (pv) { const dx = x - pv[0], dy = y - pv[1], dz = z - pv[2], l = Math.hypot(dx, dy, dz); W.push((x + pv[0]) / 2, (y + pv[1]) / 2, (z + pv[2]) / 2, Math.atan2(dx, dz), 1, -Math.asin(dy / l), 0); W.box(0, 0, 0, 0.02, 0.02, l, col('#1c1630'), { base: 0, tint: 0 }); W.pop(); }
      if (i > 0 && i < n) { const c = col(PALB[(si * 2 + i) % PALB.length]); Bm.box(x, y - 0.1, z, 0.1, 0.12, 0.1, [c[0] * 2.0, c[1] * 2.0, c[2] * 2.0], { base: 0, tint: 0, taper: 0.5 }); W.box(x, y - 0.03, z, 0.04, 0.04, 0.04, col('#1c1630'), { base: 0 }); pos.push(x, y - 0.1, z); colr.push(c[0], c[1], c[2]); ph.push(((si * 7 + i * 3) % 11) / 11); }
      pv = P; }
  });
  const group = new THREE.Group(); group.name = 'title_strings';
  group.add(new THREE.Mesh(W.geometry(false), flatMat()), new THREE.Mesh(Bm.geometry(false), new THREE.MeshBasicMaterial(Object.assign({ vertexColors: true }, NOBLOOM))));
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('aCol', new THREE.Float32BufferAttribute(colr, 3)); geo.setAttribute('aPh', new THREE.Float32BufferAttribute(ph, 1));
  const U = { uTime: { value: 0 }, uBeat: { value: 0 }, uScale: { value: 400 }, uTex: { value: glowTex() } };
  const halo = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
    vertexShader: 'attribute vec3 aCol; attribute float aPh; uniform float uTime, uBeat, uScale; varying vec3 vC; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; float tw = 0.65 + 0.35 * sin(uTime * 2.1 + aPh * 6.283); float ch = pow(max(0.0, sin(uTime * 2.6 - aPh * 9.0)), 6.0); vA = (0.38 + 0.3 * tw + 0.5 * uBeat + 0.35 * ch); vC = aCol; gl_PointSize = clamp(uScale * (0.55 + 0.25 * uBeat + 0.2 * ch) / max(0.5, -mv.z), 3.0, 90.0); }',
    fragmentShader: 'uniform sampler2D uTex; varying vec3 vC; varying float vA; void main(){ float a = texture2D(uTex, gl_PointCoord).a; gl_FragColor = vec4(vC * a * vA * 1.6, a * vA); }' }));
  halo.frustumCulled = false; halo.renderOrder = 8; group.add(halo);
  return { group, U };
}

// ------------------------------------------------------------------ rain: slanted streaks, additive, fade with distance, a few thousand pixels per frame
export function buildRain(n) {
  const R = rng(21), P = new Float32Array(n * 2 * 3), A = new Float32Array(n * 2 * 4);
  for (let i = 0; i < n; i++) { const x = (R() - 0.5) * 7.2, z = -9 + R() * 17, ph = R(), sp = 10 + R() * 5; for (let k = 0; k < 2; k++) { P.set([x, ph, z], (i * 2 + k) * 3); A.set([k, sp, 0.35 + R() * 0.65, R()], (i * 2 + k) * 4); } }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('aD', new THREE.BufferAttribute(A, 4));
  const U = { uTime: { value: 0 }, uAmt: { value: 1 }, uBeat: { value: 0 }, uCol: { value: new THREE.Color('#b8c6ff') } };
  const m = new THREE.LineSegments(geo, new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
    vertexShader: 'attribute vec4 aD; uniform float uTime, uAmt; varying float vA; void main(){ float H = 11.0; float y = mod(position.y * H - uTime * aD.y, H); vec3 p = vec3(position.x, y, position.z); p.x += y * 0.12 + 0.0; if (aD.x > 0.5) { p.y += 0.55 * aD.z; p.x += 0.07 * aD.z; } vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; float d = -mv.z; vA = aD.z * smoothstep(0.8, 3.0, d) * (1.0 - smoothstep(10.0, 20.0, d)) * (0.5 + 0.5 * smoothstep(9.0, 0.2, y)) * step(aD.w, uAmt); }',
    fragmentShader: 'uniform vec3 uCol; varying float vA; void main(){ gl_FragColor = vec4(uCol * vA * 0.55, vA * 0.55); }' }));
  m.frustumCulled = false; m.renderOrder = 9; m.name = 'title_rain'; return { mesh: m, U };
}

// ------------------------------------------------------------------ steam vents: soft puffs rising from a grate / pipe, tinted by the neon
export function buildSteam(vents) {
  const R = rng(5), N = 20, pos = [], ds = [];
  vents.forEach(([x, y, z, w], vi) => { for (let i = 0; i < N; i++) { pos.push(x, y, z); ds.push(i / N, R(), w, vi); } });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('aD', new THREE.Float32BufferAttribute(ds, 4));
  const U = { uTime: { value: 0 }, uScale: { value: 400 }, uBeat: { value: 0 }, uTex: { value: glowTex() }, uA: { value: new THREE.Color('#ff5fb8') }, uB: { value: new THREE.Color('#6fd6ff') } };
  const m = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, fog: false, toneMapped: false,
    vertexShader: 'attribute vec4 aD; uniform float uTime, uScale, uBeat; varying float vA; varying vec3 vT; uniform vec3 uA, uB; void main(){ float age = fract(uTime * 0.16 + aD.x); float k = age; vec3 p = position; p.y += k * (2.4 + aD.z * 0.4); p.x += sin(uTime * 0.7 + aD.y * 20.0 + k * 3.0) * 0.25 * k + (aD.y - 0.5) * 0.3 * k; p.z += cos(uTime * 0.5 + aD.y * 11.0) * 0.18 * k; vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uScale * (0.35 + k * 1.15) * aD.z / max(0.6, -mv.z); vA = sin(k * 3.14159) * (0.5 + 0.2 * aD.y) * (1.0 + 0.3 * uBeat); vT = mix(uA, uB, aD.w == 0.0 ? 0.0 : 0.5 + 0.5 * sin(aD.w)); }',
    fragmentShader: 'uniform sampler2D uTex; varying float vA; varying vec3 vT; void main(){ float a = texture2D(uTex, gl_PointCoord).a * vA; gl_FragColor = vec4(mix(vec3(0.66, 0.62, 0.84), vT, 0.35) * 0.9, a * 0.3); }' }));
  m.frustumCulled = false; m.renderOrder = 7; m.name = 'title_steam'; return { mesh: m, U };
}

// ------------------------------------------------------------------ wet street: dark patches + puddles, neon streak reflections and rain ripples in ONE transparent plane
export function buildWet() {
  const src = LIGHTS.filter((l) => ['sign', 'bladeL', 'bladeR', 'under', 'parL', 'parR', 'lampL', 'lampR'].indexOf(l.id) >= 0), S = new Array(8), C = new Array(8);
  src.forEach((l, i) => { const c = new THREE.Color(l.c); S[i] = new THREE.Vector4(Math.max(-1.5, Math.min(1.5, l.p[0])), l.p[2], l.id === 'sign' ? 0.9 : l.id === 'under' ? 1.0 : 0.4, l.k * (l.id === 'sign' ? 1.2 : 1)); C[i] = new THREE.Vector3(c.r, c.g, c.b); });
  const U = { uTime: { value: 0 }, uBeat: { value: 0 }, uRain: { value: 1 }, uS: { value: S }, uC: { value: C } };
  const geo = new THREE.PlaneGeometry(3.24, AL.zF - AL.zB, 1, 1); geo.rotateX(-Math.PI / 2); geo.translate(0, 0.02, (AL.zF + AL.zB) / 2);
  const mat = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, fog: false, toneMapped: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uTime, uBeat, uRain; uniform vec4 uS[8]; uniform vec3 uC[8]; varying vec3 vW;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        vec2 p = vW.xz;
        float n = vn(p * 1.1 + 3.0) * 0.6 + vn(p * 2.7) * 0.4;
        float pud = smoothstep(0.50, 0.62, n);                       // puddles: where the noise is high
        float wet = 0.35 + 0.65 * smoothstep(0.25, 0.7, vn(p * 0.8 + 9.0));
        // rain ripples (only on puddles)
        float rip = 0.0; vec2 q = p * 2.2;
        for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) { vec2 c = floor(q) + vec2(float(dx), float(dy)); float ph = fract(uTime * 0.62 + h21(c)); vec2 cp = c + vec2(h21(c + 3.1), h21(c + 7.7)); float d = length(q - cp); float r = ph * 0.5; rip += (1.0 - ph) * smoothstep(0.07, 0.0, abs(d - r)); }
        rip *= pud * uRain;
        vec3 refl = vec3(0.0);
        for (int i = 0; i < 8; i++) { vec4 s = uS[i]; float dz = p.y - s.y; float w = s.z * (1.0 + max(0.0, dz) * 0.22); float dx = (p.x - s.x) + (vn(vec2(p.x * 3.0, p.y * 1.5 - uTime * 0.25)) - 0.5) * 0.35 * (0.4 + rip + pud);
          float st = exp(-dx * dx / (w * w)) * smoothstep(-0.4, 0.5, dz) * exp(-max(0.0, dz) * 0.2) * s.w; refl += uC[i] * st; }
        float k = (wet * 0.35 + pud * 0.9) * (1.0 + uBeat * 0.45);
        vec3 col = refl * k * 0.42 + vec3(0.7, 0.8, 1.0) * rip * 0.2;
        float dark = pud * 0.7 + wet * 0.18 + smoothstep(0.0, 4.5, p.y) * 0.35;   // the street near the lens goes darker: the menu reads on it
        vec3 tint = vec3(0.05, 0.04, 0.16);
        gl_FragColor = vec4(tint * dark + col, dark);
      }` });
  const m = new THREE.Mesh(geo, mat); m.renderOrder = 3; m.name = 'title_wet'; return { mesh: m, U };
}

// ------------------------------------------------------------------ light shafts from the par cans (additive cones with a vertical fade)
export function buildShafts(lens) {
  const out = [], group = new THREE.Group(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(); group.name = 'title_shafts';
  lens.forEach(([x, y, z, cc, dx, dy, dz]) => {
    const geo = new THREE.CylinderGeometry(0.55, 0.07, 2.6, 20, 1, true); geo.translate(0, 1.3, 0);          // narrow end at the origin (the lens), widening away
    const mat = new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Color(cc) }, uK: { value: 0.5 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false,
      vertexShader: 'varying float vH; varying vec3 vN; varying vec3 vV; void main(){ vH = position.y / 2.6; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 uCol; uniform float uK; varying float vH; varying vec3 vN; varying vec3 vV; void main(){ float e = pow(abs(dot(normalize(vN), normalize(vV))), 1.5); float f = e * (1.0 - vH) * uK; gl_FragColor = vec4(uCol, f * 0.8); }' });
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y + 0.5, z); dir.set(dx, dy, dz).normalize(); m.quaternion.setFromUnitVectors(up, dir); m.renderOrder = 5; group.add(m); out.push(mat);
  });
  return { group, mats: out };
}

// ------------------------------------------------------------------ the sign mirrored in the wet street: a small blurred, flipped copy that shimmers with the rain (where the camera would see the reflection)
export function buildSignReflection(sign, camPos) {
  const cv = document.createElement('canvas'); cv.width = 48; cv.height = 24; const g = cv.getContext('2d'); g.imageSmoothingEnabled = true; const paint = () => { g.clearRect(0, 0, 48, 24); try { g.filter = 'blur(1.5px)'; } catch (e) { /* ignore */ } g.drawImage(sign.texA.image, 0, 0, 48, 24); }; paint();   // blurred to a glow streak, never readable mirrored text
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  if (sign.texA.fontReady) sign.texA.fontReady.then((ok) => { if (!ok) return; paint(); tex.needsUpdate = true; });
  const U = { uTex: { value: tex }, uTime: { value: 0 }, uBeat: { value: 0 } };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(sign.W * 0.36, sign.H * 0.9, 1, 1), new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D uTex; uniform float uTime, uBeat; varying vec2 vUv; void main(){ vec2 u = vUv; u.x += sin(u.y * 22.0 + uTime * 2.3) * 0.018 + sin(u.y * 9.0 - uTime * 1.3) * 0.012; u.y += sin(u.x * 14.0 + uTime * 1.7) * 0.015; vec4 t = texture2D(uTex, u); float e = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x) * smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.7, vUv.y); float a = t.a * e * (0.16 + 0.1 * uBeat); gl_FragColor = vec4(t.rgb * a * 1.3, a); }' }));
  // mirror geometry: sign centre (0, y, z) seen from the camera: the reflection lies on the ground between the two rays through the mirrored top and bottom edges
  const y = sign.group.position.y, z = sign.group.position.z, cy = camPos.y, cz = camPos.z, k = cy / (cy + y), zc = cz + k * (z - cz);
  m.rotation.x = Math.PI / 2; m.scale.x = -1; m.position.set(0, 0.03, zc); m.renderOrder = 4; m.name = 'title_signrefl'; return { mesh: m, U };
}
