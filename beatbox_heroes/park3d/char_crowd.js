// CHARACTER CROWD: an instanced crowd of spectators for the bar, the arena and the street. ONE draw call, ONE geometry (<= 600 tris per spectator, no skeleton).
//   const crowd = createCrowd(ctx, 120, { area: { x0, x1, z0, z1 }, facing: { x, z }, seed, keepout: [{ x0, x1, z0, z1 }] })   // or { ring: { cx, cz, r0, r1, a0, a1 } } or { positions: [[x, z, yaw?], ...] }
//   scene.add(crowd.object); each frame crowd.update(dt, t); crowd.setEnergy(0..1) (0 = standing around, 0.3 = swaying, 0.6 = clapping, 0.85 = hands up cheering); crowd.setBeat(bpm); crowd.cheer(seconds) = burst.
// All motion runs in the vertex shader (sway, hop, clap, cheer), so the CPU cost per frame is a few uniforms. Per-instance variety: skin, shirt, trousers, hair colour, hair style (crop / puff / long / cap), height, yaw.
// The geometry carries every hair style; instances hide the styles they do not use by collapsing those vertices (the tri budget counts all of them).
import { THREE } from './kit.js';

const NECK = 1.29, PIVOT_Y = 1.25 * 0.9;
const PARTS = { skin: 0, shirt: 1, hair: 2, pants: 3, fixed: 4 };
function buildSpectatorGeo() {
  const P = [], Cl = [], A = [];
  // chibi proportions like the full characters: legs and torso a little shorter, head and hair 1.3x bigger (the shoulder pivot used by the shader is PIVOT_Y)
  const T = (p) => (p[1] < NECK ? [p[0], p[1] * 0.9, p[2]] : [p[0] * 1.3, NECK * 0.9 + (p[1] - NECK) * 1.3, p[2] * 1.3]);
  const tri = (a, b, c, col, part, feat, side) => { for (const p0 of [a, b, c]) { const p = T(p0); P.push(p[0], p[1], p[2]); Cl.push(col[0], col[1], col[2]); A.push(part, feat, side, 0); } };
  const shadeC = (s, base) => (base ? [base[0] * s, base[1] * s, base[2] * s] : [s, s, s]);
  // ring loft, n sides; rings: { y, rx, rz, cx, cz, s } bottom to top. caps: 'b' | 't' | 'bt'
  function loft(rings, n, part, o) {
    o = o || {}; const feat = o.feat === undefined ? -1 : o.feat, side = o.side || 0, base = o.col || null, caps = o.caps || '';
    const pt = (r, k) => { const a = (k / n) * Math.PI * 2 + (o.a0 || 0); return [(r.cx || 0) + r.rx * Math.sin(a), r.y, (r.cz || 0) + r.rz * Math.cos(a)]; };
    for (let i = 0; i < rings.length - 1; i++) {
      const r0 = rings[i], r1 = rings[i + 1], c0 = shadeC(r0.s, base), c1 = shadeC(r1.s, base);
      for (let k = 0; k < n; k++) { const p00 = pt(r0, k), p01 = pt(r0, k + 1), p11 = pt(r1, k + 1), p10 = pt(r1, k); tri(p00, p01, p11, c0, part, feat, side); tri(p00, p11, p10, c1, part, feat, side); }
    }
    const top = rings[rings.length - 1], bot = rings[0];
    if (caps.indexOf('t') >= 0) { const c = [top.cx || 0, top.y + (o.tipT || 0), top.cz || 0], cc = shadeC(Math.min(1.1, top.s * 1.06), base); for (let k = 0; k < n; k++) tri(c, pt(top, k), pt(top, k + 1), cc, part, feat, side); }
    if (caps.indexOf('b') >= 0) { const c = [bot.cx || 0, bot.y - (o.tipB || 0), bot.cz || 0], cc = shadeC(bot.s * 0.8, base); for (let k = 0; k < n; k++) tri(c, pt(bot, k + 1), pt(bot, k), cc, part, feat, side); }
  }
  const box = (cx, cy, cz, w, h, d, col, part, feat) => {
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - h / 2, y1 = cy + h / 2, z0 = cz - d / 2, z1 = cz + d / 2, F = (a, b, c, e, s) => { const cc = shadeC(s, col); tri(a, b, c, cc, part, feat === undefined ? -1 : feat, 0); tri(a, c, e, cc, part, feat === undefined ? -1 : feat, 0); };
    F([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 1); F([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0.8); F([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], 0.88); F([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 0.88); F([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 1.08);
  };
  const shoe = [0.16, 0.14, 0.2];
  // shoes (2 boxes), legs (2 hex prisms), torso, neck, head, face, arms (swing in the shader), hair styles
  [1, -1].forEach((s) => box(s * 0.095, 0.035, 0.03, 0.105, 0.07, 0.22, shoe, PARTS.fixed));
  [1, -1].forEach((s) => loft([{ y: 0.07, rx: 0.062, rz: 0.062, cx: s * 0.095, s: 0.72 }, { y: 0.45, rx: 0.07, rz: 0.07, cx: s * 0.095, s: 0.88 }, { y: 0.82, rx: 0.085, rz: 0.085, cx: s * 0.095, s: 1 }], 6, PARTS.pants, { caps: 't' }));
  loft([{ y: 0.78, rx: 0.2, rz: 0.12, s: 0.78 }, { y: 0.98, rx: 0.17, rz: 0.11, s: 0.92 }, { y: 1.2, rx: 0.205, rz: 0.125, s: 1.02 }, { y: 1.3, rx: 0.16, rz: 0.1, s: 1.06 }], 8, PARTS.shirt, { caps: 't' });
  loft([{ y: 1.29, rx: 0.045, rz: 0.045, s: 0.8 }, { y: 1.38, rx: 0.04, rz: 0.04, s: 0.9 }], 5, PARTS.skin, {});
  loft([{ y: 1.33, rx: 0.07, rz: 0.075, cz: 0.01, s: 0.8 }, { y: 1.4, rx: 0.125, rz: 0.13, cz: 0.012, s: 0.95 }, { y: 1.5, rx: 0.15, rz: 0.15, cz: 0, s: 1.04 }, { y: 1.6, rx: 0.135, rz: 0.14, cz: -0.005, s: 1.08 }, { y: 1.67, rx: 0.07, rz: 0.08, cz: -0.01, s: 1.1 }], 8, PARTS.skin, { caps: 't' });
  [1, -1].forEach((s) => box(s * 0.055, 1.52, 0.147, 0.03, 0.036, 0.012, [0.1, 0.08, 0.14], PARTS.fixed));
  [1, -1].forEach((s) => {
    loft([{ y: 1.27, rx: 0.065, rz: 0.062, cx: s * 0.23, s: 1.0 }, { y: 1.02, rx: 0.056, rz: 0.054, cx: s * 0.23, s: 0.88 }], 6, PARTS.shirt, { side: s });
    loft([{ y: 1.02, rx: 0.046, rz: 0.044, cx: s * 0.23, s: 0.9 }, { y: 0.79, rx: 0.04, rz: 0.04, cx: s * 0.23, s: 0.82 }, { y: 0.72, rx: 0.045, rz: 0.045, cx: s * 0.23, s: 0.95 }], 6, PARTS.skin, { side: s, caps: 't', tipT: 0 });
  });
  // hair styles (feat id): 0 crop, 1 puff, 2 long, 3 cap
  loft([{ y: 1.52, rx: 0.158, rz: 0.158, cz: 0, s: 0.86 }, { y: 1.62, rx: 0.15, rz: 0.152, cz: -0.004, s: 1.0 }, { y: 1.7, rx: 0.095, rz: 0.1, cz: -0.01, s: 1.1 }], 8, PARTS.hair, { feat: 0, caps: 't', tipT: 0.015 });
  loft([{ y: 1.5, rx: 0.17, rz: 0.17, s: 0.8 }, { y: 1.64, rx: 0.215, rz: 0.215, s: 0.95 }, { y: 1.78, rx: 0.21, rz: 0.21, s: 1.05 }, { y: 1.86, rx: 0.12, rz: 0.12, s: 1.1 }], 8, PARTS.hair, { feat: 1, caps: 't' });
  loft([{ y: 1.52, rx: 0.16, rz: 0.16, s: 0.86 }, { y: 1.64, rx: 0.155, rz: 0.158, s: 1.0 }, { y: 1.71, rx: 0.1, rz: 0.1, s: 1.1 }], 8, PARTS.hair, { feat: 2, caps: 't', tipT: 0.01 });
  loft([{ y: 1.55, rx: 0.14, rz: 0.075, cz: -0.14, s: 0.8 }, { y: 1.3, rx: 0.15, rz: 0.06, cz: -0.14, s: 0.85 }, { y: 1.12, rx: 0.12, rz: 0.05, cz: -0.12, s: 0.8 }].reverse(), 6, PARTS.hair, { feat: 2, a0: 0 });
  loft([{ y: 1.55, rx: 0.16, rz: 0.16, s: 0.9 }, { y: 1.64, rx: 0.152, rz: 0.155, s: 1.0 }, { y: 1.71, rx: 0.1, rz: 0.104, s: 1.1 }], 8, PARTS.shirt, { feat: 3, caps: 't', tipT: 0.01 });
  box(0, 1.585, 0.17, 0.2, 0.014, 0.12, [0.3, 0.3, 0.34], PARTS.fixed, 3);   // cap brim (only drawn with the cap)
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(Cl), 3)); g.setAttribute('aux', new THREE.BufferAttribute(new Float32Array(A), 4));
  return g;
}
const SKINS = ['#fde7d9', '#f4d3bd', '#f0be9b', '#e6bb8a', '#d9a46e', '#c68b5e', '#b87f4e', '#a56c3f', '#8f5632', '#7d4638', '#6f3d2b', '#573220', '#412618'];
const SHIRTS = ['#e63946', '#ff6b35', '#ffb703', '#f4e04d', '#8ac926', '#2a9d8f', '#1d9bd1', '#3a5fcd', '#7b4fe0', '#c13fcf', '#ff4fa3', '#f7f2e8', '#b8b8c8', '#6b6b80', '#34303f', '#17141f', '#7a4a2a', '#2f5d3a', '#7d1f3f', '#2ee6ff'];
const PANTS = ['#3a5fcd', '#2b3f8a', '#34303f', '#17141f', '#5a5a48', '#7a4a2a', '#6b6b80', '#2f5d3a', '#f7f2e8', '#7d1f3f'];
const HAIRS = ['#1a1420', '#2a2024', '#3b2418', '#5a3520', '#a5502a', '#b89558', '#dcbc6a', '#b9b9c8', '#ff3ea5', '#2ee6ff', '#9b5cff', '#8dff4a', '#d6203f'];

const VS = {
  head: 'const float PIVOT_Y = ' + PIVOT_Y.toFixed(4) + ';\n' + 'attribute vec4 aux;\nattribute vec4 iA;\nattribute vec4 iB;\nattribute vec4 iC;\nattribute vec4 iD;\nuniform float uTime;\nuniform float uBeat;\nuniform float uEnergy;\nuniform float uBurst;\n'
    + 'vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c); }\nvec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); }\nvec3 rotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z); }\n',
  begin: `
    float feat = aux.y, side = aux.z, rnd = iC.w, ph = iB.w;
    vec3 transformed = vec3(position);
    float vis = (feat < -0.5 || abs(feat - iD.w) < 0.5) ? 1.0 : 0.0;
    transformed *= vis;
    float en = clamp(uEnergy + uBurst, 0.0, 1.0);
    float cheer = clamp((en - 0.55 - rnd * 0.3) * 4.0, 0.0, 1.0);
    float clap = clamp((en - 0.12 - rnd * 0.3) * 4.0, 0.0, 1.0) * (1.0 - cheer);
    float beat = uBeat + ph * 0.35;
    float bnc = abs(sin(beat * 3.14159));
    float hop = bnc * (0.006 + 0.07 * en) * (0.35 + 0.65 * rnd) * (0.4 + 0.9 * cheer);
    float swy = sin(uTime * (0.8 + rnd * 0.7) + ph * 6.283) * (0.01 + 0.02 * en + 0.015 * (1.0 - en) * rnd);
    if (side != 0.0) {
      vec3 pv = vec3(side * 0.23, PIVOT_Y, 0.0);
      vec3 p = transformed - pv;
      float cp = 0.5 + 0.5 * sin(beat * 6.28318);
      float wv = sin(uTime * 7.0 + ph * 9.0 + rnd * 4.0);
      p = rotX(p, -1.2 * clap - 0.15 * cheer);
      p = rotY(p, -side * (0.12 + 0.32 * cp) * clap);
      p = rotZ(p, side * (0.1 + cheer * (2.55 + 0.35 * wv) + (1.0 - clap) * 0.05 * sin(uTime + ph)));
      transformed = pv + p;
    }
    transformed.x += swy * transformed.y;
    transformed.z += 0.5 * swy * transformed.y * sin(uTime * 0.7 + ph);
    transformed.y += hop;
    transformed.y += step(1.16, position.y) * bnc * 0.012 * en;
  `,
  color: '\n    float part = aux.x;\n    vec3 baseC = part < 0.5 ? iA.rgb : part < 1.5 ? iB.rgb : part < 2.5 ? iD.rgb : part < 3.5 ? iC.rgb : vec3(1.0);\n    vColor.rgb = baseC * color.rgb;\n  ',
};

export function createCrowd(ctx, n, opts) {
  opts = opts || {}; n = Math.max(0, Math.floor(n)); let seed = (opts.seed || 1) >>> 0; const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length) % a.length], col = (h) => new THREE.Color(h);
  const geo = buildSpectatorGeo(), trisPer = geo.attributes.position.count / 3;
  const U = { uTime: { value: 0 }, uBeat: { value: 0 }, uEnergy: { value: opts.energy || 0 }, uBurst: { value: 0 } };
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.uniforms.uFill = { value: new THREE.Color(0.2, 0.15, 0.27) };
    sh.vertexShader = VS.head + sh.vertexShader.replace('#include <begin_vertex>', VS.begin).replace('#include <color_vertex>', VS.color);
    sh.fragmentShader = 'uniform vec3 uFill;\n' + sh.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n reflectedLight.indirectDiffuse += diffuseColor.rgb * uFill;');
  };
  mat.customProgramCacheKey = () => 'bbh_crowd_v1';
  const mesh = new THREE.InstancedMesh(geo, mat, n); mesh.name = 'crowd'; mesh.frustumCulled = false; mesh.castShadow = !!opts.castShadow; mesh.receiveShadow = true;
  const iA = new Float32Array(n * 4), iB = new Float32Array(n * 4), iC = new Float32Array(n * 4), iD = new Float32Array(n * 4), pos = [];
  // layout -> [x, z, yaw]
  const face = opts.facing || { x: 0, z: 1e4 }, yawTo = (x, z) => Math.atan2(face.x - x, face.z - z), keep = opts.keepout || [], blocked = (x, z) => keep.some((k) => x > k.x0 && x < k.x1 && z > k.z0 && z < k.z1);
  const layout = () => {
    const out = [];
    if (opts.positions) opts.positions.slice(0, n).forEach((p) => out.push([p[0], p[1], p[2] === undefined ? yawTo(p[0], p[1]) : p[2]]));
    else if (opts.ring) { const R = opts.ring, a0 = R.a0 === undefined ? 0 : R.a0, a1 = R.a1 === undefined ? Math.PI * 2 : R.a1; for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * ((i + rnd() * 0.6) / n), r = R.r0 + (R.r1 - R.r0) * rnd(), x = R.cx + Math.sin(a) * r, z = R.cz + Math.cos(a) * r; out.push([x, z, Math.atan2(R.cx - x, R.cz - z) + (rnd() - 0.5) * 0.3]); } }
    else {
      const A = opts.area || { x0: -5, x1: 5, z0: 0, z1: 4 }, w = A.x1 - A.x0, d = A.z1 - A.z0, cols = Math.max(1, Math.ceil(Math.sqrt((n * 1.15 * w) / Math.max(0.1, d)))), rows = Math.max(1, Math.ceil((n * 1.15) / cols)), cw = w / cols, ch = d / rows, cells = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const x = A.x0 + (c + 0.5 + (rnd() - 0.5) * 0.7) * cw, z = A.z0 + (r + 0.5 + (rnd() - 0.5) * 0.7) * ch; if (!blocked(x, z)) cells.push([x, z]); }
      for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)), t = cells[i]; cells[i] = cells[j]; cells[j] = t; }
      for (let i = 0; i < n; i++) { const c = cells[i] || [A.x0 + rnd() * w, A.z0 + rnd() * d]; out.push([c[0], c[1], yawTo(c[0], c[1]) + (rnd() - 0.5) * 0.5]); }
    }
    while (out.length < n) out.push([0, 0, 0]); return out;
  };
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), Sc = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), yBase = opts.y || 0;
  function place(list) {
    for (let i = 0; i < n; i++) { const p = list[i], sc = 0.9 + rnd() * 0.22, wid = 0.94 + rnd() * 0.14; Q.setFromAxisAngle(UP, p[2]); M.compose(V.set(p[0], yBase, p[1]), Q, Sc.set(wid * sc, sc, wid * sc)); mesh.setMatrixAt(i, M); pos[i] = [p[0], p[1], p[2]]; }
    mesh.instanceMatrix.needsUpdate = true;
  }
  function colours() {
    for (let i = 0; i < n; i++) {
      const sk = col(pick(opts.skins || SKINS)), sh = col(pick(opts.shirts || SHIRTS)), pa = col(pick(opts.pants || PANTS)), ha = col(pick(opts.hairs || HAIRS)), v = 0.92 + rnd() * 0.16;
      iA.set([sk.r * v, sk.g * v, sk.b * v, 1], i * 4); iB.set([sh.r, sh.g, sh.b, rnd()], i * 4); iC.set([pa.r, pa.g, pa.b, rnd()], i * 4);
      const hs = rnd(), style = hs < 0.3 ? 0 : hs < 0.5 ? 1 : hs < 0.75 ? 2 : 3; iD.set([ha.r, ha.g, ha.b, style], i * 4);
    }
    [['iA', iA], ['iB', iB], ['iC', iC], ['iD', iD]].forEach(([k, a]) => { geo.setAttribute(k, new THREE.InstancedBufferAttribute(a, 4)); });
  }
  place(layout()); colours(); mesh.count = n; if (n) { try { mesh.computeBoundingSphere(); } catch (e) { /* older three */ } }
  const object = new THREE.Group(); object.name = 'crowd_group'; object.add(mesh);
  const S = { energy: opts.energy || 0, target: opts.energy || 0, bpm: opts.bpm || 100, beat: 0, burst: 0, burstT: 0, time: 0 };
  const api = {
    object, mesh, count: n, trisPer, tris: trisPer * n, draws: 1, positions: pos,
    setEnergy(e) { S.target = Math.max(0, Math.min(1, e)); return api; }, setBeat(bpm) { S.bpm = bpm || 0; return api; },
    cheer(sec) { S.burst = 1; S.burstT = sec === undefined ? 1.6 : sec; return api; },
    update(dt, t) { dt = Math.min(dt || 0, 0.1); S.time = t === undefined ? S.time + dt : t; S.energy += (S.target - S.energy) * (1 - Math.exp(-3 * dt)); S.beat += dt * S.bpm / 60; if (S.burstT > 0) { S.burstT -= dt; if (S.burstT <= 0) S.burst = 0; } else if (S.burst > 0) S.burst = Math.max(0, S.burst - dt); U.uTime.value = S.time; U.uBeat.value = S.beat; U.uEnergy.value = S.energy; U.uBurst.value = S.burst * 0.9; return api; },
    // move everybody (keeps the colours): list [[x, z, yaw?], ...]
    setPositions(list) { place(list.map((p, i) => [p[0], p[1], p[2] === undefined ? yawTo(p[0], p[1]) : p[2]])); return api; },
    dispose() { if (object.parent) object.parent.remove(object); geo.dispose(); mat.dispose(); mesh.dispose(); },
  };
  api.state = S; return api;
}
