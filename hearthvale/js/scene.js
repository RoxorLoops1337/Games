// Three.js view of the valley: terrain, villages, villagers, camera and picking.
import * as THREE from 'three';
import { box, cyl, cone, ball, mat } from './models.js';
import { treeModel, rockModel, clayModel, stumpModel, boardModel, fieldModel, plazaModel, plotModel, islandModel, lanternMat as envLantern } from '../art/environment.js';
import { BUILD, farmModel, setFarmStage, constructionSite, windowMat, lanternMat } from '../art/buildings.js';
import { villagerModel, setPose, setMood } from '../art/characters.js';
import { sheepModel, cowModel, chickenModel, bunnyModel, puppyModel, kittenModel, snailModel, froggyModel, ducklingModel, birdModel, cloudModel, butterflyModel, animateCritter, cloudMat } from '../art/critters.js';
import { Fx } from '../art/fx.js';
import { picnicModel, flowerCartModel, swingModel, hammockModel, birdBathModel, pumpkinPatchModel, beeSkepModel, animateProp, lampPostModel, mailboxModel, lampMat, lanternMat as propLantern, flameMat } from '../art/props.js';
import { Post } from './post.js';
import { TIERS, ORDER, detectTier, startPixelRatio, Adaptive, loadChoice, saveChoice, loadCap, saveCap, isSoftwareRenderer } from './quality.js';
import { PLOT, VALLEY_FIELDS, VALLEY_FIELD_RADIUS, BUILDINGS, NODE_TYPES } from '../shared/data.js';

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    // MSAA lives in the post render target (the canvas itself only receives one full-screen grade pass), so no antialias on the canvas
    const r = this.r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.frameMs = 16; this.frames = 0; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.skyMask = { value: 0 };   // 0 = sky pixels write alpha 0 into the post target (grade pass skips tone mapping for them), 1 = direct rendering
    this.initQuality();
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    const s = this.scene = new THREE.Scene(); s.background = new THREE.Color('#a9dcf3'); s.fog = new THREE.Fog('#bfe6f7', 70, 190);
    this.cam = new THREE.PerspectiveCamera(42, 1, 0.5, 600);
    // sky dome: vivid gradient from a bright horizon to a deep-blue zenith, plus a glowing sun that crosses the sky
    this.skyU = { uMask: this.skyMask, top: { value: new THREE.Color('#6ec6ff') }, mid: { value: new THREE.Color('#bfeaff') }, hor: { value: new THREE.Color('#f4fbff') } };
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), new THREE.ShaderMaterial({ uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uMask; uniform vec3 top; uniform vec3 mid; uniform vec3 hor; varying vec3 vP; void main(){ float h = clamp(vP.y, 0.0, 1.0); vec3 c = mix(hor, mid, smoothstep(0.0, 0.25, h)); c = mix(c, top, smoothstep(0.2, 0.9, h)); gl_FragColor = vec4(c, uMask); }' }));
    this.dome.renderOrder = -10; this.dome.frustumCulled = false; s.add(this.dome);
    { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.18, 'rgba(255,240,180,0.95)'); gr.addColorStop(0.45, 'rgba(255,214,140,0.35)'); gr.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, depthTest: false, fog: false, toneMapped: false, blending: THREE.AdditiveBlending })); this.sunGlow.scale.set(150, 150, 1); this.sunGlow.renderOrder = -9; s.add(this.sunGlow); }
    this.look = { x: 0, z: 0, dist: 34, yaw: 0.0, pitch: 0.95 }; this.goal = { ...this.look };
    const hemi = this.hemi = new THREE.HemisphereLight('#dff3ff', '#7da05a', 1.05); s.add(hemi);
    const sun = this.sun = new THREE.DirectionalLight('#fff1d0', 2.4); sun.castShadow = true; sun.shadow.mapSize.set(1536, 1536);
    const sc = sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 140; sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.06; sun.shadow.radius = 2.5;
    s.add(sun, sun.target);
    // warm rim light from behind the scene (intensity is a pure function of time and tier; the light always exists so no shader recompiles)
    const rim = this.rim = new THREE.DirectionalLight('#ffd6b0', 0); rim.castShadow = false; s.add(rim, rim.target);
    this.pickables = []; this.fieldMeshes = {};
    this.buildTerrain(); this.buildLife(); this.buildAtmosphere();
    this.villages = new Map(); this.villagers = new Map(); this.mixers = [];
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); this.ray = new THREE.Raycaster();
    this.fx = new Fx(this.scene); this.patchFx(); this.t = 0; this.ghost = null; this.sel = null;
    this.selRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false }));
    this.selRing.rotation.x = -Math.PI / 2; this.selRing.visible = false; this.selRing.renderOrder = 10; s.add(this.selRing);
    this.initJuice(); this.startQuality(); addEventListener('resize', () => this.resize());
  }
  resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight; this.r.setPixelRatio(this.pr); this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    if (this.post && this.tc) { const v = this.r.getDrawingBufferSize(this._sz || (this._sz = new THREE.Vector2())); this.post.configure(this.tc, v.x, v.y); }
  }

  // ================= quality system (tiers live in quality.js, passes in post.js) =================
  initQuality() {
    const r = this.r, gl = r.getContext(); let rs = '';
    try { const e = gl.getExtension('WEBGL_debug_renderer_info'); rs = e ? String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL)) : ''; } catch { /* hidden */ }
    this.gpu = rs; const soft = isSoftwareRenderer(rs), wd = !!navigator.webdriver;
    let mode = loadChoice(); try { const q = new URLSearchParams(location.search).get('q'); if (q === 'auto' || TIERS[q]) mode = q; } catch { /* no url */ }
    this._mode = mode; this.dpr = Math.min(devicePixelRatio || 1, 3);
    const ua = navigator.userAgent || '', mobile = /Android|iPhone|iPad|iPod|Mobi/i.test(ua) || ((navigator.maxTouchPoints || 0) > 1 && innerWidth < 1100);
    // automation (screenshots) runs on a software rasteriser: show the best look there instead of the phone-safe one
    this._env = { renderer: rs, dpr: this.dpr, mem: navigator.deviceMemory || 0, cores: navigator.hardwareConcurrency || 0, mobile, width: innerWidth, height: innerHeight, software: soft && !wd, cap: loadCap() };
    const tier = mode === 'auto' ? (wd && soft ? 'high' : detectTier(this._env)) : mode;
    this._tier = tier; this.pr = startPixelRatio(tier, this.dpr); this.prMax = this.pr;
    this.ctl = new Adaptive({ tier, pr: this.pr, prMax: this.pr, prMin: 0.75, enabled: mode === 'auto' && !wd });
    this.postOK = Post.supported(r); this.cssFilter = '';
  }
  startQuality() {
    if (this.postOK) { this.post = new Post(this.r, this.scene, this.cam); this.r.info.autoReset = false; }
    this.applyTier(this._tier, true);
  }
  /** 'auto' | 'low' | 'medium' | 'high' (persisted in localStorage 'hearthvale.quality') */
  setQuality(q) {
    if (q !== 'auto' && !TIERS[q]) return; this._mode = q; saveChoice(q);
    if (q === 'auto') { const t = navigator.webdriver ? this._tier : detectTier(this._env); this.pr = startPixelRatio(t, this.dpr); this.prMax = this.pr; this.ctl.prMax = this.pr; this.ctl.pr = this.pr; this.ctl.setTier(t); this.ctl.enabled = !navigator.webdriver; this.applyTier(t); }
    else { this.ctl.enabled = false; this.pr = startPixelRatio(q, this.dpr); this.applyTier(q); }
  }
  get quality() { return this._mode; }
  get tier() { return this._tier; }
  applyTier(t, now) {
    const c = TIERS[t]; this._tier = t; this._want = t;
    const go = () => { if (this._want !== t) return; this.tc = c; this.applyScene(c); this.resize(); this.canvas.dataset.tier = t; };
    if (this.post && !now) this.post.prepare(c).then(go); else go();
  }
  applyScene(c) {
    const post = !!this.post; this.skyMask.value = post ? 0 : 1; this.cssFilter = post ? 'none' : ''; this.canvas.style.filter = post ? 'none' : '';
    const sh = this.sun.shadow; if (c.shadow && sh.mapSize.x !== c.shadow) { sh.mapSize.set(c.shadow, c.shadow); if (sh.map) { sh.map.dispose(); sh.map = null; } }
    this.fxBoost.value = post && c.bloom ? 2.2 : 1;
  }

  // ================= atmosphere: cloud shadows, water glints, sparkle boost =================
  buildAtmosphere() {
    const N = 128, d = new Uint8Array(N * N * 4), rnd = (() => { let a = 1337; return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296); })();
    const oct = [[4, 0.55], [8, 0.3], [16, 0.15]], grids = oct.map(([g]) => Array.from({ length: g * g }, rnd));
    const sm = (x) => x * x * (3 - 2 * x);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let v = 0; for (let o = 0; o < 3; o++) { const g = oct[o][0], gx = (x / N) * g, gy = (y / N) * g, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = sm(gx - x0), fy = sm(gy - y0), G = grids[o], i = (a, b) => G[((b % g) * g) + (a % g)];
        v += oct[o][1] * ((i(x0, y0) * (1 - fx) + i(x0 + 1, y0) * fx) * (1 - fy) + (i(x0, y0 + 1) * (1 - fx) + i(x0 + 1, y0 + 1) * fx) * fy); }
      const k = (y * N + x) * 4; d[k] = d[k + 1] = d[k + 2] = Math.min(255, v * 255 * 1.1); d[k + 3] = 255;
    }
    const tex = new THREE.DataTexture(d, N, N, THREE.RGBAFormat); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
    this.cloudU = { uTex: { value: tex }, uT: { value: 0 }, uAmt: { value: 0.2 }, uCol: { value: new THREE.Color('#7e74d0') } };
    const cs = this.cloudShadow = new THREE.Mesh(new THREE.PlaneGeometry(170, 170), new THREE.ShaderMaterial({ uniforms: this.cloudU, transparent: true, depthWrite: false,
      vertexShader: 'varying vec2 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: 'uniform sampler2D uTex; uniform float uT; uniform float uAmt; uniform vec3 uCol; varying vec2 vW; void main(){ vec2 p = vW * 0.011 + vec2(uT * 0.0075, uT * 0.0035); float n = texture2D(uTex, p).r * 0.7 + texture2D(uTex, p * 2.7 + 0.37).r * 0.3; float sh = smoothstep(0.5, 0.74, n); float e = 1.0 - smoothstep(56.0, 74.0, length(vW)); float a = sh * uAmt * e; if (a < 0.003) discard; gl_FragColor = vec4(uCol, a); }' }));
    cs.rotation.x = -Math.PI / 2; cs.position.y = 0.32; cs.renderOrder = 3; cs.frustumCulled = false; cs.raycast = () => {}; this.scene.add(cs);
    // sea: sun glints that follow the sun, tiny caustic net (high), on top of the art module's own shader
    this.waterU = { uSunW: { value: new THREE.Vector3(0.4, 0.8, 0.4) }, uSunC: { value: new THREE.Color('#fff2d0') }, uGlint: { value: 1 } };
    const ocean = this.island.getObjectByName('ocean');
    if (ocean && ocean.material.onBeforeCompile) {
      const om = ocean.material, prev = om.onBeforeCompile, U = this.waterU;
      om.onBeforeCompile = (sh, rr) => { prev(sh, rr); Object.assign(sh.uniforms, U);
        sh.fragmentShader = sh.fragmentShader.replace('uniform float uWindT;', 'uniform float uWindT; uniform vec3 uSunW; uniform vec3 uSunC; uniform float uGlint;').replace('#include <opaque_fragment>',
          `{ vec3 wp = vec3( vSea.x, -4.2, vSea.y ); vec3 V = normalize( cameraPosition - wp );
            float rx = cos( vSea.x * 1.7 + uWindT * 1.3 + sin( vSea.y * 0.9 ) * 1.4 ) * 0.55 + cos( vSea.x * 4.1 - uWindT * 2.1 + vSea.y * 2.3 ) * 0.3;
            float rz = cos( vSea.y * 1.5 - uWindT * 1.1 + sin( vSea.x * 0.8 ) * 1.2 ) * 0.55 + cos( vSea.y * 3.7 + uWindT * 1.9 - vSea.x * 2.7 ) * 0.3;
            vec3 N = normalize( vec3( rx * 0.2, 1.0, rz * 0.2 ) ); vec3 H = normalize( normalize( uSunW ) + V ); float nh = max( dot( N, H ), 0.0 );
            outgoingLight += uSunC * ( pow( nh, 110.0 ) * 0.85 + pow( nh, 16.0 ) * 0.1 ) ;
            float cau = pow( 1.0 - abs( sin( vSea.x * 0.7 + sin( vSea.y * 0.55 + uWindT * 0.6 ) * 1.6 ) * sin( vSea.y * 0.8 + sin( vSea.x * 0.5 - uWindT * 0.5 ) * 1.4 ) ), 6.0 );
            outgoingLight += vec3( 0.5, 0.75, 0.7 ) * cau * 0.1 * uGlint; }
          #include <opaque_fragment>`); };
      om.customProgramCacheKey = () => 'hvsea2'; om.needsUpdate = true;
    }
    // clouds sit in the sky: they write the sky mask too
    this.cloudsPatched = true; const prevC = cloudMat.onBeforeCompile; cloudMat.onBeforeCompile = (sh, rr) => { prevC && prevC.call(cloudMat, sh, rr); sh.uniforms.uSkyMask = this.skyMask; sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform float uSkyMask;\nvoid main() {').replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a = uSkyMask;'); };
    cloudMat.customProgramCacheKey = () => 'hvcloud'; cloudMat.needsUpdate = true;
  }
  /** sparkles and other additive particles get an HDR boost so bloom can pick them up (value 1 when bloom is off) */
  patchFx() {
    this.fxBoost = { value: 1 };
    this.scene.traverse((o) => { const m = o.material; if (m && m.isShaderMaterial && m.uniforms && m.uniforms.uLight && m.blending === THREE.AdditiveBlending && m.fragmentShader.includes('* uLight, a)')) {
      m.uniforms.uBoost = this.fxBoost; m.fragmentShader = 'uniform float uBoost;\n' + m.fragmentShader.replace('* uLight, a)', '* uLight * uBoost, a)'); m.needsUpdate = true; } });
  }

  // ================= camera juice =================
  initJuice() { this._shk = { amt: 0, t: 0, dur: 0 }; this._pt = 0; this._pv = 0; this._flash = { r: 1, g: 1, b: 1, a: 0, rate: 3 }; this._photo = false; this._intro = null; this._introSeen = false;
    this.flashMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false, fog: false })); this.flashMesh.renderOrder = 1000; this.flashMesh.frustumCulled = false; this.flashMesh.visible = false; this.flashMesh.raycast = () => {}; this.scene.add(this.flashMesh); }
  /** screen shake: amount in world units (0.1 gentle .. 0.6 strong) fading out over `seconds` */
  shake(amount = 0.3, seconds = 0.4) { const s = this._shk, left = Math.max(0, 1 - s.t / (s.dur || 1)) * s.amt; if (amount >= left) { s.amt = amount; s.t = 0; s.dur = Math.max(0.05, seconds); } }
  /** quick zoom pulse: amount 0..0.3 (fraction of the camera distance) */
  punch(amount = 0.06) { this._pt = Math.max(this._pt, Math.min(0.35, amount)); }
  /** full-screen colour flash that fades out: flash('#fff', 0.5) */
  flash(color = '#ffffff', alpha = 0.5, seconds = 0.35) { const c = new THREE.Color(color); this._flash = { r: c.r, g: c.g, b: c.b, a: Math.min(1, alpha), rate: Math.min(1, alpha) / Math.max(0.05, seconds) }; }
  /** cinematic fly-in from a high, wide, slightly turned view down to wherever the camera goal is */
  intro(seconds = 3.6) { const L = this.look; this._intro = { t: 0, dur: seconds, d: L.dist * 2.1, yaw: L.yaw + 0.85, pitch: Math.max(0.5, L.pitch - 0.35) };
    if (!this._introHook) { this._introHook = () => this.cancelIntro(); this.canvas.addEventListener('pointerdown', this._introHook); this.canvas.addEventListener('wheel', this._introHook, { passive: true }); } }
  cancelIntro() { this._intro = null; }
  /** slow orbit photo mode: the camera drifts around the target, tilt-shift and vignette are a touch stronger */
  photo(on) { this._photo = on === undefined ? !this._photo : !!on; return this._photo; }
  get photoMode() { return this._photo; }

  // shadows are the expensive pass: only buildings, trees and the board cast them; everything small has a soft ground blob instead
  noCast(root, keep = null) { root.traverse(o => { if (o.isMesh && !(keep && keep(o))) o.castShadow = false; }); return root; }

  buildTerrain() {
    const s = this.scene;
    this.island = islandModel(72); this.noCast(this.island, o => o.name === 'forest'); s.add(this.island);
    s.add(this.noCast(plazaModel(9)));
    // the valley square: notice board + the four shared fields
    const board = boardModel(); board.position.set(0, 0.1, 0); s.add(board); this.board = board;
    board.traverse(o => { if (o.isMesh) o.userData.pick = { k: 'board' }; }); this.pickables.push(board);
    for (const f of VALLEY_FIELDS) {
      const g = fieldModel(f.type, f.ang); g.position.set(Math.cos(f.ang) * VALLEY_FIELD_RADIUS, 0, Math.sin(f.ang) * VALLEY_FIELD_RADIUS);
      this.noCast(g); g.userData.stuff = g.getObjectByName('stuff') || g; g.userData.type = f.type;
      g.traverse(o => { if (o.isMesh) o.userData.pick = { k: 'valley', id: f.id }; }); this.pickables.push(g);
      s.add(g); this.fieldMeshes[f.id] = g;
    }
    // picnic spots and play things in the four meadows between the fields
    this.props = [];
    const put = (m, ang, r, face = 0) => { this.noCast(m); m.position.set(Math.cos(ang) * r, 0.1, Math.sin(ang) * r); m.rotation.y = face; s.add(m); this.props.push(m); return m; };
    const q = Math.PI / 4;
    put(picnicModel(), q, 17, 0.6); put(beeSkepModel(), q + 0.25, 19.5, 0.3);
    put(flowerCartModel(), 3 * q, 16.5, -0.5); put(pumpkinPatchModel(), 3 * q - 0.3, 20, 0);
    put(swingModel(), 5 * q, 17.5, 0.4); put(birdBathModel(), 5 * q + 0.3, 14.5, 0);
    put(hammockModel(), 7 * q, 17.5, -0.4);
  }

  buildLife() {
    const s = this.scene; this.clouds = []; this.flies = []; this.critters = [];
    for (let i = 0; i < 12; i++) { const c = cloudModel(i); c.position.set((i * 37) % 240 - 120, 84 + (i % 4) * 6, ((i * 53) % 200) - 100); c.scale.setScalar(3.4 + (i % 3) * 1.2); c.userData.sky = true; s.add(c); this.clouds.push(c); }
    const cols = ['#ffd84a', '#ff9ec7', '#ffffff', '#9ad0ff'];
    for (let i = 0; i < 14; i++) { const b = this.noCast(butterflyModel(cols[i % 4])); const a = (i / 14) * Math.PI * 2, r = 12 + (i % 7) * 6; b.userData = { ...b.userData, cx: Math.cos(a) * r, cz: Math.sin(a) * r, ph: i, sp: 0.4 + (i % 5) * 0.12, rad: 1.5 + (i % 3) }; s.add(b); this.flies.push(b); }
    // farm life on the valley meadow: wanderers pick a random spot near home every few seconds
    const mk = (kind, build, n, home, rad, speed) => { for (let i = 0; i < n; i++) { const m = this.noCast(build(i)); const a = i * 2.4 + home.a, r = rad * (0.4 + 0.6 * ((i * 7) % 10) / 10); const hx = home.x + Math.cos(a) * r, hz = home.z + Math.sin(a) * r; m.position.set(hx, 0, hz); m.userData = { ...m.userData, kind, hx: home.x, hz: home.z, rad, speed, tx: hx, tz: hz, wait: Math.random() * 3, mode: 'idle', seed: i }; s.add(m); this.critters.push(m); } };
    mk('sheep', (i) => sheepModel(i), 6, { x: -2, z: 6, a: 0 }, 8, 0.9);
    mk('cow', (i) => cowModel(i), 3, { x: 6, z: -6, a: 1 }, 5, 0.6);
    mk('chicken', (i) => chickenModel(i), 5, { x: 0, z: 0, a: 2 }, 7.5, 1.1);
    mk('bunny', (i) => bunnyModel(i), 3, { x: -7, z: -4, a: 0.5 }, 6, 1.6);
    mk('puppy', (i) => puppyModel(i), 2, { x: 4, z: 3, a: 0.3 }, 6, 2.0);
    mk('kitten', (i) => kittenModel(i), 3, { x: -5, z: -2, a: 1.1 }, 5, 1.2);
    mk('snail', (i) => snailModel(i), 4, { x: 8, z: 9, a: 0 }, 5, 0.12);
    mk('froggy', (i) => froggyModel(i), 3, { x: -9, z: 8, a: 0.4 }, 4, 0.4);
    mk('duckling', (i) => ducklingModel(i), 4, { x: 0, z: -9, a: 0 }, 4, 0.7);
    this.birds = []; for (let i = 0; i < 7; i++) { const b = this.noCast(birdModel(i)); b.userData = { ...b.userData, ph: i * 0.9, rad: 22 + (i % 4) * 9, h: 14 + (i % 3) * 4, sp: 0.12 + (i % 3) * 0.03, cx: (i % 2 ? 1 : -1) * 10, cz: (i % 3 - 1) * 12 }; s.add(b); this.birds.push(b); }
    // rain: one LineSegments, positions recycled around the camera target
    const N = 700, pos = new Float32Array(N * 6); this.rainPos = pos; this.rainN = N;
    for (let i = 0; i < N; i++) { const x = (Math.random() - 0.5) * 60, y = Math.random() * 30, z = (Math.random() - 0.5) * 60; pos.set([x, y, z, x - 0.12, y - 0.9, z], i * 6); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#cfe6ff', transparent: true, opacity: 0.55 })); this.rain.frustumCulled = false; this.rain.visible = false; s.add(this.rain);
    this.rainAmt = 0; this.wet = 0;
    this.winMat = windowMat; this.lanternMat = lanternMat;
  }
  // t = shared world seconds, so every player sees the same sun
  // shared weather: a hash of the world's 4-minute block decides if it rains (about one block in four)
  weatherAt(t) { const k = Math.floor(t / 240); const h = Math.sin(k * 12.9898 + 4.1414) * 43758.5453; const r = h - Math.floor(h); return r < 0.26 ? 1 : 0; }
  // Lighting is a PURE function of (world time, rain) evaluated every frame: nothing accumulates, so nothing can flicker.
  setTime(t) {
    // the render clock follows the server clock smoothly (never jumps), so light changes are gentle even on a laggy phone
    if (this.worldT === undefined || Math.abs(t - this.worldT) > 30) this.worldT = t; else this.worldT += Math.max(-0.5, Math.min(0.5, t - this.worldT)) * 0.25;
    this.rainGoal = this.weatherAt(t);
  }
  applyLight(dt) {
    const t = (this.worldT = (this.worldT || 0) + dt);
    this.rainAmt += ((this.rainGoal || 0) - this.rainAmt) * Math.min(1, dt * 0.5); const ra = this.rainAmt;
    const ph = ((t / 360) % 1 + 1) % 1, a = (ph - 0.25) * Math.PI * 2, sn = Math.sin(a);
    // a long sunny day, a short golden dusk and a gentle bright-lavender night (never gloomy)
    const sm = (x, e0, e1) => { const k = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return k * k * (3 - 2 * k); };
    const day = sm(sn, -0.3, 0.2), dusk = Math.max(0, 1 - Math.abs(sn + 0.05) * 3.4);
    const C = this._C || (this._C = { sky: new THREE.Color(), tmp: new THREE.Color(), white: new THREE.Color('#ffffff'),
      topD: new THREE.Color('#5fbfff'), midD: new THREE.Color('#aee6ff'), horD: new THREE.Color('#fff8ec'),
      topN: new THREE.Color('#6f7fe0'), midN: new THREE.Color('#9aa6f2'), horN: new THREE.Color('#d6d0ff'),
      topS: new THREE.Color('#7fa8ff'), midS: new THREE.Color('#ffb8a0'), horS: new THREE.Color('#ffe0a8'), grey: new THREE.Color('#c4d2e2') });
    const U = this.skyU; U.top.value.copy(C.topN).lerp(C.topD, day).lerp(C.topS, dusk * 0.55).lerp(C.grey, ra * 0.5);
    U.mid.value.copy(C.midN).lerp(C.midD, day).lerp(C.midS, dusk * 0.75).lerp(C.grey, ra * 0.6);
    U.hor.value.copy(C.horN).lerp(C.horD, day).lerp(C.horS, dusk * 0.85).lerp(C.grey, ra * 0.65);
    this.scene.background.copy(U.mid.value); this.scene.fog.color.copy(U.hor.value);
    this.scene.fog.near = 100 + this.look.dist * 1.3 - 50 * ra; this.scene.fog.far = 260 + this.look.dist * 1.3 - 120 * ra;
    this.dome.position.copy(this.cam.position);
    // the sun glow crosses the sky (west to east over the valley) and warms at the horizon
    this.sunGlow.position.set(this.cam.position.x + Math.cos(a) * 280, this.cam.position.y + Math.max(0.04, sn) * 260 - 10, this.cam.position.z - 120);
    this.sunGlow.visible = sn > -0.05 && ra < 0.7; this.sunGlow.material.opacity = Math.min(1, (sn + 0.05) * 5) * (1 - ra); this.sunGlow.material.color.set('#ffffff').lerp(C.tmp.set('#ffb070'), dusk * 0.6);
    // high-key light: strong soft fill from the hemisphere so shadows stay bright, a golden sun, a lavender moon
    this.sun.intensity = (1.5 + 0.62 * day) * (1 - 0.3 * ra); this.sun.color.set('#c9d2ff').lerp(C.tmp.set('#fff1cf'), day).lerp(C.tmp.set('#ffb070'), dusk * 0.5);
    this.hemi.intensity = 1.3 + 0.62 * day + 0.2 * ra; this.hemi.color.set('#b5c2ff').lerp(C.tmp.set('#ecefff'), day); this.hemi.groundColor.set('#9ccc78').lerp(C.tmp.set('#b4ea84'), day);
    this.night = 1 - day;
    this.winMat.emissiveIntensity = Math.max(0, 1 - day * 1.6) * 1.6; this.lanternMat.emissiveIntensity = (1 - day) * 2.4; envLantern.emissiveIntensity = (1 - day) * 2.4; lampMat.emissiveIntensity = 0.25 + (1 - day) * 2.2; propLantern.emissiveIntensity = 0.25 + (1 - day) * 2.2;
    cloudMat.color.set('#ffffff').lerp(C.tmp.set('#8d9cc8'), (1 - day) * 0.8); this.fx.setLight && this.fx.setLight(0.4 + 0.6 * day);
    this.r.toneMappingExposure = 1.1 + 0.04 * day;
    // everything below is also a pure function of (time, rain, tier)
    this._sn = sn; this._dusk = dusk; this._day = day; const tc = this.tc || TIERS.medium, sunUp = sm(sn, -0.02, 0.14) * (1 - ra);
    this.rim.intensity = tc.rim * 0.6 * day * (1 - 0.6 * ra); this.rim.color.set('#ffd6b0').lerp(C.tmp.set('#ffb98a'), dusk * 0.6);
    this.cloudU.uAmt.value = tc.cloudShadow * 0.21 * day * (1 - ra); this.cloudU.uT.value = this.t; this.cloudShadow.visible = this.cloudU.uAmt.value > 0.004;
    const W = this.waterU; W.uSunW.value.set(Math.cos(a) * 280, Math.max(0.04, sn) * 260 - 10, -120).normalize();
    W.uSunC.value.set('#fff2d0').lerp(C.tmp.set('#ffb070'), dusk * 0.6).multiplyScalar(tc.water ? (0.25 + 0.75 * sunUp) * 1.1 : 0); W.uGlint.value = tc.water > 1 ? 1 : 0;
  }
  // shadow camera: tight around the look target, in quantised steps and snapped to shadow texels so panning never shimmers
  shadowFollow(L) {
    const sun = this.sun, sc = sun.shadow.camera, e = Math.ceil(Math.max(22, Math.min(40, L.dist * 1.1)) / 2) * 2, size = sun.shadow.mapSize.x || 1536;
    if (Math.abs(sc.right - e) > 0.5) { sc.left = -e; sc.right = e; sc.top = e; sc.bottom = -e; sc.updateProjectionMatrix(); }
    const off = this._soff || (this._soff = new THREE.Vector3(30, 50, 20)), z = this._lz || (this._lz = off.clone().normalize()), xa = this._lx || (this._lx = new THREE.Vector3(0, 1, 0).cross(z).normalize()), ya = this._ly || (this._ly = z.clone().cross(xa));
    const texel = (2 * e) / size, rx = L.x * xa.x + L.z * xa.z, ry = L.x * ya.x + L.z * ya.z, sx = Math.round(rx / texel) * texel - rx, sy = Math.round(ry / texel) * texel - ry;
    const tx = L.x + xa.x * sx + ya.x * sy, ty = xa.y * sx + ya.y * sy, tz = L.z + xa.z * sx + ya.z * sy;
    sun.target.position.set(tx, ty, tz); sun.position.set(tx + off.x, ty + off.y, tz + off.z);
    this.rim.position.set(L.x - 26, 14, L.z - 34); this.rim.target.position.set(L.x, 0, L.z);
  }
  // push this frame's look to the post uniforms (all derived from time, rain, camera and tier: nothing accumulates)
  updatePost(dt) {
    const P = this.post, U = P.U, L = this.look, c = this.tc, night = this._day === undefined ? 0 : 1 - this._day, ra = this.rainAmt, F = this._flash;
    const sm = (x, a, b) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
    U.uTilt.value = c.dof ? Math.max(this._photo ? 0.55 : 0, sm(L.dist, 14, 60) * (0.5 + 0.5 * sm(L.pitch, 0.35, 0.95))) : 0;
    U.uExposure.value = this.r.toneMappingExposure; U.uTime.value = this.t; U.uVig.value = this._photo ? 0.8 : 0.55;
    U.uBloom.value = 0.55 * (c.bloomK || 0) * (1 + 0.6 * night); P.thr = 1.55 - 0.55 * night + 0.2 * ra;
    U.uSat.value = 1.2 - 0.05 * night + 0.03 * this._dusk; U.uTintH.value.set(1.04 + 0.03 * this._dusk, 1.01, 0.95 - 0.04 * this._dusk);
    U.uGrain.value = c.grain ? 0.02 : 0;
    // sun on screen (for flare and rays); fades out when behind the camera, below the horizon or raining
    const sp = this.sunGlow.position, v = this._sv || (this._sv = new THREE.Vector3()), cp = this.cam.position;
    v.set(sp.x - cp.x, sp.y - cp.y, sp.z - cp.z).normalize().multiplyScalar(200).add(cp); const view = v.clone().applyMatrix4(this.cam.matrixWorldInverse); v.project(this.cam);
    const up = sm(this._sn, -0.02, 0.14) * (1 - ra), vis = view.z < 0 ? Math.max(0, Math.min(1, 1.9 - Math.max(Math.abs(v.x), Math.abs(v.y)))) : 0;
    U.uSun.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5, up * vis, 0); U.uSunCol.value.set(1.0, 0.86, 0.62).lerp(this._sc || (this._sc = new THREE.Vector3(1.0, 0.62, 0.38)), this._dusk * 0.7);
    U.uRays.value = 0.1; U.uFlash.value.set(F.r, F.g, F.b, F.a);
  }
  finishFrame(dt) {
    const F = this._flash; if (F.a > 0) F.a = Math.max(0, F.a - F.rate * dt);
    if (this.post && this.tc && this.post.rt.scene) { this.updatePost(dt); this.post.render(); this.passes = this.post.passCount; this.flashMesh.visible = false; return; }
    const fm = this.flashMesh, cam = this.cam; fm.visible = F.a > 0.004;
    if (fm.visible) { const h = 2 * Math.tan(cam.fov * Math.PI / 360) * 1.0; fm.scale.set(h * cam.aspect * 1.05, h * 1.05, 1); fm.position.set(0, 0, -1).applyMatrix4(cam.matrixWorld); fm.quaternion.copy(cam.quaternion); fm.material.color.setRGB(F.r, F.g, F.b); fm.material.opacity = F.a; }
    this.r.info.reset(); this.r.render(this.scene, this.cam);
  }

  // ----- village sync -----
  ensureVillage(p) {
    let V = this.villages.get(p.id);
    if (V) return V;
    V = { id: p.id, group: new THREE.Group(), b: new Map(), n: new Map(), p, flag: null };
    V.group.position.set(p.ox, 0, p.oz); this.scene.add(V.group);
    const plot = plotModel(p.color, Math.atan2(-p.oz, -p.ox)); this.noCast(plot); V.group.add(plot); V.flag = plot.getObjectByName('flag');
    {
      // gate dressing: two lamp posts and a mailbox beside the arch (the gate faces the valley centre, snapped to a quarter turn)
      const a = Math.atan2(-p.oz, -p.ox), q = Math.round(a / (Math.PI / 2)) * (Math.PI / 2), dx = Math.round(Math.cos(q)), dz = Math.round(Math.sin(q)), tx = -dz, tz = dx;
      for (const sgn of [-1, 1]) { const l = lampPostModel(); this.noCast(l); l.position.set(dx * 9.3 + tx * sgn * 2.4, 0, dz * 9.3 + tz * sgn * 2.4); V.group.add(l); }
      const mb = this.noCast(mailboxModel()); mb.position.set(dx * 9.3 + tx * 3.6, 0, dz * 9.3 + tz * 3.6); mb.rotation.y = Math.atan2(-dx, -dz); V.group.add(mb);
    }
    // soft checker so the tile grid reads
    const checker = new THREE.Mesh(new THREE.PlaneGeometry(PLOT, PLOT, PLOT, PLOT), new THREE.MeshBasicMaterial({ visible: false })); checker.rotation.x = -Math.PI / 2; checker.position.y = 0.14; V.group.add(checker);
    const grid = new THREE.GridHelper(PLOT, PLOT, 0x000000, 0x000000); grid.material.transparent = true; grid.material.opacity = 0.0; grid.position.y = 0.15; V.group.add(grid); V.grid = grid;
    this.villages.set(p.id, V); return V;
  }
  local(V, tx, ty, w = 1, h = 1) { return new THREE.Vector3(tx + w / 2 - PLOT / 2, 0.14, ty + h / 2 - PLOT / 2); }

  sync(snap, myId) {
    this.myId = myId;
    const seen = new Set();
    for (const p of snap.players) {
      seen.add(p.id); const V = this.ensureVillage(p); V.p = p;
      // buildings
      const bs = new Set();
      for (const [id, type, x, y, prog, stage, crop, lvl = 1] of p.b) {
        bs.add(id); let m = V.b.get(id);
        if (!m || m.userData.type !== type) {
          if (m) { V.group.remove(m); this.unpick(m); }
          const d0 = BUILDINGS[type] || { w: 3, h: 3 };
          m = new THREE.Group(); m.userData = { type, id, pid: p.id, lvl: 0, w: d0.w, h: d0.h };
          const site = constructionSite(d0.w, d0.h); site.visible = false; m.add(site); m.userData.site = site;
          V.group.add(m); V.b.set(id, m); this.pickables.push(m);
          m.scale.setScalar(0.01); m.userData.pop = 0;
        }
        if (m.userData.lvl !== lvl) {
          // (re)build the model for this level: the art changes visibly at level 2 and 3
          const u = m.userData; if (u.model) { m.remove(u.model); u.model.traverse(o => { if (o.material && o.material.userData && o.material.userData.ghostOwn) o.material.dispose(); }); }
          const info = { id, color: p.color, lvl };
          const mod = type === 'farm' ? farmModel(info) : BUILD[type] ? BUILD[type](info) : BUILD.house(info);
          mod.traverse(o => { if (o.isMesh) o.userData.pick = { k: 'bld', id, pid: p.id }; }); m.add(mod);
          u.model = mod; u.lvl = lvl; u.spin = mod.getObjectByName('spin'); u.spinz = mod.getObjectByName('spinz'); u.flag = mod.getObjectByName('flag');
          u.chimneys = []; mod.traverse(o => { if (o.name === 'chimney') u.chimneys.push(o); });
          if (u.pop === undefined) { u.pop = 0; m.scale.setScalar(0.01); } else { this.fx.sparkle(V.group.position.x + m.position.x, 1.5, V.group.position.z + m.position.z, '#ffd84a'); }
        }
        const d = BUILDINGS[type] || { w: 3, h: 3 };
        const pos = this.local(V, x, y, d.w, d.h); m.position.set(pos.x, 0.14, pos.z); m.userData.x = x; m.userData.y = y;
        m.userData.prog = prog; m.userData.stage = stage; m.userData.crop = crop; m.userData.busy = stage === 'busy';
        if (type === 'farm') setFarmStage(m, stage, crop);
      }
      for (const [id, m] of V.b) if (!bs.has(id)) { V.group.remove(m); this.unpick(m); V.b.delete(id); this.fx.dust(V.group.position.x + m.position.x, 0.5, V.group.position.z + m.position.z); }
      // nodes
      const ns = new Set();
      for (const [id, type, x, y, alive] of p.n) {
        ns.add(id); let m = V.n.get(id);
        if (!m) {
          m = new THREE.Group(); m.userData = { type, id, seed: id };
          const full = type === 'tree' ? treeModel(id) : type === 'rock' ? rockModel(id) : clayModel(); const stump = stumpModel();
          m.add(full, stump); m.userData.full = full; m.userData.stump = stump;
          m.traverse(o => { if (o.isMesh) { o.userData.pick = { k: 'node', id, pid: p.id }; if (type !== 'tree') o.castShadow = false; } }); V.group.add(m); V.n.set(id, m); this.pickables.push(m);
        }
        m.position.copy(this.local(V, x, y)); m.userData.full.visible = !!alive; m.userData.stump.visible = !alive && m.userData.type === 'tree';
      }
      for (const [id, m] of V.n) if (!ns.has(id)) { V.group.remove(m); this.unpick(m); V.n.delete(id); }
      // villagers
      for (const [id, x, z, state, hat, face, name, tool = 'none'] of p.v) {
        let m = this.villagers.get(id);
        if (!m || m.userData.tool !== tool) {
          // a new villager, or a new job with a different tool: build the model that holds it
          const old = m, prev = old ? old.userData : null;
          m = this.noCast(villagerModel(p.color, hat, { tool, seed: hat })); m.scale.setScalar(1.3); m.position.set(old ? old.position.x : x, 0.14, old ? old.position.z : z);
          m.userData = { id, pid: p.id, tx: x, tz: z, state, face: prev ? prev.face : 0, tface: prev ? prev.tface : undefined, phase: prev ? prev.phase : Math.random() * 6, name, tool, mood: '' };
          m.traverse(o => { if (o.isMesh) o.userData.pick = { k: 'vil', id, pid: p.id }; }); this.scene.add(m); this.villagers.set(id, m); this.pickables.push(m);
          if (old) { this.scene.remove(old); this.unpick(old); }
        }
        const u = m.userData; u.tx = x; u.tz = z; u.state = state; u.name = name; if (face) u.tface = face;
      }
    }
    for (const [pid, V] of this.villages) if (!seen.has(pid)) { this.scene.remove(V.group); this.villages.delete(pid); }
    const alive = new Set(); for (const p of snap.players) for (const v of p.v) alive.add(v[0]);
    for (const [id, m] of this.villagers) if (!alive.has(id)) { this.scene.remove(m); this.unpick(m); this.villagers.delete(id); }
    for (const f of snap.valley.fields) { const g = this.fieldMeshes[f.id]; if (g) { const d = VALLEY_FIELDS.find(x => x.id === f.id); const k = Math.max(0.15, f.stock / d.max); g.userData.stuff.scale.setScalar(0.5 + 0.5 * k); g.userData.stuff.position.y = (k < 0.2 ? -0.15 : 0); } }
  }
  unpick(m) { const i = this.pickables.indexOf(m); if (i >= 0) this.pickables.splice(i, 1); }

  puff(x, y, z) { this.fx.smoke(x, y, z); }
  burst(x, z, color = '#ffd84a') { this.fx.confetti(x, 1.5, z); this.fx.sparkle(x, 1.5, z, color); this.fx.ring && this.fx.ring(x, 0.2, z, color); }
  coins(x, z) { this.fx.coinPop(x, 1.2, z); }
  hearts(x, z) { this.fx.heartsBurst ? this.fx.heartsBurst(x, 2, z) : this.fx.hearts(x, 2, z); }
  star(x, z, color = '#ffd84a') { this.fx.star(x, 2.2, z, color); this.fx.sparkle(x, 2, z, color); }
  notes(x, z) { this.fx.note(x, 2, z); }

  // ----- ghost placement -----
  setGhost(type, color) {
    if (this.ghost) { this.scene.remove(this.ghost.g); this.ghost = null; }
    if (!type) return;
    const info = { id: 3, color };
    const g = type === 'farm' ? farmModel(info) : BUILD[type](info);
    // plain translucent copies: the art materials carry custom shader hooks that do not survive clone()
    g.traverse(o => { if (o.isMesh) { const m0 = o.material; o.material = new THREE.MeshStandardMaterial({ color: m0.color ? m0.color.clone() : 0xffffff, vertexColors: !!m0.vertexColors, roughness: 0.9, transparent: true, opacity: 0.75, side: THREE.DoubleSide }); o.castShadow = false; } });
    this.scene.add(g); this.ghost = { g, type, d: BUILDINGS[type], x: 0, y: 0, ok: true };
  }
  moveGhost(V, tx, ty, ok) {
    const G = this.ghost; if (!G) return; G.x = tx; G.y = ty; G.ok = ok;
    const p = this.local(V, tx, ty, G.d.w, G.d.h); G.g.position.set(V.group.position.x + p.x, 0.14, V.group.position.z + p.z);
    G.g.traverse(o => { if (o.isMesh) o.material.emissive = new THREE.Color(ok ? 0x00ff55 : 0xff2222), o.material.emissiveIntensity = 0.35; });
    V.grid.material.opacity = 0.25;
  }
  hideGrids() { for (const V of this.villages.values()) V.grid.material.opacity = 0; }

  // ----- camera & picking -----
  focus(x, z, dist) { this.goal.x = x; this.goal.z = z; if (dist) this.goal.dist = dist; }
  focusVillage(id, dist = 24) { const V = this.villages.get(id); if (V) this.focus(V.group.position.x, V.group.position.z, dist); }
  pointerRay(cx, cy) { const r = this.canvas.getBoundingClientRect(); this.ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), this.cam); return this.ray; }
  groundAt(cx, cy) { const p = new THREE.Vector3(); return this.pointerRay(cx, cy).ray.intersectPlane(this.ground, p) ? p : null; }
  pick(cx, cy) {
    const hits = this.pointerRay(cx, cy).intersectObjects(this.pickables, true);
    for (const h of hits) { let o = h.object; while (o && !o.userData.pick) o = o.parent; if (o) return { ...o.userData.pick, obj: o, point: h.point }; }
    return null;
  }
  tileAt(V, cx, cy) {
    const p = this.groundAt(cx, cy); if (!p) return null;
    return { tx: Math.floor(p.x - V.group.position.x + PLOT / 2), ty: Math.floor(p.z - V.group.position.z + PLOT / 2), p };
  }
  select(obj, ringR = 0.9) { this.sel = obj; this.selRing.visible = !!obj; this.selRing.scale.setScalar(ringR); }

  frame(dt) {
    this.t += dt; const L = this.look, Gl = this.goal, k = 1 - Math.pow(0.0005, dt);
    if (this._photo) Gl.yaw += dt * 0.06;
    if (!this._introSeen && !navigator.webdriver && this.myId && this.villages.has(this.myId) && !/nointro/.test(location.search)) { this._introSeen = true; this.intro(); }
    const I = this._intro;
    if (I) {
      I.t += dt; const u = Math.min(1, I.t / I.dur), e = 1 - Math.pow(1 - u, 3);
      L.x += (Gl.x - L.x) * k; L.z += (Gl.z - L.z) * k;
      L.dist = I.d + (Gl.dist - I.d) * e; L.yaw = I.yaw + (Gl.yaw - I.yaw) * e; L.pitch = I.pitch + (Gl.pitch - I.pitch) * e;
      if (u >= 1) this._intro = null;
    } else for (const key of ['x', 'z', 'dist', 'yaw', 'pitch']) L[key] += (Gl[key] - L[key]) * k;
    // punch: fast attack, slower release; shake: decaying smooth noise; breathing: an almost imperceptible sway
    this._pv += (this._pt - this._pv) * Math.min(1, dt * 26); this._pt *= Math.exp(-dt * 6.5);
    const cd = L.dist * (1 - this._pv), cp = Math.cos(L.pitch), sp = Math.sin(L.pitch);
    this.cam.position.set(L.x + Math.sin(L.yaw) * cp * cd, sp * cd, L.z + Math.cos(L.yaw) * cp * cd); this.cam.lookAt(L.x, 0, L.z);
    { const t = this.t, sw = L.dist * 0.0012; this.cam.translateX(Math.sin(t * 0.37) * sw + Math.sin(t * 0.91) * sw * 0.3); this.cam.translateY(Math.sin(t * 0.29 + 1.0) * sw * 0.7); this.cam.rotateZ(Math.sin(t * 0.23) * 0.0012);
      const S = this._shk; if (S.dur > 0) { S.t += dt; const f = Math.max(0, 1 - S.t / S.dur), a = S.amt * f * f; if (f <= 0) S.dur = 0; else { this.cam.translateX(a * (Math.sin(S.t * 53.1) + 0.6 * Math.sin(S.t * 31.7 + 1.3))); this.cam.translateY(a * (Math.sin(S.t * 47.9 + 2.0) + 0.6 * Math.sin(S.t * 27.3))); this.cam.rotateZ(a * 0.012 * Math.sin(S.t * 39.0)); } } }
    this.cam.updateMatrixWorld();
    this.shadowFollow(L);
    // ---- level of detail: only what is near the camera is drawn (phones have a few hundred draw calls to spare)
    {
      const near = L.dist < 46, R = Math.max(30, L.dist * 1.15), R2 = R * R, tx = L.x, tz = L.z;
      const within = (m, k = 1) => { const dx = m.position.x - tx, dz = m.position.z - tz; return dx * dx + dz * dz < R2 * k; };
      for (const m of this.critters) m.visible = near && within(m);
      for (const b of this.flies) b.visible = near && (this.night || 0) < 0.6 && within(b);
      for (const b of this.birds) b.visible = near && (this.night || 0) < 0.7 && this.rainAmt < 0.5;
      for (const m of this.props) m.visible = near && within(m, 1.4);
      for (const [, m] of this.villagers) m.visible = L.dist < 62 && (m.userData.pid === this.myId ? true : within(m, 0.9));
      const wantShadow = this._shadowOn === undefined ? true : (this._shadowOn ? L.dist < 52 : L.dist < 46);
      if (wantShadow !== this._shadowOn) { this._shadowOn = wantShadow; this.sun.castShadow = wantShadow; }
    }
    // ---- live quality: tier and pixel ratio follow the frame time (only in 'auto', never under automation)
    this.frameMs += (dt * 1000 - this.frameMs) * 0.05; this.frames++;
    { const a = this.ctl.step(dt); if (a) { if (a.tier !== this._tier) { this.applyTier(a.tier); if (a.reason === 'slow') saveCap(a.tier); } if (Math.abs(a.pr - this.pr) > 0.01) { this.pr = a.pr; this.resize(); } } }
    for (const [, m] of this.villagers) {
      const u = m.userData, p = m.position;
      const dx = u.tx - p.x, dz = u.tz - p.z, d = Math.hypot(dx, dz);
      if (d > 8) { p.x = u.tx; p.z = u.tz; } else { const s = Math.min(1, dt * 7); p.x += dx * s; p.z += dz * s; }
      if (u.tface !== undefined) { let da = u.tface - u.face; da = Math.atan2(Math.sin(da), Math.cos(da)); u.face += da * Math.min(1, dt * 10); m.rotation.y = u.face; }
      const walking = d > 0.03;
      const pose = walking ? 'walk' : (u.state === 'work' || u.state === 'build') ? 'work' : 'idle';
      setPose(m, pose, this.t, u.phase);
      const mood = u.state === 'hungry' ? 'hungry' : u.state === 'blocked' || u.state === 'full' ? 'tired' : (u.state === 'work' || u.state === 'build') ? 'busy' : 'happy';
      if (u.mood !== mood) { u.mood = mood; setMood(m, mood); }
      m.position.y = 0.14;
    }
    for (const V of this.villages.values()) {
      for (const [, m] of V.b) {
        const u = m.userData;
        if (u.pop !== undefined && u.pop < 1) { u.pop = Math.min(1, u.pop + dt * 3); const e = 1 + Math.sin(u.pop * Math.PI) * 0.15; m.scale.setScalar(u.pop * e); }
        else m.scale.set(1, 1, 1);
        if (u.model) { u.model.scale.y = u.prog < 1 ? 0.2 + u.prog * 0.8 : 1; if (u.site) u.site.visible = u.prog < 1; }
        if (u.flag) u.flag.rotation.y = Math.sin(this.t * 2.2 + u.id) * 0.18;
        if (u.spin) u.spin.rotation.x += dt * (u.busy ? 14 : 1);
        if (u.spinz) u.spinz.rotation.z += dt * 0.8;
        if (u.busy && u.prog >= 1 && u.chimneys && u.chimneys.length && Math.random() < dt * 3) { const c = u.chimneys[(Math.random() * u.chimneys.length) | 0]; c.getWorldPosition(this._v || (this._v = new THREE.Vector3())); this.fx.smoke(this._v.x, this._v.y, this._v.z); }
      }
    }
    if (this.selRing.visible && this.sel) { const w = new THREE.Vector3(); this.sel.getWorldPosition(w); this.selRing.position.set(w.x, 0.25, w.z); this.selRing.rotation.z += dt; }
    this.fx.update(dt);
    for (const m of this.props) animateProp(m, this.t, {});
    // ambient life: drifting petals near the camera, motes in the sun by day
    this._amb = (this._amb || 0) - dt;
    if (this._amb <= 0) { this._amb = 0.35 + Math.random() * 0.4; const L = this.look; const x = L.x + (Math.random() - 0.5) * L.dist, z = L.z + (Math.random() - 0.5) * L.dist; if (this.rainAmt < 0.3) { if (Math.random() < 0.55) this.fx.petal(x, 4 + Math.random() * 3, z); else if ((this.night || 0) < 0.5) this.fx.mote(x, 1 + Math.random() * 2, z); } }
    this.applyLight(dt); const ra = this.rainAmt;
    this.rain.visible = ra > 0.05; this.rain.material.opacity = 0.55 * ra;
    if (this.rain.visible) { const p = this.rainPos; for (let i = 0; i < this.rainN; i++) { const o = i * 6; p[o + 1] -= dt * 28; p[o + 4] -= dt * 28; if (p[o + 1] < 0) { const y = 28 + Math.random() * 4; p[o + 1] = y; p[o + 4] = y - 0.9; } } this.rain.geometry.attributes.position.needsUpdate = true; this.rain.position.set(this.look.x, 0, this.look.z); }
    for (const c of this.clouds) { c.position.x += dt * 0.8; if (c.position.x > 130) c.position.x = -130; }
    for (const b of this.flies) { const u = b.userData, a = this.t * u.sp + u.ph; b.position.set(u.cx + Math.cos(a) * u.rad, 0.9 + Math.sin(a * 1.7) * 0.4, u.cz + Math.sin(a) * u.rad); b.rotation.y = -a + Math.PI / 2; animateCritter(b, 'fly', this.t, 1, u.ph); b.visible = (this.night || 0) < 0.6; }
    for (const b of this.birds) { const u = b.userData, a = this.t * u.sp + u.ph; b.position.set(u.cx + Math.cos(a) * u.rad, u.h + Math.sin(a * 2) * 0.6, u.cz + Math.sin(a) * u.rad); b.rotation.y = -a; animateCritter(b, 'fly', this.t, 1, u.ph); b.visible = (this.night || 0) < 0.7 && this.rainAmt < 0.5; }
    for (const m of this.critters) {
      const u = m.userData; u.wait -= dt; const dx = u.tx - m.position.x, dz = u.tz - m.position.z, d = Math.hypot(dx, dz);
      if (d > 0.15) { m.position.x += dx / d * dt * u.speed; m.position.z += dz / d * dt * u.speed; m.rotation.y = Math.atan2(dx, dz); u.mode = 'walk'; }
      else { u.mode = u.kind === 'sheep' || u.kind === 'cow' || u.kind === 'snail' ? 'graze' : 'idle'; if (u.wait <= 0) { u.wait = 2 + Math.random() * 6; const a = Math.random() * 6.28, r = Math.random() * u.rad; u.tx = u.hx + Math.cos(a) * r; u.tz = u.hz + Math.sin(a) * r; } }
      animateCritter(m, u.mode, this.t, 1, u.seed);
    }
    for (const V of this.villages.values()) if (V.flag) V.flag.rotation.y = Math.sin(this.t * 2 + V.p.slot) * 0.15;
    if (this.board) this.board.rotation.y = Math.sin(this.t * 0.5) * 0.03;
    this.finishFrame(dt);
  }
  project(x, y, z) { const v = new THREE.Vector3(x, y, z).project(this.cam); const r = this.canvas.getBoundingClientRect(); return { x: (v.x * 0.5 + 0.5) * r.width + r.left, y: (-v.y * 0.5 + 0.5) * r.height + r.top, vis: v.z < 1 }; }
}
