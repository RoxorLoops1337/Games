// LIGHTING module (Lighting and VFX Artist). Owns: sky gradient dome, sun (directional, soft shadows that follow the player), hemisphere + rim lights, fog,
// tone mapping, post (fx_post.js), lamp light cones, god rays, fireflies, floating music notes (fx_vfx.js), rain + wet ground (fx_weather.js), club / stage rig.
// CONTRACT: buildLighting(ctx, terrain [, shared]) -> { setTimeOfDay('day'|'dusk'|'night'|0..1 [, instant]), setWeather('clear'|'rain' [, instant]), setBeat(0..1),
//   setProfile('out'|'in'|'club'|'studio'|'stage' [, instant]), setStageTheme('pink'|'cyan'|'lime'|'gold' [, instant]), setReduce(bool), update(dt, t), render() (replaces renderer.render),
//   resize(w,h,dpr), setQuality('low'|'med'|'high'), setMusic(bool), follow(object3D|null), getState() -> { night, weather, profile, tod, rain, theme, ... }, stats(), dispose(), group }
// ctx.shared = { post, shadowMap } (or the 3rd argument) lets a host keep ONE post chain (createSharedPost(renderer, S), exported here too) and one shadow map across worlds: lighting binds its
//   scene/camera/state to the shared chain and unbinds on dispose, so a world switch re-creates no render target (they only rebuild on a quality change or a black-frame ladder step).
// Time of day number = the game's nightness: 0 = day, 0.5 = dusk (GOLDEN HOUR, the default look), 1 = night. It can be fed continuously (once a second is fine, small steps are followed
//   smoothly); a jump (dev menu) animates over ~1.2 s. Pass true as 2nd arg to jump instantly.
// Profiles: 'out' park / street, 'in' home / shop, 'club' always night + coloured moving spot beams + haze + disco ball sparkle + bloom up, 'studio' cool pad light + warm practicals,
//   'stage' key spots + rim in the theme colour. Interior-family profiles (in, club, studio, stage) use the interior pipeline: set terrain.interior = true OR terrain.profile / ctx.profile at build.
//   Optional terrain.anchors for the rig: discoBall {x,y,z}, stageCenter {x,z}, rig [{x,y,z}] (up to 6 beam mounts); terrain.ceilY.
// Weather: 'rain' = darker + bluer grade, lamps/neon come on, rain streaks + ground splashes + wet puddle sheen (outdoor), rain on the panes of interior windows. Low tier: no splashes, fewer streaks.
// Beat: setBeat(0..1) each frame pulses neon, stage lights, beams, nightGlow materials (userData.beatGain, default 0.2) and the bloom a little (setReduce(true) removes the bloom pulse).
// HOOKS for others: materials with userData.todTint = "body" (colour multiplier follows the time of day) or "lit" (window layer, dim by day, hot at night); meshes named skyline / skyline_windows get it automatically.
//   Also: give an emissive material `material.userData.nightGlow = maxEmissiveIntensity` (windows, neon signs) and it is driven 0..max by the time of day.
// ctx.events emits 'timeofday' with the shared state object {night, lamp, windows, neon, ...} while it changes.
import { THREE, box, merged, flatMat, mesh, disposeTree } from './kit.js';
import { buildVFX, interiorSource, LIGHT_KIND } from './fx_vfx.js';
import { createPost, createSharedPost } from './fx_post.js';
import { buildWeather } from './fx_weather.js';
export { createSharedPost };

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


// ---------- profile / weather grading targets (module level, never allocated per frame) ----------
const PROFILES = ['out', 'in', 'club', 'studio', 'stage'];
const THEMES = { pink: { a: C('#ff3d9a'), b: C('#7a3dff'), key: C('#ffe3ee') }, cyan: { a: C('#35f2e0'), b: C('#3d7aff'), key: C('#e2fbff') }, lime: { a: C('#a6ff3d'), b: C('#2bd9a0'), key: C('#f2ffd8') }, gold: { a: C('#ffc83d'), b: C('#ff6a3d'), key: C('#fff0c0') } };
const RAIN_SUN = C('#a8bcdf'), RAIN_HEMI = C('#8aa2d4'), RAIN_GND = C('#6c7898'), RAIN_GS = C('#c8d4ff'), RAIN_GH = C('#e6eeff');
const CLUB_SUN = C('#6c68ff'), CLUB_HEMI = C('#4e2fa8'), CLUB_GND = C('#2b1655'), CLUB_FOG = C('#201046'), CLUB_GS = C('#d8c8ff'), CLUB_GH = C('#ffe0f0');
const STUDIO_SUN = C('#bcd3ff'), STUDIO_HEMI = C('#9ab4ee'), STUDIO_GND = C('#7a7898'), STUDIO_RIM = C('#8fb6ff'), STUDIO_GS = C('#cfe0ff'), STUDIO_GH = C('#fff0d8');
const STAGE_HEMI = C('#3b2a80'), STAGE_GND = C('#241640'), STAGE_FOG = C('#150a2e');
const RIMDIR = new THREE.Vector3(0.55, 0.5, 0.75).normalize(), RIMDIR_BACK = new THREE.Vector3(-0.15, 0.55, -0.8).normalize();
const TIME_RAMP = 1.2; // seconds a time jump takes

function rainTint(c, k, dark) { const l = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b; c.r += (l * 0.8 * dark - c.r) * k; c.g += (l * 0.9 * dark - c.g) * k; c.b += (l * 1.08 * dark + 0.02 - c.b) * k; }
const toward = (v, to, k) => v + (to - v) * k;

export function buildLighting(ctx, terrain, sharedArg) {
  const { renderer, scene, camera } = ctx; const anchors = terrain.anchors || {}; const SH = sharedArg || ctx.shared || null;
  if (SH && SH.shadowMap == null) SH.shadowMap = { map: null, dispose() { if (this.map) { this.map.dispose(); this.map = null; } } }; // the host's one shadow map slot (kept across worlds)
  const prof0 = terrain.profile || ctx.profile || null; const IN = terrain.interior === true || (!!prof0 && prof0 !== 'out');
  const KS = IN ? KFI : KF, { N: NUM, C: COL } = keysOf(KS); const TR = IN ? TIER_IN : TIER;
  const group = new THREE.Group(); group.name = 'lighting';
  const S = { sunDir: new THREE.Vector3(), sunCol: new THREE.Color(), tod: 0.5, night: 0, lamp: 0, neon: 0, stage: 0, windows: 0, ray: 0, fly: 0, dust: 0, bloom: 0.3, bloomThr: 1.25, vig: 0.5, sat: 1.1, gShadow: new THREE.Color(), gHigh: new THREE.Color(), tilt: 1, lv: new THREE.Vector4(), shaftCol: new THREE.Color(), paneTop: new THREE.Color(), paneBot: new THREE.Color(), shaft: 0, patch: 0, paneA: 0.3, moteBase: 0.2, elev: 0.8, interior: IN,
    weather: 'clear', profile: IN ? (prof0 && prof0 !== 'out' ? prof0 : 'in') : 'out', theme: 'pink', rain: 0, beat: 0, beatFx: 0, haze: 0, beams: 0, beamMode: 0, spark: 0, fogCol: new THREE.Color(), rainRefl: new THREE.Color(), themeA: THEMES.pink.a.clone(), themeB: THEMES.pink.b.clone(), keyCol: THEMES.pink.key.clone(), stubOK: !(prof0 && prof0 !== 'in') };
  const base = {}, cur = {}; NUM.forEach((k) => { base[k] = 0; cur[k] = 0; }); COL.forEach((k) => { base[k] = new THREE.Color(); cur[k] = new THREE.Color(); });
  const fog = new THREE.Fog('#e49fb2', 14, 80); scene.fog = fog; scene.background = new THREE.Color('#e49fb2');
  renderer.info.autoReset = false;
  let disposed = false, reduce = !!ctx.reduceMotion;

  // ---------- lights ----------
  const sun = new THREE.DirectionalLight('#ffc783', 3); sun.castShadow = true; const sh = sun.shadow; sh.camera.left = -15; sh.camera.right = 15; sh.camera.top = 15; sh.camera.bottom = -15; sh.camera.near = 1; sh.camera.far = 110;
  sh.bias = -0.0005; sh.normalBias = 0.03; sh.radius = 3; sh.mapSize.set(1024, 1024); group.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight('#9a8ee0', '#c47c58', 1.9); group.add(hemi);
  const rim = new THREE.DirectionalLight('#ff8fb0', 1.1); rim.castShadow = false; group.add(rim, rim.target);
  S.stubOK = S.stubOK && !(SH && SH.noStub); const vfx = buildVFX(ctx, terrain, S); group.add(vfx.group);
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
  // club / stage: two real moving spot lights (no shadows) so the characters and the floor catch the colours. Created on demand (adding a light recompiles the lit materials once),
  // so a host that knows the profile passes terrain.profile / ctx.profile at build and nothing hitches later.
  const spots = []; let spotsOn = false;
  function ensureSpots() { if (spotsOn || disposed) return; spotsOn = true; for (let i = 0; i < 2; i++) { const sp = new THREE.SpotLight('#ff3d9a', 0, 16, 0.55, 0.9, 1.5); sp.castShadow = false; group.add(sp, sp.target); spots.push(sp); } }
  if (prof0 === 'club' || prof0 === 'stage') ensureSpots();

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

  // rain (outdoor worlds only: the interior shows it through the window panes in fx_vfx)
  const weather = IN ? null : buildWeather(ctx, terrain, S, vfx.reflectors); if (weather) group.add(weather.group);

  // the post chain: shared with the host when ctx.shared.post is given (bind, never rebuild), else our own
  const ownPost = !(SH && SH.post); const post = ownPost ? createPost(ctx, S) : SH.post; if (!ownPost) post.bind({ scene, camera, S });
  let tTarget = 0.5, tCur = 0.5, tFrom = 0.5, tTo = 0.5, tRamp = 1, tFollow = false, first = true, started = false, q = ctx.quality || 'high', followObj = null, texel = 28 / 1024, evAcc = 0, winMats = [], winScan = -1e9, W = 540, H = 960;
  let rainLin = 0, rainTarget = 0, beatTarget = 0, tEffLast = -1, themeTarget = THEMES.pink, wasDirty = true;
  const pw = { club: 0, studio: 0, stage: 0 }, pwT = { club: 0, studio: 0, stage: 0 };
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3(), fpos = new THREE.Vector3(), tmpD = new THREE.Vector3(); const UP = new THREE.Vector3(0, 1, 0);
  const tintMats = [];
  const scanCb = (o) => { const m = o.material; if (m && !Array.isArray(m) && (o.name === 'skyline' || o.name === 'skyline_windows' || (o.name === 'clouds' && m.isMeshBasicMaterial)) && tintMats.indexOf(m) < 0) { m.userData.todTint = o.name === 'skyline_windows' ? 'lit' : 'body'; tintMats.push(m); } if (m && !Array.isArray(m) && m.userData && m.userData.todTint && tintMats.indexOf(m) < 0) tintMats.push(m); if (m && !Array.isArray(m) && m.userData && m.userData.nightGlow !== undefined && winMats.indexOf(m) < 0) winMats.push(m); };

  function sample(v) { // v in 0..1 -> fills base
    const i = v < 0.5 ? 0 : 1, f = ss(Math.min(1, Math.max(0, (v - i * 0.5) * 2))), A = KS[i], B = KS[i + 1];
    for (let n = 0; n < NUM.length; n++) { const k = NUM[n]; base[k] = A[k] + (B[k] - A[k]) * f; }
    for (let n = 0; n < COL.length; n++) { const k = COL[n]; base[k].copy(A[k]).lerp(B[k], f); }
  }
  // base (the sampled time of day) -> cur (what is drawn): weather, profile and beat grading, every frame, no allocation
  function finalize() {
    for (let n = 0; n < NUM.length; n++) { const k = NUM[n]; cur[k] = base[k]; } for (let n = 0; n < COL.length; n++) { const k = COL[n]; cur[k].copy(base[k]); }
    const w = S.rain, pc = pw.club, ps = pw.studio, pt = pw.stage, bt = S.beatFx, c = cur;
    if (w > 0.001) {
      c.sunI *= 1 - (IN ? 0.55 : 0.55) * w; c.sunCol.lerp(RAIN_SUN, 0.6 * w); c.hemiSky.lerp(RAIN_HEMI, 0.5 * w); c.hemiGround.lerp(RAIN_GND, 0.35 * w); c.rimI *= 1 - 0.5 * w;
      rainTint(c.zen, 0.8 * w, 0.8); rainTint(c.up, 0.8 * w, 0.8); rainTint(c.mid, 0.8 * w, 0.82); rainTint(c.glow, 0.7 * w, 0.8); rainTint(c.skyTint, 0.6 * w, 0.8);
      if (!IN) { rainTint(c.fog, 0.85 * w, 0.66); c.fogNear *= 1 - 0.2 * w; c.fogFar *= 1 - 0.28 * w; } else rainTint(c.fog, 0.5 * w, 0.8);
      c.glowI *= 1 - 0.85 * w; c.discI *= 1 - 0.97 * w; c.streak *= 1 - w; c.stars *= 1 - 0.85 * w;
      c.lamp = toward(c.lamp, Math.max(c.lamp, 0.62), w); c.lampLight = toward(c.lampLight, Math.max(c.lampLight, 9), w); c.windows = toward(c.windows, Math.max(c.windows, 0.45), w); c.neon = toward(c.neon, Math.max(c.neon, 0.55), w); c.stage = toward(c.stage, Math.max(c.stage, 0.5), w);
      c.ray *= 1 - 0.9 * w; c.fly *= 1 - 0.92 * w; c.dust *= 1 - 0.35 * w; c.bloom += 0.1 * w; c.bloomThr -= 0.05 * w; c.sat *= 1 - 0.1 * w; c.vig += 0.05 * w; c.exposure *= 1 + 0.07 * w; c.hemiI *= 1 + 0.12 * w; c.gShadow.lerp(RAIN_GS, 0.5 * w); c.gHigh.lerp(RAIN_GH, 0.5 * w);
      if (IN) { c.patch *= 1 - 0.7 * w; c.paneA += 0.14 * w; c.lvLamp = toward(c.lvLamp, Math.max(c.lvLamp, 0.6), w); c.lvNeon = toward(c.lvNeon, Math.max(c.lvNeon, 0.6), w); }
    }
    if (pc > 0.001) { // CLUB: night, purple haze, theme-coloured rim, everything neon
      c.sunI *= 1 - 0.45 * pc; c.sunCol.lerp(CLUB_SUN, 0.8 * pc); c.hemiSky.lerp(CLUB_HEMI, 0.8 * pc); c.hemiGround.lerp(CLUB_GND, 0.8 * pc); c.hemiI *= 1 - 0.18 * pc; c.rimCol.lerp(S.themeA, pc); c.rimI = toward(c.rimI, 0.85, pc);
      c.fog.lerp(CLUB_FOG, 0.85 * pc); c.fogNear = toward(c.fogNear, IN ? 30 : c.fogNear, pc); c.fogFar = toward(c.fogFar, IN ? 120 : c.fogFar, pc); c.exposure *= 1 + 0.06 * pc;
      c.neon = toward(c.neon, 1.15, pc); c.stage = toward(c.stage, 1.15, pc); c.lamp *= 1 - 0.4 * pc; c.bloom += 0.2 * pc; c.bloomThr -= 0.12 * pc; c.vig += 0.1 * pc; c.sat *= 1 + 0.12 * pc;
      c.dust += 1.2 * pc; c.moteBase += 0.5 * pc; c.ray *= 1 - 0.75 * pc; c.patch *= 1 - 0.85 * pc; c.gShadow.lerp(CLUB_GS, 0.6 * pc); c.gHigh.lerp(CLUB_GH, 0.5 * pc); c.ptI *= 1 - 0.3 * pc;
    }
    if (ps > 0.001) { // STUDIO: cool pad key, warm practicals
      c.sunCol.lerp(STUDIO_SUN, 0.85 * ps); c.sunI *= 1 - 0.1 * ps; c.hemiSky.lerp(STUDIO_HEMI, 0.7 * ps); c.hemiGround.lerp(STUDIO_GND, 0.5 * ps); c.rimCol.lerp(STUDIO_RIM, ps); c.rimI = toward(c.rimI, 1.0, 0.5 * ps);
      c.lvLamp = toward(c.lvLamp, Math.max(c.lvLamp, 0.95), ps); c.lvNeon = toward(c.lvNeon, Math.max(c.lvNeon, 0.85), ps); c.lvTv = toward(c.lvTv, Math.max(c.lvTv, 0.9), ps); c.ptI *= 1 + 0.35 * ps;
      c.exposure *= 1 + 0.02 * ps; c.bloom += 0.06 * ps; c.gShadow.lerp(STUDIO_GS, 0.6 * ps); c.gHigh.lerp(STUDIO_GH, 0.6 * ps); c.paneA *= 1 - 0.6 * ps; c.ray *= 1 - 0.8 * ps; c.patch *= 1 - 0.8 * ps;
    }
    if (pt > 0.001) { // STAGE: dark house, key spots, theme rim
      c.hemiI *= 1 - 0.5 * pt; c.hemiSky.lerp(STAGE_HEMI, 0.7 * pt); c.hemiGround.lerp(STAGE_GND, 0.7 * pt); c.sunI *= 1 - 0.7 * pt; c.sunCol.lerp(S.keyCol, 0.6 * pt); c.rimCol.lerp(S.themeA, pt); c.rimI = toward(c.rimI, 2.0, pt);
      c.fog.lerp(STAGE_FOG, 0.8 * pt); c.fogNear = toward(c.fogNear, IN ? 34 : c.fogNear, pt); c.fogFar = toward(c.fogFar, IN ? 130 : c.fogFar, pt); c.exposure *= 1 + 0.05 * pt; c.bloom += 0.2 * pt; c.bloomThr -= 0.15 * pt; c.vig += 0.12 * pt;
      c.neon = toward(c.neon, Math.max(c.neon, 1), pt); c.stage = toward(c.stage, Math.max(c.stage, 1), pt); c.dust += 0.6 * pt; c.moteBase += 0.3 * pt; c.ray *= 1 - 0.8 * pt; c.patch *= 1 - 0.85 * pt; c.ptI *= 1 - 0.2 * pt;
    }
    if (bt > 0.001) { c.neon *= 1 + 0.32 * bt; c.stage *= 1 + 0.5 * bt; c.rimI *= 1 + 0.35 * bt * (pc + pt); if (!reduce) { c.bloom += 0.12 * bt; c.bloomThr -= 0.03 * bt; } }
    S.haze = 0.85 * pc + 0.5 * pt; S.beams = pc + 0.9 * pt; S.beamMode = pt > pc ? 1 : 0; S.spark = pc;
  }
  function applyState() {
    const e = cur.elev * Math.PI / 180, a = (cur.az + ((!IN && terrain && terrain.sunAzOffset) || 0)) * Math.PI / 180, ce = Math.cos(e);   // terrain.sunAzOffset (deg): a world can turn the sun, e.g. the street keeps it on the camera side
    S.sunDir.set(-Math.sin(a) * ce, Math.sin(e), -Math.cos(a) * ce).normalize(); S.sunCol.copy(cur.sunCol);
    S.tod = tCur; S.night = Math.max(0, (tEffLast - 0.5) * 2); S.lamp = cur.lamp; S.neon = cur.neon; S.stage = cur.stage; S.windows = cur.windows; S.ray = cur.ray; S.fly = cur.fly; S.dust = cur.dust;
    S.bloom = cur.bloom; S.bloomThr = cur.bloomThr; S.vig = cur.vig; S.sat = cur.sat; S.gShadow.copy(cur.gShadow); S.gHigh.copy(cur.gHigh);
    sun.color.copy(cur.sunCol); sun.intensity = cur.sunI; hemi.color.copy(cur.hemiSky); hemi.groundColor.copy(cur.hemiGround); hemi.intensity = cur.hemiI;
    rim.color.copy(cur.rimCol); rim.intensity = cur.rimI;
    if (!IN) rim.position.set(-S.sunDir.x, 0.35, -S.sunDir.z).normalize().multiplyScalar(30); // from the camera side, low, opposite the key
    fog.color.copy(cur.fog); fog.near = cur.fogNear; fog.far = cur.fogFar; scene.background.copy(cur.fog); renderer.toneMappingExposure = cur.exposure; S.fogCol.copy(cur.fog); S.rainRefl.copy(cur.mid).lerp(cur.fog, 0.4).multiplyScalar(1.25);
    skyU.uDisc.value = cur.discSize; skyU.uDiscI.value = cur.discI; skyU.uGlowI.value = cur.glowI; skyU.uStreak.value = cur.streak; skyU.uStars.value = cur.stars;
    for (let i = 0; i < lampLights.length; i++) { const on = i < TR[q].lights; lampLights[i].intensity = on ? cur.lampLight * (0.35 + 0.65 * cur.lamp) * (0.97 + 0.03 * Math.sin(S.t * 8 + i)) : 0; }
    const bg = S.beatFx;
    for (let i = 0; i < tintMats.length; i++) { const m = tintMats[i]; if (m.userData.todTint === 'lit') { const k = IN ? 0.1 + 0.46 * S.windows : 0.5 + 0.9 * S.windows; m.color.setRGB(k, k, k); } else m.color.copy(cur.skyTint); }
    for (let i = 0; i < winMats.length; i++) { const m = winMats[i]; if ('emissiveIntensity' in m) { const bgn = m.userData.beatGain === undefined ? 0.2 : m.userData.beatGain; m.emissiveIntensity = m.userData.nightGlow * S.windows * (1 + bgn * bg); } }
    if (IN) applyInterior();
  }
  // interior overrides, applied after the shared state: key azimuth follows the windows, practical-light levels, window tint
  function applyInterior() {
    const e = cur.elev * Math.PI / 180, a = azW + cur.az * Math.PI / 180, ce = Math.cos(e); S.elev = e;
    S.sunDir.set(-Math.sin(a) * ce, Math.sin(e), -Math.cos(a) * ce).normalize();
    S.shaft = cur.ray; S.patch = cur.patch; S.paneA = cur.paneA; S.moteBase = cur.moteBase; S.tilt = cur.tilt; S.lv.set(cur.lvLamp, cur.lvNeon, cur.lvTv, cur.lvFridge);
    S.shaftCol.copy(cur.sunCol).multiplyScalar(0.62); S.paneTop.copy(cur.zen); S.paneBot.copy(cur.mid); sky.visible = false;
  }
  const KIND_LV = ['lvLamp', 'lvNeon', 'lvTv', 'lvFridge'];
  const candI = new Int16Array(3), candD = new Float32Array(3);
  function wanted(idx, cnt) { for (let i = 0; i < cnt; i++) if (candI[i] === idx) return true; return false; }
  function updatePractical(dt, t, p) { // choose up to N nearest lights, fade slots in and out so nothing pops (allocation free)
    const n = Math.min(ptSlots.length, TR[q].lights); let cnt = 0;
    for (let i = 0; i < inLights.length; i++) { const l = inLights[i], dx = l.x - p.x, dz = l.z - p.z, d = Math.sqrt(dx * dx + dz * dz) - (l.r || 6) * 0.15; let pos;
      if (cnt < n) pos = cnt++; else if (n > 0 && d < candD[n - 1]) pos = n - 1; else continue;
      while (pos > 0 && candD[pos - 1] > d) { candD[pos] = candD[pos - 1]; candI[pos] = candI[pos - 1]; pos--; } candD[pos] = d; candI[pos] = i; }
    for (let k = 0; k < ptSlots.length; k++) { const sl = ptSlots[k]; if (sl.idx >= 0 && !wanted(sl.idx, cnt)) { sl.w -= dt * 3; if (sl.w <= 0) { sl.w = 0; sl.idx = -1; } } else if (sl.idx >= 0) sl.w = Math.min(1, sl.w + dt * 3);
      if (k >= n && sl.idx >= 0) sl.w = Math.max(0, sl.w - dt * 6); }
    for (let c = 0; c < cnt; c++) { const id = candI[c]; let has = false, free = null; for (let k = 0; k < ptSlots.length; k++) { if (ptSlots[k].idx === id) has = true; else if (ptSlots[k].idx < 0 && !free) free = ptSlots[k]; } if (has) continue; if (!free) break;
      free.idx = id; free.w = 0; const l = inLights[id]; free.p.position.set(l.x, l.y, l.z); free.p.color.set(l.color || '#ffcf8a'); free.p.distance = (l.r || 6) * 1.5; }
    for (let k = 0; k < ptSlots.length; k++) { const sl = ptSlots[k]; if (sl.idx < 0) { sl.p.intensity = 0; continue; } const l = inLights[sl.idx], kd = LIGHT_KIND[l.kind || 'lamp'] || 0, lv = cur[KIND_LV[kd]], ph = sl.idx * 3.7, fl = l.flicker !== undefined ? l.flicker : (kd === 2 ? 0.45 : kd === 1 ? 0.1 : 0.04);
      const nz = Math.sin(t * 13 + ph) * 0.5 + Math.sin(t * 29 + ph * 1.7) * 0.3 + (kd === 2 ? Math.sin(t * 47 + ph) * 0.3 : 0); sl.p.intensity = 6.5 * cur.ptI * (l.i === undefined ? 1 : l.i) * lv * sl.w * Math.max(0.2, 1 + fl * nz); }
  }
  // the beams of the rig, mirrored on the CPU for the two real spot lights (same formulas as the vertex shader in fx_vfx)
  function beamTarget(i, t, out) {
    const U = vfx.U; if (!U) return out.set(0, 0, 0); const rp = vfx.rigPos, ph = rp[i * 4 + 3], sp = 0.55 + (i % 3) * 0.22;
    if (S.beamMode < 0.5) { const a1 = t * sp * 0.8 + ph * 6.283, a2 = t * sp * 0.57 + ph * 11; return out.set(U.uCtr.value.x + Math.cos(a1) * U.uExt.value.x * 0.8, 0, U.uCtr.value.z + Math.sin(a2) * U.uExt.value.y * 0.8); }
    return out.set(U.uStageC.value.x + Math.cos(ph * 6.283) * 0.9 + Math.sin(t * 0.5 * sp + ph * 9) * 0.4, 0, U.uStageC.value.z + Math.sin(ph * 6.283) * 0.5 + Math.cos(t * 0.4 * sp + ph * 7) * 0.25);
  }
  function updateSpots(t) {
    if (!spotsOn || !vfx.rigPos) return; const amt = S.beams, n = q === 'low' ? 1 : 2, rp = vfx.rigPos;
    for (let i = 0; i < spots.length; i++) { const sp = spots[i]; const bi = S.beamMode > 0.5 ? i : i + 1; // stage: beam 0 (key) + 1; club: beams 1 and 2 (the two theme colours)
      if (amt < 0.01 || i >= n) { sp.intensity = 0; continue; }
      sp.position.set(rp[bi * 4], rp[bi * 4 + 1], rp[bi * 4 + 2]); beamTarget(bi, t, tmpD); sp.target.position.copy(tmpD);
      if (S.beamMode > 0.5 && i === 0) sp.color.copy(S.keyCol); else sp.color.copy(i === 0 ? S.themeA : S.themeB); sp.angle = S.beamMode > 0.5 ? 0.42 : 0.55; sp.intensity = 9 * amt * (1 + 0.6 * S.beatFx); }
  }
  S.t = 0;
  function tEff() { let v = tCur; if (pw.club > 0) v = v + (1 - v) * pw.club; if (pw.stage > 0) v = Math.max(v, 0.85 * pw.stage); return v; }
  function setProf(name, instant) {
    if (PROFILES.indexOf(name) < 0) return; S.profile = name; pwT.club = name === 'club' ? 1 : 0; pwT.studio = name === 'studio' ? 1 : 0; pwT.stage = name === 'stage' ? 1 : 0;
    if (name === 'club' || name === 'stage') ensureSpots(); if (instant || !started) { pw.club = pwT.club; pw.studio = pwT.studio; pw.stage = pwT.stage; }
  }
  const api = {
    group, state: S,
    // v: 'day' | 'dusk' | 'night' | nightness 0..1 (the game's Core.nightness). Big jumps ramp over ~1.2 s, small steps (the game clock, once a second) are followed smoothly.
    setTimeOfDay(v, instant) {
      const n = v === 'day' ? 0 : v === 'dusk' ? 0.5 : v === 'night' ? 1 : Math.min(1, Math.max(0, +v || 0));
      if (instant || first || !started) { tTarget = n; tFrom = tTo = tCur = n; tRamp = 1; tFollow = false; first = false; tEffLast = tEff(); sample(tEffLast); finalize(); applyState(); return; }
      if (Math.abs(n - tTo) < 1e-5) return; tTo = n; tTarget = n;
      if (Math.abs(n - tCur) < 0.045) { tFollow = true; tRamp = 1; } else { tFollow = false; tFrom = tCur; tRamp = 0; }
    },
    setWeather(w, instant) { const on = w === 'rain'; S.weather = on ? 'rain' : 'clear'; rainTarget = on ? 1 : 0; if (instant || !started) { rainLin = rainTarget; S.rain = rainLin * rainLin * (3 - 2 * rainLin); } },
    setBeat(b) { beatTarget = Math.min(1, Math.max(0, +b || 0)); },
    setProfile(p, instant) { setProf(p, instant); },
    setStageTheme(name, instant) { const t = THEMES[name]; if (!t) return; S.theme = name; themeTarget = t; if (instant || !started) { S.themeA.copy(t.a); S.themeB.copy(t.b); S.keyCol.copy(t.key); } },
    setReduce(b) { reduce = !!b; },
    setClock(c) { if (c) { S.hour = c.hour; S.day = c.day; } },
    follow(o) { followObj = o || null; },
    setMusic(on) { vfx.setMusic(on); },
    setQuality(v) {
      if (!TR[v]) return; q = v; vfx.setQuality(v); post.setQuality(v); if (weather) weather.setQuality(v);
      const t = TR[v], hold = SH && SH.shadowMap && !SH.shadowMap.isRenderTarget ? SH.shadowMap : null;
      if (sh.mapSize.x !== t.shadow) { sh.mapSize.set(t.shadow, t.shadow); if (sh.map) { if (hold && hold.map === sh.map) hold.map = null; sh.map.dispose(); sh.map = null; } }
      if (hold && !sh.map && hold.map && hold.map.width === t.shadow) sh.map = hold.map; // the host's one shadow map: reuse it when the size matches
      texel = 30 / t.shadow;
      if (!IN) lampLights.forEach((p, i) => { p.visible = i < t.lights; }); finalize(); applyState();
    },
    resize(w, h, dpr) { W = w; H = h; post.resize(w, h, dpr); vfx.setPixelHeight(h * dpr); if (weather) weather.setPixelHeight(h * dpr); },
    update(dt, t) {
      if (disposed) return; started = true; S.t = t; skyU.uTime.value = t;
      // time: a fixed 1.2 s ease for jumps, an exponential follow for small steps
      if (tFollow) { tCur += (tTo - tCur) * (1 - Math.exp(-dt * 3)); if (Math.abs(tTo - tCur) < 0.0004) { tCur = tTo; tFollow = false; } }
      else if (tRamp < 1) { tRamp = Math.min(1, tRamp + dt / TIME_RAMP); tCur = tFrom + (tTo - tFrom) * ss(tRamp); }
      // weather, profile weights, beat, theme: all eased
      if (Math.abs(rainTarget - rainLin) > 1e-4) { const st = dt / 2.2; rainLin = rainLin < rainTarget ? Math.min(rainTarget, rainLin + st) : Math.max(rainTarget, rainLin - st); S.rain = rainLin * rainLin * (3 - 2 * rainLin); }
      const pst = dt / 0.9; for (const k in pw) { if (pw[k] !== pwT[k]) pw[k] = pw[k] < pwT[k] ? Math.min(pwT[k], pw[k] + pst) : Math.max(pwT[k], pw[k] - pst); }
      S.beat += (beatTarget - S.beat) * (1 - Math.exp(-dt * (beatTarget > S.beat ? 40 : 8))); if (S.beat < 0.002 && beatTarget === 0) S.beat = 0; S.beatFx = S.beat;
      const kt = 1 - Math.exp(-dt * 4); S.themeA.lerp(themeTarget.a, kt); S.themeB.lerp(themeTarget.b, kt); S.keyCol.lerp(themeTarget.key, kt);
      const te = tEff(); if (Math.abs(te - tEffLast) > 1e-5) { tEffLast = te; sample(te); }
      finalize();
      // follow target (explicit, else the player in window.__park, else the spawn point)
      let tgt = followObj; if (!tgt && typeof window !== 'undefined' && window.__park && window.__park.player) tgt = window.__park.player.object;
      if (tgt) { tgt.getWorldPosition(fpos); } else { const s = anchors.start || { x: 0, z: 10 }; fpos.set(s.x, 0, s.z); }
      applyState();
      // sun shadow camera: centre on the target, snapped to shadow-texel steps in light space so the shadows do not shimmer when the target moves
      const d = S.sunDir; tmpA.crossVectors(UP, d).normalize(); tmpB.crossVectors(d, tmpA); // light-space x and y axes
      const px = Math.round(tmpA.dot(fpos) / texel) * texel, py = Math.round(tmpB.dot(fpos) / texel) * texel, pz = d.dot(fpos);
      if (IN) { sun.target.position.copy(S.inCtr); sun.position.copy(S.inCtr).addScaledVector(d, 40); rim.target.position.copy(S.inCtr); const bk = pw.stage; tmpC.copy(RIMDIR).lerp(RIMDIR_BACK, bk).normalize(); rim.position.copy(S.inCtr).addScaledVector(tmpC, 30); updatePractical(dt, t, fpos); updateSpots(t); }
      else { tmpC.set(0, 0, 0).addScaledVector(tmpA, px).addScaledVector(tmpB, py).addScaledVector(d, pz); sun.target.position.copy(tmpC); sun.position.copy(tmpC).addScaledVector(d, 55);
      rim.target.position.copy(fpos); rim.position.add(fpos); }
      sky.position.copy(camera.position); if (IN) sky.visible = false;
      vfx.update(dt, t, fpos.x, fpos.z); if (weather) weather.update(dt, t, fpos.x, fpos.z); post.update(t);
      evAcc += dt; if (evAcc > 0.1 && (Math.abs(tTo - tCur) > 0.001 || tRamp < 1) && ctx.events) { evAcc = 0; ctx.events.emit('timeofday', S); }
      const now = performance.now(); if (now - winScan > 2000) { winScan = now; scene.traverse(scanCb); }
    },
    post,
    render() { post.render(); },
    getState() { return S; }, debug() { return { tint: tintMats.length, win: winMats.length, winScan }; },
    stats() { return { sceneCalls: post.stats.sceneCalls, sceneTris: post.stats.sceneTris, totalCalls: post.stats.totalCalls, composer: post.active, rung: post.stats.rung, quality: q, vfxDraws: IN ? 5 : 5 + 1, rain: S.rain, profile: S.profile, weatherTier: weather ? weather.tier() : null }; },
    // complete teardown: every geometry, material, texture, shadow map and (unshared) render target this module made. A shared post is only unbound, never disposed.
    dispose() {
      if (disposed) return; disposed = true;
      if (ownPost) post.dispose(); else post.unbind(S);
      if (SH && SH.shadowMap && !SH.shadowMap.isRenderTarget && sh.map) { if (SH.shadowMap.map && SH.shadowMap.map !== sh.map) SH.shadowMap.map.dispose(); SH.shadowMap.map = sh.map; sh.map = null; } // the host's shadow map survives for the next world
      if (weather) weather.dispose(); vfx.dispose(); disposeTree(group); if (group.parent) group.parent.remove(group);
      if (scene.fog === fog) scene.fog = null; if (scene.background && scene.background.isColor) scene.background = null;
      if (ownPost) renderer.info.autoReset = true; tintMats.length = 0; winMats.length = 0;
    },
  };
  api.setQuality(q); setProf(S.profile, true); api.setTimeOfDay(ctx.todInit !== undefined ? ctx.todInit : 'dusk', true);
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
