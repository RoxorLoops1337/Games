// World module: the CREATOR stage (SHELL). A 3 m vinyl turntable under three ring lights that change colour with the active tab, a curved cyc backdrop with a neon name tag,
// floating notes and sparkles when the look changes, camera presets per tab through controls.js orbit mode (drag spins, pinch zooms). Used for NEW GAME and the home wardrobe.
//   ctx.creator = { setTab(id), setShot('full'|'head'|'torso'|'legs'|'feet'), setName(str), burst(strength), pose(clip, opts), setInset(px), shots, tabs, stats() }
//   The player (host) is the hero, so world.setLook(look) is the only call needed for a live preview. Budget: ~12k tris incl. the hero. No em dashes.
import { THREE, rng, flatMat } from './kit.js';
import { Buf, col } from './terrain_util.js';
import { glyphAtlas, vinylTex, nameTex, makeParticles } from './w_creator_fx.js';

const NOP = () => {};
const TAB_COL = {
  body: ['#35f2e0', '#a86bff', '#ff3ea5'], skin: ['#ffb36a', '#ff3ea5', '#ffe14d'], hair: ['#ff3ea5', '#a86bff', '#35f2e0'], face: ['#ffe14d', '#ff3ea5', '#35f2e0'], top: ['#a86bff', '#35f2e0', '#ff3ea5'],
  bottom: ['#3d8bff', '#35f2e0', '#ffe14d'], shoes: ['#9dff4a', '#35f2e0', '#ff3ea5'], hat: ['#ff8a3d', '#ffe14d', '#a86bff'], glasses: ['#35f2e0', '#ffe14d', '#ff3ea5'], extra: ['#ffd23f', '#ff3ea5', '#a86bff'], full: ['#35f2e0', '#ff3ea5', '#ffe14d'],
};
const TAB_SHOT = { body: 'full', skin: 'full', hair: 'head', face: 'head', top: 'torso', bottom: 'legs', shoes: 'feet', hat: 'head', glasses: 'head', extra: 'torso', full: 'full' };
const RINGS = [{ x: -1.3, y: 1.75, z: -1.3, r: 0.85 }, { x: 1.35, y: 1.55, z: -1.5, r: 0.8 }, { x: 0.1, y: 3.0, z: -2.3, r: 1.0 }];

export default function create(ctx, args) {
  args = args || {}; ctx.embedded = true; ctx.todInit = 0.97;
  const low = ctx.quality === 'low', group = new THREE.Group(); group.name = 'creator_world';
  const cA = new THREE.Color(TAB_COL.body[0]), cB = new THREE.Color(TAB_COL.body[1]), cC = new THREE.Color(TAB_COL.body[2]), tA = cA.clone(), tB = cB.clone(), tC = cC.clone();
  // ---- cyc backdrop: a big open cylinder seen from inside, vertical gradient from a coloured horizon glow to deep indigo, soft light bars, plus a floor disc with radial glow
  const U = { uA: { value: cA }, uB: { value: cB }, uC: { value: cC }, uT: { value: 0 }, uBeat: { value: 0 } };
  const cyc = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.5, 9, 48, 1, true), new THREE.ShaderMaterial({ uniforms: U, side: THREE.BackSide, depthWrite: true, fog: false, toneMapped: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uA, uB, uC; uniform float uT, uBeat; varying vec3 vP; void main(){ float h = clamp((vP.y + 4.5) / 9.0, 0.0, 1.0); float ang = atan(vP.x, vP.z); vec3 top = vec3(0.07, 0.05, 0.2); vec3 mid = mix(vec3(0.1, 0.07, 0.26), uB * 0.3, 0.45); vec3 low = uA * 0.30 + uC * 0.05 + vec3(0.04, 0.02, 0.1);'
      + ' vec3 c = mix(low, mid, smoothstep(0.0, 0.32, h)); c = mix(c, top, smoothstep(0.25, 0.95, h));'
      + ' float bars = pow(0.5 + 0.5 * sin(ang * 9.0 + uT * 0.25), 6.0) * (1.0 - smoothstep(0.0, 0.8, h)); c += uC * bars * 0.16 * (1.0 + uBeat * 0.8);'
      + ' float stripes = smoothstep(0.96, 1.0, sin(h * 60.0 - uT * 0.4)) * 0.025 * (1.0 - h); c += uB * stripes;'
      + ' gl_FragColor = vec4(c, 1.0); }' }));
  cyc.position.y = 3.5; cyc.name = 'creator_cyc'; group.add(cyc);
  const floorMat = new THREE.ShaderMaterial({ uniforms: U, depthWrite: true, fog: false, toneMapped: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uA, uB, uC; uniform float uT, uBeat; varying vec3 vP; void main(){ float r = length(vP.xz); vec3 base = mix(vec3(0.05, 0.04, 0.14), uA * 0.22 + uB * 0.06, smoothstep(7.5, 2.2, r) * 0.5); float rings = smoothstep(0.93, 1.0, sin(r * 5.0 - uT * 0.5)) * 0.1 * smoothstep(8.0, 2.0, r); float glow = exp(-pow((r - 1.62) / 0.55, 2.0)) * (0.6 + 0.4 * uBeat); vec3 c = base + uC * rings * 0.6 + uA * glow * 0.16; float edge = smoothstep(7.5, 6.2, r); gl_FragColor = vec4(mix(vec3(0.07, 0.05, 0.2), c, edge), 1.0); }' });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(7.5, 48).rotateX(-Math.PI / 2), floorMat); floor.position.y = -0.01; floor.name = 'creator_floor'; group.add(floor);
  // ---- the turntable: a 3 m vinyl with a lit side, rim ring and notches; the record spins slowly
  const tt = new THREE.Group(); tt.name = 'turntable'; group.add(tt);
  const vt = vinylTex(), top = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.16, 40), [new THREE.MeshLambertMaterial({ color: '#2a2250', flatShading: true }), new THREE.MeshLambertMaterial({ map: vt, color: '#cfc6ff' }), new THREE.MeshLambertMaterial({ color: '#17122e' })]);
  top.position.y = 0.08; top.receiveShadow = true; top.castShadow = false; tt.add(top);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.035, 6, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: cA.clone().multiplyScalar(2.4), toneMapped: false })); rim.position.y = 0.17; group.add(rim);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(1.62, 1.7, 0.1, 40, 1, true), new THREE.MeshBasicMaterial({ color: '#17122e' })); skirt.position.y = 0.05; group.add(skirt);
  { const B = new Buf({ rng: rng(2) }); for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; B.box(Math.sin(a) * 1.47, 0.16, Math.cos(a) * 1.47, 0.05, 0.012, i % 6 ? 0.1 : 0.2, col(i % 6 ? '#8d86d0' : '#ffe14d'), { ry: a, base: 0 }); } tt.add(new THREE.Mesh(B.geometry(false), flatMat())); }
  // ---- the three ring lights: emissive torus + soft disc + stand + a real light of the same colour
  const rings = RINGS.map((d, i) => {
    const g = new THREE.Group(); g.position.set(d.x, d.y, d.z);
    const mat = new THREE.MeshBasicMaterial({ color: cA.clone().multiplyScalar(2.6), toneMapped: false }), ring = new THREE.Mesh(new THREE.TorusGeometry(d.r, 0.055, 8, 40), mat); g.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(d.r, 32), new THREE.MeshBasicMaterial({ color: cA.clone(), transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })); disc.position.z = -0.01; /* disc off */
    const halo = new THREE.Mesh(new THREE.RingGeometry(d.r * 0.96, d.r * 1.7, 40), new THREE.MeshBasicMaterial({ color: cA.clone(), transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })); halo.position.z = -0.02; /* halo off */
    g.lookAt(0, 1.0, 0); group.add(g);
    const st = new Buf({ rng: rng(10 + i) }); st.cyl(d.x, 0, d.z, 0.16, 0.16, 0.06, 8, col('#2a2540')); st.box(d.x, 0.06, d.z, 0.04, d.y - d.r * 0.2, 0.04, col('#3a3555'), { base: 0 }); st.box(d.x, d.y - d.r - 0.06, d.z, 0.1, 0.1, 0.1, col('#2a2540'), { base: 0 }); group.add(new THREE.Mesh(st.geometry(false), flatMat()));
    let light = null; if (!low) { light = new THREE.PointLight(cA.clone(), 5.5, 7, 2); light.position.set(d.x * 0.85, d.y, d.z * 0.85); group.add(light); }
    return { g, mat, disc: disc.material, halo: halo.material, light, k: 0 };
  });
  // ---- neon name tag behind the hero (billboards toward the camera, always on the far side), notes and sparkles
  const tagTex = nameTex(args.name || '', '#35f2e0'), tagMat = new THREE.MeshBasicMaterial({ map: tagTex, transparent: true, depthWrite: false, toneMapped: false, color: '#ffffff' }); let tagName = args.name || '';
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), tagMat); tag.position.set(0, 3.25, -4.6); tag.renderOrder = -2; group.add(tag);
  const atlas = glyphAtlas(), parts = makeParticles(low ? 90 : 220, atlas); group.add(parts.points);
  // ---- light shaft from above (soft cone)
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 1.75, 5.4, 28, 1, true).translate(0, 2.7, 0), new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false,
    vertexShader: 'varying float vH; varying vec3 vN; varying vec3 vV; void main(){ vH = position.y / 5.4; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uA; uniform float uBeat; varying float vH; varying vec3 vN; varying vec3 vV; void main(){ float e = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); float f = e * (1.0 - vH) * (0.16 + 0.1 * uBeat); gl_FragColor = vec4(mix(uA, vec3(1.0), 0.45), f); }' }));
  shaft.rotation.z = Math.PI; shaft.position.y = 5.5; group.add(shaft); void shaft;
  ctx.scene.add(group);

  const terrain = { group: new THREE.Group(), bounds: { minX: -2, maxX: 2, minZ: -2, maxZ: 2 }, blocked: () => false, heightAt: (x, z) => (Math.hypot(x, z) < 1.45 ? 0.16 : 0), pathDist: () => 1e9, keepout: () => false, paths: [], spotDefs: [],
    anchors: { start: { x: 0, z: 0, rot: 0 }, lamps: [] }, camera: { mode: 'orbit', dist: 8, pitch: 10, yaw: 0, fov: 30 } };

  // ---- state + api
  const st = { phase: null, t: 0, tab: 'body', pose: 'idle', beat: 0, w: null, ready: false, inset: 0, spawnT: 0, bpm: 84, nextNote: 1, hop: 0, flash: 0 };
  const tmp = new THREE.Vector3(), camDir = new THREE.Vector3(), hc = new THREE.Color();
  function retag() { const t2 = nameTex(tagName, '#' + tA.getHexString()); tagMat.map.dispose(); tagMat.map = t2; tagMat.needsUpdate = true; }
  const api = ctx.creator = {
    tabs: Object.keys(TAB_COL), shots: Object.keys(TAB_SHOT),
    setTab(id, ms) { const k = TAB_COL[id] ? id : 'body'; st.tab = k; tA.set(TAB_COL[k][0]); tB.set(TAB_COL[k][1]); tC.set(TAB_COL[k][2]); retag(); const w = st.w; if (w && w.controls && w.controls.setShot) w.controls.setShot(TAB_SHOT[k], ms === undefined ? 700 : ms); return true; },
    setShot(name, ms) { const w = st.w; return !!(w && w.controls && w.controls.setShot && w.controls.setShot(name, ms === undefined ? 700 : ms)); },
    setName(s) { s = String(s || ''); if (s === tagName) return; tagName = s; retag(); },
    pose(clip, o) { st.pose = clip; const w = st.w; if (w && w.player) w.player.play(clip, Object.assign({ bpm: st.bpm, amp: 1 }, o || {})); st.hop = 1; return true; },
    setInset(px) { st.inset = Math.max(0, +px || 0); const w = st.w; if (w && w.controls && w.controls.setViewInset) w.controls.setViewInset({ bottom: st.inset }); },
    burst(strength) {
      const n = Math.round((strength === undefined ? 1 : strength) * (low ? 14 : 26)), h = (st.w && st.w.player && st.w.player.height) || 1.6, cols = [cA, cB, cC, hc.set('#fff6e8')];
      for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, sp = 0.6 + Math.random() * 1.6, c = cols[i % 4]; parts.add({ x: Math.cos(a) * 0.25, y: h * (0.3 + Math.random() * 0.7), z: Math.sin(a) * 0.25 + 0.1, vx: Math.cos(a) * sp, vy: 0.4 + Math.random() * 1.6, vz: Math.sin(a) * sp * 0.6, life: 0.8 + Math.random() * 0.6, grav: 1.6, size: 0.12 + Math.random() * 0.2, r: c.r, g: c.g, b: c.b, cell: i % 5 === 0 ? 1 : 0 }); }
      for (let i = 0; i < (low ? 2 : 5); i++) { const a = Math.random() * 6.283, c = cols[i % 3]; parts.add({ x: Math.cos(a) * 0.55, y: h * 0.5, z: Math.sin(a) * 0.55, vx: Math.cos(a) * 0.15, vy: 0.5 + Math.random() * 0.35, vz: Math.sin(a) * 0.15, life: 1.8 + Math.random() * 0.8, size: 0.34, r: c.r, g: c.g, b: c.b, cell: 2 + (i & 1) }); }
      st.flash = 1; st.hop = 1; return n;
    },
    setBpm(b) { if (b > 30 && b < 260) st.bpm = b; },
    feed(b) { b = +b; st.phase = b > 0 && isFinite(b) ? b : null; },
    stats() { return { tab: st.tab, pose: st.pose, ready: st.ready, ring: '#' + cA.getHexString() }; },
  };
  function cast() {
    const w = ctx.host && ctx.host.world; if (!w || !w.player) return; st.w = w; st.ready = true;
    w.setBeat = (b) => { api.feed(b); };
    w.player.object.position.set(0, 0.16, 0); w.player.play(st.pose, { bpm: st.bpm }); w.player.setMood && w.player.setMood('happy', true);
    w.lighting && w.lighting.group && w.lighting.group.traverse((o) => { if (o.isHemisphereLight) st.hemi = o; else if (o.isDirectionalLight) { if (o.castShadow) st.sun = o; else st.rim = o; } });
    if (w.controls && w.controls.setMode) { w.controls.setMode('orbit', { shot: 'full', auto: 12, fov: 38, fb: 0.5, ms: 0 }); w.controls.setViewInset && w.controls.setViewInset({ bottom: st.inset }); }
  }
  ctx.events.on('worldReady', cast);

  function update(dt, t) {
    st.t = t; if (!st.ready) cast();
    if (st.hemi) st.hemi.intensity *= 0.5; if (st.rim) st.rim.intensity *= 0.6; if (st.sun) st.sun.intensity *= 0.8; ctx.renderer.toneMappingExposure *= 0.9;
    const k = 1 - Math.exp(-dt * 5.5); cA.lerp(tA, k); cB.lerp(tB, k); cC.lerp(tC, k);
    const ph = st.phase !== null ? st.phase : t * st.bpm / 60, beatF = ph - Math.floor(ph), pulse = Math.exp(-beatF * 4.5) * 0.6; if (st.w && st.w.lighting && st.w.lighting.setBeat) st.w.lighting.setBeat(pulse * 0.5); U.uT.value = t; U.uBeat.value = pulse; st.flash = Math.max(0, st.flash - dt * 3.2); st.hop = Math.max(0, st.hop - dt * 2.4);
    tt.rotation.y += dt * 0.28; rim.material.color.copy(cA).multiplyScalar(0.95 + 0.2 * pulse + 0.2 * st.flash);
    const cols = [cA, cB, cC];
    for (let i = 0; i < rings.length; i++) { const r = rings[i], c = cols[i]; r.mat.color.copy(c).multiplyScalar(1.0 + 0.25 * pulse + 0.3 * st.flash); r.disc.color.copy(c); r.disc.opacity = 0.07 + 0.05 * pulse + 0.12 * st.flash; r.halo.color.copy(c); r.halo.opacity = 0.04 + 0.03 * pulse + 0.07 * st.flash; if (r.light) { r.light.color.copy(c); r.light.intensity = (i === 2 ? 7 : 5.5) * (0.85 + 0.35 * pulse + 0.9 * st.flash); } }
    // idle sparkles and a note now and then
    st.spawnT -= dt; if (st.spawnT <= 0) { st.spawnT = low ? 0.5 : 0.22; const a = Math.random() * 6.283, c = cols[(Math.random() * 3) | 0]; parts.add({ x: Math.cos(a) * (0.7 + Math.random() * 1.1), y: 0.2 + Math.random() * 1.8, z: Math.sin(a) * (0.7 + Math.random() * 1.1), vx: 0, vy: 0.12 + Math.random() * 0.2, vz: 0, life: 1.8 + Math.random(), size: 0.1 + Math.random() * 0.12, r: c.r, g: c.g, b: c.b, cell: 0 }); }
    st.nextNote -= dt; if (st.nextNote <= 0) { st.nextNote = 1.6 + Math.random() * 1.6; const a = Math.random() * 6.283, c = cols[(Math.random() * 3) | 0]; parts.add({ x: Math.cos(a) * 1.0, y: 0.6, z: Math.sin(a) * 1.0, vx: 0, vy: 0.32, vz: 0, life: 3.2, size: 0.3, r: c.r, g: c.g, b: c.b, cell: 2 + (Math.random() < 0.5 ? 0 : 1) }); }
    if (st.w && st.phase !== null) st.w.player.play(st.pose, { bpm: st.bpm, phase: st.phase });
    parts.update(dt, t);
    ctx.renderer.getDrawingBufferSize(tmp); parts.U.uScale.value = tmp.y * 0.5 / Math.tan(ctx.camera.fov * Math.PI / 360);
    // name tag: always on the far side of the hero, facing the camera
    camDir.copy(ctx.camera.position).setY(0); const l = camDir.length() || 1; camDir.multiplyScalar(-4.4 / l); tag.position.set(camDir.x, 3.1, camDir.z); tag.lookAt(ctx.camera.position.x, 3.1, ctx.camera.position.z); tagMat.opacity = 0.95;
    // the hero hops a little when the look changes (the clip keeps playing)
    if (st.w && st.w.player && st.hop > 0) st.w.player.object.position.y = 0.16 + Math.abs(Math.sin(st.hop * Math.PI)) * 0.08;
    else if (st.w && st.w.player) st.w.player.object.position.y = 0.16;
  }
  return { terrain, flora: { group: new THREE.Group(), update: NOP }, npcSpecs: [], profile: 'out', camera: { fov: 30, near: 0.2, far: 90 }, update, setBeat(b) { api.feed(b); }, dispose() { ctx.creator = null; } };
}
