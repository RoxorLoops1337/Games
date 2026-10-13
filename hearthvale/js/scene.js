// Three.js view of the valley: terrain, villages, villagers, camera and picking.
import * as THREE from 'three';
import { BUILD, farmModel, setFarmStage, treeModel, rockModel, clayModel, stumpModel, villagerModel, boardModel, box, cyl, cone, ball, mat } from './models.js';
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
    s.add(new THREE.HemisphereLight('#dff3ff', '#7da05a', 1.05));
    const sun = this.sun = new THREE.DirectionalLight('#fff1d0', 2.4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 140; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    s.add(sun, sun.target);
    this.pickables = []; this.fieldMeshes = {};
    this.buildTerrain();
    this.villages = new Map(); this.villagers = new Map(); this.mixers = [];
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); this.ray = new THREE.Raycaster();
    this.fx = []; this.t = 0; this.ghost = null; this.sel = null;
    this.selRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false }));
    this.selRing.rotation.x = -Math.PI / 2; this.selRing.visible = false; this.selRing.renderOrder = 10; s.add(this.selRing);
    this.resize(); addEventListener('resize', () => this.resize());
  }
  resize() { const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight; this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }

  buildTerrain() {
    const s = this.scene;
    const sea = new THREE.Mesh(new THREE.CircleGeometry(400, 48), new THREE.MeshStandardMaterial({ color: '#4fb6e0', roughness: 0.35, metalness: 0.1 })); sea.rotation.x = -Math.PI / 2; sea.position.y = -2.2; sea.receiveShadow = true; s.add(sea);
    const R = 66;
    const cliff = new THREE.Mesh(new THREE.CylinderGeometry(R, R - 4, 3.2, 64, 1), mat('#8f6f4b')); cliff.position.y = -1.6; cliff.receiveShadow = true; s.add(cliff);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.2, 64), mat('#8ec65a')); top.position.y = -0.1; top.receiveShadow = true; s.add(top);
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 0.12, 40), mat('#d9c9a0')); plaza.position.y = 0.0; plaza.receiveShadow = true; s.add(plaza);
    // scatter of decorative trees and bushes on the rim and between villages
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 90; i++) {
      const a = rnd() * Math.PI * 2, rad = 52 + rnd() * 12; const t = treeModel(i); t.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad); t.scale.setScalar(0.9 + rnd() * 0.9); s.add(t);
    }
    for (let i = 0; i < 40; i++) {
      const a = rnd() * Math.PI * 2, rad = 14 + rnd() * 20; if (Math.abs(((a * 16 / (Math.PI * 2)) % 1) - 0.5) > 0.0) { /* keep */ }
      const b = ball(0.35 + rnd() * 0.2, ['#6bb554', '#7cc65e', '#5aa84a'][i % 3], Math.cos(a) * rad, 0.2, Math.sin(a) * rad); b.scale.y *= 0.7; s.add(b);
    }
    // the valley square: notice board + the four shared fields
    const board = boardModel(); board.position.set(0, 0, 0); s.add(board); this.board = board;
    board.traverse(o => { if (o.isMesh) { o.userData.pick = { k: 'board' }; } }); this.pickables.push(board);
    for (const f of VALLEY_FIELDS) {
      const g = new THREE.Group(); g.position.set(Math.cos(f.ang) * VALLEY_FIELD_RADIUS, 0, Math.sin(f.ang) * VALLEY_FIELD_RADIUS);
      g.add(cyl(3.6, 3.6, 0.12, f.type === 'tree' ? '#6aa84a' : f.type === 'clay' ? '#a8683c' : f.type === 'rock' ? '#a0a39e' : '#e5c354', 0, 0, 0, 24));
      const stuff = new THREE.Group(); g.add(stuff); g.userData.stuff = stuff; g.userData.type = f.type;
      for (let i = 0; i < 14; i++) {
        const a = i * 2.4, rr = 0.6 + (i % 5) * 0.55;
        let m;
        if (f.type === 'tree') m = treeModel(i); else if (f.type === 'rock') m = rockModel(i); else if (f.type === 'clay') m = clayModel(); else { m = box(0.18, 0.7, 0.18, '#e6c44a'); }
        m.position.set(Math.cos(a) * rr, 0.1, Math.sin(a) * rr); if (f.type === 'wheat') m.scale.y = 1 + (i % 3) * 0.2; if (f.type === 'clay') { m.position.y = 0.12; m.scale.setScalar(1.2); } stuff.add(m);
      }
      g.traverse(o => { if (o.isMesh) o.userData.pick = { k: 'valley', id: f.id }; }); this.pickables.push(g);
      s.add(g); this.fieldMeshes[f.id] = g;
    }
  }

  // ----- village sync -----
  ensureVillage(p) {
    let V = this.villages.get(p.id);
    if (V) return V;
    V = { id: p.id, group: new THREE.Group(), b: new Map(), n: new Map(), p, flag: null };
    V.group.position.set(p.ox, 0, p.oz); this.scene.add(V.group);
    const plot = new THREE.Mesh(new THREE.BoxGeometry(PLOT, 0.16, PLOT), mat('#9ad464')); plot.position.y = 0.05; plot.receiveShadow = true; V.group.add(plot);
    const border = new THREE.Mesh(new THREE.BoxGeometry(PLOT + 0.6, 0.12, PLOT + 0.6), mat(p.color)); border.position.y = -0.02; border.receiveShadow = true; V.group.add(border);
    // soft checker so the tile grid reads
    const checker = new THREE.Mesh(new THREE.PlaneGeometry(PLOT, PLOT, PLOT, PLOT), new THREE.MeshBasicMaterial({ visible: false })); checker.rotation.x = -Math.PI / 2; checker.position.y = 0.14; V.group.add(checker);
    const grid = new THREE.GridHelper(PLOT, PLOT, 0x000000, 0x000000); grid.material.transparent = true; grid.material.opacity = 0.0; grid.position.y = 0.15; V.group.add(grid); V.grid = grid;
    const pole = cyl(0.06, 0.06, 2.6, '#5a4630', -PLOT / 2 - 0.3, 0, PLOT / 2 + 0.3, 6); V.group.add(pole);
    const flag = box(1.0, 0.6, 0.05, p.color, -PLOT / 2 + 0.2, 1.9, PLOT / 2 + 0.3); V.group.add(flag); V.flag = flag;
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
      for (const [id, type, x, y, prog, stage, crop] of p.b) {
        bs.add(id); let m = V.b.get(id);
        if (!m || m.userData.type !== type) {
          if (m) { V.group.remove(m); this.unpick(m); }
          const info = { id, color: p.color };
          m = type === 'farm' ? farmModel(info) : BUILD[type] ? BUILD[type](info) : BUILD.house(info);
          m.userData = { type, id, pid: p.id, spin: m.getObjectByName('spin'), spinz: m.getObjectByName('spinz') };
          m.traverse(o => { if (o.isMesh) o.userData.pick = { k: 'bld', id, pid: p.id }; });
          V.group.add(m); V.b.set(id, m); this.pickables.push(m);
          m.scale.setScalar(0.01); m.userData.pop = 0;
        }
        const d = BUILDINGS[type] || { w: 3, h: 3 };
        const pos = this.local(V, x, y, d.w, d.h); m.position.set(pos.x, 0.14, pos.z); m.userData.x = x; m.userData.y = y;
        m.userData.prog = prog; m.userData.stage = stage; m.userData.crop = crop; m.userData.busy = stage === 'busy';
        if (type === 'farm') setFarmStage(m, stage, crop);
      }
      for (const [id, m] of V.b) if (!bs.has(id)) { V.group.remove(m); this.unpick(m); V.b.delete(id); this.puff(V.group.position.x + m.position.x, 0.8, V.group.position.z + m.position.z); }
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
      for (const [id, x, z, state, hat, face, name] of p.v) {
        let m = this.villagers.get(id);
        if (!m) { m = villagerModel(p.color, hat); m.position.set(x, 0.14, z); m.userData = { id, pid: p.id, tx: x, tz: z, state, face: 0, phase: Math.random() * 6, name }; m.traverse(o => { if (o.isMesh) o.userData.pick = { k: 'vil', id, pid: p.id }; }); this.scene.add(m); this.villagers.set(id, m); this.pickables.push(m); }
        const u = m.userData; u.tx = x; u.tz = z; u.state = state; u.name = name; if (face) u.tface = face;
      }
    }
    for (const [pid, V] of this.villages) if (!seen.has(pid)) { this.scene.remove(V.group); this.villages.delete(pid); }
    const alive = new Set(); for (const p of snap.players) for (const v of p.v) alive.add(v[0]);
    for (const [id, m] of this.villagers) if (!alive.has(id)) { this.scene.remove(m); this.unpick(m); this.villagers.delete(id); }
    for (const f of snap.valley.fields) { const g = this.fieldMeshes[f.id]; if (g) { const d = VALLEY_FIELDS.find(x => x.id === f.id); const k = Math.max(0.15, f.stock / d.max); g.userData.stuff.scale.setScalar(0.5 + 0.5 * k); g.userData.stuff.position.y = (k < 0.2 ? -0.15 : 0); } }
  }
  unpick(m) { const i = this.pickables.indexOf(m); if (i >= 0) this.pickables.splice(i, 1); }

  puff(x, y, z) { for (let i = 0; i < 6; i++) { const m = ball(0.16, '#fff', x, y, z, { transparent: true, opacity: 0.8 }); m.castShadow = false; this.scene.add(m); this.fx.push({ m, vx: (Math.random() - 0.5) * 1.6, vy: 1 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 1.6, life: 0.7 }); } }
  burst(x, z, color = '#ffd84a') { for (let i = 0; i < 14; i++) { const m = ball(0.1, color, x, 1.2, z, { emissive: color, emissiveIntensity: 0.4 }); m.castShadow = false; this.scene.add(m); this.fx.push({ m, vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 4, life: 1.0, g: 9 }); } }

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
      const body = m.getObjectByName('body'), arm = m.getObjectByName('arm'); const ph = this.t * 10 + u.phase;
      const walking = d > 0.03;
      body.position.y = walking ? Math.abs(Math.sin(ph)) * 0.08 : 0; body.rotation.z = walking ? Math.sin(ph) * 0.08 : 0;
      arm.rotation.x = (u.state === 'work' || u.state === 'build') && !walking ? Math.sin(this.t * 9 + u.phase) * 1.0 : 0;
      m.position.y = 0.14; body.scale.y = u.state === 'hungry' ? 0.85 : 1;
    }
    for (const V of this.villages.values()) {
      for (const [, m] of V.b) {
        const u = m.userData;
        if (u.pop !== undefined && u.pop < 1) { u.pop = Math.min(1, u.pop + dt * 3); const e = 1 + Math.sin(u.pop * Math.PI) * 0.15; m.scale.setScalar(u.pop * e); }
        else if (u.prog < 1) { m.scale.set(1, 0.25 + u.prog * 0.75, 1); }
        else m.scale.set(1, 1, 1);
        if (u.prog < 1) { m.visible = true; m.position.y = 0.14 + Math.sin(this.t * 6) * 0.01; }
        if (u.spin) u.spin.rotation.x += dt * (u.busy ? 14 : 1);
        if (u.spinz) u.spinz.rotation.z += dt * 0.8;
        if (u.busy && u.prog >= 1 && Math.random() < dt * 2) this.puff(V.group.position.x + m.position.x + 0.4, 1.6, V.group.position.z + m.position.z - 0.3);
      }
    }
    if (this.selRing.visible && this.sel) { const w = new THREE.Vector3(); this.sel.getWorldPosition(w); this.selRing.position.set(w.x, 0.25, w.z); this.selRing.rotation.z += dt; }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; f.life -= dt; f.m.position.x += f.vx * dt; f.m.position.y += f.vy * dt; f.m.position.z += f.vz * dt; if (f.g) f.vy -= f.g * dt; f.m.material.opacity = Math.max(0, f.life);
      f.m.material.transparent = true; if (f.life <= 0) { this.scene.remove(f.m); this.fx.splice(i, 1); }
    }
    if (this.board) this.board.rotation.y = Math.sin(this.t * 0.5) * 0.03;
    this.r.render(this.scene, this.cam);
  }
  project(x, y, z) { const v = new THREE.Vector3(x, y, z).project(this.cam); const r = this.canvas.getBoundingClientRect(); return { x: (v.x * 0.5 + 0.5) * r.width + r.left, y: (-v.y * 0.5 + 0.5) * r.height + r.top, vis: v.z < 1 }; }
}
