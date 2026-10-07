// LIGHTING module (Lighting and VFX Artist). Owns: sky gradient dome, sun (directional, soft shadows that follow the player), hemisphere + rim lights, fog,
// tone mapping, post (fx_post.js), lamp light cones, god rays, fireflies, floating music notes (fx_vfx.js).
// CONTRACT: buildLighting(ctx, terrain) -> { setTimeOfDay('day'|'dusk'|'night'|0..1 [, instant]), update(dt, t), render() (replaces renderer.render), resize(w,h,dpr),
//   setQuality('low'|'med'|'high'), setMusic(bool), follow(object3D|null), getState(), stats(), group }
// Time of day number: 0 = day, 0.5 = dusk (GOLDEN HOUR, the default look), 1 = night. Changes blend smoothly (pass true as 2nd arg to jump).
// HOOKS for others: materials with userData.todTint = "body" (colour multiplier follows the time of day) or "lit" (window layer, dim by day, hot at night); meshes named skyline / skyline_windows get it automatically.
//   Also: give an emissive material `material.userData.nightGlow = maxEmissiveIntensity` (windows, neon signs) and it is driven 0..max by the time of day.
// ctx.events emits 'timeofday' with the shared state object {night, lamp, windows, neon, ...} while it changes.
import { THREE, box, merged, flatMat, mesh } from './kit.js';
import { buildVFX, interiorSource, LIGHT_KIND } from './fx_vfx.js';
import { createPost } from './fx_post.js';

const C = (h) => new THREE.Color(h);
// keyframes: day, dusk, night
const KF = [
  { elev: 50, az: 70, sunI: 2.5, sunCol: C('#fff0d2'), hemiI: 1.6, hemiSky: C('#a9c3f4'), hemiGround: C('#caa27c'), rimI: 0.35, rimCol: C('#ffd0c0'), fogNear: 22, fogFar: 110, fog: C('#c6d9f3'), exposure: 0.98,
    zen: C('#4f86d6'), up: C('#82abe8'), mid: C('#9fc2ee'), glow: C('#ffe9c0'), disc: C('#fff3d0'), discSize: 0.034, discI: 1.0, glowI: 0.5, streak: 0.0, stars: 0, lamp: 0.0, neon: 0.0, stage: 0.2, windows: 0.0, ray: 0.05, fly: 0.0, dust: 0.5, lampLight: 0,
    bloom: 0.3, bloomThr: 1.15, vig: 0.4, sat: 1.06, skyTint: C('#d4dfff'), gShadow: C('#ece4ff'), gHigh: C('#fff4e0') },
  { elev: 21, az: 78, sunI: 3.3, sunCol: C('#ffc783'), hemiI: 1.65, hemiSky: C('#a49cf2'), hemiGround: C('#a17fbe'), rimI: 1.1, rimCol: C('#ff8fb0'), fogNear: 14, fogFar: 80, fog: C('#e49fb2'), exposure: 1.02,
    zen: C('#4a4c9a'), up: C('#9a66a8'), mid: C('#ee8a98'), glow: C('#ffb067'), disc: C('#ffe2a8'), discSize: 0.045, discI: 1.4, glowI: 1.0, streak: 0.7, stars: 0.1, lamp: 0.72, neon: 0.75, stage: 0.8, windows: 0.65, ray: 0.2, fly: 0.45, dust: 1.0, lampLight: 10,
    bloom: 0.3, bloomThr: 1.25, vig: 0.55, sat: 1.22, skyTint: C('#ffe9f2'), gShadow: C('#dccbff'), gHigh: C('#fff3e6') },
  { elev: 36, az: 15, sunI: 0.95, sunCol: C('#8fa4ff'), hemiI: 1.9, hemiSky: C('#6460c4'), hemiGround: C('#6a52a0'), rimI: 0.9, rimCol: C('#ff5fb0'), fogNear: 12, fogFar: 70, fog: C('#41366f'), exposure: 1.22,
    zen: C('#1b1950'), up: C('#2f2b74'), mid: C('#5c3b88'), glow: C('#7f78d8'), disc: C('#e2e8ff'), discSize: 0.03, discI: 1.1, glowI: 0.5, streak: 0.0, stars: 1, lamp: 1.0, neon: 1.0, stage: 1.0, windows: 1.0, ray: 0.035, fly: 1.0, dust: 0.25, lampLight: 14,
    bloom: 0.7, bloomThr: 0.9, vig: 0.6, sat: 1.1, skyTint: C('#37337a'), gShadow: C('#d8d0ff'), gHigh: C('#ffe4d0') },
];

// INTERIOR keyframes (terrain.interior): same keys as the park plus window/practical-light levels. az is an offset from the mean window azimuth (so the key always enters through the windows).
// The sky dome is hidden; fog is off; `fog` is the backdrop colour seen through windows and around the dollhouse; zen/mid are the pane gradient (top/bottom).
const KFI = [
  { elev: 56, az: 0, sunI: 3.4, sunCol: C('#fff1d6'), hemiI: 2.7, hemiSky: C('#c3d3ff'), hemiGround: C('#d8ae82'), rimI: 1.0, rimCol: C('#b7a6ff'), fogNear: 400, fogFar: 800, fog: C('#4f8df5'), exposure: 0.96,
    zen: C('#6fa4ec'), up: C('#82abe8'), mid: C('#cfe3fb'), glow: C('#ffe9c0'), disc: C('#fff3d0'), discSize: 0.034, discI: 1.0, glowI: 0.5, streak: 0.0, stars: 0, lamp: 0.2, neon: 0.35, stage: 0.5, windows: 0.12, ray: 0.55, fly: 0.0, dust: 1.0, lampLight: 0,
    bloom: 0.16, bloomThr: 1.15, vig: 0.35, sat: 1.08, skyTint: C('#f0f4ff'), gShadow: C('#ece4ff'), gHigh: C('#fff4e0'),
    tilt: 0.5, lvLamp: 0.3, lvNeon: 0.4, lvTv: 0.55, lvFridge: 0.5, patch: 0.9, paneA: 0.62, moteBase: 0.2, ptI: 0.45, moon: 0 },
  { elev: 30, az: 22, sunI: 2.3, sunCol: C('#ffb36e'), hemiI: 2.35, hemiSky: C('#ac96ee'), hemiGround: C('#cc8e68'), rimI: 1.2, rimCol: C('#b08cff'), fogNear: 400, fogFar: 800, fog: C('#6c4585'), exposure: 1.02,
    zen: C('#5b4fb0'), up: C('#9a66a8'), mid: C('#ff9c6e'), glow: C('#ffb067'), disc: C('#ffe2a8'), discSize: 0.045, discI: 1.4, glowI: 1.0, streak: 0.7, stars: 0.1, lamp: 0.85, neon: 0.8, stage: 0.8, windows: 0.8, ray: 0.6, fly: 0.0, dust: 1.0, lampLight: 10,
    bloom: 0.26, bloomThr: 1.12, vig: 0.5, sat: 1.1, skyTint: C('#ffd6c4'), gShadow: C('#e0ccff'), gHigh: C('#fff0dc'),
    tilt: 0.55, lvLamp: 0.9, lvNeon: 0.85, lvTv: 0.9, lvFridge: 0.55, patch: 0.8, paneA: 0.45, moteBase: 0.3, ptI: 1.0, moon: 0 },
  { elev: 52, az: -28, sunI: 1.35, sunCol: C('#7f98ff'), hemiI: 1.6, hemiSky: C('#5a5cc8'), hemiGround: C('#6a4a8a'), rimI: 1.0, rimCol: C('#a07cff'), fogNear: 400, fogFar: 800, fog: C('#15153d'), exposure: 1.18,
    zen: C('#101650'), up: C('#2f2b74'), mid: C('#2b3b8c'), glow: C('#7f78d8'), disc: C('#e2e8ff'), discSize: 0.03, discI: 1.1, glowI: 0.5, streak: 0.0, stars: 1, lamp: 1.0, neon: 1.0, stage: 1.0, windows: 1.0, ray: 0.5, fly: 0.0, dust: 0.6, lampLight: 14,
    bloom: 0.42, bloomThr: 1.0, vig: 0.62, sat: 1.12, skyTint: C('#37337a'), gShadow: C('#d4ccff'), gHigh: C('#ffe4d0'),
    tilt: 0.55, lvLamp: 1.0, lvNeon: 1.0, lvTv: 1.0, lvFridge: 0.6, patch: 1.0, paneA: 0.55, moteBase: 0.3, ptI: 1.1, moon: 1 },
];
const keysOf = (kf) => { const N = [], Cc = []; for (const k in kf[0]) (typeof kf[0][k] === 'number' ? N : Cc).push(k); return { N, C: Cc }; };
const ss = (f) => f * f * (3 - 2 * f);
const TIER = { low: { shadow: 512, lights: 1 }, med: { shadow: 1024, lights: 2 }, high: { shadow: 2048, lights: 3 } };
const TIER_IN = { low: { shadow: 512, lights: 1 }, med: { shadow: 1024, lights: 2 }, high: { shadow: 2048, lights: 3 } };

export function buildLighting(ctx, terrain) {
  const { renderer, scene, camera } = ctx; const anchors = terrain.anchors || {}; const IN = terrain.interior === true;
  const KS = IN ? KFI : KF, { N: NUM, C: COL } = keysOf(KS); const TR = IN ? TIER_IN : TIER;
  const group = new THREE.Group(); group.name = 'lighting';
  const S = { sunDir: new THREE.Vector3(), sunCol: new THREE.Color(), tod: 0.5, night: 0, lamp: 0, neon: 0, stage: 0, windows: 0, ray: 0, fly: 0, dust: 0, bloom: 0.3, bloomThr: 1.25, vig: 0.5, sat: 1.1, gShadow: new THREE.Color(), gHigh: new THREE.Color(), tilt: 1, lv: new THREE.Vector4(), shaftCol: new THREE.Color(), paneTop: new THREE.Color(), paneBot: new THREE.Color(), shaft: 0, patch: 0, paneA: 0.3, moteBase: 0.2, elev: 0.8, interior: IN };
  const cur = {}; NUM.forEach((k) => { cur[k] = 0; }); COL.forEach((k) => { cur[k] = new THREE.Color(); });
  const fog = new THREE.Fog('#e49fb2', 14, 80); scene.fog = fog; scene.background = new THREE.Color('#e49fb2');
  renderer.info.autoReset = false;

  // ---------- lights ----------
  const sun = new THREE.DirectionalLight('#ffc783', 3); sun.castShadow = true; const sh = sun.shadow; sh.camera.left = -15; sh.camera.right = 15; sh.camera.top = 15; sh.camera.bottom = -15; sh.camera.near = 1; sh.camera.far = 110;
  sh.bias = -0.0005; sh.normalBias = 0.03; sh.radius = 3; sh.mapSize.set(1024, 1024); group.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight('#9a8ee0', '#c47c58', 1.9); group.add(hemi);
  const rim = new THREE.DirectionalLight('#ff8fb0', 1.1); rim.castShadow = false; group.add(rim, rim.target);
  const vfx = buildVFX(ctx, terrain, S); group.add(vfx.group);
  // ---------- interior: azimuth from the windows, one fitted shadow map, up to 3 real practical lights near the player ----------
  const inWin = IN ? vfx.windowList : [], inLights = IN ? vfx.lightList : []; let azW = 45 * Math.PI / 180; const ptSlots = [];
  if (IN) {
    if (inWin.length) { let mx = 0, mz = 0; inWin.forEach((w) => { mx += w.nx; mz += w.nz; }); if (Math.hypot(mx, mz) > 0.05) azW = Math.atan2(-mx, -mz); }
    const b = terrain.bounds || { minX: -7.5, maxX: 7.5, minZ: -5.5, maxZ: 5.5 }, R = Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) * 0.5 + 0.4, cxm = (b.minX + b.maxX) / 2, czm = (b.minZ + b.maxZ) / 2;
    sh.camera.left = -R; sh.camera.right = R; sh.camera.top = R; sh.camera.bottom = -R; sh.camera.near = 1; sh.camera.far = 60 + R; sh.camera.updateProjectionMatrix(); sh.radius = 4; sh.normalBias = 0.035; sh.bias = -0.0004; S.inCtr = new THREE.Vector3(cxm, 0, czm);
    for (let i = 0; i < 3; i++) { const p = new THREE.PointLight('#ffcf8a', 0, 9, 2); group.add(p); ptSlots.push({ p, idx: -1, w: 0 }); }
    if (vfx.fixtures) group.add(buildTestRoom(terrain, inWin)); // stub flat: stand-in room so the light can be developed alone
  }
  const lampLights = []; // up to 3 real point lights on the lamps nearest the plaza (fountain), no shadows
  if (!IN) { const f = anchors.fountain || { x: 0, z: 0 }; const L = vfx.lamps.slice().sort((a, b) => Math.hypot(a.x - f.x, a.z - f.z) - Math.hypot(b.x - f.x, b.z - f.z)).slice(0, 3);
    L.forEach((l) => { const p = new THREE.PointLight('#ffc46b', 0, 11, 2); p.position.set(l.x, l.y - 0.3, l.z); group.add(p); lampLights.push(p); }); }

  // ---------- sky dome (1 draw call, follows the camera, drawn at the far plane) ----------
  const skyU = { cZen: { value: cur.zen }, cUp: { value: cur.up }, cMid: { value: cur.mid }, cHor: { value: cur.fog }, cGlow: { value: cur.glow }, cDisc: { value: cur.disc }, uSunDir: { value: S.sunDir }, uDisc: { value: 0.04 }, uDiscI: { value: 1 }, uGlowI: { value: 1 }, uStreak: { value: 0 }, uStars: { value: 0 }, uTime: { value: 0 } };
  const skyMat = new THREE.ShaderMaterial({ uniforms: skyU, depthWrite: false, depthTest: true, side: THREE.BackSide, fog: false, vertexShader: `varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 cZen, cUp, cMid, cHor, cGlow, cDisc, uSunDir; uniform float uDisc, uDiscI, uGlowI, uStreak, uStars, uTime; varying vec3 vD;
      float h1(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      void main(){ vec3 d = normalize(vD); float h = max(d.y, 0.0);
        vec3 col = mix(cHor, cMid, smoothstep(0.0, 0.14, h)); col = mix(col, cUp, smoothstep(0.08, 0.42, h)); col = mix(col, cZen, smoothstep(0.35, 0.95, h));
        float s = max(dot(d, uSunDir), 0.0); float glow = pow(s, 5.0) * 0.45 + pow(s, 28.0) * 0.7 + pow(s, 220.0) * 0.8; col = mix(col, cGlow, clamp(glow * uGlowI * 0.55, 0.0, 0.9)); col += cGlow * glow * uGlowI * 0.25;
        vec3 sr = normalize(vec3(uSunDir.z, 0.0, -uSunDir.x)); float dh = dot(d, sr), dv = d.y - uSunDir.y; col += cGlow * exp(-dh * dh * 6.0) * exp(-dv * dv * 1400.0) * uStreak * step(0.0, s) * 1.1;
        float disc = smoothstep(cos(uDisc), cos(uDisc * 0.82), s); col = mix(col, cDisc * uDiscI, disc);
        if (uStars > 0.01 && d.y > 0.02) { vec3 p = d * 70.0; vec3 id = floor(p); vec3 f = fract(p) - 0.5; float r = h1(id); vec3 o = (vec3(h1(id + 3.1), h1(id + 7.7), h1(id + 1.3)) - 0.5) * 0.6;
          float st = step(0.985, r) * smoothstep(0.2, 0.0, length(f - o)) * (0.55 + 0.45 * sin(uTime * 2.0 + r * 80.0)); col += vec3(1.0, 0.92, 0.85) * st * uStars * smoothstep(0.02, 0.3, d.y) * 1.6; }
        col += (h1(vec3(gl_FragCoord.xy, 3.0)) - 0.5) * 0.012; gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat); sky.frustumCulled = false; sky.renderOrder = -1000; group.add(sky);

  const post = createPost(ctx, S);
  let tCur = 0.5, tTarget = 0.5, first = true, started = false, q = ctx.quality || 'high', followObj = null, texel = 28 / 1024, evAcc = 0, winMats = [], winScan = -1e9, W = 540, H = 960;
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3(), fpos = new THREE.Vector3(); const UP = new THREE.Vector3(0, 1, 0);
  const tintMats = [];
  const scanCb = (o) => { const m = o.material; if (m && !Array.isArray(m) && (o.name === 'skyline' || o.name === 'skyline_windows' || (o.name === 'clouds' && m.isMeshBasicMaterial)) && tintMats.indexOf(m) < 0) { m.userData.todTint = o.name === 'skyline_windows' ? 'lit' : 'body'; tintMats.push(m); } if (m && !Array.isArray(m) && m.userData && m.userData.todTint && tintMats.indexOf(m) < 0) tintMats.push(m); if (m && !Array.isArray(m) && m.userData && m.userData.nightGlow !== undefined && winMats.indexOf(m) < 0) winMats.push(m); };

  function sample(v) { // v in 0..1 -> fills cur
    const i = v < 0.5 ? 0 : 1, f = ss(Math.min(1, Math.max(0, (v - i * 0.5) * 2))), A = KS[i], B = KS[i + 1];
    for (let n = 0; n < NUM.length; n++) { const k = NUM[n]; cur[k] = A[k] + (B[k] - A[k]) * f; }
    for (let n = 0; n < COL.length; n++) { const k = COL[n]; cur[k].copy(A[k]).lerp(B[k], f); }
  }
  function applyState() {
    const e = cur.elev * Math.PI / 180, a = cur.az * Math.PI / 180, ce = Math.cos(e);
    S.sunDir.set(-Math.sin(a) * ce, Math.sin(e), -Math.cos(a) * ce).normalize(); S.sunCol.copy(cur.sunCol);
    S.tod = tCur; S.night = Math.max(0, (tCur - 0.5) * 2); S.lamp = cur.lamp; S.neon = cur.neon; S.stage = cur.stage; S.windows = cur.windows; S.ray = cur.ray; S.fly = cur.fly; S.dust = cur.dust;
    S.bloom = cur.bloom; S.bloomThr = cur.bloomThr; S.vig = cur.vig; S.sat = cur.sat; S.gShadow.copy(cur.gShadow); S.gHigh.copy(cur.gHigh);
    sun.color.copy(cur.sunCol); sun.intensity = cur.sunI; hemi.color.copy(cur.hemiSky); hemi.groundColor.copy(cur.hemiGround); hemi.intensity = cur.hemiI;
    rim.color.copy(cur.rimCol); rim.intensity = cur.rimI; rim.position.set(-S.sunDir.x, 0.35, -S.sunDir.z).normalize().multiplyScalar(30); // from the camera side, low, opposite the key
    fog.color.copy(cur.fog); fog.near = cur.fogNear; fog.far = cur.fogFar; scene.background.copy(cur.fog); renderer.toneMappingExposure = cur.exposure;
    skyU.uDisc.value = cur.discSize; skyU.uDiscI.value = cur.discI; skyU.uGlowI.value = cur.glowI; skyU.uStreak.value = cur.streak; skyU.uStars.value = cur.stars;
    for (let i = 0; i < lampLights.length; i++) { const on = i < TR[q].lights; lampLights[i].intensity = on ? cur.lampLight * (0.35 + 0.65 * cur.lamp) * (0.97 + 0.03 * Math.sin(S.t * 8 + i)) : 0; }
    for (let i = 0; i < tintMats.length; i++) { const m = tintMats[i]; if (m.userData.todTint === 'lit') { const k = IN ? 0.1 + 0.46 * S.windows : 0.5 + 0.9 * S.windows; m.color.setRGB(k, k, k); } else m.color.copy(cur.skyTint); }
    for (let i = 0; i < winMats.length; i++) { const m = winMats[i]; if ('emissiveIntensity' in m) m.emissiveIntensity = m.userData.nightGlow * S.windows; }
    if (IN) applyInterior();
  }
  // interior overrides, applied after the shared state: key azimuth follows the windows, practical-light levels, window tint
  const RIMDIR = new THREE.Vector3(0.55, 0.5, 0.75).normalize();
  function applyInterior() {
    const e = cur.elev * Math.PI / 180, a = azW + cur.az * Math.PI / 180, ce = Math.cos(e); S.elev = e;
    S.sunDir.set(-Math.sin(a) * ce, Math.sin(e), -Math.cos(a) * ce).normalize();
    S.shaft = cur.ray; S.patch = cur.patch; S.paneA = cur.paneA; S.moteBase = cur.moteBase; S.tilt = cur.tilt; S.lv.set(cur.lvLamp, cur.lvNeon, cur.lvTv, cur.lvFridge);
    S.shaftCol.copy(cur.sunCol).multiplyScalar(0.62); S.paneTop.copy(cur.zen); S.paneBot.copy(cur.mid); sky.visible = false;
  }
  const KIND_LV = ['lvLamp', 'lvNeon', 'lvTv', 'lvFridge'], tmpCol = new THREE.Color();
  function updatePractical(dt, t, p) { // choose up to N nearest lights, fade slots in and out so nothing pops
    const n = Math.min(ptSlots.length, TR[q].lights), cand = inLights.map((l, i) => ({ i, d: Math.hypot(l.x - p.x, l.z - p.z) - (l.r || 6) * 0.15 })).sort((x, y) => x.d - y.d).slice(0, n), want = {}; cand.forEach((c) => { want[c.i] = 1; });
    ptSlots.forEach((sl, k) => { if (sl.idx >= 0 && !want[sl.idx]) { sl.w -= dt * 3; if (sl.w <= 0) { sl.w = 0; sl.idx = -1; } } else if (sl.idx >= 0) sl.w = Math.min(1, sl.w + dt * 3);
      if (k >= n && sl.idx >= 0) sl.w = Math.max(0, sl.w - dt * 6); });
    for (let c = 0; c < cand.length; c++) { const id = cand[c].i; if (ptSlots.some((sl) => sl.idx === id)) continue; const sl = ptSlots.find((x) => x.idx < 0); if (!sl) break; sl.idx = id; sl.w = 0; const l = inLights[id]; sl.p.position.set(l.x, l.y, l.z); sl.p.color.set(l.color || '#ffcf8a'); sl.p.distance = (l.r || 6) * 1.5; }
    ptSlots.forEach((sl) => { if (sl.idx < 0) { sl.p.intensity = 0; return; } const l = inLights[sl.idx], kd = LIGHT_KIND[l.kind || 'lamp'] || 0, lv = cur[KIND_LV[kd]], ph = sl.idx * 3.7, fl = l.flicker !== undefined ? l.flicker : (kd === 2 ? 0.45 : kd === 1 ? 0.1 : 0.04);
      const nz = Math.sin(t * 13 + ph) * 0.5 + Math.sin(t * 29 + ph * 1.7) * 0.3 + (kd === 2 ? Math.sin(t * 47 + ph) * 0.3 : 0); sl.p.intensity = 6.5 * cur.ptI * (l.i === undefined ? 1 : l.i) * lv * sl.w * Math.max(0.2, 1 + fl * nz); });
  }
  S.t = 0;
  const api = {
    group, state: S,
    setTimeOfDay(v, instant) {
      const n = v === 'day' ? 0 : v === 'dusk' ? 0.5 : v === 'night' ? 1 : Math.min(1, Math.max(0, +v || 0)); tTarget = n; if (instant || first || !started) { tCur = n; first = false; sample(tCur); applyState(); }
    },
    follow(o) { followObj = o || null; },
    setMusic(on) { vfx.setMusic(on); },
    setQuality(v) {
      if (!TR[v]) return; q = v; vfx.setQuality(v); post.setQuality(v);
      const t = TR[v]; if (sh.mapSize.x !== t.shadow) { sh.mapSize.set(t.shadow, t.shadow); if (sh.map) { sh.map.dispose(); sh.map = null; } } texel = 30 / t.shadow;
      if (!IN) lampLights.forEach((p, i) => { p.visible = i < t.lights; }); applyState();
    },
    resize(w, h, dpr) { W = w; H = h; post.resize(w, h, dpr); vfx.setPixelHeight(h * dpr); },
    update(dt, t) {
      started = true; S.t = t; skyU.uTime.value = t;
      if (Math.abs(tTarget - tCur) > 0.0005) { tCur += (tTarget - tCur) * (1 - Math.exp(-dt * 2.2)); if (Math.abs(tTarget - tCur) < 0.0006) tCur = tTarget; sample(tCur); }
      // follow target (explicit, else the player in window.__park, else the spawn point)
      let tgt = followObj; if (!tgt && typeof window !== 'undefined' && window.__park && window.__park.player) tgt = window.__park.player.object;
      if (tgt) { tgt.getWorldPosition(fpos); } else { const s = anchors.start || { x: 0, z: 10 }; fpos.set(s.x, 0, s.z); }
      applyState();
      // sun shadow camera: centre on the target, snapped to shadow-texel steps in light space so the shadows do not shimmer when the target moves
      const d = S.sunDir; tmpA.crossVectors(UP, d).normalize(); tmpB.crossVectors(d, tmpA); // light-space x and y axes
      const px = Math.round(tmpA.dot(fpos) / texel) * texel, py = Math.round(tmpB.dot(fpos) / texel) * texel, pz = d.dot(fpos);
      if (IN) { sun.target.position.copy(S.inCtr); sun.position.copy(S.inCtr).addScaledVector(d, 40); rim.target.position.copy(S.inCtr); rim.position.copy(S.inCtr).addScaledVector(RIMDIR, 30); updatePractical(dt, t, fpos); }
      else { tmpC.set(0, 0, 0).addScaledVector(tmpA, px).addScaledVector(tmpB, py).addScaledVector(d, pz); sun.target.position.copy(tmpC); sun.position.copy(tmpC).addScaledVector(d, 55);
      rim.target.position.copy(fpos); rim.position.add(fpos); }
      sky.position.copy(camera.position); if (IN) sky.visible = false;
      vfx.update(dt, t, fpos.x, fpos.z); post.update(t);
      evAcc += dt; if (evAcc > 0.1 && Math.abs(tTarget - tCur) > 0.001 && ctx.events) { evAcc = 0; ctx.events.emit('timeofday', S); }
      const now = performance.now(); if (now - winScan > 2000) { winScan = now; scene.traverse(scanCb); }
    },
    post,
    render() { post.render(); },
    getState() { return S; }, debug() { return { tint: tintMats.length, win: winMats.length, winScan }; },
    stats() { return { sceneCalls: post.stats.sceneCalls, sceneTris: post.stats.sceneTris, totalCalls: post.stats.totalCalls, composer: post.active, rung: post.stats.rung, quality: q, vfxDraws: IN ? 5 : 5 + 1 }; },
    dispose() { post.dispose(); },
  };
  api.setQuality(q); api.setTimeOfDay(ctx.todInit !== undefined ? ctx.todInit : 'dusk', true);
  return api;
}

// Stand-in room (only used while the flat module is an empty stub): floor, two walls with window holes, a couch, a table.
function buildTestRoom(terrain, wins) {
  const g = new THREE.Group(); g.name = 'testroom'; const parts = [], H = 2.8, y0 = 1.0, y1 = 2.4, T = 0.2;
  parts.push(box(15, 0.1, 11, '#b98a5e', 0, -0.05, 0));
  const wall = (alongX, fixed, min, max, holes) => { let cur = min; holes.sort((a, b) => a - b); const seg = (a, b, y, h) => { if (b - a < 0.01) return; parts.push(alongX ? box(b - a, h, T, '#e8d9c4', (a + b) / 2, y + h / 2, fixed) : box(T, h, b - a, '#e8d9c4', fixed, y + h / 2, (a + b) / 2)); };
    seg(min, max, 0, y0); seg(min, max, y1, H - y1); holes.forEach((c) => { seg(cur, c - 0.9, y0, y1 - y0); cur = c + 0.9; }); seg(cur, max, y0, y1 - y0); };
  wall(true, -5.5, -7.5, 7.5, wins.filter((w) => w.nz < -0.5).map((w) => w.x)); wall(false, -7.5, -5.5, 5.5, wins.filter((w) => w.nx < -0.5).map((w) => w.z));
  parts.push(box(2.4, 0.5, 1.0, '#7a5ca8', -3.2, 0.25, 2.2), box(2.4, 0.5, 0.25, '#6a4c98', -3.2, 0.75, 2.65), box(1.2, 0.4, 0.7, '#8a5a3a', -3.2, 0.2, 0.6), box(1.6, 0.9, 0.5, '#2a2a3a', -6.9, 0.45, 0.6), box(0.9, 1.9, 0.8, '#d8dde6', 5.2, 0.95, -5.0), box(1.4, 0.7, 0.7, '#6a8a6a', 5.0, 0.35, 3.2), box(0.2, 0.7, 0.2, '#ffe0a0', -3.2, 0.7, 0.6));
  const m = mesh(merged(parts), flatMat()); g.add(m); return g;
}
