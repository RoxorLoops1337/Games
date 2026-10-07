// TUNER ROAD (Tuner Artist): the big glowing pitch ladder on the back wall. Target notes are chunky crystal bars that scroll toward the NOW line,
// the sung pitch is a luminous orb on the ladder (colour + size = cents error), with a trail, hit sparkles and ping rings.
import { THREE, flatMat, canvasTex, clamp, lerp } from './kit.js';
import { place, pbox, glowPaint, glowMaterial, glowTex } from './mg_tuner_set.js';
import { NOTE, midiName } from './mg_tuner_logic.js';

export const LAD = { w: 3.9, h: 3.2, y0: 1.65, z: -3.5, tilt: 0.22, nowX: -1.05, spacing: 1.18 };
const C = (h) => new THREE.Color(h);
export const noteHue = (m) => new THREE.Color().setHSL((((m % 12) + 12) % 12) / 12 * 0.92 + 0.02, 0.92, 0.56);
const additive = (c, o) => new THREE.MeshBasicMaterial(Object.assign({ color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }, o || {}));
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const COL = { lime: C('#7dff4a').multiplyScalar(1.0), yel: C('#ffe03a').multiplyScalar(1.0), org: C('#ff7a2d').multiplyScalar(1.0), pink: C('#ff2e7a').multiplyScalar(1.05), ghost: C('#8a78e8').multiplyScalar(0.7), white: C('#ffffff').multiplyScalar(1.2) };
// cents error to orb colour: lime in tune, yellow at the edge (50), orange, then hot pink when far off
export function errColor(abs, out) { const a = abs; if (a < 25) return out.copy(COL.lime).lerp(COL.yel, a / 25 * 0.35); if (a < 50) return out.copy(COL.lime).lerp(COL.yel, 0.35 + (a - 25) / 25 * 0.65); if (a < 100) return out.copy(COL.yel).lerp(COL.org, (a - 50) / 50); return out.copy(COL.org).lerp(COL.pink, clamp((a - 100) / 100, 0, 1)); }

// crystal bar: hexagonal prism with pointed ends, flattened in depth. Vertex colours are a white to grey gradient, the material colour carries the note hue.
function crystalGeo(len, hgt) {
  const parts = [], r = hgt / 2, body = new THREE.CylinderGeometry(r, r, len - r * 1.3, 6, 1, true); body.rotateZ(Math.PI / 2);
  const capL = new THREE.ConeGeometry(r, r * 1.3, 6, 1, false); capL.rotateZ(Math.PI / 2); capL.translate(-(len - r * 1.3) / 2 - r * 0.65, 0, 0);
  const capR = new THREE.ConeGeometry(r, r * 1.3, 6, 1, false); capR.rotateZ(-Math.PI / 2); capR.translate((len - r * 1.3) / 2 + r * 0.65, 0, 0);
  const Ld = new THREE.Vector3(-0.35, 0.8, 0.55).normalize();
  [body, capL, capR].forEach((g0) => { const g = g0.index ? g0.toNonIndexed() : g0; g.scale(1, 1, 0.62); g.computeVertexNormals(); const p = g.attributes.position, nn = g.attributes.normal, n = p.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i += 3) { const nx = nn.getX(i), ny = nn.getY(i), nz = nn.getZ(i), k = 0.5 + 0.62 * Math.max(0, nx * Ld.x + ny * Ld.y + nz * Ld.z) + (i % 6 ? 0.03 : 0); for (let j = 0; j < 3 && i + j < n; j++) { const t = clamp(p.getY(i + j) / hgt + 0.5, 0, 1); a[(i + j) * 3] = a[(i + j) * 3 + 1] = a[(i + j) * 3 + 2] = k * (0.9 + 0.1 * t); } } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(g); });
  const pos = [], colr = []; parts.forEach((g) => { pos.push(...g.attributes.position.array); colr.push(...g.attributes.color.array); }); const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); out.computeVertexNormals(); return out;
}

export function buildRoad(ctx, tier) {
  const g = new THREE.Group(); g.name = 'road'; g.rotation.x = -LAD.tilt; g.position.z = LAD.z + (LAD.y0 + LAD.h + 0.3) * Math.sin(LAD.tilt);
  const lowQ = tier === 'low', NMAX = 8;
  let lo = 60, hi = 72, nR = 15, base = 58.5;
  const yOf = (m) => LAD.y0 + (clamp(m, base + 0.5, base + nR - 0.5) - base) / nR * LAD.h;
  // ---- panel: one slab, front face is a canvas drawn per range (bands, lines, note names)
  const cw = 1024, ch = Math.round(1024 * LAD.h / LAD.w), cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const cx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(LAD.w, LAD.h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.2) })); face.position.set(0, LAD.y0 + LAD.h / 2, 0.0); g.add(face);
  function drawPanel() {
    const bh = ch / nR; cx.clearRect(0, 0, cw, ch); const gr = cx.createLinearGradient(0, 0, 0, ch); gr.addColorStop(0, '#1c1448'); gr.addColorStop(1, '#0f0b2a'); cx.fillStyle = gr; cx.fillRect(0, 0, cw, ch);
    for (let i = 0; i < nR; i++) { const m = base + 0.5 + i, y = ch - (i + 1) * bh, pc = ((m % 12) + 12) % 12, sharp = [1, 3, 6, 8, 10].includes(pc), isC = pc === 0;
      cx.fillStyle = sharp ? 'rgba(10,6,30,0.55)' : 'rgba(110,90,230,0.14)'; cx.fillRect(0, y, cw, bh);
      cx.fillStyle = isC ? 'rgba(46,230,255,0.75)' : sharp ? 'rgba(90,70,170,0.35)' : 'rgba(150,130,255,0.5)'; cx.fillRect(0, y + bh - 2, cw, isC ? 4 : 2);
      cx.font = '800 ' + Math.round(bh * 0.5) + 'px "Trebuchet MS",system-ui,sans-serif'; cx.textBaseline = 'middle'; cx.textAlign = 'left'; cx.fillStyle = isC ? '#9ff4ff' : sharp ? 'rgba(160,140,230,0.5)' : 'rgba(215,205,255,0.85)'; cx.fillText(midiName(m), 14, y + bh * 0.5 + 1);
      cx.textAlign = 'right'; cx.fillText(midiName(m), cw - 14, y + bh * 0.5 + 1); }
    cx.strokeStyle = 'rgba(120,100,230,0.18)'; cx.lineWidth = 2; for (let x = 0; x <= 8; x++) { cx.beginPath(); cx.moveTo(x * cw / 8, 0); cx.lineTo(x * cw / 8, ch); cx.stroke(); }
    tex.needsUpdate = true;
  }
  // frame: neon border + slab behind
  const fr = [], fg = [], T = 0.09, W = LAD.w, Hh = LAD.h, cy = LAD.y0 + Hh / 2;
  fr.push(place(pbox(W + 0.5, Hh + 0.5, 0.12, '#14102e'), 0, cy, -0.09));
  [[0, cy + Hh / 2 + T / 2, W + T * 2, T], [0, cy - Hh / 2 - T / 2, W + T * 2, T], [-W / 2 - T / 2, cy, T, Hh], [W / 2 + T / 2, cy, T, Hh]].forEach(([x, y, w, h], i) => fg.push(glowPaint(place(pbox(w, h, 0.06, '#fff'), x, y, 0.03), i % 3 === 0 ? '#12c4ff' : '#ff2a95', 1.25)));
  const frame = new THREE.Mesh(mergeG(fr), flatMat()); frame.receiveShadow = false; g.add(frame); g.add(new THREE.Mesh(mergeG(fg), glowMaterial()));
  function mergeG(arr) { const pos = [], col = []; arr.forEach((a0) => { const a = a0.index ? a0.toNonIndexed() : a0; pos.push(...a.attributes.position.array); col.push(...a.attributes.color.array); }); const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); o.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); o.computeVertexNormals(); return o; }

  // ---- NOW line + in tune strip
  const nowX = LAD.nowX;
  const nowGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.34, Hh), additive(C('#2ee6ff'), { opacity: 0.1 })); nowGlow.position.set(nowX, cy, 0.04); g.add(nowGlow);
  const nowCore = new THREE.Mesh(new THREE.BoxGeometry(0.03, Hh, 0.03), new THREE.MeshBasicMaterial({ color: C('#38d8ff').multiplyScalar(0.95), toneMapped: false })); nowCore.position.set(nowX, cy, 0.05); g.add(nowCore);
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(LAD.w, LAD.h / nR), additive(C('#8dff5a'), { opacity: 0.0 })); strip.position.set(0, cy, 0.03); g.add(strip);
  const nowTag = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 3), new THREE.MeshBasicMaterial({ color: C('#38d8ff').multiplyScalar(1.0), toneMapped: false })); nowTag.rotation.z = Math.PI; nowTag.position.set(nowX, LAD.y0 + Hh + 0.2, 0.05); g.add(nowTag);

  // ---- crystals
  const cGeo = crystalGeo(0.86, 0.34), crystals = [];
  for (let i = 0; i < NMAX; i++) {
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff, toneMapped: false });
    const m = new THREE.Mesh(cGeo, mat); m.castShadow = false; m.receiveShadow = false; m.position.z = 0.16; m.visible = false; g.add(m);
    const fill = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.07, 0.05), new THREE.MeshBasicMaterial({ color: C('#d6ff9a').multiplyScalar(2.2), toneMapped: false })); fill.position.set(0, 0, 0.14); fill.visible = false; m.add(fill);
    crystals.push({ hue: new THREE.Color(), m, mat, fill, y: 0, x: 0, sc: 1, shake: 0, note: -1, state: 'up', flash: 0 });
  }
  function setCrystalNote(c, note) { if (c.note === note) return; c.note = note; const col = noteHue(note); c.hue.copy(col); }
  // ear mode labels
  const mkLab = (t, c0) => { const tx = canvasTex(64, 64, (c, w, h) => { c.fillStyle = 'rgba(15,10,40,0.0)'; c.fillRect(0, 0, w, h); c.font = '900 46px "Trebuchet MS",system-ui,sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = c0; c.shadowColor = '#000'; c.shadowBlur = 6; c.fillText(t, w / 2, h / 2 + 3); }); const m = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), new THREE.MeshBasicMaterial({ map: tx, transparent: true, toneMapped: false, depthWrite: false })); m.visible = false; g.add(m); return m; };
  const labs = [mkLab('1', '#ffffff'), mkLab('2', '#ffffff')];

  // ---- orb, halo, trail
  const orbMat = new THREE.MeshBasicMaterial({ color: COL.ghost.clone(), toneMapped: false }), orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), orbMat); orb.position.set(nowX, cy, 0.34); g.add(orb);
  const backMat = new THREE.MeshBasicMaterial({ color: C('#0b0722'), transparent: true, opacity: 0.6, depthWrite: false }), back = new THREE.Mesh(new THREE.CircleGeometry(1, 18), backMat); back.position.set(nowX, cy, 0.27); g.add(back);
  const haloMat = additive(COL.ghost.clone(), { opacity: 0.3, map: glowTex() }), halo = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), haloMat); halo.position.set(nowX, cy, 0.3); g.add(halo);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: C('#ffffff').multiplyScalar(1.4), toneMapped: false })); core.position.set(nowX, cy, 0.4); g.add(core);
  const orbLight = new THREE.PointLight('#8dff5a', 0, 3.2, 1.8); orbLight.position.set(nowX, cy, 0.9); if (!lowQ) g.add(orbLight);
  const NT = lowQ ? 14 : 26, trail = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ toneMapped: false }), NT); trail.frustumCulled = false; trail.instanceMatrix.setUsage(THREE.DynamicDrawUsage); g.add(trail);
  const th = []; for (let i = 0; i < NT; i++) th.push({ y: cy, c: new THREE.Color(), on: 0 }); let tAcc = 0; const TRAIL_T = 0.05, TRAIL_V = 0.72;
  // ---- sparkles (instanced tetrahedra) and ping rings
  const NS = lowQ ? 24 : 56, spk = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ toneMapped: false }), NS); spk.frustumCulled = false; spk.instanceMatrix.setUsage(THREE.DynamicDrawUsage); g.add(spk);
  const sp = []; for (let i = 0; i < NS; i++) sp.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s: 0.05, c: new THREE.Color(), rot: 0, vr: 0 }); let spI = 0;
  const pings = []; for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 28), additive(C('#2ee6ff'), { opacity: 0 })); m.visible = false; g.add(m); pings.push({ m, t: 9, col: C('#2ee6ff') }); }
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), e4 = new THREE.Euler(), tmpC = new THREE.Color();
  function burst(x, y, n, cols, speed) {
    for (let k = 0; k < n; k++) { const p = sp[spI]; spI = (spI + 1) % NS; const a = Math.random() * Math.PI * 2, v = (speed || 1.6) * (0.4 + Math.random() * 0.8); p.x = x; p.y = y; p.z = 0.4; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v + 0.9; p.vz = (Math.random() - 0.3) * 1.2; p.max = p.life = 0.7 + Math.random() * 0.6; p.s = 0.04 + Math.random() * 0.06; p.c.copy(cols[k % cols.length]); p.rot = Math.random() * 6; p.vr = (Math.random() - 0.5) * 12; }
  }
  function ping(x, y, col) { const p = pings.find((q) => q.t >= 1) || pings[0]; p.t = 0; p.x = x; p.y = y; p.col.copy(col); p.m.visible = true; }

  let ladLo = null, pos = 0, orbY = cy, orbV = 0, lastNote = -1, flashT = 0, prevFb = null, prevPhase = '', pingT = 0;
  function setRange(range) {
    const r = range === 'ear' ? [55, 73] : range === 'lower' ? [48, 60] : [60, 72]; lo = r[0]; hi = r[1]; nR = hi - lo + 3; base = lo - 1.5; drawPanel(); ladLo = range;
  }
  setRange('higher');

  // main per frame update. V: { S: logic state, active: voice present, level, t }
  function update(dt, t, V) {
    const S = V.S, mic = S.mode === 'mic', ear = S.mode === 'ear', playing = S.state === 'play' || S.state === 'done';
    const cur = clamp(S.round - 1, 0, 99); pos += ((S.state === 'done' ? S.rounds : cur) - pos) * (1 - Math.exp(-dt * 4.5)); if (!playing) pos = 0;
    // crystals
    for (let i = 0; i < NMAX; i++) {
      const c = crystals[i]; let show = false;
      if (mic && playing && i < S.rounds) {
        const note = S.targets[i], dx = (i - pos) * LAD.spacing, x = nowX + dx, isCur = i === cur && S.state === 'play', log = S.log[i];
        setCrystalNote(c, note); c.x = x; c.y = yOf(note);
        const edge = ss(LAD.w / 2 + 0.25, LAD.w / 2 - 0.35, Math.abs(x - 0.1)); // pop in and out at the panel edges
        const state = log ? (log.ok ? 'hit' : 'miss') : isCur ? 'cur' : 'up'; c.state = state;
        const sc = (state === 'cur' ? 1.12 : state === 'hit' ? 0.8 : state === 'miss' ? 0.7 : 0.88) * edge; c.sc += (sc - c.sc) * (1 - Math.exp(-dt * 10));
        c.m.position.set(x, c.y, 0.16); c.m.scale.setScalar(Math.max(0.001, c.sc)); show = edge > 0.02;
        const lis = isCur && S.phase === 'ref', pul = 0.5 + 0.5 * Math.sin(t * (lis ? 14 : 5));
        const em = state === 'cur' ? (lis ? 0.8 + 0.4 * pul : 0.8 + 0.15 * pul) : state === 'hit' ? 0.85 : state === 'miss' ? 0.05 : 0.38;
        c.mat.color.copy(c.hue).multiplyScalar(0.42 + em * 0.55 + c.flash * 0.5); c.flash = Math.max(0, c.flash - dt * 2.2);
        c.m.rotation.z = state === 'miss' ? 0.22 : 0.025 * Math.sin(t * 2 + i); c.m.rotation.y = (state === 'cur' ? 0.15 * Math.sin(t * 1.7) : 0); if (state === 'miss') c.hue.lerp(C('#6a5a86'), 0.1);
        c.fill.visible = isCur && S.phase === 'sing'; if (c.fill.visible) { const p = clamp(S.hold / 0.9, 0.001, 1); c.fill.scale.x = p; c.fill.position.x = -0.37 * (1 - p); }
      } else if (ear && playing && i < 2) {
        const ph = S.phase, shown = ph === 'earB' || ph === 'ask' || ph === 'fb', note = i === 0 ? S.earA : S.earB, rev = ph === 'fb' ? 1 : 0;
        setCrystalNote(c, note); const mid = (yOf(S.earA) + yOf(S.earB)) / 2, ny = LAD.y0 + Hh / 2;
        const ty = lerp(ny, yOf(note), rev); c.y += (ty - c.y) * (1 - Math.exp(-dt * 8)); const x = nowX + 0.55 + i * 1.45; c.x = x;
        const on = i === 0 ? ph !== 'idle' : shown; const sc = on ? (((ph === 'earA' && i === 0) || (ph === 'earB' && i === 1)) ? 1.2 : 0.95) : 0.001; c.sc += (sc - c.sc) * (1 - Math.exp(-dt * 10));
        c.m.position.set(x, c.y, 0.16); c.m.scale.setScalar(Math.max(0.001, c.sc)); show = c.sc > 0.02; c.state = 'ear';
        const playingNow = (ph === 'earA' && i === 0) || (ph === 'earB' && i === 1); c.mat.color.copy(c.hue).multiplyScalar(0.42 + (playingNow ? 0.6 : 0.2) + c.flash * 0.5); c.flash = Math.max(0, c.flash - dt * 2.2); c.m.rotation.set(0, 0.12 * Math.sin(t * 1.5 + i), 0.02 * Math.sin(t * 2 + i)); void mid;
        c.fill.visible = false; labs[i].visible = show; labs[i].position.set(x, c.y + 0.36, 0.3);
      }
      c.m.visible = show; if (!(ear && playing && i < 2) && i < 2) labs[i].visible = false;
    }
    // in tune strip + ping rings + NOW line
    const sing = mic && S.phase === 'sing', tgtY = mic && playing ? yOf(S.target) : cy;
    strip.position.y += (tgtY - strip.position.y) * (1 - Math.exp(-dt * 12)); strip.material.opacity = sing ? 0.12 + 0.05 * Math.sin(t * 6) : 0;
    nowGlow.material.opacity = 0.16 + 0.1 * Math.sin(t * 3) + (V.level || 0) * 0.3; nowTag.position.y = LAD.y0 + Hh + 0.2 + 0.03 * Math.sin(t * 4);
    if (mic && S.phase === 'ref' && prevPhase !== 'ref') { pingT = 0; } prevPhase = S.phase; if (mic && S.phase === 'ref') { pingT -= dt; if (pingT <= 0) { pingT = 0.38; ping(nowX, yOf(S.target), noteHue(S.target).multiplyScalar(2)); } }
    if (ear && (S.phase === 'earA' || S.phase === 'earB') && S.rt < 0.05) ping(nowX + 0.55 + (S.phase === 'earA' ? 0 : 1.45), cy, C('#2ee6ff').multiplyScalar(2));
    for (const p of pings) { if (p.t >= 1) { p.m.visible = false; continue; } p.t += dt * 1.6; const k = clamp(p.t, 0, 1); p.m.position.set(p.x, p.y, 0.3); p.m.scale.setScalar(0.2 + k * 0.9); p.m.material.opacity = (1 - k) * 0.7; p.m.material.color.copy(p.col); }
    // orb: height from the sung pitch, colour and size from the cents error
    let oy, abs = 0, voiced = false;
    if (mic && S.phase === 'sing' && S.cents !== null) { voiced = true; abs = Math.abs(S.cents); oy = yOf(S.target + S.cents / 100); }
    else if (mic && playing) oy = yOf(S.target) ; else oy = cy;
    const follow = voiced ? 16 : (mic && playing && S.phase !== 'sing' ? 6 : 3); orbY += (oy - orbY) * (1 - Math.exp(-dt * follow));
    const ghost = !voiced, wob = voiced ? Math.sin(t * 22) * Math.min(1, abs / 150) * 0.03 : 0;
    const target = mic && playing ? (ghost ? tmpC.copy(COL.ghost) : errColor(abs, tmpC)) : tmpC.copy(COL.ghost);
    orbMat.color.lerp(target, 1 - Math.exp(-dt * 14)); haloMat.color.copy(orbMat.color);
    const inT = voiced && abs < 50, sz = voiced ? 0.13 + 0.15 * clamp(abs / 150, 0, 1) + (inT ? 0.02 * Math.sin(t * 18) : 0) : (mic && playing && S.phase === 'sing' ? 0.09 : 0.07 + 0.012 * Math.sin(t * 4));
    orb.scale.setScalar(sz + (V.level || 0) * (voiced ? 0.05 : 0)); orb.position.set(nowX + wob, orbY, 0.34); orb.rotation.y += dt * 2; orb.rotation.x += dt * 1.3;
    core.position.set(nowX + wob, orbY, 0.4); core.scale.setScalar(voiced ? sz * 0.42 : 0.0001); core.rotation.y = t * 3; back.position.set(nowX, orbY, 0.27); back.scale.setScalar(sz * 1.5 + 0.02); backMat.opacity = voiced ? 0.55 : 0.2; halo.position.set(nowX, orbY, 0.3); halo.scale.setScalar(sz * (inT ? 3.4 : 2.8) + 0.04 * Math.sin(t * 9)); haloMat.opacity = voiced ? (inT ? 0.5 : 0.45) : 0.22;
    orbLight.position.set(nowX, orbY, 0.9); orbLight.color.copy(orbMat.color).multiplyScalar(0.5); orbLight.intensity = voiced ? 5 + (inT ? 3 : 0) : 0.4;
    // trail
    tAcc += dt; while (tAcc >= TRAIL_T) { tAcc -= TRAIL_T; for (let i = NT - 1; i > 0; i--) { th[i].y = th[i - 1].y; th[i].on = th[i - 1].on; th[i].c.copy(th[i - 1].c); } th[0].y = orbY; th[0].on = voiced ? 1 : 0; th[0].c.copy(orbMat.color); }
    for (let i = 0; i < NT; i++) { const age = i * TRAIL_T + tAcc, k = 1 - age / (NT * TRAIL_T), s = th[i].on * Math.max(0, k) * (0.055 + sz * 0.22); v3.set(nowX - age * TRAIL_V, th[i].y, 0.3); s3.setScalar(Math.max(0.0001, s)); m4.compose(v3, q4.identity(), s3); trail.setMatrixAt(i, m4); tmpC.copy(th[i].c).multiplyScalar(0.55 + 0.45 * k); trail.setColorAt(i, tmpC); }
    trail.instanceMatrix.needsUpdate = true; if (trail.instanceColor) trail.instanceColor.needsUpdate = true;
    // sparkles
    for (let i = 0; i < NS; i++) { const p = sp[i]; if (p.life > 0) { p.life -= dt; p.vy -= 2.4 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += p.vr * dt; } const k = p.life > 0 ? clamp(p.life / p.max, 0, 1) : 0; v3.set(p.x, p.y, p.z); e4.set(p.rot, p.rot * 0.7, p.rot * 1.3); q4.setFromEuler(e4); s3.setScalar(Math.max(0.0001, p.s * (0.2 + k))); m4.compose(v3, q4, s3); spk.setMatrixAt(i, m4); tmpC.copy(p.c).multiplyScalar(k > 0 ? 1 : 0); spk.setColorAt(i, tmpC); }
    spk.instanceMatrix.needsUpdate = true; if (spk.instanceColor) spk.instanceColor.needsUpdate = true;
    // reactions to the logic events
    if (S.fb !== prevFb) { prevFb = S.fb; if (S.fb) { const okc = S.fbOk, c0 = mic ? crystals[cur] : crystals[1]; if (c0) { if (okc) { c0.flash = 1.4; const cols = [COL.lime, COL.yel, COL.white, noteHue(c0.note).multiplyScalar(2)]; burst(c0.x, c0.y, lowQ ? 14 : 30, cols, 2.0); ping(c0.x, c0.y, COL.lime); } else { c0.flash = 0.0; burst(c0.x, c0.y, 8, [COL.pink, COL.ghost], 0.8); } } } }
  }
  const api = { group: g, update, setRange, burst, ping, yOf, orb, crystals, get lo() { return lo; }, get hi() { return hi; }, setQuality(q) { orbLight.visible = q !== 'low'; }, nowX };
  void NOTE; return api;
}
