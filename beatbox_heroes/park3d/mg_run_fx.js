// RUN mini game effects: particle pools (dust, sparks, leaves), speed streaks (camera space), pigeons that scatter, milestone gates with an energy fountain,
// and the sweet-spot ring on the track. Everything is in the root-local space (runner moves along +z).
import { THREE, rng as mkRng, box, cyl, paint, nonIndexed, mergeGeometries, canvasTex, flatMat } from './kit.js';
import { xf } from './flora_common.js';
const C = (h) => new THREE.Color(h);
const strip = (g) => { const n = g.index ? g.toNonIndexed() : g; const o = new THREE.BufferGeometry(); o.setAttribute('position', n.attributes.position); o.setAttribute('normal', n.attributes.normal); o.setAttribute('color', n.attributes.color); return o; };

// ---------------------------------------------------------------- particles
// one Points object per blend mode. CPU simulated, attributes: position, aSize (metres), aCol, aAlpha.
export function makeParticles(parent, max, additive) {
  const pos = new Float32Array(max * 3), size = new Float32Array(max), col = new Float32Array(max * 4);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1)); geo.setAttribute('aCol', new THREE.BufferAttribute(col, 4));
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms: { uPx: { value: 900 } },
    vertexShader: 'attribute float aSize; attribute vec4 aCol; uniform float uPx; varying vec4 vC; void main(){ vC = aCol; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = max(1.0, uPx * 1.1 * aSize / max(0.3, -mv.z)); }',
    fragmentShader: 'varying vec4 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; float a = (1.0 - smoothstep(0.55, 1.0, r)) * vC.a; if (a < 0.01) discard; gl_FragColor = vec4(vC.rgb * (' + (additive ? 'a' : '1.0') + '), a); }' });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.name = additive ? 'run_sparks' : 'run_dust'; parent.add(pts);
  const P = []; for (let i = 0; i < max; i++) P.push({ life: 0, max: 1, x: 0, y: -50, z: 0, vx: 0, vy: 0, vz: 0, g: 0, drag: 0, s0: 0, s1: 0, c: new THREE.Color(), a: 0, sway: 0, ph: 0 });
  let head = 0;
  return {
    mat, pts,
    emit(o) { const p = P[head]; head = (head + 1) % max; p.life = p.max = o.life || 1; p.x = o.x; p.y = o.y; p.z = o.z; p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0; p.g = o.g || 0; p.drag = o.drag || 0; p.s0 = o.s0 || 0.2; p.s1 = o.s1 === undefined ? p.s0 : o.s1; p.c.set(o.c || '#ffffff'); p.a = o.a === undefined ? 1 : o.a; p.sway = o.sway || 0; p.ph = Math.random() * 6.28; },
    update(dt) {
      for (let i = 0; i < max; i++) {
        const p = P[i]; if (p.life <= 0) { if (size[i] !== 0) { size[i] = 0; col[i * 4 + 3] = 0; pos[i * 3 + 1] = -50; } continue; }
        p.life -= dt; const u = 1 - Math.max(0, p.life) / p.max, d = Math.exp(-p.drag * dt);
        p.vx *= d; p.vz *= d; p.vy = p.vy * d - p.g * dt; p.x += (p.vx + Math.sin(p.ph + u * 9) * p.sway) * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y < 0.02 && p.g > 0) { p.y = 0.02; p.vy *= -0.2; p.vx *= 0.6; p.vz *= 0.6; }
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; size[i] = p.s0 + (p.s1 - p.s0) * u; const fade = u < 0.12 ? u / 0.12 : 1 - (u - 0.12) / 0.88;
        col[i * 4] = p.c.r; col[i * 4 + 1] = p.c.g; col[i * 4 + 2] = p.c.b; col[i * 4 + 3] = p.a * Math.max(0, fade);
      }
      geo.attributes.position.needsUpdate = geo.attributes.aSize.needsUpdate = geo.attributes.aCol.needsUpdate = true;
    },
    setPixelHeight(h) { mat.uniforms.uPx.value = h; },
  };
}

// ---------------------------------------------------------------- speed streaks (children of the camera)
export function makeStreaks(camera, count) {
  const g = new THREE.BufferGeometry(), P = [], A = [], R = mkRng(77);
  for (let i = 0; i < count; i++) {
    const ang = R() * Math.PI * 2, rad = 0.85 + R() * 1.5, z = -(2 + R() * 14), len = 0.8 + R() * 2.2, ph = R(), w = 0.012 + R() * 0.012, cx = Math.cos(ang) * rad * 1.0, cy = Math.sin(ang) * rad * 1.5;
    // a thin quad (two triangles) lying in the camera's x/y direction of its radial position; ends are encoded in aT (0 head, 1 tail)
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    const v = [[cx - nx * w, cy - ny * w, 0], [cx + nx * w, cy + ny * w, 0], [cx + nx * w, cy + ny * w, 1], [cx - nx * w, cy - ny * w, 0], [cx + nx * w, cy + ny * w, 1], [cx - nx * w, cy - ny * w, 1]];
    for (const q of v) { P.push(q[0], q[1], z); A.push(q[2], len, ph); }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aT', new THREE.Float32BufferAttribute(A, 3));
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, uniforms: { uOff: { value: 0 }, uAmt: { value: 0 }, uCol: { value: new THREE.Color('#ffe2b0') } },
    vertexShader: 'attribute vec3 aT; uniform float uOff, uAmt; varying float vA; void main(){ vec3 p = position; float cyc = 16.0; float z = mod(p.z - uOff * (0.6 + aT.z) + 2.0, -cyc) - 0.5; p.z = z - aT.x * aT.y * (0.4 + uAmt * 1.4); vA = (1.0 - aT.x) * smoothstep(-16.0, -6.0, z) * (1.0 - smoothstep(-2.4, -1.2, z)) * uAmt; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
    fragmentShader: 'uniform vec3 uCol; varying float vA; void main(){ gl_FragColor = vec4(uCol * vA * 0.9, vA * 0.8); }' });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 20; m.name = 'run_streaks'; camera.add(m);
  return { mesh: m, update(dist, amt) { mat.uniforms.uOff.value = dist; mat.uniforms.uAmt.value = amt; m.visible = amt > 0.02; } };
}

// ---------------------------------------------------------------- pigeons
function pigeonGeo(pose) { // pose: 0 folded, 1 wings up, 2 wings down
  const parts = [], grey = '#8d90ab', dark = '#6a6c88', neck = '#5fb0a0', belly = '#b8b4cc';
  const body = new THREE.IcosahedronGeometry(0.12, 0); body.scale(0.95, 0.85, 1.55); parts.push(paint(nonIndexed(body), grey)); parts[0].translate(0, 0.17, 0);
  const chest = new THREE.IcosahedronGeometry(0.085, 0); chest.scale(1, 0.95, 1); const ch = paint(nonIndexed(chest), neck); ch.translate(0, 0.21, 0.13); parts.push(ch);
  const head = new THREE.IcosahedronGeometry(0.055, 0); const hd = paint(nonIndexed(head), '#7d7f9d'); hd.translate(0, 0.29, 0.2); parts.push(hd);
  const beak = new THREE.ConeGeometry(0.018, 0.06, 4); beak.rotateX(Math.PI / 2); const bk = paint(nonIndexed(beak), '#ffb067'); bk.translate(0, 0.285, 0.265); parts.push(bk);
  const tail = new THREE.BoxGeometry(0.1, 0.02, 0.16); const tl = paint(nonIndexed(tail), dark); tl.translate(0, 0.17, -0.22); parts.push(tl);
  const eye = new THREE.BoxGeometry(0.1, 0.012, 0.012); void eye;
  if (pose === 0) { for (const s of [-1, 1]) { const w = new THREE.BoxGeometry(0.03, 0.07, 0.22); const wg = paint(nonIndexed(w), dark); wg.translate(s * 0.115, 0.185, -0.02); parts.push(wg); } }
  else for (const s of [-1, 1]) { const w = new THREE.BoxGeometry(0.34, 0.012, 0.18); w.translate(s * 0.17, 0, 0); const wg = paint(nonIndexed(w), s > 0 ? dark : grey); wg.rotateZ(s * (pose === 1 ? 0.95 : -0.55)); wg.translate(s * 0.08, 0.2, -0.01); parts.push(wg); }
  for (const s of [-1, 1]) { const l = paint(nonIndexed(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 3)), '#e0809a'); l.translate(s * 0.04, 0.045, 0.02); parts.push(l); }
  void belly; return mergeGeometries(parts.map((g) => strip(g)));
}

export function makePigeons(parent, flocks, perFlock) {
  const geos = [pigeonGeo(0), pigeonGeo(1), pigeonGeo(2)], mat = flatMat(), R = mkRng(31), all = [];
  for (let f = 0; f < flocks; f++) for (let i = 0; i < perFlock; i++) {
    const m = new THREE.Mesh(geos[0], mat); m.castShadow = false; m.scale.setScalar(2.6); m.name = 'run_pigeon'; m.frustumCulled = false; parent.add(m);
    all.push({ m, flock: f, state: 'idle', x: 0, z: 0, vx: 0, vy: 0, vz: 0, y: 0, t: 0, ox: (R() - 0.5) * 2.4, oz: (R() - 0.5) * 2.2, ph: R() * 6, flapT: 0 });
  }
  const flockZ = new Array(flocks).fill(0);
  function place(f, z) { flockZ[f] = z; for (const p of all) if (p.flock === f) { p.state = 'idle'; p.x = p.ox * 0.9; p.z = z + p.oz; p.y = 0; p.t = 0; p.m.visible = true; p.m.rotation.set(0, R() * 6.28, 0); p.m.position.set(p.x, 0, p.z); p.m.geometry = geos[0]; } }
  return {
    all, place, flockZ,
    scattered: 0,
    update(dt, rz, rx, speed, onScatter) {
      for (const p of all) {
        if (p.state === 'idle') {
          p.ph += dt * 5; const peck = Math.max(0, Math.sin(p.ph * 0.9 + p.flock)) ** 6; p.m.rotation.x = peck * 0.55; p.m.position.set(p.x, 0, p.z);
          const dz = p.z - rz, dx = p.x - rx;
          if (dz < 4.8 + speed * 0.25 && dz > -2) { p.state = 'fly'; p.t = 0; const side = p.x > rx ? 1 : -1; p.vx = side * (2.2 + R() * 3.2); p.vy = 4.2 + R() * 3; p.vz = speed * (0.9 + R() * 0.5) + 2; p.y = 0; p.m.rotation.x = 0; p.delay = R() * 0.12; if (onScatter) onScatter(p.x, p.z); this.scattered++; void dx; }
        } else if (p.state === 'fly') {
          if (p.delay > 0) { p.delay -= dt; continue; }
          p.t += dt; p.flapT += dt * 22; p.vy -= 3.4 * dt; p.vy = Math.max(p.vy, 0.8 * (p.t < 1.8 ? 1 : 0)); p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          p.m.geometry = geos[1 + (Math.floor(p.flapT) & 1)]; p.m.position.set(p.x, p.y, p.z); p.m.rotation.set(-0.35, Math.atan2(p.vx, p.vz), -Math.sign(p.vx) * 0.5 * Math.min(1, p.t * 2), 'YXZ'); if (p.t > 3.2) { p.state = 'gone'; p.m.visible = false; }
        }
      }
      for (let f = 0; f < flocks; f++) if (flockZ[f] < rz - 14) place(f, rz + 60 + f * 38 + R() * 25);
    },
  };
}

// ---------------------------------------------------------------- milestone gate (pooled)
export function makeGate(parent) {
  const g = new THREE.Group(), parts = [], glow = [], iron = '#3a3550', stone = '#d9cfe6';
  for (const s of [-1, 1]) { parts.push(cyl(0.16, 0.2, 4.4, 6, stone, s * 2.5, 2.2, 0)); parts.push(box(0.5, 0.2, 0.5, iron, s * 2.5, 0.1, 0)); glow.push(box(0.1, 4.0, 0.1, '#9dff4a', s * 2.5, 2.3, 0.2)); glow.push(cyl(0.2, 0.2, 0.18, 6, '#ffe14d', s * 2.5, 4.5, 0)); }
  parts.push(box(5.4, 0.3, 0.4, iron, 0, 4.45, 0)); glow.push(box(5.1, 0.09, 0.09, '#9dff4a', 0, 4.28, 0.22)); glow.push(box(5.1, 0.07, 0.07, '#ffe14d', 0, 4.62, 0.22));
  const lit = new THREE.Mesh(mergeGeometries(parts.map(strip)), flatMat()); lit.castShadow = false; lit.name = 'run_gate';
  const gl = new THREE.Mesh(mergeGeometries(glow.map(strip)), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })); gl.name = 'run_gate_glow';
  const tex = canvasTex(512, 160, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = 'rgba(23,16,43,0.88)'; c.beginPath(); c.roundRect ? c.roundRect(6, 8, w - 12, h - 16, 26) : c.rect(6, 8, w - 12, h - 16); c.fill(); c.lineWidth = 6; c.strokeStyle = '#9dff4a'; c.stroke(); c.font = '900 84px "Trebuchet MS",system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#ffe14d'; c.fillText('+1 ENERGY', w / 2, h / 2 + 4); });
  const ban = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 1.1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, side: THREE.DoubleSide })); ban.position.set(0, 3.5, 0.02); ban.name = 'run_gate_banner';
  const ban2 = new THREE.Mesh(ban.geometry, ban.material); ban2.position.set(0, 3.5, -0.02); ban2.rotation.y = Math.PI; ban2.name = 'run_gate_banner'; ban.material.side = THREE.FrontSide;
  g.add(lit, gl, ban, ban2); g.visible = false; parent.add(g); g.userData = { z: 0, active: false, passed: false };
  return g;
}

// ---------------------------------------------------------------- sweet spot ring
export function makeRing(parent) {
  const g = new THREE.Group(); g.name = 'run_ring';
  const mk = (geo, o) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial(Object.assign({ transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }, o))); m.rotation.x = -Math.PI / 2; m.position.y = 0.05; return m; };
  const outer = mk(new THREE.RingGeometry(0.98, 1.2, 40), { opacity: 0.95 }), disc = mk(new THREE.CircleGeometry(0.98, 40), { opacity: 0.2 }), inner = mk(new THREE.RingGeometry(0.62, 0.66, 40), { opacity: 0.35 }); inner.visible = false;
  disc.position.y = 0.04; inner.position.y = 0.045;
  const chev = []; for (let i = 0; i < 2; i++) { const sh = new THREE.Shape(); sh.moveTo(-0.55, 0); sh.lineTo(0, 0.34); sh.lineTo(0.55, 0); sh.lineTo(0.55, -0.12); sh.lineTo(0, 0.2 - 0.12); sh.lineTo(-0.55, -0.12); const m = mk(new THREE.ShapeGeometry(sh), { opacity: 0.6, side: THREE.DoubleSide }); m.rotation.x = Math.PI / 2; chev.push(m); g.add(m); }
  g.add(outer, disc, inner); parent.add(g);
  return { group: g, outer, disc, inner, chev };
}
