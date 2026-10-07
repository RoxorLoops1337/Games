// LIGHTING module (Lighting and VFX Artist). Owns: sky gradient dome, sun (directional, soft shadows that follow the player), hemisphere + rim lights, fog,
// tone mapping, post (fx_post.js), lamp light cones, god rays, fireflies, floating music notes (fx_vfx.js).
// CONTRACT: buildLighting(ctx, terrain) -> { setTimeOfDay('day'|'dusk'|'night'|0..1 [, instant]), update(dt, t), render() (replaces renderer.render), resize(w,h,dpr),
//   setQuality('low'|'med'|'high'), setMusic(bool), follow(object3D|null), getState(), stats(), group }
// Time of day number: 0 = day, 0.5 = dusk (GOLDEN HOUR, the default look), 1 = night. Changes blend smoothly (pass true as 2nd arg to jump).
// HOOKS for others: materials with userData.todTint = "body" (colour multiplier follows the time of day) or "lit" (window layer, dim by day, hot at night); meshes named skyline / skyline_windows get it automatically.
//   Also: give an emissive material `material.userData.nightGlow = maxEmissiveIntensity` (windows, neon signs) and it is driven 0..max by the time of day.
// ctx.events emits 'timeofday' with the shared state object {night, lamp, windows, neon, ...} while it changes.
import { THREE } from './kit.js';
import { buildVFX } from './fx_vfx.js';
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
    bloom: 0.7, bloomThr: 0.9, vig: 0.6, sat: 1.1, skyTint: C('#4f4a92'), gShadow: C('#d8d0ff'), gHigh: C('#ffe4d0') },
];
const NUM = [], COL = [];
for (const k in KF[0]) (typeof KF[0][k] === 'number' ? NUM : COL).push(k);
const ss = (f) => f * f * (3 - 2 * f);
const TIER = { low: { shadow: 512, lights: 1 }, med: { shadow: 1024, lights: 2 }, high: { shadow: 2048, lights: 3 } };

export function buildLighting(ctx, terrain) {
  const { renderer, scene, camera } = ctx; const anchors = terrain.anchors || {};
  const group = new THREE.Group(); group.name = 'lighting';
  const S = { sunDir: new THREE.Vector3(), sunCol: new THREE.Color(), tod: 0.5, night: 0, lamp: 0, neon: 0, stage: 0, windows: 0, ray: 0, fly: 0, dust: 0, bloom: 0.3, bloomThr: 1.25, vig: 0.5, sat: 1.1, gShadow: new THREE.Color(), gHigh: new THREE.Color() };
  const cur = {}; NUM.forEach((k) => { cur[k] = 0; }); COL.forEach((k) => { cur[k] = new THREE.Color(); });
  const fog = new THREE.Fog('#e49fb2', 14, 80); scene.fog = fog; scene.background = new THREE.Color('#e49fb2');
  renderer.info.autoReset = false;

  // ---------- lights ----------
  const sun = new THREE.DirectionalLight('#ffc783', 3); sun.castShadow = true; const sh = sun.shadow; sh.camera.left = -15; sh.camera.right = 15; sh.camera.top = 15; sh.camera.bottom = -15; sh.camera.near = 1; sh.camera.far = 110;
  sh.bias = -0.0005; sh.normalBias = 0.03; sh.radius = 3; sh.mapSize.set(1024, 1024); group.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight('#9a8ee0', '#c47c58', 1.9); group.add(hemi);
  const rim = new THREE.DirectionalLight('#ff8fb0', 1.1); rim.castShadow = false; group.add(rim, rim.target);
  const vfx = buildVFX(ctx, terrain, S); group.add(vfx.group);
  const lampLights = []; // up to 3 real point lights on the lamps nearest the plaza (fountain), no shadows
  { const f = anchors.fountain || { x: 0, z: 0 }; const L = vfx.lamps.slice().sort((a, b) => Math.hypot(a.x - f.x, a.z - f.z) - Math.hypot(b.x - f.x, b.z - f.z)).slice(0, 3);
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
    const i = v < 0.5 ? 0 : 1, f = ss(Math.min(1, Math.max(0, (v - i * 0.5) * 2))), A = KF[i], B = KF[i + 1];
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
    for (let i = 0; i < lampLights.length; i++) { const on = i < TIER[q].lights; lampLights[i].intensity = on ? cur.lampLight * (0.35 + 0.65 * cur.lamp) * (0.97 + 0.03 * Math.sin(S.t * 8 + i)) : 0; }
    for (let i = 0; i < tintMats.length; i++) { const m = tintMats[i]; if (m.userData.todTint === 'lit') { const k = 0.5 + 0.9 * S.windows; m.color.setRGB(k, k, k); } else m.color.copy(cur.skyTint); }
    for (let i = 0; i < winMats.length; i++) { const m = winMats[i]; if ('emissiveIntensity' in m) m.emissiveIntensity = m.userData.nightGlow * S.windows; }
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
      if (!TIER[v]) return; q = v; vfx.setQuality(v); post.setQuality(v);
      const t = TIER[v]; if (sh.mapSize.x !== t.shadow) { sh.mapSize.set(t.shadow, t.shadow); if (sh.map) { sh.map.dispose(); sh.map = null; } } texel = 30 / t.shadow;
      lampLights.forEach((p, i) => { p.visible = i < t.lights; }); applyState();
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
      tmpC.set(0, 0, 0).addScaledVector(tmpA, px).addScaledVector(tmpB, py).addScaledVector(d, pz); sun.target.position.copy(tmpC); sun.position.copy(tmpC).addScaledVector(d, 55);
      rim.target.position.copy(fpos); rim.position.add(fpos);
      sky.position.copy(camera.position);
      vfx.update(dt, t, fpos.x, fpos.z); post.update(t);
      evAcc += dt; if (evAcc > 0.1 && Math.abs(tTarget - tCur) > 0.001 && ctx.events) { evAcc = 0; ctx.events.emit('timeofday', S); }
      const now = performance.now(); if (now - winScan > 2000) { winScan = now; scene.traverse(scanCb); }
    },
    post,
    render() { post.render(); },
    getState() { return S; }, debug() { return { tint: tintMats.length, win: winMats.length, winScan }; },
    stats() { return { sceneCalls: post.stats.sceneCalls, sceneTris: post.stats.sceneTris, totalCalls: post.stats.totalCalls, composer: post.active, rung: post.stats.rung, quality: q, vfxDraws: 5 + 1 }; },
    dispose() { post.dispose(); },
  };
  api.setQuality(q); api.setTimeOfDay(ctx.todInit !== undefined ? ctx.todInit : 'dusk', true);
  return api;
}
