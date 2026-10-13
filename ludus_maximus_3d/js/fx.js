// Ludus Maximus 3D: pooled combat VFX reference: sparks, dust, flashes, light (blood and gore live in js/gore.js and draw through the hooks below).
// 8 draw calls total, all pooled / instanced:
//   decal (1 plane) | particles normal-blend (dust, smoke, drops) | debris (InstancedMesh) | rings+tele (GPU timed)
//   particles additive (sparks, glows, stars, motes) | slash crescents (GPU timed) | ribbons (trails, bolts, beams) | glyph numbers
// Usage: const fx = createFx(scene, {arenaRadius:14}); each frame fx.update(scaledDt, camera).
import * as THREE from 'three';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------------- atlas (4x4 cells of 128px) ----------------
const CELL = { glow: 0, disc: 1, star4: 2, streak: 3, puffA: 4, puffB: 5, star5: 6, drop: 7, plus: 8, swirl: 9, ring: 10, burst: 11, exclaim: 12, ember: 13, bolt: 14, chevron: 15 };
function mkCanvas(w, h) { if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; } return new OffscreenCanvas(w, h); }

function buildAtlas(rnd) {
  const S = 512, C = 128, cv = mkCanvas(S, S), g = cv.getContext('2d');
  const cell = (i, fn) => { g.save(); g.translate((i % 4) * C + C / 2, Math.floor(i / 4) * C + C / 2); g.beginPath(); g.rect(-C / 2, -C / 2, C, C); g.clip(); fn(); g.restore(); };
  const rg = (r, stops) => { const gr = g.createRadialGradient(0, 0, 0, 0, 0, r); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };
  const W = (a) => `rgba(255,255,255,${a})`;
  cell(CELL.glow, () => { g.fillStyle = rg(60, [[0, W(1)], [0.15, W(0.7)], [0.45, W(0.22)], [1, W(0)]]); g.fillRect(-64, -64, 128, 128); });
  cell(CELL.disc, () => { g.fillStyle = rg(58, [[0, W(1)], [0.7, W(0.95)], [1, W(0)]]); g.fillRect(-64, -64, 128, 128); });
  cell(CELL.star4, () => { // 4 point flare with hot core
    g.fillStyle = rg(60, [[0, W(1)], [0.12, W(0.8)], [0.4, W(0.1)], [1, W(0)]]); g.fillRect(-64, -64, 128, 128);
    for (let k = 0; k < 2; k++) { g.save(); g.rotate(k * Math.PI / 2); const lg = g.createLinearGradient(-60, 0, 60, 0); lg.addColorStop(0, W(0)); lg.addColorStop(0.5, W(1)); lg.addColorStop(1, W(0));
      g.fillStyle = lg; g.beginPath(); g.moveTo(-60, 0); g.quadraticCurveTo(0, -7, 60, 0); g.quadraticCurveTo(0, 7, -60, 0); g.fill(); g.restore(); }
    g.save(); g.rotate(Math.PI / 4); const lg = g.createLinearGradient(-36, 0, 36, 0); lg.addColorStop(0, W(0)); lg.addColorStop(0.5, W(0.55)); lg.addColorStop(1, W(0)); g.fillStyle = lg; g.fillRect(-36, -2, 72, 4); g.rotate(Math.PI / 2); g.fillRect(-36, -2, 72, 4); g.restore();
  });
  cell(CELL.streak, () => { // horizontal capsule, bright head at +x
    const lg = g.createLinearGradient(-62, 0, 62, 0); lg.addColorStop(0, W(0)); lg.addColorStop(0.6, W(0.55)); lg.addColorStop(0.92, W(1)); lg.addColorStop(1, W(0.6));
    g.fillStyle = lg; g.beginPath(); g.moveTo(-62, 0); g.quadraticCurveTo(10, -26, 60, 0); g.quadraticCurveTo(10, 26, -62, 0); g.fill();
    g.fillStyle = rg(30, [[0, W(0.8)], [1, W(0)]]); g.save(); g.translate(46, 0); g.fillRect(-30, -30, 60, 60); g.restore();
  });
  const puff = (i, n) => cell(i, () => { // smoke / dust ball: many soft overlapping lobes, top lit
    for (let k = 0; k < n; k++) { const a = rnd() * TAU, d = Math.sqrt(rnd()) * 22, x = Math.cos(a) * d, y = Math.sin(a) * d * 0.9, r = 16 + rnd() * 16;
      const sh = clamp(0.8 + (-y / 40) * 0.35, 0.62, 1); const v = Math.round(255 * sh);
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${v},${v},${v},0.2)`); gr.addColorStop(0.55, `rgba(${v},${v},${v},0.13)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  });
  puff(CELL.puffA, 30); puff(CELL.puffB, 22);
  cell(CELL.star5, () => { g.fillStyle = W(1); g.strokeStyle = 'rgb(110,60,10)'; g.lineJoin = 'round'; g.lineWidth = 12; g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 24 : 54, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.stroke(); g.fill(); });
  cell(CELL.drop, () => { g.fillStyle = W(1); g.strokeStyle = 'rgb(60,10,10)'; g.lineWidth = 10; g.lineJoin = 'round'; g.beginPath(); g.moveTo(0, -50); g.bezierCurveTo(10, -22, 30, 4, 30, 22); g.arc(0, 22, 30, 0, Math.PI); g.bezierCurveTo(-30, 4, -10, -22, 0, -50); g.stroke(); g.fill(); });
  cell(CELL.plus, () => { g.fillStyle = W(1); g.strokeStyle = 'rgb(20,80,50)'; g.lineJoin = 'round'; g.lineWidth = 12; const a = 15, b = 44; g.beginPath(); g.moveTo(-a, -b); g.lineTo(a, -b); g.lineTo(a, -a); g.lineTo(b, -a); g.lineTo(b, a); g.lineTo(a, a); g.lineTo(a, b); g.lineTo(-a, b); g.lineTo(-a, a); g.lineTo(-b, a); g.lineTo(-b, -a); g.lineTo(-a, -a); g.closePath(); g.stroke(); g.fill(); });
  cell(CELL.swirl, () => { g.strokeStyle = W(1); g.lineCap = 'round'; for (let k = 0; k < 3; k++) { g.lineWidth = 9 - k * 2; g.beginPath(); for (let t = 0; t < 4.2; t += 0.1) { const r = 8 + t * 11 - k * 3, a = t * 1.6 + k * 2.1; const x = Math.cos(a) * r, y = Math.sin(a) * r; t ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); } });
  cell(CELL.ring, () => { g.strokeStyle = W(1); g.lineWidth = 7; g.beginPath(); g.arc(0, 0, 52, 0, TAU); g.stroke(); g.strokeStyle = W(0.35); g.lineWidth = 16; g.beginPath(); g.arc(0, 0, 52, 0, TAU); g.stroke(); });
  cell(CELL.burst, () => { g.fillStyle = W(1); for (let k = 0; k < 14; k++) { const a = k / 14 * TAU + rnd() * 0.2, l = 30 + rnd() * 30; g.save(); g.rotate(a); const lg = g.createLinearGradient(8, 0, l + 8, 0); lg.addColorStop(0, W(0.9)); lg.addColorStop(1, W(0)); g.fillStyle = lg; g.beginPath(); g.moveTo(8, -2.5); g.lineTo(l + 8, 0); g.lineTo(8, 2.5); g.fill(); g.restore(); } });
  cell(CELL.exclaim, () => { g.fillStyle = W(1); g.strokeStyle = 'rgb(90,15,5)'; g.lineJoin = 'round'; g.lineWidth = 12; g.beginPath(); g.moveTo(-15, -52); g.lineTo(15, -52); g.lineTo(9, 12); g.lineTo(-9, 12); g.closePath(); g.stroke(); g.fill(); g.beginPath(); g.arc(0, 38, 12, 0, TAU); g.stroke(); g.fill(); });
  cell(CELL.ember, () => { g.fillStyle = rg(30, [[0, W(1)], [0.5, W(0.8)], [1, W(0)]]); g.fillRect(-64, -64, 128, 128); g.fillStyle = W(1); g.beginPath(); g.moveTo(0, -24); g.lineTo(14, 0); g.lineTo(0, 24); g.lineTo(-14, 0); g.fill(); });
  cell(CELL.bolt, () => { g.fillStyle = W(1); g.strokeStyle = W(1); g.lineJoin = 'round'; g.lineWidth = 4; g.beginPath(); g.moveTo(10, -56); g.lineTo(-26, 6); g.lineTo(-2, 6); g.lineTo(-12, 56); g.lineTo(28, -12); g.lineTo(4, -12); g.closePath(); g.fill(); g.stroke(); });
  cell(CELL.chevron, () => { g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(-36, 16); g.lineTo(0, -20); g.lineTo(36, 16); g.strokeStyle = 'rgb(20,50,100)'; g.lineWidth = 26; g.stroke(); g.strokeStyle = W(1); g.lineWidth = 13; g.stroke(); });
  return cv;
}

// glyph atlas for damage numbers: 8x8 cells of 64px
const GLYPHS = '0123456789+-!.%xABCDEFGHIJKLMNOPQRSTUVWXYZ?*:/ ';
function buildGlyphAtlas() {
  const S = 512, C = 64, cv = mkCanvas(S, S), g = cv.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.font = '900 46px Impact, "Arial Black", "Helvetica Neue", Arial, sans-serif';
  for (let i = 0; i < GLYPHS.length; i++) {
    const ch = GLYPHS[i], x = (i % 8) * C + C / 2, y = Math.floor(i / 8) * C + C / 2 + 2;
    g.lineWidth = 10; g.strokeStyle = 'rgba(30,14,34,0.96)'; g.strokeText(ch, x, y);
    const gr = g.createLinearGradient(0, y - 22, 0, y + 22); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#d8d0c4'); g.fillStyle = gr; g.fillText(ch, x, y);
  }
  return cv;
}
const GLYPH_W = (ch) => ('I1!.:/ '.includes(ch) ? 0.4 : 'MW'.includes(ch) ? 0.82 : 0.62);

// ---------------- shaders ----------------
const PART_VS = /* glsl */ `
attribute vec4 aA; attribute vec4 aB; attribute vec4 aC; attribute vec4 aD; uniform float uFloor;
varying vec2 vUv; varying vec4 vCol;
void main(){
  vec3 c = aA.xyz; float size = aA.w; vec2 q = position.xy; vec3 wp;
  if (aB.w > 0.0) {
    vec3 d = normalize(aB.xyz); vec3 toCam = normalize(cameraPosition - c); vec3 side = cross(d, toCam);
    side = length(side) < 1e-4 ? vec3(0.0,1.0,0.0) : normalize(side);
    wp = c + d * (q.x * aB.w) + side * (q.y * size);
  } else {
    float cs = cos(aD.y), sn = sin(aD.y);
    vec2 r = vec2(q.x*cs - q.y*sn, q.x*sn + q.y*cs) * size;
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    wp = c + right * r.x + up * r.y;
  }
  wp.y = max(wp.y, uFloor); // flatten against the ground instead of a hard depth clip line
  float ci = aD.x; vec2 cxy = vec2(mod(ci, 4.0), floor(ci / 4.0));
  vec2 uvq = uv; if (aD.z > 0.5) uvq.x = 1.0 - uvq.x; // mirror flag
  vUv = (vec2(cxy.x + 0.02 + uvq.x * 0.96, 3.0 - cxy.y + 0.02 + uvq.y * 0.96)) * 0.25;
  vCol = aC;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;
const PART_FS_ADD = /* glsl */ `
uniform sampler2D uMap; varying vec2 vUv; varying vec4 vCol;
void main(){ vec4 t = texture2D(uMap, vUv); float a = t.a * vCol.a; if (a < 0.003) discard; gl_FragColor = vec4(vCol.rgb * t.rgb * a, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const PART_FS_NORM = /* glsl */ `
uniform sampler2D uMap; varying vec2 vUv; varying vec4 vCol;
void main(){ vec4 t = texture2D(uMap, vUv); float a = t.a * vCol.a; if (a < 0.003) discard; gl_FragColor = vec4(vCol.rgb * t.rgb, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const RING_VS = /* glsl */ `
attribute vec4 iCol; attribute vec4 iP; uniform float uTime;
varying vec2 vP; varying vec4 vCol; varying float vAge; varying float vType; varying float vFade; varying float vT;
void main(){
  float type = iP.z; float age = (uTime - iP.x) / max(iP.y, 1e-4); float fade = 1.0; bool dead = false;
  if (type > 2.5 && type < 3.5) { float el = uTime - iP.x; if (el < 0.0 || uTime > iP.w + 0.4) dead = true; fade = smoothstep(0.0, 0.3, el) * (1.0 - smoothstep(0.0, 0.4, uTime - iP.w)); age = fract(age); }
  else if (type > 3.5 && type < 4.5) { if (age < 0.0 || age > 1.2 || uTime > iP.w) dead = true; }
  else if (age < 0.0 || age > 1.0) dead = true;
  vP = position.xz; vCol = iCol; vAge = age; vType = type; vFade = fade; vT = uTime;
  if (dead) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const RING_FS = /* glsl */ `
varying vec2 vP; varying vec4 vCol; varying float vAge; varying float vType; varying float vFade; varying float vT;
float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  float r = length(vP); if (r > 1.0) discard;
  float age = vAge; float a = 0.0; float hot = 0.0; float t = vType;
  if (t < 0.5) { float e = 1.0 - pow(1.0 - age, 3.0); float w = mix(0.16, 0.025, age);
    float band = smoothstep(e - w, e, r) * (1.0 - smoothstep(e, e + 0.025, r)); a = band * pow(1.0 - age, 1.3); hot = smoothstep(e - w * 0.3, e, r); }
  else if (t < 1.5) { float e = 1.0 - pow(1.0 - age, 4.0); float w = mix(0.45, 0.06, age);
    float tr = smoothstep(e - w * 2.0, e, r) * (1.0 - smoothstep(e, e + 0.02, r)) * 0.2;
    float ed = smoothstep(e - 0.05, e, r) * (1.0 - smoothstep(e, e + 0.025, r));
    a = (tr + ed * 1.2) * pow(1.0 - age, 1.1); hot = ed; }
  else if (t < 2.5) { a = pow(1.0 - r, 2.0) * pow(1.0 - age, 2.0); hot = 0.6 * (1.0 - age); }
  else if (t < 3.5) { float e = age; float w = 0.12; float wave = smoothstep(e - w, e, r) * (1.0 - smoothstep(e, e + 0.03, r)) * (1.0 - e);
    float base = smoothstep(0.78, 0.9, r) * (1.0 - smoothstep(0.9, 0.97, r)) * 0.5; float fillg = pow(1.0 - r, 1.5) * 0.10;
    a = (wave * 0.8 + base + fillg) * vFade; hot = wave; }
  else if (t < 4.5) { float prog = clamp(age, 0.0, 1.0); float ang = atan(vP.y, vP.x);
    float edge = smoothstep(0.9, 0.95, r) * (1.0 - smoothstep(0.97, 1.0, r)); float pulse = 0.6 + 0.4 * sin(vT * 14.0);
    float stripes = step(0.5, fract(ang * 1.5915 * 3.0 + r * 5.0 - vT * 1.5));
    float inner = r < prog ? 0.2 : 0.07; a = edge * (0.8 + 0.5 * pulse) + (1.0 - step(0.9, r)) * inner * (0.8 + 0.2 * stripes) + (r < prog && r > prog - 0.05 ? 0.5 : 0.0);
    hot = edge * pulse; if (age > 1.0) { a *= 1.0 - (age - 1.0) * 5.0; } }
  else { float e = 1.0 - (1.0 - pow(1.0 - age, 2.0)); float w = 0.1; float band = smoothstep(e - 0.02, e, r) * (1.0 - smoothstep(e, e + w, r)); a = band * pow(age, 0.5) * (1.0 - age * 0.3); hot = band; }
  if (a < 0.004) discard;
  vec3 col = vCol.rgb * (0.85 + hot * 0.4) + vec3(hot * 0.14);
  float k = 0.55; a = clamp(a * vCol.a, 0.0, 1.0);
  gl_FragColor = vec4(col * a, a * k);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const SLASH_VS = /* glsl */ `
attribute vec4 iCol; attribute vec4 iP; uniform float uTime;
varying vec2 vUv; varying vec4 vCol; varying vec3 vPar;
void main(){
  float age = (uTime - iP.x) / max(iP.y, 1e-4); float arc = iP.z;
  vUv = uv; vCol = iCol; vPar = vec3(age, arc > 0.0 ? 1.0 : -1.0, iP.w);
  if (age < 0.0 || age > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float th = (uv.x - 0.5) * abs(arc);
  float thick = 0.40 * pow(sin(3.14159 * clamp(uv.x, 0.0, 1.0)), 0.75) + 0.015;
  float rad = 1.0 + (uv.y - 0.5) * thick - 0.12 * (1.0 - uv.x) * 0.0;
  vec3 lp = vec3(sin(th) * rad, (uv.y - 0.5) * thick * 0.35 + 0.18 * sin(th * 1.5), cos(th) * rad); // arc in XZ with slight lift, +Z forward
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(lp, 1.0);
}`;
const SLASH_FS = /* glsl */ `
varying vec2 vUv; varying vec4 vCol; varying vec3 vPar;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1,0)), f.x), mix(h(i + vec2(0,1)), h(i + vec2(1,1)), f.x), f.y); }
void main(){
  float age = vPar.x; float u = vPar.y > 0.0 ? vUv.x : 1.0 - vUv.x; // sweep direction
  float head = (1.0 - pow(1.0 - clamp(age / 0.55, 0.0, 1.0), 3.0)) * 1.3;
  if (u > head) discard;
  float tail = clamp(1.0 - (head - u) / 0.75, 0.0, 1.0);
  float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
  float body = smoothstep(0.0, 0.5, across);
  float dis = (age - 0.35) * 1.7; float n = vn(vec2(vUv.x * 18.0, vUv.y * 5.0 + vPar.z * 13.0));
  if (n < dis) discard;
  float a = body * pow(tail, 1.4) * (1.0 - smoothstep(0.55, 1.0, age));
  float hot = smoothstep(0.6, 1.0, across) * tail;
  vec3 col = vCol.rgb * (0.8 + across) + vec3(1.0) * hot * 0.9;
  a = clamp(a * vCol.a, 0.0, 1.0); if (a < 0.01) discard;
  gl_FragColor = vec4(col * a, a * 0.6);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const RIB_VS = /* glsl */ `
attribute vec4 aCol; varying vec2 vUv; varying vec4 vCol;
void main(){ vUv = uv; vCol = aCol; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RIB_FS = /* glsl */ `
varying vec2 vUv; varying vec4 vCol;
void main(){ float edge = 1.0 - abs(vUv.y * 2.0 - 1.0); float core = pow(edge, 3.5); float a = vCol.a * smoothstep(0.0, 0.4, edge); if (a < 0.004) discard;
  vec3 col = vCol.rgb * (0.55 + edge * 0.9) + vec3(core * 1.0);
  gl_FragColor = vec4(col * a, a * 0.5);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const GLY_VS = /* glsl */ `
attribute vec4 gA; attribute vec4 gB; attribute vec4 gC; attribute vec4 gD; uniform float uTime; uniform float uEm;
varying vec2 vUv; varying vec4 vCol;
void main(){
  float age = (uTime - gA.w) / max(gB.z, 1e-4);
  vCol = vec4(gC.rgb, 1.0);
  if (age < 0.0 || age > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec4 mv = viewMatrix * vec4(gA.xyz, 1.0); float depth = max(-mv.z, 0.1);
  float em = depth / projectionMatrix[1][1] * uEm; // world size of 1 em at this depth, uEm = fraction of half viewport height
  float pop = age < 0.09 ? mix(0.25, 1.35, age / 0.09) : mix(1.35, 1.0, clamp((age - 0.09) / 0.14, 0.0, 1.0));
  float sc = gB.w * pop;
  float rise = 1.0 - pow(1.0 - age, 3.0);
  vec2 off = vec2(gB.x * sc + gD.x * rise, gD.y * rise);
  if (gC.w > 0.5) off.x += sin(age * 60.0) * 0.05 * (1.0 - age) * gB.w; // crit wobble
  mv.xy += (position.xy * sc + off) * em;
  gl_Position = projectionMatrix * mv;
  float ci = gB.y; vec2 cxy = vec2(mod(ci, 8.0), floor(ci / 8.0));
  vUv = vec2(cxy.x + 0.04 + uv.x * 0.92, 7.0 - cxy.y + 0.04 + uv.y * 0.92) * 0.125;
  vCol.a = 1.0 - smoothstep(0.62, 1.0, age);
}`;
const GLY_FS = /* glsl */ `
uniform sampler2D uMap; varying vec2 vUv; varying vec4 vCol;
void main(){ vec4 t = texture2D(uMap, vUv); float a = t.a * vCol.a; if (a < 0.01) discard; gl_FragColor = vec4(t.rgb * vCol.rgb * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------------- helpers ----------------
const _col = new THREE.Color();
const colCache = new Map();
function rgb(c) {
  if (c && c.r !== undefined) return c;
  const key = c;
  let v = colCache.get(key);
  if (!v) { _col.set(c); v = { r: _col.r, g: _col.g, b: _col.b }; colCache.set(key, v); }
  return v;
}
const mixc = (a, b, t) => ({ r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) });
const WHITE = { r: 1, g: 1, b: 1 };
const scaleC = (c, k) => ({ r: c.r * k, g: c.g * k, b: c.b * k });

function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------- particle layer (pooled sim + transient immediate writes) ----------------
// PERF: xorshift32 for per-frame turbulence (Math.random is a builtin call that boxes its result); presentation only, not seeded
let _xs = 2463534242;
const fastRand = () => { _xs ^= _xs << 13; _xs ^= _xs >>> 17; _xs ^= _xs << 5; return (_xs >>> 0) / 4294967296; };
const FLOOR = { value: 0.04 };
const WARM = { on: false }; // shader warm-up: every pooled mesh draws one dead instance so its program compiles before the first real effect
class Layer {
  constructor(max, additive, map, name) {
    this.max = max; this.n = 0; this.t = 0; this.alive = []; this.free = [];
    for (let i = 0; i < max; i++) this.free.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, s0: 1, s1: 1, c0: WHITE, c1: WHITE, a: 1, fp: 1, att: 0.05, rot: 0, rv: 0, cell: 0, drag: 0, grav: 0, st: 0, bounce: 0, turb: 0, swirl: 0, mirror: 0, g: 1, floor: 0 });
    const g = new THREE.InstancedBufferGeometry(); const base = new THREE.PlaneGeometry(1, 1);
    g.index = base.index; g.setAttribute('position', base.getAttribute('position')); g.setAttribute('uv', base.getAttribute('uv'));
    this.A = new Float32Array(max * 4); this.B = new Float32Array(max * 4); this.C = new Float32Array(max * 4); this.D = new Float32Array(max * 4);
    this.attrs = [['aA', this.A], ['aB', this.B], ['aC', this.C], ['aD', this.D]].map(([nm, arr]) => { const at = new THREE.InstancedBufferAttribute(arr, 4); at.setUsage(THREE.DynamicDrawUsage); g.setAttribute(nm, at); return at; });
    g.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({ uniforms: { uMap: { value: map }, uFloor: FLOOR }, vertexShader: PART_VS, fragmentShader: additive ? PART_FS_ADD : PART_FS_NORM, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.name = name; this.mesh.renderOrder = additive ? 4 : 2;
    this.geo = g;
  }
  add(o) {
    const p = this.free.pop(); if (!p) return null;
    p.x = o.x; p.y = o.y; p.z = o.z; p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
    p.age = -(o.delay || 0); p.life = o.life || 0.6; p.s0 = o.s0 ?? 0.3; p.s1 = o.s1 ?? p.s0; p.c0 = o.c0 || WHITE; p.c1 = o.c1 || p.c0; p.a = o.a ?? 1; p.fp = o.fp ?? 1.2; p.att = o.att ?? 0.06;
    p.rot = o.rot || 0; p.rv = o.rv || 0; p.cell = o.cell || 0; p.drag = o.drag || 0; p.grav = o.grav || 0; p.st = o.st || 0; p.bounce = o.bounce || 0; p.turb = o.turb || 0; p.swirl = o.swirl || 0; p.mirror = o.mirror || 0; p.g = o.g ?? 1; p.floor = o.floor ?? 0;
    this.alive.push(p); return p;
  }
  step(dt) {
    const al = this.alive; let n = 0;
    for (let i = al.length - 1; i >= 0; i--) {
      const p = al[i]; p.age += dt;
      if (p.age >= p.life) { al[i] = al[al.length - 1]; al.pop(); this.free.push(p); continue; }
      if (p.age < 0) continue;
      if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k; }
      p.vy -= p.grav * dt;
      if (p.turb) { p.vx += (fastRand() - 0.5) * p.turb * dt; p.vz += (fastRand() - 0.5) * p.turb * dt; p.vy += (fastRand() - 0.3) * p.turb * 0.5 * dt; }
      if (p.swirl) { const vx = p.vx, vz = p.vz; const c = Math.cos(p.swirl * dt), s = Math.sin(p.swirl * dt); p.vx = vx * c - vz * s; p.vz = vx * s + vz * c; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.bounce && p.y < p.floor) { p.y = p.floor; p.vy = Math.abs(p.vy) * p.bounce; p.vx *= 0.7; p.vz *= 0.7; }
      p.rot += p.rv * dt;
    }
    this.n = 0;
    for (let i = 0; i < al.length; i++) { const p = al[i]; if (p.age < 0) continue; this.write(p); }
  }
  write(p) {
    if (this.n >= this.max) return; const t = p.age / p.life, i = this.n++ * 4;
    const e = 1 - (1 - t) * (1 - t); const size = p.s0 + (p.s1 - p.s0) * e;   // PERF: lerp written out (a call with computed double arguments boxes them)
    const fi0 = t / p.att, fadeIn = fi0 < 1 ? fi0 : 1, al = p.a * fadeIn * (p.fp === 1 ? 1 - t : Math.pow(1 - t, p.fp));   // PERF: ternaries / sqrt instead of Math.min / hypot builtin calls (boxed results)
    const A = this.A, B = this.B, C = this.C, D = this.D;
    A[i] = p.x; A[i + 1] = p.y; A[i + 2] = p.z; A[i + 3] = size;
    if (p.st > 0) { const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz) || 1, ln = size * 1.2, ln2 = sp * p.st; B[i] = p.vx / sp; B[i + 1] = p.vy / sp; B[i + 2] = p.vz / sp; B[i + 3] = ln > ln2 ? ln : ln2; } else { B[i] = 0; B[i + 1] = 1; B[i + 2] = 0; B[i + 3] = 0; }
    const c0 = p.c0, c1 = p.c1, g = p.g; C[i] = (c0.r + (c1.r - c0.r) * t) * g; C[i + 1] = (c0.g + (c1.g - c0.g) * t) * g; C[i + 2] = (c0.b + (c1.b - c0.b) * t) * g; C[i + 3] = al;
    D[i] = p.cell; D[i + 1] = p.rot; D[i + 2] = p.mirror; D[i + 3] = 0;
  }
  // immediate (one frame) instance for emitters: position, size, color, alpha, cell, rot
  put(x, y, z, size, c, a, cell, rot = 0, g = 1) {
    if (this.n >= this.max) return; const i = this.n++ * 4, A = this.A, B = this.B, C = this.C, D = this.D;
    A[i] = x; A[i + 1] = y; A[i + 2] = z; A[i + 3] = size; B[i] = 0; B[i + 1] = 1; B[i + 2] = 0; B[i + 3] = 0;
    C[i] = c.r * g; C[i + 1] = c.g * g; C[i + 2] = c.b * g; C[i + 3] = a; D[i] = cell; D[i + 1] = rot; D[i + 2] = 0; D[i + 3] = 0;
  }
  // immediate stretched instance (blood streaks, gore): centred on x,y,z, aligned with (dx,dy,dz), `len` long and `size` wide
  putS(x, y, z, size, c, a, cell, dx, dy, dz, len, g = 1) {
    if (this.n >= this.max) return; const i = this.n++ * 4, A = this.A, B = this.B, C = this.C, D = this.D;
    A[i] = x; A[i + 1] = y; A[i + 2] = z; A[i + 3] = size; B[i] = dx; B[i + 1] = dy; B[i + 2] = dz; B[i + 3] = len > 1e-3 ? len : 1e-3;
    C[i] = c.r * g; C[i + 1] = c.g * g; C[i + 2] = c.b * g; C[i + 3] = a; D[i] = cell; D[i + 1] = 0; D[i + 2] = 0; D[i + 3] = 0;
  }
  flush() {
    const n = WARM.on ? (this.n > 1 ? this.n : 1) : this.n; this.geo.instanceCount = n; const at = this.attrs;
    for (let i = 0; i < at.length; i++) {   // PERF: the update range is rewritten in place (addUpdateRange pushes a new object every call)
      const a = at[i], r = a.updateRanges;
      if (n && r.length === 1) r[0].count = n * 4; else { a.clearUpdateRanges(); if (n) a.addUpdateRange(0, n * 4); }
      a.needsUpdate = true;
    }
    this.mesh.visible = n > 0;
  }
}

// ---------------- ribbons ----------------
class Ribbons {
  constructor(max, pts) {
    this.max = max; this.pts = pts; this.slots = [];
    const nv = max * pts * 2;
    this.pos = new Float32Array(nv * 3); this.uv = new Float32Array(nv * 2); this.col = new Float32Array(nv * 4);
    const idx = new Uint32Array(max * (pts - 1) * 6);
    let k = 0; for (let s = 0; s < max; s++) for (let i = 0; i < pts - 1; i++) { const a = (s * pts + i) * 2; idx[k++] = a; idx[k++] = a + 1; idx[k++] = a + 2; idx[k++] = a + 1; idx[k++] = a + 3; idx[k++] = a + 2; }
    const g = new THREE.BufferGeometry(); g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage); this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2)); g.setAttribute('aCol', this.aCol);
    this.mat = new THREE.ShaderMaterial({ vertexShader: RIB_VS, fragmentShader: RIB_FS, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; this.mesh.name = 'ribbons'; this.mesh.visible = false;
    for (let s = 0; s < max; s++) { this.slots.push({ on: false, dirty: false, n: 0, P: new Float32Array(pts * 3), Q: new Float32Array(pts * 3), T: new Float32Array(pts) }); }
    // uv.x along, uv.y across
    for (let s = 0; s < max; s++) for (let i = 0; i < pts; i++) { const v = (s * pts + i) * 2; this.uv[v * 2] = i / (pts - 1); this.uv[v * 2 + 1] = 0; this.uv[v * 2 + 2] = i / (pts - 1); this.uv[v * 2 + 3] = 1; }
    this.cursor = 0;
  }
  alloc() { for (let k = 0; k < this.max; k++) { const i = (this.cursor + k) % this.max; if (!this.slots[i].on) { this.cursor = (i + 1) % this.max; return this.slots[i]; } } return null; }
  clearSlot(s, idx) { const base = idx * this.pts * 2; this.pos.fill(0, base * 3, (base + this.pts * 2) * 3); this.col.fill(0, base * 4, (base + this.pts * 2) * 4); }
}

export function createFx(scene, opts = {}) {
  const rnd = mulberry(opts.seed || 1337);
  const R = opts.arenaRadius ?? 14, groundY = opts.groundY ?? 0, sand = rgb(opts.sand || '#d9b27c');
  const maxQ = opts.quality ?? 1; // 0.4..1 scales counts
  const uTime = { value: 0 }; FLOOR.value = (opts.groundY ?? 0) + 0.04;
  const fx = { time: 0, quality: maxQ, groups: [], _tmp: new THREE.Vector3(), cam: null, hooks: [] };
  const root = new THREE.Group(); root.name = 'fx'; scene.add(root);

  const atlasTex = new THREE.CanvasTexture(buildAtlas(rnd)); atlasTex.generateMipmaps = false; atlasTex.minFilter = THREE.LinearFilter; atlasTex.magFilter = THREE.LinearFilter;
  const glyphTex = new THREE.CanvasTexture(buildGlyphAtlas()); glyphTex.generateMipmaps = false; glyphTex.minFilter = THREE.LinearFilter;

  // 1) ground decals
  const DS = opts.decalSize ?? 1024, dcv = mkCanvas(DS, DS), dctx = dcv.getContext('2d'); const decalTex = new THREE.CanvasTexture(dcv); decalTex.colorSpace = THREE.SRGBColorSpace; decalTex.anisotropy = 1; decalTex.generateMipmaps = false; decalTex.minFilter = THREE.LinearFilter; decalTex.magFilter = THREE.LinearFilter; // no mipmaps (black-block flicker on re-upload)
  const decalExt = R + 2;
  const decalMesh = new THREE.Mesh(new THREE.PlaneGeometry(decalExt * 2, decalExt * 2).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: decalTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  decalMesh.position.y = groundY + 0.012; decalMesh.renderOrder = 1; decalMesh.name = 'decals'; decalMesh.receiveShadow = true; root.add(decalMesh);
  let decalDirty = false, lastDecalUp = -1; const decalGap = opts.decalGap ?? 0.1;
  // Tiled decal upload: a full 2048 px canvas is 16 MB per upload (a visible hitch on phones), so blood and scuffs mark the tiles they touch and
  // update() pushes at most DEC_BUDGET dirty tiles per step with texSubImage2D (round robin). Without a renderer (tests) it falls back to needsUpdate.
  const DEC_T = opts.decalTiles ?? (DS >= 2048 ? 4 : 2), DEC_TS = DS / DEC_T, DEC_BUDGET = opts.decalBudget ?? 2, decTileDirty = new Uint8Array(DEC_T * DEC_T), decPainted = new Uint8Array(DEC_T * DEC_T); let decTileCur = 0, decPending = false; const decFull = !opts.renderer;
  const decTileCv = mkCanvas(DEC_TS, DEC_TS), decTileCtx = decTileCv.getContext('2d');
  const decStats = { tiles: 0, full: 0, ms: 0, last: 0 };
  function markTiles(x, z, r) { // world metres -> dirty tiles
    const k = DS / (decalExt * 2), px = (x / (decalExt * 2) + 0.5) * DS, pz = (z / (decalExt * 2) + 0.5) * DS, rp = r * k + 3;
    const x0 = clamp(Math.floor((px - rp) / DEC_TS), 0, DEC_T - 1), x1 = clamp(Math.floor((px + rp) / DEC_TS), 0, DEC_T - 1), z0 = clamp(Math.floor((pz - rp) / DEC_TS), 0, DEC_T - 1), z1 = clamp(Math.floor((pz + rp) / DEC_TS), 0, DEC_T - 1);
    for (let a = z0; a <= z1; a++) for (let b = x0; b <= x1; b++) decTileDirty[a * DEC_T + b] = decPainted[a * DEC_T + b] = 1;
  }
  function uploadDecals() {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0, rd = opts.renderer; let props = null;
    if (rd) { try { props = rd.properties.get(decalTex); } catch (e) { props = null; } }
    if (decFull || decPending || !props || !props.__webglTexture || props.__version !== decalTex.version) { decalTex.needsUpdate = true; decTileDirty.fill(0); decPending = false; decalDirty = false; decStats.full++; return; }
    const gl = rd.getContext(); let n = 0, left = 0;
    for (let k = 0; k < decTileDirty.length; k++) {
      const i = (decTileCur + k) % decTileDirty.length; if (!decTileDirty[i]) continue;
      if (n >= DEC_BUDGET) { left++; continue; }
      const tx = i % DEC_T, ty = (i / DEC_T) | 0; decTileCtx.clearRect(0, 0, DEC_TS, DEC_TS); decTileCtx.drawImage(dcv, tx * DEC_TS, ty * DEC_TS, DEC_TS, DEC_TS, 0, 0, DEC_TS, DEC_TS);
      rd.state.bindTexture(gl.TEXTURE_2D, props.__webglTexture); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, tx * DEC_TS, DS - (ty + 1) * DEC_TS, gl.RGBA, gl.UNSIGNED_BYTE, decTileCv); rd.state.unbindTexture();
      decTileDirty[i] = 0; n++; decTileCur = (i + 1) % decTileDirty.length; decStats.tiles++;
    }
    decalDirty = left > 0; if (typeof performance !== 'undefined') { decStats.last = performance.now() - t0; decStats.ms += decStats.last; }
  }

  // 2) particles
  const addL = new Layer(opts.maxAdd ?? 2600, true, atlasTex, 'particles_add'); const norL = new Layer(opts.maxNorm ?? 900, false, atlasTex, 'particles_norm');
  root.add(norL.mesh, addL.mesh);

  // 3) debris
  const MAXD = 96; const debGeo = new THREE.IcosahedronGeometry(0.5, 0).scale(1, 0.75, 0.9);
  const debMesh = new THREE.InstancedMesh(debGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), MAXD); debMesh.frustumCulled = false; debMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); debMesh.name = 'debris';
  debMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXD * 3), 3); debMesh.count = 0; root.add(debMesh);
  const debris = []; for (let i = 0; i < MAXD; i++) debris.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, s: 0.2, q: new THREE.Quaternion(), ax: 0, ay: 1, az: 0, w: 0, rest: false });
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _ax = new THREE.Vector3();

  // 4) rings + 5) slashes (GPU timed)
  function timedMesh(max, vs, fs, geo, name, order, extraAttrs) {
    const m = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({ uniforms: { uTime }, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor }), max);
    m.frustumCulled = false; m.name = name; m.renderOrder = order; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const col = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4), par = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); col.setUsage(THREE.DynamicDrawUsage); par.setUsage(THREE.DynamicDrawUsage);
    m.geometry.setAttribute('iCol', col); m.geometry.setAttribute('iP', par); par.array.fill(-1e6, 0); for (let i = 0; i < max; i++) { par.array[i * 4 + 1] = 1; } // dead by default (t0 far in the past => age>1)
    for (let i = 0; i < max; i++) { par.array[i * 4] = -1e6; }
    m.userData = { col, par, cur: 0, max }; m.visible = false; root.add(m); return m;
  }
  const MAXR = 64, MAXS = 40;
  const ringMesh = timedMesh(MAXR, RING_VS, RING_FS, new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), 'rings', 3);
  const slashGeo = new THREE.PlaneGeometry(1, 1, 28, 1); // uv.x along arc, uv.y across
  const slashMesh = timedMesh(MAXS, SLASH_VS, SLASH_FS, slashGeo, 'slashes', 5);
  const rings = []; // anchored ring handles
  function allocTimed(mesh) { const u = mesh.userData; const i = u.cur; u.cur = (u.cur + 1) % u.max; return i; }
  function setTimed(mesh, i, mat, col, a, t0, dur, type, aux) {
    const u = mesh.userData; mesh.setMatrixAt(i, mat); mesh.instanceMatrix.needsUpdate = true;
    u.col.setXYZW(i, col.r, col.g, col.b, a); u.col.needsUpdate = true; u.par.setXYZW(i, t0, dur, type, aux); u.par.needsUpdate = true; mesh.visible = true;
  }
  // Draw calls: rings, slashes, ribbons and numbers only draw while something in them is alive (the scan mirrors the dead tests of the shaders).
  const ringAlive = (T) => { const a = ringMesh.userData.par.array; for (let i = 0; i < MAXR; i++) { const t0 = a[i * 4], du = Math.max(a[i * 4 + 1], 1e-4), ty = a[i * 4 + 2], w = a[i * 4 + 3], age = (T - t0) / du; if (ty > 2.5 && ty < 3.5) { if (T >= t0 && T <= w + 0.4) return true; } else if (ty > 3.5 && ty < 4.5) { if (age >= 0 && age <= 1.2 && T <= w) return true; } else if (age >= 0 && age <= 1) return true; } return false; };
  const slashAlive = (T) => { const a = slashMesh.userData.par.array; for (let i = 0; i < MAXS; i++) { const age = (T - a[i * 4]) / Math.max(a[i * 4 + 1], 1e-4); if (age >= 0 && age <= 1) return true; } return false; };

  // 6) ribbons
  const rib = new Ribbons(opts.maxRibbons ?? 36, 20); root.add(rib.mesh);

  // 7) glyph numbers
  const MAXG = 480; const gGeo = new THREE.InstancedBufferGeometry(); { const b = new THREE.PlaneGeometry(1, 1); gGeo.index = b.index; gGeo.setAttribute('position', b.getAttribute('position')); gGeo.setAttribute('uv', b.getAttribute('uv')); }
  const gAttr = ['gA', 'gB', 'gC', 'gD'].map((n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(MAXG * 4), 4); a.setUsage(THREE.DynamicDrawUsage); gGeo.setAttribute(n, a); return a; });
  for (let i = 0; i < MAXG; i++) { gAttr[0].array[i * 4 + 3] = -1e6; gAttr[1].array[i * 4 + 2] = 1; }
  gGeo.instanceCount = MAXG;
  const glyphUni = { uTime, uMap: { value: glyphTex }, uEm: { value: opts.numberEm ?? 0.05 } };
  const glyphMesh = new THREE.Mesh(gGeo, new THREE.ShaderMaterial({ uniforms: glyphUni, vertexShader: GLY_VS, fragmentShader: GLY_FS, transparent: true, depthTest: false, depthWrite: false }));
  glyphMesh.frustumCulled = false; glyphMesh.renderOrder = 100; glyphMesh.name = 'numbers'; glyphMesh.visible = false; root.add(glyphMesh); let gCur = 0, gEnd = -1;

  // ------------- position helpers -------------
  const P = (t, out, dy = 0) => {
    if (t && t.isObject3D) { t.getWorldPosition(out); out.y += dy; return out; }
    if (typeof t === 'function') { t(out); out.y += dy; return out; }
    out.set(t.x, t.y + dy, t.z); return out;
  };
  const _p = new THREE.Vector3(), _p2 = new THREE.Vector3();
  const N = (n) => Math.max(1, Math.round(n * fx.quality));
  const R_ = (a, b) => a + (b - a) * rnd();
  const dirOf = (d) => { const l = Math.hypot(d.x, d.y, d.z) || 1; return { x: d.x / l, y: d.y / l, z: d.z / l }; };

  // ====================================================================
  // CORE EFFECTS
  // ====================================================================
  // Sparks: stretched additive streaks that cool from white-hot to `color`, bounce once on sand.
  fx.spark = (pos, dir, n = 8, color = '#ffd27a', o = {}) => {
    const c = rgb(color), hot = mixc(c, WHITE, 0.75), d = dir ? dirOf(dir) : { x: 0, y: 1, z: 0 }; const spd = o.speed ?? 7;
    n = N(n);
    for (let i = 0; i < n; i++) {
      const cone = o.cone ?? 0.9, s = spd * (0.45 + rnd() * 0.9);
      addL.add({ x: pos.x, y: pos.y, z: pos.z, vx: (d.x + (rnd() - 0.5) * cone * 2) * s, vy: (d.y * 0.6 + rnd() * 0.9 + 0.2) * s * 0.7, vz: (d.z + (rnd() - 0.5) * cone * 2) * s,
        life: R_(0.25, 0.55) * (o.life ?? 1), s0: o.size ?? 0.18, s1: 0.06, st: 0.07, cell: CELL.streak, c0: hot, c1: scaleC(c, 0.6), g: 2.4, drag: 1.4, grav: 16, bounce: 0.35, floor: groundY + 0.03, fp: 0.9, att: 0.02 });
    }
    // a few lingering embers
    for (let i = 0; i < Math.ceil(n / 5); i++) addL.add({ x: pos.x, y: pos.y, z: pos.z, vx: (rnd() - 0.5) * 2, vy: R_(0.5, 2), vz: (rnd() - 0.5) * 2, life: R_(0.4, 0.8), s0: 0.09, s1: 0.02, cell: CELL.ember, c0: hot, c1: c, g: 2, drag: 1.5, grav: 2, fp: 1 });
  };

  // Dust: sand-colored soft puffs kicked outward, normal blending (reads on bright sand).
  fx.dust = (pos, n = 8, o = {}) => {
    const k = o.size ?? 1, up = o.up ?? 1, base = o.color ? rgb(o.color) : sand, lite = mixc(base, WHITE, 0.6), dark = mixc(base, { r: 0.3, g: 0.2, b: 0.12 }, 0.2);
    const dir = o.dir ? dirOf(o.dir) : null; n = N(n);
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, s = R_(0.6, 2.4) * (o.speed ?? 1);
      let vx = Math.cos(a) * s, vz = Math.sin(a) * s; if (dir) { vx = vx * 0.5 + dir.x * s; vz = vz * 0.5 + dir.z * s; }
      norL.add({ x: pos.x + vx * 0.05, y: Math.max(pos.y, groundY) + 0.06, z: pos.z + vz * 0.05, vx, vy: R_(0.3, 1.1) * up, vz, life: R_(0.55, 1.1), s0: R_(0.3, 0.5) * k, s1: R_(1.2, 2.0) * k, cell: rnd() < 0.5 ? CELL.puffA : CELL.puffB, rot: rnd() * TAU, rv: (rnd() - 0.5) * 1.2,
        c0: lite, c1: dark, a: o.alpha ?? 0.75, drag: 2.4, grav: -0.15, fp: 1.4, att: 0.08, turb: 1.2 });
    }
  };
  // Directional dust trail for dashes / skids.
  fx.kickup = (pos, dir, n = 6, o = {}) => fx.dust(pos, n, { dir: { x: -dir.x, y: 0, z: -dir.z }, size: 0.7, speed: 0.7, ...o });

  // Crisp hit flash: tiny hot core (6 frames), thin expanding ring, a few fine rays. Never a big blob: the visible
  // footprint stays under ~0.6 world units for light hits and grows slowly with `size` (ults pass 2..4).
  fx.impactFlash = (pos, color = '#ffe9b0', size = 1) => {
    const c = rgb(color), hot = mixc(c, WHITE, 0.8), k = Math.min(size, 4), big = k > 2.2;
    addL.add({ x: pos.x, y: pos.y, z: pos.z, life: 0.07, s0: k * 0.34, s1: k * 0.5, cell: CELL.glow, c0: hot, c1: c, g: 2.4, a: big ? 0.9 : 0.8, fp: 1.6, att: 0.01 });
    addL.add({ x: pos.x, y: pos.y, z: pos.z, life: 0.05, s0: k * 0.16, s1: k * 0.1, cell: CELL.disc, c0: WHITE, c1: hot, g: 3.0, fp: 1.6, att: 0.01 });
    addL.add({ x: pos.x, y: pos.y, z: pos.z, life: 0.11, s0: k * 0.45, s1: k * (big ? 2.0 : 1.05), cell: CELL.burst, c0: hot, c1: c, g: 1.8, a: 0.75, rot: rnd() * TAU, fp: 1.2, att: 0.01 });
    addL.add({ x: pos.x, y: pos.y, z: pos.z, life: 0.17, s0: k * 0.25, s1: k * (big ? 1.7 : 1.0), cell: CELL.ring, c0: hot, c1: c, g: 1.1, a: 0.55, fp: 1.1, att: 0.01 });
    if (big) addL.add({ x: pos.x, y: pos.y, z: pos.z, life: 0.16, s0: k * 0.8, s1: k * 1.5, cell: CELL.star4, c0: hot, c1: c, g: 1.8, a: 0.6, rot: rnd() * TAU, rv: R_(-2, 2), fp: 1.3, att: 0.01 });
  };

  fx.ring = (pos, color = '#f5ead2', size = 1.5, o = {}) => {
    _v.set(pos.x, groundY + 0.03 + (o.y ?? 0), pos.z); _m.compose(_v, _q.identity(), _s.set(size, 1, size));
    setTimed(ringMesh, allocTimed(ringMesh), _m, rgb(color), o.alpha ?? 1, uTime.value, o.dur ?? 0.5, 0, 0);
  };
  fx.shockwave = (pos, r = 3, color = '#ffd9a0', o = {}) => {
    _v.set(pos.x, groundY + 0.03, pos.z); _m.compose(_v, _q.identity(), _s.set(r, 1, r));
    setTimed(ringMesh, allocTimed(ringMesh), _m, rgb(color), o.alpha ?? 1, uTime.value, o.dur ?? 0.65, 1, 0);
    if (o.dust !== false) { const n = N(Math.round(8 + r * 3)); for (let i = 0; i < n; i++) { const a = i / n * TAU + rnd() * 0.3, s = r * R_(1.0, 1.7);
      norL.add({ x: pos.x + Math.cos(a) * r * 0.15, y: groundY + 0.1, z: pos.z + Math.sin(a) * r * 0.15, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: R_(0.2, 0.7), life: R_(0.7, 1.2), s0: 0.45, s1: R_(1.6, 2.6), cell: rnd() < 0.5 ? CELL.puffA : CELL.puffB, rot: rnd() * TAU, c0: mixc(sand, WHITE, 0.6), c1: mixc(sand, { r: 0.3, g: 0.2, b: 0.12 }, 0.2), a: 0.8, drag: 3.2, fp: 1.3, att: 0.05 }); } }
    shocks.push({ x: pos.x, y: groundY, z: pos.z, t0: uTime.value, dur: o.dur ?? 0.65, r, str: o.distort ?? 1 });
  };
  const shocks = [];
  // Active shockwaves projected for the post pass (up to 4). out: array of Vector4(uv.x, uv.y, radiusUV, strength)
  fx.getShockwaves = (camera, out, aspect = 1) => {
    let k = 0; for (const s of shocks) { if (k >= 4) break; const age = (uTime.value - s.t0) / s.dur; if (age < 0 || age > 1) continue;
      _v.set(s.x, s.y, s.z).project(camera); const e = 1 - Math.pow(1 - age, 4);
      _p.set(s.x + s.r * e, s.y, s.z).project(camera); const ru = Math.hypot((_p.x - _v.x) * 0.5 * aspect, (_p.y - _v.y) * 0.5);
      out[k++].set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5, Math.max(ru, 0.01), (1 - age) * s.str); }
    for (; k < 4; k++) out[k].set(0, 0, 0, 0);
  };

  // Telegraph: pulsing hazard disc that fills until `dur` (meteor / fire jets). returns {cancel()}
  fx.tele = (pos, r, dur, color = '#e8742a') => {
    const i = allocTimed(ringMesh); _v.set(pos.x, groundY + 0.025, pos.z); _m.compose(_v, _q.identity(), _s.set(r, 1, r));
    const endT = uTime.value + dur + 0.12; setTimed(ringMesh, i, _m, rgb(color), 1, uTime.value, dur, 4, endT);
    return { cancel() { ringMesh.userData.par.setW(i, uTime.value); ringMesh.userData.par.needsUpdate = true; } };
  };

  // Sword slash crescent. pos = chest height of attacker, dir = swing forward (xz used). o.tilt rolls the arc plane.
  fx.slash = (pos, dir, color = '#ffffff', size = 1.5, o = {}) => {
    const yaw = Math.atan2(dir.x, dir.z), tilt = o.tilt ?? (rnd() - 0.5) * 1.0, arc = (o.arc ?? 2.3) * (o.flip ? -1 : 1);
    _q.setFromEuler(new THREE.Euler(tilt * 0.6, yaw, tilt, 'YXZ')); _v.set(pos.x, pos.y, pos.z); _m.compose(_v, _q, _s.set(size, size, size));
    setTimed(slashMesh, allocTimed(slashMesh), _m, rgb(color), o.alpha ?? 1, uTime.value, o.dur ?? 0.28, arc, rnd());
  };

  // Debris chunks (sand clods / stone shards / bronze bits). o.kind: 'sand' | 'stone' | 'metal' | 'fire'
  const DCOL = { sand: ['#c9a06a', '#b08850', '#d9b27c'], stone: ['#9b8f7c', '#7f7466', '#b5a98f'], metal: ['#b8803a', '#5c6068', '#d8c080'], fire: ['#3a2a22', '#e8742a', '#5a3a2a'] };
  let dCur = 0;
  fx.debris = (pos, n = 4, o = {}) => {
    const pal = DCOL[o.kind || 'sand']; n = N(n);
    for (let i = 0; i < n; i++) {
      const d = debris[dCur]; dCur = (dCur + 1) % MAXD; const a = rnd() * TAU, s = R_(1.5, 4.5) * (o.speed ?? 1);
      d.on = true; d.age = 0; d.life = R_(1.1, 1.8); d.x = pos.x; d.y = Math.max(pos.y, groundY + 0.1); d.z = pos.z; d.vx = Math.cos(a) * s; d.vz = Math.sin(a) * s; d.vy = R_(3, 7) * (o.up ?? 1); d.s = R_(0.12, 0.26) * (o.size ?? 1); d.rest = false;
      _ax.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(); d.ax = _ax.x; d.ay = _ax.y; d.az = _ax.z; d.w = R_(6, 16); d.q.setFromAxisAngle(_ax, rnd() * TAU);
      _c.set(pal[(rnd() * pal.length) | 0]); debMesh.setColorAt(dIndex(d), _c);
    }
    debMesh.instanceColor.needsUpdate = true;
  };
  const dIndex = (d) => debris.indexOf(d);

  // Beam / chain / lightning (ribbon). a,b: Vector3 or Object3D or fn.
  function ribbonSlot() { const s = rib.alloc(); if (!s) return null; s.on = true; s.dirty = true; rib.mesh.visible = true; return s; }
  const setCol = (s, c, g = 1) => { s.c = rgb(c); s.g = g; };
  fx.beam = (a, b, color = '#ffffff', o = {}) => {
    const s = ribbonSlot(); if (!s) return null; s.kind = 'beam'; s.P0 = null; setCol(s, color, o.glow ?? 2); s.a = a; s.b = b; s.life = o.life ?? 0.25; s.age = 0; s.width = o.width ?? 0.12; s.n = o.pts ?? 14; s.jag = o.jag ?? 0; s.flick = o.flicker ?? 0; s.sag = o.sag ?? 0; s.rej = 0; s.fade = o.fade ?? 1; return s;
  };
  fx.zap = (a, b, color = '#a8d8ff', o = {}) => {
    const s = fx.beam(a, b, color, { life: 0.24, width: 0.2, jag: 0.22, flicker: 0.04, pts: 16, glow: 1.5, ...o });
    if (s && o.branch !== false) { P(a, _p); P(b, _p2); for (let k = 0; k < (o.branches ?? 1); k++) { const t = R_(0.3, 0.7); const mid = new THREE.Vector3().lerpVectors(_p, _p2, t); const end = mid.clone().add(new THREE.Vector3(R_(-1, 1), R_(-0.5, 0.6), R_(-1, 1)).multiplyScalar(_p.distanceTo(_p2) * 0.35)); fx.beam(mid, end, color, { life: 0.16, width: 0.07, jag: 0.14, flicker: 0.04, pts: 8, glow: 2 }); } }
    if (o.sparks !== false) { P(b, _p2); fx.spark(_p2, null, 6, color, { speed: 5 }); }
    return s;
  };
  fx.chain = (a, b, color = '#d9e4ee', o = {}) => { const s = fx.beam(a, b, color, { life: o.life ?? 0.45, width: 0.12, glow: 1.4, sag: 0.35, pts: 14, ...o }); P(b, _p2); fx.spark(_p2, null, 8, '#ffffff', { speed: 5 }); return s; };

  // Trail ribbon following an object / fn. o.base: second point source -> ribbon spans tip..base (sword swoosh).
  fx.trail = (target, color = '#ffffff', o = {}) => {
    const s = ribbonSlot(); if (!s) return null; s.kind = 'trail'; setCol(s, color, o.glow ?? 1.8); s.a = target; s.base = o.base || null; s.life = o.life ?? 0.25; s.width = o.width ?? 0.16; s.n = 0; s.minD = o.minDist ?? 0.04; s.stopped = false; s.t = 0; s.alpha = o.alpha ?? 1;
    s.stop = () => { s.stopped = true; }; return s;
  };
  fx.swordTrail = (tip, base, color = '#ffffff', o = {}) => fx.trail(tip, color, { base, life: 0.2, width: 0.0, ...o });

  // Projectile glow (+ sparks + trail). Returns handle {stop(hitPosOpt)}.
  fx.projectile = (target, color = '#ffb347', o = {}) => {
    const h = { kind: 'proj', a: target, c: rgb(color), size: o.size ?? 0.55, on: true, acc: 0, trail: o.trail === false ? null : fx.trail(target, color, { life: 0.35, width: (o.size ?? 0.55) * 0.5 }) };
    h.stop = (hit) => { if (!h.on) return; h.on = false; if (h.trail) h.trail.stop(); if (hit !== false) { P(target, _p); fx.impactFlash(_p, color, (o.size ?? 0.55) * 1.3); fx.spark(_p, null, 10, color); } };
    emitters.push(h); return h;
  };
  // Fire a self-flying projectile from a to b (speed m/s, optional arc height), calls onHit(pos).
  fx.shoot = (from, to, color = '#ffb347', o = {}) => {
    const o3 = new THREE.Object3D(); P(from, o3.position); const dst = new THREE.Vector3(); P(to, dst); const src = o3.position.clone(); const d = src.distanceTo(dst), spd = o.speed ?? 22, T = d / spd;
    const h = fx.projectile(o3, color, o); let t = 0;
    emitters.push({ kind: 'fn', on: true, step(dt) { t += dt; const k = Math.min(1, t / T); o3.position.lerpVectors(src, dst, k); o3.position.y += (o.arc ?? 0) * Math.sin(Math.PI * k); o3.updateMatrixWorld(); if (k >= 1) { h.stop(); this.on = false; if (o.onHit) o.onHit(dst); } } });
    return h;
  };

  // Persistent auras / status emitters
  const emitters = [];
  fx.aura = (target, color = '#f2c14e', dur = 4, o = {}) => {
    const h = { kind: 'aura', a: target, c: rgb(color), t: 0, dur: dur ?? 1e9, on: true, acc: 0, o, style: o.kind || 'buff', radius: o.radius ?? 1.1, height: o.height ?? 1.0 };
    P(target, _p); const i = allocTimed(ringMesh); _v.copy(_p); _v.y = groundY + 0.035; _m.compose(_v, _q.identity(), _s.set(h.radius * 1.6, 1, h.radius * 1.6)); setTimed(ringMesh, i, _m, h.c, o.alpha ?? 0.9, uTime.value, o.period ?? 1.1, 3, uTime.value + h.dur); h.ri = i;
    rings.push(h); h.stop = () => { h.on = false; ringMesh.userData.par.setW(i, uTime.value); ringMesh.userData.par.needsUpdate = true; };
    fx.impactFlash({ x: _p.x, y: _p.y + h.height, z: _p.z }, color, 0.8);
    emitters.push(h); return h;
  };
  fx.heal = (target, n = 10, o = {}) => {
    P(target, _p); const c = rgb(o.color || '#7dffb4'), hot = mixc(c, WHITE, 0.5); n = N(n);
    for (let i = 0; i < n; i++) { const a = rnd() * TAU, rr = R_(0.3, 0.7); const isPlus = i % 3 === 0;
      (isPlus ? norL : addL).add({ x: _p.x + Math.cos(a) * rr, y: _p.y + R_(0.1, 0.8), z: _p.z + Math.sin(a) * rr, vy: R_(0.8, 1.8), vx: -Math.sin(a) * 0.5, vz: Math.cos(a) * 0.5, delay: i * 0.04, life: R_(0.8, 1.2), s0: isPlus ? 0.5 : 0.3, s1: isPlus ? 0.36 : 0.1, cell: isPlus ? CELL.plus : CELL.glow, c0: isPlus ? c : c, c1: c, g: isPlus ? 1.0 : 2.4, fp: 0.7, att: 0.15, swirl: 2.5, a: 1 }); }
    addL.add({ x: _p.x, y: _p.y + 0.9, z: _p.z, life: 0.45, s0: 0.8, s1: 2.6, cell: CELL.glow, c0: c, c1: c, g: 1.0, a: 0.5, fp: 1.4 });
    fx.ring(_p, o.color || '#7dffb4', 1.1, { dur: 0.6, alpha: 0.7 });
  };
  fx.status = (target, kind, dur = 3, o = {}) => {
    const h = { kind: 'status', st: kind, a: target, t: 0, dur: dur ?? 1e9, on: true, acc: 0, o, headY: o.headY ?? 2.05 };
    h.stop = () => { h.on = false; };
    if (kind === 'slow' || kind === 'root') { P(target, _p); const i = allocTimed(ringMesh); _v.copy(_p); _v.y = groundY + 0.035; _m.compose(_v, _q.identity(), _s.set(1.1, 1, 1.1)); setTimed(ringMesh, i, _m, rgb(kind === 'root' ? '#a07a3a' : '#4aa3f0'), 0.9, uTime.value, 1.4, 3, uTime.value + h.dur); h.ri = i; rings.push(h); const s0 = h.stop; h.stop = () => { s0(); ringMesh.userData.par.setW(i, uTime.value); ringMesh.userData.par.needsUpdate = true; }; }
    emitters.push(h); return h;
  };

  // Floating numbers / words. kind: 'dmg' | 'crit' | 'heal' | 'miss' | 'tech' | 'status' | 'thorn' | 'fire'
  const NK = { dmg: ['#fff3d6', 1.0, 1.35, 0], crit: ['#ffc83a', 1.75, 1.9, 1], heal: ['#7dffb4', 1.05, 1.1, 0], miss: ['#b8b8c4', 0.75, 0.9, 0], tech: ['#ffb061', 0.95, 1.2, 0], status: ['#c9a6ff', 0.8, 1.0, 0], thorn: ['#e88a8a', 0.8, 1.0, 0], fire: ['#ff8a3a', 0.9, 1.2, 0], block: ['#9fd0ff', 0.9, 1.0, 0] };
  fx.number = (pos, text, kind = 'dmg', o = {}) => {
    const k = NK[kind] || NK.dmg; text = String(text).toUpperCase(); const c = rgb(o.color || k[0]), sc = (o.scale ?? 1) * k[1];
    let total = 0; for (const ch of text) total += GLYPH_W(ch); let x = -total / 2; const life = o.life ?? (kind === 'crit' ? 1.15 : 0.95); const t0 = uTime.value;
    const drift = (o.drift ?? (rnd() - 0.5) * 1.2) * sc, rise = k[2] * (o.rise ?? 1) * sc * 1.15;
    P(pos, _p, o.dy ?? 2.0);
    for (const ch of text) { const w = GLYPH_W(ch), gi = GLYPHS.indexOf(ch); if (gi >= 0 && ch !== ' ') { const i = gCur; gCur = (gCur + 1) % MAXG;
      gAttr[0].setXYZW(i, _p.x, _p.y, _p.z, t0); gAttr[1].setXYZW(i, (x + w / 2) * 1.0, gi, life, sc); gAttr[2].setXYZW(i, c.r, c.g, c.b, k[3]); gAttr[3].setXYZW(i, drift, rise, 0, 0); } x += w; }
    gAttr.forEach((a) => { a.needsUpdate = true; }); gEnd = Math.max(gEnd, t0 + life + 0.05); glyphMesh.visible = true;
  };

  // Ground decals (sand scuffs). type: scuff | skid | crater | scorch | crack | footprint | scratch
  fx.groundDecal = fx.decal = (pos, type = 'scuff', o = {}) => {
    const k = DS / (decalExt * 2), cx = (pos.x / (decalExt * 2) + 0.5) * DS, cy = (pos.z / (decalExt * 2) + 0.5) * DS, ang = o.angle ?? rnd() * TAU, s = (o.size ?? 1) * k; const g = dctx;
    g.save(); g.translate(cx, cy); g.rotate(ang);
    const blob = (rx, ry, col, a) => { g.save(); g.scale(1, ry / rx); const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, col.replace('A', a)); gr.addColorStop(1, col.replace('A', 0)); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill(); g.restore(); };
    const DK = 'rgba(96,66,38,A)', LT = 'rgba(246,226,178,A)', BK = 'rgba(34,24,18,A)';
    if (type === 'scuff') { blob(1.0 * s, 0.5 * s, DK, 0.5); for (let i = 0; i < 5; i++) { g.strokeStyle = LT.replace('A', 0.5); g.lineWidth = Math.max(1.5, 0.045 * s); g.beginPath(); const y = (rnd() - 0.5) * 0.5 * s; g.moveTo(-0.2 * s, y); g.lineTo(R_(0.4, 1.0) * s, y + (rnd() - 0.5) * 0.15 * s); g.stroke(); } }
    else if (type === 'skid') { const L = (o.len ?? 2.5) * k; g.lineCap = 'round'; g.strokeStyle = LT.replace('A', 0.35); g.lineWidth = 0.34 * s; g.beginPath(); g.moveTo(0, 0); g.lineTo(L, 0); g.stroke(); g.strokeStyle = DK.replace('A', 0.42); g.lineWidth = 0.16 * s; g.beginPath(); g.moveTo(0, 0); g.lineTo(L, 0); g.stroke(); blob(0.4 * s, 0.4 * s, DK, 0.3); }
    else if (type === 'crater') { blob(1.3 * s, 1.3 * s, DK, 0.62); g.strokeStyle = LT.replace('A', 0.65); g.lineWidth = 0.14 * s; g.beginPath(); g.arc(0, 0, 0.95 * s, 0, TAU); g.stroke(); blob(0.55 * s, 0.55 * s, BK, 0.18); }
    else if (type === 'scorch') { blob(1.3 * s, 1.1 * s, BK, 0.62); for (let i = 0; i < 6; i++) { g.save(); g.translate((rnd() - 0.5) * s * 1.2, (rnd() - 0.5) * s * 1.2); blob(0.5 * s, 0.4 * s, BK, 0.3); g.restore(); } blob(0.5 * s, 0.5 * s, 'rgba(120,70,30,A)', 0.3); }
    else if (type === 'crack') { const arms = o.arms ?? 7; g.lineCap = 'round'; for (let i = 0; i < arms; i++) { let a = i / arms * TAU + (rnd() - 0.5) * 0.4, x = 0, y = 0; g.strokeStyle = BK.replace('A', 0.55); g.lineWidth = Math.max(1.5, 0.045 * s); g.beginPath(); g.moveTo(0, 0); const L = R_(0.9, 1.5) * s; for (let d = 0; d < L; d += 0.12 * s) { a += (rnd() - 0.5) * 0.7; x += Math.cos(a) * 0.12 * s; y += Math.sin(a) * 0.12 * s; g.lineTo(x, y); } g.stroke(); g.strokeStyle = LT.replace('A', 0.3); g.lineWidth = Math.max(1, 0.02 * s); g.stroke(); } blob(0.6 * s, 0.6 * s, DK, 0.25); }
    else if (type === 'footprint') { for (let f = 0; f < 2; f++) { g.save(); g.translate(f * 0.45 * s, (f ? 0.18 : -0.18) * s); g.scale(1, 0.55); g.fillStyle = DK.replace('A', 0.3); g.beginPath(); g.arc(0, 0, 0.17 * s, 0, TAU); g.fill(); g.restore(); } }
    else if (type === 'scratch') { g.strokeStyle = BK.replace('A', 0.4); g.lineWidth = Math.max(1, 0.035 * s); g.lineCap = 'round'; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(0, i * 0.12 * s); g.lineTo(R_(0.6, 1.1) * s, i * 0.12 * s + (rnd() - 0.5) * 0.1 * s); g.stroke(); } }
    g.restore(); markTiles(pos.x, pos.z, (s / k) * 1.7 + 0.3); decalDirty = true;
  };
  fx.clearDecals = () => { dctx.clearRect(0, 0, DS, DS); decPainted.fill(0); decPending = true; decalDirty = true; };
  // raw access for gore.js: paint straight on the decal canvas (px per metre = k, origin at the arena centre). markDecals() schedules the throttled upload.
  fx.decalDraw = { ctx: dctx, canvas: dcv, size: DS, k: DS / (decalExt * 2), ext: decalExt, toPx: (x, z) => [(x / (decalExt * 2) + 0.5) * DS, (z / (decalExt * 2) + 0.5) * DS] };
  /** schedule a throttled upload. With (x, z, r) in metres only the touched tiles are uploaded, without arguments every tile that was ever painted. */
  fx.markDecals = (x, z, r = 1) => { if (x === undefined) { for (let i = 0; i < decPainted.length; i++) if (decPainted[i]) decTileDirty[i] = 1; } else markTiles(x, z, r); decalDirty = true; };
  fx.decalStats = decStats;
  fx.addNormalParticle = (o) => norL.add(o); fx.addGlowParticle = (o) => addL.add(o);

  // ====================================================================
  // COMPOSITES
  // ====================================================================
  // hit(): the one call fightview makes per 'hit' event. cls from damage: 'light' | 'heavy' | 'crit'
  fx.hit = (pos, dir, o = {}) => {
    const cls = o.crit ? 'crit' : (o.dmgFrac || 0) > 0.12 ? 'heavy' : 'light'; const col = o.color || (cls === 'crit' ? '#ffd34d' : '#fff1cf');
    const d = dir || { x: 0, y: 0.2, z: 1 };
    // crisp, damage scaled: core flash + directional sparks + thin ground ring + a little sand. Big blobs are for ults only.
    const f = Math.min(1, (o.dmgFrac || 0) / 0.3), G = { x: pos.x, y: groundY, z: pos.z }, W0 = { x: pos.x, y: 0, z: pos.z };
    const fl = o.flesh ? 0.3 : 1; // flesh hits (gore on): few sparks, the blood carries the impact
    if (cls === 'light') { fx.spark(pos, d, Math.max(1, Math.round(5 * fl)), col, { speed: 6.5, size: 0.14 }); fx.impactFlash(pos, col, (0.55 + f * 0.3) * (o.flesh ? 0.6 : 1)); fx.ring(W0, col, 0.9, { dur: 0.28, alpha: 0.5 }); fx.dust(G, 2, { size: 0.4, alpha: 0.35 }); fx.debris(G, 1, { size: 0.45 }); }
    else if (cls === 'heavy') { fx.spark(pos, d, Math.max(2, Math.round((9 + Math.round(f * 5)) * fl)), col, { speed: 8, size: 0.16 }); fx.impactFlash(pos, col, (0.8 + f * 0.3) * (o.flesh ? 0.6 : 1)); fx.ring(W0, col, 1.4, { dur: 0.36, alpha: 0.65 }); fx.dust(G, 4, { size: 0.65, alpha: 0.5 }); fx.debris(G, 3, { size: 0.6 }); }
    else { fx.spark(pos, d, Math.max(3, Math.round(16 * fl)), col, { speed: 10, size: 0.17 }); fx.spark(pos, d, o.flesh ? 1 : 5, '#ffffff', { speed: 13, cone: 0.35, size: 0.12 }); fx.impactFlash(pos, col, o.flesh ? 0.9 : 1.25); fx.shockwave(W0, 1.9, col, { dur: 0.42, dust: false, distort: o.flesh ? 0.12 : 0.35, alpha: o.flesh ? 0.3 : 0.7 }); fx.dust(G, 6, { size: 0.9, alpha: 0.55 }); fx.debris(G, 5, { size: 0.8 }); fx.decal(W0, 'scuff', { size: 1.1, angle: Math.atan2(d.z, d.x) }); }
    return cls;
  };

  // Ultimates by element: fire | lightning | earth | wind | holy
  const EL = { fire: '#e8742a', lightning: '#9fd0ff', earth: '#c98a52', wind: '#bfe8d8', holy: '#f6d46a' };
  fx.ult = {
    colorOf: (el) => EL[el] || el,
    // ANTICIPATION at the caster (~0.35 s): crisp converging streaks, a contracting core and one element-specific tell. No big glow discs.
    cast(el, pos, color) {
      const c = rgb(color || EL[el] || '#ffffff'), hot = mixc(c, WHITE, 0.6); const y = pos.y ?? 1; const gp = { x: pos.x, y: groundY, z: pos.z };
      fx.ring({ x: pos.x, y: 0, z: pos.z }, c, 2.0, { dur: 0.5, alpha: 0.8 });
      const i = allocTimed(ringMesh); _v.set(pos.x, groundY + 0.04, pos.z); _m.compose(_v, _q.identity(), _s.set(3.0, 1, 3.0)); setTimed(ringMesh, i, _m, c, 0.9, uTime.value, 0.38, 5, 0); // converging ring
      for (let k = 0; k < N(20); k++) { const a = rnd() * TAU, r = R_(1.5, 2.6), h = R_(0.1, 2.0), T = 0.32, vx = -Math.cos(a) * r / T, vz = -Math.sin(a) * r / T, vy = (y - h) / T;
        addL.add({ x: pos.x + Math.cos(a) * r, y: groundY + h, z: pos.z + Math.sin(a) * r, vx, vz, vy, life: T, s0: 0.16, s1: 0.05, st: 0.09, cell: CELL.streak, c0: c, c1: hot, g: 2.2, fp: 0.4, att: 0.1 }); }
      addL.add({ x: pos.x, y: y + 0.2, z: pos.z, life: 0.34, s0: 0.7, s1: 0.12, cell: CELL.disc, c0: c, c1: WHITE, g: 2.0, a: 0.85, fp: 1.4 });  // contracting core
      addL.add({ x: pos.x, y: y + 0.2, z: pos.z, life: 0.3, s0: 1.1, s1: 0.25, cell: CELL.star4, c0: hot, c1: WHITE, g: 2.4, rot: rnd() * TAU, rv: 3, a: 0.9, fp: 1.2 });
      if (el === 'fire') { for (let k = 0; k < N(12); k++) { const a = rnd() * TAU, rr = R_(0.4, 1.0); addL.add({ x: pos.x + Math.cos(a) * rr, y: groundY + 0.1, z: pos.z + Math.sin(a) * rr, vx: -Math.sin(a) * 1.2, vz: Math.cos(a) * 1.2, vy: R_(2.4, 4.4), life: R_(0.3, 0.5), s0: 0.22, s1: 0.03, cell: CELL.ember, c0: hot, c1: c, g: 2.4, fp: 0.6, att: 0.05 }); } }
      else if (el === 'lightning') { for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + rnd(); fx.beam({ x: pos.x + Math.cos(a) * 1.6, y: y + R_(-0.3, 0.8), z: pos.z + Math.sin(a) * 1.6 }, { x: pos.x, y: y, z: pos.z }, c, { life: 0.2, width: 0.07, jag: 0.35, flicker: 0.035, pts: 10, glow: 1.6 }); } }
      else if (el === 'earth') { fx.debris(gp, 6, { kind: 'stone', up: 0.7, speed: 0.5, size: 0.7 }); fx.dust(gp, 6, { size: 0.7, alpha: 0.5 }); }
      else if (el === 'wind') { for (let k = 0; k < 2; k++) { const a = k * Math.PI; fx.slash({ x: pos.x, y: 0.9 + k * 0.5, z: pos.z }, { x: Math.cos(a), y: 0, z: Math.sin(a) }, '#d8fff0', 1.3, { tilt: 0.2, dur: 0.34, flip: !!k }); } }
      else if (el === 'holy') beamUp(pos, c, 0.3, 0.2);
    },
    // IMPACT (r = world radius): a white core, then element-shaped crisp forms (spikes, bolts, shards, crescents, rays), then residue on the sand.
    impact(el, pos, r = 3.2, color) {
      const c = rgb(color || EL[el] || '#ffffff'), hot = mixc(c, WHITE, 0.65), gp = { x: pos.x, y: groundY, z: pos.z };
      const core = (y, k) => { addL.add({ x: pos.x, y, z: pos.z, life: 0.08, s0: k * 0.5, s1: k * 0.7, cell: CELL.disc, c0: WHITE, c1: hot, g: 2.6, a: 1, fp: 1.6, att: 0.01 }); fx.impactFlash({ x: pos.x, y, z: pos.z }, c, Math.min(k * 1.4, 2.0)); };
      switch (el) {
        case 'fire': {
          core(0.7, 1.0); fx.shockwave(gp, r * 1.3, '#ffb060', { dur: 0.7, alpha: 0.85 }); fx.ring(gp, '#ffe0a0', r * 0.9, { dur: 0.45, alpha: 0.8 });
          for (let i = 0; i < N(18); i++) { const a = i / 18 * TAU + rnd() * 0.25, s = r * R_(2.4, 3.6); addL.add({ x: pos.x, y: R_(0.15, 0.5), z: pos.z, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: R_(0.4, 1.6), life: R_(0.26, 0.42), s0: 0.34, s1: 0.06, st: 0.16, cell: CELL.streak, c0: mixc(c, WHITE, 0.3), c1: { r: 0.85, g: 0.1, b: 0.01 }, g: 0.9, a: 0.95, drag: 2.2, fp: 1.1, att: 0.01 }); } // flame spikes
          for (let i = 0; i < N(9); i++) { const a = rnd() * TAU, s = R_(0, r * 0.7); addL.add({ x: pos.x + Math.cos(a) * s, y: R_(0.1, 0.5), z: pos.z + Math.sin(a) * s, vx: Math.cos(a) * 0.6, vz: Math.sin(a) * 0.6, vy: R_(2.6, 4.6), life: R_(0.4, 0.65), s0: R_(0.45, 0.7), s1: 0.05, cell: CELL.glow, c0: mixc(c, WHITE, 0.35), c1: { r: 0.9, g: 0.12, b: 0.01 }, g: 0.9, a: 0.95, drag: 1.2, fp: 1.1, delay: R_(0, 0.08) }); }  // tongues
          for (let i = 0; i < N(8); i++) { const a = rnd() * TAU, s = R_(0.5, 1.8); norL.add({ x: pos.x + Math.cos(a) * s * 0.5, y: R_(0.4, 1.1), z: pos.z + Math.sin(a) * s * 0.5, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: R_(1.2, 2.4), life: R_(0.9, 1.4), s0: 0.5, s1: R_(1.4, 2.0), cell: CELL.puffA, rot: rnd() * TAU, rv: R_(-0.6, 0.6), c0: { r: 0.3, g: 0.2, b: 0.16 }, c1: { r: 0.12, g: 0.1, b: 0.1 }, a: 0.45, drag: 1.6, grav: -0.5, fp: 1.1, att: 0.1, delay: 0.1 }); } // smoke
          fx.spark({ x: pos.x, y: 0.6, z: pos.z }, { x: 0, y: 1, z: 0 }, 30, '#ff9a3a', { speed: 10, cone: 1.4, life: 1.3 }); fx.debris(gp, 10, { kind: 'fire', speed: 1.4, up: 1.3, size: 1.1 });
          fx.decal(gp, 'scorch', { size: r * 0.9 }); fx.decal(gp, 'crater', { size: r * 0.5 }); break; }
        case 'lightning': {
          core(1.0, 0.9); fx.shockwave(gp, r * 1.1, '#cfe8ff', { dur: 0.45, dust: false, alpha: 0.8 });
          for (let k = 0; k < 5; k++) { const a = rnd() * TAU, d = k === 0 ? 0 : R_(0.4, 1) * r * 0.8; const tx = pos.x + Math.cos(a) * d, tz = pos.z + Math.sin(a) * d; const top = new THREE.Vector3(tx + R_(-1.5, 1.5), 16, tz + R_(-1.5, 1.5)); const hitp = new THREE.Vector3(tx, groundY + 0.05, tz);
            later(k * 0.05, () => { fx.beam(top, hitp, c, { life: 0.26, width: k === 0 ? 0.2 : 0.12, jag: 0.9, flicker: 0.035, pts: 19, glow: 1.0 }); fx.impactFlash(hitp, '#dff0ff', k === 0 ? 1.4 : 0.8); fx.spark(hitp, null, 10, '#bfe0ff', { speed: 8 }); }); }
          for (let k = 0; k < 7; k++) { const a = k / 7 * TAU + rnd() * 0.4, d = r * R_(0.7, 1); later(0.08 + k * 0.02, () => fx.zap({ x: pos.x, y: 0.15, z: pos.z }, { x: pos.x + Math.cos(a) * d, y: 0.1, z: pos.z + Math.sin(a) * d }, '#bfe0ff', { branch: false, sparks: false })); }
          fx.dust(gp, 5, { size: 0.7, alpha: 0.5 }); fx.decal(gp, 'scorch', { size: r * 0.7 }); fx.decal(gp, 'crack', { size: r * 0.6, arms: 8 }); break; }
        case 'earth': {
          core(0.4, 0.8); fx.shockwave(gp, r * 1.4, '#ffe6b8', { dur: 0.7, alpha: 0.85, dust: false }); fx.ring(gp, '#fff0d0', r * 0.8, { dur: 0.4, alpha: 0.8 });
          fx.dust(gp, 14, { size: 1.0, speed: 1.6, alpha: 0.55 }); fx.debris(gp, 20, { kind: 'stone', up: 1.7, speed: 1.5, size: 1.3 }); fx.debris(gp, 8, { kind: 'sand', up: 1.2, size: 1.0 });
          for (let i = 0; i < N(14); i++) { const a = i / 14 * TAU + rnd() * 0.2, s = r * R_(1.6, 2.4); addL.add({ x: pos.x, y: 0.12, z: pos.z, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: R_(0.3, 1.0), life: 0.3, s0: 0.22, s1: 0.05, st: 0.12, cell: CELL.streak, c0: { r: 1, g: 0.9, b: 0.7 }, c1: c, g: 1.4, a: 0.8, drag: 2.4, fp: 1.1 }); }
          fx.spark({ x: pos.x, y: 0.4, z: pos.z }, { x: 0, y: 1, z: 0 }, 12, '#ffd9a0', { speed: 8, cone: 1.5 });
          fx.decal(gp, 'crater', { size: r * 0.8 }); fx.decal(gp, 'crack', { size: r * 0.95, arms: 9 }); break; }
        case 'wind': {
          for (let k = 0; k < 3; k++) later(k * 0.1, () => fx.shockwave(gp, r * (0.9 + k * 0.35), '#d8fff0', { dur: 0.6, dust: false, distort: 0.6, alpha: 0.8 }));
          for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; fx.slash({ x: pos.x + Math.cos(a) * r * 0.55, y: 0.9, z: pos.z + Math.sin(a) * r * 0.55 }, { x: -Math.sin(a), y: 0, z: Math.cos(a) }, '#d8fff0', 1.5, { tilt: 0.25, dur: 0.36 }); }
          for (let i = 0; i < N(16); i++) { const a = rnd() * TAU, s = R_(r * 0.5, r * 1.4); norL.add({ x: pos.x, y: groundY + R_(0.05, 0.7), z: pos.z, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: R_(0.2, 1.2), swirl: 3.5, life: R_(0.7, 1.2), s0: 0.35, s1: R_(1.0, 1.6), cell: rnd() < 0.5 ? CELL.puffA : CELL.puffB, rot: rnd() * TAU, c0: mixc(sand, WHITE, 0.6), c1: sand, a: 0.55, drag: 1.8, fp: 1.2 }); }
          for (let i = 0; i < N(22); i++) { const a = rnd() * TAU, s = R_(3, 8); addL.add({ x: pos.x, y: R_(0.2, 0.9), z: pos.z, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: R_(0.2, 1.2), swirl: 4, life: R_(0.35, 0.6), s0: 0.1, s1: 0.04, st: 0.12, cell: CELL.streak, c0: hot, c1: c, g: 1.8, drag: 1.2 }); }
          fx.decal(gp, 'scuff', { size: r * 0.8 }); break; }
        case 'holy': {
          core(1.2, 0.9); fx.shockwave(gp, r * 1.1, '#ffe8a0', { dur: 0.6, dust: false, distort: 0.3, alpha: 0.85 }); fx.ring(gp, '#fff4c0', r * 0.7, { dur: 0.5, alpha: 0.8 }); beamUp(pos, c, 0.65, 0.36);
          for (let i = 0; i < N(14); i++) { const a = i / 14 * TAU; addL.add({ x: pos.x, y: 0.3, z: pos.z, vx: Math.cos(a) * r * 2.4, vz: Math.sin(a) * r * 2.4, vy: 0.2, life: 0.3, s0: 0.2, s1: 0.04, st: 0.14, cell: CELL.streak, c0: WHITE, c1: c, g: 2.2, drag: 2.4, fp: 1.2 }); }
          for (let i = 0; i < N(22); i++) { const a = rnd() * TAU, d = R_(0.2, r * 0.8); addL.add({ x: pos.x + Math.cos(a) * d, y: R_(0.05, 0.6), z: pos.z + Math.sin(a) * d, vy: R_(1.5, 4), vx: 0, vz: 0, delay: rnd() * 0.3, life: R_(0.9, 1.5), s0: R_(0.12, 0.24), s1: 0.03, cell: i % 4 === 0 ? CELL.star5 : CELL.glow, c0: hot, c1: c, g: 2.2, fp: 1, rv: 2 }); }
          fx.decal(gp, 'scorch', { size: r * 0.5, angle: 0 }); break; }
        default: break;
      }
    },
    // sustained effect around a unit: tornado (wind), rage (fire), shield (holy), crackle (lightning), quake (earth). returns handle
    sustain(el, target, dur = 3, o = {}) {
      const h = { kind: 'sustain', el, a: target, c: rgb(o.color || EL[el] || '#ffffff'), t: 0, dur, on: true, acc: 0, radius: o.radius ?? 1.6 }; h.stop = () => { h.on = false; }; emitters.push(h); return h;
    },
  };
  function beamUp(pos, c, life, w = 1.1) { // vertical light pillar via 2 camera-facing ribbons
    const bot = new THREE.Vector3(pos.x, groundY, pos.z), top = new THREE.Vector3(pos.x, 18, pos.z);
    fx.beam(bot, top, c, { life, width: w, pts: 2, glow: 1.1, fade: 0.6 }); fx.beam(bot, top, '#ffffff', { life: life * 0.7, width: w * 0.27, pts: 2, glow: 2.0, fade: 0.6 });
  }
  // deferred calls on fx time
  const timers = [];
  function later(dt, fn) { timers.push({ t: fx.time + dt, fn }); }
  fx.later = later;

  // ====================================================================
  // UPDATE
  // ====================================================================
  const camPos = new THREE.Vector3(0, 10, 12);
  const SANDW = mixc(sand, WHITE, 0.55); // PERF: constants instead of per-frame colour objects
  const _C0 = { r: 1, g: 0.78, b: 0.12 };
  const _C1 = { r: 0.3, g: 0.65, b: 1 };
  const _C2 = { r: 1, g: 0.32, b: 0.12 };
  const _C3 = { r: 1, g: 0.3, b: 0.1 };
  const ikClamp = (v) => (v < 0.5 ? 0.5 : v > 1.05 ? 1.05 : v);
  function updateEmitters(dt) {
    for (let i = emitters.length - 1; i >= 0; i--) {
      const h = emitters[i];
      if (h.kind === 'fn') { h.step(dt); if (!h.on) { emitters[i] = emitters[emitters.length - 1]; emitters.pop(); } continue; }
      h.t = (h.t || 0) + dt; if (h.t > (h.dur ?? 1e9)) h.on = false;
      if (!h.on) { if (h.ri !== undefined) { const k = rings.indexOf(h); if (k >= 0) rings.splice(k, 1); } emitters[i] = emitters[emitters.length - 1]; emitters.pop(); continue; }
      P(h.a, _p);
      if (h.kind === 'proj') {
        const c = h.c, s = h.size, tt = fx.time; addL.put(_p.x, _p.y, _p.z, s * (1.7 + 0.2 * Math.sin(tt * 40)), c, 0.55, CELL.glow, 0, 1.6);
        addL.put(_p.x, _p.y, _p.z, s * 0.85, (h.m8 || (h.m8 = mixc(c, WHITE, 0.8))), 1, CELL.disc, 0, 2.2); addL.put(_p.x, _p.y, _p.z, s * 2.2, (h.m5 || (h.m5 = mixc(c, WHITE, 0.5))), 0.8, CELL.star4, tt * 4, 1.5);
        h.acc += dt * 70; while (h.acc >= 1) { h.acc--; addL.add({ x: _p.x, y: _p.y, z: _p.z, vx: R_(-1, 1) * 1.2, vy: R_(-0.5, 1.2), vz: R_(-1, 1) * 1.2, life: R_(0.18, 0.4), s0: s * 0.3, s1: 0.02, cell: CELL.ember, c0: mixc(c, WHITE, 0.6), c1: c, g: 2, drag: 2, grav: 4, fp: 1 }); }
      } else if (h.kind === 'aura') {
        const c = h.c, st = h.style, rate = st === 'rage' ? 36 : st === 'frenzy' ? 26 : 16; const tt = h.t;
        if (ringMesh) { _v.set(_p.x, groundY + 0.035, _p.z); _m.compose(_v, _q.identity(), _s.set(h.radius * 1.6, 1, h.radius * 1.6)); ringMesh.setMatrixAt(h.ri, _m); ringMesh.instanceMatrix.needsUpdate = true; }
        const pulse = 0.55 + 0.45 * Math.sin(tt * 5.5); addL.put(_p.x, _p.y + h.height, _p.z, h.radius * 2.6 * (0.9 + 0.1 * pulse), c, 0.16 + 0.1 * pulse, CELL.glow, 0, 1.2);
        if (st === 'guard') { for (let k = 0; k < 3; k++) addL.put(_p.x, _p.y + h.height, _p.z, h.radius * 2.4, c, 0.28 * (0.5 + 0.5 * Math.sin(tt * 4 + k * 2.1)), CELL.ring, 0, 1.6); }
        h.acc += dt * rate * fx.quality; while (h.acc >= 1) { h.acc--; const a = rnd() * TAU, rr = R_(0.3, 0.9) * h.radius; const up = st === 'rage' ? R_(1.6, 3) : R_(0.8, 1.8);
          addL.add({ x: _p.x + Math.cos(a) * rr, y: _p.y + R_(0.05, 0.5), z: _p.z + Math.sin(a) * rr, vx: 0, vy: up, vz: 0, life: R_(0.7, 1.2), s0: R_(0.1, 0.2), s1: 0.02, cell: st === 'rally' ? CELL.chevron : st === 'rage' || st === 'frenzy' ? CELL.ember : CELL.glow, c0: mixc(c, WHITE, 0.5), c1: c, g: 2.2, fp: 1, turb: 1.5, drag: 0.4 }); }
      } else if (h.kind === 'sustain') {
        const c = h.c, tt = h.t, el = h.el;
        if (el === 'wind') { // tornado funnel of spiraling dust + streaks
          h.acc += dt * 90 * fx.quality; while (h.acc >= 1) { h.acc--; const y = rnd() * 3.4, a = rnd() * TAU, rr = 0.3 + y * 0.32 * h.radius * 0.7 + R_(0, 0.2);
            const wnd = { x: _p.x + Math.cos(a) * rr, y: groundY + y, z: _p.z + Math.sin(a) * rr, vx: -Math.sin(a) * 6.5, vz: Math.cos(a) * 6.5, vy: R_(0.5, 2), swirl: 0, life: R_(0.5, 0.9), s0: R_(0.5, 0.8), s1: R_(1.4, 2.0), cell: rnd() < 0.5 ? CELL.puffA : CELL.puffB, rot: rnd() * TAU, c0: mixc(sand, WHITE, 0.65), c1: sand, a: 0.9, fp: 1.2 };
            norL.add(wnd); if (rnd() < 0.5) addL.add({ x: wnd.x, y: wnd.y, z: wnd.z, vx: wnd.vx, vz: wnd.vz, vy: wnd.vy, life: 0.25, s0: 0.07, s1: 0.04, st: 0.06, cell: CELL.streak, c0: { r: 0.9, g: 1, b: 0.95 }, c1: c, g: 1.5, fp: 1 }); }
        } else if (el === 'fire') { // rage: rising flame wisps + heat glow
          addL.put(_p.x, _p.y + 1, _p.z, 2.4 + 0.3 * Math.sin(tt * 18), c, 0.24, CELL.glow, 0, 1.4);
          h.acc += dt * 40 * fx.quality; while (h.acc >= 1) { h.acc--; const a = rnd() * TAU, rr = R_(0.1, 0.6); addL.add({ x: _p.x + Math.cos(a) * rr, y: _p.y + R_(0.1, 1.4), z: _p.z + Math.sin(a) * rr, vy: R_(1.5, 3.2), vx: R_(-0.3, 0.3), vz: R_(-0.3, 0.3), life: R_(0.4, 0.8), s0: R_(0.3, 0.55), s1: 0.05, cell: CELL.glow, c0: { r: 1, g: 0.8, b: 0.4 }, c1: { r: 1, g: 0.2, b: 0.02 }, g: 1.8, a: 0.8, fp: 1.1, turb: 2 }); }
        } else if (el === 'lightning') { h.acc += dt; if (h.acc > 0.14) { h.acc = 0; const a = rnd() * TAU; fx.zap({ x: _p.x, y: _p.y + R_(0.4, 1.6), z: _p.z }, { x: _p.x + Math.cos(a) * 1.4, y: _p.y + R_(0, 1.8), z: _p.z + Math.sin(a) * 1.4 }, c, { branch: false, sparks: false, life: 0.1 }); } addL.put(_p.x, _p.y + 1, _p.z, 2.0, c, 0.15 + 0.1 * rnd(), CELL.glow, 0, 1.4);
        } else if (el === 'earth') { h.acc += dt; if (h.acc > 0.3) { h.acc = 0; fx.dust({ x: _p.x, y: groundY, z: _p.z }, 3, { size: 0.9 }); fx.debris({ x: _p.x, y: groundY, z: _p.z }, 1, { kind: 'stone', size: 0.8 }); } }
        else if (el === 'holy') { addL.put(_p.x, _p.y + 1, _p.z, 3.0, c, 0.2 + 0.08 * Math.sin(tt * 6), CELL.glow, 0, 1.5); h.acc += dt * 18; while (h.acc >= 1) { h.acc--; const a = rnd() * TAU; addL.add({ x: _p.x + Math.cos(a) * 0.9, y: _p.y + 0.1, z: _p.z + Math.sin(a) * 0.9, vy: R_(1.5, 2.5), life: 0.9, s0: 0.16, s1: 0.03, cell: CELL.glow, c0: mixc(c, WHITE, 0.6), c1: c, g: 2.4 }); } }
      } else if (h.kind === 'status') {
        const tt = h.t, y = _p.y + h.headY, ik = ikClamp(Math.sqrt((camPos.x - _p.x) * (camPos.x - _p.x) + (camPos.y - _p.y) * (camPos.y - _p.y) + (camPos.z - _p.z) * (camPos.z - _p.z)) / 11) * (h.o.iconK || 1); // READABILITY: icons shrink in close shots
        if (h.st === 'stun') { const w = tt * 5.2; for (let k = 0; k < 3; k++) { const a = w + k * TAU / 3; const sx = _p.x + Math.cos(a) * 0.42, sz = _p.z + Math.sin(a) * 0.42, sy = y + Math.sin(tt * 7 + k) * 0.05; const back = Math.sin(a) < 0 ? 0.7 : 1; norL.put(sx, sy, sz, 0.38 * back * ik, _C0, 1, CELL.star5, a * 0.5, 1.15); } }
        else if (h.st === 'slow') { for (let k = 0; k < 3; k++) { const ph = (tt * 1.1 + k / 3) % 1; norL.put(_p.x + (k - 1) * 0.34 * ik, y - ph * 0.7 * ik + 0.1, _p.z, 0.7 * ik, _C1, Math.sin(ph * Math.PI), CELL.chevron, Math.PI, 1.1); } h.acc += dt * 5; while (h.acc >= 1) { h.acc--; const a = rnd() * TAU; addL.add({ x: _p.x + Math.cos(a) * 0.7, y: _p.y + 0.15, z: _p.z + Math.sin(a) * 0.7, vy: R_(0.2, 0.7), life: 0.7, s0: 0.12, s1: 0.02, cell: CELL.glow, c0: { r: 0.6, g: 0.85, b: 1 }, c1: { r: 0.3, g: 0.6, b: 1 }, g: 2 }); } }
        else if (h.st === 'bleed') { h.acc += dt * 9; const dc = rgb(h.o.color || '#e0283a'); while (h.acc >= 1) { h.acc--; const a = rnd() * TAU; norL.add({ x: _p.x + Math.cos(a) * 0.5, y: _p.y + R_(0.9, 1.6), z: _p.z + Math.sin(a) * 0.5, vx: Math.cos(a) * 0.3, vy: R_(0, 0.5), vz: Math.sin(a) * 0.4, life: 0.7, s0: 0.32, s1: 0.24, cell: CELL.drop, c0: dc, c1: dc, a: 1, grav: 9, fp: 0.5, att: 0.02 }); } }
        else if (h.st === 'blind') { for (let k = 0; k < 4; k++) { const a = tt * 4 + k * TAU / 4; norL.put(_p.x + Math.cos(a) * 0.4, y - 0.15 + Math.sin(tt * 3 + k) * 0.05, _p.z + Math.sin(a) * 0.4, 0.6 * ik, SANDW, 0.9, CELL.puffA, a); } }
        else if (h.st === 'root') { h.acc += dt * 6; if (h.acc > 1) { h.acc = 0; fx.dust({ x: _p.x, y: groundY, z: _p.z }, 1, { size: 0.5, alpha: 0.4 }); } }
        else if (h.st === 'taunt') { const b = 1 + 0.15 * Math.sin(tt * 10); norL.put(_p.x, y + 0.15, _p.z, 0.95 * b * ik, _C2, 1, CELL.exclaim, 0, 1.1); addL.put(_p.x, y + 0.15, _p.z, 1.2 * ik, _C3, 0.25, CELL.glow, 0, 1.0); }
        else if (h.st === 'burn') { h.acc += dt * 24; while (h.acc >= 1) { h.acc--; const a = rnd() * TAU; addL.add({ x: _p.x + Math.cos(a) * 0.3, y: _p.y + R_(0.2, 1.4), z: _p.z + Math.sin(a) * 0.3, vy: R_(1, 2), life: R_(0.4, 0.7), s0: 0.55, s1: 0.1, cell: CELL.glow, c0: { r: 1, g: 0.75, b: 0.3 }, c1: { r: 1, g: 0.2, b: 0.02 }, g: 2.6, turb: 2, a: 1 }); } }
      }
    }
  }

  // ---- ribbon stepping ----
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3(), _s2 = new THREE.Vector3(), _tc = new THREE.Vector3();
  function ribbonStep(dt) {
    const pts = rib.pts, pos = rib.pos, col = rib.col, uvs = rib.uv;
    for (let si = 0; si < rib.slots.length; si++) {
      const s = rib.slots[si]; if (!s.on) { if (s.dirty) { rib.clearSlot(s, si); s.dirty = false; rib.aPos.needsUpdate = true; rib.aCol.needsUpdate = true; } continue; }
      const base = si * pts * 2; let n = 0, alphaK = 1;
      if (s.kind === 'beam') {
        s.age += dt; if (s.age >= s.life) { s.on = false; s.dirty = true; continue; }
        P(s.a, _a); P(s.b, _b); n = s.n; const t = s.age / s.life; alphaK = Math.pow(1 - t, s.fade < 1 ? 0.6 : 0.5) * (s.flick ? 0.65 + 0.35 * rnd() : 1);
        s.rej -= dt; if (!s.P0 || s.rej <= 0) { s.rej = s.flick || 1e9; const len = _a.distanceTo(_b); _t.subVectors(_b, _a).normalize(); _s2.set(0, 1, 0).cross(_t); if (_s2.lengthSq() < 1e-4) _s2.set(1, 0, 0); _s2.normalize(); _tc.crossVectors(_t, _s2);
          s.P0 = s.P0 || new Float32Array(pts * 3); for (let i = 0; i < n; i++) { const u = i / (n - 1), env = Math.sin(Math.PI * u), j = s.jag * env * (i === 0 || i === n - 1 ? 0 : 1); const o1 = (rnd() - 0.5) * 2 * j * Math.min(1.5, len * 0.35 + 0.3), o2 = (rnd() - 0.5) * 2 * j * Math.min(1.5, len * 0.35 + 0.3); s.P0[i * 3] = _a.x + (_b.x - _a.x) * u + _s2.x * o1 + _tc.x * o2; s.P0[i * 3 + 1] = _a.y + (_b.y - _a.y) * u + _s2.y * o1 + _tc.y * o2 - s.sag * env * 1.0 * 0 + (s.sag ? -s.sag * env * len * 0.1 : 0); s.P0[i * 3 + 2] = _a.z + (_b.z - _a.z) * u + _s2.z * o1 + _tc.z * o2; } }
        for (let i = 0; i < n; i++) { s.P[i * 3] = s.P0[i * 3]; s.P[i * 3 + 1] = s.P0[i * 3 + 1]; s.P[i * 3 + 2] = s.P0[i * 3 + 2]; }
        // beam width profile
      } else if (s.kind === 'trail') {
        s.t += dt; if (!s.stopped) { P(s.a, _a); const last = s.n ? _tc.set(s.P[0], s.P[1], s.P[2]) : null; if (!last || last.distanceTo(_a) > s.minD) { for (let i = Math.min(s.n, pts - 1); i > 0; i--) { s.P[i * 3] = s.P[(i - 1) * 3]; s.P[i * 3 + 1] = s.P[(i - 1) * 3 + 1]; s.P[i * 3 + 2] = s.P[(i - 1) * 3 + 2]; s.Q[i * 3] = s.Q[(i - 1) * 3]; s.Q[i * 3 + 1] = s.Q[(i - 1) * 3 + 1]; s.Q[i * 3 + 2] = s.Q[(i - 1) * 3 + 2]; s.T[i] = s.T[i - 1]; }
            s.P[0] = _a.x; s.P[1] = _a.y; s.P[2] = _a.z; if (s.base) { P(s.base, _b); s.Q[0] = _b.x; s.Q[1] = _b.y; s.Q[2] = _b.z; } s.T[0] = s.t; s.n = Math.min(s.n + 1, pts); } else { s.P[0] = _a.x; s.P[1] = _a.y; s.P[2] = _a.z; if (s.base) { P(s.base, _b); s.Q[0] = _b.x; s.Q[1] = _b.y; s.Q[2] = _b.z; } } }
        while (s.n > 0 && s.t - s.T[s.n - 1] > s.life) s.n--; // drop expired tail
        if (s.n === 0 && s.stopped) { s.on = false; s.dirty = true; continue; }
        n = s.n; if (n < 2) { rib.clearSlot(s, si); continue; }
      }
      if (n < 2) continue;
      const cr = s.c.r * s.g, cg = s.c.g * s.g, cb = s.c.b * s.g;
      for (let i = 0; i < pts; i++) {
        const ii = Math.min(i, n - 1), v = (base + i * 2) * 3, c4 = (base + i * 2) * 4; const p0 = Math.max(ii - 1, 0), p1 = Math.min(ii + 1, n - 1);
        const px = s.P[ii * 3], py = s.P[ii * 3 + 1], pz = s.P[ii * 3 + 2]; let hx, hy, hz, al;
        if (s.kind === 'trail' && s.base) { // span between tip and base
          const qx = s.Q[ii * 3], qy = s.Q[ii * 3 + 1], qz = s.Q[ii * 3 + 2]; const f = i < n ? 1 : 0; pos[v] = px; pos[v + 1] = py; pos[v + 2] = pz; pos[v + 3] = qx + (px - qx) * 0.25 * (1 - f); pos[v + 4] = qy + (py - qy) * 0.25 * (1 - f); pos[v + 5] = qz + (pz - qz) * 0.25 * (1 - f);
          // base side fades earlier: make ribbon thinner toward base
          pos[v + 3] = qx * 0.7 + px * 0.3; pos[v + 4] = qy * 0.7 + py * 0.3; pos[v + 5] = qz * 0.7 + pz * 0.3;
          al = i < n ? Math.pow(1 - clamp((s.t - s.T[ii]) / s.life, 0, 1), 1.3) * s.alpha : 0;
        } else {
          _t.set(s.P[p1 * 3] - s.P[p0 * 3], s.P[p1 * 3 + 1] - s.P[p0 * 3 + 1], s.P[p1 * 3 + 2] - s.P[p0 * 3 + 2]); if (_t.lengthSq() < 1e-8) _t.set(0, 1, 0); _t.normalize();
          _s2.set(camPos.x - px, camPos.y - py, camPos.z - pz).normalize(); _s2.crossVectors(_t, _s2); if (_s2.lengthSq() < 1e-6) _s2.set(1, 0, 0); _s2.normalize();
          const w = (i < n ? (s.kind === 'trail' ? s.width * Math.pow(1 - clamp((s.t - s.T[ii]) / s.life, 0, 1), 0.9) : s.width * (n === 2 ? 1 : 0.35 + 0.65 * Math.sin(Math.PI * ii / (n - 1)))) : 0) * 0.5; pos[v] = px + _s2.x * w; pos[v + 1] = py + _s2.y * w; pos[v + 2] = pz + _s2.z * w; pos[v + 3] = px - _s2.x * w; pos[v + 4] = py - _s2.y * w; pos[v + 5] = pz - _s2.z * w;
          al = i < n ? (s.kind === 'trail' ? Math.pow(1 - clamp((s.t - s.T[ii]) / s.life, 0, 1), 1.2) * s.alpha : alphaK) : 0;
        }
        for (let k = 0; k < 2; k++) { col[c4 + k * 4] = cr; col[c4 + k * 4 + 1] = cg; col[c4 + k * 4 + 2] = cb; col[c4 + k * 4 + 3] = al; }
      }
      rib.aPos.needsUpdate = true; rib.aCol.needsUpdate = true;
    }
  }

  // ---- debris stepping ----
  let debIdle = false;   // PERF: all debris slots already zeroed and uploaded: nothing to do until a piece spawns (debris.on)
  function debrisStep(dt) {
    if (debIdle && !WARM.on && !debMesh.visible) { let live = false; for (let i = 0; i < MAXD; i++) if (debris[i].on) { live = true; break; } if (!live) return; }
    let any = false, hi = 0;
    for (let i = 0; i < MAXD; i++) {
      const d = debris[i];
      if (!d.on) { _m.makeScale(0, 0, 0); debMesh.setMatrixAt(i, _m); continue; }
      d.age += dt; if (d.age > d.life) { d.on = false; _m.makeScale(0, 0, 0); debMesh.setMatrixAt(i, _m); continue; }
      any = true; hi = i + 1;
      if (!d.rest) { d.vy -= 18 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; _ax.set(d.ax, d.ay, d.az); _q.setFromAxisAngle(_ax, d.w * dt); d.q.premultiply(_q);
        if (d.y < groundY + d.s * 0.4) { d.y = groundY + d.s * 0.4; if (Math.abs(d.vy) < 1.2) { d.rest = true; d.w = 0; } else { d.vy = -d.vy * 0.35; d.vx *= 0.6; d.vz *= 0.6; d.w *= 0.5; } } }
      const t = d.age / d.life, sc = d.s * (t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1);
      _v.set(d.x, d.y, d.z); _m.compose(_v, d.q, _s.set(sc, sc, sc)); debMesh.setMatrixAt(i, _m);
    }
    debMesh.count = any ? MAXD : WARM.on ? 1 : 0; debMesh.instanceMatrix.needsUpdate = true; debMesh.visible = any || WARM.on; debIdle = !any;
  }

  fx.update = (dt, camera) => {
    dt = Math.min(dt, 0.1);
    if (camera) { fx.cam = camera; camera.getWorldPosition(camPos); }
    fx.time += dt; uTime.value = fx.time;
    for (let i = timers.length - 1; i >= 0; i--) if (fx.time >= timers[i].t) { const f = timers[i].fn; timers.splice(i, 1); f(); }
    addL.step(dt); norL.step(dt);
    updateEmitters(dt); ribbonStep(dt); debrisStep(dt);
    for (let i = 0; i < fx.hooks.length; i++) fx.hooks[i](dt, norL, addL); // gore etc: immediate-mode instances written after the pooled step
    addL.flush(); norL.flush();
    if (!fx.warming) { const T = fx.time; ringMesh.visible = ringAlive(T); slashMesh.visible = slashAlive(T); glyphMesh.visible = T < gEnd; let rb = false; for (let i = 0; i < rib.slots.length; i++) if (rib.slots[i].on || rib.slots[i].dirty) { rb = true; break; } rib.mesh.visible = rb; }
    for (let i = shocks.length - 1; i >= 0; i--) if (fx.time - shocks[i].t0 > shocks[i].dur) shocks.splice(i, 1);
    if (decalDirty && !fx.hold && fx.time - lastDecalUp > decalGap) { uploadDecals(); lastDecalUp = fx.time; } // throttled + tiled (see uploadDecals); fx.hold = true defers it (replay seeking)
  };
  /** shader warm-up switch (FightView.warm): while on, all pooled meshes are drawn once with a dead instance. fx.update(0) afterwards (or setWarm(false)) restores the idle state. */
  fx.setWarm = (on) => { WARM.on = !!on; fx.warming = !!on; if (on) { for (const m of [ringMesh, slashMesh, glyphMesh, rib.mesh]) m.visible = true; } else { ringMesh.visible = slashMesh.visible = glyphMesh.visible = rib.mesh.visible = false; fx.update(0, fx.cam); } };
  fx.flushDecals = () => { if (decalDirty) { decPending = true; uploadDecals(); lastDecalUp = fx.time; } };
  fx.stats = () => ({ drawCalls: root.children.filter((m) => m.visible).length, particlesAdd: addL.alive.length, particlesNorm: norL.alive.length, instAdd: addL.n, instNorm: norL.n, emitters: emitters.length, ribbons: rib.slots.filter((s) => s.on).length });
  fx.group = root; fx.decalTexture = decalTex; fx.decalCanvas = dcv; fx.elements = EL; fx.CELL = CELL;
  fx.setGlyphEm = (v) => { glyphUni.uEm.value = v; };
  fx.dispose = () => { scene.remove(root); root.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); atlasTex.dispose(); glyphTex.dispose(); decalTex.dispose(); };
  fx.reset = () => { addL.alive.splice(0).forEach((p) => addL.free.push(p)); norL.alive.splice(0).forEach((p) => norL.free.push(p)); emitters.length = 0; timers.length = 0; rings.length = 0; shocks.length = 0; rib.slots.forEach((s, i) => { s.on = false; s.dirty = true; }); for (const d of debris) d.on = false; ringMesh.userData.par.array.fill(-1e6); ringMesh.userData.par.needsUpdate = true; slashMesh.userData.par.array.fill(-1e6); slashMesh.userData.par.needsUpdate = true; gAttr[0].array.fill(-1e6); gAttr[0].needsUpdate = true; gEnd = -1; };
  return fx;
}
