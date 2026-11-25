// Galaxy Pusher: the machine in real 3D (three.js, vendored). Coins are instanced metal discs lit by a room
// environment, so they shine, tilt and catch the light like real tokens; towers are drawn coin by coin from the
// tower body's transform. The 2D overlay (battle, HUD, wheel) is drawn on a separate canvas above this one.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/RoomEnvironment.js';
import { W, EDGE, GUT, PH, PUSH_HALF, BACK_WALL, KINDS, SHOOTER, RING_N, RING_R, LAYER_H, TWIST, COIN_HH, NOTCH_R, NOTCH_W, BACK_RECESS, FACE_RET, TOWER_R, Machine } from './machine.js';
import { sprite, COLS } from './render.js';

const MAX = { c: 1500, g: 1100, B: 60, P: 60, Y: 60 };

function canvasTex(c, srgb = true) { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// the reeded edge of a coin: fine vertical grooves (used as colour and bump)
function reedTex(base, dark, n = 90) {
  const c = mk(512, 16), g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 512, 16);
  for (let i = 0; i < n; i++) { const x = (i / n) * 512; g.fillStyle = dark; g.fillRect(x, 0, 512 / n * 0.45, 16); }
  return c;
}
// a casino-chip edge: colour with white blocks
function chipEdgeTex(main, dark) {
  const c = mk(512, 32), g = c.getContext('2d');
  g.fillStyle = main; g.fillRect(0, 0, 512, 32);
  for (let i = 0; i < 8; i++) { g.fillStyle = '#ffffff'; g.fillRect(i * 64 + 16, 0, 32, 32); }
  g.fillStyle = dark; g.fillRect(0, 0, 512, 3); g.fillRect(0, 29, 512, 3);
  return c;
}
function grime(c, g, n, a) { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * a})`; g.fillRect(Math.random() * c.width, Math.random() * c.height, 2, 2); } }

export class View3D {
  constructor(canvas) {
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.9;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = (this.scene = new THREE.Scene());
    const pm = new THREE.PMREMGenerator(r);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    this.camera = new THREE.PerspectiveCamera(38, 1, 1, 400);
    // light: a soft key from the front left with shadows, a cool fill, neon rims at the back
    scene.add(new THREE.HemisphereLight(0x9fb8ff, 0x1a0b2e, 0.55));
    const key = (this.key = new THREE.DirectionalLight(0xfff2e0, 1.8));
    key.position.set(-10, 40, 22); key.target.position.set(0, 0, 3);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
    Object.assign(key.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 5, far: 90 });
    scene.add(key, key.target);
    this.rimL = new THREE.PointLight(0x3fd0ff, 60, 40, 2); this.rimL.position.set(-W / 2 + 2, PH + 9, BACK_WALL + 2);
    this.rimR = new THREE.PointLight(0xff4fb0, 60, 40, 2); this.rimR.position.set(W / 2 - 2, PH + 9, BACK_WALL + 2);
    scene.add(this.rimL, this.rimR);
    this.buildCabinet();
    this.buildCoins();
    this.buildShooters();
    this.edgeGlow = 0;
  }

  // ------------------------------------------------------------------ cabinet
  buildCabinet() {
    const S = this.scene;
    // floor: dark brushed steel with a fine grid
    const fc = mk(512, 512), fg = fc.getContext('2d');
    fg.fillStyle = '#39415a'; fg.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y++) { fg.fillStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.03})`; fg.fillRect(0, y, 512, 1); }
    fg.strokeStyle = 'rgba(120,200,255,0.16)'; fg.lineWidth = 2; for (let i = 0; i <= 512; i += 64) { fg.beginPath(); fg.moveTo(i, 0); fg.lineTo(i, 512); fg.moveTo(0, i); fg.lineTo(512, i); fg.stroke(); }
    const ft = canvasTex(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(3, 4);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, EDGE + 30), new THREE.MeshStandardMaterial({ map: ft, metalness: 0.55, roughness: 0.42 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, (EDGE - 30) / 2); floor.receiveShadow = true; S.add(floor);
    // corner gutters: dark slots with red trim at the front edge
    for (const sx of [-1, 1]) {
      const gut = new THREE.Mesh(new THREE.PlaneGeometry(GUT, 2.2), new THREE.MeshBasicMaterial({ color: 0x07030f }));
      gut.rotation.x = -Math.PI / 2; gut.position.set(sx * (W / 2 - GUT / 2), 0.005, EDGE - 1.1); S.add(gut);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(GUT, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: 0xff3b5c }));
      trim.position.set(sx * (W / 2 - GUT / 2), 0.06, EDGE - 2.2); S.add(trim);
    }
    // front lip: a chrome rail with a light strip below the edge
    const lip = new THREE.Mesh(new THREE.BoxGeometry(W + 2, 3, 1.4), new THREE.MeshStandardMaterial({ color: 0x1b1438, metalness: 0.6, roughness: 0.4 }));
    lip.position.set(0, -1.7, EDGE + 0.7); S.add(lip);
    this.strip = new THREE.Mesh(new THREE.BoxGeometry(W - 2 * GUT, 0.25, 0.25), new THREE.MeshBasicMaterial({ color: 0xffd75c }));
    this.strip.position.set(0, -0.25, EDGE + 0.15); S.add(this.strip);
    // side walls: smoked glass with neon top edges
    const glass = new THREE.MeshStandardMaterial({ color: 0x8fb8ff, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.12, depthWrite: false });
    for (const sx of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 7, EDGE - BACK_WALL + 2), glass);
      wall.position.set(sx * (W / 2 + 0.15), 3.5, (EDGE + BACK_WALL) / 2 - 1); S.add(wall);
      const neon = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, EDGE - BACK_WALL + 2), new THREE.MeshBasicMaterial({ color: sx < 0 ? 0x3fd0ff : 0xff4fb0 }));
      neon.position.set(sx * (W / 2 + 0.15), 7, (EDGE + BACK_WALL) / 2 - 1); S.add(neon);
    }
    // back wall with the cabinet art, and the combo ring panel
    const bc = mk(1024, 512), bg = bc.getContext('2d');
    const gr = bg.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#120a3a'); gr.addColorStop(1, '#2d1d6e'); bg.fillStyle = gr; bg.fillRect(0, 0, 1024, 512);
    bg.strokeStyle = 'rgba(120,200,255,0.25)'; bg.lineWidth = 3;
    for (let i = 0; i < 26; i++) { const x = 20 + i * 40, y = 140 + ((i * 97) % 300); bg.beginPath(); bg.moveTo(x, 512); bg.lineTo(x, y); bg.lineTo(x + 30, y - 30); bg.stroke(); bg.fillStyle = 'rgba(120,200,255,0.5)'; bg.beginPath(); bg.arc(x + 30, y - 30, 5, 0, Math.PI * 2); bg.fill(); }
    const backMat = new THREE.MeshStandardMaterial({ map: canvasTex(bc), metalness: 0.3, roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.18, emissiveMap: canvasTex(bc) });
    // the back wall: two side panels and, between them, a recessed bay where towers rise
    const sideW = W / 2 + 1 - NOTCH_W;
    for (const sx of [-1, 1]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(sideW, 16), backMat); b.position.set(sx * (NOTCH_W + sideW / 2), PH + 8, BACK_WALL - 0.02); S.add(b); }
    const bay = new THREE.Mesh(new THREE.PlaneGeometry(NOTCH_W * 2, 16), new THREE.MeshStandardMaterial({ color: 0x241a52, metalness: 0.5, roughness: 0.45 }));
    bay.position.set(0, PH + 8, BACK_RECESS - 0.02); S.add(bay);
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(BACK_WALL - BACK_RECESS, 16), new THREE.MeshStandardMaterial({ color: 0x3a2a7a, metalness: 0.4, roughness: 0.5, side: THREE.DoubleSide }));
      side.rotation.y = Math.PI / 2; side.position.set(sx * NOTCH_W, PH + 8, (BACK_WALL + BACK_RECESS) / 2); S.add(side);
      const neon = new THREE.Mesh(new THREE.BoxGeometry(0.15, 16, 0.15), new THREE.MeshBasicMaterial({ color: 0xffd75c }));
      neon.position.set(sx * NOTCH_W, PH + 8, BACK_WALL); S.add(neon);
    }
    // the lift: a glowing ring on the floor where a tower comes up (hidden under the pusher until it pulls back)
    this.lift = new THREE.Mesh(new THREE.RingGeometry(TOWER_R - 0.2, TOWER_R + 0.15, 48), new THREE.MeshBasicMaterial({ color: 0xffd75c, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    this.lift.rotation.x = -Math.PI / 2; this.lift.position.set(0, 0.012, FACE_RET); S.add(this.lift);
    this.ringC = mk(256, 256);
    this.ringT = canvasTex(this.ringC);
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 5.6), new THREE.MeshBasicMaterial({ map: this.ringT, transparent: true }));
    ring.position.set(-(NOTCH_W + sideW / 2), PH + 7.4, BACK_WALL + 0.05); S.add(ring);
    this.ringKey = '';
    // pusher: a chrome block with a glowing front edge
    this.pusher = new THREE.Group();
    // the block with its half-circle notch, drawn as a 2D outline (x, -z) extruded upward by the shelf height
    const sh = new THREE.Shape();
    sh.moveTo(-W / 2, PUSH_HALF); sh.lineTo(W / 2, PUSH_HALF); sh.lineTo(W / 2, -PUSH_HALF); sh.lineTo(NOTCH_R, -PUSH_HALF);
    sh.absarc(0, -PUSH_HALF, NOTCH_R, 0, Math.PI, false); sh.lineTo(-W / 2, -PUSH_HALF); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: PH, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2, curveSegments: 40 });
    geo.rotateX(-Math.PI / 2); geo.translate(0, -PH / 2, 0);
    const body = new THREE.Mesh(geo, [new THREE.MeshStandardMaterial({ color: 0x8a93a8, metalness: 0.9, roughness: 0.3 }), new THREE.MeshStandardMaterial({ color: 0xd9dee8, metalness: 0.6, roughness: 0.35 })]);
    body.receiveShadow = true; body.castShadow = true; this.pusher.add(body);
    // neon along the front edge: the two straight parts and the curve of the notch
    const neonMat = (this.neonMat = new THREE.MeshBasicMaterial({ color: 0x5cd0ff }));
    const straight = W / 2 - NOTCH_R;
    for (const sx of [-1, 1]) { const n = new THREE.Mesh(new THREE.BoxGeometry(straight, 0.16, 0.16), neonMat); n.position.set(sx * (NOTCH_R + straight / 2), PH / 2 + 0.02, PUSH_HALF + 0.03); this.pusher.add(n); }
    const arc = new THREE.Mesh(new THREE.TorusGeometry(NOTCH_R, 0.08, 6, 48, Math.PI), neonMat);
    arc.rotation.x = -Math.PI / 2; arc.position.set(0, PH / 2 + 0.02, PUSH_HALF); this.pusher.add(arc);
    this.pusherNeon = { material: neonMat };
    S.add(this.pusher);
  }
  drawRing(game, t) {
    const fev = game.fever > 0, key = fev ? 'f' + Math.floor(t * 20) : game.combo + ':' + game.meter;
    if (key === this.ringKey) return; this.ringKey = key;
    const c = this.ringC, g = c.getContext('2d'); g.clearRect(0, 0, 256, 256);
    g.lineWidth = 18; g.strokeStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(128, 128, 100, 0, Math.PI * 2); g.stroke();
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 + (i * Math.PI * 2) / n + 0.06, a1 = a0 + (Math.PI * 2) / n - 0.12;
      g.strokeStyle = fev ? `hsl(${(t * 300 + i * 60) % 360},100%,62%)` : i < game.meter ? ['#2fb4ff', '#ff4fb0', '#ffc21f'][i % 3] : 'rgba(255,255,255,0.12)';
      g.shadowColor = g.strokeStyle; g.shadowBlur = i < game.meter || fev ? 16 : 0;
      g.beginPath(); g.arc(128, 128, 100, a0, a1); g.stroke();
    }
    g.shadowBlur = 0; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 64px "Russo One", sans-serif'; g.fillStyle = fev ? '#fff' : '#ffd75c';
    g.fillText(fev ? 'x2' : 'x' + Math.min(4, 1 + 0.25 * game.combo).toFixed(2).replace(/0$/, '').replace(/\.0$/, ''), 128, 118);
    g.font = '22px "Russo One", sans-serif'; g.fillStyle = '#bfe6ff'; g.fillText(fev ? 'DOUBLE TIME' : 'COMBO ' + game.combo, 128, 172);
    this.ringT.needsUpdate = true;
  }

  // ------------------------------------------------------------------ coins
  buildCoins() {
    this.inst = {};
    const silverFace = canvasTex(sprite('c')), goldFace = canvasTex(sprite('g'));
    const mat = (o) => new THREE.MeshStandardMaterial(o);
    const reedS = canvasTex(reedTex('#d9dee8', '#8a93a6')), reedG = canvasTex(reedTex('#ffd970', '#a8700d'));
    for (const k of ['c', 'g', 'B', 'P', 'Y']) {
      const K = KINDS[k];
      const geo = new THREE.CylinderGeometry(K.r, K.r, K.hh * 2, 40, 1);
      let side, face;
      if (k === 'c' || k === 'g') {
        const f = k === 'c' ? silverFace : goldFace, e = k === 'c' ? reedS : reedG;
        side = mat({ map: e, bumpMap: e, bumpScale: 0.6, color: k === 'c' ? 0xb4bac6 : 0xd9b35a, metalness: 1, roughness: 0.36 });
        face = mat({ map: f, bumpMap: f, bumpScale: 1.6, color: k === 'c' ? 0xbfc5d0 : 0xe8c062, metalness: 1, roughness: 0.3 });
      } else {
        const C = COLS[k];
        side = mat({ map: canvasTex(chipEdgeTex(C.main, C.dark)), metalness: 0, roughness: 0.6, envMapIntensity: 0.3 });
        face = mat({ map: canvasTex(sprite(k)), metalness: 0, roughness: 0.55, envMapIntensity: 0.35 });
      }
      const m = new THREE.InstancedMesh(geo, [side, face, face], MAX[k]);
      m.castShadow = true; m.receiveShadow = true; m.count = 0; m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(m); this.inst[k] = m;
    }
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
    this._tq = new THREE.Quaternion(); this._tp = new THREE.Vector3(); this._lq = new THREE.Quaternion(); this._lp = new THREE.Vector3(); this._ax = new THREE.Vector3(0, 1, 0);
  }

  // ------------------------------------------------------------------ shooters
  buildShooters() {
    this.shooters = {};
    for (const side of ['L', 'R']) {
      const S = SHOOTER[side], grp = new THREE.Group(), dir = side === 'L' ? 1 : -1;
      grp.position.set(S.x, S.y - 0.6, S.z - 0.6);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 1.2, 24), new THREE.MeshStandardMaterial({ color: 0x2a2f3d, metalness: 0.7, roughness: 0.4 }));
      base.position.y = -0.9; grp.add(base);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(1.15, 28, 20), new THREE.MeshStandardMaterial({ color: 0xd98a1a, metalness: 0.4, roughness: 0.45, envMapIntensity: 0.4 }));
      grp.add(ball);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.09, 8, 32), new THREE.MeshBasicMaterial({ color: 0x5cd0ff }));
      ring.rotation.x = Math.PI / 2; grp.add(ring);
      const barrelPivot = new THREE.Group(); grp.add(barrelPivot);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 2.6, 20), new THREE.MeshStandardMaterial({ color: 0x9aa3b5, metalness: 1, roughness: 0.3 }));
      barrel.rotation.z = Math.PI / 2; barrel.position.x = dir * 1.4; barrelPivot.add(barrel);
      const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.12, 8, 20), new THREE.MeshBasicMaterial({ color: 0xffd75c }));
      muzzle.rotation.y = Math.PI / 2; muzzle.position.x = dir * 2.7; barrelPivot.add(muzzle);
      const flash = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), new THREE.MeshBasicMaterial({ color: 0xfff6c0, transparent: true, opacity: 0 }));
      flash.position.x = dir * 3.1; barrelPivot.add(flash);
      barrelPivot.rotation.y = -dir * 0.55; barrelPivot.rotation.z = dir * 0.25;
      this.scene.add(grp);
      this.shooters[side] = { grp, ring, muzzle, flash, barrel, barrelPivot, dir };
    }
  }

  // ------------------------------------------------------------------ camera fit: the field fills the rect, the back wall shows
  resize(w, h) {
    this.renderer.setSize(w, h, false);
    const cam = this.camera; cam.aspect = w / h; cam.clearViewOffset();
    cam.fov = w / h < 0.75 ? 36 : 42;
    const target = new THREE.Vector3(0, 0, 2.5);
    const dir = new THREE.Vector3(0, Math.sin(1.12), Math.cos(1.12)).normalize();    // looking down ~64 degrees from the player side
    const pts = [[-W / 2, 0, EDGE + 0.6], [W / 2, 0, EDGE + 0.6], [-W / 2, 0, BACK_WALL], [W / 2, 0, BACK_WALL], [-W / 2, PH + 9.5, BACK_WALL], [W / 2, PH + 9.5, BACK_WALL], [0, -2.6, EDGE + 1.4]].map((p) => new THREE.Vector3(...p));
    const span = (d) => {
      cam.position.copy(target).addScaledVector(dir, d); cam.lookAt(target); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const p of pts) { const v = p.clone().project(cam); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
      return { x0, x1, y0, y1 };
    };
    // the closest camera whose view holds the whole machine (width may crop the outer wall by a hair)
    let lo = 8, hi = 300;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2, S = span(mid); if (S.x1 - S.x0 <= 2.2 && S.y1 - S.y0 <= 1.98) hi = mid; else lo = mid; }
    const S = span(hi);
    // slide the view window so the front lip sits on the bottom edge: spare height goes to the back wall at the top
    const xc = (S.x0 + S.x1) / 2;
    cam.setViewOffset(w, h, xc * w / 2, (-1 - S.y0) * h / 2 - 2, w, h);
    cam.updateProjectionMatrix();
    this.w = w; this.h = h;
  }
  project(x, y, z, rect) {
    const v = this._pv || (this._pv = new THREE.Vector3());
    v.set(x, y, z).project(this.camera);
    return { x: rect.x + (v.x * 0.5 + 0.5) * rect.w, y: rect.y + (-v.y * 0.5 + 0.5) * rect.h };
  }

  // ------------------------------------------------------------------ per frame
  render(game, t, st) {
    const M = game.f, m = this._m, q = this._q, p = this._p, s = this._s;
    const counts = { c: 0, g: 0, B: 0, P: 0, Y: 0 };
    for (const c of M.coins) {
      if (!c.body) continue;
      const tr = c.body.translation(), ro = c.body.rotation();
      const I = this.inst[c.k]; if (counts[c.k] >= MAX[c.k]) continue;
      p.set(tr.x, tr.y, tr.z); q.set(ro.x, ro.y, ro.z, ro.w);
      m.compose(p, q, s); I.setMatrixAt(counts[c.k]++, m);
    }
    // towers: every coin of the ring, placed by the tower body
    for (const T of M.towers) {
      if (!T.body) continue;
      const tr = T.body.translation(), ro = T.body.rotation();
      this._tp.set(tr.x, tr.y, tr.z); this._tq.set(ro.x, ro.y, ro.z, ro.w);
      const k = T.gold ? 'g' : 'c', I = this.inst[k];
      const nDraw = T.rise && T.state === 'build' ? T.want : T.n;   // a rising tower is whole, coming up through the floor
      for (let i = 0; i < nDraw && counts[k] < MAX[k]; i++) {
        const [lx, ly, lz] = Machine.ringLocal(T, i);
        this._lp.set(lx, ly, lz).applyQuaternion(this._tq).add(this._tp);
        this._lq.setFromAxisAngle(this._ax, i * 1.7).premultiply(this._tq);
        m.compose(this._lp, this._lq, s); I.setMatrixAt(counts[k]++, m);
      }
      T.crown.forEach((ck, i) => {
        const [cx, cy, cz] = Machine.crownLocal(T, i);
        this._lp.set(cx, cy, cz).applyQuaternion(this._tq).add(this._tp);
        m.compose(this._lp, this._tq, s); if (counts[ck] < MAX[ck]) this.inst[ck].setMatrixAt(counts[ck]++, m);
      });
    }
    for (const k in this.inst) { const I = this.inst[k]; I.count = counts[k]; I.instanceMatrix.needsUpdate = true; }
    // pusher, lights, neon
    this.pusher.position.set(0, PH / 2, M.pf - PUSH_HALF);
    const fev = game.fever > 0;
    const hue = (t * 0.5) % 1;
    this.pusherNeon.material.color.setHSL(fev ? hue : 0.55, 1, game.turboT > 0 ? 0.5 + 0.3 * Math.sin(t * 20) : 0.62);
    this.strip.material.color.setHSL(fev ? (hue + 0.3) % 1 : 0.12, 1, 0.55 + 0.35 * Math.min(1, st.edgeGlow || 0));
    this.rimL.intensity = 55 + 20 * Math.sin(t * 2); this.rimR.intensity = 55 + 20 * Math.sin(t * 2 + 2);
    if (fev) { this.rimL.color.setHSL(hue, 1, 0.6); this.rimR.color.setHSL((hue + 0.5) % 1, 1, 0.6); } else { this.rimL.color.set(0x3fd0ff); this.rimR.color.set(0xff4fb0); }
    for (const side of ['L', 'R']) {
      const S = this.shooters[side], s2 = st.shooter[side];
      S.barrel.position.x = S.dir * (1.4 - s2.flash * 0.45);
      S.flash.material.opacity = s2.flash; S.flash.scale.setScalar(0.6 + s2.flash);
      S.ring.material.color.set(s2.col ? COLS[s2.col].glow : '#5cd0ff');
      S.barrelPivot.rotation.y = -S.dir * (0.55 + Math.sin(t * 1.3 + (side === 'L' ? 0 : 2)) * 0.12);
    }
    // guard shields
    if (!this.guards) {
      this.guards = [-1, 1].map((sx) => { const g = new THREE.Mesh(new THREE.BoxGeometry(GUT, 1.6, 0.15), new THREE.MeshBasicMaterial({ color: 0x2fb4ff, transparent: true, opacity: 0.4 })); g.position.set(sx * (W / 2 - GUT / 2), 0.8, EDGE + 0.1); this.scene.add(g); return g; });
    }
    for (const g of this.guards) { g.visible = game.guardT > 0; g.material.opacity = 0.3 + 0.15 * Math.sin(t * 8); }
    const lifting = M.towers.some((T) => T.state === 'wait' || T.state === 'build');
    this.lift.material.opacity = lifting ? 0.55 + 0.45 * Math.sin(t * 12) : 0.25;
    this.drawRing(game, t);
    this.renderer.render(this.scene, this.camera);
  }
}
