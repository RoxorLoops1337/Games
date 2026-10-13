// Three.js view of the valley: terrain, villages, villagers, camera and picking.
import * as THREE from 'three';
import { box, cyl, cone, ball, mat } from './models.js';
import { treeModel, rockModel, clayModel, stumpModel, boardModel, fieldModel, plazaModel, plotModel, islandModel, lanternMat as envLantern } from '../art/environment.js';
import { BUILD, farmModel, setFarmStage, constructionSite, windowMat, lanternMat } from '../art/buildings.js';
import { villagerModel, setPose, setMood } from '../art/characters.js';
import { sheepModel, cowModel, chickenModel, bunnyModel, birdModel, cloudModel, butterflyModel, animateCritter, cloudMat } from '../art/critters.js';
import { Fx } from '../art/fx.js';
import { PLOT, VALLEY_FIELDS, VALLEY_FIELD_RADIUS, BUILDINGS, NODE_TYPES } from '../shared/data.js';

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    const s = this.scene = new THREE.Scene(); s.background = new THREE.Color('#a9dcf3'); s.fog = new THREE.Fog('#bfe6f7', 70, 190);
    this.cam = new THREE.PerspectiveCamera(42, 1, 0.5, 400);
    this.look = { x: 0, z: 0, dist: 34, yaw: 0.0, pitch: 0.95 }; this.goal = { ...this.look };
    const hemi = this.hemi = new THREE.HemisphereLight('#dff3ff', '#7da05a', 1.05); s.add(hemi);
    const sun = this.sun = new THREE.DirectionalLight('#fff1d0', 2.4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 140; sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.06;
    s.add(sun, sun.target);
    this.pickables = []; this.fieldMeshes = {};
    this.buildTerrain(); this.buildLife();
    this.villages = new Map(); this.villagers = new Map(); this.mixers = [];
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); this.ray = new THREE.Raycaster();
    this.fx = new Fx(this.scene); this.t = 0; this.ghost = null; this.sel = null;
    this.selRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false }));
    this.selRing.rotation.x = -Math.PI / 2; this.selRing.visible = false; this.selRing.renderOrder = 10; s.add(this.selRing);
    this.resize(); addEventListener('resize', () => this.resize());
  }
  resize() { const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight; this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }

  buildTerrain() {
    const s = this.scene;
    this.island = islandModel(72); s.add(this.island);
    s.add(plazaModel(9));
    // the valley square: notice board + the four shared fields
    const board = boardModel(); board.position.set(0, 0.1, 0); s.add(board); this.board = board;
    board.traverse(o => { if (o.isMesh) o.userData.pick = { k: 'board' }; }); this.pickables.push(board);
    for (const f of VALLEY_FIELDS) {
      const g = fieldModel(f.type, f.ang); g.position.set(Math.cos(f.ang) * VALLEY_FIELD_RADIUS, 0, Math.sin(f.ang) * VALLEY_FIELD_RADIUS);
      g.userData.stuff = g.getObjectByName('stuff') || g; g.userData.type = f.type;
      g.traverse(o => { if (o.isMesh) o.userData.pick = { k: 'valley', id: f.id }; }); this.pickables.push(g);
      s.add(g); this.fieldMeshes[f.id] = g;
    }
  }

  buildLife() {
    const s = this.scene; this.clouds = []; this.flies = []; this.critters = [];
    for (let i = 0; i < 12; i++) { const c = cloudModel(i); c.position.set((i * 37) % 240 - 120, 84 + (i % 4) * 6, ((i * 53) % 200) - 100); c.scale.setScalar(3.4 + (i % 3) * 1.2); c.userData.sky = true; s.add(c); this.clouds.push(c); }
    const cols = ['#ffd84a', '#ff9ec7', '#ffffff', '#9ad0ff'];
    for (let i = 0; i < 28; i++) { const b = butterflyModel(cols[i % 4]); const a = (i / 28) * Math.PI * 2, r = 12 + (i % 7) * 6; b.userData = { ...b.userData, cx: Math.cos(a) * r, cz: Math.sin(a) * r, ph: i, sp: 0.4 + (i % 5) * 0.12, rad: 1.5 + (i % 3) }; s.add(b); this.flies.push(b); }
    // farm life on the valley meadow: wanderers pick a random spot near home every few seconds
    const mk = (kind, build, n, home, rad, speed) => { for (let i = 0; i < n; i++) { const m = build(i); const a = i * 2.4 + home.a, r = rad * (0.4 + 0.6 * ((i * 7) % 10) / 10); const hx = home.x + Math.cos(a) * r, hz = home.z + Math.sin(a) * r; m.position.set(hx, 0, hz); m.userData = { ...m.userData, kind, hx: home.x, hz: home.z, rad, speed, tx: hx, tz: hz, wait: Math.random() * 3, mode: 'idle', seed: i }; s.add(m); this.critters.push(m); } };
    mk('sheep', (i) => sheepModel(i), 9, { x: -2, z: 6, a: 0 }, 8, 0.9);
    mk('cow', (i) => cowModel(i), 3, { x: 6, z: -6, a: 1 }, 5, 0.6);
    mk('chicken', (i) => chickenModel(i), 8, { x: 0, z: 0, a: 2 }, 7.5, 1.1);
    mk('bunny', (i) => bunnyModel(i), 5, { x: -7, z: -4, a: 0.5 }, 6, 1.6);
    this.birds = []; for (let i = 0; i < 7; i++) { const b = birdModel(i); b.userData = { ...b.userData, ph: i * 0.9, rad: 22 + (i % 4) * 9, h: 14 + (i % 3) * 4, sp: 0.12 + (i % 3) * 0.03, cx: (i % 2 ? 1 : -1) * 10, cz: (i % 3 - 1) * 12 }; s.add(b); this.birds.push(b); }
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
    const day = Math.max(0, Math.min(1, sn * 1.5 + 0.3)), dusk = Math.max(0, 1 - Math.abs(sn) * 3.2);
    const C = this._C || (this._C = { sky: new THREE.Color(), tmp: new THREE.Color(), night: new THREE.Color('#4a62a8'), dayC: new THREE.Color('#bfe9ff'), dusk: new THREE.Color('#ffb48a'), grey: new THREE.Color('#a9b9c8'), white: new THREE.Color('#ffffff') });
    // sky: bright candy blue by day, soft indigo at night, peach at dawn and dusk, pearly grey in rain
    C.sky.copy(C.night).lerp(C.dayC, day).lerp(C.dusk, dusk * 0.5).lerp(C.grey, ra * 0.55);
    this.scene.background.copy(C.sky); this.scene.fog.color.copy(C.sky).lerp(C.white, 0.2 * day);
    this.scene.fog.near = 90 - 45 * ra; this.scene.fog.far = 230 - 110 * ra;
    // high-key light: strong soft fill from the hemisphere so shadows stay bright and friendly
    this.sun.intensity = (0.8 + 1.8 * day) * (1 - 0.4 * ra); this.sun.color.set('#fff6e0').lerp(C.tmp.set('#ffb070'), dusk * 0.6).lerp(C.tmp.set('#a9bcff'), 1 - day);
    this.hemi.intensity = 0.95 + 0.4 * day + 0.2 * ra; this.hemi.color.set('#9fb4f0').lerp(C.tmp.set('#ffffff'), day); this.hemi.groundColor.set('#8fbf6a').lerp(C.tmp.set('#a8e07a'), day);
    this.night = 1 - day;
    this.winMat.emissiveIntensity = (1 - day) * 1.6; this.lanternMat.emissiveIntensity = (1 - day) * 2.4; envLantern.emissiveIntensity = (1 - day) * 2.4;
    cloudMat.color.set('#ffffff').lerp(C.tmp.set('#8d9cc8'), (1 - day) * 0.8); this.fx.setLight && this.fx.setLight(0.4 + 0.6 * day);
    this.r.toneMappingExposure = 1.02 + 0.06 * day;
  }

  // ----- village sync -----
  ensureVillage(p) {
    let V = this.villages.get(p.id);
    if (V) return V;
    V = { id: p.id, group: new THREE.Group(), b: new Map(), n: new Map(), p, flag: null };
    V.group.position.set(p.ox, 0, p.oz); this.scene.add(V.group);
    const plot = plotModel(p.color, Math.atan2(-p.oz, -p.ox)); V.group.add(plot); V.flag = plot.getObjectByName('flag');
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
          m.traverse(o => { if (o.isMesh) o.userData.pick = { k: 'node', id, pid: p.id }; }); V.group.add(m); V.n.set(id, m); this.pickables.push(m);
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
          m = villagerModel(p.color, hat, { tool, seed: hat }); m.position.set(old ? old.position.x : x, 0.14, old ? old.position.z : z);
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
  hearts(x, z) { this.fx.hearts(x, 2, z); }

  // ----- ghost placement -----
  setGhost(type, color) {
    if (this.ghost) { this.scene.remove(this.ghost.g); this.ghost = null; }
    if (!type) return;
    const info = { id: 3, color };
    const g = type === 'farm' ? farmModel(info) : BUILD[type](info);
    g.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.75; o.castShadow = false; } });
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
    for (const key of ['x', 'z', 'dist', 'yaw', 'pitch']) L[key] += (Gl[key] - L[key]) * k;
    const cp = Math.cos(L.pitch), sp = Math.sin(L.pitch);
    this.cam.position.set(L.x + Math.sin(L.yaw) * cp * L.dist, sp * L.dist, L.z + Math.cos(L.yaw) * cp * L.dist); this.cam.lookAt(L.x, 0, L.z);
    this.sun.position.set(L.x + 30, 50, L.z + 20); this.sun.target.position.set(L.x, 0, L.z);
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
    this.applyLight(dt); const ra = this.rainAmt;
    this.rain.visible = ra > 0.05; this.rain.material.opacity = 0.55 * ra;
    if (this.rain.visible) { const p = this.rainPos; for (let i = 0; i < this.rainN; i++) { const o = i * 6; p[o + 1] -= dt * 28; p[o + 4] -= dt * 28; if (p[o + 1] < 0) { const y = 28 + Math.random() * 4; p[o + 1] = y; p[o + 4] = y - 0.9; } } this.rain.geometry.attributes.position.needsUpdate = true; this.rain.position.set(this.look.x, 0, this.look.z); }
    for (const c of this.clouds) { c.position.x += dt * 0.8; if (c.position.x > 130) c.position.x = -130; }
    for (const b of this.flies) { const u = b.userData, a = this.t * u.sp + u.ph; b.position.set(u.cx + Math.cos(a) * u.rad, 0.9 + Math.sin(a * 1.7) * 0.4, u.cz + Math.sin(a) * u.rad); b.rotation.y = -a + Math.PI / 2; animateCritter(b, 'fly', this.t, 1, u.ph); b.visible = (this.night || 0) < 0.6; }
    for (const b of this.birds) { const u = b.userData, a = this.t * u.sp + u.ph; b.position.set(u.cx + Math.cos(a) * u.rad, u.h + Math.sin(a * 2) * 0.6, u.cz + Math.sin(a) * u.rad); b.rotation.y = -a; animateCritter(b, 'fly', this.t, 1, u.ph); b.visible = (this.night || 0) < 0.7 && this.rainAmt < 0.5; }
    for (const m of this.critters) {
      const u = m.userData; u.wait -= dt; const dx = u.tx - m.position.x, dz = u.tz - m.position.z, d = Math.hypot(dx, dz);
      if (d > 0.15) { m.position.x += dx / d * dt * u.speed; m.position.z += dz / d * dt * u.speed; m.rotation.y = Math.atan2(dx, dz); u.mode = 'walk'; }
      else { u.mode = u.kind === 'sheep' || u.kind === 'cow' ? 'graze' : 'idle'; if (u.wait <= 0) { u.wait = 2 + Math.random() * 6; const a = Math.random() * 6.28, r = Math.random() * u.rad; u.tx = u.hx + Math.cos(a) * r; u.tz = u.hz + Math.sin(a) * r; } }
      animateCritter(m, u.mode, this.t, 1, u.seed);
    }
    for (const V of this.villages.values()) if (V.flag) V.flag.rotation.y = Math.sin(this.t * 2 + V.p.slot) * 0.15;
    if (this.board) this.board.rotation.y = Math.sin(this.t * 0.5) * 0.03;
    this.r.render(this.scene, this.cam);
  }
  project(x, y, z) { const v = new THREE.Vector3(x, y, z).project(this.cam); const r = this.canvas.getBoundingClientRect(); return { x: (v.x * 0.5 + 0.5) * r.width + r.left, y: (-v.y * 0.5 + 0.5) * r.height + r.top, vis: v.z < 1 }; }
}
