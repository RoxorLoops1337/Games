// The 3D view: real cube terrain with a back wall, voxel people and creatures, baked smooth light, seen from the side
// by a perspective camera so block sides and depth show as you move. A 2D canvas on top keeps names, weather and HUD effects.
import * as THREE from 'three';
import { W, H, BLOCKS, ITEMS, MOBS, SEA, L_LAVA } from '../shared/data.js';
import { computeLight, SEC } from './cworld.js';
import { buildAtlas } from './r3/atlas.js';
import { TerrainMesher } from './r3/terrain.js';
import { Sky, FOV } from './r3/sky.js';
import { daylight, clamp } from '../shared/util.js';
import { Menu3D } from './r3/menu3d.js';
import { buildPerson, setArmor, setHeld, poseCharacter, buildMob, poseMob, itemModel, newTint, tintable } from './r3/entities.js';

const VERT = `
attribute vec2 lit; attribute float wave;
varying vec2 vUv; varying vec3 vCol; varying vec2 vLit; varying vec3 vPos;
uniform float uTime;
void main(){
  vUv = uv; vCol = color; vLit = lit;
  vec3 p = position;
#ifdef LIQUID
  p.y += wave * sin(p.x * 2.3 + uTime * 2.2) * 0.05;
#endif
  vPos = p;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const FRAG = `
uniform sampler2D map; uniform float uSky; uniform float uTime; uniform vec3 uNight; uniform vec4 uLights[6]; uniform float uAlpha;
varying vec2 vUv; varying vec3 vCol; varying vec2 vLit; varying vec3 vPos;
void main(){
#ifdef LIQUID
  vec4 t = vec4(1.0);
#else
  vec4 t = texture2D(map, vUv);
  if (t.a < 0.5) discard;
#endif
  float s = vLit.x * uSky; float b = vLit.y;
  float flick = 0.94 + 0.06 * sin(uTime * 9.0 + vPos.x * 3.0);
  for (int i = 0; i < 6; i++) {
    vec4 L = uLights[i];
    if (L.w > 0.0) { float d = length(vec3(vPos.xy - L.xy, (vPos.z - 0.5) * 1.5)); b = max(b, clamp(1.0 - d / L.z, 0.0, 1.0) * 0.95 * flick); }
  }
  float l = max(s, b);
  l = pow(l, 1.15);
  float lum = 0.07 + 0.93 * l;
  vec3 col = t.rgb * vCol * lum;
  float warm = clamp(b - s, 0.0, 1.0);
  col *= mix(vec3(1.0), vec3(1.28, 1.02, 0.74), warm * 0.85);
  col = mix(col * uNight, col, clamp(s * 1.4 + b, 0.0, 1.0)); // cool moonlit shadows
#ifdef LIQUID
  gl_FragColor = vec4(col, uAlpha);
#else
  gl_FragColor = vec4(col, 1.0);
#endif
}`;

export class Renderer3D {
  constructor(glCanvas, r2) {
    this.cv = glCanvas; this.r2 = r2; this.ok = false;
    try {
      this.gl = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    } catch (e) { this.error = e; return; }
    this.gl.setPixelRatio(1);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.5, 600);
    this.scene.add(this.camera);
    this.atlas = buildAtlas();
    this.sections = new Map();
    this.dirty = new Set();
    this.uniforms = {
      map: { value: this.atlas.texture }, uSky: { value: 1 }, uTime: { value: 0 }, uNight: { value: new THREE.Color(0.55, 0.62, 0.95) },
      uLights: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 1, 0)) }, uAlpha: { value: 1 },
    };
    const mk = (defines, extra = {}) => new THREE.ShaderMaterial({ uniforms: { ...this.uniforms, ...(extra.uniforms || {}) }, vertexShader: VERT, fragmentShader: FRAG, vertexColors: true, side: THREE.DoubleSide, defines, ...extra.opts });
    this.solidMat = mk({});
    this.lavaMat = mk({ LIQUID: 1 }, { uniforms: { uAlpha: { value: 1 } } });
    this.waterMat = mk({ LIQUID: 1 }, { uniforms: { uAlpha: { value: 0.72 } }, opts: { transparent: true, depthWrite: false } });
    this.sky = new Sky(this.scene, this.camera);
    this.mesher = new TerrainMesher(null, this.atlas);
    this.people = new Map(); this.mobs = new Map(); this.npcs = new Map(); this.drops = new Map(); this.arrows = new Map();
    this.entGroup = new THREE.Group(); this.scene.add(this.entGroup);
    this.lightGrid = null; this.lightAt = 0; this.lightKey = '';
    this.buildCursor();
    this.buildParticles();
    this.ray = new THREE.Raycaster(); this.plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -1);
    this.w = 0; this.h = 0; this.active = false; this.ok = true;
    this.menu = new Menu3D(this.atlas);
    glCanvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; if (this.onLost) this.onLost(); });
    this.sectionBudget = 3; this.stats = { sections: 0, built: 0, draw: 0 };
  }

  menuFrame(look, t) {
    const r2 = this.r2; r2.resize(); this.resize(r2.w, r2.h);
    this.menu.frame(this.gl, this.w, this.h, t, look);
  }
  // screen position (device pixels) of a point on the front face of the blocks, for tests and overlays
  projectFront(wx, wy) {
    const v = new THREE.Vector3(wx, -wy, 1).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h };
  }

  reset() {
    for (const k of [...this.sections.keys()]) this.dropSection(k);
    for (const m of [this.people, this.mobs, this.npcs]) { for (const e of m.values()) this.entGroup.remove(e.rec.root); m.clear(); }
    for (const e of this.drops.values()) this.entGroup.remove(e.grp); this.drops.clear();
    for (const a of this.arrows.values()) this.entGroup.remove(a); this.arrows.clear();
    this.lightGrid = null;
  }

  resize(w, h) {
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- picking: the screen pixel -> tile coordinates on the front face
  pick(px, py) {
    const ndc = new THREE.Vector2((px / this.w) * 2 - 1, -(py / this.h) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.plane, p)) return null;
    return { wx: p.x, wy: -p.y };
  }

  // ---------------------------------------------------------------- cursor, cracks, ghost, order marker
  buildCursor() {
    const box = new THREE.BoxGeometry(1.03, 1.03, 1.03);
    this.cursorLines = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.9 }));
    this.cursorLines.renderOrder = 50; this.cursorLines.visible = false; this.scene.add(this.cursorLines);
    this.ghost = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false }));
    this.ghost.visible = false; this.ghost.renderOrder = 49; this.scene.add(this.ghost);
    this.markLines = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: 0x78e6ff, depthTest: false, transparent: true }));
    this.markLines.renderOrder = 50; this.markLines.visible = false; this.scene.add(this.markLines);
    // cracks: five stages painted once
    this.crackTex = [];
    for (let st = 0; st < 5; st++) {
      const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
      g.strokeStyle = 'rgba(15,10,10,0.85)'; g.lineWidth = 2.2; g.lineCap = 'round';
      let seed = 7;
      const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let i = 0; i <= st * 2 + 1; i++) { let x = 32, y = 32; g.beginPath(); g.moveTo(x, y); const a = i * 2.4 + 0.6; for (let k = 0; k < 4; k++) { x += Math.cos(a + (r() - 0.5)) * 9; y += Math.sin(a + (r() - 0.5)) * 9; g.lineTo(x, y); } g.stroke(); }
      const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; this.crackTex.push(t);
    }
    this.crack = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.crackTex[0], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.crack.position.z = 1.015; this.crack.visible = false; this.crack.renderOrder = 40; this.scene.add(this.crack);
  }

  // ---------------------------------------------------------------- particles as little cubes
  buildParticles() {
    this.maxParts = 700;
    this.partMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), this.maxParts);
    this.partMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.partMesh.frustumCulled = false; this.partMesh.count = 0;
    this.partMesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.scene.add(this.partMesh);
    this.colCache = new Map(); this.dummy = new THREE.Object3D();
  }
  parseColor(s) {
    let c = this.colCache.get(s);
    if (!c) {
      c = new THREE.Color(1, 1, 1);
      const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(s);
      if (m) c.setRGB(+m[1] / 255, +m[2] / 255, +m[3] / 255); else { try { c.set(s); } catch { /* keep white */ } }
      this.colCache.set(s, c);
    }
    return c;
  }

  // ---------------------------------------------------------------- terrain sections
  syncSections(G) {
    const cw = G.cw;
    this.mesher.cw = cw;
    const ts = G.ts, aspect = this.w / this.h;
    const halfH0 = (this.h / ts) / 2, halfW0 = halfH0 * aspect;
    const k = 1.12;
    const x0 = Math.floor((G.cam.x - halfW0 * k - 2) / SEC), x1 = Math.floor((G.cam.x + halfW0 * k + 2) / SEC);
    const y0 = Math.max(0, Math.floor((G.cam.y - halfH0 * k - 2) / SEC)), y1 = Math.min(H / SEC - 1, Math.floor((G.cam.y + halfH0 * k + 2) / SEC));
    const want = [];
    for (let sy = y0; sy <= y1; sy++) for (let sx = x0; sx <= x1; sx++) {
      if (sx < 0 || sx >= W / SEC || !cw.hasChunk(Math.floor(sx * SEC / 32))) continue;
      const key = sx + ',' + sy, cur = this.sections.get(key);
      if (!cur || cw.dirty3.has(key)) want.push([Math.hypot(sx * SEC + 8 - G.cam.x, sy * SEC + 8 - G.cam.y), sx, sy, key]);
      else if (cur) cur.seen = G.t;
    }
    want.sort((a, b) => a[0] - b[0]);
    const budget = this.sections.size < 6 ? 12 : this.sectionBudget;
    for (let i = 0; i < Math.min(budget, want.length); i++) {
      const [, sx, sy, key] = want[i];
      this.buildSection(sx, sy, key, G);
    }
    // forget far sections
    if (this.sections.size > 260) {
      const arr = [...this.sections.entries()].sort((a, b) => a[1].seen - b[1].seen);
      for (let i = 0; i < arr.length - 200; i++) this.dropSection(arr[i][0]);
    }
    // sections behind the camera view are hidden by frustum culling already
  }
  buildSection(sx, sy, key, G) {
    this.dropSection(key, true);
    const geos = this.mesher.build(sx, sy);
    const rec = { meshes: [], seen: G.t };
    const add = (geo, mat, order) => { if (!geo) return; const m = new THREE.Mesh(geo, mat); m.renderOrder = order; m.matrixAutoUpdate = false; this.scene.add(m); rec.meshes.push(m); };
    add(geos.solid, this.solidMat, 0); add(geos.lava, this.lavaMat, 1); add(geos.water, this.waterMat, 3);
    this.sections.set(key, rec);
    G.cw.dirty3.delete(key);
    this.stats.built++;
  }
  dropSection(key, keep) {
    const rec = this.sections.get(key);
    if (!rec) return;
    for (const m of rec.meshes) { this.scene.remove(m); m.geometry.dispose(); }
    if (!keep) this.sections.delete(key);
  }

  // ---------------------------------------------------------------- light for creatures (sampled from the same BFS)
  updateLightGrid(G) {
    const now = performance.now();
    const tx = Math.floor(G.cam.x), ty = Math.floor(G.cam.y);
    const key = tx + ',' + ty + ',' + G.cw.ver;
    if (this.lightGrid && (key === this.lightKey || now - this.lightAt < 100)) return;
    const halfH = Math.ceil((this.h / G.ts) / 2) + 6, halfW = Math.ceil(halfH * (this.w / this.h)) + 6;
    this.lightGrid = computeLight(G.cw, tx - halfW - 8, ty - halfH - 8, halfW * 2 + 17, halfH * 2 + 17, null);
    this.lightKey = key; this.lightAt = now;
  }
  sampleLight(x, y) { // returns [sky, blk] 0..1 at tile coordinates
    const L = this.lightGrid;
    if (!L) return [1, 0];
    const cx = Math.floor(x) - L.x0, cy = Math.floor(y) - L.y0;
    if (cx < 0 || cy < 0 || cx >= L.w || cy >= L.h) return [1, 0];
    const i = cy * L.w + cx;
    return [L.sky[i] / 15, L.blk[i] / 15];
  }
  setTint(tint, x, y, extra = 0) {
    const [s, b] = this.sampleLight(x, y);
    const l = Math.pow(Math.max(s * this.uniforms.uSky.value, b), 1.15);
    const lum = Math.min(1.15, 0.12 + 0.88 * l + extra);
    const warm = clamp(b - s * this.uniforms.uSky.value, 0, 1) * 0.5;
    tint.value.setRGB(lum * (1 + warm * 0.3), lum * (1 + warm * 0.02), lum * (1 - warm * 0.3));
  }

  // ---------------------------------------------------------------- entities
  syncPeople(G, dt) {
    const seen = new Set();
    for (const p of G.players.values()) {
      seen.add(p.id);
      const lookKey = JSON.stringify(p.look);
      let e = this.people.get(p.id);
      if (!e || e.lookKey !== lookKey) {
        if (e) this.entGroup.remove(e.rec.root);
        const tint = newTint();
        e = { rec: buildPerson({ skin: 0, eyes: 0, hair: 0, hairStyle: 1, shirt: 4, pants: 2, ...p.look }, tint, this.atlas), tint, lookKey, t: 0 };
        this.entGroup.add(e.rec.root); this.people.set(p.id, e);
      }
      this.poseOne(e, p, G, dt);
    }
    for (const [id, e] of this.people) if (!seen.has(id)) { this.entGroup.remove(e.rec.root); this.people.delete(id); }
  }
  poseOne(e, p, G, dt) {
    const rec = e.rec;
    rec.root.position.set(p.x, -p.y, 0.5);
    this.setTint(e.tint, p.x, p.y - 0.9, p.hurtT > 0 ? 0.5 : 0);
    setArmor(rec, p.armor || [0, 0, 0]); setHeld(rec, p.held || 0);
    e.t2 = (e.t2 || 0) + dt * 1.6;
    poseCharacter(rec, { dir: p.dir, t: p.anim, t2: e.t2, speed: Math.min(1, Math.abs(p.vx) / 6), air: !p.onGround && !p.climb, climb: p.climb, swing: p.swingT > 0 ? p.swingT / 0.25 : 0, dead: p.dead, hurt: p.hurtT > 0, blink: p.blink > 0, vy: p.vy }, dt);
    rec.root.position.y = -p.y + (rec.lift || 0);
    rec.root.visible = true;
  }
  syncNpcs(G, dt) {
    const seen = new Set();
    for (const n of G.npcs.values()) {
      seen.add(n.id);
      let e = this.npcs.get(n.id);
      if (!e) {
        const tint = newTint();
        e = { rec: buildPerson({ skin: 0, eyes: 0, hair: 0, hairStyle: 1, shirt: 4, pants: 2, ...n.look }, tint, this.atlas), tint };
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.8), new THREE.MeshBasicMaterial({ color: 0xffffff })); band.position.set(0, 0.52, 0); band.userData.band = true;
        e.rec.head.add(band); e.band = band;
        this.entGroup.add(e.rec.root); this.npcs.set(n.id, e);
      }
      const tools = { chop: ITEMS.length ? 0 : 0 };
      void tools;
      e.band.material.color.set(({ follow: '#4ad8ff', chop: '#7ac84a', mine: '#ff9a3d', farm: '#f2d33c', guard: '#e2574c', stay: '#bbbbbb' })[n.job] || '#ddd');
      e.rec.root.position.set(n.x, -n.y, 0.5);
      this.setTint(e.tint, n.x, n.y - 0.9);
      poseCharacter(e.rec, { dir: n.dir, t: n.anim, t2: G.t, speed: Math.min(1, Math.abs(n.vx) / 6), air: !n.onGround, climb: false, swing: n.swingT > 0 ? n.swingT / 0.25 : 0, dead: false, hurt: false, blink: false, vy: 0 }, dt);
    }
    for (const [id, e] of this.npcs) if (!seen.has(id)) { this.entGroup.remove(e.rec.root); this.npcs.delete(id); }
  }
  syncMobs(G, dt) {
    const seen = new Set();
    for (const m of G.mobs.values()) {
      seen.add(m.id);
      let e = this.mobs.get(m.id);
      if (!e) { const tint = newTint(); e = { rec: buildMob(m.type, tint), tint }; this.entGroup.add(e.rec.root); this.mobs.set(m.id, e); }
      e.rec.root.position.set(m.x, -m.y, 0.5);
      const md = MOBS[m.type];
      if (md.swim) e.rec.root.position.y -= md.h * 0.5;
      this.setTint(e.tint, m.x, m.y - md.h / 2, m.hurt > 0 ? 0.55 : 0);
      poseMob(e.rec, { dir: m.dir, t: m.anim, hurt: m.hurt > 0, air: !m.onGround }, dt);
    }
    for (const [id, e] of this.mobs) if (!seen.has(id)) { this.entGroup.remove(e.rec.root); this.mobs.delete(id); }
  }
  syncDrops(G) {
    const seen = new Set();
    for (const d of G.drops.values()) {
      seen.add(d.id);
      let e = this.drops.get(d.id);
      if (!e) { const tint = newTint(); const grp = new THREE.Group(); const m = itemModel(d.item, 0.46, tint, this.atlas); grp.add(m); this.entGroup.add(grp); e = { grp, tint }; this.drops.set(d.id, e); }
      e.grp.position.set(d.x, -d.y + 0.28 + Math.sin(G.t * 3 + d.id) * 0.05, 0.5);
      e.grp.rotation.y = G.t * 1.6 + d.id;
      this.setTint(e.tint, d.x, d.y - 0.3);
    }
    for (const [id, e] of this.drops) if (!seen.has(id)) { this.entGroup.remove(e.grp); this.drops.delete(id); }
  }
  syncArrows(G) {
    const seen = new Set();
    for (const a of G.arrows.values()) {
      seen.add(a.id);
      let e = this.arrows.get(a.id);
      if (!e) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.07, 0.07), new THREE.MeshBasicMaterial({ color: 0xc8a070 })); const tip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: 0xc8ccd4 })); tip.position.x = 0.45; m.add(tip); this.entGroup.add(m); e = m; this.arrows.set(a.id, e); }
      e.position.set(a.x, -a.y, 0.5); e.rotation.z = -Math.atan2(a.vy, a.vx);
    }
    for (const [id, m] of this.arrows) if (!seen.has(id)) { this.entGroup.remove(m); this.arrows.delete(id); }
  }

  syncParticles(G) {
    let n = 0;
    for (const p of G.parts) {
      if (p.text || n >= this.maxParts) continue;
      const life = clamp(p.life / p.max * 1.6, 0, 1), s = Math.max(0.05, p.size * 0.9) * (0.4 + 0.6 * life);
      this.dummy.position.set(p.x, -p.y, 0.5 + ((p.x * 13.7) % 1) * 0.5); this.dummy.rotation.set(G.t * 3 + n, G.t * 2, 0); this.dummy.scale.setScalar(s); this.dummy.updateMatrix();
      this.partMesh.setMatrixAt(n, this.dummy.matrix); this.partMesh.setColorAt(n, this.parseColor(p.col));
      n++;
    }
    this.partMesh.count = n; this.partMesh.instanceMatrix.needsUpdate = true; if (this.partMesh.instanceColor) this.partMesh.instanceColor.needsUpdate = true;
  }

  syncCursor(G) {
    const c = G.cursor;
    if (c && c.ok) {
      this.cursorLines.visible = true; this.cursorLines.position.set(c.x + 0.5, -(c.y + 0.5), 0.5);
      this.cursorLines.material.color.set(c.reach ? 0xffffff : 0xff6060);
      if (G.ghost && c.reach) { this.ghost.visible = true; this.ghost.position.copy(this.cursorLines.position); this.ghost.material.color.set(BLOCKS[G.ghost].color); } else this.ghost.visible = false;
    } else { this.cursorLines.visible = false; this.ghost.visible = false; }
    const mi = G.mining;
    if (mi && mi.prog > 0) {
      this.crack.visible = true; this.crack.position.set(mi.x + 0.5, -(mi.y + 0.5), 1.015);
      this.crack.material.map = this.crackTex[Math.min(4, Math.floor(mi.prog * 5))]; this.crack.material.needsUpdate = true;
    } else this.crack.visible = false;
    if (G.order && G.mark) {
      this.markLines.visible = true; this.markLines.position.set(G.mark.x + 0.5, -(G.mark.y + 0.5), 0.5);
      this.markLines.material.color.set(G.mark.kind === 'dig' ? 0xff8c3c : G.mark.kind === 'mine' ? 0xffdc5a : 0x78e6ff);
      this.markLines.scale.setScalar(1 + 0.08 * Math.sin(G.t * 8));
    } else this.markLines.visible = false;
  }

  // ---------------------------------------------------------------- the frame
  frame(G) {
    const r2 = this.r2;
    r2.resize();
    this.resize(r2.w, r2.h);
    const dt = Math.min(0.1, G.dt || 0.016);
    const ts = G.ts;
    // camera: distance chosen so a tile on the middle plane is exactly ts pixels tall
    const dist = (this.h / ts) / (2 * Math.tan(FOV * Math.PI / 360));
    this.camera.position.set(G.cam.x, -G.cam.y, 0.5 + dist);
    this.camera.lookAt(G.cam.x, -G.cam.y, 0.5);
    this.camera.near = Math.max(0.3, dist - 30); this.camera.far = dist + 140; this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    // lighting uniforms
    const dl = daylight(G.time);
    this.uniforms.uSky.value = (0.27 + 0.73 * dl) * (1 - 0.25 * G.weather.k);
    this.uniforms.uTime.value = G.t;
    this.uniforms.uNight.value.setRGB(0.6 + 0.4 * dl, 0.68 + 0.32 * dl, 1.0);
    const lights = this.uniforms.uLights.value; let li = 0;
    for (const p of G.players.values()) {
      const lv = p.held && ITEMS[p.held] && ITEMS[p.held].place ? BLOCKS[ITEMS[p.held].place].light : 0;
      if (lv && li < 6) { lights[li].set(p.x, -(p.y - 1.1), Math.min(10, lv * 0.7), 1); li++; }
    }
    for (; li < 6; li++) lights[li].set(0, 0, 1, 0);
    this.updateLightGrid(G);
    this.syncSections(G);
    this.sky.update(G, this.w / this.h);
    this.syncPeople(G, dt); this.syncNpcs(G, dt); this.syncMobs(G, dt); this.syncDrops(G); this.syncArrows(G);
    this.syncParticles(G); this.syncCursor(G);
    this.gl.render(this.scene, this.camera);
    this.stats.sections = this.sections.size; this.stats.draw = this.gl.info.render.calls; this.stats.tris = this.gl.info.render.triangles;
    // 2D layer on top: names, bubbles, weather, glows, vignette
    r2.frameOverlay(G);
  }
}
void tintable; void L_LAVA; void SEA;
