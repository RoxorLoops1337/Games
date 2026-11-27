// Galaxy Pusher: the machine in real 3D (three.js, vendored). Coins are instanced metal discs lit by a room
// environment, so they shine, tilt and catch the light like real tokens; towers are drawn coin by coin from the
// tower body's transform. The 2D overlay (battle, HUD, wheel) is drawn on a separate canvas above this one.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/RoomEnvironment.js';
import { W, EDGE, GUT, PH, PUSH_HALF, BACK_WALL, KINDS, SHOOTER, RING_N, RING_R, LAYER_H, TWIST, COIN_HH, NOTCH_R, FACE_RET, TOWER_R, GLASS_Z, PORT, Machine } from './machine.js';
import { sprite, COLS } from './render.js';
import { JP_FULL } from './core.js';

const MAX = { c: 2600, g: 1300, B: 60, P: 60, Y: 60 };
const WHITE = new THREE.Color(1, 1, 1);
const EASE_P = 0.02, EASE_Q = 0.035;   // deadband of the drawn coin pose: 0.2 mm and 2 degrees
// debug switches (?gp=noshadow,nobump,noease,nointerp) to find what a phone's flicker comes from
const DBG = Object.fromEntries((typeof location !== 'undefined' ? new URLSearchParams(location.search).get('gp') || '' : '').split(',').filter(Boolean).map((k) => [k, true]));

function canvasTex(c, srgb = true) { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// the reeded edge of a coin: fine vertical grooves (used as colour and bump)
function reedTex(base, dark, n = 48) {
  const c = mk(512, 16), g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 512, 16);
  for (let i = 0; i < n; i++) { const x = (i / n) * 512, gw = 512 / n, gr = g.createLinearGradient(x, 0, x + gw, 0); gr.addColorStop(0, base); gr.addColorStop(0.5, dark); gr.addColorStop(1, base); g.fillStyle = gr; g.fillRect(x, 0, gw, 16); }
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
// a normal map from a picture's brightness, blurred first: the relief of a struck coin without the per-pixel
// sparkle a bump map gives on a mirror finish (bump derivatives alias as the coin moves; a mipmapped normal map does not)
function normalTex(src, blur = 2.5, strength = 2.2) {
  const w = src.width, h = src.height, c = mk(w, h), g = c.getContext('2d');
  g.filter = `blur(${blur}px)`; g.drawImage(src, 0, 0); g.filter = 'none';
  const d = g.getImageData(0, 0, w, h).data, o = g.createImageData(w, h), L = (x, y) => { x = Math.max(0, Math.min(w - 1, x)); y = Math.max(0, Math.min(h - 1, y)); const i = (y * w + x) * 4; return (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = (L(x - 1, y) - L(x + 1, y)) * strength, ny = (L(x, y + 1) - L(x, y - 1)) * strength, inv = 1 / Math.hypot(nx, ny, 1), i = (y * w + x) * 4;
    o.data[i] = (nx * inv * 0.5 + 0.5) * 255; o.data[i + 1] = (ny * inv * 0.5 + 0.5) * 255; o.data[i + 2] = (inv * 0.5 + 0.5) * 255; o.data[i + 3] = 255;
  }
  g.putImageData(o, 0, 0);
  return canvasTex(c, false);
}
function grime(c, g, n, a) { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * a})`; g.fillRect(Math.random() * c.width, Math.random() * c.height, 2, 2); } }

export class View3D {
  constructor(canvas) {
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.9;
    this.dbg = DBG;
    r.shadowMap.enabled = !DBG.noshadow; r.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = (this.scene = new THREE.Scene());
    const pm = new THREE.PMREMGenerator(r);
    // reflections: the room plus a few neon strips, so polished coins catch cyan, pink and gold highlights
    const env = new RoomEnvironment();
    // A flat coin mirrors the room up and behind it at the camera's own angle (the view looks down 35 to 75 degrees
    // depending on the phone): one big soft panel covers that whole band, so no coin turns black at some angle.
    const soft = new THREE.Mesh(new THREE.PlaneGeometry(22, 11), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    soft.material.color.setRGB(1.3, 1.25, 1.4); soft.position.set(0, 6, -7); soft.lookAt(0, 0, 0); env.add(soft);
    for (const [col, x, y, z, w, h] of [[0x3fd0ff, -7, 6, -4, 6, 0.6], [0xff4fb0, 7, 6, -4, 6, 0.6], [0xffd75c, 0, 8, 3, 9, 0.5], [0xffffff, 0, 9, -6, 10, 1.2]]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), new THREE.MeshBasicMaterial({ color: col }));
      strip.material.color.multiplyScalar(3); strip.position.set(x, y, z); strip.lookAt(0, 0, 0); env.add(strip);
    }
    scene.environment = pm.fromScene(env, 0.02).texture;
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
    this.buildPort();
    this.edgeGlow = 0;
  }

  // ------------------------------------------------------------------ cabinet
  buildCabinet() {
    const S = this.scene;
    this.chrome = new THREE.MeshStandardMaterial({ color: 0xe8ecf4, metalness: 1, roughness: 0.14, envMapIntensity: 1.6 });
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
    const lip = new THREE.Mesh(new THREE.BoxGeometry(W + 2, 3, 1.4), new THREE.MeshPhysicalMaterial({ color: 0x140c2c, metalness: 0.3, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 }));
    lip.position.set(0, -1.7, EDGE + 0.7); S.add(lip);
    // marquee: a row of bulbs along the front of the cabinet that chase while coins pay
    const NB = 31, bulbs = (this.bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), NB));
    const bm = new THREE.Matrix4();
    for (let i = 0; i < NB; i++) { bm.makeTranslation(-W / 2 + 0.2 + (i * (W - 0.4)) / (NB - 1), -1.75, EDGE + 1.42); bulbs.setMatrixAt(i, bm); bulbs.setColorAt(i, new THREE.Color(0xffd75c)); }
    S.add(bulbs);
    this.strip = new THREE.Mesh(new THREE.BoxGeometry(W - 2 * GUT, 0.25, 0.25), new THREE.MeshBasicMaterial({ color: 0xffd75c }));
    this.strip.position.set(0, -0.25, EDGE + 0.15); S.add(this.strip);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(W + 2, 0.3, 0.3), this.chrome); fr.position.set(0, -0.45, EDGE + 1.3); S.add(fr);
    // side walls: smoked glass with neon top edges
    const glass = new THREE.MeshStandardMaterial({ color: 0x8fb8ff, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.12, depthWrite: false });
    for (const sx of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 7, EDGE - BACK_WALL + 2), glass);
      wall.position.set(sx * (W / 2 + 0.15), 3.5, (EDGE + BACK_WALL) / 2 - 1); S.add(wall);
      const neon = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, EDGE - BACK_WALL + 2), new THREE.MeshBasicMaterial({ color: sx < 0 ? 0x3fd0ff : 0xff4fb0 }));
      neon.position.set(sx * (W / 2 + 0.15), 7, (EDGE + BACK_WALL) / 2 - 1); S.add(neon);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, EDGE - BACK_WALL + 2), this.chrome); rail.position.set(sx * (W / 2 + 0.15), 6.72, (EDGE + BACK_WALL) / 2 - 1); S.add(rail);
    }
    // back wall with the cabinet art, and the combo ring panel
    const bc = mk(1024, 512), bg = bc.getContext('2d');
    const gr = bg.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#120a3a'); gr.addColorStop(1, '#2d1d6e'); bg.fillStyle = gr; bg.fillRect(0, 0, 1024, 512);
    bg.strokeStyle = 'rgba(120,200,255,0.25)'; bg.lineWidth = 3;
    for (let i = 0; i < 26; i++) { const x = 20 + i * 40, y = 140 + ((i * 97) % 300); bg.beginPath(); bg.moveTo(x, 512); bg.lineTo(x, y); bg.lineTo(x + 30, y - 30); bg.stroke(); bg.fillStyle = 'rgba(120,200,255,0.5)'; bg.beginPath(); bg.arc(x + 30, y - 30, 5, 0, Math.PI * 2); bg.fill(); }
    const backMat = new THREE.MeshStandardMaterial({ map: canvasTex(bc), metalness: 0.3, roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.18, emissiveMap: canvasTex(bc) });
    // the back wall: one complete panel across the whole cabinet, tall enough to fill the view
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W + 2.4, 30), backMat);
    back.position.set(0, PH + 15, BACK_WALL - 0.02); S.add(back);
    for (const sx of [-1, 1]) { const n = new THREE.Mesh(new THREE.BoxGeometry(0.18, 30, 0.18), new THREE.MeshBasicMaterial({ color: sx < 0 ? 0x3fd0ff : 0xff4fb0 })); n.position.set(sx * (W / 2 + 1.1), PH + 15, BACK_WALL); S.add(n); }
    // the lift: a glowing ring on the floor where a tower comes up (hidden under the pusher until it pulls back)
    this.lift = new THREE.Mesh(new THREE.RingGeometry(TOWER_R - 0.2, TOWER_R + 0.15, 48), new THREE.MeshBasicMaterial({ color: 0xffd75c, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    this.lift.rotation.x = -Math.PI / 2; this.lift.position.set(0, 0.012, FACE_RET); S.add(this.lift);
    this.ringC = mk(256, 256);
    this.ringT = canvasTex(this.ringC);
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 6.4), new THREE.MeshBasicMaterial({ map: this.ringT, transparent: true }));
    ring.position.set(0, PH + 12.6, BACK_WALL + 0.05); S.add(ring);
    this.ringKey = '';
    // the front window the player looks through: faint diagonal reflections, and impact flashes when a tower smacks it
    const gc = mk(256, 256), gg = gc.getContext('2d');
    for (let i = 0; i < 5; i++) { const x = 30 + i * 52 + (i % 2) * 20; const gr2 = gg.createLinearGradient(x, 0, x + 40, 256); gr2.addColorStop(0, 'rgba(255,255,255,0)'); gr2.addColorStop(0.5, `rgba(255,255,255,${0.10 + (i % 2) * 0.06})`); gr2.addColorStop(1, 'rgba(255,255,255,0)'); gg.fillStyle = gr2; gg.beginPath(); gg.moveTo(x, 0); gg.lineTo(x + 18 + i * 3, 0); gg.lineTo(x - 50 + i * 3, 256); gg.lineTo(x - 68, 256); gg.fill(); }
    this.glass = new THREE.Mesh(new THREE.PlaneGeometry(W + 2, 34), new THREE.MeshBasicMaterial({ map: canvasTex(gc), transparent: true, opacity: 0.55, depthWrite: false }));
    this.glass.position.set(0, 13, GLASS_Z); S.add(this.glass);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 2.4, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x1b1438, metalness: 0.7, roughness: 0.3 }));
    frame.position.set(0, -2.6, GLASS_Z); S.add(frame);
    this.hits = [];
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
    const silverN = normalTex(sprite('c')), goldN = normalTex(sprite('g'));
    const mat = (o) => new THREE.MeshStandardMaterial(o);
    const reedS = canvasTex(reedTex('#d9dee8', '#8a93a6')), reedG = canvasTex(reedTex('#ffd970', '#a8700d'));
    for (const k of ['c', 'g', 'B', 'P', 'Y']) {
      const K = KINDS[k];
      const geo = new THREE.CylinderGeometry(K.r, K.r, K.hh * 2, 40, 1);
      let side, face;
      if (k === 'c' || k === 'g') {
        const f = k === 'c' ? silverFace : goldFace, e = k === 'c' ? reedS : reedG;
        // polished metal: low roughness and strong reflections (the room and the cabinet neon show in every coin)
        side = mat({ map: e, color: k === 'c' ? 0xd0d5de : 0xf0c868, metalness: 1, roughness: 0.26, envMapIntensity: 2.0 });
        face = mat({ map: f, normalMap: DBG.nobump ? null : (k === 'c' ? silverN : goldN), normalScale: new THREE.Vector2(0.9, 0.9), color: k === 'c' ? 0xd8dde6 : 0xf5cd6a, metalness: 0.85, roughness: 0.24, envMapIntensity: 2.0 });
      } else {
        const C = COLS[k];
        side = mat({ map: canvasTex(chipEdgeTex(C.main, C.dark)), metalness: 0, roughness: 0.6, envMapIntensity: 0.3 });
        face = mat({ map: canvasTex(sprite(k)), metalness: 0, roughness: 0.55, envMapIntensity: 0.35 });
      }
      const m = new THREE.InstancedMesh(geo, [side, face, face], MAX[k]);
      m.castShadow = true; m.receiveShadow = true; m.count = 0; m.frustumCulled = false;
      m.setColorAt(0, WHITE);   // per-coin tint (teetering coins glow)
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(m); this.inst[k] = m;
    }
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
    this._tq = new THREE.Quaternion(); this._tp = new THREE.Vector3(); this._lq = new THREE.Quaternion(); this._lp = new THREE.Vector3(); this._ax = new THREE.Vector3(0, 1, 0);
  }

  // ------------------------------------------------------------------ token port: the slot under the energy-ring badge
  buildPort() {
    // the badge: a holographic silver plate with the three heroes above the slot and an arc meter round the middle one
    const BW = 8.6, BH = 6.4, top = PORT.y + PORT.h / 2 + 4.3, px = 80;   // world size, pixels per cm
    const c = mk(Math.round(BW * px), Math.round(BH * px)), g = c.getContext('2d'), cx = c.width / 2;
    const sy = (y) => (top - y) * px;                     // world y -> canvas y
    const mT = sy(PORT.y + PORT.h / 2), mB = sy(PORT.y - PORT.h / 2), mL = cx - (PORT.w / 2) * px, mR = cx + (PORT.w / 2) * px;
    const plate = (inset) => { const r = 46 - inset; g.beginPath(); g.moveTo(cx - 175 + inset, sy(PORT.y - PORT.h / 2 - 0.55) - inset); g.lineTo(cx - 300 + inset, sy(PORT.y - PORT.h / 2 - 0.55) - inset); g.lineTo(cx - 300 + inset, mT - 70 + inset); g.lineTo(cx - 230 + inset, mT - 120 + inset); g.arc(cx, 205, 190 - inset, Math.PI * 1.08, Math.PI * 1.92); g.lineTo(cx + 300 - inset, mT - 70 + inset); g.lineTo(cx + 300 - inset, sy(PORT.y - PORT.h / 2 - 0.55) - inset); g.lineTo(cx - 175 + inset, sy(PORT.y - PORT.h / 2 - 0.55) - inset); g.closePath(); return r; };
    const draw = (frac, flare) => {
      g.clearRect(0, 0, c.width, c.height);
      // holographic foil: a rainbow sheen over brushed silver
      plate(0); const holo = g.createLinearGradient(0, 0, c.width, c.height);
      ['#dfe6f0', '#b8f0ff', '#f4c8ff', '#fff4c0', '#c8ffe8', '#e0e4ee', '#ffd0e8', '#cfe0ff'].forEach((col, i, A) => holo.addColorStop(i / (A.length - 1), col));
      g.fillStyle = holo; g.fill();
      g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.stroke();
      plate(16); g.fillStyle = '#0c0a1c'; g.fill(); g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 3; g.stroke();
      // orange accents beside the slot
      g.fillStyle = '#ff9a1f'; for (const sx of [-1, 1]) g.fillRect(cx + sx * (PORT.w / 2 * px + 40) - 8, mT + 10, 16, mB - mT - 20);
      // arc meter: pink, blue, yellow segments round the centre portrait
      // the jackpot meter: pink, blue, yellow segments light up as lost coins charge it (all flash gold on a jackpot)
      const segs = [['#ff4fb0', 1.12, 1.38], ['#2fb4ff', 1.4, 1.6], ['#ffc21f', 1.62, 1.88]], span = segs.reduce((t, q) => t + q[2] - q[1], 0);
      let left = frac * span;
      for (const [col, a0, a1] of segs) {
        g.shadowBlur = 0; g.lineWidth = 10; g.strokeStyle = 'rgba(255,255,255,0.13)'; g.beginPath(); g.arc(cx, 205, 150, Math.PI * a0, Math.PI * a1); g.stroke();
        const lit = flare ? a1 - a0 : Math.max(0, Math.min(a1 - a0, left)); left -= a1 - a0;
        if (lit > 0) { const cc = flare ? (flare > 0.5 ? '#fff6c0' : '#ffd75c') : col; g.strokeStyle = cc; g.lineWidth = flare ? 14 : 10; g.shadowColor = cc; g.shadowBlur = flare ? 26 : 14; g.beginPath(); g.arc(cx, 205, 150, Math.PI * a0, Math.PI * (a0 + lit)); g.stroke(); }
      }
      g.shadowBlur = 0; g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 4; g.beginPath(); g.arc(cx, 205, 170, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      // three portraits: Jas (pink) left, Rox (blue) big in the middle, Mew (yellow) right
      const face = (k, x, y, r) => { const sp = sprite(k), R = sp.width / 2; g.save(); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.clip(); g.drawImage(sp, R - R * 0.66, R - R * 0.66, R * 1.32, R * 1.32, x - r, y - r, r * 2, r * 2); g.restore(); g.lineWidth = 7; g.strokeStyle = COLS[k].main; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke(); };
      face('P', cx - 128, 228, 50); face('Y', cx + 128, 228, 50); face('B', cx, 200, 72);
      g.fillStyle = '#ffffff'; g.font = 'bold 30px "Russo One", sans-serif'; g.textAlign = 'center'; g.fillText(flare ? 'JACKPOT!' : 'JACKPOT ' + Math.floor(frac * 100) + '%', cx, 312);
      // the slot: chrome frame, black mouth with depth shading
      g.fillStyle = '#e6ebf3'; g.fillRect(mL - 16, mT - 16, mR - mL + 32, mB - mT + 32);
      g.fillStyle = '#7f8798'; g.fillRect(mL - 6, mT - 6, mR - mL + 12, mB - mT + 12);
      const mouth = g.createLinearGradient(0, mT, 0, mB); mouth.addColorStop(0, '#000'); mouth.addColorStop(0.75, '#07050f'); mouth.addColorStop(1, '#2a2440');
      g.fillStyle = mouth; g.fillRect(mL, mT, mR - mL, mB - mT);
      g.fillStyle = 'rgba(255,255,255,0.12)'; for (let i = 0; i < 5; i++) g.fillRect(mL + 30 + i * ((mR - mL - 60) / 4) - 3, mB - 10, 6, 6);
    };
    draw(0, 0);
    const tex = canvasTex(c);
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.55, metalness: 0.35, roughness: 0.3, transparent: true, alphaTest: 0.5 }));
    badge.position.set(PORT.x, top - BH / 2, PORT.z + 0.03); this.scene.add(badge);
    this.badge = { draw, tex, key: '' };
    // a light bar under the slot (the cabinet's upper tier glows white) and the glow inside the mouth
    const bar = new THREE.Mesh(new THREE.BoxGeometry(PORT.w + 1.2, 0.14, 0.14), new THREE.MeshBasicMaterial({ color: 0xffffff })); bar.position.set(PORT.x, PORT.y - PORT.h / 2 - 0.28, PORT.z + 0.12); this.scene.add(bar);
    this.portGlow = new THREE.Mesh(new THREE.PlaneGeometry(PORT.w - 0.2, PORT.h - 0.2), new THREE.MeshBasicMaterial({ color: 0x5cd0ff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.portGlow.position.set(PORT.x, PORT.y, PORT.z + 0.06); this.scene.add(this.portGlow);
    this.portT = 0; this.portCol = new THREE.Color(0x5cd0ff);
  }
  badgeFlare() { this.flareT = 1.6; }
  // redraw the badge only when the meter moves a step (or while it flares after a jackpot)
  drawBadge(frac, dt) {
    this.flareT = Math.max(0, (this.flareT || 0) - dt);
    const fl = this.flareT > 0 ? (Math.floor(this.flareT * 8) % 2 ? 1 : 0.4) : 0, key = fl ? 'f' + fl : 'm' + Math.floor(frac * 50);
    if (key === this.badge.key) return;
    this.badge.key = key; this.badge.draw(fl ? 1 : frac, fl); this.badge.tex.needsUpdate = true;
  }
  portFlash(k) { this.portT = 1; this.portCol.set(COLS[k] ? COLS[k].main : '#5cd0ff'); }

  // ------------------------------------------------------------------ shooters
  buildShooters() {
    this.shooters = {};
    for (const side of ['L', 'R']) {
      const S = SHOOTER[side], dir = side === 'L' ? 1 : -1, neon = side === 'L' ? 0x3fd0ff : 0xff4fb0;
      // the shooter sits in the side wall: a chrome housing with a light ring, and a short nozzle that turns
      const pivot = new THREE.Group(); pivot.position.set(dir * -(W / 2), S.y, S.z); this.scene.add(pivot);
      const housing = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.6, 32, 1, false, 0, Math.PI), this.chrome);
      housing.rotation.set(0, dir > 0 ? 0 : Math.PI, Math.PI / 2); housing.rotation.order = 'YZX'; housing.position.y = 0.2; pivot.add(housing);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.08, 8, 32, Math.PI), new THREE.MeshBasicMaterial({ color: neon }));
      ring.rotation.y = dir * Math.PI / 2; ring.position.set(dir * 0.32, 0.2, 0); pivot.add(ring);
      const arm = new THREE.Group(); pivot.add(arm);
      const nozzle = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 1.5), this.chrome); nozzle.position.set(dir * 1.0, 0.05, 0); arm.add(nozzle);
      const mouth = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.34), new THREE.MeshBasicMaterial({ color: 0x050210 })); mouth.rotation.y = dir * Math.PI / 2; mouth.position.set(dir * 1.96, 0.05, 0); arm.add(mouth);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 1.56), new THREE.MeshBasicMaterial({ color: 0xffd75c })); tip.position.set(dir * 1.96, 0.05, 0); arm.add(tip);
      const flash = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), new THREE.MeshBasicMaterial({ color: 0xfff6c0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      flash.position.set(dir * 2.3, 0.05, 0); arm.add(flash);
      this.shooters[side] = { arm, ring, flash, tip, dir, neon };
    }
  }

  // ------------------------------------------------------------------ camera fit: the field fills the rect, the back wall shows
  // The canvas fills the whole screen. The field always spans the full width of the game column (`fit.left`..`fit.right`),
  // its front lip sits just above the button bar (`fit.bottom`) and the ENERGY badge stays below the battle panel
  // (`fit.top`). When the screen is short, the camera looks more from the front (less depth to show) instead of
  // shrinking the machine; spare height shows more of the back wall behind the battle panel.
  resize(w, h, fit) {
    this.renderer.setSize(w, h, false);
    fit = fit || { left: 0, right: w, top: 0, bottom: h };
    const cam = this.camera; cam.aspect = w / h; cam.clearViewOffset();
    cam.fov = w / h < 0.75 ? 36 : 42;
    const target = new THREE.Vector3(0, 0, 2.5), v = new THREE.Vector3();
    const wantW = ((fit.right - fit.left) / w) * 2, cx = ((fit.left + fit.right) / w - 1);
    const row = (x, y, z) => { v.set(x, y, z).project(cam); return (1 - v.y) / 2 * h; };
    const place = (pitch, d) => { cam.position.copy(target).addScaledVector(v.set(0, Math.sin(pitch), Math.cos(pitch)), d); cam.lookAt(target); cam.updateProjectionMatrix(); cam.updateMatrixWorld(); };
    const spanAt = (pitch, d) => { place(pitch, d); const a = new THREE.Vector3(-W / 2, 0, EDGE).project(cam).x, b = new THREE.Vector3(W / 2, 0, EDGE).project(cam).x; return b - a; };
    const badgeTop = PORT.y + PORT.h / 2 + 4.3, room = fit.bottom - fit.top - 10;
    // the lowest thing that must show: the drop zone in front of the edge up to the glass, where towers smack
    const bottomRow = () => Math.max(row(0, -0.4, EDGE + 0.4), row(0, -1.75, EDGE + 1.42));   // (a tower smacks the glass high up, so that stays in view above this)
    let pick = null;
    for (let pitch = 1.3; pitch >= 0.62; pitch -= 0.02) {   // the most top-down view that fits: tall screens fill with field
      // the camera distance where the front edge spans exactly the column width
      let lo = 8, hi = 400;
      for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (spanAt(pitch, mid) > wantW) lo = mid; else hi = mid; }
      place(pitch, hi);
      const need = bottomRow() - row(0, badgeTop, BACK_WALL);
      pick = { pitch, d: hi };
      if (need <= room) break;
    }
    this._last = { place, row, badgeTop, bottomRow };
    place(pick.pitch, pick.d);
    // slide the picture: the lip just above the bar, and centred on the game column
    const dy = bottomRow() - (fit.bottom - 4);
    cam.setViewOffset(w, h, -cx * w / 2, dy, w, h);
    cam.updateProjectionMatrix();
    this.w = w; this.h = h; this.pitch = pick.pitch;
  }
  // how many pixels of height the machine needs (lip to badge top) at its most top-down view, for a game column
  // `colW` wide on a w x h screen: the layout gives any height beyond that to the battle panel
  needHeight(w, h, colW) {
    this.resize(w, h, { left: (w - colW) / 2, right: (w + colW) / 2, top: -1e5, bottom: h });
    const { row, badgeTop, bottomRow } = this._last;
    return bottomRow() - row(0, badgeTop, BACK_WALL);
  }
  smack(x, y) {
    const flash = new THREE.Mesh(new THREE.CircleGeometry(3.2, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.2, 40), new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
    for (const o of [flash, ring]) { o.position.set(x, Math.max(1, y), GLASS_Z - 0.05); this.scene.add(o); }
    this.hits.push({ flash, ring, t: 0 });
  }
  project(x, y, z, rect) {
    const v = this._pv || (this._pv = new THREE.Vector3());
    v.set(x, y, z).project(this.camera);
    return { x: rect.x + (v.x * 0.5 + 0.5) * rect.w, y: rect.y + (-v.y * 0.5 + 0.5) * rect.h };
  }

  // ------------------------------------------------------------------ per frame
  // where to draw a body this frame: between its pose at the previous physics step and the latest one
  pose(o, body, M, al, p, q) {
    const tr = body.translation(), ro = body.rotation();
    if (!o._cp || o._st !== M.steps) {
      if (!o._cp || o._st !== M.steps - 1) { o._pp = new THREE.Vector3(tr.x, tr.y, tr.z); o._pq = new THREE.Quaternion(ro.x, ro.y, ro.z, ro.w); o._cp = o._pp.clone(); o._cq = o._pq.clone(); }
      else { o._pp.copy(o._cp); o._pq.copy(o._cq); o._cp.set(tr.x, tr.y, tr.z); o._cq.set(ro.x, ro.y, ro.z, ro.w); }
      o._st = M.steps;
    }
    if (this.dbg.nointerp) al = 1;
    p.copy(o._pp).lerp(o._cp, al); q.copy(o._pq).slerp(o._cq, al);
  }

  render(game, t, st) {
    const M = game.f, m = this._m, q = this._q, p = this._p, s = this._s;
    const counts = { c: 0, g: 0, B: 0, P: 0, Y: 0 };
    // physics runs at 40 Hz and the screen at 60: draw every body between its last two steps so nothing judders
    const al = Math.max(0, Math.min(1, (M.acc || 0) * (M.hz || 40)));
    const tc = this._tc || (this._tc = new THREE.Color()), isTok = (k) => k === 'B' || k === 'P' || k === 'Y';
    for (const c of M.coins) {
      if (!c.body) continue;
      const I = this.inst[c.k]; if (counts[c.k] >= MAX[c.k]) continue;
      this.pose(c, c.body, M, al, p, q);
      // a coin leaning on others shivers a degree or two every physics step; on a mirror finish that reads as a blink.
      // Small shivers are eased out on screen (real motion snaps straight through).
      // A deadband, not a low-pass: the drawn pose holds still until the true one is more than a hair away, then
      // follows at exactly that distance, so steady motion stays perfectly even and only the shiver disappears.
      if (!this.dbg.noease) {
        const sp = c._sp || (c._sp = p.clone()), sq = c._sq || (c._sq = q.clone());
        const dp = sp.distanceTo(p), dq = 2 * Math.acos(Math.min(1, Math.abs(sq.dot(q))));
        if (dp > 3) sp.copy(p); else if (dp > EASE_P) sp.lerp(p, 1 - EASE_P / dp);
        if (dq > 0.6) sq.copy(q); else if (dq > EASE_Q) sq.slerp(q, 1 - EASE_Q / dq);
        p.copy(sp); q.copy(sq);
      }
      m.compose(p, q, s);
      // a coin teetering on the edge glows and pulses gold (with hysteresis, so it never blinks on and off)
      c._tt = c._tt ? p.z > EDGE - 1.0 && p.y > -1 : p.z > EDGE - 0.55 && p.y > -0.3;
      if (c._tt) { const pu = 0.5 + 0.5 * Math.sin(t * 9 + c.id); tc.setRGB(1 + 0.9 * pu, 1 + 0.72 * pu, 1 + 0.3 * pu); } else tc.setRGB(1, 1, 1);
      I.setColorAt(counts[c.k], tc); I.setMatrixAt(counts[c.k]++, m);
    }
    // towers: every coin of the ring, placed by the tower body
    for (const T of M.towers) {
      if (!T.body) continue;
      this.pose(T, T.body, M, al, this._tp, this._tq);
      const k = T.gold ? 'g' : 'c', I = this.inst[k];
      // a rising tower is whole (coming up through the floor); a crumbling one only has the layers not yet peeled off
      const nDraw = T.state === 'crumble' ? Math.min(T.want, T.peel * RING_N) : T.rise && T.state === 'build' ? T.want : T.n;
      for (let i = 0; i < nDraw && counts[k] < MAX[k]; i++) {
        const [lx, ly, lz] = Machine.ringLocal(T, i);
        // hand-stacked, not machined: each coin sits a hair further out and a hair tilted (outward only, so neighbours never touch)
        const h1 = Math.sin(i * 12.9898) * 43758.5453, h2 = Math.sin(i * 78.233) * 12543.123, j1 = h1 - Math.floor(h1), j2 = h2 - Math.floor(h2);
        const out = 1 + (j1 * 0.07) / RING_R;
        this._lp.set(lx * out, ly, lz * out).applyQuaternion(this._tq).add(this._tp);
        this._lq.setFromAxisAngle(this._ax, i * 1.7);
        this._jq = this._jq || new THREE.Quaternion(); this._jv = this._jv || new THREE.Vector3();
        this._jq.setFromAxisAngle(this._jv.set(Math.cos(j2 * 6.28), 0, Math.sin(j2 * 6.28)), (j1 - 0.5) * 0.03);
        this._lq.premultiply(this._jq).premultiply(this._tq);
        m.compose(this._lp, this._lq, s); I.setColorAt(counts[k], WHITE); I.setMatrixAt(counts[k]++, m);
      }
      if (T.state !== 'crumble') T.crown.forEach((ck, i) => {
        const [cx, cy, cz] = Machine.crownLocal(T, i);
        this._lp.set(cx, cy, cz).applyQuaternion(this._tq).add(this._tp);
        m.compose(this._lp, this._tq, s); if (counts[ck] < MAX[ck]) { this.inst[ck].setColorAt(counts[ck], WHITE); this.inst[ck].setMatrixAt(counts[ck]++, m); }
      });
    }
    for (const k in this.inst) { const I = this.inst[k]; I.count = counts[k]; I.instanceMatrix.needsUpdate = true; if (I.instanceColor) I.instanceColor.needsUpdate = true; }
    // pusher, lights, neon
    this.pusher.position.set(0, PH / 2, (M.pfPrev ?? M.pf) + (M.pf - (M.pfPrev ?? M.pf)) * al - PUSH_HALF);
    const fev = game.fever > 0;
    const hue = (t * 0.5) % 1;
    this.pusherNeon.material.color.setHSL(fev ? hue : 0.55, 1, game.turboT > 0 ? 0.5 + 0.3 * Math.sin(t * 20) : 0.62);
    this.strip.material.color.setHSL(fev ? (hue + 0.3) % 1 : 0.12, 1, 0.55 + 0.35 * Math.min(1, st.edgeGlow || 0));
    this.rimL.intensity = 55 + 20 * Math.sin(t * 2); this.rimR.intensity = 55 + 20 * Math.sin(t * 2 + 2);
    if (fev) { this.rimL.color.setHSL(hue, 1, 0.6); this.rimR.color.setHSL((hue + 0.5) % 1, 1, 0.6); } else { this.rimL.color.set(0x3fd0ff); this.rimR.color.set(0xff4fb0); }
    // the flippers sweep with the machine's clock; each coin leaves along the channel (the same angle machine.js uses)
    for (const side of ['L', 'R']) {
      const S = this.shooters[side], s2 = st.shooter[side];
      S.arm.rotation.y = -M.flipper(side) * S.dir;
      S.flash.material.opacity = s2.flash; S.flash.scale.setScalar(0.6 + s2.flash);
      S.ring.material.color.set(s2.col ? COLS[s2.col].glow : S.neon);
      S.tip.material.color.set(s2.flash > 0.5 ? 0xffffff : 0xffd75c);
    }
    // guard shields
    if (!this.guards) {
      this.guards = [-1, 1].map((sx) => { const g = new THREE.Mesh(new THREE.BoxGeometry(GUT, 1.6, 0.15), new THREE.MeshBasicMaterial({ color: 0x2fb4ff, transparent: true, opacity: 0.4 })); g.position.set(sx * (W / 2 - GUT / 2), 0.8, EDGE + 0.1); this.scene.add(g); return g; });
    }
    for (const g of this.guards) { g.visible = game.guardT > 0; g.material.opacity = 0.3 + 0.15 * Math.sin(t * 8); }
    const lifting = M.towers.some((T) => T.state === 'wait' || T.state === 'build');
    this.lift.material.opacity = lifting ? 0.55 + 0.45 * Math.sin(t * 12) : 0.25;
    // glass impacts: a bright splash that spreads as a ring and fades
    for (const h of this.hits) { h.t += 1 / 60; const k = h.t / 0.9; h.flash.material.opacity = Math.max(0, 0.9 * (1 - k * 2)); h.ring.scale.setScalar(1 + k * 9); h.ring.material.opacity = Math.max(0, 0.7 * (1 - k)); }
    this.hits = this.hits.filter((h) => { if (h.t < 0.9) return true; this.scene.remove(h.flash, h.ring); return false; });
    this.glass.material.opacity = 0.55 + (this.hits.length ? 0.3 * Math.max(0, 1 - this.hits[0].t * 3) : 0);
    // the port glows in the colour of the token it just fired, then settles back to a calm blue
    this.portT = Math.max(0, this.portT - 1 / 25);
    this.portGlow.material.color.set(0x5cd0ff).lerp(this.portCol, this.portT); this.portGlow.material.opacity = 0.08 + 0.8 * this.portT;
    // marquee bulbs chase (faster while coins pour over the edge, rainbow in DOUBLE TIME)
    const NB = this.bulbs.count, ph = t * (6 + 10 * Math.min(1, st.edgeGlow || 0)), bc = this._bc || (this._bc = new THREE.Color());
    for (let i = 0; i < NB; i++) {
      const on = (Math.floor(ph) + i) % 3 === 0;
      if (fev) bc.setHSL(((t * 0.6 + i / NB) % 1), 1, on ? 0.65 : 0.25); else bc.set(on ? 0xfff0b0 : 0x5a3a10);
      this.bulbs.setColorAt(i, bc);
    }
    this.bulbs.instanceColor.needsUpdate = true;
    this.drawRing(game, t);
    this.drawBadge((game.jp || 0) / JP_FULL, 1 / 60);
    this.renderer.render(this.scene, this.camera);
  }
}
